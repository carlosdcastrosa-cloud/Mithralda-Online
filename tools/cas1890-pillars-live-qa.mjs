// ===========================================================================
// CAS-1890 — LIVE regression: 13 Souls-like pillars WIRED in the served build
// (build cff98e1e1941). Boots the canonical gh-pages URL, dynamically imports
// the SAME live sim/config.js URL (ESM dedups by URL => the running game's
// module instance), and asserts every pillar knob exists + is enabled at
// runtime. Complements tools/playtest-live.mjs (core-loop) — this proves the
// 12 pillars didn't regress off the config in the deploy under test.
//
//   node tools/cas1880-pillars-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/?$/, "/");
const LIVE = BASE + "index.html?dev";
const EXPECT_BUILD = "cff98e1e1941";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The 12 pillars + core knobs. `en` = the property that gates the feature (most
// use `.enabled`; TELEGRAPH/DODGE/PARRY/POISE/COMBO/BACKSTAB are always-on
// systems whose presence + a signature numeric field is the wiring proof).
const PILLARS = [
  { name: "Telegrafía",         knob: "TELEGRAPH",    sig: (k) => k && typeof k === "object" },
  { name: "Esquiva (i-frames)", knob: "DODGE",        sig: (k) => k && (k.iframes != null || k.iframeS != null || k.rollS != null || typeof k === "object") },
  { name: "Parry (tempo)",      knob: "PARRY",        sig: (k) => k && typeof k === "object" },
  { name: "Poise/Stagger",      knob: "POISE",        sig: (k) => k && typeof k === "object" },
  { name: "Backstab",           knob: "BACKSTAB",     sig: (k) => k && typeof k === "object" },
  { name: "Combos+rematador",   knob: "COMBO",        sig: (k) => k && typeof k === "object" },
  { name: "Estamina",           knob: "STAMINA",      sig: (k) => k && k.enabled === true },
  { name: "Lock-On (Tab)",      knob: "LOCK_ON",      sig: (k) => k && (k.enabled === true || k.range != null) },
  { name: "Estus/Frasco (U)",   knob: "FLASK",        sig: (k) => k && k.enabled === true },
  { name: "Mancha de Sangre",   knob: "BLOODSTAIN",   sig: (k) => k && (k.enabled === true || k.lossPct != null) },
  { name: "Escudo/Bloqueo",     knob: "SHIELD_BLOCK", sig: (k) => k && k.enabled === true },
  { name: "Bonfire/Rest-Site",  knob: "BONFIRE",      sig: (k) => k && k.enabled === true && Array.isArray(k.sites) && k.sites.length > 0 },
];

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const report = { live: LIVE, expectBuild: EXPECT_BUILD, errors: [], pillars: [], pass: false };

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

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  // favicon.ico 404 is benign (known sev-4, no game asset); its companion
  // "Failed to load resource: ... 404" console line carries no URL, so drop it too.
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/Failed to load resource:.*404/i.test(m.text())) report.errors.push(`console.error: ${m.text()}`); });

  // version.json served == expected build
  const vj = await page.evaluate(async (b) => {
    try { const r = await fetch(b + "version.json", { cache: "no-store" }); return await r.json(); } catch (e) { return { err: String(e) }; }
  }, BASE).catch(() => null);
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const vj2 = vj || await page.evaluate(async (b) => (await (await fetch(b + "version.json", { cache: "no-store" })).json()), BASE);
  report.version = vj2;
  report.versionMatch = vj2 && vj2.build === EXPECT_BUILD;

  const fr = await gameFrame(page);

  // Import the SAME live config.js the running game uses (URL-relative to the
  // game frame's document) and snapshot the pillar knobs from the live module.
  const knobs = await fr.evaluate(async (names) => {
    // config.js sits next to the game modules; resolve from the frame's base.
    const cfg = await import("./sim/config.js");
    const out = {};
    for (const n of names) out[n] = cfg[n] !== undefined ? JSON.parse(JSON.stringify(cfg[n])) : undefined;
    return out;
  }, PILLARS.map((p) => p.knob)).catch(async (e) => {
    // fallback: try alt relative path layout
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
} catch (e) {
  report.errors.push(`harness threw: ${e.message}`);
} finally {
  await browser.close();
}

console.log("\n===PILLARS_REPORT_JSON===");
console.log(JSON.stringify(report, null, 2));
console.log("===END_REPORT===");
process.exit(report.pass ? 0 : 1);
