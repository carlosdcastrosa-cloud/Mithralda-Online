// ---------------------------------------------------------------------------
// CAS-265 — Accessibility & QoL polish harness.
//
// Boots the real game headless and verifies the new accessibility/QoL surface:
//   - settings DEFAULT to current behaviour (reduceMotion/colorblind off, default binds)
//   - colour-blind + reduce-motion toggles PERSIST across a full page reload (localStorage)
//   - key REBINDING persists AND actually drives movement (rebind "up" → that key moves)
//   - rebind SWAP keeps every action bound (no key collisions)
//   - resetBinds restores factory defaults
//   - 60fps held with colour-blind cues on; zero page errors throughout
//
// Runs against the LOCAL working tree (pre-deploy gate). A sibling --live flag points
// it at the deployed gh-pages URL for the post-deploy QA re-check.
//
// Run: node tools/cas265-accessibility.mjs   [--live]
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = process.argv.includes("--live");
const LIVE_URL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`✔ ${m}`); } else { fail++; console.error(`✖ ${m}`); } };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium found."); process.exit(1); }

const srv = LIVE ? null : await startServer();
let base = LIVE ? LIVE_URL : srv.url;
if (!base.endsWith("/")) base += "/";
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const errors = [];
async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 576, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  return page;
}
const waitScene = (page, s, ms = 20000) =>
  page.waitForFunction((x) => window.__dev && window.__dev.scene && window.__dev.scene() === x, { timeout: ms }, s).then(() => true).catch(() => false);

async function enterPlay(page) {
  await page.goto(`${base}index.html?dev`, { waitUntil: "load" });
  // A persisted save rehydrates straight into play (skipping menu/class). Accept either.
  await page.waitForFunction(() => window.__dev && window.__dev.scene && (window.__dev.scene() === "menu" || window.__dev.scene() === "play"), { timeout: 20000 }).catch(() => {});
  const sc = await page.evaluate(() => (window.__dev && window.__dev.scene) ? window.__dev.scene() : null);
  if (sc === "play") return true;          // resumed from save
  if (sc !== "menu") return false;
  await page.evaluate(() => { document.getElementById("nameInput").value = "AxsBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  if (!await waitScene(page, "classsel", 8000)) return false;
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  // CAS-2058: build now interposes customize/abilitysel between classsel and play — advance through both (Enter).
  await page.waitForFunction(() => ["customize","abilitysel","play"].includes(window.__dev.scene()), { timeout: 8000 }).catch(() => {});
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction(() => ["abilitysel","play"].includes(window.__dev.scene()), { timeout: 8000 }).catch(() => {});
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  return await waitScene(page, "play", 8000);
}

try {
  // ---- 1) defaults preserve current behaviour ----
  let page = await newPage();
  await page.evaluate(() => { try { localStorage.removeItem("mithralda.settings.v1"); } catch (e) {} });
  if (!await enterPlay(page)) throw new Error("could not reach play (defaults)");
  const def = await page.evaluate(() => window.__dev.settingsState());
  ok(def.reduceMotion === false, "default: reduceMotion OFF");
  ok(def.colorblind === false, "default: colorblind OFF");
  ok(def.binds && def.binds.up === "KeyW" && def.binds.attack === "KeyJ" && def.binds.roll === "Space", "default: factory key binds");

  // ---- 2) toggles persist across a real reload ----
  await page.evaluate(() => { window.__dev.setColorblind(true); window.__dev.setReduceMotionPref(true); });
  const saved = await page.evaluate(() => window.__dev.settingsSaved());
  ok(saved && saved.colorblind === true && saved.reduceMotion === true, "toggles written to localStorage");
  // full reload — settings.boot() must rehydrate them
  if (!await enterPlay(page)) throw new Error("could not reach play (after reload)");
  const afterReload = await page.evaluate(() => window.__dev.settingsState());
  ok(afterReload.colorblind === true, "colorblind PERSISTS across reload");
  ok(afterReload.reduceMotion === true, "reduceMotion PERSISTS across reload");

  // ---- 3) key rebinding persists + actually drives movement ----
  // rebind "up" to KeyM, reload, then hold KeyM and confirm the hero moves up (y decreases).
  // CAS-2058: test key must be a NEUTRAL code. Do NOT use KeyK/KeyY/KeyL/KeyP — those are RESERVED fixed
  // (non-rebindable) play-scene action keys (KeyK→Códice, KeyY→Títulos, KeyL→Pactos, KeyP→potion). Binding
  // movement onto one registers the move but edge() ALSO fires the fixed action (opens a panel ⇒ scene leaves
  // 'play') so the hero can't move — a pre-existing rebind/reserved-key collision (see bug filed under CAS-27),
  // NOT a settings-persistence bug. KeyM is neutral, so this asserts the rebind→movement path cleanly.
  await page.evaluate(() => window.__dev.setBind("up", "KeyM"));
  const reb = await page.evaluate(() => window.__dev.settingsSaved());
  ok(reb && reb.binds && reb.binds.up === "KeyM", "rebind written to localStorage");
  if (!await enterPlay(page)) throw new Error("could not reach play (after rebind)");
  const boundUp = await page.evaluate(() => window.__dev.settingsState().binds.up);
  ok(boundUp === "KeyM", "rebind PERSISTS across reload (up→M)");
  const y0 = await page.evaluate(() => window.__dev.hero().y);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyM", key: "m", bubbles: true })));
  await wait(450);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyM", key: "m", bubbles: true })));
  const y1 = await page.evaluate(() => window.__dev.hero().y);
  ok(y1 < y0 - 2, `rebound key MOVES hero up (y ${y0.toFixed(0)}→${y1.toFixed(0)})`);
  // old default key (KeyW) should no longer move up after the swap-free remap
  const y2a = await page.evaluate(() => window.__dev.hero().y);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", key: "w", bubbles: true })));
  await wait(300);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW", key: "w", bubbles: true })));
  const y2b = await page.evaluate(() => window.__dev.hero().y);
  ok(Math.abs(y2b - y2a) < 8, "old default key (W) no longer bound to up");

  // ---- 4) swap semantics keep every action bound ----
  // bind "roll" onto attack's key (KeyJ); attack should inherit roll's old key (Space).
  await page.evaluate(() => { window.__dev.resetBinds(); window.__dev.setBind("roll", "KeyJ"); });
  const sw = await page.evaluate(() => window.__dev.settingsState().binds);
  ok(sw.roll === "KeyJ", "swap: roll took KeyJ");
  ok(sw.attack === "Space", "swap: attack inherited roll's old key (no action left unbound)");
  const codes = Object.values(sw);
  ok(new Set(codes).size === codes.length, "swap: no duplicate key bindings");

  // ---- 5) reset restores defaults ----
  await page.evaluate(() => window.__dev.resetBinds());
  const rst = await page.evaluate(() => window.__dev.settingsState().binds);
  ok(rst.up === "KeyW" && rst.attack === "KeyJ" && rst.roll === "Space", "resetBinds restores factory defaults");

  // ---- 6) 60fps with colour-blind cues on ----
  await page.evaluate(() => window.__dev.setColorblind(true));
  await page.evaluate(() => { window.__dev.spawn("orc", 60, 0); window.__dev.spawn("orc", -60, 0); });
  const f0 = await page.evaluate(() => window.__frames);
  await wait(1000);
  const f1 = await page.evaluate(() => window.__frames);
  const fps = f1 - f0;
  ok(fps >= 55, `60fps held with colorblind cues on (${fps} fps)`);

  ok(errors.length === 0, `zero page errors (${errors.length})` + (errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""));
} catch (e) {
  fail++; console.error("✖ harness error:", e.message);
} finally {
  await browser.close();
  if (srv) srv.close();
}

console.log(`\n${fail === 0 ? "✓" : "✗"} CAS-265 accessibility: ${pass} passed, ${fail} failed  (${LIVE ? "LIVE" : "local"})`);
process.exit(fail === 0 ? 0 : 1);
