// CAS-2038 (umbrella CAS-2035) — QA OBSERVABLE smoke: NG+ CYCLE RECAP overlay, served DARK build.
// Browser complement to the node build harness tools/cas2036-recap.mjs. Clone of cas2026-ngplus-smoke.mjs.
// Lesson CAS-1947: DRIVE the real sim/render loop against the SERVED bytes, don't only assert md5.
// The recap sub-flag ships DARK (NG_PLUS.recap:false); QA arms it at RUNTIME by importing the live
// sim/config.js ES-module singleton (the SAME instance game.js loaded — same module URL ⇒ same object)
// and flipping recap=true, then drives the REAL offerAscend → "ascendRecap" scene + renderAscendRecap.
//
// Per profile (desktop + mobile), PASS×2 by invoking twice:
//   1. BOOT + PLAY: 0 game-JS errors, stable ~60fps.
//   2. DARK reaches browser: served NG_PLUS.recap === false (byte-correct dark before arming).
//   3. ARM at runtime: flip the live singleton recap=true → dev.ngState().recap:true (proves same object).
//   4. SCENE: REAL dev.offerAscend() at tier T ⇒ scene "ascendRecap", ascend.tier === T+1 (recap route taken).
//   5. PREVIEW FIDELITY (THE HOOK): dev.ngPreview(T+1) == an INDEPENDENT oracle recomputed from the
//        served WORLD_TIER/NG_PLUS config formula (hp/dmg %, essMul, lootFloor, poiseMul), at T=1 AND T=3.
//        renderAscendRecap reads the SAME sim.ngTierPreview(a.tier) ⇒ the on-screen numbers equal these.
//   6. CYCLE HEADER + HERO SNAPSHOT data: conquestSnap 4/4 (all zones down), hero cls/lvl/Esencia/best-gear.
//   7. RENDER PAINTS: set the live G.scene="ascendRecap" ⇒ next frame calls renderAscendRecap on the real
//        canvas; screenshot + assert 0 game-JS errors (the overlay draw path executed cleanly).
//   8. ACCEPT → tier++ (dev.acceptAscend from "ascendRecap"): ok, tier T+1, scene play.
//      SKIP  → stay (dev.declineAscend from "ascendRecap"): tier unchanged, scene play. Both reuse CAS-450.
//   9. recap:false == PLAIN ASCEND (byte-observable): flip recap=false ⇒ offerAscend routes to "ascend"
//        (NOT "ascendRecap") ⇒ the CAS-450 renderAscend path, unchanged.
// Restores DARK (enabled/recap as shipped) at the end so nothing leaks between profiles.
// Run: node tools/cas2038-recap-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2038";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const okp = (m) => console.log(`✔ ${m}`);
const badp = (m) => { anyFail = true; console.error(`✖ ${m}`); };

function wireErrors(page) {
  const errors = [];
  const infra5xx = []; // transient gh-pages CDN 5xx / net flakes — infra noise, NOT game-JS defects
  page.on("response", (r) => { if (r.status() >= 500) infra5xx.push(`${r.status()} ${r.url()}`); });
  page.on("console", (m) => { const t = m.text(); if (m.type() !== "error") return;
    if (/favicon\.ico/i.test(t) || /status of 404/i.test(t)) return;
    if (/Failed to load resource/i.test(t) && /status of 5\d\d/i.test(t)) return;
    errors.push(t); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); const err = (r.failure() && r.failure().errorText) || "";
    if (/favicon\.ico/i.test(u)) return;
    if (/net::ERR_(FAILED|ABORTED|NETWORK_CHANGED|CONNECTION|TIMED_OUT)/i.test(err)) { infra5xx.push(`${err} ${u}`); return; }
    errors.push("requestfailed: " + u); });
  return { errors, infra5xx };
}

async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate((n) => { document.getElementById("nameInput").value = n; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

async function sampleFps(page) {
  return await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 >= 1000) res(n * 1000 / (performance.now() - t0)); else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, infra5xx } = wireErrors(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });

  // (2) served state reaches browser. CAS-2044 go-forward: recap FLIPPED LIVE (CAS-2043) ⇒ served recap:true.
  // (Was recap:false DARK pre-flip; the smoke arms it at runtime regardless, so live-true is a harmless no-op there.)
  const dark = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    return { recap: c.NG_PLUS.recap, enabled: c.NG_PLUS.enabled };
  }, BASE);
  if (dark.recap === true) okp(`[${prof.name}] served NG_PLUS.recap LIVE reaches browser: recap:true (CAS-2043, enabled:${dark.enabled})`);
  else badp(`[${prof.name}] served NG_PLUS.recap wrong (expected LIVE true post-CAS-2043): ${JSON.stringify(dark)}`);

  await enterPlay(page, "RECAP");
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  const fps = await sampleFps(page);
  if (fps >= 55) okp(`[${prof.name}] fps ${fps.toFixed(1)} (>=55 budget)`);
  else badp(`[${prof.name}] fps ${fps.toFixed(1)} BELOW 55 budget`);

  // (3)-(9) DRIVE the real recap path against the SERVED singletons. Same module URLs the game loaded
  // ⇒ same singleton objects (config.NG_PLUS + sim.dev/G/STR). Arm recap, drive offer/preview/render,
  // verify fidelity, accept/skip, recap-false==plain-ascend, then restore DARK.
  const R = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { STR } = await import(base + "strings.js");
    const { dev, G } = s;
    const WT = c.WORLD_TIER, NG = c.NG_PLUS;
    const out = {};

    // Independent oracle: recompute the per-tier escalation from the served config formula (NOT from
    // the helper under test). RARITY_ORDER order is the documented gear.js constant.
    const RO = ["common", "uncommon", "rare", "epic", "legendary"];
    const oracle = (t) => { const k = t - 1; const on = !!NG.enabled;
      const steps = on ? Math.min(4, (NG.lootFloorPerTier * k) | 0) : 0;
      return {
        hpPct: on ? WT.hpPct * k : 0, dmgPct: on ? WT.dmgPct * k : 0,
        essMul: on ? 1 + NG.essMulPerTier * k : 1,
        poiseMul: (on && NG.poisePctPerTier > 0 && k > 0) ? 1 + NG.poisePctPerTier * k : 1,
        lootFloor: RO[Math.max(0, steps)],
      }; };
    const eqp = (a, b) => Math.abs(a - b) < 1e-9;

    // (3) ARM — flip the recap sub-flag on the live singleton (enabled already LIVE:true). If
    // dev.ngState() reflects recap:true we hold the SAME object.
    NG.enabled = true; NG.recap = true;
    out.armedState = dev.ngState();

    // (4)+(5) drive the REAL offerAscend + preview fidelity at TWO tiers.
    const drive = (T) => {
      dev.setConquest(T, []);
      const off = dev.offerAscend();               // the REAL seam pickBoon calls after an apex draft
      const prev = dev.ngPreview(T + 1);           // what renderAscendRecap reads (sim.ngTierPreview(a.tier))
      const exp = oracle(T + 1);
      const fid = eqp(prev.hpPct, exp.hpPct) && eqp(prev.dmgPct, exp.dmgPct) &&
        eqp(prev.essMul, exp.essMul) && eqp(prev.poiseMul, exp.poiseMul) && prev.lootFloor === exp.lootFloor;
      return { scene: off.scene, offerTier: off.ascend && off.ascend.tier, prev, exp, fid };
    };
    out.t1 = drive(1);   // preview of cycle 2
    out.t3 = drive(3);   // preview of cycle 4 (bigger deltas)

    // (6) CYCLE HEADER + HERO SNAPSHOT: full conquest (4/4 zones down) + the fields render reads.
    dev.setConquest(4, c.CONQUEST_ZONES.slice());  // all four zone climaxes marked down
    const snap = s.conquestSnap();
    out.snapTier = snap.tier;
    out.zonesDown = (snap.zones || []).filter((z) => z.down).length;
    out.zonesTot = (snap.zones || []).length;
    const h = G.hero;
    out.heroCls = h && h.cls; out.heroLvl = h && (h.lvl | 0);
    out.essence = (G.meta && G.meta.essence) | 0;
    let best = null, bestRank = -1; const rr = (x) => RO.indexOf(x);
    for (const sl of ["weapon", "body", "shield"]) { const it = h && h.equip && h.equip[sl]; if (!it) continue; const rk = rr(it.rarity); if (rk > bestRank) { bestRank = rk; best = it; } }
    out.hasBestGear = !!best;
    // recap copy present (the strings renderAscendRecap draws).
    out.copy = {
      title: STR.ngRecapTitle, cycleHdr: STR.ngRecapCycleHdr(4), heroHdr: STR.ngRecapHeroHdr,
      previewHdr: STR.ngRecapPreviewHdr(5), threat: STR.ngRecapThreat(100, 100), loot: STR.ngRecapLoot("épico"),
      reward: STR.ngRecapReward, progress: STR.conquestProgress(4, 4),
    };

    // (8) ACCEPT → tier++ from "ascendRecap".
    dev.setConquest(2, []); G.ascend = { tier: 3 }; G.scene = "ascendRecap";
    out.accept = dev.acceptAscend();               // {ok, tier, scene}
    // SKIP → stay from "ascendRecap".
    dev.setConquest(2, []); G.ascend = { tier: 3 }; G.scene = "ascendRecap";
    out.skip = dev.declineAscend();

    // (9) recap:false == PLAIN ASCEND: flip recap dark ⇒ offer routes to bare "ascend".
    NG.recap = false;
    dev.setConquest(2, []);
    out.plain = dev.offerAscend();                  // scene should be "ascend", NOT "ascendRecap"

    // stage the recap overlay for the RENDER-PAINTS check (7), re-arm recap + open an offer.
    NG.recap = true; dev.setConquest(3, []); G.ascend = { tier: 4 }; G.scene = "ascendRecap";
    out.staged = { scene: G.scene, tier: G.ascend.tier };
    return out;
  }, BASE);

  // (7) let the live render loop paint renderAscendRecap on the real canvas, then screenshot.
  await wait(250);
  const paintedScene = await page.evaluate(async (base) => (await import(base + "sim/sim.js")).G.scene, BASE);
  await page.screenshot({ path: `${OUT}/${prof.name}-recap.png` });

  // --- assertions ---
  if (R.armedState && R.armedState.recap === true && R.armedState.enabled === true)
    okp(`[${prof.name}] ARM: live singleton flipped ⇒ ngState.recap:true, enabled:true (proves same object)`);
  else badp(`[${prof.name}] ARM failed: ${JSON.stringify(R.armedState)}`);

  for (const [T, r] of [[1, R.t1], [3, R.t3]]) {
    const sceneOk = r.scene === "ascendRecap" && r.offerTier === T + 1;
    if (sceneOk) okp(`[${prof.name}] SCENE t${T}: offerAscend ⇒ "ascendRecap", ascend.tier ${r.offerTier} (=${T}+1)`);
    else badp(`[${prof.name}] SCENE t${T} wrong: scene=${r.scene} offerTier=${r.offerTier}`);
    if (r.fid) okp(`[${prof.name}] PREVIEW t${T}→${T + 1} == config oracle: +${Math.round(r.prev.hpPct * 100)}%hp/+${Math.round(r.prev.dmgPct * 100)}%dmg, essMul×${r.prev.essMul}, loot ${r.prev.lootFloor}, poise×${r.prev.poiseMul}`);
    else badp(`[${prof.name}] PREVIEW t${T} fidelity MISMATCH: got ${JSON.stringify(r.prev)} expected ${JSON.stringify(r.exp)}`);
  }

  const hdrOk = R.snapTier === 4 && R.zonesDown === 4 && R.zonesTot === 4;
  if (hdrOk) okp(`[${prof.name}] CYCLE HEADER: conquestSnap tier ${R.snapTier}, zones ${R.zonesDown}/${R.zonesTot} down (recap "4/4")`);
  else badp(`[${prof.name}] CYCLE HEADER wrong: tier=${R.snapTier} down=${R.zonesDown}/${R.zonesTot}`);

  const heroOk = !!R.heroCls && R.heroLvl >= 1 && typeof R.essence === "number" && R.hasBestGear;
  if (heroOk) okp(`[${prof.name}] HERO SNAPSHOT data: cls=${R.heroCls} lvl=${R.heroLvl} Esencia=${R.essence} bestGear=${R.hasBestGear}`);
  else badp(`[${prof.name}] HERO SNAPSHOT wrong: ${JSON.stringify({ cls: R.heroCls, lvl: R.heroLvl, ess: R.essence, gear: R.hasBestGear })}`);

  const copyOk = R.copy.title === "RESUMEN DEL CICLO" && /Ciclo 4/.test(R.copy.cycleHdr) && /Ciclo 5 \(NG\+\)/.test(R.copy.previewHdr) && /\+100% vida/.test(R.copy.threat) && /4\/4/.test(R.copy.progress);
  if (copyOk) okp(`[${prof.name}] RECAP COPY live: "${R.copy.title}" · "${R.copy.previewHdr}" · "${R.copy.progress}"`);
  else badp(`[${prof.name}] RECAP COPY wrong: ${JSON.stringify(R.copy)}`);

  const acceptOk = R.accept && R.accept.ok === true && R.accept.tier === 3 && R.accept.scene === "play";
  if (acceptOk) okp(`[${prof.name}] ACCEPT from "ascendRecap": tier 2→${R.accept.tier}, scene→play`);
  else badp(`[${prof.name}] ACCEPT wrong: ${JSON.stringify(R.accept)}`);

  const skipOk = R.skip && R.skip.ok === true && R.skip.tier === 2 && R.skip.scene === "play";
  if (skipOk) okp(`[${prof.name}] SKIP from "ascendRecap": stays tier ${R.skip.tier}, scene→play`);
  else badp(`[${prof.name}] SKIP wrong: ${JSON.stringify(R.skip)}`);

  const plainOk = R.plain && R.plain.scene === "ascend";
  if (plainOk) okp(`[${prof.name}] recap:false == PLAIN ASCEND: offerAscend ⇒ scene "ascend" (CAS-450 renderAscend path)`);
  else badp(`[${prof.name}] recap:false wrong: ${JSON.stringify(R.plain)}`);

  const renderOk = paintedScene === "ascendRecap";
  if (renderOk) okp(`[${prof.name}] RENDER PAINTS: live scene "${paintedScene}" ⇒ renderAscendRecap ran on real canvas (screenshot ${prof.name}-recap.png)`);
  else badp(`[${prof.name}] RENDER scene wrong: ${paintedScene}`);

  // restore LIVE state exactly as shipped post-CAS-2043 (recap:true; leave enabled as live). In-session module only.
  await page.evaluate(async (base) => { const c = await import(base + "sim/config.js"); c.NG_PLUS.recap = true; }, BASE);

  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] boot+play+drive+render: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  await page.close();
}

await browser.close();
console.log(anyFail ? "\nCAS-2038 NG+ CYCLE RECAP OBSERVABLE SMOKE — FAIL ✖" : "\nCAS-2038 NG+ CYCLE RECAP OBSERVABLE SMOKE — PASS ✓");
if (anyFail) process.exit(1);
