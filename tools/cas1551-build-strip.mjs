// CAS-1551: composite the 6 pixellab blacksmith idle-hammer frames into the frozen
// strip assets/char/blacksmithnpc_idle.png — 6 frames × 29w × 50h → 174×50, transparent.
//
// KEY: one GLOBAL transform for all frames (shared scale, shared feet baseline, shared
// horizontal centre) so the standing body is rock-steady and only the hammer/arms move.
// Per-frame autoscale would balloon the overhead-hammer frame and make the smith pulse.
//
// Transform: take the union content bbox across all frames, scale-to-CONTAIN into the
// 27×48 inner box (1px margins), feet-align the union bottom to row 48, centre the union
// horizontally in each 29px cell. Nearest-neighbour, alpha-thresholded — no blur, palette
// preserved 1:1.
import { PNG } from 'pngjs';
import fs from 'fs';

const FW = 29, FH = 50, N = 6;
const PAD_X = 1, PAD_TOP = 1, PAD_BOT = 1;   // inner box 27 × 48
const ALPHA_MIN = 32;

const readPNG = p => PNG.sync.read(fs.readFileSync(p));

function bbox(img){
  let x0=img.width,y0=img.height,x1=-1,y1=-1;
  for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
    if(img.data[(y*img.width+x)*4+3]>ALPHA_MIN){
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  }
  return x1<0?null:{x0,y0,x1,y1};
}
function sample(img,fx,fy){
  const ix=Math.min(img.width-1,Math.max(0,Math.round(fx)));
  const iy=Math.min(img.height-1,Math.max(0,Math.round(fy)));
  const o=(iy*img.width+ix)*4;
  return [img.data[o],img.data[o+1],img.data[o+2],img.data[o+3]];
}

const files=process.argv.slice(2);
if(files.length!==N){ console.error(`need ${N} frames, got ${files.length}`); process.exit(1); }
const imgs=files.map(readPNG);
const bbs=imgs.map(bbox);

// union content bbox across all frames
let minX=1e9,maxX=-1,minY=1e9,maxY=-1;
for(const b of bbs){ if(!b)continue;
  minX=Math.min(minX,b.x0); maxX=Math.max(maxX,b.x1);
  minY=Math.min(minY,b.y0); maxY=Math.max(maxY,b.y1); }
const uW=maxX-minX+1, uH=maxY-minY+1;
const boxW=FW-2*PAD_X, boxH=FH-PAD_TOP-PAD_BOT;      // 27 × 48
const scale=Math.min(boxW/uW, boxH/uH);
const dw=Math.max(1,Math.round(uW*scale)), dh=Math.max(1,Math.round(uH*scale));
const offXcell=Math.floor((FW-dw)/2);                // centre in cell
const offY=FH-PAD_BOT-dh;                            // feet on floor
console.log(`union ${uW}x${uH} scale ${scale.toFixed(3)} -> ${dw}x${dh}  offX(cell) ${offXcell} offY ${offY}`);

const out=new PNG({width:FW*N,height:FH}); out.data.fill(0);
for(let i=0;i<N;i++){
  const img=imgs[i], baseX=i*FW+offXcell;
  for(let dy=0;dy<dh;dy++)for(let dx=0;dx<dw;dx++){
    const sx=minX+(dx/dw)*uW, sy=minY+(dy/dh)*uH;
    const [r,g,b,a]=sample(img,sx,sy);
    if(a<=ALPHA_MIN)continue;
    const px=baseX+dx, py=offY+dy;
    if(px<0||px>=FW*N||py<0||py>=FH)continue;
    const o=(py*FW*N+px)*4;
    out.data[o]=r; out.data[o+1]=g; out.data[o+2]=b; out.data[o+3]=255;
  }
}
const dest='assets/char/blacksmithnpc_idle.png';
fs.writeFileSync(dest,PNG.sync.write(out));
const v=PNG.sync.read(fs.readFileSync(dest));
console.log(`WROTE ${dest} ${v.width}x${v.height} (expect ${FW*N}x${FH})`);
