// CAS-2221 CTO post-deploy live boot smoke against gh-pages build 7a68e4cc884c.
// Confirms: (1) module graph BOOTS (0 JS/console errors) — the SEV-1 guard after CAS-2215/2220;
// (2) reaches 'play' scene; (3) fps healthy; (4) pilot skeleton strips + pilot fire-nova strip are
// actually loaded from the pilot dirs (right dims), i.e. the wiring is live, not procedural fallback.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev&_v=7a68e4cc884c";
const exe = findChromium();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

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
async function enter(fr) {
  await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { const i=document.getElementById("nameInput"); if(i) i.value="QA"; window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await fr.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const _ of [0,1,2]) {
    const s = await fr.evaluate(() => window.__dev.scene());
    if (s === "play") break;
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));
    await sleep(400);
  }
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const out = {};
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => { const u=r.url(); if(/pilot\/(mobs|fx)\//.test(u)) errors.push(`pilot-asset requestfailed: ${u}`); });
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await gameFrame(page);
  await enter(fr);
  out.scene = await fr.evaluate(() => window.__dev.scene());

  // fps sample over ~2.5s of clean play
  out.fps = await fr.evaluate(async () => {
    let n=0; let last=performance.now(); const t0=last; const dur=2500;
    return await new Promise((res)=>{ (function loop(){ const now=performance.now(); n++; if(now-t0>=dur){res(Math.round(n/((now-t0)/1000)));} else requestAnimationFrame(loop); })(); });
  });

  // pilot image load-state: query the sprites singleton IMG cache via a fresh module import
  out.pilot = await fr.evaluate(async () => {
    const bust = (window.__BUILD||Date.now());
    const mod = await import("./render/sprites.js?v="+bust).catch(()=>null);
    if(!mod||!mod.IMG) return {err:"no IMG export"};
    const g=(k)=>{ const im=mod.IMG[k]; return im? {c:!!im.complete, w:im.naturalWidth, h:im.naturalHeight} : null; };
    return {
      skel_idle: g("skel_pilot_idle"),
      skel_walk: g("skel_pilot_walk"),
      skel_attack: g("skel_pilot_attack"),
      fx_nova: g("fx_nova"),
    };
  });
  await page.close();
} finally { await browser.close(); }

out.errors = errors;
// verdicts
const p = out.pilot||{};
const dimOk = (o,w,h)=> o && o.c && o.w===w && o.h===h;
out.verdict = {
  boots_0_errors: errors.length===0,
  reached_play: out.scene==="play",
  fps_ok: out.fps>=50,
  skel_walk_live: dimOk(p.skel_walk,744,124),
  skel_attack_live: dimOk(p.skel_attack,868,124),
  skel_idle_live: dimOk(p.skel_idle,124,124),
  fx_nova_pilot_live: dimOk(p.fx_nova,1152,128),
};
out.PASS = Object.values(out.verdict).every(Boolean);
console.log(JSON.stringify(out,null,2));
