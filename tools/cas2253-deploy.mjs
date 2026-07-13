import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2253: LIVE FLIP of City Sanctuary NO-AGGRO (SAFEZONE.noAggro:false → true).
// CEO Gate PASS (CAS-2250 DARK byte-verified on master HEAD + QA CAS-2252 OBSERVABLE PASS 12/12, byte-id OFF).
//
// 1-line value flip committed at HEAD (bed51dc). Consistent-HEAD overlay ships config+sim+game together:
//   - config.js  : carries SAFEZONE.noAggro:true (the flip) + all other LIVE flags.
//   - sim.js     : diverges via updateEnemies heroSafe acquire-gate + edge leash (sim.js:5044, already LIVE-consistent at HEAD).
//   - game.js    : diverges via __dev.noAggro / safeZone toggle hook (already LIVE-consistent at HEAD).
// render/render.js is BYTE-IDENTICAL gh-pages↔HEAD for the no-aggro feature (0 render refs — anti-CAS-2220
// boot-gate OK), so it is NOT in the overlay and stays on the base. Preflight (deploy-lib) asserts:
//   divergent(gh-pages↔HEAD) ∩ MODS = {game.js, sim/config.js, sim/sim.js} ⊆ overlay ⇒ missing:[] or THROWS.
// Preserved LIVE flags (all at HEAD config): SAFEZONE(enabled)/TEMPLE_RESPAWN/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP true,
// DOORS_INTERIORS:false stays DARK. Reversible: noAggro:true→false + redeploy this same overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2253 LIVE FLIP: City Sanctuary NO-AGGRO (SAFEZONE.noAggro:true, consistent-HEAD overlay config+sim+game; SAFEZONE/TEMPLE_RESPAWN/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP preserved true, DOORS_INTERIORS stays false DARK)",
});
console.log(JSON.stringify(res, null, 2));
