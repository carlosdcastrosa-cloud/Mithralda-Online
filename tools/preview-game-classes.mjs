// preview-game-classes.mjs — the 5 ACTUAL game classes side by side: middle idle
// frame at full res (on light stone) + game-scale row, to judge role distinction.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const geom = JSON.parse(readFileSync(join(DIR, "classes.json"), "utf8"));
const { frameW: FW, frameH: FH, anchorX: AX, foot: FOOT, frames: NF } = geom;
const S = 0.32;
const GAME = ["warrior", "paladin", "mage", "druid", "priest"];   // CLASS_LIST
const uris = {}; for (const c of GAME) uris[c] = "data:image/png;base64," + readFileSync(join(DIR, `${c}.png`)).toString("base64");
const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const b64 = await page.evaluate(async (uris, GAME, FW, FH, NF, AX, FOOT, S) => {
  const load = (u)=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=u;});
  const imgs={}; for(const c of GAME) imgs[c]=await load(uris[c]);
  const mid = NF>>1, pad=10, lab=18;
  const c=document.createElement("canvas");
  c.width = GAME.length*(FW+pad); c.height = FH+lab + 130;
  const g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height);
  // full-res middle frame on light stone, labelled
  GAME.forEach((cl,k)=>{ const x=k*(FW+pad);
    g.fillStyle="#c9c2b0"; g.fillRect(x,lab,FW,FH);
    g.imageSmoothingEnabled=false; g.drawImage(imgs[cl], mid*FW,0,FW,FH, x,lab,FW,FH);
    g.fillStyle="#000"; g.font="13px sans-serif"; g.fillText(cl, x+4, 14); });
  // game-scale animated row (all NF frames) on flagstone
  const y0=FH+lab+18, tile=84;
  GAME.forEach((cl,k)=>{ const x=k*(FW+pad);
    for(let f=0; f<NF; f++){ const tx=x+f*(tile/2.4);
      g.fillStyle=(f+k)%2?"#b3a487":"#a59676"; g.fillRect(tx,y0,tile/2.4+1,tile);
      const dw=FW*S, dh=FH*S, cx=tx+ (tile/2.4)/2, feet=y0+tile-8;
      g.imageSmoothingEnabled=false;
      g.drawImage(imgs[cl], f*FW,0,FW,FH, cx-AX*S, feet-FOOT*S, dw,dh); }
  });
  return c.toDataURL("image/png").split(",")[1];
}, uris, GAME, FW, FH, NF, AX, FOOT, S);
const dst = join(ROOT, "tools", "cas101-game-classes.png");
writeFileSync(dst, Buffer.from(b64, "base64")); console.log("wrote", dst);
await browser.close();
