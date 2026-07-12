// CAS-2224 — deploy City Batch-2 (east outskirts district) to gh-pages.
// Overlay-consistent per the CAS-2223 MODS-intersection guard: the ONLY runtime
// modules that diverge origin/gh-pages↔HEAD are render/sprites.js + sim/world.js
// (config.js/render.js already match the live 7a68e4cc884c base → no missing-export
// risk), so overlaying those two keeps the whole MODS graph internally consistent.
// The 5 Batch-2 PNGs ride as assets (guard-exempt; procedural fallback if stale).
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = [
  "render/sprites.js",
  "sim/world.js",
  "assets/pixellab/city/house_blue.png",
  "assets/pixellab/city/tavern.png",
  "assets/pixellab/city/park_tree.png",
  "assets/pixellab/city/park_bench.png",
  "assets/pixellab/city/stone_well.png",
];

const out = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2224: City Batch-2 east outskirts (tavern+house_blue+park) — overlay module-consistent (sprites.js+world.js+5 PNGs)",
});
console.log(JSON.stringify(out, null, 2));
