// ===========================================================================
// sim/gear.js — data-driven gear + rarity content (sim-side, no ctx/DOM).
//
// Single source of truth for every piece of gear. Adding a sword = adding one
// row to GEAR.weapon; NO code path switches on a gear name/id. Item display
// names live here as content data; UI-chrome strings (rarity labels, hints) are
// in strings.js. A gear *instance* is {slot, defId, rarity} — stats are RESOLVED
// (never stored) via gearStat() so one def scales by rarity.
//
// All RNG consumers (rollRarity / rollGearInst) take the simulation's injected
// `srand` so drops stay deterministic and Stage-2 server-authority-ready. They
// never touch Math.random and there is zero render-side RNG here.
// ===========================================================================

export const RARITY = {
  common:   { col:"#c8c8c8", mult:1.00, weight:60, rank:0 },
  uncommon: { col:"#5fd66a", mult:1.18, weight:27, rank:1 },
  rare:     { col:"#4aa3ff", mult:1.40, weight:11, rank:2 },
  epic:     { col:"#c77dff", mult:1.70, weight:2,  rank:3 },
};
export const RARITY_ORDER = ["common","uncommon","rare","epic"];

// ===========================================================================
// CAS-117 — AFFIXES: the "drops have weight + a decision" layer. Every piece
// ABOVE common rolls 1-2 affixes that move REAL combat numbers (nothing
// cosmetic). Each affix is data {id, amt}; combat reads the aggregate via
// affixTotals(h) — never a stored/baked stat, so it stays deterministic and
// Stage-2 server-authority-ready (recomputable from the 3 equipped instances).
//   dmg     — flat +daño folded into equippedDmg (scales the whole loop)
//   hp      — flat +vida máx (heroMaxHp) → bigger health pool, observable
//   atkspd  — % faster basic attack (shorter atkCD) — pct stored as integer
//   movespd — % faster on foot — pct stored as integer
//   onhit   — flat bonus damage added to EVERY hero hit (the "on-hit ligero")
// `pct` affixes are stored as whole-number percent (8 == +8%). Flat affixes
// scale with the def TIER (a t4 roll dwarfs a t1 roll) so deeper zones drop
// affixes with more weight; pct affixes scale gently with rarity rank only.
// Totals are CAPPED in affixTotals so stacking can't break the frame/combat.
export const AFFIXES = {
  dmg:     { stat:"dmg",     label:"daño",       pct:false, base:[2,4]  },
  hp:      { stat:"hp",      label:"vida máx",   pct:false, base:[10,18] },
  atkspd:  { stat:"atkspd",  label:"vel. ataque",pct:true,  base:[5,9]  },
  movespd: { stat:"movespd", label:"vel. mov.",  pct:true,  base:[4,7]  },
  onhit:   { stat:"onhit",   label:"daño extra", pct:false, base:[2,3]  },
  // CAS-118 — PROC affix: an on-hit STATUS enchant (only rolls on weapons). `proc`
  // names the STATUS applied by every hero hit; `amt` is the DoT damage/tick (scales
  // with def tier like a flat affix). It is NOT a combat-number total — affixTotals
  // skips ids it doesn't track, so a burn weapon changes how combat FEELS, not the
  // numeric panel. Equipping an 'ardiente' weapon visibly sets struck enemies on fire.
  burn:    { stat:"burn",    label:"quema al golpear", pct:false, base:[2,3], proc:"burn" },
};
export const AFFIX_ORDER = ["dmg","hp","atkspd","movespd","onhit"];
// Proc (on-hit status) affixes — appended to the roll pool ONLY for weapons (CAS-118),
// so the "arma ardiente" decision lives on the weapon slot, never armour.
export const PROC_AFFIXES = ["burn"];
export const AFFIX_CAP = { atkspd:40, movespd:40 }; // %-cap so stacking stays sane

// Human-readable affix line for tooltips/diffs (e.g. "+6 daño" / "+8% vel. ataque").
// Proc affixes read as the enchant + its per-tick weight (e.g. "quema al golpear (+4/tic)").
export function affixLabel(af){ const a=AFFIXES[af&&af.id]; if(!a) return "";
  if(a.proc) return a.label+" (+"+af.amt+"/tic)";
  return "+"+af.amt+(a.pct?"% ":" ")+a.label; }
// CAS-118: on-hit status procs carried by the equipped WEAPON's affixes — read at hero
// hit time (hitEnemy) so the affix decision (CAS-117) changes observable combat feel.
export function weaponProcs(h){ const inst=h&&h.equip&&h.equip.weapon; if(!inst||!Array.isArray(inst.affixes)) return null;
  let out=null; for(const af of inst.affixes){ const a=AFFIXES[af&&af.id]; if(a&&a.proc&&typeof af.amt==="number"){ (out||(out=[])).push({proc:a.proc, amt:af.amt}); } }
  return out; }
export function affixList(inst){ return (inst&&Array.isArray(inst.affixes))?inst.affixes:[]; }

export const GEAR = {
  weapon: [
    {id:"w_rusty", name:"Espada oxidada",   tier:1, dmg:3},
    {id:"w_iron",  name:"Espada de hierro", tier:2, dmg:6},
    {id:"w_steel", name:"Espada de acero",  tier:3, dmg:12},
    {id:"w_rune",  name:"Hoja rúnica",      tier:4, dmg:20},
  ],
  body: [
    {id:"a_cloth",  name:"Túnica raída",     tier:1, def:1},
    {id:"a_leather",name:"Coraza de cuero",  tier:2, def:4},
    {id:"a_plate",  name:"Coraza de placas", tier:3, def:10},
    {id:"a_wyrm",   name:"Égida de sierpe",  tier:4, def:16},
  ],
  shield: [
    {id:"s_wood",  name:"Escudo de madera", tier:1, def:2},
    {id:"s_iron",  name:"Escudo de hierro", tier:2, def:6},
    {id:"s_tower", name:"Escudo torre",     tier:3, def:11},
  ],
};

// ===========================================================================
// CAS-237 — FORJA: data-driven equipment upgrade. The player spends gold + forge
// material (h.mats, dropped by hunting/daily) to raise an EQUIPPED piece's forge
// level (`fl`) 0 → FORGE.max. The bonus is a deterministic multiplier folded
// straight into gearStat() — the SINGLE resolver every combat + UI reader already
// routes through — so a forged piece moves REAL numbers, never a stored/baked stat,
// and stays Stage-2 server-authority-ready (recomputable from {defId,rarity,fl}).
// Zero RNG. The forge level rides on the gear INSTANCE (you forge a specific item;
// swapping it out keeps its level), persisted with the instance — safeInst() clamps
// `fl` on load so a corrupt/old save can never over-forge. Adding a tier curve =
// editing this data block; no code path switches on a slot/level.
export const FORGE = {
  max: 5,
  stepPct: 15,                          // each level adds +15% of the rarity-scaled base stat (legible step)
  goldCost: [60, 120, 220, 360, 560],   // gold to go from forge level L → L+1 (index by current fl)
  matCost:  [1, 2, 3, 4, 5],            // forge-material (h.mats) to go from level L → L+1
};
// Clamp a (possibly absent/corrupt) instance forge level into [0,FORGE.max].
export function forgeLevel(inst){ const fl=(inst&&inst.fl)|0; return Math.max(0, Math.min(FORGE.max, fl)); }
// The deterministic stat multiplier for a forge level — folded into gearStat().
export function forgeMult(fl){ return 1 + FORGE.stepPct/100 * Math.max(0, Math.min(FORGE.max, (fl|0))); }
// Cost to forge this instance ONE more level, or null if it's already maxed.
export function forgeNextCost(inst){ const fl=forgeLevel(inst); if(fl>=FORGE.max) return null;
  return { gold:FORGE.goldCost[fl], mats:FORGE.matCost[fl] }; }

// Drop tier window per zone (difficulty). Per-enemy gearChance lives on ETPL
// (sim/config.js). CAS-73: the window climbs in lockstep with ZONE_TIER difficulty
// (forest 1-2 → ruins 2-3 → caves/arena 3-4), so a tougher zone literally drops
// better-tier gear — the carrot that pays for the steeper mobs. Town/field stay
// low-tier starter zones. Shields cap at tier 3 (they drop out of the 4 window).
// CAS-116: the Abismo (CAS-114, ZONE_TIER 5, power-gated endgame) drops EXCLUSIVELY
// tier-4 gear — so even its TRASH loot strictly out-classes anything buyable in the
// shop (steel weapon t3 / plate body t3 / iron shield t2) and the open zones, which
// only ROLL up to 4. This closes CAS-116's "2ª zona se siente como upgrade" loop:
// before this, abyss kills fell back to field [1,2] starter junk. Shields cap at
// tier 3, so the abyss window drops only top-tier weapons + armor (intended).
export const ZONE_LOOT = {
  town:{tier:[1,1]}, field:{tier:[1,2]}, forest:{tier:[1,2]},
  ruins:{tier:[2,3]}, caves:{tier:[3,4]}, arena:{tier:[3,4]}, abyss:{tier:[4,4]},
  swamp:{tier:[3,4]}, // CAS-441 — mirrors caves/arena: the marsh is the arena's tier-4 parallel (same trash window; arena capstone keeps the guaranteed-epic pinnacle)
  frost:{tier:[4,4]}, // CAS-121 — top-tier window (mirrors abyss); the capstone's higher rarity floor is what flexes builds
  trial:{tier:[4,4]}, // CAS-196 — top-tier window (mirrors abyss/frost); the world-boss's guaranteed epic + bonusDrop is the flex
};

// ---- pure gear helpers (no game state, no RNG; safe in sim or render) ----
export function gearDef(slot,defId){ const arr=GEAR[slot]; if(!arr) return null; for(let i=0;i<arr.length;i++) if(arr[i].id===defId) return arr[i]; return null; }
export function gearStat(inst){ if(!inst) return 0; const d=gearDef(inst.slot,inst.defId); if(!d) return 0; const base=(d.dmg!=null?d.dmg:d.def)||0; const r=RARITY[inst.rarity]||RARITY.common; return Math.round(base*r.mult*forgeMult(inst.fl)); } // CAS-237: forge level folds in here (the one stat resolver)
export function gearName(inst){ if(!inst) return "—"; const d=gearDef(inst.slot,inst.defId); return d?d.name:"?"; }
export function gearCol(inst){ const r=inst&&RARITY[inst.rarity]; return r?r.col:RARITY.common.col; }
export function rarityRank(k){ const r=RARITY[k]; return r?r.rank:0; }

// Weighted rarity roll using ONLY the injected srand (determinism / Stage-2).
// minR clamps to rarity >= minR (used for the golem's guaranteed rare+).
// CAS-383: `luck` (>=0, the Codicia boon's bb.loot) multiplies the weight of the
// uncommon+ tiers so drops skew rarer while the boon is held. Consumes srand() EXACTLY
// once regardless of luck, so the RNG stream is undisturbed (luck=0 → byte-identical).
export function rollRarity(srand,minR,luck){ const floorRank=minR?rarityRank(minR):0; luck=luck>0?luck:0; let total=0;
  for(const k of RARITY_ORDER){ if(RARITY[k].rank<floorRank) continue; total+=RARITY[k].weight*(RARITY[k].rank>=1?1+luck:1); }
  let r=srand()*total;
  for(const k of RARITY_ORDER){ if(RARITY[k].rank<floorRank) continue; r-=RARITY[k].weight*(RARITY[k].rank>=1?1+luck:1); if(r<0) return k; }
  return minR||"common"; }

// Roll the affix list for a freshly-dropped instance, using ONLY the injected
// srand (determinism / Stage-2). Common rolls nothing; uncommon 1, rare 1-2,
// epic 2 distinct affixes. Flat amounts scale with def `tier`; pct amounts with
// rarity rank. CAS-117.
export function rollAffixes(srand,rarity,tier,slot){ const rank=rarityRank(rarity); if(rank<1) return [];
  const n = rank===1 ? 1 : (rank===2 ? (srand()<0.5?1:2) : 2);
  const pool=AFFIX_ORDER.slice();
  if(slot==="weapon") for(const p of PROC_AFFIXES) pool.push(p); // CAS-118: on-hit procs only on weapons
  const out=[];
  for(let k=0;k<n && pool.length;k++){
    const id=pool.splice(Math.floor(srand()*pool.length),1)[0]; const a=AFFIXES[id]; const r=srand();
    let amt;
    if(a.pct){ amt=Math.round(a.base[0]+(a.base[1]-a.base[0])*r) + 2*(rank-1); }
    else { amt=Math.max(1,Math.round((a.base[0]+(a.base[1]-a.base[0])*r)*(1+0.35*(tier-1)))); }
    out.push({id, amt});
  }
  return out; }

// Sum every equipped piece's affixes into one combat-stat bundle. The ONLY
// reader of gear affixes (combat + UI route through this) so equipping a drop
// changes real numbers, never a stored stat. Pct fields are integer percent and
// CAPPED so stacking can't break the frame budget / combat. CAS-117.
export function affixTotals(h){ const t={dmg:0,hp:0,atkspd:0,movespd:0,onhit:0};
  if(!h||!h.equip) return t;
  for(const slot of ["weapon","body","shield"]){ const inst=h.equip[slot]; if(!inst||!Array.isArray(inst.affixes)) continue;
    for(const af of inst.affixes){ if(t[af.id]!=null && typeof af.amt==="number") t[af.id]+=af.amt; } }
  if(AFFIX_CAP.atkspd) t.atkspd=Math.min(t.atkspd,AFFIX_CAP.atkspd);
  if(AFFIX_CAP.movespd) t.movespd=Math.min(t.movespd,AFFIX_CAP.movespd);
  return t; }

// Roll a fresh gear instance whose def tier is within [tmin,tmax]. Slot is chosen
// uniformly among slots that actually have a def in range (shields cap at tier 3,
// so they drop out of higher windows). Returns null if nothing fits.
export function rollGearInst(srand,tmin,tmax,minR,luck){ const slots=["weapon","body","shield"]; const avail=[];
  for(const s of slots){ for(const d of GEAR[s]){ if(d.tier>=tmin&&d.tier<=tmax){ avail.push(s); break; } } }
  if(!avail.length) return null;
  const slot=avail[Math.floor(srand()*avail.length)];
  const pool=GEAR[slot].filter(d=>d.tier>=tmin&&d.tier<=tmax);
  const def=pool[Math.floor(srand()*pool.length)];
  const rarity=rollRarity(srand,minR,luck); // CAS-383: `luck` = Codicia boon (bb.loot); 0/undefined → unchanged roll
  const inst={ slot, defId:def.id, rarity };
  const affixes=rollAffixes(srand,rarity,def.tier,slot); if(affixes.length) inst.affixes=affixes;
  return inst; }

// Equipped totals — the ONLY readers of hero gear (combat + UI route through
// these so equipping a drop changes real combat numbers, not just the panel).
// CAS-117: the +daño affix folds straight into equippedDmg; +vida into the
// effective max via heroMaxHp; atkspd/movespd/onhit are read at their sim sites.
// CAS-119: talent flat +daño / +vida fold in here too, read off the cached bundle
// h.tt (built in sim.recalcTalents) so combat + UI route through one place and a
// talentless hero (h.tt zero/absent) is unchanged — no import cycle into talents.js.
export function equippedDmg(h){ return h.baseDmg + gearStat(h.equip.weapon) + h.dmgBonus + affixTotals(h).dmg + ((h.tt&&h.tt.dmg)||0); }
export function equippedDef(h){ return gearStat(h.equip.body) + gearStat(h.equip.shield) + h.defBonus + ((h.bb&&h.bb.defAdd)||0); } // CAS-383: Piel de Piedra flat def
// Effective max HP = the stored base pool (class+level+shop+shards) plus any
// +vida affixes currently equipped. Never baked into h.maxHp, so persistence
// and leveling stay clean (mirrors how timed buffs stay out of permDmg/permDef).
// CAS-150: Elite-Mastery reward-track +maxHp milestones fold in here too (h.mperk.hp,
// built in sim.recalcMastery) — derived, never baked, so reload reproduces it from the count.
export function heroMaxHp(h){ return Math.round((h.maxHp + affixTotals(h).hp + ((h.tt&&h.tt.hp)||0) + ((h.mperk&&h.mperk.hp)||0)) * ((h.bb&&h.bb.hpMul)||1)); } // CAS-383: Cristal Frágil / Piel de Piedra scale the effective pool (derived, never baked → reload/reset clean)
