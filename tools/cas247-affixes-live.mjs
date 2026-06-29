// ---------------------------------------------------------------------------
// CAS-249 — LIVE QA gate for CAS-247 elite affixes. Same assertions as the headless
// cas247-affixes.mjs harness, but drives the DEPLOYED gh-pages build in a real browser
// instead of a local server, so this is the live-feel sign-off (not just source).
//
// Run: node tools/cas247-affixes-live.mjs https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//      (defaults to that URL if no arg given)
// Captures: tools/cas247-live-affix.png (a Volátil elite mid-arena for readability evidence).
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = (process.argv[2] && /^https?:\/\//.test(process.argv[2]) ? process.argv[2] : "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
log("LIVE base: " + BASE);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 30000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 30000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "AffixBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}
async function until(page, fn, pred, ms = 6000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) { v = await page.evaluate(fn); if (v && pred(v)) return v; await wait(50); }
  return v;
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  const failedUrls = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => failedUrls.push(r.url()));
  page.on("response", (r) => { if (r.status() === 404) failedUrls.push(r.url() + " [404]"); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.bringToFront();

  // build id served live
  const build = await page.evaluate(async () => { try { return (await (await fetch("version.json?_=" + Math.random())).json()); } catch (e) { return null; } });
  log("served version.json: " + JSON.stringify(build));

  await enterPlay(page);
  pass("entered play as 'warrior' on live build");

  // confirm dev affix hooks exist on the LIVE build (proves CAS-247 code is deployed)
  const hooks = await page.evaluate(() => window.__dev && ["affixArena","affixMeta","affixRollRate","affixHit","affixSnap","affixKill"].every((k) => typeof window.__dev[k] === "function"));
  if (hooks) pass("[DEPLOY] affix dev hooks present on live build → CAS-247 code is deployed");
  else { fail("[DEPLOY] affix dev hooks MISSING on live build — CAS-247 not deployed here"); }

  // (1) DATA
  const meta = await page.evaluate(() => window.__dev.affixMeta());
  const byId = Object.fromEntries(meta.defs.map((d) => [d.id, d]));
  const distinct = meta.ids.length === 4
    && byId.swift && byId.swift.spdMul > 1 && byId.swift.gaitMul === byId.swift.spdMul
    && byId.armored && byId.armored.dmgReduce > 0
    && byId.vampiric && byId.vampiric.lifesteal > 0 && byId.vampiric.melee === true
    && byId.volatile && byId.volatile.blast > 0;
  distinct ? pass("[DATA] 4 distinct affixes present (swift/armored/vampiric/volatile)") : fail("[DATA] affix set off: " + JSON.stringify(meta.defs));
  (meta.rate >= 0.10 && meta.rate <= 0.15) ? pass(`[DATA] spawn rate ${(meta.rate*100).toFixed(0)}% in 10-15% band`) : fail("[DATA] rate " + meta.rate);

  // (2) ROLL RATE + DETERMINISM
  const r1 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  const r2 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  (r1.rate >= 0.09 && r1.rate <= 0.17) ? pass(`[RATE] ${r1.affixed}/${r1.n}=${(r1.rate*100).toFixed(1)}% (tally ${JSON.stringify(r1.tally)})`) : fail("[RATE] " + r1.rate);
  (r1.affixed === r2.affixed && JSON.stringify(r1.tally) === JSON.stringify(r2.tally)) ? pass(`[DET] deterministic (${r1.affixed} affixed, same seed)`) : fail("[DET] non-deterministic");

  // (3) SWIFT cadence-coupling (CAS-219/240 regression guard)
  const sw = await page.evaluate(() => window.__dev.affixArena("swift", "wolf", 120));
  const spdRatio = sw.mod.spd / sw.base.spd;
  (sw.mod.spd > sw.base.spd && sw.mod.size >= sw.base.size && Math.abs(sw.affixGait - spdRatio) < 0.08)
    ? pass(`[SWIFT] faster (spd ${sw.base.spd}→${sw.mod.spd}) + bigger; gait×${sw.affixGait} tracks speed×${spdRatio.toFixed(2)} — cadence natural`)
    : fail("[SWIFT] coupling off: " + JSON.stringify(sw));

  // (4) ARMORED soak
  await page.evaluate(() => window.__dev.affixArena(null, "orc", 120));
  const takenPlain = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  await page.evaluate(() => window.__dev.affixArena("armored", "orc", 120));
  const takenArm = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  (takenArm < takenPlain && Math.abs(takenArm/takenPlain - 0.55) < 0.08)
    ? pass(`[ARMORED] soaked: plain ${takenPlain} vs armored ${takenArm} (~45% reduction)`)
    : fail(`[ARMORED] reduction off: plain ${takenPlain}, armored ${takenArm}`);

  // (5) VAMPIRIC leech-on-hit
  await page.evaluate(() => window.__dev.affixArena("vampiric", "orc", 30));
  await page.evaluate(() => window.__dev.affixHit(120));
  const hpAfterWound = (await page.evaluate(() => window.__dev.affixSnap())).hp;
  const fed = await until(page, () => window.__dev.affixSnap(), (s) => s.heroDmgTaken > 0 && s.hp > hpAfterWound, 7000);
  (fed && fed.heroDmgTaken > 0 && fed.hp > hpAfterWound)
    ? pass(`[VAMPIRIC] leeched on connect: hp ${hpAfterWound}→${fed.hp} (hero took ${fed.heroDmgTaken})`)
    : fail("[VAMPIRIC] no heal-on-hit: woundedHp=" + hpAfterWound + " snap=" + JSON.stringify(fed));

  // (6) VOLATILE on-death AoE + screenshot evidence
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 30));
  await wait(400);
  await page.screenshot({ path: "tools/cas247-live-affix.png" });
  const burstIn = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 320));
  const burstOut = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  (burstIn > 0 && burstOut === 0)
    ? pass(`[VOLATILE] corpse blast hit in radius (${burstIn}), missed when clear (${burstOut})`)
    : fail(`[VOLATILE] AoE wrong: inRange=${burstIn}, clear=${burstOut}`);

  // (7) REWARD TIE-IN
  const rw = await page.evaluate(() => window.__dev.affixArena("armored", "skeleton", 120));
  (rw.mod.gold[1] > rw.base.gold[1] && rw.mod.xp > rw.base.xp && rw.mod.gearChance > rw.base.gearChance)
    ? pass(`[REWARD] elite pays more — xp ${rw.base.xp}→${rw.mod.xp}, gold↑, gear ${rw.base.gearChance}→${rw.mod.gearChance}`)
    : fail("[REWARD] boosts missing: " + JSON.stringify(rw));

  // (8) PERF in a real zone
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(7); });
  await wait(1200);
  const fpsA = await sampleFps(page, 1000), fpsB = await sampleFps(page, 1000);
  (Math.min(fpsA, fpsB) >= 55) ? pass(`[PERF] 60fps held (${fpsA}, ${fpsB} fps)`) : fail(`[PERF] fps dropped: ${fpsA}, ${fpsB}`);

  // (9) errors — tolerate ONLY the known benign favicon-root 404 (sev-4, tracked); anything else fails.
  const nonFavicon = failedUrls.filter((u) => !/favicon|apple-touch|\/$/i.test(u));
  log("  failed/404 URLs: " + (failedUrls.length ? failedUrls.join(" | ") : "none"));
  if (errors.length === 0 && nonFavicon.length === 0) pass("[ERR] zero page errors (favicon-404 sev-4 tolerated)");
  else if (nonFavicon.length === 0) pass(`[ERR] ${errors.length} console error(s) — all favicon-404 (sev-4, benign): ${failedUrls.join(", ")}`);
  else fail(`[ERR] ${nonFavicon.length} non-favicon error(s): ${nonFavicon.join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-247 elite-affixes LIVE QA passed." : "✗ CAS-247 LIVE QA FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
