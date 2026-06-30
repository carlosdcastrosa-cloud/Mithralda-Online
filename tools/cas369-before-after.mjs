// CAS-369: BEFORE (current straw-hat "extended Clarice", CAS-254) vs AFTER (restored
// brown-haired Clarice, CAS-235) warrior comparison. Frame 0 of idle/walk/attack/death.
// Pure-JS PNG (CAS-209 lineage). No deps, $0.
import fs from 'fs';
import zlib from 'zlib';
import { execSync } from 'child_process';

function decodePNG(buf){let p=8,W=0,H=0,idat=[],ct=6;while(p<buf.length){const len=buf.readUInt32BE(p);const t=buf.toString('ascii',p+4,p+8);const d=buf.subarray(p+8,p+8+len);if(t==='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);ct=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+len;}const raw=zlib.inflateSync(Buffer.concat(idat));const ch=ct===6?4:ct===2?3:1;const st=W*ch;const out=Buffer.alloc(W*H*4);let pos=0;const pv=Buffer.alloc(st),cu=Buffer.alloc(st);const pa=(a,b,c)=>{const q=a+b-c,x=Math.abs(q-a),y=Math.abs(q-b),z=Math.abs(q-c);return x<=y&&x<=z?a:y<=z?b:c;};for(let y=0;y<H;y++){const f=raw[pos++];raw.copy(cu,0,pos,pos+st);pos+=st;for(let i=0;i<st;i++){const a=i>=ch?cu[i-ch]:0,b=pv[i],c=i>=ch?pv[i-ch]:0;let v=cu[i];if(f===1)v=(v+a)&255;else if(f===2)v=(v+b)&255;else if(f===3)v=(v+((a+b)>>1))&255;else if(f===4)v=(v+pa(a,b,c))&255;cu[i]=v;}for(let x=0;x<W;x++){const s=x*ch,di=(y*W+x)*4;if(ch===4){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=cu[s+3];}else if(ch===3){out[di]=cu[s];out[di+1]=cu[s+1];out[di+2]=cu[s+2];out[di+3]=255;}else{out[di]=out[di+1]=out[di+2]=cu[s];out[di+3]=255;}}cu.copy(pv);}return{W,H,rgba:out};}
function crc32(b){let c,t=crc32._t;if(!t){t=crc32._t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}}let cr=0xFFFFFFFF;for(let i=0;i<b.length;i++)cr=t[(cr^b[i])&255]^(cr>>>8);return(cr^0xFFFFFFFF)>>>0;}
function ck(ty,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const bo=Buffer.concat([Buffer.from(ty),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(bo),0);return Buffer.concat([l,bo,c]);}
function encodePNG(W,H,rgba){const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;const st=W*4;const raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}return Buffer.concat([sig,ck('IHDR',ih),ck('IDAT',zlib.deflateSync(raw,{level:9})),ck('IEND',Buffer.alloc(0))]);}

const CW=140, CH=166; // cell
const states=['warrior','warrior_walk']; // idle/walk frame-0 — decisive character-identity comparison
// BEFORE = current HEAD (straw-hat). AFTER = CAS-235 (71c0637, brown-haired).
function gitFrame0(ref, name){
  const buf = execSync(`git show ${ref}:assets/erw/hero/classes/${name}.png`, {maxBuffer:1<<26});
  const {W,H,rgba}=decodePNG(buf);
  // copy first CWxCH cell
  const cell=Buffer.alloc(CW*CH*4);
  for(let y=0;y<CH && y<H;y++)for(let x=0;x<CW && x<W;x++){const s=(y*W+x)*4,d=(y*CW+x)*4;cell[d]=rgba[s];cell[d+1]=rgba[s+1];cell[d+2]=rgba[s+2];cell[d+3]=rgba[s+3];}
  return cell;
}
function blit(dst,DW,cell,ox,oy,bg){
  for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){
    const s=(y*CW+x)*4,a=cell[s+3]/255;
    const d=((oy+y)*DW+(ox+x))*4;
    dst[d]=Math.round(cell[s]*a+bg[0]*(1-a));
    dst[d+1]=Math.round(cell[s+1]*a+bg[1]*(1-a));
    dst[d+2]=Math.round(cell[s+2]*a+bg[2]*(1-a));
    dst[d+3]=255;
  }
}
const PAD=8, LAB=10;
const DW=PAD+ (CW+PAD)*states.length;
const DH=PAD + (CH+PAD)*2 + LAB; // two rows
const out=Buffer.alloc(DW*DH*4);
// base fill (game dark)
for(let i=0;i<DW*DH;i++){out[i*4]=16;out[i*4+1]=17;out[i*4+2]=24;out[i*4+3]=255;}
const beforeBG=[60,24,28]; // dark red tint row (BEFORE)
const afterBG=[24,52,30];  // dark green tint row (AFTER)
function rowBand(oy,col){for(let y=oy-2;y<oy+CH+2;y++)for(let x=0;x<DW;x++){const d=(y*DW+x)*4;out[d]=col[0];out[d+1]=col[1];out[d+2]=col[2];}}
const row0=PAD, row1=PAD+CH+PAD+LAB;
rowBand(row0,beforeBG);
rowBand(row1,afterBG);
states.forEach((s,i)=>{
  const ox=PAD+i*(CW+PAD);
  blit(out,DW,gitFrame0('HEAD',s),ox,row0,beforeBG);     // BEFORE current straw-hat
  blit(out,DW,gitFrame0('71c0637',s),ox,row1,afterBG);   // AFTER brown-haired
});
fs.writeFileSync('/tmp/cas369/CAS369_before_after.png', encodePNG(DW,DH,out));
console.log('wrote /tmp/cas369/CAS369_before_after.png', DW+'x'+DH);
