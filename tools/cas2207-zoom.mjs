import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
const { url, close } = await startServer(ROOT);
const b = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const p = await b.newPage();
await p.setViewport({width:1280,height:720,deviceScaleFactor:2});
await p.goto(url+"/index.html?dev",{waitUntil:"load",timeout:30000});
await p.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:20000});
await new Promise(r=>setTimeout(r,3000));
await p.evaluate(()=>{window.__dev.clearSave();window.__dev.noSave();});
await p.evaluate(()=>{document.getElementById("nameInput").value="QA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
await p.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await p.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())",{timeout:8000});
if(await p.evaluate(()=>window.__dev.scene())==="customize")await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));
await p.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())",{timeout:8000});
if(await p.evaluate(()=>window.__dev.scene())==="abilitysel")await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));
await p.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
// spawn a lone skeleton to the right of the hero, let it walk toward hero (walk anim)
await p.evaluate(()=>window.__dev.spawn("skeleton",90,0));
await new Promise(r=>setTimeout(r,900));
// center crop around screen middle (hero-centered camera). viewport 1280x720 *2 dpr.
const W=1280,H=720;
await p.screenshot({path:join(ROOT,"shots/cas2207/zoom-skel.png"),clip:{x:W*0.30,y:H*0.22,width:W*0.42,height:H*0.5}});
// nova: switch mage + cast, capture the burst centered on hero
await p.evaluate(()=>{try{window.__dev.setClass("mage");window.__dev.clearSpellCD&&window.__dev.clearSpellCD();}catch(e){}});
await new Promise(r=>setTimeout(r,150));
await p.evaluate(()=>{try{window.__dev.cast(0);}catch(e){}});
await new Promise(r=>setTimeout(r,90));
await p.screenshot({path:join(ROOT,"shots/cas2207/zoom-nova.png"),clip:{x:W*0.32,y:H*0.24,width:W*0.36,height:H*0.44}});
await b.close(); await close();
console.log("zoom shots saved");
