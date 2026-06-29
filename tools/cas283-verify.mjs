// CAS-283 verify — prove the re-baked druid/mage/paladin/priest attack+death strips no
// longer touch a cell edge (the FX/accent is fully captured), the render contract holds
// (fw=naturalWidth/fc > 140 so drawHeroClass centres on fw/2, feet on fh-3), and the
// untouched idle/walk strips are still the legacy 140×166 geometry.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const CLASSES = ["druid","mage","paladin","priest"];
const FC = 6, BOTTOM_GAP = 3;

const b64 = {};
for (const c of CLASSES) for (const s of ["_attack","_death","","_walk"])
  b64[c+s] = readFileSync(join(DIR, c+s+".png")).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const res = await page.evaluate(async (b64, CFG) => {
  const { CLASSES, FC, BOTTOM_GAP } = CFG;
  async function load(key){ const img=new Image(); img.src="data:image/png;base64,"+b64[key]; await img.decode();
    const cv=document.createElement("canvas"); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    const cx=cv.getContext("2d"); cx.imageSmoothingEnabled=false; cx.drawImage(img,0,0);
    return { w:cv.width, h:cv.height, data:cx.getImageData(0,0,cv.width,cv.height).data }; }
  // per-frame edge contact: count frames whose opaque content touches left/right/top edge
  function edgeReport(im, fc){
    const fw=Math.round(im.w/fc), h=im.h; let L=0,R=0,T=0, frames=[];
    for(let f=0;f<fc;f++){ const ox=f*fw; let l=false,r=false,t=false;
      for(let j=0;j<h;j++) for(let i=0;i<fw;i++){ if(im.data[(j*im.w+(ox+i))*4+3]>16){
        if(i===0)l=true; if(i===fw-1)r=true; if(j===0)t=true; } }
      if(l)L++; if(r)R++; if(t)T++; frames.push((l?"L":"")+(r?"R":"")+(t?"T":"")||"-"); }
    return { fw, h, L, R, T, frames };
  }
  const out={};
  for(const c of CLASSES){
    out[c]={};
    for(const st of ["_attack","_death"]){ const im=await load(c+st); const er=edgeReport(im, FC);
      out[c][st]={ fw:er.fw, h:er.h, wide:er.fw>140, L:er.L, R:er.R, T:er.T, frames:er.frames,
        clean: er.L===0 && er.R===0 && er.T===0 }; }
    // idle + walk must remain legacy 140-wide
    const idle=await load(c); const walk=await load(c+"_walk");
    out[c].idle={ fw:Math.round(idle.w/FC), h:idle.h, legacy: idle.w/FC===140 && idle.h===166 };
    out[c].walk={ fw:Math.round(walk.w/8),  h:walk.h, legacy: walk.w/8===140 && walk.h===166 };
  }
  return out;
}, b64, { CLASSES, FC, BOTTOM_GAP });
await browser.close();

let pass=0, fail=0;
const ok=(b,msg)=>{ console.log((b?"  PASS ":"  FAIL ")+msg); b?pass++:fail++; };
for(const c of CLASSES){
  for(const st of ["_attack","_death"]){ const r=res[c][st];
    ok(r.wide, `${c}${st} is WIDE (fw=${r.fw}>140) → render centres on fw/2`);
    ok(r.clean, `${c}${st} no edge contact (L${r.L}/R${r.R}/T${r.T}) frames=[${r.frames.join(",")}]`);
  }
  ok(res[c].idle.legacy, `${c} idle untouched legacy 140×166 (fw=${res[c].idle.fw} h=${res[c].idle.h})`);
  ok(res[c].walk.legacy, `${c} walk untouched legacy 140×166 (fw=${res[c].walk.fw} h=${res[c].walk.h})`);
}
console.log(`\n${pass}/${pass+fail} checks PASS`);
process.exit(fail?1:0);
