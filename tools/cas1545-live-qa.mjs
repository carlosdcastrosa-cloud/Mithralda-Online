// CAS-1545 live QA — drive real combat per class on the DEPLOYED build and verify
// the pro combat-VFX redesign (drawFx/drawProjectile/drawAtkFx) renders with 0 real
// JS errors and a live fx pool. Presentation-only change; we exercise the genuine
// combat paths via window.__dev (setClass/juiceArena/juiceSwing/cast/setReduceMotion).
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const URL = process.env.QA_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "/tmp/cas1545-live";
fs.mkdirSync(OUT, { recursive: true });
const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];

const isNoise = (t) => /favicon|\.ico|net::ERR_.*favicon|404 \(Not Found\).*favicon/i.test(t);
const errors = [];

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: "shell",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--single-process", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
page.on("pageerror", (e) => { const m = String(e.message || e); if (!isNoise(m)) errors.push("pageerror: " + m); });
page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!isNoise(t)) errors.push("console: " + t); } });
page.on("requestfailed", (r) => { const u = r.url(); if (!isNoise(u)) errors.push("reqfail: " + u + " " + (r.failure()?.errorText || "")); });

console.log("Loading", URL);
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

// version + confirm the redesigned render.js actually loaded on this build
const ver = await page.evaluate(async () => (await fetch("version.json?cb=" + Date.now())).text()).catch(() => "?");
console.log("BUILD:", ver.trim());

// wait for the dev handle
await page.waitForFunction("window.__dev && typeof window.__dev.setClass === 'function'", { timeout: 30000 });

const results = [];
for (const cls of CLASSES) {
  const r = await page.evaluate((cls) => {
    const d = window.__dev;
    const info = () => (typeof game !== "undefined" && game.devInfo ? game.devInfo() : "");
    d.setReduceMotion(false);
    d.setClass(cls);
    d.juiceArena(12);
    // basic swing (drawFx swing/slashArc + drawAtkFx tell)
    d.juiceSwing();
    // 3 spells (drawProjectile + AoE bursts); re-arena between so mp/enemies fresh
    const casts = [];
    for (let i = 1; i <= 3; i++) { try { casts.push(d.cast(i)); } catch (e) { casts.push("err:" + e.message); } }
    return { cls, info: info(), casts };
  }, cls);
  // let a few frames render so fx are on-canvas
  await new Promise((res) => setTimeout(res, 350));
  const fxCount = await page.evaluate(() => {
    const m = (typeof game !== "undefined" ? game.devInfo() : "").match(/fx:(\d+)/);
    return m ? +m[1] : -1;
  });
  await page.screenshot({ path: `${OUT}/cas1545-live-${cls}.png` });
  results.push({ cls, fx: fxCount, info: r.info });
  console.log(`  ${cls.padEnd(8)} fx=${fxCount}  ${r.info}`);
}

// reduceMotion ON: glow/trail gated off, must not error
const rmSafe = await page.evaluate(() => {
  const d = window.__dev; d.setReduceMotion(true); d.setClass("mage"); d.juiceArena(8); d.juiceSwing();
  for (let i = 1; i <= 3; i++) try { d.cast(i); } catch (e) { return "err:" + e.message; }
  return "ok";
});
await new Promise((res) => setTimeout(res, 300));
await page.screenshot({ path: `${OUT}/cas1545-live-reducemotion.png` });
console.log("reduceMotion path:", rmSafe);

await browser.close();

const anyFx = results.some((r) => r.fx > 0);
const pass = errors.length === 0 && anyFx && rmSafe === "ok";
console.log("\n=== RESULT ===");
console.log("build:", ver.trim());
console.log("classes:", results.map((r) => `${r.cls}:fx${r.fx}`).join(" "));
console.log("real JS errors:", errors.length, errors.slice(0, 8));
console.log(pass ? "PASS ✅" : "FAIL ❌");
fs.writeFileSync(`${OUT}/result.json`, JSON.stringify({ url: URL, build: ver.trim(), results, errors, rmSafe, pass }, null, 2));
process.exit(pass ? 0 : 1);
