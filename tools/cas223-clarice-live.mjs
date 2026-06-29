// CAS-223 — LIVE confirmation: the warrior is Clarice on the published backup host.
// Loads the LIVE game directly (no local server), picks warrior, and records which
// class strip the in-world hero draws for idle/walk/attack + screenshots.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = join(ROOT, "tools");
function installHook(CLASS_FH){ window.__strip={byState:{},all:[]};
  const base=s=>(s||"").split("/").pop().split("?")[0];
  const p=CanvasRenderingContext2D.prototype, o=p.drawImage;
  p.drawImage=function(...a){ if(a.length===9){ const sh=a[4], src=a[0]&&(a[0].src||a[0].currentSrc);
    if(Math.abs(sh-CLASS_FH)<=1 && src && src.indexOf("classes/")>=0){ const b=base(src);
      if(window.__strip.all.indexOf(b)<0)window.__strip.all.push(b);
      const st=window.__dev&&window.__dev.heroAnim&&window.__dev.heroAnim(); const s=st?st.state:"?";
      if(s!=="dead"||!window.__strip.byState.dead)window.__strip.byState[s]=b; } }
    return o.apply(this,a); }; }
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const r={};
try{ const page=await browser.newPage(); await page.setViewport({width:900,height:600,deviceScaleFactor:1});
  await page.goto(`${BASE}/?dev`,{waitUntil:"networkidle2",timeout:60000});
  await page.waitForFunction("window.__dev && ['menu','classsel','play'].includes(window.__dev.scene())",{timeout:25000});
  r.build=await page.evaluate(async b=>{ const v=await fetch(b+"/version.json?x="+Math.floor(performance.now())).then(x=>x.json()); return v.build; }, BASE);
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput");if(el)el.value="LiveQA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000}); }
  await sleep(800); await page.screenshot({path:join(OUT,"cas223-live-classsel.png")});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
  await page.evaluate(installHook,166); await sleep(700);
  await page.screenshot({path:join(OUT,"cas223-live-idle.png"),clip:{x:330,y:170,width:240,height:280}});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyD",key:"d",bubbles:true}))); await sleep(700);
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyD",key:"d",bubbles:true})));
  await page.evaluate(()=>window.__dev.juiceArena&&window.__dev.juiceArena(4));
  for(let i=0;i<14;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    if(await page.evaluate(()=>window.__dev.heroAnim().state)==="attack")break; await sleep(60); }
  await page.screenshot({path:join(OUT,"cas223-live-attack.png"),clip:{x:330,y:170,width:240,height:280}});
  r.byState=await page.evaluate(()=>window.__strip.byState); r.all=await page.evaluate(()=>window.__strip.all);
} finally { await browser.close(); }
console.log("LIVE build =", r.build, "(expect 48b3a69beace)");
console.log("LIVE in-world strips:", JSON.stringify(r.byState));
const ok = r.build==="48b3a69beace" && r.byState.idle==="warrior.png" && r.byState.walk==="warrior_walk.png" && r.byState.attack==="warrior_attack.png";
console.log("all:", (r.all||[]).join(", "));
console.log(ok?"\n✔ LIVE PASS — warrior is Clarice on the published host":"\n✖ LIVE check incomplete (CDN may still be warming)");
process.exit(ok?0:1);
