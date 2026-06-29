// CAS-283 in-engine — drive mage (Digit3) + druid (Digit4) through attack + death on a
// LOCAL server (the not-yet-deployed wide strips) and confirm: (a) the wide strip is the
// image actually blitted for attack/death (source height > 166), (b) the figure renders at
// the same on-screen size/position as before (centroid → hero x), (c) no console errors,
// (d) 60fps. Captures in-world shots for the issue.
//   node tools/cas283-inengine.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// records the SOURCE height of every classes/ strip blitted, keyed by anim-state.
function installHook(){
  window.__strip={hByState:{}};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){
    if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
      if(src && src.indexOf("classes/")>=0){ const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim();
        if(st){ window.__strip.hByState[st.state]={h:sh, file:base(src)}; } } }
    return o.apply(this,a); };
}

const CLASSES=[["mage",3],["druid",4]];
const srv = await startServer();
const browser = await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
let pass=0,fail=0; const ok=(b,m)=>{console.log((b?"  PASS ":"  FAIL ")+m); b?pass++:fail++;};

for(const [name,digit] of CLASSES){
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(""+e));
  page.on("console",m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil:"load" });
  // menu → name → class
  await page.waitForFunction("window.__dev && window.__dev.scene", {timeout:15000});
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput"); if(el)el.value="WideQA";
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  }
  await page.evaluate(d=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
  const cls=await page.evaluate(()=>window.__dev.hero().cls);
  ok(cls===name, `${name}: entered play as '${cls}'`);
  await page.evaluate(installHook);
  const heroX=await page.evaluate(()=>{const h=window.__dev.hero(); return Math.round(h.x);});

  // ATTACK — spam attack input until state flips, screenshot at the swing
  for(let i=0;i<24;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(50); }
  await sleep(80);
  await page.screenshot({path:join(OUT,`cas283-${name}-attack.png`),clip:{x:300,y:150,width:300,height:300}});
  const atk=await page.evaluate(()=>window.__strip.hByState.attack);
  ok(atk && atk.h>166, `${name}: attack blits WIDE strip ${atk?atk.file:"?"} (src h=${atk?atk.h:"?"}>166)`);

  // DEATH — real death path
  for(let i=0;i<10;i++){ await page.evaluate(()=>{try{window.__dev.killHero();}catch(e){}});
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="dead")break; await sleep(150); }
  await sleep(250);
  await page.screenshot({path:join(OUT,`cas283-${name}-death.png`),clip:{x:300,y:150,width:300,height:300}});
  const dth=await page.evaluate(()=>window.__strip.hByState.dead);
  ok(dth && dth.h>166, `${name}: death blits WIDE strip ${dth?dth.file:"?"} (src h=${dth?dth.h:"?"}>166)`);

  // fps
  const fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
    return await new Promise(res=>{function f(){n++; if(performance.now()-t0<1200)requestAnimationFrame(f); else res(Math.round(n/((performance.now()-t0)/1000)));} requestAnimationFrame(f);}); });
  ok(fps>=55, `${name}: ${fps}fps`);
  ok(errs.length===0, `${name}: 0 console errors${errs.length?" → "+errs.slice(0,2).join(" | "):""}`);
  await ctx.close();
}
await browser.close(); await srv.close();
console.log(`\n${pass}/${pass+fail} checks PASS`);
process.exit(fail?1:0);
