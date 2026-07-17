// cas2582-deploy.mjs — LIVE FLIP EVO#98 RAM_SURGE false→true (CAS-2582 / CAS-2580 build;
// CEO Gate 1/2 byte-verify PASS @d8d5d0b + DARK QA CAS-2581 PASS 15/15 @d8d5d0b (2-client
// 0-desync fp 15920977 terrHash 2105484439, REAL server-auth spawnKill ariete+2/firme+1/
// leve+0, byte-neutral OFF, STATELESS, ⊥override overrideKnock IGNORADO reads BASE knock,
// ⊥#97 SENTINEL/⊥#96 TOUGH/⊥#95 MENACE/⊥#94 SWIFT/⊥#92 BULK/⊥#93 ROLE/⊥#84 SKIRMISH) +
// CEO Gate 2/2 byte-verify PASS @ddfd784 (sim/config.js byte-identical to DARK base, QA delta
// d8d5d0b..ddfd784 purely additive tool+2 shots, version.json UNTOUCHED 1504785ba734/813,
// RAM sole _SURGE OFF, 25 prior _SURGE all enabled:true).
// Config-only 1-line flip (40º flag, arc #59-#98). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). version.json is stamped with a FRESH build hash
// automatically by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #97 stamp 1504785ba734. Master version.json is stamped SEPARATELY.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2582 LIVE FLIP EVO#98 RAM_SURGE.enabled false→true (Remate de Ariete) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
