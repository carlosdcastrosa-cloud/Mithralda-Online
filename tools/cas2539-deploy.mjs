// cas2539-deploy.mjs — LIVE FLIP EVO#90 HEADING_SURGE false→true (CAS-2539 / CAS-2537 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2538 INDEP PASS 15/15 @c4189a88,
// fp 15920977 terrHash 2105484439 0-desync · CEO Gate 2/2 GREEN, delta c4189a88..21bfa4f8
// = SÓLO harness QA additivo tooling). Config-only 1-line flip (32º flag #59-#90).
// Overlay = the canonical 4-file MODS set (game.js/render.js/config.js/sim.js);
// other files may diverge but are NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #89 stamp 0c9fc1ae88a7. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2539 LIVE FLIP EVO#90 HEADING_SURGE.enabled false→true (Remate de Embestida) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
