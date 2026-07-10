// ===========================================================================
// CAS-1906 — LIVE regression: 15 Souls-like pillars WIRED in the served build
// (build b621205ffc42 / 799 files). Boots the canonical gh-pages URL, dynamically
// imports the SAME live sim/config.js URL (ESM dedups by URL => the running game's
// module instance), and asserts every pillar knob exists + is enabled at runtime.
// Complements tools/playtest-live.mjs (core-loop) — this proves the 14 pillars
// didn't regress off the config in the deploy under test. PASS x2 (desktop + mobile).
//
//   node tools/cas1906-pillars-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Delta vs cas1900 (14-pillar, build aea6ee9ab047):
//   - EXPECT_BUILD -> b621205ffc42 (Pilar 15 Two-Handing deploy, the latest gh-pages overlay)
//   - +TWO_HAND (#15 empuñadura a dos manos; sig: enabled + dmgMul>1 + poiseMul>1 + dropsShield)
//   - two profiles (desktop 1280x720 dsf1 + mobile 390x844 dsf2 touch) => PASS x2 wiring.
// The live served config (build b621205ffc42) carries all 15 pillars; this run imports
// that SAME live sim/config.js URL (ESM dedups by URL => the running game's module).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/?$/, "/");
const LIVE = BASE + "index.html?dev";
const EXPECT_BUILD = "b621205ffc42";
const UA_DESK = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const UA_MOB = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The 14 pillars + core knobs. `en` = the property that gates the feature (most
// use `.enabled`; TELEGRAPH/DODGE/PARRY/POISE/COMBO/BACKSTAB are always-on
// systems whose presence + a signature numeric field is the wiring proof).
const PILLARS = [
  { name: "1 Telegrafía",           knob: "TELEGRAPH",       sig: (k) => k && typeof k === "object" },
  { name: "2 Esquiva (i-frames)",   knob: "DODGE",           sig: (k) => k && (k.iframes != null || k.iframeS != null || k.rollS != null || typeof k === "object") },
  { name: "3 Parry (tempo)",        knob: "PARRY",           sig: (k) => k && typeof k === "object" },
  { name: "4 Poise/Stagger",        knob: "POISE",           sig: (k) => k && typeof k === "object" },
  { name: "5 Combos+rematador",     knob: "COMBO",           sig: (k) => k && typeof k === "object" },
  { name: "6 Backstab",             knob: "BACKSTAB",        sig: (k) => k && typeof k === "object" },
  { name: "7 Estamina",             knob: "STAMINA",         sig: (k) => k && k.enabled === true },
  { name: "8 Lock-On (Tab)",        knob: "LOCK_ON",         sig: (k) => k && (k.enabled === true || k.range != null) },
  { name: "9 Estus/Frasco (U)",     knob: "FLASK",           sig: (k) => k && k.enabled === true },
  { name: "10 Mancha de Sangre",    knob: "BLOODSTAIN",      sig: (k) => k && (k.enabled === true || k.lossPct != null) },
  { name: "11 Escudo/Bloqueo",      knob: "SHIELD_BLOCK",    sig: (k) => k && k.enabled === true },
  { name: "12 Bonfire/Rest-Site",   knob: "BONFIRE",         sig: (k) => k && k.enabled === true && Array.isArray(k.sites) && k.sites.length > 0 },
  { name: "13 Habil. enemigas",     knob: "ENEMY_ABILITIES", sig: (k) => k && k.enabled === true && k.lunge && k.slam },
  // #14: 4 bandas + mid=baseline (multiplicadores TODOS 1) + over deny (overCanRoll:false)
  { name: "14 Carga de Equipo",     knob: "EQUIP_LOAD",      sig: (k) => k && k.enabled === true && k.bands && k.mul
      && k.mul.mid && k.mul.mid.dist === 1 && k.mul.mid.iframe === 1 && k.mul.mid.stam === 1 && k.mul.mid.move === 1
      && k.overCanRoll === false && k.mul.over && k.mul.over.dist === 0 },
  // #15: postura a dos manos — enabled + dmgMul>1 + poiseMul>1 + dropsShield true (escudo se envaina => DENY block + peso sale de equipLoad)
  { name: "15 Empuñadura 2-manos", knob: "TWO_HAND",        sig: (k) => k && k.enabled === true && k.dmgMul > 1 && k.poiseMul > 1
      && k.dropsShield === true && typeof k.key === "string" && k.key.length > 0 },
];

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}

async function runProfile(browser, profile) {
  const report = { profile: profile.name, live: LIVE, expectBuild: EXPECT_BUILD, errors: [], pillars: [], pass: false };
  const page = await browser.newPage();
  await page.setUserAgent(profile.ua);
  await page.setViewport(profile.viewport);
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/Failed to load resource:.*404/i.test(m.text())) report.errors.push(`console.error: ${m.text()}`); });

  const vj = await page.evaluate(async (b) => {
    try { const r = await fetch(b + "version.json", { cache: "no-store" }); return await r.json(); } catch (e) { return { err: String(e) }; }
  }, BASE).catch(() => null);
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const vj2 = vj || await page.evaluate(async (b) => (await (await fetch(b + "version.json", { cache: "no-store" })).json()), BASE);
  report.version = vj2;
  report.versionMatch = vj2 && vj2.build === EXPECT_BUILD;

  const fr = await gameFrame(page);
  const knobs = await fr.evaluate(async (names) => {
    const cfg = await import("./sim/config.js");
    const out = {};
    for (const n of names) out[n] = cfg[n] !== undefined ? JSON.parse(JSON.stringify(cfg[n])) : undefined;
    return out;
  }, PILLARS.map((p) => p.knob)).catch(async () => {
    return fr.evaluate(async (names) => {
      const cfg = await import("../sim/config.js").catch(() => import("./config.js"));
      const out = {}; for (const n of names) out[n] = cfg[n] !== undefined ? JSON.parse(JSON.stringify(cfg[n])) : undefined;
      return out;
    }, PILLARS.map((p) => p.knob));
  });

  for (const p of PILLARS) {
    const k = knobs[p.knob];
    const present = k !== undefined && k !== null;
    const wired = present && p.sig(k);
    report.pillars.push({ pillar: p.name, knob: p.knob, present, wired,
      enabled: present && (k.enabled === undefined ? "(always-on)" : k.enabled) });
  }
  const allWired = report.pillars.every((p) => p.wired);
  report.pass = !!report.versionMatch && allWired && report.errors.length === 0;
  await page.close();
  return report;
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const profiles = [
  { name: "desktop", ua: UA_DESK, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 } },
  { name: "mobile",  ua: UA_MOB,  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const reports = [];
try {
  for (const p of profiles) reports.push(await runProfile(browser, p));
} catch (e) {
  reports.push({ profile: "?", errors: [`harness threw: ${e.message}`], pass: false });
} finally {
  await browser.close();
}

const pass = reports.length === 2 && reports.every((r) => r.pass);
console.log("\n===PILLARS_REPORT_JSON===");
console.log(JSON.stringify({ pass, build: EXPECT_BUILD, reports }, null, 2));
console.log("===END_REPORT===");
for (const r of reports) {
  const okN = (r.pillars || []).filter((p) => p.wired).length;
  console.log(`  ${r.profile}: pass=${r.pass} version=${r.versionMatch} pillars ${okN}/${(r.pillars||[]).length} wired errors=${(r.errors||[]).length}`);
}
process.exit(pass ? 0 : 1);
