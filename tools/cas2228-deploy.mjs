import { deployOverlay } from "./deploy-lib.mjs";
// CAS-2228: flip MINIMAP.enabled:true + overlay-deploy the QA-proven 81c0eba minimap build.
// Ship EXACTLY the 2 minimap files at 81c0eba blobs (config with the 1-line flip, render verbatim).
// Preflight against head=81c0eba (NOT master HEAD): HEAD carries CAS-2225 door code across ALL
// MODS files; shipping 81c0eba blobs keeps LIVE at the QA-proven tree with doors fully excluded.
const overlay = {
  "sim/config.js": "b26013618cc67e454d463a5430625ba7da00cbce",     // 81c0eba config + MINIMAP.enabled:true (no door config)
  "render/render.js": "d6176980f31babba69ea1228ac9ee5b167701be4",  // == QA-proven 81c0eba render.js blob (no door render code)
};
const res = deployOverlay({
  overlay,
  head: "81c0eba",
  message: "CAS-2228 LIVE: enable CAS-2226 city-POI minimap blip layer (flip MINIMAP.enabled:true, overlay 81c0eba render+config, doors excluded)",
});
console.log(JSON.stringify(res, null, 2));
