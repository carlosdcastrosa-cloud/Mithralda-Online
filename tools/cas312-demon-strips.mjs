#!/usr/bin/env node
// CAS-312 — bake the board-supplied `dark_demon_3` MOB into the game sprite pipeline.
//
// Board asset (Drive ZIP) = `dark_demon_3/{claw,warlock}/1..6.png`. Each PNG is ONE
// animation FRAME holding a 6-col × N-row sheet of the SAME demon recolored per ROW.
// Cells are 96×96. Row 0 = the upright FRONT view (matches the front-facing roster:
// orc/skel). The 6 source files = 6 colour variants; file 3 = the dark umber demon
// with amber lone-glow eyes (on the cold FOUNTAINS palette; crimson attack telegraphs
// stay high-contrast against it — a crimson body would camouflage its own danger ring).
//
// Mapping (per CAS-311): claw → melee attack strip; warlock → cast/ranged strip.
// Output (drop-in for render/sprites.js ENEMY_STRIPS + ENEMY_IMG):
//   assets/pixellab/fountains/anim/demon_attack.png  (claw, 6f horizontal)
//   assets/pixellab/fountains/anim/demon_cast.png    (warlock, 6f horizontal)
//   assets/pixellab/fountains/enemy_demon.png        (idle cutout = claw frame 0)
//
// Frames are cropped to a UNIFIED content bbox per anim so the demon never jumps, and
// bottom-anchored (feet = bottom row) to match drawEnemy's bottom-anchor blit. Native
// resolution kept (no rescale) so the art ships exactly as the board delivered it.
//
// Usage: node tools/cas312-demon-strips.mjs [colorFile=3] [row=0] [srcDir]
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';

function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decodePNG(buf){let off=8,w=0,h=0,ct=0,idat=[];while(off<buf.length){const len=buf.readUInt32BE(off);const type=buf.toString('ascii',off+4,off+8);const data=buf.subarray(off+8,off+8+len);if(type==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);ct=data[9];}else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;off+=12+len;}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:3;const stride=w*ch;const out=Buffer.alloc(w*h*4);const prev=Buffer.alloc(stride);let p=0;for(let y=0;y<h;y++){const f=raw[p++];const line=Buffer.from(raw.subarray(p,p+stride));p+=stride;for(let x=0;x<stride;x++){const a=x>=ch?line[x-ch]:0;const b=prev[x];const c=x>=ch?prev[x-ch]:0;let v=line[x];if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+paeth(a,b,c))&255;line[x]=v;}line.copy(prev,0);for(let x=0;x<w;x++){const s=x*ch,d=(y*w+x)*4;out[d]=line[s];out[d+1]=line[s+1];out[d+2]=line[s+2];out[d+3]=ch===4?line[s+3]:255;}}return {w,h,rgba:out};}
function crc32(buf){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let crc=0xFFFFFFFF;for(let i=0;i<buf.length;i++)crc=t[(crc^buf[i])&0xFF]^(crc>>>8);return(crc^0xFFFFFFFF)>>>0;}
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length,0);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body),0);return Buffer.concat([len,body,crc]);}
function encodePNG(w,h,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;const stride=w*4;const raw=Buffer.alloc((stride+1)*h);for(let y=0;y<h;y++){raw[y*(stride+1)]=0;rgba.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride);}return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}

const CELL=96, COLS=6, ALPHA=16;
// extract one 96x96 cell (col c, row r) from a decoded sheet -> {rgba(96*96*4)}
function cell(dec,c,r){const out=Buffer.alloc(CELL*CELL*4);for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){const sx=c*CELL+x,sy=r*CELL+y;if(sx>=dec.w||sy>=dec.h)continue;const s=(sy*dec.w+sx)*4,d=(y*CELL+x)*4;out[d]=dec.rgba[s];out[d+1]=dec.rgba[s+1];out[d+2]=dec.rgba[s+2];out[d+3]=dec.rgba[s+3];}return out;}
// unified bbox over a list of 96x96 cell rgbas
function bbox(cells){let minX=CELL,minY=CELL,maxX=-1,maxY=-1;for(const cg of cells)for(let y=0;y<CELL;y++)for(let x=0;x<CELL;x++){if(cg[(y*CELL+x)*4+3]>ALPHA){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}return {minX,minY,maxX,maxY,w:maxX-minX+1,h:maxY-minY+1};}
// build horizontal strip from cells cropped to bb
function strip(cells,bb){const fw=bb.w,fh=bb.h,N=cells.length;const out=Buffer.alloc(fw*N*fh*4);cells.forEach((cg,i)=>{for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){const s=((bb.minY+y)*CELL+(bb.minX+x))*4,d=(y*(fw*N)+(i*fw+x))*4;out[d]=cg[s];out[d+1]=cg[s+1];out[d+2]=cg[s+2];out[d+3]=cg[s+3];}});return {fw,fh,N,rgba:out};}

const FN=process.argv[2]||'3', ROW=+(process.argv[3]||0);
const SRC=process.argv[4]||'/tmp/cas312/extracted/dark_demon_3';
const ANIMDIR='assets/pixellab/fountains/anim';
const CUTDIR='assets/pixellab/fountains';
fs.mkdirSync(ANIMDIR,{recursive:true});

function cellsOf(anim){const dec=decodePNG(fs.readFileSync(`${SRC}/${anim}/${FN}.png`));const cs=[];for(let c=0;c<COLS;c++)cs.push(cell(dec,c,ROW));return cs;}
function writeStrip(cells,bb,outName){const st=strip(cells,bb);const out=path.join(ANIMDIR,outName+'.png');fs.writeFileSync(out,encodePNG(st.fw*st.N,st.fh,st.rgba));console.log(`✓ ${out}  ${st.fw}x${st.fh} ×${st.N}`);return st;}

const clawCells=cellsOf('claw');
const warlCells=cellsOf('warlock');
// JOINT bbox across BOTH anims so claw + cast share identical frame dimensions → render
// (which forces both strips to dh = tpl.size*const) keeps the demon BODY the same size
// when switching melee↔cast. Feet stay bottom-anchored (maxY=64 in both).
const bb=bbox([...clawCells,...warlCells]);
console.log(`joint bbox ${JSON.stringify(bb)}  → frame ${bb.w}x${bb.h}`);
writeStrip(clawCells,bb,'demon_attack');
writeStrip(warlCells,bb,'demon_cast');

// idle cutout = claw frame 0 on the SAME joint bbox → aligns 1:1 with demon_attack
// frame 0 (feet planted) when the ENEMY_IMG breathe path swaps to it.
{
  const fw=bb.w,fh=bb.h;const out=Buffer.alloc(fw*fh*4);const cg=clawCells[0];
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){const s=((bb.minY+y)*CELL+(bb.minX+x))*4,d=(y*fw+x)*4;out[d]=cg[s];out[d+1]=cg[s+1];out[d+2]=cg[s+2];out[d+3]=cg[s+3];}
  const p=path.join(CUTDIR,'enemy_demon.png');
  fs.writeFileSync(p,encodePNG(fw,fh,out));
  console.log(`✓ ${p}  ${fw}x${fh}  (idle cutout = claw frame 0)`);
}
console.log(`\nENEMY_STRIPS.demon: {attack:{key:"demon_attack",fc:6,fw:${bb.w},fh:${bb.h}}, cast:{key:"demon_cast",fc:6,fw:${bb.w},fh:${bb.h}}}`);
