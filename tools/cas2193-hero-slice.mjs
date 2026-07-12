// CAS-2193 — AD→GE hero handoff: slice PixelLab "Mithralda Warrior" (c19a526a)
// animation frames into GAME-READY horizontal strips matching render/sprites.js CLS.
//   {class}_{state}_{dir}.png  (dir down=south / up=north / side=east, left=mirrored)
// Uniform GLOBAL transform (one scale + one foot-line + one center-x across ALL frames)
// so the walk/attack/idle animations stay coherent — no per-frame size jitter, feet
// bottom-anchored, transparent bg. PNG codec reused from tools/cas209-build-strip.mjs.
import fs from 'node:fs'; import zlib from 'node:zlib';
function decodePNG(buf){let p=8,W=0,H=0,idat=[],ct=6;while(p<buf.length){const len=buf.readUInt32BE(p);const t=buf.toString('ascii',p+4,p+8);const d=buf.subarray(p+8,p+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);ct=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+len;}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:1;const st=W*ch;const out=Buffer.alloc(W*H*4);let pos=0;const pv=Buffer.alloc(st),cu=Buffer.alloc(st);const pa=(a,b,c)=>{const q=a+b-c,x=Math.abs(q-a),y=Math.abs(q-b),z=Math.abs(q-c);return x<=y&&x<=z?a:y<=z?b:c;};for(let y=0;y<H;y++){const f=raw[pos++];raw.copy(cu,0,pos,pos+st);pos+=st;for(let i=0;i<st;i++){const a=i>=ch?cu[i-ch]:0,b=pv[i],c=i>=ch?pv[i-ch]:0;let v=cu[i];if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+pa(a,b,c))&255;cu[i]=v;}for(let x=0;x<W;x++){const s=x*ch,di=(y*W+x)*4;if(ch===4){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=cu[s+3];}else if(ch===3){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=255;}else{out[di]=out[di+1]=out[di+2]=cu[s];out[di+3]=255;}}cu.copy(pv);}return{W,H,rgba:out};}
function crc32(b){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let cr=0xFFFFFFFF;for(let i=0;i<b.length;i++)cr=t[(cr^b[i])&255]^(cr>>>8);return(cr^0xFFFFFFFF)>>>0;}
function ck(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const bo=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(bo),0);return Buffer.concat([l,bo,c]);}
function encodePNG(W,H,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const st=W*4;const raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}return Buffer.concat([sig,ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]);}
async function dl(u){const r=await fetch(u);if(!r.ok)throw new Error('dl '+r.status+' '+u);return Buffer.from(await r.arrayBuffer());}

let FW=64; const FH=64, PAD=5; // FW widened dynamically so the attack swing never clips
const BASE="https://backblaze.pixellab.ai/file/pixellab-characters/3222372a-afd8-4fcd-b8d6-f6dd4738a627/c19a526a-31fa-4aa9-9347-0446f5494769/";
// dir game-name -> pixellab dir key
const DIRS={ down:"south", up:"north", side:"east" };
// per (state,dir) the animation uuid + frame count. attack = "heavy overhead broadsword slash".
const ANIM={
  walk:   { down:["f2a1c367-4b45-42eb-a53e-827cdff573f7",6], up:["a41846c9-0140-45a2-9b0b-1de566dfae44",6], side:["2d80d6d6-8ebe-429a-a881-47ef395b658f",6] },
  attack: { down:["a6d50cea-67d4-44f6-b733-4846f2473abf",9], up:["d978f8fc-b83f-47f3-85fe-fbbcbebc782a",9], side:["40e376ab-1f0b-4d38-92f5-3dc21f41bed4",9] },
};
function animURL(dir,uuid,i){ return `${BASE}animations/${uuid}/${DIRS[dir]}/${i}.png`; }
function rotURL(dir){ return `${BASE}rotations/${DIRS[dir]}.png`; }

function bbox(rgba,W,H){ let x0=W,y0=H,x1=-1,y1=-1; for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(rgba[(y*W+x)*4+3]>16){ if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y; } } return {x0,y0,x1,y1}; }
// place a source frame onto FWxFH using a FIXED global transform (scale, gcx, gfeet).
function place(src,W,H,scale,gcx,gfeet,dy){ const out=Buffer.alloc(FW*FH*4);
  for(let sy=0;sy<H;sy++)for(let sx=0;sx<W;sx++){ const si=(sy*W+sx)*4; if(src[si+3]===0)continue;
    const dx=Math.round((sx-gcx)*scale + FW/2);
    const dyy=Math.round((sy-gfeet)*scale + (FH-PAD) + (dy||0));
    if(dx<0||dyy<0||dx>=FW||dyy>=FH)continue; const di=(dyy*FW+dx)*4;
    out[di]=src[si];out[di+1]=src[si+1];out[di+2]=src[si+2];out[di+3]=src[si+3]; }
  return out; }
function writeStrip(name,frames){ const N=frames.length; const strip=Buffer.alloc(FW*N*FH*4);
  for(let f=0;f<N;f++)for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){ const si=(y*FW+x)*4, di=(y*(FW*N)+(f*FW+x))*4;
    strip[di]=frames[f][si];strip[di+1]=frames[f][si+1];strip[di+2]=frames[f][si+2];strip[di+3]=frames[f][si+3]; }
  const out=`assets/class/${name}.png`; fs.writeFileSync(out,encodePNG(FW*N,FH,strip));
  console.log(`  ✓ ${name}: ${N}f → ${out} (${FW*N}x${FH})`); return N; }

(async()=>{
  const CLASS=process.argv[2]||"warrior";
  console.log(`CAS-2193 slice ${CLASS} (PixelLab c19a526a) → assets/class/  frame ${FW}x${FH}`);
  // 1) download every source frame once
  const store={}; // key `${state}_${dir}` -> [decoded...]
  const rot={};
  for(const dir of Object.keys(DIRS)){
    for(const state of Object.keys(ANIM)){
      const [uuid,fc]=ANIM[state][dir]; const arr=[];
      for(let i=0;i<fc;i++){ const d=decodePNG(await dl(animURL(dir,uuid,i))); arr.push(d); }
      store[`${state}_${dir}`]=arr;
    }
    rot[dir]=decodePNG(await dl(rotURL(dir)));
  }
  // 2) Scale from the BODY (walk+idle+rotation) so the standing silhouette fills the frame;
  //    the attack swing (wide sword arc) only dictates FW so it never clips.
  const bodyFrames=[...store['walk_down'],...store['walk_up'],...store['walk_side'],...Object.values(rot)];
  let BX0=1e9,BY0=1e9,BX1=-1,BY1=-1;
  for(const d of bodyFrames){ const b=bbox(d.rgba,d.W,d.H); if(b.x1<0)continue;
    BX0=Math.min(BX0,b.x0);BY0=Math.min(BY0,b.y0);BX1=Math.max(BX1,b.x1);BY1=Math.max(BY1,b.y1); }
  const gcx=(BX0+BX1)/2, gfeet=BY1, bodyH=BY1-BY0+1;
  const scale=(FH-2*PAD)/bodyH;
  // full horizontal extent across EVERY frame (incl. attack) → symmetric FW that fits the swing
  let maxHalf=0;
  for(const d of [...Object.values(store).flat(), ...Object.values(rot)]){ const b=bbox(d.rgba,d.W,d.H); if(b.x1<0)continue;
    maxHalf=Math.max(maxHalf,(b.x1-gcx)*scale,(gcx-b.x0)*scale); }
  FW=Math.min(88, Math.max(64, Math.ceil((maxHalf+PAD)*2/8)*8)); // multiple of 8, cap 88 (widest sword tip may clip a few px)
  console.log(`  body bbox ${BX1-BX0+1}x${bodyH} center-x ${gcx.toFixed(1)} scale=${scale.toFixed(3)} → char h≈${Math.round(bodyH*scale)}px; FW=${FW}`);
  // 3) emit strips. idle = 2f breathing bob from the neutral rotation pose (dy 0 / -1).
  const counts={idle:0,walk:0,attack:0};
  for(const dir of Object.keys(DIRS)){
    counts.walk  = writeStrip(`${CLASS}_walk_${dir}`,  store[`walk_${dir}`].map(d=>place(d.rgba,d.W,d.H,scale,gcx,gfeet,0)));
    counts.attack= writeStrip(`${CLASS}_attack_${dir}`,store[`attack_${dir}`].map(d=>place(d.rgba,d.W,d.H,scale,gcx,gfeet,0)));
    const r=rot[dir]; counts.idle = writeStrip(`${CLASS}_idle_${dir}`,[ place(r.rgba,r.W,r.H,scale,gcx,gfeet,0), place(r.rgba,r.W,r.H,scale,gcx,gfeet,-1) ]);
  }
  // 4) frame-data JSON (sprites.js CLS style, single fw/fh)
  const fd={ [CLASS]:{ fc:{idle:counts.idle,walk:counts.walk,attack:counts.attack}, fw:FW, fh:FH } };
  fs.mkdirSync('shots/cas2193',{recursive:true});
  fs.writeFileSync(`shots/cas2193/${CLASS}_framedata.json`, JSON.stringify(fd,null,2));
  console.log(`  ✓ frame-data → shots/cas2193/${CLASS}_framedata.json`);
  console.log(JSON.stringify(fd));
})().catch(e=>{console.error(e);process.exit(1);});
