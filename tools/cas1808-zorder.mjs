// tools/cas1808-zorder.mjs — CAS-1808/CAS-1809 BUILD verification (DOM-free, headless).
//
// Proves the z-order fix in render/render.js: a sliced tileset CELL (custom stamp
// carrying d.sw, CAS-1729) is drawn INLINE in the ground pass (before renderEntities),
// so hero/mobs y-sort ABOVE it; a full-sheet custom stamp (no d.sw, CAS-1716) still
// flows into `order` and y-sorts as before (byte-identical occluder behaviour).
//
// Faithful without a browser: instead of copying the loop, we EXTRACT the real deco
// for-loop verbatim from render/render.js source and execute it with fake ctx/customImg
// bindings, capturing the exact emission order the shipped code produces. If the source
// seam regresses, this test re-extracts and fails. Plus a mapdoc data-flow regression
// (AC3: model intact ⇒ export byte-id) reusing the CAS-1729 sub-rect invariant.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildWorldFromMapDoc } from "../sim/mapdoc.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "..", "render", "render.js"), "utf8");

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);

// ---- extract the REAL deco loop source (start anchor → chests loop) --------
const START = "for(const d of world.deco){ if(d.x<vL";
const END = "\n    for(const c of world.chests)";
const s0 = SRC.indexOf(START), s1 = SRC.indexOf(END, s0);
if (s0 < 0 || s1 < 0) { console.error("FATAL: could not locate deco loop in render.js"); process.exit(2); }
const LOOP_SRC = SRC.slice(s0, s1);
A(/d\.kind==="custom" && d\.sw/.test(LOOP_SRC), "seam present: inline branch guards on d.kind===custom && d.sw");
A(LOOP_SRC.includes("continue;"), "seam present: sliced cell short-circuits with continue (not pushed to order)");
A(!/Math\.random|createRNG|rrng/.test(LOOP_SRC), "AC3: 0-RNG — deco loop touches no random stream");

// Run the extracted loop with controlled bindings. Only the symbols the loop body
// itself (outside the deferred draw closures) touches must exist: world, order,
// customImg, ctx, cull bounds, Math (global). Unused branch symbols (TDECO/IMG/SP…)
// are never evaluated for our custom-kind test decos.
const runLoopRaw = new Function(
  "world", "order", "customImg", "ctx", "vL", "vR", "vT", "vB",
  `${LOOP_SRC}\nreturn order;`
);
// deco array → {deco} world wrapper (the extracted loop iterates world.deco).
const runLoop = (deco, order, customImg, ctx, ...b) => runLoopRaw({ deco }, order, customImg, ctx, ...b);

function fakeCtx() {
  const calls = [];
  return { calls, drawImage: (...args) => calls.push(args) };
}
const FAKE_IMG = { complete: true, naturalWidth: 64, naturalHeight: 64 };
const customImg = () => FAKE_IMG;
const BOUNDS = [-1e6, 1e6, -1e6, 1e6]; // wide-open cull for on-screen cases

const HERO_Y = 500;
const cell = (extra) => ({ x: 400, y: HERO_Y + 100, kind: "custom", asset: "t", ...extra });
const SLICED = { sx: 0, sy: 0, sw: 32, sh: 32, w: 32, h: 32 };   // tileset cell
const SHEET = { w: 48, h: 64 };                                   // full-sheet stamp

// ---- AC1: a sliced tileset cell BELOW the hero draws INLINE, never y-sorted ----
{
  const ctx = fakeCtx(), order = [];
  runLoop([cell(SLICED)], order, customImg, ctx, ...BOUNDS);
  A(ctx.calls.length === 1, "AC1: sliced cell blitted INLINE during ground pass (1 drawImage)");
  A(order.length === 0, "AC1: sliced cell NOT pushed to order ⇒ never y-sorts with hero");
  A(ctx.calls[0] && ctx.calls[0].length === 9, "AC1: inline blit is the 9-arg sub-rect form (sx,sy,sw,sh,…)");
  // Emission order vs hero: the cell already drew in the ground pass; the hero draws
  // later in renderEntities ⇒ hero is ABOVE the cell (bug fixed).
  A(ctx.calls[0][1] === 0 && ctx.calls[0][3] === 32, "AC1: inline blit copies the authored sub-rect {sx:0,sw:32}");
}

// ---- AC2: a full-sheet stamp (no d.sw) still flows to order and y-sorts -------
{
  const ctx = fakeCtx(), order = [];
  runLoop([cell(SHEET)], order, customImg, ctx, ...BOUNDS);
  A(ctx.calls.length === 0, "AC2: full-sheet stamp NOT drawn inline (deferred to entity pass)");
  A(order.length === 1, "AC2: full-sheet stamp pushed to order (still y-sorted)");
  A(order[0].y === HERO_Y + 100, "AC2: full-sheet stamp anchored at its authored y (unchanged)");
  // Simulate the renderEntities merge+sort: a stamp with y>hero.y sorts AFTER the hero
  // ⇒ intentional occluder still overlaps the hero by depth (byte-identical to HEAD).
  const list = [order[0], { y: HERO_Y, tag: "hero" }].sort((a, b) => a.y - b.y);
  A(list[0].tag === "hero" && list[1] === order[0], "AC2: y-sort keeps full-sheet stamp ABOVE hero when placed below (occluder preserved)");
  // And its deferred draw is the whole-sheet 5-arg blit (no sub-rect) — byte-identical path.
  order[0].draw();
  A(ctx.calls.length === 1 && ctx.calls[0].length === 5, "AC2: full-sheet closure uses the 5-arg whole-sheet blit (no sub-rect)");
}

// ---- AC1/AC2 mixed pass: floor cells + one occluder in one deco list ----------
{
  const ctx = fakeCtx(), order = [];
  runLoop([cell(SLICED), cell({ ...SLICED, x: 432 }), cell(SHEET), cell({ ...SLICED, x: 464 })], order, customImg, ctx, ...BOUNDS);
  A(ctx.calls.length === 3, "MIX: all 3 sliced cells blitted inline as floor (3 drawImage)");
  A(order.length === 1, "MIX: only the full-sheet stamp deferred to order");
}

// ---- cull: an off-screen sliced cell draws nothing and pushes nothing ---------
{
  const ctx = fakeCtx(), order = [];
  runLoop([{ x: -9999, y: -9999, kind: "custom", asset: "t", ...SLICED }], order, customImg, ctx, -100, 100, -100, 100);
  A(ctx.calls.length === 0 && order.length === 0, "CULL: off-screen sliced cell skipped (no inline draw, no order push)");
}

// ---- missing/undecoded image: guard skips silently, still not y-sorted --------
{
  const ctx = fakeCtx(), order = [];
  runLoop([cell(SLICED)], order, () => null, ctx, ...BOUNDS);
  A(ctx.calls.length === 0 && order.length === 0, "GUARD: undecoded sliced cell ⇒ no crash, no draw, no order push");
}

// ---- AC3: mapdoc data model INTACT ⇒ export/save byte-id (CAS-1729 invariant) --
{
  const mk = (props) => ({ v: 1, name: "t", w: 32, h: 32, terrain: { rle: [0, 32 * 32] }, zones: [],
    entities: { npcs: [], chests: [], fragments: [], portals: [], props } });
  const wS = buildWorldFromMapDoc(mk([{ x: 100, y: 100, kind: "custom", asset: "a.png", sx: 32, sy: 0, sw: 32, sh: 32, w: 32, h: 32 }]));
  const dS = wS.deco.find(d => d.kind === "custom");
  A(dS && dS.sw === 32 && dS.sx === 32, "AC3: sliced prop still carries sub-rect (mapdoc unchanged)");
  const wP = buildWorldFromMapDoc(mk([{ x: 100, y: 100, kind: "custom", asset: "a.png", w: 48, h: 64 }]));
  const dP = wP.deco.find(d => d.kind === "custom");
  A(dP && dP.sw === undefined, "AC3: plain custom prop still has NO sub-rect (whole-sheet, byte-safe)");
}

// ---- report --------------------------------------------------------------------
console.log(`\nCAS-1808 z-order build check: ${ok.length} PASS / ${bad.length} FAIL`);
for (const m of ok) console.log("  ✓ " + m);
if (bad.length) { console.log("\nFAILURES:"); for (const m of bad) console.log("  ✗ " + m); process.exit(1); }
console.log("ALL GREEN");
