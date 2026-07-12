// deploy-lib.test.mjs — smoke/unit proof of the overlay-drift preflight guard. (CAS-2223)
// Run: node tools/deploy-lib.test.mjs   (exit 0 = pass, 1 = fail). No deps, no network.
import { checkOverlayConsistency, parseMods } from "./deploy-lib.mjs";

let pass = 0, fail = 0;
const ok = (name, cond) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); };
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ── AC1: the exact CAS-2202 SEV-1 shape is REJECTED ────────────────────────────
// render.js diverged (needs T_STREET/PIXELART) and config.js diverged with those
// exports, but the deploy only overlaid render.js → config.js left stale → crash.
{
  const r = checkOverlayConsistency({
    divergent: ["render/render.js", "sim/config.js", "logic.js"], // logic.js not in MODS
    mods: ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"],
    overlay: ["render/render.js"], // ← the fatal 1-blob overlay
  });
  ok("CAS-2202 shape rejected (config.js flagged missing)", !r.ok && eqArr(r.missing, ["sim/config.js"]));
}

// ── AC2: the CONSISTENT fix (overlay both) is ACCEPTED ─────────────────────────
{
  const r = checkOverlayConsistency({
    divergent: ["render/render.js", "sim/config.js", "logic.js"],
    mods: ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"],
    overlay: ["render/render.js", "sim/config.js"],
  });
  ok("consistent overlay accepted", r.ok && r.missing.length === 0);
}

// ── AC2': a clean deploy where the only divergences are NON-loaded files passes ─
// (mirrors reality: logic.js/version.js diverge but aren't in MODS → not a risk.)
{
  const r = checkOverlayConsistency({
    divergent: ["logic.js", "version.js", "assets/foo.png"],
    mods: ["game.js", "render/render.js", "sim/config.js"],
    overlay: ["assets/foo.png"],
  });
  ok("non-loaded divergences ignored (asset-only deploy passes)", r.ok);
}

// ── Guard scope: a divergent ASSET in MODS-less space never blocks a deploy ─────
{
  const r = checkOverlayConsistency({
    divergent: ["assets/pixellab/pilot/fx/nova_strip.png"],
    mods: ["render/render.js", "render/sprites.js"],
    overlay: ["render/sprites.js"], // asset intentionally not overlaid → still ok
  });
  ok("divergent non-MODS asset not required in overlay", r.ok);
}

// ── Multiple uncovered modules are ALL reported ────────────────────────────────
{
  const r = checkOverlayConsistency({
    divergent: ["render/render.js", "sim/config.js", "sim/world.js", "strings.js"],
    mods: ["render/render.js", "sim/config.js", "sim/world.js", "strings.js"],
    overlay: ["render/render.js"],
  });
  ok("all uncovered modules reported", !r.ok && eqArr(r.missing.sort(), ["sim/config.js", "sim/world.js", "strings.js"]));
}

// ── parseMods reads the REAL index.html and returns the live graph ─────────────
{
  let mods = [];
  try { mods = parseMods("index.html"); } catch (e) { console.log("  parseMods error:", e.message); }
  ok("parseMods finds sim/config.js + render/render.js in real index.html",
     mods.includes("sim/config.js") && mods.includes("render/render.js") && mods.includes("game.js") && mods.length >= 20);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
