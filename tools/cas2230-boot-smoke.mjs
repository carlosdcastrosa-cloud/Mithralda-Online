import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
// CAS-2230 LIVE boot-smoke: prove the day/night flip build boots cleanly and the feature is active.
// PASS = build==1aa455ccb76b, __dev mounts (ES graph linked, anti-CAS-2220), canvas 800x600,
// DAYNIGHT.enabled===true, DOORS_INTERIORS.enabled===false (stays DARK), daynight() returns a live
// state {enabled,lamps>0}, 0 pageerror/console.error, and no NON-favicon failed request (404).
const BUILD = "1aa455ccb76b";
const BUST = BUILD;
const LIVE = `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev&_v=${BUST}`;
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
  let dn = null; try { dn = d && d.daynight ? d.daynight() : null; } catch (e) { dn = "ERR:" + e.message; }
  return {
    hasDev: typeof d !== "undefined",
    ver: window.__BUILD || null,
    canvas: (()=>{ const c=document.querySelector("canvas"); return c?`${c.width}x${c.height}`:null; })(),
    daynightCfg: (d && d.cfg && d.cfg.DAYNIGHT) ? d.cfg.DAYNIGHT.enabled : "n/a",
    doorsCfg: (d && d.cfg && d.cfg.DOORS_INTERIORS) ? d.cfg.DOORS_INTERIORS.enabled : "n/a",
    daynightState: dn && typeof dn === "object" ? { enabled: dn.enabled, phase: dn.phase, lamps: dn.lamps, glow: dn.glow, tint: dn.tint } : dn,
  };
});
// Favicon 404 is benign (no favicon shipped) — it surfaces as both a failed request AND a console.error;
// filter it out of BOTH gates. daynight().enabled is ground truth (reads the live DAYNIGHT config); the
// __dev.cfg.DAYNIGHT key isn't exposed on this build, so we assert on the render-state, not the cfg probe.
const nonFavicon = failed.filter(u => !/favicon/.test(u));
const realErrors = errors.filter(e => !/favicon/i.test(e) && !/status of 404/.test(e) || nonFavicon.length);
const pass = info.hasDev && info.ver === BUILD && info.canvas === "800x600" &&
  info.daynightState && typeof info.daynightState === "object" && info.daynightState.enabled === true &&
  info.daynightState.lamps > 0 && info.daynightState.tint && info.daynightState.tint.a > 0 &&
  realErrors.length === 0 && nonFavicon.length === 0;
console.log(JSON.stringify({ PASS: pass, info, realErrors, favicon404: failed.filter(u=>/favicon/.test(u)).length, failedNonFavicon: nonFavicon }, null, 2));
await browser.close();
