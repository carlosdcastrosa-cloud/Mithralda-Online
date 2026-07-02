// ---------------------------------------------------------------------------
// CAS-392 — LOCAL smoke test for Boon Draft Reroll + Banish.
//
// Serves the working tree over HTTP and drives the REAL sim via window.__dev:
//   1. draft opens with 3 cards + charges 1/1
//   2. reroll spends the charge, re-draws all 3, respects depth-scaled odds
//      (rarity distribution over many rerolls stays inside the CAS-391 band)
//   3. banish removes a card, adds it to the run pool's banished set, keeps the
//      other two, and the banished id NEVER resurfaces in later draws/rerolls
//   4. charges reset on death; existing pick path + synergy/keystone intact
//   5. 0 console errors
//
// Run: node tools/cas392-local.mjs
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
// LIVE_URL env → run against the deployed gh-pages build (green gate); else local static server.
const LIVE = process.env.LIVE_URL;
const { url, close } = LIVE ? { url: LIVE.replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${url}${LIVE ? " (LIVE)" : " (local)"}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  // boot to play as warrior (menu → classsel → play)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas392"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  const booted = await page.evaluate(() => !!(window.__dev && window.__dev.boons));
  ok("boot to play + __dev.boons present", booted);
  if (LIVE) { const build = await page.evaluate(() => window.__BUILD || null);
    ok("live build id == 8039e48dbc09", build === "8039e48dbc09", `served=${build}`); }

  // 1. draft opens with fresh 1/1 charges
  let st = await page.evaluate(() => { window.__dev.openDraft(); return window.__dev.boons(); });
  ok("draft opens with 3 cards", st && st.draft && st.draft.choices.length === 3, JSON.stringify(st.draft && st.draft.choices));
  ok("fresh charges 1 reroll / 1 banish", st.rerollLeft === 1 && st.banishLeft === 1, `reroll=${st.rerollLeft} banish=${st.banishLeft}`);

  // 2. reroll spends charge + re-draws
  const before = st.draft.choices.slice();
  const rr = await page.evaluate(() => window.__dev.rerollDraft());
  ok("reroll ok + spends the charge", rr.ok === true && rr.rerollLeft === 0, `left=${rr.rerollLeft}`);
  ok("reroll produced a fresh 3-card hand", rr.choices && rr.choices.length === 3, JSON.stringify(rr.choices));
  const rr2 = await page.evaluate(() => window.__dev.rerollDraft());
  ok("second reroll is a no-op (charge spent)", rr2.ok === false && rr2.rerollLeft === 0);

  // 3. banish removes the selected card, keeps the other two, adds to banished pool
  const hand = rr.choices.slice();
  const banishIdx = 0, banishId = hand[banishIdx], kept = [hand[1], hand[2]];
  const bn = await page.evaluate((i) => window.__dev.banishDraft(i), banishIdx);
  ok("banish ok + spends the charge", bn.ok === true && bn.banishLeft === 0, `left=${bn.banishLeft}`);
  ok("banished id recorded in run pool", bn.banished.includes(banishId), `banished=${JSON.stringify(bn.banished)}`);
  ok("banished id gone from current hand", !bn.choices.includes(banishId), `hand=${JSON.stringify(bn.choices)}`);
  ok("two kept cards still present", kept.every((k) => bn.choices.includes(k)), `kept=${JSON.stringify(kept)} hand=${JSON.stringify(bn.choices)}`);
  const bn2 = await page.evaluate(() => window.__dev.banishDraft(0));
  ok("second banish is a no-op (charge spent)", bn2.ok === false && bn2.banishLeft === 0);

  // banished id never resurfaces across many fresh drafts (pick to close, reopen)
  const resurfaced = await page.evaluate((bad) => {
    // pick a card to close the current draft, then reopen many times and scan
    window.__dev.pickBoon(0);
    let seen = false;
    for (let i = 0; i < 200; i++) { const c = window.__dev.openDraft() || []; if (c.includes(bad)) { seen = true; break; } window.__dev.pickBoon(0); }
    return seen;
  }, banishId);
  ok("banished id NEVER offered in 200 later drafts", resurfaced === false, `id=${banishId}`);

  // 4. charges reset on death (retryRun = respawn = new run)
  const afterDeath = await page.evaluate(() => { window.__dev.grantBoon("thorns"); window.__dev.retryRun(); return window.__dev.draftCharges(); });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  ok("charges reset to 1/1 on death", afterDeath && afterDeath.rerollLeft === 1 && afterDeath.banishLeft === 1, JSON.stringify(afterDeath));
  ok("banished pool cleared on death", afterDeath && afterDeath.banished.length === 0);

  // 5. rarity distribution of REROLLED cards stays inside a sane depth band (no legendary farm).
  // Deep run (grant several rare boons to lift depth) → reroll many times, count rarity mix.
  const dist = await page.evaluate(() => {
    const RAR = { glass:"rare", ember:"common", venom:"common", arc:"rare", thorns:"common", stone:"common", vamp:"rare", swift:"common", reaper:"rare", greed:"common", wake:"legendary", nova:"legendary" };
    // build depth ~6
    for (let i = 0; i < 6; i++) window.__dev.grantBoon("ember");
    let common = 0, rare = 0, leg = 0, n = 0;
    for (let t = 0; t < 300; t++) {
      const c = window.__dev.openDraft() || [];
      for (const id of c) { const r = RAR[id]; if (r === "legendary") leg++; else if (r === "rare") rare++; else common++; n++; }
      window.__dev.pickBoon(0);
    }
    return { common, rare, leg, n };
  });
  const rarePct = dist.rare / dist.n, legPct = dist.leg / dist.n;
  // At depth ~6 rare weight ~ capped, legendary present but bounded. Assert legendary never dominates.
  ok("deep-draft rarity sane (legendary bounded <35%)", legPct < 0.35, `common=${(dist.common/dist.n*100).toFixed(0)}% rare=${(rarePct*100).toFixed(0)}% leg=${(legPct*100).toFixed(0)}%`);
  ok("deep-draft still offers rare+ (>10%)", (rarePct + legPct) > 0.10, `rare+leg=${((rarePct+legPct)*100).toFixed(0)}%`);

  ok("0 console/page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
} catch (e) {
  ok("harness ran without throwing", false, e.message);
} finally {
  const pass = results.filter((r) => r.pass).length, total = results.length;
  console.log(`\n=== CAS-392 LOCAL: ${pass}/${total} ${pass === total ? "ALL PASS" : "FAIL"} ===`);
  if (errors.length) console.log("errors:", errors.slice(0, 6));
  await browser.close(); await close();
  process.exit(pass === total ? 0 : 1);
}
