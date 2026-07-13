import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2289: LIVE FLIP of Toque de Guerra del Santuario / Sanctuary Warhorn (flag WORLD_EVENT) — el primer
// EVENTO MUNDIAL PROGRAMADO del arco Santuario (world-boss-timer / GW2 meta-event canon). CEO Gate PASSED on
// CAS-2288; QA OBSERVABLE v2 = 18/18 PASS on DARK build c4a549ae2fa1 (byte-id OFF verified); CEO LIVE
// byte-verify PASS on build 37550201780f (WORLD_EVENT absent=DARK + 8-flag Sanctuary arc all enabled:true,
// 0 regression). This deploy brings the whole warhorn graph forward alongside enabled:true.
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  {config,sim,game,render,input}  ==
//     ["sim/config.js","sim/sim.js","game.js","render/render.js"]  (4 files DIVERGE; input.js does NOT —
//     Warhorn added NO new keybind, Date.now is read only inside the GATED tickWorldEvent).
//   The DARK subsystem landed at HEAD across all 4: config (WORLD_EVENT export + schedule/reward knobs),
//   sim.js (tickWorldEvent schedule / warhornOnKill reward / G.warhorn transient state), game.js
//   (__dev.warhorn hook), render.js (warhorn badge + rally blip gated draw). No input touched.
//   Config-only would leave flag=true but stale sim/game/render logic from an old HEAD → CAS-2220 SEV-1 drift.
//   → CONSISTENT-HEAD 4-file overlay. Built-in preflight (divergent∩MODS ⊆ overlay) THROWS on any uncovered module.
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   the uncommitted CAS-2200 portal WIP is never shipped.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): flip only sets enabled:true; state is 100% DERIVED
// (G.warhorn transient, 0 new save key). No new save fields introduced by the deploy.
//
// Reversible 1-line: WORLD_EVENT.enabled true→false in sim/config.js + re-run this overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2289 LIVE FLIP: Toque de Guerra del Santuario / Sanctuary Warhorn (WORLD_EVENT.enabled:true; overlay consistente-HEAD config+sim+game+render; sin input — 0 tecla nueva; render.js WIP CAS-2200 no shipped; arco Santuario SANCTUARY_REP/SANCTUARY_REWARDS/BOUNTY_BOARD/RECALL/SAFEZONE/TEMPLE_RESPAWN/RESTED_XP intacto enabled:true = 8-flag stack; DARK BOSS_RUSH/DOORS_INTERIORS/SEEDED_CHALLENGE intacto false; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
