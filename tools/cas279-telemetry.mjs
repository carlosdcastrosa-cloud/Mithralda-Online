// ---------------------------------------------------------------------------
// CAS-279 — Stage-1 retention instrumentation (telemetry overlay) QA harness.
//
// Boots the REAL game headless and exercises the measurement apparatus end-to-end,
// asserting it is measurement-ONLY (no balance/tunable touch) and soak-safe:
//   [OFF]     overlay defaults HIDDEN on first boot (#telemetry display:none, isOn=false)
//   [KILLS]   real kills accumulate gameplay.session.kills + killsPerRun (read off store)
//   [RUNS]    a real hero death increments runs + deaths (a "run" = a life)
//   [FORGE]   a real Forja upgrade (keyboard) fires forge_upgrade + gameplay.forge
//   [RECAP]   recap_shown / recap_retry funnel events feed the "one more run" CTR read-out
//   [TOGGLE]  F9 shows the overlay; its text carries the live retention numbers; F9 hides it
//   [PERSIST] the overlay ON choice survives a reload (own localStorage key)
//   [READONLY] toggling the overlay mutates NOTHING in the sim (scene/hero stats unchanged)
//   [PII]     the stored blob stays anonymous (no hero name / personal fields)
//   [ERR]     zero JS errors across the run
//
// Run: npm run cas279   (node tools/cas279-telemetry.mjs)
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
const report = (page) => page.evaluate(() => window.__analytics.report());

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
    if (window.__analytics && window.__analytics.reset) window.__analytics.reset();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1");
    localStorage.removeItem("mithralda.analytics.v1"); localStorage.removeItem("mithralda.overlay.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__analytics && window.__overlay && window.__dev && window.__dev.scene", { timeout: 20000 });

  // ---- [OFF] overlay hidden by default --------------------------------------
  const off = await page.evaluate(() => {
    const el = document.getElementById("telemetry");
    return { isOn: window.__overlay.isOn(), disp: el ? getComputedStyle(el).display : "(none-el)" };
  });
  if (off.isOn === false && off.disp !== "block") pass(`[OFF] overlay defaults hidden (isOn=false, display=${off.disp})`);
  else fail(`[OFF] overlay not hidden by default: ${JSON.stringify(off)}`);

  await enterPlay(page, "QARetain");
  await wait(150);

  // ---- [KILLS] real kills accumulate kills + kills/run ----------------------
  await page.evaluate(() => { window.__dev.tpZone("forest"); for (let i = 0; i < 5; i++) window.__dev.spawnKill("wolf"); });
  await wait(200);
  let r = await report(page);
  let S = r.gameplay.session, L = r.gameplay.lifetime;
  if (S.kills >= 5 && S.runs >= 1 && S.killsPerRun > 0 && L.kills >= 5)
    pass(`[KILLS] session kills=${S.kills} runs=${S.runs} kills/run=${S.killsPerRun} (lifetime kills=${L.kills})`);
  else fail(`[KILLS] kill aggregates wrong: ${JSON.stringify(r.gameplay)}`);

  // ---- [FORGE] a real Forja upgrade (keyboard Enter) ------------------------
  await page.evaluate(() => { window.__dev.setGold(9999); window.__dev.setMats(99); window.__dev.openForge(); });
  await page.waitForFunction("window.__dev.scene()==='forge'", { timeout: 5000 });
  await key(page, "Enter"); // forge the selected slot (weapon) one level through the sim authority
  await wait(200);
  r = await report(page);
  const forgeEv = (r.events && r.events.forge_upgrade && r.events.forge_upgrade.n) || 0;
  if (forgeEv >= 1 && r.gameplay.session.forge >= 1)
    pass(`[FORGE] Forja upgrade recorded (event n=${forgeEv}, gameplay.forge=${r.gameplay.session.forge})`);
  else fail(`[FORGE] forge interaction not recorded: ev=${forgeEv} gameplay=${JSON.stringify(r.gameplay.session)}`);
  await page.evaluate(() => { if (window.__dev.scene() === "forge") window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); });
  await wait(80);

  // ---- [RUNS] a real hero death increments runs + deaths --------------------
  const runsBefore = (await report(page)).gameplay.session.runs;
  await page.evaluate(() => window.__dev.killHero());
  await wait(200);
  r = await report(page);
  S = r.gameplay.session;
  if (S.deaths >= 1 && S.runs > runsBefore)
    pass(`[RUNS] death -> runs ${runsBefore}->${S.runs}, deaths=${S.deaths} (a run = a life)`);
  else fail(`[RUNS] death not counted: runsBefore=${runsBefore} ${JSON.stringify(S)}`);

  // ---- [RECAP] recap_shown fired on death; CTR read-out is computable -------
  r = await report(page);
  const recapShown = (r.events && r.events.recap_shown && r.events.recap_shown.n) || 0;
  if (recapShown >= 1) pass(`[RECAP] recap_shown=${recapShown} (one-more-run CTR denominator present)`);
  else fail(`[RECAP] recap_shown not recorded after death: ${JSON.stringify(r.events)}`);

  // ---- [TOGGLE] F9 shows the overlay with live numbers; F9 hides it ---------
  await key(page, "F9");
  await wait(120);
  const onState = await page.evaluate(() => {
    const el = document.getElementById("telemetry");
    return { isOn: window.__overlay.isOn(), disp: el ? getComputedStyle(el).display : "(none)", txt: el ? el.textContent : "" };
  });
  const txt = onState.txt || "";
  if (onState.isOn === true && onState.disp === "block" &&
      /RETENTION TELEMETRY/.test(txt) && /kills\/ronda/.test(txt) && /OTRA RONDA/.test(txt) && /EMBUDO/.test(txt))
    pass(`[TOGGLE] F9 -> overlay visible with retention/session/funnel sections`);
  else fail(`[TOGGLE] overlay text missing expected sections: isOn=${onState.isOn} disp=${onState.disp} txt="${txt.slice(0, 120)}"`);

  await key(page, "F9");
  await wait(100);
  const hidden = await page.evaluate(() => ({ isOn: window.__overlay.isOn(), disp: getComputedStyle(document.getElementById("telemetry")).display }));
  if (hidden.isOn === false && hidden.disp === "none") pass(`[TOGGLE] F9 again -> overlay hidden`);
  else fail(`[TOGGLE] overlay did not hide: ${JSON.stringify(hidden)}`);

  // ---- [READONLY] toggling the overlay mutates nothing in the sim -----------
  const before = await page.evaluate(() => ({ scene: window.__dev.scene(), hero: window.__dev.heroStats ? window.__dev.heroStats() : null }));
  await key(page, "F9"); await wait(60); await key(page, "F9"); await wait(60);
  const after = await page.evaluate(() => ({ scene: window.__dev.scene(), hero: window.__dev.heroStats ? window.__dev.heroStats() : null }));
  if (before.scene === after.scene && JSON.stringify(before.hero) === JSON.stringify(after.hero))
    pass(`[READONLY] overlay toggle left sim state byte-identical (scene=${after.scene})`);
  else fail(`[READONLY] overlay toggle changed sim state: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // ---- [PERSIST] overlay ON choice survives a reload ------------------------
  await page.evaluate(() => { window.__overlay.show(); if (window.__dev && window.__dev.noSave) window.__dev.noSave(); });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__overlay", { timeout: 20000 });
  await wait(150);
  const persisted = await page.evaluate(() => window.__overlay.isOn());
  if (persisted === true) pass(`[PERSIST] overlay ON choice restored after reload`);
  else fail(`[PERSIST] overlay choice not restored: isOn=${persisted}`);

  // ---- [PII] the stored blob holds NO personal data -------------------------
  const blobStr = await page.evaluate(() => JSON.stringify(window.__analytics.dump()));
  if (!/QARetain/.test(blobStr) && !/password|email|\bip\b/i.test(blobStr))
    pass(`[PII] stored blob is anonymous (no hero name / personal fields)`);
  else fail(`[PII] blob may contain PII: ${blobStr.slice(0, 200)}`);

  // ---- [ERR] zero JS errors -------------------------------------------------
  if (errors.length === 0) pass(`[ERR] 0 JS errors across the run`);
  else fail(`[ERR] ${errors.length} JS error(s): ${errors.slice(0, 4).join(" | ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\nCAS-279 telemetry overlay: PASS" : "\nCAS-279 telemetry overlay: FAIL");
process.exit(ok ? 0 : 1);
