// CAS-440 — per-mob strip montage: node tools/cas440-montage.mjs <mob> <title> [outfile]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const mob=process.argv[2], title=process.argv[3]||mob, out=process.argv[4]||`shots/cas440-${mob}-montage.png`;
const strips=['idle','walk','attack','hurt','death'].filter(s=>fs.existsSync(`assets/pixellab/fountains/anim/${mob}_${s}_strip.png`));
const rows=strips.map(s=>{const b=fs.readFileSync(`assets/pixellab/fountains/anim/${mob}_${s}_strip.png`).toString('base64');return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0"><div style="width:60px;color:#cfd;font:12px monospace">${s}</div><img style="image-rendering:pixelated;height:128px;background:#20242c;outline:1px solid #444" src="data:image/png;base64,${b}"></div>`;}).join('');
const br=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const p=await br.newPage();
await p.setViewport({width:1400,height:820,deviceScaleFactor:1});
await p.setContent(`<body style="margin:0;background:#161922;padding:16px"><div style="color:#9fb;font:14px sans-serif;margin-bottom:8px">${title} — strips @2x</div>${rows}</body>`);
await p.waitForSelector('img');await new Promise(r=>setTimeout(r,300));
const h=await p.evaluate(()=>document.body.scrollHeight);
await p.setViewport({width:1400,height:Math.min(h+20,1600),deviceScaleFactor:1});
await p.screenshot({path:out});
await br.close();console.log('OK',out);
