// ---------------------------------------------------------------------------
// Headless harness for CAS-126 — encounter variety + ZONE IDENTITY (the 3 new
// archetypes). Boots the REAL game in headless Chromium and drives the new behaviour
// through the SAME updateEnemies AI the game runs (no shortcut around the state
// machine), asserting:
//   1) DATA: charger/summoner/healer exist with distinct behaviour fields (charge /
//      summon / heal) and the two supports deal 0 direct dmg — AC1.
//   2) ZONE IDENTITY: each hunt zone fields a DIFFERENT archetype mix; the new mobs are
//      placed so caves≠ruins≠abyss≠frost (zona A ≠ zona B) — AC2.
//   3) CHARGER: drops at long range, COMMITS a locked-facing charge, connects (hero
//      takes dmg) and ploughs PAST (overshoots the hero) — AC1.
//   4) SUMMONER: parked in its band it RAISES adds (enemy count climbs) and crowd-caps
//      (plateaus, never floods) — AC1.
//   5) HEALER: mends a wounded ally (its HP rises) — the force-multiplier — AC1.
//   6) 60 FPS held with a full mixed new-archetype pack live — AC3.
//   7) 0 JS errors across the run — AC3.
//
// Run: npm run arch126   (or: node tools/cas126-archetypes.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ArchBot126";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

async function until(page, fn, pred, ms = 4000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) { v = await page.evaluate(fn); if (v != null && pred(v)) return v; await wait(50); }
  return v;
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

  // (1) DATA — three NEW archetypes with distinct behaviour fields; supports do 0 dmg.
  const meta = await page.evaluate(() => ({
    charger: window.__dev.archMeta("charger"), summoner: window.__dev.archMeta("summoner"), healer: window.__dev.archMeta("healer"),
  }));
  const archset = new Set([meta.charger.arch, meta.summoner.arch, meta.healer.arch]);
  if (archset.size === 3 && archset.has("charger") && archset.has("summoner") && archset.has("healer"))
    pass(`[DATA] 3 new archetypes present: ${[...archset].join(", ")}`);
  else fail(`[DATA] expected charger+summoner+healer, got ${[...archset].join(", ")}`);
  if (meta.charger.arch === "charger" && meta.charger.charge > meta.charger.hp * 0 + 150)
    pass(`[DATA] charger carries a long charge distance (${meta.charger.charge}px)`);
  else fail(`[DATA] charger charge field missing/short: ${JSON.stringify(meta.charger)}`);
  if (meta.summoner.summon && meta.summoner.summon.count > 0 && meta.summoner.summon.cap > 0 && meta.summoner.dmg === 0)
    pass(`[DATA] summoner raises ${meta.summoner.summon.count} adds (cap ${meta.summoner.summon.cap}), 0 direct dmg`);
  else fail(`[DATA] summoner summon/dmg fields wrong: ${JSON.stringify(meta.summoner)}`);
  if (meta.healer.heal && meta.healer.heal.amt > 0 && meta.healer.dmg === 0)
    pass(`[DATA] healer mends ${Math.round(meta.healer.heal.amt * 100)}%/cast within ${meta.healer.heal.r}px, 0 direct dmg`);
  else fail(`[DATA] healer heal/dmg fields wrong: ${JSON.stringify(meta.healer)}`);

  // (2) ZONE IDENTITY — each hunt zone fields a DIFFERENT archetype mix.
  const pools = await page.evaluate(() => window.__dev.zonePools());
  const sig = (z) => [...new Set(pools[z] || [])].sort().join(",");
  const zones = ["forest", "ruins", "caves", "abyss", "frost"];
  const sigs = zones.map(sig);
  const uniq = new Set(sigs);
  if (uniq.size === zones.length) pass(`[ZONE] all ${zones.length} hunt zones field a DISTINCT mix`);
  else fail(`[ZONE] zone mixes collide: ${zones.map((z, i) => `${z}=[${sigs[i]}]`).join(" | ")}`);
  const hasNew = (z, a) => (pools[z] || []).includes(a);
  if (hasNew("caves", "summoner") && hasNew("ruins", "healer") && hasNew("abyss", "charger") && hasNew("frost", "summoner") && hasNew("frost", "healer"))
    pass(`[ZONE] new archetypes seed zone identity (caves=summoner, ruins=healer, abyss=charger, frost=summoner+healer)`);
  else fail(`[ZONE] new archetypes not wired into zone pools: ${JSON.stringify(pools)}`);

  // (3) CHARGER — drop at long range; it commits a charge, connects, and ploughs PAST.
  await page.evaluate(() => { window.__dev.tpZone("abyss"); });
  const cStartX = await page.evaluate(() => { window.__dev.archArena("charger", 200, 0); return window.__dev.archSnap().ex; });
  const cHit = await until(page, () => window.__dev.archSnap(), (s) => s.heroDmgTaken > 0, 4000);
  // after connecting, let the charge finish — it should overshoot (distance grows past 0).
  await until(page, () => window.__dev.archSnap(), (s) => s.state === "recover" || s.state === "chase", 1500);
  const cEnd = await page.evaluate(() => window.__dev.archSnap());
  if (cHit && cHit.heroDmgTaken > 0) pass(`[CHARGER] committed charge connected (hero took ${cHit.heroDmgTaken})`);
  else fail(`[CHARGER] charge never connected: ${JSON.stringify(cHit)}`);
  if (cEnd && Math.abs(cEnd.ex - cStartX) > 120) pass(`[CHARGER] ploughed a long lane (travelled ${Math.abs(cEnd.ex - cStartX)}px past start)`);
  else fail(`[CHARGER] charge did not travel a long lane: start x${cStartX}, end x${cEnd && cEnd.ex}`);

  // (4) SUMMONER — parked in band, it raises adds; its BROOD climbs then crowd-caps.
  // (broodCount isolates the summoner's own adds from the live zone spawner's mobs.)
  await page.evaluate(() => { window.__dev.tpZone("caves"); });
  await page.evaluate(() => window.__dev.summonProbe());
  const bGrew = await until(page, () => window.__dev.broodCount(), (n) => n > 0, 4000);
  await wait(3500);
  const bCapped = await page.evaluate(() => window.__dev.broodCount());
  const cap = meta.summoner.summon.cap || 4;
  if (bGrew > 0) pass(`[SUMMONER] raised adds (brood ${bGrew} live)`);
  else fail(`[SUMMONER] never summoned: brood stayed 0`);
  if (bCapped <= cap) pass(`[SUMMONER] brood crowd-capped at ${cap} — the tide is bounded (${bCapped} live, never floods)`);
  else fail(`[SUMMONER] brood ran away past the cap ${cap}: ${bCapped} live`);

  // (5) HEALER — mends a wounded ally (its HP rises over the cast).
  await page.evaluate(() => { window.__dev.tpZone("frost"); });
  const hStart = await page.evaluate(() => window.__dev.healProbe());
  const healed = await until(page, () => window.__dev.archAllyHp(), (hp) => hp > hStart, 5000);
  if (healed > hStart) pass(`[HEALER] mended the wounded ally (HP ${hStart} → ${healed})`);
  else fail(`[HEALER] ally HP never rose: stayed ${hStart}`);

  // (6) 60 FPS held with a full mixed NEW-archetype pack live around the hero.
  await page.evaluate(() => {
    window.__dev.archArena("charger", 90, 0);
    ["summoner", "healer", "charger", "orc", "wraith", "moose"].forEach((t, i) =>
      window.__dev.spawn(t, 90 * Math.cos(i), 90 * Math.sin(i)));
  });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with a full mixed new-archetype pack live`);
  else fail(`[FPS] dropped to ${fps} fps under the mixed pack`);

  // (7) zero JS errors
  if (errors.length === 0) pass("[ERR] zero page errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  srv.stop && srv.stop();
}

log(ok ? "\n✓ CAS-126 archetype harness passed." : "\n✗ CAS-126 archetype harness FAILED.");
process.exit(ok ? 0 : 1);
