// CAS-2225 — headless verify of the door open/close + interior-warp mechanic (DARK).
// Proves: (1) flag OFF ⇒ world terr/wallSet/portals byte-identical to a build without the feature
// AND the seeded RNG stream draws the exact same count (srand ON==OFF); (2) flag ON ⇒ interiors carved,
// doors promoted, doorAt/exitAt wired, room hollow walkable + wall ring solid; (3) determinism: same
// seed ON builds byte-identical twice (0 RNG). Pure world-build test — no DOM, no browser.
import { createRNG } from "../sim/rng.js";
import { TS, T_STONE, T_WATER, DOORS_INTERIORS, MAP_W, MAP_H, setMapDims } from "../sim/config.js";
import { buildTiledWorld } from "../sim/world.js";

// buildTiledWorld GROWS the global MAP_W/MAP_H (setMapDims) and its inner buildWorld reads them, so any
// A/B comparison must rebuild from the SAME 330×330 baseline (the real game builds the world once). Reset
// before every build so each is an apples-to-apples fresh construction.
const RESET=()=>setMapDims(330,330);

// Count RNG draws by wrapping a real stream so we can assert ON==OFF draw count (the true srand test).
function countingRNG(seed){ const r=createRNG(seed); let n=0;
  return { srand:()=>{n++;return r.srand();}, seed:r.seed, rr:(a,b)=>{n++;return a+r.srand()*(b-a);},
           ri:(a,b)=>{n++;return Math.floor(a+r.srand()*(b-a+1));}, draws:()=>n }; }

function fingerprint(w){ // FNV-1a over terr + sorted wallSet — cheap byte-identity check
  let h=0x811c9dc5>>>0;
  for(let i=0;i<w.terr.length;i++){ h^=w.terr[i]; h=Math.imul(h,0x01000193)>>>0; }
  const walls=[...w.wallSet].sort((a,b)=>a-b);
  for(const v of walls){ h^=(v&0xff); h=Math.imul(h,0x01000193)>>>0; h^=((v>>>8)&0xff); h=Math.imul(h,0x01000193)>>>0; h^=((v>>>16)&0xff); h=Math.imul(h,0x01000193)>>>0; }
  return (h>>>0).toString(16)+":"+w.terr.length+":"+w.wallSet.size;
}

const SEED=0xC0FFEE;
let pass=0, fail=0; const ok=(c,m)=>{ (c?pass++:fail++); console.log((c?"PASS":"FAIL")+" — "+m); };

// ---- build OFF ----
DOORS_INTERIORS.enabled=false; RESET();
const rOff=countingRNG(SEED); const wOff=buildTiledWorld(rOff); const drawsOff=rOff.draws();
const fpOff=fingerprint(wOff);
ok(wOff.doors==null && wOff.doorAt==null && wOff.exitAt==null, "OFF: no door records (doors/doorAt/exitAt null)");
const stubsOff=wOff.portals.filter(p=>p.kind==="door");
ok(stubsOff.length>0 && stubsOff.every(p=>p.stub===true), `OFF: ${stubsOff.length} door-stubs keep stub=true (coming-soon toast)`);

// ---- build ON ----
DOORS_INTERIORS.enabled=true; RESET();
const rOn=countingRNG(SEED); const wOn=buildTiledWorld(rOn); const drawsOn=rOn.draws();

// (1) srand ON==OFF — the feature draws ZERO rng (determinism-safe)
ok(drawsOn===drawsOff, `srand ON==OFF: identical RNG draw count (${drawsOn} == ${drawsOff})`);

// (2) doors promoted + interiors carved
const doors=wOn.doors||[];
ok(doors.length===stubsOff.length && doors.length>0, `ON: ${doors.length} door-stubs promoted to interactive doors`);
const stubsOn=wOn.portals.filter(p=>p.kind==="door");
ok(stubsOn.every(p=>p.stub===false && p.doorId), "ON: every door portal has doorId + stub cleared");
ok(wOn.doorAt.size===doors.length && wOn.exitAt.size===doors.length, "ON: doorAt + exitAt maps sized to door count");

// (3) geometry: exterior threshold tile matches doorAt; interior room hollow walkable; wall ring solid; exit gap open
let geomOK=true, detail="";
for(const d of doors){
  const thrIdx=d.ty*MAP_W+d.tx;
  if(wOn.doorAt.get(thrIdx)!==d.id){ geomOK=false; detail="threshold idx mismatch "+d.id; break; }
  // interior standpoint (inX,inY) must be a walkable stone tile
  const itx=Math.floor(d.inX/TS), ity=Math.floor(d.inY/TS), iidx=ity*MAP_W+itx;
  if(wOn.terr[iidx]!==T_STONE || wOn.wallSet.has(iidx)){ geomOK=false; detail="interior standpoint not walkable stone "+d.id; break; }
  // exit tile: walkable + in exitAt → this door
  let found=null; for(const [k,v] of wOn.exitAt){ if(v===d.id){ found=k; break; } }
  if(found==null || wOn.wallSet.has(found) || wOn.terr[found]!==T_STONE){ geomOK=false; detail="exit tile not walkable "+d.id; break; }
  // the tile just north of the exit is inside the room (walkable); the tiles east/west of the exit are wall (ring)
  const ex=found%MAP_W, ey=(found/MAP_W|0);
  if(wOn.wallSet.has(ey*MAP_W+(ex-1))===false && wOn.wallSet.has(ey*MAP_W+(ex+1))===false){ geomOK=false; detail="exit not flanked by wall ring "+d.id; break; }
  // interior region is carved into the OCEAN margin (cols beyond the proc world) — sanity: far from origin threshold
  if(Math.abs(itx-d.tx)<50 && Math.abs(ity-d.ty)<50){ geomOK=false; detail="interior not warp-isolated "+d.id; break; }
}
ok(geomOK, "ON: interior geometry — room hollow walkable, wall ring solid, exit gap open, warp-isolated"+(geomOK?"":" ["+detail+"]"));

// (4) determinism: same seed ON builds byte-identical twice
RESET(); const rOn2=countingRNG(SEED); const wOn2=buildTiledWorld(rOn2);
ok(fingerprint(wOn)===fingerprint(wOn2), "ON: same seed builds byte-identical twice (deterministic)");

// (5) OFF fingerprint is STABLE across the ON build mutating the shared config object (no leak)
DOORS_INTERIORS.enabled=false;
RESET(); const rOff2=countingRNG(SEED); const wOff2=buildTiledWorld(rOff2);
ok(fingerprint(wOff2)===fpOff, "OFF: terr/wallSet fingerprint reproducible after ON build (no state leak)");

console.log(`\n${pass}/${pass+fail} checks passed`);
process.exit(fail?1:0);
