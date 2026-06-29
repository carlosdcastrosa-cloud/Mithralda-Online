// ---------------------------------------------------------------------------
// CAS-184 — Measure the Godot slice served from the backup-host test subpath.
// Reports: total served size + largest file (raw/gzip via resource timing),
// time-to-interactive (desktop + mobile 390x844), and worst-case fps.
//
//   node tools/cas184-godot-measure.mjs [url]
//   default url: https://carlosdcastrosa-cloud.github.io/Mithralda-Online/godot-slice/
//
// TTI marker: the Godot HTML shell calls statusOverlay.remove() once
// engine.startGame() resolves (engine running, first frame drawn), so
// `#status` disappearing == interactive.
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium } from "./harness.mjs";

const URL = process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/godot-slice/";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

// SwiftShader so WebGL2 is available in headless (Godot web needs WebGL2).
const ARGS = [
  "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
  "--hide-scrollbars", "--mute-audio",
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
];
const TTI_TIMEOUT = 90_000;
const mib = (n) => (n / 1048576).toFixed(2);

async function measure(label, { width, height, mobile }) {
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ARGS });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, isMobile: mobile, deviceScaleFactor: mobile ? 3 : 1, hasTouch: mobile });
    if (mobile) {
      await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1");
    }
    const jsErrors = [];
    page.on("pageerror", (e) => jsErrors.push(String(e)));

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: TTI_TIMEOUT });

    // Wait until the Godot status overlay is removed (engine started) OR a
    // failure notice is shown.
    let tti = null, failNotice = null;
    const deadline = Date.now() + TTI_TIMEOUT;
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const s = document.getElementById("status");
        if (!s) return { done: true };
        const notice = document.getElementById("status-notice");
        const visible = getComputedStyle(notice).display !== "none" && notice.textContent.trim();
        return { done: false, notice: visible ? notice.textContent.trim() : null };
      });
      if (state.done) { tti = Date.now() - t0; break; }
      if (state.notice) { failNotice = state.notice; break; }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Resource timing: per-file transfer (compressed) + decoded (raw).
    const resources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((e) => ({
        name: e.name.split("/").pop(),
        transfer: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize,
        contentEncoding: null,
      }))
    );

    // FPS: sample rAF for 3s once interactive.
    let fps = null;
    if (tti != null) {
      fps = await page.evaluate(() => new Promise((resolve) => {
        let frames = 0; const start = performance.now();
        function tick() {
          frames++;
          if (performance.now() - start >= 3000) {
            resolve(Math.round((frames * 1000) / (performance.now() - start)));
          } else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }));
    }

    return { label, width, height, tti, failNotice, fps, resources, jsErrors };
  } finally {
    await browser.close();
  }
}

const runs = [];
runs.push(await measure("DESKTOP 1280x720", { width: 1280, height: 720, mobile: false }));
runs.push(await measure("MOBILE  390x844", { width: 390, height: 844, mobile: true }));

console.log(`\n=== CAS-184 Godot slice measurement ===`);
console.log(`URL: ${URL}\n`);

// Resource table from desktop run (sizes identical across viewports).
const r = runs[0].resources;
let totalT = 0, totalD = 0, largest = { transfer: 0 };
for (const x of r) { totalT += x.transfer; totalD += x.decoded; if (x.transfer > largest.transfer) largest = x; }
console.log("Per-file (resource timing, transfer = over-the-wire / decoded = raw):");
for (const x of [...r].sort((a, b) => b.transfer - a.transfer)) {
  console.log(`  ${x.name.padEnd(28)} transfer=${String(x.transfer).padStart(9)} (${mib(x.transfer)} MiB)  raw=${String(x.decoded).padStart(9)} (${mib(x.decoded)} MiB)`);
}
console.log(`  ${"TOTAL".padEnd(28)} transfer=${String(totalT).padStart(9)} (${mib(totalT)} MiB)  raw=${String(totalD).padStart(9)} (${mib(totalD)} MiB)`);
console.log(`  largest file: ${largest.name} (${mib(largest.transfer)} MiB wire / ${mib(largest.decoded)} MiB raw)\n`);

for (const run of runs) {
  console.log(`${run.label}:`);
  console.log(`  time-to-interactive: ${run.tti != null ? run.tti + " ms" : "FAILED"}${run.failNotice ? " — " + run.failNotice.replace(/\n/g, " ") : ""}`);
  console.log(`  worst-case fps (3s): ${run.fps != null ? run.fps : "n/a"}`);
  console.log(`  JS errors: ${run.jsErrors.length}${run.jsErrors.length ? " — " + run.jsErrors[0] : ""}`);
}
console.log("");
