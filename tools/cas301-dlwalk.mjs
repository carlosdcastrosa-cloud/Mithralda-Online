// CAS-301 — download all walk-animation frames of an 8-direction object into <outDir>
// as <direction>_<frame>.png (the layout tools/cas301-slice.mjs expects for walkDir).
//   node tools/cas301-dlwalk.mjs <objId> <groupId> <outDir> [maxFrames=10]
import { mkdirSync, writeFileSync } from "node:fs";
const [objId, group, outDir, maxFramesStr] = process.argv.slice(2);
const MAXF = parseInt(maxFramesStr || "10", 10);
const ACCT = "3222372a-afd8-4fcd-b8d6-f6dd4738a627";
const DIRS = ["south","south-east","east","north-east","north","north-west","west","south-west"];
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const d of DIRS) {
  let f = 0;
  for (; f < MAXF; f++) {
    const url = `https://backblaze.pixellab.ai/file/pixellab-characters/objects/${ACCT}/${objId}/animations/${group}/${d}/${f}.png`;
    const r = await fetch(url);
    if (!r.ok) break;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100) break;
    writeFileSync(`${outDir}/${d}_${f}.png`, buf); total++;
  }
  console.log(`${d}: ${f} frames`);
}
console.log("total frames:", total);
