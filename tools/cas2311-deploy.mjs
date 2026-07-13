import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2311: LIVE FLIP of Dominio de Órdenes / Order Territory (flag ORDER_TERRITORY) — convierte la
// CLASIFICACIÓN server-auth (ORDER_STANDINGS, ya LIVE) en ESTADO DE MUNDO VISIBLE y COMPARTIDO: la orden
// LÍDER de la semana CONTROLA el Santuario/Zona Segura (control de territorio, pilar MMORPG). 100% DERIVADO
// (0 estado nuevo): territoryController()=standingsLeader() (lee G.standings ya cacheado). El cliente SÓLO
// renderiza ⇒ 0 explotable + convergencia N-clientes. Estandarte ⚑tag en badge "Zona segura". Pasivo de
// DOMINIO +controlValue(0.10) al canal safeRegen (SÓLO en zona), gateado a que la orden del héroe (Juramento)
// SEA la controladora. Precedencia anti-doblado con STANDINGS: canales distintos (safeRegen vs restedMult) +
// guard duro RETURN 0 si controlKind===STANDINGS.leadKind. CEO Gate APPROVED on CAS-2310; QA independent
// OBSERVABLE = 15/15 PASS on DARK build c4a549ae2fa1 (byte-id OFF verified; CONVERGENCIA 2-cliente real).
// CEO independent LIVE byte-verify PASS on 45383a903df3 (ORDER_STANDINGS true SERVED, ORDER_TERRITORY ABSENT=DARK).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html) ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   Territory NO añade tecla ni slot móvil (estandarte automático + pasivo pasivo, 0 hotkey — anti-CAS-2273)
//   ⇒ input.js no cambia ⇒ overlay 4-file, como Standings/Ledger/Warhorn/Oath (CAS-2306/2301/2289/2296).
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen).
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA byte-id OFF): el flip sólo pone enabled:true; estado 100% DERIVADO
// (G.standings/G.territory sólo existen con el subsistema activo; save NO añade clave — reusa h.sanctuaryOath).
// Reversible 1-line: ORDER_TERRITORY.enabled true→false + re-run este overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2311 LIVE FLIP: Dominio de Órdenes / Order Territory (ORDER_TERRITORY.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, el Dominio es estandarte automático + pasivo de zona = 0 hotkey/0 slot móvil, como Standings/Ledger/Warhorn/Oath; render.js WIP CAS-2200 no shipped; arco Santuario ORDER_STANDINGS/SANCTUARY_LEDGER/SANCTUARY_OATH/SANCTUARY_EMISSARY/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/WORLD_EVENT/RECALL/SAFEZONE/RESTED_XP/TEMPLE_RESPAWN intacto enabled:true; byte-id OFF reusa h.sanctuaryOath 0 save key; precedencia anti-doblado STANDINGS safeRegen≠restedMult; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
