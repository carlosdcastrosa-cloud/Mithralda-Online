// cas2751-deploy.mjs — LIVE FLIP EVO#129 AGGRO_SURROUND_SURGE false→true (Cerco/Rodeo ⊙,
// 71º flag). CAS-2749 DARK build @c29d385 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2750 PASS 20/20, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 57-census sole-false=AGGRO_SURROUND, CRUX ⊥ ALL priors, byte-neutral OFF). CERCO adds the
// SPATIAL-ENCIRCLEMENT dimension (the ANGULAR GEOMETRY of the engaged pack around the hero,
// NOT count/trend/distribution) to the composition-of-intent family: the 10 prior flags read
// how MUCH aggro (#126 DENSITY), how it TRENDS (#128 MOMENTUM dN/dt), or how it distributes
// over players/targets/types (#118 FOCUS / #121 SPREAD / #122 SWITCH / #123 CONTEST /
// #124 PILE / #125 MARGIN / #127 VARIETY) — none read the physical ANGULAR geometry of the
// engaged pack. METRIC = S∈[0,1] = angular dispersion of hero→mob bearings of alive engaged
// mobs in radius; per mob take the unit bearing vector; R = |mean of those unit vectors|
// (mean resultant length); S = 1 − R. All one side ⇒ R≈1 ⇒ S≈0 (flankable); spread 360° ⇒
// R≈0 ⇒ S≈1 (encircled). Bands on S: midSurround S≥0.5 ⇒ weight 1; hiSurround S≥0.75 ⇒
// weight 2. minMobs3 + minPlayers2. 🔑 SNAPSHOT/PURE (NO ring-buffer, unlike #122/#128).
// 🔑 DETERMINISM (sev-1): bearings quantized to integer bins (angleBins 64) via atan2→bin;
// resultant summed from an INTEGER LUT (cos/sin ×1000); band by INTEGER R² comparison —
// 0-float in the score/decision ⇒ 2-client byte-identical. 🔑 INTRINSICALLY MULTIPLAYER:
// single-player / P<2 ⇒ S=0. Badge ⊙ "Rodeo:" (label "Cerco:" collided #113 ENCIRCLE LIVE
// ⇒ renamed Rodeo). Channel aggroSurroundFind → h.aggroSurroundBounty STATELESS. The 11th
// composition-of-intent axis, 1st SPATIAL-GEOMETRIC ("you are surrounded, no safe side,
// hold the center" — core MMORPG positioning signal).
//
// Config-only 1-line flip (71º flag, arc #59-#129). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #128 (00bb0660d3e1) which does
// NOT carry the AGGRO_SURROUND DARK seams (they landed in the #129 DARK build c29d385, which
// was NOT deployed) — so config.js diverges by the flip line + #129 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph). version.json is stamped with a FRESH build
// hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the
// stale #128 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2751 LIVE flip sim/config.js AGGRO_SURROUND_SURGE enabled:false→true — 71º flag LIVE (Rodeo ⊙) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#129).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
