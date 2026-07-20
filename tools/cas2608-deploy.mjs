// cas2608-deploy.mjs — LIVE FLIP EVO#101 LUNGE_SURGE false→true (CAS-2608 / CAS-2600 build;
// CEO Gate 1/2 PASS @dcffd95 + DARK QA CAS-2602 PASS 18/18 (2-client 0-desync fp 15920977
// fps61, byte-neutral OFF, STATELESS, lungeWeight=band ETPL[type].lunge BASE — distancia de
// estocada/pounce — LUT edges 130/129·110/109, ⊥override reads BASE lunge, ⊥#93 ROLE 4
// rushers barren, ⊥#94 SWIFT bat spd158/lunge0 vs wolf spd128/lunge1, ⊥all 42 live flags)
// + CEO Gate 2/2 PASS @b1e207c. Config-only 1-line flip (43º flag, arc #59-#101).
// Overlay = the canonical 4-file MODS set (game.js/render.js/config.js/sim.js) — the DARK
// build dcffd95 touched exactly these code files (LUNGE seams in game.js/render.js/sim.js,
// flag block in config.js), all covered. The 2 intervening commits (a6f70e0/b1e207c) are
// QA-harness-only (0 game-logic). version.json is stamped with a FRESH build hash by
// deploy-lib's computeBuild (recomputes over base∪overlay) so served advances off the stale
// #100 stamp e1d801e51573. Master version.json is stamped SEPARATELY after this runs.
import { deployOverlay } from "./deploy-lib.mjs";

const OVERLAY = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];

const res = deployOverlay({
  overlay: OVERLAY,
  message: "CAS-2608 LIVE FLIP EVO#101 LUNGE_SURGE.enabled false→true (Remate de Acometida) — config-only 1-line overlay deploy + fresh version.json stamp.",
});

console.log("preflight (missing must be []):", JSON.stringify(res.preflight.missing));
console.log("overlay shas:", JSON.stringify(res.overlaySha, null, 0));
console.log("build:", res.build, "files:", res.files);
console.log("gh-pages commit:", res.commit, "pushed:", res.pushed);
if (res.err) console.log("ERR:", res.err);
if (!res.pushed) process.exit(1);
