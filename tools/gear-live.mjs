// ---------------------------------------------------------------------------
// CAS-27 — LIVE gear/progression loop probe (closes the equip-assert gap).
//
// playtest-live.mjs covers boot/class/move/combat/perf/blur/mobile but never
// asserted the gear loop (kill -> drop -> pickup -> equip -> +Daño) against the
// DEPLOYED build. CAS-29 (commit 1190023) landed data-driven gear; this drives
// that loop through the SAME __dev functions the game uses, inside the live
// Higgsfield iframe (#hf-frame). Read-only on the shared env (only throwaway
// enemies in the local client session). Prints JSON + exits non-zero on FAIL.
//
// Run: node tools/gear-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}

async function enterAs(fr, cls) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await gameFrame(page);
  await enterAs(fr, "warrior");

  // probe the gear __dev surface exists on the live build
  const api = await fr.evaluate(() => ["tpZone","seed","gear","spawnKill","pickup","bag","equipBag"]
    .reduce((o, k) => (o[k] = typeof window.__dev[k] === "function", o), {}));
  const apiOk = Object.values(api).every(Boolean);
  check("gear __dev API present on live build", apiOk, api);
  if (!apiOk) throw new Error("live build missing gear __dev hooks: " + JSON.stringify(api));

  // (1) starter gear resolves data-driven stats
  const start = await fr.evaluate(() => window.__dev.gear());
  check("starter gear resolves Daño/Defensa", start.dmg > 0 && start.def > 0, start);

  // (2)+(3) kill -> drop -> pickup in the caves (tier 2-3)
  const farm = await fr.evaluate(() => {
    window.__dev.tpZone("caves"); window.__dev.seed(1337);
    let gearDrops = 0;
    for (let i = 0; i < 60; i++) {
      const drops = window.__dev.spawnKill("orc");
      if (drops.some((d) => d.kind === "gear")) gearDrops++;
      window.__dev.pickup();
    }
    return { gearDrops, bag: window.__dev.bag().length };
  });
  check("kill -> drop -> pickup (60 caves kills)", farm.gearDrops > 0, farm);

  // (4) equip best looted upgrade -> combat totals rise
  const before = await fr.evaluate(() => window.__dev.gear());
  const equip = await fr.evaluate(() => {
    const bag = window.__dev.bag();
    const pickBest = (slot) => { let bi = -1, bv = -1; bag.forEach((b, i) => { if (b.slot === slot && b.stat > bv) { bv = b.stat; bi = i; } }); return bi; };
    for (const slot of ["weapon", "shield", "body"]) { const i = pickBest(slot); if (i >= 0) window.__dev.equipBag(i); }
    return window.__dev.gear();
  });
  const dmgUp = equip.dmg > before.dmg, defUp = equip.def > before.def;
  check("equip looted gear -> +Daño/+Defensa", dmgUp || defUp,
    { before: { dmg: before.dmg, def: before.def }, after: { dmg: equip.dmg, def: equip.def } });
  check("net progression vs run start", equip.dmg + equip.def > start.dmg + start.def,
    { startTotal: start.dmg + start.def, nowTotal: equip.dmg + equip.def });

  // (5) determinism: same seed => same gear drop sequence (Stage-2 server-ready)
  const det = await fr.evaluate(() => {
    const run = () => { window.__dev.tpZone("caves"); window.__dev.seed(2024); const seq = [];
      for (let i = 0; i < 25; i++) { const d = window.__dev.spawnKill("orc"); const g = d.find((x) => x.kind === "gear");
        seq.push(g ? `${g.slot}:${g.rarity}:${g.stat}` : "-"); window.__dev.pickup(); } return seq.join("|"); };
    return { a: run(), b: run() };
  });
  check("loot determinism (same seed => same drops)", det.a === det.b, { equal: det.a === det.b });

  await page.screenshot({ path: join(ROOT, "tools", "gear-live.png") });
} catch (e) {
  report.errors.push(`harness threw: ${e.message}`);
} finally {
  await browser.close();
}

report.pass = report.checks.length > 0 && report.checks.every((c) => c.ok) && report.errors.length === 0;
console.log("\n===GEAR_LIVE_JSON===");
console.log(JSON.stringify(report, null, 2));
console.log("===END_REPORT===");
process.exit(report.pass ? 0 : 1);
