import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2327: LIVE FLIP of Vestigio del Caído / Fallen Wayfarer's Vestige (flag SOUL_RECOVERY) — enciende el
// PIVOTE de arco EVO#49: el loop de MUERTE Y RECUPERACIÓN del mundo COMPARTIDO (tras el arco social
// Órdenes+Vínculos #43–48). Vestigio ambiental COMPARTIDO (reloj de pared propio periodSec 300, hash Knuth,
// caducidad liveFrac 0.5 ⇒ MISMO vestigio N clientes, 0 desync) + rol por IDENTIDAD (heroIdx==fallenIdx ⇒
// caído/no-recupera+buff respawn / si no ⇒ recuperador) + recuperación por proximidad+dwell SIN hotkey
// (radius 96/dwellSec 3, auto, tryRecoverVestige) + pasivos restedMult (recuperador 0.10 / caído respawn 0.15).
// CEO Gate APPROVED on CAS-2325; QA re-QA POST-FIX (CAS-2326 soulPos zone-guard, master 1296bf5) = 15/15 PASS
// ×2 (check 6b broken=[]: las 6 zonas recuperables; byte-id OFF re-verificado; North Star 2-cliente REAL;
// 0 regresión en los otros 14).
//
// AUTHORITATIVE DIVERGENCE (computed independently, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html:71-73)  ==
//     ["game.js","render/render.js","sim/config.js","sim/sim.js"]   (4 files DIVERGE & are LOADED).
//   input.js is BYTE-IDENTICAL between origin/gh-pages and HEAD → NOT in divergence set → NOT overlaid.
//   El Vestigio es recuperación AUTO por proximidad+dwell (0 hotkey) + glifo nameplate + fila SOLO-lectura
//   ⇒ input.js no cambia ⇒ overlay 4-file, como Mentor/Fellowship/Contest/Territory/Standings.
//   logic.js & version.js DIVERGEN pero NO están en MODS ⇒ irrelevantes (version.json lo regenera el deploy).
//   El preflight (divergent∩MODS ⊆ overlay) lo hace safe-by-construction y THROWS ante cualquier módulo
//   divergente no cubierto (anti-CAS-2220 black screen).
//
// consistent-HEAD: el único cambio de código master↔flip es enabled:false→true en SOUL_RECOVERY (1 línea).
//   deployOverlay envía el blob de HEAD (git rev-parse HEAD:render/render.js), NO el working tree — el WIP
//   CAS-2200 (M render/render.js en git status) NUNCA se envía.
//
// Byte-id OFF preserved by DESIGN: el flip sólo pone enabled:true; tickSoul nunca corre OFF, G.soul/h.soulAt/
//   soulGot/soulFell nunca se crean, save omite esas claves. Reversible 1-line: SOUL_RECOVERY.enabled
//   true→false + re-run este overlay.
const overlay = [
  "sim/config.js",
  "sim/sim.js",
  "game.js",
  "render/render.js",
];
const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2327 LIVE FLIP: Vestigio del Caído / Fallen Wayfarer's Vestige (SOUL_RECOVERY.enabled:true; overlay consistente-HEAD config+sim+game+render — SIN input.js, recuperación AUTO proximidad+dwell = 0 hotkey/0 slot móvil, como Mentor/Fellowship/Contest/Territory/Standings/Ledger; render.js WIP CAS-2200 no shipped; PIVOTE EVO#49 loop muerte+recuperación mundo COMPARTIDO; vestigio ambiental COMPARTIDO fn pura del reloj propio + rol por IDENTIDAD + recuperación proximidad/dwell; pasivos restedMult recuperador/caído-respawn precedencia SOUL cede a STANDINGS+MENTOR coexiste FELLOWSHIP/TERRITORY; post-fix CAS-2326 soulPos zone-guard 15/15 ×2; byte-id OFF 0 save key; arco Mentor/Fellowship/Standings/Territory/Contest/Ledger intacto true; anti-CAS-2220 preflight PASS)",
});
console.log(JSON.stringify(res, null, 2));
