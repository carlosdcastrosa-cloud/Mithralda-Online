import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const dir=process.argv[2], out=process.argv[3], order=process.argv.slice(4);
const imgs=order.map(d=>({d,b64:readFileSync(`${dir}/${d}.png`).toString("base64")}));
const br=await puppeteer.launch({executablePath:findChromium(),args:LAUNCH_ARGS,headless:"new"});
const pg=await br.newPage();
const data=await pg.evaluate(async ({imgs})=>{
  const CW=170,CH=170,pad=6,lab=16; const c=document.createElement("canvas");
  c.width=imgs.length*(CW+pad)+pad; c.height=CH+lab+pad*2; const x=c.getContext("2d");
  x.fillStyle="#2a2433"; x.fillRect(0,0,c.width,c.height); x.imageSmoothingEnabled=false;
  for(let i=0;i<imgs.length;i++){ const im=new Image(); await new Promise(r=>{im.onload=r;im.src="data:image/png;base64,"+imgs[i].b64;});
    const px=pad+i*(CW+pad); x.drawImage(im,px,lab); x.fillStyle="#ffd24d"; x.font="12px monospace"; x.textAlign="center"; x.fillText(imgs[i].d,px+CW/2,12);}
  return c.toDataURL("image/png").split(",")[1];
},{imgs});
await br.close(); writeFileSync(out,Buffer.from(data,"base64")); console.log("wrote",out);
