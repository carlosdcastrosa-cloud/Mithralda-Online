import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2293: LIVE FLIP of Emisario del Santuario / Sanctuary Emissary (flag SANCTUARY_EMISSARY) — la
// ROTACIÓN de world-quest COMPARTIDA del arco Santuario (WoW-emissary / daily world-quest canon; el gancho
// social "todos cazamos el MISMO objetivo hoy" que faltaba: BOUNTY_BOARD rota per-hero, el Emisario converge).
// CEO Gate APPROVED on CAS-2292; QA independent OBSERVABLE = 8/8 PASS on DARK build 6d666e5 (byte-id OFF
// verified: schedule null / no save key / fingerprint stable / key inert; REAL chokepoint loop accept→3/8→
// deliver claimed goldΔ90/repΔ60→done no double-pay; localized badge; mobile tb.emissary; fps no-regression).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","input.js","sim/sim.js","sim/config.js","render/render.js"]  (5 files DIVERGE & are LOADED).
//   Unlike Warhorn (CAS-2289, 4 files — NO input), the Emissary adds a DEDICATED KEY ("Insert") + mobile HUD
//   button (tb.emissary), so input.js DIVERGES and MUST ship consistent-HEAD. The DARK subsystem landed at
//   HEAD across all 5: config (SANCTUARY_EMISSARY export + rotation/reward knobs), sim.js (tickEmissary shared
//   rotation / tryEmissary accept-deliver / G.emissary+h.emissary derived state / reward chokepoints), game.js
//   (__dev.emissary hook), render.js (emissary badge gated draw), input.js (Insert key + tb.emissary gated).
//   NB the ticket's Task-1 list says "config+sim+game+render" (4) — it OMITS input; shipping 4 would leave the
//   LIVE base with a STALE input.js lacking the SANCTUARY_EMISSARY import → ES-module link crash (CAS-2220
//   black screen) the instant config.js/sim.js advance. The preflight (divergent∩MODS ⊆ overlay) enforces the
//   correct 5-file set and THROWS on any uncovered module; I trust the graph, not the ticket prose.
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   the uncommitted CAS-2200 portal WIP (M in git status) is never shipped.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): the flip only sets enabled:true; state is 100% DERIVED
// (G.emissary/h.emissary transient/per-hero, rotation is a pure function of the shared clock; no new save key
// introduced by the deploy). Reversible 1-line: SANCTUARY_EMISSARY.enabled true→false + re-run this overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
  "input.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2293 LIVE FLIP: Emisario del Santuario / Sanctuary Emissary (SANCTUARY_EMISSARY.enabled:true; overlay consistente-HEAD config+sim+game+render+input — input INCLUIDO por la tecla dedicada Insert + tb.emissary, a diferencia de Warhorn; render.js WIP CAS-2200 no shipped; arco Santuario WORLD_EVENT/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/RECALL/SAFEZONE/TEMPLE_RESPAWN/RESTED_XP intacto enabled:true; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
