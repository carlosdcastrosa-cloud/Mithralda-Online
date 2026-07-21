// cas2844-deploy.mjs — LIVE FLIP EVO#147 CO_DODGE_SURGE false→true (Quiebro ⟿,
// 89º flag). CAS-2844 DARK build @e42f600 (CEO Gate 1/2 PASS, DARK QA CAS-2846
// PASS 22/22 ×2, fp 15920977 fpMatch, 0-desync 2-client, single-player collapse D=0,
// 75-census sole-false=CO_DODGE_SURGE, byte-neutral OFF).
// QUIEBRO is the 12th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD, #144 DIANA=TARGET-CONVERGENCE-COUNT, #145 TENAZA=
// GEOMETRY-of-convergence, #146 CONJURO=ABILITY-ACTION-EVENT). QUIEBRO is the DEFENSIVE
// REACTION-EVENT sub-facet: D = # of DISTINCT ALIVE players with a dodge/roll/i-frame flag
// ACTIVE this frame (a BOOLEAN tally over the already-replicated dodge state — single-frame
// SNAPSHOT, STATELESS, NO ring-buffer), independent of WHETHER they cast (#146 CONJURO),
// WHAT they aim (#144), WHERE they stand (#142/#145), or HOW they flee (#141). D∈[0,playerCount]
// INTEGER. Bands: D≥midDodge(2) ⇒ weight 1 (partial sync); D≥hiDodge(3) ⇒ weight 2 (full sync).
// Gate minPlayers2; single-player ⇒ ≤1 dodger ⇒ D<midDodge ⇒ 0 (clean collapse — impossible
// to co-dodge solo). 🔑 DETERMINISM (sev-1): D = INTEGER tally of boolean flags (ZERO float/
// atan2 in score/decision; COMMUTATIVE count ⇒ order-independent) vs INTEGER thresholds
// {midDodge,hiDodge}; float ONLY cosmetic for badge idx=D/playerCap ⇒ 2-client 0-desync.
// CRUX ⊥#146 CONJURO both dirs (roll⇒D3/U0, cast⇒D0/U3) ⊥#141 REPLIEGUE (dodge-event ⊥
// flee-velocity) ⊥#140 MURALLA (evade ⊥ absorb) ⊥#138/#144/#145. Fresh channel coDodgeFind →
// h.coDodgeBounty STATELESS. Badge ⟿ "Quiebro:". The 29th composition-of-intent axis.
//
// Config-only 1-line flip (89º flag, arc #59-#147). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #146 stamp (b8c147402d1f). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2847 LIVE flip sim/config.js CO_DODGE_SURGE enabled:false→true — 89º flag LIVE (Quiebro ⟿) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#147).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
