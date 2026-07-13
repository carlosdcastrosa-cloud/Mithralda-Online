import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2274: FLIP LIVE — Renombre del Santuario / Sanctuary Reputation (SANCTUARY_REP.enabled false→true).
// CEO Gate PASSED on parent CAS-2272 (QA OBSERVABLE 16/16, byte-id OFF anti-CAS-2220 confirmed, 61fps desk/mobile).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   ( git diff --name-only origin/gh-pages HEAD )  ∩  MODS(index.html)  ==  ["sim/config.js"]  (ONE file).
//   Why only one: the CAS-2273 fix-forward deploy (build 7ab8a04b7f37, gh-pages 36de399 base) already shipped
//   sim.js / game.js / render.js / input.js at HEAD — and that bundle already carried the CAS-2272 SANCTUARY_REP
//   DARK code (enabled:false) inert in sim+game+render. So today only config.js diverges: my flip false→true.
//   Verified blob-identity HEAD vs gh-pages: sim.js/game.js/render.js/input.js ALL byte-identical; only config diverges.
//
// OVERLAY CHOICE = consistent-HEAD 4-file {config, sim, game, render} per CEO ticket. config.js is the real delta;
//   sim/game/render ship from the SAME HEAD as byte-identical no-ops (their HEAD blob == the live gh-pages blob), which
//   guarantees byte-identity and documents the consistent-HEAD intent. This is strictly safe: preflight only REQUIRES
//   divergent∩MODS ⊆ overlay ({config} ⊆ {config,sim,game,render} ✓), and including identical siblings changes nothing
//   in the resulting tree/build fingerprint. NOT a config-only deploy (avoids the CAS-2220 sev-1 trap by construction,
//   even though here config-only would have been safe since the siblings already match HEAD).
//   input.js is intentionally NOT in the overlay: SANCTUARY_REP adds no key (footgun-free, unlike CAS-2273 KeyB), and
//   input.js is already live at HEAD → not divergent → not needed.
//
// render.js WIP CAS-2200 (uncommitted working-tree) is NOT shipped: deployOverlay ships HEAD blobs (git rev-parse
//   HEAD:render/render.js == a372eecb == the live blob), never the dirty working tree. The flip commit touched
//   sim/config.js ONLY for the same reason.
//
// Byte-id OFF preserved when a hero has never gained rep: h.sanctuaryRep only created via the real bounty-claim route
//   (CAS-2272 QA proved: hasField false / save omits field / worldFingerprint stable / Neutral perk xpMult ×1.00 inert).
// Reversible: SANCTUARY_REP.enabled true→false in sim/config.js + re-run an overlay redeploy (restores prior config blob).
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2274 FLIP LIVE: Sanctuary Reputation / Renombre del Santuario (SANCTUARY_REP.enabled false→true; consistent-HEAD overlay config+sim+game+render, sim/game/render byte-identical no-ops from same HEAD; input.js not needed=no new key; divergent∩MODS={sim/config.js}; anti-CAS-2220 preflight PASS; byte-id OFF until first rep; reversible 1-line)",
});
console.log(JSON.stringify(res, null, 2));
