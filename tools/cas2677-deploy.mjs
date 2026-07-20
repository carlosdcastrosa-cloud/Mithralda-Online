// cas2677-deploy.mjs — LIVE FLIP EVO#114 DEPTH_SURGE false→true (Remate de Fondo,
// 56º flag). CAS-2675 DARK build @fd85ebd (CEO Gate 1/2 + DARK QA CAS-2676 PASS 9/9,
// 0 commits + CEO Gate 2/2 ALL PASS). selfverify cas2675-depth-selfverify PASS 18/18,
// 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.depthBounty — eje
// FRESCO ESTRUCTURAL/GEOMÉTRICO RADIAL PROFUNDIDAD / DISPERSIÓN DE DISTANCIAS-AL-HÉROE.
// depthField = CV = stddev/media de las distancias d_i=|e−h| de los mobs VIVOS en
// radius300 ≥minMobs3 (MISMA fuente POSICIÓN que #108 FLANK / #113 ENCIRCLE, pero
// MAGNITUD RADIAL en vez de ÁNGULO, NO e.vx/e.vy inertes), bands ≥hiCV0.50⇒2/
// ≥midCV0.25⇒1/<0.25⇒0, canal FRESCO depthFind→h.depthBounty, badge "Fondo".
// INTENSIVO/ADIMENSIONAL (invariante conteo Y escala absoluta). ⊥#107 DISPERSE
// (spread-CENTROIDE px ⊥ CV-HÉROE adim) / ⊥#109 COLUMN (forma hero-agnóstica) /
// ⊥#113 ENCIRCLE·#108·#110 (ANGULAR, DEPTH radial) / ⊥#112·#111 (cinético; DEPTH
// posicional) / ⊥#87 conteo — ⊥all 55 live flags #59-#113.
//
// Config-only 1-line flip (56º flag, arc #59-#114). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build fd85ebd touched exactly these
// code files (DEPTH seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#113 ENCIRCLE 666986da9605) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #113 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2677 LIVE flip sim/config.js DEPTH_SURGE enabled:false→true — 56º flag LIVE (Remate de Fondo) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#114).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
