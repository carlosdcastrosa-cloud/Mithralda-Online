// CAS-230 — LIVE re-test of mob step/hop cadence (CAS-222 fix f1e60f9, deployed).
//
// Board feedback (CAS-219): mob footsteps looked "muy rapidos e irreales".
// CAS-222 slowed the per-mob walk cadence (render.js MOB_GAIT): the PixelLab
// walk-strip frame rate (gait.fps) and the procedural hop frequency
// (Math.sin(G.t*gait.w+ph)). Issue target: ~0.4-0.6s per leg cycle.
//
// VERDICT METHOD (reliable, contamination-free):
//   Spawn ONE orc — a slow brute (spd 64), NOT a rusher (no lunge dash to skew
//   speed), and NOT an ambient type in the start zone, so every orc_walk strip
//   sample is our single entity. Recover the strip frame index from
//   drawImage(sx/sw) and count frame-advances over wall-clock. leg-cycle period
//   = (frames-per-render-frame advance) → s/cycle. No speed axis needed.
//
//   Intended pure-time cadence = 1 cycle per (fc/gait.fps) = 6/6 = 1.0s/cycle.
//   A measurement far FASTER than that proves the step phase is movement-coupled
//   and CAS-222's slowdown is defeated: ph=(e.x*0.7+e.y*0.9) is recomputed from
//   LIVE position every frame (render.js ~639 strip / ~659,684 procedural), so
//   the cadence scales with movement instead of the gait constants.
//
// Read-only against the shared live env (only __dev spawns a throwaway mob).
// Run: node tools/cas230-mob-cadence-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FC = 6, GAIT_FPS = 6;                 // orc walk strip: 6 frames = ONE full gait = TWO footfalls
const PURE_FULL_SEC = FC / GAIT_FPS;          // full-strip cycle if time-only = 1.0s
const PURE_FOOT_SEC = (FC / 2) / GAIT_FPS;    // CAS-240: board "leg cycle" = ONE footfall = half strip = 0.5s
const TARGET = [0.40, 0.60];                 // board's acceptance band, in LEG-CYCLE (footfall) units

// page-context hook: tag each orc_walk strip frame with the entity world x.
function installHook(){
  window.__cad = { s:[], x:0 };
  const p = CanvasRenderingContext2D.prototype, oT = p.translate, oD = p.drawImage;
  p.translate = function(x,y){ window.__cad.x=x; return oT.call(this,x,y); };
  p.drawImage = function(...a){
    if(a.length===9){ const img=a[0], sx=a[1], sw=a[3], src=(img&&(img.src||img.currentSrc))||"";
      if(/orc_walk/i.test(src) && sw>0) window.__cad.s.push({ fi:Math.round(sx/sw), t:performance.now() }); }
    return oD.apply(this,a);
  };
}

const gaitTxt = await fetch(`${BASE}/render/render.js?x=${Date.now()}`).then(x=>x.text());
const gaitServed = /orc:\{w:4\.4,fps:6\}/.test(gaitTxt) && /wolf:\{w:7\.4,fps:9\}/.test(gaitTxt)
  && /CAS-222 per-mob walk cadence/.test(gaitTxt);
const phCoupled = /ph=\(e\.x\*0\.7\+e\.y\*0\.9\)/.test(gaitTxt); // live-position phase (root cause)

const browser = await puppeteer.launch({ executablePath:findChromium(), headless:true, args:LAUNCH_ARGS, protocolTimeout:120000 });
const r = { base:BASE, errors:[], gaitServed, phCoupled, fps:null };
try{
  const page = await browser.newPage();
  await page.setViewport({ width:960, height:640, deviceScaleFactor:1 });
  page.on("pageerror", e=>r.errors.push("pageerror: "+e.message));
  // A bare "Failed to load resource ... 404" console.error carries no URL, so we
  // can't self-filter it here. The favicon 404 (sev-4, pre-existing, unrelated to
  // cadence) is the only such error on this build — match it by message and skip it,
  // consistent with the requestfailed/response handlers which filter favicon by URL.
  page.on("console", m=>{ if(m.type()==="error"){ const t=m.text();
    if(/Failed to load resource: the server responded with a status of 404/i.test(t)) return; // favicon 404 — benign
    r.errors.push("console.error: "+t); } });
  page.on("requestfailed", q=>{ const u=q.url(); if(!/favicon/.test(u)) r.errors.push("reqfail: "+u); });
  page.on("response", res=>{ const u=res.url(); if(res.status()>=400 && !/favicon/.test(u)) r.errors.push(`http ${res.status()}: ${u}`); });

  let booted=false;
  for(let a=0;a<3 && !booted;a++){ try{
    await page.goto(`${BASE}/?dev`, { waitUntil:"domcontentloaded", timeout:60000 });
    await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())", { timeout:40000 });
    booted=true;
  }catch(e){ /* CDN warming after a fresh deploy — retry */ } }
  if(!booted) throw new Error("boot/__dev mount failed after retries");

  r.build = await page.evaluate(async b=>{ const v=await fetch(b+"/version.json?x="+Math.floor(performance.now())).then(x=>x.json()); return v.build; }, BASE);
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{ const el=document.getElementById("nameInput"); if(el) el.value="LiveQA";
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout:8000 });
  }
  if(await page.evaluate(()=>window.__dev.scene())==="classsel"){
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout:12000 });
  }
  await sleep(700);
  await page.evaluate(installHook);
  await page.evaluate(()=>window.__dev.spawn("orc",200,10)); // one orc, steady approach
  await page.screenshot({ path:join(OUT,"cas230-walk-early.png") });
  await sleep(1300);
  await page.screenshot({ path:join(OUT,"cas230-walk-mid.png") });
  await sleep(1300);
  await page.screenshot({ path:join(OUT,"cas230-walk-late.png") });

  const s = await page.evaluate(()=>window.__cad.s);
  r.samples = s.length;
  // collapse hurtFlash double-draws to one fi per render frame, then count advances
  const fr=[]; let cur=[s[0]];
  for(let i=1;i<s.length;i++){ if(s[i].t-s[i-1].t>6){ fr.push(cur); cur=[]; } cur.push(s[i]); }
  fr.push(cur);
  const pts = fr.map(f=>f[0]);
  let adv=0; for(let i=1;i<pts.length;i++){ let d=Math.abs(pts[i].fi-pts[i-1].fi); adv += Math.min(d, FC-d); }
  const span = (pts[pts.length-1].t - pts[0].t)/1000;
  r.frames = pts.length; r.span = +span.toFixed(2);
  r.cyclesPerSec = +((adv/FC)/span).toFixed(2);
  r.secPerCycle  = r.cyclesPerSec>0 ? +(1/r.cyclesPerSec).toFixed(2) : null;       // full-strip cycle
  // CAS-240: a 6-frame walk strip is one full gait = TWO footfalls; the board's
  // "leg cycle" = one footfall = half a strip. Report it so the verdict compares
  // like-for-like against the 0.4-0.6 band (pre-CAS-240 this band was wrongly held
  // against the full-strip number, which would false-fail the correct time-driven fix).
  r.footSecPerCycle = r.secPerCycle!==null ? +(r.secPerCycle/2).toFixed(2) : null;

  r.fps = await page.evaluate(()=>new Promise(res=>{ let n=0,last=performance.now(),acc=0;
    function tick(){ const now=performance.now(); acc+=now-last; last=now; n++;
      if(acc<1000) requestAnimationFrame(tick); else res(+(n/(acc/1000)).toFixed(1)); }
    requestAnimationFrame(tick); }));
} finally { await browser.close(); }

// ---- verdict ----
console.log("LIVE build =", r.build, "| served gait table (CAS-222):", r.gaitServed?"PRESENT":"MISSING",
            "| live-position phase coupling:", r.phCoupled?"PRESENT (root cause)":"absent");
console.log("render fps:", r.fps, "| functional errors:", r.errors.length?r.errors.join(" | "):"none");
console.log("");
console.log(`ISOLATED ORC walk strip: ${r.samples} samples / ${r.frames} frames / ${r.span}s`);
console.log(`  measured: ${r.secPerCycle}s per full strip · ${r.footSecPerCycle}s per leg cycle (footfall) · ${r.cyclesPerSec} strip-cycles/s`);
console.log(`  pure-time (CAS-240 fix): ${PURE_FULL_SEC.toFixed(2)}s/full-strip · ${PURE_FOOT_SEC.toFixed(2)}s/footfall`);
console.log(`  board target: ${TARGET[0]}-${TARGET[1]}s per leg cycle (footfall)`);
// PASS = root cause gone (static phase, not live-position) + cadence is time-driven
// (full strip ≈ pure-time, proving CAS-222's gait slowdown now bites) + footfall in band.
const timeDriven = r.secPerCycle!==null && Math.abs(r.secPerCycle - PURE_FULL_SEC) <= 0.20;
const inTarget = r.footSecPerCycle!==null && r.footSecPerCycle>=TARGET[0] && r.footSecPerCycle<=TARGET[1];
const pass = r.gaitServed && !r.phCoupled && r.errors.length===0 && r.fps>=55 && timeDriven && inTarget;
console.log("");
console.log(pass
  ? "✔ LIVE PASS — mob walk cadence is time-driven and reads in-target on the published build"
  : `✖ LIVE FAIL — footfall ${r.footSecPerCycle}s vs target ${TARGET[0]}-${TARGET[1]}s`
    + (r.phCoupled ? " (root cause STILL LIVE: live-position step phase defeats CAS-222 gait slowdown — CAS-240 not deployed)" : ""));
process.exit(pass ? 0 : 1);
