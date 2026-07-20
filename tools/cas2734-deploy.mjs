// cas2734-deploy.mjs — LIVE FLIP EVO#126 AGGRO_DENSITY_SURGE false→true (Avalancha ▧,
// 68º flag). CAS-2730 DARK build @129916a (CEO Gate 1/2 byteverify + DARK QA CAS-2733
// PASS 19/19, fp 15920977, 0-desync 2-client A==B, single-player collapse, 54-census
// sole-false=AGGRO_DENSITY, LUT dissociation, byte-neutral OFF, CEO Gate 2/2 no-drift
// PASSED). AVALANCHA adds the OUTNUMBER/SWARM-PRESSURE dimension (1st MOMENT / MAGNITUDE)
// to the composition-of-intent family (#118 AGGRO-FOCUS = fraction on the HERO, a LEVEL;
// #120 STRIKE-COMMIT = combat sub-state; #121 TARGET-SPREAD = Shannon-entropy UNIFORMITY;
// #122 AGGRO-SWITCH = TEMPORAL churn; #123 AGGRO-CONTEST = COVERAGE/BREADTH; #124
// APILAMIENTO = max-share/PEAK; #125 VENTAJA = LEAD/gap top−second). AVALANCHA measures the
// AVERAGE aggro LOAD per player — how OUTNUMBERED/SWARMED the party is: aggroDensityField =
// D∈[0,1] = min(N/P, densityCap) / densityCap, N=#ALIVE ENGAGED mobs in radius, P=#ALIVE
// players in radius (incl. hero). N/P = mean load per player. D≈1 ⇒ party massively
// outnumbered (zerg/add-pressure); D≈0 ⇒ few mobs per player. minMobs3 (N≥3), minPlayers2.
// 🔑 INTRINSICALLY MULTIPLAYER: single-player / P<2 ⇒ D=0 (clean collapse). SNAPSHOT PURO —
// reads the shared aggro-table directly, NO temporal buffer (like #121/#123/#124/#125).
// Server-auth aggregate, TRANSIENT channel aggroDensityFind → h.aggroDensityBounty STATELESS
// (out of save + worldFingerprint) badge ▧ "Avalancha". 🔑 CRUX — 1st MOMENT/MAGNITUDE vs
// all NORMALIZED (scale-free) shape stats: `[1,1,1,1]` (D-load 1) vs `[6,6,6,6]` (D-load 6)
// have IDENTICAL pile-share/margin/entropy/normalized-variance (same shape) but 6× density ⇒
// reward fires on swarm MAGNITUDE not shape. ⊥#123 COVERAGE: `[8,0,0,0]` (D-load 2, 1 player)
// vs `[2,2,2,2]` (D-load 2 SAME, 4 players) — same density, opposite coverage. ⊥#122 (churn)
// ⊥#118 (hero-agnostic party aggregate) ⊥#87 (mean-load vs raw mob count per kill).
//
// Config-only 1-line flip (68º flag, arc #59-#126). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #125 (664e24117516) which does
// NOT carry the AGGRO_DENSITY DARK seams (they landed in the #126 DARK build 129916a, which
// was NOT deployed) — so config.js diverges by the flip line + #126 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph; logic.js/version.js diverge too but are NOT in
// that graph so preflight ignores them). version.json is stamped with a FRESH build hash by
// deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the stale
// #125 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2734 LIVE flip sim/config.js AGGRO_DENSITY_SURGE enabled:false→true — 68º flag LIVE (Avalancha ▧) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#126).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
