// cas2525-deploy.mjs — LIVE FLIP EVO#87 PACKHARVEST_SURGE false→true (CAS-2525 / CAS-2521 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2523 INDEP PASS 16/16 + static byte-verify
// @8d386dc, fp 15920977 · CEO Gate 2/2 re-verify GREEN).
// Config-only 1-line flip (29º flag #59-#87). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); other files may diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #86 stamp 67a7fd6e1c86. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2525 LIVE FLIP EVO#87 PACKHARVEST_SURGE.enabled false→true (Siega de Manada) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
