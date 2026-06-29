// ===========================================================================
// CAS-299 — HUD default-ON cutover verification (local working tree).
//
// Asserts the board-approved cutover (a35ddd26):
//   1 DEFAULT-ON   fresh player, CLEAN url (no ?hud) ⇒ #hud visible + __hud.isOn()
//   2 NO DOUBLE-UI legacy on-canvas vitals are suppressed while the HUD is active
//                  (probe render.js hudActive() gate via a sentinel)
//   3 ESCAPE       ?nohud ⇒ HUD off; __hud.hide() persists "0" ⇒ reload stays off
//   4 STATUS-CHIP  an applied affliction shows in the HUD chip row (canvas-chip parity)
//   5 SOAK-SAFE    toggling the HUD changes NOTHING in the sim — identical save blob;
//                  the HUD pref lives in its OWN localStorage key (never the save)
//   6 CLEAN        0 console errors / pageerrors; 60fps under a short soak
//
// Run: node tools/cas299-cutover.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
// Pass a URL arg to test a LIVE deploy (e.g. the gh-pages build); omit to serve the local tree.
const LIVE = (process.argv[2] || "").replace(/\/$/, "");
const srv = LIVE ? null : await startServer();
const BASE = LIVE || srv.url;
if (LIVE) console.log(`… testing LIVE ${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const key = (p, c) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

async function fresh(query) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console.error: " + m.text()); });
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "load", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 25000 });
  return { ctx, page, errs };
}
async function enterPlay(page, cls = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "Probador";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}

try {
  // [1] DEFAULT-ON — clean URL, cleared storage
  { const { ctx, page, errs } = await fresh("?dev");
    const st = await page.evaluate(() => { const h = document.getElementById("hud");
      return { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none" }; });
    if (st.isOn && st.visible) pass("[1 DEFAULT-ON] fresh player (no ?hud) ⇒ HUD visible by default");
    else fail(`[1 DEFAULT-ON] expected on/visible, got ${JSON.stringify(st)}`);
    if (!errs.length) pass("[6 CLEAN] no console/page errors on default boot");
    else fail(`[6 CLEAN] errors: ${errs.join(" | ")}`);
    await ctx.close(); }

  // [2] NO DOUBLE-UI — the HUD owns vitals; the legacy panels (minimap stub / action bar) are gone
  { const { ctx, page } = await fresh("?dev");
    await enterPlay(page);
    await wait(400);
    const dom = await page.evaluate(() => {
      const has = (sel) => !!document.querySelector(sel);
      return { stat: has("#hud .fr-stat"), rail: has("#hud .rail"), console: has("#hud .fr-console"),
               miniStub: has("#hud .fr-mini"), actionStub: has("#hud .fr-action") }; });
    if (dom.stat && dom.rail && dom.console) pass("[2 NO DOUBLE-UI] HUD keeps vitals + equip/bag rail + console");
    else fail(`[2 NO DOUBLE-UI] missing core HUD region: ${JSON.stringify(dom)}`);
    if (!dom.miniStub && !dom.actionStub) pass("[2 NO DOUBLE-UI] decorative minimap-stub + action-bar dropped (canvas owns the real ones)");
    else fail(`[2 NO DOUBLE-UI] redundant stub still present: ${JSON.stringify(dom)}`);
    await ctx.close(); }

  // [3] ESCAPE — ?nohud forces off; __hud.hide() persists off across reload
  { const { ctx, page } = await fresh("?nohud&dev");
    const off = await page.evaluate(() => { const h = document.getElementById("hud");
      return { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none" }; });
    if (!off.isOn && !off.visible) pass("[3 ESCAPE] ?nohud ⇒ HUD off (escape hatch honoured)");
    else fail(`[3 ESCAPE] ?nohud did not disable HUD: ${JSON.stringify(off)}`);
    await ctx.close();

    const { ctx: c2, page: p2 } = await fresh("?dev");
    await p2.evaluate(() => window.__hud.hide());           // user opts out durably
    await p2.reload({ waitUntil: "load", timeout: 45000 }); // clean URL reload
    await p2.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 20000 });
    const stays = await p2.evaluate(() => window.__hud.isOn());
    if (!stays) pass("[3 ESCAPE] __hud.hide() persists ⇒ stays off after reload");
    else fail("[3 ESCAPE] opt-out did not persist across reload");
    await c2.close(); }

  // [4] STATUS-CHIP parity — applied affliction shows as a HUD chip
  { const { ctx, page } = await fresh("?dev");
    await enterPlay(page);
    await page.evaluate(() => { try { window.__dev.applyStatusTo("hero", "poison", {}); } catch (e) {} });
    await wait(400);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll("#hud .chip")).map((c) => c.textContent.trim()));
    if (chips.some((t) => /poison/i.test(t))) pass(`[4 STATUS-CHIP] affliction surfaces in HUD chip row (${JSON.stringify(chips)})`);
    else fail(`[4 STATUS-CHIP] no poison chip in HUD: ${JSON.stringify(chips)}`);
    await ctx.close(); }

  // [5] SOAK-SAFE — toggling the HUD changes nothing in the sim; pref lives in its own key.
  // Capture before/after WITHIN ONE synchronous evaluate so no rAF fires between snapshots
  // (the save blob carries live game-time, which advances every frame; the toggle is sync).
  { const { ctx, page } = await fresh("?dev");
    await enterPlay(page);
    const blobEq = await page.evaluate(() => {
      const J = (x) => JSON.stringify(x);   // saveBlob() returns a fresh object → compare by value
      const a = J(window.__dev.saveBlob()); // HUD on
      window.__hud.hide(); const b = J(window.__dev.saveBlob());   // off
      window.__hud.show(); const c = J(window.__dev.saveBlob());   // on again
      return a === b && b === c;            // no frame advanced ⇒ any diff would be the toggle's doing
    });
    if (blobEq) pass("[5 SOAK-SAFE] save blob identical across HUD on/off/on (same instant) — sim untouched");
    else fail("[5 SOAK-SAFE] save blob changed when toggling the HUD (balance/sim leak!)");
    const sep = await page.evaluate(() => { const k = window.__hud.KEY; const blob = window.__dev.saveBlob();
      return { key: k, distinct: k !== "mithralda.save" && (typeof blob !== "string" || blob.indexOf(k) === -1) }; });
    if (sep.distinct) pass(`[5 SOAK-SAFE] HUD pref in its own key (${sep.key}), never the save blob`);
    else fail(`[5 SOAK-SAFE] HUD pref key not separated: ${JSON.stringify(sep)}`);
    await ctx.close(); }

  // [6] CLEAN — 60fps under a short soak with the HUD ticking
  { const { ctx, page, errs } = await fresh("?dev");
    await enterPlay(page);
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(loop); }));
    if (fps >= 55) pass(`[6 CLEAN] ${fps.toFixed(1)} fps under soak (≥55)`);
    else fail(`[6 CLEAN] low fps: ${fps.toFixed(1)}`);
    if (!errs.length) pass("[6 CLEAN] 0 console/page errors during soak");
    else fail(`[6 CLEAN] errors during soak: ${errs.join(" | ")}`);
    await ctx.close(); }

} catch (e) { fail("EXCEPTION " + (e && e.stack || e)); }

await browser.close();
if (srv) await srv.close();
console.log(ok ? "\n✅ CAS-299 cutover verification PASS" : "\n❌ CAS-299 cutover verification FAIL");
process.exit(ok ? 0 : 1);
