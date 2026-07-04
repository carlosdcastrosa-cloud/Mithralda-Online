// Screenshot the hand-built Tiled continent in-engine (?world=tiled): spawn hub + a coastline.
//   node tools/tiled-world-shot.mjs
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
await page.goto(`${srv.url}/index.html?world=tiled&dev&nohud`,{waitUntil:"domcontentloaded",timeout:45000});
const fr=await (async()=>{ const dl=Date.now()+25000;
  while(Date.now()<dl){ for(const f of page.frames()){ try{ if(await f.evaluate(()=>!!(window.__dev&&window.__dev.scene))) return f; }catch{} } await sleep(200);} throw new Error("no frame"); })();
const key=(c,t)=>fr.evaluate((c,t)=>window.dispatchEvent(new KeyboardEvent(t,{code:c,key:c.replace("Key","").toLowerCase(),bubbles:true})),c,t);
await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'",{timeout:35000});
await fr.evaluate(()=>{ document.getElementById("nameInput").value="Explorer"; window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
await fr.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await key("Digit1","keydown"); await key("Digit1","keyup");
await fr.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
await sleep(1500);
// hub ≈ tile (371,281). Shoot hub + N/E/S/W toward the coast.
const spots=[[371,281,"tiled-hub.png"],[371,150,"tiled-north.png"],[560,281,"tiled-east.png"],[371,420,"tiled-south.png"],[180,281,"tiled-west.png"]];
for(const [tx,ty,name] of spots){
  await fr.evaluate((tx,ty)=>window.__dev.tp(tx,ty),tx,ty);
  await sleep(700);
  await page.screenshot({path:join(OUT,name)});
  console.log("wrote",name);
}
// verify the grafted dungeons/old-lands exist (translated below the continent)
for(const z of ["town","caves","arena","abyss","frost","trial"]){
  const r=await fr.evaluate((z)=>window.__dev.tpZone(z),z);
  await sleep(700);
  await page.screenshot({path:join(OUT,"tiled-zone-"+z+".png")});
  console.log("zone",z,"->",r);
}
await browser.close(); await srv.close();
console.log(errs.length?("ERRORS:\n"+errs.slice(0,10).join("\n")):"no console errors");
