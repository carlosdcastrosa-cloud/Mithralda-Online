import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2270: LIVE FLIP of Tablón de Recompensas / Bounty Board (WoW/GW2/Tibia daily-bounty "mata N de X" ⇒ oro+XP).
// CEO Gate APPROVED on CAS-2269 after QA OBSERVABLE PASS 22/22 (build c4a549ae2fa1, DARK) + CEO byte-verify LIVE
// (BOUNTY_BOARD ABSENT = DARK on served sim/config.js, build 3b224f8ade0d; Santuario+Recall stack all enabled:true).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js"]   (5 files, confirmed).
//   Ticket title said "config+sim+game+render" (4) — WRONG: input.js ALSO diverges (dedicated KeyB accept/claim key)
//   and is a loaded MOD → must ship or the module graph drifts (anti-CAS-2220 SEV-1). Overlay = 5 files.
//   gh-pages sim/config.js has ZERO BOUNTY_BOARD refs (block entirely absent = DARK) → config diverges (adds export).
//   render/render.js HEAD imports BOUNTY_BOARD + renderBountyBadge (gated) → diverges. The CAS-2200 portal WIP is
//   UNCOMMITTED in the working tree → not in HEAD → NOT shipped (deployOverlay ships HEAD blobs, not working tree).
//
// CONSISTENT-HEAD, NOT config-only: sim.js (derived-progress kill path h.kills/killsByType), game.js (__dev.bounty hook),
// input.js (KeyB gate), render.js (badge) ALL carry the DARK bounty subsystem already committed at HEAD (eabc331) →
// they MUST advance to HEAD together with the config flip. The built-in preflight (divergent∩MODS ⊆ overlay) THROWS
// on any uncovered divergent module.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): the flip only sets enabled:true; save still omits bounty/bountyIdx
// unless a contract is accepted at runtime; no new save fields introduced by the deploy itself.
//
// Reversible 1-line: BOUNTY_BOARD.enabled true→false in sim/config.js + re-run this overlay (redeploy prior config blob).
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
  message: "CAS-2270 LIVE FLIP: Tablón de Recompensas / Bounty Board (BOUNTY_BOARD.enabled:true; overlay consistente-HEAD config+sim+game+render+input; render.js WIP CAS-2200 no shipped; arc Santuario SAFEZONE/TEMPLE_RESPAWN/RESTED_XP/RECALL intacto; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
