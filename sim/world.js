// ===========================================================================
// sim/world.js — deterministic world generation + zone lookup.
// buildWorld(rng) consumes the simulation's seeded RNG stream so the generated
// map is identical for a fixed seed. Pure data out (terrain, solids, deco,
// chests, fragments, fountains, npcs, spawners) — no ctx, no DOM.
// ===========================================================================
import { STR } from "../strings.js";
import { TS, MAP_W, MAP_H, T_GRASS, T_DIRT, T_STONE, T_COBBLE, T_SAND, T_ICE, TOWN_MAP, TOWN_LEGEND } from "./config.js";
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
  const town  = {x:46,y:46,w:18,h:18};
  const forest= {x:64,y:34,w:44,h:42};
  const caves = {x:30,y:4,w:52,h:34};
  const arena = {x:42,y:66,w:26,h:38};
  const ruins = {x:6,y:44,w:30,h:30};
  // CAS-114 — the Abismo: a self-contained dungeon in the SE corner, reached only by
  // the gated town portal (no walking path), so it reads as a separate, deeper place.
  // Dark stone floor (T_STONE, like the caves) sets it apart from the open grass zones.
  const abyss = {x:80,y:78,w:26,h:28};
  // CAS-121 — the Cripta Helada: a self-contained frozen dungeon in the SW corner,
  // reached only by a (higher) power-gated town portal. Pale-blue ice floor (T_ICE)
  // sets it apart at a glance from the grass zones and the dark-stone abyss.
  const frost = {x:6,y:80,w:26,h:26};
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    let t=T_GRASS;
    if(inRect(x,y,caves)) t=T_STONE;
    else if(inRect(x,y,abyss)) t=T_STONE;
    else if(inRect(x,y,frost)) t=T_ICE;
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
  // town fountains (3): central square + temple (respawn) + market
  const tcx=(town.x+town.w/2)*TS, tcy=(town.y+town.h/2)*TS;
  fountains.push({x:tcx,y:tcy,temple:false});
  const templeF={x:tcx-5*TS,y:tcy-4*TS,temple:true}; fountains.push(templeF);
  fountains.push({x:tcx+5*TS,y:tcy+4*TS,temple:false});
  for(const f of fountains) solids.push({x:f.x,y:f.y,r:22,kind:"fountain"});
  // NPCs in town
  npcs.push({x:tcx+3*TS,y:tcy-1*TS,sprite:"npcBram",name:STR.npcBram,role:"shop",lines:STR.bramLines});
  npcs.push({x:tcx-2*TS,y:tcy+2*TS,sprite:"npcRolf",name:STR.npcRolf,role:"quest",lines:STR.rolfLines});
  npcs.push({x:tcx-4*TS,y:tcy-2*TS,sprite:"npcLina",name:STR.npcLina,role:"heal",lines:STR.linaLines});
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
  spawners.push({rect:caves,types:["skeleton","mage","spearman","wraith","summoner","skeleton"],max:12,cool:4,t:0,zone:"caves"});
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
  // props from the purchased packs — decorate the caves (and a little of the arena)
  function prop(kind,x,y,solid,r){ deco.push({x,y,kind}); if(solid) solids.push({x,y,r:r||10,kind}); }
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
  spawners.push({rect:abyss,types:["wraith","orc","charger","moose","mage","charger"],max:13,cool:3,t:0,zone:"abyss"});
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
  return { terr, town, forest, caves, arena, ruins, abyss, frost, solids, deco, chests, fragments, fountains, npcs, spawners, portals, templeF, tcx, tcy, wallSet };
}

export function zoneOf(world,x,y){ const tx=x/TS,ty=y/TS;
  if(inRect(tx,ty,world.town)) return "town";
  if(inRect(tx,ty,world.caves)) return "caves";
  if(inRect(tx,ty,world.arena)) return "arena";
  if(world.ruins && inRect(tx,ty,world.ruins)) return "ruins";
  if(world.abyss && inRect(tx,ty,world.abyss)) return "abyss";  // CAS-114
  if(world.frost && inRect(tx,ty,world.frost)) return "frost";  // CAS-121
  if(inRect(tx,ty,world.forest)) return "forest";
  return "field"; }
