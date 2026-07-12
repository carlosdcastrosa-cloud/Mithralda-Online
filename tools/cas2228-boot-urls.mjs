import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const LIVE = `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev&_v=eab86ac08046`;
const bad = [];
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("response", r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on("pageerror", e => bad.push("PAGEERROR " + e.message));
await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r => setTimeout(r, 3000));
const fps = await page.evaluate(() => new Promise(res => {
  let n=0; const t=performance.now(); const l=()=>{ n++; if(performance.now()-t<1000) requestAnimationFrame(l); else res(n); }; requestAnimationFrame(l);
}));
console.log("fps~", fps);
console.log(bad.length ? bad.join("\n") : "no >=400 responses, no pageerror");
await browser.close();
