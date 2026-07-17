// cas2587-deploy.mjs — ship the CAS-2587 sprite-audit fix (rat + adv real cutouts) LIVE.
//
// WHY a dedicated deploy (not a bare config-flip overlay):
//   render/sprites.js is a MODS runtime module. The rat/adv ENEMY_IMG wiring diverges it from
//   origin/gh-pages, and the two new PNG cutouts (enemy_rat.png / enemy_adv.png) live only on
//   master — neither ships via the canonical 4-file EVO overlay. This deploy EXPANDS the overlay
//   to include render/sprites.js + the two assets, so preflight passes AND the art actually lands.
//
// PRE-REQ (Game Engineer): re-apply the 2-line wiring to render/sprites.js ENEMY_IMG FIRST
//   (it was reverted from master to keep the EVO arc flip-clean — see CAS-2587). Add, right
//   after `demon:"enemy_demon"`:
//        rat:"enemy_rat", adv:"enemy_adv"
//   Commit it, THEN run this tool. The guard below refuses to deploy without the wiring.
//
//   node tools/cas2587-deploy.mjs
import { execFileSync } from "node:child_process";
import { deployOverlay } from "./deploy-lib.mjs";

// Guard: HEAD render/sprites.js MUST contain the rat/adv ENEMY_IMG wiring, else the assets
// ship but nothing references them (mobs stay procedural). Fail loud before touching gh-pages.
const spritesHead = execFileSync("git", ["show", "HEAD:render/sprites.js"]).toString();
if (!/rat:\s*"enemy_rat"/.test(spritesHead) || !/adv:\s*"enemy_adv"/.test(spritesHead)) {
  console.error("ABORT: HEAD render/sprites.js is missing the rat/adv ENEMY_IMG wiring.");
  console.error("Apply it (rat:\"enemy_rat\", adv:\"enemy_adv\" after demon:\"enemy_demon\"), commit, then re-run.");
  process.exit(1);
}

// Canonical 4-file MODS overlay (keeps the live EVO flag set intact) + the sprite-audit delta.
const OVERLAY = [
  "game.js", "render/render.js", "sim/config.js", "sim/sim.js",   // canonical live overlay
  "render/sprites.js",                                            // rat/adv ENEMY_IMG wiring
  "assets/pixellab/fountains/enemy_rat.png",                      // new FOUNTAINS rat cutout
  "assets/pixellab/fountains/enemy_adv.png",                      // new FOUNTAINS adventurer cutout
];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2587 sprite-audit fix — ship rat/adv real FOUNTAINS cutouts + ENEMY_IMG wiring (expanded overlay incl. render/sprites.js + 2 assets).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
// After push: remember to stamp master version.json with res.build (SEPARATE commit), and
// curl the served assets/pixellab/fountains/enemy_rat.png (expect HTTP 200) to confirm LIVE.
