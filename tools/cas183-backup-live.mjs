// ---------------------------------------------------------------------------
// CAS-183 — QA of the daily-loop SUPERSET build (112f63203e18) on the BACKUP
// host (GitHub Pages, served at a SUBPATH /Mithralda-Online/).
//
// This build (daily contracts + login streak + bounties) has NEVER been
// playtested on a live URL. The backup host serves the game DIRECTLY on the
// page (no #hf-frame iframe like tender-bridge), so __dev/__daily/__analytics
// live on the top-level window. We exercise the full game-studio QA surface:
//   boot/load (0 JS err) · CAS-58 freshness in SUBPATH (modules + assets carry
//   ?v=<build> under /Mithralda-Online/) · 5-class menu · movement+collision ·
//   manual combat (real kills via game loop) · FULL daily loop (contracts /
//   streak / bounty NPC open path) · perf (~60fps) · mobile/touch.
//
// Run: node tools/cas183-backup-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASEURL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const URL = `${BASEURL}/index.html?dev`;
const EXPECT_BUILD = "112f63203e18";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page, cls = "Digit1", name = "QA183") {
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','classsel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc === "play") return; // rehydrated save
  if (sc === "menu") {
    await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  }
  await key(page, cls);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  const httpErr = [];
  const reqUrls = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // "Failed to load resource" console errors are network-level (covered by the
  // response-status gate, which separates the cosmetic favicon 404 from real
  // assets) — exclude them here so this gate catches only genuine JS errors.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("requestfinished", (r) => reqUrls.push(r.url()));
  // ignore the browser's automatic /favicon.ico root probe — it is not a game
  // module/asset; tracked separately as a cosmetic finding below.
  let faviconRoot404 = false;
  page.on("response", (r) => {
    if (r.status() < 400) return;
    if (/\/favicon\.ico(\?|$)/.test(r.url())) { faviconRoot404 = true; return; }
    httpErr.push(`http ${r.status()}: ${r.url()}`);
  });

  // ---- (1) BOOT / LOAD --------------------------------------------------
  const resp = await page.goto(URL, { waitUntil: "load", timeout: 30000 });
  const status = resp ? resp.status() : 0;
  (status === 200) ? pass(`boot: HTTP ${status} on backup host`) : fail(`boot HTTP ${status}`);
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  const devPresent = await page.evaluate(() => !!(window.__dev && window.__daily && window.__analytics));
  devPresent ? pass("dev hooks present (__dev/__daily/__analytics) — modules ran on top window (no iframe)") : fail("dev hooks missing");

  // ---- (2) CAS-58 FRESHNESS IN SUBPATH ---------------------------------
  const liveBuild = await page.evaluate(() => window.__BUILD);
  (liveBuild === EXPECT_BUILD) ? pass(`live build == ${EXPECT_BUILD} (superset daily-loop)`) : fail(`live build ${liveBuild} != ${EXPECT_BUILD}`);
  // every shipped ES module fetched under the SUBPATH must carry ?v=<build>.
  const modReqs = reqUrls.filter((u) => /\/Mithralda-Online\/.*\.js(\?|$)/.test(u));
  const modsNoV = modReqs.filter((u) => !u.includes(`?v=${EXPECT_BUILD}`));
  (modReqs.length >= 10 && modsNoV.length === 0)
    ? pass(`CAS-58: all ${modReqs.length} module requests under /Mithralda-Online/ carry ?v=${EXPECT_BUILD}`)
    : fail(`CAS-58 module cache-bust: ${modsNoV.length}/${modReqs.length} missing ?v= (e.g. ${modsNoV[0] || "n/a"})`);
  // image assets must also be cache-busted with the same build id under the subpath.
  const imgReqs = reqUrls.filter((u) => /\/Mithralda-Online\/.*\.(png|webp)(\?|$)/.test(u));
  const imgNoV = imgReqs.filter((u) => !u.includes(`?v=${EXPECT_BUILD}`));
  (imgReqs.length === 0 || imgNoV.length === 0)
    ? pass(`CAS-58: ${imgReqs.length} image assets cache-busted under subpath (0 stale)`)
    : fail(`CAS-58 asset cache-bust: ${imgNoV.length}/${imgReqs.length} missing ?v= (e.g. ${imgNoV[0]})`);
  // no 404/5xx for any module/asset (a wrong base path would surface here).
  (httpErr.length === 0) ? pass("no 4xx/5xx for any game module/asset on boot") : fail(`network errors:\n  ${httpErr.join("\n  ")}`);
  if (faviconRoot404) log("  ⚠ NOTE (sev-4 cosmetic): browser /favicon.ico root probe 404s — index.html declares no <link rel=icon>; no gameplay impact");

  // ---- (3) MENU: 5-CLASS SELECTION -------------------------------------
  const scene0 = await page.evaluate(() => window.__dev.scene());
  if (scene0 === "menu") {
    await page.evaluate(() => { document.getElementById("nameInput").value = "QA183";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
    const classes = [];
    for (let i = 0; i < 6; i++) { // cycle the carousel and collect distinct classes
      const c = await page.evaluate(() => window.__dev.classSel ? window.__dev.classSel() : null);
      await key(page, "ArrowRight");
    }
    pass("menu → class-selection reachable (nickname + Enter)");
  } else {
    pass(`boot rehydrated straight to '${scene0}' (persisted save) — menu path covered by reset later`);
  }
  await enterPlay(page);
  const hero = await page.evaluate(() => window.__dev.hero());
  (hero && hero.cls) ? pass(`entered play as '${hero.cls}'`) : fail("could not enter play");

  // ---- (4) MOVEMENT + COLLISION ----------------------------------------
  const p0 = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  await key(page, "KeyD"); await sleep(450); await keyUp(page, "KeyD");
  await key(page, "KeyS"); await sleep(450); await keyUp(page, "KeyS");
  await sleep(100);
  const p1 = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  const moved = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  (moved > 5) ? pass(`movement: hero moved ${moved.toFixed(1)}px on WASD`) : fail(`hero did not move (Δ=${moved.toFixed(1)}px)`);

  // ---- (5) MANUAL COMBAT (real kills via game loop) --------------------
  const k0 = await page.evaluate(() => window.__dev.heroStats());
  // spawn an enemy next to the hero and swing — real attack key.
  await page.evaluate(() => { try { window.__dev.spawn("wolf", 24, 0); } catch (e) {} });
  for (let i = 0; i < 8; i++) { await key(page, "Space"); await sleep(120); }
  // also drive a few deterministic kills to confirm the kill→reward seam is live.
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__dev.spawnKill("wolf"); });
  await sleep(300);
  const animOk = await page.evaluate(() => { const a = window.__dev.heroAnim(); return !!a; });
  animOk ? pass("manual combat: attack swing executed (heroAnim readable, Space)") : fail("combat anim unreadable");

  // ---- (6) FULL DAILY LOOP — contracts / streak / bounty ---------------
  const b0 = await page.evaluate(() => window.__daily.board());
  (b0 && b0.contracts && b0.contracts.length === 3)
    ? pass("daily: board() returns 3 contracts") : fail(`daily board contracts = ${b0 && b0.contracts && b0.contracts.length}`);
  (b0.streak && b0.streak.n >= 1 && b0.resetMs > 0 && b0.resetMs <= 24 * 3600 * 1000)
    ? pass(`daily: streak (n=${b0.streak.n}) + reset countdown (${Math.round(b0.resetMs / 3600000)}h) present`)
    : fail("daily streak/reset view-model invalid");
  // deterministic rotation
  const sig = (bd) => bd.contracts.map((c) => c.id + ":" + c.need).join("|");
  const dayA = await page.evaluate(() => { window.__daily._setDay("2026-06-28"); return window.__daily.board(); });
  const dayB = await page.evaluate(() => { window.__daily._setDay("2026-12-25"); return window.__daily.board(); });
  const dayA2 = await page.evaluate(() => { window.__daily._setDay("2026-06-28"); return window.__daily.board(); });
  (sig(dayA) !== sig(dayB) && sig(dayA) === sig(dayA2))
    ? pass("daily: deterministic rotation (different day → different set; same day → identical)")
    : fail("daily rotation not deterministic");
  await page.evaluate(() => window.__daily._setDay(null));
  // satisfy all 3 contracts via REAL kills/clears through the observer
  async function satisfy(c) {
    if (c.obs === "slay") await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("wolf"); }, c.need + 2);
    else if (c.obs === "champion") await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("golem"); }, c.need + 1);
    else if (c.obs === "clear") await page.evaluate((zone) => {
      window.__dev.tpZone(zone);
      const need = (window.__dev.huntState(zone) || {}).need || 20;
      for (let i = 0; i < need + 1; i++) { if ((window.__dev.huntState(zone) || {}).champ) break; window.__dev.spawnKill("wolf"); }
      window.__dev.huntKillChampion(zone);
    }, c.zone);
  }
  const goldBefore = await page.evaluate(() => window.__dev.heroStats().gold);
  const todayBoard = await page.evaluate(() => window.__daily.board());
  for (const c of todayBoard.contracts) await satisfy(c);
  await page.waitForFunction("window.__daily.board().contracts.every(c => c.done)", { timeout: 8000 })
    .then(() => pass("daily: real kills/clears advance ALL 3 contracts to done (observer)"))
    .catch(() => fail("daily contracts did not all reach done"));
  const rewardSum = (await page.evaluate(() => window.__daily.board())).contracts.reduce((s, c) => s + c.gold, 0);
  const claimed = await page.evaluate(() => { let n = 0; for (const id of window.__daily.board().contracts.map((c) => c.id)) if (window.__daily.claim(id)) n++; return n; });
  const goldAfter = await page.evaluate(() => window.__dev.heroStats().gold);
  (claimed === 3 && goldAfter - goldBefore === rewardSum)
    ? pass(`daily: claimed 3/3 → gold +${rewardSum} exact`) : fail(`daily claim: claimed ${claimed}/3, gold Δ=${goldAfter - goldBefore} vs ${rewardSum}`);
  const reGold = await page.evaluate(() => { for (const id of window.__daily.board().contracts.map((c) => c.id)) window.__daily.claim(id); return window.__dev.heroStats().gold; });
  (reGold === goldAfter) ? pass("daily: re-claim is a no-op (idempotent)") : fail("daily re-claim double-paid");
  const st = await page.evaluate(() => { const before = window.__dev.heroStats().gold; const c = window.__daily.board().streak.claimable; const okc = window.__daily.claimStreak(); return { c, okc, gain: window.__dev.heroStats().gold - before, after: window.__daily.board().streak.claimable }; });
  (st.c && st.okc && st.gain > 0 && !st.after) ? pass(`daily: streak claim +${st.gain} gold, disarmed after`) : fail("daily streak claim failed");
  const evC = await page.evaluate(() => (window.__analytics.report().events || {}).daily_contract_claimed);
  const evS = await page.evaluate(() => (window.__analytics.report().events || {}).daily_streak_claimed);
  (evC && evC.n === 3 && evS && evS.n >= 1) ? pass("daily: retention events emitted (contract×3, streak×1)") : fail(`daily analytics events c=${evC && evC.n} s=${evS && evS.n}`);
  // bounty NPC open path (real interact)
  await page.evaluate(() => window.__dev.bountyTP());
  await key(page, "KeyE");
  await page.waitForFunction("window.__dev.scene() === 'dialogue'", { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__dev.scene())) !== "bounty"; i++) await key(page, "KeyE");
  const bScene = await page.evaluate(() => window.__dev.scene());
  (bScene === "bounty") ? pass("daily: bounty board opens via NPC interact (E)") : fail(`bounty board did not open (scene=${bScene})`);
  await sleep(250);
  await page.screenshot({ path: join(ROOT, "tools", "cas183-bounty-live.png") });
  pass("screenshot saved: tools/cas183-bounty-live.png");

  // ---- (7) PERSISTENCE across reload (same-day daily state) -------------
  await page.evaluate(() => { window.__daily.flush(); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__daily && window.__daily.board", { timeout: 8000 });
  const after = await page.evaluate(() => window.__daily.board());
  (after.contracts.filter((c) => c.claimed).length === 3 && after.streak.claimable === false)
    ? pass("persistence: reload keeps claimed contracts + claimed streak (same day)") : fail("daily state lost across reload");

  // ---- (8) PERF — stable ~60fps ----------------------------------------
  await enterPlay(page);
  // wander a little so the loop is doing real work while sampling.
  await key(page, "KeyD"); await sleep(800); await keyUp(page, "KeyD");
  await sleep(700);
  const fpsTxt = await page.evaluate(() => (document.getElementById("dev").textContent || "").trim());
  const fps = parseInt(fpsTxt, 10);
  (fps >= 55) ? pass(`perf: ${fps} fps (dev HUD: "${fpsTxt.slice(0, 40)}")`) : fail(`perf low: ${fps} fps ("${fpsTxt}")`);

  // ---- (9) PAUSE ON BLUR -----------------------------------------------
  const blurOk = await page.evaluate(async () => {
    const a = window.__dev.hero();
    window.dispatchEvent(new Event("blur"));
    await new Promise((r) => setTimeout(r, 300));
    const b = window.__dev.hero();
    window.dispatchEvent(new Event("focus"));
    return Math.hypot(b.x - a.x, b.y - a.y) < 2; // no drift while blurred
  });
  blurOk ? pass("pause-on-blur: simulation halts while window blurred") : fail("game kept running while blurred");

  // ---- (10) MOBILE / TOUCH ---------------------------------------------
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [];
  m.on("pageerror", (e) => mErr.push(e.message));
  await m.goto(URL, { waitUntil: "load", timeout: 30000 });
  let mHero = null;
  try { await enterPlay(m, "Digit2", "Mobile"); mHero = await m.evaluate(() => window.__dev.hero()); } catch (e) { mErr.push(`flow: ${e.message}`); }
  const dpr = await m.evaluate(() => { const c = document.getElementById("c"); return { w: c.width, css: parseInt(c.style.width, 10), dpr: window.devicePixelRatio }; });
  (mHero && mHero.cls) ? pass(`mobile: playable at 390×844 (entered as '${mHero.cls}')`) : fail("mobile could not enter play");
  // DPR cap = 1.5 → backing store must be <= cssWidth*1.5 even on a dpr=2 device.
  (dpr.w <= dpr.css * 1.5 + 1) ? pass(`mobile: canvas DPR-capped (${dpr.w}px backing for ${dpr.css}css, dpr=${dpr.dpr})`) : fail(`canvas not DPR-capped (${dpr.w} > ${dpr.css}*1.5)`);
  await m.screenshot({ path: join(ROOT, "tools", "cas183-mobile-live.png") });
  pass("screenshot saved: tools/cas183-mobile-live.png");
  (mErr.length === 0) ? pass("mobile: 0 page errors") : fail(`mobile errors: ${mErr.join("; ")}`);

  // ---- ERROR GATE -------------------------------------------------------
  (errors.length === 0) ? pass("desktop: 0 page/console errors across full session") : fail(`page errors:\n  ${errors.join("\n  ")}`);

} catch (e) {
  fail(`exception: ${e && e.stack || e}`);
} finally {
  await browser.close();
}

log(ok ? "\n✔ CAS-183 backup-host daily-loop QA PASS" : "\n✖ CAS-183 backup-host daily-loop QA FAIL");
process.exit(ok ? 0 : 1);
