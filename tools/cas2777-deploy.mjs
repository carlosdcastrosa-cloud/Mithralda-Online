// cas2777-deploy.mjs — LIVE FLIP EVO#134 ELITE_SHARE_SURGE false→true (Casta ✹,
// 76º flag). CAS-2775 DARK build @e72ee7e (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2776 PASS 23/23 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 62-census sole-false=ELITE_SHARE, CRUX ⊥ ALL priors incl. ⊥#133 RETO / ⊥#131 VIGOR /
// ⊥#132 TEMPLE / ⊥#127 VARIETY / ⊥#126 DENSITY, byte-neutral OFF).
// CASTA is the 2nd flag of the MOB-POWER-RATING sub-family (opened by #133 RETO). It reuses the
// SAME server-auth mobTierRank ladder as #133 (boss/capstone=4 > champion/champElite=3 > elite=2
// > affix=1 > normal=0) but as a THRESHOLD-PROPORTION, NOT a mean. METRIC = S∈[0,1] =
// count(alive engaged mobs with mobTierRank ≥ eliteRank[2]) / N_engaged = the FRACTION of the
// engaged pack that is genuinely dangerous (majority-elite by composition). Bands: S≥midShare
// (0.5) ⇒ weight 1; S≥hiShare (0.75) ⇒ weight 2. minMobs3 (N≥3) + minPlayers2 (P≥2); P<2 ⇒ 0
// (clean single-player collapse — intrinsically multiplayer). 🔑 SNAPSHOT/PURE (NO ring-buffer,
// like #129/#130/#131/#132/#133). 🔑 DETERMINISM (sev-1): decision stays INTEGER — count(rank≥
// eliteRank) vs INTEGER thresholds ⌈k·N⌉ (share·N is exact IEEE-754 product + Math.ceil ⇒ exact
// integer); 0 float DIVISION in score/decision ⇒ 2-client byte-identical. Badge ✹ "Casta:"
// (channel eliteShareFind → h.eliteShareBounty STATELESS). The 16th composition-of-intent axis.
// CRUX — CASTA ⊥ #133 RETO (mean of tier): RETO reads mean(rank)/cap; CASTA reads the fraction
// above the elite threshold — {boss(4),normal,normal} ⇒ RETO mean 1.33 (weight 0) but share 1/3;
// {elite(2),elite(2),normal} ⇒ SAME mean 1.33 (RETO 0) but share 2/3 (weight 1) — one apex vs two
// elites = same mean, OPPOSITE share. ⊥#131 VIGOR / ⊥#132 TEMPLE (reads intrinsic rank, not HP)
// ⊥#127 VARIETY (blind to type mix) ⊥#126 DENSITY (fraction-normalized, N-invariant) ⊥#129/#130
// (blind to position) ⊥#128 MOMENTUM (snapshot, not a trend) ⊥#91 ZONE-TIER (per-mob pack rank,
// not area tier) ⊥#73 APEX (APEX = one-apex proximity bool; CASTA = FRACTION above threshold).
//
// Config-only 1-line flip (76º flag, arc #59-#134). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #133 (edf6508226ba) which does NOT
// carry the #134 ELITE_SHARE DARK seams (they landed in the #134 DARK build e72ee7e, NOT deployed)
// — so config.js diverges by the flip line + #134 config, and sim.js/render.js/game.js diverge by
// the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #133 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2777 LIVE flip sim/config.js ELITE_SHARE_SURGE enabled:false→true — 76º flag LIVE (Casta ✹) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#134).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
