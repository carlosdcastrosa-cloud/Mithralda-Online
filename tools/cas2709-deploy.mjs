// cas2709-deploy.mjs — LIVE FLIP EVO#121 TARGET_SPREAD_SURGE false→true (Reparto,
// 63º flag). CAS-2706 DARK build @4ae3c99 (CEO Gate 1/2 + DARK QA CAS-2707 PASS 18/18,
// fp 15920977, 0-desync 2-client, byte-neutral OFF, CEO Gate 2/2 PASSED). TARGET_SPREAD
// ADDS the target-DISTRIBUTION dimension to the composition-of-intent family opened by
// #118 AGGRO-FOCUS (fraction of the pack fixed on the HERO) and #120 STRIKE-COMMIT
// (fraction of the ENGAGED pack committed mid-strike): it measures how UNIFORMLY the
// aggro-ENGAGED pack spreads its targeting over ALL alive party players in radius.
// targetSpreadField = S = H(targets)/ln(nPlayers) ∈[0,1] = normalized Shannon entropy of
// the target distribution (per player j, cⱼ = #engaged mobs targeting j, N=Σcⱼ, pⱼ=cⱼ/N,
// H=−Σpⱼ·ln(pⱼ), S=H/ln(P)). S≈1 ⇒ aggro spread uniform over the party; S≈0 ⇒ all aggro
// concentrated on ONE player. minMobs3 (over the ENGAGED denominator N), minPlayers2
// (undefined with <2 players). 🔑 INTRINSICALLY MULTIPLAYER: single-player ⇒ P=1 ⇒ ln(1)=0
// ⇒ degenerate ⇒ S=0 (clean collapse). ⊥#118 AGGRO-FOCUS (level-over-hero) ⊥#120 EMBATE
// (sub-state). Fresh channel targetSpreadFind→h.targetSpreadBounty STATELESS badge ⋔
// "Reparto".
//
// Config-only 1-line flip (63º flag, arc #59-#121). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build 4ae3c99 touched exactly these code
// files (TARGET_SPREAD seams in game.js/render.js/sim.js + flag block in config.js) and the
// gh-pages base (#120 STRIKE_COMMIT 17b956823d40) lacks them, so all 4 diverge and must be
// overlaid from HEAD. (logic.js/version.js diverge too but are NOT in the MODS runtime graph
// — not shipped to gh-pages — so the preflight ignores them.) version.json is stamped with a
// FRESH build hash by deploy-lib's computeBuild (recomputes over base∪overlay) so served
// advances off the stale #120 stamp. Master version.json is stamped SEPARATELY to byte-match
// the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2709 LIVE flip sim/config.js TARGET_SPREAD_SURGE enabled:false→true — 63º flag LIVE (Reparto) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#121).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
