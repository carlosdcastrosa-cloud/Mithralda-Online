import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2267: LIVE FLIP of RECALL / Piedra de Vínculo / Recall al Santuario (WoW Hearthstone / Tibia temple recall).
// CEO Gate APPROVED on CAS-2266 after QA OBSERVABLE PASS 22/22 (b5c10283) + CEO byte-verify LIVE (RECALL ABSENT = DARK).
//
// AUTHORITATIVE DIVERGENCE (computed here, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js"]   (5 files, confirmed independently).
//   RECALL is a NEW subsystem (sim tick+cooldown, bind, teleport, Home key, badge) that touches 5 loaded modules.
//   gh-pages config.js has ZERO RECALL refs (block entirely absent) → config diverges (adds export const RECALL).
//   render/render.js gh-pages→HEAD diff = +46/-1, EXACTLY the 3 CAS-2266 hunks (import RECALL + gated call +
//   renderRecallBadge). The CAS-2200 portal WIP is UNCOMMITTED in the working tree → not in HEAD → not shipped
//   (deployOverlay ships HEAD blobs). The only "portal" refs in HEAD render.js are pre-existing CAS-114 warps.
//
// CONSISTENT-HEAD, NOT config-only: shipping config.js alone (with the new RECALL export block imported by the HEAD
// render.js already... — no) would in fact be safe here, but sim.js/game.js/input.js/render.js ALSO diverge (they carry
// the RECALL sim logic, __dev hook, Home-key gate, and badge) → they MUST advance to HEAD together or the module graph
// drifts (anti-CAS-2220 SEV-1). The built-in preflight (divergent∩MODS ⊆ overlay) enforces this and THROWS on any miss.
//
// Reversible 1-line: RECALL.enabled true→false in sim/config.js + re-run this overlay (redeploy prior config blob).
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
  message: "CAS-2267 LIVE FLIP: RECALL / Piedra de Vínculo / Recall al Santuario (RECALL.enabled:true; overlay consistente-HEAD config+sim+game+render+input; render.js = solo 3 hunks CAS-2266, WIP CAS-2200 no shipped; arc Santuario SAFEZONE/TEMPLE_RESPAWN/RESTED_XP intacto; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
