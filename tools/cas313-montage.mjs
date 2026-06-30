// CAS-313 Art Director evidence: contact sheet of the dragon boss' 6 animation strips.
// Stacks each labeled strip (scaled to fit) into one PNG for the issue thread.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";
const DIR="assets/pixellab/fountains/anim/";
const STRIPS=[
  ["IDLE (10f)","dragon_idle_strip.png"],
  ["WALK (10f)","dragon_walk_strip.png"],
  ["ATTACK 1 (9f)","dragon_attack1_strip.png"],
  ["ATTACK 2 (17f)","dragon_attack2_strip.png"],
  ["HURT (3f)","dragon_hurt_strip.png"],
  ["DEATH (7f)","dragon_death_strip.png"],
];
const b64=p=>"data:image/png;base64,"+readFileSync(p).toString("base64");
const rows=STRIPS.map(([lbl,f])=>({lbl,src:b64(DIR+f)}));
const browser=await puppeteer.launch({executablePath:"/usr/bin/chromium",args:["--no-sandbox"],headless:"new"});
const page=await browser.newPage();
await page.setViewport({width:1180,height:980,deviceScaleFactor:1});
const html=`<html><body style="margin:0;background:#2a3340;font-family:'Courier New',monospace">
<div style="padding:14px">
<div style="color:#e8c96a;font-size:18px;font-weight:bold;margin-bottom:4px">CAS-313 — Dracónic BOSS · 6 animaciones completas (133×133)</div>
<div style="color:#9fb0c0;font-size:11px;margin-bottom:12px">Art Director sign-off · on-style FOUNTAINS dark-fantasy · RGBA real-alpha · staged assets/pixellab/fountains/anim/dragon_*_strip.png</div>
${rows.map(r=>`<div style="margin-bottom:10px">
  <div style="color:#cfd8e0;font-size:12px;margin-bottom:3px">${r.lbl}</div>
  <img src="${r.src}" style="image-rendering:pixelated;height:78px;background:#1d2530;border:1px solid #3a4756;display:block"/>
</div>`).join("")}
</div></body></html>`;
await page.setContent(html,{waitUntil:"networkidle0"});
const el=await page.$("body>div");
const box=await el.boundingBox();
await page.setViewport({width:1180,height:Math.ceil(box.height)+20,deviceScaleFactor:1});
const buf=await page.screenshot({clip:{x:0,y:0,width:1180,height:Math.ceil(box.height)+8}});
writeFileSync("assets/pixellab/dragon_boss/cas313-contact-sheet.png",buf);
console.log("wrote contact sheet",buf.length,"bytes");
await browser.close();
