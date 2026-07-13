import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2264: LIVE FLIP of the Descanso 'willSpend' HUD badge affordance (render-only overlay).
// CEO Gate APPROVED on CAS-2259 after QA OBSERVABLE PASS 20/20 (harness c28d8dd, artifact render.js eef27f0).
//
// AUTHORITATIVE DIVERGENCE (computed, NOT trusted from ticket):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  ["render/render.js"]  (ONLY).
//   sim/config.js, sim/sim.js, game.js are BYTE-IDENTICAL gh-pages↔HEAD (already LIVE since CAS-2256 build 5f266f2801ed).
// So the consistent-HEAD overlay is render.js ALONE. Preflight (divergent∩MODS ⊆ overlay) ⇒ missing:[].
//
// TICKET CORRECTION: issue said "currently LIVE render.js is a STUB, 0 rested refs" — FALSE. gh-pages render.js
// already carries the CAS-2255 BASE badge (6 rested refs, shipped in CAS-2256 overlay). HEAD adds the CAS-2259
// willSpend affordance (7 refs). Real delta = base-badge → willSpend ("zZ ×N" outside safezone / "acumulando" inside).
// Deploy target is unchanged: publish HEAD render.js (blob 2dad6b5b, the exact eef27f0/c28d8dd QA-tested artifact).
//
// SAFE-BY-CONSTRUCTION: HEAD render.js `import { RESTED_XP }` resolves against LIVE config.js (byte-id HEAD, has the
// RESTED_XP export block) ⇒ no ES-link crash (anti-CAS-2220). inCitySafe() is defined IN render.js (SAFEZONE badge,
// already LIVE) so the new willSpend read is intra-module. renderRestedBadge is gated on RESTED_XP.enabled (true LIVE).
// $0 art, 0-RNG deterministic, reversible 1-line (redeploy prior render.js blob 51c4d29d).
const overlay = [
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2264 LIVE FLIP: Descanso 'willSpend' HUD badge affordance (render-only consistent-HEAD overlay; RESTED_XP.enabled preserved true, sim/config byte-id HEAD; anti-CAS-2220 import RESTED_XP resolves vs LIVE config)",
});
console.log(JSON.stringify(res, null, 2));
