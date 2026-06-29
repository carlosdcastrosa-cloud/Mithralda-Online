// ---------------------------------------------------------------------------
// CAS-192 — LIVE QA of the data-driven combat consumables on the deployed
// build, served on the BACKUP host (GitHub Pages, SUBPATH /Mithralda-Online/).
//
// Unlike tools/cas192-consumables.mjs (which boots the LOCAL repo), this probe
// drives the REAL deployed bytes the player gets. The backup host serves the
// game DIRECTLY on the page (no #hf-frame iframe), so __dev lives on the top
// window. We verify the full consumable loop end-to-end through shipped code:
//   buy in merchant (gold sink) -> FURIA shortens real swing cadence + expires ->
//   ANTÍDOTO purges a real CAS-118 DoT+slow -> POCIÓN MAYOR scaled heal ->
//   per-consumable cooldown gate -> empty-slot gate -> [Q] keybinding fires it ->
//   live HUD slot readable -> ~60fps -> 0 JS errors.
//
// Run: node tools/cas192-consumables-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASEURL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const URL = `${BASEURL}/index.html?dev`;
const EXPECT_BUILD = "3210de07c8b5";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps) => Math.abs(a - b) <= (eps ?? 0.5);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, cls = "Digit1", name = "QA192") {
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','classsel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc === "play") { try { await page.evaluate(() => window.__dev.newGame && window.__dev.newGame()); } catch (e) {} }
  await page.waitForFunction("window.__dev.scene() === 'menu' || window.__dev.scene() === 'classsel' || window.__dev.scene() === 'play'", { timeout: 5000 });
  let s = await page.evaluate(() => window.__dev.scene());
  if (s === "menu") {
    await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
    s = "classsel";
  }
  if (s === "classsel") {
    await key(page, cls);
    await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  }
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  let faviconRoot404 = false;
  const httpErr = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => {
    if (r.status() < 400) return;
    if (/\/favicon\.ico(\?|$)/.test(r.url()) || /\/og\//.test(r.url())) { faviconRoot404 = true; return; }
    httpErr.push(`http ${r.status()}: ${r.url()}`);
  });

  // ---- (1) BOOT / LOAD on the deployed build ----------------------------
  const resp = await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  const status = resp ? resp.status() : 0;
  (status === 200) ? pass(`boot: HTTP ${status} on backup host`) : fail(`boot HTTP ${status}`);
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  const liveBuild = await page.evaluate(() => window.__BUILD);
  (liveBuild === EXPECT_BUILD) ? pass(`live build == ${EXPECT_BUILD} (consumables build)`) : fail(`live build ${liveBuild} != ${EXPECT_BUILD}`);
  // the consumable code must actually be present in the deployed bytes.
  const hooks = await page.evaluate(() => {
    const d = window.__dev || {};
    return ["consumState", "shopList", "shopBuy", "useConsum", "selectConsum", "setConsum", "atkCadence", "applyStatusTo"].filter((k) => typeof d[k] === "function");
  });
  (hooks.length === 8) ? pass(`consumable dev hooks present on deployed build (${hooks.length}/8)`) : fail(`missing consumable hooks: have ${JSON.stringify(hooks)}`);

  await enterPlay(page);
  const hero = await page.evaluate(() => window.__dev.hero());
  (hero && hero.cls) ? pass(`entered play as '${hero.cls}'`) : fail("could not enter play");

  // ---- (2) MERCHANT GOLD SINK (buy all 3 consumables) -------------------
  await page.evaluate(() => window.__dev.merchantTP());
  await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'dialogue'", { timeout: 3000 }).catch(() => {});
  await sleep(250); await key(page, "KeyE"); await sleep(150); await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'shop'", { timeout: 3000 }).catch(() => {});
  await page.evaluate(() => window.__dev.setGold(1000));
  const before = await page.evaluate(() => window.__dev.consumState());
  const g0 = (await page.evaluate(() => window.__dev.heroStats())).gold;
  const list = await page.evaluate(() => window.__dev.shopList());
  const idxFury = list.findIndex((i) => /[Ff]uria/.test(i.name));
  const idxAnti = list.findIndex((i) => /Antídoto/.test(i.name));
  const idxMayor = list.findIndex((i) => /mayor/.test(i.name));
  (idxFury >= 0 && idxAnti >= 0 && idxMayor >= 0)
    ? pass(`merchant stocks 3 consumables (furia@${idxFury} ${list[idxFury].price}g · antídoto@${idxAnti} ${list[idxAnti].price}g · mayor@${idxMayor} ${list[idxMayor].price}g)`)
    : fail(`consumables not stocked in shop: fury=${idxFury} anti=${idxAnti} mayor=${idxMayor}`);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxFury);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxAnti);
  await page.evaluate((i) => window.__dev.shopBuy(i), idxMayor);
  const afterBuy = await page.evaluate(() => window.__dev.consumState());
  const g1 = (await page.evaluate(() => window.__dev.heroStats())).gold;
  const spend = list[idxFury].price + list[idxAnti].price + list[idxMayor].price;
  (afterBuy.consum.fury === before.consum.fury + 1 && afterBuy.consum.antidote === before.consum.antidote + 1 && afterBuy.consum.greater === before.consum.greater + 1)
    ? pass(`buying +1 each: stash ${JSON.stringify(before.consum)} -> ${JSON.stringify(afterBuy.consum)}`)
    : fail(`stash did not increment on buy: ${JSON.stringify(afterBuy.consum)}`);
  (g1 === g0 - spend) ? pass(`gold sink: ${g0} -> ${g1} (-${spend})`) : fail(`gold not debited: ${g0} -> ${g1}, expected -${spend}`);
  await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 3000 }).catch(() => {});

  // ---- (3) FURIA — real swing cadence speeds up, then buff expires ------
  await page.evaluate(() => { window.__dev.setConsum("fury", 2); window.__dev.selectConsum(0); });
  const baseCad = await page.evaluate(() => window.__dev.atkCadence());
  const useFury = await page.evaluate(() => window.__dev.useConsum());
  const buffCad = await page.evaluate(() => window.__dev.atkCadence());
  (useFury.ok && useFury.atkspdBuffT > 0) ? pass(`furia used: buff timer ${useFury.atkspdBuffT}s, stash fury -> ${useFury.consum.fury}`) : fail(`furia use failed: ${JSON.stringify(useFury)}`);
  (buffCad < baseCad - 1e-4) ? pass(`furia shortens swing cadence: ${baseCad}s -> ${buffCad}s (faster attacks)`) : fail(`furia did not speed attacks: base ${baseCad} buffed ${buffCad}`);
  await sleep(6500);
  const afterCad = await page.evaluate(() => window.__dev.atkCadence());
  const afterFury = await page.evaluate(() => window.__dev.consumState());
  (near(afterCad, baseCad, 1e-3) && afterFury.atkspdBuffT === 0) ? pass(`furia buff expired: cadence back to ${afterCad}s (timer 0)`) : fail(`furia buff did not expire: cadence ${afterCad} (base ${baseCad}), timer ${afterFury.atkspdBuffT}`);

  // ---- (4) ANTÍDOTO — purge a real CAS-118 DoT + slow -------------------
  await page.evaluate(() => {
    window.__dev.setConsum("antidote", 2); window.__dev.selectConsum(1);
    window.__dev.applyStatusTo("hero", "poison", { dmg: 3 });
    window.__dev.applyStatusTo("hero", "slow", {});
  });
  const sick = await page.evaluate(() => window.__dev.consumState());
  (sick.dots.includes("poison") && sick.slowT > 0) ? pass(`hero afflicted: dots=${JSON.stringify(sick.dots)} slowT=${sick.slowT}`) : fail(`could not afflict hero: ${JSON.stringify(sick)}`);
  const cured = await page.evaluate(() => window.__dev.useConsum());
  (cured.ok && cured.dots.length === 0 && cured.slowT === 0) ? pass(`antídoto purged: dots=[] slowT=0, stash antidote -> ${cured.consum.antidote}`) : fail(`antídoto did not purge: ${JSON.stringify(cured)}`);

  // ---- (5) POCIÓN MAYOR — scaled heal (~60% of max hp) -----------------
  const maxHp = (await page.evaluate(() => window.__dev.consumState())).maxHp;
  await page.evaluate(() => { window.__dev.setConsum("greater", 2); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  const lowHp = (await page.evaluate(() => window.__dev.consumState())).hp;
  const healed = await page.evaluate(() => window.__dev.useConsum());
  const expectHeal = Math.round(maxHp * 0.6);
  (healed.ok && near(healed.hp - lowHp, expectHeal, 2)) ? pass(`poción mayor healed ${lowHp} -> ${healed.hp} (+${healed.hp - lowHp} ≈ 60% of ${maxHp})`) : fail(`poción mayor heal wrong: ${lowHp} -> ${healed.hp}, expected +~${expectHeal}`);

  // ---- (6) per-consumable COOLDOWN gate --------------------------------
  await page.evaluate(() => { window.__dev.setConsum("greater", 2); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  await page.evaluate(() => window.__dev.useConsum());
  const cdState = await page.evaluate(() => window.__dev.consumState());
  const blocked = await page.evaluate(() => window.__dev.useConsum());
  (cdState.cd > 0 && !blocked.ok && blocked.consum.greater === cdState.consum.greater) ? pass(`cooldown gate: re-use denied while cd=${cdState.cd}s (stash stays ${blocked.consum.greater})`) : fail(`cooldown gate failed: cd=${cdState.cd} ok=${blocked.ok}`);

  // ---- (7) EMPTY-SLOT gate ---------------------------------------------
  await page.evaluate(() => { window.__dev.clearConsumCD(); window.__dev.setConsum("fury", 0); window.__dev.selectConsum(0); });
  const emptyUse = await page.evaluate(() => window.__dev.useConsum());
  (!emptyUse.ok && emptyUse.consum.fury === 0) ? pass("empty slot: use denied, stash unchanged (0)") : fail(`empty slot not denied: ${JSON.stringify(emptyUse)}`);

  // ---- (8) [Q] KEYBINDING fires the consumable (real player input) ------
  await page.evaluate(() => { window.__dev.clearConsumCD(); window.__dev.setConsum("greater", 1); window.__dev.selectConsum(2); window.__dev.setHeroHp(1); });
  const kHp0 = (await page.evaluate(() => window.__dev.consumState())).hp;
  await key(page, "KeyQ");
  await sleep(80);
  const kAfter = await page.evaluate(() => window.__dev.consumState());
  (kAfter.hp > kHp0 && kAfter.consum.greater === 0) ? pass(`[Q] key used the consumable: hp ${kHp0} -> ${kAfter.hp}, stash greater -> 0`) : fail(`[Q] key did not use consumable: ${kHp0} -> ${kAfter.hp}, stash ${kAfter.consum.greater}`);

  // ---- (9) LEGIBILITY — live fury buff visible while active -------------
  await page.evaluate(() => { window.__dev.clearConsumCD(); window.__dev.setConsum("fury", 1); window.__dev.selectConsum(0); window.__dev.useConsum(); });
  const buffView = await page.evaluate(() => { const s = window.__dev.consumState(); return { t: s.atkspdBuffT }; });
  (buffView.t > 0) ? pass(`legibility: active fury buff exposes live duration (${buffView.t}s) for HUD bar`) : fail("fury buff not readable for HUD");

  // ---- (10) PERF + screenshot of the HUD slot --------------------------
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("wolf", (i - 4) * 40, -90); });
  await key(page, "KeyD"); await sleep(800);
  const fpsTxt = await page.evaluate(() => (document.getElementById("dev").textContent || "").trim());
  const fps = parseInt(fpsTxt, 10);
  (fps >= 55) ? pass(`perf: ${fps} fps under load (dev HUD)`) : fail(`perf low: ${fps} fps`);
  await page.screenshot({ path: join(ROOT, "tools", "cas192-consumables-live.png") });
  pass("screenshot saved: tools/cas192-consumables-live.png");

  if (faviconRoot404) log("  ⚠ NOTE (sev-4 cosmetic): /favicon.ico or /og root probe 404 — pre-existing, no gameplay impact (CAS-183/188)");
  (httpErr.length === 0) ? pass("no 4xx/5xx for any game module/asset") : fail(`network errors:\n  ${httpErr.join("\n  ")}`);
  (errors.length === 0) ? pass("zero page/console errors across full live session") : fail(`page errors:\n  ${errors.join("\n  ")}`);
} catch (e) {
  fail(`exception: ${e && e.stack || e}`);
} finally {
  await browser.close();
}

log(ok ? "\n✔ CAS-192 consumables LIVE QA PASS" : "\n✖ CAS-192 consumables LIVE QA FAIL");
process.exit(ok ? 0 : 1);
