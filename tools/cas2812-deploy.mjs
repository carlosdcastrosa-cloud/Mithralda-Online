// cas2812-deploy.mjs — LIVE FLIP EVO#140 CO_TANK_SURGE false→true (Muralla 🛡,
// 82º flag). CAS-2811 DARK build @c74b74b (CEO Gate 1/2 PASS, DARK QA CAS-2812
// PASS 23/23 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse T=0,
// 68-census sole-false=CO_TANK_SURGE, CRUX ⊥ ALL priors incl. ⊥#139 SOCORRO
// (support-applied ⊥ damage-absorbed — un tank de la línea de frente absorbiendo golpes
// landea 0 heals ⇒ SOCORRO S0 pero MURALLA lo cuenta; un sanador de retaguardia toma 0
// golpes ⇒ MURALLA T0 pero SOCORRO lo cuenta) AND ⊥#138 CUADRILLA (kill-OUTPUT ⊥ absorber)
// AND ⊥#137 COHORTE (present ⊥ absorbing) AND ⊥#136 CÓNCLAVE (aggro'd/engaged ⊥ damage-taken —
// aggro'd-pero-esquivando ⇒ T0, AoE-splash-sin-aggro ⇒ T cuenta) AND ⊥#132 PARTY_VITAL
// (ally-HP-STATE float ⊥ burden-spread-ACTION integer count — party a full-HP con 3 comiendo
// chip-damage este frame ⇒ TEMPLE W≈1 pero MURALLA T3), byte-neutral OFF).
// MURALLA is the 5th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER). MURALLA measures
// BURDEN-SPREAD/CO-TANK: T = # DISTINCT ALIVE players in the shared radius who ABSORBED/TOOK a tick
// of mob damage this frame (damage-intake credit — quién REPARTE la carga de golpes). T∈[0,P] INTEGER.
// Bands: T≥midBrunt(2) ⇒ weight 1; T≥hiBrunt(3) ⇒ weight 2. Gate minPlayers2; single-player ⇒ hero
// solo cannot spread the burden across anyone ⇒ T collapses <midBrunt ⇒ 0 (clean collapse — needs
// ≥2 allies absorbing hits). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads replicated damage-intake
// in ONE frame — damage credit is server-auth by MMO design, SAME replicated-event class as #138
// kill-credit / #139 support-credit). 🔑 DETERMINISM (sev-1): T = INTEGER count of credited absorbers
// vs INTEGER thresholds {midBrunt,hiBrunt}; ZERO float, ZERO division in score/decision (float ONLY
// cosmetic for badge idx=T/playerCap) ⇒ 2-client 0-desync. Badge 🛡 "Muralla:" (channel coTankFind →
// h.coTankBounty STATELESS). The 22nd composition-of-intent axis.
//
// Config-only 1-line flip (82º flag, arc #59-#140). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #139 stamp (5f4a11037d5f). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2813 LIVE flip sim/config.js CO_TANK_SURGE enabled:false→true — 82º flag LIVE (Muralla 🛡) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#140).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
