// cas2849-deploy.mjs — LIVE FLIP EVO#148 CO_INTERRUPT_SURGE false→true (Yugo ⛒,
// 90º flag). CAS-2849 DARK build @95d9992 (CEO Gate 1/2 PASS, DARK QA CAS-2850
// PASS 22/22 ×2, fp 15920977 fpMatch, 0-desync 2-client, single-player collapse I=0,
// 76-census sole-false=CO_INTERRUPT_SURGE, byte-neutral OFF).
// YUGO is the 13th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD, #144 DIANA=TARGET-CONVERGENCE-COUNT, #145 TENAZA=
// GEOMETRY-of-convergence, #146 CONJURO=ABILITY-ACTION-EVENT, #147 QUIEBRO=DODGE-
// REACTION-EVENT). YUGO is the OFFENSIVE CONTROL-EFFECT REACTION-EVENT sub-facet
// (offensive mirror of #147 QUIEBRO): I = # of DISTINCT ALIVE players LANDING an
// interrupt/stagger/poise-break on an ENEMY this frame (a BOOLEAN tally over the
// already-replicated interrupt EVENT — single-frame SNAPSHOT, STATELESS, NO ring-buffer),
// independent of WHETHER they cast (#146 CONJURO), dodge (#147 QUIEBRO), WHAT they aim
// (#144), WHERE they stand (#142/#145), or HOW they flee (#141). I∈[0,playerCount]
// INTEGER. Bands: I≥midInterrupt(2) ⇒ weight 1 (partial lockdown); I≥hiInterrupt(3) ⇒
// weight 2 (full lockdown). Gate minPlayers2; single-player ⇒ ≤1 interrupter ⇒
// I<midInterrupt ⇒ 0 (clean collapse — impossible to co-interrupt solo). 🔑 DETERMINISM
// (sev-1): I = INTEGER tally of boolean flags (ZERO float/atan2 in score/decision;
// COMMUTATIVE count ⇒ order-independent) vs INTEGER thresholds {midInterrupt,hiInterrupt};
// float ONLY cosmetic for badge idx=I/playerCap ⇒ 2-client 0-desync.
// CRUX ⊥#146 CONJURO both dirs (poise-break⇒I3/U0, cast⇒I0/U3) ⊥#147 QUIEBRO (interrupt-
// event ⊥ dodge-state, OPPOSITES: int⇒I3/D0, dodge⇒I0/D3) ⊥#143 ENVITE (control-event ⊥
// velocity-toward) ⊥#89 INTERRUPT_SURGE (mob-side ⊥ player-side). Fresh channel
// coInterruptFind → h.coInterruptBounty STATELESS. Badge ⛒ "Yugo:". The 30th
// composition-of-intent axis.
//
// Config-only 1-line flip (90º flag, arc #59-#148). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #147 stamp (90e5b2600ac2). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2851 LIVE flip sim/config.js CO_INTERRUPT_SURGE enabled:false→true — 90º flag LIVE (Yugo ⛒) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#148).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
