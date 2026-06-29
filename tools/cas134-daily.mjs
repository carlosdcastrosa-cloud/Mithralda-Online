// ---------------------------------------------------------------------------
// Headless daily-return-loop playthrough (CAS-134).
//
// Boots the REAL game in headless Chromium and exercises the daily contracts +
// login streak + bounty board through the SAME code the game runs — no shortcut
// around the observer or the claim seam:
//   (1) the bounty board exposes 3 deterministic daily contracts + a streak + a
//       live reset countdown (window.__daily.board()).
//   (2) DETERMINISTIC ROTATION: the same calendar day yields the SAME contracts on
//       any reload; a different day rotates to a DIFFERENT set.
//   (3) REAL PROGRESS: driving real kills / champion kills / zone clears (the same
//       __dev hooks the hunt+shop harnesses use → killEnemy) advances each contract
//       to done via the read-only observer.
//   (4) CLAIM: claiming a done contract grants its gold (real hero gold rises),
//       flips claimed=true, is idempotent (re-claim is a no-op), and emits a
//       retention event into analytics (window.__analytics.report().events).
//   (5) STREAK claim grants + arms once-per-day + emits its retention event.
//   (6) PERSISTENCE: a reload keeps the claimed/streak state for the same day.
//
// Run: npm run daily   (node tools/cas134-daily.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const near = (a, b, eps = 0) => Math.abs(a - b) <= eps;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "DailyBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// After a reload a saved run rehydrates straight into play (persist.boot) — handle both.
async function enterPlay2(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") return;
  await enterPlay(page);
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

  // (1) board shape -------------------------------------------------------
  const b0 = await page.evaluate(() => window.__daily.board());
  if (b0 && Array.isArray(b0.contracts) && b0.contracts.length === 3) pass("board() returns 3 daily contracts");
  else fail(`board() contract count = ${b0 && b0.contracts && b0.contracts.length}`);
  const shapeOk = b0.contracts.every(c => c.id && c.title && c.need > 0 && c.gold > 0 && c.xp > 0 && c.prog === 0 && !c.done && !c.claimed);
  shapeOk ? pass("each contract has title + need + reward + zeroed progress") : fail("contract shape invalid");
  if (b0.streak && b0.streak.n >= 1 && b0.streak.reward && b0.streak.reward.gold > 0) pass(`streak present (n=${b0.streak.n}, reward +${b0.streak.reward.gold} oro)`);
  else fail("streak view-model invalid");
  if (b0.resetMs > 0 && b0.resetMs <= 24 * 3600 * 1000) pass(`reset countdown within a day (${Math.round(b0.resetMs / 3600000)}h)`);
  else fail(`resetMs out of range: ${b0.resetMs}`);

  // (2) deterministic rotation -------------------------------------------
  const sig = (bd) => bd.contracts.map(c => c.id + ":" + c.need).join("|");
  const dayA = await page.evaluate(() => { window.__daily._setDay("2026-06-28"); return window.__daily.board(); });
  const dayB = await page.evaluate(() => { window.__daily._setDay("2026-12-25"); return window.__daily.board(); });
  const dayA2 = await page.evaluate(() => { window.__daily._setDay("2026-06-28"); return window.__daily.board(); });
  if (sig(dayA) !== sig(dayB)) pass("a different day rotates to a different contract set");
  else fail("contracts did NOT rotate across days");
  if (sig(dayA) === sig(dayA2)) pass("same day → identical contracts (deterministic)");
  else fail("same-day contracts not deterministic");

  // (3) real progress on a fresh pinned day ------------------------------
  // CAS-194 fix (ported from cas183 live harness): `_setDay(null)` only DROPS the
  // day override — it does NOT regenerate the board. The store keeps the last pinned
  // test day's contracts until the next today()-check regenerates them. Re-pin to the
  // ORIGINAL natural day (b0.day) so the contracts we satisfy are the ones we claim;
  // pinning to null left them desynced → the intermittent "first contract not done"
  // + gold-delta-short failure.
  await page.evaluate((d) => window.__daily._setDay(d), b0.day);
  // make sure a champion contract can be satisfied: spawnKill('golem') flags isBoss →
  // bumps champKills; trash kills bump kills; clears go through huntKillChampion.
  async function satisfyContract(c) {
    if (c.obs === "slay") {
      await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("wolf"); }, c.need + 2);
    } else if (c.obs === "champion") {
      await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__dev.spawnKill("golem"); }, c.need + 1);
    } else if (c.obs === "clear") {
      // CAS-194 fix: the `clear` path must YIELD to the sim between spawns. A bulk
      // single-evaluate loop spawns faster than the game loop steps, so the champion
      // never registers and huntKillChampion() no-ops → the zone never clears. Drive
      // one kill per step, wait for the champ to appear, then kill it.
      await page.evaluate((zone) => window.__dev.tpZone(zone), c.zone);
      const need = await page.evaluate((zone) => (window.__dev.huntState(zone) || {}).need || 20, c.zone);
      for (let i = 0; i < need + 2; i++) {
        if (await page.evaluate((zone) => (window.__dev.huntState(zone) || {}).champ, c.zone)) break;
        await page.evaluate((zone) => window.__dev.spawnKill("wolf"), c.zone);
        await sleep(40);
      }
      await page.waitForFunction((zone) => (window.__dev.huntState(zone) || {}).champ, { timeout: 4000 }, c.zone).catch(() => {});
      await page.evaluate((zone) => window.__dev.huntKillChampion(zone), c.zone);
    }
  }
  const goldBefore = await page.evaluate(() => window.__dev.heroStats().gold);
  const todayBoard = await page.evaluate(() => window.__daily.board());
  // CAS-194 fix: yield to the observer (daily.tick in the game loop) between contracts
  // so each satisfy() is delta-counted before the next one teleports zones.
  for (const c of todayBoard.contracts) { await satisfyContract(c); await sleep(400); }
  // let the observer (daily.tick in the game loop) delta-count the kills to done.
  await page.waitForFunction("window.__daily.board().contracts.every(c => c.done)", { timeout: 8000 })
    .then(() => pass("driving real kills/clears advances ALL 3 contracts to done (observer)"))
    .catch(() => fail("contracts did not all reach done after driving progress"));

  // (4) claim + reward + analytics ---------------------------------------
  const board1 = await page.evaluate(() => window.__daily.board());
  const rewardSum = board1.contracts.reduce((s, c) => s + c.gold, 0);
  const claimed = await page.evaluate(() => {
    const ids = window.__daily.board().contracts.map(c => c.id);
    let n = 0; for (const id of ids) if (window.__daily.claim(id)) n++; return n;
  });
  (claimed === 3) ? pass("claimed all 3 done contracts") : fail(`claimed ${claimed}/3`);
  const goldAfter = await page.evaluate(() => window.__dev.heroStats().gold);
  // gold rises by exactly the sum of contract gold rewards (xp may level but gold is exact).
  near(goldAfter - goldBefore, rewardSum, 0)
    ? pass(`hero gold rose by exactly the reward sum (+${rewardSum} oro)`)
    : fail(`gold delta ${goldAfter - goldBefore} != reward sum ${rewardSum}`);
  const allClaimedFlag = await page.evaluate(() => window.__daily.board().contracts.every(c => c.claimed));
  allClaimedFlag ? pass("all contracts now flagged claimed") : fail("claimed flag not set");
  // idempotent: re-claiming grants nothing.
  const goldReclaim = await page.evaluate(() => {
    const ids = window.__daily.board().contracts.map(c => c.id);
    for (const id of ids) window.__daily.claim(id);
    return window.__dev.heroStats().gold;
  });
  (goldReclaim === goldAfter) ? pass("re-claim is a no-op (no double reward)") : fail("re-claim granted extra gold");
  const evClaim = await page.evaluate(() => (window.__analytics.report().events || {}).daily_contract_claimed);
  (evClaim && evClaim.n === 3) ? pass("retention event daily_contract_claimed emitted ×3") : fail(`analytics contract event = ${evClaim && evClaim.n}`);

  // (5) streak claim ------------------------------------------------------
  const stClaim = await page.evaluate(() => {
    const before = window.__dev.heroStats().gold;
    const claimable = window.__daily.board().streak.claimable;
    const okc = window.__daily.claimStreak();
    const after = window.__dev.heroStats().gold;
    const claimableAfter = window.__daily.board().streak.claimable;
    const ev = (window.__analytics.report().events || {}).daily_streak_claimed;
    return { claimable, okc, gained: after - before, claimableAfter, ev: ev && ev.n };
  });
  (stClaim.claimable && stClaim.okc && stClaim.gained > 0) ? pass(`streak claim granted +${stClaim.gained} oro`) : fail("streak claim failed to grant");
  (!stClaim.claimableAfter) ? pass("streak reward disarmed after claim (once per day)") : fail("streak still claimable after claim");
  (stClaim.ev >= 1) ? pass("retention event daily_streak_claimed emitted") : fail("streak analytics event missing");

  // (6) persistence across reload ----------------------------------------
  await page.evaluate(() => { window.__daily.flush(); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__daily && window.__daily.board", { timeout: 8000 });
  const afterReload = await page.evaluate(() => window.__daily.board());
  const persisted = afterReload.contracts.filter(c => c.claimed).length === 3 && afterReload.streak.claimable === false;
  persisted ? pass("reload keeps the claimed contracts + claimed streak for the same day") : fail("daily state did not persist across reload");

  // (7) REAL open path + screenshot — park on the steward, press E twice -----
  await enterPlay2(page);
  await page.evaluate(() => window.__dev.bountyTP());
  await key(page, "KeyE");                                  // interact → dialogue
  await page.waitForFunction("window.__dev.scene() === 'dialogue'", { timeout: 4000 }).catch(() => {});
  for (let i = 0; i < 4 && (await page.evaluate(() => window.__dev.scene())) !== "bounty"; i++) await key(page, "KeyE");
  const openedScene = await page.evaluate(() => window.__dev.scene());
  (openedScene === "bounty")
    ? pass("real interact()->dialogue->bounty board open path works (E twice)")
    : fail(`bounty board did not open via NPC (scene=${openedScene})`);
  await new Promise(r => setTimeout(r, 250));
  await page.screenshot({ path: join(ROOT, "tools", "cas134-bounty-board.png") });
  pass("bounty board screenshot saved: tools/cas134-bounty-board.png");

  // error gate -----------------------------------------------------------
  errors.length === 0 ? pass("0 page/console errors") : fail(`page errors:\n  ${errors.join("\n  ")}`);

} catch (e) {
  fail(`exception: ${e && e.stack || e}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\n✔ CAS-134 daily-return-loop PASS" : "\n✖ CAS-134 daily-return-loop FAIL");
process.exit(ok ? 0 : 1);
