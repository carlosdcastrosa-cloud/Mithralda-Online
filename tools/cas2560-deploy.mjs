// cas2560-deploy.mjs — LIVE FLIP EVO#94 SWIFT_SURGE false→true (CAS-2560 / CAS-2556 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2558 INDEP PASS 16/16 + CAS-2559 15/15
// @7dc6fe4, fp 15920977 terrHash 2105484439 0-desync · CEO Gate 2/2 GREEN, delta
// 7dc6fe4..1b15e28 = SÓLO harness QA additivo tooling+shots, 0 game source). Config-only
// 1-line flip (36º flag, arco #59-#94). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js); other files may diverge but are NOT in the
// index.html MODS graph ⇒ not loaded. version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #93 stamp d3a276a13dc0. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2560 LIVE FLIP EVO#94 SWIFT_SURGE.enabled false→true (Remate de Presa Veloz) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
