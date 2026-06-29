import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer } from "./harness.mjs";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const exe=findChromium(); const srv=await startServer();
const browser=await puppeteer.launch({executablePath:exe,headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const errors=[];
try{
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:720});
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(`${srv.url}/index.html?dev`,{waitUntil:"load",timeout:30000});
  await page.waitForFunction("window.__dev&&window.__dev.scene()==='menu'",{timeout:20000});
  await page.evaluate(()=>{window.__dev.noSave&&window.__dev.noSave();document.getElementById("nameInput").value="QA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
  await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
  await page.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
  await page.evaluate(()=>{try{window.__dev.tpZone&&window.__dev.tpZone("abyss");}catch(e){}});
  await wait(500);
  await page.evaluate(()=>{
    window.__dev.spawn("skeleton",-90,-10);
    window.__dev.spawn("bandit",-30,-10);
    window.__dev.spawn("orc",30,-10);
    window.__dev.spawn("wraith",90,-10);
  });
  await wait(900);
  await page.screenshot({path:"tools/cas206-enemies.png"});
  console.log("[SHOT] tools/cas206-enemies.png");
  console.log(errors.length?`[ERR] ${errors.length}: ${errors.slice(0,3).join(" | ")}`:"[ERR] zero");
}finally{await browser.close();await srv.close();}
