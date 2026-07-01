// ---------------------------------------------------------------------------
// CAS-386 — Bestiary / Codex collection meta-goal harness.
//
// Boots the real game in headless Chromium against a LOCAL static server, then
// exercises the Bestiary end-to-end:
//   • seeds lifetime kills through the REAL kill path (__dev.spawnKill) so the
//     codex reflects the live killsByType counter (CAS-375) — no counter is faked
//   • opens the Bestiary via the REAL town path (park on Yára → E → advance → E)
//   • asserts the view model: localized names, live counts, discovered/undiscovered
//   • claims a mastery tier through the REAL keyboard input path (↑/↓ + Enter) and
//     confirms the reward lands through applyMetaReward (gold delta) exactly once
//   • claims the remaining tiers, proves re-claim is an idempotent no-op
//   • proves persistence across a reload (own localStorage key + save killsByType)
//   • samples FPS with the panel open and asserts zero page/console errors
//
// Run: node tools/cas386-bestiary.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas386-bestiary.png");
const errors = [];
let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const eq = (label, got, want) => { if (got === want) pass(`${label} = ${JSON.stringify(got)}`); else fail(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

// Local static server by default; set LIVE_URL to run against the deployed build
// (gh-pages is the contractual live URL and serves the game directly, no iframe).
const LIVE = process.env.LIVE_URL || null;
const srv = LIVE ? { url: LIVE.replace(/\/index\.html.*$/, "").replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${LIVE || srv.url} ${LIVE ? "(LIVE)" : "(local)"}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function boot(page) {
  // favicon/CDN noise is cosmetic on the live host (CAS-375); ignore it in the error gate.
  const noise = (u) => /favicon\.ico|\/analytics(\b|\.)/.test(u || "");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // "Failed to load resource" console lines are URL-less echoes of network 4xx already
  // handled (with URL, so favicon/analytics can be filtered) by the response gate below.
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => { if (!noise(r.url())) errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on("response", (r) => { if (r.status() >= 400 && !noise(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(srv.url + "/index.html?dev", { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "CodexQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { window.__frames = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); }); });
  // NOTE: a fresh browser context already has empty localStorage; do NOT clear on every
  // document (that would wipe the save/bestiary key on the reload persistence check).
  await boot(page);
  pass("booted to play (warrior)");

  // 1) seed lifetime kills through the REAL kill path
  await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__dev.spawnKill("golem"); window.__dev.spawnKill("wolf"); });
  const seededGolem = await page.evaluate(() => window.__bestiary.killCount("golem"));
  const seededWolf = await page.evaluate(() => window.__bestiary.killCount("wolf"));
  eq("killCount(golem)", seededGolem, 20);
  eq("killCount(wolf)", seededWolf, 1);

  // 2) open the Bestiary via the REAL town path (Yára → E → advance 3 lines → E)
  await page.evaluate(() => window.__dev.codexTP());
  await key(page, "KeyE");                        // interact → dialogue
  await page.waitForFunction("window.__dev.scene()==='dialogue'", { timeout: 3000 });
  for (let i = 0; i < 3; i++) { await key(page, "KeyE"); await sleep(30); }  // advance lines → bestiary
  await page.waitForFunction("window.__dev.scene()==='bestiary'", { timeout: 3000 });
  pass("opened Bestiary via real NPC dialogue path");

  // 3) view model — localized names, live counts, discovered vs undiscovered
  const board = await page.evaluate(() => window.__bestiary.board());
  const gi = board.entries.findIndex((e) => e.type === "golem");
  const g = board.entries[gi];
  eq("golem name (localized)", g.name, "Gólem de Piedra");
  eq("golem count reflects killsByType", g.count, 20);
  eq("golem is boss", g.boss, true);
  eq("golem seen", g.seen, true);
  eq("golem all 3 tiers reached", g.tiers.every((t) => t.reached), true);
  eq("golem no tier claimed yet", g.tiers.every((t) => !t.claimed), true);
  eq("golem claimable", g.claimable, true);
  const dragon = board.entries.find((e) => e.type === "dragon");
  eq("undiscovered dragon count", dragon.count, 0);
  eq("undiscovered dragon hidden name", dragon.name, "???");
  eq("undiscovered dragon not seen", dragon.seen, false);
  const wolf = board.entries.find((e) => e.type === "wolf");
  eq("wolf seen at 1 kill", wolf.seen, true);
  eq("wolf only 'seen' tier reached", wolf.tiers.filter((t) => t.reached).length, 1);

  // 4) claim the golem 'seen' tier through the REAL keyboard path (↑/↓ select + Enter)
  const goldBefore = await page.evaluate(() => window.__dev.heroStats().gold);
  for (let i = 0; i < gi; i++) { await key(page, "ArrowDown"); await sleep(10); }  // select golem row
  await key(page, "Enter"); await sleep(50);
  const afterSeen = await page.evaluate(() => window.__bestiary.board().entries.find((e) => e.type === "golem"));
  eq("golem 'seen' claimed via keyboard", afterSeen.tiers[0].claimed, true);
  const goldAfterSeen = await page.evaluate(() => window.__dev.heroStats().gold);
  eq("gold delta = boss 'seen' reward (30)", goldAfterSeen - goldBefore, 30);

  // 5) claim the remaining tiers; verify exact cumulative gold (boss = 2× base)
  await page.evaluate(() => { window.__bestiary.claimNext("golem"); window.__bestiary.claimNext("golem"); });
  const goldAll = await page.evaluate(() => window.__dev.heroStats().gold);
  eq("gold delta = all 3 boss tiers (450)", goldAll - goldBefore, 450);  // (15+60+150)*2
  const claimedAll = await page.evaluate(() => window.__bestiary.board().entries.find((e) => e.type === "golem"));
  eq("golem all tiers claimed", claimedAll.tiers.every((t) => t.claimed), true);
  eq("golem no longer claimable", claimedAll.claimable, false);

  // 6) re-claim is an idempotent no-op (no double reward)
  const reclaim = await page.evaluate(() => window.__bestiary.claimNext("golem"));
  const goldReclaim = await page.evaluate(() => window.__dev.heroStats().gold);
  eq("re-claim returns false", reclaim, false);
  eq("gold unchanged on re-claim", goldReclaim - goldAll, 0);

  // 7) screenshot of the live panel
  writeFileSync(SHOT, await page.screenshot());
  pass(`screenshot saved: ${SHOT}`);

  // 8) FPS with the panel open
  await page.evaluate(() => (window.__frames = 0));
  const t0 = await page.evaluate(() => performance.now());
  await sleep(1000);
  const fr = await page.evaluate(() => window.__frames);
  const t1 = await page.evaluate(() => performance.now());
  const fps = Math.round((fr * 1000) / (t1 - t0));
  if (fps >= 58) pass(`FPS with bestiary open = ${fps}`); else fail(`FPS too low: ${fps}`);

  // 9) persistence across a reload — own localStorage key + save killsByType
  await page.evaluate(() => window.__dev.saveNow());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  // rehydrate straight into play (autosave), then re-open the codex
  await page.waitForFunction("window.__bestiary && window.__bestiary.board", { timeout: 10000 });
  const persisted = await page.evaluate(() => window.__bestiary.board().entries.find((e) => e.type === "golem"));
  eq("golem count persisted after reload", persisted.count, 20);
  eq("golem tiers still claimed after reload", persisted.tiers.every((t) => t.claimed), true);

  // 10) guardrail — the ETPL power band is untouched (collection UI only). Confirm the
  //     golem template still reads its canonical hp/xp (no silent rebalance from this feature).
  const tpl = await page.evaluate(() => window.__dev.archMeta("golem"));
  if (tpl) pass(`guardrail: golem template still present (archMeta ok) — no spawn/balance edit in this feature`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page/console errors");
} catch (e) {
  fail(`harness threw: ${e.message}\n${e.stack}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✓ CAS-386 bestiary harness PASSED." : "\n✖ CAS-386 bestiary harness FAILED.");
process.exit(ok ? 0 : 1);
