// cas2755-deploy.mjs — LIVE FLIP EVO#130 AGGRO_PRESSURE_SURGE false→true (Apremio ⊗,
// 72º flag). CAS-2753 DARK build @ba1dee1 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2754 PASS 20/20, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 58-census sole-false=AGGRO_PRESSURE, CRUX ⊥ ALL priors, byte-neutral OFF). APREMIO adds the
// RADIAL-PROXIMITY dimension (the OTHER orthogonal GEOMETRIC component of the pack: how CLOSE
// the engaged pack squeezes, NOT where it is angularly #129, NOT count/trend/distribution/type)
// to the composition-of-intent family. #129 SURROUND opened PURE GEOMETRY with the ANGULAR
// component (are the engaged mobs spread 360° or on one side?). Pack geometry around a point
// decomposes into EXACTLY TWO ORTHOGONAL components: ANGULAR (SURROUND, shipped) and RADIAL
// (PRESSURE, this axis). METRIC = P∈[0,1] = mean radial closeness of alive engaged mobs in
// radius; per mob at distance d≤R: closeness=(R−d)/R ∈[0,1] (1 at hero, 0 at edge); P =
// mean(closeness) over the N engaged. Point-blank swarm ⇒ P≈1 (squeezed); mobs at engage edge
// ⇒ P≈0 (room to kite). Bands on P: midPress P≥0.5 ⇒ weight 1; hiPress P≥0.75 ⇒ weight 2.
// minMobs3 + minPlayers2. 🔑 SNAPSHOT/PURE (NO ring-buffer, like #129). 🔑 DETERMINISM (sev-1):
// closeness QUANTIZED to integer levels (closeBins 64) via INTEGER comparison Q²·d² ≤ R²(Q−L)²
// (NO float sqrt in the score/decision; band by INTEGER sum comparison) ⇒ 2-client byte-
// identical. 🔑 INTRINSICALLY MULTIPLAYER: single-player / P<2 ⇒ P=0 (clean collapse). Badge
// ⊗ "Apremio:" (label "Acoso" collided #94 SWIFT / #118 FOCUS ⇒ renamed Apremio; ids
// aggroPressure*). Channel aggroPressureFind → h.aggroPressureBounty STATELESS. The 12th
// composition-of-intent axis, 2nd SPATIAL-GEOMETRIC ("they're on top of you, no air, make
// space" — core MMORPG spacing signal). CRUX: RADIAL ⊥ #129 ANGULAR (N=3 ring 360° at edge
// S=hi/P≈0 vs N=3 one-side point-blank S=0/P≈1) ⊥ #126 DENSITY (mean-normalized, N-invariant)
// ⊥ #112 convergeFind (STATIC radial position, motion-invariant) ⊥ #128 MOMENTUM / aggro-table.
//
// Config-only 1-line flip (72º flag, arc #59-#130). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #129 (61dd36e1005a) which does
// NOT carry the AGGRO_PRESSURE DARK seams (they landed in the #130 DARK build ba1dee1, which
// was NOT deployed) — so config.js diverges by the flip line + #130 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph). version.json is stamped with a FRESH build
// hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the
// stale #129 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2755 LIVE flip sim/config.js AGGRO_PRESSURE_SURGE enabled:false→true — 72º flag LIVE (Apremio ⊗) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#130).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
