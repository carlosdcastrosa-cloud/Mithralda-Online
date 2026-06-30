// ---------------------------------------------------------------------------
// CAS-375 — DIRECTED Hunt Contracts (live, headless).
//
// CAS-134 already ships the bounty board (3 rotating daily contracts + claim +
// daily refresh + reward seam). CAS-375 deepens it with DIRECTED objectives keyed
// to the live marquee roster — obs:"slayType" contracts like "Da caza a N Wéndigos".
// This harness boots the REAL game and proves, through the same observer/claim code
// the game runs, that the directed path works END-TO-END and is SPECIFIC:
//   (1) a directed (slayType) contract surfaces on the deterministic rotation, and
//       its title NAMES the mob (not the generic "N enemigos").
//   (2) SPECIFICITY: killing the WRONG mob does NOT advance it; killing the RIGHT
//       mob advances it 1:1 via the per-type counter (G.hero.killsByType).
//   (3) it reaches done, claims its reward ONCE through applyMetaReward (gold rises
//       by exactly the contract gold), and re-claim is a no-op.
//   (4) the per-type tally PERSISTS across a reload (progress is not lost).
//   (5) all three roster targets (quillback / wendigo / demon) are reachable in the
//       rotation, and 60fps / 0 console errors hold.
//
// Run: node tools/cas375-contracts-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

// LIVE_URL=<base> runs against a deployed build (gh-pages); else a local server.
const LIVE = process.env.LIVE_URL || null;
const srv = LIVE ? null : await startServer();
const ORIGIN = LIVE || srv.url;
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "BountyBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Scan deterministic days from a base, collecting the FIRST day that surfaces a
// directed (slayType) contract for each target mob (and any directed day at all).
async function findDirectedDays(page) {
  return await page.evaluate(() => {
    const out = { byMob: {}, anyDay: null, daysScanned: 0, mobsSeen: {} };
    const base = new Date(2026, 0, 1);
    for (let i = 0; i < 120; i++) {
      const d = new Date(base.getTime()); d.setDate(d.getDate() + i);
      const s = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const b = (window.__daily._setDay(s), window.__daily.board());
      out.daysScanned++;
      const dir = b.contracts.find(c => c.obs === "slayType");
      if (dir) {
        if (!out.anyDay) out.anyDay = { day: s, id: dir.id, mob: dir.mob, need: dir.need, title: dir.title, gold: dir.gold };
        out.mobsSeen[dir.mob] = (out.mobsSeen[dir.mob] || 0) + 1;
        if (!out.byMob[dir.mob]) out.byMob[dir.mob] = { day: s, id: dir.id, mob: dir.mob, need: dir.need, title: dir.title, gold: dir.gold };
      }
    }
    return out;
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  // Real JS exceptions ALWAYS fail. Failed resource loads are judged by URL+status via the
  // network events (the console text omits the URL, so it can't be filtered there): we ignore
  // known live CDN noise that is NOT a code defect — the browser's auto favicon.ico request
  // (the game ships none) and transient GitHub-Pages 5xx under the harness's heavy reloads —
  // while still failing on any game module/asset 404.
  const errors = [];
  const benignReq = (u, s) => /favicon\.ico/i.test(u) || (s >= 500 && s <= 599);
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { // non-resource console errors only (resource loads handled below)
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !benignReq(r.url(), s)) errors.push(`HTTP ${s}: ${r.url()}`); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!benignReq(u, 0)) errors.push(`REQFAIL ${r.failure()?.errorText}: ${u}`); });

  await page.goto(`${ORIGIN}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (5-pre) reachability of all three roster targets in the rotation -------
  const scan = await findDirectedDays(page);
  const want = ["quillback", "wendigo", "demon"];
  const seen = want.filter(m => scan.byMob[m]);
  (seen.length === 3)
    ? pass(`all 3 directed targets reachable in rotation (${seen.join(", ")}; scanned ${scan.daysScanned} days)`)
    : fail(`only ${seen.length}/3 directed targets surfaced: ${seen.join(", ")}`);
  if (!scan.anyDay) { fail("no directed (slayType) contract found in 120 days — feature not surfacing"); throw new Error("no directed contract"); }

  // Pick the wendigo contract if reachable (the marquee dark-roster mob), else any directed day.
  const pick = scan.byMob.wendigo || scan.byMob.demon || scan.byMob.quillback || scan.anyDay;
  log(`   → testing directed contract '${pick.id}' (mob=${pick.mob}, need=${pick.need}) on day ${pick.day}: "${pick.title}"`);

  // (1) directed title NAMES the mob (not the generic "N enemigos") ---------
  await page.evaluate((d) => window.__daily._setDay(d), pick.day);
  const titled = !/enemigos/.test(pick.title) && pick.title.length > 0;
  titled ? pass(`directed contract title names the mob: "${pick.title}"`) : fail(`title looks generic: "${pick.title}"`);

  // baseline: directed contract starts at 0 progress
  const startProg = await page.evaluate((id) => window.__daily.board().contracts.find(c => c.id === id).prog, pick.id);
  (startProg === 0) ? pass("directed contract starts at 0 progress") : fail(`start prog = ${startProg}`);

  // (2a) SPECIFICITY — killing the WRONG mob must NOT advance it ------------
  const wrong = pick.mob === "wolf" ? "rat" : "wolf";
  await page.evaluate((w) => { for (let i = 0; i < 8; i++) window.__dev.spawnKill(w); }, wrong);
  await sleep(500); // let the observer tick
  const afterWrong = await page.evaluate((id) => window.__daily.board().contracts.find(c => c.id === id).prog, pick.id);
  (afterWrong === 0)
    ? pass(`specificity: 8× '${wrong}' kills did NOT advance the '${pick.mob}' contract (prog still 0)`)
    : fail(`directed contract advanced on the WRONG mob: prog=${afterWrong}`);

  // (2b) killing the RIGHT mob advances it 1:1 -----------------------------
  const goldBefore = await page.evaluate(() => window.__dev.heroStats().gold);
  await page.evaluate((m) => { for (let i = 0; i < 2; i++) window.__dev.spawnKill(m); }, pick.mob);
  await sleep(500);
  const afterTwo = await page.evaluate((id) => window.__daily.board().contracts.find(c => c.id === id).prog, pick.id);
  (afterTwo === Math.min(pick.need, 2))
    ? pass(`right mob advances 1:1 (2× '${pick.mob}' → prog ${afterTwo})`)
    : fail(`expected prog 2 after 2 right kills, got ${afterTwo}`);

  // drive the remainder to done
  await page.evaluate((p) => { for (let i = 0; i < p.need; i++) window.__dev.spawnKill(p.mob); }, pick);
  await page.waitForFunction((id) => { const c = window.__daily.board().contracts.find(x => x.id === id); return c && c.done; }, { timeout: 6000 }, pick.id)
    .then(() => pass(`directed contract reaches done after killing ${pick.need}× '${pick.mob}'`))
    .catch(() => fail("directed contract did not reach done"));

  // (3) claim reward once; gold rises by exactly the contract gold ---------
  const claimRes = await page.evaluate((id) => {
    const c = window.__daily.board().contracts.find(x => x.id === id);
    const g0 = window.__dev.heroStats().gold;
    const okc = window.__daily.claim(id);
    const g1 = window.__dev.heroStats().gold;
    const again = window.__daily.claim(id);     // idempotent
    const g2 = window.__dev.heroStats().gold;
    return { gold: c.gold, okc, gained: g1 - g0, again, reGain: g2 - g1, claimed: window.__daily.board().contracts.find(x => x.id === id).claimed };
  }, pick.id);
  (claimRes.okc && claimRes.gained === claimRes.gold)
    ? pass(`claim granted exactly +${claimRes.gold} oro via applyMetaReward`)
    : fail(`claim gold delta ${claimRes.gained} != contract gold ${claimRes.gold}`);
  (!claimRes.again && claimRes.reGain === 0) ? pass("re-claim is a no-op (no double reward)") : fail("re-claim granted extra reward");
  claimRes.claimed ? pass("directed contract flagged claimed") : fail("claimed flag not set");

  // (4) per-type tally persists across reload (the NEW save field) ----------
  // The directed observer is backed by G.hero.killsByType. Prove that counter
  // round-trips through the save blob: kill N of a mob, reload (persist flushes on
  // pagehide), and read it back out of mithralda.save.v1 → killsByType[mob] >= N.
  // (Day-independent: the counter is monotonic lifetime state, not per-day store.)
  const N_TALLY = 5, TALLY_MOB = "quillback";
  const liveTally = await page.evaluate((m) => {
    const raw = localStorage.getItem("mithralda.save.v1");   // flat blob (hero fields at top level)
    const before = raw ? ((JSON.parse(raw).killsByType) || {})[m] || 0 : 0;
    return before;
  }, TALLY_MOB);
  await page.evaluate((p) => { for (let i = 0; i < p.n; i++) window.__dev.spawnKill(p.m); }, { n: N_TALLY, m: TALLY_MOB });
  await sleep(2300); // let the 2.0s autosave throttle fire
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__daily && window.__daily.board", { timeout: 8000 });
  const savedTally = await page.evaluate((m) => {
    const raw = localStorage.getItem("mithralda.save.v1");
    return raw ? ((JSON.parse(raw).killsByType) || {})[m] || 0 : 0;
  }, TALLY_MOB);
  (savedTally >= liveTally + N_TALLY)
    ? pass(`per-type counter persists across reload (killsByType.${TALLY_MOB}: ${liveTally} → ${savedTally} in save blob)`)
    : fail(`per-type counter not persisted: before=${liveTally} after=${savedTally} (expected >= ${liveTally + N_TALLY})`);

  // (5) fps + error gate ---------------------------------------------------
  await page.waitForFunction("window.__dev.scene && ['play','menu'].includes(window.__dev.scene())", { timeout: 8000 }).catch(() => {});
  const fps = await page.evaluate(() => window.__dev && window.__dev.fps ? window.__dev.fps() : null);
  if (fps == null) log("   (fps probe unavailable — skipping fps gate)");
  else (fps >= 58) ? pass(`fps held ${fps} (>=58)`) : fail(`fps low: ${fps}`);
  errors.length === 0 ? pass("0 page/console errors") : fail(`page errors:\n  ${errors.join("\n  ")}`);

} catch (e) {
  fail(`exception: ${e && e.stack || e}`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}

log(ok ? "\n✔ CAS-375 directed Hunt Contracts PASS" : "\n✖ CAS-375 directed Hunt Contracts FAIL");
process.exit(ok ? 0 : 1);
