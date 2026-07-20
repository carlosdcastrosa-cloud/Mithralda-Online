// cas2696-deploy.mjs — LIVE FLIP EVO#118 AGGRO_FOCUS_SURGE false→true (Remate de
// Acoso / Fijación, 60º flag). CAS-2693 DARK build @181a896 (CEO Gate 1/2 + DARK QA
// CAS-2694/CAS-2695 PASS 19/19, fp 15920977, 0-desync 2-client, byte-neutral OFF +
// CEO Gate 2/2 PASSED). AGGRO_FOCUS OPENS a NEW family — COMPOSITION-OF-INTENT: not
// how the pack MOVES (kinematic family #110/#111/#112/#116/#117 — EXHAUSTED) but what
// it's TRYING to do. focusField = F = (# LIVE mobs in radius whose server-auth AI state
// is aggro-locked {chase,windup,strike,recover,shield}) / (# LIVE mobs in radius) ∈[0,1],
// minMobs3, band ≥hiFocus0.67⇒2 (locked/coordinated harass) / ≥midFocus0.34⇒1 (partial)
// / <0.34⇒0 (dispersed/wandering). Dimensionless/intensive, count-invariant, server-auth
// SNAPSHOT (no per-tick history, ⊥#117 ACCEL) ⇒ 0 new state, OFF is byte-neutral. Fresh
// channel aggroFocusFind→h.aggroFocusBounty STATELESS badge ◎ "Fijación" (renamed off
// "Acoso" which #94 SWIFT already uses). ⊥ all 59 live flags #59-#117 (none measures the
// FRACTION of the pack LOCKED on the hero).
//
// Config-only 1-line flip (60º flag, arc #59-#118). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 181a896 touched exactly these
// code files (AGGRO_FOCUS seams in game.js/render.js/sim.js + flag block in config.js) and
// the gh-pages base (#117 ACCEL 48b919d17b6c) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #117 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2696 LIVE flip sim/config.js AGGRO_FOCUS_SURGE enabled:false→true — 60º flag LIVE (Remate de Acoso / Fijación) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#118).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
