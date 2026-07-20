// cas2667-deploy.mjs — LIVE FLIP EVO#112 CONVERGE_SURGE false→true (Remate de
// Embestida Convergente, 54º flag). CAS-2665 DARK build @ac86989 (CEO Gate 1/2 + DARK
// QA PASS 17/17 + CEO Gate 2/2). selfverify cas2665-converge-selfverify PASS 17/17,
// 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.convergeBounty — eje
// FRESCO CINÉTICO/SIGNADO CONVERGENCIA RADIAL — convergeField = C = (Σvᵢ·cosθᵢ)/(Σvᵢ)
// media ponderada por velocidad del coseno radial hacia el héroe (speedIntent server-
// auth × cos(headingIntent · mob→hero), MISMA rama de IA que #90/#110/#111, NO e.vx/vy
// inertes) de los mobs VIVOS EN MOVIMIENTO en radius300 ≥minMobs3, bands ≥hiConverge0.55
// ⇒2/≥midConverge0.25⇒1/<0.25⇒0, canal FRESCO convergeFind→h.convergeBounty, label
// "Cierre". ⊥#90 HEADING (MAX de 1 víctima/1er momento) / ⊥#110 ORIENT (dispersión abs,
// hero-invariante) / ⊥#111 SPEED (CV de MAGNITUD, dir-invariante) / ⊥#108 FLANK (posición
// ⊥ cinético) — ⊥all 53 live flags #59-#111.
//
// Config-only 1-line flip (54º flag, arc #59-#112). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build ac86989 touched exactly these
// code files (CONVERGE seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#111 SPEED 229165c5c306) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #111 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2667 LIVE flip sim/config.js CONVERGE_SURGE enabled:false→true — 54º flag LIVE (Remate de Embestida Convergente) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#112).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
