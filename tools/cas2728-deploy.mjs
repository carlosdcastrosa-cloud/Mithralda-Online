// cas2728-deploy.mjs — LIVE FLIP EVO#125 AGGRO_MARGIN_SURGE false→true (Ventaja ⪢,
// 67º flag). CAS-2726 DARK build @9421415 (CEO Gate 1/2 byteverify + DARK QA CAS-2727
// PASS 20/20, fp 15920977, 0-desync 2-client A==B, single-player collapse, 53-census,
// ⊥#124 crux LUT, byte-neutral OFF, CEO Gate 2/2 PASSED). VENTAJA adds the
// DOMINANCE-GAP/LEAD dimension to the composition-of-intent family (#118 AGGRO-FOCUS =
// fraction on the HERO; #120 STRIKE-COMMIT = combat sub-state; #121 TARGET-SPREAD =
// Shannon-entropy UNIFORMITY of the whole distribution; #122 AGGRO-SWITCH = TEMPORAL
// churn; #123 AGGRO-CONTEST = COVERAGE/BREADTH; #124 APILAMIENTO = max-share/PEAK of the
// max bucket). VENTAJA measures the SEPARATION/runaway-lead of the most-piled player over
// the SECOND: aggroMarginField = M∈[0,1] = (top − second) / N, top=max #ENGAGED mobs on
// one player, second=2nd-largest of those counts, N=#ENGAGED mobs in radius. M≈1 ⇒ one
// player hoards all aggro with a huge lead (runaway leader); M≈0 ⇒ peak is TIED with the
// second (co-dominance, no runaway) even if the absolute peak is high. minMobs3 (engaged,
// significance denominator N), minPlayers2. 🔑 INTRINSICALLY MULTIPLAYER: single-player ⇒
// P_players=1 ⇒ lead trivially over the ONE hero ⇒ collapses to 0 (clean). SNAPSHOT PURO —
// reads the shared aggro-table directly, NO temporal buffer (like #121/#123/#124).
// Server-auth aggregate, TRANSIENT channel aggroMarginFind → h.aggroMarginBounty STATELESS
// (out of save + worldFingerprint) badge ⪢ "Ventaja". 🔑 CRUX ⊥#124 APILAMIENTO (the
// SIBLING): PILE=max/N (absolute PEAK); MARGIN=(max−second)/N (LEAD over the second) — same
// peak, different margin ⇒ DISSOCIATE. ⊥#121 (uniformity) ⊥#123 (breadth) ⊥#118 (level over
// hero, identity-blind) ⊥#87 (count-invariant fraction).
//
// Config-only 1-line flip (67º flag, arc #59-#125). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #124 (f332e84bf145) which does
// NOT carry the AGGRO_MARGIN DARK seams (they landed in the #125 DARK build 9421415, which
// was NOT deployed) — so config.js diverges by the flip line + #125 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph; logic.js/version.js diverge too but are NOT in
// that graph so preflight ignores them). version.json is stamped with a FRESH build hash by
// deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the stale
// #124 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2728 LIVE flip sim/config.js AGGRO_MARGIN_SURGE enabled:false→true — 67º flag LIVE (Ventaja ⪢) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#125).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
