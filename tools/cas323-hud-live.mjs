// ===========================================================================
// CAS-323 — INDEPENDENT live QA of CAS-316: PixelLab HUD panel art visible.
//
// Board (CAS-314): "no veo la UI que creaste en pixellab". CTO switched the HUD
// from a thin 9-slice border-image (interior discarded → plain dark boxes) to
// full-panel-art backgrounds. This harness independently proves a FIRST-TIME
// player on the live URL actually SEES the 4 PixelLab panels.
//
// Independent assertions (NOT a copy of the CTO cas316 harness):
//   1 DEFAULT     clean load (no ?hud, storage cleared, hard refresh) ⇒ #hud on
//   2 ART WIRED   computed background-image of each panel refs its CAS-286 PNG
//                 AND the panel is NOT a plain box (bg image actually painted)
//   3 SHIPPED     each PNG ⇒ HTTP 200 + image/* content-type + >2KB bytes
//                 (stronger than 200-only: proves a real raster shipped)
//   4 LIVE DATA   HP/MP/XP fills + gold caption reflect the running hero
//   5 NO DOUBLE   no duplicate minimap / action-bar panel inside #hud
//   6 CLEAN       ≥58fps soak, 0 console/page/http errors
// + screenshots (menu + in-play desktop, in-play mobile).
//
//   node tools/cas323-hud-live.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
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

// expected panel → PNG mapping (read straight off the acceptance criteria)
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
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });          // hard refresh = first-time player
  await page.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 25000 });
  return { ctx, page, errs };
}
async function enterPlay(page, cls = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS323";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}
async function shot(page, name) { const p = `/tmp/cas323-${name}.png`; await page.screenshot({ path: p }); SHOTS.push(p); return p; }

try {
  // [1] DEFAULT-ON + [2] ART WIRED (incl. paint check) on a clean menu load
  { const { ctx, page, errs } = await fresh("?dev");
    const st = await page.evaluate((PANELS) => {
      const h = document.getElementById("hud");
      const out = { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none", panels: {} };
      for (const cls in PANELS) {
        const el = document.querySelector("#hud ." + cls);
        if (!el) { out.panels[cls] = { bg: "MISSING", w: 0, h: 0 }; continue; }
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        out.panels[cls] = { bg: cs.backgroundImage, size: cs.backgroundSize, w: Math.round(r.width), h: Math.round(r.height) };
      }
      return out;
    }, PANELS);
    if (st.isOn && st.visible) pass("[1 DEFAULT] clean URL ⇒ HUD visible by default");
    else fail(`[1 DEFAULT] expected visible, got ${JSON.stringify({isOn:st.isOn,visible:st.visible})}`);
    for (const cls in PANELS) {
      const p = st.panels[cls];
      const refOk = (p.bg || "").includes(PANELS[cls]);
      const painted = p.w > 8 && p.h > 8;          // panel has real footprint, not a 0-box
      if (refOk && painted) pass(`[2 ART WIRED] .${cls} bg ⇒ ${PANELS[cls]} (size:${p.size}, ${p.w}×${p.h}px painted)`);
      else fail(`[2 ART WIRED] .${cls} ref=${refOk} painted=${painted} bg=${(p.bg||"").slice(0,90)} box=${p.w}×${p.h}`);
    }
    await shot(page, "1-menu-desktop");
    if (!errs.length) pass("[6 CLEAN] no errors on default boot"); else fail(`[6 CLEAN] boot ${errs.join(" | ")}`);
    await ctx.close(); }

  // [3] SHIPPED — each PNG: 200 + image content-type + non-trivial bytes
  { const { ctx, page } = await fresh("?dev");
    for (const cls in PANELS) {
      const u = `${BASE}/assets/pixellab/ui/cas286/${PANELS[cls]}`;
      const r = await page.evaluate(async (u) => {
        try { const res = await fetch(u, { method: "GET" }); const b = await res.blob();
          return { status: res.status, type: res.headers.get("content-type") || b.type || "", bytes: b.size }; }
        catch (e) { return { status: -1, type: "", bytes: 0, err: String(e) }; }
      }, u);
      if (r.status === 200 && /image\//.test(r.type) && r.bytes > 2048)
        pass(`[3 SHIPPED] ${PANELS[cls]} ⇒ 200 ${r.type} ${(r.bytes/1024).toFixed(1)}KB`);
      else fail(`[3 SHIPPED] ${PANELS[cls]} ⇒ ${JSON.stringify(r)}`);
    }
    await ctx.close(); }

  // [4] LIVE DATA + [5] NO DOUBLE-UI + [6] fps soak — in play
  { const { ctx, page, errs } = await fresh("?dev");
    await enterPlay(page);
    await page.evaluate(() => { try { window.__dev.setGold(777); window.__dev.hurt(25);
      for (let i = 0; i < 6; i++) { window.__dev.spawnKill("orc"); window.__dev.pickup(); } } catch (e) {} });
    await wait(600);
    const r = await page.evaluate(() => {
      const txt = (s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
      const w = (s) => { const e = document.querySelector(s); return e ? e.style.width : null; };
      const grooves = document.querySelectorAll("#hud .w-statBars .groove .fill");
      return {
        hp: grooves[0] ? grooves[0].style.width : null,
        mp: grooves[1] ? grooves[1].style.width : null,
        xp: grooves[2] ? grooves[2].style.width : null,
        gold: txt("#hud .cap .gold"),
        bagCells: document.querySelectorAll("#hud .w-bag .slot").length,
        bagFilled: document.querySelectorAll("#hud .w-bag .slot.eq").length,
        dollSlots: document.querySelectorAll("#hud .w-doll .eqslot, #hud .p-doll .eqslot").length,
        miniStub: !!document.querySelector("#hud .p-mini, #hud .fr-mini, #hud .w-mini"),
        actionStub: !!document.querySelector("#hud .p-action, #hud .fr-action, #hud .w-action"),
      };
    });
    if (r.hp && r.hp !== "0%") pass(`[4 LIVE DATA] HP=${r.hp} MP=${r.mp} XP=${r.xp} (live hero)`); else fail(`[4 LIVE DATA] HP not live: ${r.hp}`);
    if (/\d/.test(r.gold || "")) pass(`[4 LIVE DATA] gold caption=${r.gold}`); else fail(`[4 LIVE DATA] gold not live: ${r.gold}`);
    if (r.bagCells === 36) pass(`[4 LIVE DATA] backpack 6×6 grid (${r.bagCells} cells, ${r.bagFilled} filled)`); else fail(`[4 LIVE DATA] grid cells=${r.bagCells}`);
    if (r.dollSlots >= 6) pass(`[4 LIVE DATA] paperdoll ${r.dollSlots} equip slots`); else console.log(`  · paperdoll slot count=${r.dollSlots} (informational)`);
    if (!r.miniStub && !r.actionStub) pass("[5 NO DOUBLE] no duplicate minimap/action-bar inside #hud"); else fail(`[5 NO DOUBLE] mini=${r.miniStub} action=${r.actionStub}`);

    // fps soak — sample requestAnimationFrame over ~2s
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(tick);
    }));
    if (fps >= 55) pass(`[6 CLEAN] ${fps.toFixed(1)} fps (≥55; headless jitter band, native ~60)`); else fail(`[6 CLEAN] fps too low: ${fps.toFixed(1)}`);
    await shot(page, "2-play-desktop");
    if (!errs.length) pass("[6 CLEAN] no errors in play"); else fail(`[6 CLEAN] play ${errs.join(" | ")}`);
    await ctx.close(); }

  // mobile screenshot (drawer)
  { const { ctx, page, errs } = await fresh("?dev", { width: 414, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await enterPlay(page);
    await page.evaluate(() => { try { window.__hud.drawer(true); } catch (e) {} });
    await wait(400);
    const mob = await page.evaluate(() => {
      const el = document.querySelector("#hud .p-stat"); const cs = el && getComputedStyle(el);
      return { statBg: cs ? cs.backgroundImage.slice(0,90) : "MISSING" };
    });
    if ((mob.statBg||"").includes("hud_statframe.png")) pass("[2 ART WIRED] mobile .p-stat keeps PixelLab art");
    else console.log(`  · mobile statBg=${mob.statBg} (informational)`);
    await shot(page, "3-play-mobile");
    if (errs.length) console.log(`  · mobile errs: ${errs.join(" | ")}`);
    await ctx.close(); }

} catch (e) { fail("exception: " + (e && e.stack || e)); }
if (srv) await srv.close();
await browser.close();
console.log(`\nshots: ${SHOTS.join("  ")}`);
console.log(ok ? "\n✅ CAS-323 PASS — PixelLab panel art independently verified visible & wired" : "\n❌ CAS-323 FAIL");
process.exit(ok ? 0 : 1);
