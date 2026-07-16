// cas2473-deploy.mjs — LIVE FLIP EVO#78 BOSS_ENRAGE_SURGE false→true (CAS-2473 / CAS-2468 build; CAS-2471/CAS-2472 QA DARK Gate 2/2).
// Config-only 1-line flip. Overlay = divergent∩MODS = the canonical 4-file set
// (logic.js/version.js diverge but are NOT in the index.html MODS graph ⇒ not loaded).
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #77 stamp 4ce6f753a96b.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2473 LIVE FLIP EVO#78 BOSS_ENRAGE_SURGE.enabled false→true (Fase de Enfurecimiento de Jefe) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
