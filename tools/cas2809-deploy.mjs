// cas2809-deploy.mjs — LIVE FLIP EVO#139 CO_SUPPORT_SURGE false→true (Socorro ⛑,
// 81º flag). CAS-2807 DARK build @a7931d8 (CEO Gate 1/2 + 2/2 byteverify PASS, DARK QA CAS-2808
// PASS 22/22 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse S=0, 67-census
// sole-false=CO_SUPPORT_SURGE, CRUX ⊥ ALL priors incl. ⊥#138 CUADRILLA (kill-OUTPUT ⊥ succor —
// un sanador que sostiene la party landea 0 kills ⇒ CUADRILLA 0 pero SOCORRO lo cuenta) AND
// ⊥#137 COHORTE (present ⊥ supporting) AND ⊥#136 CÓNCLAVE (engaged ⊥ supporting) AND ⊥#132
// PARTY_VITAL (ally-HP-STATE float ⊥ succor-ACTION integer count — party a full-HP con nadie
// socorriendo ⇒ TEMPLE W≈1 pero SOCORRO S0), byte-neutral OFF).
// SOCORRO is the 4th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT). SOCORRO measures ENABLER/SUCCOR: S = #
// DISTINCT ALIVE players in the shared radius who APPLIED a succor (heal/shield/buff/revive) to an
// ally this frame. S∈[0,P] INTEGER. Bands: S≥midSuccor(2) ⇒ weight 1; S≥hiSuccor(3) ⇒ weight 2.
// Gate minPlayers2; single-player ⇒ hero succors nobody ⇒ S=0 ⇒ 0 (clean collapse — IMPOSSIBLE
// solo by construction: needs ≥2 allies succoring). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer,
// reads replicated support-credit in ONE frame — heal/buff/revive credit is server-auth by MMO
// design, SAME replicated-event class as #138 kill-credit). 🔑 DETERMINISM (sev-1): S = INTEGER
// count of credited succorers vs INTEGER thresholds {midSuccor,hiSuccor}; ZERO float, ZERO
// division in score/decision (float ONLY cosmetic for badge idx=S/playerCap) ⇒ 2-client 0-desync.
// Badge ⛑ "Socorro:" (channel coSupportFind → h.coSupportBounty STATELESS). The 21st composition-of-intent axis.
//
// Config-only 1-line flip (81º flag, arc #59-#139). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #138 stamp (9527556851d4). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2809 LIVE flip sim/config.js CO_SUPPORT_SURGE enabled:false→true — 81º flag LIVE (Socorro ⛑) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#139).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
