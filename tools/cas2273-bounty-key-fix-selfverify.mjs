// CAS-2273 — GE self-verify for the BOUNTY BOARD player-input FIX (sev-2: feature 100% unreachable on LIVE).
// Root cause (build 80fd94fed020): BOUNTY_BOARD.key was "KeyB", but customize/wardrobe (REBINDS settings.js) already
// defaults to KeyB since CAS-1659. In input.js edge() the rebindable playAction("KeyB")→"customize" resolved+RETURNED
// before the bounty line ⇒ the bounty trigger was dead code for the real key, and mobile had NO trigger at all.
// Fix: BOUNTY_BOARD.key "KeyB"→"End" (free code, sibling of RECALL.key="Home") + a contextual mobile HUD button
// (tb.bounty, present only when BOUNTY_BOARD.enabled AND the hero is in the SAFEZONE) + a data-driven Combat Codex row.
//
// This drives the REAL input path (KeyboardEvent code, canvas touch tap) — NOT the __dev.bounty({act}) hook — which is
// exactly what CAS-2269 observable QA + the GE self-verify missed. __dev.bounty() is used only as a READ-ONLY probe of
// the resulting sim state (active contract / inZone) and to set up the featured index.
//
// Checks:
//   1  boots clean to play, 0 JS err, __dev present, BOUNTY_BOARD ON by default.
//   2  DESKTOP FIX: in the SAFEZONE, pressing the REAL "End" key accepts the featured contract (active!=null),
//      and the scene STAYS "play" (the wardrobe does NOT open).
//   3  DESKTOP no-op-in-progress via the real key: a second "End" press with an incomplete contract does NOT change it.
//   4  DESKTOP REGRESSION (the collision is gone both ways): with NO active contract, pressing "KeyB" opens the
//      wardrobe (scene==="customize") and does NOT accept a bounty (active stays null). Wardrobe binding intact.
//   5  DESKTOP anti-away: pressing "End" OUTSIDE the SAFEZONE does NOT accept (requireSafeZone gate holds).
//   6  DESKTOP reversibility: with BOUNTY_BOARD.enabled flipped false in-mem, the "End" key is inert (no accept).
//   7  MOBILE FIX: emulate touch; in the SAFEZONE, a canvas TAP on the bounty HUD button accepts the contract.
//   8  MOBILE gating: OUTSIDE the SAFEZONE, a tap at the same spot does NOT accept (button absent + away gate).
//   9  desk fps >= 55 with the feature ON.
// Run: node tools/cas2273-bounty-key-fix-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2273");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
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
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const escToPlay = async (page) => page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); } });
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); });
  await sleep(260); await escToPlay(page); };
const toWild = async (page) => { await page.evaluate(() => window.__dev.tp(40, 40)); await sleep(240); await escToPlay(page); };
async function measFps(page, ms) { return await page.evaluate(async (dur) => { let f = 0; const t0 = performance.now();
  await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
  return Math.round(f * 1000 / (performance.now() - t0)); }, ms); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ------------------------- DESKTOP -------------------------
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(`${srv.url}/?dev=1`, { waitUntil: "networkidle2", timeout: 40000 });
  await toPlay(page);
  const enabled0 = await page.evaluate(() => window.__dev.bounty().enabled);
  ok("1 boots to play, 0 err, BOUNTY_BOARD ON", (await page.evaluate(() => window.__dev.scene() === "play")) && errs.length === 0 && enabled0 === true, `err=${errs.length} enabled=${enabled0}`);

  // 2 DESKTOP FIX: real "End" key accepts in the SAFEZONE, wardrobe does NOT open
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); // wolves
  await toZone(page);
  const preActive = await page.evaluate(() => window.__dev.bounty().active);
  await key(page, "End"); await sleep(140);
  const afterEnd = await page.evaluate(() => ({ scene: window.__dev.scene(), b: window.__dev.bounty() }));
  ok("2 DESKTOP real 'End' key accepts the featured contract (scene stays play, wardrobe NOT opened)",
     preActive === null && afterEnd.scene === "play" && afterEnd.b.active !== null && afterEnd.b.active.target === "wolf",
     `preActive=${preActive} scene=${afterEnd.scene} active=${afterEnd.b.active && afterEnd.b.active.target}`);

  // 3 no-op while in progress (real key), contract unchanged
  await key(page, "End"); await sleep(120);
  const inprog = await page.evaluate(() => window.__dev.bounty());
  ok("3 DESKTOP 'End' no-op while contract in progress (still active, not claimed)",
     inprog.active !== null && inprog.complete === false, `active=${!!inprog.active} complete=${inprog.complete}`);

  // 4 REGRESSION: KeyB opens the wardrobe and does NOT accept a bounty
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await sleep(60);
  const preB = await page.evaluate(() => window.__dev.bounty().active);
  await key(page, "KeyB"); await sleep(140);
  const afterB = await page.evaluate(() => ({ scene: window.__dev.scene(), active: window.__dev.bounty().active }));
  ok("4 DESKTOP 'KeyB' opens the wardrobe (customize) and does NOT accept a bounty",
     preB === null && afterB.scene === "customize" && afterB.active === null, `scene=${afterB.scene} active=${afterB.active}`);
  await escToPlay(page);

  // 5 anti-away: "End" outside the SAFEZONE does NOT accept
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await toWild(page);
  await key(page, "End"); await sleep(120);
  const wild = await page.evaluate(() => window.__dev.bounty());
  ok("5 DESKTOP 'End' OUTSIDE the SAFEZONE does NOT accept (requireSafeZone gate)", wild.inZone === false && wild.active === null, `inZone=${wild.inZone} active=${wild.active}`);

  // 6 reversibility: feature OFF ⇒ key inert
  await toZone(page);
  await page.evaluate(() => window.__dev.bounty({ enabled: false, clear: false }));
  await key(page, "End"); await sleep(120);
  const off = await page.evaluate(() => window.__dev.bounty());
  ok("6 DESKTOP reversible: BOUNTY_BOARD.enabled=false ⇒ 'End' inert (no accept)", off.enabled === false && off.active === null, `enabled=${off.enabled} active=${off.active}`);
  await page.evaluate(() => window.__dev.bounty({ enabled: true }));

  const fps = await measFps(page, 1000);
  ok("9 desk fps >= 55 with feature ON", fps >= 55, `${fps}fps`);
  await page.screenshot({ path: join(OUT, "desk-zone.png") });

  // ------------------------- MOBILE -------------------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = []; mp.on("pageerror", (e) => mErr.push(String(e)));
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${srv.url}/?dev=1`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);

  // tap the bounty HUD button (compute its canvas-space center exactly as tbtns() does: x=m+bs*0.5, y=VH-m-bs*5.55)
  const tapBounty = async (p) => p.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * 5.55;
    window.dispatchEvent(new Event("touchstart")); // flip isTouch
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true }));
    await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true }));
    await s(60); });

  // 7 MOBILE FIX: in the SAFEZONE, tapping the HUD button accepts
  await mp.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 }));
  await mp.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(260);
  await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); } });
  const mPre = await mp.evaluate(() => window.__dev.bounty().active);
  await tapBounty(mp);
  const mAfter = await mp.evaluate(() => window.__dev.bounty());
  ok("7 MOBILE HUD button tap accepts the contract in the SAFEZONE",
     mPre === null && mAfter.active !== null && mAfter.active.target === "wolf" && mErr.length === 0,
     `preActive=${mPre} active=${mAfter.active && mAfter.active.target} err=${mErr.length}`);
  await mp.screenshot({ path: join(OUT, "mobile-zone.png") });

  // 8 MOBILE gating: OUTSIDE the SAFEZONE the same tap does NOT accept (button absent + away gate)
  await mp.evaluate(() => window.__dev.bounty({ clear: true }));
  await mp.evaluate(() => window.__dev.tp(40, 40)); await sleep(240);
  await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); } });
  await tapBounty(mp);
  const mWild = await mp.evaluate(() => window.__dev.bounty());
  ok("8 MOBILE tap OUTSIDE the SAFEZONE does NOT accept (button gated to hub)", mWild.inZone === false && mWild.active === null, `inZone=${mWild.inZone} active=${mWild.active}`);

  console.log(`\n${PASS}/${PASS + FAIL} PASS`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(FAIL ? 1 : 0);
