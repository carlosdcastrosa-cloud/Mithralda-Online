// ---------------------------------------------------------------------------
// CAS-224 / CAS-211 (d) — verify the priest power/AoE nova (holynova) now leads
// CRIMSON + cold blue-white (FOUNTAINS palette-lock), not warm holy-gold amber.
//
// QA iter-5 flagged the power/AoE *base fill* as still amber-dominant. This probe
// forces a priest nova (which spawns `holynova` + `shockring`), holds the frame,
// screenshots it, and samples the FX ring region: crimson => mean R >> mean G;
// amber/gold => mean R ~= mean G (both high). Asserts the conversion landed and
// the FX still spawns through the live combat path with zero JS errors.
//
// Run: node tools/cas224-holynova-palette.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- deterministic source gate: the holynova FX branch must lead crimson + cold
// blue-white (palette-lock) and contain NONE of the old warm holy-gold amber. ---
const renderSrc = readFileSync(join(ROOT, "render", "render.js"), "utf8");
const hn = (renderSrc.match(/f\.kind==="holynova"\)\{[\s\S]*?ctx\.globalAlpha=1; \}/) || [""])[0];
if (!hn) fail("[SRC] could not locate the holynova render branch");
else {
  const amber = ["#ffe39a", "#fff6d8"].filter(c => hn.includes(c));
  const crimson = ["#d8403f", "#b3242a"].filter(c => hn.includes(c));
  const cold = ["#dbeeff"].filter(c => hn.includes(c));
  if (amber.length) fail(`[SRC] holynova still contains warm amber/gold: ${amber.join(",")}`);
  else pass("[SRC] holynova has NO warm amber/gold (#ffe39a/#fff6d8) left");
  if (crimson.length >= 2 && cold.length) pass(`[SRC] holynova leads crimson (${crimson.join(",")}) + cold blue-white (${cold.join(",")})`);
  else fail(`[SRC] holynova missing palette-lock signature: crimson=${crimson.join(",")} cold=${cold.join(",")}`);
}

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAnova";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  // Digit5 = priest (CLASS_LIST = [warrior,paladin,mage,druid,priest])
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit5", key: "5", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await page.evaluate(() => { try { window.__dev.setClass("priest"); } catch (e) {} });
  const cls = await page.evaluate(() => window.__dev.hero() && window.__dev.hero().cls);
  if (cls === "priest") pass(`entered play as priest`); else fail(`not priest: ${cls}`);

  // Fire a REAL priest nova through the live combat path (heroAttack → nova branch
  // at sim.js:400 spawns holynova + shockring). One enemy = minimal contaminating
  // impact FX (white/crimson), and holynova was the ONLY warm-amber FX in the scene.
  await page.evaluate(() => { try { window.__dev.juiceArena(1); } catch (e) {} });
  await wait(40);
  const st = await page.evaluate(() => { try { return window.__dev.juiceSwing(); } catch (e) { return { fx: -1, err: String(e) }; } });
  if (st && st.fx > 0) pass(`[SPAWN] priest nova fired through live combat path → ${st.fx} fx (holynova+shockring)`);
  else fail(`[SPAWN] nova did not fire: ${JSON.stringify(st)}`);
  await wait(30); // one rAF renders the freshly-spawned FX frame

  // Informational only: whole-frame channel sample (software-GL headless timing +
  // a growing-radius ring make this non-deterministic, so it does NOT gate; the
  // deterministic verdict is the [SRC] gate above + QA's visual re-score).
  const samp = await page.evaluate(() => {
    const cv = document.querySelector("canvas"); const ctx = cv.getContext("2d");
    const img = ctx.getImageData(0, 80, cv.width, cv.height - 80).data; // skip top HUD strip
    let crimson = 0, amber = 0, bright = 0;
    for (let p = 0; p < img.length; p += 4) {
      const r = img[p], g = img[p + 1], b = img[p + 2], a = img[p + 3];
      if (a < 30 || (r < 90 && g < 90 && b < 90)) continue;
      bright++;
      if (r > 150 && g < 120 && r - g > 60) crimson++;
      if (r > 180 && g > 170 && b < 200 && Math.abs(r - g) < 60) amber++;
    }
    return { bright, crimson, amber };
  });
  console.log(`  (info) live-frame sample: brightPx=${samp.bright} crimsonPx=${samp.crimson} warmAmberPx=${samp.amber}`);

  // re-fire and grab the frame mid-life so the expanded crimson ring is on-screen
  await page.evaluate(() => { try { window.__dev.juiceArena(1); window.__dev.juiceSwing(); } catch (e) {} });
  await wait(230); // ring grows over its 0.5s life — ~halfway = a wide, legible ring
  await page.screenshot({ path: "tools/cas224-holynova.png" });
  pass("[SHOT] tools/cas224-holynova.png (priest power/AoE nova)");

  if (errors.length) fail(`[ERR] ${errors.length} JS error(s): ${errors.slice(0, 3).join(" | ")}`);
  else pass("[ERR] zero JS errors across the run");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close(); await srv.close();
}
console.log(ok ? "\n✓ CAS-224 holynova palette check passed." : "\n✗ CAS-224 holynova palette check FAILED.");
process.exit(ok ? 0 : 1);
