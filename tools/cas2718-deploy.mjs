// cas2718-deploy.mjs — LIVE FLIP EVO#123 AGGRO_CONTEST_SURGE false→true (Cobertura ⇉,
// 65º flag). CAS-2716 DARK build @e831714 (CEO Gate 1/2 + DARK QA, fp 15920977,
// 0-desync 2-client, SNAPSHOT PURO sin buffer temporal, byte-neutral OFF, CEO Gate 2/2 PASSED).
// AGGRO_CONTEST ADDS the COVERAGE/BREADTH dimension to the composition-of-intent family
// (#118 AGGRO-FOCUS = fraction on the HERO, a LEVEL; #120 STRIKE-COMMIT = combat sub-state;
// #121 TARGET-SPREAD = Shannon-entropy UNIFORMITY within the already-targeted set;
// #122 AGGRO-SWITCH = TEMPORAL churn of target identity). COBERTURA measures how MANY
// DISTINCT players the ENGAGED pack is targeting AT ALL (the BREADTH of the targeted set),
// indifferent to reparto/pile: aggroContestField = C∈[0,1] = (#alive players in radius
// targeted by ≥1 ENGAGED mob) / (#alive players in radius). Each covered player counts ONCE
// (boolean breadth, NOT weighted). minMobs3 (engaged, significance denominator), minPlayers2.
// 🔑 INTRINSICALLY MULTIPLAYER: single-player ⇒ P=1 ⇒ only the hero can be covered ⇒
// C∈{0,1} trivial ⇒ minPlayers2 guard collapses it to 0 (clean). SNAPSHOT PURO — reads the
// shared aggro-table directly, NO temporal buffer (simpler/safer than #122). Server-auth
// aggregate, TRANSIENT channel aggroContestFind → h.aggroContestBounty STATELESS (out of save
// + worldFingerprint) badge ⇉ "Cobertura". ⊥#121 (uniformity within) ⊥#122 (temporal churn)
// ⊥#118 (level over hero) ⊥#120 (sub-state) ⊥#87 (count-invariant fraction).
//
// Config-only 1-line flip (65º flag, arc #59-#123). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #122 (6697409ed3ae) which does
// NOT carry the AGGRO_CONTEST DARK seams (they landed in the #123 DARK build e831714, which
// was NOT deployed) — so config.js diverges by the flip line and sim.js/render.js/game.js
// diverge by the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the
// MODS runtime graph; logic.js/version.js diverge too but are NOT in that graph so preflight
// ignores them). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #122 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2718 LIVE flip sim/config.js AGGRO_CONTEST_SURGE enabled:false→true — 65º flag LIVE (Cobertura ⇉) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#123).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
