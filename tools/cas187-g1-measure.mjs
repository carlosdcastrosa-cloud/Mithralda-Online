// ---------------------------------------------------------------------------
// CAS-187 — Measure the Godot G1 export served from the backup-host test subpath.
// Closes the two numbers G0/CAS-184 left open + verifies the G1 subsystem:
//   1. LOAD on real-ish network — TTI under CDP 4G + CPU throttle (not just datacenter)
//   2. FPS — rAF + engine-reported fps (see caveat: headless = software raster)
//   3. MOVEMENT FEEL — drives keys, reads engine-exposed tile coords:
//        * player moves on input, and
//        * collides with a grid-anchored wall (border) instead of passing through
//   4. BUNDLE — per-file transfer (wire/gzip) + raw, total + largest
//
//   node tools/cas187-g1-measure.mjs [url]
//   default: https://carlosdcastrosa-cloud.github.io/Mithralda-Online/godot-g1/
//
// TTI marker: Godot's HTML shell removes #status once startGame() resolves
// (engine running, first frame). main.gd also sets window.__godot_ready / __godot_fps
// / __godot_tx / __godot_ty via JavaScriptBridge, which we use for the movement test.
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium } from "./harness.mjs";

const URL = process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/godot-g1/";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

const ARGS = [
  "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
  "--hide-scrollbars", "--mute-audio",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
];
const TTI_TIMEOUT = 120_000;
const mib = (n) => (n / 1048576).toFixed(2);
const Mbit = (bytesPerSec) => (bytesPerSec * 8 / 1e6).toFixed(1);

// Throttle profiles. downloadThroughput in BYTES/s. 0/false = no throttle.
const PROFILES = [
  { label: "DESKTOP datacenter (no throttle)", w: 1280, h: 720, mobile: false, net: null, cpu: 1 },
  { label: "MOBILE 4G net-only (4Mbit, 100ms, 1x CPU)", w: 390, h: 844, mobile: true,
    net: { downloadThroughput: 500_000, uploadThroughput: 375_000, latency: 100 }, cpu: 1 },
  { label: "MOBILE 4G (4Mbit, 100ms, 4x CPU)", w: 390, h: 844, mobile: true,
    net: { downloadThroughput: 500_000, uploadThroughput: 375_000, latency: 100 }, cpu: 4 },
  { label: "MOBILE Fast-4G (12Mbit, 50ms, 4x CPU)", w: 390, h: 844, mobile: true,
    net: { downloadThroughput: 1_500_000, uploadThroughput: 750_000, latency: 50 }, cpu: 4 },
];

async function measure(p) {
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ARGS });
  try {
    const page = await browser.newPage();
    const cdp = await page.target().createCDPSession();
    await page.setViewport({ width: p.w, height: p.h, isMobile: p.mobile, deviceScaleFactor: p.mobile ? 3 : 1, hasTouch: p.mobile });
    if (p.mobile) {
      await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    }
    if (p.net) {
      await cdp.send("Network.emulateNetworkConditions", { offline: false, ...p.net });
    }
    if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });

    const jsErrors = [];
    page.on("pageerror", (e) => jsErrors.push(String(e)));

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TTI_TIMEOUT });

    let tti = null, failNotice = null;
    const deadline = Date.now() + TTI_TIMEOUT;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const s = document.getElementById("status");
        if (!s) return { done: true };
        const notice = document.getElementById("status-notice");
        const visible = notice && getComputedStyle(notice).display !== "none" && notice.textContent.trim();
        return { done: false, notice: visible ? notice.textContent.trim() : null };
      });
      if (state.done) { tti = Date.now() - t0; break; }
      if (state.notice) { failNotice = state.notice; break; }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Resource timing (sizes identical across profiles; report once).
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => ({
        name: e.name.split("/").pop(), transfer: e.transferSize, decoded: e.decodedBodySize,
      }))
    );

    // FPS (rAF) + engine-reported fps once interactive.
    let fps = null, engineFps = null, move = null;
    if (tti != null) {
      // let the engine settle and push a HUD update
      await new Promise((r) => setTimeout(r, 800));
      fps = await page.evaluate(() => new Promise((resolve) => {
        let frames = 0; const start = performance.now();
        function tick() { frames++;
          if (performance.now() - start >= 3000) resolve(Math.round((frames * 1000) / (performance.now() - start)));
          else requestAnimationFrame(tick);
        } requestAnimationFrame(tick);
      }));
      engineFps = await page.evaluate(() => window.__godot_fps ?? null);

      // MOVEMENT + COLLISION test (only need it once; run on the first profile).
      if (p.runMove) {
        const canvas = await page.$("canvas");
        if (canvas) await canvas.click().catch(() => {});
        const tile = async () => page.evaluate(() => ({ x: window.__godot_tx, y: window.__godot_ty }));
        const start = await tile();
        // 1) move right ~1.5s -> tx should increase
        await page.keyboard.down("ArrowRight");
        await new Promise((r) => setTimeout(r, 1500));
        await page.keyboard.up("ArrowRight");
        await new Promise((r) => setTimeout(r, 300));
        const afterRight = await tile();
        // 2) push UP into the top border wall ~2.5s -> ty should clamp at 1 (collision), not reach 0
        await page.keyboard.down("ArrowUp");
        await new Promise((r) => setTimeout(r, 2500));
        await page.keyboard.up("ArrowUp");
        await new Promise((r) => setTimeout(r, 300));
        const afterUp = await tile();
        move = {
          start, afterRight, afterUp,
          movedRight: afterRight.x > start.x,
          collidedTop: afterUp.y <= 1 && afterUp.y >= 1,   // stopped exactly at tile row 1 (wall at row 0)
          passedThrough: afterUp.y <= 0,
        };
      }
    }

    return { label: p.label, tti, failNotice, fps, engineFps, move, resources, jsErrors };
  } finally {
    await browser.close();
  }
}

console.log(`\n=== CAS-187 Godot G1 measurement ===`);
console.log(`URL: ${URL}`);

const runs = [];
for (let i = 0; i < PROFILES.length; i++) {
  runs.push(await measure({ ...PROFILES[i], runMove: i === 0 }));
}

// Bundle table (from first run).
const r = runs[0].resources;
let totalT = 0, totalD = 0, largest = { transfer: 0, name: "?" };
for (const x of r) { totalT += x.transfer; totalD += x.decoded; if (x.transfer > largest.transfer) largest = x; }
console.log(`\n— BUNDLE (resource timing) —`);
for (const x of [...r].sort((a, b) => b.transfer - a.transfer)) {
  console.log(`  ${x.name.padEnd(28)} wire=${String(x.transfer).padStart(9)} (${mib(x.transfer)} MiB)  raw=${String(x.decoded).padStart(9)} (${mib(x.decoded)} MiB)`);
}
console.log(`  ${"TOTAL".padEnd(28)} wire=${String(totalT).padStart(9)} (${mib(totalT)} MiB)  raw=${String(totalD).padStart(9)} (${mib(totalD)} MiB)`);
console.log(`  largest: ${largest.name} (${mib(largest.transfer)} MiB wire / ${mib(largest.decoded)} MiB raw)`);

console.log(`\n— LOAD (TTI) & FPS per profile —`);
for (const run of runs) {
  console.log(`  ${run.label}`);
  console.log(`     TTI: ${run.tti != null ? run.tti + " ms" : "FAILED"}${run.failNotice ? " — " + run.failNotice.replace(/\n/g, " ") : ""}`);
  console.log(`     fps(rAF 3s): ${run.fps ?? "n/a"}   engine fps: ${run.engineFps ?? "n/a"}   JS errors: ${run.jsErrors.length}${run.jsErrors[0] ? " — " + run.jsErrors[0] : ""}`);
}

const mv = runs.find((x) => x.move)?.move;
console.log(`\n— MOVEMENT + COLLISION (desktop) —`);
if (mv) {
  console.log(`  start tile=(${mv.start.x},${mv.start.y})  after→Right=(${mv.afterRight.x},${mv.afterRight.y})  after↑intoWall=(${mv.afterUp.x},${mv.afterUp.y})`);
  console.log(`  moved on input:        ${mv.movedRight ? "PASS" : "FAIL"}`);
  console.log(`  collided with wall:    ${mv.collidedTop ? "PASS (stopped at row 1)" : (mv.passedThrough ? "FAIL (passed through!)" : "stopped at row " + mv.afterUp.y)}`);
} else {
  console.log("  movement test did not run (TTI failed?)");
}
console.log("");
