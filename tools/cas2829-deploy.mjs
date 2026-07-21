// cas2829-deploy.mjs — LIVE FLIP EVO#144 CO_FOCUS_SURGE false→true (Diana ⌾,
// 86º flag). CAS-2829 DARK build @b2d246e (CEO Gate 1/2 & 2/2 PASS, DARK QA CAS-2831
// PASS 22/22 ×2, fp 15920977 fpMatch, 0-desync 2-client A==B byte-id, single-player
// collapse G=0, 72-census sole-false=CO_FOCUS_SURGE, byte-neutral OFF).
// DIANA is the 9th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD). DIANA opens a NEW sub-dimension: the eight priors read
// each player's SELF-STATE; DIANA reads the player→TARGET RELATION — G = MAX over mobs
// of (# DISTINCT ALIVE players within the shared radius whose current targetId == that
// mob) = the size of the largest group converged on a single target (coordinated
// focus-fire). G∈[0,P] INTEGER by construction (bucket players by targetId, take the MAX
// bucket — INTEGER id-equality tally, MAX is commutative ⇒ iteration-order-independent).
// Bands: G≥midFocus(2) ⇒ weight 1; G≥hiFocus(3) ⇒ weight 2. Gate minPlayers2; single-player
// ⇒ ≤1 player on any target ⇒ G collapses ⇒ 0 (clean collapse — impossible to converge
// fire solo). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads the replicated targetId in
// ONE frame — target-assignment is server-auth by MMO design). 🔑 DETERMINISM (sev-1): G =
// INTEGER MAX of a per-target id-equality tally (bucket by targetId|0, INTEGER id compare)
// vs INTEGER thresholds {midFocus,hiFocus}; ZERO float, ZERO division in score/decision
// (float ONLY cosmetic for badge idx=G/playerCap) ⇒ 2-client 0-desync. CRUX ⊥#143 ENVITE
// (target-identity ⊥ velocity — converge fire STANDING G-high/A0 vs advance without shared
// target A-high/G-low) ⊥#62 FOCUS_FIRE (fresh coFocusFind per-kill count ⊥ passive sustained
// goldFind) ⊥#142/#136/#137/#138/#139/#140/#141/#132/#112/#123. Badge ⌾ "Diana:" (channel
// coFocusFind → h.coFocusBounty STATELESS). The 26th composition-of-intent axis.
//
// Config-only 1-line flip (86º flag, arc #59-#144). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #143 stamp (10f8be94fd1f). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2832 LIVE flip sim/config.js CO_FOCUS_SURGE enabled:false→true — 86º flag LIVE (Diana ⌾) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#144).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
