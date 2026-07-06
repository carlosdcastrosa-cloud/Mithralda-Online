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
  // CAS-1632 — LEGENDARY: the build-defining top rarity (gold-orange). weight:0 is CRÍTICO —
  // rollRarity() walks RARITY_ORDER by weight, so a 0-weight tier can NEVER be produced by the
  // ordinary drop roll (zero distribution change on normal drops). Legendaries come ONLY from the
  // dedicated append-only roll (maybeLegendary, sim.js) that constructs a named UNIQUE instance.
  legendary:{ col:"#ff9a3c", mult:1.90, weight:0,  rank:4 },
};
export const RARITY_ORDER = ["common","uncommon","rare","epic","legendary"];

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
export function weaponProcs(h){ const inst=h&&h.equip&&h.equip.weapon; if(!inst) return null;
  let out=null;
  if(Array.isArray(inst.affixes)) for(const af of inst.affixes){ const a=AFFIXES[af&&af.id]; if(a&&a.proc&&typeof af.amt==="number"){ (out||(out=[])).push({proc:a.proc, amt:af.amt}); } }
  // CAS-1632: an equipped UNIQUE weapon with a proc mod (colmillo_pavido → burn) emits its on-hit
  // status too — reuses the SAME applyStatus path in hitEnemy, no new combat code. Read live.
  const u=uniqDef(inst); if(u&&u.mod&&u.mod.proc){ (out||(out=[])).push({proc:u.mod.proc, amt:u.mod.amt||4}); }
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
export function gearName(inst){ if(!inst) return "—"; const u=inst.uniq&&uniqDef(inst); if(u) return u.name; /* CAS-1632: a UNIQUE reads by its named title everywhere (floaters/tooltips route through here) */ const sp=inst.set&&setPieceDef(inst); if(sp) return sp.name; /* CAS-1654: a set piece reads by its named title too */ const d=gearDef(inst.slot,inst.defId); return d?d.name:"?"; }
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
export function equippedDmg(h){ return h.baseDmg + gearStat(h.equip.weapon) + h.dmgBonus + affixTotals(h).dmg + socketTotals(h).dmg + ((h.tt&&h.tt.dmg)||0); } // CAS-1687: engarzada +daño runes fold in here (derived, never baked)
export function equippedDef(h){ return gearStat(h.equip.body) + gearStat(h.equip.shield) + h.defBonus + ((h.bb&&h.bb.defAdd)||0); } // CAS-383: Piel de Piedra flat def
// Effective max HP = the stored base pool (class+level+shop+shards) plus any
// +vida affixes currently equipped. Never baked into h.maxHp, so persistence
// and leveling stay clean (mirrors how timed buffs stay out of permDmg/permDef).
// CAS-150: Elite-Mastery reward-track +maxHp milestones fold in here too (h.mperk.hp,
// built in sim.recalcMastery) — derived, never baked, so reload reproduces it from the count.
export function heroMaxHp(h){ return Math.round((h.maxHp + affixTotals(h).hp + socketTotals(h).hp + ((h.tt&&h.tt.hp)||0) + ((h.mperk&&h.mperk.hp)||0)) * ((h.bb&&h.bb.hpMul)||1) * uniqTotals(h).hpMul * setTotals(h).hpMul); } // CAS-383 boon hpMul + CAS-1632 corazon_titan (uniqTotals.hpMul) + CAS-1654 Vigía set (setTotals.hpMul) + CAS-1687 socketTotals.hp (Zafiro runes) scale/add to the effective pool (derived, never baked → reload/reset clean)

// ===========================================================================
// CAS-1687 — RUNAS Y ENGARCES (sockets). A gear instance may carry `sockets`: an
// array (0–2) of slots, each EMPTY `{}` or FILLED `{type:"<runeId>"}`. A rune in the
// bag is a bag item `{rune:"<runeId>"}` (no slot/defId). Engarzar a rune consumes it
// into an empty socket; desengarzar returns it to the bag. $0 art: a rune/socket
// renders as a tinted glyph (◇ empty / ◆ filled) — NO sprite. The bonus rides
// `socketTotals()` — the live mirror of affixTotals (CAS-117) — so a filled socket
// moves REAL combat numbers, never a baked stat (Stage-2 authority-ready: recomputable
// purely from the equipped instances). Content lives HERE with the other gear content;
// the tunable knobs (enabled/dropRate/socketChance) live in config.js `SOCKETS`.
export const RUNES = {
  rubi:      { name:"Runa de Rubí",      glyph:"◆", tint:"#e8564e", stat:"dmg",    amt:6,  label:"+6 daño"       },
  zafiro:    { name:"Runa de Zafiro",    glyph:"◆", tint:"#4e8fe8", stat:"hp",     amt:30, label:"+30 vida máx"  },
  esmeralda: { name:"Runa de Esmeralda", glyph:"◆", tint:"#4ee88f", stat:"atkspd", amt:6,  label:"+6% vel. ataque" },
};
export const RUNE_ORDER = ["rubi","zafiro","esmeralda"];
export function runeDef(type){ return (type&&RUNES[type])||null; }
export function runeName(type){ const r=runeDef(type); return r?r.name:null; }
// Validate/rebuild a persisted sockets array (safeInst path): keep ≤2 entries; each entry
// is `{type}` for a KNOWN rune, else an EMPTY `{}` (unknown/garbage rune → emptied, never
// dropped so the socket count survives). Absent/non-array → null (piece simply has no sockets).
export function safeSockets(arr){ if(!Array.isArray(arr)) return null; const out=[];
  for(const s of arr){ if(out.length>=2) break;
    if(s && s.type && RUNES[s.type]) out.push({type:s.type}); else out.push({}); }
  return out.length?out:null; }
// Sum every FILLED socket on equipped gear into one live combat bundle — the mirror of
// affixTotals (CAS-117) / uniqTotals (CAS-1632). The ONLY reader of socket bonuses (combat
// + UI route through this) so engarzar moves REAL numbers, never a stored/baked stat, and
// stays recomputable from the 3 equipped instances. 0 RNG.
export function socketTotals(h){ const t={dmg:0,hp:0,atkspd:0};
  if(!h||!h.equip) return t;
  for(const slot of ["weapon","body","shield"]){ const inst=h.equip[slot]; if(!inst||!Array.isArray(inst.sockets)) continue;
    for(const s of inst.sockets){ const r=s&&s.type&&RUNES[s.type]; if(r&&t[r.stat]!=null) t[r.stat]+=r.amt; } }
  return t; }

// ===========================================================================
// CAS-1632 — ÍTEMS ÚNICOS/LEGENDARIOS (loot que define builds). A "unique" is a
// NAMED instance {slot, defId, rarity:"legendary", uniq:"<id>"} — `defId` points
// at an existing base def so gearStat() resolves stats normally by tier/mult (a
// legendary just carries the 1.90 rarity mult + gold tint, ZERO new sprites). The
// build-defining twist rides on `mod`, which hooks exactly ONE already-live system:
//   1. reloj_vacio      (weapon) mod.abilCdr:15  → −15% ability/spell cooldown  → castAbility/castSpell cd factor (capped 60% with h.tt.cdr)
//   2. corona_ecos      (body)   mod.essencePct:25→ +25% Esencia               → essenceForRun() before the Ascensión mult
//   3. colmillo_pavido  (weapon) mod.proc:"burn"  → basic attack ignites         → weaponProcs() → hitEnemy applyStatus (reuses CAS-118)
//   4. prisma_fracturado(shield) mod.abilityMod   → Cadena +2 saltos / Nova radio ×2 → uniqEmpower() copy-on-write at the cast seam (by sp.type)
//   5. corazon_titan    (body)   mod.hpMul:1.20   → +20% vida máx               → heroMaxHp() derived multiplier
//   6. guante_berserker (weapon) mod.atkspd:12    → +12% vel. ataque            → heroAtkspd() under ATKSPD_TOTAL_CAP
// 3 weapon / 2 body / 1 shield — only one weapon equips at a time, so the 3 weapon
// uniques are mutually-exclusive build choices (intended). All effects are read
// LIVE via uniqTotals()/uniqEmpower()/weaponProcs() — never baked, so reload/reset
// reproduce them from {defId,rarity,uniq}. Zero RNG in this content block.
export const UNIQUES = [
  {id:"reloj_vacio",      name:"Reloj Vacío",           slot:"weapon", defId:"w_rune",  mod:{abilCdr:15}},
  {id:"corona_ecos",      name:"Corona de Ecos",        slot:"body",   defId:"a_wyrm",  mod:{essencePct:25}},
  {id:"colmillo_pavido",  name:"Colmillo Pávido",       slot:"weapon", defId:"w_steel", mod:{proc:"burn", amt:4}},
  {id:"prisma_fracturado",name:"Prisma Fracturado",     slot:"shield", defId:"s_tower", mod:{abilityMod:{chain:{jumps:2}, nova:{rangeMul:2}}}},
  {id:"corazon_titan",    name:"Corazón del Titán",     slot:"body",   defId:"a_plate", mod:{hpMul:1.20}},
  {id:"guante_berserker", name:"Guante del Berserker",  slot:"weapon", defId:"w_iron",  mod:{atkspd:12}},
];
// Resolve a unique def from a gear instance (or null for an ordinary/absent piece).
export function uniqDef(inst){ if(!inst||!inst.uniq) return null; for(let i=0;i<UNIQUES.length;i++) if(UNIQUES[i].id===inst.uniq) return UNIQUES[i]; return null; }
export function uniqById(id){ for(let i=0;i<UNIQUES.length;i++) if(UNIQUES[i].id===id) return UNIQUES[i]; return null; }
export function uniqName(inst){ const u=uniqDef(inst); return u?u.name:null; }
// Build a fresh legendary instance for a unique id (used by the drop roll + dev bridge).
export function uniqInst(id){ const u=uniqById(id); return u?{slot:u.slot, defId:u.defId, rarity:"legendary", uniq:u.id}:null; }
// Sum every EQUIPPED unique's scalar mods into one live combat bundle — the mirror of
// affixTotals (CAS-117). The ONLY reader of unique scalar mods (combat + UI route through
// this) so equipping a legendary moves REAL numbers, never a stored/baked stat, and stays
// recomputable from the 3 equipped instances (Stage-2 server-authority-ready). Non-scalar
// mods (proc / abilityMod) are read at their own sites (weaponProcs / uniqEmpower).
export function uniqTotals(h){ const t={abilCdr:0, essencePct:0, hpMul:1, atkspd:0};
  if(!h||!h.equip) return t;
  for(const slot of ["weapon","body","shield"]){ const inst=h.equip[slot]; const u=inst&&uniqDef(inst); if(!u||!u.mod) continue;
    const m=u.mod;
    if(m.abilCdr) t.abilCdr+=m.abilCdr;
    if(m.essencePct) t.essencePct+=m.essencePct;
    if(m.hpMul) t.hpMul*=m.hpMul;
    if(m.atkspd) t.atkspd+=m.atkspd; }
  return t; }
// CAS-1632 — ABILITY-EMPOWER overlay (mirror of talentEmpower, CAS-1602). If an EQUIPPED unique
// carries an abilityMod for this spell's `type` (prisma_fracturado: chain→+jumps, nova→×range),
// return a COPY of the spell with the param scaled. Otherwise return `sp` UNCHANGED (SAME object →
// 0 behaviour/RNG delta when the unique isn't equipped). Never mutates SPELLS/ABILITY_MAP. Called
// at the cast seam BEFORE the mana/cd gates (matches talentEmpower ordering).
export function uniqEmpower(h, sp){ if(!h||!sp||!h.equip) return sp;
  for(const slot of ["weapon","body","shield"]){ const inst=h.equip[slot]; const u=inst&&uniqDef(inst);
    if(!u||!u.mod||!u.mod.abilityMod) continue;
    const m=u.mod.abilityMod[sp.type]; if(!m) continue;
    const cp=Object.assign({}, sp);
    if(m.jumps!=null) cp.jumps=(sp.jumps||3)+m.jumps;
    if(m.rangeMul!=null) cp.range=(sp.range||0)*m.rangeMul;
    return cp; }
  return sp; }

// ===========================================================================
// CAS-1654 — CONJUNTOS DE OBJETOS (Item Sets). A parallel build-defining loot
// layer to the UNIQUES (CAS-1632): instead of one build-defining piece, you
// COLLECT matching pieces to earn tiered bonuses. Art cost = $0 (a set piece is
// an ordinary instance {slot, defId, rarity, set:"<pieceId>"} — `defId` points at
// an existing GEAR base so gearStat() resolves stats normally by tier/mult; the
// set tint reuses the rarity pips/colour). The build twist rides ENTIRELY on
// `setTotals()`, the live copy-on-write aggregate mirrored on uniqTotals().
//
// BALANCE NOTE (AC1): a set is an ALTERNATE path, never dominant over a legendary.
// A legendary gives its whole bonus in ONE slot (e.g. corazon_titan hpMul 1.20),
// leaving the other two slots free. The Vigía set needs 2 pieces for a SMALLER
// hpMul 1.15 and, to reach its 3pz capstone, occupies all THREE slots — a real
// opportunity cost (you cannot also run legendaries there). So the set trades
// slot-flexibility for cumulative, cheaper stats: strong when fully committed,
// weaker per-slot than a unique. Tunable below; keep it a side-grade.
//
// 3 sets × {b2, b3}; each set has EXACTLY one piece per slot (weapon/body/shield)
// so a full 3-piece set = all three slots and both tiers are reachable.
export const SETS = {
  vigia:   { name:"Vestiduras del Vigía",  b2:{hpMul:1.15},    b3:{reflectPct:10} },   // defensivo: vida + espinas
  cazador: { name:"Atavío del Cazador",    b2:{atkspd:10},     b3:{critDmgPct:20} },   // ofensivo: vel. ataque + daño crítico
  erudito: { name:"Ropajes del Erudito",   b2:{essencePct:15}, b3:{abilCdr:10} },      // caster: esencia + enfriamiento
};
export const SET_ORDER = ["vigia","cazador","erudito"];
// SET_PIECES — the droppable named pieces (mirror of UNIQUES[]). `defId` borrows an
// existing GEAR base def for its raw stats; `set` ties the instance to a SETS entry.
export const SET_PIECES = [
  {id:"vigia_arma",   name:"Alabarda del Vigía",   slot:"weapon", defId:"w_steel", set:"vigia"},
  {id:"vigia_cuerpo", name:"Coraza del Vigía",     slot:"body",   defId:"a_plate", set:"vigia"},
  {id:"vigia_escudo", name:"Broquel del Vigía",    slot:"shield", defId:"s_tower", set:"vigia"},
  {id:"cazador_arma", name:"Estoque del Cazador",  slot:"weapon", defId:"w_steel", set:"cazador"},
  {id:"cazador_cuerpo",name:"Jubón del Cazador",   slot:"body",   defId:"a_leather",set:"cazador"},
  {id:"cazador_escudo",name:"Rodela del Cazador",  slot:"shield", defId:"s_iron",  set:"cazador"},
  {id:"erudito_arma", name:"Cetro del Erudito",    slot:"weapon", defId:"w_iron",  set:"erudito"},
  {id:"erudito_cuerpo",name:"Túnica del Erudito",  slot:"body",   defId:"a_wyrm",  set:"erudito"},
  {id:"erudito_escudo",name:"Égida del Erudito",   slot:"shield", defId:"s_iron",  set:"erudito"},
];
// Resolve a set-piece def from an instance (or null for an ordinary/absent piece).
export function setPieceDef(inst){ if(!inst||!inst.set) return null; for(let i=0;i<SET_PIECES.length;i++) if(SET_PIECES[i].id===inst.set) return SET_PIECES[i]; return null; }
export function setPieceById(id){ for(let i=0;i<SET_PIECES.length;i++) if(SET_PIECES[i].id===id) return SET_PIECES[i]; return null; }
export function setPieceName(inst){ const p=setPieceDef(inst); return p?p.name:null; }
// Build a fresh set-piece instance (used by the drop roll + dev bridge). Epic rarity
// (distinct tint from a legendary UNIQUE) — the value is the SET bonus, not the base roll.
export function setInst(id){ const p=setPieceById(id); return p?{slot:p.slot, defId:p.defId, rarity:"epic", set:p.id}:null; }
// Count equipped pieces per setId over the 3 slots. Pure/derived helper for UI + totals.
export function setCounts(h){ const c={}; if(!h||!h.equip) return c;
  for(const slot of ["weapon","body","shield"]){ const p=setPieceDef(h.equip[slot]); if(p) c[p.set]=(c[p.set]|0)+1; }
  return c; }
// Sum every ACTIVE set bonus into one live combat bundle — the mirror of uniqTotals
// (CAS-1632). For each set with ≥2 equipped pieces apply b2; with ≥3 also apply b3
// (cumulative, includes b2). The ONLY reader of set bonuses (combat + UI route through
// this) so collecting a set moves REAL numbers, never a stored/baked stat, and stays
// recomputable from the equipped instances (Stage-2 server-authority-ready). 0 RNG.
export function setTotals(h){ const t={hpMul:1, atkspd:0, essencePct:0, abilCdr:0, reflectPct:0, critDmgPct:0};
  const c=setCounts(h);
  for(const id in c){ const s=SETS[id]; if(!s) continue; const n=c[id];
    if(n>=2 && s.b2) applyTier(t, s.b2);
    if(n>=3 && s.b3) applyTier(t, s.b3); }
  return t; }
function applyTier(t, b){
  if(b.hpMul) t.hpMul*=b.hpMul;
  if(b.atkspd) t.atkspd+=b.atkspd;
  if(b.essencePct) t.essencePct+=b.essencePct;
  if(b.abilCdr) t.abilCdr+=b.abilCdr;
  if(b.reflectPct) t.reflectPct+=b.reflectPct;
  if(b.critDmgPct) t.critDmgPct+=b.critDmgPct;
}
