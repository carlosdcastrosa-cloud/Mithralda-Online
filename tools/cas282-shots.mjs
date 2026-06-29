// CAS-282 board evidence — render the OLD (git HEAD) vs NEW warrior_attack strip at game
// scale on a neutral tile, frame by frame, so the clipped-vs-full FX is unmistakable; plus
// a zoomed in-engine peak-swing crop (right & left facing) proving flip stays body-centred.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer, ROOT } from "./harness.mjs";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const NEW = readFileSync(join(ROOT, "assets/erw/hero/classes/warrior_attack.png")).toString("base64");
// old strip from git HEAD (140px clipped) — write to a temp and base64 it
let OLD = null;
try { OLD = execSync("git show HEAD:assets/erw/hero/classes/warrior_attack.png", { cwd: ROOT, maxBuffer: 1 << 24 }).toString("base64"); } catch (e) { console.error("no HEAD strip:", e.message); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 520, deviceScaleFactor: 2 });

  // 1) strip filmstrip comparison (old clipped 140-cell render vs new wide-cell render)
  const html = await page.evaluate(async (NEW, OLD) => {
    const S = 0.30 * 3; // game scale ×3 for legibility
    const FOOT_GAP = 3, CLASS_FW = 140, CLASS_FH = 166, CLASS_AX = 65, CLASS_FOOT = 163;
    async function strip(b64, fc) { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); return im; }
    function drawRow(ctx, im, fc, y, label) {
      const fw = Math.round(im.naturalWidth / fc), fh = im.naturalHeight;
      const ax = fw > CLASS_FW ? fw / 2 : CLASS_AX, foot = fh - (CLASS_FH - CLASS_FOOT);
      ctx.fillStyle = "#9fb0c8"; ctx.font = "16px sans-serif"; ctx.fillText(label, 8, y - fh * S - 6 + 14);
      let x = 120;
      for (let i = 0; i < fc; i++) {
        // draw a cell boundary box at the LEGACY 140-cell to show where clipping happened
        const cellW = (label.includes("OLD") ? CLASS_FW : fw) * S;
        ctx.strokeStyle = "rgba(120,140,170,0.35)"; ctx.strokeRect(x, y - fh * S, cellW, fh * S);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(im, i * fw, 0, fw, fh, x + cellW / 2 - ax * S, y - foot * S, fw * S, fh * S);
        x += cellW + 14;
      }
    }
    const cv = document.createElement("canvas"); cv.width = 1400; cv.height = 520; document.body.appendChild(cv);
    const ctx = cv.getContext("2d"); ctx.fillStyle = "#12161d"; ctx.fillRect(0, 0, cv.width, cv.height);
    const nim = await strip(NEW, 6); const oim = OLD ? await strip(OLD, 6) : null;
    if (oim) drawRow(ctx, oim, 6, 230, "OLD (140px cell — FX clipped)");
    drawRow(ctx, nim, 6, 470, "NEW (wide cell — full FX)");
    return cv.toDataURL("image/png");
  }, NEW, OLD);
  writeFileSync(join(ROOT, "tools/cas282-filmstrip.png"), Buffer.from(html.split(",")[1], "base64"));
  console.log("wrote tools/cas282-filmstrip.png");

  // 2) in-engine zoomed peak crop, right & left facing
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "ShotBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });

  async function peakCrop(faceRight, file) {
    let best = null, bestArea = -1;
    for (let s = 0; s < 5; s++) {
      await page.evaluate((fr) => { const h = window.__dev.hero(); window.__dev.spawn("orc", fr ? 60 : -60, 0); window.__dev.juiceSwing(); }, faceRight);
      for (let f = 0; f < 10; f++) {
        await wait(16);
        const a = await page.evaluate(() => window.__dev.heroAnim());
        if (a && a.state === "attack" && f >= 2 && f <= 5) { // mid-swing = peak FX
          const shot = await page.screenshot({ clip: { x: 540, y: 270, width: 280, height: 220 } });
          if (f === 3) { best = shot; }
        }
      }
      await wait(150);
      if (best) break;
    }
    if (best) { writeFileSync(join(ROOT, "tools/" + file), best); console.log("wrote tools/" + file); }
  }
  await peakCrop(true, "cas282-engine-right.png");
  await peakCrop(false, "cas282-engine-left.png");
} catch (e) { console.error("threw:", e && e.stack ? e.stack : e); }
finally { await browser.close(); await srv.close(); }
