import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2236: flip ZONE_BANNER.enabled:true + CONSISTENT-HEAD overlay of the CAS-2234 zone/region banner build.
// gh-pages baseline LACKS the banner code: served render.js md5 daa34dcebf498a915d508510704b4bba has 0 zone refs,
// served config.js does NOT export ZONE_BANNER. A config-only flip = SEV-1 black screen (module-link mismatch;
// precedente CAS-2220/CAS-2215). So we ship the module-consistent set: the MODS-graph files that DIVERGE
// gh-pages↔HEAD are EXACTLY these 3 (verified: git diff --name-only origin/gh-pages HEAD ∩ MODS):
//   - sim/config.js   : ZONE_BANNER.enabled:true (flip) + DAYNIGHT/WEATHER/MINIMAP stay true + DOORS_INTERIORS false (DARK)
//   - render/render.js: updateZoneBanner()/renderZoneBanner() gated by ZONE_BANNER.enabled in render() (l.319)
//   - game.js         : __dev.zone A/B hook (CAS-2234) ⇒ must ride with config+render at the SAME HEAD
// Preflight (deploy-lib): divergent(base↔HEAD) ∩ MODS ⊆ overlay ⇒ missing:[] or it THROWS. NOT config-only.
const overlay = [
  "sim/config.js",
  "render/render.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2236 LIVE: zone/region banner (flip ZONE_BANNER.enabled:true, consistent-HEAD overlay 3 MODS files; daynight/weather/minimap stay LIVE, doors stay DARK)",
});
console.log(JSON.stringify(res, null, 2));
