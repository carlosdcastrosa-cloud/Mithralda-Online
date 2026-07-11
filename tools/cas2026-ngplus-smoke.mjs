// CAS-2026 (umbrella CAS-2023) — QA OBSERVABLE smoke: NG+ / Nueva Partida Plus, served DARK build.
// Browser complement to the node build harness tools/cas2023-ngplus.mjs. Lesson CAS-1947: DRIVE the
// real sim loop against the SERVED bytes, don't only assert md5. The knob ships DARK
// (NG_PLUS.enabled:false); QA arms it at RUNTIME by importing the live sim/config.js ES-module
// singleton (the SAME instance game.js loaded — same module URL ⇒ same object) and flipping
// enabled=true, then drives the real CAS-450 ascend/carry-over path + the 3 NG+ reward seams.
//
// Per profile (desktop + mobile), PASS×2 by invoking twice:
//   1. BOOT + PLAY: 0 game-JS errors, stable ~60fps.
//   2. DARK reaches browser: served NG_PLUS.enabled === false (byte-correct dark before arming).
//   3. ARM at runtime: flip the live singleton → dev.ngState() reads enabled:true (proves same object).
//   4. FULL CYCLE (tier 1 → APEX offer → acceptAscend → tier 2), all against the served modules:
//        (a) loot rarity FLOOR lifted on a champion clear (caves rare → epic at tier 2).
//        (b) Esencia reward SCALED by essMulPerTier (champion+affix term ×1 → ×1.25).
//        (c) carry-over INTACT: hero gear + banked Esencia unchanged across acceptAscend.
//        (d) world RE-ARMED: G.scene→play, G.ascend consumed, hunt board fresh (every climax summonable).
//        (e) NG+ reframe copy live: STR.ngAscendName(2) reads "Ciclo 2 · NG+".
//   5. DECLINE path still works (never forced): declineAscend keeps the current tier, returns to play.
//   6. OFF re-verify: flip enabled=false → ngState.enabled:false, ngLootFloor collapses to the base rarity.
// Restores DARK (enabled:false) at the end so nothing leaks between profiles.
// Run: node tools/cas2026-ngplus-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2026";
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

  // (2) served state reaches browser. CAS-2044 go-forward: NG+ FLIPPED LIVE (CAS-2029) ⇒ served enabled:true
  // (was enabled:false DARK pre-flip). Shape (cap/loot/ess/poise/reframe) unchanged. The smoke drives arm/OFF regardless.
  const dark = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    return { enabled: c.NG_PLUS.enabled, cap: c.NG_PLUS.cap, wtCap: c.WORLD_TIER.cap,
      loot: c.NG_PLUS.lootFloorPerTier, ess: c.NG_PLUS.essMulPerTier, poise: c.NG_PLUS.poisePctPerTier, reframe: c.NG_PLUS.reframePrompt };
  }, BASE);
  if (dark.enabled === true && dark.cap === dark.wtCap && dark.loot === 1 && dark.ess === 0.25 && dark.poise === 0 && dark.reframe === true)
    okp(`[${prof.name}] served NG_PLUS LIVE reaches browser: enabled:true (CAS-2029), lootFloorPerTier:${dark.loot}, essMulPerTier:${dark.ess}, poisePctPerTier:${dark.poise}, reframe:${dark.reframe}, cap:${dark.cap}==WORLD_TIER.cap`);
  else badp(`[${prof.name}] served NG_PLUS wrong (expected LIVE enabled:true post-CAS-2029): ${JSON.stringify(dark)}`);

  await enterPlay(page, "NGPLUS");
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  const fps = await sampleFps(page);
  if (fps >= 55) okp(`[${prof.name}] fps ${fps.toFixed(1)} (>=55 budget)`);
  else badp(`[${prof.name}] fps ${fps.toFixed(1)} BELOW 55 budget`);

  // (3)-(6) DRIVE the real cycle against the SERVED singletons. Import the SAME module URLs the game
  // loaded ⇒ same singleton objects (config.NG_PLUS + sim.dev/G/STR). Arm, drive, verify, restore DARK.
  const R = await page.evaluate(async (base) => {
    const c = await import(base + "sim/config.js");
    const s = await import(base + "sim/sim.js");
    const { STR } = await import(base + "strings.js");
    const { dev, G } = s;
    const out = {};

    // (3) ARM — flip the live singleton. If dev.ngState() sees enabled:true, we hold the SAME object.
    c.NG_PLUS.enabled = true;
    out.armedState = dev.ngState();

    // (4a) LOOT FLOOR lifted on a REAL champion clear — caves floor rare(t1) → epic(t2).
    dev.setConquest(1, []); const c1 = dev.ngChampClear("caves");
    dev.setConquest(2, []); const c2 = dev.ngChampClear("caves");
    out.lootT1 = c1 && c1.floor; out.lootT2 = c2 && c2.floor;
    out.dropT1 = c1 && c1.guaranteed; out.dropT2 = c2 && c2.guaranteed;
    // helper clamp: rare@t2→epic, epic@t2→legendary, rare@t5→legendary(clamped).
    out.hRareT2 = dev.ngLootFloor("rare", 2); out.hEpicT2 = dev.ngLootFloor("epic", 2); out.hClamp = dev.ngLootFloor("rare", 5);

    // (4b) ESENCIA scaled — champion+affix term (4 champs, 0 affix ⇒ base 100) ×1 → ×1.25.
    const e1 = dev.ngEssProbe(1, 4, 0), e2 = dev.ngEssProbe(2, 4, 0);
    out.essT1 = e1 && e1.delta; out.essT2 = e2 && e2.delta; out.essMul2 = e2 && e2.essMul;

    // (4c/d) CARRY-OVER + WORLD RE-ARM via the REAL acceptAscend export (the CAS-450 path the input
    // handler calls). Stage a hero with gear + banked Esencia at tier 1 and an open APEX offer.
    dev.setConquest(1, []);
    if (dev.metaGrant) dev.metaGrant(500);
    const ess0 = dev.metaGrant ? dev.metaGrant(0).essence : 0;
    const gear0 = JSON.stringify(dev.gear().equip);
    // G.hunts is a per-zone object {zone:{kills,champ,cleared}}. Mark a couple cleared to prove re-arm.
    if (G.hunts) { for (const z of ["forest", "caves"]) if (G.hunts[z]) G.hunts[z].cleared = true; }
    const clearedBefore = G.hunts ? Object.values(G.hunts).filter((h) => h.cleared).length : -1;
    // APEX fired ⇒ offer opens exactly as offerAscend() sets it (tier+1, scene "ascend").
    G.ascend = { tier: 2 }; G.scene = "ascend";
    const acc = dev.acceptAscend();
    out.acc = acc;
    out.gearAfter = JSON.stringify(dev.gear().equip);
    out.essAfter = dev.metaGrant ? dev.metaGrant(0).essence : 0;
    out.gear0 = gear0; out.ess0 = ess0;
    out.rearmedScene = G.scene; out.ascendConsumed = G.ascend === null;
    const clearedAfter = G.hunts ? Object.values(G.hunts).filter((h) => h.cleared).length : -1;
    out.reArmed = G.hunts && Object.values(G.hunts).every((h) => !h.cleared); // every climax summonable again
    out.clearedBefore = clearedBefore; out.clearedAfter = clearedAfter;

    // (4e) NG+ reframe copy live.
    out.ngName2 = STR.ngAscendName ? STR.ngAscendName(2) : null;
    out.baseName2 = STR.ascendName ? STR.ascendName(2) : null;

    // (5) DECLINE path — never forced: stay on current tier, back to play.
    dev.setConquest(2, []); G.ascend = { tier: 3 }; G.scene = "ascend";
    const dec = dev.declineAscend();
    out.dec = dec; out.declineScene = G.scene;

    // (6) OFF re-verify — flip dark, floor collapses to base rarity.
    c.NG_PLUS.enabled = false;
    out.offState = dev.ngState();
    out.offFloor = dev.ngLootFloor("rare", 2); // enabled:false ⇒ base "rare", no lift

    // restore LIVE state exactly as shipped post-CAS-2029 (enabled:true). In-session module only.
    c.NG_PLUS.enabled = true;
    return out;
  }, BASE);

  // --- assert the driven cycle ---
  if (R.armedState && R.armedState.enabled === true) okp(`[${prof.name}] ARM: live singleton flipped ⇒ ngState.enabled:true (tier ${R.armedState.tier}, essMul@2 ${R.armedState.essMul ?? "?"})`);
  else badp(`[${prof.name}] ARM failed: ${JSON.stringify(R.armedState)}`);

  const lootOk = R.lootT1 === "rare" && R.lootT2 === "epic" && R.hRareT2 === "epic" && R.hEpicT2 === "legendary" && R.hClamp === "legendary";
  if (lootOk) okp(`[${prof.name}] LOOT FLOOR lifted: caves champ clear rare(t1,drop ${R.dropT1}) → epic(t2,drop ${R.dropT2}); helper rare@t2→epic, epic@t2→legendary, rare@t5→legendary(clamp)`);
  else badp(`[${prof.name}] LOOT FLOOR wrong: t1=${R.lootT1} t2=${R.lootT2} hRareT2=${R.hRareT2} hEpicT2=${R.hEpicT2} hClamp=${R.hClamp}`);

  const essOk = R.essT1 === 100 && R.essT2 === 125 && Math.abs(R.essMul2 - 1.25) < 1e-9;
  if (essOk) okp(`[${prof.name}] ESENCIA scaled: champion+affix term ${R.essT1}(×1,t1) → ${R.essT2}(×1.25,t2)`);
  else badp(`[${prof.name}] ESENCIA wrong: t1=${R.essT1} t2=${R.essT2} mul2=${R.essMul2}`);

  const carryOk = R.acc && R.acc.ok === true && R.acc.tier === 2 && R.gearAfter === R.gear0 && R.essAfter === R.ess0;
  if (carryOk) okp(`[${prof.name}] CARRY-OVER intact: acceptAscend tier1→2, gear unchanged, Esencia banked ${R.ess0} unchanged`);
  else badp(`[${prof.name}] CARRY-OVER wrong: acc=${JSON.stringify(R.acc)} gearEq=${R.gearAfter === R.gear0} essAfter=${R.essAfter} ess0=${R.ess0}`);

  const rearmOk = R.rearmedScene === "play" && R.ascendConsumed === true && R.reArmed === true;
  if (rearmOk) okp(`[${prof.name}] WORLD RE-ARMED: scene→play, ascend offer consumed, hunt board fresh (${R.clearedBefore} cleared→${R.clearedAfter}) every climax summonable`);
  else badp(`[${prof.name}] WORLD RE-ARM wrong: scene=${R.rearmedScene} consumed=${R.ascendConsumed} reArmed=${R.reArmed} clearedAfter=${R.clearedAfter}`);

  if (R.ngName2 === "Ciclo 2 · NG+" && R.baseName2 === "Mundo 2") okp(`[${prof.name}] REFRAME copy live: NG+ "${R.ngName2}" (base CAS-450 "${R.baseName2}")`);
  else badp(`[${prof.name}] REFRAME copy wrong: ng="${R.ngName2}" base="${R.baseName2}"`);

  const declineOk = R.dec && R.dec.ok === true && R.dec.tier === 2 && R.declineScene === "play";
  if (declineOk) okp(`[${prof.name}] DECLINE path (never forced): declineAscend stays tier ${R.dec.tier}, returns to play`);
  else badp(`[${prof.name}] DECLINE wrong: ${JSON.stringify(R.dec)} scene=${R.declineScene}`);

  const offOk = R.offState && R.offState.enabled === false && R.offFloor === "rare";
  if (offOk) okp(`[${prof.name}] OFF re-verify: enabled:false ⇒ ngState dark + loot floor collapses to base "rare" (no lift)`);
  else badp(`[${prof.name}] OFF re-verify wrong: state=${JSON.stringify(R.offState)} floor=${R.offFloor}`);

  await page.screenshot({ path: `${OUT}/${prof.name}-postcycle.png` });

  if (infra5xx.length) console.log(`  · [${prof.name}] ${infra5xx.length} transient CDN 5xx/net flake(s) (infra, ignored): ${JSON.stringify(infra5xx.slice(0, 3))}`);
  if (errors.length === 0) okp(`[${prof.name}] boot+play+drive: 0 game-JS errors`);
  else badp(`[${prof.name}] ${errors.length} game-JS error(s): ${JSON.stringify(errors.slice(0, 5))}`);
  await page.close();
}

await browser.close();
console.log(anyFail ? "\nCAS-2026 NG+ OBSERVABLE SMOKE — FAIL ✖" : "\nCAS-2026 NG+ OBSERVABLE SMOKE — PASS ✓");
if (anyFail) process.exit(1);
