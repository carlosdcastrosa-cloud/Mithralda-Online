// ===========================================================================
// sim/config.js — data-driven simulation constants (no behavior, no DOM).
// World dimensions, tile ids, hero tuning, per-class attacks, enemy templates,
// playable class list. Designers/balance live here, not in code paths.
// ===========================================================================
export const TS = 32;                 // world pixels per tile
export let MAP_W = 330, MAP_H = 330;      // CAS-398: map tripled (110→330). Now a `let` (live binding)
export function setMapDims(w,h){ MAP_W=w; MAP_H=h; }  // so the Tiled continent loader can grow to 760×570.

// terrain tile ids
export const T_GRASS = 0, T_DIRT = 1, T_STONE = 2, T_COBBLE = 3, T_SAND = 4, T_WATER = 5;
// CAS-121 — frozen floor for the gated Cripta Helada (3rd gated biome). Procedurally
// rendered pale-blue ice (no new art) so the zone reads as a distinct, colder place.
export const T_ICE = 6;
// CAS-441 — swamp floor for the Ciénaga de Bruma (4th open zone, CAS-438). Painted by
// the CAS-439 teal marsh tiles (mud/moss/puddle/water) in render/render.js; walkable
// like grass (shallow marsh — the water tiles read as wading pools, not barriers).
export const T_SWAMP = 7;
// CAS-1744 — molten basalt floor for the gated Caldera de Cenizas (5th gated endgame biome).
// Rendered by reusing the FOUNTAINS dark flagstone (like the abyss/ice path) washed with an
// ember/molten tint in render/render.js — NO new tile art. Walkable like the abyss floor.
export const T_CALDERA = 8;
// CAS-2191 — cobblestone CITY STREET (Batch-1 Tibia-ward art, CAS-2186). A distinct paved
// road id (separate from the T_COBBLE plaza flagstone) painted by the PixelLab Wang autotile
// tileset (assets/pixellab/city/cobble_street_tileset.png): grass↔cobble corner-blend curbs.
// Walkable like grass; render/render.js draws grass as the base then overlays the dual-grid
// Wang street tile so the road reads with proper curved kerbs where it meets the verges.
export const T_STREET = 9;

// CAS-80: data-driven town tilemap — Puerto Solana reads as a small hub built from the
// real Ancient Ruins tiles. One glyph per 32px cell, stamped over the 18×18 town rect
// in sim/world.js; TOWN_LEGEND maps each glyph to a terrain tile id, and each tile id
// is painted by its ERW atlas in render/render.js (flagstone for the plaza, grass for
// the verges). Designers reshape the town by editing these rows alone — no code change;
// collision stays grid-anchored (water/walls block via solidBlocked). Layout: a rounded
// flagstone plaza (P) ringed by grass verges (g), with dirt roads (.) punching out to
// the four hunt-zone exits — N caves / S arena / E forest / W ruins — at local cols/rows
// 8-9 so they line up with the world's approach paths. Width must equal town.w (18).
// CAS-2191: the four road spurs INSIDE the walls (town-local cols/rows 8-9, aligned to the
// rampart gates) are now cobblestone STREET (S → T_STREET) instead of plain dirt (.), so the
// hub reads as a paved city: cobblestone roads funnel through the gates into the flagstone
// plaza (P). The Wang autotiler blends S↔g (grass verge) curbs; S↔P (plaza) reads as continuous
// paving. Outside the walls the radiating dirt paths (world.js) still connect grass→gate.
export const TOWN_LEGEND = { g:T_GRASS, P:T_COBBLE, ".":T_DIRT, "~":T_WATER, S:T_STREET };
export const TOWN_MAP = [
  "ggggggggSSgggggggg",
  "ggggggggSSgggggggg",
  "ggggggggSSgggggggg",
  "gggggPPPPPPPPggggg",
  "ggggPPPPPPPPPPgggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "SSSPPPPPPPPPPPPSSS",
  "SSSPPPPPPPPPPPPSSS",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "ggggPPPPPPPPPPgggg",
  "gggggPPPPPPPPggggg",
  "ggggggggSSgggggggg",
  "ggggggggSSgggggggg",
  "ggggggggSSgggggggg",
];

export const CFG = {
  heroSpeed: 152, rollSpeed: 430, rollTime: 0.20, rollIFrame: 0.34, rollCD: 0.62,
  atkRange: 50, atkArc: Math.PI * 0.62, atkCD: 0.42, atkActive: 0.16,
  pickRange: 44, talkRange: 56, fountainRange: 60,
  // CAS-210: souls-like RIPOSTE — a frame-perfect dodge opens a brief window during which
  // the next hero hit is a guaranteed crit scaled by riposteMult (a crushing counter). The
  // window is short enough that you must commit the counter immediately, not bank it.
  riposteWindow: 1.4, riposteMult: 2.0,
};

// per-class basic attack (key J / 1 / click)
export const ATK = {
  warrior:{type:"melee", range:54, arc:Math.PI*0.66, cd:0.40, dmgMul:1.0,  fx:"slash"},
  druid:  {type:"melee", range:62, arc:Math.PI*1.05, cd:0.46, dmgMul:0.9,  fx:"thorns"},
  priest: {type:"nova",  range:84, cd:0.52, dmgMul:0.8,  heal:8, fx:"holy"},
  paladin:{type:"proj",  cd:0.40, dmgMul:1.05, kind:"arrow", spd:440, fx:"arrow"},
  mage:   {type:"proj",  cd:0.50, dmgMul:1.15, kind:"orb",   spd:300, fx:"orb"},
};

// per-class spells for slots 2-4 (cast indices 1,2,3) — the SECOND class-identity
// surface after ATK, and the ACTIVE SKILL BAR the player deploys in combat (CAS-120).
// Pure data: the generic resolver in sim/sim.js executes each spell by its `type`, so
// adding a class is adding a row here, never a code branch.
// Each entry carries its own MP `cost` + `cd` (independent per-slot cooldown), a
// `col` (spell-bar tint + fx colour) and an `fx` (renderer effect name). All
// effects run on the sim RNG only — determinism / Stage-2 server-authority ready.
//   types: proj(spd,kind,aoe?) | cone(range,arc,knock?) | nova(range,heal?)
//          | heal(heal) | hot(heal/s,dur) | buff(stat:"dmg"|"def",amt,dur) | dash(range,dmg)
//          | blink(range,iframe)  — instant collision-clamped reposition + i-frames (no dmg; pure mobility)
//          | field(range,dmg,tick,dur,offset?) — persistent ground zone that ticks dmg (area denial)
// CAS-120 — `status:{type,...}` is the unified CAS-118 effect a damaging skill applies
// on contact (cone/nova/dash on hit, proj/field on impact/tick): veneno/quemadura (DoT)
// | lentitud (slow amt+dur) | aturdir (stun dur). It runs through the SAME applyStatus
// engine mobs use, so a control/ignite skill gets the same icon/aura/DoT feedback. Each
// of the 5 classes carries at least one status skill (warrior stun, paladin/mage burn,
// mage/druid slow, druid stun, priest stun). The base `dmg` of any damaging skill is
// further empowered by the hero's BUILD (talent +daño CAS-119 + affix +daño CAS-117) and
// can crit / proc on-hit poison/stun via hitEnemy — so the build is OBSERVABLE on skills.
export const SPELLS = {
  warrior: [
    {id:"shieldbash", type:"cone", cost:8,  cd:3.0, dmg:20, range:74, arc:Math.PI*0.70, status:{type:"stun",dur:0.9}, knock:1.7, col:"#dfe6f0", fx:"conecast", sfx:"sword"},
    {id:"warcry",     type:"buff", cost:12, cd:9.0, stat:"dmg", amt:9,  dur:6.0, col:"#c8313a", fx:"buffaura", sfx:"rune"}, // CAS-211 (d): crimson fury, not amber — warrior is physical, FOUNTAINS martial signal
    {id:"charge",     type:"dash", cost:14, cd:5.0, dmg:30, range:64, col:"#dfe6f0", fx:"charge", sfx:"roll"},          // CAS-211 (d): cold steel dash trail, not warm gold
  ],
  paladin: [
    {id:"consecration", type:"nova", cost:14, cd:4.0, dmg:26, range:104, heal:10, status:{type:"burn"}, col:"#ffe39a", fx:"holynova", sfx:"rune"},
    {id:"divineshield", type:"buff", cost:12, cd:10.0, stat:"def", amt:11, dur:6.0, col:"#ffe39a", fx:"buffaura", sfx:"heal"},
    {id:"judgment",     type:"proj", cost:16, cd:3.0, dmg:46, spd:480, kind:"judgment", col:"#ffd24d", fx:"spellburst", sfx:"fire"},
  ],
  mage: [
    {id:"fireball", type:"proj", cost:10, cd:1.4, dmg:24, spd:320, kind:"fire", aoe:48, status:{type:"burn"}, col:"#ff7a3a", fx:"flame", sfx:"fire"},
    {id:"frost",    type:"nova", cost:14, cd:3.5, dmg:16, range:110, status:{type:"slow",amt:0.45,dur:2.5}, col:"#7fd6ff", fx:"novacast", style:"crystal", sfx:"rune"},
    {id:"blink",    type:"blink", cost:14, cd:5.5, range:158, iframe:0.42, col:"#9be7ff", fx:"blink", sfx:"roll"},
  ],
  druid: [
    {id:"vines",      type:"nova", cost:12, cd:4.0, dmg:14, range:92,  status:{type:"stun",dur:1.4}, col:"#8fd47a", fx:"novacast", style:"spike", sfx:"rune"},
    // CAS-1598 druid audit: `regen` (passive HoT, no agency) → `floracion` — nature burst that
    // heals the hero + AoE-damages + slows nearby enemies. REUSES the existing nova+heal resolver
    // (same shape as paladin.consecration) → 0 new combat code, 0 new RNG path. (Priest slot-2 audit
    // was delivered by sibling CAS-1600 as `holynova`; anatema dropped to avoid clobbering it.)
    {id:"floracion", type:"nova", cost:12, cd:5.0, dmg:14, range:88, heal:10, status:{type:"slow",amt:0.4,dur:2.2}, col:"#7bd44a", fx:"novacast", style:"spike", sfx:"heal"},
    {id:"thornstorm", type:"field", cost:20, cd:6.0, dmg:11, tick:0.5, dur:3.0, range:74, offset:46, status:{type:"slow",amt:0.6,dur:1.1}, col:"#5fae4a", fx:"thornfield", style:"spike", sfx:"rune"},
  ],
  priest: [
    {id:"greaterheal", type:"heal", cost:16, cd:5.0, heal:60, col:"#7fffa8", fx:"healburst", sfx:"heal"},
    // CAS-1600: reasignación del slot redundante `powerword` (+def buff, solapado con Égida/
    // divineshield/boons) por Nova Sagrada — daño AoE con cura menor. REUTILIZA el resolver
    // `nova` existente (mismo shape que paladin.consecration: nova+dmg+heal+status) → 0 código
    // de combate nuevo. Priest queda greaterheal / holynova / smite = battle-priest coherente
    // que conserva su identidad de sanador (support-DPS). No añade 4º slot (spellCD[1..3] intacto).
    {id:"holynova",    type:"nova", cost:14, cd:6.0, dmg:24, range:104, heal:8, status:{type:"burn"}, col:"#fff0b0", fx:"holynova", sfx:"rune"},
    {id:"smite",       type:"proj", cost:14, cd:2.4, dmg:38, spd:460, kind:"holybolt", status:{type:"stun",dur:0.6}, col:"#fff0b0", fx:"spellburst", sfx:"fire"},
  ],
};

// CAS-1570 — ACTIVE ABILITIES: a CLASS-AGNOSTIC pool the player drafts 2 of at run
// start (the ability-select scene). Deliberately data-shaped exactly like SPELLS so a
// drafted ability runs through the SAME resolveSpell engine (dash/nova/buff/chain) with
// its own cooldown (h.abilCD) + mana gate + radial HUD — ZERO new combat code paths
// beyond the one new `chain` resolver. Purely additive to the class spells (slots 1-3):
// abilities live on their own 2 slots + keys, so v2 meta saves are untouched.
// `glyph` drives the HUD icon at $0 (no PNG art needed); `name`/`desc` label the draft.
export const ACTIVE_ABILITIES = [
  {id:"arremetida", name:"Arremetida",       glyph:"»", type:"dash", cost:6,  cd:4.0, dmg:34, range:78, col:"#dfe6f0", fx:"charge",   sfx:"roll",
    desc:"Embestida corta: cierra distancia y golpea. CD bajo."},
  {id:"escarcha",   name:"Nova de Escarcha", glyph:"❄", type:"nova", cost:12, cd:7.0, dmg:22, range:118, status:{type:"slow",amt:0.5,dur:2.6}, col:"#7fd6ff", fx:"novacast", style:"crystal", sfx:"rune",
    desc:"Estallido de hielo en área: daña y ralentiza. CD medio."},
  {id:"egida",      name:"Égida",            glyph:"✚", type:"buff", cost:12, cd:9.0, stat:"def", amt:12, dur:5.0, col:"#ffe39a", fx:"buffaura", sfx:"heal",
    desc:"Ward temporal: sube defensa unos segundos. CD medio."},
  {id:"rayo",       name:"Cadena de Rayo",   glyph:"⚡", type:"chain", cost:12, cd:6.0, dmg:26, range:150, jumps:3, jumpRange:130, falloff:0.78, status:{type:"stun",dur:0.3}, col:"#bfe6ff", fx:"spellburst", sfx:"fire",
    desc:"Descarga que salta entre enemigos cercanos. CD medio."},
  // CAS-1580 — LOCKED abilities (Esencia-unlockable at the altar). `locked:true` keeps them OUT of the
  // run-start draft pool until the matching ABILITY_UNLOCKS row is bought. Each REUSES an existing
  // resolveSpell resolver (dash/nova/buff/field) → ZERO new combat code. Glyphs = $0 art. Distinct
  // roles/colours from the 4 originals so the draft stays legible. Appended AFTER the originals so
  // DEFAULT_LOADOUT (index 0/1) and the un-upgraded draft are byte-identical to before (RNG-neutral).
  {id:"parpadeo",   name:"Parpadeo",          glyph:"≫", type:"dash", cost:8,  cd:8.0, dmg:12, range:132, col:"#c9b3ff", fx:"charge", sfx:"roll", locked:true,
    desc:"Impulso arcano de largo alcance: reposiciona y roza al enemigo. Utilidad de movilidad."},
  {id:"llamarada",  name:"Llamarada",         glyph:"✸", type:"nova", cost:16, cd:8.0, dmg:30, range:112, status:{type:"burn"}, col:"#ff7a3a", fx:"novacast", sfx:"fire", locked:true,
    desc:"Estallido de fuego en área: daña y prende (quemadura). Distinta de la escarcha helada."},
  {id:"furia",      name:"Furia",             glyph:"⚔", type:"buff", cost:12, cd:10.0, stat:"dmg", amt:10, dur:5.0, col:"#ff6a4d", fx:"buffaura", sfx:"heal", locked:true,
    desc:"Frenesí temporal: aumenta tu daño unos segundos. Buff ofensivo, distinto de la Égida."},
  {id:"brasas",     name:"Brasas",            glyph:"✷", type:"field", cost:14, cd:9.0, dmg:8, range:70, tick:0.5, dur:4.0, offset:44, col:"#ff8a3a", style:"spike", fx:"novacast", sfx:"fire", locked:true,
    desc:"Zona de brasas persistente: daña con el tiempo a quien la pise. Denegación de área."},
];
export const ABILITY_MAP = Object.fromEntries(ACTIVE_ABILITIES.map(a=>[a.id,a]));
// Default loadout for a fresh hero (first two of the pool) so abilities always exist
// even if the draft is skipped (respawn / test harness / legacy entry).
export const DEFAULT_LOADOUT = [ACTIVE_ABILITIES[0].id, ACTIVE_ABILITIES[1].id];

// CAS-1659 — HABILIDAD DEFINITIVA (Ultimate) + medidor de carga. A high-impact combat payoff in
// its OWN slot (separate from the 2 drafted abilities): it CHARGES from combat (damage dealt +
// kills, NO mana) and unleashes when the meter is full, consuming it entirely. Each entry REUSES
// an existing resolveSpell `type` (nova/field/buff+heal/chain) → ZERO new combat code, $0 art
// (text glyph). Drafted 1-of-3 at run start via a DEDICATED RNG stream (never the shared srand),
// so a run's authoritative sequence is byte-identical whether or not an Ultimate is drafted.
// No `cost` (mana) and no timed `cd`: gated purely by charge (the refill IS the cooldown).
export const ULT_CHARGE_PER_DMG = 0.0075;   // meter gain per point of hero damage dealt (fills over ~2-3 fights)
export const ULT_CHARGE_PER_KILL = 0.04;    // flat meter bump per kill (keeps the fill legible)
export const ULT_OFFER_N = 3;               // run-start offer size (3-of-4)
export const ULTIMATES = [
  {id:"torbellino", name:"Torbellino",           glyph:"✳", type:"nova",  dmg:80, range:150, col:"#ffd24d", fx:"novacast", style:"crystal", sfx:"crit",
    desc:"Torbellino devastador: enorme estallido cuerpo a cuerpo a tu alrededor."},
  {id:"meteoro",    name:"Meteoro",              glyph:"☄", type:"field", dmg:26, range:132, tick:0.4, dur:2.4, offset:0, col:"#ff7a3a", style:"spike", fx:"novacast", sfx:"fire",
    desc:"Impacto de meteoro: revienta un área enorme y deja brasas ardientes."},
  {id:"bastion",    name:"Bastión",              glyph:"⛨", type:"buff",  stat:"def", amt:60, dur:5.0, heal:120, col:"#9be7ff", fx:"buffaura", sfx:"heal",
    desc:"Bastión sagrado: te cura y te vuelve casi invulnerable unos segundos."},
  {id:"tormenta",   name:"Tormenta de Cadenas",  glyph:"⚡", type:"chain", dmg:48, range:240, jumps:8, jumpRange:170, falloff:0.9, status:{type:"stun",dur:0.4}, col:"#bfe6ff", fx:"spellburst", sfx:"fire",
    desc:"Tormenta que salta entre muchos enemigos cercanos, aturdiéndolos."},
];
export const ULTIMATE_MAP = Object.fromEntries(ULTIMATES.map(u=>[u.id,u]));

// CAS-1574 — ABILITY RANKS: PERMANENT, Esencia-bought upgrades to each active ability, one
// row per ability, ONE scaled parameter each. Purely data: the cost curve, cap, effect text
// and the scaling FORMULA (`apply`) all live here — the single source of truth — so designers
// retune without touching sim/render code. `apply(sp,lvl)` returns a COPY of the ability's data
// with the one param scaled; the cast seam swaps in that copy ONLY when the bought rank > 0, so
// a run with no purchase is 0-delta (same object, identical behaviour + RNG). `apply` NEVER
// touches RNG. Reuses the ability's own `glyph` for the altar icon → $0 art (CAS-412 lineage).
// Cost curve is data-driven + strictly increasing per rank (30·1.6^lvl → 30 / 48 / 77).
export const ABILITY_RANKS = [
  // arremetida (dash) → +daño
  { key:"rank_arremetida", abil:"arremetida", cap:3, glyph:"»", label:"Arremetida",
    cost:l=>Math.round(30*Math.pow(1.6,l)),
    eff:l=>l>0?("+"+(8*l)+" daño"):"daño de embestida",
    apply:(sp,l)=>({ ...sp, dmg:(sp.dmg||0)+8*l }) },
  // escarcha (nova) → +radio
  { key:"rank_escarcha", abil:"escarcha", cap:3, glyph:"❄", label:"Nova de Escarcha",
    cost:l=>Math.round(30*Math.pow(1.6,l)),
    eff:l=>l>0?("+"+(16*l)+" radio"):"radio del estallido",
    apply:(sp,l)=>({ ...sp, range:(sp.range||0)+16*l }) },
  // egida (buff) → +duración
  { key:"rank_egida", abil:"egida", cap:3, glyph:"✚", label:"Égida",
    cost:l=>Math.round(30*Math.pow(1.6,l)),
    eff:l=>l>0?("+"+l+"s duración"):"duración del ward",
    apply:(sp,l)=>({ ...sp, dur:(sp.dur||0)+1*l }) },
  // rayo (chain) → −cooldown (piso 1s)
  { key:"rank_rayo", abil:"rayo", cap:3, glyph:"⚡", label:"Cadena de Rayo",
    cost:l=>Math.round(30*Math.pow(1.6,l)),
    eff:l=>l>0?("−"+(0.6*l).toFixed(1).replace(/\.0$/,"")+"s recarga"):"recarga de la cadena",
    apply:(sp,l)=>({ ...sp, cd:Math.max(1,(sp.cd||0)-0.6*l) }) },
];
export const ABILITY_RANK_MAP = Object.fromEntries(ABILITY_RANKS.map(r=>[r.abil,r]));

// CAS-1580 — ABILITY UNLOCKS: one PERMANENT, Esencia-bought row per LOCKED ability (cap:1). A row at
// lvl 0 = locked (hidden from the draft); buying it (lvl 1) unlocks the ability forever. These rows
// JOIN the SAME meta store as ABILITY_RANKS (buy/persist/migrate for free via buyMetaNode/META_MAP);
// they are NEVER added to T2_MAP so they are ungated by t2Unlocked(). Cost is data-driven per rarity
// (60/90/120/150) — the single source of truth, retune here with no code change. `eff` is the short
// altar blurb; `glyph` reuses the ability's own glyph → $0 art. Blobs without unlock_* load to 0 = locked.
export const ABILITY_UNLOCKS = [
  { key:"unlock_furia",     abil:"furia",     cap:1, cost:()=>60,  glyph:"⚔", label:"Furia",     eff:"Buff ofensivo de daño" },
  { key:"unlock_parpadeo",  abil:"parpadeo",  cap:1, cost:()=>90,  glyph:"≫", label:"Parpadeo",  eff:"Movilidad de largo alcance" },
  { key:"unlock_llamarada", abil:"llamarada", cap:1, cost:()=>120, glyph:"✸", label:"Llamarada", eff:"Nova de fuego (quemadura)" },
  { key:"unlock_brasas",    abil:"brasas",    cap:1, cost:()=>150, glyph:"✷", label:"Brasas",    eff:"Zona de daño persistente" },
];
export const ABILITY_UNLOCK_MAP = Object.fromEntries(ABILITY_UNLOCKS.map(r=>[r.abil,r]));

// gearChance = per-kill probability this enemy drops a gear instance (rolled on
// the sim RNG in killEnemy). The drop's tier window is the kill ZONE (ZONE_LOOT
// in sim/gear.js); the golem boss ignores chance and guarantees a rare+ drop.
//
// CAS-115 — combat ARCHETYPE (`arch`): the read-and-react identity layer. Three
// behaviours, all driven by the shared windup→strike→recover AI in sim.js (no per-mob
// code branch) so adding/retuning an archetype is a data edit and stays deterministic /
// Stage-2 server-authority ready. Each carries a PERCEPTIBLE pre-hit telegraph the
// player can read and dodge (render.js draws the tell off `arch` during the windup):
//   rusher — fast closer, SHORT windup then a forward LUNGE strike (`lunge` px dashed
//            over the strike window). Telegraph: a forward lunge-streak arrow.
//   caster — ranged kiter: holds the `kite`..`range` band, RETREATS when the hero gets
//            inside `kite`, fires a telegraphed projectile (aim-line tell). Fragile.
//   brute  — slow tank, BIG HP, LONG windup then a small radial GROUND-SLAM AoE
//            (`aoe` px) with heavy knockback. Telegraph: a filled ground ring that
//            grows to the AoE radius. Hardest hitter → richest trash reward.
//
// CAS-126 — three NEW archetypes that raise encounter variety + zone identity. Same
// rule: pure data on the shared windup→strike→recover AI (no per-mob code path), each
// with a PERCEPTIBLE telegraph drawn off `arch` in render.js, deterministic / Stage-2
// ready. They turn a zone's pack composition into a distinct fight, not a reskin:
//   charger — heavy TANK that COMMITS a long straight-line CHARGE. Unlike the rusher's
//             short tracking lunge it LOCKS its facing at windup and barrels the full
//             `charge` px, ploughing PAST the hero (huge knock). Telegraph: a fixed,
//             wide charge LANE — sidestep the lane, not the mob. Long recover after.
//   summoner— fragile BACKLINE that, instead of attacking, SUMMONS adds on its cadence
//             (`summon`: {type,count,cap,r}; crowd-capped so it never floods). Holds the
//             `kite`..`range` band like a caster but never melees/fires. Telegraph: a
//             growing summon glyph-ring. Kill it to stop the tide. Deals 0 direct dmg.
//   healer  — pack MEDIC that HEALS the most-wounded ally in `heal.r` by `heal.amt` of
//             its max HP each cadence. Holds back like a kiter. Telegraph: a green heal
//             TETHER to its target during the windup. Focus it or the pack won't die.
//             Deals 0 direct dmg — pure force-multiplier, never an OP solo threat.
// CAS-146 — a seventh archetype that adds a NEW combat verb (area-denial-by-self):
//   volatile— a fragile SUICIDE-BOMBER. Sprints at the hero (rusher-fast), and the instant
//             it reaches strike range it FREEZES and telegraphs a GROWING red blast ring,
//             then DETONATES a radial AoE (`blast` px, heavy hit) and DIES. Distinct from
//             the brute (slow + tanky + survives the slam): the volatile is fast, paper-thin
//             and one-shot, so the read is "kill it at range or clear the blast radius" — a
//             pressure the roster lacked. Pure data on the shared windup→strike AI (the
//             strike branch detonates + self-destructs); a self-kill yields NO loot/xp (the
//             player didn't earn it), so it can never be farmed as a free reward.
// Untagged rows keep the legacy generic-melee behaviour (rat/skeleton chumps, neutral
// adv, and the champion/boss base rows whose elite mechanics layer on top in HUNTS).
export const ETPL = {
  // rusher: forest pounce beast — short tell, then a quick lunge in
  wolf:    {hp:34, dmg:10, spd:128, aggro:240, range:42, windup:0.42, recover:0.45, xp:12, gold:[2,6], sprite:"wolf", size:18, knock:140, boss:false, gearChance:0.14, arch:"rusher", lunge:118},
  rat:     {hp:20, dmg:6,  spd:132, aggro:170, range:36, windup:0.35, recover:0.4,  xp:8,  gold:[1,4], sprite:"rat", size:15, knock:110, boss:false, gearChance:0.10},
  skeleton:{hp:52, dmg:14, spd:86,  aggro:230, range:46, windup:0.6,  recover:0.55, xp:20, gold:[4,9], sprite:"skel", size:20, knock:120, boss:false, gearChance:0.22},
  // brute: slow, tanky, telegraphed ground-slam AoE + big knock; top trash reward
  orc:     {hp:96, dmg:24, spd:64,  aggro:220, range:50, windup:0.82, recover:0.72, xp:40, gold:[11,20],sprite:"orc", size:22, knock:150, boss:false, gearChance:0.30, arch:"brute", aoe:60},
  // caster: ranged kiter — keeps the band, retreats when crowded, slings a spear
  spearman:{hp:42, dmg:13, spd:78,  aggro:300, range:210, windup:0.7, recover:0.75, xp:30, gold:[8,15],sprite:"skel", size:19, knock:80, boss:false, ranged:true, projspd:300, proj:"spear", gearChance:0.24, arch:"caster", kite:150},
  mage:    {hp:56, dmg:16, spd:62,  aggro:340, range:250, windup:0.9, recover:0.85, xp:36, gold:[11,20],sprite:"skel", size:21, knock:60, boss:false, ranged:true, projspd:240, proj:"bolt", gearChance:0.26, arch:"caster", kite:170},
  // CAS-60: new mob variety — bat (forest flyer), bandit (ruins rogue), wraith (caves ranged ghost)
  bat:     {hp:16, dmg:7,  spd:158, aggro:220, range:34, windup:0.28, recover:0.35, xp:9,  gold:[1,4], sprite:"bat",    size:14, knock:90,  boss:false, gearChance:0.08, arch:"rusher", lunge:96},
  // CAS-118: the bandit's telegraphed LUNGE coats its blade in poison — a contact hit
  // applies `infl` to the hero. Reading the dashed lunge-line tell (render.js) and
  // sidestepping avoids BOTH the hit and the status (damageHero skips infl on a dodge).
  bandit:  {hp:60, dmg:18, spd:106, aggro:250, range:48, windup:0.5,  recover:0.55, xp:30, gold:[11,21],sprite:"bandit", size:19, knock:110, boss:false, gearChance:0.26, arch:"rusher", lunge:132, infl:{type:"poison",dmg:4,dur:4}},
  // CAS-118: the wraith's bolt carries a chilling SLOW — its aim-line tell during windup
  // telegraphs the shot; dodging the bolt avoids the slow (infl rides the projectile).
  wraith:  {hp:48, dmg:15, spd:66,  aggro:320, range:230, windup:0.85,recover:0.8,  xp:32, gold:[9,17], sprite:"wraith", size:20, knock:60,  boss:false, ranged:true, projspd:260, proj:"bolt", gearChance:0.26, arch:"caster", kite:162, infl:{type:"slow",amt:0.5,dur:2.2}},
  golem:   {hp:640,dmg:30, spd:46,  aggro:360, range:64, windup:0.95, recover:0.8,  xp:220,gold:[60,90],sprite:"golem",size:36, knock:60, boss:true},
  // CAS-317 (board CAS-310 / art CAS-313) — the dracónic Stage-1 caves BOSS. Repoints the
  // legacy caves boss (spawnBoss) from the golem blob onto the 6-anim PixelLab dragon. A
  // plain telegraphed melee bruiser (no arch → readable windup→strike), but `richAnim:true`
  // drives the new attack1/attack2/hurt/death sprite states and `special` arms a heavy combo
  // (attack2) on a strike cadence. CAS-331: size 42→50 + range/knock proportional to the bigger
  // sprite (strip.tiles 4.6→7.5, strip.footPad grounds it); still telegraphed + enfrentable.
  dragon:  {hp:820,dmg:34, spd:52,  aggro:380, range:80, windup:0.92, recover:0.78, xp:300,gold:[90,140],sprite:"dragon",size:50, knock:85, boss:true, richAnim:true, bossLabel:"DRAGÓN ANCESTRAL",
            special:{ name:"Aliento Dracónico", every:3, windup:1.0, slam:{ count:14, spd:180, dmg:22, life:1.2 } } },
  // CAS-76: animated "Moose" bruiser (Ancient Ruins pack). A heavy charger — long
  // antler-rear telegraph (windup 0.85 → matches the 30-frame attack strip), big
  // hooved knockback, slots into the tier-2 ruins pool. Melee, deterministic.
  // sprite "orc" is only the procedural fallback for the sub-second asset-load window
  // (same convention as mage→"skel"); ENEMY_ANIM.moose drives the real animated strips.
  moose:   {hp:150,dmg:26, spd:82,  aggro:260, range:56, windup:0.88, recover:0.7,  xp:48, gold:[14,24],sprite:"orc",  size:26, knock:200, boss:false, gearChance:0.32, arch:"brute", aoe:68},
  // CAS-126 — charger: tier-4/5 charge-pit tank. Commits a long locked-facing dash
  // (`charge` px) that ploughs past the hero with massive knock; the wide fixed lane is
  // the tell. Big HP, long recover → a punishing but readable repositioning threat.
  charger: {hp:140, dmg:25, spd:74, aggro:300, range:215, windup:0.66, recover:0.9, xp:46, gold:[12,22],sprite:"orc",  size:26, knock:235, boss:false, gearChance:0.30, arch:"charger", charge:300},
  // CAS-126 — summoner: fragile necromancer backline. Holds the band, raises adds on
  // cadence (crowd-capped). 0 direct dmg — its threat is the tide; focus-kill to stop it.
  summoner:{hp:46,  dmg:0,  spd:60, aggro:330, range:260, windup:0.95, recover:0.95,xp:34, gold:[10,18],sprite:"skel", size:20, knock:40,  boss:false, gearChance:0.24, arch:"summoner", kite:170, summon:{type:"skeleton", count:2, cap:4, r:130}},
  // CAS-126 — healer: pack medic. Tethers + heals the most-wounded ally each cadence.
  // 0 direct dmg, fragile (50 hp). The force-multiplier that makes a pack attritional.
  healer:  {hp:50,  dmg:0,  spd:66, aggro:330, range:240, windup:0.82, recover:0.85,xp:32, gold:[9,17], sprite:"adv",  size:19, knock:50,  boss:false, gearChance:0.24, arch:"healer", kite:155, heal:{amt:0.16, r:200}},
  // CAS-146 — volatile: fast, fragile suicide-bomber. Closes like a rusher, then on reaching
  // range it freezes, telegraphs a growing blast ring, DETONATES a radial AoE and dies.
  // High dmg (one-shot threat) but tiny HP (kill it before it reaches you). Self-kill = no loot.
  volatile:{hp:26, dmg:23, spd:152, aggro:300, range:40, windup:0.7,  recover:0.1,  xp:16, gold:[3,8], sprite:"bat",  size:16, knock:60,  boss:false, gearChance:0.10, arch:"volatile", blast:80},
  // CAS-210 — punisher (FOUNTAINS-style high-skill DUELIST / "boss seed"): a relentless
  // COMBO attacker. It commits a chain of `combo` telegraphed swings — each follow-up winds
  // up FASTER (`comboWindup` < `windup`), so a clean first dodge isn't enough: greedy re-
  // engagement after the first swing eats the next hit. After the full chain it drops into a
  // LONG `punishRecover` — the read-and-punish window where a perfect-dodge → riposte counter
  // lands hardest. Tracks the hero through the chain (relentless), melee, deterministic.
  revenant:{hp:120, dmg:22, spd:104, aggro:300, range:50, windup:0.62, recover:0.55, xp:64, gold:[16,28], sprite:"bandit", size:20, knock:120, boss:false, gearChance:0.32, arch:"punisher", combo:3, comboWindup:0.30, punishRecover:1.15},
  adv:     {hp:64, dmg:16, spd:96,  aggro:0,   range:44, windup:0.5,  recover:0.5,  xp:0,  gold:[0,0], sprite:"adv", size:18, knock:120, boss:false, neutral:true},
  // CAS-321 — dark_demon_3 (board art, commit 41e311c). A HYBRID "warlock" archetype: it
  // closes like a melee threat but zaps from the backline. The new arch="warlock" (sim.js)
  // drives BOTH board animations off the engagement distance — claw (animState "attack")
  // when the hero is inside `meleeR`, warlock cast (animState "cast", a hidden bolt per the
  // CAS-303/304 ranged convention) at `meleeR`..`range`. size 28 → ~2.1 tiles tall (imposing,
  // bigger than trash). Slotted into the Abismo (tier-5) trash pool; NOT persisted → no
  // SAVE_VERSION bump. Stats sit between revenant (bruiser) and mage (caster) so it reads as a
  // standout mini-threat without re-tuning any existing mob (soak-safe, deterministic).
  demon:   {hp:135, dmg:23, spd:72, aggro:330, range:235, windup:0.82, recover:0.72, xp:58, gold:[15,28], sprite:"demon", size:28, knock:110, boss:false, gearChance:0.32, arch:"warlock", projspd:235, proj:"bolt", meleeR:54},
  // CAS-360 (art CAS-356) — Quillback Stalker: a quilled cave beast. NOT a boss. Combat profile
  // is a VERBATIM clone of `skeleton` (the plain caves melee — readable windup→strike, no arch),
  // so dropping it into the caves trash pool adds bestiary variety at the EXACT existing power
  // band — zero new tuning, no balance shift. Only `sprite` + `richAnim` differ: richAnim drives
  // the 5 PixelLab strips (idle/walk loop, attack1/hurt one-shot, death corpse — see ENEMY_STRIPS).
  quillback:{hp:52, dmg:14, spd:86,  aggro:230, range:46, windup:0.6,  recover:0.55, xp:20, gold:[4,9], sprite:"quillback", size:20, knock:120, boss:false, gearChance:0.22, richAnim:true},
  // CAS-363 (art CAS-355 / board CAS-351) — Wendigo: a dark antlered wraith-shaman CASTER.
  // Reuses the proven `warlock` hybrid archetype (CAS-321/demon): it zaps a hidden bolt
  // (CAS-303/304 ranged convention — its purple cast strip is the telegraph) from `meleeR`..`range`
  // and staff-claws inside `meleeR`. `richAnim:true` drives the 5 PixelLab strips (idle/walk loop,
  // attack1/hurt one-shot, death corpse — see ENEMY_STRIPS). Stats sit inside the Abismo (tier-5)
  // caster band, just under the demon — a standout ranged threat that adds bestiary variety WITHOUT
  // re-tuning any existing mob (soak-safe, deterministic, NOT persisted → no SAVE_VERSION bump).
  // size 24 → ~1.8 tiles tall (reads bigger than the wraith, leaner than the demon bruiser-caster).
  wendigo: {hp:118, dmg:21, spd:70, aggro:330, range:230, windup:0.85, recover:0.76, xp:54, gold:[14,26], sprite:"wendigo", size:24, knock:95, boss:false, gearChance:0.30, arch:"warlock", projspd:230, proj:"bolt", meleeR:50, richAnim:true},
  // CAS-442 (art CAS-440 / zone CAS-441) — the Ciénaga de Bruma FAMILY. Three trash rows +
  // the zone capstone, each on a PROVEN archetype (no new AI branch) so the marsh reads as a
  // distinct fight: an ambusher that closes fast, a floating caster that zaps from the mist,
  // and a charging tank that owns a lane. All richAnim → the 5 PixelLab strips per mob
  // (idle/walk loop, attack1/hurt one-shot, death corpse — see ENEMY_STRIPS); the SP[key]
  // procedural fallbacks in sprites.js cover the asset-load window (CAS-360 crash guard).
  // Base stats sit in the standard trash band — ZONE_TIER.swamp (tier-4, 2.10/1.55) does the
  // zone-side scaling, so these rows stay reusable and the balance path is untouched.
  // mudlurker — Acechador del Fango: mud AMBUSHER (rusher). Bandit-band closer with a longer
  // lunge (crouch-surge strip): the dashed lunge-line tell is the read, sidestep to punish.
  mudlurker:{hp:64, dmg:18, spd:112, aggro:250, range:46, windup:0.48, recover:0.55, xp:30, gold:[9,17], sprite:"mudlurker", size:20, knock:120, boss:false, gearChance:0.26, arch:"rusher", lunge:126, richAnim:true},
  // wisp — Fuego Fatuo: floating marsh-light CASTER on the proven warlock hybrid (CAS-321):
  // zaps a hidden bolt from meleeR..range (the fireball-cast strip is the telegraph), scorches
  // at contact inside meleeR. Fragile — close the gap and it folds.
  wisp:     {hp:46, dmg:15, spd:64, aggro:330, range:235, windup:0.85, recover:0.8,  xp:32, gold:[10,18], sprite:"wisp", size:18, knock:50, boss:false, gearChance:0.26, arch:"warlock", projspd:235, proj:"bolt", meleeR:46, richAnim:true},
  // toadbrute — Bruto Sapo: bloated TANK on the charger archetype (CAS-126): locks facing and
  // barrels the full charge lane with massive knock (charge-slam strip). Dodge the lane, then
  // punish the long recover.
  toadbrute:{hp:145,dmg:25, spd:72, aggro:290, range:205, windup:0.68, recover:0.92, xp:46, gold:[12,22], sprite:"toadbrute", size:26, knock:225, boss:false, gearChance:0.30, arch:"charger", charge:280, richAnim:true},
  // bogtyrant — Tirano del Pantano: the Ciénaga ZONE CAPSTONE (HUNTS.swamp.boss reads these
  // stats verbatim, dragon convention). A telegraphed melee bruiser: attack1 = club-smash
  // (windup telegraph baked into the strip), and `special` arms the club-SWEEP (attack2) every
  // 3rd strike through the proven CAS-109 radial-slam channel. richAnim drives all 6 strips.
  bogtyrant:{hp:940,dmg:35, spd:50, aggro:380, range:76, windup:0.94, recover:0.8,  xp:300,gold:[90,140],sprite:"bogtyrant",size:44, knock:88, boss:true, richAnim:true, bossLabel:"TIRANO DEL PANTANO",
            special:{ name:"Barrido del Pantano", every:3, windup:1.0, slam:{ count:12, spd:170, dmg:20, life:1.15 } } },

  // CAS-1694 (padre CAS-1692) — NUEVOS MOBS de las CAVES (tier-3, sin power-gate). 3 trash rows nuevos,
  // cada uno CLON verbatim de un arquetipo tier-3 EXISTENTE (mage/orc) → CERO IA/rama de combate nueva;
  // escalan por applyZoneScale("caves"). Sólo `sprite` (+ size) difieren del molde. Gated tras
  // NEW_MOBS.enabled (world.js caves spawner); con enabled:false el pool NO cambia ⇒ sim byte-idéntico.
  // Arte FOUNTAINS: ENEMY_IMG side-view cutouts (mismo path que skel/bandit/orc); si el PNG falta el
  // fallback SP procedural cubre sin crash (CAS-360).
  // ashwraith — caster a distancia: CLON de `mage` (bolt ceniciento). Kitea y castea, telegrafía el windup.
  ashwraith:   {hp:56, dmg:16, spd:62, aggro:340, range:250, windup:0.9,  recover:0.85, xp:36, gold:[11,20], sprite:"ashwraith",    size:26, knock:60,  boss:false, gearChance:0.26, ranged:true, arch:"caster", kite:170, projspd:240, proj:"bolt", richAnim:true},
  // ironback — bruto/tanque melee: CLON de `orc` (ground-slam AoE) con hp/dmg/knock ALTOS y spd lento.
  ironback:    {hp:112,dmg:26, spd:58, aggro:220, range:52, windup:0.86, recover:0.74, xp:44, gold:[12,22], sprite:"ironback",     size:28, knock:200, boss:false, gearChance:0.30, arch:"brute", aoe:64, richAnim:true},
  // thornspitter — a distancia: CLON de `mage`/quillback que aplica infl (veneno) montado en el proyectil,
  // como el bolt-slow del wraith (CAS-118). Dodgear el proj evita el veneno (infl viaja con el disparo).
  thornspitter:{hp:52, dmg:14, spd:66, aggro:320, range:230, windup:0.85, recover:0.8,  xp:34, gold:[10,18], sprite:"thornspitter", size:24, knock:55,  boss:false, gearChance:0.26, ranged:true, arch:"caster", kite:160, projspd:230, proj:"bolt", infl:{type:"poison",dmg:4,dur:3.5}, richAnim:true},
  // CAS-1744 (art CAS-1778) — los MOBS de la CALDERA (tier-5, power-gated). Cada uno CLON verbatim de un
  // arquetipo EXISTENTE → CERO IA/rama de combate nueva; escalan por applyZoneScale("caldera"). Gated tras
  // ZONE5.enabled (world.js caldera spawner); con enabled:false el bloque no corre ⇒ sim byte-idéntico.
  // emberkin — "Cenizo": caster a distancia CLON de wraith/thornspitter que aplica `burn` (STATUS ya existente,
  // CAS-118) montado en el proyectil — dodgear el bolt evita la quemadura. richAnim (5 strips FOUNTAINS).
  emberkin:    {hp:58, dmg:16, spd:66, aggro:330, range:240, windup:0.88, recover:0.82, xp:38, gold:[12,21], sprite:"emberkin",     size:24, knock:58,  boss:false, gearChance:0.26, ranged:true, arch:"caster", kite:165, projspd:240, proj:"bolt", infl:{type:"burn",dmg:4,dur:2.6}, richAnim:true},
  // magmabrute — "Bruto de Magma": bruto/tanque melee CLON de orc/ironback (ground-slam AoE) con hp/dmg/knock
  // ALTOS y spd lento. richAnim (5 strips FOUNTAINS).
  magmabrute:  {hp:132,dmg:28, spd:56, aggro:220, range:52, windup:0.88,  recover:0.76, xp:48, gold:[14,26], sprite:"magmabrute",   size:30, knock:210, boss:false, gearChance:0.30, arch:"brute", aoe:66, richAnim:true},
  // calderatyrant — Corazón de Magma: la Caldera ZONE CAPSTONE (HUNTS.caldera.boss lee estas stats verbatim,
  // dragon convention). Bruiser melee telegrafiado: attack1 = golpe, `special` arma la Erupción (attack2) cada
  // 3er golpe por el canal CAS-109 radial-slam. richAnim mueve los 5 strips.
  calderatyrant:{hp:1020,dmg:38, spd:52, aggro:380, range:78, windup:0.95, recover:0.8, xp:340,gold:[110,170],sprite:"calderatyrant",size:46, knock:90, boss:true, richAnim:true, bossLabel:"CORAZÓN DE MAGMA",
            special:{ name:"Erupción de la Caldera", every:3, windup:1.0, slam:{ count:14, spd:180, dmg:24, life:1.2 } } },
};

// CAS-146 — ELITE AMBUSH / pack event. While the hero is actively fighting inside a hunt
// zone, a deterministic cadence counts down; when it elapses a coordinated AMBUSH erupts —
// a small pack of zone trash PLUS one ELITE leader (a promoted zone mob: bigger, much
// tougher, its own pulsing aura, keeps its archetype telegraph so the fight stays readable)
// drops in around the hero for a burst of challenge and a GUARANTEED elevated loot roll that
// feeds the merchant gold-sink economy (CAS-112). It is loudly telegraphed (warning toast +
// sting + spawn rings) so it reads as an EVENT, never a cheap off-screen gank, and it never
// stacks on a live champion/capstone (the hunt climax owns the screen). Fork-neutral: a
// deterministic, server-authority-ready world event (no client-only logic, all on the sim
// RNG) that carries intact into a Stage-2 online layer as a shared world spawn. Pure data —
// spawnAmbush() in sim.js reads this table; adding/retuning an ambush is a one-line edit.
//   first / cooldown — seconds of in-zone presence before the first / each later ambush
//   packMin / packMax — trash mobs that drop in with the elite (zone-scaled, real spawn path)
//   ring — [min,max] spawn radius around the hero (far enough to read, close enough to commit)
//   elite — the leader's promotion over the zone-scaled base: stat mults + reward floor.
//           The reward tier WINDOW comes from the kill zone's ZONE_LOOT, so deeper-zone
//           ambushes already pay richer loot without a per-zone branch.
export const AMBUSH = {
  first:14, cooldown:42, packMin:2, packMax:4, ring:[170,240],
  elite:{ hpMul:5.5, dmgMul:1.5, sizeMul:1.4, knockMul:1.3, xpMul:4, goldBonus:35, minR:"uncommon" },
};

// CAS-247 — ELITE AFFIXES. A fraction of ordinary world spawns roll exactly ONE deterministic
// modifier that deepens the hunt loop with ZERO new art (sprite tint/glow/scale only — the
// renderer reads `affix`/`affixGait` to draw a coloured aura+glow and a bigger silhouette; the
// stat modifiers are baked onto a CLONE of the shared ETPL row so the template is never mutated).
// Every affix is pure data on the existing AI: a server-authority-ready world modifier (no
// client-only logic, all rolled on the sim RNG) that carries intact into the Stage-2 online
// layer. Affixed mobs are tougher + pay MORE (xp/gold/Forja-gear chance) so they feed CAS-237/243.
//   rate      — fraction of ELIGIBLE spawns that get an affix (~10-15% band per AC1)
//   col       — the aura/glow/label colour (the at-a-glance read of WHICH affix)
//   hpMul     — every affix makes the mob a meatier, more-rewarding target
//   spdMul/gaitMul — Swift scales BOTH move speed AND the render gait cadence together, so steps
//                    stay natural (regression-guard CAS-219/240 — never desync foot-speed again)
//   dmgReduce — Armored: fraction of incoming hero damage absorbed (0.45 = takes 55%)
//   lifesteal — Vampiric: heals this fraction of its OWN maxHp each time it lands a hit (melee only)
//   blast/blastDmgMul — Volatile: a small AoE erupts on death, dmg = base dmg × blastDmgMul
//   xpMul/goldMul/gearBonus — the reward tie-in (flows through killEnemy's existing trash branch,
//                    which reads the cloned tpl.xp/gold/gearChance → no loot-path edits needed)
//   sizeMul   — the "scale" visual cue; bumps tpl.size so ALL four draw paths render bigger at once
//   melee     — gates the affix to contact attackers (Vampiric can't lifesteal from range)
export const MOB_AFFIX_RATE = 0.13;
export const MOB_AFFIX_IDS = ["swift","armored","vampiric","volatile","frost"];
export const MOB_AFFIX = {
  swift:    { name:"Veloz",      col:"#5fd6ff", hpMul:1.5, spdMul:1.42, gaitMul:1.42, sizeMul:1.06, xpMul:1.6, goldMul:1.6, gearBonus:0.10 },
  armored:  { name:"Acorazado",  col:"#c8d2e0", hpMul:1.9, spdMul:0.92, gaitMul:0.92, dmgReduce:0.45, sizeMul:1.16, xpMul:1.7, goldMul:1.7, gearBonus:0.12 },
  vampiric: { name:"Vampírico",  col:"#ff5a6a", hpMul:1.8, lifesteal:0.10, sizeMul:1.12, xpMul:1.7, goldMul:1.7, gearBonus:0.12, melee:true },
  volatile: { name:"Volátil",    col:"#ff9a3a", hpMul:1.6, blast:84, blastDmgMul:0.85, sizeMul:1.12, xpMul:1.7, goldMul:1.7, gearBonus:0.12 },
  // CAS-1586 AURA GÉLIDA — a ranged control affix (not melee): while the hero stands inside auraR
  // it is slowed to auraSlow (refreshed each tick; the h.slowT channel expires on its own when you
  // step out). Data-driven radius/slow so a playtest can retune without touching the loop.
  frost:    { name:"Aura Gélida", col:"#7fe0ff", hpMul:1.7, auraR:96, auraSlow:0.6, sizeMul:1.12, xpMul:1.7, goldMul:1.7, gearBonus:0.12 },
};
// CAS-1586 tie-in: every affixed (Élite-trash) kill also drips Esencia — closing the meta-progression
// loop so the affix system feeds the altar, not just the loot table. Data-driven (Esencia per kill).
// Pure additive on essenceForRun; RNG-untouched (0 affixed kills at rate=0 → term=0 → byte-identity).
export const MOB_AFFIX_ESSENCE = 2;

// CAS-1590 — ÉLITE CAMPEÓN: a rare, TELEGRAPHED promotion of an already-affixed trash mob into a
// mini-boss that carries 2+ COMBINED affixes (reuses the CAS-247/1585 affix engine wholesale) and
// wears heavier stat multipliers. Purely additive: a champion is a mob that (a) won its normal affix
// roll AND (b) then won this second promotion roll, at which point it gains a SECOND distinct affix +
// the CHAMPION stat block. On death it drops GUARANTEED Esencia (data-driven) plus a guaranteed
// superior gear drop and a roll for a unique/legendary. $0 art — the telegraph reuses the affix
// tint/halo layers + a gold champion ring/nameplate.
//
// RNG-NEUTRALITY: the promotion roll is entirely skipped when CHAMPION_RATE<=0 (maybeChampion returns
// before any srand()). So at rate=0 no champion ever spawns, no extra srand is drawn, and the sim +
// loot streams stay BYTE-IDENTICAL to the affix-only build eb60f87e4ca1. Ship rate>0 to turn it on.
export const CHAMPION_RATE = 0.18;   // P(promote | mob already rolled an affix). Effective world rate ≈ MOB_AFFIX_RATE × this.
export const CHAMPION = {
  name:"Campeón", col:"#ffd24d",
  hpMul:2.6,        // MUCH tankier — layered ON TOP of the two affixes' own hpMuls (mini-boss health)
  dmgMul:1.6,       // hits harder (scales the cloned tpl.dmg once)
  sizeMul:1.18,     // a bigger silhouette — legible at distance (the third, art-free "this is special" cue)
  xpMul:2.0, goldMul:2.0, gearBonus:0.15,
  essence:25,       // GUARANTEED Esencia banked per champion kill (data-driven; on TOP of the affix drip)
  uniqueChance:0.5, // P(a SECOND superior/"unique" drop) on top of the guaranteed epic (epic = top rarity in this loot ladder)
};

// CAS-1632 — LEGENDARY/UNIQUE drop. A low base chance heavily biased toward elites/champions/bosses,
// rolled APPEND-ONLY (maybeLegendary, sim.js) AFTER every pre-existing dropGear in a kill resolution.
// RNG-NEUTRALITY: at rate=0 (or a non-eligible kill) maybeLegendary draws ZERO srand → the drop
// stream is byte-identical (the CAS-1590 maybeChampion pattern). rate>0 ships it ON; the bias muls
// scale the base rate per kill kind (a champion is champMul× as likely to cough up a unique as trash).
export const LEGENDARY = { rate:0.02, eliteMul:4, champMul:8, bossMul:12 };

// CAS-149 — ELITE MASTERY: the persistent, cross-session progression HOOK that gives a
// returning player a reason to come back. EVERY elite-class kill (ambush elites CAS-146 +
// hunt champions + the final boss) ticks a monotonic lifetime counter (h.eliteKills, saved
// in the localStorage blob). Crossing a threshold raises your Mastery RANK, which:
//   • bakes a small, capped permanent +maxHp (survivability — the lowest balance-risk stat
//     to grow, so progression feels gratifying without trivializing clear-speed), and
//   • makes CAS-146 ELITE-AMBUSH LOOT progressively MEANINGFUL — a higher rarity floor + a
//     per-rank chance to roll the drop one tier higher + bonus gold (champions/boss keep
//     their own fixed hunt payoff; they only FEED the rank). The loop self-reinforces: fight
//     elites → Mastery up → elites drop better gear → stronger hero → persists next session.
// Fork-neutral: pure deterministic counter + derived rank (no client-only logic, no RNG in
// the rank itself), so a Stage-2 server maps h.eliteKills to an account stat unchanged.
export const MASTERY = {
  // Cumulative elite-class kills to reach each rank. Index = rank; rank 0 is the start.
  // Front-loaded early (fast early growth a returner feels) then stretched (long-tail hook).
  thresholds:[0,3,8,16,28,45,70],
  hpPerRank:8,         // permanent +maxHp baked ONCE per rank-up (max rank 6 → +48 lifetime)
  goldPerRank:8,       // extra gold added to each elite/champion payoff, per rank
  tierBumpChance:0.14, // per-rank chance the elite/champion gear rolls one tier higher (capped)
  maxLootTier:4,       // gear tier ceiling (matches the deepest ZONE_LOOT window)
  // CAS-150 — ELITE-MASTERY REWARD TRACK: the milestones the returning player CHASES. The
  // CAS-149 counter (h.eliteKills) accumulated but unlocked nothing discrete; this turns it
  // into a visible reward track. Each milestone is a PERMANENT, meaningful perk (not a
  // cosmetic) that crosses ONCE when lifetime elite kills reach `at`. Perks are DERIVED from
  // the lifetime count (cached in h.mperk, recomputed like talents h.tt) — never baked/spent — so
  // they survive reload, stay deterministic, and a Stage-2 server maps the same count → same
  // perks. Thresholds are front-loaded (first two reachable in a couple of sessions, the
  // retention signal the board asked to validate) then stretched to the max-rank kill count.
  //   perk keys → where consumed:  hp (flat +maxHp, heroMaxHp) · dmgPct (% all hero damage,
  //   hitEnemy) · eliteDmgPct (% extra vs elite-class targets, hitEnemy) · crit (+% crit
  //   chance, hitEnemy, stacks with talents). Each is ORTHOGONAL to the CAS-149 rank perks
  //   (per-rank +maxHp / loot fortune), so the track adds new power instead of duplicating it.
  track:[
    { at:5,  id:"m1", name:"Constitución del Cazador", desc:"+20 Vida máx. permanente",        perk:{hp:20} },
    { at:15, id:"m2", name:"Instinto Asesino",         desc:"+6% prob. de crítico",            perk:{crit:6} },
    { at:35, id:"m3", name:"Verdugo de Élites",        desc:"+18% daño a élites, campeones y jefes", perk:{eliteDmgPct:18} },
    { at:70, id:"m4", name:"Maestría Suprema",         desc:"+8% daño global · +15 Vida máx.",  perk:{dmgPct:8, hp:15} },
  ],
};

// CAS-118 — STATUS EFFECTS: data-driven combat states applied by the player (weapon
// on-hit affixes CAS-117, spells) and suffered from mobs (telegraphed strikes). The
// generic engine in sim.js (applyStatus / tickDots) reads these rows, so adding a
// status is a data edit — no per-status code branch. Time-driven, zero RNG, so it
// stays deterministic / Stage-2 server-authority ready.
//   dot   — ticks `dmg` damage every `tick`s for `dur`s   (veneno / quemadura)
//   slow  — scales the victim's move/chase speed to `amt` for `dur`s   (lentitud)
//   stun  — freezes the AI / interrupts the telegraphed strike for `dur`s   (aturdir/raíz)
// `col` is the tick-floater + on-entity icon colour; `label` the HUD/probe name.
// DoT damage is FLAT (bypasses defence) but small per tick so it reads as pressure,
// never a one-shot — tuned to be felt without breaking the CAS-114/112/109 curve.
export const STATUS = {
  poison: { dot:true,  tick:0.5, dur:4.0, dmg:3, col:"#8be04a", label:"veneno" },
  burn:   { dot:true,  tick:0.4, dur:2.4, dmg:4, col:"#ff8a3a", label:"quemadura" },
  slow:   { dot:false, amt:0.55, dur:2.2,        col:"#7fd0ff", label:"lentitud" },
  stun:   { dot:false, dur:0.9,                  col:"#ffe066", label:"aturdir" },
};

// CAS-192 — combat CONSUMABLES: a data-driven tactical lever layered on the systems
// that already exist (merchant gold-sink CAS-112 + status effects CAS-118). Each row
// is pure data: a shop `price` (gold sink), a short `cd` (the use cooldown), and ONE
// deterministic effect — no RNG in the use path, nothing baked into render/UI, so the
// whole thing is Stage-2 server-authority ready. The hero carries quantities in
// `h.consum` (persisted, additive — no SAVE_VERSION bump), selects a slot, and uses it
// with a dedicated key. Each carries its own LEGIBLE feedback (floater + sfx + the fury
// buff shows a live duration on the HUD). Effect kinds (exactly one per row):
//   buff   — {stat,amt,dur}: a short timed bonus. `atkspd` shortens the attack cooldown
//            (read by the same formula as CAS-117 affixes / CAS-119 talents); `dmg`
//            reuses the timed dmgBonus buff (applyBuff).
//   purge  — clears the hero's active DoTs (veneno/quemadura) + slow (CAS-118 cleanse).
//   healFrac — restores this fraction of MAX hp (scaled heal, above the base 50 potion).
// CAS-197 — combined attack-speed COHESION CAP. Three INDEPENDENT systems add into the
// one atkCD-shortening `atkspd` term: loot affixes (CAS-117, self-capped at AFFIX_CAP 40),
// the talent tree (CAS-119, self-capped at TT_CAP.atkspd 30), and the "furia" consumable
// (CAS-192, +50 for its buff window). Each caps itself, but nothing capped the SUM — so the
// three could compound without a ceiling and break the swing cadence / frame budget. This is
// the global ceiling on that sum. Set to 130 = the current theoretical max (40+30+50=120)
// plus headroom, so EVERY shipped build is unchanged today (zero regression) while any future
// affix/talent/consumable interaction can never race the gated world-boss past intent.
export const ATKSPD_TOTAL_CAP = 130;

export const CONSUMABLES = [
  { id:"fury",     name:"Poción de furia", short:"Furia",  icon:"⚔", col:"#ff7a3a",
    price:55, cd:14, buff:{stat:"atkspd", amt:50, dur:6}, sfx:"buff",
    desc:"+50% vel. de ataque · 6 s" },
  { id:"antidote", name:"Antídoto",        short:"Antíd.", icon:"✚", col:"#7be07a",
    price:35, cd:10, purge:true, sfx:"buff",
    desc:"limpia veneno / quemadura / lentitud" },
  { id:"greater",  name:"Poción mayor",    short:"Mayor",  icon:"♥", col:"#5fd66a",
    price:50, cd:12, healFrac:0.6, sfx:"heal",
    desc:"cura 60% de vida máx." },
  // CAS-1628 — PARITY with `greater` on the MANA axis: the mana potion the CEO board bug
  // flagged as missing from the potion bar. `manaFrac` restores this fraction of MAX mana,
  // read by doConsumable exactly like healFrac restores HP. Same price/cd as `greater` so
  // the two flasks are balance-symmetric (60% of the pool, 12s cd). $0 art: the shared flask
  // PNG is tinted by `col` (mana-blue) via the same consumIcon recipe as every other slot.
  // Appended at the TAIL so fury/antidote/greater keep their indices (consumSel stays valid).
  { id:"mana",     name:"Poción de maná",  short:"Maná",   icon:"◆", col:"#5a8aff",
    price:50, cd:12, manaFrac:0.6, sfx:"cast",
    desc:"restaura 60% de maná máx." },
];

// Per-zone difficulty TIER (CAS-73): the natural-spawn trash of each hunt zone is
// scaled by these multipliers in the spawner loop, so the four zones form a rising
// difficulty curve (forest = baseline → arena = pinnacle) and pushing deeper is the
// reward loop's engine: harder zone → tougher mobs → more XP (`xpMul`) → better loot
// (ZONE_LOOT window in sim/gear.js climbs in lockstep). `tier` is the ordinal used
// for HUD/probes. Pure data + pure math (no RNG) → deterministic / Stage-2 ready.
// Champions/capstones are NOT scaled here — their elite blocks are tuned per row in
// HUNTS below, so a zone's mini-boss difficulty is independent of its trash scaling.
export const ZONE_TIER = {
  forest: { tier:1, hpMul:1.00, dmgMul:1.00, spdMul:1.00, xpMul:1.00 },
  ruins:  { tier:2, hpMul:1.30, dmgMul:1.18, spdMul:1.05, xpMul:1.30 },
  caves:  { tier:3, hpMul:1.70, dmgMul:1.35, spdMul:1.10, xpMul:1.65 },
  arena:  { tier:4, hpMul:2.10, dmgMul:1.55, spdMul:1.15, xpMul:2.10 },
  // CAS-441 — la Ciénaga de Bruma: the 4th OPEN (walk-in) biome, slotted POST-CAVES as a
  // PARALLEL tier-4 alternative to the arena: same trash scaling, so the player picks the
  // pit or the marsh by flavor, not power. Its champion reward stays a rare+ floor (see
  // HUNTS.swamp) so the arena capstone REMAINS the first guaranteed-epic pinnacle — the
  // gear ladder is untouched. The dedicated swamp roster + Tirano del Pantano boss land
  // with CAS-442; until then the zone runs a placeholder pool of existing mobs.
  swamp:  { tier:4, hpMul:2.10, dmgMul:1.55, spdMul:1.15, xpMul:2.10 },
  // CAS-114 — the Abismo: a fifth, power-gated hunt zone that strictly out-classes
  // every open zone (trash hits harder + drops more, capstone is the true endgame).
  // It is the PAYOFF the loop lacked: grind gold → buy merchant upgrades (CAS-112) +
  // level → clear the ABYSS_POWER_REQ gate → unlock richer content; the persisted
  // progression (CAS-113) keeps it unlocked across reloads. Same pure-math scaling.
  abyss:  { tier:5, hpMul:2.80, dmgMul:1.90, spdMul:1.20, xpMul:2.80 },
  // CAS-1744 — la Caldera de Cenizas: a fifth, power-gated ENDGAME biome slotted in the abyss
  // band (tier 5) between the Abismo and the Cripta on the power curve (ABYSS < CALDERA < FROST).
  // A parallel mid-endgame grind target with its OWN roster (emberkin/magmabrute) + capstone
  // (Corazón de Magma). Pure-math scaling like every other zone → integrates with WORLD_TIER
  // (CAS-450) without touching the APEX conquest cycle. Gated behind ZONE5 (world.js block runs
  // only when ZONE5.enabled), so this row is inert data until the biome is built ON.
  caldera:{ tier:5, hpMul:2.80, dmgMul:1.90, spdMul:1.20, xpMul:2.80 },
  // CAS-121 — the Cripta Helada: a sixth, harder-gated biome that strictly out-classes
  // the Abismo (its trash hits harder + pays more, its capstone is the new endgame). It
  // sits ABOVE the abyss on the power curve (FROST_POWER_REQ > ABYSS_POWER_REQ), so it
  // is the next grind target once the abyss is on farm. Same pure-math scaling.
  frost:  { tier:6, hpMul:3.60, dmgMul:2.30, spdMul:1.22, xpMul:3.40 },
  // CAS-196 — el Coliseo Eterno: a SEVENTH, post-finale CHALLENGE zone that strictly
  // out-classes the Cripta. Its gauntlet roster is the hardest mix in the game and its
  // capstone is the OPTIONAL WORLD-BOSS (Avatar del Coliseo). Pure endgame DEPTH past the
  // Stage-1 win — NOT the win condition (that stays the Cripta's Guardián). Same scaling.
  trial:  { tier:7, hpMul:4.60, dmgMul:2.70, spdMul:1.25, xpMul:4.20 },
};

// CAS-114 — power GATE for the Abismo. The hero's permanent power is a single legible
// number = merchant-upgrade tiers bought (the gold SINK, CAS-112) + levels gained, so
// the gate reads directly off the two things the loop rewards. heroPower() (sim.js)
// computes it; the town portal blocks entry (with HUD feedback) until it clears REQ.
export const ABYSS_POWER_REQ = 8;
// CAS-1744 — power GATE for la Caldera de Cenizas, set BETWEEN the abyss and the Cripta
// (ABYSS_POWER_REQ < CALDERA_POWER_REQ < FROST_POWER_REQ) so the molten biome is the next
// mid-endgame unlock once the abyss is on farm, without disturbing the finale gate. Same
// single legible heroPower() number drives it. Only reachable when ZONE5.enabled (the portal
// does not exist otherwise), so this constant is inert until the feature is ON.
export const CALDERA_POWER_REQ = 10;
// CAS-121 — power GATE for the Cripta Helada, set ABOVE the abyss so the frozen biome
// is the deeper, later unlock: clear the abyss → keep grinding upgrades + levels → the
// town's frost gate opens. Same single legible heroPower() number drives both gates.
export const FROST_POWER_REQ = 13;
// CAS-196 — power GATE for el Coliseo Eterno (the challenge arena), set ABOVE the Cripta
// so the trial is the DEEPEST unlock: clear the finale → keep grinding upgrades + levels →
// the town's coliseo gate opens. Same single legible heroPower() number drives all gates.
export const TRIAL_POWER_REQ = 18;

// Hunt contracts (CAS-63): the per-hunt OBJECTIVE that gives a farm zone a point.
// Cull `need` enemies in the zone -> a Champion is summoned (an ELITE of a zone mob,
// so it reuses that mob's sprite — no new art). Defeating the Champion CLEARS the
// zone: a guaranteed gear drop (rarity floor `minR`, tier from ZONE_LOOT) + bonus
// xp/gold + a payoff toast. Pure data: the generic hunt resolver in sim.js reads
// these rows, so adding a hunt zone is a one-line edit, never a code branch.
// `base` must be a melee ETPL row (telegraphed windup → readable elite fight).
// `tier` is the Champion REWARD tier window — always meaningful loot (2-3) so the
// climax drop is an upgrade, never scaled down to the zone's trash-mob tier.
//
// CAS-65 — capstone boss: a zone may carry a `boss` block. When present the hunt
// quota summons a TRUE capstone (its own absolute stat block + sprite) instead of
// the scaled elite. The capstone adds ONE distinct mechanic on top of the shared
// combat vocabulary — a phase shift at `enrageAt` HP that speeds it up and turns
// every strike into a telegraphed radial SLAM (ring of rune shards the player must
// roll through / out of: a positional skill check no other enemy has). Its reward
// is the otherwise-unobtainable tier-4 gear at an `epic` floor — a clear top-tier
// progression target. Pure data: the generic resolver in sim.js reads this block,
// so a second capstone is another `boss:{…}` row, never a code branch.
//
// CAS-109 — Champion SPECIAL: every regular (non-capstone) Champion carries a
// `special` block: on every `every`-th melee strike it winds up LONGER (`windup`,
// a loud growing-ring tell drawn in render.js) and then erupts a telegraphed
// radial SLAM — `slam.count` rune shards at `slam.spd` for `slam.dmg`, instead of
// the normal directional hit. This makes the forest/ruins/caves bosses a readable
// positional FIGHT (roll through the ring) rather than tank-and-spank, mirroring
// the capstone's slam but on a recurring cadence (not gated on enrage). Pure data:
// the shared windup→strike AI in sim.js reads this block, so tuning a boss's
// special is a one-line edit. `slam.dmg` is per-shard PRE-defence (mitigated by the
// hero's gear def downstream) — kept moderate so it's a punish, not a one-shot.
export const HUNTS = {
  forest: { need:10, base:"wolf",     name:"Lobo Alfa",       hpMul:8,  dmgMul:1.8, sizeMul:1.55, tier:[2,3], minR:"uncommon", xp:90,  gold:45,
    special:{ name:"Aullido Sísmico", every:3, windup:0.75, slam:{ count:8,  spd:150, dmg:12, life:1.0 } } },
  ruins:  { need:12, base:"bandit",   name:"Capitán Bandido", hpMul:8,  dmgMul:1.7, sizeMul:1.45, tier:[2,3], minR:"rare",     xp:140, gold:70,
    special:{ name:"Salva de Pólvora", every:3, windup:0.78, slam:{ count:10, spd:165, dmg:15, life:1.0 } } },
  // CAS-73 tier-3 mini-boss: fills the previously hunt-less caves zone. Skeleton base
  // (telegraphed melee → readable) scaled hard; reward window jumps to tier 3-4 so its
  // drop strictly out-classes ruins, keeping the climb worth it. Capstone stays the
  // only GUARANTEED epic, so arena remains the pinnacle.
  // CAS-342 (board CAS-341 / canonical CAS-89) — the caves zone now CAPSTONES on the dracónic
  // BOSS instead of a positional deep-walk spawn. The dragon (CAS-317/331: 6 rich-anim strips,
  // grounded footPad, breath special) is promoted to a deliberate end-of-zone climax through the
  // shared capstone/onChampionKill path: cull `need` → the Dragón Ancestral is summoned → its
  // defeat clears the zone with a GUARANTEED rare+ drop. Kept at the caves tier (tier 3-4 / rare
  // floor) so arena REMAINS the first guaranteed-epic pinnacle (gear-ladder intact). The boss
  // carries the dragon's verified combat identity verbatim (hp/dmg/size/spd/knock/windup from the
  // live ETPL.dragon) — a presentation+placement change, not a power rebuild. Its breath ("Aliento
  // Dracónico") rides the CAS-109 `special` channel (telegraphed growing-ring → radial shard slam),
  // and a mild enrage phase tightens the tells past 50% HP (no extra slam → the breath stays THE
  // special). richAnim survives via spawnChampion's Object.assign from the dragon base, so all 6
  // strips + grounding render identically to the live boss. The skeleton fields below are the
  // pre-boss fallback (unused while `boss` is present — spawnChampion takes B.base).
  caves:  { need:13, base:"skeleton", name:"Rey Esquelético",  hpMul:9,  dmgMul:2.0, sizeMul:1.6,  tier:[3,4], minR:"rare",     xp:170, gold:90,
    special:{ name:"Onda Ósea", every:3, windup:0.82, slam:{ count:12, spd:175, dmg:17, life:1.1 } },
    boss:{ base:"dragon", sprite:"dragon", name:"Dragón Ancestral", hp:820, dmg:34, size:50, spd:52, knock:85, windup:0.92, recover:0.78,
           enrageAt:0.5, enrageSpd:1.3, enrageWindup:0.72,                          // phase 2: faster + tighter tells (no slam block → breath remains the special)
           special:{ name:"Aliento Dracónico", every:3, windup:1.0, slam:{ count:14, spd:180, dmg:22, life:1.2 } }, // CAS-331 dragon breath: telegraphed radial shard slam
           tier:[3,4], minR:"rare", xp:300, gold:140 } },                           // caves-tier guaranteed drop (rare+, NOT epic — arena keeps the first guaranteed epic)
  // CAS-441/CAS-442 — the Ciénaga de Bruma hunt. The kill quota summons the TRUE capstone,
  // el Tirano del Pantano (art CAS-440, 6-strip richAnim bog-brute — dragon convention: the
  // boss block mirrors the live ETPL.bogtyrant stats verbatim, a presentation+placement layer,
  // not a separate power build). Its club-SWEEP ("Barrido del Pantano") rides the CAS-109
  // `special` channel — telegraphed growing-ring → radial slam every 3rd strike, which is also
  // what drives the attack2 strip — and a mild enrage tightens the tells past 50% HP (no extra
  // slam block → the sweep stays THE special). Kept at the caves reward window (tier 3-4 /
  // rare floor, GUARANTEED gear on the clear via onChampionKill) so the marsh pays like the
  // tier it gates but NEVER hands out the arena's guaranteed epic (gear ladder intact).
  // The orc fields below are the pre-boss fallback (unused while `boss` is present).
  swamp:  { need:13, base:"orc",      name:"Bruto del Fango",  hpMul:8,  dmgMul:1.8, sizeMul:1.5,  tier:[3,4], minR:"rare",     xp:190, gold:100,
    special:{ name:"Erupción de Lodo", every:3, windup:0.8, slam:{ count:12, spd:170, dmg:18, life:1.1 } },
    boss:{ base:"bogtyrant", sprite:"bogtyrant", name:"Tirano del Pantano", hp:940, dmg:35, size:44, spd:50, knock:88, windup:0.94, recover:0.8,
           enrageAt:0.5, enrageSpd:1.3, enrageWindup:0.75,                          // phase 2: faster + tighter tells (no slam block → the sweep remains the special)
           special:{ name:"Barrido del Pantano", every:3, windup:1.0, slam:{ count:12, spd:170, dmg:20, life:1.15 } }, // club-sweep: telegraphed radial slam (attack2 strip)
           tier:[3,4], minR:"rare", xp:300, gold:150 } },                           // swamp-tier guaranteed drop (rare+, NOT epic — arena keeps the first guaranteed epic)
  arena:  { need:14, base:"orc",      name:"Campeón del Foso", hpMul:7,  dmgMul:1.6, sizeMul:1.5,  tier:[2,3], minR:"rare",     xp:150, gold:75,
    boss:{ base:"golem", sprite:"golem", name:"Coloso del Foso", hp:900, dmg:34, size:40, spd:54, knock:70, windup:0.9, recover:0.7,
           enrageAt:0.5, enrageSpd:1.35, enrageWindup:0.72,                       // phase 2: faster + tighter tells
           slam:{ count:14, spd:175, dmg:22, life:1.3 },                          // radial shockwave (positional tell)
           tier:[4,4], minR:"epic", xp:380, gold:200 } },                         // guaranteed top-tier sink
  // CAS-114 — the Abismo capstone: a SECOND capstone that out-classes the Coloso on
  // every axis (more HP/dmg, a denser/faster slam, an earlier+harsher enrage) and pays
  // the richest guaranteed-epic + gold/xp in the game. Reached only past the power gate,
  // it is the explicit grind target that closes the economic loop. Pure data — the
  // generic hunt/capstone resolver in sim.js reads this row, no new code branch.
  abyss:  { need:16, base:"wraith",   name:"Heraldo del Vacío", hpMul:9,  dmgMul:2.1, sizeMul:1.6,  tier:[4,4], minR:"epic",     xp:240, gold:140,
    boss:{ base:"golem", sprite:"golem", name:"Tirano del Abismo", hp:1500, dmg:48, size:46, spd:60, knock:84, windup:0.84, recover:0.62,
           enrageAt:0.55, enrageSpd:1.48, enrageWindup:0.6,                       // phase 2: earlier + much faster + tighter tells
           slam:{ count:18, spd:200, dmg:30, life:1.45 },                         // denser, faster radial shockwave
           tier:[4,4], minR:"epic", xp:640, gold:360 } },                         // richest guaranteed top-tier sink
  // CAS-1744 — la Caldera de Cenizas capstone: a walk-in hunt (patrón swamp/abyss) whose kill
  // quota summons the TRUE capstone, el Corazón de Magma (art CAS-1778: calderatyrant 5-strip
  // richAnim volcanic brute — dragon convention: the boss block mirrors ETPL.calderatyrant
  // verbatim, a presentation+placement layer, not a separate power build). Its Erupción de la
  // Caldera rides the CAS-109 `special` channel — telegraphed growing-ring → radial slam every
  // 3rd strike — and an enrage past 50% HP tightens the tells + speeds it up. Guaranteed EPIC+
  // drop (CAS-89 payoff) via onChampionKill (minR:"epic"). The emberkin fields below are the
  // pre-boss fallback (unused while `boss` is present — spawnChampion takes B.base).
  caldera:{ need:16, base:"emberkin",  name:"Heraldo de Brasas", hpMul:9,  dmgMul:2.0, sizeMul:1.6,  tier:[4,4], minR:"epic",     xp:250, gold:145,
    special:{ name:"Estallido de Ceniza", every:3, windup:0.85, slam:{ count:12, spd:175, dmg:22, life:1.2 } },
    boss:{ base:"calderatyrant", sprite:"calderatyrant", name:"Corazón de Magma", hp:1020, dmg:38, size:46, spd:52, knock:90, windup:0.95, recover:0.8,
           enrageAt:0.5, enrageSpd:1.3, enrageWindup:0.72,                          // phase 2: faster + tighter tells (no slam block → the eruption remains the special)
           special:{ name:"Erupción de la Caldera", every:3, windup:1.0, slam:{ count:14, spd:180, dmg:24, life:1.2 } }, // telegraphed radial shard slam
           tier:[4,4], minR:"epic", xp:340, gold:190 } },                          // guaranteed epic+ payoff (CAS-89)
  // CAS-121 — the Cripta Helada capstone: the THIRD capstone and the new endgame. It
  // out-classes the Tirano on raw stats AND carries a brand-new encounter mechanic on
  // top of the shared windup→strike + enrage vocabulary: the CORAZA DE ESCARCHA.
  //
  // carapace (NEW mechanic, read-and-react): every `every`-th committed attack the boss
  // sheaths itself in a frost carapace — it becomes DAMAGE-IMMUNE, summons `adds` frost
  // wraiths (control/AoE pressure), and CHANNELS a Freeze Nova for `channel`s (a growing
  // ice ring telegraph in render). The ONLY way to break it early is to land a STATUS
  // effect on the boss (veneno/quemadura/lentitud/aturdir, CAS-118) — doing so SHATTERS
  // the carapace, cancels the nova and STAGGERS the boss (`shatterStun`s) into a big
  // damage window. Ignore it and the channel completes: the Nova erupts (a dense radial
  // ring that damages + SLOWS, `nova`), then the shield drops into only a short recover.
  // So a build that invested in the status stack (affixes CAS-117 / talents CAS-119 /
  // skills CAS-120) trivialises the shield and wins the long openings; a status-less
  // build can still win by dodging novas, just far slower — exactly the "flex your build"
  // payoff. Pure data + the shared boss AI reads this block (no per-boss code branch).
  frost:  { need:18, base:"wraith",  name:"Eco Gélido",       hpMul:10, dmgMul:2.2, sizeMul:1.6,  tier:[4,4], minR:"epic",     xp:300, gold:170,
    boss:{ base:"golem", sprite:"golem", name:"Guardián de la Cripta", hp:2200, dmg:56, size:48, spd:58, knock:88, windup:0.86, recover:0.66,
           enrageAt:0.45, enrageSpd:1.40, enrageWindup:0.66,                       // phase 2: earlier, faster, tighter tells
           slam:{ count:16, spd:190, dmg:26, life:1.4 },                           // enraged radial shockwave (shared vocab)
           carapace:{ every:3, channel:2.6, adds:2, addType:"wraith", shatterStun:1.8,
                      nova:{ count:22, spd:150, dmg:30, life:1.5, slow:{ amt:0.5, dur:2.6 } } },
           // CAS-123 — this capstone IS the Stage-1 final boss. `final:true` flags its
           // defeat as the win-condition (sim onChampionKill → victory screen). The whole
           // game is sequenced toward this fight: it gates on the deepest power req, demands
           // the status stack (carapace), and pays the richest reward. The flag is pure data
           // so the "final boss" can be re-pointed to any capstone in one edit.
           final:true,
           tier:[4,4], minR:"epic", xp:820, gold:480 } },                          // new richest guaranteed top-tier sink
  // CAS-196 — el Coliseo Eterno: the CHALLENGE-ARENA contract + the WORLD-BOSS. You first
  // survive/clear the arena gauntlet (cull `need` of the hardest roster in the game), which
  // SUMMONS the Avatar del Coliseo — an OPTIONAL post-finale world-boss that pairs the
  // Cripta's CARAPACE status-gate (telegraphed shield → channel a Freeze Nova + 3 adds,
  // shattered only by a CAS-118 status proc) with an aggressive ENRAGE phase (faster +
  // tighter tells + the densest radial slam in the game), then pays a SIGNATURE double-epic
  // haul (`bonusDrop`). It is NOT the Stage-1 win (no `final` flag — the Guardián keeps the
  // win-condition; this is endgame DEPTH gated ABOVE the finale, TRIAL_POWER_REQ > FROST).
  // Pure data: the shared capstone AI already reads enrage + carapace, so the two-phase
  // world-boss is COMPOSITION of existing telegraphed mechanics, never a new code branch.
  trial:  { need:20, base:"wraith",  name:"Centinela del Coliseo", hpMul:10, dmgMul:2.3, sizeMul:1.6, tier:[4,4], minR:"epic", xp:340, gold:190,
    boss:{ base:"golem", sprite:"golem", name:"Avatar del Coliseo", hp:3000, dmg:64, size:50, spd:60, knock:92, windup:0.82, recover:0.6,
           enrageAt:0.5, enrageSpd:1.45, enrageWindup:0.62,                         // phase 2: faster, tighter tells, densest slam
           slam:{ count:20, spd:205, dmg:30, life:1.5 },                            // enraged radial shockwave (shared vocab)
           carapace:{ every:3, channel:2.7, adds:3, addType:"wraith", shatterStun:1.7,
                      nova:{ count:24, spd:155, dmg:32, life:1.5, slow:{ amt:0.5, dur:2.6 } } },
           bonusDrop:1,                                                             // CAS-196: a SECOND guaranteed epic → signature world-boss haul
           tier:[4,4], minR:"epic", xp:1000, gold:600 } },                         // richest payoff in the game
};

// CAS-1664 — ARENA DE OLEADAS (Wave Survival) tuning. A separate endgame MODE (opt-in from
// the menu) that REUSES the whole existing content library — the ETPL trash pool, the HUNTS
// capstone stat blocks, the elite affixes, the boon draft, the loot streams and the Esencia
// economy — with ZERO new art. Every knob is pure data read by the arena controller in sim.js;
// nothing here runs unless G.arenaMode is on, so a normal run is byte-identical to a build
// without the mode (RNG-neutral by construction — arena has its OWN dedicated arenaRng stream).
//   baseMobs/mobStep/mobCap — trash count per wave = baseMobs + floor(n*mobStep), capped at mobCap
//   hpStep/dmgStep          — per-wave stat multipliers (arena-only; never touch ZONE_TIER)
//   affixBase/affixStep/affixCap — elite-affix probability climbs with the wave (own arenaRng gate)
//   bossEvery               — every Nth wave spawns 1 boss from the HUNTS boss pool (wave-scaled)
//   boonEvery               — every Nth cleared wave offers a boon draft during the rest
//   restSeconds             — the breather between waves (heal + optional draft)
//   healFrac                — fraction of maxHp healed at the start of each rest
//   essStep                 — Esencia banked per cleared wave = ceil(n*essStep) → feeds the meta tree
export const ARENA = {
  menuEnabled:false,                // CAS-2190: OCULTA la entrada "Arena de Oleadas" del menú (mundo-abierto directo). A diferencia de Boss Rush/Seeded, la Arena no tenía knob enabled (siempre dibujada); este flag gatea render (menuArenaRect zeroing) + input.js (keyboard ARENA.key + tap). La lógica de Arena (G.arenaMode/startArena) queda intacta; re-activar como actividad MMORPG = flip false→true.
  key:"KeyA",                       // CAS-1996: CODE de menú de la Arena de Oleadas (antes hardcodeado en input.js:93). Data-driven ⇒ el Códice de Combate lee ARENA.key. Behavior-identical.
  baseMobs:4, mobStep:0.5, mobCap:24,
  hpStep:0.12, dmgStep:0.08,
  affixBase:0.10, affixStep:0.03, affixCap:0.60,
  champChance:0.15,                 // P(promote an affixed arena mob to an Élite Campeón) — own arenaRng gate
  bossEvery:5, boonEvery:3, restSeconds:3,   // bossEvery: every Nth wave is a boss wave — TUNABLE (starts at N=5)
  healFrac:0.40, essStep:3,
  // CAS-1670 — Boss-wave payoff, scaled by k = wave/bossEvery (1,2,3…). Both hooks are
  // guaranteed (no drop-chance roll): the Esencia bump is pure arithmetic (0 RNG), the extra
  // loot pieces draw from the DEDICATED arenaRng (never srand → srand byte-identical at bonus 0).
  bossEssBase:25,        // extra Esencia per boss wave = ceil(bossEssBase * k), on top of arenaEssence(wave)
  bossBonusDrops:1,      // BASE count of guaranteed EXTRA loot pieces on a boss kill (arenaBonusDropCount adds floor(k/2))
  bossBonusCap:4,        // cap on the extra-loot count as k climbs
  bossDropRareFloor:"rare", // min rarity of the extra loot (reuses rollGearInst tier 2-3 pool; no new tables)
  // CAS-1675 — persistent Arena records. When a run's boss waves BEAT the stored bestBossWave, a
  // ONE-TIME milestone payoff = ceil(bossRecordEssBase * wave) Esencia (pure arithmetic, 0 RNG).
  bossRecordEssBase:10,
  // HUNTS zones whose `boss` block the arena reuses as its wave-boss stats. EXCLUDES `frost`
  // (its boss carries final:true → Stage-1 win) and `trial` (the optional post-finale world-boss),
  // so an arena boss never fires the victory screen and never gates on world-boss depth.
  bossZones:["caves","swamp","arena","abyss"],
};

// CAS-1681 — EVENTOS DE ZONA (Zone Events / optional POIs). 0–2 telegraphed, opt-in points of
// interest seeded PER combat zone, each a risk/reward trade-off that REUSES existing mobs, elite
// stat blocks, loot tables and the Esencia economy — ZERO new art. Every knob is pure data read by
// the event controller in sim.js; NOTHING here runs unless `enabled` is true (kill switch), and all
// seeding draws come from the DEDICATED `eventRng` stream — never the authoritative srand — so a run
// with events off (or density 0) is BYTE-IDENTICAL to a build without the feature (AC1 [AC-RNG-STRONG]).
//   enabled       — master switch. false → zero eventRng draws, zero new gameplay branches taken.
//   density       — scales the 0..perZoneMax seed count (0 = never seed). Each candidate slot fills
//                   with P = min(1, slotChance*density) on its own eventRng draw.
//   perZoneMax    — hard cap of POIs per zone (YAGNI: 0–2).
//   ring          — [min,max] px band around the hero where a POI seeds (kept inside zone bounds).
//   telegraphR    — hero distance (px) at which a POI's heads-up toast fires (opt-in signal).
//   reachR        — generic proximity (px) that counts as "reached" (shrine activate / goblin catch).
//   types         — the THREE hard-coded event kinds (no generic event engine).
//   shrine{}      — Santuario Maldito: heal + temp damage buff, at the cost of a summoned horde.
//   chest{}       — Cofre Custodiado: guaranteed loot behind ONE elite guardian (kill → open).
//   goblin{}      — Duende del Tesoro: a fleeing mob that pays FLAT Esencia if caught before it escapes.
export const ZONE_EVENTS = {
  enabled:true, density:1, perZoneMax:2, slotChance:0.55,
  ring:[150,300], telegraphR:170, reachR:46,
  types:["shrine","chest","goblin"],
  // Santuario Maldito — activar (interactuar en rango) cura + buff temporal de daño, e invoca UNA
  // horda extra de mobs de la zona (tipos/posiciones desde eventRng → el srand de spawn natural NO se toca).
  shrine:{ healFrac:0.35, dmgBuff:18, buffDur:12, hordeMin:3, hordeMax:5 },
  // Cofre Custodiado — botín GARANTIZADO vigilado por 1 élite (multiplicadores directos, sin srand,
  // patrón AMBUSH.elite). Matar al guardián abre el cofre → botín vía rollGearInst(eventRng.srand,...).
  chest:{ guardHpMul:2.6, guardDmgMul:1.5, guardSizeMul:1.35, guardXpMul:2.2,
          lootTier:[2,3], lootMinR:"rare", bonusDrops:1, goldBonus:60 },
  // Duende del Tesoro — mob huidizo (tipo de la zona, huye del héroe, veloz). Suelta Esencia FIJA
  // (aritmética pura, 0 RNG) si lo alcanzas antes de que el timer de escape expire.
  goblin:{ spdMul:1.65, escapeSeconds:14, essence:45, hp:24 },
};

// CAS-123 — Stage-1 win-condition descriptor. The single legible GOAL the whole run
// builds toward, surfaced in the HUD objective tracker (render.js) from minute one and
// resolved when the FINAL capstone (HUNTS[STAGE1_GOAL.zone].boss.final) dies. Data-driven:
// CAS-1687 — RUNAS Y ENGARCES (sockets). Tunable KNOBS only; the rune CONTENT (types + bonos)
// lives in sim/gear.js as `RUNES` (same split as LEGENDARY-knob ↔ UNIQUES-content, CAS-1632): item
// content belongs with the other gear content, config carries the balance dials. Every socket/rune
// draw comes from the DEDICATED `runeRng` stream in sim.js — never the authoritative srand — and the
// whole system is HARD-GATED behind `enabled`. So with `enabled:false` (or `dropRate:0`) a run is
// BYTE-IDENTICAL to a build without the feature (AC1 [AC-RNG-STRONG]); at ANY rate the srand stream
// stays untouched (the stronger guarantee the dedicated stream buys us, like the other streams).
//   enabled       — master kill switch. false → zero runeRng draws, zero new gameplay branches.
//   dropRate      — base P(a rune drops) appended per kill (own runeRng gate; scaled by kill bias).
//   socketChance  — [P(gear rolls ≥1 socket), P(2nd socket | ≥1)] on the gear's dedicated runeRng
//                   roll at drop time. Both draws are runeRng-only → gear generation never perturbs srand.
export const SOCKETS = {
  enabled:true, dropRate:0.06, socketChance:[0.55,0.28],
};

// CAS-1694 — master switch for the 3 new CAVES mobs. Default false ⇒ the caves spawner `types` array
// is UNCHANGED ⇒ the ri() draw sequence is identical ⇒ sim byte-idéntico a un build sin la feature
// (AC3 [AC-RNG-STRONG]). `types` = los 3 nuevos, appendados al pool de caves SÓLO si enabled (world.js).
// `bonusLootRate` = la ÚNICA tirada RNG de estos mobs (killEnemy), y sale del stream dedicado mobRng
// (nunca del srand autoritativo). El QA flip vive tras dev hook __dev.newMobsEnable / harness.
export const NEW_MOBS = { enabled:true, zone:"caves", types:["ashwraith","ironback","thornspitter"], bonusLootRate:0.10 };

// CAS-1744 — master switch for la CALDERA DE CENIZAS (5th gated endgame biome). Default true. When
// false EVERYTHING gated hangs off this flag: the world.js caldera block does NOT run (no rect/floor/
// spawner/portal → worldgen byte-identical), the portal gate is absent, the `emberfury` modifier stays
// OUT of the offered pool (modifier draft identical), and `zone5Rng` takes 0 draws — so `srand` is
// BYTE-IDENTICAL to a build without the feature (AC1 [AC-RNG-STRONG]). Static ZONE_TIER/HUNTS/ETPL
// rows for caldera are inert data (never referenced when OFF). `bonusLootRate` = the ONLY new RNG of
// the zone (killEnemy in caldera), drawn from the DEDICATED `zone5Rng` stream (never the authoritative srand).
export const ZONE5 = { enabled:true, zone:"caldera", bonusLootRate:0.10 };

// CAS-1751 — CÓDICE DE BOTÍN (Collection Log). A pure READ-SIDE ledger over the loot systems already
// shipped (uniques CAS-1632 / sets CAS-1654 / runes CAS-1687): the FIRST pickup of a given
// unique/set-piece/rune is recorded forever in its OWN store (mithralda.codex.v1) and grants a small
// PERMANENT account-wide bonus. It touches NO RNG stream (RNG-neutral by construction) and writes
// nothing to combat/sim state beyond the derived, cached codexDmg/codexHp read live by
// equippedDmg/heroMaxHp. `enabled:false` ⇒ no ledger writes, 0 stat contribution, no HUD/panel, and the
// srand/sim sequence + save.v1 serialization are BYTE-IDENTICAL to a build without the feature.
// `bonus`: dmgPerUniq per discovered unique; hpPerSet per set piece; hpPerRune per rune type. Tunable.
export const CODEX = { enabled:true, bonus:{ dmgPerUniq:2, hpPerSet:15, hpPerRune:10 } };

// CAS-1758: TÍTULOS DE GESTA (Feat Titles). A PURE READ-SIDE cosmetic layer over milestones the player
// ALREADY accumulates (Códice counts, Arena best waves, Ascensión level). Each `def` names a live source
// counter (`src`) + a threshold (`n`); crossing it unlocks an account-wide, choosable title shown next to
// the hero name. It draws NO RNG stream and writes NOTHING to combat/sim state (h.title is a derived,
// cached string for the HUD only). `enabled:false` ⇒ no store I/O, no evaluation, no HUD/panel affordance,
// and the srand/sim sequence + save.v1 serialization are BYTE-IDENTICAL to a build without the feature.
// The table is FIXED config (YAGNI — not a generic rules engine); a new title is a 1-line entry here.
export const TITLES = { enabled:true, defs:[
  { id:"codex_uniq_5",   label:"Cazador de Leyendas",       src:"codex.uniq",         n:5  },
  { id:"codex_uniq_15",  label:"Maestro de Reliquias",      src:"codex.uniq",         n:15 },
  { id:"codex_set_3",    label:"Coleccionista",             src:"codex.set",          n:3  },
  { id:"codex_rune_4",   label:"Rúnico",                    src:"codex.rune",         n:4  },
  { id:"arena_wave_5",   label:"Superviviente de la Arena", src:"arena.bestWave",     n:5  },
  { id:"arena_wave_10",  label:"Gladiador Eterno",          src:"arena.bestWave",     n:10 },
  { id:"arena_boss_3",   label:"Verdugo de Coloso",         src:"arena.bestBossWave", n:3  },
  { id:"asc_1",          label:"Ascendido",                 src:"meta.ascension",     n:1  },
  { id:"asc_3",          label:"Conquistador de Ascensión", src:"meta.ascension",     n:3  },
]};

// CAS-1763: PACTOS DE PODER (Power Pacts). An OPT-IN, stackable difficulty covenant. Each pact the
// player ranks up raises a derived HEAT and, in exchange, scales the endgame rewards (Esencia +
// loot/unique/rune chance). It is a PURE READ-SIDE config layer (own store mithralda.pacts.v1, save.v1
// untouched): the chosen ranks persist as a cross-run PREFERENCE and their effects are DERIVED IN THE
// SEAM each run — a pact is a deterministic multiplier on an already-existing stat/heal/essence value,
// or a threshold shift on a roll that ALREADY happens. It adds/removes NO RNG draw (RNG-neutral STRONG).
// HARD-GATED behind PACTS.enabled: false ⇒ zero store I/O, zero evaluation, no HUD/panel, and the
// srand sequence + save.v1 serialization are BYTE-IDENTICAL to a build without the feature. Enabled but
// heat=0 (no ranks) is ALSO a total no-op (every multiplier defaults to 1.0; no threshold moves).
// The table is FIXED config (YAGNI — not a generic rules engine); all heat→reward tuning lives in the
// three balance knobs below so telemetry can retune without a logic re-deploy. `mag` is per-rank.
export const PACTS = {
  enabled:true,
  defs:[
    { id:"cruento",   name:"Pacto Cruento",      max:5, heat:10, effect:{kind:"enemyDmg",  mag:0.10} }, // +10% daño enemigo / rango
    { id:"vigor",     name:"Pacto de Vigor",     max:5, heat:8,  effect:{kind:"enemyHp",   mag:0.15} }, // +15% HP enemigo / rango
    { id:"celeridad", name:"Pacto de Celeridad", max:3, heat:12, effect:{kind:"enemySpd",  mag:0.08} }, // +8% velocidad enemigo / rango
    { id:"jauria",    name:"Pacto de Jauría",    max:3, heat:15, effect:{kind:"eliteRate", mag:0.25} }, // +25% prob. promoción élite / rango
    { id:"fragil",    name:"Pacto Frágil",       max:3, heat:12, effect:{kind:"healCut",   mag:0.20} }, // -20% curación jugador / rango
    // CAS-2080 — 3 modificadores aditivos (Option B, aprobado CEO). Cada uno = threshold-shift / aritmética PURA
    // sobre un valor que el sim YA lee (0 draws de RNG nuevos). Default rank 0 ⇒ inertes ⇒ save + srand byte-idénticos.
    { id:"presagio",  name:"Pacto de Presagio",  max:3, heat:13, effect:{kind:"variantRate", mag:0.35} }, // +35% prob. variante de encuentro / rango (escala ENCOUNTER_VARIANTS.chancePerZone; NO toca enemyVariantRng)
    { id:"corrosion", name:"Pacto de Corrosión", max:3, heat:11, effect:{kind:"statusBuild", mag:0.20} }, // +20% acumulación de estado SOBRE TI / rango (STATUS_BUILDUP, sink del héroe)
    { id:"quebranto", name:"Pacto de Quebranto", max:3, heat:14, effect:{kind:"enemyPoise",  mag:0.15} }, // +15% postura enemiga / rango (más difícil staggerear) + ventana de parada −15% / rango
  ],
  // ── HEAT → REWARD tuning (the ONLY balance knobs; keep conservative) ─────────────
  essencePerHeat:0.004,  // Esencia mult = 1 + essencePerHeat*heat   (heat 100 ⇒ +40%)
  dropPerHeat:0.003,     // drop/unique/rune chance mult = 1 + dropPerHeat*heat (heat 100 ⇒ +30%)
  rewardHeatCap:150,     // clamp the heat used for the reward mult (defensive; effects still stack)
};

// CAS-1768 — AFIJOS DE ARMA on-hit (weapon on-hit affixes). A dropped WEAPON may roll 0–1 "on-hit"
// affix that fires a DETERMINISTIC effect when it strikes an enemy — loot gains "build" texture (active
// procs) on top of sockets/sets/runes (flat stats). Save-safe: the affix is ONE optional trailing field
// `wa:"<id>"` on the weapon instance (mirror of uniq/set/fl in safeInst); the MAGNITUDE is never stored,
// it is DERIVED from this config by (affixId, weapon tier). HARD-GATED behind WEAPON_AFFIXES.enabled:
// false ⇒ zero affixRng draws, no `wa` written, no proc evaluation, no HUD glyph, and the srand sequence
// + save.v1 serialization are BYTE-IDENTICAL to a build without the feature (dedicated affixRng stream —
// the shared srand never advances differently). All tuning (drop chance, proc chance, magnitudes) lives
// here so telemetry can retune without a logic re-deploy. FIXED table (YAGNI — not a rules engine).
export const WEAPON_AFFIXES = {
  enabled:true,
  // P(a uncommon+ weapon rolls 1 affix), indexed by RARITY rank-1: uncommon⇒idx0 … legendary⇒idx3.
  // common NEVER rolls (rarity gate). Conservative defaults; the drop roll draws from affixRng only.
  dropChanceByRank:[0.10, 0.16, 0.24, 0.35],
  // Pool of 5 on-hit affixes. `mag` = base magnitude, scaled by weapon tier via magPerTier. `kind`
  // selects the deterministic hook in hitEnemy; `chance` (only 'aturdidor') is the affixRng proc prob.
  defs:[
    { id:"vampiric",  name:"Vampírico",  glyph:"❤", tint:"#c0304a", kind:"lifesteal", mag:0.08 },            // heal hero 8% of dmg dealt
    { id:"cadena",    name:"Cadena",     glyph:"⚡", tint:"#4aa0e0", kind:"chain",     mag:0.45, hops:1 },     // arc to 1 nearby foe for 45% dmg
    { id:"ardiente",  name:"Ardiente",   glyph:"🔥", tint:"#e07a2a", kind:"burn",      mag:0.30 },             // apply burn DoT (reuses STATUS.burn)
    { id:"aturdidor", name:"Aturdidor",  glyph:"✷", tint:"#e0d24a", kind:"stun",      mag:0.35, chance:0.15 },// 15% chance to stun (affixRng)
    { id:"perforante",name:"Perforante", glyph:"➹", tint:"#9a9aa0", kind:"pierce",    mag:0.25 },             // ignore 25% of the target's ARMORED reduction
  ],
  magPerTier:0.15,   // effective magnitude = mag * (1 + magPerTier*(tier-1))
  chainRange:3.5,    // radius (tiles) to pick the Cadena rebound target
};

// CAS-1773 — MEDIDOR DE FRENESÍ (kill-streak / momentum). Estado de run TRANSITORIO: matar dentro de
// `window` s del último kill suma 1 stack (hasta maxStacks); sin kill, tras `window` el medidor decae 1
// stack cada `decayEvery` s. Cada stack = buff DETERMINISTA (atk-speed aditivo + daño multiplicativo),
// aplicado en los chokes de combate YA EXISTENTES (heroAtkspd sink + hitEnemy dmg mul). NO abre RNG (el
// buff deriva sólo del timing de kills ⇒ srand byte-idéntico), NO persiste (no toca save.v1). HARD-GATED
// tras `enabled`: false ⇒ 0 incrementos, 0 decay, +0 atkspd, ×1 dmg, sin HUD ⇒ sim + save.v1 byte-idénticos.
export const FRENZY = {
  enabled:true,
  window:3.0,        // s desde el último kill para encadenar / mantener el medidor
  decayEvery:0.6,    // s por stack perdido una vez expira la ventana (decay gradual, no reset seco)
  maxStacks:8,       // techo de stacks
  perStack:{ atkspd:4, dmgPct:3 },  // por stack: +4 atk-speed (aditivo, entra al ATKSPD_TOTAL_CAP) y +3% daño
};

// CAS-1785 — Parada con Tempo (timing parry). Pulsar la tecla de parada (KeyH) arma una ventana
// estrecha (`windowMs`); recibir un golpe CUERPO-A-CUERPO dentro de ella lo niega por completo y
// dispara un contraataque (daño + empuje) al atacante, más un buff de 1 golpe (`riposteMul`).
// Melee-only NATURAL: los proyectiles pasan `src=null` a damageHero ⇒ nunca parables. HARD-GATED
// tras `enabled`: false ⇒ 0 lectura de input de parada, 0 estado nuevo en el héroe, 0 ramas nuevas
// ⇒ sim + save.v1 byte-idénticos. Timing PURO: CERO draws de RNG incluso con enabled:true (la parada
// no abre stream nuevo; el contra rutea por hitEnemy y sólo consume srand si el build tiene crit —
// igual que cualquier golpe — pero eso es una ACCIÓN del jugador, no lo añade el flag). Run-state
// transitorio (mirror `atkspdBuff`/`frenzyT`): NO se serializa.
export const PARRY = {
  enabled:true,
  key:"KeyH",       // CAS-1996: alias fijo de la Parada con Tempo (antes hardcodeado en input.js). Data-driven ⇒ el Códice de Combate lee PARRY.key en vez de mentir con un literal. Behavior-identical (input.js:263 lee este campo).
  windowMs:150,     // ventana activa tras pulsar (spec 120–180ms; 150 = punto medio)
  cooldownS:0.55,   // cooldown tras cualquier pulsación (anti-spam; fuera de ventana = whiff)
  counterDmg:26,    // daño del contraataque al atacante melee parado (ruteado por hitEnemy ⇒ crit/procs)
  knockback:230,    // empuje aplicado al atacante parado
  riposteMul:1.5,   // buff de 1 golpe: el PRÓXIMO hitEnemy del héroe ×este mult (consumible, transitorio)
};

// CAS-1790 — Telegrafía de ataque enemigo (heavy attack wind-ups). Los golpes PESADOS
// (jefe/campeón/capstone/élite) ganan un aviso legible: un piso de lead-time (M1, timing puro
// 0-RNG) + un cue procedural cosmético (M2, contracting ring + marca de suelo anticipatoria para
// las ráfagas radiales). HARD-GATED: enabled:false ⇒ 0 FX nuevos, 0 ajuste de windup, 0 lectura
// ⇒ sim + save.v1 byte-idénticos a HEAD. Presentación pura: NUNCA toca daño/cooldowns/IA/RNG de
// combate ni el save. Reintroduce UN marcador controlado heavy-only sin revivir el ruido
// por-arquetipo que CAS-403 quitó (aquel sigue compilado fuera por TELEGRAPHS_OFF).
export const TELEGRAPH = {
  enabled:true,
  leadMs:300,      // ventana de reacción reservada antes de un impacto PESADO (banda 250-350ms)
  heavyOnly:true,  // v1: élites/campeones/jefes/capstones; mobs básicos sin cambios
};

// CAS-1814 — Esquiva Rodante (dodge roll con i-frames). Realce REACTIVO con-knob del `doRoll`
// EXISTENTE (CAS-1618), NO una mecánica nueva: la esquiva ya rueda (tecla Space), niega TODO daño
// (melee Y ranged) por el i-frame universal en damageHero, y tiene cooldown (rollCD transitorio).
// Con enabled:true, doRoll deriva iframe/cooldown/distancia de estos params (banda reactiva del
// issue) en vez de CFG.roll*, conservando los bonos existentes (bb.iframeAdd + metaDashIframe +
// Estela Ardiente que se SUMAN igual), y render dibuja un aura de invulnerabilidad legible durante
// la ventana. HARD-GATED: enabled:false ⇒ doRoll usa CFG.rollIFrame/rollCD/rollSpeed EXACTOS y no
// se dibuja aura ⇒ sim + render byte-idénticos a HEAD. Timing PURO: 0 draws de RNG (reusa el i-frame
// que ya es 0-RNG; NO abre stream nuevo). NO persiste: el cooldown reusa rollCD (run-state
// transitorio, patrón parryCD/atkspdBuff), save.v1 byte-idéntico con o sin el flag.
export const DODGE = {
  enabled:true,
  cooldownMs:900,   // banda 800–1200; reactivo deliberado (HEAD roll = 620ms)
  iframeMs:280,     // banda 200–300; niega TODO daño (melee+ranged) (HEAD roll = 340ms)
  distance:92,      // px de impulso ≈ rollSpeed×rollTime actual (86px); neutro
};

// CAS-1819/1820 — HABILIDADES ESPECIALES TELEGRAFIADAS PARA ENEMIGOS. NO es un sistema nuevo: monta 2
// ataques especiales telegrafiados sobre la maquinaria VIVA (special.slam radial + la IA windup→strike +
// armTelegraph + el choke damageHero). Al promover un ÉLITE de ambush, por su FAMILIA de arquetipo, se le
// asigna UN `special`: rusher→A1 embestida direccional (lunge), brute→A2 golpe de suelo radial (slam).
// HARD-GATED: enabled:false ⇒ 0 asignaciones nuevas ⇒ el strike jamás alcanza las ramas nuevas ⇒ sim +
// save byte-idénticos a HEAD (reversible en 1 línea). Cadencia-determinista (e.atkCount % every ⇒ 0 draws
// del srand principal; abilityRng 0x0ab111a7 dedicado para cualquier varianza opcional) ⇒ srand ON==OFF.
// `e.special` vive en la entidad (run-state transitorio, NO serializado igual que los slams de jefe) ⇒
// save.v1 byte-idéntico sin tocar el esquema. Lead-time ≥ TELEGRAPH.leadMs (heredado por armTelegraph).
export const ENEMY_ABILITIES = {
  enabled:true,
  // A1 embestida direccional (familia rusher élite): dash recto por el facing BLOQUEADO en windup; contacto
  // ⇒ damageHero(src=e) ⇒ parable (KeyH) Y evadible por i-frames Y evitable saliendo del carril.
  lunge:{ every:3, windup:0.5, distance:150, dmgMul:1.5 },
  // A2 golpe de suelo radial (familia brute élite): reusa special.slam; shards src=null ⇒ NO parables pero
  // evadibles rodando / saliendo del anillo. `radius` dimensiona el anillo de suelo telegrafiado.
  slam:{ every:4, windup:0.9, count:12, spd:170, dmgMul:1.15, life:1.1, radius:104 },
};

// CAS-1826 — ATURDIMIENTO POR POSTURA (Poise / Stagger). El PAYOFF que cierra el bucle de combate
// (Telegrafía CAS-1790 · Parada CAS-1785 · Esquiva CAS-1814 · Habilidades CAS-1819): cada ÉLITE / CAMPEÓN /
// JEFE lleva una barra de POSTURA oculta que sube con cada golpe del héroe; al llenarse se ROMPE ⇒ el
// enemigo queda ATURDIDO (ventana de daño-bonus). NO es un sistema nuevo: el stagger ES un `e.stun`
// disparado por postura (reusa 100% el gate de congelamiento de IA, sim.js:3274, CERO código nuevo de IA) +
// un `e.staggerT` que marca la ventana de bonus/VFX. HARD-GATED: enabled:false ⇒ ningún campo se toca,
// ninguna rama corre ⇒ sim + save.v1 byte-idénticos a HEAD. La postura es 100% DETERMINISTA (acumulación
// aritmética + umbral): NO abre stream de RNG (no existe `poiseRng`) ⇒ srand ON==OFF incluso con el stagger
// disparando de verdad. Los 5 campos (poise/poiseMax/staggerT/staggerCD/_poiseDecayT) son run-state
// transitorio del enemigo (mirror e.special/e.stun); `G.enemies` NUNCA se serializa ⇒ save aislado.
export const POISE = {
  enabled:true,
  basicMelee:false,        // v1: sólo élites/campeones/jefes; true incluye melee básicos (rango corto)
  // postura por evento de golpe: pesados/definitivas cargan más (deriva de opt.heavy/opt.ultimate en hitEnemy;
  // sin flag ⇒ light). parry = pulso de una parada exitosa; telegraphPunish = bonus por castigar un windup pesado.
  gain:{ light:12, heavy:26, ultimate:40, parry:40, telegraphPunish:25 },
  decayDelay:2.5,          // s sin golpear antes de empezar a decaer la postura acumulada
  decayRate:18,            // postura/s de decaimiento una vez pasado decayDelay
  reStaggerCD:6.0,         // s de cooldown tras un stagger antes de re-acumular (evita lock infinito)
  elite:{ max:100, dur:1.6, bonusDmg:1.5 },   // élites / campeones / élite-campeones
  boss:{  max:280, dur:1.0, bonusDmg:1.6 },   // jefe: más postura, aturdimiento más corto, apertura MAYOR (clímax)
};

// CAS-1831: SISTEMA DE COMBOS / MOVESET con rematador anti-Stagger. Cierra el loop Souls-like por el lado
// OFENSIVO: cadena ligera L→L→L (el 3º swing = FINISHER: +daño/+knockback), un ataque PESADO en tecla dedicada
// (más lento, más daño, alimenta POISE.gain.heavy ⇒ vía natural para romper postura CAS-1826), y el REMATADOR:
// un × extra al golpe MELEE sobre un enemigo con e.staggerT>0 (marcador de CAS-1826) que apila sobre POISE.bonusDmg.
// 100% TIMING/INPUT: la cadena avanza por ventana de tiempo y el rematador por umbral aritmético ⇒ CERO draws,
// NO existe `comboRng` (nada que sembrar) ⇒ srand ON==OFF incluso con el combo disparando de verdad. El estado
// (comboCount/comboT) es run-transitorio del héroe (mirror frenzyStacks) ⇒ serializeSave (allowlist) lo excluye ⇒
// save.v1 byte-idéntico y SIN clave `mithralda.combo.*` nueva. HARD-GATED: enabled:false ⇒ ninguna rama corre,
// botón de ataque intacto, tecla pesada inerte ⇒ comportamiento byte-idéntico a HEAD.
export const COMBO = {
  enabled:true,
  // --- cadena ligera (L→L→L) ---
  windowMs:900,        // ventana de encadenado; si expira ⇒ comboCount=0 (la cadena se enfría)
  chainLen:3,          // golpes hasta el finisher (el chainLen-ésimo swing ES el finisher)
  finisherMul:1.6,     // daño × del finisher de cadena
  finisherKnock:1.7,   // knockback × del finisher de cadena
  // --- ataque pesado (tecla dedicada) ---
  heavyKey:"KeyN",     // v1 desktop: tecla dedicada, aislada (mirror KeyH de Parry). KeyG del spec choca con `forge`.
  heavyCdMul:1.9,      // más lento (cooldown ×)
  heavyDmgMul:1.7,     // más daño
  heavyPoise:"heavy",  // alimenta POISE.gain.heavy(26) ⇒ vía natural de romper postura
  // --- rematador anti-Stagger (corazón) ---
  staggerPunishMul:1.6 // × extra al golpear MELEE a un enemigo con e.staggerT>0 (apila sobre POISE.bonusDmg)
};

// CAS-1836: GOLPE POR LA ESPALDA — crítico POSICIONAL. Cierra el loop Souls-like por el eje de POSICIONAMIENTO
// (complementa TIMING: Telegrafía/Esquiva/Parada/Poise/Combos) y convierte la Esquiva Rodante (CAS-1814) en
// OFENSIVA: rodar detrás de un enemigo con facing COMPROMETIDO (wind-up telegrafiado, lunge, carga, o STAGGER)
// habilita el crítico. Un golpe MELEE (opt.melee) cuyo vector de ataque entra por el ARCO TRASERO del enemigo
// (|angDiff(ang,e.facing)| < rearArcDeg/2) aplica ×mult daño + ×knockMul knockback. Geometría 100% PURA sobre
// `e.facing` (que ya vive y no se serializa) ⇒ CERO draws, NO existe `backstabRng` (nada que sembrar) ⇒ srand
// ON==OFF incluso con el backstab disparando de verdad; NO añade estado al héroe ni al enemigo ⇒ save.v1 byte-id
// y SIN clave nueva. Apila sobre POISE.bonusDmg + el rematador CAS-1831 (los tres multiplican en el mismo sink).
// HARD-GATED: enabled:false ⇒ ninguna rama corre ⇒ dmg/knock/VFX/save/srand byte-idénticos a HEAD.
export const BACKSTAB = { enabled:true, rearArcDeg:120, mult:1.8, knockMul:1.6 };

// CAS-1841: ESTAMINA / VIGOR (Pilar 8 · economía de recurso). Los 7 pilares vivos (Telegrafía/Esquiva/Parada/
// Habilidades/Poise/Combos/Backstab) sólo DAN poder; ninguno COBRA. La estamina hace de cada acción de PODER una
// decisión con coste, sin estrangular el momento-a-momento: el ataque ligero L NUNCA gasta. Es un recurso
// TRANSITORIO del héroe (`h.stam`, refill a tope cada run como `h.mp`) que un único helper `spendStam(h,cost)`
// consume por acción; el gate es 100% aritmético (comparar+restar) ⇒ CERO draws, NO existe `staminaRng` (nada que
// sembrar) ⇒ srand ON==OFF incluso con la estamina gastando/denegando/regenerando de verdad. Fuera del allowlist de
// serializeSave ⇒ save.v1 byte-idéntico y SIN clave nueva. HARD-GATED: enabled:false ⇒ `spendStam` retorna true sin
// tocar estado y la barra HUD no se crea ⇒ dmg/knock/save/srand/DOM byte-idénticos a HEAD. Los NÚMEROS son decisión
// de FEEL/BALANCE del CEO (retune = edición de knob barata y reversible, sin rebuild de lógica).
export const STAMINA = {
  enabled:true,
  max:100, regen:17,          // por segundo; pool lleno ~4.5 s ocioso
  regenDelay:0.35,            // pausa de regen tras gastar (feel)
  flashS:0.4,                 // duración del flash de la barra en un deny
  cost:{ dodge:25, parry:20, heavy:30, finisher:30, ability:25, ultimate:40 }
};

// CAS-1847: ENFOQUE DE OBJETIVO (Lock-On / Target Focus, 9ª feature Souls-like). Unifica los 8 pilares vivos
// (Telegrafía/Esquiva/Parada/Habilidades/Poise/Combos/Backstab/Estamina) dándole al jugador control fino de
// `facing` contra un objetivo elegido. Hoy `h.facing` sigue la dirección de MOVIMIENTO (sim.js:3294), así que
// casi todo el combate reactivo (arco de Backstab, contra de Parada, orientación de Combos, todo swing melee)
// depende de a-dónde-caminas. El Lock-On DESACOPLA `facing` del movimiento: con lock, un ÚNICO seam maestro
// sobreescribe `h.facing` al objetivo cada frame (auto-encara) mientras `h.vx/h.vy` (desde `mv`) siguen intactos
// ⇒ STRAFE automático. Selección por distancia (sort determinista, tie-break por índice) + override de ángulo:
// geometría/input 100% PUROS ⇒ CERO draws, NO existe `lockOnRng` (nada que sembrar) ⇒ srand ON==OFF incluso con
// el lock disparando de verdad. Estado TRANSITORIO del héroe (`lockTarget`/`lockCd`, mirror comboCount/stam,
// fuera del allowlist de serializeSave) ⇒ save.v1 byte-id y SIN clave nueva. Reticle 100% procedural (canvas,
// $0 arte). HARD-GATED: enabled:false ⇒ input inerte, sin override, sin reticle, sin estado ⇒ byte-idéntico a
// HEAD; y sin pulsar la tecla ⇒ idéntico a hoy aun con la feature ON. `range`/`key` = decisión FEEL/BALANCE del
// CEO (retune = edición de knob barata, mirror dash CAS-1814 / estamina CAS-1841).
export const LOCK_ON = { enabled:true, key:"Tab", range:340, cycleCd:0.14, reticleCol:"#ffd15c" };

// CAS-1854: FRASCO DE CURACIÓN (Estus, 10ª feature Souls-like). Los 9 pilares vivos hacen el COMBATE legible y
// castigable; ninguno convierte CURARSE en una decisión. Hoy la vida sólo vuelve pasivamente (lifesteal/on-kill/
// descanso) o con consumibles instantáneos sin coste posicional. El Estus cierra el bucle DEFENSIVO: pulsar-para-
// beber arranca un canal ENRAIZADO + VULNERABLE ~0.75s (sin i-frames ⇒ backstab/telegraph lo castigan solos), cura
// un % de vida máx, gasta 1 de N cargas, y las cargas se rellenan al cambiar de zona (descanso). Reusa el "root +
// vulnerable" que YA existe: añadir `|| h.flaskDrinkT>0` a los gates de acción (heroAttack/heavyAttack/castSpell/
// doRoll) enraiza GRATIS; el cancel-on-action es la cara inversa (input de mover/atacar/rodar aborta el trago sin
// gastar carga). Recurso TRANSITORIO (flaskCharges/flaskDrinkT/flaskZone, mirror stam/lockTarget, fuera del allowlist
// de serializeSave ⇒ save.v1 byte-id y SIN clave nueva). Curación 100% timing/input ⇒ CERO draws, NO existe
// `flaskRng`. Pips + tinte 100% procedurales ($0 arte). HARD-GATED: enabled:false ⇒ input inerte, sin canal/root/
// pips/tinte/refill ⇒ byte-idéntico a HEAD. Los NÚMEROS + `key` = decisión FEEL/BALANCE del CEO (retune = knob barato,
// mirror dash CAS-1814 / estamina CAS-1841).
// DESVÍO GE del spec: el spec proponía key:"KeyF", pero KeyF YA está ligado a `pickup` (settings.js:39) ⇒ en la escena
// play `playAction("KeyF")` resuelve a pickup y consume el evento ANTES del fixed-handler ⇒ el frasco nunca dispararía.
// KeyU es la única LETRA libre en play (fuera de REBINDS; sólo se usa en la escena abilitysel) ⇒ se resuelve por el
// fixed-handler igual que KeyH/KeyN/Tab. Mismo precedente que CAS-1832 (heavyKey KeyG→KeyN por colisión con la forja).
// CEO confirma/retune la tecla en el Gate.
export const FLASK = { enabled:true, key:"KeyU", charges:3, healPct:0.40, drinkMs:750, cancelOnAction:true, refillOnZone:true };

// CAS-1867: MANCHA DE SANGRE (Bloodstain / Corpse-Run) — 11ª feature Souls-like, cierra la tríada de CASTIGO
// (Poise/Stagger + Estus + CONSECUENCIA DE MUERTE). Hoy morir BANCA automáticamente toda la Esencia del run
// (sim.js:3001). Este knob INTERCEPTA ese banking: la Esencia ganada pasa a estar EN RIESGO como una Mancha de
// Sangre en el punto de muerte; recuperarla volviendo a la zona la banca; morir otra vez antes la PIERDE. `lossPct`
// = fracción de la Esencia del run que se arriesga (1.0 ⇒ toda; el resto se banca "seguro"); `recoverRadius` = radio
// de recogida (walk-over); `markerColor` = charco $0 arte. Estado runtime G.bloodstain {zone,x,y,amount}|null en su
// PROPIO store aislado (mithralda.bloodstain.v1, mirror KEY_ARENA) ⇒ save.v1 intacto y SIN clave nueva. 0 RNG
// (posición=punto de muerte, recuperación=dist²) ⇒ srand ON==OFF. HARD-GATED: enabled:false ⇒ el banking de siempre
// corre igual, sin marcador, sin store ⇒ byte-idéntico a HEAD. `lossPct`/`recoverRadius` = decisión FEEL/BALANCE del CEO.
export const BLOODSTAIN = { enabled:true, lossPct:1.0, recoverRadius:32, markerColor:"#8b0000" };

// CAS-1873: ESCUDO / BLOQUEO CON GUARDIA (Shield Block, 12º pilar · el DEFENSIVO faltante). Mantener el bloqueo
// (hold ShiftLeft / botón táctil hold) levanta la guardia en un ARCO FRONTAL. Un golpe MELEE entrante por el frente
// se MITIGA (no niega) y consume ESTAMINA (CAS-1841) proporcional al daño absorbido; agotar la estamina en un bloqueo
// dispara RUPTURA DE GUARDIA = el mismo `h.stun` STAGGERED de CAS-1826 (ventana punible). NO da i-frames, NO niega
// ranged (src=null lo salta, igual que Parry), melee+frontal-only. Distinto de Parada (CAS-1785, timing counter):
// sostenido, trade de recurso. Estado TRANSITORIO (`h.blocking`, mirror stam; guard-break reusa `h.stun` que YA
// existe y YA está fuera del allowlist de serializeSave) ⇒ save.v1 byte-id y SIN clave nueva. 100% input/geometría/
// aritmética ⇒ CERO draws, NO existe `blockRng` ⇒ srand ON==OFF incluso con el bloqueo/ruptura disparando de verdad.
// Guardia dibujada con canvas primitives (arco/tinte, $0 arte). HARD-GATED: enabled:false ⇒ input inerte, sin
// h.blocking, rama de damageHero muerta, sin arco/botón ⇒ byte-idéntico a HEAD; sin pulsar ⇒ idéntico a hoy con la
// feature ON. Los NÚMEROS + `key` = decisión FEEL/BALANCE del CEO (retune = knob barato, mirror dash/estamina/estus).
// Decisión de tecla (CTO): las 26 letras ocupadas + right-click=aim ⇒ `ShiftLeft` (hold, libre en todo el repo,
// semántica de "brace"); móvil = botón HUD hold. CEO retunea por knob en el Gate.
export const SHIELD_BLOCK = {
  enabled:true,
  key:"ShiftLeft",   // HOLD para levantar la guardia (desktop); móvil = botón HUD hold (mirror tb.flask)
  frontArcDeg:150,   // cono frontal que cubre la guardia (espejo frontal de BACKSTAB.rearArcDeg sobre h.facing)
  mitigate:0.65,     // fracción del daño MELEE frontal ABSORBIDA (0.65 ⇒ pasa el 35%); mitigación, NO negación
  stamPerDmg:0.6,    // estamina (CAS-1841) consumida por punto de daño absorbido
  breakStunS:0.9,    // ruptura de guardia ⇒ h.stun segundos (REUSA el STAGGERED de CAS-1826)
  moveMul:0.55,      // velocidad de strafe con la guardia arriba (gateado; OFF/no-bloqueando ⇒ sin efecto)
};

// CAS-2107: CONTRAGOLPE DE GUARDIA (Guard Counter, 33º mecánica · umbrella CAS-2105). Convierte el BLOQUEO con escudo
// (SHIELD_BLOCK CAS-1873, hoy 100% defensivo/pasivo) en una oportunidad OFENSIVA: tras ABSORBER un golpe melee frontal
// con la guardia SIN romperla, se abre una ventana breve (windowS) en la que el SIGUIENTE swing LIGHT del héroe se
// convierte en un Contragolpe — daño ×dmgMul + poise-damage ×poiseMul (ALTO ⇒ eje de stagger/rotura). Da identidad
// ofensiva al escudo y un eje activo turtle-vs-counter. NO exige timing en la parada (distinto de PARRY CAS-1785, que sí);
// sólo absorber y responder rápido. 100% BORROW sobre pilares vivos:
//   · La ventana se ARMA en la rama de BLOQUEO OK de damageHero (no-break); la rama de RUPTURA NO la abre (sin premio).
//   · Ranged (src=null) NI ENTRA a la rama de bloqueo ⇒ nunca abre ventana (melee frontal-only heredado).
//   · Dos manos (h.twoHand): el escudo está envainado ⇒ no hay bloqueo ⇒ no hay contragolpe (rides el gate existente).
//   · Consumo: en applyHeroMelee, un swing LIGHT dentro de la ventana pega ×dmgMul, alimenta POISE.gain ×poiseMul (opt.guardCounter),
//     gasta staminaCost (reusa STAMINA CAS-1841) y cierra la ventana (h.guardCounterT=0). Sin ventana ⇒ swing byte-idéntico.
// Estado TRANSITORIO `h.guardCounterT` (mirror h.blocking/h.parryT): FUERA del allowlist de serializeSave ⇒ save.v1
// byte-idéntico y SIN clave nueva; decae por dt cada fixed-frame. 100% timing/geometría/aritmética ⇒ CERO draws, NO existe
// `guardCounterRng` ⇒ srand ON==OFF byte-idéntico incluso con el contragolpe disparando de verdad. HARD-GATED: enabled:false
// ⇒ h.guardCounterT nunca sube, rama de ataque intacta ⇒ build byte-idéntico a HEAD (OFF==baseline). Números = defaults
// sanos para QA; el CEO retunea + flipea enabled:false→true en el Gate (config-only 1 línea). $0 arte (VFX = primitiva canvas existente).
export const GUARD_COUNTER = {
  enabled:true,         // CAS-2105 Gate CEO GO-LIVE flip (QA PASS×2 868a3cb231ac, config-only 1 línea).
  windowS:0.6,          // ventana de contragolpe (s) tras un bloqueo exitoso (no-break)
  dmgMul:1.8,           // daño del contragolpe vs ataque light normal
  poiseMul:2.5,         // daño de POISE del contragolpe (ALTO ⇒ eje de stagger/rotura)
  staminaCost:10,       // estamina gastada en el contragolpe (reusa STAMINA; 0 = gratis)
};

// CAS-2110: CONTRAATAQUE DE ESQUIVA / PERFECT DODGE COUNTER (mecánica #34). Cierra el gap #2 del audit de cohesión
// CAS-2085: el Guard Counter (#33) premia bloquear pero REQUIERE escudo ⇒ las clases ranged/sin-escudo no tienen
// conversión defensa→ofensiva. Esta mecánica da esa conversión vía el verbo ESQUIVA (universal, todas las clases):
// una ESQUIVA PERFECTA (i-frames de un rodar que SOLAPAN un ataque que HABRÍA conectado, ya detectada por perfectDodge())
// abre una ventana breve donde el siguiente swing LIGHT pega reforzado. Paridad SIN romper la identidad del escudo:
// números POR DEBAJO del Guard Counter (dmg 1.5<1.8, poise 2.0<2.5, stam 6<10) porque la esquiva es más accesible.
//   · Apertura: en perfectDodge (llamado por damageHero cuando los i-frames de un ROLL activo niegan un golpe REAL
//     entrante) — si el rodar arrancó hace ≤ perfectWindowMs ⇒ abre h.dodgeCounterT = windowS. Una esquiva NORMAL
//     (i-frame fuera del solape con un impacto real, o rodar viejo) NO dispara (perfectDodge sólo corre en el solape).
//   · Consumo: en applyHeroMelee, un swing LIGHT dentro de la ventana pega ×dmgMul, alimenta POISE.gain ×poiseMul
//     (opt.dodgeCounter), gasta staminaCost (reusa STAMINA CAS-1841) y cierra la ventana (h.dodgeCounterT=0).
//   · Composición con GUARD_COUNTER (AC3): una esquiva NIEGA el hit ⇒ no hay bloqueo ⇒ jamás disparan ambos en el mismo
//     evento; y en un swing con ambas ventanas abiertas el guard-counter TIENE PRECEDENCIA (dc gated en !gc) ⇒ nunca
//     multiplican los dos ⇒ daño acotado.
// Estado TRANSITORIO `h.dodgeCounterT` (mirror h.guardCounterT/h.parryT): FUERA del allowlist de serializeSave ⇒ save.v1
// byte-id y SIN clave nueva. RNG-neutral ESTRICTO: todo por input/timing/aritmética, CERO draws de srand, NO existe
// `dodgeCounterRng`. HARD-GATED: enabled:false ⇒ h.dodgeCounterT nunca sube, rama de ataque intacta ⇒ build byte-idéntico
// a HEAD (OFF==baseline). Números = defaults sanos para QA; el CEO retunea + flipea enabled:false→true en el Gate CAS-2111
// (config-only 1 línea). $0 arte (VFX = primitiva canvas existente, render sin tocar).
export const DODGE_COUNTER = {
  enabled:true,           // LIVE — CEO flip false→true en Gate CAS-2111 GO (mec #34, mirror CAS-2105/2093/2075). Reversible→false.
  windowS:0.5,            // ventana de contragolpe (s) tras una esquiva perfecta
  dmgMul:1.5,             // < guard counter (1.8): la esquiva es más accesible que el bloqueo con escudo
  poiseMul:2.0,           // < guard counter (2.5): daño de POISE del contragolpe de esquiva
  staminaCost:6,          // < guard counter (10): estamina gastada al lanzar el swing reforzado
  perfectWindowMs:160,    // timing: sólo cuenta como esquiva PERFECTA si el rodar arrancó hace ≤ este umbral
  requiresShield:false,   // UNIVERSAL — paridad ranged/sin-escudo (documenta la intención; la esquiva no usa escudo)
};

// CAS-2114: RECUPERACIÓN / RALLY / REGAIN (mecánica #35). Icónica Souls/Bloodborne, ausente en las 34 vivas: al RECIBIR
// daño una fracción del HP perdido queda RECUPERABLE por una ventana corta; GOLPEAR en melee dentro de la ventana devuelve
// parte del pool. Premia la agresividad post-hit (identidad de riesgo/recompensa). Compone con dodge-counter (#34) y
// guard-counter (#33) sin solaparse: aquellos amplifican el swing, éste convierte el swing en curación de un pool armado
// por el daño recibido — ejes ortogonales.
//   · Apertura: en damageHero, TRAS aplicar el daño real (h.hp-=real) ⇒ h.rallyPool += real×recoverFrac (capeado a
//     capFracMaxHp×HPmax, anti-abuse jefes) y h.rallyT = windowS. Corre después de todos los early-outs de negación
//     (parry/i-frame/dodge/block) ⇒ sólo el daño que DE VERDAD entró alimenta el pool.
//   · Decaimiento: en tickRally (nuevo, junto a tickDodgeCounter) el pool decae lineal decayPerSec×HPmax/s mientras
//     h.rallyT>0; al expirar la ventana el pool se fuerza a 0 (windowS = techo duro). Sin golpear ⇒ el pool se pierde.
//   · Consumo: en applyHeroMelee, un swing que CONECTA al menos un enemigo cura min(rallyPool×healPerHitFrac, rallyPool)
//     y lo resta del pool (healPerHitFrac<1 ⇒ nunca full-heal de un golpe). requiresMelee documenta que SÓLO el melee
//     recupera (identidad de riesgo — el ranged no arriesga acercarse); la cura vive en la ruta melee ⇒ intrínsecamente melee.
// Estado TRANSITORIO h.rallyPool/h.rallyT (mirror h.dodgeCounterT): FUERA del allowlist de serializeSave ⇒ save.v1 byte-id
// on/off y SIN clave nueva. RNG-neutral ESTRICTO: 0 draws, NO existe rallyRng (timers/estado puros deterministas) ⇒ srand
// byte-id ON==OFF. HARD-GATED: enabled:false ⇒ h.rallyPool nunca sube, ramas de daño/melee INTACTAS ⇒ build byte-idéntico
// a HEAD (OFF==baseline). $0 arte: overlay 'ghost HP' translúcido en la barra existente (primitiva canvas ya viva) + floater.
// Números = defaults sanos para QA; el CEO retunea + flipea enabled:false→true en el Gate (config-only 1 línea).
export const RALLY = {
  enabled:true,         // CAS-2115 Gate CEO GO-LIVE (mec #35 Rally/Regain). Flip false→true, config-only 1 línea. Reversible→false.
  recoverFrac:0.35,     // fracción del daño REAL recibido que entra al pool recuperable
  windowS:3.0,          // ventana (s) — techo duro; al expirar el pool se fuerza a 0
  healPerHitFrac:0.5,   // fracción del pool que devuelve un golpe melee que conecta (<1 ⇒ nunca full-heal de un golpe)
  decayPerSec:0.15,     // decaimiento lineal del pool (fracción de HPmax/s) mientras la ventana está viva
  capFracMaxHp:0.4,     // el pool nunca excede 40% HPmax (anti-abuse jefes)
  requiresMelee:true,   // sólo golpes melee recuperan (identidad de riesgo; la cura vive en la ruta melee)
};

// CAS-2127: RIPOSTE / EJECUCIÓN CRÍTICA POR ATURDIMIENTO (mecánica #36). El crítico clásico de Souls: el PRIMER golpe melee
// que conecta sobre un objetivo ROTO (e.staggerT>0, ventana abierta por poise-break sim.js:2902 — venga de combo-pesado,
// frost-shatter vía buildup→poise, two-hand, guard/dodge-counter, o el jefe firma) se convierte en una EJECUCIÓN (×dmgMul
// alto + tinte/flash propio + poise extra + pequeña Esencia) y CONSUME el estado armado ⇒ UN SOLO crítico por rotura (no
// crit infinito encadenado). Convierte toda la inversión en poise/parry/status en un momento de payoff LEGIBLE.
//   ⚠️ Eje DISJUNTO de h.riposte/CFG.riposteMult (CAS-210, mecánica distinta armada por PERFECT-DODGE del HÉROE). Éste se
//   llavea por el ESTADO DEL ENEMIGO (e._ripArm + e.staggerT>0). Ortogonal a Guard Counter #33 (h.guardCounterT) y Dodge
//   Counter #34 (h.dodgeCounterT): si un counter aterriza sobre un objetivo ya roto, el ×dmgMul apila multiplicativamente
//   sobre ese golpe pero CAPEADO (ripCapFracMaxHp) para NO one-shot.
//   · Armar: e._ripArm=true en el rising-edge del poise-break (sim.js:2902, chokepoint único de ventana fresca de stagger).
//   · Ejecutar: en hitEnemy, tras el sink de multiplicadores de stagger, ×dmgMul; cap duro ripCapFracMaxHp×maxHp SÓLO
//     jefe/élite/campeón (trash sin cap — ejecución total); consume e._ripArm=false; bonus Esencia pequeño.
//   · VFX: floater STR.riposteExec (¡CRÍTICO!) tinte ejecución + shockring/debris/shake reusando primitivas (JUICE-gated).
// Estado TRANSITORIO e._ripArm (mirror e.staggerT/e.poise): FUERA de serializeSave ⇒ save.v1 byte-id on/off, sin clave rip*.
// RNG-neutral ESTRICTO: 0 draws, NO existe riposteRng (detección+aplicación deterministas on-hit) ⇒ srand byte-id ON==OFF.
// HARD-GATED: enabled:false ⇒ e._ripArm nunca se arma, ramas de daño INTACTAS ⇒ build byte-idéntico a HEAD (OFF==baseline).
// $0 arte: reusa primitivas addFx/floater ya vivas. Números = defaults sanos para QA; el CEO retunea + flipea en el Gate.
export const RIPOSTE = {
  enabled:true,           // CAS-2132 CEO GATE GO 07-11 — flip config-only tras QA PASS×2 OBSERVABLE. Reversible→false. sim.js byte-id (srand ON==OFF).
  dmgMul:2.2,             // multiplicador de ejecución sobre el 1er golpe melee al objetivo roto
  poiseMul:1.5,           // poise-damage × (paridad #33/#34; casi no-op contra target ya roto — pausa de acumulación mientras staggerT>0)
  essenceBonus:2,         // Esencia pequeña por ejecución (recompensa de skill; banca a meta, no toca save.v1)
  ripCapFracMaxHp:0.25,   // cap duro: 1 Riposte ≤ 25% maxHp de jefe/élite/campeón (anti one-shot aun apilando counter+afijos). Trash SIN cap.
  requiresMelee:true,     // sólo golpes melee ejecutan (identidad de payoff ofensivo)
};

// CAS-2133: ATAQUE CARGADO CON HÍPER-ARMADURA (mec #37). Eje de INICIATIVA PROACTIVA vs el sesgo reactivo de #33–#36.
// Mantener COMBO.heavyKey (KeyN, dedicada, non-rebindable, SIN consumidor de keyup ⇒ 0 colisión) > chargeThresholdMs
// entra en estado *cargando*: la híper-armadura del WINDUP absorbe interrupciones (el daño se recibe, capeado anti-cheese);
// soltar → golpe cargado (×dmg/××poise/+stamina). Soltar antes del umbral = pesado normal (= HEAD byte-id).
// RNG-neutral ESTRICTO: 0 draws, NO existe chargeRng. Save-neutral: chargeT/charging/_charged transitorios (fuera save.v1).
// mec #37 SÍ toca input.js (plumbing HOLD KeyN → io.chargeHeld) + render.js (medidor de windup). Auditar settings.binds byte-id.
// enabled:false ⇒ io.chargeHeld=false → rama muerta → KeyN dispara heavyAttack() inmediato = HEAD byte-id. $0 arte.
export const CHARGED_ATTACK = {
  enabled:true,                 // LIVE — flipeado por CEO Gate CAS-2139 post-QA-PASS×2 CAS-2137
  chargeThresholdMs:350,        // hold ≥ umbral ⇒ cargado; soltar antes ⇒ pesado normal (= HEAD byte-id)
  maxChargeMs:900,              // tope del acumulador (evita hold infinito; feel/tuning CEO)
  dmgMul:1.7,                   // ×daño del golpe CARGADO (compone MULTIPLICATIVAMENTE con COMBO.heavyDmgMul y counters)
  poiseMul:2.5,                 // ×daño de POISE del cargado (eje de rotura OFENSIVO — observable contra targets NO rotos)
  staminaCost:12,               // estamina EXTRA sobre el pesado normal (coste del commit de carga)
  hyperArmorGrant:999,          // umbral de poise DURANTE el windup (alto=absorbe casi todo; CEO lo baja para tuning)
  incomingDmgCapFracMaxHp:0.18, // cap de daño ENTRANTE por golpe mientras cargas (anti-cheese: absorber ≠ inmunidad)
  releaseCapFracMaxHp:0.22,     // cap del cargado vs jefe/élite/campeón (anti one-shot); trash SIN cap (ejecución pesada)
  requiresMelee:true,           // sólo clases melee cargan (identidad del pesado; ranged/casters sin cargo)
};

// CAS-2146: EMPUJÓN / PATADA ROMPE-GUARDIA (mec #38, 38ª). VERBO OFENSIVO ANTI-TURTLE — la respuesta PROACTIVA que le
// faltaba al kit DEFENSIVO (Guard Counter #33 / Dodge Counter #34 / Riposte #36 / Parry). ORTOGONAL a los cuatro: aquéllos
// convierten UNA DEFENSA DEL HÉROE (bloqueo/esquiva/parada) o un ENEMIGO YA ROTO en daño; ÉSTE es un botón que el héroe
// PULSA para DRENAR la postura de un enemigo que TURTLEA/bloquea y ROMPERLE la guardia — abriendo la MISMA ventana de
// ejecución que ya existe (staggerT + _ripArm de Riposte #36; chokepoint sim.js:2942/2947), NO un motor nuevo. NO es burst:
// daño directo BAJO (utilidad), coste de estamina propio + ventana de recuperación (no spammeable). Contra un enemigo
// ESCUDADO (carapace, daño-inmune) la patada CASCA la guardia (e.shieldBroken ⇒ shatterCarapace) — el anti-turtle real, ya
// que hoy sólo los procs de estado rompen el carapace. RNG-neutral ESTRICTO: 0 draws, NO existe guardBreakRng (geometría +
// aritmética). Save-neutral: h._gbCd transitorio (mirror h.artCD ⇒ fuera del allowlist de save.v1). mec #38 toca input.js
// (tecla dedicada Period + botón HUD móvil) + render.js (botón). enabled:false ⇒ tecla inerte + guardBreakKick() rama muerta
// ⇒ byte-idéntico a HEAD. $0 arte (reusa knockback/shove + floater + el ¡ATURDIDO! del poise-break del chokepoint).
export const GUARD_BREAK = {
  enabled:true,              // LIVE — Gate CEO CAS-2149 GO (QA CAS-2148 PASS×2 OBSERVABLE). Reversible → false restaura baseline byte-id.
  key:"Period",              // tecla DEDICADA no-rebindable (code LIBRE; Comma=Invocar adyacente). Móvil = botón HUD tap.
  range:52,                  // alcance del cono de la patada (px) — corto, melee-adyacente (gate natural para ranged/casters)
  arcDeg:130,                // cono frontal de la patada (grados)
  dmg:5,                     // daño directo BAJO (utilidad, NO burst)
  poiseMul:3.2,              // ×daño de POISE en el MISMO sink (POISE.gain) ⇒ drena/rompe la guardia de un enemigo que turtlea
  staminaCost:20,            // coste de estamina propio (deny sin vigor; spendStam flashea)
  recoverMs:600,             // ventana de recuperación (no spammeable) — h._gbCd transitorio (mirror h.artCD)
  knock:1.7,                 // ×knockback del empujón (reusa e.knock/knockX — $0 arte)
  cracksShield:true,         // ANTI-TURTLE: un enemigo ESCUDADO (carapace daño-inmune) pierde la guardia (shieldBroken ⇒ shatter)
  requiresMelee:false,       // verbo UNIVERSAL (toda clase responde al turtle); el alcance corto (range) ya lo gatea de facto
};

// CAS-2151: DEFLECT / REFLEJO DE PROYECTIL (mecánica #39 · verbo OFENSIVO UNIVERSAL anti-ranged). Recomendación #1 del
// Audit v5 (CAS-2150, GO). Ventana tempo-gated que REUSA la de PARRY (h.parryT): si mientras está activa un PROYECTIL
// ENEMIGO (G.projectiles con enemy:true) entra en el radio de captura, se INVIERTE a hero-owned + se REVIERTE su velocidad
// hacia el tirador con daño CAPEADO — en vez de sólo negarlo. Nicho genuinamente ausente: hoy la ÚNICA respuesta a un
// proyectil es RODAR (defensa pura, 0 ofensa); ranged/casters no tienen respuesta ofensiva. PARRY es melee-only por
// construcción (src=null en proyectiles ⇒ nunca entra), DODGE niega con i-frames (te mueve, 0 ofensa), SHIELD_BLOCK reduce
// chip melee. Ninguno CONVIERTE el proyectil en tu ofensa ⇒ DEFLECT es ortogonal (ver design/cas-mec39-deflect.md).
// $0 arte: reusa el sistema de proyectiles vivo + spark/dodgering + el propio sprite del proyectil (flip de dueño).
// RNG-neutral STRONG: geometría/aritmética pura, 0 draws, NO existe deflectRng. save-neutral: sólo muta campos del
// proyectil (G.projectiles NUNCA se serializa) + consume h.parryT (ya transitorio) ⇒ 0 clave nueva. enabled:false ⇒
// rama muerta ⇒ byte-idéntico al baseline (0-regresión de las 38 mec vivas). Reversible en 1 línea (CEO gate).
export const DEFLECT = {
  enabled:true,              // CAS-2154 Gate CEO GO-LIVE (mec #39) — flip config-only tras QA CAS-2153 PASS×2; reversible a false.
  captureRadiusPx:34,        // radio de captura del proyectil entrante DURANTE la ventana (px) — mayor que el hit-radius (18) para que la lectura sea legible, aún estrecho
  dmgFracCap:0.15,           // ANTI-DEGENERADO: daño reflejado capeado ≤15% maxHp del objetivo al impactar (mirror del cap de Riposte #36); nunca one-shot
  speedMul:1.15,             // × velocidad al revertir — ligero boost para que el proyectil alcance al tirador que ya se movió
  staminaCost:12,            // coste de estamina en un desvío exitoso (deny sin vigor NO — la ventana ya es el gate; sólo drena)
  oncePerWindow:true,        // 1 desvío por ventana (consume h.parryT, mirror parry) ⇒ una ráfaga radial de jefe NO se refleja entera con una pulsación
  requiresParryWindow:true,  // tempo-gate: SÓLO durante la ventana de parry (h.parryT>0) — no es un escudo pasivo
};

// CAS-2156: LUNGE / ESTOCADA DE AVANCE (mecánica #40 · primer verbo de MOVILIDAD-OFENSIVA anti-kite UNIVERSAL). Recomendación
// #2 del Audit v5 (CAS-2150, GO). Ataque COMPROMETIDO que TRASLADA al héroe hacia adelante (dash direccional a h.facing con un
// golpe de estocada de cono ESTRECHO) para castigar a un enemigo que retrocede/kitea o cerrar sobre un caster. Nicho ausente:
// hoy toda la movilidad es DEFENSIVA (roll con i-frames) o REACTIVA (deflect); no hay respuesta de movilidad OFENSIVA — perseguir
// caminando nunca alcanza (misma velocidad) y rodar no daña. LUNGE lo aporta. Ortogonal (ver design/cas-mec40-lunge.md): DODGE es
// su OPUESTO (defensa/i-frames/0 daño); CHARGED #37 es ESTACIONARIO con híper-armadura; GUARD_BREAK #38 es patada corta anti-turtle
// sin desplazamiento; DEFLECT #39 es reactivo anti-ranged; el Arte de dash es por-arquetipo (daga) con auto-target. $0 arte / 0 motor
// nuevo: reusa el vector de impulso del roll (moveEnt + patrón rollX/rollSpd), applyHeroMelee (hitbox, _mcfg sintetizado estrecho),
// STAMINA, el sprite de swing + anillo/estela de dash. RNG-neutral STRONG: geometría/aritmética pura, 0 draws, NO existe lungeRng
// (el golpe pasa por el MISMO hitEnemy que un swing normal). save-neutral: todo estado transitorio con prefijo _ (fuera del allowlist
// de serializeSave) ⇒ 0 clave nueva. ANTI-DEGENERADO: coste de estamina + recuperación (recoverMs, no spammeable) + dmgMul SUB-counter
// (reposición+castigo, NO burst) + SIN i-frames (NO reemplaza al roll defensivo; whiff = vulnerable) + cap de distancia. enabled:false
// ⇒ input gated + lungeStrike retorna en el 1er gate + _lunge nunca se arma ⇒ byte-idéntico al baseline (0-regresión 39 mec vivas).
export const LUNGE = {
  enabled:true,              // GO-LIVE — CEO gate flip false→true tras QA CAS-2158 PASS×2. Reversible en 1 línea.
  key:"Backslash",           // tecla DEDICADA no-rebindable (code LIBRE grep-verificado; 26 letras + Semicolon/Quote/Slash/Brackets/Comma/Period/KeyN/KeyE ocupadas). Móvil = botón HUD tap tb.lunge.
  distance:118,              // px de impulso hacia adelante (gap-closer; > roll 92 para castigar el kite, aún ACOTADO ~1.3× el roll)
  dashMs:150,               // duración del dash (ms) — corto; velocidad = distance/(dashMs/1000) ≈ 787 px/s
  range:60,                 // alcance del golpe de estocada (px) — ~swing warrior (54); la elongación REAL la da el dash que arrastra el hitbox
  arcDeg:70,                // cono ESTRECHO (grados) — hitbox de ESTOCADA, no barrido amplio ("elongada estrecha")
  dmgMul:1.3,               // ×daño del golpe — REPOSICIÓN + castigo, NO burst (< dodge-counter 1.5, < charged 1.7); nunca one-shot
  staminaCost:16,           // coste de estamina propio (deny sin vigor; spendStam flashea) — el commit cuesta vigor
  recoverMs:520,            // ventana de recuperación (no spammeable / no gap-closer infinito) — h._lungeCd transitorio (mirror h._gbCd)
  requiresMelee:false,      // verbo UNIVERSAL anti-kite (toda clase cierra distancia); hitbox propia (_mcfg) ⇒ ranged también golpea al cerrar
};

// CAS-2163: SEGUNDO ALIENTO / SECOND_WIND (mec #41, umbrella CAS-2162). Verbo de SUPERVIVENCIA CLUTCH — el único
// que actúa sobre el RESULTADO `hp<=0` en sí, no sobre un golpe. Negado-letal automático de 1 uso por descanso +
// nova de espacio: cuando un golpe dejaría al héroe en hp<=0 y hay carga, NO muere (clampa hp a surviveHpFrac×maxHp),
// consume la carga, arma i-frames y estalla una nova de empuje radial que reposiciona a los enemigos cercanos. La
// carga SÓLO se rearma en HOGUERA (mirror del refill de Estus) ⇒ salvavidas por descanso, no spammeable. No-solape:
// RALLY=pool cura continua / FLASK=trago manual / BONFIRE=descanso / hyper-armor=absorbe interrupción, NO niega letal.
// enabled:false ⇒ todas las ramas gated ⇒ build byte-idéntico al HEAD previo (rama inerte). Reversible en 1 línea.
export const SECOND_WIND = {
  enabled:true,          // DARK — CEO gate flip false→true tras QA PASS×2. Reversible en 1 línea.
  surviveHpFrac:0.15,     // HP al que se te clampa al negar el golpe letal (frac de maxHp)
  novaRadius:120,         // px — radio de la nova de empuje que crea espacio
  novaKnockback:180,      // fuerza de empuje radial a enemigos en radio (reusa el empuje vx/vy existente, mirror parry/lunge)
  novaPoiseDmg:0,         // opcional: poise a enemigos empujados (0 = sólo reposición, sin stagger gratis)
  iframesMs:600,          // breve ventana de i-frames tras el disparo (evita muerte en el mismo tick por multi-hit)
  chargesPerRest:1,       // usos por descanso; se rearma en HOGUERA (mirror FLASK.charges gated BONFIRE)
};

// CAS-2208 (origen CAS-2185 Fase 1, deliverable #3): PIXELART master A/B kill-switch. Un único knob global,
// PURAMENTE de render, que fuerza el fallback PROCEDURAL en TODO el juego (héroe, enemigos, VFX y tiles) sin tocar
// una sola línea de simulación. Uso: comparación A/B sprite-vs-procedural, o kill-switch si un lote de sprites
// PixelLab saliera mal en LIVE. El pipeline YA carga sprites con fallback procedural POR-ASSET; esto sólo antepone
// un gate global a las tiers de sprite en render.js — cuando spritesEnabled===false cada seam SALTA su drawImage y
// cae a la rama procedural que YA existe (no borra nada). Determinista: la selección de frame no usa RNG.
// OJO SEMÁNTICA: los sprites YA están LIVE (hero 45 strips + ~18 enemigos), por eso el default DEBE ser `true` para
// 0 regresión — el build servido queda BYTE-IDÉNTICO al HEAD (el gate `spritesOn && …` con spritesOn=true toma la
// MISMA rama por short-circuit). El "DARK/reversible" se cumple porque el default preserva LIVE; poner `false` es el
// modo experimental. Flip config-only, reversible en 1 línea. NOTA: los mobs richAnim CAVES sin blob procedural SP
// (ashwraith/ironback/thornspitter) sólo tienen tier sprite ⇒ en modo procedural muestran placa/vida pero no cuerpo
// (limitación inherente: no existe fallback procedural para ellos; el juego sigue jugable).
export const PIXELART = {
  spritesEnabled: true,   // true = comportamiento LIVE actual (sprites PixelLab). false = fuerza fallback procedural en todo.
};

// CAS-2226 (EVO open-world, board CAS-2189 "mejorar el mundo abierto"): capa de POIs de ciudad para el minimapa +
// mapa del mundo (tecla M). El minimapa/mapa YA existen LIVE (renderMiniMap/renderBigMap: silueta del continente,
// rects de zona, frustum de cámara, blips de portal/enemigo, flecha del héroe). Lo NUEVO de esta tarea es una CAPA
// DE BLIPS EXTENSIBLE que dibuja los landmarks de la ciudad grande (depósito/templo/taberna/parque) como marcadores,
// derivada PURAMENTE del estado de mundo (world.deco props colocados por CAS-2191/2224 — NADA hardcodeado, 0 RNG).
// North-Star MMORPG: la misma capa acepta fuentes futuras (NPCs hoy, OTROS JUGADORES cuando llegue el netcode) con un
// solo push en mapBlips() (render.js), y al ser función determinista del estado es trivial hacerla server-authoritative.
// DARK/reversible: default `enabled:false` ⇒ minimapa/mapa renderizan BYTE-IDÉNTICO al pre-CAS-2226 (sólo portal/enemy/
// héroe). `true` = experimental/flip. Puramente de render: no toca sim/RNG/saves ⇒ srand ON==OFF, saves byte-idénticos.
// Flip config-only en 1 línea. Los gates de warp YA salen como blips violeta (world.portals) — no se re-dibujan aquí.
export const MINIMAP = {
  enabled: true,    // false = LIVE actual (sin blips de POI). true = dibuja los POIs de ciudad en minimapa + mapa (M).
  labels: true,     // etiquetas de texto de los POIs en el mapa grande (M). El minimapa pequeño sólo muestra el marcador.
};

// CAS-2230: CICLO DÍA/NOCHE + BRILLO DE FAROLAS (EVO mundo-abierto, code+render-only, $0 arte, MMORPG-shared).
// Reloj de mundo COMPARTIDO y determinista: la fase (0..1, 0=medianoche) deriva de un EPOCH global (`epochMs`) +
// el reloj UTC real (`Date.now`, idéntico en TODO cliente) mod `cycleSeconds` ⇒ todos los clientes coinciden en la
// hora POR CONSTRUCCIÓN — listo para el mundo autoritativo/netcode sin desync (NO usa `performance.now` por-cliente
// ni RNG; el origen UTC compartido es lo que sincroniza, no un contador local por-página). Puramente de RENDER:
// (a) tint ambiental interpolado amanecer→día→atardecer→noche (overlay a pantalla completa) y (b) halo cálido de
// las farolas YA colocadas (world.deco `prop_city_lamp`/`lantern`, 0 RNG — misma deriva pura que los blips del
// minimapa CAS-2226) sólo de noche/crepúsculo. NO toca colisión/spawns/sim/saves. DARK/reversible: `enabled:false`
// ⇒ el bloque entero queda SIN LLAMAR ⇒ BYTE-IDÉNTICO al build actual (srand ON==OFF, saves byte-idénticos). Flip
// config-only en 1 línea (Gate CEO tras QA OBSERVABLE), mismo patrón que MINIMAP/DOORS_INTERIORS.
export const DAYNIGHT = {
  enabled: true,         // CAS-2230 LIVE — Gate CTO flip tras QA PASS 15/15 (commit e7b3d7d). Reversible: true→false = DARK byte-idéntico.
  cycleSeconds: 1200,    // duración de un ciclo completo día→noche→día (20 min). Configurable.
  epochMs: 0,            // origen COMPARTIDO del reloj (UTC ms). Fijo ⇒ mismo instante ⇒ misma fase en todo cliente.
  phaseOverride: null,   // null = fase derivada del reloj; 0..1 fuerza una fase fija (screenshots / QA determinista).
  lampGlow: true,        // halo cálido radial de las farolas de noche/crepúsculo (deriva pura de world.deco, 0 RNG).
  lampColor: "#ffd27a",  // color cálido del halo (ámbar de farol).
  lampRadius: 120,       // radio del halo en px de mundo.
};

// CAS-2231: SISTEMA DE CLIMA (lluvia / niebla, render-only, DARK). North Star MMORPG: el clima es ESTADO DEL
// MUNDO COMPARTIDO, no un efecto de cliente aislado — igual que DÍA/NOCHE (CAS-2230), la fase deriva de un
// reloj COMPARTIDO/determinista (UTC real Date.now − epochMs, mod cycleSeconds) ⇒ por construcción todos los
// clientes del mismo shard ven el MISMO clima en el mismo instante (listo para netcode autoritativo vía
// phaseOverride, 0 desync). Overlay puramente render/derivado: 0 RNG, save/determinism-neutral, NO toca
// colisión/spawns/sim/movimiento/combate. Compone ENCIMA del tinte DAYNIGHT (noche+lluvia = más oscuro; el
// halo de farolas se dibuja DESPUÉS del clima ⇒ sigue perforando la niebla/lluvia). Partículas de lluvia
// CAPADAS (presupuesto fijo maxDrops, sin allocs por-frame en el hot loop). DARK/reversible: `enabled:false`
// ⇒ el bloque entero queda SIN LLAMAR ⇒ BYTE-IDÉNTICO al build actual. Flip config-only en 1 línea (Gate CEO
// tras QA OBSERVABLE), mismo patrón que MINIMAP/DOORS_INTERIORS/DAYNIGHT.
export const WEATHER = {
  enabled: true,         // LIVE (CAS-2233 Gate CEO APROBADO tras QA PASS 16/16). Reversible: true→false + redeploy overlay.
  cycleSeconds: 900,     // duración de un ciclo completo clear→rain→fog→clear (15 min). Configurable.
  epochMs: 0,            // origen COMPARTIDO del reloj (UTC ms). Fijo ⇒ mismo instante ⇒ mismo clima en todo cliente.
  phaseOverride: null,   // null = fase derivada del reloj; 0..1 fuerza una fase fija (screenshots / QA determinista).
  maxDrops: 140,         // presupuesto FIJO de gotas de lluvia (cap de perf; sin allocs por-frame, pool memoizado).
  rainTint: "#3a4a6a",   // tinte azulado-gris del velo de lluvia (screen overlay, oscurece leve).
  rainDarken: 0.18,      // alpha máx. del velo azulado-gris de lluvia (oscurecimiento leve).
  fogColor: "#c8ccd4",   // color del velo de niebla (gris claro).
  fogMax: 0.42,          // alpha máx. del velo radial de niebla (reduce visibilidad ambiental; centro más claro = combate legible).
};

// CAS-2234: BANNER DE ZONA / REGIÓN (EVO mundo-abierto tipo Tibia, render+code-only, $0 arte, DARK). North Star
// MMORPG: las zonas con nombre son la unidad de navegación/presencia (y a futuro spawns/PvP/instancing). Las
// regiones DERIVAN PURAMENTE de los MISMOS POIs de `world.deco` que ya usa el minimapa (CAS-2226: Templo/Depósito/
// Taberna/Parque) + una región contenedora "Ciudad" (bbox de esos POIs) ⇒ 0 RNG, derivación determinista ⇒ idéntico
// en TODO cliente por construcción (server-authoritative-ready sin desync). La "zona actual" = posición del héroe vs
// regiones estáticas; al cruzar a una zona con nombre distinto ⇒ fade-in de un título de texto (fuente/estilo de HUD
// YA existente, NO fuente/arte nuevo) top-third, hold ~2.5s, fade-out. Puramente COSMÉTICO/render: 0 escritura a
// sim/save/RNG, per-cliente ⇒ no afecta estado compartido (en mundo autoritativo a futuro el banner es local). DARK/
// reversible: `enabled:false` ⇒ el update+render del banner NUNCA se llama ⇒ BYTE-IDÉNTICO al build actual (srand
// ON==OFF, worldFingerprint sin drift). Flip config-only/overlay (Gate CEO tras QA OBSERVABLE), patrón WEATHER/DAYNIGHT.
export const ZONE_BANNER = {
  enabled: true,          // CAS-2236 LIVE — Gate CEO=GO tras QA OBSERVABLE PASS (build c04dfa6). Reversible: true→false + redeploy overlay.
  radius: 200,            // radio (px de mundo) alrededor del centro de cada POI que cuenta como "dentro" de esa zona.
  cityMargin: 300,        // margen (px) que expande el bbox de los POIs para la región contenedora "Ciudad".
  holdSeconds: 2.5,       // tiempo que el banner queda a plena opacidad antes del fade-out.
  fadeSeconds: 0.6,       // duración del fade-in y del fade-out (cada uno).
  anchorY: 0.17,          // fracción vertical del título (0.17 = top-third; NO tapa el centro de acción = combate legible).
  cityLabel: "Ciudad",    // etiqueta de la región contenedora de la ciudad.
  citySubtitle: "Zona segura",  // sub-título opcional de la ciudad (estilo Tibia).
};

// CAS-2242: ZONA SEGURA / SANTUARIO DE CIUDAD (sim+render, $0 arte, DARK). North Star MMORPG: la ciudad es el
// HUB social/de descanso del mundo compartido; esto es una PvE-sanctuary determinista y server-authority-ready.
// La AUTORIDAD vive en sim (tickSafeZone): dentro del bbox de la región "Ciudad" — derivado de los MISMOS POIs de
// world.deco que usan minimapa (CAS-2226) y banner de zona (CAS-2234), NO geometría nueva — el héroe REGENERA HP
// pasivamente (tick determinista, 0 RNG, derivado de dt+posición ⇒ idéntico en todo cliente por construcción,
// listo para netcode autoritativo). El regen se PAUSA brevemente tras recibir daño (feel, mismo patrón que
// STAMINA.regenDelay) y se ACELERA cerca del Templo (santuario de curación). El render añade una afordancia visual
// SUTIL ("Zona segura", $0 arte, procedural) — cosmética, no toca sim/save. HARD-GATED: enabled:false ⇒ tickSafeZone
// sale sin tocar HP/estado, no se crea campo transitorio nuevo, y el badge no se dibuja ⇒ dmg/knock/save/srand/DOM
// byte-idénticos a HEAD (srand ON==OFF: 0 draws — es aritmética pura comparar-bbox + sumar-HP). Los NÚMEROS
// (radios/tasas) son decisión de FEEL/BALANCE del CEO (retune = edición de knob barata y reversible).
// noAggro: sub-flag reservado (mobs no persiguen dentro de la ciudad) — NO se prende en Batch 1 (roza netcode/IA);
// sólo el regen va LIVE primero. epochMs reservado (config compartible como DAYNIGHT/WEATHER, MMORPG-safe).
export const SAFEZONE = {
  enabled: true,           // LIVE (CAS-2243, CEO Gate APPROVED). Reversible: true→false + redeploy (overlay consistente-HEAD config+sim+render).
  regenPct: 0.045,         // fracción de HP máx regenerada por segundo dentro de la ciudad (~22s de 1→100% ocioso).
  regenDelay: 2.0,         // pausa de regen (s) tras recibir daño — no te curas mientras te pegan (feel Tibia/Souls).
  templeMul: 2.5,          // multiplicador de la tasa de regen dentro del radio del Templo (santuario de curación).
  templeRadius: 220,       // radio (px de mundo) alrededor del POI Templo para el regen acelerado.
  cityMargin: 300,         // margen (px) que expande el bbox de los POIs = extensión de la zona segura (mirror ZONE_BANNER).
  noAggro: true,           // CAS-2250 flip LIVE, CEO Gate APPROVED tras QA CAS-2252 PASS 12/12. Reversible: true→false + redeploy. Mobs no adquieren/persiguen dentro del margen de ciudad; leash en el borde.
  epochMs: 0,              // reservado — reloj compartible determinista (patrón DAYNIGHT/WEATHER), MMORPG-safe.
};

// CAS-2245: HOME-TEMPLE RESPAWN (Tibia) — al morir, el héroe reaparece en SU Templo de la Ciudad, dentro de la
// Zona Segura (SAFEZONE, CAS-2242). El punto se DERIVA DETERMINÍSTICAMENTE del MISMO POI `prop_city_temple` de
// world.deco que ya usan MINIMAP/ZONE_BANNER/SAFEZONE (0 RNG, server-authoritative-ready: el server calcula el
// mismo punto para todos). Aterriza dentro del templeRadius de SAFEZONE ⇒ engancha con el regen ×2.5 del santuario
// ⇒ el bucle "muere → vuelve a casa → recupera HP" queda cohesivo. HARD-GATED: enabled:false ⇒ respawn() usa el
// checkpoint normal (h.respawn) EXACTAMENTE como HEAD ⇒ save + worldFingerprint byte-idénticos (feature inerte,
// 0 campos transitorios nuevos). Reversible: enabled:true→false + redeploy overlay CONSISTENTE-HEAD (config+sim).
export const TEMPLE_RESPAWN = {
  enabled: true,           // LIVE (CAS-2247 flip). Reversible: true→false + redeploy (overlay consistente-HEAD config+sim).
  offsetY: 48,             // px al SUR del POI Templo donde aterriza el héroe (entrada del templo; dentro de templeRadius y del bbox seguro).
};

// CAS-2255: RESTED XP / BONO DE DESCANSO DEL SANTUARIO (DARK) — el capstone hub-reward que corona el arco Santuario
// (SAFEZONE regen + TEMPLE_RESPAWN + noAggro). Responde "¿qué GANA el jugador por descansar en la ciudad?": el tiempo
// dentro de SAFEZONE ACUMULA un pool de Descanso (accrualPerSec×dt, tope poolCap) que, al salir a cazar, se GASTA
// otorgando XP bonus (×xpMult, drenado proporcional a la XP ganada FUERA del santuario) hasta agotarse. Canon MMORPG
// (WoW rested XP). Per-jugador, DETERMINISTA, 0 RNG, server-authority-ready (acumulación=inSafeZone+tick de sim, gasto=
// único chokepoint gainXP; NADA de wall-clock local — usa dt de sim). Escala a N jugadores en la misma SAFEZONE sin
// contención (estado 100% per-hero: h.restedPool). HARD-GATED: enabled:false ⇒ tickRestedXP/gainXP-bonus RETURN inmediato,
// h.restedPool NUNCA se crea, y serializeSave OMITE la clave restedPool ⇒ save.v1 + comportamiento BYTE-IDÉNTICOS a HEAD
// (respeta el allowlist anti-CAS-2220: la clave sólo existe en el save cuando enabled). Reversible: enabled:true→false +
// redeploy overlay CONSISTENTE-HEAD (config+sim, +render por el badge "Descanso" gated).
export const RESTED_XP = {
  enabled: true,           // LIVE (CAS-2256 flip; CEO Gate PASS + QA CAS-2255 OBSERVABLE 19/19). Reversible: true→false + redeploy.
  accrualPerSec: 6,        // unidades de XP de Descanso acumuladas por segundo DENTRO de la SAFEZONE (~100s ocioso para llenar el pool).
  poolCap: 600,            // tope del pool de Descanso (unidades de XP bonus disponibles; ~1 nivel de bonus a niveles bajos).
  xpMult: 1.5,             // multiplicador de XP mientras hay pool (WoW-like ×1.5): el bonus por ganancia = base×(xpMult-1), acotado por el pool.
  epochMs: 0,              // reservado — reloj compartible determinista (patrón DAYNIGHT/WEATHER/SAFEZONE), MMORPG-safe.
};

// CAS-2266: PIEDRA DE VÍNCULO / RECALL AL SANTUARIO (DARK, RECALL) — el loop de VIAJE-AL-HUB que corona el arco Santuario
// (SAFEZONE regen + noAggro + TEMPLE_RESPAWN + Rested/Descanso, TODOS LIVE). Canon MMORPG: WoW Hearthstone / Tibia temple
// recall. Trae al jugador de vuelta al hub social COMPARTIDO (el Santuario) donde los jugadores convergen — NO es un teleport
// single-player suelto, es viaje-al-hub para un mundo persistente. Dos piezas, ambas per-hero y server-authority-ready:
//   · BIND (vínculo): estar DENTRO de una SAFEZONE fija el punto de vínculo del héroe (h.bindPoint) al Santuario actual —
//     DETERMINISTA = mismo POI Templo que alimenta MINIMAP/ZONE_BANNER/SAFEZONE/TEMPLE_RESPAWN (0 RNG, el server calcula el
//     mismo punto para todos). Modelo Tibia (vincularse = visitar el templo). Sin SAFEZONE alcanzable ⇒ no hay vínculo.
//   · RECALL: habilidad con cooldown DETERMINISTA (tick de sim, dt — patrón DAYNIGHT/WEATHER/SAFEZONE, 0 wall-clock local,
//     0 RNG) que devuelve al héroe a h.bindPoint. Decisión Stage-1: INSTANTÁNEO (channelSec:0) — el andamiaje de canal
//     cancelable-por-daño queda cableado pero DORMIDO (channelSec>0 lo activa; reservado para PvP/netcode). Cooldown persiste
//     en el save (anti-cheese: recargar no lo salta). Trigger de jugador: tecla dedicada RECALL.key (gated).
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickRecall/tryRecall/bind RETURN inmediato, h.bindPoint/h.recallCD/h.recallChannelT
// NUNCA se crean, serializeSave OMITE las claves ⇒ save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD (la tecla
// Home es inerte, el badge nunca se dibuja). Reversible: enabled:true→false + redeploy overlay CONSISTENTE-HEAD (config+sim+
// game[+dev hook]+render[+badge]+input[+tecla gated]). Escala a N jugadores sin contención (estado 100% per-hero).
export const RECALL = {
  enabled: true,           // LIVE (CAS-2267 flip; CEO Gate APPROVED on CAS-2266 + QA OBSERVABLE PASS 22/22). Reversible: true→false + redeploy overlay consistente-HEAD (config+sim+game+render+input).
  key: "Home",             // tecla dedicada del Recall ("volver a casa"); no rebindable (mirror SUMMON/parry). Gated ⇒ OFF inerte.
  cooldownSec: 480,        // cooldown determinista del Recall (8 min, canon Hearthstone). Tick de sim (dt), 0 RNG.
  channelSec: 0,           // 0 = INSTANTÁNEO (decisión Stage-1). >0 = canalizado cancelable por daño (reservado PvP/netcode).
  cancelOnDamage: true,    // si channelSec>0, recibir daño cancela el canal (Tibia/WoW). INERTE cuando channelSec=0.
  epochMs: 0,              // reservado — reloj compartible determinista (patrón DAYNIGHT/WEATHER/SAFEZONE), MMORPG-safe.
};

// CAS-2269: TABLÓN DE RECOMPENSAS DEL SANTUARIO (BOUNTY BOARD, DARK, BOUNTY_BOARD) — el loop de CONTENIDO DIRIGIDO que da
// PROPÓSITO a la caza y otra RAZÓN para volver al hub (arco Santuario: SAFEZONE regen + noAggro + TEMPLE_RESPAWN + Rested +
// RECALL, TODOS LIVE). Canon MMORPG: el tablón de recompensas / daily bounties (WoW/GW2/Tibia hunting tasks). Un contrato
// simple y legible: "mata N de X" ⇒ recompensa (oro + XP). Diseño Stage-1, per-hero, 100% DETERMINISTA y server-authority-ready:
//   · PROGRESO DERIVADO (0 tracking nuevo por-frame, 0 hook en killEnemy): el avance = contador MONÓTONO ya existente y ya
//     persistido (h.kills para "any", h.killsByType[target] para un tipo) MENOS un snapshot `base` tomado al ACEPTAR. Es
//     aritmética pura de lectura ⇒ idéntico en todo cliente por construcción, listo para netcode autoritativo.
//   · ROTACIÓN DETERMINISTA (0 RNG): el tablón muestra un contrato "destacado" = bounties[bountyIdx % N]; reclamar avanza
//     bountyIdx (variedad a lo largo del tiempo sin azar). Sin reloj local ⇒ MMORPG-safe.
//   · HUB LOOP: aceptar/reclamar sólo DENTRO de la SAFEZONE (requireSafeZone, mirror del BIND del Recall) ⇒ vas al Santuario,
//     tomas el contrato, cazas fuera, vuelves a cobrar. Refuerza el hub social compartido. Un único chokepoint de jugador
//     (tryBounty): tecla dedicada BOUNTY_BOARD.key — acepta el destacado / reclama si está completo / no-op si en progreso.
//     La recompensa pasa por los chokepoints REALES ya vivos (h.gold += ; gainXP()) ⇒ compone con Rested/meta sin código nuevo.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tryBounty RETURN inmediato, h.bounty/h.bountyIdx NUNCA se crean, serializeSave
// OMITE las claves ⇒ save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD (la tecla es inerte, el badge nunca se
// dibuja). Reversible: enabled:true→false + redeploy overlay CONSISTENTE-HEAD (config+sim+game[+dev hook]+render[+badge]+input
// [+tecla gated]). Escala a N jugadores sin contención (estado 100% per-hero). Los NÚMEROS (count/oro/xp) = decisión de
// BALANCE del CEO (retune = edición de knob barata y reversible). target debe ser una clave de ETPL o "any".
export const BOUNTY_BOARD = {
  enabled: true,           // LIVE (CAS-2270 flip). Reversible: true→false + redeploy overlay consistente-HEAD (config+sim+game+render+input).
  key: "End",              // CAS-2273 FIX: tecla dedicada del Tablón; acepta/reclama en el Santuario. Gated ⇒ OFF inerte.
                           //   Antes "KeyB" pero customize/wardrobe (REBINDS settings.js) YA defaultea a KeyB desde CAS-1659 ⇒
                           //   playAction("KeyB")→"customize" ganaba en input.js edge() y la línea del bounty era código muerto
                           //   (feature 100% inalcanzable por el jugador real, sólo vía __dev). 26 letras ocupadas ⇒ "End" es un
                           //   code LIBRE (grep-verificado: no en REBINDS ni en Home/Comma/Period/Backslash/Backquote dedicados),
                           //   sibling natural del RECALL.key="Home". Móvil = botón HUD tb.bounty (contextual, sólo en la SAFEZONE).
  requireSafeZone: true,   // aceptar/reclamar sólo DENTRO de la SAFEZONE (hub loop, mirror del BIND del Recall). false = desde cualquier lugar.
  bounties: [              // pool ORDENADO de contratos; el destacado rota por bountyIdx. target = clave ETPL o "any".
    { id:"cull",    name:"Limpieza del Sendero", target:"any",      count:10, gold:70,  xp:140 },
    { id:"wolves",  name:"Acecho de Lobos",       target:"wolf",     count:6,  gold:80,  xp:170 },
    { id:"rats",    name:"Plaga de Ratas",        target:"rat",      count:8,  gold:60,  xp:120 },
    { id:"bones",   name:"Reposo de Huesos",      target:"skeleton", count:6,  gold:100, xp:210 },
    { id:"raiders", name:"Bandidos del Camino",   target:"bandit",   count:5,  gold:120, xp:240 },
    { id:"greenrage", name:"Furia Verde",         target:"orc",      count:4,  gold:150, xp:300 },
  ],
  epochMs: 0,              // reservado — reloj compartible determinista (patrón DAYNIGHT/WEATHER/SAFEZONE), MMORPG-safe.
};

// CAS-2272: RENOMBRE DEL SANTUARIO / SANCTUARY REPUTATION (DARK, SANCTUARY_REP) — la meta-progresión de LARGO PLAZO que corona
// el loop del Tablón de Recompensas (BOUNTY_BOARD, LIVE). Canon MMORPG: faction reputation / faction standing (WoW/Tibia). Al
// completar bounties, el héroe acumula RENOMBRE persistente con la facción del Santuario ⇒ rangos visibles (Neutral → Reconocido
// → Honrado → Venerado → Exaltado). Diseño Stage-1, per-hero, 100% DETERMINISTA y server-authority-ready:
//   · ACUMULACIÓN DETERMINISTA (0 RNG, 0 moneda nueva): +repPerBounty por bounty COMPLETADO, enganchado en el MISMO evento ya
//     validado (bounty-complete que ya llama h.gold += / gainXP en tryBounty). No hay tracking nuevo por-frame ni hook en killEnemy.
//   · RANGOS = FUNCIÓN PURA del total acumulado: el rango es el más alto cuyo umbral `at` ≤ rep (sanctuaryRank). Idéntico en todo
//     cliente por construcción ⇒ listo para netcode autoritativo. Sin reloj local ⇒ MMORPG-safe.
//   · UN perk gateado (acoplamiento bajo): xpMult por rango = pequeño multiplicador de la XP de bounty, aplicado ÚNICAMENTE
//     dentro del chokepoint gainXP de bounty ya existente (sanctuaryPerkXP en tryBounty, NO en el gainXP global). Neutral = 1.00
//     ⇒ sin efecto hasta subir de rango.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tryBounty no acumula, sanctuaryPerkXP devuelve la XP sin tocar, serializeSave OMITE
// la clave, h.sanctuaryRep NUNCA se crea, el indicador de rango NUNCA se dibuja ⇒ save.v1 + comportamiento + worldFingerprint +
// ruta gainXP BYTE-IDÉNTICOS a HEAD (abs-diff limpio). Reversible: enabled:true→false + redeploy overlay CONSISTENTE-HEAD
// (config+sim+game[+dev hook]+render[+indicador]). Escala a N jugadores sin contención (estado 100% per-hero). Los NÚMEROS
// (repPerBounty / umbrales / xpMult) = decisión de BALANCE del CEO (retune = edición de knob barata y reversible).
export const SANCTUARY_REP = {
  enabled: true,           // LIVE (CAS-2274, CEO Gate PASS). Reversible: true→false + redeploy overlay consistente-HEAD (config+sim+game+render).
  repPerBounty: 25,        // Renombre ganado por bounty COMPLETADO (flat, determinista, 0 RNG). CEO balance knob.
  ranks: [                 // umbrales ACUMULADOS de rep → rango + perk (xpMult de bounty). Función pura del total; `at` ascendente.
    { id:"neutral",    name:"Neutral",    at:0,    xpMult:1.00 },   // sin perk (byte-id de la ruta gainXP hasta subir de rango)
    { id:"recognized", name:"Reconocido", at:150,  xpMult:1.03 },   // ~6 bounties
    { id:"honored",    name:"Honrado",    at:450,  xpMult:1.06 },   // ~18 bounties
    { id:"revered",    name:"Venerado",   at:1000, xpMult:1.10 },   // ~40 bounties
    { id:"exalted",    name:"Exaltado",   at:2000, xpMult:1.15 },   // ~80 bounties (meta de largo plazo)
  ],
};

// CAS-2278: INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER (DARK, SANCTUARY_REWARDS) — cierra el loop de FACCIÓN abierto por
// SANCTUARY_REP (LIVE). Canon MMORPG: el reward vendor de facción (WoW quartermaster / Tibia faction rep). Hoy la reputación del
// Santuario sólo da un perk pasivo de XP-bounty; le falta la otra mitad de todo sistema de facción: un PAYOFF concreto y RECLAMABLE
// por rango, más un TÍTULO DE RENOMBRE visible socialmente (nameplate) para la capa social del mundo compartido (Stage-2). Diseño
// Stage-1, per-hero, 100% DETERMINISTA (0 RNG, 0 moneda/key/inventario nuevo) y server-authority-ready:
//   · HITO POR RANGO: al alcanzar cada rango de SANCTUARY_REP (Reconocido→Honrado→Venerado→Exaltado) se DESBLOQUEA UN reward
//     reclamable en el Intendente (dentro de la SAFEZONE, mismo gating de zona que el Tablón). Se reclama UNA vez (idempotente).
//   · CADA reward REUTILIZA un knob YA vivo (0 sistema nuevo): reducción de cooldown de RECALL, +cap de RESTED_XP, +regen de
//     SAFEZONE, +bono de XP de Descanso. El efecto es un MULTIPLICADOR gateado aplicado en el chokepoint del knob (sanctuaryRewardMul);
//     con la feature OFF (o 0 rewards reclamados) devuelve 0 ⇒ el knob queda BYTE-IDÉNTICO a HEAD (anti-CAS-2220).
//   · TÍTULO DE RENOMBRE = el `title` del reward RECLAMADO de mayor rango, dibujado sobre el nameplate del héroe (texto puro, $0 arte).
//   · RECLAMADO PERSISTENTE: h.sanctuaryRewards = array de ids reclamados, persistido por el MISMO mecanismo que sanctuaryRep
//     (serializeSave gated). enabled:false ⇒ el campo NUNCA se crea ⇒ save.v1 + worldFingerprint + ruta de knobs byte-idénticos.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tryQuartermaster devuelve "off" (tecla Supr inerte río arriba en input.js), el
// Intendente nunca dibuja, h.sanctuaryRewards nunca existe, sanctuaryRewardMul devuelve 0. Reversible en 1 línea (enabled:true→false
// + redeploy overlay CONSISTENTE-HEAD: config+sim+render+input). Tecla dedicada "Delete" (Supr) = code LIBRE verificado (grep de
// playAction/REBINDS/config: 26 letras + End/Home/Backslash/Semicolon/Quote/Backquote ocupadas; Supr libre — LECCIÓN CAS-2273).
// Los NÚMEROS (rank→reward, kind, value) = decisión de BALANCE del CEO (retune = edición de knob barata y reversible).
export const SANCTUARY_REWARDS = {
  enabled: true,           // LIVE (CAS-2279 flip; QA 23/23 PASS build c4a549ae2fa1, CEO Gate). Reversible: true→false + redeploy overlay consistente-HEAD.
  key: "Delete",           // tecla dedicada (Supr) — code LIBRE (mirror RECALL.key="Home" / BOUNTY_BOARD.key="End"); NO rebindable (nunca toca REBINDS/settings.binds).
  requireSafeZone: true,   // el Intendente vive en el Santuario (mismo gating de hub que el Tablón)
  // Un reward por rango NO-neutral de SANCTUARY_REP. `rank` = id del rango de SANCTUARY_REP que lo desbloquea; `kind`+`value` =
  // el knob reutilizado y su fracción de bono (sanctuaryRewardMul suma los `value` de los rewards reclamados de ese kind).
  //   recallCd   → RECALL.cooldownSec  × (1 - Σvalue)   (retorno más rápido a casa)
  //   restedCap  → RESTED_XP.poolCap   × (1 + Σvalue)   (mayor reserva de Descanso)
  //   safeRegen  → regen de SAFEZONE   × (1 + Σvalue)   (santuario más restaurador)
  //   restedMult → bono XP de Descanso + Σvalue          (el Descanso rinde más al cazar)
  rewards: [
    { rank:"recognized", id:"swift_return", kind:"recallCd",   value:0.20, name:"Retorno Veloz",       title:"Reconocido del Santuario", desc:"Piedra de Vínculo: -20% de enfriamiento" },
    { rank:"honored",    id:"deep_reserves",kind:"restedCap",  value:0.50, name:"Reservas del Peregrino",title:"Honrado del Santuario",    desc:"Descanso: +50% de reserva máxima" },
    { rank:"revered",    id:"temple_grace", kind:"safeRegen",  value:0.40, name:"Gracia del Templo",    title:"Venerado del Santuario",   desc:"Zona Segura: +40% de regeneración" },
    { rank:"exalted",    id:"pilgrims_zeal",kind:"restedMult", value:0.15, name:"Fervor del Peregrino",  title:"Exaltado del Santuario",   desc:"Descanso: +0.15 al multiplicador de XP" },
  ],
};

// CAS-2284: TOQUE DE GUERRA DEL SANTUARIO / SANCTUARY WARHORN (DARK, WORLD_EVENT) — el primer EVENTO MUNDIAL PROGRAMADO del
// arco Santuario. Canon MMORPG: world boss timer / GW2 meta-event / Tibia server-save event. Su valor central NO es
// single-player: es la CONVERGENCIA SOCIAL SINCRONIZADA — todos los jugadores del shard ven el MISMO horario y la MISMA
// ventana activa porque se DERIVAN de forma determinista del reloj de pared (bucket de minutos del epoch), así que la gente
// coincide en el mundo compartido al mismo tiempo. Diseño Stage-1, server-authority-ready y 100% DETERMINISTA (0 RNG):
//   · HORARIO COMPARTIDO (función pura del wall-clock): windowIdx = floor((now-epochMs)/periodMs); la ventana está ACTIVA
//     mientras (now-epochMs) mod periodMs < windowMs. Idéntico en todo cliente con el reloj correcto ⇒ convergencia. En
//     Stage-2 el server provee el reloj autoritativo (mismo cálculo). El wall-clock (Date.now) SÓLO se lee dentro del tick
//     GATEADO (tickWorldEvent) ⇒ con la feature OFF es CÓDIGO MUERTO, nunca entra en el sim determinista (save/worldFingerprint/
//     RNG byte-idénticos a HEAD — respeta la regla de game.js:120 y el anti-CAS-2220).
//   · OBJETIVO DE REUNIÓN marcado cerca del borde de la SAFEZONE/Santuario: posición DERIVADA (hash puro de windowIdx, 0 RNG,
//     0 assets — blip en minimapa + estilo badge) ⇒ el punto de encuentro cambia cada evento pero es el mismo para todos.
//   · RECOMPENSA ESCALANTE por PARTICIPACIÓN PASIVA (SIN moneda nueva, SIN key nueva — evita la clase de bug de colisión de
//     keybind CAS-2273): durante la ventana activa, matar/combatir en el MUNDO ABIERTO (fuera de la SAFEZONE) otorga
//     +repPerKill de RENOMBRE (SANCTUARY_REP, reusa ese knob) + un multiplicador temporal de XP estilo RESTED_XP aplicado por
//     el chokepoint gainXP YA existente. "Escalante" = 2 fases deterministas dentro de la ventana (Llamada → Fervor, pico en
//     la 2ª mitad): la fase PICO sube el mult de XP y el rep por kill. Acotado y determinista (decisión de BALANCE del CEO).
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickWorldEvent RETURN inmediato (Date.now nunca se llama), G.warhorn NUNCA se
// crea, warhornOnKill RETURN inmediato, el badge/blip nunca se dibuja, serializeSave NO toca ninguna clave nueva (estado 100%
// DERIVADO/transitorio, cero persistencia nueva) ⇒ save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD.
// Reversible en 1 línea (enabled:true→false + redeploy overlay CONSISTENTE-HEAD: config+sim+render). Escala a N jugadores sin
// contención (el horario es una función pura compartida; el reward es per-hero por el chokepoint gainXP/rep ya vivo).
export const WORLD_EVENT = {
  enabled: true,           // CAS-2289 LIVE. Reversible: true→false + redeploy overlay consistente-HEAD (config+sim+render).
  periodSec: 900,          // cada 15 min suena el Toque (bucket determinista del epoch). CEO balance knob.
  windowSec: 180,          // duración de la ventana activa (3 min de convergencia/recompensa). CEO balance knob.
  xpMult: 1.25,            // multiplicador de XP durante la fase LLAMADA (1ª mitad), vía gainXP (estilo RESTED). Acotado.
  peakXpMult: 1.5,         // multiplicador de XP durante la fase PICO / Fervor (2ª mitad de la ventana) — "escalante".
  repPerKill: 8,           // RENOMBRE (SANCTUARY_REP) por kill de mundo abierto en fase LLAMADA (gated a SANCTUARY_REP.enabled).
  peakRepPerKill: 14,      // RENOMBRE por kill en fase PICO / Fervor. Acotado, determinista.
  rallyOffset: 260,        // px MÁS ALLÁ del borde de la SAFEZONE donde aparece el objetivo de reunión (seeded por windowIdx).
  epochMs: 0,              // ancla del epoch compartido (0 = epoch Unix). Bucket = floor((Date.now()-epochMs)/periodMs).
};

// CAS-2292: EMISARIO DEL SANTUARIO / SANCTUARY EMISSARY (DARK, SANCTUARY_EMISSARY) — la ROTACIÓN de WORLD-QUEST del arco Santuario.
// Canon MMORPG: el "emisario" diario (WoW Legion/BfA emissary) — una world-quest ROTATIVA que envía al jugador AL MUNDO ABIERTO a
// abatir un objetivo y se ENTREGA en el hub por un gran pago de RENOMBRE. Cierra un hueco del arco: hoy el Tablón (BOUNTY_BOARD,
// LIVE) rota POR-HÉROE (bountyIdx avanza al reclamar) y paga ORO; NO existe un objetivo COMPARTIDO que lleve a TODOS los jugadores
// al MISMO blanco a la vez (el gancho social "todos hacemos la misma world-quest hoy"). El Emisario lo aporta. Diseño Stage-1,
// per-hero, 100% DETERMINISTA (0 RNG) y server-authority-ready:
//   · ROTACIÓN COMPARTIDA (función PURA del reloj de pared, mirror WORLD_EVENT): el emisario ACTIVO = emissaries[period % N] con
//     period = floor((now-epochMs)/periodSec). Idéntico en todo cliente con el reloj correcto ⇒ convergencia (a diferencia del
//     bountyIdx per-hero). Date.now se lee SÓLO dentro del tick GATEADO (tickEmissary) ⇒ con la feature OFF es CÓDIGO MUERTO, nunca
//     entra en el sim determinista (save/worldFingerprint/RNG byte-idénticos a HEAD — respeta game.js:120 y el anti-CAS-2220).
//   · OBJETIVO DE MUNDO ABIERTO (world-quest): "abate N de X" contado por el MISMO contador MONÓTONO ya persistido
//     (h.killsByType[target], poblado en killEnemy) MENOS un snapshot `base` tomado al ACEPTAR. 0 tracking nuevo por-frame, 0 hook
//     en killEnemy (misma técnica que BOUNTY_BOARD). Se ACEPTA/ENTREGA en el Santuario (tecla dedicada, mismo gating de hub que el
//     Tablón / el Intendente): vas al Santuario, tomas al emisario del turno, cazas fuera, vuelves a entregar.
//   · PAGO EN RENOMBRE: al ENTREGAR ⇒ +rep de RENOMBRE (SANCTUARY_REP, reusa ese knob, gated a su enabled) + un `gold` cache, por
//     los chokepoints REALES ya vivos (h.gold += ; h.sanctuaryRep +=). Alimenta la meta-progresión de facción (rangos → Intendente)
//     con un chunk MAYOR que un bounty ⇒ el emisario es la fuente "premium/diaria" del renombre. UNA entrega por period (cadencia
//     daily-quest): al rolar el period, el objetivo cambia (compartido) y se puede volver a aceptar/entregar.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tryEmissary RETURN "off" (tecla Insert inerte río arriba en input.js), tickEmissary
// RETURN inmediato (Date.now NUNCA se llama), G.emissary/h.emissary NUNCA se crean, serializeSave OMITE la clave, el badge nunca se
// dibuja ⇒ save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD. Reversible en 1 línea (enabled:true→false + redeploy
// overlay CONSISTENTE-HEAD: config+sim+game+render+input). Escala a N jugadores sin contención (la rotación es una función pura
// compartida; el progreso/pago es per-hero por los contadores/chokepoints ya vivos). Los NÚMEROS (period/count/oro/rep) = decisión
// de BALANCE del CEO (retune = edición de knob barata y reversible). target debe ser una clave de ETPL o "any".
export const SANCTUARY_EMISSARY = {
  enabled: true,           // LIVE (CAS-2293 flip; CEO gate CAS-2292 8/8). Reversible: true→false + redeploy overlay consistente-HEAD (config+sim+game+render+input).
  key: "Insert",           // tecla dedicada — ACEPTA / ENTREGA en el Santuario. code LIBRE (grep-verificado: 26 letras + Home/End/
                           //   Delete/Backslash/Semicolon/Quote/Backquote ocupadas; Insert libre — sibling nav de Home/End/Delete).
                           //   NO rebindable (nunca toca REBINDS/settings.binds). Móvil = botón HUD tb.emissary (contextual, hub).
  requireSafeZone: true,   // aceptar/entregar sólo DENTRO de la SAFEZONE (mismo gating de hub que el Tablón / Intendente).
  periodSec: 1200,         // cada 20 min rota el emisario (bucket determinista del epoch; mayor que el evento para cadencia "diaria"). CEO knob.
  epochMs: 0,              // ancla del epoch compartido (0 = epoch Unix). period = floor((Date.now()-epochMs)/(periodSec*1000)).
  emissaries: [            // pool ORDENADO de world-quests; el ACTIVO rota por period (COMPARTIDO). target = clave ETPL o "any".
    { id:"wolfcull",    name:"Emisario: Manada Menguante",     target:"wolf",     count:8,  gold:90,  rep:60 },
    { id:"boneward",    name:"Emisario: Vigilia de Huesos",    target:"skeleton", count:8,  gold:110, rep:70 },
    { id:"roadwardens", name:"Emisario: Guardianes del Camino", target:"bandit",   count:6,  gold:130, rep:80 },
    { id:"greentide",   name:"Emisario: Marea Verde",          target:"orc",      count:5,  gold:160, rep:90 },
    { id:"pathpurge",   name:"Emisario: Purga del Sendero",     target:"any",      count:14, gold:100, rep:65 },
  ],
};

// CAS-2295: JURAMENTO DEL SANTUARIO / SANCTUARY OATH (DARK, SANCTUARY_OATH) — identidad LIGERA de ORDEN/gremio para la capa social
// del mundo compartido (North Star MMORPG). Canon MMORPG: faction/guild identity (WoW Covenants / GW2 orders / Tibia guilds) SIN
// netcode pesado. El arco Santuario ya da reputación (SANCTUARY_REP), un vendor (SANCTUARY_REWARDS) y world-quests (SANCTUARY_EMISSARY),
// pero NO permite ELEGIR y MOSTRAR una afiliación — el gancho social "pertenezco a una orden y otros jugadores me reconocen". El
// Juramento lo aporta. Diseño Stage-1, per-hero, 100% DETERMINISTA (0 RNG) y server-authority-ready:
//   · 3 ÓRDENES deterministas, cada una con UN pasivo FIJO y ACOTADO que REUTILIZA un knob YA vivo (0 moneda/recurso nuevo): el bono
//     es un MULTIPLICADOR gateado aplicado en el MISMO chokepoint del knob que el Intendente (oathMul, sumado junto a
//     sanctuaryRewardMul). Con la feature OFF (o sin juramento) devuelve 0 ⇒ el knob queda BYTE-IDÉNTICO a HEAD (anti-CAS-2220).
//   · ELECCIÓN desde la UI YA existente del Santuario (el TABLÓN / daily board, escena `bounty`) — CERO hotkey nuevo (anti-CAS-2273):
//     una fila de chips tappables (desktop click + móvil tap por el MISMO ui.bountyRects, SIN tocar input.js). tryPledgeOath es el
//     único chokepoint (mismo patrón que tryQuartermaster/tryBounty).
//   · GATE por rango mínimo de SANCTUARY_REP (reutiliza el arco de reputación): sólo puedes jurar al alcanzar `minRank`.
//   · CAMBIO de orden con COOLDOWN DETERMINISTA medido en el contador MONÓTONO de kills ya persistido (h.kills): switchCooldownKills
//     kills entre cambios. El PRIMER juramento es libre; re-jurar la misma orden = no-op. Reversible (cambiar de orden o feature OFF).
//   · TAG de orden sobre el NAMEPLATE reutilizando la ruta de render de TITLES/renombre (texto puro, $0 arte) ⇒ en Stage-2 otros
//     jugadores ven la afiliación en el mundo compartido (misma ruta que el título de renombre del Intendente).
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tryPledgeOath return "off", oathMul return 0 (knobs base exactos), h.sanctuaryOath/
// h.sanctuaryOathAt NUNCA se crean, serializeSave OMITE las claves, el tag del nameplate y la fila de órdenes NUNCA se dibujan ⇒
// save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD. Reversible en 1 línea (enabled:true→false + redeploy overlay
// CONSISTENTE-HEAD: config+sim+render+game — SIN input.js). Escala a N jugadores sin contención (estado 100% per-hero, elección
// determinista). Los NÚMEROS (minRank / cooldown / values) = decisión de BALANCE del CEO (retune = edición de knob barata y reversible).
export const SANCTUARY_OATH = {
  enabled: true,           // CAS-2296 LIVE FLIP. Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+render+game — SIN input.js).
  minRank: "recognized",   // rango mínimo de SANCTUARY_REP para poder jurar (reutiliza el arco de reputación). "neutral" = sin gate.
  switchCooldownKills: 20, // kills (contador monótono h.kills) requeridos entre CAMBIOS de orden. 1er juramento libre; re-jurar = no-op.
  // 3 Órdenes deterministas. `kind`+`value` = el knob reutilizado y su fracción de bono (oathMul suma el value de la orden jurada de
  // ese kind, junto a sanctuaryRewardMul). tag = etiqueta corta sobre el nameplate (capa social). $0 arte (texto puro).
  //   safeRegen  → regen de SAFEZONE   × (1 + value)   (santuario más restaurador)
  //   restedCap  → RESTED_XP.poolCap   × (1 + value)   (mayor reserva de Descanso)
  //   recallCd   → RECALL.cooldownSec  × (1 - value)   (retorno más rápido a casa)
  orders: [
    { id:"dawn",   name:"Orden del Alba",    tag:"Alba",    kind:"safeRegen", value:0.25, desc:"Zona Segura: +25% regen" },
    { id:"iron",   name:"Guardia de Hierro", tag:"Hierro",  kind:"restedCap", value:0.30, desc:"Descanso: +30% reserva" },
    { id:"wander", name:"Círculo Errante",   tag:"Errante", kind:"recallCd",  value:0.15, desc:"Vínculo: -15% enfriam." },
  ],
};

// CAS-2300: LIBRO DE LA ORDEN / ORDER LEDGER (DARK, SANCTUARY_LEDGER) — el ÚLTIMO paso del arco social del Santuario: PROGRESIÓN
// COLECTIVA de la orden. El arco ya da reputación (SANCTUARY_REP), un vendor (SANCTUARY_REWARDS), un evento (WORLD_EVENT), un
// emisario rotativo (SANCTUARY_EMISSARY) y afiliación de ORDEN (SANCTUARY_OATH). Lo que falta — y es NATIVO de MMORPG — es un
// OBJETIVO SEMANAL COMPARTIDO por TODOS los miembros de una misma orden (las 3 órdenes deterministas del Juramento) al que
// contribuyen con actividad YA existente, y que al cruzar un umbral desbloquea un PASIVO DE ORDEN temporal para toda la orden.
// Canon MMORPG: la barra de progreso de facción/hermandad (WoW Renown weekly / GW2 world-boss meta / FFXIV FC). Diseño Stage-1,
// 100% DETERMINISTA (0 RNG) y server-authority-ready:
//   · MARCADOR COLECTIVO = ESTADO DEL MUNDO, no per-hero. Se modela como función PURA del reloj de pared (mirror WORLD_EVENT/
//     Emissary): baseline(period, orderId) = la contribución AGREGADA del RESTO de los miembros de esa orden esa semana, derivada
//     deterministamente (hash de Knuth de period⊕orderId, 0 RNG) y RAMPADA por la fracción de semana transcurrida ⇒ la barra se
//     llena a lo largo de la semana (convergencia social). Idéntico en todo cliente con el reloj correcto ⇒ consistente bajo N
//     jugadores concurrentes (en Stage-2 el baseline se sustituye por la SUMA real server-authoritative de contribuciones; el
//     seam es el mismo). El jugador SUMA a SU orden vía contadores MONÓTONOS ya vivos (h.kills captura bounties + participación en
//     WORLD_EVENT; h.sanctuaryRep captura las ganancias de RENOMBRE) MENOS un snapshot `base` por-semana (h.ledgerAt) ⇒ 0 hook
//     nuevo, 0 tracking por-frame (misma técnica que BOUNTY_BOARD/Emissary). total(orden) = baseline + (mi orden? mi contribución).
//   · CONVERGENCIA: al cruzar `goal` esa semana, la orden del héroe obtiene un PASIVO FIJO que REUTILIZA un knob YA vivo (0 balance
//     nuevo): un multiplicador gateado en el MISMO chokepoint que el Juramento/Intendente (ledgerMul, sumado junto a oathMul +
//     sanctuaryRewardMul). Es TEMPORAL: gateado al period actual ⇒ al rolar la semana se re-evalúa. Visible como ★ sobre el TAG de
//     orden del nameplate (reusa la ruta de TITLES/Juramento; en Stage-2 otros ven la orden "en racha").
//   · RITMO SEMANAL por reloj (fn PURA ledgerScheduleAt, misma familia que warhornScheduleAt/emissaryScheduleAt) ⇒ 0 RNG.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickLedger RETURN inmediato (Date.now NUNCA se llama), ledgerMul RETURN 0 (los knobs
// quedan byte-idénticos a HEAD), G.ledger / h.ledgerAt NUNCA se crean, serializeSave OMITE la clave, el ★ del nameplate y la fila
// del Libro NUNCA se dibujan (el panel del Tablón no crece) ⇒ save.v1 + comportamiento + worldFingerprint BYTE-IDÉNTICOS a HEAD.
// Reversible en 1 línea (enabled:true→false + redeploy overlay CONSISTENTE-HEAD: config+sim+game+render — SIN input.js: 0 hotkey
// nuevo, la superficie es SOLO lectura en el panel del Tablón + el nameplate). Requiere SANCTUARY_OATH para saber la orden del
// héroe (sin juramento ⇒ el héroe no contribuye ni recibe pasivo, pero el marcador colectivo existe igual). Los NÚMEROS
// (periodSec/goal/baselineFrac/pesos/values) = decisión de BALANCE del CEO (retune = edición de knob barata y reversible).
export const SANCTUARY_LEDGER = {
  enabled: true,           // CAS-2301 LIVE. Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  periodSec: 604800,       // ventana SEMANAL (7 días) del objetivo colectivo (bucket determinista del epoch compartido). CEO knob.
  epochMs: 0,              // ancla del epoch compartido (0 = epoch Unix). period = floor((Date.now()-epochMs)/(periodSec*1000)).
  goal: 1000,              // UMBRAL colectivo por orden y semana (pts). Cruzarlo ⇒ pasivo de orden temporal. CEO balance knob.
  baselineFrac: 0.72,      // fracción del `goal` que el RESTO de la orden aporta AL FINAL de la semana (el jugador pone el resto). Rampa 0→esto.
  baselineJitter: 0.14,    // spread determinista ± por orden (hash de Knuth de period⊕orderId, 0 RNG) ⇒ cada orden llena a ritmo distinto.
  wKill: 5,                // pts por kill (h.kills — captura bounties + participación en WORLD_EVENT; contador monótono ya vivo).
  wRep: 1,                 // pts por punto de RENOMBRE ganado (h.sanctuaryRep — captura las ganancias de rep; contador monótono ya vivo).
  // Pasivo SEMANAL por orden (order-wide, temporal): reutiliza un knob YA vivo (0 balance nuevo), gateado a que la orden CRUCE el
  // umbral esta semana. `id` = id de la orden del Juramento (SANCTUARY_OATH.orders). kind∈{safeRegen,restedCap,recallCd} (mismos
  // seams que oathMul/sanctuaryRewardMul). value = fracción del bono. ledgerMul suma el value SÓLO si la orden está "en racha".
  orders: [
    { id:"dawn",   kind:"safeRegen", value:0.20 },   // Alba en racha  → Zona Segura: +20% regen extra
    { id:"iron",   kind:"restedCap", value:0.25 },   // Hierro en racha → Descanso: +25% reserva extra
    { id:"wander", kind:"recallCd",  value:0.12 },   // Errante en racha→ Vínculo: -12% enfriamiento extra
  ],
};

// CAS-2305: CLASIFICACIÓN DE ÓRDENES / ORDER STANDINGS (DARK, ORDER_STANDINGS) — capa SOCIAL COMPETITIVA sobre el arco del Santuario.
// El LIBRO (SANCTUARY_LEDGER, LIVE) ya da a cada una de las 3 Órdenes deterministas (dawn/iron/wander) una PROGRESIÓN COLECTIVA
// semanal server-authoritative. Lo que falta — y es NATIVO de MMORPG — es una CLASIFICACIÓN COMPARTIDA de esas órdenes que TODO
// jugador del shard ve idéntica: rivalidad e identidad social entre facciones, más un pequeño PASIVO para la orden LÍDER de la
// semana. Canon MMO: la tabla de facciones/gremios de un realm (WoW faction standings / GW2 world-vs-world scoreboard). Diseño
// Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready:
//   · RANKING = función PURA del reloj de pared: standingsRank(period) ordena las 3 órdenes por su BASELINE COLECTIVO del Libro
//     (ledgerBaseline(period,orderId) — la parte COMUNITARIA/server-authoritative, NO la contribución per-hero ⇒ TODO cliente con
//     el mismo reloj converge a la MISMA clasificación, 0 desync bajo N jugadores). En Stage-2 el baseline se sustituye por la
//     SUMA real de contribuciones server-authoritative; el seam del ranking es idéntico. La clasificación es ESTABLE toda la semana
//     (el ramp por frac es uniforme ⇒ el orden depende sólo del jitter determinista por orden) y ROTA por semana (identidad social
//     cambiante). El desempate es estable por id (0 RNG).
//   · PASIVO DEL LÍDER (order-wide, temporal): la orden en el PUESTO 1 esta semana otorga a SUS miembros un bono FIJO y ACOTADO por
//     un knob YA vivo (0 balance/moneda nueva): +leadValue al MULTIPLICADOR de Descanso (RESTED_XP.xpMult), sumado en el MISMO
//     chokepoint de gainXP que sanctuaryRewardMul("restedMult") ⇒ canal distinto al del Libro (safeRegen/restedCap/recallCd) para
//     que ambos pasivos sean observables por separado. Gateado a que la orden del héroe (su JURAMENTO) SEA la líder esta semana.
//   · La orden del héroe la aporta el JURAMENTO (SANCTUARY_OATH). Sin juramento ⇒ no recibe pasivo, pero la clasificación existe
//     igual (es estado del MUNDO, no per-hero). 0 campo nuevo en el héroe (reusa h.sanctuaryOath) ⇒ 0 clave nueva en save.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickStandings RETURN inmediato (G.standings NUNCA se crea), standingsMul RETURN 0 (el
// knob de Descanso queda byte-idéntico a HEAD), la fila del panel y el ♛ del nameplate NUNCA se dibujan ⇒ comportamiento + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN input.js (0 hotkey nuevo — superficie SOLO lectura en el panel del Tablón + nameplate).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS (leadValue) =
// decisión de BALANCE del CEO (retune = edición de knob barata y reversible). Depende de SANCTUARY_LEDGER (LIVE) para los baselines.
export const ORDER_STANDINGS = {
  enabled: true,           // LIVE (CAS-2306 flip). Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  leadKind: "restedMult",  // canal del pasivo del LÍDER: reusa el multiplicador de Descanso (RESTED_XP.xpMult) en gainXP (mismo seam que sanctuaryRewardMul).
  leadValue: 0.15,         // +15% al mult de Descanso para la orden LÍDER de la semana (bounded, server-authoritative). CEO balance knob.
};

// CAS-2310: DOMINIO DE ÓRDENES / ORDER TERRITORY (DARK, ORDER_TERRITORY) — convierte la CLASIFICACIÓN abstracta (ORDER_STANDINGS, LIVE)
// en ESTADO DE MUNDO VISIBLE y COMPARTIDO: la orden LÍDER de la semana CONTROLA el Santuario/Zona Segura (control de territorio, pilar
// clásico MMORPG — GW2 WvW sovereignty / EVE sov). Diseño Stage-1, 100% DERIVADO (0 estado nuevo) y server-authority-ready:
//   · CONTROLADOR = la orden LÍDER de la clasificación server-auth ya existente (standingsLeader() ⇒ DERIVADO del reloj de pared + los
//     baselines colectivos del Libro). El cliente NO decide quién controla — SÓLO renderiza el resultado ⇒ nada explotable/duplicable.
//     TODO jugador con el mismo reloj ve el MISMO controlador (convergencia N-clientes, 0 desync). Estado READ-ONLY derivado de G.standings
//     ya cacheado ⇒ 0 contención con N jugadores en la zona, 0 campo per-hero, 0 clave nueva en save, 0 G.* nuevo.
//   · TRANSFERENCIA de control = DETERMINISTA en el límite semanal wall-clock (la MISMA función de tiempo de WORLD_EVENT/STANDINGS ⇒
//     ledgerScheduleAt): cambia la clasificación de la semana ⇒ cambia el controlador. 0 RNG. Persiste entre sesiones hasta el recómputo.
//   · ESTANDARTE: mientras CUALQUIER jugador está DENTRO de la Zona Segura ve el TAG/estandarte de la orden controladora desplegado
//     (reusa el badge de "Zona segura" + la ruta de nameplate/TITLES — $0 arte, glifo ⚑ + tag). Mismo controlador para todos en la zona.
//   · PASIVO DE DOMINIO (order-wide, SÓLO en zona): los miembros de la orden CONTROLADORA reciben +controlValue al knob de ZONA ya vivo
//     (safeRegen — regen de la SAFEZONE), aplicado en el MISMO chokepoint que sanctuaryRewardMul("safeRegen") ⇒ SÓLO surte efecto DENTRO
//     de la zona controlada (ese regen sólo corre inSafeZone; además territoryMul re-gatea por inSafeZone). Gateado a que la orden del
//     héroe (su Juramento) SEA la controladora esta semana. Sin juramento ⇒ no recibe pasivo, pero el control existe igual (estado del mundo).
//   · PRECEDENCIA (anti-doblado con ORDER_STANDINGS): STANDINGS premia al líder por el canal `restedMult` (GLOBAL, en gainXP); TERRITORY
//     premia al MISMO líder por el canal `safeRegen` (SÓLO en zona) ⇒ CANALES DISTINTOS ⇒ observables por separado, NUNCA se doblan el
//     valor. Guard DURO: si controlKind === ORDER_STANDINGS.leadKind, territoryMul RETURN 0 (STANDINGS tiene precedencia) ⇒ imposible doblar.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ territoryMul RETURN 0 (el knob safeRegen queda byte-idéntico a HEAD), el estandarte NUNCA se
// dibuja ⇒ comportamiento + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (pasivo/automático, 0 hotkey — anti-CAS-2273).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Depende de ORDER_STANDINGS (LIVE).
export const ORDER_TERRITORY = {
  enabled: true,             // LIVE (CAS-2311). Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  controlKind: "safeRegen",  // canal del pasivo de DOMINIO: reusa el regen de la SAFEZONE (SÓLO surte efecto en zona). DISTINTO de ORDER_STANDINGS.leadKind ("restedMult") ⇒ no se dobla.
  controlValue: 0.10,        // +10% al regen de la Zona Segura para los miembros de la orden CONTROLADORA, SÓLO dentro de la zona. CEO balance knob.
};

// CAS-2313: ASALTO AL SANTUARIO / SANCTUARY CONTEST (DARK, ORDER_CONTEST) — convierte el control PASIVO del Santuario (ORDER_TERRITORY, LIVE:
// la orden LÍDER controla y la transferencia es pasiva en el límite semanal) en TERRITORIO-EN-DISPUTA DINÁMICO: una VENTANA DE ASALTO
// recurrente y determinista donde el RETADOR (2º de ORDER_STANDINGS) puede ARREBATAR el control ACTIVAMENTE. Pilar MMORPG de territorio
// disputado (GW2 WvW keep flips / EVE sov contest). Diseño Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready:
//   · VENTANA DE ASALTO = tramo FINAL del MISMO ciclo semanal de ORDER_STANDINGS/SANCTUARY_LEDGER (los últimos `windowFrac` de la semana),
//     derivada del reloj de pared COMPARTIDO (ledgerScheduleAt.frac) ⇒ TODO cliente con el mismo reloj deriva la MISMA ventana (0 desync).
//   · RETADOR = la orden en el PUESTO 2 de ORDER_STANDINGS (ranking server-auth ya cacheado en G.standings). El CONTROLADOR = el líder (1º).
//   · CONTRIBUCIÓN DE ASALTO = REUTILIZA el mecanismo del Libro/Clasificación: durante la ventana, el retador acumula un SURGE derivado de
//     su BASELINE colectivo server-auth (ledgerBaseline — la parte COMUNITARIA, NUNCA la contribución per-hero ⇒ convergente, 0 contención
//     entre N héroes), rampado por el avance DENTRO de la ventana (iw 0→1) y escalado por `gain`×fuerza-de-semana determinista. Las MISMAS
//     acciones que ya suman al Libro (kills + RENOMBRE) alimentan el baseline ⇒ SIN acciones/hotkeys nuevos. En Stage-2 el surge se sustituye
//     por la SUMA real de contribuciones server-authoritative de la orden retadora dentro de la ventana; el seam del flip es idéntico.
//   · FLIP INMEDIATO y VISIBLE: si (baseline del retador + surge) ≥ baseline del controlador, el control efectivo del Santuario CAMBIA de
//     inmediato al retador — VISIBLE para TODOS los en-zona (reutiliza el estandarte ⚑ + nameplate de ORDER_TERRITORY, $0 arte). El flip es
//     STICKY dentro de la ventana (iw monótono ⇒ surge monótono ⇒ 0 flapping) y se RESETEA al límite semanal (nueva Clasificación ⇒ nuevo líder).
//   · ESTADO COMPARTIDO OBSERVABLE: mientras la ventana está activa, todos los en-zona ven un banner "Asalto en curso" + progreso (reutiliza
//     el badge de Zona segura). El controlador EFECTIVO (con o sin flip) es el que ORDER_TERRITORY renderiza y al que aplica el pasivo de dominio.
//   · PRECEDENCIA (anti-doblado): ORDER_CONTEST NO añade canal de pasivo propio — SÓLO reescribe QUIÉN es el controlador efectivo de
//     ORDER_TERRITORY (canal safeRegen, SÓLO en zona). ORDER_STANDINGS (canal restedMult, al 1º del ranking) queda INTACTO (el asalto NO cambia
//     el ranking, sólo el CONTROL del territorio) ⇒ los dos canales siguen separados, 0 doble-conteo. Orden de resolución: standings→territory→contest.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ contestController devuelve el líder SIN cambios ⇒ territoryController + banner + pasivo + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave nueva). SIN tocar input.js (asalto observado + alimentado por acciones que YA
// existen, 0 hotkey — anti-CAS-2273). Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render).
// Depende de ORDER_TERRITORY (LIVE) + ORDER_STANDINGS (LIVE) + SANCTUARY_LEDGER (LIVE). Los NÚMEROS = decisión de BALANCE del CEO (retune barato).
export const ORDER_CONTEST = {
  enabled: true,             // LIVE (CAS-2314). Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  windowFrac: 0.25,          // fracción FINAL del ciclo semanal que es la VENTANA DE ASALTO (0.25 = último cuarto de la semana). Derivada del reloj compartido.
  gain: 0.40,                // escala del SURGE de asalto del retador (fracción de su baseline colectivo que puede sumar al final de la ventana, ×fuerza-de-semana). CEO balance knob.
  holdMargin: 0.25,          // VENTAJA DEL DEFENSOR (incumbencia): el retador debe superar controllerTotal×(1+holdMargin) para arrebatar el control ⇒ territorio REALMENTE disputado (~50% de semanas flipean, varía por fuerza-de-semana). CEO balance knob.
};

// CAS-2316: COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP (DARK, FELLOWSHIP_BOND) — la capa social PERSONAL que le faltaba al mundo. El arco
// del Santuario/Órdenes (Juramento→Libro→Clasificación→Dominio→Asalto, LIVE) da estado COLECTIVO y COMPETITIVO de facción; lo que aún falta
// —y es NATIVO de un MMORPG— es el vínculo ÍNTIMO del jugador con COMPAÑEROS con nombre que recorren el mismo mundo. Diseño Stage-1, 100%
// DETERMINISTA (0 RNG) y server-authority-ready, INDEPENDIENTE del arco de Órdenes (reloj + roster propios ⇒ no acopla su balance):
//   · HERMANDAD SEMANAL COMPARTIDA: cada ciclo (`periodSec`), una BANDA de `size` compañeros se ROTA de un `roster` fijo por el reloj de pared
//     COMPARTIDO (mismo hash de Knuth del Libro, 0 RNG) ⇒ TODO cliente con el mismo reloj ve la MISMA banda esta semana (convergente, 0 desync).
//     Es el estado social OBSERVABLE (fila SOLO-lectura en el panel del Tablón + glifo ∞ en el nameplate) — en Stage-2 la banda la fija el server.
//   · VÍNCULO PERSONAL (bond): profundiza con las MISMAS gestas que ya cuentan (kills desde que se formó la banda — contador monótono `h.kills`
//     menos el snapshot per-semana `h.fellowAt`, misma técnica que el Libro/Emisario ⇒ 0 tracking nuevo por-frame, 0 hook, SIN hotkey/input.js).
//     El bond escala TIERS con nombre (Desconocido→Compañero→Jurado). En Stage-2 el bond lo agrega el server desde la actividad COMPARTIDA.
//   · PASIVO al FORJAR: cuando el bond alcanza `forgeTier`, la Hermandad está FORJADA ⇒ pasivo `bondValue` en el canal NUEVO `bondKind` (xpGain
//     — "la camaradería del camino hace más dulce cada victoria"). Canal DISTINTO a oath/ledger/standings/territory (safeRegen/restedCap/recallCd/
//     restedMult) ⇒ 0 doble-conteo por construcción (kind único). Gateado a FORJADA ⇒ sin forjar / OFF ⇒ 0.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickFellowship jamás corre (Date.now nunca se llama), G.fellowship/h.fellowAt NUNCA se crean,
// fellowMul RETURN 0, save omite `fellowAt`, fellowshipTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave
// nueva). SIN tocar input.js (vínculo observado + alimentado por acciones que YA existen, 0 hotkey — anti-CAS-2273). Reversible en 1 línea
// (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO (retune barato).
export const FELLOWSHIP_BOND = {
  enabled: true,             // LIVE (CAS-2317 flip de CAS-2316). Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  periodSec: 604800,         // ciclo de la HERMANDAD (1 semana). Reloj de pared COMPARTIDO ⇒ MISMA banda de compañeros en N clientes (0 desync). Propio (no acopla al Libro).
  epochMs: 0,                // ancla del reloj (0 = epoch Unix). Compartida ⇒ period idéntico en todo cliente.
  size: 3,                   // nº de compañeros en la banda rotativa esta semana (subconjunto del roster).
  roster: [                  // roster FIJO de compañeros de ruta (arte $0 — nombres en el panel/nameplate). La banda semanal se ROTA determinista (Knuth hash, 0 RNG).
    { id:"vela",   name:"Vela la Vigía" },
    { id:"corvin", name:"Corvin Pie-Firme" },
    { id:"sela",   name:"Sela de los Páramos" },
    { id:"borin",  name:"Borin Yelmo-Roto" },
    { id:"nym",    name:"Nym Sombra-Larga" },
    { id:"tavish", name:"Tavish el Trovador" },
  ],
  bondPerKill: 1,            // cada gesta (kill desde que se formó la banda) profundiza el vínculo en esta cantidad. CEO balance knob.
  tiers: [                   // hitos del vínculo (nombre para HUD/panel). `at` = bond mínimo del tier (ascendente). El primero (at:0) es el estado base.
    { at:0,  name:"Desconocido" },
    { at:6,  name:"Compañero" },
    { at:16, name:"Jurado" },
  ],
  forgeTier: 1,              // índice del tier a partir del cual la Hermandad está FORJADA ⇒ pasivo activo (1 = "Compañero"). CEO balance knob.
  bondKind: "xpGain",        // canal del pasivo — seam NUEVO (0 colisión con oath/ledger/standings/territory ⇒ 0 doble-conteo por construcción).
  bondValue: 0.10,           // +10% XP mientras la Hermandad está FORJADA. CEO balance knob.
};

// CAS-2322: VÍNCULO DE MENTOR / MENTORSHIP BOND (DARK, MENTOR_BOND) — el pilar social ASIMÉTRICO que le falta al mundo. FELLOWSHIP_BOND (LIVE)
// une PARES SIMÉTRICOS por proximidad; el siguiente pegamento social NATIVO de un MMORPG es la relación veterano↔novato: retención real. Convierte
// la co-presencia de niveles DISPARES en un beneficio MUTUO determinista — el veterano acompaña al novato (reconocimiento), el novato progresa más
// rápido en compañía. Diseño Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready, reloj PROPIO (no acopla al arco de Órdenes ni a Fellowship):
//   · COMPAÑERO SEMANAL COMPARTIDO: cada ciclo (`periodSec`), el reloj de pared COMPARTIDO asigna al héroe UN compañero del `roster` fijo (hash de
//     Knuth, 0 RNG) ⇒ TODO cliente con el mismo reloj deriva el MISMO compañero esta semana (convergente, 0 desync). El compañero tiene un `lvl` fijo.
//   · ROL por GAP de NIVEL: el ROL (mentor / protégé) lo decide el gap del héroe LOCAL vs el compañero — gap≥`gapThreshold` ⇒ el héroe es MENTOR
//     (veterano), gap≤−`gapThreshold` ⇒ el héroe es PROTÉGÉ (novato), |gap|<umbral ⇒ sin relación esta semana. Server-authority-ready (client renderiza).
//   · DWELL determinista de co-presencia (bind): profundiza con las MISMAS gestas que ya cuentan (kills desde que se asignó el par — contador monótono
//     `h.kills` menos el snapshot per-semana `h.mentorAt`, misma técnica que el Libro/Fellowship ⇒ 0 tracking nuevo por-frame, 0 hook, SIN input.js).
//     Al alcanzar `bindTier` el par queda LIGADO ⇒ activa los beneficios. En Stage-2 el bind lo confirma el server desde la co-presencia COMPARTIDA.
//   · BENEFICIO PROTÉGÉ: boost de XP ESCALONADO por dwell (reusa el canal RESTED_XP `restedMult`), SÓLO mientras ligado. El progreso más rápido en compañía.
//   · BENEFICIO MENTOR: título "Mentor" en el nameplate (reusa la capa TITLES) — reconocimiento social, SIN ventaja de poder (no rompe balance).
//   · PRECEDENCIA de pasivos (crítico, 0 stacking) — ESPEJA el patrón de EVOs previos (territoryMul→standingsMul): se de-stackea SÓLO en el MISMO
//     canal. STANDINGS(colectivo) y MENTOR(personal) comparten restedMult ⇒ NO se suman: MENTOR CEDE (mul 0) cuando STANDINGS aporta ⇒ se aplica el
//     MAYOR (el colectivo gana; standingsMul 0.15 ≥ mentorBoost máx 0.15). FELLOWSHIP(xpGain) y TERRITORY(safeRegen) son canales ⊥ ⇒ COEXISTEN (igual
//     que hoy fellowship-xpGain + standings-restedMult ya coexisten en gainXP, y territory-safeRegen coexiste con standings-restedMult). Documentado.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickMentor jamás corre (Date.now nunca se llama), G.mentor/h.mentorAt NUNCA se crean, mentorMul RETURN 0,
// save omite `mentorAt`, mentorBondTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave nueva). SIN tocar input.js
// (rol observado + alimentado por acciones que YA existen, 0 hotkey — anti-CAS-2273). Reversible en 1 línea (enabled:false→true + redeploy overlay
// consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO (retune barato).
export const MENTOR_BOND = {
  enabled: true,             // CAS-2323 LIVE (EVO#48). CEO gate APPROVED tras QA PASS 14/14 (asimétrico 2-cliente, byte-id OFF). Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  periodSec: 604800,         // ciclo del VÍNCULO (1 semana). Reloj de pared COMPARTIDO ⇒ MISMO compañero asignado en N clientes (0 desync). Propio (no acopla a Fellowship/Órdenes).
  epochMs: 0,                // ancla del reloj (0 = epoch Unix). Compartida ⇒ period idéntico en todo cliente.
  gapThreshold: 5,           // gap de nivel MÍNIMO para que exista una relación mentor/protégé (|heroLvl − partnerLvl| ≥ umbral). CEO balance knob.
  roster: [                  // roster FIJO de compañeros (arte $0 — nombres en el panel/nameplate). Cada uno con un `lvl` fijo que decide el rol vs el héroe. La asignación semanal es determinista (Knuth hash, 0 RNG).
    { id:"pip",    name:"Pip el Aprendiz",     lvl:3  },
    { id:"wren",   name:"Wren Manos-Torpes",   lvl:8  },
    { id:"dario",  name:"Darío Paso-Firme",    lvl:16 },
    { id:"osric",  name:"Osric Escudo-Viejo",  lvl:24 },
    { id:"maegan", name:"Maegan la Templada",  lvl:33 },
    { id:"bryn",   name:"Bryn Mil-Batallas",   lvl:47 },
  ],
  tiers: [                   // hitos del DWELL de co-presencia (nombre para HUD/panel + `boost` de XP del PROTÉGÉ, escalonado). `at` = dwell mínimo (ascendente). El primero (at:0) es el estado base (encuentro, sin ligar).
    { at:0,  name:"Encuentro", boost:0    },
    { at:4,  name:"Aprendiz",  boost:0.10 },
    { at:12, name:"Discípulo", boost:0.15 },
  ],
  bindTier: 1,               // índice del tier de dwell a partir del cual el par está LIGADO ⇒ beneficios activos (1 = "Aprendiz"). CEO balance knob.
  boostKind: "restedMult",   // canal del boost del PROTÉGÉ — REUSA RESTED_XP (mismo canal que STANDINGS ⇒ precedencia por MAYOR, ver mentorMul). El veterano NO recibe boost (sólo título).
  mentorTitle: "Mentor",     // título del nameplate del VETERANO (reusa la capa TITLES) — reconocimiento social, SIN ventaja de poder. CEO balance knob.
  protegeTitle: "Protégé",   // etiqueta del NOVATO (panel/nameplate). CEO balance knob.
};

// CAS-2325: VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE (DARK, SOUL_RECOVERY) — EVO #49, el PIVOTE de arco: abre la lane FRESCA del
// LOOP DE MUERTE Y RECUPERACIÓN del mundo COMPARTIDO (tras el arco social Órdenes+Vínculos #43–48). Hoy morir es un evento single-player
// PRIVADO; lo reencuadramos como MMORPG: tu muerte deja un ARTEFACTO persistente y VISIBLE que OTROS jugadores del mundo pueden interactuar
// — interdependencia social sobre el combate souls-like que YA existe (dodge/poise/stamina/flasks/Mancha de Sangre). Diseño Stage-1, 100%
// DETERMINISTA (0 RNG) y server-authority-ready, reloj PROPIO (no acopla al arco de Órdenes ni a Fellowship/Mentor):
//   · VESTIGIO AMBIENTAL COMPARTIDO (ancla de CONVERGENCIA, espeja el compañero semanal de Mentor/Fellowship): cada ciclo (`periodSec`), el
//     reloj de pared COMPARTIDO registra UN vestigio de un CAÍDO del `roster` fijo (hash de Knuth, 0 RNG) en una TILE determinista de una zona
//     determinista ⇒ TODO cliente con el mismo reloj deriva el MISMO vestigio (id/caído/tile) en el MISMO tick (convergente, 0 desync). En
//     Stage-1 el `roster` de caídos hace de stand-in de otros jugadores (mismo patrón que la banda de Fellowship / el compañero de Mentor)
//     hasta que Stage-2 lo alimente del server. `vestigeId = hash(period, fallen.id, zone)` — espeja el `hash(playerId, deathTick, zoneId)`
//     del diseño (playerId↔fallen.id, deathTick↔period, zoneId↔zone). 0 RNG, server-authority-ready.
//   · CADUCIDAD DETERMINISTA: el vestigio está VIVO sólo la 1ª fracción `liveFrac` del period; luego CADUCA (limpieza, "tras N ticks si nadie
//     recupera" — sin fugas de estado). Ambos clientes lo ven APARECER al inicio del period y DESAPARECER al caducar (convergente).
//   · ROL por IDENTIDAD (asimétrico, espeja mentorRole/gap): el ROL lo decide la identidad del héroe LOCAL vs el CAÍDO del period — si la
//     identidad del héroe MAPEA al caído de este period ⇒ el héroe ES el CAÍDO (es SU vestigio ⇒ NO puede recuperarlo; recibe el buff de
//     respawn). Si no ⇒ el héroe es un RECUPERADOR potencial. Server-authority-ready (el client renderiza; el server confirma).
//   · RECUPERACIÓN por PROXIMIDAD + DWELL (SIN hotkey — anti-CAS-2273): cualquier héroe RECUPERADOR que entre en `radius` y PERMANEZCA
//     `dwellSec` auto-recupera. Server-auth first-come: elimina el vestigio ATÓMICAMENTE (en Stage-2 lo resuelve el server por primer tick
//     determinista; sin contención). El dwell se acumula del reloj COMPARTIDO (delta nowMs mientras en radio), frame-rate-independiente.
//   · BENEFICIO RECUPERADOR: pequeño boost pasivo (reusa el canal RESTED_XP `restedMult`) mientras "porta" el vestigio recuperado (hasta que
//     ese period caduca) — recompensa por AYUDAR. BENEFICIO CAÍDO: buff de RECUPERACIÓN en su próximo respawn (reusa RESTED_XP `restedMult`),
//     restaurando una porción durante los primeros `respawnKills` kills tras revivir — NO dinero/loot nuevo, sólo pasivo.
//   · PRECEDENCIA de pasivos (crítico, 0 stacking) — ESPEJA el patrón de EVOs previos (territory→standings, mentor→standings): se de-stackea
//     SÓLO en el MISMO canal. STANDINGS(colectivo) > MENTOR(personal) > SOUL(recuperación) comparten restedMult ⇒ NO se suman: SOUL CEDE
//     (mul 0) cuando STANDINGS o MENTOR aportan ⇒ se aplica el MAYOR (0 doble-conteo). FELLOWSHIP(xpGain) y TERRITORY(safeRegen) canales ⊥ ⇒
//     COEXISTEN. El recuperador NO puede recuperar su PROPIO vestigio (rol "fallen" ⇒ deny). Documentado.
// HARD-GATED (anti-CAS-2220): enabled:false ⇒ tickSoul jamás corre (Date.now nunca se llama), G.soul/h.soulAt/h.soulGot/h.soulFell NUNCA se
// crean, soulMul RETURN 0, save omite las claves, soulTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave
// nueva). SIN tocar input.js (recuperación por proximidad+dwell + rol observado, 0 hotkey). Reversible en 1 línea (enabled:false→true + redeploy
// overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO (retune barato).
export const SOUL_RECOVERY = {
  enabled: true,             // CAS-2327 LIVE FLIP (EVO#49). ON ⇒ tickSoul corre; vestigio ambiental COMPARTIDO + recuperación proximidad/dwell activos. CEO Gate APPROVED; QA re-QA post-CAS-2326 (soulPos zone-guard) = 15/15 ×2. Reversible 1-line: true→false + redeploy overlay consistente-HEAD (config+sim+game+render — SIN input.js).
  periodSec: 300,            // ciclo del VESTIGIO (5 min — corto y OBSERVABLE, no acopla a otros relojes). Reloj de pared COMPARTIDO ⇒ MISMO vestigio en N clientes (0 desync).
  epochMs: 0,                // ancla del reloj (0 = epoch Unix). Compartida ⇒ period idéntico en todo cliente.
  liveFrac: 0.5,             // el vestigio está VIVO sólo esta fracción inicial del period; luego CADUCA (limpieza determinista, "tras N ticks si nadie recupera"). CEO balance knob.
  roster: [                  // población de CAÍDOS (stand-in de otros jugadores hasta Stage-2 — nombres en el glifo/panel, arte $0). El caído del period se elige determinista (Knuth hash, 0 RNG).
    { id:"kael",   name:"Kael el Errante" },
    { id:"mirr",   name:"Mirr de la Bruma" },
    { id:"dolan",  name:"Dolan Sin-Tumba" },
    { id:"esa",    name:"Esa Paso-Perdido" },
    { id:"veyra",  name:"Veyra la Caída" },
    { id:"torg",   name:"Torg Yelmo-Hundido" },
  ],
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde puede caer un vestigio (la del period se elige determinista por hash; la tile se deriva del rect del spawner de esa zona).
  radius: 96,                // radio de RECUPERACIÓN (px) — proximidad al vestigio. CEO balance knob.
  dwellSec: 3,               // umbral de PERMANENCIA (dwell) para auto-recuperar SIN hotkey (segundos en radio). CEO balance knob.
  channel: "restedMult",     // canal ÚNICO de ambos pasivos (recuperador + caído) — REUSA RESTED_XP. Precedencia: cede a STANDINGS y MENTOR (mismo canal, ver soulMul).
  recovererBoost: 0.10,      // +10% restedMult mientras el recuperador PORTA el vestigio recuperado (hasta que ese period caduca). CEO balance knob.
  respawnBoost: 0.15,        // buff de RECUPERACIÓN del caído en su próximo respawn (+15% restedMult) — porción restaurada. CEO balance knob.
  respawnKills: 20,          // el buff de respawn del caído se desvanece tras estos kills (contador monótono, determinista, pin-independiente). CEO balance knob.
};

// CAS-2329: PULSO DEL MUNDO / WORLD PULSE (DARK, WORLD_PULSE) — EVO #50, el PRIMER sistema de estado-de-mundo dinámico y AMBIENTAL (living-world).
// Pivote FUERA del arco social (Fellowship/Mentor #47/#48) y del arco Orden/territorio (#43–46): no es otro VÍNCULO, es una capa AMBIENTAL que hace
// que el mundo COMPARTIDO se sienta VIVO y perfectamente sincronizado entre todos los clientes. Diseño Stage-1, 100% DETERMINISTA (0 RNG) y
// server-authority-ready, reloj PROPIO (no acopla a ningún otro reloj):
//   · RELOJ COMPARTIDO ⇒ CONVERGENCIA (razón de existir): el reloj de pared COMPARTIDO (epochMs+periodSec, mismo patrón que SOUL_RECOVERY/CONTEST)
//     divide el tiempo en PULSOS. Cada pulso, un hash determinista (Knuth, mismo helper que el roster de Vestigio) designa 1 zona "en Pulso" de la
//     rotación de `zones` ⇒ TODO cliente con el mismo reloj ve EXACTAMENTE la misma zona-en-Pulso en el mismo instante (byte-idéntico, 0 desync). Un
//     desync de fase = sev-1.
//   · FASE VIVA + DECAIMIENTO DETERMINISTA: el pulso está VIVO sólo la 1ª fracción `liveFrac` del period; luego DECAE (limpieza determinista, sin
//     estado local). Ambos clientes lo ven APARECER al inicio del period y DESAPARECER al decaer (convergente).
//   · PASSIVE COMPARTIDO (concurrencia): N jugadores presentes en la zona-en-Pulso mientras VIVA reciben el MISMO Δ pequeño (REUSA el canal
//     RESTED_XP `restedMult`, +boost). NO es per-hero: se deriva puramente de (reloj⇒zona) × (el héroe está físicamente en esa zona) ⇒ 0 estado nuevo,
//     0 clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (más fuerte que Vestigio, que sí creaba h.soulAt/soulGot/soulFell).
//   · INDICADOR $0-arte: banner de texto "◈ Pulso del Mundo: <zona>" (reusa la fila de badges, como Toque de Guerra/Emisario), 0 arte nuevo.
//   · PRECEDENCIA NO-stack: el passive del Pulso es la MÁS BAJA del canal restedMult ⇒ CEDE (return 0) a STANDINGS(colectivo) > MENTOR(personal) >
//     SOUL(recuperación) ⇒ se aplica el MAYOR (0 doble-conteo). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ COEXISTEN. Guard explícito (ver pulseMul).
// HARD-GATED: enabled:false ⇒ tickPulse jamás corre (Date.now nunca se llama), G.pulse NUNCA se crea, pulseMul RETURN 0, pulseTag "" ⇒ sim + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave nueva, 0 serialización). SIN tocar input.js (passive AMBIENTAL, 0 hotkey nuevo).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO.
export const WORLD_PULSE = {
  enabled: true,             // CAS-2330 LIVE FLIP (Gate CEO APROBADO, QA 12/12 ×2 build c4a549ae2fa1). false→true (config-only 1-línea, reversible, mirror SOUL_RECOVERY/CONTEST).
  periodSec: 240,            // ciclo del PULSO (4 min — corto y OBSERVABLE, desacoplado de todos los demás relojes). Reloj de pared COMPARTIDO ⇒ MISMA zona-en-Pulso en N clientes (0 desync).
  epochMs: 0,                // ancla del reloj (0 = epoch Unix). Compartida ⇒ period idéntico en todo cliente.
  liveFrac: 0.5,             // el pulso está VIVO sólo esta fracción inicial del period; luego DECAE (limpieza determinista, "tras N ticks"). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden entrar en Pulso (la del period se elige determinista por hash de Knuth; reusa la lista de zonas de caza, mirror SOUL_RECOVERY.zones).
  channel: "restedMult",     // canal del passive — REUSA RESTED_XP. Precedencia: cede a STANDINGS/MENTOR/SOUL (mismo canal, ver pulseMul). CEO balance knob.
  boost: 0.10,               // +10% restedMult a los presentes en la zona-en-Pulso mientras VIVA (compartido, mismo Δ para todos). CEO balance knob.
};

// CAS-2332: CONGREGACIÓN / GATHERING DENSITY (DARK, CONGREGATION) — EVO #51, la mecánica MÁS multiplayer-native del arco. CELEBRA directamente el
// pilar de CONCURRENCIA Y ESCALA de Mithralda Online: cuanta más gente comparte una zona a la vez, más viva se siente y mejor se juega ⇒ recompensa
// que el mundo COMPARTIDO se llene. Diseño Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready.
// Pivote FUERA de los pasivos de reloj (World Pulse #50) y de vínculo/proximidad (Fellowship/Mentor/Soul #47–49): NO la agenda un reloj, NO ata
// jugadores concretos — la dirige el HEADCOUNT REAL de jugadores LIVE concurrentes por zona (presencia server-authoritative). Forma hubs sociales orgánicos.
//   · SERVER-AUTHORITATIVE (fuente de verdad de presencia): el server cuenta los jugadores LIVE por zona y EMPUJA el snapshot { zona → cuenta }; el
//     cliente sólo lo REFLEJA (0 confianza al cliente, NO añade su propia presencia — el server ya la cuenta). En Stage-1 el snapshot se inyecta por
//     hook (mismo patrón que WORLD_PULSE inyecta el reloj compartido) ⇒ 2 clientes con el MISMO snapshot convergen byte-a-byte (mismo tier/cuenta/buff,
//     0 desync). Cualquier desync de cuenta/tier/buff = sev-1.
//   · TIERS por UMBRAL de headcount (deterministas, 0 RNG): <umbral₁ ⇒ Tier 0 (sin efecto); ≥umbral₁ ⇒ T1; ≥umbral₂ ⇒ T2; ≥umbral₃ ⇒ T3. El tier
//     DECAE de forma determinista al bajar la cuenta (jugadores salen/logout) ⇒ baja exactamente al umbral vigente (función pura del headcount, sin histéresis).
//   · PASSIVE COMPARTIDO (concurrencia): TODO jugador presente en una zona en Congregación (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal
//     RESTED_XP restedMult). Emergente, sin binding: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: CONGREGATION es la MÁS BAJA del canal restedMult ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL > PULSE ⇒ se
//     aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Guard explícito (ver congMul).
//   · INDICADOR $0-arte: badge de texto "Congregación: <zona> T<n> ×N" (reusa la fila de badges + glifo procedural, como Pulso del Mundo/Emisario), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickCongregation jamás corre, G.congregation/G.congServer NUNCA se crean, congMul RETURN 0, congTag "" ⇒ sim + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave serializada). SIN tocar input.js (passive 100% AMBIENTAL, 0 hotkey nuevo).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO.
export const CONGREGATION = {
  enabled: true,             // CAS-2333 LIVE FLIP (Gate CEO APROBADO, QA 18/18 ×2 build c4a549ae2fa1). false→true (config-only 1-línea, reversible, mirror WORLD_PULSE/SOUL_RECOVERY/ORDER_CONTEST).
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: cede a STANDINGS/MENTOR/SOUL/PULSE (mismo canal, ver congMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden congregarse (mirror WORLD_PULSE.zones/SOUL_RECOVERY.zones — reusa las zonas de caza).
  // TABLA de tiers: umbral de headcount (min, inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ cuenta LIVE (determinista, monótono).
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — hub incipiente (≥2 jugadores en la zona): pasivo suave.
    { min: 4, boost: 0.10 },   // Tier 2 — congregación (≥4): pasivo medio.
    { min: 8, boost: 0.15 },   // Tier 3 — multitud (≥8): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2335: SENDERO TRILLADO / WELL-TRODDEN PATH (DARK, WAYFARER_TRAIL) — EVO mecánica #52. PILAR FRESCO: eje NUEVO de traversal/logística EMERGENTE.
// El arco reciente cubrió vínculos sociales (Fellowship/Mentor #47–48), muerte (Vestige #49), reloj-de-mundo (World Pulse #50) y densidad-por-headcount
// INSTANTÁNEA (Congregación #51 = presencia estática AHORA). Este pilot pivota a algo distinto: el mundo COMPARTIDO se DESGASTA con el paso AGREGADO de
// MUCHOS jugadores A LO LARGO DEL TIEMPO. Las rutas más transitadas por la comunidad se "abren" solas (senderos) y recompensan a quien las sigue —
// artefacto EMERGENTE del tránsito agregado; ningún jugador solo las produce. Diseño Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready.
//   · SERVER-AUTHORITATIVE (fuente de verdad del tránsito): el server acumula "pisadas" por CELDA de terreno (bucket COARSE de `cellSize` px, NO per-pixel
//     ⇒ barato a escala) cada vez que un jugador la atraviesa, y EMPUJA el snapshot { celda → { tread, atMs } }; el cliente sólo lo REFLEJA (0 confianza,
//     NO cuenta su propia pisada — el server ya la cuenta). En Stage-1 el snapshot se inyecta por hook (mismo patrón que WORLD_PULSE inyecta el reloj y
//     CONGREGATION el headcount) ⇒ 2 clientes con el MISMO snapshot + el MISMO nowMs convergen byte-a-byte (mismo mapa de senderos + mismo pasivo, 0 desync).
//     Cualquier desync de sendero/pasivo = sev-1.
//   · DECAY DETERMINISTA (sin RNG): el tread de cada celda DECAE con el tiempo por vida-media exponencial — dec = tread · 0.5^(max(0,now−atMs)/halfLife).
//     Ninguna celda sube sola sin tránsito real ⇒ requiere CONCURRENCIA AGREGADA de la comunidad (un solo jugador no puede "abrir" un sendero rápido; su
//     pisada decae antes de cruzar el umbral). Función PURA del snapshot + reloj compartido ⇒ idéntica en N clientes.
//   · SENDERO TRILLADO por UMBRAL: una celda cuyo tread decaído ≥ `threshold` es un Sendero Trillado. Quien TRANSITA sobre esa celda recibe un pasivo
//     pequeño (REUSA el canal RESTED_XP restedMult) MIENTRAS camina por ella. Emergente, sin binding, SIN reloj propio, SIN headcount instantáneo.
//   · PASSIVE COMPARTIDO: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo). El buff nace de la CELDA (estado del mundo
//     compartido), no del jugador.
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: WAYFARER_TRAIL es la MÁS BAJA del canal restedMult (la más difusa/emergente) ⇒ CEDE (return 0) a STANDINGS >
//     MENTOR > SOUL > PULSE > CONGREGATION ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒
//     coexisten. Guard explícito (ver wayfarerMul).
//   · INDICADOR $0-arte: badge de texto "Sendero Trillado" (reusa la fila de badges + glifo procedural, como Congregación/Pulso del Mundo), 0 arte nuevo.
//     Tinte/overlay de tile para señalar el sendero = OPCIONAL y diferido (no requerido por el DoD; el badge ya lo hace observable). NO tocar input.js.
// HARD-GATED: enabled:false ⇒ tickWayfarer jamás corre (Date.now nunca se llama), G.wayfarer/G.wayfarerServer NUNCA se crean, wayfarerMul RETURN 0,
// wayfarerTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave serializada). SIN tocar input.js (100% AMBIENTAL, 0 hotkey).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO.
export const WAYFARER_TRAIL = {
  enabled: true,             // CAS-2336 LIVE FLIP (EVO#52, CEO Gate 998fc702 APPROVED; QA DARK 17/17 ×2 build c4a549ae2fa1). Reversible 1-línea true→false = DARK de nuevo (mirror CONGREGATION/WORLD_PULSE/SOUL_RECOVERY).
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION (ver wayfarerMul). CEO balance knob.
  cellSize: 128,             // lado del bucket COARSE en px (4 tiles de 32px). El tránsito se cuenta por celda, NO per-pixel ⇒ barato a escala (mapa de senderos disperso).
  threshold: 100,            // tread DECAÍDO (post-decay) que convierte una celda en Sendero Trillado. Requiere tránsito AGREGADO de la comunidad para cruzarlo. CEO balance knob.
  boost: 0.06,               // +6% restedMult a quien transita un Sendero Trillado (pasivo pequeño, compartido, mismo Δ para todos). Sin tiers (pasivo único). CEO balance knob.
  halfLifeSec: 90,           // vida-media del DECAY determinista (sin RNG): el tread cae a la mitad cada 90s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de referencia para el helper de PRUEBA (teleport determinista, mirror CONGREGATION/WORLD_PULSE.zones). NO gatea el passive: el gate es la CELDA trillada, esté donde esté.
};

// CAS-2338: CONFLUENCIA / DIVERSE COMPANY (DARK, DIVERSE_COMPANY) — EVO mecánica #53. Eje FRESCO: variedad de COMPOSICIÓN (NO densidad bruta).
// Congregación (#51) premia el HEADCOUNT bruto por zona (cuánta gente). Confluencia premia la MEZCLA: cuántos ARQUETIPOS/CLASES DISTINTAS co-existen
// en la misma zona a la vez. Un grupo heterogéneo (guerrero+mago+druida) "confluye" y el mundo compartido recompensa a TODOS los presentes; N clones de
// la MISMA clase (o 1 jugador solo) NO abren nada. Emergente del grupo diverso. Diseño Stage-1, 100% DETERMINISTA (0 RNG) y server-authority-ready.
//   · SERVER-AUTHORITATIVE (fuente de verdad de composición): el server cuenta la PRESENCIA por clase y zona y EMPUJA el snapshot { zona → { clase → cuenta } };
//     el cliente sólo lo REFLEJA (0 confianza; NO añade su propia clase — el server ya la cuenta). En Stage-1 el snapshot se inyecta por hook (mismo patrón
//     que CONGREGATION inyecta el headcount) ⇒ 2 clientes con el MISMO snapshot convergen byte-a-byte (mismo nº de clases distintas ⇒ mismo tier/buff, 0 desync).
//     Cualquier desync de diversidad/tier/buff = sev-1.
//   · DIVERSIDAD = nº de CLASES DISTINTAS con cuenta>0 (variedad, NO suma). Tiers por UMBRAL de diversidad (deterministas, 0 RNG): <2 clases ⇒ Tier 0 (sin
//     efecto); ≥2 ⇒ T1; ≥3 ⇒ T2; ≥4 ⇒ T3. El tier DECAE de forma determinista al caer la diversidad bajo umbral (una clase se va) ⇒ función pura, sin histéresis.
//   · PASSIVE COMPARTIDO (composición): TODO jugador presente en una zona en Confluencia (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal RESTED_XP
//     restedMult). Emergente, sin binding: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: DIVERSE_COMPANY es la MÁS BAJA del canal restedMult (8ª y última fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR >
//     SOUL > PULSE > CONGREGATION > WAYFARER ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Guard explícito (ver confMul).
//   · INDICADOR $0-arte: badge de texto "Confluencia: <zona> T<n> ×N" (reusa la fila de badges + glifo procedural, como Congregación/Sendero Trillado), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickConfluence jamás corre, G.confluence/G.confServer NUNCA se crean, confMul RETURN 0, confTag "" ⇒ sim + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD (0 estado nuevo, 0 clave serializada). SIN tocar input.js (passive 100% AMBIENTAL, 0 hotkey nuevo).
// Reversible en 1 línea (enabled:false→true + redeploy overlay consistente-HEAD: config+sim+game+render). Los NÚMEROS = decisión de BALANCE del CEO.
export const DIVERSE_COMPANY = {
  enabled: true,             // LIVE (EVO#53, CAS-2339 flip). Reversible 1-línea true→false (mirror CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE).
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER (ver confMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden confluir (mirror CONGREGATION/WORLD_PULSE.zones — reusa las zonas de caza).
  classes: ["warrior","paladin","mage","druid","priest"],     // arquetipos/clases DISTINTAS que cuentan para la diversidad (mirror CLASS_LIST). El server cuenta cuántas DISTINTAS co-presentes por zona.
  // TABLA de tiers: umbral de CLASES DISTINTAS (min, inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ diversidad (determinista, monótono).
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — dúo diverso (≥2 clases distintas): pasivo suave.
    { min: 3, boost: 0.10 },   // Tier 2 — banda mixta (≥3): pasivo medio.
    { min: 4, boost: 0.15 },   // Tier 3 — compañía plena (≥4): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2341: VIGILIA / LONG WATCH (DARK, LONG_WATCH) — EVO mecánica #54. Eje FRESCO: CONTINUIDAD TEMPORAL de habitación de una zona (≠ arco #47-53).
// No es headcount instantáneo (Congregación #51), ni footfall acumulado por celda (Sendero #52), ni variedad de clases (Confluencia #53), ni zona por reloj
// (World Pulse #50). Es CUÁNTO TIEMPO una zona lleva OCUPADA SIN INTERRUPCIÓN por ≥1 jugador — una "vigilia" sostenida por la comunidad vía RELEVO/hand-off.
//   · SERVER-AUTHORITATIVE (fuente de verdad de la continuidad): el server mantiene por zona un `streak` (segundos-ocupados-continuos) que SUBE mientras haya ≥1
//     jugador presente y DECAE determinista (vida-media fija, 0 RNG) al vaciarse; si el hueco vacío supera `gapBreakSec` el streak se ROMPE (→0). El server EMPUJA
//     el snapshot { zona → { streak, atMs, present } }; el cliente sólo lo REFLEJA + proyecta al `now` compartido (0 confianza). En Stage-1 el snapshot se inyecta por
//     hook (mismo patrón que WAYFARER_TRAIL inyecta el tread) ⇒ 2 clientes con el MISMO snapshot+reloj convergen byte-a-byte (mismo streak/tier/buff, 0 desync).
//   · PROYECCIÓN determinista al `now`: present>0 ⇒ streak_now = min(cap, streak + (now−atMs)); present==0 ⇒ si (now−atMs) > gapBreakSec ⇒ 0 (roto), si no
//     streak_now = streak · 0.5^((now−atMs)/halfLife) (decae). Función pura del snapshot+reloj (0 RNG, 0 histéresis) ⇒ N clientes convergen.
//   · TIERS por UMBRAL de segundos-continuos (deterministas): <t1 ⇒ Tier 0 (sin efecto); ≥t1 ⇒ T1; ≥t2 ⇒ T2; ≥t3 ⇒ T3. Cruzar arriba abre la Vigilia; el decay/
//     ruptura al vaciarse la baja de tier. 1 jugador que entra y SALE NO la abre (el streak decae/rompe antes de cruzar t1 salvo que alguien RELEVE — hand-off social).
//   · PASSIVE COMPARTIDO (continuidad): TODO jugador presente en una zona en Vigilia (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal RESTED_XP
//     restedMult). Emergente, sin binding: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: LONG_WATCH es la MÁS BAJA del canal restedMult (9ª y última fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL >
//     PULSE > CONGREGATION > WAYFARER > DIVERSE_COMPANY ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten.
//   · INDICADOR $0-arte: badge de texto "Vigilia: <zona> T<n>" (reusa la fila de badges + glifo procedural), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickLongWatch jamás corre (Date.now nunca se llama), G.longWatch/G.longWatchServer NUNCA se crean, longWatchMul RETURN 0, longWatchTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL, 0 hotkey). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const LONG_WATCH = {
  enabled: true,             // LIVE (EVO#54) — flip false→true CAS-2343 (CEO gate a3ed74a1). Mirror DIVERSE_COMPANY/WAYFARER_TRAIL/CONGREGATION flips.
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY (ver longWatchMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden sostener una Vigilia (mirror CONGREGATION/WORLD_PULSE/DIVERSE_COMPANY.zones — reusa las zonas de caza).
  halfLifeSec: 45,           // vida-media del DECAY determinista (sin RNG) del streak al vaciarse la zona: cae a la mitad cada 45s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  gapBreakSec: 60,           // si la zona lleva vacía MÁS de esto (s), el streak se ROMPE (→0): la vigilia se pierde si nadie releva a tiempo. CEO balance knob.
  capSec: 600,               // techo del streak (s) (evita crecimiento ilimitado; el tier máx se satura mucho antes). CEO balance knob.
  // TABLA de tiers: umbral de SEGUNDOS-OCUPADOS-CONTINUOS (min, inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ streak (determinista, monótono).
  tiers: [
    { min: 30,  boost: 0.05 },   // Tier 1 — vigilia naciente (≥30s continuos): pasivo suave.
    { min: 90,  boost: 0.10 },   // Tier 2 — vigilia firme (≥90s): pasivo medio.
    { min: 180, boost: 0.15 },   // Tier 3 — vigilia plena (≥180s): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2347: EXPEDICIÓN / FRONTIER SPREAD (DARK, FRONTIER_SPREAD) — EVO mecánica #55. Eje FRESCO: DISPERSIÓN ESPACIAL — cuán ESPARCIDA está la comunidad
// dentro de una zona. Ortogonal a todo el arco: ≠ Congregación #51 (headcount/densidad, *cuántos*), ≠ Sendero #52 (footfall acumulado, *camino*), ≠ Confluencia
// #53 (variedad de clases, *qué tan distintos*), ≠ Vigilia #54 (continuidad temporal, *cuánto tiempo seguido*), ≠ World Pulse #50 (reloj global). Aquí importa
// CÓMO se REPARTEN en el ESPACIO: sostener frontera / cubrir terreno vs amontonarse.
//   · SERVER-AUTHORITATIVE (fuente de verdad de la cobertura): el server, por zona por tick, AGRUPA a los presentes en SUB-CELDAS COARSE (bucket determinista de
//     coords, MISMO grid que Sendero para reuso, frontierCellKey) y cuenta el NÚMERO de sub-celdas DISTINTAS ocupadas simultáneamente (= "cobertura"/spread). Empuja
//     el snapshot { zona → { cover, atMs } }; el cliente sólo lo REFLEJA + PROYECTA al `now` compartido (0 confianza). En Stage-1 el snapshot se inyecta por hook (mismo
//     patrón que WAYFARER_TRAIL inyecta el tread y LONG_WATCH el streak) ⇒ 2 clientes con el MISMO snapshot+reloj convergen byte-a-byte (misma cobertura/tier/buff, 0 desync).
//   · CÓMPUTO DE COBERTURA = función PURA (frontierCoverage): agrupa N posiciones en sub-celdas de cellSize px y devuelve |celdas distintas|. Casos borde byte-verificables:
//     1 jugador ⇒ cover 1; N amontonados en la MISMA sub-celda ⇒ cover 1 (NO abre — distingue de Congregación); N repartidos en ≥2 sub-celdas ⇒ cover ≥2 (abre).
//   · PROYECCIÓN determinista al `now`: cover_now = cover · 0.5^((now−atMs)/halfLife) (DECAE cuando la cobertura BAJA, mismo half-life estilo #52/#54, 0 RNG, 0 histéresis)
//     ⇒ N clientes convergen. Techo capCover evita crecimiento ilimitado.
//   · TIERS por UMBRAL de SUB-CELDAS DISTINTAS ocupadas (deterministas, monótonos): <2 ⇒ Tier 0 (sin efecto); ≥2 ⇒ T1; ≥3 ⇒ T2; ≥4 ⇒ T3. Cruzar arriba abre la Expedición;
//     el decay al bajar cobertura la baja de tier. 1 jugador (o todos amontonados) NUNCA abre — premia REPARTIRSE / sostener frontera.
//   · PASSIVE COMPARTIDO (frontera): TODO jugador presente en una zona en Expedición (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal RESTED_XP restedMult).
//     Emergente, sin binding: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: FRONTIER_SPREAD es la MÁS BAJA del canal restedMult (10ª y última fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL >
//     PULSE > CONGREGATION > WAYFARER > DIVERSE_COMPANY > LONG_WATCH ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten.
//   · INDICADOR $0-arte: badge de texto "Expedición: <zona> T<n>" (reusa la fila de badges + glifo procedural ⌗ = malla de sub-celdas cubiertas), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickFrontier jamás corre (Date.now nunca se llama), G.frontier/G.frontierServer NUNCA se crean, frontierMul RETURN 0, frontierTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL, 0 hotkey). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const FRONTIER_SPREAD = {
  enabled: true,             // CAS-2348 LIVE FLIP (EVO#55, CEO Gate APPROVED; QA DARK 14/14 ×2 build c4a549ae2fa1). false→true (config-only 1-línea, reversible true→false = DARK). Mirror LONG_WATCH/WAYFARER_TRAIL/CONGREGATION/DIVERSE_COMPANY/WORLD_PULSE/SOUL_RECOVERY flips.
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH (ver frontierMul). CEO balance knob.
  cellSize: 128,             // lado del bucket COARSE en px (4 tiles de 32px) — MISMO grid que WAYFARER_TRAIL.cellSize (reuso). Sub-celda = unidad de cobertura. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden sostener una Expedición (mirror CONGREGATION/WORLD_PULSE/LONG_WATCH.zones — reusa las zonas de caza).
  halfLifeSec: 45,           // vida-media del DECAY determinista (sin RNG) de la cobertura al BAJAR: cae a la mitad cada 45s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capCover: 8,               // techo de la cobertura proyectada (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  // TABLA de tiers: umbral de SUB-CELDAS DISTINTAS ocupadas (min, inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ cover. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — frontera naciente (≥2 sub-celdas distintas): pasivo suave.
    { min: 3, boost: 0.10 },   // Tier 2 — frontera firme (≥3 sub-celdas): pasivo medio.
    { min: 4, boost: 0.15 },   // Tier 3 — frontera plena (≥4 sub-celdas): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2352: AFLUENCIA / INFLUX SURGE (DARK, INFLUX_SURGE) — EVO mecánica #56. Eje FRESCO: TASA DE LLEGADA (flujo/afluencia) — cuántos jugadores NUEVOS CRUZAN HACIA una zona
// por ventana de tiempo. Ortogonal a todo el arco: ≠ Congregación #51 (headcount/densidad, *cuántos están*), ≠ Sendero #52 (footfall acumulado por celda, *camino*), ≠
// Confluencia #53 (variedad de clases, *qué tan distintos*), ≠ Vigilia #54 (continuidad temporal, *cuánto tiempo seguido*), ≠ Expedición #55 (dispersión espacial, *cómo se
// reparten*), ≠ World Pulse #50 (reloj global). Aquí importa el FLUJO / la DERIVADA: el RITMO de ENTRADAS (transiciones fuera→dentro de la zona), no el stock presente.
//   · SERVER-AUTHORITATIVE (fuente de verdad del flujo): el server, por zona, detecta las LLEGADAS = jugadores cuyo id NO estaba dentro en el snapshot previo y AHORA sí
//     (transición de borde, EDGE-triggered). Acumula esas llegadas en un `surge` (intensidad de afluencia) y empuja { zona → { surge, atMs } }; el cliente sólo lo REFLEJA +
//     PROYECTA al `now` compartido con DECAY determinista (0 confianza). En Stage-1 el snapshot se inyecta por hook (mismo patrón que FRONTIER_SPREAD inyecta la cobertura y
//     LONG_WATCH el streak) ⇒ 2 clientes con el MISMO snapshot+reloj convergen byte-a-byte (mismo surge/tier/buff, 0 desync).
//   · CÓMPUTO DE LLEGADAS = función PURA (influxArrivals): dados los ids DENTRO antes y AHORA, cuenta |ids nuevos| (presentes ahora y NO antes). Casos borde byte-verificables:
//     prev==now (MISMA multitud quieta, aunque sean 50) ⇒ 0 llegadas (NO abre — distingue de Congregación, que SÍ abre por headcount); todos ids nuevos ⇒ llegadas=|now| (abre).
//   · ACUMULADOR con DECAY (mirror #55/#54/#52): cada llegada SUMA al surge; el surge DECAE vida-media halfLifeSec al parar el flujo (surge_now = surge·0.5^((now−atMs)/halfLife),
//     0 RNG, 0 histéresis, techo capSurge) ⇒ N clientes convergen. Una multitud que DEJA de recibir recién-llegados ve su surge caer a 0 (el flujo es TRANSITORIO por diseño).
//   · TIERS por UMBRAL de surge proyectado (deterministas, monótonos): <2 ⇒ Tier 0 (sin efecto); ≥2 ⇒ T1; ≥4 ⇒ T2; ≥6 ⇒ T3. Cruzar arriba abre la Afluencia; el decay al parar
//     el flujo la baja de tier. 1 llegada suelta (o una multitud estática sin recién-llegados) NUNCA abre — premia atraer un FLUJO de recién-llegados / ondas de entrada.
//   · PASSIVE COMPARTIDO (afluencia): TODO jugador presente en una zona en Afluencia (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal RESTED_XP restedMult).
//     Emergente, sin binding: NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: INFLUX_SURGE es la MÁS BAJA del canal restedMult (11ª y última fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL > PULSE >
//     CONGREGATION > WAYFARER > DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten.
//   · INDICADOR $0-arte: badge de texto "Afluencia: <zona> T<n>" (reusa la fila de badges + glifo procedural ⇈ = flechas de entrada ascendentes), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickInflux jamás corre (Date.now nunca se llama), G.influx/G.influxServer NUNCA se crean, influxMul RETURN 0, influxTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL, 0 hotkey). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const INFLUX_SURGE = {
  enabled: true,             // LIVE (CAS-2353 flip EVO#56 Afluencia). Reversible 1-línea true→false + re-run overlay. CEO Gate APPROVED (QA DARK 14/14 ×2, 0-regr 7 flags).
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD (ver influxMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden sostener una Afluencia (mirror FRONTIER_SPREAD/CONGREGATION/LONG_WATCH.zones — reusa las zonas de caza).
  halfLifeSec: 30,           // vida-media del DECAY determinista (sin RNG) del surge al PARAR el flujo: cae a la mitad cada 30s (más rápido que Expedición #55=45s — el flujo es transitorio). Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capSurge: 10,              // techo del surge proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  // TABLA de tiers: umbral de surge (llegadas acumuladas proyectadas, min inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ surge. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — afluencia naciente (≥2 recién-llegados en la ventana): pasivo suave.
    { min: 4, boost: 0.10 },   // Tier 2 — afluencia firme (≥4): pasivo medio.
    { min: 6, boost: 0.15 },   // Tier 3 — oleada/surge plena (≥6): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2355: SINCRONÍA DE BATALLA / BATTLE SYNCHRONY (DARK, BATTLE_SYNC) — EVO mecánica #57. Eje FRESCO: CORRELACIÓN / SIMULTANEIDAD de gestas de combate — cuántos jugadores
// DISTINTOS co-presentes anotan una GESTA (kill) dentro de la MISMA ventana deslizante corta. Ortogonal a todo el arco: ≠ Congregación #51 (headcount/densidad, *cuántos están*),
// ≠ Sendero #52 (footfall/camino), ≠ Confluencia #53 (variedad de clases), ≠ Vigilia #54 (continuidad temporal, *cuánto tiempo seguido*), ≠ Expedición #55 (dispersión espacial),
// ≠ Afluencia #56 (tasa de LLEGADA/flujo), ≠ Mentor #48/Diverse #53 (nivel/clase). Aquí importa la CO-OCURRENCIA temporal de ACCIONES DE COMBATE entre jugadores distintos.
//   · SERVER-AUTHORITATIVE (fuente de verdad de la coordinación): el server, por zona, marca el instante de la ÚLTIMA gesta (kill) de cada jugador co-presente — REUSA el contador
//     monótono `h.kills` que YA existe (misma técnica que Libro/Ledger y MENTOR: 0 tracking nuevo por-frame, 0 hook, SIN input.js). Empuja { zona → { jugadorId → últimoKillMs } }; el
//     cliente sólo lo REFLEJA + PROYECTA al `now` compartido contando cuántos ids DISTINTOS tienen su última gesta DENTRO de la ventana deslizante [now−windowMs, now]. En Stage-1 el
//     snapshot+reloj se inyectan por hook (mismo patrón que INFLUX_SURGE/FRONTIER_SPREAD/LONG_WATCH) ⇒ 2 clientes con el MISMO snapshot+reloj convergen byte-a-byte (0 desync).
//   · CÓMPUTO = función PURA (syncCount): dado { id → últimoKillMs } y el `now`, cuenta |ids distintos con (now−últimoKillMs) ∈ [0, windowMs]|. Casos borde byte-verificables:
//     N presentes pero INACTIVOS (0 kills / sin marca) ⇒ 0 (NO abre — distingue de Congregación por headcount y de Afluencia por flujo); 2 que matan en ventanas SEPARADAS/no-solapadas
//     ⇒ en cualquier `now` sólo 1 cae en la ventana ⇒ synchrony 0 (es CORRELACIÓN temporal, no un rate acumulado); 1 solo matando ⇒ count 1 ⇒ NO abre (requiere ≥2 DISTINTOS).
//   · DECAY = expiración de la VENTANA DESLIZANTE (0 RNG, análogo a half-life): una gesta más vieja que windowSec deja de contar ⇒ el count cae determinista al parar el combate coordinado.
//   · TIERS por UMBRAL de jugadores sincronizados (deterministas, monótonos): <2 ⇒ Tier 0; ≥2 ⇒ T1; ≥3 ⇒ T2; ≥4 ⇒ T3. Cruzar arriba abre la Sincronía; que expiren las gestas la baja.
//   · PASSIVE COMPARTIDO: TODO jugador presente en una zona en Sincronía (tier≥1) recibe el MISMO Δ del tier (REUSA el canal RESTED_XP restedMult). Emergente, sin binding, NO per-hero,
//     NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: BATTLE_SYNC es la MÁS BAJA del canal restedMult (12ª y última fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION >
//     WAYFARER > DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD > INFLUX_SURGE ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten.
//   · INDICADOR $0-arte: badge de texto "Sincronía: <zona> T<n>" (reusa la fila de badges + glifo procedural ⇌ = espadas cruzadas sincronizadas), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickBattleSync jamás corre (Date.now nunca se llama), G.sync/G.syncServer/h.syncAt NUNCA se crean, syncMul RETURN 0, syncTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (reusa gestas/kills que YA existen, passive 100% AMBIENTAL, 0 hotkey). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const BATTLE_SYNC = {
  enabled: true,             // LIVE (CAS-2357 flip EVO#57, CEO Gate APPROVED). Reversible 1-línea true→false, mirror INFLUX_SURGE/FRONTIER_SPREAD/LONG_WATCH.
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE (ver syncMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden sostener una Sincronía (mirror INFLUX_SURGE/FRONTIER_SPREAD/CONGREGATION.zones — reusa las zonas de caza).
  windowSec: 5,              // ventana deslizante CORTA de la sincronía: una gesta cuenta si su instante cae en [now−windowSec, now]. Más vieja ⇒ expira (decay determinista, 0 RNG). Reloj de pared COMPARTIDO ⇒ misma ventana en N clientes. CEO balance knob.
  // TABLA de tiers: umbral de jugadores DISTINTOS sincronizados en la ventana (min inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ count. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — sincronía naciente (≥2 jugadores distintos matando en la ventana): pasivo suave.
    { min: 3, boost: 0.10 },   // Tier 2 — sincronía firme (≥3): pasivo medio.
    { min: 4, boost: 0.15 },   // Tier 3 — batalla plenamente sincronizada (≥4): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2356: MARCHA / CONVOY MARCH (DARK, CONVOY_MARCH) — EVO mecánica #57 (primer eje VECTORIAL/DIRECCIONAL de la serie). Eje FRESCO: COHERENCIA DIRECCIONAL de los vectores de
// VELOCIDAD de los jugadores en movimiento — la comunidad *marchando junta como convoy/caravana/migración*. Ortogonal a TODO el arco, que fue 100% ESCALAR: ≠ Congregación #51
// (headcount/densidad, *cuántos*), ≠ Sendero #52 (footfall acumulado, *camino histórico*), ≠ Confluencia #53 (variedad de clases), ≠ Vigilia #54 (continuidad temporal), ≠ Expedición
// #55 (dispersión/cobertura espacial), ≠ Afluencia #56 (tasa neta de llegadas = magnitud de cambio de población), ≠ World Pulse #50 (reloj). Aquí importa el RUMBO COMÚN INSTANTÁNEO
// del movimiento de los PRESENTES: no cuántos, no dónde, no desde-cuándo — hacia DÓNDE van juntos.
//   · SERVER-AUTHORITATIVE (fuente de verdad de la coherencia): el server, por zona por tick, toma los jugadores EN MOVIMIENTO (rapidez > minSpeed), SUMA sus vectores de velocidad y
//     compara la MAGNITUD del vector resultante contra la SUMA de rapideces individuales ⇒ coeficiente de coherencia c = |Σv| / Σ|v| ∈ [0,1] (c=1 todos mismo rumbo; c≈0 rumbos
//     dispersos/opuestos). Cuando ≥minMovers se mueven con c ≥ cThreshold de forma SOSTENIDA (acumulador con decay), la zona entra en Marcha por tiers y da a TODOS los presentes
//     el MISMO passive (RESTED_XP). Empuja { zona → { march, atMs } }; el cliente sólo lo REFLEJA + PROYECTA al `now` compartido (0 confianza). En Stage-1 el snapshot+reloj se inyectan
//     por hook (mismo patrón que INFLUX_SURGE/FRONTIER_SPREAD/LONG_WATCH) ⇒ 2 clientes con el MISMO snapshot+reloj convergen byte-a-byte (0 desync).
//   · CÓMPUTO DE COHERENCIA = función PURA (convoyCoherence): dado un set de vectores {vx,vy} y minSpeed, filtra los EN MOVIMIENTO (rapidez>minSpeed), suma vectores + rapideces y
//     devuelve { movers, c=|Σv|/Σ|v| }. Casos borde byte-verificables: todos QUIETOS (rapidez≤minSpeed) ⇒ movers 0 / c 0; 2 en rumbos OPUESTOS ⇒ |Σv|≈0 ⇒ c≈0; N mismo rumbo ⇒ c=1.
//   · ACUMULADOR SOSTENIDO con DECAY (mirror #56/#55/#54): mientras el convoy se sostiene (movers≥minMovers Y c≥cThreshold) el `march` SUBE (accruePerSec·dt); al FRENAR o DIVERGIR el
//     convoy, `march` NO acumula y DECAE por vida-media halfLifeSec (march_now = march·0.5^((now−atMs)/halfLife), 0 RNG, 0 histéresis, techo capMarch). El decay evita corte seco.
//   · TIERS por UMBRAL de `march` sostenido proyectado (deterministas, monótonos): <2 ⇒ Tier 0; ≥2 ⇒ T1; ≥4 ⇒ T2; ≥6 ⇒ T3. Requiere SOSTENER la coherencia varios ticks para abrir
//     (2s a accruePerSec=1). 1 jugador solo moviéndose (movers<minMovers) NUNCA abre; 2 en rumbos opuestos (c≈0) NUNCA abre — premia MARCHAR JUNTOS con rumbo común sostenido.
//   · PASSIVE COMPARTIDO (convoy): TODO jugador presente en una zona en Marcha (tier≥1) recibe el MISMO Δ del tier vigente (REUSA el canal RESTED_XP restedMult). Emergente, sin binding:
//     NO per-hero, NO clave serializada ⇒ byte-id OFF por CONSTRUCCIÓN (0 estado nuevo).
//   · PRECEDENCIA NO-stack / MÁXIMO ÚNICO: CONVOY_MARCH es la MÁS BAJA del canal restedMult (última fuente, tras CAS-2355 BATTLE_SYNC) ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL >
//     PULSE > CONGREGATION > WAYFARER > DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD > INFLUX_SURGE > BATTLE_SYNC ⇒ se aplica el MAYOR pasivo vigente, NUNCA doble-dip. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten.
//   · INDICADOR $0-arte: badge de texto "Marcha: <zona> T<n>" (reusa la fila de badges + glifo procedural ⇉ = flechas paralelas en el rumbo común del convoy), 0 arte nuevo.
// HARD-GATED: enabled:false ⇒ tickConvoy jamás corre (Date.now nunca se llama), G.convoy/G.convoyServer NUNCA se crean, convoyMul RETURN 0, convoyTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL emerge del movimiento existente, 0 hotkey/input nuevo). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const CONVOY_MARCH = {
  enabled: true,             // LIVE (CAS-2359 flip false→true, EVO#58; Gate CEO APPROVED byte-verify LIVE 310253B 9/9 flags served true 0-regr; config-only 1-línea, reversible, mirror INFLUX_SURGE/FRONTIER_SPREAD/LONG_WATCH/BATTLE_SYNC).
  channel: "restedMult",     // canal ÚNICO del passive — REUSA RESTED_XP. Precedencia: la MÁS BAJA del canal ⇒ cede a STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE/BATTLE_SYNC (ver convoyMul). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas que pueden sostener una Marcha (mirror INFLUX_SURGE/FRONTIER_SPREAD/CONGREGATION.zones — reusa las zonas de caza).
  minSpeed: 0.5,             // rapidez mínima (px/tick) para contar como EN MOVIMIENTO: por debajo el jugador está QUIETO y NO cuenta para la coherencia. CEO balance knob.
  minMovers: 3,              // K: nº mínimo de jugadores en movimiento coherente para sostener un convoy. <K ⇒ NO abre (1 solo moviéndose nunca abre). CEO balance knob.
  cThreshold: 0.6,           // umbral de coherencia direccional c∈[0,1]: el convoy sólo acumula si c≥este valor (rumbo común); rumbos dispersos/opuestos (c bajo) NO acumulan. CEO balance knob.
  halfLifeSec: 20,           // vida-media del DECAY determinista (sin RNG) del `march` al FRENAR/DIVERGIR el convoy: cae a la mitad cada 20s (el rumbo es instantáneo ⇒ decay ágil). Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capMarch: 12,              // techo del `march` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `march` acumulado por segundo de convoy coherente sostenido (con tiers 2/4/6 ⇒ 2s/4s/6s de marcha sostenida para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `march` sostenido (min inclusivo) → boost restedMult. Tier vigente = el más alto cuyo `min` ≤ march. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — convoy naciente (≥2s de marcha coherente sostenida): pasivo suave.
    { min: 4, boost: 0.10 },   // Tier 2 — convoy firme (≥4s): pasivo medio.
    { min: 6, boost: 0.15 },   // Tier 3 — gran marcha/migración (≥6s): pasivo pleno. CEO balance knobs.
  ],
};

// CAS-2362: CORDÓN DE GUARDIA / WARDING RING (DARK, WARDING_RING) — EVO mecánica #59. DOS pivotes FRESCOS a la vez:
//   (A) CANAL DE RECOMPENSA FRESCO = `wardRegen` (regen de HP fuera de combate). Las 12+ mecánicas #47–58 alimentaron TODAS el canal `restedMult` (bono XP en el seam de gainXP),
//       saturado con precedencia máximo-único. #59 abre un canal NUEVO ⇒ las futuras del arco podrán APILAR ENTRE canales (wardRegen ⊥ restedMult) sin ceder. wardRegen es un
//       MULTIPLICADOR de la tasa de regen de HP, enganchado en el MISMO chokepoint de curación que SAFEZONE.regenPct/templeMul (mhp*rate*dt vía pactHeal), pero con kind DISTINTO
//       para NO doblarse con el regen del Templo NI con ORDER_TERRITORY (ambos kind "safeRegen", zona-ciudad). Un Cordón abierto CREA regen de HP en una zona de caza (santuario móvil),
//       cosa que hoy NO existe fuera de la ciudad ⇒ 0 solape con el regen de ciudad. ORTOGONAL a restedMult por CONSTRUCCIÓN (canal/kind/seam distintos) ⇒ 0 doble-conteo aunque
//       coincida con cualquier tier del arco de XP.
//   (B) EJE FRESCO = COBERTURA ANGULAR / distribución de RUMBOS alrededor del centroide. Todos los ejes previos: headcount (#51), footfall (#52), variedad de clases (#53), continuidad
//       temporal (#54), dispersión/cobertura de CELDAS de ÁREA (#55), tasa de llegadas (#56), correlación temporal de gestas (#57), coherencia de VELOCIDAD lineal (#58), reloj (#50).
//       Aquí importa cómo se DISTRIBUYEN ANGULARMENTE las POSICIONES en torno a su centroide común — la comunidad formando un *anillo de guardia / cordón* que cubre todas las direcciones.
//   · SERVER-AUTHORITATIVE, 0-RNG: por zona por tick el server toma las posiciones de los presentes, calcula el CENTROIDE (media), y para cada jugador su RUMBO (ángulo) desde el centroide.
//     Los que caen DENTRO de `ringRadius` del centroide (amontonados en el núcleo) NO definen un rumbo ⇒ NO son parte del anillo. De los que SÍ (los del anillo), cuenta cuántos SECTORES
//     angulares DISTINTOS (de `sectors`) ocupan ⇒ cobertura = sectoresDistintos/sectors ∈ [0,1]. Anillo bien repartido en todas direcciones ⇒ cobertura ALTA; todos a un lado / en línea ⇒
//     cobertura BAJA. Cuando ≥minMembers en el anillo logran cobertura ≥coverThreshold de forma SOSTENIDA (acumulador con decay) → tier Cordón → pasivo `wardRegen` a TODOS los presentes.
//   · CÓMPUTO = función PURA (wardCoverage): dado un set de posiciones {x,y} devuelve { members, onRing, sectors, cover }. Casos borde byte-verificables: 1 jugador ⇒ centroide en él ⇒
//     onRing 0 / cover 0 (NO abre); N AMONTONADOS (todos dentro de ringRadius del centroide) ⇒ onRing 0 / cover 0 (NO abre, ≠ Congregación headcount); N en LÍNEA por el centroide ⇒ 2 sectores
//     ⇒ cover baja (NO abre, ≠ Expedición cobertura de ÁREA que SÍ abriría en línea); N REPARTIDOS en rumbos ⇒ muchos sectores ⇒ cover alta. Funciona con jugadores QUIETOS (≠ Convoy velocidad).
//   · ACUMULADOR SOSTENIDO con DECAY (mirror #58/#56/#55/#54): mientras el anillo se sostiene (onRing≥minMembers Y cover≥coverThreshold) `ward` SUBE (accruePerSec·dt); al romperse (se agrupan
//     a un lado o se van) NO acumula y DECAE por vida-media halfLifeSec (ward_now = ward·0.5^((now−atMs)/halfLife), 0 RNG, techo capWard). El decay evita corte seco.
//   · TIERS por UMBRAL de `ward` sostenido proyectado: <2 ⇒ T0; ≥2 ⇒ T1; ≥4 ⇒ T2; ≥6 ⇒ T3. Un Cordón abierto (tier≥1) regenera HP a regenPct×(1+boost del tier)×HPmax/s a los presentes.
//   · PRECEDENCIA máximo-único DENTRO del canal wardRegen: WARDING_RING es (por ahora) la ÚNICA fuente del canal ⇒ máximo-único trivial; documentado para que futuras del arco de-stackeen aquí.
//     ORTOGONAL a restedMult (seam gainXP) y a safeRegen (SAFEZONE/TERRITORY, kind distinto, zona-ciudad) ⇒ jamás dobla con NINGÚN canal previo.
//   · INDICADOR $0-arte: reusa la fila de badges de recuperación (glifo procedural ◯ = anillo de guardia), 0 arte nuevo. NO nueva moneda/balance: sólo un mult sobre un knob de regen YA vivo.
// HARD-GATED: enabled:false ⇒ tickWard jamás corre (Date.now nunca se llama), wardRegenTick RETURN inmediato, G.ward/G.wardServer NUNCA se crean, wardMul RETURN 0, wardTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL emerge de las posiciones existentes, 0 hotkey/input nuevo). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const WARDING_RING = {
  enabled: true,             // LIVE (EVO#59, flip CAS-2365, CEO Gate APPROVED). Reversible 1-línea true→false (mirror CONVOY_MARCH/INFLUX_SURGE/FRONTIER_SPREAD).
  channel: "wardRegen",      // canal FRESCO del passive — NO restedMult (XP). Multiplicador de la tasa de regen de HP. ORTOGONAL a restedMult (seam gainXP) y a safeRegen (SAFEZONE/TERRITORY, zona-ciudad). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza que pueden sostener un Cordón (mirror CONVOY_MARCH/INFLUX_SURGE/FRONTIER_SPREAD.zones — reusa las zonas de caza).
  sectors: 8,                // nº de sectores angulares (compás, 45° c/u) alrededor del centroide para medir la cobertura direccional del anillo. CEO balance knob.
  ringRadius: 40,            // px: distancia mínima del centroide para contar como parte del ANILLO. Dentro ⇒ estás en el NÚCLEO (no defines rumbo) ⇒ un amontonamiento tiene onRing 0 ⇒ NO abre. CEO balance knob.
  minMembers: 3,             // K: nº mínimo de jugadores EN EL ANILLO (fuera de ringRadius) para sostener un Cordón. <K ⇒ NO abre (1 solo / 2 opuestos nunca abren). CEO balance knob.
  coverThreshold: 0.375,     // cobertura angular mínima (fracción de sectores distintos ocupados) sostenida para acumular: 3 repartidos ~120° ⇒ 3/8=0.375 abre; en línea 2/8=0.25 NO; amontonados 0 NO. CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `ward` al romperse el anillo: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capWard: 12,               // techo del `ward` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `ward` acumulado por segundo de anillo sostenido (con tiers 2/4/6 ⇒ 2s/4s/6s de cordón sostenido para T1/T2/T3). CEO balance knob.
  regenPct: 0.03,            // fracción base de HP máx/s regenerada dentro de un Cordón abierto (mirror SAFEZONE.regenPct=0.045; el Cordón CREA regen en la zona de caza, ×(1+boost) por tier). CEO balance knob.
  // TABLA de tiers: umbral de `ward` sostenido (min inclusivo) → boost del canal wardRegen (mult adicional sobre regenPct). Tier vigente = el más alto cuyo `min` ≤ ward. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — cordón naciente (≥2s de anillo sostenido): regen suave (regenPct×1.05).
    { min: 4, boost: 0.10 },   // Tier 2 — cordón firme (≥4s): regen medio (regenPct×1.10).
    { min: 6, boost: 0.15 },   // Tier 3 — gran cordón de guardia (≥6s): regen pleno (regenPct×1.15). CEO balance knobs.
  ],
};

// CAS-2361: CAMARADERÍA / KINSHIP BOND (DARK, KINSHIP_BOND) — EVO mecánica #60. Otro CANAL FRESCO y otro EJE FRESCO, ambos ⊥ a todo lo previo:
//   (A) CANAL DE RECOMPENSA FRESCO = `goldFind` (bono de ORO al recoger monedas). El sub-arco `restedMult` (XP, seam gainXP) cerró en #58; #59 abrió `wardRegen` (HP-regen). #60 abre
//       un TERCER canal `goldFind`, un MULTIPLICADOR del oro recogido, enganchado en el chokepoint ÚNICO de pickup de monedas (tryPickup, d.kind==="gold"). ORTOGONAL a restedMult (XP) y a
//       wardRegen (HP) por CONSTRUCCIÓN (canal/seam distintos) ⇒ 0 doble-conteo; los canales del arco APILAN ENTRE sí (goldFind ⊥ wardRegen ⊥ restedMult) sin ceder, sólo de-stackean DENTRO de su canal.
//   (B) EJE FRESCO = PERSISTENCIA DE VÍNCULO / proximidad pareada SOSTENIDA en el tiempo. Ejes previos: headcount instantáneo (#51 Cong), footfall (#52), variedad de clases (#53), continuidad
//       de guardia (#54), dispersión de CELDAS de ÁREA (#55), tasa de llegadas (#56), correlación temporal de gestas (#57), coherencia de VELOCIDAD (#58), cobertura ANGULAR alrededor del centroide
//       (#59). Aquí importa cuántos PARES de jugadores DISTINTOS permanecen PRÓXIMOS (misma celda coarse o adyacente, Chebyshev≤1) de forma SOSTENIDA ⇒ vínculos que se forjan al QUEDARSE juntos.
//   · SERVER-AUTHORITATIVE, 0-RNG: por zona por tick el server toma las posiciones de los presentes, las asigna a una celda coarse (floor(x/cellSize),floor(y/cellSize)) y cuenta los PARES (i<j)
//     cuyas celdas distan Chebyshev≤1 (misma o adyacente = próximos). `kinshipPairs(positions)` = { members, pairs } es PURA. Mientras ≥minPairs pares se sostienen, `kinship` SUBE (accruePerSec·dt);
//     al romperse (se separan o se van) NO acumula y DECAE por vida-media halfLifeSec (kinship_now = kinship·0.5^((now−atMs)/halfLife), 0 RNG, techo capKinship). El decay evita corte seco.
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA):
//       ≠ CONGREGATION (headcount INSTANTÁNEO): 4 juntos 1 tick ⇒ pairs alto pero kinship≈accruePerSec·dt (ínfimo) < 2 ⇒ Tier 0 ⇒ NO abre; hace falta PERMANENCIA (acumulador sostenido).
//       ≠ CONVOY_MARCH (coherencia direccional en MOVIMIENTO): sólo usa POSICIONES ⇒ QUIETOS juntos SÍ cuentan (Convoy exige rumbo común; aquí no).
//       ≠ INFLUX (tasa de LLEGADA): pasar de largo ⇒ pares efímeros ⇒ decae ⇒ NO abre; hay que QUEDARSE.
//       ≠ WARDING_RING (cobertura ANGULAR / anillo REPARTIDO): N AMONTONADOS ⇒ Warding onRing 0 (NO abre) pero KINSHIP pairs=C(N,2) alto (SÍ abre) ⇒ respuesta OPUESTA al agrupamiento ⇒ ⊥.
//       1 solo ⇒ 0 pares ⇒ NO abre. 2 lejos (Chebyshev≥2) ⇒ 0 pares ⇒ NO abre.
//   · TIERS por UMBRAL de `kinship` sostenido: <2 ⇒ T0; ≥2 ⇒ T1; ≥4 ⇒ T2; ≥6 ⇒ T3. Un vínculo forjado (tier≥1) da +boost de oro (goldFind) a los presentes al recoger monedas en la zona.
//   · PRECEDENCIA máximo-único DENTRO del canal goldFind: KINSHIP_BOND es (por ahora) la ÚNICA fuente ⇒ máximo-único trivial; documentado para que futuras del arco de-stackeen aquí. ⊥ a wardRegen/restedMult.
//   · INDICADOR $0-arte: reusa la fila de badges de recuperación (glifo procedural ⚭ = vínculo pareado), 0 arte nuevo. NO nueva moneda: sólo un mult sobre el oro YA existente en el pickup.
// HARD-GATED: enabled:false ⇒ tickKinship jamás corre (Date.now nunca se llama), G.kinship/G.kinshipServer NUNCA se crean, kinshipMul RETURN 0 (pickup de oro byte-idéntico), kinshipTag ""
// ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL emerge de las posiciones existentes, 0 hotkey/input nuevo). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const KINSHIP_BOND = {
  enabled: true,             // LIVE (EVO#60, CAS-2367 flip). Reversible 1-línea true→false. SERIALIZADO tras el flip LIVE de #59 (WARDING_RING) verificado LIVE por post-flip QA CAS-2366 (anti-stacking: 1 arco valida a la vez).
  channel: "goldFind",       // canal FRESCO del passive — NO restedMult (XP), NO wardRegen (HP). Multiplicador del ORO recogido en el pickup de monedas. ⊥ a los otros dos canales. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza que pueden forjar un vínculo (mirror WARDING_RING.zones — reusa las zonas de caza).
  cellSize: 128,             // px: lado de la celda coarse de proximidad. Dos jugadores en la MISMA celda o en una ADYACENTE (Chebyshev≤1) forman un PAR próximo. Mismo grid coarse que Expedición/Sendero. CEO balance knob.
  minPairs: 1,               // nº mínimo de PARES próximos sostenidos para acumular vínculo. 1 solo ⇒ 0 pares ⇒ nunca; pares efímeros que se cruzan ⇒ decaen ⇒ nunca. CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `kinship` al romperse los pares: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capKinship: 12,            // techo del `kinship` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `kinship` acumulado por segundo de pares sostenidos (con tiers 2/4/6 ⇒ 2s/4s/6s de vínculo sostenido para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `kinship` sostenido (min inclusivo) → boost del canal goldFind (fracción extra de oro al recoger). Tier vigente = el más alto cuyo `min` ≤ kinship. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — vínculo naciente (≥2s de pares sostenidos): +5% oro.
    { min: 4, boost: 0.10 },   // Tier 2 — vínculo firme (≥4s): +10% oro.
    { min: 6, boost: 0.15 },   // Tier 3 — gran camaradería (≥6s): +15% oro. CEO balance knobs.
  ],
};

// CAS-2369: TROTAMUNDOS / WAYFARER (DARK, WAYFARER_ROAM) — EVO mecánica #61. EJE FRESCO + CANAL FRESCO, ambos OPUESTOS/⊥ a #60 Kinship y a todo lo enviado #47-60:
//   (A) EJE FRESCO = AMPLITUD DE EXPLORACIÓN INDIVIDUAL (roaming breadth). server-authoritative, 0-RNG: por jugador el server registra su POSICIÓN (ya telemetrada) como una CELDA
//       COARSE con marca de tiempo y cuenta el nº de CELDAS DISTINTAS que ocupa dentro de una VENTANA temporal DESLIZANTE [now−windowSec, now]. `wayRoamBreadth(marks,now,win)` PURA.
//       El decay es EXPIRACIÓN de ventana (marcas viejas caen fuera ⇒ dejan de contar), 0-RNG determinista. Reusa las posiciones ⇒ NO input.js, sin hotkey (100% ambiental).
//   (B) CANAL PASIVO FRESCO = `oocMitigation` (mitigación de daño FUERA DE COMBATE). DISTINTO de restedMult (XP), soulRecovery/wardRegen (HP), goldFind (oro). Un golpe que aterriza
//       estando el héroe FUERA de combate (h._roamCombatT<=0) se MITIGA por `wayRoamMul` (fracción); ese golpe ARMA la ventana de combate (combatWindowSec) ⇒ los golpes SIGUIENTES
//       NO se mitigan (ya en combate). El Trotamundos avezado esquiva mejor la EMBOSCADA/primer golpe. 🔑 DESACOPLADO del movimiento (NO toca move-speed ⇒ 0 feedback runaway breadth→speed→breadth
//       y 0 riesgo de desync 2-cliente). Máx-único DENTRO de su canal (WAYFARER_ROAM única fuente ⇒ trivial); coexiste ⊥ con restedMult/goldFind/wardRegen (0 doble-conteo, seams distintos).
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA):
//       ≠ KINSHIP_BOND (#60, proximidad pareada SOSTENIDA): OPUESTO — premia MOVERSE y cubrir terreno, no quedarse junto a otro. Quieto ⇒ 1 sola celda ⇒ breadth 1 < 2 ⇒ NO abre. 1 jugador SOLO basta.
//       ≠ CONVOY_MARCH (#58, rumbo común grupal): INDIVIDUAL y SIN importar dirección; moverse en CÍRCULOS cubriendo celdas distintas ⇒ cuenta (Convoy exige coherencia direccional entre varios).
//       ≠ CONGREGATION (headcount) / WARDING_RING (#59, cobertura angular alrededor de centroide): NO es sobre otros jugadores ni ángulos; es amplitud de celdas PROPIAS de UN jugador.
//       ≠ INFLUX_SURGE (#56, tasa de LLEGADA): NO es llegar a una zona; es cubrir muchas celdas DISTINTAS dentro de la ventana. Patrullar 1 celda / quedarse quieto ⇒ NO; cruzar muchas ⇒ SÍ.
//   · TIERS por nº de CELDAS DISTINTAS/ventana: <2 ⇒ T0; ≥2 ⇒ T1; ≥3 ⇒ T2; ≥4 ⇒ T3. Un roam abierto (tier≥1) da −mit de daño fuera de combate al jugador presente en una zona de caza.
//   · INDICADOR $0-arte: reusa la fila de badges de recuperación (glifo procedural ⇈ = brújula/rumbo abierto), 0 arte nuevo. El pasivo es un MULT sobre el daño YA existente en damageHero (sin nuevo sistema).
// HARD-GATED: enabled:false ⇒ tickWayfarerRoam jamás corre (Date.now nunca se llama), G.wayRoam/G.wayRoamServer NUNCA se crean, wayRoamMul RETURN 0 (damageHero byte-idéntico: real intacto),
// h._roamCombatT NUNCA se escribe (fuera del allowlist de serializeSave), wayRoamTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js. Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const WAYFARER_ROAM = {
  enabled: true,             // LIVE (EVO#61) — flip CAS-2373 tras CEO Gate APPROVED (CAS-2369) + serializado tras #60 KINSHIP_BOND LIVE. Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez.
  channel: "oocMitigation",  // canal PASIVO FRESCO — NO restedMult (XP), NO wardRegen/soulRecovery (HP), NO goldFind (oro). Mitigación de daño FUERA DE COMBATE en el sink damageHero. ⊥ a los demás canales. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el pasivo aplica (mirror KINSHIP_BOND.zones — reusa las zonas de caza; la ciudad/SAFEZONE queda fuera).
  cellSize: 128,             // px: lado de la celda coarse de roaming. Cruzar a una celda DISTINTA suma amplitud; quedarse dentro de la misma no. Mismo grid coarse que Kinship/Expedición/Sendero. CEO balance knob.
  windowSec: 20,             // ventana DESLIZANTE (s): sólo cuentan las celdas ocupadas en los últimos 20s. Marca vieja ⇒ expira ⇒ deja de contar (decay 0-RNG por expiración). Reloj de pared COMPARTIDO ⇒ misma ventana en N clientes. CEO balance knob.
  combatWindowSec: 3,        // s que un golpe recibido te mantiene EN COMBATE: mientras h._roamCombatT>0 el pasivo NO mitiga (sólo el 1er golpe de la refriega, estando fuera de combate). CEO balance knob.
  maxMitigation: 0.15,       // techo de seguridad de la fracción mitigada (los tiers saturan en 0.15; cap defensivo anti-inmunidad). CEO balance knob.
  // TABLA de tiers: umbral de CELDAS DISTINTAS/ventana (min inclusivo) → mit del canal oocMitigation (fracción de daño mitigada fuera de combate). Tier vigente = el más alto cuyo `min` ≤ breadth. Determinista, monótono.
  tiers: [
    { min: 2, mit: 0.05 },   // Tier 1 — errante (≥2 celdas distintas/ventana): −5% daño fuera de combate.
    { min: 3, mit: 0.10 },   // Tier 2 — trotamundos (≥3 celdas): −10%.
    { min: 4, mit: 0.15 },   // Tier 3 — gran explorador (≥4 celdas): −15%. CEO balance knobs.
  ],
};

// CAS-2370: FUEGO CONCENTRADO / FOCUS FIRE (DARK, FOCUS_FIRE) — EVO mecánica #62. EJE FRESCO; reusa el canal goldFind de #60 con de-stacking máximo-único (extensión ANTICIPADA por KINSHIP_BOND).
//   NOTA de NUMERACIÓN: co-asignada con CAS-2369 (Trotamundos / WAYFARER_ROAM) que reclama #61 y ya está construida DARK (más avanzada, meta canónica del arco). FOCUS_FIRE renumera a #62 para
//   evitar colisión; ambas coexisten DARK y se SERIALIZAN para el flip (1 arco valida a la vez). Pendiente confirmación CTO/CEO del split #61(Wayfarer)/#62(Focus).
//   (A) EJE FRESCO = CONCENTRACIÓN DE OBJETIVO (focus-fire): cuántos jugadores DISTINTOS concentran su ataque sobre el MISMO enemigo A LA VEZ, de forma SOSTENIDA. server-authoritative, 0-RNG:
//       por zona por tick el server toma las ASIGNACIONES { jugador → objetivo } de los presentes en combate, las agrupa por objetivo y toma el MÁXIMO nº de atacantes DISTINTOS sobre un único
//       objetivo (`focusConcentration(assignments)` = { members, conc } PURA). Mientras conc≥minFocus se sostiene ACUMULA `focus` (accruePerSec·dt) con DECAY vida-media; al dispersarse decae. 0 input.js.
//   (B) CANAL = `goldFind` (REUSA el de KINSHIP_BOND #60; NO restedMult/XP, NO wardRegen/HP). Un fuego concentrado abierto (tier≥1) da +boost de oro al recoger monedas en la zona: los despojos de
//       una presa abatida en concentración son más ricos. PRECEDENCIA máximo-único DENTRO de goldFind: FOCUS_FIRE es la fuente MÁS NUEVA ⇒ CEDE (return 0) a KINSHIP_BOND (aplica el MAYOR, 0 doble-conteo).
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA — el eje usa ASIGNACIÓN DE OBJETIVO, no posiciones/velocidad/headcount):
//       ≠ KINSHIP_BOND (#60, proximidad pareada): usa OBJETIVOS, no posiciones ⇒ jugadores DISPERSOS (lejos, 0 pares) todos sobre el MISMO objetivo ⇒ FOCUS abre, KINSHIP cerrado (OPUESTO). Y amontonados
//         sobre objetivos DISTINTOS ⇒ KINSHIP abre (pares altos), FOCUS cerrado (conc 1). Respuestas OPUESTAS al mismo agrupamiento ⇒ ⊥. (Comparten canal goldFind ⇒ de-stack máximo-único, jamás doblan.)
//       ≠ BATTLE_SYNC (#57, correlación temporal de GESTAS/kills en ventana): FOCUS = atacantes CONCURRENTES sobre un objetivo VIVO (sin kill); 3 sobre un jefe que aún no muere ⇒ FOCUS abre, SYNC cerrado.
//         Y 3 matando cada uno su propio mob en la ventana ⇒ SYNC abre, FOCUS cerrado (objetivos distintos ⇒ conc 1). OPUESTO.
//       ≠ CONGREGATION (#51, headcount): N presentes atacando objetivos DISTINTOS ⇒ conc 1 < minFocus ⇒ NO abre (Cong abre por headcount). Hace falta OBJETIVO COMPARTIDO, no sólo presencia.
//       ≠ CONVOY_MARCH (#58, coherencia de velocidad): ignora el movimiento ⇒ QUIETOS martillando un objetivo ⇒ FOCUS abre, Convoy cerrado (sin rumbo).  1 solo ⇒ conc 1 ⇒ NO abre. 1 tick efímero ⇒ decae ⇒ NO.
//   · TIERS por UMBRAL de `focus` sostenido: <2 ⇒ T0; ≥2 ⇒ T1; ≥4 ⇒ T2; ≥6 ⇒ T3 (2s/4s/6s de concentración sostenida). Determinista, monótono.
//   · INDICADOR $0-arte: reusa la fila de badges de recuperación (glifo procedural ⊙ = retícula/objetivo concentrado), 0 arte nuevo. NO nueva moneda: sólo un mult sobre el oro YA existente en el pickup.
// HARD-GATED: enabled:false ⇒ tickFocus jamás corre (Date.now nunca se llama), G.focus/G.focusServer NUNCA se crean, focusMul RETURN 0 (pickup de oro byte-idéntico), focusTag "" ⇒ sim + save.v1 +
// worldFingerprint BYTE-IDÉNTICOS a HEAD. SIN tocar input.js (passive 100% AMBIENTAL emerge de las asignaciones de objetivo existentes). Reversible 1-línea. Los NÚMEROS = balance del CEO.
export const FOCUS_FIRE = {
  enabled: true,             // LIVE (EVO#62) — flip CAS-2375 tras CEO Gate APPROVED (CAS-2370) + serializado tras #61 WAYFARER_ROAM LIVE&closed (CAS-2373, build ad87e26206c3, postQA PASS 31/31 ×2). Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez.
  channel: "goldFind",       // canal del passive — REUSA goldFind (bono de oro) de KINSHIP_BOND #60. NO restedMult (XP), NO wardRegen (HP). Máximo-único DENTRO de goldFind: FOCUS_FIRE cede a KINSHIP_BOND. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza que pueden sostener un fuego concentrado (mirror KINSHIP_BOND.zones — reusa las zonas de caza).
  minFocus: 2,               // nº mínimo de jugadores DISTINTOS concentrando fuego sobre el MISMO objetivo para acumular. 1 solo ⇒ conc 1 < 2 ⇒ nunca; objetivos dispersos ⇒ conc 1 ⇒ nunca. CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `focus` al dispersarse la concentración: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capFocus: 12,              // techo del `focus` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `focus` acumulado por segundo de concentración sostenida (con tiers 2/4/6 ⇒ 2s/4s/6s para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `focus` sostenido (min inclusivo) → boost del canal goldFind (fracción extra de oro al recoger). Tier vigente = el más alto cuyo `min` ≤ focus. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — fuego naciente (≥2s de concentración): +5% oro.
    { min: 4, boost: 0.10 },   // Tier 2 — fuego firme (≥4s): +10% oro.
    { min: 6, boost: 0.15 },   // Tier 3 — descarga concentrada (≥6s): +15% oro. CEO balance knobs.
  ],
};

// CAS-2377: SENDERO / TRAILCRAFT (DARK, TRAILCRAFT) — EVO mecánica #63. EJE FRESCO + CANAL FRESCO, ambos ⊥/OPUESTOS a todo lo enviado #47-62:
//   (A) EJE FRESCO = DIVERSIDAD DE TERRENO (variedad CUALITATIVA): el jugador ACUMULA `trailcraft` según el nº de TIPOS de bioma/tile DISTINTOS que PISA dentro de una
//       ventana deslizante. server-authoritative, 0-RNG, INDIVIDUAL (per-pid). El server registra las marcas de bioma { pid → [{b,t}] } (b = zona/bioma pisado, derivado
//       de zoneOf), computa `trailVariety(marks,now,win)` = nº de TIPOS DISTINTOS en la ventana (PURA), y mientras variety≥minVariety ACUMULA `trailcraft` (accruePerSec·dt)
//       con DECAY vida-media (familia acumulador tick/accrue/step de #55-62). Empuja { pid → { craft, atMs } }; el cliente REFLEJA + PROYECTA al `now` compartido.
//   (B) CANAL FRESCO = `lootQuality` (RAREZA/calidad del drop, NO cantidad de oro): con trailcraft abierto (tier≥1) el server SUBE el PISO de rareza (`minR`) del gear que dropea
//       el jugador local en la zona ⇒ los botines son de mejor CALIDAD, no más oro. Seam = el `minR` (floor) de `rollGearInst` en la rama de drop de basura de killEnemy (chokepoint
//       de loot EXISTENTE). ⊥ goldFind (Kinship/Focus, cantidad de oro) ⊥ restedMult (XP) ⊥ wardRegen (HP) ⊥ oocMitigation (Wayfarer) ⊥ convoy velocidad ⇒ 0 doble-conteo, 0 runaway
//       (NO move-speed). PRECEDENCIA máximo-único DENTRO de lootQuality: TRAILCRAFT es (por ahora) la ÚNICA fuente ⇒ trivial (documentado para que futuras del arco de-stackeen aquí).
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA — el eje usa VARIEDAD de tipos, no cantidad/posición/velocidad/headcount):
//       ≠ WAYFARER_ROAM (#61, AMPLITUD = celdas coarse DISTINTAS recorridas): OPUESTO — Wayfarer paga CUÁNTO se movió (distancia/celdas); Trailcraft paga la VARIEDAD de terreno. Dar
//         vueltas en UN solo bioma cubriendo MUCHAS celdas ⇒ Wayfarer alto, Trailcraft variety 1 < minVariety ⇒ NUNCA acumula (cerrado). Cruzar 4 biomas distintos ⇒ Trailcraft abre.
//       ≠ FRONTIER_SPREAD (#55, DISPERSIÓN grupal / cobertura espacial de la comunidad): INDIVIDUAL, no grupal, y CUALITATIVO (tipos), no área cubierta.
//       ≠ CONGREGATION (#51, headcount) / KINSHIP (#60, proximidad pareada): no es sobre otros jugadores; es la variedad de terreno PROPIA de UN jugador.
//       ≠ 1-tick efímero: variety≥minVariety 1 tick (dt=0.5) ⇒ trailcraft≈accruePerSec·0.5 < 2 ⇒ Tier 0 ⇒ NO abre (hace falta PERMANENCIA sostenida). Decae vida-media al dejar de variar.
//   · TIERS por UMBRAL de `trailcraft` sostenido → PASOS de piso de rareza: <2 ⇒ T0 (0 pasos); ≥2 ⇒ T1 (+1 piso); ≥4 ⇒ T2 (+1); ≥6 ⇒ T3 (+2). Determinista, monótono.
//   · INDICADOR $0-arte: badge procedural ⟿ (sendero serpenteante), 0 arte nuevo. NO nueva moneda/loot-table: sólo eleva el `minR` YA existente de rollGearInst en el drop.
// HARD-GATED: enabled:false ⇒ tickTrailcraft jamás corre (Date.now nunca se llama), G.trail/G.trailServer/G.trailMarks NUNCA se crean, trailcraftFloor RETURN "" ⇒ `minR`=undefined en rollGearInst
// (drop de gear BYTE-IDÉNTICO a HEAD), trailcraftTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS. SIN tocar input.js (passive 100% AMBIENTAL emerge del traversal). Reversible 1-línea. NÚMEROS = balance del CEO.
export const TRAILCRAFT = {
  enabled: true,             // LIVE (EVO#63, CAS-2378) — flip config-only false→true tras QA DARK PASS 19/19 ×2 + CEO Gate APPROVED. Reversible 1-línea true→false.
  channel: "lootQuality",    // canal FRESCO del passive — sube la RAREZA/calidad del drop (piso `minR` de rollGearInst), NO cantidad de oro. ⊥ goldFind/restedMult/wardRegen/oocMitigation. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el pasivo de calidad aplica al drop (mirror WAYFARER_ROAM.zones — la ciudad/SAFEZONE queda fuera).
  windowSec: 30,             // ventana deslizante (s) para contar TIPOS de bioma distintos pisados. CEO balance knob.
  minVariety: 2,             // nº mínimo de TIPOS de bioma DISTINTOS en la ventana para ACUMULAR. 1 solo bioma (vueltas en un sitio) ⇒ variety 1 < 2 ⇒ nunca. CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `trailcraft` al dejar de variar terreno: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capCraft: 12,              // techo del `trailcraft` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `trailcraft` acumulado por segundo con variedad sostenida (con tiers 2/4/6 ⇒ 2s/4s/6s para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `trailcraft` sostenido (min inclusivo) → `steps` = PASOS de subida del piso de rareza del drop (0 = sin efecto). Tier vigente = el más alto cuyo `min` ≤ trailcraft. Determinista, monótono.
  tiers: [
    { min: 2, steps: 1 },    // Tier 1 — sendero naciente (≥2s de variedad): +1 piso de rareza (común → poco común).
    { min: 4, steps: 1 },    // Tier 2 — sendero firme (≥4s): +1 piso (se mantiene; el piso es potente).
    { min: 6, steps: 2 },    // Tier 3 — sendero maestro (≥6s): +2 pisos de rareza (común → raro). CEO balance knobs.
  ],
};

// CAS-2380: DELVE / DESCENSO (DARK, DELVE) — EVO mecánica #64. EJE FRESCO + CANAL FRESCO, ambos ⊥/OPUESTOS a todo lo enviado #47-63:
//   (A) EJE FRESCO = PROFUNDIDAD / DESCENSO VERTICAL (nº de BANDAS de profundidad DISTINTAS alcanzadas). server-authoritative, 0-RNG, INDIVIDUAL (per-pid). El server registra las marcas
//       de banda { pid → [{d,t}] } (d = BANDA de profundidad, derivada de ZONE_TIER[zoneOf].tier — 1..7, la elevación/zona-Z del mundo), computa `delveBands(marks,now,win)` = nº de BANDAS
//       DISTINTAS en la ventana (PURA), y mientras bands≥minBands ACUMULA `delve` (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-63). Empuja { pid → { delve, bands, atMs } };
//       el cliente REFLEJA + PROYECTA al `now` compartido. El TIER exige DOS umbrales: `delve`≥min (PERMANENCIA — 1-tick no basta) Y `bands`≥bandsReq (el EJE — nº de bandas). ⇒ tier MONÓTONO por nº de bandas.
//   (B) CANAL FRESCO = `critChance` (precisión ofensiva): con delve abierto (tier≥1) el server SUMA un bono de `critChance` (%) al golpe del héroe LOCAL, como TÉRMINO AISLADO en el seam de crit de killEnemy.
//       CAP DURO ABSOLUTO (critCapPct=50% = 0.5 abs) sobre el critChance TOTAL (base+delve) ⇒ corta runaway; NUNCA reduce el crit base (sólo AÑADE hasta el cap). ⊥ goldFind (Kinship/Focus) ⊥ restedMult (XP)
//       ⊥ wardRegen (HP) ⊥ oocMitigation (Wayfarer) ⊥ lootQuality (Trailcraft, rareza) ⇒ 0 doble-conteo, 0 runaway (NO move-speed). Único DENTRO de critChance (documentado para que futuras del arco de-stackeen aquí).
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA — el eje usa PROFUNDIDAD/bandas verticales, no diversidad/amplitud/densidad):
//       ≠ TRAILCRAFT (#63, DIVERSIDAD CUALITATIVA = nº de TIPOS de bioma DISTINTOS): dos zonas de MISMA banda (swamp/arena tier-4, o forest/…) suman +2 a la variedad de Trailcraft pero SÓLO +1 a las bandas de
//         Delve ⇒ ejes ORTOGONALES. Recorrer 4 biomas del MISMO tier ⇒ Trailcraft alto, Delve bands 1 < minBands ⇒ NUNCA abre. DESCENDER forest(1)→ruins(2)→caves(3)→abyss(5) ⇒ Delve abre, Trailcraft también pero por otro eje.
//       ≠ WAYFARER_ROAM (#61, AMPLITUD horizontal = celdas coarse distintas): Delve es VERTICAL (bandas de profundidad), NO área/distancia recorrida. Dar vueltas en 1 banda cubriendo muchas celdas ⇒ Wayfarer alto, Delve 0.
//       ≠ KINSHIP (#60, densidad sedentaria pareada) / CONGREGATION (#51, headcount): no es sobre otros jugadores; es la profundidad de descenso PROPIA de UN jugador.
//       ≠ posición ABSOLUTA: estar quieto en la banda MÁS profunda (abyss) ⇒ bands 1 < minBands ⇒ NO abre (el mérito es DESCENDER por VARIAS bandas, no estar hondo). Bajar y volver a la MISMA banda ⇒ bands no crece ⇒ NO sube tier.
//       ≠ 1-tick efímero: bands≥minBands 1 tick (dt=0.5) ⇒ delve≈accruePerSec·0.5 < 2 ⇒ Tier 0 (permanencia). Decae vida-media al dejar de descender.
//   · TIERS por (delve≥min ∧ bands≥bandsReq) → bono de critChance (%). Determinista, monótono por nº de bandas. Ver tabla.
//   · INDICADOR $0-arte: badge procedural ⏷ (escalera descendente), 0 arte nuevo. NO nueva stat: sólo SUMA al critChance YA existente del seam de crit, con CAP DURO.
// HARD-GATED: enabled:false ⇒ tickDelve jamás corre (Date.now nunca se llama), G.delve/G.delveServer/G.delveMarks NUNCA se crean, delveCritBonusPct RETURN 0 ⇒ el seam de crit queda BYTE-IDÉNTICO a HEAD
// (el `srand` de crit se consume EXACTAMENTE igual que sin la feature ⇒ RNG intacto), delveTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS. SIN tocar input.js (passive 100% AMBIENTAL emerge del descenso). Reversible 1-línea. NÚMEROS = balance del CEO.
export const DELVE = {
  enabled: true,             // LIVE (EVO#64) — flip CAS-2387 (CTO) tras QA DARK PASS 18/18 ×2 (CAS-2380, build c4a549ae2fa1) + CEO Gate. Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez. ERUDITION #65 sigue DARK (serializado, se flipa después).
  channel: "critChance",     // canal FRESCO del passive — sube la PROBABILIDAD de crítico (precisión ofensiva), NO daño/oro/HP/rareza. ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality. CAP DURO. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el pasivo de crit aplica (mirror TRAILCRAFT.zones/WAYFARER_ROAM.zones — la ciudad/SAFEZONE fuera). Sus bandas ZONE_TIER = {1,3,2,5,6,4} ⇒ 6 bandas DISTINTAS alcanzables (>minBands/T3-req 5). depthBandOf cubre las 7 bandas del mundo.
  windowSec: 30,             // ventana deslizante (s) para contar BANDAS de profundidad distintas alcanzadas. CEO balance knob.
  minBands: 2,               // nº mínimo de BANDAS DISTINTAS en la ventana para ACUMULAR delve. Quedarse en 1 banda (aunque sea la MÁS profunda) ⇒ bands 1 < 2 ⇒ nunca (no por posición absoluta). CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `delve` al dejar de descender: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capDelve: 12,              // techo del `delve` proyectado (evita crecimiento ilimitado; el tier lo cierra el nº de bandas). CEO balance knob.
  accruePerSec: 1,           // `delve` acumulado por segundo con bands≥minBands sostenido (con min 2/4/6 ⇒ 2s/4s/6s para la PERMANENCIA de T1/T2/T3). CEO balance knob.
  critCapPct: 50,            // CAP DURO ABSOLUTO del critChance TOTAL (base+delve) en % (≤ 0.5 abs). Corta runaway; el bono de delve NUNCA reduce el crit base — sólo AÑADE hasta el cap. CEO balance knob.
  // TABLA de tiers: un tier está vigente si `delve`≥min (PERMANENCIA/decay) Y `bands`≥bandsReq (EJE profundidad). Tier vigente = el más alto que cumple AMBOS. Determinista, monótono por nº de bandas.
  // `min` CRECE por tier ⇒ el decay vida-media del `delve` BAJA el tier gradualmente (T3→T2→T1→T0); `bands` es el TECHO (5+ bandas para T3). Con accruePerSec 1: sostener descenso ≥6s ⇒ delve≥6.
  tiers: [
    { min: 2, bands: 2, critPct: 8 },    // Tier 1 — descenso incipiente (≥2 bandas distintas, delve sostenido ≥2s): +8% crit.
    { min: 4, bands: 3, critPct: 15 },   // Tier 2 — descenso firme (3-4 bandas, delve≥4): +15% crit.
    { min: 6, bands: 5, critPct: 25 },   // Tier 3 — descenso profundo (5+ bandas, delve≥6): +25% crit (tope 50 abs). CEO balance knobs.
  ],
};

// CAS-2381: ERUDICIÓN / LOREKEEPER (DARK, ERUDITION) — EVO mecánica #65 (serializa tras #64 DELVE; el título de la issue dice "#64" pero DELVE aterrizó #64 primero — mismo patrón de colisión que #61/#62). EJE FRESCO + CANAL REUSADO, ⊥/OPUESTO a todo lo enviado #47-64:
//   (A) EJE FRESCO = DIVERSIDAD DE PRESAS / BESTIARY BREADTH (variedad CUALITATIVA de FOES abatidos). server-authoritative, 0-RNG, INDIVIDUAL (per-pid). El server registra las marcas de kill
//       { pid → [{k,t}] } (k = TIPO/especie de enemigo abatido, e.type), computa `loreVariety(marks,now,win)` = nº de TIPOS de enemigo DISTINTOS en la ventana (PURA), y mientras variety≥minVariety
//       ACUMULA `erudition` (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-64). El decay es half-life determinista (0-RNG). "El erudito cataloga bestias distintas".
//   (B) CANAL REUSADO = `xpGain` (multiplicador de experiencia por el ÚNICO chokepoint gainXP). El arco de canales FRESCOS saturó restedMult/goldFind/wardRegen/oocMitigation/lootQuality/critChance; xpGain
//       es un canal PRE-arco (FELLOWSHIP_BOND #47 LIVE). ERUDITION lo REUSA con PRECEDENCIA máximo-único (de-stack): si FELLOWSHIP tiene vínculo activo (fellowMul>0) ⇒ ERUDITION CEDE (return 0 ⇒ aplica el MAYOR,
//       0 doble-dip). Mirror EXACTO de FOCUS_FIRE #62 cediendo a KINSHIP #60 en goldFind. Con erudición abierta (tier≥1) y sin vínculo Hermandad, la XP de cada kill se multiplica por (1+boost) en gainXP.
//   · DIFERENCIADORES: OPUESTO a FOCUS_FIRE #62 (concentración en UN objetivo) — Erudición premia la VARIEDAD de presas. Distinto de Trailcraft #63 (variedad de TERRENO/bioma) — aquí es variedad de ENEMIGO
//     (a QUIÉN matas, no DÓNDE pisas). Distinto de BOUNTY/EMISSARY (cuentan kills de UN tipo objetivo) — Erudición cuenta TIPOS DISTINTOS. Matar el MISMO tipo repetido ⇒ variety 1 < minVariety ⇒ NUNCA abre
//     (hay que diversificar la caza); abatir 3 tipos distintos ⇒ abre. INDIVIDUAL (per-pid). 1-tick efímero: variety≥minVariety 1 tick (dt=0.5) ⇒ erudition≈0.5 < 2 ⇒ T0 (permanencia sostenida).
//   · TIERS por UMBRAL de `erudition` sostenido → boost de xpGain: <2 ⇒ T0 (×1); ≥2 ⇒ T1 (+5%); ≥4 ⇒ T2 (+10%); ≥6 ⇒ T3 (+15%). Determinista, monótono.
// HARD-GATED: enabled:false ⇒ tickErudition jamás corre (Date.now nunca se llama), G.lore/G.loreServer/G.loreMarks NUNCA se crean, eruditionMul RETURN 0 ⇒ gainXP BYTE-IDÉNTICO a HEAD (n·(1+fellow+0)=n·(1+fellow));
// eruditionTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS. SIN tocar input.js (passive 100% emerge del combate/kills). Reversible 1-línea. NÚMEROS = balance del CEO.
export const ERUDITION = {
  enabled: true,             // LIVE (EVO#65, CAS-2390 flip CTO) tras QA DARK PASS 19/19 ×2 (CAS-2381, build c4a549ae2fa1) + CEO Gate. Serializado tras #64 DELVE LIVE&verificado (build f4c877cf5725, DELVE:true). Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez. Canal xpGain de-stack cede a FELLOWSHIP #47.
  channel: "xpGain",         // canal REUSADO (multiplicador de XP por el chokepoint gainXP). De-stack máximo-único: ERUDITION cede a FELLOWSHIP_BOND (#47, más antigua). ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance (seams distintos). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el pasivo aplica (mirror TRAILCRAFT.zones/KINSHIP_BOND.zones — la ciudad/SAFEZONE fuera). El mul xpGain SE zone-gatea aquí (mirror kinshipMul/focusMul): el bono de XP aplica mientras cazas en la naturaleza (donde ocurren los kills).
  windowSec: 30,             // ventana deslizante (s) para contar TIPOS de enemigo distintos abatidos. CEO balance knob.
  minVariety: 3,             // nº mínimo de TIPOS de enemigo DISTINTOS en la ventana para ACUMULAR erudition. Matar SIEMPRE el mismo tipo ⇒ variety 1 < 3 ⇒ nunca (hay que diversificar la caza). CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `erudition` al dejar de diversificar la caza: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capLore: 12,               // techo del `erudition` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `erudition` acumulado por segundo con variedad sostenida (con tiers 2/4/6 ⇒ 2s/4s/6s para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `erudition` sostenido (min inclusivo) → `boost` = fracción de subida del multiplicador xpGain (0 = sin efecto). Tier vigente = el más alto cuyo `min` ≤ erudition. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.05 },   // Tier 1 — saber naciente (≥2s de variedad): +5% XP.
    { min: 4, boost: 0.10 },   // Tier 2 — saber firme (≥4s): +10% XP.
    { min: 6, boost: 0.15 },   // Tier 3 — saber maestro (≥6s): +15% XP. CEO balance knobs.
  ],
};

// CAS-2393: NOCTURNE / CAZADOR NOCTURNO (DARK, NOCTURNE_HUNT) — EVO mecánica #66 (serializa tras #65 ERUDITION LIVE). EJE FRESCO + CANAL REUSADO, ⊥/OPUESTO a todo lo enviado #47-65:
//   (A) EJE FRESCO = FASE TEMPORAL / CAZA NOCTURNA (nº de kills hechos DURANTE LA NOCHE en la ventana). server-authoritative, 0-RNG, INDIVIDUAL (per-pid). Es el PRIMER eje del arco anclado al RELOJ (fase día/noche),
//       NO al espacio (Delve profundidad / Trailcraft bioma / Wayfarer amplitud), ni a la presa (Erudition tipo), ni a otros jugadores (Kinship/Focus). El server registra marcas de kill { pid → [{n,t}] } (n=1 si el kill
//       cayó de NOCHE, 0 si de día — derivado de la FASE del reloj COMPARTIDO en el instante del kill, isNightAt(t)), computa `nightTally(marks,now,win)` = nº de marcas NOCTURNAS (n===1) en la ventana (PURA), y mientras
//       tally≥minKills ACUMULA `nocturne` (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-65). Los kills DIURNOS (n=0) NUNCA cuentan ⇒ cazar de día jamás abre (eje puramente TEMPORAL).
//   (B) CANAL REUSADO = `vamp` (robo de vida / lifesteal por el chokepoint del golpe melee del héroe — MISMO seam que la Sed de Sangre/Vampírico). Con caza nocturna abierta (tier≥1) el cazador roba una FRACCIÓN del daño melee
//       como curación. De-stack CON EL PROPIO VAMPÍRICO por SHARE-CAP (CEO decisión CAS-2394): la lifesteal EFECTIVA = min(vampCap, baseLifesteal + boostNocturno), TECHO DURO `vampCap` (≤0.5). Si el héroe ya tiene
//       Sed de Sangre/afijo (baseLifesteal) ⇒ Nocturne SÓLO añade hasta el techo compartido (0 doble-dip más allá del cap; ambos comparten el mismo ceiling 0.5 que buildBB ya aplica a bb.lifesteal). "El cazador nocturno bebe la sangre de sus presas bajo la luna".
//   · DIFERENCIADORES (ortogonalidad OBLIGATORIA — el eje usa la FASE del reloj, no espacio/presa/densidad):
//       ≠ ERUDITION (#65, DIVERSIDAD de presas): NOCTURNE cuenta CUÁNDO matas (de noche), NO a QUIÉN. Matar el MISMO tipo repetido de NOCHE ⇒ tally sube ⇒ ABRE (OPUESTO a Erudition, que exige tipos distintos y NO abriría).
//       ≠ DELVE (#64, profundidad) / TRAILCRAFT (#63, bioma) / WAYFARER (#61, amplitud): esos son ESPACIALES; NOCTURNE es TEMPORAL. Quieto de noche matando ⇒ ABRE (Wayfarer necesita amplitud ⇒ NO). Misma zona/banda ⇒ irrelevante.
//       ≠ FOCUS (#62) / KINSHIP (#60): no depende de otros jugadores ni objetivos; es la fase del reloj del kill PROPIO de UN jugador.
//       ≠ 1-tick efímero: tally≥minKills 1 tick (dt=0.5) ⇒ nocturne≈0.5 < 2 ⇒ Tier 0 (permanencia sostenida). Decae vida-media al amanecer / dejar de cazar de noche.
//   · TIERS por UMBRAL de `nocturne` sostenido → boost de lifesteal (fracción de daño melee curada, sobre el share-cap): <2 ⇒ T0 (0); ≥2 ⇒ T1 (+0.06); ≥4 ⇒ T2 (+0.12); ≥6 ⇒ T3 (+0.20). Determinista, monótono. Techo compartido vampCap≤0.5.
//   · INDICADOR $0-arte: badge procedural ☾ (luna creciente), 0 arte nuevo. NO nueva stat: sólo SUMA al lifesteal YA existente del seam del golpe melee (Sed de Sangre/Vampírico), con SHARE-CAP.
// HARD-GATED: enabled:false ⇒ tickNocturne jamás corre (Date.now nunca se llama), G.nocturne/G.nocturneServer/G.nocturneMarks NUNCA se crean, nocturneMul RETURN 0 ⇒ el seam melee lifesteal BYTE-IDÉNTICO a HEAD
// (nv=0 ⇒ eff===bb.lifesteal, que buildBB ya capa a ≤0.5 ⇒ min(cap,base)=base ⇒ heal intacto), nocturneTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS. SIN tocar input.js (passive 100% emerge del combate/kills nocturnos). Reversible 1-línea. NÚMEROS = balance del CEO.
export const NOCTURNE_HUNT = {
  enabled: true,             // LIVE (EVO#66, CAS-2396) — flip false→true tras QA DARK PASS 19/19 ×2 (build c4a549ae2fa1) + CEO Gate APPROVED (channel vamp, vampCap 0.5). Serializado tras #65 ERUDITION LIVE&verificado. Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez.
  channel: "vamp",           // canal REUSADO (robo de vida / lifesteal por el chokepoint del golpe melee del héroe). De-stack por SHARE-CAP con el Vampírico existente (Sed de Sangre/afijo): lifesteal EFECTIVA = min(vampCap, base+boost) ⇒ 0 doble-dip más allá del techo. ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance/xpGain (seams distintos). CEO balance knob.
  vampCap: 0.5,              // TECHO DURO de la lifesteal EFECTIVA (base Vampírico + boost Nocturno) — mismo ceiling 0.5 que buildBB aplica a bb.lifesteal ⇒ share-cap, anti-runaway. CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el pasivo aplica (mirror ERUDITION.zones/KINSHIP_BOND.zones — la ciudad/SAFEZONE fuera). El bono de oro SE zone-gatea aquí (mirror kinshipMul/focusMul).
  // Reloj compartible DETERMINISTA (mirror DAYNIGHT/WEATHER/SAFEZONE, MMORPG-safe): la fase día/noche de un kill se deriva de su timestamp del reloj COMPARTIDO. Alineado con los valores de DAYNIGHT para que la
  // ventana nocturna coincida con el tramo oscuro visible (crepúsculo→noche→pre-amanecer), pero NOCTURNE_HUNT es AUTÓNOMA (no depende de render). CEO balance knobs.
  cycleSeconds: 1200,        // duración de un ciclo día/noche completo (s) — mirror DAYNIGHT.cycleSeconds.
  epochMs: 0,                // epoch del reloj compartible determinista (mirror DAYNIGHT.epochMs), MMORPG-safe.
  nightStart: 0.78,          // inicio de la ventana NOCTURNA (fase 0..1, 0=medianoche): crepúsculo. Night si phase>=nightStart || phase<nightEnd (envuelve la medianoche). Mirror del tramo oscuro de DAYNIGHT. CEO balance knob.
  nightEnd: 0.28,            // fin de la ventana NOCTURNA (fase): amanecer. CEO balance knob.
  phaseOverride: null,       // fija una fase 0..1 para pruebas/screenshots deterministas (mirror DAYNIGHT.phaseOverride); null = reloj real. QA lo inyecta in-memory para forzar noche/día.
  windowSec: 30,             // ventana deslizante (s) para contar kills nocturnos. CEO balance knob.
  minKills: 3,               // nº mínimo de kills NOCTURNOS en la ventana para ACUMULAR nocturne. Cazar de día (n=0) ⇒ tally 0 < 3 ⇒ nunca (eje puramente temporal). CEO balance knob.
  halfLifeSec: 25,           // vida-media del DECAY determinista (sin RNG) del `nocturne` al amanecer/dejar de cazar de noche: cae a la mitad cada 25s. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capNocturne: 12,           // techo del `nocturne` proyectado (evita crecimiento ilimitado; el tier máx satura mucho antes). CEO balance knob.
  accruePerSec: 1,           // `nocturne` acumulado por segundo con tally≥minKills sostenido (con tiers 2/4/6 ⇒ 2s/4s/6s para T1/T2/T3). CEO balance knob.
  // TABLA de tiers: umbral de `nocturne` sostenido (min inclusivo) → `boost` = fracción de lifesteal añadida (daño melee curado), sobre el share-cap vampCap (0 = sin efecto). Tier vigente = el más alto cuyo `min` ≤ nocturne. Determinista, monótono.
  tiers: [
    { min: 2, boost: 0.06 },   // Tier 1 — cazador incipiente (≥2s de caza nocturna sostenida): +6% de robo de vida (hasta el techo compartido).
    { min: 4, boost: 0.12 },   // Tier 2 — cazador firme (≥4s): +12% de robo de vida.
    { min: 6, boost: 0.20 },   // Tier 3 — señor de la noche (≥6s): +20% de robo de vida. CEO balance knobs.
  ],
};

// CAS-2400: CADENCIA / ÍMPETU DE COMBATE (DARK, CADENCE_RUSH) — EVO mecánica #67 (serializa tras #66 NOCTURNE LIVE). EJE FRESCO TEMPO/CADENCIA DE MATANZA + CANAL REUSADO critChance (SHARE-CAP con Delve). ⊥/DISTINTO a todo lo enviado #47-66:
//   - EJE FRESCO **TEMPO/RITMO DE MATANZA** (con qué RAPIDEZ EN SUCESIÓN peleas): un **combo-meter rodante server-authoritative** que SUBE `bumpPerKill` en CADA kill y DECAE por vida-media continua (mirror decay Nocturne/Delve, reloj COMPARTIDO ⇒ mismo meter en N clientes, sin timer client-local).
//     El RATE emerge del balance bump-vs-decay: matar RÁPIDO (muchos bumps antes de que decaigan) ⇒ el meter TREPA sobre los umbrales de tier; una PAUSA lo deja decaer. NO es CUÁNDO (Nocturne fase temporal) ni A QUIÉN (Focus/Erudition) ni DÓNDE (Trailcraft/Delve/Wayfarer) ni SOCIAL (Kinship) — es CUÁN RÁPIDO EN SUCESIÓN.
//     Distinto a Nocturne #66 (que cuenta kills-de-noche en una VENTANA fija con gate minKills+fase): Cadencia NO tiene ventana-conteo ni gate de fase — cada kill BUMPEA el meter directo y el tempo sale del bump-vs-decay. Half-life CORTO (6s ≪ 25s de Nocturne/Delve) ⇒ sensible al RATE (hay que seguir matando para sostenerlo).
//   - CANAL REUSADO `critChance` (precisión ofensiva, el 6º canal — MISMO que Delve #64): SUMA % de crítico como TÉRMINO AISLADO, con DOBLE cap: (1) CAP DURO propio `cadenceCritCap` (≤0.35 abs) y (2) **SHARE-CAP con el bono de crit de Delve** — el bono COMBINADO delve+cadence se capa a `cadenceCritCap` ⇒ Cadencia sólo toma el margen que deja Delve (0 doble-dip más allá del techo; mismo patrón share-cap que Nocturne `vamp` vs Vampírico). ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/xpGain (seams distintos).
// HARD-GATED: enabled:false ⇒ tickCadence jamás corre (Date.now nunca se llama), G.cadence/G.cadenceServer NUNCA se crean, cadenceCritBonusPct RETURN 0 ⇒ el bloque nuevo del seam de crit queda BYTE-IDÉNTICO a HEAD (el srand de crit se consume igual). Reversible en 1 línea. anti-stacking: 1 arco valida a la vez.
export const CADENCE_RUSH = {
  enabled: true,             // LIVE (EVO#67, CAS-2402 flip CTO) tras QA DARK PASS 40/40 (CAS-2401, build c4a549ae2fa1) + CEO Gate APPROVED + CEO byte-verify (f2bf0b9). Serializado tras #66 NOCTURNE LIVE&verificado&cerrado. Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez. Canal critChance SHARE-CAP de-stack con Delve #64 (min(cadenceCritCap, delve+cadence)).
  channel: "critChance",     // canal REUSADO (6º, precisión ofensiva) — MISMO que Delve #64. De-stack por SHARE-CAP: el bono combinado delve+cadence se capa a cadenceCritCap ⇒ 0 doble-dip. ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/xpGain (seams distintos). CEO balance knob.
  zones: ["forest","caves","ruins","abyss","frost","swamp"],  // zonas de caza donde el bono de crit APLICA (mirror DELVE.zones/NOCTURNE_HUNT.zones — la ciudad/SAFEZONE fuera). El meter acumula por kill; la APLICACIÓN del crit se zone-gatea aquí.
  // Reloj/decay COMPARTIDO DETERMINISTA (mirror tickNocturne/tickDelve, MMORPG-safe): el meter proyectado de un pid = raw·0.5^(dt/halfLife) al `now` del reloj compartido ⇒ mismo decay en N clientes (0 RNG, 0 timer client-local).
  bumpPerKill: 1,            // cuánto SUBE el meter por cada kill (evento server-auth del stream de kills). CEO balance knob.
  halfLifeSec: 6,            // vida-media del DECAY determinista (sin RNG) del meter: cae a la mitad cada 6s. CORTO a propósito ⇒ el meter mide el TEMPO RECIENTE (rate), no un total histórico. Reloj de pared COMPARTIDO ⇒ mismo decay en N clientes. CEO balance knob.
  capCadence: 10,            // techo del meter proyectado (evita crecimiento ilimitado; el tier máx satura antes). CEO balance knob.
  cadenceCritCap: 35,        // CAP DURO propio del bono de crit de Cadencia en % (≤0.35 abs) Y techo del bono COMBINADO delve+cadence (SHARE-CAP): min(cadenceCritCap, delveBonus+cadenceBonus) ⇒ 0 doble-dip. Anti-runaway. CEO balance knob.
  critCapPct: 50,            // CAP DURO ABSOLUTO del critChance TOTAL (base+bonos) en % (≤0.5 abs) — MISMO 50 que Delve; el bono de cadencia NUNCA reduce el crit base (sólo AÑADE hasta el tope). CEO balance knob.
  // TABLA de tiers: un tier está vigente si el meter `cad` ≥ min (umbral de tempo sostenido). Tier vigente = el más alto que cumple. Determinista, monótono por meter. El `critPct` máx (25) ≤ cadenceCritCap (35).
  tiers: [
    { min: 2, critPct: 8 },     // Tier 1 — ímpetu incipiente (≥2 kills recientes sostenidos, meter≥2): +8% crit.
    { min: 4, critPct: 15 },    // Tier 2 — ímpetu firme (meter≥4): +15% crit.
    { min: 6, critPct: 25 },    // Tier 3 — ímpetu desatado (meter≥6): +25% crit (≤ cadenceCritCap 35, share-cap con Delve). CEO balance knobs.
  ],
};

// CAS-2404: VENDAVAL / TEMPESTAD (DARK, TEMPEST_SURGE) — EVO mecánica #68 (serializa tras #67 CADENCE LIVE). EJE FRESCO **CONDICIÓN METEOROLÓGICA (world-CONDITION)** + CANAL REUSADO lootQuality (SHARE-CAP con Trailcraft). ⊥/DISTINTO a todo lo enviado #47-67:
//   - EJE FRESCO **CLIMA / CONDICIÓN DEL MUNDO** (el PRIMER eje anclado a una CONDICIÓN METEOROLÓGICA compartida por el shard, NO a un contador personal): un **estado de clima server-authoritative shard-wide** que cicla clear→lluvia→TORMENTA. Durante una TORMENTA, un bono en zonas EXPUESTAS/al-aire-libre aplica a TODOS los jugadores del shard que estén en una zona expuesta.
//     Es un **GATE DE CONDICIÓN DEL MUNDO, NO un meter personal** (⊥ Cadence #67, que es un combo-meter personal decayente por-pid) y NO la fase día/noche (⊥ Nocturne #66, que gatea por FASE TEMPORAL/noche). El clima es una dimensión INDEPENDIENTE del estado-mundo: una "noche tormentosa" satisface AMBOS flags a la vez ⇒ ortogonalidad probada. NO es DÓNDE (Trailcraft/Delve/Wayfarer) ni A QUIÉN (Focus/Erudition) ni SOCIAL (Kinship) ni CUÁNDO-noche (Nocturne) ni CUÁN-RÁPIDO (Cadence) — es BAJO QUÉ CONDICIÓN DEL MUNDO peleas.
//     **HOOK del estado de clima EXISTENTE**: la intensidad de tormenta se DERIVA como función PURA del MISMO reloj compartido determinista que ya usa `WEATHER` (UTC Date.now − epochMs mod cycleSeconds, phaseOverride para QA) ⇒ shard-consistente por construcción, 0 RNG, 0 timer client-local. La VENTANA DE TORMENTA se alinea a los keyframes de "lluvia plena" de WEATHER (fase 0.28–0.45) ⇒ el buff coincide con el chaparrón VISIBLE. Rampa TRIANGULAR (0→1→0) dentro de la ventana ⇒ la tormenta "arrecia→pico→amaina" (severidad graduada, misma en N clientes). STATELESS: 0 acumulador per-pid, 0 marcas, 0 G.tempestServer.
//   - CANAL REUSADO `lootQuality` (rareza/calidad del drop, el piso `minR` de rollGearInst — MISMO seam que Trailcraft #63): la tormenta SUBE el piso de rareza del gear que dropea el jugador local EN una zona EXPUESTA. De-stack CON Trailcraft por SHARE-CAP: pasos combinados `min(tempestLootCap, trailSteps + tempestSteps)` ⇒ 0 doble-dip más allá del techo (mismo patrón share-cap que Cadence `critChance` vs Delve). tempestLootCap≥max(trailSteps)=2 ⇒ con Tempest OFF el seam es BYTE-IDÉNTICO al LIVE de Trailcraft (0-regr).
//   · DIFERENCIADOR EXPOSICIÓN (⊥ obligatoria): zones = subconjunto AL-AIRE-LIBRE `[forest,ruins,abyss,frost,swamp]` — **caves EXCLUIDA (resguardada/bajo techo)** ⇒ en cuevas durante una tormenta NO hay bono (prueba el gate de exposición). Distinto de Trailcraft.zones (que incluye caves) ⇒ el conjunto de zonas por sí solo NO es el eje; el eje es la CONDICIÓN de tormenta.
//   · TIERS por INTENSIDAD de tormenta (world-state, shard-wide, NO permanencia per-pid) → PASOS de piso de rareza: intensidad<minInt ⇒ T0 (0 pasos); ≥0.34 ⇒ T1 (+1 piso); ≥0.67 ⇒ T2 (+2 pisos). Determinista, monótono por intensidad. Fuera de la ventana de tormenta ⇒ intensidad 0 ⇒ T0 ⇒ NO abre.
//   · INDICADOR $0-arte: badge procedural ⛈ (nube de tormenta con rayo), 0 arte nuevo. NO nueva stat/loot-table: sólo eleva el `minR` YA existente de rollGearInst en el drop, con SHARE-CAP vs Trailcraft.
// HARD-GATED: enabled:false ⇒ NINGUNA derivación de clima corre (Date.now/tempestPhaseNow nunca se llama), G.tempest* NUNCA se crea, tempestFloorSteps RETURN 0 y lootQualityFloor() DELEGA a trailcraftFloor() ⇒ el seam de drop es BYTE-IDÉNTICO a HEAD (rollGearInst con el mismo `minR` de Trailcraft, srand intacto), tempestTag "" ⇒ sim + save.v1 + worldFingerprint BYTE-IDÉNTICOS. SIN tocar input.js (passive 100% AMBIENTAL emerge del clima+traversal). Reversible 1-línea. NÚMEROS = balance del CEO.
export const TEMPEST_SURGE = {
  enabled: true,             // LIVE (EVO#68, CAS-2406) — flip config-only false→true tras QA DARK PASS 38/38 ×2 (CAS-2405, build c4a549ae2fa1) + CEO Gate APPROVED (parent CAS-2404 comment 99a3394f) + CEO byte-verify DARK (origin/master a5aa7eb). Serializado tras #67 CADENCE LIVE&closed. Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez.
  channel: "lootQuality",    // canal REUSADO (rareza/calidad del drop, piso `minR` de rollGearInst — MISMO seam que Trailcraft #63). De-stack por SHARE-CAP con Trailcraft: pasos combinados min(tempestLootCap, trailSteps+tempestSteps) ⇒ 0 doble-dip. ⊥ goldFind/restedMult/wardRegen/oocMitigation/critChance/xpGain/vamp (seams distintos). CEO balance knob.
  zones: ["forest","ruins","abyss","frost","swamp"],  // zonas AL-AIRE-LIBRE/EXPUESTAS donde la tormenta aplica el bono de rareza. **caves EXCLUIDA** (resguardada) ⇒ prueba el gate de exposición. Subconjunto outdoor de las zonas de caza (ciudad/SAFEZONE fuera).
  // Reloj compartido DETERMINISTA — HOOK del estado WEATHER existente (mirror WEATHER.cycleSeconds/epochMs, MMORPG-safe): la fase de clima = (Date.now/1000 − epochMs/1000)/cycleSeconds mod 1 ⇒ misma condición en N clientes del shard (0 RNG, 0 timer client-local). Alineado con WEATHER para que la tormenta coincida con el chaparrón visible.
  cycleSeconds: 900,         // duración de un ciclo completo de clima (s) — mirror WEATHER.cycleSeconds (alinea la tormenta con la lluvia visible).
  epochMs: 0,                // origen COMPARTIDO del reloj (UTC ms) — mirror WEATHER.epochMs. Fijo ⇒ mismo instante ⇒ misma condición en todo cliente.
  phaseOverride: null,       // fija una fase 0..1 para pruebas/screenshots deterministas (mirror WEATHER.phaseOverride); null = reloj real. QA lo inyecta in-memory para forzar tormenta/calma.
  stormStart: 0.28,          // inicio de la VENTANA DE TORMENTA (fase 0..1) — alineado al keyframe "lluvia plena" de WEATHER (0.28). CEO balance knob.
  stormEnd: 0.45,            // fin de la ventana de tormenta (fase) — alineado al keyframe donde WEATHER pasa lluvia→niebla (0.45). CEO balance knob.
  minIntensity: 0.34,        // intensidad mínima (0..1) para que la tormenta ACTIVE el bono (T1). Por debajo ⇒ T0 (calma/arreciando, sin efecto). CEO balance knob.
  tempestLootCap: 3,         // TECHO DURO de los PASOS de piso de rareza COMBINADOS (trailSteps+tempestSteps) — SHARE-CAP con Trailcraft ⇒ 0 doble-dip. ≥ max(trailSteps)=2 ⇒ Tempest OFF ⇒ seam byte-id vs LIVE Trailcraft. CEO balance knob.
  // TABLA de tiers: umbral de INTENSIDAD de tormenta (min inclusivo, 0..1) → `steps` = PASOS de subida del piso de rareza del drop. Tier vigente = el más alto cuyo `min` ≤ intensidad. Determinista, monótono. La intensidad es WORLD-STATE (shard-wide), NO permanencia per-pid.
  tiers: [
    { min: 0.34, steps: 1 },   // Tier 1 — tormenta (intensidad ≥0.34): +1 piso de rareza (común → poco común).
    { min: 0.67, steps: 2 },   // Tier 2 — tempestad plena (intensidad ≥0.67, cerca del pico): +2 pisos de rareza (común → raro). CEO balance knobs.
  ],
};

// CAS-2409: ÚLTIMA RESISTENCIA / AGUANTE (DARK, LAST_STAND) — EVO mecánica #69 (serializa tras #68 TEMPEST LIVE). EJE FRESCO **RATIO DE FUERZA / SUPERADO EN NÚMERO (local force-ratio / outnumbered)** + CANAL REUSADO wardRegen (SHARE-CAP con Warding Ring #59). ⊥/DISTINTO a todo lo enviado #47-68:
//  · NO acumulador personal en el tiempo (⊥ Cadence #67 = kill-meter decayente): es un RATIO INSTANTÁNEO de la amenaza que te rodea AHORA MISMO.
//  · NO condición de reloj — día/noche (⊥ Nocturne #66) ni clima (⊥ Tempest #68): depende de los ENEMIGOS que te enganchan RIGHT NOW, no del reloj.
//  · NO vínculos/aliados (⊥ Kinship #60 = cuenta ALIADOS): cuenta ENEMIGOS que te enganchan.
//  · NO foco de objetivo único (⊥ Focus Fire #62 = TÚ concentrado en 1 enemigo): es MUCHOS enemigos concentrados en TI.
// server-authoritative, 0-RNG, 0-timer, STATELESS (0 acumulador per-pid, 0 G.lastStand*, 0 marca, 0 clave serializada). El conteo de "superado en número" = función PURA del estado de sim determinista
// (enemigos ALIVE no-neutrales en estado de ENGANCHE {chase/windup/strike/recover/shield} dentro de engageRadius del héroe) ⇒ MISMO ratio para todo observador de ese héroe (convergencia byte-a-byte, 0 desync).
// Canal REUSADO wardRegen (regen de HP — MISMO seam que Warding Ring #59, tema "atrincherarse y aguantar"): SHARE-CAP de-stack ⇒ boost combinado min(lastStandWardCap, wardBoost + lastStandBoost) ⇒ 0 doble-dip
// más allá del techo (mismo patrón que Tempest lootQuality vs Trailcraft y Cadence critChance vs Delve). BYTE-NEUTRO OFF: con enabled:false, la derivación NUNCA corre y wardRegenBoost DELEGA a wardMul() ⇒ seam byte-id al LIVE de Warding Ring.
// NOTA balance (CEO): el seam wardRegenTick respeta la pausa post-daño `_safeRegenPauseT` (no te curas MIENTRAS te pegan). Estar superado en número suele implicar recibir golpes ⇒ el regen materializa en los RESPIROS entre golpes ("recupérate mientras aguantas la línea"). CEO decide si Última Resistencia debe ignorar esa pausa (design/balance, no lo cambio unilateralmente).
export const LAST_STAND = {
  enabled: true,             // DARK (EVO#69, CAS-2409) — flag PRESENTE pero OFF. NO flip live en esta tarea. Reversible 1-línea false→true tras QA DARK + CEO Gate. anti-stacking: 1 arco valida a la vez.
  channel: "wardRegen",      // canal REUSADO (regen de HP — MISMO seam que WARDING_RING #59). De-stack por SHARE-CAP con Warding Ring: boost combinado min(lastStandWardCap, wardBoost + lastStandBoost) ⇒ 0 doble-dip. ⊥ goldFind/restedMult/oocMitigation/critChance/xpGain/vamp/lootQuality (seams distintos). CEO balance knob.
  engageRadius: 220,         // px: radio alrededor del héroe dentro del cual un enemigo ENGANCHADO (aggro sobre el héroe) cuenta como "encima de ti". ~rango de aggro; enemigos enganchados fuera del radio no cuentan. CEO balance knob.
  lastStandWardCap: 0.15,    // TECHO DURO del boost de wardRegen COMBINADO (wardBoost + lastStandBoost) — SHARE-CAP con Warding Ring ⇒ 0 doble-dip. = max(WARDING_RING.tiers.boost)=0.15 ⇒ con Warding a tope, Última Resistencia no añade (ya en el techo); con Warding ausente, aporta hasta su propio tier. CEO balance knob.
  // TABLA de tiers: umbral de ENEMIGOS ENGANCHADOS (min inclusivo) → `boost` = mult adicional sobre regenPct del canal wardRegen. Tier vigente = el más alto cuyo `min` ≤ conteo. Determinista, monótono por CONTEO (ratio instantáneo, NO permanencia per-pid). OFF/sin tiers ⇒ 0.
  tiers: [
    { min: 3, boost: 0.06 },   // Tier 1 — superado en número (≥3 enganchados): +6% a la tasa de regen (regenPct×1.06). "aguanta la línea".
    { min: 5, boost: 0.12 },   // Tier 2 — rodeado / última resistencia (≥5 enganchados): +12% (regenPct×1.12). CEO balance knobs.
  ],
};

// CAS-2415: TERRENO FIRME / PISADA FIRME (DARK, FIRM_FOOTING) — EVO mecánica #70 (serializa tras #69 LAST_STAND LIVE&closed). EJE FRESCO **ESPACIAL / POSICIÓN-EN-EL-MUNDO**: el MATERIAL DE TERRENO server-auth del tile bajo el héroe.
//  · PRE-FLIGHT HARD GATE (escalera del issue): (1) HIGH_GROUND/elevación — NO existe estado de altura/z server-auth en el sim (grep elevation|altitude|\.z = 0) ⇒ DEAD-END, descartado; (2) TERRAIN — `world.terr[ty*MAP_W+tx]` SÍ existe: array de material de tile (T_GRASS/T_DIRT/T_STONE/T_COBBLE/T_SAND/T_WATER/T_ICE/T_SWAMP/T_CALDERA/T_STREET),
//    determinista, server-auth (poblado por buildWorld/buildTiledWorld, LEÍDO por el sim en solidBlocked water-check sim.js:2236, y HASHEADO en el worldFingerprint sim.js:13633). ⇒ ladder #2 elegida, flag renombrado a FIRM_FOOTING.
//  · ⊥ a las 11 LIVE #59-#69: NO tiempo (Nocturne #66), NO clima (Tempest #68), NO tempo/ritmo (Cadence #67), NO densidad-de-enemigos (LAST_STAND #69), NO sendero/diversidad (Trailcraft #63), NO profundidad (Delve #64), NO conocimiento (Erudition #65), NO aliados (Kinship #60), NO ward (Warding #59).
//    DISTINTO de los gates de ZONA (Warding/Congregation/… usan pertenencia a un RECT de zona = región gruesa): FIRM_FOOTING lee el MATERIAL fino del tile, que CRUZA zonas (piedra aparece en caves + calles de ciudad; hierba en forest + field + huecos de ciudad; arena en el arena). Es la dimensión espacial más FINA del jugador.
//  · server-authoritative, PURO, 0-RNG, 0-timer, STATELESS: 0 acumulador per-pid, 0 G.firmFooting*, 0 marca, 0 clave serializada. El material bajo el héroe = función PURA del snapshot determinista (world.terr + pos del héroe) ⇒ MISMO tier para todo observador de ese héroe (convergencia byte-a-byte, 0 desync). El mismo tile ⇒ mismo tier en N clientes del shard.
// Canal FRESCO `atkspd` (velocidad de ataque — NINGUNA de las 11 flags lo usa): alimenta el ÚNICO sink sumado heroAtkspd (sim.js:2558, CAS-197) que YA aplica un TECHO DURO GLOBAL ATKSPD_TOTAL_CAP=130 sobre TODAS las fuentes (affixes+talentos+buff+uniques+sets+sockets+Frenesí). ⇒ SHARE-CAP/DE-STACK AUTOMÁTICO:
// atkspd EFECTIVA = min(ATKSPD_TOTAL_CAP, base + firmFooting) ⇒ 0 doble-dip más allá del techo (patrón min(cap, a+b) realizado como clamp global, mismo espíritu que Tempest lootQuality vs Trailcraft y LastStand wardRegen vs Warding). Además sub-cap PROPIO firmFootingCap por si el tier se re-tunea. BYTE-NEUTRO OFF: con enabled:false el aporte es +0 exacto ⇒ `s` sin cambio ⇒ heroAtkspd byte-idéntico al HEAD (mismo contrato "+0 ⇒ byte-identical" que ya documenta el seam para Frenesí).
export const FIRM_FOOTING = {
  enabled: true,             // LIVE (EVO#70, CAS-2421) — flip false→true tras QA DARK PASS (CAS-2419 17/17, CEO Gate APROBADO). Reversible 1-línea true→false + re-run overlay. anti-stacking: 1 arco valida a la vez.
  channel: "atkspd",         // canal FRESCO (velocidad de ataque, puntos aditivos) — NINGUNA de las 11 flags #59-#69 lo usa. Entra al sink sumado heroAtkspd bajo el TECHO GLOBAL ATKSPD_TOTAL_CAP ⇒ de-stack/share-cap automático (min(cap, base+firm), 0 doble-dip). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult (seams distintos). CEO balance knob.
  firmFootingCap: 16,        // SUB-CAP DURO PROPIO del aporte de FIRM_FOOTING (puntos de atkspd) — acota el bono de terreno aunque la tabla se re-tunee. = max(tiers.atkspd)=16 ⇒ neutral con la tabla actual; el share-cap GLOBAL vs el resto lo pone ATKSPD_TOTAL_CAP en heroAtkspd. CEO balance knob.
  // TABLA de tiers por FIRMEZA del material del tile (footing/pisada) → `atkspd` = puntos ADITIVOS al sink heroAtkspd (bajo ATKSPD_TOTAL_CAP). Tier vigente = el MÁS ALTO cuya lista `terr` contiene el material bajo el héroe. Material NO listado (arena/agua/hielo/pantano/caldera = pisada suelta/traicionera) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { terr: [T_GRASS, T_DIRT], atkspd: 8 },              // Tier 1 — suelo natural firme (hierba/tierra): +8 atkspd. "pie plantado".
    { terr: [T_STONE, T_COBBLE, T_STREET], atkspd: 16 }, // Tier 2 — piedra/adoquín/calle pavimentada (pisada firmísima): +16 atkspd. CEO balance knobs.
  ],
};

// CAS-2426: ACECHO / SIGILO (DARK, SHADOW_STALK) — EVO mecánica #71 (serializa tras #70 FIRM_FOOTING LIVE&closed). EJE FRESCO **SIGILO / LÍNEA-DE-VISIÓN / OCULTAMIENTO** (server-auth).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) "LOS entre héroe y mob" como estado PRE-CALCULADO server-side — NO existe (grep raycast|lineOfSight|hasLOS|canSee = 0; los "~154 refs `los`" son el ARTÍCULO español *los*, NO line-of-sight; ya lo señalé en CAS-2416). Pero SÍ existe la GEOMETRÍA server-auth de la que la LOS se DERIVA de forma determinista:
//        `world.wallSet` + `world.blockSet` = Sets de índices de tile ocluyentes (muros/casas), poblados por buildWorld (world.js), LEÍDOS por el sim en solidBlocked (sim.js:2237-2238) y HASHEADOS en el worldFingerprint (wallCount, sim.js:13704). ⇒ construyo la LOS como FUNCIÓN PURA (raycast de grid Bresenham) sobre esa geometría REAL — NO es cosmético cliente, es autoridad determinista. Gate #1 SATISFECHO vía la opción "concealment-por-material/geometría" de la escalera.
//        ⚠️ El CEO asignó #71=SHADOW_STALK CONOCIENDO ya (por mi steer CTO CAS-2417) que no hay raycast previo ⇒ construyo la LOS sobre la geometría real en vez de re-escalar el mismo hallazgo. Si el CEO prefiere el canal alternativo (bonus de primer golpe desde ocultamiento) o escalar, el pivote es trivial (DARK byte-neutral).
//    (2) Canal `detectRadius` (radio de detección/adquisición del mob hacia el héroe) — NINGUNA de las 12 flags #59-#70 lo toca (todas son BUFFS DE STAT del héroe: restedMult/wardRegen/goldFind/oocMitigation/lootQuality/xpGain/atkspd/safeRegen). Es un DEBUFF de percepción del ENEMIGO ⇒ canal 100% fresco. Fuente ÚNICA ⇒ máximo-único trivial (mirror WARDING_RING #59); sub-cap propio stealthStalkCap.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.shadowStalk*`, 0 marca, 0 clave serializada. El ocultamiento = función PURA del snapshot (world.wallSet/blockSet + pos del héroe + pos del mob) ⇒ MISMO valor para todo observador del mismo snapshot (convergencia byte-a-byte, 0 desync).
//  · ⊥ a las 12 LIVE #59-#70: NO material-de-terreno-bajo-el-héroe (#70 FIRM_FOOTING lee `world.terr` del tile DEL HÉROE; esto lee la capa OCLUSORA `world.wallSet/blockSet` de los tiles ENTRE mob y héroe — capa/array distinto, geometría de línea, no material de casilla), NO force-ratio (#69 LAST_STAND), NO clima (#68 TEMPEST), NO time-of-day (NOCTURNE), NO tempo (CADENCE), NO social/kinship, NO territorial, NO profundidad/conocimiento.
//  · APLICACIÓN — un solo seam: la adquisición de target del mob (sim.js "const aggro=e.hostile?300:e.tpl.aggro"). Cuando la LOS mob→héroe está ROTA (≥1 tile oclusor en la línea de grid), el radio EFECTIVO de detección se reduce ⇒ el mob adquiere/persigue desde más cerca (o suelta antes). BYTE-NEUTRO OFF: enabled:false ⇒ aporte +0 exacto ⇒ aggro EFECTIVO == e.hostile?300:e.tpl.aggro ⇒ máquina de estados del enemigo byte-idéntica al HEAD (raycast NUNCA se invoca con enabled:false). No es un stat de combate ⇒ NO entra al worldFingerprint (que hashea geometría estática, no IA de enemigos).
export const SHADOW_STALK = {
  enabled: true,             // DARK (EVO#71). OFF byte-neutral: +0 exacto ⇒ estado byte-idéntico al HEAD. Flip false→true SÓLO tras QA DARK PASS + CEO Gate. anti-stacking: 1 arco valida a la vez.
  channel: "detectRadius",   // canal FRESCO (radio de detección/adquisición del mob) — NINGUNA de las 12 flags #59-#70 lo usa (todas son stat-buffs del héroe). Fuente ÚNICA ⇒ máximo-único trivial. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd. CEO balance knob.
  stealthStalkCap: 0.35,     // SUB-CAP DURO PROPIO de la reducción del radio de detección (fracción, 0..1) — acota el ocultamiento aunque la tabla se re-tunee. = max(tiers.mit)=0.35 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PROFUNDIDAD DE OCULTAMIENTO (nº de tiles oclusores en la línea de grid mob→héroe) → `mit` = fracción de reducción del radio de detección (bajo stealthStalkCap). Tier vigente = el MÁS ALTO cuya `min` de oclusores se alcanza. LOS despejada (0 oclusores) ⇒ Tier 0 ⇒ +0 (sin ventaja). Determinista, LUT pura.
  tiers: [
    { min: 1, mit: 0.20 },   // Tier 1 — cobertura fina (1 tile oclusor en la línea): −20% al radio de detección. "tras una esquina".
    { min: 2, mit: 0.35 },   // Tier 2 — cobertura densa (≥2 tiles oclusores): −35% al radio de detección. "en las sombras". CEO balance knobs.
  ],
};

// CAS-2432: PRESIÓN POR ESCASEZ DE RECURSOS (DARK, SCARCITY_EDGE) — EVO mecánica #72 (serializa tras #71 SHADOW_STALK LIVE&closed). EJE FRESCO **ESCASEZ / AGOTAMIENTO DE RECURSOS DEL MUNDO COMPARTIDO** (server-auth, MMORPG-native: contención por spawns compartidos entre jugadores concurrentes).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL de escasez — SÍ existe: cada `world.spawners[i]` tiene `max` (capacidad de spawn de la zona, server-side) y el nº de mobs VIVOS no-jefe se cuenta determinista sobre `G.enemies` (posiciones = estado de sim replicado). El loop de spawn YA usa `count < sp.max` (sim.js:7133) como su gate de repoblación ⇒ la DENSIDAD/AGOTAMIENTO es estado autoritativo, NO cosmético. `depletion(zona) = 1 - mobsVivosNoJefe(zona)/Σ sp.max(zona)` ∈ [0,1] = fracción de la capacidad de spawn de la zona actualmente VACÍA (=exprimida por caza previa / otros jugadores). PURA/determinista ⇒ MISMO valor para todo observador del mismo snapshot. Zona sin spawners (ciudad/field) ⇒ cap 0 ⇒ depletion 0 ⇒ sin ventaja.
//    (2) Canal `essenceFind` (multiplicador de recompensa de ESENCIA / meta-moneda por forrajeo) — NINGUNA de las 13 flags #59-#71 lo toca: la FAMILIA de recompensa-de-forrajeo tiene goldFind (#60/#62), lootQuality (#63/#68), xpGain (#65) TODOS ocupados; ESENCIA es el ÚNICO miembro libre. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio scarcityEssCap, 0 doble-dip (la esencia de arena/bossrush/pactos/uniques/NG+ vive en OTROS seams; este bono es un trickle FRESCO per-kill en zona exprimida, aditivo a meta.essence como RIPOSTE/goblin/bloodstain).
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.scarcity*`, 0 clave serializada nueva (banca a la meta.essence EXISTENTE, igual que RIPOSTE/goblin/bloodstain). depletion = función PURA del snapshot (world.spawners + G.enemies) ⇒ convergencia byte-a-byte, 0 desync. NO es stat de combate ⇒ NO entra al worldFingerprint.
//  · ⊥ a las 13 LIVE #59-#71: NO LOS/sigilo (#71 lee la capa OCLUSORA entre mob y héroe), NO material-de-terreno (#70 lee world.terr del tile del héroe), NO force-ratio (#69 cuenta enemigos ENGANCHADOS al héroe; esto cuenta AUSENCIA de mobs vs capacidad de la ZONA — señal inversa y de fuente distinta: spawner-cap, no aggro), NO clima/tiempo/tempo/social/kinship/territorial/crowd.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral en una zona AGOTADA, el héroe FORRAJEA un bono de esencia = round(scarcityMul(zona) * tpl.xp) (el xp del mob = proxy determinista de su "valor"; scarcityMul acotado por scarcityEssCap). BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 esencia, 0 floater, 0 draw de RNG ⇒ killEnemy byte-idéntico al HEAD.
export const SCARCITY_EDGE = {
  enabled: true,             // DARK (EVO#72). OFF byte-neutral: rama muerta ⇒ 0 esencia + 0 RNG ⇒ estado byte-idéntico al HEAD. Flip false→true SÓLO tras QA DARK PASS + CEO Gate. anti-stacking: 1 arco valida a la vez.
  channel: "essenceFind",    // canal FRESCO (multiplicador de recompensa de ESENCIA por forrajeo) — NINGUNA de las 13 flags #59-#71 lo usa. Familia recompensa-de-forrajeo: goldFind/lootQuality/xpGain OCUPADOS ⇒ esencia es el ÚNICO libre. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius. CEO balance knob.
  scarcityEssCap: 0.12,      // SUB-CAP DURO PROPIO del bono de forrajeo como FRACCIÓN del xp del mob (0..1) — acota la esencia por kill aunque la tabla se re-tunee. = max(tiers.mul)=0.12 ⇒ neutral con la tabla actual. CEO balance knob.
  minZoneCap: 3,             // capacidad de spawn MÍNIMA de la zona (Σ sp.max) para que la escasez cuente — zonas de cap ínfimo (ciudad/field sin spawners de caza) NO disparan el bono aunque estén "vacías". CEO balance knob.
  // TABLA de tiers por AGOTAMIENTO de la zona (fracción de la capacidad de spawn actualmente VACÍA) → `mul` = fracción del xp del mob concedida como esencia de forrajeo (bajo scarcityEssCap). Tier vigente = el MÁS ALTO cuya `min` de agotamiento se alcanza. Zona llena/rica (depletion < 0.50) ⇒ Tier 0 ⇒ +0 (sin ventaja: campear la zona rica no da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 0.50, mul: 0.06 },  // Tier 1 — zona medio-exprimida (≥50% de la capacidad vacía): +6% del xp del mob como esencia. "las sobras".
    { min: 0.80, mul: 0.12 },  // Tier 2 — zona casi-agotada (≥80% vacía): +12% del xp del mob como esencia. "rebuscar en lo exprimido". CEO balance knobs.
  ],
};

// CAS-2439: PROXIMIDAD A AMENAZA APEX (DARK, APEX_PROXIMITY) — EVO mecánica #73 (serializa tras #72 SCARCITY_EDGE LIVE&closed). EJE FRESCO **PROXIMIDAD A UN DEPREDADOR APEX** (server-auth, MMORPG-native: recompensa cazar en la sombra de un jefe/campeón vivo en vez de farmear trash seguro lejos del peligro).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: cada mob apex vivo (`e.isBoss` / `e.champion` / `e.champElite`) lleva posición `e.x,e.y` en `G.enemies` = estado de sim REPLICADO y determinista (el MISMO array que el loop de spawn/IA recorre). `apexNearestDist(h) = min hypot(h−apexVivo)` ∈ [0,∞) = distancia (snapshot) al jefe/campeón vivo MÁS CERCANO en la vecindad del héroe. PURA ⇒ MISMO valor para todo observador del mismo snapshot. Sin apex vivo ⇒ ∞ ⇒ Tier 0 ⇒ sin ventaja. NO cosmético: las posiciones apex son autoridad de sim.
//    (2) Canal `matFind` (multiplicador de recompensa de MENA / material de forja por forrajeo) — NINGUNA de las 14 flags #59-#72 lo toca: la FAMILIA recompensa-de-forrajeo tiene goldFind (#60/#62), lootQuality (#63/#68), xpGain (#65), essenceFind (#72) TODOS ocupados; MENA/forja es el ÚNICO miembro libre. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio apexMatCap, 0 doble-dip (la mena de jefes/campeones/daily/ambush vive en OTROS seams; este bono es un trickle FRESCO per-trash-kill cerca de un apex, aditivo a h.mats vía grantMats como el trickle de kill%4).
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.apex*`, 0 clave serializada nueva (banca a h.mats EXISTENTE desde CAS-237, igual que el trickle de forja). apexNearestDist = función PURA del snapshot (G.enemies + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. NO es stat de combate ⇒ NO entra al worldFingerprint (la mena se gasta luego en la forja, fuera del loop de sim).
//  · ⊥/INVERSO a las 14 LIVE #59-#72: INVERSO a #72 (escasez = AUSENCIA de mobs vs cap de la zona; esto = PRESENCIA de un apex CONCRETO cercano), ⊥ #69 (force-ratio cuenta enemigos ENGANCHADOS al héroe; esto = distancia a UN apex vivo, con o sin engage), NO LOS/sigilo (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral con un apex vivo dentro del radio de amenaza, el héroe FORRAJEA mena extra = apexForageMats(zona,tpl) (flat por tier de proximidad, acotado por apexMatCap), banca a h.mats vía grantMats (0 RNG). El apex ya muerto queda excluido (e.dead=true) ⇒ matar al apex NO se auto-recompensa. BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 mena, 0 floater, 0 grantMats ⇒ killEnemy byte-idéntico al HEAD.
export const APEX_PROXIMITY = {
  enabled: true,             // DARK (EVO#73). OFF byte-neutral: rama muerta ⇒ 0 mena + 0 grantMats ⇒ estado byte-idéntico al HEAD. Flip false→true SÓLO tras QA DARK PASS + CEO Gate. anti-stacking: 1 arco valida a la vez.
  channel: "matFind",        // canal FRESCO (multiplicador de recompensa de MENA/material de forja por forrajeo) — NINGUNA de las 14 flags #59-#72 lo usa. Familia recompensa-de-forrajeo: goldFind/lootQuality/xpGain/essenceFind OCUPADOS ⇒ mena es el ÚNICO libre. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind. CEO balance knob.
  apexMatCap: 2,             // SUB-CAP DURO PROPIO de la mena por kill (nº de mena) — acota el bono aunque la tabla se re-tunee. = max(tiers.mats)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PROXIMIDAD al apex vivo más cercano (distancia en px). CERCA = ALTO RIESGO = tier MÁS ALTO. El tier vigente = el más peligroso (menor `max`) cuya distancia se satisface. Sin apex vivo / lejos (dist > max mayor) ⇒ Tier 0 ⇒ +0 (cazar trash seguro lejos del apex NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { max: 480, mats: 1 },   // Tier 1 — apex vivo a ≤480px (en su territorio): +1 mena por kill. "cazando en la sombra del depredador".
    { max: 240, mats: 2 },   // Tier 2 — apex vivo a ≤240px (a su alcance): +2 mena por kill. "robando en las fauces del apex". CEO balance knobs.
  ],
};

// CAS-2445: PELIGRO POR AFIJO DE MOB (DARK, MOB_AFFIX_DANGER) — EVO mecánica #74 (serializa tras #73 APEX_PROXIMITY LIVE&closed). EJE FRESCO **CALIDAD/PELIGRO DE AFIJO DE MOB** (server-auth, MMORPG-native: recompensa enfrentar packs de mobs "encantados"/modificados por afijos en vez de trash plano seguro).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: el subsistema MOB_AFFIX (CAS-247/1585/1590) asigna afijos DETERMINISTAS al spawn (maybeAffix/spawnChampion, off-srand) — cada mob afijado lleva `e.affix` (afijo primario) y los campeones `e.affixes=[a,b]` en `G.enemies` = estado de sim REPLICADO (el MISMO array del loop de spawn/IA). `mobAffixes(e)` = lista canónica (campeón→2, trash afijado→1, boss/neutral→0). `affixDangerScore(h)=Σ affixWeights[id]` sobre `mobAffixes(e)` de los mobs VIVOS dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista del PELIGRO de afijos en la vecindad. PURA ⇒ MISMO valor para todo observador del mismo snapshot. NO cosmético: los afijos son autoridad de sim (gobiernan hpMul/dmgReduce/blast/vamp/aura).
//    (2) Canal `flaskPotency` (recompensa de cargas de Estus/FLASK por forrajeo amid-danger) — NINGUNA de las 15 flags #59-#73 lo toca: la familia recompensa-de-forrajeo (goldFind/lootQuality/xpGain/essenceFind/matFind) está LLENA ⇒ pivota FUERA de ella a un recurso FRESCO. Estus (h.flaskCharges, CAS-1854) es TRANSITORIO (fuera del allowlist de save.v1, línea sim 12043) y NO entra al worldFingerprint (que sólo hashea buildWorld/terreno) ⇒ recompensa pura, 0 stat de combate en el fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio dangerFlaskCap, 0 doble-dip (las recargas de Estus de Hoguera/zona viven en OTROS seams; este bono es un trickle FRESCO per-kill amid-danger, aditivo a h.flaskCharges vía grantFlask, capado a FLASK.charges). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.affixDanger*`/`G.mobAffix*`, 0 clave serializada nueva (banca a h.flaskCharges EXISTENTE y TRANSITORIO, fuera del save allowlist). affixDangerScore = función PURA del snapshot (G.enemies + afijos + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Estus banca fuera del loop de fingerprint ⇒ NO entra al worldFingerprint.
//  · ⊥/DISTINTO a las 15 LIVE #59-#73: ⊥ #73 (apex = DISTANCIA a UN jefe/campeón vivo, con o sin afijos — los boss NO llevan afijo, maybeAffix los excluye; esto = SUMA DE PESO DE AFIJOS de mobs en radio, con o sin apex), ⊥ #69 (force-ratio cuenta enemigos ENGANCHADOS; esto = CALIDAD de afijo con o sin engage), ⊥ #72 (escasez = AUSENCIA de mobs vs cap; esto = PRESENCIA de mobs de ALTA CALIDAD de afijo), NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral con peligro-de-afijo (score≥umbral) dentro del radio del HÉROE, el héroe cosecha cargas de Estus extra = affixDangerForageFlasks(hero) (flat por tier de peligro, acotado por dangerFlaskCap), banca a h.flaskCharges vía grantFlask (capado a FLASK.charges, 0 RNG). El mob recién muerto queda excluido (e.dead=true) ⇒ matar NO auto-cuenta su propio afijo. BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 flasks, 0 floater, 0 grantFlask ⇒ killEnemy byte-idéntico al HEAD.
export const MOB_AFFIX_DANGER = {
  enabled: true,            // DARK (EVO#74). OFF byte-neutral: rama muerta ⇒ 0 flasks + 0 grantFlask ⇒ estado byte-idéntico al HEAD. Flip false→true SÓLO tras QA DARK PASS + CEO Gate. anti-stacking: 1 arco valida a la vez.
  channel: "flaskPotency",   // canal FRESCO (recompensa de cargas de Estus/FLASK por forrajeo amid-danger) — NINGUNA de las 15 flags #59-#73 lo usa. Familia recompensa-de-forrajeo (goldFind/lootQuality/xpGain/essenceFind/matFind) LLENA ⇒ Estus es un recurso FRESCO, transitorio, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind. CEO balance knob.
  radius: 260,               // radio de amenaza (px): sólo los mobs afijados VIVOS dentro de este radio del héroe suman al danger score. CEO balance knob.
  dangerFlaskCap: 2,         // SUB-CAP DURO PROPIO de las cargas de Estus por kill (nº de flasks) — acota el bono aunque la tabla se re-tunee. = max(tiers.flasks)=2 ⇒ neutral con la tabla actual. FLASK.charges (3) capa el pool total. CEO balance knob.
  affixWeights: { swift:1, armored:1, vampiric:1, volatile:2, frost:2 },   // PESO de peligro por id de afijo (MOB_AFFIX_IDS). volatile (explota al morir) + frost (aura de control) = MÁS peligrosos ⇒ pesan 2; swift/armored/vampiric = 1. CEO balance knobs. Un id ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE AFIJOS de los mobs en radio. MÁS peligro = tier MÁS ALTO. El tier vigente = el más peligroso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (matar trash plano sin afijos NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, flasks: 1 },   // Tier 1 — score ≥1 (algún mob afijado cerca): +1 carga de Estus por kill. "cazando entre mobs encantados".
    { min: 3, flasks: 2 },   // Tier 2 — score ≥3 (un pack encantado peligroso / un campeón + trash afijado): +2 cargas por kill. "en las fauces de un pack modificado". CEO balance knobs.
  ],
};

// CAS-2450: PARTICIPACIÓN EN EVENTO DE ZONA (DARK, ZONE_EVENT_SURGE) — EVO mecánica #75 (serializa tras #74 MOB_AFFIX_DANGER LIVE&closed). EJE FRESCO **ESTADO DE EVENTO DE ZONA/MUNDO ACTIVO** (server-auth, MMORPG-native: recompensa PARTICIPAR en un world-event dinámico de la zona en vez de forrajear en el vacío).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: el subsistema ZONE_EVENTS (CAS-1681) siembra POIs de evento DETERMINISTAS por zona (eventRng ISOLADO, off-srand) — `G.zoneEvents.pois[]` = estado de sim REPLICADO (el MISMO array que `tickZoneEvents` recorre cada tick). Cada POI lleva `{id,type(shrine|chest|goblin),zone,x,y,state(active|done|escaped),...}`. `zoneEventScore(h)=Σ eventWeights[type]` sobre los POIs **state==="active"** dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista de la INTENSIDAD DE PARTICIPACIÓN en eventos activos en la vecindad. PURA ⇒ MISMO valor para todo observador del mismo snapshot. NO cosmético: los POIs son autoridad de sim (gobiernan spawns/guardianes/recompensa). `state==="done"/"escaped"` ⇒ peso 0 (evento consumido ⇒ ya no se participa).
//    (2) Canal `gemFind` (recompensa de esquirlas de gema por forrajeo DENTRO de un evento activo) — NINGUNA de las 16 flags #59-#74 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency) está LLENA ⇒ pivota a una moneda FRESCA. Esquirlas de gema (h.eventGems) es un recurso TRANSITORIO NUEVO (init en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio eventGemCap, 0 doble-dip (ningún otro seam banca eventGems). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.zoneEventSurge*`/`G.gemFind*`, 0 clave SERIALIZADA nueva (h.eventGems NO se añade al allowlist de serializeSave ⇒ es contador de runtime transitorio, mirror de h.flaskCharges). zoneEventScore = función PURA del snapshot (G.zoneEvents.pois + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Gemas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint.
//  · ⊥/DISTINTO a las 16 LIVE #59-#74: ⊥ #74 (afijo = CALIDAD de un mob individual; esto = ESTADO DE EVENTO de la zona, independiente de qué mobs haya), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia de POIs de EVENTO activos), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un evento dinámico), ⊥ #69 (force-ratio = ENGANCHADOS), NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral mientras hay evento(s) de zona ACTIVO(s) (score≥umbral) dentro del radio del HÉROE, el héroe cosecha esquirlas de gema = zoneEventForageGems(hero) (flat por tier de intensidad, acotado por eventGemCap), banca a h.eventGems vía grantEventGem (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 gemas, 0 floater, 0 grantEventGem ⇒ killEnemy byte-idéntico al HEAD.
export const ZONE_EVENT_SURGE = {
  enabled: true,             // LIVE (EVO#75, CAS-2454). Flip false→true tras QA DARK PASS 8/8 (CAS-2453) + CEO Gate APPROVED 2/2. 17º flag LIVE (arco #59→#74=16). anti-stacking: 1 arco valida a la vez.
  channel: "gemFind",        // canal FRESCO (recompensa de esquirlas de gema por forrajeo DENTRO de un evento activo) — NINGUNA de las 16 flags #59-#74 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency) LLENA ⇒ esquirlas de gema es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency. CEO balance knob.
  radius: 360,               // radio de participación (px): sólo los POIs de evento ACTIVOS dentro de este radio del héroe suman al surge score (los POIs se siembran a 150-300px del héroe ⇒ 360 captura la vecindad de participación). CEO balance knob.
  eventGemCap: 2,            // SUB-CAP DURO PROPIO de las esquirlas de gema por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.gems)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  eventWeights: { shrine:1, chest:2, goblin:2 },   // PESO de participación por tipo de POI (ZONE_EVENTS.types). chest (cofre custodiado por élite) + goblin (duende del tesoro con timer) = eventos de MAYOR valor ⇒ pesan 2; shrine (santuario) = 1. CEO balance knobs. Un tipo ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE EVENTOS ACTIVOS en radio. MÁS participación = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (matar en el vacío sin evento activo NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, gems: 1 },     // Tier 1 — score ≥1 (un evento activo cerca): +1 esquirla de gema por kill. "cazando dentro de un evento de zona".
    { min: 3, gems: 2 },     // Tier 2 — score ≥3 (varios eventos / un evento de alto valor + otro): +2 esquirlas por kill. "en el corazón de un world-event". CEO balance knobs.
  ],
};

// CAS-2456: VARIANTE DE ENCUENTRO ACTIVA (DARK, ENCOUNTER_VARIANT_SURGE) — EVO mecánica #76 (serializa tras #75 ZONE_EVENT_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/TIPO DE UNA VARIANTE DE COMPORTAMIENTO DE ENCUENTRO server-auth** (MMORPG-native: recompensa COMBATIR DENTRO de un encuentro con una variante de comportamiento activa — un patrón dinámico del encuentro — en vez de forrajear en el vacío).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: el subsistema ENCOUNTER_VARIANTS (CAS-2071) hornea DETERMINISTA por-posición una VARIANTE DE COMPORTAMIENTO sobre un mob natural (`maybeVariant`/`applyVariant`, enemyVariantRng ISOLADO off-srand) — `e.variant`/`e.variantTint` en los mobs de `G.enemies` = estado de sim REPLICADO (el MISMO campo que el render lee para el tinte/label de variante). Cada mob-variante lleva `{variant:"stalker"|"bastion"|"glass"}` = MODIFICADOR DE PATRÓN del encuentro (Acechador telegrafía corta+lunge largo · Bastión postura alta · Frágil hp baja+veloz). `variantSurgeScore(h)=Σ variantWeights[e.variant]` sobre los mobs VIVOS con variante dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista de la INTENSIDAD DE VARIANTE en el encuentro de la vecindad. PURA ⇒ MISMO valor para todo observador del mismo snapshot. NO cosmético: la variante gobierna la AI/stats reales del mob (windup/lunge/hp/spd/poise). Muerto/sin variante/neutral ⇒ peso 0.
//    (2) Canal `socketFind` (recompensa de reagentes/esquirlas de engarce por forrajeo DENTRO de un encuentro de variante) — NINGUNA de las 17 flags #59-#75 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind) está LLENA ⇒ pivota a una moneda FRESCA. Reagentes de engarce (h.socketShards) es un recurso TRANSITORIO NUEVO (init en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio variantSocketCap, 0 doble-dip (ningún otro seam banca socketShards). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.variantSurge*`/`G.socketFind*`, 0 clave SERIALIZADA nueva (h.socketShards NO se añade al allowlist de serializeSave ⇒ es contador de runtime transitorio, mirror de h.eventGems/h.flaskCharges). variantSurgeScore = función PURA del snapshot (G.enemies + e.variant + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Reagentes bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint.
//  · ⊥/DISTINTO a las 17 LIVE #59-#75: ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois; esto = MODIFICADOR DE COMPORTAMIENTO del encuentro sobre los MOBS, subsistema distinto), ⊥ #74 (afijo = CALIDAD estática de UN mob individual leída de mobAffixes(e), subsistema MOB_AFFIX; variante = PATRÓN DINÁMICO del encuentro leído de e.variant, subsistema ENCOUNTER_VARIANTS — id-set disjunto {stalker,bastion,glass} vs {swift,armored,vampiric,volatile,frost} — Y maybeVariant NO se apila sobre un cuerpo afijado ⇒ SIN solape de portador), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia de variantes de comportamiento), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un patrón de variante), ⊥ #69 (force-ratio = ENGANCHADOS). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral mientras hay mob(s)-variante VIVO(s) (score≥umbral) dentro del radio del HÉROE, el héroe cosecha reagentes de engarce = variantSurgeForageSockets(hero) (flat por tier de intensidad, acotado por variantSocketCap), banca a h.socketShards vía grantSocket (0 RNG). e.dead=true ya está fijado arriba ⇒ variantWeight(e)=0 ⇒ el mob recién muerto NO auto-cuenta su variante. BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 reagentes, 0 floater, 0 grantSocket ⇒ killEnemy byte-idéntico al HEAD.
export const ENCOUNTER_VARIANT_SURGE = {
  enabled: true,             // LIVE (EVO#76, CAS-2460 flip). Gate 2/2 APPROVED: byte-verify DARK PASS + DARK QA CAS-2457 PASS 23/23. Flip false→true (1 línea de lógica). Rollback si sev-1: true→false + redeploy. anti-stacking: 1 arco valida a la vez.
  channel: "socketFind",     // canal FRESCO (recompensa de reagentes de engarce por forrajeo DENTRO de un encuentro de variante) — NINGUNA de las 17 flags #59-#75 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind) LLENA ⇒ reagentes de engarce es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind. CEO balance knob.
  radius: 260,               // radio del encuentro (px): sólo los mobs-variante VIVOS dentro de este radio del héroe suman al surge score (mismo radio de vecindad-de-mobs que el afijo #74). CEO balance knob.
  variantSocketCap: 2,       // SUB-CAP DURO PROPIO de los reagentes de engarce por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.sockets)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  variantWeights: { stalker:1, bastion:2, glass:1 },   // PESO de variante por id (ENCOUNTER_VARIANTS.variants). bastion (Bastión — postura alta + hp↑ ⇒ el encuentro más largo/exigente) = MAYOR valor ⇒ pesa 2; stalker (Acechador) + glass (Frágil) = 1. CEO balance knobs. Un id ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE VARIANTES VIVAS en radio. MÁS variante = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (matar mobs planos sin variante NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, sockets: 1 },  // Tier 1 — score ≥1 (una variante activa cerca): +1 reagente de engarce por kill. "cazando dentro de un encuentro de variante".
    { min: 3, sockets: 2 },  // Tier 2 — score ≥3 (varias variantes / un Bastión + otra): +2 reagentes por kill. "en el corazón de un encuentro modificado". CEO balance knobs.
  ],
};

// CAS-2464: HAZARD DE ARENA ACTIVO (DARK, ARENA_HAZARD_SURGE) — EVO mecánica #77 (serializa tras #76 ENCOUNTER_VARIANT_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/TIPO/INTENSIDAD DE UN HAZARD DE ARENA ACTIVO server-auth** (MMORPG-native: recompensa COMBATIR/SOBREVIVIR DENTRO de un peligro ambiental de la arena — un hazard activo de `G.hazards` — en vez de forrajear en terreno inerte).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: el subsistema ARENA_HAZARDS (CAS-2094/2103, LIVE) planta DETERMINISTA por-spawn un HAZARD AMBIENTAL telegrafiado (`maybeSpawnHazard`/`updateHazards`, arenaHazardRng ISOLADO off-srand) — cada hazard vivo `{x,y,r,type,def,phase}` en `G.hazards` = estado de sim REPLICADO (el MISMO campo que el render lee para el tint/glyph/anillo del hazard). Cada hazard lleva `{type:"magma"|"poison"|"bramble"|"collapse"|"ice"|"void", phase:"telegraph"|"active"|"fade"}` = PELIGRO AMBIENTAL de la arena (magma quema · veneno · zarza sangra · derrumbe físico · hielo ralentiza · vacío). `hazardSurgeScore(h)=Σ hazardWeights[hz.type]` sobre los hazards en fase **`active`** (la ventana que DAÑA) dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista de la INTENSIDAD DE HAZARD en la vecindad de la arena. PURA ⇒ MISMO valor para todo observador del mismo snapshot. El hazard gobierna daño/status REALes (updateHazards); telegraph/fade ⇒ peso 0 (sólo la ventana activa cuenta).
//    (2) Canal `healPotency` (recompensa de brasas restaurativas por forrajeo DENTRO de un hazard activo) — NINGUNA de las 18 flags #59-#76 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind) está LLENA ⇒ pivota a una moneda FRESCA. Brasas restaurativas (h.hazardMotes) es un recurso TRANSITORIO NUEVO (init en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio hazardMoteCap, 0 doble-dip (ningún otro seam banca hazardMotes). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.hazardSurge*`/`G.healPotency*`, 0 clave SERIALIZADA nueva (h.hazardMotes NO se añade al allowlist de serializeSave ⇒ es contador de runtime transitorio, mirror de h.eventGems/h.flaskCharges/h.socketShards). hazardSurgeScore = función PURA del snapshot (G.hazards + hz.phase + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Brasas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint.
//  · ⊥/DISTINTO a las 18 LIVE #59-#76: ⊥ #76 (variante = MODIFICADOR DE COMPORTAMIENTO sobre los MOBS leído de e.variant/G.enemies, subsistema ENCOUNTER_VARIANTS; hazard = PELIGRO AMBIENTAL DE LA ARENA leído de G.hazards, subsistema ARENA_HAZARDS — independiente de qué mobs haya), ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois; hazard = peligro ambiental efímero telegrafiado, otro contenedor), ⊥ #74 (afijo = CALIDAD estática de UN mob leída de mobAffixes(e), subsistema MOB_AFFIX; hazard NO es un mob), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = presencia/tipo de hazards ambientales), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de un peligro de arena), ⊥ #69 (force-ratio = ENGANCHADOS). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral mientras hay hazard(s) en fase `active` (score≥umbral) dentro del radio del HÉROE, el héroe cosecha brasas restaurativas = hazardSurgeForageMotes(hero) (flat por tier de intensidad, acotado por hazardMoteCap), banca a h.hazardMotes vía grantHazardMote (0 RNG). Los hazards NO son mobs ⇒ matar uno NO altera G.hazards ⇒ sin auto-conteo. BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 brasas, 0 floater, 0 grantHazardMote ⇒ killEnemy byte-idéntico al HEAD (independiente de que ARENA_HAZARDS esté LIVE).
export const ARENA_HAZARD_SURGE = {
  enabled: true,             // LIVE (EVO#77, CAS-2466). Flip false→true tras QA DARK PASS 10/10 + CEO Gate 1/2 & 2/2 APPROVED. Hazard de Arena Activo: forrajeo de brasas restaurativas al matar mobs dentro de hazards ACTIVOS. anti-stacking: 1 arco valida a la vez.
  channel: "healPotency",    // canal FRESCO (recompensa de brasas restaurativas por forrajeo DENTRO de un hazard activo) — NINGUNA de las 18 flags #59-#76 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind) LLENA ⇒ brasas restaurativas es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind. CEO balance knob.
  radius: 260,               // radio de la arena (px): sólo los hazards ACTIVOS dentro de este radio del héroe suman al surge score (misma vecindad que el afijo #74 / variante #76). CEO balance knob.
  hazardMoteCap: 2,          // SUB-CAP DURO PROPIO de las brasas por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.motes)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  hazardWeights: { magma:2, poison:2, bramble:1, collapse:1, ice:1, void:1 },   // PESO de hazard por tipo (ARENA_HAZARDS.types). magma/poison (aplican un STATUS DoT dañino — quemadura/veneno statusDmg3) = MAYOR valor ⇒ pesan 2; bramble/collapse/ice/void = 1. CEO balance knobs. Un tipo ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE HAZARDS ACTIVOS en radio. MÁS/más-intensos hazards = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (matar mobs en arena inerte NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, motes: 1 },  // Tier 1 — score ≥1 (un hazard activo cerca): +1 brasa restaurativa por kill. "combatiendo al borde de un peligro de arena".
    { min: 3, motes: 2 },  // Tier 2 — score ≥3 (un hazard DoT + otro, o dos DoT): +2 brasas por kill. "sobreviviendo en el corazón de la arena hostil". CEO balance knobs.
  ],
};

// CAS-2468: FASE DE ENFURECIMIENTO DE JEFE (DARK, BOSS_ENRAGE_SURGE) — EVO mecánica #78 (serializa tras #77 ARENA_HAZARD_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/INTENSIDAD DE UNA FASE DE ENFURECIMIENTO DE JEFE server-auth** (MMORPG-native: recompensa COMBATIR/SOBREVIVIR mientras un jefe/campeón cruzó su umbral de furia — su cambio de fase real — en vez de forrajear frente a un jefe inerte de tope-de-HP).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: el subsistema de CAMBIO-DE-FASE-CAPSTONE (CAS-65, LIVE) marca DETERMINISTA por-daño un ENFURECIMIENTO sobre un jefe/campeón (`updateEnemies` sim.js: al cruzar `e.hp<=e.maxHp*e.enrageAt` UNA vez ⇒ `e.enraged=true` + acelera spd + aprieta los tells (windup·enrageWindup) + habilita el slam-radial del climax). `e.enraged`/`e.capstone`/`e.isBoss` en los enemigos de `G.enemies` = estado de sim REPLICADO (el MISMO flag que la AI lee para la velocidad/tells/slam de fase-2). `enrageSurgeScore(h)=Σ enrageWeights[kind(e)]` sobre los jefes/campeones VIVOS **ENFURECIDOS** (`e.enraged===true`) dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista de la INTENSIDAD DE FURIA en la vecindad. PURA ⇒ MISMO valor para todo observador del mismo snapshot. NO cosmético: el enrage gobierna spd/windup/slam REALes del jefe. Muerto / no-enfurecido (>umbral de HP) / no-jefe ⇒ peso 0 (la fase-1 tope-de-HP NO cuenta — sólo la ventana ENFURECIDA).
//    (2) Canal `trophyFind` (recompensa de trofeos de guerra por forrajeo mientras un jefe está ENFURECIDO) — NINGUNA de las 19 flags #59-#77 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency) está LLENA ⇒ pivota a una moneda FRESCA. Trofeos de guerra (h.enrageTrophies) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio enrageTrophyCap, 0 doble-dip (ningún otro seam banca enrageTrophies). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.enrageSurge*`/`G.trophyFind*`, 0 clave SERIALIZADA nueva (h.enrageTrophies NO se añade al allowlist de serializeSave ⇒ es contador de runtime transitorio, mirror de h.eventGems/h.socketShards/h.hazardMotes). enrageSurgeScore = función PURA del snapshot (G.enemies + e.enraged + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Trofeos bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint.
//  · ⊥/DISTINTO a las 19 LIVE #59-#77: ⊥ #77 (hazard = PELIGRO AMBIENTAL de la arena leído de G.hazards; enrage = ESTADO DE FASE de un JEFE leído de e.enraged/G.enemies, otro contenedor y otro subsistema), ⊥ #76 (variante = MODIFICADOR DE COMPORTAMIENTO horneado al spawn sobre mobs NATURALES leído de e.variant [ENCOUNTER_VARIANTS, id-set {stalker,bastion,glass}]; enrage = TRANSICIÓN DE FASE POR-DAÑO de un jefe/campeón [CAS-65, e.enraged] — subsistema disjunto, y un mob-variante natural NO es capstone ⇒ SIN solape de portador), ⊥ #74 (afijo = CALIDAD estática de UN mob; enrage = ESTADO DINÁMICO de fase-2 de un jefe), ⊥ #73 (apex = **DISTANCIA** al jefe/campeón más cercano [apexNearestDist, mide proximidad SEA CUAL SEA su fase]; enrage = **PRESENCIA DE LA FASE ENFURECIDA** en radio [independiente de la distancia exacta: un jefe a la MISMA distancia puntúa 0 en fase-1 tope-de-HP y >0 sólo tras enfurecerse] ⇒ ejes ortogonales sobre el mismo cuerpo), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de una fase de furia), ⊥ #69 (force-ratio = ENGANCHADOS). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy. Al matar un mob no-neutral mientras hay jefe(s)/campeón(es) ENFURECIDO(s) (score≥umbral) dentro del radio del HÉROE, el héroe cosecha trofeos de guerra = enrageSurgeForageTrophies(hero) (flat por tier de intensidad, acotado por enrageTrophyCap), banca a h.enrageTrophies vía grantTrophy (0 RNG). e.dead=true ya está fijado arriba ⇒ enrageWeight(e)=0 ⇒ el jefe recién muerto NO auto-cuenta su furia. BYTE-NEUTRO OFF: enabled:false ⇒ la rama entera es CÓDIGO MUERTO ⇒ 0 trofeos, 0 floater, 0 grantTrophy ⇒ killEnemy byte-idéntico al HEAD (independiente de que CAS-65 enrage esté LIVE).
export const BOSS_ENRAGE_SURGE = {
  enabled: true,             // LIVE (EVO#78, CAS-2473). Flip false→true tras QA DARK PASS 10/10 (CAS-2471/CAS-2472) + CEO Gate 2/2. Fase de Enfurecimiento de Jefe: forrajeo de trofeos de guerra al matar mobs mientras un jefe/campeón está ENFURECIDO. anti-stacking: 1 arco valida a la vez.
  channel: "trophyFind",     // canal FRESCO (recompensa de trofeos de guerra por forrajeo mientras un jefe está ENFURECIDO) — NINGUNA de las 19 flags #59-#77 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency) LLENA ⇒ trofeos de guerra es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los jefes/campeones ENFURECIDOS dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77). CEO balance knob.
  enrageTrophyCap: 2,        // SUB-CAP DURO PROPIO de los trofeos por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.trophies)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  enrageWeights: { boss:2, champion:1 },   // PESO de furia por CLASE del portador enfurecido: boss (e.isBoss — jefe mayor de arena/firma/rush, la fase-2 más letal) = MAYOR valor ⇒ pesa 2; champion (capstone de campeón, e.capstone sin isBoss) = 1. CEO balance knobs. Una clase ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE FURIA VIVA en radio. MÁS/mayor-clase de furia = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (matar mobs frente a un jefe en fase-1 tope-de-HP NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, trophies: 1 },  // Tier 1 — score ≥1 (un campeón enfurecido cerca): +1 trofeo de guerra por kill. "combatiendo al borde de una furia".
    { min: 3, trophies: 2 },  // Tier 2 — score ≥3 (un jefe enfurecido + otro, o jefe+campeón): +2 trofeos por kill. "en el corazón de una furia de jefe". CEO balance knobs.
  ],
};

// CAS-2477: CAMPO DE BOTÍN DENSO (DARK, SPOILS_FIELD_SURGE) — EVO mecánica #79 (serializa tras #78 BOSS_ENRAGE_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/DENSIDAD DE UN CAMPO DE BOTÍN EN EL SUELO server-auth** (MMORPG-native: recompensa REMATAR/FORRAJEAR mientras el suelo de la vecindad está ENTERRADO en botín sin recoger — un campo de despojos denso — en vez de rematar sobre suelo limpio).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — SÍ existe: los DROPS DE SUELO `G.drops` (LIVE desde el core del loot, sim.js) son sim state REPLICADO. Cada drop VIVO (`!d.taken`) `{x,y,kind}` en `G.drops` = objeto de botín sembrado DETERMINISTA por el motor al matar/abrir cofre (`G.drops.push` en killEnemy/openGuardedChest/dropGear/rune — el MISMO array que el render lee para dibujar el brillo del loot y que el pickup consume). `kind ∈ {gear,rune,gold,potionhp,potionmp}`. `spoilsFieldScore(h)=Σ spoilsWeights[d.kind]` sobre los drops NO recogidos dentro de `radius` del héroe ∈ [0,∞) = snapshot determinista de la DENSIDAD DE BOTÍN en la vecindad del suelo. PURA ⇒ MISMO valor para todo observador del mismo snapshot. Recogido (`d.taken`) ⇒ peso 0 (sale del campo).
//    (2) Canal `salvageFind` (recompensa de esquirlas de chatarra/salvage por rematar DENTRO de un campo de botín denso) — NINGUNA de las 20 flags #59-#78 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind) está LLENA ⇒ pivota a una moneda FRESCA. Esquirlas de chatarra (h.salvageShards) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio spoilsSalvageCap, 0 doble-dip (ningún otro seam banca salvageShards). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.spoilsField*`/`G.salvageFind*`, 0 clave SERIALIZADA nueva (h.salvageShards NO se añade al allowlist de serializeSave ⇒ es contador de runtime transitorio, mirror de h.eventGems/h.socketShards/h.hazardMotes/h.enrageTrophies). spoilsFieldScore = función PURA del snapshot (G.drops + d.taken + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Chatarra banca fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: el score se muestrea en el TOP de killEnemy (`_spoilsPre`, ANTES de que este kill empuje sus propios drops) ⇒ los drops recién soltados por el mob muerto NO inflan su propia recompensa (rematar sobre suelo limpio NO da forrajeo aunque el kill genere oro).
//  · ⊥/DISTINTO a las 20 LIVE #59-#78: ⊥ #78 (furia = ESTADO DE FASE de un JEFE leído de e.enraged/G.enemies; botín = OBJETOS DE LOOT en el suelo leídos de G.drops, otro contenedor y otro subsistema — independiente de qué mobs/jefes haya), ⊥ #77 (hazard = PELIGRO AMBIENTAL de la arena leído de G.hazards; un drop de suelo NO es un hazard), ⊥ #76 (variante = MODIFICADOR de comportamiento sobre los mobs leído de e.variant; un drop NO es un mob), ⊥ #75 (evento de zona = POIs de EVENTO en G.zoneEvents.pois — santuarios/cofres/duendes, contenedor DISTINTO; campo de botín = OBJETOS DE LOOT ya soltados en G.drops, independiente de si hay un evento activo), ⊥ #74 (afijo = CALIDAD estática de UN mob; botín = densidad de objetos en el suelo), ⊥ #73 (apex = DISTANCIA a UN jefe; esto = densidad de botín en el suelo), ⊥ #72 (escasez = AUSENCIA de mobs; esto = PRESENCIA de despojos), ⊥ #69 (force-ratio = ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD/piso de rareza del PRÓXIMO drop rodado en rollGearInst; botín = DENSIDAD de los objetos YA en el suelo — eje DENSIDAD-DE-SUELO vs CALIDAD-DE-TIRADA, contenedor G.drops vs parámetro de RNG). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_spoilsPre` muestreado en el TOP). Al matar un mob no-neutral mientras el suelo de la vecindad del HÉROE tenía botín denso (score≥umbral ANTES de este kill) dentro del radio, el héroe cosecha esquirlas de chatarra = spoilsFieldForageSalvage(hero, tpl, _spoilsPre) (flat por tier de densidad, acotado por spoilsSalvageCap), banca a h.salvageShards vía grantSalvage (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_spoilsPre` = 0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 chatarra, 0 floater, 0 grantSalvage ⇒ killEnemy byte-idéntico al HEAD.
export const SPOILS_FIELD_SURGE = {
  enabled: true,             // LIVE (EVO#79 — CAS-2479 flip false→true; 21º flag). Config-only, reversible (true→false + redeploy), mirror CAS-2043/2055/2075/2093/2473. enabled:false ⇒ `_spoilsPre`=0 + seam CÓDIGO MUERTO ⇒ byte-idéntico al HEAD. anti-stacking: 1 arco valida a la vez.
  channel: "salvageFind",    // canal FRESCO (recompensa de esquirlas de chatarra por rematar DENTRO de un campo de botín denso) — NINGUNA de las 20 flags #59-#78 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind) LLENA ⇒ esquirlas de chatarra es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind. CEO balance knob.
  radius: 260,               // radio de la vecindad del suelo (px): sólo los drops NO recogidos dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78). CEO balance knob.
  spoilsSalvageCap: 2,       // SUB-CAP DURO PROPIO de las esquirlas de chatarra por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.salvage)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  spoilsWeights: { gear:2, rune:2, gold:1, potionhp:1, potionmp:1 },   // PESO de botín por TIPO de drop (G.drops kind): gear (equipo) + rune (runa de engarce) = despojos de MAYOR valor ⇒ pesan 2; gold/potionhp/potionmp = 1. CEO balance knobs. Un tipo ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE BOTÍN NO RECOGIDO en radio. MÁS/mayor-valor de despojos = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (rematar sobre suelo limpio NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, salvage: 1 },  // Tier 1 — score ≥1 (un par de despojos comunes / una pieza de equipo cerca): +1 esquirla de chatarra por kill. "rematando en un suelo con botín".
    { min: 3, salvage: 2 },  // Tier 2 — score ≥3 (una pieza de equipo + otros despojos, o un campo denso): +2 esquirlas por kill. "en el corazón de un campo de despojos". CEO balance knobs.
  ],
};

// CAS-2481: CAMPO DE CARNICERÍA (DARK, CARNAGE_FIELD_SURGE) — EVO mecánica #80 (serializa tras #79 SPOILS_FIELD_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/DENSIDAD DE UN CAMPO DE CADÁVERES RECIÉN CAÍDOS server-auth** (MMORPG-native: recompensa REMATAR mientras la vecindad del suelo está SEMBRADA de los cuerpos de los recién abatidos — un campo de carnicería activo — en vez de rematar sobre un suelo limpio de bajas). Premia la matanza EN RÁFAGA de una manada (los cadáveres viven CORPSE_LIFE=2.6s ⇒ es carnicería FRESCA, no un osario rancio).
//  · PRE-FLIGHT HARD GATE (escalera del issue):
//    (1) Estado server-authoritative REAL — el candidato líder del issue (warband/densidad-de-aliados, `G.players`) NO existe replicado en este cliente (no hay array de players remotos ni módulo de red; el North Star 2-cliente es CONVERGENCIA determinista del worldFingerprint, NO peers visibles) ⇒ NO se fuerza. Eje FRESCO alterno SÍ presente: los CADÁVERES `G.corpses` — poblados DETERMINISTA en el path AUTORITATIVO killEnemy (sim.js:5674, un cuerpo por cada muerte de mob `richAnim`) y ENVEJECIDOS/reapeados en el tick de paso-fijo AUTORITATIVO updateCorpses (sim.js:7421, CORPSE_LIFE=2.6s). Cada cadáver VIVO `{x,y,size,isBoss,champion,t}` = snapshot determinista ⇒ MISMO valor para todo observador del mismo seed (convergencia byte-a-byte). Que NADA de gameplay lea hoy G.corpses ("presentation-only") es EXACTAMENTE lo que lo hace un eje 0-contestado/FRESCO. `carnageFieldScore(h)=Σ carnageWeights[rango]` sobre los cadáveres dentro de `radius` del héroe ∈ [0,∞) = DENSIDAD DE BAJAS en la vecindad.
//    (2) Canal `boneFind` (recompensa de fichas de osario/hueso por rematar DENTRO de un campo de cadáveres denso) — NINGUNA de las 21 flags #59-#79 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind) está LLENA ⇒ pivota a una moneda FRESCA. Fichas de osario (h.boneTokens) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio carnageBoneCap, 0 doble-dip (ningún otro seam banca boneTokens). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.carnageField*`/`G.boneFind*`, 0 clave SERIALIZADA nueva (h.boneTokens NO se añade al allowlist de serializeSave ⇒ contador de runtime transitorio, mirror de h.salvageShards/h.enrageTrophies/h.hazardMotes/h.eventGems/h.socketShards). carnageFieldScore = función PURA del snapshot (G.corpses + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Fichas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: el score se muestrea en el TOP de killEnemy (`_carnagePre`, ANTES de que ESTE kill empuje su propio cadáver en sim.js:5674) ⇒ el cuerpo recién caído del mob muerto NO infla su propia recompensa (rematar un mob SOLITARIO sobre un suelo sin bajas NO da forrajeo aunque el kill genere su cadáver).
//  · ⊥/DISTINTO a las 21 LIVE #59-#79: ⊥ #79 (botín = OBJETOS DE LOOT recogibles en `G.drops`, kind gear/rune/gold/potion, persisten hasta d.taken; carnicería = CUERPOS de enemigos en `G.corpses`, NO recogibles, despawnan en CORPSE_LIFE — otro contenedor y otro ciclo de vida: puedes tener un cadáver con su botín YA recogido [0 botín, alta carnicería] o loot de cofre sin cadáver [alto botín, 0 carnicería]), ⊥ #78 (furia = ESTADO DE FASE de un JEFE VIVO leído de e.enraged/G.enemies; carnicería = CUERPOS MUERTOS en G.corpses — vivo vs muerto, otro contenedor), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS [G.enemies count bajo]; carnicería = PRESENCIA de mobs MUERTOS [G.corpses count alto] — contenedores DISTINTOS que DIVERGEN: una batalla masiva EN CURSO = muchos vivos [baja escasez] Y muchos cadáveres [alta carnicería] SIMULTÁNEO; una zona recién entrada = muchos vivos, CERO cadáveres; una zona abandonada hace rato = pocos vivos [alta escasez] pero cadáveres YA despawneados [cero carnicería]), ⊥ #77 (hazard = peligro ambiental G.hazards; un cadáver NO es un hazard), ⊥ #76 (variante = e.variant sobre mobs VIVOS; un cadáver NO es un mob vivo), ⊥ #75 (evento de zona = POIs en G.zoneEvents.pois), ⊥ #74 (afijo = CALIDAD de un mob), ⊥ #73 (apex = DISTANCIA a un jefe VIVO), ⊥ #69 (force-ratio = ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_carnagePre` muestreado en el TOP). Al matar un mob no-neutral mientras la vecindad del HÉROE tenía cadáveres densos (score≥umbral ANTES de este kill) dentro del radio, el héroe cosecha fichas de osario = carnageFieldForageBones(hero, tpl, _carnagePre) (flat por tier de densidad, acotado por carnageBoneCap), banca a h.boneTokens vía grantBone (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_carnagePre` = 0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 fichas, 0 floater, 0 grantBone ⇒ killEnemy byte-idéntico al HEAD.
export const CARNAGE_FIELD_SURGE = {
  enabled: true,             // LIVE (CAS-2484 flip config-only false→true, EVO#80 22º flag) — Gate 1/2 CEO byte-verify DARK PASS 15/15 + Gate 2/2 QA DARK 2× indep PASS 17/17 (CAS-2482/2483). Reversible: true→false + redeploy = rollback. mirror CAS-2043/2055/2075/2093/2473/2479.
  channel: "boneFind",       // canal FRESCO (recompensa de fichas de osario por rematar DENTRO de un campo de cadáveres denso) — NINGUNA de las 21 flags #59-#79 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind) LLENA ⇒ fichas de osario es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind. CEO balance knob.
  radius: 260,               // radio de la vecindad del suelo (px): sólo los cadáveres dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78 / botín #79). CEO balance knob.
  carnageBoneCap: 2,         // SUB-CAP DURO PROPIO de las fichas de osario por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.bone)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  carnageWeights: { boss:3, champion:2, normal:1 },   // PESO de un cadáver por RANGO: el cuerpo de un JEFE caído domina el campo (3), un campeón pesa 2, un mob normal (richAnim) 1. Rango leído de corpse.isBoss/corpse.champion. CEO balance knobs. Rango ausente ⇒ peso normal (1, fallback).
  // TABLA de tiers por SUMA DE PESO DE CADÁVERES en radio. MÁS/mayor-rango de bajas = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor ⇒ Tier 0 ⇒ +0 (rematar un mob solitario sobre suelo sin bajas NO da forrajeo). Determinista, LUT pura.
  tiers: [
    { min: 1, bone: 1 },     // Tier 1 — score ≥1 (un cadáver reciente cerca): +1 ficha de osario por kill. "rematando sobre un campo con bajas".
    { min: 3, bone: 2 },     // Tier 2 — score ≥3 (una manada abatida en ráfaga, o el cuerpo de un jefe): +2 fichas por kill. "en el corazón de un campo de carnicería". CEO balance knobs.
  ],
};

// CAS-2488: FRAGOR DE FUEGO CRUZADO (DARK, CROSSFIRE_FRAY_SURGE) — EVO mecánica #81 (serializa tras #80 CARNAGE_FIELD_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/DENSIDAD DE UN CAMPO DE PROYECTILES EN VUELO server-auth** (MMORPG-native: recompensa COMBATIR/REMATAR EN MEDIO DEL FRAGOR de un tiroteo denso y contestado — proyectiles/hechizos EN VUELO por el aire, propios Y enemigos — en vez del duelo aislado sobre suelo tranquilo. La gran batalla a distancia, no el mano-a-mano en un pasillo vacío). Premia pelear DENTRO de una lluvia de fuego cruzado (el fuego ENTRANTE del enemigo pesa el doble: es el peligro real de sostenerse en el fragor).
//  · PRE-FLIGHT HARD GATE (escalera del issue, aprende de #80):
//    (1) Estado server-authoritative REAL — el candidato líder del issue (densidad de proyectiles, `G.projectiles`) SÍ existe replicado/autoritativo en este cliente: `G.projectiles` se declara en el estado de sim (sim.js:192, `projectiles:[]`), se PUEBLA en el path AUTORITATIVO (spawns de hechizo/ataque del héroe sim.js:5153/6199/7232 y de enemigos sim.js:7786/7794/7996/… con `p.enemy`), se AVANZA/FILTRA en el tick de paso-fijo AUTORITATIVO `updateProjectiles` (sim.js:8376 mueve p.x+=p.vx*dt / p.life-=dt; filtra life>0 en 8405), y se limpia en los resets de arena. Cada proyectil VIVO `{x,y,vx,vy,life,kind,enemy}` = snapshot determinista del mismo seed ⇒ MISMO valor para todo observador (convergencia byte-a-byte). Que NINGUNA de las 22 flags LIVE #59-#80 lea hoy `G.projectiles` como eje de score ("presentation/combat-only, no forrajeo") es EXACTAMENTE lo que lo hace un eje 0-contestado/FRESCO. `frayFieldScore(h)=Σ frayWeights[lado]` sobre los proyectiles dentro de `radius` del héroe ∈ [0,∞) = DENSIDAD DE FUEGO CRUZADO en la vecindad.
//    (2) Canal `frayFind` (recompensa de ascuas de fragor por rematar DENTRO de un fuego cruzado denso) — NINGUNA de las 22 flags #59-#80 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind) está LLENA ⇒ pivota a una moneda FRESCA. Ascuas de fragor (h.frayEmbers) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio frayEmberCap, 0 doble-dip (ningún otro seam banca frayEmbers). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.crossfireFray*`/`G.frayFind*`, 0 clave SERIALIZADA nueva (h.frayEmbers NO se añade al allowlist de serializeSave ⇒ contador de runtime transitorio, mirror de h.boneTokens/h.salvageShards/h.enrageTrophies/h.hazardMotes/h.eventGems/h.socketShards). frayFieldScore = función PURA del snapshot (G.projectiles + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Ascuas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: el score se muestrea en el TOP de killEnemy (`_frayPre`, ANTES del splice del mob), y la TABLA exige score≥2 ⇒ una sola bala tuya en vuelo (peso hero 1) NO llega a Tier 1 ⇒ rematar en un DUELO aislado (tu único proyectil, sin fuego cruzado) NO forrajea; hace falta fuego cruzado GENUINO (≥2 proyectiles, o ≥1 proyectil ENTRANTE del enemigo).
//  · ⊥/DISTINTO a las 22 LIVE #59-#80: ⊥ #80 (carnicería = CUERPOS MUERTOS en `G.corpses`, estáticos, despawnan en CORPSE_LIFE; fragor = PROYECTILES EN VUELO en `G.projectiles`, con velocidad, expiran por p.life — OTRO contenedor y otro ciclo de vida: un campo tras una masacre melee = muchos cadáveres [alta carnicería] Y CERO proyectiles en vuelo [cero fragor]; un tiroteo a distancia EN CURSO = lluvia de proyectiles [alto fragor] Y CERO cadáveres aún [cero carnicería] — DIVERGEN), ⊥ #79 (botín = OBJETOS DE LOOT recogibles en `G.drops` que persisten hasta d.taken; fragor = munición EN VUELO NO recogible que expira por life — otro contenedor), ⊥ #78 (furia = ESTADO DE FASE de un JEFE VIVO e.enraged/`G.enemies`; fragor = proyectiles inanimados en el aire, sin importar quién los disparó — un jefe enfurecido en melee sin lanzar nada = alta furia/cero fragor), ⊥ #77 (hazard = zona de peligro ambiental PERSISTENTE de `G.hazards`; un proyectil EN VUELO con velocidad NO es un hazard de arena estático), ⊥ #76 (variante = e.variant sobre mobs VIVOS), ⊥ #75 (evento de zona = POIs en `G.zoneEvents.pois`), ⊥ #74 (afijo = CALIDAD de un mob), ⊥ #73 (apex = DISTANCIA a un jefe VIVO), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS [G.enemies count]), ⊥ #69 (force-ratio = ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_frayPre` muestreado en el TOP). Al matar un mob no-neutral mientras la vecindad del HÉROE estaba EN FUEGO CRUZADO (proyectiles densos en vuelo, score≥umbral ANTES de este kill) dentro del radio, el héroe cosecha ascuas de fragor = crossfireFrayForageEmbers(hero, tpl, _frayPre) (flat por tier de densidad, acotado por frayEmberCap), banca a h.frayEmbers vía grantFrayEmber (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_frayPre` = 0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 ascuas, 0 floater, 0 grantFrayEmber ⇒ killEnemy byte-idéntico al HEAD.
export const CROSSFIRE_FRAY_SURGE = {
  enabled: true,             // LIVE (CAS-2491 flip) — Gate CEO 1/2 byte-verify PASS + Gate 2/2 DARK QA PASS @74a39c7. 23º flag LIVE. Reversible en 1 línea (true→false + redeploy). mirror CAS-2484/2479.
  channel: "frayFind",       // canal FRESCO (recompensa de ascuas de fragor por rematar DENTRO de un fuego cruzado denso) — NINGUNA de las 22 flags #59-#80 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind) LLENA ⇒ ascuas de fragor es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los proyectiles dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78 / botín #79 / carnicería #80). CEO balance knob.
  frayEmberCap: 2,           // SUB-CAP DURO PROPIO de las ascuas de fragor por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.ember)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  frayWeights: { enemy: 2, hero: 1 },   // PESO de un proyectil por LADO: el fuego ENTRANTE del enemigo (p.enemy) pesa el doble (2) — es el peligro real de sostenerse en el fragor; el fuego SALIENTE propio pesa 1. Lado leído de p.enemy (true→enemy, else→hero). CEO balance knobs. Lado ausente ⇒ peso hero (1, fallback).
  // TABLA de tiers por SUMA DE PESO DE PROYECTILES en radio. MÁS densidad/mayor-proporción de fuego entrante = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (una sola bala tuya en un duelo aislado NO forrajea; hace falta fuego cruzado genuino). Determinista, LUT pura.
  tiers: [
    { min: 2, ember: 1 },    // Tier 1 — score ≥2 (fuego cruzado ligero: ≥2 proyectiles propios, o ≥1 proyectil ENTRANTE del enemigo): +1 ascua de fragor por kill. "rematando bajo fuego".
    { min: 5, ember: 2 },    // Tier 2 — score ≥5 (una lluvia densa de fuego cruzado contestado): +2 ascuas por kill. "en el corazón del fragor". CEO balance knobs.
  ],
};

// CAS-2493: VORÁGINE DE ZONAS DE ÁREA (DARK, MAELSTROM_FIELD_SURGE) — EVO mecánica #82 (serializa tras #81 CROSSFIRE_FRAY_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/DENSIDAD DE UN CAMPO DE ZONAS DE NEGACIÓN DE ÁREA server-auth** (MMORPG-native: recompensa COMBATIR/REMATAR EN MEDIO DE UNA VORÁGINE de zonas de negación de área persistentes solapadas — los campos DoT/AoE plantados por hechizos de área que cubren el suelo — en vez del duelo aislado sobre tierra despejada. El mago de área que carboniza el terreno y remata dentro de su propia tormenta, no el golpe único en un pasillo limpio). Premia pelear DENTRO de una vorágine densa (una zona GRANDE de negación pesa el doble: cubre más suelo, es más devastadora).
//  · PRE-FLIGHT HARD GATE (escalera del issue, aprende de #80/#81):
//    (1) El candidato LÍDER del issue (densidad de DESTRUCTIBLES/props, `G.props`/`G.destructibles`/`G.breakables`) **NO EXISTE** replicado/autoritativo en este cliente (0 declaración, 0 populate, 0 tick) ⇒ NO se fuerza el candidato. PIVOTE a un eje alterno FRESCO justificado: `G.fields` = ZONAS DE NEGACIÓN DE ÁREA persistentes. SÍ existe replicado/autoritativo — declarado en el estado de sim (`fields:[]`), POBLADO en el path AUTORITATIVO (el caso "field" de castSpell sim.js:6286 `G.fields.push(f)` con `spellDmg`), TICKEADO en el reloj de paso-fijo AUTORITATIVO `updateFields`/`fieldTick` (f.life-=dt / f.acc+=dt, filtra life>0), y LIMPIADO en cada frontera de run/escena (`G.fields.length=0` en createHero/resets de arena). Cada zona VIVA `{x,y,r,dmg,life,...}` = snapshot determinista del mismo seed ⇒ MISMO valor para todo observador (convergencia byte-a-byte). Que NINGUNA de las 23 flags LIVE #59-#81 lea hoy `G.fields` como eje de score ("combate/presentación-only, no forrajeo") es EXACTAMENTE lo que lo hace un eje 0-contestado/FRESCO. `maelstromFieldScore(h)=Σ maelstromWeights[tamaño]` sobre las zonas dentro de `radius` del héroe ∈ [0,∞) = DENSIDAD DE VORÁGINE en la vecindad.
//    (2) Canal `maelstromFind` (recompensa de cargas de vorágine por rematar DENTRO de una vorágine densa) — NINGUNA de las 23 flags #59-#81 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind) está LLENA ⇒ pivota a una moneda FRESCA. Cargas de vorágine (h.maelstromCharges) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio maelstromChargeCap, 0 doble-dip (ningún otro seam banca maelstromCharges). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.maelstrom*`, 0 clave SERIALIZADA nueva (h.maelstromCharges NO se añade al allowlist de serializeSave ⇒ contador de runtime transitorio, mirror de h.frayEmbers/h.boneTokens/h.salvageShards). maelstromFieldScore = función PURA del snapshot (G.fields + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Cargas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: el score se muestrea en el TOP de killEnemy (`_maelPre`, ANTES del splice del mob), y la TABLA exige score≥2 ⇒ rematar dentro de UNA sola zona pequeña incidental (peso 1) NO llega a Tier 1 ⇒ hace falta una vorágine GENUINA (≥2 zonas, o ≥1 zona GRANDE).
//  · ⊥/DISTINTO a las 23 LIVE #59-#81: ⊥ #81 (fragor = PROYECTILES EN VUELO en `G.projectiles` con velocidad que expiran por p.life; vorágine = ZONAS ESTÁTICAS de negación en `G.fields`, fijas en {x,y}, que tickean en su sitio y expiran por f.life — OTRO contenedor y otro ciclo: un tiroteo a distancia = muchos proyectiles [alto fragor] Y CERO campos [cero vorágine]; un mago carbonizando el suelo en melee = muchas zonas [alta vorágine] Y CERO proyectiles [cero fragor] — DIVERGEN), ⊥ #80 (carnicería = CUERPOS MUERTOS en `G.corpses`; una zona de negación VIVA no es un cadáver), ⊥ #79 (botín = OBJETOS DE LOOT recogibles en `G.drops`; una zona de negación no es recogible), ⊥ #78 (furia = ESTADO DE FASE de un JEFE VIVO e.enraged/`G.enemies`), ⊥ #77 (hazard = zona de peligro ambiental de `G.hazards` GATEADA por un jefe/élite vivo [bossOrElitePresent]; la vorágine lee `G.fields` = campos plantados por HECHIZOS del héroe, NO gateados por jefe, OTRO contenedor y otro path de populate — un jefe con hazards de arena pero sin campos-de-hechizo del héroe = alto hazard/cero vorágine; un mago sembrando zonas en campo abierto sin jefe = cero hazard/alta vorágine — DIVERGEN), ⊥ #76 (variante = e.variant sobre mobs VIVOS), ⊥ #75 (evento de zona = POIs en `G.zoneEvents.pois`), ⊥ #74 (afijo = CALIDAD de un mob), ⊥ #73 (apex = DISTANCIA a un jefe VIVO), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS [G.enemies count]), ⊥ #69 (force-ratio = ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_maelPre` muestreado en el TOP). Al matar un mob no-neutral mientras la vecindad del HÉROE estaba EN UNA VORÁGINE DENSA (zonas de negación densas, score≥umbral ANTES de este kill) dentro del radio, el héroe cosecha cargas de vorágine = maelstromFieldForageCharges(hero, tpl, _maelPre) (flat por tier de densidad, acotado por maelstromChargeCap), banca a h.maelstromCharges vía grantMaelstromCharge (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_maelPre` = 0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 cargas, 0 floater, 0 grantMaelstromCharge ⇒ killEnemy byte-idéntico al HEAD.
export const MAELSTROM_FIELD_SURGE = {
  enabled: true,             // LIVE (CAS-2495 flip) — EVO#82 24º flag encendido. Gate 1/2 CEO byte-verify PASS 15/15 fp 15920977 + Gate 2/2 DARK QA CAS-2494 indep PASS 15/15 ⇒ flip config-only aprobado.
  channel: "maelstromFind",  // canal FRESCO (recompensa de cargas de vorágine por rematar DENTRO de una vorágine densa) — NINGUNA de las 23 flags #59-#81 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind) LLENA ⇒ cargas de vorágine es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo las zonas de negación cuyo CENTRO cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78 / botín #79 / carnicería #80 / fragor #81). CEO balance knob.
  largeR: 60,                // umbral de radio (px) de una zona GRANDE: un campo con f.r ≥ largeR cubre más suelo ⇒ pesa el doble (2). CEO balance knob.
  maelstromChargeCap: 2,     // SUB-CAP DURO PROPIO de las cargas de vorágine por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  maelstromWeights: { large: 2, small: 1 },   // PESO de una zona de negación por TAMAÑO: una zona GRANDE (f.r ≥ largeR) pesa el doble (2) — cubre más suelo, es más devastadora; una zona pequeña pesa 1. Tamaño leído de f.r (radio de la zona, estado replicado). CEO balance knobs. Radio ausente ⇒ peso small (1, fallback).
  // TABLA de tiers por SUMA DE PESO DE ZONAS en radio. MÁS densidad/mayor-tamaño de zonas = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (una sola zona pequeña incidental NO forrajea; hace falta una vorágine genuina). Determinista, LUT pura.
  tiers: [
    { min: 2, charge: 1 },   // Tier 1 — score ≥2 (vorágine ligera: ≥2 zonas pequeñas, o ≥1 zona GRANDE): +1 carga de vorágine por kill. "rematando en la tormenta".
    { min: 4, charge: 2 },   // Tier 2 — score ≥4 (una vorágine densa de zonas solapadas: ≥2 zonas GRANDES): +2 cargas por kill. "en el ojo de la vorágine". CEO balance knobs.
  ],
};

// CAS-2497: COSECHA DE PLAGA (DARK, BLIGHT_HARVEST_SURGE) — EVO mecánica #83 (serializa tras #82 MAELSTROM_FIELD_SURGE LIVE&closed). EJE FRESCO **PRESENCIA/DENSIDAD DE AFLICCIONES DE ESTADO (DoT) ACTIVAS sobre los MOBS VIVOS de la vecindad server-auth** (MMORPG-native: recompensa REMATAR/COSECHAR en medio de un pack ENFERMO — mobs pudriéndose de veneno y ardiendo de quemadura — en vez de rematar un blanco limpio. El verdugo que siega un campo de enemigos ya carcomidos por la plaga, un premio de construir-alrededor para builds de DoT/estado).
//  · PRE-FLIGHT HARD GATE (escalera del issue, aprende de #82):
//    (1) El eje RECOMENDADO del issue (HIGH_GROUND/elevación/verticalidad, `G.elevation`/heightmap/`z` server-auth) **NO EXISTE** replicado/autoritativo en este cliente (ya documentado en FIRM_FOOTING #70: grep elevation|altitude|\.z = 0) ⇒ NO se fuerza el candidato líder. PIVOTE justificado a un eje alterno FRESCO ⊥24 igualmente server-auth de la escalera del issue ("stacking de estados en el objetivo"): `e.dots` = AFLICCIONES DE ESTADO DE TIPO DoT (veneno/quemadura) sobre cada mob. SÍ existe replicado/autoritativo — POBLADO en el path AUTORITATIVO (applyStatus sim.js:6457 `ent.dots[type]=…`, alimentado por afijo Ardiente / boons elementales / resinas / ataques enemigos), TICKEADO/FILTRADO en el reloj de paso-fijo AUTORITATIVO updateEnemies (tickDots sim.js:7654 `d.t-=dt`, borra en muerte/expiración), y ya SURFACEADO en enemyProbe (sim.js:11117 `dots:e.dots?Object.keys(e.dots):[]`). Cada mob VIVO con `e.dots={poison?,burn?}` = snapshot determinista del mismo seed ⇒ MISMO valor para todo observador (convergencia byte-a-byte). Que NINGUNA de las 24 flags LIVE #59-#82 lea hoy `e.dots` como eje de score es EXACTAMENTE lo que lo hace un eje 0-contestado/FRESCO. `blightHarvestScore(h)=Σ blightAfflict(e)` sobre los mobs VIVOS dentro de `radius` del héroe ∈ [0,∞) = DENSIDAD DE PLAGA en la vecindad; `blightAfflict(e)=Σ blightWeights[tipo]` sobre los tipos de DoT activos de e.dots (un mob con AMBOS veneno+quemadura = "totalmente carcomido" ⇒ pesa 2).
//    (2) Canal `blightFind` (recompensa de esencias de plaga por cosechar DENTRO de un pack enfermo) — NINGUNA de las 24 flags #59-#82 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind) está LLENA ⇒ pivota a una moneda FRESCA. Esencias de plaga (h.blightHarvest) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio blightHarvestCap, 0 doble-dip (ningún otro seam banca blightHarvest). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.blight*`, 0 clave SERIALIZADA nueva (h.blightHarvest NO se añade al allowlist de serializeSave ⇒ contador de runtime transitorio, mirror de h.maelstromCharges/h.frayEmbers/h.boneTokens). blightHarvestScore = función PURA del snapshot (G.enemies + e.dots + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Esencias bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: `blightAfflict` FILTRA `!e.dead`, y en el TOP de killEnemy el mob a rematar YA tiene `e.dead=true` (sim.js:5629, fijado ANTES del snapshot `_blightPre`) ⇒ su propia plaga NO se auto-cuenta (mirror #78/#76/#74); combinado con la TABLA (score≥2) rematar UN solo mob afligido aislado (score 0 tras excluir el propio) NO forrajea — hace falta un pack ENFERMO GENUINO (≥2 mobs afligidos, o ≥1 mob doblemente-carcomido cerca).
//  · ⊥/DISTINTO a las 24 LIVE #59-#82: ⊥ #82 (vorágine = ZONAS DE NEGACIÓN estáticas en `G.fields` plantadas por HECHIZOS; plaga = AFLICCIONES DoT sobre los MOBS en `e.dots` — otro contenedor: un mago sembrando zonas en suelo vacío = alta vorágine/cero plaga; un pack envenenado sin campos = cero vorágine/alta plaga, DIVERGEN), ⊥ #81 (fragor = PROYECTILES EN VUELO `G.projectiles`; una aflicción NO es una bala), ⊥ #80 (carnicería = CUERPOS MUERTOS `G.corpses`; la plaga cuenta mobs VIVOS afligidos, vivo vs muerto — DIVERGEN), ⊥ #79 (botín = OBJETOS `G.drops`), ⊥ #78 (furia = FASE de un JEFE `e.enraged` — estado de fase, no aflicción DoT; un jefe enfurecido SIN veneno = alta furia/cero plaga; un pack de trash envenenado sin jefe = cero furia/alta plaga, DIVERGEN), ⊥ #77 (hazard = zona ambiental `G.hazards`), ⊥ #76 (variante = `e.variant`, MODIFICADOR de comportamiento horneado al SPAWN, id-set {stalker,bastion,glass}; plaga = AFLICCIÓN DoT dinámica APLICADA en combate leída de `e.dots`, contenedor y ciclo disjuntos), ⊥ #74 (afijo = CALIDAD ESTÁTICA de un mob `e.affix`/mobAffixes, {swift,armored,vampiric,volatile,frost} horneada al spawn; plaga = estado DINÁMICO aplicado por combate `e.dots` {poison,burn} — id-set y subsistema disjuntos: un mob afijado "vampiric" recién spawneado = alto afijo/cero plaga hasta que lo enveneno), ⊥ #73 (apex = DISTANCIA a un jefe VIVO), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS), ⊥ #69 (force-ratio = ENGANCHADOS), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_blightPre` muestreado en el TOP, tras fijarse e.dead=true del mob a rematar). Al matar un mob no-neutral mientras la vecindad del HÉROE estaba EN UN PACK ENFERMO (mobs afligidos densos, score≥umbral ANTES de este kill vía `_blightPre`) dentro del radio, el héroe cosecha esencias de plaga = blightHarvestForage(hero, tpl, _blightPre) (flat por tier de densidad, acotado por blightHarvestCap), banca a h.blightHarvest vía grantBlightHarvest (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_blightPre`=0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 esencias, 0 floater, 0 grantBlightHarvest ⇒ killEnemy byte-idéntico al HEAD.
export const BLIGHT_HARVEST_SURGE = {
  enabled: true,             // LIVE (EVO#83, CAS-2502). Flip false→true tras CEO Gate 1/2 byte-verify PASS 15/15 + QA Gate 2/2 CAS-2500 INDEP PASS 15/15 (fp 15920977, 2-cli 0-desync). 25º flag. Reversible: true→false + redeploy = rollback. anti-stacking: 1 arco valida a la vez.
  channel: "blightFind",     // canal FRESCO (recompensa de esencias de plaga por cosechar DENTRO de un pack enfermo) — NINGUNA de las 24 flags #59-#82 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind) LLENA ⇒ esencias de plaga es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los mobs VIVOS afligidos cuyo centro cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78). CEO balance knob.
  blightHarvestCap: 2,       // SUB-CAP DURO PROPIO de las esencias de plaga por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.harvest)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  blightWeights: { poison: 1, burn: 1 },   // PESO de una AFLICCIÓN por TIPO de DoT (STATUS.dot): veneno + quemadura = ambos DoT dañinos ⇒ pesan 1 cada uno; un mob con AMBOS activos = "totalmente carcomido" ⇒ suma 2. Tipo leído de las claves de e.dots (estado replicado). CEO balance knobs. Un tipo de DoT ausente ⇒ peso 1 (fallback).
  // TABLA de tiers por SUMA DE PESO DE AFLICCIONES DoT de los mobs VIVOS en radio. MÁS densidad/mayor-profundidad de plaga = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (rematar un mob levemente afligido aislado NO cosecha; hace falta un pack enfermo genuino). Determinista, LUT pura.
  tiers: [
    { min: 2, harvest: 1 },  // Tier 1 — score ≥2 (pack levemente enfermo: ≥2 mobs afligidos, o ≥1 mob doblemente-carcomido cerca): +1 esencia de plaga por kill. "cosechando entre los enfermos".
    { min: 4, harvest: 2 },  // Tier 2 — score ≥4 (un pack densamente carcomido: ≥2 mobs doblemente-afligidos): +2 esencias por kill. "el verdugo de la plaga". CEO balance knobs.
  ],
};

// CAS-2504: LÍNEA DE ESCARAMUZA (DARK, SKIRMISH_LINE_SURGE) — EVO mecánica #84 (serializa tras #83 BLIGHT_HARVEST_SURGE LIVE&closed). EJE FRESCO **COMPOSICIÓN DE ARQUETIPO DE ALCANCE (a-distancia) del pack de MOBS VIVOS de la vecindad server-auth** (MMORPG-native: recompensa REMATAR mientras estás rodeado de una LÍNEA DE HOSTIGAMIENTO de mobs A DISTANCIA — arqueros/lanzadores/hechiceros que te fijan con proyectiles desde lejos — en vez del duelo cuerpo-a-cuerpo. El escaramuzador que ROMPE la línea de fuego enemiga cerrando la distancia y rematando bajo la lluvia de saetas, no el que muele trash melee en un pasillo. Un premio de construir-alrededor para builds de movilidad/anti-caster).
//  · PRE-FLIGHT HARD GATE (escalera del issue, aprende de #83):
//    (1) El eje RECOMENDADO del issue (DENSIDAD/FORMACIÓN DE ALIADOS/INVOCACIONES cerca del héroe, `G.allies`/`G.summons`/lista de party server-auth) **NO EXISTE** replicado como CONTENEDOR de MÚLTIPLES aliados: sólo hay un ÚNICO espíritu transitorio `G._spirit` (CAS-1954, 1 entidad como máximo, no una formación) + `summonAdds` que son adds de un mob ENEMIGO (no aliados del héroe) ⇒ "densidad de aliados en radio" quedaría FORZADO (tope 1) ⇒ NO se fuerza el candidato líder. PIVOTE justificado a un eje alterno FRESCO ⊥25 igualmente server-auth de la escalera del issue ("composición de arquetipo enemigo, a-distancia vs cuerpo-a-cuerpo"): `e.tpl.ranged` = CLASE DE ALCANCE del mob (arquetipo caster/lanzador con proyectiles). SÍ existe replicado/autoritativo — es una propiedad del TEMPLATE horneada al spawn (ETPL[type].ranged, ETPL[type].range), idéntica para todo observador del mismo seed (mismos spawns), leída ya por la IA (kite/cast sim.js:7828/7909) y el pool de afijos (sim.js:914/2355). Que NINGUNA de las 25 flags LIVE #59-#83 lea hoy `e.tpl.ranged` como eje de SCORE (sólo IA/pool-de-afijos lo consultan, no forrajeo) es EXACTAMENTE lo que lo hace un eje 0-contestado/FRESCO. `skirmishLineScore(h)=Σ skirmishWeight(e)` sobre los mobs VIVOS a-distancia dentro de `radius` del héroe ∈ [0,∞) = DENSIDAD DE LÍNEA DE FUEGO en la vecindad; `skirmishWeight(e)=0` si melee (e.tpl.ranged falsy), else `long`(e.tpl.range ≥ longR)?2:1 — una pieza de ARTILLERÍA de largo alcance (te fija desde más lejos, más peligrosa) pesa el doble.
//    (2) Canal `skirmishFind` (recompensa de marcas de escaramuza por rematar DENTRO de una línea de hostigamiento a-distancia) — NINGUNA de las 25 flags #59-#83 lo toca: la familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind) está LLENA ⇒ pivota a una moneda FRESCA. Marcas de escaramuza (h.skirmishMarks) es un recurso TRANSITORIO NUEVO (init LAZY en el hero por-run, FUERA del allowlist de save.v1 + NO entra al worldFingerprint que sólo hashea terreno) ⇒ recompensa pura, 0 stat de combate. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio skirmishMarkCap, 0 doble-dip (ningún otro seam banca skirmishMarks). ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind.
//    (3) STATELESS: 0 acumulador per-pid, 0 `G.skirmish*`, 0 clave SERIALIZADA nueva (h.skirmishMarks NO se añade al allowlist de serializeSave ⇒ contador de runtime transitorio, mirror de h.blightHarvest/h.maelstromCharges/h.frayEmbers). skirmishLineScore = función PURA del snapshot (G.enemies + e.tpl.ranged/range + posición del héroe) ⇒ convergencia byte-a-byte, 0 desync. Marcas bancan fuera del loop de fingerprint ⇒ NO entra al worldFingerprint. ANTI-AUTO-CONTEO: `skirmishWeight` FILTRA `!e.dead`, y en el TOP de killEnemy el mob a rematar YA tiene `e.dead=true` (sim.js:5658, fijado ANTES del snapshot `_skirmPre`) ⇒ si el propio blanco es a-distancia NO se auto-cuenta (mirror #83/#78/#76/#74); combinado con la TABLA (score≥2) rematar UN solo mob a-distancia aislado corto (peso 1, score 0 tras excluir el propio) NO forrajea — hace falta una LÍNEA GENUINA (≥2 mobs a-distancia, o ≥1 pieza de artillería de largo alcance cerca).
//  · ⊥/DISTINTO a las 25 LIVE #59-#83: ⊥ #83 (plaga = AFLICCIONES DoT DINÁMICAS `e.dots` aplicadas en combate; escaramuza = CLASE DE ALCANCE `e.tpl.ranged` ESTÁTICA del template — un archer recién spawneado sin veneno = alta escaramuza/cero plaga; un rusher melee envenenado = cero escaramuza/alta plaga, DIVERGEN), ⊥ #82 (vorágine = ZONAS DE NEGACIÓN estáticas `G.fields` plantadas por hechizos; una clase de mob NO es un campo de suelo), ⊥ #81 (fragor = PROYECTILES EN VUELO `G.projectiles` con velocidad; escaramuza cuenta el SHOOTER-mob aunque NO haya disparado — un archer que aún no tira = 0 fragor/alta escaramuza; la saeta del HÉROE = alto fragor/0 escaramuza [no es un mob] — otro contenedor, DIVERGEN), ⊥ #80 (carnicería = CUERPOS MUERTOS `G.corpses`; escaramuza cuenta mobs VIVOS a-distancia, vivo vs muerto — DIVERGEN), ⊥ #79 (botín = OBJETOS `G.drops`), ⊥ #78 (furia = FASE de un JEFE VIVO `e.enraged`), ⊥ #77 (hazard = zona ambiental `G.hazards`), ⊥ #76 (variante = `e.variant`, MODIFICADOR de comportamiento horneado al spawn, id-set {stalker,bastion,glass}; escaramuza = CLASE DE ALCANCE `e.tpl.ranged` del template base — subsistema disjunto: un mob melee con variante 'stalker' = alta variante/cero escaramuza), ⊥ #74 (afijo = CALIDAD `e.affix`/mobAffixes {swift,armored,vampiric,volatile,frost} horneada al spawn; escaramuza = CLASE DE ALCANCE del arquetipo base — id-set y subsistema disjuntos: un rusher melee afijado 'swift' = alto afijo/cero escaramuza), ⊥ #73 (apex = DISTANCIA a un jefe VIVO), ⊥ #72 (escasez = AUSENCIA de mobs VIVOS [count]), ⊥ #69 (force-ratio LAST_STAND = CONTEO de enemigos ENGANCHADOS en melee sin filtro de arquetipo; escaramuza IGNORA melee [peso 0] y sólo cuenta a-distancia — un pack de 5 rushers melee = alto LAST_STAND/cero escaramuza; una línea de 3 arqueros kiteando a distancia SIN engancharse = bajo LAST_STAND/alta escaramuza — DIVERGEN, otro predicado), ⊥ lootQuality #63/#68 (=CALIDAD de la PRÓXIMA tirada). NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_skirmPre` muestreado en el TOP, tras fijarse e.dead=true del mob a rematar). Al matar un mob no-neutral mientras la vecindad del HÉROE estaba EN UNA LÍNEA DE HOSTIGAMIENTO (mobs a-distancia densos, score≥umbral ANTES de este kill vía `_skirmPre`) dentro del radio, el héroe cosecha marcas de escaramuza = skirmishLineForage(hero, tpl, _skirmPre) (flat por tier de densidad, acotado por skirmishMarkCap), banca a h.skirmishMarks vía grantSkirmishMark (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_skirmPre`=0 (const inerte) + la rama entera es CÓDIGO MUERTO ⇒ 0 marcas, 0 floater, 0 grantSkirmishMark ⇒ killEnemy byte-idéntico al HEAD.
export const SKIRMISH_LINE_SURGE = {
  enabled: true,             // LIVE (EVO#84, CAS-2507 flip). 26º flag. Rama fuente INTACTA ⇒ mecánica byte-idéntica a la validada (CEO Gate 1/2 + DARK QA Gate 2/2 @b010912 PASS 12/12). Flip config-only 1-línea. anti-stacking: 1 arco valida a la vez.
  channel: "skirmishFind",   // canal FRESCO (recompensa de marcas de escaramuza por rematar DENTRO de una línea de hostigamiento a-distancia) — NINGUNA de las 25 flags #59-#83 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind) LLENA ⇒ marcas de escaramuza es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los mobs VIVOS a-distancia cuyo centro cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78 / botín #79 / carnicería #80 / fragor #81 / vorágine #82 / plaga #83). CEO balance knob.
  longR: 240,                // umbral de ALCANCE (px, e.tpl.range) de una pieza de ARTILLERÍA de largo alcance: un mob a-distancia con range ≥ longR (mage 250 / emberkin 240 / ashwraith 250) te fija desde más lejos ⇒ pesa el doble (2); un a-distancia de alcance corto (spearman 210 / wraith 230 / thornspitter 230) pesa 1. CEO balance knob.
  skirmishMarkCap: 2,        // SUB-CAP DURO PROPIO de las marcas de escaramuza por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.mark)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  skirmishWeights: { long: 2, short: 1 },   // PESO de un mob A-DISTANCIA por ALCANCE: artillería de largo alcance (e.tpl.range ≥ longR) pesa el doble (2) — te fija desde más lejos, más difícil de cerrar; un a-distancia corto pesa 1. Mob MELEE (e.tpl.ranged falsy) = 0 (una brawl melee NO es una línea de fuego). CEO balance knobs. range ausente en un a-distancia ⇒ peso short (1, fallback).
  // TABLA de tiers por SUMA DE PESO DE MOBS A-DISTANCIA en radio. MÁS densidad/mayor-alcance de la línea de fuego = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (rematar bajo un solo arquero corto aislado NO forrajea; hace falta una línea genuina). Determinista, LUT pura.
  tiers: [
    { min: 2, mark: 1 },     // Tier 1 — score ≥2 (línea ligera: ≥2 mobs a-distancia cortos, o ≥1 pieza de artillería de largo alcance): +1 marca de escaramuza por kill. "rompiendo la línea de fuego".
    { min: 4, mark: 2 },     // Tier 2 — score ≥4 (una descarga densa de artillería solapada: ≥2 piezas de largo alcance): +2 marcas por kill. "en el ojo de la tormenta de saetas". CEO balance knobs.
  ],
};

// CAS-2510: COSECHA DE SOMETIMIENTO (CONTROL_HARVEST_SURGE, EVO#85 DARK) — EJE DENSIDAD DE ESTADO DE CONTROL DE MULTITUD (CC dura/blanda) sobre los MOBS VIVOS de la vecindad server-auth + canal FRESCO controlFind (recompensa de cargas de sometimiento por rematar EN MEDIO de un pack SOMETIDO/inmovilizado). Camino al 27º flag (serializa tras #84 SKIRMISH LIVE).
//  · EJE FRESCO ⊥26: el estado de CONTROL de un mob = `e.stun` (AI-freeze DURO, el mob NO actúa — sim.js:7772 congela la IA) / `e.slowT` (frost slow BLANDO, arrastra su chase spd — sim.js:7794). Poblados por combate: POISE stagger (sim.js:5478), carapace shatter (8142), applyStatus type "stun"/"slow" (6542-6543; afijo Escarcha / hechizo / nova / proc). Tickeados/decaídos en updateEnemies (7772/7706). PROPIEDAD DINÁMICA server-auth (mismo seed+inputs ⇒ mismo e.stun/e.slowT para todo observador).
//  · PRE-FLIGHT GATE (resultado): el eje RECOMENDADO del issue (TIER CAMPEÓN/ÉLITE, sistema CHAMPION `e.champion`/`e.champElite`) **FALLA ⊥26** — #73 APEX_PROXIMITY YA lee ese contenedor EXACTO vía apexIsThreat(e)=(e.isBoss||e.champion||e.champElite) (sim.js:4015) ⇒ NO es un contenedor DISTINTO ⇒ pivoté al eje alterno FRESCO "estado de control server-auth" (`e.stun`/`e.slowT`), que NINGUNA de las 26 flags #59-#84 lee como eje de SCORE (grep verificado). El estado de CC NO es tier de spawn (⊥ afijo #74 e.affix / variante #76 e.variant) ni proximidad-de-jefe (⊥ apex #73).
//  · controlWeight(e) = 0 si mob muerto/no-controlado; STUN duro (e.stun>0) pesa 2 (blanco totalmente abierto, IA congelada); SLOW-only blando (e.slowT>0 sin stun) pesa 1. Un mob stun+slow ⇒ 2 (stun domina; MAX, 0 doble-conteo).
//  · ⊥/DISTINTO a las 26 LIVE #59-#84: ⊥ #84 (escaramuza = CLASE DE ALCANCE ESTÁTICA `e.tpl.ranged` del template horneada al spawn; control = ESTADO DINÁMICO de CC `e.stun`/`e.slowT` aplicado en combate — un archer SUELTO sin aturdir = alta escaramuza/cero control; un rusher melee aturdido = cero escaramuza/alto control, DIVERGEN), ⊥ #83 (plaga = AFLICCIONES DoT `e.dots={poison,burn}` [DAÑO-en-el-tiempo]; control = ESTADO de CC `e.stun`/`e.slowT` [NEGACIÓN-de-acción] — un mob envenenado que corre libre = alta plaga/cero control; un mob aturdido sin veneno = cero plaga/alto control, contenedores DISJUNTOS, DIVERGEN), ⊥ #82 (vorágine = ZONAS `G.fields`), ⊥ #81 (fragor = PROYECTILES `G.projectiles`), ⊥ #80 (carnicería = CUERPOS MUERTOS `G.corpses`; control cuenta mobs VIVOS sometidos), ⊥ #79 (botín = OBJETOS `G.drops`), ⊥ #78 (furia = FASE de un JEFE `e.enraged`), ⊥ #77 (hazard = `G.hazards`), ⊥ #76 (variante = `e.variant`, modificador de SPAWN), ⊥ #74 (afijo = CALIDAD ESTÁTICA `e.affix` horneada al spawn), ⊥ #73 (apex = DISTANCIA a un jefe/campeón VIVO `e.champion`/`e.champElite`/`e.isBoss`; control = DENSIDAD de mobs SOMETIDOS por CC, otro contenedor y otro predicado), ⊥ #72 (escasez = AUSENCIA de mobs), ⊥ #69 (LAST_STAND = CONTEO de ENGANCHADOS en melee SIN filtro de estado; control = mobs bajo CC estén o no enganchados — un pack de 5 rushers enganchados SIN aturdir = alto LAST_STAND/cero control; 3 mobs aturdidos a distancia = bajo LAST_STAND/alto control, DIVERGEN), ⊥ lootQuality #63/#68. NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_ctrlPre` muestreado en el TOP, tras fijarse e.dead=true del mob a rematar ⇒ controlWeight filtra !e.dead ⇒ su propio CC NO se auto-cuenta). Al matar un mob no-neutral mientras la vecindad estaba SOMETIDA (mobs bajo CC densos, score≥umbral vía `_ctrlPre`) en radio, el héroe cosecha cargas de sometimiento = controlHarvestForage(hero, tpl, _ctrlPre), banca a h.controlCharges vía grantControlCharge (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_ctrlPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD.
export const CONTROL_HARVEST_SURGE = {
  enabled: true,             // LIVE (EVO#85, CAS-2513). 27º flag. Flip config-only 1-línea tras CEO Gate 1/2 PASS + DARK QA Gate 2/2 CAS-2512 PASS 15/15. anti-stacking: 1 arco valida a la vez.
  channel: "controlFind",    // canal FRESCO (recompensa de cargas de sometimiento por rematar DENTRO de un pack SOMETIDO por CC) — NINGUNA de las 26 flags #59-#84 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind) LLENA ⇒ cargas de sometimiento es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. ⊥ wardRegen/goldFind/oocMitigation/critChance/xpGain/vamp/lootQuality/restedMult/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los mobs VIVOS bajo CC cuyo centro cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 / variante #76 / hazard #77 / furia #78 / botín #79 / carnicería #80 / fragor #81 / vorágine #82 / plaga #83 / escaramuza #84). CEO balance knob.
  controlChargeCap: 2,       // SUB-CAP DURO PROPIO de las cargas de sometimiento por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  controlWeights: { stun: 2, slow: 1 },   // PESO de un mob por su ESTADO DE CONTROL: STUN duro (e.stun>0, IA congelada, blanco abierto) pesa 2; SLOW blando (e.slowT>0 sin stun) pesa 1. Un mob stun+slow ⇒ 2 (stun domina, MAX ⇒ 0 doble-conteo). Mob NO controlado ⇒ 0 (un mob que corre libre NO es un pack sometido). CEO balance knobs.
  // TABLA de tiers por SUMA DE PESO DE MOBS BAJO CC en radio. MÁS densidad/mayor-severidad del control = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (rematar junto a UN solo mob ralentizado aislado NO forrajea; hace falta un pack GENUINAMENTE sometido). Determinista, LUT pura.
  tiers: [
    { min: 2, charge: 1 },   // Tier 1 — score ≥2 (control ligero: ≥2 mobs ralentizados, o ≥1 mob aturdido): +1 carga de sometimiento por kill. "capitalizando el control".
    { min: 4, charge: 2 },   // Tier 2 — score ≥4 (una jaula densa de CC: ≥2 mobs aturdidos solapados): +2 cargas por kill. "el pack entero clavado en el sitio". CEO balance knobs.
  ],
};

// CAS-2516: SIEGA DE HERIDOS (BLOODHARVEST_SURGE, EVO#86 DARK) — EJE DENSIDAD DE MOBS VIVOS ya ENSANGRENTADOS (fracción de vida BAJA, e.hp/e.maxHp) en la vecindad server-auth + canal FRESCO bloodFind (recompensa de cargas de siega por REMATAR EN MEDIO de un campo de HERIDOS/carne-de-ejecución). Camino al 28º flag (serializa tras #85 CONTROL_HARVEST LIVE).
//  · EJE FRESCO ⊥27: la fracción de vida de un mob VIVO = `e.hp/e.maxHp` = propiedad DINÁMICA server-auth poblada por el DAÑO acumulado en combate (hitEnemy/damage, tickeada en updateEnemies) — el MISMO valor que la IA/enrage ya lee (cambio-de-fase capstone cruza e.hp<=e.maxHp*e.enrageAt). Un mob por debajo de `bloodiedFrac` = HERIDO (carne de remate); por debajo de `critFrac` = a-punto-de-caer (ejecución). Que NINGUNA de las 27 flags #59-#85 lea hoy la FRACCIÓN DE VIDA de los mobs VIVOS de la vecindad como eje de SCORE es lo que lo hace un eje FRESCO. Premio de construir-alrededor para builds de remate/ejecución (el verdugo que siega un campo de heridos, no el que abre sobre carne sana).
//  · PRE-FLIGHT GATE (resultado): el eje RECOMENDADO del issue (RACHA/COMBO de kills temporal, kill-streak server-auth) **FALLA ⊥27** — CADENCE_RUSH #67 (config.js:2723) YA es un **combo-meter rodante server-auth scoreado por TEMPO/RITMO DE MATANZA** (`bumpPerKill` en cada kill, decae por vida-media, reloj COMPARTIDO) + FRENZY (CAS-1773 medidor de frenesí kill-streak) + COMBO (comboCount cadena melee) ya ocupan el contenedor racha/kill-streak/combo ⇒ NO es un contenedor DISTINTO ⇒ pivoté al eje alterno FRESCO "fracción de vida de los mobs VIVOS" (`e.hp/e.maxHp`), que NINGUNA de las 27 flags lee como eje de SCORE (grep verificado). La fracción de vida NO es racha/tempo (⊥ CADENCE #67 / FRENZY) ni fase-de-jefe (⊥ furia #78, que lee el BOOLEANO e.enraged fijado UNA vez al cruzar el umbral — no la fracción continua de TODO mob, incluida la basura).
//  · bloodWeight(e) = 0 si mob muerto/vivo-sano; a-punto-de-caer (e.hp/e.maxHp ≤ critFrac) pesa 2 (ejecución, cae al próximo golpe); herido (≤ bloodiedFrac, > critFrac) pesa 1. Mob por encima de bloodiedFrac (sano) ⇒ 0. FILTRA mob muerto/hp≤0 ⇒ ANTI-AUTO-CONTEO: en el TOP de killEnemy el mob a rematar (e.dead=true + e.hp≤0 ya fijados) NO auto-cuenta su propia herida.
//  · ⊥/DISTINTO a las 27 LIVE #59-#85: ⊥ #85 (control = ESTADO de CC `e.stun`/`e.slowT` [NEGACIÓN-de-acción]; siega = FRACCIÓN DE VIDA `e.hp/e.maxHp` [cuán MUERTO está] — un mob SANO aturdido = alto control/cero siega; un mob HERIDO corriendo libre = cero control/alta siega, contenedores DISJUNTOS, DIVERGEN), ⊥ #84 (escaramuza = CLASE DE ALCANCE ESTÁTICA `e.tpl.ranged` del template horneada al spawn; siega = FRACCIÓN DE VIDA dinámica — un archer a plena vida = alta escaramuza/cero siega; un rusher melee moribundo = cero escaramuza/alta siega), ⊥ #83 (plaga = AFLICCIONES DoT `e.dots` [veneno/quemadura ACTIVOS]; siega = fracción de vida [el RESULTADO acumulado del daño, venga de DoT o de golpes] — un mob a plena vida ardiendo = alta plaga/cero siega; un mob moribundo SIN dots activos = cero plaga/alta siega, DISJUNTOS), ⊥ #82 (vorágine = ZONAS `G.fields`), ⊥ #81 (fragor = PROYECTILES `G.projectiles`), ⊥ #80 (carnicería = CUERPOS MUERTOS `G.corpses`; siega cuenta mobs VIVOS heridos, NO cadáveres), ⊥ #79 (botín = OBJETOS `G.drops`), ⊥ #78 (furia = BOOLEANO de FASE de un JEFE `e.enraged` fijado UNA vez al cruzar e.hp<=e.maxHp*e.enrageAt; siega = FRACCIÓN CONTINUA de vida de TODO mob VIVO incluida la basura — un jefe enfurecido justo en enrageAt (frac 0.5 > bloodiedFrac 0.4) = alta furia/cero siega; un trash mob al 0.3 de vida = cero furia/alta siega, DIVERGEN), ⊥ #77 (hazard = `G.hazards`), ⊥ #76 (variante = `e.variant`, modificador de SPAWN), ⊥ #74 (afijo = CALIDAD ESTÁTICA `e.affix` horneada al spawn; siega = daño ACUMULADO dinámico — un mob 'armored' a plena vida = alto afijo/cero siega), ⊥ #73 (apex = DISTANCIA a un jefe/campeón VIVO; siega = DENSIDAD de mobs heridos), ⊥ #72 (escasez = AUSENCIA de mobs), ⊥ #69 (LAST_STAND = CONTEO de ENGANCHADOS en melee SIN filtro de vida — 5 rushers a plena vida enganchados = alto LAST_STAND/cero siega; 3 mobs moribundos a distancia = bajo LAST_STAND/alta siega, DIVERGEN), ⊥ CADENCE #67/FRENZY (racha/tempo de kills, NO estado de los mobs vivos), ⊥ lootQuality #63/#68. NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_bloodPre` muestreado en el TOP, tras fijarse e.dead=true + e.hp≤0 del mob a rematar ⇒ bloodWeight lo filtra ⇒ su propia herida NO se auto-cuenta). Al matar un mob no-neutral mientras la vecindad estaba SEMBRADA DE HERIDOS (mobs vivos con vida baja densos, score≥umbral vía `_bloodPre`) en radio, el héroe cosecha cargas de siega = bloodHarvestForage(hero, tpl, _bloodPre), banca a h.bloodCharges vía grantBloodCharge (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_bloodPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD.
export const BLOODHARVEST_SURGE = {
  enabled: true,             // LIVE — CAS-2519 flip EVO#86 (CEO Gate 1/2 PASS + DARK QA Gate 2/2 PASS 16/16 @104a9c2d, fp 15920977). 28º flag. Byte-neutral overlay ya horneado DARK; este flip es EXCLUSIVAMENTE esta línea.
  channel: "bloodFind",      // canal FRESCO (recompensa de cargas de siega por rematar DENTRO de un campo de HERIDOS) — NINGUNA de las 27 flags #59-#85 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind) LLENA ⇒ cargas de siega es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los mobs VIVOS heridos cuyo centro cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 … control #85). CEO balance knob.
  bloodChargeCap: 2,         // SUB-CAP DURO PROPIO de las cargas de siega por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  bloodiedFrac: 0.40,        // umbral de HERIDA: un mob VIVO con e.hp/e.maxHp ≤ esto está ENSANGRENTADO (carne de remate) ⇒ pesa ≥1. Por encima (sano) ⇒ 0. CEO balance knob.
  critFrac: 0.15,            // umbral de EJECUCIÓN: un mob VIVO con e.hp/e.maxHp ≤ esto está a-punto-de-caer ⇒ pesa 2 (severidad máxima). CEO balance knob.
  bloodWeights: { crit: 2, wound: 1 },   // PESO de un mob por su FRACCIÓN DE VIDA: a-punto-de-caer (≤critFrac) pesa 2 (ejecución); herido (≤bloodiedFrac, >critFrac) pesa 1. Mob sano (>bloodiedFrac) ⇒ 0. CEO balance knobs.
  // TABLA de tiers por SUMA DE PESO DE MOBS HERIDOS en radio. MÁS densidad/mayor-severidad de heridas = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (rematar junto a UN solo herido leve aislado NO forrajea; hace falta un campo GENUINO de heridos). Determinista, LUT pura.
  tiers: [
    { min: 2, charge: 1 },   // Tier 1 — score ≥2 (heridas ligeras: ≥2 mobs heridos, o ≥1 a-punto-de-caer): +1 carga de siega por kill. "segando la primera sangre".
    { min: 4, charge: 2 },   // Tier 2 — score ≥4 (un campo denso de moribundos: ≥2 mobs a-punto-de-caer solapados): +2 cargas por kill. "el campo entero desangrándose". CEO balance knobs.
  ],
};

// CAS-2521: SIEGA DE MANADA (PACKHARVEST_SURGE, EVO#87 DARK) — EJE COHESIÓN/EMPAQUETAMIENTO INTER-MOB (clustering mob↔mob: nº de OTROS mobs VIVOS en la vecindad LOCAL de CADA mob) sobre los MOBS VIVOS de la vecindad server-auth + canal FRESCO packFind (recompensa de cargas de siega por REMATAR EN MEDIO de una MANADA TUPIDA/jauría apiñada — el que ADELGAZA el pelotón, no el que abre sobre un rezagado suelto). Camino al 29º flag (serializa tras #86 BLOODHARVEST_SURGE LIVE&closed).
//  · EJE FRESCO ⊥28: la COHESIÓN de un mob = nº de OTROS mobs VIVOS cuyo centro cae dentro de `cohesionR` de ESE mob = propiedad GEOMÉTRICA DINÁMICA server-auth derivada de las POSICIONES replicadas de G.enemies (relación mob↔mob, NO hero↔mob). Un mob con ≥coreN vecinos = NÚCLEO DE MANADA (apiñado); con ≥looseN = agrupado laxo; SIN vecinos = rezagado suelto. Que NINGUNA de las 28 flags #59-#86 lea hoy la PROXIMIDAD INTER-MOB (clustering mob↔mob) como eje de SCORE es lo que lo hace un eje FRESCO. La cohesión NO es un CONTEO crudo de mobs (⊥ escasez #72 [AUSENCIA/nº] y ⊥ LAST_STAND #69 [nº de ENGANCHADOS en melee con el HÉROE]): 5 mobs DISPERSOS (cada uno >cohesionR de todos) ⇒ cohesión 0 pese a 5 en radio; 3 mobs APIÑADOS ⇒ cohesión alta. Mide AGREGACIÓN ESPACIAL, no cantidad ni relación con el héroe. Premio de construir-alrededor para builds de AoE/control-de-multitud (el segador que adelgaza la jauría apiñada, no el que caza rezagados sueltos).
//  · PRE-FLIGHT GATE (resultado): el eje RECOMENDADO del issue (LONGEVIDAD/EDAD del mob, tiempo-vivo server-auth `edad = tickActual − e.spawnT`) **FALLA el gate** — NO existe marca de aparición server-auth determinista por mob: `spawnEnemy` (sim.js:2258) NO estampa `e.spawnT`/`e.bornAt`/tick-de-nacimiento (sólo `st`/`wt` = timers de ESTADO que se resetean al cambiar de estado, NO edad persistente-al-spawn) + NO hay contador ENTERO determinista de tick de sim (los world-events usan `nowMs`=wall-clock Date.now, NO determinista entre clientes ⇒ rompería 2-cli 0-desync). Fabricar un reloj-tick determinista sería un cambio mayor que arriesga el fingerprint del North Star ⇒ NO lo forcé; pivoté al alterno FRESCO ⊥28 "cohesión de manada" (candidato bendecido por el issue). Refiné el candidato dropeando el filtro "mobs SANOS" (leer e.hp/e.maxHp solaparía el contenedor EXACTO de #86 BLOODHARVEST) ⇒ EMPAQUETAMIENTO PURO health-agnóstico ⇒ ⊥#86 limpio.
//  · packWeight(e) = 0 si mob muerto/hp≤0/rezagado (0 vecinos vivos); NÚCLEO (≥coreN=2 otros mobs VIVOS en cohesionR) pesa 2 (jauría apiñada); AGRUPADO (≥looseN=1 vecino) pesa 1. FILTRA mob muerto/hp≤0 como SUJETO Y como VECINO ⇒ ANTI-AUTO-CONTEO: en el TOP de killEnemy el mob a rematar (e.dead=true ya fijado) NO se cuenta a sí mismo NI infla la cohesión de sus vecinos.
//  · ⊥/DISTINTO a las 28 LIVE #59-#86: ⊥ #86 (siega-de-heridos = FRACCIÓN DE VIDA propia `e.hp/e.maxHp` [cuán MUERTO está CADA mob]; manada = PROXIMIDAD INTER-MOB [cuán APIÑADO está] — un mob a PLENA VIDA en jauría tupida = alta manada/cero siega; un rezagado MORIBUNDO suelto = cero manada/alta siega, contenedores DISJUNTOS, DIVERGEN), ⊥ #85 (control = ESTADO de CC `e.stun`/`e.slowT`), ⊥ #84 (escaramuza = CLASE DE ALCANCE `e.tpl.ranged`), ⊥ #83 (plaga = DoT `e.dots`), ⊥ #82 (vorágine = ZONAS `G.fields`), ⊥ #81 (fragor = PROYECTILES `G.projectiles`), ⊥ #80 (carnicería = CUERPOS MUERTOS `G.corpses`; manada cuenta mobs VIVOS apiñados, NO cadáveres), ⊥ #79 (botín = OBJETOS `G.drops`), ⊥ #78 (furia = BOOLEANO `e.enraged`), ⊥ #77 (hazard = `G.hazards`), ⊥ #76 (variante = `e.variant`), ⊥ #74 (afijo = `e.affix`), ⊥ #73 (apex = DISTANCIA hero→jefe/campeón VIVO; manada = DISTANCIA mob↔mob [clustering], geometría DISTINTA — un jefe solitario lejos = alto apex si no hay campeón cerca/cero manada; una jauría de trash apiñada = cero apex/alta manada), ⊥ #72 (escasez = AUSENCIA/CONTEO crudo de mobs; manada = AGREGACIÓN ESPACIAL — 5 dispersos = baja manada pese a nº alto), ⊥ #69 (LAST_STAND = CONTEO de ENGANCHADOS en MELEE con el HÉROE [hero-céntrico]; manada = clustering mob↔mob INDEPENDIENTE del héroe — 5 mobs rodeando al héroe pero DISPERSOS = alto LAST_STAND/baja manada; una jauría apiñada de lado SIN enganchar = bajo LAST_STAND/alta manada, DIVERGEN), ⊥ CADENCE #67/FRENZY (racha/tempo de kills), ⊥ lootQuality #63/#68. NO sigilo/LOS (#71) ni material-de-terreno (#70) ni clima/tiempo/tempo/social/kinship/territorial.
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_packPre` muestreado en el TOP, tras fijarse e.dead=true del mob a rematar ⇒ packWeight lo filtra como sujeto Y como vecino ⇒ NO auto-infla). Al matar un mob no-neutral mientras la vecindad estaba SEMBRADA DE UNA MANADA APIÑADA (mobs vivos densamente agrupados entre sí, score≥umbral vía `_packPre`) en radio, el héroe cosecha cargas de siega = packHarvestForage(hero, tpl, _packPre), banca a h.packBounty vía grantPackBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_packPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: O(n²) sobre mobs-en-radio (n acotado <~20 cerca del héroe ⇒ <~400 ops); computado en el kill-TOP (1×/kill) + VM/badge (por frame) ⇒ trivial dentro de 16ms.
export const PACKHARVEST_SURGE = {
  enabled: true,             // LIVE — CAS-2525 EVO#87 flip (false→true). Gates: CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 PASS 16/16 (CAS-2523, indep fresh clone 8d386dc) + CEO Gate 2/2 re-verify GREEN. 29º flag LIVE (Siega de Manada).
  channel: "packFind",       // canal FRESCO (recompensa de cargas de siega por rematar DENTRO de una MANADA APIÑADA) — NINGUNA de las 28 flags #59-#86 lo usa. Familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind) LLENA ⇒ cargas de manada es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 260,               // radio de la vecindad (px): sólo los mobs VIVOS apiñados cuyo centro cae dentro de este radio del héroe suman al surge score (misma vecindad que afijo #74 … siega #86). CEO balance knob.
  cohesionR: 88,             // radio de COHESIÓN LOCAL (px, ~2.75 tiles): un mob cuenta como VECINO de otro si su centro cae dentro de esto. Define "apiñamiento". Distinto y MENOR que radius (vecindad del héroe). CEO balance knob.
  packBountyCap: 2,          // SUB-CAP DURO PROPIO de las cargas de manada por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  coreN: 2,                  // umbral NÚCLEO: un mob VIVO con ≥ esto OTROS mobs vivos dentro de cohesionR está en el NÚCLEO de una jauría ⇒ pesa 2. CEO balance knob.
  looseN: 1,                 // umbral AGRUPADO: un mob VIVO con ≥ esto (y < coreN) vecinos está agrupado laxo ⇒ pesa 1. SIN vecinos (rezagado) ⇒ 0. CEO balance knob.
  packWeights: { core: 2, loose: 1 },   // PESO de un mob por su COHESIÓN LOCAL: núcleo (≥coreN vecinos) pesa 2; agrupado (≥looseN, <coreN) pesa 1; rezagado (0 vecinos) ⇒ 0. CEO balance knobs.
  // TABLA de tiers por SUMA DE PESO DE COHESIÓN de los mobs en radio. MÁS/mayor apiñamiento = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < min menor (0/1) ⇒ Tier 0 ⇒ +0 (rematar junto a un par de mobs sueltos NO forrajea; hace falta una MANADA GENUINA apiñada). Determinista, LUT pura.
  tiers: [
    { min: 2, charge: 1 },   // Tier 1 — score ≥2 (agrupamiento laxo: ≥2 mobs con un vecino cada uno, o un par apiñado): +1 carga de siega por kill. "adelgazando la manada".
    { min: 4, charge: 2 },   // Tier 2 — score ≥4 (una jauría tupida: ≥2 mobs en núcleo, o un trío apiñado): +2 cargas por kill. "el pelotón entero apretado". CEO balance knobs.
  ],
};

// CAS-2527: REMATE A DISTANCIA (LONGSHOT_SURGE, EVO#88 DARK) — EJE DISTANCIA/RANGO DEL GOLPE DE REMATE (snapshot GEOMÉTRICO hero↔víctima en el instante del kill: melee-finish de cerca vs sniper-finish de lejos) + canal FRESCO reachFind (recompensa de fichas de puntería por REMATAR DE LEJOS — el que abate al mob a distancia, no al que pisa encima). Camino al 30º flag (serializa tras #87 PACKHARVEST_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = SWIFTNESS/VELOCIDAD del mob, |v| de e.vx/e.vy) → FALLA: los enemigos NO tienen VECTOR de velocidad server-auth — e.vx/e.vy existen en la entidad pero son INERTES para enemigos (documentado sim.js:8543 "e.vx/e.vy NO se integra en el movimiento enemigo"; el mov. enemigo = dir-de-persecución × ESCALAR espd + integración de knockX/knockY). La ÚNICA señal de rapidez es el ESCALAR ESTÁTICO del template e.tpl.spd, cuyos ÚNICOS modificadores dinámicos son enrage (#78 FURIA — e.enrageSpd hornea a e.tpl.spd) y slow (#85 CONTROL — e.slowT). ⇒ "mob veloz" = enfurecido (#78) O no-ralentizado (#85) ⇒ AMBOS extremos del eje de velocidad YA son ejes reclamados ⇒ NO ⊥29 ⇒ NO forzar. Pivote justificado al alterno FRESCO #1 del board: DISTANCIA/RANGO del golpe de remate (geometría hero↔víctima al kill).
//  · EJE server-auth: reachWeight(dist)=peso por la DISTANCIA (px) hero↔víctima en el instante del remate (posiciones replicadas de G.hero + e ⇒ geometría PURA determinista, MISMO valor para todo observador del mismo snapshot). far(≥farR)⇒2 (sniper), near(≥midR,<farR)⇒1 (stand-off), point-blank(<midR)⇒0 (melee, sin recompensa). El SCORE del kill = reachWeight(dist víctima), muestreado en el TOP de killEnemy con la posición viva del mob (antes del splice). La señal VIVA del badge/VM = longshotScore(hero)=MAX reachWeight sobre los mobs VIVOS en radio (el mejor long-shot DISPONIBLE ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_reachPre`=reachWeight(dist hero↔víctima) muestreado en el TOP). Al rematar un mob no-neutral DESDE LEJOS (reachWeight≥1 vía `_reachPre`), el héroe cosecha fichas de puntería = longshotForage(hero, tpl, _reachPre), banca a h.reachBounty vía grantReachBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_reachPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: reachWeight en el kill = O(1) 1×/kill; longshotScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥29 (NINGUNO de los 29 ejes previos): ⊥ #87 [manada=DISTANCIA mob↔mob (clustering INTER-mob) vs DISTANCIA hero↔víctima ÚNICA]; ⊥ #86 [siega=FRACCIÓN DE VIDA e.hp/e.maxHp]; ⊥ #85 [control=ESTADO CC e.stun/e.slowT]; ⊥ #84 [escaramuza=CLASE DE ALCANCE del MOB e.tpl.ranged (stat del ENEMIGO) vs GEOMETRÍA hero↔víctima del remate (posición del HÉROE) — melee-hero rematando de cerca a un arquero=alta escaramuza/cero remate; ranged-hero abatiendo de lejos a un orco melee suelto=cero escaramuza/alto remate, DIVERGEN]; ⊥ #73 [apex=DISTANCIA hero→un JEFE/CAMPEÓN vivo (blanco especial, premia CERCANÍA, estado PERSISTENTE de pie) vs DISTANCIA hero→la VÍCTIMA REAL cualquiera en el INSTANTE del kill (premia LEJANÍA), conjunto-blanco/signo/timing distintos]; ⊥ #69 [LAST_STAND=CONTEO de ENGANCHADOS en melee (todos de cerca) — premia lo OPUESTO al remate lejano]. NO velocidad (recomendado, falló pre-flight). NO sigilo/terreno/clima/tiempo/tempo/social/territorial.
export const LONGSHOT_SURGE = {
  enabled: true,             // LIVE — EVO#88 (CAS-2530 flip). Encendida tras CEO Gate 1/2 byte-verify + DARK QA Gate 2/2 CAS-2529 PASS 12/12 (2-cli 0-desync, fp 15920977) + CEO Gate 2/2. 30º flag (Remate a Distancia). Era DARK: byte-neutral OFF con enabled:false (`_reachPre`=0 const inerte + seam rama muerta ⇒ killEnemy byte-idéntico al HEAD).
  channel: "reachFind",      // canal FRESCO (recompensa de fichas de puntería por REMATAR DE LEJOS) — NINGUNA de las 29 flags #59-#87 lo usa. Familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind) LLENA ⇒ fichas de puntería es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX reachWeight sobre los mobs VIVOS en radio (el mejor long-shot disponible ahora). El GRANT REAL usa la distancia propia de la víctima (sin cap de radio). CEO balance knob.
  farR: 210,                 // umbral SNIPER (px, ~6.5 tiles): un remate a ≥ esto pesa 2 (long-shot genuino). CEO balance knob.
  midR: 110,                 // umbral STAND-OFF (px, ~3.4 tiles): un remate a ≥ esto (y < farR) pesa 1. < midR = point-blank (melee) ⇒ 0. CEO balance knob.
  reachBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de puntería por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  reachWeights: { far: 2, near: 1 },   // PESO de un remate por su DISTANCIA: sniper (≥farR) pesa 2; stand-off (≥midR, <farR) pesa 1; point-blank (<midR) ⇒ 0. CEO balance knobs.
  // TABLA de tiers por PESO DE REMATE (score∈{0,1,2}). MÁS lejos = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (point-blank) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (stand-off, remate a ≥midR): +1 ficha de puntería por kill.
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (sniper, remate a ≥farR): +2 fichas por kill. "el tiro largo". CEO balance knobs.
  ],
};

// CAS-2532: REMATE DE INTERRUPCIÓN (INTERRUPT_SURGE, EVO#89 DARK) — EJE ESTADO-DE-ACCIÓN-EN-PROGRESO DEL MOB AL INSTANTE DEL REMATE (denegar la habilidad enemiga: rematar a un mob MIENTRAS ejecuta una acción peligrosa — mid-windup / mid-strike / mid-canal de una habilidad — NO a un mob pasivo/ocioso) + canal FRESCO interruptFind (recompensa de fichas de interrupción por rematar EN MEDIO de una acción comprometida — el que corta la habilidad al abatir, no al que remata a un mob quieto). Camino al 31º flag (serializa tras #88 LONGSHOT_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = INTERRUPT/estado-de-acción del mob) → PASA: EXISTE una máquina de estados de acción server-auth DETERMINISTA por mob en updateEnemies — `e.state` ∈ {idle,wander,chase,windup,strike,recover,shield,flee} + el timer `e.st` decrementado por `e.st-=dt` a paso-fijo (sim.js:8010/8019/8027/8055/8124/8141). windup = el mob COMPROMETE un ataque (el aviso/telegraph antes del golpe); strike = ejecuta el golpe; shield = un jefe CANALIZA (carapace/Freeze Nova). Es DINÁMICO, server-auth (parte de la sim de paso-fijo, NO wall-clock, NO interp de cliente), y NINGUNA de las 30 flags #59-#88 lo lee como eje de SCORE (los únicos lectores de e.state son gates de IA/anim/engage/wantCombat + los harness de test — 0 puntúan sobre él). CRUX ⊥ CC #85: #85 puntúa e.stun/e.slowT = estado IMPUESTO SOBRE el mob (negación PASIVA que el héroe le aplicó); interrupt puntúa la ACCIÓN PROPIA del mob en su máquina de estados (windup/strike/shield) siendo DENEGADA al matarlo — y es el COMPLEMENTO EXACTO: interruptWeight EXCLUYE a los stun-frozen (e.stun>0 ⇒ 0, porque el gate de stun sim.js:7942 hace `continue` y CONGELA la IA ⇒ el mob NO está ejecutando nada) mientras #85 los PUNTÚA (⇒ 2). Un mob puede castear/windup sin estar CC'd (interrupt≥1/CC 0) y un mob CC'd está congelado sin ejecutar (CC 2/interrupt 0) ⇒ DISJUNTOS, ⊥ probado.
//  · EJE server-auth: interruptWeight(e)=peso por el ESTADO DE ACCIÓN COMPROMETIDA del mob al morir. HABILIDAD PESADA en curso (canal shield/Freeze Nova, special slam/lunge `e.specialNow`, o cast de warlock `e.castNow`) ⇒ 2; ataque NORMAL comprometido (windup/strike sin special/cast) ⇒ 1; ocioso/persiguiendo/recover/flee/stun-frozen ⇒ 0. El SCORE del kill = interruptWeight(víctima) muestreado en el TOP de killEnemy con la acción VIVA del mob (antes del splice) — es la VÍCTIMA propia (⊥ auto-conteo N/A, como #88 remate). La señal VIVA del badge/VM = interruptScore(hero)=MAX interruptWeight sobre los mobs VIVOS en radio (la mejor interrupción DISPONIBLE ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_interruptPre`=interruptWeight(e) muestreado en el TOP). Al rematar un mob no-neutral que estaba EJECUTANDO una acción (interruptWeight≥1 vía `_interruptPre`), el héroe cosecha fichas de interrupción = interruptForage(hero, tpl, _interruptPre), banca a h.interruptBounty vía grantInterruptBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_interruptPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: interruptWeight en el kill = O(1) 1×/kill; interruptScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥30 (NINGUNO de los 30 ejes previos): ⊥ #88 [remate=DISTANCIA magnitud hero↔víctima (geometría); interrupt=ESTADO DE ACCIÓN categórico de la víctima, sin geometría]; ⊥ #87 [manada=clustering mob↔mob]; ⊥ #86 [siega=FRACCIÓN DE VIDA e.hp/e.maxHp]; ⊥ #85 [control=ESTADO CC IMPUESTO e.stun/e.slowT — COMPLEMENTO EXACTO, ver CRUX]; ⊥ #84 [escaramuza=CLASE DE ALCANCE ESTÁTICA e.tpl.ranged (stat de spawn) vs ACCIÓN DINÁMICA en curso — un arquero ocioso=alta escaramuza/cero interrupt; un orco melee mid-slam=cero escaramuza/alto interrupt, DIVERGEN]; ⊥ #78 [furia=BOOLEANO e.enraged (fase de jefe); enrage MODULA la duración del windup pero el eje es la fase, no "está-ejecutando" — un mob no-enfurecido mid-windup puntúa, uno enfurecido ocioso no]; ⊥ #73 [apex=DISTANCIA a un jefe/campeón]; ⊥ facing/backstab [ángulo geométrico hero↔mob]; NO velocidad/sigilo/terreno/clima/tiempo/tempo/social/territorial.
export const INTERRUPT_SURGE = {
  enabled: true,             // LIVE — EVO#89 (CAS-2534 flip false→true, 31º flag). Encendido tras CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2533 INDEP PASS 15/15 @420958e (2-cli fp 15920977 0-desync) + CEO Gate 2/2 PASS. Con enabled:true, `_interruptPre`=interruptWeight(e) VIVO y el seam de killEnemy banca fichas de interrupción a h.interruptBounty.
  channel: "interruptFind",  // canal FRESCO (recompensa de fichas de interrupción por rematar MID-ACCIÓN) — NINGUNA de las 30 flags #59-#88 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind) está LLENA ⇒ fichas de interrupción es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX interruptWeight sobre los mobs VIVOS en radio (la mejor interrupción disponible ahora). El GRANT REAL usa la acción propia de la víctima (sin cap de radio). CEO balance knob.
  weights: { heavy: 2, light: 1 },   // PESO de una interrupción por la GRAVEDAD de la acción denegada: habilidad PESADA (canal shield / special slam-lunge / cast warlock) pesa 2; ataque NORMAL comprometido (windup/strike) pesa 1; ocioso/stun-frozen ⇒ 0. CEO balance knobs.
  interruptBountyCap: 2,     // SUB-CAP DURO PROPIO de las fichas de interrupción por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE INTERRUPCIÓN (score∈{0,1,2}). Acción MÁS peligrosa = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (ocioso) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado mid-windup/strike de un ataque NORMAL): +1 ficha de interrupción por kill. "cortar el golpe".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado mid-habilidad PESADA: special slam/lunge, cast de warlock, o canal shield/Freeze Nova): +2 fichas por kill. "negar la habilidad". CEO balance knobs.
  ],
};

// CAS-2537: REMATE DE EMBESTIDA (HEADING_SURGE, EVO#90 DARK) — EJE RUMBO/HEADING DEL MOB RELATIVO AL HÉROE AL INSTANTE DEL REMATE (dirección de MOVIMIENTO/INTENCIÓN del mob respecto al héroe: cargando/acercándose de frente vs interceptando/lateral vs huyendo/alejándose/ocioso) + canal FRESCO headingFind (recompensa de fichas de embestida por rematar a un mob que CARGA HACIA el héroe — el que corta al agresor que se le viene encima, no al que huye o deambula). Camino al 32º flag (serializa tras #89 INTERRUPT_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = HEADING/rumbo de movimiento del mob) → PASA: EXISTE una dirección de MOVIMIENTO/INTENCIÓN server-auth DETERMINISTA por mob, derivada de la máquina de estados de movimiento de updateEnemies (NO de e.vx/e.vy — que están INERTES para enemigos, riesgo documentado en #88 LONGSHOT sim.js:8543). La INTENCIÓN de paso por tick se computa de la MISMA rama de IA que aplica el moveEnt: chase & NO-kite & d>range ⇒ el mob CIERRA hacia el héroe (paso = dir mob→hero, sim.js:8036 `moveEnt(cos(facing)*espd*dt,…)`), chase de arquetipo caster/summoner/healer con d<kite ⇒ KITEA ALEJÁNDOSE (paso = dir hero→mob, sim.js:8028 `ra=atan2(e.y-h.y,e.x-h.x)`), flee ⇒ ALEJÁNDOSE, idle/wander ⇒ deriva ambiental (vector wander e.wx/e.wy sembrado por rr() determinista), y windup/strike/recover/shield ⇒ ESTACIONARIO (NO hay moveEnt ⇒ sin traslación ⇒ 0). Es DINÁMICO, server-auth (paso-fijo dt, parte de la sim, NO wall-clock, NO interp de cliente), y NINGUNA de las 31 flags #59-#89 lo lee como eje de SCORE.
//  · EJE server-auth GEOMÉTRICO: headingWeight(e)=peso por el SIGNO DEL PRODUCTO PUNTO entre el vector de INTENCIÓN-DE-MOVIMIENTO del mob (m, unitario) y el vector hero→mob (u, unitario) al morir. dot=m·u. CARGANDO DE FRENTE (dot ≤ chargeCos −0.5 ⇒ el paso apunta HACIA el héroe, opuesto a hero→mob) ⇒ charge(2); LATERAL/INTERCEPTANDO (−0.5 < dot < 0.5 ⇒ paso ~perpendicular) ⇒ lateral(1); HUYENDO/ALEJÁNDOSE (dot ≥ fleeCos 0.5 ⇒ paso alineado con hero→mob) ⇒ 0; ESTACIONARIO/comprometido (windup/strike/recover/shield o sin vector de wander) ⇒ 0. El SCORE del kill = headingWeight(víctima) muestreado en el TOP de killEnemy con la posición+estado VIVOS del mob (antes del splice) — es la VÍCTIMA propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt). La señal VIVA del badge/VM = headingScore(hero)=MAX headingWeight sobre los mobs VIVOS en radio (la embestida más peligrosa DISPONIBLE ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_headingPre`=headingWeight(e) muestreado en el TOP). Al rematar un mob no-neutral que CARGABA/interceptaba (headingWeight≥1 vía `_headingPre`), el héroe cosecha fichas de embestida = headingForage(hero, tpl, _headingPre), banca a h.headingBounty vía grantHeadingBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_headingPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: headingWeight en el kill = O(1) 1×/kill; headingScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥31 (CRUX crítico ⊥ #89 INTERRUPT): #89 puntúa la ACCIÓN comprometida del mob (windup/strike/shield — CATEGORÍA de estado de acción); heading puntúa la DIRECCIÓN de MOVIMIENTO (chase-toward/lateral/flee — GEOMETRÍA del paso). NO es un re-mapeo de los mismos buckets de e.state: DENTRO del ÚNICO estado `chase`, heading vale 2 (orco cerrando, d>range, paso hacia el héroe) O 0 (mago kiteando, arquetipo caster + d<kite, paso alejándose) según ARQUETIPO+GEOMETRÍA (d vs kite/range) — MISMO e.state, heading OPUESTO, mientras INTERRUPT colapsa TODO chase a 0. Y COMPLEMENTO en el otro sentido: un mob mid-windup tiene INTERRUPT≥1 pero heading=0 (plantado, sin traslación); un mob cargando (heading 2) NO ha comprometido ataque aún (INTERRUPT 0) ⇒ DISJUNTOS, ⊥ probado. ⊥ backstab/facing [heading = dirección de TRASLACIÓN del mob; backstab/facing = ORIENTACIÓN/ángulo del mob y dónde está el HÉROE — un mob puede HUIR (heading 0) mientras el héroe lo golpea de frente]; ⊥ #88 remate [DISTANCIA MAGNITUD |hero-mob|, sin dirección — un mob a 300px cargando=heading2, otro a 300px huyendo=heading0, MISMA magnitud, DIVERGEN]; ⊥ #87 manada [clustering mob↔mob]; ⊥ #86 siega [FRACCIÓN DE VIDA]; ⊥ #85 CC [e.stun/e.slowT impuesto]; ⊥ #84 escaramuza [CLASE DE ALCANCE ESTÁTICA e.tpl.ranged]; ⊥ #78 furia [BOOLEANO e.enraged]; ⊥ #73 apex [DISTANCIA a jefe]; NO velocidad(|v|, e.vx/e.vy INERTES)/sigilo/terreno/clima/tiempo/tempo/social/territorial.
export const HEADING_SURGE = {
  enabled: true,             // LIVE — EVO#90 (CAS-2539, 32º flag). Flip false→true tras CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2538 INDEP PASS 15/15 @c4189a88 (2-cli fp 15920977 0-desync) + CEO Gate 2/2 PASS. Base master HEAD 21bfa4f8.
  channel: "headingFind",    // canal FRESCO (recompensa de fichas de embestida por rematar a un mob que CARGA) — NINGUNA de las 31 flags #59-#89 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind) está LLENA ⇒ fichas de embestida es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX headingWeight sobre los mobs VIVOS en radio (la embestida más peligrosa disponible ahora). El GRANT REAL usa el rumbo propio de la víctima (sin cap de radio). CEO balance knob.
  weights: { charge: 2, lateral: 1 },   // PESO de un remate por el RUMBO del mob: CARGANDO DE FRENTE (paso hacia el héroe) pesa 2; LATERAL/interceptando (paso ~perpendicular) pesa 1; HUYENDO/alejándose/ocioso-estacionario ⇒ 0. CEO balance knobs.
  chargeCos: -0.5,           // umbral de PRODUCTO PUNTO m·u para CARGA: dot ≤ −0.5 (paso dentro de ~60° de "recto hacia el héroe") ⇒ charge(2). GEOMÉTRICO puro. CEO balance knob.
  fleeCos: 0.5,              // umbral de PRODUCTO PUNTO m·u para HUIDA: dot ≥ 0.5 (paso dentro de ~60° de "recto alejándose") ⇒ 0. Entre ambos umbrales ⇒ lateral(1). CEO balance knob.
  headingBountyCap: 2,       // SUB-CAP DURO PROPIO de las fichas de embestida por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE RUMBO (score∈{0,1,2}). Rumbo MÁS agresivo (cargando) = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (huyendo/estacionario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado moviéndose LATERAL/interceptando al héroe): +1 ficha de embestida por kill. "cortar al que flanquea".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado CARGANDO DE FRENTE hacia el héroe): +2 fichas por kill. "rematar la embestida". CEO balance knobs.
  ],
};

// CAS-2541: REMATE EN ZONA PELIGROSA (ZONETIER_SURGE, EVO#91 DARK) — EJE DIFICULTAD/TIER DE LA ZONA GEOGRÁFICA server-auth DONDE MUERE EL MOB (banda de nivel del ÁREA del kill: zona endgame/peligrosa vs zona inicial) + canal FRESCO tierFind (recompensa de fichas de frontera por rematar a un mob en una zona de alto tier — el que despacha en tierra profunda/hostil, no en el prado inicial). Camino al 33º flag (serializa tras #90 HEADING_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = ZONE-TIER / dificultad del área) → PASA: EXISTE una propiedad GEOGRÁFICA server-auth DETERMINISTA por posición — `zoneOf(world,x,y)` (sim/world.js:607) resuelve la zona por CONTENCIÓN DE RECTÁNGULO del mundo (town/forest/ruins/caves/arena/swamp/abyss/caldera/frost/trial/field), y `ZONE_TIER[zone].tier` (sim/config.js:620) mapea cada zona a su BANDA de dificultad 1..7 (forest1/ruins2/caves3/arena·swamp4/abyss·caldera5/frost6/trial7; town·field=0). El mundo se construye DETERMINISTA del mismo mapa/seed ⇒ los MISMOS rects ⇒ `zoneOf` da la MISMA zona para un (x,y) dado en N clientes; NO wall-clock, NO estado de cliente, NO RNG. NINGUNA de las 32 flags #59-#90 lo lee como eje de SCORE (ZONE_TIER sólo escala hp/dmg/spd/xp en applyZoneScale, sim.js:2299 — nunca es una recompensa de kill; e.zoneTier se estampa al spawn para que un summoner escale sus adds, jamás puntúa).
//  · EJE server-auth GEOGRÁFICO: tierWeight(e)=peso por la BANDA DE DIFICULTAD de la zona en la POSICIÓN DEL KILL. z=zoneTierAt(e.x,e.y)=ZONE_TIER[zoneOf(world,e.x,e.y)].tier (0 si town/field/fuera). z≥hiTier(4) ⇒ zona PELIGROSA/endgame (arena/swamp/abyss/caldera/frost/trial) ⇒ high(2); z≥midTier(2) ⇒ zona INTERMEDIA (ruins/caves) ⇒ mid(1); z<midTier (forest tier-1 / town / field) ⇒ 0. Se recomputa zoneOf EN LA POSICIÓN VIVA del mob al morir (⊥ el spawn-stamp e.zoneTier — un mob arrastrado cruzando un borde puntúa por dónde MUERE, no por dónde nació). El SCORE del kill = tierWeight(víctima) muestreado en el TOP de killEnemy con la posición VIVA del mob (antes del splice) — es la VÍCTIMA propia (⊥ auto-conteo N/A, como #88 remate/#89 interrupt/#90 embestida). La señal VIVA del badge/VM = tierScore(hero)=MAX tierWeight sobre los mobs VIVOS en radio (el kill de zona más peligrosa DISPONIBLE ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_tierPre`=tierWeight(e) muestreado en el TOP). Al rematar un mob no-neutral en una zona de tier≥medio (tierWeight≥1 vía `_tierPre`), el héroe cosecha fichas de frontera = tierForage(hero, tpl, _tierPre), banca a h.tierBounty vía grantTierBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_tierPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: tierWeight en el kill = O(1) 1×/kill (1 zoneOf = ~10 inRect); tierScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥32 (CRUX): eje GEOGRÁFICO ESTÁTICO del terreno (banda de dificultad del ÁREA), NO conteo/densidad/geometría/estado. ⊥ #72 ESCASEZ [escasez = AUSENCIA/CONTEO de mobs vivos (densidad TEMPORAL); zone-tier = propiedad ESTÁTICA de DÓNDE, no de CUÁNTOS — MISMA tile puntúa igual con 1 o 5 mobs]. ⊥ #70 MATERIAL-TERRENO/FIRM_FOOTING [#70 = TIPO DE TILE bajo los pies (grass/stone/ice, física de pisada); zone-tier NO lee el material del tile — lee zoneOf (contención de RECT del mundo), 2 tiles de material distinto en la MISMA zona ⇒ MISMO tier]. ⊥ #82 vorágine/MAELSTROM [#82 = zonas de negación de HECHIZO DINÁMICAS (G.fields, aparecen/expiran); zone-tier = región de dificultad ESTÁTICA del mapa, nunca cambia]. ⊥ #73 apex [apex = DISTANCIA a un jefe/campeón VIVO; zone-tier = dificultad del ÁREA, sin blanco ni distancia — un mob solo en el rincón del abismo puntúa 2 sin jefe cerca]. ⊥ #88 remate [DISTANCIA MAGNITUD hero↔víctima; zone-tier = en qué ZONA cae la víctima — un mob rematado a quemarropa en el abismo=2, uno rematado de lejos en el prado=0, la distancia NO decide]. ⊥ #90 embestida [DIRECCIÓN de movimiento; zone-tier = geografía estática — MISMA tile puntúa igual cargando o huyendo]. ⊥ #86 siega [FRACCIÓN DE VIDA], ⊥ #85 CC [e.stun/e.slowT], ⊥ #84 escaramuza [CLASE DE ALCANCE e.tpl.ranged], ⊥ #78 furia [BOOLEANO e.enraged], ⊥ #76 variante [e.variant], ⊥ #74 afijo [e.affix]. NO velocidad/sigilo/clima/tiempo/tempo/social/territorial.
export const ZONETIER_SURGE = {
  enabled: true,             // LIVE — EVO#91 (CAS-2544, 33º flag). Flipeado false→true tras CEO Gate 1/2 byte-verify + DARK QA Gate 2/2 CAS-2543 PASS 21/21 (2-cli 0-desync fp 15920977 terrHash 2105484439) + CEO Gate 2/2. Base master HEAD ec0d2a5 / served 985626b23619.
  channel: "tierFind",       // canal FRESCO (recompensa de fichas de frontera por rematar en una zona de alto tier) — NINGUNA de las 32 flags #59-#90 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind) está LLENA ⇒ fichas de frontera es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX tierWeight sobre los mobs VIVOS en radio (el kill de zona más peligrosa disponible ahora). El GRANT REAL usa la zona propia de la víctima al morir (sin cap de radio). CEO balance knob.
  weights: { high: 2, mid: 1 },   // PESO de un remate por la BANDA de la zona del kill: zona PELIGROSA/endgame (tier≥hiTier) pesa 2; zona INTERMEDIA (tier≥midTier) pesa 1; zona inicial/segura (forest tier-1 / town / field) ⇒ 0. CEO balance knobs.
  hiTier: 4,                 // umbral de BANDA para zona PELIGROSA: ZONE_TIER.tier ≥ 4 (arena/swamp/abyss/caldera/frost/trial) ⇒ high(2). GEOGRÁFICO puro (banda de dificultad estática). CEO balance knob.
  midTier: 2,                // umbral de BANDA para zona INTERMEDIA: ZONE_TIER.tier ≥ 2 (ruins/caves) ⇒ mid(1). Entre 0 y midTier (forest tier-1 / town / field) ⇒ 0. CEO balance knob.
  tierBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de frontera por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE ZONA (score∈{0,1,2}). Zona MÁS peligrosa (endgame) = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (zona inicial/segura) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado en una zona INTERMEDIA: ruinas/cuevas): +1 ficha de frontera por kill. "despachar en tierra intermedia".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado en una zona PELIGROSA/endgame: arena/ciénaga/abismo/caldera/cripta/coliseo): +2 fichas por kill. "rematar en tierra profunda". CEO balance knobs.
  ],
};

// CAS-2546: REMATE DE MOLE (BULK_SURGE, EVO#92 DARK) — EJE BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE server-auth (la MOLE/bulto físico intrínseco de la criatura: un orco/alce corpulento vs una rata/murciélago menudo) + canal FRESCO bulkFind (recompensa de fichas de mole por rematar a un mob VOLUMINOSO — el que despacha a una bestia corpulenta, no a la alimaña menuda). Camino al 34º flag (serializa tras #91 ZONETIER_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = CHALLENGE-RATING / nivel del mob vs héroe) → FALLA: NO existe un nivel entero determinista propio del mob. ETPL (config.js:288) NO tiene campo `lvl` en ninguna fila (sólo hp/dmg/spd/xp/size/range/...); spawnEnemy (sim.js:2258) NO estampa e.lvl ni un nivel efectivo horneado; el único `lvl` server-auth es hero.lvl (y el `lvl` del compañero MENTOR_BOND, no de un mob de combate). Sin nivel de mob ⇒ la DIFERENCIA mobLvl−heroLvl NO es computable ⇒ NO se fuerza (regla del issue) ⇒ PIVOTE al alterno FRESCO sancionado #2 del board: BANDA DE TAMAÑO/HITBOX.
//  · PRE-FLIGHT del alterno TAMAÑO → PASA: `size` es un ESCALAR ENTERO DETERMINISTA por template (radio de colisión/hitbox: rat15/bat14/volatile16 · wolf18/spearman19/bandit19/skeleton20/summoner20/wraith20/mage21/orc22 · moose26/charger26 · golem36/dragon50), server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG), y NINGUNA de las 33 flags #59-#91 lo lee como SCORE (`.size` sólo se usa para colisión/render/knockback/floaters — jamás recompensa de kill). CLAVE ⊥#74/⊥champion: se lee el TAMAÑO BASE INMUTABLE `ETPL[e.type].size` (la mole del TIPO), NO `e.tpl.size` — el afijo #74 (A.sizeMul, sim.js:2407) y la promoción a campeón (C.sizeMul, sim.js:2390) INFLAN el CLON e.tpl.size pero jamás mutan la fila base de ETPL ⇒ leer la base desacopla la mole del afijo/campeón por construcción.
//  · EJE server-auth ESTÁTICO: bulkWeight(e) = peso por la BANDA DE TAMAÑO del TIPO. sz=ETPL[e.type].size (base inmutable). sz≥hiSize(24) ⇒ mole GRANDE (bestia corpulenta) ⇒ large(2); sz≥midSize(18) ⇒ mole MEDIA ⇒ mid(1); sz<midSize (alimaña menuda: rata/murciélago/volátil) ⇒ 0. LUT PURA server-auth. NO filtra e.dead (el eje ES la víctima propia, como tierWeight #91/headingWeight #90 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/tamaño es inmutable ⇒ señal FIEL). El SCORE del kill = bulkWeight(víctima) muestreado en el TOP de killEnemy (⊥ auto-conteo N/A, es la víctima propia). La señal VIVA del badge/VM = bulkScore(hero)=MAX bulkWeight sobre los mobs VIVOS en radio (la mole más grande rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_bulkPre`=bulkWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de tamaño≥medio (bulkWeight≥1 vía `_bulkPre`), el héroe cosecha fichas de mole = bulkForage(hero, tpl, _bulkPre), banca a h.bulkBounty vía grantBulkBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_bulkPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: bulkWeight en el kill = O(1) 1×/kill (1 lookup ETPL); bulkScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥33 (CRUX): eje TAMAÑO FÍSICO ESTÁTICO del TIPO de mob (mole/hitbox intrínseco), NO área/dificultad/vida/conteo/geometría/estado. ⊥ #91 ZONE-TIER [dificultad del ÁREA donde muere (propiedad del TERRENO, zoneOf→ZONE_TIER.tier); mole = tamaño del MOB MISMO (propiedad de la ENTIDAD) — una rata menuda (sz15⇒0) en el abismo endgame puntúa 2 en #91/0 en mole; un alce corpulento (sz26⇒2) vagando al prado inicial puntúa 0 en #91/2 en mole. Y applyZoneScale escala hp/dmg/spd/xp pero NUNCA size ⇒ mole INDEPENDIENTE de zona]. ⊥ #86 SIEGA/fracción-vida [e.hp/e.maxHp DINÁMICO (cuán-muerto); mole = tamaño ESTÁTICO del template (cuán-grande) — una rata a plena vida vs un golem al 5%: mole 0 vs 2, siega 0 vs 2, DISJUNTOS]. ⊥ #74 AFIJO [e.affix modificador de spawn categórico; mole lee ETPL[type].size BASE inmutable — un mob sin afijo pero grande ⇒ alta mole/0 afijo; una rata 'swift' con sizeMul infla e.tpl.size pero mole lee la BASE⇒0]. ⊥ #73 APEX [DISTANCIA geométrica a un jefe/campeón vivo; mole = tamaño del mob rematado sin distancia ni blanco — un alce común lejos de todo jefe ⇒ alta mole/0 apex]. ⊥ #76 VARIANTE [e.variant tipo de encuentro {stalker,bastion,glass}; mole = escalar numérico de tamaño del tipo base]. ⊥ #78 FURIA [BOOLEANO de fase e.enraged], ⊥ #85 CC [e.stun/e.slowT], ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged, no tamaño físico], ⊥ #88 REMATE [DISTANCIA hero↔víctima], ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento], ⊥ #89 INTERRUPT [estado de acción], ⊥ #87 MANADA [clustering mob↔mob], ⊥ velocidad [un murciélago menudo vuela veloz (sz14,spd158) y un golem es lento (sz36,spd46) — la mole lee TAMAÑO no rapidez]. NO nivel(inexistente)/edad/sigilo/clima/tiempo/tempo/social/territorial.
export const BULK_SURGE = {
  enabled: true,             // LIVE — EVO#92 (CAS-2548, 34º flag). Flip false→true tras CEO Gate 1/2 byte-verify PASS + DARK QA Gate 2/2 CAS-2547 PASS 15/15 (2-cli 0-desync) + CEO Gate 2/2. Base master HEAD 948ff22 / served db02ca6bb457 (#91 DARK base).
  channel: "bulkFind",       // canal FRESCO (recompensa de fichas de mole por rematar a un mob VOLUMINOSO) — NINGUNA de las 33 flags #59-#91 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind) está LLENA ⇒ fichas de mole es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX bulkWeight sobre los mobs VIVOS en radio (la mole más grande rematable ahora). El GRANT REAL usa el tamaño propio de la víctima (sin cap de radio). CEO balance knob.
  weights: { large: 2, mid: 1 },   // PESO de un remate por la BANDA de tamaño del TIPO del mob: mole GRANDE (bestia corpulenta, size≥hiSize) pesa 2; mole MEDIA (size≥midSize) pesa 1; alimaña menuda (size<midSize: rata/murciélago/volátil) ⇒ 0. CEO balance knobs.
  hiSize: 24,                // umbral de BANDA para mole GRANDE: ETPL[type].size ≥ 24 (moose/charger + jefes golem/dragon) ⇒ large(2). ESCALAR ESTÁTICO puro (hitbox del tipo). CEO balance knob.
  midSize: 18,               // umbral de BANDA para mole MEDIA: ETPL[type].size ≥ 18 (wolf/skeleton/orc/mage/...) ⇒ mid(1). Entre 0 y midSize (rat15/bat14/volatile16) ⇒ 0. CEO balance knob.
  bulkBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de mole por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE MOLE (score∈{0,1,2}). Mob MÁS voluminoso = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (alimaña menuda) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado de mole MEDIA: lobo/esqueleto/orco/mago): +1 ficha de mole por kill. "despachar a la bestia mediana".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado de mole GRANDE: alce/embestidor/golem/dragón): +2 fichas por kill. "rematar a la mole". CEO balance knobs.
  ],
};

// CAS-2551: REMATE DE CABECILLA (ROLE_SURGE, EVO#93 DARK) — EJE ROL/ARQUETIPO DE COMBATE del mob TYPE server-auth (la FUNCIÓN en el campo de batalla intrínseca de la criatura: un habilitador de soporte — médico que cura a la manada o nigromante que invoca refuerzos — vs un disruptor especialista — brujo/kamikaze/castigador — vs un peleador estándar) + canal FRESCO roleFind (recompensa de fichas de cabecilla por rematar a un mob de ALTO VALOR TÁCTICO — el que despacha al habilitador/pieza clave del pack, no al bruto de a pie). Camino al 35º flag (serializa tras #92 BULK_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado = KILL-EFFORT / Nº de golpes para matar al mob) → FALLA: NO existe un contador entero determinista de golpes-por-mob server-auth. El path de daño hero→enemy (hitEnemy sim.js:5668) hace `e.hp-=dmg` (sim.js:5966) y NO incrementa ningún `e.hits`/`e.timesHit`/nº-de-instancias-de-daño; spawnEnemy (sim.js:2258) NO estampa contador de impactos. Y aún si se añadiera: nº-de-golpes-para-matar = e.maxHp / dañoPorGolpe-del-héroe ⇒ ENTRELAZADO con el DPS/tempo del héroe (frenesí +dmg/stack ⇒ MENOS golpes al MISMO mob; combo/cadence#67 modulan el daño por golpe) ⇒ NO es propiedad INTRÍNSECA del mob y NO es ⊥ cadence#67/frenzy/combo ⇒ FALLA el gate de ortogonalidad ⇒ NO se fuerza (regla del issue) ⇒ PIVOTE al alterno FRESCO sancionado #2 del board: ARQUETIPO/ROL.
//  · PRE-FLIGHT del alterno ARQUETIPO/ROL → PASA: `arch` es un CATEGÓRICO ESTÁTICO por template (config.js:290+; valores brute/caster/charger/healer/punisher/rusher/summoner/volatile/warlock — el ROL de IA de la criatura), server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 34 flags #59-#92 lo lee como SCORE (`arch` sólo se usa para la rama de IA de movimiento [sim.js:4519/8225/8255/8269], el gate del pool de afijos [excluye 'volatile'] y el telegraph de render — jamás recompensa de kill). CLAVE ⊥#73/⊥champion: se lee el ROL BASE INMUTABLE `ETPL[e.type].arch` (el rol del TIPO), NO `e.tpl.arch` — la promoción a campeón LIMPIA el clon (`arch:undefined`, sim.js:6318) pero JAMÁS muta la fila base de ETPL ⇒ leer la base desacopla el rol de campeón/afijo por construcción. ⊥#84 ESCARAMUZA (que lee e.tpl.ranged / e.tpl.range = CLASE DE ALCANCE): el ROL es un CAMPO DISTINTO y el SCORE NO rastrea el alcance — la banda ENABLER (summoner/healer, dmg:0, NO ranged) ⇒ 2 pero #84 ⇒ 0; el caster de alcance (spearman/mage, ranged:true) ⇒ ROL 0 pero #84 ⇒ 2 (OPUESTOS); la banda DISRUPTOR MEZCLA alcance (warlock ranged + volatile/punisher melee) ⇒ NINGUNA banda rastrea `ranged` monotónicamente ⇒ ⊥#84 por construcción.
//  · EJE server-auth ESTÁTICO: roleWeight(e) = peso por la BANDA DE ROL del TIPO. arch=roleOf(e)=ETPL[e.type].arch (base inmutable). roleTier[arch]==="enabler" (summoner/healer: habilitador de soporte, force-multiplier dmg:0) ⇒ enabler(2); ==="disruptor" (warlock/volatile/punisher: amenaza de mecánica especial) ⇒ disruptor(1); else (brute/charger/rusher/caster: peleador estándar, o sin arch) ⇒ 0. LUT PURA server-auth data-driven. NO filtra e.dead (el eje ES la víctima propia, como bulkWeight #92/tierWeight #91 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/rol es inmutable ⇒ señal FIEL). El SCORE del kill = roleWeight(víctima) muestreado en el TOP de killEnemy (⊥ auto-conteo N/A, es la víctima propia). La señal VIVA del badge/VM = roleScore(hero)=MAX roleWeight sobre los mobs VIVOS en radio (la pieza clave más valiosa rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_rolePre`=roleWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de rol≥disruptor (roleWeight≥1 vía `_rolePre`), el héroe cosecha fichas de cabecilla = roleForage(hero, tpl, _rolePre), banca a h.roleBounty vía grantRoleBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_rolePre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: roleWeight en el kill = O(1) 1×/kill (1 lookup ETPL + 1 lookup LUT); roleScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥34 (CRUX): eje ROL/FUNCIÓN DE COMBATE ESTÁTICO del TIPO de mob (arquetipo de IA intrínseco), NO tamaño/área/vida/conteo/geometría/estado/alcance. ⊥ #92 BULK/MOLE [BANDA DE TAMAÑO físico ETPL[type].size; rol = FUNCIÓN de IA (arch) — un summoner menudo (size20⇒mole media 1) es ENABLER (rol 2); un moose corpulento (size26⇒mole grande 2) es BRUTE (rol 0); DISJUNTOS, tamaño ⊥ rol]. ⊥ #91 ZONE-TIER [dificultad del ÁREA donde muere (TERRENO); rol = arquetipo del MOB (ENTIDAD), independiente de zona]. ⊥ #86 SIEGA/fracción-vida [e.hp/e.maxHp DINÁMICO; rol = categórico ESTÁTICO del template]. ⊥ #85 CC [e.stun/e.slowT estado IMPUESTO; rol = identidad de spawn]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; rol = CAMPO arch DISTINTO, score NO rastrea ranged — enabler NO-ranged⇒2/#84 0, caster ranged⇒rol 0/#84 2, OPUESTOS]. ⊥ #76 VARIANTE [e.variant tipo de ENCUENTRO {stalker,bastion,glass} — modifica comportamiento/stats leyendo e.variant; rol lee ETPL[type].arch BASE ⇒ un 'stalker' orco sigue siendo arch brute⇒0]. ⊥ #74 AFIJO [e.affix modificador de spawn categórico; rol lee ETPL[type].arch BASE inmutable]. ⊥ #73 APEX [DISTANCIA geométrica a un jefe/campeón vivo; rol = arquetipo del mob rematado sin distancia ni blanco]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento], ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN DINÁMICO e.state windup/strike/shield — un caster puede estar ocioso (interrupt 0) o casteando (interrupt 2) con el MISMO arch; rol es la identidad ESTÁTICA, no la acción en curso], ⊥ #88 REMATE [DISTANCIA hero↔víctima], ⊥ #87 MANADA [clustering mob↔mob], ⊥ #78 FURIA [BOOLEANO de fase e.enraged], ⊥ #72 ESCASEZ [CONTEO crudo], ⊥ #69 LAST_STAND [CONTEO enganchados], ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE — el rol NO depende de cuántos golpes ni con qué ritmo caiga el mob], ⊥ velocidad [un summoner es lento (spd60) y un volatile veloz (spd152) pero AMBOS tienen rol propio ≠ rapidez], ⊥ backstab/facing [ángulo]. NO nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial.
export const ROLE_SURGE = {
  enabled: true,             // LIVE — EVO#93 (CAS-2553, 35º flag). Flip false→true tras CEO Gate 1/2 byte-verify + DARK QA Gate 2/2 CAS-2552 PASS 16/16 (2-cli 0-desync fp 15920977 terrHash 2105484439) + CEO Gate 2/2. Base master HEAD 257205e / prev served c2a7ab9cf1bb (#92 BULK_SURGE LIVE, reemplazado por este build).
  channel: "roleFind",       // canal FRESCO (recompensa de fichas de cabecilla por rematar a un mob de ALTO VALOR TÁCTICO — habilitador/pieza clave del pack) — NINGUNA de las 34 flags #59-#92 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind/bulkFind) está LLENA ⇒ fichas de cabecilla es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX roleWeight sobre los mobs VIVOS en radio (la pieza clave más valiosa rematable ahora). El GRANT REAL usa el rol propio de la víctima (sin cap de radio). CEO balance knob.
  weights: { enabler: 2, disruptor: 1 },   // PESO de un remate por la BANDA DE ROL del TIPO del mob: HABILITADOR de soporte (summoner/healer, force-multiplier dmg:0) pesa 2; DISRUPTOR especialista (warlock/volatile/punisher) pesa 1; peleador estándar (brute/charger/rusher/caster) ⇒ 0. CEO balance knobs.
  // TABLA de ROL → BANDA (data-driven, LUT explícita; arch NO listado ⇒ 'brawler' ⇒ peso 0). CEO puede reasignar cualquier arch a otra banda sin tocar sim.js.
  roleTier: {
    summoner: "enabler",     // nigromante backline: invoca refuerzos (summon), dmg:0 — force-multiplier del pack ⇒ enabler(2). "para la marea: mata al invocador".
    healer:   "enabler",     // médico de manada: cura al aliado más herido (heal), dmg:0 — force-multiplier puro ⇒ enabler(2). "enfócalo o el pack no cae".
    warlock:  "disruptor",   // brujo híbrido (demon/wendigo/wisp): castea a distancia + melee, amenaza de mecánica especial ⇒ disruptor(1).
    volatile: "disruptor",   // kamikaze (suicide-bomber): detona una AoE radial de blast al alcanzar al héroe ⇒ disruptor(1).
    punisher: "disruptor",   // castigador (revenant): combo-punisher con ventana de recuperación de castigo ⇒ disruptor(1).
    // brute/charger/rusher/caster (o sin arch) ⇒ NO listados ⇒ 'brawler' ⇒ peso 0 (peleador estándar de daño directo).
  },
  roleBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de cabecilla por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE ROL (score∈{0,1,2}). Mob de MAYOR valor táctico = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (peleador estándar) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado DISRUPTOR: brujo/kamikaze/castigador): +1 ficha de cabecilla por kill. "silenciar al especialista".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado HABILITADOR: invocador/médico): +2 fichas por kill. "rematar a la pieza clave". CEO balance knobs.
  ],
};

// CAS-2556: REMATE DE PRESA VELOZ (SWIFT_SURGE, EVO#94 DARK) — EJE VELOCIDAD DE MOVIMIENTO BASE del mob TYPE server-auth (la RAPIDEZ INTRÍNSECA de la criatura: una alimaña escurridiza que corretea — murciélago/kamikaze/lobo — vale más que un plúmbeo que se arrastra — golem/brujo backline/invocador estático) + canal FRESCO swiftFind (recompensa de fichas de acoso por rematar a una PRESA ESCURRIDIZA — la que cuesta acorralar porque huye rápido, no al plantón que ya estaba clavado). Camino al 36º flag (serializa tras #93 ROLE_SURGE LIVE&closed).
//  · DEDUP: CAS-2556 (⊥role) y CAS-2557 (⊥35) fueron DOS umbrellas gemelas EVO#94 (create-race, AMBAS asignadas a mí). CAS-2557 construyó WORTH_SURGE (xp-worth) — SUPERSEDIDO por este build (patch preservado en tools/_cas2557-worth-superseded.patch). Motivo del pivote a VELOCIDAD sobre XP-WORTH: xp-worth FALLA ⊥#72 — SCARCITY_EDGE (#72, LIVE enabled:true) recompensa esencia por kill = round(scarcityMul(zone)*tpl.xp), PROPORCIONAL a tpl.xp ⇒ una banda-por-xp sería CO-MONÓTONA con la esencia de #72 en la misma zona (a más xp más marcas Y más esencia) ⇒ NO ⊥#72; el writeup de WORTH lo OMITE (afirma que xp sólo alimenta gainXP/bounty/rested, pero #72 lo lee como magnitud de recompensa POR KILL). VELOCIDAD BASE no la lee NINGÚN seam de recompensa ⇒ eje limpio.
//  · PRE-FLIGHT GATE (recomendado = KILL-EFFORT / Nº de golpes para matar al mob) → FALLA (idéntico a #93 CAS-2551): NO existe un contador entero determinista de golpes-por-mob server-auth. El path de daño hero→enemy (hitEnemy sim.js) hace `e.hp-=dmg` y NO incrementa ningún `e.hits`/`e.timesHit`; spawnEnemy NO estampa contador de impactos. Y aún si se añadiera: nº-de-golpes-para-matar = e.maxHp / dañoPorGolpe-del-héroe ⇒ ENTRELAZADO con el DPS/tempo del héroe (frenesí +dmg/stack, combo/cadence#67 modulan el daño por golpe) ⇒ NO es propiedad INTRÍNSECA del mob y NO es ⊥ cadence#67/frenzy/combo ⇒ FALLA el gate de ortogonalidad ⇒ NO se fuerza (regla del issue).
//  · PRE-FLIGHT de los alternos SANCIONADOS → los 3 del board tienen defecto: (a) XP-WORTH / valor-de-recompensa base FALLA freshness — #72 ESCASEZ (LIVE) ya lee `tpl.xp` como MAGNITUD de recompensa por kill (scarcityForageEssence = round(scarcityMul(zone)*tpl.xp), config.js/sim.js) ⇒ una banda-por-xp sería CO-MONÓTONA con la esencia de #72 ⇒ NO ⊥#72; gold≈colineal con xp ⇒ misma contaminación. (b) DAÑO-TOTAL-INFLINGIDO por la víctima FALLA como INTRÍNSECO — requiere un acumulador `e.dmgDealt` NUEVO (damageHero no acumula src.threat) y es DINÁMICO acoplado a la defensa del héroe (bloqueo/esquiva/i-frames ⇒ 0 amenaza a un bruto perfectamente esquivado) ⇒ mismo defecto de acoplamiento hero-tempo que hundió KILL-EFFORT. (c) EDAD-DEL-MOB / tiempo-vivo FALLA determinismo INTRÍNSECO — spawnEnemy NO hornea timestamp/tick de spawn server-auth (`spawnT no horneado`, ya notado en #91/#93) y es acoplado al ORDEN de kill del héroe. ⇒ PIVOTE JUSTIFICADO al eje FRESCO ESTÁTICO-INTRÍNSECO más limpio: VELOCIDAD BASE.
//  · PRE-FLIGHT del eje VELOCIDAD BASE → PASA (el MÁS limpio disponible): `spd` es un ESCALAR ENTERO ESTÁTICO por template (config.js:290+; 56..158 en 27 tipos no-jefe), server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 35 flags #59-#93 lo lee como SCORE (`spd` sólo alimenta la CINEMÁTICA de movimiento en updateEnemies/moveEnt + la cadencia de gait de render — jamás recompensa de kill; los 27 `*Weight` seams del arco NO leen spd; ⊥#72 incluido — #72 lee tpl.xp NO spd). MÁS AÚN: las crux de #92 BULK y #93 ROLE citan EXPLÍCITAMENTE "⊥ velocidad" como el eje RESERVADO-e-INTOCADO ("un summoner lento spd60 vs volatile veloz spd152, ambos con rol propio ≠ rapidez") ⇒ #94 consume precisamente ese eje que los previos certificaron fresco. CLAVE ⊥#74/⊥#85/⊥zona/⊥champion: swiftWeight lee la VELOCIDAD BASE INMUTABLE `ETPL[e.type].spd` (la rapidez del TIPO), NO `e.spd` ni `e.tpl.spd` — el afijo 'Veloz'/'Acorazado' (A.spdMul 1.42/0.92, config.js:467/468), la escala de zona (z.spdMul 1.00..1.20, config.js:621+, aplicada en spawn a e.spd) y el frost-slow de CC (e.slowT/e.slow, #85) escalan el CLON/la entidad viva pero JAMÁS la fila base de ETPL ⇒ un magmabrute base spd56 con afijo 'Veloz' (×1.42=79) SIGUE swift0; un bat base spd158 con 'Acorazado' o congelado por CC SIGUE swift2 ⇒ velocidad-base DESACOPLADA de afijo/zona/CC por construcción.
//  · EJE server-auth ESTÁTICO: swiftWeight(e) = peso por la BANDA DE VELOCIDAD BASE del TIPO. v=swiftOf(e)=ETPL[e.type].spd (base inmutable). v≥hiSpd(120) ⇒ escurridiza (bat158/volatile152/rat132/wolf128) ⇒ swift(2); v≥midSpd(90) ⇒ ágil (mudlurker112/bandit106/revenant104) ⇒ brisk(1); v<midSpd (plúmbeo: casters/brutes/chargers/summoners/healers, spd 56..86) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como bulkWeight #92/roleWeight #93 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/velocidad-base es inmutable ⇒ señal FIEL). El SCORE del kill = swiftWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = swiftScore(hero)=MAX swiftWeight sobre los mobs VIVOS en radio (la presa más escurridiza rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_swiftPre`=swiftWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de velocidad-base≥midSpd (swiftWeight≥1 vía `_swiftPre`), el héroe cosecha fichas de acoso = swiftForage(hero, tpl, _swiftPre), banca a h.swiftBounty vía grantSwiftBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_swiftPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: swiftWeight en el kill = O(1) 1×/kill (1 lookup ETPL); swiftScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥35 (CRUX): eje VELOCIDAD DE MOVIMIENTO BASE ESTÁTICA del TIPO de mob (magnitud de rapidez intrínseca), NO rol/función ni tamaño/área/vida/conteo/geometría/estado/alcance/dirección/valor. ⊥ #93 ROLE [FUNCIÓN de IA arch (enabler/disruptor/brawler); velocidad = MAGNITUD de rapidez — wolf rusher(rol0) es swift2 pero summoner enabler(rol2, la pieza clave más valiosa) es swift0: DIAMÉTRICAMENTE OPUESTOS; volatile disruptor(rol1) swift2 vs revenant disruptor(rol1) swift1 MISMO rol banda distinta; el rol NO rastrea rapidez]. ⊥ #92 BULK [BANDA DE TAMAÑO físico ETPL[type].size; velocidad = rapidez — bat sz14(bulk0) es swift2 pero moose sz26(bulk2) es swift0 OPUESTOS; wolf swift2/bulk1 vs bat swift2/bulk0 mismo swift distinto bulk]. ⊥ WORTH/xp-worth (CAS-2557, supersedido) [BANDA DE VALOR ETPL[type].xp; velocidad ⊥ valor — wolf spd128(swift2) xp12(worth0) vs summoner spd60(swift0) xp34(worth1): el más veloz vale MENOS; revenant spd104(swift1) xp64(worth2) DISJUNTOS]. ⊥ #91 ZONE-TIER [dificultad del ÁREA donde muere (TERRENO); velocidad = propiedad de la ENTIDAD, indep. de zona; además z.spdMul escala e.spd VIVO pero swift lee BASE]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento (signo del producto punto m·u, unit-vector, magnitud-independiente, DINÁMICO por-frame); velocidad = MAGNITUD del stat base ESTÁTICO, dirección-independiente — un bat veloz cargando (heading2) o huyendo (heading0) tiene el MISMO swift2; un summoner lento cargando (heading2/swift0) vs wolf veloz cargando (heading2/swift2) MISMO heading distinto swift]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN DINÁMICO e.state; velocidad = stat de spawn inmutable]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering mob↔mob]. ⊥ #86 SIEGA/fracción-vida [e.hp/e.maxHp DINÁMICO; velocidad = escalar ESTÁTICO del template — bat a plena vida y bat casi-muerto MISMO swift, OPUESTA siega]. ⊥ #85 CC [e.stun/e.slowT estado IMPUESTO que RALENTIZA la entidad viva; velocidad lee ETPL[type].spd BASE ⇒ un bat congelado por frost SIGUE swift2]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; velocidad = CAMPO DISTINTO, score NO rastrea ranged — TODOS los ranged son lentos (swift0) pero swift0 MEZCLA melee (orc spd64) + ranged (mage spd62) ⇒ la banda NO determina alcance: orc melee swift0/#84 0 vs mage ranged swift0/#84 2 OPUESTOS en #84 con MISMO swift; bat melee swift2/#84 0 vs spearman ranged swift0/#84 2]. ⊥ #74 AFIJO [A.spdMul infla el CLON e.spd; swift lee ETPL[type].spd BASE — magmabrute 'Veloz' sigue swift0]. ⊥ #73 APEX [DISTANCIA a jefe/campeón]. ⊥ #78 FURIA [BOOLEANO e.enraged]. ⊥ #72 ESCASEZ [CONTEO de mobs en zona + recompensa ∝ tpl.xp; velocidad lee spd NO xp ni conteo]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing(ángulo).
export const SWIFT_SURGE = {
  enabled: true,             // LIVE — EVO#94 (CAS-2560, 36º flag). Flipped false→true tras CEO Gate 1/2 byte-verify + DARK QA Gate 2/2 (CAS-2558 16/16 + CAS-2559 15/15) + CEO Gate 2/2 byte-verify PASS. Base master HEAD 7cc64d7 / served d3a276a13dc0 (#93 ROLE_SURGE LIVE). enabled:false ⇒ TODOS los seams (kill grant + badge/VM) son código muerto ⇒ killEnemy/render byte-idénticos al HEAD.
  channel: "swiftFind",      // canal FRESCO (recompensa de fichas de acoso por rematar a una PRESA ESCURRIDIZA — la que huye rápido y cuesta acorralar) — NINGUNA de las 35 flags #59-#93 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind/bulkFind/roleFind) está LLENA ⇒ fichas de acoso es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX swiftWeight sobre los mobs VIVOS en radio (la presa más escurridiza rematable ahora). El GRANT REAL usa la velocidad-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiSpd: 120,                // umbral de VELOCIDAD BASE (px/s) para la banda escurridiza (swift, peso 2): bat158/volatile152/rat132/wolf128. CEO balance knob.
  midSpd: 90,                // umbral de VELOCIDAD BASE (px/s) para la banda ágil (brisk, peso 1): mudlurker112/bandit106/revenant104. <midSpd = plúmbeo ⇒ 0 (casters/brutes/chargers/summoners/healers, spd 56..86). CEO balance knob.
  weights: { swift: 2, brisk: 1 },   // PESO de un remate por la BANDA DE VELOCIDAD BASE del TIPO del mob: ESCURRIDIZA (spd≥hiSpd) pesa 2; ÁGIL (spd≥midSpd) pesa 1; plúmbeo (spd<midSpd) ⇒ 0. CEO balance knobs.
  swiftBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de acoso por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE VELOCIDAD (score∈{0,1,2}). Presa MÁS escurridiza = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (plúmbeo) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado ÁGIL: brisk): +1 ficha de acoso por kill. "acorralaste al escurridizo".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado ESCURRIDIZO: swift): +2 fichas por kill. "cazaste a la presa más veloz". CEO balance knobs.
  ],
};

// CAS-2563: REMATE DE MATÓN (MENACE_SURGE, EVO#95 DARK) — EJE POTENCIA DE DAÑO BASE del mob TYPE server-auth (la FUERZA OFENSIVA INTRÍNSECA de la criatura: cuán DURO golpea de fábrica — un pegador pesado como orco/golem/moose/charger que arranca vida de un golpe vale más que un alfeñique que apenas roza — rata/murciélago/lobo — o un habilitador de dmg:0 que no pega — invocador/sanador) + canal FRESCO menaceFind (recompensa de fichas de amenaza por rematar a un MATÓN — el que reparte castigo alto, no al que hace cosquillas). Camino al 37º flag (serializa tras #94 SWIFT_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado del issue = POTENCIA DE DAÑO / base-attack stat en ETPL) → PASA sin pivote. `dmg` es el campo CANÓNICO de daño base en CADA fila de ETPL (config.js:290+; 0..35 en 30+ tipos; rata6/murciélago7/lobo10/lancero13/esqueleto14/espectro15/mago16/bandido18/wendigo21/revenant22/volátil23/demonio23/orco24/charger25/alce26 + jefes golem30/dragón34/tirano35; invocador0/sanador0 por diseño de habilitador). ESCALAR ENTERO ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 36 flags #59-#94 lo lee como SCORE de recompensa: los únicos lectores de `.dmg` son (a) escalado de COMBATE — WORLD_TIER.dmgMul (config.js:815), ZONE_TIER[zone].dmgMul en applyZoneScale (config.js:621+), afijo A.dmgMul 'Feroz'/campeón C.dmgMul/élite (config.js:442/496, "scales the cloned tpl.dmg once") — todos escalan el CLON e.dmg/e.tpl.dmg, JAMÁS puntúan un kill; (b) tiering de GEAR del héroe `tier(DMG,u.dmg)` (sim.js:7412 — `u`=pieza de equipo, NO un mob); (c) un probe de debug que expone e.tpl.dmg (sim.js:11877, lectura, no score). Los 28 `*Weight`/forage seams del arco (goldFind..swiftFind) NO leen dmg. ⇒ POTENCIA DE DAÑO BASE es un eje de recompensa FRESCO.
//  · CLAVE ⊥#74/⊥champion/⊥zona: menaceWeight lee la POTENCIA DE DAÑO BASE INMUTABLE `ETPL[e.type].dmg` (el daño del TIPO), NO `e.dmg` ni `e.tpl.dmg` — el afijo 'Feroz' (A.dmgMul, config.js:496 ×1.6), la promoción a campeón/élite (C.dmgMul/elite.dmgMul ×1.5..2.3, config.js:442/708+) y la escala de zona (z.dmgMul 1.00..2.70, config.js:621+, aplicada en spawn a e.dmg vía applyZoneScale) escalan el CLON/la entidad viva pero JAMÁS la fila base de ETPL ⇒ un lobo base dmg10 con afijo 'Feroz' (×1.6=16) SIGUE menace0; un orco base dmg24 en prado sin escalar SIGUE menace2 ⇒ potencia-base DESACOPLADA de afijo/zona/campeón por construcción (mismo patrón probado que size #92/spd #94).
//  · EJE server-auth ESTÁTICO: menaceWeight(e) = peso por la BANDA DE POTENCIA DE DAÑO BASE del TIPO. d=menaceOf(e)=ETPL[e.type].dmg (base inmutable). d≥hiDmg(22) ⇒ matón/pegador pesado (revenant22/volátil23/demonio23/orco24/charger25/toadbrute25/alce26/ironback26 + jefes) ⇒ heavy(2); d≥midDmg(14) ⇒ pegador moderado (esqueleto14/espectro15/mago16/bandido18/mudlurker18/wendigo21) ⇒ moderate(1); d<midDmg (alfeñique: rata6/murciélago7/lobo10/lancero13, o habilitador dmg:0 invocador/sanador) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como bulkWeight #92/roleWeight #93/swiftWeight #94 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/daño-base es inmutable ⇒ señal FIEL). El SCORE del kill = menaceWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = menaceScore(hero)=MAX menaceWeight sobre los mobs VIVOS en radio (el matón más peligroso rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_menacePre`=menaceWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de daño-base≥midDmg (menaceWeight≥1 vía `_menacePre`), el héroe cosecha fichas de amenaza = menaceForage(hero, tpl, _menacePre), banca a h.menaceBounty vía grantMenaceBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_menacePre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: menaceWeight en el kill = O(1) 1×/kill (1 lookup ETPL); menaceScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥36 (CRUX): eje POTENCIA DE DAÑO BASE ESTÁTICA del TIPO de mob (magnitud de FUERZA OFENSIVA — cuán duro pega), NO rapidez/rol/tamaño/valor/área/vida/conteo/geometría/estado/alcance/dirección. ⊥ #94 SWIFT [VELOCIDAD DE MOVIMIENTO ETPL[type].spd (rapidez kinemática); daño = FUERZA ofensiva — murciélago spd158(swift2)/dmg7(menace0) VELOZ pero ALFEÑIQUE vs orco spd64(swift0)/dmg24(menace2) LENTO pero MATÓN: DIAMÉTRICAMENTE OPUESTOS; volátil swift2/menace2 vs revenant swift1/menace2 mismo menace distinto swift; rata/lobo veloces swift2 pero menace0]. ⊥ #93 ROLE [FUNCIÓN de IA arch (enabler/disruptor/brawler); daño = MAGNITUD de castigo — invocador/sanador enabler(rol2, pieza clave) tienen dmg:0 ⇒ menace0 DIAMÉTRICAMENTE OPUESTOS; orco brute(rol0) dmg24 menace2; volátil disruptor(rol1) menace2 vs demonio warlock(rol1) menace2 mismo rol; el rol NO rastrea potencia de daño]. ⊥ #92 BULK [BANDA DE TAMAÑO físico ETPL[type].size; daño ⊥ tamaño — volátil sz16(bulk0)/dmg23(menace2) MENUDO pero PEGADOR vs invocador sz20(bulk1)/dmg0(menace0) MEDIANO pero INOFENSIVO OPUESTOS; alce sz26 bulk2/dmg26 menace2 mismo]. ⊥ #94-adyacente WORTH/xp [BANDA DE VALOR ETPL[type].xp; daño ⊥ valor — volátil xp16(worth0)/dmg23(menace2) barato pero pegador; invocador xp34(worth1)/dmg0(menace0) valioso pero inofensivo DISJUNTOS]. ⊥ #91 ZONE-TIER [dificultad del ÁREA donde muere (TERRENO); daño = propiedad de la ENTIDAD, indep. de zona; además z.dmgMul escala e.dmg VIVO pero menace lee BASE]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento (signo m·u, unit-vector, magnitud-independiente, DINÁMICO por-frame); daño = MAGNITUD del stat base ESTÁTICO, dirección-independiente — un orco pegador cargando (heading2/menace2) o huyendo (heading0/menace2) MISMO menace2]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN DINÁMICO e.state; daño = stat de spawn inmutable — un mago casteando (interrupt2) o ocioso (interrupt0) MISMO menace1]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering mob↔mob]. ⊥ #86 SIEGA/fracción-vida [e.hp/e.maxHp DINÁMICO; daño = escalar ESTÁTICO del template — orco a plena vida y orco casi-muerto MISMO menace2]. ⊥ #85 CC [e.stun/e.slowT estado IMPUESTO; daño lee ETPL[type].dmg BASE ⇒ un orco aturdido SIGUE menace2]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; daño = CAMPO DISTINTO, score NO rastrea ranged — mago ranged dmg16 menace1/#84 2 vs orco melee dmg24 menace2/#84 0 DISJUNTOS; lancero ranged dmg13 menace0/#84 2]. ⊥ #74 AFIJO [A.dmgMul infla el CLON e.dmg; menace lee ETPL[type].dmg BASE — lobo 'Feroz' sigue menace0]. ⊥ #73 APEX [DISTANCIA a jefe/campeón]. ⊥ #78 FURIA [BOOLEANO e.enraged]. ⊥ #72 ESCASEZ [CONTEO de mobs en zona + recompensa ∝ tpl.xp; daño lee dmg NO xp ni conteo]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE — el daño del mob es su stat de ataque, NO cuánto pega el héroe]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing(ángulo).
export const MENACE_SURGE = {
  enabled: true,             // LIVE — EVO#95 (CAS-2567, 37º flag). Flipped false→true tras CEO Gate 1/2 byte-verify PASS + DARK QA CAS-2566 PASS 15/15 + CEO Gate 2/2 PASS @daf8f87. Base master HEAD daf8f87 / served 3d3e8be4811b (#94 SWIFT_SURGE LIVE).
  channel: "menaceFind",     // canal FRESCO (recompensa de fichas de amenaza por rematar a un MATÓN — el que pega DURO de fábrica) — NINGUNA de las 36 flags #59-#94 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind/bulkFind/roleFind/swiftFind) está LLENA ⇒ fichas de amenaza es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX menaceWeight sobre los mobs VIVOS en radio (el matón más peligroso rematable ahora). El GRANT REAL usa la potencia-de-daño-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiDmg: 22,                 // umbral de DAÑO BASE (dmg) para la banda matón/pegador pesado (heavy, peso 2): revenant22/volátil23/demonio23/orco24/charger25/toadbrute25/alce26/ironback26 + jefes. CEO balance knob.
  midDmg: 14,                // umbral de DAÑO BASE (dmg) para la banda moderada (moderate, peso 1): esqueleto14/espectro15/mago16/bandido18/mudlurker18/wendigo21. <midDmg = alfeñique ⇒ 0 (rata6/murciélago7/lobo10/lancero13, o habilitador dmg:0 invocador/sanador). CEO balance knob.
  weights: { heavy: 2, moderate: 1 },   // PESO de un remate por la BANDA DE DAÑO BASE del TIPO del mob: MATÓN (dmg≥hiDmg) pesa 2; MODERADO (dmg≥midDmg) pesa 1; alfeñique (dmg<midDmg) ⇒ 0. CEO balance knobs.
  menaceBountyCap: 2,        // SUB-CAP DURO PROPIO de las fichas de amenaza por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DAÑO (score∈{0,1,2}). Matón MÁS pegador = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (alfeñique) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado PEGADOR MODERADO): +1 ficha de amenaza por kill. "abatiste a un pegador".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado MATÓN/pegador pesado): +2 fichas por kill. "derribaste al matón más peligroso". CEO balance knobs.
  ],
};

// CAS-2569: REMATE DE COLOSO (TOUGH_SURGE, EVO#96 DARK) — EJE AGUANTE/DUREZA BASE del mob TYPE server-auth (la DURABILIDAD INTRÍNSECA de la criatura: cuánto castigo AGUANTA su TIPO de fábrica — un coloso como golem640/dragón820/alce150/charger140 que soaka una barbaridad vale más que un firme mago56/bandido60/esqueleto52 o un frágil rata20/murciélago16/lobo34/lancero42) + canal FRESCO toughFind (recompensa de fichas de aguante por rematar a un COLOSO — el que aguanta el castigo, no al de cristal). Camino al 38º flag (serializa tras #95 MENACE_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado del issue = AGUANTE/MAX-HP base en ETPL) → PASA sin pivote. `hp` es el campo CANÓNICO de durabilidad base en CADA fila de ETPL (config.js:290+; 16..1020 en 30+ tipos; murciélago16/rata20/volátil26/lobo34/lancero42 + firmes invocador46/sanador50/esqueleto52/mago56/bandido60 + orco96 + colosos ironback112/wendigo118/revenant120/magmabrute132/demonio135/charger140/toadbrute145/alce150 + jefes golem640/dragón820/bogtyrant940/calderatyrant1020). ESCALAR ENTERO ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 37 flags #59-#95 lo lee como SCORE de recompensa: el ÚNICO `*Weight` que toca vida es bloodWeight #86 SIEGA que lee la FRACCIÓN DINÁMICA `e.hp/e.maxHp` (un mob YA herido), NO la fila base estática `ETPL[type].hp`; los demás lectores de `.hp`/`e.tpl.hp` son (a) spawn/jefe/campeón init `e.hp=e.maxHp=e.tpl.hp`; (b) escala de campeón `base.hp*hpMul` sobre el CLON; (c) probes de debug — JAMÁS puntúan un kill por AGUANTE base. ⇒ AGUANTE/MAX-HP BASE es un eje de recompensa FRESCO.
//  · CLAVE ⊥#86/⊥#74/⊥champion/⊥zona: toughWeight lee el AGUANTE/MAX-HP BASE INMUTABLE `ETPL[e.type].hp` (la vida-máxima del TIPO), NO `e.hp` (vida VIVA/herida) ni `e.maxHp`/`e.tpl.hp` (el CLON escalado por zona z.hpMul / afijo A.hpMul / campeón C.hpMul). Un golem a plena vida y un golem al 5% comparten la MISMA fila base hp640 ⇒ tough2 los dos (⊥#86 que ve fracción 1.0⇒siege0 vs 0.05⇒siege2). Un lobo 'Feroz' con clon hp×afijo SIGUE tough0 (afijo escala el clon, jamás la fila base) ⇒ aguante-base DESACOPLADO de herida/afijo/zona/campeón por construcción (mismo patrón probado que dmg #95/size #92/spd #94).
//  · EJE server-auth ESTÁTICO: toughWeight(e) = peso por la BANDA DE AGUANTE/MAX-HP BASE del TIPO. hp=toughOf(e)=ETPL[e.type].hp (base inmutable). hp≥hiHp(110) ⇒ coloso/tanque (ironback112/wendigo118/revenant120/magmabrute132/demonio135/charger140/toadbrute145/alce150 + jefes) ⇒ tank(2); hp≥midHp(46) ⇒ firme (invocador46/sanador50/esqueleto52/mago56/bandido60/mudlurker64/orco96) ⇒ sturdy(1); hp<midHp (frágil: rata20/murciélago16/volátil26/lobo34/lancero42) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como menaceWeight #95/bulkWeight #92/roleWeight #93/swiftWeight #94 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/vida-base es inmutable ⇒ señal FIEL). El SCORE del kill = toughWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = toughScore(hero)=MAX toughWeight sobre los mobs VIVOS en radio (el coloso más duro rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_toughPre`=toughWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de aguante-base≥midHp (toughWeight≥1 vía `_toughPre`), el héroe cosecha fichas de aguante = toughForage(hero, tpl, _toughPre), banca a h.toughBounty vía grantToughBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_toughPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: toughWeight en el kill = O(1) 1×/kill (1 lookup ETPL); toughScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥37 (CRUX): eje AGUANTE/MAX-HP BASE ESTÁTICO del TIPO de mob (magnitud de DURABILIDAD — cuánto castigo soaka), NO daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado/alcance/dirección. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp (mob herido); aguante = MAX-HP BASE ESTÁTICO — golem plena-vida tough2/siege0 vs rata al 5% tough0/siege2 DISJUNTOS; el eje MÁS afín, decoupled por base-vs-fracción]. ⊥ #95 MENACE [DAÑO BASE ETPL[type].dmg (fuerza ofensiva); aguante = DURABILIDAD defensiva — volátil hp26(tough0)/dmg23(menace2) CRISTAL pero PEGADOR vs orco hp96(tough1)/dmg24(menace2) FIRME y pegador vs wendigo hp118(tough2)/dmg21(menace1) COLOSO moderado: orco tough1/menace2 y wendigo tough2/menace1 ORDEN OPUESTO; invocador hp46(tough1)/dmg0(menace0) firme pero INOFENSIVO]. ⊥ #92 BULK [TAMAÑO físico ETPL[type].size; aguante ⊥ tamaño — revenant sz20(bulk1)/hp120(tough2) MENUDO pero DURO vs emberkin sz24(bulk2)/hp58(tough1) GRANDE pero BLANDO OPUESTOS]. ⊥ #94 SPEED [VELOCIDAD ETPL[type].spd; golem spd46(swift0)/hp640(tough2) LENTO-TANQUE vs murciélago spd158(swift2)/hp16(tough0) VELOZ-CRISTAL OPUESTOS; revenant swift1/tough2]. ⊥ #93 ROLE [arch FUNCIÓN de IA; invocador enabler(rol2)/hp46 tough1 vs orco brute(rol0)/hp96 tough1 MISMO tough distinto rol]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA/TERRENO; z.hpMul escala e.maxHp VIVO pero tough lee BASE]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering]. ⊥ #85 CC [e.stun/e.slowT IMPUESTO]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged]. ⊥ #74 AFIJO [A.hpMul infla el CLON e.maxHp; tough lee ETPL[type].hp BASE — lobo 'Feroz' sigue tough0]. ⊥ #73 APEX [DISTANCIA a jefe/campeón]. ⊥ #78 FURIA [BOOLEANO e.enraged]. ⊥ #72 ESCASEZ [CONTEO de mobs + recompensa ∝ tpl.xp]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const TOUGH_SURGE = {
  enabled: true,             // LIVE — EVO#96 (CAS-2571, 38º flag). Flipped false→true tras CEO Gate 1/2 ✅ + DARK QA CAS-2570 15/15 ✅ + CEO Gate 2/2 byte-verify ✅. Base master HEAD e7b551d / served advances off 81c189900aa9 (#95 MENACE_SURGE LIVE).
  channel: "toughFind",      // canal FRESCO (recompensa de fichas de aguante por rematar a un COLOSO — el que aguanta el castigo de fábrica) — NINGUNA de las 37 flags #59-#95 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind/bulkFind/roleFind/swiftFind/menaceFind) está LLENA ⇒ fichas de aguante es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX toughWeight sobre los mobs VIVOS en radio (el coloso más duro rematable ahora). El GRANT REAL usa el aguante-base propio de la víctima (sin cap de radio). CEO balance knob.
  hiHp: 110,                 // umbral de AGUANTE/MAX-HP BASE (hp) para la banda coloso/tanque (tank, peso 2): ironback112/wendigo118/revenant120/magmabrute132/demonio135/charger140/toadbrute145/alce150 + jefes golem640/dragón820/bogtyrant940/calderatyrant1020. CEO balance knob.
  midHp: 46,                 // umbral de AGUANTE/MAX-HP BASE (hp) para la banda firme (sturdy, peso 1): invocador46/sanador50/esqueleto52/quillback52/thornspitter52/mago56/ashwraith56/emberkin58/bandido60/mudlurker64/orco96. <midHp = frágil ⇒ 0 (rata20/murciélago16/volátil26/lobo34/lancero42). CEO balance knob.
  weights: { tank: 2, sturdy: 1 },   // PESO de un remate por la BANDA DE AGUANTE BASE del TIPO del mob: COLOSO (hp≥hiHp) pesa 2; FIRME (hp≥midHp) pesa 1; frágil (hp<midHp) ⇒ 0. CEO balance knobs.
  toughBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de aguante por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE AGUANTE (score∈{0,1,2}). Coloso MÁS duro = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (frágil) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado FIRME): +1 ficha de aguante por kill. "derribaste a un firme".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado COLOSO/tanque): +2 fichas por kill. "derribaste al coloso más duro". CEO balance knobs.
  ],
};

// CAS-2573: REMATE DE VIGÍA (SENTINEL_SURGE, EVO#97 DARK) — EJE VIGILANCIA/RADIO DE PERCEPCIÓN BASE del mob TYPE server-auth (la ALERTA INTRÍNSECA de la criatura: cuán LEJOS te DETECTA su TIPO de fábrica — un centinela como mago340/golem360/dragón380/bogtyrant380 que te fija desde muy lejos vale más que un vigilante moderado bandido250/alce260/toadbrute290 o un despistado rata170/orco220/murciélago220 que apenas te ve venir) + canal FRESCO sentinelFind (recompensa de fichas de vigilia por rematar a un VIGÍA — el que te detecta de lejos, no al despistado). Camino al 39º flag (serializa tras #96 TOUGH_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado del issue = eje FRESCO ⊥base-toughness) → PASA sin pivote. `aggro` es un campo CANÓNICO de PERCEPCIÓN base en CADA fila de ETPL (config.js:290+; 0..380 en 30+ tipos; rata170/orco220/murciélago220/ironback220/magmabrute220/quillback230/esqueleto230 despistados + moderados wolf240/bandido250/mudlurker250/alce260/toadbrute290/spearman300/charger300/volatile300/revenant300 + vigías mago340/wraith320/summoner330/healer330/demon330/wendigo330/wisp330/ashwraith340/thornspitter320/emberkin330/golem360/dragón380/bogtyrant380/calderatyrant380). ESCALAR ENTERO ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 38 flags #59-#96 lo lee como SCORE de recompensa: los ÚNICOS lectores de `.aggro` son (a) la MÁQUINA DE ESTADOS de la IA (adquisición de target: `d<aggro` en sim.js:8340+, chase/idle) — comportamiento, JAMÁS recompensa de kill; (b) el subsistema SHADOW_STALK #2426 que reduce el radio EFECTIVO por LOS (stealthStalkAggro) — un canal DISTINTO (detectRadius/sigilo), no puntúa un kill por vigilancia base; (c) bonfireUnsafe/lastStandCount que sólo preguntan "¿está en aggro?" (booleano de estado), no la magnitud base. ⇒ VIGILANCIA/PERCEPCIÓN BASE es un eje de recompensa FRESCO.
//  · CLAVE ⊥override/⊥#74/⊥champion/⊥hostil: sentinelWeight lee la PERCEPCIÓN BASE INMUTABLE `ETPL[e.type].aggro` (el radio de detección del TIPO), NO `e.tpl.aggro` (el CLON). CRUX del desacople: `makeHostile(e)` (sim.js:6102) SOBREESCRIBE el clon a `aggro:300`, la promoción a campeón (sim.js:6491) a `Math.max(base.aggro,320)` y a jefe (sim.js:935/1112/6469) a `Math.max(base.aggro,340)`, y el espíritu-clon (sim.js:8760) a `aggro:0` — TODOS mutan el CLON `e.tpl.aggro`, JAMÁS la fila base de ETPL. Un `adv` neutral (aggro:0 base ⇒ sentinel0) hecho hostil con clon aggro300 SIGUE sentinel0; un orco campeón con clon aggro≥320 SIGUE sentinel0 (base 220) ⇒ vigilancia-base DESACOPLADA de hostilidad/campeón/jefe por construcción (mismo patrón probado que hp #96/dmg #95/size #92/spd #94, que leen la fila base no el clon). Y applyZoneScale (sim.js:2298) escala hp/dmg/spd/xp pero NUNCA aggro ⇒ vigilancia INDEPENDIENTE de zona (⊥#91, como tamaño #92).
//  · EJE server-auth ESTÁTICO: sentinelWeight(e) = peso por la BANDA DE PERCEPCIÓN/AGGRO BASE del TIPO. aggro=sentinelOf(e)=ETPL[e.type].aggro (base inmutable). aggro≥hiAggro(320) ⇒ vigía/centinela (mago/wraith/summoner/healer/demon/wendigo/wisp/ashwraith/thornspitter/emberkin + jefes golem/dragón/bogtyrant/calderatyrant) ⇒ vigilant(2); aggro≥midAggro(250) ⇒ vigilante moderado (bandit/mudlurker/alce/toadbrute/spearman/charger/volatile/revenant) ⇒ wary(1); aggro<midAggro (despistado: rata/orco/murciélago/ironback/magmabrute/quillback/esqueleto/lobo/adv-neutral) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como toughWeight #96/menaceWeight #95/bulkWeight #92/roleWeight #93/swiftWeight #94 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/percepción-base es inmutable ⇒ señal FIEL). El SCORE del kill = sentinelWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = sentinelScore(hero)=MAX sentinelWeight sobre los mobs VIVOS en radio (el vigía más alerta rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_sentinelPre`=sentinelWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de percepción-base≥midAggro (sentinelWeight≥1 vía `_sentinelPre`), el héroe cosecha fichas de vigilia = sentinelForage(hero, tpl, _sentinelPre), banca a h.sentinelBounty vía grantSentinelBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_sentinelPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: sentinelWeight en el kill = O(1) 1×/kill (1 lookup ETPL); sentinelScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥38 (CRUX): eje VIGILANCIA/RADIO-DE-PERCEPCIÓN BASE ESTÁTICO del TIPO de mob (cuán lejos te DETECTA de fábrica — su ALERTA/vigilia), NO aguante/daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado/alcance/dirección. ⊥ #96 TOUGH [AGUANTE/MAX-HP BASE ETPL[type].hp (durabilidad); percepción ⊥ dureza — ironback hp112(tough2 COLOSO)/aggro220(sentinel0 DESPISTADO) vs mago hp56(tough1)/aggro340(sentinel2 VIGÍA) ORDEN OPUESTO; magmabrute hp132(tough2)/aggro220(sentinel0) TANQUE-CIEGO vs wisp hp46(tough1)/aggro330(sentinel2) FRÁGIL-ALERTA DISJUNTOS; el eje base #96 más reciente, decoupled dureza-vs-alerta]. ⊥ #95 MENACE [DAÑO BASE ETPL[type].dmg (fuerza ofensiva); invocador dmg0(menace0)/aggro330(sentinel2) INOFENSIVO pero VIGILANTE vs orco dmg24(menace2)/aggro220(sentinel0) PEGADOR pero DESPISTADO ORDEN OPUESTO]. ⊥ #94 SPEED [VELOCIDAD ETPL[type].spd (rapidez kinemática); murciélago spd158(swift2)/aggro220(sentinel0) VELOZ pero CIEGO vs mago spd62(swift0)/aggro340(sentinel2) LENTO pero VIGÍA DIAMÉTRICAMENTE OPUESTOS — el crux reservado en CAS-2564]. ⊥ #92 BULK [TAMAÑO físico ETPL[type].size; wisp sz18(bulk1)/aggro330(sentinel2) MENOR-BULK pero VIGILANTE vs ironback sz28(bulk2)/aggro220(sentinel0) GRANDE pero DESPISTADO OPUESTOS]. ⊥ #93 ROLE [arch FUNCIÓN de IA; mago caster(rol0)/aggro340(sentinel2) vs summoner enabler(rol2)/aggro330(sentinel2) MISMO sentinel distinto rol; orco brute(rol0)/aggro220(sentinel0) mismo rol distinto sentinel]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; percepción ⊥ alcance — golem MELEE(skirmish0)/aggro360(sentinel2) VIGÍA-MELEE vs lancero RANGED(skirmish>0)/aggro300(sentinel1) — el melee puntúa MÁS que el a-distancia, REVIERTE la correlación]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA/TERRENO; applyZoneScale escala hp/dmg/spd/xp pero NUNCA aggro ⇒ percepción INDEPENDIENTE de zona]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp]. ⊥ #85 CC [e.stun/e.slowT IMPUESTO]. ⊥ #74 AFIJO/⊥hostil/⊥campeón [makeHostile/champion/boss SOBREESCRIBEN el CLON e.tpl.aggro (300/≥320/≥340); sentinel lee ETPL[type].aggro BASE — un adv hostil o un orco campeón SIGUE su banda base]. ⊥ #73 APEX [DISTANCIA a jefe/campeón]. ⊥ #78 FURIA [BOOLEANO e.enraged]. ⊥ #72 ESCASEZ [CONTEO de mobs + recompensa ∝ tpl.xp]. ⊥ #2426 SHADOW_STALK [detectRadius = radio EFECTIVO reducido por LOS/sigilo DINÁMICO; sentinel = radio BASE ESTÁTICO del tipo, canal DISTINTO]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const SENTINEL_SURGE = {
  enabled: true,             // LIVE — EVO#97 (CAS-2577, 39º flag). Flip false→true (Remate de Vigía) tras CEO Gate 1/2 @4ee90af + DARK QA CAS-2576 PASS 15/15 + CEO Gate 2/2 @0106bbd. Base master HEAD post-#96 / served ec06c1f3587b (#96 TOUGH_SURGE LIVE) → avanza a #97.
  channel: "sentinelFind",   // canal FRESCO (recompensa de fichas de vigilia por rematar a un VIGÍA — el que te detecta de lejos de fábrica) — NINGUNA de las 38 flags #59-#96 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/flaskPotency/gemFind/socketFind/healPotency/trophyFind/salvageFind/boneFind/frayFind/maelstromFind/blightFind/skirmishFind/controlFind/bloodFind/packFind/reachFind/interruptFind/headingFind/tierFind/bulkFind/roleFind/swiftFind/menaceFind/toughFind) está LLENA ⇒ fichas de vigilia es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX sentinelWeight sobre los mobs VIVOS en radio (el vigía más alerta rematable ahora). El GRANT REAL usa la percepción-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiAggro: 320,              // umbral de PERCEPCIÓN/AGGRO BASE (aggro) para la banda vigía/centinela (vigilant, peso 2): wraith320/thornspitter320/summoner330/healer330/demon330/wendigo330/wisp330/emberkin330/mago340/ashwraith340 + jefes golem360/dragón380/bogtyrant380/calderatyrant380. CEO balance knob.
  midAggro: 250,             // umbral de PERCEPCIÓN/AGGRO BASE (aggro) para la banda vigilante moderado (wary, peso 1): bandido250/mudlurker250/alce260/toadbrute290/spearman300/charger300/volatile300/revenant300. <midAggro = despistado ⇒ 0 (rata170/orco220/murciélago220/ironback220/magmabrute220/quillback230/esqueleto230/lobo240, adv-neutral0). CEO balance knob.
  weights: { vigilant: 2, wary: 1 },   // PESO de un remate por la BANDA DE PERCEPCIÓN BASE del TIPO del mob: VIGÍA (aggro≥hiAggro) pesa 2; VIGILANTE MODERADO (aggro≥midAggro) pesa 1; despistado (aggro<midAggro) ⇒ 0. CEO balance knobs.
  sentinelBountyCap: 2,      // SUB-CAP DURO PROPIO de las fichas de vigilia por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE VIGILANCIA (score∈{0,1,2}). Vigía MÁS alerta = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (despistado) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado VIGILANTE MODERADO): +1 ficha de vigilia por kill. "silenciaste a un vigilante".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado VIGÍA/centinela): +2 fichas por kill. "cegaste al vigía más alerta". CEO balance knobs.
  ],
};

// CAS-2580: REMATE DE ARIETE (RAM_SURGE, EVO#98 DARK) — EJE FUERZA DE IMPACTO/KNOCKBACK BASE del mob TYPE server-auth (la POTENCIA DE EMPUJE INTRÍNSECA de la criatura: cuánto te ARROLLA su TIPO de fábrica al golpear — un ariete/demoledor como charger235/toadbrute225/magmabrute210/moose200/ironback200 que te lanza por los aires vale más que un pegador firme rat110/bandit110/demon110/skeleton120/revenant120/quillback120/mudlurker120/wolf140/orco150 o un golpe leve summoner40/healer50/wisp50/mage60/wraith60/golem60/volatile60/spearman80/dragón85/bogtyrant88/bat90/calderatyrant90/wendigo95 que apenas te mueve) + canal FRESCO ramFind (recompensa de fichas de ariete por rematar a un DEMOLEDOR — el que reparte empellones que te descolocan, no al que roza sin empujar). Camino al 40º flag (serializa tras #97 SENTINEL_SURGE LIVE&closed).
//  · PRE-FLIGHT GATE (recomendado del issue = eje FRESCO ⊥base-perception) → PASA sin pivote. `knock` es un campo CANÓNICO de FUERZA DE KNOCKBACK base en CADA fila de ETPL (config.js:290+; 40..235 en 31 tipos). ESCALAR ENTERO ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 39 flags #59-#97 lo lee como SCORE de recompensa: los ÚNICOS lectores de `.knock` son la FÍSICA de knockback (aplicar empuje al golpear: `e.knockX+=cos*e.tpl.knock*mul` en sim.js:6071/6914/7873 — magnitud de EMPUJE, JAMÁS recompensa de kill) — ni un solo `*Weight`/seam de las 39 flags previas lo puntúa. ⇒ FUERZA DE IMPACTO/KNOCKBACK BASE es un eje de recompensa FRESCO. AÚN más limpio que aggro #97 (que tenía lectores de IA state-machine): knock sólo tiene un lector de física.
//  · CLAVE ⊥override/⊥#74/⊥champion/⊥hostil: ramWeight lee la FUERZA DE IMPACTO BASE INMUTABLE `ETPL[e.type].knock` (el knockback del TIPO), NO `e.tpl.knock` (el CLON). CRUX del desacople: la promoción a campeón/élite (AMBUSH.elite, sim.js:8677) SOBREESCRIBE el clon a `knock:Math.round(base.knock*E.knockMul)` y el espíritu/spawn escalado a `Math.max(60,round(base.knock*0.6))` (sim.js:6533) — mutan el CLON `e.tpl.knock`, JAMÁS la fila base de ETPL. Un orco campeón con clon knock escalado SIGUE ram1 (base 150); un mob espíritu con clon knock reducido SIGUE su banda base. Y applyZoneScale (sim.js:2298) escala hp/dmg/spd/xp pero NUNCA knock ⇒ impacto INDEPENDIENTE de zona (⊥#91, como aggro #97 y tamaño #92).
//  · EJE server-auth ESTÁTICO: ramWeight(e) = peso por la BANDA DE KNOCKBACK BASE del TIPO. knock=ramOf(e)=ETPL[e.type].knock (base inmutable). knock≥hiKnock(200) ⇒ ariete/demoledor (moose/ironback/magmabrute/toadbrute/charger) ⇒ battering(2); knock≥midKnock(110) ⇒ pegador firme (rat/bandit/demon/skeleton/revenant/adv/quillback/mudlurker/wolf/orco) ⇒ forceful(1); knock<midKnock (leve: casters/bosses/flyers/summoner/healer) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como sentinelWeight #97/toughWeight #96/menaceWeight #95/bulkWeight #92/roleWeight #93/swiftWeight #94 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/impacto-base es inmutable ⇒ señal FIEL). El SCORE del kill = ramWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = ramScore(hero)=MAX ramWeight sobre los mobs VIVOS en radio (el demoledor más contundente rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_ramPre`=ramWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de knockback-base≥midKnock (ramWeight≥1 vía `_ramPre`), el héroe cosecha fichas de ariete = ramForage(hero, tpl, _ramPre), banca a h.ramBounty vía grantRamBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_ramPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: ramWeight en el kill = O(1) 1×/kill (1 lookup ETPL); ramScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥39 (CRUX): eje FUERZA DE IMPACTO/KNOCKBACK BASE ESTÁTICO del TIPO de mob (cuánto te ARROLLA de fábrica — su empuje físico), NO vigilancia/aguante/daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado/alcance/dirección. ⊥ #97 SENTINEL [VIGILANCIA/AGGRO BASE ETPL[type].aggro (percepción); impacto ⊥ alerta — golem aggro360(sentinel2 VIGÍA)/knock60(ram0 LEVE) vs charger aggro300(sentinel1)/knock235(ram2 ARIETE) ORDEN OPUESTO; mago aggro340(sentinel2)/knock60(ram0) VIGÍA-pero-LEVE vs moose aggro260(sentinel1)/knock200(ram2) DISJUNTOS; el eje base #97 más reciente, decoupled alerta-vs-impacto]. ⊥ #96 TOUGH [AGUANTE/MAX-HP BASE ETPL[type].hp; golem hp640(tough2 COLOSO)/knock60(ram0) vs rat hp20(tough0)/knock110(ram1) FRÁGIL-pero-FIRME ORDEN OPUESTO; bogtyrant hp940(tough2)/knock88(ram0) TANQUE-BLANDO-DE-EMPUJE]. ⊥ #95 MENACE [DAÑO BASE ETPL[type].dmg; golem dmg30(menace2)/knock60(ram0) PEGADOR-DURO-pero-LEVE-EMPUJE vs charger dmg25(menace2)/knock235(ram2); calderatyrant dmg38(menace2)/knock90(ram0) DISJUNTOS — daño ⊥ empuje]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; murciélago spd158(swift2)/knock90(ram0) VELOZ-pero-LEVE vs charger spd74(swift0)/knock235(ram2) LENTO-pero-ARIETE DIAMÉTRICAMENTE OPUESTOS; volatile spd152(swift2)/knock60(ram0)]. ⊥ #92 BULK [TAMAÑO físico ETPL[type].size (hiSize24/midSize18); golem sz36(bulk2)/knock60(ram0) MOLE-GRANDE-BLANDA vs rata sz15(bulk0)/knock110(ram1) ALIMAÑA-MENUDA-FIRME DIAMÉTRICAMENTE OPUESTOS; dragón sz50(bulk2)/knock85(ram0) MOLE-COLOSAL-BLANDA-DE-EMPUJE — tamaño ⊥ knockback]. ⊥ #93 ROLE [arch FUNCIÓN de IA; summoner/healer enabler(rol2)/knock40,50(ram0) CABECILLA-pero-LEVE vs charger charger(rol0)/knock235(ram2) — el eje-rol PICA los enablers de bajo knock, el eje-ariete los brutes/chargers, selección OPUESTA]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; lancero RANGED(skirmish>0)/knock80(ram0) A-DISTANCIA-pero-LEVE vs moose MELEE(skirmish0)/knock200(ram2) OPUESTO]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale escala hp/dmg/spd/xp pero NUNCA knock ⇒ impacto INDEPENDIENTE de zona]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA del mob — heading; ram = FUERZA física estática, no rumbo]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp]. ⊥ #85 CC [e.stun/e.slowT IMPUESTO]. ⊥ #74 AFIJO/⊥hostil/⊥campeón [AMBUSH.elite/spawn escalado SOBREESCRIBEN el CLON e.tpl.knock (×knockMul); ram lee ETPL[type].knock BASE — un orco campeón SIGUE ram1 (base150)]. ⊥ #73 APEX [DISTANCIA a jefe]. ⊥ #78 FURIA [BOOLEANO e.enraged]. ⊥ #72 ESCASEZ [CONTEO de mobs + recompensa ∝ tpl.xp]. ⊥ #2426 SHADOW_STALK [detectRadius DINÁMICO por LOS]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const RAM_SURGE = {
  enabled: true,             // LIVE — EVO#98 (CAS-2582, 40º flag). Flip false→true (Remate de Ariete) tras CEO Gate 1/2 @d8d5d0b + DARK QA CAS-2581 PASS 15/15 + CEO Gate 2/2 @ddfd784. Base master HEAD post-#97 / served 1504785ba734 (#97 SENTINEL_SURGE LIVE) → avanza a #98.
  channel: "ramFind",        // canal FRESCO (recompensa de fichas de ariete por rematar a un DEMOLEDOR — el que te ARROLLA de fábrica) — NINGUNA de las 39 flags #59-#97 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/…/menaceFind/toughFind/sentinelFind) está LLENA ⇒ fichas de ariete es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX ramWeight sobre los mobs VIVOS en radio (el demoledor más contundente rematable ahora). El GRANT REAL usa la fuerza-de-impacto-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiKnock: 200,              // umbral de KNOCKBACK BASE (knock) para la banda ariete/demoledor (battering, peso 2): moose200/ironback200/magmabrute210/toadbrute225/charger235. CEO balance knob.
  midKnock: 110,             // umbral de KNOCKBACK BASE (knock) para la banda pegador firme (forceful, peso 1): rat110/bandit110/demon110/skeleton120/revenant120/adv120/quillback120/mudlurker120/wolf140/orco150. <midKnock = leve ⇒ 0 (summoner40/healer50/wisp50/thornspitter55/emberkin58/mage60/wraith60/golem60/volatile60/ashwraith60/spearman80/dragón85/bogtyrant88/bat90/calderatyrant90/wendigo95). CEO balance knob.
  weights: { battering: 2, forceful: 1 },   // PESO de un remate por la BANDA DE KNOCKBACK BASE del TIPO del mob: ARIETE (knock≥hiKnock) pesa 2; PEGADOR FIRME (knock≥midKnock) pesa 1; leve (knock<midKnock) ⇒ 0. CEO balance knobs.
  ramBountyCap: 2,           // SUB-CAP DURO PROPIO de las fichas de ariete por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE ARIETE (score∈{0,1,2}). Demoledor MÁS contundente = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (leve) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado PEGADOR FIRME): +1 ficha de ariete por kill. "descolocaste a un pegador".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado ARIETE/demoledor): +2 fichas por kill. "abatiste al ariete más contundente". CEO balance knobs.
  ],
};

// CAS-2585: REMATE DE PRESAGIO (WINDUP_SURGE, EVO#99 DARK) — EJE TIEMPO DE PRESAGIO / WIND-UP BASE del mob TYPE server-auth (la CADENCIA DE ANTICIPACIÓN INTRÍNSECA de la criatura: cuánto TELEGRAFÍA su TIPO de fábrica ANTES de golpear — un pegador ponderoso muy telegrafiado como golem0.95/summoner0.95/calderatyrant0.95/bogtyrant0.94/dragón0.92/mage0.9/ashwraith0.9/magmabrute0.88/emberkin0.88/moose0.88/ironback0.86/wraith0.85/wendigo0.85/wisp0.85/thornspitter0.85 que se arma con un aviso LARGO y legible vale más que un golpe medido revenant0.62/charger0.66/toadbrute0.68/spearman0.7/volatile0.7/orco0.82/healer0.82/demon0.82 o un jab SÚBITO bat0.28/rat0.35/wolf0.42/mudlurker0.48/bandit0.5/adv0.5/skeleton0.6/quillback0.6 que apenas presagia) + canal FRESCO windFind (recompensa de fichas de presagio por rematar a un TELEGRAFIADO — el que te avisa con un amago largo que aprendiste a leer y castigar, no al que te sorprende sin aviso). Camino al 41º flag (serializa tras #98 RAM_SURGE LIVE&served 0a45234850cd).
//  · PRE-FLIGHT GATE (recomendado del issue = WINDUP_SURGE ETPL[type].windup) → PASA sin pivote. `windup` es un campo CANÓNICO de TIEMPO DE PRESAGIO base (segundos del amago) en CADA fila de ETPL (config.js:290+; 0.28..0.95 en 31 tipos). ESCALAR DECIMAL ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 40 flags #59-#98 lo lee como SCORE de recompensa: los ÚNICOS lectores de `.windup` son (a) la MÁQUINA DE ESTADOS de la IA (updateEnemies arma `e.st=tpl.windup` y decrementa a paso-fijo — DURACIÓN del estado, comportamiento) y (b) el render del TELL (dibuja el amago durante el estado windup) — NI UN SOLO `*Weight`/seam de recompensa de las 40 flags previas lo puntúa. CRUX ⊥#89 INTERRUPT: #89 puntúa `e.state` DINÁMICO (¿está EJECUTANDO una acción AHORA? categoría windup/strike/shield que cambia tick-a-tick), NO `ETPL[type].windup` (cuánto DURA el tell del TIPO — constante inmutable). Un bat (windup0.28, wind0 SÚBITO) sorprendido mid-strike tiene interrupt1/wind0; un golem (windup0.95, wind2 PONDEROSO) ocioso tiene interrupt0/wind2 — DISJUNTOS, NO re-map. ⇒ TIEMPO DE PRESAGIO/WIND-UP BASE es un eje de recompensa FRESCO.
//  · CLAVE ⊥override/⊥#74/⊥champion/⊥élite: windWeight lee el TIEMPO DE PRESAGIO BASE INMUTABLE `ETPL[e.type].windup` (el amago del TIPO), NO `e.tpl.windup` (el CLON). Si algún spawn escalara el clon windup (élite/campeón), windWeight IGNORA el clon y lee la fila base ⇒ un orco campeón SIGUE wind1 (base 0.82). Y applyZoneScale (sim.js:2298) escala hp/dmg/spd/xp pero NUNCA windup ⇒ presagio INDEPENDIENTE de zona (⊥#91, como knock #98 y aggro #97).
//  · EJE server-auth ESTÁTICO: windWeight(e) = peso por la BANDA DE WIND-UP BASE del TIPO. windup=windOf(e)=ETPL[e.type].windup (base inmutable). windup≥hiWind(0.85) ⇒ ponderoso/telegrafiado largo (golem/summoner/calderatyrant/bogtyrant/dragón/mage/ashwraith/magmabrute/emberkin/moose/ironback/wraith/wendigo/wisp/thornspitter) ⇒ deliberate(2); windup≥midWind(0.62) ⇒ medido (revenant/charger/toadbrute/spearman/volatile/orco/healer/demon) ⇒ measured(1); windup<midWind (súbito: bat/rat/wolf/mudlurker/bandit/adv/skeleton/quillback) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como ramWeight #98/sentinelWeight #97/toughWeight #96/menaceWeight #95/swiftWeight #94/roleWeight #93/bulkWeight #92 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/wind-up-base es inmutable ⇒ señal FIEL). El SCORE del kill = windWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = windScore(hero)=MAX windWeight sobre los mobs VIVOS en radio (el telegrafiado más ponderoso rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_windPre`=windWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de wind-up-base≥midWind (windWeight≥1 vía `_windPre`), el héroe cosecha fichas de presagio = windForage(hero, tpl, _windPre), banca a h.windBounty vía grantWindBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_windPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: windWeight en el kill = O(1) 1×/kill (1 lookup ETPL); windScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥40 (CRUX): eje TIEMPO DE PRESAGIO/WIND-UP BASE ESTÁTICO del TIPO de mob (cuánto TELEGRAFÍA de fábrica antes de golpear — su cadencia de amago), NO impacto/vigilancia/aguante/daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado-dinámico/alcance/dirección/recuperación. ⊥ #98 RAM [FUERZA DE IMPACTO/KNOCKBACK BASE ETPL[type].knock; presagio ⊥ empuje — golem knock60(ram0 LEVE)/windup0.95(wind2 PONDEROSO) vs charger knock235(ram2 ARIETE)/windup0.66(wind1) ORDEN OPUESTO; summoner knock40(ram0)/windup0.95(wind2) LEVE-pero-LENTÍSIMO-AMAGO; el eje base #98 más reciente, decoupled empuje-vs-amago]. ⊥ #97 SENTINEL [VIGILANCIA/AGGRO BASE ETPL[type].aggro; ironback aggro220(sentinel0 DESPISTADO)/windup0.86(wind2 PONDEROSO) vs mudlurker aggro250(sentinel1 VIGILANTE)/windup0.48(wind0 SÚBITO) ORDEN OPUESTO; alerta ⊥ amago]. ⊥ #96 TOUGH [AGUANTE/MAX-HP BASE ETPL[type].hp; charger hp140(tough2 COLOSO)/windup0.66(wind1) vs mage hp56(tough1)/windup0.9(wind2 PONDEROSO) ORDEN OPUESTO — durabilidad ⊥ amago]. ⊥ #95 MENACE [DAÑO BASE ETPL[type].dmg; summoner dmg0(menace0 INERME)/windup0.95(wind2 PONDEROSO) vs volatile dmg23(menace2 PEGADOR)/windup0.7(wind1) ORDEN OPUESTO; daño ⊥ amago]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; murciélago spd158(swift2 VELOZ)/windup0.28(wind0 SÚBITO) vs golem spd46(swift0 LENTO)/windup0.95(wind2 PONDEROSO) DIAMÉTRICAMENTE OPUESTOS — rapidez ⊥ amago (aunque veloz↔súbito CORRELACIONE en el extremo, el ORDEN de banda diverge: volatile spd152 swift2/windup0.7 wind1)]. ⊥ #92 BULK [TAMAÑO físico ETPL[type].size (hiSize24/midSize18); charger sz26(bulk2 MOLE)/windup0.66(wind1) vs summoner sz20(bulk1)/windup0.95(wind2 PONDEROSO) ORDEN OPUESTO — tamaño ⊥ amago]. ⊥ #93 ROLE [arch FUNCIÓN de IA CATEGÓRICO; orco brute/windup0.82(wind1) vs moose brute/windup0.88(wind2) MISMO arch DISTINTA banda ⇒ windup NO es re-map de arch; bat rusher/wind0 vs mudlurker rusher/wind0]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO (¿ejecutando AHORA?); windup = DURACIÓN ESTÁTICA del tell del TIPO — bat wind0 mid-strike interrupt1 vs golem wind2 idle interrupt0 DISJUNTOS, el mismo mob cambia interrupt tick-a-tick pero su windup-banda JAMÁS]. ⊥ recover [VENTANA DE RECUPERACIÓN post-ataque ETPL[type].recover; charger windup0.66(wind1)/recover0.9 vs volatile windup0.7(wind1)/recover0.1 MISMO wind OPUESTO recover ⇒ windup(ANTES del golpe) ⊥ recover(DESPUÉS); recover NO tiene reward-reader tampoco]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; golem MELEE(skirmish0)/windup0.95(wind2) vs spearman RANGED(skirmish>0)/windup0.7(wind1) ORDEN OPUESTO]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale escala hp/dmg/spd/xp pero NUNCA windup ⇒ presagio INDEPENDIENTE de zona]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA — heading]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp]. ⊥ #85 CC [e.stun/e.slowT IMPUESTO]. ⊥ #74 AFIJO/⊥hostil/⊥campeón [SOBREESCRIBEN el CLON e.tpl; wind lee ETPL[type].windup BASE — un orco campeón SIGUE wind1 (base0.82)]. ⊥ #73 APEX [DISTANCIA a jefe]. ⊥ #78 FURIA [BOOLEANO e.enraged — enrage MODULA la duración del windup EN VIVO pero el eje lee la CONSTANTE base ETPL, no e.st]. ⊥ #72 ESCASEZ [CONTEO de mobs + recompensa ∝ tpl.xp]. ⊥ #2426 SHADOW_STALK [detectRadius DINÁMICO por LOS]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const WINDUP_SURGE = {
  enabled: true,             // LIVE — EVO#99 (CAS-2590 flip, 41º flag). Byte-neutro OFF: TODOS los seams (grant de kill + badge/VM) CÓDIGO MUERTO ⇒ killEnemy/render byte-idéntico al HEAD. version.json INTACTO. Flip false→true SÓLO tras CEO Gate 1/2 + DARK QA (Gate 2/2 input) + CEO Gate 2/2. Base master HEAD post-#98 / served 0a45234850cd (#98 RAM_SURGE LIVE).
  channel: "windFind",       // canal FRESCO (recompensa de fichas de presagio por rematar a un TELEGRAFIADO — el que se arma con un amago largo y legible) — NINGUNA de las 40 flags #59-#98 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/…/toughFind/sentinelFind/ramFind) está LLENA ⇒ fichas de presagio es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX windWeight sobre los mobs VIVOS en radio (el telegrafiado más ponderoso rematable ahora). El GRANT REAL usa el tiempo-de-presagio-base propio de la víctima (sin cap de radio). CEO balance knob.
  hiWind: 0.85,              // umbral de WIND-UP BASE (windup, seg) para la banda ponderoso/telegrafiado largo (deliberate, peso 2): wraith0.85/wendigo0.85/wisp0.85/thornspitter0.85/ironback0.86/moose0.88/emberkin0.88/magmabrute0.88/mage0.9/ashwraith0.9/dragón0.92/bogtyrant0.94/golem0.95/summoner0.95/calderatyrant0.95. Hueco disjunto limpio 0.82→0.85. CEO balance knob.
  midWind: 0.62,             // umbral de WIND-UP BASE (windup) para la banda medido (measured, peso 1): revenant0.62/charger0.66/toadbrute0.68/spearman0.7/volatile0.7/orco0.82/healer0.82/demon0.82. <midWind = súbito ⇒ 0 (bat0.28/rat0.35/wolf0.42/mudlurker0.48/bandit0.5/adv0.5/skeleton0.6/quillback0.6). Hueco disjunto limpio 0.60→0.62. CEO balance knob.
  weights: { deliberate: 2, measured: 1 },   // PESO de un remate por la BANDA DE WIND-UP BASE del TIPO del mob: PONDEROSO/telegrafiado largo (windup≥hiWind) pesa 2; MEDIDO (windup≥midWind) pesa 1; súbito (windup<midWind) ⇒ 0. Reward = rematar al TELEGRAFIADO que aprendiste a leer y castigar. CEO balance knobs.
  windBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de presagio por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE PRESAGIO (score∈{0,1,2}). Telegrafiado MÁS ponderoso = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (súbito) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado MEDIDO): +1 ficha de presagio por kill. "leíste un amago medido".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado PONDEROSO/telegrafiado largo): +2 fichas por kill. "castigaste el amago más largo y legible". CEO balance knobs.
  ],
};

// CAS-2594: REMATE DE RECOBRO (RECOVER_SURGE, EVO#100 DARK) — EJE VENTANA DE RECUPERACIÓN POST-ATAQUE / RECOVER BASE del mob TYPE server-auth (la LENTITUD DE RECOBRO INTRÍNSECA de la criatura: cuánto TARDA su TIPO de fábrica en RECOMPONERSE DESPUÉS de golpear — la cola de exposición tras la estocada. Un plúmbeo que se queda plantado y vulnerable un LARGO recobro summoner0.95/toadbrute0.92/charger0.9/mage0.85/healer0.85/ashwraith0.85/emberkin0.82/golem0.8/wraith0.8/wisp0.8/bogtyrant0.8/thornspitter0.8/calderatyrant0.8 que te REGALA la ventana de castigo vale más que un rezagado medio orco0.72/demon0.72/ironback0.74/spearman0.75/wendigo0.76/magmabrute0.76/dragón0.78/moose0.7 o una alimaña ÁGIL volatile0.1/bat0.35/rat0.4/wolf0.45/adv0.5/skeleton0.55/bandit0.55/quillback0.55/revenant0.55/mudlurker0.55 que se recompone en un parpadeo) + canal FRESCO recoverFind (recompensa de fichas de recobro por rematar a un LENTO-DE-RECOBRO — el que tras su golpe se queda plantado y expuesto una larga cola que aprendiste a leer y castigar, no al que se recompone antes de que puedas capitalizar). Camino al 42º flag (serializa tras #99 WINDUP_SURGE LIVE&served aca8e44656c4).
//  · PRE-FLIGHT GATE (recomendado del issue = RECOVER_SURGE ETPL[type].recover) → PASA sin pivote. `recover` es un campo CANÓNICO de VENTANA DE RECUPERACIÓN base (segundos de la cola post-ataque) en CADA fila de ETPL (config.js:290+; 0.1..0.95 en 31 tipos). ESCALAR DECIMAL ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 41 flags #59-#99 lo lee como SCORE de recompensa: el ÚNICO lector de `.recover` es la MÁQUINA DE ESTADOS de la IA (updateEnemies arma `e.state="recover"; e.st=e.tpl.recover` tras un strike/roto-de-escudo y lo decrementa a paso-fijo — DURACIÓN del estado, comportamiento) — NI UN SOLO `*Weight`/seam de recompensa de las 41 flags previas lo puntúa. CRUX ⊥#99 WINDUP (vecino directo, MISMA fila ETPL): #99 lee `ETPL[type].windup` = la cola ANTES del golpe (el AMAGO/telegraph que se carga); recover = la cola DESPUÉS del golpe (el RECOBRO/lag). Son campos DISTINTOS de la misma fila y DIVERGEN de banda: DENTRO de la misma banda de windup (medido, wind1: revenant0.62/charger0.66/toadbrute0.68/spearman0.7/volatile0.7/orco0.82/healer0.82/demon0.82) el recover barre las 3 bandas — volatile recover0.1(recov0), revenant0.55(recov0), charger0.9(recov2), toadbrute0.92(recov2), healer0.85(recov2), spearman0.75(recov1), orco0.72(recov1) ⇒ recover NO es re-map de windup. CRUX FIRME: charger windup0.66(wind1)/recover0.9(recov2) vs volatile windup0.7(wind1)/recover0.1(recov0) — MISMO wind band, recover DIAMETRALMENTE OPUESTO. ⊥override BASE no clon (un spawn escalado/élite que sobrescriba el CLON e.tpl.recover NO altera la fila base). applyZoneScale escala hp/dmg/spd/xp pero NUNCA recover ⇒ recobro INDEPENDIENTE de zona (⊥#91).
//  · CLAVE ⊥override/⊥#74/⊥champion/⊥élite: recoverWeight lee la VENTANA DE RECOBRO BASE INMUTABLE `ETPL[e.type].recover` (el recobro del TIPO), NO `e.tpl.recover` (el CLON). Si algún spawn escalara el clon recover (élite/campeón), recoverWeight IGNORA el clon y lee la fila base ⇒ un orco campeón SIGUE recov1 (base 0.72). Y applyZoneScale (sim.js) escala hp/dmg/spd/xp pero NUNCA recover ⇒ recobro INDEPENDIENTE de zona.
//  · EJE server-auth ESTÁTICO: recoverWeight(e) = peso por la BANDA DE RECOVER BASE del TIPO. recover=recoverOf(e)=ETPL[e.type].recover (base inmutable). recover≥hiRecover(0.8) ⇒ plúmbeo/recobro largo (mage/wraith/golem/charger/summoner/healer/wisp/toadbrute/bogtyrant/ashwraith/thornspitter/emberkin/calderatyrant) ⇒ sluggish(2); recover≥midRecover(0.7) ⇒ rezagado (orco/spearman/dragón/moose/demon/wendigo/ironback/magmabrute) ⇒ lagging(1); recover<midRecover (ágil: volatile/bat/rat/wolf/adv/skeleton/bandit/quillback/revenant/mudlurker) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como windWeight #99/ramWeight #98/sentinelWeight #97/toughWeight #96/menaceWeight #95/swiftWeight #94/roleWeight #93/bulkWeight #92 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/recover-base es inmutable ⇒ señal FIEL). El SCORE del kill = recoverWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = recoverScore(hero)=MAX recoverWeight sobre los mobs VIVOS en radio (el recobro más largo rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_recoverPre`=recoverWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de recover-base≥midRecover (recoverWeight≥1 vía `_recoverPre`), el héroe cosecha fichas de recobro = recoverForage(hero, tpl, _recoverPre), banca a h.recoverBounty vía grantRecoverBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_recoverPre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: recoverWeight en el kill = O(1) 1×/kill (1 lookup ETPL); recoverScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥41 (CRUX): eje VENTANA DE RECUPERACIÓN POST-ATAQUE / RECOVER BASE ESTÁTICO del TIPO de mob (cuánto TARDA de fábrica en recomponerse DESPUÉS de golpear — su cola de exposición), NO amago/impacto/vigilancia/aguante/daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado-dinámico/alcance/dirección. ⊥ #99 WINDUP [TIEMPO DE PRESAGIO/WIND-UP BASE ETPL[type].windup = la cola ANTES del golpe; recover = la cola DESPUÉS — charger windup0.66(wind1)/recover0.9(recov2) vs volatile windup0.7(wind1)/recover0.1(recov0) MISMO wind OPUESTO recover; toadbrute windup0.68(wind1)/recover0.92(recov2) vs revenant windup0.62(wind1)/recover0.55(recov0); el eje base más reciente #99, decoupled amago-vs-recobro]. ⊥ #98 RAM [FUERZA DE IMPACTO/KNOCKBACK BASE ETPL[type].knock; charger knock235(ram2 ARIETE)/recover0.9(recov2) vs golem knock60(ram0 LEVE)/recover0.8(recov2) MISMO recov OPUESTO ram; moose knock200(ram2)/recover0.7(recov1) vs golem knock60(ram0)/recover0.8(recov2) ORDEN OPUESTO — empuje ⊥ recobro]. ⊥ #97 SENTINEL [VIGILANCIA/AGGRO BASE ETPL[type].aggro; ironback aggro220(sentinel0 DESPISTADO)/recover0.74(recov1) vs summoner aggro330(sentinel2 VIGÍA)/recover0.95(recov2) — alerta ⊥ recobro; revenant aggro300(sentinel1)/recover0.55(recov0)]. ⊥ #96 TOUGH [AGUANTE/MAX-HP BASE ETPL[type].hp; revenant hp120(tough2 COLOSO)/recover0.55(recov0 ÁGIL) vs golem hp640(tough2)/recover0.8(recov2) MISMO tough OPUESTO recover — durabilidad ⊥ recobro]. ⊥ #95 MENACE [DAÑO BASE ETPL[type].dmg; summoner dmg0(menace0 INERME)/recover0.95(recov2 PLÚMBEO) vs volatile dmg23(menace2 PEGADOR)/recover0.1(recov0 ÁGIL) ORDEN OPUESTO; daño ⊥ recobro]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; DENTRO de la banda recov0: bat spd158(swift2 VELOZ)/recover0.35 vs skeleton spd86(swift0 LENTO)/recover0.55 MISMO recov OPUESTO swift; y DENTRO de swift0 (lentos): skeleton recover0.55(recov0) vs golem recover0.8(recov2) MISMO swift OPUESTO recover ⇒ recobro NO es re-map de velocidad — aunque lento↔plúmbeo CORRELACIONE en el extremo, el ORDEN de banda diverge: revenant spd104/recover0.55 recov0, charger spd74/recover0.9 recov2]. ⊥ #92 BULK [TAMAÑO físico ETPL[type].size (hiSize24/midSize18); summoner sz20(bulk1)/recover0.95(recov2) vs skeleton sz20(bulk1)/recover0.55(recov0) MISMO bulk OPUESTO recover — tamaño ⊥ recobro]. ⊥ #93 ROLE [arch FUNCIÓN de IA CATEGÓRICO; MISMO arch caster: spearman/recover0.75(recov1) vs mage/recover0.85(recov2) DISTINTA banda ⇒ recover NO es re-map de arch; MISMO arch warlock: demon/recover0.72(recov1) vs wisp/recover0.8(recov2)]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO (¿ejecutando AHORA? categoría windup/strike/shield/recover que cambia tick-a-tick) — INTERRUPT puntúa la CATEGORÍA del estado (recover-state ⇒ 0) NUNCA el NÚMERO .recover; RECOVER_SURGE puntúa el ESCALAR ETPL[type].recover BASE del TIPO. Un golem mid-windup interrupt1 pero recoverWeight=recov2 (banda del tipo, sea cual sea su estado vivo); un volatile en recover-state interrupt0 pero recoverWeight=recov0 — el mismo mob cambia interrupt tick-a-tick pero su recover-banda JAMÁS]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; golem MELEE(skirmish0)/recover0.8(recov2) vs spearman RANGED(skirmish>0)/recover0.75(recov1)]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale escala hp/dmg/spd/xp pero NUNCA recover ⇒ recobro INDEPENDIENTE de zona]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA — heading]. ⊥ #88 REMATE [DISTANCIA hero↔víctima]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp]. ⊥ #85 CC [e.stun/e.slowT IMPUESTO]. ⊥ #74 AFIJO/⊥hostil/⊥campeón [SOBREESCRIBEN el CLON e.tpl; recover lee ETPL[type].recover BASE — un orco campeón SIGUE recov1 (base0.72)]. ⊥ #73 APEX [DISTANCIA a jefe]. ⊥ #78 FURIA [BOOLEANO e.enraged — enrage MODULA la duración del recobro EN VIVO e.st pero el eje lee la CONSTANTE base ETPL, no e.st]. ⊥ #72 ESCASEZ [CONTEO de mobs + recompensa ∝ tpl.xp]. ⊥ #2426 SHADOW_STALK [detectRadius DINÁMICO por LOS]. ⊥ CADENCE #67/FRENZY/COMBO [tempo/DPS del HÉROE]. ⊥ nivel(inexistente)/edad(spawnT no horneado)/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const RECOVER_SURGE = {
  enabled: true,             // LIVE — EVO#100 (CAS-2597 flip, 42º flag). Flip false→true (Remate de Recobro) tras CEO Gate 1/2 + DARK QA CAS-2596 PASS 24/24 (2-cli 0-desync fp 15920977) + CEO Gate 2/2. Base master HEAD post-#99 5c60b69 / served c619cd2dd617 (#100 sprite-audit art-only, config==#99 WINDUP LIVE) → avanza a #100 RECOVER LIVE.
  channel: "recoverFind",    // canal FRESCO (recompensa de fichas de recobro por rematar a un LENTO-DE-RECOBRO — el que tras golpear se queda plantado y expuesto una larga cola) — NINGUNA de las 41 flags #59-#99 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/matFind/…/ramFind/windFind) está LLENA ⇒ fichas de recobro es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX recoverWeight sobre los mobs VIVOS en radio (el recobro más largo rematable ahora). El GRANT REAL usa la ventana-de-recobro-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiRecover: 0.8,            // umbral de RECOVER BASE (recover, seg) para la banda plúmbeo/recobro largo (sluggish, peso 2): golem0.8/wraith0.8/wisp0.8/bogtyrant0.8/thornspitter0.8/calderatyrant0.8/emberkin0.82/mage0.85/healer0.85/ashwraith0.85/charger0.9/toadbrute0.92/summoner0.95. Hueco disjunto limpio 0.78→0.80. CEO balance knob.
  midRecover: 0.7,           // umbral de RECOVER BASE (recover) para la banda rezagado (lagging, peso 1): moose0.7/orco0.72/demon0.72/ironback0.74/spearman0.75/wendigo0.76/magmabrute0.76/dragón0.78. <midRecover = ágil ⇒ 0 (volatile0.1/bat0.35/rat0.4/wolf0.45/adv0.5/skeleton0.55/bandit0.55/quillback0.55/revenant0.55/mudlurker0.55). Hueco disjunto limpio 0.55→0.70. CEO balance knob.
  weights: { sluggish: 2, lagging: 1 },   // PESO de un remate por la BANDA DE RECOVER BASE del TIPO del mob: PLÚMBEO/recobro largo (recover≥hiRecover) pesa 2; REZAGADO (recover≥midRecover) pesa 1; ágil (recover<midRecover) ⇒ 0. Reward = rematar al LENTO-DE-RECOBRO que aprendiste a leer y castigar en su cola de exposición. CEO balance knobs.
  recoverBountyCap: 2,       // SUB-CAP DURO PROPIO de las fichas de recobro por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE RECOBRO (score∈{0,1,2}). Recobro MÁS largo/plúmbeo = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (ágil) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado REZAGADO): +1 ficha de recobro por kill. "castigaste una cola de recobro media".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado PLÚMBEO/recobro largo): +2 fichas por kill. "castigaste la cola de recobro más larga y expuesta". CEO balance knobs.
  ],
};

// CAS-2600: REMATE DE ACOMETIDA (LUNGE_SURGE, EVO#101 DARK) — EJE DISTANCIA DE ESTOCADA/POUNCE INTRÍNSECA del mob TYPE server-auth (cuánto se ABALANZA de fábrica su TIPO para cerrar distancia en su lunge de rusher — la px que RECORRE en su salto de acercamiento). Sólo rushers/pouncers cargan `lunge` (bandit132/mudlurker126/wolf118/bat96); los melee-estáticos NO lo tienen (undefined ⇒ 0). Camino al 43º flag (serializa tras #100 RECOVER_SURGE LIVE&served e1d801e51573/815).
//  · PRE-FLIGHT GATE (recomendado del issue = LUNGE_SURGE ETPL[type].lunge) → PASA sin pivote. `lunge` es un campo CANÓNICO de DISTANCIA DE POUNCE base (px) en las filas de rusher de ETPL (config.js:290+; sólo 4 tipos lo llevan: bat96/wolf118/mudlurker126/bandit132). ESCALAR DECIMAL/ENTERO ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 42 flags #59-#100 lo lee como SCORE de recompensa: el ÚNICO lector de `.lunge` es la MÁQUINA DE MOVIMIENTO de la IA (sim.js: `lspd=(e.tpl.lunge||110)/0.2` — la VELOCIDAD del dash de la estocada especial del rusher; comportamiento, no recompensa). NI UN SOLO `*Weight`/seam de recompensa de las 42 flags previas lo puntúa (INTERRUPT #89 menciona "special slam/lunge" en comentarios pero lee `e.specialNow`/`e.state`, NUNCA el NÚMERO `.lunge`). CRUX ⊥#94 SWIFT (misma familia rusher, campos DISTINTOS): #94 lee ETPL[type].spd = velocidad de CRUCERO; lunge = la DISTANCIA de un SALTO de acometida — un mob VELOZ puede tener salto CORTO. DENTRO de swift2 (escurridizas): bat spd158(swift2)/lunge96(lunge0 CORTO) vs wolf spd128(swift2)/lunge118(lunge1) ⇒ MISMO swift OPUESTO lunge. CRUX FIRME ⊥#93 ROLE: los 4 lunge-carriers son arch:"rusher" IDÉNTICO pero lunge barre las 3 bandas (bat rusher/lunge0, wolf/mudlurker rusher/lunge1, bandit rusher/lunge2) ⇒ lunge NO es re-map de arch. ⊥override BASE no clon (un spawn escalado/élite que sobrescriba el CLON e.tpl.lunge NO altera la fila base). applyZoneScale escala hp/dmg/spd/xp pero NUNCA lunge ⇒ acometida INDEPENDIENTE de zona (⊥#91).
//  · CLAVE ⊥override/⊥#74/⊥champion/⊥élite: lungeWeight lee la DISTANCIA DE POUNCE BASE INMUTABLE `ETPL[e.type].lunge` (el salto del TIPO), NO `e.tpl.lunge` (el CLON). Si algún spawn escalara el clon lunge (élite/campeón/variante stalker lungeMul), lungeWeight IGNORA el clon y lee la fila base ⇒ un bandit campeón SIGUE lunge2 (base 132). Y applyZoneScale (sim.js) escala hp/dmg/spd/xp pero NUNCA lunge ⇒ acometida INDEPENDIENTE de zona.
//  · EJE server-auth ESTÁTICO: lungeWeight(e) = peso por la BANDA DE LUNGE BASE del TIPO. lunge=lungeOf(e)=ETPL[e.type].lunge (base inmutable, 0 si el tipo no es pouncer). lunge≥hiLunge(130) ⇒ pouncer/salto largo (bandit132) ⇒ pouncer(2); lunge≥midLunge(110) ⇒ estocada media (wolf118/mudlurker126) ⇒ lunger(1); lunge<midLunge (salto corto bat96 / melee-estáticos sin lunge) ⇒ 0. LUT PURA server-auth data-driven por umbral. NO filtra e.dead (el eje ES la víctima propia, como recoverWeight #100/windWeight #99/ramWeight #98/…/bulkWeight #92 — en el TOP de killEnemy el mob ya tiene e.dead=true pero su TIPO/lunge-base es inmutable ⇒ señal FIEL). El SCORE del kill = lungeWeight(víctima) muestreado en el TOP de killEnemy. La señal VIVA del badge/VM = lungeScore(hero)=MAX lungeWeight sobre los mobs VIVOS en radio (el saltador más largo rematable ahora).
//  · APLICACIÓN — un solo seam: el TAIL de killEnemy (leyendo el snapshot `_lungePre`=lungeWeight(e) muestreado en el TOP). Al rematar un mob no-neutral de lunge-base≥midLunge (lungeWeight≥1 vía `_lungePre`), el héroe cosecha fichas de acometida = lungeForage(hero, tpl, _lungePre), banca a h.lungeBounty vía grantLungeBounty (0 RNG). BYTE-NEUTRO OFF: enabled:false ⇒ `_lungePre`=0 (const inerte) + rama entera CÓDIGO MUERTO ⇒ killEnemy byte-idéntico al HEAD. FRAME-BUDGET: lungeWeight en el kill = O(1) 1×/kill (1 lookup ETPL); lungeScore (badge/VM) = O(n) sobre mobs-en-radio (n acotado <~20) 1×/frame ⇒ trivial dentro de 16ms.
//  · ⊥42 (CRUX): eje DISTANCIA DE ESTOCADA/POUNCE ESTÁTICO del TIPO de mob (cuánto se abalanza de fábrica para cerrar distancia), NO recobro/amago/impacto/vigilancia/aguante/daño/rapidez/rol/tamaño/valor/área/vida-fracción/conteo/geometría/estado-dinámico/alcance/dirección. ⊥ #100 RECOVER [VENTANA DE RECUPERACIÓN ETPL[type].recover; los 4 lunge-carriers son recov0 (recover<0.7: bat0.35/wolf0.45/mudlurker0.55/bandit0.55) pero lunge barre 0/1/2 ⇒ DENTRO de recov0, bandit lunge2 vs bat lunge0; y golem recover0.8(recov2)/lunge0 vs bandit recover0.55(recov0)/lunge2 OPUESTO]. ⊥ #99 WINDUP [TIEMPO DE PRESAGIO ETPL[type].windup; los 4 rushers son wind0 (windup<0.62: bat0.28/wolf0.42/mudlurker0.48/bandit0.5) pero lunge barre 0/1/2; golem windup0.95(wind2)/lunge0 vs bandit windup0.5(wind0)/lunge2 OPUESTO — amago ⊥ salto]. ⊥ #98 RAM [FUERZA DE IMPACTO ETPL[type].knock; moose knock200(ram2)/lunge0 (sin lunge) vs bandit knock110(ram1)/lunge132(lunge2) ORDEN OPUESTO — empuje SALIENTE ⊥ distancia de acercamiento; DENTRO de ram1: wolf knock140/lunge118(lunge1) vs bandit knock110/lunge132(lunge2) MISMO ram distinto lunge]. ⊥ #97 SENTINEL [VIGILANCIA/AGGRO ETPL[type].aggro; bandit aggro250(alerta media)/lunge2 vs summoner aggro330(sentinel2)/lunge0 — alerta ⊥ salto]. ⊥ #96 TOUGH [AGUANTE/HP; golem hp640(tough2)/lunge0 vs bandit hp60(frágil)/lunge2 OPUESTO]. ⊥ #95 MENACE [DAÑO; bat dmg7(bajo)/lunge0 vs bandit dmg18/lunge2, orden ⊥]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; DENTRO de swift2 (escurridizas): bat spd158(swift2)/lunge96(lunge0) vs wolf spd128(swift2)/lunge118(lunge1) MISMO swift OPUESTO lunge — velocidad de crucero ⊥ distancia de salto; un veloz puede tener salto corto; applyZoneScale escala spd NUNCA lunge]. ⊥ #93 ROLE [arch FUNCIÓN de IA CATEGÓRICO; los 4 lunge-carriers son arch:"rusher" IDÉNTICO pero lunge ∈{0,1,2}: bat rusher/lunge0, wolf/mudlurker rusher/lunge1, bandit rusher/lunge2 ⇒ lunge NO es re-map de arch — el CRUX más firme]. ⊥ #92 BULK [TAMAÑO ETPL[type].size; bandit sz19/lunge2 vs golem sz36(bulk2)/lunge0 OPUESTO]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO — INTERRUPT puntúa la CATEGORÍA del estado (special slam/lunge EN CURSO ⇒ 2) que cambia tick-a-tick, NUNCA el NÚMERO .lunge; LUNGE_SURGE puntúa el ESCALAR ETPL[type].lunge BASE del TIPO — un wolf idle interrupt0 pero lungeWeight=lunge1 (banda del tipo, sea cual sea su estado); el mismo mob cambia interrupt tick-a-tick pero su lunge-banda JAMÁS]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; los rushers son MELEE (skirmish0) y lunge es la px de un salto MELEE de acercamiento, ⊥ clase a-distancia; una torreta ranged tiene lunge0]. ⊥ WORTH/xp [valor ETPL[type].xp]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale escala hp/dmg/spd/xp NUNCA lunge ⇒ acometida INDEPENDIENTE de zona]. ⊥ #90 EMBESTIDA [DIRECCIÓN de movimiento DINÁMICA — heading; lunge=DISTANCIA ESCALAR estática, no un ángulo]. ⊥ #88 REMATE [DISTANCIA hero↔víctima al morir]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA]. ⊥ #85 CC [e.stun/e.slowT]. ⊥ #74 AFIJO/⊥campeón [SOBREESCRIBEN el CLON e.tpl; lunge lee ETPL[type].lunge BASE — bandit campeón SIGUE lunge2 (base132)]. ⊥ #73 APEX/#78 FURIA/#72 ESCASEZ/#2426 SHADOW_STALK/CADENCE #67/FRENZY/COMBO. ⊥ nivel/edad/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const LUNGE_SURGE = {
  enabled: true,             // LIVE — EVO#101 (43º flag). Flipped CAS-2608 tras CEO Gate 1/2 + DARK QA CAS-2602 PASS 18/18 (byte-neutral OFF, 0-regr, 2-cli fp 15920977 0-desync) + CEO Gate 2/2 @b1e207c. byte-neutral OFF: `_lungePre`=0 (const inerte) + rama muerta ⇒ killEnemy/render byte-idéntico al HEAD. Base master HEAD post-#100 89b9319 / served e1d801e51573/815 (#100 RECOVER LIVE).
  channel: "lungeFind",      // canal FRESCO (recompensa de fichas de acometida por rematar a un SALTADOR-LARGO — el pouncer que se abalanza de lejos, cuyo salto de acercamiento aprendiste a leer y castigar) — NINGUNA de las 42 flags #59-#100 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/…/windFind/recoverFind) está LLENA ⇒ fichas de acometida es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX lungeWeight sobre los mobs VIVOS en radio (el saltador más largo rematable ahora). El GRANT REAL usa la distancia-de-salto-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiLunge: 130,              // umbral de LUNGE BASE (lunge, px) para la banda pouncer/salto largo (pouncer, peso 2): bandit132. Hueco disjunto limpio 126→130 (entre mudlurker126 y bandit132). CEO balance knob.
  midLunge: 110,             // umbral de LUNGE BASE (lunge) para la banda estocada media (lunger, peso 1): wolf118/mudlurker126. <midLunge = salto corto ⇒ 0 (bat96 + todos los melee-estáticos sin lunge). Hueco disjunto limpio 96→110 (entre bat96 y wolf118). CEO balance knob.
  weights: { pouncer: 2, lunger: 1 },   // PESO de un remate por la BANDA DE LUNGE BASE del TIPO del mob: POUNCER/salto largo (lunge≥hiLunge) pesa 2; ESTOCADA MEDIA (lunge≥midLunge) pesa 1; salto corto / sin lunge (lunge<midLunge) ⇒ 0. Reward = rematar al SALTADOR-LARGO que se abalanza de lejos, cuyo pounce aprendiste a leer. CEO balance knobs.
  lungeBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de acometida por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE LUNGE (score∈{0,1,2}). Salto MÁS largo/pouncer = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (salto corto/sin lunge) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado de ESTOCADA MEDIA): +1 ficha de acometida por kill. "castigaste un salto de acercamiento medio".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado POUNCER/salto largo): +2 fichas por kill. "castigaste el salto de acometida más largo". CEO balance knobs.
  ],
};

// CAS-2611: REMATE DE PERTRECHO (GEARCHANCE_SURGE, EVO#102 DARK) — EJE FRESCO PROBABILIDAD DE SOLTAR EQUIPO / GEAR-DROP INTRÍNSECA del mob TYPE server-auth (cuán PERTRECHADO va de fábrica su TIPO — la probabilidad base `gearChance` con que suelta una instancia de equipo al morir; el mob bien-armado que carga botín de gear vs el bicho pelado que raras veces suelta pertrecho). Sólo la fila BASE de ETPL define gearChance (config.js:290+; bat0.08..revenant/demon0.32). Camino al 44º flag (serializa tras #101 LUNGE_SURGE LIVE&served fed1aac601f6/815).
//  · PRE-FLIGHT GATE (recomendado del issue = GEARCHANCE_SURGE ETPL[type].gearChance) → PASA sin pivote. `gearChance` es un campo CANÓNICO de PROBABILIDAD DE DROP DE EQUIPO base (decimal ∈[0,1]) en las filas de ETPL. ESCALAR DECIMAL ESTÁTICO por template, server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG EN EL READ usado para bandear — bandeo sobre el VALOR ESTÁTICO del template gearOf=ETPL[type].gearChance, NO sobre una tirada rodada), y NINGUNA de las 43 flags #59-#101 lo lee como SCORE de recompensa: los ÚNICOS lectores de `.gearChance` son (a) la TIRADA DE DROP de loot (`srand()<((tpl.gearChance||0)*pactRewardMul("drop"))` sim.js:6404 — probabilidad, se consume DENTRO de la rama de loot, NO puntúa banda), (b) los modificadores de AFIJO/FORJA que SUMAN gearBonus al CLON e.tpl.gearChance (sim.js:2393/2411 — mutan la prob, no la puntúan como peso), y (c) los probes dev. NI UN SOLO `*Weight`/seam de recompensa de las 43 flags previas lo puntúa. CRUX ⊥#72 SCARCITY (el riesgo señalado): #72 lee ETPL[type].xp como MAGNITUD DE RECOMPENSA (esencia por kill = round(scarcityMul(zone)*tpl.xp), canal essenceFind), NO gearChance — son CAMPOS DISTINTOS de ETPL. Y la banda de gearChance NO es proxy de xp: DENTRO de la banda kitted (gear1, gearChance 0.22-0.26) el xp barre 20→38 (skeleton xp20 gearChance0.22 vs emberkin xp38 gearChance0.26 — MISMO gearWeight1, ~2× esencia SCARCITY) ⇒ SCARCITY varía DENTRO de una banda de gearChance fija ⇒ NO co-monótono ⇒ ⊥#72 PROBADO. gearChance es PROBABILIDAD DE DROP (¿suelta gear?), #72 es MAGNITUD (cuánta esencia) — dimensiones ortogonales.
//  · ⊥override BASE no clon: gearWeight lee ETPL[e.type].gearChance BASE (la fila INMUTABLE), NO el CLON e.tpl.gearChance — si un spawn afijado/Forja/campeón sobrescribe/eleva el CLON (gearBonus sim.js:2393/2411), gearOf lo IGNORA y lee la fila base ⇒ un orco Forja SIGUE gear2 base0.30. applyZoneScale escala hp/dmg/spd/xp pero NUNCA gearChance ⇒ pertrecho INDEPENDIENTE de zona (⊥#91).
//  · ⊥43 (CRUX): eje PROBABILIDAD DE SOLTAR EQUIPO ESTÁTICA del TIPO de mob (cuán pertrechado va de fábrica), NO distancia-de-salto/recobro/amago/impacto/vigilancia/aguante/daño/rapidez/rol/tamaño/valor-xp/área/vida-fracción/conteo/geometría/estado-dinámico/alcance/dirección. ⊥ #101 LUNGE [DISTANCIA DE ESTOCADA ETPL[type].lunge; sólo 4 rushers cargan lunge — bandit lunge132(lunge2)/gearChance0.26(gear1) vs moose lunge0(sin lunge)/gearChance0.32(gear2) ORDEN OPUESTO; wolf lunge118(lunge1)/gearChance0.14(gear0)]. ⊥ #100 RECOVER [VENTANA DE RECUPERACIÓN ETPL[type].recover; DENTRO de recov0 (nimble): revenant recover0.55/gearChance0.32(gear2) vs bat recover0.35/gearChance0.08(gear0) MISMO recov OPUESTO gear]. ⊥ #99 WINDUP [TIEMPO DE PRESAGIO ETPL[type].windup; volatile windup0.7(wind1)/gearChance0.10(gear0) vs bandit windup0.5(wind0)/gearChance0.26(gear1) ORDEN OPUESTO]. ⊥ #98 RAM [FUERZA DE IMPACTO ETPL[type].knock; bat knock90(ram0)/gearChance0.08(gear0) vs skeleton knock120(ram1)/gearChance0.22(gear1) — pero moose knock200(ram2)/gearChance0.32(gear2) y revenant knock120(ram1)/gearChance0.32(gear2) MISMO ram1 distinto gear ⇒ empuje ⊥ pertrecho]. ⊥ #97 SENTINEL [VIGILANCIA/AGGRO ETPL[type].aggro; ironback aggro220(sentinel0)/gearChance0.30(gear2) vs summoner aggro330(sentinel2)/gearChance0.24(gear1) OPUESTO — alerta ⊥ pertrecho]. ⊥ #96 TOUGH [AGUANTE/HP; volatile hp26(frágil)/gearChance0.10(gear0) vs revenant hp120/gearChance0.32(gear2); DENTRO de gear1 skeleton hp52 vs mudlurker hp64 ⇒ gear ⊥ HP]. ⊥ #95 MENACE [DAÑO; summoner dmg0(menace0)/gearChance0.24(gear1) vs volatile dmg23(menace2)/gearChance0.10(gear0) OPUESTO — inerme-pero-pertrechado vs peligroso-pelado]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; volatile spd152(swift2)/gearChance0.10(gear0) vs orc spd64(swift0)/gearChance0.30(gear2) DIAMETRAL]. ⊥ #93 ROLE [arch FUNCIÓN de IA CATEGÓRICO; DENTRO de arch:"brute" — orc/moose/ironback/magmabrute gear2 pero volatile arch:"volatile" gear0; DENTRO de arch:"caster" spearman0.24/mage0.26/wraith0.26 gear1 vs demon arch:"warlock"0.32 gear2 ⇒ gear NO es re-map de arch — MISMO brute barre; los casters ranged gear1 salvo warlocks demon/wendigo/wisp gear2]. ⊥ #92 BULK [TAMAÑO ETPL[type].size; skeleton sz20/gearChance0.22(gear1) vs summoner sz20/gearChance0.24(gear1) MISMO size; bat sz14/gear0 vs orc sz22/gear2]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO — categoría del estado que cambia tick-a-tick, NUNCA el NÚMERO .gearChance; GEARCHANCE puntúa el ESCALAR ETPL[type].gearChance BASE del TIPO — un orc idle interrupt0 pero gearWeight=gear2 (banda del tipo, sea cual sea su estado)]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; los ranged casters son gear1 (spearman/mage/wraith 0.24-0.26) pero demon RANGED gear2(0.32) y wolf MELEE gear0(0.14) ⇒ clase-de-alcance ⊥ pertrecho]. ⊥ #72 SCARCITY [xp como MAGNITUD de esencia; gearChance es PROBABILIDAD de drop — DENTRO de gear1 el xp barre 20→38 ⇒ NO co-monótono]. ⊥ WORTH/xp [valor ETPL[type].xp — mismo argumento ⊥#72]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale NUNCA escala gearChance]. ⊥ #90 EMBESTIDA [DIRECCIÓN/heading DINÁMICA]. ⊥ #88 REMATE [DISTANCIA hero↔víctima al morir]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA]. ⊥ #85 CC [e.stun/e.slowT]. ⊥ #74 AFIJO/⊥campeón/⊥Forja [SOBREESCRIBEN/ELEVAN el CLON e.tpl.gearChance vía gearBonus; gearWeight lee ETPL[type].gearChance BASE — orc Forja SIGUE gear2 base0.30]. ⊥ #79 BOTÍN [G.drops YA en el suelo — objetos DESPUÉS de caer; gearChance=prob ANTES de rodar]. ⊥ #73 APEX/#78 FURIA/#2426 SHADOW_STALK/CADENCE #67/FRENZY/COMBO. ⊥ nivel/edad/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const GEARCHANCE_SURGE = {
  enabled: true,             // LIVE — EVO#102 (44º flag). CAS-2611 LIVE FLIP config-only 1-línea false→true (Remate de Pertrecho) tras CEO Gate 1/2 (selfverify 22/22) + DARK QA Gate 2/2 (INDEP 15/15 @9e7563e). Base master HEAD post-#101 ace4dab / DARK 9e7563e / QA-tooling 2181f60.
  channel: "gearFind",       // canal FRESCO (recompensa de fichas de pertrecho por rematar a un mob BIEN-ARMADO — el que va cargado de equipo de fábrica, cuya alta probabilidad de soltar gear aprendiste a cazar) — NINGUNA de las 43 flags #59-#101 lo usa. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/…/recoverFind/lungeFind) está LLENA ⇒ fichas de pertrecho es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX gearWeight sobre los mobs VIVOS en radio (el mob más pertrechado rematable ahora). El GRANT REAL usa la gearChance-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiGear: 0.30,              // umbral de GEARCHANCE BASE (gearChance) para la banda arsenal/bien-armado (arsenal, peso 2): orc0.30/charger0.30/moose0.32/revenant0.32/demon0.32/wendigo0.30/toadbrute0.30/ironback0.30/magmabrute0.30. Hueco disjunto limpio 0.26→0.30 (entre el clúster caster 0.26 y orc 0.30). CEO balance knob.
  midGear: 0.22,             // umbral de GEARCHANCE BASE (gearChance) para la banda kitted/pertrecho medio (kitted, peso 1): skeleton0.22/quillback0.22/summoner0.24/healer0.24/spearman0.24/mage0.26/bandit0.26/wraith0.26/mudlurker0.26/wisp0.26/ashwraith0.26/thornspitter0.26/emberkin0.26. <midGear = pelado ⇒ 0 (bat0.08/rat0.10/volatile0.10/wolf0.14). Hueco disjunto limpio 0.14→0.22 (entre wolf0.14 y skeleton0.22). CEO balance knob.
  weights: { arsenal: 2, kitted: 1 },   // PESO de un remate por la BANDA DE GEARCHANCE BASE del TIPO del mob: ARSENAL/bien-armado (gearChance≥hiGear) pesa 2; PERTRECHO MEDIO (gearChance≥midGear) pesa 1; pelado (gearChance<midGear) ⇒ 0. Reward = rematar al mob CARGADO DE EQUIPO que raras veces te deja ir sin botín de gear. CEO balance knobs.
  gearBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de pertrecho por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE GEARCHANCE (score∈{0,1,2}). Más pertrechado/arsenal = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (pelado) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado de PERTRECHO MEDIO): +1 ficha de pertrecho por kill. "cazaste un mob medianamente armado".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado ARSENAL/bien-armado): +2 fichas por kill. "cazaste al mob más cargado de equipo". CEO balance knobs.
  ],
};

// CAS-2615: REMATE DE BOLSA (GOLD_SURGE, EVO#103 DARK) — EJE FRESCO MAGNITUD DE ORO/BOTÍN DE MONEDA INTRÍNSECA del mob TYPE server-auth (cuánta BOLSA carga de fábrica su TIPO — la cantidad base de oro `gold` [rango min,max] que suelta al morir; el mob de bolsa GORDA que deja un buen pellizco de monedas vs el bicho de bolsa flaca que apenas cae con calderilla). Sólo la fila BASE de ETPL define gold (config.js:290+; rat/bat[.,4]..calderatyrant[110,170]). Camino al 45º flag (serializa tras #102 GEARCHANCE_SURGE LIVE&served ba2bf2c81434/815).
//  · PRE-FLIGHT GATE (recomendado del issue = GOLD_SURGE ETPL[type].gold) → PASA sin pivote del EJE (pero PIVOTE del NOMBRE DE CANAL: el issue propuso `goldFind`, PERO `goldFind` YA existe — es el canal del multiplicador de ORO-RECOGIDO de KINSHIP_BOND #60 [pickup de monedas], config.js:2493. Reusarlo COLISIONARÍA. Pivoté el canal a `coinFind` FRESCO [fichas de moneda por REMATAR a un mob de bolsa gorda — NINGUNA de las 44 flags #59-#102 lo usa], distinto por CONSTRUCCIÓN de goldFind [multiplicador de oro-recogido] y de essenceFind [#72]). El EJE `gold` es un campo CANÓNICO de MAGNITUD DE DROP DE ORO base (RANGO [min,max] de enteros) en las filas de ETPL. Reduzco a ESCALAR ESTÁTICO por template goldOf=ETPL[type].gold[1] (el TECHO de la bolsa, la magnitud máxima de moneda), server-auth (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG EN EL READ usado para bandear — bandeo sobre el VALOR ESTÁTICO del template, NO sobre la tirada ri(gold[0],gold[1]) que rueda la cantidad real al caer), y NINGUNA de las 44 flags #59-#102 lo lee como SCORE de recompensa: los ÚNICOS lectores de `.gold` son (a) la SIEMBRA DEL DROP de oro al morir (`ri(tpl.gold[0],tpl.gold[1])` sim.js:6435 — rueda la CANTIDAD, se consume DENTRO de la rama de loot, NO puntúa banda), (b) los modificadores de AFIJO/CAMPEÓN que MULTIPLICAN el CLON e.tpl.gold por goldMul (sim.js:2410/2392 — mutan la magnitud del clon, no la puntúan como peso), y (c) los probes dev. NI UN SOLO `*Weight`/seam de recompensa de las 44 flags previas lo puntúa (spoilsWeights #79 lee el `kind:"gold"` de un DROP YA en el suelo — densidad de vecindad — NO ETPL[type].gold). CRUX ⊥#72 SCARCITY (el riesgo señalado): #72 lee ETPL[type].xp como MAGNITUD DE ESENCIA (esencia por kill = round(scarcityMul(zone)*tpl.xp), canal essenceFind), NO gold — son CAMPOS DISTINTOS de ETPL. Y la banda de gold NO es proxy de xp: DENTRO de la banda modest (weight1, gold[1] 15-22) el xp NO es co-monótono con gold — bandit gold[1]21/xp30 vs orc gold[1]20/xp40 (MÁS oro, MENOS xp) ⇒ SCARCITY varía DENTRO de una banda de gold fija ⇒ NO co-monótono ⇒ ⊥#72 PROBADO. gold=MAGNITUD de MONEDA (canal coinFind), #72=MAGNITUD de ESENCIA (canal essenceFind) — dimensiones y monedas ortogonales. CRUX ⊥#102 GEARCHANCE (base LIVE): #102 lee ETPL[type].gearChance como PROBABILIDAD DE SOLTAR EQUIPO (¿cae gear?), gold es CUÁNTA MONEDA cae — CAMPOS DISTINTOS. La banda de gold NO es proxy de gearChance: DENTRO de la banda modest (gold[1] 15-22): orc gold[1]20/gearChance0.30(gear2/ARSENAL) vs mage gold[1]20/gearChance0.26(gear1/kitted) — MISMO gold[1]=20, DISTINTA banda de gearChance ⇒ gold ⊥ gearChance ⇒ ⊥#102 PROBADO.
//  · ⊥override BASE no clon: goldWeight lee ETPL[e.type].gold[1] BASE (la fila INMUTABLE), NO el CLON e.tpl.gold — si un spawn afijado/campeón MULTIPLICA el CLON (goldMul 1.6-1.7 sim.js:2410/2392), goldOf lo IGNORA y lee la fila base ⇒ un orco Vampírico SIGUE modest base[11,20]. applyZoneScale escala hp/dmg/spd/xp pero NUNCA gold (sim.js:2298 — gold NO está en el clone) ⇒ bolsa INDEPENDIENTE de zona (⊥#91).
//  · ⊥44 (CRUX): eje MAGNITUD DE ORO/BOTÍN DE MONEDA ESTÁTICA del TIPO de mob (cuánta bolsa carga de fábrica), NO probabilidad-de-gear/distancia-de-salto/recobro/amago/impacto/vigilancia/aguante/daño/rapidez/rol/tamaño/valor-xp/área/vida-fracción/conteo/geometría/estado-dinámico/alcance/dirección. ⊥ #102 GEARCHANCE [PROB DE SOLTAR EQUIPO ETPL[type].gearChance; orc gold[1]20 modest/gearChance0.30 gear2 vs mage gold[1]20 modest/gearChance0.26 gear1 — MISMO gold DISTINTO gear]. ⊥ #101 LUNGE [DISTANCIA DE ESTOCADA ETPL[type].lunge; bandit lunge132(lunge2)/gold[1]21(modest) vs moose lunge0(sin lunge)/gold[1]24(opulent) ORDEN OPUESTO]. ⊥ #100 RECOVER [VENTANA DE RECUPERACIÓN; revenant recover0.55/gold[1]28(opulent) vs bat recover0.35/gold[1]4(pauper)]. ⊥ #99 WINDUP [PRESAGIO; volatile windup0.7/gold[1]8(pauper) vs bandit windup0.5/gold[1]21(modest) ORDEN OPUESTO]. ⊥ #98 RAM [IMPACTO/knock; moose knock200(ram2)/gold[1]24(opulent) vs revenant knock120(ram1)/gold[1]28(opulent) MISMA banda gold distinto ram]. ⊥ #97 SENTINEL [VIGILANCIA/aggro; ironback aggro220(sentinel0)/gold[1]22(modest) vs summoner aggro330(sentinel2)/gold[1]18(modest) MISMA banda gold OPUESTO sentinel]. ⊥ #96 TOUGH [AGUANTE/HP; volatile hp26/gold[1]8(pauper) vs revenant hp120/gold[1]28(opulent); DENTRO de modest spearman hp42 vs ironback hp112]. ⊥ #95 MENACE [DAÑO; summoner dmg0(menace0)/gold[1]18(modest) vs volatile dmg23(menace2)/gold[1]8(pauper) OPUESTO — inerme-pero-adinerado vs peligroso-pobre]. ⊥ #94 SWIFT [VELOCIDAD ETPL[type].spd; volatile spd152(swift2)/gold[1]8(pauper) vs orc spd64(swift0)/gold[1]20(modest) DIAMETRAL]. ⊥ #93 ROLE [arch CATEGÓRICO; DENTRO de arch:"brute" — orc/ironback/magmabrute gold modest/opulent barre; casters ranged mage[1]20/wraith17/thornspitter18 modest vs summoner arch:"summoner" gold18 modest ⇒ gold NO es re-map de arch]. ⊥ #92 BULK [TAMAÑO ETPL[type].size; skeleton sz20/gold[1]9(pauper) vs summoner sz20/gold[1]18(modest) MISMO size DISTINTA banda gold]. ⊥ #89 INTERRUPT [ESTADO DE ACCIÓN e.state DINÁMICO — NUNCA el NÚMERO .gold; GOLD puntúa el ESCALAR ETPL[type].gold[1] BASE del TIPO]. ⊥ #84 ESCARAMUZA [CLASE DE ALCANCE e.tpl.ranged; casters ranged mage gold[1]20 modest pero demon RANGED gold[1]28 opulent y wolf MELEE gold[1]6 pauper ⇒ clase-de-alcance ⊥ bolsa]. ⊥ #72 SCARCITY [xp como MAGNITUD de esencia; DENTRO de modest bandit gold[1]21/xp30 vs orc gold[1]20/xp40 MÁS oro MENOS xp ⇒ NO co-monótono]. ⊥ WORTH/xp [valor ETPL[type].xp — mismo argumento ⊥#72]. ⊥ #91 ZONE-TIER [dificultad del ÁREA; applyZoneScale NUNCA escala gold]. ⊥ #90 EMBESTIDA [DIRECCIÓN/heading DINÁMICA]. ⊥ #88 REMATE [DISTANCIA hero↔víctima al morir]. ⊥ #87 MANADA [clustering]. ⊥ #86 SIEGA [FRACCIÓN DE VIDA DINÁMICA]. ⊥ #85 CC [e.stun/e.slowT]. ⊥ #74 AFIJO/⊥campeón [MULTIPLICAN el CLON e.tpl.gold vía goldMul; goldWeight lee ETPL[type].gold[1] BASE — orc Vampírico SIGUE modest base[11,20]]. ⊥ #79 BOTÍN/SPOILS [G.drops YA en el suelo — spoilsWeights lee kind:"gold" de un objeto DESPUÉS de caer/densidad de vecindad; gold ETPL=magnitud ANTES de sembrar]. ⊥ #60 KINSHIP goldFind [MULTIPLICADOR de oro-RECOGIDO en el pickup de monedas; GOLD es la MAGNITUD BASE del TIPO al MORIR, canal coinFind distinto]. ⊥ #73 APEX/#78 FURIA/#2426 SHADOW_STALK/CADENCE #67/FRENZY/COMBO. ⊥ nivel/edad/sigilo/terreno/clima/tiempo/social/territorial/backstab-facing.
export const GOLD_SURGE = {
  enabled: true,             // LIVE — EVO#103 (45º flag). CAS-2617 LIVE FLIP false→true (config-only 1-line) tras CEO Gate 1/2 (selfverify 22/22) + DARK QA Gate 2/2 (INDEP 9/9). Base master HEAD post-#102 5fde19d.
  channel: "coinFind",       // canal FRESCO (recompensa de fichas de moneda por rematar a un mob de BOLSA GORDA — el que carga buen botín de oro de fábrica, cuya alta magnitud de moneda aprendiste a cazar) — NINGUNA de las 44 flags #59-#102 lo usa. PIVOTE del nombre: el issue propuso `goldFind` PERO YA existe (multiplicador de oro-recogido de KINSHIP_BOND #60, config.js:2493) ⇒ colisión ⇒ pivoté a `coinFind` FRESCO. La familia recompensa-de-forrajeo EXISTENTE (goldFind/lootQuality/xpGain/essenceFind/…/gearFind #102) está LLENA ⇒ fichas de moneda es una moneda FRESCA, transitoria, fuera del save + fingerprint. Fuente ÚNICA (seam de kill) ⇒ máximo-único trivial, sub-cap propio. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX goldWeight sobre los mobs VIVOS en radio (el mob de bolsa más gorda rematable ahora). El GRANT REAL usa la gold-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiGold: 23,                // umbral de GOLD BASE (gold[1], techo de la bolsa) para la banda opulent/bolsa-gorda (opulent, peso 2): moose[.,24]/wendigo[.,26]/magmabrute[.,26]/revenant[.,28]/demon[.,28] + jefes golem/bogtyrant[.,90/140]/dragon[.,140]/calderatyrant[.,170]. Hueco disjunto limpio 22→24 (entre el clúster brute/charger 22 y moose 24). CEO balance knob.
  midGold: 12,               // umbral de GOLD BASE (gold[1]) para la banda modest/bolsa-media (modest, peso 1): spearman[.,15]/wraith[.,17]/healer[.,17]/mudlurker[.,17]/summoner[.,18]/wisp[.,18]/thornspitter[.,18]/orc[.,20]/mage[.,20]/ashwraith[.,20]/bandit[.,21]/emberkin[.,21]/charger[.,22]/toadbrute[.,22]/ironback[.,22]. <midGold = bolsa-flaca ⇒ 0 (rat[.,4]/bat[.,4]/wolf[.,6]/volatile[.,8]/skeleton[.,9]/quillback[.,9]). Hueco disjunto limpio 9→15 (entre skeleton/quillback 9 y spearman 15). CEO balance knob.
  weights: { opulent: 2, modest: 1 },   // PESO de un remate por la BANDA DE GOLD BASE del TIPO del mob: OPULENT/bolsa-gorda (gold[1]≥hiGold) pesa 2; BOLSA MEDIA (gold[1]≥midGold) pesa 1; bolsa-flaca (gold[1]<midGold) ⇒ 0. Reward = rematar al mob de BOLSA GORDA que raras veces te deja ir sin un buen pellizco de monedas. CEO balance knobs.
  coinBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de moneda por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE GOLD (score∈{0,1,2}). Más bolsa/opulent = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (bolsa-flaca) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado de BOLSA MEDIA): +1 ficha de moneda por kill. "cazaste un mob de bolsa media".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado OPULENT/bolsa-gorda): +2 fichas por kill. "cazaste al mob de bolsa más gorda". CEO balance knobs.
  ],
};

// CAS-2620: REMATE DE ESTALLIDO (SPLASH_SURGE, EVO#104 DARK) — EJE FRESCO RADIO DE ATAQUE DE ÁREA/SALPICADURA INTRÍNSECO del mob TYPE server-auth (el TAMAÑO del golpe de área/pisotón sísmico que suelta su TIPO al atacar — el brutón de estallido ANCHO cuyo ground-slam barre medio claro vs el que sólo golpea de punto). Sólo la fila BASE de ETPL define `aoe` — presente EXCLUSIVAMENTE en 4 templates brute (orc:60/ironback:64/magmabrute:66/moose:68), 0/ausente en TODOS los demás. Camino al 46º flag (serializa tras #103 GOLD_SURGE LIVE&served 3348f9ede902/815).
//  · PRE-FLIGHT GATE (recomendado del issue = SPLASH_SURGE ETPL[type].aoe) → PASA sin pivote del EJE ni del NOMBRE: `aoe` es un ESCALAR ESTÁTICO por template (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG) y NINGÚN `*Weight`/seam de recompensa de las 45 flags #59-#103 lo lee como SCORE — los ÚNICOS lectores de `.aoe` en ETPL son la máquina de COMBATE del mob (el radio geométrico del golpe de área cuando ataca; NO puntúa banda de recompensa) y los probes dev. OJO: `aoe` TAMBIÉN aparece en (a) una habilidad de clase `fireball` (aoe:48, config.js:116) y (b) un ítem consumible `firebomb` (aoe:26, ~config.js:3646) — NINGUNO es ETPL[type].aoe (splashWeight lee ETPL[e.type].aoe del TIPO del mob VÍCTIMA, no habilidades/ítems). Canal FRESCO `splashFind` (fichas de estallido por REMATAR a un brutón de área ancha) — NINGUNA de las 45 flags lo usa; recurso TRANSITORIO NUEVO h.blastBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio, badge ◎.
//  · CRUX ⊥#93 ROLE (arch): los 4 portadores de aoe son TODOS arch:"brute" (misma CATEGORÍA de IA) PERO caen en bandas de aoe DISTINTAS — orc(aoe60)/ironback(aoe64) mid(peso1) vs moose(aoe68)/magmabrute(aoe66) wide(peso2). #93 asigna a TODO brute el MISMO peso de rol; SPLASH SUB-DIVIDE la categoría brute (información que arch NO expresa) ⇒ ⊥#93 (mismo patrón que #101 LUNGE, donde 4 rushers de arch idéntico barren lunge 0/1/2).
//  · CRUX ⊥#98 RAM (knock): aoe = RADIO de salpicadura (geometría del área) vs knock = FUERZA de empuje (impulso del impacto) — CAMPOS DISTINTOS. Par divergente: moose knock200/aoe68(wide) vs ironback knock200/aoe64(mid) — MISMO knock=200, DISTINTA banda de aoe ⇒ NO co-monótono ⇒ ⊥#98 PROBADO.
//  · CRUX ⊥#96 TOUGH (hp) / ⊥#103 GOLD (gold[1]): la banda 0 (sin aoe) ABARCA TODO el rango de hp (rat hp~10 .. jefes hp640/820) y de gold (bat gold[1]4 .. dragon/calderatyrant gold[1]140/170) — un jefe hp820/gold170 cae en banda 0 (sin aoe) mientras orc hp96/gold20 cae en banda 1 ⇒ MÁS hp/gold, MENOR banda splash ⇒ NO co-monótono a nivel de banda ⇒ ⊥#96/⊥#103 PROBADO. DENTRO de carriers non-monótono extra: magmabrute gold[1]26/aoe66 vs moose gold[1]24/aoe68 (MÁS oro MENOS área). ⊥#92 BULK: size 26(moose)→wide vs size 28(ironback)→mid ⇒ MÁS tamaño MENOR banda splash. ⊥#84 ESCARAMUZA: aoe sólo en 4 brutes MELEE, 0 en TODO ranged y en la MAYORÍA de melee (rat/wolf aoe0) ⇒ la banda 0 mezcla melee y ranged ⇒ aoe ⊥ binario melee/ranged (⊥ `range`/`projspd` que SÍ co-varían con la clase). aoe=RADIO DE ÁREA, ⊥ probabilidad-gear(#102)/oro(#103)/lunge(#101)/recobro(#100)/amago(#99)/impacto(#98)/vigilancia(#97)/hp(#96)/daño(#95)/velocidad(#94)/rol(#93)/tamaño(#92)/xp(#72)/alcance(#84).
export const SPLASH_SURGE = {
  enabled: true,             // LIVE — EVO#104 (46º flag, CAS-2623). Flipped false→true tras CEO Gate 2/2 PASS @42723db (DARK QA CAS-2621 fp 15920977 0-desync). Config-only 1-line flip.
  channel: "splashFind",     // canal FRESCO (recompensa de fichas de estallido por rematar a un brutón de ÁREA ANCHA — el que carga un ground-slam de radio grande de fábrica, cuyo estallido aprendiste a cazar) — NINGUNA de las 45 flags #59-#103 lo usa. Distinto por CONSTRUCCIÓN de coinFind #103 [magnitud de oro], gearFind #102 [prob gear], goldFind #60 [oro-recogido], essenceFind #72 [esencia]. Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX splashWeight sobre los mobs VIVOS en radio (el brutón de estallido más ancho rematable ahora). El GRANT REAL usa el aoe-base propio de la víctima (sin cap de radio). CEO balance knob.
  hiAoe: 66,                 // umbral de AOE BASE (ETPL[type].aoe) para la banda wide/estallido-ancho (wide, peso 2): magmabrute(66)/moose(68). Hueco disjunto limpio 64→66 (entre ironback 64 y magmabrute 66). CEO balance knob.
  midAoe: 60,                // umbral de AOE BASE para la banda mid/estallido-medio (mid, peso 1): orc(60)/ironback(64). <midAoe = sin salpicadura útil ⇒ 0 (TODO mob sin `aoe`: rat/bat/wolf/skeleton/… + jefes). Hueco disjunto limpio 0→60 (nadie entre 0 y 60). CEO balance knob.
  weights: { wide: 2, mid: 1 },   // PESO de un remate por la BANDA DE AOE BASE del TIPO del mob: WIDE/estallido-ancho (aoe≥hiAoe) pesa 2; MEDIO (aoe≥midAoe) pesa 1; sin-área (aoe<midAoe) ⇒ 0. Reward = rematar al brutón de estallido ancho cuyo golpe de área aprendiste a leer. CEO balance knobs.
  blastBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de estallido por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE AOE (score∈{0,1,2}). Más área/wide = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (sin área) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (brutón rematado de ÁREA MEDIA): +1 ficha de estallido por kill. "cazaste un brutón de estallido medio".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (brutón rematado de ÁREA ANCHA/wide): +2 fichas por kill. "cazaste al brutón de estallido más ancho". CEO balance knobs.
  ],
};

// CAS-2627: REMATE DE PONZOÑA (BANE_SURGE, EVO#105 DARK) — EJE FRESCO DURACIÓN DE LA AFLICCIÓN/DEBUFF QUE INFLIGE EL ATAQUE del mob TYPE server-auth (cuán DURADERA es la ponzoña/veneno/quemadura/ralentización que su TIPO deja pegada al golpearte — el bicho cuya picadura te envenena por más tiempo vs el que sólo pega sin dejar secuela). Sólo la fila BASE de ETPL define `infl` (config.js:303+): presente EXCLUSIVAMENTE en 4 mobs — bandit(poison dur4.0, MELEE rusher)/thornspitter(poison dur3.5, RANGED caster)/emberkin(burn dur2.6, RANGED caster)/wraith(slow dur2.2, RANGED caster); ausente/undefined en TODOS los demás. Camino al 47º flag (serializa tras #104 SPLASH_SURGE LIVE&served 7cf773339112/815).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (meleeR = alcance de garra melee del híbrido warlock) → FALLA ⇒ PIVOTE a NUEVA FAMILIA DE EJE. `meleeR` existe SÓLO en 3 mobs (demon54/wendigo50/wisp46) y los TRES son arch:"warlock" ranged-híbridos ⇒ banda>0 ⟺ arch:"warlock" ⇒ una banda de meleeR sería un RE-MAP del arquetipo warlock (COLISIÓN con #93 ROLE) Y de la clase ranged (COLISIÓN con #84 ESCARAMUZA) ⇒ NO ⊥ ⇒ RECHAZADO. PIVOTE al eje FRESCO DURACIÓN DE AFLICCIÓN infl.dur: los 4 portadores MEZCLAN melee (bandit) + ranged (thornspitter/emberkin/wraith) y arquetipos rusher (bandit) + caster (los otros 3) ⇒ la pertenencia a banda NO es proxy ni de ranged (#84) ni de arch (#93). `infl.dur` es un ESCALAR ESTÁTICO por template (constante de ETPL, replicada del mismo config, NO wall-clock, NO estado de cliente, NO RNG) y NINGÚN *Weight/seam de recompensa de las 46 flags #59-#104 lo lee como SCORE — los ÚNICOS lectores de ETPL[type].infl son la máquina de COMBATE del mob (damageHero→statusOrBuildup aplica el DoT/slow/stun AL HÉROE cuando el mob golpea — comportamiento, NO puntúa banda) y los probes dev. OJO: `infl` TAMBIÉN aparece en (a) proyectiles de hechizo del héroe (sp.status, sim.js:7211), (b) el slam de fase-2 del jefe firma (S.infl marcado _sb, sim.js:8790), (c) la bomba/cuchillo throwable (sim.js:8294) — NINGUNO es ETPL[type].infl (baneWeight lee ETPL[e.type].infl.dur del TIPO del mob VÍCTIMA, no proyectiles/hechizos/jefes-slam). Canal FRESCO `baneFind` (fichas de ponzoña por REMATAR a un mob de aflicción duradera) — NINGUNA de las 46 flags lo usa; recurso TRANSITORIO NUEVO h.baneBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio baneBountyCap, badge ☣.
//  · CRUX ⊥#84 ESCARAMUZA (clase de alcance e.tpl.ranged): los 4 portadores MEZCLAN melee+ranged — tier2 = {bandit MELEE(range48), thornspitter RANGED(range230)} MISMO tier, clase OPUESTA; tier1 = {emberkin RANGED, wraith RANGED}; banda0 MEZCLA melee (wolf/rat/orc sin infl) y ranged (mage/spearman/wisp sin infl) ⇒ pertenencia a banda ⊥ binario melee/ranged ⇒ ⊥#84 PROBADO.
//  · CRUX ⊥#93 ROLE (arch): los portadores SPAN arch:"rusher"(bandit) + arch:"caster"(thornspitter/emberkin/wraith) PERO NO son TODOS los rushers (wolf/rat/bat/mudlurker rushers SIN infl ⇒ banda0) NI TODOS los casters (mage/spearman/wisp/ashwraith casters SIN infl ⇒ banda0). DENTRO de arch:"caster": thornspitter dur3.5(tier2) vs wraith dur2.2(tier1) vs mage sin-infl(tier0) ⇒ MISMO arch, 3 bandas DISTINTAS ⇒ infl NO es re-map de arch ⇒ ⊥#93 PROBADO (patrón #104 SPLASH sub-dividía brute; aquí infl sub-divide caster Y cruza a rusher).
//  · CRUX ⊥#101 LUNGE (distancia de estocada): bandit carga AMBOS lunge132(lunge2) e infl(poison dur4/tier2), PERO los otros portadores de lunge (wolf lunge118, mudlurker lunge126) NO tienen infl ⇒ banda0; y los otros portadores de infl (thornspitter/emberkin/wraith) NO tienen lunge ⇒ soportes {lunge}≠{infl} ⇒ ⊥#101.
//  · CRUX ⊥#102 GEARCHANCE / ⊥#72 SCARCITY: los 4 portadores de infl comparten gearChance0.26(gear1) PERO barren infl.dur 2.2→4.0 (bandit4.0/thornspitter3.5/emberkin2.6/wraith2.2) ⇒ aflicción varía DENTRO de gearChance FIJO ⇒ ⊥#102. Y dentro de tier2: bandit dur4.0/xp30 vs thornspitter dur3.5/xp34 (MÁS aflicción MENOS xp) ⇒ NO co-monótono con xp ⇒ ⊥#72. ⊥#85 CC: #85 lee el ESTADO DINÁMICO del héroe (e.stun/e.slowT — ¿está el héroe CC-eado AHORA?); BANE lee el ESCALAR ESTÁTICO ETPL[type].infl.dur (la capacidad INNATA del TIPO de dejar una aflicción, sea cual sea el estado runtime) ⇒ constante de template ⊥ estado dinámico. ⊥override BASE no clon: baneOf lee ETPL[e.type].infl.dur BASE (la fila INMUTABLE) — los afijos (MOB_AFFIX: swift/armored/vampiric/volatile/frost) NO añaden `infl` al clon (mutan hp/spd/dmgReduce/lifesteal/blast/gearBonus, NUNCA infl) y applyZoneScale escala hp/dmg/spd/xp pero NUNCA infl ⇒ aflicción INDEPENDIENTE de afijo/zona (⊥#74/#91). ⊥ #104 SPLASH (aoe; portadores DISJUNTOS: 4 brutes con aoe SIN infl vs 4 afligidores con infl SIN aoe ⇒ complementarios). ⊥ #103 GOLD/#100 RECOVER/#99 WINDUP/#98 RAM/#97 SENTINEL/#96 TOUGH/#95 MENACE/#94 SWIFT/#92 BULK (dentro de un tier fijo de infl.dur los valores de gold/recover/windup/knock/aggro/hp/dmg/spd/size barren — p.ej. tier2 bandit knock110/windup0.5/recover0.55/aggro250/hp60/dmg18/spd106/size19 vs thornspitter knock55/windup0.85/recover0.8/aggro320/hp52/dmg14/spd66/size24). ⊥ #89 INTERRUPT (e.state DINÁMICO categoría NUNCA el NÚMERO infl.dur). ⊥ #91 ZONE-TIER. ⊥ #90/#88/#87/#86/#79/#60/#73/#78/#2426/CADENCE#67/FRENZY/COMBO. La aflicción-que-INFLIGE (infl.dur, canal baneFind) es una dimensión FRESCA: cuán duradera es la secuela que su golpe te deja pegada.
export const BANE_SURGE = {
  enabled: true,             // LIVE (EVO#105, 47º flag) — CAS-2630 flip false→true (Remate de Ponzoña). CEO Gate 1/2 PASS + DARK QA 21/21 (Gate 2/2 input) + CEO Gate 2/2 PASS. Base master HEAD post-#104 / served 7cf773339112/815 (#104 SPLASH_SURGE LIVE) → advances on deploy.
  channel: "baneFind",       // canal FRESCO (fichas de ponzoña por rematar a un mob cuya AFLICCIÓN dura más — veneno/quemadura/ralentización que su golpe te deja pegada) — NINGUNA de las 46 flags #59-#104 lo usa. Distinto por CONSTRUCCIÓN de splashFind #104/coinFind #103/gearFind #102/goldFind #60/essenceFind #72. Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) SÓLO del badge/VM: la señal VIVA = MAX baneWeight sobre los mobs VIVOS en radio (el afligidor de secuela más larga rematable ahora). El GRANT REAL usa la infl.dur-base propia de la víctima (sin cap de radio). CEO balance knob.
  hiBane: 3.5,               // umbral de DUR BASE (ETPL[type].infl.dur, segundos) para la banda virulent/aflicción-larga (virulent, peso 2): bandit(4.0)/thornspitter(3.5). Hueco disjunto limpio 2.6→3.5 (entre emberkin2.6 y thornspitter3.5). CEO balance knob.
  midBane: 2.2,              // umbral de DUR BASE para la banda noxious/aflicción-media (noxious, peso 1): emberkin(2.6)/wraith(2.2). <midBane = sin secuela útil ⇒ 0 (TODO mob sin `infl`: rat/bat/wolf/orc/mage/… + jefes). Hueco disjunto limpio 0→2.2 (nadie entre 0 y 2.2). CEO balance knob.
  weights: { virulent: 2, noxious: 1 },   // PESO de un remate por la BANDA DE DUR BASE del TIPO del mob: VIRULENT/aflicción-larga (dur≥hiBane) pesa 2; MEDIA (dur≥midBane) pesa 1; sin-aflicción (dur<midBane) ⇒ 0. Reward = rematar al afligidor cuya secuela más duradera aprendiste a temer. CEO balance knobs.
  baneBountyCap: 2,          // SUB-CAP DURO PROPIO de las fichas de ponzoña por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DUR (score∈{0,1,2}). Aflicción MÁS larga/virulent = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (sin aflicción) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (mob rematado de AFLICCIÓN MEDIA): +1 ficha de ponzoña por kill. "cazaste un afligidor de secuela media".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (mob rematado de AFLICCIÓN LARGA/virulent): +2 fichas por kill. "cazaste al afligidor de secuela más duradera". CEO balance knobs.
  ],
};

// CAS-2634: REMATE DE RALEA ABIGARRADA (MOTLEY_SURGE, EVO#106 DARK) — EJE FRESCO DIVERSIDAD/HETEROGENEIDAD DE ESPECIES de la MANADA VIVA que rodea al héroe (nº de TIPOS de mob DISTINTOS — e.type, identidad ESTÁTICA de spawn — entre los mobs VIVOS en radio en el instante del kill: rematar en medio de una HUESTE ABIGARRADA de muchas criaturas distintas [rata+orco+murciélago+mago] vs una CARDUMEN MONÓTONA de un solo tipo [5 ratas]). Camino al 48º flag (serializa tras #105 BANE_SURGE LIVE&served 8e1b7d472e89/815, base HEAD 9b39af1).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (infl.mag = magnitud/daño de la aflicción) → **FALLA** ⇒ PIVOTE a la FAMILIA de eje bendecida por el issue (pack/composición). NO existe campo `infl.mag`: los 4 portadores de `infl` usan `dmg` (poison/burn) o `amt` (slow) — bandit(poison dmg:4), thornspitter(poison dmg:4), emberkin(burn dmg:4), wraith(slow amt:0.5, SIN dmg). La magnitud de daño es UNIFORME (dmg:4 en los 3 afligidores de DoT) y el 4º (wraith) usa OTRA unidad (amt≠dmg) ⇒ 0 valores distintos band-ables ⇒ NO se puede bandear ⇒ RECHAZADO. Y `infl.type` (poison/burn/slow) COLISIONA con #105 BANE (poison={bandit,thornspitter}==banda virulent de #105) ⇒ tampoco. PIVOTE al eje FRESCO DIVERSIDAD DE ESPECIES del pack VIVO: un ESCALAR AGREGADO (cardinalidad del CONJUNTO de tipos) que NINGUNA de las 47 flags #59-#105 lee como SCORE.
//  · CRUX ⊥#87 PACKHARVEST (COHESIÓN/CONTEO de vecinos): #87 cuenta el Nº DE MOBS apiñados (densidad cruda); MOTLEY cuenta el nº de TIPOS DISTINTOS (cardinalidad). 5 ratas apiñadas = #87 alto (count5)/MOTLEY 0 (1 tipo); {rata,orco,murciélago} sueltos = #87 bajo/MOTLEY 2 (3 tipos) ⇒ DIAMETRALMENTE OPUESTOS ⇒ ⊥#87 PROBADO (conteo ⊥ variedad).
//  · CRUX ⊥#84 SKIRMISH_LINE (COMPOSICIÓN DE ALCANCE ranged del pack): #84 cuenta la FRACCIÓN de vecinos A DISTANCIA (e.tpl.ranged, una CATEGORÍA binaria); MOTLEY cuenta TIPOS DISTINTOS sin importar la clase. {mage,mage,mage} = #84 máximo (3 ranged)/MOTLEY 0 (1 tipo); {rata,orco,murciélago} TODOS melee = #84 0 (0 ranged)/MOTLEY 2 (3 tipos) ⇒ OPUESTOS ⇒ ⊥#84 PROBADO (fracción-de-categoría ⊥ cardinalidad-de-identidad).
//  · CRUX ⊥ ERUDICIÓN/loreVariety (nº de tipos de enemigo DISTINTOS ABATIDOS en una VENTANA TEMPORAL, canal xpGain, per-pid con DECAY): MOTLEY es un snapshot ESPACIAL INSTANTÁNEO de la manada VIVA que te RODEA AHORA — 0 historial, 0 acumulador, 0 marcas per-pid, 0 decay. Abatir 3 especies UNA-A-UNA en un campo VACÍO ⇒ Erudición 3/MOTLEY 0 (0 vecinos vivos en cada kill); rematar UNA rata rodeado de un trío VIVO {orco,murciélago,mago} ⇒ MOTLEY 3/Erudición baja (sólo mataste ratas) ⇒ CONTENEDORES DISJUNTOS (log temporal de KILLS ⊥ conjunto espacial de VIVOS).
//  · CRUX ⊥ DIVERSE_COMPANY #53/confDiversity (nº de CLASES DE HÉROE distintas en el roster de una zona, canal restedMult passive): MOTLEY lee tipos de ENEMIGO (G.enemies), NO clases de HÉROE — CLASE DE ENTIDAD DISTINTA + canal DISTINTO (motleyFind kill-bounty vs restedMult passive). ⊥ trailVariety (Trailcraft: nº de BIOMAS distintos pisados en ventana — terreno, temporal). ⊥ #83 BLIGHT [DoT-densidad e.dots DINÁMICO]/#85 CONTROL [CC e.stun/e.slowT DINÁMICO]/#86 BLOODHARVEST [fracción de vida e.hp/e.maxHp DINÁMICO]: MOTLEY es HEALTH/STATUS-AGNÓSTICO — lee sólo la IDENTIDAD DE TIPO ESTÁTICA (e.type inmutable), NUNCA el estado runtime del vecino. ⊥ #79/#80/#81/#82 [campos de suelo: drops/cadáveres/proyectiles/zonas — NO mobs]. ⊥override/⊥#74 AFIJO/⊥#91 ZONA: e.type es la identidad de spawn INMUTABLE (MOB_AFFIX muta hp/spd/dmg del clon, applyZoneScale escala hp/dmg/spd/xp — NINGUNO cambia e.type) ⇒ diversidad INDEPENDIENTE de afijo/zona. Canal FRESCO `motleyFind` (fichas de ralea por REMATAR rodeado de una hueste heterogénea) — NINGUNA de las 47 flags lo usa; recurso TRANSITORIO NUEVO h.motleyBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio motleyBountyCap, badge 🎭.
export const MOTLEY_SURGE = {
  enabled: true,             // LIVE (EVO#106, 48º flag) — CAS-2637 flip. CEO Gate 1/2 PASS (4e03c21d) + DARK QA PASS 17/17 (CAS-2635 9f0daa7a) + CEO Gate 2/2 PASS (005cf3c5). Reversible true→false = DARK.
  channel: "motleyFind",     // canal FRESCO (fichas de ralea por rematar rodeado de una MANADA HETEROGÉNEA de muchas ESPECIES distintas) — NINGUNA de las 47 flags #59-#105 lo usa. Distinto por CONSTRUCCIÓN de baneFind #105/splashFind #104/coinFind #103/gearFind #102/packFind #87 (cohesión-conteo). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el SCORE = nº de TIPOS DISTINTOS entre los mobs VIVOS cuyo centro cae dentro del radio del héroe. Mirror #87/#105 radius. CEO balance knob.
  hiMotley: 3,               // umbral de nº de TIPOS DISTINTOS para la banda motley/ralea-abigarrada (peso 2): ≥3 especies vivas en radio (hueste genuinamente variada). CEO balance knob.
  midMotley: 2,              // umbral de nº de TIPOS DISTINTOS para la banda mixta (peso 1): ≥2 especies. <midMotley (0 ó 1 tipo = cardumen MONÓTONA/solitario) ⇒ 0. Umbrales ENTEROS disjuntos (cardinalidad es un entero). CEO balance knob.
  weights: { motley: 2, mixed: 1 },   // PESO de un remate por la BANDA de DIVERSIDAD del pack VIVO en radio: MOTLEY/abigarrada (≥hiMotley tipos) pesa 2; MIXTA (≥midMotley tipos) pesa 1; monótona/solitaria (<midMotley) ⇒ 0. Reward = rematar en medio de una hueste de muchas especies, no de una cardumen de un solo tipo. CEO balance knobs.
  motleyBountyCap: 2,        // SUB-CAP DURO PROPIO de las fichas de ralea por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DIVERSIDAD (score∈{0,1,2}). Hueste MÁS abigarrada = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (monótona/solitaria) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en manada MIXTA, ≥2 especies): +1 ficha de ralea por kill. "remataste en medio de una hueste mixta".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en RALEA ABIGARRADA, ≥3 especies): +2 fichas por kill. "remataste en medio de la hueste más abigarrada". CEO balance knobs.
  ],
};

// CAS-2640: REMATE DE HUESTE DISPERSA (DISPERSE_SURGE, EVO#107 DARK) — EJE FRESCO ESTRUCTURAL/GEOMÉTRICO DISPERSIÓN ESPACIAL de la MANADA VIVA que rodea al héroe (la AMPLITUD/SPREAD geométrico de la formación de mobs VIVOS en radio en el instante del kill: la distancia MEDIA de cada mob al CENTROIDE de la manada — una jauría APIÑADA en un blob tupido [spread bajo] vs una LÍNEA DE ESCARAMUZA desplegada/desparramada por medio claro [spread alto]). Un ESCALAR GEOMÉTRICO AGREGADO (escala INTENSIVA de la formación, invariante al conteo) derivado SÓLO de las POSICIONES replicadas de G.enemies. Camino al 49º flag (serializa tras #106 MOTLEY_SURGE LIVE&served 08a2a853adb1/815, base HEAD 5d4d2a6).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack SPATIAL DISPERSION/SPREAD) → **PASA sin pivote**: la dispersión = distancia MEDIA de los mobs VIVOS al CENTROIDE de la manada en radio es un ESCALAR GEOMÉTRICO band-able (formaciones normales rinden bandas DISTINTAS: enjambre melee anillado al héroe ⇒ spread bajo <midSpread; grupo suelto ⇒ medio; línea de hostigamiento ranged desplegada ⇒ spread alto ≥hiSpread — verificado por spawnDisperse en el harness) y NINGUNA de las 48 flags #59-#106 lo lee como SCORE. Los ÚNICOS lectores de POSICIÓN inter-mob de las 48 flags son #87 PACKHARVEST (cohesión LOCAL) y #84 SKIRMISH (filtro de radio) — ver cruxes ⊥ abajo.
//  · CRUX ⊥#87 PACKHARVEST (COHESIÓN/EMPAQUETAMIENTO inter-mob): #87 SUMA por-mob un peso de COHESIÓN LOCAL (nº de OTROS mobs dentro de cohesionR de CADA mob) ⇒ métrica EXTENSIVA/LOCAL que ESCALA con el conteo y premia el APIÑAMIENTO de vecindad-corta. DISPERSE mide la ESCALA GLOBAL de la formación (spread al centroide) ⇒ métrica INTENSIVA/GLOBAL invariante al conteo. NO son inversas monótonas: (a) 3 PAREJAS tupidas desplegadas LEJOS entre sí ⇒ #87 ALTO (cada mob tiene compañero cercano) PERO spread ALTO (formación ancha) ⇒ ambos altos; (b) un BLOB único tupido ⇒ #87 ALTO / spread BAJO ⇒ opuestos; (c) enjambre-5 tupido vs enjambre-10 tupido ⇒ spread IGUAL (ambos tupidos)/#87 DISTINTO (conteo) ⇒ ⊥ conteo. #87 no es monótona en spread ⇒ ejes INDEPENDIENTES.
//  · CRUX ⊥#106 MOTLEY (CARDINALIDAD de tipos): MOTLEY cuenta nº de e.type DISTINTOS; DISPERSE lee POSICIONES sin importar el tipo. 3 ratas APIÑADAS (motley1/spread bajo) vs 3 ratas DESPARRAMADAS (motley1/spread alto) ⇒ MOTLEY igual/DISPERSE distinto. {rata,orco,murciélago} tupido (motley2/spread bajo) vs desplegado (motley2/spread alto) ⇒ MOTLEY igual/DISPERSE distinto ⇒ ⊥ PROBADO (identidad-de-tipo ⊥ geometría).
//  · CRUX ⊥#84 SKIRMISH_LINE (FRACCIÓN ranged): #84 lee la CLASE DE ALCANCE (e.tpl.ranged), una CATEGORÍA de arquetipo; DISPERSE lee POSICIONES. 3 melee DESPARRAMADOS (skirmish0/spread alto) vs 3 ranged APIÑADOS (skirmish alto/spread bajo) ⇒ OPUESTOS ⇒ ⊥ (clase-de-arquetipo ⊥ geometría-de-formación).
//  · CRUX ⊥ APEX_PROXIMITY (distancia héroe↔apex, canal matFind): APEX lee la distancia hero↔UN depredador apex (relación de UNA entidad, canal matFind); DISPERSE lee el spread inter-mob de TODA la manada (canal disperseFind). ⊥ Erudición/loreVariety (log TEMPORAL de tipos abatidos — snapshot ESPACIAL instantáneo ⊥). ⊥ #83/#85/#86 (DoT/CC/vida-fracción DINÁMICOS del vecino — DISPERSE es health/status-AGNÓSTICO, lee sólo POSICIÓN). ⊥ #79/#80/#81/#82 (campos de suelo, NO mobs). ⊥override/⊥#74 AFIJO/⊥#91 ZONA (posición ≠ calidad/escala de spawn). Canal FRESCO `disperseFind` (fichas de dispersión por REMATAR en medio de una hueste DESPLEGADA/desparramada) — NINGUNA de las 48 flags lo usa; recurso TRANSITORIO NUEVO h.disperseBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio disperseBountyCap, badge ✳.
export const DISPERSE_SURGE = {
  enabled: true,             // LIVE (EVO#107, 49º flag) — CAS-2643 flip. CAS-2640 DARK build; CEO Gate 1/2 + DARK QA 17/17 + CEO Gate 2/2 all PASS. Byte-neutral seam already gated on `enabled`; flip false→true = LIVE.
  channel: "disperseFind",   // canal FRESCO (fichas de dispersión por rematar en medio de una MANADA DESPLEGADA/desparramada por el campo) — NINGUNA de las 48 flags #59-#106 lo usa. Distinto por CONSTRUCCIÓN de motleyFind #106 (cardinalidad de tipo)/packFind #87 (cohesión local)/skirmishFind #84 (fracción ranged)/baneFind #105/… Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el spread = distancia MEDIA al CENTROIDE de los mobs VIVOS cuyo centro cae dentro del radio del héroe. Mirror #87/#106 radius. CEO balance knob.
  minMobs: 2,                // nº MÍNIMO de mobs VIVOS en radio para que el spread esté DEFINIDO: con <2 mobs (0 ó 1) la dispersión es 0 ⇒ banda 0. Combinado con el filtro de muertos ⇒ ANTI-AUTO-CONTEO (un remate en solitario = 0 otros vivos = spread 0 ⇒ NO forrajea). CEO balance knob.
  midSpread: 55,             // umbral (px) de spread para la banda SUELTA (peso 1): distancia media al centroide ≥55px (formación desplegada). CEO balance knob.
  hiSpread: 110,             // umbral (px) de spread para la banda DISPERSA/desparramada (peso 2): distancia media al centroide ≥110px (línea de escaramuza ancha). <midSpread (blob tupido) ⇒ 0. Umbrales sobre ESCALA GEOMÉTRICA (float px). CEO balance knob.
  weights: { scatter: 2, loose: 1 },   // PESO de un remate por la BANDA de DISPERSIÓN de la formación VIVA en radio: DISPERSA/desparramada (spread ≥hiSpread) pesa 2; SUELTA (≥midSpread) pesa 1; apiñada/tupida (<midSpread) ⇒ 0. Reward = rematar en medio de una hueste DESPLEGADA, no de un blob apiñado. CEO balance knobs.
  disperseBountyCap: 2,      // SUB-CAP DURO PROPIO de las fichas de dispersión por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DISPERSIÓN (score∈{0,1,2}). Formación MÁS desplegada = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (blob apiñado/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en formación SUELTA, spread≥midSpread): +1 ficha de dispersión por kill. "remataste en medio de una hueste desplegada".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en hueste DISPERSA/desparramada, spread≥hiSpread): +2 fichas por kill. "remataste en medio de la formación más desplegada". CEO balance knobs.
  ],
};

// CAS-2645: REMATE DE FALANGE (FLANK_SURGE, EVO#108 DARK) — EJE FRESCO ESTRUCTURAL/GEOMÉTRICO CONCENTRACIÓN ANGULAR de la MANADA VIVA alrededor del héroe (cuán AMASADOS en UN SECTOR angular/flanco están los mobs VIVOS en radio en el instante del kill: una MURALLA/falange que embiste desde UN costado [concentración alta] vs una hueste que RODEA/cerca al héroe por todas direcciones [concentración baja]). MÉTRICA = la LONGITUD DEL VECTOR RESULTANTE MEDIO R∈[0,1] de los RUMBOS unitarios hero→mob (estadística circular pura): R≈1 ⇒ todos los mobs en el MISMO rumbo (falange masada en un flanco); R≈0 ⇒ rumbos repartidos/opuestos (cercado). Un ESCALAR GEOMÉTRICO ADIMENSIONAL AGREGADO (escala INTENSIVA de la formación, invariante al conteo) derivado SÓLO de las POSICIONES replicadas de G.enemies relativas al HÉROE. Camino al 50º flag (serializa tras #107 DISPERSE_SURGE LIVE&served b8b8c3ac28f7/815, base HEAD 33d8b07).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack CONVERGENCE = producto punto medio de la VELOCIDAD de cada mob hacia el héroe) → **FALLA** por DOS razones independientes ⇒ PIVOTE al ALTERNO bendecido por el issue (pack FORMATION DENSITY / concentración angular): (1) los enemigos NO tienen VECTOR de velocidad server-auth — e.vx/e.vy existen pero son INERTES para enemigos (documentado sim.js: 'e.vx/e.vy NO se integra en el movimiento enemigo'; el mov. enemigo = dir-persecución × ESCALAR e.tpl.spd + knockX/knockY) ⇒ NO hay |v| ni dirección-de-velocidad que puntear contra el rumbo-al-héroe. (2) La ÚNICA señal server-auth de "acercándose/alejándose" es la INTENCIÓN-DE-PASO (headingIntent), y #90 HEADING_SURGE (LIVE) YA puntúa el signo del producto punto de la intención-de-paso vs rumbo-al-héroe, con un badge VIVO que toma el MAX sobre la manada ⇒ una CONVERGENCIA basada en intención = re-mapeo agregado (MEDIA-vs-MAX) de #90 ⇒ NO ⊥. El ALTERNO angular es POSICIONAL PURO (health/status/motion-AGNÓSTICO) ⇒ ⊥#90.
//  · CRUX ⊥#107 DISPERSE (SPREAD RADIAL = distancia media al centroide, ESCALA de la formación): FLANK mide la CONCENTRACIÓN ANGULAR (¿en qué DIRECCIÓN están?), #107 mide el SPREAD RADIAL (¿qué tan LEJOS del centroide?). NO son inversas monótonas: una LÍNEA que radia hacia AFUERA en UN mismo rumbo (10/100/200px por el mismo azimut) ⇒ FLANK alto (R≈1, un solo rumbo) Y #107 spread ALTO (desplegada a lo largo de la línea) ⇒ ambos altos ⇒ INDEPENDIENTES; un anillo apretado uniforme a radio fijo ⇒ FLANK bajo (R≈0)/spread alto (centroide=héroe); un blob tupido a un lado ⇒ FLANK alto (R≈1)/spread bajo (todos juntos). Ángulo ⊥ escala radial.
//  · CRUX ⊥#59 WARDING_RING (cobertura angular de sectores): #59 mide la COBERTURA ANGULAR de los JUGADORES/presentes alrededor del CENTROIDE DE ELLOS (sectoresDistintos/sectors, canal wardRegen = regen HP SOSTENIDO con decay, STATEFUL, MULTIJUGADOR, recompensa REPARTO-uniforme). FLANK mide la CONCENTRACIÓN (R continuo, longitud resultante) de los MOBS ENEMIGOS alrededor del HÉROE (canal flankFind = fichas TRANSITORIAS por kill, STATELESS, single-player, recompensa AMASAMIENTO-en-un-sector). SEIS distinciones ⊥: (a) SUJETO mobs-enemigos vs jugadores-presentes; (b) REFERENCIA héroe vs centroide-de-jugadores; (c) POLARIDAD concentración-en-un-flanco vs cobertura-repartida (OPUESTAS); (d) MÉTRICA R-continuo (resultante) vs conteo-discreto-de-sectores; (e) CANAL flankFind-transitorio vs wardRegen-sostenido; (f) STATELESS/kill-instant vs STATEFUL/sostenido. ⊥ #58 CONVOY_MARCH (coherencia de VELOCIDAD c=|Σv|/Σ|v| de los presentes — velocidad-de-jugadores; FLANK = rumbo-de-POSICIÓN de MOBS ⊥).
//  · CRUX ⊥#87 PACKHARVEST (CONTEO/cohesión local, EXTENSIVA): FLANK es INTENSIVO (R invariante al conteo) — 3 mobs en un flanco vs 8 mobs en el mismo flanco ⇒ R igual (≈1)/#87 distinto (conteo). ⊥#106 MOTLEY (cardinalidad de e.type): {rat,orc,bat} amasados en un flanco (motley2/R alto) vs repartidos (motley2/R bajo) ⇒ diversidad igual/ángulo distinto. ⊥#84 SKIRMISH (fracción ranged): clase-de-arquetipo ⊥ geometría-angular. ⊥ APEX_PROXIMITY [distancia hero↔UN apex, canal matFind]. ⊥ Erudición [log temporal]. ⊥ #83/#85/#86 [estado DINÁMICO del vecino — FLANK es health/status-AGNÓSTICO, lee sólo POSICIÓN]. ⊥override/⊥#74/⊥#91 [posición ≠ afijo/zona]. Canal FRESCO `flankFind` — NINGUNA de las 49 flags #59-#107 lo usa; recurso TRANSITORIO NUEVO h.flankBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio flankBountyCap, badge ◤.
export const FLANK_SURGE = {
  enabled: true,             // LIVE (EVO#108, 50º flag) — CAS-2647 flip. CAS-2645 DARK build PASS 17/17 + CEO Gate 1/2 + DARK QA + CEO Gate 2/2. Flip false→true por CAS-2647 config-only LIVE flip.
  channel: "flankFind",      // canal FRESCO (fichas de falange por rematar en medio de una MANADA AMASADA EN UN FLANCO/sector angular) — NINGUNA de las 49 flags #59-#107 lo usa. Distinto por CONSTRUCCIÓN de disperseFind #107 (spread radial)/motleyFind #106 (cardinalidad de tipo)/packFind #87 (cohesión local)/skirmishFind #84 (fracción ranged)/wardRegen #59 (cobertura angular de JUGADORES, HP sostenido)/headingFind #90 (rumbo de MOVIMIENTO). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la concentración = longitud resultante media de los RUMBOS hero→mob de los mobs VIVOS dentro del radio del héroe. Mirror #87/#106/#107 radius. CEO balance knob.
  minMobs: 2,                // nº MÍNIMO de mobs VIVOS en radio para que la concentración esté DEFINIDA: con <2 mobs (0 ó 1) R es indefinida/trivial ⇒ 0 ⇒ banda 0. Combinado con el filtro de muertos ⇒ ANTI-AUTO-CONTEO (un remate en solitario = 0 otros vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midConc: 0.50,             // umbral de concentración R para la banda LEANING/inclinada a un flanco (peso 1): R≥0.50 (la manada se apoya notablemente en un rumbo). Adimensional [0,1]. CEO balance knob.
  hiConc: 0.80,              // umbral de concentración R para la banda FALANGE/muralla (peso 2): R≥0.80 (manada amasada casi enteramente en UN sector angular estrecho). R<midConc (repartida/cercando) ⇒ 0. Umbrales sobre la LONGITUD RESULTANTE (float [0,1]). CEO balance knob.
  weights: { phalanx: 2, lean: 1 },   // PESO de un remate por la BANDA de CONCENTRACIÓN angular de la formación VIVA en radio: FALANGE/muralla (R ≥hiConc) pesa 2; LEANING/inclinada (≥midConc) pesa 1; repartida/cercando (<midConc) ⇒ 0. Reward = rematar frente a una MURALLA amasada en un flanco, no cuando te CERCAN por todas direcciones. CEO balance knobs.
  flankBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de falange por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE CONCENTRACIÓN (score∈{0,1,2}). Formación MÁS amasada en un flanco = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (repartida/cercando/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate frente a una formación INCLINADA a un flanco, R≥midConc): +1 ficha de falange por kill. "remataste frente a una hueste que se apoya en un costado".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate frente a una FALANGE/muralla amasada, R≥hiConc): +2 fichas por kill. "remataste frente a la muralla más compacta de un solo flanco". CEO balance knobs.
  ],
};

// CAS-2650: REMATE DE COLUMNA (COLUMN_SURGE, EVO#109 DARK) — EJE FRESCO ESTRUCTURAL/GEOMÉTRICO ELONGACIÓN/ANISOTROPÍA DE LA FORMA de la MANADA VIVA alrededor del héroe (cuán ESTIRADA en una COLUMNA/línea vs cuán REDONDA/isótropa es la nube de mobs VIVOS en radio en el instante del kill: una COLUMNA/hilera alargada [anisótropa] vs un BLOB redondo/apelotonado [isótropo]). MÉTRICA = la ELONGACIÓN E∈[0,1] = 1 − λ_min/λ_max de los AUTOVALORES de la MATRIZ DE COVARIANZA 2×2 de las POSICIONES de los mobs alrededor de SU PROPIO CENTROIDE (análisis de forma / PCA puro): E≈1 ⇒ nube perfectamente COLINEAL (columna/línea); E≈0 ⇒ nube ISÓTROPA (círculo/blob redondo). Un ESCALAR GEOMÉTRICO ADIMENSIONAL AGREGADO (RATIO de autovalores ⇒ escala INTENSIVA de la FORMA, invariante al conteo Y al TAMAÑO de la formación) derivado SÓLO de las POSICIONES replicadas de G.enemies relativas a SU CENTROIDE (NO al héroe). Camino al 51º flag (serializa tras #108 FLANK_SURGE LIVE&served 329b4a967c2d/815, base HEAD 0679723).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack COHESION = compacidad/apretujamiento de la manada) → **FALLA** por DOS razones independientes ⇒ PIVOTE al ALTERNO (ELONGACIÓN/ANISOTROPÍA DE LA FORMA): (1) COHESION como ESCALA (distancia media al centroide inversa / vecino-más-cercano inverso) = re-mapeo MONÓTONO INVERSO de **#107 DISPERSE_SURGE** (disperseSpread = distancia media al centroide) ⇒ compacidad ALTA ⟺ spread BAJO, PERFECTAMENTE anti-correlados ⇒ NO ⊥#107. (2) COHESION como CONTEO (suma de cohesión LOCAL inter-mob, nº de vecinos dentro de un radio) = EXACTAMENTE **#87 PACKHARVEST** (SUMA de cohesión local, EXTENSIVA) ⇒ NO ⊥#87. El ALTERNO ELONGACIÓN es un RATIO de autovalores ⇒ ESCALA-INVARIANTE (⊥ escala/spread #107) Y CONTEO-INVARIANTE (⊥ #87) ⇒ mide la FORMA, no el TAMAÑO ni la DENSIDAD.
//  · CRUX ⊥#107 DISPERSE (SPREAD RADIAL = distancia media al centroide, ESCALA de la formación): COLUMN mide la ELONGACIÓN (¿qué FORMA?, ratio adimensional), #107 mide el SPREAD RADIAL (¿qué tan GRANDE?, magnitud px). NO son inversas monótonas: una LÍNEA pequeña y tupida (10/16/22px colineal) ⇒ COLUMN alto (E≈1, colineal) Y #107 spread BAJO (apiñada) ⇒ column2/disperse0; una LÍNEA grande (20/150/290px colineal) ⇒ COLUMN alto (E≈1) Y #107 spread alto (desplegada) ⇒ column2/disperse≥1; un BLOB redondo grande (cardinales a 200px) ⇒ COLUMN bajo (E≈0, isótropo)/#107 spread alto ⇒ column0/disperse2; un BLOB redondo pequeño ⇒ column0/disperse0. LOS CUATRO cuadrantes ⇒ INDEPENDIENTES. Forma (ratio) ⊥ escala (magnitud).
//  · CRUX ⊥#108 FLANK (CONCENTRACIÓN ANGULAR de rumbos hero→mob, R): FLANK se mide DESDE EL HÉROE (rumbos hero→mob); COLUMN se mide alrededor del CENTROIDE PROPIO de la nube (eigen-estructura de la covarianza, INVARIANTE a la posición del héroe). Una LÍNEA que apunta AL héroe (radial) ⇒ FLANK alto (R≈1, un rumbo) Y COLUMN alto (E≈1, colineal); una LÍNEA PERPENDICULAR al rumbo-al-héroe (tangencial, pasa cerca del héroe) ⇒ FLANK BAJO (rumbos abarcan un arco ancho, R≈0.4) PERO COLUMN alto (E≈1, MISMA forma colineal) ⇒ column2/flank0 con la MISMA forma; un BLOB redondo a UN lado ⇒ FLANK alto (R≈1, un flanco)/COLUMN bajo (E≈0, redondo) ⇒ column0/flank2; un ANILLO alrededor del héroe ⇒ FLANK 0/COLUMN 0. Forma-alrededor-del-centroide ⊥ concentración-angular-desde-el-héroe. (esta es la distinción CLAVE vs el vecino MÁS PRÓXIMO #108: la MISMA columna da FLANK distinto según su ORIENTACIÓN respecto al héroe, pero MISMO E.)
//  · CRUX ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA): COLUMN es INTENSIVO (E=ratio invariante al conteo) — 3 mobs en línea vs 8 mobs en la MISMA línea ⇒ E igual (≈1)/#87 distinto (conteo). ⊥#106 MOTLEY (cardinalidad de e.type): {rat,orc,bat} en columna (motley2/E alto) vs en blob (motley2/E bajo) ⇒ diversidad igual/forma distinta. ⊥#84 SKIRMISH (fracción ranged): clase-de-arquetipo ⊥ geometría-de-forma. ⊥#59 WARDING (cobertura angular de JUGADORES). ⊥#90 HEADING (rumbo de MOVIMIENTO — COLUMN es POSICIONAL/motion-AGNÓSTICO: una columna que HUYE vs que CARGA tiene MISMA elongación). ⊥#58 CONVOY (velocidad de jugadores). ⊥ APEX_PROXIMITY [distancia hero↔UN apex]. ⊥ Erudición [log temporal]. ⊥ #83/#85/#86 [estado DINÁMICO del vecino — COLUMN es health/status-AGNÓSTICO, lee sólo POSICIÓN]. ⊥override/⊥#74/⊥#91 [posición ≠ afijo/zona]. Canal FRESCO `columnFind` — NINGUNA de las 50 flags #59-#108 lo usa; recurso TRANSITORIO NUEVO h.columnBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio columnBountyCap, badge ‖.
export const COLUMN_SURGE = {
  enabled: true,             // LIVE (EVO#109, 51º flag) — CAS-2652 flip false→true tras CEO Gate 1/2 (a7408081) + DARK QA CAS-2651 PASS 17/17 + CEO Gate 2/2 (f70c9786). Config-only 1-línea. Seam _columnPre activo ⇒ columnFind→h.columnBounty STATELESS.
  channel: "columnFind",     // canal FRESCO (fichas de columna por rematar en medio de una MANADA ESTIRADA EN UNA COLUMNA/línea) — NINGUNA de las 50 flags #59-#108 lo usa. Distinto por CONSTRUCCIÓN de flankFind #108 (concentración angular desde el héroe)/disperseFind #107 (spread radial)/motleyFind #106 (cardinalidad de tipo)/packFind #87 (cohesión local)/skirmishFind #84 (fracción ranged)/wardRegen #59 (cobertura angular de JUGADORES)/headingFind #90 (rumbo de MOVIMIENTO). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la elongación = ratio de autovalores de la covarianza de las POSICIONES de los mobs VIVOS dentro del radio del héroe (alrededor de SU centroide). Mirror #87/#106/#107/#108 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS en radio para que la FORMA 2D esté DEFINIDA: con <3 mobs la covarianza es degenerada (2 puntos SIEMPRE colineales ⇒ E=1 trivial; 0/1 ⇒ indefinida) ⇒ E indefinido ⇒ 0. ≥3 ⇒ una nube 2D genuina. Combinado con el filtro de muertos ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 otros vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midElong: 0.55,            // umbral de elongación E para la banda ALARGADA/estirada (peso 1): E≥0.55 (la nube se estira notablemente en un eje). Adimensional [0,1]. CEO balance knob.
  hiElong: 0.82,             // umbral de elongación E para la banda COLUMNA/hilera (peso 2): E≥0.82 (nube casi COLINEAL, una columna estrecha). E<midElong (redonda/isótropa) ⇒ 0. Umbrales sobre el RATIO de autovalores (float [0,1]). CEO balance knob.
  weights: { column: 2, oblong: 1 },   // PESO de un remate por la BANDA de ELONGACIÓN de la forma VIVA en radio: COLUMNA/hilera (E ≥hiElong) pesa 2; ALARGADA/oblonga (≥midElong) pesa 1; redonda/isótropa (<midElong) ⇒ 0. Reward = rematar en medio de una COLUMNA estirada, no de un blob redondo. CEO balance knobs.
  columnBountyCap: 2,        // SUB-CAP DURO PROPIO de las fichas de columna por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE ELONGACIÓN (score∈{0,1,2}). Forma MÁS estirada en columna = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (redonda/isótropa/solitaria) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en formación ALARGADA/oblonga, E≥midElong): +1 ficha de columna por kill. "remataste en medio de una hueste estirada en un eje".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en COLUMNA/hilera casi colineal, E≥hiElong): +2 fichas por kill. "remataste en medio de la columna más estirada". CEO balance knobs.
  ],
};

// CAS-2655: REMATE DE DESBANDADA (ORIENT_SURGE, EVO#110 DARK) — EJE FRESCO CINÉTICO/DIRECCIONAL DISPERSIÓN DE ORIENTACIONES/RUMBOS DE MOVIMIENTO de la MANADA VIVA alrededor del héroe (cuán DE ACUERDO vs cuán DISPERSAS están las direcciones de MOVIMIENTO/INTENCIÓN de los mobs VIVOS en el instante del kill: una manada marchando EN UNÍSONO/coherente [rumbos alineados] vs una hueste EN DESBANDADA/desparramándose en TODAS direcciones [rumbos dispersos]). MÉTRICA = la DISPERSIÓN CIRCULAR S∈[0,1] = 1 − R, con R = longitud del VECTOR RESULTANTE MEDIO de los RUMBOS DE MOVIMIENTO (unitarios) de los mobs VIVOS CON rumbo definido en radio: S≈0 ⇒ todos moviéndose en la MISMA dirección (unísono/marcha); S≈1 ⇒ rumbos maximalmente DISPERSOS (desbandada/rout, apuntando a todos lados). Un ESCALAR CINÉTICO ADIMENSIONAL AGREGADO (dispersión = 2º momento circular ⇒ escala INTENSIVA, invariante al conteo) derivado de la MISMA intención-de-paso server-auth que #90 HEADING (headingIntent, derivado de la máquina de IA de updateEnemies — NO de e.vx/e.vy que están INERTES), pero en ABSOLUTO (world-frame) y AGREGADO como DISPERSIÓN inter-mob, NO dotado con hero→mob. Camino al 52º flag (serializa tras #109 COLUMN_SURGE LIVE&served bc21f1f7ac8a/815, base HEAD c1e1ee9).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack TEMPORAL DENSITY / SURGE TIMING = tasa de kills en una ventana temporal rodante / burst kill rate) → **FALLA** por ORTOGONALIDAD (criterio c): la "tasa de kills en una ventana de ~3-5s con decay" es EXACTAMENTE lo que ya mide **FRENZY (CAS-1773)** — el MEDIDOR DE FRENESÍ/kill-streak (matar dentro de window=3.0s suma 1 stack hasta maxStacks=8; sin kill decae 1 stack cada 0.6s). Un score de burst-kill-rate = re-mapeo MONÓTONO del conteo de stacks de FRENZY ⇒ NO ⊥ FRENZY. Además el dominio TEMPORAL ya está tocado por Erudición (log temporal de tipos KILLED con decay) y CADENCE#67 (tempo de kills). ⇒ PIVOTE al ALTERNO del issue: **pack ORIENTATION SPREAD** (stddev/dispersión circular de los rumbos de movimiento de la manada). PRE-FLIGHT del ALTERNO PASA: (a) DATO accesible — headingIntent(e,h) da el vector de rumbo UNITARIO server-auth por mob VIVO (o null si estacionario), reusable; (b) score BAND-ABLE — dispersión circular S=1−R ∈[0,1] con umbrales; (c) ⊥ vecino más próximo — #109 COLUMN es GEOMÉTRICO/POSICIONAL (forma de las POSICIONES), esto es CINÉTICO/DIRECCIONAL (dispersión de los RUMBOS de MOVIMIENTO) ⇒ ortogonal por DOMINIO.
//  · CRUX ⊥#90 HEADING (LIVE, vecino conceptual más próximo): #90 puntúa el rumbo de UNA víctima RELATIVO al héroe (dot m·u = ¿carga HACIA el héroe? cargando/lateral/huyendo), toma el MAX sobre el pack (1er momento / ALINEACIÓN-con-la-dirección-al-héroe). ORIENT mide el ACUERDO/DISPERSIÓN inter-mob de los rumbos ABSOLUTOS (2º momento circular, INVARIANTE al marco del héroe). MISMO #90 (todos cargando ⇒ headingScore 2) da DISTINTO ORIENT según la GEOMETRÍA: 3 mobs cargando desde el MISMO costado ⇒ rumbos alineados ⇒ S≈0 (unísono, orient0); 3 mobs CERCANDO al héroe (N/E/S) todos cargando hacia dentro ⇒ rumbos apuntan a lados opuestos ⇒ S alto (desbandada aparente, orient2) — MISMO headingScore 2, ORIENT OPUESTO. Media/alineación-con-el-héroe (#90) ⊥ varianza/dispersión-inter-mob (ORIENT).
//  · CRUX ⊥#109 COLUMN (POSICIÓN vs MOVIMIENTO): COLUMN = elongación de la covarianza de las POSICIONES (¿qué FORMA tiene la nube?); ORIENT = dispersión de los RUMBOS DE MOVIMIENTO (¿en qué direcciones se MUEVEN?). Una COLUMNA marchando en unísono ⇒ column2/orient0; una columna desparramándose (cada mob a su aire) ⇒ column2/orient2; un BLOB redondo moviéndose en bloque ⇒ column0/orient0; un blob en desbandada ⇒ column0/orient2. LOS CUATRO cuadrantes ⇒ INDEPENDIENTES. Posición ⊥ movimiento.
//  · CRUX ⊥#108 FLANK (POSICIÓN-ángulo vs MOVIMIENTO-ángulo): FLANK = concentración R de los rumbos hero→mob (dónde ESTÁN los mobs respecto al héroe, POSICIONAL — funciona incluso con mobs QUIETOS); ORIENT = dispersión de los rumbos de MOVIMIENTO (headingIntent — 0/EXCLUIDO para mobs quietos). Un ANILLO de mobs QUIETOS (en windup) alrededor del héroe ⇒ FLANK lee sus posiciones (R bajo) PERO ORIENT los EXCLUYE (sin traslación) ⇒ divergen. Ángulo-de-posición ⊥ ángulo-de-velocidad. ⊥#107 DISPERSE (spread RADIAL de POSICIONES), ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA), ⊥#106 MOTLEY (cardinalidad de e.type), ⊥#84 SKIRMISH (fracción ranged), ⊥#59 WARDING (cobertura de JUGADORES). ⊥ FRENZY/CADENCE#67/COMBO (TEMPO/tasa temporal de kills — el eje RECOMENDADO que FALLÓ; ORIENT es DIRECCIONAL/espacial-instantáneo, motion-de-mobs, NO temporal). ⊥ Erudición [log temporal]. ⊥ #83/#85/#86 [estado DINÁMICO vida/CC/DoT — ORIENT lee sólo el RUMBO de movimiento]. ⊥override/⊥#74/⊥#91 [rumbo ≠ afijo/zona]. Canal FRESCO `orientFind` — NINGUNA de las 51 flags #59-#109 lo usa; recurso TRANSITORIO NUEVO h.orientBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio orientBountyCap, badge ⇶.
export const ORIENT_SURGE = {
  enabled: true,             // LIVE (EVO#110, 52º flag). CAS-2657 flip false→true TRAS CEO Gate 1/2 + DARK QA Gate 2/2 (CAS-2656 PASS 17/17) + CEO Gate 2/2. Config-only 1-línea. GATED ⇒ seam _orientPre=0 (const inerte) + rama muerta ⇒ killEnemy byte-idéntico al HEAD.
  channel: "orientFind",     // canal FRESCO (fichas de desbandada por rematar en medio de una hueste con RUMBOS DE MOVIMIENTO DISPERSOS) — NINGUNA de las 51 flags #59-#109 lo usa. Distinto por CONSTRUCCIÓN de columnFind #109 (forma de POSICIONES)/flankFind #108 (concentración angular de posiciones desde el héroe)/disperseFind #107 (spread radial de posiciones)/headingFind #90 (rumbo de UNA víctima relativo al héroe)/packFind #87 (cohesión local). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la dispersión = 1−R de los rumbos de movimiento de los mobs VIVOS CON rumbo definido dentro del radio del héroe. Mirror #87/#106/#107/#108/#109 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS CON RUMBO DEFINIDO (headingIntent no-null: no estacionarios) en radio para que la DISPERSIÓN circular esté DEFINIDA: con <3 rumbos la resultante es degenerada/trivial ⇒ S indefinido ⇒ 0. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su rumbo NO entra) ⇒ ANTI-AUTO-CONTEO. CEO balance knob.
  midSpread: 0.30,           // umbral de dispersión S para la banda SUELTA/algo-dispersa (peso 1): S≥0.30 (los rumbos empiezan a divergir). Adimensional [0,1]. CEO balance knob.
  hiSpread: 0.62,            // umbral de dispersión S para la banda DESBANDADA/rout (peso 2): S≥0.62 (rumbos maximalmente dispersos, cada mob a su aire). S<midSpread (unísono/marcha coherente) ⇒ 0. Umbrales sobre la DISPERSIÓN circular (float [0,1]). CEO balance knob.
  weights: { rout: 2, loose: 1 },   // PESO de un remate por la BANDA de DISPERSIÓN de rumbos de la manada VIVA en radio: DESBANDADA/rout (S ≥hiSpread) pesa 2; SUELTA/algo-dispersa (≥midSpread) pesa 1; unísono/marcha coherente (<midSpread) ⇒ 0. Reward = rematar en medio de una hueste EN DESBANDADA, no de una columna marchando en bloque. CEO balance knobs.
  orientBountyCap: 2,        // SUB-CAP DURO PROPIO de las fichas de desbandada por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DISPERSIÓN (score∈{0,1,2}). Rumbos MÁS dispersos = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (unísono/coherente/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en hueste SUELTA/algo-dispersa, S≥midSpread): +1 ficha de desbandada por kill. "remataste en medio de una hueste que empieza a desperdigarse".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en plena DESBANDADA, S≥hiSpread): +2 fichas por kill. "remataste en medio de la hueste más desbandada". CEO balance knobs.
  ],
};

// CAS-1879: HOGUERA / REST SITE (Bonfire, 13º pilar · capstone que UNIFICA Estus+Mancha de Sangre+checkpoint).
// Descansar en un sitio seguro (world.fountains) cura a tope, recarga Estus, fija el ancla de respawn y REPUEBLA los
// no-jefes de la zona (tradeoff Souls: recuperas recursos pero el mundo vuelve). Sólo en seguridad (sin no-jefes en
// aggro dentro de safeRadius). enabled:false ⇒ la rama de fuente queda INTACTA ⇒ build byte-idéntico al HEAD previo.
export const BONFIRE = {
  enabled: true,
  key: "KeyE",           // reusa el interact de proximidad (fuentes); reservado para hotkey dedicado si el CEO lo pide
  healFull: true,        // HP/MP/stam a tope (la fuente ya lo hace; la hoguera lo garantiza)
  refillFlasks: true,    // recarga cargas de Estus reusando FLASK.charges (gated FLASK.enabled)
  respawnEnemies: true,  // world reset: repuebla NO-jefes de la zona, determinista 0-draw
  setCheckpoint: true,   // fija h.respawn al sitio (la fuente ya lo hace)
  safeRadius: 260,       // no descansar si un no-jefe en aggro está dentro de este radio (px)
  glowColor: "#ff9a3c",  // llama/glow procedural $0 en canvas
  // CAS-1886 (placement retune, decisión CEO CAS-1885): hogueras STANDALONE en zonas de caza POBLADAS para que el
  // world-reset (bonfireRespawn) sea observable live. Las 2 fountains viven en `field` (sin spawner) ⇒ repop=0; estos
  // sites DESACOPLAN la hoguera de las fountains (aditivo — las fountains siguen curando). Cada entrada = una ZONA; la
  // posición se resuelve DETERMINISTA (0-draw) desde el rect del spawner de esa zona en bonfireSites() (sim.js). El
  // guard zoneOf(site)===zone descarta spawners que caen fuera de zona (p.ej. huntZones del continente en `field`).
  sites: ["forest", "caves", "ruins", "abyss", "frost", "trial", "swamp", "caldera"],
  siteAnchor: { fx: 0.5, fy: 0.18 },   // fracción del rect del spawner (centro-x, cerca del borde superior = entrada defendible, no en el cluster de spawn)
};

// CAS-2660: REMATE DE TROPEL DESIGUAL (SPEED_SURGE, EVO#111 DARK) — EJE FRESCO CINÉTICO/MAGNITUD DISPERSIÓN DE VELOCIDADES DE MOVIMIENTO de la MANADA VIVA alrededor del héroe (cuán UNIFORME vs cuán DESIGUAL es el RITMO de PASO de los mobs VIVOS en el instante del kill: una columna marchando A PASO PAREJO [velocidades uniformes, CV bajo] vs un tropel DESIGUAL de rezagados + embestidores [mezcla de velocidades, CV alto]). MÉTRICA = el COEFICIENTE DE VARIACIÓN CV = stddev/media de las MAGNITUDES DE VELOCIDAD de PASO (|v| server-auth por mob, derivado de la MISMA fuente de movimiento que #90/#110 — headingIntent/updateEnemies — NO de e.vx/e.vy INERTES). CV≈0 ⇒ todos al MISMO ritmo (marcha pareja); CV alto ⇒ ritmos maximalmente DESIGUALES (tropel de rezagados y chargers). Un ESCALAR CINÉTICO ADIMENSIONAL AGREGADO (CV = 2º momento normalizado ⇒ escala INTENSIVA, invariante al conteo Y a la magnitud absoluta). Reusa la MISMA rama de la máquina de IA que headingIntent (speedIntent(e,h) = magnitud de traslación por tick: chase/flee ⇒ espd=tpl.spd·slow [sim.js:8984], wander ⇒ const 30/40 [8994/8997], comprometido windup/strike/recover/shield ⇒ null/estacionario ⇒ EXCLUIDO — MISMO null-set que headingIntent ⇒ ambos ejes leen la MISMA población viva-en-movimiento) pero toma la MAGNITUD (no la dirección) y la AGREGA como DISPERSIÓN CV inter-mob. Camino al 53º flag (serializa tras #110 ORIENT_SURGE LIVE&served 449121cabca6/815, base HEAD fdd87b5).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack SPEED DISPERSION / dispersión de magnitudes de velocidad) → **PASA sin pivote** (los 3 criterios): (a) DATO accesible — la magnitud de velocidad de PASO por mob EXISTE server-auth: espd=e.tpl.spd·(slowT>0?slow:1) es la velocidad de crucero de chase/flee (sim.js:8984); wander usa la const 30 (8997)/neutral 40 (8994); comprometido ⇒ sin traslación. speedIntent(e,h) la deriva de la MISMA rama de IA que headingIntent (NO e.vx/e.vy INERTES) ⇒ reusable, determinista, replicada. (b) score BAND-ABLE — CV∈[0,∞) con umbrales adimensionales midCV/hiCV. (c) ⊥ vecino más próximo #110 ORIENT — #110 es DISPERSIÓN de la DIRECCIÓN de movimiento (2º momento CIRCULAR de rumbos unitarios); SPEED es DISPERSIÓN de la MAGNITUD de movimiento (CV de velocidades escalares). Un vector de velocidad = dirección × magnitud; ORIENT lee el ÁNGULO, SPEED lee el MÓDULO ⇒ las DOS componentes INDEPENDIENTES de la velocidad. Una manada cargando TODA en la MISMA dirección a velocidades MUY dispares ⇒ orient0/speed2; una hueste huyendo a TODOS lados al MISMO ritmo ⇒ orient2/speed0.
//  · CRUX ⊥#94 SWIFT (LIVE, vecino conceptual más próximo por dominio VELOCIDAD): #94 = la VELOCIDAD BASE del TIPO de UNA víctima (banda de ETPL[type].spd, MAX sobre el pack ⇒ 1er momento / la presa más veloz disponible, ABSOLUTA/ESTÁTICA); SPEED = la DISPERSIÓN CV de las velocidades ACTUALES de la manada (2º momento / cuán DESIGUAL, RELATIVA/DINÁMICA). MISMO patrón que ORIENT⊥HEADING (varianza ⊥ máximo). 3 murciélagos (todos spd158) ⇒ SWIFT 2 (todos veloces) pero CV=0 ⇒ speed0 (ritmo PAREJO); 3 esqueletos base-lento (swift0) con ritmos ACTUALES {40,80,160} (override/slow) ⇒ swift0/speed2 OPUESTO; {murciélago158, brutón60} ⇒ swift2/speed2. Además SPEED lee la velocidad ACTUAL (incluye frost-slow #85 y el estado wander=30 vs chase=tpl.spd) que SWIFT (base ETPL INMUTABLE) IGNORA por construcción ⇒ doblemente ⊥.
//  · CRUX ⊥#110 ORIENT (dirección) / ⊥#90 HEADING (rumbo-de-1-víctima-relativo-al-héroe) / ⊥#109 COLUMN (forma de POSICIONES) / ⊥#108 FLANK (ángulo de POSICIÓN) / ⊥#107 DISPERSE (spread RADIAL de POSICIONES) / ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA — 3 vs 6 mobs con la MISMA mezcla de velocidades ⇒ MISMO CV/#87 distinto) / ⊥#106 MOTLEY (cardinalidad de e.type — 3 TIPOS al MISMO ritmo ⇒ motley2/speed0; 1 tipo a ritmos dispares ⇒ motley0/speed2) / ⊥#84 SKIRMISH (fracción ranged) / ⊥#59 WARDING (cobertura de JUGADORES) / ⊥ FRENZY/CADENCE#67/COMBO (TEMPO/tasa temporal de kills — SPEED es CINÉTICO/espacial-instantáneo, NO temporal) / ⊥ Erudición [log temporal] / ⊥ #83/#85/#86 [estado DINÁMICO — SPEED lee sólo la MAGNITUD de paso; el frost-slow #85 ENTRA a la velocidad actual pero SPEED mide su DISPERSIÓN, no el estado en sí] / ⊥override/⊥#74/⊥#91 [velocidad ≠ afijo/zona: aunque z.spdMul/A.spdMul escalen el CLON, el CV es INVARIANTE a un factor de escala UNIFORME]. Canal FRESCO `speedFind` — NINGUNA de las 52 flags #59-#110 lo usa; recurso TRANSITORIO NUEVO h.speedBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio speedBountyCap, badge ⇌.
export const SPEED_SURGE = {
  enabled: true,             // LIVE (EVO#111, 53º flag). Volteado false→true (CAS-2662) TRAS CEO Gate 1/2 + DARK QA Gate 2/2 + CEO Gate 2/2. Config-only 1-línea. LIVE ⇒ seam _speedPre activo + grantSpeedBounty stateless (fuera del save + fingerprint).
  channel: "speedFind",      // canal FRESCO (fichas de tropel por rematar en medio de una manada con RITMOS DE PASO DESIGUALES) — NINGUNA de las 52 flags #59-#110 lo usa. Distinto por CONSTRUCCIÓN de orientFind #110 (dispersión de DIRECCIÓN)/swiftFind #94 (velocidad-base de UNA víctima, MAX)/columnFind #109 (forma de POSICIONES)/headingFind #90 (rumbo de UNA víctima). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el CV = dispersión de las velocidades de paso de los mobs VIVOS EN MOVIMIENTO dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS EN MOVIMIENTO (speedIntent no-null: no estacionarios/comprometidos) en radio para que el CV esté DEFINIDO: con <3 velocidades la dispersión es degenerada/trivial ⇒ CV indefinido ⇒ 0. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su velocidad NO entra) ⇒ ANTI-AUTO-CONTEO. CEO balance knob.
  midCV: 0.18,               // umbral de CV para la banda ALGO-DESIGUAL/loose (peso 1): CV≥0.18 (los ritmos empiezan a divergir). Adimensional [0,∞). CEO balance knob.
  hiCV: 0.40,                // umbral de CV para la banda TROPEL/ragged (peso 2): CV≥0.40 (ritmos maximalmente dispares, rezagados + chargers). CV<midCV (marcha a paso parejo) ⇒ 0. Umbrales sobre el CV (float adimensional). CEO balance knob.
  weights: { ragged: 2, loose: 1 },   // PESO de un remate por la BANDA de DISPERSIÓN de velocidades de la manada VIVA en radio: TROPEL/ragged (CV ≥hiCV) pesa 2; ALGO-DESIGUAL/loose (≥midCV) pesa 1; marcha a paso parejo (<midCV) ⇒ 0. Reward = rematar en medio de un tropel DESIGUAL, no de una columna marchando a paso parejo. CEO balance knobs.
  speedBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de tropel por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DISPERSIÓN (score∈{0,1,2}). Ritmos MÁS dispares = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (paso parejo/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en manada ALGO-DESIGUAL, CV≥midCV): +1 ficha de tropel por kill. "remataste en medio de una manada cuyo paso empieza a desigualarse".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno TROPEL, CV≥hiCV): +2 fichas por kill. "remataste en medio del tropel más desigual (rezagados + chargers)". CEO balance knobs.
  ],
};

// CAS-2665: REMATE DE EMBESTIDA CONVERGENTE (CONVERGE_SURGE, EVO#112 DARK) — EJE FRESCO CINÉTICO/SIGNADO CONVERGENCIA RADIAL de la MANADA VIVA sobre el héroe (cuán COORDINADAMENTE está CERRANDO la manada VIVA sobre el héroe en el instante del kill: una hueste EMBISTIENDO EN BLOQUE hacia dentro [todas ACERCÁNDOSE, convergencia alta] vs una que MILLA/se dispersa/RETROCEDE [tanto acercándose como alejándose ⇒ convergencia neta ≈0 o negativa]). MÉTRICA = el ÍNDICE DE CONVERGENCIA C∈[-1,1] = la MEDIA PONDERADA POR VELOCIDAD del COSENO RADIAL = (Σ vᵢ·cosθᵢ)/(Σ vᵢ), con vᵢ=speedIntent(e,h) [magnitud server-auth de PASO, MISMA rama de IA que headingIntent — NO e.vx/e.vy INERTES] y cosθᵢ = mᵢ·uᵢ [mᵢ=headingIntent(e,h) rumbo UNITARIO, uᵢ=mob→hero UNITARIO] = la proyección del rumbo de movimiento sobre la dirección AL HÉROE. C≈+1 ⇒ toda la manada EMBISTE de frente hacia el héroe (embestida cerrada/coordinada); C≈0 ⇒ milla/tangencial (ni cierra ni abre); C<0 ⇒ RETROCEDE/huye. Un ESCALAR CINÉTICO SIGNADO ADIMENSIONAL AGREGADO (1er momento en el MARCO DEL HÉROE, INVARIANTE a un factor de escala UNIFORME de velocidad por la normalización /Σv). Reusa las MISMAS ramas de IA que headingIntent(dirección)+speedIntent(magnitud) — MISMO null-set ⇒ lee la MISMA población viva-en-movimiento que #110/#111 — pero las COMBINA como PROYECCIÓN RADIAL SIGNADA hacia el héroe y AGREGA como MEDIA ponderada. Camino al 54º flag (serializa tras #111 SPEED_SURGE LIVE&served 229165c5c306/815, base HEAD 6ae9224).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack CONVERGENCE / velocidad radial media signada hacia el héroe) → **PASA sin pivote** (los 3 criterios): (a) DATO accesible — la velocidad radial por mob = speedIntent(e,h) [magnitud espd=e.tpl.spd·slow sim.js:8984, wander 30/40] × cos entre headingIntent(e,h) [rumbo unitario] y el rumbo mob→hero; ambos derivados de la MISMA rama de IA que #90/#110/#111 (NO e.vx/e.vy INERTES) ⇒ reusable, determinista, replicado. (b) score BAND-ABLE — C∈[-1,1] con umbrales midConverge/hiConverge en el lado POSITIVO (cerrando). (c) ⊥ vecinos más próximos: ⊥#90 HEADING = MAX-sobre-el-pack del coseno-unitario (1 víctima extrema, magnitud-agnóstica) vs CONVERGE = MEDIA-ponderada-por-velocidad SIGNADA (MAX ⊥ MEDIA, MISMA familia que #94 SWIFT⊥#111 SPEED base-max⊥CV) — 1 embestidor solitario + N huyendo ⇒ heading2/converge0. ⊥#110 ORIENT = dispersión de rumbos ABSOLUTOS (2º momento circular, hero-frame-INVARIANTE, sin signo) vs CONVERGE = media SIGNADA en el MARCO DEL HÉROE (1er momento): manada CERCANDO al héroe (N/E/S/W, todas embisten hacia dentro) ⇒ rumbos absolutos DISPERSOS ⇒ orient2 PERO todas cerrando ⇒ converge2; manada COLINEAL embistiendo (todas al mismo costado) ⇒ rumbos alineados ⇒ orient0 PERO todas cerrando ⇒ converge2. ⊥#111 SPEED = CV de las MAGNITUDES (2º momento, dirección-agnóstica) vs CONVERGE = dirección-hacia-el-héroe (magnitud-INVARIANTE por /Σv): manada embistiendo a velocidades dispares ⇒ speed2/converge2; millando a velocidades dispares ⇒ speed2/converge0.
//  · CRUX ⊥#90 HEADING (LIVE, vecino conceptual más próximo por dominio HERO-RELATIVO): #90 = el rumbo de UNA víctima RELATIVO al héroe (dot m·u, carga/lateral/huye), toma el MAX sobre el pack (1er momento / la embestida más agresiva DISPONIBLE, EXTREMO/1-víctima). CONVERGE = la MEDIA ponderada por velocidad de la proyección radial de TODA la manada (agregado/coordinación colectiva, magnitud-pesada). MISMO patrón que ORIENT⊥HEADING (varianza ⊥ máximo) pero aquí MEDIA ⊥ máximo: 1 embestidor solitario cargando de frente (heading MAX=2) rodeado de 3 mobs HUYENDO al mismo ritmo ⇒ C=(70−70−70−70)/280=−0.5 ⇒ converge0 (la manada NO cierra en conjunto) — MISMO heading2, CONVERGE OPUESTO. Toda la manada embistiendo ⇒ heading2/converge2. El MISMO headingScore 2 mapea a converge2 Y a converge0 ⇒ MAX ⊥ MEDIA.
//  · CRUX ⊥#110 ORIENT (LIVE, vecino por dominio CINÉTICO/DIRECCIONAL): ORIENT = dispersión CIRCULAR de los rumbos de movimiento ABSOLUTOS (2º momento, world-frame, INVARIANTE al héroe, SIN signo); CONVERGE = MEDIA SIGNADA de la proyección radial hacia el HÉROE (1er momento, hero-frame). Los 4 cuadrantes: CERCANDO al héroe (N/E/S/W embistiendo hacia dentro) ⇒ rumbos absolutos apuntan a lados opuestos ⇒ orient2 / todas cierran ⇒ converge2; COLINEAL embistiendo (todas al mismo costado) ⇒ rumbos alineados ⇒ orient0 / todas cierran ⇒ converge2; CERCANDO huyendo ⇒ orient2 / todas abren ⇒ converge0; COLINEAL huyendo ⇒ orient0 / todas abren ⇒ converge0. Dispersión-absoluta ⊥ media-signada-hacia-el-héroe.
//  · CRUX ⊥#111 SPEED (LIVE, vecino por número): SPEED = CV de las MAGNITUDES de velocidad (2º momento normalizado, DIRECCIÓN-agnóstico); CONVERGE = proyección DIRECCIONAL hacia el héroe (magnitud-INVARIANTE por la normalización /Σv). Los 4 cuadrantes: manada EMBISTIENDO a velocidad uniforme ⇒ converge2/speed0; embistiendo a velocidades DISPARES ⇒ converge2/speed2 (la magnitud NO altera C: todas siguen cerrando); MILLANDO (mitad cierra/mitad abre) a velocidad uniforme ⇒ converge0/speed0; millando a velocidades dispares ⇒ converge0/speed2. ⊥#108 FLANK (ángulo de POSICIÓN, funciona con mobs QUIETOS — un anillo de mobs en windup ⇒ FLANK lee posiciones/CONVERGE los EXCLUYE por sin traslación). ⊥#109 COLUMN (forma de POSICIONES) / ⊥#107 DISPERSE (spread radial de POSICIONES) / ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA — la media C es INVARIANTE al conteo) / ⊥#106 MOTLEY (cardinalidad de e.type) / ⊥#84 SKIRMISH (fracción ranged) / ⊥#59 WARDING (cobertura de JUGADORES) / ⊥ FRENZY/CADENCE#67/COMBO (TEMPO/tasa temporal — CONVERGE es CINÉTICO/espacial-instantáneo) / ⊥ Erudición [log temporal] / ⊥ #83/#85/#86 [estado DINÁMICO — CONVERGE lee sólo el vector de PASO; el frost-slow #85 escala vᵢ pero la normalización /Σv lo cancela en la dirección] / ⊥override/⊥#74/⊥#91 [velocidad ≠ afijo/zona: C es INVARIANTE a un factor de escala UNIFORME]. Canal FRESCO `convergeFind` — NINGUNA de las 53 flags #59-#111 lo usa; recurso TRANSITORIO NUEVO h.convergeBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio convergeBountyCap, badge ▸◂.
export const CONVERGE_SURGE = {
  enabled: true,             // LIVE (EVO#112, 54º flag, CAS-2667). CEO Gate 1/2 + DARK QA 17/17 + CEO Gate 2/2 all PASS ⇒ flipped false→true config-only 1-línea. seam _convergePre + banda de convergencia AHORA activos.
  channel: "convergeFind",   // canal FRESCO (fichas de embestida por rematar en medio de una manada que CIERRA COORDINADA sobre el héroe) — NINGUNA de las 53 flags #59-#111 lo usa. Distinto por CONSTRUCCIÓN de speedFind #111 (dispersión de MAGNITUD)/orientFind #110 (dispersión de DIRECCIÓN absoluta)/headingFind #90 (rumbo MAX de UNA víctima)/flankFind #108 (ángulo de POSICIÓN). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el índice C = media ponderada de la proyección radial de los mobs VIVOS EN MOVIMIENTO dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110/#111 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS EN MOVIMIENTO (headingIntent+speedIntent no-null: no estacionarios/comprometidos) en radio para que la CONVERGENCIA esté DEFINIDA: con <3 la media es degenerada/trivial ⇒ C indefinido ⇒ 0. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su vector NO entra) ⇒ ANTI-AUTO-CONTEO. CEO balance knob.
  midConverge: 0.25,         // umbral de C para la banda ALGO-CERRANDO/loose (peso 1): C≥0.25 (la manada empieza a cerrar en conjunto). Adimensional [-1,1]. CEO balance knob.
  hiConverge: 0.55,          // umbral de C para la banda EMBESTIDA/closing (peso 2): C≥0.55 (embestida cerrada, casi toda la manada cargando de frente). C<midConverge (millando/tangencial/retrocediendo) ⇒ 0. Umbrales sobre el ÍNDICE signado (float [-1,1]). CEO balance knob.
  weights: { closing: 2, loose: 1 },   // PESO de un remate por la BANDA de CONVERGENCIA de la manada VIVA en radio: EMBESTIDA/closing (C ≥hiConverge) pesa 2; ALGO-CERRANDO/loose (≥midConverge) pesa 1; millando/tangencial/retrocediendo (<midConverge) ⇒ 0. Reward = rematar en medio de una hueste que CIERRA COORDINADA sobre ti, no de una que milla o retrocede. CEO balance knobs.
  convergeBountyCap: 2,      // SUB-CAP DURO PROPIO de las fichas de embestida por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE CONVERGENCIA (score∈{0,1,2}). Manada MÁS convergente = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (millando/tangencial/retrocediendo/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en manada ALGO-CERRANDO, C≥midConverge): +1 ficha de embestida por kill. "remataste en medio de una hueste que empieza a cerrar sobre ti".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en plena EMBESTIDA, C≥hiConverge): +2 fichas por kill. "remataste en medio de la embestida más cerrada (toda la manada cargando de frente)". CEO balance knobs.
  ],
};

// CAS-2669: REMATE DE CERCO (ENCIRCLE_SURGE, EVO#113 DARK) — EJE FRESCO ESTRUCTURAL/GEOMÉTRICO COBERTURA ANGULAR / MAYOR-HUECO de los RUMBOS hero→mob de la MANADA VIVA alrededor del héroe (cuán RODEADO POR TODOS LOS FLANCOS está el héroe vs cuán ABIERTO/despejado deja un arco la manada: un ANILLO CERRADO que lo cerca por todas direcciones [hueco mayor pequeño, cobertura alta] vs una manada AMONTONADA en un costado dejando un gran ARCO ABIERTO [hueco mayor grande, cobertura baja]). MÉTRICA = la COBERTURA ANGULAR K∈[0,1) = 1 − (mayorHueco / 2π), con mayorHueco = el MAYOR ARCO VACÍO entre rumbos hero→mob CONSECUTIVOS (ordenados, circular, incluye el wrap): K≈1 ⇒ mobs repartidos UNIFORMEMENTE alrededor (cerco total, sin dirección de escape); K≈0 ⇒ mobs AMONTONADOS en un sector estrecho (un solo gran hueco abierto ≈360°). Un ESCALAR GEOMÉTRICO ADIMENSIONAL AGREGADO (COBERTURA/tamaño-del-hueco ⇒ escala INTENSIVA, invariante al conteo Y a la escala radial) derivado SÓLO de los RUMBOS (atan2 de e.y−h.y, e.x−h.x) de los mobs VIVOS en radio — la MISMA fuente de RUMBO server-auth que #108 FLANK (mob→hero angle, NO e.vx/e.vy INERTES), pero una ESTADÍSTICA DISTINTA (hueco-cobertura, NO longitud-resultante). Camino al 55º flag (serializa tras #112 CONVERGE_SURGE LIVE&served d96456bddb01/815, base HEAD 145cde7).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack ENCIRCLEMENT = cobertura angular / mayor-hueco de los rumbos de los mobs) → **PASA sin pivote** (los 3 criterios): (a) DATO accesible — el rumbo hero→mob por mob EXISTE server-auth (atan2 de las POSICIONES replicadas de G.enemies, LA MISMA fuente que #108 FLANK usa para su resultante — NO e.vx/e.vy INERTES); (b) score BAND-ABLE — cobertura K∈[0,1) con umbrales midCover(0.50)/hiCover(0.75); (c) ⊥ vecino más próximo #108 FLANK — ambos leen los MISMOS rumbos hero→mob PERO estadísticas DISTINTAS: FLANK = LONGITUD RESULTANTE R (CONCENTRACIÓN, "cuán amasada en UN arco"), ENCIRCLE = COBERTURA-DE-HUECO K ("¿queda alguna dirección abierta / me rodean por todos lados?"). NO son re-mapeo: un ANILLO UNIFORME ⇒ FLANK R≈0 (repartida) / ENCIRCLE K≈alto (cerco, hueco pequeño) ⇒ flank0/encircle2 (OPUESTOS); un CÚMULO TUPIDO en un flanco ⇒ FLANK R≈1 (amasada) / ENCIRCLE K≈0 (un gran hueco abierto) ⇒ flank2/encircle0 (OPUESTOS); DOS cúmulos en flancos OPUESTOS (N+S) ⇒ FLANK R≈0 (resultante cancela) / ENCIRCLE hueco mayor≈180° ⇒ K≈0.5/encircle1 ⇒ flank0/encircle1; un semicírculo UNIFORME ⇒ FLANK R moderado (≈0.64) / hueco mayor≈180° ⇒ K≈0.5/encircle1. 🔑 PRUEBA de que ENCIRCLE NO es función de R: TRES config con R=0 idéntico dan K DISTINTO — cruz de 4 (0/90/180/270) K=0.75, triángulo de 3 (0/120/240) K=0.667, par opuesto (0/180) K=0.5 ⇒ MISMO R=0, K distinto ⇒ estadísticas INDEPENDIENTES.
//  · CRUX ⊥#108 FLANK (CONCENTRACIÓN ANGULAR R = longitud del vector resultante medio de los rumbos hero→mob, "cuán amasada en UN sector"): FLANK es un 1er momento circular (resultante); ENCIRCLE es la COBERTURA/mayor-hueco (una estadística de REPARTO/gap, NO de resultante). Los cuadrantes: ANILLO UNIFORME (cerco) ⇒ flank0 (R≈0)/encircle2 (K alto); CÚMULO en un flanco ⇒ flank2 (R≈1)/encircle0 (K≈0); DOS cúmulos opuestos ⇒ flank0 (R cancela)/encircle1 (hueco≈180°); semicírculo uniforme ⇒ flank1 (R≈0.64)/encircle1 (hueco≈180°). Concentración-en-un-arco ⊥ cobertura-de-todo-el-círculo. (esta es la distinción CLAVE vs FLANK: MISMOS rumbos, DISTINTO estadístico — R mide "amasamiento", K mide "cerramiento".)
//  · CRUX ⊥#59 WARDING_RING (cobertura angular de sectores de JUGADORES alrededor de SU centroide, canal wardRegen = regen HP SOSTENIDO con decay, STATEFUL, MULTIJUGADOR, recompensa REPARTO-uniforme): aunque ambos hablan de "cobertura angular", SEIS distinciones ⊥ — (a) SUJETO mobs-ENEMIGOS vs jugadores-presentes; (b) REFERENCIA héroe vs centroide-de-jugadores; (c) MÉTRICA mayor-HUECO-continuo (1−gap/2π) vs conteo-DISCRETO-de-sectores-cubiertos; (d) CANAL encircleFind-TRANSITORIO (fichas por kill) vs wardRegen-SOSTENIDO (HP con decay); (e) STATELESS/kill-instantáneo vs STATEFUL/sostenido; (f) POLARIDAD — ENCIRCLE premia estar RODEADO por enemigos (peligro), #59 premia el REPARTO de aliados (seguridad). Sujeto/referencia/métrica/canal/estado/polaridad OPUESTOS.
//  · CRUX ⊥#110 ORIENT (dispersión de RUMBOS DE MOVIMIENTO absolutos) / ⊥#112 CONVERGE (media SIGNADA de velocidad radial hacia el héroe) / ⊥#111 SPEED (CV de MAGNITUDES): los tres son CINÉTICOS (leen headingIntent/speedIntent, el vector de MOVIMIENTO); ENCIRCLE es POSICIONAL/motion-AGNÓSTICO (lee sólo el rumbo hero→mob de la POSICIÓN — funciona con mobs QUIETOS en windup). Un anillo de mobs QUIETOS cercando al héroe ⇒ ENCIRCLE alto (posiciones repartidas) PERO ORIENT/CONVERGE/SPEED los EXCLUYEN (sin traslación). Ángulo-de-POSICIÓN ⊥ vector-de-MOVIMIENTO. ⊥#109 COLUMN (forma/elongación de la covarianza de POSICIONES alrededor de SU centroide — invariante al héroe; ENCIRCLE es hero-céntrico: rumbos DESDE el héroe): una columna que apunta AL héroe ⇒ column2/encircle0 (un gran hueco), una columna tangencial ⇒ column2/encircle bajo, un anillo ⇒ column0/encircle2. ⊥#107 DISPERSE (spread RADIAL = distancia media al centroide, ESCALA/magnitud px; ENCIRCLE es angular/adimensional): un anillo GRANDE ⇒ disperse alto/encircle2, un anillo PEQUEÑO ⇒ disperse bajo/encircle2 (K invariante a la escala radial). ⊥#87 PACKHARVEST (CONTEO/cohesión, EXTENSIVA — K es INVARIANTE al conteo: 4 mobs repartidos vs 12 repartidos ⇒ MISMO cerco). ⊥#106 MOTLEY (cardinalidad de e.type). ⊥#84 SKIRMISH (fracción ranged). ⊥#90 HEADING (rumbo de MOVIMIENTO de 1 víctima). ⊥ FRENZY/CADENCE#67/COMBO (TEMPO/tasa temporal — ENCIRCLE es geométrico/instantáneo). ⊥ Erudición [log temporal]. ⊥ #83/#85/#86 [estado DINÁMICO vida/CC/DoT — ENCIRCLE lee sólo POSICIÓN]. ⊥override/⊥#74/⊥#91 [posición ≠ afijo/zona]. Canal FRESCO `encircleFind` — NINGUNA de las 54 flags #59-#112 lo usa; recurso TRANSITORIO NUEVO h.encircleBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio encircleBountyCap, badge ⊚.
export const ENCIRCLE_SURGE = {
  enabled: true,             // LIVE (EVO#113, 55º flag) — CAS-2672 LIVE flip. CEO Gate 1/2 + DARK QA (CAS-2670 PASS 9/9) + CEO Gate 2/2 ALL PASS. Config-only 1-line flip (mirror #108-#112). Seams (kill grant + badge/VM) go live; sim.js/render.js/game.js UNCHANGED (already built & DARK-QA'd byte-neutral).
  channel: "encircleFind",   // canal FRESCO (fichas de cerco por rematar RODEADO POR TODOS LOS FLANCOS — la manada reparte el círculo, sin arco de escape) — NINGUNA de las 54 flags #59-#112 lo usa. Distinto por CONSTRUCCIÓN de flankFind #108 (CONCENTRACIÓN R en UN arco — estadística OPUESTA sobre los MISMOS rumbos)/convergeFind #112 (velocidad radial signada)/orientFind #110 (dispersión de DIRECCIÓN de movimiento)/columnFind #109 (forma de POSICIONES)/disperseFind #107 (spread radial)/wardRegen #59 (cobertura de sectores de JUGADORES, HP sostenido). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la cobertura = 1−mayorHueco/2π de los rumbos hero→mob de los mobs VIVOS dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110/#111/#112 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS CON rumbo definido (d≥ε) en radio para que la COBERTURA esté DEFINIDA: con <3 el "cerco" es degenerado (1 mob ⇒ hueco 360° trivial; 2 ⇒ dos huecos ⇒ cerco a medias) ⇒ K indefinido ⇒ 0. ≥3 ⇒ un reparto angular genuino. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su rumbo NO entra) ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 otros vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midCover: 0.50,            // umbral de cobertura K para la banda SEMI-CERCADO/leaning (peso 1): K≥0.50 (mayorHueco ≤180° — el héroe está rodeado en más de medio círculo). Adimensional [0,1). CEO balance knob.
  hiCover: 0.75,             // umbral de cobertura K para la banda CERCO/anillo (peso 2): K≥0.75 (mayorHueco ≤90° — rodeado por casi todas las direcciones, sin arco de escape amplio). K<midCover (amontonados en un costado, gran arco abierto) ⇒ 0. Umbrales sobre la COBERTURA (float [0,1)). CEO balance knob.
  weights: { ring: 2, leaning: 1 },   // PESO de un remate por la BANDA de COBERTURA angular de la formación VIVA en radio: CERCO/anillo (K ≥hiCover) pesa 2; SEMI-CERCADO/leaning (≥midCover) pesa 1; amontonados en un costado (<midCover) ⇒ 0. Reward = rematar RODEADO por todos los flancos, no cuando la manada se apiña en un solo costado dejando escape. CEO balance knobs.
  encircleBountyCap: 2,      // SUB-CAP DURO PROPIO de las fichas de cerco por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.charge)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE COBERTURA (score∈{0,1,2}). Más rodeado por todos los flancos = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (amontonados/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate SEMI-CERCADO, K≥midCover): +1 ficha de cerco por kill. "remataste rodeado en más de medio círculo".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno CERCO/anillo, K≥hiCover): +2 fichas por kill. "remataste rodeado por todos los flancos, sin arco de escape". CEO balance knobs.
  ],
};

// CAS-2675: REMATE DE FONDO (DEPTH_SURGE, EVO#114 DARK) — EJE FRESCO ESTRUCTURAL/GEOMÉTRICO RADIAL PROFUNDIDAD / DISPERSIÓN DE DISTANCIAS-AL-HÉROE de la MANADA VIVA alrededor del héroe (cuán ESCALONADA EN PROFUNDIDAD está la manada VIVA respecto al héroe en el instante del kill: un ANILLO DELGADO UNIFORME [todos los mobs a ~un mismo radio, poca profundidad] vs una COLUMNA ESCALONADA que se extiende de CERCA a LEJOS [rangos a distintos radios, mucha profundidad radial]). MÉTRICA = el COEFICIENTE DE VARIACIÓN CV∈[0,∞) = stddev/media de las DISTANCIAS d_i=|e−h|=√((e.x−h.x)²+(e.y−h.y)²) de los mobs VIVOS en radio: CV≈0 ⇒ todos a la MISMA distancia (fondo plano/anillo delgado); CV alto ⇒ distancias maximalmente DISPARES (escalonados cerca+lejos). Un ESCALAR GEOMÉTRICO ADIMENSIONAL AGREGADO (CV = 2º momento normalizado por la media ⇒ escala INTENSIVA, invariante al conteo Y a la escala absoluta: un anillo GRANDE y uno PEQUEÑO dan el MISMO CV bajo; una columna escalonada da CV alto sin importar el tamaño absoluto) derivado SÓLO de las DISTANCIAS-MAGNITUD hero→mob (√ de las POSICIONES replicadas de G.enemies — la MISMA fuente de POSICIÓN server-auth que #108 FLANK / #113 ENCIRCLE usan para sus RUMBOS, pero la MAGNITUD RADIAL en vez del ÁNGULO, NO e.vx/e.vy INERTES). Camino al 56º flag (serializa tras #113 ENCIRCLE_SURGE LIVE&served 666986da9605/815, base HEAD 88c0166).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack RADIAL DEPTH = CV de las distancias al héroe) → **PASA sin pivote** (los 3 criterios): (a) DATO accesible — la distancia hero→mob por mob EXISTE server-auth (√ de las POSICIONES replicadas de G.enemies, LA MISMA fuente que #108 FLANK/#113 ENCIRCLE usan para su ángulo — NO e.vx/e.vy INERTES); (b) score BAND-ABLE — CV∈[0,∞) adimensional con umbrales midCV(0.25)/hiCV(0.50); (c) ⊥ vecinos POSICIONALES: es RADIAL-MAGNITUD (dispersión de DISTANCIAS), limpiamente ⊥ a TODOS los ejes ANGULARES (#108 FLANK / #110 ORIENT / #113 ENCIRCLE = ángulos/rumbos) y ⊥ #112 CONVERGE (velocidad radial SIGNADA CINÉTICA vs dispersión de distancia ESTÁTICA).
//  · CRUX ⊥#107 DISPERSE (spread-radial: distancia MEDIA de los mobs al CENTROIDE de la manada, en px ABSOLUTOS/escala-DEPENDIENTE): DEPTH = dispersión de la DISTANCIA-AL-HÉROE y CV ADIMENSIONAL ⇒ un anillo GRANDE (r250) y uno PEQUEÑO (r60) dan DISPERSE distinto (spread 250 vs 60, bandas 2 vs ≤1) pero AMBOS DEPTH≈0 (distancias uniformes, CV≈0); una columna ESCALONADA cerca+lejos da DEPTH alto sin importar la escala absoluta. NO es re-mapeo: anillo grande ⇒ disperse2/depth0; columna corta cerca+lejos del héroe ⇒ disperse0(spread pequeño)/depth2(distancias dispares) — OPUESTOS EN AMBOS EJES. Referencia (centroide-de-la-manada ⊥ el-héroe) + dimensión (px-absoluto ⊥ CV-adimensional) DISTINTAS.
//  · CRUX ⊥#109 COLUMN (forma/ELONGACIÓN de la covarianza 2×2 de POSICIONES alrededor de SU centroide, HERO-AGNÓSTICO): DEPTH = dispersión RADIAL DESDE el héroe (hero-céntrico). Una columna que APUNTA AL héroe (radial) ⇒ column2 (colineal)/depth2 (distancias escalonadas); una columna TANGENCIAL (perpendicular al rumbo del héroe, todos a ~igual distancia) ⇒ column2 (MISMA elongación)/depth0 (distancias uniformes) — MISMO COLUMN, OPUESTO DEPTH; un anillo ⇒ column0 (isótropo)/depth0; una nube isótropa en ángulo pero a radios dispares ⇒ column0/depth2 (4 cuadrantes). Forma-alrededor-del-centroide ⊥ profundidad-radial-desde-el-héroe.
//  · CRUX ⊥#113 ENCIRCLE (COBERTURA ANGULAR K=1−mayorHueco/2π de los rumbos hero→mob) / ⊥#108 FLANK (CONCENTRACIÓN angular R) / ⊥#110 ORIENT (dispersión de rumbos de MOVIMIENTO): los tres son ANGULARES (leen el ÁNGULO); DEPTH es RADIAL-MAGNITUD (lee sólo la DISTANCIA). Un anillo delgado UNIFORME ⇒ ENCIRCLE 2 (cerco total)/DEPTH 0 (distancias iguales) — OPUESTOS; una columna radial ⇒ ENCIRCLE 0 (un solo arco)/DEPTH 2 (escalonada) — OPUESTOS. Ángulo ⊥ distancia. ⊥#112 CONVERGE/#111 SPEED (CINÉTICOS — leen el vector de MOVIMIENTO; DEPTH es POSICIONAL/motion-AGNÓSTICO: una columna escalonada de mobs QUIETOS ⇒ DEPTH alto PERO los cinéticos los EXCLUYEN). ⊥#87 PACKHARVEST (CONTEO EXTENSIVA — CV invariante al conteo). ⊥#106 MOTLEY (cardinalidad de e.type). ⊥#84 SKIRMISH (fracción ranged). ⊥#90 HEADING (rumbo de MOVIMIENTO de 1 víctima). ⊥ APEX_PROXIMITY [distancia hero↔UN apex — DEPTH es la DISPERSIÓN de las distancias de la MANADA, no la distancia a uno]. ⊥ FRENZY/CADENCE#67/COMBO (TEMPO/tasa temporal — DEPTH es geométrico/instantáneo). ⊥ Erudición [log temporal]. ⊥ #83/#85/#86 [estado DINÁMICO vida/CC/DoT — DEPTH lee sólo POSICIÓN]. ⊥override/⊥#74/⊥#91 [posición ≠ afijo/zona]. Canal FRESCO `depthFind` — NINGUNA de las 55 flags #59-#113 lo usa; recurso TRANSITORIO NUEVO h.depthBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio depthBountyCap, badge ⇕.
export const DEPTH_SURGE = {
  enabled: true,             // LIVE (EVO#114, 56º flag) — CAS-2677 config-only 1-línea flip false→true. CEO Gate 1/2 + DARK QA (CAS-2676 PASS 9/9) + Gate 2/2 PASSED. Remate de Fondo LIVE.
  channel: "depthFind",      // canal FRESCO (fichas de fondo por rematar en medio de una manada ESCALONADA EN PROFUNDIDAD — rangos de cerca a lejos) — NINGUNA de las 55 flags #59-#113 lo usa. Distinto por CONSTRUCCIÓN de disperseFind #107 (spread radial px ABSOLUTO alrededor del CENTROIDE)/encircleFind #113 (cobertura ANGULAR)/flankFind #108 (concentración ANGULAR)/columnFind #109 (forma de POSICIONES)/convergeFind #112 (velocidad radial SIGNADA). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el CV = stddev/media de las distancias hero→mob de los mobs VIVOS dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110/#111/#112/#113 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS en radio para que la PROFUNDIDAD esté DEFINIDA: con <3 el CV es degenerado (1 mob ⇒ CV 0 trivial; 2 ⇒ CV frágil) ⇒ 0. ≥3 ⇒ una dispersión radial genuina. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su distancia NO entra) ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 otros vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midCV: 0.25,               // umbral de CV para la banda ESCALONADA/layered (peso 1): CV≥0.25 (distancias moderadamente dispares — algo de fondo). Adimensional. CEO balance knob.
  hiCV: 0.50,                // umbral de CV para la banda PROFUNDA/deep (peso 2): CV≥0.50 (distancias maximalmente dispares — columna de cerca a lejos). CV<midCV (anillo delgado/fondo plano) ⇒ 0. Umbrales sobre el CV adimensional. CEO balance knob.
  weights: { deep: 2, layered: 1 },   // PESO de un remate por la BANDA de PROFUNDIDAD radial de la formación VIVA en radio: PROFUNDA/deep (CV ≥hiCV) pesa 2; ESCALONADA/layered (≥midCV) pesa 1; anillo delgado/fondo plano (<midCV) ⇒ 0. Reward = rematar en medio de una manada escalonada de cerca a lejos, no un anillo delgado uniforme. CEO balance knobs.
  depthBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de fondo por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.deep)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE PROFUNDIDAD (score∈{0,1,2}). Más escalonada en profundidad = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (anillo delgado/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate ESCALONADO, CV≥midCV): +1 ficha de fondo por kill. "remataste con la manada extendida en profundidad".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno FONDO/columna cerca+lejos, CV≥hiCV): +2 fichas por kill. "remataste con la manada escalonada de cerca a lejos". CEO balance knobs.
  ],
};

// CAS-2680: REMATE DE TALLA DISPAR (SIZECLASS_SURGE, EVO#115 DARK) — EJE FRESCO DE ATRIBUTO / DISPERSIÓN DE TALLA-CLASE (size-class / radio físico del TIPO) de la MANADA VIVA alrededor del héroe (cuán DISPAR EN TAMAÑO es la manada VIVA en el instante del kill: una manada MONO-TALLA [todos los mobs del MISMO calibre físico, p.ej. 3 orcos ~size22] vs una manada de TALLAS MEZCLADAS que va de menudos a colosales [p.ej. rata15 + orco22 + gólem36, escalas dispares]). MÉTRICA = el COEFICIENTE DE VARIACIÓN CV∈[0,∞) = stddev/media de las TALLAS s_i = ETPL[e.type].size (la MISMA fuente ESTÁTICA que #88 BULK, la MOLE FÍSICA BASE del TIPO — NO e.tpl.size inflado por afijo/campeón, NO e.hp DINÁMICO #86, NO e.vx/e.vy INERTES) de los mobs VIVOS en radio: CV≈0 ⇒ todos del MISMO calibre (talla uniforme/mono-clase); CV alto ⇒ tallas maximalmente dispares (menudos + colosales mezclados). Un ESCALAR DE ATRIBUTO ADIMENSIONAL AGREGADO (CV = 2º momento normalizado por la media ⇒ escala INTENSIVA, invariante al conteo Y a la escala absoluta de la talla) derivado SÓLO del ATRIBUTO DE TAMAÑO ESTÁTICO por TIPO. Camino al 57º flag (serializa tras #114 DEPTH_SURGE LIVE&served f9aa47be9af3/815, base HEAD 2230a8c6).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (pack SIZE-CLASS DISPERSION = CV de las tallas de la manada) → **PASA sin pivote** (los 3 criterios): (a) DATO accesible — la talla por mob EXISTE server-auth (ETPL[e.type].size, escalar entero determinista por template, LA MISMA fuente que #88 BULK — NO e.vx/e.vy INERTES); (b) score BAND-ABLE — CV∈[0,∞) adimensional con umbrales midCV(0.15)/hiCV(0.35); (c) ⊥ #88 BULK: BULK = la talla BANDA de UNA víctima (1er momento/MAX-de-1), SIZECLASS = la DISPERSIÓN CV de las tallas del PACK (2º momento) ⇒ componentes INDEPENDIENTES (mirror EXACTO de #111 SPEED-CV ⊥ #94 SWIFT-base-de-1).
//  · CRUX ⊥#106 MOTLEY (cardinalidad de e.type = nº de TIPOS DISTINTOS, IDENTIDAD; SIZECLASS = CV de la MAGNITUD de talla, ATRIBUTO NUMÉRICO): las dos métricas DISOCIAN en los 4 cuadrantes porque la talla NO está determinada por la cardinalidad de tipos. (1) MISMA cardinalidad, distinta dispersión: {rat,bat,wolf} = 3 tipos ⇒ motley2, tallas {15,14,18} CV≈0.11 ⇒ sizeClass0 VS {rat,bat,golem} = 3 tipos ⇒ motley2, tallas {15,14,36} CV≈0.47 ⇒ sizeClass2 (MISMO motley 2, OPUESTO sizeClass). (2) Distinta cardinalidad, MISMA dispersión: {orc,orc,orc} = 1 tipo ⇒ motley0, CV0 ⇒ sizeClass0 VS {rat,bat,wolf} = 3 tipos ⇒ motley2, CV≈0.11 ⇒ sizeClass0 (OPUESTO motley, MISMO sizeClass 0). (3) Inverso pleno: {rat,rat,golem} = 2 tipos ⇒ motley1, tallas {15,15,36} CV≈0.45 ⇒ sizeClass2 (motley bajo/sizeClass alto) VS {rat,bat,skeleton,spearman,wraith} = 5 tipos ⇒ motley2, tallas {15,14,20,19,20} CV≈0.13 ⇒ sizeClass0 (motley alto/sizeClass bajo). IDENTIDAD-DE-TIPO ⊥ MAGNITUD-DE-TALLA.
//  · CRUX ⊥#88 BULK (la talla BANDA de UNA víctima, ESTÁTICA/1er momento): SIZECLASS = CV de las tallas del PACK VIVO (2º momento/DISPERSIÓN) ⇒ 3 orcos (todos size22) ⇒ bulk alto (cada orco es voluminoso)/sizeClass0 (mono-talla, CV0) OPUESTOS; {rat,bat,golem} rematando la rata ⇒ bulk bajo (la rata es menuda)/sizeClass2 (tallas dispares) OPUESTOS (mirror EXACTO de #111 SPEED-CV ⊥ #94 SWIFT-base). Además SIZECLASS lee la talla BASE del TIPO (ETPL[e.type].size) que #74 afijo / campeón (e.tpl.size inflado) NO alteran ⇒ ⊥ afijo/zona. ⊥#107 DISPERSE (spread radial de POSICIONES px) / ⊥#113 ENCIRCLE (cobertura ANGULAR) / ⊥#114 DEPTH (CV de DISTANCIAS-al-héroe) / ⊥#109 COLUMN (forma de posiciones) / ⊥#108 FLANK (ángulo): SIZECLASS es un eje de ATRIBUTO (talla), NO de posición/distancia/ángulo. ⊥#112 CONVERGE/#111 SPEED/#110 ORIENT (CINÉTICOS — vector de MOVIMIENTO; SIZECLASS es ESTÁTICO/motion-AGNÓSTICO: una manada de tallas dispares QUIETA ⇒ sizeClass alto PERO los cinéticos la EXCLUYEN). ⊥#87 PACKHARVEST (CONTEO EXTENSIVA — CV invariante al conteo). ⊥#84 SKIRMISH (fracción ranged). ⊥#90 HEADING (rumbo de MOVIMIENTO de 1 víctima). ⊥#86 vida-fracción/#85 CC/#83 DoT [estado DINÁMICO — SIZECLASS lee sólo la TALLA ESTÁTICA del template]. ⊥ FRENZY/CADENCE#67 (TEMPO/tasa temporal — SIZECLASS es geométrico/instantáneo). ⊥ Erudición [log temporal]. Canal FRESCO `sizeClassFind` — NINGUNA de las 56 flags #59-#114 lo usa; recurso TRANSITORIO NUEVO h.sizeClassBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio sizeClassBountyCap, badge ◈.
export const SIZECLASS_SURGE = {
  enabled: true,             // LIVE (EVO#115, 57º flag) — CAS-2682 config-only 1-línea flip false→true tras CEO Gate 1/2 → DARK QA CAS-2681 PASS 18/18 → CEO Gate 2/2. Arc #59-#115.
  channel: "sizeClassFind",  // canal FRESCO (fichas de talla por rematar en medio de una manada de TALLAS DISPARES — menudos + colosales mezclados) — NINGUNA de las 56 flags #59-#114 lo usa. Distinto por CONSTRUCCIÓN de bulkFind #88 (talla BANDA de UNA víctima)/motleyFind #106 (cardinalidad de e.type)/depthFind #114 (CV de DISTANCIAS)/disperseFind #107 (spread radial px). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el CV = stddev/media de las tallas de los mobs VIVOS dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110/#111/#112/#113/#114 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS en radio para que la DISPERSIÓN DE TALLA esté DEFINIDA: con <3 el CV es degenerado (1 mob ⇒ CV 0 trivial; 2 ⇒ CV frágil) ⇒ 0. ≥3 ⇒ una dispersión de talla genuina. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su talla NO entra) ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 otros vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midCV: 0.15,               // umbral de CV para la banda MEZCLADA/mixed (peso 1): CV≥0.15 (tallas moderadamente dispares — algo de mezcla). Adimensional. CEO balance knob.
  hiCV: 0.35,                // umbral de CV para la banda DISPAR/motley (peso 2): CV≥0.35 (tallas maximalmente dispares — menudos + colosales). CV<midCV (mono-talla/calibre uniforme) ⇒ 0. Umbrales sobre el CV adimensional. CEO balance knob.
  weights: { motley: 2, mixed: 1 },   // PESO de un remate por la BANDA de DISPERSIÓN DE TALLA de la formación VIVA en radio: DISPAR/motley (CV ≥hiCV) pesa 2; MEZCLADA/mixed (≥midCV) pesa 1; mono-talla/calibre uniforme (<midCV) ⇒ 0. Reward = rematar en medio de una manada de tallas dispares, no una manada de un solo calibre. CEO balance knobs.
  sizeClassBountyCap: 2,     // SUB-CAP DURO PROPIO de las fichas de talla por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.motley)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE DISPERSIÓN DE TALLA (score∈{0,1,2}). Más dispar en talla = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (mono-talla/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate MEZCLADO, CV≥midCV): +1 ficha de talla por kill. "remataste con la manada de tallas mixtas".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en plena TALLA DISPAR/menudos+colosales, CV≥hiCV): +2 fichas por kill. "remataste con la manada de tallas maximalmente dispares". CEO balance knobs.
  ],
};

// CAS-2684: REMATE DE CARRUSEL (ORBIT_SURGE, EVO#116 DARK) — EJE CINÉTICO/ROTACIONAL COHESIÓN DE VELOCIDAD ORBITAL / CIRCULACIÓN NETA de la MANADA VIVA alrededor del héroe (¿la manada ORBITA/estrafea COORDINADA en un carrusel alrededor del héroe vs embiste/huye en radial o gira en desorden?). PIVOTE del eje RECOMENDADO velCohesionSurge (mean-resultant-length R / 1−CV de rumbos): FALLA ⊥ por CONSTRUCCIÓN — R de rumbos = EXACTAMENTE 1−orientSpread (#110 ORIENT ya envía orientSpread=1−R de headingIntent ABSOLUTO); un re-mapeo AFÍN (pendiente −1) de un flag YA LIVE. El FALLBACK del issue tempoBurstSurge (kill-rate en ventana) TAMBIÉN falla: es un re-mapeo MONÓTONO de los stacks de FRENZY #67 (kill-streak con decay) — el propio pre-flight de #110 ya lo rechazó. Un campo de velocidad alrededor de un punto tiene TRES proyecciones de COHESIÓN: (a) acuerdo de rumbo en world-frame = #110 ORIENT (LIVE); (b) radial hacia/desde el héroe = #112 CONVERGE (LIVE); (c) TANGENCIAL/rotacional = ESTA — la ÚNICA pierna de "velocity-cohesion" NO enviada. MÉTRICA = la CIRCULACIÓN NETA C∈[0,1] = |Σ vᵢ·(mᵢ·t̂ᵢ)| / (Σ vᵢ) = MEDIA PONDERADA POR VELOCIDAD del coseno TANGENCIAL SIGNADO, donde t̂ᵢ = perpendicular CCW de la dirección mob→hero (t̂ = rotar u 90°: t̂=(−uy,ux)), mᵢ=headingIntent (dirección de paso, MISMA rama de IA que #110/#112), vᵢ=speedIntent (magnitud, MISMA rama que #111/#112 — NO e.vx/e.vy INERTES). C≈1 ⇒ toda la manada ORBITA COHERENTE en la MISMA dirección rotacional (carrusel/anillo de estrafeo); C≈0 ⇒ movimiento RADIAL (embiste/huye, sin tangencial) O rotación MIXTA (mitad CW/mitad CCW ⇒ se cancela). Es la VORTICIDAD/CURL del campo de velocidad alrededor del héroe, magnitud-INVARIANTE (/Σv), hero-relativa. Un ESCALAR CINÉTICO ADIMENSIONAL AGREGADO derivado del VECTOR DE MOVIMIENTO (dirección×magnitud), la PROYECCIÓN ORTOGONAL a la radial de #112. Camino al 58º flag (serializa tras #115 SIZECLASS_SURGE LIVE&served fee53af8af16/815, base HEAD 83e56dfe).
//  · PRE-FLIGHT GATE del EJE RECOMENDADO (velCohesionSurge = R/1−CV de rumbos de velocidad) → **FALLA ⊥#110 ORIENT** (R = 1−orientSpread, re-mapeo AFÍN de un flag LIVE); FALLBACK tempoBurstSurge → **FALLA ⊥#67 FRENZY** (re-mapeo monótono de kill-streak stacks, ya rechazado por el pre-flight de #110). ⇒ PIVOTE a la 3ª pierna de VELOCITY-COHESION: la COHESIÓN ROTACIONAL/ORBITAL (circulación neta tangencial), que NINGUNO de los 57 flags #59-#115 mide. Los 3 criterios PASAN: (a) DATO — vᵢ=speedIntent + mᵢ=headingIntent server-auth (MISMA fuente que #112 CONVERGE, NO e.vx/e.vy INERTES); (b) BAND-ABLE — C∈[0,1] con umbrales midOrbit(0.30)/hiOrbit(0.60); (c) ⊥ #112 CONVERGE: la proyección RADIAL (cos, m·u) ⊥ la TANGENCIAL (sin, m·t̂) — las DOS componentes ORTOGONALES del MISMO vector de velocidad respecto al eje mob→hero.
//  · CRUX ⊥#112 CONVERGE (radial cos ⊥ tangencial sin — descomposición ORTOGONAL del vector de velocidad, 4 cuadrantes): manada embistiendo de frente ⇒ converge2/orbit0 (todo radial, 0 tangencial); manada orbitando CCW en carrusel ⇒ converge0/orbit2 (0 radial, todo tangencial); manada en ESPIRAL (embiste + gira) ⇒ converge1/orbit1 (ambas componentes); manada huyendo/millando ⇒ converge0/orbit0 (radial saliente, sin circulación coherente). C_converge=Σ(v·cos)/Σv ⊥ C_orbit=|Σ(v·sin)|/Σv.
//  · CRUX ⊥#110 ORIENT (acuerdo de rumbo WORLD-frame, hero-INVARIANTE ⊥ circulación hero-RELATIVA): un CARRUSEL (todos orbitando CCW alrededor del héroe) ⇒ cada mob apunta a una dirección ABSOLUTA distinta ⇒ orientSpread ALTO (orient2) PERO orbit2 (circulación coherente); una manada MARCHANDO al norte en bloque (world-coherente ⇒ orient0) repartida alrededor del héroe ⇒ los signos tangenciales se MEZCLAN (mob al este del héroe yendo al norte = CCW+; al oeste = CW−) ⇒ se cancelan ⇒ orbit BAJO ⇒ orient0/orbit0. Acuerdo-absoluto ⊥ circulación-hero-céntrica (4 cuadrantes). CRUX ⊥#111 SPEED (CV de MAGNITUDES, dirección-agnóstico ⊥ dirección tangencial, magnitud-INVARIANTE): carrusel a ritmo uniforme ⇒ orbit2/speed0; carrusel a ritmos dispares ⇒ orbit2/speed2; embestida radial uniforme ⇒ orbit0/speed0; embestida radial dispar ⇒ orbit0/speed2 (4 cuadrantes). ⊥#90 HEADING (rumbo de UNA víctima RELATIVO al héroe, MAX/1er momento — ORBIT es la CIRCULACIÓN AGREGADA tangencial). ⊥#107 DISPERSE/#108 FLANK/#109 COLUMN/#113 ENCIRCLE/#114 DEPTH (POSICIONES/distancias/ángulos — ORBIT lee el VECTOR DE MOVIMIENTO: un anillo de mobs QUIETOS ⇒ encircle2 PERO orbit0 [sin traslación ⇒ speedIntent null ⇒ EXCLUIDOS]). ⊥#115 SIZECLASS/#88 BULK/#106 MOTLEY (ATRIBUTOS estáticos del template — ORBIT es CINÉTICO). ⊥#87 PACKHARVEST (CONTEO — la media C es INVARIANTE al conteo). ⊥#84 SKIRMISH (fracción ranged). ⊥#86/#85/#83 [estado DINÁMICO — el frost-slow #85 escala vᵢ pero /Σv lo cancela en la dirección]. ⊥ FRENZY#67/CADENCE#67 (TEMPO/tasa temporal — el FALLBACK que FALLÓ; ORBIT es CINÉTICO/instantáneo). ⊥override/⊥#74/⊥#91 [velocidad ≠ afijo/zona: C es INVARIANTE a un factor de escala UNIFORME]. Canal FRESCO `orbitFind` — NINGUNA de las 57 flags #59-#115 lo usa; recurso TRANSITORIO NUEVO h.orbitBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio orbitBountyCap, badge ⟳.
export const ORBIT_SURGE = {
  enabled: true,             // LIVE (EVO#116, 58º flag) — CAS-2686 config-only 1-línea flip false→true tras CEO Gate 1/2 → DARK QA CAS-2685 PASS 18/18 (0 commits, byte-neutral OFF) → CEO Gate 2/2. Remate de Carrusel LIVE (arc #59-#116).
  channel: "orbitFind",      // canal FRESCO (fichas de carrusel por rematar en medio de una manada que ORBITA COORDINADA alrededor del héroe) — NINGUNA de las 57 flags #59-#115 lo usa. Distinto por CONSTRUCCIÓN de convergeFind #112 (velocidad RADIAL signada)/orientFind #110 (dispersión de rumbo WORLD)/speedFind #111 (CV de magnitud)/headingFind #90 (rumbo de 1 víctima). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la circulación C se computa sobre los mobs VIVOS EN MOVIMIENTO dentro del radio del héroe. Mirror #87/#106/#107/#108/#109/#110/#111/#112/#113/#114/#115 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS EN MOVIMIENTO en radio para que la CIRCULACIÓN esté DEFINIDA: con <3 es degenerada ⇒ 0. ≥3 ⇒ una circulación genuina. Combinado con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su vector NO entra) ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 otros vivos en movimiento ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midOrbit: 0.30,            // umbral de C para la banda SWIRL/remolino suelto (peso 1): C≥0.30 (circulación tangencial moderada — algo de orbitación coordinada). Adimensional ∈[0,1]. CEO balance knob.
  hiOrbit: 0.60,             // umbral de C para la banda CARRUSEL/carousel (peso 2): C≥0.60 (circulación tangencial fuerte — carrusel/anillo de estrafeo coherente). C<midOrbit (radial/mixto) ⇒ 0. Umbrales sobre C adimensional ∈[0,1]. CEO balance knob.
  weights: { carousel: 2, swirl: 1 },   // PESO de un remate por la BANDA de CIRCULACIÓN ORBITAL de la formación VIVA en radio: CARRUSEL (C ≥hiOrbit) pesa 2; SWIRL/remolino (≥midOrbit) pesa 1; radial/mixto (<midOrbit) ⇒ 0. Reward = rematar en medio de una manada que ORBITA coordinada, no una que embiste/huye en radial. CEO balance knobs.
  orbitBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de carrusel por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.carousel)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE CIRCULACIÓN ORBITAL (score∈{0,1,2}). Más coherente el carrusel = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (radial/mixto/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en SWIRL/remolino suelto, C≥midOrbit): +1 ficha de carrusel por kill. "remataste con la manada orbitando suelta".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno CARRUSEL/anillo de estrafeo, C≥hiOrbit): +2 fichas por kill. "remataste con la manada orbitando en carrusel coherente". CEO balance knobs.
  ],
};

// CAS-2688: REVUELO CINÉTICO (ACCEL_SURGE, EVO#117 DARK) — EJE de 2º ORDEN / CHURN: reward de rematar en medio de una manada en alto REVUELO CINÉTICO — mobs que CAMBIAN rápidamente su movimiento (fintas/juking, kiting, re-posicionamiento en ráfaga), NO merely que se muevan. La familia de VELOCIDAD (1er orden = el vector de movimiento INSTANTÁNEO v: rumbo world #110 ORIENT, magnitud-CV #111 SPEED, proyección RADIAL #112 CONVERGE, proyección TANGENCIAL #116 ORBIT) está AGOTADA (dirección, magnitud, y AMBAS proyecciones enviadas). EVO#117 abre una NUEVA familia cinética: la 2ª DERIVADA temporal del movimiento. MÉTRICA = churn C∈[0,1] = media_i |Δmᵢ| / refDelta, donde Δmᵢ = CAMBIO del vector de movimiento server-auth mᵢ=(vᵢ·rumboᵢ) entre ticks consecutivos (vᵢ=speedIntent, rumboᵢ=headingIntent — MISMA rama de IA server-auth que #110/#111/#112/#116, NO e.vx/e.vy INERTES), normalizado por un máximo de referencia refDelta. C≈0 ⇒ manada moviéndose a VELOCIDAD CONSTANTE (marcha pareja, carrusel liso — sin cambio ⇒ sin revuelo); C≈1 ⇒ manada fintando/reposicionando violentamente cada tick (revuelo/juking). Es la TASA-DE-CAMBIO del campo de movimiento, adimensional/intensiva, hero-agnóstica en su definición (mide el cambio de mᵢ, no su relación con el héroe). Un ESCALAR CINÉTICO de 2º ORDEN — ORTOGONAL a las 58 flags (ninguna mide la DERIVADA del movimiento). Camino al 59º flag (serializa tras #116 ORBIT_SURGE LIVE&served e7a8c60e844a/815, base HEAD 5769507).
//  · PRE-FLIGHT ⊥ (2º orden ⊥ 1er orden): las 4 flags de velocidad (#110/#111/#112/#116) son funciones del vector de movimiento INSTANTÁNEO mᵢ(t); ACCEL = |mᵢ(t)−mᵢ(t−1)|, la DERIVADA. Dissocian por CONSTRUCCIÓN: (a) manada RÁPIDA a velocidad CONSTANTE ⇒ speed/orient/converge/orbit ≠0 pero accel≈0 (Δ=0); (b) manada casi-QUIETA en desplazamiento neto pero FINTANDO ±180° cada tick ⇒ accel ALTO, speed/orbit bajos; (c) CARRUSEL liso a tasa angular constante ⇒ orbit2 pero accel=centrípeto-acotado (pequeño) vs ERRÁTICO ⇒ accel alto (⇒ orbit2 mapea a accel 0 Y 2 ⇒ accel NO es función de orbit). GEOM (mobs wander v=30): |Δm|=60·|sin(Δψ/2)| ⇒ Δψ=0(constante)⇒C0; Δψ=90°⇒C0.71; Δψ=180°(finta)⇒C1.
//  · CRUX ⊥#116 ORBIT (4 cuadrantes orbit×accel): CARRUSEL-CONSTANTE ⇒ orbit2/accel0; SPIN-UP (radial→tangente) ⇒ orbit2/accel2; MARCHA-CONSTANTE ⇒ orbit0/accel0; FINTA-EN-SITIO (este↔oeste) ⇒ orbit0/accel2 ⇒ los 4 rincones ⇒ ⊥. CRUX ⊥#112 CONVERGE / ⊥#110 ORIENT (misma disociación constante-vs-cambio: un embiste-frontal CONSTANTE ⇒ converge2/accel0; el mismo embiste alcanzado por un giro brusco ⇒ converge2/accel2). CRUX ⊥#111 SPEED (pack wander v uniforme ⇒ speedSpread≡0 mientras accel varía 0/1/2 ⇒ accel [derivada temporal] ⊥ speed [CV de magnitud instantánea]). ⊥#67 FRENZY / #94 SWIFT / CADENCE (TEMPO = kill-rate/ventana temporal del HÉROE — ACCEL es el 2º-orden del MOVIMIENTO DE LOS MOBS; un pico de revuelo ocurre con CERO kills). ⊥#115 SIZECLASS/#88 BULK/#106 MOTLEY (ATRIBUTOS de template estáticos — ACCEL es cinético dinámico). ⊥#107 DISPERSE/#108 FLANK/#109 COLUMN/#113 ENCIRCLE/#114 DEPTH (POSICIONES/distancias/ángulos — un anillo QUIETO ⇒ encircle2 PERO accel0 [sin traslación ⇒ excluido; y sin CAMBIO ⇒ 0]). ⊥#87 PACKHARVEST (CONTEO — la MEDIA es invariante al conteo). ⊥#86/#85/#83 dynamic-state: el frost-slow #85 escala vᵢ pero un pack CONSTANTE-slowed ⇒ accel0 (el slow no crea CAMBIO) mientras un pack juking-slowed ⇒ accel>0 ⇒ MISMO slow-factor, accel distinto ⇒ ACCEL NO es un re-mapeo del slow-flag (mide el PATRÓN de cambio, no la magnitud de la velocidad). Canal FRESCO `accelFind` — NINGUNA de las 58 flags #59-#116 lo usa; recurso TRANSITORIO NUEVO h.accelBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio accelBountyCap, badge ⚡.
export const ACCEL_SURGE = {
  enabled: true,             // LIVE (EVO#117, 59º flag) — CAS-2691 config-only flip. CEO Gate 2/2 PASSED (DARK QA CAS-2690 PASS 19/19, fp 15920977, 0-desync, byte-neutral OFF). ACCEL_SURGE.enabled false→true is the ONLY gameplay change. accelTick now runs GATED → per-mob TRANSIENT e._accPm/_accD/_accHas (enemies never serialized ⇒ 0 fp change).
  channel: "accelFind",      // canal FRESCO (fichas de revuelo por rematar en medio de una manada en alto CHURN cinético — que CAMBIA rápido su movimiento) — NINGUNA de las 58 flags #59-#116 lo usa. Distinto por CONSTRUCCIÓN de orbitFind #116 (tangencial INSTANTÁNEA)/convergeFind #112 (radial INSTANTÁNEA)/orientFind #110 (rumbo WORLD INSTANTÁNEO)/speedFind #111 (CV de magnitud INSTANTÁNEA): ACCEL = la DERIVADA temporal (2º orden) del vector de movimiento. Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: el churn C se computa sobre los mobs VIVOS EN MOVIMIENTO dentro del radio del héroe. Mirror #87/#106/…/#116 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS EN MOVIMIENTO con Δ definido (≥2 ticks de historia) en radio para que el churn esté DEFINIDO: con <3 es degenerado ⇒ 0. ≥3 ⇒ revuelo genuino. Con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ su Δ NO entra) ⇒ ANTI-AUTO-CONTEO. CEO balance knob.
  refDelta: 60,              // MÁXIMO DE REFERENCIA para normalizar |Δmᵢ| a [0,1] = 2× la velocidad de wander (30) ⇒ una FINTA de 180° de un mob a velocidad wander (|Δm|=2·30=60) mapea a churn 1.0; un giro de 90° (|Δm|=42.4) a 0.71; velocidad CONSTANTE (Δ=0) a 0. Adimensionaliza el churn. CEO balance knob.
  midChurn: 0.25,            // umbral de C para la banda JITTER/tembleque (peso 1): C≥0.25 (revuelo moderado — Δψ≳29° por tick). Adimensional ∈[0,1]. CEO balance knob.
  hiChurn: 0.55,             // umbral de C para la banda CHURN/revuelo (peso 2): C≥0.55 (revuelo fuerte — Δψ≳67° por tick, fintas/reposicionamiento violento). C<midChurn (movimiento ~constante) ⇒ 0. Umbrales sobre C adimensional ∈[0,1]. CEO balance knob.
  weights: { churn: 2, jitter: 1 },   // PESO de un remate por la BANDA de CHURN CINÉTICO de la formación VIVA en radio: CHURN/revuelo (C ≥hiChurn) pesa 2; JITTER/tembleque (≥midChurn) pesa 1; ~constante (<midChurn) ⇒ 0. Reward = rematar en medio de una manada que FINTA/reposiciona, no una que se desplaza a velocidad estable. CEO balance knobs.
  accelBountyCap: 2,         // SUB-CAP DURO PROPIO de las fichas de revuelo por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.churn)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE CHURN CINÉTICO (score∈{0,1,2}). Más revuelo = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (movimiento ~constante/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en JITTER/tembleque, C≥midChurn): +1 ficha de revuelo por kill. "remataste con la manada tembleando".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno CHURN/revuelo, C≥hiChurn): +2 fichas por kill. "remataste con la manada fintando/reposicionando en revuelo". CEO balance knobs.
  ],
};

// CAS-2693: REMATE DE ACOSO (AGGRO_FOCUS_SURGE, EVO#118 DARK) — ABRE una NUEVA familia: COMPOSICIÓN-DE-INTENCIÓN (no cómo se MUEVE la manada — eso es la familia CINÉTICA #110/#111/#112/#116/#117 — sino qué está TRATANDO de hacer). Reward de rematar en medio de una manada COORDINADA en aggro sobre TI: la FRACCIÓN de la manada VIVA en radio cuya IA está FIJADA/enganchada en el héroe (locked-on) vs deambulando/inactiva/huyendo/otro-objetivo. MÉTRICA = focus F∈[0,1] = (# mobs VIVOS en radio ENGANCHADOS en el héroe) / (# mobs VIVOS en radio), minMobs3, band hi/mid/low. F≈1 ⇒ toda la manada te ACOSA coordinada (locked-on); F≈0 ⇒ manada dispersa/deambulando, pocos fijados en ti. Es una FRACCIÓN AGREGADA sobre la manada VIVA, INTENSIVA (invariante al conteo), server-authoritative, DETERMINISTA. 🔑 PROXY server-auth AUTORIZADO por el issue: en single-player NO hay campo per-mob `aiTarget`/`heroId` (todo el aggro es implícitamente hacia el ÚNICO héroe) ⇒ se usa el PROXY DETERMINISTA LIVE más cercano = el ESTADO de la máquina de IA server-auth ENGANCHADO {chase,windup,strike,recover,shield} (aggro activa sobre el héroe — MISMO predicado que lastStandCount sim.js:3862 / bonfireUnsafe sim.js:8405, YA leído por la IA, replicado) vs NO-enganchado {idle,wander,flee} (deambula/huye — NO fijado en ti). Neutrales pacíficos (e.tpl.neutral && !e.hostile) NO enganchan ⇒ cuentan en el DENOMINADOR pero NUNCA en el numerador (parte de la manada viva pero no coordinada en ti). Un ESCALAR de INTENCIÓN AGREGADA — ORTOGONAL a las 59 flags (ninguna mide la FRACCIÓN de la manada FIJADA en el héroe). Camino al 60º flag (serializa tras #117 ACCEL_SURGE LIVE&served 48b919d17b6c/815, base HEAD 4cd3808).
//  · PRE-FLIGHT ⊥ (INTENCIÓN ≠ MOVIMIENTO ≠ ATRIBUTO ≠ POSICIÓN ≠ CONTEO):
//    ⊥#90 HEADING (rumbo de UNA víctima RELATIVO al héroe, MAX/1er momento) — AGGRO-FOCUS es la FRACCIÓN AGREGADA de la manada. Disociación: (a) UN cargador de frente (heading charge2) entre 5 mobs deambulando ⇒ heading ALTO/focus BAJO; (b) manada TODA en windup/strike sobre el héroe (ESTACIONARIOS ⇒ headingIntent null ⇒ heading NO puntúa) ⇒ focus1/heading0; (c) mitad huyendo (flee, heading fleeCos⇒0) mitad idle ⇒ heading0/focus0.
//    ⊥#84 SKIRMISH (FRACCIÓN ranged, e.tpl.ranged ATRIBUTO de template) — AGGRO-FOCUS = FRACCIÓN de aggro-target (ESTADO). Una manada melee 100% enganchada ⇒ focus ALTO/skirmish 0; una manada ranged deambulando/patrullando (no enganchada) ⇒ skirmish ALTO/focus BAJO.
//    ⊥ CINÉTICA #110/#111/#112/#116/#117 ACCEL (INTENCIÓN ≠ MOVIMIENTO): 4-CUAD vs ACCEL — (i) manada TODA en chase avanzando en LÍNEA RECTA a velocidad constante ⇒ focus1/accel0; (ii) manada deambulando (wander) fintando salvajemente ⇒ focus0/accel2; (iii) casters kiteando en chase que oscilan ⇒ focus1/accel2; (iv) manada wander a la deriva estable ⇒ focus0/accel0. 4-CUAD vs CONVERGE#112 — (i) manada TODA en windup sobre el héroe (ESTACIONARIA ⇒ headingIntent null ⇒ converge0) ⇒ focus1/converge0; (ii) manada en FLEE (NO enganchada ⇒ focus0) retrocediendo radial ⇒ focus0/converge−2(|radial| alto); (iii) manada en chase cerrando ⇒ focus1/converge2; (iv) manada wander a la deriva ⇒ focus0/converge~0. ⇒ el ESTADO enganchado ⊥ el vector de movimiento (un windup NO se mueve pero SÍ está fijado; un flee SE mueve pero NO está fijado).
//    ⊥#67 FRENZY/#94 SWIFT (composición-de-intención, NO kill-rate/ventana temporal) — focus puede ser 1.0 con CERO kills (una manada fijada en ti que aún no has tocado).
//    ⊥#115 SIZECLASS/#88 BULK/#106 MOTLEY (ATRIBUTOS de template) — la INTENCIÓN de targeting ≠ el atributo. Un pack de golems idle ⇒ bulk2/focus0; un pack de ratas todas en chase ⇒ bulk0/focus2.
//    ⊥#107 DISPERSE/#108 FLANK/#109 COLUMN/#113 ENCIRCLE/#114 DEPTH (POSICIONES/ángulos/distancias) — un ANILLO ESTACIONARIO todo en chase/windup sobre el héroe ⇒ encircle2 Y focus2 (co-ocurren PERO no se determinan: el MISMO anillo con la mitad en idle ⇒ encircle2/focus~0.5; una COLUMNA apretada toda en flee ⇒ column2/focus0). Las posiciones NO determinan el estado de aggro.
//    ⊥#87 PACKHARVEST (CONTEO — F es una FRACCIÓN, invariante al conteo: 3-de-3 enganchados y 6-de-6 enganchados ⇒ F=1 igual).
//    ⊥#86/#85/#83 (estado DINÁMICO de vida/slow/stun) — un pack frost-slowed (#85) SIGUE en estado chase (el slow escala la velocidad, NO cambia el estado de IA) ⇒ 100% aggro-locked ⇒ focus1 INDEPENDIENTE del slow-flag; un pack a baja vida (#86) puede estar todo en flee ⇒ focus0. ⊥#2510 CONTROL_HARVEST (densidad de CC e.stun/e.slowT): un pack todo-CC'd pero en estado chase ⇒ focus1/control2; un pack sin-CC todo deambulando ⇒ focus0/control0.
//    ⊥ FOCUS_FIRE #62 (passive CO-OP de PARTY: N jugadores concentrando fuego sobre el MISMO objetivo, canal goldFind) — AGGRO_FOCUS = fracción de la MANADA fijada en el HÉROE (canal FRESCO aggroFocusFind, seam de kill). Ejes, canales y direcciones OPUESTOS (mob→hero vs players→mob). Canal FRESCO `aggroFocusFind` — NINGUNA de las 59 flags #59-#117 lo usa; recurso TRANSITORIO NUEVO h.aggroFocusBounty, STATELESS (fuera del save allowlist + worldFingerprint), sub-cap propio aggroFocusBountyCap, badge ◎.
export const AGGRO_FOCUS_SURGE = {
  enabled: true,             // LIVE (EVO#118, 60º flag) — CAS-2696 config-only flip false→true tras CEO Gate 1/2+2/2. Ex-DARK CAS-2693 build. enabled:false ⇒ byte-neutral OFF (funciones de lectura PURAS gated + seam rama muerta + _aggroFocusPre=0 const inerte + badge NO despachado + h.aggroFocusBounty NUNCA creado). SNAPSHOT PURO (sin captura per-tick / sin update-gate, a diferencia de #117 ACCEL) ⇒ 0 estado nuevo. Flip config-only false→true tras CEO Gate 2/2.
  channel: "aggroFocusFind", // canal FRESCO (fichas de acoso por rematar en medio de una manada COORDINADA en aggro sobre el héroe — la FRACCIÓN fijada/enganchada en ti) — NINGUNA de las 59 flags #59-#117 lo usa. Distinto por CONSTRUCCIÓN de accelFind #117 (2º-orden cinético)/orbitFind #116 (tangencial)/convergeFind #112 (radial)/headingFind #90 (rumbo de 1 víctima)/skirmishFind #84 (fracción ranged ATRIBUTO): AGGRO-FOCUS = la fracción de aggro-ESTADO (INTENCIÓN, no movimiento ni atributo). Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px) de la vecindad VIVA: la fracción F se computa sobre los mobs VIVOS dentro del radio del héroe. Mirror #87/#106/…/#117 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS en radio (DENOMINADOR) para que la fracción esté DEFINIDA: con <3 es degenerada ⇒ 0. ≥3 ⇒ una manada genuina. Con el filtro de muertos (la víctima ya tiene e.dead=true en el TOP ⇒ NO cuenta ni en numerador ni denominador) ⇒ ANTI-AUTO-CONTEO (un remate en solitario/pareja = <3 vivos ⇒ 0 ⇒ NO forrajea). CEO balance knob.
  midFocus: 0.34,            // umbral de F para la banda HARRYING/acoso parcial (peso 1): F≥0.34 (≈1/3 de la manada fijada en ti). Adimensional ∈[0,1]. CEO balance knob.
  hiFocus: 0.67,             // umbral de F para la banda LOCKED/acoso coordinado (peso 2): F≥0.67 (≈2/3+ de la manada coordinada en aggro sobre ti). F<midFocus (manada dispersa/deambulando) ⇒ 0. Umbrales sobre F adimensional ∈[0,1]. CEO balance knob.
  weights: { locked: 2, harrying: 1 },   // PESO de un remate por la BANDA de FRACCIÓN de AGGRO-FOCUS de la formación VIVA en radio: LOCKED/acoso coordinado (F ≥hiFocus) pesa 2; HARRYING/acoso parcial (≥midFocus) pesa 1; disperso (<midFocus) ⇒ 0. Reward = rematar en medio de una manada coordinada en aggro sobre TI, no una que deambula/te ignora. CEO balance knobs.
  aggroFocusBountyCap: 2,    // SUB-CAP DURO PROPIO de las fichas de acoso por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.locked)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE FRACCIÓN DE AGGRO-FOCUS (score∈{0,1,2}). Más manada fijada en ti = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (manada dispersa/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en HARRYING/acoso parcial, F≥midFocus): +1 ficha de acoso por kill. "remataste con ~1/3 de la manada fijada en ti".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno LOCKED/acoso coordinado, F≥hiFocus): +2 fichas por kill. "remataste con la manada coordinada en aggro sobre ti". CEO balance knobs.
  ],
};

// CAS-2698: QUIEBRE / REGATE (JERK_DIR_SURGE, EVO#119 DARK) — COMPLETA la familia CINÉTICA de 2º ORDEN abierta por #117 ACCEL, PARTIENDO el vector de aceleración en sus dos componentes ORTOGONALES: la RADIAL (cambio de RAPIDEZ — acelerar/frenar en línea recta) vs la TANGENCIAL (cambio de DIRECCIÓN — regatear/fintar/zigzaguear). #117 ACCEL mide la MAGNITUD |Δm| = √(radial²+tangencial²); JERK-SPLIT AÍSLA SÓLO la fracción TANGENCIAL (reorientación). MÉTRICA = jerkDir J∈[0,1] = Σ_i tangencialᵢ / Σ_i |Δmᵢ| sobre la manada VIVA EN MOVIMIENTO en radio, donde por cada mob se descompone Δmᵢ=mᵢ(t)−mᵢ(t−1) [mᵢ=vᵢ·rumboᵢ, MISMA fuente server-auth que #117: speedIntent×headingIntent, NO e.vx/e.vy] en su proyección RADIAL (a lo largo del rumbo PREVIO m̂ᵢ(t−1) = cambio de rapidez) y su complemento TANGENCIAL (⊥ al rumbo previo = reorientación). J≈1 ⇒ el churn de la manada es TODO reorientación (regate/zigzag puro a rapidez ~constante); J≈0 ⇒ el churn es TODO rapidez (acelerón/frenazo/reversa en línea recta). minMobs3, requiere media|Δm|≥minMeanDelta (piso anti-deriva) para estar DEFINIDO. FRACCIÓN AGREGADA INTENSIVA/ADIMENSIONAL, INVARIANTE a una escala UNIFORME de rapidez (J=cos(Δψ/2) para un giro puro — INDEPENDIENTE de v ⇒ ⊥ frost-slow #85). Un ESCALAR CINÉTICO de 2º ORDEN PROYECTADO — ORTOGONAL a las 60 flags. Camino al 61º flag (serializa tras #118 AGGRO_FOCUS_SURGE LIVE&served 2605e94159e4/815, base HEAD cc89a6f).
//  · PRE-FLIGHT ⊥#117 ACCEL (LA CRÍTICA — disocian en el RATIO, no sólo en magnitud): ACCEL = |Δm| = √(radial²+tang²) [magnitud media normalizada]; JERK-SPLIT = tang/|Δm| [FRACCIÓN tangencial]. GEOM para un giro puro Δψ a rapidez v: |Δm|=2v·sin(Δψ/2), tang=v·|sinΔψ|, radial=v(1−cosΔψ) ⇒ J=tang/|Δm|=cos(Δψ/2). 4-CUAD (banda accel × banda jerkDir con packs de mobs wander v=30): (a) REVERSA-180° ⇒ |Δm|=60 (accel2, C=1.0) PERO J=cos90°=0 (jerkDir0) ⇒ acelerón/reversa en línea recta = TODO radial; (b) JITTER-fino ±20° ⇒ |Δm|=10.4 (accel0, C=0.17<midChurn) PERO J=cos10°=0.985 (jerkDir2) ⇒ manada que apenas cambia magnitud pero TODO lo poco que cambia es dirección; (c) GIRO-90° ⇒ |Δm|=42.4 (accel2, C=0.71) Y J=cos45°=0.707 (jerkDir2) ⇒ ambos altos; (d) DERIVA ⇒ Δm≈0 (accel0 Y jerkDir0, piso). ⇒ accel mapea a jerkDir 0 (a) Y 2 (b) ⇒ jerkDir NO es función de accel: DISOCIAN en el ratio. La víctima con MÁXIMO accel (reversa) tiene jerkDir=0; una con accel casi-nulo (jitter) tiene jerkDir≈1.
//  · ⊥ VELOCIDAD 1er-orden #110/#111/#112/#116 (jerk = 2ª derivada): una manada puede mantener rumbo/rapidez/convergencia/órbita CONSTANTES (1er-orden cualquier valor) con jerkDir alto o bajo. 4-CUAD vs #112 CONVERGE: embiste-frontal-CONSTANTE ⇒ converge2/jerkDir0 (sin cambio); embiste alcanzado por regate ⇒ converge2/jerkDir2; carrusel-liso ⇒ orbit2/jerkDir0; carrusel-a-tirones ⇒ orbit2/jerkDir2. 4-CUAD vs #116 ORBIT idéntico.
//  · ⊥#118 AGGRO-FOCUS (churn de movimiento ≠ intención de targeting): una manada TODA en chase-línea-recta hacia el héroe ⇒ focus1/jerkDir0 (fijada pero sin reorientar); una manada regateando salvajemente que targetea a OTROS jugadores ⇒ jerkDir2/focus0. La reorientación es CINÉTICA, la fijación es de ESTADO de IA.
//  · ⊥#67 FRENZY/#94 SWIFT (composición cinética, NO kill-rate/ventana temporal del héroe — un pico de regate ocurre con CERO kills). ⊥#115 SIZECLASS/#88 BULK/#106 MOTLEY (ATRIBUTOS de template estáticos). ⊥#107/#108/#109/#113/#114 (POSICIONES/distancias/ángulos — un anillo QUIETO ⇒ encircle2 pero jerkDir0 [sin traslación ⇒ excluido]). ⊥#87 PACKHARVEST (FRACCIÓN invariante al conteo). ⊥#86/#85/#83 dynamic-state: el frost-slow #85 escala vᵢ UNIFORMEMENTE ⇒ tang y |Δm| escalan por igual ⇒ J=cos(Δψ/2) INVARIANTE al factor de slow (un pack constante-slowed regateando y el mismo sin slow ⇒ MISMO jerkDir ⇒ NO es re-mapeo del slow-flag; mide el PATRÓN de reparto radial/tangencial, no la magnitud). Canal FRESCO `jerkDirFind` — NINGUNA de las 60 flags #59-#118 lo usa; recurso TRANSITORIO NUEVO h.jerkDirBounty, STATELESS (fuera del save allowlist + worldFingerprint), historia per-mob transitoria (e._jrkPm/_jrkT/_jrkD/_jrkHas, nunca serializada), sub-cap propio jerkDirBountyCap, badge ∿.
export const JERK_DIR_SURGE = {
  enabled: true,             // LIVE (EVO#119, 61º flag — CAS-2700 flip tras CEO Gate 2/2 + DARK QA CAS-2699 PASS). OFF ⇒ byte-neutral: jerkTick NUNCA corre (gated en update) ⇒ 0 historia per-mob creada + _jerkDirPre=0 const inerte + seam rama muerta + badge NO despachado + h.jerkDirBounty NUNCA creado ⇒ build byte-idéntico a HEAD. Flip config-only false→true tras CEO Gate 2/2.
  channel: "jerkDirFind",    // canal FRESCO (fichas de regate por rematar con la manada REORIENTANDO — regate/zigzag, la componente TANGENCIAL del churn) — NINGUNA de las 60 flags #59-#118 lo usa. Distinto por CONSTRUCCIÓN de accelFind #117 (MAGNITUD |Δm| del churn): JERK-SPLIT = la FRACCIÓN tangencial tang/|Δm| ⊂ ACCEL. Recurso TRANSITORIO, fuera del save + fingerprint. CEO balance knob.
  radius: 300,               // radio de CONSIDERACIÓN (px): J se computa sobre los mobs VIVOS EN MOVIMIENTO con Δ en radio del héroe. Mirror #87/…/#118 radius. CEO balance knob.
  minMobs: 3,                // nº MÍNIMO de mobs VIVOS EN MOVIMIENTO con Δ definido (≥2 ticks) en radio para que J esté DEFINIDO: <3 ⇒ degenerado ⇒ 0. Con el filtro de muertos (víctima e.dead=true en el TOP ⇒ su Δ NO entra) ⇒ ANTI-AUTO-CONTEO. CEO balance knob.
  minMeanDelta: 6,           // PISO ANTI-DERIVA: la media de |Δmᵢ| del pack debe superar 6 (px/tick de motion-vector) para que la fracción tang/|Δm| sea significativa; por debajo (manada ~a la deriva, casi sin cambio de movimiento) ⇒ J indefinido ⇒ 0. = 0.1×(2×wander 30). Evita amplificar ruido sobre denominador ~0. CEO balance knob.
  midDir: 0.34,              // umbral de J para la banda JUKE/regate parcial (peso 1): J≥0.34 (≥~1/3 del churn es reorientación). Adimensional ∈[0,1]. CEO balance knob.
  hiDir: 0.67,               // umbral de J para la banda WEAVE/regate coordinado (peso 2): J≥0.67 (≥~2/3 del churn es reorientación — zigzag/regate dominante). J<midDir (churn dominado por rapidez/línea recta) ⇒ 0. Umbrales sobre J adimensional ∈[0,1]. CEO balance knob.
  weights: { weave: 2, juke: 1 },   // PESO de un remate por la BANDA de FRACCIÓN TANGENCIAL de la formación VIVA: WEAVE/regate coordinado (J≥hiDir) pesa 2; JUKE/regate parcial (≥midDir) pesa 1; churn radial/línea-recta (<midDir) ⇒ 0. Reward = rematar con una manada que REORIENTA/regatea, no una que acelera/frena en línea recta. CEO balance knobs.
  jerkDirBountyCap: 2,       // SUB-CAP DURO PROPIO de las fichas de regate por kill — acota el bono aunque la tabla se re-tunee. = max(tiers.weave)=2 ⇒ neutral con la tabla actual. CEO balance knob.
  // TABLA de tiers por PESO DE FRACCIÓN TANGENCIAL (score∈{0,1,2}). Más reorientación = tier MÁS ALTO. El tier vigente = el más intenso (mayor `min`) cuyo score se satisface. Score < 1 (churn radial/solitario) ⇒ Tier 0 ⇒ +0. Determinista, LUT pura.
  tiers: [
    { min: 1, charge: 1 },   // Tier 1 — score ≥1 (remate en JUKE/regate parcial, J≥midDir): +1 ficha de regate por kill. "remataste con la manada regateando en parte".
    { min: 2, charge: 2 },   // Tier 2 — score ≥2 (remate en pleno WEAVE/regate coordinado, J≥hiDir): +2 fichas por kill. "remataste con la manada zigzagueando/reorientando en revuelo direccional". CEO balance knobs.
  ],
};

// CAS-1889: CARGA DE EQUIPO / TIPOS DE RODADA (Equip Load & Roll Types, 14º pilar). El PESO total del equipo equipado
// (weapon/body/shield) contra una `capacity` ⇒ un `ratio` que cae en 4 BANDAS (fast/mid/fat/over). Cada banda MULTIPLICA
// valores YA vivos (no crea sistema nuevo): DODGE{distance,iframeMs} (CAS-1814) + STAMINA.cost.dodge (CAS-1841) + move
// speed. 100% BORROW. El peso es DERIVADO puro del equipo YA guardado — `Σ slotWeight[slot]*rarityWeight[rarity]` sobre
// `h.equip` ⇒ CERO draws, NO existe `equipLoadRng`, NINGÚN campo nuevo en save.v1 (recomputable de {slot,rarity}). HARD-GATED:
// enabled:false ⇒ multiplicadores = 1 (mid) ⇒ build byte-idéntico a HEAD (Estamina/Esquiva/Bloqueo intactos) + sin HUD nuevo.
// AC crítico: `capacity`+`slotWeight` elegidos para que el LOADOUT INICIAL (3 piezas common: sim.js:374) caiga en la banda
// MID ⇒ multiplicadores todos 1 ⇒ el FEEL actual NO regresa. Comprobación: total inicial = 4+5+4 = 13; 13/20 = 0.65 ∈ (0.30,0.70]
// ⇒ mid. Las 4 bandas son alcanzables con inventarios reales: fast = loadout mínimo (1 slot, p.ej. arma common 4/20=0.20);
// mid = kit inicial (0.65); fat = subir rareza uniforme (uncommon-all 14.3/20=0.715 … epic-all 18.85/20=0.94); over = full
// legendary (22.1/20=1.105). Los NÚMEROS = decisión FEEL/BALANCE del CEO (retune = knob barato, mirror dash/estamina/estus).
export const EQUIP_LOAD = {
  enabled: true,               // OFF ⇒ multiplicadores=1 (mid) ⇒ byte-idéntico a HEAD, sin HUD nuevo
  capacity: 20,                // capacidad base; tune para que el loadout típico/inicial = mid
  // peso(inst) = slotWeight[slot] * rarityWeight[rarity]; slot vacío ⇒ 0
  slotWeight: { weapon: 4, body: 5, shield: 4 },   // Σ common = 13 ⇒ ratio inicial 0.65 = mid (feel intacto)
  rarityWeight: { common:1.0, uncommon:1.1, rare:1.25, epic:1.45, legendary:1.7 }, // heavier = pricier build
  bands: { fast:0.30, mid:0.70, fat:1.0 },   // umbrales superiores; over = ratio > fat
  // multiplicadores por banda; mid = TODO 1 (baseline intacto ⇒ AC2)
  mul: {
    fast: { dist:1.15, iframe:1.15, stam:1.0,  move:1.0  },
    mid:  { dist:1.0,  iframe:1.0,  stam:1.0,  move:1.0  },
    fat:  { dist:0.7,  iframe:0.7,  stam:1.4,  move:0.85 },
    over: { dist:0.0,  iframe:0.0,  stam:1.6,  move:0.6  }, // dist/iframe 0 ⇒ sin rodada útil
  },
  overCanRoll: false,          // over-encumbered: false ⇒ doRoll bloquea (deny ANTES de gastar); true ⇒ rodada mínima
};

// CAS-1895: EMPUÑADURA A DOS MANOS (Two-Handing, 15º pilar). Un TOGGLE de postura ofensiva: agarrar el arma con las
// dos manos GUARDA el escudo ⇒ más pegada a cambio de defensa. NO crea sistema nuevo — 100% BORROW sobre pilares vivos:
//   · Escudo INACTIVO: mientras `h.twoHand`, SHIELD_BLOCK (CAS-1873) no puede levantar la guardia ⇒ su rama en damageHero
//     queda muerta (reusa el gate `h.blocking`, sin nueva rama). El escudo está "envainado".
//   · Carga de equipo recalcula: el peso del escudo SALE de equipLoad(h) (CAS-1889) ⇒ ratio baja ⇒ posible drop de banda
//     (fat→mid, mid→fast) ⇒ esquiva más ágil. Sinergia observable, 0-draw, sin campo de save.
//   · Daño melee ×dmgMul: el swing (applyHeroMelee) pega ×1.35.
//   · Poise-damage ×poiseMul: el golpe alimenta POISE.gain (CAS-1826) ×1.5 ⇒ staggerea más rápido.
//   · Estamina/golpe ×stamMul: el coste de vigor de los PODER-swings (heavy/finisher, CAS-1841) sube ×1.15.
// Estado TRANSITORIO `h.twoHand` (mirror `h.blocking`: fuera del allowlist de serializeSave ⇒ save.v1 byte-id y SIN clave
// nueva; un toggle de runtime que arranca en false tras cargar). 100% input/aritmética ⇒ CERO draws, NO existe
// `twoHandRng` ⇒ srand ON==OFF byte-idéntico incluso con el toggle activo. HUD $0 arte (reusa el tinte de banda de vigor
// del HUD DOM + un marcador). HARD-GATED: enabled:false ⇒ toggle inerte, `h.twoHand` nunca sube, todas las ramas muertas
// ⇒ byte-idéntico a HEAD (14 pilares intactos); sin pulsar ⇒ idéntico a hoy con la feature ON. Números + `key` = decisión
// FEEL/BALANCE del CEO (retune = knob barato). Decisión de tecla (CTO): KeyH del spec YA es Parada con Tempo (CAS-1785) y
// las 26 letras + ShiftLeft (bloqueo) + Tab/Space/Digits están ocupadas ⇒ `ShiftRight` (libre en todo el repo, simétrico
// al ShiftLeft del bloqueo: mano izquierda = brace/escudo, mano derecha = agarre a dos manos). Móvil = botón HUD (toggle).
export const TWO_HAND = {
  enabled: true,
  key: "ShiftRight",   // TOGGLE de postura a dos manos (desktop); móvil = botón HUD toggle. Desvío del spec KeyH (ya = Parry CAS-1785)
  dmgMul: 1.35,        // multiplicador de daño del swing melee mientras se empuña a dos manos
  poiseMul: 1.5,       // multiplicador del poise-damage (POISE.gain CAS-1826) ⇒ rompe postura más rápido
  dropsShield: true,   // el escudo se envaina ⇒ SHIELD_BLOCK no puede alzar guardia + su peso sale de equipLoad
  stamMul: 1.15,       // multiplicador del coste de vigor de los PODER-swings (heavy/finisher, CAS-1841)
  moveMul: 1.0,        // factor de velocidad al empuñar a dos manos (1.0 = sin penalización de movilidad en v1)
};

// CAS-1901: SUPERARMADURA EN GOLPES COMPROMETIDOS (Hyperarmor / Poise-through). 16º pilar Souls-like. Durante el swing
// PESADO/rematador del héroe (ventana comprometida) gana superarmadura: un golpe entrante cuyo poise-damage (=`dmg` crudo
// entrante) queda < `poiseThreshold` NO aplica su STUN (el único vector de interrupción del héroe, CAS-1826) ⇒ aguantas y
// terminas el golpe; el DAÑO SIGUE aterrizando (NO es i-frame). Anti-inmunidad: >= umbral ⇒ el stun rompe la superarmadura
// (un slam de jefe te tumba igual). Recompensa la agresión comprometida; punible porque te comes el golpe.
export const HYPERARMOR = {
  enabled: true,
  appliesTo: { heavy: true, finisher: true },  // qué swings comprometidos califican (heavy = h._heavy, finisher = h._comboFin)
  poiseThreshold: 24,   // dmg crudo entrante < umbral ⇒ NO interrumpe (superarmadura aguanta); >= ⇒ rompe. Número del Gate CEO
  twoHandBonus: 1.0,    // umbral efectivo = poiseThreshold * (twoHand activo ? twoHandBonus : 1); v1 flat=1.0 (wired-neutral, el CEO lo sube sin rebuild)
  vfx: true,            // chispa/tinte desde primitivas $0 al ABSORBER un stun (gateado: OFF/no-heavy ⇒ sin efecto)
};

// CAS-1907: ARQUETIPOS DE ARMA (Weapon Archetypes, 17º pilar Souls-like). El arma equipada define una CLASE de manejo
// (sword/greatsword/dagger/spear) que reescala alcance/arco/velocidad/daño/poise-damage/estamina/backstab del swing melee —
// SIN arte, sin save nuevo, sin RNG nuevo. 100% BORROW sobre los seams vivos de pilares 8-16 (el arquetipo sólo MULTIPLICA
// valores que ya existen). Deriva 0-draw de `h.equip.weapon.defId` vía el mapa `byDefId` (gear.js:5 confirma que NINGÚN code
// path conmuta por nombre/id de arma y las 4 armas actuales son espadas ⇒ ausente ⇒ 'sword'). Los multiplicadores COMPONEN
// con TWO_HAND (se multiplican, no se pisan): p.ej. greatsword+twoHand ⇒ dmg = base×archDmgMul×twoHandDmgMul. HARD-GATED:
// enabled:false ⇒ TODOS los seams usan la unidad (×1) ⇒ byte-idéntico a HEAD. El loadout inicial es `w_iron` (sim.js) que
// queda SIN mapear ⇒ 'sword' ⇒ todo ×1 ⇒ combate byte-id a HEAD (AC2, 0 regresión). Números + `byDefId` = decisión FEEL/
// BALANCE del CEO (retune = knob barato, sin rebuild). `swingMul` > 1 = swing más LENTO (multiplica `h.atkCD` y `h.atkAnim`).
export const WEAPON_ARCHETYPES = {
  enabled: true,
  // arquetipo por defId de arma; ausente ⇒ 'sword'. w_iron (loadout inicial) queda SIN mapear ⇒ 'sword' (AC2). Las 4 armas:
  // w_rusty/w_iron/w_steel/w_rune (gear.js). Mapa = decisión FEEL/CEO, tunable sin rebuild.
  byDefId: { w_steel:"greatsword", w_rune:"spear", w_rusty:"dagger" },
  classes: {
    sword:      { reachMul:1.0, arcMul:1.0,  swingMul:1.0,  dmgMul:1.0,  poiseDmgMul:1.0, stamMul:1.0,  backstabMul:1.0 },
    greatsword: { reachMul:1.4, arcMul:1.3,  swingMul:1.25, dmgMul:1.3,  poiseDmgMul:1.5, stamMul:1.3,  backstabMul:0.9 },
    dagger:     { reachMul:0.7, arcMul:1.0,  swingMul:0.8,  dmgMul:0.85, poiseDmgMul:0.6, stamMul:0.8,  backstabMul:1.6 },
    spear:      { reachMul:1.6, arcMul:0.65, swingMul:1.0,  dmgMul:1.0,  poiseDmgMul:1.0, stamMul:1.0,  backstabMul:1.0 },
  },
};

// CAS-1914: ARTES DE ARMA (Weapon Arts / "Ash of War", 18º pilar Souls-like). Cada ARQUETIPO de arma (Pilar 17) gana un
// movimiento FIRMA dedicado (tecla Semicolon / botón HUD), con coste de estamina + cooldown compartido, cuyo efecto escala por
// arquetipo activo. 100% BORROW sobre los seams vivos (arquetipo/hyperarmor/dash/backstab/two-hand/estamina): el Arte sólo
// MULTIPLICA valores que YA existen, DENTRO de applyHeroMelee/hitEnemy ⇒ compone multiplicativo con archetype × TWO_HAND sin
// pisar fórmulas. Sin arte (reusa VFX de dash/hyperarmor-glow/swing-arc), sin save nuevo (h.artCD/h._art transitorios, fuera
// del allowlist), sin RNG nuevo (100% timing/aritmética ⇒ srand ON==OFF). HARD-GATED: enabled:false ⇒ weaponArt() es rama
// muerta + la extensión del gate hyperarmor es inerte ⇒ byte-idéntico a HEAD (17 pilares intactos). El loadout inicial w_iron
// queda SIN mapear (WEAPON_ARCHETYPES.byDefId) ⇒ 'sword' ⇒ Arte "Tajo Circular" baseline. Números/tecla = decisión FEEL/CEO.
export const WEAPON_ARTS = {
  enabled: true,
  key: "Semicolon",   // alias fijo gated (input.js, NO rebindable); FEEL/CEO-tunable. Todas las 26 letras ocupadas (ver spec).
  cooldownMs: 2500,   // cooldown COMPARTIDO por-arte (transitorio h.artCD, mirror h.atkCD, NO save)
  // efecto por arquetipo (clave = weaponArchName). Números = FEEL/CEO, tunables sin rebuild. Campos ausentes ⇒ ×1 (ART_UNIT).
  classes: {
    // Golpe de Carga: overhead comprometido — ventana hyperarmor extendida (reusa Pilar 16), poise/daño masivo.
    greatsword: { name:"Golpe de Carga",       stam:35, windupMul:1.6, dmgMul:1.8, poiseDmgMul:2.2, hyperarmor:true },
    // Filo Sombrío: dash corto que reposiciona DETRÁS del objetivo ⇒ setup auto-backstab (Pilar 6). Barato.
    dagger:     { name:"Filo Sombrío",         stam:12, dashDist:70,  dmgMul:0.9, autoBackstab:true },
    // Estocada Perforante: reach↑↑ arco estrecho, atraviesa la línea frontal. Espaciado.
    spear:      { name:"Estocada Perforante",  stam:20, reachMul:1.8, arcMul:0.4,  dmgMul:1.2, pierce:true },
    // Tajo Circular: giro arco completo, equilibrado — baseline útil sin dominar.
    sword:      { name:"Tajo Circular",        stam:22, arcMul:2.0,   dmgMul:1.0, poiseDmgMul:1.2 },
  },
};

// CAS-1920: CONSUMIBLES ARROJADIZOS / Throwing Items (Pilar 19). La primera herramienta a distancia de RECURSO LIMITADO
// tras 18 pilares melee: 2 consumibles firma (cuchillo recto / bomba incendiaria) para abrir peleas, castigar rangeds/casters
// y aplicar presión sin comprometerse a melee. 100% BORROW sobre seams vivos (proyectil de hechizo, LOCK_ON aim, STAMINA coste,
// refill-por-zona tipo Estus, status `burn`), $0 arte, RNG/save-neutral. enabled:false ⇒ throwItem() rama muerta byte-id a HEAD.
// Números = FEEL/CEO, config-tunables sin rebuild. Teclas (Quote/Slash) = CODEs LIBRES (26 letras + Semicolon ocupadas), alias
// fijo gated en input.js (NO rebindable ⇒ snapshot byte-id). 1 tecla lanza el tipo seleccionado, 1 tecla cicla el tipo.
export const THROWABLES = {
  enabled: true,
  throwKey: "Quote",     // ' — lanza el tipo seleccionado; alias fijo gated (input.js, NO rebindable), FEEL/CEO-tunable
  cycleKey: "Slash",     // / — cicla el tipo seleccionado (order)
  windupMs: 200,         // ventana de commit/recuperación tras lanzar (transitorio h.throwWind, mirror atkAnim); punible (bloquea attack/move)
  cooldownMs: 500,       // cd por-lanzamiento (transitorio h.throwCD, NO save)
  refillOnZone: true,    // recarga cargas al cambiar de zona (reusa seam flaskZone) + BONFIRE (recurso escaso, NO infinito)
  order: ["knife","firebomb"],   // orden del ciclo
  types: {
    // Cuchillo Arrojadizo: proyectil recto rápido, daño moderado, barato. Apertura / castigo a distancia (infl:null ⇒ sin burn).
    knife:    { name:"Cuchillo Arrojadizo", charges:6, stam:8,  spd:520, dmg:14, life:0.9, kind:"knife",    col:"#d8dee8" },
    // Bomba Incendiaria: arco corto, impacto en área pequeña, aplica burn (reusa DoT). Más cara, más escasa.
    firebomb: { name:"Bomba Incendiaria",   charges:3, stam:20, spd:300, dmg:10, life:0.7, kind:"firebomb", col:"#ff7a3c", aoe:26, burn:{dmg:6}, burstFx:"flame", arc:true },
  },
};

// CAS-1926 — Pilar 20 RESINAS / BUFFS DE ARMA (Weapon Grease). Un consumible que UNTA el arma con un buff temporal
// (daño ×dmgMul + elemento on-hit opcional vía applyStatus burn/slow) por una ventana corta ⇒ decisión de recurso
// escaso (preparar el arma antes de un jefe/élite). 100% BORROW sobre el sink de daño melee (applyHeroMelee) + los
// STATUS burn/slow vivos + el refill-por-zona del Estus/BONFIRE. dmgMul compone MULTIPLICATIVAMENTE como ÚLTIMO factor
// tras TWO_HAND × WEAPON_ARCHETYPES × WEAPON_ARTS. Melee-only (no bypassa poise/i-frames). enabled:false ⇒ byte-id a HEAD.
// Números = FEEL/CEO, tunables sin rebuild. RNG-neutral (0 draws) + save-neutral (todo estado transitorio).
export const WEAPON_BUFFS = {
  enabled: true,
  applyKey: "BracketRight",   // ] — aplica la resina seleccionada; alias fijo gated (input.js, NO rebindable), FEEL/CEO-tunable
  cycleKey: "BracketLeft",    // [ — cicla el tipo de resina seleccionado (order)
  applyMs: 400,               // windup de aplicación (unta el arma, breve, punible; transitorio h.applyBuffT, mirror flaskDrinkT)
  refillOnZone: true,         // recarga cargas al cambiar de zona (reusa seam flaskZone) + BONFIRE (recurso escaso, NO infinito)
  order: ["ember","whet","frost"],   // orden del ciclo
  types: {
    // Resina Ardiente: +daño moderado + añade DoT burn en cada golpe melee (reusa STATUS.burn). Contra hordas / presión de DoT.
    ember: { name:"Resina Ardiente",  charges:2, buffS:20, dmgMul:1.15, element:"burn",  burn:{dmg:5},          tint:"#ff7a3c" },
    // Piedra de Afilar: +daño físico PURO alto, sin elemento. La opción de daño crudo para un jefe.
    whet:  { name:"Piedra de Afilar", charges:3, buffS:25, dmgMul:1.22, element:null,                            tint:"#dfe7f2" },
    // Escarcha: +daño leve + aplica slow (reusa STATUS.slow, mismo status que infligen los mobs) ⇒ control. Contra élites móviles.
    frost: { name:"Escarcha",         charges:2, buffS:18, dmgMul:1.10, element:"frost", slow:{mul:0.6,dur:1.5}, tint:"#7fd3ff" },
  },
};

// CAS-1931 — ACUMULACIÓN DE ESTADOS (Status Buildup: Sangrado / Veneno / Escarcha). 21º pilar Souls-like.
// 100% BORROW sobre el motor de status CAS-118 (applyStatus/tickDots/STATUS): en vez de aplicar el status AL INSTANTE,
// cada golpe SUMA a un medidor OCULTO por tipo (ent.bld) que, al cruzar `threshold`, PROCEA un efecto en RÁFAGA (reusando
// el MISMO applyStatus / hp-drain) y se resetea. El medidor DECAE `decayPerSec/s` si no se sostiene ⇒ recompensa presión,
// castiga picotear. `elementMap` enruta cada fuente elemental on-hit YA existente (burn/slow/frost/poison) a un medidor;
// el golpe físico melee alimenta `bleed` (tipo NUEVO, no está en STATUS ⇒ headline observable). Paridad enemigo→héroe por
// el MISMO helper/tabla (damageHero choke). enabled:false ⇒ la reconversión CAE al applyStatus instantáneo original
// (byte-idéntico a HEAD: 0 medidor, 0 tick, 0 proc, `bleed` inerte). 100% aritmética/timing ⇒ 0 RNG (sin buildupRng).
// `ent.bld` transitorio (mirror `dots`/`slowT`) ⇒ fuera del allowlist de serializeSave ⇒ save.v1 byte-id sin clave bld*.
// Números = FEEL/CEO, tunables sin rebuild.
export const STATUS_BUILDUP = {
  enabled: true,
  decayPerSec: 14,          // el buildup drena esto/s si no se sostiene (castiga picotear; recompensa presión)
  bossBuildMul: 0.55,       // jefes/élites (ent.isBoss) acumulan MÁS lento (mul sobre lo añadido) ⇒ umbral efectivo mayor
  elementMap: { burn:"poison", slow:"frost", frost:"frost", poison:"poison" },   // físico melee ⇒ bleed (explícito en el sink)
  types: {
    // Sangrado: fed por físico melee; proc = ráfaga % HP máx del objetivo. HEADLINE observable en el loop.
    bleed:  { threshold:100, build:16, procPctHp:0.11, bossProcPctHp:0.06, tint:"#d11e2e" },
    // Veneno: fed por fuego/veneno reconvertido; proc = DoT poison fuerte N s (reusa STATUS.poison).
    poison: { threshold:100, build:22, procDot:{dmg:7,dur:5.0},           tint:"#7bd14a" },
    // Escarcha: fed por frost buff + hielo enemigo; proc = slow fuerte + drena estamina (héroe).
    frost:  { threshold:100, build:26, procSlow:{amt:0.45,dur:2.2}, procStamDrain:22, tint:"#7fd3ff" },
  },
};

// the objective text + the gate it reads come straight from here, no UI branching.
export const STAGE1_GOAL = { zone:"frost", boss:"Guardián de la Cripta", req:FROST_POWER_REQ };

// CAS-100: per-class BASE STATS — the first class-identity surface (before ATK/SPELLS).
// Until now every class spawned with identical hp/mp/dmg/speed, so they only LOOKED
// different. These rows make each class measurably distinct from level 1:
//   hp / mp      — starting (and max) pools
//   dmg          — baseDmg (multiplied by gear + ATK[cls].dmgMul downstream)
//   moveScale    — multiplier on CFG.heroSpeed (mobility identity; warrior/mage heavier,
//                  druid nimble). atkCD already differs per class via ATK[cls].cd.
//   hpGain/mpGain/dmgGain — per-level growth, so the archetypes DIVERGE as you climb.
// Pure data: newHero/gainXP/movement read these by class, zero per-class branching.
// Fallbacks in sim.js keep an unknown class playable (warrior profile).
export const CLASS_STATS = {
  // tanky frontline bruiser: most HP + hardest hits, tiny mana pool, a touch slow
  warrior:{ hp:135, mp:30, dmg:14, moveScale:0.96, hpGain:24, mpGain:5,  dmgGain:4 },
  // durable holy ranged hybrid: high HP, medium everything — the all-rounder
  paladin:{ hp:120, mp:48, dmg:12, moveScale:0.98, hpGain:20, mpGain:7,  dmgGain:3 },
  // glass-cannon caster: lowest HP, biggest mana, strong hits but fragile + a bit slow
  mage:   { hp:78,  mp:82, dmg:13, moveScale:0.95, hpGain:12, mpGain:13, dmgGain:3 },
  // nimble nature melee/sustain: balanced pools, fastest on foot
  druid:  { hp:104, mp:60, dmg:12, moveScale:1.07, hpGain:17, mpGain:9,  dmgGain:3 },
  // support healer: deep mana, soft hitter, average frame — survives via heals
  priest: { hp:92,  mp:78, dmg:10, moveScale:1.00, hpGain:15, mpGain:12, dmgGain:2 },
};

export const CLASS_LIST = ["warrior", "paladin", "mage", "druid", "priest"];

// CAS-169: character customization data — the GAMEPLAY/SAVE side of the recolor
// system (the renderer owns the masks + bake geometry; this owns the values the
// player picks + persists). `slots` are the 4 recolorable parts; `swatches` is the
// palette the pickers offer per slot; `variations` are the headwear/cape swaps;
// `defaults` mirrors assets/erw/hero/parts/parts.json.defaultPalettes so every class
// boots on its canonical look before the player customizes. Plain data — no DOM,
// deterministic, so sim/save stay Stage-2-safe.
export const CUSTOMIZE = {
  slots: ["hood", "cloak", "sash", "legs"],
  // curated selectable colors (RGB) — broad hue wheel + neutrals so each part reads
  // as a real choice. Index into this array is what the save stores per slot is NOT
  // used (we store the RGB itself) — the array is the picker's offered set.
  swatches: [
    [200, 60, 60], [214, 130, 60], [220, 190, 90], [120, 190, 90],
    [80, 170, 110], [70, 200, 200], [80, 150, 220], [120, 110, 220],
    [180, 100, 210], [220, 120, 180], [235, 230, 220], [170, 178, 190],
    [110, 120, 134], [60, 64, 74], [40, 40, 46], [150, 110, 60],
  ],
  variations: {
    headwear: ["hood", "helmet", "none"],
    cape: ["cape", "nocape", "longcape"],
  },
  variationDefault: { headwear: "hood", cape: "cape" },
  defaults: {
    warrior: { hood: [150, 174, 200], cloak: [150, 174, 200], sash: [200, 40, 60], legs: [40, 40, 46] },
    paladin: { hood: [214, 176, 92],  cloak: [214, 176, 92],  sash: [180, 40, 50], legs: [40, 40, 46] },
    mage:    { hood: [150, 96, 200],  cloak: [150, 96, 200],  sash: [70, 200, 225], legs: [40, 40, 46] },
    druid:   { hood: [96, 168, 96],   cloak: [96, 168, 96],   sash: [150, 110, 60], legs: [40, 40, 46] },
    priest:  { hood: [225, 222, 210], cloak: [225, 222, 210], sash: [220, 185, 90], legs: [40, 40, 46] },
  },
};

// ------------------------ CAS-383: INTER-ZONE BOON DRAFT --------------------
// Roguelite build-variety layer. On each zone champion clear the player DRAFTS one
// of three boons; picks STACK for the rest of the run and RESET on death/new run
// (see sim.recalcBoons / respawn). Pure data — every effect folds into an EXISTING
// combat chokepoint through the cached h.bb bundle, so no per-frame branching and the
// no-boon baseline stays byte-identical.
//
// Fold semantics (sim.recalcBoons): additive fields SUM across owned copies; the two
// multiplier fields (hpMul / moveMul) MULTIPLY; onKillHaste takes the max. Duplicates
// deepen a build. `cat` = offense|defense|utility (draft/label grouping). `glyph` is a
// procedural icon (no art spend). All numbers are TUNABLE — the clamps in recalcBoons
// are the balance guardrail (AC #5); flag here if a value distorts the curve.
// CAS-388: every boon carries a `rarity` tier — common | rare | legendary. The draft weights
// its 3-card draw by tier and scales the rare/legendary odds UP with run depth (owned-boon
// count), so early cards are mostly commons and a deep run starts surfacing build-defining
// picks. Rarer = stronger/build-defining. The two `legendary` keystones CHANGE how a class
// plays (a dash damage-trail, a kill nova) — reusing the same boon-stack plumbing (new bb
// fields folded in recalcBoons). No SAVE_VERSION bump: ids are additive, unknown ids drop.
export const BOONS = [
  // ---- offense ----
  { id:"glass",  cat:"offense", rarity:"rare",   glyph:"✷", name:"Cristal Frágil",    desc:"+25% prob. de crítico, pero −22% vida máxima.", crit:25, hpMul:0.78 },
  { id:"ember",  cat:"offense", rarity:"common", glyph:"🔥", name:"Sangre de Brasa",   desc:"Tus golpes prenden fuego: convierten daño en quemadura.", burn:0.35 },
  { id:"venom",  cat:"offense", rarity:"common", glyph:"☣", name:"Toque Ponzoñoso",   desc:"Tus golpes envenenan: convierten daño en veneno.", poison:0.35 },
  { id:"arc",    cat:"offense", rarity:"rare",   glyph:"⟿", name:"Eco Arcano",        desc:"Tus proyectiles saltan a +1 enemigo cercano.", chain:1 },
  // ---- defense ----
  { id:"thorns", cat:"defense", rarity:"common", glyph:"✵", name:"Coraza de Espinas", desc:"Refleja 40% del daño recibido al atacante.", reflect:0.40 },
  { id:"stone",  cat:"defense", rarity:"common", glyph:"❑", name:"Piel de Piedra",    desc:"+22% vida máxima y +6 de defensa.", hpMul:1.22, defAdd:6 },
  { id:"vamp",   cat:"defense", rarity:"rare",   glyph:"♥", name:"Sed de Sangre",     desc:"Roba 14% de la vida al golpear cuerpo a cuerpo.", lifesteal:0.14 },
  // ---- utility ----
  { id:"swift",  cat:"utility", rarity:"common", glyph:"➹", name:"Viento Veloz",      desc:"+16% velocidad y mayor ventana de esquiva.", moveMul:1.16, iframeAdd:0.06 },
  { id:"reaper", cat:"utility", rarity:"rare",   glyph:"☠", name:"Cosecha Sangrienta",desc:"Al matar: cura breve y ráfaga de prisa.", onKillHeal:0.04, onKillHaste:2.5 },
  { id:"greed",  cat:"utility", rarity:"common", glyph:"◈", name:"Codicia",           desc:"El botín cae con mayor rareza.", loot:0.7 },
  // ---- LEGENDARY keystones (CAS-388): run-defining, change HOW a class plays ----
  { id:"wake",   cat:"utility", rarity:"legendary", glyph:"⇶", name:"Estela Ardiente",  desc:"Tu esquiva deja un rastro de fuego que quema a los enemigos que atraviesas.", trail:0.45 },
  { id:"nova",   cat:"offense", rarity:"legendary", glyph:"❂", name:"Núcleo Detonante", desc:"Cada muerte desata una explosión que daña a los enemigos cercanos.", onKillNova:0.6 },
];
export const BOON_MAP = (()=>{ const m={}; for(const b of BOONS) m[b.id]=b; return m; })();
// How many cards a draft offers, and the localized category labels for the panel.
export const BOON_DRAFT_N = 3;
export const BOON_CAT_LABEL = { offense:"Ofensiva", defense:"Defensa", utility:"Utilidad" };
// CAS-388: rarity draw weights. Base weight per tier + a per-depth ramp (depth = #owned boons).
// Common stays flat; rare/legendary weights climb with depth so the pool skews rarer the deeper
// a run goes, but each is capped so legendaries never flood the draft. Tunable balance knobs.
export const BOON_RARITY = {
  common:    { col:"#cfd6e0", label:"COMÚN",      w:10,  wPerDepth:0,    wCap:10 },
  rare:      { col:"#4db6ff", label:"RARO",       w:2.0, wPerDepth:1.1,  wCap:12 },
  legendary: { col:"#ffab2e", label:"LEGENDARIO", w:0.5, wPerDepth:0.45, wCap:6  },
};
export function boonRarityWeight(rarity, depth){ const r=BOON_RARITY[rarity]||BOON_RARITY.common;
  return Math.min(r.wCap, r.w + r.wPerDepth*(depth||0)); }
// CAS-388: SYNERGIES — pairs of owned boons that unlock an emergent bonus while BOTH are held.
// Folded in recalcBoons (multiplies the relevant bb field before the guardrail clamps, so a
// synergy deepens a build but can never break the crit/lifesteal/reflect ceilings). Surfaced
// in the draft overlay so the player can read which pairings are live.
export const SYNERGIES = [
  { id:"ignite", need:["glass","ember"], name:"Ignición Crítica",   desc:"Crítico + Brasa: tus quemaduras arden con mucha más intensidad.", mul:{ burn:1.6 } },
  { id:"vdance", need:["vamp","swift"],  name:"Danza Vampírica",     desc:"Sed de Sangre + Viento Veloz: robas mucha más vida al golpear.",   mul:{ lifesteal:1.7 } },
  { id:"aegis",  need:["thorns","stone"],name:"Fortaleza Vengativa", desc:"Espinas + Piedra: reflejas mucho más daño al atacante.",          mul:{ reflect:1.6 } },
];
export const SYN_MAP = (()=>{ const m={}; for(const s of SYNERGIES) m[s.id]=s; return m; })();

// CAS-394: OPT-IN ZONE MODIFIER ("Maldición" / Curse). On first entry to a combat zone the
// player is offered ONE random modifier — accept to raise that zone's challenge in exchange
// for a guaranteed better payoff, or skip to leave the zone untouched. Per-run (resets on
// death like boon stacks). Every modifier ONLY scales knobs that already exist — enemy hp/dmg
// (ZONE_TIER-style mults folded in applyZoneScale), enemy speed, or the elite-affix roll rate
// (MOB_AFFIX_RATE) — so NO new AI and NO change to base balance clamps (guardrail HOLD). The
// reward for clearing a cursed zone is uniform (documented in sim.js onChampionKill/openDraft):
// the champion draft is biased UP one rarity tier with a guaranteed rare+ card AND one bonus
// gear roll at the zone's tier/floor. Tunable balance knobs; flag here if a value distorts the
// risk/reward curve. Farm-cap: a zone clears at most ONCE per run (H.cleared), so the reward is
// hard-bounded to ≤1 per zone (≤7/run) and the legendary odds inside the rare+ pool are the same
// depth-scaled weights (no legendary flood) — see CURSE_DEPTH_BONUS.
export const ZONE_MODIFIERS = [
  { id:"brutal", glyph:"‡", name:"Furia Maldita",  desc:"Los enemigos golpean con +25% de vida y daño.", hpMul:1.25, dmgMul:1.25 },
  { id:"frenzy", glyph:"➹", name:"Frenesí",         desc:"Los enemigos se mueven mucho más rápido.",       spdMul:1.35 },
  { id:"swarm",  glyph:"❈", name:"Enjambre de Élite",desc:"Aparecen el doble de enemigos de élite.",        affixMul:2 },
];
// CAS-1744 — el modificador de la Caldera. Data-only (mismos knobs hp/dmg/spd que el resto, SIN RNG en la
// capa). CRÍTICO para RNG-neutral: NO va en el array ZONE_MODIFIERS de arriba (eso cambiaría el pool ofertado
// SIEMPRE). Sólo entra al pool cuando ZONE5.enabled (offerCurse en sim.js lo appenda). Vive en el MAP para que
// render pueda dibujar su glifo si el jugador lo acepta — añadirlo al MAP es sólo lookup, no toca RNG.
export const ZONE5_MOD = { id:"emberfury", glyph:"♨", name:"Furia de Brasas", desc:"Enemigos +30% de daño y +10% de velocidad.", dmgMul:1.30, spdMul:1.10 };
export const ZONE_MOD_MAP = (()=>{ const m={}; for(const z of ZONE_MODIFIERS) m[z.id]=z; m[ZONE5_MOD.id]=ZONE5_MOD; return m; })();
// CAS-394: the cursed-zone draft bias. Clearing a cursed zone bumps the boon draft's EFFECTIVE
// depth by this much (raises the depth-scaled rare/legendary weights in boonRarityWeight — "up one
// tier") AND guarantees ≥1 rare+ card. Kept modest so it biases the pool without flooding
// legendaries (their weight cap in BOON_RARITY still applies). Tunable.
export const CURSE_DEPTH_BONUS = 4;

// CAS-450: CONQUISTA + WORLD TIER (NG+ ligero). The four OPEN walk-in zones (the CAS-438 set)
// form the "Conquista" cycle: defeat all four zone climaxes in one cycle → an APEX payoff
// (a guaranteed-legendary boon draft + one tier-bumped guaranteed gear drop) and an OPT-IN
// offer to ascend to World Tier N+1. CONQUEST_ZONES is the data-driven cycle membership —
// the gated zones (arena/abyss/frost/trial) stay outside it so the loop is walkable by any
// build that can clear the open world.
export const CONQUEST_ZONES = ["forest","ruins","caves","swamp"];
// World-Tier tuning. All scaling is MULTIPLICATIVE and applied POST-SPAWN (layered clones in
// applyZoneScale / spawnChampion, exactly the CAS-394 curse pattern) so tier 1 stays
// byte-identical to the pre-CAS-450 baseline and the rr()/srand draw ORDER is never touched.
//   cap      — highest reachable tier (the ascend offer stops here)
//   hpPct/dmgPct — +25% enemy hp/dmg per tier ABOVE 1
//   affixPct — elite-affix roll-rate bonus per tier above 1 (same knob as the swarm curse;
//              the srand draw itself is unconditional, only the threshold moves → rng-neutral)
//   depthPer — boon-draft effective-depth bonus per tier above 1 (loot payoff of climbing)
//   apexDepth— depth bonus of the APEX draft itself (≥ CURSE_DEPTH_BONUS: the apex hand is
//              the richest draft in the game, and ensureLegendary floors it at 1 legendary)
export const WORLD_TIER = { cap:5, hpPct:0.25, dmgPct:0.25, affixPct:0.25, depthPer:2, apexDepth:6 };

// CAS-2024 (umbrella CAS-2023): NG+ / Nueva Partida Plus. A THIN reward-escalation + framing layer
// that COMPOSES on top of CAS-450 WORLD_TIER — it does NOT re-implement the opt-in ascend prompt, the
// gear/Esencia/unlock carry-over, the world re-arm, the deterministic per-tier scaling, the durable
// `conquest.tier`, or the cap. Those all ship live via CAS-450 and NG+ reuses them verbatim. NG_PLUS
// adds ONLY: a per-cycle loot-rarity floor lift, a per-cycle Esencia reward multiplier, an optional
// per-cycle enemy-poise multiplier (sub-flag, default off), and explicit "NG+" framing on the ascend
// scene. NO new save field — every knob reads `conquest.tier` (already durable & carried) ⇒ 0 new
// serialized state ⇒ 0 save regression BY CONSTRUCTION. Ships DARK (enabled:false); 1-line flip after
// the CEO gate. enabled:false ⇒ every seam returns its pre-existing value ⇒ srand + save.v1 byte-id HEAD.
export const NG_PLUS = {
  enabled: true,           // LIVE. Flipped after CEO gate GO (CAS-2027). Reversible → false.
  lootFloorPerTier: 1,     // +N min-rarity steps per World Tier above 1 (clamped ≤ legendary). draw-neutral (shifts the existing rollGearInst minR arg).
  essMulPerTier:   0.25,   // +25% Esencia rewards per tier above 1. 0 draws (arithmetic at grant).
  poisePctPerTier: 0.0,    // sub-flag: enemy poise× per tier above 1 (0 = OFF; post-spawn ceiling scale, 0 draws).
  reframePrompt:   true,   // sub-flag: explicit "Ciclo N+1 / NG+" copy on the CAS-450 ascend scene.
  recap:           true,   // CAS-2043 (CAS-2035): LIVE. Flipped after CEO gate GO (CAS-2039). Reversible → false. Routes ascend → "ascendRecap" cycle-summary overlay.
  cap: 5,                  // align with WORLD_TIER.cap; the ascend offer already stops here.
};

// CAS-1947 — EVO Pilar 22: JEFE FIRMA MULTI-FASE (SIGNATURE_BOSS).
// $0 arte: tinte/glyph/flash/escala procedural únicamente. NO PixelLab. 1 knob, OFF byte-idéntico a HEAD.
// RNG-neutral STRONG: comportamiento determinista/telegrafiado; stream bossRng si se necesita variación;
// OFF byte-idéntico (save.v1 + srand). Todo estado de fase/timers = transitorio (_sb*, fuera del allowlist).
export const SIGNATURE_BOSS = {
  enabled: true,
  boss: "calderatyrant",
  zone: "caldera",
  phase2HpPct: 0.5,
  transitionWindowMs: 1500,
  transitionVulnMul: 1.5,
  poiseBreakStunMs: 1200,
  phases: {
    p1: { specialEvery:3, windup:1.0, slamCount:14, slamDmg:24, poiseMul:1.0 },
    p2: { specialEvery:2, windup:1.0, slamCount:18, slamDmg:26, poiseMul:1.4,
          slamInfl:{ type:"frost", amt:0.4, dur:1.8 } },
  },
  ailmentsToHero: { buildPerHit:18, cap:70 },
  rewards: { essenceBonus:200, guaranteedRarity:"rare" },
};

// CAS-1954 — EVO Cenizas de Espíritu (SPIRIT SUMMON: aliado IA invocable, single-player).
// $0 arte: sprite de mob REUSADO con tinte espectral cian + alpha (source-atop/lighter procedural). NO PixelLab, NO netcode.
// 1 knob HARD-GATED, RNG-neutral STRONG: el espíritu es 100% determinista ⇒ 0 draws srand; enabled:false ⇒ byte-idéntico a HEAD
// (ambos SEAMs — updateEnemies retarget + damageHero redirect — son no-op). Todo el estado (G._spirit, summonCharges, summonZone)
// es transitorio (fuera del allowlist de serializeSave) ⇒ save.v1 byte-id. Default enabled:false CONSERVADOR (no trivializa jefes:
// HP moderado, dmg medio, duración corta); el gate CEO decide flip live. Sub-tunes = config-only.
//   key      — CODE dedicado NO rebindable. Comma (","). CAS-2086 FIX: KeyN colisionaba con COMBO.heavyKey (config.js:1132,
//              también "KeyN") — el handler del pesado (input.js:282) hace `return` ANTES del de invocación (input.js:324),
//              tragándose la tecla ⇒ spawnSpirit inalcanzable en desktop. Las 26 letras están ocupadas (20 rebindables en
//              REBINDS + 6 fijas K/Y/L/H/N/U), así que el único code REALMENTE libre es NO-letra: Comma no aparece en ningún
//              bind ni handler y KEY_LABELS lo muestra como "," en el Códice. Ver Build/GE nota.
//   charges  — cargas transitorias (mirror flaskCharges); refill SÓLO por transición de zona + hoguera (Estus-parity, recurso escaso).
//   summonMs — vida máxima del espíritu (timer); expira también al llegar hp<=0.
//   threat   — regla de aggro DETERMINISTA (0 draws): "nearest" ⇒ un enemigo cuya amenaza más cercana es el espíritu lo persigue/ataca.
//   spirit   — perfil: hpPct de heroMaxHp, dmgMul de equippedDmg (daño PLANO baseline ×1: sin crit/boons/procs/WEAPON_BUFFS/ARTS/TWO_HAND,
//              0 srand; poise-dmg normal ⇒ divide postura = payoff), moveMul, atkCdMs, range (px), tint/alpha espectral, mold (sprite base).
export const SUMMON = {
  enabled: true,                // CAS-1980 GO-LIVE FLIP (CEO Gate CAS-1979 GO): SUMMON PLAYABLE. SEAMs active.
  key: "Comma",                 // CAS-2086 FIX: dedicado NO rebindable. KeyN chocaba con COMBO.heavyKey ⇒ pesado se tragaba la tecla. Comma (",") es el único code libre (26 letras ocupadas).
  charges: 2, refillOnZone: true, // + bonfire (mirror Estus)
  summonMs: 14000,              // duración máx conservadora
  threat: "nearest",            // regla determinista de aggro (0 draws)
  replaceOnRecast: false, maxActive: 1,
  spirit: { hpPct:0.35, dmgMul:0.55, moveMul:1.0, attackType:"melee", atkCdMs:900,
            range:56, tint:"#7fe3ff", alpha:0.72, mold:"skeleton" }
};

// CAS-1988 — MODO BOSS RUSH / GAUNTLET. $0 arte, 100% reuso del roster de jefes existente. 1 knob HARD-GATED.
// Un modo FINITO, opt-in, de jefes encadenados: el jugador pelea una SECUENCIA ORDENADA de los jefes que YA
// existen (dragón, tirano del pantano, tirano del abismo, Corazón de Magma…) espalda-con-espalda, con una
// hoguera/refill entre rondas, y termina la gauntlet o muere. Récord persistente = mejor ronda alcanzada.
// Controlador PARALELO e independiente de la Arena de Oleadas (NO toca una sola línea del código de Arena).
// enabled:false ⇒ modo INALCANZABLE (menú no muestra la entrada, KeyB inerte, tickBossRush nunca corre) ⇒
// byte-idéntico a HEAD (Arena/core/APEX intactos). Todo draw viene de bossRushRng dedicado (NUNCA srand).
// Récord en store propio mithralda.bossrush.v1 ⇒ save.v1 byte-id. El gate CEO decide el flip live (mirror SUMMON).
//   key           — CODE de menú (mirror KeyA=Arena input.js:93); KeyB libre en la escena menu.
//   sequence      — jefes ORDENADOS (claves de HUNTS[zone].boss). Escalada → finale = Corazón de Magma.
//                   EXCLUYE 'frost' (boss final:true ⇒ dispararía la pantalla de victoria) y 'trial' (world-boss opcional).
//   hpStep/dmgStep— escala por índice de ronda r (0-based): mul = 1 + r*step (ronda 0 = base ×1.0).
//   restSeconds   — respiro/hoguera entre rondas (mirror ARENA.restSeconds).
//   healFrac      — hoguera = fracción de maxHp curada entre rondas (1.0 = cura COMPLETA, checkpoint real).
//   refillOnRest  — recarga TODO el kit consumible en el respiro (estus/arrojadizos/buffs/summon).
//   essPerRound/essStepRound — Esencia garantizada por ronda limpiada = essPerRound + r*essStepRound (aritmética, 0 RNG).
//   clearBonusEss — bonus por COMPLETAR toda la gauntlet (aritmética, 0 RNG).
//   recordEssBase — milestone ronda-récord: ceil(recordEssBase * ronda) 1-vez/run (aritmética, 0 RNG).
export const BOSS_RUSH = {
  enabled: false,                 // CAS-2190: OCULTO del menú (Mithralda = MMORPG mundo-abierto; el jugador entra directo). enabled:false hard-gatea la entrada de menú (render zeroing rect + input.js keyboard/tap) ⇒ NO seleccionable. La LÓGICA del gauntlet queda intacta detrás de este flag; re-activar como actividad MMORPG = flip false→true. (era true CAS-1993)
  key: "KeyB",                    // entrada por teclado en el menú (KeyB libre en escena menu)
  sequence: ["caves", "swamp", "abyss", "caldera"],   // 4 rondas TUNABLE (CTO): dragón → tirano pantano → tirano abismo → Corazón de Magma
  hpStep: 0.10, dmgStep: 0.06,    // escala por índice de ronda r (0-based): mul = 1 + r*step
  restSeconds: 4,                 // respiro/hoguera entre rondas
  healFrac: 1.0,                  // hoguera = cura COMPLETA entre rondas (checkpoint real; TUNABLE)
  refillOnRest: true,             // recarga TODO el kit consumible en el respiro (estus/arrojadizos/buffs/summon)
  essPerRound: 40, essStepRound: 12,  // Esencia garantizada por ronda limpiada = essPerRound + r*essStepRound (0 RNG)
  clearBonusEss: 250,             // bonus por COMPLETAR toda la gauntlet (0 RNG)
  recordEssBase: 15,              // milestone ronda-récord: ceil(recordEssBase * ronda) 1-vez/run (0 RNG)
  // CAS-2047 (EVO CAS-2046) — TIME-ATTACK layer sobre el gauntlet existente. `timeAttack:false` = master DARK ⇒ TODO el
  // layer (timer + score + records + recap) muerto ⇒ build byte-idéntico a HEAD (serialize={v:1,bestRound}, gauntletComplete→menu,
  // HUD/recap inertes). Timer=dt de sim acumulado (0 Date.now), score=aritmética pura ⇒ 0 RNG ⇒ srand ON==OFF. $0 arte (canvas text).
  // El Gate CEO flippea timeAttack:false→true (config-only, mirror CAS-2043). Score/tiempo NO alteran la dificultad/orden del gauntlet.
  timeAttack: true,               // LIVE (Gate CEO CAS-2055 flip): enciende el layer Time-Attack (timer+score+records+recap)
  showTimer: true,                // reloj corriendo en el HUD de play (sub-toggle, gateado bajo timeAttack)
  showScore: true,                // bloque score+records en el recap (sub-toggle, gateado bajo timeAttack)
  scoreBase: 100000,              // base de puntuación (formula knob, TUNABLE)
  scoreTimeW: 100,                // peso tiempo: −round(combatSec × scoreTimeW)
  scoreHitW: 250,                 // peso golpes: −hitsReceived × scoreHitW
  scoreCleanBonus: 10000,         // bonus por run impecable (hitsReceived===0)
};

// CAS-2090 (EVO CAS-2090) — DESAFÍO CON SEMILLA (Seeded Challenge Run). El 4º meta-modo de replay (tras NG+, Boss
// Rush, Pactos); su valor NUEVO = REPRODUCIBILIDAD COMPARTIBLE: una semilla (código "MITH-XXXX" o la fecha del día)
// siembra el `srand` MAESTRO ⇒ dos jugadores con la misma semilla juegan el MISMO run determinista y comparan score.
// COMPONE la stack existente en vez de agregar un sistema aislado: reusa el gauntlet de Boss Rush como RULESET FIJO
// (BOSS_RUSH.sequence) + su scoring time-attack (BOSS_RUSH.score*, 0 RNG, 0 fórmula nueva) + el recap overlay.
// HARD-GATED: enabled:false ⇒ la entrada de menú NO se dibuja ⇒ pendingSeededChallenge nunca se arma ⇒
// startSeededChallenge (ÚNICO sitio que resiembra el master srand) NUNCA corre ⇒ srand byte-idéntico a HEAD. El
// seed dedicado SÓLO se aplica al ENTRAR al modo (mirror pendingBossRush) — el juego normal jamás lo toca (probar
// 48-draw ON-inactivo == OFF byte-id). Records AISLADOS por semilla en mithralda.seededchallenge.v1 (nunca save.v1).
// Reversible: Gate CEO flippea enabled:false→true (config-only, mirror CAS-2043/2055). Sin arte, sin path de daño nuevo.
//   key         — tecla de la escena MENÚ (NO un hotkey de play — mirror BOSS_RUSH.key/ARENA.key ⇒ 0 colisión de combate,
//                 lección directa del audit CAS-2085 donde SUMMON.key colisionó en play). La entrada de menú usa la semilla del día.
//   codePrefix  — formato del código compartible (etiqueta HUD/recap; la semilla del día concatena la fecha estable).
export const SEEDED_CHALLENGE = {
  enabled: false,                 // CAS-2190: OCULTO del menú (mundo-abierto directo). enabled:false hard-gatea la entrada de menú (render + input.js) ⇒ NO seleccionable; startSeededChallenge nunca corre ⇒ srand byte-id a baseline. La lógica queda intacta detrás del flag; re-activar como actividad MMORPG = flip false→true. Records aislados en mithralda.seededchallenge.v1 se conservan. (era true CAS-2093)
  key: "KeyC",                    // entrada por la escena menú (KeyC libre en menu; NO es hotkey de play ⇒ sin colisión de combate)
  codePrefix: "MITH-",            // prefijo del código compartible; la semilla del día = codePrefix + fecha estable (YYYYMMDD)
};

// CAS-2071 (EVO CAS-2071) — VARIEDAD DE ENCUENTROS. Variantes de COMPORTAMIENTO de mob a $0 arte: reusan el
// sprite + la telegrafía/AI existentes y sólo MODULAN stats (windup/lunge/hp/spd/dmg/poiseMax) sobre un CLONE del
// tpl (mirror applyZoneScale) ⇒ cada una fuerza una herramienta distinta del kit (parry/dodge, combo+rotura, AoE).
// El marcador es PROCEDURAL (tint/label, reusa el path del affix élite) ⇒ cero sprites nuevos. HARD-GATED:
// enabled:false ⇒ maybeVariant retorna en la 1ª línea ⇒ 0 draws en cualquier stream ⇒ build byte-idéntico a HEAD.
// RNG-neutral STRONG: la selección draw SÓLO de enemyVariantRng (stream dedicado sim.js), NUNCA del master srand ⇒
// srand ON==OFF byte-idéntico a cualquier chancePerZone. El Gate CEO flippea enabled:false→true (config-only,
// reversible, mirror CAS-2043/2055). Sin AI nueva, sin save nuevo, sin path de daño nuevo. 60fps, móvil jugable.
//   rngSeed        — seed del stream dedicado enemyVariantRng (distinto de todos los usados en sim.js:42–128).
//   chancePerZone  — fracción de spawns naturales elegibles que se vuelven variante, POR zona (ausente ⇒ 0 ⇒ sin variantes).
//   markerLabel    — pinta el label procedural sobre la barra HP (mirror affix render.js:1429). false ⇒ sólo tint/halo.
//   variants       — modulaciones puras de stats sobre el clone del tpl (windup↓/lunge↑, poiseMax↑, hp↓/spd↑…) + name/tint.
//   byZone         — qué variantes son elegibles por zona (variedad temática; se elige una del pool por enemyVariantRng).
export const ENCOUNTER_VARIANTS = {
  enabled: true,                 // DARK ship; Gate CEO flippea live (config-only, reversible, mirror CAS-2043/2055)
  rngSeed: 0x0ec02071,            // stream dedicado enemyVariantRng; NUNCA consume del master srand
  chancePerZone: { forest:0.30, caves:0.30, swamp:0.30, abyss:0.25 }, // TUNABLE; ausente ⇒ 0 (la variante es sal, no reemplazo)
  markerLabel: true,              // label procedural sobre barra HP (mirror affix render.js:1429)
  variants: {
    // Acechador — telegrafía más corta (con piso parryable) + lunge más largo ⇒ premia parry/dodge preciso.
    stalker: { name:"Acechador", windupMul:0.70, windupFloor:0.28, lungeMul:1.35, dmgMul:0.90, tint:"#ff8a3d" },
    // Bastión — poise alto ⇒ no se rompe con golpes sueltos; premia combos + rotura + finisher. hp↑, spd↓.
    bastion: { name:"Bastión", poiseMaxMul:1.80, hpMul:1.25, spdMul:0.85, dmgMul:1.00, tint:"#9aa7c7" },
    // Frágil — hp baja + veloz ⇒ muere de un arco ancho/arrojadizo pero castiga si lo ignoras; premia AoE. dmg↓ compensa.
    glass:   { name:"Frágil", hpMul:0.55, spdMul:1.30, dmgMul:0.85, tint:"#7bd14a" },
  },
  byZone: {                       // variedad temática por zona (una del pool se elige por enemyVariantRng)
    forest: ["stalker","glass"],
    caves:  ["bastion","stalker"],
    swamp:  ["glass","bastion"],
    abyss:  ["bastion","stalker","glass"],
  },
};

// CAS-2094 (EVO CAS-2094) — PELIGROS DE ARENA / ENVIRONMENTAL HAZARDS (mecánica #32). Un eje de decisión ORTOGONAL:
// durante encuentros de jefe/élite aparecen peligros de arena PROCEDURALES y TELEGRAFIADOS (vent de magma, suelo que
// colapsa, charco de veneno…) que OBLIGAN a reposicionarse. No se leen en el enemigo; se leen en el SUELO. $0 arte
// (anillo/tint/glyph 100% procedurales, mirror telegraphmark/affix). Reusa daño (damageHero(cap,ang,null,null): src=null
// ⇒ ni parry/escudo/espíritu entran, SÓLO i-frame/dodge del roll evaden ⇒ esquivable exclusivamente reposicionándose) y
// estado (statusOrBuildup/addBuildup EXISTENTES) — sin path de daño nuevo, sin AI, sin save. HARD-GATED: enabled:false ⇒
// maybeSpawnHazard retorna en la 1ª línea ⇒ 0 draws en cualquier stream ⇒ G.hazards vacío ⇒ updateHazards/render no-op ⇒
// BYTE-IDÉNTICO a HEAD. RNG-neutral STRONG: todo el azar draw SÓLO de arenaHazardRng (stream dedicado sim.js, sembrado
// por-spawn, distinto de los de sim.js:42–128), NUNCA del master srand ⇒ srand ON==OFF. Cap anti-degenerado: daño/tick ≤
// min(dmgFlat, maxHp*dmgFracCap) (imposible one-shot), telegraphMs amplio (siempre esquivable), maxActive+minGapPx
// (imposible acorralar). El Gate CEO flippea enabled:false→true (config-only, reversible, mirror CAS-2043/2055/2075/2093).
//   rngSeed     — seed del stream dedicado arenaHazardRng (distinto de todos los usados en sim.js:42–128).
//   spawnGate   — SÓLO spawnea con jefe/élite/campeón/signature vivo en G.enemies (presión posicional ENCIMA de la pelea).
//   cadenceMs   — cada cuánto se intenta plantar un hazard mientras el gate se cumple.
//   maxActive   — tope simultáneo (anti-saturación / anti-trap). telegraphMs/activeMs/fadeMs — ventanas de la máquina de fases.
//   tickMs      — clock de daño mientras el héroe está dentro y sin i-frames. dmgFlat/dmgFracCap — cap DURO de daño/tick.
//   radius/minGapPx — radio del hazard (px) y separación mínima (entre hazards y respecto al héroe: NUNCA spawnea encima).
//   byZone      — tipos temáticos por zona (uno del pool se elige por arenaHazardRng). types — cada tipo reusa un STATUS/meter existente + un tint/glyph.
export const ARENA_HAZARDS = {
  enabled: true,                  // GO-LIVE flip CAS-2103 (config-only 1-línea, reversible→false, mirror CAS-2043/2055/2075/2093)
  rngSeed: 0x0a2ea094,            // stream dedicado arenaHazardRng; NUNCA consume del master srand
  spawnGate: { bossOrElite:true },// SÓLO spawnea si hay jefe/élite/campeón/signature vivo en G.enemies
  cadenceMs: 3200,                // cada cuánto se intenta plantar un hazard mientras el gate se cumple
  maxActive: 2,                   // tope simultáneo (anti-saturación / anti-trap)
  telegraphMs: 950,              // ventana de aviso ANTES de que dañe (siempre esquivable con roll/reposición)
  activeMs: 1600,                 // ventana activa que daña
  fadeMs: 300,                    // desvanecido presentacional (0 daño)
  tickMs: 350,                    // clock de daño mientras el héroe está dentro y sin i-frames
  dmgFlat: 6,                     // daño base por tick (CAPEADO)
  dmgFracCap: 0.06,              // tope duro: daño/tick ≤ hero.maxHp*0.06 (nunca one-shot)
  radius: 42,                     // radio del hazard (px); bounded
  minGapPx: 64,                   // separación mínima entre hazards y respecto al héroe al plantar
  markerLabel: true,             // glyph procedural (mirror affix render.js:1442); false ⇒ sólo tint/anillo
  byZone: {                       // tipos temáticos por zona (uno del pool se elige por arenaHazardRng)
    caldera: ["magma"], abyss: ["magma","void"], caves: ["collapse"],
    ruins:   ["collapse"], swamp: ["poison"], forest: ["bramble"], frost: ["ice"],
  },
  types: {                        // cada tipo reusa un STATUS/meter existente + un color de tint; SIN daño nuevo
    magma:    { status:"burn",   statusDmg:3, tint:"#ff6a2a", glyph:"♨" },
    poison:   { status:"poison", statusDmg:3, tint:"#8fd14a", glyph:"☣" },
    bramble:  { status:"bleed",  statusDmg:2, tint:"#c58a4a", glyph:"✷" },
    collapse: { status:null,     statusDmg:0, tint:"#8a8a96", glyph:"▩", brief:true }, // sólo daño físico capeado
    ice:      { status:"slow",   statusDmg:0, tint:"#8fd0ff", glyph:"❄" },
    void:     { status:null,     statusDmg:0, tint:"#b070e0", glyph:"◈" },
  },
};


// CAS-1996 (EVO CAS-1995) — CÓDICE DE COMBATE + HINTS CONTEXTUALES. Descubribilidad pura: un panel de referencia
// read-only (A) que lista las mecánicas de combate VIVAS con su binding REAL + descripción, y toasts one-time de
// primer-encuentro (B) que enseñan cada sistema cuando el jugador lo toca por primera vez. 100% BORROW: A clona el
// patrón Códice de Botín/Títulos/Pactos (scene fija gateada por tecla), B clona el primitivo toast(str,secs) tras un
// store AISLADO nuevo (mithralda.hints.v1). $0 arte (sólo texto + MithraldaPixel + primitivas de panel existentes).
// HARD-GATED: enabled:false ⇒ codexKey inerte, fireHint retorna temprano, mithralda.hints.v1 NUNCA se crea ⇒ save.v1
// + srand byte-idénticos a HEAD. RNG-neutral STRONG: el códice sólo LEE config/estado, los hints sólo llaman toast
// (no-RNG) ⇒ 0 draws incluso enabled:true. El Gate CEO decide el flip live (mirror los 24 pilares). enabled:false DARK.
//   codexKey       — CODE fijo NO rebindable de la escena play (KeyH=Parry, 26 letras ocupadas; Backquote ` libre).
//   showContextHints — sub-toggle: apaga SÓLO los hints (B); el códice (A) sigue funcionando.
//   toastSecs      — duración del toast de hint (reusa toast(str,secs); 0 RNG).
//   showHudHint    — afordancia HUD "[`] Códice" (descubribilidad del propio códice). $0 arte, presentacional.
export const COMBAT_CODEX = {
  enabled: true,            // CAS-2002 GO-LIVE flip (Gate CEO CAS-1999 GO; mirror SUMMON CAS-1980/BOSS_RUSH CAS-1994). Códice + hints LIVE.
  codexKey: "Backquote",    // ` / ~ — CODE fijo NO rebindable (grep-verificado libre). CTO-tunable.
  showContextHints: true,   // sub-toggle: apaga SÓLO los hints (B); el códice (A) sigue vivo.
  toastSecs: 4.5,           // duración del toast de hint (reusa toast(str,secs); 0 RNG).
  showHudHint: true,        // afordancia HUD "[`] Códice" (discoverability del propio códice). $0 arte.
};

// CAS-2010 — Game-Feel / Impact Pass v1. Presentation-only, RNG-neutral, $0 art.
// Gates the EXISTING hit-stop (freeze) + screen-shake (shakeAdd) + impact-flash layer
// (CAS-127/272/273) plus the v1 coverage extensions. enabled:true ships LIVE (realce
// de sistemas ya vivos — no dark flip). Each sub-flag is an independent accessibility
// off-switch; ALL sub-flags off ⇒ combat reads exactly as a no-juice baseline (no freeze,
// no shake) — motion-safe. freeze/shakeAdd consume 0 srand ⇒ toggling changes the RNG
// draw count/sequence by exactly zero (see design/cas2010-game-feel-impact.md §4).
export const JUICE = {
  enabled: true,
  hitStop:     true,   // micro freeze-frames on impact verbs; also honors settings.reduceMotion (closes the pre-CAS-2010 gap where freeze() ignored it)
  screenShake: true,   // escalated camera shake (already reduceMotion+settings.shake gated; this is an extra master toggle on top)
  flash:       true,   // crit / backstab / riposte / execute floater-banner polish (base damage numbers stay for legibility)
  hitStopCapFrames: 9, // hard cap (frames @60fps ≈ 150ms) — matches current longest freeze; 60fps guard so no single event stalls perceptibly
};

// CAS-2225 — Door open/close + interior-warp MECHANIC (open-world Thais rebuild, parent CAS-2186).
// Code-only, DARK. Turns the city door-STUBS already placed in Batch-1/Batch-2 (tavern + house
// threshold portals, kind:"door") into interactive AUTHORITATIVE doors and adds a walk-through warp
// into a small habitable interior. Server-authority-READY by design (see design/cas2225-doors-interiors.md):
//   • Door open/closed is SHARED WORLD STATE keyed by a stable, position-derived id (door:tx,ty) in
//     G.doors — a server would own this map; nearby clients read it. No client-only truth. Toggled ONLY
//     by the interact intent (deterministic, 0 RNG draws).
//   • Interior is an INSTANCE: a small walled room carved into the unused ocean margin of the tiled
//     world (the caldera "self-contained region reached only by warp" precedent), reached by crossing an
//     OPEN threshold; the exit tile warps back to the exact origin threshold. The room is a per-house
//     instance TEMPLATE — under Stage-2 concurrency the server keys instances by (houseId, partyId) so N
//     players/parties resolve to distinct rooms; Stage-1 single-player resolves to the one carved room.
// HARD-GATED behind DOORS_INTERIORS.enabled. enabled:false ⇒ world.js carves NO rooms + creates NO door
// records (terr/wallSet/prop fingerprint byte-identical, the stubs keep their "coming soon" toast) and
// sim.js runs ZERO door/warp/collision code (0 RNG draws, save-neutral — G.doors is transient run-state,
// never serialized) ⇒ a run is byte-identical to a build without the feature. srand ON==OFF (the build
// mutates terrain, never the seeded RNG stream). Ships DARK; CEO Gate byte-verifies + flips config-only.
export const DOORS_INTERIORS = {
  enabled:false,           // DARK — Gate CEO flips after QA OBSERVABLE. false ⇒ byte-identical to HEAD.
  startOpen:false,         // doors begin CLOSED (solid collision); interact toggles open (walkable).
  warpCooldown:0.5,        // s — debounce after any threshold warp so you don't instantly re-trigger.
  // interior instance geometry — a row of small walled rooms carved into the ocean margin of the tiled
  // world (cols>procW, rows in the oldlands band: unreachable on foot, reached ONLY by warp). All fixed
  // (no RNG). roomW×roomH = walkable stone floor; `apron` extra solid-wall tiles wrap the 1-tile wall ring
  // so the viewport fills with wall/floor (reads as an interior, not an island). pitch = cols between rooms.
  interior:{ baseTx:380, baseTy:630, roomW:13, roomH:9, apron:6, pitch:30 },
};

// CAS-2016/2017 — Onboarding: Primer de Combate (first-run). Presentation/data-only, RNG-neutral, $0 art.
// EXTIENDE la maquinaria de tutorial YA VIVA (CAS-128: TUT_STEPS + coachmarks + skip + marker aislado
// mithralda.tut.v1 + seams teach-by-doing) con los 6 verbos Souls que el flujo genérico nunca enseña:
// esquiva · parry · lock-on · backstab · Estus · hoguera. NO es un tutorial nuevo NI una mecánica de sim
// nueva — sólo gatea la COBERTURA de enseñanza sobre primitivos live (DODGE/PARRY/LOCK_ON/BACKSTAB/FLASK/
// BONFIRE). HARD-GATED: enabled:false ⇒ composeTutSteps() == HEAD ["move","attack","skill","travel","loot",
// "equip","done"] byte-idéntico + los 6 tutMark nuevos hacen early-return (0 state touch) ⇒ save.v1 + srand
// byte-idénticos a HEAD, marker mithralda.tut.v1 sin cambios de esquema. 0 stream de RNG nuevo, 0 draws.
// Ships DARK (enabled:false) — Gate CEO decide el flip (mirror SUMMON/BOSS_RUSH/CODEX). Cada sub-flag
// teach* es un off-switch de accesibilidad independiente: false ⇒ DROP de exactamente ese paso del bloque
// de combate; todos false (o enabled:false) ⇒ 0 pasos de combate ⇒ byte-id HEAD. Ver design/cas2016-combat-primer.md §3.
export const ONBOARDING = {
  enabled: true,           // LIVE — Gate CEO CAS-2020 GO'd (CAS-2021 flip). Combat Primer active on true first-run.
  teachDodge:   true,      // per-verb a11y sub-flags — cada false quita SÓLO su paso del bloque de combate
  teachParry:   true,
  teachLockOn:  true,
  teachBackstab:true,
  teachEstus:   true,
  teachBonfire: true,
  skippable:    true,      // conserva la afordancia de saltar (nunca un temporizador forzado)
};

// CAS-1996 — tabla DATA-DRIVEN del Códice de Combate. Definida al FINAL (tras TODOS los knobs) porque cada entrada
// resuelve su tecla por getter sobre el knob REAL (keyOf) — de modo que si el CTO retunea un binding, el códice se
// actualiza solo, NUNCA miente con un literal (barra dura del ticket). Los getters se evalúan en render-time. Entradas
// con keyOf textual ("Rodar"/"Espalda"/"—") son mecánicas SIN tecla dedicada (roll=dirección+stamina; backstab=posicional;
// poise/stamina/bloodstain=pasivas; jefe de firma=pasiva) — etiquetadas honestamente, sin inventar un binding. `gate`
// filtra: sólo se listan las mecánicas VIVAS (enabled). CAS-2086 RESUELTO: la antigua colisión COMBO.heavyKey/SUMMON.key
// (ambos "KeyN") ya no existe — SUMMON.key movido a Comma; ahora el códice muestra "N"=pesado y ","=invocar, ambos reales.
export const COMBAT_CODEX_ENTRIES = [
  // MOVIMIENTO
  { group:"Movimiento", label:"Rodar (i-frames)",   keyOf:()=>"Rodar",              desc:"Esquiva con fotogramas de invulnerabilidad; cuesta STAMINA.", gate:()=>DODGE.enabled },
  { group:"Movimiento", label:"Fijar objetivo",     keyOf:()=>LOCK_ON.key,          desc:"Lock-on: fija la orientación al enemigo; cicla objetivos.", gate:()=>LOCK_ON.enabled },
  { group:"Movimiento", label:"Postura a 2 manos",  keyOf:()=>TWO_HAND.key,         desc:"Alterna a dos manos: +daño y poise, −velocidad.", gate:()=>TWO_HAND.enabled },
  // DEFENSA
  { group:"Defensa",    label:"Parada con Tempo",   keyOf:()=>PARRY.key,            desc:"Parry: pulsa con timing para anular el golpe y abrir riposte.", gate:()=>PARRY.enabled },
  { group:"Defensa",    label:"Bloqueo con escudo", keyOf:()=>SHIELD_BLOCK.key,     desc:"Mantén para levantar la guardia y reducir daño (consume stamina).", gate:()=>SHIELD_BLOCK.enabled },
  { group:"Defensa",    label:"Reflejo de proyectil", keyOf:()=>PARRY.key,          desc:"Parada con tempo contra un PROYECTIL: lo devuelve al tirador como tu ataque (daño capeado).", gate:()=>DEFLECT.enabled },
  { group:"Defensa",    label:"Poise / Hiperarmor", keyOf:()=>"—",                  desc:"Aguante: no te interrumpen mientras dure el poise/hiperarmor.", gate:()=>(POISE.enabled||HYPERARMOR.enabled) },
  // OFENSIVA
  { group:"Ofensiva",   label:"Ataque pesado",      keyOf:()=>COMBO.heavyKey,       desc:"Golpe cargado; rompe poise y encadena combos.", gate:()=>COMBO.enabled },
  { group:"Ofensiva",   label:"Puñalada por la espalda", keyOf:()=>"Espalda",       desc:"Backstab: golpea desde el arco trasero para daño masivo.", gate:()=>BACKSTAB.enabled },
  { group:"Ofensiva",   label:"Arte de Arma",       keyOf:()=>WEAPON_ARTS.key,      desc:"Ejecuta el Arte del arquetipo de arma equipado.", gate:()=>WEAPON_ARTS.enabled },
  { group:"Ofensiva",   label:"Empujón / Rompe-guardia", keyOf:()=>GUARD_BREAK.key, desc:"Patada que drena la postura de un enemigo que bloquea/turtlea y le rompe la guardia (abre ejecución).", gate:()=>GUARD_BREAK.enabled },
  { group:"Ofensiva",   label:"Estocada de Avance",  keyOf:()=>LUNGE.key,           desc:"Dash ofensivo que cierra distancia y golpea de estocada (SIN i-frames; castiga a quien retrocede/kitea o cierra sobre un caster).", gate:()=>LUNGE.enabled },
  { group:"Ofensiva",   label:"Arrojar",            keyOf:()=>THROWABLES.throwKey,  desc:"Lanza el consumible arrojadizo seleccionado; cicla el tipo.", gate:()=>THROWABLES.enabled },
  { group:"Ofensiva",   label:"Aplicar resina",     keyOf:()=>WEAPON_BUFFS.applyKey,desc:"Unta el arma con una resina: buff temporal de daño/estado.", gate:()=>WEAPON_BUFFS.enabled },
  // RECURSOS
  { group:"Recursos",   label:"Beber Estus",        keyOf:()=>FLASK.key,            desc:"Cura por carga; se recarga en zona/hoguera.", gate:()=>FLASK.enabled },
  { group:"Recursos",   label:"STAMINA",            keyOf:()=>"—",                  desc:"Sin stamina no puedes rodar ni lanzar pesados; se regenera.", gate:()=>STAMINA.enabled },
  { group:"Recursos",   label:"Invocar espíritu",   keyOf:()=>SUMMON.key,           desc:"Cenizas de Espíritu: invoca un aliado que divide la aggro del jefe.", gate:()=>SUMMON.enabled },
  { group:"Recursos",   label:"Hoguera",            keyOf:()=>BONFIRE.key,          desc:"Descansa: cura, recarga Estus y fija checkpoint.", gate:()=>BONFIRE.enabled },
  { group:"Recursos",   label:"Tablón de Recompensas", keyOf:()=>BOUNTY_BOARD.key,  desc:"En el Santuario: acepta el contrato destacado (mata N de X) y reclámalo al completarlo por oro + XP.", gate:()=>BOUNTY_BOARD.enabled }, // CAS-2273: entrada data-driven ⇒ la tecla mostrada nunca miente
  { group:"Recursos",   label:"Mancha de sangre",   keyOf:()=>"—",                  desc:"Al morir sueltas la Esencia; recupérala en el punto de muerte.", gate:()=>BLOODSTAIN.enabled },
  // JEFES
  { group:"Jefes",      label:"Jefe de Firma",      keyOf:()=>"—",                  desc:"Jefes de 2 fases con ventana de vulnerabilidad tras romper poise.", gate:()=>SIGNATURE_BOSS.enabled },
  { group:"Jefes",      label:"Modo Boss Rush",     keyOf:()=>BOSS_RUSH.key,        desc:"Gauntlet finito de jefes encadenados (desde el menú); récord = mejor ronda.", gate:()=>BOSS_RUSH.enabled },
  { group:"Jefes",      label:"Arena de Oleadas",   keyOf:()=>ARENA.key,            desc:"Oleadas infinitas con jefes periódicos (desde el menú); récord = mejor oleada.", gate:()=>ARENA.menuEnabled }, // CAS-2190: gateado por menuEnabled (oculto del menú ⇒ no se anuncia en el Códice). Antes gate:()=>true.
];
