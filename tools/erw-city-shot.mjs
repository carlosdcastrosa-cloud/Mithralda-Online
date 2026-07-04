// Screenshot the central ERW walled city in-engine (teleport to town center + corners).
//   node tools/erw-city-shot.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const exe=findChromium(); if(!exe){ console.error("No Chromium"); process.exit(1); }
const srv=await startServer(ROOT);
const OUT=join(ROOT,"shots");
const browser=await puppeteer.launch({executablePath:exe,headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const errs=[];
const page=await (await browser.createBrowserContext()).newPage();
page.on("pageerror",e=>errs.push("PAGEERR: "+e));
page.on("console",m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errs.push("CONSOLE: "+m.text()); });
await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
await page.goto(`${srv.url}/index.html?dev&nohud`,{waitUntil:"domcontentloaded",timeout:45000});
const fr=await (async()=>{ const dl=Date.now()+25000;
  while(Date.now()<dl){ for(const f of page.frames()){ try{ if(await f.evaluate(()=>!!(window.__dev&&window.__dev.scene))) return f; }catch{} } await sleep(200);} throw new Error("no frame"); })();
const key=(c,t)=>fr.evaluate((c,t)=>window.dispatchEvent(new KeyboardEvent(t,{code:c,key:c.replace("Key","").toLowerCase(),bubbles:true})),c,t);
await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'",{timeout:35000});
await fr.evaluate(()=>{ document.getElementById("nameInput").value="Solana"; window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
await fr.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await key("Digit1","keydown"); await key("Digit1","keyup");
await fr.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
await sleep(1500);
// town = {x:156,y:156,w:18,h:18} → center ≈ (165,165). Also shoot the north gate & a corner.
const spots=[[165,165,"erw-city-center.png"],[165,159,"erw-shrine-altar.png"],[158,158,"erw-city-nw.png"],[165,174,"erw-city-south.png"]];
for(const [tx,ty,name] of spots){
  await fr.evaluate((tx,ty)=>window.__dev.tp(tx,ty),tx,ty);
  await sleep(900);
  await page.screenshot({path:join(OUT,name)});
  console.log("wrote",name);
}
await browser.close(); await srv.close();
console.log(errs.length?("ERRORS:\n"+errs.slice(0,10).join("\n")):"no console errors");
