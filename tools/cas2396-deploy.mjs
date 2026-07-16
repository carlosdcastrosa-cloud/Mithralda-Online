import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2396: LIVE FLIP de Nocturne / Cazador Nocturno (flag NOCTURNE_HUNT) — enciende EVO mecánica #66.
// QA DARK PASS 19/19 ×2 (CAS-2395, build c4a549ae2fa1, master bf83f6d) + CEO Gate APPROVED (channel `vamp`,
// vampCap 0.5). Config-only flip (NOCTURNE_HUNT.enabled false→true), NO rebuild de lógica. Serialización
// liberada: #65 ERUDITION ya LIVE (CAS-2390/2392, build bdf43dcd2099, postQA PASS 31/31 ×2).
//
// Eje = FASE TEMPORAL / CAZA NOCTURNA: el server cuenta, per-pid, los kills NOCTURNOS (isNightAt del reloj
// COMPARTIDO determinista) en ventana 30s (`nightTally`, server-auth 0-RNG, decay hl25s); tally≥minKills(3)
// ⇒ acumula `nocturne`; tiers +6/+12/+20% de robo de vida. Canal REUSADO = `vamp` (lifesteal del golpe melee)
// con SHARE-CAP vs el Vampírico existente: lifesteal EFECTIVA = min(vampCap 0.5, base+boost) ⇒ 0 doble-dip.
// ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance/xpGain (seams distintos).
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy ERUDITION (CAS-2390, bdf43dcd2099), overlay CONFIG-ONLY. DESDE entonces
//   master avanzó con los DARK BUILDS de #66 NOCTURNE (GE 850702b + CTO reroute vamp bf83f6d), que añadieron su
//   lógica (badge ☾ + tally/decay nocturno + seam lifesteal vamp con share-cap) a game.js / render/render.js /
//   sim/sim.js — inerte con enabled:false — más este flip config-1-línea (9472f07). Por eso los 3 archivos de
//   código NO son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror del flip DELVE/TRAILCRAFT 4-file).
//   El preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ cualquier WIP no commiteado NO se
// shipea; se envía el blob HEAD = exactamente el build DARK verificado por QA (c4a549ae2fa1).
// Los 18 flags del arco LIVE siguen enabled:true (0-regr); NOCTURNE_HUNT es el único que cambia false→true.
// Reversible 1-line: NOCTURNE_HUNT.enabled true→false + re-run overlay.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2396 LIVE FLIP: Nocturne / Cazador Nocturno (NOCTURNE_HUNT.enabled:true) — EVO#66. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE ERUDITION CAS-2390 bdf43dcd2099 config-only, master avanzó los DARK builds #66 NOCTURNE GE 850702b + CTO reroute vamp bf83f6d que añadieron su lógica a game/render/sim.js + este flip config-1-línea 9472f07; por eso los 3 archivos de código NO son byte-idénticos y entran al overlay, mirror DELVE/TRAILCRAFT 4-file). Canal REUSADO vamp (lifesteal del golpe melee) con SHARE-CAP vampCap:0.5 vs el Vampírico existente (lifesteal EFECTIVA = min(0.5, base+boost) ⇒ 0 doble-dip anti-runaway) por FASE TEMPORAL/CAZA NOCTURNA (nightTally = nº kills NOCTURNOS per-pid en ventana 30s vía isNightAt del reloj compartido determinista, server-auth 0-RNG, decay hl25s), tiers +6/+12/+20% robo de vida; ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance/xpGain. QA DARK PASS 19/19 ×2 CAS-2395 (build c4a549ae2fa1) + CEO Gate APPROVED. Serializado tras #65 ERUDITION LIVE&closed. 18 arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
