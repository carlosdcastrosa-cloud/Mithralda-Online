// ===========================================================================
// sim/sim.js — the deterministic simulation core (Stage-2 server-authority ready)
//
// Owns the authoritative game state `G` + the procedural `world`, and advances
// them via update(dt). Contains ZERO ctx/DOM access: everything the simulation
// needs from the outside is injected through configure({ io, audio, view }):
//   - io    : sampled player intent (move vector, aim, gamepad, touch flags)
//   - audio : sound effect / music sink (a no-op on a headless server)
//   - view  : plain viewport numbers used only for the presentation camera
// A Stage-2 networking layer can wrap this module by feeding intents per tick
// and ignoring audio/view — no rewrite of the gameplay logic required.
//
// All randomness flows through this module's private RNG stream (`rng`), seeded
// in buildWorld, so a fixed seed + identical intent stream => identical sim.
// ===========================================================================
import { STR } from "../strings.js";
import { TS, MAP_W, MAP_H, T_WATER, CFG, ATK, ETPL, SPELLS, CLASS_STATS, HUNTS, ZONE_TIER, ABYSS_POWER_REQ, FROST_POWER_REQ, STAGE1_GOAL, STATUS, AMBUSH, MASTERY } from "./config.js";
import { clamp, lerp, dist2, norm, angDiff } from "./math.js";
import { createRNG } from "./rng.js";
import { buildWorld, zoneOf } from "./world.js";
import { ZONE_LOOT, gearStat, gearName, gearDef, gearCol, rarityRank, rollGearInst, equippedDmg, equippedDef, affixTotals, heroMaxHp, AFFIXES, weaponProcs, RARITY_ORDER } from "./gear.js";
import { TALENTS, talentNode, talentNodes, talentTotals, talentSpent, canAllocTalent, sanitizeTalents, talentPoison, zeroTT, CRIT_BASE } from "./talents.js";

// feedback floater palette (presentation hints carried by sim events)
const C_CREAM = "#e8e0d0", C_GOLD = "#f2c14e";

// private simulation RNG stream — isolated from render randomness
const rng = createRNG();
const { srand, seed, rr, ri } = rng;

// cosmetic particle-scatter RNG — a SECOND isolated stream for FX jitter only
// (flame/heal scatter, ground-drop x-offset). Keeping these off the authoritative
// stream means cosmetic particles never perturb gameplay RNG, so loot/spawn
// sequences stay byte-identical for a seed (Stage-2 server authority). Mirrors
// the render-side isolation established in CAS-15.
const fxRng = createRNG();
const frr = (a,b)=>fxRng.rr(a,b);

// the authoritative world (deterministic for the fixed seed)
const world = buildWorld(rng);

// injected dependencies (set by the orchestrator before the loop runs)
let io = null, audio = null, view = null;
export function configure(deps){ io = deps.io; audio = deps.audio; view = deps.view; }

export { world, rng };

export const G = {
  scene:"menu", // menu, play, dialogue, shop, bounty, inventory, talents, pause, dead, victory
  // CAS-123: frozen run-summary snapshot built when the Stage-1 final boss dies; read by
  // renderVictory(). null until the win fires. Cleared scene-side only (the win persists
  // on the hero), so re-opening it is harmless.
  victory:null,
  talFocus:0,   // CAS-119: keyboard-focused talent node index (talents panel)
  t:0, hero:null, enemies:[], projectiles:[], fields:[], fx:[], floaters:[], drops:[],
  // CAS-127: reduceMotion is the accessibility off-switch — it gates screen shake and
  // trims flourish particle bursts (never changes balance/mechanics; purely cosmetic).
  cam:{x:0,y:0}, shake:0, settings:{shake:1, crt:false, rollAim:false, reduceMotion:false},
  quest:{wolves:0, done:false, rewarded:false}, hunts:{}, dialog:null, shopSel:0, bountySel:0,
  // CAS-146 — elite-ambush event clock: `t` counts down only while the hero is fighting in a
  // hunt zone; `active` is true from an ambush firing until its elite is cleared (auto-recovers).
  ambush:{t:AMBUSH.first, active:false},
  toast:"", toastT:0, music:"town", arenaWarned:false, bossDead:false,
  skull:{level:0, t:0, kills:0, killT:0}, started:false,
  hitstop:0, // client-feel impact freeze (frames @60fps); never gates authoritative state beyond pausing local sim
  // CAS-128: first-session onboarding tutorial. null = inactive; a small deterministic
  // step machine (no DOM, no RNG) that observes hero state + a few event flags and
  // renders coachmarks. Persisted in the save so a mid-tutorial refresh resumes it.
  tut:null,
};
// CAS-128: armed at boot by the persistence controller when this is a FIRST run
// (no save AND the tutorial-seen flag is unset). createHero() reads it once so the
// guided flow only ever auto-starts for a brand-new player; returning players never
// see it (a loaded save jumps straight to play). Replay is on demand from the menu.
let tutArmed = false;

function newHero(name,cls){
  cls = cls||"warrior";
  // CAS-100: base stats + per-level growth + mobility come from CLASS_STATS so each
  // class plays differently from level 1 (warrior fallback keeps unknown class safe).
  const cs = CLASS_STATS[cls] || CLASS_STATS.warrior;
  return { name:name||"Héroe", x:world.tcx, y:world.tcy+TS*2, vx:0,vy:0, facing:Math.PI/2,
    hp:cs.hp, maxHp:cs.hp, mp:cs.mp, maxMp:cs.mp, lvl:1, xp:0, xpNext:60, gold:30,
    baseDmg:cs.dmg, dmgBonus:0, defBonus:0,
    // per-class mobility (px/s) + level-growth amounts; read by movement / gainXP.
    moveSpeed:CFG.heroSpeed*cs.moveScale, hpGain:cs.hpGain, mpGain:cs.mpGain, dmgGain:cs.dmgGain,
    // spell state: per-slot cooldowns (slots 1-3) + timed buff/HoT amounts. dmgBonus/
    // defBonus are the buff sinks (equippedDmg/Def read them), restored on expiry.
    spellCD:[0,0,0,0], spellCDmax:[0,0,0,0],
    dmgBuffT:0, dmgBuffAmt:0, defBuffT:0, defBuffAmt:0, hotT:0, hotRate:0,
    rolling:false, rollT:0, rollCD:0, iframe:0, atkCD:0, atkT:0, atkAng:0, atkAnim:0, hurtFlash:0, walkT:0, dead:false, moved:false,
    // CAS-118 status sinks (mirror the enemy fields): slow scales move speed, stun gates
    // input, dots holds active DoTs. Transient — never serialized (rehydrated clean).
    slow:1, slowT:0, stun:0, dots:null,
    animState:"idle", animT:0, cls:cls||"warrior",
    // CAS-119: talent progression. talents = {nodeId:rank} chosen by the player,
    // talentPts = unspent points (1 granted per level in gainXP). tt = the CACHED
    // aggregated combat bundle (recalcTalents) read by the hot path with no alloc.
    talents:{}, talentPts:0, tt:zeroTT(),
    // gear: 3 equipped slots (instances by id) + a bag of loose instances. Stats
    // are resolved from data (sim/gear.js), never stored — see equippedDmg/Def.
    equip:{ weapon:{slot:"weapon",defId:"w_iron",rarity:"common"}, body:{slot:"body",defId:"a_leather",rarity:"common"}, shield:{slot:"shield",defId:"s_wood",rarity:"common"} },
    bag:[],
    potHP:2, potMP:1, blessings:0,
    // CAS-112: persistent merchant-shop upgrade tiers (gold sink). Each bought tier
    // permanently bumps baseDmg / maxHp / defBonus — see shopItems()/buyItem().
    upg:{dmg:0, hp:0, def:0},
    // CAS-123: durable run-arc tracking for the Stage-1 finale + victory summary.
    // playT = seconds actually spent in play; deaths = run attempts; stage1 = the
    // win flag (true once the final boss has died). All three persist (serializeSave).
    playT:0, deaths:0, stage1:false,
    // CAS-134: monotonic lifetime tallies the daily-contract OBSERVER (daily.js) delta-
    // counts read-only to advance the day's "slay N" / "defeat M champions" contracts.
    // Persisted additively so the meta-loop is honest across sessions; gameplay never
    // reads these (pure counters), so no balance/determinism touch.
    kills:0, champKills:0,
    // CAS-149: monotonic lifetime ELITE-class kills (ambush elites + champions + final boss).
    // Drives the persistent Elite-Mastery rank; saved additively (no SAVE_VERSION bump).
    eliteKills:0,
    respawn:{x:world.templeF.x, y:world.templeF.y+TS} };
}
function xpForLevel(l){ return Math.floor(40*Math.pow(l,1.55)); }

// Per-zone hunt-contract progress, built fresh from HUNTS data each run.
//   kills   — enemies culled toward the quota
//   champ   — the live Champion entity while it is summoned (null otherwise)
//   cleared — zone payoff already claimed (stops further tracking)
function initHunts(){ const o={}; for(const z in HUNTS) o[z]={kills:0, champ:null, cleared:false}; return o; }

// creates the hero and enters play (audio/music wiring stays in the controller)
export function createHero(name,cls){ G.hero=newHero(name||"Héroe",cls); G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false}; G.scene="play"; G.started=true;
  if(tutArmed){ startTutorial(); tutArmed=false; } }            // CAS-128: first-run guided flow

// --------------------- CAS-128: onboarding tutorial ---------------------
// A pure, deterministic step machine layered ON TOP of the existing game (no balance
// or mechanic change). Each step advances when the sim OBSERVES the player perform the
// taught action — movement distance, an attack/skill cast, leaving town, a first pickup,
// opening the inventory — so it teaches by doing, not by reading. render/ draws the
// coachmarks; input/ owns skip + replay. Persisted (serializeSave) so a refresh resumes.
export const TUT_STEPS = ["move","attack","skill","travel","loot","equip","done"];
// number of GUIDED steps (excludes the terminal "done" celebration card)
export const TUT_NSTEPS = TUT_STEPS.length-1;
// arm/disarm from the persistence controller (first-run detection lives there)
export function setTutArm(v){ tutArmed=!!v; }
export function startTutorial(){ G.tut={ active:true, i:0, moveDist:0, atk:false, skill:false,
  looted:false, invOpened:false, doneT:0, finished:false, flushed:false }; }
// skip / finish both retire the tutorial AND flag it finished so the controller can
// persist the "seen" marker (returning players won't get it again on a fresh start).
export function tutSkip(){ if(!G.tut) return; G.tut.active=false; G.tut.finished=true; }
function tutFinish(){ if(!G.tut) return; G.tut.active=false; G.tut.finished=true; }
// event marks set from the natural action sites (heroAttack / castSpell / tryPickup);
// only recorded while a tutorial is live so they cost nothing otherwise.
function tutMark(k){ const t=G.tut; if(t&&t.active) t[k]=true; }
// One observation tick (play scene only). Advances at most one step per tick.
function tickTutorial(dt){
  const t=G.tut; if(!t||!t.active) return; const h=G.hero; if(!h) return;
  const step=TUT_STEPS[t.i];
  if(step==="done"){ t.doneT+=dt; if(t.doneT>=5){ tutFinish(); } return; }
  if(step==="move" && h.moved) t.moveDist += Math.hypot(h.vx,h.vy)*dt;
  let adv=false;
  switch(step){
    case "move":   adv = t.moveDist>70; break;                 // walked a meaningful distance
    case "attack": adv = t.atk; break;                         // swung once
    case "skill":  adv = t.skill; break;                       // cast a class skill (slot 2-4)
    case "travel": adv = zoneOf(world,h.x,h.y)!=="town"; break;// left the safe town
    case "loot":   adv = t.looted; break;                      // picked up a first drop
    case "equip":  adv = t.invOpened; break;                   // opened the inventory
  }
  if(adv){ t.i++; if(audio&&audio.sfx&&audio.sfx.pickup) audio.sfx.pickup();
    if(TUT_STEPS[t.i]==="done") t.doneT=0; }
}

// --------------------- CAS-113: progression persistence -----------------
// The sim owns SERIALIZATION of its authoritative progression state (a Stage-2
// server would persist the same fields); the storage medium (localStorage) and
// save cadence live in the controller (persist.js) so the deterministic core
// keeps ZERO DOM/web-storage access. Bump SAVE_VERSION to invalidate old blobs.
export const SAVE_VERSION = 1;
function num(v,dflt){ return (typeof v==="number" && isFinite(v))?v:dflt; }
// Validate a stored gear instance against the gear data; drop anything unknown so
// a corrupted/old save can never render or compute against a missing def.
function safeInst(inst){ if(!(inst && inst.slot && gearDef(inst.slot,inst.defId))) return null;
  const o={slot:inst.slot,defId:inst.defId,rarity:RARITY_VALID(inst.rarity)};
  const af=safeAffixes(inst.affixes); if(af) o.affixes=af; return o; }
function RARITY_VALID(r){ return (r==="common"||r==="uncommon"||r==="rare"||r==="epic")?r:"common"; }
// CAS-117: validate persisted affixes — drop anything unknown/malformed so a
// corrupted/old save can never compute against a missing affix; cap at 2.
function safeAffixes(arr){ if(!Array.isArray(arr)) return null; const out=[];
  for(const a of arr){ if(a&&AFFIXES[a.id]&&typeof a.amt==="number"&&isFinite(a.amt)){ out.push({id:a.id,amt:Math.max(0,Math.round(a.amt))}); if(out.length>=2) break; } }
  return out.length?out:null; }
// Snapshot the DURABLE hero progression as a plain JSON-safe blob. Transient
// combat/anim/buff state is intentionally excluded (rehydrated clean), and any
// active timed buff is stripped from the bonus sinks so only PERMANENT power is
// saved — a save taken mid-buff can never bake the buff in forever.
export function serializeSave(){
  const h=G.hero; if(!h) return null;
  const permDmg=h.dmgBonus-(h.dmgBuffT>0?h.dmgBuffAmt:0);
  const permDef=h.defBonus-(h.defBuffT>0?h.defBuffAmt:0);
  return { version:SAVE_VERSION, name:h.name, cls:h.cls,
    gold:h.gold, lvl:h.lvl, xp:h.xp, xpNext:h.xpNext,
    maxHp:h.maxHp, maxMp:h.maxMp, baseDmg:h.baseDmg, dmgBonus:permDmg, defBonus:permDef,
    upg:{dmg:(h.upg&&h.upg.dmg)||0, hp:(h.upg&&h.upg.hp)||0, def:(h.upg&&h.upg.def)||0},
    potHP:h.potHP, potMP:h.potMP, blessings:h.blessings,
    // CAS-119: durable build choices. Additive — old v1 saves simply lack these and
    // rehydrate with an empty tree (0 spent), so no SAVE_VERSION bump / progress wipe.
    talents:Object.assign({},h.talents), talentPts:h.talentPts||0,
    // CAS-123: durable Stage-1 arc state. Additive (old saves lack these → default to a
    // fresh, unfinished run), so no SAVE_VERSION bump / progress wipe.
    stage1:!!h.stage1, playT:h.playT||0, deaths:h.deaths||0,
    // CAS-134: durable lifetime tallies for the daily-contract observer. Additive — old
    // saves lack them → default 0 — so no SAVE_VERSION bump / progress wipe.
    kills:h.kills||0, champKills:h.champKills||0,
    // CAS-149: durable lifetime elite-kill counter → Elite-Mastery rank. Additive (old
    // saves lack it → default 0 → rank 0), so no SAVE_VERSION bump / progress wipe. The
    // permanent +maxHp granted at each rank-up is already baked into the saved maxHp above,
    // so the bonus is restored with maxHp and is NEVER re-applied on load (no double-count).
    eliteKills:h.eliteKills||0,
    // CAS-128: persist an IN-PROGRESS tutorial so a first-run refresh resumes the
    // guided flow (only the step index — per-step counters re-derive). Additive/guarded;
    // absent in old saves → no tutorial, no SAVE_VERSION bump.
    tut:(G.tut&&G.tut.active)?{i:G.tut.i}:null,
    equip:{weapon:h.equip.weapon, body:h.equip.body, shield:h.equip.shield}, bag:h.bag,
    quest:{wolves:G.quest.wolves, done:G.quest.done, rewarded:G.quest.rewarded} };
}
// Rehydrate a save blob into a live hero and enter play. Returns false (without
// mutating state) on version mismatch / bad data, so the controller can discard
// the save and fall back to the normal class-selection flow — never crashes.
export function loadSave(d){
  if(!d || d.version!==SAVE_VERSION || typeof d.cls!=="string" || !CLASS_STATS[d.cls]) return false;
  try{
    const h=newHero(typeof d.name==="string"?d.name:"Héroe", d.cls);
    h.gold=num(d.gold,h.gold); h.lvl=Math.max(1,Math.floor(num(d.lvl,1)));
    h.xp=Math.max(0,num(d.xp,0)); h.xpNext=num(d.xpNext, xpForLevel(h.lvl));
    h.maxHp=num(d.maxHp,h.maxHp); h.maxMp=num(d.maxMp,h.maxMp);
    h.baseDmg=num(d.baseDmg,h.baseDmg); h.dmgBonus=num(d.dmgBonus,0); h.defBonus=num(d.defBonus,0);
    if(d.upg) h.upg={dmg:Math.max(0,Math.floor(num(d.upg.dmg,0))), hp:Math.max(0,Math.floor(num(d.upg.hp,0))), def:Math.max(0,Math.floor(num(d.upg.def,0)))};
    h.potHP=Math.max(0,Math.floor(num(d.potHP,h.potHP))); h.potMP=Math.max(0,Math.floor(num(d.potMP,h.potMP))); h.blessings=Math.max(0,Math.floor(num(d.blessings,0)));
    if(d.equip){ for(const slot of ["weapon","body","shield"]){ const ok=safeInst(d.equip[slot]); if(ok) h.equip[slot]=ok; } }
    if(Array.isArray(d.bag)) h.bag=d.bag.map(safeInst).filter(Boolean).slice(0,16);
    // CAS-119: rebuild a LEGAL talent tree from the (untrusted) blob + recompute the
    // cached bundle, so persisted builds survive reload and corrupt data can't break it.
    h.talents=sanitizeTalents(d.talents, h.cls); h.talentPts=Math.max(0,Math.floor(num(d.talentPts,0))); recalcTalents(h);
    // CAS-123: rehydrate the Stage-1 arc (clamped; absent in old saves → fresh run).
    h.stage1=!!d.stage1; h.playT=Math.max(0,num(d.playT,0)); h.deaths=Math.max(0,Math.floor(num(d.deaths,0)));
    h.kills=Math.max(0,Math.floor(num(d.kills,0))); h.champKills=Math.max(0,Math.floor(num(d.champKills,0))); // CAS-134
    h.eliteKills=Math.max(0,Math.floor(num(d.eliteKills,0))); // CAS-149 (rank derives; maxHp already carries the baked bonus)
    h.hp=heroMaxHp(h); h.mp=h.maxMp;                       // always respawn at full
    // CAS-128: resume an in-progress tutorial (clamped); a finished/absent one stays off.
    if(d.tut && typeof d.tut.i==="number"){ startTutorial(); G.tut.i=Math.max(0,Math.min(TUT_STEPS.length-1,Math.floor(d.tut.i))); }
    else G.tut=null;
    G.hero=h; G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false};
    if(d.quest){ G.quest.wolves=Math.max(0,Math.floor(num(d.quest.wolves,0))); G.quest.done=!!d.quest.done; G.quest.rewarded=!!d.quest.rewarded; }
    G.scene="play"; G.started=true;
    return true;
  }catch(e){ return false; }
}

// ----------------------------- helpers ---------------------------------
export function toast(msg,dur){ G.toast=msg; G.toastT=dur||2.6; }
// CAS-127 — pooled, capped cosmetic feedback. Floaters & FX are the hottest
// transient allocators in a dense pack (CAS-126 stress case): without a cap they
// grow unbounded and the per-frame .filter() reallocated the whole array every
// frame (GC churn → frame-budget spikes). Floaters reuse a free list (uniform
// shape → zero steady-state alloc); FX are capped + compacted in place. Hard caps
// evict the OLDEST so the newest feedback always reads. Pure presentation: no RNG,
// no gameplay state — Stage-2 safe.
const MAX_FLOATERS=64, MAX_FX=140, _floatPool=[];
function floater(x,y,txt,col,opt){
  if(G.floaters.length>=MAX_FLOATERS) _floatPool.push(G.floaters.shift()); // recycle the oldest into the pool
  const f=_floatPool.pop()||{};
  f.x=x; f.y=y; f.txt=txt; f.col=col||C_CREAM; f.t=0;
  f.life=(opt&&opt.life)||0.9; f.pop=(opt&&opt.pop)||1; f.small=!!(opt&&opt.small); f.crit=!!(opt&&opt.crit);
  G.floaters.push(f);
}
function addFx(kind,x,y,opt){ if(G.fx.length>=MAX_FX) G.fx.shift(); G.fx.push(Object.assign({kind,x,y,t:0,life:0.4},opt)); }
// CAS-127: reduceMotion gates screen shake entirely (the off-switch) — magnitude
// still scales to the blow when on, so big hits read bigger; capped at 14.
function shakeAdd(a){ if(G.settings.reduceMotion) return; G.shake=Math.min(14, G.shake + a*(G.settings.shake)); }
// CAS-127: trim a flourish particle-burst count when reduceMotion is on (keep ≥1 so
// the event still reads); full count otherwise. Cosmetic-only, deterministic.
function rmCount(n){ return G.settings.reduceMotion ? Math.max(1, Math.round(n*0.34)) : n; }
function freeze(n){ if(n>G.hitstop) G.hitstop=n; } // request a hitstop of n frames (longest wins)
function solidBlocked(x,y,r){
  if(x<r||y<r||x>MAP_W*TS-r||y>MAP_H*TS-r) return true;
  const tx=Math.floor(x/TS), ty=Math.floor(y/TS);
  if(world.terr[ty*MAP_W+tx]===T_WATER) return true;
  if(world.wallSet && world.wallSet.has(ty*MAP_W+tx)) return true;
  for(const s of world.solids){ if(dist2(x,y,s.x,s.y) < (r+s.r)*(r+s.r)) return true; }
  return false;
}
function moveEnt(e,dx,dy,r){
  if(!solidBlocked(e.x+dx,e.y,r)) e.x+=dx;
  if(!solidBlocked(e.x,e.y+dy,r)) e.y+=dy;
}

// ----------------------------- spawning --------------------------------
function spawnEnemy(type,x,y){
  const tpl=ETPL[type]; const e={type, x,y, hp:tpl.hp, maxHp:tpl.hp, tpl, state:"idle", st:0,
    vx:0,vy:0, facing:0, wt:0, hurtFlash:0, hitDone:false, phase:0, knockX:0,knockY:0, wanderX:x,wanderY:y, wanderT:0,
    stun:0, slow:1, slowT:0, dots:null}; // crowd-control sinks: stun freezes the AI, slow scales chase speed, dots = active DoTs (CAS-118); all time-based, no RNG
  G.enemies.push(e); return e;
}
function spawnBoss(){ const e=spawnEnemy("golem",(world.caves.x+world.caves.w/2)*TS,(world.caves.y+5)*TS); e.isBoss=true; }
// CAS-73 — apply a zone's difficulty TIER to a freshly-spawned trash mob. Clones the
// shared ETPL row (never mutate the template) and scales hp/dmg/spd/xp by ZONE_TIER,
// so the four hunt zones rise in difficulty. Pure math (no RNG) → deterministic /
// Stage-2 ready. No-op for unscaled zones (forest mult 1.0) and bosses/champions
// (their elite blocks are tuned per-row in HUNTS, never re-scaled here).
function applyZoneScale(e, zone){
  if(!e) return e; const z=ZONE_TIER[zone]; if(!z) return e;
  const b=e.tpl;
  e.tpl=Object.assign({},b,{
    hp:Math.round(b.hp*z.hpMul), dmg:Math.round(b.dmg*z.dmgMul),
    spd:Math.round(b.spd*(z.spdMul||1)), xp:Math.round(b.xp*(z.xpMul||1)),
  });
  e.hp=e.maxHp=e.tpl.hp; e.zoneTier=z.tier; e.scaleZone=zone; // CAS-126: remember the zone so a summoner can scale its adds the same way
  return e;
}

// ------------------------------ combat ---------------------------------
function heroAttack(){
  const h=G.hero; if(h.atkCD>0||h.rolling||h.stun>0) return; // CAS-118: stun gates the swing
  tutMark("atk"); // CAS-128: a real swing teaches the attack step
  const cfg=ATK[h.cls||"warrior"]; const a=h.facing, ca=Math.cos(a), sa=Math.sin(a);
  const dmg=equippedDmg(h)*cfg.dmgMul;
  h.atkAng=a; h.atkAnim=CFG.atkCD; h.atkCD=cfg.cd/(1+(affixTotals(h).atkspd+(h.tt?h.tt.atkspd:0))/100); h._atkHits=new Set(); // CAS-117 affix + CAS-119 talent +vel.ataque shorten the cooldown
  if(cfg.type==="proj"){ h.atkT=0; audio.sfx.fire();
    G.projectiles.push({x:h.x+ca*18,y:h.y-2+sa*18,vx:ca*cfg.spd,vy:sa*cfg.spd,life:1.4,dmg,kind:cfg.kind,ang:a}); shakeAdd(2.4); }
  else if(cfg.type==="nova"){ h.atkT=0; audio.sfx.rune();
    for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d<=cfg.range+e.tpl.size){ hitEnemy(e,dmg,Math.atan2(e.y-h.y,e.x-h.x)); } }
    if(cfg.heal){ h.hp=Math.min(heroMaxHp(h),h.hp+cfg.heal); floater(h.x,h.y-30,"+"+cfg.heal,"#5fd66a"); }
    addFx("holynova",h.x,h.y,{r:cfg.range,life:0.5}); shakeAdd(6); }
  else { h.atkT=CFG.atkActive; h._mcfg=cfg; audio.sfx.sword(); shakeAdd(2.6);
    addFx("swing",h.x+ca*22,h.y-2+sa*22,{ang:a,fx:cfg.fx,life:0.26}); }
}
function applyHeroMelee(){
  const h=G.hero; const cfg=h._mcfg||ATK.warrior; const dmg=equippedDmg(h)*cfg.dmgMul;
  for(const e of G.enemies){
    if(e.dead||h._atkHits.has(e)) continue;
    const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>cfg.range+e.tpl.size) continue;
    const ang=Math.atan2(e.y-h.y,e.x-h.x);
    if(Math.abs(angDiff(ang,h.atkAng))<cfg.arc/2){
      h._atkHits.add(e); hitEnemy(e,dmg,h.atkAng); shakeAdd(5.5);
    }
  }
}
function hitEnemy(e,dmg,ang){
  // CAS-117: the "on-hit ligero" affix — a small flat bonus folded into EVERY
  // hero-sourced hit (melee/nova/proj/spell all funnel here). hitEnemy is the
  // hero→enemy damage path only, so this never touches enemy→hero damage.
  // CAS-119: talents read off the cached bundle (h.tt). onhit stacks with the affix
  // onhit; crit rolls on the sim RNG (srand) so it stays deterministic / Stage-2 ready.
  // RNG is consumed ONLY when the build actually has the stat, so a talentless hero
  // (smoke/determinism baseline) leaves the sequence byte-identical.
  const tt=G.hero?G.hero.tt:null;
  // CAS-121: a boss under its frost CARAPACE is damage-IMMUNE. The hit still funnels the
  // same on-hit STATUS procs (so a build that applies veneno/quemadura/aturdir SHATTERS
  // the shield — applyStatus flags it), but all damage/knock/crit is skipped and an
  // INMUNE tell pops. Returns before any HP change. A status-less hit simply bounces.
  if(e.shielded){
    floater(e.x,e.y-e.tpl.size,STR.immune,"#bfefff"); addFx("spark",e.x,e.y); audio.sfx.ehurt();
    if(G.hero){ const procs=weaponProcs(G.hero); if(procs) for(const pr of procs) applyStatus(e, pr.proc, {dmg:pr.amt}); }
    if(tt){ const tp=talentPoison(tt); if(tp) applyStatus(e,"poison",tp);
      if(tt.stunChance>0 && srand()*100<tt.stunChance) applyStatus(e,"stun"); }
    return;
  }
  const oh=(G.hero?affixTotals(G.hero).onhit:0)+(tt?tt.onhit:0); if(oh) dmg+=oh;
  let crit=false; if(tt&&tt.crit>0 && srand()*100<tt.crit){ crit=true; dmg*=(CRIT_BASE+(tt.critMult||0)/100); }
  e.hp-=dmg; e.hurtFlash=0.16; audio.sfx.ehurt();
  e.knockX+=Math.cos(ang)*e.tpl.knock; e.knockY+=Math.sin(ang)*e.tpl.knock;
  // CAS-127: crits read LOUDER — distinct bright SFX, a bigger popping number, an extra
  // shake kick. Normal hits get a subtle number pop. Pure feel (damage already applied).
  if(crit){ audio.sfx.crit(); floater(e.x,e.y-e.tpl.size,"¡"+Math.round(dmg)+"!","#ff5d5d",{crit:true,pop:1.9,life:1.05}); addFx("spark",e.x,e.y); shakeAdd(3.5); }
  else floater(e.x,e.y-e.tpl.size,"-"+Math.round(dmg),"#ffd24d",{pop:1.3});
  addFx("spark",e.x,e.y); addFx("blood",e.x,e.y,{ang}); addFx("impact",e.x,e.y,{ang,life:0.26});
  freeze(Math.min(5, 2+Math.floor(dmg/14))); // hit pops harder the bigger the blow
  // CAS-118: the equipped weapon's on-hit STATUS procs (CAS-117 affixes) — an 'ardiente'
  // weapon sets the struck enemy on fire. Every hero-sourced hit funnels here, so the
  // affix decision now changes how combat FEELS, not just the damage panel.
  if(G.hero){ const procs=weaponProcs(G.hero); if(procs) for(const pr of procs) applyStatus(e, pr.proc, {dmg:pr.amt}); }
  // CAS-119: talent on-hit procs — a poison build (druid/mage 'Toque tóxico') ignites
  // veneno every hit; a stun-chance build aturde on a srand roll. Both reuse CAS-118.
  if(tt){ const tp=talentPoison(tt); if(tp) applyStatus(e,"poison",tp);
    if(tt.stunChance>0 && srand()*100<tt.stunChance) applyStatus(e,"stun"); }
  if(e.tpl.neutral && !e.hostile){ makeHostile(e); registerSkull(); }
  if(e.hp<=0) killEnemy(e);
  else if(e.tpl.neutral) { /* stays hostile */ }
}
function makeHostile(e){ e.hostile=true; e.tpl=Object.assign({},e.tpl,{aggro:300}); }
// Push a gear ground-drop. The instance carries resolved stat/slot/rarity so the
// renderer + pickup never re-roll; all randomness already happened on the sim RNG.
function dropGear(x,y,inst){ if(!inst) return; G.drops.push({x,y,kind:"gear",inst,slot:inst.slot,rarity:inst.rarity,stat:gearStat(inst),tier:(gearDef(inst.slot,inst.defId)||{}).tier||0});
  // CAS-116 — drop-time feedback (AC3): a rarity-coloured floater + sfx the moment
  // notable loot (uncommon+) hits the ground, so the player READS the drop before
  // walking onto it. Common trash stays quiet (no spam) — the ground gem suffices.
  if(rarityRank(inst.rarity)>=1){ floater(x,y-18,gearName(inst),gearCol(inst)); audio.sfx.loot(rarityRank(inst.rarity)); } }
function killEnemy(e){
  if(e.dead) return; e.dead=true;
  freeze(e.isBoss?9:(e.champion?8:5)); // kill confirm — boss/champion deaths land heaviest
  const tpl=e.tpl; const zone=zoneOf(world,e.x,e.y);
  // CAS-134: bump the monotonic daily-contract tallies (pure counters; observer-read only).
  if(G.hero && !tpl.neutral){ G.hero.kills=(G.hero.kills|0)+1; if(e.isBoss||e.champion) G.hero.champKills=(G.hero.champKills|0)+1; }
  if(e.isBoss){ audio.sfx.boss(); G.bossDead=true; toast(STR.bossDefeated); shakeAdd(10);
    G.drops.push({x:e.x,y:e.y,kind:"potionhp"}); G.drops.push({x:e.x+20,y:e.y,kind:"gold"});
    noteEliteKill(); // CAS-149: the final boss is an elite-class kill → feeds Elite Mastery
    dropGear(e.x-20,e.y, rollGearInst(srand,2,3,"rare")); // boss: guaranteed rare+ from the tier 2-3 pool
    gainXP(tpl.xp); for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30)); }
  else if(e.champion){ onChampionKill(e); } // hunt climax — clears the zone, guaranteed payoff
  else { gainXP(tpl.xp);
    const g=ri(tpl.gold[0],tpl.gold[1]); if(g>0){ G.drops.push({x:e.x,y:e.y,kind:"gold",amt:g}); }
    if(srand()<0.22) G.drops.push({x:e.x+frr(-8,8),y:e.y,kind:srand()<0.6?"potionhp":"potionmp"});
    // CAS-146: an ELITE (ambush leader) guarantees an elevated drop + bonus gold; a normal
    // mob rolls its gearChance as before (non-elites take the unchanged RNG path → baselines hold).
    if(e.elite){ onEliteKill(e, zone); }
    else if(srand()<(tpl.gearChance||0)){ const win=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
      dropGear(e.x+frr(-8,8),e.y, rollGearInst(srand,win[0],win[1])); }
    huntKill(zone); // a normal kill in a hunt zone advances that zone's contract
  }
  if(e.type==="wolf" && !G.quest.done){ G.quest.wolves=Math.min(8,G.quest.wolves+1);
    if(G.quest.wolves>=8){ G.quest.done=true; toast(STR.questDone); } }
  addFx("poof",e.x,e.y);
  G.enemies.splice(G.enemies.indexOf(e),1);
}

// ------------------------------ hunt contracts (CAS-63) ----------------
// Generic resolver over the HUNTS data table — gives each farm zone a beginning
// (cull quota) → escalation (Champion summon) → payoff (guaranteed gear + bonus).
// No per-zone branching: a new hunt zone is a data row in config.js.
function huntKill(zone){ const H=G.hunts&&G.hunts[zone]; const cfgH=HUNTS[zone];
  if(!H||!cfgH||H.cleared||H.champ) return;            // ignore once a champ is up / zone cleared
  H.kills++;
  if(H.kills>=cfgH.need) spawnChampion(zone);
}
// Find a valid open tile inside the zone, a ring-distance from the hero, so the
// Champion arrives near the player (immediate, readable confrontation) but not on
// top of them. Falls back to the hero's position if no clear tile is found.
function huntSpawnPos(zone){ const r=world[zone]; const h=G.hero;
  for(let i=0;i<24;i++){ const a=rr(0,6.28), dpx=rr(150,230);
    const x=h.x+Math.cos(a)*dpx, y=h.y+Math.sin(a)*dpx;
    const tx=Math.floor(x/TS), ty=Math.floor(y/TS);
    if(tx<r.x+1||tx>r.x+r.w-2||ty<r.y+1||ty>r.y+r.h-2) continue;
    if(!solidBlocked(x,y,16)) return {x,y}; }
  return {x:h.x, y:h.y};
}
function spawnChampion(zone){ const cfgH=HUNTS[zone]; const H=G.hunts[zone]; const B=cfgH.boss;
  const p=huntSpawnPos(zone); const e=spawnEnemy(B?B.base:cfgH.base,p.x,p.y); const base=e.tpl;
  if(B){
    // CAS-65 capstone: an ABSOLUTE elite block on a boss sprite (no scaling math),
    // plus the phase-shift fields read by updateEnemies. Reuses the shared
    // windup→strike→recover AI so the base fight is readable; the climax mechanic
    // is layered in at the enrage threshold.
    e.tpl=Object.assign({},base,{ sprite:B.sprite||base.sprite, hp:B.hp, dmg:B.dmg, size:B.size,
      spd:B.spd??base.spd, knock:B.knock??base.knock, windup:B.windup??base.windup, recover:B.recover??base.recover,
      ranged:false, aggro:Math.max(base.aggro,340), xp:B.xp, champName:B.name });
    e.capstone=true; e.enraged=false; e.enrageAt=B.enrageAt||0.5;
    e.baseSpd=e.tpl.spd; e.enrageSpd=B.enrageSpd||1.35; e.enrageWindup=B.enrageWindup||0.72; e.slam=B.slam||null;
    // CAS-121: carapace state (only the Cripta capstone carries B.carapace). atkCount
    // drives the cadence; shielded/shieldBroken are the live mechanic flags.
    e.carapace=B.carapace||null; e.shielded=false; e.shieldBroken=false; e.atkCount=0;
    e.final=!!B.final; // CAS-123: this capstone's death is the Stage-1 win-condition
    e.rwdTier=B.tier; e.rwdMinR=B.minR; e.rwdXp=B.xp; e.rwdGold=B.gold;
  } else {
    // Elite stat block layered on the base mob — reuses its sprite + telegraphed AI,
    // so the fight stays readable; only HP/damage/size/reward scale up.
    // CAS-115: strip the base mob's trash ARCHETYPE — champions run the classic
    // generic-melee + CAS-109 radial-special AI (already QA-passed); a champion must
    // not inherit rusher-lunge / caster-kite from its base (forest=wolf, ruins=bandit).
    e.tpl=Object.assign({},base,{ hp:Math.round(base.hp*cfgH.hpMul), dmg:Math.round(base.dmg*cfgH.dmgMul),
      size:Math.round(base.size*cfgH.sizeMul), xp:cfgH.xp, knock:Math.max(60,Math.round(base.knock*0.6)),
      aggro:Math.max(base.aggro,320), champName:cfgH.name, arch:undefined });
    e.rwdTier=cfgH.tier; e.rwdMinR=cfgH.minR; e.rwdXp=cfgH.xp; e.rwdGold=cfgH.gold;
    // CAS-109: telegraphed radial-slam special on a strike cadence (see HUNTS.special).
    e.special=cfgH.special||null; e.atkCount=0; e.specialNow=false;
  }
  e.hp=e.maxHp=e.tpl.hp; e.champion=true; e.zone=zone; e.state="chase";
  H.champ=e;
  audio.sfx.boss(); toast(STR.huntChampion(e.tpl.champName),3.2); shakeAdd(B?12:8);
  for(let i=0,n=rmCount(B?12:8);i<n;i++) addFx("flame",e.x+frr(-26,26),e.y+frr(-26,26));
}
// Champion death = zone cleared. Guaranteed gear (zone tier, rarity floor) + bonus
// xp/gold so the hunt's payoff feeds the existing gear/progression systems.
function onChampionKill(e){ const zone=e.zone; const H=G.hunts[zone]; const cfgH=HUNTS[zone];
  if(H){ H.cleared=true; H.champ=null; }
  audio.sfx.boss(); shakeAdd(e.capstone?14:10);
  // reward params travel on the entity (set at spawn) so champion + capstone share
  // this one clear path — the capstone just carries a higher tier/floor.
  noteEliteKill(); // CAS-149: a hunt champion is an elite-class kill → feeds Elite Mastery (its own fixed payoff is unchanged)
  const win=e.rwdTier||cfgH.tier||(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
  dropGear(e.x,e.y, rollGearInst(srand,win[0],win[1],e.rwdMinR||cfgH.minR));
  G.drops.push({x:e.x+18,y:e.y,kind:"gold",amt:e.rwdGold||cfgH.gold});
  if(srand()<0.5) G.drops.push({x:e.x-18,y:e.y,kind:"potionhp"});
  gainXP(e.rwdXp||cfgH.xp);
  toast(STR.huntCleared(zone),3.6);
  for(let i=0,n=rmCount(e.capstone?16:10);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30));
  // CAS-123: the FINAL boss (data flag) closes the Stage-1 arc → victory screen.
  if(e.final) winStage1();
}

// CAS-123 — Stage-1 victory. Fires once, when the final capstone dies. Snapshots the
// run summary (class, level, time, attempts, gold, best loot) for renderVictory(), marks
// the durable win flag (persisted next autosave) and switches to the victory scene. The
// hero is untouched otherwise, so dismissing it drops straight back into free play with
// the same character — "libre tras la victoria".
function winStage1(){ const h=G.hero; if(!h) return;
  const firstWin=!h.stage1; h.stage1=true;
  G.victory=buildVictorySummary(h, firstWin);
  G.scene="victory"; G.music="town"; if(audio&&audio.playMusic) audio.playMusic("town");
  if(audio&&audio.sfx&&audio.sfx.levelup) audio.sfx.levelup();
  for(let i=0,n=rmCount(24);i<n;i++) addFx("heal", h.x+frr(-40,40), h.y+frr(-50,20));
}
// Pick the best-rarity equipped piece (ties → weapon) as the headline "key loot".
function bestEquipped(h){ const slots=["weapon","body","shield"]; let best=null, bestRank=-1;
  for(const s of slots){ const it=h.equip&&h.equip[s]; if(!it) continue; const rk=rarityRank(it.rarity);
    if(rk>bestRank){ bestRank=rk; best=it; } }
  return best; }
function buildVictorySummary(h, firstWin){
  const b=bestEquipped(h);
  return { cls:h.cls, lvl:h.lvl, playT:Math.floor(h.playT||0), deaths:h.deaths||0, gold:h.gold||0,
    bossName:(STAGE1_GOAL&&STAGE1_GOAL.boss)||"el jefe final", firstWin:!!firstWin,
    lootName:b?gearName(b):null, lootRarity:b?b.rarity:null };
}
// Dismiss the victory screen → resume free play with the same hero (no reset).
export function dismissVictory(){ if(G.scene!=="victory") return; G.victory=null; const h=G.hero;
  if(h){ h.dead=false; h.vx=h.vy=0; h.iframe=0.6; } G.scene="play"; }
function gainXP(n){ const h=G.hero; if(n<=0) return; h.xp+=n; floater(h.x,h.y-30,"+"+n+" XP","#9fe6a0");
  while(h.xp>=h.xpNext){ h.xp-=h.xpNext; h.lvl++; // CAS-100: per-class growth → archetypes diverge as you climb
    h.maxHp+=(h.hpGain||18); h.maxMp+=(h.mpGain||8); h.baseDmg+=(h.dmgGain||3); h.hp=heroMaxHp(h); h.mp=h.maxMp;
    // CAS-119: every level grants a talent point (build agency). Floater makes the
    // grant visible (AC #1); the HUD ★ badge + (T) hint prompt the player to spend.
    h.talentPts=(h.talentPts||0)+1; floater(h.x,h.y-46,STR.talentPointGain,"#ffd24d");
    h.xpNext=xpForLevel(h.lvl); toast(STR.levelUp(h.lvl)); audio.sfx.levelup();
    // CAS-127: level-up burst — a ring flourish + scattered heal sparks so the ding is felt.
    addFx("lvlring",h.x,h.y,{life:0.6}); for(let i=0,n=rmCount(10);i<n;i++) addFx("heal",h.x+frr(-20,20),h.y+frr(-24,8)); } }

// CAS-149 — ELITE MASTERY. Pure, deterministic derived rank from the lifetime elite-kill
// count (no RNG, no per-frame state) — exported so the HUD can read it the same way.
export function masteryRank(k){ const T=MASTERY.thresholds; let r=0; k=k|0;
  for(let i=1;i<T.length;i++){ if(k>=T[i]) r=i; } return r; }
// Next-rank threshold (null at max rank) — HUD progress read-out.
export function masteryNextAt(rank){ const T=MASTERY.thresholds; return rank+1<T.length?T[rank+1]:null; }
// How many rarity steps the elite loot floor is raised at a given Mastery rank — gentle:
// +1 step from rank 2, +2 from rank 4 (capped), so deeper investment = a richer floor
// without forcing epics on a fresh hero. Base elite floor is "uncommon" (rank 1).
function masteryFloorSteps(rank){ return Math.min(2, Math.floor(rank/2)); }
// Raise a rarity key by `steps`, clamped to the top of the order (epic).
function bumpRarity(base, steps){ let i=RARITY_ORDER.indexOf(base); if(i<0) i=0;
  return RARITY_ORDER[Math.min(RARITY_ORDER.length-1, i+Math.max(0,steps|0))]; }
// Apply the Mastery FORTUNE to an elite/champion drop's loot params: a higher rarity floor
// + a per-rank chance to bump the tier window one step (capped at maxLootTier). Returns the
// boosted {win:[min,max], minR}. RNG only on the optional tier-bump (sim stream → deterministic).
function masteryLoot(h, win, minR){ const rank=masteryRank(h&&h.eliteKills);
  let lo=win[0], hi=win[1];
  if(rank>0 && srand()<Math.min(0.6, rank*MASTERY.tierBumpChance)){
    const cap=MASTERY.maxLootTier; lo=Math.min(cap,lo+1); hi=Math.min(cap,hi+1); }
  return { win:[lo,hi], minR:bumpRarity(minR||"uncommon", masteryFloorSteps(rank)) };
}
// Record one elite-class kill toward Mastery and, if it crosses a rank threshold, bake the
// permanent +maxHp (saved with maxHp → restored, never re-applied) and fire the rank-up
// flourish. Called from every elite-class death (boss / champion / ambush elite).
function noteEliteKill(){ const h=G.hero; if(!h) return;
  const before=masteryRank(h.eliteKills); h.eliteKills=(h.eliteKills|0)+1;
  const after=masteryRank(h.eliteKills);
  if(after>before){ const gain=(after-before)*MASTERY.hpPerRank;
    h.maxHp+=gain; h.hp=Math.min(heroMaxHp(h), h.hp+gain);   // bonus is also a small heal
    toast(STR.masteryUp(after),3.0); audio.sfx.levelup();
    addFx("lvlring",h.x,h.y,{life:0.6}); floater(h.x,h.y-62,STR.masteryFloater(after),"#ffd24d");
    for(let i=0,n=rmCount(10);i<n;i++) addFx("heal",h.x+frr(-22,22),h.y+frr(-26,8)); }
}
// CAS-134: the single, deliberate META-reward seam — the ONLY way the daily-return loop
// (daily.js) writes into sim state, and only on an explicit player CLAIM (never per-frame).
// Grants gold / xp / potions through the same paths a real reward uses (gold add + gainXP,
// so claiming can level you up with the usual ding). Stage-2 portable: a server build grants
// the same shape through the same surface. No RNG, deterministic.
export function applyMetaReward(r){ const h=G.hero; if(!h||!r) return;
  if(r.gold>0){ h.gold+=r.gold|0; audio.sfx.coin(); floater(h.x,h.y-26,"+"+(r.gold|0)+" oro",C_GOLD); }
  if(r.potHP>0){ h.potHP+=r.potHP|0; }
  if(r.xp>0){ gainXP(r.xp|0); } }
// CAS-119: recompute the cached talent bundle after any change (alloc/respec/load)
// and clamp current HP into the (possibly smaller) effective max so a respec that
// drops +vida nodes can't leave the hero above their max.
function recalcTalents(h){ if(!h) return; h.tt=talentTotals(h); const m=heroMaxHp(h); if(h.hp>m) h.hp=m; }
// Spend one point on a node if it's a legal choice (sim is the authority — the UI
// only proposes). Returns true on success. CAS-119.
export function allocTalent(id){ const h=G.hero; if(!h||!h.talents) return false;
  if(!canAllocTalent(h,id)){ audio.sfx.deny(); return false; }
  h.talents[id]=(h.talents[id]|0)+1; h.talentPts--; recalcTalents(h);
  const n=talentNode(h.cls,id); audio.sfx.levelup(); if(n) floater(h.x,h.y-40,n.name,"#9be7ff"); return true; }
// Refund every spent point back into the pool and wipe the build. CAS-119 respec.
export function respecTalents(){ const h=G.hero; if(!h||!h.talents) return 0; const n=talentSpent(h);
  if(n<=0) return 0; h.talentPts=(h.talentPts||0)+n; h.talents={}; recalcTalents(h); audio.sfx.rune(); toast(STR.talentRespec); return n; }

function registerSkull(){ const s=G.skull;
  if(s.level===0){ s.level=1; s.t=60; }            // white
  else if(s.level===1){ s.level=2; s.t=80; }       // yellow
}
function onNeutralKill(){ const s=G.skull; s.kills++; s.killT=90;
  if(s.kills>=2 && s.level<3){ s.level=3; s.t=110; toast(STR.redSkull); } else if(s.level<2){ s.level=2; s.t=80; } }

// ------------------------------ spells ---------------------------------
// castSpell(0) is the basic attack (per-class ATK). Slots 1-3 read SPELLS[cls][slot-1]
// and run through resolveSpell — there is ZERO per-class branching here, so a new
// class is purely a data row in config.js. Each slot has its own MP cost + cooldown.
export function castSpell(i){
  const h=G.hero; if(h.rolling||h.stun>0) return; // CAS-118: stun gates casting
  if(i===0){ heroAttack(); return; }
  const list=SPELLS[h.cls||"warrior"]; const sp=list && list[i-1];
  if(!sp) return;
  if(h.spellCD[i]>0) return;                                   // per-slot cooldown gate
  if(h.mp<sp.cost){ toast(STR.notEnoughMP); audio.sfx.deny(); return; }
  // CAS-119: a cooldown-reduction build (cdr) shortens the class-spell cooldown; the
  // HUD ring reads spellCDmax so the shorter wheel is visible.
  const cd=sp.cd*(1-(h.tt?h.tt.cdr:0)/100); h.mp-=sp.cost; h.spellCD[i]=cd; h.spellCDmax[i]=cd;
  if(sp.sfx && audio.sfx[sp.sfx]) audio.sfx[sp.sfx]();
  resolveSpell(h,sp);
  tutMark("skill"); // CAS-128: a successful class-skill cast teaches the skill step
}
// CAS-120: a class skill's hit deals its base + the hero's BUILD damage — the talent
// flat +daño (CAS-119, cached in h.tt) plus the affix +daño on equipped gear (CAS-117).
// So a +daño build visibly empowers SKILLS, not just the basic attack; both inputs are
// small-capped so this stays on-curve. Deterministic (no RNG). crit / on-hit poison /
// stun-chance layer on top inside hitEnemy, so the build is fully observable on skills.
function spellDmg(h,sp){ return (sp.dmg||0) + ((h.tt&&h.tt.dmg)||0) + affixTotals(h).dmg; }
// CAS-120: a damaging skill's control/ignite effect rides the unified CAS-118 engine
// (applyStatus), so it reuses the same DoT/slow/stun timers + icon/aura/floater feedback
// mobs use — one system, no per-skill branch. No-op when the skill carries no status.
function applySpellStatus(e,sp){ if(sp.status) applyStatus(e,sp.status.type,sp.status); }
// Generic effect resolver: dispatch by spell `type`. New types are added here once
// and become available to every class through data. No spell knows its class.
function resolveSpell(h,sp){
  const a=h.facing, ca=Math.cos(a), sa=Math.sin(a);
  switch(sp.type){
    case "proj":
      // CAS-120: a spell projectile carries its status as `infl` (mirrors enemy bolts),
      // applied on impact in updateProjectiles — so fireball ignites, smite dazes, etc.
      G.projectiles.push({x:h.x+ca*20,y:h.y-2+sa*20,vx:ca*sp.spd,vy:sa*sp.spd,life:sp.life||1.4,dmg:spellDmg(h,sp),kind:sp.kind,ang:a, aoe:sp.aoe||0, burstFx:sp.fx, col:sp.col, infl:sp.status});
      shakeAdd(sp.aoe?3:2.4); break;
    case "cone": {
      const sd=spellDmg(h,sp);
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>sp.range+e.tpl.size) continue;
        const ang=Math.atan2(e.y-h.y,e.x-h.x); if(Math.abs(angDiff(ang,a))<(sp.arc||Math.PI*0.6)/2){
          hitEnemy(e,sd,a); if(sp.knock){ e.knockX+=ca*e.tpl.knock*sp.knock; e.knockY+=sa*e.tpl.knock*sp.knock; } applySpellStatus(e,sp); } }
      addFx(sp.fx||"conecast",h.x+ca*20,h.y-2+sa*20,{ang:a,range:sp.range,col:sp.col,life:0.3}); shakeAdd(5); break; }
    case "nova": {
      const sd=spellDmg(h,sp);
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d<=sp.range+e.tpl.size){
        hitEnemy(e,sd,Math.atan2(e.y-h.y,e.x-h.x)); applySpellStatus(e,sp); } }
      if(sp.heal){ h.hp=Math.min(heroMaxHp(h),h.hp+sp.heal); floater(h.x,h.y-30,"+"+sp.heal,"#5fd66a"); }
      addFx(sp.fx||"novacast",h.x,h.y,{r:sp.range,col:sp.col,style:sp.style,life:0.5}); shakeAdd(6); break; }
    case "heal":
      h.hp=Math.min(heroMaxHp(h),h.hp+sp.heal); floater(h.x,h.y-30,"+"+sp.heal,"#5fd66a");
      addFx(sp.fx||"healburst",h.x,h.y,{col:sp.col,life:0.5}); for(let k=0;k<6;k++) addFx("heal",h.x+frr(-14,14),h.y+frr(-18,6)); break;
    case "hot":
      h.hotT=sp.dur; h.hotRate=sp.heal; floater(h.x,h.y-30,STR.spellRegen,sp.col||"#7bd44a");
      addFx(sp.fx||"buffaura",h.x,h.y,{col:sp.col,life:0.5}); break;
    case "buff":
      applyBuff(h,sp.stat,sp.amt,sp.dur); floater(h.x,h.y-30, sp.stat==="dmg"?STR.spellAtkUp:STR.spellDefUp, sp.col||"#ffd24d");
      addFx(sp.fx||"buffaura",h.x,h.y,{col:sp.col,life:0.5}); break;
    case "dash": {
      const sd=spellDmg(h,sp);
      h.rolling=true; h.rollT=0.20; h.iframe=0.22; h.rollCD=Math.max(h.rollCD,0.3); h.rollX=ca; h.rollY=sa; h.moved=false;
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>sp.range+e.tpl.size) continue;
        const ang=Math.atan2(e.y-h.y,e.x-h.x); if(Math.abs(angDiff(ang,a))<0.9){ hitEnemy(e,sd,a); applySpellStatus(e,sp); } }
      addFx(sp.fx||"charge",h.x,h.y,{ang:a,col:sp.col,life:0.3}); shakeAdd(5); break; }
    case "blink": {
      // caster mobility: instantly reposition up to `range` px toward facing, clamped
      // by collision (step-march so we stop AT a wall, never tunnel through it), and
      // grant brief i-frames. No damage — a pure escape/gap tool. Deterministic: no RNG.
      const steps=12, dpx=sp.range/steps; let nx=h.x, ny=h.y;
      for(let s=0;s<steps;s++){ const tx=nx+ca*dpx, ty=ny+sa*dpx; let moved=false;
        if(!solidBlocked(tx,ny,12)){ nx=tx; moved=true; }
        if(!solidBlocked(nx,ty,12)){ ny=ty; moved=true; }
        if(!moved) break; }
      addFx(sp.fx||"blink",h.x,h.y,{ang:a,col:sp.col,life:0.3});          // departure wisp at origin
      h.x=nx; h.y=ny; h.iframe=Math.max(h.iframe,sp.iframe||0.4); h.rollCD=Math.max(h.rollCD,0.25);
      addFx(sp.fx||"blink",h.x,h.y,{ang:a,col:sp.col,life:0.3,arrive:1}); shakeAdd(3); break; }
    case "field": {
      // area denial: plant a persistent zone in front of the hero that ticks `dmg`
      // every `tick` seconds to enemies inside `range` for `dur` seconds (optional
      // slow). One immediate plant tick makes the cast read instantly; then it lingers.
      const cx=h.x+ca*(sp.offset||40), cy=h.y+sa*(sp.offset||40);
      const f={x:cx,y:cy,r:sp.range,dmg:spellDmg(h,sp),tick:sp.tick||0.5,acc:0,life:sp.dur,maxLife:sp.dur,
               col:sp.col,style:sp.style,status:sp.status||null};
      G.fields.push(f); fieldTick(f);                                     // plant + immediate first tick
      addFx(sp.fx||"novacast",cx,cy,{r:sp.range,col:sp.col,style:sp.style||"spike",life:0.5}); shakeAdd(4); break; }
  }
}
// Apply ONE damage tick from a persistent field. Unlike hitEnemy this is intentionally
// light — no knockback, no hitstop, no per-tick sfx — so a DoT zone reads as a hazard,
// not a stun-lock. Deterministic; runs on the sim tick clock only.
function fieldTick(f){
  for(const e of G.enemies){ if(e.dead) continue;
    const rr2=(f.r+e.tpl.size); if(dist2(e.x,e.y,f.x,f.y) > rr2*rr2) continue;
    e.hp-=f.dmg; e.hurtFlash=0.12; floater(e.x,e.y-e.tpl.size,"-"+Math.round(f.dmg),"#9fe06a",{small:true}); // CAS-127: DoT ticks read smaller than direct hits
    if(f.status) applyStatus(e,f.status.type,f.status);   // CAS-120: field control rides CAS-118
    if(e.tpl.neutral && !e.hostile){ makeHostile(e); registerSkull(); }
    if(e.hp<=0) killEnemy(e); }
}
function updateFields(dt){
  for(const f of G.fields){ f.life-=dt; f.acc+=dt;
    while(f.acc>=f.tick){ f.acc-=f.tick; fieldTick(f); } }
  G.fields=G.fields.filter(f=>f.life>0);
}

// --------------------------- CAS-118: status effects -------------------
// One generic apply/update path shared by the hero AND every enemy. Statuses are
// data rows in STATUS (config.js): DoTs (poison/quemadura) tick flat damage on a
// clock; slow scales movement; stun freezes the AI / interrupts a telegraphed
// strike. All time-driven (no RNG) → deterministic / Stage-2 server-authority ready.
// Refresh policy: a re-apply keeps the STRONGER per-tick damage and the LONGER
// remaining duration, so stacking the same source can't snowball the frame/curve.
function applyStatus(ent, type, opt){
  if(!ent) return; opt=opt||{}; const def=STATUS[type]; if(!def) return;
  // CAS-121: landing ANY status on a carapaced boss flags it to SHATTER next frame (the
  // single choke point catches every status source — affix proc / talent / skill /
  // spell / field — so the build-agency stack uniformly breaks the shield). The status
  // is still recorded below, so it keeps ticking once the carapace is gone (a reward).
  if(ent.shielded) ent.shieldBroken=true;
  if(def.dot){ ent.dots=ent.dots||{};
    const cur=ent.dots[type]; const dmg=opt.dmg||def.dmg, dur=opt.dur||def.dur;
    ent.dots[type]= cur ? { t:Math.max(cur.t,dur), acc:cur.acc, dmg:Math.max(cur.dmg,dmg), tick:def.tick }
                        : { t:dur, acc:0, dmg, tick:def.tick };
  } else if(type==="slow"){ ent.slow=opt.amt||def.amt; ent.slowT=Math.max(ent.slowT||0, opt.dur||def.dur); }
  else if(type==="stun"){ ent.stun=Math.max(ent.stun||0, opt.dur||def.dur); }
}
// Advance an entity's DoTs one frame, dealing flat (defence-bypassing) ticks on each
// status's clock. Light feedback only (small hurtFlash + a coloured tick floater) so a
// DoT reads as pressure, never a stun-lock. Returns true if a tick left the entity at
// <=0 HP so the caller runs the real death path (killEnemy / heroDie). No allocation
// when the entity carries no DoTs (the common case).
function tickDots(ent, dt, isHero){
  if(!ent.dots) return false; let dead=false; let any=false;
  for(const type in ent.dots){ const d=ent.dots[type]; if(!d) continue; any=true;
    const def=STATUS[type]; d.t-=dt; d.acc+=dt;
    while(d.acc>=d.tick){ d.acc-=d.tick;
      ent.hp-=d.dmg; ent.hurtFlash=Math.max(ent.hurtFlash||0,0.10);
      floater(ent.x, ent.y-(isHero?30:ent.tpl.size), "-"+d.dmg, def.col, {small:true}); // CAS-127: status ticks read smaller + status-coloured, distinct from hits
      if(ent.hp<=0){ dead=true; break; } }
    if(d.t<=0 || dead) delete ent.dots[type];
    if(dead) break; }
  if(any && ent.dots && Object.keys(ent.dots).length===0) ent.dots=null;
  return dead;
}
// Timed stat buff: dmgBonus/defBonus are the sinks read by equippedDmg/Def, so a
// buff changes real combat numbers. Recasting refreshes (removes the old amount
// first) so the bonus never drifts upward across overlapping casts.
function applyBuff(h,stat,amt,dur){
  if(stat==="def"){ if(h.defBuffT>0) h.defBonus-=h.defBuffAmt; h.defBonus+=amt; h.defBuffAmt=amt; h.defBuffT=dur; }
  else { if(h.dmgBuffT>0) h.dmgBonus-=h.dmgBuffAmt; h.dmgBonus+=amt; h.dmgBuffAmt=amt; h.dmgBuffT=dur; }
}

// ----------------------------- pickups ---------------------------------
const BAG_CAP=16;
// No-filler gate: a COMMON gear is filler iff it can't beat what's already on
// that slot — auto-melt it to a little gold instead of bagging it. Higher
// rarities (and any common that IS an upgrade) always go to the bag.
function takeGear(inst){ const h=G.hero; const st=gearStat(inst);
  if(inst.rarity==="common" && st<=gearStat(h.equip[inst.slot])){
    const melt=Math.max(1,Math.round(st/2)); h.gold+=melt; audio.sfx.coin(); floater(h.x,h.y-26,"+"+melt+" oro",C_GOLD); return; }
  if(h.bag.length>=BAG_CAP){ // bag full: convert the weakest held to gold to make room
    let wi=0,wv=Infinity; h.bag.forEach((b,i)=>{ const v=gearStat(b); if(v<wv){ wv=v; wi=i; } });
    h.gold+=Math.max(1,Math.round(wv/2)); h.bag.splice(wi,1); toast(STR.bagFull); }
  h.bag.push(inst); audio.sfx.loot(rarityRank(inst.rarity)); toast(STR.loot(gearName(inst)));
  // CAS-127: rarity-coloured pickup pop — a popping name floater + an expanding ring
  // in the item's rarity colour so collecting loot reads with weight.
  floater(h.x,h.y-30,gearName(inst),gearCol(inst),{pop:1.4,life:1.0});
  addFx("lootpop",h.x,h.y,{col:gearCol(inst),life:0.5});
}
export function tryPickup(){
  const h=G.hero;
  for(const d of G.drops){ if(d.taken) continue; if(dist2(h.x,h.y,d.x,d.y)<CFG.pickRange*CFG.pickRange){
    if(d.kind==="gold"){ const g=d.amt||ri(3,8); h.gold+=g; audio.sfx.coin(); floater(h.x,h.y-26,"+"+g+" oro",C_GOLD); }
    else if(d.kind==="potionhp"){ h.potHP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de vida")); }
    else if(d.kind==="potionmp"){ h.potMP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de maná")); }
    else if(d.kind==="gear"){ takeGear(d.inst); }
    d.taken=true; tutMark("looted"); // CAS-128: first collected drop teaches the loot step
  }}
  G.drops=G.drops.filter(d=>!d.taken);
  for(const c of world.chests){ if(c.opened) continue; if(dist2(h.x,h.y,c.x,c.y)<CFG.pickRange*CFG.pickRange){
    c.opened=true; audio.sfx.pickup();
    if(c.loot==="gold40"){ h.gold+=40; floater(h.x,h.y-26,"+40 oro",C_GOLD); }
    else if(c.loot==="gold60"){ h.gold+=60; floater(h.x,h.y-26,"+60 oro",C_GOLD); }
    else if(c.loot==="potionhp"){ h.potHP+=2; toast(STR.pickedUp("2 pociones de vida")); }
  }}
  for(const f of world.fragments){ if(f.taken) continue; if(dist2(h.x,h.y,f.x,f.y)<CFG.pickRange*CFG.pickRange){
    f.taken=true; audio.sfx.levelup(); if(f.kind==="hp"){ h.maxHp+=20; h.hp+=20; toast("Fragmento de vida: +20 HP máx"); } else { h.maxMp+=15; h.mp+=15; toast("Fragmento de maná: +15 MP máx"); }
  }}
}

// ------------------------------ death ----------------------------------
function heroDie(){
  const h=G.hero; if(h.dead) return; h.dead=true; h.animState="dead"; h.animT=0; G.scene="dead"; audio.sfx.death();
  h.deaths=(h.deaths||0)+1; // CAS-123: a run attempt for the victory summary
  const red=G.skull.level>=3;
  let frac = h.blessings>0 && !red ? 0.10 : 0.30;
  const loss=Math.floor(h.xpNext*frac); h.xp=Math.max(0,h.xp-loss);
  if(red){ if(h.potHP>0) h.potHP--; h.blessings=0; }
  else if(h.blessings>0){ h.blessings--; }
}
export function respawn(){
  const h=G.hero; h.dead=false; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.x=h.respawn.x; h.y=h.respawn.y;
  h.vx=h.vy=0; h.rolling=false; h.iframe=0.5; G.scene="play"; G.skull.level=0; G.skull.kills=0;
}

// ------------------------------ NPCs / shop ----------------------------
function nearestNPC(){ const h=G.hero; let best=null,bd=CFG.talkRange*CFG.talkRange;
  for(const n of world.npcs){ const d=dist2(h.x,h.y,n.x,n.y); if(d<bd){bd=d;best=n;} } return best; }
function nearestFountain(){ const h=G.hero; for(const f of world.fountains){ if(dist2(h.x,h.y,f.x,f.y)<CFG.fountainRange*CFG.fountainRange) return f; } return null; }
// CAS-114 — nearest interactable portal (town↔abyss warp gate), same reach as talking.
function nearestPortal(){ const h=G.hero; if(!world.portals) return null;
  let best=null,bd=CFG.talkRange*CFG.talkRange;
  for(const p of world.portals){ const d=dist2(h.x,h.y,p.x,p.y); if(d<bd){bd=d;best=p;} } return best; }
// CAS-114 — the hero's PERMANENT power, a single legible number that the abyss gate
// reads off the two things the loop rewards: merchant-upgrade tiers bought (the gold
// SINK, CAS-112) + levels gained. Both persist (CAS-113), so the gate stays cleared
// across reloads. Pure math (no RNG) — deterministic / Stage-2 ready.
export function heroPower(h){ h=h||G.hero; if(!h) return 0; const u=h.upg||{};
  return (u.dmg||0)+(u.hp||0)+(u.def||0) + Math.max(0,(h.lvl||1)-1); }
// CAS-114 — warp through a portal. The town→abyss gate is power-gated: below REQ it
// denies with a clear toast (HUD feedback); at/above it warps the hero to the abyss
// vestibule. The abyss→town gate always returns. Clears transient state on arrival.
function usePortal(p){ const h=G.hero;
  // CAS-114/121: each deeper biome has a power gate (abyss < cripta). Below REQ the
  // gate denies with a clear toast; at/above it warps the hero to the vestibule.
  if(p.to==="abyss"){ const pw=heroPower(h);
    if(pw<ABYSS_POWER_REQ){ toast(STR.abyssLocked(pw,ABYSS_POWER_REQ),3.4); audio.sfx.deny(); return false; } }
  else if(p.to==="frost"){ const pw=heroPower(h);
    if(pw<FROST_POWER_REQ){ toast(STR.frostLocked(pw,FROST_POWER_REQ),3.4); audio.sfx.deny(); return false; } }
  h.x=p.dx; h.y=p.dy; h.vx=h.vy=0; h.rolling=false; h.rollT=0; h.iframe=0.6;
  audio.sfx.roll(); toast(p.to==="abyss"?STR.enteredAbyss:p.to==="frost"?STR.enteredFrost:STR.leftAbyss,3.0); return true;
}
export function interact(){
  const p=nearestPortal();
  if(p){ usePortal(p); return; }
  const f=nearestFountain();
  const n=nearestNPC();
  if(n){ openDialogue(n); return; }
  if(f){ const h=G.hero; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.respawn={x:f.x,y:f.y+TS}; toast(STR.fountainRest); audio.sfx.heal(); return; }
}
function openDialogue(n){
  if(n.role==="quest" && G.quest.done && !G.quest.rewarded){
    G.dialog={npc:n,lines:STR.rolfDone,i:0,reward:true};
  } else {
    G.dialog={npc:n,lines:n.lines,i:0};
  }
  G.scene="dialogue";
}
export function advanceDialogue(){
  const d=G.dialog; if(!d) return; d.i++;
  if(d.i>=d.lines.length){
    if(d.reward){ const h=G.hero; h.gold+=50; h.potHP+=1; G.quest.rewarded=true; toast(STR.questReward); audio.sfx.buy(); }
    const n=d.npc; G.dialog=null;
    if(n.role==="shop"){ G.scene="shop"; G.shopSel=0; G.healShop=false; G.merchantShop=false; }
    else if(n.role==="heal"){ G.scene="shop"; G.shopSel=0; G.healShop=true; G.merchantShop=false; }
    else if(n.role==="merchant"){ G.scene="shop"; G.shopSel=0; G.merchantShop=true; G.healShop=false; }
    else if(n.role==="bounty"){ G.scene="bounty"; G.bountySel=0; G.healShop=false; G.merchantShop=false; } // CAS-134 bounty board
    else { G.scene="play"; G.healShop=false; G.merchantShop=false; }
  }
}
export function shopItems(){
  // CAS-112: the Mercader Ambulante's persistent upgrade shop — the gold SINK that
  // closes the economic loop (hunt → gold → permanent power → harder content). These
  // are tiered, escalating, session-persistent stat investments, distinct from Bram's
  // gear instances (which loot can outclass). Tiers tracked on h.upg; price climbs and
  // `once` caps each line when maxed. baseDmg/maxHp/defBonus are the real combat sinks.
  if(G.merchantShop){ const h=G.hero; const u=h.upg||(h.upg={dmg:0,hp:0,def:0});
    const DMG=[60,120,200,320], HPU=[50,100,170,260], DEFP=[70,140,240];
    const tier=(arr,t)=>{ const max=arr.length, done=t>=max; return {done,max,price:done?arr[max-1]:arr[t],lbl:done?"MÁX":((t+1)+"/"+max)}; };
    const w=tier(DMG,u.dmg), v=tier(HPU,u.hp), c=tier(DEFP,u.def);
    return [
      {name:"Filo afilado +5 daño ("+w.lbl+")", price:w.price, act:hh=>{hh.baseDmg+=5; u.dmg++;}, once: w.done?()=>true:null},
      {name:"Vigor +30 vida máx ("+v.lbl+")",   price:v.price, act:hh=>{hh.maxHp+=30; hh.hp+=30; u.hp++;}, once: v.done?()=>true:null},
      {name:"Coraza +4 defensa ("+c.lbl+")",    price:c.price, act:hh=>{hh.defBonus+=4; u.def++;}, once: c.done?()=>true:null},
      {name:"Lote de pociones (+3 vida, +2 maná)", price:40, act:hh=>{hh.potHP+=3; hh.potMP+=2;}},
    ];
  }
  if(G.healShop) return [
    {name:"Poción de vida",price:15,act:h=>h.potHP++},
    {name:"Poción de maná",price:12,act:h=>h.potMP++},
    {name:"Bendición",price:60,act:h=>{h.blessings++; toast(STR.blessingOn);}},
    {name:"Curación completa",price:20,act:h=>{h.hp=heroMaxHp(h);h.mp=h.maxMp;}},
  ];
  // Shop upgrades grant gear INSTANCES (same data model as drops). `once` guards
  // by resolved stat so you can't buy a downgrade once you've looted better.
  const STEEL={slot:"weapon",defId:"w_steel",rarity:"common"}, PLATE={slot:"body",defId:"a_plate",rarity:"common"}, IRONSH={slot:"shield",defId:"s_iron",rarity:"common"};
  return [
    {name:"Poción de vida",price:15,act:h=>h.potHP++},
    {name:"Poción de maná",price:12,act:h=>h.potMP++},
    {name:"Espada de acero (+6 daño)",price:90,act:h=>{h.equip.weapon={...STEEL};},once:h=>gearStat(h.equip.weapon)>=gearStat(STEEL)},
    {name:"Coraza de placas (+6 def)",price:80,act:h=>{h.equip.body={...PLATE};},once:h=>gearStat(h.equip.body)>=gearStat(PLATE)},
    {name:"Escudo de hierro (+4 def)",price:70,act:h=>{h.equip.shield={...IRONSH};},once:h=>gearStat(h.equip.shield)>=gearStat(IRONSH)},
  ];
}
// Equip bag item i into its slot, swapping the previously-equipped piece back
// into the SAME bag index (indices stay stable so callers can equip several in a
// row from one snapshot). Combat/UI totals recompute via equippedDmg/Def.
export function equipBag(i){ const h=G.hero; const inst=h.bag[i];
  if(!inst) return {dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)};
  const slot=inst.slot; const old=h.equip[slot];
  h.equip[slot]=inst; h.bag[i]=old; audio.sfx.buy();
  // CAS-117: swapping out a +vida piece can lower the effective max below
  // current hp — clamp so the bar never reads over 100%.
  const mhp=heroMaxHp(h); if(h.hp>mhp) h.hp=mhp;
  return {slot, dmg:equippedDmg(h), def:equippedDef(h), hp:mhp};
}
export function buyItem(idx){ const h=G.hero; const it=shopItems()[idx]; if(!it) return;
  if(it.once && it.once(h)){ audio.sfx.deny(); toast("Ya tienes algo igual o mejor"); return; }
  if(h.gold<it.price){ toast(STR.cantAfford); audio.sfx.deny(); return; }
  h.gold-=it.price; it.act(h); audio.sfx.buy(); toast(STR.bought(it.name)); }

// --------------------- player commands (driven by input) ---------------
export function doPotionHP(){ const h=G.hero; if(h.potHP>0&&h.hp<heroMaxHp(h)){ h.potHP--; h.hp=Math.min(heroMaxHp(h),h.hp+50); audio.sfx.heal(); floater(h.x,h.y-30,"+50","#5fd66a"); } }
export function doPotionMP(){ const h=G.hero; if(h.potMP>0&&h.mp<h.maxMp){ h.potMP--; h.mp=Math.min(h.maxMp,h.mp+30); audio.sfx.cast(); floater(h.x,h.y-30,"+30","#7fb8e6"); } }
export function doRoll(){ const h=G.hero; if(h.rolling||h.rollCD>0) return; let ax,ay;
  if(G.settings.rollAim){ ax=Math.cos(h.facing); ay=Math.sin(h.facing); }
  else { const mv=io.moveVec(); if(mv[0]===0&&mv[1]===0){ ax=Math.cos(h.facing); ay=Math.sin(h.facing);} else {[ax,ay]=mv;} }
  h.rolling=true; h.rollT=CFG.rollTime; h.iframe=CFG.rollIFrame; h.rollCD=CFG.rollCD; h.rollX=ax; h.rollY=ay; audio.sfx.roll(); }

// ====================================================================
//  UPDATE  — advances the simulation one fixed step. No ctx, no DOM.
// ====================================================================
export function update(dtMs){
  if(G.hitstop>0){ G.hitstop--; if(G.scene==="play"){ io.pollPad(); return; } } // impact freeze: pause sim, keep pad live
  const dt=dtMs/1000; G.t+=dt;
  if(G.toastT>0) G.toastT-=dt;
  if(G.scene==="menu"){ return; } // menu DOM is owned by the controller, not the sim
  io.pollPad();
  if(G.scene!=="play"){ if(G.tut&&G.tut.active&&G.scene==="inventory") G.tut.invOpened=true; // CAS-128: equip step
    updateFloaters(dt); updateFx(dt); return; } // freeze world in menus but let transient fx expire
  const h=G.hero;
  h.playT+=dt; // CAS-123: accumulate live-play seconds for the victory summary (play-only)
  tickTutorial(dt); // CAS-128: onboarding step machine (observes hero state; no balance touch)
  // music switch by zone danger + boss presence (CAS-131: town/combat/boss tracks).
  const z=zoneOf(world,h.x,h.y);
  const inDanger=(z==="caves"||z==="forest"||z==="arena"||z==="ruins"||z==="abyss"||z==="frost");
  const wantCombat=inDanger && G.enemies.some(e=>e.state==="chase"||e.state==="windup"||e.state==="shield");
  // a live boss / champion / capstone in the zone escalates to the épica boss theme.
  const bossFight=inDanger && G.enemies.some(e=>e.hp>0 && (e.isBoss||e.capstone||e.champion));
  const wantMusic=bossFight?"boss":wantCombat?"combat":"town";
  if(wantMusic!==G.music){ G.music=wantMusic; audio.playMusic(wantMusic); }
  // CAS-131: per-biome ambient soundscape crossfades under the music on zone change.
  if(z!==G._ambZone){ G._ambZone=z; if(audio&&audio.setAmbient) audio.setAmbient(z); }
  if(z==="arena" && !G.arenaWarned){ G.arenaWarned=true; toast(STR.enteredArena,3.5); }
  if(z==="caves" && !G.bossSpawned && h.y<(world.caves.y+10)*TS){ G.bossSpawned=true; spawnBoss(); }
  updateAmbush(dt, z, inDanger); // CAS-146: elite-ambush event clock (deterministic, in-zone only)

  // timers
  h.atkCD=Math.max(0,h.atkCD-dt); h.rollCD=Math.max(0,h.rollCD-dt); h.iframe=Math.max(0,h.iframe-dt); h.hurtFlash=Math.max(0,h.hurtFlash-dt); h.atkAnim=Math.max(0,h.atkAnim-dt);
  h._pdCD=Math.max(0,(h._pdCD||0)-dt); // perfect-dodge reward cooldown
  // spell cooldowns + timed buffs (in-place; no per-frame allocation)
  for(let s=1;s<4;s++){ if(h.spellCD[s]>0) h.spellCD[s]=Math.max(0,h.spellCD[s]-dt); }
  if(h.dmgBuffT>0){ h.dmgBuffT-=dt; if(h.dmgBuffT<=0){ h.dmgBonus-=h.dmgBuffAmt; h.dmgBuffAmt=0; } }
  if(h.defBuffT>0){ h.defBuffT-=dt; if(h.defBuffT<=0){ h.defBonus-=h.defBuffAmt; h.defBuffAmt=0; } }
  if(h.hotT>0){ h.hotT-=dt; h.hp=Math.min(heroMaxHp(h),h.hp+h.hotRate*dt); if(h.hotT<=0) h.hotRate=0; }
  // CAS-119: passive talent regeneration (regen build) — a slow always-on heal that
  // makes survivability builds observably outlast a glass build between fights.
  if(h.tt&&h.tt.regen>0 && h.hp>0){ const mhp=heroMaxHp(h); if(h.hp<mhp) h.hp=Math.min(mhp,h.hp+h.tt.regen*dt); }
  // CAS-118: the hero SUFFERS statuses too — slow/stun timers wind down and DoTs tick.
  if(h.slowT>0) h.slowT-=dt; if(h.stun>0) h.stun-=dt;
  if(h.dots) tickDots(h,dt,true);
  if(h.atkT>0){ h.atkT-=dt; if(h._atkHits) applyHeroMelee(); }
  // movement
  if(h.rolling){ h.rollT-=dt; const sp=CFG.rollSpeed; moveEnt(h,h.rollX*sp*dt,h.rollY*sp*dt,12);
    if(h.rollT<=0) h.rolling=false; h.moved=false; }
  else { const mv=io.moveVec(); const atkSlow=(h.atkAnim>0)?0.45:1; // commit to the swing — no free strafe-spam
    const statusSlow=(h.slowT>0)?(h.slow||1):1; // CAS-118: a mob-inflicted slow drags the hero down (readable: HUD tint + icon)
    const sp=(h.moveSpeed||CFG.heroSpeed)*(1+(affixTotals(h).movespd+(h.tt?h.tt.movespd:0))/100)*statusSlow; // CAS-100 class mobility · CAS-117 affix + CAS-119 talent +vel.mov
    h.vx=mv[0]*sp*atkSlow; h.vy=mv[1]*sp*atkSlow;
    h.moved=!!(mv[0]||mv[1]);
    if(h.moved){ moveEnt(h,h.vx*dt,h.vy*dt,12); h.walkT+=dt*8;
      h.dustT=(h.dustT||0)+dt; if(h.dustT>0.15){ h.dustT=0; addFx("dust", h.x-h.vx*0.03, h.y+15-h.vy*0.02); }
      // CAS-131: footstep SFX on a walk cadence (decoupled from the dust pulse).
      h.stepT=(h.stepT||0)+dt; if(h.stepT>0.30){ h.stepT=0; audio.sfx.step(); }
      if(!io.aimActive && io.isTouch) h.facing=Math.atan2(mv[1],mv[0]); }
    else h.walkT=0;
  }
  if(!io.isTouch) io.aim();
  { let ns = h.dead?"dead": h.rolling?"roll": h.atkAnim>0?"attack": h.moved?"walk":"idle";
    if(ns!==h.animState){ h.animState=ns; h.animT=0; } else h.animT+=dt; }

  // skull timers
  const s=G.skull; if(s.t>0){ s.t-=dt; if(s.t<=0){ s.level=0; s.kills=0; } }
  if(s.killT>0){ s.killT-=dt; if(s.killT<=0) s.kills=0; }

  // enemies
  updateEnemies(dt);
  updateProjectiles(dt);
  updateFields(dt);
  updateDrops(dt);
  updateFx(dt); updateFloaters(dt);
  // spawners
  for(const sp of world.spawners){ sp.t-=dt; const count=G.enemies.filter(e=>e.tpl && sp.types.includes(e.type)&&!e.isBoss).length;
    if(sp.t<=0 && count<sp.max){ sp.t=sp.cool; const tp=sp.types[ri(0,sp.types.length-1)];
      let tx,ty,tries=0; do{ tx=(sp.rect.x+rr(2,sp.rect.w-2))*TS; ty=(sp.rect.y+rr(2,sp.rect.h-2))*TS; tries++; }
        while((dist2(tx,ty,h.x,h.y)<300*300 || (world.wallSet&&world.wallSet.has(Math.floor(ty/TS)*MAP_W+Math.floor(tx/TS)))) && tries<10);
      const wallHere = world.wallSet && world.wallSet.has(Math.floor(ty/TS)*MAP_W+Math.floor(tx/TS));
      if(!wallHere && dist2(tx,ty,h.x,h.y)>240*240) applyZoneScale(spawnEnemy(tp,tx,ty), sp.zone); } }

  if(h.hp<=0) heroDie();
  // camera (presentation-only; reads plain viewport numbers, never the DOM)
  G.cam.x=lerp(G.cam.x, h.x-view.VW/2/view.zoom(), 0.14);
  G.cam.y=lerp(G.cam.y, h.y-view.VH/2/view.zoom(), 0.14);
  if(G.shake>0) G.shake=Math.max(0,G.shake-dt*30);
}

function updateEnemies(dt){ const h=G.hero;
  for(const e of G.enemies){
    e.hurtFlash=Math.max(0,e.hurtFlash-dt);
    if(e.slowT>0) e.slowT-=dt;
    // CAS-118: DoTs tick first so a burning/poisoned enemy keeps losing HP even while
    // stunned. A lethal tick runs the REAL killEnemy path (drops/xp/clear), then we skip
    // this corpse for the rest of the frame.
    // CAS-121: a carapaced boss is immune even to DoTs while the shield is up (the
    // status is recorded but paused) — it resumes ticking the instant the shield breaks.
    if(!e.shielded && e.dots && tickDots(e,dt,false)){ killEnemy(e); continue; }
    // CAS-121: resolve a carapace SHATTER first — a status proc is a valid break even if
    // it also stunned the boss (the stun gate below would otherwise swallow the frame).
    // Shattering drops the shield, staggers the boss (stun) and opens the damage window.
    if(e.shielded && e.shieldBroken){ shatterCarapace(e); }
    // CAS-65 capstone phase shift: cross the enrage HP threshold once -> speed up,
    // tighten the windup tell, and unlock the radial slam. Telegraphed loudly
    // (roar sfx + screen shake + flame burst + banner) so the spike is readable.
    if(e.capstone && !e.enraged && e.hp>0 && e.hp<=e.maxHp*e.enrageAt){
      e.enraged=true;
      e.tpl=Object.assign({},e.tpl,{ spd:e.baseSpd*e.enrageSpd, windup:e.tpl.windup*e.enrageWindup });
      toast(STR.bossEnrage(e.tpl.champName),2.8); audio.sfx.boss(); shakeAdd(12);
      for(let i=0;i<12;i++) addFx("flame",e.x+frr(-34,34),e.y+frr(-34,34));
    }
    // stun (shield bash / vines root): freeze the AI, only let knockback ride out
    if(e.stun>0){ e.stun-=dt; e.animState="idle"; e.animT=0;
      if(Math.abs(e.knockX)>1||Math.abs(e.knockY)>1){ moveEnt(e,e.knockX*dt,e.knockY*dt,e.tpl.size*0.6); e.knockX*=0.82; e.knockY*=0.82; }
      continue; }
    { let ns=(e.state==="windup"||e.state==="strike")?"attack":(e.state==="chase")?"walk":"idle";
      if(ns!==e.animState){ e.animState=ns; e.animT=0; } else e.animT=(e.animT||0)+dt; }
    // knockback decay
    if(Math.abs(e.knockX)>1||Math.abs(e.knockY)>1){ moveEnt(e,e.knockX*dt,e.knockY*dt,e.tpl.size*0.6); e.knockX*=0.82; e.knockY*=0.82; }
    const espd=e.tpl.spd*((e.slowT>0)?(e.slow||1):1); // frost slow scales chase speed
    const d=Math.hypot(h.x-e.x,h.y-e.y);
    const aggro=e.hostile?300:e.tpl.aggro;
    if(e.tpl.neutral && !e.hostile){ // wander only
      e.wanderT-=dt; if(e.wanderT<=0){ e.wanderT=rr(1.5,3.5); e.wx=rr(-1,1); e.wy=rr(-1,1); const n=norm(e.wx,e.wy); e.wx=n[0]; e.wy=n[1]; }
      moveEnt(e, (e.wx||0)*40*dt, (e.wy||0)*40*dt, e.tpl.size*0.6); continue; }
    if(e.state==="idle"||e.state==="wander"){
      if(d<aggro){ e.state="chase"; }
      else { e.wanderT-=dt; if(e.wanderT<=0){ e.wanderT=rr(1.5,3.5); const a=rr(0,6.28); e.wx=Math.cos(a); e.wy=Math.sin(a);} moveEnt(e,(e.wx||0)*30*dt,(e.wy||0)*30*dt,e.tpl.size*0.6); }
    } else if(e.state==="chase"){
      if(d>aggro*1.4 && !e.hostile){ e.state="idle"; }
      else {
        e.facing=Math.atan2(h.y-e.y,h.x-e.x);
        const arch=e.tpl.arch;
        // CAS-115 caster KITE / CAS-126 summoner+healer BACKLINE: maintain the band — if
        // the hero closes inside `kite`, back away (still readable: it never melees) and
        // hold its cadence until the hero is in the `kite`..`range` band again. The two new
        // support archetypes share this positioning (they hover behind the pack). Pure
        // positional, deterministic.
        if((arch==="caster"||arch==="summoner"||arch==="healer") && d < (e.tpl.kite||0)){
          const ra=Math.atan2(e.y-h.y,e.x-h.x); moveEnt(e,Math.cos(ra)*espd*dt,Math.sin(ra)*espd*dt,e.tpl.size*0.6);
        } else if(d<=e.tpl.range){
          e.atkCount=(e.atkCount||0)+1;
          // CAS-126 healer: lock the heal TARGET the instant it commits, so the windup can
          // draw a tether to it (telegraph). Most-wounded ally in range, never itself.
          if(arch==="healer"){ e.healTgt=pickWoundedAlly(e); }
          // CAS-121: the Cripta capstone's CORAZA DE ESCARCHA takes priority — on every
          // Nth committed attack it raises the carapace (immune + channel nova + adds)
          // instead of striking. Only a status break opens it (see shatter path above).
          if(e.carapace && (e.atkCount % e.carapace.every === 0)){ startCarapace(e); }
          else {
            // CAS-109: every Nth Champion strike is a telegraphed radial SLAM — a longer
            // windup (the growing-ring tell in render) then a ring of shards instead of
            // the melee hit. Punishes face-tanking; readable + dodgeable with the roll.
            e.specialNow = !!(e.special && e.special.slam && (e.atkCount % e.special.every === 0));
            e.state="windup"; e.st=e.specialNow ? (e.special.windup || e.tpl.windup*1.6) : e.tpl.windup; e.hitDone=false;
            if(e.specialNow){ audio.sfx.boss(); }
          }
        }
        else { moveEnt(e,Math.cos(e.facing)*espd*dt,Math.sin(e.facing)*espd*dt,e.tpl.size*0.6); }
      }
    } else if(e.state==="windup"){
      // CAS-126 charger COMMITS its facing at windup start — it does NOT track, so the
      // charge lane is fixed and the player can sidestep it (the whole point of the tell).
      e.st-=dt; if(e.tpl.arch!=="charger") e.facing=Math.atan2(h.y-e.y,h.x-e.x);
      if(e.st<=0){ e.state="strike";
        // strike-window length per archetype: rusher lunge + charger charge need a longer
        // window for the dash to read/travel; everyone else lands on the "now!" instant.
        e.st=(e.specialNow)?0.12:(e.tpl.arch==="charger")?0.36:(e.tpl.arch==="rusher")?0.2:0.12;
        addFx("strikeflash",e.x,e.y,{ang:e.facing,range:e.tpl.ranged?0:e.tpl.range,life:0.18}); // the "now!" instant
        // boss extra: ground wave on alternate strikes
        if(e.isBoss){ e.phase++; if(e.phase%2===0){ for(let k=0;k<10;k++){ const a=k/10*6.28; G.projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,life:1.2,dmg:18,kind:"rune",enemy:true}); } } }
        // CAS-65 capstone climax: once enraged, every strike erupts into a radial
        // slam — a ring of rune shards the player must roll through / clear out of.
        else if(e.capstone && e.enraged && e.slam){ const S=e.slam;
          for(let k=0;k<S.count;k++){ const a=k/S.count*6.28;
            G.projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*S.spd,vy:Math.sin(a)*S.spd,life:S.life,dmg:S.dmg,kind:"rune",enemy:true}); }
          addFx("novacast",e.x,e.y,{r:96,col:"#ff7a3a",life:0.45}); shakeAdd(8); }
        // CAS-109 Champion special: telegraphed radial slam on the strike instant
        // (windup was the growing-ring tell). The ring replaces the melee hit below.
        else if(e.specialNow && e.special && e.special.slam){ const S=e.special.slam;
          for(let k=0;k<S.count;k++){ const a=k/S.count*6.28 + (e.facing||0);
            G.projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*S.spd,vy:Math.sin(a)*S.spd,life:S.life,dmg:S.dmg,kind:"rune",enemy:true}); }
          addFx("novacast",e.x,e.y,{r:84,col:"#ffb27a",life:0.42}); shakeAdd(7); }
      }
    } else if(e.state==="strike"){
      e.st-=dt;
      // CAS-146 volatile DETONATION: on the strike instant it erupts a radial blast (the
      // growing ring during windup was the tell — clear the radius or it was already dead)
      // and SELF-DESTRUCTS. Handled at the top so it never reaches the melee/lunge branches.
      if(e.tpl.arch==="volatile"){ detonateVolatile(e); continue; }
      // CAS-115 rusher LUNGE: dash forward through the whole strike window (the telegraph
      // was the windup), landing a single contact hit when it reaches the hero. Closing
      // the gap IS the attack — sidestepping the lunge line avoids it.
      if(e.tpl.arch==="rusher" && !e.specialNow){
        const lspd=(e.tpl.lunge||110)/0.2; moveEnt(e,Math.cos(e.facing)*lspd*dt,Math.sin(e.facing)*lspd*dt,e.tpl.size*0.6);
        if(!e.hitDone && d<=e.tpl.size+e.tpl.range*0.5){ e.hitDone=true;
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl);
          addFx("spark",e.x+Math.cos(a)*14,e.y+Math.sin(a)*14); }
      }
      // CAS-126 charger CHARGE: barrel the full `charge` px along the LOCKED facing over
      // the strike window, ploughing PAST the hero (it does not stop on the hero — closing
      // the lane was the tell). One contact hit + big knock; sidestepping the lane avoids it.
      else if(e.tpl.arch==="charger" && !e.specialNow){
        const cspd=(e.tpl.charge||300)/0.36; moveEnt(e,Math.cos(e.facing)*cspd*dt,Math.sin(e.facing)*cspd*dt,e.tpl.size*0.6);
        if(!e.hitDone && d<=e.tpl.size+12){ e.hitDone=true;
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl);
          addFx("spark",e.x+Math.cos(a)*16,e.y+Math.sin(a)*16); shakeAdd(5); }
      }
      else if(!e.hitDone){ e.hitDone=true;
        // CAS-126 summoner: raise a deterministic ring of adds (crowd-capped) instead of
        // an attack. 0 direct dmg — the tide IS the threat. Adds scale to the zone tier.
        if(e.tpl.arch==="summoner"){ summonAdds(e); }
        // CAS-126 healer: mend the locked target (most-wounded ally) by a % of its max HP.
        // 0 direct dmg; the tether telegraph during windup let the player read + interrupt it.
        else if(e.tpl.arch==="healer"){ healAlly(e); }
        else if(e.specialNow){ /* CAS-109: radial slam already fired at strike start — no melee hit */ }
        // CAS-115 brute GROUND-SLAM: a small radial AoE (no facing arc — it hits all
        // around) with heavy knock. The grown ground-ring during windup told the player
        // to step OUT of the `aoe` radius; standing inside it eats the full blow.
        else if(e.tpl.arch==="brute"){ const R=e.tpl.aoe||56;
          if(d<=R+e.tpl.size*0.4){ const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl); }
          addFx("novacast",e.x,e.y+e.tpl.size*0.35,{r:R,col:"#ff7a3a",life:0.4}); shakeAdd(8);
        }
        else if(e.tpl.ranged){ const a=Math.atan2(h.y-e.y,h.x-e.x); e.facing=a;
          G.projectiles.push({x:e.x+Math.cos(a)*16, y:e.y-4+Math.sin(a)*16, vx:Math.cos(a)*e.tpl.projspd, vy:Math.sin(a)*e.tpl.projspd, life:2.4, dmg:e.tpl.dmg, kind:e.tpl.proj||"spear", enemy:true, ang:a, infl:e.tpl.infl}); // CAS-118: bolt carries the slow infl
          addFx("spark",e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);
        } else {
          if(d<=e.tpl.range+10){ const a=Math.atan2(h.y-e.y,h.x-e.x); if(Math.abs(angDiff(a,e.facing))<1.2) damageHero(e.tpl.dmg,a,e.tpl.infl); }
          addFx("spark",e.x+Math.cos(e.facing)*e.tpl.range*0.6,e.y+Math.sin(e.facing)*e.tpl.range*0.6);
        }
      }
      if(e.st<=0){ e.state="recover"; e.st=e.tpl.recover; e.specialNow=false; }
    } else if(e.state==="recover"){ e.st-=dt; if(e.st<=0) e.state=d<aggro?"chase":"idle"; }
    // CAS-121: CARAPACE CHANNEL — the boss holds position and channels the Freeze Nova.
    // A status break is resolved at the top of the loop (shatterCarapace). If the channel
    // runs out unbroken, the nova fires (heavy radial slow+dmg) and the shield drops into
    // a short recover — beatable by dodging, but far slower than shattering it.
    else if(e.state==="shield"){ e.facing=Math.atan2(h.y-e.y,h.x-e.x); e.st-=dt;
      if(e.st<=0) fireFrostNova(e); }
  }
}
// CAS-126 — support-archetype helpers (deterministic, zero RNG).
// pickWoundedAlly: the healer's target — the MOST-wounded living non-neutral ally within
// `heal.r` (lowest hp fraction), never itself, never a champion/boss. null if none hurt.
function pickWoundedAlly(e){ const H=e.tpl.heal; if(!H) return null; const r2=(H.r||180)*(H.r||180);
  let best=null, bestFrac=1;
  for(const o of G.enemies){ if(o===e||o.hp<=0||o.tpl.neutral||o.champion||o.isBoss) continue;
    if(dist2(o.x,o.y,e.x,e.y)>r2) continue; const frac=o.hp/(o.maxHp||1);
    if(frac<0.999 && frac<bestFrac){ bestFrac=frac; best=o; } }
  return best;
}
// healAlly: restore `heal.amt` of the locked target's max HP (capped). Telegraphed by the
// windup tether; the player could have killed the target/healer to deny it. 0 hero dmg.
function healAlly(e){ const H=e.tpl.heal, t=e.healTgt; e.healTgt=null; if(!H||!t||t.hp<=0) return;
  if(G.enemies.indexOf(t)<0) return; // target died mid-cast — the heal fizzles
  t.hp=Math.min(t.maxHp, t.hp + Math.round((H.amt||0.15)*t.maxHp)); t.hurtFlash=0.1;
  addFx("novacast",t.x,t.y,{r:e.tpl.size+6,col:"#7dffa0",life:0.4});
  for(let i=0;i<5;i++) addFx("spark",t.x+frr(-12,12),t.y+frr(-14,4));
}
// summonAdds: raise a deterministic ring of adds, BROOD-capped so it never floods. Caps on
// this summoner's own LIVING brood (`summonedBy` ref) — robust even as adds wander off to
// the hero, unlike a radius count. At `cap` the cast fizzles (just fx). Each add is scaled
// to the summoner's zone tier via the real spawn path. Never summons supports (fixed type).
function summonAdds(e){ const S=e.tpl.summon; if(!S) return;
  let brood=0; for(const o of G.enemies){ if(o.summonedBy===e && o.hp>0) brood++; }
  addFx("novacast",e.x,e.y,{r:e.tpl.size+8,col:"#b48cff",life:0.45});
  if(brood>=(S.cap||4)) return; // brood already full — hold (keeps the pack bounded / balanced)
  const room=(S.cap||4)-brood, n=Math.min(S.count||2, room);
  for(let i=0;i<n;i++){ const a=(i/Math.max(1,n))*6.28 + 0.5;
    const ax=e.x+Math.cos(a)*40, ay=e.y+Math.sin(a)*40;
    const add=spawnEnemy(S.type||"skeleton", ax, ay); if(add){ add.state="chase"; add.summonedBy=e; applyZoneScale(add, e.scaleZone); }
    addFx("spark",ax,ay); }
  audio.sfx.fire();
}
// CAS-146 — volatile self-destruct: damage the hero if inside the blast radius (the windup
// ring told them to clear it), erupt the AoE fx, and remove the mob WITHOUT loot/xp (a
// suicide is not a player kill, so it can never be farmed for free rewards). Deterministic
// except for the cosmetic-only flame scatter (frr, off the cosmetic RNG — never gameplay).
function detonateVolatile(e){
  const h=G.hero; const R=e.tpl.blast||72; const d=Math.hypot(h.x-e.x,h.y-e.y);
  if(d<=R+e.tpl.size*0.4 && !h.dead){ const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl); }
  addFx("novacast",e.x,e.y,{r:R,col:"#ff7a3a",life:0.5}); addFx("poof",e.x,e.y);
  for(let i=0,n=rmCount(10);i<n;i++) addFx("flame",e.x+frr(-R*0.5,R*0.5),e.y+frr(-R*0.5,R*0.5));
  shakeAdd(9); audio.sfx.fire();
  e.dead=true; const ix=G.enemies.indexOf(e); if(ix>=0) G.enemies.splice(ix,1);
}

// CAS-146 — ELITE AMBUSH event clock. Counts down ONLY while the hero is present in a hunt
// zone and alive (town/idle never builds it); fires a coordinated pack+elite when it elapses
// and locks (`active`) until that elite is cleared, then auto-recovers onto the cooldown.
// Never stacks on a live champion/capstone/boss (the hunt climax owns the screen). Pure
// time+RNG on the sim stream → deterministic / Stage-2 server-authority ready.
function updateAmbush(dt, zone, inDanger){
  const A=G.ambush; if(!A) return; const h=G.hero;
  // auto-recover the lock once the elite is gone (killed or abandoned to another zone)
  if(A.active && !G.enemies.some(e=>e.elite && e.hp>0)){ A.active=false; A.t=AMBUSH.cooldown; }
  if(!inDanger || !h || h.dead) return;                 // only builds while in a hunt zone
  if(A.active) return;                                  // an ambush is already in play
  if(G.enemies.some(e=>e.hp>0 && (e.isBoss||e.champion))) return; // never gank during a climax
  A.t-=dt;
  if(A.t<=0) spawnAmbush(zone);
}
// Pick the elite leader's base from the zone pool: a damaging melee/charger type — never a
// 0-dmg support (summoner/healer) or a self-destruct volatile, which make degenerate leaders.
function pickEliteBase(pool){
  const ok=pool.filter(t=>{ const tp=ETPL[t]; return tp && !tp.neutral && (tp.dmg||0)>0 && tp.arch!=="volatile" && tp.arch!=="summoner" && tp.arch!=="healer"; });
  const list=ok.length?ok:pool; return list[ri(0,list.length-1)];
}
// A clear open tile a readable ring-distance from the hero, inside the zone bounds — the
// pack/elite arrive near but never ON the player (same approach as the champion spawn).
function ambushSpawnPos(zone){ const r=world[zone]; const h=G.hero; const R=AMBUSH.ring||[160,230];
  for(let i=0;i<24;i++){ const a=rr(0,6.28), dpx=rr(R[0],R[1]);
    const x=h.x+Math.cos(a)*dpx, y=h.y+Math.sin(a)*dpx;
    const tx=Math.floor(x/TS), ty=Math.floor(y/TS);
    if(r && (tx<r.x+1||tx>r.x+r.w-2||ty<r.y+1||ty>r.y+r.h-2)) continue;
    if(!solidBlocked(x,y,16)) return {x,y}; }
  return {x:h.x+R[0], y:h.y};
}
// Erupt the ambush: a zone-scaled trash pack + one promoted ELITE leader, telegraphed loudly
// (warning toast + sting + spawn rings). The elite keeps its archetype telegraph so the fight
// stays readable; its reward tier comes from the kill zone's ZONE_LOOT (deeper zone = richer).
function spawnAmbush(zone){
  const A=G.ambush; const sp=world.spawners.find(s=>s.zone===zone); const pool=(sp&&sp.types)||["wolf"];
  const packN=ri(AMBUSH.packMin, AMBUSH.packMax);
  for(let i=0;i<packN;i++){ const t=pool[ri(0,pool.length-1)]; const p=ambushSpawnPos(zone);
    const add=applyZoneScale(spawnEnemy(t,p.x,p.y), zone);
    if(add){ add.state="chase"; add.fromAmbush=true; addFx("poof",p.x,p.y); } }
  const base=pickEliteBase(pool); const p=ambushSpawnPos(zone);
  const e=applyZoneScale(spawnEnemy(base,p.x,p.y), zone);
  if(e){ const E=AMBUSH.elite, b=e.tpl;
    e.tpl=Object.assign({},b,{ hp:Math.round(b.hp*E.hpMul), dmg:Math.round(b.dmg*E.dmgMul),
      size:Math.round(b.size*E.sizeMul), knock:Math.round(b.knock*E.knockMul), xp:Math.round(b.xp*E.xpMul) });
    e.hp=e.maxHp=e.tpl.hp; e.elite=true; e.state="chase"; e.zone=zone; e.fromAmbush=true;
    e.rwdTier=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier; e.rwdMinR=E.minR; e.rwdGold=E.goldBonus;
    for(let i=0,n=rmCount(10);i<n;i++) addFx("flame",e.x+frr(-24,24),e.y+frr(-24,24)); addFx("poof",p.x,p.y); }
  A.active=true; A.t=AMBUSH.cooldown;
  audio.sfx.boss(); shakeAdd(9); toast(STR.ambush(zone),3.2);
}

// CAS-146 — elite kill payoff: a GUARANTEED elevated drop (zone tier window, rarity floor)
// + bonus gold + a banner, feeding the merchant gold-sink. Reuses the same loot path as
// champions so nothing here re-rolls stats. Called from killEnemy's trash branch for elites.
function onEliteKill(e, zone){
  noteEliteKill(); // CAS-149: the ambush elite is the headline elite-class kill → feeds Mastery
  const win0=e.rwdTier||(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
  const ml=masteryLoot(G.hero, win0, e.rwdMinR||"uncommon"); // CAS-149: Mastery makes elite loot meaningful (floor up / tier bump)
  dropGear(e.x+frr(-8,8),e.y, rollGearInst(srand,ml.win[0],ml.win[1],ml.minR));
  G.drops.push({x:e.x+16,y:e.y,kind:"gold",amt:(e.rwdGold||AMBUSH.elite.goldBonus)+masteryRank(G.hero&&G.hero.eliteKills)*MASTERY.goldPerRank});
  audio.sfx.boss(); shakeAdd(8); toast(STR.eliteDown,2.6);
  for(let i=0,n=rmCount(10);i<n;i++) addFx("flame",e.x+frr(-26,26),e.y+frr(-26,26));
}
// CAS-121 — raise the frost carapace: immune + channel the Freeze Nova + summon adds.
function startCarapace(e){ const C=e.carapace; if(!C) return;
  e.shielded=true; e.shieldBroken=false; e.state="shield"; e.st=C.channel||2.4; e.hitDone=false;
  // summon adds in a deterministic ring around the boss (control/AoE pressure). Each is
  // scaled to the zone tier through the REAL spawn path so they're a genuine threat.
  const n=C.adds||0; for(let i=0;i<n;i++){ const a=(i/Math.max(1,n))*6.28;
    const ax=e.x+Math.cos(a)*72, ay=e.y+Math.sin(a)*72;
    const add=spawnEnemy(C.addType||"wraith", ax, ay); if(add){ add.state="chase"; applyZoneScale(add, e.zone); } }
  audio.sfx.boss(); shakeAdd(9); toast(STR.bossShield(e.tpl.champName),2.4);
  addFx("novacast",e.x,e.y,{r:60,col:"#7fd0ff",life:0.45});
  for(let i=0;i<8;i++) addFx("spark",e.x+frr(-28,28),e.y+frr(-28,28));
}
// CAS-121 — a landed status SHATTERS the carapace: drop the shield, cancel the nova and
// stagger the boss into a long damage window. The big payoff for a status-built kit.
function shatterCarapace(e){
  e.shielded=false; e.shieldBroken=false; e.state="recover"; e.st=0.2; e.specialNow=false;
  e.stun=Math.max(e.stun||0, (e.carapace&&e.carapace.shatterStun)||1.6);
  toast(STR.bossShatter(e.tpl.champName),2.2); audio.sfx.boss(); shakeAdd(11);
  addFx("novacast",e.x,e.y,{r:72,col:"#bfefff",life:0.5});
  for(let i=0;i<12;i++) addFx("spark",e.x+frr(-30,30),e.y+frr(-30,30));
}
// CAS-121 — the channel completed unbroken: erupt a dense radial ring that damages AND
// slows (the slow infl rides the same CAS-118 engine), then drop the shield into recover.
function fireFrostNova(e){ const N=(e.carapace&&e.carapace.nova)||{count:18,spd:150,dmg:24,life:1.4};
  for(let k=0;k<N.count;k++){ const a=k/N.count*6.28;
    G.projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*N.spd,vy:Math.sin(a)*N.spd,life:N.life,dmg:N.dmg,kind:"frostnova",enemy:true,
      infl:N.slow?{type:"slow",amt:N.slow.amt,dur:N.slow.dur}:null}); }
  addFx("novacast",e.x,e.y,{r:118,col:"#7fd0ff",life:0.5}); shakeAdd(13);
  toast(STR.bossNova(e.tpl.champName),2.0); audio.sfx.boss();
  e.shielded=false; e.shieldBroken=false; e.state="recover"; e.st=e.tpl.recover;
}
// reward reading the telegraph: a hit negated mid-roll refunds MP + pops, not the post-hit mercy i-frame
function perfectDodge(ang){ const h=G.hero; if((h._pdCD||0)>0) return; h._pdCD=0.5;
  freeze(6); h.iframe=Math.max(h.iframe,0.20); h.mp=Math.min(h.maxMp,h.mp+8);
  floater(h.x,h.y-34,STR.perfectDodge,"#bfeaff"); addFx("dodgering",h.x,h.y,{life:0.34}); audio.sfx.roll(); }
function damageHero(dmg,ang,infl){ const h=G.hero; if(h.dead) return;
  if(h.iframe>0){ if(h.rolling) perfectDodge(ang); return; } // only an active roll earns the dodge, not mercy i-frames
  // CAS-119: a dodge build (esquiva) can fully negate a connecting telegraphed strike
  // on a srand roll — reading the tell still beats it for free, this rewards investing
  // in evasion. srand consumed only when the build HAS dodge (baseline unchanged).
  const tt=h.tt; if(tt&&tt.dodge>0 && srand()*100<tt.dodge){ h.iframe=Math.max(h.iframe,0.2);
    floater(h.x,h.y-34,STR.talentDodge,"#bfeaff"); addFx("dodgering",h.x,h.y,{life:0.32}); audio.sfx.roll(); return; }
  const def=equippedDef(h); const real=Math.max(1,dmg-def*0.6);
  h.hp-=real; h.hurtFlash=0.18; audio.sfx.hurt(); shakeAdd(6); freeze(4); floater(h.x,h.y-30,"-"+Math.round(real),"#ff7a6a");
  h.iframe=0.25; // brief mercy invuln
  // CAS-118: a mob's telegraphed strike can also INFLICT a status (bandit poison / wraith
  // slow). It only lands when the hit lands — dodging the telegraph (i-frames above) skips
  // it entirely, so reading the tell avoids BOTH the damage and the state. AC #3.
  if(infl && infl.type) applyStatus(h, infl.type, infl);
}
function updateProjectiles(dt){ const h=G.hero;
  for(const p of G.projectiles){ p.life-=dt; p.x+=p.vx*dt; p.y+=p.vy*dt;
    if(solidBlocked(p.x,p.y,4)){ p.life=0; }
    if(p.enemy){ if(dist2(p.x,p.y,h.x,h.y)<18*18){ damageHero(p.dmg,Math.atan2(p.vy,p.vx),p.infl); p.life=0; } }
    else { for(const e of G.enemies){ if(e.dead) continue; if(dist2(p.x,p.y,e.x,e.y)<(e.tpl.size+7)*(e.tpl.size+7)){ const ha=Math.atan2(p.vy,p.vx); hitEnemy(e,p.dmg,ha);
      if(p.infl) applyStatus(e,p.infl.type,p.infl);    // CAS-120: skill projectile ignites/dazes on impact
      const aoe=p.aoe||((p.kind==="fire"||p.kind==="orb")?46:0); // basic fire/orb keep their legacy splash; spells carry their own aoe
      if(aoe){ addFx(p.burstFx||(p.kind==="orb"?"orbburst":"flame"),p.x,p.y,{life:0.45,col:p.col,r:aoe}); for(const e2 of G.enemies){ if(e2!==e&&!e2.dead&&dist2(p.x,p.y,e2.x,e2.y)<aoe*aoe){ hitEnemy(e2,p.dmg*0.5,Math.atan2(e2.y-p.y,e2.x-p.x)); if(p.infl) applyStatus(e2,p.infl.type,p.infl); } } }
      else addFx(p.burstFx||"impact",p.x,p.y,{ang:ha,col:p.col,life:0.3});
      shakeAdd(3); p.life=0; break; } } }
    if(p.life<=0){ if(p.kind==="fire") addFx("flame",p.x,p.y); else if(p.kind==="orb") addFx("orbburst",p.x,p.y,{life:0.45}); }
  }
  G.projectiles=G.projectiles.filter(p=>p.life>0);
}
function updateDrops(dt){ for(const d of G.drops){ d.t=(d.t||0)+dt; } }
// CAS-127: in-place compaction (write-index) instead of .filter() — keeps the same
// array instance every frame (no realloc/GC churn) and recycles expired floaters into
// the pool. Order preserved; identical visible result, far cheaper under dense packs.
function updateFx(dt){ const a=G.fx; let w=0; for(let i=0;i<a.length;i++){ const f=a[i]; f.t+=dt; if(f.t<f.life) a[w++]=f; } a.length=w; }
function updateFloaters(dt){ const a=G.floaters; let w=0; for(let i=0;i<a.length;i++){ const f=a[i]; f.t+=dt; f.y-=24*dt; if(f.t<f.life){ a[w++]=f; } else { _floatPool.push(f); } } a.length=w; }

// --------------------------- dev hooks (wired only when ?dev) ----------
export const dev = {
  spawn(type,dx,dy){ const e=spawnEnemy(type, G.hero.x+(dx||0), G.hero.y+(dy||0)); if(type==="golem"&&e) e.isBoss=true; return type; },
  tp(tx,ty){ G.hero.x=tx*TS; G.hero.y=ty*TS; return [G.hero.x,G.hero.y]; },
  // --- gear/progression harness hooks (tools/gear.mjs); additive, see CAS-29 ---
  tpZone(zone){ const r=world[zone]; if(!r) return null; G.hero.x=(r.x+r.w/2)*TS; G.hero.y=(r.y+r.h/2)*TS; return zone; },
  seed(n){ seed(n>>>0); return n>>>0; },                       // reseed the sim RNG (deterministic drops)
  gear(){ const h=G.hero; return { dmg:equippedDmg(h), def:equippedDef(h), weapon:gearName(h.equip.weapon),
    affix:affixTotals(h), equip:["weapon","body","shield"].map(s=>({slot:s,rarity:h.equip[s].rarity,affixes:h.equip[s].affixes||[]})) }; },
  // Spawn one enemy at the hero and kill it THIS instant via the real killEnemy,
  // returning only the drops that kill produced (the loot loop, not a shortcut).
  spawnKill(type){ const before=G.drops.length; const e=spawnEnemy(type, G.hero.x, G.hero.y);
    if(type==="golem"&&e) e.isBoss=true; e.hp=0; killEnemy(e);
    return G.drops.slice(before).map(d=>({ kind:d.kind, slot:d.slot, rarity:d.rarity, stat:d.stat, tier:d.tier, affixes:(d.inst&&d.inst.affixes)||[] })); },
  // CAS-116: the resolved drop-tier window for a zone (reads ZONE_LOOT), so the loot
  // harness can prove the Abismo out-tiers the open zones without re-deriving stats.
  zoneLoot(zone){ const w=ZONE_LOOT[zone]; return w?{zone,tier:w.tier.slice()}:null; },
  pickup(){ tryPickup(); return G.hero.bag.length; },
  // --- zone-difficulty harness hook (tools/hunt.mjs, CAS-73); additive ---
  // Spawn one trash mob through the REAL spawn+scale path, read its SCALED stats,
  // then remove it — proves a zone's tier multiplies mob hp/dmg/spd/xp (no shortcut
  // around applyZoneScale). Off-screen coords so it never interferes with play.
  zoneTier(zone, type){ const e=applyZoneScale(spawnEnemy(type, -9999, -9999), zone);
    const z=ZONE_TIER[zone]; const r=z?{ tier:z.tier, hp:e.tpl.hp, dmg:e.tpl.dmg, spd:e.tpl.spd, xp:e.tpl.xp }:null;
    G.enemies.splice(G.enemies.indexOf(e),1); return r; },
  // --- hunt-contract harness hooks (tools/hunt.mjs, CAS-63); additive ---
  // Read a zone's contract progress; champ reports the live elite's hp if summoned.
  huntState(zone){ const H=G.hunts&&G.hunts[zone]; const cfgH=HUNTS[zone]; if(!H||!cfgH) return null;
    return { kills:H.kills, need:cfgH.need, cleared:H.cleared,
      champ: H.champ?{hp:Math.round(H.champ.hp),max:H.champ.maxHp,name:H.champ.tpl.champName,
        capstone:!!H.champ.capstone, enraged:!!H.champ.enraged, slamCount:H.champ.slam?H.champ.slam.count:0,
        hasSpecial:!!H.champ.special, specialNow:!!H.champ.specialNow, state:H.champ.state,
        specialSlam:H.champ.special?H.champ.special.slam.count:0,
        // CAS-121 carapace telemetry: whether this boss has the shield mechanic, whether
        // it's currently up, the channel time left, and the configured nova/adds.
        hasCarapace:!!H.champ.carapace, shielded:!!H.champ.shielded, shieldT:+(H.champ.shielded?H.champ.st:0).toFixed(2),
        novaCount:H.champ.carapace?H.champ.carapace.nova.count:0, adds:H.champ.carapace?H.champ.carapace.adds:0,
        rwdTier:H.champ.rwdTier||null, rwdMinR:H.champ.rwdMinR||null}:null }; },
  // CAS-121: arm the live capstone so its NEXT in-range attack raises the carapace (sets
  // atkCount to one below the cadence). The REAL chase→startCarapace path then fires the
  // shield — no shortcut around the immune/channel/nova logic. Pair with poke() to park
  // the hero in range, then heroHit()/giveBurnWeapon() to prove a status SHATTERS it.
  forceCarapace(zone){ const H=G.hunts&&G.hunts[zone]; if(!H||!H.champ||!H.champ.carapace) return null;
    const e=H.champ; e.atkCount=e.carapace.every-1; e.state="chase"; e.shielded=false; e.shieldBroken=false;
    return { every:e.carapace.every, atkCount:e.atkCount, channel:e.carapace.channel, novaCount:e.carapace.nova.count }; },
  // CAS-121: read the Cripta Helada power gate (mirrors abyssGate) — current power, the
  // (higher) requirement, whether the frost portal would open, and the live zone.
  frostGate(){ const h=G.hero; const pw=heroPower(h); return { power:pw, req:FROST_POWER_REQ,
    unlocked:pw>=FROST_POWER_REQ, zone:zoneOf(world,h.x,h.y), upg:{...(h.upg||{})}, lvl:h.lvl }; },
  // --- CAS-123 Stage-1 finale harness hooks (tools/cas123-finale.mjs); additive ---
  // Read the win-condition arc: the final-boss config, the durable win flag, the run
  // stats and the live victory snapshot + scene. Proves the goal exists, persists and
  // resolves — without forcing it.
  stage1State(){ const h=G.hero; return { goal:{...STAGE1_GOAL}, stage1:!!(h&&h.stage1),
    scene:G.scene, playT:Math.floor((h&&h.playT)||0), deaths:(h&&h.deaths)||0,
    finalIsFinal:!!(HUNTS.frost&&HUNTS.frost.boss&&HUNTS.frost.boss.final),
    victory:G.victory?{...G.victory}:null }; },
  // Drive the REAL win path: ensure the final capstone is summoned + park the hero on it,
  // so killing it (huntKillChampion) flows through onChampionKill → winStage1 with no
  // shortcut around the flag/snapshot/scene switch. Returns the live champ telemetry.
  armFinalBoss(){ const zone=STAGE1_GOAL.zone; const H=G.hunts&&G.hunts[zone]; if(!H) return null;
    if(!H.champ && !H.cleared){ H.kills=HUNTS[zone].need; spawnChampion(zone); }
    const e=H.champ; if(!e) return null; const h=G.hero; h.x=e.x+18; h.y=e.y; h.maxHp=8000; h.hp=8000; h.iframe=0;
    return { name:e.tpl.champName, final:!!e.final, hp:Math.round(e.hp) }; },
  // Dismiss the victory screen → free play (mirrors the input handler).
  ackVictory(){ dismissVictory(); return G.scene; },
  // CAS-132: drive the REAL hero-death path (heroDie → deaths++, scene "dead") so the
  // analytics funnel's "primera muerte" step can be QA-verified headlessly. Dev-only,
  // additive — no balance/gameplay change (the live game never calls this).
  killHero(){ heroDie(); return { deaths:G.hero.deaths, scene:G.scene }; },
  // CAS-109: arm the live Champion so its NEXT in-range strike is the telegraphed
  // radial slam (sets atkCount to one below the cadence). The REAL windup→strike AI
  // then fires the special — no shortcut around the slam emission. Pair with poke()
  // to park the hero in range and enemyProj() to count the shards.
  forceSpecial(zone){ const H=G.hunts&&G.hunts[zone]; if(!H||!H.champ||!H.champ.special) return null;
    const e=H.champ; e.atkCount=e.special.every-1; e.state="chase";
    return { every:e.special.every, atkCount:e.atkCount, slam:e.special.slam.count }; },
  // --- capstone-boss harness hooks (tools/hunt.mjs, CAS-65); additive ---
  // Set the live champ's HP to a fraction of max so the REAL updateEnemies enrage
  // check (next frame) fires the phase shift — not a shortcut around the threshold.
  setChampHp(zone,frac){ const H=G.hunts&&G.hunts[zone]; if(!H||!H.champ) return null;
    H.champ.hp=Math.max(1,Math.round(H.champ.maxHp*frac)); return Math.round(H.champ.hp); },
  // Park the hero on top of the live champ + top them off, so the boss runs its
  // real windup→strike→slam against a survivable target and we can count shards.
  poke(zone){ const H=G.hunts&&G.hunts[zone]; const h=G.hero; if(!H||!H.champ) return null;
    h.x=H.champ.x+18; h.y=H.champ.y; h.maxHp=4000; h.hp=4000; h.iframe=0; return true; },
  // Count live enemy projectiles by kind (the radial slam emits kind:"rune"; the
  // CAS-121 Freeze Nova emits kind:"frostnova").
  enemyProj(){ const ps=G.projectiles.filter(p=>p.enemy); return { total:ps.length, rune:ps.filter(p=>p.kind==="rune").length, frostnova:ps.filter(p=>p.kind==="frostnova").length }; },
  // CAS-121: land a REAL hero basic-attack hit on the zone's live capstone (through
  // hitEnemy, so carapace immunity + weapon/talent status procs apply) and return its
  // hp + shield/status state — proves the shield is damage-IMMUNE and that a STATUS
  // proc SHATTERS it. Targets the champion specifically (G.enemies[0] may be an add).
  hitChamp(zone){ const H=G.hunts&&G.hunts[zone]; const h=G.hero; if(!H||!H.champ) return null;
    const e=H.champ; h.facing=Math.atan2(e.y-h.y,e.x-h.x);
    const before=Math.round(e.hp); hitEnemy(e, equippedDmg(h), h.facing);
    return { before, hp:Math.round(e.hp), shielded:!!e.shielded, shieldBroken:!!e.shieldBroken,
      dots:e.dots?Object.keys(e.dots):[], slowT:+(e.slowT||0).toFixed(2), stun:+(e.stun||0).toFixed(2) }; },
  // Kill the zone's live Champion through the REAL killEnemy and return its drops —
  // the genuine clear path (guaranteed gear + bonus), not a shortcut.
  huntKillChampion(zone){ const H=G.hunts&&G.hunts[zone]; if(!H||!H.champ) return null;
    const e=H.champ; const before=G.drops.length; e.hp=0; killEnemy(e);
    return { cleared:H.cleared, drops:G.drops.slice(before).map(d=>({kind:d.kind, slot:d.slot, rarity:d.rarity, stat:d.stat, tier:d.tier, amt:d.amt})) }; },
  // --- spell-identity harness hooks (tools/spells.mjs, CAS-52); additive ---
  setClass(cls){ if(SPELLS[cls]){ G.hero.cls=cls; } return G.hero.cls; },
  // CAS-100: base-stat identity probe. Builds a fresh level-1 hero of `cls` through
  // the REAL newHero path and reports the spawned base stats + projected level-10
  // pools (per-class growth applied), so the headless test can assert the 5 classes
  // are MEASURABLY distinct, not just differently skinned. Restores the live hero.
  classStats(cls){
    if(!CLASS_STATS[cls]) return null; const save=G.hero;
    const h=newHero("probe",cls); const at=ATK[cls]||ATK.warrior;
    let mhp=h.maxHp, mmp=h.maxMp, dmg=h.baseDmg; const L=10;
    for(let l=1;l<L;l++){ mhp+=h.hpGain; mmp+=h.mpGain; dmg+=h.dmgGain; }
    G.hero=save;
    return { cls, hp:h.maxHp, mp:h.maxMp, dmg:h.baseDmg, moveSpeed:Math.round(h.moveSpeed),
      atkCD:at.cd, atkType:at.type, hpGain:h.hpGain, mpGain:h.mpGain, dmgGain:h.dmgGain,
      lvl10:{ hp:mhp, mp:mmp, dmg } }; },
  cast(i){ castSpell(i); return { mp:Math.round(G.hero.mp), cd:G.hero.spellCD.slice() }; },
  // Probe one class: cast each of slots 1-3 at a fresh dummy enemy in front and
  // return the OBSERVED effect of each, so the headless test can assert all 15
  // spells are mechanically distinguishable (not just differently labelled).
  spellProbe(cls){
    if(!SPELLS[cls]) return null; const out=[]; const h=G.hero;
    for(let slot=1; slot<=3; slot++){
      h.cls=cls; h.maxMp=200; h.mp=200; h.maxHp=400; h.hp=1; h.facing=0; h.rolling=false;
      h.dmgBonus=0; h.defBonus=0; h.dmgBuffT=0; h.dmgBuffAmt=0; h.defBuffT=0; h.defBuffAmt=0; h.hotT=0; h.hotRate=0;
      h.spellCD=[0,0,0,0]; h.spellCDmax=[0,0,0,0];
      G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
      const e=spawnEnemy("orc", h.x+40, h.y); e.maxHp=e.hp=600;
      const e0=e.hp, h0=h.hp, hx0=h.x, hy0=h.y;
      castSpell(slot);
      const sp=SPELLS[cls][slot-1]; const pr=G.projectiles[G.projectiles.length-1];
      out.push({ slot, id:sp.id, type:sp.type, cost:sp.cost,
        mpSpent: 200-Math.round(h.mp),
        enemyDmg: Math.round(e0-e.hp),
        heroHeal: Math.round(h.hp-h0),
        heroMoved: Math.round(Math.hypot(h.x-hx0, h.y-hy0)),
        fieldSpawned: G.fields.length,
        projSpawned: G.projectiles.length,
        projKind: pr?pr.kind:null, projAoe: pr?(pr.aoe||0):0, projSpd: pr?Math.round(Math.hypot(pr.vx,pr.vy)):0, projDmg: pr?pr.dmg:0,
        dmgBuff: h.dmgBonus, defBuff: h.defBonus,
        enemyStun: +(e.stun||0).toFixed(2), enemySlowT: +(e.slowT||0).toFixed(2),
        hotActive: h.hotT>0?1:0 });
    }
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    return out;
  },
  // Field DoT-over-time probe (CAS-70): plant the druid thornstorm field on a stunned
  // dummy, then advance the REAL update() loop ~2s and confirm the zone keeps ticking
  // damage after the plant tick and then expires. Exercises updateFields() — the one
  // new sim path the per-cast spellProbe can't see. Deterministic; restores state.
  dotProbe(){
    const h=G.hero; h.cls="druid"; h.maxMp=200; h.mp=200; h.maxHp=400; h.hp=400; h.facing=0; h.rolling=false;
    h.spellCD=[0,0,0,0]; h.spellCDmax=[0,0,0,0];
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const e=spawnEnemy("orc", h.x+40, h.y); e.maxHp=e.hp=2000; e.stun=999; // root so it stays in the zone
    const hp0=e.hp; castSpell(3); const afterPlant=e.hp;                   // slot4 = druid thornstorm (field)
    let ticks=0; const steps=76;                                          // ~3.8s at 50ms (past the 3s field life)
    for(let s=0;s<steps;s++){ const before=e.hp; e.stun=999; update(50); if(e.hp<before-0.001) ticks++; }
    const afterTime=e.hp, fieldsLeft=G.fields.length;
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    return { plantDmg:Math.round(hp0-afterPlant), overTimeDmg:Math.round(afterPlant-afterTime), ticks, fieldsLeft };
  },
  // --- CAS-112 merchant-shop harness hooks (tools/shop.mjs); additive ---
  // Park the hero on the Mercader Ambulante so the REAL interact()→dialogue→shop
  // path can be driven by the test (E twice). Returns the merchant's coords.
  merchantTP(){ for(const n of world.npcs){ if(n.role==="merchant"){ G.hero.x=n.x; G.hero.y=n.y+10; return [Math.round(n.x),Math.round(n.y)]; } } return null; },
  // CAS-134: park the hero on the Bounty-Board steward so the REAL interact()→dialogue→
  // bounty-board path (E twice) can be driven by the daily harness / screenshot tool.
  bountyTP(){ for(const n of world.npcs){ if(n.role==="bounty"){ G.hero.x=n.x; G.hero.y=n.y+10; return [Math.round(n.x),Math.round(n.y)]; } } return null; },
  // Read the live shop list (whichever shop is open) with each line's affordability
  // gate, so the headless test can assert maxed/blocked lines without guessing.
  shopList(){ const h=G.hero; return shopItems().map(it=>({ name:it.name, price:it.price, blocked:!!(it.once&&it.once(h)) })); },
  // Buy through the REAL buyItem (gold check + once-gate + act), then snapshot the
  // combat stats it touched — proves a purchase changes real numbers, not just UI.
  shopBuy(i){ buyItem(i); return this.heroStats(); },
  heroStats(){ const h=G.hero; const af=affixTotals(h); return { gold:h.gold, dmg:equippedDmg(h), def:equippedDef(h),
    baseDmg:h.baseDmg, maxHp:heroMaxHp(h), baseMaxHp:h.maxHp, hp:Math.round(h.hp), potHP:h.potHP, potMP:h.potMP,
    affix:af, moveSpeed:Math.round((h.moveSpeed||CFG.heroSpeed)*(1+af.movespd/100)),
    upg:{...(h.upg||{})}, scene:G.scene, merchant:!!G.merchantShop }; },
  setGold(n){ G.hero.gold=n>>>0; return G.hero.gold; },
  // --- CAS-114 abyss power-gate harness hooks (tools/abyss.mjs); additive ---
  // Read the gate: current power, requirement, whether the portal would open, and the
  // live zone the hero stands in. Lets the test assert lock/unlock without guessing.
  abyssGate(){ const h=G.hero; const pw=heroPower(h); return { power:pw, req:ABYSS_POWER_REQ,
    unlocked:pw>=ABYSS_POWER_REQ, zone:zoneOf(world,h.x,h.y),
    upg:{...(h.upg||{})}, lvl:h.lvl }; },
  // Set the permanent upgrade tiers directly (the gold-sink stat the gate reads), so a
  // test can drive the hero across the threshold without grinding the shop. baseDmg etc.
  // are NOT touched here — this only moves the GATE input; combat hooks cover the rest.
  setUpg(d,hp,def){ const h=G.hero; h.upg={dmg:Math.max(0,d|0),hp:Math.max(0,hp|0),def:Math.max(0,def|0)}; return heroPower(h); },
  // Park the hero on a portal and fire the REAL interact()→usePortal path, returning the
  // resulting zone — proves the gate denies/allows and the warp lands (no shortcut).
  tryPortal(to){ const P=world.portals&&world.portals.find(p=>p.to===to); if(!P) return null;
    G.hero.x=P.x; G.hero.y=P.y; const before=zoneOf(world,G.hero.x,G.hero.y);
    interact(); return { to, before, after:zoneOf(world,G.hero.x,G.hero.y), power:heroPower(G.hero), req:ABYSS_POWER_REQ }; },
  bag(){ return G.hero.bag.map(b=>({ slot:b.slot, rarity:b.rarity, stat:gearStat(b), defId:b.defId, name:gearName(b), affixes:b.affixes||[] })); },
  equipBag(i){ return equipBag(i); },
  // CAS-117: the equip DECISION surface — snapshot combat totals + the slot's
  // equipped-vs-candidate affixes BEFORE committing, so the compare/diff (UI and
  // QA) can show the tradeoff without mutating state. Returns null for a bad index.
  equipPreview(i){ const h=G.hero; const cand=h.bag[i]; if(!cand) return null;
    const cur=h.equip[cand.slot]; const before={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h),af:affixTotals(h)};
    h.equip[cand.slot]=cand; const after={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h),af:affixTotals(h)}; h.equip[cand.slot]=cur;
    return { slot:cand.slot, equipped:{rarity:cur.rarity,stat:gearStat(cur),affixes:cur.affixes||[]},
      candidate:{rarity:cand.rarity,stat:gearStat(cand),affixes:cand.affixes||[]}, before, after }; },
  openInv(){ G.scene="inventory"; return G.scene; },
  // --- CAS-115 combat-archetype harness hooks (tools/archetypes.mjs); additive ---
  // Static archetype metadata straight off the data table (no sim step) so the test can
  // assert ≥3 distinct archetypes exist with their behaviour fields + danger reward.
  archMeta(type){ const t=ETPL[type]; if(!t) return null;
    return { type, arch:t.arch||null, ranged:!!t.ranged, lunge:t.lunge||0, kite:t.kite||0, aoe:t.aoe||0,
      charge:t.charge||0, summon:t.summon||null, heal:t.heal||null, // CAS-126 new-archetype fields
      hp:t.hp, dmg:t.dmg, spd:t.spd, xp:t.xp, gold:t.gold.slice(), windup:t.windup }; },
  // Clean single-mob arena for behaviour probing: clear all entities, park a tanky hero
  // at a fixed spot (so AoE/lunge damage is measurable, mercy-iframes off), spawn ONE
  // unscaled mob at offset dx,dy. The REAL updateEnemies (driven by the page game loop)
  // then runs it; the harness reads archSnap() each tick. No shortcut around the AI.
  archArena(type,dx,dy){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const e=spawnEnemy(type, h.x+(dx||0), h.y+(dy||0)); if(e){ e.state="chase"; } return e?type:null; },
  // Live behaviour snapshot of the single arena mob + hero damage taken so far.
  archSnap(){ const e=G.enemies[0], h=G.hero; if(!e) return null;
    return { type:e.type, arch:e.tpl.arch||null, state:e.state,
      dist:Math.round(Math.hypot(e.x-h.x,e.y-h.y)), ex:Math.round(e.x), ey:Math.round(e.y),
      heroDmgTaken:Math.round(100000-h.hp), enemyProj:G.projectiles.filter(p=>p.enemy).length }; },
  // Move the hero to a fixed offset from the arena mob (to test dodging out of an AoE /
  // sidestepping a lunge mid-windup) without touching its AI state.
  archMoveHero(dx,dy){ const e=G.enemies[0]; if(!e) return null; const h=G.hero;
    h.x=e.x+(dx||0); h.y=e.y+(dy||0); h.iframe=0; return { dist:Math.round(Math.hypot(e.x-h.x,e.y-h.y)) }; },
  // --- CAS-126 new-archetype + zone-identity harness hooks (tools/cas126-archetypes.mjs) ---
  // The per-zone spawner pool compositions, so the test can assert each zone fields a
  // DIFFERENT mix of archetypes (AC2: zona A ≠ zona B). Pure data off world.spawners.
  zonePools(){ const o={}; for(const s of world.spawners) o[s.zone]=s.types.slice(); return o; },
  enemyCount(){ return G.enemies.length; },
  // Count of LIVING summoned adds (their `summonedBy` is set) — isolates a summoner's brood
  // from the live zone spawner so the test can assert the crowd-cap holds.
  broodCount(){ let n=0; for(const o of G.enemies){ if(o.summonedBy && o.hp>0) n++; } return n; },
  // Summoner probe: tanky hero, ONE summoner parked in its firing band (dx in kite..range)
  // so the REAL AI commits its raise cadence. Harness polls enemyCount() — adds appear,
  // then plateau at `cap` (crowd-capped, never floods). Deterministic (fixed offsets).
  summonProbe(){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const e=spawnEnemy("summoner", h.x+210, h.y); if(e){ e.state="chase"; applyZoneScale(e,"caves"); } return e?G.enemies.length:0; },
  // Healer probe: a WOUNDED ally + a healer next to it, both parked in the healer's band
  // from the hero. Returns the ally's start HP; harness polls archAllyHp() — it must rise
  // (the medic mends it) then the player could deny it by killing the medic. Deterministic.
  healProbe(){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const heal=spawnEnemy("healer", h.x+200, h.y); if(heal) heal.state="chase";
    const ally=spawnEnemy("orc", h.x+200, h.y-40); if(ally){ ally.state="idle"; ally.hp=Math.round(ally.maxHp*0.3); } // 30% → wounded
    return ally?ally.hp:0; },
  // Live HP of the wounded ally (index 1) in the heal probe.
  archAllyHp(){ const a=G.enemies[1]; return a?a.hp:0; },
  // --- CAS-146 elite-ambush + volatile harness hooks (tools/cas146-variety.mjs) ---
  // Clean arena: tanky hero parked at a fixed spot, ONE volatile spawned in range so the REAL
  // AI commits its windup→detonate. Harness polls volatileSnap(): the mob telegraphs, blows up
  // (heroDmgTaken jumps), and is GONE (self-destruct). Deterministic (fixed offset).
  volatileProbe(dx){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const e=spawnEnemy("volatile", h.x+(dx||34), h.y); if(e){ e.state="chase"; e._probe=true; } return e?"volatile":null; },
  // Tracks the PROBE entity only (`_probe`), so a live zone spawn never masks the detonation.
  volatileSnap(){ const e=G.enemies.find(x=>x._probe && x.hp>0); const h=G.hero;
    return { alive:!!(e&&e.hp>0), state:e?e.state:"gone", blast:e?(e.tpl.blast||0):0,
      dist:e?Math.round(Math.hypot(e.x-h.x,e.y-h.y)):-1, heroDmgTaken:Math.round(100000-h.hp),
      enemyCount:G.enemies.length }; },
  // Force the ambush event in the hero's CURRENT zone through the real spawnAmbush path (no
  // shortcut around pack/elite spawning or the reward block). Pair with tpZone() to pick the
  // zone first. Returns the elite's promoted stats so the test can assert it out-scales trash.
  forceAmbush(){ const z=zoneOf(world,G.hero.x,G.hero.y); G.ambush.active=false; G.ambush.t=0;
    spawnAmbush(z); const e=G.enemies.find(x=>x.elite&&x.hp>0);
    return e?{zone:z, type:e.type, hp:Math.round(e.hp), maxHp:Math.round(e.maxHp), dmg:e.tpl.dmg, size:e.tpl.size,
      packCount:G.enemies.filter(x=>x.fromAmbush&&!x.elite&&x.hp>0).length, rwdMinR:e.rwdMinR, active:G.ambush.active}:null; },
  // Live ambush telemetry: clock, lock, pack/elite counts. The base (un-promoted) stat of the
  // elite's type so the test can prove the elite's hp/dmg are MULTIPLES of base (real promotion).
  ambushSnap(){ const A=G.ambush; const e=G.enemies.find(x=>x.elite&&x.hp>0);
    const base=e?ETPL[e.type]:null;
    return { t:+(A?A.t:0).toFixed(2), active:!!(A&&A.active),
      pack:G.enemies.filter(x=>x.fromAmbush&&!x.elite&&x.hp>0).length,
      elite: e?{type:e.type, hp:Math.round(e.hp), dmg:e.tpl.dmg, size:e.tpl.size,
        baseHp:base?base.hp:0, baseDmg:base?base.dmg:0}:null }; },
  // Spawn-kill an elite of `type` THIS instant via the real killEnemy elite branch, returning
  // only the drops that kill produced — proves the GUARANTEED elevated loot + bonus gold (AC3).
  eliteSpawnKill(type, zone){ const before=G.drops.length; const e=spawnEnemy(type||"orc", G.hero.x, G.hero.y);
    e.elite=true; e.zone=zone||"caves"; e.rwdTier=(ZONE_LOOT[e.zone]||ZONE_LOOT.field).tier; e.rwdMinR=AMBUSH.elite.minR; e.rwdGold=AMBUSH.elite.goldBonus;
    e.hp=0; killEnemy(e);
    return G.drops.slice(before).map(d=>({ kind:d.kind, rarity:d.rarity, tier:d.tier, amt:d.amt||0 })); },
  // --- CAS-149 Elite-Mastery harness hooks (tools/cas149-progression.mjs) ---
  // Live, read-only Mastery telemetry: lifetime elite kills, derived rank, next threshold,
  // and the player's current maxHp (so the test can assert the rank-up +maxHp baked in).
  masterySnap(){ const h=G.hero; const k=h?(h.eliteKills|0):0; const r=masteryRank(k);
    return { eliteKills:k, rank:r, next:masteryNextAt(r), maxHp:h?Math.round(h.maxHp):0, hp:h?Math.round(h.hp):0 }; },
  // Set the lifetime elite-kill counter directly (no rewards/rank-bake) so a test can park the
  // hero at a chosen Mastery rank before spawn-killing an elite to observe the loot fortune.
  setEliteKills(n){ const h=G.hero; if(h) h.eliteKills=Math.max(0,Math.floor(n||0)); return h?(h.eliteKills|0):0; },
  // Tick ONE elite-class kill toward Mastery via the real noteEliteKill path (the rank-up
  // +maxHp bake) WITHOUT any XP/loot — so a test can isolate the Mastery bonus from the
  // level-up maxHp gains that real elite kills also grant. Returns the live snapshot.
  bumpMastery(){ noteEliteKill(); return this.masterySnap(); },
  // Determinism probe (tools/determinism.mjs). Rebuilds the world from a FRESH
  // RNG each call so independent runs must agree byte-for-byte. seed is accepted
  // but buildWorld() still hard-seeds internally (tracked Stage-2 seam).
  worldFingerprint(/*seed*/){
    const w = buildWorld(createRNG());
    let hh = 0x811c9dc5 >>> 0;                      // FNV-1a over terrain bytes
    for(let i=0;i<w.terr.length;i++){ hh ^= w.terr[i]; hh = Math.imul(hh, 0x01000193) >>> 0; }
    return {
      terrHash: hh, terrLen: w.terr.length, wallCount: w.wallSet.size,
      solids: w.solids.map(s=>[s.x,s.y,s.r,s.kind]),
      npcs: w.npcs.map(n=>[Math.round(n.x),Math.round(n.y),n.sprite]),
      spawnCoords: w.spawners.map(s=>[s.rect.x,s.rect.y,s.rect.w,s.rect.h]),
    };
  },
  // --- CAS-118 status-effect harness hooks (tools/cas118-status.mjs); additive ---
  // Static status metadata straight off the STATUS table (no sim step) so the test can
  // assert the catalogue (≥3 effects with their tick/dur/dmg behaviour fields).
  statusMeta(type){ const s=STATUS[type]; if(!s) return null;
    return { type, dot:!!s.dot, tick:s.tick||0, dur:s.dur, dmg:s.dmg||0, amt:s.amt||0, label:s.label }; },
  // The mob→hero infl row (which mobs apply what on a telegraphed strike) — proves AC#3
  // data exists without driving a fight.
  mobInfl(type){ const t=ETPL[type]; return (t&&t.infl)?{...t.infl}:null; },
  // Live status snapshot of the hero or the first/only enemy: active DoTs (remaining
  // time + per-tick dmg), slow, stun, hp. The headless test reads this each tick to
  // assert tics land and durations expire.
  statusOf(who){ const ent= who==="hero"?G.hero:G.enemies[0]; if(!ent) return null;
    const dots={}; if(ent.dots) for(const k in ent.dots){ dots[k]={ t:+ent.dots[k].t.toFixed(2), dmg:ent.dots[k].dmg }; }
    return { dots, slowT:+(ent.slowT||0).toFixed(2), slow:ent.slow||1, stun:+(ent.stun||0).toFixed(2), hp:Math.round(ent.hp) }; },
  // Apply a status through the REAL engine (proves the apply/tick/expire path + visual).
  applyStatusTo(who,type,opt){ const ent= who==="hero"?G.hero:G.enemies[0]; if(!ent) return null; applyStatus(ent,type,opt||{}); return this.statusOf(who); },
  // Read the equipped weapon's on-hit procs — the CAS-117 affix → CAS-118 effect bridge.
  weaponProcs(){ return weaponProcs(G.hero)||[]; },
  // Force a burn affix onto the live weapon so the harness can prove that EQUIPPING an
  // 'ardiente' weapon makes struck enemies catch fire (AC#2). A real instance mutation.
  giveBurnWeapon(amt){ const w=G.hero.equip.weapon; w.affixes=[{id:"burn",amt:amt||4}]; return weaponProcs(G.hero); },
  // Clean status arena (mirrors archArena): tanky hero + one unscaled mob in front,
  // hero statuses cleared. The page game loop then runs the REAL AI; the harness reads
  // statusOf() each tick.
  statusArena(type,dx,dy){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.dots=null; h.slowT=0; h.slow=1; h.stun=0;
    const e=spawnEnemy(type, h.x+(dx||0), h.y+(dy||0)); if(e){ e.state="chase"; } return e?type:null; },
  // Hero lands a REAL basic-attack hit on the arena mob (through hitEnemy, so weapon
  // procs fire) and returns the mob's resulting statuses — no applyStatus shortcut.
  heroHit(){ const h=G.hero; const e=G.enemies[0]; if(!e) return null; h.facing=Math.atan2(e.y-h.y,e.x-h.x);
    hitEnemy(e, equippedDmg(h), h.facing); return this.statusOf("enemy"); },
  // --- CAS-119 talent-tree harness hooks (tools/cas119-talents.mjs); additive ---
  // Read the live talent state: class, unspent points, per-node ranks, spent total,
  // the aggregated combat bundle (h.tt) and the resolved combat totals — so the test
  // can prove a spent point MOVES real numbers (AC #3), not just text.
  talentState(){ const h=G.hero; if(!h) return null;
    return { cls:h.cls, pts:h.talentPts|0, ranks:Object.assign({},h.talents),
      spent:talentSpent(h), tt:Object.assign({},h.tt),
      combat:{ dmg:equippedDmg(h), def:equippedDef(h), maxHp:heroMaxHp(h) } }; },
  // The tree definition for a class (branches + node metadata incl. req/excl), so the
  // panel + headless test can assert distinct trees with a real exclusive fork (AC #2/#4).
  talentTree(cls){ const t=TALENTS[cls||G.hero.cls]; if(!t) return null;
    return { branches:t.branches.slice(), nodes:t.nodes.map(n=>({id:n.id,br:n.br,tier:n.tier,name:n.name,max:n.max,eff:Object.assign({},n.eff),req:n.req||null,excl:n.excl||null})) }; },
  // Grant points (level-up shortcut) so a test can fund a build without grinding XP.
  grantTalentPts(n){ const h=G.hero; if(!h) return 0; h.talentPts=(h.talentPts|0)+Math.max(0,Math.floor(n||1)); return h.talentPts; },
  // Spend a point through the REAL allocator (enforces points/req/excl) — returns the
  // post-state so the harness reads the legal-allocation rules, never a shortcut.
  allocTalent(id){ const ok=allocTalent(id); return { ok, state:this.talentState() }; },
  // Full respec through the real path (refund + wipe + recalc).
  respecTalents(){ const refunded=respecTalents(); return { refunded, state:this.talentState() }; },
  // Can this node be taken right now? (mirrors the UI light-up + save validation.)
  canAlloc(id){ return canAllocTalent(G.hero, id); },
  // --- CAS-120 active-skill-bar harness hooks (tools/cas120-skills.mjs); additive ---
  // Static skill-bar metadata straight off SPELLS[cls] (no sim step) so the test can
  // assert each class has >=2 active skills with their cost/cd and which carry a CAS-118
  // status — AC1/AC2. slot0 (basic attack) is excluded; these are the bar's skills 1-3.
  skillBar(cls){ const list=SPELLS[cls]; if(!list) return null;
    return list.map((sp,i)=>({ slot:i+1, id:sp.id, type:sp.type, cost:sp.cost, cd:sp.cd,
      status: sp.status?sp.status.type:null, aoe:sp.aoe||0, dmg:sp.dmg||0 })); },
  // Cast ONE class skill at a fixed dummy and report the BUILD-deployed outcome — damage
  // dealt, the CAS-118 status it applied (DoT/slow/stun), MP spent and the cooldown it
  // set (after talent cdr). Advances the REAL update loop a few frames so projectile
  // skills travel & connect. No shortcut: castSpell→resolveSpell→hitEnemy/applyStatus,
  // exactly as the game runs. Talents/affixes on the live hero feed in (so the test can
  // alloc a node, re-probe, and prove a skill changed — AC3). Restores the arena.
  skillProbe(cls,slot){ const list=SPELLS[cls]; if(!list||!list[slot-1]) return null;
    const h=G.hero; h.cls=cls; h._mcfg=ATK[cls]||ATK.warrior;
    h.maxMp=300; h.mp=300; h.maxHp=600; h.hp=300; h.facing=0; h.rolling=false; h.stun=0; h.slowT=0; h.slow=1; h.dots=null;
    h.spellCD=[0,0,0,0]; h.spellCDmax=[0,0,0,0];
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const e=spawnEnemy("skeleton", h.x+38, h.y); e.maxHp=e.hp=6000;
    const e0=e.hp, mp0=h.mp;
    castSpell(slot);
    for(let s=0;s<6;s++){ update(40); }            // let a projectile travel & connect
    const sp=list[slot-1];
    const dots={}; if(e.dots) for(const k in e.dots) dots[k]={ t:+e.dots[k].t.toFixed(2), dmg:e.dots[k].dmg };
    const r={ cls, slot, id:sp.id, type:sp.type, cost:sp.cost, statusType: sp.status?sp.status.type:null,
      mpSpent: Math.round(mp0-h.mp), dmg: Math.round(e0-e.hp),
      cd:+(h.spellCD[slot]||0).toFixed(2), cdmax:+(h.spellCDmax[slot]||0).toFixed(2),
      enemyStun:+(e.stun||0).toFixed(2), enemySlowT:+(e.slowT||0).toFixed(2), dots };
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    return r; },
  // --- CAS-127 game-feel / juice harness hooks (tools/cas127-juice.mjs); additive ---
  // Live snapshot of the feedback systems: transient counts (with their hard caps),
  // current screen-shake, hitstop and the two accessibility/mute toggles. The harness
  // reads this each tick to prove juice fires, stays pooled/capped, and toggles work.
  juiceState(){ return { fx:G.fx.length, fxCap:MAX_FX, floaters:G.floaters.length, floaterCap:MAX_FLOATERS,
    shake:+G.shake.toFixed(2), hitstop:G.hitstop|0, reduceMotion:!!G.settings.reduceMotion,
    sound:!!(audio&&audio.on), pool:_floatPool.length }; },
  // The most recent floaters (newest last) with their juice styling flags, so the test
  // can assert a crit number pops bigger/distinct and DoT ticks render small.
  floaterDump(){ return G.floaters.slice(-12).map(f=>({ txt:f.txt, col:f.col, pop:+(f.pop||1).toFixed(2), small:!!f.small, crit:!!f.crit })); },
  setReduceMotion(v){ G.settings.reduceMotion=!!v; if(G.settings.reduceMotion) G.shake=0; return G.settings.reduceMotion; },
  clearFx(){ G.fx.length=0; G.floaters.length=0; G.shake=0; G.hitstop=0; return true; },
  // Clean juice arena: a tanky hero + N unscaled mobs packed in front, feedback cleared.
  // The page loop then runs the REAL combat; the harness drives heroAttack and reads the
  // genuine floaters/fx/shake the hit path emits — no synthetic feedback injection.
  juiceArena(n){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; this.clearFx();
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.dots=null; h.slowT=0; h.slow=1; h.stun=0; h.atkCD=0;
    const k=Math.max(1,Math.min(40,n|0||12));
    for(let i=0;i<k;i++){ const e=spawnEnemy("skeleton", h.x+24+((i%6)*9), h.y-20+Math.floor(i/6)*9); if(e){ e.maxHp=e.hp=999999; e.state="chase"; } }
    return G.enemies.length; },
  // Land a REAL hero swing this instant (through heroAttack → applyHeroMelee → hitEnemy)
  // and report the feedback it produced — proves the juice rides the genuine combat path.
  juiceSwing(){ const h=G.hero; const e=G.enemies[0]; if(e) h.facing=Math.atan2(e.y-h.y,e.x-h.x); h.atkCD=0;
    heroAttack(); applyHeroMelee(); return this.juiceState(); },
  // Force the next swing to crit (talent crit=100%) so the harness can prove the crit
  // feedback (bright sfx, bigger pop floater, extra shake) without RNG flake. Restores tt.
  forceCritSwing(){ const h=G.hero; const e=G.enemies[0]; if(!e) return null; const save=h.tt;
    h.tt=Object.assign({},h.tt||zeroTT(),{crit:100,critMult:0}); h.facing=Math.atan2(e.y-h.y,e.x-h.x); h.atkCD=0;
    const before=G.shake; hitEnemy(e, equippedDmg(h), h.facing); h.tt=save;
    return { dump:this.floaterDump(), shakeDelta:+(G.shake-before).toFixed(2), shake:+G.shake.toFixed(2) }; },
  // --- CAS-128 onboarding harness hooks (tools/cas128-onboarding.mjs); additive ---
  // Read the live tutorial state: whether active/finished, the current step id + index,
  // and the guided-step count — so the headless/live test can assert the flow advances.
  tutState(){ const t=G.tut; return { exists:!!t, active:!!(t&&t.active), finished:!!(t&&t.finished),
    i:t?t.i:-1, step:t?TUT_STEPS[t.i]:null, nSteps:TUT_NSTEPS, steps:TUT_STEPS.slice(),
    moveDist:+((t&&t.moveDist)||0).toFixed(1), looted:!!(t&&t.looted), invOpened:!!(t&&t.invOpened) }; },
  // Arm/start/skip the tutorial directly (mirrors the first-run / menu-replay / skip paths).
  tutArm(v){ setTutArm(v!==false); return tutArmed; },
  tutStart(){ startTutorial(); return this.tutState(); },
  tutSkip(){ tutSkip(); return this.tutState(); },
  // Force the live tutorial step index (clamped) so the test can jump to a step without
  // re-performing every prior action; the REAL advance logic then runs from there.
  tutSetStep(i){ if(!G.tut) return null; G.tut.i=Math.max(0,Math.min(TUT_STEPS.length-1,i|0)); return this.tutState(); },
};
