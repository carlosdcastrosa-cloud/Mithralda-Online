// cas2804-deploy.mjs — LIVE FLIP EVO#138 CO_KILL_SURGE false→true (Cuadrilla ⨂,
// 80º flag). CAS-2802 DARK build @e69a5a0 (CEO Gate 1/2 + 2/2 byteverify PASS, DARK QA CAS-2803
// PASS 21/21 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse K=1⇒0,
// 66-census sole-false=CO_KILL, CRUX ⊥ ALL priors incl. ⊥#137 COHORTE (present ⊥ contributing —
// {4 present,1 killing}=COHORTE R4/w2 vs CUADRILLA K1/0) AND ⊥#136 CÓNCLAVE (engaged ⊥ contributing)
// AND ⊥#62 FOCUS_FIRE (aim-same-target passive goldFind ⊥ co-kill OUTPUT find), byte-neutral OFF).
// CUADRILLA is the 3rd flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED, #137
// COHORTE=PRESENT). CUADRILLA measures OUTPUT/CO-KILL: K = # DISTINCT ALIVE players CREDITED with a
// kill-blow within the shared kill-cluster radius. K∈[1,P] INTEGER. Bands: K≥midAssist(2) ⇒ weight 1;
// K≥hiAssist(3) ⇒ weight 2. Gate minPlayers2; single-player ⇒ ONLY hero credited ⇒ K=1<midAssist ⇒ 0
// (clean collapse — IMPOSSIBLE solo). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads replicated
// kill-credit in ONE frame — damage/kill credit is server-auth by MMO design). 🔑 DETERMINISM (sev-1):
// K = INTEGER count of credited killers vs INTEGER thresholds {midAssist,hiAssist}; ZERO float, ZERO
// division in score/decision (float ONLY cosmetic for badge idx=K/playerCap) ⇒ 2-client 0-desync.
// Badge ⨂ "Cuadrilla:" (channel coKillFind → h.coKillBounty STATELESS). The 20th composition-of-intent axis.
//
// Config-only 1-line flip (80º flag, arc #59-#138). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #137 stamp (d2fe18611bd2). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2804 LIVE flip sim/config.js CO_KILL_SURGE enabled:false→true — 80º flag LIVE (Cuadrilla ⨂) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#138).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
