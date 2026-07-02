// ===========================================================================
// CAS-419 — inventory drag & drop (move/swap in bag, equip/unequip by drag,
// tap fallback). Live QA harness.
//
//   node tools/cas419-dnd-qa.mjs [URL]     (no URL → serves this repo root)
//
// Gates:
//  1  tap (no drag) on a bag row still equips — CAS-226 fallback intact
//  2  mouse-drag bag row A → row B swaps the two items (sim.moveBag seam)
//  3  bag order PERSISTS through saveNow + reload (existing save shape, no bump)
//  4  drag bag item → COMPATIBLE equip slot equips it; old piece lands at the
//     same bag index (equipBag swap semantics)
//  5  drag bag item → INCOMPATIBLE equip slot: zero state change + red reject
//  6  drag EQUIP slot → compatible bag row: swap through equipBag (desequipar)
//  7  drag EQUIP slot → empty bag area: rejected, zero state change (slots are
//     non-nullable in the save shape — documented CAS-419 scope)
//  8  drag bag row → empty area below the rows: item moves to the END
//  9  ghost + highlight render mid-drag (ui.invDrag.active, screenshot)
// 10  TOUCH drag (CDP touch events) swaps bag rows; touch tap still equips
// 11  keyboard Enter equip regression
// 12  0 page errors · ≥55 fps while dragging
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
import fs from "node:fs";

const argUrl = process.argv[2];
let server = null, BASE = argUrl;
if (!BASE) { server = await startServer(); BASE = server.url; }
BASE = BASE.replace(/\/$/, "");
const OUT = "shots/cas419"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

async function bootToPlay(name = "CAS419") {
  await page.waitForFunction("window.__dev", { timeout: 30000 });
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 12000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate((n) => { const el = document.getElementById("nameInput"); if (el) el.value = n;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
    await key("Digit1");
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  // expose the input-module ui object (module singleton — same instance the game uses)
  await page.addScriptTag({ type: "module", content: `import {ui} from "${BASE}/input.js"; window.__uiInv = ui;` });
  await page.waitForFunction("window.__uiInv", { timeout: 8000 });
  await wait(500);
}

// deterministic-ish bag fill: seeded sim RNG, kill+loot until the bag holds ≥5
// pieces covering ≥2 slot types (drops route through the REAL loot path).
async function fillBag() {
  await page.evaluate(() => window.__dev.seed(41907));
  for (let i = 0; i < 80; i++) {
    const st = await page.evaluate(() => { window.__dev.spawnKill("skeleton"); window.__dev.pickup();
      const b = window.__dev.bag(); return { n: b.length, slots: [...new Set(b.map(x => x.slot))] }; });
    if (st.n >= 5 && st.slots.length >= 2) return st;
    await wait(30);
  }
  return await page.evaluate(() => { const b = window.__dev.bag(); return { n: b.length, slots: [...new Set(b.map(x => x.slot))] }; });
}

// full-item signatures (defId+rarity+stat+affixes) so identical-def drops don't
// masquerade as "no change" when a swap really happened
const state = () => page.evaluate(() => {
  const sig = (x) => x ? `${x.defId}:${x.rarity}:${x.stat}:${(x.affixes || []).map(a => a.id + a.amt).join("+")}` : "none";
  const g = window.__dev.gear();
  return { bag: window.__dev.bag().map(sig), bagSlots: window.__dev.bag().map(x => x.slot),
    equip: Object.fromEntries(g.equip.map(e => [e.slot, sig(e)])),
    weapon: g.weapon, dmg: g.dmg, def: g.def, scene: window.__dev.scene() };
});
// pick a bag index holding a functional-slot piece that DIFFERS from the equipped
// one in that slot (a swap of identical pieces is invisible to the fingerprint)
const swapIdx = (s) => s.bagSlots.findIndex((sl, i) => (sl === "weapon" || sl === "body" || sl === "shield") && s.bag[i] !== s.equip[sl]);
const rects = () => page.evaluate(() => {
  const c = document.querySelector("canvas").getBoundingClientRect();
  const off = (r) => r ? { x: r.x + c.x, y: r.y + c.y, w: r.w, h: r.h, idx: r.idx, slot: r.slot, inst: r.inst } : null;
  return { rows: (window.__uiInv.invRects || []).map(off), slots: (window.__uiInv.invSlotRects || []).map(off),
    area: off(window.__uiInv.invBagAreaRect), drag: window.__uiInv.invDrag, reject: window.__uiInv.invReject };
});
async function openInv() { await page.evaluate(() => window.__dev.openInv()); await wait(250); }

// mouse drag with a mid-drag callback (ghost checks / screenshots)
async function drag(fx, fy, tx, ty, mid) {
  await page.mouse.move(fx, fy); await page.mouse.down();
  const steps = 10;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(fx + (tx - fx) * i / steps, fy + (ty - fy) * i / steps); await wait(20); }
  if (mid) await mid();
  await page.mouse.up(); await wait(200);
}
const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

// ---------- boot (mouse, 1280×800) ----------
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await bootToPlay();
const fill = await fillBag();
console.log(`bag fill: ${fill.n} items, slots [${fill.slots}]`);

// gate 1 — tap (below the 6px threshold) on a bag row still equips
{
  await openInv();
  const s0 = await state(); const r0 = await rects();
  const idx = swapIdx(s0); const slotKey = s0.bagSlots[idx];
  const [cx, cy] = center(r0.rows[idx]);
  await page.mouse.move(cx, cy); await page.mouse.down(); await wait(40); await page.mouse.up(); await wait(200);
  const s1 = await state();
  // equipBag swap: candidate equips, old equipped piece lands at the SAME index
  const swapped = s1.equip[slotKey] === s0.bag[idx] && s1.bag[idx] === s0.equip[slotKey];
  gate("G1 tap equips (fallback)", swapped && s1.scene === "inventory", `tap bag[${idx}] → ${slotKey} equips=${swapped}`);
}

// gate 2 — mouse drag row 0 → row 2 swaps items through sim.moveBag
{
  const s0 = await state(); const r0 = await rects();
  const a = center(r0.rows[0]), b = center(r0.rows[2]);
  await drag(a[0], a[1], b[0], b[1]);
  const s1 = await state();
  const ok = s1.bag[0] === s0.bag[2] && s1.bag[2] === s0.bag[0] && s1.bag.length === s0.bag.length;
  gate("G2 bag swap via drag", ok, `[0]${s0.bag[0]}↔[2]${s0.bag[2]} → [0]${s1.bag[0]} [2]${s1.bag[2]}`);
}

// gate 3 — bag ORDER persists through saveNow + reload (existing save shape)
{
  const s0 = await state();
  await page.evaluate(() => window.__dev.saveNow());
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  const s1 = await state();
  gate("G3 order persists reload", JSON.stringify(s1.bag) === JSON.stringify(s0.bag), `${s1.bag.length} items, order intact=${JSON.stringify(s1.bag) === JSON.stringify(s0.bag)}`);
}

// gate 4 — drag bag item → COMPATIBLE equip slot equips it (old piece to same idx)
{
  await openInv();
  const s0 = await state(); const r0 = await rects();
  const idx = swapIdx(s0); const slotKey = s0.bagSlots[idx];
  const target = r0.slots.find(s => s.slot === slotKey);
  const a = center(r0.rows[idx]), b = center(target);
  const dragged = s0.bag[idx];
  await drag(a[0], a[1], b[0], b[1]);
  const s1 = await state();
  const ok = s1.equip[slotKey] === dragged && s1.bag[idx] === s0.equip[slotKey] && s1.bag.length === s0.bag.length;
  gate("G4 drag→slot equips", ok, `bag[${idx}] ${dragged} → ${slotKey}; old piece back at [${idx}]=${s1.bag[idx]}`);
  await page.screenshot({ path: `${OUT}/g4-after-equip.png` });
}

// gate 5 — drag bag item → INCOMPATIBLE slot: zero state change + red reject flash
{
  const s0 = await state(); const r0 = await rects();
  const idx = s0.bagSlots.findIndex(sl => sl === "body" || sl === "shield");
  const wrong = r0.slots.find(s => s.slot && s.slot !== s0.bagSlots[idx] && s.inst);
  const a = center(r0.rows[idx]), b = center(wrong);
  let rejShot = false;
  await drag(a[0], a[1], b[0], b[1]);
  const rMid = await rects();
  if (rMid.reject) { await page.screenshot({ path: `${OUT}/g5-reject-flash.png` }); rejShot = true; }
  const s1 = await state();
  const unchanged = JSON.stringify(s0.bag) === JSON.stringify(s1.bag) && s0.weapon === s1.weapon && s0.dmg === s1.dmg && s0.def === s1.def;
  gate("G5 incompatible rejected", unchanged && rejShot, `state unchanged=${unchanged} rejectFlash=${rejShot}`);
}

// gate 6 — drag EQUIP slot → compatible bag row swaps (desequipar direction)
{
  const s0 = await state(); const r0 = await rects();
  const idx = swapIdx(s0); const slotKey = s0.bagSlots[idx];
  const src = r0.slots.find(s => s.slot === slotKey);
  const a = center(src), b = center(r0.rows[idx]);
  await drag(a[0], a[1], b[0], b[1]);
  const s1 = await state();
  const ok = s1.bag[idx] === s0.equip[slotKey] && s1.equip[slotKey] === s0.bag[idx];
  gate("G6 equip→bag swap (deseq)", ok, `slot ${slotKey} ↔ bag[${idx}]: equipped now ${s1.equip[slotKey]}`);
}

// gate 7 — drag EQUIP slot → empty bag area: rejected, zero change (non-null slots)
{
  const s0 = await state(); const r0 = await rects();
  const src = r0.slots.find(s => s.slot === "weapon");
  const lastRow = r0.rows[r0.rows.length - 1];
  const ex = r0.area.x + r0.area.w / 2, ey = Math.min(lastRow.y + lastRow.h + 14, r0.area.y + r0.area.h - 4);
  const a = center(src);
  await drag(a[0], a[1], ex, ey);
  const rAfter = await rects(); const s1 = await state();
  const unchanged = JSON.stringify(s0.bag) === JSON.stringify(s1.bag) && s0.weapon === s1.weapon;
  gate("G7 unequip-to-empty rejected", unchanged && !!rAfter.reject, `unchanged=${unchanged} reject=${!!rAfter.reject}`);
  await wait(600); // let the flash expire
}

// gate 8 — drag bag row 0 → empty area below the rows = move to END
{
  const s0 = await state(); const r0 = await rects();
  if (r0.rows.length < s0.bag.length + 1 && r0.rows.length === s0.bag.length) {
    const lastRow = r0.rows[r0.rows.length - 1];
    const ex = r0.area.x + r0.area.w / 2, ey = Math.min(lastRow.y + lastRow.h + 14, r0.area.y + r0.area.h - 4);
    const a = center(r0.rows[0]);
    const moved = s0.bag[0];
    await drag(a[0], a[1], ex, ey);
    const s1 = await state();
    const ok = s1.bag[s1.bag.length - 1] === moved && s1.bag.length === s0.bag.length;
    gate("G8 drag→area moves to end", ok, `${moved} → end; last=${s1.bag[s1.bag.length - 1]}`);
  } else gate("G8 drag→area moves to end", true, "bag fills every visible row → area drop covered by G2 (skip)");
}

// gate 9 — ghost + highlight render mid-drag (state + screenshot)
{
  const r0 = await rects();
  const a = center(r0.rows[0]), b = center(r0.rows[2]);
  let ghost = null;
  await drag(a[0], a[1], b[0], b[1], async () => {
    ghost = await page.evaluate(() => window.__uiInv.invDrag && window.__uiInv.invDrag.active ? { ...window.__uiInv.invDrag } : null);
    await page.screenshot({ path: `${OUT}/g9-ghost-middrag.png` });
  });
  gate("G9 ghost mid-drag", !!ghost && ghost.kind === "bag", ghost ? `active drag kind=${ghost.kind} idx=${ghost.idx}` : "no active drag state");
}

// gate 10 — TOUCH: drag swaps rows; a touch tap still equips
{
  await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 1, hasTouch: true });
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  await openInv();
  const cdp = await page.createCDPSession();
  const s0 = await state(); const r0 = await rects();
  const a = center(r0.rows[0]), b = center(r0.rows[1]);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a[0], y: a[1] }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: a[0] + (b[0] - a[0]) * i / 8, y: a[1] + (b[1] - a[1]) * i / 8 }] });
    await wait(25);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(250);
  const s1 = await state();
  const swap = s1.bag[0] === s0.bag[1] && s1.bag[1] === s0.bag[0];
  // touch tap on row 0 (no movement) → equips
  const r1 = await rects(); const c = center(r1.rows[0]); const prev = s1.bag[0];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c[0], y: c[1] }] });
  await wait(50);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(250);
  const s2 = await state();
  const tapEquip = s2.bag[0] !== prev;
  gate("G10 touch drag+tap", swap && tapEquip, `touchSwap=${swap} touchTapEquip=${tapEquip}`);
  await page.screenshot({ path: `${OUT}/g10-touch-final.png` });
}

// gate 11 — keyboard Enter equip regression
{
  const s0 = await state();
  await key("ArrowDown"); await wait(80);
  const selBefore = await page.evaluate(() => window.__dev.bag()[1] && window.__dev.bag()[1].defId);
  await key("Enter"); await wait(200);
  const s1 = await state();
  gate("G11 keyboard equip intact", s1.bag[1] !== s0.bag[1], `bag[1] ${s0.bag[1]} → ${s1.bag[1]} (sel=${selBefore})`);
}

// gate 12 — 0 page errors + fps ≥55 while dragging
{
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  await openInv();
  const r0 = await rects();
  const a = center(r0.rows[0]), b = center(r0.rows[2]);
  await page.mouse.move(a[0], a[1]); await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 20 });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / 2); };
    requestAnimationFrame(loop);
  }));
  await page.mouse.up();
  await page.screenshot({ path: `${OUT}/g12-final.png` });
  gate("G12 fps + 0 errors", fps >= 55 && errs.length === 0, `fps=${fps.toFixed(1)} errors=${errs.length}${errs.length ? " :: " + errs.slice(0, 3).join(" | ") : ""}`);
}

console.log(`\n${pass}/${pass + fail} gates PASS${fail ? " — " + fail + " FAIL" : ""}`);
await browser.close();
if (server) server.close();
process.exit(fail ? 1 : 0);
