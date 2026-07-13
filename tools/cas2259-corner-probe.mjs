// CAS-2259 QA — high-res crop of the top-right corner to judge Descanso badge vs minimap overlap/readability.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "node:fs";
const exe = findChromium();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots/cas2259", { recursive: true });
async function toPlay(page){
  await page.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:25000});
  await page.evaluate(()=>{const ni=document.getElementById("nameInput");if(ni)ni.value="QARest";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
  await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())",{timeout:8000});
  for(const s of["customize","abilitysel"]){if(await page.evaluate(()=>window.__dev.scene())===s)await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));}
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:8000}); await sleep(400);
}
async function clearCurse(page){for(let i=0;i<8;i++){if(await page.evaluate(()=>window.__dev.scene())==="play")return;await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true})));await sleep(120);}}
const srv=await startServer();
const browser=await puppeteer.launch({executablePath:exe,args:LAUNCH_ARGS,headless:"new"});
try{
  const page=await browser.newPage();
  const VW=900,VH=640;
  await page.setViewport({width:VW,height:VH,deviceScaleFactor:3});
  await page.goto(`${srv.url}/index.html?dev=1`,{waitUntil:"domcontentloaded",timeout:30000});
  await toPlay(page);
  await page.evaluate(()=>{window.__dev.daynight&&window.__dev.daynight({phase:0.5});window.__dev.weather&&window.__dev.weather(0);});
  const sz=await page.evaluate(()=>window.__dev.safeZone());const bb=sz.bbox;const cy=(bb[1]+bb[3])/2;
  // OUTSIDE → willSpend tag "zZ ×1.5"
  await page.evaluate((tx,ty)=>window.__dev.tp(tx,ty),Math.round((bb[2]+800)/32),Math.round(cy/32));
  await sleep(350);await clearCurse(page);await sleep(150);
  await page.evaluate(()=>window.__dev.rested({setPool:600}));await sleep(400);
  await page.screenshot({path:"shots/cas2259/qa-corner-outside.png",clip:{x:VW-170,y:8,width:170,height:130}});
  // INSIDE → "acumulando"
  const cx=(bb[0]+bb[2])/2;
  await page.evaluate((tx,ty)=>window.__dev.tp(tx,ty),Math.round(cx/32),Math.round(cy/32));
  await clearCurse(page);
  await page.evaluate(()=>window.__dev.rested({setPool:600}));await sleep(400);
  await page.screenshot({path:"shots/cas2259/qa-corner-inside.png",clip:{x:VW-170,y:8,width:170,height:130}});
  console.log("saved corner crops");
}finally{await browser.close();await srv.close();}
