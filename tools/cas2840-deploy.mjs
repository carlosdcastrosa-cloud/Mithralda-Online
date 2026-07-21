// cas2840-deploy.mjs — LIVE FLIP EVO#146 CO_CAST_SURGE false→true (Conjuro ✷,
// 88º flag). CAS-2840 DARK build @a8d82ff (CEO Gate 1/2 BOTH PASS, DARK QA CAS-2841
// PASS 21/21 ×2, fp 15920977 fpMatch, 0-desync 2-client, single-player collapse U=0,
// 74-census sole-false=CO_CAST_SURGE, byte-neutral OFF).
// CONJURO is the 11th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD, #144 DIANA=TARGET-CONVERGENCE-COUNT, #145 TENAZA=
// GEOMETRY-of-convergence). CONJURO opens the ACTION-EVENT sub-facet: U = # of DISTINCT
// ALIVE players with an ability-activation flag ACTIVE this frame (a BOOLEAN tally over
// the already-replicated cast/skill state — single-frame SNAPSHOT, STATELESS, NO ring-
// buffer), independent of WHAT they aim (#144), WHERE they stand (#142/#145), or WHICH
// support class they apply (#139). U∈[0,playerCount] INTEGER. Bands: U≥midCast(2) ⇒
// weight 1 (partial sync); U≥hiCast(3) ⇒ weight 2 (full sync). Gate minPlayers2; single-
// player ⇒ ≤1 caster ⇒ U<midCast ⇒ 0 (clean collapse — impossible to co-cast solo).
// 🔑 DETERMINISM (sev-1): U = INTEGER tally of boolean flags (ZERO float/atan2 in
// score/decision; COMMUTATIVE count ⇒ order-independent) vs INTEGER thresholds
// {midCast,hiCast}; float ONLY cosmetic for badge idx=U/playerCap ⇒ 2-client 0-desync.
// CRUX ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY) ⊥#138 CUADRILLA (casting ⊥ killing)
// ⊥#144 DIANA (activate ⊥ share-target) ⊥#145 TENAZA (action-event ⊥ geometry)
// ⊥#140/#132/#123. Fresh channel coCastFind → h.coCastBounty STATELESS. Badge ✷
// "Conjuro:". The 28th composition-of-intent axis.
//
// Config-only 1-line flip (88º flag, arc #59-#146). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #145 stamp (251653b6d194). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2842 LIVE flip sim/config.js CO_CAST_SURGE enabled:false→true — 88º flag LIVE (Conjuro ✷) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#146).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
