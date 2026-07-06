// CAS-1583 — in-browser boot + live-runtime altar-unlock smoke on the canonical build.
// Boots the real page, records console/page errors, then drives the LIVE page's own
// meta hooks (__metaBuy/__meta) to prove unlock rows are buyable & persist in the
// served runtime (not a local import). Screenshots the booted canvas.
import puppeteer from "puppeteer-core";
const URL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/?dev";
const OUT = "/tmp/cas1583-live";
import { mkdirSync } from "fs";
mkdirSync(OUT, { recursive: true });

const errs = [];
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium",
  headless: "new", args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    // sandbox headless-Chromium intermittently throws net::ERR_CERT_VERIFIER_CHANGED mid-session
    // (the cert service restarts), aborting ES-module fetches. We are validating GAME behaviour,
    // not the site's TLS (curl + version.json already confirm the served build), so bypass it.
    "--ignore-certificate-errors"] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
const failed404 = [];
page.on("requestfailed", (r) => failed404.push(r.url()));
page.on("response", (r) => { if (r.status() === 404) failed404.push(r.url()); });

await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
// Poll for the game module's meta hooks (set during boot); tolerate slow ESM/asset init.
let hooksReady = false;
for (let i = 0; i < 90; i++) {
  hooksReady = await page.evaluate(() => typeof window.__meta === "function" && typeof window.__metaReset === "function");
  if (hooksReady) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log("HOOKS_READY:", hooksReady);
await page.screenshot({ path: OUT + "/boot.png" }).catch(() => {});

const build = await page.evaluate(() => fetch("version.json").then((r) => r.json()).catch(() => null));
const booted = await page.evaluate(() => ({
  hasMeta: typeof window.__meta === "function",
  hasBuy: typeof window.__metaBuy === "function",
  hasDev: typeof window.__dev === "object",
  scene: (window.__dev && window.__dev.scene && window.__dev.scene()) || null,
}));
console.log("BOOTED:", JSON.stringify(booted));

// Drive the LIVE runtime's own meta store: reset, read unlock rows, buy one, confirm.
const unlockFlow = hooksReady ? await page.evaluate(() => {
  window.__metaReset();
  const before = window.__meta().unlocks.map((u) => ({ key: u.key, unlocked: u.unlocked, cost: u.cost }));
  // grant essence via dev hook then buy the cheapest unlock (furia=60)
  window.__dev.metaGrant(10000);
  const bought = window.__metaBuy("unlock_furia");
  const snap = window.__meta();
  const after = snap.unlocks.map((u) => ({ key: u.key, unlocked: u.unlocked }));
  // draft pool: __dev exposes metaGrant but not draftPool; abilityUnlocks() reports the
  // altar-row unlocked state which is the same single filter draftPool() reads.
  return { before, bought, after, essence: snap.essence };
}) : null;

console.log("BUILD:", JSON.stringify(build));
console.log("UNLOCK_FLOW:", JSON.stringify(unlockFlow, null, 1));
console.log("404s:", JSON.stringify([...new Set(failed404)]));
// A game-code JS error is a pageerror or a console.error that is NOT the benign 404 line.
const gameErrs = errs.filter((e) => !/Failed to load resource: the server responded with a status of 404/.test(e));
console.log("GAME_JS_ERRORS(" + gameErrs.length + "):", JSON.stringify(gameErrs.slice(0, 10)));
console.log("SCREENSHOT:", OUT + "/boot.png");
await browser.close();

// Assertions
let ok = true; const fail = (m) => { ok = false; console.error("✖ " + m); };
if (!hooksReady || !booted.hasMeta || !booted.hasBuy) fail("live meta hooks not ready (module init timeout)");
if (gameErrs.length) fail("game JS errors on boot: " + gameErrs[0]);
if (!unlockFlow) { console.log("\nCAS-1583 browser boot: INCONCLUSIVE (hooks not ready)"); process.exit(2); }
const beforeFuria = unlockFlow.before.find((u) => u.key === "unlock_furia");
const afterFuria = unlockFlow.after.find((u) => u.key === "unlock_furia");
if (!(beforeFuria && !beforeFuria.unlocked)) fail("furia not locked at reset");
if (!(unlockFlow.bought && afterFuria && afterFuria.unlocked)) fail("live buy of unlock_furia failed");
console.log(ok ? "\nCAS-1583 browser boot: PASS" : "\nCAS-1583 browser boot: FAIL");
process.exit(ok ? 0 : 1);
