// cas2682-deploy.mjs — LIVE FLIP EVO#115 SIZECLASS_SURGE false→true (Remate de Talla
// Dispar, 57º flag). CAS-2680 DARK build @111f820 (CEO Gate 1/2 + DARK QA CAS-2681 PASS
// 18/18, 0 commits + CEO Gate 2/2). selfverify cas2680-sizeclass-selfverify PASS 18/18,
// 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.sizeClassBounty — eje
// FRESCO DE ATRIBUTO / DISPERSIÓN DE TALLA-CLASE (size-class / mole física BASE del TIPO).
// sizeClassField = CV = stddev/media de las TALLAS s_i = ETPL[e.type].size de los mobs
// VIVOS en radius300 ≥minMobs3 (MISMA fuente ESTÁTICA que #88 BULK, la mole BASE del
// TIPO — NO e.tpl.size afijo, NO e.hp dinámico, NO e.vx/e.vy inertes), bands ≥hiCV0.35⇒2/
// ≥midCV0.15⇒1/<0.15⇒0, canal FRESCO sizeClassFind→h.sizeClassBounty, badge "Talla".
// INTENSIVO/ADIMENSIONAL (invariante conteo Y escala absoluta de la talla). ⊥#88 BULK
// (talla-de-UNA-víctima MAX ⊥ CV-del-PACK 2º momento) / ⊥#106 MOTLEY (IDENTIDAD e.type ⊥
// MAGNITUD talla) / ⊥#114 DEPTH (CV de DISTANCIAS, posición ⊥ atributo) / ⊥#107·#111·#110
// (kinético/px) / ⊥#87 conteo — ⊥all 56 live flags #59-#114.
//
// Config-only 1-line flip (57º flag, arc #59-#115). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 111f820 touched exactly these
// code files (SIZECLASS seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#114 DEPTH f9aa47be9af3) lacks them, so all 4 diverge and must be overlaid
// from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #114 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2682 LIVE flip sim/config.js SIZECLASS_SURGE enabled:false→true — 57º flag LIVE (Remate de Talla Dispar) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#115).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
