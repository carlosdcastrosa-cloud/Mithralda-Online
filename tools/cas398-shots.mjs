import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
const url="https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const b=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
await p.goto(`${url}/index.html?dev`,{waitUntil:"load",timeout:45000});
await p.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:25000});
await p.evaluate(()=>{const i=document.getElementById("nameInput");if(i)i.value="Cas398";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
await p.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await p.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
// dismiss tutorial overlay by a couple Enter/space presses so it doesn't cover the view
async function shot(tx,ty,name){ const pos=await p.evaluate((x,y)=>window.__dev.tp(x,y),tx,ty); await new Promise(r=>setTimeout(r,900)); await p.screenshot({path:name}); console.log(name,"hero px",pos); }
await shot(156,165,"/tmp/cas398-town.png");   // centered town
await shot(300,300,"/tmp/cas398-se.png");     // far SE wilderness (tile 300 of 330)
await shot(28,28,"/tmp/cas398-nw.png");       // far NW wilderness
await shot(250,90,"/tmp/cas398-ne.png");      // NE wilderness
await b.close();
