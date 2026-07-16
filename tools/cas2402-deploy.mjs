import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2402: LIVE FLIP de Cadencia / Ímpetu de Combate (flag CADENCE_RUSH) — enciende EVO mecánica #67.
// QA DARK PASS 40/40 (CAS-2401, build c4a549ae2fa1) + CEO Gate APPROVED + CEO byte-verify (origin/master f2bf0b9).
// Config-only flip (CADENCE_RUSH.enabled false→true), NO rebuild de lógica. Serialización liberada: #66 NOCTURNE
// ya LIVE&closed (CAS-2396/2397, build fb99d94eca23, postQA PASS 31/31 ×2).
//
// Eje = TEMPO/CADENCIA DE MATANZA: el server sube un combo-meter server-auth por kill (bumpPerKill) con decay
// determinista COMPARTIDO (half-life 6s, mirror tickNocturne/tickDelve, MMORPG-safe 0-RNG) ⇒ el meter mide el
// RATE reciente de kills; tiers +8/+15/+25% crit. Canal REUSADO = `critChance` (MISMO que Delve #64) con DOBLE cap:
// (1) CAP DURO propio cadenceCritCap ≤35% y (2) SHARE-CAP con el bono de crit de Delve — el bono COMBINADO
// delve+cadence se capa a cadenceCritCap ⇒ 0 doble-dip; + CAP absoluto critCapPct 50 (base+bonos). ⊥
// goldFind/restedMult/wardRegen/oocMitigation/lootQuality/xpGain/vamp (seams distintos).
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { sim/config.js }  (CONFIG-ONLY)
//   — verificado por node antes de escribir este script: game.js / render/render.js / sim/sim.js son
//   BYTE-IDÉNTICOS gh-pages↔HEAD (blobs 8edf25b1 / 4d502586 / edc0fe40). La lógica DARK de CADENCE_RUSH
//   (badge ⏩ + combo-meter/decay + seam crit share-cap con Delve) ya se shipeó LIVE INERTE (enabled:false)
//   por el deploy render-only CAS-2398 (build 6357db520a93), que overlayó los blobs HEAD del momento — que
//   ya incluían el DARK build #67 CAS-2400 (af23ec1). Por eso HOY sólo sim/config.js diverge (el flip
//   1-línea) y el overlay es CONFIG-ONLY (mirror ERUDITION CAS-2390 / KINSHIP CAS-2367). El preflight
//   MODS-intersection FALLA RUIDOSAMENTE si algún módulo cargado divergente queda fuera (anti CAS-2220/2202).
//
// consistent-HEAD: deployOverlay envía el blob de HEAD (61ac4c3), NO el working tree ⇒ ningún WIP no
// commiteado se shipea. Los 8 flags del arco previo LIVE siguen enabled:true (0-regr: NOCTURNE_HUNT /
// ERUDITION / DELVE / TRAILCRAFT / WAYFARER_ROAM / KINSHIP_BOND / FOCUS_FIRE / WARDING_RING); CADENCE_RUSH es
// el único que cambia false→true. Reversible en 1 línea: CADENCE_RUSH.enabled true→false + re-run overlay.
const overlay = ["sim/config.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2402 LIVE FLIP: Cadencia / Ímpetu de Combate (CADENCE_RUSH.enabled:true) — EVO#67. Overlay CONFIG-ONLY {sim/config.js} = divergent∩MODS (game.js/render/render.js/sim/sim.js byte-idénticos gh-pages↔HEAD; la lógica DARK #67 ya se shipeó LIVE inerte por el deploy render-only CAS-2398 build 6357db520a93 que overlayó los blobs HEAD ya incluyendo el DARK build af23ec1; hoy sólo config diverge por el flip 1-línea, mirror ERUDITION CAS-2390 config-only). Canal REUSADO critChance (MISMO que Delve #64) con SHARE-CAP: bono COMBINADO delve+cadence capado a cadenceCritCap 35 ⇒ 0 doble-dip + CAP absoluto critCapPct 50; eje TEMPO/CADENCIA DE MATANZA (combo-meter server-auth sube bumpPerKill/kill, decay determinista COMPARTIDO half-life 6s, 0-RNG, mide RATE reciente), tiers +8/+15/+25% crit; ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/xpGain/vamp. QA DARK PASS 40/40 CAS-2401 (build c4a549ae2fa1) + CEO Gate APPROVED + CEO byte-verify (f2bf0b9). Serializado tras #66 NOCTURNE LIVE&closed. 8 arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
