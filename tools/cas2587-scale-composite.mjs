import fs from "node:fs"; import zlib from "node:zlib";
function readChunks(b){let p=8;const c=[];while(p<b.length){const l=b.readUInt32BE(p);const t=b.toString("ascii",p+4,p+8);c.push({t,d:b.slice(p+8,p+8+l)});p+=12+l;}return c;}
function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function decode(buf){const w=buf.readUInt32BE(16),h=buf.readUInt32BE(20),bd=buf[24],ct=buf[25];if(bd!==8||ct!==6)throw new Error("ct"+ct);
  const idat=Buffer.concat(readChunks(buf).filter(c=>c.t==="IDAT").map(c=>c.d));const raw=zlib.inflateSync(idat);
  const bpp=4,stride=w*bpp,out=Buffer.alloc(h*stride);let rp=0;
  for(let y=0;y<h;y++){const ft=raw[rp++];for(let x=0;x<stride;x++){const rv=raw[rp++];const a=x>=bpp?out[y*stride+x-bpp]:0;const b=y>0?out[(y-1)*stride+x]:0;const c=x>=bpp&&y>0?out[(y-1)*stride+x-bpp]:0;let v;switch(ft){case 0:v=rv;break;case 1:v=rv+a;break;case 2:v=rv+b;break;case 3:v=rv+((a+b)>>1);break;case 4:v=rv+paeth(a,b,c);break;}out[y*stride+x]=v&0xff;}}return{w,h,data:out};}
function crc32(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return(~c)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const td=Buffer.concat([Buffer.from(t,"ascii"),d]);const cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(td),0);return Buffer.concat([l,td,cr]);}
function encode(w,h,data){const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;const stride=w*4;const raw=Buffer.alloc(h*(stride+1));for(let y=0;y<h;y++){raw[y*(stride+1)]=0;data.copy(raw,y*(stride+1)+1,y*stride,y*stride+stride);}const idat=zlib.deflateSync(raw,{level:9});return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk("IHDR",ih),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);}
// nearest-neighbor scaled composite, bottom-anchored at groundY, centered at cx
function paste(dst,DW,src,dw,dh,cx,groundY){for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const sx=Math.min(src.w-1,Math.floor(x*src.w/dw)),sy=Math.min(src.h-1,Math.floor(y*src.h/dh));const sa=src.data[(sy*src.w+sx)*4+3];if(sa<8)continue;const dx=Math.round(cx-dw/2)+x,dy=Math.round(groundY-dh)+y;if(dx<0||dy<0||dx>=DW)continue;const di=(dy*DW+dx)*4;for(let k=0;k<3;k++)dst[di+k]=src.data[(sy*src.w+sx)*4+k];dst[di+3]=255;}}

const DW=360,DH=140,groundY=118;
const canvas=Buffer.alloc(DW*DH*4);
// muted earthy ground bg (top sky-ish band + ground band) — environment recedes
for(let y=0;y<DH;y++)for(let x=0;x<DW;x++){const i=(y*DW+x)*4;const g=y<groundY-40;canvas[i]=g?58:61;canvas[i+1]=g?66:74;canvas[i+2]=g?52:52;canvas[i+3]=255;}
// ground line
for(let x=0;x<DW;x++){const i=((groundY)*DW+x)*4;canvas[i]=34;canvas[i+1]=40;canvas[i+2]=30;canvas[i+3]=255;}
const rat=decode(fs.readFileSync("assets/pixellab/fountains/enemy_rat.png"));
const adv=decode(fs.readFileSync("assets/pixellab/fountains/enemy_adv.png"));
const orc=decode(fs.readFileSync("assets/pixellab/fountains/enemy_orc.png"));
// render sizes = drawEnemy: dh=size*2.4, dw=dh*(w/h)
const R={img:rat,size:15},A={img:adv,size:19},O={img:orc,size:22}; // adv shown at healer size 19
for(const [e,cx] of [[R,70],[A,180],[O,290]]){const dh=e.size*2.4,dw=dh*(e.img.w/e.img.h);paste(canvas,DW,e.img,Math.round(dw),Math.round(dh),cx,groundY);}
fs.writeFileSync("shots/cas2587/scale-check.png",encode(DW,DH,canvas));
console.log("wrote shots/cas2587/scale-check.png  rat("+Math.round(15*2.4)+"px) | healer/adv("+Math.round(19*2.4)+"px) | orc sibling("+Math.round(22*2.4)+"px)");
