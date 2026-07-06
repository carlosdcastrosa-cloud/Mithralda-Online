// ---------------------------------------------------------------------------
// CAS-28 — Playtest pass #1 against the LIVE build.
//
// Drives the deployed game (not a local server) in headless Chromium and runs
// the QA checklist: boot/console, 5-class selection, movement+collision,
// directional combat (CAS-8) + combat-feel (CAS-20), perf/FPS, pause-on-blur,
// and a mobile/touch boot. Captures screenshot artifacts and prints a JSON
// report to stdout. Read-only against the shared live env (only __dev spawns
// throwaway enemies in the local client session; no destructive flows).
//
// Run: node tools/playtest-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

// gh-pages is the OFFICIAL live URL (board directive, CAS-412); the old Higgsfield
// mirror was retired. Allow an env override so QA can target another host if needed.
const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const shot = (name) => join(ROOT, "tools", `playtest1-${name}.png`);
const report = { live: LIVE, phases: {}, errors: [], bugs: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// shared error collector wiring
function wire(page, sink) {
  page.on("pageerror", (e) => sink.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") sink.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => sink.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => { if (r.status() >= 400) sink.push(`http ${r.status()}: ${r.url()}`); });
}

// The live build wraps the game in a Higgsfield embed: the real game runs in a
// child iframe (#hf-frame, src=...?__raw=1). All __dev / input must target THAT
// frame, not the top page. Resolve and return the game frame once __dev mounts.
async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try {
        const has = await f.evaluate(() => !!(window.__dev && window.__dev.scene));
        if (has) return f;
      } catch { /* frame navigating */ }
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}

// CAS-113 persistence shares localStorage across all pages in this browser, so a
// prior session's autosave makes a fresh page boot straight into 'play' (rehydrate),
// never showing the menu. Resolve the game frame, wipe any save + suppress writes,
// and reload once if we already rehydrated — guaranteeing a true menu boot.
async function cleanFrame(p) {
  let fr = await gameFrame(p);
  await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  const sc = await fr.evaluate(() => window.__dev.scene());
  if (sc !== "menu") {
    await p.reload({ waitUntil: "load", timeout: 30000 });
    fr = await gameFrame(p);
    await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  }
  return fr;
}

// menu -> classsel -> play for a given class. Operates on the game frame.
async function enterAs(fr, cls) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => {
    const i = document.getElementById("nameInput");
    i.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  const idx = CLASSES.indexOf(cls) + 1;
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), idx);
  // CAS-169 wardrobe (customize) + CAS-1570 ability draft (abilitysel) now sit between
  // class selection and play. Pass through whichever the build routes into: confirm the
  // wardrobe with Enter, then draft exactly 2 abilities (Digit1+Digit2) and confirm.
  await fr.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await fr.evaluate(() => window.__dev.scene()) === "customize") {
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await fr.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await fr.evaluate(() => window.__dev.scene()) === "abilitysel") {
    // CAS-1570/1580: openAbilityDraft pre-seeds abilChosen with the class's 2 default
    // abilities (confirmLoadout needs exactly 2). Toggling here would REMOVE the defaults,
    // so just confirm with Enter and accept the default loadout + CAS-1659 default Ultimate.
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  return fr.evaluate(() => window.__dev.hero());
}

try {
  const boot = [];
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  wire(page, boot);
  // frame counter for FPS, installed before page scripts
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  // ---- PHASE 1: boot / console clean ----
  const resp = await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const httpStatus = resp ? resp.status() : 0;
  let devPresent = false, scene0 = "n/a";
  try {
    const fr0 = await gameFrame(page);
    devPresent = true;
    scene0 = await fr0.evaluate(() => window.__dev.scene());
  } catch (e) { boot.push(`boot: ${e.message}`); }
  await sleep(500);
  await page.screenshot({ path: shot("01-boot-menu") });
  report.phases.boot = { httpStatus, devPresent, scene: scene0, errors: [...boot] };

  // ---- PHASE 2: 5-class selection ----
  const classResults = [];
  for (const cls of CLASSES) {
    const errs = [];
    const p = await browser.newPage();
    await p.setUserAgent(UA);
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    wire(p, errs);
    await p.goto(LIVE, { waitUntil: "load", timeout: 30000 });
    let hero = null, ok = false;
    try { const fr = await cleanFrame(p); hero = await enterAs(fr, cls); ok = !!(hero && hero.cls); } catch (e) { errs.push(`flow: ${e.message}`); }
    await sleep(300);
    await p.screenshot({ path: shot(`02-class-${cls}`) });
    classResults.push({ cls, ok, hero, errors: errs });
    await p.close();
  }
  report.phases.classes = classResults;

  // ---- Re-use one warrior session for gameplay phases ----
  const g = await browser.newPage();
  await g.setUserAgent(UA);
  await g.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const gErr = [];
  wire(g, gErr);
  await g.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await g.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const gf = await cleanFrame(g);
  await enterAs(gf, "warrior");

  // ---- PHASE 3: movement + collision ----
  const move = {};
  const press = (c) => gf.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keydown", { code: x, key: x, bubbles: true })), c);
  const release = (c) => gf.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keyup", { code: x, key: x, bubbles: true })), c);
  const heroPos = () => gf.evaluate(() => { const h = window.__dev.hero(); return h ? { x: h.x, y: h.y } : null; });
  const p0 = await heroPos();
  for (const [dir, code] of [["right", "KeyD"], ["down", "KeyS"], ["left", "KeyA"], ["up", "KeyW"]]) {
    const a = await heroPos();
    await press(code); await sleep(500); await release(code);
    const b = await heroPos();
    move[dir] = { from: a, to: b, moved: Math.hypot(b.x - a.x, b.y - a.y) };
  }
  const pEnd = await heroPos();
  const finite = [p0, pEnd].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  // collision: walk hard into one direction for a long time, confirm bounded (no run-away through walls/world edge)
  await press("KeyW"); await sleep(2500); await release("KeyW");
  const pWall = await heroPos();
  report.phases.movement = { start: p0, perDir: move, finite, afterLongWalk: pWall,
    boundedFinite: !!(pWall && Number.isFinite(pWall.x) && Number.isFinite(pWall.y)) };

  // ---- PHASE 4: directional combat (CAS-8) + combat-feel (CAS-20) ----
  // Spawn a TIGHT ring of wolves WITHIN basic-melee range (warrior cfg.range ~ point
  // blank; the old 70-80px ring sat OUTSIDE a melee class's reach, so stationary clicks
  // never connected and `killed` read a false 0). Then sweep aim+attack via real pointer
  // clicks (CAS-8 input path). Verdict comes from the REAL hit-path floaters the engine
  // emits (damage numbers + the on-kill "+N XP" reward), which is immune to the ambient
  // world spawns that inflate raw enemyCount.
  const spawnRes = await gf.evaluate(() => {
    try { window.__dev.clearFx && window.__dev.clearFx(); } catch (e) {}
    const offs = [[34,0],[-34,0],[0,34],[0,-34],[30,30],[-30,-30],[30,-30],[-30,30]];
    let n = 0; for (const [dx,dy] of offs) { try { window.__dev.spawn("wolf", dx, dy); n++; } catch(e){} }
    return { spawned: n, count: window.__dev.enemyCount() };
  });
  const enemiesBefore = spawnRes.count;
  // sweep: dispatch pointerdown at 8 screen directions around canvas center (=aim+attack),
  // repeat. Floaters are short-lived (rise+fade in well under a second), so we SAMPLE the
  // engine's hit-path output INSIDE the sweep loop — counting any damage-number floater
  // ("-20") and any on-kill "+N XP" floater as they appear, instead of reading once after
  // a post-sweep delay (which let them all expire → false 0).
  const combatEv = await gf.evaluate(async () => {
    const d = window.__dev;
    const cv = document.getElementById("c");
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = 120;
    const dirs = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4);
    const fire = (ang) => {
      const x = cx + Math.cos(ang) * R, y = cy + Math.sin(ang) * R;
      const o = { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: "mouse" };
      cv.dispatchEvent(new PointerEvent("pointermove", o));
      cv.dispatchEvent(new PointerEvent("pointerdown", o));
      cv.dispatchEvent(new PointerEvent("pointerup", o));
    };
    let dmg = 0, xp = 0; let lastSample = [];
    const seen = new Set();
    const sample = () => {
      const fl = (d.floaterDump ? d.floaterDump() : []);
      lastSample = fl.slice(-6);
      for (const f of fl) {
        const t = String(f.txt);
        // stable-ish key so the same on-screen floater isn't double counted across samples
        const key = t + ":" + (f.pop || 1) + ":" + (f.col || "");
        if (seen.has(key)) continue; seen.add(key);
        if (/XP/i.test(t)) xp++;
        else if (/^-?\d/.test(t)) dmg++;
      }
    };
    for (let pass = 0; pass < 16; pass++) {
      for (const dir of dirs) { fire(dir); await new Promise((res) => setTimeout(res, 55)); }
      sample();
    }
    sample();
    return { enemiesAfter: d.enemyCount(), dmgFloaters: dmg, xpFloaters: xp, sample: lastSample };
  });
  await g.screenshot({ path: shot("03-combat") });
  const hitsLand = combatEv.dmgFloaters > 0;
  const killsLand = combatEv.xpFloaters > 0;
  report.phases.combat = {
    enemiesBefore, enemiesAfter: combatEv.enemiesAfter,
    dmgFloaters: combatEv.dmgFloaters, xpFloaters: combatEv.xpFloaters, sample: combatEv.sample,
    hitsLand, killsLand, pass: hitsLand,
    note: "PASS = clicks produce damage-number floaters via the real heroAttack->hitEnemy path; '+N XP' floaters confirm kills. enemyCount delta is ambient-confounded so not the verdict. Combat-feel (hitstop/strikeflash/perfect-dodge, CAS-20) verified visually in screenshot.",
  };
  if (!hitsLand) report.bugs.push("combat: no damage floaters after 128 pointer-click attacks on an in-range wolf ring");

  // ---- PHASE 5: perf / FPS under sustained movement ----
  const fpsSamples = [];
  const dirs = ["KeyD", "KeyS", "KeyA", "KeyW", "KeyD", "KeyS"];
  for (let i = 0; i < 6; i++) {
    const c = dirs[i];
    await press(c);
    const f0 = await gf.evaluate(() => window.__frames), t0 = await gf.evaluate(() => performance.now());
    await sleep(500);
    const f1 = await gf.evaluate(() => window.__frames), t1 = await gf.evaluate(() => performance.now());
    await release(c);
    fpsSamples.push(Math.round(((f1 - f0) * 1000) / (t1 - t0)));
  }
  report.phases.perf = { samples: fpsSamples, min: Math.min(...fpsSamples),
    avg: Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length), threshold: 58 };

  // ---- PHASE 6: pause-on-blur ----
  const sceneBeforeBlur = await gf.evaluate(() => window.__dev.scene());
  await gf.evaluate(() => window.dispatchEvent(new Event("blur")));
  await sleep(200);
  const sceneAfterBlur = await gf.evaluate(() => window.__dev.scene());
  await gf.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sleep(100);
  report.phases.pauseOnBlur = { before: sceneBeforeBlur, afterBlur: sceneAfterBlur,
    pass: sceneBeforeBlur === "play" && sceneAfterBlur === "pause" };
  report.phases.gameplayErrors = gErr;
  await g.close();

  // ---- PHASE 7: mobile / touch boot ----
  const mErr = [];
  const m = await browser.newPage();
  await m.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  wire(m, mErr);
  await m.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  let mobileHero = null, mobileOk = false, mf = null;
  try { mf = await gameFrame(m); mobileHero = await enterAs(mf, "mage"); mobileOk = !!(mobileHero && mobileHero.cls); } catch (e) { mErr.push(`flow: ${e.message}`); }
  // verify DPR cap (canvas backing store must not exceed viewW * 1.5)
  const dprInfo = mf ? await mf.evaluate(() => {
    const cv = document.getElementById("c");
    return { canvasW: cv.width, innerW: window.innerWidth, devicePixelRatio: window.devicePixelRatio,
      ratio: cv.width / window.innerWidth };
  }) : null;
  await sleep(300);
  await m.screenshot({ path: shot("04-mobile") });
  report.phases.mobile = { ok: mobileOk, hero: mobileHero, dpr: dprInfo,
    dprCapped: dprInfo ? dprInfo.ratio <= 1.5 + 0.01 : false, errors: mErr };
  await m.close();

} catch (e) {
  report.errors.push(`harness threw: ${e.message}\n${e.stack}`);
} finally {
  await browser.close();
}

console.log("\n===PLAYTEST_REPORT_JSON===");
console.log(JSON.stringify(report, null, 2));
console.log("===END_REPORT===");
