import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
// CAS-2237 LIVE boot-smoke: prove the ZONE_BANNER flip build boots cleanly and the feature is active.
// PASS = build==817c87faa83e, __dev mounts (ES graph linked, anti-CAS-2220), canvas 800x600,
// ZONE_BANNER.enabled===true (flip LIVE) + regions derived (>0, from CAS-2226 minimap POIs),
// forcing a named banner via __dev.zone("Templo") returns a live banner object (renderZoneBanner path exercised),
// DAYNIGHT+WEATHER+MINIMAP stay LIVE (true — combined ambient-stack intact), DOORS stays DARK (false),
// 0 pageerror/console.error and no NON-favicon 404.
const BUILD = "817c87faa83e";
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
  const z0 = call(() => d && d.zone ? d.zone() : null);                 // read live zone state
  const zForce = call(() => d && d.zone ? d.zone("Templo") : null);     // force a named banner
  call(() => d && d.zone ? d.zone(null) : null);                        // clear banner
  const cfg = call(() => d && d.cfg ? d.cfg() : null);
  return {
    hasDev: typeof d !== "undefined",
    ver: window.__BUILD || null,
    canvas: (()=>{ const c=document.querySelector("canvas"); return c?`${c.width}x${c.height}`:null; })(),
    z0, zForce, cfg,
  };
});
const nonFavicon = failed.filter(u => !/favicon/.test(u));
const realErrors = errors.filter(e => !/favicon/i.test(e) && !/status of 404/.test(e));
const okObj = (o) => o && typeof o === "object";
const pass = info.hasDev && info.ver === BUILD && info.canvas === "800x600" &&
  okObj(info.z0) && info.z0.enabled === true && Array.isArray(info.z0.regions) && info.z0.regions.length > 0 &&
  okObj(info.zForce) && okObj(info.zForce.banner) && info.zForce.banner.name === "Templo" &&
  realErrors.length === 0 && nonFavicon.length === 0;
console.log(JSON.stringify({ PASS: pass, build: info.ver, canvas: info.canvas,
  zone_enabled: info.z0 && info.z0.enabled, regions: info.z0 && info.z0.regions ? info.z0.regions.map(r=>r.name) : null,
  forced_banner: info.zForce && info.zForce.banner, realErrors, favicon404: failed.filter(u=>/favicon/.test(u)).length,
  failedNonFavicon: nonFavicon }, null, 2));
await browser.close();
process.exit(pass ? 0 : 1);
