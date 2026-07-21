// cas2817-deploy.mjs — LIVE FLIP EVO#141 CO_FLEE_SURGE false→true (Repliegue 💨,
// 83º flag). CAS-2815 DARK build @cfad464 (CEO Gate 1/2 & 2/2 PASS, DARK QA CAS-2816/CAS-2817
// PASS 23/23 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse D=0,
// 69-census sole-false=CO_FLEE_SURGE, CRUX ⊥ ALL priors incl. ⊥#140 MURALLA
// (damage-INTAKE ⊥ disengage-REPOSITION — un tank ABSORBE el golpe/se planta ⇒ T cuenta/D0;
// un kiter se reposiciona ILESO alejándose ⇒ D cuenta/T0 — TOMAR-el-golpe ⊥ EVITAR-el-golpe)
// AND ⊥#139 SOCORRO (heal-applied ⊥ reposition) AND ⊥#138 CUADRILLA (kill-output ⊥ flee)
// AND ⊥#137 COHORTE (present ⊥ disengaging) AND ⊥#136 CÓNCLAVE (aggro'd/engaged ⊥ breaking-off —
// aggro'd-pero-plantado ⇒ D0, aggro'd-kiteando ⇒ D cuenta) AND ⊥#132 PARTY_VITAL
// (ally-HP-STATE float ⊥ disengage-ACTION integer count — party full-HP con 3 kiteando este frame ⇒
// TEMPLE W≈1 pero REPLIEGUE D3; party maltrecha plantada ⇒ TEMPLE bajo pero REPLIEGUE D0),
// byte-neutral OFF).
// REPLIEGUE is the 6th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE). REPLIEGUE measures KITE/DISENGAGE-REPOSITION: D = # DISTINCT ALIVE
// players in the shared radius who BROKE CONTACT / repositioned AWAY from their nearest threat this
// frame (kite coordinado / retirada táctica — quién SE ALEJA de la amenaza). D∈[0,P] INTEGER.
// Bands: D≥midFlee(2) ⇒ weight 1; D≥hiFlee(3) ⇒ weight 2. Gate minPlayers2; single-player ⇒ hero
// solo cannot co-kite with anyone ⇒ D collapses <midFlee ⇒ 0 (clean collapse — needs ≥2 allies
// disengaging). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads replicated pos/vel in ONE frame —
// disengage is server-auth by MMO design, SAME replicated-event class as #140 damage-credit / #139
// support-credit). 🔑 DETERMINISM (sev-1): D = INTEGER count of credited kiters vs INTEGER thresholds
// {midFlee,hiFlee}; ZERO float, ZERO division in score/decision (float ONLY cosmetic for badge
// idx=D/playerCap) ⇒ 2-client 0-desync. Badge 💨 "Repliegue:" (channel coFleeFind →
// h.coFleeBounty STATELESS). The 23rd composition-of-intent axis.
//
// Config-only 1-line flip (83º flag, arc #59-#141). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #140 stamp (e1267a40e18c). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2818 LIVE flip sim/config.js CO_FLEE_SURGE enabled:false→true — 83º flag LIVE (Repliegue 💨) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#141).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
