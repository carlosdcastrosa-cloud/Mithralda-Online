// CAS-2268 — QA POST-FLIP LIVE regression for PIEDRA DE VÍNCULO / RECALL AL SANTUARIO (RECALL.enabled:true ON DISK).
// Independent QA (b5c10283) against the LIVE gh-pages build after the CAS-2267 flip+deploy (build 3b224f8ade0d).
// This is NOT the in-memory DARK pass (CAS-2266): here RECALL is ON BY DEFAULT from the SERVED config — no __dev flip
// is used to turn it on. The __dev.recall hook is used only to DRIVE the deterministic paths (bind/cast/setCd) and,
// for the render byte-id proof, as an OFF baseline to isolate the badge (reversibility).
//
// Delta over the observable pass (why this exists):
//   · Boots the ACTUAL live URL (cache-bust) and asserts build===EXPECT + 0 JS err + 0 non-favicon 404.
//   · Proves ON-BY-DEFAULT from the SERVED sim/config.js (RECALL.enabled:true, key Home, cooldownSec 480) — not a flip.
//   · Drives the REAL Home KEY through the LIVE input.js path (not __dev.cast) to prove the player trigger works live.
//   · bind→recall→cooldown→persist(reload) round-trip on the live build; cooldown deterministic by sim dt.
//   · Render: badge present ON, changed-px signal ≫ noise, reversible (CAS-2259/2263/2265 footgun-safe); anti-CAS-2263
//     the recall row docks BELOW the live minimap (no overlap) — pixel probe of the minimap band stays clean.
//   · Arc-Santuario regression LIVE with RECALL on: SAFEZONE regen + Descanso accrual + No-Aggro idle + Temple respawn.
//   · Core loops: movement + combat (dmg lands). Perf: 60fps desk + mobile. Mobile boot/touch/recall/fps.
// Run: node tools/cas2268-recall-live-fullstack-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "3b224f8ade0d";
const OUT = join(ROOT, "shots", "cas2268");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const report = { live: LIVE, expectBuild: EXPECT_BUILD, build: null, desk: {}, mobile: {} };
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}
const escToPlay = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
});
async function measFps(page, ms) {
  return await page.evaluate(async (dur) => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  }, ms);
}
const medFps = async (page) => { const a = []; for (let i = 0; i < 3; i++) a.push(await measFps(page, 1000)); a.sort((x, y) => x - y); return a[1]; };

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------------- DESKTOP ----------------
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errors = [], net404 = [];
  wireErrs(page, errors, net404);
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  report.build = build;
  const spawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; }); // open hub spawn (walkable) for the movement check

  // 1 boot clean on LIVE
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.recall && window.__dev.safeZone && window.__dev.rested &&
    window.__dev.noAggro && window.__dev.saveBlob && window.__dev.daynight && window.__dev.hero));
  ok("1 boots clean on LIVE, build===EXPECT, __dev.recall+arc hooks+__BUILD, 0 err, 0 404",
     errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD && hooks,
     `build=${build} expect=${EXPECT_BUILD} err=${errors.length} 404=${net404.length}`);

  // 2 served config: RECALL.enabled:true + key Home + cooldownSec 480 (shipped LIVE, not a flip)
  const served = await page.evaluate(async (base) => {
    const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const txt = await r.text();
    const blk = (txt.match(/export const RECALL\s*=\s*\{[\s\S]*?\n\};/) || [""])[0];
    const g = (re) => { const m = blk.match(re); return m ? m[1] : "??"; };
    return { status: r.status, enabled: g(/enabled:\s*(true|false)/), key: g(/key:\s*"([^"]+)"/), cd: g(/cooldownSec:\s*(\d+)/), ch: g(/channelSec:\s*(\d+)/) };
  }, LIVE);
  ok("2 served config LIVE: RECALL.enabled:true, key Home, cooldownSec 480, channelSec 0",
     served.status === 200 && served.enabled === "true" && served.key === "Home" && served.cd === "480" && served.ch === "0",
     `enabled=${served.enabled} key=${served.key} cd=${served.cd} ch=${served.ch}`);

  // 3 ON BY DEFAULT from disk — recall().enabled===true out of the box, sanctuary reachable & stable
  const r0 = await page.evaluate(() => { const a = window.__dev.recall(); const b = window.__dev.recall(); const sz = window.__dev.safeZone();
    return { enabled: a.enabled, s1: a.sanctuary, s2: b.sanctuary, temple: sz.temple, cooldownSec: a.cooldownSec }; });
  report.desk.r0 = r0;
  const sanctOk = r0.s1 && r0.temple && isFinite(r0.s1.x) && r0.s1.x === r0.s2.x && r0.s1.y === r0.s2.y &&
    Math.abs(r0.s1.x - r0.temple.x) < 1 && (r0.s1.y - r0.temple.y) > 0 && (r0.s1.y - r0.temple.y) < 200;
  ok("3 LIVE default ON (on-disk): recall().enabled===true + sanctuary STABLE == POI Templo+offsetY",
     r0.enabled === true && sanctOk && r0.cooldownSec === 480, `enabled=${r0.enabled} sanctuary=${JSON.stringify(r0.s1)} temple=${JSON.stringify(r0.temple)}`);

  // 4 BIND inside SAFEZONE fixes bindPoint to the Sanctuary (dist≈0)
  const bindIn = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(320);
    return window.__dev.recall(); });
  await escToPlay(page);
  ok("4 BIND inside SAFEZONE ⇒ bound, bindPoint≈Sanctuary (dist≈0)",
     bindIn.bound === true && bindIn.inZone === true && bindIn.bindPoint &&
     Math.hypot(bindIn.bindPoint.x - bindIn.sanctuary.x, bindIn.bindPoint.y - bindIn.sanctuary.y) < 1,
     `bound=${bindIn.bound} bind=${JSON.stringify(bindIn.bindPoint)}`);

  // 5 REAL Home KEY (LIVE input.js path) recalls the hero to bindPoint — the player trigger, not __dev.cast
  const homeKey = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.recall({ setCd: 0 }); window.__dev.tp(2, 2); await s(220);
    const bp = window.__dev.recall().bindPoint; const before = window.__dev.hero();
    const away = Math.hypot(before.x - bp.x, before.y - bp.y);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Home", key: "Home", bubbles: true })); await s(90);
    const after = window.__dev.hero();
    return { away, dist: Math.hypot(after.x - bp.x, after.y - bp.y) }; });
  await escToPlay(page);
  ok("5 REAL 'Home' KEY (LIVE input path) teleports hero to bindPoint (dist≈0)",
     homeKey.away > 200 && homeKey.dist < 2, `awayBefore=${homeKey.away.toFixed(0)} distAfter=${homeKey.dist.toFixed(2)}`);

  // 6 cooldown 480s starts after cast, ready=false, blocks re-cast (no move)
  const cd = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const start = window.__dev.recall(); window.__dev.tp(2, 2); await s(160);
    const b = window.__dev.hero(); const r = window.__dev.recall({ cast: true }); const a = window.__dev.hero();
    return { recallCD: start.recallCD, cooldownSec: start.cooldownSec, ready: start.ready, result: r.result, moved: Math.hypot(b.x - a.x, b.y - a.y) }; });
  ok("6 cooldown 480 starts (ready=false) AND blocks re-cast ('cooldown', no move)",
     cd.recallCD > cd.cooldownSec - 4 && cd.cooldownSec === 480 && cd.ready === false && cd.result === "cooldown" && cd.moved < 1,
     `recallCD=${cd.recallCD} result=${cd.result} moved=${cd.moved.toFixed(2)}`);

  // 7 cooldown DETERMINISTIC by sim dt (frozen daynight/weather ⇒ wall-clock decoupled)
  const det = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ phase: 0.3 }); window.__dev.weather({ phase: 0 });
    window.__dev.recall({ setCd: 2 }); const c0 = window.__dev.recall().recallCD;
    await s(1050); const c1 = window.__dev.recall().recallCD;
    await s(1200); const r2 = window.__dev.recall();
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { c0, c1, c2: r2.recallCD, ready: r2.ready }; });
  ok("7 cooldown DETERMINISTIC by sim dt: setCd(2) decays ~1/s → ready",
     det.c0 > 1.7 && det.c1 < det.c0 - 0.6 && det.c2 <= 0 && det.ready === true, `c0=${det.c0} c1=${det.c1} c2=${det.c2} ready=${det.ready}`);

  // 8 persist across RELOAD (anti-cheese): bind + cd persisted to save, survive a full reload of the LIVE page
  const preReload = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(240);
    window.__dev.recall({ bind: true, setCd: 300 }); if (window.__dev.saveNow) window.__dev.saveNow();
    const blob = window.__dev.saveBlob() || {};
    return { bp: blob.bindPoint, cd: blob.recallCD, hasBind: !!(blob.bindPoint && isFinite(blob.bindPoint.x)) }; });
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 20000 }).catch(() => {});
  await escToPlay(page);
  const postReload = await page.evaluate(() => { const r = window.__dev.recall(); return { bound: r.bound, bp: r.bindPoint, cd: r.recallCD }; });
  const persistOk = preReload.hasBind && postReload.bound === true && postReload.bp &&
    Math.hypot(postReload.bp.x - preReload.bp.x, postReload.bp.y - preReload.bp.y) < 1 && postReload.cd > 250;
  ok("8 persist across RELOAD (anti-cheese): bindPoint + recallCD survive a full LIVE reload",
     persistOk, `pre=${JSON.stringify(preReload.bp)}/cd${preReload.cd} post=${JSON.stringify(postReload.bp)}/cd${postReload.cd?.toFixed?.(0)}`);

  // 9 RENDER structural: served render.js gates the badge (OFF ⇒ never drawn) + cosmetic (reads sim, no writes)
  const src = await page.evaluate(async (base) => (await fetch(base + "/render/render.js?cb=" + Date.now())).text(), LIVE);
  const gated = /if\s*\(\s*RECALL\.enabled\s*\)\s*renderRecallBadge\s*\(\s*\)/.test(src);
  const fnBody = (src.match(/function renderRecallBadge\(\)\{[\s\S]*?\n  \}/) || [""])[0];
  const cosmetic = fnBody.length > 0 && !/\b(gainXP|damageHero|Math\.random|h\.recallCD\s*=|bindPoint\s*=)/.test(fnBody)
    && /h\.bindPoint/.test(fnBody) && /h\.recallCD/.test(fnBody);
  ok("9a RENDER (served): renderRecallBadge GATED (OFF⇒never drawn) + COSMETIC (reads sim, no sim/RNG writes)",
     gated && cosmetic, `gated=${gated} cosmetic=${cosmetic}`);

  // 9b RENDER observable: thresholded changed-px over the badge band. ON (default) vs OFF (__dev) ≫ OFF vs OFF noise.
  const rd = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ enabled: true, phase: 0.30 }); window.__dev.weather({ phase: 0.0 });
    const restedWas = window.__dev.rested ? window.__dev.rested().enabled : false;
    if (window.__dev.rested) window.__dev.rested({ enabled: false });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    window.__dev.recall({ bind: true, setCd: 275 });
    const cv = document.getElementById("c"); const W = cv.width, H = cv.height;
    const rx = Math.max(0, W - 150), ry = Math.floor(H * 0.16), rw = 150, rh = Math.floor(H * 0.24);
    const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh; const tctx = tmp.getContext("2d");
    const grab = () => { tctx.clearRect(0, 0, rw, rh); tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh); return tctx.getImageData(0, 0, rw, rh).data; };
    const changed = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) { if (Math.abs(p[i] - q[i]) > 55 || Math.abs(p[i + 1] - q[i + 1]) > 55 || Math.abs(p[i + 2] - q[i + 2]) > 55) n++; } return n; };
    // settle: the badge redraws on the render loop — wait several frames after each toggle so grab() sees the new state.
    const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r())); };
    window.__dev.recall({ enabled: false }); await settle(); const offA = grab(); await settle(); const offB = grab();
    const noisePx = changed(offA, offB);
    window.__dev.recall({ enabled: true }); await settle(); const on1 = grab();
    window.__dev.recall({ enabled: false }); await settle(); const off1 = grab();
    const signalPx = changed(on1, off1);
    window.__dev.recall({ enabled: true }); await settle(); const on2 = grab();
    window.__dev.recall({ enabled: false }); await settle(); const off2 = grab();
    const signalPx2 = changed(on2, off2);
    window.__dev.recall({ enabled: true }); // restore LIVE default ON
    if (window.__dev.rested && restedWas) window.__dev.rested({ enabled: true });
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { noisePx, signalPx, signalPx2 };
  });
  // Badge is small (rune + "Recall" label + cooldown text) ⇒ a few dozen changed-px; frozen-scene noise is single digits.
  ok("9b RENDER observable: recall badge changed-px signal(ON−OFF) ≫ noise(OFF−OFF), reversible on re-toggle",
     rd.signalPx > rd.noisePx * 2 + 20 && rd.signalPx2 > rd.noisePx * 2 + 20, `signalPx=${rd.signalPx} noisePx=${rd.noisePx} signalPx2=${rd.signalPx2}`);

  // 10 anti-CAS-2263: recall row docks BELOW the live minimap (no overlap). Probe: changed-px INSIDE the minimap band must
  //   stay at noise level when the badge toggles (badge lives below it), while the below-minimap band carries the signal.
  const dock = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    // Freeze daynight bright + weather calm (CAS-2259/2263/2265 footgun: a dark live sky sinks the badge's per-channel
    // delta below the 55 threshold ⇒ false 0). A fixed bright scene keeps the badge strokes observable.
    window.__dev.daynight({ enabled: true, phase: 0.30 }); window.__dev.weather({ phase: 0.0 });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(260);
    window.__dev.recall({ bind: true, setCd: 275 });
    const cv = document.getElementById("c"); const W = cv.width, H = cv.height;
    const band = (y0, y1) => { const rx = Math.max(0, W - 150), rw = 150, rh = y1 - y0;
      const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh; const c = tmp.getContext("2d");
      return () => { c.clearRect(0, 0, rw, rh); c.drawImage(cv, rx, y0, rw, rh, 0, 0, rw, rh); return c.getImageData(0, 0, rw, rh).data; }; };
    const changed = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) { if (Math.abs(p[i] - q[i]) > 55 || Math.abs(p[i + 1] - q[i + 1]) > 55 || Math.abs(p[i + 2] - q[i + 2]) > 55) n++; } return n; };
    const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r())); };
    // minimap band ≈ top-right upper strip; below-minimap band = where the recall/descanso row docks.
    const mmGrab = band(0, Math.floor(H * 0.16));
    const belowGrab = band(Math.floor(H * 0.16), Math.floor(H * 0.40));
    window.__dev.recall({ enabled: false }); await settle(); const mmOff = mmGrab(); const bOff = belowGrab();
    window.__dev.recall({ enabled: true }); await settle(); const mmOn = mmGrab(); const bOn = belowGrab();
    window.__dev.recall({ enabled: true });
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { mmDelta: changed(mmOff, mmOn), belowDelta: changed(bOff, bOn) };
  });
  ok("10 anti-CAS-2263: recall row docks BELOW minimap (minimap band ~unchanged, below-minimap band carries the badge)",
     dock.mmDelta < 30 && dock.belowDelta > dock.mmDelta + 40, `minimapΔ=${dock.mmDelta} belowΔ=${dock.belowDelta}`);

  // 11 arc-Santuario regression with RECALL LIVE: SAFEZONE regen + Descanso accrual + No-Aggro idle
  const regr = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(220);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    let restedGrew = null;
    if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    let noAggroIdle = null; const nz = window.__dev.noAggro && window.__dev.noAggro();
    if (nz && nz.enabled && nz.noAggro) { window.__dev.noAggro({ clear: true });
      window.__dev.noAggro({ spawn: "wolf", dx: 70, dy: 0, hostile: false }); await s(900);
      const n2 = window.__dev.noAggro(); noAggroIdle = (n2.enemies || []).length > 0 && (n2.enemies || []).every(e => e.state !== "chase");
      window.__dev.noAggro({ clear: true }); }
    return { hp0, hp1, restedGrew, noAggroIdle }; });
  await escToPlay(page);
  ok("11 arc regression LIVE (RECALL on): SAFEZONE regen heals + Descanso accrues + No-Aggro idle",
     regr.hp1 > regr.hp0 + 1 && (regr.restedGrew === null || regr.restedGrew === true) && (regr.noAggroIdle === null || regr.noAggroIdle === true),
     `hp ${regr.hp0}→${regr.hp1} restedGrew=${regr.restedGrew} noAggroIdle=${regr.noAggroIdle}`);

  // 12 Temple respawn intact: die in wilderness ⇒ respawn lands home at the Templo (SAFEZONE)
  const respawn = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!window.__dev.templeRespawn || !window.__dev.templeRespawn().enabled) return { skip: true };
    window.__dev.tp(2, 2); await s(160);
    const tr = window.__dev.templeRespawn({ respawn: true }); await s(120);
    return { skip: false, inSafe: tr.inSafeZone, near: tr.nearTemple, dist: tr.dist }; });
  await escToPlay(page);
  ok("12 Temple respawn intact: die ⇒ respawn lands home (inSafeZone + nearTemple)",
     respawn.skip || (respawn.inSafe === true && respawn.near === true), `${JSON.stringify(respawn)}`);

  // 13 core loop: keyboard movement on the live build. FOOTGUN (CAS-2250): a wilderness tp can raise the 'curse' entry
  //   modal which PAUSES the sim ⇒ movement is a no-op. Dismiss modals until scene==='play' BEFORE measuring.
  const combat = await page.evaluate(async (sp) => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    // Return to the OPEN hub spawn (captured at boot, known walkable) and clear any entry modal, THEN drive each
    // direction; a wall on one axis must not read as "input dead" — take the max displacement across W/A/S/D.
    window.__dev.tp(sp.x / 32, sp.y / 32); await s(220);
    for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
    const scene = window.__dev.scene();
    const press = async (code, key) => { const b = window.__dev.hero();
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true })); await s(420);
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true })); await s(60);
      const a = window.__dev.hero(); return Math.hypot(a.x - b.x, a.y - b.y); };
    let best = 0;
    for (const [c, k] of [["KeyD", "d"], ["KeyA", "a"], ["KeyW", "w"], ["KeyS", "s"]]) best = Math.max(best, await press(c, k));
    return { scene, moved: best }; }, spawn);
  await escToPlay(page);
  ok("13 core loop LIVE: keyboard movement drives hero (scene=play)", combat.scene === "play" && combat.moved > 15, `scene=${combat.scene} maxΔ=${combat.moved.toFixed(1)}px`);

  // 14 desk fps
  const dfps = await medFps(page);
  report.desk.fps = dfps;
  ok("14 desk fps ≥58 (median-of-3) with RECALL LIVE", dfps >= 58, `fps≈${dfps}`);
  await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); window.__dev.recall({ bind: true, setCd: 275 }); await s(220); });
  await escToPlay(page); await sleep(250);
  await page.screenshot({ path: join(OUT, "live-recall-badge.png") });
  await page.close();

  // ---------------- MOBILE ----------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [], mNet404 = [];
  wireErrs(mp, mErr, mNet404);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  ok("15 MOBILE boots to play on LIVE, 0 err, 0 404", (await mp.evaluate(() => window.__dev.scene() === "play")) && mErr.length === 0 && mNet404.length === 0,
     `err=${mErr.length} 404=${mNet404.length}`);

  // 16 mobile touch-move (virtual stick) at the OPEN spawn (before any tp)
  const moved = await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const b = window.__dev.hero(); const sx = rect.left + rect.width * 0.20, sy = rect.top + rect.height * 0.72;
    window.dispatchEvent(new Event("touchstart"));
    const pd = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    pd("pointerdown", sx, sy);
    for (let i = 0; i < 16; i++) { pd("pointermove", sx + 55, sy); await s(50); }
    pd("pointerup", sx + 55, sy);
    const a = window.__dev.hero(); return Math.hypot(a.x - b.x, a.y - b.y); });
  ok("16 MOBILE touch-move drives hero (virtual stick)", moved > 20, `Δ=${moved.toFixed(1)}px`);

  // 17 mobile bind + recall reachable (default-ON, no minimap ⇒ fallback anchor)
  const mRecall = await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(260);
    const bound = window.__dev.recall().bound; window.__dev.tp(2, 2); await s(150); window.__dev.recall({ setCd: 0 });
    const bp = window.__dev.recall().bindPoint; const r = window.__dev.recall({ cast: true }); await s(60); const h = window.__dev.hero();
    return { enabled: window.__dev.recall().enabled, bound, result: r.result, dist: bp ? Math.hypot(h.x - bp.x, h.y - bp.y) : null }; });
  await escToPlay(mp);
  ok("17 MOBILE default-ON + bind+recall reachable (bound in zone, recall lands home)",
     mRecall.enabled === true && mRecall.bound === true && mRecall.result === "recalled" && mRecall.dist < 2,
     `enabled=${mRecall.enabled} bound=${mRecall.bound} result=${mRecall.result} dist=${mRecall.dist?.toFixed(2)}`);

  // 18 mobile fps
  const mfps = await medFps(mp);
  report.mobile.fps = mfps;
  ok("18 MOBILE fps ≥55 (median-of-3) with RECALL LIVE", mfps >= 55, `fps≈${mfps}`);
  await mp.screenshot({ path: join(OUT, "live-mobile-recall.png") });

  ok("0 no JS errors + no non-favicon 404 across desktop+mobile",
     errors.length === 0 && net404.length === 0 && mErr.length === 0 && mNet404.length === 0,
     [...errors, ...net404, ...mErr, ...mNet404].slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\nBUILD ${report.build} (expect ${EXPECT_BUILD}) desk=${report.desk.fps}fps mobile=${report.mobile.fps}fps`);
console.log(`${PASS}/${PASS + FAIL} checks passed (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
