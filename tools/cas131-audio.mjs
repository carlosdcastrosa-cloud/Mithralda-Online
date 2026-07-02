// ---------------------------------------------------------------------------
// CAS-131 — audio / música & ambient soundscape QA harness (local committed build).
//
// Boots the REAL game headless and drives the REAL sim so the audio state
// machine is exercised through genuine gameplay, not stubbed calls:
//   [MUSIC]  town (enter play) → combat (a live chaser in a danger zone) →
//            boss (a live boss/champion) → back to town (safe zone) — each
//            transition driven by real enemy state, asserted via audioState().
//   [AMBIENT]per-biome ambient bed follows the hero across zones (forest/caves/
//            frost/abyss), morphing on a real zone change.
//   [MIX]    master/music/sfx sliders + mute drive the persisted state.
//   [PERSIST]volume + mute survive a full page reload (separate from the save).
//   [FPS]    60fps holds with music + ambient + crossfades live.
//   [ERR]    zero JS errors across the run.
//
// Run: npm run audio   (node tools/cas131-audio.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const aud = (page) => page.evaluate(() => window.__dev.audioState());

async function freshBoot(page) {
  await page.evaluate(() => { try { if (window.__dev && window.__dev.noSave) window.__dev.noSave();
    localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.tut.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
}
async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
  await page.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "Digit1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
// CAS-447: CAS-394 landed AFTER this harness — the FIRST entry into a combat zone
// pauses into the curse-offer modal, freezing the sim tick (music/ambience stop
// updating and spawned mobs never aggro). Every zone hop goes through tpz() so the
// offer is skipped and the tick resumes.
async function tpz(page, z) {
  await page.evaluate((zz) => window.__dev.tpZone(zz), z);
  await wait(250);
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc === "curse") { await page.evaluate(() => window.__dev.skipCurse()); await wait(120); }
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await freshBoot(page);
  await enterPlay(page, "QAAudio");
  await wait(200);

  // ---- [MUSIC] town on enter ----------------------------------------------
  let s = await aud(page);
  if (s.track === "town") pass(`[MUSIC] enter play → town theme (track="${s.track}", ambZone="${s.ambZone}")`);
  else fail(`[MUSIC] expected town on enter, got ${JSON.stringify(s)}`);

  // ---- combat: a live chaser in a danger zone -----------------------------
  await tpz(page, "forest");
  await page.evaluate(() => { window.__dev.spawn("orc", 30, 0); window.__dev.spawn("orc", -30, 10); });
  await wait(900); // chasers aggro + the crossfade (220ms) completes
  s = await aud(page);
  if (s.track === "combat") pass(`[MUSIC] live chaser in forest → combat theme`);
  else fail(`[MUSIC] expected combat with chasers, got track="${s.track}"`);

  // ---- boss: a live boss escalates to the épica theme ---------------------
  await page.evaluate(() => window.__dev.spawn("golem", 40, 0)); // dev.spawn flags golem isBoss
  await wait(900);
  s = await aud(page);
  if (s.track === "boss") pass(`[MUSIC] live boss in zone → boss (épica) theme`);
  else fail(`[MUSIC] expected boss theme, got track="${s.track}"`);

  // ---- back to town (safe zone) de-escalates ------------------------------
  await tpz(page, "town");
  await wait(900);
  s = await aud(page);
  if (s.track === "town") pass(`[MUSIC] return to town (safe) → town theme`);
  else fail(`[MUSIC] expected town back in town, got track="${s.track}"`);

  // ---- [AMBIENT] per-biome bed follows the hero ---------------------------
  // CAS-447: swamp added — the Ciénaga (CAS-441) must carry its own ambient bed too.
  const biomes = ["forest", "caves", "frost", "abyss", "ruins", "swamp"];
  let ambOk = true;
  for (const b of biomes) {
    await tpz(page, b);
    await wait(200);
    s = await aud(page);
    if (s.ambZone !== b) { ambOk = false; fail(`[AMBIENT] ${b} not reflected (ambZone="${s.ambZone}")`); }
  }
  if (ambOk) pass(`[AMBIENT] ambient bed tracked all biomes: ${biomes.join(" → ")}`);
  await tpz(page, "town");

  // ---- [SFX] CAS-447 completion pass: click / mobDie / bossAtk fire from ---
  // REAL sim paths. The audio module is a singleton: importing it from the page
  // yields the SAME instance the sim holds, so wrapping sfx.* counts real calls.
  await page.evaluate(async () => {
    const { audio } = await import(new URL("audio.js", location.href).href);
    window.__sfxCalls = { click: 0, mobDie: 0, bossAtk: 0 };
    for (const k of Object.keys(window.__sfxCalls)) {
      const orig = audio.sfx[k];
      if (typeof orig !== "function") { window.__sfxCalls[k] = -9999; continue; }
      audio.sfx[k] = (...a) => { window.__sfxCalls[k]++; return orig.apply(audio.sfx, a); };
    }
  });
  const calls = () => page.evaluate(() => window.__sfxCalls);
  // mobDie: a regular (non-boss) kill through the real death path.
  await page.evaluate(() => window.__dev.spawnKill("orc"));
  await wait(300);
  s = await calls();
  if (s.mobDie >= 1) pass(`[SFX] regular mob death → sfx.mobDie fired (${s.mobDie})`);
  else fail(`[SFX] sfx.mobDie did not fire on a real mob kill: ${JSON.stringify(s)}`);
  // click: draft reroll (KeyR) — one of the 4 call sites that were silent pre-CAS-447.
  await page.evaluate(() => window.__dev.openDraftZone("forest"));
  await wait(200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyR", key: "r", bubbles: true })));
  await wait(200);
  s = await calls();
  if (s.click >= 1) pass(`[SFX] draft reroll → sfx.click fired (${s.click})`);
  else fail(`[SFX] sfx.click did not fire on draft reroll: ${JSON.stringify(s)}`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }))); // resolve the draft
  await wait(200);
  // bossAtk: a live boss committing a strike near the hero (audible telegraph).
  await tpz(page, "forest");
  await page.evaluate(() => window.__dev.spawn("golem", 40, 0));
  await wait(3500);
  s = await calls();
  if (s.bossAtk >= 1) pass(`[SFX] boss strike commit → sfx.bossAtk fired (${s.bossAtk})`);
  else fail(`[SFX] sfx.bossAtk did not fire from a live boss strike: ${JSON.stringify(s)}`);
  await tpz(page, "town");

  // ---- [MIX] sliders + mute drive the state -------------------------------
  await page.evaluate(() => { window.__dev.setMaster(0.42); window.__dev.setMusic(0.31); window.__dev.setSfx(0.88); });
  s = await aud(page);
  if (Math.abs(s.master - 0.42) < 0.01 && Math.abs(s.music - 0.31) < 0.01 && Math.abs(s.sfx - 0.88) < 0.01)
    pass(`[MIX] master/music/sfx sliders set state (${s.master}/${s.music}/${s.sfx})`);
  else fail(`[MIX] slider state wrong: ${JSON.stringify(s)}`);
  await page.evaluate(() => window.__dev.setMuted(true));
  s = await aud(page);
  if (s.muted === true) pass(`[MIX] mute engaged`); else fail(`[MIX] mute not engaged: ${JSON.stringify(s)}`);
  await page.evaluate(() => window.__dev.setMuted(false));

  // ---- [PERSIST] mix survives a full page reload --------------------------
  await page.evaluate(() => { window.__dev.setMaster(0.55); window.__dev.setMusic(0.22); window.__dev.setSfx(0.77); window.__dev.setMuted(true); });
  await page.reload({ waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.audioState", { timeout: 20000 });
  s = await aud(page);
  if (Math.abs(s.master - 0.55) < 0.01 && Math.abs(s.music - 0.22) < 0.01 && Math.abs(s.sfx - 0.77) < 0.01 && s.muted === true)
    pass(`[PERSIST] mix + mute survived reload (${s.master}/${s.music}/${s.sfx} muted=${s.muted})`);
  else fail(`[PERSIST] mix did not persist across reload: ${JSON.stringify(s)}`);
  await page.evaluate(() => window.__dev.setMuted(false)); // un-mute for the fps sample

  // ---- [FPS] frame budget holds with the audio graph live -----------------
  await freshBoot(page); // a long run autosaved → clear it so we re-enter cleanly from the menu
  await enterPlay(page, "QAFps");
  await tpz(page, "forest");
  await page.evaluate(() => window.__dev.spawn("orc", 30, 0));
  await wait(400);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with music + ambient + a live chaser`);
  else fail(`[FPS] dropped to ${fps} fps`);

  await page.screenshot({ path: "tools/cas131-audio-screenshot.png" });

  if (errors.length === 0) pass("[ERR] zero JS errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✓ CAS-131 audio harness passed." : "\n✗ CAS-131 audio harness FAILED.");
process.exit(ok ? 0 : 1);
