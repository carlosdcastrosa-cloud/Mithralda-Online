import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2296: LIVE FLIP of Juramento del Santuario / Sanctuary Oath (flag SANCTUARY_OATH) — la capa de
// IDENTIDAD de ORDEN/gremio del arco Santuario (3 Órdenes deterministas: Alba safeRegen+25% / Hierro
// restedCap+30% / Errante recallCd−15%, vía oathMul sumado junto a sanctuaryRewardMul en los chokepoints
// del Intendente). CEO Gate APPROVED on CAS-2295; QA independent OBSERVABLE = 13/13 PASS on DARK build
// c4a549ae2fa1 (byte-id OFF verified; REAL player input: pointerdown en los chips de orden del Tablón vía
// el EXISTENTE bountyTap — 0 hotkey nuevo, 0 slot móvil nuevo; nameplate-tag; fps no-regression).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","sim/config.js","sim/sim.js","render/render.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in the divergence set → NOT overlaid.
//   Unlike the Emissary (CAS-2293, 5 files — dedicated key "Insert" + tb.emissary made input.js diverge),
//   the Oath pledge reuses the EXISTING bountyTap path (chips tappables en ui.bountyRects dentro de
//   renderBounty): 0 nueva tecla, 0 nuevo slot móvil ⇒ input.js no cambia ⇒ overlay 4-file, como Warhorn
//   (CAS-2289). The DARK subsystem landed at HEAD across all 4: config (SANCTUARY_OATH export + orders/
//   cooldown/minRank knobs), sim.js (tryPledgeOath / oathMul en chokepoints / h.oath derived state),
//   game.js (__dev.oath hook), render.js (renderOathRow chips + nameplate ⟦tag⟧ gated draw).
//   El ticket lista "config+sim+render+game" (4, SIN input) — coincide con la divergencia computada; el
//   preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen). Confío en el grafo, no en la prosa.
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   el WIP CAS-2200 (portal, M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): the flip only sets enabled:true; estado 100% DERIVADO
// (h.oath sólo se crea al jurar; save omite el campo cuando OFF). Reversible 1-line: SANCTUARY_OATH.enabled
// true→false + re-run this overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2296 LIVE FLIP: Juramento del Santuario / Sanctuary Oath (SANCTUARY_OATH.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, el juramento reusa el bountyTap existente = 0 hotkey/0 slot móvil, como Warhorn; render.js WIP CAS-2200 no shipped; arco Santuario SANCTUARY_EMISSARY/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/WORLD_EVENT/RECALL/SAFEZONE/RESTED_XP/TEMPLE_RESPAWN intacto enabled:true; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
