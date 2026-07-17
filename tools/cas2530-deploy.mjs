// cas2530-deploy.mjs — LIVE FLIP EVO#88 LONGSHOT_SURGE false→true (CAS-2530 / CAS-2527 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2529 INDEP PASS 12/12 @aa50b28,
// fp 15920977 0-desync · CEO Gate 2/2 GREEN, delta aa50b28..cce74d5 = SÓLO harness QA additivo).
// Config-only 1-line flip (30º flag #59-#88). Overlay = divergent∩MODS = the canonical
// 4-file set (game.js/render.js/config.js/sim.js); other files may diverge but are
// NOT in the index.html MODS graph ⇒ not loaded.
// version.json is stamped with a FRESH build hash automatically by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale
// #87 stamp df231e10b1de. Master version.json is stamped SEPARATELY after this.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2530 LIVE FLIP EVO#88 LONGSHOT_SURGE.enabled false→true (Remate a Distancia) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
