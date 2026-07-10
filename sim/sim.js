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
import { TS, MAP_W, MAP_H, T_WATER, T_CALDERA, CFG, ATK, ETPL, SPELLS, ACTIVE_ABILITIES, ABILITY_MAP, DEFAULT_LOADOUT, ULTIMATES, ULTIMATE_MAP, ULT_CHARGE_PER_DMG, ULT_CHARGE_PER_KILL, ULT_OFFER_N, ABILITY_RANKS, ABILITY_RANK_MAP, ABILITY_UNLOCKS, CLASS_STATS, HUNTS, ZONE_TIER, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, STAGE1_GOAL, STATUS, CONSUMABLES, ATKSPD_TOTAL_CAP, AMBUSH, MOB_AFFIX, MOB_AFFIX_IDS, MOB_AFFIX_RATE, MOB_AFFIX_ESSENCE, CHAMPION, CHAMPION_RATE, LEGENDARY, MASTERY, CUSTOMIZE, BOONS, BOON_MAP, BOON_RARITY, BOON_DRAFT_N, SYNERGIES, boonRarityWeight, ZONE_MODIFIERS, ZONE_MOD_MAP, CURSE_DEPTH_BONUS, CONQUEST_ZONES, WORLD_TIER, ARENA, ZONE_EVENTS, SOCKETS, NEW_MOBS, CODEX, TITLES, PACTS, WEAPON_AFFIXES, FRENZY, PARRY, TELEGRAPH, DODGE, ENEMY_ABILITIES, POISE, ZONE5, CALDERA_POWER_REQ, ZONE5_MOD } from "./config.js";
import { clamp, lerp, dist2, norm, angDiff } from "./math.js";
import { createRNG } from "./rng.js";
import { buildWorld, buildTiledWorld, zoneOf } from "./world.js";
import { buildWorldFromMapDoc, readMapDoc } from "./mapdoc.js";
import { ZONE_LOOT, gearStat, gearName, gearDef, gearCol, rarityRank, rollGearInst, equippedDmg, equippedDef, affixTotals, heroMaxHp, AFFIXES, weaponProcs, RARITY_ORDER, FORGE, forgeLevel, forgeNextCost, UNIQUES, uniqDef, uniqById, uniqInst, uniqName, uniqTotals, uniqEmpower, SETS, SET_ORDER, SET_PIECES, setPieceDef, setPieceById, setInst, setCounts, setTotals, RUNES, RUNE_ORDER, runeDef, runeName, safeSockets, socketTotals } from "./gear.js";
import { TALENTS, talentNode, talentNodes, talentTotals, talentSpent, canAllocTalent, lockReason, sanitizeTalents, talentEmpower, talentPoison, zeroTT, CRIT_BASE } from "./talents.js";

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

// CAS-1638 — legendary/unique drop RNG: a THIRD isolated stream (distinct seed so it never
// correlates with the fx stream). The legendary gate + unique pick draw from THIS stream only,
// never the authoritative srand — so the existing loot/spawn sequence is byte-identical for a
// seed at ANY legendary rate, not merely rate=0. This is the AC3 fix flagged by the CTO on
// CAS-1631: the append-only legendary roll must not consume or shift the shared srand stream.
const legRng = createRNG(0x1a2b3c4d);
// CAS-1654 — DEDICATED set-piece drop stream (distinct seed from legRng). Same
// contract: the maybeSetPiece gate + piece pick draw ONLY from this stream, never
// the authoritative srand, so with the set pool off (setRate=0) the sim is
// byte-identical to a build without sets — RNG-neutral by construction (AC4).
const setRng = createRNG(0x5e75c0de);
// CAS-1659 — DEDICATED Ultimate-draft stream (distinct seed from leg/set). The run-start 1-of-3
// offer draws ONLY from this stream, never the authoritative srand, so a run's main sequence is
// byte-identical whether or not an Ultimate is offered/drafted (AC4 [AC-RNG-STRONG]). Append-only.
// Charge accrual (hitEnemy/killEnemy) is pure arithmetic — no RNG at all.
const ultRng = createRNG(0x117a1a7e);
// CAS-1664 — DEDICATED Arena-de-Oleadas stream (distinct seed from leg/set/ult). EVERY random
// draw the wave mode makes (mob count, mob type, elite-affix/champion gate, boss pick) comes ONLY
// from here — never the authoritative srand — and the whole arena controller is HARD-GATED behind
// G.arenaMode. So a normal adventure (arenaMode off) never runs a line of arena code and stays
// byte-identical to a build without the mode at ANY arenaAffixRate (AC5 [AC-RNG-STRONG]). Like the
// other dedicated streams, seed() does NOT reset it — the determinism harness neutralises via rate 0.
const arenaRng = createRNG(0xa5e4a000);
// CAS-1681 — DEDICATED Zone-Event stream (distinct seed from leg/set/ult/arena). EVERY attribute of a
// seeded POI — whether to seed, how many, the type, the position/jitter, the guardian pick, the horde
// composition, the chest loot — draws ONLY from here, never the authoritative srand, and the whole
// seed+tick controller is HARD-GATED behind ZONE_EVENTS.enabled. So a run with events off never runs a
// line of event code and stays byte-identical to a build without the feature at ANY density (AC1
// [AC-RNG-STRONG]). Like the other dedicated streams, seed() does NOT reset it — the determinism
// harness neutralises via ZONE_EVENTS.enabled=false / density=0 (which draw ZERO from any stream).
const eventRng = createRNG(0xe7e40a1d);
// CAS-1687 — DEDICATED Runas/Engarces stream (distinct seed from leg/set/ult/arena/event; NOT one
// of the used seeds 0x1a2b3c4d/0x5e75c0de/0x117a1a7e/0xa5e4a000/0xe7e40a1d). EVERY socket/rune draw
// (the 0–2 socket-count roll at gear drop, the rune drop gate + type pick) comes ONLY from here,
// never the authoritative srand, and the whole system is HARD-GATED behind SOCKETS.enabled. So with
// sockets off (or dropRate 0) no runeRng draw happens and the sim is byte-identical to a build
// without the feature (AC1 [AC-RNG-STRONG]); at ANY rate the shared srand is provably untouched.
// Like the other dedicated streams, seed() does NOT reset it — the determinism harness neutralises
// via SOCKETS.enabled=false / setSocketRate(0) (which draw ZERO from any stream). Engarzar/desengarzar
// and socketTotals are pure arithmetic — no RNG at all.
const runeRng = createRNG(0x3c9a7b21);
// CAS-1694 — DEDICATED Nuevos-MOBS stream (distinct seed 0x4d0b7e15; NOT one of the used seeds
// 0x1a2b3c4d/0x5e75c0de/0x117a1a7e/0xa5e4a000/0xe7e40a1d/0x3c9a7b21). The 3 new caves mobs' ONLY
// random draw — a small bonus-loot roll on kill (killEnemy) — comes ONLY from here, never the
// authoritative srand, and the whole feature is HARD-GATED behind NEW_MOBS.enabled. So with the
// feature off no new mob spawns and no mobRng draw happens → the sim is byte-identical to a build
// without it (AC3 [AC-RNG-STRONG]); at ANY setting the shared srand is provably untouched. Like the
// other dedicated streams, seed() does NOT reset it — the harness neutralises via NEW_MOBS.enabled=false.
const mobRng = createRNG(0x4d0b7e15);
// CAS-1768 — DEDICATED weapon on-hit affix stream (distinct seed 0x0a771c5e; NOT one of the used seeds
// 0x1a2b3c4d/0x5e75c0de/0x117a1a7e/0xa5e4a000/0xe7e40a1d/0x3c9a7b21/0x4d0b7e15). EVERY affix randomisation
// — the drop-time roll (gate + affix pick) and the 'aturdidor' stun proc — draws ONLY from here, never the
// authoritative srand, and the whole feature is HARD-GATED behind WEAPON_AFFIXES.enabled. So with the
// feature off no draw happens and the sim is byte-identical to a build without it (AC1/AC3 [AC-RNG-STRONG]);
// at ANY setting the shared srand is provably untouched. Like the other dedicated streams, seed() does NOT
// reset it — the harness neutralises via WEAPON_AFFIXES.enabled=false (which draws ZERO from any stream).
const affixRng = createRNG(0x0a771c5e);
// CAS-1744 — DEDICATED Caldera stream (distinct seed 0xca1de5a0; NOT one of the used seeds above). The
// Caldera's ONLY new random draw — a small bonus-loot roll on a caldera-zone kill (killEnemy) — comes
// ONLY from here, never the authoritative srand, and the whole feature is HARD-GATED behind ZONE5.enabled.
// So with the feature off no caldera zone exists → no draw happens → the sim is byte-identical to a build
// without it (AC1 [AC-RNG-STRONG]); at ANY setting the shared srand is provably untouched. Like the other
// dedicated streams, seed() does NOT reset it — the harness neutralises via ZONE5.enabled=false.
const zone5Rng = createRNG(0xca1de5a0);
// CAS-1819/1820 — DEDICATED enemy-abilities stream (distinct seed 0x0ab111a7; NOT one of the used seeds
// 0x1a2b3c4d/0x5e75c0de/0x117a1a7e/0xa5e4a000/0xe7e40a1d/0x3c9a7b21/0x4d0b7e15/0x0a771c5e/0xca1de5a0). The
// telegraphed enemy specials (A1 lunge, A2 slam) are CADENCE-deterministic (fire on e.atkCount % every) and
// draw ZERO srand — so the shared authoritative stream is byte-identical ON==OFF. Any OPTIONAL variance
// (e.g. angle jitter) would come ONLY from here, never srand. HARD-GATED behind ENEMY_ABILITIES.enabled: with
// the knob off no special is assigned and no draw happens ⇒ sim byte-identical to a build without it. Like the
// other dedicated streams, seed() does NOT reset it — the harness neutralises via ENEMY_ABILITIES.enabled=false.
const abilityRng = createRNG(0x0ab111a7);

// the authoritative world. The hand-built Tiled continent (760×570 + the grafted old-lands
// dungeons) is now the DEFAULT world; ?world=classic restores the pure procedural world. The
// determinism self-test drives buildWorld() directly, so it stays unaffected either way.
const USE_CLASSIC = typeof location!=="undefined" && /[?&]world=classic/.test(location.search||"");
// CAS-1702 — Visual Map Editor round-trip: when the URL carries ?map= the world is built from an
// authored MapDoc (editor export / bundled seed) instead of the procedural/Tiled world. readMapDoc()
// returns null without ?map, so the default path is UNTOUCHED and byte-identical; the loader draws
// ZERO from `rng`, so even a loaded map leaves the srand fingerprint identical (additive, RNG-neutral).
const MAPDOC = readMapDoc();
const world = MAPDOC ? buildWorldFromMapDoc(MAPDOC, rng)
                     : (USE_CLASSIC ? buildWorld(rng) : buildTiledWorld(rng));

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
  scene:"menu", // menu, play, dialogue, shop, bounty, bestiary, inventory, talents, pause, dead, altar, victory
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
  // CAS-1557: account-wide META-PROGRESSION (the permanent layer BETWEEN runs). null until
  // persist.bootMeta() rehydrates it from its OWN store (mithralda.meta.v1 — never the run
  // save). Deterministic pure data ({v,essence,nodes}); the sim owns the shape + gameplay,
  // persist.js owns the localStorage medium (same split as the run save). `metaDirty` is a
  // one-shot flush flag the persistence controller consumes to write the store the instant
  // essence is banked or a node bought (durable without waiting for the throttled autosave).
  meta:null, metaDirty:false,
  // CAS-1751: account-wide CÓDICE DE BOTÍN (Collection Log). A pure read-side ledger of the FIRST-EVER
  // pickup of each unique/set-piece/rune ({v,uniq,set,rune} flat sets). null until persist.bootCodex()
  // rehydrates it from its OWN store (mithralda.codex.v1 — never the run save). Touches NO RNG and no
  // combat state beyond the derived, cached codexDmg/codexHp read live by equippedDmg/heroMaxHp.
  // `codexDirty` is the one-shot flush flag persist.js consumes on each new discovery (durable without
  // waiting for the throttled autosave). When CODEX.enabled=false it is never mutated ⇒ 0 observable effect.
  codex:null, codexDirty:false,
  // CAS-1758: account-wide TÍTULOS DE GESTA ledger — { v, unlocked{}, equipped }. null until persist.bootTitles()
  // rehydrates it from its OWN store (mithralda.titles.v1 — never the run save). Derives PURELY from milestones
  // already tracked (codex counts / arena bests / ascension); touches NO RNG and no combat state beyond the
  // cached, derived h.title string read by the HUD. `titlesDirty` is the one-shot flush flag persist.js consumes
  // on each new unlock / equip change. When TITLES.enabled=false it is never mutated ⇒ 0 observable effect.
  titles:null, titlesDirty:false,
  // CAS-1664: Arena de Oleadas (Wave Survival) endgame MODE. `arenaMode` is the master gate —
  // false for every normal adventure, so no arena code runs and the sim/RNG is byte-identical to
  // a build without the mode. `pendingArena` is set by the menu "Arena de Oleadas" entry and
  // consumed by createHero (which flips arenaMode on + starts the gauntlet). `arena` is PURELY
  // runtime bookkeeping (never serialized into the run save); only `best` is durable, persisted in
  // its OWN store (mithralda.arena.v1) via persist.js on the `arenaDirty` flush flag — the run save
  // schema is untouched (AC4). wave = highest wave REACHED (the score); resting = the between-wave breather.
  arenaMode:false, pendingArena:false, arenaDirty:false,
  arena:{ wave:0, spawnedThisWave:0, aliveTarget:0, resting:false, restT:0, best:0,
    // CAS-1670 boss-wave telemetry (runtime-only, NOT serialized — additive, no save bump):
    bossIncoming:false, lastTelegraphWave:0, lastBossK:0, lastBossEssBonus:0, lastBonusDrops:0,
    // CAS-1675 persistent records — bestBossWave IS serialized (additive to arena.v1, no v bump);
    // the rest are runtime-only (highest boss wave cleared THIS run + the once-per-run milestone payoff):
    bestBossWave:0, runBestBossWave:0, bossRecordBaseline:0, bossRecordHit:false, lastRecordEssBonus:0 },
  // CAS-1681: Eventos de Zona (optional POIs) — PURELY runtime bookkeeping (never serialized into the
  // run save; only a durable per-run completion counter rides the hero additively). `seeded` = zones
  // already rolled this run (seed-once-per-zone, mirroring curseSeen). `pois` = the live POI list read
  // by render + the event tick. Reset on every new/loaded run beside G.ambush. Empty + untouched while
  // ZONE_EVENTS.enabled is false → byte-identical to a build without the feature.
  zoneEvents:{ seeded:[], pois:[], lastPayoff:null },
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
  const h = { name:name||"Héroe", x:world.tcx, y:world.tcy+TS*2, vx:0,vy:0, facing:Math.PI/2,
    hp:cs.hp, maxHp:cs.hp, mp:cs.mp, maxMp:cs.mp, lvl:1, xp:0, xpNext:60, gold:30,
    baseDmg:cs.dmg, dmgBonus:0, defBonus:0,
    // per-class mobility (px/s) + level-growth amounts; read by movement / gainXP.
    moveSpeed:CFG.heroSpeed*cs.moveScale, hpGain:cs.hpGain, mpGain:cs.mpGain, dmgGain:cs.dmgGain,
    // spell state: per-slot cooldowns (slots 1-3) + timed buff/HoT amounts. dmgBonus/
    // defBonus are the buff sinks (equippedDmg/Def read them), restored on expiry.
    spellCD:[0,0,0,0], spellCDmax:[0,0,0,0],
    // CAS-1570: class-agnostic drafted ability slots (2). Own cooldown arrays so they
    // never collide with the class-spell slots; `loadout` holds the 2 chosen ability ids
    // (defaulted here, overwritten by the run-start draft). Transient — never serialized.
    abilCD:[0,0], abilCDmax:[0,0], loadout:DEFAULT_LOADOUT.slice(),
    // CAS-1659: HABILIDAD DEFINITIVA. `ultId` = the drafted Ultimate for this run (null = none →
    // RNG-neutral baseline, no charge cost); `ultCharge` = normalized meter 0..1, filled by combat
    // (arithmetic only). ultId persists per-run (serializeSave); a fresh hero starts with none.
    ultId:null, ultCharge:0,
    dmgBuffT:0, dmgBuffAmt:0, defBuffT:0, defBuffAmt:0, hotT:0, hotRate:0,
    // CAS-192: short timed attack-speed bonus from the "furia" consumable. Read by the
    // attack-cooldown formula (alongside CAS-117 affix / CAS-119 talent atkspd); ticks
    // down in update(). Transient — never serialized (a fresh boot starts clean).
    atkspdBuffT:0, atkspdBuffAmt:0,
    // CAS-1773: MEDIDOR DE FRENESÍ (kill-streak / momentum). Same transient pattern as
    // atkspdBuffT — killing within FRENZY.window s of the last kill adds a stack (up to
    // maxStacks); decays 1 stack every decayEvery s once the window lapses. Read in
    // heroAtkspd (additive atk-speed) + hitEnemy (dmg mul). NO RNG (100% derived from kill
    // timing). Transient — never serialized (a fresh boot / new run starts at 0).
    frenzyStacks:0, frenzyT:0, _frenzyDecayT:0,
    // CAS-1785: PARADA CON TEMPO (timing parry). Same transient pattern as atkspdBuffT/frenzyT —
    // parryT = active parry window (s) armed by tryParry, parryCD = anti-spam cooldown (s),
    // _parryRiposte = consumable 1-hit counter-buff. NO RNG. Transient — never serialized (a fresh
    // boot / new run / load starts at 0 ⇒ save.v1 byte-identical with the feature on or off).
    parryT:0, parryCD:0, _parryRiposte:0,
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
    consum:{fury:0, antidote:1, greater:1, mana:1}, consumSel:0, consumCD:{}, // CAS-1628: mana potion in starter stash (parity w/ greater)
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
    // CAS-1586: monotonic lifetime AFFIXED-trash kills (any mob carrying a MOB_AFFIX). Feeds the
    // Esencia tie-in (per-run delta × MOB_AFFIX_ESSENCE). Saved additively (no SAVE_VERSION bump).
    affixKills:0,
    // CAS-1590: monotonic lifetime ÉLITE-CAMPEÓN kills. Per-run delta × CHAMPION.essence is the
    // GUARANTEED Esencia payoff (folded into essenceForRun). Additive; old saves → 0 (no bump).
    champElites:0,
    // CAS-1681: monotonic lifetime ZONE-EVENTS completed (santuario/cofre/duende). Durable, additive
    // (old saves → 0, no SAVE_VERSION bump); read by QA/recap only — no gameplay/RNG dependency.
    zoneEventsDone:0,
    // CAS-150: cached Elite-Mastery REWARD-TRACK perk bundle, derived from eliteKills (never
    // stored — recomputed by recalcMastery on load + every elite kill). Combat reads it hot.
    // Named `mperk` (NOT `mp` — that's mana) to avoid the mana field collision.
    mperk:zeroMP(),
    respawn:{x:world.templeF.x, y:world.templeF.y+TS} };
  // CAS-1649: leg_superviviente legacy — +1 HP & +1 mana potion at run-start per stack. Granted
  // HERE (newHero only, NOT respawn/loadSave) so the persisted stash never compounds run-over-run.
  // 0 stacks → no-op → byte-identical starter inventory.
  { const s=legacyCount("leg_superviviente"); if(s>0){ h.consum.greater+=s; h.consum.mana+=s; } }
  return h;
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
    +(apex?WORLD_TIER.apexDepth:0)+(wt>0?wt*WORLD_TIER.depthPer:0)
    +metaLvl("t2_boonRare")*T2_MAP.t2_boonRare.per; // CAS-1565: Presagio Mayor lifts rare/legendary odds via the same depth lever (read-live)
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
  // CAS-1744: the Caldera modifier (`emberfury`) enters the offered pool ONLY when ZONE5.enabled — so
  // with the feature OFF the pool is the historical 3-entry array (byte-identical draft). `ri` draws
  // exactly ONE srand regardless of pool size, so the srand stream position is unchanged either way.
  const pool=ZONE5.enabled?[...ZONE_MODIFIERS, ZONE5_MOD]:ZONE_MODIFIERS;
  const mod=pool[ri(0,pool.length-1)];
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
export function createHero(name,cls){ G.hero=newHero(name||"Héroe",cls); G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false}; resetZoneEvents(); G.scene="play"; G.started=true;
  // CAS-1557: apply the account-wide meta upgrades at this run-start seam. reconcileMeta bakes
  // the +HP/+dmg/+gold/+moveSpeed delta (idempotent via metaApplied); applyMetaReroll adds the
  // per-run reroll charges on top of newHero's fresh budget; then fill HP to the boosted cap.
  reconcileMeta(G.hero); applyMetaReroll(G.hero); applyMetaStartBoons(G.hero); G.hero.hp=heroMaxHp(G.hero); // CAS-1565: Vanguardia start-boons before HP fill
  beginRun();                                                   // CAS-277: first run baseline for the recap
  if(tutArmed){ startTutorial(); tutArmed=false; }              // CAS-128: first-run guided flow
  // CAS-1664: a NEW run always starts OUTSIDE arena (a prior arena run can't leak its mode into a
  // fresh adventure). Only the menu "Arena de Oleadas" entry (which set pendingArena) flips it on.
  G.arenaMode=false;
  if(G.pendingArena){ G.pendingArena=false; G.arenaMode=true; startArena(); } }

// ==================== CAS-1664: ARENA DE OLEADAS (Wave Survival) ====================
// A separate endgame MODE that reuses the WHOLE content library — the ETPL trash pool, the HUNTS
// capstone stat blocks, the elite affixes, the boon draft, the loot streams and the Esencia bank —
// with ZERO new art. Every random draw comes from the DEDICATED `arenaRng` stream and every path
// below is reachable ONLY while G.arenaMode is on, so a normal adventure is byte-identical to a
// build without the mode (RNG-neutral by construction). Persistence is additive: only the best wave
// survives, in its own store (mithralda.arena.v1); the run save schema is never touched.

// The eligible trash pool: every ETPL row the ADVENTURE uses as a hostile mob — damaging, non-neutral,
// non-boss. Derived from the live table (stable insertion order) so a new mob joins the arena for free.
function arenaMobPool(){ const out=[]; for(const k in ETPL){ const t=ETPL[k]; if((t.dmg||0)>0 && !t.neutral && !t.boss) out.push(k); } return out; }
// Elite-affix probability for wave n (climbs with the wave, capped). A dev override (arenaSetAffixRate)
// pins it for deterministic affix tests. Pure arithmetic — no RNG, no srand touch.
let arenaAffixOverride=null;
function arenaAffixRate(n){ if(arenaAffixOverride!=null) return arenaAffixOverride;
  return Math.min(ARENA.affixCap, ARENA.affixBase + (n|0)*ARENA.affixStep); }
// A clear open tile a readable ring-distance from the hero (same approach as the ambush/champion
// spawn). Draws its angle/distance from arenaRng ONLY. Falls back to a fixed offset if crowded.
function arenaSpawnPos(){ const h=G.hero;
  for(let i=0;i<24;i++){ const a=arenaRng.rr(0,6.28), dpx=arenaRng.rr(180,260);
    const x=h.x+Math.cos(a)*dpx, y=h.y+Math.sin(a)*dpx;
    if(!solidBlocked(x,y,16)) return {x,y}; }
  return {x:h.x+200, y:h.y}; }
// Roll an elite affix onto a freshly-spawned ARENA mob, gated by `rate` on arenaRng (NOT srand).
// Reuses the adventure's applyAffix/applyChampion (both RNG-free once the id is chosen) so the
// affix combat/render hooks are wired identically — only the roll's stream differs.
function arenaMaybeAffix(e, rate){
  if(!e || e.isBoss || e.tpl.neutral) return e;
  if((e.tpl.dmg||0)<=0 || e.tpl.arch==="volatile") return e;    // supports / bombers make degenerate carriers (mirror maybeAffix)
  if(!(rate>0)) return e;                                        // OFF → zero arenaRng draw
  if(arenaRng.srand()>=rate) return e;
  let pool=MOB_AFFIX_IDS; if(e.tpl.ranged) pool=MOB_AFFIX_IDS.filter(id=>!MOB_AFFIX[id].melee);
  const firstId=pool[arenaRng.ri(0,pool.length-1)];
  applyAffix(e, firstId);
  // A fraction of affixed arena mobs promote to an Élite Campeón (2nd distinct affix + champion
  // stat block) — the SAME applyChampion path the adventure uses, gated on arenaRng. applyChampion
  // sets e.champElite, so killEnemy takes the TRASH champElite branch (onChampElite: superior loot +
  // banked Esencia) — NOT the e.champion path, whose onChampionKill needs a hunt zone we don't have.
  if(arenaRng.srand()<ARENA.champChance){ const others=pool.filter(id=>id!==firstId);
    if(others.length) applyChampion(e, firstId, others[arenaRng.ri(0,others.length-1)]); }
  return e;
}
// Spawn ONE wave-boss: reuse a HUNTS boss stat block (chosen from ARENA.bossZones via arenaRng),
// scaled by the wave. Mirrors spawnChampion's capstone wiring (enrage + special AI intact) but tags
// it isBoss+arena (NOT champion) so killEnemy takes the boss-loot branch — never onChampionKill's
// zone-clear/victory path (and the excluded frost/trial bosses can't fire the win screen anyway).
function arenaSpawnBoss(n){
  const zone=ARENA.bossZones[arenaRng.ri(0,ARENA.bossZones.length-1)]; const B=HUNTS[zone].boss;
  const p=arenaSpawnPos(); const e=spawnEnemy(B.base, p.x, p.y); const base=e.tpl;
  const hpMul=1+n*ARENA.hpStep, dmgMul=1+n*ARENA.dmgStep;
  e.tpl=Object.assign({},base,{ sprite:B.sprite||base.sprite, hp:Math.round(B.hp*hpMul), dmg:Math.round(B.dmg*dmgMul),
    size:B.size, spd:B.spd??base.spd, knock:B.knock??base.knock, windup:B.windup??base.windup, recover:B.recover??base.recover,
    ranged:false, aggro:Math.max(base.aggro,340), xp:B.xp, champName:B.name });
  e.capstone=true; e.enraged=false; e.enrageAt=B.enrageAt||0.5;
  e.baseSpd=e.tpl.spd; e.enrageSpd=B.enrageSpd||1.35; e.enrageWindup=B.enrageWindup||0.72; e.slam=B.slam||null;
  e.carapace=B.carapace||null; e.shielded=false; e.shieldBroken=false; e.atkCount=0;
  e.special=B.special||null; e.specialNow=false;
  e.rwdTier=B.tier; e.rwdMinR=B.minR; e.rwdXp=B.xp; e.rwdGold=B.gold;
  e.hp=e.maxHp=e.tpl.hp; e.isBoss=true; e.arena=true; e.zone=zone; e.state="chase";
  e.arenaBossK=Math.max(1,(n/ARENA.bossEvery)|0);   // CAS-1670: k index carried onto the boss so killEnemy scales the bonus loot
  e.arenaBossBaseHp=B.hp|0; e.arenaBossBaseDmg=B.dmg|0; e.arenaBossHpMul=hpMul; e.arenaBossDmgMul=dmgMul; // AC4 scaling readout (QA)
  return e;
}
// CAS-1670 — how many EXTRA guaranteed loot pieces a boss kill drops at index k (wave/bossEvery).
// Pure arithmetic, no RNG. base (ARENA.bossBonusDrops) climbs by floor(k/2), capped. Base<=0 → 0
// (the arenaSetBossBonus(0) OFF-path used by the [AC-RNG-STRONG] test).
function arenaBonusDropCount(k){ const base=ARENA.bossBonusDrops|0; if(base<=0) return 0;
  return Math.min(ARENA.bossBonusCap||4, base + Math.floor((k||0)/2)); }
// CAS-1670 — legible "boss wave incoming" cue: a distinct toast + shake + boss sfx, fired ON spawn
// of a boss wave and (as a heads-up) during the rest BEFORE one. Records the telegraphed wave so QA
// can observe it in the sim state (arenaState/arenaLastPayoff). Pure presentation — no RNG, no balance.
function arenaBossTelegraph(n){ const A=G.arena; const k=Math.max(1,(n/ARENA.bossEvery)|0);
  A.lastTelegraphWave=n|0; A.bossIncoming=false;                 // the boss is HERE now, not "incoming"
  toast("¡OLEADA DE JEFE! ×"+k, 3.2); shakeAdd(8);
  audio&&audio.sfx&&audio.sfx.boss&&audio.sfx.boss(); }
// Build wave n: clear any arena remnants, then spawn the roster. Boss waves (every BOSS_EVERY)
// spawn a single wave-scaled HUNTS boss; every other wave spawns a scaled trash pack whose count,
// types and affixes all draw from arenaRng.
function spawnWave(n){
  const A=G.arena; n=Math.max(1,n|0);
  arenaClearEnemies();                                       // limpia arena de restos (createHero/prev wave)
  const boss=(n % ARENA.bossEvery)===0;
  if(boss){ arenaSpawnBoss(n); arenaBossTelegraph(n); }  // CAS-1670: legible boss-wave cue on spawn
  else {
    const count=Math.min(ARENA.mobCap, ARENA.baseMobs + Math.floor(n*ARENA.mobStep));
    const pool=arenaMobPool(), rate=arenaAffixRate(n), hpMul=1+n*ARENA.hpStep, dmgMul=1+n*ARENA.dmgStep;
    for(let i=0;i<count;i++){ const type=pool[arenaRng.ri(0,pool.length-1)]; const p=arenaSpawnPos();
      const e=spawnEnemy(type, p.x, p.y); const b=e.tpl;
      e.tpl=Object.assign({},b,{ hp:Math.round(b.hp*hpMul), dmg:Math.round((b.dmg||0)*dmgMul) }); // wave scale on a CLONE (never the shared row)
      e.hp=e.maxHp=e.tpl.hp; e.arena=true; e.state="chase";
      arenaMaybeAffix(e, rate); }
  }
  A.spawnedThisWave=arenaAliveCount(); A.aliveTarget=A.spawnedThisWave; A.resting=false;
}
// Count / clear the LIVE arena enemies (tagged e.arena) — used by the wave-clear check and by
// spawnWave's remnant sweep. Removes them outright (a hard reset, not a kill → no loot/death FX).
function arenaAliveCount(){ let c=0; for(const e of G.enemies){ if(e.arena && !e.dead && e.hp>0) c++; } return c; }
function arenaClearEnemies(){ for(let i=G.enemies.length-1;i>=0;i--){ if(G.enemies[i].arena) G.enemies.splice(i,1); } }
// Esencia banked when wave n is cleared (feeds the meta tree — the arena's tie-in to progression).
function arenaEssence(n){ return Math.ceil((n|0)*ARENA.essStep); }
// Start the gauntlet on the freshly-created (live) hero. Clears the field (createHero does NOT
// touch G.enemies by itself), banks the loaded best, and launches wave 1. `best` is preserved
// (loaded at boot by persist.bootArena) — never reset here.
function startArena(){ const A=G.arena;
  arenaClearEnemies(); G.projectiles.length=0; G.fields.length=0; G.drops.length=0; G.draft=null;
  A.spawnedThisWave=0; A.aliveTarget=0; A.resting=false; A.restT=0;
  // CAS-1675 — snapshot the record baseline at run start so the milestone payoff fires at most once
  // per run, only when this run's boss waves BEAT the stored record. runBestBossWave accumulates the
  // highest boss wave CLEARED this run (banked to bestBossWave on death if it beats the record).
  A.runBestBossWave=0; A.bossRecordBaseline=A.bestBossWave|0; A.bossRecordHit=false; A.lastRecordEssBonus=0;
  G.scene="play"; A.wave=1; spawnWave(1); // arena always begins IN play (createHero's later openAbilityDraft re-gates the loadout scene)
}
// The between-wave payoff: bank the wave's Esencia (immediate, survives death), heal the hero, and
// every BOON_EVERY waves offer a boon draft (reuses the adventure's openDraft → scene "draft"; the
// rest timer is frozen while the panel is up and resumes on pick). Then enter the REST.
function onWaveCleared(){ const A=G.arena, h=G.hero; if(!h) return;
  const gain=arenaEssence(A.wave);
  if(gain>0){ ensureMeta().essence=(ensureMeta().essence|0)+gain; G.metaDirty=true; } // AC7: bank to the meta tree
  // CAS-1670 — GUARANTEED boss-wave Esencia payoff, ADDITIONAL to the base gain, scaled by k=wave/bossEvery.
  // Pure arithmetic (0 RNG → AC5 confound-free). Fires only when the wave just cleared was a boss wave.
  const wasBoss=(A.wave>0 && (A.wave % ARENA.bossEvery)===0);
  if(wasBoss){ const k=Math.max(1,(A.wave/ARENA.bossEvery)|0); const bonus=Math.ceil(ARENA.bossEssBase*k);
    if(bonus>0){ ensureMeta().essence=(ensureMeta().essence|0)+bonus; G.metaDirty=true; }
    A.lastBossK=k; A.lastBossEssBonus=bonus;
    toast("¡Recompensa de Jefe! +"+bonus+" Esencia", 3.0);
    // CAS-1675 — track the highest boss wave BEATEN this run (waves only climb → this is monotonic).
    if(A.wave>(A.runBestBossWave|0)) A.runBestBossWave=A.wave|0;
    // CAS-1675 — ONE-TIME milestone payoff when this run's boss waves surpass the stored record.
    // Pure arithmetic (0 RNG → never touches srand; AC4 confound-free), on top of the boss bonus above.
    if(!A.bossRecordHit && A.wave>(A.bossRecordBaseline|0)){
      const rbonus=Math.ceil(ARENA.bossRecordEssBase*A.wave);
      if(rbonus>0){ ensureMeta().essence=(ensureMeta().essence|0)+rbonus; G.metaDirty=true; }
      A.bossRecordHit=true; A.lastRecordEssBonus=rbonus;
      toast("¡Nuevo récord de Jefe! +"+rbonus+" Esencia", 3.0); } }
  const mhp=heroMaxHp(h); if(h.hp<mhp && h.hp>0) h.hp=Math.min(mhp, h.hp+Math.round(mhp*ARENA.healFrac)); // AC3: rest heal
  A.spawnedThisWave=0; A.resting=true; A.restT=ARENA.restSeconds;
  // CAS-1670 — heads-up telegraph DURING the respiro when the NEXT wave will be a boss wave.
  const nextBoss=(((A.wave+1) % ARENA.bossEvery)===0);
  A.bossIncoming=nextBoss;
  if(nextBoss){ toast("¡Respiro… se acerca una OLEADA DE JEFE!", ARENA.restSeconds); shakeAdd(6); }
  else toast("Respiro… próxima oleada", ARENA.restSeconds);
  audio&&audio.sfx&&audio.sfx.levelup&&audio.sfx.levelup();
  if(A.wave>0 && (A.wave % ARENA.boonEvery)===0) openDraft("arena"); // AC3: periodic boon draft during the rest
}
// The arena controller — advances the wave loop each play frame while arenaMode. During a REST it
// counts down (frozen when a draft panel is up, since update() short-circuits non-play scenes) then
// spawns the NEXT wave; otherwise it watches for a fully-cleared wave and hands off to onWaveCleared.
function tickArena(dt){ const A=G.arena, h=G.hero; if(!h) return;
  if(A.resting){ A.restT-=dt;
    if(A.restT<=0){ A.resting=false; A.wave++; spawnWave(A.wave); }
    return; }
  const alive=arenaAliveCount(); A.aliveTarget=alive;
  if(alive===0 && A.spawnedThisWave>0) onWaveCleared();
}
// Hero death ends the arena run: the highest wave REACHED is the score; persist it as the new best
// (own store, additive) if it beats the record. Called from heroDie (arena branch only).
function arenaOnDeath(){ const A=G.arena;
  if(A.wave>A.best){ A.best=A.wave; G.arenaDirty=true; }
  // CAS-1675 — bank the run's highest boss wave as the new record if it beats the stored best.
  if((A.runBestBossWave|0)>(A.bestBossWave|0)){ A.bestBossWave=A.runBestBossWave|0; G.arenaDirty=true; }
  // CAS-1758: a new arena best (wave / boss-wave) can cross a title threshold — reevaluate + refresh HUD cache.
  applyTitles(G.hero); }
// Additive Arena persistence (mirror of serializeMeta/loadMeta): the sim owns the shape, persist.js
// owns the localStorage medium + the arenaDirty flush. bestWave + bestBossWave (CAS-1675) are the
// durable arena state. NOTE: the shape stays v:1 — bestBossWave is additive (absent ⇒ 0 on load).
export function serializeArena(){ return { v:1, bestWave:G.arena.best|0, bestBossWave:G.arena.bestBossWave|0 }; }
export function loadArena(d){
  G.arena.best = (d && Number.isFinite(+d.bestWave)) ? Math.max(0, Math.floor(+d.bestWave)) : 0;
  G.arena.bestBossWave = (d && Number.isFinite(+d.bestBossWave)) ? Math.max(0, Math.floor(+d.bestBossWave)) : 0; // additive: legacy arena.v1 (no field) ⇒ 0
  return G.arena.best; }
// ================== end CAS-1664 Arena de Oleadas ==================

// --------------------- CAS-1751: CÓDICE DE BOTÍN (Collection Log) ---------------------
// A PURE READ-SIDE ledger over the shipped loot systems. It NEVER draws from any RNG stream and
// NEVER writes combat/sim state beyond the derived, cached codexDmg/codexHp (read live by
// equippedDmg/heroMaxHp — never baked, so reload/reset reproduce it from the ledger counts). The
// whole feature is HARD-GATED behind CODEX.enabled: when false, recordCodex is a no-op, applyCodex
// zeroes the cache, and no HUD/panel exists ⇒ the sim/srand sequence + save.v1 bytes are identical
// to a build without the feature (RNG-neutral by construction — there is no stream to gate). The
// sim owns the SHAPE (serializeCodex/loadCodex); persist.js owns the localStorage medium + the
// codexDirty flush (mirror of the meta/arena ownership split). Its own key ⇒ save.v1 untouched.
function codexDefault(){ return { v:1, uniq:{}, set:{}, rune:{} }; }
function ensureCodex(){ if(!G.codex) G.codex=codexDefault(); return G.codex; }
export function serializeCodex(){ const c=ensureCodex();
  // shallow-copy the three flat sets so the persisted blob never aliases live state
  return { v:1, uniq:Object.assign({},c.uniq), set:Object.assign({},c.set), rune:Object.assign({},c.rune) }; }
export function loadCodex(d){ const def=codexDefault();
  if(d && typeof d==="object"){
    // only accept KNOWN ids (untrusted-blob guardrail like safeAffixes/legacyNodes): a tampered blob
    // can't inject phantom entries that would inflate the bonus or break the discovered/total math.
    if(d.uniq&&typeof d.uniq==="object") for(const u of UNIQUES) if(d.uniq[u.id]) def.uniq[u.id]=1;
    if(d.set &&typeof d.set ==="object") for(const p of SET_PIECES) if(d.set[p.id]) def.set[p.id]=1;
    if(d.rune&&typeof d.rune==="object") for(const t of RUNE_ORDER) if(d.rune[t]) def.rune[t]=1; }
  G.codex=def; return true; }
// counts of DISCOVERED entries per category (pure read).
function codexCounts(){ const c=ensureCodex();
  return { uniq:Object.keys(c.uniq).length, set:Object.keys(c.set).length, rune:Object.keys(c.rune).length }; }
// derive the permanent {dmg,hp} bonus from the counts × the tunable magnitudes. 0 when disabled.
export function codexBonus(){ if(!CODEX.enabled) return { dmg:0, hp:0 };
  const n=codexCounts(); const b=CODEX.bonus;
  return { dmg: n.uniq*b.dmgPerUniq, hp: n.set*b.hpPerSet + n.rune*b.hpPerRune }; }
// cache the derived bonus onto the hero so equippedDmg/heroMaxHp read it live (never baked). Guarded
// by the flag: disabled ⇒ codexDmg/codexHp=0 ⇒ zero contribution. Called at every hero seam + discovery.
function applyCodex(h){ if(!h) return; const b=codexBonus(); h.codexDmg=b.dmg; h.codexHp=b.hp; }
// Discovery: record the FIRST-EVER pickup of an id in a category. One-way set-insert, idempotent on
// repeats. No-op (and NO ledger touch) when disabled ⇒ RNG/state untouched. On a genuine new entry it
// recomputes the cached hero bonus, marks the store dirty for an immediate flush, and pops a floater.
function recordCodex(cat,id){ if(!CODEX.enabled || !id) return false;
  const c=ensureCodex(); const set=c[cat]; if(!set || set[id]) return false; // unknown cat or already discovered
  set[id]=1; G.codexDirty=true;
  const h=G.hero; if(h){ const before=codexBonus(); applyCodex(h);
    // a new discovery lifts effective maxHp instantly (heroMaxHp reads codexHp live); top up current HP by
    // the gained amount so the reward reads immediately (never above the new max).
    const gainedHp=h.codexHp-(before.hp); if(gainedHp>0){ h.hp=Math.min(heroMaxHp(h), h.hp+gainedHp); }
    const bonusTxt = cat==="uniq" ? "+"+CODEX.bonus.dmgPerUniq+" daño"
                   : cat==="set"  ? "+"+CODEX.bonus.hpPerSet+" vida"
                   :                 "+"+CODEX.bonus.hpPerRune+" vida";
    floater(h.x, h.y-40, "¡Nuevo en el Códice! "+bonusTxt, C_GOLD, {pop:1.3, life:1.4}); }
  // CAS-1758: a fresh codex discovery may cross a title threshold (codex.uniq/set/rune) — reevaluate
  // + refresh the HUD cache. No-op when TITLES disabled; draws 0 RNG.
  applyTitles(G.hero);
  return true; }
// View model for renderCodex (pure read; render adds no logic). Each section lists EVERY content id
// (discovered flag + name/glyph) so the panel draws discovered vs locked, plus the totals + live bonus.
export function codexSnap(){ const c=ensureCodex(); const b=codexBonus();
  const uniq=UNIQUES.map(u=>({ id:u.id, name:u.name, slot:u.slot, found:!!c.uniq[u.id] }));
  const set =SET_PIECES.map(p=>({ id:p.id, name:p.name, slot:p.slot, found:!!c.set[p.id] }));
  const rune=RUNE_ORDER.map(t=>{ const r=RUNES[t]; return { id:t, name:r.name, tint:r.tint, found:!!c.rune[t] }; });
  const n=codexCounts();
  return { enabled:!!CODEX.enabled, bonus:b,
    sections:[
      { key:"uniq", title:"Únicos",    items:uniq, found:n.uniq, total:UNIQUES.length },
      { key:"set",  title:"Conjuntos", items:set,  found:n.set,  total:SET_PIECES.length },
      { key:"rune", title:"Runas",     items:rune, found:n.rune, total:RUNE_ORDER.length },
    ] }; }
// ================== end CAS-1751 Códice de Botín ==================

// --------------------- CAS-1758: TÍTULOS DE GESTA (Feat Titles) ---------------------
// A PURE READ-SIDE cosmetic layer that derives unlockable, choosable account titles from milestones the
// player ALREADY accumulates. Mirrors the Códice ownership split exactly: the sim owns the SHAPE
// (serializeTitles / loadTitles); persist.js owns the localStorage medium + the titlesDirty flush; the
// store is its OWN key (mithralda.titles.v1) so save.v1 is untouched. It draws NO RNG and writes NOTHING
// to combat/sim state beyond the derived, cached h.title (a HUD-only label). HARD-GATED behind
// TITLES.enabled: false ⇒ evalTitles/applyTitles are no-ops, no store is read/written, h.title="" ⇒ the
// srand sequence + save.v1 bytes are identical to a build without the feature (RNG-neutral by construction).
function titlesDefault(){ return { v:1, unlocked:{}, equipped:null }; }
function ensureTitles(){ if(!G.titles) G.titles=titlesDefault(); return G.titles; }
export function serializeTitles(){ const t=ensureTitles();
  // shallow-copy the unlocked set so the persisted blob never aliases live state
  return { v:1, unlocked:Object.assign({},t.unlocked), equipped:t.equipped||null }; }
export function loadTitles(d){ const def=titlesDefault();
  if(d && typeof d==="object"){
    // only accept KNOWN title ids (untrusted-blob guardrail like loadCodex): a tampered blob can't inject
    // phantom titles or an equipped id that isn't a real def.
    if(d.unlocked&&typeof d.unlocked==="object") for(const dd of TITLES.defs) if(d.unlocked[dd.id]) def.unlocked[dd.id]=1;
    if(d.equipped && def.unlocked[d.equipped]) def.equipped=d.equipped; } // equipped must be a KNOWN + unlocked id
  G.titles=def; return true; }
// resolve a def's `src` string → its LIVE source counter (never baked — read fresh each eval).
function titleSrcVal(src){ switch(src){
    case "codex.uniq": return codexCounts().uniq;
    case "codex.set":  return codexCounts().set;
    case "codex.rune": return codexCounts().rune;
    case "arena.bestWave":     return (G.arena&&G.arena.best)|0;
    case "arena.bestBossWave": return (G.arena&&G.arena.bestBossWave)|0;
    case "meta.ascension":     return ascLevel();
    default: return 0; } }
// Evaluate every def against its live source; INSERT (one-way) any id whose threshold is met. Idempotent
// (an already-unlocked id is skipped), 0 RNG, no game effect. Marks the store dirty on a genuine new unlock.
// No-op when disabled ⇒ ledger untouched.
function evalTitles(){ if(!TITLES.enabled) return false;
  const t=ensureTitles(); let changed=false;
  for(const d of TITLES.defs){ if(t.unlocked[d.id]) continue; if(titleSrcVal(d.src)>=d.n){ t.unlocked[d.id]=1; changed=true; } }
  if(changed) G.titlesDirty=true;
  return changed; }
// Cache the equipped title's label onto the hero for the HUD (h.title). Re-evaluates unlocks first so a
// milestone crossed at this seam is reflected. Validates the equipped id against `unlocked` (a stale/removed
// equip falls back to none). Derived, never baked — 0 when disabled.
function applyTitles(h){ if(!h) return; if(!TITLES.enabled){ h.title=""; return; }
  evalTitles(); const t=ensureTitles();
  if(t.equipped && !t.unlocked[t.equipped]) t.equipped=null;   // equipped must validate against unlocked
  const def = t.equipped ? TITLES.defs.find(d=>d.id===t.equipped) : null;
  h.title = def ? def.label : ""; }
// Player chooses the active title (tap on an unlocked entry in the panel). Equipping a locked/unknown id is
// impossible (returns false). null clears the equip. Marks dirty + refreshes the HUD cache.
export function equipTitle(id){ if(!TITLES.enabled) return false; const t=ensureTitles();
  if(id==null){ if(t.equipped!==null){ t.equipped=null; G.titlesDirty=true; } applyTitles(G.hero); return true; }
  if(!t.unlocked[id]) return false;                             // can't equip a title you haven't earned
  if(t.equipped!==id){ t.equipped=id; G.titlesDirty=true; } applyTitles(G.hero); return true; }
// human-readable condition text for the panel (e.g. "5 × Únicos del Códice"). Pure presentation.
const TITLE_SRC_LABEL={ "codex.uniq":"Únicos del Códice", "codex.set":"Conjuntos del Códice", "codex.rune":"Runas del Códice",
  "arena.bestWave":"oleada de Arena", "arena.bestBossWave":"oleada-jefe de Arena", "meta.ascension":"Ascensión" };
function titleCondText(d){ return d.n+" × "+(TITLE_SRC_LABEL[d.src]||d.src); }
// View model for renderTitles (PURE read; render adds no logic). Lists every def with unlocked/equipped flags
// + condition text + the live progress (cur/n). Does NOT mutate — the seams keep unlocks current.
export function titlesSnap(){ const t=ensureTitles();
  const items=TITLES.defs.map(d=>({ id:d.id, label:d.label, cond:titleCondText(d), n:d.n, cur:titleSrcVal(d.src),
    unlocked:!!t.unlocked[d.id], equipped:t.equipped===d.id }));
  const unlocked=items.filter(i=>i.unlocked).length;
  return { enabled:!!TITLES.enabled, equipped:t.equipped||null, items, unlocked, total:TITLES.defs.length }; }
// ================== end CAS-1758 Títulos de Gesta ==================

// --------------------- CAS-1763: PACTOS DE PODER (Power Pacts) ---------------------
// An OPT-IN, stackable difficulty covenant. The player ranks up pacts (own store mithralda.pacts.v1),
// each contributing HEAT + a per-rank effect; heat scales the endgame rewards (Esencia + drop chance).
// PURE READ-SIDE: the ranks persist as a cross-run PREFERENCE and their effects are DERIVED IN THE SEAM
// each run — a pact is deterministic arithmetic on an already-existing stat/heal/essence value, or a
// threshold shift on a roll that ALREADY happens. It adds/removes NO RNG draw (RNG-neutral STRONG). The
// sim owns the SHAPE (serializePacts / loadPacts); persist.js owns the localStorage medium + the
// pactsDirty flush; its OWN key ⇒ save.v1 untouched. HARD-GATED behind PACTS.enabled: false ⇒ no store
// I/O, no evaluation, no HUD/panel; enabled + heat=0 (no ranks) ⇒ every multiplier defaults to 1.0 and
// no threshold moves ⇒ the srand sequence + save.v1 bytes are BYTE-IDENTICAL to a build without the feature.
function pactsDefault(){ return { v:1, ranks:{} }; }
function ensurePacts(){ if(!G.pacts) G.pacts=pactsDefault(); return G.pacts; }
function pactRanks(){ return (G.pacts && G.pacts.ranks) || null; }
export function serializePacts(){ const p=ensurePacts();
  // shallow-copy the ranks map so the persisted blob never aliases live state
  return { v:1, ranks:Object.assign({},p.ranks) }; }
export function loadPacts(d){ const def=pactsDefault();
  if(d && typeof d==="object" && d.ranks && typeof d.ranks==="object"){
    // only accept KNOWN pact ids (untrusted-blob guardrail like loadCodex/loadTitles) + clamp rank to [1,max]:
    // a tampered blob can't inject phantom pacts or an out-of-range rank that would inflate heat/effects.
    for(const dd of PACTS.defs){ const r=d.ranks[dd.id]|0; if(r>0) def.ranks[dd.id]=Math.min(r, dd.max); } }
  G.pacts=def; return true; }
// derived HEAT: Σ rank×def.heat over ranked pacts. 0 when disabled or no ranks (byte-identical no-op).
function pactHeat(){ if(!PACTS.enabled) return 0; const r=pactRanks(); if(!r) return 0;
  let h=0; for(const d of PACTS.defs){ const rk=r[d.id]|0; if(rk>0) h+=rk*d.heat; } return h; }
// stat multiplier for an effect kind (enemyHp/enemyDmg/enemySpd/eliteRate): 1 + Σ(rank×mag). Returns
// EXACTLY 1.0 when disabled / no matching ranks ⇒ Math.round(x*1)===x ⇒ byte-identical.
function pactStatMul(kind){ if(!PACTS.enabled) return 1; const r=pactRanks(); if(!r) return 1;
  let add=0; for(const d of PACTS.defs){ if(d.effect.kind!==kind) continue; const rk=r[d.id]|0; if(rk>0) add+=rk*d.effect.mag; }
  return 1+add; }
// INVERSE stat multiplier for a reduction kind (healCut): max(0, 1 - Σ(rank×mag)). 1.0 when none.
function pactStatMulInv(kind){ if(!PACTS.enabled) return 1; const r=pactRanks(); if(!r) return 1;
  let sub=0; for(const d of PACTS.defs){ if(d.effect.kind!==kind) continue; const rk=r[d.id]|0; if(rk>0) sub+=rk*d.effect.mag; }
  return Math.max(0, 1-sub); }
// apply the healCut pact to a player heal amount (pure arithmetic; 1.0 ⇒ unchanged).
function pactHeal(amt){ if(!PACTS.enabled) return amt; const m=pactStatMulInv("healCut"); return m===1?amt:amt*m; }
// reward multiplier for kind∈{essence,drop}: 1 + perHeat×min(heat,cap). 1.0 when disabled / heat=0.
function pactRewardMul(kind){ if(!PACTS.enabled) return 1; const heat=pactHeat(); if(heat<=0) return 1;
  const cap=Math.min(heat, PACTS.rewardHeatCap|0);
  const per = kind==="essence" ? PACTS.essencePerHeat : PACTS.dropPerHeat;
  return 1 + per*cap; }
// Player sets/raises a pact rank (tap in the panel → +1, wrap to 0 at max). Clamps to [0,max]; rank 0
// drops the entry so the map stays clean (heat=0 ⇒ byte-identical). Marks the store dirty for a flush.
// No-op (returns false) when disabled. Effects are read live in the seam — nothing is baked onto the hero.
export function setPactRank(id, rank){ if(!PACTS.enabled) return false;
  const def=PACTS.defs.find(d=>d.id===id); if(!def) return false;
  const p=ensurePacts(); let rk=rank|0; if(rk<0) rk=0; if(rk>def.max) rk=def.max;
  const cur=p.ranks[id]|0; if(cur===rk) return true;
  if(rk<=0) delete p.ranks[id]; else p.ranks[id]=rk;
  G.pactsDirty=true; return true; }
// Tap a pact row → advance its rank by 1, wrapping past max back to 0 (build/tear-down the covenant here).
export function cyclePactRank(id){ if(!PACTS.enabled) return false;
  const def=PACTS.defs.find(d=>d.id===id); if(!def) return false;
  const cur=(ensurePacts().ranks[id]|0); return setPactRank(id, cur>=def.max ? 0 : cur+1); }
// human-readable per-rank effect text for the panel (pure presentation).
const PACT_EFFECT_LABEL={ enemyDmg:"daño enemigo", enemyHp:"HP enemigo", enemySpd:"velocidad enemiga",
  eliteRate:"prob. de élite", healCut:"curación propia" };
function pactEffectText(d){ const pct=Math.round(d.effect.mag*100); const sign=d.effect.kind==="healCut"?"−":"+";
  return sign+pct+"% "+(PACT_EFFECT_LABEL[d.effect.kind]||d.effect.kind)+" / rango"; }
// View model for renderPacts (PURE read; render adds no logic). Every def with its live rank + heat
// contribution, plus the total heat and the current reward multipliers. Does NOT mutate.
export function pactsSnap(){ const p=ensurePacts(); const heat=pactHeat();
  const items=PACTS.defs.map(d=>{ const rank=p.ranks[d.id]|0;
    return { id:d.id, name:d.name, rank, max:d.max, effect:pactEffectText(d), heat:d.heat, heatNow:rank*d.heat }; });
  return { enabled:!!PACTS.enabled, heat, essMul:pactRewardMul("essence"), dropMul:pactRewardMul("drop"),
    items, active:items.filter(i=>i.rank>0).length, total:PACTS.defs.length }; }
// ================== end CAS-1763 Pactos de Poder ==================

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
function safeInst(inst){
  // CAS-1687: a RUNE is a bag item {rune:"<id>"} (no slot/defId). Pass through only if it
  // resolves to a KNOWN rune, stripped to the bare field — so an old/garbage entry is dropped.
  if(inst && inst.rune) return RUNES[inst.rune] ? {rune:inst.rune} : null;
  if(!(inst && inst.slot && gearDef(inst.slot,inst.defId))) return null;
  const o={slot:inst.slot,defId:inst.defId,rarity:RARITY_VALID(inst.rarity)};
  const af=safeAffixes(inst.affixes); if(af) o.affixes=af;
  // CAS-1687: validate/rebuild the sockets array (0–2; each {} or {type} for a known rune) so a
  // socketed piece survives save→load and its rune bonus stays live; absent/garbage → no sockets.
  const sk=safeSockets(inst.sockets); if(sk) o.sockets=sk;
  const fl=forgeLevel(inst); if(fl>0) o.fl=fl;   // CAS-237: persist clamped forge level (0 omitted)
  // CAS-1632: preserve the UNIQUE id (only if it resolves to a real unique) so a legendary
  // survives save→load and its mod stays live; a bad/unknown uniq is dropped (falls back to base).
  if(inst.uniq && uniqDef(inst)) o.uniq=inst.uniq;
  // CAS-1654: preserve the SET-piece id (only if it resolves to a real piece) so set
  // membership survives save→load and setTotals stays live; unknown → dropped (base fallback).
  if(inst.set && setPieceDef(inst)) o.set=inst.set;
  // CAS-1768: preserve the WEAPON on-hit affix id — ONE optional TRAILING field, written ONLY when the
  // feature is enabled AND it resolves to a real affix on a weapon; absent/disabled/unknown ⇒ key omitted
  // ⇒ save.v1 byte-identical for affix-less items (same shape as uniq/set/fl above). Magnitude is derived.
  if(inst.wa && WEAPON_AFFIXES.enabled && o.slot==="weapon" && WEAPON_AFFIXES.defs.some(d=>d.id===inst.wa)) o.wa=inst.wa;
  return o; }
function RARITY_VALID(r){ return (r==="common"||r==="uncommon"||r==="rare"||r==="epic"||r==="legendary")?r:"common"; }
// CAS-117: validate persisted affixes — drop anything unknown/malformed so a
// corrupted/old save can never compute against a missing affix; cap at 2.
function safeAffixes(arr){ if(!Array.isArray(arr)) return null; const out=[];
  for(const a of arr){ if(a&&AFFIXES[a.id]&&typeof a.amt==="number"&&isFinite(a.amt)){ out.push({id:a.id,amt:Math.max(0,Math.round(a.amt))}); if(out.length>=2) break; } }
  return out.length?out:null; }
// ===================== CAS-1557: META-PROGRESSION v1 =========================
// The permanent, ACCOUNT-WIDE layer between runs: an "Esencia" currency banked on death
// + an altar of 5 additive upgrade nodes bought with it. Lives in its OWN isolated store
// (mithralda.meta.v1) so it NEVER touches the run save — wiping a character ("Nueva
// partida") keeps the meta, and vice-versa. Pure, deterministic data (Stage-2 safe: an
// account service can back this later without changing the shape); persist.js owns the
// localStorage medium. Values below are TUNABLE (balance-only; no mechanic depends on them).
export const META_NODES = [
  // key       cap  cost(currentLvl)     per-level effect (applied in reconcileMeta / re-roll)  UI label / blurb / glyph
  { key:"hpMax",     cap:5, cost:l=>10*(l+1), per:12,   label:"Vitalidad", eff:"+12 HP máx",     glyph:"♥" },
  { key:"dmg",       cap:5, cost:l=>15*(l+1), per:2,    label:"Filo",      eff:"+2 daño base",   glyph:"⚔" },
  { key:"moveSpd",   cap:4, cost:l=>20*(l+1), per:0.03, label:"Celeridad", eff:"+3% vel. mov.",  glyph:"»" },
  { key:"reroll",    cap:2, cost:_=>40,       per:1,    label:"Presagio",  eff:"+1 reroll boon", glyph:"↻" },
  { key:"startGold", cap:5, cost:l=>12*(l+1), per:25,   label:"Fortuna",   eff:"+25 oro inicial",glyph:"$" },
];
// ===================== CAS-1565: META-PROGRESSION v2 (Tier-2 + Ascensión) ===
// Tier-2 altar row — IDENTITY upgrades gated behind a fully-maxed v1 row (a PROGRESS wall,
// not a time-wall). Same isolated store (mithralda.meta.v1; internal `v` bumped 1→2). Each
// node reuses an EXISTING deterministic sim lever so nothing is baked in a way the Stage-2
// authority layer would have to unwind — all are read-live or per-run (like v1's reroll):
//   t2_boonRare  → drawBoonChoices effective depth (same lever as cursed/apex/world-tier)
//   t2_startBoon → applyMetaStartBoons at run-start (per-run, wiped on death like reroll)
//   t2_dashIframe→ roll() i-frame window (read live at the dash seam)
//   t2_xpGain    → gainXP multiplier (read live at the single XP chokepoint)
//   t2_reroll    → applyMetaReroll, stacked on the v1 Presagio charge (per-run)
// SWAP NOTE (CAS-1565): the plan's 5th node was `t2_zoneChest` (guaranteed chest per zone).
// The world is a BOOT-TIME singleton (sim.js:48) whose chests never reset between runs and
// whose layout must derive purely from the seed (Stage-2 determinism, sim.js:14) — so a
// per-run guaranteed-chest system has NO clean hook and would be exactly the fragile wiring
// the plan told me to avoid. Swapped to `t2_xpGain` ("Erudición", +XP), which rides the lone
// gainXP() chokepoint: pure, read-live, instantly reversible on ascend. Flagged to the CTO
// for veto before deploy — the node is fully data-driven (rename/replace = one row + one
// hook line) and NO live save carries any t2_* key yet, so the swap has zero migration cost.
export const META_T2 = [
  // key            cap  cost(currentLvl)     per-level effect                      label / blurb / glyph
  { key:"t2_boonRare",   cap:3, cost:l=>60*(l+1),  per:1.5,  label:"Presagio Mayor", eff:"+prob. boon raro",    glyph:"✦" },
  { key:"t2_startBoon",  cap:2, cost:l=>120*(l+1), per:1,    label:"Vanguardia",     eff:"+1 boon inicial",     glyph:"❖" },
  { key:"t2_dashIframe", cap:2, cost:l=>90*(l+1),  per:0.07, label:"Evasión",        eff:"+70ms i-frames dash", glyph:"⟿" },
  { key:"t2_xpGain",     cap:3, cost:l=>130*(l+1), per:0.08, label:"Erudición",      eff:"+8% experiencia",     glyph:"✜" },
  { key:"t2_reroll",     cap:2, cost:l=>100*(l+1), per:1,    label:"Vidente",        eff:"+1 reroll boon",      glyph:"↺" },
];
// ===================== CAS-1649: META-PROGRESSION v3 (Nodos de Legado) ======
// Legacy Nodes add AGENCY to the Ascensión: on each ascend the player picks ONE permanent
// legacy from this pool. Legacies SURVIVE the altar sacrifice (ascendMeta never touches
// legacyNodes) and ACCUMULATE across ascensions — they sit ON TOP of the linear ascMult.
// Same isolated store (mithralda.meta.v1) — ADDITIVE schema, `v` is NOT bumped (a v1/v2 blob
// with no legacyNodes migrates to []). Each node reuses an EXISTING deterministic sim lever
// gated on legacyCount>0, so 0 legacies → every hook is a no-op → the sim stream is byte-
// identical to build 34acf5b35e1d (AC6). $0 art: glyphs are reused from the altar rows.
//   `oneTime:true`  → offered only while NOT owned (leg_vigia); numeric nodes are stackable.
export const LEGACY_NODES = [
  // key                 oneTime  label            eff (blurb)                                   glyph
  { key:"leg_vigia",        oneTime:true,  label:"Vigía",         eff:"El Tier-2 del altar arranca desbloqueado", glyph:"❖" },
  { key:"leg_avaro",        oneTime:false, label:"Avaro",         eff:"+1 reroll de boon por run",               glyph:"↻" },
  { key:"leg_superviviente",oneTime:false, label:"Superviviente", eff:"+1 poción de vida y +1 de maná por run",   glyph:"♥" },
  { key:"leg_cazador",      oneTime:false, label:"Cazador",       eff:"+10% daño vs élites/campeones",           glyph:"⚔" },
  { key:"leg_erudito",      oneTime:false, label:"Erudito",       eff:"+50% Esencia en el payout del run",       glyph:"✜" },
];
const LEGACY_MAP = (()=>{ const m={}; for(const n of LEGACY_NODES) m[n.key]=n; return m; })();
// How many times `key` has been chosen (stackable numeric nodes) — the read-live count every
// effect hook multiplies against. Reads the untrusted array defensively (guardrail like safeAffixes).
function legacyCount(key){ const a=ensureMeta().legacyNodes; if(!Array.isArray(a)) return 0;
  let c=0; for(const k of a) if(k===key) c++; return c; }
function hasLegacy(key){ return legacyCount(key)>0; }
// The nodes ELIGIBLE for the current ascension = all LEGACY_NODES except one-time nodes already
// owned. Stackable nodes always appear. Deterministic, 0 RNG.
function legacyPool(){ return LEGACY_NODES.filter(n=> !n.oneTime || !hasLegacy(n.key)); }
// Grant one legacy on ascension. Validates key ∈ legacyPool() (eligible) — a one-time node
// already owned, or an unknown key, is rejected. Deterministic, 0 RNG (AC6).
export function chooseLegacy(key){ if(!LEGACY_MAP[key]) return false;
  if(!legacyPool().some(n=>n.key===key)) return false;
  ensureMeta().legacyNodes.push(key); G.metaDirty=true; return true; }
// CAS-1574: ability-rank rows join the SAME lookup that buyMetaNode/metaLvl/metaNodeCost read
// (each carries its own {cap, cost(lvl)}), so they buy/persist through the one meta store with no
// parallel system. They are NOT added to T2_MAP → never gated by t2Unlocked().
// CAS-1580: ability-UNLOCK rows join the SAME lookup (cap:1, own cost) → buy/persist/migrate for free.
// Like ABILITY_RANKS they are NOT added to T2_MAP → never gated by t2Unlocked().
const META_MAP = (()=>{ const m={}; for(const n of META_NODES) m[n.key]=n; for(const n of META_T2) m[n.key]=n; for(const r of ABILITY_RANKS) m[r.key]=r; for(const r of ABILITY_UNLOCKS) m[r.key]=r; return m; })();
const T2_MAP = (()=>{ const m={}; for(const n of META_T2) m[n.key]=n; return m; })();
// Canonical Ascensión essence multiplier for a level (+25% per level). NEVER trust a persisted
// mult — always recompute from the level so a tampered blob can't inflate the economy.
function ascMult(level){ return 1 + 0.25*Math.max(0, level|0); }
function metaDefault(){ const nodes={ hpMax:0,dmg:0,moveSpd:0,reroll:0,startGold:0,
          t2_boonRare:0,t2_startBoon:0,t2_dashIframe:0,t2_xpGain:0,t2_reroll:0 };
  for(const r of ABILITY_RANKS) nodes[r.key]=0; // CAS-1574: ability-rank rows default to 0
  for(const r of ABILITY_UNLOCKS) nodes[r.key]=0; // CAS-1580: ability-unlock rows default to 0 (=locked)
  // CAS-1649: legacyNodes = ordered list of chosen legacy keys (accumulates across ascensions).
  // Additive — `v` stays 2 (a v1/v2 blob without it migrates to [] in loadMeta).
  return { v:2, essence:0, nodes, legacyNodes:[], ascension:{ level:0, mult:1 } }; }
// Ascensión level currently banked (defensive: an old in-memory blob may predate ascension).
function ascLevel(){ const a=ensureMeta().ascension; return (a&&a.level|0)||0; }
// Tier-2 is visible/buyable ONLY once every v1 node is at its cap (the progress gate).
function t2Unlocked(){ if(hasLegacy("leg_vigia")) return true; // CAS-1649: Vigía legacy skips the Tier-1-maxed gate
  for(const n of META_NODES){ if(metaLvl(n.key)<n.cap) return false; } return true; }
// Ascender is offered ONLY when the WHOLE altar (v1 + Tier-2) is maxed.
function altarFullMax(){ if(!t2Unlocked()) return false; for(const n of META_T2){ if(metaLvl(n.key)<n.cap) return false; } return true; }
// Lazily materialise the in-memory meta (before persist.bootMeta rehydrates it, or in a
// headless smoke run) so no sim path ever dereferences null. Idempotent.
function ensureMeta(){ if(!G.meta) G.meta=metaDefault(); return G.meta; }
// Validated node level (0..cap) — the untrusted-blob guardrail (mirrors sanitizeBoons).
function metaLvl(key){ const n=META_MAP[key]; if(!n) return 0;
  return Math.max(0, Math.min(n.cap, (ensureMeta().nodes[key]|0))); }
// Cost of the NEXT level of a node, or null when capped. Pure (UI + buy both read it).
export function metaNodeCost(key){ const n=META_MAP[key]; if(!n) return null;
  const lvl=metaLvl(key); return lvl>=n.cap ? null : Math.floor(n.cost(lvl)); }
// The essence earned by a finished run (v1 TUNABLE formula). Reads existing counters only
// (level + this-run elites + conquest zones cleared this cycle + world tier) — invents no
// new economy. Floored, min 1 so any run that got anywhere still drips currency.
function essenceForRun(h, r){ if(!h) return 0;
  const lvl=h.lvl|0, elites=(r&&r.elites)|0;
  const zonas=((h.conquest&&h.conquest.bossesDown&&h.conquest.bossesDown.length)|0);
  const tier=(h.conquest&&h.conquest.tier)||1;
  // CAS-1586: Élite-afijo tie-in — each affixed kill this run adds MOB_AFFIX_ESSENCE to the raw
  // essence (before the Ascensión multiplier). No RNG → at rate=0 there are 0 affixed kills →
  // r.affixKills=0 → the term vanishes → the essence payout stays byte-identical to build 87346b8599db.
  const afk=(r&&r.affixKills)|0;
  // CAS-1590: each Élite Campeón slain this run banks a GUARANTEED, data-driven Esencia bounty on
  // top of the affix drip. No RNG → 0 champions (incl. CHAMPION_RATE=0) → term vanishes → byte-identity.
  const champs=(r&&r.champElites)|0;
  const raw0 = lvl*2 + elites*5 + zonas*10 + (tier-1)*15 + afk*MOB_AFFIX_ESSENCE + champs*CHAMPION.essence;
  if(raw0<=0) return 0;
  // CAS-1632: corona_ecos unique (+25% Esencia) scales the raw haul BEFORE the Ascensión mult.
  // Read live off the equipped instances (uniqTotals) — derived, 0 RNG; unequipped → ×1 (byte-identical).
  // CAS-1649: leg_erudito legacy (+50%/stack Esencia) scales the raw haul at the SAME point as
  // corona_ecos — before the Ascensión mult. Read-live off the meta count; 0 stacks → ×1 (byte-id).
  // CAS-1654: Erudito set (+15% Esencia at 2pz) folds in at the SAME point as corona_ecos —
  // read-live off the equipped instances; no set pieces → +0 → byte-identical.
  // CAS-1763: PACTOS DE PODER — heat scales the Esencia haul at the SAME point as the unique/set/legacy
  // bonuses (before the Ascensión mult). Pure arithmetic (0 RNG); pactRewardMul=1.0 at heat=0 ⇒ byte-identical.
  const raw = raw0 * (1 + (uniqTotals(h).essencePct + setTotals(h).essencePct)/100) * (1 + 0.5*legacyCount("leg_erudito")) * pactRewardMul("essence");
  // CAS-1565: Ascensión/Prestigio multiplier — the permanent payoff for sacrificing the altar.
  return Math.max(1, Math.floor(raw * ascMult(ascLevel()))); }
// Reconcile the DURABLE meta stats (HP / dmg / gold / moveSpeed) onto a hero at a run-start
// seam. Idempotent via h.metaApplied (the amount already baked in, persisted in the save):
// only the DELTA to the current node totals is applied, so calling it at createHero AND
// respawn AND loadSave never double-counts, yet a node bought at the altar takes effect the
// very next run. Reroll is handled separately (it is a per-run charge reset by respawn).
function reconcileMeta(h){ if(!h) return; ensureMeta();
  const wantHp=metaLvl("hpMax")*META_MAP.hpMax.per, wantDmg=metaLvl("dmg")*META_MAP.dmg.per,
        wantGold=metaLvl("startGold")*META_MAP.startGold.per, wantSpdLv=metaLvl("moveSpd");
  const had=h.metaApplied||(h.metaApplied={hp:0,dmg:0,gold:0,spdLv:0});
  if(wantHp!==had.hp) h.maxHp += (wantHp-had.hp);
  if(wantDmg!==had.dmg) h.baseDmg += (wantDmg-had.dmg);
  if(wantGold!==had.gold) h.gold = Math.max(0, (h.gold|0) + (wantGold-had.gold));
  if(wantSpdLv!==had.spdLv && h.moveSpeed){
    // moveSpeed is recomputed from the class base each newHero and carried across respawn,
    // so apply the level change as a multiplicative delta (reversible, never compounding).
    h.moveSpeed = h.moveSpeed * (1+META_MAP.moveSpd.per*wantSpdLv) / (1+META_MAP.moveSpd.per*had.spdLv);
  }
  h.metaApplied={hp:wantHp, dmg:wantDmg, gold:wantGold, spdLv:wantSpdLv};
  // CAS-1751: refresh the cached Códice bonus onto the hero at every run-start/load/respawn seam
  // (reconcileMeta is called from createHero, loadSave, and respawn). Derived, never baked — 0 when disabled.
  applyCodex(h);
  // CAS-1758: cache the equipped Títulos de Gesta label onto the hero at the same run-start/load/respawn
  // seams (after applyCodex). Derived, never baked — h.title="" when disabled ⇒ HUD byte-identical.
  applyTitles(h);
}
// Re-apply the per-run REROLL charges from meta ON TOP of the freshly-reset budget. Called
// ONLY at true run-start seams (createHero / respawn) AFTER rerollLeft is reset to its base,
// because respawn wipes rerollLeft to 1 — the CRÍTICO seam the epic plan calls out.
function applyMetaReroll(h){ if(!h) return;
  const rr=metaLvl("reroll")*META_MAP.reroll.per + metaLvl("t2_reroll")*T2_MAP.t2_reroll.per + legacyCount("leg_avaro"); // CAS-1565: Vidente stacks on v1 Presagio; CAS-1649: +1/stack Avaro legacy
  if(rr) h.rerollLeft=(h.rerollLeft|0)+rr; }
// CAS-1565: grant the Tier-2 "Vanguardia" starting boon(s) at a run-start seam. Boons are a
// PER-RUN pool (respawn wipes h.boons), so this is a clean one-shot each run — exactly like
// the reroll charge — with NO durable baking / reversibility debt. Deterministic off the sim
// RNG (drawBoonChoices → srand), distinct picks, using the same weighted model the draft uses.
function applyMetaStartBoons(h){ if(!h) return; const n=metaLvl("t2_startBoon")*T2_MAP.t2_startBoon.per; if(n<=0) return;
  const ids=drawBoonChoices(h, n, false, false);
  for(const id of ids){ if(BOON_MAP[id] && (h.boons||(h.boons=[])).indexOf(id)<0) h.boons.push(id); }
  recalcBoons(h); }
// CAS-1565: read-live Tier-2 dash i-frame bonus (never baked → reverts instantly on ascend).
function metaDashIframe(){ return metaLvl("t2_dashIframe")*T2_MAP.t2_dashIframe.per; }
// --- persistence hooks (I/O-free; persist.js owns localStorage) ---
export function serializeMeta(){ const m=ensureMeta(); const nodes={};
  for(const n of META_NODES) nodes[n.key]=metaLvl(n.key);
  for(const n of META_T2)    nodes[n.key]=metaLvl(n.key); // CAS-1565: Tier-2 levels
  for(const r of ABILITY_RANKS) nodes[r.key]=metaLvl(r.key); // CAS-1574: ability-rank levels
  for(const r of ABILITY_UNLOCKS) nodes[r.key]=metaLvl(r.key); // CAS-1580: ability-unlock levels
  const lvl=ascLevel();
  // CAS-1649: legacyNodes persist as a flat array of chosen keys (additive; `v` unchanged).
  return { v:2, essence:Math.max(0,m.essence|0), nodes, legacyNodes:(m.legacyNodes||[]).slice(), ascension:{ level:lvl, mult:ascMult(lvl) } }; }
// CAS-1565: retro-compatible migration (one-way door — critical). A v1 blob (v:1, no t2_*/
// ascension) loads clean: v1 nodes + essence are preserved, the missing t2_* keys stay at the
// metaDefault() 0, and ascension defaults to level 0. A v2 blob round-trips fully. Every level is
// clamped to its cap and the Ascensión mult is ALWAYS recomputed from the level (never trusted).
export function loadMeta(d){ const def=metaDefault();
  if(d && typeof d==="object"){ def.essence=Math.max(0, (d.essence|0));
    const n=(d.nodes&&typeof d.nodes==="object")?d.nodes:{};
    for(const node of META_NODES) def.nodes[node.key]=Math.max(0, Math.min(node.cap, (n[node.key]|0)));
    for(const node of META_T2)    def.nodes[node.key]=Math.max(0, Math.min(node.cap, (n[node.key]|0)));
    for(const r of ABILITY_RANKS) def.nodes[r.key]=Math.max(0, Math.min(r.cap, (n[r.key]|0))); // CAS-1574: additive — blobs w/o rank_* load to 0
    for(const r of ABILITY_UNLOCKS) def.nodes[r.key]=Math.max(0, Math.min(r.cap, (n[r.key]|0))); // CAS-1580: additive — blobs w/o unlock_* load to 0 (=locked)
    const lvl=Math.max(0, (d.ascension&&d.ascension.level|0)||0);
    def.ascension={ level:lvl, mult:ascMult(lvl) };
    // CAS-1649: migrate legacyNodes — a v1/v2 blob without the key → [] (default). Filter unknown
    // keys (untrusted-blob guardrail like safeAffixes) so a tampered save can't inject fake legacies.
    def.legacyNodes = Array.isArray(d.legacyNodes) ? d.legacyNodes.filter(k=>LEGACY_MAP[k]) : []; }
  G.meta=def; return true; }
// --- gameplay API (input.js / render.js / QA hooks call these) ---
// Read-only altar view model: essence + each node's level, cap, next cost (null=capped), effect.
export function metaSnap(){ const m=ensureMeta();
  const view=n=>({ key:n.key, label:n.label, eff:n.eff, glyph:n.glyph, lvl:metaLvl(n.key), cap:n.cap, cost:metaNodeCost(n.key) });
  const lvl=ascLevel();
  // CAS-1574: ability-rank rows. Shape matches altarRow's contract (label/eff/glyph/lvl/cap/cost
  // + key) so render reuses the same row renderer; eff is the CURRENT rank's effect text.
  const abilView=r=>{ const lvl=metaLvl(r.key), cost=metaNodeCost(r.key);
    return { key:r.key, label:r.label, glyph:r.glyph, eff:r.eff(lvl), lvl, cap:r.cap, cost, affordable: cost!=null && (m.essence|0)>=cost }; };
  // CAS-1580: ability-UNLOCK rows (cap:1). `unlock:true` + `unlocked` let altarRow render the
  // "Desbloquear"/"✓ DESBLOQUEADA" states instead of the generic Mejorar/MÁX. eff = static blurb.
  const unlockView=r=>{ const lvl=metaLvl(r.key), cost=metaNodeCost(r.key);
    return { key:r.key, label:r.label, glyph:r.glyph, eff:r.eff, lvl, cap:r.cap, cost, unlock:true, unlocked:lvl>0, affordable: cost!=null && (m.essence|0)>=cost }; };
  return { essence:m.essence|0,
    nodes:META_NODES.map(view),          // Tier-1 (back-compat: input.js Digit1-5 reads sim.META_NODES)
    t2:META_T2.map(view),                 // CAS-1565: Tier-2 rows
    abilities:ABILITY_RANKS.map(abilView), // CAS-1574: ability-rank rows (never gated)
    unlocks:ABILITY_UNLOCKS.map(unlockView), // CAS-1580: ability-unlock rows (never gated)
    t2Unlocked:t2Unlocked(),              // gate: every v1 node maxed
    canAscend:altarFullMax(),             // Ascender enabled: whole altar maxed
    // CAS-1649: legacy view — ALL nodes (with owned count) for the codex, plus the eligible
    // choices for the current ascension (one-time owned nodes dropped). Render reads these with
    // no logic of its own (mirrors the nodes/t2 rows).
    legacy:LEGACY_NODES.map(n=>({ key:n.key, label:n.label, eff:n.eff, glyph:n.glyph, owned:legacyCount(n.key), oneTime:n.oneTime })),
    legacyChoices:legacyPool().map(n=>({ key:n.key, label:n.label, eff:n.eff, glyph:n.glyph, owned:legacyCount(n.key), oneTime:n.oneTime })),
    ascension:{ level:lvl, mult:ascMult(lvl) } }; }
// Buy the next level of a node: guarded on cap + sufficient essence (never over-spends or
// over-caps). Returns true on a real purchase (marks the store dirty for an immediate flush).
export function buyMetaNode(key){ const n=META_MAP[key]; if(!n) return false;
  if(T2_MAP[key] && !t2Unlocked()) return false; // CAS-1565: Tier-2 stays locked until the v1 row is fully maxed
  const m=ensureMeta(); const lvl=metaLvl(key); if(lvl>=n.cap) return false;
  const cost=Math.floor(n.cost(lvl)); if((m.essence|0)<cost) return false;
  m.essence=(m.essence|0)-cost; m.nodes[key]=lvl+1; G.metaDirty=true;
  // A bought node takes effect from the NEXT run-start reconcile; if the same hero is about
  // to respawn (buying at the death altar), that respawn's reconcileMeta applies the delta.
  return true; }
// CAS-1565: ASCENSIÓN / PRESTIGIO (opt-in). Requires the WHOLE altar maxed (altarFullMax). The
// sacrifice: ALL node levels → 0 and banked essence → 0; the reward: ascension.level += 1 and a
// permanent +25%/level essence multiplier (ascMult), applied by essenceForRun from the very next
// run. Reversibility: hero.metaApplied is DELIBERATELY LEFT INTACT — the next run-start
// reconcileMeta reads want=0 (nodes reset) vs had=(old baked amounts) and applies the negative
// delta, cleanly stripping the sacrificed v1 stats off the live hero (delta engine, no double-apply).
// CAS-1649: the sacrifice NEVER touches m.legacyNodes (AC2) — legacies survive the ascend and
// accumulate. The UI opens the legacy-choice modal AFTER this returns (input.js altarTap).
export function ascendMeta(){ if(!altarFullMax()) return false;
  const m=ensureMeta(); const lvl=ascLevel()+1;
  for(const n of META_NODES) m.nodes[n.key]=0;
  for(const n of META_T2)    m.nodes[n.key]=0;
  m.essence=0; m.ascension={ level:lvl, mult:ascMult(lvl) }; G.metaDirty=true;
  // CAS-1758: an ascension can cross a title threshold (meta.ascension) — reevaluate + refresh HUD cache.
  applyTitles(G.hero);
  return true; }
// QA / dev hook (window.__metaReset): wipe the account meta back to zero (mirrors the run
// resets). Also clears the hero's baked-in baseline so a live hero re-reconciles cleanly.
export function resetMeta(){ G.meta=metaDefault(); G.metaDirty=true;
  if(G.hero) G.hero.metaApplied={hp:0,dmg:0,gold:0,spdLv:0}; return true; }
// CAS-1580 — the run-start DRAFT pool: every UNLOCKED ability. An ability is unlocked when it has no
// `locked` flag (the 4 originals) OR its unlock_* meta row is bought (lvl>0). This is the SINGLE
// filter point read by the draft (render + keyboard + touch snapshot G.abilPool from it) and by the
// setLoadout fallback, so a locked ability can never enter a loadout. With no purchases it returns the
// 4 originals in their original order → the draft is byte-identical to pre-CAS-1580 (RNG-neutral).
export function draftPool(){ return ACTIVE_ABILITIES.filter(a=> !a.locked || metaLvl("unlock_"+a.id)>0); }

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
    // CAS-1557: persist how much ACCOUNT-META bonus is baked into the durable stats above
    // (maxHp/baseDmg/gold/moveSpeed level). This is the idempotency baseline reconcileMeta
    // subtracts on load so meta never double-applies across a reload. Additive — old saves
    // lack it → baseline 0 (they carry no meta). The meta itself lives in its OWN store.
    metaApplied: Object.assign({hp:0,dmg:0,gold:0,spdLv:0}, h.metaApplied||{}),
    // CAS-383: persist the CURRENT-run drafted boons so a same-run reload keeps the build.
    // Additive — old saves lack it → empty list → zero bundle. A death/new run wipes them
    // (respawn/createHero), so a fresh run never inherits a prior run's boons.
    boons:(h.boons||[]).slice(),
    // CAS-1659: persist the run's drafted Ultimate + its charge so a same-run reload keeps them.
    // Additive — old saves lack `ult` → default null → RNG-neutral baseline. NO SAVE_VERSION bump.
    ult:h.ultId||null, ultCharge:h.ultCharge||0,
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
    affixKills:h.affixKills||0, // CAS-1586: durable lifetime affixed-trash kills (additive; old saves → 0, no SAVE_VERSION bump)
    champElites:h.champElites||0, // CAS-1590: durable lifetime Élite-Campeón kills (additive; old saves → 0, no SAVE_VERSION bump)
    zoneEventsDone:h.zoneEventsDone||0, // CAS-1681: durable lifetime zone-events completed (additive; old saves → 0, no SAVE_VERSION bump)
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
    h.talents=sanitizeTalents(d.talents, h.cls, h.lvl); h.talentPts=Math.max(0,Math.floor(num(d.talentPts,0))); recalcTalents(h);
    // CAS-123: rehydrate the Stage-1 arc (clamped; absent in old saves → fresh run).
    h.stage1=!!d.stage1; h.playT=Math.max(0,num(d.playT,0)); h.deaths=Math.max(0,Math.floor(num(d.deaths,0)));
    h.kills=Math.max(0,Math.floor(num(d.kills,0))); h.champKills=Math.max(0,Math.floor(num(d.champKills,0))); // CAS-134
    // CAS-375: rehydrate per-type tally (sanitized to non-negative ints; absent in old saves → {}).
    h.killsByType={}; if(d.killsByType && typeof d.killsByType==="object"){ for(const k in d.killsByType){ const v=Math.max(0,Math.floor(num(d.killsByType[k],0))); if(v>0) h.killsByType[k]=v; } }
    h.eliteKills=Math.max(0,Math.floor(num(d.eliteKills,0))); // CAS-149 (rank derives; maxHp already carries the baked bonus)
    h.affixKills=Math.max(0,Math.floor(num(d.affixKills,0))); // CAS-1586 (additive lifetime counter; absent in old saves → 0)
    h.champElites=Math.max(0,Math.floor(num(d.champElites,0))); // CAS-1590 (additive lifetime counter; absent in old saves → 0)
    h.zoneEventsDone=Math.max(0,Math.floor(num(d.zoneEventsDone,0))); // CAS-1681 (additive lifetime counter; absent in old saves → 0)
    h.boons=sanitizeBoons(d.boons); recalcBoons(h); // CAS-383: rehydrate current-run boons (validated ids) + rebuild bundle BEFORE heroMaxHp reads it
    // CAS-1659: rehydrate the drafted Ultimate (validated against ULTIMATE_MAP; old saves lack
    // `d.ult` → null → RNG-neutral baseline). Charge clamped 0..1, forced 0 when no ultimate.
    h.ultId=(d.ult && ULTIMATE_MAP[d.ult])?d.ult:null; h.ultCharge=h.ultId?Math.max(0,Math.min(1,num(d.ultCharge,0))):0;
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
    // CAS-1557: restore how much account-meta is ALREADY baked into the loaded maxHp/dmg/gold/
    // moveSpeed (persisted alongside them), then reconcile against the current meta store. On a
    // pre-meta save these fields are absent → baseline 0 → reconcile applies the current meta once
    // (the save never carried it). On a current save the delta is 0 unless a node was bought since.
    if(d.metaApplied && typeof d.metaApplied==="object"){ const ma=d.metaApplied;
      h.metaApplied={ hp:Math.max(0,num(ma.hp,0)), dmg:Math.max(0,num(ma.dmg,0)), gold:Math.max(0,num(ma.gold,0)), spdLv:Math.max(0,Math.floor(num(ma.spdLv,0))) }; }
    reconcileMeta(h);
    h.hp=heroMaxHp(h); h.mp=h.maxMp;                       // always respawn at full
    // CAS-128: resume an in-progress tutorial (clamped); a finished/absent one stays off.
    if(d.tut && typeof d.tut.i==="number"){ startTutorial(); G.tut.i=Math.max(0,Math.min(TUT_STEPS.length-1,Math.floor(d.tut.i))); }
    else G.tut=null;
    G.hero=h; G.hunts=initHunts(); G.fields.length=0; G.ambush={t:AMBUSH.first, active:false}; resetZoneEvents();
    G.arenaMode=false; G.pendingArena=false; // CAS-1664: a resumed run is the normal adventure, never arena (the arena best lives in its own store)
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
    stun:0, slow:1, slowT:0, dots:null, // crowd-control sinks: stun freezes the AI, slow scales chase speed, dots = active DoTs (CAS-118); all time-based, no RNG
    poise:0, poiseMax:0, staggerT:0, staggerCD:0, _poiseDecayT:0}; // CAS-1826: postura/stagger run-state (transient, never serialized). poiseMax stays 0 until the first hero hit resolves the tier (flags land post-spawn); 0 ⇒ this enemy never accrues
  G.enemies.push(e); return e;
}
// CAS-1826: resolve a tier enemy's POSTURA ceiling. Lazily read at hit-time because the tier flags
// (e.elite/champion/champElite/isBoss) are grafted AFTER spawnEnemy at each promotion site — resolving here
// covers ALL of them with zero-miss (no need to hook every promotion). 0 ⇒ this enemy never accrues postura
// (basic trash, neutrals, 0-dmg supports). Pure data read — no RNG, no side effects. Boss uses its own profile.
function poiseCeil(e){ if(!POISE.enabled || !e || !e.tpl) return 0;
  if(e.isBoss) return POISE.boss.max;
  if(e.elite||e.champion||e.champElite) return POISE.elite.max;
  if(POISE.basicMelee && !e.tpl.neutral && (e.tpl.dmg||0)>0 && (e.tpl.range||0)<=60) return POISE.elite.max;
  return 0; }
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
  // CAS-1763: PACTOS DE PODER — the opt-in difficulty covenant layers ON TOP of every tier/curse/world
  // scaling with the SAME hp/dmg/spd knobs (pure arithmetic on the already-scaled clone → 0 new RNG →
  // the srand/loot stream is byte-identical). All muls default 1.0 (disabled / heat=0), and the guard
  // skips the clone entirely when nothing is active, so a build with no pact ranked is byte-identical here.
  if(PACTS.enabled){ const hpM=pactStatMul("enemyHp"), dgM=pactStatMul("enemyDmg"), spM=pactStatMul("enemySpd");
    if(hpM!==1||dgM!==1||spM!==1){ const bp=e.tpl;
      e.tpl=Object.assign({},bp,{ hp:Math.round(bp.hp*hpM), dmg:Math.round(bp.dmg*dgM), spd:Math.max(1,Math.round(bp.spd*spM)) });
      e.hp=e.maxHp=e.tpl.hp; } }
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
  // CAS-1763: the Pacto de Jauría raises the élite PROMOTION threshold the SAME way World Tier does —
  // it multiplies the rate of the srand roll that ALREADY fires below, it does NOT spawn an extra body
  // or an extra draw (extra bodies ⇒ extra draws ⇒ breaks RNG-neutral). 1.0 (disabled / heat=0) ⇒ no move.
  { const em=pactStatMul("eliteRate"); if(em!==1) rate=Math.min(1,rate*em); }
  if(srand()>=rate) return e;                                      // one srand per eligible spawn (only on the live world path, never in buildWorld → determinism fingerprint untouched)
  let pool=MOB_AFFIX_IDS;
  if(e.tpl.ranged) pool=MOB_AFFIX_IDS.filter(id=>!MOB_AFFIX[id].melee); // Vampiric needs contact → ranged kiters can't carry it
  const firstId=pool[ri(0,pool.length-1)];
  applyAffix(e, firstId);
  maybeChampion(e, pool, firstId); // CAS-1590: a fraction of affixed mobs promote to an Élite Campeón (no-op / 0 srand at rate<=0)
  return e;
}
// CAS-1590: every mob a champion carries its affixes in `e.affixes`; a normal affixed mob has ONE
// (e.affix). Every affix COMBAT/RENDER hook reads through this list so BOTH of a champion's affixes
// stay live (aura + lifesteal + blast + armor all fire). For a non-champion it returns [e.affix], so
// the single-affix hooks behave EXACTLY as before → no regression, byte-identical RNG. Empty for trash.
function mobAffixes(e){ if(!e) return []; if(e.affixes) return e.affixes; return e.affix?[e.affix]:[]; }
// CAS-1590: PROMOTE an already-affixed mob to an Élite Campeón — a mini-boss with a SECOND distinct
// affix + the CHAMPION stat block. HARD-GATED on CHAMPION_RATE>0: at rate<=0 it returns before any
// srand(), so no champion ever spawns and the sim/loot streams stay byte-identical to the affix build.
// The srand()/World-Tier scaling only runs when the feature is on (rate>0), so turning it on is the
// only thing that perturbs the stream (that is the feature being live, not a regression).
// Live champion promotion rate (ships at CHAMPION_RATE). A ?dev harness seam (__dev.setChampRate)
// can force it to 0 to PROVE the RNG-neutral gate at runtime — at 0, maybeChampion draws no srand.
let champRate=CHAMPION_RATE;
function maybeChampion(e, pool, firstId){
  let rate=champRate; if(!(rate>0)) return e;                        // OFF → zero RNG, byte-identical
  const wtm=worldTierMods(); if(wtm) rate=Math.min(1,rate*wtm.affixMul); // World Tier nudges champion rarity the SAME way it nudges affixes (trivial reuse)
  { const em=pactStatMul("eliteRate"); if(em!==1) rate=Math.min(1,rate*em); } // CAS-1763: Jauría nudges champion promotion the SAME way — threshold-only on the roll that already fires
  if(srand()>=rate) return e;                                       // one srand ONLY on the live champion path
  const others=pool.filter(id=>id!==firstId); if(!others.length) return e; // need a DISTINCT 2nd affix
  return applyChampion(e, firstId, others[ri(0,others.length-1)]);
}
// Layer a SECOND affix + the CHAMPION multipliers onto an already-affixed mob. Reuses applyAffix for
// the 2nd affix so its combat hooks are wired, then compounds the champion stat block onto the (already
// cloned) tpl. Records the full 2-affix list + reward flags read by killEnemy/render. No RNG.
function applyChampion(e, firstId, secondId){
  const primaryGait=e.affixGait;      // keep the FIRST affix's walk cadence as the silhouette gait
  applyAffix(e, secondId);            // stacks the 2nd affix's hp/size/reward muls onto the cloned tpl
  const C=CHAMPION, t=e.tpl;
  t.hp=Math.round(t.hp*C.hpMul); t.dmg=Math.round((t.dmg||0)*C.dmgMul);
  t.size=Math.max(1,Math.round(t.size*C.sizeMul));
  t.xp=Math.round(t.xp*C.xpMul);
  t.gold=[Math.round(t.gold[0]*C.goldMul), Math.round(t.gold[1]*C.goldMul)];
  t.gearChance=Math.min(1,(t.gearChance||0)+C.gearBonus);
  e.hp=e.maxHp=t.hp;
  e.affixes=[firstId, secondId];      // canonical list (mobAffixes reads this → both hooks live)
  e.affix=firstId; e.affix2=secondId; // e.affix stays the PRIMARY for single-affix back-compat reads
  e.affixGait=primaryGait||1;         // don't let the 2nd affix override the walk cadence
  e.champElite=true;
  return e;
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

// CAS-1632/1638 — LEGENDARY/UNIQUE drop. Live rate (ships at LEGENDARY.rate). A ?dev seam
// (__dev.setLegRate) forces it to 0 for the OFF-path test. __dev.forceLegendary sets a
// one-shot id so the harness can guarantee a specific unique drops on the next kill.
let legRate=LEGENDARY.rate, forcedLeg=null;
// Called APPEND-ONLY at the very end of a kill's loot resolution — AFTER every pre-existing
// dropGear/rollGearInst — so those rolls are already fixed (byte-identical). `kindBias` scales
// the base rate for elite/champion/boss kills. CAS-1638 AC3 fix: the gate + unique pick draw
// from the DEDICATED legRng stream, NEVER the authoritative srand — so the existing loot/spawn
// sequence is byte-identical for a seed at ANY rate (the shared stream is provably untouched).
function maybeLegendary(x, y, kindBias){
  if(forcedLeg){ const id=forcedLeg; forcedLeg=null; const inst=uniqInst(id); if(inst) dropGear(x, y, inst); return; }
  const rate=legRate*(kindBias>0?kindBias:1)*pactRewardMul("drop"); // CAS-1763: heat lifts the unique-drop threshold (×1.0 at heat=0 ⇒ byte-identical); the legRng roll below already fires
  if(!(rate>0)) return;                                    // OFF / rate 0 → early out, no RNG at all
  if(legRng.srand()>=(rate<1?rate:1)) return;              // dedicated-stream gate — shared srand untouched
  const u=UNIQUES[Math.floor(legRng.srand()*UNIQUES.length)]; // dedicated-stream uniform pick
  dropGear(x, y, { slot:u.slot, defId:u.defId, rarity:"legendary", uniq:u.id });
}

// CAS-1654 — SET-PIECE drop. Slightly more common than a legendary (you must COLLECT
// several to activate a bonus). Mirrors maybeLegendary EXACTLY: append-only, gated off
// the DEDICATED setRng stream so the shared srand is untouched at ANY rate → RNG-neutral.
// __dev.setSetRate forces 0 for the OFF-path determinism test; __dev.forceSetPiece drops
// a specific piece on the next kill so the harness can build a known set.
const SET_DROP_RATE=0.035;
let setRate=SET_DROP_RATE, forcedSet=null;
function maybeSetPiece(x, y, kindBias){
  if(forcedSet){ const id=forcedSet; forcedSet=null; const inst=setInst(id); if(inst) dropGear(x, y, inst); return; }
  const rate=setRate*(kindBias>0?kindBias:1)*pactRewardMul("drop"); // CAS-1763: heat lifts the set-piece threshold (×1.0 at heat=0 ⇒ byte-identical); the setRng roll below already fires
  if(!(rate>0)) return;                                    // OFF / rate 0 → early out, no RNG at all
  if(setRng.srand()>=(rate<1?rate:1)) return;              // dedicated-stream gate — shared srand untouched
  const p=SET_PIECES[Math.floor(setRng.srand()*SET_PIECES.length)]; // dedicated-stream uniform pick
  dropGear(x, y, { slot:p.slot, defId:p.defId, rarity:"epic", set:p.id });
}

// CAS-1687 — RUNAS Y ENGARCES machinery. All three streams below (socket-count on drop, rune-drop
// gate + type pick) draw ONLY from the dedicated runeRng — NEVER the authoritative srand — so gear
// generation and kill loot stay byte-identical whether sockets are on or off (AC1 [AC-RNG-STRONG]).
let runeRate=SOCKETS.dropRate, forcedRune=null; // live-tunable via __dev.setSocketRate; forcedRune = one-shot for the harness
// Roll 0–2 EMPTY sockets onto a fresh gear instance at drop time. Gated by SOCKETS.enabled (kill
// switch → zero runeRng draws → byte-identical). Only weapon/body/shield (the 3 functional slots)
// can be socketed; a piece that already carries sockets (re-drop) is left as-is.
function maybeAddSockets(inst){
  if(!SOCKETS.enabled) return;
  if(!inst || !inst.slot || inst.sockets) return;
  if(inst.slot!=="weapon" && inst.slot!=="body" && inst.slot!=="shield") return;
  const sc=SOCKETS.socketChance||[]; let n=0;
  if(runeRng.srand() < (sc[0]||0)){ n=1; if(runeRng.srand() < (sc[1]||0)) n=2; } // 2nd draw always taken once ≥1, so srand-neutral shape is stable
  if(n>0){ const a=[]; for(let i=0;i<n;i++) a.push({}); inst.sockets=a; }
}
// Drop a rune as a bag item — mirror of maybeLegendary/maybeSetPiece: append-only at the END of a
// kill's loot resolution, gated off the DEDICATED runeRng so the shared srand is untouched at ANY
// rate. __dev.setSocketRate forces 0 for the OFF-path determinism test; __dev.forceSocketRune drops
// a specific rune on the next kill so the harness can build a known engarce.
function maybeSocketRune(x, y, kindBias){
  if(!SOCKETS.enabled) return;
  if(forcedRune){ const t=forcedRune; forcedRune=null; dropRune(x,y,t); return; }
  const rate=runeRate*(kindBias>0?kindBias:1)*pactRewardMul("drop"); // CAS-1763: heat lifts the rune-drop threshold (×1.0 at heat=0 ⇒ byte-identical); the runeRng roll below already fires
  if(!(rate>0)) return;                                    // OFF / rate 0 → early out, no RNG at all
  if(runeRng.srand()>=(rate<1?rate:1)) return;             // dedicated-stream gate — shared srand untouched
  const t=RUNE_ORDER[Math.floor(runeRng.srand()*RUNE_ORDER.length)]; // dedicated-stream uniform pick
  dropRune(x,y,t);
}
// CAS-1768 — roll a WEAPON on-hit affix at drop time. APPEND-ONLY, mirror of maybeAddSockets: called
// from dropGear AFTER the instance's normal roll is fixed, gated off the DEDICATED affixRng so the shared
// srand is byte-identical whether the feature is on or off. Writes ONE optional trailing field `inst.wa`.
// Draw shape (when enabled + weapon + uncommon+): EXACTLY 1 affixRng draw (the gate); if it passes, 1 MORE
// to pick the affix. common / non-weapon / uniq / set consume 0. `forcedAffix` is a one-shot for the harness.
let forcedAffix=null;
function maybeWeaponAffix(inst){
  if(!WEAPON_AFFIXES.enabled) return inst;            // kill switch → 0 draws, no-op
  if(!inst || inst.slot!=="weapon") return inst;      // weapons only
  if(inst.uniq || inst.set) return inst;              // v1: excludes uniques/set-pieces (no proc-on-proc)
  if(inst.wa) return inst;                            // re-drop already carries an affix — leave as-is
  if(forcedAffix){ const id=forcedAffix; forcedAffix=null; if(WEAPON_AFFIXES.defs.some(d=>d.id===id)) inst.wa=id; return inst; }
  if(inst.rarity==="common") return inst;             // rarity gate: uncommon+
  const rank=rarityRank(inst.rarity);                 // uncommon=1 … legendary=4
  const p=WEAPON_AFFIXES.dropChanceByRank[Math.max(0,rank-1)] ?? 0;
  if(affixRng.srand()>=p) return inst;                // 1 draw ALWAYS when enabled+weapon+uncommon+
  const defs=WEAPON_AFFIXES.defs;
  inst.wa=defs[Math.floor(affixRng.srand()*defs.length)].id; // 2nd draw only if the gate passed
  return inst;
}
function dropRune(x,y,type){ const r=runeDef(type); if(!r) return;
  G.drops.push({x,y,kind:"rune",rune:type});
  floater(x,y-18,r.name,r.tint); audio.sfx.loot(1); }

// CAS-197 — the ONE place the three atkspd sources (affixes CAS-117 + talents CAS-119 +
// the "furia" consumable CAS-192) are summed, clamped to the global cohesion ceiling
// ATKSPD_TOTAL_CAP so the independently-capped systems can't compound past intent. Both
// the swing formula and the harness read-out call this, so they can never drift apart.
export function heroAtkspd(h){ h=h||G.hero; if(!h) return 0;
  // CAS-1632: guante_berserker unique (+12% atkspd) joins the summed sources under the same cap.
  // CAS-1654: Cazador set (+10% atkspd at 2pz) sums in at the same seam, still under the shared cap.
  // CAS-1687: Esmeralda runes (+atkspd from filled sockets) sum in at the same seam, still under the shared cap.
  // CAS-1773: Frenesí adds frenzyStacks*perStack.atkspd (additive) BEFORE the shared cap, so
  // it can't runaway past ATKSPD_TOTAL_CAP. enabled:false ⇒ +0 ⇒ byte-identical.
  const s=affixTotals(h).atkspd+(h.tt?h.tt.atkspd:0)+(h.atkspdBuffT>0?h.atkspdBuffAmt:0)+uniqTotals(h).atkspd+setTotals(h).atkspd+socketTotals(h).atkspd+(FRENZY.enabled?h.frenzyStacks*FRENZY.perStack.atkspd:0);
  return s>ATKSPD_TOTAL_CAP?ATKSPD_TOTAL_CAP:s; }

// CAS-1773: MEDIDOR DE FRENESÍ decay tick — single source of truth (called from update(dt) and the
// harness step hook). Within the window the timer winds down; once it lapses the meter loses 1 stack
// every decayEvery s (gradual, not a hard reset). Pure arithmetic, 0 RNG, gated on FRENZY.enabled.
function tickFrenzy(h,dt){ if(!FRENZY.enabled||!h||h.frenzyStacks<=0) return;
  if(h.frenzyT>0){ h.frenzyT-=dt; return; }
  h._frenzyDecayT=(h._frenzyDecayT||0)+dt;
  while(h._frenzyDecayT>=FRENZY.decayEvery && h.frenzyStacks>0){ h._frenzyDecayT-=FRENZY.decayEvery; h.frenzyStacks--; }
  if(h.frenzyStacks<=0) h._frenzyDecayT=0;
}

// CAS-1785: PARADA CON TEMPO tick — single source of truth (called from update(dt) and the harness
// step hook). Winds down the active parry window and the anti-spam cooldown. Pure arithmetic, 0 RNG,
// gated on PARRY.enabled ⇒ when off these fields stay 0 (byte-identical). Mirror of tickFrenzy.
function tickParry(h,dt){ if(!PARRY.enabled||!h) return;
  if(h.parryT>0) h.parryT=Math.max(0,h.parryT-dt);
  if(h.parryCD>0) h.parryCD=Math.max(0,h.parryCD-dt);
}

// CAS-1785: arm the parry window. Dedicated KeyH (input.js) → this export, mirroring how KeyK/KeyY/KeyL
// call read-side actions outside the rebindable `binds` table. Gated on PARRY.enabled + play scene +
// alive + off-cooldown. Arms parryT (active window) and parryCD (whiff cooldown), plus a subtle $0
// windup glint. In cooldown ⇒ whiff (no effect). CERO RNG (timing only). Idempotent-safe re-press.
export function tryParry(){ const h=G.hero;
  if(!PARRY.enabled || G.scene!=="play" || !h || h.dead || h.parryCD>0) return false;
  h.parryT=PARRY.windowMs/1000; h.parryCD=PARRY.cooldownS;
  addFx("dodgering",h.x,h.y,{life:0.20}); audio.sfx.roll();
  return true;
}

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
    if(cfg.heal){ const hh=Math.round(pactHeal(cfg.heal)); h.hp=Math.min(heroMaxHp(h),h.hp+hh); floater(h.x,h.y-30,"+"+hh,"#5fd66a"); } // CAS-1763: Pacto Frágil cuts the heal (×1.0 at heat=0 ⇒ byte-identical)
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
function hitEnemy(e,dmg,ang,opt){
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
  // CAS-1649: leg_cazador legacy — +10%/stack damage vs elite-class targets (affixed mobs, champions,
  // élite-campeones, bosses). Deterministic multiply on the damage number — consumes NO srand, so
  // 0 stacks → byte-identical hit sequence.
  { const cz=legacyCount("leg_cazador"); if(cz>0 && (e.elite||e.champion||e.champElite||e.isBoss||mobAffixes(e).length>0)) dmg*=(1+0.10*cz); }
  // CAS-1773: Frenesí — +perStack.dmgPct% damage per active stack. Deterministic multiply, consumes
  // NO srand, so 0 stacks (or disabled) → ×1 → byte-identical hit sequence. The one dmg choke.
  if(FRENZY.enabled && G.hero && G.hero.frenzyStacks>0) dmg*=(1+G.hero.frenzyStacks*FRENZY.perStack.dmgPct/100);
  // CAS-1785: PARADA CON TEMPO riposte — a successful parry arms a consumable 1-hit buff; the NEXT hero
  // hit lands ×riposteMul, then it's spent. Deterministic multiply, consumes NO srand ⇒ no riposte (or
  // disabled) → ×1 → byte-identical. The counter hit itself sets the buff AFTER its own hitEnemy, so the
  // counter is not self-boosted; the player's follow-up swing is.
  if(PARRY.enabled && G.hero && G.hero._parryRiposte>0){ dmg*=PARRY.riposteMul; G.hero._parryRiposte=0; }
  // CAS-1826: ATURDIMIENTO POR POSTURA — accrue hidden postura on this tier enemy; crossing e.poiseMax BREAKS
  // it into a STAGGER: set e.stun (reuses the AI-freeze gate ⇒ 0 new IA) + e.staggerT (the bonus-dmg window).
  // Pure arithmetic threshold — consumes NO srand (there is no poiseRng), so a firing stagger leaves the srand
  // stream byte-identical. Gated: staggerCD/staggerT>0 pause accrual (no re-stagger lock). opt.noPoise lets the
  // parry counter route through without double-building (the parry seam D adds its own pulse). Heavy/ultimate
  // hits carry more (opt.heavy/opt.ultimate); punishing a live telegraph (e.st>0) adds a bonus.
  if(POISE.enabled && !(opt&&opt.noPoise)){
    const pm=(e.poiseMax=poiseCeil(e));
    if(pm>0 && e.staggerT<=0 && e.staggerCD<=0){
      const g=POISE.gain, add=(opt&&opt.ultimate)?g.ultimate:(opt&&opt.heavy)?g.heavy:g.light;
      e.poise=(e.poise||0)+add + ((TELEGRAPH.enabled && e.st>0)?g.telegraphPunish:0);
      e._poiseDecayT=0;
      if(e.poise>=pm){ const p=e.isBoss?POISE.boss:POISE.elite;
        e.stun=Math.max(e.stun||0,p.dur); e.staggerT=p.dur; e.staggerCD=POISE.reStaggerCD; e.poise=0;
        addFx("spellburst",e.x,e.y-2,{col:"#ffe27a"}); floater(e.x,e.y-30,STR.stagger||"¡ATURDIDO!","#ffe27a"); }
    }
  }
  // Crit chance = talents + the "Instinto Asesino" milestone (mk.crit). RNG is consumed only
  // when the combined chance is >0, so a fresh hero (no talents, no milestones) stays byte-
  // identical for the determinism baseline.
  const critPct=(tt?tt.crit:0)+(mk?(mk.crit||0):0)+(bb?bb.crit:0); // CAS-383: Cristal Frágil crit
  let crit=false, riposted=false;
  // CAS-210: a live RIPOSTE window (armed by a perfect dodge) converts THIS hit into a
  // guaranteed crushing counter — forced crit × riposteMult — and is spent immediately. No
  // srand is consumed on this path, so it stays deterministic and never double-rolls with
  // the normal crit chance below. This is the souls-like read-and-punish payoff.
  // CAS-1654: Cazador set (+20% crit dmg at 3pz) adds to the crit multiplier — read-live off
  // G.hero's equipped set pieces; no set → +0 → byte-identical. Shared by both crit paths below.
  const setCritMult=(G.hero?setTotals(G.hero).critDmgPct:0)/100;
  if(G.hero && G.hero.riposte>0){ riposted=true; crit=true; G.hero.riposte=0;
    dmg*=CFG.riposteMult*(CRIT_BASE+((tt&&tt.critMult)||0)/100+setCritMult); }
  else if(critPct>0 && srand()*100<critPct){ crit=true; dmg*=(CRIT_BASE+((tt&&tt.critMult)||0)/100+setCritMult); }
  // CAS-1768: resolve the equipped weapon's on-hit affix ONCE per hit — gated, and null unless the feature
  // is enabled, the equipped weapon carries a `wa`, and this is NOT a chain rebound (opt.noAffix). Disabled /
  // no-affix ⇒ this is never evaluated ⇒ byte-identical. `m` is the tier-derived magnitude (never stored).
  let wAf=null;
  if(WEAPON_AFFIXES.enabled && !(opt&&opt.noAffix) && G.hero){ const w=G.hero.equip&&G.hero.equip.weapon;
    if(w&&w.wa){ const def=WEAPON_AFFIXES.defs.find(d=>d.id===w.wa);
      if(def){ const tier=(gearDef("weapon",w.defId)||{}).tier||1; wAf={def, m:def.mag*(1+WEAPON_AFFIXES.magPerTier*Math.max(0,tier-1))}; } } }
  // CAS-247 ARMORED affix: a metallic-tinted elite absorbs a fixed fraction of EVERY incoming
  // hero hit (post-crit, so even a crit is blunted) — a damage-soak that makes it a tankier kill.
  // CAS-1768: a 'perforante' weapon IGNORES part of that reduction for THIS hit (before the dmg clamp);
  // pierce=0 unless enabled+equipped ⇒ red==af.dmgReduce ⇒ byte-identical.
  { const pierce=(wAf&&wAf.def.kind==="pierce")?wAf.m:0;
    for(const id of mobAffixes(e)){ const af=MOB_AFFIX[id]; if(af&&af.dmgReduce){ const red=Math.max(0,af.dmgReduce-pierce); dmg=Math.max(1,dmg*(1-red)); break; } } } // CAS-1590: a champion's Acorazado affix soaks the same fraction (one reduce, no double-stack)
  // CAS-1826: a STAGGERED tier enemy takes bonus damage for the whole window (the read→punish payoff). Mirror of
  // the FRENZY/PARRY multiply — deterministic, consumes NO srand ⇒ no stagger (or disabled) → ×1 → byte-identical.
  if(POISE.enabled && e.staggerT>0) dmg*=(e.isBoss?POISE.boss:POISE.elite).bonusDmg;
  e.hp-=dmg; e.hurtFlash=0.16; audio.sfx.ehurt();
  // CAS-383 boon on-hit hooks (all funnel through this one chokepoint, so every hero hit is
  // covered). Sangre de Brasa / Toque Ponzoñoso CONVERT a fraction of the blow into a burn /
  // poison DoT (reuses applyStatus → the existing status stack/feedback). Sed de Sangre leeches
  // on MELEE connects only (heroMeleeHit flag). All deterministic (no srand).
  if(bb){
    if(bb.burn>0)   applyStatus(e,"burn",  {dmg:Math.max(1,Math.round(dmg*bb.burn))});
    if(bb.poison>0) applyStatus(e,"poison",{dmg:Math.max(1,Math.round(dmg*bb.poison))});
    if(heroMeleeHit && bb.lifesteal>0){ const h=G.hero; const mhp=heroMaxHp(h);
      if(h.hp<mhp){ const heal=Math.max(1,Math.round(pactHeal(dmg*bb.lifesteal))); h.hp=Math.min(mhp,h.hp+heal); // CAS-1763: Pacto Frágil cuts lifesteal (×1.0 at heat=0 ⇒ byte-identical)
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
  // CAS-1768: the equipped WEAPON's on-hit affix (lifesteal/chain/burn/stun; pierce already applied above).
  // Resolved once at the top of the hit; the chain rebound passes {noAffix} so it never re-procs (no cascade).
  if(wAf) applyWeaponAffix(wAf, e, dmg, ang);
  // CAS-119: talent on-hit procs — a poison build (druid/mage 'Toque tóxico') ignites
  // veneno every hit; a stun-chance build aturde on a srand roll. Both reuse CAS-118.
  if(tt){ const tp=talentPoison(tt); if(tp) applyStatus(e,"poison",tp);
    if(tt.stunChance>0 && srand()*100<tt.stunChance) applyStatus(e,"stun"); }
  // CAS-1659: charge the Ultimate meter from damage dealt (∝ final post-crit dmg). PURE arithmetic,
  // gated behind a drafted ultimate so a no-Ultimate run touches NOTHING — RNG-neutral + zero cost.
  if(G.hero && G.hero.ultId) G.hero.ultCharge=Math.min(1, (G.hero.ultCharge||0) + dmg*ULT_CHARGE_PER_DMG);
  if(e.tpl.neutral && !e.hostile){ makeHostile(e); registerSkull(); }
  if(e.hp<=0) killEnemy(e);
  else if(e.tpl.neutral) { /* stays hostile */ }
}
// CAS-1768 — apply a resolved weapon on-hit affix. `wAf={def,m}` (m = tier-derived magnitude). DETERMINISTIC
// except the 'stun' proc, which draws from the dedicated affixRng (never srand). VFX reuse existing primitives
// only ($0 art). pierce is handled inline in hitEnemy (before the dmg clamp), so it is a no-op here.
function applyWeaponAffix(wAf, e, dmg, ang){
  const af=wAf.def, m=wAf.m;
  if(af.kind==="lifesteal"){ const h=G.hero; if(h){ const mhp=heroMaxHp(h);
    if(h.hp<mhp){ const heal=Math.max(1,Math.round(pactHeal(m*dmg))); h.hp=Math.min(mhp,h.hp+heal); // routes through pactHeal ⇒ inherits Pacto Frágil healCut + heroMaxHp clamp (never writes h.hp raw)
      floater(h.x,h.y-30,"+"+heal,"#5fd66a",{small:true}); addFx("spark",h.x,h.y-10,{col:af.tint}); } } }
  else if(af.kind==="burn"){ applyStatus(e,"burn",{dmg:Math.max(1,Math.round(m*dmg))}); addFx("flame",e.x,e.y); } // reuses STATUS.burn DoT
  else if(af.kind==="stun"){ if(affixRng.srand()<(af.chance||0)){ applyStatus(e,"stun",{}); addFx("spellburst",e.x,e.y-2,{col:af.tint}); } } // ONLY proc with RNG — dedicated affixRng
  else if(af.kind==="chain"){ // arc to the NEAREST live enemy ≠ e within chainRange (tie-break: lowest index → replay-safe, no RNG)
    const rangePx=(WEAPON_AFFIXES.chainRange||3.5)*TS; let best=null,bd=Infinity;
    for(let i=0;i<G.enemies.length;i++){ const t=G.enemies[i]; if(t===e||t.dead) continue;
      const d=Math.hypot(t.x-e.x,t.y-e.y); if(d<=rangePx && d<bd){ bd=d; best=t; } }
    if(best){ addFx("chainbolt",e.x,e.y-2,{x2:best.x,y2:best.y-2,col:af.tint,life:0.18});
      hitEnemy(best, Math.max(1,Math.round(m*dmg)), Math.atan2(best.y-e.y,best.x-e.x), {noAffix:true}); } } // rebound never re-procs
}
function makeHostile(e){ e.hostile=true; e.tpl=Object.assign({},e.tpl,{aggro:300}); }
// Push a gear ground-drop. The instance carries resolved stat/slot/rarity so the
// renderer + pickup never re-roll; all randomness already happened on the sim RNG.
function dropGear(x,y,inst){ if(!inst) return; maybeAddSockets(inst); maybeWeaponAffix(inst); G.drops.push({x,y,kind:"gear",inst,slot:inst.slot,rarity:inst.rarity,stat:gearStat(inst),tier:(gearDef(inst.slot,inst.defId)||{}).tier||0});
  // CAS-116 — drop-time feedback (AC3): a rarity-coloured floater + sfx the moment
  // notable loot (uncommon+) hits the ground, so the player READS the drop before
  // walking onto it. Common trash stays quiet (no spam) — the ground gem suffices.
  if(rarityRank(inst.rarity)>=1){ floater(x,y-18,gearName(inst),gearCol(inst)); audio.sfx.loot(rarityRank(inst.rarity)); } }
function killEnemy(e){
  if(e.dead) return; e.dead=true;
  freeze(e.isBoss?9:(e.champion?8:5)); // kill confirm — boss/champion deaths land heaviest
  const tpl=e.tpl; const zone=zoneOf(world,e.x,e.y);
  // CAS-1773: MEDIDOR DE FRENESÍ — a real (non-neutral) kill adds a stack if within the window,
  // else re-arms at 1 (first kill after a full decay). Pure arithmetic, 0 RNG, gated on FRENZY.enabled.
  if(FRENZY.enabled && G.hero && !tpl.neutral && !G.hero.dead){
    const h=G.hero;
    if(h.frenzyT>0) h.frenzyStacks=Math.min(FRENZY.maxStacks, h.frenzyStacks+1);
    else h.frenzyStacks=Math.max(h.frenzyStacks,1);
    h.frenzyT=FRENZY.window;
  }
  // CAS-1659: flat Ultimate-charge bump on a real kill (arithmetic, no RNG; gated on a drafted
  // ultimate so a no-Ultimate run is byte-identical). Neutral (non-hostile) deaths don't count.
  if(G.hero && G.hero.ultId && !tpl.neutral) G.hero.ultCharge=Math.min(1, (G.hero.ultCharge||0) + ULT_CHARGE_PER_KILL);
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
      if(bb.onKillHeal>0){ const mhp=heroMaxHp(h); if(h.hp<mhp){ const heal=Math.max(1,Math.round(pactHeal(mhp*bb.onKillHeal))); // CAS-1763: Pacto Frágil cuts on-kill heal (×1.0 at heat=0 ⇒ byte-identical)
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
    maybeLegendary(e.x, e.y+18, LEGENDARY.bossMul);       // CAS-1632: append-only unique roll (after the guaranteed boss piece)
    maybeSetPiece(e.x, e.y+30, LEGENDARY.bossMul);        // CAS-1654: append-only set-piece roll (own setRng stream → srand untouched)
    maybeSocketRune(e.x, e.y+42, LEGENDARY.bossMul);      // CAS-1687: append-only rune roll (own runeRng stream → srand untouched)
    gainXP(tpl.xp); for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30));
    // CAS-1670 — GUARANTEED scaled bonus loot for an ARENA boss (never a normal adventure boss: gated e.arena).
    // Draws from the DEDICATED arenaRng, APPENDED after every existing srand/legRng/setRng draw above, so the
    // shared srand stream is BYTE-IDENTICAL whether the bonus count is 0 or many ([AC-RNG-STRONG]). The count
    // scales with the boss's k index; the base boss drop (guaranteed rare, line above) is untouched.
    if(e.arena){ const k=e.arenaBossK||1; const nExtra=arenaBonusDropCount(k); const floor=ARENA.bossDropRareFloor||"rare";
      for(let i=0;i<nExtra;i++) dropGear(e.x+(i%2?18:-18), e.y+24+i*6, rollGearInst(arenaRng.srand, 2, 3, floor));
      G.arena.lastBonusDrops=nExtra; } }
  else if(e.champion){ onChampionKill(e); maybeLegendary(e.x, e.y-24, LEGENDARY.bossMul); maybeSetPiece(e.x, e.y-36, LEGENDARY.bossMul); maybeSocketRune(e.x, e.y-48, LEGENDARY.bossMul); } // hunt climax — clears the zone; CAS-1632 unique roll + CAS-1654 set roll + CAS-1687 rune roll after all clear-drops
  // CAS-1681: a Cofre Custodiado GUARDIAN — its own branch (skips the trash gold/potion/gearChance
  // srand draws). The chest loot draws from eventRng ONLY, so a guardian kill never perturbs srand.
  else if(e.eventGuard){ gainXP(tpl.xp); shakeAdd(clamp(tpl.size*0.09,1.2,3)); openGuardedChest(e.eventPoiRef); }
  // CAS-1681: a Duende del Tesoro killed by damage still pays its flat Esencia (0 RNG) — its own branch
  // so no srand loot roll fires. Removal rides killEnemy's tail splice (goblinPayoff never splices).
  else if(e.eventGoblin){ goblinPayoff(e.eventPoiRef); if(e.eventPoiRef) e.eventPoiRef.goblin=null; }
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
    else if(e.champElite){ onChampElite(e, zone); } // CAS-1590: guaranteed superior loot + unique roll + banked Esencia (champion path only → RNG untouched at rate=0)
    else if(srand()<((tpl.gearChance||0)*pactRewardMul("drop"))){ const win=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier; // CAS-1763: heat lifts the trash-gear threshold — the gate srand() already fires unconditionally (×1.0 at heat=0 ⇒ byte-identical)
      dropGear(e.x+frr(-8,8),e.y, rollGearInst(srand,win[0],win[1])); }
    // CAS-1586: an AFFIXED trash kill also ticks the lifetime affix-kill counter (feeds the Esencia
    // tie-in via the run recap). Rides the SAME branch that already paid the affix xp/gold/gear, so
    // no new roll/RNG — an un-affixed mob (incl. rate=0) leaves e.affix undefined → counter untouched.
    if(e.affix && G.hero){ G.hero.affixKills=(G.hero.affixKills|0)+1; }
    huntKill(zone); // a normal kill in a hunt zone advances that zone's contract
    if(G.hero && (G.hero.kills%4)===0) grantMats(1); // CAS-237: a steady forge-material trickle from hunting (deterministic off the kill counter, no RNG)
    // CAS-1632: append-only unique roll — runs AFTER onEliteKill/onChampElite/trash-gear have already
    // drawn their srand, so their rolls stay byte-identical. Bias climbs for elites/champions.
    const legBias=e.champElite?LEGENDARY.champMul : (e.elite?LEGENDARY.eliteMul : 1);
    maybeLegendary(e.x, e.y+14, legBias);
    maybeSetPiece(e.x, e.y+26, legBias);                 // CAS-1654: append-only set-piece roll, same bias, own setRng stream
    maybeSocketRune(e.x, e.y+38, legBias);               // CAS-1687: append-only rune roll, same bias, own runeRng stream
  }
  // CAS-1744: bonus-loot fan-out for a Caldera kill. The ONLY new RNG of the zone — drawn from the
  // DEDICATED zone5Rng, APPENDED after every srand/legRng/setRng/runeRng draw above, so the shared
  // srand stream is BYTE-IDENTICAL whether the feature is on or off ([AC-RNG-STRONG]). Gated on
  // ZONE5.enabled AND zone==="caldera" (a zone that only EXISTS when the feature is on), so no draw
  // ever happens with the feature off. Guaranteed-epic boss payoff is untouched (onChampionKill above).
  if(ZONE5.enabled && zone==="caldera" && !tpl.neutral && !e.eventGuard && !e.eventGoblin){
    if(zone5Rng.srand() < (ZONE5.bonusLootRate||0)){ const win=(ZONE_LOOT.caldera||ZONE_LOOT.abyss).tier;
      dropGear(e.x+frr(-10,10), e.y+12, rollGearInst(zone5Rng.srand, win[0], win[1])); } }
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
  { for(const id of mobAffixes(e)){ const af=MOB_AFFIX[id]; if(af&&af.blast && G.hero && !G.hero.dead){ const R=af.blast; // CAS-1590: a champion carrying Volátil erupts on death like any volatile mob
    const dd=Math.hypot(G.hero.x-e.x,G.hero.y-e.y);
    if(dd<=R){ const a=Math.atan2(G.hero.y-e.y,G.hero.x-e.x); damageHero(Math.max(1,Math.round(e.tpl.dmg*(af.blastDmgMul||0.85))),a,null); }
    addFx("novacast",e.x,e.y,{r:R,col:af.col,life:0.5}); addFx("shockring",e.x,e.y,{r:R*0.7,life:0.4});
    for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-R*0.5,R*0.5),e.y+frr(-R*0.5,R*0.5)); shakeAdd(7); audio.sfx.fire(); } } }
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
function gainXP(n){ const h=G.hero; if(n<=0) return;
  n=Math.round(n*(1+metaLvl("t2_xpGain")*T2_MAP.t2_xpGain.per)); // CAS-1565: Erudición meta XP boost (read-live at the single XP chokepoint)
  h.xp+=n; floater(h.x,h.y-30,"+"+n+" XP","#9fe6a0");
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
// CAS-1632 — the ONE cooldown-reduction factor: talent cdr (CAS-119) + the reloj_vacio unique's
// abilCdr, summed and clamped to 60% so the two systems can't stack a spell/ability to ~0 cd.
// Read live off the equipped instances (0 when no unique) → un-equipped cd is byte-identical.
function cdrFactor(h){ const c=Math.min(60, (h&&h.tt?h.tt.cdr:0) + uniqTotals(h).abilCdr + setTotals(h).abilCdr); return 1 - c/100; } // CAS-1654: Erudito set (−10% CD at 3pz) joins under the same 60% cap
export function castSpell(i){
  const h=G.hero; if(h.rolling||h.stun>0) return; // CAS-118: stun gates casting
  if(i===0){ heroAttack(); return; }
  const list=SPELLS[h.cls||"warrior"]; let sp=list && list[i-1];
  if(!sp) return;
  // CAS-1602: overlay a bought talent SPELL-EMPOWER node (ENTREGABLE 1↔2 bridge). RNG-neutral —
  // when no empower node is bought `sp` stays the SAME base object (0 delta); when bought, `apply`
  // returns a COPY with one param scaled (never mutates SPELLS, never touches RNG). Before the gates
  // so an empower that changed cd/cost would drive them (none do today; matches castAbility ordering).
  sp=talentEmpower(h, sp);
  sp=uniqEmpower(h, sp);  // CAS-1632: prisma_fracturado overlays chain-jumps/nova-range (copy-on-write, before gates)
  if(h.spellCD[i]>0) return;                                   // per-slot cooldown gate
  if(h.mp<sp.cost){ toast(STR.notEnoughMP); audio.sfx.deny(); return; }
  // CAS-119: a cooldown-reduction build (cdr) shortens the class-spell cooldown; the
  // HUD ring reads spellCDmax so the shorter wheel is visible. CAS-1632: reloj_vacio folds in via cdrFactor.
  const cd=sp.cd*cdrFactor(h); h.mp-=sp.cost; h.spellCD[i]=cd; h.spellCDmax[i]=cd;
  h.specialAnim=SPECIAL_ANIM_DUR; h.hurtAnim=0; // CAS-256: a class-skill cast plays the special-attack strip (must match render CLASS_SPECIAL_DUR)
  if(sp.sfx && audio.sfx[sp.sfx]) audio.sfx[sp.sfx]();
  resolveSpell(h,sp);
  tutMark("skill"); // CAS-128: a successful class-skill cast teaches the skill step
}
// CAS-1570 — cast a DRAFTED active ability (slot 0 or 1). Mirrors castSpell exactly but
// reads the loadout + its own cooldown array, so abilities and class spells never share
// cooldown state. Reuses the same gates (stun/roll, mana, cdr) + resolveSpell engine.
export function castAbility(slot){
  const h=G.hero; if(!h||h.rolling||h.stun>0) return;
  const id=h.loadout && h.loadout[slot]; let sp=id && ABILITY_MAP[id];
  if(!sp) return;
  if(h.abilCD[slot]>0) return;                                  // per-slot cooldown gate
  // CAS-1574: overlay the PERMANENT Esencia-bought rank scaling. CRÍTICO (RNG-neutral): when the
  // bought rank is 0, `sp` stays the SAME base object — zero behaviour/RNG delta on un-upgraded
  // runs. `apply` returns a COPY (never mutates the shared ABILITY_MAP entry) and touches no RNG.
  // Done BEFORE the mana/cd gates so the scaled `cd` (rayo) drives h.abilCD below.
  const rl=metaLvl("rank_"+id);
  if(rl>0){ const rk=ABILITY_RANK_MAP[id]; if(rk) sp=rk.apply(sp, rl); }
  sp=uniqEmpower(h, sp);  // CAS-1632: prisma_fracturado overlays chain-jumps/nova-range (copy-on-write, before gates)
  if(h.mp<sp.cost){ toast(STR.notEnoughMP); audio.sfx.deny(); return; }
  const cd=sp.cd*cdrFactor(h); h.mp-=sp.cost; h.abilCD[slot]=cd; h.abilCDmax[slot]=cd;  // CAS-1632: reloj_vacio abilCdr via cdrFactor
  h.specialAnim=SPECIAL_ANIM_DUR; h.hurtAnim=0;
  if(sp.sfx && audio.sfx[sp.sfx]) audio.sfx[sp.sfx]();
  resolveSpell(h,sp);
  tutMark("skill");
}
// CAS-1659 — unleash the drafted HABILIDAD DEFINITIVA. Modeled on castAbility, but gated on a FULL
// charge meter (not mana, not a timed CD): casting consumes the whole meter to 0 — refilling it IS
// the cooldown. Reuses resolveSpell (nova/field/buff+heal/chain) so there is ZERO new combat code.
// No-op (with deny feedback) when no ultimate is drafted or the meter isn't full. Returns whether it fired.
export function castUltimate(){
  const h=G.hero; if(!h||h.rolling||h.stun>0) return false;
  if(!h.ultId) return false;                                     // no drafted ultimate → nothing to cast
  const sp=ULTIMATE_MAP[h.ultId]; if(!sp) return false;
  if((h.ultCharge||0)<1){ toast("Definitiva cargando… "+Math.round((h.ultCharge||0)*100)+"%"); if(audio.sfx.deny) audio.sfx.deny(); return false; }
  h.ultCharge=0;                                                 // consume the full meter (CD-by-charge)
  h.specialAnim=SPECIAL_ANIM_DUR; h.hurtAnim=0;
  if(sp.sfx && audio.sfx[sp.sfx]) audio.sfx[sp.sfx]();
  resolveSpell(h,sp);
  floater(h.x,h.y-52,"★ "+sp.name,sp.col||"#ffd24d",{pop:1.9,life:1.3}); shakeAdd(6);
  tutMark("skill");
  return true;
}
// CAS-1659 — the Ultimate pool + run-start 1-of-3 offer. The offer draws ONLY from the dedicated
// `ultRng` stream (append-only, never the shared srand) so the main sim sequence is byte-identical
// whether or not an ultimate is offered/drafted. `ultRate` (dev setUltRate) neutralizes/scales the
// offer for the determinism harness — mirror of setLegRate/setSetRate.
let ultRate=1;
export function ultimatePool(){ return ULTIMATES; }
function rollUltimateOffer(){
  if(ultRate<=0) return [];                                      // neutralized (determinism harness)
  const pool=ULTIMATES.slice(), n=Math.min(ULT_OFFER_N, pool.length), out=[];
  for(let k=0;k<n;k++){ const i=Math.floor(ultRng.srand()*pool.length); out.push(pool.splice(i,1)[0].id); } // dedicated-stream uniform pick, no repeats
  return out;
}
// Draw the run-start offer into G (consumed by the ability-select scene). Falls back to the first
// ULT_OFFER_N ultimates if the offer is empty (e.g. rate neutralized) so the UI always shows a pick.
export function openUltimateOffer(){
  let off=rollUltimateOffer(); if(!off.length) off=ULTIMATES.slice(0,ULT_OFFER_N).map(u=>u.id);
  G.ultOffer=off; G.ultSel=0; return off.slice();
}
// Bank the chosen ultimate for the run (validated; unknown id → none). Resets the meter.
export function chooseUltimate(id){ const h=G.hero; if(!h) return null;
  h.ultId=(id && ULTIMATE_MAP[id])?id:null; h.ultCharge=0; return h.ultId; }
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
      if(sp.heal){ const hh=Math.round(pactHeal(sp.heal)); h.hp=Math.min(heroMaxHp(h),h.hp+hh); floater(h.x,h.y-30,"+"+hh,"#5fd66a"); } // CAS-1763: Pacto Frágil cuts the spell heal (×1.0 at heat=0 ⇒ byte-identical)
      addFx(sp.fx||"novacast",h.x,h.y,{r:sp.range,col:sp.col,style:sp.style,life:0.5}); addFx("shockring",h.x,h.y,{r:sp.range*0.85,life:0.4}); shakeAdd(6); break; }
    case "heal": { const hh=Math.round(pactHeal(sp.heal)); // CAS-1763: Pacto Frágil cuts the heal (×1.0 at heat=0 ⇒ byte-identical)
      h.hp=Math.min(heroMaxHp(h),h.hp+hh); floater(h.x,h.y-30,"+"+hh,"#5fd66a"); }
      addFx(sp.fx||"healburst",h.x,h.y,{col:sp.col,life:0.5}); for(let k=0;k<6;k++) addFx("heal",h.x+frr(-14,14),h.y+frr(-18,6)); break;
    case "hot":
      h.hotT=sp.dur; h.hotRate=sp.heal; floater(h.x,h.y-30,STR.spellRegen,sp.col||"#7bd44a");
      addFx(sp.fx||"buffaura",h.x,h.y,{col:sp.col,life:0.5}); break;
    case "buff":
      applyBuff(h,sp.stat,sp.amt,sp.dur); floater(h.x,h.y-30, sp.stat==="dmg"?STR.spellAtkUp:STR.spellDefUp, sp.col||"#ffd24d");
      // CAS-1659: a buff may ALSO carry an instant heal (Bastión ultimate = def buff + big heal).
      // Additive/optional — un-healed buffs (Égida/Furia have no sp.heal) are unchanged. No RNG.
      if(sp.heal){ const hh=Math.round(pactHeal(sp.heal)); h.hp=Math.min(heroMaxHp(h),h.hp+hh); floater(h.x,h.y-46,"+"+hh,"#5fd66a"); } // CAS-1763: Pacto Frágil cuts the buff-heal (×1.0 at heat=0 ⇒ byte-identical)
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
    case "chain": {
      // CAS-1570 — lightning that ARCS between enemies: seed on the nearest foe within
      // `range`, then hop to the nearest not-yet-hit foe within `jumpRange`, up to
      // `jumps` links, damage decaying by `falloff` each hop. Deterministic (nearest by
      // distance, no RNG). Draws a bolt FX along each link so the chain reads clearly.
      const sd=spellDmg(h,sp); const hit=new Set(); let dmg=sd;
      let px=h.x, py=h.y, links=(sp.jumps||3)+1, reach=sp.range;
      for(let k=0;k<links;k++){
        let best=null,bd=Infinity;
        for(const e of G.enemies){ if(e.dead||hit.has(e)) continue;
          const d=Math.hypot(e.x-px,e.y-py); if(d<=reach+e.tpl.size && d<bd){ bd=d; best=e; } }
        if(!best) break;
        addFx("chainbolt",px,py,{x2:best.x,y2:best.y-2,col:sp.col,life:0.18});   // arc to the target
        hitEnemy(best,dmg,Math.atan2(best.y-py,best.x-px)); applySpellStatus(best,sp);
        hit.add(best); px=best.x; py=best.y; reach=sp.jumpRange||120; dmg*=(sp.falloff||0.8);
      }
      addFx(sp.fx||"spellburst",h.x,h.y-2,{col:sp.col,life:0.25}); shakeAdd(hit.size?4:2); break; }
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
// CAS-1687: a rune goes to the bag like gear (respecting BAG_CAP); full bag melts the weakest
// held GEAR to gold to make room, else the rune is lost to a little gold (never blocks the loop).
function takeRune(type){ const h=G.hero; const r=runeDef(type); if(!r) return;
  if(h.bag.length>=BAG_CAP){
    // prefer to evict the weakest GEAR (runes have no gearStat); if the bag is all runes, refuse cheaply.
    let wi=-1,wv=Infinity; h.bag.forEach((b,i)=>{ if(b&&b.slot){ const v=gearStat(b); if(v<wv){ wv=v; wi=i; } } });
    if(wi>=0){ h.gold+=Math.max(1,Math.round(wv/2)); h.bag.splice(wi,1); toast(STR.bagFull); }
    else { h.gold+=2; toast(STR.bagFull); return; } }
  h.bag.push({rune:type}); audio.sfx.loot(1); toast(STR.loot(r.name));
  floater(h.x,h.y-30,r.name,r.tint,{pop:1.4,life:1.0}); addFx("lootpop",h.x,h.y,{col:r.tint,life:0.5});
}
export function tryPickup(){
  const h=G.hero;
  for(const d of G.drops){ if(d.taken) continue; if(dist2(h.x,h.y,d.x,d.y)<CFG.pickRange*CFG.pickRange){
    if(d.kind==="gold"){ const g=d.amt||ri(3,8); h.gold+=g; audio.sfx.coin(); floater(h.x,h.y-26,"+"+g+" oro",C_GOLD); }
    else if(d.kind==="potionhp"){ h.potHP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de vida")); }
    else if(d.kind==="potionmp"){ h.potMP++; audio.sfx.pickup(); toast(STR.pickedUp("poción de maná")); }
    else if(d.kind==="gear"){ takeGear(d.inst);
      // CAS-1751: read-only Códice discovery AFTER the item is taken. A unique/set piece records its
      // named id the first time it is ever picked up (idempotent, no-op when CODEX.enabled=false).
      if(d.inst){ if(d.inst.uniq) recordCodex("uniq", d.inst.uniq); if(d.inst.set) recordCodex("set", d.inst.set); } }
    else if(d.kind==="rune"){ takeRune(d.rune); // CAS-1687: a rune enters the bag as {rune:type}
      recordCodex("rune", d.rune); } // CAS-1751: first pickup of a rune TYPE records it in the codex
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
          affix0:h.affixKills|0, // CAS-1586: baseline the lifetime affix-kill counter for this run's Esencia delta
          champElite0:h.champElites|0, // CAS-1590: baseline lifetime champion kills for this run's guaranteed-Esencia delta
          champ0:h.champKills|0, lvl0:h.lvl|0 };
  G.recap=null; }
// Build the FROZEN recap delta from current counters minus the run baseline. Time uses
// playT (active-play seconds) so menu/pause time never inflates it. Deltas clamp at 0
// (gold can dip if spent mid-run). Pure read — invents no economy.
function buildRecap(){ const h=G.hero, r=G.run; if(!h) return null; const b=r||{};
  return { time:Math.max(0,(h.playT||0)-(b.pT0||0)), kills:Math.max(0,(h.kills|0)-(b.kills0||0)),
    gold:Math.max(0,(h.gold|0)-(b.gold0||0)), elites:Math.max(0,(h.eliteKills|0)-(b.elite0||0)),
    affixKills:Math.max(0,(h.affixKills|0)-(b.affix0||0)), // CAS-1586: this run's affixed kills → extra Esencia
    champElites:Math.max(0,(h.champElites|0)-(b.champElite0||0)), // CAS-1590: this run's champion kills → GUARANTEED Esencia
    lvl:h.lvl|0, lvlUp:Math.max(0,(h.lvl|0)-(b.lvl0||0)) }; }

// ------------------------------ death ----------------------------------
function heroDie(){
  const h=G.hero; if(h.dead) return; G.recap=buildRecap(); h.dead=true; h.animState="dead"; h.animT=0; G.scene="dead"; audio.sfx.death();
  // CAS-1557: bank this run's Esencia into the account-wide meta store (marks it dirty for an
  // immediate flush) and stamp the amount + new bank total onto the frozen recap so the death
  // screen can show the "+X Esencia" payoff. Pure read of existing counters — no new economy.
  { const gain=essenceForRun(h, G.recap); if(gain>0){ ensureMeta().essence=(ensureMeta().essence|0)+gain; G.metaDirty=true; }
    if(G.recap){ G.recap.essence=gain; G.recap.essenceTotal=ensureMeta().essence|0; } }
  // CAS-1664: a death in Arena de Oleadas ENDS the gauntlet — bank the highest wave reached as the
  // new best (own store, additive) so the score survives. The death screen reads G.arena to show it.
  if(G.arenaMode) arenaOnDeath();
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
  // CAS-1557: re-apply the account-wide meta at this run-start seam. reconcileMeta is a no-op
  // unless a node was bought at the altar (then it bakes the delta into maxHp/dmg/gold/moveSpeed);
  // applyMetaReroll re-adds the reroll charges ON TOP of the rerollLeft:1 just reset above — the
  // CRÍTICO seam, since respawn wiped the meta reroll along with the per-run budget. HP fills below.
  reconcileMeta(h); applyMetaReroll(h); applyMetaStartBoons(h); // CAS-1565: Vanguardia start-boons re-granted after the death boon-wipe (per-run)
  h.dead=false; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.x=h.respawn.x; h.y=h.respawn.y;
  h.vx=h.vy=0; h.rolling=false; h.iframe=0.5; G.scene="play"; G.skull.level=0; G.skull.kills=0;
  G.arenaMode=false; // CAS-1664: leaving the death screen exits Arena de Oleadas → back to the normal world (no-op in a normal run)
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
  else if(p.to==="caldera"){ const pw=heroPower(h);  // CAS-1744: mid-endgame gate (abyss < caldera < cripta)
    if(pw<CALDERA_POWER_REQ){ toast(STR.calderaLocked(pw,CALDERA_POWER_REQ),3.4); audio.sfx.deny(); return false; } }
  h.x=p.dx; h.y=p.dy; h.vx=h.vy=0; h.rolling=false; h.rollT=0; h.iframe=0.6;
  audio.sfx.roll(); toast(p.to==="abyss"?STR.enteredAbyss:p.to==="frost"?STR.enteredFrost:p.to==="trial"?STR.enteredTrial:p.to==="caldera"?STR.enteredCaldera:STR.leftAbyss,3.0); return true;
}
export function interact(){
  // CAS-1681: a Santuario Maldito in range activates on the SAME interact key (opt-in). Checked first
  // so a shrine POI resolves before generic portals/NPCs; no-op unless events are on and one is near.
  if(ZONE_EVENTS.enabled){ const s=nearestShrine(); if(s){ activateShrine(s); return; } }
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
    n.castT=G.t;   // CAS-466: la Sanadora hace su animación de cast al curar
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
  if(inst.rune) return socketRune(i); // CAS-1687: a rune "equips" by engarzándose into an empty socket
  const slot=inst.slot; const old=h.equip[slot];
  h.equip[slot]=inst; h.bag[i]=old; audio.sfx.buy();
  // CAS-117: swapping out a +vida piece can lower the effective max below
  // current hp — clamp so the bar never reads over 100%.
  const mhp=heroMaxHp(h); if(h.hp>mhp) h.hp=mhp;
  return {slot, dmg:equippedDmg(h), def:equippedDef(h), hp:mhp};
}
// CAS-1687 — ENGARZAR: consume bag[i] (a rune) into the FIRST empty socket on equipped gear
// (weapon→body→shield order). Pure inventory+equip management through the sim authority (0 RNG):
// the rune's stat becomes live immediately via socketTotals(). No empty socket → deny, no change.
export function socketRune(i){ const h=G.hero; const inst=h.bag[i];
  const base={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)};
  if(!inst || !inst.rune || !RUNES[inst.rune]) return Object.assign({socketed:false},base);
  for(const slot of ["weapon","body","shield"]){ const g=h.equip[slot]; if(!g||!Array.isArray(g.sockets)) continue;
    for(let k=0;k<g.sockets.length;k++){ if(!g.sockets[k] || !g.sockets[k].type){
      g.sockets[k]={type:inst.rune}; h.bag.splice(i,1);
      G.invSel=Math.min((G.invSel|0), Math.max(0,h.bag.length-1)); audio.sfx.buy();
      const mhp=heroMaxHp(h); if(h.hp>mhp) h.hp=mhp;
      return {socketed:true, slot, type:g.sockets[k].type, dmg:equippedDmg(h), def:equippedDef(h), hp:mhp}; } } }
  audio.sfx.deny(); return Object.assign({socketed:false},base); // no empty socket anywhere
}
// CAS-1687 — DESENGARZAR: pop the LAST filled socket on `slot` back to the bag as a rune (if room).
// Bag full → deny, no change. The freed socket goes empty; the bonus drops off socketTotals live.
export function unsocketRune(slot){ const h=G.hero; const g=h.equip[slot];
  if(!g || !Array.isArray(g.sockets)) return {removed:false};
  if(h.bag.length>=BAG_CAP){ toast(STR.bagFull); audio.sfx.deny(); return {removed:false}; }
  for(let k=g.sockets.length-1;k>=0;k--){ if(g.sockets[k] && g.sockets[k].type){
    const type=g.sockets[k].type; g.sockets[k]={}; h.bag.push({rune:type}); audio.sfx.pickup();
    const mhp=heroMaxHp(h); if(h.hp>mhp) h.hp=mhp;
    return {removed:true, type, slot, dmg:equippedDmg(h), def:equippedDef(h), hp:mhp}; } }
  return {removed:false}; // no filled socket on this piece
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
export function doPotionHP(){ const h=G.hero; if(h.potHP>0&&h.hp<heroMaxHp(h)){ h.potHP--; const hh=Math.round(pactHeal(50)); h.hp=Math.min(heroMaxHp(h),h.hp+hh); audio.sfx.heal(); floater(h.x,h.y-30,"+"+hh,"#5fd66a"); } } // CAS-1763: Pacto Frágil cuts the potion heal (×1.0 at heat=0 ⇒ byte-identical)
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
  // CAS-1628 — mana potion PARITY: restore a fraction of MAX mana (exact mirror of healFrac)
  if(c.manaFrac){ const mmp=h.maxMp; const amt=Math.round(mmp*c.manaFrac); h.mp=Math.min(mmp,h.mp+amt); floater(h.x,h.y-30,"+"+amt,c.col); }
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
  // CAS-1814: ESQUIVA RODANTE — when DODGE.enabled the roll's iframe/cooldown/distance derive from the
  // reactive knob band (vs CFG.roll*); the existing bonuses (bb.iframeAdd + metaDashIframe + Estela
  // Ardiente) still SUM in unchanged. rollTime is held fixed (animation/fade timing byte-identical); the
  // knob distance is applied as a per-roll speed (h.rollSpd, transient run-state, NOT serialized). OFF ⇒
  // CFG.rollIFrame/rollCD/rollSpeed EXACT (h.rollSpd=CFG.rollSpeed ⇒ movement byte-identical). 0-RNG.
  const dg=DODGE.enabled;
  h.rolling=true; h.rollT=CFG.rollTime; h.iframe=(dg?DODGE.iframeMs/1000:CFG.rollIFrame)+((h.bb&&h.bb.iframeAdd)||0)+metaDashIframe(); h.rollCD=dg?DODGE.cooldownMs/1000:CFG.rollCD; h.rollSpd=dg?DODGE.distance/CFG.rollTime:CFG.rollSpeed; h.rollX=ax; h.rollY=ay; // CAS-1565: +Evasión meta i-frames (read-live)
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
  // CAS-1664: in Arena de Oleadas the wave controller OWNS the field — the free-play world systems
  // below (zone-curse offers, elite-ambush clock, natural spawners) are suppressed so nothing
  // pollutes the gauntlet. Each is guarded by !G.arenaMode; in a normal run arenaMode is false, so
  // every branch runs EXACTLY as before → byte-identical. The arena loop advances at the tail.
  // CAS-394: OPT-IN ZONE MODIFIER — the FIRST time the hero steps into a combat zone (HUNTS key)
  // whose hunt isn't already cleared this run, pause into the "curse" scene and offer one modifier
  // (accept/skip). Fires exactly once per zone per run (curseSeen), and only from free play so it
  // never stacks over another panel. Cleared zones + town/field are skipped (no reward to gate).
  if(!G.arenaMode && HUNTS[z] && (h.curseSeen||[]).indexOf(z)<0){ const CH=G.hunts&&G.hunts[z];
    if(!(CH&&CH.cleared)) offerCurse(z); }
  // CAS-342: the caves dragon is no longer a positional deep-walk spawn — it is now the caves
  // ZONE CAPSTONE (HUNTS.caves.boss), summoned deliberately by spawnChampion when the kill quota
  // is met. The old `z==="caves" && !G.bossSpawned … spawnBoss()` trigger is removed so the dragon
  // appears EXACTLY once, only as the earned end-of-zone climax (never a random high-HP ambush).
  if(!G.arenaMode) updateAmbush(dt, z, inDanger); // CAS-146: elite-ambush event clock (deterministic, in-zone only) — suppressed in arena (the wave loop owns spawns)
  // CAS-1681: ZONE EVENTS — seed 0-2 optional POIs the FIRST time the hero enters a combat zone this
  // run (mirrors curseSeen; eventRng-only → srand untouched), then tick telegraph + goblin timers.
  // Suppressed in arena (the wave loop owns the field) and a no-op unless ZONE_EVENTS.enabled.
  if(!G.arenaMode && ZONE_EVENTS.enabled){ if(inDanger) seedZoneEvents(z); tickZoneEvents(dt, z); }

  // timers
  h.atkCD=Math.max(0,h.atkCD-dt); h.rollCD=Math.max(0,h.rollCD-dt); h.iframe=Math.max(0,h.iframe-dt); h.hurtFlash=Math.max(0,h.hurtFlash-dt); h.atkAnim=Math.max(0,h.atkAnim-dt);
  h.hurtAnim=Math.max(0,(h.hurtAnim||0)-dt); h.specialAnim=Math.max(0,(h.specialAnim||0)-dt); // CAS-256 hit-react / skill-cast anim timers
  h._pdCD=Math.max(0,(h._pdCD||0)-dt); // perfect-dodge reward cooldown
  h.riposte=Math.max(0,(h.riposte||0)-dt); // CAS-210: the riposte counter window decays if unused
  // spell cooldowns + timed buffs (in-place; no per-frame allocation)
  for(let s=1;s<4;s++){ if(h.spellCD[s]>0) h.spellCD[s]=Math.max(0,h.spellCD[s]-dt); }
  if(h.abilCD) for(let s=0;s<h.abilCD.length;s++){ if(h.abilCD[s]>0) h.abilCD[s]=Math.max(0,h.abilCD[s]-dt); } // CAS-1570
  if(h.dmgBuffT>0){ h.dmgBuffT-=dt; if(h.dmgBuffT<=0){ h.dmgBonus-=h.dmgBuffAmt; h.dmgBuffAmt=0; } }
  // CAS-192: consumable timers — the "furia" atkspd buff winds down (the bonus stops
  // applying the moment the timer expires) and each per-consumable cooldown ticks.
  if(h.atkspdBuffT>0){ h.atkspdBuffT-=dt; if(h.atkspdBuffT<=0){ h.atkspdBuffT=0; h.atkspdBuffAmt=0; } }
  tickFrenzy(h,dt); // CAS-1773: window wind-down + gradual stack decay (arithmetic, no RNG, gated)
  tickParry(h,dt);  // CAS-1785: parry window + cooldown wind-down (arithmetic, no RNG, gated on PARRY.enabled)
  if(h.consumCD){ for(const k in h.consumCD){ if(h.consumCD[k]>0) h.consumCD[k]=Math.max(0,h.consumCD[k]-dt); } }
  if(h.defBuffT>0){ h.defBuffT-=dt; if(h.defBuffT<=0){ h.defBonus-=h.defBuffAmt; h.defBuffAmt=0; } }
  if(h.hotT>0){ h.hotT-=dt; h.hp=Math.min(heroMaxHp(h),h.hp+pactHeal(h.hotRate*dt)); if(h.hotT<=0) h.hotRate=0; } // CAS-1763: Pacto Frágil cuts the HoT tick (×1.0 at heat=0 ⇒ byte-identical)
  // CAS-119: passive talent regeneration (regen build) — a slow always-on heal that
  // makes survivability builds observably outlast a glass build between fights.
  if(h.tt&&h.tt.regen>0 && h.hp>0){ const mhp=heroMaxHp(h); if(h.hp<mhp) h.hp=Math.min(mhp,h.hp+pactHeal(h.tt.regen*dt)); } // CAS-1763: Pacto Frágil cuts passive regen (×1.0 at heat=0 ⇒ byte-identical)
  // CAS-118: the hero SUFFERS statuses too — slow/stun timers wind down and DoTs tick.
  if(h.slowT>0) h.slowT-=dt; if(h.stun>0) h.stun-=dt;
  if(h.dots) tickDots(h,dt,true);
  if(h.atkT>0){ h.atkT-=dt; if(h._atkHits) applyHeroMelee(); }
  // movement
  if(h.rolling){ h.rollT-=dt; const sp=h.rollSpd||CFG.rollSpeed; moveEnt(h,h.rollX*sp*dt,h.rollY*sp*dt,12); // CAS-1814: per-roll speed (DODGE distance); ||CFG.rollSpeed ⇒ OFF byte-identical
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
  // CAS-1664: advance the Arena de Oleadas wave loop (rest countdown / wave-clear → next wave).
  if(G.arenaMode) tickArena(dt);
  // spawners — suppressed in arena so only the wave roster is present (CAS-1664)
  if(!G.arenaMode) for(const sp of world.spawners){ sp.t-=dt; const count=G.enemies.filter(e=>e.tpl && sp.types.includes(e.type)&&!e.isBoss).length;
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
// CAS-1790: "pesado" = jefe/campeón/capstone/élite. heavyOnly v1 sólo afecta a estas unidades;
// los mobs básicos quedan EXACTOS (mismo windup, sin cue). Pura lectura de flags, 0 efectos.
function isHeavy(e){ return !!(e.isBoss||e.champion||e.capstone||e.elite); }
// CAS-1790 M1+M2: al ENTRAR a windup, un pesado reserva un piso de lead-time (timing, 0-RNG) y
// emite el cue procedural cosmético. Todo HARD-GATED tras TELEGRAPH.enabled ⇒ con el knob OFF esta
// función NO se llama (guarda en el call-site) y el sim queda byte-idéntico a HEAD. El cue usa sólo
// addFx (sin RNG de combate ni fxRng), así que el stream srand es idéntico ON vs OFF. NO toca daño,
// cooldowns ni IA de movimiento: sólo alarga la fase de aviso (e.st) y dibuja marcas.
function armTelegraph(e){
  // M1 — piso de lead-time para el impacto pesado (aritmética determinista, 0 draws).
  e.st = Math.max(e.st, TELEGRAPH.leadMs/1000);
  const life = e.st;
  // M2(a) — anillo único que se contrae sobre la unidad pesada durante el windup ("pesado incoming").
  addFx("telegraphmark", e.x, e.y, { life, r:(e.tpl.size||16)*1.7+6, heavy:1 });
  // M2(b) — marca de suelo anticipatoria SÓLO para las ráfagas radiales que hoy estallan sin aviso
  // (boss ground-wave en strikes alternos, capstone enraged slam, champion special slam). El radio
  // dimensiona "sal del anillo / rueda". La ráfaga resuelve EXACTAMENTE igual (mismos proyectiles).
  const burstR =
      (e.isBoss && ((e.phase+1)%2===0)) ? 118 :               // boss alt-strike ground-wave
      (e.capstone && e.enraged && e.slam) ? 108 :             // capstone enraged slam
      (e.specialNow && e.special && e.special.slam) ? (e.special.slam.radius||96) : 0; // champion / CAS-1820 brute-élite special slam (radius param)
  if(burstR>0) addFx("telegraphmark", e.x, e.y, { life, r:burstR, ground:1, oy:(e.tpl.size||16)*0.4 });
  // CAS-1820 A1 — directional LUNGE lane tell: a procedural wedge (addFx only, 0 RNG) drawn along the facing
  // FROZEN at windup entry, so a sidestep OUT of the lane reads. Only for a lunge-special windup (⇒ present
  // only when ENEMY_ABILITIES assigned the lunge; with the knob OFF this branch is never reached).
  if(e.specialNow && e.special && e.special.lunge){
    addFx("telegraphline", e.x, e.y, { life, ang:e.facing, len:(e.special.lunge.distance||140), w:(e.tpl.size||16)*1.1+8 });
  }
}
// CAS-1790 harness helper: clean arena + one enemy parked INSIDE its own range so the REAL AI commits
// chase→windup on the next tick(s). `heavy` = flags to graft (elite/isBoss/…). Drives updateEnemies (the
// real wired path) so the M1 floor + M2 cue fire exactly as in-game. Returns the enemy at windup entry.
function teleArmWindup(type, heavy){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
  const h=G.hero; if(!h) return null; h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=1e6; h.hp=1e6; h.cls="warrior";
  const e=spawnEnemy(type||"orc", h.x+20, h.y); if(!e) return null;
  e.maxHp=e.hp=1e9; if(heavy) Object.assign(e, heavy); e.state="chase";
  const R=Math.max(8,(e.tpl.range||40)-4);
  let steps=0; while(e.state!=="windup" && steps++<40){ e.x=h.x+R; e.y=h.y; e.knockX=0; e.knockY=0; updateEnemies(1/60); if(e.hp<=0) break; }
  return e;
}
function updateEnemies(dt){ const h=G.hero;
  for(const e of G.enemies){
    e.hurtFlash=Math.max(0,e.hurtFlash-dt);
    if(e.hurtT>0) e.hurtT=Math.max(0,e.hurtT-dt); // CAS-317: one-shot hurt-flinch window (rich-anim boss)
    if(e.slowT>0) e.slowT-=dt;
    // CAS-1826: POSTURA timers — the stagger window (staggerT, drives bonus-dmg + VFX) and the re-stagger
    // cooldown (staggerCD) tick every frame; the AI-freeze itself is the EXISTING e.stun gate below (0 new IA).
    // Postura DECAYS back down after decayDelay of not being hit, so a partial break doesn't linger forever.
    // Gated + guarded: disabled or a 0-poise enemy does nothing. No RNG.
    if(POISE.enabled){
      if(e.staggerT>0) e.staggerT-=dt;
      if(e.staggerCD>0) e.staggerCD-=dt;
      if(e.poise>0 && e.staggerT<=0){ e._poiseDecayT=(e._poiseDecayT||0)+dt;
        if(e._poiseDecayT>POISE.decayDelay) e.poise=Math.max(0,e.poise-POISE.decayRate*dt); }
    }
    // CAS-1586 AURA GÉLIDA: a LIVE frost-affix mob radiates a slow field. While the hero stands
    // within auraR it is slowed to auraSlow — refreshed every tick through the SAME CAS-118
    // h.slow/h.slowT channel (HUD tint + movespd drag already wired at :2130), so stepping out of
    // range lets the short (0.2s) timer expire on its own. Gated hard on e.affix==="frost" and the
    // mob being alive → 0 frost mobs = 0 work = byte-identical sim. Radius/slow read from the data.
    if(e.hp>0 && !e.dead && h && !h.dead && mobAffixes(e).includes("frost")){ const af=MOB_AFFIX.frost; // CAS-1590: a champion carrying Aura Gélida radiates the same slow field
      if(Math.hypot(h.x-e.x,h.y-e.y)<=af.auraR){ h.slow=Math.min(h.slow||1, af.auraSlow); h.slowT=Math.max(h.slowT||0, 0.2); } }
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
    // CAS-1681: a Duende del Tesoro flees the hero instead of running the normal AI (never chases/
    // attacks). Only ever true for an event goblin, which exists solely when ZONE_EVENTS.enabled → a
    // normal run never evaluates true here and stays byte-identical.
    if(e.eventGoblin){ tickGoblinFlee(e, dt, h); continue; }
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
            e.specialNow = !!(e.special && (e.special.slam || e.special.lunge) && (e.atkCount % e.special.every === 0)); // CAS-1820: lunge shares the same cadence choke as slam
            // CAS-321 warlock hybrid: pick CLAW vs CAST by distance the instant the attack
            // commits — outside `meleeR` it zaps (castNow → "cast" strip + bolt), inside it claws.
            e.castNow = (e.tpl.arch==="warlock") && (d > (e.tpl.meleeR||50));
            // CAS-210: a punisher arms its COMBO chain at the START of a fresh sequence — the
            // follow-up swings re-enter windup directly from strike (below), never via chase.
            if(e.tpl.arch==="punisher") e.comboLeft=(e.tpl.combo||2)-1;
            e.state="windup"; e.st=e.specialNow ? (e.special.windup || e.tpl.windup*1.6) : e.tpl.windup; e.hitDone=false;
            // CAS-1790: piso de lead-time + cue de aviso para PESADOS. HARD-GATED (OFF ⇒ no-op,
            // sim byte-idéntico). Va DESPUÉS de fijar e.st para poder pisarlo; antes del sfx.
            if(TELEGRAPH.enabled && (!TELEGRAPH.heavyOnly || isHeavy(e))) armTelegraph(e);
            if(e.specialNow){ audio.sfx.boss(); }
          }
        }
        else { moveEnt(e,Math.cos(e.facing)*espd*dt,Math.sin(e.facing)*espd*dt,e.tpl.size*0.6); }
      }
    } else if(e.state==="windup"){
      // CAS-126 charger COMMITS its facing at windup start — it does NOT track, so the
      // charge lane is fixed and the player can sidestep it (the whole point of the tell).
      e.st-=dt; if(e.tpl.arch!=="charger" && !(e.specialNow && e.special && e.special.lunge)) e.facing=Math.atan2(h.y-e.y,h.x-e.x); // CAS-1820: a lunge special LOCKS its facing at windup (like a charger) ⇒ sidestep the lane
      // CAS-210: FOUNTAINS-style windup charge tell — pulsing ring that grows from orange→red.
      // fxRng-based so purely cosmetic (no sim determinism impact).
      e._windupT=(e._windupT||0)+dt; if(e._windupT>=0.11){ e._windupT=0;
        addFx("windupring",e.x,e.y,{ang:e.facing,life:0.22,r:12+frr(0,6)}); }
      if(e.st<=0){ e.state="strike";
        // strike-window length per archetype: rusher lunge + charger charge need a longer
        // window for the dash to read/travel; everyone else lands on the "now!" instant.
        e.st=(e.specialNow)?((e.special&&e.special.lunge)?0.2:0.12):(e.tpl.arch==="charger")?0.36:(e.tpl.arch==="rusher")?0.2:0.12; // CAS-1820: lunge special needs the longer dash window to travel/read
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
      // CAS-1820 A1 EMBESTIDA TELEGRAFIADA: a special directional LUNGE — dash straight along the facing
      // LOCKED at windup (the heavy ring + the lane wedge were the tell). Contact ⇒ damageHero(dmg,ang,infl,e)
      // with src=e ⇒ PARABLE (KeyH) and EVADIBLE by dash i-frames; sidestepping the lane avoids it. Mirrors
      // the rusher lunge geometry but reads the special's own distance/dmg. 0 RNG (moveEnt + damageHero only).
      if(e.specialNow && e.special && e.special.lunge){ const L=e.special.lunge;
        const lspd=(L.distance||140)/0.2; moveEnt(e,Math.cos(e.facing)*lspd*dt,Math.sin(e.facing)*lspd*dt,e.tpl.size*0.6);
        if(!e.hitDone && d<=e.tpl.size+e.tpl.range*0.5){ e.hitDone=true;
          const a=Math.atan2(h.y-e.y,h.x-e.x); damageHero(L.dmg,a,L.infl||e.tpl.infl,e); // src=e ⇒ parable + evadible
          addFx("spark",e.x+Math.cos(a)*14,e.y+Math.sin(a)*14); }
      }
      // CAS-115 rusher LUNGE: dash forward through the whole strike window (the telegraph
      // was the windup), landing a single contact hit when it reaches the hero. Closing
      // the gap IS the attack — sidestepping the lunge line avoids it.
      else if(e.tpl.arch==="rusher" && !e.specialNow){
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
  if(A.active && !G.enemies.some(e=>e.elite && !e.eventGuard && e.hp>0)){ A.active=false; A.t=AMBUSH.cooldown; } // CAS-1681: a Cofre-Custodiado guardian (also e.elite) must NOT hold the ambush lock
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
// CAS-1820 — mount ONE telegraphed special on a freshly-promoted ÉLITE, chosen by its archetype family,
// reusing the live special.slam / windup→strike machinery. The ONLY new-behaviour site: called from the
// spawn/promotion path wrapped in `if(ENEMY_ABILITIES.enabled)`, so with the knob OFF nothing is assigned
// ⇒ the strike never reaches the new lunge/slam branches ⇒ sim byte-identical to HEAD. Never stomps a
// pre-existing special (champion/boss slams stay untouched). Assignment is pure data (0 RNG); the specials
// fire on a deterministic cadence (e.atkCount % every) ⇒ 0 srand draws. `e.special` is transient entity
// run-state (not serialized) ⇒ save byte-identical. Reversible in one line (the knob).
function armAbility(e){
  if(!e || e.special || e.isBoss || e.champion) return;       // don't override an existing special
  const arch=e.tpl && e.tpl.arch;
  if(arch==="rusher"){                                        // A1 — directional lunge on a rusher-family élite
    const L=ENEMY_ABILITIES.lunge;
    e.special={ every:L.every, windup:L.windup,
      lunge:{ distance:L.distance, dmg:Math.round((e.tpl.dmg||0)*L.dmgMul), windup:L.windup, infl:e.tpl.infl||null } };
    e.atkCount=0; e.specialNow=false;
  } else if(arch==="brute"){                                  // A2 — radial ground-slam on a brute-family élite
    const S=ENEMY_ABILITIES.slam;
    e.special={ every:S.every, windup:S.windup,
      slam:{ count:S.count, spd:S.spd, dmg:Math.round((e.tpl.dmg||0)*S.dmgMul), life:S.life, radius:S.radius } };
    e.atkCount=0; e.specialNow=false;
  }
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
    if(ENEMY_ABILITIES.enabled) armAbility(e); // CAS-1820: rusher-family élite → A1 lunge, brute-family → A2 slam (HARD-GATED)
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
// CAS-1590 — Élite Campeón kill payoff: a GUARANTEED superior drop (forced epic+ from the zone's top
// tier window) + a uniqueChance roll for a legendary, the banked champion-Esencia counter, and the
// elite-class Mastery tick. Reuses the existing loot path (no new stat rolls). Only ever called from
// killEnemy on a champion (CHAMPION_RATE>0 path), so at rate=0 it never runs → RNG/loot byte-identical.
function onChampElite(e, zone){
  noteEliteKill();          // CAS-149: a champion is an elite-class kill → feeds Elite Mastery
  grantMats(2);             // CAS-237: forge material toward the next upgrade
  if(G.hero) G.hero.champElites=(G.hero.champElites|0)+1; // → GUARANTEED Esencia at the run recap (essenceForRun)
  const win=(ZONE_LOOT[zone]||ZONE_LOOT.field).tier;
  dropGear(e.x+frr(-10,10),e.y, rollGearInst(srand,win[1],win[1],"epic"));            // guaranteed SUPERIOR: epic (the top rarity) from the zone's TOP tier window
  if(srand()<CHAMPION.uniqueChance) dropGear(e.x+frr(-10,10),e.y, rollGearInst(srand,win[1],win[1],"epic")); // + a probabilistic SECOND superior piece (the "botín único" bonus)
  G.drops.push({x:e.x+16,y:e.y,kind:"gold",amt:ri(e.tpl.gold[0],e.tpl.gold[1])});
  audio.sfx.boss(); shakeAdd(9); toast(STR.champDown||"¡Campeón derrotado!",2.8);
  for(let i=0,n=rmCount(12);i<n;i++) addFx("flame",e.x+frr(-30,30),e.y+frr(-30,30));
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

// ==================== CAS-1681: EVENTOS DE ZONA (optional POIs) ====================
// 0–2 telegraphed, opt-in points of interest seeded PER combat zone that REUSE existing mobs, elite
// stat blocks, loot tables and the Esencia economy — ZERO new art. Three hard-coded kinds (santuario /
// cofre custodiado / duende del tesoro). EVERY seeding draw comes from the DEDICATED `eventRng` stream,
// never the authoritative srand, and the whole controller is HARD-GATED behind ZONE_EVENTS.enabled →
// with events off (or density 0) NO event code runs and the sim/RNG is byte-identical (AC1 [AC-RNG-STRONG]).
// Ignoring a POI never penalises the player and never blocks zone progress (AC3): they are pure bonus.
let eventPoiSeq = 0;
function resetZoneEvents(){ const Z=G.zoneEvents; if(!Z) return; Z.seeded.length=0; Z.pois.length=0; Z.lastPayoff=null; eventPoiSeq=0; }
// The zone's eligible mob pool — the SAME spawner roster the natural world + ambush use (art reuse).
function eventZonePool(zone){ const sp=world.spawners&&world.spawners.find(s=>s.zone===zone); return (sp&&sp.types&&sp.types.length)?sp.types:["wolf"]; }
// A clear open tile a readable ring-distance from the hero, inside the zone bounds — mirrors
// ambushSpawnPos but draws its angle/distance from eventRng ONLY (never srand). Falls back to a
// fixed offset if the zone is crowded so a POI always lands.
function eventSpawnPos(zone, rMin, rMax){ const r=world[zone]; const h=G.hero;
  for(let i=0;i<24;i++){ const a=eventRng.rr(0,6.28), dpx=eventRng.rr(rMin,rMax);
    const x=h.x+Math.cos(a)*dpx, y=h.y+Math.sin(a)*dpx;
    const tx=Math.floor(x/TS), ty=Math.floor(y/TS);
    if(r && (tx<r.x+1||tx>r.x+r.w-2||ty<r.y+1||ty>r.y+r.h-2)) continue;
    if(!solidBlocked(x,y,16)) return {x,y}; }
  return {x:h.x+rMin, y:h.y};
}
// Seed a zone ONCE per run (mirrors curseSeen). Draws the 0..perZoneMax count and each POI's type +
// position from eventRng, APPENDED after every existing world/spawn draw. Records the zone as seeded
// even at count 0 so it never re-rolls. No-op (and zero draws) unless events are enabled + density>0.
function seedZoneEvents(zone){ const Z=G.zoneEvents;
  if(!ZONE_EVENTS.enabled || !(ZONE_EVENTS.density>0)) return;
  if(!zone || Z.seeded.indexOf(zone)>=0) return;
  Z.seeded.push(zone);
  const slotP=Math.min(1, ZONE_EVENTS.slotChance*ZONE_EVENTS.density);
  for(let i=0;i<ZONE_EVENTS.perZoneMax;i++){
    if(eventRng.srand()>=slotP) continue;                 // this candidate slot stays empty (still one eventRng draw)
    const type=ZONE_EVENTS.types[eventRng.ri(0,ZONE_EVENTS.types.length-1)];
    const p=eventSpawnPos(zone, ZONE_EVENTS.ring[0], ZONE_EVENTS.ring[1]);
    spawnZonePOI(zone, type, p.x, p.y);
  }
}
// Build one POI + (for chest/goblin) its bound enemy. All enemy stats come from DIRECT multipliers on a
// zone-scaled clone (the AMBUSH.elite pattern) — NO srand, NO affix roll — so seeding never perturbs the
// gameplay stream. Returns the POI (also used by the dev force-spawn hook for deterministic tests).
function spawnZonePOI(zone, type, x, y){ const Z=G.zoneEvents;
  const poi={ id:++eventPoiSeq, type, zone, x, y, state:"active", seen:false };
  if(type==="chest"){
    const C=ZONE_EVENTS.chest; const pool=eventZonePool(zone);
    const base=pickEliteBase(pool.filter(t=>ETPL[t])); const gp=eventSpawnPos(zone, 24, 54);
    const e=applyZoneScale(spawnEnemy(base, gp.x||x+28, gp.y||y), zone);
    if(e){ const b=e.tpl;
      e.tpl=Object.assign({},b,{ hp:Math.round(b.hp*C.guardHpMul), dmg:Math.round((b.dmg||0)*C.guardDmgMul),
        size:Math.round(b.size*C.guardSizeMul), xp:Math.round((b.xp||0)*C.guardXpMul) });
      e.hp=e.maxHp=e.tpl.hp; e.elite=true; e.eventGuard=true; e.eventPoiRef=poi; e.state="chase"; e.zone=zone;
      poi.guard=e; addFx("poof",e.x,e.y);
      for(let i=0,n=rmCount(8);i<n;i++) addFx("flame",e.x+frr(-22,22),e.y+frr(-22,22)); }
  } else if(type==="goblin"){
    const G0=ZONE_EVENTS.goblin; const pool=eventZonePool(zone);
    const base=pool[eventRng.ri(0,pool.length-1)];
    const e=spawnEnemy(base, x, y);
    if(e){ const b=e.tpl;
      // fleeing, HARMLESS courier: dmg 0 (never attacks), fast, low HP. Movement is driven by the
      // eventGoblin flee branch in updateEnemies, NOT the normal AI, so it always runs from the hero.
      e.tpl=Object.assign({},b,{ dmg:0, spd:Math.round((b.spd||70)*G0.spdMul), hp:G0.hp, aggro:0 });
      e.hp=e.maxHp=e.tpl.hp; e.eventGoblin=true; e.eventPoiRef=poi; e.state="flee"; e.zone=zone;
      poi.goblin=e; poi.escapeT=G0.escapeSeconds; addFx("poof",e.x,e.y); }
  }
  Z.pois.push(poi); return poi;
}
// Flat, arithmetic Esencia payoff (0 RNG) → banked to the meta tree like the arena payoffs, plus a
// durable per-run completion counter on the hero (additive save state). Records lastPayoff for QA.
function grantEventEssence(type, n){ n=Math.max(0,n|0);
  if(n>0){ ensureMeta().essence=(ensureMeta().essence|0)+n; G.metaDirty=true; }
  const h=G.hero; if(h) h.zoneEventsDone=(h.zoneEventsDone|0)+1;
  G.zoneEvents.lastPayoff={ type, essence:n, done:(h&&h.zoneEventsDone)|0 };
}
// Santuario Maldito — activarlo cura + otorga un buff temporal de daño (reusa el sink h.dmgBuff*),
// a cambio de invocar UNA horda extra de mobs de la zona (tipos/posiciones desde eventRng → el srand
// de spawn natural NO se toca). Pure arithmetic on the hero; the horde spawns draw ONLY eventRng.
function activateShrine(poi){ if(!poi||poi.type!=="shrine"||poi.state!=="active") return false;
  const S=ZONE_EVENTS.shrine, h=G.hero; if(!h||h.dead) return false;
  poi.state="done";
  const mhp=heroMaxHp(h); const heal=Math.round(mhp*S.healFrac); h.hp=Math.min(mhp, h.hp+heal);
  if(heal>0) floater(h.x,h.y-30,"+"+heal,"#7dffa0",{small:true});
  // temp damage buff on the existing dmgBuff sink (decays in update)
  h.dmgBonus=(h.dmgBonus||0)+S.dmgBuff; h.dmgBuffAmt=(h.dmgBuffAmt||0)+S.dmgBuff; h.dmgBuffT=Math.max(h.dmgBuffT||0, S.buffDur);
  // summon the horde: zone mobs at ring positions, ALL from eventRng (never srand)
  const pool=eventZonePool(poi.zone); const n=S.hordeMin + eventRng.ri(0, Math.max(0,S.hordeMax-S.hordeMin));
  for(let i=0;i<n;i++){ const t=pool[eventRng.ri(0,pool.length-1)]; const p=eventSpawnPos(poi.zone, 90, 170);
    const add=applyZoneScale(spawnEnemy(t,p.x,p.y), poi.zone);
    if(add){ add.state="chase"; add.fromEvent=true; addFx("poof",p.x,p.y); } }
  grantEventEssence("shrine", 0);        // the shrine pays in survival value (heal+buff), not Esencia
  addFx("buffaura",h.x,h.y,{col:"#c8a0ff",life:0.6}); addFx("healburst",h.x,h.y,{col:"#7dffa0",life:0.5});
  audio.sfx.boss(); shakeAdd(8); toast("¡Santuario Maldito! Bendición a cambio de una horda", 3.0);
  return true;
}
// Cofre Custodiado — the guardian died: drop GUARANTEED loot at the chest, drawn from eventRng.srand
// (never the gameplay srand → chest loot never perturbs the shared stream). Called from killEnemy's
// dedicated eventGuard branch (which also skips the trash gold/potion srand draws).
function openGuardedChest(poi){ if(!poi||poi.type!=="chest"||poi.state!=="active") return;
  const C=ZONE_EVENTS.chest; poi.state="done";
  const win=C.lootTier, floor=C.lootMinR;
  dropGear(poi.x, poi.y, rollGearInst(eventRng.srand, win[0], win[1], floor));       // guaranteed piece — eventRng ONLY
  for(let i=0;i<(C.bonusDrops|0);i++) dropGear(poi.x+(i%2?18:-18), poi.y+18+i*6, rollGearInst(eventRng.srand, win[0], win[1], floor));
  G.drops.push({x:poi.x+16,y:poi.y,kind:"gold",amt:C.goldBonus|0});
  grantEventEssence("chest", 0);
  addFx("holynova",poi.x,poi.y,{r:80,life:0.5}); audio.sfx.boss(); shakeAdd(9);
  toast("¡Cofre Custodiado abierto! Botín garantizado", 3.0);
}
// Duende del Tesoro payoff — flat Esencia bounty (0 RNG). Does NOT remove the goblin (the caller owns
// removal): catchGoblin (reach path) splices it; killEnemy (damage path) splices via its own tail.
function goblinPayoff(poi){ if(!poi||poi.type!=="goblin"||poi.state!=="active") return 0;
  poi.state="done"; const ess=ZONE_EVENTS.goblin.essence|0; grantEventEssence("goblin", ess);
  const g=poi.goblin; if(g) floater(g.x,g.y-26,"+"+ess+" Esencia","#c8ff9a",{pop:1.4});
  audio.sfx.buy&&audio.sfx.buy(); toast("¡Duende del Tesoro atrapado! +"+ess+" Esencia", 2.8); return ess;
}
// Reached (proximity) before it escaped: pay out AND remove the courier from the field.
function catchGoblin(poi){ if(!poi||poi.state!=="active") return; const g=poi.goblin; goblinPayoff(poi);
  if(g){ addFx("poof",g.x,g.y); const ix=G.enemies.indexOf(g); if(ix>=0) G.enemies.splice(ix,1); g.dead=true; }
  poi.goblin=null;
}
// The goblin escaped (timer elapsed): remove it, mark the POI escaped. NO penalty (AC3).
function goblinEscape(poi){ if(!poi||poi.state!=="active") return; poi.state="escaped"; const g=poi.goblin;
  if(g){ addFx("poof",g.x,g.y); const ix=G.enemies.indexOf(g); if(ix>=0) G.enemies.splice(ix,1); g.dead=true; }
  poi.goblin=null; toast("El Duende del Tesoro escapó", 2.2);
}
// Per-frame event tick: telegraph POIs entering range, run the goblin escape timer + catch check.
// Runs ONLY in free play with events enabled and at least one live POI → zero cost otherwise.
function tickZoneEvents(dt, zone){ const Z=G.zoneEvents; if(!ZONE_EVENTS.enabled || !Z.pois.length) return; const h=G.hero; if(!h||h.dead) return;
  for(const poi of Z.pois){
    if(poi.state!=="active") continue;
    const d=Math.hypot(h.x-poi.x, h.y-poi.y);
    if(!poi.seen && d<=ZONE_EVENTS.telegraphR){ poi.seen=true; toast(EVENT_TELEGRAPH[poi.type]||"Evento de zona cercano", 2.6); audio.sfx.click&&audio.sfx.click(); }
    if(poi.type==="goblin"){
      poi.escapeT-=dt;
      const g=poi.goblin; if(g && !g.dead){ const dg=Math.hypot(h.x-g.x, h.y-g.y);
        poi.x=g.x; poi.y=g.y;                                       // marker rides the fleeing goblin
        if(dg<=ZONE_EVENTS.reachR){ catchGoblin(poi); continue; } }
      if(poi.escapeT<=0){ goblinEscape(poi); }
    }
  }
}
// Drive the fleeing goblin: sprint DIRECTLY away from the hero (deterministic; a touch of eventRng
// jitter keeps it from pinning on a wall). Called from updateEnemies in place of the normal AI, so the
// courier never chases or attacks. Only ever reached for an eventGoblin (which exists only when enabled).
function tickGoblinFlee(e, dt, h){ const spd=e.tpl.spd||120;
  let ax=e.x-h.x, ay=e.y-h.y; const n=norm(ax,ay); ax=n[0]; ay=n[1];
  ax+=eventRng.rr(-0.3,0.3); ay+=eventRng.rr(-0.3,0.3); const n2=norm(ax,ay); ax=n2[0]; ay=n2[1];
  e.facing=Math.atan2(ay,ax); e.animState="walk"; e.animT=(e.animT||0)+dt;
  const step=spd*dt; const px=e.x, py=e.y; moveEnt(e, ax*step, ay*step, e.tpl.size*0.6);
  if(Math.abs(e.x-px)<0.1 && Math.abs(e.y-py)<0.1) moveEnt(e, -ay*step, ax*step, e.tpl.size*0.6); // blocked → slide perpendicular
}
const EVENT_TELEGRAPH={ shrine:"Un Santuario Maldito emana poder cerca", chest:"Un Cofre Custodiado aguarda cerca", goblin:"¡Un Duende del Tesoro apareció!" };
// The nearest ACTIVE shrine POI within reach of the hero, or null — drives the interact-key activation.
function nearestShrine(){ const Z=G.zoneEvents, h=G.hero; if(!ZONE_EVENTS.enabled||!Z.pois.length||!h) return null;
  let best=null, bd=ZONE_EVENTS.reachR*ZONE_EVENTS.reachR;
  for(const poi of Z.pois){ if(poi.type!=="shrine"||poi.state!=="active") continue;
    const dx=h.x-poi.x, dy=h.y-poi.y, d2=dx*dx+dy*dy; if(d2<=bd){ bd=d2; best=poi; } }
  return best;
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
  // CAS-1785: PARADA CON TEMPO. A live parry window (armed by tryParry) that catches a CONTACT
  // (melee) strike negates it entirely and fires a short counter. `src` is present ONLY for contact
  // hits — projectiles pass null (see thorns/reflect below) — so the parry is melee-only WITHOUT any
  // extra logic, matching "golpe cuerpo-a-cuerpo". Gated + timing-pure: consumes NO srand (the counter
  // routes through hitEnemy, which rolls crit only if the build has crit — same as any hero hit).
  if(PARRY.enabled && src && src.hp>0 && !src.dead && h.parryT>0){
    h.parryT=0;                                    // consume the window
    h.iframe=Math.max(h.iframe,0.18);              // brief reward i-frame (0 status: infl ignored)
    const ra=Math.atan2(src.y-h.y,src.x-h.x);
    hitEnemy(src, PARRY.counterDmg, ra, {noPoise:true}); // counter — crit/procs/kill route normally; noPoise so the parry pulse (below) is the SOLE postura source (no double-build)
    src.vx=(src.vx||0)+Math.cos(ra)*PARRY.knockback; src.vy=(src.vy||0)+Math.sin(ra)*PARRY.knockback;
    h._parryRiposte=1;                             // arm the 1-hit riposte buff (consumed by next hitEnemy)
    // CAS-1826: a successful parry PULSES the parried tier enemy's postura (direct read→punish synergy with the
    // parry, CAS-1785). Deterministic add, 0 srand; guarded so basics/disabled do nothing and it can't stack past max.
    if(POISE.enabled && src.staggerT<=0 && src.staggerCD<=0){ const pm=(src.poiseMax=poiseCeil(src));
      if(pm>0){ src.poise=Math.min(pm,(src.poise||0)+POISE.gain.parry); src._poiseDecayT=0; } }
    addFx("dodgering",h.x,h.y,{life:0.34}); addFx("spark",src.x,src.y);
    floater(h.x,h.y-38,STR.parry||"¡Parada!","#ffe27a"); shakeAdd(7); freeze(6); audio.sfx.roll();
    return false;                                  // hit COMPLETELY negated
  }
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
  // CAS-1654: Vigía set (reflectPct% of damage TAKEN at 3pz) reflects back to the melee
  // attacker exactly like the thorns boon — read-live off setTotals, routed through hitEnemy
  // so it crits/procs/kills normally. Dodged/i-framed hit returned above → no reflect.
  { const rp=(src && src.hp>0 && !src.dead)?setTotals(h).reflectPct:0;
    if(rp>0){ const rd=Math.max(1,real*rp/100); const ra=Math.atan2(src.y-h.y,src.x-h.x);
      addFx("spark",src.x,src.y); hitEnemy(src,rd,ra); } }
  // CAS-247 VAMPIRIC affix: when an affixed elite LANDS a hit, it leeches a fixed fraction of
  // its OWN maxHp — heals only on a connect (a dodged/i-framed hit returned above, so reading
  // the tell denies the lifesteal too). A red tick reads "it fed". Deterministic (no RNG).
  if(src && src.hp>0 && !src.dead){ for(const id of mobAffixes(src)){ const af=MOB_AFFIX[id]; // CAS-1590: a champion's Vampírico affix leeches like any vampiric mob
    if(af&&af.lifesteal){ const heal=Math.max(1,Math.round(src.maxHp*af.lifesteal));
      if(src.hp<src.maxHp){ src.hp=Math.min(src.maxHp, src.hp+heal); src.hurtFlash=0.08;
        floater(src.x,src.y-src.tpl.size,"+"+heal,af.col); addFx("spark",src.x,src.y); } break; } } }
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
  // CAS-1702: read-only Map-Editor probe for the QA gate (b5c10283). Proves the world was built
  // from an authored MapDoc (?map=), reports its name/dims, the zone slots present with their rects,
  // and the live zone under the hero — so QA can assert an EDITED zone actually loads + plays. Pure
  // read (no sim mutation, no RNG). Absent/null fields when the default (procedural/Tiled) world runs.
  mapInfo(){ const slots=["town","forest","caves","arena","ruins","abyss","frost","trial","swamp","caldera"];  // CAS-1784: caldera present only when ZONE5 ON
    const zones={}; for(const s of slots){ const r=world[s]; if(r && r.w>0) zones[s]={x:r.x,y:r.y,w:r.w,h:r.h,name:r.name||""}; }
    return { fromMapDoc:!!world.fromMapDoc, name:world.mapName||null, w:MAP_W, h:MAP_H,
      zones, spawners:world.spawners.map(s=>({zone:s.zone,types:s.types.slice()})),
      heroZone: G.hero?zoneOf(world,G.hero.x,G.hero.y):null,
      tcx:world.tcx, tcy:world.tcy }; },
  // CAS-1729: read-only snapshot of custom (map-editor) deco props, exposing the
  // sliced-cell sub-rect (sx,sy,sw,sh) when present. Lets QA prove a sliced tileset
  // cell — not the whole sheet — reached world.deco in vivo. Pure read, no mutation.
  customDeco(){ return world.deco.filter(d=>d.kind==="custom").map(d=>({ x:d.x, y:d.y, asset:d.asset,
    w:d.w, h:d.h, sx:d.sx, sy:d.sy, sw:d.sw, sh:d.sh, sliced:d.sw!=null })); },
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
  // CAS-1565: dev-only Esencia grant so the live QA harness can bankroll the altar (Tier-2 +
  // Ascensión need ~thousands of Esencia to max) without grinding deaths. Additive, dev-only.
  metaGrant(n){ ensureMeta().essence=Math.max(0,(ensureMeta().essence|0)+(n|0)); G.metaDirty=true; return metaSnap(); },
  // CAS-1649: legacy-node QA hooks (curated bridge). metaLegacy = full codex w/ owned counts;
  // legacyPool = eligible choices for the current ascension; legacyChoose = grant a legacy.
  metaLegacy(){ return metaSnap().legacy; },
  legacyPool(){ return metaSnap().legacyChoices; },
  legacyChoose(k){ return chooseLegacy(k); },
  // CAS-1574: QA hook — the bought rank of an ability + its next cost + the ABILITY_MAP entry with
  // the rank scaling applied (lvl 0 → identical to base). Lets QA verify the in-run effect without
  // re-deriving the formula. Pair with __dev.metaGrant + buyMetaNode("rank_<id>") to fund/buy.
  abilityRank(id){ const rk=ABILITY_RANK_MAP[id]; if(!rk) return null; const lvl=metaLvl(rk.key);
    return { id, lvl, cap:rk.cap, cost:metaNodeCost(rk.key), ranked:rk.apply(ABILITY_MAP[id], lvl) }; },
  // CAS-1580: QA hooks — the filtered draft pool (ids) + the unlock-row state. Pair with __dev.metaGrant
  // + buyMetaNode("unlock_<id>") to fund/unlock, then re-read draftPool() to confirm the ability appears.
  draftPool(){ return draftPool().map(a=>a.id); },
  abilityUnlocks(){ const m=ensureMeta(); return ABILITY_UNLOCKS.map(r=>{ const lvl=metaLvl(r.key), cost=metaNodeCost(r.key);
    return { id:r.abil, key:r.key, locked:lvl<=0, lvl, cap:r.cap, cost, affordable: cost!=null && (m.essence|0)>=cost }; }); },
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
  // --- CAS-1590 ÉLITE CAMPEÓN harness hooks (tools/cas1590-champion-live.mjs) ---
  // Static champion table + promotion rate straight off the data (no sim step): asserts the config
  // shape (2+-affix mini-boss, guaranteed Esencia, tankier multipliers) without touching RNG.
  championMeta(){ return { rate:CHAMPION_RATE, liveRate:champRate, affixRate:MOB_AFFIX_RATE, def:Object.assign({},CHAMPION) }; },
  // RNG-neutrality seam: force the live champion rate (0 → feature OFF, no srand drawn in maybeChampion).
  // Pass null to restore the shipped CHAMPION_RATE. Used by QA to prove rate=0 ⇒ byte-identical affix stream.
  setChampRate(r){ champRate=(r==null)?CHAMPION_RATE:Math.max(0,+r||0); return champRate; },
  // Promotion-rate probe: spawn N eligible mobs through the REAL maybeAffix path (which now also runs
  // maybeChampion) and tally how many became champions. Proves champions are RARE (≈ affixRate×rate)
  // AND that every champion carries 2 DISTINCT affixes. Cleans up after itself. Reseed for a repeat.
  championRollRate(n, type){ n=Math.max(1,n|0); const before=G.enemies.length; let champs=0, twoAffix=0; const tally={};
    for(let i=0;i<n;i++){ const e=maybeAffix(spawnEnemy(type||"skeleton", -9000-i, -9000));
      if(e.champElite){ champs++; if((e.affixes||[]).length>=2 && e.affixes[0]!==e.affixes[1]) twoAffix++; tally[e.affixes.join("+")]=(tally[e.affixes.join("+")]||0)+1; } }
    G.enemies.length=before; return { n, champs, rate:+(champs/n).toFixed(4), twoAffix, tally }; },
  // Clean single-champion arena with FORCED affixes: clear entities, tanky hero, spawn ONE mob and
  // bake firstId+secondId through the REAL applyAffix→applyChampion path, set it chasing. Returns
  // base-vs-champion stats so the test can assert BOTH affixes are present + the tank/danger boosts.
  championArena(firstId, secondId, type, dx){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.stun=0; h.maxHp=100000; h.hp=100000; h.cls="warrior";
    firstId=firstId||"armored"; secondId=secondId||"frost";
    const base=ETPL[type||"skeleton"]; const e=spawnEnemy(type||"skeleton", h.x+(dx||120), h.y);
    if(!e) return null; applyAffix(e, firstId); applyChampion(e, firstId, secondId); e.state="chase";
    return { champElite:!!e.champElite, affixes:(e.affixes||[]).slice(), affix:e.affix, affix2:e.affix2,
      base:{hp:base.hp, dmg:base.dmg||0, size:base.size, xp:base.xp, gold:base.gold.slice()},
      mod:{hp:e.tpl.hp, dmg:e.tpl.dmg||0, size:e.tpl.size, xp:e.tpl.xp, gold:e.tpl.gold.slice(), gearChance:+(e.tpl.gearChance||0).toFixed(3)} }; },
  // Spawn-kill a FORCED champion via the real killEnemy path in `zone` and report the guaranteed
  // payoff: the champElites/affixKills counter deltas, the drops (superior gear + unique roll), and
  // the projected Esencia this run's champion kills bank (isolated recap through the REAL essenceForRun).
  championKill(zone, firstId, secondId){ const h=G.hero; const before=G.drops.length;
    const champ0=h.champElites|0, affix0=h.affixKills|0;
    firstId=firstId||"armored"; secondId=secondId||"vampiric";
    const e=spawnEnemy("skeleton", h.x, h.y); applyAffix(e, firstId); applyChampion(e, firstId, secondId);
    e.scaleZone=zone||"caves"; e.hp=0; killEnemy(e);
    const dChamp=(h.champElites|0)-champ0, dAffix=(h.affixKills|0)-affix0;
    const essence=essenceForRun(h, { champElites:dChamp, affixKills:dAffix, elites:0 }); // isolated: only this run's champ+affix kills (+ the flat lvl*2 floor)
    return { champElites:dChamp, affixKills:dAffix, champTerm:dChamp*CHAMPION.essence, essence, affixes:(e.affixes||[]).slice(),
      drops:G.drops.slice(before).map(d=>({ kind:d.kind, rarity:d.rarity, tier:d.tier, amt:d.amt||0 })) }; },
  // --- CAS-1632 ÍTEMS ÚNICOS/LEGENDARIOS harness hooks (tools/cas1632-uniques.mjs); additive, curated bridge ---
  // Static config + unique table straight off the data (no sim step) — asserts the RARITY tail,
  // weight:0, the 6 uniques and their mod-hooks, and the live drop rate.
  legendaryMeta(){ return { rate:LEGENDARY.rate, liveRate:legRate, def:Object.assign({},LEGENDARY),
    uniques:UNIQUES.map(u=>({id:u.id,name:u.name,slot:u.slot,defId:u.defId,mod:JSON.parse(JSON.stringify(u.mod))})) }; },
  // RNG-neutrality seam: force the live legendary rate (0 → feature OFF). CAS-1638: the roll draws
  // from the dedicated legRng stream, so the shared srand is byte-identical at ANY rate; QA can prove
  // it by diffing the drop stream at rate=0 vs the shipped rate (both identical for the same seed).
  setLegRate(r){ legRate=(r==null)?LEGENDARY.rate:Math.max(0,+r||0); return legRate; },
  // Live unique bundle read off the equipped instances (the ONLY scalar-mod reader; combat routes here).
  uniqTotals(){ return uniqTotals(G.hero); },
  // Force-EQUIP a unique into its slot through the REAL safeInst path, returns the live combat read-outs
  // so a test proves the mod moved a real number (maxHp / atkspd / cdrFactor / procs / essence / empower).
  equipUnique(id){ const h=G.hero; const u=uniqById(id); if(!h||!u) return null;
    const inst=safeInst(uniqInst(id)); if(!inst) return null; h.equip[u.slot]=inst; return this.uniqSnap(); },
  uniqSnap(){ const h=G.hero; if(!h) return null;
    const chain={id:"chain",type:"chain",jumps:3,range:120}, nova={id:"nova",type:"nova",range:100};
    return { equip:{ weapon:(h.equip.weapon&&h.equip.weapon.uniq)||null, body:(h.equip.body&&h.equip.body.uniq)||null, shield:(h.equip.shield&&h.equip.shield.uniq)||null },
      totals:uniqTotals(h), maxHp:heroMaxHp(h), atkspd:heroAtkspd(h), cdrFactor:+cdrFactor(h).toFixed(4),
      procs:weaponProcs(h)||[], essence:essenceForRun(h,{elites:10}),
      empChain:uniqEmpower(h,chain).jumps, empNova:uniqEmpower(h,nova).range,
      empChainSameRef:uniqEmpower(h,chain)===chain, empNovaSameRef:uniqEmpower(h,nova)===nova }; },
  // Force the NEXT kill to drop `id` and spawn-kill a mob through the REAL killEnemy loot path;
  // reports the dropped gear so a test proves the unique lands (append-only, carries `uniq`).
  forceLegendary(id, zone){ const h=G.hero; const before=G.drops.length; forcedLeg=id;
    const e=spawnEnemy("skeleton", h.x+40, h.y); if(e){ e.scaleZone=zone||"caves"; e.hp=0; killEnemy(e); }
    forcedLeg=null;
    const drops=G.drops.slice(before).filter(d=>d.kind==="gear"&&d.inst).map(d=>({slot:d.inst.slot,defId:d.inst.defId,rarity:d.inst.rarity,uniq:d.inst.uniq||null,name:gearName(d.inst)}));
    return { drops, leg:drops.find(d=>d.uniq)||null }; },
  // Roll-rate probe: spawn-kill N plain mobs at the LIVE legRate and tally unique drops. At legRate=0
  // → 0 uniques (proves OFF). Cleans up its enemies (spawned off-screen). Reseed for a repeat.
  legendaryRollRate(n){ n=Math.max(1,n|0); let legs=0, kills=0; const tally={};
    for(let i=0;i<n;i++){ const before=G.drops.length; const e=spawnEnemy("skeleton",-9000-i,-9000); if(!e) continue;
      e.hp=0; killEnemy(e); kills++;
      for(const d of G.drops.slice(before)){ if(d.kind==="gear"&&d.inst&&d.inst.uniq){ legs++; tally[d.inst.uniq]=(tally[d.inst.uniq]||0)+1; } } }
    return { n:kills, legs, rate:+(legs/Math.max(1,kills)).toFixed(4), tally }; },
  // Persistence probe: EQUIP a forced unique, serialize→load through the REAL save path, report whether
  // `uniq` survived (AC: save→load keeps the unique + its mod stays live).
  uniqPersist(id){ const u=uniqById(id); if(!u) return null; const h=G.hero; if(!h) return null;
    h.equip[u.slot]=safeInst(uniqInst(id));
    const before={ slot:u.slot, uniq:(h.equip[u.slot]&&h.equip[u.slot].uniq)||null, maxHp:heroMaxHp(h) };
    const blob=JSON.parse(JSON.stringify(serializeSave()));   // simulate a localStorage round-trip
    const ok=loadSave(blob); const after=G.hero.equip[u.slot];
    return { ok, before,
      after: after?{slot:after.slot,defId:after.defId,rarity:after.rarity,uniq:after.uniq||null}:null,
      survived: !!(after && after.uniq===id), maxHp:heroMaxHp(G.hero), totals:uniqTotals(G.hero) }; },
  // Append-only proof: capture the FULL drop stream (kind/rarity) of a spawn-kill sequence at the
  // current legRate, so the harness can run it at legRate=0 twice with a fixed seed and diff byte-identity.
  dropStream(n, seedVal){ if(seedVal!=null) seed(seedVal); n=Math.max(1,n|0); const out=[];
    // CAS-1687: this is an SRAND-loot fingerprint probe. Runes/sockets ride the SEPARATE runeRng
    // stream (not srand), and runeRng is not reset by seed() — so leaving sockets ON would inject
    // kind:"rune" drops at run-to-run-varying positions and break byte-identity. Neutralise sockets
    // for the probe's duration (mirrors how callers zero setLegRate/setSetRate), then restore.
    const savSock=SOCKETS.enabled; SOCKETS.enabled=false;
    for(let i=0;i<n;i++){ const before=G.drops.length; const e=spawnEnemy("skeleton",-8000-i,-8000); if(!e) continue;
      e.hp=0; killEnemy(e);
      for(const d of G.drops.slice(before)) out.push({kind:d.kind, rarity:d.rarity||null, tier:d.tier||0, uniq:(d.inst&&d.inst.uniq)||null, set:(d.inst&&d.inst.set)||null}); }
    SOCKETS.enabled=savSock;
    return out; },
  // --- CAS-1654 CONJUNTOS DE OBJETOS harness hooks (tools/cas1653-sets.mjs); additive, curated bridge ---
  // Static config off the data (no sim step) — asserts the 3 sets (each with b2+b3), the 9 pieces,
  // and the live drop rate. Mirrors legendaryMeta().
  setMeta(){ return { liveRate:setRate, dropRate:SET_DROP_RATE,
    sets:SET_ORDER.map(id=>({id, name:SETS[id].name, b2:SETS[id]&&SETS[id].b2, b3:SETS[id]&&SETS[id].b3})),
    pieces:SET_PIECES.map(p=>({id:p.id,name:p.name,slot:p.slot,defId:p.defId,set:p.set})) }; },
  // RNG-neutrality seam: force the live set-drop rate (0 → feature OFF). The roll draws from the
  // dedicated setRng stream, so the shared srand is byte-identical at ANY rate (AC4 [AC-RNG-STRONG]).
  setSetRate(r){ setRate=(r==null)?SET_DROP_RATE:Math.max(0,+r||0); return setRate; },
  // Live set bundle read off the equipped instances (the ONLY set-bonus reader; combat routes here).
  setTotals(){ return setTotals(G.hero); },
  setCounts(){ return setCounts(G.hero); },
  // Clear the 3 gear slots, then force-EQUIP the given set-piece ids through the REAL safeInst path.
  equipSet(pieces){ const h=G.hero; if(!h) return null; h.equip.weapon=null; h.equip.body=null; h.equip.shield=null;
    for(const id of (pieces||[])){ const p=setPieceById(id); const inst=p&&safeInst(setInst(id)); if(inst) h.equip[p.slot]=inst; }
    return this.setSnap(); },
  // Live combat read-outs so a test proves a set bonus moved a REAL number (maxHp/atkspd/cdr/essence).
  setSnap(){ const h=G.hero; if(!h) return null;
    return { equip:{ weapon:(h.equip.weapon&&h.equip.weapon.set)||null, body:(h.equip.body&&h.equip.body.set)||null, shield:(h.equip.shield&&h.equip.shield.set)||null },
      counts:setCounts(h), totals:setTotals(h), maxHp:heroMaxHp(h), atkspd:heroAtkspd(h),
      cdrFactor:+cdrFactor(h).toFixed(4), essence:essenceForRun(h,{elites:10}) }; },
  // Prove critDmgPct is wired: force a RIPOSTE crit on a fresh dummy (no srand) with vs without full
  // Cazador (3pz → +20% crit dmg) and report the damage ratio. A non-elite dummy avoids leg_cazador.
  setCritProbe(dmg){ const h=G.hero; if(!h) return null; const D=dmg||100;
    const hit=()=>{ G.enemies.length=0; const e=spawnEnemy("skeleton",-7000,-7000); if(!e) return 0; e.hp=1e9; e.maxHp=1e9;
      const before=e.hp; h.riposte=CFG.riposteWindow; hitEnemy(e, D, 0); return before-e.hp; };
    this.equipSet([]); const noSet=hit();
    this.equipSet(["cazador_arma","cazador_cuerpo","cazador_escudo"]); const full=hit();
    return { noSet, fullCazador:full, ratio:+(full/Math.max(1e-9,noSet)).toFixed(4), critDmgPct:setTotals(h).critDmgPct }; },
  // Prove reflectPct is wired: full Vigía (3pz → 10% reflect) makes a melee attacker take damage back
  // through the REAL damageHero path; no-set → 0 reflected. Attacker/hero pinned huge so nothing dies.
  setReflectProbe(dmg){ const h=G.hero; if(!h) return null; const D=dmg||200;
    const run=(pieces)=>{ this.equipSet(pieces); G.enemies.length=0; G.projectiles.length=0;
      const src=spawnEnemy("skeleton", h.x+20, h.y); if(!src) return 0; src.hp=1e9; src.maxHp=1e9;
      h.dead=false; h.rolling=false; h.iframe=0; h.stun=0; h.hp=1e9; h.maxHp=1e9; if(h.bb) h.bb.reflect=0;
      const before=src.hp; damageHero(D, 0, null, src); return +(before-src.hp).toFixed(2); };
    const noSet=run([]); const fullVigia=run(["vigia_arma","vigia_cuerpo","vigia_escudo"]);
    return { noSet, fullVigia, reflectPct:setTotals(h).reflectPct }; },
  // Force the NEXT kill to drop `id` via the REAL killEnemy loot path; reports the dropped gear so a
  // test proves the set piece lands (append-only, carries `set`). Mirrors forceLegendary.
  forceSetPiece(id, zone){ const h=G.hero; const before=G.drops.length; forcedSet=id;
    const e=spawnEnemy("skeleton", h.x+40, h.y); if(e){ e.scaleZone=zone||"caves"; e.hp=0; killEnemy(e); }
    forcedSet=null;
    const drops=G.drops.slice(before).filter(d=>d.kind==="gear"&&d.inst).map(d=>({slot:d.inst.slot,defId:d.inst.defId,rarity:d.inst.rarity,set:d.inst.set||null,name:gearName(d.inst)}));
    return { drops, piece:drops.find(d=>d.set)||null }; },
  // Roll-rate probe: spawn-kill N plain mobs at the LIVE setRate and tally set-piece drops. At
  // setRate=0 → 0 pieces (proves OFF); rate>0 → pieces drop (feature ON). Mirrors legendaryRollRate.
  setRollRate(n){ n=Math.max(1,n|0); let pieces=0, kills=0; const tally={};
    for(let i=0;i<n;i++){ const before=G.drops.length; const e=spawnEnemy("skeleton",-9500-i,-9500); if(!e) continue;
      e.hp=0; killEnemy(e); kills++;
      for(const d of G.drops.slice(before)){ if(d.kind==="gear"&&d.inst&&d.inst.set){ pieces++; tally[d.inst.set]=(tally[d.inst.set]||0)+1; } } }
    return { n:kills, pieces, rate:+(pieces/Math.max(1,kills)).toFixed(4), tally }; },
  // Persistence probe: equip a set, serialize→load through the REAL save path, report survival + counts
  // (AC5: set membership persists; a set save round-trips clean).
  setPersist(pieces){ const h=G.hero; if(!h) return null; this.equipSet(pieces);
    const before={ counts:setCounts(h), maxHp:heroMaxHp(h) };
    const blob=JSON.parse(JSON.stringify(serializeSave())); const ok=loadSave(blob);
    const h2=G.hero;
    return { ok, before, after:{ counts:setCounts(h2), maxHp:heroMaxHp(h2),
      equip:{ weapon:(h2.equip.weapon&&h2.equip.weapon.set)||null, body:(h2.equip.body&&h2.equip.body.set)||null, shield:(h2.equip.shield&&h2.equip.shield.set)||null } } }; },
  // --- CAS-1687 RUNAS Y ENGARCES (sockets) harness hooks (tools/cas1687-sockets.mjs); additive, drive the REAL paths ---
  // Static config off the data (no sim step): the knobs + the rune content table + the live drop rate.
  socketMeta(){ return { enabled:SOCKETS.enabled, dropRate:SOCKETS.dropRate, liveRate:runeRate,
    socketChance:(SOCKETS.socketChance||[]).slice(),
    runes:RUNE_ORDER.map(id=>({id, name:RUNES[id].name, glyph:RUNES[id].glyph, tint:RUNES[id].tint, stat:RUNES[id].stat, amt:RUNES[id].amt, label:RUNES[id].label})) }; },
  // Master kill switch (AC1): false → zero runeRng draws (gear-socket roll + rune drops both off).
  socketSetEnabled(b){ SOCKETS.enabled=!!b; return SOCKETS.enabled; },
  // RNG-neutrality seam: force the live rune-drop rate (0 → rune drops OFF). Draws from the dedicated
  // runeRng, so the shared srand is byte-identical at ANY rate (AC1 [AC-RNG-STRONG]). Mirror of setSetRate.
  setSocketRate(r){ runeRate=(r==null)?SOCKETS.dropRate:Math.max(0,+r||0); return runeRate; },
  // Live socket bundle read off the equipped instances (the ONLY socket-bonus reader; combat routes here).
  socketTotals(){ return socketTotals(G.hero); },
  // Give the equipped `slot` exactly `n` EMPTY sockets (through no RNG) so a test can engarzar into them.
  grantSocketGear(slot, n){ const h=G.hero; if(!h) return null; slot=slot||"weapon"; n=Math.max(0,Math.min(2,n==null?1:n|0));
    const g=h.equip[slot]; if(!g) return null; const a=[]; for(let i=0;i<n;i++) a.push({}); g.sockets=a; return this.socketSnap(); },
  // Grant a rune straight to the bag as {rune:type} (bypasses drop RNG); returns bag index + length.
  grantRune(type){ const h=G.hero; if(!h||!RUNES[type]) return null; h.bag.push({rune:type}); return { i:h.bag.length-1, bag:h.bag.length }; },
  // Force the NEXT kill to drop `type` via the REAL killEnemy loot path; reports the dropped rune so a
  // test proves the rune lands (append-only, own runeRng). Mirrors forceSetPiece/forceLegendary.
  forceSocketRune(type, zone){ const h=G.hero; if(!h||!RUNES[type]) return null; const before=G.drops.length; forcedRune=type;
    const e=spawnEnemy("skeleton", h.x+40, h.y); if(e){ e.scaleZone=zone||"caves"; e.hp=0; killEnemy(e); }
    forcedRune=null;
    const drops=G.drops.slice(before).filter(d=>d.kind==="rune").map(d=>({rune:d.rune,name:runeName(d.rune)}));
    return { drops, rune:drops[0]||null }; },
  // ENGARZAR bag[i] into the first empty socket (drives the REAL socketRune path). Returns the outcome.
  socketRune(i){ return socketRune(i|0); },
  // DESENGARZAR the last filled socket on `slot` back to the bag (drives the REAL unsocketRune path).
  removeSocketRune(slot){ return unsocketRune(slot||"weapon"); },
  // Live snapshot: per-slot sockets (empty vs filled) + the live combat read-outs so a test proves a
  // filled socket moved a REAL number (dmg/maxHp/atkspd) and survives serialize→load (AC3).
  socketSnap(){ const h=G.hero; if(!h) return null;
    const sl=(g)=>Array.isArray(g&&g.sockets)?g.sockets.map(s=>(s&&s.type)||null):[];
    return { equip:{ weapon:sl(h.equip.weapon), body:sl(h.equip.body), shield:sl(h.equip.shield) },
      totals:socketTotals(h), dmg:equippedDmg(h), def:equippedDef(h), maxHp:heroMaxHp(h), atkspd:heroAtkspd(h),
      bag:h.bag.map(b=>b&&b.rune?("rune:"+b.rune):(b&&b.slot?b.slot:"?")) }; },
  // Persistence probe (AC3/AC5): socket a rune, serialize→load through the REAL save path, report survival.
  // Clears ALL equip sockets first so the ONLY socket in play is the one on `slot` (deterministic assert).
  socketPersist(slot, type){ const h=G.hero; if(!h) return null; slot=slot||"weapon";
    for(const s of ["weapon","body","shield"]){ const g=h.equip[s]; if(g) delete g.sockets; }
    this.grantSocketGear(slot,1); const g=this.grantRune(type); if(g) this.socketRune(g.i);
    const before={ totals:socketTotals(h), maxHp:heroMaxHp(h), dmg:equippedDmg(h) };
    const blob=JSON.parse(JSON.stringify(serializeSave())); const ok=loadSave(blob); const h2=G.hero;
    const sl=(gg)=>Array.isArray(gg&&gg.sockets)?gg.sockets.map(s=>(s&&s.type)||null):[];
    return { ok, before, after:{ totals:socketTotals(h2), maxHp:heroMaxHp(h2), dmg:equippedDmg(h2),
      equip:{ weapon:sl(h2.equip.weapon), body:sl(h2.equip.body), shield:sl(h2.equip.shield) } } }; },
  // Draw n floats from the DEDICATED runeRng (no srand touch) — proves the stream is live + isolated.
  // Reseeds runeRng directly (the global seed() does NOT reset it — that's the whole isolation point).
  socketRngProbe(n, seedVal){ n=Math.max(1,n|0); if(seedVal!=null) runeRng.seed(seedVal>>>0);
    const out=[]; for(let i=0;i<n;i++) out.push(+runeRng.srand().toFixed(9)); return out; },
  // AC1 [AC-RNG-STRONG]: run a gameplay-srand fingerprint around a dropGear socket-roll + a rune-drop
  // gate, with sockets ON vs OFF. Because both draw ONLY from runeRng, the srand fingerprint is
  // BYTE-IDENTICAL either way, while socketsOn>0 proves ON actually did work. Mirror of eventGenProbe.
  socketGenProbe(enabled, rate, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=SOCKETS.enabled, savR=runeRate; const usedR=(rate==null?SOCKETS.dropRate:Math.max(0,+rate||0));
    SOCKETS.enabled=!!enabled; runeRate=usedR;
    G.enemies.length=0; G.drops.length=0;
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));         // pre-segment
    const inst=rollGearInst(srand,2,3); if(inst) dropGear(-8000,-8000, inst);    // SOCKET INJECTION (runeRng only)
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                       // mid-segment
    const h=G.hero; if(h) maybeSocketRune(-8100,-8100, 50);                       // RUNE INJECTION (runeRng only), high bias
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                       // post-segment
    const socketsOn=(inst&&Array.isArray(inst.sockets))?inst.sockets.length:0;
    const runesDropped=G.drops.filter(d=>d.kind==="rune").length;
    SOCKETS.enabled=savEn; runeRate=savR;
    return { enabled:!!enabled, rate:usedR, socketsOn, runesDropped, fingerprint:fp }; },
  // --- CAS-1751 CÓDICE DE BOTÍN harness hooks (tools/cas1752-codex.mjs); additive, drive the REAL paths ---
  // Master toggle: flip CODEX.enabled and re-apply the cached hero bonus (0 when off). Mirror of newMobsEnable.
  codexEnable(on){ CODEX.enabled=!!on; applyCodex(G.hero); return { enabled:CODEX.enabled, bonus:codexBonus() }; },
  // Wipe the ledger to empty (own key) + refresh the hero cache. For the A/B baseline + a clean round-trip.
  codexReset(){ G.codex=codexDefault(); G.codexDirty=false; applyCodex(G.hero); return this.codexState(); },
  // Live snapshot: the full view model (sections + per-section found/total + bonus) plus the hero's cached
  // codexDmg/codexHp and the live combat read-outs so a test proves a discovery moved a REAL number.
  codexState(){ const h=G.hero; const snap=codexSnap();
    return { enabled:CODEX.enabled, bonus:snap.bonus,
      sections:snap.sections.map(s=>({ key:s.key, found:s.found, total:s.total, ids:s.items.filter(i=>i.found).map(i=>i.id) })),
      hero: h ? { codexDmg:h.codexDmg||0, codexHp:h.codexHp||0, dmg:equippedDmg(h), maxHp:heroMaxHp(h), hp:h.hp } : null,
      dirty:!!G.codexDirty }; },
  // Record a discovery DIRECTLY through the real recordCodex (idempotent). Reports whether it was NEW
  // + the resulting state (drives AC2 idempotency + AC3 bonus application without needing a live drop).
  codexRecord(cat,id){ const was=recordCodex(cat,id); return { recorded:!!was, state:this.codexState() }; },
  // Drive the FULL pickup path: spawn the exact item as a drop AT the hero and call the REAL tryPickup so
  // the discovery hook fires from where it lives. `cat` = uniq|set|rune, `id` = uniq/set-piece id or rune type.
  codexPickup(cat,id){ const h=G.hero; if(!h) return null; G.codexDirty=false;
    if(cat==="rune"){ if(!RUNES[id]) return null; G.drops.push({x:h.x,y:h.y,kind:"rune",rune:id}); }
    else { const inst = cat==="uniq" ? uniqInst(id) : setInst(id); if(!inst) return null;
      G.drops.push({x:h.x,y:h.y,kind:"gear",inst,slot:inst.slot,rarity:inst.rarity,stat:gearStat(inst)}); }
    tryPickup();
    return { dirtiedForFlush:!!G.codexDirty, state:this.codexState() }; },
  // AC1/persistence: serialize→load the codex through the REAL persistence pair (mirror of arenaPersist).
  // Proves the ledger round-trips through its OWN blob and reconstitutes the same discovered set + bonus.
  codexPersist(){ const before=this.codexState(); const blob=JSON.parse(JSON.stringify(serializeCodex()));
    G.codex=codexDefault(); const okReset=codexCounts().uniq===0; loadCodex(blob); applyCodex(G.hero);
    return { blob, clearedFirst:okReset, before:{ sections:before.sections, bonus:before.bonus }, after:this.codexState() }; },
  // AC5 [AC-RNG-STRONG]: fingerprint gameplay-srand around a FULL unique-pickup with the codex ON vs OFF.
  // recordCodex + tryPickup draw ZERO srand, so the fingerprint is BYTE-IDENTICAL either way, while the ON
  // run records a discovery (found>0) and the OFF run records none — proving RNG-neutrality by construction.
  codexSrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=CODEX.enabled; CODEX.enabled=!!enabled; G.codex=codexDefault(); applyCodex(G.hero);
    G.drops.length=0; if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));      // pre-segment
    const h=G.hero; if(h){ G.drops.push({x:h.x,y:h.y,kind:"gear",inst:uniqInst("reloj_vacio"),slot:"weapon",rarity:"legendary"}); tryPickup(); } // DISCOVERY INJECTION (no srand)
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                    // post-segment
    const found=codexCounts().uniq; CODEX.enabled=savEn;
    return { enabled:!!enabled, uniqFound:found, fingerprint:fp }; },
  // --- CAS-1758 TÍTULOS DE GESTA harness hooks (tools/cas1758-titles.mjs); additive, drive the REAL paths ---
  // Master toggle: flip TITLES.enabled + refresh the cached hero title (""=none when off). Mirror of codexEnable.
  titlesEnable(on){ TITLES.enabled=!!on; applyTitles(G.hero); return { enabled:TITLES.enabled }; },
  // Wipe the ledger to empty (own key) + refresh the hero cache. For the A/B baseline + a clean round-trip.
  titlesReset(){ G.titles=titlesDefault(); G.titlesDirty=false; applyTitles(G.hero); return this.titlesState(); },
  // Live snapshot: the full view model (every def, unlocked/equipped/cur/n) + the hero's cached h.title so a
  // test proves an unlock/equip moved a REAL string. Read-only.
  titlesState(){ const h=G.hero; const snap=titlesSnap();
    return { enabled:TITLES.enabled, equipped:snap.equipped, unlocked:snap.unlocked, total:snap.total,
      items:snap.items.map(i=>({ id:i.id, unlocked:i.unlocked, equipped:i.equipped, cur:i.cur, n:i.n })),
      hero: h ? { title:h.title||"" } : null, dirty:!!G.titlesDirty }; },
  // Re-run the REAL evaluator (idempotent) + refresh the cache. Reports whether a NEW unlock landed.
  titlesEval(){ const changed=evalTitles(); applyTitles(G.hero); return { changed, state:this.titlesState() }; },
  // Equip through the REAL equipTitle (validates against unlocked). Reports success + resulting state.
  titlesEquip(id){ const ok=equipTitle(id); return { ok, state:this.titlesState() }; },
  // Seed a codex count DIRECTLY (0 RNG) then eval — drives AC3 threshold-crossing without a live drop.
  // `cat`=uniq|set|rune, `n`=how many distinct ids to mark discovered (capped at the content total).
  titlesSeedCodex(cat,n){ const c=ensureCodex(); const set=c[cat]; if(!set) return null;
    const pool = cat==="uniq"?UNIQUES.map(u=>u.id) : cat==="set"?SET_PIECES.map(p=>p.id) : RUNE_ORDER.slice();
    for(let i=0;i<Math.min(n|0,pool.length);i++) set[pool[i]]=1;
    applyTitles(G.hero); return { count:Object.keys(set).length, state:this.titlesState() }; },
  // Seed the arena bests / ascension level DIRECTLY (0 RNG) then eval — drives AC3 for the non-codex sources.
  titlesSeedArena(bestWave,bestBossWave){ if(!G.arena) return null;
    if(bestWave!=null) G.arena.best=bestWave|0; if(bestBossWave!=null) G.arena.bestBossWave=bestBossWave|0;
    applyTitles(G.hero); return { best:G.arena.best, bestBossWave:G.arena.bestBossWave, state:this.titlesState() }; },
  titlesSeedAscension(lvl){ const m=ensureMeta(); m.ascension={ level:Math.max(0,lvl|0), mult:ascMult(Math.max(0,lvl|0)) };
    applyTitles(G.hero); return { ascension:ascLevel(), state:this.titlesState() }; },
  // AC1/persistence: serialize→load the ledger through the REAL persistence pair (mirror of codexPersist).
  titlesPersist(){ const before=this.titlesState(); const blob=JSON.parse(JSON.stringify(serializeTitles()));
    G.titles=titlesDefault(); const cleared=Object.keys(ensureTitles().unlocked).length===0; loadTitles(blob); applyTitles(G.hero);
    return { blob, clearedFirst:cleared, before:{ items:before.items, equipped:before.equipped }, after:this.titlesState() }; },
  // AC5 [AC-RNG-STRONG]: fingerprint gameplay-srand around a title UNLOCK with the feature ON vs OFF. The
  // unlock path (seed codex counts + evalTitles) draws ZERO srand, so the fingerprint is BYTE-IDENTICAL either
  // way, while ON records the unlock (unlockedCount>0) and OFF records none — RNG-neutral by construction.
  titlesSrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savT=TITLES.enabled, savC=CODEX.enabled; TITLES.enabled=!!enabled; CODEX.enabled=true;
    G.titles=titlesDefault(); const c=ensureCodex(); c.uniq={}; for(const u of UNIQUES.slice(0,5)) c.uniq[u.id]=1; // 5 uniques ⇒ codex_uniq_5 eligible (no RNG)
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));   // pre-segment
    evalTitles(); applyTitles(G.hero);                                     // UNLOCK INJECTION (no srand)
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                // post-segment
    const unlocked=Object.keys(ensureTitles().unlocked).length;
    TITLES.enabled=savT; CODEX.enabled=savC;
    return { enabled:!!enabled, unlockedCount:unlocked, fingerprint:fp }; },
  // --- CAS-1763 PACTOS DE PODER harness hooks (tools/cas1763-pacts.mjs); additive, drive the REAL paths ---
  // Master toggle: flip PACTS.enabled. Mirror of codexEnable/titlesEnable. Effects are read live in the seam.
  pactsEnable(on){ PACTS.enabled=!!on; return { enabled:PACTS.enabled }; },
  // Wipe every ranked pact (own key) → heat 0. For the A/B baseline + a clean round-trip.
  pactsReset(){ G.pacts=pactsDefault(); G.pactsDirty=false; return this.pactsState(); },
  // Live snapshot: the full view model (every def + live rank + heat) plus the derived heat + reward muls.
  pactsState(){ const s=pactsSnap(); return { enabled:PACTS.enabled, heat:s.heat, essMul:+s.essMul.toFixed(6), dropMul:+s.dropMul.toFixed(6),
    items:s.items.map(i=>({ id:i.id, rank:i.rank, max:i.max, heat:i.heat, heatNow:i.heatNow })), active:s.active, total:s.total, dirty:!!G.pactsDirty }; },
  // Set a pact's rank DIRECTLY through the REAL setPactRank (clamps [0,max]; rank 0 clears). Reports the state.
  pactsSetRank(id, rank){ const ok=setPactRank(id, rank); return { ok, state:this.pactsState() }; },
  // Advance a pact's rank by 1 through the REAL cyclePactRank (wraps past max→0) — the panel-tap path.
  pactsCycle(id){ const ok=cyclePactRank(id); return { ok, state:this.pactsState() }; },
  // AC1/persistence: serialize→load the pacts through the REAL persistence pair (mirror of codexPersist).
  pactsPersist(){ const before=this.pactsState(); const blob=JSON.parse(JSON.stringify(serializePacts()));
    G.pacts=pactsDefault(); const cleared=Object.keys(ensurePacts().ranks).length===0; loadPacts(blob);
    return { blob, clearedFirst:cleared, before:{ items:before.items, heat:before.heat }, after:this.pactsState() }; },
  // Read the derived enemy stat multipliers (proves a stat pact moves a REAL enemy stat via applyZoneScale).
  // Spawns a throwaway mob OFF-SCREEN, scales it under the live pacts, and returns its resulting hp/dmg/spd.
  pactMobScale(type, zone){ const e=applyZoneScale(spawnEnemy(type||"skeleton", -9999, -9999), zone||"forest");
    const out=e?{ hp:e.maxHp, dmg:e.tpl.dmg, spd:e.tpl.spd }:null; if(e){ const i=G.enemies.indexOf(e); if(i>=0) G.enemies.splice(i,1); } return out; },
  // Deterministic Esencia readout (drives AC2: heat scales essenceForRun). Fixed synthetic run recap → pure arithmetic.
  pactEssence(lvl, elites){ const h=G.hero; if(!h) return null; const savLvl=h.lvl; h.lvl=lvl|0;
    const e=essenceForRun(h, { elites:elites|0, affixKills:0, champElites:0 }); h.lvl=savLvl; return e; },
  // AC-RNG-STRONG (iii): fingerprint the gameplay srand around a FIXED spawn/scale script with a STAT pact
  // active vs OFF. A stat pact is PURE arithmetic in applyZoneScale (draws 0 srand), so the raw srand stream is
  // BYTE-IDENTICAL ON==OFF while the scaled mob hp DIFFERS — RNG-neutral STRONG proven by construction. `ranks`
  // is a {id:rank} map applied through the REAL setPactRank. probeN draws pre + post = 2*probeN total (48 at 24).
  pactsSrandProbe(enabled, ranks, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=PACTS.enabled; PACTS.enabled=!!enabled; G.pacts=pactsDefault();
    if(ranks && enabled) for(const k in ranks) setPactRank(k, ranks[k]|0);
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                 // pre-segment
    const e=applyZoneScale(spawnEnemy("skeleton", -9999, -9999), "frost");               // SCALE INJECTION (pact arithmetic, 0 srand)
    const mobHp=e?e.maxHp:0; if(e){ const i=G.enemies.indexOf(e); if(i>=0) G.enemies.splice(i,1); }
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                               // post-segment
    const heat=pactHeat(); PACTS.enabled=savEn; G.pacts=pactsDefault();
    return { enabled:!!enabled, heat, mobHp, fingerprint:fp }; },
  // --- CAS-1768 AFIJOS DE ARMA on-hit harness hooks (tools/cas1768-weapon-affixes.mjs); additive, drive the REAL paths ---
  // Static config off the data (no sim step): the fixed pool of 5, the tuning knobs.
  waMeta(){ return { enabled:WEAPON_AFFIXES.enabled, magPerTier:WEAPON_AFFIXES.magPerTier, chainRange:WEAPON_AFFIXES.chainRange,
    dropChanceByRank:WEAPON_AFFIXES.dropChanceByRank.slice(),
    defs:WEAPON_AFFIXES.defs.map(d=>({ id:d.id, name:d.name, glyph:d.glyph, tint:d.tint, kind:d.kind, mag:d.mag, chance:d.chance||0, hops:d.hops||0 })) }; },
  // Master toggle: flip WEAPON_AFFIXES.enabled. Mirror of pactsEnable. Rolls/procs read live.
  waEnable(on){ WEAPON_AFFIXES.enabled=!!on; return { enabled:WEAPON_AFFIXES.enabled }; },
  // AC3/determinism: reseed the DEDICATED affixRng and draw N values → fingerprint. Two identical calls MUST match
  // (deterministic stream); this is the "48-draw affixRng" determinism probe. Consumes ONLY affixRng, never srand.
  waAffixRngProbe(seedVal, probeN){ probeN=Math.max(4,probeN|0); affixRng.seed((seedVal>>>0)||0x0a771c5e);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+affixRng.srand().toFixed(9)); return { seed:(seedVal>>>0), fingerprint:fp }; },
  // Draw-count determinism (§3): reseed affixRng, run the REAL maybeWeaponAffix on a synthetic instance, then find
  // how many affixRng draws it consumed by replaying the seed with k skips until the next value matches. Proves:
  // common / non-weapon / uniq → 0 draws; uncommon+ weapon → 1 (gate) + 1 more IFF the gate passes.
  waRollConsumes(rarity, slot, extra){ const SEED=0x1768c0de;
    const mk=()=>Object.assign({slot:slot||"weapon",defId:"w_iron",rarity:rarity||"uncommon"}, extra||{});
    affixRng.seed(SEED); const inst=mk(); maybeWeaponAffix(inst); const after=affixRng.srand();
    let consumed=-1; for(let k=0;k<=3;k++){ affixRng.seed(SEED); for(let j=0;j<k;j++) affixRng.srand(); if(affixRng.srand()===after){ consumed=k; break; } }
    return { wa:inst.wa||null, consumed }; },
  // Force a specific affix id onto the NEXT weapon drop (one-shot), through the REAL roll path. For known setups.
  waForce(id){ forcedAffix=id; return { forced:forcedAffix }; },
  // AC1/AC3 [AC-RNG-STRONG]: fingerprint the gameplay srand around a REAL dropGear WEAPON roll with affixes ON vs
  // OFF. The affix roll rides affixRng ONLY, so the raw srand stream is BYTE-IDENTICAL ON==OFF while the dropped
  // weapon DOES/DOESN'T carry a `wa`. probeN pre+post = 2*probeN total (48 at 24).
  waSrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=WEAPON_AFFIXES.enabled; WEAPON_AFFIXES.enabled=!!enabled; affixRng.seed(0x0a771c5e);
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                 // pre-segment
    const before=G.drops.length;                                                        // WEAPON DROP INJECTION (affix roll = affixRng only)
    dropGear(-9000,-9000, {slot:"weapon",defId:"w_iron",rarity:"epic"});
    dropGear(-9001,-9001, {slot:"weapon",defId:"w_steel",rarity:"rare"});
    const waCount=G.drops.slice(before).filter(d=>d.inst&&d.inst.wa).length; G.drops.length=before;
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                              // post-segment
    WEAPON_AFFIXES.enabled=savEn;
    return { enabled:!!enabled, waCount, fingerprint:fp }; },
  // AC2: save.v1 byte-identity for an AFFIX-LESS weapon — serialize with the feature OFF vs ON (no wa rolled).
  // Both must produce the SAME bytes and NEITHER may carry a `wa` key (trailing-optional field omitted).
  waSaveByteId(){ const h=G.hero; if(!h) return null;
    h.equip.weapon={slot:"weapon",defId:"w_steel",rarity:"epic"};                        // affix-less
    const savEn=WEAPON_AFFIXES.enabled;
    WEAPON_AFFIXES.enabled=false; const offStr=JSON.stringify(serializeSave());
    WEAPON_AFFIXES.enabled=true;  const onStr =JSON.stringify(serializeSave());
    WEAPON_AFFIXES.enabled=savEn;
    return { byteId:offStr===onStr, hasWa:/"wa":/.test(onStr), offLen:offStr.length, onLen:onStr.length }; },
  // AC5: a weapon WITH `wa` round-trips byte-identically through the REAL serialize→load→serialize pair, and the
  // affix id survives. Also reports that an equipped affix-less body/shield keep their own shape (no leak).
  waPersist(waId){ const h=G.hero; if(!h) return null; const savEn=WEAPON_AFFIXES.enabled; WEAPON_AFFIXES.enabled=true;
    h.equip.weapon={slot:"weapon",defId:"w_steel",rarity:"epic",wa:waId};
    const beforeStr=JSON.stringify(serializeSave()); const ok=loadSave(JSON.parse(beforeStr)); const h2=G.hero;
    const afterStr=JSON.stringify(serializeSave());
    WEAPON_AFFIXES.enabled=savEn;
    return { ok, wa:(h2.equip.weapon&&h2.equip.weapon.wa)||null, byteId:beforeStr===afterStr, hasWa:/"wa":/.test(beforeStr) }; },
  // AC5: apply an affix in the REAL hitEnemy against a fresh dummy and observe the effect. stun draws from affixRng
  // (reseeded → reproducible). Returns the observable per-kind signal. A 2nd enemy sits in Cadena range.
  waHitProbe(waId, seedVal){ const h=G.hero; if(!h) return null; const savEn=WEAPON_AFFIXES.enabled; WEAPON_AFFIXES.enabled=true;
    h.equip.weapon={slot:"weapon",defId:"w_steel",rarity:"epic",wa:waId};
    G.enemies.length=0; const e=spawnEnemy("skeleton", h.x+40, h.y), e2=spawnEnemy("skeleton", h.x+70, h.y);
    if(e){ e.hp=1e6; e.maxHp=1e6; } if(e2){ e2.hp=1e6; e2.maxHp=1e6; }
    h.maxHp=Math.max(h.maxHp,1000); h.hp=1; const hp0=h.hp, ehp0=e?e.hp:0, e2hp0=e2?e2.hp:0;
    if(seedVal!=null) affixRng.seed(seedVal>>>0);
    hitEnemy(e, 100, 0);
    const out={ wa:waId, heroHeal:Math.round(h.hp-hp0),
      burn:!!(e&&e.dots&&e.dots.burn), burnDmg:(e&&e.dots&&e.dots.burn)?e.dots.burn.dmg:0,
      stun:!!(e&&e.stun>0), chainDmg:e2?Math.round(e2hp0-e2.hp):0, eDmg:e?Math.round(ehp0-e.hp):0 };
    G.enemies.length=0; WEAPON_AFFIXES.enabled=savEn; return out; },
  // AC5 (pierce): pierce IGNORES part of a target's ARMORED reduction — a pierce weapon deals MORE to an armored
  // dummy than a plain weapon. Returns both damage numbers so the harness asserts pierce > plain > 0.
  waPierceProbe(){ const h=G.hero; if(!h) return null; const savEn=WEAPON_AFFIXES.enabled;
    const mk=(wa)=>{ WEAPON_AFFIXES.enabled=true; h.equip.weapon={slot:"weapon",defId:"w_steel",rarity:"epic",wa};
      G.enemies.length=0; const e=spawnEnemy("skeleton", h.x+40, h.y); if(!e) return 0; e.affix="armored"; e.hp=1e6; e.maxHp=1e6;
      const before=e.hp; hitEnemy(e,100,0); return Math.round(before-e.hp); };
    const plain=mk(null), pierce=mk("perforante"); G.enemies.length=0; WEAPON_AFFIXES.enabled=savEn;
    return { plain, pierce }; },
  // --- CAS-1773 MEDIDOR DE FRENESÍ harness hooks (tools/cas1773-frenzy.mjs); additive, drive the REAL paths ---
  // Static config off the data (no sim step): the knobs.
  frenzyMeta(){ return { enabled:FRENZY.enabled, window:FRENZY.window, decayEvery:FRENZY.decayEvery,
    maxStacks:FRENZY.maxStacks, perStack:{...FRENZY.perStack} }; },
  // Master toggle: flip FRENZY.enabled. Mirror of waEnable. Reads live at every choke.
  frenzyEnable(on){ FRENZY.enabled=!!on; return { enabled:FRENZY.enabled }; },
  // Zero the transient meter (mirror of a fresh newHero) so a probe starts clean.
  frenzyReset(){ const h=G.hero; if(!h) return null; h.frenzyStacks=0; h.frenzyT=0; h._frenzyDecayT=0; return this.frenzyState(); },
  // Live meter read + the two derived combat numbers: heroAtkspd (frenzy sums into it under the cap)
  // and the deterministic hitEnemy dmg multiplier for the current stack count.
  frenzyState(){ const h=G.hero; if(!h) return null;
    const st=h.frenzyStacks|0;
    return { enabled:FRENZY.enabled, stacks:st, t:+((h.frenzyT||0).toFixed(3)), decayT:+((h._frenzyDecayT||0).toFixed(3)),
      atkspd:heroAtkspd(h), atkspdContrib:(FRENZY.enabled?st*FRENZY.perStack.atkspd:0),
      dmgMul:(FRENZY.enabled&&st>0)?+(1+st*FRENZY.perStack.dmgPct/100).toFixed(4):1 }; },
  // Drive a REAL non-neutral kill through killEnemy → exercises the increment choke (add a stack if
  // within window, else re-arm at 1). Spawns a fresh dummy at 0 HP so no combat RNG branches on it.
  frenzyKill(){ const h=G.hero; if(!h) return null;
    const e=spawnEnemy("skeleton", h.x+40, h.y); if(e){ e.hp=0; killEnemy(e); } G.enemies.length=0;
    return this.frenzyState(); },
  // Advance ONLY the frenzy timer by dt through the SAME tickFrenzy the game loop uses (window
  // wind-down then gradual decay). No world step, no RNG — deterministic decay probe (AC3).
  frenzyStep(dt){ const h=G.hero; if(!h) return null; tickFrenzy(h,+dt||0); return this.frenzyState(); },
  // AC3 (dmg): set an exact stack count and read the damage a REAL hitEnemy deals to a huge-HP dummy,
  // so the harness asserts the per-stack % vs the stacks=0 baseline. Fresh hero (no crit) ⇒ 0 srand.
  frenzyHitProbe(stacks){ const h=G.hero; if(!h) return null;
    const sav=FRENZY.enabled; FRENZY.enabled=true; h.frenzyStacks=Math.max(0,stacks|0); h.frenzyT=FRENZY.window;
    G.enemies.length=0; const e=spawnEnemy("skeleton", h.x+40, h.y);
    if(!e){ FRENZY.enabled=sav; return null; } e.hp=1e7; e.maxHp=1e7; const before=e.hp;
    hitEnemy(e, 100, 0); const dmg=Math.round(before-e.hp);
    G.enemies.length=0; FRENZY.enabled=sav; return { stacks:h.frenzyStacks, dmg, dmgMul:this.frenzyState().dmgMul }; },
  // AC1/AC2 [AC-RNG-STRONG]: fingerprint the gameplay srand around a run of REAL kills (which consume
  // drop RNG) with frenzy ON vs OFF. Frenzy touches NO srand, so the fingerprint is BYTE-IDENTICAL
  // ON==OFF while the stacks climb only when ON. probeN pre+post = 2*probeN (48 at 24).
  frenzySrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const sav=FRENZY.enabled; FRENZY.enabled=!!enabled; const h=G.hero;
    if(h){ h.frenzyStacks=0; h.frenzyT=0; h._frenzyDecayT=0; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));           // pre-segment
    G.enemies.length=0; let kills=0;                                               // REAL kills (drop RNG)
    for(let i=0;i<6;i++){ const e=spawnEnemy("skeleton", (h?h.x:0)+40+i, (h?h.y:0)); if(e){ e.hp=0; killEnemy(e); kills++; } }
    G.enemies.length=0;
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                        // post-segment
    const stacks=h?h.frenzyStacks:0; FRENZY.enabled=sav;
    return { enabled:!!enabled, stacks, kills, fingerprint:fp }; },
  // AC4: the meter is NOT persisted. Serialize with stacks>0 vs a clean save (stacks=0): bytes MUST
  // match and NO frenzy key may appear; then loadSave → frenzyStacks==0 (reset on load/new run).
  frenzySaveByteId(){ const h=G.hero; if(!h) return null;
    h.frenzyStacks=0; h.frenzyT=0; h._frenzyDecayT=0; const cleanStr=JSON.stringify(serializeSave());
    h.frenzyStacks=6; h.frenzyT=FRENZY.window; h._frenzyDecayT=0.3; const hotStr=JSON.stringify(serializeSave());
    const ok=loadSave(JSON.parse(hotStr)); const h2=G.hero;
    return { byteId:cleanStr===hotStr, hasKey:/"_?frenzy[a-z]*":/i.test(hotStr), afterLoadStacks:h2.frenzyStacks|0,
      cleanLen:cleanStr.length, hotLen:hotStr.length }; },
  // --- CAS-1785 PARADA CON TEMPO harness hooks (tools/cas1785-parry.mjs); additive, drive the REAL paths ---
  parryMeta(){ return { enabled:PARRY.enabled, windowMs:PARRY.windowMs, cooldownS:PARRY.cooldownS,
    counterDmg:PARRY.counterDmg, knockback:PARRY.knockback, riposteMul:PARRY.riposteMul }; },
  parryEnabled(){ return PARRY.enabled; },
  parryEnable(on){ PARRY.enabled=!!on; return { enabled:PARRY.enabled }; },
  // Zero the transient parry run-state (mirror a fresh newHero) + clear iframe/rolling so damage probes
  // hit the intended branch, not a stale mercy i-frame.
  parryReset(){ const h=G.hero; if(!h) return null; h.parryT=0; h.parryCD=0; h._parryRiposte=0; h.iframe=0; h.rolling=false; return this.parryState(); },
  parryState(){ const h=G.hero; if(!h) return null;
    return { enabled:PARRY.enabled, parryT:+((h.parryT||0).toFixed(4)), parryCD:+((h.parryCD||0).toFixed(4)), riposte:h._parryRiposte|0 }; },
  // Equivalent to sim.tryParry() — arms the window if the cooldown allows.
  parryPress(){ return tryParry(); },
  // Advance ONLY the parry timers by dt through the SAME tickParry the game loop uses.
  parryStep(dt){ const h=G.hero; if(!h) return null; tickParry(h,+dt||0); return this.parryState(); },
  // Drive a REAL melee hit (src = adjacent enemy) through damageHero. When `arm` the window is armed
  // first (inside ⇒ negate+counter); otherwise it's a normal hit (out-of-window no-op). Returns whether
  // the hit was negated, the counter damage dealt to the attacker, the hero HP delta, and post-state.
  parryMeleeProbe(arm){ const h=G.hero; if(!h) return null;
    this.parryReset(); h.hp=h.maxHp; G.enemies.length=0;
    const e=spawnEnemy("skeleton", h.x+30, h.y); if(!e) return null; e.hp=500; e.maxHp=500;
    if(arm){ h.parryT=PARRY.windowMs/1000; }
    const eHp0=e.hp, hHp0=h.hp; const ang=Math.atan2(h.y-e.y,h.x-e.x);
    const ret=damageHero(40, ang, null, e);
    const out={ negated:ret===false, enemyDmg:Math.round(eHp0-e.hp), heroDmg:Math.round(hHp0-h.hp),
      parryTAfter:+((h.parryT||0).toFixed(4)), riposteAfter:h._parryRiposte|0, knockApplied:!!(e.vx||e.vy) };
    G.enemies.length=0; return out; },
  // Drive a REAL RANGED hit (src=null) through damageHero with the window armed — must NOT be parried
  // (parry is melee-only: null src can't be caught). Returns negated + hero HP delta + window intact.
  parryRangedProbe(){ const h=G.hero; if(!h) return null;
    this.parryReset(); h.hp=h.maxHp; h.parryT=PARRY.windowMs/1000;
    const hHp0=h.hp; const ret=damageHero(40, 0, null, null);
    return { negated:ret===false, heroDmg:Math.round(hHp0-h.hp), parryTAfter:+((h.parryT||0).toFixed(4)) }; },
  // AC-riposte: prove the 1-hit riposte buff multiplies the NEXT hero hit by riposteMul, then is spent.
  // Fresh warrior (no crit) ⇒ hitEnemy consumes 0 srand, so the ratio is exact/deterministic.
  parryRiposteProbe(){ const h=G.hero; if(!h) return null;
    this.parryReset(); G.enemies.length=0; const e=spawnEnemy("skeleton", h.x+40, h.y); if(!e) return null;
    e.hp=1e7; e.maxHp=1e7; const b0=e.hp; hitEnemy(e,100,0); const base=b0-e.hp;      // no riposte
    h._parryRiposte=1; const b1=e.hp; hitEnemy(e,100,0); const boosted=b1-e.hp;        // riposte armed
    const riposteAfter=h._parryRiposte|0;
    const b2=e.hp; hitEnemy(e,100,0); const after=b2-e.hp;                             // spent ⇒ back to base
    G.enemies.length=0;
    return { base:Math.round(base), boosted:Math.round(boosted), after:Math.round(after),
      ratio:+(boosted/base).toFixed(4), riposteAfter, mul:PARRY.riposteMul }; },
  // AC-RNG-STRONG: fingerprint the gameplay srand around a run of REAL kills (drop RNG) with PARRY ON vs
  // OFF, FIRING a real parry-negation (+counter) in the middle. The parry opens NO stream and the counter
  // (fresh hero, no crit) consumes 0 srand, so the fingerprint is BYTE-IDENTICAL ON==OFF. 2*probeN draws.
  parrySrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const sav=PARRY.enabled; PARRY.enabled=!!enabled; const h=G.hero;
    if(h){ h.parryT=0; h.parryCD=0; h._parryRiposte=0; h.iframe=0; h.rolling=false; h.dead=false; if(h.hp<=0) h.hp=h.maxHp; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));            // pre-segment
    // fire a REAL parry-negation: arm the window, take a melee hit from an adjacent enemy
    G.enemies.length=0; const pe=spawnEnemy("skeleton",(h?h.x:0)+30,(h?h.y:0)); let parried=false;
    if(pe && h){ pe.hp=500; pe.maxHp=500; h.parryT=PARRY.windowMs/1000;
      parried=(damageHero(40,Math.atan2(h.y-pe.y,h.x-pe.x),null,pe)===false); }
    G.enemies.length=0;
    let kills=0; for(let i=0;i<6;i++){ const e=spawnEnemy("skeleton",(h?h.x:0)+40+i,(h?h.y:0)); if(e){ e.hp=0; killEnemy(e); kills++; } }
    G.enemies.length=0;
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                         // post-segment
    PARRY.enabled=sav;
    return { enabled:!!enabled, parried:(enabled?parried:false), kills, fingerprint:fp }; },
  // AC-SAVE: the parry run-state is NOT persisted. Serialize with hot parry fields vs a clean state:
  // bytes MUST match and NO parry key may appear; then loadSave → fields rehydrate at 0 (reset per run).
  parrySaveByteId(){ const h=G.hero; if(!h) return null;
    h.parryT=0; h.parryCD=0; h._parryRiposte=0; const cleanStr=JSON.stringify(serializeSave());
    h.parryT=0.15; h.parryCD=0.55; h._parryRiposte=1; const hotStr=JSON.stringify(serializeSave());
    const ok2=loadSave(JSON.parse(hotStr)); const h2=G.hero;
    return { byteId:cleanStr===hotStr, hasKey:/"_?parry[a-z]*":/i.test(hotStr),
      afterLoad:{ parryT:h2.parryT|0, parryCD:h2.parryCD|0, riposte:h2._parryRiposte|0 },
      cleanLen:cleanStr.length, hotLen:hotStr.length, loaded:!!ok2 }; },
  // --- CAS-1790 TELEGRAFÍA DE ATAQUE ENEMIGO (heavy wind-ups) harness hooks (tools/cas1790-telegraph.mjs); additive, drive the REAL paths ---
  // Static config off the data (no sim step): the single knob's live values.
  telegraphMeta(){ return { enabled:TELEGRAPH.enabled, leadMs:TELEGRAPH.leadMs, heavyOnly:TELEGRAPH.heavyOnly }; },
  // Master toggle: flip TELEGRAPH.enabled. Mirror of frenzyEnable/parry — the sim reads it live at windup entry.
  telegraphEnabled(){ return TELEGRAPH.enabled; },
  telegraphEnable(on){ TELEGRAPH.enabled=!!on; return { enabled:TELEGRAPH.enabled }; },
  // AC-floor + AC-cue for a PESADO: the native windup gets floored to ≥leadMs and the cosmetic cue + (for a
  // burst-armed boss) the ground mark spawn. Drives the REAL updateEnemies path.
  telegraphHeavyProbe(type){ const e=teleArmWindup(type||"orc", { elite:true });
    if(!e) return null;
    return { isHeavy:isHeavy(e), state:e.state, windupBefore:+(+e.tpl.windup||0).toFixed(4), windupAfter:+(+e.st||0).toFixed(4),
      floorS:+(TELEGRAPH.leadMs/1000).toFixed(4),
      cueSpawned:G.fx.some(f=>f.kind==="telegraphmark"&&!f.ground), markSpawned:G.fx.some(f=>f.kind==="telegraphmark"&&f.ground) }; },
  // AC-floor negative: a BASIC mob (not heavy) is EXACT — windup untouched (heavyOnly), no cue spawned.
  telegraphBasicProbe(type){ const e=teleArmWindup(type||"orc", null);
    if(!e) return null;
    return { isHeavy:isHeavy(e), state:e.state, windupBefore:+(+e.tpl.windup||0).toFixed(4), windupAfter:+(+e.st||0).toFixed(4),
      windupUnchanged:Math.abs((+e.st||0)-(+e.tpl.windup||0))<1e-9, cueSpawned:G.fx.some(f=>f.kind==="telegraphmark") }; },
  // AC-burst-neutral: an isBoss with phase pre-armed so the NEXT strike fires the ground-wave. Confirms a pre-warn
  // mark spawns at windup AND the burst still emits the SAME projectiles (count/kind/dmg) at the strike instant.
  telegraphBurstProbe(){ const e=teleArmWindup("orc", { isBoss:true, phase:1 });
    if(!e) return null;
    const markSpawned=G.fx.some(f=>f.kind==="telegraphmark"&&f.ground);
    const h=G.hero, R=Math.max(8,(e.tpl.range||40)-4);
    let steps=0; while(e.state==="windup" && steps++<200){ e.x=h.x+R; e.y=h.y; e.knockX=0; e.knockY=0; updateEnemies(1/60); }
    const runes=G.projectiles.filter(p=>p.kind==="rune"&&p.enemy);
    const out={ markSpawned, phaseAfter:e.phase, state:e.state, runeCount:runes.length,
      runeDmg:runes.length?runes[0].dmg:0, allRune:runes.every(p=>p.kind==="rune") };
    G.projectiles.length=0; G.enemies.length=0; G.fx.length=0; return out; },
  // AC-RNG-STRONG: fingerprint the gameplay srand around a REAL heavy wind-up FIRING (windup→strike,
  // boss ground-wave included), TELEGRAPH ON vs OFF. The cue rides addFx only (no srand, no seeded fxRng
  // draw), and the M1 floor is pure arithmetic, so the raw srand stream is BYTE-IDENTICAL ON==OFF while the
  // cue does/doesn't render. `fire=false` skips the injection to fingerprint a clean baseline: injection ON
  // == baseline proves the wind-up firing consumes 0 srand (not just "same as OFF"). The drive uses only a
  // single scripted boss (no loot kills), so the stream is fully deterministic across calls.
  telegraphSrandProbe(enabled, seedVal, probeN, fire){ probeN=Math.max(4,probeN|0);
    const sav=TELEGRAPH.enabled; TELEGRAPH.enabled=!!enabled; const h=G.hero;
    if(h){ h.dead=false; h.rolling=false; h.iframe=0; h.maxHp=1e6; h.hp=1e6; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));            // pre-segment
    let fired=false;
    if(fire!==false && h){ const e0=G.enemies.length, p0=G.projectiles.length, f0=G.fx.length;
      const e=spawnEnemy("orc", h.x+20, h.y);
      if(e){ e.maxHp=e.hp=1e9; e.isBoss=true; e.phase=1; e.state="chase"; const R=Math.max(8,(e.tpl.range||40)-4);
        let steps=0; while(steps++<200){ e.x=h.x+R; e.y=h.y; e.knockX=0; e.knockY=0; updateEnemies(1/60); if(e.state==="strike"){ fired=true; break; } }
      }
      G.enemies.length=e0; G.projectiles.length=p0; G.fx.length=f0; }
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                         // post-segment
    TELEGRAPH.enabled=sav;
    return { enabled:!!enabled, fired, fingerprint:fp }; },
  // --- CAS-1814 ESQUIVA RODANTE (dodge roll i-frames) harness hooks (tools/cas1814-dodge.mjs); additive, drive the REAL doRoll/damageHero paths ---
  dodgeMeta(){ return { enabled:DODGE.enabled, cooldownMs:DODGE.cooldownMs, iframeMs:DODGE.iframeMs, distance:DODGE.distance }; },
  dodgeEnabled(){ return DODGE.enabled; },
  dodgeEnable(on){ DODGE.enabled=!!on; return { enabled:DODGE.enabled }; },
  // Zero the transient roll run-state so a probe starts clean (mirror fresh newHero; rollSpd is new run-state).
  dodgeReset(){ const h=G.hero; if(!h) return null; h.rolling=false; h.rollT=0; h.rollCD=0; h.iframe=0; h.rollSpd=0; h._pdCD=0; h.riposte=0; h.dead=false; if(h.hp<=0) h.hp=h.maxHp; return this.dodgeState(); },
  dodgeState(){ const h=G.hero; if(!h) return null;
    return { enabled:DODGE.enabled, rolling:!!h.rolling, iframe:+((h.iframe||0).toFixed(4)), rollCD:+((h.rollCD||0).toFixed(4)), rollSpd:+((h.rollSpd||0).toFixed(4)) }; },
  // Fire the REAL doRoll(). rollAim=true forces the facing branch (no io.moveVec in the DOM-free harness).
  // force ⇒ clear rolling+cooldown first so the roll always fires; force=false respects the live cooldown
  // (used by the cooldown probe). Returns whether a roll is now active.
  _dodgeFire(force){ const h=G.hero; if(!h) return false; const sav=G.settings.rollAim; G.settings.rollAim=true;
    if(force!==false){ h.rolling=false; h.rollCD=0; } doRoll(); G.settings.rollAim=sav; return !!h.rolling; },
  // AC1/AC-derive: with DODGE ON the roll's iframe/cooldown/speed come from the knob band; OFF ⇒ CFG.roll* EXACT.
  // Fresh warrior (no bb.iframeAdd, no meta) ⇒ the sums are 0 so the raw params are directly observable.
  dodgeParamsProbe(enabled){ const sav=DODGE.enabled; DODGE.enabled=!!enabled; this.dodgeReset(); this._dodgeFire(true);
    const h=G.hero; const out={ enabled:!!enabled, iframe:+((h.iframe||0).toFixed(5)), rollCD:+((h.rollCD||0).toFixed(5)), rollSpd:+((h.rollSpd||0).toFixed(5)), rolling:!!h.rolling,
      cfg:{ rollIFrame:CFG.rollIFrame, rollCD:CFG.rollCD, rollSpeed:CFG.rollSpeed }, knob:{ iframe:+((DODGE.iframeMs/1000).toFixed(5)), cd:+((DODGE.cooldownMs/1000).toFixed(5)), spd:+((DODGE.distance/CFG.rollTime).toFixed(5)) } };
    DODGE.enabled=sav; this.dodgeReset(); return out; },
  // AC3-melee: a roll's i-frame negates a REAL melee hit (src=enemy). Baseline (no roll) lands for contrast.
  dodgeMeleeProbe(){ const h=G.hero; if(!h) return null; this.dodgeReset(); G.enemies.length=0;
    const e=spawnEnemy("skeleton", h.x+30, h.y); if(!e) return null; e.hp=500; e.maxHp=500; const ang=Math.atan2(h.y-e.y,h.x-e.x);
    h.hp=h.maxHp; const b0=h.hp; const baseRet=damageHero(40, ang, null, e); const heroDmgBase=Math.round(b0-h.hp);
    this.dodgeReset(); h.hp=h.maxHp; this._dodgeFire(true); const r0=h.hp; const ret=damageHero(40, ang, null, e); const heroDmg=Math.round(r0-h.hp);
    const out={ heroDmgBase, baseNegated:baseRet===false, rolling:!!h.rolling, iframe:+((h.iframe||0).toFixed(3)), negated:ret===false, heroDmg };
    G.enemies.length=0; this.dodgeReset(); return out; },
  // AC3-ranged: the SAME i-frame choke negates a projectile (src=null) — ranged evasion is free (universal i-frame).
  dodgeRangedProbe(){ const h=G.hero; if(!h) return null; this.dodgeReset(); G.enemies.length=0;
    h.hp=h.maxHp; const b0=h.hp; const baseRet=damageHero(40, 0, null, null); const heroDmgBase=Math.round(b0-h.hp);
    this.dodgeReset(); h.hp=h.maxHp; this._dodgeFire(true); const r0=h.hp; const ret=damageHero(40, 0, null, null); const heroDmg=Math.round(r0-h.hp);
    const out={ heroDmgBase, baseNegated:baseRet===false, rolling:!!h.rolling, iframe:+((h.iframe||0).toFixed(3)), negated:ret===false, heroDmg };
    this.dodgeReset(); return out; },
  // AC4: a second roll INSIDE the cooldown is a no-op; after the cooldown drains it re-arms. cd reads the knob band.
  dodgeCooldownProbe(){ const h=G.hero; if(!h) return null; const sav=DODGE.enabled; DODGE.enabled=true; this.dodgeReset();
    const armed1=this._dodgeFire(true); const cd=+((h.rollCD||0).toFixed(4));   // first roll fires + sets cooldown
    h.rolling=false; h.rollT=0;                                                  // roll movement ended, cooldown persists
    const armed2=this._dodgeFire(false);                                         // second attempt inside CD ⇒ blocked
    h.rollCD=0; const armed3=this._dodgeFire(false);                             // cooldown drained ⇒ re-arms
    DODGE.enabled=sav; this.dodgeReset();
    return { armed1, cd, blockedInCD:armed2===false, rearmed:armed3===true, cooldownMs:DODGE.cooldownMs }; },
  // AC-RNG-STRONG: fingerprint the gameplay srand around a REAL roll FIRING (+ a negated hit) and a run of loot
  // kills, DODGE ON vs OFF. The roll/i-frame path opens NO srand stream (timing only), so the stream is
  // BYTE-IDENTICAL ON==OFF even though the roll actually fires and negates a hit. 2*probeN draws.
  dodgeSrandProbe(enabled, seedVal, probeN, fire){ probeN=Math.max(4,probeN|0);
    const sav=DODGE.enabled; DODGE.enabled=!!enabled; const h=G.hero;
    if(h){ h.rolling=false; h.rollT=0; h.rollCD=0; h.iframe=0; h.rollSpd=0; h._pdCD=0; h.riposte=0; h.dead=false; if(h.hp<=0) h.hp=h.maxHp; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));            // pre-segment
    let fired=false;
    if(fire!==false && h){ G.enemies.length=0; const e=spawnEnemy("skeleton",h.x+30,h.y);
      if(e){ e.hp=500; e.maxHp=500; this._dodgeFire(true); fired=(damageHero(40,Math.atan2(h.y-e.y,h.x-e.x),null,e)===false && h.rolling); }
      G.enemies.length=0;
      for(let i=0;i<6;i++){ const k=spawnEnemy("skeleton",h.x+40+i,h.y); if(k){ k.hp=0; killEnemy(k); } }
      G.enemies.length=0; }
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                         // post-segment
    DODGE.enabled=sav;
    return { enabled:!!enabled, fired:(enabled?fired:fired), fingerprint:fp }; },
  // AC6: the roll run-state (incl. the new rollSpd) is NEVER serialized. Hot roll fields ⇒ SAME save.v1 bytes as a
  // clean state, no roll/dodge key; and DODGE ON vs OFF ⇒ byte-identical save. Mirror of parrySaveByteId.
  dodgeSaveByteId(){ const h=G.hero; if(!h) return null; const sav=DODGE.enabled;
    DODGE.enabled=false; h.rolling=false; h.rollT=0; h.rollCD=0; h.iframe=0; h.rollSpd=0; const offStr=JSON.stringify(serializeSave());
    DODGE.enabled=true; h.rolling=true; h.rollT=0.2; h.rollCD=0.9; h.iframe=0.28; h.rollSpd=460; const onStr=JSON.stringify(serializeSave());
    DODGE.enabled=sav; h.rolling=false; h.rollT=0; h.rollCD=0; h.iframe=0; h.rollSpd=0;
    return { byteId:offStr===onStr, hasKey:/"(_?roll[a-zA-Z]*|dodge[a-z]*)":/i.test(onStr), offLen:offStr.length, onLen:onStr.length }; },
  // AC-SAVE: telegraph is presentation + transient (e.st + fx), NEVER serialized. Serialize with the knob ON vs
  // a clean HEAD-style state and assert byte-identity + NO telegraph key. Mirror of parrySaveByteId.
  telegraphSaveByteId(){ const sav=TELEGRAPH.enabled;
    TELEGRAPH.enabled=false; const offStr=JSON.stringify(serializeSave());
    TELEGRAPH.enabled=true;  const onStr=JSON.stringify(serializeSave());
    TELEGRAPH.enabled=sav;
    return { byteId:offStr===onStr, hasKey:/"?telegraph"?:/i.test(onStr), offLen:offStr.length, onLen:onStr.length }; },
  // --- CAS-1819/1820 HABILIDADES ESPECIALES TELEGRAFIADAS (enemy abilities) harness hooks (tools/cas1819-abilities.mjs); additive, drive the REAL updateEnemies/damageHero paths ---
  // Static config off the data (no sim step): the single knob's live values.
  abilityMeta(){ return { enabled:ENEMY_ABILITIES.enabled, lunge:ENEMY_ABILITIES.lunge, slam:ENEMY_ABILITIES.slam }; },
  abilityEnabled(){ return ENEMY_ABILITIES.enabled; },
  abilityEnable(on){ ENEMY_ABILITIES.enabled=!!on; return { enabled:ENEMY_ABILITIES.enabled }; },
  // Spawn `type` as an ambush-style ÉLITE and mount its archetype ability (gated on the live knob).
  _abilityArm(type){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; if(!h) return null; h.dead=false; h.rolling=false; h.iframe=0; h.parryT=0; h.parryCD=0; h.maxHp=1e6; h.hp=1e6; h.cls="warrior";
    const e=spawnEnemy(type, h.x+20, h.y); if(!e) return null;
    e.maxHp=e.hp=1e9; e.elite=true; e.state="chase";
    if(ENEMY_ABILITIES.enabled) armAbility(e);
    return e; },
  // Align the cadence so the NEXT committed attack is the special, then drive the REAL AI chase→windup→strike.
  // Returns the enemy parked at the strike instant (slam shards already emitted; lunge not yet dashed).
  _abilityToStrike(e){ const h=G.hero; if(!e||!h||!e.special) return e;
    e.atkCount=e.special.every-1; const R=Math.max(8,(e.tpl.range||40)-4);
    let steps=0; while(e.state!=="strike" && steps++<400){ e.x=h.x+R; e.y=h.y; e.knockX=0; e.knockY=0; updateEnemies(1/60); if(e.hp<=0) break; }
    return e; },
  _abilityResetHero(){ const h=G.hero; if(!h) return; h.iframe=0; h.rolling=false; h.parryT=0; h.parryCD=0; h._parryRiposte=0; h.dead=false; h.hp=h.maxHp; },
  // AC-assign: armAbility maps a rusher-family élite → A1 lunge, a brute-family élite → A2 slam, and any
  // OTHER archetype → NO special; with the knob OFF nothing is ever assigned (byte-identical spawn).
  abilityAssignProbe(){ const sav=ENEMY_ABILITIES.enabled; ENEMY_ABILITIES.enabled=true; const h=G.hero; const out={};
    const mk=(type)=>{ if(!h) return null; const e0=G.enemies.length; const e=spawnEnemy(type,h.x+20,h.y); if(!e) return null; e.elite=true; armAbility(e);
      const r={ arch:e.tpl.arch, hasLunge:!!(e.special&&e.special.lunge), hasSlam:!!(e.special&&e.special.slam),
        every:e.special?e.special.every:0, dmg:e.special?(e.special.lunge?e.special.lunge.dmg:e.special.slam.dmg):0 }; G.enemies.length=e0; return r; };
    out.rusher=mk("wolf"); out.brute=mk("orc"); out.caster=mk("mage");
    ENEMY_ABILITIES.enabled=false; if(h){ const e0=G.enemies.length; const e=spawnEnemy("wolf",h.x+20,h.y); if(e){ e.elite=true; if(ENEMY_ABILITIES.enabled) armAbility(e); out.offRusher={ arch:e.tpl.arch, hasSpecial:!!e.special }; } G.enemies.length=e0; }
    ENEMY_ABILITIES.enabled=sav; return out; },
  // AC-A1: drive a rusher élite to its telegraphed LUNGE. Proves the directional tell + heavy ring spawn, and
  // the contact routes through damageHero with src=e ⇒ PARABLE (KeyH) and EVADIBLE by dash i-frames.
  abilityLungeProbe(){ const sav=ENEMY_ABILITIES.enabled; ENEMY_ABILITIES.enabled=true;
    const e=this._abilityArm("wolf"); if(!e){ ENEMY_ABILITIES.enabled=sav; return null; }
    const hasLunge=!!(e.special && e.special.lunge); this._abilityToStrike(e);
    const laneTell=G.fx.some(f=>f.kind==="telegraphline"), heavyRing=G.fx.some(f=>f.kind==="telegraphmark"&&!f.ground);
    const h=G.hero, L=e.special.lunge, ang=Math.atan2(h.y-e.y,h.x-e.x); e.hp=1e9;
    // BASELINE: the contact lands (real damageHero, src=e).
    this._abilityResetHero(); const b0=h.hp; const baseRet=damageHero(L.dmg,ang,L.infl,e); const landed=Math.round(b0-h.hp);
    // DODGE: a roll i-frame negates the SAME contact (src=e evadible por i-frames).
    this._abilityResetHero(); h.iframe=0.3; h.rolling=true; const i0=h.hp; const iRet=damageHero(L.dmg,ang,L.infl,e); const iframeDmg=Math.round(i0-h.hp);
    // PARRY: a live parry window negates it + fires a counter (src=e ⇒ PARABLE).
    const savP=PARRY.enabled; PARRY.enabled=true; this._abilityResetHero(); h.parryT=PARRY.windowMs/1000; const eh0=e.hp; const p0=h.hp;
    const pRet=damageHero(L.dmg,ang,L.infl,e); const parryDmg=Math.round(p0-h.hp); const countered=e.hp<eh0; PARRY.enabled=savP;
    ENEMY_ABILITIES.enabled=sav;
    return { hasLunge, laneTell, heavyRing, dmg:L.dmg, landed, baseLanded:baseRet===true,
      negatedByIframe:iRet===false&&iframeDmg===0, negatedByParry:pRet===false&&parryDmg===0, countered }; },
  // AC-A2: drive a brute élite to its telegraphed radial SLAM. Proves the shards emit (count from config),
  // the ground ring radius comes from the knob, shards are src=null ⇒ NOT parryable but EVADIBLE by i-frames.
  abilitySlamProbe(){ const sav=ENEMY_ABILITIES.enabled; ENEMY_ABILITIES.enabled=true;
    const e=this._abilityArm("orc"); if(!e){ ENEMY_ABILITIES.enabled=sav; return null; }
    const hasSlam=!!(e.special && e.special.slam), S=e.special.slam; this._abilityToStrike(e);
    const shards=G.projectiles.filter(p=>p.enemy && p.kind==="rune");
    const gm=G.fx.find(f=>f.kind==="telegraphmark"&&f.ground); const ringRadius=gm?Math.round(gm.r):0;
    const srcNull=shards.every(p=>p.src===undefined);   // slam projectiles carry no src ⇒ damageHero(...,null)
    const h=G.hero;
    // baseline: a shard-equivalent lands (src=null path).
    this._abilityResetHero(); const b0=h.hp; const baseRet=damageHero(S.dmg,0,null); const landed=Math.round(b0-h.hp);
    // DODGE: an i-frame negates the shard (universal choke).
    this._abilityResetHero(); h.iframe=0.3; h.rolling=true; const i0=h.hp; const iRet=damageHero(S.dmg,0,null); const iframeDmg=Math.round(i0-h.hp);
    // PARRY: does NOT catch a shard (src=null) ⇒ still lands (proves ranged shards are not parryable).
    const savP=PARRY.enabled; PARRY.enabled=true; this._abilityResetHero(); h.parryT=PARRY.windowMs/1000; const p0=h.hp; const pRet=damageHero(S.dmg,0,null); const parryDmg=Math.round(p0-h.hp); PARRY.enabled=savP;
    ENEMY_ABILITIES.enabled=sav;
    return { hasSlam, shardCount:shards.length, expectShards:S.count, ringRadius, cfgRadius:ENEMY_ABILITIES.slam.radius,
      srcNull, landed, negatedByIframe:iRet===false&&iframeDmg===0, notParryable:pRet===true&&parryDmg>0 }; },
  // AC-RNG-STRONG: fingerprint the gameplay srand around REAL ability FIRINGS (A1 lunge + A2 slam), ENEMY_ABILITIES
  // ON vs OFF. Assignment is pure data and the specials are cadence-deterministic (no srand, any variance only from
  // abilityRng), so the shared srand stream is BYTE-IDENTICAL ON==OFF while the abilities do/don't fire. Both branches
  // spawn the SAME enemies (only the assignment/firing differs), so the draw sequence is identical. 2*probeN draws.
  abilitySrandProbe(enabled, seedVal, probeN, fire){ probeN=Math.max(4,probeN|0);
    const sav=ENEMY_ABILITIES.enabled; ENEMY_ABILITIES.enabled=!!enabled; const h=G.hero;
    if(h){ h.dead=false; h.rolling=false; h.iframe=0; h.parryT=0; h.maxHp=1e6; h.hp=1e6; h.cls="warrior"; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));            // pre-segment
    let lungeFired=false, slamFired=false;
    if(fire!==false && h){ const e0=G.enemies.length, p0=G.projectiles.length, f0=G.fx.length;
      const eL=this._abilityArm("wolf"); if(eL){ this._abilityToStrike(eL);
        if(eL.special && eL.special.lunge){ eL.x=h.x+eL.tpl.size*0.5; eL.y=h.y; eL.hitDone=false; h.hp=h.maxHp; const hpL=h.hp; updateEnemies(1/60); lungeFired=(eL.hitDone||h.hp<hpL); } }
      const eS=this._abilityArm("orc"); if(eS){ this._abilityToStrike(eS); slamFired=G.projectiles.some(p=>p.enemy&&p.kind==="rune"); }
      G.enemies.length=e0; G.projectiles.length=p0; G.fx.length=f0; }
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                         // post-segment
    ENEMY_ABILITIES.enabled=sav;
    return { enabled:!!enabled, lungeFired:(enabled?lungeFired:false), slamFired:(enabled?slamFired:false), fingerprint:fp }; },
  // AC-SAVE: e.special is transient enemy run-state, never serialized. Mount a hot ability on a live élite and
  // toggle the knob: save.v1 bytes are byte-identical ON/OFF and carry NO ability key. Mirror of telegraphSaveByteId.
  abilitySaveByteId(){ const sav=ENEMY_ABILITIES.enabled; const h=G.hero;
    ENEMY_ABILITIES.enabled=false; const offStr=JSON.stringify(serializeSave());
    ENEMY_ABILITIES.enabled=true; let hot=false; const e0=G.enemies.length;
    if(h){ const e=spawnEnemy("wolf", h.x+20, h.y); if(e){ e.elite=true; armAbility(e); e.atkCount=e.special?e.special.every-1:0; e.specialNow=true; hot=!!(e.special&&e.special.lunge); } }
    const onStr=JSON.stringify(serializeSave()); G.enemies.length=e0; ENEMY_ABILITIES.enabled=sav;
    return { byteId:offStr===onStr, hotSpecial:hot, hasKey:/"?(lunge|abilit)[a-z]*"?:/i.test(onStr), offLen:offStr.length, onLen:onStr.length }; },
  // --- CAS-1826 ATURDIMIENTO POR POSTURA (Poise / Stagger) harness hooks (tools/cas1826-poise.mjs); additive, drive the REAL hitEnemy/updateEnemies/damageHero paths ---
  // Static config off the data (no sim step): the single knob's live values.
  poiseMeta(){ return { enabled:POISE.enabled, gain:POISE.gain, decayDelay:POISE.decayDelay, decayRate:POISE.decayRate,
    reStaggerCD:POISE.reStaggerCD, elite:POISE.elite, boss:POISE.boss }; },
  poiseEnabled(){ return POISE.enabled; },
  poiseEnable(on){ POISE.enabled=!!on; return { enabled:POISE.enabled }; },
  // Spawn `type` as an ambush-style ÉLITE (or boss) with its postura ceiling resolved. Clears the arena so the
  // probe starts clean; the hero is a fresh warrior (no crit/talents ⇒ hitEnemy draws 0 srand).
  _poiseArm(type,boss){ G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; if(!h) return null; h.dead=false; h.rolling=false; h.iframe=0; h.parryT=0; h.parryCD=0; h._parryRiposte=0; h.maxHp=1e6; h.hp=1e6; h.cls="warrior"; h.tt=zeroTT(); h.mperk=null; h.bb=null;
    const e=spawnEnemy(type||"wolf", h.x+30, h.y); if(!e) return null;
    e.maxHp=e.hp=1e9; if(boss){ e.isBoss=true; } else { e.elite=true; } e.state="chase";
    e.poise=0; e.poiseMax=poiseCeil(e); e.staggerT=0; e.staggerCD=0; e._poiseDecayT=0; return e; },
  // AC3: N light hits FILL postura → cross poiseMax → BREAK (e.stun + e.staggerT set, poise reset) → the AI freezes
  // (existing stun gate: no chase, not attacking) → a hit inside the window lands ×bonusDmg. Drives the REAL paths.
  poiseAccrueProbe(){ const sav=POISE.enabled; POISE.enabled=true; const h=G.hero;
    const e=this._poiseArm("wolf"); if(!e){ POISE.enabled=sav; return null; }
    const max=e.poiseMax, per=POISE.gain.light; let hits=0;
    for(let i=0;i<60 && e.staggerT<=0;i++){ e.hp=1e9; hitEnemy(e,5,0); hits++; }
    const stunned=e.stun>0, staggered=e.staggerT>0, poiseReset=e.poise===0;
    // IA frozen: place the enemy far from the hero, zero any residual knockback (the stun gate intentionally lets
    // knockback ride out — we isolate the AI), advance one frame; the stun gate must skip chase + attack entirely.
    e.x=h.x+240; e.y=h.y; e.knockX=0; e.knockY=0; const x0=e.x, y0=e.y; updateEnemies(1/60);
    const frozen=(Math.abs(e.x-x0)<1e-6 && Math.abs(e.y-y0)<1e-6 && e.state!=="windup" && e.state!=="strike");
    // bonus dmg INSIDE the window vs a fresh (un-staggered) baseline
    e.x=h.x+30; e.hp=1e9; const b0=e.hp; hitEnemy(e,100,0); const staggerDmg=b0-e.hp;
    const e2=this._poiseArm("wolf"); e2.hp=1e9; const c0=e2.hp; hitEnemy(e2,100,0); const baseDmg=c0-e2.hp;
    const out={ max, per, hits, expectHits:Math.ceil(max/per), stunned, staggered, poiseReset, frozen,
      baseDmg:Math.round(baseDmg), staggerDmg:Math.round(staggerDmg), ratio:+(staggerDmg/baseDmg).toFixed(3), bonusDmg:POISE.elite.bonusDmg };
    G.enemies.length=0; POISE.enabled=sav; return out; },
  // AC6: the boss profile has a HIGHER ceiling, SHORTER stun, and BIGGER bonus-dmg than an élite (climax opening).
  poiseTierProbe(){ const sav=POISE.enabled; POISE.enabled=true;
    const el=this._poiseArm("wolf",false), elMax=el?el.poiseMax:0;
    const bo=this._poiseArm("wolf",true), boMax=bo?bo.poiseMax:0; G.enemies.length=0; POISE.enabled=sav;
    return { eliteMax:elMax, bossMax:boMax, eliteDur:POISE.elite.dur, bossDur:POISE.boss.dur,
      eliteBonus:POISE.elite.bonusDmg, bossBonus:POISE.boss.bonusDmg,
      maxHigher:boMax>elMax, durShorter:POISE.boss.dur<POISE.elite.dur, bonusHigher:POISE.boss.bonusDmg>POISE.elite.bonusDmg }; },
  // AC4: partial postura (below max) DECAYS after decayDelay of no hits — a missed combo doesn't bank forever.
  poiseDecayProbe(){ const sav=POISE.enabled; POISE.enabled=true; const e=this._poiseArm("wolf");
    if(!e){ POISE.enabled=sav; return null; }
    e.hp=1e9; hitEnemy(e,5,0); hitEnemy(e,5,0); const built=e.poise;    // partial, well below max
    const steps=Math.ceil((POISE.decayDelay+1.0)*60); for(let i=0;i<steps;i++){ e.x=1e5; updateEnemies(1/60); }
    const afterDelay=e.poise;
    const out={ built:+built.toFixed(2), afterDelay:+afterDelay.toFixed(2), decayed:afterDelay<built-1e-6, decayRate:POISE.decayRate, decayDelay:POISE.decayDelay };
    G.enemies.length=0; POISE.enabled=sav; return out; },
  // AC5: after a stagger there's a re-stagger COOLDOWN — postura won't re-accrue until it drains (no infinite lock).
  poiseReStaggerProbe(){ const sav=POISE.enabled; POISE.enabled=true; const h=G.hero; const e=this._poiseArm("wolf");
    if(!e){ POISE.enabled=sav; return null; }
    for(let i=0;i<60 && e.staggerT<=0;i++){ e.hp=1e9; hitEnemy(e,5,0); }
    const broke=e.staggerT>0, cd0=e.staggerCD;
    let g=0; while(e.staggerT>0 && g++<600){ e.x=1e5; updateEnemies(1/60); }               // let the window expire (CD still runs)
    const cdAfterWindow=e.staggerCD;
    e.x=(h?h.x:0)+30; const p0=e.poise; e.hp=1e9; hitEnemy(e,5,0); const blockedInCD=(e.poise===p0);   // inside CD ⇒ no accrual
    e.staggerCD=0; const p1=e.poise; hitEnemy(e,5,0); const reAccrues=(e.poise>p1);                     // CD drained ⇒ re-accrues
    const out={ broke, cd0:+cd0.toFixed(2), cdAfterWindow:+cdAfterWindow.toFixed(2), cdStillActive:cdAfterWindow>0, blockedInCD, reAccrues, reStaggerCD:POISE.reStaggerCD };
    G.enemies.length=0; POISE.enabled=sav; return out; },
  // AC7: a successful PARRY pulses gain.parry; punishing a live TELEGRAPH (e.st>0) adds gain.telegraphPunish on top of a light hit.
  poiseSynergyProbe(){ const sav=POISE.enabled, savT=TELEGRAPH.enabled; POISE.enabled=true; const h=G.hero;
    // parry pulse: arm the window, take a melee hit from an élite ⇒ negated + postura pulse (counter routes noPoise ⇒ pulse is the sole source)
    const pe=this._poiseArm("skeleton"); pe.hp=1e9; const before=pe.poise;
    h.parryT=PARRY.windowMs/1000; const parried=(damageHero(30,Math.atan2(h.y-pe.y,h.x-pe.x),null,pe)===false); const parryGain=pe.poise-before;
    // telegraph punish vs plain baseline
    TELEGRAPH.enabled=true; const e2=this._poiseArm("wolf"); e2.st=0.3; const b2=e2.poise; e2.hp=1e9; hitEnemy(e2,5,0); const punishGain=e2.poise-b2;
    const e3=this._poiseArm("wolf"); e3.st=0; const b3=e3.poise; e3.hp=1e9; hitEnemy(e3,5,0); const plainGain=e3.poise-b3;
    const out={ parried, parryGain:+parryGain.toFixed(2), expectParry:POISE.gain.parry,
      punishGain:+punishGain.toFixed(2), plainGain:+plainGain.toFixed(2), telegraphPunish:POISE.gain.telegraphPunish,
      parryOk:parried && parryGain===POISE.gain.parry, punishOk:(punishGain-plainGain)===POISE.gain.telegraphPunish };
    G.enemies.length=0; POISE.enabled=sav; TELEGRAPH.enabled=savT; return out; },
  // AC-tier(gain): opt.heavy / opt.ultimate carry MORE postura than a light hit (light < heavy < ultimate).
  poiseGainTierProbe(){ const sav=POISE.enabled; POISE.enabled=true;
    const measure=(opt)=>{ const e=this._poiseArm("wolf"); e.hp=1e9; const b=e.poise; hitEnemy(e,5,0,opt); return e.poise-b; };
    const light=measure(undefined), heavy=measure({heavy:true}), ult=measure({ultimate:true});
    G.enemies.length=0; POISE.enabled=sav;
    return { light, heavy, ultimate:ult, gain:POISE.gain, ordered:(light<heavy && heavy<ult) }; },
  // AC2 RNG-STRONG: fingerprint the gameplay srand around a REAL postura FILL→BREAK (+ a bonus-dmg hit inside the
  // window) and a run of loot kills, POISE ON vs OFF. Postura is pure arithmetic (no poiseRng) so the stagger fires
  // (staggerFired=true on ON) while the srand stream stays BYTE-IDENTICAL ON==OFF. 2*probeN draws around the firing.
  poiseSrandProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const sav=POISE.enabled; POISE.enabled=!!enabled; const h=G.hero;
    if(h){ h.dead=false; h.rolling=false; h.iframe=0; h.parryT=0; h.maxHp=1e6; h.hp=1e6; h.cls="warrior"; h.tt=zeroTT(); h.mperk=null; h.bb=null; }
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));            // pre-segment
    let staggerFired=false;
    { const e0=G.enemies.length;
      const e=spawnEnemy("wolf",(h?h.x:0)+30,(h?h.y:0));
      if(e){ e.elite=true; e.hp=1e9; e.poiseMax=poiseCeil(e);
        for(let i=0;i<60 && e.staggerT<=0;i++){ e.hp=1e9; hitEnemy(e,5,0); }               // FILL → BREAK
        staggerFired=e.staggerT>0;
        e.hp=1e9; hitEnemy(e,50,0);                                                        // a hit INSIDE the window (bonus-dmg path)
      }
      G.enemies.length=e0;
      for(let i=0;i<3;i++){ const k=spawnEnemy("skeleton",(h?h.x:0)+60+i,(h?h.y:0)); if(k){ k.hp=0; killEnemy(k); } } // shared loot stream stays aligned
      G.enemies.length=e0; }
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                         // post-segment
    POISE.enabled=sav;
    return { enabled:!!enabled, staggerFired:(enabled?staggerFired:false), fingerprint:fp }; },
  // AC1/AC8 SAVE: the 5 postura fields are transient enemy run-state — G.enemies is NEVER serialized. A live élite
  // with HOT postura ⇒ save.v1 byte-identical ON/OFF and carries NO poise/stagger key. Mirror of abilitySaveByteId.
  poiseSaveByteId(){ const sav=POISE.enabled; const h=G.hero;
    POISE.enabled=false; G.enemies.length=0; const offStr=JSON.stringify(serializeSave());
    POISE.enabled=true; let hot=false; const e0=G.enemies.length;
    if(h){ const e=spawnEnemy("wolf", h.x+30, h.y); if(e){ e.elite=true; e.poiseMax=poiseCeil(e); e.poise=e.poiseMax*0.6; e.staggerT=1.2; e.staggerCD=3.0; e._poiseDecayT=0.4; hot=true; } }
    const onStr=JSON.stringify(serializeSave()); G.enemies.length=e0; POISE.enabled=sav;
    return { byteId:offStr===onStr, hotPoise:hot, hasKey:/"_?(poise|stagger)[a-zA-Z]*":/i.test(onStr), offLen:offStr.length, onLen:onStr.length }; },
  // --- CAS-1659 HABILIDAD DEFINITIVA (Ultimate) harness hooks (tools/cas1659-ultimate.mjs); additive, drive the REAL paths ---
  // Static config off the data (no sim step): the 4 ultimates, the offer size, the live draft rate.
  ultMeta(){ return { offerN:ULT_OFFER_N, liveRate:ultRate, perDmg:ULT_CHARGE_PER_DMG, perKill:ULT_CHARGE_PER_KILL,
    ults:ULTIMATES.map(u=>({id:u.id,name:u.name,glyph:u.glyph,type:u.type,heal:u.heal||0,jumps:u.jumps||0,range:u.range||0})) }; },
  // Live meter read: drafted id, normalized charge, and whether it's ready to unleash.
  ultimateState(){ const h=G.hero; if(!h) return null;
    return { id:h.ultId||null, charge:+((h.ultCharge||0).toFixed(4)), ready:!!(h.ultId && (h.ultCharge||0)>=1) }; },
  // Force a drafted ultimate for the run (QA: verify each effect). Resets the meter.
  setUltId(id){ return chooseUltimate(id); },
  // Fill the meter to full (QA: verify unleash + consume). No-op without a drafted ultimate.
  fillUltimate(){ const h=G.hero; if(!h) return null; if(h.ultId) h.ultCharge=1; return this.ultimateState(); },
  // RNG-neutrality seam: scale/neutralize the run-start offer roll (0 → no offer). The offer draws
  // from the dedicated ultRng stream, so the shared srand is byte-identical at ANY rate. Mirror of setLegRate/setSetRate.
  setUltRate(x){ ultRate=(x==null)?1:Math.max(0,+x||0); return ultRate; },
  // Draw a run-start offer through the REAL ultRng path (consumes ONLY ultRng, never srand).
  ultOffer(){ return openUltimateOffer(); },
  // Unleash through the REAL castUltimate path; report whether it fired + the resulting meter.
  castUltimate(){ const fired=castUltimate(); return { fired, state:this.ultimateState() }; },
  // AC2: fill → cast → assert an effect landed. Enemy: nova/field/chain damage; buff: hero heal/def.
  // Spawns a fresh dummy in range, fills, casts, and reports enemy HP delta + hero heal/def + meter.
  ultCastProbe(id){ const h=G.hero; if(!h) return null;
    chooseUltimate(id); if(!h.ultId) return { id:null };
    // clear any live buff sink so the def-buff delta reads clean (applyBuff SWAPS same-stat buffs).
    if(h.defBuffT>0){ h.defBonus-=h.defBuffAmt; h.defBuffT=0; h.defBuffAmt=0; }
    if(h.dmgBuffT>0){ h.dmgBonus-=h.dmgBuffAmt; h.dmgBuffT=0; h.dmgBuffAmt=0; }
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0;
    const e=spawnEnemy("skeleton", h.x+40, h.y); if(e){ e.hp=1e9; e.maxHp=1e9; }
    const sp=ULTIMATE_MAP[h.ultId]||{};
    h.maxHp=Math.max(h.maxHp,1000); h.hp=Math.max(1,h.hp-300); const hp0=h.hp, def0=h.defBonus||0, ehp0=e?e.hp:0;
    h.ultCharge=1; const fired=castUltimate();
    // fields deal an immediate plant tick; give one more update for the DoT to register too.
    if(sp.type==="field") update(16);
    const eDelta=e?Math.round(ehp0-e.hp):0, heal=Math.round(h.hp-hp0), defUp=(h.defBonus||0)-def0;
    return { id:h.ultId, type:sp.type, fired, chargeAfter:+((h.ultCharge||0).toFixed(4)),
      enemyDamage:eDelta, heroHeal:heal, defBuff:defUp, fields:G.fields.length }; },
  // Persistence probe: draft an ultimate + set a partial charge, serialize→load through the REAL save
  // path, report survival (AC5: drafted ultimate persists; a pre-ultimate save loads clean → null).
  ultPersist(id, charge){ const h=G.hero; if(!h) return null;
    chooseUltimate(id); h.ultCharge=Math.max(0,Math.min(1,+charge||0));
    const before={ id:h.ultId||null, charge:+((h.ultCharge||0).toFixed(4)) };
    const blob=JSON.parse(JSON.stringify(serializeSave())); const ok=loadSave(blob); const h2=G.hero;
    return { ok, before, after:{ id:h2.ultId||null, charge:+((h2.ultCharge||0).toFixed(4)) } }; },
  // AC5b: a pre-ultimate save (blob with no `ult` key) loads clean → ultId null (RNG-neutral baseline).
  ultLoadLegacy(){ const blob=JSON.parse(JSON.stringify(serializeSave())); delete blob.ult; delete blob.ultCharge;
    const ok=loadSave(blob); return { ok, id:G.hero.ultId||null, charge:G.hero.ultCharge||0 }; },
  // AC4 [AC-RNG-STRONG]: run the SAME forced spawn-hit-kill loot sequence with vs without a drafted
  // ultimate. Charge accrues (hitEnemy/killEnemy) ONLY when ultId is set, but that's pure arithmetic —
  // so the srand-driven loot stream MUST be byte-identical. Proves the gated charge math + dedicated
  // ultRng never perturb the shared authoritative stream. Returns the drop stream + the charge reached.
  ultChargeStream(n, seedVal, ultId){ if(seedVal!=null) seed(seedVal); n=Math.max(1,n|0);
    const h=G.hero, savedU=h.ultId, savedC=h.ultCharge;
    h.ultId=(ultId && ULTIMATE_MAP[ultId])?ultId:null; h.ultCharge=0;
    const out=[];
    for(let i=0;i<n;i++){ const before=G.drops.length; const e=spawnEnemy("skeleton",-8600-i,-8600); if(!e) continue;
      e.hp=40; e.maxHp=40; hitEnemy(e, 40, Math.PI);              // REAL damage path → charge accrues if ultId (arithmetic)
      if(!e.dead){ e.hp=0; killEnemy(e); }                        // ensure the kill (loot rolls on srand) fires exactly once
      for(const d of G.drops.slice(before)) out.push({kind:d.kind, rarity:d.rarity||null, tier:d.tier||0, uniq:(d.inst&&d.inst.uniq)||null, set:(d.inst&&d.inst.set)||null}); }
    const charge=+((h.ultCharge||0).toFixed(4)); h.ultId=savedU; h.ultCharge=savedC;
    return { stream:out, charge }; },
  // Draw K offers from ultRng, then a loot stream on srand — proves drawing offers doesn't shift srand
  // (feature-ON draft vs OFF baseline). Mirror of the set/leg append-only proof.
  ultDraftNeutral(draws, n, seedVal){ if(seedVal!=null) seed(seedVal); draws=Math.max(0,draws|0); n=Math.max(1,n|0);
    for(let k=0;k<draws;k++) rollUltimateOffer();               // consume ultRng ONLY (never srand)
    const out=[];
    for(let i=0;i<n;i++){ const before=G.drops.length; const e=spawnEnemy("skeleton",-8800-i,-8800); if(!e) continue;
      e.hp=0; killEnemy(e);
      for(const d of G.drops.slice(before)) out.push({kind:d.kind, rarity:d.rarity||null, tier:d.tier||0, uniq:(d.inst&&d.inst.uniq)||null, set:(d.inst&&d.inst.set)||null}); }
    return out; },
  // --- CAS-1664 ARENA DE OLEADAS harness hooks (tools/cas1664-arena.mjs); additive, drive the REAL paths ---
  // Live arena state read (AC1/AC3): mode gate, current+best wave, rest flag, alive arena-enemy count, scene.
  arenaState(){ const A=G.arena, h=G.hero; return { mode:!!G.arenaMode, wave:A.wave|0, best:A.best|0,
    resting:!!A.resting, restT:+((A.restT||0).toFixed(3)), spawnedThisWave:A.spawnedThisWave|0,
    alive:arenaAliveCount(), scene:G.scene, hp:h?Math.round(h.hp):0, maxHp:h?Math.round(heroMaxHp(h)):0,
    bossIncoming:!!A.bossIncoming, lastTelegraphWave:A.lastTelegraphWave|0 }; }, // CAS-1670 telegraph readout
  // Start the gauntlet on the live hero (bypasses the menu flag) → flips arenaMode on + startArena. AC1/AC3.
  arenaStart(){ const h=G.hero; if(!h) return null; G.arenaMode=true; startArena(); return this.arenaState(); },
  // Force wave n (clears remnants, spawns the roster). Reports the spawned set so QA can prove scaling
  // (hp/dmg climb with n), the boss-wave rule (n%BOSS_EVERY==0 → 1 boss), and that types ∈ the ETPL pool. AC2.
  arenaSpawnWave(n){ n=Math.max(1,n|0); const A=G.arena; A.wave=n; spawnWave(n);
    const mobs=G.enemies.filter(e=>e.arena).map(e=>({ type:e.type, hp:Math.round(e.tpl.hp), dmg:Math.round(e.tpl.dmg||0),
      isBoss:!!e.isBoss, affix:e.affix||null, champElite:!!e.champElite }));
    return { wave:n, count:mobs.length, alive:arenaAliveCount(), boss:mobs.some(m=>m.isBoss), pool:arenaMobPool(), mobs }; },
  // Kill (remove) all live arena enemies to SIMULATE a wave clear in QA, then report state. AC3.
  arenaClearWave(){ arenaClearEnemies(); return this.arenaState(); },
  // Override arenaAffixRate deterministically (null → restore the wave-scaled curve). Pure — no RNG,
  // never touches srand → proves the [AC-RNG-STRONG] neutrality confound is arena-only. AC5.
  arenaSetAffixRate(r){ arenaAffixOverride=(r==null)?null:Math.max(0,+r||0); return arenaAffixOverride; },
  // Read the durable best wave (mithralda.arena.v1 → G.arena.best, loaded at boot by persist.bootArena). AC4.
  arenaBest(){ return G.arena.best|0; },
  // AC7: drive a full wave-clear through the REAL onWaveCleared → report the Esencia banked to the meta.
  arenaClearReward(){ const A=G.arena; const before=ensureMeta().essence|0;
    if(!(A.wave>0)) A.wave=1; A.spawnedThisWave=1; arenaClearEnemies(); onWaveCleared();
    return { wave:A.wave|0, essBefore:before, essAfter:ensureMeta().essence|0, gain:(ensureMeta().essence|0)-before, resting:!!A.resting }; },
  // AC4: serialize→load the arena best through the REAL persistence pair (mirror of ultPersist).
  arenaPersist(bestWave){ G.arena.best=Math.max(0,bestWave|0); const blob=JSON.parse(JSON.stringify(serializeArena()));
    G.arena.best=0; const after=loadArena(blob); return { wrote:bestWave|0, blob, after }; },
  // --- CAS-1670 Boss-wave telegraph + scaled payoff harness hooks (tools/cas1670-bosswaves.mjs); additive ---
  // Jump straight to wave n (spawns its roster through the REAL spawnWave) so QA reaches a boss wave
  // without farming. Reports whether it's a boss wave + the spawned set (mirrors arenaSpawnWave). AC1/AC3.
  arenaSetWave(n){ n=Math.max(1,n|0); const A=G.arena; G.arenaMode=true; A.wave=n; spawnWave(n);
    const mobs=G.enemies.filter(e=>e.arena); const b=mobs.find(e=>e.isBoss);
    return { wave:n, boss:(n%ARENA.bossEvery)===0, bossK:b?b.arenaBossK:0,
      count:mobs.length, alive:arenaAliveCount(), bossCount:mobs.filter(e=>e.isBoss).length,
      trashCount:mobs.filter(e=>!e.isBoss).length, telegraphWave:A.lastTelegraphWave|0,
      // AC4: prove the boss HP/dmg scaling (base × wave multiplier) is intact — zone-independent.
      boss_hp:b?Math.round(b.tpl.hp):0, boss_dmg:b?Math.round(b.tpl.dmg||0):0,
      boss_baseHp:b?b.arenaBossBaseHp|0:0, boss_baseDmg:b?b.arenaBossBaseDmg|0:0,
      boss_hpMul:b?+b.arenaBossHpMul.toFixed(4):0, boss_dmgMul:b?+b.arenaBossDmgMul.toFixed(4):0 }; },
  // Force the NEXT wave to be a boss wave: jump to the next multiple of bossEvery and spawn it. AC2.
  arenaForceBossWave(){ const A=G.arena; G.arenaMode=true; const cur=A.wave|0;
    const next=cur - (cur%ARENA.bossEvery) + ARENA.bossEvery; A.wave=next; spawnWave(next);
    return { wave:next, k:Math.max(1,(next/ARENA.bossEvery)|0), boss:true,
      bossCount:G.enemies.filter(e=>e.arena&&e.isBoss).length, telegraphWave:A.lastTelegraphWave|0 }; },
  // Runtime override of the guaranteed bonus-drop BASE count (0 → OFF, for the RNG-neutral A/B). AC5.
  arenaSetBossBonus(x){ ARENA.bossBonusDrops=Math.max(0,x|0); return ARENA.bossBonusDrops; },
  // Read the last banked payoff (Esencia bonus + k + bonus-drop count) + live telegraph state. AC2/AC3.
  arenaLastPayoff(){ const A=G.arena; return { k:A.lastBossK|0, essBonus:A.lastBossEssBonus|0,
    bonusDrops:A.lastBonusDrops|0, telegraphWave:A.lastTelegraphWave|0, bossIncoming:!!A.bossIncoming,
    bossBonusBase:ARENA.bossBonusDrops|0, bossEssBase:ARENA.bossEssBase|0 }; },
  // AC3: spawn a boss wave at index k, kill the boss through the REAL killEnemy (fires the base srand
  // drop + the arenaRng bonus drops), then drive onWaveCleared to bank the scaled Esencia bonus. Reports
  // both payoffs so QA can compare k=1 vs k=2 vs k=3 (both scale). essBonus is arithmetic; bonusDrops from arenaRng.
  arenaKillBossWave(k){ k=Math.max(1,k|0); const A=G.arena; G.arenaMode=true; const n=k*ARENA.bossEvery;
    A.wave=n; spawnWave(n);                                   // real boss-wave spawn (telegraph fires)
    const boss=G.enemies.find(e=>e.arena&&e.isBoss&&!e.dead);
    const dBefore=G.drops.length, eBefore=ensureMeta().essence|0;
    if(boss){ boss.hp=0; killEnemy(boss); }                   // real kill → base + bonus drops
    const gearAdded=G.drops.slice(dBefore).filter(d=>d.kind==="gear").length;
    A.spawnedThisWave=1; onWaveCleared();                     // real wave-clear → base + boss Esencia bonus
    return { k, wave:n, bossKilled:!!boss, essGain:(ensureMeta().essence|0)-eBefore,
      essBonus:A.lastBossEssBonus|0, essBase:arenaEssence(n), gearDropsAdded:gearAdded,
      bonusDrops:A.lastBonusDrops|0, expectBonusDrops:arenaBonusDropCount(k) }; },
  // [AC-RNG-STRONG]: seed srand, spawn+kill an arena boss (draws base loot from srand, bonus from arenaRng),
  // then sample `probeN` raw srand() outputs. Run at bossBonus>0 vs bossBonus=0 with the SAME seed → the
  // probe is byte-identical, proving the bonus drops never touch srand. arenaRng draws NEVER perturb srand.
  arenaBossSrandProbe(k, seedVal, probeN){ k=Math.max(1,k|0); probeN=Math.max(4,probeN|0);
    if(seedVal!=null) seed(seedVal>>>0); G.arenaMode=true;
    const n=k*ARENA.bossEvery; const e=arenaSpawnBoss(n);      // arenaRng-only spawn (no srand)
    const dBefore=G.drops.length; if(e){ e.hp=0; killEnemy(e); }
    const probe=[]; for(let i=0;i<probeN;i++) probe.push(+srand().toFixed(9));
    return { k, bossBonus:ARENA.bossBonusDrops|0, bonusDrops:G.arena.lastBonusDrops|0,
      gearDropsAdded:G.drops.slice(dBefore).filter(d=>d.kind==="gear").length, srandProbe:probe }; },
  // --- CAS-1675 Persistent Arena records harness hooks (tools/cas1675-arena-records.mjs); additive ---
  // Read both durable records (loaded at boot by persist.bootArena → G.arena). AC1/AC2.
  arenaGetRecords(){ return { bestWave:G.arena.best|0, bestBossWave:G.arena.bestBossWave|0 }; },
  // Set both record fields directly (for the RNG-neutral A/B baseline + display probes). AC1b/AC4.
  arenaSetRecords(bestWave, bestBossWave){ G.arena.best=Math.max(0,bestWave|0); G.arena.bestBossWave=Math.max(0,bestBossWave|0); return this.arenaGetRecords(); },
  // AC1: serialize→load BOTH records through the REAL persistence pair (mirror of arenaPersist). Proves
  // the additive load (bestBossWave round-trips; a legacy blob without it loads as 0).
  arenaRecordsPersist(bestWave, bestBossWave){ G.arena.best=Math.max(0,bestWave|0); G.arena.bestBossWave=Math.max(0,bestBossWave|0);
    const blob=JSON.parse(JSON.stringify(serializeArena()));
    G.arena.best=0; G.arena.bestBossWave=0; loadArena(blob);
    return { wrote:{ bestWave:bestWave|0, bestBossWave:bestBossWave|0 }, blob, after:{ bestWave:G.arena.best|0, bestBossWave:G.arena.bestBossWave|0 } }; },
  // AC1b/AC3: read the last milestone payoff + the run/record state (hit fires at most once per run).
  arenaLastRecordPayoff(){ const A=G.arena; return { hit:!!A.bossRecordHit, essBonus:A.lastRecordEssBonus|0,
    bestBossWave:A.bestBossWave|0, runBestBossWave:A.runBestBossWave|0, baseline:A.bossRecordBaseline|0 }; },
  // AC3: run a REAL boss-wave clear through onWaveCleared and report whether the milestone paid out.
  // Snapshots the baseline from the CURRENT bestBossWave (set the record via arenaSetRecords first),
  // then clears boss wave `k*bossEvery`. Milestone fires iff that wave beats the record AND not yet hit.
  arenaRunBossWave(k){ k=Math.max(1,k|0); const A=G.arena; G.arenaMode=true;
    if(A.runBestBossWave===0){ A.bossRecordBaseline=A.bestBossWave|0; A.bossRecordHit=false; A.lastRecordEssBonus=0; }
    const n=k*ARENA.bossEvery; A.wave=n; A.spawnedThisWave=1; arenaClearEnemies();
    const before=ensureMeta().essence|0; onWaveCleared();
    return { k, wave:n, baseline:A.bossRecordBaseline|0, recordHit:!!A.bossRecordHit, recordBonus:A.lastRecordEssBonus|0,
      runBestBossWave:A.runBestBossWave|0, essGain:(ensureMeta().essence|0)-before }; },
  // AC1b: drive the run's record through the REAL arenaOnDeath persist gate. Reports the pre/post
  // bestBossWave so QA proves it banks ONLY when runBestBossWave beats the stored record.
  arenaDeathPersistRecord(){ const A=G.arena; const before=A.bestBossWave|0; arenaOnDeath();
    return { runBestBossWave:A.runBestBossWave|0, bestBossWaveBefore:before, bestBossWaveAfter:A.bestBossWave|0 }; },
  // [AC-RNG-STRONG]: seed srand, cross a boss-wave MILESTONE (record present vs absent — set via
  // arenaSetRecords beforehand) through the REAL onWaveCleared, then sample `probeN` raw srand()
  // outputs. The milestone bonus is arithmetic Esencia (never srand) → the probe is byte-identical
  // whether or not the milestone paid out. Mirror of arenaBossSrandProbe.
  arenaRecordSrandProbe(seedVal, probeN){ probeN=Math.max(4,probeN|0); const A=G.arena; G.arenaMode=true;
    if(seedVal!=null) seed(seedVal>>>0);
    A.runBestBossWave=0; A.bossRecordBaseline=A.bestBossWave|0; A.bossRecordHit=false; A.lastRecordEssBonus=0;
    const n=ARENA.bossEvery; A.wave=n; A.spawnedThisWave=1; arenaClearEnemies();
    onWaveCleared();                                          // crosses milestone iff n > baseline (0 RNG)
    const probe=[]; for(let i=0;i<probeN;i++) probe.push(+srand().toFixed(9));
    return { baseline:A.bossRecordBaseline|0, recordHit:!!A.bossRecordHit, essBonus:A.lastRecordEssBonus|0, srandProbe:probe }; },
  // --- CAS-1586 AURA GÉLIDA + Esencia tie-in harness hooks (tools/cas1586-frost-live.mjs) ---
  // Clean arena, force ONE frost mob, place the FROZEN mob `dist` px from the hero, tick the REAL
  // update() a few frames, then report the hero's slow channel + resulting effective movespeed.
  // Call with dist < auraR (INSIDE → slowed) then dist > auraR (OUTSIDE → slow=1) to prove the
  // radius gate (AC-1). Mob spd/aggro zeroed so it can't drift into/out of the radius mid-probe.
  affixAura(type, dist){ const af=MOB_AFFIX.frost; if(!af||!af.auraR) return null;
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const h=G.hero; h.dead=false; h.rolling=false; h.iframe=0; h.stun=0; h.dots=null;
    h.maxHp=100000; h.hp=100000; h.cls="warrior"; h.slow=1; h.slowT=0;
    const d=(dist==null)?Math.round(af.auraR*0.5):dist;              // default: comfortably INSIDE
    const e=spawnEnemy(type||"skeleton", h.x+d, h.y); if(!e) return null;
    applyAffix(e, "frost"); e.tpl=Object.assign({},e.tpl,{spd:0,aggro:0}); e.state="idle"; // pin it: aura is passive
    for(let i=0;i<8;i++) update(16);                                 // ~8 frames through the REAL game loop
    const statusSlow=(h.slowT>0)?(h.slow||1):1;
    const baseSpd=(h.moveSpeed||CFG.heroSpeed);
    return { auraR:af.auraR, auraSlow:af.auraSlow, dist:d, inside:d<=af.auraR,
      heroSlow:+(h.slow||1).toFixed(3), heroSlowT:+(h.slowT||0).toFixed(3),
      baseSpd:Math.round(baseSpd), movespdEffective:Math.round(baseSpd*statusSlow) }; },
  // Spawn-kill a forced-affix mob through the REAL trash branch and report the Esencia DELTA that
  // kill earns (via the run recap → essenceForRun). Proves the reward multiplier (AC-2): each
  // affixed kill adds MOB_AFFIX_ESSENCE. baseline0 has no affixKills → its essence is the control.
  affixEssence(id, type){ const h=G.hero; beginRun();               // baseline the run counters
    const e=spawnEnemy(type||"skeleton", h.x, h.y); applyAffix(e, id||"frost");
    e.tpl=Object.assign({},e.tpl,{xp:0,gold:[0,0]});                 // isolate: no level-up churn
    e.hp=0; killEnemy(e);
    const recap=buildRecap(); const essence=essenceForRun(h, recap);
    // control: the SAME recap with the affix term removed → the pure per-kill Esencia contribution
    const ctrl=essenceForRun(h, Object.assign({}, recap, { affixKills:0 }));
    return { affixKills:recap.affixKills|0, essence, essenceNoAffix:ctrl,
      perAffix:MOB_AFFIX_ESSENCE, delta:essence-ctrl }; },
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
    return { branches:t.branches.slice(), nodes:t.nodes.map(n=>({id:n.id,br:n.br,tier:n.tier,name:n.name,max:n.max,eff:Object.assign({},n.eff),req:n.req||null,excl:n.excl||null,levelReq:n.levelReq||null,empower:n.empower?n.empower.spell:null})) }; },
  // CAS-1602: SPELL-EMPOWER probe (ENTREGABLE 1↔2 bridge). For each empower node in the class
  // tree, report the base signature spell, the empowered COPY (apply@rank1), whether it's bought,
  // and whether the LIVE overlay returns the SAME object reference as the base when unbought
  // (proves copy-on-write / 0-delta). Lets QA verify the node observably scales radio/daño/duración
  // (AC2/AC3) with no cast and no RNG. `liveSameRef` must equal `!bought`.
  empowerProbe(cls){ const c=cls||(G.hero&&G.hero.cls); const ns=talentNodes(c); if(!ns) return null;
    const list=SPELLS[c]||[]; const byId={}; for(const sp of list) byId[sp.id]=sp; const h=G.hero;
    return ns.filter(n=>n.empower).map(n=>{ const base=byId[n.empower.spell]||null;
      const emp=base?n.empower.apply(base,1):null;
      const bought=!!(h && h.cls===c && h.talents && (h.talents[n.id]|0)>0);
      const live=(h && h.cls===c && base)?talentEmpower(h,base):base;
      return { node:n.id, name:n.name, levelReq:n.levelReq||null, spell:n.empower.spell,
        base:base?Object.assign({},base):null, empowered:emp?Object.assign({},emp):null,
        bought, liveSameRef: base?(live===base):null }; }); },
  // Grant points (level-up shortcut) so a test can fund a build without grinding XP.
  grantTalentPts(n){ const h=G.hero; if(!h) return 0; h.talentPts=(h.talentPts|0)+Math.max(0,Math.floor(n||1)); return h.talentPts; },
  // Spend a point through the REAL allocator (enforces points/req/excl) — returns the
  // post-state so the harness reads the legal-allocation rules, never a shortcut.
  allocTalent(id){ const ok=allocTalent(id); return { ok, state:this.talentState() }; },
  // Full respec through the real path (refund + wipe + recalc).
  respecTalents(){ const refunded=respecTalents(); return { refunded, state:this.talentState() }; },
  // Can this node be taken right now? (mirrors the UI light-up + save validation.)
  canAlloc(id){ return canAllocTalent(G.hero, id); },
  // CAS-1601: why a node is locked ("level:3"/"req"/"excl"/"pts"/"max"/null) + a
  // level setter so QA can drive the level-gate (tier-1→Nv3, tier-2→Nv6) directly.
  lockReason(id){ return lockReason(G.hero, id); },
  setLevel(n){ const h=G.hero; if(!h) return null; h.lvl=Math.max(1,Math.floor(n||1)); return h.lvl; },
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
  // ---- CAS-1570 active-abilities API (draft screen + HUD + QA harness) ----
  // The full class-agnostic pool (id/name/glyph/type/cost/cd) for the run-start draft.
  abilityPool(){ return ACTIVE_ABILITIES.map(a=>({ id:a.id, name:a.name, glyph:a.glyph, type:a.type,
    cost:a.cost, cd:a.cd, status:a.status?a.status.type:null, desc:a.desc })); },
  // Read/set the 2 drafted ability ids on the live hero (draft "Listo" calls this).
  loadout(){ return (G.hero&&G.hero.loadout)?G.hero.loadout.slice():DEFAULT_LOADOUT.slice(); },
  setLoadout(ids){ const h=G.hero; if(!h||!Array.isArray(ids)) return h?h.loadout:null;
    // CAS-1580: only UNLOCKED abilities may be equipped — filter the request AND the fill fallback
    // through draftPool() so a locked (or stale-saved) ability can never land in a live loadout.
    const pool=draftPool(), poolIds=new Set(pool.map(a=>a.id));
    const valid=ids.filter(id=>poolIds.has(id)).slice(0,2);
    while(valid.length<2){ for(const a of pool){ if(!valid.includes(a.id)){ valid.push(a.id); break; } } if(valid.length<2) break; }
    h.loadout=valid; h.abilCD=[0,0]; h.abilCDmax=[0,0]; return h.loadout.slice(); },
  // Live HUD data for the 2 ability slots: current/max cooldown + mana affordability.
  abilityBar(){ const h=G.hero; if(!h||!h.loadout) return null;
    return h.loadout.map((id,slot)=>{ const a=ABILITY_MAP[id]||{}; return { slot, id, name:a.name, glyph:a.glyph,
      col:a.col, cost:a.cost||0, cd:+(h.abilCD[slot]||0).toFixed(2), cdmax:+(h.abilCDmax[slot]||0).toFixed(2),
      ready:(h.abilCD[slot]||0)<=0 && h.mp>=(a.cost||0), status:a.status?a.status.type:null }; }); },
  // Cast a drafted ability at a live dummy and report the outcome (mirrors skillProbe) — QA AC1/AC2.
  abilityProbe(id){ const a=ABILITY_MAP[id]; if(!a) return null;
    const h=G.hero; h.maxMp=300; h.mp=300; h.maxHp=600; h.hp=300; h.facing=0; h.rolling=false; h.stun=0;
    h.abilCD=[0,0]; h.abilCDmax=[0,0]; h.loadout=[id, h.loadout&&h.loadout[1]!==id?h.loadout[1]:ACTIVE_ABILITIES[0].id];
    G.enemies.length=0; G.projectiles.length=0; G.fields.length=0; G.fx.length=0;
    const e=spawnEnemy("skeleton", h.x+40, h.y); e.maxHp=e.hp=6000;
    const e2=spawnEnemy("skeleton", h.x+90, h.y); e2.maxHp=e2.hp=6000;   // 2nd dummy so chain can hop
    const e0=e.hp, e20=e2.hp, mp0=h.mp, def0=h.defBonus||0;
    castAbility(0);
    for(let s=0;s<6;s++){ update(40); }
    const r={ id, type:a.type, cost:a.cost, mpSpent:Math.round(mp0-h.mp),
      dmg:Math.round(e0-e.hp), dmg2:Math.round(e20-e2.hp),
      cd:+(h.abilCD[0]||0).toFixed(2), cdmax:+(h.abilCDmax[0]||0).toFixed(2),
      enemyStun:+(e.stun||0).toFixed(2), enemySlowT:+(e.slowT||0).toFixed(2),
      defBuff:+((h.defBonus||0)-def0).toFixed(1), statusType:a.status?a.status.type:null };
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
  // --- CAS-1681 Eventos de Zona harness hooks (tools/cas1681-events.mjs); additive, dev-only ---
  eventSetEnabled(b){ ZONE_EVENTS.enabled=!!b; return { enabled:ZONE_EVENTS.enabled }; },
  eventSetDensity(x){ ZONE_EVENTS.density=Math.max(0,+x||0); return { density:ZONE_EVENTS.density }; },
  eventState(){ const Z=G.zoneEvents; return { enabled:ZONE_EVENTS.enabled, density:ZONE_EVENTS.density,
    perZoneMax:ZONE_EVENTS.perZoneMax, seeded:Z.seeded.slice(), poiN:Z.pois.length, done:(G.hero&&G.hero.zoneEventsDone)|0 }; },
  // Snapshot the live POI list (type/state/pos + bound-enemy liveness) for asserts.
  eventListPOIs(){ return G.zoneEvents.pois.map(p=>({ id:p.id, type:p.type, zone:p.zone, state:p.state, seen:!!p.seen,
    x:Math.round(p.x), y:Math.round(p.y), hasGuard:!!(p.guard&&!p.guard.dead&&p.guard.hp>0), hasGoblin:!!(p.goblin&&!p.goblin.dead),
    escapeT:(p.escapeT!=null)?+p.escapeT.toFixed(2):null })); },
  // Force-seed ONE POI of a given type at hero+(dx,dy) — deterministic per-type testing. Marks the
  // current zone seeded so natural seeding won't add more this run. Returns the new POI snapshot.
  eventForceSpawn(type, dx, dy){ const h=G.hero; if(!h) return null;
    const zn=zoneOf(world,h.x,h.y); const z=HUNTS[zn]?zn:"forest";
    if(G.zoneEvents.seeded.indexOf(z)<0) G.zoneEvents.seeded.push(z);
    const poi=spawnZonePOI(z, type, h.x+(dx||0), h.y+(dy||0));
    return this.eventListPOIs().find(p=>p.id===poi.id)||null; },
  // Run the REAL per-run seeding for a zone — REPEATABLE: clears this zone's prior seed flag + POIs
  // (and their bound enemies) and reseeds eventRng, so the same seedVal always reproduces the same
  // roll (determinism proof). The natural in-game entry path calls seedZoneEvents directly (once/zone).
  eventSeedZone(zone, seedVal){ const z=HUNTS[zone]?zone:"forest"; const Z=G.zoneEvents;
    const i=Z.seeded.indexOf(z); if(i>=0) Z.seeded.splice(i,1);
    for(let k=Z.pois.length-1;k>=0;k--){ if(Z.pois[k].zone===z){ const g=Z.pois[k].guard||Z.pois[k].goblin;
      if(g){ const ix=G.enemies.indexOf(g); if(ix>=0) G.enemies.splice(ix,1); } Z.pois.splice(k,1); } }
    if(seedVal!=null) eventRng.seed(seedVal>>>0);
    seedZoneEvents(z); return this.eventListPOIs(); },
  // Activate the nearest (or id-matched) ACTIVE shrine through the REAL activateShrine path.
  eventActivateShrine(id){ const Z=G.zoneEvents, h=G.hero; if(!h) return null;
    const poi=(id!=null)?Z.pois.find(p=>p.id===id):Z.pois.find(p=>p.type==="shrine"&&p.state==="active");
    if(!poi) return null; const eB=G.enemies.length, hpB=h.hp, dmgB=h.dmgBonus||0;
    const ok=activateShrine(poi);
    return { activated:!!ok, state:poi.state, hordeAdded:G.enemies.length-eB, healed:+(h.hp-hpB).toFixed(1),
      dmgBuff:+((h.dmgBonus||0)-dmgB).toFixed(1), buffT:+(h.dmgBuffT||0).toFixed(2) }; },
  // Kill the guardian of the nearest (or id-matched) chest via the REAL killEnemy path → opens the chest.
  eventKillGuard(id){ const Z=G.zoneEvents;
    const poi=(id!=null)?Z.pois.find(p=>p.id===id):Z.pois.find(p=>p.type==="chest"&&p.state==="active");
    if(!poi||!poi.guard) return null; const g=poi.guard; const dB=G.drops.length; const eB=ensureMeta().essence|0;
    g.hp=0; killEnemy(g);
    return { state:poi.state, drops:G.drops.slice(dB).map(d=>d.kind),
      gearAdded:G.drops.slice(dB).filter(d=>d.kind==="gear").length, essDelta:(ensureMeta().essence|0)-eB }; },
  // Reach the nearest (or id-matched) goblin: place the hero on it and run the REAL proximity tick.
  eventReachGoblin(id){ const Z=G.zoneEvents, h=G.hero; if(!h) return null;
    const poi=(id!=null)?Z.pois.find(p=>p.id===id):Z.pois.find(p=>p.type==="goblin"&&p.state==="active");
    if(!poi||!poi.goblin) return null; const eB=ensureMeta().essence|0;
    h.x=poi.goblin.x; h.y=poi.goblin.y; tickZoneEvents(0.016, poi.zone);
    return { state:poi.state, essDelta:(ensureMeta().essence|0)-eB, done:(h.zoneEventsDone)|0 }; },
  // Let the nearest (or id-matched) goblin ESCAPE by running its timer down through the REAL tick.
  eventEscapeGoblin(id){ const Z=G.zoneEvents;
    const poi=(id!=null)?Z.pois.find(p=>p.id===id):Z.pois.find(p=>p.type==="goblin"&&p.state==="active");
    if(!poi) return null; poi.escapeT=0.001; const h=G.hero; if(h){ h.x=poi.x+9999; h.y=poi.y+9999; } // far away so it never counts as reached
    tickZoneEvents(0.5, poi.zone); return { state:poi.state, escapeT:poi.escapeT }; },
  eventLastPayoff(){ const p=G.zoneEvents.lastPayoff; return { payoff:p?Object.assign({},p):null, done:(G.hero&&G.hero.zoneEventsDone)|0 }; },
  // [AC-RNG-STRONG]: fingerprint the DEDICATED eventRng stream (N draws after an optional reseed) so
  // QA can prove seeding is deterministic AND isolated (a different eventRng state never shifts srand).
  eventRngProbe(n, seedOverride){ n=Math.max(1,n|0); if(seedOverride!=null) eventRng.seed(seedOverride>>>0);
    const out=[]; for(let i=0;i<n;i++) out.push(+eventRng.srand().toFixed(9)); return out; },
  // [AC-RNG-STRONG] — the headline neutrality proof. Seed the gameplay srand, sample a pre-segment
  // (terrain/spawn stand-in), inject the REAL zone-event seeding (eventRng-only), then sample a
  // post-segment + a rollGearInst dropStream probe. With events OFF vs ON at high density the srand
  // fingerprint is BYTE-IDENTICAL (event seeding never touches srand), while poiN>0 proves ON did work.
  eventGenProbe(enabled, density, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=ZONE_EVENTS.enabled, savD=ZONE_EVENTS.density; const usedD=(density==null?1:Math.max(0,+density||0));
    ZONE_EVENTS.enabled=!!enabled; ZONE_EVENTS.density=usedD;
    resetZoneEvents(); G.enemies.length=0; G.drops.length=0;
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));       // pre-segment
    const zn=(G.hero&&zoneOf(world,G.hero.x,G.hero.y)); const z=HUNTS[zn]?zn:"forest";
    seedZoneEvents(z);                                                          // EVENT INJECTION (eventRng only)
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));                     // post-segment
    const inst=rollGearInst(srand,2,3); fp.push(inst?(inst.defId|0):-1);        // dropStream probe
    for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));
    const poiN=G.zoneEvents.pois.length; const enemN=G.enemies.length;
    ZONE_EVENTS.enabled=savEn; ZONE_EVENTS.density=savD;
    return { enabled:!!enabled, density:usedD, zone:z, poiN, enemN, fingerprint:fp }; },

  // --- CAS-1692 NUEVOS MOBS dev hooks (tools/cas1692-mobs-live-qa.mjs); additive ---
  // Static config read: NEW_MOBS flag + the 3 new ETPL entries.
  newMobsMeta(){ return { enabled:NEW_MOBS.enabled,
    mobs:["thornspitter","ironback","ashwraith"].map(k=>({ id:k, hp:ETPL[k]?.hp||0, arch:ETPL[k]?.arch||null, sprite:ETPL[k]?.sprite||null })) }; },
  // Toggle the feature gate (QA: byte-identity check when disabled).
  setNewMobsEnabled(b){ NEW_MOBS.enabled=!!b; return NEW_MOBS.enabled; },
  // RNG-neutrality probe: run probeN srand draws with NEW_MOBS on vs off; fingerprints must match
  // at position (same world seed, same draw count → byte-identical when no new mob was chosen).
  newMobsGenProbe(enabled, seedVal, probeN){ probeN=Math.max(4,probeN|0);
    const savEn=NEW_MOBS.enabled; NEW_MOBS.enabled=!!enabled;
    G.enemies.length=0;
    if(seedVal!=null) seed(seedVal>>>0);
    const fp=[]; for(let i=0;i<probeN;i++) fp.push(+srand().toFixed(9));
    NEW_MOBS.enabled=savEn;
    return { enabled:!!enabled, fingerprint:fp }; },
  // Directly spawn a new mob in the world at a named zone position (QA: proves ETPL entry resolves).
  spawnNewMob(type, zone){ const sp=world.spawners&&world.spawners.find(s=>s.zone===zone);
    const rect=sp?sp.rect:{x:G.hero.x/TS-2,y:G.hero.y/TS-2,w:4,h:4};
    const tx=(rect.x+2)*TS, ty=(rect.y+2)*TS;
    const e=spawnEnemy(type,tx,ty); if(e) applyZoneScale(e,zone||"forest");
    return e?{type:e.type,hp:e.hp,arch:e.tpl.arch||null,x:Math.round(e.x),y:Math.round(e.y)}:null; },
  // Probe: direct enemy spawn+kill to check loot from a new mob type.
  newMobSpawnKill(type){ const before=G.drops.length; const e=spawnEnemy(type, G.hero.x, G.hero.y);
    if(!e) return { type, spawned:false }; e.hp=0; killEnemy(e);
    return { type, spawned:true, drops:G.drops.slice(before).map(d=>({kind:d.kind,slot:d.inst?d.inst.slot:null})) }; },
  // ---- CAS-1744 Caldera (ZONE5) harness hooks. All additive, REAL paths, DOM-free-friendly. ----
  // Static config read: the ZONE5 flag + the caldera roster/boss/modifier/gate.
  zone5Meta(){ return { enabled:ZONE5.enabled, zone:ZONE5.zone, bonusLootRate:ZONE5.bonusLootRate,
    powerReq:CALDERA_POWER_REQ, gateOrder:(ABYSS_POWER_REQ<CALDERA_POWER_REQ && CALDERA_POWER_REQ<FROST_POWER_REQ),
    mobs:["emberkin","magmabrute"].map(k=>({ id:k, hp:ETPL[k]?.hp||0, arch:ETPL[k]?.arch||null, sprite:ETPL[k]?.sprite||null, richAnim:!!ETPL[k]?.richAnim, infl:ETPL[k]?.infl?.type||null })),
    boss:{ base:HUNTS.caldera?.boss?.base||null, minR:HUNTS.caldera?.boss?.minR||null, enrageAt:HUNTS.caldera?.boss?.enrageAt||0, slam:HUNTS.caldera?.boss?.special?.slam?.count||0, richAnim:!!ETPL.calderatyrant?.richAnim },
    modifier:{ id:ZONE5_MOD.id, glyph:ZONE5_MOD.glyph, dmgMul:ZONE5_MOD.dmgMul, spdMul:ZONE5_MOD.spdMul, inMap:!!ZONE_MOD_MAP[ZONE5_MOD.id], inBaseArray:ZONE_MODIFIERS.some(m=>m.id===ZONE5_MOD.id) } }; },
  // Toggle the feature gate (QA: byte-identity checks when disabled).
  setZone5Enabled(b){ ZONE5.enabled=!!b; return ZONE5.enabled; },
  // The modifier pool offerCurse would draw from RIGHT NOW (ids). OFF ⇒ historical 3; ON ⇒ +emberfury.
  zone5ModPoolIds(){ return (ZONE5.enabled?[...ZONE_MODIFIERS, ZONE5_MOD]:ZONE_MODIFIERS).map(m=>m.id); },
  // Draw n floats from the DEDICATED zone5Rng (proves the stream is live + isolated). Reseeds it
  // directly (global seed() does NOT reset it — that's the whole isolation point). Mirror of socketRngProbe.
  zone5RngProbe(n, seedVal){ n=Math.max(1,n|0); if(seedVal!=null) zone5Rng.seed(seedVal>>>0);
    const out=[]; for(let i=0;i<n;i++) out.push(+zone5Rng.srand().toFixed(9)); return out; },
  // AC1 stream isolation: srand tail is IDENTICAL before/after hammering zone5Rng (the caldera loot
  // stream never perturbs the authoritative srand). Proves the dedicated-stream guarantee directly.
  zone5StreamIsolationProbe(seedVal, n){ n=Math.max(4,n|0);
    if(seedVal!=null) seed(seedVal>>>0); const a=[]; for(let i=0;i<n;i++) a.push(+srand().toFixed(9));
    for(let i=0;i<64;i++) zone5Rng.srand();
    if(seedVal!=null) seed(seedVal>>>0); const b=[]; for(let i=0;i<n;i++) b.push(+srand().toFixed(9));
    return { a, b, identical:a.every((v,i)=>v===b[i]) }; },
  // AC1 worldgen neutrality: build the world OFF and ON from the SAME seed and diff them. The caldera
  // block is fully gated + appended LAST, so ON only ADDS the caldera — every tile OUTSIDE the caldera
  // rect and every non-caldera portal must be byte-identical (outsideDiffs===0), OFF has zero T_CALDERA
  // tiles / no world.caldera / no caldera portal, ON has the rect + 1 down-portal to caldera (+ its return).
  caldWorldNeutralProbe(seedVal){ const sav=ZONE5.enabled;
    const mk=(en)=>{ ZONE5.enabled=en; const rng=createRNG(); if(seedVal!=null) rng.seed(seedVal>>>0); return buildWorld(rng); };
    const off=mk(false), on=mk(true); ZONE5.enabled=sav;
    const ca=on.caldera; const inCa=(i)=>{ if(!ca) return false; const x=i%MAP_W, y=(i/MAP_W)|0; return x>=ca.x&&x<ca.x+ca.w&&y>=ca.y&&y<ca.y+ca.h; };
    let outsideDiffs=0, tOff=0, tOn=0;
    for(let i=0;i<off.terr.length;i++){ if(off.terr[i]===T_CALDERA) tOff++; if(on.terr[i]===T_CALDERA) tOn++; if(!inCa(i)&&off.terr[i]!==on.terr[i]) outsideDiffs++; }
    return { offHasCaldera:!!off.caldera, onHasCaldera:!!on.caldera, calderaTilesOff:tOff, calderaTilesOn:tOn,
      outsideDiffs, offCalderaPortals:off.portals.filter(p=>p.to==="caldera").length, onCalderaPortals:on.portals.filter(p=>p.to==="caldera").length,
      offPortals:off.portals.length, onPortals:on.portals.length, calderaZoneOfVestibule: ca? zoneOf(on, (ca.x+5)*TS, (ca.y+ca.h-3)*TS) : null }; },
  // AC4/bonus-loot: spawn a caldera mob INSIDE the live caldera rect and kill it through the REAL
  // killEnemy path (zoneOf → "caldera"), returning the drops. Needs a ZONE5-on world (world.caldera).
  caldSpawnKill(type){ const sp=world.spawners&&world.spawners.find(s=>s.zone==="caldera");
    if(!sp) return { ok:false, reason:"no caldera spawner (ZONE5 off / world not rebuilt)" };
    const x=(sp.rect.x+sp.rect.w/2)*TS, y=(sp.rect.y+sp.rect.h/2)*TS;
    const e=spawnEnemy(type,x,y); if(!e) return { ok:false, reason:"spawn failed" };
    e.x=x; e.y=y; applyZoneScale(e,"caldera"); const before=G.drops.length; e.hp=0; killEnemy(e);
    return { ok:true, zone:zoneOf(world,e.x,e.y), drops:G.drops.slice(before).map(d=>({kind:d.kind,slot:d.inst?d.inst.slot:null,rarity:d.inst?d.inst.rarity:null,tier:d.tier})) }; },
};
