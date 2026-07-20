// cas2637-deploy.mjs — LIVE FLIP EVO#106 MOTLEY_SURGE false→true (Remate de Ralea
// Abigarrada, 48º flag). CAS-2634 DARK build @85b7280 (CEO Gate 1/2 PASS 4e03c21d +
// DARK QA CAS-2635/2636 selfverify 17/17, 2-client 0-desync fp 15920977, byte-neutral
// OFF, STATELESS h.motleyBounty, eje FRESCO DIVERSIDAD DE ESPECIES del pack VIVO —
// motleyCount = nº de TIPOS DISTINTOS e.type entre mobs VIVOS en radio, bands motley≥3
// /mixed≥2, canal FRESCO motleyFind→h.motleyBounty sub-cap2, ⊥#87 pack-count / ⊥#84
// skirmish / ⊥Erudición temporal, ⊥all 47 live flags) + CEO Gate 2/2 PASS (005cf3c5).
//
// Config-only 1-line flip (48º flag, arc #59-#106). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 85b7280 touched exactly these
// code files (MOTLEY seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#105 BANE 8e1b7d472e89) lacks them, so all 4 diverge and must be overlaid
// from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #105 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2634 LIVE flip sim/config.js MOTLEY_SURGE enabled:false→true — 48º flag LIVE (Remate de Ralea Abigarrada) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#106).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
