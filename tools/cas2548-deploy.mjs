// cas2548-deploy.mjs — LIVE FLIP EVO#92 BULK_SURGE false→true (CAS-2548 / CAS-2546 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2547 INDEP PASS 15/15 @333c29e,
// fp 15920977 terrHash 2105484439 0-desync · CEO Gate 2/2 GREEN, delta 333c29e..948ff22
// = SÓLO harness QA additivo tooling). Config-only 1-line flip (34º flag, arco #59-#92).
// Overlay = the canonical 4-file MODS set (game.js/render.js/config.js/sim.js);
// other files may diverge but are NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #91 stamp db02ca6bb457. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2548 LIVE FLIP EVO#92 BULK_SURGE.enabled false→true (Remate de Mole) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
