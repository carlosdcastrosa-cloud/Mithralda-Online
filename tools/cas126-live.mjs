// ---------------------------------------------------------------------------
// TRUE-LIVE QA probe for CAS-126 — hits the deployed build at tender-bridge-504
// (not a local server) and verifies the 3 new archetypes + zone identity behave
// on the shipped bundle, captures a telegraph screenshot, asserts 0 JS errors.
// Mirrors tools/cas126-archetypes.mjs assertions against the LIVE URL.
// Run: node tools/cas126-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await wait(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterPlay(fr) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QALive126";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
async function until(fr, fn, pred, ms = 4000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) { v = await fr.evaluate(fn); if (v != null && pred(v)) return v; await wait(50); }
  return v;
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  log(`→ loading LIVE ${LIVE}`);
  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);
  const build = await fr.evaluate(async () => { try { const r = await fetch("/version.json", { cache: "no-store" }); return await r.json(); } catch (e) { return null; } });
  log(`   live build = ${JSON.stringify(build)}`);
  await enterPlay(fr);
  pass("entered play on LIVE build as 'warrior'");

  // DATA — 3 new archetypes present with distinct behaviour fields; supports 0 dmg.
  const meta = await fr.evaluate(() => ({
    charger: window.__dev.archMeta("charger"), summoner: window.__dev.archMeta("summoner"), healer: window.__dev.archMeta("healer"),
  }));
  const archset = new Set([meta.charger.arch, meta.summoner.arch, meta.healer.arch]);
  if (archset.size === 3 && archset.has("charger") && archset.has("summoner") && archset.has("healer"))
    pass(`[DATA] 3 new archetypes live: ${[...archset].join(", ")}`);
  else fail(`[DATA] expected charger+summoner+healer, got ${[...archset].join(", ")}`);
  if (meta.summoner.dmg === 0 && meta.healer.dmg === 0) pass(`[DATA] supports deal 0 direct dmg (summoner/healer = multipliers, not outliers)`);
  else fail(`[DATA] supports should be 0-dmg: summoner=${meta.summoner.dmg} healer=${meta.healer.dmg}`);

  // ZONE IDENTITY — each hunt zone fields a DISTINCT mix.
  const pools = await fr.evaluate(() => window.__dev.zonePools());
  const sig = (z) => [...new Set(pools[z] || [])].sort().join(",");
  const zones = ["forest", "ruins", "caves", "abyss", "frost"];
  const sigs = zones.map(sig);
  if (new Set(sigs).size === zones.length) pass(`[ZONE] all 5 hunt zones field a DISTINCT mix`);
  else fail(`[ZONE] zone mixes collide: ${zones.map((z, i) => `${z}=[${sigs[i]}]`).join(" | ")}`);
  const hasNew = (z, a) => (pools[z] || []).includes(a);
  if (hasNew("caves", "summoner") && hasNew("ruins", "healer") && hasNew("abyss", "charger") && hasNew("frost", "summoner") && hasNew("frost", "healer"))
    pass(`[ZONE] new archetypes seed identity (caves=summoner, ruins=healer, abyss=charger, frost=summoner+healer)`);
  else fail(`[ZONE] new archetypes not wired into zone pools: ${JSON.stringify(pools)}`);

  // CHARGER — commits a charge, connects, ploughs PAST (screenshot the lane telegraph).
  await fr.evaluate(() => { window.__dev.tpZone("abyss"); });
  const cStartX = await fr.evaluate(() => { window.__dev.archArena("charger", 220, 0); return window.__dev.archSnap().ex; });
  await until(fr, () => window.__dev.archSnap(), (s) => s.state === "windup" || s.state === "charge" || s.state === "strike", 3000);
  await page.screenshot({ path: "tools/cas126-live-charger.png" });
  const cHit = await until(fr, () => window.__dev.archSnap(), (s) => s.heroDmgTaken > 0, 4000);
  await until(fr, () => window.__dev.archSnap(), (s) => s.state === "recover" || s.state === "chase", 1500);
  const cEnd = await fr.evaluate(() => window.__dev.archSnap());
  if (cHit && cHit.heroDmgTaken > 0) pass(`[CHARGER] committed charge connected (hero took ${cHit.heroDmgTaken})`);
  else fail(`[CHARGER] charge never connected: ${JSON.stringify(cHit)}`);
  if (cEnd && Math.abs(cEnd.ex - cStartX) > 120) pass(`[CHARGER] ploughed a long lane (${Math.abs(cEnd.ex - cStartX)}px past start)`);
  else fail(`[CHARGER] charge did not travel a lane: start ${cStartX}, end ${cEnd && cEnd.ex}`);

  // SUMMONER — raises adds then crowd-caps.
  await fr.evaluate(() => { window.__dev.tpZone("caves"); });
  await fr.evaluate(() => window.__dev.summonProbe());
  const bGrew = await until(fr, () => window.__dev.broodCount(), (n) => n > 0, 4000);
  await page.screenshot({ path: "tools/cas126-live-summoner.png" });
  await wait(3500);
  const bCapped = await fr.evaluate(() => window.__dev.broodCount());
  const cap = meta.summoner.summon.cap || 4;
  if (bGrew > 0) pass(`[SUMMONER] raised adds (brood ${bGrew} live)`);
  else fail(`[SUMMONER] never summoned`);
  if (bCapped <= cap) pass(`[SUMMONER] brood crowd-capped at ${cap} (${bCapped} live, never floods)`);
  else fail(`[SUMMONER] brood ran past cap ${cap}: ${bCapped}`);

  // HEALER — mends a wounded ally.
  await fr.evaluate(() => { window.__dev.tpZone("frost"); });
  const hStart = await fr.evaluate(() => window.__dev.healProbe());
  const healed = await until(fr, () => window.__dev.archAllyHp(), (hp) => hp > hStart, 5000);
  if (healed > hStart) pass(`[HEALER] mended the wounded ally (HP ${hStart} → ${healed})`);
  else fail(`[HEALER] ally HP never rose: stayed ${hStart}`);

  // FPS under a dense mixed new-archetype pack.
  await fr.evaluate(() => {
    window.__dev.archArena("charger", 90, 0);
    ["summoner", "healer", "charger", "orc", "wraith", "moose"].forEach((t, i) =>
      window.__dev.spawn(t, 90 * Math.cos(i), 90 * Math.sin(i)));
  });
  const fps = await fr.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps on LIVE under a dense mixed pack`);
  else fail(`[FPS] dropped to ${fps} fps`);

  if (errors.length === 0) pass("[ERR] zero JS errors across the LIVE run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
}
log(ok ? "\n✓ CAS-126 LIVE probe passed." : "\n✗ CAS-126 LIVE probe FAILED.");
process.exit(ok ? 0 : 1);
