// CAS-258 — in-engine QA gate for CAS-253 PixelLab-native class heroes (druid/priest/mage/paladin).
// Verifies idle/walk/attack/death render the correct PixelLab strip in-world on the LIVE host,
// 60fps, 0 errors, walk mirrors, and warrior (CAS-254 Clarice) is unregressed.
// Robust selection: clears any persisted save first (else a saved hero auto-resumes and
// class-select is skipped), confirms the ACTUAL selected cls, drives the real death path via
// __dev.killHero(). CLASS_LIST = [warrior, paladin, mage, druid, priest] → digit = index+1.
//   node tools/cas258-classes-live.mjs
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

// digit = CLASS_LIST index+1 → [warrior=1, paladin=2, mage=3, druid=4, priest=5]
const CLASSES=[["paladin",2],["mage",3],["druid",4],["priest",5]];
const STRIP={paladin:"paladin",mage:"mage",druid:"druid",priest:"priest"};
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const results={}; let warrior=null; let liveBuild=null;

async function enterClass(page, digit){
  // each class runs in its own browser context → clean localStorage, so menu→classsel always shows
  await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())",{timeout:25000});
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput");if(el)el.value="LiveQA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  }
  const sceneAtSelect=await page.evaluate(()=>window.__dev.scene());
  await page.evaluate((d)=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
  return sceneAtSelect;
}

async function drive(page, name, r){
  await page.evaluate(installHook,166);
  r.cls=await page.evaluate(()=>window.__dev.hero().cls);
  await sleep(900); await page.screenshot({path:join(OUT,`cas258-${name}-idle.png`),clip:{x:330,y:170,width:240,height:280}});
  // walk R then L
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD",key:"d",bubbles:true}))); await sleep(700);
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD",key:"d",bubbles:true})));
  r.walkRightFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
  await page.screenshot({path:join(OUT,`cas258-${name}-walk.png`),clip:{x:330,y:170,width:240,height:280}});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",key:"a",bubbles:true}))); await sleep(700);
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",key:"a",bubbles:true})));
  r.walkLeftFlip=await page.evaluate(()=>window.__strip.flipByState.walk);
  // attack
  for(let i=0;i<16;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(60); }
  await page.screenshot({path:join(OUT,`cas258-${name}-attack.png`),clip:{x:330,y:170,width:240,height:280}});
  // fps over ~1.5s
  r.fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
    return await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }); });
  // death — real path: __dev.killHero() calls heroDie()
  for(let i=0;i<10;i++){ await page.evaluate(()=>{ try{ window.__dev.killHero(); }catch(e){} }); await sleep(180);
    if(await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;})==="dead") break; }
  r.deadState=await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;});
  await sleep(400); await page.screenshot({path:join(OUT,`cas258-${name}-death.png`),clip:{x:280,y:140,width:340,height:340}});
  r.byState=await page.evaluate(()=>window.__strip.byState);
}

try{
  // ── 4 non-warrior PixelLab classes ──
  const RUN=[...CLASSES,["warrior",1]];
  for(const [name,digit] of RUN){
    const r={errors:[],failedUrls:[]};
    const ctx=await browser.createBrowserContext();
    const page=await ctx.newPage();
    await page.setViewport({width:900,height:600,deviceScaleFactor:1});
    page.on("console",m=>{ if(m.type()==="error") r.errors.push(m.text()); });
    page.on("pageerror",e=>r.errors.push(String(e)));
    page.on("response",resp=>{ if(resp.status()>=400) r.failedUrls.push(resp.status()+" "+resp.url()); });
    await page.goto(`${BASE}/?dev`,{waitUntil:"networkidle2",timeout:60000});
    if(!liveBuild) liveBuild=await page.evaluate(async b=>{ const v=await fetch(b+"/version.json?x="+Math.floor(performance.now())).then(x=>x.json()); return v.build; }, BASE);
    r.sceneAtSelect=await enterClass(page,digit);
    if(name==="mage") await page.screenshot({path:join(OUT,"cas258-classsel.png")}).catch(()=>{});
    await drive(page,name,r);
    if(name==="warrior") warrior=r; else results[name]=r;
    await ctx.close();
  }
} finally { await browser.close(); }

console.log("LIVE build =", liveBuild, "(expected "+EXPECT+")\n");
let totalPass=0, totalChecks=0;
function row(name,r,stripBase,extra){
  const C=r.byState||{};
  const failed=[...new Set(r.failedUrls||[])].filter(u=>!/favicon|apple-touch|\/$/.test(u));
  const errs=(r.errors||[]).filter(e=>!/favicon|404/i.test(e));
  const checks=[
    [`${name} cls selected`, r.cls===name],
    [`idle strip = ${stripBase}.png`, C.idle===`${stripBase}.png`],
    [`walk strip = ${stripBase}_walk.png`, C.walk===`${stripBase}_walk.png`],
    [`attack strip = ${stripBase}_attack.png`, C.attack===`${stripBase}_attack.png`],
    [`walk mirrors L/R`, r.walkLeftFlip!==r.walkRightFlip && r.walkLeftFlip!=null && r.walkRightFlip!=null],
    [`fps >= 55`, (r.fps||0)>=55],
    [`no non-cosmetic load fails`, failed.length===0],
    [`zero console errors`, errs.length===0],
  ];
  if(extra) checks.splice(4,0,...extra(C,r));
  console.log(`── ${name.toUpperCase()} ── scene@sel=${r.sceneAtSelect||"-"} cls=${r.cls} fps=${r.fps} dead=${r.deadState} strips=${JSON.stringify(C)}`);
  if(errs.length) console.log("   errors:", JSON.stringify(errs.slice(0,3)));
  if(failed.length) console.log("   failed:", JSON.stringify(failed.slice(0,3)));
  for(const [n,ok] of checks){ console.log("   "+(ok?"✔":"✖")+" "+n); totalChecks++; if(ok)totalPass++; }
}
for(const [name] of CLASSES){
  row(name,results[name],STRIP[name],(C,r)=>[
    [`death strip = ${STRIP[name]}_death.png`, C.dead===`${STRIP[name]}_death.png`],
    [`death scene reached`, r.deadState==="dead"],
  ]);
}
// warrior: Clarice strips live under classes/ too (CAS-254); just assert it still animates + dies, no error
row("warrior",warrior,"warrior",(C,r)=>[
  [`death scene reached`, r.deadState==="dead"],
]);
console.log(`\n${totalPass}/${totalChecks} checks passed`);
process.exit(totalPass===totalChecks?0:1);
