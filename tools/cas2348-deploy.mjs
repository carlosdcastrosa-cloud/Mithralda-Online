import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2348: LIVE FLIP of Expedición / Frontier Spread (flag FRONTIER_SPREAD) — enciende el PILAR FRESCO EVO#55.
// Eje NUEVO = DISPERSIÓN ESPACIAL: el server cuenta cuántas sub-celdas coarse (128px) DISTINTAS ocupa la
// comunidad por zona (cobertura/spread, server-authoritative); umbrales 2/3/4 sub-celdas distintas -> tier ->
// boost restedMult 0.05/0.10/0.15 (determinista, monótono); DECAE vida-media 45s (0 RNG, reloj compartido) al
// bajar la cobertura. DIFERENCIADOR ≠ Congregación (#51): N jugadores AMONTONADOS en la MISMA sub-celda -> cover 1
// -> NO abre (Congregación SÍ abriría por headcount bruto); repartidos en >=2 sub-celdas -> abre. Passive COMPARTIDO
// (frontierMul canal restedMult) precedencia MÁXIMO ÚNICO: FRONTIER_SPREAD es la 10ª y MÁS BAJA del canal ->
// cede (return 0) a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH; territory/fellowship ⊥.
// byte-id OFF por CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin key frontier*, worldFingerprint estable).
// CEO Gate APPROVED (EVO#55 CAS-2347) + issue dedicado CAS-2348; QA OBSERVABLE DARK build c4a549ae2fa1 = 14/14 ×2
// (North Star convergencia 2-cliente byte-idéntica 0 desync; 0 regresión 6 flags LIVE; 6 zonas broken=[]).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  {game.js, render/render.js, sim/config.js, sim/sim.js} (4 files).
//   A diferencia de CAS-2343 (overlay 1-file), el DARK build CAS-2347 (commit 5538c7f) tocó estos 4 módulos
//   cargados en master HEAD pero NO están todavía en gh-pages (última LIVE = LONG_WATCH flip fbe05d8feccc) =>
//   DIVERGEN y están en MODS => el overlay mínimo-y-suficiente es exactamente estos 4. Todos behavior-neutral
//   (FRONTIER_SPREAD estaba hard-gated enabled:false; este flip lo pone true). SIN input.js: Expedición es passive
//   automático server-driven + badge (0 hotkey).
//
// consistent-HEAD: el único cambio master↔flip es enabled:false->true (1 línea, commit d0f81e3 PRIMERO). deployOverlay
//   envía el blob de HEAD, NO el working tree — el WIP CAS-2200 (M render/render.js en git status) NUNCA se envía
//   (se manda HEAD:render/render.js, que es la versión committeada por CAS-2347 sin el portal WIP).
//
// Reversible 1-line: FRONTIER_SPREAD.enabled true->false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2348 LIVE FLIP: Expedición / Frontier Spread (FRONTIER_SPREAD.enabled:true; overlay consistente-HEAD 4-file {game,render/render,sim/config,sim/sim} = divergent∩MODS del DARK build CAS-2347 aún no en gh-pages, todos behavior-neutral; SIN input.js, passive automático server-driven cobertura-espacial-por-zona + badge = 0 hotkey; render.js WIP CAS-2200 no shipped=HEAD blob; PILAR FRESCO EVO#55 — eje NUEVO DISPERSIÓN ESPACIAL: nº sub-celdas 128px DISTINTAS ocupadas por zona = cobertura server-authoritative, umbrales 2/3/4->+0.05/0.10/0.15 restedMult, decae vida-media 45s; DIFERENCIADOR ≠ Congregación: amontonados misma sub-celda->cover1->NO abre, repartidos>=2->abre; precedencia MÁXIMO ÚNICO FRONTIER 10ª/última cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH coexiste FELLOWSHIP/TERRITORY; QA DARK 14/14 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco LongWatch/DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul/Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
