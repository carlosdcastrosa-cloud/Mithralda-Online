// CAS-1745 — montage: frame-0 of each state (idle/walk/attack/hurt/death) per char, 3 rows.
import fs from 'node:fs'; import zlib from 'node:zlib';
function decodePNG(buf){let p=8,W=0,H=0,idat=[],ct=6;while(p<buf.length){const len=buf.readUInt32BE(p);const t=buf.toString('ascii',p+4,p+8);const d=buf.subarray(p+8,p+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);ct=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+len;}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:1;const st=W*ch;const out=Buffer.alloc(W*H*4);let pos=0;const pv=Buffer.alloc(st),cu=Buffer.alloc(st);const pa=(a,b,c)=>{const q=a+b-c,x=Math.abs(q-a),y=Math.abs(q-b),z=Math.abs(q-c);return x<=y&&x<=z?a:y<=z?b:c;};for(let y=0;y<H;y++){const f=raw[pos++];raw.copy(cu,0,pos,pos+st);pos+=st;for(let i=0;i<st;i++){const a=i>=ch?cu[i-ch]:0,b=pv[i],c=i>=ch?pv[i-ch]:0;let v=cu[i];if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+pa(a,b,c))&255;cu[i]=v;}for(let x=0;x<W;x++){const s=x*ch,di=(y*W+x)*4;if(ch===4){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=cu[s+3];}else if(ch===3){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=255;}else{out[di]=out[di+1]=out[di+2]=cu[s];out[di+3]=255;}}cu.copy(pv);}return{W,H,rgba:out};}
function crc32(b){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let cr=0xFFFFFFFF;for(let i=0;i<b.length;i++)cr=t[(cr^b[i])&255]^(cr>>>8);return(cr^0xFFFFFFFF)>>>0;}
function ck(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const bo=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(bo),0);return Buffer.concat([l,bo,c]);}
function encodePNG(W,H,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const st=W*4;const raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}return Buffer.concat([sig,ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]);}
const DIR="assets/pixellab/fountains/anim";
const states=["idle","walk","attack","hurt","death"];
const rows=[{mob:"emberkin",fw:64},{mob:"magmabrute",fw:64},{mob:"calderatyrant",fw:96}];
const CELL=96, PAD=4, COLS=states.length;
const W=COLS*CELL+(COLS+1)*PAD, H=rows.length*CELL+(rows.length+1)*PAD;
const canvas=Buffer.alloc(W*H*4);
// checker bg
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const di=(y*W+x)*4;const c=((x>>3)+(y>>3))&1?40:28;canvas[di]=c;canvas[di+1]=c;canvas[di+2]=c;canvas[di+3]=255;}
rows.forEach((r,ri)=>{
  states.forEach((st,ci)=>{
    const f=`${DIR}/${r.mob}_${st}_strip.png`;
    if(!fs.existsSync(f))return;
    const {W:sw,H:sh,rgba}=decodePNG(fs.readFileSync(f));
    const fw=r.fw; // one frame = fw wide
    const ox=PAD+ci*(CELL+PAD)+((CELL-fw)>>1), oy=PAD+ri*(CELL+PAD)+((CELL-sh)>>1);
    for(let y=0;y<sh;y++)for(let x=0;x<fw;x++){
      const si=(y*sw+x)*4; const a=rgba[si+3]; if(a<8)continue;
      const dx=ox+x, dy=oy+y; if(dx<0||dy<0||dx>=W||dy>=H)continue;
      const di=(dy*W+dx)*4; canvas[di]=rgba[si];canvas[di+1]=rgba[si+1];canvas[di+2]=rgba[si+2];canvas[di+3]=255;
    }
  });
});
fs.writeFileSync("tools/cas1745-montage.png",encodePNG(W,H,canvas));
console.log(`montage ${W}x${H} → tools/cas1745-montage.png (rows=emberkin/magmabrute/calderatyrant, cols=idle/walk/attack/hurt/death)`);
