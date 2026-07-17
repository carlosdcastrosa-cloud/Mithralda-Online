// cas2484-deploy.mjs — LIVE FLIP EVO#80 CARNAGE_FIELD_SURGE false→true (CAS-2484 / CAS-2481 build; CAS-2482+CAS-2483 QA DARK Gate 2/2 PASS 17/17 ×2).
// Config-only 1-line flip (22º flag #59-#80). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); logic.js/version.js diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #79 stamp 047bcd0e2e5f.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2484 LIVE FLIP EVO#80 CARNAGE_FIELD_SURGE.enabled false→true (Campo de Carnicería) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
