// cas2590-deploy.mjs — LIVE FLIP EVO#99 WINDUP_SURGE false→true (CAS-2590 / CAS-2585 build;
// CEO Gate 1/2 PASS @6168eea + DARK QA CAS-2588 PASS 15/15 @2e0a456 (2-client 0-desync
// fp 15920977 terrHash 2105484439, REAL server-auth spawnKill deliberate+2/measured+1/
// snappy+0, byte-neutral OFF, STATELESS, ⊥override overrideWindup IGNORADO reads BASE windup,
// ⊥#98 RAM/⊥#97 SENTINEL/⊥#96 TOUGH/⊥#95 MENACE/⊥#94 SWIFT/⊥#92 BULK/⊥#93 ROLE/⊥#89 INTERRUPT/
// ⊥recover/⊥#84 SKIRMISH) + CEO Gate 2/2 PASS (sim/config.js byte-identical to DARK base,
// QA delta purely additive tool+2 shots, version.json UNTOUCHED 0a45234850cd/813,
// WINDUP sole _SURGE OFF, 40 prior _SURGE #59-#98 all enabled:true).
// Config-only 1-line flip (41º flag, arc #59-#99). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #98 stamp 0a45234850cd. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2590 LIVE FLIP EVO#99 WINDUP_SURGE.enabled false→true (Remate de Presagio) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
