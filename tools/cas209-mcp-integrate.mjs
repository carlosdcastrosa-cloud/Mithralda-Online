#!/usr/bin/env node
// CAS-209 — PixelLab MCP asset downloader + game-strip integrator.
// Polls all in-flight MCP jobs, downloads completed assets, and builds
// horizontal walk-strips (format: ENEMY_STRIP 4-frame 64×64 → 256×64) for
// each mob that the renderer can drop in directly.
//
// Job IDs (queued this heartbeat):
//   Characters (v3, 8-dir, 48px):
//     skel   fe207389-b895-43fc-bec8-0eb8fdc2dbcc
//     bandit fa06c672-5f43-42b1-82b1-9f33c16da155
//     orc    e91c6d80-199c-42d3-b6e7-4c6b65d1abc3
//   Tilesets (32px Wang):
//     floor  cfd5c799-1a1d-4948-b2a5-8115d7700876  (void→stone floor)
//     blood  bf92f57b-ebd6-4586-b1ac-22d61f2ad39e  (floor→blood-stained)
//
// Usage (check status): node tools/cas209-mcp-integrate.mjs --status
// Usage (download all done): node tools/cas209-mcp-integrate.mjs --download
//
// The renderer expects (ENEMY_STRIP in render/sprites.js):
//   assets/pixellab/fountains/anim/<mob>_mcp_walk_strip.png  256×64 (4 frames×64px)
// After verifying quality, rename to <mob>_walk_strip.png to replace REST strips.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const TOKEN = '70aee9a0-4277-441b-bf1f-44de91b14f5c';
const API = 'https://api.pixellab.ai';

const CHARS = {
  skel:   'fe207389-b895-43fc-bec8-0eb8fdc2dbcc',
  bandit: 'fa06c672-5f43-42b1-82b1-9f33c16da155',
  orc:    'e91c6d80-199c-42d3-b6e7-4c6b65d1abc3',
};
const TILESETS = {
  floor: 'cfd5c799-1a1d-4948-b2a5-8115d7700876',
  blood: 'bf92f57b-ebd6-4586-b1ac-22d61f2ad39e',
};

// ---- PNG decode (RGBA flat buffer) ----
function decodePNG(buf) {
  let p=8,W=0,H=0,idat=[],ct=6,bd=8;
  while(p<buf.length){const len=buf.readUInt32BE(p);const type=buf.toString('ascii',p+4,p+8);const data=buf.subarray(p+8,p+8+len);
    if(type==='IHDR'){W=data.readUInt32BE(0);H=data.readUInt32BE(4);bd=data[8];ct=data[9];}
    else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;p+=12+len;}
  const raw=zlib.inflateSync(Buffer.concat(idat));
  const ch=ct===6?4:ct===2?3:ct===0?1:4; const stride=W*ch;
  const out=Buffer.alloc(W*H*4); let pos=0;
  const prev=Buffer.alloc(stride),cur=Buffer.alloc(stride);
  function pa(a,b,c){const p2=a+b-c,pa=Math.abs(p2-a),pb=Math.abs(p2-b),pc=Math.abs(p2-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
  for(let y=0;y<H;y++){const ft=raw[pos++];raw.copy(cur,0,pos,pos+stride);pos+=stride;
    for(let i=0;i<stride;i++){const a=i>=ch?cur[i-ch]:0,b=prev[i],c=i>=ch?prev[i-ch]:0;let v=cur[i];
      if(ft===1)v=(v+a)&255;else if(ft===2)v=(v+b)&255;else if(ft===3)v=(v+((a+b)>>1))&255;else if(ft===4)v=(v+pa(a,b,c))&255;cur[i]=v;}
    for(let x=0;x<W;x++){const si=x*ch,di=(y*W+x)*4;
      if(ch===4){out[di]=cur[si];out[di+1]=cur[si+1];out[di+2]=cur[si+2];out[di+3]=cur[si+3];}
      else if(ch===3){out[di]=cur[si];out[di+1]=cur[si+1];out[di+2]=cur[si+2];out[di+3]=255;}
      else{out[di]=out[di+1]=out[di+2]=cur[si];out[di+3]=255;}}
    cur.copy(prev,0);}
  return{W,H,rgba:out};
}
// ---- PNG encode RGBA ----
function crc32(b){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let cr=0xFFFFFFFF;for(let i=0;i<b.length;i++)cr=t[(cr^b[i])&255]^(cr>>>8);return(cr^0xFFFFFFFF)>>>0;}
function ck(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const bo=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(bo),0);return Buffer.concat([l,bo,c]);}
function encodePNG(W,H,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const st=W*4;const raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}return Buffer.concat([sig,ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]);}

// ---- nearest-neighbor scale ----
function scale(src,sw,sh,nw,nh){const out=Buffer.alloc(nw*nh*4);for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const sx=Math.floor(x*sw/nw),sy=Math.floor(y*sh/nh);const si=(sy*sw+sx)*4,di=(y*nw+x)*4;out[di]=src[si];out[di+1]=src[si+1];out[di+2]=src[si+2];out[di+3]=src[si+3];}return out;}

async function apiGet(path_) {
  const r = await fetch(API+path_, {headers:{Authorization:`Bearer ${TOKEN}`}});
  if(!r.ok){const t=await r.text();throw new Error(`HTTP ${r.status} ${path_}: ${t.slice(0,200)}`);}
  return r.json();
}
async function download(url) {
  const r = await fetch(url);
  if(!r.ok) throw new Error(`download ${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function checkStatus() {
  console.log('\n=== Characters ===');
  for (const [name, id] of Object.entries(CHARS)) {
    try {
      const c = await apiGet(`/mcp/characters/${id}`);
      console.log(`  ${name}: ${c.status} ${c.status==='completed'?'✓ DONE':'...'} ${c.status_pct||''}%`);
      if (c.status === 'completed' && c.animations) {
        for (const [aname, anim] of Object.entries(c.animations)) {
          console.log(`    anim ${aname}: ${anim.status||'?'} dirs: ${Object.keys(anim.directions||{}).join(',')}`);
        }
      }
    } catch(e) { console.log(`  ${name}: ERROR ${e.message.slice(0,80)}`); }
  }
  console.log('\n=== Tilesets ===');
  for (const [name, id] of Object.entries(TILESETS)) {
    try {
      const t = await apiGet(`/mcp/topdown-tilesets/${id}`);
      console.log(`  ${name}: ${t.status} ${t.status_pct||''}% ${t.status==='completed'?'✓ DONE':''}`);
    } catch(e) { console.log(`  ${name}: ERROR ${e.message.slice(0,80)}`); }
  }
}

async function downloadAll() {
  const outDir = 'assets/pixellab/fountains';
  const animDir = path.join(outDir,'anim');
  fs.mkdirSync(animDir, {recursive:true});

  // --- Characters ---
  for (const [name, id] of Object.entries(CHARS)) {
    try {
      const c = await apiGet(`/mcp/characters/${id}`);
      if (c.status !== 'completed') { console.log(`  ${name}: not ready (${c.status})`); continue; }
      // Save directional frames: south = main facing
      for (const [dir, url] of Object.entries(c.rotations||{})) {
        if (!['south','east','north','west'].includes(dir)) continue;
        const buf = await download(url);
        const out = path.join(animDir, `${name}_mcp_${dir}.png`);
        fs.writeFileSync(out, buf);
        const {W,H} = decodePNG(buf);
        console.log(`  ✓ ${name} ${dir}: ${W}×${H} → ${out}`);
      }
      // Build walk strip if animation available
      const anim = c.animations?.walk;
      if (anim && anim.status==='completed') {
        const dirs = ['south','east','north','west'];
        const frames = [];
        for (const dir of dirs) {
          const dirAnim = anim.directions?.[dir];
          if (!dirAnim) continue;
          for (const frameUrl of (dirAnim.frames||[])) {
            const buf = await download(frameUrl);
            frames.push(decodePNG(buf));
          }
        }
        if (frames.length >= 4) {
          // Take first 4 frames (south direction walk), scale to 64×64, build 256×64 strip
          const FW=64, FH=64, NF=Math.min(4,frames.length);
          const strip = Buffer.alloc(FW*NF*FH*4);
          for (let f=0; f<NF; f++) {
            const fr = frames[f];
            const sc = scale(fr.rgba, fr.W, fr.H, FW, FH);
            for (let y=0;y<FH;y++) for(let x=0;x<FW;x++){
              const si=(y*FW+x)*4, di=(y*(FW*NF)+(f*FW+x))*4;
              strip[di]=sc[si];strip[di+1]=sc[si+1];strip[di+2]=sc[si+2];strip[di+3]=sc[si+3];
            }
          }
          const stripPath = path.join(animDir, `${name}_mcp_walk_strip.png`);
          fs.writeFileSync(stripPath, encodePNG(FW*NF, FH, strip));
          console.log(`  ✓ ${name} walk strip → ${stripPath} (${NF} frames from south walk)`);
        }
      } else {
        console.log(`  ${name}: no walk animation yet (${anim?.status||'none'})`);
      }
    } catch(e) { console.log(`  ${name}: ERROR ${e.message.slice(0,120)}`); }
  }

  // --- Tilesets ---
  for (const [name, id] of Object.entries(TILESETS)) {
    try {
      const t = await apiGet(`/mcp/topdown-tilesets/${id}`);
      if (t.status !== 'completed') { console.log(`  tileset ${name}: not ready (${t.status})`); continue; }
      const tileOutDir = path.join(outDir, `tileset_${name}`);
      fs.mkdirSync(tileOutDir, {recursive:true});
      for (const [tid, tileUrl] of Object.entries(t.tiles||{})) {
        const buf = await download(tileUrl);
        fs.writeFileSync(path.join(tileOutDir, `tile_${tid}.png`), buf);
      }
      // Also save the full spritesheet if available
      if (t.spritesheet) {
        const buf = await download(t.spritesheet);
        fs.writeFileSync(path.join(tileOutDir, '_spritesheet.png'), buf);
        const {W,H} = decodePNG(buf);
        console.log(`  ✓ tileset ${name}: ${Object.keys(t.tiles||{}).length} tiles + spritesheet ${W}×${H} → ${tileOutDir}`);
      } else {
        console.log(`  ✓ tileset ${name}: ${Object.keys(t.tiles||{}).length} tiles → ${tileOutDir}`);
      }
    } catch(e) { console.log(`  tileset ${name}: ERROR ${e.message.slice(0,120)}`); }
  }
}

const mode = process.argv[2]||'--status';
if (mode==='--status') checkStatus().catch(e=>{console.error(e);process.exit(1);});
else if (mode==='--download') downloadAll().catch(e=>{console.error(e);process.exit(1);});
else { console.error('usage: --status | --download'); process.exit(1); }
