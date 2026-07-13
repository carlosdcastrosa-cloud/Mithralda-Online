import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2243: LIVE FLIP of the City Safe Zone / Santuario (SAFEZONE.enabled:false → true).
// CEO Gate APPROVED (DARK byte-verified + QA b5c10283 PASS×2 desk+móvil, worldFingerprint byte-stable).
//
// This is a 1-line value flip on the SAME consistent-HEAD overlay base that the DARK deploy (CAS-2242,
// build 9ad007ff1837) already shipped LIVE. sim.js/render.js/game.js are byte-identical to what the CDN
// already serves; only config.js changes (SAFEZONE.enabled:true). We still ship ALL 4 MODS files from the
// same HEAD so the resulting live module graph stays internally consistent (anti-CAS-2220 / SEV-1 black
// screen). NEVER config-only over a stale render.js.
//
// Preflight (deploy-lib): divergent(gh-pages↔HEAD) ∩ MODS ⊆ overlay ⇒ missing:[] or it THROWS.
// After this flip the only divergent MODS file is config.js (covered). All other LIVE flags are preserved
// because config.js at HEAD already carries them: ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP true,
// DOORS_INTERIORS false (stays DARK). Reversible: enabled:true→false + redeploy this same overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "render/render.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2243 LIVE FLIP: City Safe Zone / Santuario (SAFEZONE.enabled:true, consistent-HEAD overlay 4 MODS; ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP preserved true, DOORS_INTERIORS stays false DARK)",
});
console.log(JSON.stringify(res, null, 2));
