// cas2800-deploy.mjs — LIVE FLIP EVO#137 CO_PRESENCE_SURGE false→true (Cohorte ⬡,
// 79º flag). CAS-2797 DARK build @1a29871 (CEO Gate 1/2 byteverify + Gate 2/2 no-drift PASS,
// DARK QA CAS-2799 PASS 20/20 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse,
// 65-census sole-false=CO_PRESENCE, CRUX ⊥ ALL priors incl. ⊥#136 CÓNCLAVE (present ⊥ engaged —
// {3 present,1 engaged}=R3/w2 vs CÓNCLAVE F1/0) AND ⊥#123 CONTEST (raw count vs fraction cov/P)
// AND ⊥ CONGREGATION (radio-LOCAL find ⊥ zonal restedMult), byte-neutral OFF).
// COHORTE is the 2nd flag of the PLAYER-COORDINATION sub-family opened by #136 CÓNCLAVE. Where
// CÓNCLAVE measures COMBAT MUSTER (F = # players ENGAGED by ≥1 mob in the SAME fight), COHORTE
// measures CO-PRESENCE / RALLY: R = # DISTINCT ALIVE players PRESENT within the hero's radius,
// INDEPENDENT of whether any mob engages them. R∈[1,P] INTEGER by construction (count of players
// present, not a fraction). Bands: R≥midRally(2) ⇒ weight 1; R≥hiRally(3) ⇒ weight 2. Gate
// minPlayers2; single-player ⇒ ONLY the hero present ⇒ R=1<midRally ⇒ 0 (clean collapse —
// intrinsically multiplayer, literally CANNOT fire solo). 🔑 SNAPSHOT/PURE/STATELESS (NO
// ring-buffer, like #121/#123/#124/#136 — reads the replicated player roster in ONE frame). 🔑
// DETERMINISM (sev-1) — R = INTEGER count of present players vs INTEGER thresholds
// {midRally,hiRally}; ZERO float, ZERO division in score/decision (float ONLY cosmetic for badge
// idx=R/playerCap) ⇒ 2-client 0-desync guaranteed. Badge ⬡ "Cohorte:" (channel coPresenceFind →
// h.coPresenceBounty STATELESS). The 19th composition-of-intent axis.
//
// Config-only 1-line flip (79º flag, arc #59-#137). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js). The gh-pages base is #136 (75fda9c79c56) which does NOT
// carry the #137 CO_PRESENCE DARK seams (they landed in the #137 DARK build 1a29871, NOT deployed)
// — so config.js diverges by the flip line + #137 config, and sim.js/render.js/game.js diverge by
// the DARK seams; all 4 are overlaid from HEAD (preflight verifies presence in the MODS graph).
// version.json is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #136 stamp. Master version.json is stamped
// SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2800 LIVE flip sim/config.js CO_PRESENCE_SURGE enabled:false→true — 79º flag LIVE (Cohorte ⬡) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#137).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
