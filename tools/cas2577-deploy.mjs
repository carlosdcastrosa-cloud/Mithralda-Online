// cas2577-deploy.mjs — LIVE FLIP EVO#97 SENTINEL_SURGE false→true (CAS-2577 / CAS-2573 build;
// CEO Gate 1/2 byte-verify PASS @4ee90af + DARK QA CAS-2576 PASS 15/15 @4ee90af (2-client
// 0-desync fp 15920977 terrHash 2105484439, REAL server-auth spawnKill vigilant+2/wary+1/
// oblivious+0/adv0, byte-neutral OFF, STATELESS, ⊥override overrideAggro IGNORADO reads BASE,
// ⊥#96 TOUGH/⊥#95 MENACE/⊥#94 SWIFT/⊥#92 BULK/⊥#93 ROLE/⊥#84 SKIRMISH) + CEO Gate 2/2
// byte-verify PASS @0106bbd (sim/config.js byte-identical blob 990dd4c to DARK base, QA delta
// purely additive, version.json UNTOUCHED ec06c1f3587b/813, SENTINEL sole _SURGE OFF).
// Config-only 1-line flip (39º flag, arc #59-#97). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #96 stamp ec06c1f3587b. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2577 LIVE FLIP EVO#97 SENTINEL_SURGE.enabled false→true (Remate de Vigía) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
