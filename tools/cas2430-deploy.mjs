import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2430: LIVE FLIP de Sigilo / Al Acecho (flag SHADOW_STALK) — enciende EVO mecánica #71.
// QA DARK PASS 16/16 (CAS-2429, build c8aeb1f97846, HEAD 86a3355) + CEO byte-verify DARK PASS
// (seam sim.js:7302 devuelve aggroBase EXACTO cuando !enabled ⇒ OFF byte-neutral, diff +153/-3,
// STATELESS, raycast server-auth world.wallSet/blockSet) + CEO Gate #71 APROBADO. Config-only flip
// (SHADOW_STALK.enabled false→true, master 18d993d), NO rebuild de lógica.
// Serialización satisfecha: #70 FIRM_FOOTING ya LIVE&closed (CAS-2421/2423). Linaje CAS-2426 (991ed574).
//
// Eje = SIGILO / LÍNEA-DE-VISIÓN / OCULTAMIENTO (server-auth): raycast Bresenham PURO sobre la geometría
// oclusora real world.wallSet/blockSet (hasheada en worldFingerprint) → nº de tiles oclusores en la línea
// mob→héroe → tabla de tiers (1 oclusor→−20%, ≥2→−35%) sobre el radio de DETECCIÓN del mob, bajo sub-cap
// stealthStalkCap=0.35. Canal FRESCO `detectRadius` (NINGUNA de las 12 flags #59-#70 lo usa; todas son
// stat-buffs del héroe) ⇒ fuente única, máximo-único trivial. Byte-neutro OFF delegaba radio base exacto
// (raycast nunca corre con enabled:false); con enabled:true el ocultamiento-por-geometría corre.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { game.js, render/render.js,
//     sim/config.js, sim/sim.js }  (4 files) — verificado por node antes de escribir este script.
//   La última LIVE fue el flip+deploy FIRM_FOOTING (CAS-2421, gh-pages 2f4108f), overlay 4-file. DESDE
//   entonces master avanzó con el DARK BUILD de #71 SHADOW_STALK (GE CAS-2426 2e8f4a6, badge Sigilo 🌒 +
//   raycast LOS + canal detectRadius), inerte con enabled:false, en game.js / render/render.js / sim/sim.js.
//   Por eso los 3 archivos de código NO son byte-idénticos gh-pages↔HEAD y ENTRAN al overlay (mirror
//   FIRM_FOOTING/LAST_STAND/TEMPEST 4-file). El preflight MODS-intersection FALLA RUIDOSAMENTE si dejo
//   alguno fuera (anti CAS-2220/2202 black-screen).
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree ⇒ WIP no commiteado NO se shipea;
// se envía el blob HEAD = exactamente el build DARK verificado por QA (c8aeb1f97846) + el flip 1-línea
// (18d993d). Los flags del arco LIVE previo #59–#70 siguen enabled:true (0-regr, count 12→13 servidas true);
// SHADOW_STALK es el único que cambia false→true. Reversible 1-line: SHADOW_STALK.enabled true→false + re-run.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2430 LIVE FLIP: Sigilo / Al Acecho (SHADOW_STALK.enabled:true) — EVO#71. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS (desde el último LIVE FIRM_FOOTING CAS-2421, master avanzó el DARK build #71 SHADOW_STALK GE CAS-2426 2e8f4a6 que añadió su lógica a game/render/sim.js inerte con enabled:false + este flip config-1-línea 18d993d). Eje SIGILO / LÍNEA-DE-VISIÓN / OCULTAMIENTO server-auth (raycast Bresenham PURO sobre geometría oclusora real world.wallSet/blockSet → nº tiles oclusores línea mob→héroe → tiers 1→−20% / ≥2→−35% sobre radio de detección del mob, sub-cap stealthStalkCap=0.35). Canal FRESCO detectRadius (NINGUNA de las 12 flags #59-#70 lo usa; todas son stat-buffs del héroe) ⇒ fuente única, máximo-único trivial. QA DARK PASS 16/16 CAS-2429 (build c8aeb1f97846, HEAD 86a3355) + CEO byte-verify DARK PASS (seam sim.js:7302 aggroBase EXACTO cuando !enabled, diff +153/-3, STATELESS) + CEO Gate #71 APROBADO. Serializado tras #70 FIRM_FOOTING LIVE&closed. Arc flags previos #59-#70 intactos (0-regr, count 12→13 servidas true); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
