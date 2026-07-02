import puppeteer from 'puppeteer-core';
import fs from 'fs';
const b=fs.readFileSync('assets/pixellab/fountains/anim/bogtyrant_death_strip.png').toString('base64');
// strip is 864x96, 9 frames. Show frames 0,4,7,8 at 3x via CSS object-position crops
const f=(i)=>`<div style="display:inline-block;margin:4px;text-align:center"><div style="width:288px;height:288px;overflow:hidden;background:#20242c;outline:1px solid #444"><img style="image-rendering:pixelated;width:2592px;margin-left:-${i*288}px" src="data:image/png;base64,${b}"></div><div style="color:#cfd;font:12px monospace">f${i}</div></div>`;
const br=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const p=await br.newPage();
await p.setViewport({width:1260,height:340,deviceScaleFactor:1});
await p.setContent(`<body style="margin:0;background:#161922;padding:6px">${f(0)}${f(4)}${f(7)}${f(8)}</body>`);
await p.waitForSelector('img');await new Promise(r=>setTimeout(r,300));
await p.screenshot({path:'/tmp/death-crop.png'});
await br.close();console.log('ok');
