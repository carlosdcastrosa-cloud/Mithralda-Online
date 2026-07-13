import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2301: LIVE FLIP of Libro de la Orden / Order Ledger (flag SANCTUARY_LEDGER) — el ÚLTIMO paso del
// arco social del Santuario: PROGRESIÓN COLECTIVA semanal de la orden. Marcador colectivo = fn PURA
// (period,orderId) `ledgerBaseline` (Knuth hash, rampado por frac de semana, 0 RNG) + contribución DERIVADA
// de contadores monótonos (h.kills wKill5 + h.sanctuaryRep wRep1) − snapshot per-semana h.ledgerAt. Orden
// del héroe = el JURAMENTO (SANCTUARY_OATH). Cruzar goal(1000) ⇒ pasivo `ledgerMul` en los MISMOS chokepoints
// que oathMul (recallCd/restedCap/safeRegen). CEO Gate APPROVED on CAS-2300; QA independent OBSERVABLE =
// 17/17 PASS on DARK build c4a549ae2fa1 (byte-id OFF verified; MULTIPLAYER 2-cliente convergencia per-orden;
// contribución per-héroe sin contención; pasivos por delta de knob efectivo gated al cruce del umbral).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  LOADED(index.html) .js  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in the divergence set → NOT overlaid.
//   El Libro no añade tecla ni slot móvil (fila SOLO-lectura en el panel bounty + ★ nameplate reusan rutas
//   existentes) ⇒ 0 nuevo hotkey (anti-CAS-2273) ⇒ input.js no cambia ⇒ overlay 4-file, como Warhorn/Oath
//   (CAS-2289/CAS-2296). logic.js diverge pero NO está en la lista de módulos cargados de index.html ⇒
//   irrelevante. El DARK subsystem landed at HEAD across all 4: config (SANCTUARY_LEDGER export + knobs),
//   sim.js (tickLedger / ledgerBaseline / ledgerMul en chokepoints / h.ledgerAt derived), game.js
//   (__dev.ledger hook + sanctuaryLedgerTag), render.js (renderLedgerRow fila + ★ nameplate gated draw).
//   El ticket lista "config+sim+render+game" (4, SIN input) — coincide con la divergencia computada; el
//   preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen). Confío en el grafo, no en la prosa.
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA hasField:false): the flip only sets enabled:true; estado 100% DERIVADO
// (G.ledger/h.ledgerAt sólo se crean con el subsistema activo; save omite el campo cuando OFF). Reversible
// 1-line: SANCTUARY_LEDGER.enabled true→false + re-run this overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2301 LIVE FLIP: Libro de la Orden / Order Ledger (SANCTUARY_LEDGER.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, el Libro es fila SOLO-lectura + ★ nameplate = 0 hotkey/0 slot móvil, como Warhorn/Oath; render.js WIP CAS-2200 no shipped; arco Santuario SANCTUARY_OATH/SANCTUARY_EMISSARY/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/WORLD_EVENT/RECALL/SAFEZONE/RESTED_XP/TEMPLE_RESPAWN intacto enabled:true; byte-id OFF save preserved; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
