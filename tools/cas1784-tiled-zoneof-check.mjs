// CAS-1784 — DOM-free check of the FIX: buildTiledWorld (the DEFAULT world) must export
// world.caldera so zoneOf resolves "caldera" inside the rect. The build harness (cas1783)
// only exercised buildWorld — which is why the missing tiled export slipped through.
// Run: node tools/cas1784-tiled-zoneof-check.mjs
import { buildTiledWorld, zoneOf } from "../sim/world.js";
import { createRNG } from "../sim/rng.js";
import * as C from "../sim/config.js";

const TS = C.TS;
let pass = 0, fail = 0;
const ok = (name, cond, extra="") => { if (cond) pass++; else { fail++; console.log("  ✗ FAIL:", name, extra); } };
const mk = (seed)=>{ const r=createRNG(); r.seed(seed); return r; };
const saved = C.ZONE5.enabled;

// ---- ON: caldera must exist in the tiled world + zoneOf resolves it ----
C.ZONE5.enabled = true;
for (const seed of [1, 12345, 777]) {
  const w = buildTiledWorld(mk(seed));
  ok(`seed ${seed}: tiled world exports caldera rect`, !!w.caldera, JSON.stringify(w.caldera));
  if (w.caldera) {
    const c = w.caldera;
    const cx = (c.x + c.w/2)*TS, cy = (c.y + c.h/2)*TS;  // center of rect, world px
    ok(`seed ${seed}: zoneOf(center) === "caldera"`, zoneOf(w, cx, cy) === "caldera", zoneOf(w, cx, cy));
    // a point clearly outside must NOT be caldera
    ok(`seed ${seed}: zoneOf(far outside) !== "caldera"`, zoneOf(w, (c.x-10)*TS, (c.y-10)*TS) !== "caldera");
  }
}

// ---- OFF: no caldera key, so byte-safe (matches AC1) ----
C.ZONE5.enabled = false;
{
  const w = buildTiledWorld(mk(12345));
  ok(`OFF: tiled world has NO caldera key`, !("caldera" in w) || w.caldera == null, String(w.caldera));
}

C.ZONE5.enabled = saved;
console.log(`\nCAS-1784 tiled zoneOf check: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
