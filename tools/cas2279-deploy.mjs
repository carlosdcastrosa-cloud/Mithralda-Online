import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2279: LIVE FLIP of Sanctuary Quartermaster / Recompensas de Renombre (flag SANCTUARY_REWARDS) — reward
// vendor de facción que cierra el loop de SANCTUARY_REP (LIVE). CEO Gate closed on CAS-2278 after QA observable
// 23/23 PASS on the DARK fix-forward build c4a549ae2fa1 (commit 4592074, mobile blocker 18b resolved:
// tb.quartermaster moved off tb.ult's touch slot to VH-m-bs*6.65).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  feature MODS  ==
//     ["sim/config.js","sim/sim.js","game.js","render/render.js","input.js"]  (all 5 DIVERGE, confirmed).
//   The DARK subsystem landed at HEAD across all 5: config (SANCTUARY_REWARDS export + rewards knobs),
//   sim.js (sanctuaryRewardMul / tryQuartermaster claim logic + title), game.js (__dev.quartermaster hook),
//   render.js (Intendente/título gated draw), input.js (Delete key + mobile tb.quartermaster slot 6.65).
//   Config-only would leave flag=true but stale render/input/sim logic from an old HEAD → CAS-2220 SEV-1 drift.
//   → CONSISTENT-HEAD 5-file overlay. Built-in preflight (divergent∩MODS ⊆ overlay) THROWS on any uncovered module.
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   the uncommitted CAS-2200 portal WIP is never shipped.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): flip only sets enabled:true; save still omits
// h.sanctuaryRewards until a reward is claimed at runtime. No new save fields introduced by the deploy.
//
// Reversible 1-line: SANCTUARY_REWARDS.enabled true→false in sim/config.js + re-run this overlay.
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
  message: "CAS-2279 LIVE FLIP: Sanctuary Quartermaster / Recompensas de Renombre (SANCTUARY_REWARDS.enabled:true; overlay consistente-HEAD config+sim+game+render+input; render.js WIP CAS-2200 no shipped; arco Santuario SANCTUARY_REP/BOUNTY_BOARD/RECALL/SAFEZONE/TEMPLE_RESPAWN/RESTED_XP intacto enabled:true; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
