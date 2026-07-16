// cas2460-deploy.mjs — LIVE FLIP EVO#76 ENCOUNTER_VARIANT_SURGE false→true (CAS-2460 / CAS-2458).
// Config-only 1-line flip. Overlay = divergent∩MODS = the canonical 4-file set.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #75 stamp.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2460 LIVE FLIP EVO#76 ENCOUNTER_VARIANT_SURGE.enabled false→true (Variante de Encuentro Activa) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
