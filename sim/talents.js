// ===========================================================================
// sim/talents.js — CAS-119 data-driven class TALENT TREES + the combat
// aggregator that turns chosen nodes into real combat numbers.
//
// Build agency: every level grants a talent point (sim.gainXP); the player
// SPENDS it in their class tree to shape HOW they get stronger. Each node's
// effect is OBSERVABLE in combat (not a flat number dump) and reuses systems
// already shipped — affixes (CAS-117) and status effects (CAS-118): poison
// on-hit, stun chance, crit, dodge, regen, cooldown reduction, etc.
//
// Pure data + pure functions only (no ctx/DOM, no Math.random). Mutation lives
// in sim.js (allocTalent/respec/recalc) so this file stays Stage-2-safe: a
// server could validate the same tree against the same rules. The aggregated
// bundle is CACHED on the hero as h.tt (recomputed on change) so combat reads
// it with zero per-frame allocation.
// ===========================================================================
import { STATUS } from "./config.js";

// The effect bundle keys → where each is consumed in the sim:
//   dmg/hp          flat, folded into equippedDmg / heroMaxHp (via cached h.tt)
//   atkspd/movespd  % added to the matching affix % at heroAttack / movement
//   crit/critMult   crit chance % + extra crit-damage % (hitEnemy, srand-gated)
//   onhit           flat bonus damage on every hero hit (hitEnemy)
//   regen           hp/sec passive heal (update timers)
//   dodge           % chance to fully negate one enemy hit (damageHero)
//   cdr             % class-spell cooldown reduction (castSpell)
//   stunChance      % chance to aturdir on hit (hitEnemy, srand-gated)
//   poisonOnHit     >0 → basic/melee hits apply poison (reuses CAS-118)
//   poisonDmg/Dur   boost the potency/duration of that applied poison
export const TT_KEYS = ["dmg","hp","atkspd","movespd","crit","critMult","onhit","regen","dodge","cdr","stunChance","poisonOnHit","poisonDmg","poisonDur"];
// Caps so a maxed tree can't break the frame budget / combat curve.
const TT_CAP = { atkspd:30, movespd:30, crit:50, critMult:60, dodge:35, cdr:40, stunChance:35 };

export function zeroTT(){ const t={}; for(const k of TT_KEYS) t[k]=0; return t; }

// Crit multiplier base (critMult adds on top, as percent). hitEnemy reads this.
export const CRIT_BASE = 1.6;

// --------------------------- the trees (content) ------------------------
// Each class: 3 BRANCHES (columns) × up to 3 TIERS (rows), 7 nodes total.
//   br    — branch index (0..2) for column layout
//   tier  — row within the branch
//   max   — rank cap (1 point per rank)
//   req   — prerequisite node id (needs >=1 rank) — gates deeper nodes
//   excl  — exclusive group: within a group you may invest in only ONE node,
//           so a build choice is permanent until you respec (AC #4).
// eff keys are TT_KEYS; the aggregator sums eff*rank across allocated nodes.
function N(id,br,tier,name,desc,max,eff,opt){ return Object.assign({id,br,tier,name,desc,max,eff}, opt||{}); }

export const TALENTS = {
  warrior: { branches:["Armas","Coraza","Ímpetu"], nodes:[
    N("wA1",0,0,"Filo afilado","+3 de daño por rango.",3,{dmg:3}),
    N("wA2",0,1,"Frenesí","+7% vel. de ataque por rango.",2,{atkspd:7},{req:"wA1",levelReq:3}),
    N("wA3",0,2,"Golpe brutal","+9% prob. de crítico (×1.6 daño).",2,{crit:9},{req:"wA2",excl:"w_cap",levelReq:6}),
    N("wA4",0,2,"Machaque","+10% prob. de aturdir al golpear.",2,{stunChance:10},{req:"wA2",excl:"w_cap",levelReq:6}),
    N("wB1",1,0,"Piel curtida","+25 de vida máx. por rango.",3,{hp:25}),
    N("wB2",1,1,"Segundo aliento","+1.2 vida/seg.",2,{regen:1.2},{req:"wB1",levelReq:3}),
    N("wC1",2,0,"Paso firme","+7% vel. de movimiento.",2,{movespd:7}),
    N("wC2",2,1,"Reflejos","+7% de esquivar por completo un golpe.",2,{dodge:7},{req:"wC1",levelReq:3}),
  ]},
  paladin: { branches:["Cruzada","Fe","Devoción"], nodes:[
    N("pA1",0,0,"Mano firme","+3 de daño por rango.",3,{dmg:3}),
    N("pA2",0,1,"Martillo sagrado","+9% prob. de aturdir al golpear.",2,{stunChance:9},{req:"pA1",levelReq:3}),
    N("pA3",0,2,"Juicio","+8% prob. de crítico (×1.6 daño).",2,{crit:8},{req:"pA2",excl:"p_cap",levelReq:6}),
    N("pA4",0,2,"Castigo continuo","+4 de daño fijo en cada golpe.",2,{onhit:4},{req:"pA2",excl:"p_cap",levelReq:6}),
    N("pB1",1,0,"Bendición vital","+30 de vida máx. por rango.",3,{hp:30}),
    N("pB2",1,1,"Regeneración divina","+1.5 vida/seg.",2,{regen:1.5},{req:"pB1",levelReq:3}),
    N("pC1",2,0,"Fervor","-12% de enfriamiento de habilidades.",2,{cdr:12}),
    N("pC2",2,1,"Gracia evasiva","+6% de esquivar por completo un golpe.",2,{dodge:6},{req:"pC1",levelReq:3}),
  ]},
  mage: { branches:["Piromancia","Arcano","Barrera"], nodes:[
    N("mA1",0,0,"Poder arcano","+3 de daño por rango.",3,{dmg:3}),
    N("mA2",0,1,"Foco letal","+9% prob. de crítico (×1.6 daño).",2,{crit:9},{req:"mA1",levelReq:3}),
    N("mA3",0,2,"Aniquilación","+25% de daño crítico extra.",2,{critMult:25},{req:"mA2",excl:"m_cap",levelReq:6}),
    N("mA4",0,2,"Toque tóxico","Tus golpes envenenan (+2 daño/tic por rango).",2,{poisonOnHit:1,poisonDmg:2},{req:"mA2",excl:"m_cap",levelReq:6}),
    N("mB1",1,0,"Mente veloz","-14% de enfriamiento de habilidades.",2,{cdr:14}),
    N("mB2",1,1,"Conjuro rápido","+7% vel. de ataque por rango.",2,{atkspd:7},{req:"mB1",levelReq:3}),
    N("mC1",2,0,"Escudo de maná","+16 de vida máx. por rango.",3,{hp:16}),
    N("mC2",2,1,"Parpadeo defensivo","+7% de esquivar por completo un golpe.",2,{dodge:7},{req:"mC1",levelReq:3}),
  ]},
  druid: { branches:["Ponzoña","Bosque","Agilidad"], nodes:[
    N("dA1",0,0,"Savia tóxica","Tus golpes envenenan al enemigo.",1,{poisonOnHit:1}),
    N("dA2",0,1,"Veneno virulento","+2 de daño/tic de veneno por rango.",3,{poisonDmg:2},{req:"dA1",levelReq:3}),
    N("dA3",0,2,"Ponzoña persistente","+1.2s de duración del veneno por rango.",2,{poisonDur:1.2},{req:"dA2",excl:"d_cap",levelReq:6}),
    N("dA4",0,2,"Esporas aturdidoras","+9% prob. de aturdir al golpear.",2,{stunChance:9},{req:"dA2",excl:"d_cap",levelReq:6}),
    N("dB1",1,0,"Corteza","+22 de vida máx. por rango.",3,{hp:22}),
    N("dB2",1,1,"Fotosíntesis","+1.4 vida/seg.",2,{regen:1.4},{req:"dB1",levelReq:3}),
    N("dC1",2,0,"Pies ligeros","+8% vel. de movimiento.",2,{movespd:8}),
    N("dC2",2,1,"Danza esquiva","+8% de esquivar por completo un golpe.",2,{dodge:8},{req:"dC1",levelReq:3}),
  ]},
  priest: { branches:["Castigo","Gracia","Plegaria"], nodes:[
    N("prA1",0,0,"Fe ardiente","+3 de daño por rango.",3,{dmg:3}),
    N("prA2",0,1,"Luz penetrante","+8% prob. de crítico (×1.6 daño).",2,{crit:8},{req:"prA1",levelReq:3}),
    N("prA3",0,2,"Verbo veloz","+7% vel. de ataque por rango.",2,{atkspd:7},{req:"prA2",excl:"pr_cap",levelReq:6}),
    N("prA4",0,2,"Palabra de dolor","+9% prob. de aturdir al golpear.",2,{stunChance:9},{req:"prA2",excl:"pr_cap",levelReq:6}),
    N("prB1",1,0,"Aura sagrada","+20 de vida máx. por rango.",3,{hp:20}),
    N("prB2",1,1,"Renovación","+1.6 vida/seg.",3,{regen:1.6},{req:"prB1",levelReq:3}),
    N("prC1",2,0,"Meditación","-14% de enfriamiento de habilidades.",2,{cdr:14}),
    N("prC2",2,1,"Intervención","+8% de esquivar por completo un golpe.",2,{dodge:8},{req:"prC1",levelReq:3}),
  ]},
};

// ----------------------------- pure helpers -----------------------------
export function talentNodes(cls){ const t=TALENTS[cls]; return t?t.nodes:null; }
export function talentNode(cls,id){ const ns=talentNodes(cls); if(!ns) return null; for(const n of ns) if(n.id===id) return n; return null; }
export function nodeRank(h,id){ return (h&&h.talents&&h.talents[id])|0; }
export function talentSpent(h){ if(!h||!h.talents) return 0; let s=0; for(const k in h.talents) s+=h.talents[k]|0; return s; }

// Aggregate the chosen nodes into one combat-stat bundle (the ONLY reader of
// talent effects). Capped so stacking stays sane. Allocates a fresh object —
// callers cache it on h.tt and read that in the hot path (no per-frame alloc).
export function talentTotals(h){ const t=zeroTT();
  const ns=h&&h.talents?talentNodes(h.cls):null; if(!ns) return t;
  for(const node of ns){ const r=h.talents[node.id]|0; if(r<=0) continue;
    for(const k in node.eff){ if(t[k]!=null) t[k]+=node.eff[k]*r; } }
  for(const k in TT_CAP) if(t[k]>TT_CAP[k]) t[k]=TT_CAP[k];
  return t; }

// Legal-to-allocate check (points available, rank cap, prereq met, exclusivity
// free). Shared by the sim mutation AND the UI (so the panel only lights up real
// choices) AND save validation, so a tree can never reach an illegal state.
export function canAllocTalent(h,id){ const ns=talentNodes(h&&h.cls); if(!ns) return false;
  const node=talentNode(h.cls,id); if(!node) return false;
  if((h.talentPts|0)<=0) return false;
  if(nodeRank(h,id)>=node.max) return false;
  if(node.req && nodeRank(h,node.req)<=0) return false;
  if(node.levelReq && (h.lvl||1) < node.levelReq) return false;
  if(node.excl){ for(const n of ns){ if(n.id!==id && n.excl===node.excl && nodeRank(h,n.id)>0) return false; } }
  return true; }

// Why a node can't be taken yet (for greying / tooltips). null === allocatable.
export function lockReason(h,id){ const node=talentNode(h&&h.cls,id); if(!node) return "?";
  if(nodeRank(h,id)>=node.max) return "max";
  if(node.req && nodeRank(h,node.req)<=0) return "req";
  if(node.levelReq && (h.lvl||1) < node.levelReq) return "level:"+node.levelReq;
  if(node.excl){ for(const n of talentNodes(h.cls)){ if(n.id!==id && n.excl===node.excl && nodeRank(h,n.id)>0) return "excl"; } }
  if((h.talentPts|0)<=0) return "pts";
  return null; }

// Rebuild a SAFE talent map from an untrusted save blob: clamp ranks, drop nodes
// whose prereq isn't (also-validated) present, and enforce exclusivity — so a
// loaded tree is always a legally-reachable build. Applied in tree order so a
// req can reference an already-accepted node. CAS-113.
export function sanitizeTalents(d, cls){ const ns=talentNodes(cls); const out={}; if(!ns||!d||typeof d!=="object") return out;
  for(const node of ns){ let r=d[node.id]; if(typeof r!=="number"||!isFinite(r)||r<1) continue;
    r=Math.min(node.max, Math.floor(r));
    if(node.req && !(out[node.req]>0)) continue;
    if(node.excl){ let conflict=false; for(const n of ns){ if(n.id!==node.id && n.excl===node.excl && out[n.id]>0){ conflict=true; break; } } if(conflict) continue; }
    out[node.id]=r; }
  return out; }

// The poison a 'poison-on-hit' build applies (reuses CAS-118 STATUS.poison as
// the floor, then the tree's poisonDmg/Dur boost it). Kept here so sim + tests
// read one source. Returns null when the build has no poison-on-hit.
export function talentPoison(tt){ if(!tt||!(tt.poisonOnHit>0)) return null;
  return { dmg: STATUS.poison.dmg + (tt.poisonDmg||0), dur: STATUS.poison.dur + (tt.poisonDur||0) }; }
