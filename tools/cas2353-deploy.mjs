import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2353: LIVE FLIP of Afluencia / Influx Surge (flag INFLUX_SURGE) — enciende el PILAR FRESCO EVO#56.
// Eje NUEVO = TASA DE LLEGADA (afluencia/flujo): el server cuenta cuántos jugadores NUEVOS CRUZAN hacia una zona
// por ventana (EDGE-triggered = ids nuevos respecto al snapshot previo; NO stock/headcount). Acumulador con DECAY
// determinista vida-media 30s (0 RNG, reloj de pared compartido) al parar el flujo; umbrales 2/4/6 llegadas ->
// tier -> boost restedMult 0.05/0.10/0.15 (determinista, monótono, cap surge 10). DIFERENCIADOR ≠ Congregación (#51)
// y ≠ Frontier (#55): multitud QUIETA prev==now (mismos ids) -> 0 llegadas -> NO abre; oleada de recién-llegados ->
// abre. Passive COMPARTIDO (influxMul canal restedMult) precedencia MÁXIMO ÚNICO: INFLUX_SURGE es la 11ª y MÁS BAJA
// del canal -> cede (return 0) a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/
// FRONTIER_SPREAD; territory/fellowship ⊥. byte-id OFF por CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin
// key influx*, worldFingerprint estable). SIN input.js: Afluencia es passive automático server-driven + badge (0 hotkey).
//
// CEO Gate APPROVED (EVO#56 CAS-2352) + issue dedicado CAS-2353; QA OBSERVABLE DARK build c4a549ae2fa1 = 14/14 ×2
// (North Star convergencia 2-cliente byte-idéntica 0 desync; LIVE byte-verify 7/7 arc flags served true 0 regresión;
// 6 zonas broken=[]).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  {game.js, render/render.js, sim/config.js, sim/sim.js} (4 files).
//   Idéntico a CAS-2348: la última LIVE (FRONTIER flip 6646ee586a27) shipó estos 4 módulos; el DARK build CAS-2352
//   (commit e1362ab) los AVANZÓ de nuevo -> DIVERGEN y están en MODS -> overlay mínimo-y-suficiente = estos 4.
//   Todos behavior-neutral respecto al DARK QA'd (INFLUX_SURGE estaba hard-gated enabled:false; este flip lo pone true).
//
// consistent-HEAD: el único cambio master↔flip es enabled:false->true (1 línea, commit 2ba5560 PRIMERO). deployOverlay
//   envía el blob de HEAD, NO el working tree — el WIP CAS-2200 (M render/render.js en git status) NUNCA se envía
//   (se manda HEAD:render/render.js, la versión committeada por CAS-2352 sin el portal WIP).
//
// Reversible 1-line: INFLUX_SURGE.enabled true->false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2353 LIVE FLIP: Afluencia / Influx Surge (INFLUX_SURGE.enabled:true; overlay consistente-HEAD 4-file {game,render/render,sim/config,sim/sim} = divergent∩MODS del DARK build CAS-2352 aún no en gh-pages, todos behavior-neutral; SIN input.js, passive automático server-driven tasa-de-llegada-por-zona + badge = 0 hotkey; render.js WIP CAS-2200 no shipped=HEAD blob; PILAR FRESCO EVO#56 — eje NUEVO TASA DE LLEGADA: nº jugadores NUEVOS que cruzan hacia zona por ventana = afluencia edge-triggered server-authoritative, umbrales 2/4/6->+0.05/0.10/0.15 restedMult, decay vida-media 30s cap10; DIFERENCIADOR ≠ Congregación/Frontier: multitud quieta prev==now->0 llegadas->NO abre, oleada recién-llegados->abre; precedencia MÁXIMO ÚNICO INFLUX 11ª/última cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD coexiste FELLOWSHIP/TERRITORY; QA DARK 14/14 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Frontier/LongWatch/DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
