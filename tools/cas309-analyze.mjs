import puppeteer from 'puppeteer-core';
import fs from 'fs';

const DIR='/tmp/cas309/extracted/healer_pack/healer';
const files=[1,2,3,4,5,6].map(n=>`${DIR}/${n}.png`);

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const pg=await b.newPage();
await pg.setContent('<canvas id=c></canvas>');

for(const f of files){
  const data='data:image/png;base64,'+fs.readFileSync(f).toString('base64');
  const r=await pg.evaluate(async (src)=>{
    const img=new Image(); img.src=src; await img.decode();
    const W=img.naturalWidth,H=img.naturalHeight;
    const cv=document.getElementById('c'); cv.width=W; cv.height=H;
    const ctx=cv.getContext('2d'); ctx.clearRect(0,0,W,H); ctx.drawImage(img,0,0);
    const cell=64, cols=Math.round(W/cell), rows=Math.round(H/cell);
    const out=[];
    for(let ry=0;ry<rows;ry++){ const line=[];
      for(let rx=0;rx<cols;rx++){
        const d=ctx.getImageData(rx*cell,ry*cell,cell,cell).data;
        let n=0,minx=99,miny=99,maxx=0,maxy=0;
        for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){ const a=d[(y*cell+x)*4+3];
          if(a>40){ n++; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
        line.push(n? `${String(n).padStart(4)}[${minx},${miny}-${maxx},${maxy}]` : '   .        ');
      }
      out.push(line.join(' '));
    }
    // simple content hash
    const full=ctx.getImageData(0,0,W,H).data; let hash=0;
    for(let i=0;i<full.length;i+=997) hash=(hash*31+full[i])>>>0;
    return {W,H,cols,rows,out,hash};
  }, data);
  console.log(`\n=== ${f.split('/').pop()} ${r.W}x${r.H} ${r.cols}x${r.rows} hash=${r.hash} ===`);
  r.out.forEach((l,i)=>console.log(`r${i}: ${l}`));
}
await b.close();
