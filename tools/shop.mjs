// ---------------------------------------------------------------------------
// Headless merchant-shop economic-loop playthrough (CAS-112).
//
// Boots the REAL game in headless Chromium and closes the economic loop through
// the SAME code the game uses — no shortcut around interact()/buyItem():
//   1) walking onto the Mercader Ambulante and pressing E opens the upgrade shop
//      via the real interact()->dialogue->shop path (scene "shop", merchant flag)
//   2) the shop lists 3 escalating PERMANENT upgrades + 1 consumable bundle
//   3) buying "Filo afilado" raises baseDmg/equippedDmg by +5 and debits the gold
//   4) buying "Vigor" raises maxHp by +30; "Coraza" raises def by +4 — real combat
//      numbers, persistent for the session (tracked on hero.upg)
//   5) an upgrade caps after its last tier (line blocked, gold untouched)
//   6) a purchase with too little gold is denied (gold + stats unchanged)
//
// Test inputs use dev-only hooks (?dev) that call the real game functions.
//
// Run: npm run shop   (node tools/shop.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "shop-merchant.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ShopBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) REAL open path: park on the merchant, press E (interact->dialogue), then E
  // twice to advance past the 2 dialogue lines, which opens the upgrade shop.
  const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
  await page.evaluate(() => window.__dev.merchantTP());
  await key(page, "KeyE"); // interact -> dialogue
  await page.waitForFunction("window.__dev.scene() === 'dialogue'", { timeout: 3000 }).catch(() => {});
  await dwell(250); // let the dialogue PORTRAIT render (animated-NPC portrait path)
  await key(page, "KeyE"); // advance line 1
  await dwell(150);
  await key(page, "KeyE"); // advance line 2 -> opens shop
  await page.waitForFunction("window.__dev.scene() === 'shop'", { timeout: 3000 }).catch(() => {});
  const opened = await page.evaluate(() => window.__dev.heroStats());
  if (opened.scene === "shop" && opened.merchant) pass("E on merchant opened the upgrade shop (real interact->dialogue->shop)");
  else fail(`merchant shop did not open via real path: ${JSON.stringify(opened)}`);

  // (2) shop contents
  const list = await page.evaluate(() => window.__dev.shopList());
  // CAS-192: merchant now also stocks the 3 combat consumables AFTER the 4 upgrade
  // lines (4 + 3 = 7). The first 4 lines (the CAS-112 economic loop) are unchanged.
  if (list.length === 7) pass(`shop lists 7 lines (4 upgrades + 3 consumables): ${list.map((i) => i.name.split(" (")[0].split(" —")[0]).join(" | ")}`);
  else fail(`expected 7 shop lines, got ${list.length}: ${JSON.stringify(list)}`);
  const namesOk = /Filo/.test(list[0]?.name) && /Vigor/.test(list[1]?.name) && /Coraza/.test(list[2]?.name) && /[Pp]ociones/.test(list[3]?.name);
  if (namesOk) pass("first 4 lines are dmg / hp / def upgrades + potion bundle");
  else fail(`unexpected shop line names: ${JSON.stringify(list.map((i) => i.name))}`);
  const consumOk = /[Ff]uria/.test(list[4]?.name) && /Antídoto/.test(list[5]?.name) && /mayor/.test(list[6]?.name);
  if (consumOk) pass("lines 5-7 are the combat consumables (furia / antídoto / mayor)");
  else fail(`unexpected consumable line names: ${JSON.stringify(list.slice(4).map((i) => i.name))}`);

  // (3-4) each upgrade changes a REAL combat number and debits gold. Fund first.
  await page.evaluate(() => window.__dev.setGold(1000));
  const b0 = await page.evaluate(() => window.__dev.heroStats());

  const aDmg = await page.evaluate(() => window.__dev.shopBuy(0));
  if (aDmg.dmg === b0.dmg + 5 && aDmg.baseDmg === b0.baseDmg + 5 && aDmg.gold === b0.gold - 60 && aDmg.upg.dmg === 1)
    pass(`Filo afilado: dmg ${b0.dmg}->${aDmg.dmg} (+5), gold -60 (${aDmg.gold})`);
  else fail(`dmg upgrade wrong: before=${JSON.stringify(b0)} after=${JSON.stringify(aDmg)}`);

  const aHp = await page.evaluate(() => window.__dev.shopBuy(1));
  if (aHp.maxHp === aDmg.maxHp + 30 && aHp.gold === aDmg.gold - 50 && aHp.upg.hp === 1)
    pass(`Vigor: maxHp ${aDmg.maxHp}->${aHp.maxHp} (+30), gold -50 (${aHp.gold})`);
  else fail(`hp upgrade wrong: before=${JSON.stringify(aDmg)} after=${JSON.stringify(aHp)}`);

  const aDef = await page.evaluate(() => window.__dev.shopBuy(2));
  if (aDef.def === aHp.def + 4 && aDef.gold === aHp.gold - 70 && aDef.upg.def === 1)
    pass(`Coraza: def ${aHp.def}->${aDef.def} (+4), gold -70 (${aDef.gold})`);
  else fail(`def upgrade wrong: before=${JSON.stringify(aHp)} after=${JSON.stringify(aDef)}`);

  const aPot = await page.evaluate(() => window.__dev.shopBuy(3));
  if (aPot.potHP === aDef.potHP + 3 && aPot.potMP === aDef.potMP + 2 && aPot.gold === aDef.gold - 40)
    pass(`Lote de pociones: potHP +3 (${aPot.potHP}), potMP +2 (${aPot.potMP}), gold -40`);
  else fail(`potion bundle wrong: before=${JSON.stringify(aDef)} after=${JSON.stringify(aPot)}`);

  // (5) max out the damage upgrade (4 tiers total) then assert it caps + blocks.
  await page.evaluate(() => { window.__dev.setGold(5000); window.__dev.shopBuy(0); window.__dev.shopBuy(0); window.__dev.shopBuy(0); });
  const maxed = await page.evaluate(() => window.__dev.heroStats());
  const listMax = await page.evaluate(() => window.__dev.shopList());
  if (maxed.upg.dmg === 4 && listMax[0].blocked && /MÁX/.test(listMax[0].name)) pass(`Filo afilado caps at 4/4 (MÁX, blocked): "${listMax[0].name}"`);
  else fail(`dmg upgrade did not cap: upg.dmg=${maxed.upg.dmg} line=${JSON.stringify(listMax[0])}`);
  const blockTry = await page.evaluate(() => window.__dev.shopBuy(0));
  if (blockTry.gold === maxed.gold && blockTry.baseDmg === maxed.baseDmg) pass("buying a maxed upgrade is denied (gold + dmg unchanged)");
  else fail(`maxed buy not denied: before gold ${maxed.gold} dmg ${maxed.baseDmg} -> ${JSON.stringify(blockTry)}`);

  // (6) too-poor purchase is rejected: 10 gold can't afford the 50-gold Vigor tier.
  await page.evaluate(() => window.__dev.setGold(10));
  const poor0 = await page.evaluate(() => window.__dev.heroStats());
  const poor1 = await page.evaluate(() => window.__dev.shopBuy(1));
  if (poor1.gold === 10 && poor1.maxHp === poor0.maxHp) pass("insufficient gold blocks the purchase (gold + maxHp unchanged)");
  else fail(`under-funded buy not blocked: ${JSON.stringify(poor0)} -> ${JSON.stringify(poor1)}`);

  // visual proof: screenshot the open merchant shop UI
  await new Promise((r) => setTimeout(r, 200));
  writeFileSync(SHOT, await page.screenshot());
  pass(`merchant shop screenshot saved: ${SHOT}`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\n✓ Merchant-shop economic loop passed: hunt gold -> merchant -> permanent power."
       : "\n✗ Merchant-shop economic loop FAILED.");
process.exit(ok ? 0 : 1);
