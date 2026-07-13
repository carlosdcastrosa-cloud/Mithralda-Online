// CAS-2259 QA — LIVE build corner crop: does the base "Descanso" bar (already LIVE, no willSpend tag)
// ALREADY overlap the top-right minimap? Determines whether the overlap is pre-existing or a CAS-2259 regression.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "node:fs";
const exe = findChromium();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots/cas2259", { recursive: true });
const URL = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev=1";
async function toPlay(page){
  await page.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:30000});
  await page.evaluate(()=>{const ni=document.getElementById("nameInput");if(ni)ni.value="QALive";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
  await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())",{timeout:8000});
  for(const s of["customize","abilitysel"]){if(await page.evaluate(()=>window.__dev.scene())===s)await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));}
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:8000}); await sleep(400);
}
async function clearCurse(page){for(let i=0;i<8;i++){if(await page.evaluate(()=>window.__dev.scene())==="play")return;await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true})));await sleep(120);}}
const browser=await puppeteer.launch({executablePath:exe,args:LAUNCH_ARGS,headless:"new"});
try{
  const page=await browser.newPage();
  const VW=900,VH=640;
  await page.setViewport({width:VW,height:VH,deviceScaleFactor:3});
  const build=await page.evaluate(async()=>{try{const r=await fetch("version.json?cb="+Date.now());return (await r.json()).build;}catch(e){return "n/a";}});
  await page.goto(URL,{waitUntil:"domcontentloaded",timeout:45000});
  await toPlay(page);
  const rested=await page.evaluate(()=>window.__dev.rested?window.__dev.rested():{n:"no hook"});
  await page.evaluate(()=>{window.__dev.daynight&&window.__dev.daynight({phase:0.5});window.__dev.weather&&window.__dev.weather(0);});
  const sz=await page.evaluate(()=>window.__dev.safeZone());const bb=sz.bbox;const cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2;
  // INSIDE city, pool full → base "Descanso" bar (LIVE has no willSpend tag)
  await page.evaluate((tx,ty)=>window.__dev.tp(tx,ty),Math.round(cx/32),Math.round(cy/32));
  await clearCurse(page);
  await page.evaluate(()=>window.__dev.rested({setPool:600}));await sleep(400);
  await page.screenshot({path:"shots/cas2259/qa-LIVE-corner-inside.png",clip:{x:VW-170,y:8,width:170,height:130}});
  const bv=await page.evaluate(async()=>{try{const r=await fetch("version.json?cb="+Date.now());return (await r.json()).build;}catch(e){return "n/a";}});
  console.log("LIVE build:", build, bv, "rested:", JSON.stringify(rested));
}finally{await browser.close();}
