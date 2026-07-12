// TEMPLATE for a hardened casNNNN-deploy.mjs — copy, rename, edit OVERLAY + message.
// The preflight guard in deploy-lib.mjs will REJECT the deploy (throw, non-zero exit)
// if any runtime module (index.html MODS graph) diverges from HEAD but is not in your
// OVERLAY set — the overlay-drift SEV-1 that black-screened LIVE in CAS-2202/CAS-2220.
//
// OVERLAY can be an array (all files shipped from HEAD) or an object {path: "HEAD"|"<sha>"}.
// Non-code assets (PNG/JSON) may be overlaid freely; they are never required by the guard.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = [
  "render/sprites.js",
  // "sim/config.js",  // ← if render/sprites.js imports a NEW export, its provider must be here too
  // "assets/pixellab/pilot/fx/nova_strip.png",
];

const out = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-NNNN: <what this deploys> — overlay module-consistent, reversible",
});
console.log(JSON.stringify(out, null, 2));
