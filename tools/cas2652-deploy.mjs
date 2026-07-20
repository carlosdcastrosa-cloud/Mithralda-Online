// cas2652-deploy.mjs — LIVE FLIP EVO#109 COLUMN_SURGE false→true (Remate de Columna,
// 51º flag). CAS-2650 DARK build @2235dad (CEO Gate 1/2 PASS a7408081 + DARK QA CAS-2651
// PASS 17/17 + CEO Gate 2/2 f70c9786). selfverify cas2650-column-selfverify PASS 17/17,
// 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.columnBounty, eje FRESCO
// ELONGACIÓN/ANISOTROPÍA de la FORMA del pack VIVO — columnElong = E=1−λmin/λmax de la
// covarianza 2×2 de las POSICIONES de los mobs alrededor de SU centroide (PCA/forma,
// radius300 ≥minMobs3), bands ≥hiElong0.82⇒2/≥midElong0.55⇒1/<0.55⇒0, canal FRESCO
// columnFind→h.columnBounty, ⊥#108 flank (concentración angular hero→mob, forma⊥ángulo)/
// ⊥#107 disperse (spread radial)/⊥#87 pack-cohesion — ⊥all 50 live flags #59-#108.
//
// Config-only 1-line flip (51º flag, arc #59-#109). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 2235dad touched exactly these
// code files (COLUMN seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#108 FLANK 329b4a967c2d) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #108 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2652 LIVE flip sim/config.js COLUMN_SURGE enabled:false→true — 51º flag LIVE (Remate de Columna) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#109).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
