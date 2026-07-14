import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2339: LIVE FLIP of Confluencia / Diverse Company (flag DIVERSE_COMPANY) — enciende el PILAR FRESCO
// EVO#53: eje NUEVO de variedad de COMPOSICIÓN (NO densidad bruta). El server cuenta cuántas CLASES DISTINTAS
// (warrior/paladin/mage/druid/priest) co-presentes por zona; tiers 2/3/4 clases → boost restedMult
// 0.05/0.10/0.15 (determinista, monótono, 0 RNG). N clones de la MISMA clase NO abren confluencia — la MEZCLA
// abre, NO las cabezas (composición ≠ headcount de Congregación #51). Passive COMPARTIDO (confMul canal
// restedMult) con precedencia MÁXIMO ÚNICO: DIVERSE_COMPANY es la 8ª y MÁS BAJA del canal ⇒ cede (return 0)
// a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER; fellowship(xpGain)/territory(safeRegen) ⊥ coexisten.
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo, save-blob sin key conf*, worldFingerprint estable).
// CEO Gate a7bbb9dc APPROVED on CAS-2338; QA OBSERVABLE DARK build c4a549ae2fa1 = 18/18 PASS ×2 (North Star
// convergencia 2-cliente byte-idéntica; ★★ diferenciador check 6b composición≠headcount; cobertura 6 zonas
// broken=[]; byte-id OFF indep; 0 regresión).
//
// AUTHORITATIVE DIVERGENCE (computed independently by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html const MODS)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   Confluencia es passive automático server-driven (cuenta de clases distintas por zona) + badge nameplate
//   (0 hotkey, SIN input.js) ⇒ overlay 4-file, como Wayfarer/Congregation/Pulse/Soul/Mentor/Fellowship.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) es safe-by-construction y THROWS ante drift no cubierto (anti-CAS-2220).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en DIVERSE_COMPANY (1 línea,
//   commit PRIMERO — HEAD d36e800). deployOverlay envía el blob de HEAD, NO el working tree — el WIP CAS-2200
//   (M render/render.js en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN: el flip sólo pone enabled:true; el passive es compartido/derivado de la
//   diversidad server-authoritative por zona, 0 estado nuevo, save sin clave `conf`. Reversible 1-line:
//   DIVERSE_COMPANY.enabled true→false + re-run overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2339 LIVE FLIP: Confluencia / Diverse Company (DIVERSE_COMPANY.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, passive automático server-driven cuenta-de-clases-distintas-por-zona + badge = 0 hotkey, como Wayfarer/Congregation/Pulse/Soul/Mentor/Fellowship/Contest/Territory/Standings/Ledger; render.js WIP CAS-2200 no shipped; PILAR FRESCO EVO#53 — eje NUEVO variedad de COMPOSICIÓN: N clases DISTINTAS co-presentes por zona (2/3/4→+0.05/0.10/0.15 restedMult), la MEZCLA abre NO las cabezas, N clones misma clase NO cuentan; precedencia MÁXIMO ÚNICO DIVERSE_COMPANY 8ª/última cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER coexiste FELLOWSHIP/TERRITORY; QA DARK 18/18 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Congregation/WorldPulse/Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger/Wayfarer intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
