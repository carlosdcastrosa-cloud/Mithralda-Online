// CAS-2259 — QA OBSERVABLE of the "Descanso" (Rested XP) HUD badge willSpend affordance.
// INDEPENDENT of the GE self-verify: serves the LOCAL working tree pinned to HEAD render.js (eef27f0 —
// the exact flip artifact; the unrelated CAS-2200 portal WIP is stashed by the caller). Rested XP is
// already LIVE (CAS-2256, RESTED_XP.enabled:true) with the base pool bar shipped in CAS-2255 (99f7074);
// CAS-2259 adds the willSpend affordance: OUTSIDE the sanctuary with pool>0 → pulsing "zZ ×N" tag
// (WoW rested bubble); INSIDE → dim "acumulando" hint.
//
// Proves (observable + sim-authoritative):
//   1. RESTED_XP.enabled === true (feature LIVE).
//   2. GATE (render byte-id when OFF): flip enabled:false in-memory → badge VANISHES (0 draws), flip back
//      on → returns. This is the render-side proof the whole indicator is behind RESTED_XP.enabled.
//   3. willSpend MIRRORS sim authority: render's inCitySafe(h.x,h.y) tracks sim's inSafeZone → INSIDE
//      willSpend=false, OUTSIDE willSpend=true, at the SAME positions the sim hook reports.
//   4. Pool gate: badge DRAWS with pool>0, GONE with pool<=0 (lit-pixel delta in the tight badge clip).
//   5. sim UNTOUCHED (render-only change): accrual inside the zone + spend via the real gainXP chokepoint
//      still drain/refill the pool deterministically.
//   6. 0 JS errors, scene==='play', stable desktop fps.
// Run: node tools/cas2259-rested-badge-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots/cas2259", { recursive: true });

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QARest";
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

// tp to wilderness pops the "Maldición de Zona" (curse) modal → pauses sim + occludes HUD (footgun CAS-2250).
// It appears a frame AFTER tp, so caller must sleep first. Escape = "Omitir"; loop until scene()==='play'.
async function clearCurse(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "play") return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await sleep(120);
  }
  return (await page.evaluate(() => window.__dev.scene())) === "play";
}

// The badge anchors top-right, DIRECTLY OVER the minimap (finding #1), so a lit-pixel COUNT is unreliable:
// the badge's dark bar backing can REDUCE lit-px over a bright minimap as much as the gold/text adds. Instead
// grab the raw pixels of the tight "Descanso" bar+label row and compare frames by per-pixel ABSOLUTE DIFFERENCE
// (direction-agnostic). With day/night frozen + hero stationary, non-badge pixels are identical frame-to-frame,
// so a cross-state diff (badge present vs gone) isolates the badge footprint; a same-state diff is the noise floor.
async function badgeRow(page, VW) {
  return await page.evaluate((vw) => {
    const cv = document.querySelector("canvas"); if (!cv) return null;
    const g = cv.getContext("2d");
    const dpr = cv.width / vw;
    // "Descanso" label + bar live at gx-118..gx-14 (bw=104), y≈VH*0.045..0.115; capture a generous row.
    const x = Math.floor((vw - 124) * dpr), w = Math.floor(120 * dpr);
    const y = Math.floor(46 * dpr), h = Math.floor(24 * dpr);
    const d = g.getImageData(x, y, Math.min(w, cv.width - x), h).data;
    return Array.from(d);
  }, VW);
}
function diffCount(a, b, thr = 40) {
  if (!a || !b || a.length !== b.length) return -1;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > thr) n++;
  }
  return n;
}

async function fps(page, ms = 1500) {
  return await page.evaluate((dur) => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 < dur) requestAnimationFrame(tick);
      else res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); }
    requestAnimationFrame(tick);
  }), ms);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const A = []; let ok = true;
let dbg = {};
try {
  // =================== DESKTOP ===================
  const page = await browser.newPage();
  const VW = 900, VH = 640;
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/.test(t)) errors.push(t); } });
  await page.goto(`${srv.url}/index.html?dev=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.daynight && window.__dev.daynight({ phase: 0.5 }); window.__dev.weather && window.__dev.weather(0); });

  const rested = await page.evaluate(() => window.__dev.rested());
  A.push(["1. RESTED_XP.enabled === true (feature LIVE)", rested.enabled === true]);
  A.push(["1b. config xpMult === 1.5 (tag reads 'zZ ×1.5')", rested.xpMult === 1.5]);

  const sz = await page.evaluate(() => window.__dev.safeZone());
  const bbox = sz.bbox;
  const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
  const TS = 32;

  // --- INSIDE safe zone, pool full → bar + "acumulando" (accruing) ---
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round(cx / TS), Math.round(cy / TS));
  await clearCurse(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(250);
  const rIn = await page.evaluate(() => window.__dev.rested());
  const sceneIn = await page.evaluate(() => window.__dev.scene());
  // noise floor: two same-state frames (badge ON) — per-pixel jitter from the badge pulse only (day/night frozen).
  const rowOnA = await badgeRow(page, VW); await sleep(60); const rowOnB = await badgeRow(page, VW);
  const noise = diffCount(rowOnA, rowOnB);
  A.push(["2. INSIDE: scene==='play'", sceneIn === "play"]);
  A.push(["2. INSIDE: sim inZone true, pool>0", rIn.inZone === true && rIn.pool > 0]);
  A.push(["3. INSIDE: willSpend false (accruing — render inCitySafe mirrors sim inSafeZone)", rIn.willSpend === false]);
  await page.screenshot({ path: "shots/cas2259/qa-inside-accruing.png" });

  // --- pool<=0 → badge gone (pool gate): abs-diff vs the pool>0 frame >> noise floor ---
  await page.evaluate(() => window.__dev.rested({ setPool: 0 }));
  await sleep(200);
  const rowEmpty = await badgeRow(page, VW);
  const poolGate = diffCount(rowOnB, rowEmpty);
  A.push(["4. pool gate: badge present(pool>0) vs GONE(pool0) diff >> noise", poolGate > noise * 3 && poolGate > 300]);

  // --- GATE (render byte-id OFF): flip enabled:false → badge vanishes even with pool>0 ---
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(180);
  const rowOnPool = await badgeRow(page, VW);
  await page.evaluate(() => window.__dev.rested({ enabled: false }));
  await sleep(200);
  const rowOff = await badgeRow(page, VW);
  const rOff = await page.evaluate(() => window.__dev.rested());
  const enGate = diffCount(rowOnPool, rowOff);
  A.push(["5. GATE: enabled:false → badge GONE despite pool (diff >> noise; render behind RESTED_XP.enabled)", enGate > noise * 3 && enGate > 300]);
  A.push(["5. GATE: enabled:false → sim willSpend false (feature dark)", rOff.willSpend === false]);
  // flip back ON, restore pool → badge returns (diff vs the OFF frame >> noise)
  await page.evaluate(() => window.__dev.rested({ enabled: true }));
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(200);
  const rowBackOn = await badgeRow(page, VW);
  const backGate = diffCount(rowBackOn, rowOff);
  A.push(["5. GATE reversible: enabled back true → badge RETURNS (diff >> noise)", backGate > noise * 3 && backGate > 300]);

  // --- OUTSIDE safe zone, pool full → bar + willSpend "zZ ×N" tag (spending) ---
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round((bbox[2] + 800) / TS), Math.round(cy / TS));
  await sleep(350);
  await clearCurse(page);
  await sleep(150);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(250);
  const rOut = await page.evaluate(() => window.__dev.rested());
  const sceneOut = await page.evaluate(() => window.__dev.scene());
  A.push(["3. OUTSIDE: scene==='play' (curse cleared)", sceneOut === "play"]);
  A.push(["3. OUTSIDE: sim inZone false", rOut.inZone === false]);
  A.push(["3. OUTSIDE: willSpend true (spending — mirror flips with position)", rOut.willSpend === true]);
  await page.screenshot({ path: "shots/cas2259/qa-outside-willspend.png" });

  // --- sim UNTOUCHED regression: spend via the REAL gainXP chokepoint drains the pool; accrual refills ---
  const poolBeforeSpend = (await page.evaluate(() => window.__dev.rested())).pool;
  await page.evaluate(() => window.__dev.rested({ addXp: 100 }));   // OUTSIDE zone → gainXP bonus = round(100*(1.5-1))=50 drained
  await sleep(120);
  const poolAfterSpend = (await page.evaluate(() => window.__dev.rested())).pool;
  A.push(["6. sim intact: spend drains pool (600→~550 via real gainXP)", poolAfterSpend < poolBeforeSpend && poolAfterSpend >= poolBeforeSpend - 60]);

  // accrual: back inside, pool below cap, watch it rise
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round(cx / TS), Math.round(cy / TS));
  await clearCurse(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 100 }));
  const p0 = (await page.evaluate(() => window.__dev.rested())).pool;
  await sleep(1100);
  const p1 = (await page.evaluate(() => window.__dev.rested())).pool;
  A.push(["6. sim intact: accrual rises inside zone (~6/s)", p1 > p0 + 3]);

  const dfps = await fps(page, 1500);
  A.push(["7. desktop fps >= 55 (stable)", dfps >= 55]);
  A.push(["7. 0 JS errors (desktop)", errors.length === 0]);

  dbg = { sceneIn, sceneOut, dfps, xpMult: rested.xpMult,
    diff: { noise, poolGate, enGate, backGate },
    spend: { poolBeforeSpend, poolAfterSpend }, accrual: { p0, p1 },
    rIn: { inZone: rIn.inZone, pool: rIn.pool, willSpend: rIn.willSpend },
    rOut: { inZone: rOut.inZone, pool: rOut.pool, willSpend: rOut.willSpend } };
  await page.close();

  // =================== MOBILE ===================
  const m = await browser.newPage();
  const MW = 414, MH = 896;
  await m.setViewport({ width: MW, height: MH, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await m.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  const merr = [];
  m.on("pageerror", (e) => merr.push(String(e)));
  m.on("console", (mm) => { if (mm.type() === "error") { const t = mm.text();
    if (!/Failed to load resource|net::ERR_|favicon/.test(t)) merr.push(t); } });
  await m.goto(`${srv.url}/index.html?dev=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await toPlay(m);
  await m.evaluate(() => { window.__dev.daynight && window.__dev.daynight({ phase: 0.5 }); window.__dev.weather && window.__dev.weather(0); });
  const mrested = await m.evaluate(() => window.__dev.rested());
  A.push(["8. mobile: RESTED_XP.enabled true + scene play", mrested.enabled === true && (await m.evaluate(() => window.__dev.scene())) === "play"]);
  const msz = await m.evaluate(() => window.__dev.safeZone());
  const mbb = msz.bbox, mcx = (mbb[0] + mbb[2]) / 2, mcy = (mbb[1] + mbb[3]) / 2;
  // OUTSIDE → willSpend true, badge draws (abs-diff pool>0 vs pool0 >> noise). Mobile has NO minimap
  // (renderMiniMap returns on isTouch), so here the badge row sits over the game world instead.
  await m.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round((mbb[2] + 800) / 32), Math.round(mcy / 32));
  await sleep(350); await clearCurse(m); await sleep(150);
  await m.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(250);
  const mOut = await m.evaluate(() => window.__dev.rested());
  const mRowOnA = await badgeRow(m, MW); await sleep(60); const mRowOnB = await badgeRow(m, MW);
  const mNoise = diffCount(mRowOnA, mRowOnB);
  await m.evaluate(() => window.__dev.rested({ setPool: 0 }));
  await sleep(200);
  const mRowEmpty = await badgeRow(m, MW);
  const mPoolGate = diffCount(mRowOnB, mRowEmpty);
  A.push(["8. mobile: OUTSIDE willSpend true + badge draws (diff >> noise)", mOut.willSpend === true && mPoolGate > mNoise * 3 && mPoolGate > 300]);
  await m.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(150);
  await m.screenshot({ path: "shots/cas2259/qa-mobile-willspend.png" });
  const mfps = await fps(m, 1500);
  A.push(["8. mobile: fps >= 50", mfps >= 50]);
  A.push(["8. mobile: 0 JS errors", merr.length === 0]);
  dbg.mobile = { mfps, mNoise, mPoolGate, willSpend: mOut.willSpend };
  if (merr.length) dbg.merr = merr.slice(0, 5);
  if (errors.length) dbg.errors = errors.slice(0, 5);

  console.log("\nCAS-2259 Descanso badge — QA OBSERVABLE (LOCAL working tree pinned to HEAD render.js)\n");
  for (const [n, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`); if (!v) ok = false; }
  console.log("\n  dbg:", JSON.stringify(dbg, null, 0));
} finally { await browser.close(); await srv.close(); }
const pass = A.filter(([, v]) => v).length;
console.log(`\n  ${pass}/${A.length} checks`);
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
