// CAS-345 — download warrior 8-dir rotations + a named animation's frames into local dirs.
// Uses EXPLICIT per-direction anim ids (PixelLab walk/dash URLs are per-direction, not group).
//   node tools/cas345-dl.mjs rotations <rotOutDir>
//   node tools/cas345-dl.mjs anim <walkOutDir> <maxFrames> <dir:animId,dir:animId,...>
import { mkdirSync, writeFileSync } from "node:fs";
const ACCT = "3222372a-afd8-4fcd-b8d6-f6dd4738a627";
const OBJ = "cdf939ec-1c23-44c2-a1cd-03c51bc5e8af";
const BASE = `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${ACCT}/${OBJ}`;
const DIRS = ["south","south-east","east","north-east","north","north-west","west","south-west"];
const [mode, outDir, maxFStr, mapStr] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
async function get(url){ const r=await fetch(url); if(!r.ok) return null; const b=Buffer.from(await r.arrayBuffer()); return b.length<100?null:b; }
if (mode === "rotations") {
  let n=0;
  for (const d of DIRS){ const b=await get(`${BASE}/rotations/${d}.png`); if(b){ writeFileSync(`${outDir}/${d}.png`,b); n++; } else console.log("MISS rot",d); }
  console.log("rotations:",n);
} else {
  const MAXF=parseInt(maxFStr||"10",10);
  const map=Object.fromEntries(mapStr.split(",").map(s=>s.split(":")));
  let total=0;
  for (const d of DIRS){
    const id=map[d]; if(!id){ console.log("no animId",d); continue; }
    let f=0; for(;f<MAXF;f++){ const b=await get(`${BASE}/animations/${id}/${d}/${f}.png`); if(!b) break; writeFileSync(`${outDir}/${d}_${f}.png`,b); total++; }
    console.log(`${d}: ${f} frames`);
  }
  console.log("total:",total);
}
