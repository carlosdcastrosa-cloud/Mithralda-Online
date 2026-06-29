// CAS-283 clean in-world shot — capture the hero mid-attack centred on its on-screen
// position (camera follows the hero), for druid + mage, so the full wide swing is visible.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const CLASSES=[["mage",3],["druid",4]];
const srv=await startServer();
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
for(const [name,digit] of CLASSES){
  const ctx=await browser.createBrowserContext(); const page=await ctx.newPage();
  await page.goto(`${srv.url}/index.html?dev`,{waitUntil:"load"});
  await page.waitForFunction("window.__dev && window.__dev.scene",{timeout:15000});
  if(await page.evaluate(()=>window.__dev.scene())==="menu"){
    await page.evaluate(()=>{const el=document.getElementById("nameInput"); if(el)el.value="WideQA";
      window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
    await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  }
  await page.evaluate(d=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit"+d,key:""+d,bubbles:true})),digit);
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:12000});
  // hold attack a beat so we land mid-swing (wide FX frame)
  let shotTaken=false;
  for(let i=0;i<30;i++){ await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyJ",key:"j",bubbles:true})));
    const s=await page.evaluate(()=>window.__dev.heroAnim().state);
    if(s==="attack"){ await sleep(90); await page.screenshot({path:join(OUT,`cas283-${name}-world.png`)}); shotTaken=true; break; } await sleep(45); }
  if(!shotTaken){ await page.screenshot({path:join(OUT,`cas283-${name}-world.png`)}); }
  console.log(`  ${name} shot`);
  await ctx.close();
}
await browser.close(); await srv.close();
