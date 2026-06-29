// CAS-290 — QA gate for CAS-289 (board bug CAS-288: "salen diferentes sprites al golpear").
// The attack/death PixelLab strips for mage/paladin/druid/priest were a DIFFERENT character
// than each class's idle/walk art → on every swing the hero morphed into "otro personaje".
// FIX: render.js CLASS_EXTRA_ANIM=["warrior"] → only warrior loads clsattack_/clsdeath_;
// the other 4 fall back to their OWN clshero_ idle character + procedural lunge.
//
// This harness is the INVERSE of cas263: for the 4 classes the hero must keep its OWN
// idle/walk sprite through attack AND death — it must NEVER blit a *_attack.png / *_death.png
// strip. Warrior (Clarice) is the REGRESSION control: it MUST still blit its dedicated strips.
//   node tools/cas290-attack-swap-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "ac3e10d014ae"; // CAS-289 fix build cited in the issue
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");

// Records the base filename of every CLASS_FH-tall class-cell strip blitted, keyed by
// anim-state, plus the full set ever seen. base() strips the dir + query.
function installHook(CLASS_FH){
  window.__strip={byState:{},all:[]};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){
    if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
      if(Math.abs(sh-CLASS_FH)<=1 && src && src.indexOf("classes/")>=0){ const b=base(src);
        if(window.__strip.all.indexOf(b)<0)window.__strip.all.push(b);
        const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim(); const s=st?st.state:"?";
        window.__strip.byState[s]=b; } }
    return o.apply(this,a); };
}

// CLASS_LIST = [warrior, paladin, mage, druid, priest] → digit = index+1
const CLASSES=[[1,"warrior"],[2,"paladin"],[3,"mage"],[4,"druid"],[5,"priest"]];
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const results={};
let liveBuild=null;
try{
  for(const [digit,name] of CLASSES){
    const r={errors:[],failedUrls:[],attackStates:[]};
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
    await page.evaluate((d)=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
    await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
    await page.evaluate(installHook,166);
    r.cls=await page.evaluate(()=>window.__dev.hero().cls);

    await sleep(700);
    // ATTACK repeatedly across several swings, sampling the strip blitted on each attack frame
    for(let swing=0;swing<6;swing++){
      for(let i=0;i<16;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
        const s=await page.evaluate(()=>window.__dev.heroAnim().state);
        if(s==="attack"){ r.attackStates.push(await page.evaluate(()=>window.__strip.byState.attack)); }
        await sleep(45);
      }
      await sleep(120);
    }
    await page.screenshot({path:join(OUT,`cas290-${name}-attack.png`),clip:{x:330,y:170,width:240,height:280}});
    // fps over ~1.5s
    r.fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
      return await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }); });
    // death — hurt() routes lethal damage (setHeroHp clamps ≥1)
    for(let i=0;i<12;i++){ await page.evaluate(()=>{ try{ window.__dev.hurt(100000); }catch(e){} }); await sleep(180);
      if(await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;})==="dead") break; }
    r.deadState=await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;});
    await sleep(400); await page.screenshot({path:join(OUT,`cas290-${name}-death.png`),clip:{x:280,y:140,width:340,height:340}});
    r.byState=await page.evaluate(()=>window.__strip.byState);
    r.all=await page.evaluate(()=>window.__strip.all);
    results[name]=r;
    await page.close();
  }
} finally { await browser.close(); }

console.log("LIVE build =", liveBuild, "(issue cited "+EXPECT+")\n");
let totalPass=0, totalChecks=0;
const isAtk=s=>/_attack\.png$/.test(s||""), isDeath=s=>/_death\.png$/.test(s||"");
for(const [,name] of CLASSES){
  const r=results[name], C=r.byState||{}, all=r.all||[];
  const failed=[...new Set(r.failedUrls||[])].filter(u=>!/favicon|apple-touch|\/$/.test(u));
  const errs=(r.errors||[]).filter(e=>!/favicon|404|Failed to load resource/i.test(e));
  const sawAttackState=(r.attackStates||[]).length>0;
  let checks;
  if(name==="warrior"){
    // REGRESSION control: Clarice keeps her dedicated, consistent strips.
    checks=[
      [`warrior cls selected`, r.cls==="warrior"],
      [`attack state observed`, sawAttackState],
      [`attack DOES blit warrior_attack.png (dedicated)`, C.attack==="warrior_attack.png"],
      [`death DOES blit warrior_death.png (dedicated)`, C.dead==="warrior_death.png"],
      [`death scene reached`, r.deadState==="dead"],
      [`fps >= 55`, (r.fps||0)>=55],
      [`no non-cosmetic load fails`, failed.length===0],
      [`zero console errors`, errs.length===0],
    ];
  } else {
    // FIX: hero keeps its OWN idle character through attack AND death — never a different sprite.
    const attackOnOwn = sawAttackState && r.attackStates.every(s=>s===`${name}.png`||s===`${name}_walk.png`);
    const neverAttackStrip = !all.some(isAtk);
    const neverDeathStrip = !all.some(isDeath);
    checks=[
      [`${name} cls selected`, r.cls===name],
      [`attack state observed`, sawAttackState],
      [`attack keeps OWN sprite (idle/walk, NO swap)`, attackOnOwn],
      [`NO *_attack.png strip ever blitted`, neverAttackStrip],
      [`death keeps OWN sprite (not ${name}_death.png)`, C.dead!==`${name}_death.png`],
      [`NO *_death.png strip ever blitted`, neverDeathStrip],
      [`death scene reached`, r.deadState==="dead"],
      [`fps >= 55`, (r.fps||0)>=55],
      [`no non-cosmetic load fails`, failed.length===0],
      [`zero console errors`, errs.length===0],
    ];
  }
  console.log(`── ${name.toUpperCase()} ── fps=${r.fps} dead=${r.deadState} attackStrips=${JSON.stringify([...new Set(r.attackStates)])} all=${JSON.stringify(all)}`);
  if(errs.length) console.log("   errors:", JSON.stringify(errs.slice(0,3)));
  if(failed.length) console.log("   failed:", JSON.stringify(failed.slice(0,3)));
  for(const [n,ok] of checks){ console.log("   "+(ok?"✔":"✖")+" "+n); totalChecks++; if(ok)totalPass++; }
}
console.log(`\n${totalPass}/${totalChecks} checks passed`);
process.exit(totalPass===totalChecks?0:1);
