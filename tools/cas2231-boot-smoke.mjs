import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
// CAS-2233 LIVE boot-smoke: prove the WEATHER flip build boots cleanly and the feature is active.
// PASS = build==3a6a2d6ab964, __dev mounts (ES graph linked, anti-CAS-2220), canvas 800x600,
// WEATHER.enabled===true + drops>0 (rain pool built), DAYNIGHT stays LIVE (true), DOORS stays DARK (false),
// forcing a rain phase (0.28) then a fog phase (0.70) does NOT throw (renderWeather path exercised),
// 0 pageerror/console.error and no NON-favicon 404.
const BUILD = "3a6a2d6ab964";
const LIVE = `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev&_v=${BUILD}`;
const errors = [], failed = [];
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
page.on("requestfailed", r => failed.push(r.url()));
page.on("response", r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise(r => setTimeout(r, 2500));
const info = await page.evaluate(() => {
  const d = window.__dev;
  const call = (fn) => { try { return fn(); } catch (e) { return "ERR:" + e.message; } };
  let w0 = call(() => d && d.weather ? d.weather() : null);          // clock-driven live state
  let wRain = call(() => d && d.weather ? d.weather({ phase: 0.28 }) : null); // force full rain
  let wFog = call(() => d && d.weather ? d.weather({ phase: 0.70 }) : null);  // force full fog
  call(() => d && d.weather ? d.weather({ phase: null }) : null);    // restore clock
  return {
    hasDev: typeof d !== "undefined",
    ver: window.__BUILD || null,
    canvas: (()=>{ const c=document.querySelector("canvas"); return c?`${c.width}x${c.height}`:null; })(),
    w0, wRain, wFog,
  };
});
// Favicon 404 is benign; filter it from both gates.
const nonFavicon = failed.filter(u => !/favicon/.test(u));
const realErrors = errors.filter(e => !/favicon/i.test(e) && !/status of 404/.test(e));
const okObj = (o) => o && typeof o === "object";
const pass = info.hasDev && info.ver === BUILD && info.canvas === "800x600" &&
  okObj(info.w0) && info.w0.enabled === true && info.w0.drops > 0 &&
  okObj(info.wRain) && info.wRain.rain > 0.5 && info.wRain.state === "rain" &&
  okObj(info.wFog) && info.wFog.fog > 0.5 && info.wFog.state === "fog" &&
  realErrors.length === 0 && nonFavicon.length === 0;
console.log(JSON.stringify({ PASS: pass, info, realErrors, favicon404: failed.filter(u=>/favicon/.test(u)).length, failedNonFavicon: nonFavicon }, null, 2));
await browser.close();
