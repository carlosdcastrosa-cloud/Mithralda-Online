// ---------------------------------------------------------------------------
// Headless return-hook QA (CAS-243) — escalating streak rewards + comeback + Forja drip.
//
// Boots the REAL game in headless Chromium and drives the SAME daily.js code the game
// runs (window.__daily dev API) — no shortcut around streakReward / refreshDay / the
// applyMetaReward claim seam:
//   (1) REWARD MATH: streakReward is a pure, deterministic function of the streak count —
//       gold/xp escalate with the cycle-day, mena drips d3=1 … d7=5, day 7 is the
//       milestone (potion). A full 7-day week = 1+2+3+4+5 = 15 mena = one item to MÁX.
//   (2) ADVANCE: returning the next calendar day bumps the streak +1 (comeback flag clear).
//   (3) COMEBACK CATCH-UP: missing exactly ONE day SOFTENS the streak (halve, min 1) and
//       flags comeback — it does NOT hard-reset. A gap ≥ 3 days resets to 1.
//   (4) CLAIM → FORJA: claiming a streak with mena drips that mena into h.mats (the forge
//       currency), once per day, and emits its retention event (milestone → milestone event).
//   (5) PERSISTENCE: a reload keeps the claimed streak + the granted mena for the same day.
//
// Run: npm run cas243   (node tools/cas243-return-hook.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "HookBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(page);
  const realToday = await page.evaluate(() => window.__daily.board().day);  // anchor for the persist test

  // (1) REWARD MATH — pure function, deterministic ----------------------------
  const rw = await page.evaluate(() => {
    const f = window.__daily._streakReward;
    const days = [1,2,3,4,5,6,7].map(n => f(n));
    const week = days.reduce((a,r) => a + (r.mena||0), 0);
    return { mena: days.map(r => r.mena|0), milestone: days.map(r => !!r.milestone),
      goldAsc: days.every((r,i)=> i===0 || r.gold >= days[i-1].gold),
      week, day8: f(8).mena, day10: f(10).mena };
  });
  (JSON.stringify(rw.mena) === JSON.stringify([0,0,1,2,3,4,5]))
    ? pass(`mena escalates d1..d7 = [${rw.mena}] (drips from day 3)`)
    : fail(`mena escalation wrong: [${rw.mena}]`);
  (rw.week === 15) ? pass("a full 7-day streak = 15 mena = exactly one item forged to MÁX")
    : fail(`7-day mena sum = ${rw.week}, expected 15`);
  (rw.goldAsc) ? pass("gold reward escalates monotonically across the week") : fail("gold reward not monotonic");
  (rw.milestone.filter(Boolean).length === 1 && rw.milestone[6])
    ? pass("day 7 is the lone milestone (potion spike)") : fail(`milestone flags wrong: [${rw.milestone}]`);
  (rw.day8 === 0 && rw.day10 === 1) ? pass("cycle loops past day 7 (d8→cycle-day1 mena=0, d10→cycle-day3 mena=1)") : fail(`cycle loop wrong: d8=${rw.day8} d10=${rw.day10}`);

  // (2) ADVANCE — consecutive day bumps +1 ------------------------------------
  const adv = await page.evaluate(() => {
    window.__daily._setStreak(5, "2026-01-09");
    window.__daily._setDay("2026-01-10");
    const b = window.__daily.board();
    return { n: b.streak.n, comeback: b.streak.comeback };
  });
  (adv.n === 6 && !adv.comeback) ? pass("consecutive return advances streak 5 → 6 (no comeback flag)")
    : fail(`advance wrong: n=${adv.n} comeback=${adv.comeback}`);

  // (3a) COMEBACK — missing exactly one day softens, not resets ----------------
  const cb = await page.evaluate(() => {
    window.__daily._setStreak(8, "2026-02-08");   // last seen 2 days before "today"
    window.__daily._setDay("2026-02-10");
    const b = window.__daily.board();
    return { n: b.streak.n, comeback: b.streak.comeback };
  });
  (cb.n === 4 && cb.comeback) ? pass("comeback: a single missed day softens streak 8 → 4 (flagged, not reset)")
    : fail(`comeback wrong: n=${cb.n} comeback=${cb.comeback}`);

  // (3b) RESET — a gap of 3+ days still resets to 1 ---------------------------
  const rst = await page.evaluate(() => {
    window.__daily._setStreak(8, "2026-03-05");
    window.__daily._setDay("2026-03-10");
    const b = window.__daily.board();
    return { n: b.streak.n, comeback: b.streak.comeback };
  });
  (rst.n === 1 && !rst.comeback) ? pass("a gap of 3+ days resets the streak to 1") : fail(`reset wrong: n=${rst.n} comeback=${rst.comeback}`);

  // (4) CLAIM → FORJA drip — anchored on the REAL today so it survives reload ---
  const clm = await page.evaluate((today) => {
    window.__daily._setDay(today);                 // normalize store.day to the real calendar day
    window.__daily._setStreak(7, today);           // streak 7 = milestone, mena 5 (store.day stays today)
    const b = window.__daily.board();
    const matsBefore = window.__dev.forgeState().mats;
    const goldBefore = window.__dev.heroStats().gold;
    const claimable = b.streak.claimable;
    const okc = window.__daily.claimStreak();
    const matsAfter = window.__dev.forgeState().mats;
    const goldAfter = window.__dev.heroStats().gold;
    const claimableAfter = window.__daily.board().streak.claimable;
    const reclaim = window.__daily.claimStreak();   // idempotent: must be a no-op
    const evMile = ((window.__analytics.report().events || {}).daily_streak_milestone || {}).n || 0;
    const nextPreview = b.streak.next;
    return { streak: b.streak.n, reward: b.streak.reward, claimable, okc,
      matsGain: matsAfter - matsBefore, goldGain: goldAfter - goldBefore,
      claimableAfter, reclaim, evMile, nextPreview };
  }, realToday);
  (clm.streak === 7 && clm.reward.milestone && clm.reward.mena === 5)
    ? pass("day-7 milestone board: mena=5, milestone=true") : fail(`milestone board wrong: ${JSON.stringify(clm.reward)}`);
  (clm.claimable && clm.okc && clm.matsGain === 5)
    ? pass(`streak claim dripped +${clm.matsGain} mena into the Forja currency (h.mats)`) : fail(`mena not granted: gain=${clm.matsGain}`);
  (clm.goldGain === clm.reward.gold) ? pass(`streak claim granted +${clm.goldGain} oro alongside the mena`) : fail(`gold gain wrong: ${clm.goldGain} vs ${clm.reward.gold}`);
  (!clm.claimableAfter && !clm.reclaim) ? pass("streak disarmed after claim + re-claim is a no-op (once per day)") : fail("streak re-claimable / double-grant");
  (clm.evMile >= 1) ? pass("retention event daily_streak_milestone emitted") : fail("milestone analytics event missing");
  (clm.nextPreview && clm.nextPreview.mena === 0) ? pass(`tomorrow preview present (day 8 → +${clm.nextPreview.gold} oro, mena ${clm.nextPreview.mena})`) : fail("next-reward preview missing");

  // (5) PERSISTENCE across reload ---------------------------------------------
  await page.evaluate(() => window.__daily.flush());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__daily && window.__daily.board", { timeout: 8000 });
  const persisted = await page.evaluate(() => {
    const b = window.__daily.board();
    return { n: b.streak.n, claimable: b.streak.claimable };
  });
  (persisted.n === 7 && persisted.claimable === false)
    ? pass("reload keeps the day-7 streak + claimed flag (additive persist, no wipe)") : fail(`persist wrong: ${JSON.stringify(persisted)}`);

  // errors --------------------------------------------------------------------
  (errors.length === 0) ? pass("no page/console errors during the run") : fail(`errors: ${errors.slice(0,3).join(" | ")}`);
} catch (e) {
  fail(`exception: ${e && e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\nALL CAS-243 RETURN-HOOK CHECKS PASSED" : "\nCAS-243 RETURN-HOOK CHECKS FAILED");
process.exit(ok ? 0 : 1);
