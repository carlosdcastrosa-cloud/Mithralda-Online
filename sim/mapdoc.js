// ===========================================================================
// sim/mapdoc.js — CAS-1702 Visual Map Editor: MapDoc v1 round-trip loader.
// ---------------------------------------------------------------------------
// MapDoc v1 is BOTH the editor's export format AND the game's live-load format
// (a REAL round-trip — the editor exports the exact JSON the game consumes, no
// mock). `buildWorldFromMapDoc(doc, rng)` returns the SAME world shape that
// buildWorld()/buildTiledWorld() return (terr, zone rects, solids, deco,
// chests, fragments, fountains, npcs, spawners, portals, templeF, tcx/tcy,
// wallSet, buildings, blockSet), so the renderer / collision / gameplay are
// reused unchanged.
//
// KEY DESIGN — $0 reuse via `slot`: every zone declares a `slot` from the 8
// slots the game ALREADY has (town|forest|caves|arena|ruins|abyss|frost|trial|
// swamp). zoneOf() keys off world[slot], and ZONE_TIER / HUNTS / loot tables /
// spawn pools / art are all keyed by that same slot string — so an edited zone
// inherits real tiers, bosses, and drops with zero new content.
//
// HARD-GATED & RNG-NEUTRAL: the game only ever touches a MapDoc when the URL
// carries `?map=` (see readMapDoc). Without `?map` readMapDoc returns null,
// buildWorldFromMapDoc is never called, and buildWorld/buildTiledWorld run
// exactly as before → byte-identical sim, additive to the live game. The
// loader itself draws ZERO from the shared srand stream (it consumes only the
// editor's authored data), so even WITH a map the balance RNG is untouched.
// ===========================================================================
import { STR } from "../strings.js";
import { TS, T_GRASS, T_DIRT, T_STONE, T_COBBLE, T_SAND, T_WATER, T_ICE, T_SWAMP, setMapDims } from "./config.js";

export const MAPDOC_KEY = "mithralda.mapdoc.v1";   // localStorage bridge editor ⇄ game (?map=local)
export const MAPDOC_VERSION = 1;

// ---- shared vocab (also consumed by the editor UI) --------------------------
// The 8 real zone slots. `tier` mirrors ZONE_TIER for the editor's difficulty
// hint; `safe` marks the hub (no spawner, respawn anchor). Order = editor list.
export const SLOTS = [
  { id:"town",   label:"Ciudad / Hub",     tier:0, safe:true  },
  { id:"forest", label:"Bosque",           tier:1 },
  { id:"ruins",  label:"Ruinas",           tier:2 },
  { id:"caves",  label:"Cavernas",         tier:3 },
  { id:"arena",  label:"Arena",            tier:4 },
  { id:"swamp",  label:"Ciénaga",          tier:4 },
  { id:"abyss",  label:"Abismo",           tier:5 },
  { id:"frost",  label:"Cripta Helada",    tier:6 },
  { id:"trial",  label:"Coliseo",          tier:7 },
];

// Terrain palette — id ⇄ editor swatch colour (flat schematic colours; the game
// itself renders real sprites for these tiles, the editor uses solids for speed).
export const TILES = [
  { id:T_GRASS,  label:"Hierba",   color:"#3f7a3a" },
  { id:T_DIRT,   label:"Camino",   color:"#9a743f" },
  { id:T_STONE,  label:"Piedra",   color:"#565863" },
  { id:T_COBBLE, label:"Adoquín",  color:"#837a66" },
  { id:T_SAND,   label:"Arena",    color:"#cbb87e" },
  { id:T_WATER,  label:"Agua",     color:"#2f5a8a" },
  { id:T_ICE,    label:"Hielo",    color:"#a9cfe0" },
  { id:T_SWAMP,  label:"Ciénaga",  color:"#47563a" },
];

// NPC roster the editor can stamp — mirrors the roles buildWorld() wires, so a
// stamped NPC gets the exact sprite / role hook / dialogue the live town uses.
export const NPC_MAP = {
  healer:    { sprite:"healernpc", role:"fountain", name:STR.npcHealer,   lines:STR.healerLines,   neutral:true,  label:"Sanadora (respawn)" },
  merchant:  { sprite:"merchant",  role:"merchant", name:STR.npcMerchant, lines:STR.merchantLines, neutral:true,  label:"Mercader (tienda)" },
  blacksmith:{ sprite:"npcBram",   role:"shop",     name:STR.npcBram,     lines:STR.bramLines,     neutral:false, label:"Herrero" },
  bounty:    { sprite:"npcRolf",   role:"bounty",   name:STR.npcBounty,   lines:STR.bountyLines,   neutral:true,  label:"Encargos" },
  codex:     { sprite:"npcLina",   role:"codex",    name:STR.npcCodex,    lines:STR.codexLines,    neutral:true,  label:"Cronista (bestiario)" },
  quest:     { sprite:"npcRolf",   role:"quest",    name:STR.npcRolf,     lines:STR.rolfLines,     neutral:false, label:"Misiones" },
};

// Props the editor can stamp — reuse existing deco kinds (real art, $0). `solid`
// gives them a collision footprint like the world's trees/rocks.
export const PROP_KINDS = [
  { kind:"prop_tree_a",         solid:true,  r:12, label:"Árbol" },
  { kind:"prop_tree_b",         solid:true,  r:12, label:"Árbol 2" },
  { kind:"prop_f_pine_3",       solid:true,  r:9,  label:"Pino" },
  { kind:"prop_bush",           solid:false, r:0,  label:"Arbusto" },
  { kind:"prop_rock",           solid:true,  r:12, label:"Roca" },
  { kind:"prop_pillar",         solid:true,  r:9,  label:"Pilar" },
  { kind:"prop_ruin_obelisk",   solid:true,  r:12, label:"Obelisco" },
  { kind:"prop_ruin_statue",    solid:true,  r:11, label:"Estatua" },
  { kind:"prop_barrel",         solid:true,  r:9,  label:"Barril" },
  { kind:"prop_bones",          solid:false, r:0,  label:"Huesos" },
  { kind:"prop_torch",          solid:false, r:0,  label:"Antorcha" },
  { kind:"prop_sw_dead_tree_1", solid:true,  r:10, label:"Árbol muerto" },
  { kind:"prop_sw_reeds_1",     solid:false, r:0,  label:"Juncos" },
];

// Default spawn pool per slot — mirrors buildWorld()'s spawner rosters so a zone
// authored with no explicit `types` still spawns thematically-correct mobs.
export const DEFAULT_TYPES = {
  forest:["wolf","wolf","rat","bat","bat"],
  ruins: ["orc","moose","bandit","spearman","healer","moose"],
  caves: ["skeleton","mage","spearman","wraith","summoner","volatile","quillback"],
  arena: ["orc","bandit","wolf","spearman"],
  swamp: ["mudlurker","mudlurker","wisp","toadbrute"],
  abyss: ["wraith","orc","charger","revenant","demon","mage","wendigo"],
  frost: ["wraith","mage","summoner","healer","wraith","orc"],
  trial: ["charger","summoner","revenant","wraith","volatile","revenant"],
};

// ---- RLE terrain codec (shared with the editor's export) --------------------
// terrain.rle = [value,count, value,count, ...] over the row-major W*H grid.
export function rleEncode(arr){
  const out=[]; let i=0;
  while(i<arr.length){ const v=arr[i]; let c=1; while(i+c<arr.length && arr[i+c]===v) c++; out.push(v,c); i+=c; }
  return out;
}
export function rleDecodeInto(rle, out){
  let i=0; for(let k=0;k<rle.length;k+=2){ const v=rle[k]; let c=rle[k+1]; while(c-->0 && i<out.length) out[i++]=v; }
  return out;
}

// ===========================================================================
// buildWorldFromMapDoc(doc, rng) → world (same shape as buildWorld()).
// `rng` is accepted for signature-parity with buildWorld/buildTiledWorld but is
// intentionally NOT consumed (the loader is pure over authored data) — so the
// srand fingerprint is identical whether or not a map is loaded.
// ===========================================================================
export function buildWorldFromMapDoc(doc, _rng){
  const W = Math.max(8, doc.w|0), H = Math.max(8, doc.h|0);
  setMapDims(W, H);                                  // grow/shrink the world to the authored size

  // ---- terrain ----
  const terr = new Uint8Array(W*H);
  if(doc.terrain && Array.isArray(doc.terrain.rle)) rleDecodeInto(doc.terrain.rle, terr);
  else terr.fill(T_GRASS);

  // ---- zones → rects keyed by slot ----
  // zoneOf() reads world.town/caves/arena/forest UNGUARDED, so those four MUST
  // always be present. Absent slots collapse to a 0-size off-map rect (inRect
  // can never match w===0) → safe + never accidentally claims a tile.
  const OFF = { x:-9, y:-9, w:0, h:0 };
  const world = { town:OFF, forest:OFF, caves:OFF, arena:OFF };
  const spawners = [];
  let town = null;
  for(const z of (doc.zones||[])){
    if(!z || !z.slot) continue;
    const rect = { x:z.x|0, y:z.y|0, w:Math.max(1,z.w|0), h:Math.max(1,z.h|0), name:z.name||"" };
    world[z.slot] = rect;
    if(z.slot==="town"){ town = rect; continue; }
    const types = (Array.isArray(z.types) && z.types.length) ? z.types.slice() : (DEFAULT_TYPES[z.slot] || ["wolf"]);
    spawners.push({ rect, types, max: z.max|0 || 12, cool: (typeof z.cool==="number"?z.cool:3.5), t:0, zone:z.slot });
  }
  if(!town){ town = { x:2, y:2, w:16, h:16, name:"Hub" }; world.town = town; }

  const tcx = (town.x + town.w/2)*TS, tcy = (town.y + town.h/2)*TS;

  // ---- entities ----
  const npcs=[], chests=[], fragments=[], portals=[], fountains=[], solids=[], deco=[];
  // respawn anchor — a temple fountain at the hub (sim reads world.templeF).
  const templeF = { x: tcx - 2*TS, y: tcy - 3*TS, temple:true };
  fountains.push(templeF);

  const E = doc.entities || {};
  let hasHealer = false;
  for(const n of (E.npcs||[])){
    const d = NPC_MAP[n.role]; if(!d) continue;
    if(n.role==="healer") hasHealer = true;
    npcs.push({ x:n.x, y:n.y, sprite:d.sprite, name:d.name, role:d.role, lines:d.lines, neutral:d.neutral });
  }
  // A functional hub always needs a respawn/heal NPC — inject one at the temple
  // if the author forgot, so an edited map is never soft-locked on death.
  if(!hasHealer){ const d=NPC_MAP.healer; npcs.push({ x:tcx, y:tcy, sprite:d.sprite, name:d.name, role:d.role, lines:d.lines, neutral:d.neutral }); }
  for(const f of fountains) solids.push({ x:f.x, y:f.y, r:22, kind:"fountain" });

  for(const c of (E.chests||[]))    chests.push({ x:c.x, y:c.y, opened:false, loot:c.loot||"gold40" });
  for(const f of (E.fragments||[])) fragments.push({ x:f.x, y:f.y, taken:false, kind:f.kind||"hp" });
  for(const p of (E.portals||[]))   portals.push({ x:p.x, y:p.y, to:p.to, dx:p.dx, dy:p.dy, kind:p.kind||"down" });
  for(const pr of (E.props||[])){
    deco.push({ x:pr.x, y:pr.y, kind:pr.kind });
    if(pr.solid) solids.push({ x:pr.x, y:pr.y, r:pr.r||10, kind:pr.kind });
  }

  return {
    terr, town, forest:world.forest, caves:world.caves, arena:world.arena,
    ruins:world.ruins, abyss:world.abyss, frost:world.frost, trial:world.trial, swamp:world.swamp,
    solids, deco, chests, fragments, fountains, npcs, spawners, portals,
    templeF, tcx, tcy, wallSet:new Set(), buildings:[], blockSet:new Set(),
    fromMapDoc:true, mapName: doc.name || "Mapa",
  };
}

// ===========================================================================
// readMapDoc() — resolve the ?map= URL param to a MapDoc (or null).
//   ?map=local / ?map=editor → the editor's last export from localStorage
//   ?map=seed                → the bundled "ciudad-hub ruinas + bosque" seed
// Returns null (→ default world, byte-identical) when there is no ?map param.
// Synchronous on purpose: sim.js builds the world at module-load, so we read
// localStorage (sync) rather than fetch.
// ===========================================================================
export function readMapDoc(){
  if(typeof location==="undefined") return null;
  const m = /[?&]map=([^&]+)/.exec(location.search||"");
  if(!m) return null;
  const id = decodeURIComponent(m[1]);
  if(id==="local" || id==="editor"){
    try { const raw = localStorage.getItem(MAPDOC_KEY); return raw ? JSON.parse(raw) : null; }
    catch(e){ return null; }
  }
  if(id==="seed") return makeSeedMapDoc();
  return null;
}

// ===========================================================================
// makeSeedMapDoc() — Carlos's first artifact: a RUINED CITY hub ringed by four
// forest spokes (hub-and-spoke), each a real difficulty tier, connected by dirt
// roads (walk-in, no portals). Reuses existing art/mobs/bosses at $0. This is
// the concrete MapDoc the editor loads as "Nuevo desde plantilla" and that the
// game plays at ?map=seed — the SAME data, proving the round-trip end to end.
// ===========================================================================
export function makeSeedMapDoc(){
  const W=96, H=72;
  const t = new Uint8Array(W*H).fill(T_GRASS);
  const setRect=(x,y,w,h,v)=>{ for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++) if(xx>=0&&xx<W&&yy>=0&&yy<H) t[yy*W+xx]=v; };

  // hub (ruined city) — cobble plaza with stone rubble patches
  const town={ x:40, y:30, w:16, h:12 };
  setRect(town.x, town.y, town.w, town.h, T_COBBLE);
  setRect(town.x+2, town.y+2, 3, 2, T_STONE); setRect(town.x+town.w-5, town.y+town.h-4, 4, 2, T_STONE);
  setRect(town.x+town.w-4, town.y+1, 2, 2, T_WATER);   // a broken fountain pool

  // four forest spokes around the hub
  const north={ slot:"forest", name:"Bosque del Alba",       x:41, y:8,  w:16, h:16 };
  const east ={ slot:"ruins",  name:"Ruinas de Piedra",      x:64, y:30, w:18, h:14 };
  const south={ slot:"swamp",  name:"Ciénaga Umbría",        x:41, y:50, w:16, h:16 };
  const west ={ slot:"caves",  name:"Cavernas del Ocaso",    x:10, y:30, w:18, h:14 };
  setRect(south.x, south.y, south.w, south.h, T_SWAMP);
  setRect(west.x,  west.y,  west.w,  west.h,  T_STONE);
  // ruins spoke: grass with scattered cobble rubble patches
  for(let i=0;i<5;i++) setRect(east.x+3+i*3, east.y+2+((i*5)%9), 2, 2, T_COBBLE);

  // dirt roads from the hub to each spoke (the hub-and-spoke connective tissue)
  const cxT=Math.floor(town.x+town.w/2), cyT=Math.floor(town.y+town.h/2);
  for(let y=north.y+north.h; y<town.y; y++){ t[y*W+cxT]=T_DIRT; t[y*W+cxT+1]=T_DIRT; }        // north road
  for(let y=town.y+town.h; y<south.y; y++){ t[y*W+cxT]=T_DIRT; t[y*W+cxT+1]=T_DIRT; }         // south road
  for(let x=east.x-1; x>town.x+town.w-1; x--){ t[cyT*W+x]=T_DIRT; t[(cyT+1)*W+x]=T_DIRT; }    // east road
  for(let x=west.x+west.w; x<town.x; x++){ t[cyT*W+x]=T_DIRT; t[(cyT+1)*W+x]=T_DIRT; }        // west road

  // ---- props: a small deterministic LCG so the seed is reproducible ($0) ----
  let s=0x9e3779b1>>>0; const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; };
  const props=[];
  const inRectTile=(x,y,r)=> x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
  const zones=[north,east,south,west];
  const pushProp=(kind,tx,ty,solid,r)=> props.push({ x:tx*TS+TS/2, y:ty*TS+TS/2, kind, solid, r });
  // forest spoke foliage
  for(let i=0;i<70;i++){ const tx=north.x+1+Math.floor(rnd()*(north.w-2)), ty=north.y+1+Math.floor(rnd()*(north.h-2));
    const k=rnd(); if(k<0.55) pushProp(rnd()<0.5?"prop_tree_a":"prop_tree_b",tx,ty,true,12); else if(k<0.7) pushProp("prop_f_pine_3",tx,ty,true,9); else pushProp("prop_bush",tx,ty,false,0); }
  // ruins spoke
  for(let i=0;i<46;i++){ const tx=east.x+1+Math.floor(rnd()*(east.w-2)), ty=east.y+1+Math.floor(rnd()*(east.h-2));
    const k=rnd(); if(k<0.3) pushProp("prop_ruin_obelisk",tx,ty,true,12); else if(k<0.55) pushProp("prop_pillar",tx,ty,true,9); else if(k<0.75) pushProp(rnd()<0.5?"prop_tree_a":"prop_tree_b",tx,ty,true,12); else pushProp("prop_bush",tx,ty,false,0); }
  // caves spoke
  for(let i=0;i<44;i++){ const tx=west.x+1+Math.floor(rnd()*(west.w-2)), ty=west.y+1+Math.floor(rnd()*(west.h-2));
    const k=rnd(); if(k<0.4) pushProp("prop_rock",tx,ty,true,12); else if(k<0.65) pushProp("prop_barrel",tx,ty,true,9); else pushProp("prop_bones",tx,ty,false,0); }
  // swamp spoke
  for(let i=0;i<40;i++){ const tx=south.x+1+Math.floor(rnd()*(south.w-2)), ty=south.y+1+Math.floor(rnd()*(south.h-2));
    const k=rnd(); if(k<0.35) pushProp("prop_sw_dead_tree_1",tx,ty,true,10); else pushProp("prop_sw_reeds_1",tx,ty,false,0); }
  // sparse wilderness trees in the open grass between spokes (skip zones + roads)
  for(let i=0;i<160;i++){ const tx=2+Math.floor(rnd()*(W-4)), ty=2+Math.floor(rnd()*(H-4));
    if(t[ty*W+tx]!==T_GRASS) continue; if(inRectTile(tx,ty,town)) continue;
    let near=false; for(const z of zones){ if(inRectTile(tx,ty,z)){ near=true; break; } } if(near) continue;
    if(rnd()<0.5) continue; pushProp(rnd()<0.6?"prop_f_pine_3":"prop_tree_a", tx, ty, true, 9); }

  const cx=(town.x+town.w/2), cy=(town.y+town.h/2);
  return {
    v:MAPDOC_VERSION, name:"Ciudadela en Ruinas + Bosque", w:W, h:H,
    terrain:{ rle: rleEncode(t) },
    zones:[ { slot:"town", name:"Ciudadela en Ruinas", x:town.x, y:town.y, w:town.w, h:town.h }, north, east, south, west ],
    entities:{
      npcs:[
        { role:"healer",     x:(cx)*TS,        y:(cy)*TS },
        { role:"merchant",   x:(cx+3)*TS,      y:(cy)*TS },
        { role:"blacksmith", x:(cx-3)*TS,      y:(cy-1)*TS },
        { role:"bounty",     x:(cx+2)*TS,      y:(cy+3)*TS },
        { role:"codex",      x:(cx-2)*TS,      y:(cy+3)*TS },
      ],
      chests:[
        { x:(north.x+north.w-3)*TS, y:(north.y+2)*TS,        loot:"gold40" },
        { x:(east.x+2)*TS,          y:(east.y+2)*TS,         loot:"gold60" },
        { x:(west.x+west.w-3)*TS,   y:(west.y+west.h-3)*TS,  loot:"potionhp" },
        { x:(south.x+2)*TS,         y:(south.y+south.h-3)*TS,loot:"gold60" },
      ],
      fragments:[
        { x:(north.x+2)*TS, y:(north.y+north.h-3)*TS, kind:"hp" },
        { x:(west.x+2)*TS,  y:(west.y+2)*TS,          kind:"mp" },
      ],
      portals:[],
      props,
    },
  };
}
