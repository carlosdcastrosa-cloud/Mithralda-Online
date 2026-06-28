// CAS-167 LOCAL in-game proof: boot the repo build, select each class, walk, and
// capture frames at REAL game scale (no deploy needed). Tiles a contact sheet.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const CLASSES=[["warrior","Digit1"],["paladin","Digit2"],["mage","Digit3"],["druid","Digit4"],["priest","Digit5"]];
const srv=await startServer(ROOT);
const browser=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS,protocolTimeout:120000});
async function gameFrame(page){const dl=Date.now()+25000;while(Date.now()<dl){for(const f of page.frames()){try{if(await f.evaluate(()=>!!(window.__dev&&window.__dev.scene)))return f;}catch{}}await sleep(200);}throw new Error("no frame");}
const key=(fr,c,t="keydown")=>fr.evaluate((c,t)=>window.dispatchEvent(new KeyboardEvent(t,{code:c,key:c.replace("Digit",""),bubbles:true})),c,t);
const shots={};
for(const [name,code] of CLASSES){
  const ctx=await browser.createBrowserContext();
  const page=await ctx.newPage();
  await page.setViewport({width:900,height:600,deviceScaleFactor:2});
  await page.goto(`${srv.url}/index.html?dev`,{waitUntil:"networkidle2",timeout:45000});
  const fr=await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'",{timeout:20000});
  await fr.evaluate(()=>{const el=document.getElementById("nameInput"); if(el) el.value="Art"; window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
  await fr.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
  await key(fr,code);
  await fr.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});
  await sleep(400);
  // hold move, capture 4 walking frames
  await key(fr,"KeyD","keydown");
  for(let i=0;i<4;i++){ await sleep(140); await page.screenshot({path:join(ROOT,"tools",`_shot_${name}_w${i}.png`),clip:{x:300,y:210,width:320,height:240}}); }
  await key(fr,"KeyD","keyup");
  await sleep(300);
  await page.screenshot({path:join(ROOT,"tools",`_shot_${name}_idle.png`),clip:{x:300,y:210,width:320,height:240}});
  console.log("captured",name);
  await page.close(); await ctx.close();
}
// assemble sheet from disk
import { readFileSync } from "node:fs";
const page=await browser.newPage();
const names=CLASSES.map(c=>c[0]);
const data={};
for(const n of names){ data[n]=[0,1,2,3].map(i=>readFileSync(join(ROOT,"tools",`_shot_${n}_w${i}.png`)).toString("base64")).concat([readFileSync(join(ROOT,"tools",`_shot_${n}_idle.png`)).toString("base64")]); }
const url=await page.evaluate(async(data,names)=>{
  async function im(b){const i=new Image();i.src="data:image/png;base64,"+b;await i.decode();return i;}
  const cw=180,ch=200,pad=8,lab=70,cols=5;
  const W=lab+cols*(cw+pad)+20,H=names.length*(ch+pad)+30;
  const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");
  x.fillStyle="#222a36";x.fillRect(0,0,W,H);x.font="13px monospace";
  let y=20;
  for(const cls of names){ x.fillStyle="#dfe";x.fillText(cls,6,y+ch/2);
    const arr=data[cls];
    for(let f=0;f<5;f++){const img=await im(arr[f]);x.drawImage(img,lab+f*(cw+pad),y);x.fillStyle=f<4?"#8af":"#fc8";x.fillText(f<4?("walk"+(f+1)):"idle",lab+f*(cw+pad)+4,y+14);}
    y+=ch+pad; }
  return c.toDataURL("image/png");
},data,names);
writeFileSync(join(ROOT,"tools","cas167-ingame.png"),Buffer.from(url.split(",")[1],"base64"));
console.log("sheet written tools/cas167-ingame.png");
await browser.close(); await srv.close();
