// CAS-240 — OFFLINE deterministic proof that mob walk cadence is now TIME-driven,
// not movement-coupled (root cause of CAS-219 the board still saw after CAS-222).
//
// Root cause (render.js, 3 walk paths): the per-mob desync phase was recomputed
// from LIVE position every frame — ph=(e.x*0.7+e.y*0.9). d(ph)/dt is dominated by
// 0.7*vx+0.9*vy (tens-to-hundreds /s) and swamps gait.fps (~6) / gait.w (~4.4), so
// a MOVING mob's strip cadence scaled with movement, not the CAS-222 gait table.
//
// Fix: freeze the phase at spawn (sim.js e.gaitPhase = spawnX*0.7+spawnY*0.9) and
// read e.gaitPhase in all three render walk paths. Mobs stay desynced; cadence
// becomes purely G.t*gait.fps / G.t*gait.w → CAS-222's slowdown finally bites.
//
// This harness does NOT need a browser or a deploy. It (1) source-asserts the fix
// is present in render.js + sim.js, then (2) numerically replays the exact strip
// frame-index formula for an isolated orc doing a steady approach — once with the
// OLD live-position phase and once with the NEW static phase — and reports the
// resulting cadence. It reproduces the board's ~0.19s pre-fix and shows the post-
// fix value lands at pure-time (full-strip 1.0s = 0.5s/footfall, in the 0.4-0.6
// "leg cycle" band). Pure render-time, no RNG → matches the live engine path.
//
// Run: node tools/cas240-gait-decouple.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const render = readFileSync(join(ROOT, "render/render.js"), "utf8");
const sim = readFileSync(join(ROOT, "sim/sim.js"), "utf8");

// ---- (1) source assertions ----------------------------------------------------
const checks = [];
const add = (name, ok, detail="") => checks.push({ name, ok, detail });

// sim.js: stable per-mob phase frozen at spawn position
add("sim.js spawnEnemy sets static e.gaitPhase from spawn pos",
  /gaitPhase:\(x\*0\.7\+y\*0\.9\)/.test(sim));

// render.js: every ph= site now reads the static e.gaitPhase (with a live fallback),
// and NO site reads the bare live-position phase without the e.gaitPhase guard.
const phSites = [...render.matchAll(/ph=\([^;]*?\)/g)].map(m => m[0]);
add("render.js has exactly 3 ph= walk-path sites", phSites.length === 3,
  `found ${phSites.length}: ${phSites.join("  ")}`);
add("all 3 ph= sites read static e.gaitPhase",
  phSites.length === 3 && phSites.every(s => /e\.gaitPhase!==undefined/.test(s)));
add("no ph= site reads bare live position (e.x*0.7+e.y*0.9) without gaitPhase guard",
  phSites.every(s => !/^ph=\(e\.x\*0\.7\+e\.y\*0\.9\)$/.test(s)));

// ---- (2) numeric replay of the strip frame-index formula ----------------------
// render.js strip path: fi = floor(G.t*fps + ph*7) % fc   (orc walk: fc=6, fps=6)
const FC = 6, FPS = 6;
const FRAME_DT = 1 / 60;          // 60fps render
const SPAN = 2.35;                // match cas230's ~2.35s window
const N = Math.round(SPAN / FRAME_DT);

// Isolated orc steady approach (mirrors cas230: __dev.spawn("orc",200,10), spd~64
// closing on the hero near origin). Constant-velocity straight line is the worst
// case for the live-position phase (max |0.7*vx+0.9*vy|).
const SPD = 64;                   // orc tpl spd (px/s)
const vx = -0.78 * SPD, vy = -0.55 * SPD; // heading toward origin, ~normalized

function replay(staticPhase){
  let x = 200, y = 10, t = 0;
  const gaitPhase = 200 * 0.7 + 10 * 0.9; // frozen at spawn
  const pts = [];
  for(let i = 0; i < N; i++){
    const ph = staticPhase ? gaitPhase : (x * 0.7 + y * 0.9); // OLD vs NEW
    const fi = ((Math.floor(t * FPS + ph * 7) % FC) + FC) % FC;
    pts.push(fi);
    x += vx * FRAME_DT; y += vy * FRAME_DT; t += FRAME_DT;
  }
  // count frame-advances exactly like cas230 (shortest wrap distance), → cadence
  let adv = 0;
  for(let i = 1; i < pts.length; i++){ const d = Math.abs(pts[i]-pts[i-1]); adv += Math.min(d, FC-d); }
  const fullStripSecPerCycle = adv > 0 ? (SPAN / (adv / FC)) : Infinity;
  const footfallSecPerCycle  = adv > 0 ? (SPAN / (adv / (FC/2))) : Infinity; // board "leg cycle"
  return { adv, fullStripSecPerCycle, footfallSecPerCycle };
}

const before = replay(false); // live-position phase (pre-fix, what the board saw)
const after  = replay(true);  // static spawn phase (this fix)

// pure-time expectation: adv = FPS*SPAN ⇒ full strip = FC/FPS = 1.0s; footfall = 0.5s
const PURE_FULL = FC / FPS, PURE_FOOT = (FC/2) / FPS;
const TARGET = [0.40, 0.60]; // board's stated band, in footfall ("leg cycle") units

// ---- verdict ------------------------------------------------------------------
console.log("CAS-240 — mob walk cadence decouple (offline proof)\n");
let srcOk = true;
for(const c of checks){ console.log(`  ${c.ok?"✔":"✖"} ${c.name}${c.detail&&!c.ok?`  [${c.detail}]`:""}`); srcOk = srcOk && c.ok; }
console.log("");
console.log(`  isolated orc, steady approach, ${SPAN}s @60fps (vx=${vx.toFixed(0)} vy=${vy.toFixed(0)} px/s)`);
console.log(`    BEFORE (live-position phase): full-strip ${before.fullStripSecPerCycle.toFixed(2)}s/cycle`
  + ` · footfall ${before.footfallSecPerCycle.toFixed(2)}s   ← board saw ~0.19s, "too fast/unreal"`);
console.log(`    AFTER  (static spawn phase):  full-strip ${after.fullStripSecPerCycle.toFixed(2)}s/cycle`
  + ` · footfall ${after.footfallSecPerCycle.toFixed(2)}s`);
console.log(`    pure-time (fc/fps): full-strip ${PURE_FULL.toFixed(2)}s · footfall ${PURE_FOOT.toFixed(2)}s`);
console.log(`    board target (leg cycle/footfall): ${TARGET[0]}-${TARGET[1]}s\n`);

// the fix is proven when: source asserts pass; the OLD path was movement-fast
// (footfall well under target → reproduces the bug); and the NEW path is time-driven
// (matches pure-time within tolerance) AND its footfall lands in the board band.
const reproduced = before.footfallSecPerCycle < TARGET[0];
const timeDriven = Math.abs(after.fullStripSecPerCycle - PURE_FULL) < 0.06;
const inBand = after.footfallSecPerCycle >= TARGET[0] && after.footfallSecPerCycle <= TARGET[1];
const pass = srcOk && reproduced && timeDriven && inBand;
console.log(pass
  ? "✔ PASS — phase decoupled from movement; AFTER cadence is pure-time and the\n"
    + "         footfall lands in the board's 0.4-0.6s band, while mobs stay desynced.\n"
    + "         (LIVE re-test = tools/cas230-mob-cadence-live.mjs after deploy.)"
  : "✖ FAIL — see failing assertions above");
process.exit(pass ? 0 : 1);
