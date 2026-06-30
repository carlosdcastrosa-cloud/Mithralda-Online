// ---------------------------------------------------------------------------
// CAS-317 — LIVE self-check for the dracónic Stage-1 BOSS (board CAS-310, art
// CAS-313). Proves the board HARD requirement: ALL 6 animations are wired and
// actually FIRE in gameplay, the boss is enfrentable + muere, and the build is
// clean (0 page errors, strips load 200).
//
//   [1] STRIPS LOAD — all 6 dragon_{idle,walk,attack1,attack2,hurt,death}_strip.png
//       served 200 (no 404 → no blank boss).
//   [2] BOSS SPAWNS — __dev.spawn("dragon") → isBoss, sprite "dragon", label
//       "DRAGÓN ANCESTRAL", ~820 hp. Reads bigger/imposing.
//   [3] STATES FIRE — over a live encounter the boss cycles idle, walk, attack1,
//       attack2 (the telegraphed heavy/combo = specialNow) AND hurt (on a hit).
//   [4] DEATH + CORPSE — kill the boss → it leaves G.enemies and a death-anim
//       corpse appears (plays the death strip, holds the collapsed frame).
//   [5] CLEAN — 60fps soak, zero page errors.
//
// Run (local): node tools/cas317-dragon-live.mjs
// Run (live):  node tools/cas317-dragon-live.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const LIVE = (process.argv[2] || "").replace(/\/$/, "");
const srv = LIVE ? null : await startServer();
const BASE = LIVE || srv.url;
if (LIVE) log(`… testing LIVE ${BASE}`); else log(`… testing LOCAL ${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const STRIP_KEYS = ["idle", "walk", "attack1", "attack2", "hurt", "death"];
const stripSeen = new Set();

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => {
    const u = r.url(), s = r.status();
    const m = u.match(/dragon_(\w+)_strip\.png/);
    if (m && s === 200) stripSeen.add(m[1]);
    if (s >= 400 && !/favicon/.test(u)) errors.push(`http ${s}: ${u}`);
  });

  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.bringToFront();
  const buildId = await page.evaluate(() => (window.__BUILD || (window.__dev && window.__dev.buildId && window.__dev.buildId()) || null)).catch(() => null);
  log(`   build=${buildId || "?"}`);

  // ---- boot to play (warrior) ----------------------------------------------
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i=document.getElementById("nameInput"); if(i) i.value="Cas317"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // tanky hero so the encounter runs to completion; no damage boost yet (observe attacks)
  await page.evaluate(() => { window.__dev.setUpg(0, 9000, 800); });

  // ---- spawn the dracónic boss ---------------------------------------------
  await page.evaluate(() => window.__dev.spawn("dragon", 90, 0));
  await sleep(150);
  const info = await page.evaluate(() => window.__dev.bossAnim());
  if (info && info.boss && info.boss.sprite === "dragon" && info.boss.label === "DRAGÓN ANCESTRAL" && info.boss.maxHp >= 600) {
    pass(`boss spawned: ${info.boss.label} sprite=${info.boss.sprite} hp=${info.boss.maxHp}`);
  } else fail(`boss spawn wrong: ${JSON.stringify(info)}`);

  // ---- Phase A: observe natural state cycling (idle/walk/attack1/attack2/hurt) ----
  // Bounded light hits (cap well under the boss's 820hp) so it SURVIVES this phase and we
  // see the full attack cadence; each hit drives the HURT flinch.
  const states = new Set();
  const tA = Date.now();
  while (Date.now() - tA < 13000) {
    const s = await page.evaluate(() => {
      window.__dev.setHeroHp(9000);                       // keep hero alive
      const b = window.__dev.bossAnim();
      // only chip while the boss is healthy (cap ~halfway) so it never dies in phase A
      if (b.boss && b.boss.hp > b.boss.maxHp * 0.5 && Math.random() < 0.3) window.__dev.hitBoss(25);
      return b;
    });
    if (s && s.boss) states.add(s.boss.animState);
    await sleep(120);
  }
  const want = ["idle", "walk", "attack1", "attack2", "hurt"];
  for (const st of want) {
    if (states.has(st)) pass(`state fired: ${st}`);
    else fail(`state NEVER fired: ${st} (saw ${[...states].join(",") || "none"})`);
  }

  // ---- Phase B: kill the boss → death corpse --------------------------------
  // The lethal hitBoss() returns the post-kill state (dead + corpses) in the SAME tick the
  // corpse is spawned, so we capture it before the ~2.6s corpse life elapses.
  const lethal = await page.evaluate(() => { window.__dev.setHeroHp(9000); return window.__dev.hitBoss(2000); });
  const killed = !!(lethal && lethal.dead);
  let corpses = lethal ? lethal.corpses : 0;
  await sleep(250); // let the death strip start playing
  const post = await page.evaluate(() => window.__dev.bossAnim());
  corpses = Math.max(corpses, post ? post.corpses : 0);
  const bossGone = !(post && post.boss);
  await page.screenshot({ path: "/tmp/cas317-death.png" });
  killed && bossGone;
  if (killed && bossGone) pass("boss died (left G.enemies — enfrentable y muere)");
  else fail(`boss did not die cleanly: ${JSON.stringify(lethal)}`);
  if (corpses > 0) pass(`death corpse spawned (corpses=${corpses}) → death anim plays`);
  else fail("no death corpse appeared (death strip would not play)");

  // ---- strips loaded? -------------------------------------------------------
  for (const k of STRIP_KEYS) {
    if (stripSeen.has(k)) pass(`strip 200: dragon_${k}_strip.png`);
    else fail(`strip MISSING (never 200): dragon_${k}_strip.png`);
  }

  // ---- fps soak -------------------------------------------------------------
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { function f(){ n++; if (performance.now()-t0 < 1000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    return n;
  });
  if (fps >= 50) pass(`fps soak ~${fps}`); else fail(`low fps ${fps}`);

  if (errors.length === 0) pass("zero page errors");
  else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

log(`\nshots: /tmp/cas317-death.png`);
log(ok ? "\n✓ CAS-317 dragon boss: ALL 6 anims wired + boss enfrentable/muere + clean." : "\n✖ CAS-317 dragon boss: FAILED.");
process.exit(ok ? 0 : 1);
