// CAS-301 — measure the alpha bbox (figure height/width + foot row) of frame 0 of a strip.
// Used to set the scale target so generated 8-dir facings match the LIVE sprite size.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { readFileSync } from "node:fs";
const [strip, cwStr, chStr] = process.argv.slice(2);
const CW = parseInt(cwStr||"140",10), CH = parseInt(chStr||"166",10);
const b64 = readFileSync(strip).toString("base64");
const br = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless:"new" });
const pg = await br.newPage();
const r = await pg.evaluate(async ({b64,CW,CH})=>{
  const img=new Image(); await new Promise((s,j)=>{img.onload=s;img.onerror=j;img.src="data:image/png;base64,"+b64;});
  const c=document.createElement("canvas"); c.width=CW; c.height=CH; const x=c.getContext("2d");
  x.drawImage(img,0,0,CW,CH,0,0,CW,CH); const d=x.getImageData(0,0,CW,CH).data;
  let minX=CW,minY=CH,maxX=0,maxY=0,n=0;
  for(let y=0;y<CH;y++)for(let xx=0;xx<CW;xx++){const a=d[(y*CW+xx)*4+3]; if(a>16){n++; if(xx<minX)minX=xx; if(xx>maxX)maxX=xx; if(y<minY)minY=y; if(y>maxY)maxY=y;}}
  return {minX,minY,maxX,maxY,w:maxX-minX+1,h:maxY-minY+1,cx:(minX+maxX)/2,foot:maxY,n};
},{b64,CW,CH});
await br.close(); console.log(JSON.stringify(r));
