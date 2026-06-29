// CAS-223 — verify the warrior is now Clarice with ALL her animations wired.
// Boots a warrior on the LOCAL repo-root server, then hooks ctx.drawImage to record
// which class-strip image is drawn for the hero (source height ≈ CLASS_FH=166) in each
// sim state, and screenshots class-select + in-world idle/walk/attack/death.
//   node tools/cas223-clarice-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");
const key = (page, code, type = "keydown") =>
  page.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit", ""), bubbles: true })), code, type);

function installHook(CLASS_FH) {
  window.__strip = { byState: {}, all: [], _dead: false };
  const base = s => (s || "").split("/").pop().split("?")[0];
  const proto = CanvasRenderingContext2D.prototype, orig = proto.drawImage;
  proto.drawImage = function (...a) {
    if (a.length === 9) {
      // a[0] is the source image when the hero strip is drawn DIRECTLY, OR when it is
      // copied into the hurt-flash tint buffer (death/hurt frames draw through the buffer
      // on a small offscreen canvas, so the canvas-width gate must NOT be used). a[0].src
      // still names the class strip; sh ≈ CLASS_FH(166) marks a class-cell hero frame.
      const sh = a[4], src = a[0] && (a[0].src || a[0].currentSrc);
      if (Math.abs(sh - CLASS_FH) <= 1 && src && src.indexOf("classes/") >= 0) {
        const b = base(src); if (window.__strip.all.indexOf(b) < 0) window.__strip.all.push(b);
        const st = window.__dev && window.__dev.heroAnim && window.__dev.heroAnim();
        const s = st ? st.state : "?"; // label by the REAL sim animState (idle/walk/attack/dead)
        // first-write wins for "dead": the in-world hero (death strip) draws before the
        // death-screen idle portrait (clshero), which would otherwise overwrite it.
        if (s !== "dead" || !window.__strip.byState.dead) window.__strip.byState[s] = b;
      }
    }
    return orig.apply(this, a);
  };
}

const srv = await startServer();
const BASE = srv.url;
console.log(`· local server ${BASE}`);
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const report = {};
try {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("  [pageerror]", String(e).slice(0, 200)));
  page.on("console", m => { const t = m.text(); if (/error|fail|undefined is not/i.test(t)) console.log("  [page]", t.slice(0, 160)); });
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?dev`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())", { timeout: 25000 });

  // menu → class-select
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "ClariceQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  }
  await sleep(900); // let class-select strips load
  await page.screenshot({ path: join(OUT, "cas223-classsel.png") });

  // pick warrior (Clarice)
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await page.evaluate(installHook, 166);
  await sleep(700);

  // IDLE
  await sleep(500);
  await page.screenshot({ path: join(OUT, "cas223-idle.png"), clip: { x: 330, y: 170, width: 240, height: 280 } });

  // WALK
  await key(page, "KeyD"); await sleep(700);
  await page.screenshot({ path: join(OUT, "cas223-walk.png"), clip: { x: 330, y: 170, width: 240, height: 280 } });
  await key(page, "KeyD", "keyup"); await sleep(200);

  // ATTACK — spawn fodder (godmode) then swing at it a few times
  await page.evaluate(() => window.__dev.juiceArena && window.__dev.juiceArena(4));
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyJ", key: "j", bubbles: true })); });
    const st = await page.evaluate(() => window.__dev.heroAnim().state);
    if (st === "attack") break;
    await sleep(60);
  }
  await page.screenshot({ path: join(OUT, "cas223-attack.png"), clip: { x: 330, y: 170, width: 240, height: 280 } });

  // DEATH — drop HP to the floor (setHeroHp clamps to 1) and let the adjacent godmode
  // skeletons land the killing blow; poll until the sim is actually in the dead state so
  // we screenshot/record the death frame, not a pre-death idle frame.
  await page.evaluate(() => { window.__strip._dead = true; });
  let deadScene = "play";
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__dev.setHeroHp && window.__dev.setHeroHp(0)); // keep at 1 until a hit kills
    deadScene = await page.evaluate(() => window.__dev.scene());
    const anim = await page.evaluate(() => window.__dev.heroAnim());
    if (deadScene === "dead" || (anim && anim.state === "dead")) break;
    await sleep(80);
  }
  await sleep(300); // let a couple of death frames draw
  await page.screenshot({ path: join(OUT, "cas223-death.png"), clip: { x: 330, y: 170, width: 240, height: 280 } });

  report.byState = await page.evaluate(() => window.__strip.byState);
  report.all = await page.evaluate(() => Array.from(window.__strip.all));
  report.deadScene = deadScene;
} finally {
  await browser.close();
  await srv.close();
}

console.log("\nCAS-223 — Clarice (warrior) strip per state:");
const want = { idle: "warrior.png", walk: "warrior_walk.png", attack: "warrior_attack.png", dead: "warrior_death.png" };
let pass = true;
for (const st of ["idle", "walk", "attack", "dead"]) {
  const got = report.byState[st] || "(none)";
  const ok = got === want[st];
  pass = pass && ok;
  console.log(`  ${st.padEnd(7)} → ${got.padEnd(20)} expect ${want[st].padEnd(20)} ${ok ? "PASS" : "FAIL"}`);
}
console.log(`  dead scene = ${report.deadScene} (expect 'dead')`);
console.log(`  all hero strips drawn: ${report.all.join(", ")}`);
console.log(pass ? "\n✔ ALL PASS — warrior replaced by Clarice, idle/walk/attack/death wired" : "\n✖ FAIL — see above");
process.exit(pass ? 0 : 1);
