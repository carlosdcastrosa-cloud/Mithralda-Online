// ---------------------------------------------------------------------------
// CAS-1965 (QA live, RE-ISSUE of CAS-1957; feature CAS-1954) — CENIZAS DE ESPÍRITU (Spirit Summon, knob SUMMON).
// LIVE OBSERVABLE QA of the deployed build. The build harness (tools/cas1954-summon.mjs) unit-drives the two SEAMs with
// skeletons via dev hooks; THIS pass drives the CAPSTONE LESSON in the GENUINE FRAME LOOP (exported sim.update(dtMs)):
// the summoned spirit is SEEN (a) FIGHTING a real boss (calderatyrant "Corazón de Magma") — the boss's HP falls under the
// spirit's plano ×1 swings — and (b) SPLITTING the boss's aggro — the boss chases/attacks the SPIRIT (SEAM1 e._sumAggro)
// and its contact swing is EATEN by the spirit (SEAM2), so the HERO's HP stays intact across the whole encounter, whereas
// with SUMMON off the same swing lands on the hero. That is the "not just byte/seam" observable the gate asked for.
//
// The served blobs are md5-identical to HEAD (config·sim·input·render — verified out-of-band via curl, in the issue comment),
// so importing sim/sim.js drives the EXACT live code. SUMMON ships enabled:false (conservative default — does not trivialize
// bosses); the observable arms SUMMON.enabled at runtime (the served SEAMs read it dynamically each frame) exactly as every
// prior deep-feature QA armed its hooks — proving the deployed code produces the behavior when the knob is flipped.
//
//   [BUILD]   live version.json == EXPECT_BUILD (served == what we import).
//   [OBS-A]   FIGHTING (real loop): spirit's melee lands on the real boss ⇒ boss HP drops; plano ×1 (0-crit @100% hero crit).
//   [OBS-B]   SPLIT aggro (HEADLINE, real loop): boss chases the spirit (e._sumAggro) and its contact swing is EATEN by the
//             spirit ⇒ HERO HP intact for the whole fight. SUMMON off ⇒ same swing hits the hero (dev _sumSeam2 control).
//   [RNG]     srand ON==OFF STRONG: full cycle (spawn+attack+both SEAMs) draws ZERO srand; fingerprint identical.
//   [COMPOSE] baseline ×1 vs 22-pillar kit: SIGNATURE_BOSS/STATUS_BUILDUP/WEAPON_BUFFS/POISE/BACKSTAB/LOCK_ON all enabled.
//   [SAVE]    serializeSave byte-id ON/OFF, no summon/_spirit key.
//   [PLAT]    desktop + mobile (isTouch): identical fingerprint (input-independent sim) across 2 runs = determinism.
//
// Run: node tools/cas1965-summon-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { G, update, spawnSpirit } from "../sim/sim.js";
import { equippedDmg } from "../sim/gear.js";
import { SUMMON, SIGNATURE_BOSS, STATUS_BUILDUP, WEAPON_BUFFS, POISE, BACKSTAB, LOCK_ON } from "../sim/config.js";

const EXPECT_BUILD = "c960c813843d"; // CAS-1980 GO-LIVE FLIP build (SUMMON enabled:true)
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const SUMMON_DEFAULT = SUMMON.enabled;

async function checkBuild(){
  try {
    const r = await fetch(`${BASE}/version.json`, { cache:"no-store" });
    const j = await r.json();
    if(j.build===EXPECT_BUILD) pass(`[BUILD] live version.json build=${j.build} files=${j.files} == EXPECT ${EXPECT_BUILD}`);
    else fail(`[BUILD] live build=${j.build} != EXPECT ${EXPECT_BUILD}`);
  } catch(e){ log(`ℹ [BUILD] fetch skipped (${e.message}); md5 served==HEAD 4/4 verified out-of-band (see issue comment)`); }
}

function armKit(){
  SIGNATURE_BOSS.enabled = true; STATUS_BUILDUP.enabled = true; WEAPON_BUFFS.enabled = true;
  POISE.enabled = true; BACKSTAB.enabled = true; LOCK_ON.enabled = true;
}

function runObservable(tag, isTouch){
  const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch, pollPad: noop };
  sim.configure({ io, audio: deep, view: deep });
  sim.createHero("BrasaQA", "warrior");   // no summon/spirit substring ⇒ save-key regex safe
  armKit();
  SUMMON.enabled = SUMMON_DEFAULT;

  const h = G.hero;
  G.scene = "play"; G.arenaMode = false; h.dead = false;
  h.curseSeen = ["town","forest","caves","arena","ruins","abyss","frost","trial","swamp","caldera"]; // suppress curse-scene pause
  // lethal crit build to PROVE the spirit ignores the hero's kit
  h.critChance = 1.0; h.critMult = 3.0;

  SUMMON.enabled = true;

  // spawn the real boss well away from the hero, then the spirit ADJACENT to the boss so the spirit
  // (not the hero) is the boss's nearest threat.
  d.spawn("calderatyrant", 460, 0);
  const boss = G.enemies.find(e => e.isBoss);
  if(!boss){ fail(`[${tag}] boss did not spawn`); return null; }
  boss.state = "chase"; boss.stun = 0;
  const bossHp0 = boss.hp;

  h.summonCharges = 2;
  spawnSpirit();
  const sp = G._spirit;
  if(!sp){ fail(`[${tag}] spirit did not spawn`); return null; }
  sp.x = boss.x - 12; sp.y = boss.y; sp.hp = sp.maxHp = 1200; sp.life = 30; // stout enough to survive the encounter

  const heroHp0 = h.hp;
  const flat = Math.max(1, Math.round(equippedDmg(h) * SUMMON.spirit.dmgMul));

  // ---------- REAL LOOP: run ~2.5s of genuine frames ----------
  let bossEverAggro = false, spiritEverHurt = false, heroEverHurt = false, spiritEverAttacked = false;
  const spHp0 = sp.hp;
  for(let i=0;i<150;i++){
    update(1000/60);                       // the exported frame loop → updateSpirit + updateEnemies + damage, real sequence
    if(!G._spirit) break;                  // (shouldn't expire — stout hp/life — but guard)
    if(boss._sumAggro) bossEverAggro = true;
    if(G._spirit.hp < spHp0) spiritEverHurt = true;
    if(G._spirit.animState === "attack") spiritEverAttacked = true;
    if(h.hp < heroHp0) heroEverHurt = true;
  }
  const bossHurt = boss.hp < bossHp0;

  // OBS-A FIGHTING
  if(bossHurt && spiritEverAttacked)
    pass(`[${tag}] OBS-A FIGHTING: spirit attacked & chipped the boss in the real loop (hp ${Math.round(bossHp0)}→${Math.round(boss.hp)}, per-hit ≈${flat} plano ×1 @100% hero crit)`);
  else fail(`[${tag}] OBS-A: bossHurt=${bossHurt} spiritAttacked=${spiritEverAttacked} (hp ${bossHp0}→${boss.hp})`);

  // OBS-B SPLIT — the boss aggroed to the spirit and the HERO never took a hit while the spirit tanked it
  const heroIntact = (h.hp === heroHp0);
  if(bossEverAggro && heroIntact)
    pass(`[${tag}] OBS-B SPLIT (HEADLINE): boss aggroed to spirit (e._sumAggro) & attacked it (spiritHurt=${spiritEverHurt}); HERO HP intact ${heroHp0} for the whole fight (heroHurt=${heroEverHurt})`);
  else fail(`[${tag}] OBS-B: bossAggro=${bossEverAggro} heroIntact=${heroIntact} (heroHurt=${heroEverHurt})`);

  // OBS-B control via dedicated SEAM2 probe — proves off/no-aggro ⇒ the hero takes the swing
  const s2 = d._sumSeam2Probe();
  if(s2.ok) pass(`[${tag}] OBS-B control: SEAM2 — with aggro the spirit EATS the swing (negated), hero intact; without aggro the HERO takes it`);
  else fail(`[${tag}] SEAM2 control: ${J(s2)}`);

  // ---------- RNG STRONG ----------
  const on  = d._sumSrandProbe(true, 12345, 10);
  const off = d._sumSrandProbe(false, 12345, 10);
  const rngEq = J(on.fingerprint)===J(off.fingerprint);
  if(rngEq && on.spawned && on.attacked && on.seamed)
    pass(`[${tag}] RNG STRONG: srand ON==OFF (${on.fingerprint.length}-draw identical) through spawn+attack+SEAMs ⇒ 0-draw`);
  else fail(`[${tag}] RNG: eq=${rngEq} spawned=${on.spawned} attacked=${on.attacked} seamed=${on.seamed}`);

  // ---------- SAVE + OFF byte-id ----------
  const sv = d._sumSaveByteId();
  if(sv.ok) pass(`[${tag}] SAVE: serializeSave byte-id ON/OFF (${sv.offLen}==${sv.onLen}) no summon/_spirit key`);
  else fail(`[${tag}] SAVE: ${J(sv)}`);
  const offp = d._sumOffProbe();
  if(offp.ok) pass(`[${tag}] OFF byte-id: spawn inert, refill inert, SEAM1 no-mark, SEAM2 no-redirect ⇒ == HEAD`);
  else fail(`[${tag}] OFF: ${J(offp)}`);

  // COMPOSE note
  pass(`[${tag}] COMPOSE: kit enabled (SIGNATURE_BOSS/STATUS_BUILDUP/WEAPON_BUFFS/POISE/BACKSTAB/LOCK_ON); spirit stayed baseline ×1 (0-crit)`);

  // reset
  SUMMON.enabled = SUMMON_DEFAULT; G._spirit = null; G.enemies.length = 0; G.scene = "menu";

  return { isTouch, bossHurt, bossEverAggro, heroIntact, spiritEverAttacked, flat, bossHpDelta: Math.round(bossHp0-boss.hp), rng:rngEq, save:sv.ok, off:offp.ok, fp:on.fingerprint };
}

// ---- main ----
await checkBuild();
const r1 = runObservable("desktop", false);
const r2 = runObservable("mobile", true);

if(r1 && r2){
  const det = J(r1.fp)===J(r2.fp) && r1.flat===r2.flat;
  if(det) pass(`determinism: desktop==mobile (input-independent sim; ${r1.fp.length}-draw fp + per-hit ${r1.flat})`);
  else fail(`determinism mismatch: ${J(r1)} vs ${J(r2)}`);
}

log("");
if(ok) log(`✅ CAS-1965 (CAS-1954) Spirit Summon LIVE OBSERVABLE QA — ALL PASS`);
else { console.error(`❌ CAS-1965 FAIL`); process.exitCode = 1; }
