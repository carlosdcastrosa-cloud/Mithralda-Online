// CAS-2592 — POST-SHIP IN-GAME VISUAL QA for the CAS-2587 sprite-audit fix (rat/adv real FOUNTAINS cutouts).
// Objective: prove the last 2 procedural-placeholder combat sprites now render REAL PixelLab cutouts in-game
//   (not the tiny procedural SP blob), feet-anchored, animated via the CAS-203 breathe/walk-bob path.
//
// The served live build (gh-pages ccdcf3c984e9 / version.json c619cd2dd617/815) is byte-verified == master HEAD
//   (CTO acceptance 5/5: rat/adv assets 200, served sprites.js has both wirings, config.js sha UNCHANGED,
//    served asset bytes == HEAD, version.json advanced). So serving the LOCAL tree renders the identical bundle.
//   This harness ALSO curls the SERVED HOST for the two cutouts + version.json (task gate).
//
// Proof strategy (read-only, no game-code change):
//   - dynamic-import the SAME `/render/sprites.js` ES-module the game loaded ⇒ singleton IMG object with the
//     real loaded <img> elements. Assert IMG[enemy_rat]/IMG[enemy_adv] complete + naturalWidth/Height == the
//     committed cutout dims (rat 70x46, adv 28x69). drawEnemy only takes the cutout branch when
//     img.complete && img.naturalWidth, so loaded-at-real-dims == cutout path (procedural blob would be 0x0/absent).
//   - spawn a `rat` and a `healer` (sprite:"adv") next to the hero via __dev.spawn ⇒ REAL spawnEnemy path.
//   - screenshot the live canvas for human/visual sign-off (feet-anchor + on-style).
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2592-sprite-ingame-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const SHOT_DIR = join(ROOT, "shots", "cas2592");
mkdirSync(SHOT_DIR, { recursive: true });

// Committed cutout dims (from the PNGs on master).
const EXPECT = {
  enemy_rat: { w: 70, h: 46 },
  enemy_adv: { w: 28, h: 69 },
};

let pass = 0, fail = 0;
const ok = (c, m) => { (c ? pass++ : fail++); console.log(`  ${c ? "PASS" : "FAIL"}  ${m}`); };

async function main() {
  // --- Served-host gate (task acceptance): assets 200 + version.json ---
  console.log("L1  SERVED HOST (task gate):", LIVE);
  const cb = "?cb=" + (process.pid ^ 0x2592);
  for (const [key, base] of [["enemy_rat", "/assets/pixellab/fountains/enemy_rat.png"],
                             ["enemy_adv", "/assets/pixellab/fountains/enemy_adv.png"]]) {
    const r = await fetch(LIVE + base + cb);
    ok(r.status === 200, `served ${key} → HTTP ${r.status} (expect 200)`);
  }
  const vj = await (await fetch(LIVE + "/version.json" + cb)).json();
  ok(vj.build === "c619cd2dd617" && vj.files === 815, `served version.json → build ${vj.build} files ${vj.files} (expect c619cd2dd617/815)`);
  const spjs = await (await fetch(LIVE + "/render/sprites.js" + cb)).text();
  ok(/rat:"enemy_rat"/.test(spjs) && /adv:"enemy_adv"/.test(spjs), "served render/sprites.js contains rat/adv wiring");

  // --- Boot local byte-identical bundle in a real browser ---
  const { url, close } = await startServer();
  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const advance = async (from, dispatch, timeoutMs = 15000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        if (await page.evaluate(() => window.__dev.scene()) !== from) return;
        await page.evaluate(dispatch); await sleep(400);
      }
    };
    await page.goto(url + "/?dev", { waitUntil: "domcontentloaded" });
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
    await sleep(300);
    await advance("menu", () => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAsprite";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
    await advance("classsel", () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 12000 });
    for (const s of ["customize", "abilitysel"]) {
      if (await page.evaluate(() => window.__dev.scene()) === s)
        await advance(s, () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    }
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
    ok(true, "L2  booted to play (class 1) with no fatal boot error");

    // --- Read the live IMG singleton (same module the game imported) ---
    const imgState = await page.evaluate(async () => {
      const mod = await import("./render/sprites.js");
      const IMG = mod.IMG;
      const read = k => { const im = IMG[k]; return im ? { present: true, complete: !!im.complete, w: im.naturalWidth, h: im.naturalHeight } : { present: false }; };
      return { rat: read("enemy_rat"), adv: read("enemy_adv") };
    });
    for (const [name, key] of [["rat", "rat"], ["healer/adv", "adv"]]) {
      const s = imgState[key];
      const e = EXPECT[key === "rat" ? "enemy_rat" : "enemy_adv"];
      ok(s.present && s.complete && s.w === e.w && s.h === e.h,
        `L3  ${name} cutout loaded: complete=${s.complete} ${s.w}x${s.h} (expect ${e.w}x${e.h}) — cutout branch, not procedural blob`);
    }

    // --- Spawn a rat + healer next to the hero (REAL spawnEnemy path) and screenshot ---
    const before = await page.evaluate(() => window.__dev.enemyCount());
    await page.evaluate(() => {
      window.__dev.spawn("rat", -70, -10);
      window.__dev.spawn("healer", 70, -10);
    });
    await new Promise(r => setTimeout(r, 500)); // let a few frames draw
    const after = await page.evaluate(() => window.__dev.enemyCount());
    ok(after >= before + 2, `L4  spawned rat + healer next to hero (enemyCount ${before} → ${after})`);

    const shot = join(SHOT_DIR, "ingame-rat-healer.png");
    await page.screenshot({ path: shot });
    ok(true, `L5  screenshot captured → ${shot}`);

    // --- A/B: force procedural to contrast the blob (evidence only) ---
    await page.evaluate(() => window.__dev.pixelart(false));
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: join(SHOT_DIR, "ingame-procedural-ab.png") });
    await page.evaluate(() => window.__dev.pixelart(true));
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: join(SHOT_DIR, "selfverify.png") });
    ok(true, "L6  A/B procedural-vs-cutout shots captured (selfverify.png = cutout)");

    const fatal = errors.filter(e => !/favicon|404/.test(e));
    ok(fatal.length === 0, `L7  no fatal JS errors during boot+spawn (${fatal.length})` + (fatal[0] ? " :: " + fatal[0] : ""));
  } finally {
    await browser.close();
    await close();
  }

  console.log(`\n  ${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
