// cas2686-deploy.mjs — LIVE FLIP EVO#116 ORBIT_SURGE false→true (Remate de Carrusel,
// 58º flag). CAS-2684 DARK build @5769507 (CEO Gate 1/2 + DARK QA CAS-2685 PASS 18/18,
// 0 commits, byte-neutral OFF + CEO Gate 2/2). selfverify cas2684-orbit-selfverify PASS
// 18/18, 2-client 0-desync fp 15920977, byte-neutral OFF, STATELESS h.orbitBounty — eje
// CINÉTICO/ROTACIONAL de COHESIÓN DE VELOCIDAD ORBITAL / CIRCULACIÓN NETA de la manada.
// orbitField = C = |Σ vᵢ·(mᵢ·t̂ᵢ)| / (Σ vᵢ) ∈[0,1], la MEDIA PONDERADA POR VELOCIDAD del
// coseno TANGENCIAL SIGNADO (t̂ = perp CCW de mob→hero), mᵢ=headingIntent vᵢ=speedIntent
// (MISMA rama IA que #110/#111/#112 — NO e.vx/e.vy INERTES) de los mobs VIVOS EN MOVIMIENTO
// en radius300 ≥minMobs3. VORTICIDAD/CURL del campo de velocidad, magnitud-INVARIANTE (/Σv),
// hero-relativa. Bands ≥hiOrbit0.60⇒2 (carrusel) / ≥midOrbit0.30⇒1 (swirl) / <0.30⇒0
// (radial/mixto). Canal FRESCO orbitFind→h.orbitBounty, badge ⟳ "Órbita". La 3ª pierna de
// velocity-cohesion (⊥ #110 ORIENT world-frame, ⊥ #112 CONVERGE radial): TANGENCIAL/rotacional.
// ⊥#112 CONVERGE (radial cos ⊥ tangencial sin, 4-quad) / ⊥#110 ORIENT (world-agree ⊥ curl)
// / ⊥#111 SPEED (mag-CV ⊥ dirección) / ⊥all 57 live flags #59-#115.
//
// Config-only 1-line flip (58º flag, arc #59-#116). Overlay = the canonical 4-file MODS set
// (game.js/render.js/config.js/sim.js) — the DARK build 5769507 touched exactly these code
// files (ORBIT seams in game.js/render.js/sim.js, flag block in config.js) and the gh-pages
// base (#115 SIZECLASS fee53af8af16) lacks them, so all 4 diverge and must be overlaid from
// HEAD. version.json is stamped with a FRESH build hash by deploy-lib's computeBuild
// (recomputes over base∪overlay) so served advances off the stale #115 stamp. Master
// version.json is stamped SEPARATELY to byte-match the gh-pages blob.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2686 LIVE flip sim/config.js ORBIT_SURGE enabled:false→true — 58º flag LIVE (Remate de Carrusel) — config-only 1-line overlay deploy + fresh version.json stamp (arc #59-#116).",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
