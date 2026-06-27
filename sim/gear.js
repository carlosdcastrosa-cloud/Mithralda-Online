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

// Drop tier window per zone (difficulty). Per-enemy gearChance lives on ETPL
// (sim/config.js). Caves/ruins/arena are the tier 2-3 "meaningful loot" zones.
export const ZONE_LOOT = {
  town:{tier:[1,1]}, field:{tier:[1,2]}, forest:{tier:[1,2]},
  caves:{tier:[2,3]}, ruins:{tier:[2,3]}, arena:{tier:[2,3]},
};

// ---- pure gear helpers (no game state, no RNG; safe in sim or render) ----
export function gearDef(slot,defId){ const arr=GEAR[slot]; if(!arr) return null; for(let i=0;i<arr.length;i++) if(arr[i].id===defId) return arr[i]; return null; }
export function gearStat(inst){ if(!inst) return 0; const d=gearDef(inst.slot,inst.defId); if(!d) return 0; const base=(d.dmg!=null?d.dmg:d.def)||0; const r=RARITY[inst.rarity]||RARITY.common; return Math.round(base*r.mult); }
export function gearName(inst){ if(!inst) return "—"; const d=gearDef(inst.slot,inst.defId); return d?d.name:"?"; }
export function gearCol(inst){ const r=inst&&RARITY[inst.rarity]; return r?r.col:RARITY.common.col; }
export function rarityRank(k){ const r=RARITY[k]; return r?r.rank:0; }

// Weighted rarity roll using ONLY the injected srand (determinism / Stage-2).
// minR clamps to rarity >= minR (used for the golem's guaranteed rare+).
export function rollRarity(srand,minR){ const floorRank=minR?rarityRank(minR):0; let total=0;
  for(const k of RARITY_ORDER){ if(RARITY[k].rank<floorRank) continue; total+=RARITY[k].weight; }
  let r=srand()*total;
  for(const k of RARITY_ORDER){ if(RARITY[k].rank<floorRank) continue; r-=RARITY[k].weight; if(r<0) return k; }
  return minR||"common"; }

// Roll a fresh gear instance whose def tier is within [tmin,tmax]. Slot is chosen
// uniformly among slots that actually have a def in range (shields cap at tier 3,
// so they drop out of higher windows). Returns null if nothing fits.
export function rollGearInst(srand,tmin,tmax,minR){ const slots=["weapon","body","shield"]; const avail=[];
  for(const s of slots){ for(const d of GEAR[s]){ if(d.tier>=tmin&&d.tier<=tmax){ avail.push(s); break; } } }
  if(!avail.length) return null;
  const slot=avail[Math.floor(srand()*avail.length)];
  const pool=GEAR[slot].filter(d=>d.tier>=tmin&&d.tier<=tmax);
  const def=pool[Math.floor(srand()*pool.length)];
  return { slot, defId:def.id, rarity:rollRarity(srand,minR) }; }

// Equipped totals — the ONLY readers of hero gear (combat + UI route through
// these so equipping a drop changes real combat numbers, not just the panel).
export function equippedDmg(h){ return h.baseDmg + gearStat(h.equip.weapon) + h.dmgBonus; }
export function equippedDef(h){ return gearStat(h.equip.body) + gearStat(h.equip.shield) + h.defBonus; }
