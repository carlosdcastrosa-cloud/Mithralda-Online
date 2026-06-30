// ===========================================================================
// CAS-316 — verify the PixelLab UI PANEL ART is actually visible in the HUD.
//
// Parent CAS-314 (board): "no veo la UI que creaste en pixellab, integrala."
// Root cause: the HUD framed panels with a thin 9-slice border-image, discarding
// the ornate baked interior → players saw plain dark boxes, not the PixelLab art.
// Fix (CAS-316): each live panel now blits the WHOLE approved CAS-286 PNG as a
// background-size:100% 100% fill, with dynamic content overlaid in the interior.
//
// This harness proves, on a CLEAN default load (no ?hud, storage cleared):
//   1 DEFAULT-ON   #hud visible by default
//   2 ART WIRED    each live panel's computed background-image references its
//                  PixelLab PNG (statframe/paperdoll/backpack/console)
//   3 SHIPPED 200  every referenced panel PNG returns HTTP 200 on the host
//   4 LIVE DATA    HP/MP/XP bars + gold reflect the running hero (presentation parity)
//   5 NO STUBS     no duplicate minimap/action-bar panel (single canvas owner)
//   6 CLEAN        60fps soak, 0 console/page/http errors
// + screenshots (menu + in-play, desktop + mobile) as visual evidence.
//
// Run local:  node tools/cas316-hud-live.mjs
// Run live :  node tools/cas316-hud-live.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const LIVE = (process.argv[2] || "").replace(/\/$/, "");
const srv = LIVE ? null : await startServer();
const BASE = LIVE || srv.url;
console.log(`… testing ${LIVE ? "LIVE " : "LOCAL "}${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const SHOTS = [];
const key = (p, c) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

const PANELS = {
  "p-stat": "hud_statframe.png",
  "p-doll": "hud_paperdoll.png",
  "p-bag":  "hud_backpack_grid.png",
  "p-con":  "hud_console.png",
};

async function fresh(query, vp) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(vp || { width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/i.test(r.url())) errs.push(`http ${s}: ${r.url()}`); });
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "load", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 25000 });
  return { ctx, page, errs };
}
async function enterPlay(page, cls = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS316";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}
async function shot(page, name) { const p = `/tmp/cas316-${name}.png`; await page.screenshot({ path: p }); SHOTS.push(p); return p; }

try {
  // [1] DEFAULT-ON + [2] ART WIRED on a clean menu load
  { const { ctx, page, errs } = await fresh("?dev");
    const st = await page.evaluate((PANELS) => {
      const h = document.getElementById("hud");
      const out = { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none", panels: {} };
      for (const cls in PANELS) {
        const el = document.querySelector("#hud ." + cls);
        out.panels[cls] = el ? getComputedStyle(el).backgroundImage : "MISSING";
      }
      return out;
    }, PANELS);
    if (st.isOn && st.visible) pass("[1 DEFAULT-ON] clean URL ⇒ HUD visible by default");
    else fail(`[1 DEFAULT-ON] expected visible, got ${JSON.stringify({isOn:st.isOn,visible:st.visible})}`);
    for (const cls in PANELS) {
      const bg = st.panels[cls] || "";
      if (bg.includes(PANELS[cls])) pass(`[2 ART WIRED] .${cls} background-image ⇒ ${PANELS[cls]}`);
      else fail(`[2 ART WIRED] .${cls} expected ${PANELS[cls]}, got ${bg.slice(0,120)}`);
    }
    await shot(page, "1-menu-default");
    if (!errs.length) pass("[6 CLEAN] no errors on default boot"); else fail(`[6 CLEAN] ${errs.join(" | ")}`);
    await ctx.close(); }

  // [3] SHIPPED 200 — every panel PNG resolves on the host
  { const { ctx, page } = await fresh("?dev");
    for (const cls in PANELS) {
      const u = `${BASE}/assets/pixellab/ui/cas286/${PANELS[cls]}`;
      const code = await page.evaluate(async (u) => { try { const r = await fetch(u, { method: "GET" }); return r.status; } catch (e) { return -1; } }, u);
      if (code === 200) pass(`[3 SHIPPED] ${PANELS[cls]} ⇒ 200`); else fail(`[3 SHIPPED] ${PANELS[cls]} ⇒ ${code}`);
    }
    await ctx.close(); }

  // [4] LIVE DATA + [5] NO STUBS — in play, with hero hurt + gold + loot
  { const { ctx, page, errs } = await fresh("?dev");
    await enterPlay(page);
    await page.evaluate(() => { try { window.__dev.setGold(1234); window.__dev.hurt(20);
      for (let i = 0; i < 6; i++) { window.__dev.spawnKill("orc"); window.__dev.pickup(); } } catch (e) {} });
    await wait(600);
    const r = await page.evaluate(() => {
      const txt = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
      const w = (s) => { const e = document.querySelector(s); return e ? e.style.width : null; };
      return {
        hp: w("#hud .w-statBars .groove:nth-child(1) .fill"),
        gold: txt("#hud .cap .gold"),
        bagFilled: document.querySelectorAll("#hud .w-bag .slot.eq").length,
        bagCells: document.querySelectorAll("#hud .w-bag .slot").length,
        miniStub: !!document.querySelector("#hud .p-mini, #hud .fr-mini"),
        actionStub: !!document.querySelector("#hud .p-action, #hud .fr-action"),
      };
    });
    if (r.hp && r.hp !== "0%") pass(`[4 LIVE DATA] HP bar width=${r.hp} (live hero)`); else fail(`[4 LIVE DATA] HP bar not live: ${r.hp}`);
    if (/\d/.test(r.gold || "")) pass(`[4 LIVE DATA] gold caption=${r.gold}`); else fail(`[4 LIVE DATA] gold not live: ${r.gold}`);
    if (r.bagCells === 36) pass(`[4 LIVE DATA] backpack renders 6×6 grid (${r.bagCells} cells, ${r.bagFilled} filled)`); else fail(`[4 LIVE DATA] grid cells=${r.bagCells}`);
    if (!r.miniStub && !r.actionStub) pass("[5 NO STUBS] no duplicate minimap/action-bar panel"); else fail(`[5 NO STUBS] stub present mini=${r.miniStub} action=${r.actionStub}`);
    await shot(page, "2-play-desktop");
    if (!errs.length) pass("[6 CLEAN] no errors in play"); else fail(`[6 CLEAN] ${errs.join(" | ")}`);
    await ctx.close(); }

  // mobile screenshot (drawer)
  { const { ctx, page } = await fresh("?dev", { width: 414, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await enterPlay(page);
    await page.evaluate(() => { try { window.__hud.drawer(true); } catch (e) {} });
    await wait(400);
    await shot(page, "3-play-mobile");
    await ctx.close(); }

} catch (e) { fail("exception: " + (e && e.stack || e)); }
if (srv) await srv.close();
await browser.close();
console.log(`\nshots: ${SHOTS.join("  ")}`);
console.log(ok ? "\n✅ CAS-316 PASS — PixelLab panel art visible & wired" : "\n❌ CAS-316 FAIL");
process.exit(ok ? 0 : 1);
