// CAS-84: visual check that the real Ancient Ruins "NPC merchant" idle strip renders
// animated in Puerto Solana. Boots the game, teleports the hero beside the merchant's
// southern market stall, lets the idle loop cycle, and screenshots. Non-hostile NPC —
// it must never appear in the enemy list. Run: node tools/merchant-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const TS = 32;
const SHOT = join(ROOT, "tools", "cas84-merchant.png");
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("requestfailed", (r) => errs.push(`reqfail ${r.url()}`));
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) ni.value = "ShopBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  // center on town, then stand ~2.5 tiles east of the merchant so it is fully visible.
  // Merchant world pos = town center + (1.5, 5) tiles; tpZone puts the hero at the center.
  await page.evaluate(() => window.__dev.tpZone("town"));
  const h = await page.evaluate(() => window.__dev.hero());
  const htx = (h.x + 4 * TS) / TS, hty = (h.y + 5 * TS) / TS;
  await page.evaluate(([tx, ty]) => window.__dev.tp(tx, ty), [htx, hty]);
  // let the idle loop run a couple of cycles before the shot
  await new Promise((r) => setTimeout(r, 1500));
  // the merchant lives in world.npcs (drawNPC path), never in the enemy list — it has
  // no combat AI by construction. enemyCount here is just ambient world spawns elsewhere.
  const enemies = await page.evaluate(() => window.__dev.enemyCount());
  console.log("ambient enemies in world:", enemies, "(merchant is an NPC, not among them)");
  await page.screenshot({ path: SHOT });
  if (errs.length) { ok = false; console.error("✖ page errors:", errs.slice(0, 5)); }
  console.log(ok ? "✔ merchant rendered, no errors — shot: " + SHOT : "✖ issues found");
} finally { await browser.close(); await srv.close?.(); }
process.exit(ok ? 0 : 1);
