// ---------------------------------------------------------------------------
// Headless progression-persistence playthrough (CAS-113).
//
// Boots the REAL game in headless Chromium and drives the SAME code paths the
// game uses (createHero, buyItem via the shop hooks, the autosave/flush in
// persist.js), then RELOADS the page to prove progress is durable across a
// refresh. Covers every acceptance criterion:
//   1) buy upgrades + accumulate gold/XP -> reload -> upgrades, gold, level and
//      derived COMBAT stats (dmg/def/maxHp) all survive (not cosmetic)
//   2) a corrupt / wrong-version save -> reload -> starts clean at the menu,
//      no crash, no blank screen, zero page errors
//   3) reset / clearSave -> reload -> back to the initial menu flow
//   4) no regression: a rehydrated run is in 'play' and the world is live
//
// Run: npm run persist   (node tools/persist.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));

async function enterPlay(page, cls = "Digit2") { // Digit2 = a non-default class to prove class persists
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "SaveBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  const URL = `${srv.url}/index.html?dev`;
  await page.goto(URL, { waitUntil: "load" });
  await page.bringToFront();
  // start from a guaranteed-clean slate
  await page.waitForFunction("window.__dev && window.__dev.clearSave", { timeout: 15000 });
  await page.evaluate(() => window.__dev.clearSave());
  await page.reload({ waitUntil: "load" });

  // ---- (A) build a run worth saving --------------------------------------
  await enterPlay(page, "Digit2");
  const cls0 = await page.evaluate(() => window.__dev.hero().cls);
  pass(`entered play as '${cls0}' (non-default class)`);

  // open the merchant shop the real way, fund, buy 3 distinct permanent upgrades
  await page.evaluate(() => window.__dev.merchantTP());
  await key(page, "KeyE"); await page.waitForFunction("window.__dev.scene()==='dialogue'", { timeout: 3000 }).catch(()=>{});
  await dwell(200); await key(page, "KeyE"); await dwell(120); await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene()==='shop'", { timeout: 3000 }).catch(()=>{});
  await page.evaluate(() => window.__dev.setGold(1000));
  await page.evaluate(() => { window.__dev.shopBuy(0); window.__dev.shopBuy(0); window.__dev.shopBuy(1); window.__dev.shopBuy(2); }); // dmg x2, hp, def
  // leave a known gold balance + force the autosave to flush to localStorage
  await page.evaluate(() => window.__dev.setGold(777));
  const before = await page.evaluate(() => { window.__dev.saveNow(); return window.__dev.heroStats(); });
  const blob = await page.evaluate(() => window.__dev.saveBlob());
  log(`   pre-reload: cls=${cls0} gold=${before.gold} dmg=${before.dmg} def=${before.def} maxHp=${before.maxHp} upg=${JSON.stringify(before.upg)}`);
  if (blob && blob.version === 1 && blob.cls === cls0 && blob.upg.dmg === 2 && blob.upg.hp === 1 && blob.upg.def === 1)
    pass(`save blob written (v${blob.version}, cls=${blob.cls}, upg dmg2/hp1/def1)`);
  else fail(`save blob malformed: ${JSON.stringify(blob)}`);

  // ---- (1) reload -> progress + combat stats survive ----------------------
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 15000 });
  const after = await page.evaluate(() => window.__dev.heroStats());
  const clsR = await page.evaluate(() => window.__dev.hero().cls);
  log(`   post-reload: cls=${clsR} gold=${after.gold} dmg=${after.dmg} def=${after.def} maxHp=${after.maxHp} upg=${JSON.stringify(after.upg)}`);
  const survived = clsR === cls0 && after.gold === before.gold && after.dmg === before.dmg &&
                   after.def === before.def && after.maxHp === before.maxHp &&
                   JSON.stringify(after.upg) === JSON.stringify(before.upg);
  if (survived) pass("AC1: reload rehydrated class, gold, upgrades + derived COMBAT stats (dmg/def/maxHp) intact");
  else fail(`AC1: state drifted across reload: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  // landed straight in play (skipped name/class), world live
  const live = await page.evaluate(() => ({ scene: window.__dev.scene(), enemies: window.__dev.enemyCount() }));
  if (live.scene === "play") pass(`AC4: rehydrated straight into play (world live, enemies=${live.enemies})`);
  else fail(`AC4: did not rehydrate into play: ${JSON.stringify(live)}`);

  // ---- (2) corrupt / version-mismatch save -> clean start, no crash -------
  // noSave() suppresses the unload-flush so our injected bad blob survives the
  // reload instead of being clobbered by the live run's autosave (same guard the
  // real reset uses) — then boot() must discard the bad blob and start clean.
  await page.evaluate(() => { window.__dev.noSave(); try { localStorage.setItem("mithralda.save.v1", "{not valid json,,,"); } catch(e){} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  const corruptScene = await page.evaluate(() => window.__dev.scene());
  if (corruptScene === "menu") pass("AC2a: corrupt JSON save discarded -> clean menu (no crash)");
  else fail(`AC2a: corrupt save did not fall back to menu: scene=${corruptScene}`);

  await page.evaluate(() => { window.__dev.noSave(); try { localStorage.setItem("mithralda.save.v1", JSON.stringify({ version: 999, cls: "warrior", gold: 5 })); } catch(e){} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  const verScene = await page.evaluate(() => window.__dev.scene());
  const verCleared = await page.evaluate(() => window.__dev.hasSave());
  if (verScene === "menu" && !verCleared) pass("AC2b: wrong-version save discarded + cleared -> clean menu");
  else fail(`AC2b: version-mismatch not handled: scene=${verScene} hasSave=${verCleared}`);

  // ---- (3) the REAL "Nueva partida" reset -> wipes save + back to menu -----
  await enterPlay(page, "Digit1");
  await page.evaluate(() => { window.__dev.setGold(500); window.__dev.saveNow(); });
  if (await page.evaluate(() => window.__dev.hasSave())) pass("AC3: a fresh run saved");
  else fail("AC3: expected a save to exist before reset");
  // resetGame() = the pause-menu "Nueva partida" action: suppress + clear + reload.
  await Promise.all([
    page.waitForNavigation({ waitUntil: "load" }),
    page.evaluate(() => window.__dev.resetGame()),
  ]);
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  const resetScene = await page.evaluate(() => window.__dev.scene());
  if (resetScene === "menu" && !(await page.evaluate(() => window.__dev.hasSave())))
    pass("AC3: 'Nueva partida' reset wiped the save -> back to the initial menu flow");
  else fail(`AC3: reset did not return to menu/clear save: scene=${resetScene}`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors across all reloads");
} catch (e) {
  fail(`harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\n✓ Persistence passed: progress survives a refresh, corrupt/old saves start clean, reset works."
       : "\n✗ Persistence FAILED.");
process.exit(ok ? 0 : 1);
