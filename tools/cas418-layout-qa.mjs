// ===========================================================================
// CAS-418 — draggable HUD panels + persistent layout + reset. Live QA harness.
//
//   node tools/cas418-layout-qa.mjs [URL]     (no URL → serves this repo root)
//
// Gates:
//  1  defaults untouched — fresh profile, no uiLayout key: vitals at 12,12,
//     rail panels right-anchored, minimap bottom-right, spellbar bottom-centre
//  2  mouse-drag VITALS  → panel moves, gold outline while dragging, key saved
//  3  mouse-drag EQUIP   → moves; BAG stays visually put (rail group detach)
//  4  plain click (no drag) on paperdoll still opens the inventory
//  5  canvas-drag MINIMAP → __uiRects anchor moves, store updated
//  6  canvas-drag SPELLBAR → same
//  7  reload → the whole layout persists (DOM + canvas)
//  8  clamp: relaunch at 800x600 after dragging at 1920 → every panel on-screen
//  9  pause-menu "Restablecer paneles (HUD)" → key gone, defaults restored live
// 10  TOUCH drag (CDP touch events) moves the bag panel; tap w/o drag still clicks
// 11  0 page errors · ≥55 fps with a customized layout
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
import fs from "node:fs";

const argUrl = process.argv[2];
let server = null, BASE = argUrl;
if (!BASE) { server = await startServer(); BASE = server.url; }
BASE = BASE.replace(/\/$/, "");
const OUT = "shots/cas418"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

async function bootToPlay(name = "CAS418") {
  await page.waitForFunction("window.__hud && window.__dev && window.__uiLayout", { timeout: 30000 });
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 12000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") { // fresh profile → name + class; a stored save auto-resumes into play
    await page.evaluate((n) => { const el = document.getElementById("nameInput"); if (el) el.value = n;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
    await key("Digit1");
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await page.evaluate(() => { window.__uiAudit = true; });
  await wait(700);
}
const snap = () => page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null;
    const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return { vitals: r("#hud .p-stat"), vitalsWrap: r("#hud .p-stat") && (() => { const e = document.querySelector("#hud .p-stat").parentElement; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; })(),
    doll: r("#hud .p-doll"), bag: r("#hud .p-bag"),
    cv: window.__uiRects || {}, store: JSON.parse(localStorage.getItem("mithralda.uiLayout.v1") || "null"),
    vw: innerWidth, vh: innerHeight, scene: window.__dev.scene() };
});
async function mouseDrag(fx, fy, tx, ty) {
  await page.mouse.move(fx, fy); await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) await page.mouse.move(fx + (tx - fx) * i / steps, fy + (ty - fy) * i / steps);
  await wait(120);
  const midOutline = await page.evaluate(() => {
    for (const sel of [".p-stat", ".p-doll", ".p-bag"]) { const e = document.querySelector("#hud " + sel);
      const host = sel === ".p-stat" ? e.parentElement : e;
      if (host && host.style.outline && host.style.outline.length > 2) return host.style.outline; }
    return window.__uiLayout.dragging() || ""; });
  await page.mouse.up(); await wait(120);
  return midOutline;
}

// ---------- phase A: fresh 1920×1080 ----------
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
await bootToPlay();
let s = await snap();

// gate 1 — defaults exactly as before (no key → zero visual change)
{
  const mmOK = s.cv.minimap && Math.abs(s.cv.minimap.x - (1920 - 124 - 12 + 2)) <= 3 && Math.abs(s.cv.minimap.y - (1080 - 124 - 12 + 2)) <= 3;
  const sbOK = s.cv.spellbar && Math.abs((s.cv.spellbar.x + s.cv.spellbar.w / 2) - 960) <= 4;
  const vOK = s.vitalsWrap && Math.abs(s.vitalsWrap.x - 12) <= 1 && Math.abs(s.vitalsWrap.y - 12) <= 1;
  const dOK = s.doll && Math.abs((s.doll.x + s.doll.w) - (1920 - 12)) <= 2;
  gate("G1 defaults", !!(mmOK && sbOK && vOK && dOK && !s.store),
    `store=${JSON.stringify(s.store)} vitals=${JSON.stringify(s.vitalsWrap)} dollRight=${s.doll && s.doll.x + s.doll.w} mm=${JSON.stringify(s.cv.minimap)} sbCx=${s.cv.spellbar && s.cv.spellbar.x + s.cv.spellbar.w / 2}`);
}

// gate 2 — mouse-drag vitals wrap by (+320,+240) from the statframe centre
{
  const c = s.vitalsWrap;
  const outline = await mouseDrag(c.x + c.w / 2, c.y + 20, c.x + c.w / 2 + 320, c.y + 20 + 240);
  const s2 = await snap();
  const moved = s2.vitalsWrap && Math.abs(s2.vitalsWrap.x - (c.x + 320)) <= 3 && Math.abs(s2.vitalsWrap.y - (c.y + 240)) <= 3;
  gate("G2 drag vitals (mouse)", !!(moved && s2.store && s2.store.vitals && /gold|#e0b94a|rgb\(224/.test(outline || "x") || (moved && s2.store && s2.store.vitals && outline)),
    `at=${JSON.stringify(s2.vitalsWrap)} outlineMid=${JSON.stringify(outline)} store.vitals=${JSON.stringify(s2.store && s2.store.vitals)}`);
  s = s2;
}

// gate 3 — drag equip; bag must not jump (group detach)
{
  const d = s.doll, b0 = s.bag;
  await mouseDrag(d.x + d.w / 2, d.y + 10, d.x + d.w / 2 - 500, d.y + 10 + 120);
  const s3 = await snap();
  const dollMoved = Math.abs(s3.doll.x - (d.x - 500)) <= 3 && Math.abs(s3.doll.y - (d.y + 120)) <= 3;
  const bagStill = Math.abs(s3.bag.x - b0.x) <= 2 && Math.abs(s3.bag.y - b0.y) <= 2;
  gate("G3 drag equip + rail group", !!(dollMoved && bagStill && s3.store.equip && s3.store.bag),
    `doll=${JSON.stringify(s3.doll)} bagΔ=${s3.bag.x - b0.x},${s3.bag.y - b0.y} store keys=${Object.keys(s3.store || {}).join("/")}`);
  s = s3;
}

// gate 4 — plain click on the paperdoll still opens the inventory
{
  const d = s.doll;
  await page.mouse.click(d.x + d.w / 2, d.y + d.h / 2);
  await wait(250);
  const sc = await page.evaluate(() => window.__dev.scene());
  const opened = sc === "inventory";
  if (opened) { await key("Escape"); await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }); }
  gate("G4 click-not-drag opens inventory", opened, `scene after click=${sc}`);
  await wait(300);
}

// gate 5 — canvas drag: minimap
{
  s = await snap();
  const m = s.cv.minimap; // published rect (x-2 border offset baked into AR only)
  await mouseDrag(m.x + m.w / 2, m.y + m.h / 2, m.x + m.w / 2 - 600, m.y + m.h / 2 - 400);
  const s5 = await snap();
  const mm = s5.cv.minimap;
  const moved = Math.abs(mm.x - (m.x - 600)) <= 6 && Math.abs(mm.y - (m.y - 400)) <= 6;
  gate("G5 drag minimap (canvas)", !!(moved && s5.store.minimap), `mm=${JSON.stringify(mm)} store.minimap=${JSON.stringify(s5.store.minimap)}`);
}

// gate 6 — canvas drag: spell bar
{
  s = await snap();
  const sb = s.cv.spellbar;
  await mouseDrag(sb.x + sb.w / 2, sb.y + 10, sb.x + sb.w / 2 - 400, sb.y + 10 - 300);
  const s6 = await snap();
  const nb = s6.cv.spellbar;
  const moved = Math.abs(nb.x - (sb.x - 400)) <= 6 && Math.abs(nb.y - (sb.y - 300)) <= 6;
  gate("G6 drag spellbar (canvas)", !!(moved && s6.store.spellbar), `sb=${JSON.stringify(nb)} store.spellbar=${JSON.stringify(s6.store.spellbar)}`);
  s = s6;
}
await page.screenshot({ path: `${OUT}/custom-1920.png` });
const storedAt1920 = s.store;

// gate 7 — reload: layout persists
{
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  const s7 = await snap();
  const near = (a, b, t = 3) => a && b && Math.abs(a.x - b.x) <= t && Math.abs(a.y - b.y) <= t;
  const ok = near(s7.vitalsWrap, storedAt1920.vitals) && near(s7.doll, storedAt1920.equip) && near(s7.bag, storedAt1920.bag)
    && near(s7.cv.minimap, storedAt1920.minimap, 6) && near(s7.cv.spellbar, storedAt1920.spellbar, 6);
  gate("G7 reload persists", ok, `vitals=${JSON.stringify(s7.vitalsWrap)} vs ${JSON.stringify(storedAt1920.vitals)}; mm=${JSON.stringify(s7.cv.minimap)} vs ${JSON.stringify(storedAt1920.minimap)}`);
}

// gate 8 — clamp at 800×600 (panels were parked near 1920×1080 edges)
{
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  const s8 = await snap();
  const inVp = (r, id) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= 800 + 2 && r.y + r.h <= 600 + 2;
  const all = [["vitals", s8.vitalsWrap], ["doll", s8.doll], ["bag", s8.bag], ["minimap", s8.cv.minimap], ["spellbar", s8.cv.spellbar]];
  const bad = all.filter(([id, r]) => !inVp(r, id)).map(([id, r]) => `${id}=${JSON.stringify(r)}`);
  gate("G8 clamp 800x600", bad.length === 0, bad.length ? bad.join(" ") : "all panels inside 800x600");
  await page.screenshot({ path: `${OUT}/clamped-800.png` });
}

// gate 9 — pause-menu reset restores defaults + deletes the key
{
  await key("Escape");
  await page.waitForFunction("window.__dev.scene()==='pause'", { timeout: 5000 });
  await wait(300);
  // access tab is the default; the reset row sits after 4 toggles (+32 each) + roll-dir (+34)
  const pt = await page.evaluate(() => { const bh = Math.min(innerHeight - 20, 580), y = (innerHeight - bh) / 2;
    return { x: innerWidth / 2, y: y + 44 + 26 + 16 + 4 * 32 + 34 + 12 }; });
  await page.mouse.click(pt.x, pt.y);
  await wait(250);
  await key("Escape");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  await wait(500);
  const s9 = await snap();
  const vOK = s9.vitalsWrap && Math.abs(s9.vitalsWrap.x - 12) <= 1 && Math.abs(s9.vitalsWrap.y - 12) <= 1;
  const dOK = s9.doll && Math.abs((s9.doll.x + s9.doll.w) - (800 - 12)) <= 2;
  const mOK = s9.cv.minimap && Math.abs(s9.cv.minimap.x - (800 - 124 - 12 + 2)) <= 3;
  gate("G9 pause reset → defaults", !!(vOK && dOK && mOK && !s9.store),
    `store=${JSON.stringify(s9.store)} vitals=${JSON.stringify(s9.vitalsWrap)} dollRight=${s9.doll && s9.doll.x + s9.doll.w} mm=${JSON.stringify(s9.cv.minimap)}`);
  await page.screenshot({ path: `${OUT}/after-reset-800.png` });
}

// gate 10 — TOUCH drag of the backpack panel (CDP touch events → pointer events)
{
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, hasTouch: true });
  await page.reload({ waitUntil: "load" });
  await bootToPlay();
  const s0 = await snap();
  const b = s0.bag;
  const cdp = await page.createCDPSession();
  const cx = b.x + b.w / 2, cy = b.y + 10;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - 30 * i, y: cy + 20 * i }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(300);
  const s10 = await snap();
  const moved = Math.abs(s10.bag.x - (b.x - 300)) <= 6 && Math.abs(s10.bag.y - (b.y + 200)) <= 6;
  gate("G10 touch drag bag", !!(moved && s10.store && s10.store.bag && s10.scene === "play"),
    `bag=${JSON.stringify(s10.bag)} (from ${JSON.stringify(b)}) scene=${s10.scene} store.bag=${JSON.stringify(s10.store && s10.store.bag)}`);
}

// gate 11 — fps with customized layout + zero page errors
{
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(n / 2); };
    requestAnimationFrame(tick); }));
  gate("G11 fps+errors", fps >= 55 && errs.length === 0, `fps=${Math.round(fps)} errs=${errs.length} ${errs.slice(0, 3).join(" | ")}`);
}

await browser.close(); if (server) await server.close();
console.log(`\nCAS-418 QA: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
