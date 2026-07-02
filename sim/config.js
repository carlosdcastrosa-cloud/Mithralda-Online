// ===========================================================================
// sim/config.js — data-driven simulation constants (no behavior, no DOM).
// World dimensions, tile ids, hero tuning, per-class attacks, enemy templates,
// playable class list. Designers/balance live here, not in code paths.
// ===========================================================================
export const TS = 32;                 // world pixels per tile
export const MAP_W = 110, MAP_H = 110;

// terrain tile ids
export const T_GRASS = 0, T_DIRT = 1, T_STONE = 2, T_COBBLE = 3, T_SAND = 4, T_WATER = 5;
// CAS-121 — frozen floor for the gated Cripta Helada (3rd gated biome). Procedurally
// rendered pale-blue ice (no new art) so the zone reads as a distinct, colder place.
export const T_ICE = 6;

// CAS-80: data-driven town tilemap — Puerto Solana reads as a small hub built from the
// real Ancient Ruins tiles. One glyph per 32px cell, stamped over the 18×18 town rect
// in sim/world.js; TOWN_LEGEND maps each glyph to a terrain tile id, and each tile id
// is painted by its ERW atlas in render/render.js (flagstone for the plaza, grass for
// the verges). Designers reshape the town by editing these rows alone — no code change;
// collision stays grid-anchored (water/walls block via solidBlocked). Layout: a rounded
// flagstone plaza (P) ringed by grass verges (g), with dirt roads (.) punching out to
// the four hunt-zone exits — N caves / S arena / E forest / W ruins — at local cols/rows
// 8-9 so they line up with the world's approach paths. Width must equal town.w (18).
export const TOWN_LEGEND = { g:T_GRASS, P:T_COBBLE, ".":T_DIRT, "~":T_WATER };
export const TOWN_MAP = [
  "gggggggg..gggggggg",
  "gggggggg..gggggggg",
  "gggggggg..gggggggg",
  "gggggPPPPPPPPggggg",
  "ggggPPPPPPPPPPgggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "...PPPPPPPPPPPP...",
  "...PPPPPPPPPPPP...",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "gggPPPPPPPPPPPPggg",
  "ggggPPPPPPPPPPgggg",
  "gggggPPPPPPPPggggg",
  "gggggggg..gggggggg",
  "gggggggg..gggggggg",
  "gggggggg..gggggggg",
];

export const CFG = {
  heroSpeed: 152, rollSpeed: 430, rollTime: 0.20, rollIFrame: 0.34, rollCD: 0.62,
  atkRange: 50, atkArc: Math.PI * 0.62, atkCD: 0.42, atkActive: 0.16,
  pickRange: 44, talkRange: 56, fountainRange: 60,
  // CAS-210: souls-like RIPOSTE — a frame-perfect dodge opens a brief window during which
  // the next hero hit is a guaranteed crit scaled by riposteMult (a crushing counter). The
  // window is short enough that you must commit the counter immediately, not bank it.
  riposteWindow: 1.4, riposteMult: 2.4,
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
    {id:"regen",      type:"hot",  cost:12, cd:8.0, heal:11, dur:5.0, col:"#7bd44a", fx:"buffaura", sfx:"heal"},
    {id:"thornstorm", type:"field", cost:20, cd:6.0, dmg:11, tick:0.5, dur:3.0, range:74, offset:46, status:{type:"slow",amt:0.6,dur:1.1}, col:"#5fae4a", fx:"thornfield", style:"spike", sfx:"rune"},
  ],
  priest: [
    {id:"greaterheal", type:"heal", cost:16, cd:5.0, heal:60, col:"#7fffa8", fx:"healburst", sfx:"heal"},
    {id:"powerword",   type:"buff", cost:12, cd:9.0, stat:"def", amt:8, dur:7.0, col:"#bfeaff", fx:"buffaura", sfx:"heal"},
    {id:"smite",       type:"proj", cost:14, cd:2.4, dmg:38, spd:460, kind:"holybolt", status:{type:"stun",dur:0.6}, col:"#fff0b0", fx:"spellburst", sfx:"fire"},
  ],
};

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
export const MOB_AFFIX_IDS = ["swift","armored","vampiric","volatile"];
export const MOB_AFFIX = {
  swift:    { name:"Veloz",      col:"#5fd6ff", hpMul:1.5, spdMul:1.42, gaitMul:1.42, sizeMul:1.06, xpMul:1.6, goldMul:1.6, gearBonus:0.10 },
  armored:  { name:"Acorazado",  col:"#c8d2e0", hpMul:1.9, spdMul:0.92, gaitMul:0.92, dmgReduce:0.45, sizeMul:1.16, xpMul:1.7, goldMul:1.7, gearBonus:0.12 },
  vampiric: { name:"Vampírico",  col:"#ff5a6a", hpMul:1.8, lifesteal:0.10, sizeMul:1.12, xpMul:1.7, goldMul:1.7, gearBonus:0.12, melee:true },
  volatile: { name:"Volátil",    col:"#ff9a3a", hpMul:1.6, blast:84, blastDmgMul:0.85, sizeMul:1.12, xpMul:1.7, goldMul:1.7, gearBonus:0.12 },
};

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
  // CAS-114 — the Abismo: a fifth, power-gated hunt zone that strictly out-classes
  // every open zone (trash hits harder + drops more, capstone is the true endgame).
  // It is the PAYOFF the loop lacked: grind gold → buy merchant upgrades (CAS-112) +
  // level → clear the ABYSS_POWER_REQ gate → unlock richer content; the persisted
  // progression (CAS-113) keeps it unlocked across reloads. Same pure-math scaling.
  abyss:  { tier:5, hpMul:2.80, dmgMul:1.90, spdMul:1.20, xpMul:2.80 },
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

// CAS-123 — Stage-1 win-condition descriptor. The single legible GOAL the whole run
// builds toward, surfaced in the HUD objective tracker (render.js) from minute one and
// resolved when the FINAL capstone (HUNTS[STAGE1_GOAL.zone].boss.final) dies. Data-driven:
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
export const ZONE_MOD_MAP = (()=>{ const m={}; for(const z of ZONE_MODIFIERS) m[z.id]=z; return m; })();
// CAS-394: the cursed-zone draft bias. Clearing a cursed zone bumps the boon draft's EFFECTIVE
// depth by this much (raises the depth-scaled rare/legendary weights in boonRarityWeight — "up one
// tier") AND guarantees ≥1 rare+ card. Kept modest so it biases the pool without flooding
// legendaries (their weight cap in BOON_RARITY still applies). Tunable.
export const CURSE_DEPTH_BONUS = 4;
