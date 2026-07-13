import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2323: LIVE FLIP of Vínculo de Mentor / Mentorship Bond (flag MENTOR_BOND) — enciende la capa social
// ASIMÉTRICA veterano↔protégé (EVO mecánica #48, tras el Fellowship SIMÉTRICO EVO#47). Compañero semanal
// COMPARTIDO (roster fijo, hash Knuth ⇒ MISMO compañero N clientes, 0 desync) + ROL por GAP de nivel
// (≥5 ⇒ mentor / ≤−5 ⇒ protégé) + DWELL de co-presencia (kills − snapshot h.mentorAt). Protégé = boost de XP
// escalonado (canal restedMult, precedencia por MAYOR vs standings) / Mentor = título ⚜ (0 poder).
// CEO Gate APPROVED on CAS-2322; QA independent OBSERVABLE = 14/14 PASS (×2 estable) on DARK build c4a549ae2fa1
// (byte-id OFF re-verificado; CONVERGENCIA 2-cliente ASIMÉTRICA real: compañero/rol OPUESTOS, boosts aislados).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   Mentor = fila SOLO-lectura "Vínculo de Mentor" en el Tablón + título ⚜ nameplate ⇒ 0 nuevo hotkey/slot
//   (anti-CAS-2273/CAS-2220) ⇒ input.js no cambia ⇒ overlay 4-file, como Fellowship/Contest/Territory/Standings.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en MENTOR_BOND (1 línea,
//   commit dd748af). render.js: deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js),
//   NO el working tree — el WIP CAS-2200 (M en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN (QA byte-id OFF): el flip sólo pone enabled:true; tickMentor nunca corre OFF,
//   G.mentor/h.mentorAt nunca se crean, save omite mentorAt. Reversible 1-line: MENTOR_BOND.enabled true→false
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
  message: "CAS-2323 LIVE FLIP: Vínculo de Mentor / Mentorship Bond (MENTOR_BOND.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, el Vínculo es fila SOLO-lectura Tablón + título ⚜ nameplate = 0 hotkey/0 slot móvil, como Fellowship/Contest/Territory/Standings/Ledger/Oath; render.js WIP CAS-2200 no shipped; capa social ASIMÉTRICA veterano↔protégé EVO#48; compañero semanal COMPARTIDO fn pura del reloj + rol por GAP nivel + dwell kills−mentorAt; pasivo protégé mentorMul restedMult escalonado precedencia MAYOR vs standings, mentor título ⚜ 0 poder; byte-id OFF 0 save key; arco Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
