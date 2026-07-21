// cas2824-deploy.mjs — LIVE FLIP EVO#143 CO_ADVANCE_SURGE false→true (Envite ➤,
// 85º flag). CAS-2824 DARK build @e3ca516 (CEO Gate 1/2 & 2/2 PASS, DARK QA CAS-2825/2826
// PASS 22/22 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse A=0,
// 71-census sole-false=CO_ADVANCE_SURGE, CRUX ⊥#141 REPLIEGUE (INVERSO MILITANTE exacto:
// REPLIEGUE cuenta velocidad-AWAY/kite ⊥ ENVITE cuenta velocidad-TOWARD/commit — MISMAS
// posiciones, TOWARD⇒A3/D0, AWAY⇒A0/D3) AND ⊥#142 PIÑA (velocidad-ACTION ⊥ posición-STATE:
// party puede avanzar DISPERSA A-alto/C-bajo o plantarse APIÑADA C-alto/A0) AND ⊥#136/#137/
// #138/#139/#140 (avanzar-hacia ⊥ engaged/present/kill/heal/absorb) AND ⊥#132 PARTY_VITAL
// (movimiento ⊥ HP-STATE float) AND ⊥#128 MOMENTUM (snapshot 1-frame no derivada) AND ⊥#112
// CONVERGE (velocidad del JUGADOR ⊥ velocidad radial de los MOBS), byte-neutral OFF).
// ENVITE is the 8th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE, #142 PIÑA=SPATIAL-COHESION).
// A = # DISTINCT ALIVE players within the shared radius (300px) whose this-frame movement
// VECTOR points TOWARD the shared threat (INTEGER sign test of dot `(tx−dx)*vx+(ty−dy)*vy>0`
// over already-replicated INTEGER offsets/velocities). A∈[0,P] INTEGER. Bands: A≥midAdvance(2)
// ⇒ weight 1; A≥hiAdvance(3) ⇒ weight 2. Gate minPlayers2; single-player ⇒ no synthetic party
// AND no shared threat ⇒ A collapses ⇒ 0 (clean collapse — impossible to co-advance solo).
// 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads replicated pos/vel in ONE frame — SAME
// replicated-state class as #141 REPLIEGUE / #129 / #130). 🔑 DETERMINISM (sev-1): A = INTEGER
// count via INTEGER dot-product sign vs INTEGER thresholds {midAdvance,hiAdvance}; ZERO float,
// ZERO division, ZERO normalization/angle in score/decision (float ONLY cosmetic for badge
// idx=A/playerCap) ⇒ 2-client 0-desync. Badge ➤ "Envite:" (channel coAdvanceFind →
// h.coAdvanceBounty STATELESS). The 25th composition-of-intent axis.
//
// Config-only 1-line flip (85º flag, arc #59-#143). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #142 stamp (3a014051fb4f). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2827 LIVE flip sim/config.js CO_ADVANCE_SURGE enabled:false→true — 85º flag LIVE (Envite ➤) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#143).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
