import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import http from "http"; import fs from "fs"; import path from "path";
const dir=process.argv[2], tag=process.argv[3];
const MIME={".html":"text/html",".js":"text/javascript",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".css":"text/css",".mp3":"audio/mpeg",".wav":"audio/wav"};
const srv=http.createServer((req,res)=>{ let f=path.join(dir,decodeURIComponent(req.url.split("?")[0])); if(f.endsWith("/"))f+="index.html";
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end();return;} res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}); res.end(d); });});
await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
const b=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,200)));
await p.goto(`http://127.0.0.1:${port}/index.html?dev`,{waitUntil:"load",timeout:45000});
await p.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:25000});
await p.evaluate(()=>{const i=document.getElementById("nameInput");if(i)i.value="CasAB";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
await p.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await p.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
await new Promise(r=>setTimeout(r,2500)); // let ground images load
async function shot(tx,ty,name){ await p.evaluate((x,y)=>window.__dev.tp(x,y),tx,ty); await new Promise(r=>setTimeout(r,1200)); await p.screenshot({path:name}); }
await shot(28,28,`/tmp/cas423-${tag}-nw.png`);
await shot(156,165,`/tmp/cas423-${tag}-town.png`);
console.log(tag,"errors:",JSON.stringify(errs.slice(0,5)));
await b.close(); srv.close(); process.exit(0);
