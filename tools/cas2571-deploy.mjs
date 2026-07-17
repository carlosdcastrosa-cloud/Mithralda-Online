// cas2571-deploy.mjs — LIVE FLIP EVO#96 TOUGH_SURGE false→true (CAS-2571 / CAS-2569 build;
// CEO Gate 1/2 byte-verify PASS + DARK QA CAS-2570 PASS 15/15 @670f061 (2-client 0-desync
// fp 15920977 terrHash 2105484439, REAL server-auth 31 spawnTough BASE rows, LUT-pure
// hiHp110/midHp46, ⊥#86 SIEGE decouple base-vs-fraction, ⊥#95 MENACE/⊥#94 SWIFT/⊥#92 BULK/
// ⊥#93 ROLE, byte-neutral OFF, STATELESS) + CEO Gate 2/2 byte-verify PASS (delta e7b551d
// purely additive, version.json UNTOUCHED 81c189900aa9/813, gate TOUGH_SURGE.enabled:false@3334
// intact, MENACE_SURGE.enabled:true@3313, SWIFT_SURGE.enabled:true@3292). Config-only 1-line
// flip (38º flag, arc #59-#96). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #95 stamp 81c189900aa9. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2571 LIVE FLIP EVO#96 TOUGH_SURGE.enabled false→true (Remate de Coloso) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
