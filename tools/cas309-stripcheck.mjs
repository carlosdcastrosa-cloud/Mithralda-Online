import puppeteer from 'puppeteer-core';
import fs from 'fs';
const A='/paperclip/instances/default/projects/6e781e86-664b-4e7e-81a5-fc1d3eabbfb9/8542b0f2-5bb3-4a45-89ce-6d08dec8492b/_default/assets/char';
const idle='data:image/png;base64,'+fs.readFileSync(A+'/healernpc_idle.png').toString('base64');
const cast='data:image/png;base64,'+fs.readFileSync(A+'/healernpc_cast.png').toString('base64');
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const pg=await b.newPage(); await pg.setContent('<canvas id=c></canvas>');
const out=await pg.evaluate(async(idle,cast)=>{
  async function load(s){const i=new Image();i.src=s;await i.decode();return i;}
  const I=await load(idle), C=await load(cast);
  const ZF=6;
  const c=document.getElementById('c'); c.width=1000; c.height=420;
  const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#1c2733'; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#cfe'; ctx.font='14px monospace';
  // idle frames
  const ifw=I.width/6, ifh=I.height;
  ctx.fillText('IDLE  6f  '+ifw+'x'+ifh,10,20);
  for(let i=0;i<6;i++){ const dx=10+i*(ifw*ZF+8), dy=30;
    ctx.fillStyle='#0e1218'; ctx.fillRect(dx,dy,ifw*ZF,ifh*ZF);
    ctx.drawImage(I, i*ifw,0,ifw,ifh, dx,dy, ifw*ZF,ifh*ZF); }
  // cast frames
  const cfw=C.width/6, cfh=C.height;
  ctx.fillStyle='#cfe'; ctx.fillText('HEAL CAST  6f  '+cfw+'x'+cfh,10,260);
  for(let i=0;i<6;i++){ const dx=10+i*(cfw*ZF+8), dy=270;
    ctx.fillStyle='#0e1218'; ctx.fillRect(dx,dy,cfw*ZF,cfh*ZF);
    ctx.drawImage(C, i*cfw,0,cfw,cfh, dx,dy, cfw*ZF,cfh*ZF); }
  return c.toDataURL('image/png');
}, idle, cast);
fs.writeFileSync('/tmp/cas309/stripcheck.png', Buffer.from(out.split(',')[1],'base64'));
await b.close(); console.log('ok');
