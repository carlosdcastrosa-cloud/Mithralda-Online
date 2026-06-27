// CAS-70: verify the druid thornstorm FIELD ticks damage OVER TIME in the real
// update() loop (the path tools/spells.mjs can't see — it only reads the plant tick),
// and that the zone expires. Uses the additive __dev.dotProbe hook.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true; const fail = (m) => { ok = false; console.error("✖ " + m); };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.dotProbe", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "FieldBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit4", key: "4", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });

  const r = await page.evaluate(() => window.__dev.dotProbe());
  console.log("   dotProbe:", JSON.stringify(r));
  if (!(r.plantDmg > 0)) fail(`field plant tick dealt no damage (plantDmg=${r.plantDmg})`);
  if (!(r.overTimeDmg > r.plantDmg)) fail(`field did NOT keep ticking over time (overTime=${r.overTimeDmg} <= plant=${r.plantDmg})`);
  if (!(r.ticks >= 3)) fail(`expected multiple DoT ticks, saw ${r.ticks}`);
  if (r.fieldsLeft !== 0) fail(`field did not expire (fieldsLeft=${r.fieldsLeft})`);
  if (errors.length) fail("page errors: " + errors.join(" | "));
  if (ok) { console.log("✔ field plant + over-time DoT + expiry all confirmed"); console.log("✔ zero page errors"); }
} catch (e) { fail("threw: " + e.message); }
finally { await browser.close(); await srv.close(); }
if (!ok) { console.error("\n✖ FIELD DOT CHECK FAILED."); process.exit(1); }
console.log("\n✓ Field DoT check passed.");
