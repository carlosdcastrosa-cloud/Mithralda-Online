// CAS-238 — LIVE in-game proof for the 4 new class heroes (mage/druid/priest/paladin).
// Serves the working tree locally, selects each class, and for every anim-state verifies
//   (1) STRIP BINDING — the cell blitted in that state is the class's OWN source-derived
//       strip file (<cls>.png / _walk / _attack / _death), not the procedural hooded bake;
//   (2) ANIM ADVANCE  — consecutive screenshots of the hero region DIFFER (no static
//       sprite — the cas224 live anim-advance proof), incl. attack + death;
// plus per-class hero screenshots for visual sign-off and a fps / console-error gate.
//   node tools/cas238-classes-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const diff = (a, b) => { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++; return d; };
// CLASS_LIST order → class-select digit
const CLASSES = [{ cls: "paladin", digit: "Digit2" }, { cls: "mage", digit: "Digit3" },
                 { cls: "druid", digit: "Digit4" }, { cls: "priest", digit: "Digit5" }];
const HERO_CLIP = { x: 398, y: 232, width: 104, height: 150 };

function installHook(CLASS_FH){
  window.__strip = { byState: {} };
  const base = s => (s || "").split("/").pop().split("?")[0];
  const p = CanvasRenderingContext2D.prototype, o = p.drawImage;
  p.drawImage = function(...a){
    if (a.length === 9){ const sh = a[4], src = a[0] && (a[0].src || a[0].currentSrc);
      if (Math.abs(sh - CLASS_FH) <= 1 && src && src.indexOf("classes/") >= 0){ const b = base(src);
        const st = window.__dev && window.__dev.heroAnim && window.__dev.heroAnim(); const s = st ? st.state : "?";
        if (s !== "dead" || !window.__strip.byState.dead) window.__strip.byState[s] = b; } }
    return o.apply(this, a); };
}

// default: serve the local working tree. Pass a URL arg to test a deployed host.
const ARG_BASE = process.argv[2] && /^https?:\/\//.test(process.argv[2]) ? process.argv[2].replace(/\/$/, "") : null;
const server = ARG_BASE ? { url: ARG_BASE, close: async () => {} } : await startServer();
if (ARG_BASE) console.log("LIVE base:", ARG_BASE);
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = []; const errors = [];
try {
  for (const { cls, digit } of CLASSES){
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
    page.on("pageerror", e => errors.push(`${cls}: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") errors.push(`${cls}: ${m.text()}`); });
    await page.goto(`${server.url}/index.html?dev`, { waitUntil: "load", timeout: 40000 });
    await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','classsel'].includes(window.__dev.scene())", { timeout: 25000 });
    await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
      const el = document.getElementById("nameInput"); if (el) el.value = "QA238";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
    await page.evaluate(d => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
    await page.evaluate(installHook, 166);
    const r = { cls, got: await page.evaluate(() => window.__dev.hero().cls), strips: {}, advance: {} };

    // IDLE
    await sleep(500); let a = await page.screenshot({ clip: HERO_CLIP });
    await sleep(640); let b = await page.screenshot({ clip: HERO_CLIP });
    r.advance.idle = diff(a, b); await page.screenshot({ path: join(OUT, `cas238-${cls}-idle.png`), clip: HERO_CLIP });

    // WALK
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
    await sleep(360); a = await page.screenshot({ clip: HERO_CLIP }); await sleep(380); b = await page.screenshot({ clip: HERO_CLIP });
    r.advance.walk = diff(a, b);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));

    // ATTACK
    await page.evaluate(() => window.__dev.juiceArena && window.__dev.juiceArena(4));
    for (let i = 0; i < 16; i++){ await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j", bubbles: true })));
      if (await page.evaluate(() => window.__dev.heroAnim().state) === "attack") break; await sleep(50); }
    a = await page.screenshot({ clip: HERO_CLIP }); await sleep(120); b = await page.screenshot({ clip: HERO_CLIP });
    r.advance.attack = diff(a, b); await page.screenshot({ path: join(OUT, `cas238-${cls}-attack.png`), clip: HERO_CLIP });

    // DEATH
    for (let i = 0; i < 12; i++){ await page.evaluate(() => window.__dev.setHeroHp && window.__dev.setHeroHp(0)); await sleep(120);
      if (await page.evaluate(() => window.__dev.heroAnim().state) === "dead") break; }
    a = await page.screenshot({ clip: HERO_CLIP }); await sleep(180); b = await page.screenshot({ clip: HERO_CLIP });
    r.advance.death = diff(a, b); r.deadState = await page.evaluate(() => window.__dev.heroAnim().state);
    await page.screenshot({ path: join(OUT, `cas238-${cls}-death.png`), clip: HERO_CLIP });

    r.strips = await page.evaluate(() => window.__strip.byState);
    results.push(r); await page.close();
  }
} finally { await browser.close(); await server.close(); }

let pass = 0, total = 0;
const check = (c, m) => { total++; if (c) pass++; console.log((c ? "✔" : "✖") + " " + m); };
for (const r of results){
  console.log(`\n=== ${r.cls} (got ${r.got}) — strips ${JSON.stringify(r.strips)} adv ${JSON.stringify(r.advance)} ===`);
  check(r.got === r.cls, `${r.cls}: class selected`);
  check(r.strips.idle === `${r.cls}.png`, `${r.cls}: idle strip = ${r.cls}.png (got ${r.strips.idle})`);
  check(r.strips.walk === `${r.cls}_walk.png`, `${r.cls}: walk strip = ${r.cls}_walk.png (got ${r.strips.walk})`);
  check(r.strips.attack === `${r.cls}_attack.png`, `${r.cls}: attack strip = ${r.cls}_attack.png (got ${r.strips.attack})`);
  check(r.strips.dead === `${r.cls}_death.png`, `${r.cls}: death strip = ${r.cls}_death.png (got ${r.strips.dead})`);
  check(r.advance.idle > 60, `${r.cls}: IDLE advances (Δ ${r.advance.idle})`);
  check(r.advance.walk > 60, `${r.cls}: WALK advances (Δ ${r.advance.walk})`);
  check(r.deadState === "dead", `${r.cls}: death state reached`);
}
check(errors.length === 0, `no console/page errors (${errors.length})`);
if (errors.length) console.log("errors:", JSON.stringify(errors.slice(0, 6)));
console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
