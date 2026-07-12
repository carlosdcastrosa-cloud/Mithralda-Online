// CAS-2225 — visual evidence for the door mechanic (DARK). Boots the REAL served game with the flag
// TEMPORARILY enabled (caller flips config.js before running, reverts after), drives the OBSERVABLE
// __dev hooks: open a door → screenshot the open threshold; walk in → screenshot the interior room.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "DoorShot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  // some builds insert an ability-select step before play — advance past it if present
  await page.waitForFunction("window.__dev.scene() === 'play' || window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  if (await page.evaluate(() => window.__dev.scene() === "abilitysel")) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  }

  const doors = await page.evaluate(() => window.__dev.doorList());
  console.log("doors:", JSON.stringify(doors.map(d => ({ id: d.id, open: d.open, solidClosed: d.solidClosed }))));
  if (!doors.length) { console.error("NO DOORS — flag not enabled?"); process.exit(1); }
  const id = doors[0].id;

  // park at the door + open it, center camera, settle a few frames
  await page.evaluate((id) => { const d = window.__dev.doorList().find(x => x.id === id);
    window.__dev.tp(Math.round(d.outX / 32), Math.round(d.outY / 32)); window.__dev.doorInteract(id); }, id);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: join(ROOT, "tools", "cas2225-open-door.png") });
  console.log("saved cas2225-open-door.png");

  // walk through → interior; settle; screenshot the room
  await page.evaluate((id) => window.__dev.doorEnter(id), id);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: join(ROOT, "tools", "cas2225-interior.png") });
  console.log("saved cas2225-interior.png");

  // exit → back outside
  const exit = await page.evaluate((id) => window.__dev.doorExit(id), id);
  console.log("exit:", JSON.stringify(exit));
  console.log(errors.length ? ("ERRORS: " + errors.join("; ")) : "zero page errors");
} finally {
  await browser.close(); await srv.stop?.();
}
process.exit(errors.length ? 1 : 0);
