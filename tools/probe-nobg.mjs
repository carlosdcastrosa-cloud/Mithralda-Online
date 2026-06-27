// probe-nobg.mjs — inspect an ML-bg-removed mp4: report dims, corner pixel,
// and whether the matte background is a flat solid color (clean key) or noisy.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const src = process.argv[2] || join(ROOT, "assets/erw/hero/gen/classes/nobg/warrior_nobg.mp4");
const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const uri = "data:video/mp4;base64," + readFileSync(src).toString("base64");

const r = await page.evaluate(async (uri) => {
  const v = document.createElement("video");
  v.muted = true; v.src = uri;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej("video err"); });
  const W = v.videoWidth, H = v.videoHeight;
  await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(1.5, v.duration/2); });
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(v, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  const px = (x,y) => { const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2],d[i+3]]; };
  // sample 4 corners + edges
  const corners = { tl:px(0,0), tr:px(W-1,0), bl:px(0,H-1), br:px(W-1,H-1), mid:px(W>>1,H>>1) };
  // background color = most common border pixel; estimate from corners avg
  const bg = corners.tl;
  // measure spread of border pixels vs bg (is it flat?)
  let maxd=0, n=0, sum=0;
  for (let x=0;x<W;x+=7){ for (const y of [0,H-1]){ const [r,gg,b]=px(x,y);
    const dd=Math.abs(r-bg[0])+Math.abs(gg-bg[1])+Math.abs(b-bg[2]); maxd=Math.max(maxd,dd); sum+=dd; n++; } }
  // content bbox: pixels far from bg color (dist > 60)
  let x0=W,y0=H,x1=-1,y1=-1;
  const far=(x,y)=>{const [r,gg,b]=px(x,y);return (Math.abs(r-bg[0])+Math.abs(gg-bg[1])+Math.abs(b-bg[2]))>60;};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(far(x,y)){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return { W,H, corners, bgAvgBorderDist:Math.round(sum/n), bgMaxBorderDist:maxd, bbox:[x0,y0,x1,y1], duration:v.duration };
}, uri);
console.log(JSON.stringify(r, null, 2));
await browser.close();
