// cas2623-deploy.mjs — LIVE FLIP EVO#104 SPLASH_SURGE false→true (CAS-2623 / CAS-2620 build;
// CEO Gate 2/2 PASS @42723db + DARK QA CAS-2621 selfverify 21/21 (2-client 0-desync fp
// 15920977, byte-neutral OFF, STATELESS h.blastBounty, splashWeight=band ETPL[type].aoe BASE —
// radio de área/salpicadura — bands hiAoe66/midAoe60, aoe present ONLY in 4 brutes
// orc60/ironback64/magmabrute66/moose68, canal FRESCO splashFind→h.blastBounty sub-cap,
// ⊥#93 ROLE / ⊥#98 RAM / ⊥#96 TOUGH / ⊥#103 GOLD / ⊥#84 ranged proven, ⊥all 45 live flags).
// Config-only 1-line flip (46º flag, arc #59-#104). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build touched exactly these code files
// (SPLASH seams in game.js/render.js/sim.js, flag block in config.js). version.json is stamped
// with a FRESH build hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #103 stamp 3348f9ede902. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2623 LIVE FLIP EVO#104 SPLASH_SURGE.enabled false→true (Remate de Estallido) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
