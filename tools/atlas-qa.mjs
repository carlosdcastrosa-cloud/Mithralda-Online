// ---------------------------------------------------------------------------
// Headless atlas QA harness (CAS-19 / CAS-6).
//
// Proves the atlas loader wiring in game.js does what it claims, headlessly:
//   1) FAST-PATH: the whole sprite kit loads as ONE atlas.png request (+ the
//      atlas.json manifest) and ZERO per-file ./assets/{char,class,tiles,props}
//      requests. All 68 IMG[] entries are canvas slices, ready, correct dims.
//   2) RENDER: drives menu -> play and screenshots each class so a human can
//      eyeball that slices are not offset/smeared/missing.
//   3) FALLBACK: re-runs with atlas.json forced to 404 and asserts the game
//      degrades to per-file loading (>=60 image requests) and still boots.
//
// Run: npm run atlas-qa
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const PERFILE_RE = /\/assets\/(char|class|tiles|props)\//;
let ok = true;
const log = (m) => console.log(m);
const failWith = (m) => { ok = false; console.error(`✖ ${m}`); };
const check = (cond, pass, fail) => cond ? log(`✔ ${pass}`) : failWith(fail);

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function boot(page, { breakAtlas = false } = {}) {
  const reqs = { atlasJson: 0, atlasPng: 0, perFile: 0, perFileUrls: [] };
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (breakAtlas && u.includes("/assets/atlas/atlas.json")) { r.respond({ status: 404, body: "nope" }); return; }
    if (u.includes("/assets/atlas/atlas.json")) reqs.atlasJson++;
    else if (u.includes("/assets/atlas/atlas.png")) reqs.atlasPng++;
    else if (PERFILE_RE.test(u)) { reqs.perFile++; if (reqs.perFileUrls.length < 4) reqs.perFileUrls.push(u.split("/assets/")[1]); }
    r.continue();
  });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  // wait until asset loading settles (pending hits 0)
  await page.waitForFunction("window.__dev.assets && window.__dev.assets().pending===0", { timeout: 15000 });
  return reqs;
}

async function enterPlay(page, classDigit) {
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "AtlasQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), classDigit);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
}

try {
  // ---------- 1) FAST-PATH ----------
  log("── 1) ATLAS FAST-PATH ─────────────────────────────");
  let page = await browser.newPage();
  let reqs = await boot(page);
  const a = await page.evaluate(() => window.__dev.assets());
  log(`   network: atlas.json=${reqs.atlasJson}  atlas.png=${reqs.atlasPng}  per-file=${reqs.perFile}`);
  log(`   IMG[]: count=${a.count} canvases=${a.canvases} images=${a.images} ready=${a.ready}`);
  log(`   sample dims: ${a.sample.map(s => `${s.k}=${s.w}x${s.h}`).join("  ")}`);
  check(reqs.atlasPng === 1, "sprite kit loaded as ONE atlas.png request", `expected 1 atlas.png request, got ${reqs.atlasPng}`);
  check(reqs.perFile === 0, "ZERO per-file asset requests (no ~68 fan-out)", `expected 0 per-file requests, got ${reqs.perFile} (${reqs.perFileUrls.join(", ")})`);
  check(a.count === 68 && a.canvases === 68, "all 68 sprites are atlas canvas slices", `expected 68 canvas slices, got count=${a.count} canvases=${a.canvases}`);
  check(a.ready === a.count, "all slices ready (complete + naturalWidth)", `only ${a.ready}/${a.count} slices ready`);
  check(a.sample.every(s => s.w > 0 && s.h > 0), "slice dimensions intact (non-zero)", "a slice has zero dimensions");

  // ---------- 2) RENDER each class ----------
  log("\n── 2) RENDER (per-class screenshots) ──────────────");
  const classes = [[1, "warrior"], [2, "paladin"], [3, "mage"], [4, "druid"], [5, "priest"]];
  for (const [digit, name] of classes) {
    const p = await browser.newPage();
    await boot(p);
    await enterPlay(p, digit);
    p.evaluate(() => { for (let i = 0; i < 3; i++) window.__dev.spawn("mage", 80 + i * 40, 0); });
    await new Promise((r) => setTimeout(r, 400)); // let a few frames render
    const shot = join(ROOT, "tools", `atlas-qa-${name}.png`);
    writeFileSync(shot, await p.screenshot());
    const h = await p.evaluate(() => window.__dev.hero());
    log(`✔ ${name}: play reached, hero@(${h.x | 0},${h.y | 0}), shot -> tools/atlas-qa-${name}.png`);
    await p.close();
  }

  // ---------- 3) FALLBACK (atlas.json -> 404) ----------
  log("\n── 3) FORCE-FALLBACK (atlas.json 404) ─────────────");
  const fp = await browser.newPage();
  const freqs = await boot(fp, { breakAtlas: true });
  const fa = await fp.evaluate(() => window.__dev.assets());
  log(`   network: atlas.png=${freqs.atlasPng}  per-file=${freqs.perFile}  (e.g. ${freqs.perFileUrls.join(", ")})`);
  log(`   IMG[]: count=${fa.count} canvases=${fa.canvases} images=${fa.images} ready=${fa.ready}`);
  check(freqs.perFile >= 60, "fell back to per-file loading (>=60 image requests)", `expected per-file fan-out, got ${freqs.perFile} requests`);
  check(fa.images === fa.count && fa.count >= 68, "all sprites loaded as <img> via fallback", `expected all <img>, got images=${fa.images}/${fa.count}`);
  await enterPlay(fp, 1);
  log("✔ game still boots to play via fallback path");
  await fp.close();
} catch (e) {
  failWith(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (!ok) { console.error("\n✖ ATLAS QA FAILED."); process.exit(1); }
console.log("\n✓ Atlas QA passed.");
