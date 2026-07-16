import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2421: LIVE FLIP de Terreno Firme / Pisada Firme (flag FIRM_FOOTING) — enciende EVO mecánica #70.
// QA DARK PASS 17/17 (CAS-2419, build c4a549ae2fa1, HEAD 3de0fe58d7a2) + CEO byte-verify DARK PASS + CEO Gate
// APROBADO. Config-only flip (FIRM_FOOTING.enabled false→true, master b44783a), NO rebuild de lógica.
// Serialización satisfecha: #69 LAST_STAND ya LIVE&closed (CAS-2413/2414).
//
// Eje = ESPACIAL / POSICIÓN-EN-EL-MUNDO: el MATERIAL DE TERRENO server-auth (world.terr) del tile bajo el
// héroe → tabla de tiers por FIRMEZA del material (grass/dirt→+8, stone/cobble/street→+16, resto→+0),
// LUT PURA determinista, 0-RNG/0-timer/STATELESS (0 clave G.firmFooting*). El MATERIAL fino del tile CRUZA
// zonas (⊥ gates de zona-REGIÓN y ⊥ las 11 flags LIVE #59-#69). Canal FRESCO `atkspd` (NINGUNA de las 11 lo
// usa): entra al sink sumado heroAtkspd bajo el TECHO GLOBAL ATKSPD_TOTAL_CAP=130 ⇒ SHARE-CAP/DE-STACK
// automático (min(130, base+firm), 0 doble-dip) + sub-cap propio firmFootingCap=16. Byte-neutro OFF delegaba
// +0 exacto; con enabled:true el aporte de terreno corre.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy LAST_STAND (CAS-2413), overlay 4-file. DESDE entonces master avanzó con el
//   DARK BUILD de #70 FIRM_FOOTING (GE CAS-2415 3de0fe5, badge ⛰ + derivación terreno→atkspd + tabla de tiers),
//   inerte con enabled:false, en game.js / render/render.js / sim/sim.js. Por eso los 3 archivos de código NO
//   son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror LAST_STAND/TEMPEST/NOCTURNE 4-file). El
//   preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ WIP no commiteado NO se shipea; se
// envía el blob HEAD = exactamente el build DARK verificado por QA (c4a549ae2fa1) + el flip 1-línea (b44783a).
// Los flags del arco LIVE previo #59–#69 siguen enabled:true (0-regr, count 58→59); FIRM_FOOTING es el único que
// cambia false→true. Reversible 1-line: FIRM_FOOTING.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2421 LIVE FLIP: Terreno Firme / Pisada Firme (FIRM_FOOTING.enabled:true) — EVO#70. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE LAST_STAND CAS-2413, master avanzó el DARK build #70 FIRM_FOOTING GE CAS-2415 3de0fe5 que añadió su lógica a game/render/sim.js inerte con enabled:false + este flip config-1-línea b44783a). Eje ESPACIAL / POSICIÓN-EN-EL-MUNDO (material de terreno server-auth world.terr del tile bajo el héroe → tabla de tiers por firmeza: grass/dirt→+8, stone/cobble/street→+16, resto→+0; LUT PURA determinista, 0-RNG/0-timer/STATELESS, 0 clave G.firmFooting*). El material fino del tile CRUZA zonas ⇒ ⊥ gates de zona-REGIÓN y ⊥ las 11 flags LIVE #59-#69. Canal FRESCO atkspd (NINGUNA de las 11 lo usa) bajo TECHO GLOBAL ATKSPD_TOTAL_CAP=130 ⇒ SHARE-CAP/DE-STACK automático min(130, base+firm), 0 doble-dip + sub-cap propio firmFootingCap=16. QA DARK PASS 17/17 CAS-2419 (build c4a549ae2fa1, HEAD 3de0fe5) + CEO byte-verify DARK PASS + CEO Gate APROBADO. Serializado tras #69 LAST_STAND LIVE&closed. Arc flags previos #59-69 intactos (0-regr, count 58→59); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
