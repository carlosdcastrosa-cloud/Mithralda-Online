// CAS-167 live ART-QA: drive the deployed customization (backup host serves the
// game DIRECTLY, no iframe) and capture MY part art rendering live — default,
// recolor (setPartColor), and the variations (helmet, long-cape) via dev hooks.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const CLIP={x:350,y:195,width:210,height:235};
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
const page=await browser.newPage();
await page.setViewport({width:900,height:600,deviceScaleFactor:2});
const errs=[]; page.on("pageerror",e=>errs.push(String(e)));
await page.goto(`${BASE}/index.html?dev`,{waitUntil:"networkidle2",timeout:60000});
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'",{timeout:25000});
await page.evaluate(()=>{const el=document.getElementById("nameInput");if(el)el.value="ArtQA";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
await page.waitForFunction("window.__dev.scene()==='classsel'",{timeout:10000});
page.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await page.waitForFunction("window.__dev.scene()==='play'",{timeout:10000});
await sleep(500);
const shots={};
await page.screenshot({clip:CLIP,path:join(ROOT,"tools","_q_default.png")});
// recolor: cloak gold + sash cyan + legs tan
await page.evaluate(()=>{window.__dev.setPartColor("cloak",[210,170,70]);window.__dev.setPartColor("sash",[60,200,230]);window.__dev.setPartColor("legs",[150,120,80]);});
await sleep(400); await page.screenshot({clip:CLIP,path:join(ROOT,"tools","_q_recolor.png")});
// headwear -> helmet
await page.evaluate(()=>window.__dev.cycleVariation("headwear",1));
await sleep(400); await page.screenshot({clip:CLIP,path:join(ROOT,"tools","_q_helmet.png")});
// cape -> longcape (cape order [cape,nocape,longcape])
await page.evaluate(()=>{window.__dev.cycleVariation("cape",1);window.__dev.cycleVariation("cape",1);});
await sleep(400); await page.screenshot({clip:CLIP,path:join(ROOT,"tools","_q_longcape.png")});
// state dump
const state=await page.evaluate(()=>window.__dev.customizeState());
console.log("customizeState:",JSON.stringify(state));
console.log("pageerrors:",errs.length);
// montage from disk
import { readFileSync } from "node:fs";
const keys=["default","recolor","helmet","longcape"];
const data={};for(const k of keys)data[k]=readFileSync(join(ROOT,"tools","_q_"+k+".png")).toString("base64");
const url=await page.evaluate(async(data,keys)=>{
  async function im(b){const i=new Image();i.src="data:image/png;base64,"+b;await i.decode();return i;}
  const labels={default:"default warrior",recolor:"recolor cloak/sash/legs",helmet:"VAR helmet",longcape:"VAR long-cape"};
  const cw=210,ch=235,pad=8;const W=keys.length*(cw+pad)+pad,H=ch+40;
  const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  x.fillStyle="#1b2230";x.fillRect(0,0,W,H);x.font="13px monospace";
  for(let k=0;k<keys.length;k++){const img=await im(data[keys[k]]);const ox=pad+k*(cw+pad);x.drawImage(img,ox,28,cw,ch);x.fillStyle="#bdf";x.fillText(labels[keys[k]],ox,18);}
  return c.toDataURL("image/png");
},data,keys);
writeFileSync(join(ROOT,"tools","cas167-live-art-qa.png"),Buffer.from(url.split(",")[1],"base64"));
console.log("wrote tools/cas167-live-art-qa.png");
await browser.close();
