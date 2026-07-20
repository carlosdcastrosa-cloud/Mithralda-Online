// cas2617-deploy.mjs — LIVE FLIP EVO#103 GOLD_SURGE false→true (CAS-2617 / CAS-2615 build;
// CEO Gate 1/2 PASS selfverify 22/22 @035e119 + DARK QA CAS-2616 INDEP re-derivation 9/9
// @035e119 (2-client 0-desync fp 15920977, terrHash 2105484439, byte-neutral OFF, STATELESS,
// goldWeight=band ETPL[type].gold[1] BASE — techo de bolsa/magnitud de moneda — bands
// hiGold23/midGold12, gaps disjuntos 9→15 y 22→24, canal FRESCO coinFind→h.coinBounty
// sub-cap2, ⊥override goldOf reads BASE, ⊥#72 SCARCITY proven, ⊥#102 GEARCHANCE proven,
// ⊥all 44 live flags) + CEO Gate 2/2 verified (df3a7b58 done). Config-only 1-line flip
// (45º flag, arc #59-#103). Overlay = the canonical 4-file MODS set (game.js/render.js/
// config.js/sim.js) — the DARK build 035e119 touched exactly these code files (GOLD seams
// in game.js/render.js/sim.js, flag block in config.js); confirmed the ONLY divergent MODS
// code files vs gh-pages are exactly these 4 (render/sprites.js byte-identical). version.json
// is stamped with a FRESH build hash by deploy-lib's computeBuild (recomputes over
// base∪overlay) so served advances off the stale #102 stamp ba2bf2c81434. Master version.json
// is stamped SEPARATELY after this runs.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2617 LIVE FLIP EVO#103 GOLD_SURGE.enabled false→true (Remate de Bolsa) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
