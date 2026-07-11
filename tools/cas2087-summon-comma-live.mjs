// ---------------------------------------------------------------------------
// CAS-2087 — OBSERVABLE live proof that the Summon key-collision fix shipped.
// Bug (CAS-2085 R2): SUMMON.key === COMBO.heavyKey === "KeyN"; the play-scene dispatch runs the
// heavy handler (input.js:282) and `return`s BEFORE the summon handler (input.js:324), so on DESKTOP
// pressing N always fired a heavy swing and spawnSpirit() was unreachable for all 5 classes.
// Fix: SUMMON.key → "Comma" (only free code; 26 letters bound). Live build 4a9459a6ee34.
//
// This is byte-correct ≠ observable: we DRIVE the real live sim loop and press REAL keys.
//   1) In-page `import(BASE+"sim/sim.js")` returns the SAME ES-module singleton game.js is running,
//      so mod.G is the live world — we read G.hero.summonCharges and G._spirit directly.
//   2) Dispatch a real "Comma" keydown to window ⇒ input.js handler ⇒ sim.spawnSpirit():
//        G._spirit goes null→{hp>0} and summonCharges 2→1  ⇒ SUMMON REACHABLE on desktop keyboard.
//   3) Dispatch a real "KeyN" keydown ⇒ heavy swing starts (heroAnim().atk) and G._spirit / charges
//      are UNCHANGED ⇒ N is still the heavy attack, NOT summon (no regression).
//   4) Códice getter never lies: keyLabel(SUMMON.key)="," and keyLabel(COMBO.heavyKey)="N".
// Runs on desktop AND mobile viewports (PASS×2). Spirit COMBAT behavior (aggro-split / boss chip)
// is unchanged and was proven at ship in CAS-1957/CAS-1965; this fix only restores key reachability.
//
// Run: node tools/cas2087-summon-comma-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const UA_DESK = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const UA_MOB = "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

let fails = 0;
const ok = (c, m) => { console.log((c ? "  PASS " : "  FAIL ") + m); if (!c) fails++; };

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("no game frame");
}
async function cleanFrame(p) {
  let fr = await gameFrame(p);
  await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  if (await fr.evaluate(() => window.__dev.scene()) !== "menu") {
    await p.reload({ waitUntil: "load", timeout: 30000 }); fr = await gameFrame(p);
    await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  }
  return fr;
}
async function enterClass(fr, digit) {
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "CommaBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), digit);
  await fr.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await fr.evaluate(() => window.__dev.scene()) === "customize") {
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await fr.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await fr.evaluate(() => window.__dev.scene()) === "abilitysel")
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

// Bind the live sim singleton onto the page so we can read G / keyLabel / config.
async function bindSim(fr) {
  await fr.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__q = { G: sim.G, keyLabel: sim.keyLabel, SUMMON: cfg.SUMMON, COMBO: cfg.COMBO };
  }, BASE);
}
const key = (fr, code, k) => fr.evaluate((c, kk) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: kk, bubbles: true })), code, k);
const snap = (fr) => fr.evaluate(() => {
  const q = window.__q, h = q.G.hero, sp = q.G._spirit;
  return {
    scene: q.G.scene,
    summonKey: q.SUMMON.key, heavyKey: q.COMBO.heavyKey,
    summonEnabled: q.SUMMON.enabled, comboEnabled: q.COMBO.enabled,
    charges: h ? h.summonCharges : null,
    spiritHp: sp ? sp.hp : null, spiritAlive: !!(sp && sp.hp > 0),
    atk: h ? h.atkAnim > 0 : null,
    lblSummon: q.keyLabel(q.SUMMON.key), lblHeavy: q.keyLabel(q.COMBO.heavyKey),
  };
});

async function runEnv(name, ua, vp, digit, label) {
  console.log(`\n===== ${name} (${label}) =====`);
  const page = await browser.newPage();
  await page.setUserAgent(ua);
  await page.setViewport(vp);
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await cleanFrame(page);
  await enterClass(fr, digit);
  await bindSim(fr);

  const base = await snap(fr);
  ok(base.summonKey === "Comma", `[${name}] served SUMMON.key === "Comma" (got ${base.summonKey})`);
  ok(base.heavyKey === "KeyN" && base.summonKey !== base.heavyKey, `[${name}] no collision: heavy=${base.heavyKey} summon=${base.summonKey}`);
  ok(base.summonEnabled && base.comboEnabled, `[${name}] both live: SUMMON=${base.summonEnabled} COMBO=${base.comboEnabled}`);
  ok(base.lblSummon === "," && base.lblHeavy === "N", `[${name}] Códice getter honest: summon="${base.lblSummon}" heavy="${base.lblHeavy}"`);
  ok(base.spiritAlive === false, `[${name}] baseline: no spirit yet (charges=${base.charges})`);

  // (2) REAL "Comma" keydown ⇒ must invoke the spirit.
  const chargesBefore = base.charges;
  await key(fr, "Comma", ",");
  await sleep(120);
  const afterComma = await snap(fr);
  ok(afterComma.spiritAlive === true,
     `[${name}] pressing "," (Comma) INVOKED the spirit — G._spirit.hp=${afterComma.spiritHp} (was null) ⇒ SUMMON reachable on desktop keyboard`);
  ok(afterComma.charges === chargesBefore - 1,
     `[${name}] a summon charge was spent: ${chargesBefore} → ${afterComma.charges}`);

  // (3) REAL "KeyN" keydown ⇒ heavy swing, spirit/charges UNCHANGED (N is not summon).
  const chargesPreN = afterComma.charges;
  const spiritHpPreN = afterComma.spiritHp;
  await key(fr, "KeyN", "n");
  const afterN = await snap(fr);   // sampled immediately (atkAnim decays)
  ok(afterN.atk === true,
     `[${name}] pressing "N" started a HEAVY swing (heroAnim().atk=true) ⇒ N still routes to heavyAttack`);
  ok(afterN.charges === chargesPreN,
     `[${name}] "N" did NOT spend a summon charge (${chargesPreN} → ${afterN.charges}) ⇒ N is not summon`);
  ok(afterN.spiritAlive === true,
     `[${name}] the spirit stayed alive across the "N" press (hp ${spiritHpPreN} → ${afterN.spiritHp}) ⇒ N did not despawn/replace it`);

  await page.screenshot({ path: `tools/cas2087-summon-${label}.png` });
  await page.close();
}

try {
  // PASS×2: desktop + mobile. Warrior (Digit1) — a melee class that CAN heavy, so the N-vs-Comma
  // discrimination is maximally meaningful.
  await runEnv("DESKTOP", UA_DESK, { width: 1280, height: 720, deviceScaleFactor: 1 }, 1, "desktop");
  await runEnv("MOBILE",  UA_MOB,  { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 1, "mobile");
} catch (e) {
  console.error("HARNESS ERROR:", e.message, "\n", e.stack); fails++;
} finally { await browser.close(); }

console.log("\n" + (fails === 0 ? "===== ALL PASS (PASS×2 desktop+mobile) =====" : `===== ${fails} FAILURE(S) =====`));
process.exit(fails === 0 ? 0 : 1);
