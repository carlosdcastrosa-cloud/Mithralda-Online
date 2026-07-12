import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2230: flip DAYNIGHT.enabled:true + CONSISTENT-HEAD overlay of the day/night cycle build.
// gh-pages base = b450a28 (CAS-2228 minimap, build eab86ac08046). The MODS-graph files that DIVERGE
// base↔HEAD are EXACTLY these 6 (doors CAS-2225 DARK + daynight CAS-2230). We ship ALL 6 at HEAD so
// the resulting module graph is consistent (avoids the CAS-2202/2220 overlay-drift SEV-1 black screen):
//   - sim/config.js  : DAYNIGHT.enabled:true (flip) + DOORS_INTERIORS.enabled:false (stays DARK)
//   - render/render.js: daynight tint+lamp-glow render (gated) + doors render (gated, inert)
//   - game.js/strings.js/sim/sim.js/sim/world.js: doors code, fully DARK-gated ⇒ behavior-identical to LIVE
// Preflight (deploy-lib): divergent(base↔HEAD) ∩ MODS ⊆ overlay ⇒ missing:[] or it THROWS.
const overlay = [
  "sim/config.js",
  "render/render.js",
  "game.js",
  "strings.js",
  "sim/sim.js",
  "sim/world.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2230 LIVE: day/night cycle + lamp glow (flip DAYNIGHT.enabled:true, consistent-HEAD overlay 6 MODS files, doors stay DARK)",
});
console.log(JSON.stringify(res, null, 2));
