import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const exe=findChromium(); const LIVE="https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:exe,headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const ctx=await b.createBrowserContext(); const page=await ctx.newPage();
await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
await page.goto(LIVE+"/index.html",{waitUntil:"load"});
await page.waitForFunction("window.__hud && window.__hud.isOn");
await page.evaluate(()=>{const n=document.getElementById("nameInput");if(n){n.value="Tester";n.focus();}});
await page.keyboard.press("Enter"); await wait(500);
await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await wait(1100);
const play=await page.evaluate(()=>({scene:window.__hud.state().scene, vis:getComputedStyle(document.getElementById("hud")).visibility}));
console.log("PLAY →", JSON.stringify(play));
for(const [code,key,name] of [["KeyI","i","inventory"],["KeyT","t","talents"],["Escape","Escape","pause"]]){
  await page.evaluate(c=>window.dispatchEvent(new KeyboardEvent("keydown",{code:c,key:c,bubbles:true})),code);
  await wait(450);
  const v=await page.evaluate(()=>({scene:window.__hud.state().scene, vis:getComputedStyle(document.getElementById("hud")).visibility}));
  console.log(name,"→",JSON.stringify(v), v.vis==="hidden"?"✔ HUD hidden":"✖ HUD VISIBLE");
  if(name==="inventory") await page.screenshot({path:"tools/cas337-inv-overlap.png"});
  // close back to play
  await page.evaluate(c=>window.dispatchEvent(new KeyboardEvent("keydown",{code:c,key:c,bubbles:true})),code==="Escape"?"Escape":code);
  await wait(350);
}
const back=await page.evaluate(()=>({scene:window.__hud.state().scene, vis:getComputedStyle(document.getElementById("hud")).visibility}));
console.log("BACK TO PLAY →", JSON.stringify(back), back.vis==="visible"?"✔ restored":"✖ not restored");
await ctx.close(); await b.close();
