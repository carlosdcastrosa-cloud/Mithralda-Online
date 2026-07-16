// cas2448-deploy.mjs — LIVE FLIP EVO#74 MOB_AFFIX_DANGER false→true (CAS-2448).
// Config-only 1-line flip. Overlay = divergent∩MODS = the canonical 4-file set.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2448 LIVE FLIP EVO#74 MOB_AFFIX_DANGER.enabled false→true (Peligro por Afijo de Mob) — config-only 1-line overlay deploy.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
