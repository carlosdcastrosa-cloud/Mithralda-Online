#!/usr/bin/env node
// CAS-209 / CAS-203 — PixelLab REST animate-with-text driver (FOUNTAINS).
// Takes a frozen FOUNTAINS character sprite as reference and produces an
// N-frame action cycle (walk/idle), then bakes the frames into a horizontal
// sprite strip drop-in for the renderer.
//
// Usage: node tools/cas209-pixellab-animate.mjs <ref.png> <slug> "<action>" "<description>" [nframes]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const TOKEN = '70aee9a0-4277-441b-bf1f-44de91b14f5c';
const BASE = 'https://api.pixellab.ai/v2';
const STYLE = 'chunky top-down pixel art, cold desaturated dark-fantasy gloom, near-black outlines, dramatic torch light';

// ---- minimal PNG decode (we only need raw RGBA of our own pixflux PNGs) ----
function readPNGSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

// ---- pure-JS RGBA PNG encoder ----
function crc32(buf){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let crc=0xFFFFFFFF;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xFF]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);return Buffer.concat([len,body,crc]);}
function encodePNG(w,h,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;/*RGBA*/const stride=w*4;const raw=Buffer.alloc((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride);}const idat=zlib.deflateSync(raw,{level:9});return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);}

async function main(){
  const [ref, slug, action='walk', desc='armored warrior hero', nframes='4'] = process.argv.slice(2);
  if(!ref||!slug){console.error('usage: node tools/cas209-pixellab-animate.mjs <ref.png> <slug> "<action>" "<description>" [nframes]');process.exit(1);}
  const refBuf = fs.readFileSync(ref);
  const {w,h} = readPNGSize(refBuf);
  const body = {
    image_size:{width:w,height:h},
    description:`${desc}. ${STYLE}`,
    action,
    reference_image:{type:'base64', base64:refBuf.toString('base64')},
    view:'high top-down',
    n_frames:+nframes,
  };
  console.log(`→ animate-with-text ${slug} ${w}x${h} action="${action}" frames=${nframes}`);
  const t0=Date.now();
  const res=await fetch(`${BASE}/animate-with-text`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const txt=await res.text();
  if(!res.ok){console.error(`HTTP ${res.status}: ${txt.slice(0,800)}`);process.exit(1);}
  const json=JSON.parse(txt);
  // discover frame array shape
  const imgs = json.images || json.frames || (json.image?[json.image]:null);
  if(!imgs){console.error('unexpected response keys: '+Object.keys(json).join(','));console.error(JSON.stringify(json).slice(0,500));process.exit(1);}
  const outDir='assets/pixellab/fountains/anim';
  fs.mkdirSync(outDir,{recursive:true});
  // decode each frame PNG to RGBA via sharp-free path: we just re-save individual frames
  const frameBufs = imgs.map(im => Buffer.from(im.base64||im, 'base64'));
  frameBufs.forEach((fb,i)=>fs.writeFileSync(path.join(outDir,`${slug}_f${i}.png`),fb));
  console.log(`✓ ${frameBufs.length} frames → ${outDir}/${slug}_f*.png (${((Date.now()-t0)/1000).toFixed(1)}s) usage=${JSON.stringify(json.usage)}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
