// CAS-209 — build a south-facing walk STRIP from PixelLab MCP animation frame URLs.
// usage: node tools/cas209-build-strip.mjs <mob> <fw> <url0> <url1> ...
// writes assets/pixellab/fountains/anim/<mob>_walk_strip.png  (N frames × fw×fw)
import fs from 'node:fs'; import zlib from 'node:zlib';
function decodePNG(buf){let p=8,W=0,H=0,idat=[],ct=6;while(p<buf.length){const len=buf.readUInt32BE(p);const t=buf.toString('ascii',p+4,p+8);const d=buf.subarray(p+8,p+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);ct=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+len;}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:1;const st=W*ch;const out=Buffer.alloc(W*H*4);let pos=0;const pv=Buffer.alloc(st),cu=Buffer.alloc(st);const pa=(a,b,c)=>{const q=a+b-c,x=Math.abs(q-a),y=Math.abs(q-b),z=Math.abs(q-c);return x<=y&&x<=z?a:y<=z?b:c;};for(let y=0;y<H;y++){const f=raw[pos++];raw.copy(cu,0,pos,pos+st);pos+=st;for(let i=0;i<st;i++){const a=i>=ch?cu[i-ch]:0,b=pv[i],c=i>=ch?pv[i-ch]:0;let v=cu[i];if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+pa(a,b,c))&255;cu[i]=v;}for(let x=0;x<W;x++){const s=x*ch,di=(y*W+x)*4;if(ch===4){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=cu[s+3];}else if(ch===3){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=255;}else{out[di]=out[di+1]=out[di+2]=cu[s];out[di+3]=255;}}cu.copy(pv);}return{W,H,rgba:out};}
function crc32(b){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let cr=0xFFFFFFFF;for(let i=0;i<b.length;i++)cr=t[(cr^b[i])&255]^(cr>>>8);return(cr^0xFFFFFFFF)>>>0;}
function ck(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const bo=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(bo),0);return Buffer.concat([l,bo,c]);}
function encodePNG(W,H,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const st=W*4;const raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}return Buffer.concat([sig,ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]);}
// alpha-aware bilinear-ish nearest scale w/ trim of fully-transparent border to center subject
function autoTrimScale(src,sw,sh,N){
  // find bbox of non-transparent
  let x0=sw,y0=sh,x1=0,y1=0;
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){if(src[(y*sw+x)*4+3]>16){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<x0){x0=0;y0=0;x1=sw-1;y1=sh-1;}
  const bw=x1-x0+1, bh=y1-y0+1;
  // fit subject into N with small padding, keep aspect, anchor feet to bottom
  const pad=Math.round(N*0.06);
  const avail=N-pad*2;
  const s=Math.min(avail/bw, avail/bh);
  const dw=Math.round(bw*s), dh=Math.round(bh*s);
  const offx=Math.round((N-dw)/2), offy=N-pad-dh; // feet near bottom
  const out=Buffer.alloc(N*N*4);
  for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
    const sx=x0+Math.floor(x*bw/dw), sy=y0+Math.floor(y*bh/dh);
    const si=(sy*sw+sx)*4; const dx=offx+x, dy=offy+y; if(dx<0||dy<0||dx>=N||dy>=N)continue;
    const di=(dy*N+dx)*4; out[di]=src[si];out[di+1]=src[si+1];out[di+2]=src[si+2];out[di+3]=src[si+3];
  }
  return out;
}
async function dl(u){const r=await fetch(u);if(!r.ok)throw new Error('dl '+r.status+' '+u);return Buffer.from(await r.arrayBuffer());}
(async()=>{
  const mob=process.argv[2], FW=parseInt(process.argv[3],10), urls=process.argv.slice(4);
  const frames=[];
  for(const u of urls){const b=await dl(u);const d=decodePNG(b);frames.push(autoTrimScale(d.rgba,d.W,d.H,FW));}
  const N=frames.length, strip=Buffer.alloc(FW*N*FW*4);
  for(let f=0;f<N;f++)for(let y=0;y<FW;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4,di=(y*(FW*N)+(f*FW+x))*4;strip[di]=frames[f][si];strip[di+1]=frames[f][si+1];strip[di+2]=frames[f][si+2];strip[di+3]=frames[f][si+3];}
  const out=`assets/pixellab/fountains/anim/${mob}_walk_strip.png`;
  fs.writeFileSync(out,encodePNG(FW*N,FW,strip));
  console.log(`✓ ${mob}: ${N} frames @ ${FW}px → ${out} (${FW*N}x${FW})`);
})();
