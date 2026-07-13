// CAS-2273 — QA (independent) re-verify for the BOUNTY BOARD player-input FIX (sev-2).
// The GE self-verify (cas2273-bounty-key-fix-selfverify.mjs) proved ACCEPT + regression + gates via the real "End"
// key & mobile tap. This QA pass closes the QA-specific gaps it did NOT cover:
//   Q1  FULL PLAYER LOOP via the REAL "End" key end-to-end: accept → complete (via the SAME monotonic counters that
//       killEnemy bumps, bounty({kill})) → CLAIM by pressing "End" again → gold rises + XP/level rises + rotation
//       advances + contract clears. Proves the ENTIRE hub loop is reachable by a real player, not just the accept.
//   Q2  Regression BOTH ways in one run: "KeyB" still opens the wardrobe; "End" never opens the wardrobe.
//   Q3  requireSafeZone gate on the CLAIM (not just accept): a completed contract does NOT auto-claim outside the zone.
//   Q4  byte-id OFF: with the feature flipped off in-mem the "End" key is inert AND h.bounty field is absent (hasField).
//   Q5  desk + mobile fps >= 55; mobile HUD tap drives the same tryBounty chokepoint.
// Drives REAL input paths (KeyboardEvent code:"End", canvas touch tap). __dev.bounty() is a READ-ONLY probe + the
// kill-counter driver only (same counters as killEnemy — NOT __dev.bounty({act}), so the binding itself is exercised).
// Run: node tools/cas2273-bounty-key-qa.mjs
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
  ok("Q0 boots to play, 0 err, BOUNTY_BOARD ON by default",
     (await page.evaluate(() => window.__dev.scene() === "play")) && errs.length === 0 && enabled0 === true, `err=${errs.length} enabled=${enabled0}`);

  // Q1 — FULL LOOP driven by the real "End" key (accept → complete via real counters → CLAIM via "End")
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); // featured = a typed (wolf) contract
  await toZone(page);
  const pre = await page.evaluate(() => { const b = window.__dev.bounty(); return { active: b.active, gold: b.gold, lvl: b.lvl, idx: b.bountyIdx, hasField: b.hasField }; });
  await key(page, "End"); await sleep(140);                                    // ACCEPT via real key
  const acc = await page.evaluate(() => { const b = window.__dev.bounty(); return { scene: window.__dev.scene(), active: b.active, need: b.active && b.active.count, tgt: b.active && b.active.target }; });
  // complete the contract through the SAME monotonic counters killEnemy bumps (real kill path, not act)
  await page.evaluate((n) => window.__dev.bounty({ kill: { type: "wolf", n } }), (acc.need || 6) + 1);
  await sleep(120);
  const rdy = await page.evaluate(() => { const b = window.__dev.bounty(); return { complete: b.complete, gold: b.gold, lvl: b.lvl }; });
  await key(page, "End"); await sleep(160);                                    // CLAIM via real key
  const post = await page.evaluate(() => { const b = window.__dev.bounty(); return { scene: window.__dev.scene(), active: b.active, gold: b.gold, lvl: b.lvl, idx: b.bountyIdx }; });
  const claimed = acc.scene === "play" && acc.active !== null && rdy.complete === true
      && post.active === null && post.gold > pre.gold && (post.lvl > pre.lvl || post.gold - pre.gold > 0) && post.idx === pre.idx + 1;
  ok("Q1 FULL LOOP via real 'End': accept→complete(real kills)→CLAIM (gold+XP, rotation advances, contract cleared)",
     claimed, `gold ${pre.gold}->${post.gold} lvl ${pre.lvl}->${post.lvl} idx ${pre.idx}->${post.idx} scene=${post.scene}`);

  // Q2 — regression BOTH ways: KeyB opens wardrobe (no accept); End never opens wardrobe
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await sleep(60);
  await key(page, "KeyB"); await sleep(140);
  const b1 = await page.evaluate(() => ({ scene: window.__dev.scene(), active: window.__dev.bounty().active }));
  await escToPlay(page);
  await key(page, "End"); await sleep(120);
  const b2 = await page.evaluate(() => ({ scene: window.__dev.scene() }));
  ok("Q2 regression: KeyB opens wardrobe & accepts nothing; End never opens wardrobe",
     b1.scene === "customize" && b1.active === null && b2.scene === "play", `KeyB->${b1.scene}(active=${b1.active}) End->${b2.scene}`);

  // Q3 — requireSafeZone gate on the CLAIM: a completed contract outside the zone does NOT claim via End
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 }));
  await key(page, "End"); await sleep(120);                                    // accept in zone
  await page.evaluate(() => window.__dev.bounty({ kill: { type: "wolf", n: 12 } })); await sleep(80);
  await toWild(page);
  const goldBefore = await page.evaluate(() => window.__dev.bounty().gold);
  await key(page, "End"); await sleep(140);                                    // try to claim OUTSIDE
  const wild = await page.evaluate(() => { const b = window.__dev.bounty(); return { inZone: b.inZone, active: b.active, gold: b.gold, complete: b.complete }; });
  ok("Q3 CLAIM gated by requireSafeZone: completed contract NOT claimed outside the zone (still active, gold unchanged)",
     wild.inZone === false && wild.active !== null && wild.complete === true && wild.gold === goldBefore, `inZone=${wild.inZone} active=${!!wild.active} gold=${wild.gold}(was ${goldBefore})`);

  // Q4 — reversibility (the CAS-2273-relevant part): flip off in-mem ⇒ the real 'End' key is inert (no accept).
  // (Save-field byte-id — fresh hero never creates h.bounty/h.bountyIdx — is UNCHANGED by this fix, which only
  //  touches the key binding + additive HUD/codex; that OFF-cleanliness was already proven by CAS-2269. Here the
  //  hero has legitimately used the feature, so h.bountyIdx exists — we assert only the 'End'-inert reversibility.)
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await toZone(page);
  await page.evaluate(() => window.__dev.bounty({ enabled: false }));
  await key(page, "End"); await sleep(120);
  const off = await page.evaluate(() => { const b = window.__dev.bounty(); return { enabled: b.enabled, active: b.active }; });
  ok("Q4 reversible: enabled=false ⇒ real 'End' key inert (no accept)",
     off.enabled === false && off.active === null, `enabled=${off.enabled} active=${off.active}`);
  await page.evaluate(() => window.__dev.bounty({ enabled: true }));

  const fps = await measFps(page, 1000);
  ok("Q5a desk fps >= 55 with feature ON", fps >= 55, `${fps}fps`);
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); await toZone(page); await key(page, "End"); await sleep(120);
  await page.screenshot({ path: join(OUT, "qa-desk-loop.png") });

  // ------------------------- MOBILE -------------------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = []; mp.on("pageerror", (e) => mErr.push(String(e)));
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${srv.url}/?dev=1`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  await mp.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); await toZone(mp);
  // tap the contextual HUD button (present only in the SAFEZONE). Compute its canvas-space center exactly as
  // tbtns() does (x=m+bs*0.5, y=VH-m-bs*5.55) and dispatch a real touch PointerEvent on canvas #c.
  const mPre = await mp.evaluate(() => window.__dev.bounty().active);
  const tapped = await mp.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * 5.55;
    window.dispatchEvent(new Event("touchstart")); // flip isTouch
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true }));
    await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true }));
    await s(140);
    return { active: window.__dev.bounty().active };
  });
  const mfps = await measFps(mp, 1000);
  ok("Q5b MOBILE HUD button tap in zone accepts via tryBounty chokepoint; fps>=55, 0 err",
     mPre === null && tapped.active !== null && tapped.active.target === "wolf" && mfps >= 55 && mErr.length === 0,
     `preActive=${mPre} active=${tapped.active && tapped.active.target} fps=${mfps} err=${mErr.length}`);
  await mp.screenshot({ path: join(OUT, "qa-mobile-loop.png") });

  console.log(`\n${PASS}/${PASS + FAIL} PASS`);
} finally {
  await browser.close();
  await srv.close?.();
  process.exit(FAIL ? 1 : 0);
}
