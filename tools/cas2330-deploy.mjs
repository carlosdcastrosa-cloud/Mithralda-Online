import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2330: LIVE FLIP of Pulso del Mundo / World Pulse (flag WORLD_PULSE) — enciende el PIVOTE EVO#50:
// el PRIMER sistema de estado-de-mundo dinámico y AMBIENTAL (living-world), fuera del arco social/Orden.
// Reloj de pared COMPARTIDO (periodSec 240, epochMs 0, hash Knuth ⇒ 1 zona-en-Pulso de 6, fase VIVA liveFrac
// 0.5 luego DECAE ⇒ MISMA zona/fase N clientes, 0 desync). Passive COMPARTIDO NO per-hero (pulseMul +0.10
// canal restedMult SÓLO si en la zona-en-Pulso VIVA) ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo, 0 clave
// serializada). Precedencia PULSE cede a STANDINGS>MENTOR>SOUL; coexiste FELLOWSHIP(xpGain)/TERRITORY(safeRegen).
// CEO Gate APPROVED on CAS-2329; QA OBSERVABLE DARK build c4a549ae2fa1 = 12/12 PASS ×2 (North Star convergencia
// 2-cliente REAL; cobertura 6 zonas broken=[]; byte-id OFF indep; 0 regresión en los otros flags).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   El Pulso es passive automático + badge nameplate (0 hotkey, SIN input.js) ⇒ overlay 4-file, como
//   Soul/Mentor/Fellowship/Contest/Territory/Standings.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) es safe-by-construction y THROWS ante drift no cubierto (anti-CAS-2220).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en WORLD_PULSE (1 línea, commit
//   PRIMERO). deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js), NO el working tree — el
//   WIP CAS-2200 (M render/render.js en git status, círculos) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN: el flip sólo pone enabled:true; el passive es compartido/derivado del reloj,
//   0 estado nuevo, save sin clave `pulse`. Reversible 1-line: WORLD_PULSE.enabled true→false + re-run overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2330 LIVE FLIP: Pulso del Mundo / World Pulse (WORLD_PULSE.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, passive automático compartido + badge = 0 hotkey, como Soul/Mentor/Fellowship/Contest/Territory/Standings/Ledger; render.js WIP CAS-2200 no shipped; PIVOTE EVO#50 primer sistema de estado-de-mundo AMBIENTAL/living-world; reloj de pared COMPARTIDO fn pura ⇒ misma zona-en-Pulso/fase N clientes 0 desync; pulseMul +0.10 restedMult SÓLO en zona-en-Pulso VIVA, precedencia PULSE cede STANDINGS/MENTOR/SOUL coexiste FELLOWSHIP/TERRITORY; QA DARK 12/12 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
