import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2406: LIVE FLIP de Vendaval / Tempestad (flag TEMPEST_SURGE) — enciende EVO mecánica #68.
// QA DARK PASS 38/38 ×2 (CAS-2405, build c4a549ae2fa1, origin/master a5aa7eb) + CEO Gate APPROVED
// (parent CAS-2404 comment 99a3394f) + CEO byte-verify DARK PASS. Config-only flip
// (TEMPEST_SURGE.enabled false→true, master 6ede5aa), NO rebuild de lógica. Serialización liberada:
// #67 CADENCE ya LIVE&closed (CAS-2402/2403, build 2eb21950aab9, postQA PASS 40/40).
//
// Eje = CONDICIÓN METEOROLÓGICA (world-CONDITION shard-wide, el 1er eje anclado a una CONDICIÓN del mundo, NO
// a un contador personal): la intensidad de tormenta = función PURA del reloj compartido determinista (mirror
// WEATHER.cycleSeconds/epochMs, 0-RNG, 0 timer client-local, STATELESS: 0 acumulador per-pid), ventana fase
// 0.28–0.45 alineada a "lluvia plena" de WEATHER, rampa TRIANGULAR (arrecia→pico→amaina); tiers por INTENSIDAD
// ≥0.34/≥0.67 → +1/+2 pisos de rareza. Canal REUSADO = `lootQuality` (piso minR de rollGearInst, MISMO seam
// que Trailcraft #63) con SHARE-CAP vs Trailcraft: pasos COMBINADOS min(tempestLootCap 3, trailSteps+tempestSteps)
// ⇒ 0 doble-dip. Gate EXPOSICIÓN outdoor [forest,ruins,abyss,frost,swamp], caves EXCLUIDA (resguardada).
// ⊥ Cadence #67 (meter personal) y ⊥ Nocturne #66 (fase noche): "noche tormentosa" abre AMBOS ⇒ ortogonalidad.
// ⊥ goldFind/restedMult/wardRegen/oocMitigation/critChance/xpGain/vamp (seams distintos).
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy CADENCE (CAS-2402, 2eb21950aab9), overlay CONFIG-ONLY. DESDE entonces
//   master avanzó con el DARK BUILD de #68 TEMPEST (GE CAS-2404 e0d2742), que añadió su lógica (badge ⛈ +
//   derivación de intensidad de tormenta world-CONDITION + seam lootQuality con share-cap vs Trailcraft) a
//   game.js / render/render.js / sim/sim.js — inerte con enabled:false — más este flip config-1-línea (6ede5aa).
//   Por eso los 3 archivos de código NO son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror del flip
//   NOCTURNE/DELVE/TRAILCRAFT 4-file). El preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera
//   (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ cualquier WIP no commiteado NO se
// shipea; se envía el blob HEAD = exactamente el build DARK verificado por QA (c4a549ae2fa1) + el flip 1-línea.
// Los flags del arco LIVE previo siguen enabled:true (0-regr); TEMPEST_SURGE es el único que cambia false→true.
// Reversible 1-line: TEMPEST_SURGE.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2406 LIVE FLIP: Vendaval / Tempestad (TEMPEST_SURGE.enabled:true) — EVO#68. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE CADENCE CAS-2402 2eb21950aab9 config-only, master avanzó el DARK build #68 TEMPEST GE CAS-2404 e0d2742 que añadió su lógica a game/render/sim.js + este flip config-1-línea 6ede5aa; por eso los 3 archivos de código NO son byte-idénticos y entran al overlay, mirror NOCTURNE/DELVE/TRAILCRAFT 4-file). Eje CONDICIÓN METEOROLÓGICA (world-CONDITION shard-wide, intensidad = función PURA del reloj compartido determinista mirror WEATHER, 0-RNG, STATELESS, ventana fase 0.28–0.45 rampa triangular, tiers ≥0.34/≥0.67 → +1/+2 pisos rareza). Canal REUSADO lootQuality (piso minR rollGearInst, MISMO seam que Trailcraft #63) con SHARE-CAP min(tempestLootCap 3, trail+tempest steps) ⇒ 0 doble-dip; gate EXPOSICIÓN outdoor [forest,ruins,abyss,frost,swamp], caves EXCLUIDA (resguardada); ⊥ Cadence #67 (meter personal) y ⊥ Nocturne #66 (fase noche) — noche tormentosa abre AMBOS; ⊥ goldFind/restedMult/wardRegen/oocMitigation/critChance/xpGain/vamp. QA DARK PASS 38/38 ×2 CAS-2405 (build c4a549ae2fa1) + CEO Gate APPROVED (99a3394f) + CEO byte-verify DARK. Serializado tras #67 CADENCE LIVE&closed. Arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
