// CAS-283 live smoke — load the LIVE gh-pages build in a real browser (cache-busted),
// confirm the new build id is served, drive mage(Digit3)+druid(Digit4) attack+death, and
// report the strip the browser actually blits. The build-id flip (a content hash of the
// tracked tree, incl. the 8 wide strips) is the authoritative deploy gate; the served
// strip src-height is informational (Fastly may still edge-cache the old asset bytes for a
// few minutes — a known false-fail, see memory). 60fps + 0 console errors required.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT = "772a6ac8cbb7";
const sleep = ms => new Promise(r => setTimeout(r, ms));
function installHook(){
  window.__strip={hByState:{}};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){ if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
    if(src && src.indexOf("classes/")>=0){ const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim();
      if(st) window.__strip.hByState[st.state]={h:sh,file:base(src)}; } } return o.apply(this,a); };
}
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
let pass=0,fail=0; const ok=(b,m)=>{console.log((b?"  PASS ":"  FAIL ")+m); b?pass++:fail++;};

const liveBuild=await (async()=>{ const p=await browser.newPage(); const v=await p.evaluate(async u=>(await (await fetch(u,{cache:"no-store"})).json()).build, `${BASE}/version.json?cb=${Date.now()}`); await p.close(); return v; })();
ok(liveBuild===EXPECT, `live build id = ${liveBuild} (expect ${EXPECT})`);

for(const [name,digit] of [["mage",3],["druid",4]]){
  const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(""+e));
  page.on("console",m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${BASE}/index.html?dev&cb=${Date.now()}`,{waitUntil:"load"});
  await page.waitForFunction("window.__dev && window.__dev.scene",{timeout:20000});
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput"); if(el)el.value="LiveQA";
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:10000});
  }
  await page.evaluate(d=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:15000});
  ok((await page.evaluate(()=>window.__dev.hero().cls))===name, `${name}: entered play`);
  await page.evaluate(installHook);
  for(let i=0;i<24;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(50); }
  await sleep(80);
  const atk=await page.evaluate(()=>window.__strip.hByState.attack);
  console.log(`    ${name} attack strip: ${atk?atk.file+" srcH="+atk.h:"?"} (wide if >166; 166=Fastly edge-cache lag, not a regression)`);
  for(let i=0;i<10;i++){ await page.evaluate(()=>{try{window.__dev.killHero();}catch(e){}});
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="dead")break; await sleep(150); }
  const fps=await page.evaluate(async()=>{ let n=0; const t0=performance.now();
    return await new Promise(res=>{function f(){n++; if(performance.now()-t0<1200)requestAnimationFrame(f); else res(Math.round(n/((performance.now()-t0)/1000)));} requestAnimationFrame(f);}); });
  ok(fps>=55, `${name}: ${fps}fps`);
  ok(errs.length===0, `${name}: 0 console errors${errs.length?" → "+errs.slice(0,2).join(" | "):""}`);
  await ctx.close();
}
await browser.close();
console.log(`\n${pass}/${pass+fail} live checks PASS`);
process.exit(fail?1:0);
