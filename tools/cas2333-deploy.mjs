import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2333: LIVE FLIP of Congregación / Gathering Density (flag CONGREGATION) — enciende el PIVOTE EVO#51:
// la mecánica MÁS multiplayer-native del arco, dirigida por el HEADCOUNT REAL de jugadores LIVE por zona
// (presencia server-authoritative), NO por reloj (World Pulse #50) NI vínculo (Fellowship/Mentor/Soul #47–49).
// Server empuja {zona→cuenta} ⇒ cliente REFLEJA. Tiers 0-RNG [{2,0.05},{4,0.10},{8,0.15}] DECAE sin histéresis,
// 6 zonas de caza. Passive COMPARTIDO (congMul canal restedMult) con precedencia MÁXIMO ÚNICO: CONGREGATION la
// MÁS BAJA ⇒ cede (return 0) a STANDINGS/MENTOR/SOUL/PULSE; fellowship(xpGain)/territory(safeRegen) ⊥ coexisten.
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo, 0 clave serializada, save allowlist + fp idénticos HEAD).
// CEO Gate APPROVED on CAS-2332; QA OBSERVABLE DARK build c4a549ae2fa1 = 18/18 PASS ×2 (North Star convergencia
// 2-cliente byte-idéntica; cobertura 6 zonas broken=[]; byte-id OFF indep; 0 regresión en los otros flags).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   La Congregación es passive automático server-driven + badge nameplate (0 hotkey, SIN input.js) ⇒ overlay
//   4-file, como Pulse/Soul/Mentor/Fellowship/Contest/Territory/Standings.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) es safe-by-construction y THROWS ante drift no cubierto (anti-CAS-2220).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en CONGREGATION (1 línea, commit
//   PRIMERO — HEAD 0409e7c). deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js), NO el
//   working tree — el WIP CAS-2200 (M render/render.js en git status, círculos) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN: el flip sólo pone enabled:true; el passive es compartido/derivado del headcount
//   server-authoritative, 0 estado nuevo, save sin clave `congregation`. Reversible 1-line: CONGREGATION.enabled
//   true→false + re-run overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2333 LIVE FLIP: Congregación / Gathering Density (CONGREGATION.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, passive automático server-driven + badge = 0 hotkey, como Pulse/Soul/Mentor/Fellowship/Contest/Territory/Standings/Ledger; render.js WIP CAS-2200 no shipped; PIVOTE EVO#51 la mecánica MÁS multiplayer-native del arco — HEADCOUNT REAL LIVE por zona server-authoritative; tiers 0-RNG decae, congMul +restedMult, precedencia MÁXIMO ÚNICO CONGREGATION cede STANDINGS/MENTOR/SOUL/PULSE coexiste FELLOWSHIP/TERRITORY; QA DARK 18/18 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco WorldPulse/Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
