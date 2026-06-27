// ===========================================================================
// sim/world.js — deterministic world generation + zone lookup.
// buildWorld(rng) consumes the simulation's seeded RNG stream so the generated
// map is identical for a fixed seed. Pure data out (terrain, solids, deco,
// chests, fragments, fountains, npcs, spawners) — no ctx, no DOM.
// ===========================================================================
import { STR } from "../strings.js";
import { TS, MAP_W, MAP_H, T_GRASS, T_DIRT, T_STONE, T_COBBLE, T_SAND } from "./config.js";
import { inRect } from "./math.js";

export function buildWorld(rng){
  const { srand, seed, rr, ri } = rng;
  seed(13371);
  const terr = new Uint8Array(MAP_W*MAP_H);
  const town  = {x:46,y:46,w:18,h:18};
  const forest= {x:64,y:34,w:44,h:42};
  const caves = {x:30,y:4,w:52,h:34};
  const arena = {x:42,y:66,w:26,h:38};
  const ruins = {x:6,y:44,w:30,h:30};
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    let t=T_GRASS;
    if(inRect(x,y,caves)) t=T_STONE;
    else if(inRect(x,y,town)) t=T_COBBLE;
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
  spawners.push({rect:caves,types:["skeleton","spearman","orc","skeleton","mage","wraith","spearman"],max:12,cool:4,t:0,zone:"caves"});
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
  spawners.push({rect:ruins,types:["orc","mage","spearman","skeleton","bandit","bandit","orc"],max:12,cool:4,t:0,zone:"ruins"});
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
  return { terr, town, forest, caves, arena, ruins, solids, deco, chests, fragments, fountains, npcs, spawners, templeF, tcx, tcy, wallSet };
}

export function zoneOf(world,x,y){ const tx=x/TS,ty=y/TS;
  if(inRect(tx,ty,world.town)) return "town";
  if(inRect(tx,ty,world.caves)) return "caves";
  if(inRect(tx,ty,world.arena)) return "arena";
  if(world.ruins && inRect(tx,ty,world.ruins)) return "ruins";
  if(inRect(tx,ty,world.forest)) return "forest";
  return "field"; }
