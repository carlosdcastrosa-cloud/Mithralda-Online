// ---------------------------------------------------------------------------
// CAS-58 — CACHE-BUSTING VERIFICATION.
//
// Proves AC #2: a returning browser with the PREVIOUS build cached picks up a
// fresh deploy without a hard-refresh.
//
// Method (one real headless Chromium, HTTP cache ENABLED across reloads, server
// sends NO cache headers — exactly like Higgsfield):
//   1) version.json = build "A". Load the game; assert it boots and that the
//      module graph was fetched at ?v=A (incl. an INTERNAL import, proving the
//      import map remaps the whole graph, not just the entry).
//   2) Overwrite version.json = build "B" (= a redeploy; module FILES are
//      byte-identical, fixed names, still cacheable). SOFT reload — cache kept.
//   3) Assert: version.json is re-fetched (cache:'no-store' always hits net),
//      the game now loads modules at ?v=B (a brand-new URL the ?v=A cache entry
//      can't satisfy), boots clean, and NOTHING re-loads the stale ?v=A graph.
//
// Run: npm run cache-bust   (restores the real version.json when done)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const VJSON = join(ROOT, "version.json");
const BUILD_A = "aaaa11110000";
const BUILD_B = "bbbb22220000";

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

// preserve whatever real version.json exists so the test is side-effect free
const original = existsSync(VJSON) ? readFileSync(VJSON, "utf8") : null;
const setBuild = (b) => writeFileSync(VJSON, JSON.stringify({ build: b, files: 0 }) + "\n");

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const failWith = (m) => { ok = false; console.error(`✖ ${m}`); };

try {
  const page = await browser.newPage();
  await page.setCacheEnabled(true);          // returning-player cache behavior
  await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });

  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  let reqs = [];
  page.on("request", (r) => reqs.push(r.url()));
  const has = (frag) => reqs.some((u) => u.includes(frag));

  // ---- PHASE 1: deploy A ----
  setBuild(BUILD_A);
  reqs = [];
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  if (!has(`/game.js?v=${BUILD_A}`)) failWith(`phase1: entry not loaded at ?v=${BUILD_A}`);
  if (!has(`/sim/sim.js?v=${BUILD_A}`)) failWith(`phase1: INTERNAL import not remapped to ?v=${BUILD_A} (import map not covering the graph)`);
  const buildA = await page.evaluate(() => window.__BUILD);
  if (buildA !== BUILD_A) failWith(`phase1: window.__BUILD=${buildA}, expected ${BUILD_A}`);
  console.log(ok ? `✔ phase1: booted on build A; whole graph at ?v=${BUILD_A}` : "phase1 had failures");

  // ---- PHASE 2: redeploy B (cache kept, soft reload) ----
  setBuild(BUILD_B);
  reqs = [];
  errors.length = 0;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });

  if (!has("/version.json")) failWith("phase2: version.json was not re-fetched on reload (no-store broken)");
  if (!has(`/game.js?v=${BUILD_B}`)) failWith(`phase2: did NOT pick up new build — entry still at old id`);
  if (!has(`/sim/sim.js?v=${BUILD_B}`)) failWith(`phase2: internal import not at ?v=${BUILD_B}`);
  if (has(`?v=${BUILD_A}`)) failWith(`phase2: a STALE ?v=${BUILD_A} module was requested after redeploy`);
  const buildB = await page.evaluate(() => window.__BUILD);
  if (buildB !== BUILD_B) failWith(`phase2: window.__BUILD=${buildB}, expected ${BUILD_B}`);
  if (errors.length) failWith(`phase2: page errors after reload:\n   ${errors.join("\n   ")}`);
  console.log(ok ? `✔ phase2: returning browser picked up build B WITHOUT hard-refresh (no stale ?v=${BUILD_A} loads)` : "phase2 had failures");

} catch (e) {
  failWith(`unexpected: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
  if (original !== null) writeFileSync(VJSON, original); // restore real build id
}

if (!ok) { console.error("\n✖ CACHE-BUST GATE FAILED.\n"); process.exit(1); }
console.log("\n✔ CACHE-BUST GATE PASSED — cache-busting works end-to-end.\n");
process.exit(0);
