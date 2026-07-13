// CAS-2263 LIVE boot-smoke: verify the badge-dock render fix on the served gh-pages build.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
const U = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT_BUILD = "3ab0de365ccf";
const exe = findChromium(); const sleep = ms => new Promise(r => setTimeout(r, ms));
async function toPlay(p){await p.waitForFunction("window.__dev&&window.__dev.scene&&window.__dev.scene()==='menu'",{timeout:30000});
await p.evaluate(()=>{const ni=document.getElementById("nameInput");if(ni)ni.value="LiveBot";window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true}));});
await p.waitForFunction("window.__dev.scene()==='classsel'",{timeout:8000});
await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit1",key:"1",bubbles:true})));
await p.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())",{timeout:8000});
for(const s of["customize","abilitysel"]){if(await p.evaluate(()=>window.__dev.scene())===s)await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Enter",key:"Enter",bubbles:true})));}
await p.waitForFunction("window.__dev.scene()==='play'",{timeout:8000});await sleep(400);}
async function clearCurse(p){for(let i=0;i<8;i++){if(await p.evaluate(()=>window.__dev.scene())==='play')return;await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape",key:"Escape",bubbles:true})));await sleep(120);}}
async function greenInk(page,VW,R){return await page.evaluate((vw,R)=>{const cv=document.querySelector("canvas");if(!cv)return{n:0,minY:-1};const g=cv.getContext("2d");const dpr=cv.width/vw;const x=Math.max(0,Math.floor(R.x*dpr)),y=Math.max(0,Math.floor(R.y*dpr));const w=Math.min(Math.floor(R.w*dpr),cv.width-x),h=Math.min(Math.floor(R.h*dpr),cv.height-y);if(w<=0||h<=0)return{n:0,minY:-1};const d=g.getImageData(x,y,w,h).data;let n=0,minRow=h;for(let row=0;row<h;row++)for(let col=0;col<w;col++){const i=(row*w+col)*4;if(d[i+3]<40)continue;const r=d[i],gr=d[i+1],b=d[i+2];if(gr>70&&gr>r+14&&gr>b+18&&r<185){n++;if(row<minRow)minRow=row;}}return{n,minY:n?Math.round(y/dpr+minRow/dpr):-1};},VW,R);}
const mmRect=p=>p.evaluate(()=>{const L=window.__uiLayout;const VW=innerWidth;return{x:L.cx("minimap",VW-132,120),y:L.cy("minimap",12,120),w:120,h:120};});
const browser=await puppeteer.launch({executablePath:exe,args:LAUNCH_ARGS,headless:"new"});
const A=[];let ok=true;const P=(n,v)=>{A.push([n,v]);if(!v)ok=false;};
try{
  const page=await browser.newPage();const VW=960,VH=640;await page.setViewport({width:VW,height:VH,deviceScaleFactor:2});
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error"){const t=m.text();if(!/Failed to load resource|net::ERR_|favicon/.test(t))errors.push(t);}});
  const ver=await (await fetch(`${U}/version.json?cb=${Date.now()}`)).json();
  P(`served build === ${EXPECT_BUILD}`,ver.build===EXPECT_BUILD);
  await page.goto(`${U}/index.html?dev=1&cb=${Date.now()}`,{waitUntil:"domcontentloaded",timeout:35000});
  await page.evaluate(()=>{try{window.__uiLayout.reset();}catch(e){}});
  await toPlay(page);
  await page.evaluate(()=>{window.__dev.daynight&&window.__dev.daynight({phase:0.5});window.__dev.weather&&window.__dev.weather(0);});
  const sz=await page.evaluate(()=>window.__dev.safeZone());P("SAFEZONE.enabled LIVE",sz.enabled===true);
  const rst=await page.evaluate(()=>window.__dev.rested());P("RESTED_XP.enabled LIVE",rst.enabled===true);
  const bb=sz.bbox,cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2;
  await page.evaluate((tx,ty)=>window.__dev.tp(tx,ty),Math.round(cx/32),Math.round(cy/32));
  await clearCurse(page);await page.evaluate(()=>window.__dev.rested({setPool:600}));await sleep(350);
  const mm=await mmRect(page);const mmBot=mm.y+mm.h;
  const gBelow=await greenInk(page,VW,{x:mm.x-2,y:mmBot+2,w:mm.w+6,h:92});
  const gOld=await greenInk(page,VW,{x:mm.x,y:Math.round(VH*0.03),w:mm.w,h:40});
  P("LIVE: safe-zone shield ink docks BELOW minimap",gBelow.n>6&&gBelow.minY>mmBot);
  P("LIVE: old top-right spot CLEAR (no minimap overlap)",gOld.n<8);
  await page.screenshot({path:"shots/cas2263/live-hud.png",clip:{x:VW-160,y:0,width:160,height:300}});
  P("0 JS errors",errors.length===0);
  console.log("\nCAS-2263 LIVE boot-smoke (build "+ver.build+")\n");
  for(const[n,v]of A)console.log(`  ${v?"PASS":"FAIL"}  ${n}`);
  if(errors.length)console.log("\n errors:",errors.slice(0,5));
  console.log(`\n  mm=${JSON.stringify(mm)} mmBot=${mmBot} gBelow=${JSON.stringify(gBelow)} gOld=${JSON.stringify(gOld)}`);
}finally{await browser.close();}
console.log("\n"+(ok?"ALL PASS ✅":"FAILURES ❌"));process.exit(ok?0:1);
