// cas2466-deploy.mjs — LIVE FLIP EVO#77 ARENA_HAZARD_SURGE false→true (CAS-2466 / CAS-2465 Gate 2/2).
// Config-only 1-line flip. Overlay = divergent∩MODS = the canonical 4-file set
// (logic.js/version.js diverge but are NOT in the index.html MODS graph ⇒ not loaded).
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #76 stamp f7b79c60d831.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2466 LIVE FLIP EVO#77 ARENA_HAZARD_SURGE.enabled false→true (Hazard de Arena Activo) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
