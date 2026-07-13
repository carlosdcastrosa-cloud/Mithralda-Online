import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2273: LIVE FIX-FORWARD re-deploy of Tablón de Recompensas / Bounty Board — makes the feature REACHABLE by real
// players. The CAS-2270 LIVE flip (build 80fd94fed020) shipped the board with BOUNTY_BOARD.key="KeyB", which is DEAD
// CODE for the real player: customize/wardrobe (REBINDS settings.js:49, def "KeyB" since CAS-1659) wins in input.js
// edge() (playAction("KeyB")→"customize" returns BEFORE the bounty handler). So the only trigger was __dev — 100%
// unreachable in prod. GE fix fc7e8af moved key "KeyB"→"End" (free non-letter code, sibling of RECALL Home) + added a
// contextual mobile HUD button (tb.bounty, SAFEZONE-only). GE self-verify 9/9 + QA re-verify 7/7 (911acb0) both drove
// the REAL End key + mobile PointerEvent tap through the full accept→claim loop.
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","input.js","render/render.js","sim/config.js","sim/sim.js"]  (5 files).
//   (logic.js + version.js also diverge but are NOT in the MODS runtime graph → not loaded → safe to ignore per the
//    MODS-intersection rule; the preflight ignores non-loaded files.)
//   Same 5-file set as the CAS-2270 flip. gh-pages base = beb37fb4 (build 80fd94fed020, the KeyB-bug build).
//
// CONSISTENT-HEAD, NOT config-only: advancing config→HEAD (key "End") REQUIRES advancing its loaded siblings to HEAD
// together — input.js (mobile tb.bounty button + generic key dispatch), sim.js (heroInSafeZone export gating the button),
// render.js (tb.bounty gold-ready draw), game.js — all carry committed deltas since the base. The built-in preflight
// (divergent∩MODS ⊆ overlay) THROWS on any uncovered divergent module (anti-CAS-2220 boot-crash guard).
//
// SIDE-EFFECT (intended, safe): advancing config+sim+game+render to HEAD also ships CAS-2272 SANCTUARY_REP code, but it
// is DARK (enabled:false, hard-gated: tryBounty doesn't accrue, save omits the field, no indicator drawn) → byte-id OFF,
// zero behavior change. Standard: DARK subsystems ship inert in the served bundle until their own CEO-gated flip.
//
// Byte-id OFF preserved: no new save fields; BOUNTY_BOARD still hard-gated when a hero hasn't accepted a contract.
// Reversible: BOUNTY_BOARD.enabled true→false in sim/config.js + re-run an overlay redeploy (restores prior config blob).
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
  message: "CAS-2273 LIVE FIX-FORWARD: Bounty Board reachable via player input (BOUNTY_BOARD.key KeyB→End + mobile tb.bounty HUD button; overlay consistente-HEAD config+sim+game+render+input; CAS-2272 SANCTUARY_REP ships DARK enabled:false byte-id OFF; render.js WIP CAS-2200 not shipped=HEAD blobs; anti-CAS-2220 preflight PASS; reversible)",
});
console.log(JSON.stringify(res, null, 2));
