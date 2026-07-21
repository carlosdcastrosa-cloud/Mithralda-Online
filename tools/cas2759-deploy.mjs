// cas2759-deploy.mjs — LIVE FLIP EVO#131 AGGRO_VIGOR_SURGE false→true (Brío ◉,
// 73º flag). CAS-2757 DARK build @cb05828 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2758 PASS 21/21, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 59-census sole-false=AGGRO_VIGOR, CRUX ⊥ ALL priors, byte-neutral OFF). BRÍO opens the
// MOB-HP-STATE sub-family — how much fight the engaged pack has LEFT (remaining HP), the ONE
// thing no prior flag (#59-#130) reads. NOT where the pack is (angular #129 / radial #130), NOT
// how many (#126), NOT what type (#127), NOT who it targets (aggro-table). METRIC = V∈[0,1] =
// mean HP-fraction of alive engaged mobs in radius; per mob hpFrac=hp/hpMax; V=mean(hpFrac) over
// the N engaged. Fresh pack ⇒ V≈1 (whole fight ahead); nearly-cleared ⇒ V≈0 (finish it). Bands:
// midVigor V≥0.5 ⇒ weight 1; hiVigor V≥0.75 ⇒ weight 2. minMobs3 + minPlayers2. 🔑 SNAPSHOT/PURE
// (NO ring-buffer, like #129/#130). 🔑 DETERMINISM (sev-1): hp/hpMax are INTEGERS ⇒ HP-level
// QUANTIZED to integer levels (vigBins 64) via INTEGER comparison hp·Q ≥ L·hpMax; band by INTEGER
// sum comparison ⇒ 0 float division in the score/decision ⇒ 2-client byte-identical. 🔑
// INTRINSICALLY MULTIPLAYER: single-player / P<2 ⇒ V=0 (clean collapse). Badge ◉ "Brío:"
// (channel aggroVigorFind → h.aggroVigorBounty STATELESS). The 13th composition-of-intent axis,
// 1st MOB-HP-STATE ("how much fight is left — commit or finish", core engage/disengage MMORPG
// signal). CRUX: HP-STATE ⊥ #130 PRESSURE (radial) & #129 SURROUND (angular) — VIGOR is BLIND to
// position (same geometry, opposite vigor) ⊥ #126 DENSITY (mean-normalized, N-invariant) ⊥ #112
// convergeFind (static HP read, motion-invariant) ⊥ #128 MOMENTUM/#122 SWITCH (snapshot, not a
// trend) ⊥ #127 VARIETY (blind to mob type) ⊥ aggro-table (blind to who holds aggro).
//
// Config-only 1-line flip (73º flag, arc #59-#131). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #130 (297d259bb5f9) which does NOT
// carry the AGGRO_VIGOR DARK seams (they landed in the #131 DARK build cb05828, which was NOT
// deployed) — so config.js diverges by the flip line + #131 config, and sim.js/render.js/game.js
// diverge by the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the
// MODS runtime graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #130 stamp. Master version.json
// is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2759 LIVE flip sim/config.js AGGRO_VIGOR_SURGE enabled:false→true — 73º flag LIVE (Brío ◉) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#131).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
