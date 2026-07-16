import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2387: LIVE FLIP de Delve / Descenso (flag DELVE) — enciende EVO mecánica #64.
// QA DARK PASS 18/18 ×2 (CAS-2380, build c4a549ae2fa1) + CEO Gate. GE agotado por límite semanal Claude
// (reset Jul 19) ⇒ el flip (config + deploy, NO requiere GE) se enruta al CTO. Serialización liberada:
// #63 TRAILCRAFT ya LIVE (CAS-2378, build 9aeb83a279a3, postQA PASS 31/31 ×2, 0 desync).
//
// Eje FRESCO = PROFUNDIDAD / DESCENSO VERTICAL: el server cuenta, per-pid, el nº de BANDAS de profundidad
// DISTINTAS (depthBandOf = ZONE_TIER[zoneOf].tier, 1-7) que un jugador alcanza en una ventana deslizante de
// 30s (`delveBands`, server-auth, 0-RNG, decay half-life 25s). bands≥minBands(2) ⇒ acumula `delve`; tiers
// exigen delve≥min Y bands≥bandsReq → +8/+15/+25% crit. OPUESTO/⊥ a Trailcraft #63 (diversidad de TIPOS de
// terreno): 2 zonas MISMO tier ⇒ +2 variedad Trailcraft pero +1 banda Delve. Canal FRESCO = `critChance`
// (6º canal, probabilidad de crítico ofensivo) con CAP DURO critCapPct:50 (=0.5 abs) que NUNCA reduce el
// crit base — sólo AÑADE hasta el cap (anti-runaway). ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy TRAILCRAFT (CAS-2378, 9aeb83a279a3), overlay 4-file. DESDE entonces
//   master avanzó con los DARK BUILDS de #64 DELVE (49eb05c) y #65 ERUDITION (a6d7780), que añadieron su
//   lógica (badge + tickDelve/tickErudition + seams crit/xpGain) a game.js / render/render.js / sim/sim.js —
//   inerte con enabled:false — más este flip config-1-línea (74fb1af). Por eso los 3 archivos de código NO
//   son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror del flip TRAILCRAFT 4-file CAS-2378). El
//   preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ el WIP CAS-2200 de render.js
// (no commiteado) NO se shipea; se envía el blob HEAD = exactamente el build DARK verificado por QA.
// ERUDITION #65 SIGUE DARK (enabled:false en el mismo config.js overlaid — se flipa DESPUÉS, serializado).
// Reversible 1-line: DELVE.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2387 LIVE FLIP: Delve / Descenso (DELVE.enabled:true) — EVO#64. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE TRAILCRAFT CAS-2378 9aeb83a279a3, master avanzó los DARK builds #64 DELVE 49eb05c y #65 ERUDITION a6d7780 que añadieron su lógica a game/render/sim.js + este flip config-1-línea 74fb1af; por eso los 3 archivos de código NO son byte-idénticos y entran al overlay, mirror TRAILCRAFT CAS-2378). Canal FRESCO critChance (probabilidad de crítico ofensivo, CAP DURO critCapPct:50 = ≤0.5 abs anti-runaway) por PROFUNDIDAD/DESCENSO VERTICAL (delveBands = nº de BANDAS de profundidad DISTINTAS por-pid en ventana 30s, server-auth 0-RNG, decay hl25s), tiers +8/+15/+25% crit; ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality. QA DARK PASS 18/18 ×2 CAS-2380 (build c4a549ae2fa1) + CEO Gate. Serializado tras #63 TRAILCRAFT LIVE&closed. ERUDITION #65 SIGUE DARK (enabled:false). 5 arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
