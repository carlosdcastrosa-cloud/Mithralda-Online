import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2378: LIVE FLIP de Sendero / Trailcraft (flag TRAILCRAFT) — enciende EVO mecánica #63.
// CEO Gate APPROVED en CAS-2377 (QA DARK PASS 19/19 ×2, build c4a549ae2fa1). Serialización liberada:
// #62 FOCUS_FIRE ya LIVE & closed (CAS-2375/2376, build 66ccf593d6c6, postQA PASS 31/31 ×2, 0 desync).
//
// Eje FRESCO = DIVERSIDAD DE TERRENO (variedad CUALITATIVA): el server cuenta, per-pid, el nº de TIPOS
// de bioma DISTINTOS que un jugador pisa en una ventana deslizante de 30s (`trailVariety`, server-auth,
// 0-RNG, decay half-life 25s). variety≥minVariety(2) ⇒ acumula `trailcraft`; tiers 2/4/6 → +1/+1/+2 pasos.
// OPUESTO a Wayfarer #61 (amplitud/celdas): vueltas en 1 solo bioma ⇒ variety 1 ⇒ NUNCA abre; cruzar biomas
// distintos ⇒ abre. Canal FRESCO = `lootQuality` (5º canal, sube el PISO de rareza `minR` del drop de gear,
// NO oro). ⊥ goldFind / restedMult / wardRegen / oocMitigation.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files).
//   La última LIVE fue el flip+deploy FOCUS_FIRE (CAS-2375, 66ccf593d6c6), overlay config-only. DESDE
//   entonces master avanzó con el DARK BUILD de #63 (7229633), que añadió la lógica TRAILCRAFT a
//   game.js / render/render.js / sim/sim.js (badge + tickTrailcraft + trailcraftFloor/seam lootQuality) —
//   inerte con enabled:false — más este flip config-1-línea (3d53ff0). Por eso los 3 archivos de código NO
//   son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror del flip WAYFARER 4-file CAS-2373). El
//   preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ el WIP CAS-2200 de render.js
// (no commiteado) NO se shipea; se envía el blob HEAD = exactamente el build DARK verificado por QA.
// Reversible 1-line: TRAILCRAFT.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2378 LIVE FLIP: Sendero / Trailcraft (TRAILCRAFT.enabled:true) — EVO#63. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE FOCUS_FIRE CAS-2375 66ccf593d6c6, master avanzó el DARK build de #63 7229633 que añadió la lógica TRAILCRAFT a game/render/sim.js + este flip config-1-línea 3d53ff0; por eso los 3 archivos de código NO son byte-idénticos y entran al overlay, mirror WAYFARER CAS-2373). Canal FRESCO lootQuality (sube el piso minR de rareza del drop de gear, NO oro) por DIVERSIDAD DE TERRENO (nº de TIPOS de bioma DISTINTOS por-pid en ventana 30s, server-auth 0-RNG, decay hl25s), tiers 2/4/6 → +1/+1/+2 pasos de rareza; ⊥ goldFind/restedMult/wardRegen/oocMitigation. CEO Gate APPROVED CAS-2377 (QA DARK 19/19 ×2). Serializado tras #62 FOCUS_FIRE LIVE&closed. 15 arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
