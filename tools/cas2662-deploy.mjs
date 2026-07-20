// cas2662-deploy.mjs — LIVE FLIP EVO#111 SPEED_SURGE false→true (Remate de Tropel
// Desigual, 53º flag). CAS-2660 DARK build @00656ad (CEO Gate 1/2 bd14dd18 + DARK QA
// CAS-2661 PASS 17/17 93607ab6 + CEO Gate 2/2 953e8f49). selfverify cas2660-speed-
// selfverify PASS 17/17, 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS
// h.speedBounty — eje FRESCO CINÉTICO/MAGNITUD DISPERSIÓN DE VELOCIDADES — speedSpread =
// CV = stddev/media de las MAGNITUDES de velocidad de paso (speedIntent server-auth de la
// MISMA rama de IA que headingIntent, NO e.vx/e.vy inertes) de los mobs VIVOS EN
// MOVIMIENTO en radius300 ≥minMobs3, bands ≥hiCV0.40⇒2/≥midCV0.18⇒1/<0.18⇒0, canal FRESCO
// speedFind→h.speedBounty, ⊥#94 SWIFT (velocidad-BASE de UNA víctima, MAX/1er momento) /
// ⊥#110 ORIENT (dirección/4-quad) / ⊥#87 PACKHARVEST (conteo, EXTENSIVA) — ⊥all 52 live
// flags #59-#110.
//
// Config-only 1-line flip (53º flag, arc #59-#111). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 00656ad touched exactly these
// code files (SPEED seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#110 ORIENT 449121cabca6) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #110 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2662 LIVE flip sim/config.js SPEED_SURGE enabled:false→true — 53º flag LIVE (Remate de Tropel Desigual) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#111).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
