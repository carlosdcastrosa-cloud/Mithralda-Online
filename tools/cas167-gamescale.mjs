// CAS-167: faithful GAME-SCALE montage. Replicates render.js drawHeroClass exactly
// (CLASS_ANIM_SCALE=0.32, CLASS_FW/FH/AX/FOOT, nearest-neighbor) + the per-frame
// walk bob/squash drawHero applies, composited on the real ruins_floor tile — so
// this is precisely what the player sees in-game, frame by frame, for all 5 classes.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const OUT=join(ROOT,"assets","erw","hero","classes");
const classes=["warrior","paladin","mage","druid","priest"];
const b64=(p)=>readFileSync(p).toString("base64");
const tile=b64(join(ROOT,"assets","tiles","ruins_floor.png"));
const data={}; for(const c of classes){data[c]={idle:b64(join(OUT,c+".png")),walk:b64(join(OUT,c+"_walk.png"))};}
const b=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS});
const page=await b.newPage();
const url=await page.evaluate(async(data,tile,classes)=>{
  const CLASS_FW=140,CLASS_FH=166,CLASS_AX=65,CLASS_FOOT=163,S=0.32,WALK_FC=8,IDLE_FC=6;
  async function im(x){const i=new Image();i.src="data:image/png;base64,"+x;await i.decode();return i;}
  const tileI=await im(tile);
  // one game-scale cell, upscaled ZP× for visibility
  const ZP=3, CELLW=70, CELLH=78; // on-screen footprint area
  function drawHero(x,img,fi,walk){
    // mimic drawHero squash/bob for walk; idle gentle
    let bobUp=0,sqX=1,sqY=1;
    if(walk){const phase=(fi/WALK_FC)*Math.PI*2; bobUp=Math.abs(Math.sin(phase))*3; const land=Math.max(0,-Math.sin(phase*2)); sqX=1+0.06*land; sqY=1-0.06*land;}
    else {bobUp=Math.sin(fi/IDLE_FC*Math.PI*2)*0.6; sqY=1+0.012*Math.sin(fi/IDLE_FC*Math.PI*2);}
    const dw=CLASS_FW*S*sqX, dh=CLASS_FH*S*sqY, sx=fi*CLASS_FW;
    const feet=CELLH-8, cxp=CELLW/2;
    const dx=cxp-CLASS_AX*S*sqX, dy=feet-CLASS_FOOT*S*sqY-bobUp;
    return {img,sx,dw,dh,dx,dy};
  }
  const cols=Math.max(IDLE_FC,WALK_FC), pad=6, lab=70;
  const W=lab+cols*(CELLW*ZP+pad)+20, H=classes.length*2*(CELLH*ZP+pad)+30;
  const c=document.createElement("canvas");c.width=W;c.height=H;const x=c.getContext("2d");x.imageSmoothingEnabled=false;
  x.fillStyle="#1b2230";x.fillRect(0,0,W,H);x.font="12px monospace";
  let y=18;
  for(const cls of classes){
    const idleI=await im(data[cls].idle), walkI=await im(data[cls].walk);
    for(const [kind,n,img,walk] of [["idle",IDLE_FC,idleI,false],["walk",WALK_FC,walkI,true]]){
      x.fillStyle="#bdf";x.fillText(cls+" "+kind,4,y+CELLH*ZP/2);
      for(let f=0;f<n;f++){
        const ox=lab+f*(CELLW*ZP+pad);
        // tile bg
        const tc=document.createElement("canvas");tc.width=CELLW;tc.height=CELLH;const tx=tc.getContext("2d");tx.imageSmoothingEnabled=false;
        for(let ty=0;ty<CELLH;ty+=32)for(let txx=0;txx<CELLW;txx+=32)tx.drawImage(tileI,txx,ty,32,32);
        const h=drawHero(0,img,f,walk);
        tx.drawImage(h.img,h.sx,0,CLASS_FW,CLASS_FH,h.dx,h.dy,h.dw,h.dh);
        x.imageSmoothingEnabled=false;x.drawImage(tc,0,0,CELLW,CELLH,ox,y,CELLW*ZP,CELLH*ZP);
        x.fillStyle="rgba(255,255,255,0.5)";x.fillText(kind[0]+f,ox+2,y+12);
      }
      y+=CELLH*ZP+pad;
    }
  }
  return c.toDataURL("image/png");
},data,tile,classes);
writeFileSync(join(ROOT,"tools","cas167-gamescale.png"),Buffer.from(url.split(",")[1],"base64"));
console.log("wrote tools/cas167-gamescale.png");
await b.close();
