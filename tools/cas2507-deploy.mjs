// cas2507-deploy.mjs — LIVE FLIP EVO#84 SKIRMISH_LINE_SURGE false→true (CAS-2507 / CAS-2504 build;
// CEO Gate 1/2 byte-verify PASS 15/15 + DARK QA Gate 2/2 CAS-2506 INDEP PASS 12/12 @b010912, fp 15920977).
// Config-only 1-line flip (26º flag #59-#84). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); other files may diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #83 stamp 27c790487016. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2507 LIVE FLIP EVO#84 SKIRMISH_LINE_SURGE.enabled false→true (Línea de Escaramuza) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
