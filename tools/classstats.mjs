// ---------------------------------------------------------------------------
// Per-class BASE-STAT identity probe — CAS-100, Gameplay Evolution lane.
//
// Boots the real game headless and, for each of the 5 classes, calls the dev
// hook __dev.classStats(cls) — which builds a fresh level-1 hero through the REAL
// newHero path and reports its spawned base stats + projected level-10 pools.
// Asserts the classes are MEASURABLY distinct (not just differently skinned):
//   - every pair differs on >= 2 of {hp, mp, dmg, moveSpeed} at level 1
//   - the four base-stat axes each show real spread across the roster
//   - per-class growth makes the gap WIDEN by level 10 (archetypes diverge)
//   - basic-attack cooldown (atkCD) is the per-class "attack speed" axis
// Also screenshots the class-select screen (the stat bars the player sees).
//
// Run: npm run classstats
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const log = (m) => console.log(m);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const AXES = ["hp", "mp", "dmg", "moveSpeed"];

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.classStats", { timeout: 15000 });

  // menu -> class select -> play (a live hero must exist before classStats probes)
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "StatBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });

  // screenshot the class-select screen itself (the stat bars the player reads)
  await new Promise((r) => setTimeout(r, 200));
  const selShot = join(ROOT, "tools", "classstats-select.png");
  writeFileSync(selShot, await page.screenshot());
  log(`   ↳ class-select screenshot: ${selShot}`);

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  log("✔ entered play");

  const rows = {};
  for (const cls of CLASSES) {
    const s = await page.evaluate((c) => window.__dev.classStats(c), cls);
    if (!s) { fail(`${cls}: classStats returned null`); continue; }
    rows[cls] = s;
    log(`   ${cls.padEnd(8)} L1 hp=${String(s.hp).padStart(3)} mp=${String(s.mp).padStart(3)} dmg=${String(s.dmg).padStart(2)} spd=${String(s.moveSpeed).padStart(3)} atkCD=${s.atkCD}  |  L10 hp=${s.lvl10.hp} mp=${s.lvl10.mp} dmg=${s.lvl10.dmg}`);
  }
  const got = Object.keys(rows);
  if (got.length !== 5) fail(`expected 5 classes, got ${got.length}`);

  // (1) every pair differs on >= 2 axes at level 1
  for (let i = 0; i < got.length; i++) for (let j = i + 1; j < got.length; j++) {
    const a = rows[got[i]], b = rows[got[j]];
    const diffs = AXES.filter((k) => a[k] !== b[k]);
    if (diffs.length < 2) fail(`${got[i]} vs ${got[j]}: only differ on ${diffs.length} axis (${diffs.join(",")}) — not distinct enough`);
  }
  // (2) each axis shows real spread across the roster
  for (const k of AXES) {
    const vals = got.map((c) => rows[c][k]);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread <= 0) fail(`axis ${k}: no spread across classes (all ${vals[0]})`);
    else log(`✔ axis ${k}: spread ${Math.min(...vals)}..${Math.max(...vals)}`);
  }
  // (3) attack-speed axis (atkCD) varies too
  const cds = new Set(got.map((c) => rows[c].atkCD));
  if (cds.size < 2) fail(`atkCD identical across all classes (${[...cds]})`);
  else log(`✔ atkCD varies (${cds.size} distinct values)`);

  // (4) growth makes archetypes DIVERGE — the L10 hp spread must exceed L1 hp spread
  const l1hp = got.map((c) => rows[c].hp), l10hp = got.map((c) => rows[c].lvl10.hp);
  const s1 = Math.max(...l1hp) - Math.min(...l1hp), s10 = Math.max(...l10hp) - Math.min(...l10hp);
  if (s10 <= s1) fail(`hp gap does not widen with level (L1 spread ${s1} >= L10 spread ${s10})`);
  else log(`✔ classes diverge with level (hp spread ${s1} → ${s10} by L10)`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else log("✔ zero page errors");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (!ok) { console.error("\n✖ CLASS-STATS PROBE FAILED."); process.exit(1); }
console.log("\n✓ Class-stats probe passed: 5 classes with measurably distinct, diverging base stats.");
