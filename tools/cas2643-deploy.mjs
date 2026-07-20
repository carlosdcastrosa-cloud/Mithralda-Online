// cas2643-deploy.mjs — LIVE FLIP EVO#107 DISPERSE_SURGE false→true (Remate de Hueste
// Dispersa, 49º flag). CAS-2640 DARK build @8a22f49 (CEO Gate 1/2 PASS + DARK QA
// CAS-2641 selfverify 17/17, 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS
// h.disperseBounty, eje FRESCO DISPERSIÓN ESPACIAL del pack VIVO — disperseSpread = dist
// MEDIA de los mobs VIVOS al CENTROIDE del pack, bands ≥hiSpread110⇒2/≥midSpread55⇒1/<55
// ⇒0, canal FRESCO disperseFind→h.disperseBounty, ⊥#87 pack-cohesion / ⊥#106 motley /
// ⊥#84 skirmish, ⊥all 48 live flags) + CEO Gate 2/2 PASS (0-commit re-verify).
//
// Config-only 1-line flip (49º flag, arc #59-#107). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 8a22f49 touched exactly these
// code files (DISPERSE seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#106 MOTLEY 08a2a853adb1) lacks them, so all 4 diverge and must be overlaid
// from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #106 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2643 LIVE flip sim/config.js DISPERSE_SURGE enabled:false→true — 49º flag LIVE (Remate de Hueste Dispersa) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#107).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
