// CAS-294 — QA gate for CAS-291 (inverts CAS-289). Board bug CAS-288 "diferentes sprites
// al golpear": idle/walk were a DIFFERENT character than attack/death for mage/paladin/
// druid/priest. CAS-291 re-bakes idle/walk from the SAME CAS-238/CAS-283 recipe that made
// attack/death, and restores render.js CLASS_EXTRA_ANIM to all 5 classes → every state is
// ONE consistent character: the animated (attack) one.
//
// This harness is the INVERSE of cas290:
//   - the 4 classes MUST now blit their dedicated *_attack.png / *_death.png strips again
//     (CLASS_EXTRA_ANIM restored), AND idle MUST blit the re-baked <name>.png
//   - PROOF OF "no swap": dominant hero colour in the IDLE frame must MATCH the dominant
//     hero colour in the ATTACK frame (same character, no morph at the swing)
//   - mage extra check: dominant hue must be PURPLE (not the old static blue)
//   - warrior (Clarice) is the regression control: dedicated strips, unchanged
//   node tools/cas294-canonical-attack-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "fdd54d271860"; // CAS-291 fix build cited in the issue
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");

// Hook drawImage: record the base filename of every CLASS_FH-tall class-cell strip blitted,
// keyed by anim-state, plus the full set ever seen.
function installHook(CLASS_FH){
  window.__strip={byState:{},all:[]};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){
    if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
      // attack/death are WIDE CAS-283 cells (h 166-191); key on the classes/ path, not a strict height.
      if(sh>=150 && sh<=210 && src && src.indexOf("classes/")>=0){ const b=base(src);
        if(window.__strip.all.indexOf(b)<0)window.__strip.all.push(b);
        const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim(); const s=st?st.state:"?";
        window.__strip.byState[s]=b; } }
    return o.apply(this,a); };
}

// Sample the main canvas around the hero (centred) and return a dominant-colour signature of
// the saturated (non-background) hero pixels: avg RGB + dominant hue bucket. Background is the
// dark FOUNTAINS floor (low saturation / dark) so we keep only vivid hero pixels.
function sampleHeroColour(){
  const cv=document.getElementById("c"); if(!cv) return null;
  const cx=cv.getContext("2d"); if(!cx) return null;
  // hero is drawn near canvas centre; sample a tight box around it
  const W=cv.width, H=cv.height;
  const bx=Math.floor(W*0.5-70), by=Math.floor(H*0.5-90), bw=140, bh=170;
  let img; try{ img=cx.getImageData(bx,by,bw,bh).data; }catch(e){ return {err:String(e)}; }
  let r=0,g=0,b=0,n=0; const hueBins=new Array(12).fill(0);
  for(let i=0;i<img.length;i+=4){
    const R=img[i],G=img[i+1],B=img[i+2],A=img[i+3];
    if(A<200) continue;
    const mx=Math.max(R,G,B), mn=Math.min(R,G,B), sat=mx-mn;
    // keep vivid, mid/bright pixels → the costume colour, not the dark floor or near-white
    if(mx<60 || sat<35) continue;
    r+=R; g+=G; b+=B; n++;
    // hue
    let h=0; if(mx===mn) h=0;
    else if(mx===R) h=((G-B)/sat)%6;
    else if(mx===G) h=(B-R)/sat+2;
    else h=(R-G)/sat+4;
    h=Math.round(h*60); if(h<0)h+=360;
    hueBins[Math.floor(h/30)]++;
  }
  if(n<40) return {n,weak:true};
  let dom=0; for(let k=1;k<12;k++) if(hueBins[k]>hueBins[dom]) dom=k;
  return { n, r:Math.round(r/n), g:Math.round(g/n), b:Math.round(b/n), domHue:dom*30 };
}

// colour distance between two signatures (0 = identical)
function colDist(a,b){ if(!a||!b||a.weak||b.weak) return 999; return Math.round(Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2)); }

// CLASS_LIST = [warrior, paladin, mage, druid, priest] → digit = index+1
const CLASSES=[[1,"warrior"],[2,"paladin"],[3,"mage"],[4,"druid"],[5,"priest"]];
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const results={};
let liveBuild=null;
try{
  for(const [digit,name] of CLASSES){
    const r={errors:[],failedUrls:[],attackStrips:[]};
    const ctx=await browser.createBrowserContext(); // isolate save per class
    const page=await ctx.newPage();
    await page.setViewport({width:900,height:600,deviceScaleFactor:1});
    page.on("console",m=>{ if(m.type()==="error") r.errors.push(m.text()); });
    page.on("pageerror",e=>r.errors.push(String(e)));
    page.on("response",resp=>{ if(resp.status()>=400) r.failedUrls.push(resp.status()+" "+resp.url()); });
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

    await sleep(800);
    // IDLE colour signature + screenshot
    r.idleSig=await page.evaluate(sampleHeroColour);
    r.idleStrip=await page.evaluate(()=>window.__strip.byState.idle||window.__strip.byState.walk||null);
    await page.screenshot({path:join(OUT,`cas294-${name}-idle.png`),clip:{x:330,y:170,width:240,height:280}});

    // ATTACK: swing repeatedly; capture a colour signature on an attack frame + record strip
    let atkSig=null;
    for(let swing=0;swing<8 && !atkSig;swing++){
      for(let i=0;i<16;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
        const s=await page.evaluate(()=>window.__dev.heroAnim().state);
        if(s==="attack"){ r.attackStrips.push(await page.evaluate(()=>window.__strip.byState.attack));
          const sig=await page.evaluate(sampleHeroColour); if(sig && !sig.weak && sig.n>60){ atkSig=sig; break; } }
        await sleep(40);
      }
      await sleep(110);
    }
    r.attackSig=atkSig;
    await page.screenshot({path:join(OUT,`cas294-${name}-attack.png`),clip:{x:330,y:170,width:240,height:280}});

    // fps
    r.fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
      return await new Promise(res=>{ function f(){ n++; if(performance.now()-t0<1500){requestAnimationFrame(f);} else res(Math.round(n/((performance.now()-t0)/1000))); } requestAnimationFrame(f); }); });

    // DEATH
    for(let i=0;i<14;i++){ await page.evaluate(()=>{ try{ window.__dev.hurt(100000); }catch(e){} }); await sleep(170);
      if(await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;})==="dead") break; }
    r.deadState=await page.evaluate(()=>{const h=window.__dev.heroAnim();return h?h.state:null;});
    await sleep(400); await page.screenshot({path:join(OUT,`cas294-${name}-death.png`),clip:{x:280,y:140,width:340,height:340}});
    r.byState=await page.evaluate(()=>window.__strip.byState);
    r.all=await page.evaluate(()=>window.__strip.all);
    results[name]=r;
    await ctx.close();
  }
} finally { await browser.close(); }

console.log("LIVE build =", liveBuild, "(issue cited "+EXPECT+")");
console.log(liveBuild===EXPECT ? "✔ build matches issue\n" : "⚠ build differs from issue\n");
let totalPass=0, totalChecks=0;
const isAtk=s=>/_attack\.png$/.test(s||""), isDeath=s=>/_death\.png$/.test(s||"");
for(const [,name] of CLASSES){
  const r=results[name], C=r.byState||{}, all=r.all||[];
  const failed=[...new Set(r.failedUrls||[])].filter(u=>!/favicon|apple-touch|\/$/.test(u));
  const errs=(r.errors||[]).filter(e=>!/favicon|404|Failed to load resource/i.test(e));
  const swapDist=colDist(r.idleSig,r.attackSig);
  let checks;
  if(name==="warrior"){
    checks=[
      [`warrior cls selected`, r.cls==="warrior"],
      [`attack blits warrior_attack.png`, C.attack==="warrior_attack.png"],
      [`death blits warrior_death.png`, C.dead==="warrior_death.png"],
      [`idle colour ≈ attack colour (no swap, dist≤45)`, swapDist<=45],
      [`death scene reached`, r.deadState==="dead"],
      [`fps >= 55`, (r.fps||0)>=55],
      [`no non-cosmetic load fails`, failed.length===0],
      [`zero console errors`, errs.length===0],
    ];
  } else {
    const sawAttackStrip = all.some(s=>s===`${name}_attack.png`);
    const sawDeathStrip  = all.some(s=>s===`${name}_death.png`) || C.dead===`${name}_death.png`;
    checks=[
      [`${name} cls selected`, r.cls===name],
      [`attack DOES blit ${name}_attack.png (CLASS_EXTRA_ANIM restored)`, sawAttackStrip],
      [`death DOES blit ${name}_death.png`, sawDeathStrip],
      [`idle blits ${name}.png / ${name}_walk.png (re-baked)`, r.idleStrip===`${name}.png`||r.idleStrip===`${name}_walk.png`],
      [`idle colour ≈ attack colour (SAME char, no swap, dist≤45)`, swapDist<=45],
      [`death scene reached`, r.deadState==="dead"],
      [`fps >= 55`, (r.fps||0)>=55],
      [`no non-cosmetic load fails`, failed.length===0],
      [`zero console errors`, errs.length===0],
    ];
    if(name==="mage"){
      // mage must be PURPLE: dominant hue in the violet band (~270-300°), not blue (~210-240)
      const h=r.idleSig&&!r.idleSig.weak?r.idleSig.domHue:-1;
      checks.push([`mage idle hue is PURPLE not blue (dom≈${h}°, want 240-330)`, h>=240&&h<=330]);
    }
  }
  console.log(`── ${name.toUpperCase()} ── fps=${r.fps} dead=${r.deadState} idleStrip=${r.idleStrip} swapDist=${swapDist}`);
  console.log(`   idleSig=${JSON.stringify(r.idleSig)} attackSig=${JSON.stringify(r.attackSig)}`);
  console.log(`   strips=${JSON.stringify(all)}`);
  if(errs.length) console.log("   errors:", JSON.stringify(errs.slice(0,3)));
  if(failed.length) console.log("   failed:", JSON.stringify(failed.slice(0,3)));
  for(const [n,ok] of checks){ console.log("   "+(ok?"✔":"✖")+" "+n); totalChecks++; if(ok)totalPass++; }
}
console.log(`\n${totalPass}/${totalChecks} checks passed`);
process.exit(totalPass===totalChecks?0:1);
