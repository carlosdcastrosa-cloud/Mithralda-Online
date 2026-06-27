// ---------------------------------------------------------------------------
// Determinism self-test.
//
// Guards the Stage-2 server-authority assumption: world generation must be a
// pure, repeatable function of the simulation RNG. buildWorld() re-seeds the
// single global RNG stream on entry (currently to the fixed value 13371) and
// must then produce byte-identical terrain, solids, walls and spawn coordinates
// on every call and every page load. Any drift (a stray Math.random(), a Date
// or iteration-order dependency) fails this loudly before it can reach Stage-2,
// where the server must rebuild a client's world from the seed alone.
//
// NOTE (Stage-2 debt, see README "Engine seams"): buildWorld() currently
// hard-seeds 13371 internally, so the world is deterministic but not yet
// seed-PARAMETERIZABLE. Making buildWorld(seed) the authority entry point is a
// tracked seam — when that lands, extend this test with a seed-sensitivity case
// (distinct seeds -> distinct terrains).
//
// Run: npm run determinism
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const REPEATS = 5; // independent buildWorld() runs that must agree

function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function diffKeys(a, b) { return Object.keys(a).filter((k) => !eq(a[k], b[k])); }

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let failed = 0;
try {
  const page = await browser.newPage();
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && typeof window.__dev.worldFingerprint === 'function'", { timeout: 15000 });

  // 1) Repeatability: REPEATS independent buildWorld() runs must be identical.
  const runs = [];
  for (let i = 0; i < REPEATS; i++) runs.push(await page.evaluate(() => window.__dev.worldFingerprint(13371)));
  const base = runs[0];
  const stable = runs.every((r) => eq(r, base));
  if (stable) {
    console.log(`✔ repeatable: ${REPEATS}/${REPEATS} buildWorld() runs identical`);
    console.log(`   terrHash=${base.terrHash}  terrLen=${base.terrLen}  solids=${base.solids.length}  walls=${base.wallCount}  npcs=${base.npcs.length}`);
  } else {
    failed++;
    console.error(`✖ buildWorld() DRIFTED across runs — simulation is non-deterministic`);
    for (let i = 1; i < runs.length; i++) {
      const d = diffKeys(base, runs[i]);
      if (d.length) console.error(`   run0 vs run${i} differ on: ${d.join(", ")}`);
    }
  }

  // 2) Cross-page: a fresh page load must reproduce the same world (no
  //    dependence on load order, timing, or in-session state).
  const page2 = await browser.newPage();
  await page2.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page2.waitForFunction("window.__dev && window.__dev.worldFingerprint", { timeout: 15000 });
  const fresh = await page2.evaluate(() => window.__dev.worldFingerprint(13371));
  if (eq(fresh, base)) {
    console.log("✔ cross-page: world reproduces identically on a fresh page load");
  } else {
    failed++;
    console.error(`✖ cross-page: world differs across page loads — differ on: ${diffKeys(base, fresh).join(", ")}`);
  }

  // 3) Non-triviality: the world must actually contain generated content, so a
  //    silently-empty fingerprint can't pass the equality checks by accident.
  if (base.terrLen > 0 && base.solids.length > 0 && base.wallCount > 0 && base.spawnCoords.length > 0) {
    console.log(`✔ non-trivial: world has terrain + ${base.solids.length} solids + ${base.spawnCoords.length} spawners`);
  } else {
    failed++;
    console.error("✖ fingerprint is suspiciously empty — world may not have generated");
  }
} finally {
  await browser.close();
  await srv.close();
}

if (failed) { console.error(`\n✖ DETERMINISM FAILED (${failed} check(s)).`); process.exit(1); }
console.log("\n✓ Determinism self-test passed: world generation is deterministic and repeatable.");
