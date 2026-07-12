import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const BUST = "eab86ac08046";
const LIVE = `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev&_v=${BUST}`;
const errors = [];
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r => setTimeout(r, 2500));
// __dev lives on the top page (gh-pages, no Higgsfield embed)
const info = await page.evaluate(() => ({
  hasDev: typeof window.__dev !== "undefined",
  ver: window.__BUILD || null,
  canvas: (()=>{ const c=document.querySelector("canvas"); return c?`${c.width}x${c.height}`:null; })(),
  minimapCfg: (window.__dev && window.__dev.cfg && window.__dev.cfg.MINIMAP) ? window.__dev.cfg.MINIMAP.enabled : "n/a",
}));
console.log(JSON.stringify({ errors, info }, null, 2));
await browser.close();
