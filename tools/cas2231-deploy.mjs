import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2233: flip WEATHER.enabled:true + CONSISTENT-HEAD overlay of the CAS-2231 weather (rain/fog) build.
// gh-pages base = 9a18cda (CAS-2230 daynight flip, build 1aa455ccb76b). The MODS-graph files that DIVERGE
// base↔HEAD are EXACTLY these 3 (the CAS-2231 weather delta + this 1-line flip). We ship ALL 3 at HEAD so
// the resulting module graph is consistent (avoids the CAS-2202/2220 overlay-drift SEV-1 black screen):
//   - sim/config.js  : WEATHER.enabled:true (flip) + DAYNIGHT.enabled:true (stays LIVE) + DOORS_INTERIORS.enabled:false (DARK)
//   - render/render.js: renderWeather rain/fog (gated by WEATHER.enabled in render()), stale live has 0 weather refs (md5 3ed238b6…)
//   - game.js        : __dev.weather A/B hook (3 lines, CAS-2231), reads WEATHER ⇒ must ride with config+render at same HEAD
// Preflight (deploy-lib): divergent(base↔HEAD) ∩ MODS ⊆ overlay ⇒ missing:[] or it THROWS. NOT config-only.
const overlay = [
  "sim/config.js",
  "render/render.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2233 LIVE: weather rain/fog (flip WEATHER.enabled:true, consistent-HEAD overlay 3 MODS files, daynight stays LIVE, doors stay DARK)",
});
console.log(JSON.stringify(res, null, 2));
