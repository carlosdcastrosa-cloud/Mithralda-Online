// cas2820-deploy.mjs — LIVE FLIP EVO#142 CO_COHESION_SURGE false→true (Piña ⦿,
// 84º flag). CAS-2820 DARK build @be3d0f6 (CEO Gate 1/2 & 2/2 PASS, DARK QA CAS-2821
// PASS 22/22 ×2, fp 15920977, 0-desync 2-client A==B, single-player collapse C=0,
// 70-census sole-false=CO_COHESION_SURGE, CRUX ⊥ ALL priors incl. ⊥#137 COHORTE
// (present-in-radius 300px ⊥ clustered-in-tight-radius 132px — ESTAR-PRESENTE ⊥
// ESTAR-APIÑADO: 3 presentes dispersos a ~200px ⇒ COHORTE R3/w2 pero PIÑA C0/w0;
// 3 apiñados a ~80px ⇒ ambas altas) AND ⊥#141 REPLIEGUE (disengage-ACTION ⊥
// tightness-STATE — plantarse apiñado ⇒ C alto/D0; replegarse disperso ⇒ D alto/C bajo)
// AND ⊥#136/#138/#139/#140 (geometría del roster ⊥ qué ACCIÓN de combate ejecuta cada
// quién) AND ⊥#132 PARTY_VITAL (tightness ESPACIAL ⊥ HP-STATE float — full-HP puede estar
// disperso C0 o apiñado C3), byte-neutral OFF).
// PIÑA is the 7th flag of the PLAYER-COORDINATION sub-family (#136 CÓNCLAVE=ENGAGED,
// #137 COHORTE=PRESENT, #138 CUADRILLA=KILL-OUTPUT, #139 SOCORRO=SUCCOR-ENABLER,
// #140 MURALLA=DAMAGE-INTAKE, #141 REPLIEGUE=DISENGAGE). PIÑA opens a NEW sub-dimension:
// the six priors are WHO-DID-AN-ACTION counts; PIÑA measures GEOMETRY — how TIGHTLY-CLUSTERED
// the ALIVE roster is this frame. C = # DISTINCT ALIVE players within a TIGHT cohesion radius
// (132px) around the hero (the formation anchor) = shoulder-to-shoulder allies. C∈[0,P] INTEGER.
// Bands: C≥midCohesion(2) ⇒ weight 1; C≥hiCohesion(3) ⇒ weight 2. Gate minPlayers2; single-player
// ⇒ hero clustered only with itself ⇒ C=1<midCohesion ⇒ 0 (clean collapse — impossible to form a
// piña solo). 🔑 SNAPSHOT/PURE/STATELESS (NO ring-buffer, reads replicated positions in ONE frame —
// player pos is server-auth by MMO design, SAME replicated-state class as #129/#130/#141). 🔑
// DETERMINISM (sev-1): C = INTEGER count of clustered players (INTEGER squared-distance dx²+dy²≤R²,
// the SAME position arithmetic as coFleeRoster/coPresenceRoster — ZERO new division, ZERO float
// centroid) vs INTEGER thresholds {midCohesion,hiCohesion}; ZERO float, ZERO division in
// score/decision (float ONLY cosmetic for badge idx=C/playerCap) ⇒ 2-client 0-desync. Badge ⦿
// "Piña:" (channel coCohesionFind → h.coCohesionBounty STATELESS). The 24th composition-of-intent axis.
//
// Config-only 1-line flip (84º flag, arc #59-#142). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js), all overlaid from HEAD (preflight verifies presence in the
// MODS graph). version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the #141 stamp (83032b54f4e8). Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2822 LIVE flip sim/config.js CO_COHESION_SURGE enabled:false→true — 84º flag LIVE (Piña ⦿) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#142).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
