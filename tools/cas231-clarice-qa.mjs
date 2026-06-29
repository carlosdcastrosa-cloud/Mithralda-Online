// CAS-231 — full QA of warrior=Clarice on the LIVE published host.
// Extends cas223-clarice-live.mjs: adds death-state strip, mirror-on-left, console
// errors, fps, and screenshots of class-select + every in-world state.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "f13a64b1646f";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");

// hooks the canvas draw to record which class strip (CLASS_FH-tall cell) is blitted
// per anim-state, plus whether it was mirrored (ctx flipped: drawImage at sx 0 after
// a scale(-1,1)). We detect flip by wrapping scale().
function installHook(CLASS_FH){
  window.__strip={byState:{},all:[],flipByState:{}};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){
    if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
      if(Math.abs(sh-CLASS_FH)<=1 && src && src.indexOf("classes/")>=0){ const b=base(src);
        if(window.__strip.all.indexOf(b)<0)window.__strip.all.push(b);
        // read the LIVE current transform: a<0 means a horizontal mirror (ctx.scale(-1,1)) is active
        const flipped = this.getTransform().a < 0;
        const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim(); const s=st?st.state:"?";
        if(s!=="dead"||!window.__strip.byState.dead){window.__strip.byState[s]=b; window.__strip.flipByState[s]=flipped;} } }
    return o.apply(this,a); };
}

const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const r={errors:[]};
try{
  const page=await browser.newPage();
  await page.setViewport({width:900,height:600,deviceScaleFactor:1});
  page.on("console",m=>{ if(m.type()==="error") r.errors.push(m.text()); });
  page.on("pageerror",e=>r.errors.push(String(e)));
  r.failedUrls=[];
  page.on("requestfailed",req=>r.failedUrls.push(req.url()));
  page.on("response",resp=>{ if(resp.status()>=400) r.failedUrls.push(resp.status()+" "+resp.url()); });
  await page.goto(`${BASE}/?dev`,{waitUntil:"networkidle2",timeout:60000});
  await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())",{timeout:25000});
  r.build=await page.evaluate(async b=>{ const v=await fetch(b+"/version.json?x="+Math.floor(performance.now())).then(x=>x.json()); return v.build; }, BASE);

  // → class-select
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput");if(el)el.value="LiveQA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  }
  await sleep(900); await page.screenshot({path:join(OUT,"cas231-classsel.png")});

  // → in-world warrior
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
  await page.evaluate(installHook,166);
  r.cls=await page.evaluate(()=>window.__dev.hero().cls);

  // idle
  await sleep(900); await page.screenshot({path:join(OUT,"cas231-idle.png"),clip:{x:330,y:170,width:240,height:280}});

  // walk RIGHT (no flip expected), then LEFT (flip expected)
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD",key:"d",bubbles:true}))); await sleep(700);
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD",key:"d",bubbles:true})));
  r.walkRightFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
  await page.screenshot({path:join(OUT,"cas231-walk-right.png"),clip:{x:330,y:170,width:240,height:280}});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",key:"a",bubbles:true}))); await sleep(700);
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",key:"a",bubbles:true})));
  r.walkLeftFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
  await page.screenshot({path:join(OUT,"cas231-walk-left.png"),clip:{x:330,y:170,width:240,height:280}});

  // attack
  await page.evaluate(()=>window.__dev.juiceArena&&window.__dev.juiceArena(4));
  for(let i=0;i<16;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(60); }
  await page.screenshot({path:join(OUT,"cas231-attack.png"),clip:{x:330,y:170,width:240,height:280}});

  // fps over ~1.5s of movement
  r.fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
    return await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }); });

  // death: drop hp to 0
  for(let i=0;i<12;i++){
    await page.evaluate(()=>window.__dev.setHeroHp&&window.__dev.setHeroHp(0)); await sleep(200);
    const st=await page.evaluate(()=>{ const h=window.__dev.heroAnim(); return h?h.state:null; });
    if(st==="dead") break; }
  r.deadState=await page.evaluate(()=>{ const h=window.__dev.heroAnim(); return h?h.state:null; });
  r.sceneDead=await page.evaluate(()=>window.__dev.scene());
  await sleep(500); await page.screenshot({path:join(OUT,"cas231-death.png")});

  r.byState=await page.evaluate(()=>window.__strip.byState);
  r.all=await page.evaluate(()=>window.__strip.all);
} finally { await browser.close(); }

const C=r.byState||{};
const failed=[...new Set(r.failedUrls||[])];
// the only known-cosmetic 404 is the root favicon (sev-4, tracked across passes)
const nonCosmetic=failed.filter(u=>!/favicon|apple-touch|\/$/.test(u));
const checks=[
  ["warrior cls selected", r.cls==="warrior"],
  ["idle strip = warrior.png", C.idle==="warrior.png"],
  ["walk strip = warrior_walk.png", C.walk==="warrior_walk.png"],
  ["attack strip = warrior_attack.png", C.attack==="warrior_attack.png"],
  ["death strip = warrior_death.png", C.dead==="warrior_death.png"],
  ["death scene reached", r.deadState==="dead"],
  // CAS-235: assert the sprite MIRRORS between left/right (off-hand swaps), orientation-agnostic.
  // Which direction is the un-flipped default depends on the source frames' facing (hi-res Clarice
  // faces the opposite way from the old low-res source) — so don't hardcode it; just require they differ.
  ["walk mirrors between L/R (flips differ)", r.walkLeftFlip!==r.walkRightFlip && r.walkLeftFlip!=null && r.walkRightFlip!=null],
  ["fps >= 55", (r.fps||0)>=55],
  ["no non-cosmetic load failures", nonCosmetic.length===0],
];
console.log("LIVE build =", r.build, "(issue cited "+EXPECT+")");
console.log("cls =", r.cls, "| fps =", r.fps, "| deadState =", r.deadState, "| sceneDead =", r.sceneDead);
console.log("strips byState:", JSON.stringify(C));
console.log("flip walkRight =", r.walkRightFlip, "walkLeft =", r.walkLeftFlip);
console.log("console errors:", JSON.stringify(r.errors));
console.log("failed loads:", JSON.stringify(failed));
console.log("non-cosmetic failed:", JSON.stringify(nonCosmetic));
let pass=0; for(const [n,ok] of checks){ console.log((ok?"✔":"✖")+" "+n); if(ok)pass++; }
console.log(`\n${pass}/${checks.length} checks passed`);
process.exit(pass===checks.length?0:1);
