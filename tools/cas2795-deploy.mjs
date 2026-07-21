// cas2795-deploy.mjs — LIVE FLIP EVO#136 CO_STRIKE_SURGE false→true (Cónclave ⋈,
// 78º flag). CAS-2792 DARK build @5ac961e (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2794 PASS 21/21 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 64-census sole-false=CO_STRIKE, CRUX ⊥ ALL priors incl. ⊥#123 CONTEST (count vs fraction cov/P)
// AND ⊥#124 PILE (players-engaged vs mobs-per-player) AND ⊥#126 DENSITY (players vs mobs count),
// byte-neutral OFF).
// CÓNCLAVE is the 1st flag of the NEW PLAYER-COORDINATION sub-family (the MOB-POWER-RATING family
// #133 RETO / #134 CASTA / #135 BRECHA closed with its 3 distribution moments). It reads the
// STRUCTURE of the server-auth aggro-table FROM THE PLAYER SIDE. METRIC = F = number of DISTINCT
// ALIVE players in radius ENGAGED by ≥1 mob of the pack (targeted by ≥1 aggro-engaged mob) = the
// MUSTER / size of the war-host converging on the SAME fight. F∈[0,P] INTEGER by construction
// (count of players, not a fraction). Bands: F≥midMuster(2) ⇒ weight 1; F≥hiMuster(3) ⇒ weight 2.
// minMobs2 (N≥2) + minPlayers2 (P≥2); P<2 ⇒ 0 (clean single-player collapse — intrinsically
// multiplayer, literally CANNOT fire solo). 🔑 SNAPSHOT/PURE (NO ring-buffer, like #129–#135). 🔑
// DETERMINISM (sev-1) — F = INTEGER count of distinct targeted players vs INTEGER thresholds
// {midMuster,hiMuster}; ZERO float, ZERO division in score/decision (float ONLY cosmetic for badge
// idx=F/playerCap) ⇒ 2-client 0-desync guaranteed. Badge ⋈ "Cónclave:" (channel coStrikeFind →
// h.coStrikeBounty STATELESS). The 18th composition-of-intent axis.
// CRUX (FLAGSHIP) — CÓNCLAVE = RAW MAGNITUDE on the PLAYER axis (how many allies in the fight),
// ⊥ #123 CONTEST AND ⊥ #124 PILE AND ⊥ #126 DENSITY: {2 of 2} F2/C1.0 vs {2 of 4} F2/C0.5 (SAME F,
// diff CONTEST fraction — count ⊥ fraction, exact precedent of #126 DENSITY count ⊥ fraction flags);
// {6 mobs all on 1 player} PILE-hi/F1 vs {1 mob each on 3 players} PILE-lo/F3 (OPPOSITE — PILE
// measures mobs-per-player concentration, CÓNCLAVE counts players engaged); {2 players,10 mobs} vs
// {4 players,3 mobs} DENSITY-hi/F-lo vs DENSITY-lo/F-hi (N mobs ⊥ F players). ⊥#121 SPREAD (entropy
// of mob→player distribution, shape not headcount) ⊥#125 MARGIN (top lead) ⊥#118 aggroFocus ⊥#131
// VIGOR/#132 TEMPLE (HP) ⊥#133/#134/#135 (mob power distribution) ⊥#128 MOMENTUM (snapshot, not
// trend) ⊥#129/#130 (position/geometry — reads aggro-TABLE/targeting, not coords).
//
// Config-only 1-line flip (78º flag, arc #59-#136). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #135 (876e25989358) which does NOT
// carry the #136 CO_STRIKE DARK seams (they landed in the #136 DARK build 5ac961e, NOT deployed)
// — so config.js diverges by the flip line + #136 config, and sim.js/render.js/game.js diverge by
// the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #135 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2795 LIVE flip sim/config.js CO_STRIKE_SURGE enabled:false→true — 78º flag LIVE (Cónclave ⋈) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#136).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
