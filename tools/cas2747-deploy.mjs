// cas2747-deploy.mjs — LIVE FLIP EVO#128 AGGRO_MOMENTUM_SURGE false→true (Escalada ⇗,
// 70º flag). CAS-2743 DARK build @14044e18 (CEO Gate 1/2 byteverify + DARK QA CAS-2746
// PASS 19/19, fp 15920977, 0-desync 2-client A==B, single-player collapse, 56-census
// sole-false=AGGRO_MOMENTUM, CRUX ⊥#126 DENSITY / ⊥#122 SWITCH, byte-neutral OFF, CEO
// Gate 2/2 no-drift PASSED). ESCALADA adds the ESCALATION / BUILD-UP dimension (the SIGNED
// RATE-OF-CHANGE of the ENGAGED pack size, NOT a snapshot) to the composition-of-intent
// family: the 9 prior flags measure how aggro distributes/composes NOW (#118 FOCUS,
// #121 SPREAD, #123 CONTEST, #124 PILE, #125 MARGIN, #126 DENSITY, #127 VARIETY) or
// unsigned churn (#122 SWITCH). METRIC = M∈[0,1] = normalized POSITIVE build-up of the
// ENGAGED pack size N over a short window Δ: sample N_engaged at t−Δ and t; rawM =
// max(0, N_t − N_{t−Δ}); M = min(1, rawM/momentumCap4). Rewards ESCALATION (growing
// threat), NOT decay. Bands on RAW rawM (ΔN): midMomentum ΔN≥2 ⇒ weight 1; hiMomentum
// ΔN≥3 ⇒ weight 2. minMobs3 (N_t≥3) + minPlayers2 (P≥2). 🔑 INTRINSICALLY MULTIPLAYER:
// single-player / P<2 ⇒ M=0 (clean collapse). TEMPORAL/WINDOWED — reads the SHARED
// server-auth aggro-table over 2 snapshots via a per-hero ring-buffer G._momR
// (client-derived from replicated state, like #122 SWITCH; NEVER serialized — out of
// save + worldFingerprint). Server-auth aggregate, TRANSIENT channel aggroMomentumFind →
// h.aggroMomentumBounty STATELESS badge ⇗ "Escalada". 🔑 CRUX — MOMENTUM is the SIGNED
// DERIVATIVE; all snapshot priors are the LEVEL: ⊥#126 DENSITY (magnitude/level): N=6
// stable (density hi, M=0) vs N: 2→4→6 (SAME instantaneous density at t, M=hi). ⊥#122
// SWITCH (unsigned churn): SWITCH = target-IDENTITY change rate (blind to sign); MOMENTUM
// = SIGNED trend of pack SIZE. ⊥#124 PILE / #125 MARGIN / #121 SPREAD / #123 CONTEST /
// #118 FOCUS / #127 VARIETY (all distribution/type snapshots) — momentum is agnostic to
// HOW aggro distributes or WHAT types, only whether it GROWS. The 10th composition-of-
// intent axis (ESCALATION — core MMORPG pacing signal).
//
// Config-only 1-line flip (70º flag, arc #59-#128). Overlay = the canonical 4-file MODS
// set (game.js/render.js/config.js/sim.js). The gh-pages base is #127 (8dd689f8c58f) which
// does NOT carry the AGGRO_MOMENTUM DARK seams (they landed in the #128 DARK build 14044e18,
// which was NOT deployed) — so config.js diverges by the flip line + #128 config, and
// sim.js/render.js/game.js diverge by the DARK seams; all 4 are overlaid from HEAD (preflight
// verifies presence in the MODS runtime graph; logic.js/version.js diverge too but are NOT in
// that graph so preflight ignores them). version.json is stamped with a FRESH build hash by
// deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the stale
// #127 stamp. Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2747 LIVE flip sim/config.js AGGRO_MOMENTUM_SURGE enabled:false→true — 70º flag LIVE (Escalada ⇗) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#128).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
