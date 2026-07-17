// cas2479-deploy.mjs — LIVE FLIP EVO#79 SPOILS_FIELD_SURGE false→true (CAS-2479 / CAS-2477 build; CAS-2478 QA DARK Gate 2/2 PASS 29/29).
// Config-only 1-line flip (21º flag #59-#79). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); logic.js/version.js diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #78 stamp e0adf46f6ed1.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2479 LIVE FLIP EVO#79 SPOILS_FIELD_SURGE.enabled false→true (Campo de Botín Denso) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
