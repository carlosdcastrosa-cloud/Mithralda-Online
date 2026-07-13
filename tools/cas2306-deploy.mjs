import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2306: LIVE FLIP of Clasificación de Órdenes / Order Standings (flag ORDER_STANDINGS) — capa SOCIAL
// COMPETITIVA sobre el arco del Santuario: ranking SEMANAL COMPARTIDO de las 3 Órdenes + pasivo del LÍDER.
// Ranking = fn PURA `standingsRank(period)` de los BASELINES del Libro (ledgerBaseline — la parte COMUNITARIA/
// server-authoritative, NO la contribución per-hero) ⇒ TODO cliente con el mismo reloj converge a la MISMA
// clasificación, 0 desync bajo N jugadores. Pasivo del LÍDER = +leadValue (0.15) al mult de Descanso
// (RESTED_XP.xpMult 1.5→1.65) en el MISMO seam de gainXP que sanctuaryRewardMul("restedMult"), gateado a que
// la orden del héroe (su JURAMENTO) LIDERE esta semana. CEO Gate APPROVED on CAS-2305; QA independent OBSERVABLE
// = 14/14 PASS on DARK build c4a549ae2fa1 (byte-id OFF verified; CONVERGENCIA 2-cliente real; pasivo por knob
// efectivo gainQP restedXpMult 1.5→1.65 gated a LIDERAR). CEO independent LIVE byte-verify PASS on b856ba20eee2.
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html) ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in the divergence set → NOT overlaid.
//   La Clasificación no añade tecla ni slot móvil (fila SOLO-lectura en el panel del Tablón + ♛ nameplate reusan
//   rutas existentes) ⇒ 0 nuevo hotkey (anti-CAS-2273) ⇒ input.js no cambia ⇒ overlay 4-file, como
//   Ledger/Warhorn/Oath (CAS-2301/CAS-2289/CAS-2296). logic.js & version.js DIVERGEN pero NO están en MODS ⇒
//   irrelevantes (version.json lo regenera el deploy). El preflight (divergent∩MODS ⊆ overlay) lo hace
//   safe-by-construction y THROWS ante cualquier módulo divergente no cubierto (anti-CAS-2220 black screen).
//
// render.js: deployOverlay ships the HEAD blob (git rev-parse HEAD:render/render.js), NOT the working tree —
//   el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA byte-id OFF): el flip sólo pone enabled:true; estado 100% DERIVADO/
// transitorio (G.standings sólo existe con el subsistema activo; save NO añade clave — reusa h.sanctuaryOath).
// Reversible 1-line: ORDER_STANDINGS.enabled true→false + re-run este overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2306 LIVE FLIP: Clasificación de Órdenes / Order Standings (ORDER_STANDINGS.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, la Clasificación es fila SOLO-lectura panel Tablón + ♛ nameplate = 0 hotkey/0 slot móvil, como Ledger/Warhorn/Oath; render.js WIP CAS-2200 no shipped; arco Santuario SANCTUARY_LEDGER/SANCTUARY_OATH/SANCTUARY_EMISSARY/SANCTUARY_REWARDS/SANCTUARY_REP/BOUNTY_BOARD/WORLD_EVENT/RECALL/SAFEZONE/RESTED_XP/TEMPLE_RESPAWN intacto enabled:true; byte-id OFF reusa h.sanctuaryOath 0 save key; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
