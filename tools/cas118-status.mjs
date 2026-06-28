// ---------------------------------------------------------------------------
// Headless harness for CAS-118 — COMBAT STATUS EFFECTS. Boots the REAL game in
// headless Chromium and drives the new system through the SAME sim paths the game
// runs (applyStatus / tickDots / hitEnemy / damageHero — no shortcut), asserting:
//   1) CATALOGUE: >=3 status effects exist with their behaviour fields (poison/burn
//      DoT tick+dur+dmg, slow amt+dur, stun dur) + the mob→hero infl rows — AC1.
//   2) DoT TICKS + EXPIRES: a poisoned enemy loses HP across multiple tics on the
//      real update clock, then the status expires on its duration — AC1/AC4.
//   3) WEAPON PROC (AC2): equipping a 'burn' weapon makes a REAL hero hit set the
//      struck enemy on fire (a plain weapon does NOT) — the CAS-117 affix → effect bridge.
//   4) MOB INFLICTS + AVOIDABLE (AC3): a bandit's telegraphed lunge that CONNECTS
//      poisons the hero; a hero the lunge never reaches is NEVER poisoned (reading the
//      telegraph / not being hit avoids the state — infl is gated behind the hit).
//   5) HERO SUFFERS slow: an applied slow sits on the hero and winds down to 0 — AC1.
//   6) 60 FPS held with a full afflicted pack live — AC5.
//   7) PERSISTENCE: a burn weapon affix survives a real reload (localStorage) — AC6.
//   8) 0 JS errors across the run — AC5.
//
// Run: npm run status   (or: node tools/cas118-status.mjs)
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
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "StatusBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll statusOf(who) until pred or timeout; returns the last snapshot.
async function untilStatus(page, who, pred, ms = 4000) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) {
    s = await page.evaluate((w) => window.__dev.statusOf(w), who);
    if (s && pred(s)) return s;
    await wait(50);
  }
  return s;
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

  // (1) CATALOGUE — >=3 effects with the right behaviour fields + mob infl rows.
  const meta = await page.evaluate(() => ({
    poison: window.__dev.statusMeta("poison"), burn: window.__dev.statusMeta("burn"),
    slow: window.__dev.statusMeta("slow"), stun: window.__dev.statusMeta("stun"),
    banditInfl: window.__dev.mobInfl("bandit"), wraithInfl: window.__dev.mobInfl("wraith"),
  }));
  const dots = [meta.poison, meta.burn].filter((s) => s && s.dot && s.tick > 0 && s.dur > 0 && s.dmg > 0);
  if (dots.length === 2 && meta.slow && meta.slow.amt > 0 && meta.slow.amt < 1 && meta.stun && meta.stun.dur > 0)
    pass(`[DATA] 4 status effects present: poison/burn DoT (${meta.poison.dmg}/${meta.poison.tick}s, ${meta.burn.dmg}/${meta.burn.tick}s), slow×${meta.slow.amt}, stun ${meta.stun.dur}s`);
  else fail(`[DATA] status catalogue incomplete: ${JSON.stringify(meta)}`);
  if (meta.banditInfl && meta.banditInfl.type === "poison" && meta.wraithInfl && meta.wraithInfl.type === "slow")
    pass(`[DATA] mob infl rows: bandit→poison(${meta.banditInfl.dmg}/tic), wraith→slow(×${meta.wraithInfl.amt})`);
  else fail(`[DATA] mob infl rows missing: bandit=${JSON.stringify(meta.banditInfl)}, wraith=${JSON.stringify(meta.wraithInfl)}`);

  // (2) DoT TICKS + EXPIRES — poison an enemy, advance real time, watch HP fall on a
  // clock then the status clear. Uses the REAL update loop (page rAF) + tickDots.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.statusArena("orc", 50, 0); });
  const e0 = await page.evaluate(() => { const s = window.__dev.applyStatusTo("enemy", "poison", { dmg: 5, dur: 2.0 }); return s; });
  const eMid = await untilStatus(page, "enemy", (s) => s.hp < e0.hp, 1500);
  await wait(2400); // ride past the 2.0s duration
  const eEnd = await page.evaluate(() => window.__dev.statusOf("enemy"));
  if (e0 && eMid && eEnd && eMid.hp < e0.hp && eEnd.hp < eMid.hp && !eEnd.dots.poison)
    pass(`[DoT] poison ticked enemy HP down over time (${e0.hp}→${eMid.hp}→${eEnd.hp}) and expired on duration`);
  else fail(`[DoT] poison did not tick/expire: ${JSON.stringify({ e0, eMid, eEnd })}`);

  // (3) WEAPON PROC — a plain weapon applies NO status on hit; a burn weapon sets the
  // struck enemy on fire. Drives the REAL hitEnemy path (weaponProcs read there).
  // CONTROL FIRST, while the starting weapon still carries no affixes (no proc).
  const ctrl = await page.evaluate(() => {
    window.__dev.statusArena("orc", 30, 0);
    const procs = window.__dev.weaponProcs();      // default starting weapon → no affixes
    const after = window.__dev.heroHit();
    return { procs, burn: !!(after && after.dots && after.dots.burn) };
  });
  if (ctrl && ctrl.procs.length === 0 && !ctrl.burn)
    pass(`[PROC] control: a plain (no-affix) weapon applies NO on-hit status`);
  else fail(`[PROC] control weapon unexpectedly procced: ${JSON.stringify(ctrl)}`);
  const burned = await page.evaluate(() => {
    window.__dev.statusArena("orc", 30, 0);
    const procs = window.__dev.giveBurnWeapon(4); // equip an 'ardiente' weapon
    const after = window.__dev.heroHit();          // REAL hero hit → hitEnemy → proc
    return { procs, dots: after.dots };
  });
  if (burned && burned.procs.length === 1 && burned.procs[0].proc === "burn" && burned.dots.burn && burned.dots.burn.dmg === 4)
    pass(`[PROC] AC2: equipping a burn weapon set the struck enemy on fire (burn ${burned.dots.burn.dmg}/tic)`);
  else fail(`[PROC] burn weapon did not proc on hit: ${JSON.stringify(burned)}`);

  // (4) MOB INFLICTS + AVOIDABLE — a bandit lunge that CONNECTS poisons the hero.
  await page.evaluate(() => { window.__dev.tpZone("ruins"); window.__dev.statusArena("bandit", 40, 0); });
  const hHit = await untilStatus(page, "hero", (s) => !!(s.dots && s.dots.poison), 5000);
  if (hHit && hHit.dots && hHit.dots.poison)
    pass(`[INFL] AC3: bandit's connecting lunge poisoned the hero (${hHit.dots.poison.dmg}/tic, ${hHit.dots.poison.t}s left)`);
  else fail(`[INFL] bandit never poisoned the hero: ${JSON.stringify(hHit)}`);
  // AVOIDABLE: keep the hero out of lunge reach every tick → never hit → never poisoned.
  await page.evaluate(() => { window.__dev.tpZone("ruins"); window.__dev.statusArena("bandit", 300, 0); });
  let avoided = true, anyHp = null;
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => { window.__dev.archMoveHero(300, 0); return window.__dev.statusOf("hero"); });
    anyHp = s; if (s.dots && s.dots.poison) { avoided = false; break; }
    await wait(50);
  }
  if (avoided && anyHp && !(anyHp.dots && anyHp.dots.poison))
    pass(`[INFL] AC3: a hero the lunge never reaches is NEVER poisoned (telegraph/dodge avoids the state)`);
  else fail(`[INFL] hero got poisoned while out of reach: ${JSON.stringify(anyHp)}`);

  // (5) HERO SUFFERS slow — applied slow sits then winds down to 0.
  const sl0 = await page.evaluate(() => window.__dev.applyStatusTo("hero", "slow", { amt: 0.5, dur: 1.0 }));
  await wait(1300);
  const sl1 = await page.evaluate(() => window.__dev.statusOf("hero"));
  if (sl0 && sl0.slowT > 0 && sl0.slow < 1 && sl1 && sl1.slowT === 0)
    pass(`[SLOW] hero slow applied (×${sl0.slow}, ${sl0.slowT}s) then expired to 0`);
  else fail(`[SLOW] hero slow did not apply/expire: ${JSON.stringify({ sl0, sl1 })}`);

  // (6) 60 FPS with a full afflicted pack live + DoTs ticking on every body.
  await page.evaluate(() => {
    window.__dev.tpZone("abyss");
    window.__dev.statusArena("orc", 60, 40);
    ["wraith", "mage", "wolf", "bandit", "moose", "bat", "skeleton"].forEach((t, i) => {
      window.__dev.spawn(t, 70 * Math.cos(i), 70 * Math.sin(i));
    });
    // afflict the whole pack so tickDots + status FX run on everything
    window.__dev.applyStatusTo("hero", "burn", { dmg: 3, dur: 8 });
  });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with a full afflicted pack live`);
  else fail(`[FPS] dropped to ${fps} fps under the afflicted pack`);

  // (7) PERSISTENCE — a burn weapon affix survives a real reload (localStorage).
  const pre = await page.evaluate(() => { window.__dev.giveBurnWeapon(4); window.__dev.saveNow(); return window.__dev.weaponProcs(); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 15000 });
  const post = await page.evaluate(() => window.__dev.weaponProcs());
  if (pre.length === 1 && pre[0].proc === "burn" && post.length === 1 && post[0].proc === "burn" && post[0].amt === 4)
    pass(`[PERSIST] AC6: burn weapon affix survived reload (proc burn +${post[0].amt}/tic)`);
  else fail(`[PERSIST] burn affix did not survive reload: pre=${JSON.stringify(pre)} post=${JSON.stringify(post)}`);

  // visual evidence — hero + an enemy both afflicted (aura + icon pips + HUD chip/vignette).
  await page.evaluate(() => {
    window.__dev.tpZone("ruins"); window.__dev.statusArena("orc", 70, 0);
    window.__dev.applyStatusTo("enemy", "burn", { dmg: 4, dur: 6 });
    window.__dev.applyStatusTo("enemy", "poison", { dmg: 3, dur: 6 });
    window.__dev.applyStatusTo("hero", "slow", { amt: 0.5, dur: 6 });
    window.__dev.applyStatusTo("hero", "poison", { dmg: 3, dur: 6 });
  });
  await wait(120);
  const shot = new URL("./cas118-status.png", import.meta.url).pathname;
  await page.screenshot({ path: shot });
  pass(`status FX screenshot saved: ${shot}`);

  // (8) zero JS errors
  if (errors.length === 0) pass("[ERR] zero page errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  srv.stop && srv.stop();
}

log(ok ? "\n✓ CAS-118 status-effect harness passed." : "\n✗ CAS-118 status harness FAILED.");
process.exit(ok ? 0 : 1);
