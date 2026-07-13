import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2242: DARK self-deploy of the City Safe Zone build (SAFEZONE.enabled:false — flag stays OFF).
// De-risks the eventual CEO-gated flip by proving the new module graph (render.js now imports SAFEZONE
// from config.js) boots LIVE, WITHOUT changing any observable behavior (feature inert).
//
// CONSISTENT-HEAD overlay: the MODS-graph files that DIVERGE gh-pages↔HEAD are EXACTLY these 4 — and each
// is byte-identical on gh-pages to my commit's PARENT (63eadc8), so this overlay ships ONLY the SAFEZONE
// commit (befd117) and nothing else. All currently-LIVE flags are preserved (ZONE_BANNER/DAYNIGHT/WEATHER/
// MINIMAP true, DOORS_INTERIORS false) because config.js at HEAD already carries those values:
//   - sim/config.js    : + SAFEZONE block (enabled:false DARK)
//   - sim/sim.js       : tickSafeZone + safeZoneGeom/inSafeZone + damageHero pause hook + dev.safeZone probe
//   - render/render.js : + SAFEZONE import + renderSafeZoneBadge (gated) — the new import REQUIRES config to ride along
//   - game.js          : + __dev.safeZone hook (rides with sim/config at the SAME HEAD)
// Preflight (deploy-lib): divergent(base↔HEAD) ∩ MODS ⊆ overlay ⇒ missing:[] or it THROWS (anti-CAS-2220).
// Reversible: the LIVE flip is a later config-only value change to enabled:true on this same consistent base.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "render/render.js",
  "game.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2242 DARK: City Safe Zone build (SAFEZONE.enabled:false, consistent-HEAD overlay 4 MODS; all LIVE flags preserved, feature inert)",
});
console.log(JSON.stringify(res, null, 2));
