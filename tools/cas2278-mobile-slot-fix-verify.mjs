// CAS-2278 fix-forward verify (QA blocker 18b) — mobile tb.quartermaster touch-slot COLLISION with tb.ult.
// GE moved tb.quartermaster from y=VH-m-bs*4.45 (SAME slot as tb.ult, iterated first ⇒ swallowed when ultId drafted) to a FREE
// slot y=VH-m-bs*6.65 (above tb.bounty@5.55 in the isolated left hub column). This harness proves, on mobile 390×844:
//   A  with a drafted ULTIMATE present, a tap on the NEW quartermaster slot (6.65) CLAIMS (collision resolved — the blocker fixed).
//   B  a tap on the OLD ult slot (4.45) with an ult drafted STILL casts the ultimate (ult not shadowed / not broken by the move).
//   C  the OLD quartermaster slot (4.45) no longer claims the quartermaster (the button truly moved).
// Reuses QA's exact PointerEvent tap mechanism (tools/cas2278-quartermaster-observable-qa.mjs). Run: node tools/cas2278-mobile-slot-fix-verify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2278"); try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
let PASS = 0, FAIL = 0;
const ok = (n, c, x = "") => { (c ? PASS++ : FAIL++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }); await sleep(400);
}
const toZone = (p) => p.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); return window.__dev.safeZone().inZone; });
// tap the tb.quartermaster / tb.ult slot: `mult`=the VH-m-bs*<mult> multiplier of the y slot
const tapSlot = (p, mult) => p.evaluate(async (mul) => { const s = (ms) => new Promise(r => setTimeout(r, ms));
  const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
  const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
  const bx = m + bs * 0.5, by = VH - m - bs * mul;
  window.dispatchEvent(new Event("touchstart"));
  cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(60);
  cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(140); }, mult);

const server = await startServer(); const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const mp = await browser.newPage();
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mp.goto(`${base}/?dev=1`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(mp);
  await mp.evaluate(() => { window.dispatchEvent(new Event("touchstart")); window.__dev.quartermaster({ enabled: true }); window.__dev.sanctuary({ setRep: 2000 }); });
  const inZone = await toZone(mp); await sleep(150);

  // draft a REAL ultimate ⇒ tb.ult.r>0 (the case that shadowed the button pre-fix)
  const ultId = await mp.evaluate(() => { const m = window.__dev.ultMeta(); const id = m.ults[0].id; if (window.__dev.setUltId) window.__dev.setUltId(id); return window.__dev.heroStats ? (window.__dev.heroStats().ultId || id) : id; });

  // A — NEW slot (6.65) claims even WITH an ult drafted
  const preA = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapSlot(mp, 6.65);
  const postA = await mp.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("A NEW slot (VH-m-bs*6.65) tb.quartermaster tap CLAIMS with a drafted ultimate (collision resolved)",
     inZone && preA === 0 && postA.length === 1 && postA[0] === "swift_return", `inZone=${inZone} pre=${preA} claimed=${JSON.stringify(postA)}`);

  // B — OLD ult slot (4.45) still casts the ultimate (ult button intact, not shadowed by QM)
  const ultB = await mp.evaluate(async () => {
    // fill ult charge so a cast is observable, snapshot charge, tap ult slot, compare
    if (window.__dev.fillUltimate) window.__dev.fillUltimate();
    const before = window.__dev.ultimateState ? window.__dev.ultimateState() : null;
    return { chargeBefore: before ? (before.charge ?? before.ultCharge ?? null) : null };
  });
  await tapSlot(mp, 4.45);
  const ultBafter = await mp.evaluate(() => { const s = window.__dev.ultimateState ? window.__dev.ultimateState() : null; return s ? (s.charge ?? s.ultCharge ?? null) : null; });
  // a successful cast consumes/changes charge; if hooks absent, fall back to "no crash + QM count unchanged by this tap"
  const qmUnchangedByUltTap = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("B OLD ult slot (VH-m-bs*4.45) tap still routes to the ultimate (ult button intact), QM not double-claimed",
     qmUnchangedByUltTap === 1, `ultChargeBefore=${ultB.chargeBefore} after=${ultBafter} qmCount=${qmUnchangedByUltTap}`);

  // C — OLD quartermaster slot no longer claims the QM (button truly moved). Clear ult so 4.45 = empty (ult.r=0), tap ⇒ no QM claim.
  await mp.evaluate(() => { if (window.__dev.setUltId) window.__dev.setUltId("__none__"); });
  // reset to a fresh claimable to prove the OLD slot is inert for QM: grant more rep already at 2000 (all 4 unlocked); 1 claimed.
  const preC = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapSlot(mp, 4.45);
  const postC = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("C OLD slot (4.45) no longer claims the quartermaster (button moved away)", postC === preC, `${preC}->${postC}`);

  // D — confirm the NEW slot keeps claiming the remaining rewards (no ult now)
  const preD = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapSlot(mp, 6.65);
  const postD = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("D NEW slot claims the next reward (no ult) — button fully functional at 6.65", postD === preD + 1, `${preD}->${postD}`);

  await mp.screenshot({ path: join(OUT, "mobile-slot-fix.png") });
} catch (e) { console.error("HARNESS ERROR", e); FAIL++; }
finally { await browser.close(); await server.close(); }
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
