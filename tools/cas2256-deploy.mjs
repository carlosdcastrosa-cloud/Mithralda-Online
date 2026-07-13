import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2256: LIVE FLIP of Rested XP / Bono de Descanso del Santuario (RESTED_XP.enabled:false → true).
// CEO Gate PASS (CAS-2255 DARK byte-verified HEAD 99f7074 + QA OBSERVABLE PASS 19/19, byte-id OFF).
//
// 1-line value flip committed at HEAD (234d9329). Consistent-HEAD overlay ships ALL 4 feature files together.
// NOTE: the issue text said "3 files, render.js untouched (0 refs)" — that is FACTUALLY WRONG. HEAD render.js
// diverges from gh-pages: it now `import`s RESTED_XP from config.js AND adds renderRestedBadge() (DARK-gated).
// The authoritative divergent(gh-pages↔HEAD) ∩ MODS set is {config.js, sim.js, game.js, render/render.js}:
//   - config.js       : carries RESTED_XP.enabled:true (the flip) + the RESTED_XP export block (NEW since gh-pages).
//   - sim/sim.js      : tickRestedXP accrual in SAFEZONE + gainXP chokepoint bonus spend + serializeSave conditional-spread.
//   - game.js         : __dev.rested() hook (whitelist).
//   - render/render.js: `import { RESTED_XP }` + renderRestedBadge() gated on RESTED_XP.enabled (DARK byte-id OFF).
// render.js + config.js MUST ship together: gh-pages base config.js has ZERO RESTED_XP refs, so shipping the new
// render.js (which imports RESTED_XP) without the new config.js = missing-export ES-link crash = black screen
// (the exact CAS-2220 SEV-1). deploy-lib preflight enforces divergent∩MODS ⊆ overlay ⇒ missing:[] or THROWS.
// Preserved LIVE flags (all at HEAD config): SAFEZONE(enabled)/TEMPLE_RESPAWN/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP true,
// DOORS_INTERIORS:false stays DARK. Reversible: RESTED_XP.enabled:true→false + redeploy this same overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2256 LIVE FLIP: Rested XP / Bono de Descanso del Santuario (RESTED_XP.enabled:true, consistent-HEAD overlay config+sim+game+render; SAFEZONE/TEMPLE_RESPAWN/ZONE_BANNER/DAYNIGHT/WEATHER/MINIMAP preserved true, DOORS_INTERIORS stays false DARK)",
});
console.log(JSON.stringify(res, null, 2));
