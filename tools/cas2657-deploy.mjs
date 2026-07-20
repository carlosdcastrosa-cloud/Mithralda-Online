// cas2657-deploy.mjs — LIVE FLIP EVO#110 ORIENT_SURGE false→true (Remate de Desbandada,
// 52º flag). CAS-2655 DARK build @79ae69a (CEO Gate 1/2 + DARK QA CAS-2656 PASS 17/17 +
// CEO Gate 2/2). selfverify cas2655-orient-selfverify PASS 17/17, 2-client 0-desync
// fp 15920977, byte-neutral OFF, STATELESS h.orientBounty, eje FRESCO CINÉTICO/DIRECCIONAL
// DISPERSIÓN DE ORIENTACIONES — orientSpread = S=1−R (2º momento circular) de los RUMBOS
// DE MOVIMIENTO ABSOLUTOS (headingIntent server-auth, NO e.vx/e.vy inertes) de los mobs
// VIVOS CON rumbo en radius300 ≥minMobs3, bands ≥hiSpread0.62⇒2/≥midSpread0.30⇒1/<0.30⇒0,
// canal FRESCO orientFind→h.orientBounty, ⊥#90 heading (rumbo de UNA víctima RELATIVO al
// héroe, 1er momento) / ⊥#109 column (forma de posiciones) / ⊥#108 flank (ángulo posición)
// — ⊥all 51 live flags #59-#109.
//
// Config-only 1-line flip (52º flag, arc #59-#110). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 79ae69a touched exactly these
// code files (ORIENT seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#109 COLUMN bc21f1f7ac8a) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #109 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2657 LIVE flip sim/config.js ORIENT_SURGE enabled:false→true — 52º flag LIVE (Remate de Desbandada) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#110).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
