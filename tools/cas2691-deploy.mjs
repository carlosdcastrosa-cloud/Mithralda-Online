// cas2691-deploy.mjs — LIVE FLIP EVO#117 ACCEL_SURGE false→true (Revuelo Cinético,
// 59º flag). CAS-2688 DARK build @5746069 (CEO Gate 1/2 + DARK QA CAS-2690 PASS 19/19,
// fp 15920977, 0-desync 2-client, byte-neutral OFF + CEO Gate 2/2 PASSED). ACCEL is the
// FIRST 2nd-ORDER kinematic axis (temporal derivative / churn of the movement field): the
// velocity 1st-order family (#110 ORIENT world-heading, #111 SPEED magnitude-CV, #112
// CONVERGE radial-projection, #116 ORBIT tangential-projection) is EXHAUSTED. accelField =
// C = media_i |Δmᵢ| / refDelta ∈[0,1], where Δmᵢ = change between ticks of the server-auth
// motion vector mᵢ = speedIntent·headingIntent (SAME AI branch as #110/#111/#112/#116 — NOT
// e.vx/e.vy inert) of the LIVE MOVING mobs in radius300 ≥minMobs3. refDelta60, band
// ≥hiChurn0.55⇒2 (revuelo/juking) / ≥midChurn0.25⇒1 (jitter) / <0.25⇒0 (~constant velocity).
// Dimensionless/intensive, count-invariant. Needs per-tick history: accelTick(dt) runs AFTER
// updateEnemies GATED on enabled → per-mob TRANSIENT e._accPm/_accD/_accHas (enemies never
// serialized ⇒ NOT in fingerprint ⇒ 0 fp change). Fresh channel accelFind→h.accelBounty
// STATELESS badge ⚡ "Revuelo". ⊥ all 58 live flags #59-#116 (none measures the DERIVATIVE
// of movement): ⊥#116 ORBIT 4-quad (carousel-const orbit2/accel0 · spin-up orbit2/accel2 ·
// march-const orbit0/accel0 · juke orbit0/accel2) / ⊥#112 CONVERGE / ⊥#111 SPEED / ⊥#67
// FRENZY (kill-rate; 0 kills) / ⊥#85 frost-slow (const-slowed accel0) / ⊥#87 count.
//
// Config-only 1-line flip (59º flag, arc #59-#117). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build 5746069 touched exactly these code
// files (ACCEL seams in game.js/render.js/sim.js: accelTick + gate + badge; flag block in
// config.js) and the gh-pages base (#116 ORBIT e7a8c60e844a) lacks them, so all 4 diverge and
// must be overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #116 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2691 LIVE flip sim/config.js ACCEL_SURGE enabled:false→true — 59º flag LIVE (Revuelo Cinético) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#117).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
