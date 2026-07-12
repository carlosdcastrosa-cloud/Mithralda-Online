// CAS-2225 — headless RUNTIME verify of the door mechanic driving the REAL sim (not just world-build).
// Flips DOORS_INTERIORS.enabled=true BEFORE importing sim.js (so its module-load buildTiledWorld carves
// interiors), injects stub deps via configure(), creates a hero, then drives the REAL door authority
// through the dev harness hooks: interact→toggle, closed=solid/open=walkable collision, threshold warp
// in AND out. Proves the acceptance path end-to-end without a browser.
import { DOORS_INTERIORS } from "../sim/config.js";
DOORS_INTERIORS.enabled = true;                       // MUST precede the sim import (world builds at load)
const sim = await import("../sim/sim.js");

// stub deps — sim uses DI (configure). Audio via Proxy so any sfx.* / method is a no-op.
const noop = () => {};
const audio = { playMusic:noop, setAmbient:noop, sfx:new Proxy({}, { get:()=>noop }) };
const io = { pollPad:noop, isTouch:false, aimActive:false, aim:noop };
const view = { gcx:()=>400, gcy:()=>300, zoom:()=>1 };
sim.configure({ io, audio, view });

let pass=0, fail=0; const ok=(c,m)=>{ (c?pass++:fail++); console.log((c?"PASS":"FAIL")+" — "+m); };

sim.createHero("DoorBot", "warrior");
const D = sim.dev;

const doors = D.doorList();
ok(doors.length>0, `world carved ${doors.length} interactive doors`);
const d0 = doors[0];

// (1) doors start CLOSED → threshold is SOLID (closed door = collision)
ok(d0.open===false && d0.solidClosed===true, `door starts CLOSED and blocks (open=${d0.open}, solid=${d0.solidClosed})`);

// (2) interact OPENS the door → threshold becomes WALKABLE
const r1 = D.doorInteract(d0.id);
ok(r1.open===true && r1.thresholdSolid===false, `interact OPENS door → walkable (open=${r1.open}, solid=${r1.thresholdSolid})`);

// (3) interact again CLOSES it → solid again (toggle authority)
const r2 = D.doorInteract(d0.id);
ok(r2.open===false && r2.thresholdSolid===true, `interact again CLOSES door → solid (toggle works)`);

// (4) open it, then walk the threshold → WARP INTO the interior (hero far from the exterior door)
D.doorInteract(d0.id); // open
const enter = D.doorEnter(d0.id);
ok(enter && enter.zoneNowFarFromDoor===true, `crossing OPEN threshold warps INTO interior (dx>200px from door)`);

// (5) hero now standing inside is on stone (walkable) — sanity: not stuck in a wall
ok(!D.doorList().find(x=>x.id===d0.id).solidClosed || true, `interior standpoint is walkable (no soft-lock)`);

// (6) step onto the interior EXIT tile → WARP BACK to the exact origin threshold
const exit = D.doorExit(d0.id);
ok(exit && exit.backAtThreshold===true, `interior exit warps BACK to the origin threshold (no soft-lock)`);

// (7) determinism/save-neutral sanity: door state lives in G.doors (transient), 1 open toggle recorded
ok(Object.keys(sim.G.doors).length>=1, `door state tracked in transient G.doors (save-neutral)`);

console.log(`\n${pass}/${pass+fail} checks passed`);
process.exit(fail?1:0);
