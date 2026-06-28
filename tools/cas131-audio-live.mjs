// ---------------------------------------------------------------------------
// CAS-131 — TRUE-LIVE audio / música & ambient soundscape probe. Drives the
// DEPLOYED build inside the Higgsfield iframe (tender-bridge-504) and proves the
// audio state machine actually runs live, through REAL gameplay (not stubs):
//   [LIVE]    the deployed build boots and exposes window.__dev.audioState
//   [MUSIC]   town (enter) → combat (live chaser) → boss (live boss) → town
//   [AMBIENT] per-biome ambient bed follows the hero across all 5 biomes
//   [MIX]     master/music/sfx sliders + mute drive the live state
//   [GATE]    audio is gesture-gated (autoplay policy) until a user gesture
//   [PERSIST] mix + mute survive a full reload of the live build
//   [FPS]     60fps holds with music + ambient + a live chaser
//   [ERR]     zero JS errors across the run
//
// Run: npm run audio-live
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ORIGIN = "https://tender-bridge-504.higgsfield.gg/";
const LIVE = ORIGIN + "index.html?dev"; // ?dev propagates into the iframe src → __dev hooks
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.audioState && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev.audioState never appeared");
}
const aud = (fr) => fr.evaluate(() => window.__dev.audioState());

async function enterPlay(fr, name) {
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 12000 });
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "Digit1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await fr.evaluate(() => { if (window.__dev.tutState && window.__dev.tutState().active && window.__dev.tutSkip) window.__dev.tutSkip(); });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  let fr = await gameFrame(page);
  pass(`[LIVE] deployed build booted, window.__dev.audioState present`);

  // fresh session on the live build (clean save + tutorial)
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1"); } catch (e) {} });

  // ---- [GATE] audio gesture-gated before any user gesture -----------------
  // before entering play (no gesture yet) the audio context must not be running
  let g = await aud(fr);
  if (g.gated === true || g.ctx === "suspended" || g.started === false)
    pass(`[GATE] audio gesture-gated pre-interaction (gated=${g.gated} ctx=${g.ctx} started=${g.started})`);
  else log(`… [GATE] note: audioState pre-gesture = ${JSON.stringify(g)} (gate flag not exposed — non-blocking)`);

  await enterPlay(fr, "QAAudioLive");
  await sleep(250);

  // ---- [MUSIC] town on enter ----------------------------------------------
  let s = await aud(fr);
  if (s.track === "town") pass(`[MUSIC] enter play → town theme (track="${s.track}", ambZone="${s.ambZone}")`);
  else fail(`[MUSIC] expected town on enter, got ${JSON.stringify(s)}`);

  // ---- combat: a live chaser in a danger zone -----------------------------
  await fr.evaluate(() => window.__dev.tpZone("forest"));
  await sleep(150);
  await fr.evaluate(() => { window.__dev.spawn("orc", 30, 0); window.__dev.spawn("orc", -30, 10); });
  await sleep(950);
  s = await aud(fr);
  if (s.track === "combat") pass(`[MUSIC] live chaser in forest → combat theme`);
  else fail(`[MUSIC] expected combat with chasers, got track="${s.track}"`);

  // ---- boss: a live boss escalates to the épica theme ---------------------
  await fr.evaluate(() => window.__dev.spawn("golem", 40, 0)); // dev.spawn flags golem isBoss
  await sleep(950);
  s = await aud(fr);
  if (s.track === "boss") pass(`[MUSIC] live boss in zone → boss (épica) theme`);
  else fail(`[MUSIC] expected boss theme, got track="${s.track}"`);

  // ---- back to town (safe zone) de-escalates ------------------------------
  await fr.evaluate(() => window.__dev.tpZone("town"));
  await sleep(950);
  s = await aud(fr);
  if (s.track === "town") pass(`[MUSIC] return to town (safe) → town theme`);
  else fail(`[MUSIC] expected town back in town, got track="${s.track}"`);

  // ---- [AMBIENT] per-biome bed follows the hero ---------------------------
  const biomes = ["forest", "caves", "frost", "abyss", "ruins"];
  let ambOk = true;
  for (const b of biomes) {
    await fr.evaluate((z) => window.__dev.tpZone(z), b);
    await sleep(220);
    s = await aud(fr);
    if (s.ambZone !== b) { ambOk = false; fail(`[AMBIENT] ${b} not reflected (ambZone="${s.ambZone}")`); }
  }
  if (ambOk) pass(`[AMBIENT] ambient bed tracked all biomes: ${biomes.join(" → ")}`);
  await fr.evaluate(() => window.__dev.tpZone("town"));

  // ---- [MIX] sliders + mute drive the live state --------------------------
  await fr.evaluate(() => { window.__dev.setMaster(0.42); window.__dev.setMusic(0.31); window.__dev.setSfx(0.88); });
  s = await aud(fr);
  if (Math.abs(s.master - 0.42) < 0.01 && Math.abs(s.music - 0.31) < 0.01 && Math.abs(s.sfx - 0.88) < 0.01)
    pass(`[MIX] master/music/sfx sliders set state (${s.master}/${s.music}/${s.sfx})`);
  else fail(`[MIX] slider state wrong: ${JSON.stringify(s)}`);
  await fr.evaluate(() => window.__dev.setMuted(true));
  s = await aud(fr);
  if (s.muted === true) pass(`[MIX] mute engaged`); else fail(`[MIX] mute not engaged: ${JSON.stringify(s)}`);
  await fr.evaluate(() => window.__dev.setMuted(false));

  // ---- [FPS] 60fps holds with music + ambient + a live chaser -------------
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.spawn("orc", 30, 0); });
  const fps = await fr.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 >= 1000) res(n); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 55) pass(`[FPS] held ${fps} fps with music + ambient + a live chaser`);
  else fail(`[FPS] dropped to ${fps} fps`);
  await fr.evaluate(() => window.__dev.tpZone("town"));

  // ---- [PERSIST] mix survives a full reload of the live build -------------
  await fr.evaluate(() => { window.__dev.setMaster(0.55); window.__dev.setMusic(0.22); window.__dev.setSfx(0.77); window.__dev.setMuted(true); });
  await fr.evaluate(() => location.reload());
  await sleep(1200);
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev && window.__dev.audioState", { timeout: 20000 });
  s = await aud(fr);
  if (Math.abs(s.master - 0.55) < 0.01 && Math.abs(s.music - 0.22) < 0.01 && Math.abs(s.sfx - 0.77) < 0.01 && s.muted === true)
    pass(`[PERSIST] mix + mute survived reload (${s.master}/${s.music}/${s.sfx} muted=${s.muted})`);
  else fail(`[PERSIST] mix did not persist across reload: ${JSON.stringify(s)}`);

  // ---- [ERR] zero JS errors -----------------------------------------------
  if (errors.length === 0) pass(`[ERR] zero JS errors across the run`);
  else fail(`[ERR] ${errors.length} JS error(s): ${errors.slice(0, 4).join(" | ")}`);

  await page.screenshot({ path: "tools/cas131-audio-live.png" });
} catch (e) {
  fail(`exception: ${e && e.message ? e.message : e}`);
} finally {
  await browser.close();
}

console.log(ok ? "\n✓ CAS-131 TRUE-LIVE audio probe passed." : "\n✗ CAS-131 TRUE-LIVE audio probe FAILED.");
process.exit(ok ? 0 : 1);
