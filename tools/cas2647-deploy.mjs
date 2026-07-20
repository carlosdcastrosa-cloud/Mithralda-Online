// cas2647-deploy.mjs — LIVE FLIP EVO#108 FLANK_SURGE false→true (Remate de Falange,
// 50º flag). CAS-2645 DARK build @2c55ae5 (CEO Gate 1/2 PASS + DARK QA + CEO Gate 2/2)
// selfverify cas2645-flank-selfverify PASS 17/17, 2-client 0-desync fp 15920977,
// byte-neutral OFF, STATELESS h.flankBounty, eje FRESCO CONCENTRACIÓN ANGULAR del pack
// VIVO — flankConc = mean-resultant-length R∈[0,1] de los rumbos hero→mob (circular
// stats, radius300 ≥minMobs2), bands ≥hiConc0.80⇒2/≥midConc0.50⇒1/<0.50⇒0, canal
// FRESCO flankFind→h.flankBounty, ⊥#107 disperse (spread radial)/⊥#59 warding-ring
// (cobertura angular de JUGADORES)/⊥#87 pack-cohesion/⊥#90 heading (movimiento) — ⊥all
// 49 live flags #59-#107.
//
// Config-only 1-line flip (50º flag, arc #59-#108). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js) — the DARK build 2c55ae5 touched exactly these
// code files (FLANK seams in game.js/render.js/sim.js, flag block in config.js) and the
// gh-pages base (#107 DISPERSE b8b8c3ac28f7) lacks them, so all 4 diverge and must be
// overlaid from HEAD. version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #107 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2647 LIVE flip sim/config.js FLANK_SURGE enabled:false→true — 50º flag LIVE (Remate de Falange) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#108).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
