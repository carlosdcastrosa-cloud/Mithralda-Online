// ---------------------------------------------------------------------------
// CAS-460 — INDEPENDENT QA gate for the CAS-447 sound-identity pass, run
// against the LIVE gh-pages deploy (pinned build b6a9874d9a37). Own harness,
// distinct from ENG's tools/cas131-audio.mjs: this one runs vs LIVE, under a
// STRICT autoplay policy (--autoplay-policy=user-gesture-required), and adds
// the gates ENG skipped (conservative defaults on first load, AudioContext
// suspended→running on a REAL gesture, mobile 390px touch, fps 3×-max).
//
//   1.  BUILD: live version.json build == expected AND window.__BUILD agrees
//   2.  DEFAULTS: fresh profile (no mithralda.audio.v1) → master 0.8 /
//       music 0.7 / sfx 0.9, muted=false — nothing deafens on first load
//   3.  AUTOPLAY: under user-gesture-required, every AudioContext created
//       pre-gesture is suspended (or none exists); after a REAL mouse click
//       + entering play, an AudioContext is running; no autoplay errors
//   4.  MUSIC: enter play → town theme
//   5.  MUSIC: live chasers in forest → combat theme
//   6.  MUSIC: live boss → boss theme
//   7.  MUSIC: back to town → town theme
//   8.  AMBIENT: bed follows the hero forest/caves/frost/abyss/ruins/SWAMP
//   9.  SFX new (CAS-447): regular mob death → sfx.mobDie (spy on the
//       page-imported singleton — same instance the sim holds)
//   10. SFX new: draft reroll (KeyR) → sfx.click
//   11. SFX new: live boss strike commit → sfx.bossAtk
//   12. MIX: master/music/sfx sliders + mute drive audioState
//   13. PERSIST: mix + mute survive a full reload (mithralda.audio.v1)
//   14. FPS: ≥58 with music + ambient + live chaser (3 samples, max)
//   15. MOBILE 390px touch: boot, REAL tap starts audio (AC running),
//       a real fight fires SFX, 0 errors
//   16. ERR: zero JS errors across the whole run (favicon filtered)
//
// Run:  node tools/cas460-audio-qa.mjs            (vs LIVE gh-pages)
//       LIVE_URL=<url> node tools/cas460-audio-qa.mjs
// ---------------------------------------------------------------------------
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = (process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECTED_BUILD = process.env.EXPECTED_BUILD || "b6a9874d9a37";
mkdirSync("shots/cas460", { recursive: true });

const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFav = (s) => /favicon\.ico/.test(s || "");

// STRICT autoplay policy: the live game must cope with the real-world rule
// that audio cannot start without a user gesture.
const browser = await puppeteer.launch({
  executablePath: exe, headless: true, protocolTimeout: 180000,
  args: [...LAUNCH_ARGS, "--autoplay-policy=user-gesture-required"],
});

function wire(page, errors) {
  page.on("pageerror", (e) => { if (!isFav(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("console", (m) => { if (m.type() !== "error") return;
    const loc = (m.location && m.location()) || {}; if (isFav(m.text()) || isFav(loc.url)) return;
    errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });
}
// Spy every AudioContext the page ever creates so the autoplay gate can read
// real ac.state transitions (audio.js keeps its ctx private).
const acSpy = (page) => page.evaluateOnNewDocument(() => {
  window.__acs = [];
  for (const K of ["AudioContext", "webkitAudioContext"]) {
    const Orig = window[K];
    if (!Orig) continue;
    window[K] = function (...a) { const c = new Orig(...a); window.__acs.push(c); return c; };
    window[K].prototype = Orig.prototype;
  }
});
const acStates = (page) => page.evaluate(() => window.__acs.map((c) => c.state));
const aud = (page) => page.evaluate(() => window.__dev.audioState());

async function boot(page, base, wipeAudio) {
  await page.goto(`${base}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','play'].includes(window.__dev.scene())", { timeout: 30000 });
  await page.evaluate((wa) => { try { window.__dev.clearSave(); window.__dev.noSave();
    if (wa) localStorage.removeItem("mithralda.audio.v1"); } catch (e) {} }, wipeAudio);
  if (await page.evaluate(() => window.__dev.scene()) !== "menu") {
    await page.reload({ waitUntil: "load", timeout: 45000 });
    await page.waitForFunction("window.__dev && window.__dev.scene()==='menu'", { timeout: 15000 });
  }
}
async function enterPlay(page, name, digit = "Digit1") {
  await page.evaluate((nm) => { const i = document.getElementById("nameInput"); if (i) i.value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}
// zone hop that skips the CAS-394 curse modal (freezes the sim tick otherwise)
async function tpz(page, z) {
  await page.evaluate((zz) => window.__dev.tpZone(zz), z);
  await sleep(250);
  if (await page.evaluate(() => window.__dev.scene()) === "curse") {
    await page.evaluate(() => window.__dev.skipCurse()); await sleep(120);
  }
}
// wrap every function on the page-side sfx singleton and count calls
async function installSfxSpy(page) {
  await page.evaluate(async () => {
    const { audio } = await import(new URL("audio.js", location.href).href);
    window.__sfxCalls = {}; window.__sfxTotal = 0;
    for (const k of Object.keys(audio.sfx)) {
      const orig = audio.sfx[k];
      if (typeof orig !== "function") continue;
      window.__sfxCalls[k] = 0;
      audio.sfx[k] = (...a) => { window.__sfxCalls[k]++; window.__sfxTotal++; return orig.apply(audio.sfx, a); };
    }
  });
}
const sfxCalls = (page) => page.evaluate(() => window.__sfxCalls);

try {
  // ---- 1. BUILD fingerprint --------------------------------------------------------------
  const vj = await fetch(`${LIVE}/version.json`).then((r) => r.json()).catch(() => null);
  const page = await browser.newPage();
  const errors = [];
  wire(page, errors);
  await acSpy(page);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await boot(page, LIVE, true);
  const winBuild = await page.evaluate(() => window.__BUILD || null); // window global, NOT a version.js import
  ok("1. BUILD live == expected", vj && vj.build === EXPECTED_BUILD && winBuild === EXPECTED_BUILD,
    `version.json=${vj && vj.build} __BUILD=${winBuild} expected=${EXPECTED_BUILD} files=${vj && vj.files}`);

  // ---- 2. conservative DEFAULTS on a virgin mix ---------------------------------------------
  // boot() wiped mithralda.audio.v1 BEFORE this reload path; state() reads the loaded mix.
  let s = await aud(page);
  const defOk = Math.abs(s.master - 0.8) < 0.001 && Math.abs(s.music - 0.7) < 0.001 &&
    Math.abs(s.sfx - 0.9) < 0.001 && s.muted === false;
  ok("2. DEFAULTS fresh load master0.8/music0.7/sfx0.9 muted=false", defOk,
    `master=${s.master} music=${s.music} sfx=${s.sfx} muted=${s.muted}`);

  // ---- 3. AUTOPLAY policy -------------------------------------------------------------------
  const pre = await acStates(page);
  const preOk = pre.every((st) => st !== "running"); // nothing runs before a gesture
  await page.mouse.click(640, 360);                  // REAL user gesture on the menu
  await enterPlay(page, "QA460");                    // audio.init()+resume()+start() fire on entry
  await page.mouse.click(640, 360);                  // gesture again inside play (resume path input.js)
  let post = [];
  for (let i = 0; i < 30; i++) { post = await acStates(page); if (post.includes("running")) break; await sleep(100); }
  const autoplayErr = errors.filter((e) => /AudioContext|autoplay/i.test(e));
  ok("3. AUTOPLAY suspended pre-gesture → running post-gesture, 0 autoplay errors",
    preOk && post.includes("running") && autoplayErr.length === 0,
    `pre=[${pre}] post=[${post}] autoplayErrs=${autoplayErr.length}`);

  // ---- 4-7. MUSIC state machine on real enemy state ------------------------------------------
  await sleep(300);
  s = await aud(page);
  ok("4. MUSIC enter play → town", s.track === "town", `track=${s.track} ambZone=${s.ambZone}`);

  await tpz(page, "forest");
  await page.evaluate(() => { window.__dev.spawn("orc", 30, 0); window.__dev.spawn("orc", -30, 10); });
  await sleep(900);
  s = await aud(page);
  ok("5. MUSIC live chasers → combat", s.track === "combat", `track=${s.track}`);

  await page.evaluate(() => window.__dev.spawn("golem", 40, 0));
  await sleep(900);
  s = await aud(page);
  ok("6. MUSIC live boss → boss", s.track === "boss", `track=${s.track}`);

  await tpz(page, "town");
  await sleep(900);
  s = await aud(page);
  ok("7. MUSIC back to town → town", s.track === "town", `track=${s.track}`);

  // ---- 8. AMBIENT follows the hero across all six biomes (swamp = CAS-447 add) ---------------
  const biomes = ["forest", "caves", "frost", "abyss", "ruins", "swamp"];
  const seen = [];
  for (const b of biomes) { await tpz(page, b); await sleep(220); seen.push((await aud(page)).ambZone); }
  ok("8. AMBIENT bed tracks forest/caves/frost/abyss/ruins/swamp",
    biomes.every((b, i) => seen[i] === b), `seen=[${seen}]`);
  await tpz(page, "town");

  // ---- 9-11. the three NEW SFX from REAL sim paths --------------------------------------------
  await installSfxSpy(page);
  await page.evaluate(() => window.__dev.spawnKill("orc"));
  await sleep(300);
  let c = await sfxCalls(page);
  ok("9. SFX regular mob death → sfx.mobDie", c.mobDie >= 1, `mobDie=${c.mobDie}`);

  await page.evaluate(() => window.__dev.openDraftZone("forest"));
  await sleep(200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", key: "r", bubbles: true })));
  await sleep(200);
  c = await sfxCalls(page);
  ok("10. SFX draft reroll (KeyR) → sfx.click", c.click >= 1, `click=${c.click}`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await sleep(200);

  await tpz(page, "forest");
  await page.evaluate(() => window.__dev.spawn("golem", 40, 0));
  let bossAtk = 0;
  for (let i = 0; i < 12; i++) { await sleep(400); c = await sfxCalls(page); bossAtk = c.bossAtk; if (bossAtk >= 1) break; }
  ok("11. SFX live boss strike commit → sfx.bossAtk", bossAtk >= 1, `bossAtk=${bossAtk}`);
  await tpz(page, "town");
  await page.screenshot({ path: "shots/cas460/desktop-play.png" });

  // ---- 12. MIX sliders + mute -----------------------------------------------------------------
  await page.evaluate(() => { window.__dev.setMaster(0.42); window.__dev.setMusic(0.31); window.__dev.setSfx(0.88); window.__dev.setMuted(true); });
  s = await aud(page);
  const mixOk = Math.abs(s.master - 0.42) < 0.01 && Math.abs(s.music - 0.31) < 0.01 && Math.abs(s.sfx - 0.88) < 0.01 && s.muted === true;
  ok("12. MIX sliders + mute drive audioState", mixOk, `${s.master}/${s.music}/${s.sfx} muted=${s.muted}`);

  // ---- 13. PERSIST across a full reload --------------------------------------------------------
  const rawKey = await page.evaluate(() => localStorage.getItem("mithralda.audio.v1"));
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.audioState", { timeout: 20000 });
  s = await aud(page);
  const perOk = rawKey && Math.abs(s.master - 0.42) < 0.01 && Math.abs(s.music - 0.31) < 0.01 && Math.abs(s.sfx - 0.88) < 0.01 && s.muted === true;
  ok("13. PERSIST mix + mute survive reload (mithralda.audio.v1)", perOk,
    `${s.master}/${s.music}/${s.sfx} muted=${s.muted} key=${rawKey ? "present" : "MISSING"}`);
  await page.evaluate(() => window.__dev.setMuted(false));

  // ---- 14. FPS with the audio graph live (3 samples, keep the max — known flake) ---------------
  await page.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.mouse.click(640, 360);
  await enterPlay(page, "QA460b");
  await tpz(page, "forest");
  await page.evaluate(() => window.__dev.spawn("orc", 30, 0));
  await sleep(400);
  let fps = 0;
  for (let i = 0; i < 3; i++) {
    const f = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
      requestAnimationFrame(tick);
    }));
    fps = Math.max(fps, f);
  }
  ok("14. FPS ≥58 with music + ambient + live chaser (max of 3)", fps >= 58, `${fps} fps`);

  // ---- 15. MOBILE 390px touch -------------------------------------------------------------------
  const mp = await browser.newPage();
  const mErr = [];
  wire(mp, mErr);
  await acSpy(mp);
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await boot(mp, LIVE, false);
  await mp.touchscreen.tap(195, 420);            // REAL touch gesture on the menu
  await enterPlay(mp, "QA460m", "Digit3");
  await mp.touchscreen.tap(195, 420);            // gesture inside play (resume path)
  let mAc = [];
  for (let i = 0; i < 30; i++) { mAc = await acStates(mp); if (mAc.includes("running")) break; await sleep(100); }
  await installSfxSpy(mp);
  await tpz(mp, "forest");
  await mp.evaluate(() => window.__dev.spawn("orc", 20, 0));
  let mTotal = 0;
  for (let i = 0; i < 25; i++) {
    await mp.touchscreen.tap(255, 420);          // tap-attack toward the mob
    await sleep(120);
    mTotal = await mp.evaluate(() => window.__sfxTotal);
    if (mTotal > 0) break;
  }
  await mp.screenshot({ path: "shots/cas460/mobile-390.png" });
  ok("15. MOBILE 390px: tap starts audio (AC running) + combat fires SFX, 0 errors",
    mAc.includes("running") && mTotal > 0 && mErr.length === 0,
    `ac=[${mAc}] sfxTotal=${mTotal} errs=${mErr.length}${mErr.length ? " :: " + mErr.join(" | ") : ""}`);
  await mp.close();

  // ---- 16. zero JS errors across the whole desktop run ------------------------------------------
  ok("16. ERR zero JS errors (favicon filtered)", errors.length === 0,
    errors.length ? errors.join(" | ") : "clean");
} catch (e) {
  ok("harness completed", false, (e && e.stack || String(e)).split("\n")[0]);
} finally {
  await browser.close();
}

const passN = results.filter((r) => r.pass).length;
console.log(`\n${passN}/${results.length} gates — ${passN === results.length ? "PASS" : "FAIL"}  (live=${LIVE}, expected build=${EXPECTED_BUILD})`);
process.exit(passN === results.length ? 0 : 1);
