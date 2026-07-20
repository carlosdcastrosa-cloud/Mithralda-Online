// cas2700-deploy.mjs — LIVE FLIP EVO#119 JERK_DIR_SURGE false→true (Quiebre/Regate,
// 61º flag). CAS-2698 DARK build @ef4f5f4 (CEO Gate 1/2 + DARK QA CAS-2699 PASS 19/19,
// fp 15920977, 0-desync 2-client, byte-neutral OFF + CEO Gate 2/2 PASSED). JERK_DIR
// COMPLETES the 2nd-order KINEMATIC family opened by #117 ACCEL: it SPLITS the accel
// vector Δmᵢ into its RADIAL (change of SPEED) vs TANGENTIAL (change of DIRECTION)
// components and isolates the TANGENTIAL FRACTION. jerkDirField = J = Σtangᵢ/Σ|Δmᵢ| ∈
// [0,1] over the LIVE MOVING pack in radius (mᵢ = speedIntent×headingIntent, SAME
// server-auth source as #117, NOT e.vx/vy), minMobs3, minMeanDelta6 anti-drift floor,
// band ≥hiDir0.67⇒2 (WEAVE/coordinated juke) / ≥midDir0.34⇒1 (partial juke) / <0.34⇒0
// (radial/straight-line churn). J=cos(Δψ/2) INVARIANT to a uniform speed scale ⇒ ⊥
// frost-slow #85. ⊥#117 ACCEL: ACCEL = |Δm| MAGNITUDE, JERK = tang/|Δm| FRACTION (the
// ratio, not the magnitude — 4-quad: reverse-180° accel2/jerk0, jitter-20° accel0/jerk2).
// 2nd-order NEEDS per-tick history: jerkTick per-mob TRANSIENT e._jrkPm (enemies never
// serialized, not in fp) GATED on enabled ⇒ OFF is byte-neutral. Fresh channel
// jerkDirFind→h.jerkDirBounty STATELESS badge ∿ "Regate".
//
// Config-only 1-line flip (61º flag, arc #59-#119). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build ef4f5f4 touched exactly these
// code files (JERK_DIR seams in game.js/render.js/sim.js + flag block in config.js) and
// the gh-pages base (#118 AGGRO_FOCUS 2605e94159e4) lacks them, so all 4 diverge and must
// be overlaid from HEAD. (logic.js/version.js diverge too but are NOT in the MODS runtime
// graph — not shipped to gh-pages — so the preflight ignores them.) version.json is stamped
// with a FRESH build hash by deploy-lib's computeBuild (recomputes over base∪overlay) so
// served advances off the stale #118 stamp. Master version.json is stamped SEPARATELY to
// byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2700 LIVE flip sim/config.js JERK_DIR_SURGE enabled:false→true — 61º flag LIVE (Quiebre/Regate) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#119).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
