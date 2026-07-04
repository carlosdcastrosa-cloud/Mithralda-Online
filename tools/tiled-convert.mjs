// Convert the hand-built Tiled continent (assets/maps/src/mithralda_world.tmx, 760x570, gitignored
// 14MB source) into a compact generated data module the game imports synchronously:
//   sim/tiled-map-data.js  ->  export const MAP = { W, H, hub, terrRLE, wallRLE, objects... }
// Phase 1 emits terrain (grass/cobble/water) + a wall mask, RLE-compressed. Objects (trees, sites,
// npcs, mobs, hunt zones) are layered in by later phases. Re-run after editing the map in Tiled:
//   node tools/tiled-convert.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const SRC = join(ROOT, "assets/maps/src/mithralda_world.tmx");
const OUT = join(ROOT, "sim/tiled-map-data.js");

// engine tile types (mirror sim/config.js)
const T_GRASS = 0, T_DIRT = 1, T_COBBLE = 3, T_WATER = 5;

const xml = readFileSync(SRC, "utf8");
const W = +/<map[^>]*\bwidth="(\d+)"/.exec(xml)[1];
const H = +/<map[^>]*\bheight="(\d+)"/.exec(xml)[1];
const N = W * H;
console.log(`map ${W}x${H} = ${N} tiles`);

// ---- pull a tile layer's CSV into an Int32Array of gids (0 = empty) ----
const GID_MASK = 0x1fffffff; // strip Tiled's flip flags (top 3 bits)
function layer(name) {
  const re = new RegExp(`<layer[^>]*\\bname="${name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}"[^>]*>\\s*<data encoding="csv">([\\s\\S]*?)</data>`);
  const m = re.exec(xml);
  if (!m) return null;
  const arr = new Int32Array(N);
  let i = 0;
  for (const tok of m[1].split(",")) {
    const v = +tok;
    arr[i++] = v ? (v & GID_MASK) : 0;
  }
  if (i !== N) console.warn(`  layer ${name}: ${i} cells (expected ${N})`);
  return arr;
}

const land0 = layer("terrain0");
const patches = layer("patches");
const t1 = layer("terrain1"), t2 = layer("terrain2"), t3 = layer("terrain3");
const water = layer("water");
const paths = layer("stone-paths");
const w0 = layer("walls"), w1 = layer("walls-1"), w2 = layer("walls-2");
console.log("layers loaded:", ["terrain0","patches","terrain1","terrain2","terrain3","water","stone-paths","walls","walls-1","walls-2"].filter((n,i)=>[land0,patches,t1,t2,t3,water,paths,w0,w1,w2][i]).join(", "));

const nz = (a, i) => a && a[i] !== 0;

// ---- classify every cell ----
const terr = new Uint8Array(N);
const wall = new Uint8Array(N);
let landCount = 0, waterCount = 0, pathCount = 0, wallCount = 0;
for (let i = 0; i < N; i++) {
  const isLand = nz(land0,i) || nz(patches,i) || nz(t1,i) || nz(t2,i) || nz(t3,i);
  const isWater = nz(water,i);
  const isPath = nz(paths,i);
  const isWall = nz(w0,i) || nz(w1,i) || nz(w2,i);
  let t;
  if (isWater || !isLand) { t = T_WATER; waterCount++; }
  else if (isPath) { t = T_COBBLE; pathCount++; landCount++; }
  else { t = T_GRASS; landCount++; }
  terr[i] = t;
  if (isWall && t !== T_WATER) { wall[i] = 1; wallCount++; }
}
console.log(`land=${landCount} water=${waterCount} path=${pathCount} wall=${wallCount}`);

// ---- RLE encode (value, count) pairs — terr & wall are highly run-heavy ----
function rle(a) {
  const out = [];
  let v = a[0], c = 1;
  for (let i = 1; i < a.length; i++) {
    if (a[i] === v) c++;
    else { out.push(v, c); v = a[i]; c = 1; }
  }
  out.push(v, c);
  return out;
}
const terrRLE = rle(terr), wallRLE = rle(wall);
console.log(`terrRLE runs=${terrRLE.length/2} wallRLE runs=${wallRLE.length/2}`);

// ---- hub: the Sanadora (healer) NPC marks the central hub / spawn ----
function objByName(nm) {
  const m = new RegExp(`<object[^>]*name="${nm}"[^>]*x="([\\d.]+)"[^>]*y="([\\d.]+)"`).exec(xml);
  return m ? { x: Math.round(+m[1]), y: Math.round(+m[2]) } : null;
}
const hub = objByName("Sanadora") || { x: (W * 32) / 2, y: (H * 32) / 2 };
console.log("hub (px):", hub);

// ---- object layers → deco (trees, sites, ground clutter) ---------------------------------------
// The map's props reference the ERW Atlas-Props gids; we render them with the game's OWN forest
// pack + ruin props (same art family), mapped by a deterministic per-position hash so the forest
// reads varied but reproducible. Tiled tile-objects anchor at bottom-LEFT → bottom-centre is (x+w/2,y).
function grp(name){
  const re=new RegExp(`<objectgroup[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</objectgroup>`);
  const m=re.exec(xml); if(!m) return [];
  const out=[];
  for(const om of m[1].matchAll(/<object\b([^>]*?)\/?>/g)){
    const a=om[1];
    const gid=/gid="(\d+)"/.exec(a), x=/\bx="([\d.]+)"/.exec(a), y=/\by="([\d.]+)"/.exec(a);
    const w=/width="([\d.]+)"/.exec(a), h=/height="([\d.]+)"/.exec(a);
    const nm=/name="([^"]*)"/.exec(a), ty=/type="([^"]*)"/.exec(a);
    if(!x||!y) continue;
    out.push({ gid: gid?(+gid[1]&GID_MASK):0, x:+x[1], y:+y[1], w:w?+w[1]:0, h:h?+h[1]:0,
               name:nm?nm[1]:"", type:ty?ty[1]:"" });
  }
  return out;
}
const hash=(x,y)=>((Math.round(x)*73856093) ^ (Math.round(y)*19349663))>>>0;
const GREEN=["tree_1","tree_2","tree_3","tree_4","tree_5","tree_6"];
const YELLOW=["tree_1_yellow","tree_2_yellow","tree_3_yellow","tree_4_yellow","tree_5_yellow","tree_6_yellow"];
const PINE=["pine_1","pine_2","pine_3","pine_4","pine_5","pine_6","pine_7","pine_8","pine_9","pine_10"];
const ROCK=["rock_1_3","rock_2_1","rock_3_2","rock_4_1","rock_5_2"];
const FLOWER=["flower_1","flower_2","flower_3","flower_4","flower_5","flower_6"];
const GRASSD=["grass_1","grass_2","bush_1"];
const STRUCT=["prop_ruin_obelisk","prop_ruin_statue","prop_erw_altar","prop_ruin_arch","prop_erw_fountain"];
const pick=(arr,hh)=>arr[hh%arr.length];
function treeKind(hh){ const r=hh%100; const a=r<45?GREEN:(r<85?YELLOW:PINE); return "prop_f_"+pick(a,(hh>>>3)); }

const decoKinds=[]; const kidx=new Map();
const ki=(k)=>{ if(!kidx.has(k)){ kidx.set(k,decoKinds.length); decoKinds.push(k); } return kidx.get(k); };
const deco=[];
function addObj(o, kind, solidR){
  const px=Math.round(o.x + (o.w||0)/2), py=Math.round(o.y);   // bottom-centre anchor
  deco.push([px, py, ki(kind), solidR||0]);
}
// vegetacion → forest trees (bulk of the continent), solid so the forest has substance
for(const o of grp("vegetacion")) addObj(o, treeKind(hash(o.x,o.y)), 9);
// estructuras → ruin/altar/obelisk landmarks (solid)
for(const o of grp("estructuras")){ const hh=hash(o.x,o.y); addObj(o, pick(STRUCT,hh), 14); }
// decor-suelo → ground clutter (flowers/grass/rocks), non-solid
for(const o of grp("decor-suelo")){ const hh=hash(o.x,o.y); const r=hh%100;
  const k = r<50 ? "prop_f_"+pick(FLOWER,hh>>>2) : (r<80 ? "prop_f_"+pick(GRASSD,hh>>>2) : "prop_f_"+pick(ROCK,hh>>>2));
  addObj(o, k, 0); }
console.log(`deco: ${deco.length} (kinds ${decoKinds.length})`);

// ---- NPCs (hub services) — especie lives in a child <property>, so parse per object block -------
const npcs = [];
{
  const seg = /<objectgroup[^>]*name="spawns-npcs"[^>]*>([\s\S]*?)<\/objectgroup>/.exec(xml)[1];
  for (const b of (seg.match(/<object\b[\s\S]*?<\/object>/g) || [])) {
    const x = +/\bx="([\d.]+)"/.exec(b)[1], y = +/\by="([\d.]+)"/.exec(b)[1];
    const esp = (/<property name="especie" value="([^"]+)"/.exec(b) || [])[1] || "";
    npcs.push({ x: Math.round(x), y: Math.round(y), especie: esp });
  }
}
console.log("npcs:", npcs.map(n => n.especie).join(", "));

// ---- hunt zones (8) → difficulty tiers by distance from the hub --------------------------------
const TS2 = 32;
const zRaw = grp("zonas-hunt").map(o => ({
  x: Math.round(o.x / TS2), y: Math.round(o.y / TS2),
  w: Math.max(4, Math.round(o.w / TS2)), h: Math.max(4, Math.round(o.h / TS2)),
  name: o.name, cx: o.x + o.w / 2, cy: o.y + o.h / 2,
}));
zRaw.sort((a, b) => Math.hypot(a.cx - hub.x, a.cy - hub.y) - Math.hypot(b.cx - hub.x, b.cy - hub.y));
const TIERS = ["forest", "forest", "ruins", "ruins", "caves", "caves", "arena", "arena"]; // tier 1→4 across 8 zones
const huntZones = zRaw.map((z, i) => {
  const tier = TIERS[Math.min(i, TIERS.length - 1)];
  const types = i >= 6 ? ["moose", "moose", "golem"] : ["moose"]; // golem elite in the two hardest zones
  return { x: z.x, y: z.y, w: z.w, h: z.h, tier, types, name: z.name };
});
console.log("huntZones:", huntZones.map(z => `${z.name.replace("Zona de caza - ","")}[${z.tier}]`).join(", "));

const body =
`// GENERATED by tools/tiled-convert.mjs from assets/maps/src/mithralda_world.tmx — DO NOT EDIT.
// Compact RLE of the hand-built Tiled continent (${W}x${H}). Decoded by sim/world.js buildTiledWorld().
export const MAP = {
  W: ${W}, H: ${H},
  hub: ${JSON.stringify(hub)},
  terrRLE: ${JSON.stringify(terrRLE)},
  wallRLE: ${JSON.stringify(wallRLE)},
  decoKinds: ${JSON.stringify(decoKinds)},
  deco: ${JSON.stringify(deco)},
  npcs: ${JSON.stringify(npcs)},
  huntZones: ${JSON.stringify(huntZones)},
};
`;
writeFileSync(OUT, body);
const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
console.log(`wrote ${OUT} (${kb} KB)`);
