import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2336: LIVE FLIP of Sendero Trillado / Well-Trodden Path (flag WAYFARER_TRAIL) — enciende el PILAR
// FRESCO EVO#52: eje NUEVO de traversal/logística EMERGENTE. El mundo COMPARTIDO se desgasta con el paso
// AGREGADO de MUCHOS jugadores a lo largo del tiempo: el server acumula pisadas por celda coarse (cellSize
// 128px = 4 tiles), el tread DECAE determinista (vida-media 90s, 0 RNG, reloj de pared COMPARTIDO), y una
// celda con tread ≥ threshold(100) se vuelve Sendero Trillado ⇒ pasivo +0.06 restedMult a quien transita.
// 1 jugador solo NO abre sendero (requiere tránsito agregado de la comunidad). Passive COMPARTIDO
// (wayfarerMul canal restedMult) con precedencia MÁXIMO ÚNICO: WAYFARER es la MÁS BAJA del canal ⇒ cede
// (return 0) a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION; fellowship(xpGain)/territory(safeRegen) ⊥ coexisten.
// byte-id OFF por CONSTRUCCIÓN (G.wayfarer nunca creado, save-blob sin key wayfarer*, worldFingerprint estable).
// CEO Gate 998fc702 APPROVED on CAS-2335; QA OBSERVABLE DARK build c4a549ae2fa1 = 17/17 PASS ×2 (North Star
// convergencia 2-cliente byte-idéntica; cobertura 6 zonas broken=[]; byte-id OFF indep; 0 regresión).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   El Sendero es passive automático server-driven (tread por celda + decay) + badge nameplate (0 hotkey,
//   SIN input.js) ⇒ overlay 4-file, como Congregation/Pulse/Soul/Mentor/Fellowship/Contest/Territory/Standings.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) es safe-by-construction y THROWS ante drift no cubierto (anti-CAS-2220).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en WAYFARER_TRAIL (1 línea,
//   commit PRIMERO — HEAD 6db4926). deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js),
//   NO el working tree — el WIP CAS-2200 (M render/render.js en git status, círculos) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN: el flip sólo pone enabled:true; el passive es compartido/derivado del tread
//   server-authoritative por celda, 0 estado nuevo, save sin clave `wayfarer`. Reversible 1-line:
//   WAYFARER_TRAIL.enabled true→false + re-run overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2336 LIVE FLIP: Sendero Trillado / Well-Trodden Path (WAYFARER_TRAIL.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, passive automático server-driven tread-por-celda + decay determinista + badge = 0 hotkey, como Congregation/Pulse/Soul/Mentor/Fellowship/Contest/Territory/Standings/Ledger; render.js WIP CAS-2200 no shipped; PILAR FRESCO EVO#52 — eje NUEVO traversal/logística EMERGENTE: el mundo COMPARTIDO se desgasta con el paso AGREGADO de MUCHOS jugadores a lo largo del tiempo, celda coarse 128px tread≥100=Sendero ⇒ +0.06 restedMult, vida-media 90s 0-RNG, 1 jugador solo NO abre sendero; precedencia MÁXIMO ÚNICO WAYFARER cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION coexiste FELLOWSHIP/TERRITORY; QA DARK 17/17 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Congregation/WorldPulse/Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
