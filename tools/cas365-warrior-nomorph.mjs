// CAS-365 (CAS-345c) — Art Director self-verification: warrior must render the ORIGINAL
// canonical Clarice sprite in EVERY state (idle/walk/roll/attack) — NO morph into the
// PixelLab-regen wizard (tall pointed hat, grey beard/cloak) that QA rejected on CAS-358.
//
// FIX under test: render.js drops the warrior from the 8-dir set (CLASS_DIR8_ANIM=[]) and the
// 8-dir dash set (CLASS_DASH8_ANIM=[]) → idle/walk/roll fall back to the approved single-facing
// clshero_/clswalk_/clsdash_ strips + L/R facing flip, exactly like the four hooded classes.
//
// HARD GATES:
//  1. SOURCE — deployed render.js has CLASS_DIR8_ANIM=[] and CLASS_DASH8_ANIM=[].
//  2. NETWORK AUDIT — while playing the warrior, the browser requests NO warrior_idle8.png /
//     warrior_walk8.png / warrior_dash8.png (the morph art can never load → morph impossible).
//  3. NO MORPH — idle vs walk vs attack crops read as the SAME character (hue-hist sim ≥0.85).
//  4. FACING — walking E vs W crops distinct (L/R flip works).
//  5. PERF — ≥55fps, 0 console errors.
//
// Run: LOCAL=1 node tools/cas365-warrior-nomorph.mjs   (LIVE_URL overrides host)
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CX=380, CY=210, CW=150, CH=190; // hero-centred crop

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const local = process.env.LOCAL ? await startServer(ROOT) : null;
const BASE = local ? local.url : (process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online");
const LIVE = `${BASE}/index.html?dev`;
const close = local ? local.close : (async () => {});

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code, type) =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key","").toLowerCase(), bubbles: true })), code, type);
async function shot(page, name) { await page.screenshot({ path: join(OUT, name), clip: { x:CX, y:CY, width:CW, height:CH } }); }
async function sampleHue(fr) {
  return fr.evaluate((cx,cy,cw,ch) => {
    const cv = document.querySelector("canvas"); if (!cv) return null;
    const sc = document.createElement("canvas"); sc.width=cw; sc.height=ch;
    const g = sc.getContext("2d"); g.imageSmoothingEnabled=false;
    g.drawImage(cv, cx,cy,cw,ch, 0,0,cw,ch);
    const px = g.getImageData(0,0,cw,ch).data;
    const hist = new Array(12).fill(0); let n=0;
    for (let i=0;i<px.length;i+=4){
      const r=px[i]/255, gg=px[i+1]/255, bl=px[i+2]/255;
      const mx=Math.max(r,gg,bl), mn=Math.min(r,gg,bl), d=mx-mn;
      if (mx<0.12 || d<0.05) continue;
      let h; if(mx===r) h=((gg-bl)/d)%6; else if(mx===gg) h=(bl-r)/d+2; else h=(r-gg)/d+4;
      h=(h*60+360)%360; hist[Math.floor(h/30)]++; n++;
    }
    return { hist, n };
  }, CX, CY, CW, CH);
}
const histSim = (A,B) => { if(!A||!B||!A.n||!B.n) return 0; const a=A.hist,b=B.hist; let dot=0,na=0,nb=0; for(let i=0;i<12;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];} return (na&&nb)?+(dot/Math.sqrt(na*nb)).toFixed(3):0; };
async function sampleSig(fr){
  return fr.evaluate((cx,cy,cw,ch)=>{
    const cv=document.querySelector("canvas"); if(!cv) return [];
    const sc=document.createElement("canvas"); sc.width=cw; sc.height=ch;
    const g=sc.getContext("2d"); g.imageSmoothingEnabled=false;
    g.drawImage(cv,cx,cy,cw,ch,0,0,cw,ch);
    const px=g.getImageData(0,0,cw,ch).data; const col=new Array(cw).fill(0);
    for(let x=0;x<cw;x++){ let s=0; for(let y=0;y<ch;y++){ const i=(y*cw+x)*4; if(px[i+3]>40 && (px[i]+px[i+1]+px[i+2])>60) s++; } col[x]=s; }
    return col;
  }, CX,CY,CW,CH);
}
const mad=(a,b)=>{ if(!a.length||a.length!==b.length) return 0; let s=0; for(let i=0;i<a.length;i++) s+=Math.abs(a[i]-b[i]); return s/a.length; };

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const checks = []; const pass=(n,c,d="")=>{ checks.push({n,c,d}); console.log(`${c?"✔":"✖"} ${n}${d?"  "+d:""}`); };

// 1. SOURCE
const js = await (await fetch(`${BASE}/render/render.js`, { headers:{ "cache-control":"no-cache" } })).text();
const dir8 = (js.match(/CLASS_DIR8_ANIM\s*=\s*(\[[^\]]*\])/)||[])[1] || "?";
const dash8 = (js.match(/CLASS_DASH8_ANIM\s*=\s*(\[[^\]]*\])/)||[])[1] || "(absent)";
pass("render.js CLASS_DIR8_ANIM empty", /\[\s*\]/.test(dir8), dir8);
pass("render.js CLASS_DASH8_ANIM empty", /\[\s*\]/.test(dash8), dash8);

const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const errs=[]; const morphReqs=new Set();
page.on("console",(m)=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on("pageerror",(e)=>errs.push(String(e)));
page.on("request",(req)=>{ const mm=req.url().match(/classes\/warrior_(idle8|walk8|dash8)\.png/); if(mm) morphReqs.add(mm[1]); });
await page.setUserAgent(UA);
await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
await page.goto(LIVE, { waitUntil:"domcontentloaded", timeout:45000 });
const fr = await gameFrame(page);
await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout:35000 });
await fr.evaluate(()=>{ document.getElementById("nameInput").value="QAwar"; window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout:8000 });
await key(fr,"Digit1","keydown"); await key(fr,"Digit1","keyup");
await fr.waitForFunction("window.__dev.scene()==='play'", { timeout:8000 });
await sleep(500);

// IDLE south
await key(fr,"KeyS","keydown"); await sleep(120); await key(fr,"KeyS","keyup"); await sleep(450);
const idleHue=await sampleHue(fr); await shot(page,"cas365-warrior-idle.png");
// WALK south
await key(fr,"KeyS","keydown");
let sawWalk=false; for(let i=0;i<10;i++){ await sleep(45); const a=await fr.evaluate(()=>window.__dev.heroAnim()); if(a&&a.state==="walk") sawWalk=true; }
const walkHue=await sampleHue(fr); await shot(page,"cas365-warrior-walk.png");
await key(fr,"KeyS","keyup"); await sleep(300);
// FACING E vs W
await key(fr,"KeyD","keydown"); await sleep(240); const eSig=await sampleSig(fr); await shot(page,"cas365-warrior-east.png"); await key(fr,"KeyD","keyup"); await sleep(220);
await key(fr,"KeyA","keydown"); await sleep(240); const wSig=await sampleSig(fr); await shot(page,"cas365-warrior-west.png"); await key(fr,"KeyA","keyup"); await sleep(220);
const ewDist=+mad(eSig,wSig).toFixed(1);
// ROLL (dodge) — should play canonical clsdash_, never request dash8
await key(fr,"KeyD","keydown"); await sleep(60); await key(fr,"Space","keydown"); await key(fr,"Space","keyup");
let rollSeen=false; for(let i=0;i<16;i++){ await sleep(28); const a=await fr.evaluate(()=>window.__dev.heroAnim()); if(a&&(a.state==="roll"||a.rolling)){ rollSeen=true; await shot(page,"cas365-warrior-roll.png"); } }
await key(fr,"KeyD","keyup"); await sleep(500);
// ATTACK south
await key(fr,"KeyS","keydown"); await sleep(120); await key(fr,"KeyS","keyup"); await sleep(250);
let atk=false, attackHue=null;
for(let rep=0;rep<5 && !atk;rep++){ await key(fr,"Digit1","keydown"); await key(fr,"Digit1","keyup");
  for(let i=0;i<9;i++){ await sleep(34); const a=await fr.evaluate(()=>window.__dev.heroAnim()); if(a&&(a.atk||a.state==="attack")){ atk=true; if(!attackHue){ attackHue=await sampleHue(fr); await shot(page,"cas365-warrior-attack.png"); } } } }
// PERF
let frames=0; const t0=await fr.evaluate(()=>performance.now());
await new Promise(r=>setTimeout(r,1000));
frames=await fr.evaluate(()=>window.__dev.frameCount?window.__dev.frameCount():0);
const fps = await fr.evaluate((t)=>{ const n=performance.now(); return window.__dev.fps?window.__dev.fps():null; }, t0);

pass("NETWORK: no warrior_idle8/walk8/dash8 requested", morphReqs.size===0, [...morphReqs].join(",")||"none");
pass("idle↔walk same character (hue-sim ≥0.85)", histSim(idleHue,walkHue)>=0.85, "sim="+histSim(idleHue,walkHue));
if (attackHue) pass("idle↔attack same character (hue-sim ≥0.85)", histSim(idleHue,attackHue)>=0.85, "sim="+histSim(idleHue,attackHue));
pass("walk state observed", sawWalk);
pass("facing E≠W (flip works)", ewDist>=3, "mad="+ewDist);
pass("dodge-roll fired", rollSeen);
pass("attack fired", atk);
pass("0 console errors", errs.length===0, errs.slice(0,2).join(" | "));
if (fps!=null) pass("fps ≥55", fps>=55, "fps="+fps);

await ctx.close();
await browser.close();
await close();
const fails = checks.filter(c=>!c.c);
console.log(`\nCAS-365 warrior no-morph: ${checks.length-fails.length}/${checks.length} pass`);
process.exit(fails.length?1:0);
