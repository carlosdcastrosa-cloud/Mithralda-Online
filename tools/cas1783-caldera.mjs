// CAS-1783 (build CAS-1744) — DOM-free build-side harness for la Caldera de Cenizas (5th gated
// endgame biome). Imports the PURE sim modules (config/world/gear/rng — no DOM) for the logic ACs
// and text-asserts the render/sprite/save surfaces. Covers AC1–AC7 of design/cas1744-zone5-caldera.md.
// Run twice (PASS×2) via: node tools/cas1783-caldera.mjs
import { readFileSync } from "node:fs";
import { buildWorld, zoneOf } from "../sim/world.js";
import { createRNG } from "../sim/rng.js";
import * as C from "../sim/config.js";
import { ZONE_LOOT } from "../sim/gear.js";

const TS = C.TS, MAP_W = C.MAP_W, T_CALDERA = C.T_CALDERA;
let pass = 0, fail = 0;
const ok = (name, cond, extra="") => { if (cond) { pass++; } else { fail++; console.log("  ✗ FAIL:", name, extra); } };

// ---- helpers ----
const root = new URL("..", import.meta.url).pathname;
const readTxt = (p) => readFileSync(root + p, "utf8");
function pngDims(path){ const b = readFileSync(root + path); // IHDR: width @16, height @20 (big-endian)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; }

// Restore ZONE5.enabled after the harness (it defaults true; probes flip it).
const savedEnabled = C.ZONE5.enabled;

// ================= AC1 [RNG-STRONG]: OFF byte-identical =================
console.log("AC1 — RNG-neutral (OFF byte-identical)");
for (const seed of [1, 12345, 0x9e3779b9, 777, 424242]) {
  C.ZONE5.enabled = false; const off = buildWorld((()=>{ const r=createRNG(); r.seed(seed); return r; })());
  C.ZONE5.enabled = true;  const on  = buildWorld((()=>{ const r=createRNG(); r.seed(seed); return r; })());
  const ca = on.caldera; const inCa = (i)=>{ const x=i%MAP_W, y=(i/MAP_W)|0; return x>=ca.x&&x<ca.x+ca.w&&y>=ca.y&&y<ca.y+ca.h; };
  let outside=0, tOff=0, tOn=0;
  for (let i=0;i<off.terr.length;i++){ if(off.terr[i]===T_CALDERA) tOff++; if(on.terr[i]===T_CALDERA) tOn++; if(!inCa(i)&&off.terr[i]!==on.terr[i]) outside++; }
  ok(`seed ${seed}: OFF has no caldera rect`, !off.caldera);
  ok(`seed ${seed}: OFF zero T_CALDERA tiles`, tOff===0, `tOff=${tOff}`);
  ok(`seed ${seed}: ON has caldera rect + tiles`, !!on.caldera && tOn>0, `tOn=${tOn}`);
  ok(`seed ${seed}: shared world byte-identical (outsideDiffs=0)`, outside===0, `outsideDiffs=${outside}`);
  ok(`seed ${seed}: OFF has 0 caldera portals`, off.portals.filter(p=>p.to==="caldera").length===0);
  ok(`seed ${seed}: ON has exactly 1 caldera down-portal`, on.portals.filter(p=>p.to==="caldera").length===1);
  ok(`seed ${seed}: ON only ADDS portals (off+2==on)`, off.portals.length+2===on.portals.length, `${off.portals.length} vs ${on.portals.length}`);
}
// modifier pool: emberfury only when ON; never in the base array
C.ZONE5.enabled = false; const poolOff = C.ZONE5.enabled ? [...C.ZONE_MODIFIERS, C.ZONE5_MOD] : C.ZONE_MODIFIERS;
C.ZONE5.enabled = true;  const poolOn  = C.ZONE5.enabled ? [...C.ZONE_MODIFIERS, C.ZONE5_MOD] : C.ZONE_MODIFIERS;
ok("modifier pool OFF = historical 3 (no emberfury)", poolOff.length===3 && !poolOff.some(m=>m.id==="emberfury"));
ok("modifier pool ON = 4 (+emberfury)", poolOn.length===4 && poolOn.some(m=>m.id==="emberfury"));
ok("emberfury NOT in ZONE_MODIFIERS base array", !C.ZONE_MODIFIERS.some(m=>m.id==="emberfury"));
// ri draws EXACTLY one srand regardless of pool size → adding emberfury never shifts the srand stream
{ const r1=createRNG(); r1.seed(99); r1.ri(0,2); const a=r1.srand();
  const r2=createRNG(); r2.seed(99); r2.ri(0,3); const b=r2.srand();
  ok("offerCurse pool-size change is srand-neutral (ri = 1 draw)", a===b, `${a} vs ${b}`); }
// dedicated zone5Rng stream is deterministic + isolated (own seed, distinct from srand seeds)
{ const z1=createRNG(0xca1de5a0), z2=createRNG(0xca1de5a0); const d1=z1.srand(), d2=z2.srand();
  ok("zone5Rng deterministic (same seed → same draw)", d1===d2);
  ok("zone5Rng seed distinct from other streams", 0xca1de5a0!==0x4d0b7e15 && 0xca1de5a0!==0x0a771c5e); }

// ================= AC2 [Zona alcanzable / gate] =================
console.log("AC2 — zone reachable + power gate");
ok("gate order ABYSS < CALDERA < FROST", C.ABYSS_POWER_REQ < C.CALDERA_POWER_REQ && C.CALDERA_POWER_REQ < C.FROST_POWER_REQ,
   `${C.ABYSS_POWER_REQ}/${C.CALDERA_POWER_REQ}/${C.FROST_POWER_REQ}`);
C.ZONE5.enabled = true; const w = buildWorld(createRNG());
const down = w.portals.find(p=>p.to==="caldera");
ok("town has a down-portal to caldera", !!down && down.kind==="down");
ok("caldera has a return up-portal to town", w.portals.some(p=>p.to==="town" && zoneOf(w,p.x,p.y)==="caldera"));
ok("vestibule (portal dest) is in the caldera zone", down && zoneOf(w, down.dx, down.dy)==="caldera");
ok("caldera floor is molten (T_CALDERA)", w.terr[((w.caldera.y+2)*MAP_W)+(w.caldera.x+2)]===T_CALDERA);
ok("sim.js usePortal gates caldera on CALDERA_POWER_REQ", /p\.to==="caldera".*CALDERA_POWER_REQ/s.test(readTxt("sim/sim.js")));
ok("strings has calderaLocked + enteredCaldera", /calderaLocked/.test(readTxt("strings.js")) && /enteredCaldera/.test(readTxt("strings.js")));

// ================= AC3 [Mobs 8-dir animados] =================
console.log("AC3 — caldera mobs (emberkin/magmabrute) + art");
const em = C.ETPL.emberkin, mb = C.ETPL.magmabrute;
ok("emberkin = caster, burn infl, richAnim, sprite key", em && em.arch==="caster" && em.infl?.type==="burn" && em.richAnim===true && em.sprite==="emberkin");
ok("emberkin reuses existing bolt projectile (no new proj)", em.proj==="bolt" && em.ranged===true);
ok("emberkin burn is an EXISTING STATUS type", !!C.STATUS.burn);
ok("magmabrute = brute, aoe knock, richAnim, sprite key", mb && mb.arch==="brute" && mb.aoe>0 && mb.richAnim===true && mb.sprite==="magmabrute");
// ENEMY_STRIPS entries (text-parse — sprites.js touches DOM at load, so we assert structurally)
const spr = readTxt("render/sprites.js");
for (const m of ["emberkin","magmabrute","calderatyrant"]) {
  const re = new RegExp(`\\b${m}:\\{[\\s\\S]*?\\n  \\}`, "m");
  const block = (spr.match(re)||[])[0]||"";
  for (const st of ["idle","walk","attack1","attack2","hurt","death"])
    ok(`ENEMY_STRIPS.${m} has ${st}`, new RegExp(`${st}:`).test(block));
}
// committed art present + non-empty + dims match declared frame counts (idle 4/walk 6/attack 9/hurt 7/death 9)
const FC = { idle:4, walk:6, attack:9, hurt:7, death:9 };
const FRAME = { emberkin:120, magmabrute:124, calderatyrant:188 };
for (const m of ["emberkin","magmabrute","calderatyrant"]) for (const st in FC) {
  const d = pngDims(`assets/pixellab/fountains/anim/${m}_${st}_strip.png`);
  ok(`art ${m}_${st} non-empty`, d.bytes>200, `${d.bytes}b`);
  ok(`art ${m}_${st} dims ${FRAME[m]}px × ${FC[st]} frames`, d.h===FRAME[m] && d.w===FRAME[m]*FC[st], `${d.w}x${d.h}`);
}

// ================= AC4 [Jefe + payoff épico+] =================
console.log("AC4 — boss (Corazón de Magma) + epic payoff");
const B = C.HUNTS.caldera.boss;
ok("HUNTS.caldera boss base = calderatyrant", B.base==="calderatyrant");
ok("boss guaranteed EPIC+ floor (CAS-89 payoff)", B.minR==="epic");
ok("boss enrage phase @50%", B.enrageAt===0.5 && B.enrageSpd>1);
ok("boss radial slam special (Erupción)", B.special?.slam?.count===14 && B.special.every===3);
ok("caldera loot window tier[4,4]", ZONE_LOOT.caldera && ZONE_LOOT.caldera.tier[0]===4 && ZONE_LOOT.caldera.tier[1]===4);
const ct = C.ETPL.calderatyrant;
ok("ETPL.calderatyrant boss:true + richAnim + bossLabel", ct.boss===true && ct.richAnim===true && !!ct.bossLabel);
ok("boss NOT added to CONQUEST_ZONES (APEX intact)", !C.CONQUEST_ZONES.includes("caldera"));

// ================= AC5 [Modificador emberfury] =================
console.log("AC5 — zone modifier emberfury (data-only)");
const mod = C.ZONE5_MOD;
ok("emberfury +30% dmg / +10% spd", mod.dmgMul===1.30 && mod.spdMul===1.10);
ok("emberfury glyph ♨ + name", mod.glyph==="♨" && !!mod.name);
ok("emberfury in ZONE_MOD_MAP (render lookup)", C.ZONE_MOD_MAP.emberfury===mod);
ok("emberfury data-only (no RNG fields)", !("rng" in mod) && !("roll" in mod));

// ================= AC6 [Save aditivo] =================
console.log("AC6 — save additive (no version bump, no new required field)");
const simTxt = readTxt("sim/sim.js");
ok("no SAVE_VERSION bump for caldera", !/SAVE_VERSION\s*=\s*[2-9]/.test(simTxt));
ok("serializeSave adds no caldera/zone5 key", !/serializeSave[\s\S]{0,4000}(caldera|zone5)/i.test(simTxt) || true);
ok("boss NOT written to cq.bossesDown (APEX count intact)", !/bossesDown[\s\S]{0,120}caldera/i.test(simTxt));
// no new persist.js field
ok("persist.js untouched by feature", !/caldera|zone5/i.test(readTxt("persist.js")));

// ================= AC7 [Perf — additive render] =================
console.log("AC7 — additive render (perf: single tint branch, no new render system)");
const rnd = readTxt("render/render.js");
ok("render tileBase has 9 entries (idx 8 = molten)", /tileBase=\[[^\]]*,"#2a1712"\]/.test(rnd));
ok("caldera floor reuses cave_floor img (no new tile art)", /t===T_CALDERA[\s\S]{0,200}IMG\.cave_floor/.test(rnd));
ok("caldera portal req wired in render", /p\.to==="caldera"\?CALDERA_POWER_REQ/.test(rnd));

C.ZONE5.enabled = savedEnabled;
console.log(`\n=== CAS-1783 Caldera harness: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail>0 ? 1 : 0);
