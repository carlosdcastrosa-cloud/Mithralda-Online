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
import { TS, MAP_W, MAP_H, T_WATER, CFG, ATK, ETPL, SPELLS, CLASS_STATS, HUNTS, ZONE_TIER, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, STAGE1_GOAL, STATUS, CONSUMABLES, ATKSPD_TOTAL_CAP, AMBUSH, MOB_AFFIX, MOB_AFFIX_IDS, MOB_AFFIX_RATE, MASTERY, CUSTOMIZE, BOONS, BOON_MAP, BOON_RARITY, BOON_DRAFT_N, SYNERGIES, boonRarityWeight, ZONE_MODIFIERS, ZONE_MOD_MAP, CURSE_DEPTH_BONUS, CONQUEST_ZONES, WORLD_TIER } from "./config.js";
import { clamp, lerp, dist2, norm, angDiff } from "./math.js";
import { createRNG } from "./rng.js";
import { buildWorld, buildTiledWorld, zoneOf } from "./world.js";
import { ZONE_LOOT, gearStat, gearName, gearDef, gearCol, rarityRank, rollGearInst, equippedDmg, equippedDef, affixTotals, heroMaxHp, AFFIXES, weaponProcs, RARITY_ORDER, FORGE, forgeLevel, forgeNextCost } from "./gear.js";
import { TALENTS, talentNode, talentNodes, talentTotals, talentSpent, canAllocTalent, sanitizeTalents, talentPoison, zeroTT, CRIT_BASE } from "./talents.js";

// feedback floater palette (presentation hints carried by sim events)
const C_CREAM = "#e8e0d0", C_GOLD = "#f2c14e";

// CAS-256: hit-react / skill-cast anim-state durations (seconds). MUST match the render
// strip durations (render.js CLASS_HURT_DUR / CLASS_SPECIAL_DUR) so each strip plays once
// and ends in sync with its animState. Presentation-only — they gate no gameplay logic.
const HURT_ANIM_DUR = 0.28, SPECIAL_ANIM_DUR = 0.55;

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

// the authoritative world (deterministic for the fixed seed). ?world=tiled loads the hand-built
// Tiled continent (760×570) instead of the procedural world — behind a flag until fully wired.
const USE_TILED = typeof location!=="undefined" && /[?&]world=tiled/.test(location.search||"");
const world = USE_TILED ? buildTiledWorld() : buildWorld(rng);

// CAS-397: spatial hash over world.solids. Making the wilderness trees/rocks solid pushes the
// solid count from ~200 to ~1400; solidBlocked runs 2×/entity/frame, so the old O(n) linear scan
// would blow the frame budget. Bucket solids into fixed cells once (solids never mutate at
// runtime) and query only the cells a point's reach can touch → ~O(1) regardless of solid count.
// Behaviour is byte-identical to the linear scan (same solids, same dist2 test), just pruned.
const SGRID_CELL = 64;                               // px per bucket (> max solid.r + query.r span)
const SGRID_W = Math.ceil((MAP_W*TS)/SGRID_CELL);
let solidMaxR = 0;
const solidGrid = new Map();
for(const s of world.solids){
  if(s.r>solidMaxR) solidMaxR=s.r;
  const key=Math.floor(s.y/SGRID_CELL)*SGRID_W + Math.floor(s.x/SGRID_CELL);
  let arr=solidGrid.get(key); if(!arr){ arr=[]; solidGrid.set(key,arr); } arr.push(s);
}

// injected dependencies (set by the orchestrator before the loop runs)
let io = null, audio = null, view = null;
export function configure(deps){ io = deps.io; audio = deps.audio; view = deps.view; }

export { world, rng };

export const G = {
  scene:"menu", // menu, play, dialogue, shop, bounty, bestiary, inventory, talents, pause, dead, victory
  // CAS-123: frozen run-summary snapshot built when the Stage-1 final boss dies; read by
  // renderVictory(). null until the win fires. Cleared scene-side only (the win persists
  // on the hero), so re-opening it is harmless.
  victory:null,
  // CAS-277: per-RUN bookkeeping for the end-of-run recap. `run` is the baseline snapshot
  // of the lifetime counters taken at run start (beginRun); `recap` is the FROZEN delta
  // snapshot built when the run terminates (heroDie). Both are presentation-only and
  // transient (never serialized) — the sim NEVER reads them, so balance/determinism and
  // the Stage-2 authority are untouched. The recap READS existing counters only; it adds
  // no new economy. Cleared scene-side on retry/return.
  run:null, recap:null,
  talFocus:0,   // CAS-119: keyboard-focused talent node index (talents panel)
  t:0, hero:null, enemies:[], projectiles:[], fields:[], fx:[], floaters:[], drops:[],
  // CAS-317: presentation-only corpses for rich-anim bosses (the dracónic boss). When such
  // a boss dies, killEnemy spawns a short-lived corpse here that plays its DEATH strip
  // one-shot and holds the collapsed final frame, then fades. The sim NEVER reads these
  // (no collision/AI/economy) — they exist purely so the death animation is visible after
  // the entity leaves G.enemies. Stage-2 safe (render-side state, no RNG).
  corpses:[],
  // CAS-127: reduceMotion is the accessibility off-switch — it gates screen shake and
  // trims flourish particle bursts (never changes balance/mechanics; purely cosmetic).
  // CAS-265: colorblind adds shape/text cues (rarity marks, crit glyph, telegraph ring)
  // so signal never relies on hue alone; binds is the persisted key-rebinding table
  // (filled by settings.boot()). All settings are presentation-only — Stage-2 safe.
  cam:{x:0,y:0}, shake:0, settings:{shake:1, crt:true, rollAim:false, reduceMotion:false, colorblind:false, binds:null},
  quest:{wolves:0, done:false, rewarded:false}, hunts:{}, dialog:null, shopSel:0, bountySel:0,
  // CAS-383: live boon-draft state. null except while the "draft" scene is up: {choices:[ids],
  // sel, source}. draftSel mirrors the highlighted card for kbd/pad nav. Transient (never saved).
  draft:null, draftSel:0,
  // CAS-394: live zone-modifier OFFER. null except while the "curse" scene is up: {zone, mod:id}.
  // Transient (never saved) — the accepted result lives on hero.curses.
  curse:null,
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

// ----------------------------- CAS-169 customization -----------------------
// A deep clone of a class's default part palette ({hood,cloak,sash,legs} → [r,g,b]).
// Falls back to the warrior look for an unknown class so a hero is never colorless.
export function defaultPalette(cls){
  const d = CUSTOMIZE.defaults[cls] || CUSTOMIZE.defaults.warrior;
  const o={}; for(const s of CUSTOMIZE.slots) o[s]=d[s].slice(); return o;
}
// Coerce one untrusted color into a valid [r,g,b] of ints 0-255, else null.
function safeColor(c){ if(!Array.isArray(c)||c.length<3) return null;
  const o=[]; for(let i=0;i<3;i++){ const v=c[i]; if(typeof v!=="number"||!isFinite(v)) return null; o.push(Math.max(0,Math.min(255,Math.round(v)))); }
  return o; }
// Rebuild a LEGAL palette from an untrusted blob: each slot keeps a valid stored
// color, otherwise falls back to the class default. Result always has all 4 slots.
function sanitizePalette(p, cls){ const base=defaultPalette(cls); if(!p||typeof p!=="object") return base;
  for(const s of CUSTOMIZE.slots){ const c=safeColor(p[s]); if(c) base[s]=c; } return base; }
// Rebuild a LEGAL variation from an untrusted blob: each kind must be one of the
// allowed option ids, else the class default.
function sanitizeVariation(v){ const out=Object.assign({},CUSTOMIZE.variationDefault); if(!v||typeof v!=="object") return out;
  for(const k in CUSTOMIZE.variations){ if(CUSTOMIZE.variations[k].indexOf(v[k])>=0) out[k]=v[k]; } return out; }

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
    // CAS-192: short timed attack-speed bonus from the "furia" consumable. Read by the
    // attack-cooldown formula (alongside CAS-117 affix / CAS-119 talent atkspd); ticks
    // down in update(). Transient — never serialized (a fresh boot starts clean).
    atkspdBuffT:0, atkspdBuffAmt:0,
    rolling:false, rollT:0, rollCD:0, iframe:0, atkCD:0, atkT:0, atkAng:0, atkAnim:0, hurtFlash:0, walkT:0, dead:false, moved:false,
    // CAS-256: presentation-only anim timers — hurtAnim drives the hit-react flinch strip
    // on taking a hit, specialAnim drives the skill-cast strip on a class-skill cast. They
    // ONLY select which sprite renders (animState), never gate movement/attack, so combat
    // mechanics + determinism are unchanged. Transient — never serialized.
    hurtAnim:0, specialAnim:0,
    // CAS-210: RIPOSTE focus window — a frame-perfect dodge (rolling THROUGH a connecting
    // strike) arms this timer; the next hero hit while it's live is a guaranteed crushing
    // counter. The skill-expression payoff that makes the souls-like read-and-punish loop
    // land. Transient — never serialized (a fresh boot starts clean).
    riposte:0,
    // CAS-118 status sinks (mirror the enemy fields): slow scales move speed, stun gates
    // input, dots holds active DoTs. Transient — never serialized (rehydrated clean).
    slow:1, slowT:0, stun:0, dots:null,
    animState:"idle", animT:0, cls:cls||"warrior",
    // CAS-169: character customization — recolorable part palette + headwear/cape
    // variation. Pure presentation state the renderer bakes into the hero strips
    // (never touches sim/combat). Boots on the class default look; persisted
    // additively in serializeSave. Cloned so per-hero edits never alias the data.
    palette:defaultPalette(cls), variation:Object.assign({},CUSTOMIZE.variationDefault),
    // CAS-119: talent progression. talents = {nodeId:rank} chosen by the player,
    // talentPts = unspent points (1 granted per level in gainXP). tt = the CACHED
    // aggregated combat bundle (recalcTalents) read by the hot path with no alloc.
    talents:{}, talentPts:0, tt:zeroTT(),
    // CAS-383: inter-zone BOON DRAFT — per-RUN roguelite build layer. `boons` is the
    // ordered list of drafted boon ids (stacks, duplicates deepen); `bb` is the cached
    // aggregate bundle (recalcBoons) read by the hot combat paths with no alloc. Reset on
    // death / new run (respawn), persisted additively so a same-run reload keeps them.
    boons:[], bb:zeroBB(),
    // CAS-392: per-RUN draft agency. rerollLeft/banishLeft are steering charges SHARED across
    // the run's champion-clear drafts (a single budget, reset on death / new run — same lifecycle
    // as `boons`). banished = ids the player removed from THIS run's future pool, excluded from
    // every later draw + reroll so the odds bias toward a target build. Persisted additively.
    rerollLeft:1, banishLeft:1, banished:[],
    // CAS-394: per-RUN OPT-IN ZONE MODIFIER ("Maldición"). `curses` maps zone→accepted modifier
    // id (scales that zone's enemies + upgrades its clear reward); `curseSeen` lists zones already
    // OFFERED this run (so the entry prompt fires exactly once per zone). Same run lifecycle as
    // `boons` — reset on death / new run (respawn / createHero), persisted additively.
    curses:{}, curseSeen:[],
    // CAS-450: CONQUISTA + WORLD TIER (NG+ ligero). `tier` is the DURABLE world tier
    // (1..WORLD_TIER.cap — survives death, persisted additively); `bossesDown` tracks the
    // CONQUEST_ZONES whose climax fell THIS cycle (resets the instant the 4th falls → apex).
    conquest:{ tier:1, bossesDown:[] },
    // gear: 3 equipped slots (instances by id) + a bag of loose instances. Stats
    // are resolved from data (sim/gear.js), never stored — see equippedDmg/Def.
    equip:{ weapon:{slot:"weapon",defId:"w_iron",rarity:"common"}, body:{slot:"body",defId:"a_leather",rarity:"common"}, shield:{slot:"shield",defId:"s_wood",rarity:"common"} },
    bag:[],
    potHP:2, potMP:1, blessings:0,
    // CAS-237: forge material ("mena"). The forge gold-sink's second currency — dripped by
    // hunting (elites/champions/bosses + a trash trickle) and daily contracts (grantMats /
    // applyMetaReward). Durable, persisted additively (no SAVE_VERSION bump). No RNG.
    mats:0,
    // CAS-192: combat-consumable inventory (data-driven, CONSUMABLES). Quantities are
    // persisted additively; consumSel = the slot bound to the use key; consumCD = the
    // PER-CONSUMABLE cooldown map (id→seconds), so using furia never locks out antídoto.
    // A small starter stash makes the slot legible from minute one. consumCD is transient.
    consum:{fury:0, antidote:1, greater:1}, consumSel:0, consumCD:{},
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
    // CAS-375: per-mob-type lifetime kill tally (e.g. {wendigo:5,quillback:3}) → drives the
    // directed "slay N <type>" Hunt Contracts. Same additive, observer-only contract as
    // `kills`: gameplay never reads it, so no balance/determinism touch, no SAVE_VERSION bump.
    killsByType:{},
    // CAS-149: monotonic lifetime ELITE-class kills (ambush elites + champions + final boss).
    // Drives the persistent Elite-Mastery rank; saved additively (no SAVE_VERSION bump).
    eliteKills:0,
    // CAS-150: cached Elite-Mastery REWARD-TRACK perk bundle, derived from eliteKills (never
    // stored — recomputed by recalcMastery on load + every elite kill). Combat reads it hot.
    // Named `mperk` (NOT `mp` — that's mana) to avoid the mana field collision.
    mperk:zeroMP(),
    respawn:{x:world.templeF.x, y:world.templeF.y+TS} };
}
function xpForLevel(l){ return Math.floor(40*Math.pow(l,1.55)); }

// Per-zone hunt-contract progress, built fresh from HUNTS data each run.
//   kills   — enemies culled toward the quota
//   champ   — the live Champion entity while it is summoned (null otherwise)
//   cleared — zone payoff already claimed (stops further tracking)
function initHunts(){ const o={}; for(const z in HUNTS) o[z]={kills:0, champ:null, cleared:false}; return o; }

// ------------------------ CAS-383: BOON DRAFT ------------------------------
// Aggregate the drafted boons (BOONS data, config.js) into ONE cached bundle read by the
// hot combat paths. Additive fields SUM; the two multiplier fields MULTIPLY; onKillHaste
// takes the max. All totals are CLAMPED here — this is the balance guardrail (AC #5): a
// stack can deepen a build but never trivialize the game (guaranteed-crit / infinite-heal
// loops are capped). A boonless hero yields the zero bundle → every hook is a no-op → the
// combat baseline is byte-identical. Called on draft pick + on save load.
// CAS-388: `trail`/`onKillNova` are the two legendary keystones; `syn` lists the currently
// active synergy ids (HUD read only — never a hot-path allocation, rebuilt on pick/load only).
function zeroBB(){ return { crit:0, hpMul:1, moveMul:1, defAdd:0, iframeAdd:0, lifesteal:0, reflect:0,
  onKillHeal:0, onKillHaste:0, burn:0, poison:0, chain:0, loot:0, trail:0, onKillNova:0, syn:[] }; }
function recalcBoons(h){ if(!h) return; const bb=zeroBB(); const list=h.boons||[];
  for(const id of list){ const b=BOON_MAP[id]; if(!b) continue;
    bb.crit+=b.crit||0; bb.defAdd+=b.defAdd||0; bb.iframeAdd+=b.iframeAdd||0;
    bb.lifesteal+=b.lifesteal||0; bb.reflect+=b.reflect||0;
    bb.onKillHeal+=b.onKillHeal||0; bb.onKillHaste=Math.max(bb.onKillHaste,b.onKillHaste||0);
    bb.burn+=b.burn||0; bb.poison+=b.poison||0; bb.chain+=b.chain||0; bb.loot+=b.loot||0;
    // CAS-388: legendary keystones DON'T stack additively (a run-defining effect, one copy is
    // full-strength) — take the max so a re-draft can't runaway-scale them.
    bb.trail=Math.max(bb.trail,b.trail||0); bb.onKillNova=Math.max(bb.onKillNova,b.onKillNova||0);
    if(b.hpMul) bb.hpMul*=b.hpMul; if(b.moveMul) bb.moveMul*=b.moveMul; }
  // CAS-388: SYNERGIES — an owned PAIR multiplies its field BEFORE the clamps, so an emergent
  // bonus deepens a build but still cannot pierce the crit/lifesteal/reflect ceilings below.
  { const owned=new Set(list);
    for(const s of SYNERGIES){ if(s.need.every(id=>owned.has(id))){ bb.syn.push(s.id);
      for(const k in s.mul) bb[k]=(bb[k]||0)*s.mul[k]; } } }
  // guardrail clamps — keep every stacked total on-curve (see config BOONS note)
  bb.crit=Math.min(bb.crit,60);          // never guaranteed-crit from boons alone
  bb.lifesteal=Math.min(bb.lifesteal,0.5);
  bb.reflect=Math.min(bb.reflect,1.5);
  bb.onKillHeal=Math.min(bb.onKillHeal,0.10);
  bb.chain=Math.min(bb.chain,3);
  bb.loot=Math.min(bb.loot,2.5);
  bb.burn=Math.min(bb.burn,1.0);         // CAS-388: DoT-conversion ceilings (synergy-safe)
  bb.poison=Math.min(bb.poison,1.0);
  bb.trail=Math.min(bb.trail,0.6);       // CAS-388: keystone ceilings
  bb.onKillNova=Math.min(bb.onKillNova,0.8);
  bb.hpMul=Math.max(0.5,Math.min(bb.hpMul,2.5));
  bb.moveMul=Math.min(bb.moveMul,1.6);
  h.bb=bb;
  const m=heroMaxHp(h); if(h.hp>m) h.hp=m; // a -maxHP pick must not leave HP over the new cap
}
// Sanitize an untrusted persisted boon list into legal ids (drop unknowns; cap length so a
// corrupt blob can't bloat the bundle). Order preserved. Mirrors sanitizeTalents.
function sanitizeBoons(arr){ const out=[]; if(!Array.isArray(arr)) return out;
  for(const id of arr){ if(BOON_MAP[id]) out.push(id); if(out.length>=40) break; } return out; }
export function bbLoot(){ return (G.hero&&G.hero.bb)?G.hero.bb.loot:0; } // Codicia luck for rollGearInst
// CAS-450: read-only Conquista/World-Tier snapshot — consumed by the HUD trophy chips
// (game.js hudSnapshot) + harnesses. Pure view, never mutates.
export function conquestSnap(){ const h=G.hero; const cq=(h&&h.conquest)||{tier:1,bossesDown:[]};
  const down=cq.bossesDown||[];
  return { tier:cq.tier||1, cap:WORLD_TIER.cap,
    zones:CONQUEST_ZONES.map(z=>({ zone:z, down:down.indexOf(z)>=0 })) }; }

// CAS-388/392: RARITY-WEIGHTED draw of `n` DISTINCT boon ids off the sim RNG. depth = #owned
// boons (each prior champion clear added one), so the pool skews rarer the deeper the run runs.
// Weighted-WITHOUT-replacement (splice the pick out) keeps the cards distinct; owned boons stay
// eligible (re-drafting deepens). CAS-392: `banished` ids are removed from the pool up front, so
// a banished boon can never resurface in any later draw/reroll of the run. srand() only →
// deterministic / Stage-2-ready, SAME rarity model for the initial draw AND rerolls (no exploit).
// CAS-394: `cursed` (the draft follows a cursed-zone clear) biases the draw UP one tier — it adds
// CURSE_DEPTH_BONUS to the effective depth (raising rare/legendary weights via boonRarityWeight)
// AND guarantees ≥1 rare+ card (ensureRarePlus back-fills one slot from the rare+ subpool if the
// weighted draw happened to roll all commons). Legendary odds stay inside their weight cap → no
// flood. The flag rides on G.draft so a reroll of a cursed draft keeps the floor.
// CAS-450: `apex` (the draft follows a full-conquest cycle) is the richest hand in the game —
// it adds WORLD_TIER.apexDepth to the effective depth and GUARANTEES ≥1 legendary card
// (ensureLegendary, same back-fill shape as the cursed rare+ floor). The world tier itself
// also deepens every draft (depthPer per tier above 1) — the loot payoff of climbing. Both
// are 0 at tier 1 / non-apex, so the baseline draw is untouched (same weights, same draws).
function drawBoonChoices(h,n,cursed,apex){
  const wt=((h.conquest&&h.conquest.tier)||1)-1;
  const depth=((h.boons&&h.boons.length)||0)+(cursed?CURSE_DEPTH_BONUS:0)
    +(apex?WORLD_TIER.apexDepth:0)+(wt>0?wt*WORLD_TIER.depthPer:0);
  const banned=(h.banished&&h.banished.length)?new Set(h.banished):null;
  const pool=banned?BOONS.filter(b=>!banned.has(b.id)):BOONS.slice();
  const picks=[]; n=Math.min(n||BOON_DRAFT_N,pool.length);
  for(let i=0;i<n;i++){
    let total=0; for(const b of pool) total+=boonRarityWeight(b.rarity,depth);
    let r=srand()*total, idx=0;
    for(let j=0;j<pool.length;j++){ r-=boonRarityWeight(pool[j].rarity,depth); if(r<=0){ idx=j; break; } idx=j; }
    picks.push(pool.splice(idx,1)[0].id);
  }
  if(apex) return ensureLegendary(h,picks,depth);
  return cursed?ensureRarePlus(h,picks,depth):picks;
}
// CAS-394: guarantee the cursed-zone draft surfaces at least one rare-or-better card. If the
// weighted draw already contains a rare+ pick, it's untouched. Otherwise the LAST slot is replaced
// by a weighted draw restricted to the rare+ subpool (excluding the kept cards + banished ids), so
// the floor is exactly "one card, one tier up" — never a legendary flood, and banish is honoured.
// No-op if the rare+ pool is empty (every rare+ banished) → the hand simply stays all-common.
function ensureRarePlus(h,picks,depth){
  if(picks.some(id=>{ const b=BOON_MAP[id]; return b&&b.rarity!=="common"; })) return picks;
  const banned=(h.banished&&h.banished.length)?new Set(h.banished):null;
  const keep=new Set(picks.slice(0,-1));
  const pool=BOONS.filter(b=>b.rarity!=="common" && !keep.has(b.id) && !(banned&&banned.has(b.id)));
  if(!pool.length) return picks;
  let total=0; for(const b of pool) total+=boonRarityWeight(b.rarity,depth);
  let r=srand()*total, idx=0;
  for(let j=0;j<pool.length;j++){ r-=boonRarityWeight(pool[j].rarity,depth); if(r<=0){ idx=j; break; } idx=j; }
  picks[picks.length-1]=pool[idx].id;
  return picks;
}
// CAS-450: guarantee the APEX draft surfaces at least one LEGENDARY card — the ceremony payoff
// of a full conquest cycle. Same back-fill shape as ensureRarePlus: if the weighted draw already
// rolled a legendary it's untouched; otherwise the LAST slot is replaced by a weighted draw
// restricted to the legendary subpool (kept cards + banished honoured). If every legendary is
// banished the hand falls back to the rare+ floor — banish stays a real commitment.
function ensureLegendary(h,picks,depth){
  if(picks.some(id=>{ const b=BOON_MAP[id]; return b&&b.rarity==="legendary"; })) return picks;
  const banned=(h.banished&&h.banished.length)?new Set(h.banished):null;
  const keep=new Set(picks.slice(0,-1));
  const pool=BOONS.filter(b=>b.rarity==="legendary" && !keep.has(b.id) && !(banned&&banned.has(b.id)));
  if(!pool.length) return ensureRarePlus(h,picks,depth);
  let total=0; for(const b of pool) total+=boonRarityWeight(b.rarity,depth);
  let r=srand()*total, idx=0;
  for(let j=0;j<pool.length;j++){ r-=boonRarityWeight(pool[j].rarity,depth); if(r<=0){ idx=j; break; } idx=j; }
  picks[picks.length-1]=pool[idx].id;
  return picks;
}
// Draw ONE boon id at current depth odds, excluding an id Set (kept cards) + all banished ids.
// Used by banish back-fill so the two cards the player KEEPS stay put and only the freed slot
// refills. Returns null if the pool is exhausted (→ hand shrinks by one).
function drawOneBoon(h,exclude){
  const depth=(h.boons&&h.boons.length)||0;
  const banned=h.banished&&h.banished.length?h.banished:null;
  const pool=BOONS.filter(b=>!exclude.has(b.id) && !(banned&&banned.indexOf(b.id)>=0));
  if(!pool.length) return null;
  let total=0; for(const b of pool) total+=boonRarityWeight(b.rarity,depth);
  let r=srand()*total, idx=0;
  for(let j=0;j<pool.length;j++){ r-=boonRarityWeight(pool[j].rarity,depth); if(r<=0){ idx=j; break; } idx=j; }
  return pool[idx].id;
}
// Open the 3-card draft after a zone champion clear. Pauses into the "draft" scene;
// input.js/render.js own the card UI (incl. CAS-392 reroll/banish controls).
// CAS-450: `apex` marks the full-conquest ceremony draft — guaranteed legendary
// (drawBoonChoices → ensureLegendary) and, after the pick resolves, the World-Tier
// ascend offer (pickBoon → offerAscend). The flag rides on G.draft so a reroll keeps
// the legendary floor and the ascend hand-off survives rerolls/banishes.
function openDraft(source,apex){ const h=G.hero; if(!h) return;
  // CAS-394: a draft opened after clearing a CURSED zone is biased up one tier (guaranteed rare+).
  // The flag rides on G.draft.cursed so a reroll keeps the floor. `source` is the zone id.
  const cursed=!!(h.curses && source && h.curses[source]);
  G.draft={ choices:drawBoonChoices(h,BOON_DRAFT_N,cursed,apex), sel:0, source:source||"", cursed, apex:!!apex }; G.draftSel=0; G.scene="draft";
  audio&&audio.sfx&&audio.sfx.levelup&&audio.sfx.levelup();
}
// CAS-392: spend the run's single reroll charge to re-draw ALL cards at the SAME depth-scaled
// odds (drawBoonChoices → identical rarity model, so a reroll can never farm legendaries). No-op
// (returns false) when the charge is spent or no draft is open — the rarity curve QA validated on
// CAS-391 is untouched because the weights and RNG stream are the same as the initial draw.
export function rerollDraft(){ const h=G.hero, d=G.draft; if(!h||!d||G.scene!=="draft") return false;
  if(!(h.rerollLeft>0)) return false;
  h.rerollLeft--;
  d.choices=drawBoonChoices(h,BOON_DRAFT_N,d.cursed,d.apex); d.sel=0; G.draftSel=0; // CAS-394/450: keep the cursed rare+ / apex legendary floor across a reroll
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
  return true;
}
// CAS-392: spend the run's single banish charge to remove card `i` from the current draft AND
// from this run's future pool (added to `banished` → excluded from every later draw/reroll). The
// two OTHER cards are KEPT; only the freed slot back-fills with a fresh weighted draw, so banish
// is a TARGETED removal (not a full reroll) that biases the pool toward the player's build. No-op
// when the charge is spent, no draft is open, or the card id is invalid.
export function banishBoon(i){ const h=G.hero, d=G.draft; if(!h||!d||G.scene!=="draft") return false;
  if(!(h.banishLeft>0)) return false;
  i=i|0; const id=d.choices[i]; if(!id||!BOON_MAP[id]) return false;
  h.banishLeft--;
  if(!h.banished) h.banished=[]; if(h.banished.indexOf(id)<0) h.banished.push(id);
  const keep=new Set(); for(let j=0;j<d.choices.length;j++){ if(j!==i) keep.add(d.choices[j]); }
  const repl=drawOneBoon(h,keep);
  if(repl) d.choices[i]=repl; else d.choices.splice(i,1); // pool exhausted → hand drops to 2 cards
  d.sel=Math.max(0,Math.min(d.choices.length-1,d.sel||0)); G.draftSel=d.sel;
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
  return true;
}
// Apply the chosen card: push the boon (stacking), rebuild the bundle, resume play.
export function pickBoon(i){ const h=G.hero, d=G.draft; if(!h||!d||G.scene!=="draft") return false;
  const id=d.choices[i]; const b=id&&BOON_MAP[id]; if(!b) return false;
  h.boons.push(id); recalcBoons(h);
  // CAS-272 (juice v2): the pick PAYS OFF by tier — floater/aura take the rarity colour and the
  // existing rarity-scaled loot jingle plays (reused synth, no new audio); a legendary lands like
  // a level-up (ring + ember burst + a small shake). Presentation only: the boon was applied
  // above unchanged, fx draw from the fx RNG stream (frr) like level-ups — zero sim-RNG draws,
  // zero balance. shakeAdd/rmCount are already reduce-motion-gated (CAS-127/265).
  const rar=(BOON_RARITY&&BOON_RARITY[b.rarity])||null, rcol=(rar&&rar.col)||"#ffd24d";
  const leg=b.rarity==="legendary";
  floater(h.x,h.y-40,b.glyph+" "+b.name,rcol,{pop:leg?1.9:(b.rarity==="rare"?1.6:1.5),life:1.3});
  addFx&&addFx("buffaura",h.x,h.y,{col:rcol,life:0.6});
  audio&&audio.sfx&&audio.sfx.loot&&audio.sfx.loot(leg?3:(b.rarity==="rare"?2:1));
  if(leg){ addFx("lvlring",h.x,h.y,{life:0.7}); shakeAdd(2.5);
    for(let k=0,n=rmCount(8);k<n;k++) addFx("flame",h.x+frr(-24,24),h.y+frr(-28,10)); }
  const wasApex=!!d.apex;
  G.draft=null; G.scene="play";
  // CAS-450: an APEX draft (full conquest cycle) chains into the opt-in World-Tier ascend
  // offer once the boon is banked. Below the cap only — at tier 5 the apex payoff itself
  // (legendary draft + tier-bumped gear) remains the repeatable ceiling reward.
  if(wasApex) offerAscend();
  return true;
}

// ----------------------- CAS-394: OPT-IN ZONE MODIFIER ("Maldición") -----------------------
// Read the accepted modifier for a zone (or null). Cheap + allocation-free — called on the hot
// spawn path (applyZoneScale / maybeAffix) so it must stay a plain map lookup, no work when the
// zone isn't cursed (the overwhelmingly common case → zero cost on an un-cursed run).
function curseMods(zone){ const h=G.hero; if(!h||!h.curses||!zone) return null; const id=h.curses[zone]; return id?(ZONE_MOD_MAP[id]||null):null; }
// Fire the one-per-zone entry offer. Called from update() when the hero first steps into a combat
// zone that still has an uncleared hunt. Rolls ONE modifier off the sim RNG (deterministic /
// Stage-2 ready), pauses into the "curse" scene, and marks the zone SEEN so it never re-prompts —
// accept or skip, the zone is offered exactly once per run.
function offerCurse(zone){ const h=G.hero; if(!h) return;
  if(!h.curseSeen) h.curseSeen=[]; if(h.curseSeen.indexOf(zone)<0) h.curseSeen.push(zone);
  const mod=ZONE_MODIFIERS[ri(0,ZONE_MODIFIERS.length-1)];
  G.curse={ zone, mod:mod.id }; G.scene="curse";
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
}
// Accept the pending offer → the zone is cursed for the rest of the run (its enemies scale up and
// its clear reward upgrades). Resumes play. No-op if no offer is open.
export function acceptCurse(){ const h=G.hero, c=G.curse; if(!h||!c||G.scene!=="curse") return false;
  if(!h.curses) h.curses={}; h.curses[c.zone]=c.mod;
  const m=ZONE_MOD_MAP[c.mod];
  toast(STR.curseAccepted(m?m.name:""),3.0);
  floater(h.x,h.y-40,(m?m.glyph+" ":"")+(m?m.name:""),"#ff7a5d",{pop:1.4,life:1.4});
  audio&&audio.sfx&&audio.sfx.boss&&audio.sfx.boss();
  G.curse=null; G.scene="play"; return true;
}
// Skip the pending offer → the zone is untouched (already marked seen, so it won't re-prompt).
export function skipCurse(){ const h=G.hero, c=G.curse; if(!h||!c||G.scene!=="curse") return false;
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
  G.curse=null; G.scene="play"; return true;
}

// ----------------------- CAS-450: WORLD-TIER ASCEND OFFER -----------------------
// Fired from pickBoon after an APEX draft resolves (full conquest cycle banked). Pauses into
// the "ascend" scene — accept climbs one World Tier, decline stays put; either way the player
// can re-decide after the NEXT full clear (the cycle tracker already reset when apex fired).
// No offer at the cap: tier 5 keeps the apex payoff as the repeatable ceiling. No RNG here.
function offerAscend(){ const h=G.hero; if(!h||!h.conquest) return;
  const t=h.conquest.tier||1; if(t>=WORLD_TIER.cap) return;
  G.ascend={ tier:t+1 }; G.scene="ascend";
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
}
// Accept → worldTier++ and the world RE-ARMS for the new cycle: hunt board re-inits (H.cleared/
// champ/quota reset → every climax is summonable again) and the per-run curse layer clears
// (accepted mods + seen list → the entry offers re-fire per zone). All scaling reads the new
// tier lazily at spawn time (applyZoneScale / spawnChampion / maybeAffix / drawBoonChoices),
// so already-live enemies keep their stats — only the re-armed world escalates. No RNG.
export function acceptAscend(){ const h=G.hero, a=G.ascend; if(!h||!a||G.scene!=="ascend") return false;
  const cq=h.conquest||(h.conquest={tier:1,bossesDown:[]});
  cq.tier=Math.min(WORLD_TIER.cap, (cq.tier||1)+1);
  cq.bossesDown.length=0;
  G.hunts=initHunts();
  h.curses={}; if(h.curseSeen) h.curseSeen.length=0; else h.curseSeen=[]; G.curse=null;
  toast(STR.ascendAccepted(cq.tier),3.6);
  floater(h.x,h.y-40,"★ "+STR.ascendName(cq.tier),"#ffd24d",{pop:1.9,life:1.5});
  audio&&audio.sfx&&audio.sfx.boss&&audio.sfx.boss();
  for(let i=0,n=rmCount(12);i<n;i++) addFx("flame",h.x+frr(-30,30),h.y+frr(-34,12));
  G.ascend=null; G.scene="play"; return true;
}
// Decline → stay on the current tier. The cycle tracker already reset when apex fired, so the
// next full clear re-runs the apex ceremony AND re-offers the climb — a real re-decision.
export function declineAscend(){ const h=G.hero, a=G.ascend; if(!h||!a||G.scene!=="ascend") return false;
  audio&&audio.sfx&&audio.sfx.click&&audio.sfx.click();
  G.ascend=null; G.scene="play"; return true;
}
// The current World-Tier post-spawn multipliers, or null at tier 1 — the null path keeps the
// baseline allocation-free and byte-identical (the CAS-394 curse-layer pattern). Pure math.
function worldTierMods(){ const h=G.hero; const t=(h&&h.conquest&&h.conquest.tier)||1;
  if(t<=1) return null; const k=t-1;
  return { hpMul:1+WORLD_TIER.hpPct*k, dmgMul:1+WORLD_TIER.dmgPct*k, affixMul:1+WORLD_TIER.affixPct*k };
}

// creates the hero and enters play (audio/music wiring stays in the controller)
export function createHero(name,cls){ G.hero=newHero(name||"Héroe",cls); G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false}; G.scene="play"; G.started=true;
  beginRun();                                                   // CAS-277: first run baseline for the recap
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
  const af=safeAffixes(inst.affixes); if(af) o.affixes=af;
  const fl=forgeLevel(inst); if(fl>0) o.fl=fl;   // CAS-237: persist clamped forge level (0 omitted)
  return o; }
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
    // CAS-237: durable forge material. Additive — old saves lack it → default 0 — so no
    // SAVE_VERSION bump / progress wipe. Equipped/bag forge LEVELS persist on the gear
    // instances themselves (equip/bag below, validated by safeInst on load).
    mats:h.mats||0,
    // CAS-192: combat-consumable stash + selected slot. Additive — old saves lack these
    // and rehydrate from the newHero defaults, so no SAVE_VERSION bump / progress wipe.
    consum:Object.assign({},h.consum), consumSel:h.consumSel|0,
    // CAS-119: durable build choices. Additive — old v1 saves simply lack these and
    // rehydrate with an empty tree (0 spent), so no SAVE_VERSION bump / progress wipe.
    talents:Object.assign({},h.talents), talentPts:h.talentPts||0,
    // CAS-123: durable Stage-1 arc state. Additive (old saves lack these → default to a
    // fresh, unfinished run), so no SAVE_VERSION bump / progress wipe.
    stage1:!!h.stage1, playT:h.playT||0, deaths:h.deaths||0,
    // CAS-134: durable lifetime tallies for the daily-contract observer. Additive — old
    // saves lack them → default 0 — so no SAVE_VERSION bump / progress wipe.
    kills:h.kills||0, champKills:h.champKills||0,
    // CAS-375: persist the per-type tally so directed bounties survive reloads (additive).
    killsByType:h.killsByType||{},
    // CAS-383: persist the CURRENT-run drafted boons so a same-run reload keeps the build.
    // Additive — old saves lack it → empty list → zero bundle. A death/new run wipes them
    // (respawn/createHero), so a fresh run never inherits a prior run's boons.
    boons:(h.boons||[]).slice(),
    // CAS-392: persist the run's draft-agency charges + banished pool so a same-run reload (e.g. a
    // refresh mid-draft) keeps them. Additive — old saves lack them → default to a fresh 1/1 budget
    // + empty banished. Reset on death/new run (respawn) like boons, so nothing leaks across runs.
    rerollLeft:h.rerollLeft|0, banishLeft:h.banishLeft|0, banished:(h.banished||[]).slice(),
    // CAS-394: persist the per-run accepted zone modifiers + offered-zone list so a same-run reload
    // keeps them (a refresh mid-run doesn't re-offer or drop a curse). Additive — old saves lack them
    // → no curses / fresh offers → no SAVE_VERSION bump. Reset on death/new run like boons.
    curses:Object.assign({},h.curses||{}), curseSeen:(h.curseSeen||[]).slice(),
    // CAS-450: persist the Conquista/World-Tier state. Additive — old saves lack it → tier 1,
    // empty cycle → no SAVE_VERSION bump. The tier is DURABLE meta-progression (survives death,
    // like stage1); bossesDown is the current cycle (also survives death — the hunt board only
    // re-arms on reload/ascend, so a death mid-cycle keeps the trophies already earned).
    conquest:{ tier:(h.conquest&&h.conquest.tier)||1, bossesDown:((h.conquest&&h.conquest.bossesDown)||[]).slice() },
    // CAS-149: durable lifetime elite-kill counter → Elite-Mastery rank. Additive (old
    // saves lack it → default 0 → rank 0), so no SAVE_VERSION bump / progress wipe. The
    // permanent +maxHp granted at each rank-up is already baked into the saved maxHp above,
    // so the bonus is restored with maxHp and is NEVER re-applied on load (no double-count).
    eliteKills:h.eliteKills||0,
    // CAS-169: durable character-customization look. Additive — old saves simply lack
    // these and rehydrate on the class default look, so NO SAVE_VERSION bump / progress
    // wipe (bumping would discard every live player's progress; an additive+guarded field
    // preserves it and is fully reversible). Pure cosmetics: never read by sim/combat.
    palette:Object.assign({},h.palette), variation:Object.assign({},h.variation),
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
    h.mats=Math.max(0,Math.floor(num(d.mats,0))); // CAS-237: forge material (absent in old saves → 0)
    // CAS-192: rehydrate the consumable stash (clamped per known id; unknown keys
    // ignored; absent in old saves → keep newHero defaults). Selection clamped in range.
    if(d.consum && typeof d.consum==="object"){ for(const c of CONSUMABLES) h.consum[c.id]=Math.max(0,Math.floor(num(d.consum[c.id], h.consum[c.id]||0))); }
    h.consumSel=Math.min(CONSUMABLES.length-1, Math.max(0, Math.floor(num(d.consumSel,0))));
    if(d.equip){ for(const slot of ["weapon","body","shield"]){ const ok=safeInst(d.equip[slot]); if(ok) h.equip[slot]=ok; } }
    if(Array.isArray(d.bag)) h.bag=d.bag.map(safeInst).filter(Boolean).slice(0,16);
    // CAS-119: rebuild a LEGAL talent tree from the (untrusted) blob + recompute the
    // cached bundle, so persisted builds survive reload and corrupt data can't break it.
    h.talents=sanitizeTalents(d.talents, h.cls); h.talentPts=Math.max(0,Math.floor(num(d.talentPts,0))); recalcTalents(h);
    // CAS-123: rehydrate the Stage-1 arc (clamped; absent in old saves → fresh run).
    h.stage1=!!d.stage1; h.playT=Math.max(0,num(d.playT,0)); h.deaths=Math.max(0,Math.floor(num(d.deaths,0)));
    h.kills=Math.max(0,Math.floor(num(d.kills,0))); h.champKills=Math.max(0,Math.floor(num(d.champKills,0))); // CAS-134
    // CAS-375: rehydrate per-type tally (sanitized to non-negative ints; absent in old saves → {}).
    h.killsByType={}; if(d.killsByType && typeof d.killsByType==="object"){ for(const k in d.killsByType){ const v=Math.max(0,Math.floor(num(d.killsByType[k],0))); if(v>0) h.killsByType[k]=v; } }
    h.eliteKills=Math.max(0,Math.floor(num(d.eliteKills,0))); // CAS-149 (rank derives; maxHp already carries the baked bonus)
    h.boons=sanitizeBoons(d.boons); recalcBoons(h); // CAS-383: rehydrate current-run boons (validated ids) + rebuild bundle BEFORE heroMaxHp reads it
    // CAS-392: rehydrate the draft-agency budget + banished pool (clamped; absent in old saves →
    // fresh 1/1). banished re-validated against BOON_MAP (sanitizeBoons) so a corrupt blob can't
    // poison the pool with unknown ids.
    h.rerollLeft=Math.max(0,Math.floor(num(d.rerollLeft,1))); h.banishLeft=Math.max(0,Math.floor(num(d.banishLeft,1))); h.banished=sanitizeBoons(d.banished);
    // CAS-394: rehydrate the per-run zone modifiers (validated: zone must be a HUNTS key, mod must be
    // a known ZONE_MOD id) + the offered-zone list (validated HUNTS keys). Absent in old saves → none.
    h.curses={}; if(d.curses && typeof d.curses==="object"){ for(const zk in d.curses){ if(HUNTS[zk] && ZONE_MOD_MAP[d.curses[zk]]) h.curses[zk]=d.curses[zk]; } }
    h.curseSeen=Array.isArray(d.curseSeen)?d.curseSeen.filter(zk=>!!HUNTS[zk]):[];
    // CAS-450: rehydrate Conquista/World-Tier (validated: tier clamped 1..cap; bossesDown
    // filtered to CONQUEST_ZONES + deduped, capped at the set size). Absent in old saves →
    // tier 1 / empty cycle (the newHero default stands).
    if(d.conquest && typeof d.conquest==="object"){
      h.conquest.tier=Math.min(WORLD_TIER.cap, Math.max(1, Math.floor(num(d.conquest.tier,1))));
      const seen=new Set();
      if(Array.isArray(d.conquest.bossesDown)) for(const zk of d.conquest.bossesDown){
        if(CONQUEST_ZONES.indexOf(zk)>=0 && !seen.has(zk) && seen.size<CONQUEST_ZONES.length) seen.add(zk); }
      h.conquest.bossesDown=Array.from(seen);
    }
    h.palette=sanitizePalette(d.palette, h.cls); h.variation=sanitizeVariation(d.variation); // CAS-169 cosmetics (validated, class-default fallback)
    recalcMastery(h);  // CAS-150: rebuild the reward-track perk bundle from the loaded count BEFORE heroMaxHp reads it
    h.hp=heroMaxHp(h); h.mp=h.maxMp;                       // always respawn at full
    // CAS-128: resume an in-progress tutorial (clamped); a finished/absent one stays off.
    if(d.tut && typeof d.tut.i==="number"){ startTutorial(); G.tut.i=Math.max(0,Math.min(TUT_STEPS.length-1,Math.floor(d.tut.i))); }
    else G.tut=null;
    G.hero=h; G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false};
    if(d.quest){ G.quest.wolves=Math.max(0,Math.floor(num(d.quest.wolves,0))); G.quest.done=!!d.quest.done; G.quest.rewarded=!!d.quest.rewarded; }
    G.scene="play"; G.started=true;
    beginRun();                                               // CAS-277: baseline this resumed session's run
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
const MAX_FLOATERS=64, MAX_FX=140, _floatPool=[]; let _floatSeq=0;
function floater(x,y,txt,col,opt){
  if(G.floaters.length>=MAX_FLOATERS) _floatPool.push(G.floaters.shift()); // recycle the oldest into the pool
  const f=_floatPool.pop()||{};
  f.x=x; f.y=y; f.txt=txt; f.col=col||C_CREAM; f.t=0;
  f.life=(opt&&opt.life)||0.9; f.pop=(opt&&opt.pop)||1; f.small=!!(opt&&opt.small); f.crit=!!(opt&&opt.crit);
  // CAS-273: fan rapid stacked numbers across a fixed 3-lane offset so back-to-back hits
  // on the same target stay readable instead of overprinting. Pure presentation: a render-only
  // counter, not sim RNG/state → Stage-2 deterministic.
  f.dx=((_floatSeq++ % 3) - 1) * 6;
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
  if(world.blockSet && world.blockSet.has(ty*MAP_W+tx)) return true; // CAS: enterable-house walls
  // CAS-397: only scan buckets within reach (r + largest solid radius) of the point.
  const reach=r+solidMaxR;
  const c0=Math.floor((x-reach)/SGRID_CELL), c1=Math.floor((x+reach)/SGRID_CELL);
  const b0=Math.floor((y-reach)/SGRID_CELL), b1=Math.floor((y+reach)/SGRID_CELL);
  for(let by=b0;by<=b1;by++) for(let bx=c0;bx<=c1;bx++){
    const arr=solidGrid.get(by*SGRID_W+bx); if(!arr) continue;
    for(const s of arr){ if(dist2(x,y,s.x,s.y) < (r+s.r)*(r+s.r)) return true; }
  }
  return false;
}
function moveEnt(e,dx,dy,r){
  if(!solidBlocked(e.x+dx,e.y,r)) e.x+=dx;
  if(!solidBlocked(e.x,e.y+dy,r)) e.y+=dy;
}

// ----------------------------- spawning --------------------------------
function spawnEnemy(type,x,y){
  const tpl=ETPL[type]; const e={type, x,y, hp:tpl.hp, maxHp:tpl.hp, tpl, state:"idle", st:0,
    gaitPhase:(x*0.7+y*0.9), // CAS-240: STATIC per-mob gait desync offset, frozen at spawn pos. Render must NOT recompute from live e.x/e.y (movement swamps gait.w/gait.fps → CAS-222 slowdown invisible while moving).
    vx:0,vy:0, facing:0, wt:0, hurtFlash:0, hitDone:false, phase:0, knockX:0,knockY:0, wanderX:x,wanderY:y, wanderT:0,
    stun:0, slow:1, slowT:0, dots:null}; // crowd-control sinks: stun freezes the AI, slow scales chase speed, dots = active DoTs (CAS-118); all time-based, no RNG
  G.enemies.push(e); return e;
}
// CAS-342: the legacy positional caves boss (spawnBoss) is removed — the dragon is now the caves
// ZONE CAPSTONE (HUNTS.caves.boss), summoned by spawnChampion when the kill quota is met, and
// carries its 6-anim rich rendering + breath through the shared capstone path. The dev.spawn hook
// still boss-ifies a directly-spawned dragon (isBoss path) for legacy harnesses; live play only
// ever sees the capstone. See HUNTS.caves in config.js.
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
  // CAS-394: an OPT-IN zone modifier layers ON TOP of the tier scaling — same knobs (hp/dmg/spd),
  // so it reuses the existing balance path with NO new AI. Only allocates a clone on a cursed zone.
  const cm=curseMods(zone);
  if(cm){ const b2=e.tpl;
    e.tpl=Object.assign({},b2,{ hp:Math.round(b2.hp*(cm.hpMul||1)), dmg:Math.round(b2.dmg*(cm.dmgMul||1)), spd:Math.round(b2.spd*(cm.spdMul||1)) });
    e.hp=e.maxHp=e.tpl.hp; }
  // CAS-450: the World-Tier layer stacks the same way (multiplicative, post-spawn, hp/dmg only —
  // speed stays readable). null at tier 1 → this whole branch is skipped and the baseline clone
  // above is byte-identical to pre-CAS-450. No RNG in any layer → the srand/rr draw order holds.
  const wtm=worldTierMods();
  if(wtm){ const b3=e.tpl;
    e.tpl=Object.assign({},b3,{ hp:Math.round(b3.hp*wtm.hpMul), dmg:Math.round(b3.dmg*wtm.dmgMul) });
    e.hp=e.maxHp=e.tpl.hp; }
  return e;
}

// CAS-247 — roll a deterministic ELITE AFFIX onto an eligible freshly-spawned trash mob. About
// MOB_AFFIX_RATE of eligible world spawns get exactly ONE affix (rolled on the sim RNG → fully
// deterministic / Stage-2 server-authority ready). Excludes bosses / hunt champions / ambush
// elites / neutrals / 0-dmg supports (summoner+healer) / the volatile bomber archetype — these
// already own a role and an affix on them reads as noise or a degenerate carrier. The modifiers
// bake onto a CLONE of the shared template (never the table row); the render hooks (e.affix +
// e.affixGait) draw the tint/glow/scale with NO new art. Swift scales gait WITH speed in render
// so footfalls stay natural (CAS-219/240). Reward boosts ride the cloned tpl through killEnemy's
// existing trash branch (xp/gold/gearChance), so the loot path needs no change.
function maybeAffix(e){
  if(!e || e.elite || e.champion || e.isBoss || e.tpl.neutral) return e;
  if((e.tpl.dmg||0)<=0 || e.tpl.arch==="volatile") return e;        // supports / bombers make degenerate carriers
  // CAS-394: a "swarm" zone modifier multiplies the elite-affix roll rate (reuses the SAME table +
  // roll, just a higher chance) — no new spawn logic. e.scaleZone was set by applyZoneScale above.
  let rate=MOB_AFFIX_RATE; const cm=curseMods(e.scaleZone); if(cm&&cm.affixMul) rate=Math.min(1,rate*cm.affixMul);
  // CAS-450: World Tier boosts the elite-affix rate the same way (loot bonus of climbing). The
  // srand() below draws UNCONDITIONALLY either way — only the threshold moves — so the sim RNG
  // stream is identical at every tier and byte-identical at tier 1.
  const wtm=worldTierMods(); if(wtm) rate=Math.min(1,rate*wtm.affixMul);
  if(srand()>=rate) return e;                                      // one srand per eligible spawn (only on the live world path, never in buildWorld → determinism fingerprint untouched)
  let pool=MOB_AFFIX_IDS;
  if(e.tpl.ranged) pool=MOB_AFFIX_IDS.filter(id=>!MOB_AFFIX[id].melee); // Vampiric needs contact → ranged kiters can't carry it
  return applyAffix(e, pool[ri(0,pool.length-1)]);
}
// Bake a SPECIFIC affix's modifiers onto a mob (clones the template — never the shared row).
// Split out of maybeAffix so the harness can force each affix deterministically (no RNG here).
function applyAffix(e, id){
  const A=MOB_AFFIX[id]; if(!e||!A) return e;
  const b=e.tpl, t=Object.assign({},b);
  if(A.spdMul)  t.spd=Math.max(1,Math.round(b.spd*A.spdMul));
  if(A.sizeMul) t.size=Math.max(1,Math.round(b.size*A.sizeMul));     // the "scale" cue — every draw path reads tpl.size
  t.hp=Math.round(b.hp*(A.hpMul||1.6));                              // a meatier, more-rewarding target
  t.xp=Math.round(b.xp*(A.xpMul||1.6));
  t.gold=[Math.round(b.gold[0]*(A.goldMul||1.6)), Math.round(b.gold[1]*(A.goldMul||1.6))];
  t.gearChance=Math.min(1,(b.gearChance||0)+(A.gearBonus||0));       // higher Forja-gear drop chance (CAS-237 tie-in)
  e.tpl=t; e.hp=e.maxHp=t.hp;
  e.affix=id; e.affixGait=A.gaitMul||1;                              // render: tint/glow colour by id + swift gait scale
  return e;
}

// CAS-197 — the ONE place the three atkspd sources (affixes CAS-117 + talents CAS-119 +
// the "furia" consumable CAS-192) are summed, clamped to the global cohesion ceiling
// ATKSPD_TOTAL_CAP so the independently-capped systems can't compound past intent. Both
// the swing formula and the harness read-out call this, so they can never drift apart.
export function heroAtkspd(h){ h=h||G.hero; if(!h) return 0;
  const s=affixTotals(h).atkspd+(h.tt?h.tt.atkspd:0)+(h.atkspdBuffT>0?h.atkspdBuffAmt:0);
  return s>ATKSPD_TOTAL_CAP?ATKSPD_TOTAL_CAP:s; }

// ------------------------------ combat ---------------------------------
function heroAttack(){
  const h=G.hero; if(h.atkCD>0||h.rolling||h.stun>0) return; // CAS-118: stun gates the swing
  tutMark("atk"); // CAS-128: a real swing teaches the attack step
  const cfg=ATK[h.cls||"warrior"]; const a=h.facing, ca=Math.cos(a), sa=Math.sin(a);
  const dmg=equippedDmg(h)*cfg.dmgMul;
  // CAS-117 affix + CAS-119 talent + CAS-192 "furia" consumable all add into the same
  // atkspd term that shortens the swing cooldown — one legible, deterministic formula.
  const atkspd=heroAtkspd(h);
  h.atkAng=a; h.atkAnim=CFG.atkCD; h.atkCD=cfg.cd/(1+atkspd/100); h._atkHits=new Set();
  if(cfg.type==="proj"){ h.atkT=0; audio.sfx.fire();
    G.projectiles.push({x:h.x+ca*18,y:h.y-2+sa*18,vx:ca*cfg.spd,vy:sa*cfg.spd,life:1.4,dmg,kind:cfg.kind,ang:a}); shakeAdd(2.4); }
  else if(cfg.type==="nova"){ h.atkT=0; audio.sfx.rune();
    for(const e of G.enemies){ if(e.dead) continue; const d=Math.hypot(e.x-h.x,e.y-h.y); if(d<=cfg.range+e.tpl.size){ hitEnemy(e,dmg,Math.atan2(e.y-h.y,e.x-h.x)); } }
    if(cfg.heal){ h.hp=Math.min(heroMaxHp(h),h.hp+cfg.heal); floater(h.x,h.y-30,"+"+cfg.heal,"#5fd66a"); }
    addFx("holynova",h.x,h.y,{r:cfg.range,life:0.5}); addFx("shockring",h.x,h.y,{r:cfg.range*0.8,life:0.4}); shakeAdd(6); }
  else { h.atkT=CFG.atkActive; h._mcfg=cfg; audio.sfx.sword(); shakeAdd(2.6);
    addFx("swing",h.x+ca*22,h.y-2+sa*22,{ang:a,fx:cfg.fx,life:0.26}); }
}
function applyHeroMelee(){
  const h=G.hero; const cfg=h._mcfg||ATK.warrior; const dmg=equippedDmg(h)*cfg.dmgMul;
  heroMeleeHit=true; // CAS-383: this swing's hits are melee → arm Sed de Sangre lifesteal
  for(const e of G.enemies){
    if(e.dead||h._atkHits.has(e)) continue;
    const d=Math.hypot(e.x-h.x,e.y-h.y); if(d>cfg.range+e.tpl.size) continue;
    const ang=Math.atan2(e.y-h.y,e.x-h.x);
    if(Math.abs(angDiff(ang,h.atkAng))<cfg.arc/2){
      h._atkHits.add(e); hitEnemy(e,dmg,h.atkAng); shakeAdd(5.5);
      // CAS-204: a bold crimson→white crescent sweeps through the struck enemy on a melee connect,
      // so the swing reads as cleaving INTO the target rather than next to it (FOUNTAINS slash juice).
      addFx("slashArc",e.x,e.y,{ang:h.atkAng,life:0.2});
    }
  }
  heroMeleeHit=false; // CAS-383: disarm — subsequent ranged/spell hits must not leech
}
// CAS-383: set true only across the melee-swing loop (applyHeroMelee), so the Sed de Sangre
// lifesteal boon leeches on melee connects but not on ranged/spell hits (all of which also
// funnel through hitEnemy). Module-scoped, reset immediately after the loop.
let heroMeleeHit=false;
// CAS-388: re-entrancy guard for the Núcleo Detonante keystone. A nova's own damage funnels
// through hitEnemy→killEnemy, which could re-trigger a nova → recursion. This flag limits it to
// ONE ring per originating kill (no chain-reaction explosion, no stack overflow, 60fps-safe).
let novaActive=false;
function hitEnemy(e,dmg,ang){
  // CAS-117: the "on-hit ligero" affix — a small flat bonus folded into EVERY
  // hero-sourced hit (melee/nova/proj/spell all funnel here). hitEnemy is the
  // hero→enemy damage path only, so this never touches enemy→hero damage.
  // CAS-119: talents read off the cached bundle (h.tt). onhit stacks with the affix
  // onhit; crit rolls on the sim RNG (srand) so it stays deterministic / Stage-2 ready.
  // RNG is consumed ONLY when the build actually has the stat, so a talentless hero
  // (smoke/determinism baseline) leaves the sequence byte-identical.
  const tt=G.hero?G.hero.tt:null;
  const bb=G.hero?G.hero.bb:null; // CAS-383: cached boon bundle
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
  // CAS-150: Elite-Mastery reward-track perks fold into the same chokepoint every hero hit
  // funnels through. dmgPct scales ALL hero damage; eliteDmgPct adds on top vs elite-class
  // targets (the headline anti-elite reward). Multiplicative, applied before the crit roll.
  const mk=G.hero?G.hero.mperk:null;
  if(mk){ let mul=1+(mk.dmgPct||0)/100;
    if((mk.eliteDmgPct||0)>0 && (e.elite||e.champion||e.isBoss)) mul+=(mk.eliteDmgPct||0)/100;
    if(mul!==1) dmg*=mul; }
  // Crit chance = talents + the "Instinto Asesino" milestone (mk.crit). RNG is consumed only
  // when the combined chance is >0, so a fresh hero (no talents, no milestones) stays byte-
  // identical for the determinism baseline.
  const critPct=(tt?tt.crit:0)+(mk?(mk.crit||0):0)+(bb?bb.crit:0); // CAS-383: Cristal Frágil crit
  let crit=false, riposted=false;
  // CAS-210: a live RIPOSTE window (armed by a perfect dodge) converts THIS hit into a
  // guaranteed crushing counter — forced crit × riposteMult — and is spent immediately. No
  // srand is consumed on this path, so it stays deterministic and never double-rolls with
  // the normal crit chance below. This is the souls-like read-and-punish payoff.
  if(G.hero && G.hero.riposte>0){ riposted=true; crit=true; G.hero.riposte=0;
    dmg*=CFG.riposteMult*(CRIT_BASE+((tt&&tt.critMult)||0)/100); }
  else if(critPct>0 && srand()*100<critPct){ crit=true; dmg*=(CRIT_BASE+((tt&&tt.critMult)||0)/100); }
  // CAS-247 ARMORED affix: a metallic-tinted elite absorbs a fixed fraction of EVERY incoming
  // hero hit (post-crit, so even a crit is blunted) — a damage-soak that makes it a tankier kill.
  { const af=e.affix&&MOB_AFFIX[e.affix]; if(af&&af.dmgReduce) dmg=Math.max(1,dmg*(1-af.dmgReduce)); }
  e.hp-=dmg; e.hurtFlash=0.16; audio.sfx.ehurt();
  // CAS-383 boon on-hit hooks (all funnel through this one chokepoint, so every hero hit is
  // covered). Sangre de Brasa / Toque Ponzoñoso CONVERT a fraction of the blow into a burn /
  // poison DoT (reuses applyStatus → the existing status stack/feedback). Sed de Sangre leeches
  // on MELEE connects only (heroMeleeHit flag). All deterministic (no srand).
  if(bb){
    if(bb.burn>0)   applyStatus(e,"burn",  {dmg:Math.max(1,Math.round(dmg*bb.burn))});
    if(bb.poison>0) applyStatus(e,"poison",{dmg:Math.max(1,Math.round(dmg*bb.poison))});
    if(heroMeleeHit && bb.lifesteal>0){ const h=G.hero; const mhp=heroMaxHp(h);
      if(h.hp<mhp){ const heal=Math.max(1,Math.round(dmg*bb.lifesteal)); h.hp=Math.min(mhp,h.hp+heal);
        floater(h.x,h.y-30,"+"+heal,"#ff5d8a",{small:true}); } }
  }
  // CAS-317: a rich-anim boss (dragon) plays a brief one-shot HURT flinch on a non-lethal
  // hit. Suppressed mid-attack (the animState resolver never overrides windup/strike) so a
  // committed swing reads through, and skipped on the killing blow (death takes over).
  if(e.tpl.richAnim && e.hp>0) e.hurtT=0.26;
  e.knockX+=Math.cos(ang)*e.tpl.knock; e.knockY+=Math.sin(ang)*e.tpl.knock;
  // CAS-127: crits read LOUDER — distinct bright SFX, a bigger popping number, an extra
  // shake kick. Normal hits get a subtle number pop. Pure feel (damage already applied).
  if(crit){ audio.sfx.crit(); floater(e.x,e.y-e.tpl.size,"¡"+Math.round(dmg)+"!","#ff5d5d",{crit:true,pop:1.9,life:1.05}); addFx("spark",e.x,e.y); shakeAdd(3.5);
    // CAS-204: a crit is a FINISHER read — twin shockwave rings + a louder debris throw + a longer freeze.
    addFx("shockring",e.x,e.y,{r:48,life:0.42}); addFx("debris",e.x,e.y,{ang,life:0.5});
    // CAS-210: a RIPOSTE reads even LOUDER than a normal crit — a gold counter banner above
    // the hero, an extra wide shockwave + debris fan, and a harder shake. The punish landed.
    if(riposted){ floater(G.hero.x,G.hero.y-40,STR.riposte,"#ffd24d",{crit:true,pop:1.6,life:0.95});
      addFx("shockring",e.x,e.y,{r:66,life:0.5}); addFx("debris",e.x,e.y,{ang,life:0.6}); shakeAdd(6); } }
  else floater(e.x,e.y-e.tpl.size,"-"+Math.round(dmg),"#ffd24d",{pop:1.3});
  // CAS-204 (FOUNTAINS crunch): every connect snaps a white-hot hitburst at the contact point and
  // throws chunky crimson debris along the knockback vector — the impact now reads as launched, not tapped.
  addFx("spark",e.x,e.y); addFx("blood",e.x,e.y,{ang}); addFx("impact",e.x,e.y,{ang,life:0.26});
  addFx("hitburst",e.x,e.y,{ang,life:0.22}); addFx("debris",e.x,e.y,{ang,life:0.42});
  addFx("bloodstain",e.x,e.y+e.tpl.size*0.4,{ang,life:1.8}); // FOUNTAINS: violence leaves a lingering mark
  freeze(Math.min(7, (crit?4:2)+Math.floor(dmg/14))); // hit pops harder the bigger the blow; crits bite deepest
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
  if(G.hero && !tpl.neutral){ G.hero.kills=(G.hero.kills|0)+1; if(e.isBoss||e.champion) G.hero.champKills=(G.hero.champKills|0)+1;
    // CAS-375: per-type tally for directed bounties. e.type is the base mob key (a champion/
    // capstone keeps its base type, e.g. a dragon capstone counts as a "dragon" kill).
    if(e.type){ const kt=G.hero.killsByType||(G.hero.killsByType={}); kt[e.type]=(kt[e.type]|0)+1; } }
  // CAS-383: Cosecha Sangrienta boon — a real (non-neutral) kill grants a small % max-HP heal
  // and a brief attack-haste ráfaga. onKillHeal is clamped low (recalcBoons) so a fast clear
  // never becomes an infinite-sustain loop; haste rides the existing atkspd buff sink (which is
  // itself ATKSPD_TOTAL_CAP-capped at the swing formula). Deterministic (no RNG).
  { const h=G.hero, bb=h&&h.bb; if(h&&!h.dead&&!tpl.neutral&&bb&&(bb.onKillHeal>0||bb.onKillHaste>0)){
      if(bb.onKillHeal>0){ const mhp=heroMaxHp(h); if(h.hp<mhp){ const heal=Math.max(1,Math.round(mhp*bb.onKillHeal));
        h.hp=Math.min(mhp,h.hp+heal); floater(h.x,h.y-30,"+"+heal,"#5fd66a",{small:true}); } }
      if(bb.onKillHaste>0){ h.atkspdBuffT=Math.max(h.atkspdBuffT,bb.onKillHaste); h.atkspdBuffAmt=Math.max(h.atkspdBuffAmt,35); } } }
  // CAS-388: Núcleo Detonante legendary — a real kill detonates a nova that damages nearby
  // enemies (funnels through hitEnemy so it carries the build's on-hit statuses/lifesteal). The
  // novaActive guard stops the ring from chain-detonating off its own kills (one ring per kill).
  { const h=G.hero, bb=h&&h.bb; if(h&&!h.dead&&!tpl.neutral&&bb&&bb.onKillNova>0&&!novaActive){
      novaActive=true; const R=96, R2=R*R, nd=Math.max(1,Math.round(equippedDmg(h)*bb.onKillNova));
      for(const t of G.enemies){ if(t===e||t.dead) continue; const dx=t.x-e.x, dy=t.y-e.y;
        if(dx*dx+dy*dy<=R2+t.tpl.size*t.tpl.size) hitEnemy(t,nd,Math.atan2(t.y-e.y,t.x-e.x)); }
      addFx("holynova",e.x,e.y,{r:R,life:0.45}); addFx("shockring",e.x,e.y,{r:R*0.8,life:0.4});
      audio.sfx.rune&&audio.sfx.rune(); shakeAdd(5); novaActive=false; } }
  if(e.isBoss){ audio.sfx.boss(); G.bossDead=true; toast(STR.bossDefeated); shakeAdd(10);
    G.drops.push({x:e.x,y:e.y,kind:"potionhp"}); G.drops.push({x:e.x+20,y:e.y,kind:"gold"});
    noteEliteKill(); // CAS-149: the final boss is an elite-class kill → feeds Elite Mastery
    grantMats(3);    // CAS-237: a boss kill is a signature forge-material haul
    dropGear(e.x-20,e.y, rollGearInst(srand,2,3,"rare")); // boss: guaranteed rare+ from the tier 2-3 pool
    gainXP(tpl.xp); for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30)); }
  else if(e.champion){ onChampionKill(e); } // hunt climax — clears the zone, guaranteed payoff
  else { gainXP(tpl.xp);
    audio.sfx.mobDie&&audio.sfx.mobDie(); // CAS-447: regular kills get an audible finisher (boss/champion keep sfx.boss)
    // CAS-273: every kill now lands a subtle, size-scaled screen-shake (the requested
    // "shake escalado por muerte" — previously only boss/champion/crit/volatile kills shook).
    // reduceMotion-gated via shakeAdd; bosses/champions keep their larger shakes on their own
    // paths so this never double-fires. Pure presentation — no damage/timing/drop change.
    shakeAdd(clamp(tpl.size*0.09, 1.2, 3));
    const g=ri(tpl.gold[0],tpl.gold[1]); if(g>0){ G.drops.push({x:e.x,y:e.y,kind:"gold",amt:g}); }
    if(srand()<0.22) G.drops.push({x:e.x+frr(-8,8),y:e.y,kind:srand()<0.6?"potionhp":"potionmp"});
    // CAS-146: an ELITE (ambush leader) guarantees an elevated drop + bonus gold; a normal
    // mob rolls its gearChance as before (non-elites take the unchanged RNG path → baselines hold).
    if(e.elite){ onEliteKill(e, zone); }
    else if(srand()<(tpl.gearChance||0)){ const win=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
      dropGear(e.x+frr(-8,8),e.y, rollGearInst(srand,win[0],win[1])); }
    huntKill(zone); // a normal kill in a hunt zone advances that zone's contract
    if(G.hero && (G.hero.kills%4)===0) grantMats(1); // CAS-237: a steady forge-material trickle from hunting (deterministic off the kill counter, no RNG)
  }
  if(e.type==="wolf" && !G.quest.done){ G.quest.wolves=Math.min(8,G.quest.wolves+1);
    if(G.quest.wolves>=8){ G.quest.done=true; toast(STR.questDone); } }
  addFx("poof",e.x,e.y);
  // CAS-210: FOUNTAINS-style kill pop — chunky gore burst so a kill reads as a finisher.
  const ka=frr(0,6.28); addFx("debris",e.x,e.y,{ang:ka,life:0.55}); addFx("debris",e.x,e.y,{ang:ka+3.14,life:0.48});
  addFx("bloodstain",e.x,e.y+e.tpl.size*0.4,{ang:ka,life:2.2});
  if(e.champion||e.isBoss) addFx("shockring",e.x,e.y,{r:52,life:0.46});
  // CAS-247 VOLATILE affix: the corpse ERUPTS a small radial AoE on death — kill it at range or
  // clear the blast. Damages the hero only if inside the radius (no telegraph: the orange aura
  // it carried IS the warning). Deterministic except the cosmetic flame scatter (off frr).
  { const af=e.affix&&MOB_AFFIX[e.affix]; if(af&&af.blast && G.hero && !G.hero.dead){ const R=af.blast;
    const dd=Math.hypot(G.hero.x-e.x,G.hero.y-e.y);
    if(dd<=R){ const a=Math.atan2(G.hero.y-e.y,G.hero.x-e.x); damageHero(Math.max(1,Math.round(e.tpl.dmg*(af.blastDmgMul||0.85))),a,null); }
    addFx("novacast",e.x,e.y,{r:R,col:af.col,life:0.5}); addFx("shockring",e.x,e.y,{r:R*0.7,life:0.4});
    for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-R*0.5,R*0.5),e.y+frr(-R*0.5,R*0.5)); shakeAdd(7); audio.sfx.fire(); } }
  // CAS-317: a rich-anim boss leaves a corpse that plays the DEATH strip one-shot (holds the
  // collapsed final frame) then fades. Presentation-only — rewards/drops already resolved above.
  if(e.tpl.richAnim){ G.corpses.push({ sprite:e.tpl.sprite, x:e.x, y:e.y, size:e.tpl.size, isBoss:!!e.isBoss, champion:!!e.champion,
    fl:(e.facing!==undefined)?Math.cos(e.facing)<0:false, gaitPhase:e.gaitPhase||0, t:0 }); }
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
    e.bonusDrop=B.bonusDrop||0; // CAS-196: world-boss signature haul (extra guaranteed epic rolls)
    // CAS-342: a capstone may carry its OWN recurring `special` (the dragon's breath) on top of
    // the shared windup→strike AI — it fires through the proven CAS-109 channel (telegraphed
    // growing-ring tell → radial shard slam every Nth strike), independent of the enrage slam.
    // Golem/carapace capstones define no B.special → null, so their behaviour is byte-identical.
    e.special=B.special||null; e.specialNow=false;
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
  // CAS-394: a cursed zone also toughens its climax (hp/dmg only — a faster/mutated boss would hurt
  // readability, so speed/affix mods don't touch the champion). The reward upgrade fires on its clear.
  { const cm=curseMods(zone); if(cm){ const b2=e.tpl;
    e.tpl=Object.assign({},b2,{ hp:Math.round(b2.hp*(cm.hpMul||1)), dmg:Math.round(b2.dmg*(cm.dmgMul||1)) }); } }
  // CAS-450: the World-Tier layer also toughens the climax (hp/dmg only, same restraint as the
  // curse block above) — a re-armed tier-N boss must out-hit its tier-1 self or NG+ is a bluff.
  // null at tier 1 → byte-identical baseline.
  { const wtm=worldTierMods(); if(wtm){ const b3=e.tpl;
    e.tpl=Object.assign({},b3,{ hp:Math.round(b3.hp*wtm.hpMul), dmg:Math.round(b3.dmg*wtm.dmgMul) }); } }
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
  grantMats(e.capstone?3:2); // CAS-237: champion/capstone clear yields a forge-material haul (capstone richer)
  const win=e.rwdTier||cfgH.tier||(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
  dropGear(e.x,e.y, rollGearInst(srand,win[0],win[1],e.rwdMinR||cfgH.minR));
  // CAS-196: a WORLD-BOSS (boss block carries `bonusDrop`) drops extra guaranteed pieces at
  // the same tier/floor — a SIGNATURE haul distinct from a single-zone capstone. Same loot
  // system (rollGearInst on the sim RNG → deterministic), just N more rolls fanned out.
  for(let b=0;b<(e.bonusDrop||0);b++) dropGear(e.x+(b%2?34:-34),e.y-18, rollGearInst(srand,win[0],win[1],e.rwdMinR||cfgH.minR));
  G.drops.push({x:e.x+18,y:e.y,kind:"gold",amt:e.rwdGold||cfgH.gold});
  if(srand()<0.5) G.drops.push({x:e.x-18,y:e.y,kind:"potionhp"});
  // CAS-394: clearing a CURSED zone pays out the risk — ONE bonus gear roll at the zone's tier/floor
  // (reuses the same rollGearInst/dropGear path as the guaranteed piece, no new loot tier). Combined
  // with the draft's guaranteed rare+ (openDraft reads hero.curses), this is the "risk for reward".
  // Farm-cap: H.cleared (set above) blocks re-spawning the champion, so a zone pays this AT MOST once
  // per run → ≤7 bonus rolls/run, all at existing tiers. No legendary/gear farm (flagged in report).
  if(G.hero && G.hero.curses && G.hero.curses[zone]) dropGear(e.x-40,e.y+12, rollGearInst(srand,win[0],win[1],e.rwdMinR||cfgH.minR));
  gainXP(e.rwdXp||cfgH.xp);
  toast(STR.huntCleared(zone),3.6);
  for(let i=0,n=rmCount(e.capstone?16:10);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30));
  // CAS-450: CONQUISTA tracking — a CONQUEST_ZONES climax falling for the FIRST time this cycle
  // is recorded; the 4th completes the cycle → APEX. The tracker resets HERE, the instant the
  // cycle completes, so an interrupted ceremony (reload mid-draft) can never wedge the loop —
  // the re-armed world (hunts re-init on load) simply starts a fresh cycle. Everything above
  // this block (the standard clear payoff + its srand draws) is untouched → order preserved.
  let apex=false;
  { const h=G.hero, cq=h&&h.conquest;
    if(cq && CONQUEST_ZONES.indexOf(zone)>=0 && cq.bossesDown.indexOf(zone)<0){
      cq.bossesDown.push(zone);
      if(cq.bossesDown.length>=CONQUEST_ZONES.length){ apex=true; cq.bossesDown.length=0; }
      else if(!e.final) toast(STR.conquestProgress(cq.bossesDown.length,CONQUEST_ZONES.length),3.6); } }
  // CAS-450: APEX ceremony payoff — ONE extra guaranteed gear roll at the zone's window bumped
  // one tier (capped at the top tier), rare+ floor (the CAS-442 guaranteed-boss-drop pattern,
  // fanned one roll further like bonusDrop). Drawn AFTER every pre-existing draw in this clear,
  // so the established sequence above never shifts; the extra draw exists only when apex fires.
  if(apex){
    const wa=[Math.min(4,(win[0]||3)+1), Math.min(4,(win[1]||4)+1)];
    dropGear(e.x+40,e.y+12, rollGearInst(srand,wa[0],wa[1],"rare"));
    toast(STR.apexToast,4.0); shakeAdd(12);
    for(let i=0,n=rmCount(18);i<n;i++) addFx("flame",e.x+frr(-36,36),e.y+frr(-36,36));
  }
  // CAS-123: the FINAL boss (data flag) closes the Stage-1 arc → victory screen.
  // CAS-383: any OTHER zone champion clear is a run milestone → offer the inter-zone boon
  // draft (paused "draft" scene). The final boss goes to victory instead (run is over), so
  // the two are mutually exclusive and never fight over the scene. CAS-450: an apex clear
  // opens the ceremony draft (guaranteed legendary → then the ascend offer via pickBoon).
  if(e.final) winStage1();
  else openDraft(zone,apex);
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
  if(h){ h.dead=false; h.vx=h.vy=0; h.iframe=0.6; } G.scene="play"; beginRun(); }
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

// CAS-150 — ELITE-MASTERY REWARD TRACK. Pure, deterministic derivation of the unlocked
// milestones + the aggregated permanent-perk bundle from the lifetime elite-kill count.
// The bundle is cached on the hero (h.mp, like talents h.tt) and read by the hot combat
// path with no per-frame allocation. NOTHING is spent or baked here — a higher count simply
// unlocks more of the fixed track, so it survives reload and a Stage-2 server reproduces it.
const MP_KEYS=["hp","dmgPct","eliteDmgPct","crit"];
export function zeroMP(){ const o={}; for(const k of MP_KEYS) o[k]=0; return o; }
// How many track milestones are unlocked at a given lifetime kill count.
export function masteryUnlocked(k){ k=k|0; let n=0; const T=MASTERY.track;
  for(let i=0;i<T.length;i++){ if(k>=T[i].at) n++; } return n; }
// The NEXT locked milestone (null once all are unlocked) — the reward-track read-out.
export function masteryNextMilestone(k){ k=k|0; const T=MASTERY.track;
  for(let i=0;i<T.length;i++){ if(k<T[i].at) return T[i]; } return null; }
// Aggregate every unlocked milestone's perk into one bundle. Deterministic, no RNG.
export function masteryPerks(k){ const mp=zeroMP(); const T=MASTERY.track; k=k|0;
  for(let i=0;i<T.length;i++){ if(k>=T[i].at){ const p=T[i].perk;
    for(const key in p) mp[key]=(mp[key]||0)+p[key]; } } return mp; }
// Full track snapshot for the UI panel: each milestone + unlocked flag + the active "next".
export function masteryTrack(k){ k=k|0; const next=masteryNextMilestone(k);
  return MASTERY.track.map(m=>({ at:m.at, id:m.id, name:m.name, desc:m.desc,
    unlocked:k>=m.at, isNext:next?m.id===next.id:false })); }
// Refresh the cached perk bundle (call on load + on every elite kill). Cheap & pure.
// Stored as h.mperk (h.mp is the hero's MANA — do not collide).
function recalcMastery(h){ if(!h) return; h.mperk=masteryPerks(h.eliteKills); }

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
  const before=masteryRank(h.eliteKills); const unlBefore=masteryUnlocked(h.eliteKills);
  h.eliteKills=(h.eliteKills|0)+1;
  const after=masteryRank(h.eliteKills);
  recalcMastery(h);   // CAS-150: refresh the cached reward-track perk bundle (h.mp)
  if(after>before){ const gain=(after-before)*MASTERY.hpPerRank;
    h.maxHp+=gain; h.hp=Math.min(heroMaxHp(h), h.hp+gain);   // bonus is also a small heal
    toast(STR.masteryUp(after),3.0); audio.sfx.levelup();
    addFx("lvlring",h.x,h.y,{life:0.6}); floater(h.x,h.y-62,STR.masteryFloater(after),"#ffd24d");
    for(let i=0,n=rmCount(10);i<n;i++) addFx("heal",h.x+frr(-22,22),h.y+frr(-26,8)); }
  // CAS-150: crossing a REWARD-TRACK milestone — the discrete, chased unlock. A milestone
  // and a rank-up can land on the same kill (separate banners); the perk is already live in
  // h.mperk (recalc above), so this is purely the celebratory tell + a top-up heal if it
  // raised maxHp. heroMaxHp folds h.mperk.hp, so a fresh +20-maxHp milestone keeps the bar honest.
  const unl=masteryUnlocked(h.eliteKills);
  if(unl>unlBefore){ const m=MASTERY.track[unl-1];
    const mhp=heroMaxHp(h); if(h.hp<mhp) h.hp=Math.min(mhp, h.hp+((m.perk&&m.perk.hp)||0));
    toast(STR.masteryMilestone(m.name, m.desc),3.4); audio.sfx.levelup();
    addFx("lvlring",h.x,h.y,{life:0.7}); floater(h.x,h.y-72,"✦ "+m.name,"#ffe48a");
    for(let i=0,n=rmCount(12);i<n;i++) addFx("heal",h.x+frr(-24,24),h.y+frr(-28,10)); }
}
// CAS-134: the single, deliberate META-reward seam — the ONLY way the daily-return loop
// (daily.js) writes into sim state, and only on an explicit player CLAIM (never per-frame).
// Grants gold / xp / potions through the same paths a real reward uses (gold add + gainXP,
// so claiming can level you up with the usual ding). Stage-2 portable: a server build grants
// the same shape through the same surface. No RNG, deterministic.
export function applyMetaReward(r){ const h=G.hero; if(!h||!r) return;
  if(r.gold>0){ h.gold+=r.gold|0; audio.sfx.coin(); floater(h.x,h.y-26,"+"+(r.gold|0)+" oro",C_GOLD); }
  if(r.potHP>0){ h.potHP+=r.potHP|0; }
  if(r.mats>0){ grantMats(r.mats|0); floater(h.x,h.y-42,"+"+(r.mats|0)+" "+STR.forgeMat,"#cdb27a"); } // CAS-237: daily contracts feed the forge too
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

// ----------------------------- CAS-169 customization API ----------------------
// The customization SCENE (render/customize.js bake + input.js panel) drives the
// live hero's look through these. All pure cosmetics: they only mutate h.palette /
// h.variation, which the throttled autosave persists and the renderer dirty-checks +
// re-bakes. No combat/sim/RNG touch — Stage-2-safe. Each returns the new state so a
// caller (or harness) can confirm the change took.
export function customizeState(){ const h=G.hero; if(!h) return null;
  return { cls:h.cls,
    palette:Object.assign({},h.palette), variation:Object.assign({},h.variation),
    swatches:CUSTOMIZE.swatches.map(c=>c.slice()), slots:CUSTOMIZE.slots.slice(),
    variations:{ headwear:CUSTOMIZE.variations.headwear.slice(), cape:CUSTOMIZE.variations.cape.slice() } }; }
// Set one part's color. `color` may be an [r,g,b] (validated) or a swatch index.
export function setPartColor(slot, color){ const h=G.hero; if(!h||CUSTOMIZE.slots.indexOf(slot)<0) return false;
  let c=null;
  if(typeof color==="number"){ const sw=CUSTOMIZE.swatches[color]; if(sw) c=sw.slice(); }
  else c=safeColor(color);
  if(!c) return false; h.palette[slot]=c; return true; }
// Cycle a variation (headwear|cape) by dir (+1/-1) through its allowed options.
export function cycleVariation(kind, dir){ const h=G.hero; const opts=CUSTOMIZE.variations[kind]; if(!h||!opts) return false;
  const cur=Math.max(0,opts.indexOf(h.variation[kind])); const n=opts.length;
  h.variation[kind]=opts[((cur+(dir||1))%n+n)%n]; return h.variation[kind]; }
// Reset the hero's whole look back to its class default (the "restaurar" button).
export function resetCustomize(){ const h=G.hero; if(!h) return false;
  h.palette=defaultPalette(h.cls); h.variation=Object.assign({},CUSTOMIZE.variationDefault); return true; }

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
  h.specialAnim=SPECIAL_ANIM_DUR; h.hurtAnim=0; // CAS-256: a class-skill cast plays the special-attack strip (must match render CLASS_SPECIAL_DUR)
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
      addFx(sp.fx||"novacast",h.x,h.y,{r:sp.range,col:sp.col,style:sp.style,life:0.5}); addFx("shockring",h.x,h.y,{r:sp.range*0.85,life:0.4}); shakeAdd(6); break; }
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

// ------------------------------ run recap (CAS-277) --------------------
// Snapshot the lifetime counters at the start of a run so the end-of-run recap can show
// THIS run's deltas. Called at every run-start seam (new hero, save load, respawn, post-
// victory free play). Presentation-only — additive, transient, read-only on the sim.
export function beginRun(){ const h=G.hero; if(!h) return;
  G.run={ pT0:h.playT||0, kills0:h.kills|0, gold0:h.gold|0, elite0:h.eliteKills|0,
          champ0:h.champKills|0, lvl0:h.lvl|0 };
  G.recap=null; }
// Build the FROZEN recap delta from current counters minus the run baseline. Time uses
// playT (active-play seconds) so menu/pause time never inflates it. Deltas clamp at 0
// (gold can dip if spent mid-run). Pure read — invents no economy.
function buildRecap(){ const h=G.hero, r=G.run; if(!h) return null; const b=r||{};
  return { time:Math.max(0,(h.playT||0)-(b.pT0||0)), kills:Math.max(0,(h.kills|0)-(b.kills0||0)),
    gold:Math.max(0,(h.gold|0)-(b.gold0||0)), elites:Math.max(0,(h.eliteKills|0)-(b.elite0||0)),
    lvl:h.lvl|0, lvlUp:Math.max(0,(h.lvl|0)-(b.lvl0||0)) }; }

// ------------------------------ death ----------------------------------
function heroDie(){
  const h=G.hero; if(h.dead) return; G.recap=buildRecap(); h.dead=true; h.animState="dead"; h.animT=0; G.scene="dead"; audio.sfx.death();
  h.deaths=(h.deaths||0)+1; // CAS-123: a run attempt for the victory summary
  const red=G.skull.level>=3;
  let frac = h.blessings>0 && !red ? 0.10 : 0.30;
  const loss=Math.floor(h.xpNext*frac); h.xp=Math.max(0,h.xp-loss);
  if(red){ if(h.potHP>0) h.potHP--; h.blessings=0; }
  else if(h.blessings>0){ h.blessings--; }
}
export function respawn(){
  const h=G.hero;
  if(h.boons&&h.boons.length){ h.boons.length=0; } recalcBoons(h); // CAS-383: death ends the run → wipe drafted boons BEFORE heroMaxHp reads the reset pool
  h.rerollLeft=1; h.banishLeft=1; if(h.banished) h.banished.length=0; else h.banished=[]; // CAS-392: death resets the draft-agency budget + banished pool (per-run, same as boons)
  h.curses={}; if(h.curseSeen) h.curseSeen.length=0; else h.curseSeen=[]; G.curse=null; // CAS-394: death ends the run → clear accepted zone modifiers + re-arm the entry offers
  G.ascend=null; // CAS-450 hygiene: no pending ascend offer can survive a death (conquest itself is durable — tier + cycle trophies persist)
  h.dead=false; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.x=h.respawn.x; h.y=h.respawn.y;
  h.vx=h.vy=0; h.rolling=false; h.iframe=0.5; G.scene="play"; G.skull.level=0; G.skull.kills=0;
  G.recap=null; beginRun(); // CAS-277: fresh run baseline for the next recap
}
// CAS-277: the death recap's secondary action — respawn at the safe fountain but land in
// the calm pause/management hub (gear/talents/settings) instead of straight into combat,
// so the player can regroup. Same respawn mechanics; only the landing scene differs.
export function returnToHub(){ respawn(); G.scene="pause"; }

// ------------------------------ NPCs / shop ----------------------------
function nearestNPC(){ const h=G.hero; let best=null,bd=CFG.talkRange*CFG.talkRange;
  for(const n of world.npcs){ const d=dist2(h.x,h.y,n.x,n.y); if(d<bd){bd=d;best=n;} } return best; }
function nearestFountain(){ const h=G.hero; for(const f of world.fountains){ if(dist2(h.x,h.y,f.x,f.y)<CFG.fountainRange*CFG.fountainRange) return f; } return null; }
// CAS-319: Maren la Sanadora (role:"fountain") replaced the central square fountain (CAS-309).
// She heals EXACTLY as that fountain did, so she's reached at fountainRange (60) — the SAME radius
// the fountain used — not the tighter talkRange (56) other NPC dialogue uses. Checked before the
// generic NPC scan so [E] within 60 of Maren = rest-heal, never plain dialogue.
function nearestFountainNPC(){ const h=G.hero; let best=null,bd=CFG.fountainRange*CFG.fountainRange;
  for(const n of world.npcs){ if(n.role!=="fountain") continue; const d=dist2(h.x,h.y,n.x,n.y); if(d<bd){bd=d;best=n;} } return best; }
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
  else if(p.to==="trial"){ const pw=heroPower(h);  // CAS-196: the deepest gate (the challenge arena)
    if(pw<TRIAL_POWER_REQ){ toast(STR.trialLocked(pw,TRIAL_POWER_REQ),3.4); audio.sfx.deny(); return false; } }
  h.x=p.dx; h.y=p.dy; h.vx=h.vy=0; h.rolling=false; h.rollT=0; h.iframe=0.6;
  audio.sfx.roll(); toast(p.to==="abyss"?STR.enteredAbyss:p.to==="frost"?STR.enteredFrost:p.to==="trial"?STR.enteredTrial:STR.leftAbyss,3.0); return true;
}
export function interact(){
  const p=nearestPortal();
  if(p){ usePortal(p); return; }
  const fn=nearestFountainNPC();
  if(fn){ openDialogue(fn); return; }   // CAS-319: Maren rest-heal (faithful 60px port) before generic NPCs
  const f=nearestFountain();
  const n=nearestNPC();
  if(n){ openDialogue(n); return; }
  if(f){ const h=G.hero; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.respawn={x:f.x,y:f.y+TS}; toast(STR.fountainRest); audio.sfx.heal(); return; }
}
function openDialogue(n){
  // CAS-319: Maren la Sanadora — faithful port of the removed central fountain's rest-heal.
  // Full HP/MP restore + sets respawn at her feet + the same toast/sfx the fountain used.
  // No cooldown, no UI, no shop (the fountain had none); on-style heal juice for feedback.
  if(n.role==="fountain"){ const h=G.hero;
    h.hp=heroMaxHp(h); h.mp=h.maxMp; h.respawn={x:n.x,y:n.y+TS};
    toast(STR.fountainRest); audio.sfx.heal();
    addFx("healburst",h.x,h.y,{col:"#7dffa0",life:0.5});
    for(let k=0;k<8;k++) addFx("heal",h.x+frr(-16,16),h.y+frr(-20,8));
    return;
  }
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
    else if(n.role==="codex"){ G.scene="bestiary"; G.bestSel=0; G.bestScroll=0; G.healShop=false; G.merchantShop=false; } // CAS-386 bestiary
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
      // CAS-192: the merchant also stocks the data-driven combat consumables — same gold
      // sink, each buy +1 of that consumable into the hero's stash (used in combat via Q).
      ...CONSUMABLES.map(cn=>({ name:cn.name+" — "+cn.desc, price:cn.price,
        act:hh=>{ hh.consum[cn.id]=(hh.consum[cn.id]|0)+1; } })),
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
// CAS-419: reorder the backpack — move bag[from] to `to` (swap if occupied), or to the
// END when to===-1. Pure inventory management through the sim authority (mirrors equipBag):
// no stat/gameplay change, no RNG. The bag array is persisted as-is (serializeSave), so the
// new order survives reload with the EXISTING save shape — no SAVE_VERSION bump.
export function moveBag(from,to){ const h=G.hero; const n=h.bag.length;
  if(from<0||from>=n||!h.bag[from]) return false;
  if(to===-1){ const it=h.bag.splice(from,1)[0]; h.bag.push(it); }
  else { if(to<0||to>=n||to===from) return false;
    const tmp=h.bag[from]; h.bag[from]=h.bag[to]; h.bag[to]=tmp; }
  G.invSel=Math.min(to===-1?n-1:to, Math.max(0,h.bag.length-1)); audio.sfx.pickup();
  return true;
}
export function buyItem(idx){ const h=G.hero; const it=shopItems()[idx]; if(!it) return;
  if(it.once && it.once(h)){ audio.sfx.deny(); toast("Ya tienes algo igual o mejor"); return; }
  if(h.gold<it.price){ toast(STR.cantAfford); audio.sfx.deny(); return; }
  h.gold-=it.price; it.act(h); audio.sfx.buy(); toast(STR.bought(it.name)); }

// --------------------- player commands (driven by input) ---------------
export function doPotionHP(){ const h=G.hero; if(h.potHP>0&&h.hp<heroMaxHp(h)){ h.potHP--; h.hp=Math.min(heroMaxHp(h),h.hp+50); audio.sfx.heal(); floater(h.x,h.y-30,"+50","#5fd66a"); } }
export function doPotionMP(){ const h=G.hero; if(h.potMP>0&&h.mp<h.maxMp){ h.potMP--; h.mp=Math.min(h.maxMp,h.mp+30); audio.sfx.cast(); floater(h.x,h.y-30,"+30","#7fb8e6"); } }
// CAS-192: the consumable in the selected slot. The shared cooldown (h.consumCD) gates
// spam; every effect is deterministic (no RNG) and reads/writes only sim state so it is
// Stage-2 server-authority ready. Feedback is loud and legible: a buff-aura fx, a named
// floater and a per-row sfx — and the fury buff posts its live duration to the HUD.
export function doConsumable(){ const h=G.hero; if(!h||G.scene!=="play") return false;
  const c=CONSUMABLES[h.consumSel|0]; if(!c) return false;
  if((h.consumCD[c.id]||0)>0){ audio.sfx.deny(); return false; }       // this consumable on cooldown
  if((h.consum[c.id]|0)<=0){ audio.sfx.deny(); toast(STR.consumEmpty(c.name)); return false; } // empty slot
  // purge — antídoto cleans active DoTs (veneno/quemadura) + slow (CAS-118 cleanse)
  if(c.purge){ h.dots=null; h.slowT=0; h.slow=1; floater(h.x,h.y-30,STR.consumPurged,c.col); }
  // heal — poción mayor restores a fraction of MAX hp (scaled heal over the base 50)
  if(c.healFrac){ const mhp=heroMaxHp(h); const amt=Math.round(mhp*c.healFrac); h.hp=Math.min(mhp,h.hp+amt); floater(h.x,h.y-30,"+"+amt,c.col); }
  // buff — furia grants the short timed atkspd bonus the swing formula reads; dmg reuses applyBuff
  if(c.buff){ if(c.buff.stat==="atkspd"){ h.atkspdBuffT=c.buff.dur; h.atkspdBuffAmt=c.buff.amt; }
    else if(c.buff.stat==="dmg"){ applyBuff(h,"dmg",c.buff.amt,c.buff.dur); }
    floater(h.x,h.y-46,c.short.toUpperCase()+"!",c.col); }
  h.consum[c.id]--; h.consumCD[c.id]=c.cd;
  addFx("buffaura",h.x,h.y,{life:0.55,col:c.col});
  const sf=audio.sfx[c.sfx]||audio.sfx.buy; sf();
  return true;
}
// CAS-192: rotate which consumable the use-key fires (HUD slot). Pure UI state.
export function cycleConsumable(dir){ const h=G.hero; if(!h) return; const n=CONSUMABLES.length;
  h.consumSel=(((h.consumSel|0)+(dir||1))%n+n)%n; if(audio.sfx.uiOpen) audio.sfx.uiOpen(); }
// CAS-237 — FORJA: forge the EQUIPPED piece in `slot` (weapon/body/shield) up one level.
// The sim is the authority (the UI only proposes): re-checks gold + material, deducts both,
// bumps the instance forge level (`fl`), and the stat recomputes via gearStat — never a baked
// stat. Deterministic, no RNG → Stage-2 server-authority ready. Loud, legible feedback (the
// stat delta floater + a forge ding). Returns true on success.
export function forgeUpgrade(slot){ const h=G.hero; if(!h) return false;
  if(["weapon","body","shield"].indexOf(slot)<0) return false;
  const inst=h.equip[slot]; if(!inst){ audio.sfx.deny(); toast(STR.forgeEmpty); return false; }
  const cost=forgeNextCost(inst); if(!cost){ audio.sfx.deny(); toast(STR.forgeMax); return false; }
  if(h.gold<cost.gold || (h.mats|0)<cost.mats){ audio.sfx.deny(); toast(STR.forgeCant); return false; }
  const before=gearStat(inst);
  h.gold-=cost.gold; h.mats=(h.mats|0)-cost.mats; inst.fl=forgeLevel(inst)+1;
  const after=gearStat(inst);
  const mhp=heroMaxHp(h); if(h.hp>mhp) h.hp=mhp;          // safety: stat changes never strand hp over max
  audio.sfx.levelup(); addFx("lvlring",h.x,h.y,{life:0.6});
  floater(h.x,h.y-40,"+"+(after-before)+" "+(slot==="weapon"?STR.statsDmg:STR.statsDef),"#ffd24d");
  toast(STR.forgeDone(gearName(inst), inst.fl));
  return true; }
// CAS-237 — forge-material ("mena") drip. Granted ONLY at deterministic kill milestones so the
// combat RNG stream (drops/affixes) is never perturbed — determinism baselines hold. Reads/writes
// only h.mats. Daily contracts add mats through applyMetaReward (the meta-reward seam).
function grantMats(n){ const h=G.hero; if(!h||n<=0) return; h.mats=(h.mats|0)+(n|0); }

export function doRoll(){ const h=G.hero; if(h.rolling||h.rollCD>0) return; let ax,ay;
  if(G.settings.rollAim){ ax=Math.cos(h.facing); ay=Math.sin(h.facing); }
  else { const mv=io.moveVec(); if(mv[0]===0&&mv[1]===0){ ax=Math.cos(h.facing); ay=Math.sin(h.facing);} else {[ax,ay]=mv;} }
  h.rolling=true; h.rollT=CFG.rollTime; h.iframe=CFG.rollIFrame+((h.bb&&h.bb.iframeAdd)||0); h.rollCD=CFG.rollCD; h.rollX=ax; h.rollY=ay;
  if(h.bb&&h.bb.trail>0) h._trailSet=new Set(); // CAS-388: fresh per-roll set so Estela Ardiente burns each enemy once per dash
  audio.sfx.roll(); } // CAS-383: Viento Veloz widens the dodge window

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
  const inDanger=(z==="caves"||z==="forest"||z==="arena"||z==="ruins"||z==="abyss"||z==="frost"||z==="swamp"); // CAS-441: the Ciénaga is a combat biome (music/ambush clock)
  const wantCombat=inDanger && G.enemies.some(e=>e.state==="chase"||e.state==="windup"||e.state==="shield");
  // a live boss / champion / capstone in the zone escalates to the épica boss theme.
  const bossFight=inDanger && G.enemies.some(e=>e.hp>0 && (e.isBoss||e.capstone||e.champion));
  const wantMusic=bossFight?"boss":wantCombat?"combat":"town";
  if(wantMusic!==G.music){ G.music=wantMusic; audio.playMusic(wantMusic); }
  // CAS-131: per-biome ambient soundscape crossfades under the music on zone change.
  if(z!==G._ambZone){ G._ambZone=z; if(audio&&audio.setAmbient) audio.setAmbient(z); }
  if(z==="arena" && !G.arenaWarned){ G.arenaWarned=true; toast(STR.enteredArena,3.5); }
  // CAS-394: OPT-IN ZONE MODIFIER — the FIRST time the hero steps into a combat zone (HUNTS key)
  // whose hunt isn't already cleared this run, pause into the "curse" scene and offer one modifier
  // (accept/skip). Fires exactly once per zone per run (curseSeen), and only from free play so it
  // never stacks over another panel. Cleared zones + town/field are skipped (no reward to gate).
  if(HUNTS[z] && (h.curseSeen||[]).indexOf(z)<0){ const CH=G.hunts&&G.hunts[z];
    if(!(CH&&CH.cleared)) offerCurse(z); }
  // CAS-342: the caves dragon is no longer a positional deep-walk spawn — it is now the caves
  // ZONE CAPSTONE (HUNTS.caves.boss), summoned deliberately by spawnChampion when the kill quota
  // is met. The old `z==="caves" && !G.bossSpawned … spawnBoss()` trigger is removed so the dragon
  // appears EXACTLY once, only as the earned end-of-zone climax (never a random high-HP ambush).
  updateAmbush(dt, z, inDanger); // CAS-146: elite-ambush event clock (deterministic, in-zone only)

  // timers
  h.atkCD=Math.max(0,h.atkCD-dt); h.rollCD=Math.max(0,h.rollCD-dt); h.iframe=Math.max(0,h.iframe-dt); h.hurtFlash=Math.max(0,h.hurtFlash-dt); h.atkAnim=Math.max(0,h.atkAnim-dt);
  h.hurtAnim=Math.max(0,(h.hurtAnim||0)-dt); h.specialAnim=Math.max(0,(h.specialAnim||0)-dt); // CAS-256 hit-react / skill-cast anim timers
  h._pdCD=Math.max(0,(h._pdCD||0)-dt); // perfect-dodge reward cooldown
  h.riposte=Math.max(0,(h.riposte||0)-dt); // CAS-210: the riposte counter window decays if unused
  // spell cooldowns + timed buffs (in-place; no per-frame allocation)
  for(let s=1;s<4;s++){ if(h.spellCD[s]>0) h.spellCD[s]=Math.max(0,h.spellCD[s]-dt); }
  if(h.dmgBuffT>0){ h.dmgBuffT-=dt; if(h.dmgBuffT<=0){ h.dmgBonus-=h.dmgBuffAmt; h.dmgBuffAmt=0; } }
  // CAS-192: consumable timers — the "furia" atkspd buff winds down (the bonus stops
  // applying the moment the timer expires) and each per-consumable cooldown ticks.
  if(h.atkspdBuffT>0){ h.atkspdBuffT-=dt; if(h.atkspdBuffT<=0){ h.atkspdBuffT=0; h.atkspdBuffAmt=0; } }
  if(h.consumCD){ for(const k in h.consumCD){ if(h.consumCD[k]>0) h.consumCD[k]=Math.max(0,h.consumCD[k]-dt); } }
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
    // CAS-388: Estela Ardiente legendary — the dash lays a fire wake. Enemies the roll passes
    // through take a burn DoT once per dash (h._trailSet dedupes), turning the dodge into an
    // offensive tool. Guarded on trail>0 so a boonless roll is byte-identical. Reuses the burn
    // status stack (no new damage plumbing) and drops a small ember FX to read the wake.
    if(h.bb&&h.bb.trail>0){ const set=h._trailSet||(h._trailSet=new Set());
      const td=Math.max(1,Math.round(equippedDmg(h)*h.bb.trail));
      for(const e of G.enemies){ if(e.dead||set.has(e)) continue;
        const dx=e.x-h.x, dy=e.y-h.y, rr=e.tpl.size+22;
        if(dx*dx+dy*dy<=rr*rr){ set.add(e); applyStatus(e,"burn",{dmg:td}); addFx("flame",e.x,e.y,{life:0.4}); } }
      addFx("flame",h.x,h.y,{life:0.35}); }
    if(h.rollT<=0) h.rolling=false; h.moved=false; }
  else { const mv=io.moveVec(); const atkSlow=(h.atkAnim>0)?0.45:1; // commit to the swing — no free strafe-spam
    const statusSlow=(h.slowT>0)?(h.slow||1):1; // CAS-118: a mob-inflicted slow drags the hero down (readable: HUD tint + icon)
    const sp=(h.moveSpeed||CFG.heroSpeed)*(1+(affixTotals(h).movespd+(h.tt?h.tt.movespd:0))/100)*statusSlow*((h.bb&&h.bb.moveMul)||1); // CAS-100 class mobility · CAS-117 affix + CAS-119 talent +vel.mov · CAS-383 Viento Veloz
    h.vx=mv[0]*sp*atkSlow; h.vy=mv[1]*sp*atkSlow;
    h.moved=!!(mv[0]||mv[1]);
    if(h.moved){ moveEnt(h,h.vx*dt,h.vy*dt,12); h.walkT+=dt*8;
      h.dustT=(h.dustT||0)+dt; if(h.dustT>0.15){ h.dustT=0; addFx("dust", h.x-h.vx*0.03, h.y+15-h.vy*0.02); }
      // CAS-131: footstep SFX on a walk cadence (decoupled from the dust pulse).
      h.stepT=(h.stepT||0)+dt; if(h.stepT>0.30){ h.stepT=0; audio.sfx.step(); }
      // CAS-347 (board CAS-346): the sprite always faces where it WALKS. While moving and
      // not actively aiming (mouse/skill button held), facing tracks the movement vector for
      // EVERY input type (was touch-only) — so on desktop the hero no longer stares at the
      // cursor while strolling. Combat aim is preserved: holding the mouse sets io.aimActive
      // (faceMouse below), so clicks/casts still point at the cursor. Idle keeps the last
      // facing (we only write it inside this h.moved branch → no reset to front). Zero-balance.
      if(!io.aimActive) h.facing=Math.atan2(mv[1],mv[0]); }
    else h.walkT=0;
  }
  if(!io.isTouch && io.aimActive) io.aim(); // CAS-347: steer to cursor ONLY while aiming (mouse held); plain walking faces movement (above)
  // CAS-256: animState priority — special (deliberate cast) and hurt (hit-react) sit
  // above locomotion/attack so they read clearly, but BELOW dead. Purely visual: this
  // only chooses the rendered strip, it does not touch movement/attack/CD logic.
  { let ns = h.dead?"dead": (h.specialAnim>0)?"special": (h.hurtAnim>0)?"hurt": h.rolling?"roll": h.atkAnim>0?"attack": h.moved?"walk":"idle";
    if(ns!==h.animState){ h.animState=ns; h.animT=0; } else h.animT+=dt; }

  // skull timers
  const s=G.skull; if(s.t>0){ s.t-=dt; if(s.t<=0){ s.level=0; s.kills=0; } }
  if(s.killT>0){ s.killT-=dt; if(s.killT<=0) s.kills=0; }

  // enemies
  updateEnemies(dt);
  updateCorpses(dt); // CAS-317: age + reap rich-anim boss death corpses (presentation-only)
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
      if(!wallHere && dist2(tx,ty,h.x,h.y)>240*240) maybeAffix(applyZoneScale(spawnEnemy(tp,tx,ty), sp.zone)); } } // CAS-247: a fraction of natural spawns roll an elite affix

  if(h.hp<=0) heroDie();
  // camera (presentation-only; reads plain viewport numbers, never the DOM)
  // CAS: centre the hero in the VISIBLE game area (left of the right sidebar, above the bottom
  // bar), not the whole canvas — the world is drawn full-screen and the panels cover the rest.
  G.cam.x=lerp(G.cam.x, h.x-view.gcx()/view.zoom(), 0.14);
  G.cam.y=lerp(G.cam.y, h.y-view.gcy()/view.zoom(), 0.14);
  if(G.shake>0) G.shake=Math.max(0,G.shake-dt*30);
}

// CAS-317: age the rich-anim boss death corpses and reap them once the death strip has
// played out (one-shot ~0.9s) plus a hold + fade tail. CORPSE_LIFE is also the divisor the
// renderer reads for the fade-out, so keep the two in sync. Pure dt, no RNG.
export const CORPSE_LIFE=2.6;
function updateCorpses(dt){ const C=G.corpses;
  for(let i=C.length-1;i>=0;i--){ C[i].t+=dt; if(C[i].t>=CORPSE_LIFE) C.splice(i,1); } }
function updateEnemies(dt){ const h=G.hero;
  for(const e of G.enemies){
    e.hurtFlash=Math.max(0,e.hurtFlash-dt);
    if(e.hurtT>0) e.hurtT=Math.max(0,e.hurtT-dt); // CAS-317: one-shot hurt-flinch window (rich-anim boss)
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
    { let ns;
      // CAS-317: a rich-anim boss (dragon) drives the extended state set. A committed attack
      // splits into attack1 (basic) vs attack2 (the telegraphed heavy/combo = specialNow);
      // a non-attack hit shows the one-shot HURT flinch before falling back to walk/idle.
      // death is NOT an animState here — it plays on the presentation-only corpse (killEnemy).
      if(e.tpl.richAnim){
        if(e.state==="windup"||e.state==="strike") ns=e.specialNow?"attack2":"attack1";
        else if(e.hurtT>0) ns="hurt";
        else if(e.state==="chase") ns="walk";
        else ns="idle";
      } else if(e.tpl.arch==="warlock"){
        // CAS-321 dark_demon_3: a hybrid drives BOTH board strips off the committed attack —
        // `cast` (warlock zap, e.castNow set at windup) vs `attack` (claw, melee). idle/walk
        // have no demon strip → the renderer falls back to the enemy_demon cutout (breathe/bob).
        ns=(e.state==="windup"||e.state==="strike") ? (e.castNow?"cast":"attack") : (e.state==="chase")?"walk":"idle";
      } else ns=(e.state==="windup"||e.state==="strike")?"attack":(e.state==="chase")?"walk":"idle";
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
            // CAS-321 warlock hybrid: pick CLAW vs CAST by distance the instant the attack
            // commits — outside `meleeR` it zaps (castNow → "cast" strip + bolt), inside it claws.
            e.castNow = (e.tpl.arch==="warlock") && (d > (e.tpl.meleeR||50));
            // CAS-210: a punisher arms its COMBO chain at the START of a fresh sequence — the
            // follow-up swings re-enter windup directly from strike (below), never via chase.
            if(e.tpl.arch==="punisher") e.comboLeft=(e.tpl.combo||2)-1;
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
      // CAS-210: FOUNTAINS-style windup charge tell — pulsing ring that grows from orange→red.
      // fxRng-based so purely cosmetic (no sim determinism impact).
      e._windupT=(e._windupT||0)+dt; if(e._windupT>=0.11){ e._windupT=0;
        addFx("windupring",e.x,e.y,{ang:e.facing,life:0.22,r:12+frr(0,6)}); }
      if(e.st<=0){ e.state="strike";
        // strike-window length per archetype: rusher lunge + charger charge need a longer
        // window for the dash to read/travel; everyone else lands on the "now!" instant.
        e.st=(e.specialNow)?0.12:(e.tpl.arch==="charger")?0.36:(e.tpl.arch==="rusher")?0.2:0.12;
        // CAS-447: a boss/champion swing carries an audible whoosh at the COMMIT — the
        // telegraph reads by ear even when the hit is dodged (specials keep their windup roar).
        if(e.isBoss||e.champion||e.capstone){ audio.sfx.bossAtk&&audio.sfx.bossAtk(); }
        // CAS-321: warlock claw flashes at meleeR; its cast (and any ranged mob) uses range 0.
        const _sfRange = e.tpl.ranged ? 0 : (e.tpl.arch==="warlock" ? (e.castNow?0:(e.tpl.meleeR||e.tpl.range)) : e.tpl.range);
        addFx("strikeflash",e.x,e.y,{ang:e.facing,range:_sfRange,life:0.18}); // the "now!" instant
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
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl,e); // CAS-247: pass src for Vampiric leech-on-hit
          addFx("spark",e.x+Math.cos(a)*14,e.y+Math.sin(a)*14); }
      }
      // CAS-126 charger CHARGE: barrel the full `charge` px along the LOCKED facing over
      // the strike window, ploughing PAST the hero (it does not stop on the hero — closing
      // the lane was the tell). One contact hit + big knock; sidestepping the lane avoids it.
      else if(e.tpl.arch==="charger" && !e.specialNow){
        const cspd=(e.tpl.charge||300)/0.36; moveEnt(e,Math.cos(e.facing)*cspd*dt,Math.sin(e.facing)*cspd*dt,e.tpl.size*0.6);
        if(!e.hitDone && d<=e.tpl.size+12){ e.hitDone=true;
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl,e); // CAS-247: pass src for Vampiric leech-on-hit
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
          if(d<=R+e.tpl.size*0.4){ const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(e.tpl.dmg,a,e.tpl.infl,e); } // CAS-247: src for Vampiric
          addFx("novacast",e.x,e.y+e.tpl.size*0.35,{r:R,col:"#ff7a3a",life:0.4}); shakeAdd(8);
        }
        // CAS-321 warlock hybrid: cast → fire a bolt (animState "cast"); claw → a tight melee
        // hit at meleeR (animState "attack"). Mirrors the ranged/melee strike paths below but
        // switches on the per-strike castNow flag so ONE mob plays BOTH board animations.
        else if(e.tpl.arch==="warlock"){
          if(e.castNow){ const a=Math.atan2(h.y-e.y,h.x-e.x); e.facing=a;
            G.projectiles.push({x:e.x+Math.cos(a)*16, y:e.y-4+Math.sin(a)*16, vx:Math.cos(a)*e.tpl.projspd, vy:Math.sin(a)*e.tpl.projspd, life:2.4, dmg:e.tpl.dmg, kind:e.tpl.proj||"bolt", enemy:true, ang:a, infl:e.tpl.infl});
            addFx("spark",e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);
          } else { const R=e.tpl.meleeR||50;
            if(d<=R+e.tpl.size*0.5){ const a=Math.atan2(h.y-e.y,h.x-e.x); if(Math.abs(angDiff(a,e.facing))<1.3) damageHero(e.tpl.dmg,a,e.tpl.infl,e); }
            addFx("spark",e.x+Math.cos(e.facing)*R*0.6,e.y+Math.sin(e.facing)*R*0.6);
          }
        }
        else if(e.tpl.ranged){ const a=Math.atan2(h.y-e.y,h.x-e.x); e.facing=a;
          G.projectiles.push({x:e.x+Math.cos(a)*16, y:e.y-4+Math.sin(a)*16, vx:Math.cos(a)*e.tpl.projspd, vy:Math.sin(a)*e.tpl.projspd, life:2.4, dmg:e.tpl.dmg, kind:e.tpl.proj||"spear", enemy:true, ang:a, infl:e.tpl.infl}); // CAS-118: bolt carries the slow infl
          addFx("spark",e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);
        } else {
          if(d<=e.tpl.range+10){ const a=Math.atan2(h.y-e.y,h.x-e.x); if(Math.abs(angDiff(a,e.facing))<1.2) damageHero(e.tpl.dmg,a,e.tpl.infl,e); } // CAS-247: src for Vampiric
          addFx("spark",e.x+Math.cos(e.facing)*e.tpl.range*0.6,e.y+Math.sin(e.facing)*e.tpl.range*0.6);
        }
      }
      if(e.st<=0){
        // CAS-210 punisher COMBO: while the chain has swings left, re-enter windup directly
        // (a FASTER `comboWindup` follow-up that keeps tracking the hero) instead of recover —
        // so a single clean dodge isn't enough and greedy re-engagement gets clipped. When the
        // chain is spent, drop into a LONG `punishRecover`: the read-and-punish/riposte window.
        if(e.tpl.arch==="punisher" && (e.comboLeft||0)>0){
          e.comboLeft--; e.state="windup"; e.st=e.tpl.comboWindup||(e.tpl.windup*0.5); e.hitDone=false;
          addFx("strikeflash",e.x,e.y,{ang:e.facing,range:0,life:0.12}); audio.sfx.ehurt();
        } else {
          e.state="recover"; e.st=(e.tpl.arch==="punisher")?(e.tpl.punishRecover||e.tpl.recover*1.8):e.tpl.recover; e.specialNow=false;
        }
      }
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
  grantMats(2);    // CAS-237: an ambush elite drops forge material toward the next upgrade
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
// CAS-210: a perfect dodge also ARMS the riposte window (CFG.riposteWindow) — the next hero
// hit lands as a guaranteed crushing counter. A slightly longer focus-freeze sells the moment.
function perfectDodge(ang){ const h=G.hero; if((h._pdCD||0)>0) return; h._pdCD=0.5;
  freeze(8); h.iframe=Math.max(h.iframe,0.20); h.mp=Math.min(h.maxMp,h.mp+8);
  h.riposte=CFG.riposteWindow; // arm the counter — consumed by the next hitEnemy connect
  floater(h.x,h.y-34,STR.perfectDodge,"#bfeaff"); addFx("dodgering",h.x,h.y,{life:0.36});
  addFx("shockring",h.x,h.y,{r:30,life:0.34}); audio.sfx.roll(); }
function damageHero(dmg,ang,infl,src){ const h=G.hero; if(h.dead) return false;
  if(h.iframe>0){ if(h.rolling) perfectDodge(ang); return false; } // only an active roll earns the dodge, not mercy i-frames
  // CAS-119: a dodge build (esquiva) can fully negate a connecting telegraphed strike
  // on a srand roll — reading the tell still beats it for free, this rewards investing
  // in evasion. srand consumed only when the build HAS dodge (baseline unchanged).
  const tt=h.tt; if(tt&&tt.dodge>0 && srand()*100<tt.dodge){ h.iframe=Math.max(h.iframe,0.2);
    floater(h.x,h.y-34,STR.talentDodge,"#bfeaff"); addFx("dodgering",h.x,h.y,{life:0.32}); audio.sfx.roll(); return false; }
  const def=equippedDef(h); const real=Math.max(1,dmg-def*0.6);
  h.hp-=real; h.hurtFlash=0.18; audio.sfx.hurt(); shakeAdd(6); freeze(4); floater(h.x,h.y-30,"-"+Math.round(real),"#ff7a6a");
  h.hurtAnim=HURT_ANIM_DUR; // CAS-256: a landed hit plays the hit-react flinch strip (lower priority than an active cast)
  h.iframe=0.25; // brief mercy invuln
  // CAS-118: a mob's telegraphed strike can also INFLICT a status (bandit poison / wraith
  // slow). It only lands when the hit lands — dodging the telegraph (i-frames above) skips
  // it entirely, so reading the tell avoids BOTH the damage and the state. AC #3.
  if(infl && infl.type) applyStatus(h, infl.type, infl);
  // CAS-383: Coraza de Espinas boon — reflect a fraction of the damage TAKEN back to the melee
  // attacker (`src`, present for contact hits; ranged bolts pass none). Routes the retaliation
  // through hitEnemy so it crits/procs/kills exactly like any other hero hit. A dodged/i-framed
  // blow returned above → no reflect (reading the tell denies it), keeping thorns non-degenerate.
  if(src && src.hp>0 && !src.dead && h.bb && h.bb.reflect>0){
    const rd=Math.max(1,real*h.bb.reflect); const ra=Math.atan2(src.y-h.y,src.x-h.x);
    addFx("spark",src.x,src.y); hitEnemy(src,rd,ra); }
  // CAS-247 VAMPIRIC affix: when an affixed elite LANDS a hit, it leeches a fixed fraction of
  // its OWN maxHp — heals only on a connect (a dodged/i-framed hit returned above, so reading
  // the tell denies the lifesteal too). A red tick reads "it fed". Deterministic (no RNG).
  if(src && src.hp>0 && !src.dead){ const af=src.affix&&MOB_AFFIX[src.affix];
    if(af&&af.lifesteal){ const heal=Math.max(1,Math.round(src.maxHp*af.lifesteal));
      if(src.hp<src.maxHp){ src.hp=Math.min(src.maxHp, src.hp+heal); src.hurtFlash=0.08;
        floater(src.x,src.y-src.tpl.size,"+"+heal,af.col); addFx("spark",src.x,src.y); } } }
  return true;
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
      // CAS-383: Eco Arcano boon — a HERO projectile (`!p.enemy`) arcs to up to bb.chain nearest
      // OTHER enemies, dealing 60% dmg + carrying the same status. Bounded search (capped jumps,
      // 130px range, visited set) → soak-safe, no infinite loop, no per-frame alloc when chain=0.
      const cbb=(!p.enemy&&G.hero)?G.hero.bb:null;
      if(cbb&&cbb.chain>0){ let jumps=cbb.chain; const CR2=130*130; const seen=new Set([e]);
        while(jumps-->0){ let best=null,bd=CR2;
          for(const e3 of G.enemies){ if(e3.dead||seen.has(e3)) continue; const dd=dist2(p.x,p.y,e3.x,e3.y); if(dd<bd){ bd=dd; best=e3; } }
          if(!best) break; seen.add(best); addFx("spark",best.x,best.y); addFx("impact",best.x,best.y,{ang:Math.atan2(best.y-p.y,best.x-p.x),col:p.col,life:0.22});
          hitEnemy(best,p.dmg*0.6,Math.atan2(best.y-p.y,best.x-p.x)); if(p.infl) applyStatus(best,p.infl.type,p.infl); } }
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
  spawn(type,dx,dy){ const e=spawnEnemy(type, G.hero.x+(dx||0), G.hero.y+(dy||0));
    // CAS-317: any boss-flagged template (golem, dragon) spawns boss-ified + special armed,
    // matching spawnBoss(), so the QA harness can summon the dracónic boss directly.
    if(e&&e.tpl.boss){ e.isBoss=true; e.special=e.tpl.special||null; e.atkCount=0; e.specialNow=false; } return type; },
  // CAS-317: read-only boss/corpse animation observer for the QA gate (b5c10283). Lets the
  // harness assert the dracónic boss actually cycles all 6 strip states (idle/walk/attack1/
  // attack2/hurt) in vivo and leaves a death corpse. Pure read — no sim mutation.
  bossAnim(){ const b=G.enemies.find(e=>e.isBoss);
    return { enemies:G.enemies.length, corpses:G.corpses.length,
      boss: b?{ animState:b.animState, hp:Math.round(b.hp), maxHp:Math.round(b.maxHp),
        hurtT:+(b.hurtT||0).toFixed(2), specialNow:!!b.specialNow, sprite:b.tpl.sprite,
        label:b.tpl.bossLabel||null }:null }; },
  // CAS-317: deal a hero-sourced hit straight to the live boss (no melee-range/positioning
  // flake) so the QA gate can deterministically drive hurt-on-damage and death-on-zero-hp.
  // Routes the REAL hitEnemy path (hurtT flinch + killEnemy + corpse), no shortcut.
  hitBoss(n){ const b=G.enemies.find(e=>e.isBoss); if(!b) return null;
    hitEnemy(b, Math.max(1, n|0)||50, Math.PI);
    const a=this.bossAnim(); return { hpAfter:b.hp>0?Math.round(b.hp):0, dead:!!b.dead, corpses:a.corpses, animState:b.animState }; },
  // --- CAS-383 boon-draft harness hooks (tools/cas383-*.mjs); additive, read/drive the REAL paths ---
  // Read the live boon state: owned list, aggregate bundle, effective maxHp (folds hpMul), and
  // the open draft's choices (or null). Pure read — proves stacking + the draft panel's model.
  boons(){ const h=G.hero; if(!h) return null; return { list:(h.boons||[]).slice(), bb:Object.assign({},h.bb),
    maxHp:heroMaxHp(h), scene:G.scene, draft:G.draft?{choices:G.draft.choices.slice(),sel:G.draft.sel,source:G.draft.source,cursed:!!G.draft.cursed}:null,
    rerollLeft:h.rerollLeft|0, banishLeft:h.banishLeft|0, banished:(h.banished||[]).slice() }; }, // CAS-392 draft-agency state
  // --- CAS-392 draft-agency harness hooks (tools/cas392-*.mjs); additive, drive the REAL paths ---
  // Reroll the whole hand through rerollDraft (spends a charge). Returns the new cards + charge left.
  rerollDraft(){ const ok=rerollDraft(); const h=G.hero; return { ok, choices:G.draft?G.draft.choices.slice():null, rerollLeft:h?h.rerollLeft|0:0, scene:G.scene }; },
  // Banish card i through banishBoon (spends a charge, adds id to the run's banished pool). Returns
  // the new hand + charge left + the banished set so QA can prove the id never resurfaces.
  banishDraft(i){ const ok=banishBoon(i|0); const h=G.hero; return { ok, choices:G.draft?G.draft.choices.slice():null, banishLeft:h?h.banishLeft|0:0, banished:h?(h.banished||[]).slice():[], scene:G.scene }; },
  // Read the raw draft-agency budget without opening a panel.
  draftCharges(){ const h=G.hero; if(!h) return null; return { rerollLeft:h.rerollLeft|0, banishLeft:h.banishLeft|0, banished:(h.banished||[]).slice() }; },
  // Force-open a draft (bypasses needing a champion kill) so the QA gate can drive the panel
  // deterministically. Uses the REAL openDraft (same RNG pick + scene + pause).
  openDraft(){ openDraft("dev"); return G.draft?G.draft.choices.slice():null; },
  // Pick a card through the REAL pickBoon path (push + recalcBoons + resume). Returns the new state.
  pickBoon(i){ const ok=pickBoon(i|0); return { ok, list:(G.hero.boons||[]).slice(), bb:Object.assign({},G.hero.bb), scene:G.scene }; },
  // Grant a boon by id directly (stack testing without the panel). Real recalcBoons.
  grantBoon(id){ const h=G.hero; if(!h||!BOON_MAP[id]) return null; h.boons.push(id); recalcBoons(h);
    return { list:h.boons.slice(), bb:Object.assign({},h.bb), maxHp:heroMaxHp(h) }; },
  // --- CAS-394 zone-modifier ("Maldición") harness hooks (tools/cas394-*.mjs); additive, REAL paths ---
  // Read the live curse state: the open offer (or null), the accepted zone→mod map, the offered
  // zones, the modifier pool (with its stat mults), and the scene. Pure read.
  curseState(){ const h=G.hero; if(!h) return null; return { scene:G.scene,
    offer:G.curse?{ zone:G.curse.zone, mod:G.curse.mod }:null,
    curses:Object.assign({},h.curses||{}), seen:(h.curseSeen||[]).slice(),
    mods:ZONE_MODIFIERS.map(m=>({ id:m.id, hpMul:m.hpMul||1, dmgMul:m.dmgMul||1, spdMul:m.spdMul||1, affixMul:m.affixMul||1 })) }; },
  // Force the entry offer for a zone (no walk needed) → returns the rolled offer {zone,mod}.
  offerCurse(zone){ if(!HUNTS[zone]) return null; offerCurse(zone); return G.curse?{ zone:G.curse.zone, mod:G.curse.mod }:null; },
  // Accept / skip the open offer through the REAL exports (same as the input handler).
  acceptCurse(){ const ok=acceptCurse(); const h=G.hero; return { ok, curses:Object.assign({},h?h.curses:{}), scene:G.scene }; },
  skipCurse(){ const ok=skipCurse(); const h=G.hero; return { ok, seen:(h?(h.curseSeen||[]):[]).slice(), scene:G.scene }; },
  // Directly set/clear an accepted curse (scaling/reward tests without driving the panel).
  setCurse(zone,mod){ const h=G.hero; if(!h) return null; if(!h.curses) h.curses={};
    if(mod==null){ delete h.curses[zone]; } else if(HUNTS[zone]&&ZONE_MOD_MAP[mod]){ h.curses[zone]=mod; } else return null;
    return Object.assign({},h.curses); },
  // Open a draft as if `zone` was just cleared (honours hero.curses[zone] → cursed rare+ bias).
  openDraftZone(zone){ openDraft(zone); return G.draft?{ choices:G.draft.choices.slice(), cursed:!!G.draft.cursed, source:G.draft.source }:null; },
  // Re-init the hunt board (clears H.cleared/champ per zone) so a harness can re-arm+clear the SAME
  // zone twice (e.g. plain vs cursed reward A/B). Mirrors initHunts; does not touch hero/curses.
  resetHunts(){ G.hunts=initHunts(); return Object.keys(G.hunts); },
  // --- CAS-450 Conquista/World-Tier harness hooks (tools/cas450-*.mjs); additive, REAL paths ---
  // Read the live conquest state: tier, cycle trophies, the ascend offer, whether the open draft
  // is the apex hand, and the current post-spawn multipliers (null at tier 1). Pure read.
  conquestState(){ const h=G.hero; if(!h) return null; const cq=h.conquest||{tier:1,bossesDown:[]};
    const m=worldTierMods();
    return { tier:cq.tier||1, cap:WORLD_TIER.cap, bossesDown:(cq.bossesDown||[]).slice(),
      zones:CONQUEST_ZONES.slice(), scene:G.scene, ascend:G.ascend?{ tier:G.ascend.tier }:null,
      draftApex:!!(G.draft&&G.draft.apex), mods:m?{ hpMul:m.hpMul, dmgMul:m.dmgMul, affixMul:m.affixMul }:null }; },
  // Directly set tier / cycle trophies (validated) so the harness can stage a 3/4 cycle or probe
  // tier-N scaling without grinding four real clears per gate. Scaling tests still go through the
  // REAL spawn paths (zoneTier/armHunt read worldTierMods lazily).
  setConquest(tier,down){ const h=G.hero; if(!h) return null; const cq=h.conquest||(h.conquest={tier:1,bossesDown:[]});
    if(tier!=null) cq.tier=Math.min(WORLD_TIER.cap,Math.max(1,tier|0));
    if(Array.isArray(down)) cq.bossesDown=down.filter(z=>CONQUEST_ZONES.indexOf(z)>=0);
    return { tier:cq.tier, bossesDown:cq.bossesDown.slice() }; },
  // Accept / decline the open ascend offer through the REAL exports (same as the input handler).
  acceptAscend(){ const ok=acceptAscend(); const h=G.hero;
    return { ok, tier:(h&&h.conquest&&h.conquest.tier)||1, scene:G.scene }; },
  declineAscend(){ const ok=declineAscend(); const h=G.hero;
    return { ok, tier:(h&&h.conquest&&h.conquest.tier)||1, scene:G.scene }; },
  // --- CAS-169 customization contract consumed by tools/cas169-customize.mjs — additive ---
  customizeState(){ return customizeState(); },
  setPartColor(slot,color){ return setPartColor(slot,color); },
  cycleVariation(kind,dir){ return cycleVariation(kind,dir); },
  resetCustomize(){ return resetCustomize(); },
  defaultPalette(cls){ return defaultPalette(cls); },
  tp(tx,ty){ G.hero.x=tx*TS; G.hero.y=ty*TS; return [G.hero.x,G.hero.y]; },
  // --- gear/progression harness hooks (tools/gear.mjs); additive, see CAS-29 ---
  tpZone(zone){ const r=world[zone]; if(!r) return null; G.hero.x=(r.x+r.w/2)*TS; G.hero.y=(r.y+r.h/2)*TS; return zone; },
  seed(n){ seed(n>>>0); return n>>>0; },                       // reseed the sim RNG (deterministic drops)
  gear(){ const h=G.hero; return { dmg:equippedDmg(h), def:equippedDef(h), weapon:gearName(h.equip.weapon),
    affix:affixTotals(h), equip:["weapon","body","shield"].map(s=>({slot:s,defId:h.equip[s].defId,rarity:h.equip[s].rarity,stat:gearStat(h.equip[s]),affixes:h.equip[s].affixes||[]})) }; },
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
  // CAS-196: read the Coliseo Eterno power gate (mirrors frostGate, the DEEPEST gate).
  trialGate(){ const h=G.hero; const pw=heroPower(h); return { power:pw, req:TRIAL_POWER_REQ,
    unlocked:pw>=TRIAL_POWER_REQ, zone:zoneOf(world,h.x,h.y), upg:{...(h.upg||{})}, lvl:h.lvl }; },
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
  // CAS-342: arm ANY hunt zone's capstone/champion for the QA harness (mirrors armFinalBoss but
  // zone-parametric). Meets the kill quota so spawnChampion summons the REAL capstone (no shortcut
  // around the windup→strike/special AI or the onChampionKill reward path), then parks + tops the
  // hero on it. Returns the live capstone identity so the gate can assert sprite/richAnim/special.
  armHunt(zone){ const H=G.hunts&&G.hunts[zone]; if(!H||!HUNTS[zone]) return null;
    if(!H.champ && !H.cleared){ H.kills=HUNTS[zone].need; spawnChampion(zone); }
    const e=H.champ; if(!e) return null; const h=G.hero; h.x=e.x+18; h.y=e.y; h.maxHp=4000; h.hp=4000; h.iframe=0;
    return { name:e.tpl.champName, capstone:!!e.capstone, richAnim:!!e.tpl.richAnim, sprite:e.tpl.sprite,
      hasSpecial:!!e.special, specialSlam:e.special&&e.special.slam?e.special.slam.count:0,
      tiers:e.rwdTier||null, minR:e.rwdMinR||null, hp:Math.round(e.hp) }; },
  // Dismiss the victory screen → free play (mirrors the input handler).
  ackVictory(){ dismissVictory(); return G.scene; },
  // CAS-132: drive the REAL hero-death path (heroDie → deaths++, scene "dead") so the
  // analytics funnel's "primera muerte" step can be QA-verified headlessly. Dev-only,
  // additive — no balance/gameplay change (the live game never calls this).
  killHero(){ heroDie(); return { deaths:G.hero.deaths, scene:G.scene }; },
  // CAS-277: end-of-run recap contract consumed by tools/cas277-recap.mjs — read-only.
  // recapState = the frozen recap delta (null until a death); runBase = the live baseline.
  recapState(){ return G.recap?Object.assign({},G.recap):null; },
  runBase(){ return G.run?Object.assign({},G.run):null; },
  retryRun(){ respawn(); return { scene:G.scene, recap:G.recap }; },
  returnToHub(){ returnToHub(); return { scene:G.scene, recap:G.recap }; },
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
  // CAS-256: drive a real incoming hit (deterministic angle) through damageHero so a
  // harness can observe the hit-react state without choreographing a mob attack. Clears
  // the mercy i-frame first so the blow always lands.
  hurt(n){ const h=G.hero; h.iframe=0; h.rolling=false; damageHero(Math.max(1,n|0)||10,Math.PI,null); return { hp:Math.round(h.hp), hurtAnim:+h.hurtAnim.toFixed(3), animState:h.animState }; },
  // CAS-256: clear skill cooldowns + top up mp so a harness can cast on demand (e.g. to
  // test the cast-vs-flinch priority back-to-back). Dev-only.
  clearSpellCD(){ const h=G.hero; h.spellCD=[0,0,0,0]; h.mp=h.maxMp||h.mp; return h.spellCD.slice(); },
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
  // CAS-319: drive Maren's rest-heal end-to-end through the REAL interact() path. Damages the
  // hero + drains MP, parks at the requested offset from Maren (default ~58px → proves the
  // fountainRange-60 reach the talkRange-56 NPC path would have missed), fires interact(), and
  // returns before/after so the harness can assert full HP/MP + respawn-at-Maren + no shop.
  fountainHealProbe(off){ const m=world.npcs.find(n=>n.role==="fountain"); if(!m) return null;
    const h=G.hero; h.hp=1; h.mp=0; const d=(off==null?58:off);
    h.x=m.x+d; h.y=m.y; h.respawn=null;
    const before={hp:h.hp,mp:h.mp,maxHp:heroMaxHp(h),maxMp:h.maxMp,scene:G.scene,dist:Math.round(Math.hypot(h.x-m.x,h.y-m.y))};
    interact();
    return { before, after:{hp:h.hp,mp:h.mp,scene:G.scene,
      respawnAtMaren: !!h.respawn && Math.abs(h.respawn.x-m.x)<1 && Math.abs(h.respawn.y-(m.y+TS))<1,
      toast:G.toast, maren:{x:Math.round(m.x),y:Math.round(m.y)} } }; },
  // CAS-134: park the hero on the Bounty-Board steward so the REAL interact()→dialogue→
  // bounty-board path (E twice) can be driven by the daily harness / screenshot tool.
  bountyTP(){ for(const n of world.npcs){ if(n.role==="bounty"){ G.hero.x=n.x; G.hero.y=n.y+10; return [Math.round(n.x),Math.round(n.y)]; } } return null; },
  // CAS-386: park the hero on Yára la Cronista so the REAL interact()→dialogue→bestiary
  // path (E twice) can be driven by the QA harness / screenshot tool.
  codexTP(){ for(const n of world.npcs){ if(n.role==="codex"){ G.hero.x=n.x; G.hero.y=n.y+10; return [Math.round(n.x),Math.round(n.y)]; } } return null; },
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
  // --- CAS-192 combat-consumable harness hooks (tools/cas192-consumables.mjs); additive ---
  // Read the consumable state: stash quantities, selected slot, the shared use cooldown,
  // and the live fury atkspd-buff timer + DoT/slow status the antídoto purges.
  consumState(){ const h=G.hero; const selId=(CONSUMABLES[h.consumSel|0]||{}).id; return { consum:{...(h.consum||{})}, sel:h.consumSel|0,
    selId, cd:+((h.consumCD&&h.consumCD[selId])||0).toFixed(2), cds:{...(h.consumCD||{})},
    atkspdBuffT:+(h.atkspdBuffT||0).toFixed(2), atkspdBuffAmt:h.atkspdBuffAmt||0,
    slowT:+(h.slowT||0).toFixed(2), dots:h.dots?Object.keys(h.dots):[], hp:Math.round(h.hp), maxHp:heroMaxHp(h),
    list:CONSUMABLES.map(c=>({id:c.id,price:c.price,cd:c.cd})) }; },
  selectConsum(i){ const h=G.hero; h.consumSel=Math.min(CONSUMABLES.length-1,Math.max(0,i|0)); return h.consumSel; },
  setConsum(id,n){ const h=G.hero; if(h.consum&&id in h.consum) h.consum[id]=Math.max(0,n|0); return {...h.consum}; },
  clearConsumCD(){ const h=G.hero; h.consumCD={}; return true; },
  setHeroHp(n){ const h=G.hero; h.hp=Math.max(1,Math.min(heroMaxHp(h),n|0)); return Math.round(h.hp); },
  useConsum(){ const ok=doConsumable(); return Object.assign({ok},this.consumState()); },
  // --- CAS-197 balance-cohesion harness hooks (tools/cas197-balance.mjs); additive ---
  // Give the weapon a real atkspd affix (affixTotals self-caps it at AFFIX_CAP 40) so the
  // harness can drive the loot half of the combined atkspd sum through the real read path.
  giveAtkspdWeapon(amt){ const w=G.hero.equip.weapon||(G.hero.equip.weapon={slot:"weapon",defId:"w_steel",rarity:"rare"});
    w.affixes=[{id:"atkspd",amt:amt||30}]; return affixTotals(G.hero).atkspd; },
  // Force the talent half of the sum to an arbitrary value (bypasses the per-class node
  // ceiling) purely to PROVE the global ATKSPD_TOTAL_CAP clamp fires when the three systems
  // compound past it — recomputed away by any real talent change, so it can't leak into play.
  setTTAtkspd(v){ const h=G.hero; if(!h.tt) h.tt=zeroTT(); h.tt.atkspd=Math.max(0,v|0); return this.atkspdTotal(); },
  // measure the REAL swing cadence (cooldown the formula produces) — proves the fury
  // buff shortens it. Reads the same atkspd term heroAttack() builds.
  atkCadence(){ const h=G.hero; const cfg=ATK[h.cls||"warrior"];
    const atkspd=heroAtkspd(h);                       // CAS-197: capped sum (single source)
    return +(cfg.cd/(1+atkspd/100)).toFixed(4); },
  // CAS-197 — expose the capped combined atkspd + its cap so the balance harness can prove
  // the three-system cohesion ceiling holds (drive affix+talent+fury past 130 → clamps).
  atkspdTotal(){ return { total:heroAtkspd(), cap:ATKSPD_TOTAL_CAP,
    raw:(affixTotals(G.hero).atkspd+(G.hero.tt?G.hero.tt.atkspd:0)+(G.hero.atkspdBuffT>0?G.hero.atkspdBuffAmt:0)) }; },
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
  // CAS-419: DnD seam passthrough — lets the live harness prove bag reorders route
  // through the same sim authority the pointer path uses (never a render-side splice).
  moveBag(from,to){ return moveBag(from,to); },
  // CAS-117: the equip DECISION surface — snapshot combat totals + the slot's
  // equipped-vs-candidate affixes BEFORE committing, so the compare/diff (UI and
  // QA) can show the tradeoff without mutating state. Returns null for a bad index.
  equipPreview(i){ const h=G.hero; const cand=h.bag[i]; if(!cand) return null;
    const cur=h.equip[cand.slot]; const before={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h),af:affixTotals(h)};
    h.equip[cand.slot]=cand; const after={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h),af:affixTotals(h)}; h.equip[cand.slot]=cur;
    return { slot:cand.slot, equipped:{rarity:cur.rarity,stat:gearStat(cur),affixes:cur.affixes||[]},
      candidate:{rarity:cand.rarity,stat:gearStat(cand),affixes:cand.affixes||[]}, before, after }; },
  openInv(){ G.scene="inventory"; return G.scene; },
  // --- CAS-237 forja harness hooks (tools/forge.mjs); additive ---
  // Read the live forge state: currencies + each equip slot's piece, forge level, resolved
  // stat and the next-level cost (null if maxed). Proves a forge moves real combat numbers.
  forgeState(){ const h=G.hero; const slots=["weapon","body","shield"];
    return { gold:h.gold, mats:h.mats|0, dmg:equippedDmg(h), def:equippedDef(h), max:FORGE.max,
      slots:slots.map(s=>{ const inst=h.equip[s]; const cost=inst?forgeNextCost(inst):null;
        return { slot:s, name:inst?gearName(inst):null, fl:inst?forgeLevel(inst):0,
          stat:inst?gearStat(inst):0, next:cost }; }) }; },
  // Forge through the REAL forgeUpgrade (gold+mat check + deduct + level bump), then snapshot.
  forgeDo(slot){ const ok=forgeUpgrade(slot); return Object.assign({ok}, this.forgeState()); },
  setMats(n){ const h=G.hero; h.mats=Math.max(0,n|0); return h.mats; },
  openForge(){ G.scene="forge"; return G.scene; },
  // --- CAS-115 combat-archetype harness hooks (tools/archetypes.mjs); additive ---
  // Static archetype metadata straight off the data table (no sim step) so the test can
  // assert ≥3 distinct archetypes exist with their behaviour fields + danger reward.
  archMeta(type){ const t=ETPL[type]; if(!t) return null;
    return { type, arch:t.arch||null, ranged:!!t.ranged, lunge:t.lunge||0, kite:t.kite||0, aoe:t.aoe||0,
      charge:t.charge||0, summon:t.summon||null, heal:t.heal||null, // CAS-126 new-archetype fields
      combo:t.combo||0, comboWindup:t.comboWindup||0, punishRecover:t.punishRecover||0, recover:t.recover, // CAS-210 punisher fields
      sprite:t.sprite, size:t.size, meleeR:t.meleeR||0, proj:t.proj||null, projspd:t.projspd||0, // CAS-321 warlock hybrid fields
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
    return { type:e.type, arch:e.tpl.arch||null, state:e.state, comboLeft:e.comboLeft||0, // CAS-210: punisher chain counter
      animState:e.animState||null, castNow:!!e.castNow, // CAS-321: which board strip the demon is showing (attack=claw / cast=warlock)
      dist:Math.round(Math.hypot(e.x-h.x,e.y-h.y)), ex:Math.round(e.x), ey:Math.round(e.y),
      heroDmgTaken:Math.round(100000-h.hp), enemyProj:G.projectiles.filter(p=>p.enemy).length }; },
  // Move the hero to a fixed offset from the arena mob (to test dodging out of an AoE /
  // sidestepping a lunge mid-windup) without touching its AI state.
  archMoveHero(dx,dy){ const e=G.enemies[0]; if(!e) return null; const h=G.hero;
    h.x=e.x+(dx||0); h.y=e.y+(dy||0); h.iframe=0; return { dist:Math.round(Math.hypot(e.x-h.x,e.y-h.y)) }; },
  // --- CAS-210 punisher-combo + riposte harness hooks (tools/cas210-combat.mjs); additive ---
  // riposteSnap: read the live counter window + cfg constants so the test can assert the
  // perfect-dodge → riposte payoff math without guessing internals.
  riposteSnap(){ const h=G.hero; return { riposte:+(h.riposte||0).toFixed(3), pdCD:+(h._pdCD||0).toFixed(3),
    window:CFG.riposteWindow, mult:CFG.riposteMult }; },
  // armRiposte: drive the REAL perfectDodge() path (same one a frame-perfect roll triggers),
  // so the test proves the production code arms the window — not a back-door flag.
  armRiposte(){ const h=G.hero; h._pdCD=0; perfectDodge(h.facing); return +(h.riposte||0).toFixed(3); },
  // hitProbe: spawn ONE fresh dummy at a fixed offset, face it, then land a single real
  // hitEnemy() at a fixed base dmg — optionally with the riposte window armed first — and
  // return the HP delta. Two calls (with/without) prove the riposte multiplies the hit.
  // Determinism baseline is untouched: no talents/crit, riposte path consumes no srand.
  hitProbe(withRiposte, baseDmg){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.riposte=0; h.tt=null; h.mperk=null;
    h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const e=spawnEnemy("revenant", h.x+40, h.y); if(!e) return null; e.state="idle"; e.maxHp=e.hp=1e9;
    const ang=Math.atan2(e.y-h.y,e.x-h.x); h.facing=ang;
    if(withRiposte){ h._pdCD=0; perfectDodge(ang); }
    const before=e.hp; hitEnemy(e, baseDmg||100, ang); return { dmg:Math.round(before-e.hp), riposteAfter:+(h.riposte||0).toFixed(3) }; },
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
  // --- CAS-247 elite-affix harness hooks (tools/cas247-affixes.mjs); additive, ?dev only ---
  // Static affix table + roll rate straight off the data (no sim step) so the test can assert
  // the 4 affixes exist with distinct modifier fields and the ~10-15% spawn rate.
  affixMeta(){ return { rate:MOB_AFFIX_RATE, ids:MOB_AFFIX_IDS.slice(),
    defs:MOB_AFFIX_IDS.map(id=>Object.assign({id},MOB_AFFIX[id])) }; },
  // Roll-rate probe: spawn N eligible mobs off-screen through the REAL maybeAffix path (same
  // sim RNG the world spawner uses) and tally how many got an affix → proves the ~10-15% band.
  // Cleans up after itself. Reseed first for a repeatable count.
  affixRollRate(n, type){ n=Math.max(1,n|0); const before=G.enemies.length; let affixed=0; const tally={};
    for(let i=0;i<n;i++){ const e=maybeAffix(spawnEnemy(type||"skeleton", -9000-i, -9000));
      if(e.affix){ affixed++; tally[e.affix]=(tally[e.affix]||0)+1; } }
    G.enemies.length=before; // drop the throwaway probes
    return { n, affixed, rate:+(affixed/n).toFixed(3), tally }; },
  // Clean single-mob arena with a FORCED affix: clear entities, tanky hero, spawn ONE mob and
  // bake `id` via the REAL applyAffix path, set it chasing. Returns base-vs-affixed stats so the
  // test can assert the scale/speed/hp boosts without guessing internals. dx = spawn offset.
  affixArena(id, type, dx){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    const base=ETPL[type||"skeleton"]; const e=spawnEnemy(type||"skeleton", h.x+(dx||120), h.y);
    if(!e) return null; applyAffix(e, id); e.state="chase";
    return { id, type:e.type, affix:e.affix, affixGait:e.affixGait||1,
      base:{hp:base.hp, spd:base.spd, size:base.size, xp:base.xp, gold:base.gold.slice(), gearChance:base.gearChance||0},
      mod:{hp:e.tpl.hp, spd:e.tpl.spd, size:e.tpl.size, xp:e.tpl.xp, gold:e.tpl.gold.slice(), gearChance:+(e.tpl.gearChance||0).toFixed(3)} }; },
  // Live snapshot of the arena mob (+ hero dmg taken + mob hp) for affix-behaviour probes.
  affixSnap(){ const e=G.enemies[0], h=G.hero; if(!e) return null;
    return { affix:e.affix||null, state:e.state, alive:!!(e.hp>0), hp:Math.round(e.hp), maxHp:Math.round(e.maxHp),
      dist:Math.round(Math.hypot(e.x-h.x,e.y-h.y)), heroDmgTaken:Math.round(100000-h.hp), enemyCount:G.enemies.length }; },
  // Land ONE real hitEnemy() of `baseDmg` on the arena mob (no crit/talents → deterministic) and
  // return the HP delta. Two calls (armored vs plain) prove ARMORED soaks a fraction of the blow.
  affixHit(baseDmg){ const e=G.enemies[0], h=G.hero; if(!e) return null;
    h.tt=null; h.mperk=null; h.riposte=0; const ang=Math.atan2(e.y-h.y,e.x-h.x); h.facing=ang;
    const before=e.hp; hitEnemy(e, baseDmg||100, ang); return { taken:Math.round(before-e.hp), hp:Math.round(e.hp), alive:!!(e.hp>0) }; },
  // Kill the arena mob (index 0) THIS instant via the REAL killEnemy and report the hero damage
  // taken — proves a VOLATILE affix erupts its on-death AoE only when the hero is in the blast
  // radius (pair with affixArena(dx) to place the corpse in or out of range). archMoveHero can
  // reposition the hero first; the burst reads the hero's live distance at the moment of death.
  affixKill(){ const e=G.enemies[0], h=G.hero; if(!e) return null;
    e.tpl=Object.assign({},e.tpl,{xp:0,gold:[0,0]}); // isolate the on-death BURST from the xp level-up full-heal
    const before=h.hp; e.hp=0; killEnemy(e);          // measure across the kill instant only
    return { heroDmgTaken:Math.max(0,Math.round(before-h.hp)), enemyCount:G.enemies.length }; },
  // Spawn-kill a forced-affix mob THIS instant via the real killEnemy trash branch (gear roll
  // forced by seeding so the elevated gearChance lands), returning the drops → proves the
  // xp/gold/Forja-gear reward tie-in (AC: elites pay more, feed CAS-237/243).
  affixSpawnKill(id, type, zone){ const h=G.hero; const before=G.drops.length; const baseXp=ETPL[type||"skeleton"].xp;
    const e=spawnEnemy(type||"skeleton", h.x, h.y); applyAffix(e, id); e.scaleZone=zone||"field";
    e.hp=0; killEnemy(e);
    return { baseXp, xp:e.tpl.xp, gearChance:+(e.tpl.gearChance||0).toFixed(3),
      drops:G.drops.slice(before).map(d=>({ kind:d.kind, rarity:d.rarity, tier:d.tier, amt:d.amt||0 })) }; },
  // --- CAS-149 Elite-Mastery harness hooks (tools/cas149-progression.mjs) ---
  // Live, read-only Mastery telemetry: lifetime elite kills, derived rank, next threshold,
  // and the player's current maxHp (so the test can assert the rank-up +maxHp baked in).
  masterySnap(){ const h=G.hero; const k=h?(h.eliteKills|0):0; const r=masteryRank(k);
    const nm=masteryNextMilestone(k);
    return { eliteKills:k, rank:r, next:masteryNextAt(r), maxHp:h?Math.round(h.maxHp):0, hp:h?Math.round(h.hp):0,
      // CAS-150 reward-track read-out: live perk bundle + unlocked count + next milestone.
      mperk:h?Object.assign({},h.mperk):null, unlocked:masteryUnlocked(k),
      effMaxHp:h?Math.round(heroMaxHp(h)):0, nextMilestone:nm?{at:nm.at, id:nm.id, name:nm.name}:null }; },
  // CAS-150: full reward-track snapshot for the panel/harness — every milestone with its
  // unlocked flag + the player's current effective derived stats from the unlocked perks.
  masteryTrackSnap(){ const h=G.hero; const k=h?(h.eliteKills|0):0;
    return { eliteKills:k, track:masteryTrack(k), perks:h?Object.assign({},h.mperk):zeroMP() }; },
  // CAS-150: deterministic single-melee damage probe through the REAL hitEnemy path — spawns a
  // huge-hp dummy (optionally elite-flagged), lands ONE hero hit, returns the damage dealt then
  // removes the dummy. Reseed the RNG before each call so the crit roll is identical between an
  // elite and a normal target — the ratio then isolates the "Verdugo de Élites" eliteDmgPct.
  dmgVsTarget(elite){ const h=G.hero; if(!h) return 0; const e=spawnEnemy("orc", h.x+40, h.y);
    e.hp=1e9; e.maxHp=1e9; e.shielded=false; if(elite) e.elite=true;
    const before=e.hp; hitEnemy(e, equippedDmg(h), 0); const dealt=before-e.hp;
    const i=G.enemies.indexOf(e); if(i>=0) G.enemies.splice(i,1); return Math.round(dealt*100)/100; },
  // Set the lifetime elite-kill counter directly (no rewards/rank-bake), then REBUILD the
  // derived reward-track perk bundle so the hero's effective stats reflect the parked count
  // (the CAS-150 perks are derived, never baked). Lets a test jump to a milestone and observe.
  setEliteKills(n){ const h=G.hero; if(h){ h.eliteKills=Math.max(0,Math.floor(n||0)); recalcMastery(h); } return h?(h.eliteKills|0):0; },
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
  floaterDump(){ return G.floaters.slice(-12).map(f=>({ txt:f.txt, col:f.col, pop:+(f.pop||1).toFixed(2), small:!!f.small, crit:!!f.crit, dx:+(f.dx||0) })); },
  // CAS-273: spawn a single normal-HP mob, zero shake, then drive the REAL kill path
  // (killEnemy via a lethal hitEnemy) and report the shake the death produced — proves
  // the "shake escalado por muerte" kick fires for ordinary kills and respects reduceMotion.
  killShakeProbe(){ G.enemies.length=0; this.clearFx();
    const h=G.hero; h.dead=false; h.iframe=0; h.maxHp=h.hp=100000;
    const e=spawnEnemy("skeleton", h.x+22, h.y); if(!e) return null;
    e.maxHp=e.hp=1; h.facing=Math.atan2(e.y-h.y,e.x-h.x);
    const before=G.shake; hitEnemy(e, 99999, h.facing);
    return { killed:!G.enemies.includes(e), shakeDelta:+(G.shake-before).toFixed(2), shake:+G.shake.toFixed(2), reduceMotion:!!G.settings.reduceMotion }; },
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
