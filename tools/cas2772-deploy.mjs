// cas2772-deploy.mjs — LIVE FLIP EVO#133 MOB_TIER_SURGE false→true (Reto ⧫,
// 75º flag). CAS-2767 DARK build @8fdae78 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2771 PASS 22/22 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 61-census sole-false=MOB_TIER, CRUX ⊥ ALL priors incl. ⊥#131 VIGOR / ⊥#127 VARIETY /
// ⊥#126 DENSITY, byte-neutral OFF).
// RETO opens the MOB-POWER-RATING sub-family: the ENGAGED pack's intrinsic TIER/challenge-rating
// (mobTierRank ladder boss/capstone=4 > champion/champElite=3 > elite=2 > affix=1 > normal=0) —
// a property NO prior flag #59-#132 reads. #131 VIGOR/#132 TEMPLE read remaining HP-fraction;
// RETO reads intrinsic DESIGN power, independent of current HP. An elite pack at 20% HP (T hi,
// V lo) vs a trash pack at full HP (T lo, V hi) — opposite power, opposite HP (the crux
// dissociation). METRIC = T∈[0,1] = mean mobTierRank/tierCap of alive engaged mobs in radius.
// Bands: midTier T≥0.5 ⇒ weight 1; hiTier T≥0.75 ⇒ weight 2. minMobs3 + minPlayers2. 🔑
// SNAPSHOT/PURE (NO ring-buffer, like #129/#130/#131/#132). 🔑 DETERMINISM (sev-1): each mob's
// rank is a small INTEGER ⇒ decision stays INTEGER (Σ ranks INTEGER vs INTEGER thresholds
// k·tierCap·N/4; 0 float division in the score/decision) ⇒ 2-client byte-identical. 🔑
// INTRINSICALLY MULTIPLAYER: single-player / P<2 ⇒ T=0 (clean collapse). Badge ⧫ "Reto:"
// (channel mobTierFind → h.mobTierBounty STATELESS). The 15th composition-of-intent axis, 1st
// MOB-POWER-RATING ("is this pack a real challenge or trash", core engage risk/reward MMORPG
// signal). CRUX: MOB-POWER-RATING ⊥ #131 VIGOR (MOB-HP-STATE — HP-fraction, not tier) ⊥ #132
// TEMPLE (ally HP) ⊥ #127 VARIETY (mob type mix) ⊥ #126 DENSITY (mean-normalized, N/P-invariant)
// ⊥ #130 PRESSURE (radial) & #129 SURROUND (angular) — BLIND to position ⊥ #128 MOMENTUM/#122
// SWITCH (snapshot, not a trend) ⊥ #91 ZONE-TIER (per-mob pack rank, not area tier).
//
// Config-only 1-line flip (75º flag, arc #59-#133). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #132 (a3468f49fc9f) which does NOT
// carry the MOB_TIER DARK seams (they landed in the #133 DARK build 8fdae78, NOT deployed) — so
// config.js diverges by the flip line + #133 config, and sim.js/render.js/game.js diverge by the
// DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #132 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2772 LIVE flip sim/config.js MOB_TIER_SURGE enabled:false→true — 75º flag LIVE (Reto ⧫) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#133).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
