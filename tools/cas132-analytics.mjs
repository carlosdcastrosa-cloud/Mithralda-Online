// ---------------------------------------------------------------------------
// CAS-132 — privacy-light retention + funnel analytics QA harness (local build).
//
// Boots the REAL game headless and exercises the analytics OBSERVER end-to-end —
// every funnel step is reached by performing the genuine sim action, then read back
// from the persisted localStorage blob via window.__analytics:
//   [BOOT]   a fresh first session creates an anonymous id + records the `boot` step
//   [ONB]    skipping the first-run tutorial marks `onboarding_complete`
//   [HUNT]   a real kill in a hunt zone marks `first_hunt`
//   [BOSS]   summoning the Stage-1 final capstone marks `first_boss`
//   [WIN]    killing it (real win path) marks `first_victory`
//   [DEATH]  the real hero-death path marks `first_death`
//   [PII]    the stored blob carries NO name / personal field — only anon counters
//   [D1]     backdating first-session day → D1 retention reads true (returned next day)
//   [PERSIST] a reload opens session #2 and the funnel/ids survive
//   [DASH]   analytics.html renders retention + funnel from the same-origin store
//   [ERR]    zero JS errors across the run
//
// Run: npm run analytics132   (node tools/cas132-analytics.mjs)
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
const dump = (page) => page.evaluate(() => window.__analytics.dump());
const report = (page) => page.evaluate(() => window.__analytics.report());
const reached = (rep, step) => { const f = rep.funnel.find((x) => x.step === step); return !!(f && f.reached); };

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
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  // ---- fresh storage so this is a TRUE first session ------------------------
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  // reset() nulls the in-memory analytics store so the reload's unload-flush can't
  // resurrect the blob we just cleared (mirrors persist.noSave()); then wipe the rest.
  await page.evaluate(() => { try { if (window.__dev && window.__dev.noSave) window.__dev.noSave();
    if (window.__analytics && window.__analytics.reset) window.__analytics.reset();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.removeItem("mithralda.analytics.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__analytics && window.__dev && window.__dev.scene", { timeout: 20000 });

  // ---- [BOOT] anon id + boot step ------------------------------------------
  let d = await dump(page);
  if (d && /^a-/.test(d.aid || "") && d.sessions === 1 && d.funnel.boot && d.funnel.boot.n >= 1)
    pass(`[BOOT] first session: anon id=${d.aid.slice(0, 10)}… sessions=1, boot recorded`);
  else fail(`[BOOT] unexpected initial blob: ${JSON.stringify(d)}`);

  await enterPlay(page, "QAMetrics");
  await wait(120);

  // ---- [ONB] skip the auto-armed first-run tutorial -> onboarding_complete --
  await page.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active) window.__dev.tutSkip(); });
  await wait(200);
  let r = await report(page);
  if (reached(r, "onboarding_complete")) pass(`[ONB] tutorial skip -> onboarding_complete reached`);
  else fail(`[ONB] onboarding_complete not reached: ${JSON.stringify(r.funnel)}`);

  // ---- [HUNT] a real kill in a hunt zone -> first_hunt ----------------------
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.spawnKill("wolf"); });
  await wait(200);
  r = await report(page);
  if (reached(r, "first_hunt")) pass(`[HUNT] forest kill -> first_hunt reached`);
  else fail(`[HUNT] first_hunt not reached: ${JSON.stringify(r.funnel)}`);

  // ---- [BOSS] summon the Stage-1 final capstone -> first_boss ---------------
  const boss = await page.evaluate(() => window.__dev.armFinalBoss());
  await wait(250); // let several observer ticks see the live champ before we kill it
  r = await report(page);
  if (boss && reached(r, "first_boss")) pass(`[BOSS] armFinalBoss (${boss.name}) -> first_boss reached`);
  else fail(`[BOSS] first_boss not reached (boss=${JSON.stringify(boss)}): ${JSON.stringify(r.funnel)}`);

  // ---- [WIN] kill it through the real win path -> first_victory -------------
  await page.evaluate(() => window.__dev.huntKillChampion("frost"));
  await wait(200);
  r = await report(page);
  const sceneWin = await page.evaluate(() => window.__dev.scene());
  if (reached(r, "first_victory") && sceneWin === "victory")
    pass(`[WIN] final boss killed -> first_victory reached (scene=${sceneWin})`);
  else fail(`[WIN] first_victory not reached (scene=${sceneWin}): ${JSON.stringify(r.funnel)}`);

  // back to free play, then drive the real death path
  await page.evaluate(() => window.__dev.ackVictory());
  await wait(80);

  // ---- [DEATH] the real hero-death path -> first_death ----------------------
  const death = await page.evaluate(() => window.__dev.killHero());
  await wait(200);
  r = await report(page);
  if (death && death.deaths >= 1 && reached(r, "first_death"))
    pass(`[DEATH] heroDie (deaths=${death.deaths}) -> first_death reached`);
  else fail(`[DEATH] first_death not reached (death=${JSON.stringify(death)}): ${JSON.stringify(r.funnel)}`);

  // ---- [PII] the stored blob holds NO personal data -------------------------
  d = await dump(page);
  const blobStr = JSON.stringify(d);
  if (!/QAMetrics/.test(blobStr) && !("name" in d) && !/password|email|ip/i.test(blobStr))
    pass(`[PII] stored blob is anonymous (no hero name / personal fields)`);
  else fail(`[PII] blob may contain PII: ${blobStr.slice(0, 200)}`);

  // ---- [D1] backdate first-session day -> D1 retention reads true -----------
  await page.evaluate(() => window.__analytics._backdate(1));
  const ret = await page.evaluate(() => window.__analytics.retention());
  if (ret && ret.d1 === true) pass(`[D1] backdated created day -> d1 retention = true (activeDays=${ret.activeDays})`);
  else fail(`[D1] d1 retention not true after backdate: ${JSON.stringify(ret)}`);

  // ---- [PERSIST] reload -> session #2, funnel + id survive ------------------
  const aidBefore = d.aid;
  await page.evaluate(() => { try { if (window.__dev && window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__analytics", { timeout: 20000 });
  await wait(120);
  d = await dump(page);
  r = await report(page);
  if (d.aid === aidBefore && d.sessions === 2 && reached(r, "first_victory") && reached(r, "first_hunt"))
    pass(`[PERSIST] reload -> session #2, same id, funnel persisted`);
  else fail(`[PERSIST] state did not persist: aid=${d.aid} sessions=${d.sessions} funnel=${JSON.stringify(r.funnel)}`);

  // ---- [DASH] analytics.html renders retention + funnel from the store ------
  await page.goto(`${srv.url}/analytics.html`, { waitUntil: "load", timeout: 30000 });
  await wait(150);
  const dash = await page.evaluate(() => {
    const root = document.getElementById("root");
    const txt = (root && root.textContent) || "";
    return { hasRetention: /Retenci/i.test(txt), hasFunnel: /Funnel/i.test(txt),
      hasSessions: /Sesiones totales/i.test(txt), notEmpty: !/Aún no hay datos/i.test(txt) };
  });
  if (dash.hasRetention && dash.hasFunnel && dash.hasSessions && dash.notEmpty)
    pass(`[DASH] analytics.html renders retention + funnel from same-origin store`);
  else fail(`[DASH] dashboard did not render expected sections: ${JSON.stringify(dash)}`);

  // ---- [ERR] zero JS errors -------------------------------------------------
  if (errors.length === 0) pass(`[ERR] 0 JS errors across the run`);
  else fail(`[ERR] ${errors.length} JS error(s): ${errors.slice(0, 4).join(" | ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\nCAS-132 analytics: PASS" : "\nCAS-132 analytics: FAIL");
process.exit(ok ? 0 : 1);
