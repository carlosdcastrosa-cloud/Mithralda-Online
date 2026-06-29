#!/usr/bin/env node
// CAS-203 — PixelLab animate-with-text-v3 driver (FOUNTAINS).
// Takes a frozen FOUNTAINS base sprite (PNG, e.g. from tools/cas200-pixellab.mjs)
// and produces an 8-12 frame action cycle, then bakes the frames into a single
// horizontal sprite strip that drops straight into the renderer's drawAnim path.
//
// v3 is async: POST /animate-with-text-v3 -> background_job_id, then poll
// GET /background-jobs/{id} until status=completed; frames arrive base64 in
// last_response. Self-contained: pure-JS PNG decode (inflate+unfilter) + RGBA
// encode, no native deps.
//
// Usage: node tools/cas203-pixellab-animate.mjs <ref.png> <slug> "<action>" [frames]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const TOKEN = '70aee9a0-4277-441b-bf1f-44de91b14f5c';
const BASE = 'https://api.pixellab.ai/v2';

// ---------- PNG encode (RGBA) ----------
function crc32(buf){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let crc=0xFFFFFFFF;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xFF]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);return Buffer.concat([len,body,crc]);}
function encodePNG(w,h,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;const stride=w*4;const raw=Buffer.alloc((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride);}return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}

// ---------- PNG decode -> {w,h,rgba} (8-bit, colour types 2/6, filters 0-4) ----------
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePNG(buf){
  let off=8, w=0,h=0,ct=0,idat=[];
  while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString('ascii',off+4,off+8);const data=buf.subarray(off+8,off+8+len);
    if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);ct=data[9];}
    else if(type==='IDAT')idat.push(data);
    else if(type==='IEND')break;
    off+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch=ct===6?4:3;const stride=w*ch;const out=Buffer.alloc(w*h*4);
  const prev=Buffer.alloc(stride);
  let p=0;
  for(let y=0;y<h;y++){const f=raw[p++];const line=Buffer.from(raw.subarray(p,p+stride));p+=stride;
    for(let x=0;x<stride;x++){const a=x>=ch?line[x-ch]:0;const b=prev[x];const c=x>=ch?prev[x-ch]:0;let v=line[x];
      if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+paeth(a,b,c))&255;line[x]=v;}
    line.copy(prev,0);
    for(let x=0;x<w;x++){const s=x*ch,d=(y*w+x)*4;out[d]=line[s];out[d+1]=line[s+1];out[d+2]=line[s+2];out[d+3]=ch===4?line[s+3]:255;}
  }
  return {w,h,rgba:out};
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function main(){
  const [ref, slug, action='idle breathing', frames='8'] = process.argv.slice(2);
  if(!ref||!slug){console.error('usage: node tools/cas203-pixellab-animate.mjs <ref.png> <slug> "<action>" [frames]');process.exit(1);}
  const refBuf=fs.readFileSync(ref);
  const {w,h}=decodePNG(refBuf);
  let fc=+frames; if(fc%2)fc++; fc=Math.max(4,Math.min(16,fc));
  const body={ first_frame:{type:'base64',base64:refBuf.toString('base64')}, action, frame_count:fc, no_background:true, enhance_prompt:true };
  console.log(`→ animate-with-text-v3 ${slug} ${w}x${h} action="${action}" frames=${fc}`);
  const t0=Date.now();
  let res=await fetch(`${BASE}/animate-with-text-v3`,{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let txt=await res.text();
  if(!res.ok){console.error(`HTTP ${res.status}: ${txt.slice(0,600)}`);process.exit(1);}
  const job=JSON.parse(txt); const jid=job.background_job_id;
  console.log(`  job ${jid} status=${job.status}`);
  // poll
  let last=null;
  for(let i=0;i<60;i++){
    await sleep(3000);
    res=await fetch(`${BASE}/background-jobs/${jid}`,{headers:{Authorization:`Bearer ${TOKEN}`}});
    const j=JSON.parse(await res.text());
    process.stdout.write(`  poll ${i} status=${j.status}\r`);
    if(j.status==='completed'||j.status==='failed'){last=j;console.log('');break;}
  }
  if(!last||last.status!=='completed'){console.error('job did not complete:',JSON.stringify(last).slice(0,500));process.exit(1);}
  const lr=last.last_response||{};
  // find the frames array (base64 images) in last_response
  let arr=lr.images||lr.frames||lr.animation||(lr.result&&(lr.result.images||lr.result.frames));
  if(!arr){ // search nested for first array of {base64}/strings
    const stack=[lr]; while(stack.length){const o=stack.pop(); if(Array.isArray(o)&&o.length&&(o[0].base64||typeof o[0]==='string')){arr=o;break;} if(o&&typeof o==='object')for(const v of Object.values(o))if(v&&typeof v==='object')stack.push(v);} }
  if(!arr){console.error('no frames in last_response. keys=',JSON.stringify(Object.keys(lr)));console.error(JSON.stringify(lr).slice(0,800));process.exit(1);}
  const b64s=arr.map(f=>f.base64||f.image?.base64||f);
  console.log(`  got ${b64s.length} frames in ${((Date.now()-t0)/1000).toFixed(1)}s usage=${JSON.stringify(last.usage)}`);
  // decode all, assemble horizontal strip
  const dec=b64s.map(b=>decodePNG(Buffer.from(b,'base64')));
  const fw=dec[0].w, fh=dec[0].h, N=dec.length;
  const strip=Buffer.alloc(fw*N*fh*4);
  dec.forEach((d,i)=>{ for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){const s=(y*d.w+x)*4,t=(y*(fw*N)+(i*fw+x))*4;strip[t]=d.rgba[s];strip[t+1]=d.rgba[s+1];strip[t+2]=d.rgba[s+2];strip[t+3]=d.rgba[s+3];} });
  const outDir='assets/pixellab/fountains/anim'; fs.mkdirSync(outDir,{recursive:true});
  const stripPath=path.join(outDir,`${slug}_${action.split(' ')[0]}.png`);
  fs.writeFileSync(stripPath,encodePNG(fw*N,fh,strip));
  // also dump frame0 + a mid frame for quick visual diff
  fs.writeFileSync(path.join(outDir,`${slug}_${action.split(' ')[0]}_f0.png`),encodePNG(fw,fh,Buffer.from(dec[0].rgba)));
  console.log(`✓ strip ${stripPath}  (${fw}x${fh} x${N} frames)`);
  console.log(`  ANIM cell: fw=${fw} fh=${fh} fc=${N}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
