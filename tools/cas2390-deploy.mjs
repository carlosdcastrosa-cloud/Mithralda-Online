import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2390: LIVE FLIP de Erudición / Lorekeeper (flag ERUDITION) — enciende EVO mecánica #65.
// QA DARK PASS 19/19 ×2 (CAS-2381, build c4a549ae2fa1) + CEO Gate. GE agotado por límite semanal Claude
// (reset Jul 19 11am ET) ⇒ el flip (config + deploy, NO requiere GE) se enruta al CTO. Serialización liberada:
// #64 DELVE ya LIVE+verificado (CAS-2387/2389, build f4c877cf5725, DELVE:true, postQA PASS 31/31 ×2, 0 desync).
//
// Eje FRESCO = DIVERSIDAD DE PRESAS / bestiary breadth: el server cuenta, per-pid, el nº de TIPOS de enemigo
// DISTINTOS abatidos (loreVariety) en una ventana deslizante de 30s (server-auth, 0-RNG, decay half-life 25s).
// variety≥minVariety(3) ⇒ acumula `erudition`; tiers 2/4/6 → +5/+10/+15% XP. OPUESTO a FOCUS_FIRE #62
// (concentración en UN objetivo); distinto de Trailcraft #63 (variedad de TERRENO) — aquí es a QUIÉN matas.
// Canal REUSADO `xpGain` (multiplicador de XP por el chokepoint gainXP) con de-stack máximo-único: ERUDITION
// CEDE a FELLOWSHIP_BOND #47 (mirror EXACTO de FOCUS→KINSHIP en goldFind). ⊥ goldFind/restedMult/wardRegen/
// oocMitigation/lootQuality/critChance (seams distintos, 0 doble-conteo).
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { sim/config.js }  (config-only).
//   La última LIVE fue el flip+deploy DELVE (CAS-2387, build f4c877cf5725), overlay 4-file {game.js,
//   render/render.js, sim/config.js, sim/sim.js}. Ese overlay ya shipeó a gh-pages los blobs de game/render/
//   sim.js del HEAD de entonces — que YA INCLUÍAN la lógica DARK de ERUDITION #65 (a6d7780 aterrizó ANTES del
//   deploy DELVE b2c53d6). Desde entonces master sólo avanzó con ESTE flip config-1-línea (30755f7). Por eso
//   los 3 archivos de código SON byte-idénticos gh-pages↔HEAD y NO entran al overlay; sólo config.js diverge
//   (la línea enabled false→true). Overlay CONFIG-ONLY (mirror KINSHIP CAS-2367). El preflight MODS-intersection
//   FALLA RUIDOSAMENTE si dejo fuera algún módulo divergente (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía el blob de HEAD, NO el working tree ⇒ el WIP no commiteado NO se shipea.
// Reversible 1-line: ERUDITION.enabled true→false + re-run overlay.
const overlay = ["sim/config.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2390 LIVE FLIP: Erudición / Lorekeeper (ERUDITION.enabled:true) — EVO#65. Overlay CONFIG-ONLY {sim/config.js} = divergent∩MODS (desde el último LIVE DELVE CAS-2387 f4c877cf5725, cuyo overlay 4-file ya shipeó game/render/sim.js con la lógica DARK de ERUDITION #65 a6d7780 inerte; master sólo avanzó este flip config-1-línea 30755f7 ⇒ sólo config.js diverge, mirror config-only KINSHIP CAS-2367). Canal REUSADO xpGain (mult XP en gainXP) de-stack máximo-único cede a FELLOWSHIP #47; eje FRESCO DIVERSIDAD DE PRESAS (loreVariety = nº de TIPOS de enemigo DISTINTOS por-pid en ventana 30s, server-auth 0-RNG, minVariety 3, decay hl25s), tiers +5/+10/+15% XP; ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance. QA DARK PASS 19/19 ×2 CAS-2381 (build c4a549ae2fa1) + CEO Gate. Serializado tras #64 DELVE LIVE&verificado. 6 arc flags previos LIVE intactos (0-regr: DELVE/TRAILCRAFT/WAYFARER_ROAM/KINSHIP_BOND/FOCUS_FIRE/WARDING_RING); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
