import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2437: LIVE FLIP de Presión por Escasez / SCARCITY_EDGE (flag) — enciende EVO mecánica #72.
// QA DARK PASS 16/16 (CAS-2435, build 0d33567b348c, HEAD af8120d) + CEO byte-verify DARK PASS
// (byte-neutral OFF: rama de forrajeo = código muerto con enabled:false ⇒ 0 esencia + 0 RNG ⇒
// killEnemy byte-idéntico al HEAD; STATELESS; canal fresco essenceFind; REAL server-auth
// spawner-cap depletion) + CEO Gate #72 APROBADO. Config-only flip (SCARCITY_EDGE.enabled
// false→true, master 0b4d2ff, diff DARK→LIVE = EXACTAMENTE 1 línea), NO rebuild de lógica.
// Serialización satisfecha: #71 SHADOW_STALK ya LIVE&closed (CAS-2430/2431). Linaje CAS-2432.
//
// Eje = ESCASEZ / AGOTAMIENTO DE RECURSOS del mundo compartido (server-auth, MMORPG-native):
// depletion(zona) = 1 − mobsVivosNoJefe / Σ world.spawners.max (el MISMO estado del loop de spawn
// count<sp.max) → tabla de tiers → mul → bono de esencia de forrajeo = round(scarcityMul(zona)*tpl.xp)
// en el TAIL de killEnemy, bajo sub-cap scarcityEssCap=0.12. Canal FRESCO `essenceFind` (NINGUNA de
// las 13 flags #59-#71 lo usa; goldFind/lootQuality/xpGain ocupados ⇒ esencia único libre) ⇒ fuente
// única, máximo-único trivial. ⊥ #69 LAST_STAND force-ratio (cuenta ENGANCHADOS; esto cuenta AUSENCIA
// vs cap-de-zona = señal inversa, fuente distinta spawner-cap). Byte-neutro OFF = rama muerta; con
// enabled:true el forrajeo-por-escasez corre.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — logic.js/version.js divergen pero NO están en MODS.
//   La última LIVE fue el flip+deploy SHADOW_STALK (CAS-2430, gh-pages a52d2586), overlay 4-file. DESDE
//   entonces master avanzó con el DARK BUILD de #72 SCARCITY_EDGE (GE CAS-2432 917e818, seam tail killEnemy
//   + badge ⧗ + canal essenceFind), inerte con enabled:false, en game.js / render/render.js / sim/sim.js.
//   Por eso los 3 archivos de código NO son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror
//   SHADOW_STALK/FIRM_FOOTING 4-file). El preflight MODS-intersection FALLA RUIDOSAMENTE si dejo alguno
//   fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD (0b4d2ff), NO el working tree ⇒ se envía exactamente
// el build DARK verificado por QA (0d33567b348c) + el flip 1-línea. Los flags del arco LIVE previo #59–#71
// siguen enabled:true (0-regr, count 60→61 servidas true); SCARCITY_EDGE es el único que cambia false→true.
// Reversible 1-line: SCARCITY_EDGE.enabled true→false + re-run.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2437 LIVE FLIP: Presión por Escasez / SCARCITY_EDGE (SCARCITY_EDGE.enabled:true) — EVO#72. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE SHADOW_STALK CAS-2430, master avanzó el DARK build #72 SCARCITY_EDGE GE CAS-2432 917e818 que añadió su seam+badge⧗+canal essenceFind inerte con enabled:false a game/render/sim.js + este flip config-1-línea 0b4d2ff). Eje ESCASEZ/AGOTAMIENTO de recursos del mundo compartido server-auth: depletion = 1 − mobsVivosNoJefe / Σ world.spawners.max → tiers → mul → bono esencia de forrajeo round(scarcityMul*tpl.xp) en el TAIL de killEnemy, sub-cap scarcityEssCap=0.12. Canal FRESCO essenceFind (NINGUNA de las 13 flags #59-#71 lo usa). ⊥ #69 force-ratio (cuenta AUSENCIA vs cap-de-zona = inverso). QA DARK PASS 16/16 CAS-2435 (build 0d33567b348c, HEAD af8120d) + CEO byte-verify DARK PASS (byte-neutral OFF rama muerta, STATELESS, REAL server-auth spawner-cap) + CEO Gate #72 APROBADO. Serializado tras #71 SHADOW_STALK LIVE&closed. Arc flags previos #59-#71 intactos (0-regr, count 60→61 servidas true); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
