// cas2714-deploy.mjs — LIVE FLIP EVO#122 AGGRO_SWITCH_SURGE false→true (Vaivén ⇄,
// 64º flag). CAS-2712 DARK build @161dd0d (CEO Gate 1/2 + DARK QA CAS-2713 PASS 18/18,
// fp 15920977, 0-desync 2-client, ring-buffer e._swR folds identically, byte-neutral OFF,
// CEO Gate 2/2 PASSED). AGGRO_SWITCH ADDS the TEMPORAL/CHURN dimension to the
// composition-of-intent family (#118 AGGRO-FOCUS = fraction fixed on the HERO, a LEVEL;
// #120 STRIKE-COMMIT = combat sub-state; #121 TARGET-SPREAD = Shannon entropy of the
// target distribution, a SNAPSHOT). VAIVÉN measures how VOLATILE the ENGAGED pack's
// targeting is over a recent WINDOW: aggroSwitchField = V∈[0,1] = (#engaged mobs with
// history whose CURRENT aiTarget ≠ aiTarget W ticks ago) / (#engaged mobs with history).
// Each engaged mob keeps a server-auth ring-buffer e._swR of its own aiTarget (capacity
// W+1=7), populated by switchTick AFTER updateEnemies. V≈1 ⇒ pack re-targets frenetically;
// V≈0 ⇒ pack holds its target. minMobs3 (with history), minPlayers2. 🔑 INTRINSICALLY
// MULTIPLAYER: single-player ⇒ hero is the only target ⇒ aiTarget never changes ⇒ V=0
// (clean collapse); cold-start ⇒ ring not full ⇒ that mob doesn't count. TEMPORAL capture
// like #117 ACCEL (e._accPm) / #119 JERK-SPLIT (e._jrkPm) — history per-mob SEPARATE
// (e._swR), TRANSIENT (enemies never serialized ⇒ out of save + worldFingerprint), populated
// ONLY when enabled ⇒ 2-client evolves identically (0-desync). ⊥#121 (snapshot-shape)
// ⊥#118 (level) ⊥#120 (sub-state) ⊥#117/#119 (movement-churn). Fresh channel aggroSwitchFind
// → h.aggroSwitchBounty STATELESS badge ⇄ "Vaivén".
//
// Config-only 1-line flip (64º flag, arc #59-#122). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is now #121 (3767e248c042) which
// already carries the AGGRO_SWITCH DARK seams (they landed in the #122 DARK build 161dd0d,
// which was NOT deployed) — so config.js diverges by the flip line and sim.js/render.js/game.js
// diverge by the DARK seams; all 4 are overlaid from HEAD to be safe (preflight verifies
// presence in the MODS runtime graph; logic.js/version.js diverge too but are NOT in that graph
// so preflight ignores them). version.json is stamped with a FRESH build hash by deploy-lib's
// computeBuild (recomputes over base∪overlay) so served advances off the stale #121 stamp.
// Master version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2714 LIVE flip sim/config.js AGGRO_SWITCH_SURGE enabled:false→true — 64º flag LIVE (Vaivén ⇄) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#122).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
