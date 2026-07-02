import puppeteer from 'puppeteer-core';
import fs from 'fs';
const b=fs.readFileSync('assets/pixellab/fountains/anim/bogtyrant_attack2_strip.png').toString('base64');
// 1056x96, 11 frames, 3x
const f=(i)=>`<div style="display:inline-block;margin:3px;text-align:center"><div style="width:288px;height:288px;overflow:hidden;background:#20242c;outline:1px solid #444"><img style="image-rendering:pixelated;width:3168px;margin-left:-${i*288}px" src="data:image/png;base64,${b}"></div><div style="color:#cfd;font:12px monospace">f${i}</div></div>`;
const br=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const p=await br.newPage();
await p.setViewport({width:1800,height:660,deviceScaleFactor:1});
await p.setContent(`<body style="margin:0;background:#161922;padding:4px">${[0,2,4,5].map(f).join('')}<br>${[6,8,9,10].map(f).join('')}</body>`);
await p.waitForSelector('img');await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:'/tmp/atk2-crop.png',fullPage:true});
await br.close();console.log('ok');
