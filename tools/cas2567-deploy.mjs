// cas2567-deploy.mjs — LIVE FLIP EVO#95 MENACE_SURGE false→true (CAS-2567 / CAS-2563 build;
// CEO Gate 1/2 byte-verify PASS (indep clone==ls-remote 59049ef, additive-only, version.json
// UNTOUCHED, gate false, #92/#93/#94 all true) + DARK QA CAS-2566 PASS 15/15 @daf8f87
// (2-client 0-desync fp 15920977 terrHash 2105484439, REAL server-auth all 31 ETPL dmg rows,
// LUT-pure 22/14/13, ⊥#74/champion base-read, ⊥#94 SWIFT/⊥#93 role/⊥#92 bulk, byte-neutral
// OFF, STATELESS) + CEO Gate 2/2 byte-verify PASS (delta 59049ef..daf8f87 PURELY ADDITIVE =
// QA harness + GE selfverify + 3 shots, 0 game-source, version.json UNTOUCHED 3d3e8be4811b/813,
// gate MENACE_SURGE.enabled:false@3313 intact, SWIFT_SURGE.enabled:true@3292). Config-only
// 1-line flip (37º flag, arco #59-#95). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #94 stamp 3d3e8be4811b. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2567 LIVE FLIP EVO#95 MENACE_SURGE.enabled false→true (Remate de Matón) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
