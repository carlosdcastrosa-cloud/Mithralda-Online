// ---------------------------------------------------------------------------
// CAS-287 — redesigned Tibia-style HUD overlay (SCAFFOLD stage) QA harness.
//
// Boots the REAL game headless and asserts the HUD scaffold is wired + soak-safe:
//   [OFF]      #hud defaults HIDDEN on first boot (display:none, __hud.isOn()===false)
//   [REGIONS]  toggling on builds the 3 Tibia-like regions (top-left stats,
//              right stack minimap/equip/bag, bottom hotkeys+log) in the DOM
//   [DATA]     in play the snapshot carries live hero numbers and the HP/MP/XP bars
//              paint (numeric "cur / max" text appears) — the data path is live
//   [READONLY] toggling the HUD mutates NOTHING in the sim (scene + hero hp unchanged)
//   [POINTER]  the wrapper is pointer-events:none — it can never eat a tap/click
//   [A11Y]     wrapper is aria-hidden (decorative scaffold) — respects the a11y tree
//   [PERSIST]  the ON choice survives a reload (own localStorage key, not the save)
//   [ERR]      zero JS errors across the run
//
// Run: npm run cas287   (node tools/cas287-hud-scaffold.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
  await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });

  // ---- fresh storage so this is a TRUE first session ------------------------
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.evaluate(() => { try { if (window.__dev && window.__dev.noSave) window.__dev.noSave();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.removeItem("mithralda.hud.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__hud && window.__dev && window.__dev.scene", { timeout: 20000 });

  // [OFF] default hidden on first boot
  const off = await page.evaluate(() => {
    const el = document.getElementById("hud");
    return { isOn: window.__hud.isOn(), display: el ? getComputedStyle(el).display : "(absent-ok)" };
  });
  if (off.isOn === false && off.display !== "block") pass(`[OFF] HUD hidden by default (isOn=false, display=${off.display})`);
  else fail(`[OFF] HUD not hidden by default: ${JSON.stringify(off)}`);

  await enterPlay(page, "Probador");
  await wait(300);

  // [REGIONS] toggle on → 3 regions present
  const regions = await page.evaluate(() => {
    window.__hud.show();
    const el = document.getElementById("hud");
    if (!el) return { ok: false };
    const txt = el.textContent || "";
    return {
      display: getComputedStyle(el).display,
      pointer: getComputedStyle(el).pointerEvents,
      aria: el.getAttribute("aria-hidden"),
      hasMinimap: /Minimapa/.test(txt), hasEquip: /Equipo/.test(txt),
      hasBag: /Mochila/.test(txt), hasLog: /Consola/.test(txt),
      hotkeys: (el.querySelectorAll("div")).length,
    };
  });
  if (regions.display === "block" && regions.hasMinimap && regions.hasEquip && regions.hasBag && regions.hasLog)
    pass("[REGIONS] 3 regions present (stats / minimap+equip+bag / hotkeys+log)");
  else fail(`[REGIONS] missing regions: ${JSON.stringify(regions)}`);

  // [POINTER] + [A11Y]
  if (regions.pointer === "none") pass("[POINTER] wrapper pointer-events:none"); else fail(`[POINTER] expected none, got ${regions.pointer}`);
  if (regions.aria === "true") pass("[A11Y] wrapper aria-hidden=true"); else fail(`[A11Y] expected aria-hidden, got ${regions.aria}`);

  // [DATA] live hero numbers + bars paint
  await wait(350); // let one refresh tick paint
  const data = await page.evaluate(() => {
    const s = window.__hud.state();
    const el = document.getElementById("hud");
    const bars = [...el.querySelectorAll("div")].map((d) => d.textContent).filter((t) => /\d+\s*\/\s*\d+/.test(t));
    return { s, painted: bars.slice(0, 3), keys: s ? Object.keys(s) : [] };
  });
  if (data.s && data.s.maxHp > 0 && Number.isFinite(data.s.lvl) && data.painted.length >= 2)
    pass(`[DATA] live snapshot painted (lvl=${data.s.lvl}, hp=${Math.round(data.s.hp)}/${data.s.maxHp}, bars=${data.painted.length})`);
  else fail(`[DATA] snapshot/bars not live: ${JSON.stringify(data)}`);

  // [READONLY] toggling HUD changes nothing in the sim
  const before = await page.evaluate(() => ({ scene: window.__dev.scene(), hp: window.__hud.state().hp }));
  await page.evaluate(() => { window.__hud.hide(); window.__hud.show(); window.__hud.hide(); window.__hud.show(); });
  await wait(150);
  const after = await page.evaluate(() => ({ scene: window.__dev.scene(), hp: window.__hud.state().hp }));
  if (before.scene === after.scene && before.hp === after.hp) pass("[READONLY] toggling HUD mutated nothing (scene + hp unchanged)");
  else fail(`[READONLY] sim changed: ${JSON.stringify({ before, after })}`);

  // [PERSIST] ON survives reload (own key)
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__hud && window.__dev", { timeout: 15000 });
  await wait(200);
  const persisted = await page.evaluate(() => window.__hud.isOn());
  if (persisted === true) pass("[PERSIST] ON choice survived reload (mithralda.hud.v1)"); else fail("[PERSIST] HUD pref did not survive reload");

  // [ERR]
  if (errors.length === 0) pass("[ERR] zero JS errors"); else { for (const e of errors.slice(0, 8)) fail(`[ERR] ${e}`); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  if (srv && srv.close) await srv.close();
}

log(ok ? "\n✅ CAS-287 HUD scaffold: ALL CHECKS PASS" : "\n❌ CAS-287 HUD scaffold: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
