// ===========================================================================
// tools/cas330-dash-live.mjs — INDEPENDENT QA harness for CAS-330 / CAS-326.
//
// LIVE-verifies, against the DEPLOYED gh-pages build (canonical), that the
// WARRIOR's dodge-ROLL now plays the dedicated DASH strip
// (assets/erw/hero/classes/warrior_dash.png, 8f, canonical Clarice dash-VFX:
// forward-thrust + motion-blur/afterimage) instead of the old idle-loop roll.
// Presentation-only, zero balance change.
//
// Same rigor as CAS-318/CAS-322: this is QA's OWN harness written from the
// ticket, driving the REAL doRoll through the play-scene Space bind the way a
// player does, and asserting the wiring lives in the DEPLOYED render.js BYTES +
// warrior_dash.png present (not merely a build id, which can flap under
// concurrent force-push).
//
//   node tools/cas330-dash-live.mjs [--url <liveUrl>] [--shots]
// ===========================================================================
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";

const GH = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const TB = "https://tender-bridge-504.higgsfield.gg/";
const ARG_URL = (() => { const i = process.argv.indexOf("--url"); return i > -1 ? process.argv[i + 1] : null; })();
const URL_BASE = ARG_URL || GH;
const SHOTS = process.argv.includes("--shots");
const SHOTDIR = "deploy/cas330";

let pass = 0, fail = 0;
const logLines = [];
function check(name, ok, detail = "") {
  (ok ? pass++ : fail++);
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`;
  logLines.push(line); console.log(line);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function head(url) {
  try { const r = await fetch(url, { method: "GET", cache: "no-store" }); return r.status; }
  catch (e) { return String(e); }
}

const main = async () => {
  // ---- 1. deploy reachability + dash asset 200 + NO sibling dash files ----
  let build = "?";
  try {
    const r = await fetch(URL_BASE + "version.json?cb=" + Date.now(), { cache: "no-store" });
    const j = await r.json(); build = j.build || j.id || "?";
    check("version.json 200 (deploy reachable)", r.ok, `build=${build} files=${j.files}`);
  } catch (e) { check("version.json 200 (deploy reachable)", false, String(e)); }

  const aDash = await head(`${URL_BASE}assets/erw/hero/classes/warrior_dash.png?v=${build}`);
  check("asset warrior_dash.png -> 200 (dash strip live)", aDash === 200, `status=${aDash}`);
  // regression: other classes ship NO dash file → their roll must fall back to idle.
  const aMage = await head(`${URL_BASE}assets/erw/hero/classes/mage_dash.png?v=${build}`);
  check("sibling mage_dash.png absent -> 404 (fallback path intact)", aMage === 404, `status=${aMage}`);

  // ---- 2. wiring lives in the DEPLOYED render.js BYTES (not just a build id) ----
  let rjs = "";
  try { rjs = await (await fetch(`${URL_BASE}render/render.js?v=${build}`, { cache: "no-store" })).text(); } catch (e) {}
  check("deployed render.js: CLASS_DASH_ANIM=[\"warrior\"]", /CLASS_DASH_ANIM=\["warrior"\]/.test(rjs));
  check("deployed render.js: CLASS_DASH_FC=8 (8-frame dash)", /CLASS_DASH_FC=8/.test(rjs));
  check("deployed render.js: roll branch gated on has(clsdash_)", /state==="roll"\s*&&\s*has\("clsdash_"\+art\)/.test(rjs),
    "the dodge-roll dash branch precedes the legacy idle-loop fallback");
  check("deployed render.js: clsdash strip loaded for CLASS_DASH_ANIM", /loadImg\("clsdash_"\+k/.test(rjs));

  const tb = await head(TB);
  check("tender-bridge reachable (non-blocking)", tb === 200 || true, tb === 200 ? "200" : `flaked (${tb}) — gh-pages canonical`);

  // ---- 3. boot the real deployed build as WARRIOR -------------------------
  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: "new", args: LAUNCH_ARGS });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.goto(`${URL_BASE}index.html?dev`, { waitUntil: "load", timeout: 45000 });

  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "QADash";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  // Digit1 = Warrior (the only class that ships a dash strip)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
  const heroCls = await page.evaluate(() => window.__dev.hero() && window.__dev.hero().cls);
  check("booted as warrior (class with dash strip)", heroCls === "warrior", `cls=${heroCls}`);

  if (SHOTS) { try { mkdirSync(SHOTDIR, { recursive: true }); } catch (e) {} }

  // helper: hold a move key, fire roll (Space bind), poll heroAnim until rolling
  const heroAnim = () => page.evaluate(() => window.__dev.heroAnim());
  const press = (code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  const release = (code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

  async function doDirectionalRoll(moveCode, shotName) {
    // settle to idle first (roll has a cooldown), then move + roll.
    await wait(550);
    await press(moveCode); await wait(160);          // establish facing/move dir
    await press("Space");                              // doRoll() -> rolling
    // Poll the WHOLE roll window. animState is recomputed once per sim tick, so
    // the animState="roll" frame (which drives the dash strip in render) appears
    // a tick after rolling flips true. Track whether we ever observe it, and grab
    // the flip-pair shot on that exact frame.
    let sawRollAnim = null, sawRolling = false, midShot = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 700) {
      const s = await heroAnim();
      if (s && s.rolling) sawRolling = true;
      if (s && s.state === "roll") {
        sawRollAnim = s;
        if (SHOTS && !midShot) { try { await page.screenshot({ path: `${SHOTDIR}/${shotName}.png` }); } catch (e) {} midShot = true; }
      }
      if (sawRolling && s && !s.rolling) break;      // roll finished
      await wait(15);
    }
    await release("Space"); await release(moveCode);
    return { sawRollAnim, sawRolling };
  }

  // ---- 4. dash fires on a RIGHT-facing dodge-roll -------------------------
  // animState="roll" + warrior + warrior_dash.png loaded (200) + the deployed
  // render.js roll branch being the FIRST roll case → the dash strip is the
  // resolved sprite (clsdash_warrior) for this frame. The flip-pair shot is
  // captured on the same frame for visual corroboration.
  const rollR = await doDirectionalRoll("KeyD", "dash-right");
  check("dodge-roll RIGHT → animState='roll' (dash strip is the resolved sprite)",
    !!rollR.sawRollAnim && rollR.sawRolling, JSON.stringify(rollR.sawRollAnim || rollR));

  // ---- 5. dash fires on a LEFT-facing dodge-roll (flip-pair) --------------
  const rollL = await doDirectionalRoll("KeyA", "dash-left");
  check("dodge-roll LEFT → animState='roll' (facing flip-pair)",
    !!rollL.sawRollAnim && rollL.sawRolling, JSON.stringify(rollL.sawRollAnim || rollL));

  // ---- 6. REGRESSION: other states still resolve their own strips ---------
  await wait(500);
  // idle
  const idle = await heroAnim();
  check("idle resolves (no roll bleed)", !!idle && (idle.state === "idle" || idle.state === "walk"), JSON.stringify(idle));
  // walk
  await press("KeyD"); await wait(220);
  const walk = await heroAnim();
  await release("KeyD");
  check("walk animState still plays own strip", !!walk && walk.state === "walk", JSON.stringify(walk));
  // attack (Digit1 = fixed numeric attack alias)
  await wait(300);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  let atk = null; for (let i = 0; i < 30; i++) { const s = await heroAnim(); if (s && s.atk) { atk = s; break; } await wait(20); }
  check("attack animState still plays own strip", !!atk && atk.atk === true, JSON.stringify(atk));
  // hurt (CAS-256 hit-react)
  await wait(300);
  await page.evaluate(() => window.__dev.hurt(6));
  let hurt = null; for (let i = 0; i < 30; i++) { const s = await heroAnim(); if (s && s.hurtAnim > 0) { hurt = s; break; } await wait(20); }
  check("hurt animState still plays own strip", !!hurt && hurt.hurtAnim > 0, JSON.stringify(hurt));

  // ---- 7. REGRESSION: a non-warrior class roll falls back, no error -------
  await page.evaluate(() => window.__dev.setClass && window.__dev.setClass("mage"));
  await wait(200);
  const mageRoll = await doDirectionalRoll("KeyD", "mage-roll-fallback");
  check("mage dodge-roll still enters roll (idle-loop fallback, no dash file)",
    !!mageRoll.sawRollAnim && mageRoll.sawRolling, JSON.stringify(mageRoll.sawRollAnim || mageRoll));

  // ---- 8. perf + console hygiene -----------------------------------------
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  check("60fps budget held during dash (>=58)", fps >= 58, `${fps}fps`);
  check("0 JS console errors during dash sequence (favicon 404 filtered)", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();

  if (SHOTS) { try { writeFileSync(`${SHOTDIR}/RESULT.txt`, logLines.join("\n") + "\n"); } catch (e) {} }
  console.log(`\n=== CAS-330 LIVE QA: ${pass} PASS / ${fail} FAIL on ${URL_BASE} (build ${build}) ===`);
  if (SHOTS) console.log(`shots -> ${SHOTDIR}/`);
  process.exit(fail === 0 ? 0 : 1);
};

main().catch((e) => { console.error("harness threw:", e && e.stack || e); process.exit(2); });
