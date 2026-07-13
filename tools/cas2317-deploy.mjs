import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2317: LIVE FLIP of Compañeros de Ruta / Wayfarers' Fellowship (flag FELLOWSHIP_BOND) — enciende la capa
// social PERSONAL (EVO mecánica #47, hilo nuevo tras cerrar el arco Órdenes/Santuario). INDEPENDIENTE del arco
// de Órdenes (reloj + roster PROPIOS). Banda semanal COMPARTIDA = fn PURA del reloj de pared (fellowRoster rota
// size:3 del roster-6 por hash Knuth ⇒ MISMA banda en N clientes, 0 desync, rota cada semana). Vínculo PERSONAL
// = kills − snapshot h.fellowAt (contador monótono, 0 hook, SIN input.js). Pasivo al FORJAR = fellowMul(h,"xpGain")
// +0.10 en un canal NUEVO (kind ÚNICO ⇒ 0 doble-conteo con oath/ledger/standings/territory/contest).
// CEO Gate APPROVED on CAS-2316; QA independent OBSERVABLE = 13/13 PASS (×2 estable) on DARK build c4a549ae2fa1
// (byte-id OFF re-verificado; CONVERGENCIA 2-cliente real). CEO independent LIVE byte-verify PASS on 58ca99608ccd
// (FELLOWSHIP_BOND ABSENT = DARK correcto pre-flip).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   Fellowship = fila SOLO-lectura "Compañeros de Ruta" en el Tablón + glifo ∞ nameplate ⇒ 0 nuevo hotkey/slot
//   (anti-CAS-2273/CAS-2220) ⇒ input.js no cambia ⇒ overlay 4-file, como Contest/Territory/Standings/Ledger/Oath.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en FELLOWSHIP_BOND (1 línea).
//   render.js: deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js), NO el working tree —
//   el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA byte-id OFF): el flip sólo pone enabled:true; tickFellowship nunca corre OFF,
//   G.fellowship/h.fellowAt nunca se crean, save omite fellowAt. Reversible 1-line: FELLOWSHIP_BOND.enabled true→false
//   + re-run este overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2317 LIVE FLIP: Compañeros de Ruta / Wayfarers' Fellowship (FELLOWSHIP_BOND.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, la Hermandad es fila SOLO-lectura Tablón + glifo ∞ nameplate = 0 hotkey/0 slot móvil, como Contest/Territory/Standings/Ledger/Oath; render.js WIP CAS-2200 no shipped; capa social PERSONAL independiente del arco Órdenes; banda semanal COMPARTIDA fn pura del reloj + vínculo PERSONAL kills−fellowAt; pasivo forjado fellowMul xpGain +0.10 kind ÚNICO 0 doble-conteo; byte-id OFF 0 save key; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
