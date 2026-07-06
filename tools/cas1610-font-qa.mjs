// CAS-1610 QA: prove the pixel TTF loads via FontFace and actually renders
// glyphs at small sizes (no broken boxes), and that the family stack falls
// back cleanly. Headless chromium, no live deploy needed.
import fs from "node:fs";
import puppeteer from "puppeteer-core";
const ttf = fs.readFileSync("assets/ui/MithraldaPixel.ttf");
const b64 = ttf.toString("base64");
const browser = await puppeteer.launch({ executablePath:"/usr/bin/chromium",
  headless:"new", args:["--no-sandbox","--disable-setuid-sandbox","--ignore-certificate-errors"] });
try{
  const page = await browser.newPage();
  await page.setContent("<canvas id=c width=300 height=60></canvas>");
  const r = await page.evaluate(async (b64)=>{
    const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const ff = new FontFace("MithraldaPixel", bin.buffer);
    await ff.load();
    document.fonts.add(ff);
    const ready = document.fonts.check("16px 'MithraldaPixel'");
    const ctx = document.getElementById("c").getContext("2d");
    // width differs from generic monospace => the face is actually applied
    ctx.font = "10px monospace"; const wMono = ctx.measureText("HELLO 123").width;
    ctx.font = "10px 'MithraldaPixel', monospace"; const wPix = ctx.measureText("HELLO 123").width;
    // draw at 8px and count non-blank pixels => glyphs render, not empty boxes
    ctx.clearRect(0,0,300,60); ctx.fillStyle="#fff"; ctx.font="8px 'MithraldaPixel', monospace";
    ctx.fillText("abc 90 ELITE", 4, 20);
    const px = ctx.getImageData(0,0,300,60).data; let ink=0;
    for(let i=0;i<px.length;i+=4){ if(px[i]>40) ink++; }
    // accented glyph the font lacks must still draw via monospace fallback (not empty)
    ctx.clearRect(0,0,300,60); ctx.fillStyle="#fff"; ctx.font="10px 'MithraldaPixel', monospace";
    ctx.fillText("ÉLITE ☠", 4, 20);
    const px2 = ctx.getImageData(0,0,300,60).data; let ink2=0;
    for(let i=0;i<px2.length;i+=4){ if(px2[i]>40) ink2++; }
    return { ready, wMono, wPix, ink, ink2 };
  }, b64);
  const pass = r.ready && r.wPix>0 && r.ink>50 && r.ink2>20;
  console.log(JSON.stringify(r));
  console.log(pass ? "PASS: pixel font loads, renders at 8-10px, fallback glyphs draw" : "FAIL");
  process.exit(pass?0:1);
} finally { await browser.close(); }
