// CAS-2242 — MOBILE OBSERVABLE verify of the CITY SAFE ZONE / SANCTUARY (sim-authoritative HP regen inside the city,
// $0 art, DARK). Mobile companion to tools/cas2242-safezone-qa.mjs. Confirms the sanctuary regen behaves identically
// under a phone viewport (390×844, DPR 2, touch), the game boots clean, touch input moves the hero, the "Zona segura"
// affordance draws, and fps holds on mobile. The AUTHORITY lives in sim (tickSafeZone); flags flipped in-memory via
// __dev.safeZone() so the on-disk config stays false ⇒ byte-identical served build.
// Run: node tools/cas2242-safezone-mobile-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2242");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TS = 32;

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAMobile";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(500);
}

// Drive a touch drag on the game canvas (CAS-2198 pattern): first flip the game's isTouch flag with a
// DOM touchstart, then dispatch pointerType:"touch" PointerEvents (down→move→up) on the LEFT zone
// (x < VW*0.42) so the virtual move-stick engages. Left/lower area = move stick.
async function touchDrag(page) {
  await page.evaluate(() => {
    const c = document.getElementById("c") || document.querySelector("canvas");
    window.dispatchEvent(new Event("touchstart", { bubbles: true }));   // flip isTouch=true
    const r = c.getBoundingClientRect();
    window.__qaStick = { x0: r.left + r.width * 0.15, y0: r.top + r.height * 0.72 };
    const s = window.__qaStick;
    c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0, clientY: s.y0, bubbles: true, cancelable: true }));
  });
  const move = (type, dx) => page.evaluate((type, dx) => {
    const c = document.getElementById("c") || document.querySelector("canvas");
    const s = window.__qaStick;
    c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0 + dx, clientY: s.y0, bubbles: true, cancelable: true }));
  }, type, dx);
  for (let i = 1; i <= 14; i++) { await move("pointermove", i * 6); await sleep(28); }
  await move("pointerup", 84);
  await sleep(500);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); });

  const A = [];
  const sz = (p) => page.evaluate((pp) => window.__dev.safeZone(pp), p ?? null);
  const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));
  const tpCity = async (g) => { const cx = (g.bbox[0] + g.bbox[2]) / 2, cy = (g.bbox[1] + g.bbox[3]) / 2;
    await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), cx / TS, cy / TS); await sleep(120); };

  // boot clean under mobile viewport
  A.push(["boots to play under mobile viewport (390×844, touch)", await page.evaluate(() => window.__dev.scene()) === "play"]);
  const s0 = await sz();
  A.push(["SAFEZONE.enabled default === false (DARK)", s0.enabled === false]);

  // touch input moves the hero (mobile playability)
  const heroPos = () => page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  const before = await heroPos();
  await touchDrag(page);
  const after = await heroPos();
  const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
  A.push([`touch drag moves the hero (Δ=${moved.toFixed(1)}px)`, moved > 2]);

  // DARK byte-safe on mobile: flag OFF inside city ⇒ no regen
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20 }));
  const d0 = (await sz()).hp; await sleep(1200); const d1 = (await sz()).hp;
  A.push([`DARK: HP frozen with flag OFF inside city (${d0}→${d1})`, Math.abs(d1 - d0) < 0.01]);

  const fp0 = await fp();

  // flip ON inside city ⇒ regen climbs
  await page.evaluate(() => window.__dev.safeZone({ enabled: true, setHp: 20, pause: 0 }));
  const inState = await sz();
  const i0 = (await sz()).hp; await sleep(1500); const i1 = (await sz()).hp;
  A.push([`inside city ⇒ inZone true`, inState.inZone === true]);
  A.push([`inside city ⇒ HP regens (${i0}→${i1.toFixed(1)}, +${(i1 - i0).toFixed(1)})`, (i1 - i0) > 1]);

  // temple accelerated
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), s0.temple.x / TS, s0.temple.y / TS);
  await sleep(120);
  const tState = await sz();
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20, pause: 0 }));
  const t0 = (await sz()).hp; await sleep(1500); const t1 = (await sz()).hp;
  A.push([`near Templo ⇒ accelerated (rate=${tState.ratePctPerSec}%/s > plain ${inState.ratePctPerSec}%/s)`, tState.nearTemple === true && tState.ratePctPerSec > inState.ratePctPerSec + 0.001]);
  A.push([`Templo regen faster than plain (+${(t1 - t0).toFixed(1)} > +${(i1 - i0).toFixed(1)})`, (t1 - t0) > (i1 - i0) + 0.5]);

  // damage pause
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20, pause: 1.5 }));
  const pState = await sz();
  const ph0 = pState.hp; await sleep(800); const ph1 = (await sz()).hp;
  A.push([`regen PAUSED after damage (${ph0}→${ph1.toFixed(1)})`, (ph1 - ph0) < 0.6]);
  await sleep(1400); const ph2 = (await sz()).hp;
  A.push([`regen RESUMES after pause (${ph1.toFixed(1)}→${ph2.toFixed(1)})`, (ph2 - ph1) > 1]);

  // affordance draws on mobile
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ enabled: false, setHp: 80 }));
  await sleep(200);
  const hOff = createHash("md5").update(await page.screenshot()).digest("hex");
  await page.evaluate(() => window.__dev.safeZone({ enabled: true }));
  await sleep(200);
  await page.screenshot({ path: join(OUT, "safezone-badge-mobile.png") });
  const hOn = createHash("md5").update(await page.screenshot()).digest("hex");
  A.push(["affordance: flag-ON-in-city frame DIFFERS from OFF (badge draws)", hOn !== hOff]);

  // fingerprint stable across the whole mobile run
  await page.evaluate(() => window.__dev.safeZone({ enabled: false }));
  const fp2 = await fp();
  A.push(["worldFingerprint identical after OFF→ON→OFF (0 sim/save drift)", fp0 === fp2]);

  // mobile fps
  await page.evaluate(() => window.__dev.safeZone({ enabled: true, setHp: 30 }));
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    (function loop() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(n); })();
  }));
  A.push([`fps >= 50 with safe-zone active on mobile (got ${fps})`, fps >= 50]);

  A.push(["0 JS errors during whole mobile run", errors.length === 0]);

  console.log("\nCAS-2242 CITY SAFE ZONE — MOBILE OBSERVABLE self-verify\n");
  for (const [name, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${name}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
} finally {
  await srv.close?.();
  await browser.close();
}
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
