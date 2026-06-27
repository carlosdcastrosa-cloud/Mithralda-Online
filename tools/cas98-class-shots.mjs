// CAS-98 QA harness: capture the class-select screen (per-class art wired to the
// selection cards). Run: node tools/cas98-class-shots.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const exe=findChromium(); const srv=await startServer();
const b=await puppeteer.launch({executablePath:exe,headless:true,args:LAUNCH_ARGS});
const p=await b.newPage(); await p.setViewport({width:1280,height:720,deviceScaleFactor:1});
await p.goto(`${srv.url}/index.html?dev`,{waitUntil:"load"});
await p.bringToFront();
await p.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'",{timeout:15000});
await p.evaluate(()=>{ const i=document.getElementById("nameInput"); i.value="QA"; i.dispatchEvent(new Event("input",{bubbles:true})); window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})); });
await p.waitForFunction("window.__dev.scene()==='classsel'",{timeout:5000});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:join(ROOT,"tools","cas98-classsel.png")});
console.log("✔ class-select screenshot saved");
await b.close(); await srv.close?.(); process.exit(0);
