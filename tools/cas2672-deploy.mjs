// cas2672-deploy.mjs — LIVE FLIP EVO#113 ENCIRCLE_SURGE false→true (Remate de
// Cerco, 55º flag). CAS-2669 DARK build @1037df9 (CEO Gate 1/2 + DARK QA CAS-2670
// PASS 9/9, 0 commits + CEO Gate 2/2 ALL PASS). selfverify cas2669-encircle-selfverify
// PASS 17/17, 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.encircleBounty
// — eje FRESCO ESTRUCTURAL/GEOMÉTRICO COBERTURA ANGULAR / MAYOR-HUECO — encircleField =
// K = 1 − mayorHueco/2π de los rumbos hero→mob (atan2 de la POSICIÓN, MISMA fuente RUMBO
// que #108 FLANK, NO e.vx/e.vy inertes) de los mobs VIVOS en radius300 ≥minMobs3, bands
// ≥hiCover0.75⇒2/≥midCover0.50⇒1/<0.50⇒0, canal FRESCO encircleFind→h.encircleBounty,
// badge ⊚ "Cerco". INTENSIVO (invariante conteo Y escala radial). ⊥#108 FLANK (MISMOS
// rumbos, estadística DISTINTA: R-CONCENTRACIÓN ⊥ K-COBERTURA-HUECO) / ⊥#112 CONVERGE /
// ⊥#111 SPEED / ⊥#110 ORIENT (CINÉTICOS; ENCIRCLE posicional/motion-agnóstico) / ⊥#109
// COLUMN / ⊥#107 DISPERSE / ⊥#59 WARDING — ⊥all 54 live flags #59-#112.
//
// Config-only 1-line flip (55º flag, arc #59-#113). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 1037df9 touched exactly these
// code files (ENCIRCLE seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#112 CONVERGE d96456bddb01) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #112 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2672 LIVE flip sim/config.js ENCIRCLE_SURGE enabled:false→true — 55º flag LIVE (Remate de Cerco) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#113).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
