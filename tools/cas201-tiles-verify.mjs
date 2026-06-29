// ---------------------------------------------------------------------------
// CAS-201 — in-engine visual QA of the canonical FOUNTAINS tileset wiring.
//
// CAS-201 (commit 7c845c4) swapped the renderer's named tile slots to the
// board-approved (CAS-200) hand-authored FOUNTAINS dark-fantasy batch, drop-in:
//   cave_floor / cave_floor2  (T_STONE caves/abyss)  <- slate flagstone
//   ruins_floor / ruins_floor2 (T_COBBLE town/trial) <- dark cobble / cracked flag
//   wall / wall2                                      <- ashlar dungeon wall
//
// The deployed hosts (tender-bridge, gh-pages) do NOT yet carry CAS-201, so this
// runs the REAL game served from repo ROOT (HEAD bytes), drives the hero into
// town (T_COBBLE), caves (T_STONE) and trial (T_COBBLE) via __dev.tpZone, and:
//   1. fetches the 6 served tiles, sha256-hashes them, asserts == HEAD canonical
//      (proves the served art IS the CAS-201 batch, not a stale/algorithmic skin)
//   2. samples each tile's mean RGB and asserts "cold gloom" (not warm-earthy)
//   3. screenshots the three scenes for visual on-style/silhouette sign-off
//   4. counts page errors and samples FPS (perf budget, no regression)
// Read-only render probe; no game logic touched. Run: node tools/cas201-tiles-verify.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { startBackupHost } from "./backup-host-serve.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "tools");

// HEAD (CAS-201) canonical tile shas — see `git show HEAD:assets/tiles/<f>.png`.
const EXPECT = {
  cave_floor:   "b48dcfc7f304b49a85d28137bc07b87c625cecd68b1e63fa145966f9580a78fb",
  cave_floor2:  "606f82440565dd6b233c292bc201d0602cf5d003b8f675ccd774b4447c364295",
  ruins_floor:  "3238b868fff9bf96ec6cb0da9cea1325b97a14de9e6859b54fa026d50a0702c3",
  ruins_floor2: "8be2cf3bef14c61a7ebfee26318440bff579d53a4bbd6c967dabad96cd26980a",
  wall:         "a5f118837fac4f0f0298176b5be0be8bb2a86ba1f4ee8b90646c986c50a52f15",
  wall2:        "a5f118837fac4f0f0298176b5be0be8bb2a86ba1f4ee8b90646c986c50a52f15",
};

const host = await startBackupHost(ROOT, 0);
const BASE = host.url;
console.log(`· serving repo ROOT (HEAD/CAS-201) at ${BASE}`);

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const errors = [];
const report = { tiles: {}, scenes: {}, asserts: [] };
const ok = (name, cond, detail) => { report.asserts.push({ name, pass: !!cond, detail }); console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`); };

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { errors.push(String(e).slice(0, 200)); console.log("  [pageerror]", String(e).slice(0, 200)); });
  page.on("console", (m) => { if (m.type() === "error") errors.push("console:" + m.text().slice(0, 160)); });
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?dev`, { waitUntil: "networkidle2", timeout: 45000 });
  await sleep(1200);

  // --- drive to play (warrior) ---
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  let sc = await page.evaluate(() => window.__dev.scene());
  if (sc === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "TileQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  }
  if ((await page.evaluate(() => window.__dev.scene())) === "classsel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  }
  ok("boots into play scene", (await page.evaluate(() => window.__dev.scene())) === "play");

  // --- 1+2: fetch, hash, color-sample the 6 served tiles ---
  const tiledata = await page.evaluate(async (names) => {
    const out = {};
    for (const n of names) {
      const res = await fetch(`./assets/tiles/${n}.png`, { cache: "no-store" });
      const buf = await res.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
      // decode + mean RGB
      const blob = new Blob([buf], { type: "image/png" });
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      const cx = c.getContext("2d"); cx.drawImage(bmp, 0, 0);
      const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
      let r = 0, g = 0, b = 0, np = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; np++; }
      out[n] = { hash, w: bmp.width, h: bmp.height, r: Math.round(r / np), g: Math.round(g / np), b: Math.round(b / np) };
    }
    return out;
  }, Object.keys(EXPECT));

  for (const [n, t] of Object.entries(tiledata)) {
    report.tiles[n] = t;
    const shaMatch = t.hash === EXPECT[n];
    const dims = t.w === 32 && t.h === 32;
    const warmth = t.r - t.b;            // warm-earthy brown => strongly +; slate/ashlar => ~0 or cool
    const cold = warmth < 15;            // not warm-dominant
    console.log(`    ${n.padEnd(13)} rgb(${t.r},${t.g},${t.b}) warmth=${warmth} sha=${t.hash.slice(0, 12)}`);
    ok(`${n}: served==CAS-201 canonical sha`, shaMatch, shaMatch ? "" : `got ${t.hash.slice(0, 12)} expected ${EXPECT[n].slice(0, 12)}`);
    ok(`${n}: 32x32`, dims, `${t.w}x${t.h}`);
    ok(`${n}: cold gloom (not warm-earthy)`, cold, `R-B=${warmth}`);
  }

  // --- 3: in-scene screenshots ---
  const shoot = async (zone, file) => {
    const z = await page.evaluate((zn) => window.__dev.tpZone(zn), zone);
    await sleep(700);
    const cur = await page.evaluate(() => window.__dev.scene());
    const path = join(OUT, file);
    await page.screenshot({ path });
    report.scenes[zone] = { warpedTo: z, scene: cur, shot: file };
    ok(`scene '${zone}' renders in play`, cur === "play" && z === zone, `warpedTo=${z}`);
    console.log(`    shot ${file}`);
  };
  await shoot("town", "cas201-tiles-town.png");    // T_COBBLE: ruins_floor/2 + walls
  await shoot("caves", "cas201-tiles-caves.png");  // T_STONE: cave_floor/2
  await shoot("trial", "cas201-tiles-trial.png");  // T_COBBLE: colosseum stone

  // --- 4: FPS sample (perf budget) ---
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0; const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(Math.round((frames * 1000) / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  report.fps = fps;
  ok("FPS >= 55 (perf budget)", fps >= 55, `${fps} fps`);
  ok("0 page errors", errors.length === 0, errors.length ? errors.join(" | ") : "");

  report.errors = errors;
  const passed = report.asserts.filter((a) => a.pass).length;
  const total = report.asserts.length;
  report.summary = `${passed}/${total} asserts pass, ${fps} fps, ${errors.length} errors`;
  console.log("\n" + JSON.stringify(report, null, 2));
  console.log(`\n=== CAS-201 tiles: ${passed}/${total} PASS · ${fps} fps · ${errors.length} err ===`);
  process.exitCode = passed === total ? 0 : 1;
} catch (e) {
  console.error("HARNESS ERROR", e);
  process.exitCode = 2;
} finally {
  await browser.close();
  await host.close();
}
