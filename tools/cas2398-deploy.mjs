import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2398: board 4d0caf74 "elimina esos circulos" — RENDER-ONLY removal of the two confirmed targets:
//   (1) the dark oval GROUNDING SHADOW under richAnim characters + their corpses ("sombras ovaladas bajo
//       los personajes") — deleted outright (100% cosmetic, safe), and
//   (2) the ARENA_HAZARDS ground DISC+RING ("círculos de daño que salen solos por el mapa") — this is a
//       SERVER-AUTHORITATIVE damage zone (sim.js/config.js BYTE-IDÉNTICOS: enabled:true, still daña), so per
//       the North-Star combat-legibility guardrail it is RE-STYLED (not blanked) into a soft heat/miasma HAZE
//       (radial gradient, no hard edge/stroke) + a pulsing ⚠ warning glyph. Danger read survives; no drawn circle.
// My change is 100% render/render.js. sim/config.js + sim/sim.js carry NO CAS-2398 logic (byte-identical to their
// pre-CAS-2398 state) — my edit did not touch them.
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay, NOT trusted from prose):
//   git diff --name-only origin/gh-pages HEAD ∩ MODS(index.html) == { game.js, render/render.js, sim/config.js,
//   sim/sim.js } (4 files). Since the last LIVE (CAS-2396 Nocturne, build fb99d94eca23), master advanced with the
//   CAS-2400 CADENCE_RUSH DARK BUILD (commit af23ec1, EVO#67, enabled:false byte-neutral) which added its logic to
//   game/sim/config + a badge dispatch to render.js, and my CAS-2398 render-only change landed in that same commit
//   (shared-tree timing). render.js now imports CADENCE_RUSH ⇒ config.js MUST ship or the ES-module graph throws at
//   link time (anti CAS-2220/2202 black-screen). So all 4 code files diverge and ENTER the overlay (mirror the
//   Nocturne/Delve/Trailcraft 4-file overlays that ship accumulated DARK code inert). Preflight FAILS LOUDLY if any
//   is left out. CADENCE_RUSH stays enabled:false (DARK) — NOT flipped here. NOCTURNE_HUNT/arc flags unchanged (0-regr).
//
// consistent-HEAD: deployOverlay ships HEAD blobs (not the working tree). Smoke PASS (boots, zero page errors,
// steady ~60fps; single-sample fps dip is headless jitter, not this change — it removes draw work). Reversible.
const overlay = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2398 RENDER-ONLY: eliminar círculos del suelo (board 4d0caf74). (1) sombras ovaladas bajo personajes (richAnim mobs + corpses) ELIMINADAS (cosmético). (2) círculos de daño ARENA_HAZARDS que 'salen solos' RE-ESTILADOS a haze suave + glifo ⚠ (guardrail North-Star: son zona de daño server-authoritative sim.js/config byte-idénticos enabled:true, NO se borran en silencio — siguen comunicando peligro sin leerse como círculo pintado). Cambio 100% render/render.js. Overlay 4-file {game.js, render/render.js, sim/config.js, sim/sim.js} = divergent∩MODS: desde el último LIVE Nocturne (CAS-2396 fb99d94eca23) master avanzó el DARK BUILD CAS-2400 CADENCE_RUSH (af23ec1, EVO#67, enabled:false byte-neutro) que añadió lógica a game/sim/config + dispatch de badge en render.js, y mi cambio render-only aterrizó en ese mismo commit (shared-tree). render.js importa CADENCE_RUSH ⇒ config.js debe entrar o el grafo ES-module rompe (anti CAS-2220). CADENCE_RUSH sigue DARK (enabled:false). 0-regr flags del arco. Reversible.",
});
console.log(JSON.stringify(res, null, 2));
