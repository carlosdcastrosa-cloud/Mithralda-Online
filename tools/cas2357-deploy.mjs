import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2357: LIVE FLIP of Sincronía de Batalla / Battle Synchrony (flag BATTLE_SYNC) — enciende el PILAR FRESCO EVO#57.
// Eje FRESCO = CORRELACIÓN / SIMULTANEIDAD de gestas de combate: el server cuenta cuántos jugadores DISTINTOS están
// co-presentes con un kill en la MISMA ventana deslizante (~5s). REUSA h.kills monótono (0 tracking nuevo, SIN input.js).
// DECAY = expiración de la ventana deslizante (0-RNG, reloj de pared compartido). Umbrales 2/3/4 jugadores distintos ->
// tier -> boost restedMult 0.05/0.10/0.15. DIFERENCIADOR: N presentes pero INACTIVOS (kills viejos) -> 0 -> NO abre
// (≠ Congregación #51 headcount, ≠ Afluencia #56 flujo); 2 en ventanas SEPARADAS -> 1 -> NO abre (correlación temporal);
// 1 solo matando -> 1 -> NO abre (requiere ≥2 distintos a la vez). Passive COMPARTIDO (syncMul canal restedMult),
// precedencia MÁXIMO ÚNICO: BATTLE_SYNC es la 12ª y MÁS BAJA del canal -> cede (return 0) a STANDINGS/MENTOR/SOUL/PULSE/
// CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE; territory/fellowship ⊥. byte-id OFF por
// CONSTRUCCIÓN (0 estado nuevo serializado, save-blob sin key sync*, G.sync/h.syncAt nunca, worldFingerprint estable).
//
// CEO Gate APPROVED (EVO#57 CAS-2355 umbrella, comment CEO "CEO Gate APPROVED ✅ → flip LIVE") + issue dedicado CAS-2357;
// QA OBSERVABLE DARK build c4a549ae2fa1 = 16/16 ×2 (North Star convergencia 2-cliente byte-idéntica 0 desync; LIVE
// byte-verify 8/8 arc flags served true 0 regresión; 6 zonas broken=[]).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  {game.js, render/render.js, sim/config.js, sim/sim.js} (4 files).
//   Idéntico a CAS-2353/CAS-2348: la última LIVE (INFLUX flip 4f8028979f1c) shipó estos 4 módulos; el DARK build CAS-2355
//   (commit 41ee639) los AVANZÓ de nuevo -> DIVERGEN y están en MODS -> overlay mínimo-y-suficiente = estos 4.
//   logic.js/version.js divergen pero NO están en MODS (no cargados por index.html) -> fuera del overlay.
//   Todos behavior-neutral respecto al DARK QA'd (BATTLE_SYNC estaba hard-gated enabled:false; este flip lo pone true).
//
// consistent-HEAD: el único cambio master↔flip es enabled:false->true (1 línea, commit 22457fb PRIMERO). deployOverlay
//   envía el blob de HEAD, NO el working tree — el WIP CAS-2200 (M render/render.js en git status) NUNCA se envía
//   (se manda HEAD:render/render.js, la versión committeada por CAS-2355 sin el portal WIP).
//
// Reversible 1-line: BATTLE_SYNC.enabled true->false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2357 LIVE FLIP: Sincronía de Batalla / Battle Synchrony (BATTLE_SYNC.enabled:true; overlay consistente-HEAD 4-file {game,render/render,sim/config,sim/sim} = divergent∩MODS del DARK build CAS-2355 aún no en gh-pages, todos behavior-neutral; SIN input.js, passive automático server-driven correlación-de-gestas-por-zona + badge = 0 hotkey; render.js WIP CAS-2200 no shipped=HEAD blob; PILAR FRESCO EVO#57 — eje FRESCO CORRELACIÓN/SIMULTANEIDAD: nº jugadores DISTINTOS co-presentes con kill en MISMA ventana ~5s (reusa h.kills), umbrales 2/3/4->+0.05/0.10/0.15 restedMult; DIFERENCIADOR: N presentes INACTIVOS->0->NO abre, 2 ventanas separadas->1->NO abre, 1 solo->1->NO abre; precedencia MÁXIMO ÚNICO BATTLE_SYNC 12ª/última cede STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE coexiste FELLOWSHIP/TERRITORY; QA DARK 16/16 ×2 build c4a549ae2fa1; byte-id OFF por construcción 0 save key; arco Influx/Frontier/LongWatch/DiverseCompany/Wayfarer/Congregation/WorldPulse/Soul intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
