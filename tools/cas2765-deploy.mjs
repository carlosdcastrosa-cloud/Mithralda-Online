// cas2765-deploy.mjs — LIVE FLIP EVO#132 PARTY_VITAL_SURGE false→true (Temple ✚,
// 74º flag). CAS-2763 DARK build @3f91e84 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2764 PASS 21/21 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 60-census sole-false=PARTY_VITAL, CRUX ⊥ ALL priors incl. ⊥#131 VIGOR, byte-neutral OFF).
// TEMPLE closes the HP-STATE sub-family with the ALLY side — how much fight the engaged
// PLAYER PARTY has LEFT (remaining HP), the ONE thing no prior flag (#59-#131) reads. #131 VIGOR
// read the ENEMY pack's remaining HP; TEMPLE reads the ALLIED party's. METRIC = W∈[0,1] = mean
// HP-fraction of alive engaged players in radius; per player hpFrac=hp/hpMax; W=mean(hpFrac) over
// the P players. Fresh party ⇒ W≈1 (commit/press); battered ⇒ W≈0 (retreat/clutch). Bands:
// midVital W≥0.5 ⇒ weight 1; hiVital W≥0.75 ⇒ weight 2. minMobs3 + minPlayers2. 🔑 SNAPSHOT/PURE
// (NO ring-buffer, like #129/#130/#131). 🔑 DETERMINISM (sev-1): hp/hpMax are INTEGERS ⇒ HP-level
// QUANTIZED to integer levels (vitBins 64) via INTEGER comparison hp·Q ≥ L·hpMax; band by INTEGER
// sum comparison ⇒ 0 float division in the score/decision ⇒ 2-client byte-identical. 🔑
// INTRINSICALLY MULTIPLAYER: single-player / P<2 ⇒ W=0 (clean collapse). Badge ✚ "Temple:"
// (channel partyVitalFind → h.partyVitalBounty STATELESS). The 14th composition-of-intent axis,
// 2nd HP-STATE = ALLY side ("can the party sustain — press or retreat", core engage/disengage
// MMORPG signal). CRUX: ALLY-HP-STATE ⊥ #131 VIGOR (MOB-HP-STATE — same fight, OPPOSITE subject:
// player HP vs enemy HP) ⊥ #130 PRESSURE (radial) & #129 SURROUND (angular) — BLIND to position
// ⊥ #126 DENSITY (mean-normalized, P/N-invariant) ⊥ #127 VARIETY (blind to mob type) ⊥ #128
// MOMENTUM/#122 SWITCH (snapshot, not a trend) ⊥ aggro-table (blind to who holds aggro).
//
// Config-only 1-line flip (74º flag, arc #59-#132). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #131 (a05466f6d03e) which does NOT
// carry the PARTY_VITAL DARK seams (they landed in the #132 DARK build 3f91e84, NOT deployed) —
// so config.js diverges by the flip line + #132 config, and sim.js/render.js/game.js diverge by
// the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #131 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2765 LIVE flip sim/config.js PARTY_VITAL_SURGE enabled:false→true — 74º flag LIVE (Temple ✚) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#132).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
