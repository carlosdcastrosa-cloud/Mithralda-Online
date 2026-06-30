// CAS-345 — slice the PixelLab 8-direction DASH animation into warrior_dash8.png
// (8 rows × Nf, cell 140×166, atan2-bucket row order). Mirrors tools/cas301-slice.mjs but
// emits a *_dash8.png. Per-direction foot anchor is taken from the ROTATION (idle) frame so
// the dash stays planted/consistent with idle8/walk8 (the forward lunge lives in the pose,
// not in canvas translation) — regression-safe presentation.
//   node tools/cas345-dash-slice.mjs <cls> <rotDir> <dashDir> <dashFC>
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [cls, rotDir, dashDir, fcStr] = process.argv.slice(2);
const DASH_FC = parseInt(fcStr || "9", 10);
const CW = 140, CH = 166, AX = 65, FOOT = 163;
const BUCKET_DIRS = ["east","south-east","south","south-west","west","north-west","north","north-east"];
const rd = (p) => readFileSync(p).toString("base64");
const rot = {}; for (const d of BUCKET_DIRS) rot[d] = rd(join(rotDir, d + ".png"));
const dash = {};
for (const d of BUCKET_DIRS) {
  const frames = [];
  for (let f = 0; f < DASH_FC; f++) { const p = join(dashDir, `${d}_${f}.png`); if (existsSync(p)) frames.push(rd(p)); }
  dash[d] = frames;
}
const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });
const page = await browser.newPage();
const out = await page.evaluate(async ({ rot, dash, BUCKET_DIRS, CW, CH, AX, FOOT }) => {
  const load = (b64) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = "data:image/png;base64," + b64; });
  function bbox(im){ const c=document.createElement("canvas"); c.width=im.width; c.height=im.height; const x=c.getContext("2d"); x.imageSmoothingEnabled=false; x.drawImage(im,0,0); const d=x.getImageData(0,0,im.width,im.height).data; let minX=im.width,minY=im.height,maxX=0,maxY=0,n=0; for(let y=0;y<im.height;y++)for(let xx=0;xx<im.width;xx++){ if(d[(y*im.width+xx)*4+3]>16){n++; if(xx<minX)minX=xx; if(xx>maxX)maxX=xx; if(y<minY)minY=y; if(y>maxY)maxY=y;} } return {cx:(minX+maxX)/2,foot:maxY,n}; }
  function place(ctx, im, cx, foot){ const dx=Math.round(AX-cx), dy=Math.round(FOOT-foot); ctx.drawImage(im,dx,dy); }
  const anchors={}; for(const d of BUCKET_DIRS){ anchors[d]=bbox(await load(rot[d])); }
  const fc = Math.max(...BUCKET_DIRS.map(d=>dash[d].length));
  const C=document.createElement("canvas"); C.width=CW*fc; C.height=CH*BUCKET_DIRS.length; const x=C.getContext("2d"); x.imageSmoothingEnabled=false;
  for(let r=0;r<BUCKET_DIRS.length;r++){ const d=BUCKET_DIRS[r]; const a=anchors[d]; for(let f=0;f<dash[d].length;f++){ const im=await load(dash[d][f]); x.save(); x.beginPath(); x.rect(f*CW,r*CH,CW,CH); x.clip(); x.translate(f*CW,r*CH); place(x,im,a.cx,a.foot); x.restore(); } }
  return { url: C.toDataURL("image/png").split(",")[1], fc, anchors };
}, { rot, dash, BUCKET_DIRS, CW, CH, AX, FOOT });
await browser.close();
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
writeFileSync(join(OUT, `${cls}_dash8.png`), Buffer.from(out.url, "base64"));
console.log(`wrote ${cls}_dash8.png (${CW*out.fc}x${CH*8}, 8 rows × ${out.fc}f)`);
console.log("anchors:", JSON.stringify(out.anchors, (k,v)=>typeof v==="number"?Math.round(v):v));
