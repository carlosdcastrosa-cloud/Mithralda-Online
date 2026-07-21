// cas2835-deploy.mjs — LIVE FLIP EVO#145 CO_FLANK_SURGE false→true (Tenaza ⇹,
// 87º flag). CAS-2835 DARK build @322b7ab (CEO Gate 1/2 PASS, DARK QA CAS-2836 PASS
// 21/21 ×2, fp 15920977 fpMatch, 0-desync 2-client, single-player collapse F=0,
// 73-census sole-false=CO_FLANK_SURGE, byte-neutral OFF).
// TENAZA is the 10th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION,
// #143 ENVITE=VELOCITY-TOWARD, #144 DIANA=TARGET-CONVERGENCE-COUNT). TENAZA opens the
// GEOMETRY sub-facet of the convergence #144 DIANA opened: where DIANA counts HOW MANY
// players share a targetId on a mob (a raw COUNT), TENAZA reads the ANGULAR ARRANGEMENT
// of those attackers AROUND the mob — F = MAX over mobs of (# DISTINCT ANGULAR SECTORS
// occupied by the alive players targeting that mob, within engagement radius). Each player
// buckets to a sector by PURE INTEGER SIGN of its mob-centric offset: sx=sign(dx),
// sy=sign(dy), sector=(sx+1)*3+(sy+1) ∈ {0..8}; F = popcount of the OR-mask of occupied
// sectors (COMMUTATIVE set union ⇒ order-independent ⇒ deterministic). F∈[0,9] INTEGER.
// Bands: F≥midFlank(2) ⇒ weight 1 (partial pincer); F≥hiFlank(3) ⇒ weight 2 (full surround).
// Gate minPlayers2; single-player ⇒ ≤1 attacker on any mob ⇒ ≤1 sector ⇒ F<midFlank ⇒ 0
// (clean collapse — impossible to pincer solo). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer,
// reads replicated targetId+positions in ONE frame — same snapshot as DIANA #144). 🔑
// DETERMINISM (sev-1): F = popcount of an INTEGER-sign sector mask (ZERO atan2/angle/float;
// OR of masks is COMMUTATIVE) vs INTEGER thresholds {midFlank,hiFlank}; ZERO float in
// score/decision (float ONLY cosmetic for badge idx=F/playerCap) ⇒ 2-client 0-desync. CRUX
// ⊥#144 DIANA (COUNT ⊥ GEOMETRY — 3 clumped one flank G3/F1 vs 2 in pincer G2/F2) ⊥#108
// FLANK_SURGE (VERIFIED — mob-side angular float ⊥ player-side integer sector count, fresh
// channel coFlankFind) ⊥#142 PIÑA (player↔player tightness ⊥ player↔target arrangement)
// ⊥#112/#143/#141/#140/#139/#138/#137/#136/#132/#123/#128. Badge ⇹ "Tenaza:" (channel
// coFlankFind → h.coFlankBounty STATELESS). The 27th composition-of-intent axis.
//
// Config-only 1-line flip (87º flag, arc #59-#145). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in
// the MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #144 stamp (a210d646fa96). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2837 LIVE flip sim/config.js CO_FLANK_SURGE enabled:false→true — 87º flag LIVE (Tenaza ⇹) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#145).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
