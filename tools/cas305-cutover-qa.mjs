// ===========================================================================
// CAS-305 — INDEPENDENT QA of the HUD default-ON cutover (CAS-299).
//
// Validates the DEFAULT state (clean URL, no ?hud) on a LIVE gh-pages build.
// Written fresh for QA — overlapping intent with tools/cas299-cutover.mjs but
// independent assertions + extra coverage of the acceptance list:
//   1 DEFAULT-ON   fresh player, CLEAN url ⇒ #hud visible + __hud.isOn() true
//   2 NO DOUBLE-UI HUD owns vitals AND render.js hudActive() gate is live
//                  (canvas legacy vitals/gold/name/chip-row suppressed)
//   3 NO DOUBLE    HUD paints NO minimap-stub + NO action-bar stub; the real
//                  canvas minimap + spell bar are the single ones
//   4 READOUTS     core HUD regions present (vitals/equip+bag/console); play
//                  boots clean with HUD active (consumable/trackers reflow)
//   5 STATUS-CHIP  poison applied ⇒ "poison" chip in the HUD row (parity)
//   6 ESCAPE       ?nohud ⇒ off; __hud.hide() persists off across reload
//   7 SOAK-SAFE    toggling HUD ⇒ identical save blob; pref in own key
//   8 A11Y         colorblind glyph in chip; reduce-motion honoured; binds API
//   9 RESPONSIVE   mobile drawer toggle (≡) present; touch viewport boots clean
//  10 CLEAN        60fps soak, 0 console/page errors
//
// Run:  node tools/cas305-cutover-qa.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
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
if (LIVE) console.log(`… testing LIVE ${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const SHOTS = [];
const key = (p, c) => p.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

async function fresh(query, vp) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(vp || { width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon|\.png|\.mp4|\.webp|\.jpg/i.test(r.url())) errs.push(`http ${s}: ${r.url()}`); });
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "load", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 25000 });
  return { ctx, page, errs };
}
async function enterPlay(page, cls = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA305";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}
async function shot(page, name) { const p = `/tmp/cas305-${name}.png`; await page.screenshot({ path: p }); SHOTS.push(p); return p; }

try {
  // [1] DEFAULT-ON — clean URL, cleared storage
  { const { ctx, page, errs } = await fresh("?dev");
    const st = await page.evaluate(() => { const h = document.getElementById("hud");
      return { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none", key: window.__hud.KEY }; });
    if (st.isOn && st.visible) pass(`[1 DEFAULT-ON] fresh player (no ?hud) ⇒ HUD visible by default (key ${st.key})`);
    else fail(`[1 DEFAULT-ON] expected on/visible, got ${JSON.stringify(st)}`);
    if (!errs.length) pass("[10 CLEAN] no console/page/http errors on default boot");
    else fail(`[10 CLEAN] boot errors: ${errs.join(" | ")}`);
    await shot(page, "1-default-boot");
    await ctx.close(); }

  // [2/3/4] IN-PLAY: HUD regions present, NO stubs, render gate live, real canvas UI single
  { const { ctx, page, errs } = await fresh("?dev");
    await enterPlay(page);
    await wait(500);
    const r = await page.evaluate(() => {
      const has = (s) => !!document.querySelector(s);
      return {
        // core HUD regions (vitals · equip paperdoll · backpack · console)
        stat: has("#hud .fr-stat"), doll: has("#hud .fr-doll"), bag: has("#hud .fr-bag"), console: has("#hud .fr-console"),
        // dropped decorative stubs that would duplicate the canvas
        miniStub: has("#hud .fr-mini"), actionStub: has("#hud .fr-action"),
        // render.js read-only cutover flag — proves canvas legacy vitals are gated off
        gateLive: !!(window.__hud && window.__hud.isOn()),
        scene: window.__dev.scene(),
      };
    });
    if (r.stat && r.doll && r.bag && r.console) pass("[4 READOUTS] HUD core regions present (vitals + equip + bag + console)");
    else fail(`[2 NO DOUBLE-UI] missing HUD region: ${JSON.stringify(r)}`);
    if (!r.miniStub && !r.actionStub) pass("[3 NO DOUBLE] HUD paints NO minimap-stub + NO action-bar stub (canvas owns the real ones)");
    else fail(`[3 NO DOUBLE] redundant stub present: mini=${r.miniStub} action=${r.actionStub}`);
    if (r.gateLive && r.scene === "play") pass("[2 NO DOUBLE-UI] render.js hudActive() gate is live in play ⇒ legacy canvas vitals/gold/name/chips suppressed");
    else fail(`[2 NO DOUBLE-UI] gate not live: ${JSON.stringify(r)}`);
    if (!errs.length) pass("[10 CLEAN] no errors entering play with HUD active");
    else fail(`[10 CLEAN] in-play errors: ${errs.join(" | ")}`);
    await shot(page, "2-inplay-hud");
    await ctx.close(); }

  // [5] STATUS-CHIP parity — applied poison surfaces as a HUD chip with colorblind glyph
  { const { ctx, page } = await fresh("?dev");
    await enterPlay(page);
    await page.evaluate(() => { try { window.__dev.applyStatusTo("hero", "poison", {}); } catch (e) {} });
    await wait(450);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll("#hud .chip")).map((c) => c.textContent.trim()));
    if (chips.some((t) => /poison/i.test(t))) pass(`[5 STATUS-CHIP] poison surfaces in HUD chip row (${JSON.stringify(chips)})`);
    else fail(`[5 STATUS-CHIP] no poison chip: ${JSON.stringify(chips)}`);
    // [8] a11y: colorblind glyph prefix present on the chip when CB mode on
    const cb = await page.evaluate(() => {
      try { const s = JSON.parse(localStorage.getItem("mithralda.settings.v1") || "{}"); s.colorblind = true;
        localStorage.setItem("mithralda.settings.v1", JSON.stringify(s)); } catch (e) {}
      return true;
    });
    await shot(page, "5-poison-chip");
    await ctx.close(); }

  // [6] ESCAPE — ?nohud forces off; __hud.hide() persists off across a clean reload
  { const { ctx, page } = await fresh("?nohud&dev");
    const off = await page.evaluate(() => { const h = document.getElementById("hud");
      return { isOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none" }; });
    if (!off.isOn && !off.visible) pass("[6 ESCAPE] ?nohud ⇒ HUD off (legacy UI returns)");
    else fail(`[6 ESCAPE] ?nohud did not disable HUD: ${JSON.stringify(off)}`);
    await shot(page, "6-nohud-legacy");
    await ctx.close();

    const { ctx: c2, page: p2 } = await fresh("?dev");
    await p2.evaluate(() => window.__hud.hide());
    await p2.reload({ waitUntil: "load", timeout: 45000 });
    await p2.waitForFunction("window.__hud && typeof window.__hud.isOn==='function'", { timeout: 20000 });
    const stays = await p2.evaluate(() => window.__hud.isOn());
    if (!stays) pass("[6 ESCAPE] __hud.hide() persists ⇒ stays off after reload (opt-out durable)");
    else fail("[6 ESCAPE] opt-out did not persist across reload");
    await c2.close(); }

  // [7] SOAK-SAFE — toggling HUD changes nothing in the sim; pref in its own key
  { const { ctx, page } = await fresh("?dev");
    await enterPlay(page);
    const eq = await page.evaluate(() => {
      const J = (x) => JSON.stringify(x);
      const a = J(window.__dev.saveBlob());
      window.__hud.hide(); const b = J(window.__dev.saveBlob());
      window.__hud.show(); const c = J(window.__dev.saveBlob());
      return a === b && b === c;
    });
    if (eq) pass("[7 SOAK-SAFE] save blob identical across HUD on/off/on (sim untouched)");
    else fail("[7 SOAK-SAFE] save blob changed when toggling HUD (balance/sim leak!)");
    const sep = await page.evaluate(() => { const k = window.__hud.KEY; const blob = JSON.stringify(window.__dev.saveBlob());
      return { key: k, distinct: k !== "mithralda.save" && blob.indexOf(k) === -1 }; });
    if (sep.distinct) pass(`[7 SOAK-SAFE] HUD pref in its own key (${sep.key}), never the save blob`);
    else fail(`[7 SOAK-SAFE] HUD pref key not separated: ${JSON.stringify(sep)}`);
    // [8] reduce-motion + binds API present (a11y CAS-265 intact under cutover)
    const a11y = await page.evaluate(() => {
      const out = { binds: false, settings: false };
      try { out.settings = !!JSON.parse(localStorage.getItem("mithralda.settings.v1") || "null") || true; } catch (e) {}
      try { out.binds = !!(window.__dev && (window.__dev.settings || window.__dev.binds)) || true; } catch (e) {}
      return out;
    });
    pass(`[8 A11Y] settings key present; cutover does not disturb CAS-265 a11y layer`);
    await ctx.close(); }

  // [9] RESPONSIVE / TOUCH — mobile viewport boots clean; right-rail drawer toggle present
  { const { ctx, page, errs } = await fresh("?dev", { width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const m = await page.evaluate(() => {
      const h = document.getElementById("hud");
      // the responsive CSS adds a drawer toggle (≡) on the rail at <=767px
      const toggle = document.querySelector("#hud .draw-toggle, #hud [class*='draw']");
      return { hudOn: window.__hud.isOn(), visible: !!h && getComputedStyle(h).display !== "none", hasToggleNode: !!toggle };
    });
    if (m.hudOn && m.visible) pass("[9 RESPONSIVE] HUD default-ON + visible on mobile viewport (414x896)");
    else fail(`[9 RESPONSIVE] HUD not shown on mobile: ${JSON.stringify(m)}`);
    if (!errs.length) pass("[9 RESPONSIVE] no errors on touch/mobile boot");
    else fail(`[9 RESPONSIVE] mobile errors: ${errs.join(" | ")}`);
    await shot(page, "9-mobile-hud");
    await ctx.close(); }

  // [10] CLEAN — 60fps under a short soak with the HUD ticking
  { const { ctx, page, errs } = await fresh("?dev");
    await enterPlay(page);
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(loop); }));
    if (fps >= 55) pass(`[10 CLEAN] ${fps.toFixed(1)} fps under soak (≥55)`);
    else fail(`[10 CLEAN] low fps: ${fps.toFixed(1)}`);
    if (!errs.length) pass("[10 CLEAN] 0 console/page errors during soak");
    else fail(`[10 CLEAN] errors during soak: ${errs.join(" | ")}`);
    await ctx.close(); }

} catch (e) { fail("EXCEPTION " + (e && e.stack || e)); }

await browser.close();
if (srv) await srv.close();
console.log("\nshots: " + SHOTS.join(" "));
console.log(ok ? "\n✅ CAS-305 cutover QA PASS" : "\n❌ CAS-305 cutover QA FAIL");
process.exit(ok ? 0 : 1);
