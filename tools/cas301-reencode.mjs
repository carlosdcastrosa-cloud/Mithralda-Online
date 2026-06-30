// CAS-301 — re-encode a strip frame into a centered NxN transparent canvas (clean PNG
// re-encode; used when PixelLab's decoder rejects a canvas PNG's data stream).
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const [strip, frameStr, outFile, sizeStr, cwStr, chStr] = process.argv.slice(2);
const FI=parseInt(frameStr||"0",10), SZ=parseInt(sizeStr||"166",10), CW=parseInt(cwStr||"140",10), CH=parseInt(chStr||"166",10);
const b64=readFileSync(strip).toString("base64");
const br=await puppeteer.launch({executablePath:findChromium(),args:LAUNCH_ARGS,headless:"new"});
const pg=await br.newPage();
const out=await pg.evaluate(async ({b64,FI,SZ,CW,CH})=>{
  const img=new Image(); await new Promise((s,j)=>{img.onload=s;img.onerror=j;img.src="data:image/png;base64,"+b64;});
  const c=document.createElement("canvas"); c.width=SZ; c.height=SZ; const x=c.getContext("2d"); x.imageSmoothingEnabled=false;
  const ox=Math.floor((SZ-CW)/2), oy=Math.floor((SZ-CH)/2);
  x.drawImage(img, FI*CW,0,CW,CH, ox,oy,CW,CH);
  return c.toDataURL("image/png").split(",")[1];
},{b64,FI,SZ,CW,CH});
await br.close(); writeFileSync(outFile,Buffer.from(out,"base64")); process.stdout.write(out);
