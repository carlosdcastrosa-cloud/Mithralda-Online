// ---------------------------------------------------------------------------
// CAS-132 — TRUE-LIVE analytics probe. Drives the DEPLOYED build inside the
// Higgsfield iframe and proves retention/funnel events actually emit live:
//   [LIVE]   the deployed build boots and exposes window.__analytics
//   [BOOT]   a live session records an anonymous id + the `boot` funnel step
//   [FUNNEL] real sim actions on the live build mark first_hunt/boss/victory
//   [DASH]   /analytics.html serves and renders retention + funnel
//   [ERR]    zero JS errors
//
// Run: npm run analytics132-live
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ORIGIN = "https://tender-bridge-504.higgsfield.gg/";
const LIVE = ORIGIN + "index.html?dev"; // ?dev propagates into the iframe src → __dev hooks
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__analytics && window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __analytics never appeared");
}
const key = (fr, c) => fr.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, key: k, bubbles: true })), c);
const report = (fr) => fr.evaluate(() => window.__analytics.report());
const reached = (rep, step) => { const f = rep.funnel.find((x) => x.step === step); return !!(f && f.reached); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);
  pass(`[LIVE] deployed build booted, window.__analytics present`);

  // fresh session on the live build
  await fr.evaluate(() => { try { if (window.__analytics.reset) window.__analytics.reset();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await fr.evaluate(() => location.reload());
  await sleep(900);
  const fr2 = await gameFrame(page);
  await fr2.waitForFunction("window.__analytics", { timeout: 20000 });

  let d = await fr2.evaluate(() => window.__analytics.dump());
  if (d && /^a-/.test(d.aid || "") && d.funnel.boot && d.funnel.boot.n >= 1)
    pass(`[BOOT] live session: anon id=${d.aid.slice(0, 10)}… boot recorded (sessions=${d.sessions})`);
  else fail(`[BOOT] live blob unexpected: ${JSON.stringify(d)}`);

  // enter play + drive a few real funnel actions on the live build
  await fr2.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await fr2.evaluate(() => { document.getElementById("nameInput").value = "QALive";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr2.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr2, "Digit1");
  await fr2.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(120);
  await fr2.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active) window.__dev.tutSkip(); });
  await fr2.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.spawnKill("wolf"); });
  await sleep(200);
  await fr2.evaluate(() => window.__dev.armFinalBoss());
  await sleep(250);
  await fr2.evaluate(() => window.__dev.huntKillChampion("frost"));
  await sleep(200);
  const r = await report(fr2);
  const need = ["boot", "onboarding_complete", "first_hunt", "first_boss", "first_victory"];
  const missing = need.filter((s) => !reached(r, s));
  if (missing.length === 0) pass(`[FUNNEL] live funnel marked: ${need.join(" → ")}`);
  else fail(`[FUNNEL] missing on live: ${missing.join(", ")} | ${JSON.stringify(r.funnel)}`);

  // dashboard served + renders from the same-origin store
  const dashUrl = ORIGIN + "analytics.html";
  const dpage = await browser.newPage();
  const derrs = [];
  dpage.on("pageerror", (e) => derrs.push(e.message));
  await dpage.goto(dashUrl, { waitUntil: "load", timeout: 30000 });
  await sleep(200);
  const dash = await dpage.evaluate(() => {
    const t = (document.getElementById("root") || {}).textContent || "";
    return { retention: /Retenci/i.test(t), funnel: /Funnel/i.test(t), sessions: /Sesiones totales/i.test(t) };
  });
  if (dash.retention && dash.funnel && dash.sessions && derrs.length === 0)
    pass(`[DASH] live /analytics.html renders retention + funnel`);
  else fail(`[DASH] live dashboard issue: ${JSON.stringify(dash)} errs=${derrs.join(";")}`);

  if (errors.length === 0) pass(`[ERR] 0 JS errors on the live build`);
  else fail(`[ERR] ${errors.length} error(s): ${errors.slice(0, 4).join(" | ")}`);
} catch (e) {
  fail(`probe threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}
log(ok ? "\nCAS-132 analytics LIVE: PASS" : "\nCAS-132 analytics LIVE: FAIL");
process.exit(ok ? 0 : 1);
