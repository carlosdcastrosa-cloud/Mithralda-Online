// ---------------------------------------------------------------------------
// CAS-66 — Does the LIVE build draw the Drive "hooded" class sprite on the hero?
//
// The board rejected CAS-54: the controllable hero on the live build appears NOT
// to show the hooded character sprite. The hero renders from
// IMG["cls_<cls>_<state>_<dir>"] (loaded ./assets/class/*.png); if those images
// fail to load, render/render.js drawHero() silently falls back to the procedural
// (non-hooded) SP.hero pixel sprite. This harness reproduces the board's exact
// view (the Higgsfield marketplace embed → child iframe ?__raw=1), reports the
// live version.json/__BUILD the session loads, asserts the class images actually
// load (the SAME ?v= URLs the renderer uses), and captures a zoomed screenshot of
// the hero so we have OBJECTIVE evidence, not "trust me".
//
// Run: node tools/hero-sprite-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = `${BASE}/index.html?dev`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, classAssetResponses: [], errors: [] };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterAs(fr, cls) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  const idx = CLASSES.indexOf(cls) + 1;
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), idx);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false); // simulate clean-cache first load
  // capture every class-asset network response (status proves serve vs 404)
  page.on("response", (r) => { const u = r.url();
    if (/\/assets\/class\/.*\.png/.test(u)) report.classAssetResponses.push({ url: u.replace(BASE, ""), status: r.status() }); });
  page.on("pageerror", (e) => report.errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push("console.error: " + m.text()); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await gameFrame(page);

  // 1) version / build id the live session actually loaded
  report.build = await fr.evaluate(async () => {
    let vj = null; try { vj = await (await fetch("./version.json?_=" + Date.now(), { cache: "no-store" })).json(); } catch {}
    return { __BUILD: window.__BUILD || null, versionJson: vj };
  });

  // 2) enter play as warrior (the default board sees first)
  await enterAs(fr, "warrior");
  await sleep(900); // let idle anim settle + assets finish

  // 3) probe the EXACT class images the renderer uses (cls_<cls>_<state>_<dir>),
  //    loaded via the same ?v=__BUILD cache-bust path render/sprites.js uses.
  report.assetProbe = await fr.evaluate(async () => {
    const V = window.__BUILD ? ("?v=" + window.__BUILD) : "";
    const keys = ["warrior_idle_down", "warrior_walk_down", "mage_idle_down", "druid_idle_down", "priest_idle_down", "paladin_idle_down"];
    const out = [];
    for (const k of keys) {
      const r = await new Promise((res) => { const im = new Image();
        im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
        im.onerror = () => res({ ok: false });
        im.src = "./assets/class/" + k + ".png" + V; });
      out.push({ key: k, ...r });
    }
    return out;
  });

  // 4) zoomed hero screenshot — hero is camera-centered; crop the canvas middle.
  const heroShot = join(ROOT, "tools", "cas66-live-hero.png");
  const cv = await fr.evaluate(() => { const c = document.getElementById("c"); const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height }; });
  // crop ~180x220 px around canvas center (the hero), in CSS px of the top page.
  const cw = 200, chh = 240;
  const clip = { x: Math.round(cv.left + cv.width / 2 - cw / 2), y: Math.round(cv.top + cv.height / 2 - chh / 2 - 20), width: cw, height: chh };
  await page.screenshot({ path: heroShot, clip });
  report.heroShot = heroShot;
  // full frame too for context
  const fullShot = join(ROOT, "tools", "cas66-live-full.png");
  await page.screenshot({ path: fullShot });
  report.fullShot = fullShot;
  report.hero = await fr.evaluate(() => window.__dev.hero());

  await page.close();
} catch (e) {
  report.errors.push("harness threw: " + e.message + "\n" + e.stack);
} finally {
  await browser.close();
}

console.log("\n===HERO_SPRITE_LIVE_JSON===");
console.log(JSON.stringify(report, null, 2));
console.log("===END_REPORT===");
