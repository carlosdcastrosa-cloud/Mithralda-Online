// CAS-263 — in-engine QA gate for CAS-260: verify all 4 PixelLab-native class heroes
// (mage/paladin/priest/druid) render idle/walk/attack/death in-world on the LIVE host.
// Generalizes cas255-warrior-anim-live.mjs across the 4 classes. Per class: enters play,
// hooks the canvas to record which class strip is blitted per anim-state, drives each state,
// captures shots, and asserts strip names + death-scene + mirror + fps + zero errors.
//   node tools/cas263-classes-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "a7ea705e7cb5"; // CAS-258 final build (PixelLab idle/walk/attack + baseline death)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");

// records which class strip (CLASS_FH-tall cell) is blitted per anim-state + mirror flag.
function installHook(CLASS_FH){
  window.__strip={byState:{},all:[],flipByState:{}};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){
    if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
      if(Math.abs(sh-CLASS_FH)<=1 && src && src.indexOf("classes/")>=0){ const b=base(src);
        if(window.__strip.all.indexOf(b)<0)window.__strip.all.push(b);
        const flipped = this.getTransform().a < 0;
        const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim(); const s=st?st.state:"?";
        if(s!=="dead"||!window.__strip.byState.dead){window.__strip.byState[s]=b; window.__strip.flipByState[s]=flipped;} } }
    return o.apply(this,a); };
}

// CLASS_LIST = [warrior, paladin, mage, druid, priest] → digit = index+1
const CLASSES=[[3,"mage"],[2,"paladin"],[4,"druid"],[5,"priest"]];
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const results={};
let liveBuild=null;
try{
  for(const [digit,name] of CLASSES){
    const r={errors:[],failedUrls:[]};
    const page=await browser.newPage();
    await page.setViewport({width:900,height:600,deviceScaleFactor:1});
    page.on("console",m=>{ if(m.type()==="error") r.errors.push(m.text()); });
    page.on("pageerror",e=>r.errors.push(String(e)));
    page.on("response",resp=>{ if(resp.status()>=400) r.failedUrls.push(resp.status()+" "+resp.url()); });
    // fresh start each class: a persisted save would resume the prior class & skip class-select
    await page.evaluateOnNewDocument(()=>{ try{ localStorage.clear(); }catch(e){} });
    await page.goto(`${BASE}/?dev`,{waitUntil:"networkidle2",timeout:60000});
    await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())",{timeout:25000});
    if(!liveBuild) liveBuild=await page.evaluate(async b=>{ const v=await fetch(b+"/version.json?x="+Math.floor(performance.now())).then(x=>x.json()); return v.build; }, BASE);
    if(await page.evaluate(()=>window.__dev.scene())==="menu"){
      await page.evaluate(()=>{const el=document.getElementById("nameInput");if(el)el.value="LiveQA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
      await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
    }
    if(name==="mage") await page.screenshot({path:join(OUT,"cas263-classsel.png")});
    await page.evaluate((d)=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
    await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
    await page.evaluate(installHook,166);
    r.cls=await page.evaluate(()=>window.__dev.hero().cls);

    await sleep(900); await page.screenshot({path:join(OUT,`cas263-${name}-idle.png`),clip:{x:330,y:170,width:240,height:280}});
    // walk R then L
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD",key:"d",bubbles:true}))); await sleep(700);
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD",key:"d",bubbles:true})));
    r.walkRightFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
    await page.screenshot({path:join(OUT,`cas263-${name}-walk.png`),clip:{x:330,y:170,width:240,height:280}});
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",key:"a",bubbles:true}))); await sleep(700);
    await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",key:"a",bubbles:true})));
    r.walkLeftFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
    // attack
    for(let i=0;i<16;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
      if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(60); }
    await page.screenshot({path:join(OUT,`cas263-${name}-attack.png`),clip:{x:330,y:170,width:240,height:280}});
    // fps over ~1.5s
    r.fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
      return await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }); });
    // death — setHeroHp clamps ≥1, so drive lethal damage through hurt() (resets iframe, routes damageHero)
    for(let i=0;i<12;i++){ await page.evaluate(()=>{ try{ window.__dev.hurt(100000); }catch(e){} }); await sleep(180);
      if(await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;})==="dead") break; }
    r.deadState=await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;});
    await sleep(400); await page.screenshot({path:join(OUT,`cas263-${name}-death.png`),clip:{x:280,y:140,width:340,height:340}});
    r.byState=await page.evaluate(()=>window.__strip.byState);
    results[name]=r;
    await page.close();
  }
} finally { await browser.close(); }

console.log("LIVE build =", liveBuild, "(issue cited "+EXPECT+")\n");
let totalPass=0, totalChecks=0;
for(const [,name] of CLASSES){
  const r=results[name], C=r.byState||{};
  const failed=[...new Set(r.failedUrls||[])].filter(u=>!/favicon|apple-touch|\/$/.test(u));
  const errs=(r.errors||[]).filter(e=>!/favicon|404/i.test(e));
  const checks=[
    [`${name} cls selected`, r.cls===name],
    [`idle strip = ${name}.png`, C.idle===`${name}.png`],
    [`walk strip = ${name}_walk.png`, C.walk===`${name}_walk.png`],
    [`attack strip = ${name}_attack.png`, C.attack===`${name}_attack.png`],
    [`death strip = ${name}_death.png`, C.dead===`${name}_death.png`],
    [`death scene reached`, r.deadState==="dead"],
    [`walk mirrors L/R`, r.walkLeftFlip!==r.walkRightFlip && r.walkLeftFlip!=null && r.walkRightFlip!=null],
    [`fps >= 55`, (r.fps||0)>=55],
    [`no non-cosmetic load fails`, failed.length===0],
    [`zero console errors`, errs.length===0],
  ];
  console.log(`── ${name.toUpperCase()} ── fps=${r.fps} dead=${r.deadState} strips=${JSON.stringify(C)}`);
  if(errs.length) console.log("   errors:", JSON.stringify(errs.slice(0,3)));
  if(failed.length) console.log("   failed:", JSON.stringify(failed.slice(0,3)));
  for(const [n,ok] of checks){ console.log("   "+(ok?"✔":"✖")+" "+n); totalChecks++; if(ok)totalPass++; }
}
console.log(`\n${totalPass}/${totalChecks} checks passed`);
process.exit(totalPass===totalChecks?0:1);
