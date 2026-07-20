// cas2704-deploy.mjs — LIVE FLIP EVO#120 STRIKE_COMMIT_SURGE false→true (Embate,
// 62º flag). CAS-2702 DARK build @9920064 (CEO Gate 1/2 + DARK QA CAS-2703 PASS 18/18,
// fp 15920977, 0-desync 2-client, byte-neutral OFF, CEO Gate 2/2 PASSED). STRIKE_COMMIT
// DEEPENS the composition-of-intent family opened by #118 AGGRO-FOCUS: it sub-partitions
// the ENGAGED pack by combat sub-state and isolates the COMMITTED fraction {windup|strike}
// over the ENGAGED denominator. strikeCommitField = SC = |{windup|strike}|/|{aggro-ENGAGED}|
// ∈[0,1] (reuses #118 aggroEngaged() for the denominator, numerator = committed
// {windup,strike}). SNAPSHOT PURO (reads e.state directly, like #118 — NO per-tick history,
// NO update gate), minMobs3 over ENGAGED, band hi0.67/mid0.34. ⊥#118 AGGRO-FOCUS: DISTINCT
// DENOMINATORS (focus = engaged/ALIVE ⊥ SC = committed/ENGAGED) ⇒ dissociate in the ratio:
// all-chase⇒focus2/SC0 · all-strike⇒focus2/SC2 · 3strike+3idle⇒focus1/SC2. ⊥#119 JERK
// (still-striking⇒SC2/jerk0). Fresh channel strikeCommitFind→h.strikeCommitBounty STATELESS
// badge ↯ "Embate".
//
// Config-only 1-line flip (62º flag, arc #59-#120). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build 9920064 touched exactly these code
// files (STRIKE_COMMIT seams in game.js/render.js/sim.js + flag block in config.js) and the
// gh-pages base (#119 JERK_DIR e0f65ada9e43) lacks them, so all 4 diverge and must be
// overlaid from HEAD. (logic.js/version.js diverge too but are NOT in the MODS runtime graph
// — not shipped to gh-pages — so the preflight ignores them.) version.json is stamped with a
// FRESH build hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #119 stamp. Master version.json is stamped SEPARATELY to byte-match
// the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2704 LIVE flip sim/config.js STRIKE_COMMIT_SURGE enabled:false→true — 62º flag LIVE (Embate) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#120).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
