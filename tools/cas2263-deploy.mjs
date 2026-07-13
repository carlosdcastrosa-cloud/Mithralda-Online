// CAS-2263 — LIVE deploy: dock the "Zona segura"+"Descanso" HUD badge row below the live minimap.
// Render-only placement fix (parent CAS-2262 sev-4 overlap). The ONLY diverging MODS module is
// render/render.js (config/sim/game are byte-identical HEAD↔gh-pages), and the change adds NO new
// import (uses already-imported uiLayout/RESTED_XP/SAFEZONE) ⇒ overlay is module-consistent by
// construction (anti-CAS-2220). Preflight enforces divergent∩MODS ⊆ OVERLAY. Reversible: re-deploy
// the previous render.js blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["render/render.js"];

const out = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2263: dock 'Zona segura'+'Descanso' badge row below the live minimap (render-only, module-consistent, reversible)",
});
console.log(JSON.stringify(out, null, 2));
