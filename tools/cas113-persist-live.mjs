// CAS-113: LIVE progression-persistence QA on the DEPLOYED build.
// Drives the real tender-bridge-504 iframe: enters play as a NON-default class,
// buys merchant upgrades + banks gold, forces a save, then RELOADS the live page
// and asserts class / gold / upgrades / derived COMBAT stats all survive. Then
// proves a corrupt save and a wrong-version save both start clean (no crash), and
// that the reset ("Nueva partida") path wipes the save. Proves persistence is
// SERVED live, not just on master.
// Run: node tools/cas113-persist-live.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function gameFrame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.replace("Digit", ""), bubbles: true })), code);

const errs = [];
let page;
function watch(p) {
  p.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
}

try {
  page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  watch(page);
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  let fr = await gameFrame(page);

  // Clean slate: any prior save from earlier runs would skip the menu.
  await fr.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} });
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);

  // Persistence hooks present on live?
  const hooks = await fr.evaluate(() => ["saveNow","hasSave","clearSave","resetGame","saveBlob"].every((k) => typeof window.__dev[k] === "function"));
  if (hooks) pass("live build exposes CAS-113 persistence hooks (saveNow/hasSave/clearSave/resetGame)");
  else { fail("live build MISSING persistence hooks — CAS-113 not served"); throw new Error("hooks absent"); }

  // ---- enter play as a NON-default class (paladin = Digit3) to prove class persists ----
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "PersistQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit3");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // ---- buy upgrades through the REAL merchant shop + bank gold ----
  await fr.evaluate(() => window.__dev.setGold(900));
  await fr.evaluate(() => window.__dev.merchantTP());
  await key(fr, "KeyE"); await sleep(150); await key(fr, "KeyE"); await key(fr, "KeyE"); await sleep(200);
  const inShop = await fr.evaluate(() => window.__dev.heroStats().scene === "shop");
  if (inShop) pass("opened live merchant shop");
  else fail("could not open live merchant shop");
  // buy Filo (dmg) x2, Vigor (hp) x1, Coraza (def) x1
  await fr.evaluate(() => { window.__dev.shopBuy(0); window.__dev.shopBuy(0); window.__dev.shopBuy(1); window.__dev.shopBuy(2); });
  await sleep(150);
  // back to play, force a save
  await key(fr, "Escape"); await sleep(150);
  const pre = await fr.evaluate(() => { const h = window.__dev.heroStats(); h.cls = window.__dev.hero()?.cls; window.__dev.saveNow(); return h; });
  const blobOk = await fr.evaluate(() => { try { return !!localStorage.getItem("mithralda.save.v1"); } catch { return false; } });
  console.log(`   pre-reload: cls=${pre.cls} gold=${pre.gold} dmg=${pre.dmg} def=${pre.def} maxHp=${pre.maxHp} upg=${JSON.stringify(pre.upg)}`);
  if (blobOk) pass("save blob written to live localStorage");
  else fail("no save blob in live localStorage after saveNow()");
  if (pre.upg && (pre.upg.dmg >= 2 && pre.upg.hp >= 1 && pre.upg.def >= 1)) pass(`upgrades applied pre-reload (dmg${pre.upg.dmg}/hp${pre.upg.hp}/def${pre.upg.def})`);
  else fail(`upgrades did not apply: ${JSON.stringify(pre.upg)}`);

  // ===================== AC1: RELOAD the live page =====================
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && (window.__dev.scene()==='play')", { timeout: 20000 }).catch(() => {});
  const post = await fr.evaluate(() => { const h = window.__dev.heroStats(); return { ...h, cls: window.__dev.hero()?.cls, scene: window.__dev.scene(), enemies: window.__dev.enemyCount() }; });
  console.log(`   post-reload: scene=${post.scene} cls=${post.cls} gold=${post.gold} dmg=${post.dmg} def=${post.def} maxHp=${post.maxHp} upg=${JSON.stringify(post.upg)}`);
  if (post.scene === "play") pass("AC4: reload rehydrated straight into play (skipped name/class)");
  else fail(`AC4: did not rehydrate into play (scene=${post.scene})`);
  const same = post.cls === pre.cls && post.gold === pre.gold && post.dmg === pre.dmg && post.def === pre.def && post.maxHp === pre.maxHp &&
    JSON.stringify(post.upg) === JSON.stringify(pre.upg);
  if (same) pass("AC1: class + gold + upgrades + derived COMBAT stats (dmg/def/maxHp) all survived the reload");
  else fail("AC1: state drifted across reload");
  if (post.enemies > 0) pass(`AC4: world live after rehydrate (enemies=${post.enemies})`);
  else fail("AC4: world not live after rehydrate");

  // ===================== AC2a: corrupt JSON save =====================
  // noSave() suppresses this live run's unload-flush so the injected bad blob
  // survives the reload (mirrors a FRESH boot finding a stale save — no active
  // session is re-writing over it). Same guard resetGame() uses.
  await fr.evaluate(() => { window.__dev.noSave(); try { localStorage.setItem("mithralda.save.v1", "{not valid json::"); } catch {} });
  errs.length = 0;
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 }).catch(() => {});
  const s2 = await fr.evaluate(() => window.__dev.scene());
  if (s2 === "menu" && errs.length === 0) pass("AC2a: corrupt save → clean menu, no crash, 0 page errors");
  else fail(`AC2a: corrupt save not handled cleanly (scene=${s2}, errs=${errs.length})`);

  // ===================== AC2b: wrong-version save =====================
  await fr.evaluate(() => { window.__dev.noSave(); try { localStorage.setItem("mithralda.save.v1", JSON.stringify({ version: 999, cls: "mage", gold: 5 })); } catch {} });
  errs.length = 0;
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 }).catch(() => {});
  const s3 = await fr.evaluate(() => window.__dev.scene());
  const cleared = await fr.evaluate(() => { try { return localStorage.getItem("mithralda.save.v1") === null; } catch { return false; } });
  if (s3 === "menu" && errs.length === 0) pass("AC2b: wrong-version save → clean menu, no crash, 0 page errors");
  else fail(`AC2b: wrong-version save not handled (scene=${s3}, errs=${errs.length})`);
  if (cleared) pass("AC2b: invalid save was discarded (localStorage cleared)");
  else fail("AC2b: invalid save not cleared");

  // ===================== AC3: reset wipes a real save =====================
  // make a fresh run + save, then clearSave (the resetGame path wipes the same key)
  await fr.evaluate(() => { document.getElementById("nameInput").value = "ResetQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await fr.evaluate(() => window.__dev.saveNow());
  const had = await fr.evaluate(() => window.__dev.hasSave());
  // The wired "Nueva partida" action is resetGame() = suppress + clear + reload.
  // noSave() arms the same suppress so the unload-flush can't re-write the save we
  // are wiping right before the reload; then clear it.
  await fr.evaluate(() => { window.__dev.noSave(); window.__dev.clearSave(); });
  const gone = await fr.evaluate(() => !window.__dev.hasSave());
  errs.length = 0;
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 }).catch(() => {});
  const s4 = await fr.evaluate(() => window.__dev.scene());
  if (had && gone && s4 === "menu" && errs.length === 0) pass("AC3: reset wiped the save → reload returns to the initial menu flow, no crash");
  else fail(`AC3: reset path failed (had=${had}, gone=${gone}, scene=${s4}, errs=${errs.length})`);

  await page.screenshot({ path: "tools/cas113-persist-live.png" });
} catch (e) {
  fail("exception: " + e.message);
} finally {
  if (errs.length) { console.error("PAGE ERRORS:\n" + errs.join("\n")); ok = false; }
  await browser.close();
}

console.log(ok ? "\n✓ CAS-113 LIVE persistence QA PASSED — progress survives a refresh on the deployed build; corrupt/old saves start clean; reset works."
  : "\n✗ CAS-113 LIVE persistence QA FAILED");
process.exit(ok ? 0 : 1);
