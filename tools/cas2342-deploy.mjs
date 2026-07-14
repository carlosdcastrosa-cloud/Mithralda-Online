import { deployOverlay, gitStr } from "./deploy-lib.mjs";
// CAS-2342: consistent-HEAD overlay deploy of the class-hero fallback pipeline (assets/class + CLS wiring).
// GE→CTO handoff: the class-hero anim pipeline (CAS-2218 + CAS-2209) is committed to master but not LIVE.
// This ships it at HEAD alongside the already-LIVE arc (no EVO flip here).
//
// AUTHORITATIVE DIVERGENCE (computed by preflightOverlay from git, NOT trusted from ticket prose):
//   git diff --name-only origin/gh-pages HEAD  ∩  MODS(index.html const MODS)  ==
//     ["game.js","render/render.js","render/sprites.js","sim/config.js","sim/sim.js"]  (5 files DIVERGE & are LOADED).
//   ALL 5 ship at HEAD ⇒ the LIVE module graph is consistent-HEAD (no stale-sibling ES-module drift → no boot crash).
//   config.js live→HEAD delta = ONLY the new LONG_WATCH block (EVO#54), enabled:false = DARK/hard-gated
//     ⇒ ZERO behavioral change; the 4 prior arc flags (WorldPulse/Soul/Congregation/Wayfarer/Confluence) are already LIVE.
//   No EVO flag flips in this deploy.
//
// ASSETS (additive, cosmetic, zero boot risk — not in MODS, so preflight ignores them):
//   All 45 assets/class/{warrior,mage,paladin,druid,priest}_{idle,walk,attack}_{down,up,side}.png that DIVERGE
//   live→HEAD (independent computation shows warrior blobs also diverge, not just the 36 casters the prose named —
//   I ship the computed divergent set). gh-pages currently serves the old placeholders (e.g. mage_attack_down 505B
//   LIVE vs 16021B HEAD). The CLS/drawClassFrame path is the class-select preview + last-resort fallback; the
//   playable in-world hero is the ERW clshero_/drawHeroClass path (CAS-2179) ⇒ zero live-hero impact.
//
// consistent-HEAD / WIP isolation: deployOverlay ships the HEAD blob per path (git rev-parse HEAD:<f>), NOT the
//   working tree ⇒ the uncommitted WIP CAS-2200 (M render/render.js in git status) is NEVER shipped.
//   Reversible: additive assets + already-committed code; revert = re-run overlay from a prior gh-pages base.

const MODS = ["sim/config.js", "sim/sim.js", "game.js", "render/render.js", "render/sprites.js"];

// Compute the divergent assets/class set independently (do not hardcode the 36/45 count).
const assets = gitStr("diff", "--name-only", "origin/gh-pages", "HEAD", "--", "assets/class/")
  .split("\n").filter(Boolean);

const overlay = {};
for (const f of [...MODS, ...assets]) overlay[f] = "HEAD";

console.error(`overlay: ${MODS.length} MODS files + ${assets.length} assets/class blobs = ${Object.keys(overlay).length} paths`);

const res = deployOverlay({
  overlay,
  head: "HEAD",
  message: "CAS-2342 deploy class-hero fallback (assets/class real anim frames + render/sprites.js CLS wiring, CAS-2218+CAS-2209) at HEAD; consistent-HEAD overlay of 5 MODS {config,sim,game,render/render,render/sprites} + " + assets.length + " divergent assets/class blobs (casters walk/idle/attack real frames replacing old placeholders + warrior); NO EVO flip — config.js delta is only the DARK LONG_WATCH block (EVO#54 enabled:false, hard-gated, behavior-neutral); arc WorldPulse/Soul/Congregation/Wayfarer/Confluence stays LIVE; WIP CAS-2200 render.js not shipped (HEAD blob); cosmetic/additive/reversible; class-select previews now render real attack frames",
});
console.log(JSON.stringify(res, null, 2));
