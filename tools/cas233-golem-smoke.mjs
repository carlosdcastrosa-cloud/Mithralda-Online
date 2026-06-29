// CAS-233 smoke — verify the FOUNTAINS golem boss strips are wired and well-formed.
// Asserts: golem dropped from ENEMY_ANIM (legacy near-black blob retired), resolveStrip
// drives walk/idle/attack via tpl.sprite, each strip PNG is fc×96 × 96, fixed boss scale
// (tiles:3.6), and unknown states fall back to walk. Run: node tools/cas233-golem-smoke.mjs
import fs from "node:fs";
import {ENEMY_ANIM, resolveStrip} from "../render/sprites.js";
let ok=0, fail=0; const A=(c,m)=>{ if(c){ok++; console.log("✓",m);} else {fail++; console.log("✗",m);} };
A(!("golem" in ENEMY_ANIM), "golem removed from ENEMY_ANIM (legacy blob retired)");
for(const st of ["walk","idle","attack"]){
  const s=resolveStrip("golem",st);
  A(s && s.key==="golem_"+st+"_strip", `resolveStrip golem/${st} → ${s&&s.key}`);
  A(s && s.tiles===3.6, `golem/${st} tiles=3.6 (fixed boss scale)`);
  const buf=fs.readFileSync(new URL("../assets/pixellab/fountains/anim/golem_"+st+"_strip.png", import.meta.url));
  const W=buf.readUInt32BE(16), H=buf.readUInt32BE(20);
  A(H===96 && W===s.fc*96, `golem_${st}_strip.png ${W}x${H} == fc(${s.fc})*96 x 96`);
}
A(resolveStrip("golem","death")===resolveStrip("golem","walk"), "unknown state falls back to walk strip");
console.log(`\n${ok} passed, ${fail} failed`); process.exit(fail?1:0);
