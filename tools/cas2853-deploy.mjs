// cas2853-deploy.mjs — LIVE FLIP EVO#149 CO_BUFF_UPTIME_SURGE false→true (Égida ❖,
// 91º flag). CAS-2853 DARK build @51cd96a (CEO Gate 1/2 PASS, DARK QA CAS-2854
// PASS 22/22 ×2, fp 15920977 fpMatch, 0-desync 2-client, single-player collapse B=0,
// 77-census sole-false=CO_BUFF_UPTIME_SURGE, byte-neutral OFF).
// ÉGIDA is the 14th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD, #144 DIANA=TARGET-CONVERGENCE-COUNT, #145 TENAZA=
// GEOMETRY-of-convergence, #146 CONJURO=ABILITY-ACTION-EVENT, #147 QUIEBRO=DODGE-
// REACTION-EVENT, #148 YUGO=INTERRUPT-REACTION-EVENT). ÉGIDA is the SUSTAINED-STATE /
// SHARED-EMPOWERMENT sub-facet (the counterpoint of the THREE EVENT sub-facets #146
// cast / #147 dodge / #148 interrupt): B = # of DISTINCT ALIVE players CARRYING an
// active buff/aura (shield/haste/might/regen) this frame (a BOOLEAN tally over the
// already-replicated buff-UPTIME STATE — single-frame SNAPSHOT, STATELESS, NO
// ring-buffer), independent of WHO applied it, WHETHER anyone applied one this frame
// (#139 SOCORRO counts the APPLICATION-credit), WHETHER they cast (#146 CONJURO),
// dodge (#147 QUIEBRO), interrupt (#148 YUGO), WHAT they aim (#144), or WHERE they
// stand (#142/#145). B∈[0,playerCount] INTEGER. Bands: B≥midBuff(2) ⇒ weight 1
// (partial aegis); B≥hiBuff(3) ⇒ weight 2 (full aegis). Gate minPlayers2; single-player
// ⇒ ≤1 buffed ⇒ B<midBuff ⇒ 0 (clean collapse — impossible to co-buff/share-aegis solo).
// 🔑 DETERMINISM (sev-1): B = INTEGER tally of boolean flags (ZERO float/atan2 in
// score/decision; COMMUTATIVE count ⇒ order-independent) vs INTEGER thresholds
// {midBuff,hiBuff}; float ONLY cosmetic for badge idx=B/playerCap ⇒ 2-client 0-desync.
// CRUX ⊥#139 SOCORRO both dirs (SUSTAINED-STATE ⊥ APPLICATION-EVENT: carry⇒B3/S0,
// apply⇒B0/S3) ⊥#146 CONJURO (buff-state ⊥ any-cast) ⊥#148 YUGO (buff-state ⊥
// interrupt-event) ⊥#132 PARTY_VITAL (bool-int uptime ⊥ HP-fraction float). Fresh channel
// coBuffFind → h.coBuffBounty STATELESS. Badge ❖ "Égida:". The 31st composition-of-intent axis.
//
// Config-only 1-line flip (91º flag, arc #59-#149). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #148 stamp (4a0403b7e832). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2855 LIVE flip sim/config.js CO_BUFF_UPTIME_SURGE enabled:false→true — 91º flag LIVE (Égida ❖) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#149).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
