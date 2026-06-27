// Drives tools/combatfeel-smoke.html in headless Chromium: captures console errors,
// page exceptions, the __smoke result, and a screenshot. Proves CAS-20 in a real browser.
import puppeteer from "puppeteer-core";

const URL = "http://localhost:8099/tools/combatfeel-smoke.html";
const errors = [];
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/chromium",
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });
  page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("requestfailed", r => errors.push("requestfailed: " + r.url() + " " + (r.failure()?.errorText||"")));

  await page.goto(URL, { waitUntil: "networkidle0", timeout: 20000 });
  await page.waitForFunction(() => document.title.startsWith("smoke-ok"), { timeout: 20000 });
  const smoke = await page.evaluate(() => window.__smoke);
  await page.screenshot({ path: "tools/combatfeel-shot.png" });

  console.log("title/result:", JSON.stringify(smoke));
  console.log("console errors:", errors.length);
  errors.forEach(e => console.log("  " + e));

  const fx = new Set(smoke.fxSeen || []);
  const ok = errors.length === 0
    && smoke.scene === "play"
    && smoke.maxHitstop > 0
    && fx.has("strikeflash") && fx.has("impact") && fx.has("dodgering");
  console.log(ok ? "\nBROWSER PASS — zero console errors; hitstop + strikeflash + impact + dodgering all rendered."
                 : "\nBROWSER CHECK INCOMPLETE — see above (note: dodgering needs a roll-through to have landed).");
  process.exit(ok ? 0 : 2);
} finally {
  await browser.close();
}
