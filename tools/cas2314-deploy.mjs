import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2314: LIVE FLIP of Asalto al Santuario / Sanctuary Contest (flag ORDER_CONTEST) — convierte el control
// PASIVO del Santuario (ORDER_TERRITORY, ya LIVE: la orden LÍDER controla y la transferencia es pasiva en el
// límite semanal) en TERRITORIO-EN-DISPUTA DINÁMICO: una VENTANA DE ASALTO recurrente y determinista donde el
// RETADOR (2º de ORDER_STANDINGS) acumula contribución (surge) y, superando el umbral (holdMargin), ARREBATA el
// control ACTIVAMENTE — flip visible inmediato a todos los jugadores en-zona. 100% DERIVADO (0 estado nuevo):
// contestState() lee G.ledger.frac + G.standings (cachés compartidas) ⇒ MISMA ventana+flip en MISMO tick
// (0 desync, convergencia N-clientes). PRECEDENCIA anti-doblado: ORDER_CONTEST NO añade canal de pasivo propio —
// SÓLO reescribe QUIÉN es el controlador efectivo de ORDER_TERRITORY (canal safeRegen, sólo en zona); ORDER_STANDINGS
// (canal restedMult, al 1º del ranking) queda INTACTO. CEO Gate APPROVED on CAS-2313; QA independent OBSERVABLE =
// 13/13 PASS on DARK build c4a549ae2fa1 (byte-id OFF verified; CONVERGENCIA 2-cliente real). CEO independent LIVE
// byte-verify PASS on e846ad919192 (ORDER_CONTEST ABSENT = DARK correcto pre-flip).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   Contest reutiliza banner/nameplate/UI Santuario existente ⇒ 0 nuevo hotkey/slot (anti-CAS-2273/CAS-2220)
//   ⇒ input.js no cambia ⇒ overlay 4-file, como Territory/Standings/Ledger/Oath (CAS-2311/2306/2301/2296).
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen).
//
// consistent-HEAD: la QA commit (261183e) NO tocó ninguno de los 4 overlay files vs el DARK build (2698554);
//   el único cambio de código es el flip enabled:false→true. render.js: deployOverlay envía el blob de HEAD
//   (git rev-parse HEAD:render/render.js), NO el working tree — el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA byte-id OFF): el flip sólo pone enabled:true; estado 100% DERIVADO
// (contestState lee cachés compartidas; save NO añade clave). Reversible 1-line: ORDER_CONTEST.enabled true→false
// + re-run este overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2314 LIVE FLIP: Asalto al Santuario / Sanctuary Contest (ORDER_CONTEST.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, el Asalto reutiliza banner/nameplate/UI Santuario = 0 hotkey/0 slot móvil, como Territory/Standings/Ledger/Oath; render.js WIP CAS-2200 no shipped; arco Santuario ORDER_TERRITORY/ORDER_STANDINGS/SANCTUARY_LEDGER/SANCTUARY_OATH/SANCTUARY_EMISSARY/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/WORLD_EVENT/RECALL/SAFEZONE/RESTED_XP/TEMPLE_RESPAWN intacto enabled:true; byte-id OFF 0 save key; precedencia anti-doblado contest reescribe controlador territory-safeRegen, standings-restedMult INTACTO; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
