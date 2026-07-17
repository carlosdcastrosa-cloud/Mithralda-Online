// cas2491-deploy.mjs — LIVE FLIP EVO#81 CROSSFIRE_FRAY_SURGE false→true (CAS-2491 / CAS-2488 build; CAS-2490 QA DARK Gate 2/2 PASS 9/9 indep + CEO Gate 1/2 PASS 15/15).
// Config-only 1-line flip (23º flag #59-#81). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); other files may diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #80 stamp a6cac7667834. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2491 LIVE FLIP EVO#81 CROSSFIRE_FRAY_SURGE.enabled false→true (Fragor de Fuego Cruzado) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
