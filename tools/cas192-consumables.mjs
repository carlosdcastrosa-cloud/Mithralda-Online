// ---------------------------------------------------------------------------
// Headless combat-consumables playthrough (CAS-192).
//
// Boots the REAL game in headless Chromium and drives the data-driven combat
// consumables (CONSUMABLES) end-to-end through the SAME code the game uses —
// no shortcut around the merchant shop (buyItem) or the use path (doConsumable):
//
//   1) the Mercader Ambulante stocks the 3 consumables after the 4 upgrade lines;
//      BUYING furia/antídoto/mayor debits gold and +1's the hero's stash (gold sink).
//   2) FURIA (atkspd buff): using it shortens the REAL swing cadence (atkCadence,
//      the same formula heroAttack() uses) and posts a live duration (atkspdBuffT);
//      after the timer expires the cadence returns to baseline (buff really ends).
//   3) ANTÍDOTO (purge): with an active poison DoT + slow on the hero (applied through
//      the real CAS-118 applyStatus), using it CLEANSES both (dots + slowT -> 0).
//   4) POCIÓN MAYOR (scaled heal): from low HP, using it restores ~60% of MAX hp.
//   5) COOLDOWN: a second use while h.consumCD>0 is denied (qty + effect unchanged).
//   6) EMPTY SLOT: selecting a 0-qty consumable and using it is denied (no effect).
//   7) keyboard path: the real [Q] key fires doConsumable() (proves the binding).
//   8) 60fps under load + zero JS errors + a screenshot.
//
// Test inputs use dev-only hooks (?dev) that call the real game functions.
//
// Run: npm run consumables   (node tools/cas192-consumables.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas192-consumables.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const near = (a, b, eps) => Math.abs(a - b) <= (eps ?? 0.5);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ConsumBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

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

  // (1) BUY through the real merchant shop (gold sink). Open the merchant, then buy the
  // 3 consumable lines (indices 4,5,6 — after the 4 CAS-112 upgrade lines).
  await page.evaluate(() => window.__dev.merchantTP());
  await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'dialogue'", { timeout: 3000 }).catch(() => {});
  await dwell(250); await key(page, "KeyE"); await dwell(150); await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'shop'", { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => window.__dev.setGold(1000));
  const before = await page.evaluate(() => window.__dev.consumState());
  const g0 = (await page.evaluate(() => window.__dev.heroStats())).gold;
  const list = await page.evaluate(() => window.__dev.shopList());
  const idxFury = list.findIndex((i) => /[Ff]uria/.test(i.name));
  const idxAnti = list.findIndex((i) => /Antídoto/.test(i.name));
  const idxMayor = list.findIndex((i) => /mayor/.test(i.name));
  if (idxFury === 4 && idxAnti === 5 && idxMayor === 6) pass(`merchant stocks 3 consumables at lines 5-7 (prices ${list[4].price}/${list[5].price}/${list[6].price})`);
  else fail(`consumable shop indices wrong: fury=${idxFury} anti=${idxAnti} mayor=${idxMayor}`);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxFury);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxAnti);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxMayor);
  const afterBuy = await page.evaluate(() => window.__dev.consumState());
  const g1 = (await page.evaluate(() => window.__dev.heroStats())).gold;
  const spend = list[4].price + list[5].price + list[6].price;
  if (afterBuy.consum.fury === before.consum.fury + 1 && afterBuy.consum.antidote === before.consum.antidote + 1 && afterBuy.consum.greater === before.consum.greater + 1)
    pass(`buying +1 each: stash ${JSON.stringify(before.consum)} -> ${JSON.stringify(afterBuy.consum)}`);
  else fail(`stash did not increment on buy: ${JSON.stringify(afterBuy.consum)}`);
  if (g1 === g0 - spend) pass(`gold sink: ${g0} -> ${g1} (-${spend})`);
  else fail(`gold not debited correctly: ${g0} -> ${g1}, expected -${spend}`);

  // back to play
  await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 3000 }).catch(() => {});

  // (2) FURIA — atkspd buff shortens the REAL swing cadence; expires after its duration.
  await page.evaluate(() => { window.__dev.setConsum("fury", 2); window.__dev.selectConsum(0); });
  const baseCad = await page.evaluate(() => window.__dev.atkCadence());
  const useFury = await page.evaluate(() => window.__dev.useConsum());
  const buffCad = await page.evaluate(() => window.__dev.atkCadence());
  if (useFury.ok && useFury.atkspdBuffT > 0 && useFury.consum.fury === 1) pass(`furia used: buff timer ${useFury.atkspdBuffT}s, stash fury -> ${useFury.consum.fury}`);
  else fail(`furia use failed: ${JSON.stringify(useFury)}`);
  if (buffCad < baseCad - 1e-4) pass(`furia shortens swing cadence: ${baseCad}s -> ${buffCad}s (faster attacks)`);
  else fail(`furia did not speed attacks: base ${baseCad} buffed ${buffCad}`);
  // let the buff expire (dur 6s) — cadence must return to baseline (real timer tick)
  await dwell(6500);
  const afterCad = await page.evaluate(() => window.__dev.atkCadence());
  const afterFury = await page.evaluate(() => window.__dev.consumState());
  if (near(afterCad, baseCad, 1e-3) && afterFury.atkspdBuffT === 0) pass(`furia buff expired: cadence back to ${afterCad}s (buff timer 0)`);
  else fail(`furia buff did not expire cleanly: cadence ${afterCad} (base ${baseCad}), timer ${afterFury.atkspdBuffT}`);

  // (3) ANTÍDOTO — purge an active DoT + slow applied through the real CAS-118 engine.
  // Per-consumable cooldown: using furia must NOT lock out the antídoto.
  await page.evaluate(() => {
    window.__dev.setConsum("antidote", 2); window.__dev.selectConsum(1);
    window.__dev.applyStatusTo("hero", "poison", { dmg: 3 });
    window.__dev.applyStatusTo("hero", "slow", {});
  });
  const sick = await page.evaluate(() => window.__dev.consumState());
  if (sick.dots.includes("poison") && sick.slowT > 0) pass(`hero afflicted: dots=${JSON.stringify(sick.dots)} slowT=${sick.slowT}`);
  else fail(`could not afflict hero: ${JSON.stringify(sick)}`);
  const cured = await page.evaluate(() => window.__dev.useConsum());
  if (cured.ok && cured.dots.length === 0 && cured.slowT === 0 && cured.consum.antidote === 1)
    pass(`antídoto purged: dots=[] slowT=0, stash antidote -> ${cured.consum.antidote}`);
  else fail(`antídoto did not purge: ${JSON.stringify(cured)}`);

  // (4) POCIÓN MAYOR — scaled heal (~60% of max hp) from low HP.
  const maxHp = (await page.evaluate(() => window.__dev.consumState())).maxHp;
  await page.evaluate(() => { window.__dev.setConsum("greater", 2); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  const lowHp = (await page.evaluate(() => window.__dev.consumState())).hp;
  const healed = await page.evaluate(() => window.__dev.useConsum());
  const expectHeal = Math.round(maxHp * 0.6);
  if (healed.ok && near(healed.hp - lowHp, expectHeal, 2) && healed.consum.greater === 1)
    pass(`poción mayor healed ${lowHp} -> ${healed.hp} (+${healed.hp - lowHp} ≈ 60% of ${maxHp}), stash -> ${healed.consum.greater}`);
  else fail(`poción mayor heal wrong: ${lowHp} -> ${healed.hp}, expected +~${expectHeal}: ${JSON.stringify(healed)}`);

  // (5) COOLDOWN — greater was just used (its cd is live); a second use is denied and
  // the stash is untouched. Per-consumable cd: only greater is gated, not the others.
  await page.evaluate(() => { window.__dev.setConsum("greater", 2); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  await page.evaluate(() => window.__dev.useConsum()); // fire greater -> sets its cd
  const cdState = await page.evaluate(() => window.__dev.consumState());
  const blocked = await page.evaluate(() => window.__dev.useConsum());
  if (cdState.cd > 0 && !blocked.ok && blocked.consum.greater === cdState.consum.greater)
    pass(`cooldown gate: greater re-use denied while cd=${cdState.cd}s (stash stays ${blocked.consum.greater})`);
  else fail(`cooldown gate failed: cd=${cdState.cd} ok=${blocked.ok} stash ${cdState.consum.greater}->${blocked.consum.greater}`);

  // (6) EMPTY SLOT — select a 0-qty consumable and use it: denied, no effect.
  await page.evaluate(() => { window.__dev.clearConsumCD(); window.__dev.setConsum("fury", 0); window.__dev.selectConsum(0); });
  const emptyUse = await page.evaluate(() => window.__dev.useConsum());
  if (!emptyUse.ok && emptyUse.consum.fury === 0) pass("empty slot: use denied, stash unchanged (0)");
  else fail(`empty slot not denied: ${JSON.stringify(emptyUse)}`);

  // (7) keyboard path: the real [Q] key fires doConsumable() (binding wired).
  await page.evaluate(() => { window.__dev.clearConsumCD(); window.__dev.setConsum("greater", 1); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  const kHp0 = (await page.evaluate(() => window.__dev.consumState())).hp;
  await key(page, "KeyQ");
  await dwell(60);
  const kAfter = await page.evaluate(() => window.__dev.consumState());
  if (kAfter.hp > kHp0 && kAfter.consum.greater === 0) pass(`[Q] key used the consumable: hp ${kHp0} -> ${kAfter.hp}, stash greater -> 0`);
  else fail(`[Q] key did not use consumable: ${kHp0} -> ${kAfter.hp}, stash ${kAfter.consum.greater}`);

  // (8) perf under load + zero errors + screenshot
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("wolf", (i - 4) * 40, -90); });
  const fpsList = [];
  for (let i = 0; i < 4; i++) {
    await key(page, ["KeyD", "KeyS", "KeyA", "KeyW"][i]);
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; (performance.now() - t0 < 800) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
      requestAnimationFrame(tick);
    }));
    fpsList.push(fps);
  }
  const minFps = Math.min(...fpsList);
  log(`FPS samples: [${fpsList.join(", ")}]  min=${minFps}`);
  if (minFps >= 58) pass(`FPS held >= 58 (min ${minFps})`);
  else fail(`FPS dropped below 58: min ${minFps}`);

  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  if (errors.length === 0) pass("zero page errors");
  else { for (const e of errors) fail(e); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✓ CAS-192 consumables test passed." : "\n✗ CAS-192 consumables test FAILED.");
process.exit(ok ? 0 : 1);
