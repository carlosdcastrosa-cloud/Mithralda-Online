// cas2597-deploy.mjs — LIVE FLIP EVO#100 RECOVER_SURGE false→true (CAS-2597 / CAS-2594 build;
// CEO Gate 1/2 PASS @5c60b69 + DARK QA CAS-2596 PASS 24/24 (2-client 0-desync fp 15920977
// fps61, REAL server-auth spawnKill recover-band grant sluggish+2/lagging+1/nimble+0,
// byte-neutral OFF, STATELESS, recoverWeight=band ETPL[type].recover BASE — post-attack
// recovery window — ⊥override reads BASE recover, ⊥#99 WINDUP charger wind1/recov2 vs
// volatile wind1/recov0 SAME wind OPPOSITE recover, ⊥#98 RAM/⊥#97 SENTINEL/⊥#96 TOUGH/
// ⊥#95 MENACE/⊥#94 SWIFT/⊥#92 BULK/⊥#93 ROLE/⊥#89 INTERRUPT/⊥#84 SKIRMISH) + CEO Gate 2/2 PASS.
// Config-only 1-line flip (42º flag, arc #59-#100). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build 5c60b69 touched exactly these code
// files (RECOVER seams in game.js/render.js/sim.js, flag block in config.js), all covered.
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes
// over base∪overlay) so served advances off the stale #100 art stamp c619cd2dd617. Master
// version.json is stamped SEPARATELY after this runs. gh-pages already carries the CAS-2587
// sprite files (render/sprites.js == HEAD, byte-identical) so the 4-file overlay preflight
// (divergent∩MODS = {game.js,render.js,config.js,sim.js} ⊆ OVERLAY) PASSES.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2597 LIVE FLIP EVO#100 RECOVER_SURGE.enabled false→true (Remate de Recobro) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
