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
import { TS, MAP_W, MAP_H, T_WATER, CFG, ATK, ETPL, SPELLS, CLASS_STATS, HUNTS, ZONE_TIER, ABYSS_POWER_REQ, STATUS } from "./config.js";
import { clamp, lerp, dist2, norm, angDiff } from "./math.js";
import { createRNG } from "./rng.js";
import { buildWorld, zoneOf } from "./world.js";
import { ZONE_LOOT, gearStat, gearName, gearDef, gearCol, rarityRank, rollGearInst, equippedDmg, equippedDef, affixTotals, heroMaxHp, AFFIXES, weaponProcs } from "./gear.js";
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
  scene:"menu", // menu, play, dialogue, shop, inventory, talents, pause, dead
  talFocus:0,   // CAS-119: keyboard-focused talent node index (talents panel)
  t:0, hero:null, enemies:[], projectiles:[], fields:[], fx:[], floaters:[], drops:[],
  cam:{x:0,y:0}, shake:0, settings:{shake:1, crt:false, rollAim:false},
  quest:{wolves:0, done:false, rewarded:false}, hunts:{}, dialog:null, shopSel:0,
  toast:"", toastT:0, music:"town", arenaWarned:false, bossDead:false,
  skull:{level:0, t:0, kills:0, killT:0}, started:false,
  hitstop:0, // client-feel impact freeze (frames @60fps); never gates authoritative state beyond pausing local sim
};

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
    respawn:{x:world.templeF.x, y:world.templeF.y+TS} };
}
function xpForLevel(l){ return Math.floor(40*Math.pow(l,1.55)); }

// Per-zone hunt-contract progress, built fresh from HUNTS data each run.
//   kills   — enemies culled toward the quota
//   champ   — the live Champion entity while it is summoned (null otherwise)
//   cleared — zone payoff already claimed (stops further tracking)
function initHunts(){ const o={}; for(const z in HUNTS) o[z]={kills:0, champ:null, cleared:false}; return o; }

// creates the hero and enters play (audio/music wiring stays in the controller)
export function createHero(name,cls){ G.hero=newHero(name||"Héroe",cls); G.hunts=initHunts(); G.fields.length=0; G.scene="play"; G.started=true; }

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
    h.hp=heroMaxHp(h); h.mp=h.maxMp;                       // always respawn at full
    G.hero=h; G.hunts=initHunts(); G.fields.length=0;
    if(d.quest){ G.quest.wolves=Math.max(0,Math.floor(num(d.quest.wolves,0))); G.quest.done=!!d.quest.done; G.quest.rewarded=!!d.quest.rewarded; }
    G.scene="play"; G.started=true;
    return true;
  }catch(e){ return false; }
}

// ----------------------------- helpers ---------------------------------
export function toast(msg,dur){ G.toast=msg; G.toastT=dur||2.6; }
function floater(x,y,txt,col){ G.floaters.push({x,y,txt,col:col||C_CREAM,t:0,life:0.9}); }
function addFx(kind,x,y,opt){ G.fx.push(Object.assign({kind,x,y,t:0,life:0.4},opt)); }
function shakeAdd(a){ G.shake=Math.min(14, G.shake + a*(G.settings.shake)); }
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
  e.hp=e.maxHp=e.tpl.hp; e.zoneTier=z.tier;
  return e;
}

// ------------------------------ combat ---------------------------------
function heroAttack(){
  const h=G.hero; if(h.atkCD>0||h.rolling||h.stun>0) return; // CAS-118: stun gates the swing
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
  const oh=(G.hero?affixTotals(G.hero).onhit:0)+(tt?tt.onhit:0); if(oh) dmg+=oh;
  let crit=false; if(tt&&tt.crit>0 && srand()*100<tt.crit){ crit=true; dmg*=(CRIT_BASE+(tt.critMult||0)/100); }
  e.hp-=dmg; e.hurtFlash=0.16; audio.sfx.ehurt();
  e.knockX+=Math.cos(ang)*e.tpl.knock; e.knockY+=Math.sin(ang)*e.tpl.knock;
  if(crit){ floater(e.x,e.y-e.tpl.size,"¡"+Math.round(dmg)+"!","#ff5d5d"); addFx("spark",e.x,e.y); }
  else floater(e.x,e.y-e.tpl.size,"-"+Math.round(dmg),"#ffd24d");
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
  if(rarityRank(inst.rarity)>=1){ floater(x,y-18,gearName(inst),gearCol(inst)); audio.sfx.pickup(); } }
function killEnemy(e){
  if(e.dead) return; e.dead=true;
  freeze(e.isBoss?9:(e.champion?8:5)); // kill confirm — boss/champion deaths land heaviest
  const tpl=e.tpl; const zone=zoneOf(world,e.x,e.y);
  if(e.isBoss){ audio.sfx.boss(); G.bossDead=true; toast(STR.bossDefeated); shakeAdd(10);
    G.drops.push({x:e.x,y:e.y,kind:"potionhp"}); G.drops.push({x:e.x+20,y:e.y,kind:"gold"});
    dropGear(e.x-20,e.y, rollGearInst(srand,2,3,"rare")); // boss: guaranteed rare+ from the tier 2-3 pool
    gainXP(tpl.xp); for(let i=0;i<8;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30)); }
  else if(e.champion){ onChampionKill(e); } // hunt climax — clears the zone, guaranteed payoff
  else { gainXP(tpl.xp);
    const g=ri(tpl.gold[0],tpl.gold[1]); if(g>0){ G.drops.push({x:e.x,y:e.y,kind:"gold",amt:g}); }
    if(srand()<0.22) G.drops.push({x:e.x+frr(-8,8),y:e.y,kind:srand()<0.6?"potionhp":"potionmp"});
    if(srand()<(tpl.gearChance||0)){ const win=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
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
  for(let i=0;i<(B?12:8);i++) addFx("flame",e.x+frr(-26,26),e.y+frr(-26,26));
}
// Champion death = zone cleared. Guaranteed gear (zone tier, rarity floor) + bonus
// xp/gold so the hunt's payoff feeds the existing gear/progression systems.
function onChampionKill(e){ const zone=e.zone; const H=G.hunts[zone]; const cfgH=HUNTS[zone];
  if(H){ H.cleared=true; H.champ=null; }
  audio.sfx.boss(); shakeAdd(e.capstone?14:10);
  // reward params travel on the entity (set at spawn) so champion + capstone share
  // this one clear path — the capstone just carries a higher tier/floor.
  const win=e.rwdTier||cfgH.tier||(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
  dropGear(e.x,e.y, rollGearInst(srand,win[0],win[1],e.rwdMinR||cfgH.minR));
  G.drops.push({x:e.x+18,y:e.y,kind:"gold",amt:e.rwdGold||cfgH.gold});
  if(srand()<0.5) G.drops.push({x:e.x-18,y:e.y,kind:"potionhp"});
  gainXP(e.rwdXp||cfgH.xp);
  toast(STR.huntCleared(zone),3.6);
  for(let i=0;i<(e.capstone?16:10);i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30));
}
function gainXP(n){ const h=G.hero; if(n<=0) return; h.xp+=n; floater(h.x,h.y-30,"+"+n+" XP","#9fe6a0");
  while(h.xp>=h.xpNext){ h.xp-=h.xpNext; h.lvl++; // CAS-100: per-class growth → archetypes diverge as you climb
    h.maxHp+=(h.hpGain||18); h.maxMp+=(h.mpGain||8); h.baseDmg+=(h.dmgGain||3); h.hp=heroMaxHp(h); h.mp=h.maxMp;
    // CAS-119: every level grants a talent point (build agency). Floater makes the
    // grant visible (AC #1); the HUD ★ badge + (T) hint prompt the player to spend.
    h.talentPts=(h.talentPts||0)+1; floater(h.x,h.y-46,STR.talentPointGain,"#ffd24d");
    h.xpNext=xpForLevel(h.lvl); toast(STR.levelUp(h.lvl)); audio.sfx.levelup(); for(let i=0;i<6;i++) addFx("heal",h.x+frr(-16,16),h.y+frr(-20,6)); } }
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
}
// Generic effect resolver: dispatch by spell `type`. New types are added here once
// and become available to every class through data. No spell knows its class.
function resolveSpell(h,sp){
  const a=h.facing, ca=Math.cos(a), sa=Math.sin(a);
  switch(sp.type){
    case "proj":
      G.projectiles.push({x:h.x+ca*20,y:h.y-2+sa*20,vx:ca*sp.spd,vy:sa*sp.spd,life:sp.life||1.4,dmg:sp.dmg,kind:sp.kind,ang:a, aoe:sp.aoe||0, burstFx:sp.fx, col:sp.col});
      shakeAdd(sp.aoe?3:2.4); break;
    case "cone":
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>sp.range+e.tpl.size) continue;
        const ang=Math.atan2(e.y-h.y,e.x-h.x); if(Math.abs(angDiff(ang,a))<(sp.arc||Math.PI*0.6)/2){
          hitEnemy(e,sp.dmg,a); if(sp.knock){ e.knockX+=ca*e.tpl.knock*sp.knock; e.knockY+=sa*e.tpl.knock*sp.knock; } if(sp.stun) e.stun=Math.max(e.stun,sp.stun); } }
      addFx(sp.fx||"conecast",h.x+ca*20,h.y-2+sa*20,{ang:a,range:sp.range,col:sp.col,life:0.3}); shakeAdd(5); break;
    case "nova":
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d<=sp.range+e.tpl.size){
        hitEnemy(e,sp.dmg,Math.atan2(e.y-h.y,e.x-h.x));
        if(sp.stun) e.stun=Math.max(e.stun,sp.stun);
        if(sp.slow){ e.slow=sp.slow; e.slowT=sp.slowDur||2; } } }
      if(sp.heal){ h.hp=Math.min(heroMaxHp(h),h.hp+sp.heal); floater(h.x,h.y-30,"+"+sp.heal,"#5fd66a"); }
      addFx(sp.fx||"novacast",h.x,h.y,{r:sp.range,col:sp.col,style:sp.style,life:0.5}); shakeAdd(6); break;
    case "heal":
      h.hp=Math.min(heroMaxHp(h),h.hp+sp.heal); floater(h.x,h.y-30,"+"+sp.heal,"#5fd66a");
      addFx(sp.fx||"healburst",h.x,h.y,{col:sp.col,life:0.5}); for(let k=0;k<6;k++) addFx("heal",h.x+frr(-14,14),h.y+frr(-18,6)); break;
    case "hot":
      h.hotT=sp.dur; h.hotRate=sp.heal; floater(h.x,h.y-30,STR.spellRegen,sp.col||"#7bd44a");
      addFx(sp.fx||"buffaura",h.x,h.y,{col:sp.col,life:0.5}); break;
    case "buff":
      applyBuff(h,sp.stat,sp.amt,sp.dur); floater(h.x,h.y-30, sp.stat==="dmg"?STR.spellAtkUp:STR.spellDefUp, sp.col||"#ffd24d");
      addFx(sp.fx||"buffaura",h.x,h.y,{col:sp.col,life:0.5}); break;
    case "dash":
      h.rolling=true; h.rollT=0.20; h.iframe=0.22; h.rollCD=Math.max(h.rollCD,0.3); h.rollX=ca; h.rollY=sa; h.moved=false;
      for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>sp.range+e.tpl.size) continue;
        const ang=Math.atan2(e.y-h.y,e.x-h.x); if(Math.abs(angDiff(ang,a))<0.9){ hitEnemy(e,sp.dmg,a); } }
      addFx(sp.fx||"charge",h.x,h.y,{ang:a,col:sp.col,life:0.3}); shakeAdd(5); break;
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
      const f={x:cx,y:cy,r:sp.range,dmg:sp.dmg,tick:sp.tick||0.5,acc:0,life:sp.dur,maxLife:sp.dur,
               col:sp.col,style:sp.style,slow:sp.slow||0,slowDur:sp.slowDur||0};
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
    e.hp-=f.dmg; e.hurtFlash=0.12; floater(e.x,e.y-e.tpl.size,"-"+Math.round(f.dmg),"#9fe06a");
    if(f.slow){ e.slow=f.slow; e.slowT=Math.max(e.slowT||0,f.slowDur); }
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
      floater(ent.x, ent.y-(isHero?30:ent.tpl.size), "-"+d.dmg, def.col);
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
  h.bag.push(inst); audio.sfx.pickup(); toast(STR.loot(gearName(inst)));
}
export function tryPickup(){
  const h=G.hero;
  for(const d of G.drops){ if(d.taken) continue; if(dist2(h.x,h.y,d.x,d.y)<CFG.pickRange*CFG.pickRange){
    if(d.kind==="gold"){ const g=d.amt||ri(3,8); h.gold+=g; audio.sfx.coin(); floater(h.x,h.y-26,"+"+g+" oro",C_GOLD); }
    else if(d.kind==="potionhp"){ h.potHP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de vida")); }
    else if(d.kind==="potionmp"){ h.potMP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de maná")); }
    else if(d.kind==="gear"){ takeGear(d.inst); }
    d.taken=true;
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
  if(p.to==="abyss"){ const pw=heroPower(h);
    if(pw<ABYSS_POWER_REQ){ toast(STR.abyssLocked(pw,ABYSS_POWER_REQ),3.4); audio.sfx.deny(); return false; } }
  h.x=p.dx; h.y=p.dy; h.vx=h.vy=0; h.rolling=false; h.rollT=0; h.iframe=0.6;
  audio.sfx.roll(); toast(p.to==="abyss"?STR.enteredAbyss:STR.leftAbyss,3.0); return true;
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
  if(G.scene!=="play"){ updateFloaters(dt); updateFx(dt); return; } // freeze world in menus but let transient fx expire
  const h=G.hero;
  // music switch by zone danger
  const z=zoneOf(world,h.x,h.y); const wantCombat=(z==="caves"||z==="forest"||z==="arena"||z==="ruins"||z==="abyss") && G.enemies.some(e=>e.state==="chase"||e.state==="windup");
  const wantMusic=wantCombat?"combat":"town"; if(wantMusic!==G.music){ G.music=wantMusic; audio.playMusic(wantMusic); }
  if(z==="arena" && !G.arenaWarned){ G.arenaWarned=true; toast(STR.enteredArena,3.5); }
  if(z==="caves" && !G.bossSpawned && h.y<(world.caves.y+10)*TS){ G.bossSpawned=true; spawnBoss(); }

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
    if(e.dots && tickDots(e,dt,false)){ killEnemy(e); continue; }
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
        // CAS-115 caster KITE: maintain the firing band — if the hero closes inside
        // `kite`, back away (still readable: it never melees) and hold fire until the
        // hero is in the `kite`..`range` band again. Pure positional, deterministic.
        if(arch==="caster" && d < (e.tpl.kite||0)){
          const ra=Math.atan2(e.y-h.y,e.x-h.x); moveEnt(e,Math.cos(ra)*espd*dt,Math.sin(ra)*espd*dt,e.tpl.size*0.6);
        } else if(d<=e.tpl.range){
          // CAS-109: every Nth Champion strike is a telegraphed radial SLAM — a longer
          // windup (the growing-ring tell in render) then a ring of shards instead of
          // the melee hit. Punishes face-tanking; readable + dodgeable with the roll.
          e.specialNow = !!(e.special && e.special.slam && (++e.atkCount % e.special.every === 0));
          e.state="windup"; e.st=e.specialNow ? (e.special.windup || e.tpl.windup*1.6) : e.tpl.windup; e.hitDone=false;
          if(e.specialNow){ audio.sfx.boss(); }
        }
        else { moveEnt(e,Math.cos(e.facing)*espd*dt,Math.sin(e.facing)*espd*dt,e.tpl.size*0.6); }
      }
    } else if(e.state==="windup"){
      e.st-=dt; e.facing=Math.atan2(h.y-e.y,h.x-e.x);
      if(e.st<=0){ e.state="strike"; e.st=(e.tpl.arch==="rusher"&&!e.specialNow)?0.2:0.12; // rusher needs a longer window for the lunge to read
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
      // CAS-115 rusher LUNGE: dash forward through the whole strike window (the telegraph
      // was the windup), landing a single contact hit when it reaches the hero. Closing
      // the gap IS the attack — sidestepping the lunge line avoids it.
      if(e.tpl.arch==="rusher" && !e.specialNow){
        const lspd=(e.tpl.lunge||110)/0.2; moveEnt(e,Math.cos(e.facing)*lspd*dt,Math.sin(e.facing)*lspd*dt,e.tpl.size*0.6);
        if(!e.hitDone && d<=e.tpl.size+e.tpl.range*0.5){ e.hitDone=true;
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl);
          addFx("spark",e.x+Math.cos(a)*14,e.y+Math.sin(a)*14); }
      }
      else if(!e.hitDone){ e.hitDone=true;
        if(e.specialNow){ /* CAS-109: radial slam already fired at strike start — no melee hit */ }
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
  }
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
      const aoe=p.aoe||((p.kind==="fire"||p.kind==="orb")?46:0); // basic fire/orb keep their legacy splash; spells carry their own aoe
      if(aoe){ addFx(p.burstFx||(p.kind==="orb"?"orbburst":"flame"),p.x,p.y,{life:0.45,col:p.col,r:aoe}); for(const e2 of G.enemies){ if(e2!==e&&!e2.dead&&dist2(p.x,p.y,e2.x,e2.y)<aoe*aoe) hitEnemy(e2,p.dmg*0.5,Math.atan2(e2.y-p.y,e2.x-p.x)); } }
      else addFx(p.burstFx||"impact",p.x,p.y,{ang:ha,col:p.col,life:0.3});
      shakeAdd(3); p.life=0; break; } } }
    if(p.life<=0){ if(p.kind==="fire") addFx("flame",p.x,p.y); else if(p.kind==="orb") addFx("orbburst",p.x,p.y,{life:0.45}); }
  }
  G.projectiles=G.projectiles.filter(p=>p.life>0);
}
function updateDrops(dt){ for(const d of G.drops){ d.t=(d.t||0)+dt; } }
function updateFx(dt){ for(const f of G.fx){ f.t+=dt; } G.fx=G.fx.filter(f=>f.t<f.life); }
function updateFloaters(dt){ for(const f of G.floaters){ f.t+=dt; f.y-=24*dt; } G.floaters=G.floaters.filter(f=>f.t<f.life); }

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
        rwdTier:H.champ.rwdTier||null, rwdMinR:H.champ.rwdMinR||null}:null }; },
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
  // Count live enemy projectiles by kind (the radial slam emits kind:"rune").
  enemyProj(){ const ps=G.projectiles.filter(p=>p.enemy); return { total:ps.length, rune:ps.filter(p=>p.kind==="rune").length }; },
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
};
