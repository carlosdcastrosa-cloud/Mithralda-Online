// CAS-292 — Re-bake CONSISTENT, ANIMATED idle/walk/attack/death for the 4 non-warrior
// classes (mage/paladin/druid/priest) from ONE PixelLab character each, so every state is
// the SAME character (kills the CAS-288 "different sprite on attack" morph) while KEEPING
// the rich PixelLab attack/death animation (board directive CAS-290: not the static fallback).
//
// WHY a full re-bake (idle+walk too): today the roster runs on two fighting pipelines —
// the CAS-238 chibi recolor (paladin/druid/priest IDLE) and the coherent PixelLab group
// 61cf6540 (warrior=Clarice + mage). The morph is only fully cured by standardising each
// class on its single PixelLab character, which also unifies the whole 5-class roster on the
// SAME pipeline as the already-approved warrior. CEO signs off on the canonical look (gate).
//
// Sources: per-frame south PNGs from the PixelLab group (same manifest as CAS-253), one
// character per class → idle/walk/attack/death are guaranteed the same character.
//
// Geometry MUST match render.js + the warrior (Clarice) strips:
//   idle/walk  -> fixed 140x166 cell, anchorX=65, foot=163  (CLASS_FW/FH/AX/FOOT)
//   attack/death -> WIDE per-state cell, centroid centred (render CAS-282 auto-detects fw>140
//                   -> ax=fw/2, foot=fh-3) so raised staff/sword + death sprawl never clip.
// ONE per-class internal scale (from idle) is reused for every state so the figure is the
// EXACT same on-screen size whether idling, walking, attacking or dying.
//
// Run:   node tools/cas292-class-pixellab.mjs [--class mage,paladin,druid,priest]
// Writes CANDIDATES to assets/erw/hero/gen/cas292/<cls>_{idle,walk,attack,death}.png
// (staging — does NOT touch the live assets/erw/hero/classes/* until CEO sign-off) plus a
// review sheet cas292-review.png. On approval, Game Engineer promotes + wires + flips
// render.js CLASS_EXTRA_ANIM to include the 4 classes; QA re-tests CAS-290.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT  = join(ROOT, "assets", "erw", "hero", "gen", "cas292");
mkdirSync(OUT, { recursive: true });
const LIVE = join(ROOT, "assets", "erw", "hero", "classes");
const ONLY = (() => { const i = process.argv.indexOf("--class"); return i>=0 ? process.argv[i+1].split(",") : null; })();

const CELL_W=140, CELL_H=166, ANCHOR_X=65, FOOT=163, FIGURE_H=155, BOTTOM_GAP=CELL_H-FOOT;
const OUT_FC = { idle: 6, walk: 8, attack: 6, death: 6 };

const B = "https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627";
const f = (cid, aid, n) => Array.from({length:n}, (_,i)=>`${B}/${cid}/animations/${aid}/south/${i}.png`);
const MANIFEST = {
  mage:    { cid:"92b13fdc-88c4-4e2f-a47e-980b78383f98",
    idle:f("92b13fdc-88c4-4e2f-a47e-980b78383f98","51525263-5498-4c2b-9593-e4aea721200a",4),
    walk:f("92b13fdc-88c4-4e2f-a47e-980b78383f98","c0440edf-4571-41d0-827d-a4addb14a997",6),
    attack:f("92b13fdc-88c4-4e2f-a47e-980b78383f98","4f02abe1-3fb8-4aca-b07e-df85ac2fbfe6",7),
    death:f("92b13fdc-88c4-4e2f-a47e-980b78383f98","a6254906-ce74-43d0-b3f9-c2d54597eff9",9) },
  paladin: { cid:"bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a",
    idle:f("bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a","c668ed82-193d-42c6-879a-a4fbbfed7f21",4),
    walk:f("bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a","9e473fd9-9086-44d7-be48-99de53743797",6),
    attack:f("bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a","685bdb78-6f37-4e2e-88d2-df30da8fafb4",7),
    death:f("bb4f05b9-f34c-4b7f-8ba9-57edd1445f2a","3dae7b4a-f351-46c2-90d9-c8d3b1fb1178",9) },
  druid:   { cid:"56d8490b-8d55-464a-a5de-d50d48a43184",
    idle:f("56d8490b-8d55-464a-a5de-d50d48a43184","d74a4296-4b82-481b-82c8-760e4b2685f5",4),
    walk:f("56d8490b-8d55-464a-a5de-d50d48a43184","3519035d-2d01-42c0-90f2-5bdb75345ee5",6),
    attack:f("56d8490b-8d55-464a-a5de-d50d48a43184","d66352ec-6bda-49e9-9c92-13852f8b1dc1",7),
    death:f("56d8490b-8d55-464a-a5de-d50d48a43184","101c60e2-066f-4df3-9740-006e773f7956",9) },
  priest:  { cid:"18d8c76c-7361-4a82-8d6d-e0dd4cccb910",
    idle:f("18d8c76c-7361-4a82-8d6d-e0dd4cccb910","5947404f-e08c-4200-9da5-9cdb9d86dbeb",4),
    walk:f("18d8c76c-7361-4a82-8d6d-e0dd4cccb910","0396f3ee-6354-4274-bf97-4b24b63b7fbf",6),
    attack:f("18d8c76c-7361-4a82-8d6d-e0dd4cccb910","89ff5918-b3d4-40df-820d-b1909d391bbf",7),
    death:f("18d8c76c-7361-4a82-8d6d-e0dd4cccb910","b0db0e34-a67a-47bb-9812-583d5b4e4066",9) },
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });
page.on("console", m => { if (m.type()==="error") console.error("  [page]", m.text()); });

// fetch a state's frame URLs -> data URLs (network in the page context)
async function fetchFrames(urls){
  return await page.evaluate(async (urls)=>{
    const out=[];
    for(const u of urls){ const r=await fetch(u); const b=await r.blob();
      out.push(await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b);})); }
    return out;
  }, urls);
}

const result = await page.evaluate(async (MANI, CFG, framesByClassState) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, BOTTOM_GAP, OUT_FC } = CFG;
  const load = (du)=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=du;});
  function bboxOf(img){ const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
    const x=c.getContext("2d");x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
    let minX=1e9,minY=1e9,maxX=-1,maxY=-1;
    for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++){ if(d[(y*c.width+i)*4+3]>12){
      if(i<minX)minX=i;if(i>maxX)maxX=i;if(y<minY)minY=y;if(y>maxY)maxY=y;}}
    return maxX<0?null:{minX,minY,maxX,maxY}; }
  function crossBox(imgs){ let b={minX:1e9,minY:1e9,maxX:-1,maxY:-1};
    for(const im of imgs){ const bb=bboxOf(im); if(!bb)continue;
      b.minX=Math.min(b.minX,bb.minX);b.minY=Math.min(b.minY,bb.minY);
      b.maxX=Math.max(b.maxX,bb.maxX);b.maxY=Math.max(b.maxY,bb.maxY);} return b; }

  // fixed-cell strip (idle/walk): figure centred at ANCHOR_X, feet at FOOT, one transform.
  function bakeFixed(imgs, outN, scale, box){
    const figCx=(box.minX+box.maxX)/2, feetY=box.maxY;
    const strip=document.createElement("canvas"); strip.width=CELL_W*outN; strip.height=CELL_H;
    const sx=strip.getContext("2d"); sx.imageSmoothingEnabled=false;
    const sw=imgs[0].naturalWidth, sh=imgs[0].naturalHeight;
    for(let j=0;j<outN;j++){ const si=outN===imgs.length?j:Math.min(imgs.length-1,Math.floor(j*imgs.length/outN));
      const dx=j*CELL_W + ANCHOR_X - Math.round(figCx*scale);
      const dy=FOOT - Math.round(feetY*scale);
      sx.drawImage(imgs[si], dx, dy, Math.round(sw*scale), Math.round(sh*scale)); }
    return strip.toDataURL("image/png");
  }
  // WIDE-cell strip (attack/death): GROUNDED START — anchor by FRAME 0's feet/centroid (a
  // standing windup), keep ONE transform so the swing/fall motion plays out from there, and
  // size the cell to the union footprint. (Cross-frame anchoring floats standing frames when
  // the clip ends airborne/prone — the CAS-253 death glitch; frame-0 anchor fixes it.)
  function bakeWide(imgs, outN, scale, box0){
    const SCR_W=460, SCR_H=320, SCR_CX=SCR_W/2, SCR_FOOT=SCR_H-BOTTOM_GAP;
    const figCx=(box0.minX+box0.maxX)/2, feetY=box0.maxY;
    const sw=imgs[0].naturalWidth, sh=imgs[0].naturalHeight;
    const frames=[]; let uMinX=SCR_W,uMaxX=-1,uMinY=SCR_H;
    for(let j=0;j<outN;j++){ const si=outN===imgs.length?j:Math.min(imgs.length-1,Math.floor(j*imgs.length/outN));
      const cv=document.createElement("canvas");cv.width=SCR_W;cv.height=SCR_H;
      const cx=cv.getContext("2d");cx.imageSmoothingEnabled=false;
      const dx=SCR_CX - figCx*scale, dy=SCR_FOOT - feetY*scale;
      cx.drawImage(imgs[si], dx, dy, sw*scale, sh*scale);
      frames.push(cv);
      const d=cx.getImageData(0,0,SCR_W,SCR_H).data;
      for(let y=0;y<SCR_H;y++)for(let i=0;i<SCR_W;i++){ if(d[(y*SCR_W+i)*4+3]>12){
        if(i<uMinX)uMinX=i;if(i>uMaxX)uMaxX=i;if(y<uMinY)uMinY=y;}}
    }
    if(uMaxX<0){uMinX=SCR_CX-30;uMaxX=SCR_CX+30;uMinY=SCR_FOOT-100;}
    const PAD_X=8, PAD_Y=6;
    let halfW=Math.max(SCR_CX-uMinX,uMaxX-SCR_CX)+PAD_X;
    let cellW=Math.ceil(halfW)*2; if(cellW%2)cellW++; if(cellW<=CELL_W)cellW=CELL_W+2;
    let cellH=Math.ceil((SCR_FOOT-uMinY)+PAD_Y+BOTTOM_GAP); if(cellH<CELL_H)cellH=CELL_H;
    const strip=document.createElement("canvas"); strip.width=cellW*outN; strip.height=cellH;
    const sx=strip.getContext("2d"); sx.imageSmoothingEnabled=false;
    for(let j=0;j<outN;j++) sx.drawImage(frames[j], SCR_CX-cellW/2, SCR_FOOT-(cellH-BOTTOM_GAP), cellW, cellH, j*cellW, 0, cellW, cellH);
    return { dataUrl: strip.toDataURL("image/png"), cellW, cellH };
  }

  const out={};
  for(const cls in MANI){
    const states=framesByClassState[cls];
    const idleImgs=await Promise.all(states.idle.map(load));
    const idleBox=crossBox(idleImgs);
    const scale=Math.min(FIGURE_H/(idleBox.maxY-idleBox.minY+1), 2.0);
    const r={ scale:+scale.toFixed(3) };
    // idle / walk -> fixed
    r.idle = bakeFixed(idleImgs, OUT_FC.idle, scale, idleBox);
    const walkImgs=await Promise.all(states.walk.map(load));
    r.walk = bakeFixed(walkImgs, OUT_FC.walk, scale, crossBox(walkImgs));
    // attack / death -> wide
    const atkImgs=await Promise.all(states.attack.map(load));
    const aw=bakeWide(atkImgs, OUT_FC.attack, scale, bboxOf(atkImgs[0])); r.attack=aw.dataUrl; r.attackCell=aw.cellW+"x"+aw.cellH;
    const deImgs=await Promise.all(states.death.map(load));
    const dw=bakeWide(deImgs, OUT_FC.death, scale, bboxOf(deImgs[0])); r.death=dw.dataUrl; r.deathCell=dw.cellW+"x"+dw.cellH;
    out[cls]=r;
  }
  return out;
}, MANIFEST, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, BOTTOM_GAP, OUT_FC },
   await (async()=>{ const o={}; for(const cls in MANIFEST){ if(ONLY&&!ONLY.includes(cls))continue;
     o[cls]={ idle:await fetchFrames(MANIFEST[cls].idle), walk:await fetchFrames(MANIFEST[cls].walk),
       attack:await fetchFrames(MANIFEST[cls].attack), death:await fetchFrames(MANIFEST[cls].death) }; } return o; })());

const SUF={ idle:"_idle", walk:"_walk", attack:"_attack", death:"_death" };
let total=0;
for(const cls in result){ const r=result[cls];
  for(const st of Object.keys(SUF)){ const buf=Buffer.from(r[st].split(",")[1],"base64");
    writeFileSync(join(OUT, cls+SUF[st]+".png"), buf); total+=buf.length; }
  console.log(`  ${cls.padEnd(8)} scale=${r.scale}  attack=${r.attackCell}  death=${r.deathCell}`);
}
console.log(`wrote ${(total/1024|0)}KB candidate strips to ${OUT}`);
await browser.close();
console.log("done.");
