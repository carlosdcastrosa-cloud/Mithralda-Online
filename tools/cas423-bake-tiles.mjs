// CAS-423: rebuild the ground tiles from the CAS-77 originals with a MILD cold grade —
// the CAS-209 "cold-gloom in-place reskin" crushed them to near-black (board: "mapa negro").
// Grade = multiply by a cool grey-green, keeps ~65-70% brightness so grass READS as grass.
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import fs from "fs";
const b=await puppeteer.launch({executablePath:findChromium(),headless:true,args:LAUNCH_ARGS});
const p=await b.newPage();
const jobs=[["ruins_grass","#aab8a2"],["ruins_grass2","#aab8a2"],["ruins_floor","#a8b0b8"],["ruins_floor2","#a8b0b8"]];
for(const [name,tint] of jobs){
  const src=fs.readFileSync(`/tmp/cas423-orig/${name}.png`).toString("base64");
  const out=await p.evaluate(async (src,tint)=>{
    const im=new Image(); im.src="data:image/png;base64,"+src; await im.decode();
    const cv=document.createElement("canvas"); cv.width=im.width; cv.height=im.height;
    const g=cv.getContext("2d"); g.imageSmoothingEnabled=false;
    g.drawImage(im,0,0);
    g.globalCompositeOperation="multiply"; g.fillStyle=tint; g.fillRect(0,0,cv.width,cv.height);
    g.globalCompositeOperation="destination-in"; g.drawImage(im,0,0); // keep original alpha
    return cv.toDataURL("image/png").split(",")[1];
  },src,tint);
  fs.writeFileSync(`assets/tiles/${name}.png`, Buffer.from(out,"base64"));
  console.log("baked",name);
}
await b.close();
