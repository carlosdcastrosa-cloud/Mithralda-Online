// cas2724-deploy.mjs — LIVE FLIP EVO#124 AGGRO_PILE_SURGE false→true (Apilamiento ⧉,
// 66º flag). CAS-2720 DARK build @1118c65 (CEO Gate 1/2 + DARK QA CAS-2722 PASS 19/19,
// fp 15920977, 0-desync 2-client A==B, SNAPSHOT PURO sin buffer temporal, byte-neutral OFF,
// CEO Gate 2/2 PASSED). APILAMIENTO ADDS the DOMINANCE/PEAK dimension to the
// composition-of-intent family (#118 AGGRO-FOCUS = fraction on the HERO, a LEVEL; #120
// STRIKE-COMMIT = combat sub-state; #121 TARGET-SPREAD = Shannon-entropy UNIFORMITY of the
// whole distribution; #122 AGGRO-SWITCH = TEMPORAL churn of target identity; #123
// AGGRO-CONTEST = COVERAGE/BREADTH of how many distinct players are targeted). APILAMIENTO
// measures how TOP-HEAVY the distribution is: what FRACTION of the ENGAGED pack is PILED on
// the SINGLE most-targeted player (the PEAK/dominance of the max bucket), regardless of the
// tail shape (spread #121) or how many players are touched (contest #123):
// aggroPileField = P∈[0,1] = max_j(#ENGAGED mobs targeting j) / N, N=#ENGAGED mobs in radius.
// minMobs3 (engaged, significance denominator), minPlayers2. 🔑 INTRINSICALLY MULTIPLAYER:
// single-player ⇒ P_players=1 ⇒ all aggro trivially piles on the ONE hero ⇒ pile=1 const ⇒
// minPlayers2 guard collapses it to 0 (clean). SNAPSHOT PURO — reads the shared aggro-table
// directly, NO temporal buffer (like #121/#123). Server-auth aggregate, TRANSIENT channel
// aggroPileFind → h.aggroPileBounty STATELESS (out of save + worldFingerprint) badge ⧉
// "Apilamiento". ⊥#121 (uniformity of whole distribution) ⊥#123 (breadth/how-many-players)
// ⊥#118 (level over hero, identity-blind) ⊥#122 (temporal churn) ⊥#120 (sub-state)
// ⊥#87 (count-invariant fraction).
//
// Config-only 1-line flip (66º flag, arc #59-#124). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #123 (44fee5ef2f31) which does
// NOT carry the AGGRO_PILE DARK seams (they landed in the #124 DARK build 1118c65, which was
// NOT deployed) — so config.js diverges by the flip line and sim.js/render.js/game.js diverge
// by the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS
// runtime graph; logic.js/version.js diverge too but are NOT in that graph so preflight
// ignores them). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #123 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2724 LIVE flip sim/config.js AGGRO_PILE_SURGE enabled:false→true — 66º flag LIVE (Apilamiento ⧉) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#124).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
