import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2343: LIVE FLIP of Vigilia / Long Watch (flag LONG_WATCH) — enciende el PILAR FRESCO EVO#54.
// Eje NUEVO = CONTINUIDAD TEMPORAL de habitación de una zona (≠ arco #47-53 social/densidad/composición):
// el server acumula un streak de segundos-ocupados-continuos por zona (server-authoritative); SUBE con
// presencia, DECAE vida-media 45s al vaciarse (0 RNG, reloj de pared COMPARTIDO), y ROMPE→0 tras un hueco
// > gapBreakSec 60s. Tiers 30/90/180s → boost restedMult 0.05/0.10/0.15 (determinista, monótono). Premia el
// RELEVO / hand-off: 1 jugador que entra-y-sale NO abre vigilia. Passive COMPARTIDO (longWatchMul canal
// restedMult) con precedencia MÁXIMO ÚNICO: LONG_WATCH es la 9ª y MÁS BAJA del canal ⇒ cede (return 0) a
// STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY; fellowship(xpGain)/territory(safeRegen) ⊥.
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin key longWatch*, worldFingerprint estable).
// CEO gate a3ed74a1 (CAS-2341) + issue dedicado CAS-2343 asignado por CEO; QA OBSERVABLE DARK build
// c4a549ae2fa1 = 14/14 PASS ×2 (North Star convergencia 2-cliente byte-idéntica; footgun render badge
// top-right+sidebar resuelto vía instrumentar ctx.fillText etiqueta "Vigilia" ON=52/OFF=0; cobertura 6 zonas
// broken=[]; byte-id OFF indep; 0 regresión 5 flags LIVE).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html const MODS)  ==  ["sim/config.js"]   (1 file).
//   Tras CAS-2342 (class-hero deploy), gh-pages ya sirve los blobs HEAD de game.js/sim/sim.js/render/render.js/
//   render/sprites.js ⇒ son BYTE-IDÉNTICOS a HEAD ⇒ NO divergen ⇒ NO requieren overlay. El único módulo cargado
//   que cambia con este flip es sim/config.js (enabled:false→true, 1 línea). El overlay mínimo-y-suficiente es
//   ["sim/config.js"]: preflight anti-CAS-2220 PASS (divergent∩MODS ⊆ overlay) y blast radius mínimo.
//   Vigilia es passive automático server-driven + badge (0 hotkey) ⇒ SIN input.js.
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en LONG_WATCH (1 línea,
//   commit PRIMERO — HEAD c9fb0d8). deployOverlay envía el blob de HEAD, NO el working tree — el WIP CAS-2200
//   (M render/render.js en git status) NUNCA se envía (render.js no diverge ⇒ ni siquiera está en el overlay).
//
// Reversible 1-line: LONG_WATCH.enabled true→false + re-run overlay.
const overlay = ["sim/config.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2343 LIVE FLIP: Vigilia / Long Watch (LONG_WATCH.enabled:true; overlay mínimo consistente-HEAD = sim/config.js — SIN input.js, passive automático server-driven streak-de-ocupación-continua-por-zona + badge = 0 hotkey; game/sim/render/sprites ya byte-idénticos a HEAD en gh-pages post-CAS-2342 ⇒ fuera del divergent∩MODS; render.js WIP CAS-2200 no shipped; PILAR FRESCO EVO#54 — eje NUEVO continuidad temporal de habitación: streak segundos-ocupados-continuos server-authoritative sube-con-presencia/decae-45s/rompe->0 tras hueco>60s, tiers 30/90/180s->+0.05/0.10/0.15 restedMult, premia relevo NO 1-jugador-entra-y-sale; precedencia MÁXIMO ÚNICO LONG_WATCH 9ª/última cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY coexiste FELLOWSHIP/TERRITORY; QA DARK 14/14 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
