import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2373: LIVE FLIP de Trotamundos / Wayfarer (flag WAYFARER_ROAM) — enciende EVO mecánica #61.
// SUPERSEDES el flip child original CAS-2371 (stalled). CEO Gate APPROVED en CAS-2369.
//
// Eje FRESCO = AMPLITUD DE EXPLORACIÓN INDIVIDUAL (roaming breadth): el server cuenta las CELDAS coarse
// DISTINTAS (cellSize 128) que UN pid ocupa en una VENTANA deslizante de 20s (`wayRoamBreadth`, PURA,
// server-authoritative, 0-RNG; decay = expiración de ventana, NO half-life). Tiers 2/3/4 → T1/2/3.
// Canal PASIVO FRESCO = `oocMitigation` (4º canal, ⊥ restedMult/goldFind/wardRegen ⇒ 0 doble-conteo):
// seam `damageHero` `if(_roamCombatT<=0){real*=(1-wayRoamMul)} _roamCombatT=combatWindowSec3` ⇒ sólo el
// 1er golpe de la refriega se mitiga. DESACOPLADO del movimiento (NO move-speed ⇒ 0 runaway/desync).
// −5/10/15% cap maxMitigation 0.15.
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==
//     { game.js, render/render.js, sim/config.js, sim/sim.js }  (4 files).
//   La última LIVE fue el flip config-only KINSHIP_BOND (CAS-2367, 40622de6bc8f) — desde entonces master
//   avanzó con el DARK build WAYFARER (9517720: game.js +1, render/render.js badge ⇈ "Trotamundos",
//   sim/sim.js breadth+oocMitigation, sim/config.js WAYFARER_ROAM) más este flip (af6fe2e, config 1-línea).
//   Overlay 4-file = mínimo-y-suficiente. El DARK build de #62 FOCUS_FIRE (b201247) tmb tocó estos módulos
//   pero enabled:false ⇒ inerte; NO se enciende aquí (anti-stacking: 1 arco valida a la vez).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree — el WIP CAS-2200
//   (M render/render.js en git status) NUNCA se envía; se shipea HEAD:render/render.js (badge Wayfarer
//   committeado, sin el WIP).
//
// Reversible 1-line: WAYFARER_ROAM.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2373 LIVE FLIP: Trotamundos / Wayfarer (WAYFARER_ROAM.enabled:true) — EVO#61 (SUPERSEDES stalled CAS-2371, CEO Gate APPROVED CAS-2369). Overlay 4-file {game.js,render/render.js,sim/config.js,sim/sim.js} = divergent∩MODS (DARK build 9517720 avanzó game/render/sim.js desde el último LIVE config-only KINSHIP CAS-2367 40622de6bc8f; render.js WIP CAS-2200 no shipped=HEAD blob). Canal PASIVO FRESCO oocMitigation (mitigación daño FUERA DE COMBATE, seam damageHero, sólo 1er golpe refriega) por AMPLITUD DE EXPLORACIÓN (celdas coarse 128 distintas/ventana 20s, breadth per-pid server-auth 0-RNG, DESACOPLADO del movimiento ⇒ 0 desync), tiers 2/3/4 → −5/10/15% cap 0.15; ⊥ restedMult/goldFind/wardRegen ⇒ 0 doble-conteo. FOCUS_FIRE #62 sigue DARK enabled:false (anti-stacking). Serializado tras #60 KINSHIP_BOND LIVE. arco previo intacto; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
