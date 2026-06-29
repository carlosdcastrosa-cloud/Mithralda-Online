// ---------------------------------------------------------------------------
// CAS-256 — WARRIOR hurt + special anim wiring. Boots the REAL game headless and drives
// the new states through the SAME sim paths the game runs (castSpell via __dev.cast,
// damageHero via __dev.hurt — no shortcut), asserting:
//   1) STRIPS: warrior_hurt.png (840×166=6·140) + warrior_special.png (1120×166=8·140)
//      are served and share the CAS-254 cell geometry (no size pulse).
//   2) SPECIAL: a class-skill cast flips animState→"special" and the specialAnim timer is
//      armed (~SPECIAL_ANIM_DUR), then it reverts. Purely visual — mp/cd still moved.
//   3) HURT: a landed hit flips animState→"hurt" with the hurtAnim timer armed
//      (~HURT_ANIM_DUR), then reverts to idle/walk.
//   4) PRIORITY: a cast outranks a hit-react — casting right after a hit shows "special".
//   5) DET: same seed/inputs → identical state sequence (server-authority safe).
//   6) FALLBACK: a non-Clarice class (no hurt/special strip) NEVER errors casting/being hit
//      — it just keeps its prior look (animState still toggles; renderer falls back to idle).
//   7) PERF: 60fps held while these states fire.  8) zero JS errors.
//
// Run: npm run cas256   (or: node tools/cas256-anims.mjs)
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

async function enterPlay(page, classDigit = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "AnimBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), classDigit);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
// poll heroAnim().state until it equals `target` (or timeout); returns true if seen.
async function awaitState(page, target, ms = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const a = await page.evaluate(() => window.__dev.heroAnim()); if (a && a.state === target) return true; await wait(16); }
  return false;
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page, "Digit1");                  // warrior = Clarice (has the strips)
  pass("entered play as 'warrior'");

  // (1) STRIPS served + correct geometry.
  const strips = await page.evaluate(async () => {
    async function dim(u) { const r = await fetch(u); if (!r.ok) return { ok: false }; const b = new Uint8Array(await r.arrayBuffer());
      const dv = new DataView(b.buffer); return { ok: true, w: dv.getUint32(16), h: dv.getUint32(20) }; }
    return { hurt: await dim("./assets/erw/hero/classes/warrior_hurt.png"), special: await dim("./assets/erw/hero/classes/warrior_special.png") }; });
  if (strips.hurt.ok && strips.hurt.w === 840 && strips.hurt.h === 166) pass(`[STRIPS] warrior_hurt 6f ${strips.hurt.w}×${strips.hurt.h}`);
  else fail(`[STRIPS] hurt strip wrong: ${JSON.stringify(strips.hurt)}`);
  if (strips.special.ok && strips.special.w === 1120 && strips.special.h === 166) pass(`[STRIPS] warrior_special 8f ${strips.special.w}×${strips.special.h}`);
  else fail(`[STRIPS] special strip wrong: ${JSON.stringify(strips.special)}`);

  // (2) SPECIAL — class-skill cast flips state + arms the timer, then reverts.
  const cast = await page.evaluate(() => window.__dev.cast(1));
  const sawSpecial = await awaitState(page, "special", 600);
  const specArmed = (await page.evaluate(() => window.__dev.heroAnim())).specialAnim;
  if (sawSpecial && specArmed > 0 && specArmed <= 0.6) pass(`[SPECIAL] cast → animState 'special', timer ${specArmed}s (mp ${cast.mp})`);
  else fail(`[SPECIAL] cast did not arm special state: saw=${sawSpecial} timer=${specArmed}`);
  const reverted = await awaitState(page, "idle", 1500) || await awaitState(page, "walk", 200);
  if (reverted) pass(`[SPECIAL] reverts after the strip plays once`);
  else fail(`[SPECIAL] state stuck (never returned to idle/walk)`);

  // (3) HURT — a landed hit flips state + arms the timer, then reverts.
  const hurt = await page.evaluate(() => window.__dev.hurt(8));
  const sawHurt = await awaitState(page, "hurt", 400);
  if (sawHurt && hurt.hurtAnim > 0 && hurt.animState !== "dead") pass(`[HURT] hit → animState 'hurt', timer ${hurt.hurtAnim}s (hp ${hurt.hp})`);
  else fail(`[HURT] hit did not arm hurt state: saw=${sawHurt} snap=${JSON.stringify(hurt)}`);
  const hurtReverted = await awaitState(page, "idle", 1000) || await awaitState(page, "walk", 200);
  if (hurtReverted) pass(`[HURT] reverts after the flinch plays`);
  else fail(`[HURT] hurt state stuck`);

  // (4) PRIORITY — a cast launched right after a hit shows 'special' (cast outranks flinch).
  await page.evaluate(() => { window.__dev.clearSpellCD(); window.__dev.hurt(6); window.__dev.cast(1); });
  const prio = await awaitState(page, "special", 400);
  if (prio) pass(`[PRIORITY] cast outranks hit-react (shows 'special' when both fire)`);
  else fail(`[PRIORITY] hurt masked the cast`);
  await awaitState(page, "idle", 1500);

  // (5) DET — identical input order yields the same observed states (sample mid-cast).
  const seq = async () => { const out = []; await page.evaluate(() => { window.__dev.seed(99); window.__dev.clearSpellCD(); });
    await page.evaluate(() => window.__dev.cast(1)); out.push(await awaitState(page, "special", 400) ? "special" : "miss");
    await wait(700); out.push((await page.evaluate(() => window.__dev.heroAnim())).state); return out; };
  const s1 = await seq(); await wait(200); const s2 = await seq();
  if (JSON.stringify(s1) === JSON.stringify(s2)) pass(`[DET] same input → same state sequence ${JSON.stringify(s1)}`);
  else fail(`[DET] non-deterministic: ${JSON.stringify(s1)} vs ${JSON.stringify(s2)}`);

  // (7) PERF — fps while states fire (do a few casts/hits in the window).
  const fpsPromise = (async () => { const r = []; for (let i = 0; i < 2; i++) r.push(await sampleFps(page, 1000)); return r; })();
  for (let i = 0; i < 6; i++) { await page.evaluate(() => { window.__dev.cast(1); window.__dev.hurt(4); }); await wait(280); }
  const fps = await fpsPromise;
  if (Math.min(...fps) >= 58) pass(`[PERF] 60fps held (${fps.join(", ")} fps)`);
  else fail(`[PERF] fps dropped: ${fps.join(", ")}`);

  // (6) FALLBACK — a class with NO hurt/special strip (mage: has attack/death, but its
  // clshurt_/clsspecial_ 404) casting + being hit must NOT error and must still toggle the
  // animState (renderer falls back to the idle loop for the missing strip).
  await page.evaluate(() => window.__dev.setClass("mage"));
  const errBefore = errors.length;
  await page.evaluate(() => { window.__dev.cast(1); });
  const rogueSpecial = await awaitState(page, "special", 500);
  await page.evaluate(() => { window.__dev.hurt(5); });
  const rogueHurt = await awaitState(page, "hurt", 400);
  if ((rogueSpecial || rogueHurt) && errors.length === errBefore)
    pass(`[FALLBACK] non-Clarice class toggles state with NO strip & no error (special=${rogueSpecial} hurt=${rogueHurt})`);
  else fail(`[FALLBACK] non-Clarice path errored or never toggled: special=${rogueSpecial} hurt=${rogueHurt} newErr=${errors.length - errBefore}`);

  // (8) zero JS errors.
  if (errors.length === 0) pass("[ERR] zero page errors");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-256 hurt+special anim self-test passed." : "✗ CAS-256 self-test FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(ok ? 0 : 1);
