import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2413: LIVE FLIP de Última Resistencia / Aguante (flag LAST_STAND) — enciende EVO mecánica #69.
// QA DARK PASS 40/40 (CAS-2412, build c4a549ae2fa1, HEAD limpio 40c7bd1 con ZONE_DOMINANCE ya revertido
// por dedup CAS-2411) + CEO Gate APROBADO. Config-only flip (LAST_STAND.enabled false→true, master 90d1c75),
// NO rebuild de lógica. Serialización satisfecha: #68 TEMPEST ya LIVE&closed (CAS-2406/2408).
//
// Eje = RATIO DE FUERZA / SUPERADO EN NÚMERO (local force-ratio / outnumbered): conteo INSTANTÁNEO
// server-auth de enemigos que ENGANCHAN al héroe (e.state∈{chase,windup,strike,recover,shield}) dentro de
// engageRadius220. Fn PURA de G.enemies+héroe ⇒ shard-consistente, 0-RNG/0-timer/STATELESS. Tiers por CONTEO
// ≥3→+6% / ≥5→+12% sobre regenPct. Canal REUSADO = `wardRegen` (MISMO seam wardRegenTick que Warding Ring #59)
// con SHARE-CAP: boost combinado min(lastStandWardCap 0.15, wardBoost+lastStandBoost) ⇒ 0 doble-dip. Byte-neutro
// OFF delegaba a wardMul(); con enabled:true la derivación corre. ⊥ Cadence #67 (meter)/Nocturne-Tempest #66/#68
// (reloj)/Kinship #60 (aliados)/Focus #62 (1-objetivo) — eje de CONTEO instantáneo de amenazas, distinto a todo.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy TEMPEST (CAS-2406), overlay 4-file. DESDE entonces master avanzó con el
//   DARK BUILD de #69 LAST_STAND (GE CAS-2409 4829872, badge ⚔ + derivación de force-ratio + seam wardRegen con
//   share-cap vs Warding), inerte con enabled:false, en game.js / render/render.js / sim/sim.js; luego CAS-2410
//   ZONE_DOMINANCE construido y REVERTIDO (dedup CAS-2411, HEAD limpio 40c7bd1) + QA DARK CAS-2412. Por eso los
//   3 archivos de código NO son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror TEMPEST/NOCTURNE 4-file).
//   El preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ WIP no commiteado NO se shipea; se
// envía el blob HEAD = exactamente el build DARK verificado por QA (c4a549ae2fa1) + el flip 1-línea (90d1c75).
// Los flags del arco LIVE previo #59–#68 siguen enabled:true (0-regr); LAST_STAND es el único que cambia
// false→true. NUNCA se reintroduce ZONE_DOMINANCE/CAS-2410 (ya revertido, ausente de HEAD).
// Reversible 1-line: LAST_STAND.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2413 LIVE FLIP: Última Resistencia / Aguante (LAST_STAND.enabled:true) — EVO#69. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE TEMPEST CAS-2406, master avanzó el DARK build #69 LAST_STAND GE CAS-2409 4829872 que añadió su lógica a game/render/sim.js inerte con enabled:false + este flip config-1-línea 90d1c75; ZONE_DOMINANCE CAS-2410 construido y REVERTIDO por dedup CAS-2411 ⇒ HEAD limpio 40c7bd1, ausente). Eje RATIO DE FUERZA / SUPERADO EN NÚMERO (conteo INSTANTÁNEO server-auth de enemigos enganchados e.state∈{chase,windup,strike,recover,shield} dentro engageRadius220, fn PURA 0-RNG/0-timer/STATELESS; tiers ≥3→+6% / ≥5→+12% sobre regenPct). Canal REUSADO wardRegen (MISMO seam wardRegenTick que Warding Ring #59) con SHARE-CAP min(lastStandWardCap 0.15, wardBoost+lastStandBoost) ⇒ 0 doble-dip. ⊥ Cadence #67 (meter) / Nocturne-Tempest #66/#68 (reloj) / Kinship #60 (aliados) / Focus #62 (1-objetivo). QA DARK PASS 40/40 CAS-2412 (build c4a549ae2fa1) + CEO Gate APROBADO. Serializado tras #68 TEMPEST LIVE. Arc flags previos #59-68 intactos (0-regr); ZONE_DOMINANCE NO reintroducido; anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
