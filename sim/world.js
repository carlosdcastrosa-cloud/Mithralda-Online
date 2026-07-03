// ===========================================================================
// sim/world.js — deterministic world generation + zone lookup.
// buildWorld(rng) consumes the simulation's seeded RNG stream so the generated
// map is identical for a fixed seed. Pure data out (terrain, solids, deco,
// chests, fragments, fountains, npcs, spawners) — no ctx, no DOM.
// ===========================================================================
import { STR } from "../strings.js";
import { TS, MAP_W, MAP_H, T_GRASS, T_DIRT, T_STONE, T_COBBLE, T_SAND, T_ICE, T_SWAMP, TOWN_MAP, TOWN_LEGEND } from "./config.js";
import { inRect } from "./math.js";

// CAS-80: resolve a town-local cell (lx,ly within the 18×18 town rect) to its terrain
// tile id from the data-driven TOWN_MAP. Out-of-bounds (defensive) falls back to plaza
// flagstone so a mis-sized map can never punch a hole in the town floor.
function townTile(lx, ly){
  const row = TOWN_MAP[ly];
  const t = row ? TOWN_LEGEND[row[lx]] : undefined;
  return t === undefined ? T_COBBLE : t;
}

export function buildWorld(rng){
  const { srand, seed, rr, ri } = rng;
  seed(13371);
  const terr = new Uint8Array(MAP_W*MAP_H);
  // CAS-398: the map was tripled (MAP_W/MAP_H 110→330). The original zone cluster occupied a
  // ~110-tile block; here we CENTER it in the enlarged world via a fixed tile offset (OX,OY)
  // so the hub + zones sit mid-map, ringed on every side by the Bosque Salvaje, instead of
  // jammed in a corner with 3/4 empty wilderness. Every downstream placement (spawns, NPCs,
  // portals, chests, fragments, dirt paths, cave walls) derives from these rects, so shifting
  // the rects shifts the ENTIRE world coherently. The offset adds/removes NO rng draw, so the
  // spawn/prop RNG fingerprint (and thus balance) is byte-identical to the pre-triple world.
  const OX=110, OY=110;                            // (MAP_W-110)/2 — centers the 110-tile content block
  const town  = {x:46+OX,y:46+OY,w:18,h:18};
  const forest= {x:64+OX,y:34+OY,w:44,h:42};
  const caves = {x:30+OX,y:4+OY,w:52,h:34};
  const arena = {x:42+OX,y:66+OY,w:26,h:38};
  const ruins = {x:6+OX,y:44+OY,w:30,h:30};
  // CAS-114 — the Abismo: a self-contained dungeon in the SE corner, reached only by
  // the gated town portal (no walking path), so it reads as a separate, deeper place.
  // Dark stone floor (T_STONE, like the caves) sets it apart from the open grass zones.
  const abyss = {x:80+OX,y:78+OY,w:26,h:28};
  // CAS-121 — the Cripta Helada: a self-contained frozen dungeon in the SW corner,
  // reached only by a (higher) power-gated town portal. Pale-blue ice floor (T_ICE)
  // sets it apart at a glance from the grass zones and the dark-stone abyss.
  const frost = {x:6+OX,y:80+OY,w:26,h:26};
  // CAS-196 — el Coliseo Eterno: a self-contained challenge arena in the NE corner (clear
  // of caves/forest), reached only by the deepest power-gated town portal. Flagstone floor
  // (T_COBBLE — the same grand colosseum stone as the town plaza/ruins) reads as a built
  // arena, distinct from the grass zones, the dark-stone abyss and the pale-ice Cripta.
  const trial = {x:84+OX,y:6+OY,w:24,h:24};
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    let t=T_GRASS;
    if(inRect(x,y,caves)) t=T_STONE;
    else if(inRect(x,y,abyss)) t=T_STONE;
    else if(inRect(x,y,frost)) t=T_ICE;
    else if(inRect(x,y,trial)) t=T_COBBLE;
    else if(inRect(x,y,town)) t=townTile(x-town.x, y-town.y);  // CAS-80: data-driven hub tilemap
    else if(inRect(x,y,arena)) t=T_SAND;
    else if(inRect(x,y,forest)) t=T_GRASS;
    // dirt paths radiating from town center
    const cxp=town.x+town.w/2, cyp=town.y+town.h/2;
    if(t===T_GRASS){
      if(Math.abs(y-cyp)<1.5 && x>cxp) t=T_DIRT;            // east path to forest
      if(Math.abs(x-cxp)<1.5 && y<cyp) t=T_DIRT;            // north path to caves
      if(Math.abs(x-cxp)<1.5 && y>cyp) t=T_DIRT;            // south path to arena
      if(Math.abs(y-cyp)<1.5 && x<town.x && x>ruins.x+2) t=T_DIRT; // west path to ruins
    }
    terr[y*MAP_W+x]=t;
  }
  const solids=[]; // {x,y,r,kind}
  const deco=[];   // {x,y,kind}  (drawn, tree/rock collide)
  const chests=[]; // {x,y,opened,loot}
  const fragments=[]; // {x,y,taken,kind}
  const fountains=[]; // {x,y}
  const npcs=[];
  const spawners=[]; // {x,y,r,types[],zone,max,cool,t}
  const portals=[];   // CAS-114: {x,y,to,dx,dy,kind} — interactable warp gates (town↔abyss)

  function place(kind,x,y,r){ solids.push({x,y,r,kind}); deco.push({x,y,kind}); }
  // trees, bushes & grass in forest (Ancient Ruins foliage)
  for(let i=0;i<78;i++){ const x=(forest.x+rr(1,forest.w-1))*TS, y=(forest.y+rr(1,forest.h-1))*TS;
    const k=srand();
    if(k<0.50) prop(srand()<0.5?"prop_tree_a":"prop_tree_b", x,y, true, 12);
    else if(k<0.62) prop("prop_rock",x,y,true,12);
    else if(k<0.78) prop("prop_bush",x,y,false);
    else if(k<0.88) prop("prop_shrub",x,y,false);
    else prop(srand()<0.5?"prop_grass1":"prop_grass2",x,y,false);
  }
  // rocks in caves
  for(let i=0;i<70;i++){ const x=(caves.x+rr(1,caves.w-1))*TS, y=(caves.y+rr(1,caves.h-1))*TS; place("rock",x,y,14); }
  // town fountains: temple (respawn) + market. CAS-309 (board CAS-308): the CENTRAL
  // square fountain — the town's healing station — is REMOVED here. Its rest-heal is
  // taken over by the new healer NPC (Maren) placed on its EXACT spot below, so the
  // fountain object + visual are fully retired (no double). The temple fountain stays as
  // the respawn anchor (sim.js reads world.templeF); the market fountain stays as plain
  // water dressing (it never was the heal landmark).
  const tcx=(town.x+town.w/2)*TS, tcy=(town.y+town.h/2)*TS;
  const templeF={x:tcx-5*TS,y:tcy-4*TS,temple:true}; fountains.push(templeF);
  fountains.push({x:tcx+5*TS,y:tcy+4*TS,temple:false});
  for(const f of fountains) solids.push({x:f.x,y:f.y,r:22,kind:"fountain"});
  // NPCs in town
  npcs.push({x:tcx+3*TS,y:tcy-1*TS,sprite:"npcBram",name:STR.npcBram,role:"shop",lines:STR.bramLines});
  npcs.push({x:tcx-2*TS,y:tcy+2*TS,sprite:"npcRolf",name:STR.npcRolf,role:"quest",lines:STR.rolfLines});
  npcs.push({x:tcx-4*TS,y:tcy-2*TS,sprite:"npcLina",name:STR.npcLina,role:"heal",lines:STR.linaLines});
  // CAS-309: the HEALER NPC ("Maren la Sanadora") stands on the EXACT spot of the removed
  // central fountain (tcx,tcy). neutral → combat AI ignores it. role:"fountain" is the
  // Game Engineer's hook (child issue) to re-wire the fountain's rest-heal onto this NPC:
  // full HP/MP restore + set respawn here + STR.fountainRest toast + heal sfx, same heal
  // radius/trigger the fountain had. Until that lands it safely falls back to dialogue.
  npcs.push({x:tcx,y:tcy,sprite:"healernpc",name:STR.npcHealer,role:"fountain",lines:STR.healerLines,neutral:true});
  // CAS-60: market-square dressing — stalls, crates & street lanterns for city variety.
  for(const [sx,sy] of [[tcx-3*TS,tcy-3*TS],[tcx+3*TS,tcy-3*TS],[tcx,tcy+5*TS]]){
    prop("stall",sx,sy,true,12); prop("crate",sx-TS,sy+TS,true,8); }
  // CAS-84: animated NPC merchant tending the southern market stall (real Ancient
  // Ruins art, idle loop via NPC_ANIM). Neutral/non-hostile — no aggro, no combat.
  // CAS-112: role "merchant" → opens the persistent upgrade shop (gold sink that
  // closes the hunt→gold→power loop). Still neutral:true so combat AI ignores it.
  npcs.push({x:tcx+1.5*TS,y:tcy+5*TS,sprite:"merchant",name:STR.npcMerchant,role:"merchant",lines:STR.merchantLines,neutral:true});
  // CAS-134: the Bounty Board steward beside the merchant — role "bounty" opens the daily
  // contracts + login-streak board (the daily return loop). Neutral so combat AI ignores it.
  npcs.push({x:tcx-1.5*TS,y:tcy+5*TS,sprite:"npcRolf",name:STR.npcBounty,role:"bounty",lines:STR.bountyLines,neutral:true});
  // CAS-386: Yára la Cronista beside the bounty steward — role "codex" opens the Bestiary
  // (collection meta-goal over the kill roster). Neutral so combat AI ignores it.
  npcs.push({x:tcx-3.5*TS,y:tcy+5*TS,sprite:"npcLina",name:STR.npcCodex,role:"codex",lines:STR.codexLines,neutral:true});
  for(let i=0;i<6;i++){ const x=(town.x+rr(2,town.w-2))*TS, y=(town.y+rr(2,town.h-2))*TS;
    if(Math.hypot(x-tcx,y-tcy)<3*TS) continue; prop("crate",x,y,true,8); }
  for(let i=0;i<4;i++){ prop("lantern",(town.x+2)*TS,(town.y+3+i*4)*TS,false);
    prop("lantern",(town.x+town.w-2)*TS,(town.y+3+i*4)*TS,false); }
  // neutral adventurers in arena
  for(let i=0;i<5;i++){ const x=(arena.x+rr(3,arena.w-3))*TS, y=(arena.y+rr(3,arena.h-3))*TS;
    npcs.push({x,y,sprite:"adv",name:STR.npcAdventurer,role:"neutral",lines:STR.adventurerLines,neutral:true}); }
  // chests
  chests.push({x:(forest.x+forest.w-4)*TS,y:(forest.y+4)*TS,opened:false,loot:"gold40"});
  chests.push({x:(caves.x+4)*TS,y:(caves.y+4)*TS,opened:false,loot:"potionhp"});
  chests.push({x:(caves.x+caves.w-5)*TS,y:(caves.y+caves.h-4)*TS,opened:false,loot:"gold60"});
  // hidden vitality fragments
  fragments.push({x:(forest.x+3)*TS,y:(forest.y+forest.h-3)*TS,taken:false,kind:"hp"});
  fragments.push({x:(caves.x+caves.w/2)*TS,y:(caves.y+2)*TS,taken:false,kind:"mp"});
  fragments.push({x:(arena.x+2)*TS,y:(arena.y+arena.h-3)*TS,taken:false,kind:"hp"});
  // spawners
  spawners.push({rect:forest,types:["wolf","wolf","rat","bat","bat"],max:12,cool:3,t:0,zone:"forest"});
  // CAS-126 caves IDENTITY — "la Necrópolis": a caster gauntlet around a SUMMONER
  // (necromancer) that keeps raising skeletons. The fight is about cutting the head off
  // the tide (kill the summoner) while dodging spear/bolt poke — distinct from any other
  // zone's pack. Summoned adds scale to the zone tier through the real spawn path.
  // CAS-146: the volatile (suicide-bomber) slots into the caves mix — a fast glass threat
  // that punishes face-tanking the pack and rewards reading/killing it at range.
  // CAS-360: the Quillback Stalker (richAnim quilled beast, skeleton-tier melee) joins the caves
  // trash pool — same power band as the caves skeleton it clones, so zone difficulty is unchanged.
  spawners.push({rect:caves,types:["skeleton","mage","spearman","wraith","summoner","volatile","quillback"],max:12,cool:4,t:0,zone:"caves"});
  // ---- dungeon walls in the caves (perimeter ring + interior alcoves) ----
  const wallSet=new Set();
  const cx0=caves.x, cy0=caves.y, cx1=caves.x+caves.w-1, cy1=caves.y+caves.h-1;
  const cxc=Math.floor(caves.x+caves.w/2);
  for(let x=cx0;x<=cx1;x++){ wallSet.add(cy0*MAP_W+x);                       // top wall
    if(!(x>=cxc-3 && x<=cxc+2)) wallSet.add(cy1*MAP_W+x); }                  // bottom wall w/ south entrance gap
  for(let y=cy0;y<=cy1;y++){ wallSet.add(y*MAP_W+cx0); wallSet.add(y*MAP_W+cx1); } // side walls
  const stubs=[ {x:cx0+6,y:cy0+10,w:11,h:1}, {x:cx1-16,y:cy0+10,w:11,h:1},
    {x:cx0+14,y:cy0+16,w:1,h:9}, {x:cx1-14,y:cy0+16,w:1,h:9},
    {x:cx0+8,y:cy0+24,w:8,h:1}, {x:cx1-15,y:cy0+24,w:8,h:1} ];
  for(const s of stubs) for(let yy=s.y;yy<s.y+s.h;yy++) for(let xx=s.x;xx<s.x+s.w;xx++){
    if(Math.abs(xx-cxc)<=3) continue;   // keep central corridor open
    if(yy<cy0+6) continue;              // keep boss area (top) clear
    wallSet.add(yy*MAP_W+xx); }
  function isWall(tx,ty){ return wallSet.has(ty*MAP_W+tx); }

  // ---- CENTRAL WALLED CITY (Puerto Solana) --------------------------------------------
  // A stone rampart rings the town rect with a GATE on each of the four road exits (town-
  // local cols/rows 8-9), plus a cluster of ENTERABLE houses: open-top (cutaway) buildings
  // whose perimeter walls BLOCK but whose door gap + wooden interior are WALKABLE, so the
  // player walks inside on the same screen. Purely additive (wallSet + a new blockSet +
  // a buildings list, no rng draws) → the spawn/prop fingerprint and balance are untouched.
  const bx0=town.x, by0=town.y, bx1=town.x+town.w-1, by1=town.y+town.h-1;
  const gate=[town.w-10, town.w-9]; // town-local 8,9 → the road columns/rows
  const inGateX=(x)=>{ const l=x-town.x; return l===gate[0]||l===gate[1]; };
  const inGateY=(y)=>{ const l=y-town.y; return l===gate[0]||l===gate[1]; };
  for(let x=bx0;x<=bx1;x++){ if(!inGateX(x)){ wallSet.add(by0*MAP_W+x); wallSet.add(by1*MAP_W+x); } }
  for(let y=by0;y<=by1;y++){ if(!inGateY(y)){ wallSet.add(y*MAP_W+bx0); wallSet.add(y*MAP_W+bx1); } }
  // enterable houses — tile rects with a south-facing door gap (2 cells wide at local `door`)
  const buildings=[
    { tx:town.x+2,        ty:town.y+2,        tw:5, th:4, kind:"house",   door:2 },
    { tx:town.x+town.w-7, ty:town.y+2,        tw:5, th:4, kind:"shop",    door:2 },
    { tx:town.x+2,        ty:town.y+town.h-6, tw:5, th:4, kind:"cottage", door:2 },
    { tx:town.x+town.w-7, ty:town.y+town.h-6, tw:5, th:4, kind:"house",   door:2 },
  ];
  // collision: every perimeter wall cell of every building blocks; the 2-cell south door gap
  // and the interior floor stay walkable. Rendered procedurally in render.js (open-top).
  const blockSet=new Set();
  for(const b of buildings){
    for(let yy=0;yy<b.th;yy++) for(let xx=0;xx<b.tw;xx++){
      const edge = xx===0||xx===b.tw-1||yy===0||yy===b.th-1;
      if(!edge) continue;                                   // interior floor = walkable
      if(yy===b.th-1 && (xx===b.door||xx===b.door+1)) continue; // south door gap = walkable
      blockSet.add((b.ty+yy)*MAP_W+(b.tx+xx));
    }
  }
  // props from the purchased packs — decorate the caves (and a little of the arena)
  function prop(kind,x,y,solid,r){ deco.push({x,y,kind}); if(solid) solids.push({x,y,r:r||10,kind}); }
  // ERW little wall-fountains flanking the north city gate (visual only — non-solid deco,
  // no rng draw, so the spawn/balance fingerprint is untouched).
  prop("prop_erw_fountain",(town.x+5)*TS,(town.y+2)*TS,false);
  prop("prop_erw_fountain",(town.x+town.w-5)*TS,(town.y+2)*TS,false);
  for(let i=0;i<16;i++){ const tx=caves.x+rr(2,caves.w-2), ty=caves.y+rr(3,caves.h-2); if(isWall(tx,ty)) continue; const x=tx*TS, y=ty*TS;
    const k=srand(); if(k<0.30) prop("prop_barrel",x,y,true,9);
    else if(k<0.50) prop("prop_pillar",x,y,true,9);
    else if(k<0.72) prop("prop_bones",x,y,false);
    else prop("prop_rock",x,y,false); }
  // torches lining the path into the caves
  for(let i=0;i<6;i++){ prop("prop_torch",(cxc-3)*TS,(caves.y+6+i*4)*TS,false); prop("prop_torch",(cxc+3)*TS,(caves.y+6+i*4)*TS,false); }
  for(let i=0;i<6;i++){ const x=(arena.x+rr(2,arena.w-2))*TS, y=(arena.y+rr(3,arena.h-2))*TS; prop(srand()<0.5?"prop_bones":"prop_rock",x,y,false); }
  // ---- Ruinas de Eldath (outdoor ruins zone, west of town) ----
  // CAS-76: the animated Moose bruiser joins the ruins pool (replaces the trailing
  // bandit/orc dup slots → ~2/7 spawn weight; existing variety preserved, RNG sequence
  // unchanged so spawns stay deterministic).
  // CAS-126 ruins IDENTITY — "la Hueste de Eldath": a brute-led WARBAND (orc/moose) with
  // a spear-poke flank, kept alive by a HEALER medic. The zone twist is sustain — out-
  // tank the brutes OR focus the medic first, a different decision than caves' add-tide.
  spawners.push({rect:ruins,types:["orc","moose","bandit","spearman","healer","moose"],max:12,cool:4,t:0,zone:"ruins"});
  const rcyp=town.y+town.h/2;
  for(let i=0;i<34;i++){ const tx=ruins.x+rr(1,ruins.w-2), ty=ruins.y+rr(1,ruins.h-2);
    if(tx>=ruins.x+ruins.w-4 && Math.abs(ty-rcyp)<2) continue; // keep east entrance clear
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.16) prop("prop_ruin_statue",x,y,true,11);
    else if(k<0.30) prop("prop_ruin_obelisk",x,y,true,12);
    else if(k<0.44) prop("prop_ruin_arch",x,y,true,14);
    else if(k<0.58) prop(srand()<0.5?"prop_pillar":"prop_ruin_pillar2",x,y,true,9);
    else if(k<0.74) prop(srand()<0.5?"prop_tree_a":"prop_tree_b",x,y,true,12);
    else if(k<0.86) prop("prop_bush",x,y,false);
    else if(k<0.94) prop("prop_rock",x,y,false);
    else prop(srand()<0.5?"prop_grass1":"prop_grass2",x,y,false); }
  chests.push({x:(ruins.x+2)*TS,y:(ruins.y+2)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(ruins.x+2)*TS,y:(ruins.y+ruins.h-3)*TS,taken:false,kind:"hp"});
  // ---- El Abismo (CAS-114): the power-gated endgame dungeon ----
  // Tier-5 mob pool (the caves/arena roster, scaled hard by ZONE_TIER.abyss). No new
  // art: reuses existing animated/procedural enemies. The capstone Tirano spawns via
  // the HUNTS.abyss contract (shared resolver), so nothing here is hard-coded combat.
  // CAS-126 abyss IDENTITY — "el Pozo de Embestidas": the CHARGE pit. Heavy CHARGERS
  // commit long locked-facing lanes you must sidestep while wraith/mage casters poke from
  // range and a moose brute anchors. The zone fight is lane-management — a different motor
  // skill than caves (kill priority) or ruins (sustain). Tier-5 scaling stacks on top.
  // CAS-210: the punisher `revenant` duelist surfaces in the deep, high-skill zones (abyss→
  // frost→trial) where read-and-punish combat is the point — its combo chain + long punish
  // window reward the riposte counter the most.
  spawners.push({rect:abyss,types:["wraith","orc","charger","revenant","demon","mage","wendigo"],max:13,cool:3,t:0,zone:"abyss"}); // CAS-321: dark_demon_3 (warlock hybrid) joins the Abismo trash pool; CAS-363: wendigo wraith-shaman caster (warlock+richAnim) joins the same dark void pool
  // dressing — bones, pillars, rocks & torch posts for an oppressive ruin feel.
  for(let i=0;i<22;i++){ const tx=abyss.x+rr(2,abyss.w-2), ty=abyss.y+rr(2,abyss.h-2);
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.26) prop("prop_pillar",x,y,true,9);
    else if(k<0.46) prop("prop_bones",x,y,false);
    else if(k<0.64) prop("prop_rock",x,y,false);
    else if(k<0.78) prop("prop_barrel",x,y,true,9);
    else prop("prop_ruin_pillar2",x,y,true,9); }
  for(let i=0;i<5;i++){ prop("prop_torch",(abyss.x+2)*TS,(abyss.y+4+i*5)*TS,false);
    prop("prop_torch",(abyss.x+abyss.w-2)*TS,(abyss.y+4+i*5)*TS,false); }
  chests.push({x:(abyss.x+3)*TS,y:(abyss.y+3)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(abyss.x+abyss.w-3)*TS,y:(abyss.y+3)*TS,taken:false,kind:"mp"});
  // ---- portals (CAS-114): a gated town gate down to the Abismo + a return gate up ----
  // The town portal sits NE of the plaza; the abyss return gate sits near the zone's
  // south edge. Entering drops the hero at the return gate (entry vestibule) and the
  // spawner keeps mobs >240px away, so you arrive safe and walk INTO the fight.
  const acx=(abyss.x+5)*TS, acy=(abyss.y+abyss.h-3)*TS;     // abyss vestibule (near return gate)
  const tpx=tcx+5*TS, tpy=tcy-6*TS;                          // town gate, NE of plaza
  portals.push({x:tpx, y:tpy, to:"abyss", dx:acx, dy:acy-TS*2, kind:"down"});
  portals.push({x:acx, y:acy, to:"town",  dx:tpx, dy:tpy+TS*2, kind:"up"});
  // ---- la Cripta Helada (CAS-121): a tier-6 frozen dungeon ----
  // Same shared machinery as the abyss: a tier-6 mob pool scaled by ZONE_TIER.frost +
  // the capstone Guardián de la Cripta spawned by the HUNTS.frost contract.
  // CAS-126 frost IDENTITY — "la Hueste Helada": a SUPPORT-heavy attrition host. A SUMMONER
  // and a HEALER prop up slowing wraith/mage casters and an orc anchor, so the zone grinds
  // you down with adds + heals + slows — thematically the status-fight prelude to the boss's
  // carapace (which only a status build cracks). Hardest, most attritional pack in the game.
  spawners.push({rect:frost,types:["wraith","mage","summoner","healer","wraith","orc"],max:13,cool:3,t:0,zone:"frost"});
  // dressing — frozen pillars, bones & rocks for a cold, ruined-crypt feel.
  for(let i=0;i<22;i++){ const tx=frost.x+rr(2,frost.w-2), ty=frost.y+rr(2,frost.h-2);
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.28) prop("prop_pillar",x,y,true,9);
    else if(k<0.48) prop("prop_bones",x,y,false);
    else if(k<0.66) prop("prop_rock",x,y,true,11);
    else if(k<0.80) prop("prop_ruin_pillar2",x,y,true,9);
    else prop("prop_barrel",x,y,true,9); }
  for(let i=0;i<5;i++){ prop("prop_torch",(frost.x+2)*TS,(frost.y+4+i*4)*TS,false);
    prop("prop_torch",(frost.x+frost.w-2)*TS,(frost.y+4+i*4)*TS,false); }
  chests.push({x:(frost.x+3)*TS,y:(frost.y+3)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(frost.x+frost.w-3)*TS,y:(frost.y+3)*TS,taken:false,kind:"hp"});
  // ---- portal: a (harder) gated town gate down to the Cripta + a return gate up ----
  const fcx=(frost.x+5)*TS, fcy=(frost.y+frost.h-3)*TS;     // frost vestibule (near return gate)
  const fpx=tcx-5*TS, fpy=tcy-6*TS;                          // town gate, NW of plaza
  portals.push({x:fpx, y:fpy, to:"frost", dx:fcx, dy:fcy-TS*2, kind:"down"});
  portals.push({x:fcx, y:fcy, to:"town",  dx:fpx, dy:fpy+TS*2, kind:"up"});
  // ---- el Coliseo Eterno (CAS-196): the tier-7, post-finale challenge arena ----
  // Same shared machinery as the abyss/Cripta: a tier-7 gauntlet pool (the hardest mix
  // in the game — a CHARGER lane + a SUMMONER add-tide + a HEALER medic + status casters
  // + a VOLATILE burst, every read-and-react verb at once) scaled by ZONE_TIER.trial, plus
  // the WORLD-BOSS (Avatar del Coliseo) summoned by the HUNTS.trial contract. Clearing the
  // gauntlet IS the gate to the boss — survive the arena, the Avatar answers.
  spawners.push({rect:trial,types:["charger","summoner","revenant","wraith","volatile","revenant"],max:13,cool:3,t:0,zone:"trial"});
  // dressing — a ringed colosseum: pillars + bones + braziers for a grand arena feel.
  for(let i=0;i<22;i++){ const tx=trial.x+rr(2,trial.w-2), ty=trial.y+rr(2,trial.h-2);
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.30) prop("prop_pillar",x,y,true,9);
    else if(k<0.48) prop("prop_ruin_pillar2",x,y,true,9);
    else if(k<0.64) prop("prop_bones",x,y,false);
    else if(k<0.80) prop("prop_rock",x,y,true,11);
    else prop("prop_barrel",x,y,true,9); }
  for(let i=0;i<5;i++){ prop("prop_torch",(trial.x+2)*TS,(trial.y+4+i*4)*TS,false);
    prop("prop_torch",(trial.x+trial.w-2)*TS,(trial.y+4+i*4)*TS,false); }
  chests.push({x:(trial.x+3)*TS,y:(trial.y+3)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(trial.x+trial.w-3)*TS,y:(trial.y+trial.h-3)*TS,taken:false,kind:"mp"});
  // ---- portal: the DEEPEST gated town gate down to the Coliseo + a return gate up ----
  const ccx=(trial.x+5)*TS, ccy=(trial.y+trial.h-3)*TS;     // coliseo vestibule (near return gate)
  const cpx=tcx,            cpy=tcy-6*TS;                     // town gate, N-centre of plaza (between abyss-NE + frost-NW)
  portals.push({x:cpx, y:cpy, to:"trial", dx:ccx, dy:ccy-TS*2, kind:"down"});
  portals.push({x:ccx, y:ccy, to:"town",  dx:cpx, dy:cpy+TS*2, kind:"up"});
  // ---- CAS-353: el Bosque Salvaje — forest the empty field ("todas las tiles negras") ----
  // The named zones cover only part of the 110×110 map; everything outside them is open
  // grass "field" that, with the camera unclamped, reads as dark negative space ("tiles
  // negras"). Fill it with the board's nature pack (prop_f_* — trees/pines/rocks/foliage)
  // so the world reads as one continuous wilderness instead of a void between zones.
  //
  // Determinism: this loop runs LAST, so it consumes the rng stream only AFTER every prior
  // zone/spawn/prop draw — those are byte-identical (Stage-2 deterministic). The forest is
  // placed via the existing `prop(kind,x,y,false)` → DECORATIVE ONLY (never pushed to
  // `solids`), so sim collision (solidBlocked's O(n) scan) and zone balance are untouched.
  // render.js view-culls deco, so the thousands of props stay cheap (off-screen = skipped).
  const FTREE=["prop_f_tree_1","prop_f_tree_2","prop_f_tree_3","prop_f_tree_4","prop_f_tree_5","prop_f_tree_6",
    "prop_f_tree_1_yellow","prop_f_tree_2_yellow","prop_f_tree_3_yellow","prop_f_tree_4_yellow","prop_f_tree_5_yellow","prop_f_tree_6_yellow"];
  const FPINE=["prop_f_pine_1","prop_f_pine_2","prop_f_pine_3","prop_f_pine_4","prop_f_pine_5","prop_f_pine_6","prop_f_pine_7","prop_f_pine_8","prop_f_pine_9","prop_f_pine_10"];
  const FROCK=["prop_f_rock_1_1","prop_f_rock_1_2","prop_f_rock_1_3","prop_f_rock_1_4","prop_f_rock_1_5","prop_f_rock_1_6","prop_f_rock_1_7","prop_f_rock_1_8",
    "prop_f_rock_2_1","prop_f_rock_2_2","prop_f_rock_3_1","prop_f_rock_3_2","prop_f_rock_3_3","prop_f_rock_3_4","prop_f_rock_3_5","prop_f_rock_3_6",
    "prop_f_rock_4_1","prop_f_rock_4_2","prop_f_rock_4_3","prop_f_rock_4_4","prop_f_rock_4_5",
    "prop_f_rock_5_1","prop_f_rock_5_2","prop_f_rock_5_3","prop_f_rock_5_4","prop_f_rock_5_5","prop_f_rock_5_6"];
  const FLITTER=["prop_f_flower_1","prop_f_flower_2","prop_f_flower_3","prop_f_flower_4","prop_f_flower_5","prop_f_flower_6",
    "prop_f_grass_1","prop_f_grass_2","prop_f_bush_1","prop_f_dead_logs1","prop_f_dead_logs2"];
  const zoneRects=[town,forest,caves,arena,ruins,abyss,frost,trial];
  function nearZone(tx,ty,pad){ for(const z of zoneRects){ if(tx>=z.x-pad && tx<z.x+z.w+pad && ty>=z.y-pad && ty<z.y+z.h+pad) return true; } return false; }
  const pick=a=>a[ri(0,a.length-1)];
  for(let ty=1; ty<MAP_H-1; ty++) for(let tx=1; tx<MAP_W-1; tx++){
    if(terr[ty*MAP_W+tx]!==T_GRASS) continue;   // grass only → skips zone floors + dirt paths
    if(nearZone(tx,ty,1)) continue;             // 1-tile gutter off every zone edge (clear entrances)
    const k=srand();
    if(k>=0.62) continue;                         // ~38% open gaps so the field stays walkable
    const cx=tx*TS+TS/2, cy=ty*TS+TS/2;          // tile center; jitter below breaks the grid
    // CAS-397 (board CAS-396): trees/pines/rocks were DECORATIVE-only here, so the hero walked
    // straight through the wilderness. Give them a real collision footprint. Deco is drawn with
    // its BASE at (x,y) (render.js: d.y-h), so the solid is anchored to the visible trunk/rock
    // base — a tight r (well under a 32px tile) so the field slides, not sticks. Litter
    // (flowers/grass/bush/logs) stays non-solid so the ground reads walkable. rr() call
    // count/order is UNCHANGED → deterministic rng fingerprint intact; solidBlocked is now
    // spatially bucketed in sim.js so the extra solids cost ~O(1) per query (60fps held).
    if(k<0.30)      prop(pick(srand()<0.6?FTREE:FPINE), cx+rr(-9,9), cy+rr(-5,7), true, 9);  // canopy → solid trunk base
    else if(k<0.40) prop(pick(FROCK), cx+rr(-8,8), cy+rr(-7,7), true, 8);                    // boulders → solid base
    else            prop(pick(FLITTER), cx+rr(-11,11), cy+rr(-9,9), false);                 // undergrowth (walkable)
  }
  // ---- CAS-441: la Ciénaga de Bruma — the 4th open biome (board CAS-438) ----
  // Carved in the outer wilderness ring EAST of the cluster, straddling the town's east
  // dirt road (the |y-cyp|<1.5 path above runs to the map edge, so the road already leads
  // the player straight to the marsh gate — a clear walk-in entrance, no portal).
  //
  // Determinism (CAS-398 lesson): this block runs AFTER the wilderness fill, so every rng
  // draw that shaped the existing zones/field is byte-identical to the previous build; the
  // swamp only APPENDS draws at the end of the stream. The wilderness props that landed on
  // the rect while it was still grass are compacted out below (pure filtering, no rng).
  const swamp = {x:240,y:150,w:34,h:30};
  for(let ty=swamp.y; ty<swamp.y+swamp.h; ty++) for(let tx=swamp.x; tx<swamp.x+swamp.w; tx++) terr[ty*MAP_W+tx]=T_SWAMP;
  const inSw=(px,py)=>{ const tx=px/TS, ty=py/TS;
    return tx>=swamp.x-1 && tx<swamp.x+swamp.w+1 && ty>=swamp.y-1 && ty<swamp.y+swamp.h+1; };
  // in-place compaction (never splice-per-item / spread-push — deco holds ~58k props)
  function compact(arr){ let w=0; for(let i=0;i<arr.length;i++){ const it=arr[i]; if(!inSw(it.x,it.y)) arr[w++]=it; } arr.length=w; }
  compact(solids); compact(deco);
  // marsh dressing (CAS-439 art): dead trees + mossy rocks are SOLID (real collision
  // footprint through the same spatial-hash path as every other solid, CAS-397); reeds +
  // mushrooms stay walkable litter so the bog reads passable. West entrance kept clear
  // where the town road (rows cyp±1) meets the rect.
  const swPathY=town.y+town.h/2;
  for(let i=0;i<46;i++){ const tx=swamp.x+rr(1,swamp.w-2), ty=swamp.y+rr(1,swamp.h-2);
    if(tx<swamp.x+5 && Math.abs(ty-swPathY)<3) continue;   // keep the west gate open
    const x=tx*TS, y=ty*TS, k=srand();
    if(k<0.28) prop(srand()<0.5?"prop_sw_dead_tree_1":"prop_sw_dead_tree_2",x,y,true,10);
    else if(k<0.42) prop("prop_sw_mossy_rock_1",x,y,true,8);
    else if(k<0.74) prop("prop_sw_reeds_1",x,y,false);
    else prop("prop_sw_mushroom_1",x,y,false); }
  // CAS-442 swamp IDENTITY (art CAS-440, replaces the CAS-441 placeholder pack): the
  // Ciénaga's OWN family — mudlurker ambushers surge out of the fango (rusher, weighted
  // 2× as the zone's signature trash), fuegos fatuos zap from the mist (warlock caster)
  // and bruto-sapo tanks own charge lanes (charger). Three distinct telegraphed reads;
  // Tier-4 scaling (ZONE_TIER.swamp) = the arena's parallel. Capstone: HUNTS.swamp.boss.
  spawners.push({rect:swamp,types:["mudlurker","mudlurker","wisp","toadbrute"],max:12,cool:4,t:0,zone:"swamp"});
  chests.push({x:(swamp.x+swamp.w-4)*TS,y:(swamp.y+swamp.h-4)*TS,opened:false,loot:"gold60"});
  fragments.push({x:(swamp.x+swamp.w-3)*TS,y:(swamp.y+3)*TS,taken:false,kind:"hp"});
  return { terr, town, forest, caves, arena, ruins, abyss, frost, trial, swamp, solids, deco, chests, fragments, fountains, npcs, spawners, portals, templeF, tcx, tcy, wallSet, buildings, blockSet };
}

export function zoneOf(world,x,y){ const tx=x/TS,ty=y/TS;
  if(inRect(tx,ty,world.town)) return "town";
  if(inRect(tx,ty,world.caves)) return "caves";
  if(inRect(tx,ty,world.arena)) return "arena";
  if(world.ruins && inRect(tx,ty,world.ruins)) return "ruins";
  if(world.abyss && inRect(tx,ty,world.abyss)) return "abyss";  // CAS-114
  if(world.frost && inRect(tx,ty,world.frost)) return "frost";  // CAS-121
  if(world.trial && inRect(tx,ty,world.trial)) return "trial";  // CAS-196
  if(world.swamp && inRect(tx,ty,world.swamp)) return "swamp";  // CAS-441
  if(inRect(tx,ty,world.forest)) return "forest";
  return "field"; }
