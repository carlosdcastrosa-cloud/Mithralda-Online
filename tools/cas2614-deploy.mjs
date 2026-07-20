// cas2614-deploy.mjs — LIVE FLIP EVO#102 GEARCHANCE_SURGE false→true (CAS-2614 / CAS-2611 build;
// CEO Gate 1/2 PASS selfverify 22/22 @9e7563e + DARK QA CAS-2612 INDEP PASS 15/15 @9e7563e
// (2-client 0-desync fp 15920977, terrHash 2105484439, byte-neutral OFF, STATELESS,
// gearWeight=band ETPL[type].gearChance BASE — probabilidad de soltar equipo — LUT edges
// 0.30/0.29·0.22/0.21, ⊥override reads BASE gearChance, ⊥#72 SCARCITY proven, ⊥all 43 live
// flags) + CEO Gate 2/2 verified. Config-only 1-line flip (44º flag, arc #59-#102).
// Overlay = the canonical 4-file MODS set (game.js/render.js/config.js/sim.js) — the DARK
// build 9e7563e touched exactly these code files (GEARCHANCE seams in game.js/render.js/
// sim.js, flag block in config.js), all covered. The intervening commit 2181f60 is
// QA-harness/screenshots only (0 game-logic). version.json is stamped with a FRESH build
// hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the
// stale #101 stamp fed1aac601f6. Master version.json is stamped SEPARATELY after this runs.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2614 LIVE FLIP EVO#102 GEARCHANCE_SURGE.enabled false→true (Remate de Pertrecho) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
