// CAS-309 — NPC-targeted idle montage: parks the hero 3 tiles BELOW Maren so she sits
// in a known screen spot (camera locks on hero), captures 6 ticks across ~1s and tiles
// them so the idle loop is visible as evidence. Local working tree.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import fs from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { url: BASE, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { try { window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "ART309";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await page.evaluate(() => { try { window.__dev.tutSkip(); } catch (e) {} });
  await sleep(300);
  // hero 3 tiles below NPC → NPC ~3 tiles above screen-center
  await page.evaluate(() => { window.__dev.tpZone("town"); const h = window.__dev.hero(); window.__dev.tp(Math.round(h.x/32), Math.round(h.y/32) + 3); });
  await sleep(500);
  // NPC screen pos: center.x, center.y - 3*32*scale(2) = -192
  const clip = { x: 960 /*cv/2*/ - 90, y: 640 - 200, width: 180, height: 220 };
  const shots = [];
  for (let i = 0; i < 6; i++) { const p = join(OUT, `cas309-idle-${i}.png`); await page.screenshot({ path: p, clip }); shots.push(p); await sleep(170); }
  // montage
  const imgs = await Promise.all(shots.map(p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64')));
  const mUrl = await page.evaluate(async (imgs) => {
    const loaded = await Promise.all(imgs.map(s => { const i = new Image(); i.src = s; return i.decode().then(() => i); }));
    const w = loaded[0].width, h = loaded[0].height, Z = 1.6, pad = 6;
    const c = document.createElement('canvas'); c.width = (w*Z+pad)*6+pad; c.height = h*Z+pad*2+18;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#101820'; x.fillRect(0,0,c.width,c.height);
    x.fillStyle = '#bfe'; x.font = '13px monospace'; x.fillText('Maren — idle loop (6 ticks ~1s) in-engine, town square', pad, 14);
    loaded.forEach((im,i) => x.drawImage(im, pad+i*(w*Z+pad), 20, w*Z, h*Z));
    return c.toDataURL('image/png');
  }, imgs);
  fs.writeFileSync(join(OUT, 'cas309-idle-montage.png'), Buffer.from(mUrl.split(',')[1], 'base64'));
  console.log('wrote cas309-idle-montage.png');
} finally { await browser.close(); await close(); }
