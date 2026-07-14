import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2375: LIVE FLIP de Fuego Concentrado / Focus Fire (flag FOCUS_FIRE) — enciende EVO mecánica #62.
// CEO Gate APPROVED en CAS-2370 (QA DARK PASS 18/18 ×2). Serialización liberada: #61 WAYFARER_ROAM ya
// LIVE & closed (CAS-2373, build ad87e26206c3, postQA CAS-2374 PASS 31/31 ×2, 0 desync).
//
// Eje FRESCO = CONCENTRACIÓN DE OBJETIVO (focus fire): el server cuenta el nº MÁX de atacantes DISTINTOS
// que concentran fuego sobre UN MISMO objetivo (`focusConcentration`, server-authoritative, 0-RNG; decay
// half-life 25s). Tiers 2/4/6 → T1/2/3. Canal PASIVO = `goldFind` (REUSADO de KINSHIP_BOND #60) con
// DE-STACK máximo-único: FOCUS_FIRE es la fuente más nueva ⇒ CEDE (return 0) a KINSHIP_BOND ⇒ 0 doble-conteo.
// ⊥ restedMult (XP) / wardRegen (HP). +5/10/15% oro al recoger tras una presa abatida en concentración.
//
// AUTHORITATIVE DIVERGENCE (computada por preflightOverlay, NO confiada de la prosa):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html)  ==  { sim/config.js }  (1 file).
//   La última LIVE fue el flip+deploy WAYFARER (CAS-2373, ad87e26206c3) que shipeó game/render/render/sim/config
//   a HEAD-blobs. Desde entonces master sólo avanzó con ESTE flip config-1-línea (1c34755) ⇒ game.js,
//   render/render.js, sim/sim.js siguen BYTE-IDÉNTICOS entre gh-pages y HEAD ⇒ overlay MÍNIMO = config-only
//   (mirror del flip KINSHIP_BOND CAS-2367). El DARK build de #62 (b201247) ya está en gh-pages vía el
//   deploy WAYFARER (FOCUS_FIRE estaba enabled:false ⇒ inerte); este flip sólo cambia el flag a true.
//
// consistent-HEAD: deployOverlay envía blobs de HEAD, NO el working tree.
// Reversible 1-line: FOCUS_FIRE.enabled true→false + re-run overlay.
const overlay = ["sim/config.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2375 LIVE FLIP: Fuego Concentrado / Focus Fire (FOCUS_FIRE.enabled:true) — EVO#62. Overlay config-only {sim/config.js} = divergent∩MODS (desde el último LIVE WAYFARER CAS-2373 ad87e26206c3, master sólo avanzó este flip config-1-línea 1c34755; game/render/sim.js byte-idénticos gh-pages↔HEAD ⇒ overlay mínimo config-only, mirror KINSHIP CAS-2367). Canal goldFind REUSADO con de-stack máximo-único (FOCUS_FIRE cede a KINSHIP_BOND) por CONCENTRACIÓN DE OBJETIVO (máx atacantes distintos sobre un objetivo, server-auth 0-RNG, decay hl25s), tiers 2/4/6 → +5/10/15% oro; ⊥ restedMult/wardRegen ⇒ 0 doble-conteo. CEO Gate APPROVED CAS-2370 (QA DARK 18/18 ×2). Serializado tras #61 WAYFARER_ROAM LIVE&closed. 13 arc flags previos intactos (0-regr); anti-CAS-2220 preflight PASS.",
});
console.log(JSON.stringify(res, null, 2));
