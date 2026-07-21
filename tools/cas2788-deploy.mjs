// cas2788-deploy.mjs — LIVE FLIP EVO#135 RANK_SPREAD_SURGE false→true (Brecha ⟡,
// 77º flag). CAS-2781/2783 DARK build @b227252 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2787 PASS 23/23 ×3, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 63-census sole-false=RANK_SPREAD, CRUX ⊥ ALL priors incl. ⊥#133 RETO AND ⊥#134 CASTA
// SIMULTANEOUSLY / ⊥#131 VIGOR / ⊥#132 TEMPLE / ⊥#127 VARIETY / ⊥#126 DENSITY, byte-neutral OFF).
// BRECHA is the 3rd flag and CLOSES the MOB-POWER-RATING sub-family (opened by #133 RETO=mean,
// #134 CASTA=fraction). It reuses the SAME server-auth mobTierRank ladder (boss/capstone=4 >
// champion/champElite=3 > elite=2 > affix=1 > normal=0) but as RANGE/DISPERSION. METRIC = R =
// maxRank − minRank over alive engaged mobs = how SEPARATED the pack's power tiers are (mixed-threat
// composition: an apex escorted by filler). R∈[0,4] INTEGER. Bands: R≥midSpread(2) ⇒ weight 1;
// R≥hiSpread(3) ⇒ weight 2. minMobs3 (N≥3) + minPlayers2 (P≥2); P<2 ⇒ 0 (clean single-player
// collapse — intrinsically multiplayer). 🔑 SNAPSHOT/PURE (NO ring-buffer, like #129–#134). 🔑
// DETERMINISM (sev-1) — the CLEANEST of the arc: R = maxRank − minRank is INTEGER SUBTRACTION of
// two INTEGER ranks; band thresholds {2,3} are INTEGER; ZERO float, ZERO division in score/decision
// ⇒ 2-client 0-desync guaranteed. Badge ⟡ "Brecha:" (channel rankSpreadFind → h.rankSpreadBounty
// STATELESS). The 17th composition-of-intent axis.
// CRUX (FLAGSHIP) — BRECHA ⊥ #133 RETO AND ⊥ #134 CASTA SIMULTANEOUSLY: {4,2,0} vs {3,3,0} ⇒
// IDENTICAL RETO mean (2) AND IDENTICAL CASTA elite-fraction (2/3), but SPREAD R=4 vs R=3 — same
// magnitude, same fraction, DIFFERENT dispersion. Also {4,0,0} (R=4,w2) vs {2,2,2} (R=0,w0): RETO
// mean 1.33 vs 2, CASTA 1/3 vs 3/3, SPREAD max vs zero — all THREE axes disagree. ⊥#127 VARIETY
// (type mix, blind to power ladder) ⊥#126 DENSITY (count, invariant to composition: {4,0} vs
// {4,0,0,0} SAME R=4) ⊥#131 VIGOR / ⊥#132 TEMPLE (HP state, not rank) ⊥#129/#130 (position)
// ⊥#128 MOMENTUM (snapshot, not trend) ⊥#91 ZONE-TIER (per-mob pack rank, not area tier)
// ⊥#73 APEX (one-apex proximity bool; BRECHA = intra-pack range).
//
// Config-only 1-line flip (77º flag, arc #59-#135). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #134 (1b6b45728268) which does NOT
// carry the #135 RANK_SPREAD DARK seams (they landed in the #135 DARK build b227252, NOT deployed)
// — so config.js diverges by the flip line + #135 config, and sim.js/render.js/game.js diverge by
// the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #134 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2788 LIVE flip sim/config.js RANK_SPREAD_SURGE enabled:false→true — 77º flag LIVE (Brecha ⟡) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#135).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
