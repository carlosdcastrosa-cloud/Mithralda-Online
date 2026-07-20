// cas2740-deploy.mjs — LIVE FLIP EVO#127 AGGRO_VARIETY_SURGE false→true (Mezcla ⁘,
// 69º flag). CAS-2736 DARK build @fd57515 (CEO Gate 1/2 byteverify + DARK QA CAS-2739
// PASS 19/19, fp 15920977, 0-desync 2-client A==B, single-player collapse, 55-census
// sole-false=AGGRO_VARIETY, LUT dissociation, byte-neutral OFF, CEO Gate 2/2 no-drift
// PASSED). MEZCLA adds the THREAT-HETEROGENEITY / MIXED-PULL dimension (the composition
// of the ENGAGED swarm ITSELF, on the MOBS side) to the composition-of-intent family:
// the 8 prior flags (#118 AGGRO-FOCUS = fraction on the HERO; #121 TARGET-SPREAD =
// Shannon-entropy UNIFORMITY; #122 AGGRO-SWITCH = TEMPORAL churn; #123 AGGRO-CONTEST =
// COVERAGE/BREADTH; #124 APILAMIENTO = max-share/PEAK; #125 VENTAJA = LEAD/gap; #126
// AVALANCHA = mean-load/MAGNITUDE) all measure how aggro distributes over the PLAYERS
// (targets). MEZCLA measures how HETEROGENEOUS the ENGAGED mob-pack is — a monotype zerg
// vs a mixed pull (melee+ranged+caster / distinct families). METRIC = V∈[0,1] = normalized
// richness of DISTINCT MOB ARCHETYPES among the ALIVE aggro-ENGAGED mobs in radius (engaged
// with ANY player in radius — the party's SHARED threat). V=(K−1)/(varietyCap−1), K=# of
// distinct mob types/families (key = e.type, ETPL index — server-authoritative & replicated,
// the SAME static source as #88 BULK / #79 SIZECLASS). Bands on RAW K: midVariety K≥2 ⇒
// weight 1; hiVariety K≥3 ⇒ weight 2. minMobs3 (N≥3) + minPlayers2 (P≥2). 🔑 INTRINSICALLY
// MULTIPLAYER: single-player / P<2 ⇒ V=0 (clean collapse — the party's SHARED mixed-pull is
// the signal). SNAPSHOT PURO — reads the shared aggro-table + the mob type/family field
// directly, NO temporal buffer (like #121/#123/#124/#125/#126). Server-auth aggregate,
// TRANSIENT channel aggroVarietyFind → h.aggroVarietyBounty STATELESS (out of save +
// worldFingerprint) badge ⁘ "Mezcla". 🔑 CRUX — VARIETY lives on the MOB-TYPE axis, ALL
// priors are distribution-over-PLAYERS: ⊥#126 DENSITY (magnitude): [melee×6] (N=6, K=1 ⇒
// V=0) vs [melee×2,ranged×2,caster×2] (N=6 SAME, K=3 ⇒ V=hi) — SAME density, opposite
// variety; and density/variety anti-move. ⊥#121 SPREAD / #124 PILE / #125 MARGIN / #123
// CONTEST (shape/coverage of the over-PLAYERS split): [6 mobs of 3 types ALL piled on
// player1] (V=hi, pile=1/contest=1) vs [6 mobs of 1 type spread over 4 players] (V=0,
// spread=hi/contest=4) — orthogonal. ⊥#122 SWITCH (V is snapshot ⊥ temporal churn). ⊥#118
// FOCUS (V is a party aggregate over the SHARED pack, hero-agnostic).
//
// Config-only 1-line flip (69º flag, arc #59-#127). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #126 (b04ec1eb79d6) which does
// NOT carry the AGGRO_VARIETY DARK seams (they landed in the #127 DARK build fd57515, which
// was NOT deployed) — so config.js diverges by the flip line + #127 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph; logic.js/version.js diverge too but are NOT in
// that graph so preflight ignores them). version.json is stamped with a FRESH build hash by
// deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the stale
// #126 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2740 LIVE flip sim/config.js AGGRO_VARIETY_SURGE enabled:false→true — 69º flag LIVE (Mezcla ⁘) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#127).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
