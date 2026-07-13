// CAS-2302 — QA POST-FLIP LIVE OBSERVABLE + MULTIPLAYER for LIBRO DE LA ORDEN / ORDER LEDGER (SANCTUARY_LEDGER).
// Runs against the canonical LIVE gh-pages build (SANCTUARY_LEDGER.enabled:true LIVE via CTO flip CAS-2301) — the real
// production URL players use (board directive CAS-412). NOT a local server, NOT the retired Higgsfield mirror.
//
// Differentiator vs the DARK observable (CAS-2300, 17/17 PASS build c4a549ae2fa1):
//   * served sim/config.js SANCTUARY_LEDGER.enabled:true (the flip shipped) + build self-consistent vs version.json.
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has ledger().enabled===true (proof real players get the collective
//     marker, no injection). Per-hero order/unlock is null/false until the player pledges + crosses — that is the design.
//   * full-stack regression — the Sanctuary arc stack (OATH/EMISSARY/REWARDS/REP/WORLD_EVENT + BOUNTY/RECALL/SAFEZONE/
//     TEMPLE/RESTED) all still enabled:true, and the 3 DARK flags (BOSS_RUSH/SEEDED_CHALLENGE/DOORS_INTERIORS) stay false.
// Then the SAME observable + MULTIPLAYER evidence as DARK, on the LIVE build:
//   collective weekly marker (pure clock, convergence, ramp), per-hero contribution from monotonic counters, passives
//   at REAL chokepoints (dawn safeRegen / iron restedCap / wander recallCd), ★ nameplate, Tablón ledger-row, persist,
//   and the MANDATORY 2-CLIENT test (two independent pages, same nowMs ⇒ identical per-order baseline, 0 desync,
//   per-hero contribution without contention).
//
// Checks:
//   1  boots LIVE; build self-consistent vs version.json (NOT hardcoded); __dev.ledger + arc hooks + bountyTP; 0 err/404.
//   2  served config: SANCTUARY_LEDGER.enabled:true + Sanctuary arc stack all true + 3 DARK flags false.
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ ledger().enabled===true, heroOrder null, hasField false, unlocked false.
//   4  pure weekly clock: same nowMs ⇒ same period/baseline (determinista) AND baseline grows with frac (community ramp).
//   5  contribution derived from monotonic counters: fresh week ⇒ kill{30} ⇒ +150 (wKill 5); +grantRep{40} ⇒ 190 (wRep 1).
//   6  UNLOCK on cross ⇒ dawn passive safeRegen: unlocked true AND ledgerMulSafeRegen==0.20 (restedCap/recallCd untouched).
//   7  passive gated on the CROSS not on enabled: fresh low-frac week ⇒ unlocked false AND all ledgerMul*==0.
//   8  passive 'iron'=restedCap by EFFECTIVE-KNOB DELTA: restedCap(cross)−restedCap(no-cross)==600*0.25==150; mul 0→0.25.
//   9  passive 'wander'=recallCd by EFFECTIVE-KNOB DELTA: recallCdSec(no-cross)−recallCdSec(cross)==480*0.12==57.6; 0→0.12.
//  10  render nameplate ★: order en racha draws the ★ next to the tag (Δpx full-canvas vs pledged-no-unlocked).
//  11  render Tablón ledger-row: REAL nav (bountyTP+KeyE→bounty) ⇒ the Libro row changes the panel with ON vs OFF.
//  12  persist ON: saveBlob has 'ledgerAt' {period,killBase,repBase} numbers (weekly contribution survives reload).
//  13  arc regression full-stack: LEDGER+OATH+BOUNTY+REP+REWARDS+WORLD_EVENT+EMISSARY+RECALL all healthy with LEDGER ON.
//  14  fps NO-regression in a calm safezone: LEDGER ON ≥ OFF*0.9.
//  15  *** MULTIPLAYER 2-CLIENTE (mandatory) ***: 2 pages, same nowMs ⇒ orders[].baseline IDENTICAL per order
//      (convergence, 0 desync) AND per-hero contribution WITHOUT contention (A +500 kills, B unchanged).
//   0  no JS errors / no non-favicon 404 across the whole run.
// Run: node tools/cas2302-ledger-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2302-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const isFaviconOnly = (u) => /favicon/i.test(u || "");
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000.
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.97);      // frac ≈ 0.97 (community nearly fills the bar)
const T_EARLY = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);     // same week 5000, frac ≈ 0.02 (baseline ~0)
const T_FRESH = 6000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.50);     // NEW WEEK ⇒ re-snapshot base (fresh contribution)
const T_FRESH_LOW = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02); // NEW WEEK low frac ⇒ baseline ~0 + contribution 0 (gate)
const T_MP = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);        // 2-client test window
const T_IRON_LO = 9100 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // iron: fresh low-frac week (no cross) for knob delta
const T_WAND_LO = 9300 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // wander: idem
const T_STAR = 9500 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);      // dedicated week for the ★ probe (off0 genuinely NOT-unlocked)

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

async function freshPage(browser, errors, net404) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  // shared-origin save ⇒ clear so each page boots a FRESH hero (2 clients ⇒ 2 heroes) — warhorn/emissary footgun.
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page);
  return page;
}

async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
// arm the oath (order affiliation): enable oath+rep, grant rank, pledge <order>.
async function armOath(page, order) {
  await page.evaluate((o) => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); window.__dev.oath({ pledge: o }); }, order);
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404);
  await toHub(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot + hooks + build self-consistent + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.ledger + arc hooks + bountyTP; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: SANCTUARY_LEDGER.enabled:true + arc stack all true + 3 DARK false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), WORLD_EVENT: en("WORLD_EVENT"), BOUNTY: en("BOUNTY_BOARD"), RECALL: en("RECALL"),
      SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), SEEDED: en("SEEDED_CHALLENGE"), DOORS: en("DOORS_INTERIORS") };
  }, LIVE);
  const arcTrue = ["OATH","EMISSARY","REWARDS","REP","WORLD_EVENT","BOUNTY","RECALL","SAFEZONE","TEMPLE","RESTED"].every(k => cfg[k] === "true");
  const darkFalse = cfg.BOSS_RUSH === "false" && cfg.SEEDED === "false" && cfg.DOORS === "false";
  ok("2 served config: SANCTUARY_LEDGER.enabled:true + arc stack all true + 3 DARK (BOSS_RUSH/SEEDED/DOORS) false",
     cfg.LEDGER === "true" && arcTrue && darkFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot, ZERO __dev flip ⇒ ledger().enabled===true (real players get the collective
  // marker), heroOrder null (no auto-pledge — you must pledge an oath), unlocked false (no passive until you cross the
  // weekly goal), muls all 0 (inert). NOTE hasField===true is EXPECTED LIVE: the live tick snapshots the per-hero weekly
  // base h.ledgerAt on the first frame (byte-id OFF would leave it false, but the flip is ON) — it grants NOTHING until
  // pledge+cross (unlocked false, muls 0), so the DEFAULT-ON hero has zero mechanical advantage yet.
  const dOn = await page.evaluate(() => window.__dev.ledger());
  ok("3 DEFAULT-ON from served config: ledger().enabled===true + heroOrder null + unlocked false + muls 0 (inert; 0 __dev flip; hasField true = live tick snapshot, grants nothing)",
     dOn.enabled === true && dOn.heroOrder === null && dOn.unlocked === false && dOn.hasField === true && dOn.ledgerMulSafeRegen === 0 && dOn.ledgerMulRestedCap === 0 && dOn.ledgerMulRecallCd === 0,
     `enabled=${dOn.enabled} heroOrder=${dOn.heroOrder} hasField=${dOn.hasField} unlocked=${dOn.unlocked} muls={${dOn.ledgerMulSafeRegen},${dOn.ledgerMulRestedCap},${dOn.ledgerMulRecallCd}} goal=${dOn.goal}`);

  // 4 pure weekly clock: determinism + ramp
  const clock = await page.evaluate((TE, TL) => {
    const a = window.__dev.ledger({ nowMs: TL }), b = window.__dev.ledger({ nowMs: TL });
    const early = window.__dev.ledger({ nowMs: TE }).orders[0].baseline;
    const late = window.__dev.ledger({ nowMs: TL }).orders[0].baseline;
    return { detP: a.schedule.period === b.schedule.period, detB: JSON.stringify(a.orders.map(o => o.baseline)) === JSON.stringify(b.orders.map(o => o.baseline)), early, late };
  }, T_EARLY, T_LATE);
  ok("4 pure weekly clock: same nowMs ⇒ same period/baseline (determinista) AND baseline grows with frac (community fills the bar)",
     clock.detP && clock.detB && clock.late > clock.early, `early(0.02)=${clock.early} late(0.97)=${clock.late}`);

  // 5 contribution derived from monotonic counters (fresh week ⇒ re-snapshot ⇒ clean deltas)
  await armOath(page, "dawn");
  const contrib = await page.evaluate((T) => {
    const k = window.__dev.ledger({ nowMs: T, kill: { n: 30 } }).contribution;         // +30*wKill(5)=150
    const kr = window.__dev.ledger({ nowMs: T, grantRep: 40 }).contribution;            // same period ⇒ accumulate +40*wRep(1)=40 ⇒ 190
    return { k, kr };
  }, T_FRESH);
  ok("5 contribution DERIVED from monotonic counters: kill{30} ⇒ +150 (wKill 5); +grantRep{40} same period ⇒ 190 (wRep 1, accumulates)",
     contrib.k === 150 && contrib.kr === 190, JSON.stringify(contrib));

  // 6 unlock on cross ⇒ dawn passive = safeRegen 0.20
  await armOath(page, "dawn");
  const dawn = await page.evaluate((T) => {
    const l = window.__dev.ledger({ nowMs: T, kill: { n: 400 } });                      // +2000 pts ⇒ crosses 1000 with slack
    return { unlocked: l.unlocked, total: l.total, goal: l.goal, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_LATE);
  ok("6 UNLOCK on cross ⇒ dawn passive=safeRegen: unlocked true AND ledgerMulSafeRegen==0.20 AND restedCap/recallCd untouched",
     dawn.unlocked === true && dawn.total >= dawn.goal && near(dawn.mS, 0.20) && dawn.mC === 0 && dawn.mR === 0, JSON.stringify(dawn));

  // 7 passive gated on the CROSS, not on enabled
  const gated = await page.evaluate((T) => {
    const l = window.__dev.ledger({ nowMs: T });                                        // new week frac~0: baseline~0 + base reset ⇒ contribution 0
    return { unlocked: l.unlocked, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_FRESH_LOW);
  ok("7 PASSIVE gated on the CROSS (not on enabled): pledged but frac~0/no cross ⇒ unlocked false AND ledgerMul*==0",
     gated.unlocked === false && gated.mS === 0 && gated.mC === 0 && gated.mR === 0, JSON.stringify(gated));

  // 8 iron passive by EFFECTIVE-KNOB DELTA
  const iron = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "iron" });
    const lo = window.__dev.ledger({ nowMs: TLo });
    const hi = window.__dev.ledger({ nowMs: THi, kill: { n: 400 } });
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mCLo: lo.ledgerMulRestedCap, mCHi: hi.ledgerMulRestedCap, capLo: lo.restedCap, capHi: hi.restedCap };
  }, T_IRON_LO, T_LATE);
  ok("8 PASSIVE 'iron'=restedCap by EFFECTIVE-KNOB DELTA: restedCap(cross)−restedCap(no-cross)==600*0.25==150 AND ledgerMulRestedCap 0→0.25",
     iron.heroOrder === "iron" && iron.loUnlocked === false && iron.hiUnlocked === true && iron.mCLo === 0 && near(iron.mCHi, 0.25) && near(iron.capHi - iron.capLo, 150, 0.05), JSON.stringify(iron));

  // 9 wander passive by EFFECTIVE-KNOB DELTA
  const wander = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const lo = window.__dev.ledger({ nowMs: TLo });
    const hi = window.__dev.ledger({ nowMs: THi, kill: { n: 400 } });
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mRLo: lo.ledgerMulRecallCd, mRHi: hi.ledgerMulRecallCd, cdLo: lo.recallCdSec, cdHi: hi.recallCdSec };
  }, T_WAND_LO, T_LATE);
  ok("9 PASSIVE 'wander'=recallCd by EFFECTIVE-KNOB DELTA: recallCdSec(no-cross)−recallCdSec(cross)==480*0.12==57.6 AND ledgerMulRecallCd 0→0.12",
     wander.heroOrder === "wander" && wander.loUnlocked === false && wander.hiUnlocked === true && wander.mRLo === 0 && near(wander.mRHi, 0.12) && near(wander.cdLo - wander.cdHi, 57.6, 0.05), JSON.stringify(wander));

  // 10 render nameplate ★
  const star = await page.evaluate(async (T) => {
    window.dispatchEvent(new Event("focus"));
    await new Promise(r => setTimeout(r, 100));
    const realNow = Date.now; Date.now = () => T;
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const grab = () => Array.from(g.getImageData(0, 0, cv.width, cv.height).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    window.__dev.ledger({ nowMs: T }); window.__dev.oath({ pledge: "dawn" });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0Unlocked = window.__dev.ledger().unlocked, heroOrder = window.__dev.ledger().heroOrder;
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();
    window.__dev.ledger({ kill: { n: 500 } });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    const unlocked = window.__dev.ledger().unlocked;
    let signal = 0, churn = 0, maxDOn = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dBg > 25) churn++;
      if (dOn > maxDOn) maxDOn = dOn;
      if (dOn > 40 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = realNow;
    const hh = window.__dev.ledger().hero;
    return { signal, churn, maxDOn, unlocked, off0Unlocked, heroOrder, dead: hh && hh.dead };
  }, T_STAR);
  ok("10 render nameplate ★: order en racha draws the ★ next to the tag (Δpx full-canvas vs pledged-no-unlocked)",
     star.unlocked === true && star.off0Unlocked === false && star.heroOrder === "dawn" && star.dead === false && star.signal > 3,
     `signal=${star.signal} churn=${star.churn} maxDOn=${star.maxDOn} off0Unlocked=${star.off0Unlocked} heroOrder=${star.heroOrder} unlocked=${star.unlocked} dead=${star.dead}`);

  // 11 render ledger-row via REAL nav to the bounty board
  const row = await page.evaluate(async () => {
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e", bubbles: true }));
    window.__dev.ledger({ enabled: false });
    window.__dev.bountyTP();
    await new Promise(r => setTimeout(r, 60));
    let scene = "";
    for (let i = 0; i < 6 && (scene = window.__dev.scene()) !== "bounty"; i++) { press(); await new Promise(r => setTimeout(r, 90)); }
    scene = window.__dev.scene();
    if (scene !== "bounty") return { scene, signal: -1 };
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.18), y0 = Math.floor(cv.height * 0.10), bw = Math.floor(cv.width * 0.64), bh = Math.floor(cv.height * 0.80);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off = grab();
    window.__dev.ledger({ enabled: true });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 45) signal++;
    }
    press();
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 60));
    return { scene, signal, back: window.__dev.scene() };
  });
  ok("11 render ledger-row (REAL nav bountyTP+KeyE→bounty): the Libro row changes the panel with ON vs OFF (static panel)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);
  await page.screenshot({ path: join(OUT, "observable.png") });

  // 12 persist ON: save blob carries snapshot
  const persist = await page.evaluate((T) => {
    window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 10 } });
    const blob = window.__dev.saveBlob();
    return { hasKey: "ledgerAt" in blob, la: blob.ledgerAt };
  }, T_LATE);
  ok("12 persist ON: saveBlob has 'ledgerAt' {period,killBase,repBase} numbers (weekly contribution survives reload)",
     persist.hasKey === true && persist.la && typeof persist.la.period === "number" && typeof persist.la.killBase === "number" && typeof persist.la.repBase === "number",
     JSON.stringify(persist));

  // 13 arc regression full-stack
  await page.evaluate(async () => { for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    const l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("13 arc regr full-stack: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL healthy with LEDGER ON",
     arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 14 fps no-regression
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.ledger({ enabled: false }); const off = await measure();
    window.__dev.ledger({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("14 fps NO-regression: LEDGER ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fps.on >= fps.off * 0.9, `on≈${Math.round(fps.on)} off≈${Math.round(fps.off)}`);

  // 15 *** MULTIPLAYER 2-CLIENTE *** (AT THE END: a 2nd page blurs `page` ⇒ game-loop auto-pauses, index.html:113 — but no
  // render-probes remain). Two independent pages, SAME nowMs ⇒ orders[].baseline IDENTICAL per order (convergence, 0 desync).
  const pageB = await freshPage(browser, errors, net404);
  await toHub(pageB);
  const readBaselines = async (pg, order) => pg.evaluate((T, o) => {
    window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); window.__dev.oath({ pledge: o });
    const l = window.__dev.ledger({ nowMs: T });
    return { baselines: l.orders.map(x => [x.id, x.baseline]), period: l.schedule.period, frac: l.schedule.frac, heroOrder: l.heroOrder, contribution: l.contribution };
  }, T_MP, order);
  const mpA = await readBaselines(page, "dawn");
  const mpB = await readBaselines(pageB, "dawn");
  const mpAAfter = await page.evaluate((T) => window.__dev.ledger({ nowMs: T, kill: { n: 500 } }).contribution, T_MP);
  const mpBAfter = await pageB.evaluate((T) => window.__dev.ledger({ nowMs: T }).contribution, T_MP);
  await pageB.close();
  const baselinesMatch = JSON.stringify(mpA.baselines) === JSON.stringify(mpB.baselines);
  const clockMatch = mpA.period === mpB.period && near(mpA.frac, mpB.frac, 1e-9);
  const noContention = mpAAfter === mpA.contribution + 2500 && mpBAfter === mpB.contribution; // A +500*5, B unchanged
  ok("15 MULTIPLAYER 2-CLIENTE: 2 pages, same nowMs ⇒ orders[].baseline IDENTICAL per order (convergence, 0 desync) AND per-hero contribution WITHOUT contention",
     baselinesMatch && clockMatch && noContention && mpA.baselines.every(([, v]) => v > 0) && mpA.heroOrder === "dawn" && mpB.heroOrder === "dawn",
     `baselinesMatch=${baselinesMatch} clockMatch=${clockMatch} A:${mpA.contribution}→${mpAAfter} B:${mpB.contribution}→${mpBAfter} | A=${JSON.stringify(mpA.baselines)} B=${JSON.stringify(mpB.baselines)}`);

  ok("0 no JS errors + no non-favicon 404 during the whole run", errors.length === 0 && net404.length === 0,
     `err=[${errors.slice(0, 3).join(" | ")}] 404=[${net404.slice(0, 3).join(" | ")}]`);

  console.log(`\nLIVE build tested: ${build} (version.json=${verBuild})`);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack || e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
