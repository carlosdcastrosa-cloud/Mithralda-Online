// CAS-92: local visual proof the Higgsfield hero animation strips render in-game
// at the reverted (smaller) size. Boots the game as a warrior, then captures the
// hero in idle / walk / attack / dodge-roll states and writes a cropped close-up
// of each plus a full-frame idle. Run: node tools/hero-anim-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "tools");
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const key = (page, code, type = "keydown") =>
  page.evaluate((code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true })), code, type);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push(`reqfail ${r.url()}`); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "AnimBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, "Digit1");                       // warrior (melee, has a basic attack)
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  await sleep(600);

  // crop window centred on the hero (screen centre), high-DSF for a clean close-up
  const crop = { x: 300, y: 170, width: 300, height: 260 };
  const shoot = async (name) => { await page.screenshot({ path: join(OUT, `cas92-${name}.png`), clip: crop }); };

  // IDLE
  await shoot("idle");
  await page.screenshot({ path: join(OUT, "cas92-idle-full.png") });

  // WALK — hold right, let the cycle run, confirm state, shoot
  await key(page, "KeyD", "keydown");
  await page.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='walk'", { timeout: 3000 });
  await sleep(180); await shoot("walk1");
  await sleep(180); await shoot("walk2");
  await key(page, "KeyD", "keyup");
  await sleep(300);

  // ATTACK — Digit1 = castSpell(0); poll for the attack frame
  let atkSeen = false;
  for (let i = 0; i < 6 && !atkSeen; i++) {
    await key(page, "Digit1");
    try { await page.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='attack'", { timeout: 500 });
      atkSeen = true; } catch { await sleep(250); }
  }
  await shoot("attack");
  if (!atkSeen) console.error("⚠ never observed attack state");
  await sleep(400);

  // DODGE ROLL — Space = doRoll
  await key(page, "Space");
  let rollSeen = false;
  try { await page.waitForFunction("window.__dev.heroAnim() && window.__dev.heroAnim().state==='roll'", { timeout: 800 });
    rollSeen = true; } catch {}
  await shoot("roll");
  if (!rollSeen) console.error("⚠ never observed roll state");

  if (errs.length) { ok = false; console.error("✖ page errors:", errs.slice(0, 5)); }
  console.log(`states — walk:ok attack:${atkSeen} roll:${rollSeen}`);
  console.log(ok ? "✔ shots written to tools/cas92-*.png" : "✖ issues found");
} catch (e) { ok = false; console.error("✖", e.message); }
finally { await browser.close(); await srv.close?.(); }
process.exit(ok ? 0 : 1);
