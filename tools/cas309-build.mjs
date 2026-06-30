import puppeteer from 'puppeteer-core';
import fs from 'fs';

const SRC='/tmp/cas309/extracted/healer_pack/healer/1.png';
const OUT='/paperclip/instances/default/projects/6e781e86-664b-4e7e-81a5-fc1d3eabbfb9/8542b0f2-5bb3-4a45-89ce-6d08dec8492b/_default/assets/char';
const data='data:image/png;base64,'+fs.readFileSync(SRC).toString('base64');

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const pg=await b.newPage();
await pg.setContent('<canvas id=c></canvas><canvas id=o></canvas><canvas id=p></canvas>');

const res=await pg.evaluate(async(src)=>{
  const img=new Image(); img.src=src; await img.decode();
  const cell=64;
  const c=document.getElementById('c'), cx=c.getContext('2d');
  c.width=cell; c.height=cell;
  // tight bbox of one cell
  function bbox(rx,ry){ cx.clearRect(0,0,cell,cell); cx.drawImage(img,rx*cell,ry*cell,cell,cell,0,0,cell,cell);
    const d=cx.getImageData(0,0,cell,cell).data; let minx=99,miny=99,maxx=-1,maxy=-1;
    for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){ if(d[(y*cell+x)*4+3]>40){ if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y; } }
    return {minx,miny,maxx,maxy}; }

  function buildStrip(row, cols, name){
    const bxs=[]; for(let i=0;i<cols;i++) bxs.push(bbox(i,row));
    const minMiny=Math.min(...bxs.map(b=>b.miny));
    const maxMaxy=Math.max(...bxs.map(b=>b.maxy));
    const maxW=Math.max(...bxs.map(b=>b.maxx-b.minx+1));
    const PADX=4, PADTOP=4, PADBOT=2;
    const fw=maxW+PADX*2, fh=(maxMaxy-minMiny+1)+PADTOP+PADBOT;
    const o=document.getElementById('o'); o.width=fw*cols; o.height=fh;
    const oc=o.getContext('2d'); oc.imageSmoothingEnabled=false; oc.clearRect(0,0,o.width,o.height);
    for(let i=0;i<cols;i++){ const bx=bxs[i]; const cw=bx.maxx-bx.minx+1;
      // horizontal: center the char in the frame; vertical: align tops to common baseline (feet on common bottom)
      const dx=i*fw + Math.round((fw-cw)/2) - 0; // center by width
      const dy=PADTOP + (bx.miny-minMiny);
      oc.drawImage(img, bx.minx, bx.miny, cw, bx.maxy-bx.miny+1, dx, dy, cw, bx.maxy-bx.miny+1);
    }
    return {name,fw,fh,cols,url:o.toDataURL('image/png')};
  }
  const idle=buildStrip(0,6,'idle');
  const cast=buildStrip(4,6,'cast');
  return {idle,cast};
}, data);

for(const s of [res.idle,res.cast]){
  fs.writeFileSync(`${OUT}/healernpc_${s.name}.png`, Buffer.from(s.url.split(',')[1],'base64'));
  console.log(`healernpc_${s.name}.png  fc=${s.cols} fw=${s.fw} fh=${s.fh}`);
}
await b.close();
