import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2247: LIVE FLIP of Home-Temple Respawn (TEMPLE_RESPAWN.enabled:false → true).
// CEO Gate PASS (DARK byte-verified on master HEAD + QA OBSERVABLE PASS 15/15 desk+mobile, byte-id OFF).
//
// 1-line value flip committed at HEAD (a459247). Consistent-HEAD overlay ships config+sim+game together:
//   - config.js  : carries TEMPLE_RESPAWN.enabled:true (the flip) + all other LIVE flags.
//   - sim.js     : diverges via homeTemplePoint()/respawn() ternary (already LIVE-consistent at HEAD).
//   - game.js    : diverges via __dev.templeRespawn hook (already LIVE-consistent at HEAD).
// render/render.js is BYTE-IDENTICAL gh-pages↔HEAD (0 render refs — anti-CAS-2220 boot-gate OK), so it is
// NOT in the overlay and stays on the base. Preflight (deploy-lib) asserts:
//   divergent(gh-pages↔HEAD) ∩ MODS = {game.js, sim/config.js, sim/sim.js} ⊆ overlay ⇒ missing:[] or THROWS.
// Preserved LIVE flags (all at HEAD config): SAFEZONE/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP true,
// DOORS_INTERIORS:false stays DARK. Reversible: enabled:true→false + redeploy this same overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2247 LIVE FLIP: Home-Temple Respawn (TEMPLE_RESPAWN.enabled:true, consistent-HEAD overlay config+sim+game; SAFEZONE/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP preserved true, DOORS_INTERIORS stays false DARK)",
});
console.log(JSON.stringify(res, null, 2));
