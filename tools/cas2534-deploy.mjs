// cas2534-deploy.mjs — LIVE FLIP EVO#89 INTERRUPT_SURGE false→true (CAS-2534 / CAS-2532 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2533 INDEP PASS 15/15 @420958e,
// fp 15920977 0-desync · CEO Gate 2/2 GREEN, delta 420958e..17a86c2 = SÓLO harness QA additivo).
// Config-only 1-line flip (31º flag #59-#89). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js); other files may diverge but are NOT in the
// index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #88 stamp 9e9beb7f0958. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2534 LIVE FLIP EVO#89 INTERRUPT_SURGE.enabled false→true (Remate de Interrupción) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
