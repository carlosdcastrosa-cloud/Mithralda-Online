// ===========================================================================
// render/render.js — all drawing: world, entities, fx, HUD, menus, overlays.
//
// Reads simulation state (sim.G / sim.world) and an interpolation alpha; it
// NEVER mutates sim state. The only randomness it uses is its OWN isolated
// stream (rrng) for purely cosmetic jitter (screen shake, blood spray, menu
// starfield) — kept separate from the sim RNG so render can never change the
// simulation outcome. UI hit-rects produced while drawing are written into the
// shared `ui` object owned by the input layer.
// ===========================================================================
import * as sim from "../sim/sim.js";
import { zoneOf } from "../sim/world.js";
import { TS, MAP_W, MAP_H, T_GRASS, T_STONE, T_SAND, T_COBBLE, T_ICE, T_SWAMP, T_CALDERA, T_STREET, CFG, CLASS_LIST, CLASS_STATS, SPELLS, ACTIVE_ABILITIES, ABILITY_MAP, ULTIMATES, ULTIMATE_MAP, HUNTS, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, CALDERA_POWER_REQ, STAGE1_GOAL, STATUS, CONSUMABLES, CUSTOMIZE, MOB_AFFIX, CHAMPION, BOON_MAP, BOON_CAT_LABEL, BOON_RARITY, SYNERGIES, SYN_MAP, ZONE_MOD_MAP, WEAPON_AFFIXES, FRENZY, DODGE, PARRY, POISE, LOCK_ON, FLASK, BLOODSTAIN, SHIELD_BLOCK, BONFIRE, WEAPON_ARTS, WEAPON_BUFFS, SIGNATURE_BOSS, SUMMON, BOSS_RUSH, SEEDED_CHALLENGE, ARENA, ENCOUNTER_VARIANTS, ARENA_HAZARDS, COMBAT_CODEX, COMBAT_CODEX_ENTRIES, ONBOARDING, NG_PLUS, PACTS, RALLY, CHARGED_ATTACK, PIXELART, DOORS_INTERIORS, MINIMAP, DAYNIGHT, WEATHER, ZONE_BANNER, SAFEZONE, RESTED_XP, RECALL, BOUNTY_BOARD, SANCTUARY_REP, SANCTUARY_REWARDS, WORLD_EVENT, SANCTUARY_EMISSARY, SANCTUARY_OATH, SANCTUARY_LEDGER, ORDER_STANDINGS, ORDER_TERRITORY, ORDER_CONTEST, FELLOWSHIP_BOND, MENTOR_BOND, SOUL_RECOVERY, WORLD_PULSE, CONGREGATION, WAYFARER_TRAIL, DIVERSE_COMPANY, LONG_WATCH, FRONTIER_SPREAD, INFLUX_SURGE, BATTLE_SYNC, CONVOY_MARCH, WARDING_RING, KINSHIP_BOND, WAYFARER_ROAM, FOCUS_FIRE, TRAILCRAFT, DELVE, ERUDITION, NOCTURNE_HUNT, CADENCE_RUSH, TEMPEST_SURGE, LAST_STAND, FIRM_FOOTING, SHADOW_STALK, SCARCITY_EDGE, APEX_PROXIMITY, MOB_AFFIX_DANGER, ZONE_EVENT_SURGE, ENCOUNTER_VARIANT_SURGE, ARENA_HAZARD_SURGE, BOSS_ENRAGE_SURGE, SPOILS_FIELD_SURGE, CARNAGE_FIELD_SURGE, CROSSFIRE_FRAY_SURGE, MAELSTROM_FIELD_SURGE, BLIGHT_HARVEST_SURGE, SKIRMISH_LINE_SURGE, CONTROL_HARVEST_SURGE, BLOODHARVEST_SURGE, PACKHARVEST_SURGE, LONGSHOT_SURGE, INTERRUPT_SURGE, HEADING_SURGE, ZONETIER_SURGE, BULK_SURGE, ROLE_SURGE, SWIFT_SURGE, MENACE_SURGE, TOUGH_SURGE, SENTINEL_SURGE, RAM_SURGE, WINDUP_SURGE, RECOVER_SURGE, LUNGE_SURGE, GEARCHANCE_SURGE, GOLD_SURGE, SPLASH_SURGE, BANE_SURGE, MOTLEY_SURGE, DISPERSE_SURGE, FLANK_SURGE, COLUMN_SURGE, ORIENT_SURGE, SPEED_SURGE, CONVERGE_SURGE, ENCIRCLE_SURGE, DEPTH_SURGE, SIZECLASS_SURGE, ORBIT_SURGE, ACCEL_SURGE } from "../sim/config.js";
import { clamp, dist2 } from "../sim/math.js";
import { createRNG, hash2 } from "../sim/rng.js";
import { gearStat, gearName, gearCol, rarityRank, equippedDmg, equippedDef, heroMaxHp, affixTotals, affixList, affixLabel, FORGE, forgeLevel, forgeNextCost, SETS, SET_ORDER, setCounts, RUNES, runeDef, runeName, socketTotals } from "../sim/gear.js";
import { TALENTS, talentNodes, talentNode, nodeRank, canAllocTalent, lockReason, talentSpent } from "../sim/talents.js";
import { STR } from "../strings.js";
import { audio } from "../audio.js";
import { view, zoom } from "../view.js";
import { COL } from "./palette.js";
import { resetGame, clearTutSeen } from "../persist.js";   // CAS-113: pause-menu "Nueva partida"; CAS-267: re-arm onboarding
import * as settings from "../settings.js";   // CAS-265: rebind table + settings persistence
import { daily } from "../daily.js";          // CAS-134: daily return loop (bounty board view model)
import { bestiary } from "../bestiary.js";    // CAS-386: bestiary / codex collection view model
import { uiLayout } from "../ui/layout.js";
import { FF } from "./font.js";   // CAS-1610: central pixel-font family (was inline typewriter monospace)
import { GROUND } from "./tiled-ground-data.js";   // CAS-462: suelo visual Tiled
import { TDECO } from "../sim/tiled-deco-data.js"; // CAS-462: props visuales Tiled   // CAS-418: movable-widget positions (minimap / spell bar) + pause reset
import {
  blit, SP, IMG, loadImg, drawCoin, drawPotion, drawFragment,
  ANIM, ENEMY_ANIM, ENEMY_IMG, ENEMY_STRIP, ENEMY_STRIPS, resolveStrip, NPC_ANIM, CLS, PROP_SCALE, HERO_SPRITE_SCALE,
  dir4FromAngle, drawClassFrame, drawAnim, frameIndex, FX_STRIP,
} from "./sprites.js";
import { ensureMasks, bakeHero } from "./customize.js"; // CAS-169 part-recolor bake

// CAS-2191: cobblestone STREET dual-grid Wang lookup (CAS-2186 tileset — 4×4 of 32px corner
// tiles). Derived from cobble_street_tileset.json: each display tile is chosen by its 4 corner
// terrains (paved=1 / grass=0), mask = NW|NE<<1|SE<<2|SW<<3. Value = [col,row] into the 128×128
// sheet. mask 0 (all grass) is never drawn (the grass base shows through); 15 = full cobble.
const CITY_WANG=[[2,1],[1,1],[2,0],[3,0],[3,1],[2,3],[3,2],[0,0],[2,2],[1,0],[0,1],[1,3],[1,2],[0,2],[3,3],[0,3]];

// CAS-82: the board's main-character art is a single 256×256 hooded pose
// (assets/erw/hero/hero_hooded.png) — a higher-fidelity match for our existing
// hooded hero, with NO walk/directional sheet. We draw the tight content cell
// (alpha bbox 58×158 @ 96,56) bottom-anchored at ~2 tiles, and give movement
// feel PROCEDURALLY (step-bob / squash / lunge) — all derived from sim time and
// animT, never render RNG, so it stays Stage-2 server-authority-safe.
const ERW_HERO_SRC="./assets/erw/hero/hero_hooded.png";
const ERW_SX=96, ERW_SY=56, ERW_SW=58, ERW_SH=158;
// CAS-208: 158px tall × 0.30 ≈ 47px ≈ 1.5 tiles — matches the class hero. (Was 0.42 ≈
// 66px ≈ 2 tiles; this deep hooded fallback rarely fires but now shrinks in step.)
const ERW_SCALE=0.30;
// CAS-92: the hero is no longer a single static pose. Higgsfield generated real
// walk / attack / dodge-roll sheets (assets/erw/hero/gen/*, bg-removed), sliced
// into UNIFORM packed strips by tools/slice-hero-anim.mjs. Geometry mirrors
// assets/erw/hero/hero_anim.json: every frame is HERO_FW×HERO_FH with the body
// centroid at column HERO_AX and the feet on row HERO_FOOT, so all states share
// one anchor. We pick the strip + frame from h.animState (time-driven, no render
// RNG) — same data-driven pattern as ENEMY_ANIM/drawAnim. Size REVERTED: the
// 158px standing figure × 0.32 ≈ 51px ≈ 1.6 tiles (down from the 66px the board
// found "muy grande").
const HERO_FW=403, HERO_FH=450, HERO_AX=122, HERO_FOOT=448;
// CAS-208: keep the transient hooded-anim fallback in lockstep with the class hero
// (0.32 → 0.30) so there is no size flash before the per-class PNG loads.
const HERO_ANIM_SCALE=0.30;
const HERO_STRIPS={
  idle:  {img:"hero_idle",   fc:1},
  walk:  {img:"hero_walk",   fc:4},
  attack:{img:"hero_attack", fc:4},
  roll:  {img:"hero_roll",   fc:4},
};
// CAS-98: per-class hero. CAS-94 produced 4 Higgsfield class characters
// (warrior/mage/archer/rogue) derived from the same hooded main character, each
// delivered as a CLEAN ML-cutout transparent PNG (assets/erw/hero/gen/classes/
// <cls>_idle.png). tools/slice-class-heroes.mjs crops them to one shared
// CLASS_FW×CLASS_FH cell (feet on row CLASS_FOOT, centroid at col CLASS_AX) per
// assets/erw/hero/classes/classes.json. We draw the SELECTED class + the CAS-82
// procedural movement feel (breathing/hop/squash/lunge from drawHero), so the
// player sees their OWN class actually moving — never static. Scale 0.32 puts the
// ~160px figure at ~51px ≈ 1.6 tiles — the CAS-92 final main-character size.
// NOTE: the CAS-94 idle MOTION loops are MP4s on a grey studio backdrop (gray-on-
// gray hooded figure); local keying leaves a halo, so true keyframed loop anim
// awaits bg-free per-class animation SHEETS from the Art Director — then they slice
// into a CLASS_FC>1 strip via the same path as the main hero (slice-hero-anim.mjs)
// and this draw already supports it (fi column). All time-driven → Stage-2 safe.
// Falls back to the hooded anim if art is absent.
// CAS-101: 6-frame ANIMATED idle strips; cell changed but figureH=160 preserved
// so on-screen size + CLASS_ANIM_SCALE=0.32 are UNCHANGED (geom source: classes.json).
const CLASS_FW=140, CLASS_FH=166, CLASS_AX=65, CLASS_FOOT=163, CLASS_FC=6;
// CAS-208 (board CAS-207): shrink the main character to ~1.5 tiles tall. figureH=160px
// (classes.json) × 0.30 = 48px = 1.5 × TS(32). Was 0.32 → 51.2px ≈ 1.6 tiles ("muy grande").
// Feet stay anchored (dy = feet − CLASS_FOOT·S) so no clipping/floating; collision is
// sim-side (h.x/h.y) and unaffected. Aspect ratio preserved (single scalar, no distortion).
const CLASS_ANIM_SCALE=0.30;
// CAS-110: per-class WALK-CYCLE strips (8 frames @ 8fps, same cell geom as the idle).
// Keyed by movement: walk → clswalk_* gait; idle/attack/roll keep the CAS-101 idle loop.
const CLASS_WALK_FC=8, CLASS_WALK_FPS=8;
// Each playable class now has its OWN dedicated strip (CAS-101) — no more thematic
// aliasing. archer/rogue strips stay in the folder as spare base art (not loaded).
const CLASS_HERO_ART={ warrior:"warrior", paladin:"paladin", mage:"mage", druid:"druid", priest:"priest" };
const CLASS_HERO_KEYS=["warrior","paladin","mage","druid","priest"];
// CAS-223: the warrior is now "Clarice" — a distinct, fully-animated character from the
// Art Director's Drive intake (CAS-221), baked into the class-cell strips by
// tools/cas223-clarice-strips.mjs. Unlike the other (recolorable hooded) classes she
// ships dedicated ATTACK + DEATH strips and is NOT driven by the part-mask bake.
// CAS-238: all 5 classes are now fixed, hand-authored-source character art (warrior=Clarice;
// mage/druid/priest/paladin = healer-pack & Clarice-derived strips, CEO-approved hybrid).
// Listed here = SKIP the CAS-167/169 procedural part-mask re-bake (which would overwrite the
// loaded source strips with the hooded base) AND load their dedicated attack/death strips.
const CLARICE_CLASSES=new Set(["warrior","paladin","mage","druid","priest"]);
// CAS-291 (corrects CAS-289): the board bug CAS-288 ("salen diferentes sprites al
// golpear") was that idle/walk and attack/death showed DIFFERENT characters for
// mage/paladin/druid/priest (mage idled blue but attacked purple; paladin idled
// female but attacked male). CAS-289 mistakenly forced attack→idle, KEEPING the
// static idle character and discarding the one with the real attack animation. The
// board's instruction (CAS-290) was the OPPOSITE: "deja el sprite que TIENE la
// animación de ataque, no el estático." CAS-291 re-bakes idle/walk for these 4
// classes from the SAME CAS-238/CAS-283 healer/clarice recipe that produced the
// attack/death strips (tools/cas291-class-idlewalk.mjs), so every state is now ONE
// consistent character — the one that owns the attack animation. Therefore all 5
// classes again use their dedicated attack/death strips (no procedural-lunge fallback).
const CLASS_EXTRA_ANIM=["warrior","paladin","mage","druid","priest"]; // classes with clsattack_/clsdeath_ strips
const CLASS_ATTACK_FC=6, CLASS_DEATH_FC=6, CLASS_DEATH_DUR=0.7; // Clarice extra-anim frame counts
// CAS-256: hit-react (hurt) + skill-cast (special) strips. Frame counts/durations MUST
// match the bake (tools/cas256-warrior-clarice-anims.mjs: hurt 6f, special 8f) and the
// sim timers (sim.js HURT_ANIM_DUR / SPECIAL_ANIM_DUR). Played ONCE across the duration,
// holding the last frame, like attack/death. Classes with no such strip fall back to idle.
const CLASS_HURT_FC=6, CLASS_HURT_DUR=0.28, CLASS_SPECIAL_FC=8, CLASS_SPECIAL_DUR=0.55;
// Only the classes that actually SHIP hurt/special strips are preloaded (warrior, from the
// extended Clarice pack). Listing only real files avoids needless 404s on boot; other
// classes simply fall back to the idle loop for those states. Add a class here when its
// {cls}_hurt.png / {cls}_special.png are baked.
const CLASS_HITREACT_ANIM=["warrior"];
// CAS-329: dodge-roll (sim animState "roll") dash strip. Only classes that ship a
// {cls}_dash.png are preloaded; others fall back to the idle-loop roll (unchanged).
// 8f, shared 140×166 cell — canonical Clarice dash-VFX (CAS-326).
const CLASS_DASH_ANIM=["warrior"]; const CLASS_DASH_FC=8;
// CAS-345a (CAS-357): 8-DIRECTION dash strip. Preferred over the single-dir clsdash_ strip
// when loaded.
// CAS-365: the first warrior_dash8.png was a PixelLab REGEN of a different hero (tall pointed
// wizard hat) — same morph defect the board rejected for the hooded classes (CAS-350) → dropped.
// CAS-431 (plan CAS-344, gate CAS-430): warrior RE-ENABLED with the HAND-AUTHORED dash8 grid
// (CAS-407, 8 rows × 8 frames @400×167, rows in dir8FromAngle order, built from the canonical
// CAS-326 Clarice dash cells — MASK-proof zero anatomy change, no morph). Same wide-cell
// geometry as the single-dir clsdash_ (3200×167), so ax=fw/2 / foot math is the proven path.
const CLASS_DASH8_ANIM=["warrior"]; const CLASS_DASH8_FC=8;
// CAS-333 (CAS-301a, board CAS-300/CAS-301): 8-DIRECTION idle/walk strips for the four
// hooded classes (warrior=Clarice keeps her single-facing+flip path, unchanged). Each
// strip stacks 8 rows (cell 140×166, same CLASS_* geometry); row index == facing bucket
// from dir8FromAngle (0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE, screen-space y-down). idle8 =
// 8 rows × 1 frame; walk8 = 8 rows × CLASS_WALK8_FC frames (fw=naturalWidth/fc, not hard-coded).
// All 8 facings are REAL art → the horizontal flip is dropped when an 8-dir strip is used.
// Missing file → fall back to the single-facing clshero_/clswalk_ path (zero regression).
// CAS-350 / CAS-359: the board REJECTED the CAS-301 8-dir delivery for the four HOODED classes
// (mage/paladin/priest/druid) because their idle8/walk8 sheets are PixelLab REGENERATIONS
// (~0.89–0.95 sim) of a DIFFERENT-looking hero, while attack/death still use the ORIGINAL
// {cls}.png sprites → the hero visibly MORPHS the moment it stands still or walks ("pusiste las
// 8 direcciones en otro sprite … no vuelvas a cambiarlos"). So the hooded classes are DROPPED
// from the 8-dir set: every state falls back to the approved single-facing clshero_/clswalk_
// sprites, and facing-toward-movement (CAS-347) is delivered via the L/R flip below
// (flip=Math.cos(facing)<0) — correct character, no morph, zero balance change.
// CAS-365 (CAS-358 QA FAIL): the warrior was thought EXEMPT (CAS-345/357) on the belief its
// idle8/walk8/dash8 were SAME-sprite bakes — but QA proved they are PixelLab REGENERATIONS of a
// DIFFERENT hero (tall pointed wizard hat, grey beard/cloak) while attack/hurt/death keep the
// canonical wide-straw-hat Clarice → the warrior MORPHS exactly like the rejected hooded set →
// dropped then too.
// CAS-431 (plan CAS-344, board-approved; gates CAS-408/428/430): warrior RE-ENABLED with the
// HAND-AUTHORED idle8/walk8 grids (CAS-400/CAS-405) — composited from the canonical Clarice
// pixels (hat byte-identical in all 8 facings, zero morph; 5 unique facings, SW/W/NW = hflip
// of SE/E/NE baked into the grid). Rows installed in dir8FromAngle order by
// tools/cas431-install-8dir.mjs. idle8 = 8 rows × 1 frame @140×166; walk8 = 8 rows × 8 frames.
// The four HOODED classes stay flip-only (CAS-300/350/359 rule): their only 8-dir sheets are
// the rejected regens, so they keep clshero_/clswalk_ + L/R flip (flip=Math.cos(facing)<0).
const CLASS_DIR8_ANIM=["warrior"];
const CLASS_IDLE8_FC=1, CLASS_WALK8_FC=8, CLASS_WALK8_FPS=8;
// CAS-469 (port de CAS-786): anchor-x POR FILA de los grids 8-dir del warrior. Las filas
// espejo del grid son hflip de la CELDA completa, asi que el cuerpo queda a x distinta
// segun la fila (~52 vs ~86 en celdas de 140, medido de los pixeles). Con CLASS_AX fijo
// (65) el cuerpo se dibujaba hasta +-27px de lado -> "la espada sale del lado contrario /
// capa volando" al girar o parar. Orden dir8FromAngle (0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE).
const DIR8_AX={
  // CAS-470: grids rediseñados desde el arte ORIGINAL de Clarice (idle/run laterales,
  // espada re-anclada a la mano DELANTERA). Filas laterales centradas al hornear.
  clsidle8_warrior:[70,70,84,69,69,69,81,70],
  clswalk8_warrior:[70,70,85,69,69,69,83,70],
  clsdash8_warrior:[162,163,162,236,236,233,158,166],
}; // 8f@8fps → cycle 1.0s (footfall 0.5s, in CAS-219/240 0.4–0.6s band)
// Snap a screen-space facing angle (atan2(dy,dx), y-down) to one of 8 row buckets.
function dir8FromAngle(ang){ return ((Math.round(ang/(Math.PI/4))%8)+8)%8; }
// input owns the UI hit-rects + touch state/layout; render writes rects, reads layout.
import { ui, stick, tbtns, topBtns, isTouch, sidebarBtns } from "../input.js";

export function createRenderer(ctx){
  const G = sim.G, world = sim.world;
  const rrng = createRNG();            // presentation-only RNG (isolated from sim)
  // CAS-265: colour-blind cues — true when the player has enabled the accessibility
  // option. Used to add SHAPE / TEXT signals so meaning never rides on hue alone:
  // a rarity glyph per tier, a "!" on crit damage, and a high-contrast windup ring.
  const cb = ()=> !!(G.settings && G.settings.colorblind);
  // Per-rarity shape mark (ascending tiers). Empty for common so plain drops stay clean.
  const RARITY_MARK = { common:"", uncommon:"◦ ", rare:"◆ ", epic:"★ ", legendary:"✦ " }; // CAS-1632 legendary glyph
  const rarityMark = (inst)=> (cb() && inst) ? (RARITY_MARK[inst.rarity] || "") : "";
  // Human-readable label for a KeyboardEvent.code (settings → Controls tab).
  const keyLabel = (code)=>{ if(!code) return "—";
    if(code==="Space") return "Espacio";
    if(code==="Escape") return "Esc";
    if(code.startsWith("Key")) return code.slice(3);
    if(code.startsWith("Digit")) return code.slice(5);
    if(code.startsWith("Numpad")) return "Num"+code.slice(6);
    if(code==="ArrowUp") return "↑"; if(code==="ArrowDown") return "↓";
    if(code==="ArrowLeft") return "←"; if(code==="ArrowRight") return "→";
    return code; };
  loadImg("tiled_ground", GROUND.atlas); loadImg("tiled_props", TDECO.atlas); // CAS-462
  loadImg("hero_erw", ERW_HERO_SRC);   // CAS-82: hooded pose (now the load-time fallback)
  for(const k in HERO_STRIPS) loadImg(HERO_STRIPS[k].img, `./assets/erw/hero/${HERO_STRIPS[k].img}.png`); // CAS-92 anim strips
  for(const k of CLASS_HERO_KEYS) loadImg("clshero_"+k, `./assets/erw/hero/classes/${k}.png`); // CAS-98 per-class clean cutouts
  for(const k of CLASS_HERO_KEYS) loadImg("clswalk_"+k, `./assets/erw/hero/classes/${k}_walk.png`); // CAS-110 per-class walk-cycle strips
  // CAS-223: Clarice (warrior) ships dedicated ATTACK + DEATH strips. Other classes have
  // no such file → the load 404s harmlessly and the state machine falls back to the idle
  // loop + procedural lunge, exactly as before.
  for(const k of CLASS_EXTRA_ANIM){ loadImg("clsattack_"+k, `./assets/erw/hero/classes/${k}_attack.png`); loadImg("clsdeath_"+k, `./assets/erw/hero/classes/${k}_death.png`); }
  // CAS-256: hurt + special strips, loaded only for classes that ship them (warrior).
  // Classes not listed fall back to the idle loop in drawHeroClass for those states.
  for(const k of CLASS_HITREACT_ANIM){ loadImg("clshurt_"+k, `./assets/erw/hero/classes/${k}_hurt.png`); loadImg("clsspecial_"+k, `./assets/erw/hero/classes/${k}_special.png`); }
  // CAS-329: dodge-roll dash strip (warrior). Classes without one keep the idle-loop roll.
  for(const k of CLASS_DASH_ANIM){ loadImg("clsdash_"+k, `./assets/erw/hero/classes/${k}_dash.png`); }
  // CAS-345a (CAS-357): 8-direction dash strip (warrior). Missing file 404s harmlessly and the
  // roll falls back to the single-dir clsdash_ strip, then the idle-loop roll (zero regression).
  for(const k of CLASS_DASH8_ANIM){ loadImg("clsdash8_"+k, `./assets/erw/hero/classes/${k}_dash8.png`); } // CAS-431: warrior = hand-authored CAS-407 grid (no morph); missing file falls back to clsdash_ (CAS-326)
  // CAS-333 (CAS-301a): 8-direction idle/walk strips for the hooded classes. A missing file
  // 404s harmlessly and drawHeroClass falls back to the single-facing clshero_/clswalk_ path.
  for(const k of CLASS_DIR8_ANIM){ loadImg("clsidle8_"+k, `./assets/erw/hero/classes/${k}_idle8.png`); loadImg("clswalk8_"+k, `./assets/erw/hero/classes/${k}_walk8.png`); }
  // CAS-169: start loading the recolorable part masks; the baked look replaces the
  // class strips below once ready. Until then the CAS-167 PNG strips render (no blank).
  ensureMasks();
  // Re-bake the hero's strips ONLY when the chosen look changes (class / palette /
  // variation). A cheap signature dirty-check keeps the bake off the hot path: it runs
  // on createHero, loadSave and every live customization edit, never per frame.
  let _lookSig="";
  function syncHeroLook(){
    const h=G.hero; if(!h||!h.palette||!h.variation) return;
    // CAS-223: Clarice (warrior) is fixed character art, NOT the recolorable hooded base.
    // Skipping the bake keeps her loaded idle/walk strips on screen (the bake would
    // otherwise overwrite clshero_/clswalk_warrior with the hooded part-mask figure
    // every time the look signature changes).
    if(CLARICE_CLASSES.has(h.cls)) return;
    const p=h.palette, v=h.variation;
    const sig=h.cls+"|"+p.hood+";"+p.cloak+";"+p.sash+";"+p.legs+"|"+v.headwear+","+v.cape;
    if(sig===_lookSig) return;
    const baked=bakeHero(h.cls, p, v);          // null until masks load → retry next frame
    if(!baked) return;
    IMG["clshero_"+h.cls]=baked.idle; IMG["clswalk_"+h.cls]=baked.walk;
    _lookSig=sig;
  }
  // offscreen buffer for the hero hurt-flash tint (only touched when flashing)
  const _heroBuf=(typeof document!=="undefined")?document.createElement("canvas"):null;
  const _heroBx=_heroBuf?_heroBuf.getContext("2d"):null;
  let VW = view.VW, VH = view.VH;      // synced from the viewport each frame
  const rr = (a,b)=>rrng.rr(a,b);

  // CAS-1716: custom uploaded sprites (map editor). world.customAssets is an
  // id→{dataUrl,...} table embedded SYNC in the MapDoc (no IndexedDB in the game).
  // Build the Image cache lazily on first reference; a missing asset or a not-yet-
  // decoded image is cached and skipped silently every frame (no crash, no console
  // error). Absent world.customAssets ⇒ this never runs (byte-safe default world).
  const CUSTOM_IMG = {};
  function customImg(id){
    if(!id) return null;
    if(id in CUSTOM_IMG) return CUSTOM_IMG[id];
    const ca = world.customAssets && world.customAssets[id];
    if(!ca || !ca.dataUrl){ CUSTOM_IMG[id]=null; return null; }
    const im = new Image(); im.src = ca.dataUrl; CUSTOM_IMG[id]=im; return im;
  }
  // QA hook (via game.js __dev): true once the custom Image has decoded and is drawable.
  function customImgReady(id){ const im=customImg(id); return !!(im && im.complete && im.naturalWidth); }

  // CAS-121/224: T_ICE (index 6) — frozen Cripta Helada floor. Primary path draws the
  // hi-fi FOUNTAINS dark flagstone with a cold wash (see renderWorld); these fallback
  // tones are now DARK frozen-stone (not bright pale-blue) so the zone reads cold even
  // before the image loads / in unit tooling.
  // index 7 = T_SWAMP (CAS-441) — teal marsh fallback tones until the CAS-439 tiles load.
  const tileBase=[COL.grass,COL.dirt,COL.stone,COL.cobble,COL.sand,COL.water,"#2c3a48","#3a463e","#2a1712",COL.cobble];   // idx 8 = T_CALDERA molten basalt (CAS-1744); idx 9 = T_STREET pre-load base (CAS-2191)
  const tileLight=[COL.grassL,COL.dirtL,COL.stoneL,COL.cobbleL,COL.sandL,COL.waterL,"#4a6072","#4e5f52","#c4562a",COL.cobbleL]; // ember light; idx9 street
  const tileDark=[COL.grassD,COL.dirtD,COL.stoneD,COL.cobbleD,COL.sandD,COL.water,"#1a2632","#2a342e","#160a07",COL.cobbleD];  // charred dark; idx9 street

  function render(alpha){
    VW=view.VW; VH=view.VH;
    const Z=zoom();
    let camX=G.cam.x, camY=G.cam.y;
    if(G.shake>0){ camX+=rr(-G.shake,G.shake)/Z; camY+=rr(-G.shake,G.shake)/Z; }
    ctx.fillStyle=COL.bg; ctx.fillRect(0,0,VW,VH);
    syncHeroLook();   // CAS-169: re-bake the hero strips if the look changed (off hot path)
    if(G.scene==="menu"){ renderMenu(); return; }
    if(G.scene==="classsel"){ renderClassSel(); return; }
    if(G.scene==="customize"){ renderCustomize(); return; }
    if(G.scene==="abilitysel"){ renderAbilitySelect(); return; } // CAS-1570 run-start ability draft
    ctx.save(); ctx.scale(Z,Z); ctx.translate(-camX,-camY);
    renderWorld(camX,camY,Z);
    renderEntities();
    ctx.restore();
    // CAS-2230: ciclo día/noche + farolas (render-only, DARK). Con DAYNIGHT.enabled:false este bloque nunca
    // corre ⇒ salida byte-idéntica. ON: tinte ambiental a pantalla completa (oscurece la escena) y luego un
    // segundo pase transformado dibuja el halo de las farolas ENCIMA de esa oscuridad (perfora la noche).
    // CAS-2230 día/noche + CAS-2231 clima (render-only, DARK). Orden: tinte ambiental día/noche → velo de
    // clima (lluvia/niebla) ENCIMA de esa oscuridad (noche+lluvia = más oscuro) → halo de farolas AL FINAL,
    // así perfora tanto la noche como la niebla/lluvia (sigue visible). Con ambos flags OFF nada corre ⇒
    // salida byte-idéntica; `_dn` sólo se calcula si DAYNIGHT.enabled (equivalente al bloque anterior).
    let _dn=null;
    if(DAYNIGHT.enabled){ _dn=dayNightState(worldPhase()); renderAmbientTint(_dn); }
    if(WEATHER.enabled){ renderWeather(weatherState(worldWeatherPhase())); }
    if(_dn && _dn.glow>0.02 && DAYNIGHT.lampGlow){ ctx.save(); ctx.scale(Z,Z); ctx.translate(-camX,-camY);
      renderLampGlow(_dn.glow, camX, camY, Z); ctx.restore(); }
    renderHUD();
    // CAS-2234: banner de zona/región al entrar (render+code, DARK). Con ZONE_BANNER.enabled:false ni el
    // update (edge-detection de zona) ni el render se llaman ⇒ salida byte-idéntica. ON: detecta el cruce a
    // una región con nombre (deriva pura de los POIs de world.deco = minimapa CAS-2226) y dibuja un título de
    // texto top-third que hace fade-in/hold/fade-out. Screen-space, encima del HUD, no tapa el centro de acción.
    if(ZONE_BANNER.enabled){ updateZoneBanner(); renderZoneBanner(); }
    // CAS-2242: afordancia SUTIL de Zona Segura (render-only, $0 arte, DARK). Con SAFEZONE.enabled:false nunca corre
    // ⇒ salida byte-idéntica. ON: un pip discreto de escudo + "Zona segura" mientras el héroe está dentro del bbox de
    // la Ciudad (misma derivación de POIs que el minimapa; la AUTORIDAD del regen vive en sim). Cosmético, 0 sim/save.
    if(SAFEZONE.enabled) renderSafeZoneBadge();
    // CAS-2255: indicador "Descanso" (Rested XP, render-only, $0 arte, DARK). Con RESTED_XP.enabled:false NUNCA corre ⇒
    // salida byte-idéntica (0 refs render fuera de este gate). ON + pool>0: una barra discreta + "Descanso" que muestra el
    // bono de XP disponible. La AUTORIDAD del pool vive en sim (h.restedPool); esto sólo LO LEE. Cosmético, 0 sim/save/RNG.
    if(RESTED_XP.enabled) renderRestedBadge();
    // CAS-2266: indicador "Vínculo/Recall" (Piedra de Vínculo, render-only, $0 arte, DARK). Con RECALL.enabled:false NUNCA
    // corre ⇒ salida byte-idéntica (0 refs render fuera de este gate). ON + vinculado: runa de vínculo + estado del recall
    // (LISTO / cooldown mm:ss). Refleja la autoridad de sim (h.bindPoint / h.recallCD), cosmético puro (no lee/escribe RNG).
    if(RECALL.enabled) renderRecallBadge();
    // CAS-2269: indicador "Tablón/Recompensa" (Bounty Board, render-only, $0 arte, DARK). Con BOUNTY_BOARD.enabled:false NUNCA
    // corre ⇒ salida byte-idéntica (0 refs render fuera de este gate). ON: con contrato activo = pergamino + nombre + progreso
    // n/N + barra (rastreable mientras cazas); en el Santuario sin contrato = pista del destacado. Refleja la autoridad de sim
    // (h.bounty + progreso derivado de h.kills/killsByType); cosmético puro (no lee/escribe RNG ni save).
    if(BOUNTY_BOARD.enabled) renderBountyBadge();
    // CAS-2278: indicador "Intendente" (Sanctuary Quartermaster, render-only, $0 arte, DARK). Con SANCTUARY_REWARDS.enabled:false
    // NUNCA corre ⇒ salida byte-idéntica (0 refs render fuera de este gate). ON + en el Santuario: cuenta de recompensas de
    // renombre reclamables (ámbar pulsante si hay ≥1) + título de renombre actual. Refleja la autoridad de sim
    // (h.sanctuaryRewards + rango de rep); cosmético puro (no lee/escribe RNG ni save).
    if(SANCTUARY_REWARDS.enabled) renderQuartermasterBadge();
    // CAS-2284: indicador "Toque de Guerra" (World Event / Sanctuary Warhorn, render-only, $0 arte, DARK). Con WORLD_EVENT.enabled:false
    // NUNCA corre ⇒ salida byte-idéntica (0 refs render fuera de este gate). ON: cuerno + estado del EVENTO MUNDIAL compartido —
    // OCIOSO = cuenta atrás "próx mm:ss" al siguiente Toque; ACTIVO = "¡ACTIVO! mm:ss" pulsante + fase (Fervor en el pico). Refleja
    // el horario derivado del reloj compartido (G.warhorn, autoridad en sim); cosmético puro (no lee/escribe RNG ni save).
    if(WORLD_EVENT.enabled) renderWarhornBadge();
    // CAS-2292: indicador "Emisario del Santuario" (Sanctuary Emissary, render-only, $0 arte, DARK). Con SANCTUARY_EMISSARY.enabled:false
    // NUNCA corre ⇒ salida byte-idéntica (0 refs render fuera de este gate). ON: sello de emisario + la world-quest ROTATIVA del turno —
    // con emisario aceptado = nombre + progreso n/N (verde "listo"); en el Santuario sin aceptar = pista del emisario activo (invita a
    // aceptar). Progreso DERIVADO de los mismos contadores monótonos que sim (h.killsByType); cosmético puro (no lee/escribe RNG ni save).
    if(SANCTUARY_EMISSARY.enabled) renderEmissaryBadge();
    // CAS-2329: indicador "Pulso del Mundo" (World Pulse, render-only, $0 arte, DARK). Con WORLD_PULSE.enabled:false NUNCA corre ⇒ salida byte-idéntica
    // (0 refs render fuera de este gate). ON: rombo ◈ procedural + "Pulso del Mundo: <zona>" — el estado AMBIENTAL COMPARTIDO derivado del reloj de
    // pared (sim.worldPulse, autoridad en sim) ⇒ MISMA zona-en-Pulso para todos los clientes en el shard. Resalta si el héroe está EN la zona (recibe
    // el passive). Cuenta atrás al próximo pulso cuando decae. Cosmético puro (no lee/escribe RNG ni save).
    if(WORLD_PULSE.enabled) renderWorldPulseBadge();
    // CAS-2332: indicador "Congregación" (Gathering Density, render-only, $0 arte, DARK). Con CONGREGATION.enabled:false NUNCA corre ⇒ salida byte-idéntica
    // (0 refs render fuera de este gate). ON: glifo ⛭ procedural (anillo + puntos = tier) + "Congregación: <zona> T<n> ×N" — el headcount LIVE server-
    // authoritative de la zona del héroe (sim.congregationVM, autoridad en sim) ⇒ MISMO tier/cuenta/buff para todos los clientes en la zona. Cosmético puro.
    if(CONGREGATION.enabled) renderCongregationBadge();
    // CAS-2335: indicador "Sendero Trillado" (Well-Trodden Path, render-only, $0 arte, DARK). Con WAYFARER_TRAIL.enabled:false NUNCA corre ⇒ salida byte-idéntica
    // (0 refs render fuera de este gate). ON: glifo ⌇ procedural (traza sinuosa) + "Sendero Trillado" — la celda coarse server-authoritative que el héroe transita
    // y su tread decaído (sim.wayfarerVM, autoridad en sim) ⇒ MISMO sendero/pasivo para todos los clientes con el mismo snapshot. Resalta si es un Sendero Trillado. Cosmético puro.
    if(WAYFARER_TRAIL.enabled) renderWayfarerBadge();
    // CAS-2338: indicador "Confluencia" (Diverse Company, render-only, $0 arte, DARK). Con DIVERSE_COMPANY.enabled:false NUNCA corre ⇒ salida byte-idéntica
    // (0 refs render fuera de este gate). ON: glifo ❈ procedural (corrientes que confluyen = clases distintas) + "Confluencia: <zona> T<n> ×N" — la diversidad
    // LIVE server-authoritative (nº de clases distintas) de la zona del héroe (sim.confluenceVM, autoridad en sim) ⇒ MISMO tier/diversidad/buff para todos los clientes en la zona. Cosmético puro.
    if(DIVERSE_COMPANY.enabled) renderConfluenceBadge();
    // CAS-2341: indicador "Vigilia" (Long Watch, render-only, $0 arte, DARK). Con LONG_WATCH.enabled:false NUNCA corre ⇒ salida byte-idéntica (0 refs render fuera de
    // este gate). ON: glifo ⌖ procedural (retícula de vigía) + "Vigilia: <zona> T<n>" — el streak (segundos-continuos) server-authoritative de la zona del héroe
    // (sim.longWatchVM, autoridad en sim) ⇒ MISMO tier/streak/buff para todos los clientes en la zona. Cosmético puro.
    if(LONG_WATCH.enabled) renderLongWatchBadge();
    // CAS-2347: badge "Expedición" — la cobertura server-authoritative de la zona (nº de sub-celdas coarse distintas ocupadas) + tier/passive derivados
    // (sim.frontierVM, autoridad en sim) ⇒ MISMA cobertura/tier/buff para todos los clientes con el mismo snapshot. Resalta si la zona está en Expedición. Cosmético puro.
    if(FRONTIER_SPREAD.enabled) renderFrontierBadge();
    // CAS-2352: badge "Afluencia" — el surge server-authoritative de la zona (llegadas acumuladas EDGE-triggered) + tier/passive derivados
    // (sim.influxVM, autoridad en sim) ⇒ MISMO surge/tier/buff para todos los clientes con el mismo snapshot. Resalta si la zona está en Afluencia. Cosmético puro.
    if(INFLUX_SURGE.enabled) renderInfluxBadge();
    // CAS-2355: badge "Sincronía" — el nº de jugadores DISTINTOS server-authoritative de la zona con gesta/kill en la ventana deslizante + tier/passive derivados
    // (sim.syncVM, autoridad en sim) ⇒ MISMA sincronía/tier/buff para todos los clientes con el mismo snapshot. Resalta si la zona está en Sincronía. Cosmético puro.
    if(BATTLE_SYNC.enabled) renderSyncBadge();
    // CAS-2356: badge "Marcha" — el `march` sostenido server-authoritative de la zona (coherencia direccional de los vectores de velocidad de los presentes en movimiento) + tier/passive
    // derivados (sim.convoyVM, autoridad en sim) ⇒ MISMO march/tier/buff para todos los clientes con el mismo snapshot. Resalta si la zona está en Marcha. Cosmético puro.
    if(CONVOY_MARCH.enabled) renderConvoyBadge();
    if(WARDING_RING.enabled) renderWardBadge(); // CAS-2362: Cordón de Guardia — badge de recuperación (canal wardRegen); resalta si la zona tiene un Cordón (cobertura angular sostenida). Cosmético puro.
    if(KINSHIP_BOND.enabled) renderKinshipBadge(); // CAS-2361: Camaradería — badge de vínculo (canal goldFind); resalta si la zona tiene un vínculo forjado (pares próximos sostenidos). Cosmético puro.
    if(WAYFARER_ROAM.enabled) renderWayRoamBadge(); // CAS-2369: Trotamundos — badge de rumbo (canal oocMitigation); resalta si el jugador tiene un roam abierto (amplitud de celdas distintas en la ventana). Cosmético puro.
    if(FOCUS_FIRE.enabled) renderFocusBadge(); // CAS-2370: Fuego Concentrado — badge de concentración (canal goldFind); resalta si la zona tiene un fuego concentrado (atacantes distintos sobre un mismo objetivo, sostenido). Cosmético puro.
    if(TRAILCRAFT.enabled) renderTrailcraftBadge(); // CAS-2377: Sendero — badge de variedad (canal lootQuality); resalta si el jugador tiene un sendero abierto (nº de tipos de bioma distintos pisados en la ventana). Cosmético puro.
    if(DELVE.enabled) renderDelveBadge(); // CAS-2380: Descenso — badge de profundidad (canal critChance); resalta si el jugador tiene un descenso abierto (nº de bandas de profundidad distintas alcanzadas). Cosmético puro.
    if(ERUDITION.enabled) renderEruditionBadge(); // CAS-2381: Erudición — badge de variedad de presas (canal xpGain); resalta si el jugador tiene erudición abierta (nº de tipos de enemigo distintos abatidos en la ventana). Cosmético puro.
    if(NOCTURNE_HUNT.enabled) renderNocturneBadge(); // CAS-2393/2394: Nocturne — badge de caza nocturna (canal `vamp`/lifesteal); resalta si el jugador tiene una caza nocturna abierta (nº de kills hechos de noche en la ventana). Cosmético puro.
    if(CADENCE_RUSH.enabled) renderCadenceBadge(); // CAS-2400: Cadencia / Ímpetu — badge de tempo de matanza (canal critChance, share-cap con Delve); resalta si el jugador tiene un ímpetu abierto (combo-meter de kills en sucesión rápida). Cosmético puro.
    if(TEMPEST_SURGE.enabled) renderTempestBadge(); // CAS-2404: Vendaval / Tempestad — badge de condición meteorológica (canal lootQuality, share-cap con Trailcraft); resalta si el jugador está en zona expuesta CON tormenta activa (intensidad shard-wide del reloj compartido). Cosmético puro.
    if(LAST_STAND.enabled) renderLastStandBadge(); // CAS-2409: Última Resistencia / Aguante — badge de ratio de fuerza (canal wardRegen, share-cap con Warding Ring); resalta si el héroe está SUPERADO EN NÚMERO (≥umbral de enemigos enganchados dentro de engageRadius). Cosmético puro.
    if(FIRM_FOOTING.enabled) renderFirmFootingBadge(); // CAS-2415: Terreno Firme / Pisada Firme — badge del MATERIAL de terreno bajo el héroe (canal atkspd, share-cap global ATKSPD_TOTAL_CAP); resalta si el héroe pisa terreno FIRME (piedra/adoquín/hierba). Cosmético puro.
    if(SHADOW_STALK.enabled) renderShadowStalkBadge(); // CAS-2426: Acecho / Sigilo — badge de OCULTAMIENTO / línea-de-visión (canal detectRadius, sub-cap stealthStalkCap); resalta si el héroe está OCULTO tras cobertura que rompe la LOS del cazador más cercano. Cosmético puro.
    if(SCARCITY_EDGE.enabled) renderScarcityBadge(); // CAS-2432: Presión por Escasez — badge de AGOTAMIENTO de la zona (canal essenceFind, sub-cap scarcityEssCap); resalta si el héroe está en una zona EXPRIMIDA (≥50% de la capacidad de spawn vacía) donde el forrajeo rinde esencia extra. Cosmético puro.
    if(APEX_PROXIMITY.enabled) renderApexBadge(); // CAS-2439: Proximidad a Amenaza Apex — badge de PROXIMIDAD a un depredador apex vivo (canal matFind, sub-cap apexMatCap); resalta si el héroe tiene un jefe/campeón vivo dentro del radio de amenaza, donde el forrajeo rinde mena extra. Cosmético puro.
    if(MOB_AFFIX_DANGER.enabled) renderAffixDangerBadge(); // CAS-2445: Peligro por Afijo de Mob — badge de PELIGRO por afijos de mobs en radio (canal flaskPotency, sub-cap dangerFlaskCap); resalta si el héroe tiene mobs afijados (encantados/modificados) cerca, donde el forrajeo rinde cargas de Estus extra. Cosmético puro.
    if(ZONE_EVENT_SURGE.enabled) renderZoneEventBadge(); // CAS-2450: Participación en Evento de Zona — badge de PARTICIPACIÓN en eventos de zona activos (POIs) en radio (canal gemFind, sub-cap eventGemCap); resalta si el héroe está dentro de un world-event activo, donde el forrajeo rinde esquirlas de gema. Cosmético puro.
    if(ENCOUNTER_VARIANT_SURGE.enabled) renderVariantSurgeBadge(); // CAS-2456: Variante de Encuentro Activa — badge de PRESENCIA de una variante de comportamiento de encuentro (mobs con e.variant) en radio (canal socketFind, sub-cap variantSocketCap); resalta si el héroe combate dentro de un encuentro de variante, donde el forrajeo rinde reagentes de engarce. Cosmético puro.
    if(ARENA_HAZARD_SURGE.enabled) renderHazardSurgeBadge(); // CAS-2464: Hazard de Arena Activo — badge de PRESENCIA/TIPO de un hazard ambiental activo (G.hazards en fase active) en radio (canal healPotency, sub-cap hazardMoteCap); resalta si el héroe combate dentro de un peligro de arena activo, donde el forrajeo rinde brasas restaurativas. Cosmético puro.
    if(BOSS_ENRAGE_SURGE.enabled) renderEnrageSurgeBadge(); // CAS-2468: Fase de Enfurecimiento de Jefe — badge de PRESENCIA/INTENSIDAD de un jefe/campeón ENFURECIDO (e.enraged) en radio (canal trophyFind, sub-cap enrageTrophyCap); resalta si el héroe combate mientras un jefe cruzó su umbral de furia, donde el forrajeo rinde trofeos de guerra. Cosmético puro.
    if(SPOILS_FIELD_SURGE.enabled) renderSpoilsFieldBadge(); // CAS-2477: Campo de Botín Denso — badge de PRESENCIA/DENSIDAD de un campo de botín en el suelo (drops NO recogidos de G.drops) en radio (canal salvageFind, sub-cap spoilsSalvageCap); resalta si el héroe remata sobre un suelo enterrado en despojos, donde el forrajeo rinde esquirlas de chatarra. Cosmético puro.
    if(CROSSFIRE_FRAY_SURGE.enabled) renderCrossfireFrayBadge(); // CAS-2488: Fragor de Fuego Cruzado — badge de PRESENCIA/DENSIDAD de un campo de proyectiles EN VUELO (G.projectiles, propios y enemigos) en radio (canal frayFind, sub-cap frayEmberCap); resalta si el héroe remata en medio de un fuego cruzado denso, donde el forrajeo rinde ascuas de fragor. Cosmético puro.
    if(CARNAGE_FIELD_SURGE.enabled) renderCarnageFieldBadge(); // CAS-2481: Campo de Carnicería — badge de PRESENCIA/DENSIDAD de un campo de cadáveres recién caídos (cuerpos de G.corpses) en radio (canal boneFind, sub-cap carnageBoneCap); resalta si el héroe remata sobre un suelo sembrado de bajas, donde el forrajeo rinde fichas de osario. Cosmético puro.
    if(MAELSTROM_FIELD_SURGE.enabled) renderMaelstromFieldBadge(); // CAS-2493: Vorágine de Zonas de Área — badge de PRESENCIA/DENSIDAD de un campo de zonas de negación de área persistentes (campos de hechizo de G.fields) en radio (canal maelstromFind, sub-cap maelstromChargeCap); resalta si el héroe remata en medio de una vorágine densa de zonas solapadas, donde el forrajeo rinde cargas de vorágine. Cosmético puro.
    if(SKIRMISH_LINE_SURGE.enabled) renderSkirmishLineBadge(); // CAS-2504: Línea de Escaramuza — badge de COMPOSICIÓN DE ARQUETIPO DE ALCANCE (a-distancia) del pack de mobs VIVOS (e.tpl.ranged/e.tpl.range) en radio (canal skirmishFind, sub-cap skirmishMarkCap); resalta si el héroe remata en medio de una línea de hostigamiento a-distancia densa, donde el forrajeo rinde marcas de escaramuza. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(RECOVER_SURGE.enabled) renderRecoverBadge(); // CAS-2594: Remate de Recobro — badge de VENTANA DE RECUPERACIÓN POST-ATAQUE / RECOVER BASE del mob TYPE server-auth (la LENTITUD DE RECOBRO intrínseca: cuánto TARDA la criatura de fábrica en recomponerse DESPUÉS de golpear); la señal viva = MAX recoverWeight sobre los mobs VIVOS en radio (el recobro más largo rematable: plúmbeo⇒2/rezagado⇒1/ágil⇒0) (canal recoverFind, sub-cap recoverBountyCap); resalta si hay un LENTO-DE-RECOBRO rematable, donde castigar su cola de exposición rinde fichas de recobro. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(LUNGE_SURGE.enabled) renderLungeBadge(); // CAS-2600: Remate de Acometida — badge de DISTANCIA DE ESTOCADA/POUNCE BASE del mob TYPE server-auth (cuánto se ABALANZA la criatura de fábrica para cerrar distancia en su lunge de rusher); la señal viva = MAX lungeWeight sobre los mobs VIVOS en radio (el saltador más largo rematable: pouncer⇒2/estocada media⇒1/salto corto⇒0) (canal lungeFind, sub-cap lungeBountyCap); resalta si hay un SALTADOR-LARGO rematable, donde castigar su salto de acercamiento rinde fichas de acometida. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(GOLD_SURGE.enabled) renderGoldBadge(); // CAS-2615: Remate de Bolsa — badge de MAGNITUD DE ORO/BOTÍN DE MONEDA BASE del mob TYPE server-auth (cuánta BOLSA carga de fábrica la criatura: la cantidad base de oro gold[1] que suelta al morir); la señal viva = MAX goldWeight sobre los mobs VIVOS en radio (el mob de bolsa más gorda rematable: opulent⇒2/bolsa media⇒1/bolsa-flaca⇒0) (canal coinFind, sub-cap coinBountyCap; ⊥ goldFind #60 que es el multiplicador de oro-RECOGIDO); resalta si hay un mob de BOLSA GORDA rematable, donde cazar su alta magnitud de moneda rinde fichas de moneda. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(BANE_SURGE.enabled) renderBaneBadge(); // CAS-2627: Remate de Ponzoña — badge de DURACIÓN DE LA AFLICCIÓN QUE INFLIGE EL ATAQUE del mob TYPE server-auth (cuánto DURA la secuela — veneno/quemadura/ralentización — que su TIPO deja pegada al golpear: ETPL[type].infl.dur); la señal viva = MAX baneWeight sobre los mobs VIVOS en radio (el afligidor de secuela más larga rematable: virulent⇒2/media⇒1/sin-aflicción⇒0) (canal baneFind, sub-cap baneBountyCap; ⊥ splashFind #104/coinFind #103/gearFind #102/goldFind #60); resalta si hay un AFLIGIDOR de secuela duradera rematable, donde cazar su ponzoña rinde fichas de ponzoña. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(DISPERSE_SURGE.enabled) renderDisperseBadge(); // CAS-2640: Remate de Hueste Dispersa — badge de DISPERSIÓN ESPACIAL/SPREAD GEOMÉTRICO de la formación de mobs VIVOS que rodea al héroe (distancia MEDIA de los mobs al CENTROIDE de la manada en radio: dispersa/desparramada⇒2/suelta⇒1/apiñada⇒0) (canal disperseFind, sub-cap disperseBountyCap; ⊥ motleyFind #106-tipo/packFind #87-cohesión/skirmishFind #84-ranged); resalta si el héroe está en medio de una hueste DESPLEGADA por el campo, donde rematar rinde fichas de dispersión. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(FLANK_SURGE.enabled) renderFlankBadge(); // CAS-2645: Remate de Falange — badge de CONCENTRACIÓN ANGULAR de la formación de mobs VIVOS alrededor del héroe (longitud del vector resultante medio R∈[0,1] de los rumbos hero→mob: falange/muralla amasada en un flanco⇒2/inclinada⇒1/repartida-cercando⇒0) (canal flankFind, sub-cap flankBountyCap; ⊥ disperseFind #107-spread-radial/wardRegen #59-cobertura-jugadores/headingFind #90-rumbo-movimiento/packFind #87-conteo); resalta si el héroe encara una MURALLA amasada en un solo costado, donde rematar rinde fichas de falange. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ORIENT_SURGE.enabled) renderOrientBadge(); // CAS-2655: Remate de Desbandada — badge de DISPERSIÓN DE ORIENTACIONES/RUMBOS DE MOVIMIENTO de la formación de mobs VIVOS alrededor del héroe (S=1−R de los rumbos de movimiento: desbandada/rout⇒2/suelta⇒1/unísono-marcha⇒0) (canal orientFind, sub-cap orientBountyCap; ⊥ columnFind #109-forma-de-posiciones/headingFind #90-rumbo-de-una-víctima-relativo-al-héroe/flankFind #108-ángulo-de-posición); resalta si el héroe está en medio de una hueste EN DESBANDADA, donde rematar rinde fichas de desbandada. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(CONVERGE_SURGE.enabled) renderConvergeBadge(); // CAS-2665: Remate de Embestida Convergente — badge de CONVERGENCIA RADIAL de la formación de mobs VIVOS sobre el héroe (índice C=(Σvᵢcosθᵢ)/(Σvᵢ) = media ponderada de la proyección radial hacia el héroe: embestida/closing⇒2/algo-cerrando⇒1/millando-tangencial-retrocediendo⇒0) (canal convergeFind, sub-cap convergeBountyCap; ⊥ speedFind #111-dispersión-de-MAGNITUD/orientFind #110-dispersión-de-DIRECCIÓN-absoluta/headingFind #90-rumbo-MAX-de-1-víctima/flankFind #108-ángulo-de-posición); resalta si el héroe está en medio de una hueste que CIERRA COORDINADA sobre él, donde rematar rinde fichas de embestida. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ENCIRCLE_SURGE.enabled) renderEncircleBadge(); // CAS-2669: Remate de Cerco — badge de COBERTURA ANGULAR / MAYOR-HUECO de la formación de mobs VIVOS alrededor del héroe (K=1−mayorHueco/2π de los rumbos hero→mob: cerco/anillo⇒2/semi-cercado⇒1/amontonados-en-un-costado⇒0) (canal encircleFind, sub-cap encircleBountyCap; ⊥ flankFind #108-CONCENTRACIÓN-R-sobre-los-MISMOS-rumbos/convergeFind #112-velocidad-radial/orientFind #110-dispersión-de-dirección/columnFind #109-forma-de-posiciones); resalta si el héroe está RODEADO POR TODOS LOS FLANCOS (sin arco de escape), donde rematar rinde fichas de cerco. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(SIZECLASS_SURGE.enabled) renderSizeClassBadge(); // CAS-2680: Remate de Talla Dispar — badge de DISPERSIÓN DE TALLA-CLASE de la formación de mobs VIVOS alrededor del héroe (CV=stddev/media de ETPL[e.type].size: dispar/menudos+colosales⇒2/mezclada⇒1/mono-talla⇒0) (canal sizeClassFind, sub-cap sizeClassBountyCap; ⊥ bulkFind #88-talla-de-UNA-víctima/motleyFind #106-cardinalidad-de-e.type/depthFind #114-CV-de-DISTANCIAS/disperseFind #107-spread-radial); resalta si el héroe está en medio de una manada de TALLAS DISPARES (menudos + colosales), donde rematar rinde fichas de talla. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ORBIT_SURGE.enabled) renderOrbitBadge(); // CAS-2684: Remate de Carrusel — badge de CIRCULACIÓN ORBITAL / CIRCULACIÓN NETA TANGENCIAL de la formación de mobs VIVOS alrededor del héroe (C=|Σ vᵢ·(mᵢ·t̂ᵢ)|/Σvᵢ: carrusel/anillo-de-estrafeo⇒2/swirl-remolino⇒1/radial-embiste-huye-mixto⇒0) (canal orbitFind, sub-cap orbitBountyCap; ⊥ convergeFind #112-velocidad-RADIAL-signada/orientFind #110-rumbo-WORLD/speedFind #111-CV-de-magnitud/headingFind #90-rumbo-de-1-víctima); resalta si el héroe está en medio de una manada que ORBITA COORDINADA (carrusel/estrafeo), donde rematar rinde fichas de carrusel. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ACCEL_SURGE.enabled) renderAccelBadge(); // CAS-2688: Remate de Revuelo — badge de CHURN CINÉTICO / 2º-orden del movimiento de la formación de mobs VIVOS alrededor del héroe (C=media_i|Δmᵢ|/refDelta: revuelo/finta⇒2/jitter-tembleque⇒1/velocidad-constante⇒0) (canal accelFind, sub-cap accelBountyCap; ⊥ orbitFind #116-tangencial-INSTANTÁNEA/convergeFind #112-radial-INSTANTÁNEA/orientFind #110-rumbo-WORLD/speedFind #111-CV-magnitud — ACCEL es la DERIVADA temporal); resalta si el héroe está en medio de una manada que FINTA/reposiciona rápido (revuelo), donde rematar rinde fichas de revuelo. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(DEPTH_SURGE.enabled) renderDepthBadge(); // CAS-2675: Remate de Fondo — badge de PROFUNDIDAD RADIAL / CV DE DISTANCIAS-AL-HÉROE de la formación de mobs VIVOS alrededor del héroe (CV=stddev/media de las distancias hero→mob: profunda/columna-cerca+lejos⇒2/escalonada⇒1/anillo-delgado-uniforme⇒0) (canal depthFind, sub-cap depthBountyCap; ⊥ disperseFind #107-spread-radial-px-ABSOLUTO/encircleFind #113-cobertura-ANGULAR/columnFind #109-forma-de-posiciones/convergeFind #112-velocidad-radial); resalta si el héroe está en medio de una manada ESCALONADA EN PROFUNDIDAD (rangos de cerca a lejos), donde rematar rinde fichas de fondo. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(SPEED_SURGE.enabled) renderSpeedBadge(); // CAS-2660: Remate de Tropel Desigual — badge de DISPERSIÓN DE VELOCIDADES DE MOVIMIENTO de la formación de mobs VIVOS alrededor del héroe (CV=stddev/media de las velocidades de paso: tropel/ragged⇒2/algo-desigual⇒1/paso-parejo⇒0) (canal speedFind, sub-cap speedBountyCap; ⊥ orientFind #110-dispersión-de-DIRECCIÓN/swiftFind #94-velocidad-base-de-1-víctima-MAX/columnFind #109-forma-de-posiciones); resalta si el héroe está en medio de un TROPEL de ritmos DESIGUALES (rezagados + chargers), donde rematar rinde fichas de tropel. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(COLUMN_SURGE.enabled) renderColumnBadge(); // CAS-2650: Remate de Columna — badge de ELONGACIÓN/ANISOTROPÍA DE LA FORMA de la formación de mobs VIVOS alrededor del héroe (E=1−λmin/λmax de la covarianza de posiciones alrededor de SU centroide: columna/hilera casi colineal⇒2/alargada-oblonga⇒1/redonda-isótropa⇒0) (canal columnFind, sub-cap columnBountyCap; ⊥ flankFind #108-ángulo-desde-héroe/disperseFind #107-spread-radial-ESCALA/packFind #87-conteo); resalta si el héroe está en medio de una COLUMNA estirada, donde rematar rinde fichas de columna. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(MOTLEY_SURGE.enabled) renderMotleyBadge(); // CAS-2634: Remate de Ralea Abigarrada — badge de DIVERSIDAD/HETEROGENEIDAD DE ESPECIES de la manada VIVA que rodea al héroe (nº de TIPOS de mob DISTINTOS — e.type ESTÁTICO — entre los mobs VIVOS en radio: ralea-abigarrada⇒2/mixta⇒1/monótona⇒0) (canal motleyFind, sub-cap motleyBountyCap; ⊥ baneFind #105/packFind #87-conteo/skirmishFind #84-ranged); resalta si el héroe está en medio de una hueste de ≥2 especies distintas, donde rematar rinde fichas de ralea. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(SPLASH_SURGE.enabled) renderSplashBadge(); // CAS-2620: Remate de Estallido — badge de RADIO DE ATAQUE DE ÁREA/SALPICADURA BASE del mob TYPE server-auth (cuán ANCHO es el golpe de área/ground-slam que carga su TIPO: ETPL[type].aoe); la señal viva = MAX splashWeight sobre los mobs VIVOS en radio (el brutón de estallido más ancho rematable: wide⇒2/medio⇒1/sin-área⇒0) (canal splashFind, sub-cap blastBountyCap; ⊥ coinFind #103/gearFind #102/goldFind #60); resalta si hay un brutón de ÁREA ANCHA rematable, donde cazar su estallido rinde fichas de estallido. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(GEARCHANCE_SURGE.enabled) renderGearBadge(); // CAS-2611: Remate de Pertrecho — badge de PROBABILIDAD DE SOLTAR EQUIPO / GEAR-DROP BASE del mob TYPE server-auth (cuán PERTRECHADO va de fábrica la criatura: la probabilidad base gearChance con que suelta equipo al morir); la señal viva = MAX gearWeight sobre los mobs VIVOS en radio (el mob más pertrechado rematable: arsenal⇒2/pertrecho medio⇒1/pelado⇒0) (canal gearFind, sub-cap gearBountyCap); resalta si hay un mob BIEN-ARMADO rematable, donde cazar su alta prob de gear rinde fichas de pertrecho. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(WINDUP_SURGE.enabled) renderWindupBadge(); // CAS-2585: Remate de Presagio — badge de TIEMPO DE PRESAGIO / WIND-UP BASE del mob TYPE server-auth (la CADENCIA DE ANTICIPACIÓN intrínseca: cuánto TELEGRAFÍA la criatura de fábrica ANTES de golpear); la señal viva = MAX windWeight sobre los mobs VIVOS en radio (el telegrafiado más ponderoso rematable: ponderoso⇒2/medido⇒1/súbito⇒0) (canal windFind, sub-cap windBountyCap); resalta si hay un TELEGRAFIADO rematable, donde castigar su amago largo rinde fichas de presagio. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(RAM_SURGE.enabled) renderRamBadge(); // CAS-2580: Remate de Ariete — badge de FUERZA DE IMPACTO/KNOCKBACK BASE del mob TYPE server-auth (la POTENCIA DE EMPUJE intrínseca: cuánto te ARROLLA la criatura de fábrica al golpear); la señal viva = MAX ramWeight sobre los mobs VIVOS en radio (el demoledor más contundente rematable: ariete⇒2/pegador firme⇒1/leve⇒0) (canal ramFind, sub-cap ramBountyCap); resalta si hay un DEMOLEDOR rematable, donde descolocarlo rinde fichas de ariete. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(SENTINEL_SURGE.enabled) renderSentinelBadge(); // CAS-2573: Remate de Vigía — badge de VIGILANCIA/RADIO-DE-PERCEPCIÓN BASE del mob TYPE server-auth (la ALERTA intrínseca: cuán LEJOS te DETECTA la criatura de fábrica); la señal viva = MAX sentinelWeight sobre los mobs VIVOS en radio (el vigía más alerta rematable: vigía⇒2/vigilante⇒1/despistado⇒0) (canal sentinelFind, sub-cap sentinelBountyCap); resalta si hay un VIGÍA rematable, donde cegarlo rinde fichas de vigilia. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(TOUGH_SURGE.enabled) renderToughBadge(); // CAS-2569: Remate de Coloso — badge de AGUANTE/MAX-HP BASE del mob TYPE server-auth (la DURABILIDAD intrínseca: cuánto castigo AGUANTA la criatura de fábrica); la señal viva = MAX toughWeight sobre los mobs VIVOS en radio (el coloso más duro rematable: tanque⇒2/firme⇒1/frágil⇒0) (canal toughFind, sub-cap toughBountyCap); resalta si hay un COLOSO rematable, donde abatirlo rinde fichas de aguante. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(MENACE_SURGE.enabled) renderMenaceBadge(); // CAS-2563: Remate de Matón — badge de POTENCIA DE DAÑO BASE del mob TYPE server-auth (la FUERZA OFENSIVA intrínseca: cuán DURO pega la criatura); la señal viva = MAX menaceWeight sobre los mobs VIVOS en radio (el matón más peligroso rematable: pegador pesado⇒2/moderado⇒1/alfeñique⇒0) (canal menaceFind, sub-cap menaceBountyCap); resalta si hay un MATÓN rematable, donde abatirlo rinde fichas de amenaza. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(SWIFT_SURGE.enabled) renderSwiftBadge(); // CAS-2556: Remate de Presa Veloz — badge de VELOCIDAD DE MOVIMIENTO BASE del mob TYPE server-auth (la RAPIDEZ intrínseca de la criatura); la señal viva = MAX swiftWeight sobre los mobs VIVOS en radio (la presa más escurridiza rematable: escurridiza⇒2/ágil⇒1/plúmbeo⇒0) (canal swiftFind, sub-cap swiftBountyCap); resalta si hay una PRESA ESCURRIDIZA rematable, donde acorralarla rinde fichas de acoso. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ROLE_SURGE.enabled) renderRoleBadge(); // CAS-2551: Remate de Cabecilla — badge de ROL/ARQUETIPO DE COMBATE del mob TYPE server-auth (la FUNCIÓN de IA intrínseca de la criatura); la señal viva = MAX roleWeight sobre los mobs VIVOS en radio (la pieza clave más valiosa rematable: habilitador de soporte⇒2/disruptor especialista⇒1/peleador estándar⇒0) (canal roleFind, sub-cap roleBountyCap); resalta si hay un mob de ALTO VALOR TÁCTICO rematable, donde despacharlo rinde fichas de cabecilla. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(BULK_SURGE.enabled) renderBulkBadge(); // CAS-2546: Remate de Mole — badge de BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE server-auth (la MOLE intrínseca de la criatura); la señal viva = MAX bulkWeight sobre los mobs VIVOS en radio (la mole más grande rematable: bestia corpulenta⇒2/mediana⇒1/menuda⇒0) (canal bulkFind, sub-cap bulkBountyCap); resalta si hay un mob VOLUMINOSO rematable, donde despacharlo rinde fichas de mole. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(ZONETIER_SURGE.enabled) renderZoneTierBadge(); // CAS-2541: Remate en Zona Peligrosa — badge de DIFICULTAD/TIER de la ZONA GEOGRÁFICA server-auth donde muere el mob (banda de nivel del ÁREA); la señal viva = MAX tierWeight sobre los mobs VIVOS en radio (el kill de zona más peligrosa disponible: zona endgame/peligrosa⇒2/intermedia⇒1/inicial⇒0) (canal tierFind, sub-cap tierBountyCap); resalta si hay un mob rematable en tierra profunda/hostil, donde despacharlo rinde fichas de frontera. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(HEADING_SURGE.enabled) renderHeadingBadge(); // CAS-2537: Remate de Embestida — badge de RUMBO/HEADING del mob al kill (dirección de MOVIMIENTO relativa al héroe); la señal viva = MAX headingWeight sobre los mobs VIVOS en radio (la embestida más peligrosa disponible: cargando de frente⇒2/lateral⇒1/huyendo⇒0) (canal headingFind, sub-cap headingBountyCap); resalta si hay un mob CARGANDO hacia el héroe, donde rematar al agresor rinde fichas de embestida. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(INTERRUPT_SURGE.enabled) renderInterruptBadge(); // CAS-2532: Remate de Interrupción — badge de ESTADO-DE-ACCIÓN-EN-PROGRESO del mob al kill (denegar la habilidad enemiga); la señal viva = MAX interruptWeight sobre los mobs VIVOS en radio (la mejor interrupción disponible: habilidad PESADA (shield/special/cast)⇒2/ataque NORMAL comprometido (windup/strike)⇒1) (canal interruptFind, sub-cap interruptBountyCap); resalta si hay un mob EJECUTANDO una acción rematable, donde cortarlo MID-ACCIÓN rinde fichas de interrupción. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(LONGSHOT_SURGE.enabled) renderLongshotBadge(); // CAS-2527: Remate a Distancia — badge de DISTANCIA/RANGO DEL GOLPE DE REMATE (geometría hero↔víctima al kill); la señal viva = MAX reachWeight sobre los mobs VIVOS en radio (el mejor long-shot disponible, far≥farR⇒2/near≥midR⇒1) (canal reachFind, sub-cap reachBountyCap); resalta si hay un blanco a distancia rematable, donde abatir DE LEJOS rinde fichas de puntería. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(PACKHARVEST_SURGE.enabled) renderPackHarvestBadge(); // CAS-2521: Siega de Manada — badge de COHESIÓN/EMPAQUETAMIENTO INTER-MOB (clustering mob↔mob: nº de otros mobs vivos en cohesionR de cada mob) sobre los MOBS VIVOS en radio (canal packFind, sub-cap packBountyCap); resalta si el héroe remata en medio de una MANADA APIÑADA/jauría, donde el forrajeo rinde cargas de siega. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(BLOODHARVEST_SURGE.enabled) renderBloodHarvestBadge(); // CAS-2516: Siega de Heridos — badge de DENSIDAD DE MOBS VIVOS ENSANGRENTADOS (fracción de vida baja e.hp/e.maxHp) en radio (canal bloodFind, sub-cap bloodChargeCap); resalta si el héroe remata en medio de un campo de heridos/carne-de-ejecución, donde el forrajeo rinde cargas de siega. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(CONTROL_HARVEST_SURGE.enabled) renderControlHarvestBadge(); // CAS-2510: Cosecha de Sometimiento — badge de DENSIDAD DE ESTADO DE CONTROL DE MULTITUD (CC: stun/slow) sobre los mobs VIVOS (e.stun/e.slowT) en radio (canal controlFind, sub-cap controlChargeCap); resalta si el héroe remata en medio de un pack sometido/inmovilizado por CC, donde el forrajeo rinde cargas de sometimiento. Cosmético puro. DARK (enabled:false) ⇒ NO se dibuja hasta el flip.
    if(BLIGHT_HARVEST_SURGE.enabled) renderBlightHarvestBadge(); // CAS-2497: Cosecha de Plaga — badge de PRESENCIA/DENSIDAD de aflicciones de estado (DoT: veneno/quemadura) activas sobre los mobs VIVOS (e.dots) en radio (canal blightFind, sub-cap blightHarvestCap); resalta si el héroe cosecha en medio de un pack enfermo, donde el forrajeo rinde esencias de plaga. Cosmético puro.
    if(G.arenaMode) renderArenaOverlay(); // CAS-1664: wave/best banner (+ rest note) over the HUD
    if(G.bossRushMode) renderBossRushOverlay(); // CAS-1988: round r/N + best banner (+ bonfire note) over the HUD
    if(G.showMap) renderBigMap();
    if(G.scene==="inventory") renderInventory();
    if(G.scene==="talents") renderTalents();
    if(G.scene==="mastery") renderMastery(); // CAS-150 elite-mastery reward track
    if(G.scene==="codex") renderCodex(); // CAS-1751 Códice de Botín (Collection Log)
    if(G.scene==="titles") renderTitles(); // CAS-1758 Títulos de Gesta (Feat Titles)
    if(G.scene==="pacts") renderPacts(); // CAS-1763 Pactos de Poder (Power Pacts)
    if(G.scene==="combatcodex") renderCombatCodex(); // CAS-1996 Códice de Combate (Combat Codex reference panel)
    if(G.scene==="dialogue") renderDialogue();
    if(G.scene==="shop") renderShop();
    if(G.scene==="forge") renderForge(); // CAS-237 equipment forge
    if(G.scene==="bounty") renderBounty();
    if(G.scene==="bestiary") renderBestiary(); // CAS-386 bestiary / codex collection
    if(G.scene==="draft") renderDraft(); // CAS-383 inter-zone boon draft
    if(G.scene==="curse") renderCurse(); // CAS-394 opt-in zone modifier offer
    if(G.scene==="ascend") renderAscend(); // CAS-450 opt-in World-Tier climb offer
    if(G.scene==="ascendRecap") renderAscendRecap(); // CAS-2035 data-driven NG+ cycle-recap overlay
    if(G.scene==="bossRushRecap") renderBossRushRecap(); // CAS-2047 Boss Rush time-attack results/records overlay
    if(G.scene==="pause") renderPause();
    if(G.scene==="dead") renderDeath();
    if(G.scene==="altar") renderAltar(); // CAS-1557 meta-progression altar (opened from death)
    if(G.scene==="victory") renderVictory();
    // CAS-128: onboarding coachmarks — drawn only in free play, never over a panel, so
    // they teach without blocking. Cleared once finished/skipped (G.tut.active=false).
    if(G.scene==="play" && G.tut && G.tut.active) renderTutorial();
    renderToast();
    if(isTouch && G.scene==="play") renderTouch();
    if(G.settings.crt) renderCRT();
  }

  // CAS: procedural ENTERABLE house sprite (open-top / cutaway) → cached offscreen canvas per
  // kind+size. Stone perimeter walls, warm wood-plank interior, a south door gap, and simple
  // furniture. tw×th tiles; collision (world.blockSet) is authored to match in sim/world.js.
  const _bldCache={};
  function buildingCanvas(kind, tw, th, door){
    if(typeof document==="undefined") return null;
    const key=kind+"_"+tw+"_"+th+"_"+door;
    if(_bldCache[key]) return _bldCache[key];
    const W=tw*TS, H=th*TS;
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    const c=cv.getContext("2d"); c.imageSmoothingEnabled=false;
    const WALL="#3a3f49", WALL_HI="#4e5460", WALL_LO="#22262e";
    const FLR="#8a6a44", FLR_HI="#a9814f", FLR_LO="#5f472f";
    const WOOD="#5a4632", WOOD_HI="#7a603e", BED="#963434", PILLOW="#d6d1c4", GOLD="#d8b25e";
    // interior wood floor + plank seams + inner wall shadow
    const ix=TS, iy=TS, iw=W-2*TS, ih=H-2*TS;
    c.fillStyle=FLR; c.fillRect(ix,iy,iw,ih);
    for(let py=iy; py<iy+ih; py+=8){ c.fillStyle=FLR_LO; c.fillRect(ix,py,iw,1); c.fillStyle=FLR_HI; c.fillRect(ix,py+1,iw,1); }
    c.fillStyle="rgba(0,0,0,0.34)"; c.fillRect(ix,iy,iw,4); c.fillStyle="rgba(0,0,0,0.20)"; c.fillRect(ix,iy,4,ih);
    const wallH=(x,y,w)=>{ c.fillStyle=WALL; c.fillRect(x,y,w,TS); c.fillStyle=WALL_HI; c.fillRect(x,y,w,3); c.fillStyle=WALL_LO; c.fillRect(x,y+TS-4,w,4);
      c.fillStyle=WALL_LO; for(let bx=x;bx<x+w;bx+=16){ c.fillRect(bx,y+6,1,TS-10); c.fillRect(bx+8,y+3,1,4); } };
    const wallV=(x,y,h)=>{ c.fillStyle=WALL; c.fillRect(x,y,TS,h); c.fillStyle=WALL_HI; c.fillRect(x,y,3,h); c.fillStyle=WALL_LO; c.fillRect(x+TS-4,y,4,h);
      c.fillStyle=WALL_LO; for(let by=y;by<y+h;by+=16) c.fillRect(x+6,by,TS-10,1); };
    wallH(0,0,W); wallV(0,TS,H-2*TS); wallV(W-TS,TS,H-2*TS);
    const dgap=2*TS, dx=door*TS;
    wallH(0,H-TS,dx); wallH(dx+dgap,H-TS,W-(dx+dgap));
    c.fillStyle=WOOD_HI; c.fillRect(dx-2,H-TS,3,TS); c.fillRect(dx+dgap-1,H-TS,3,TS);     // door posts
    c.fillStyle=WOOD; c.fillRect(dx,H-6,dgap,6); c.fillStyle="rgba(0,0,0,0.55)"; c.fillRect(dx,H-TS,dgap,3); // threshold + lintel shade
    if(kind==="house"||kind==="cottage"){ c.fillStyle=WOOD; c.fillRect(TS+4,TS+4,26,40); c.fillStyle=BED; c.fillRect(TS+6,TS+6,22,36); c.fillStyle=PILLOW; c.fillRect(TS+6,TS+6,22,10); }
    if(kind==="house"||kind==="shop"){ const tx=W/2-14,ty=H/2-6; c.fillStyle=WOOD_HI; c.fillRect(tx,ty,28,18); c.fillStyle=WOOD; c.fillRect(tx+2,ty+16,4,8); c.fillRect(tx+22,ty+16,4,8); }
    if(kind==="shop"){ c.fillStyle=WOOD; c.fillRect(W-TS-22,TS+6,16,H-2*TS-12); c.fillStyle=WOOD_HI; c.fillRect(W-TS-22,TS+6,16,4); c.fillStyle=GOLD; c.fillRect(W-TS-18,TS+12,3,3); c.fillRect(W-TS-13,TS+16,3,3); }
    if(kind==="cottage"){ c.fillStyle="#463240"; c.fillRect(W/2-10,H/2+2,20,14); c.fillStyle=WOOD; c.fillRect(W-TS-16,H-TS-20,12,16); c.fillStyle=WOOD_HI; c.fillRect(W-TS-16,H-TS-20,12,4); }
    _bldCache[key]=cv; return cv;
  }
  // CAS: central SHRINE plaza — a circular ERW-style ancient-ruins ring (outer sandstone band +
  // brown processional track + a ring of diamond flagstones) cached once per radius and blitted
  // flat at the town centre, UNDER the fountains/NPCs/altar. Interior stays transparent so the
  // ERW flagstone floor shows through. Sun (real art) + moon (below) are drawn on top separately.
  const _plazaCache={};
  function plazaCanvas(R){
    if(typeof document==="undefined") return null;
    if(_plazaCache[R]) return _plazaCache[R];
    const S=2*R, cx=R, cy=R;
    const cv=document.createElement("canvas"); cv.width=S; cv.height=S;
    const c=cv.getContext("2d"); c.imageSmoothingEnabled=false;
    const SAND_HI="#e7d6a2", SAND="#cdb578", SAND_LO="#9c8248", TRACK="#8a6a3f", TRACK_LO="#6a4f2e", MOSS="#7d9450";
    const bandW=Math.round(R*0.17), ringR=R-bandW/2;
    // outer sandstone band (the paved rim)
    c.lineCap="butt";
    c.strokeStyle=SAND; c.lineWidth=bandW; c.beginPath(); c.arc(cx,cy,ringR,0,6.283); c.stroke();
    c.strokeStyle=SAND_HI; c.lineWidth=2; c.beginPath(); c.arc(cx,cy,R-1,0,6.283); c.stroke();          // bright outer lip
    c.strokeStyle=SAND_LO; c.lineWidth=2; c.beginPath(); c.arc(cx,cy,R-bandW+1,0,6.283); c.stroke();     // inner shadow lip
    // radial block seams across the band
    const seams=32;
    c.strokeStyle=SAND_LO; c.lineWidth=1;
    for(let i=0;i<seams;i++){ const a=i/seams*6.283, co=Math.cos(a), si=Math.sin(a);
      c.beginPath(); c.moveTo(cx+co*(R-bandW+1), cy+si*(R-bandW+1)); c.lineTo(cx+co*(R-1), cy+si*(R-1)); c.stroke(); }
    // brown processional track just inside the band
    const trackW=Math.round(R*0.085), trackR=R-bandW-trackW/2-1;
    c.strokeStyle=TRACK; c.lineWidth=trackW; c.beginPath(); c.arc(cx,cy,trackR,0,6.283); c.stroke();
    c.strokeStyle=TRACK_LO; c.lineWidth=2; c.beginPath(); c.arc(cx,cy,trackR-trackW/2+1,0,6.283); c.stroke();
    // ring of diamond flagstones on the inner court
    const diamR=Math.round(R*0.60), dN=16, dh=Math.round(R*0.06);
    for(let i=0;i<dN;i++){ const a=i/dN*6.283, dx=cx+Math.cos(a)*diamR, dy=cy+Math.sin(a)*diamR;
      c.save(); c.translate(dx,dy); c.rotate(Math.PI/4);
      c.fillStyle=SAND; c.fillRect(-dh,-dh,dh*2,dh*2); c.fillStyle=SAND_HI; c.fillRect(-dh,-dh,dh*2,2); c.restore(); }
    // a few moss tufts breaking the rim (deterministic)
    c.fillStyle=MOSS;
    for(let i=0;i<seams;i+=5){ const a=i/seams*6.283; c.fillRect(Math.round(cx+Math.cos(a)*(R-2))-1, Math.round(cy+Math.sin(a)*(R-2))-1, 2,2); }
    _plazaCache[R]=cv; return cv;
  }
  // procedural crescent moon glyph (no moon art in the pack) — pale sage stone inlay, mirror of
  // the real ERW sun disc it's paired with on the shrine plaza.
  function drawMoonGlyph(x,y,r){
    ctx.save();
    ctx.fillStyle="#aeb89c"; ctx.beginPath();
    ctx.arc(x,y,r, Math.PI*0.42, Math.PI*1.58);                 // outer edge
    ctx.arc(x+r*0.5,y,r*0.86, Math.PI*1.5, Math.PI*0.5, true);  // inner bite (crescent)
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#7c886a"; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle="#d3dcc4"; ctx.beginPath(); ctx.arc(x-r*0.35,y-r*0.4,1.6,0,6.283); ctx.fill(); // glint
    ctx.restore();
  }
  function renderWorld(camX,camY,Z){
    // CAS-1708: floor-tile SEAMS. The world is drawn inside ctx.scale(Z) (Z=1.55/1.7) × dpr(≤1.5),
    // so the tile stride TS*Z*dpr is non-integer → adjacent floor tiles rasterize their shared edge
    // to different device pixels, leaving a 1px grid ("cuadros") between tiles. imageSmoothing is
    // already off (no texel bleed) and camera-snapping can't fix a non-integer stride, so we draw
    // each GROUND tile 1 world-unit larger toward bottom-right (TSo). Draw order is ascending y,x,
    // so the top-left neighbor (drawn first) underlaps the potential gap of the tile drawn on top of
    // it → the seam pixel is always covered. Render-only, RNG-neutral, no save bump.
    // CAS-1709 AC4: BLEED is the single kill-switch constant — BLEED=0 ⇒ TSo===TS ⇒ every
    // ground drawImage/fill reverts to byte-identical pre-fix output (trivial A/B & rollback).
    const BLEED=1, TSo=TS+BLEED;
    // CAS-2208: PIXELART master A/B gate. `spritesOn` guards each IMG-backed floor branch; when false the
    // branch is skipped and the tile falls through to the procedural `tileBase[t]` fill + fleck pass below
    // (byte-identical to the pre-sprite look). Default true ⇒ same branch taken (byte-identical LIVE).
    const spritesOn=PIXELART.spritesEnabled;
    const x0=Math.max(0,Math.floor(camX/TS)-1), y0=Math.max(0,Math.floor(camY/TS)-1);
    const x1=Math.min(MAP_W-1,Math.ceil((camX+VW/Z)/TS)+1), y1=Math.min(MAP_H-1,Math.ceil((camY+VH/Z)/TS)+1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=world.terr[y*MAP_W+x]; const px=x*TS, py=y*TS;
      // CAS-462: dentro del continente Tiled el suelo se dibuja del atlas horneado del TMX.
      if(spritesOn && world.tiledVisual && x<GROUND.W && y<GROUND.H){ const ga=IMG.tiled_ground;
        if(ga&&ga.complete&&ga.naturalWidth){ let gi=GROUND.grid[y*GROUND.W+x];
          if(gi>=GROUND.animStart) gi+=((G.t*8)|0)%GROUND.animFrames;   // CAS-463: agua animada
          ctx.drawImage(ga,(gi%GROUND.cols)*TS,((gi/GROUND.cols)|0)*TS,TS,TS,px,py,TSo,TSo); continue; } }
      if(world.wallSet && world.wallSet.has(y*MAP_W+x)){
        // CAS: the CENTRAL WALLED CITY rampart is re-skinned with real ERW Ancient Ruins wall
        // art — mossy sandstone crown (erw_wall_h) along the N/S runs + corners, stone-brick
        // face (erw_wall_v) down the E/W sides. Scoped to the town rect border so cave walls
        // elsewhere keep their own tiles; falls back to the cave wall art until ERW loads.
        const T=world.town; let wimg;
        if(T && x>=T.x && x<=T.x+T.w-1 && y>=T.y && y<=T.y+T.h-1 && (x===T.x||x===T.x+T.w-1||y===T.y||y===T.y+T.h-1)){
          const erw=(y===T.y||y===T.y+T.h-1)?IMG.erw_wall_h:IMG.erw_wall_v;
          wimg=(erw&&erw.complete&&erw.naturalWidth)?erw:(hash2(x,y)<0.5?IMG.wall:IMG.wall2);
        } else wimg=(hash2(x,y)<0.5?IMG.wall:IMG.wall2);
        if(spritesOn && wimg&&wimg.complete&&wimg.naturalWidth) ctx.drawImage(wimg,px,py,TS,TS); else { ctx.fillStyle="#2b313a"; ctx.fillRect(px,py,TS,TS); }
        continue; }
      if(spritesOn && t===T_STONE){ const r=hash2(x,y); const img = (r<0.10?IMG.cave_blood:(r<0.65?IMG.cave_floor:IMG.cave_floor2)); // CAS-217: flagstone-dominant + void + rare war-torn blood accent
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-224 (Art): Cripta Helada floor — was a flat bright-grey grid. Re-source the
      // SAME hi-fi FOUNTAINS dark flagstone as caves/abyss (parity with CAS-217), then wash
      // it cold: an UNEVEN near-black ambient (torch-pool falloff) + rime-blue tint so the
      // crypt reads frozen-and-dark, not bright. Rime cracks/glints carry icy zone identity.
      if(spritesOn && t===T_ICE){ const r=hash2(x,y); const img=(r<0.58?IMG.cave_floor:IMG.cave_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo);
          const dk=(0.30+hash2(x*3,y*3)*0.24).toFixed(2);                 // 0.30–0.54 per-tile = torch falloff
          ctx.fillStyle="rgba(8,16,28,"+dk+")"; ctx.fillRect(px,py,TSo,TSo); // near-black cold ambient (match TSo so the seam-overlap strip is tinted too)
          ctx.fillStyle="rgba(120,170,205,0.12)"; ctx.fillRect(px,py,TSo,TSo); // rime-blue chill tint
          if(hash2(x+5,y)<0.42){ ctx.strokeStyle="rgba(196,224,238,0.45)"; ctx.lineWidth=1; // frozen crack
            const ix=px+((hash2(x,y)*18)|0)+6, iy=py+((hash2(y,x)*18)|0)+6;
            ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ix+5,iy+4); ctx.lineTo(ix+3,iy+10); ctx.stroke(); }
          if(hash2(x,y+9)<0.20){ ctx.fillStyle="rgba(220,238,248,0.6)"; ctx.fillRect(px+((hash2(x+3,y)*22)|0)+4, py+((hash2(x,y+3)*22)|0)+4, 2,2); } // ice glint
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-1744: Caldera de Cenizas floor — reuses the SAME FOUNTAINS dark flagstone as caves/abyss
      // (no new tile art, mirrors the T_ICE approach), washed molten: a warm charred-basalt ambient +
      // ember-orange tint, with rare cracks glowing lava and stray sparks so the biome reads volcanic.
      if(spritesOn && t===T_CALDERA){ const r=hash2(x,y); const img=(r<0.58?IMG.cave_floor:IMG.cave_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo);
          const dk=(0.30+hash2(x*3,y*3)*0.22).toFixed(2);                 // 0.30–0.52 per-tile charred ambient
          ctx.fillStyle="rgba(22,8,6,"+dk+")"; ctx.fillRect(px,py,TSo,TSo); // dark basalt shadow
          ctx.fillStyle="rgba(200,70,30,0.12)"; ctx.fillRect(px,py,TSo,TSo); // ember-orange wash
          if(hash2(x+4,y)<0.34){ ctx.strokeStyle="rgba(255,130,40,0.6)"; ctx.lineWidth=1; // glowing lava crack
            const ix=px+((hash2(x,y)*18)|0)+6, iy=py+((hash2(y,x)*18)|0)+6;
            ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ix+5,iy+4); ctx.lineTo(ix+3,iy+10); ctx.stroke(); }
          if(hash2(x,y+7)<0.16){ ctx.fillStyle="rgba(255,200,90,0.7)"; ctx.fillRect(px+((hash2(x+3,y)*22)|0)+4, py+((hash2(x,y+3)*22)|0)+4, 2,2); } // ember spark
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.4)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-77: real EPIC RPG World — Ancient Ruins ground. Town plaza (T_COBBLE)
      // pays in flagstone; forest/ruins/field (T_GRASS) in grass. Two deterministic
      // variants per kind via hash2(); fall through to the procedural fill below when
      // the image hasn't loaded (unit tooling / first frame). Collision is untouched.
      if(t===T_COBBLE){
        // CAS: the walled-city plaza (T_COBBLE inside the town rect) pays in real ERW flagstone;
        // the colosseum/ruins flagstone elsewhere keeps ruins_floor. ERW tiles fall back to the
        // ruins flagstone until they load so the plaza never flashes bare.
        const T=world.town, inTown=T&&x>=T.x&&x<T.x+T.w&&y>=T.y&&y<T.y+T.h;
        let img=inTown ? (hash2(x,y)<0.5?IMG.erw_flag:IMG.erw_flag2) : null;
        if(!(img&&img.complete&&img.naturalWidth)) img=(hash2(x,y)<0.5?IMG.ruins_floor:IMG.ruins_floor2);
        if(spritesOn && img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-2191: T_STREET cells paint GRASS as their base here; the cobblestone Wang road is
      // laid on top in the dual-grid overlay pass below (so the road's curbs blend into the verge).
      if(spritesOn && (t===T_GRASS || t===T_STREET)){ const img=(hash2(x,y)<0.5?IMG.ruins_grass:IMG.ruins_grass2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo); continue; } }
      // CAS-441: Ciénaga de Bruma floor (CAS-439 teal marsh tiles). A LOW-frequency hash
      // (x>>1,y>>1) gates the water so pools clump into 2×2-ish ponds instead of lone
      // speckles; puddles + the two mud variants alternate per-tile. All walkable —
      // the marsh is shallow (wading), depth reads from the props, not collision.
      if(spritesOn && t===T_SWAMP){ const pool=hash2(x>>1,y>>1), r=hash2(x,y);
        const img=(pool<0.08?IMG.swamp_water:(r<0.12?IMG.swamp_puddle:(r<0.66?IMG.swamp_mud:IMG.swamp_mud2)));
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TSo,TSo); continue; } }
      ctx.fillStyle=tileBase[t]; ctx.fillRect(px,py,TSo,TSo);
      const hv=hash2(x,y);
      // texture flecks (deterministic)
      ctx.fillStyle = hv<0.5? tileDark[t]: tileLight[t];
      const fx=px+((hv*53)%1)*24+4, fy=py+((hv*97)%1)*24+4;
      ctx.fillRect(fx|0, fy|0, 4,4);
      if(hash2(x+7,y+3)<0.28){ ctx.fillStyle=tileLight[t]; ctx.fillRect(px+ ((hash2(x,y+1)*22)|0)+5, py+((hash2(x+1,y)*22)|0)+5, 3,3); }
      if(t===T_GRASS && hash2(x*2,y)<0.10){ ctx.fillStyle=COL.twig; ctx.fillRect(px+10,py+14,3,6); }
      if(t===T_SAND && hash2(x,y*2)<0.08){ ctx.fillStyle=COL.bloodSand; ctx.fillRect(px+8,py+10,6,5); }
    }
    // CAS-2191: cobblestone STREET overlay (dual-grid Wang autotile). Each display tile sits at a
    // WORLD-CELL CORNER (offset −½ tile) and is picked by the terrain of the 4 cells around that
    // corner — a robust 16-tile corner blend, no per-tile heuristics. `paved` = T_STREET OR the
    // T_COBBLE plaza (so street meets plaza seamlessly, grass curbs only at the verges); we only
    // draw where at least one corner is actual STREET, so the plaza interior keeps its flagstone.
    // Ground-level (before entities) so hero/props Y-sort above; view-culled to the visible span.
    { const cimg=IMG.city_street;
      if(spritesOn && cimg&&cimg.complete&&cimg.naturalWidth){  // CAS-2208: Wang road overlay gated ⇒ procedural leaves the grass base painted above
        const paved=(tx,ty)=>{ if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return 0; const tt=world.terr[ty*MAP_W+tx]; return (tt===T_STREET||tt===T_COBBLE)?1:0; };
        const street=(tx,ty)=> (tx>=0&&ty>=0&&tx<MAP_W&&ty<MAP_H) && world.terr[ty*MAP_W+tx]===T_STREET;
        for(let cy=y0;cy<=y1+1;cy++)for(let cx=x0;cx<=x1+1;cx++){
          if(!(street(cx-1,cy-1)||street(cx,cy-1)||street(cx-1,cy)||street(cx,cy))) continue; // near a real street only
          const mask=paved(cx-1,cy-1)|(paved(cx,cy-1)<<1)|(paved(cx,cy)<<2)|(paved(cx-1,cy)<<3);
          if(mask===0) continue;
          const w=CITY_WANG[mask];
          ctx.drawImage(cimg, w[0]*TS, w[1]*TS, TS, TS, Math.round(cx*TS-TS/2), Math.round(cy*TS-TS/2), TSo, TSo);
        }
      }
    }
    // CAS-2225: door open/close slab (DARK mechanic — procedural, no art dep; the Thais art dresses it
    // later under the PixelLab lane). Drawn at GROUND level (entities Y-sort above) on each door threshold:
    // CLOSED = a solid wooden panel across the gap; OPEN = a dark doorway you can read as passable. Gated ⇒
    // with the feature OFF world.doors is null ⇒ this loop is skipped entirely (byte-identical to HEAD).
    if(DOORS_INTERIORS.enabled && world.doors){ for(const d of world.doors){
      const dxp=d.tx*TS, dyp=d.ty*TS;
      if(dxp>camX+VW/Z+48 || dxp+TS<camX-48 || dyp>camY+VH/Z+48 || dyp+TS<camY-48) continue; // view-cull
      const open=!!(G.doors&&G.doors[d.id]);
      if(open){
        ctx.fillStyle="#141014"; ctx.fillRect(dxp+5,dyp+3,TS-10,TS-4);        // dark interior threshold (passable)
        ctx.fillStyle="#4a372352"; ctx.fillRect(dxp+2,dyp+2,3,TS-3); ctx.fillRect(dxp+TS-5,dyp+2,3,TS-3); // side jambs, door swung in
      } else {
        ctx.fillStyle="#5a3f27"; ctx.fillRect(dxp+4,dyp+2,TS-8,TS-3);         // wooden panel (solid)
        ctx.fillStyle="#432e1c"; ctx.fillRect(dxp+TS/2-1,dyp+2,2,TS-3);        // plank seam
        ctx.fillStyle="#c8a24a"; ctx.fillRect(dxp+TS-9,dyp+TS/2-1,3,3);        // brass handle
      }
    } }
    // CAS: enterable walled-city houses (open-top / cutaway). Pre-rendered per kind+size to a
    // cached canvas, blitted at GROUND level here so entities (player/NPCs) draw ON TOP → you
    // walk inside on the same screen. Walls block via world.blockSet (sim); door gap is open.
    if(world.buildings) for(const b of world.buildings){
      const bxp=b.tx*TS, byp=b.ty*TS, bw=b.tw*TS, bh=b.th*TS;
      if(bxp>camX+VW/Z+48 || bxp+bw<camX-48 || byp>camY+VH/Z+48 || byp+bh<camY-48) continue; // view-cull
      const cv=buildingCanvas(b.kind, b.tw, b.th, b.door);
      if(cv){ ctx.imageSmoothingEnabled=false; ctx.drawImage(cv, bxp, byp); }
    }
    // CAS: central SHRINE plaza (ERW ruins) — circular ring under the town centre, with the
    // real ERW radiant sun glyph W and a procedural crescent moon E (mirroring the mockup).
    // The greek-key altar itself is a y-sorted deco prop placed in sim/world.js. Drawn here at
    // ground level (under fountains/NPCs) and view-culled against the plaza bounds.
    if(world.town && !world.tiledVisual){   // CAS-468: en el continente Tiled la plaza vieja se elimina (pedido del board)
      const T=world.town, R=Math.round(4.5*TS);
      const cxp=Math.round((T.x+T.w/2)*TS), cyp=Math.round((T.y+T.h/2)*TS);
      if(!(cxp-R>camX+VW/Z+48 || cxp+R<camX-48 || cyp-R>camY+VH/Z+48 || cyp+R<camY-48)){
        const pv=plazaCanvas(R); if(pv){ ctx.imageSmoothingEnabled=false; ctx.drawImage(pv, cxp-R, cyp-R); }
        const sImg=IMG.erw_sun;
        if(sImg&&sImg.complete&&sImg.naturalWidth){ const ss=0.62, sw=sImg.naturalWidth*ss, sh=sImg.naturalHeight*ss;
          ctx.drawImage(sImg, Math.round(cxp-2.7*TS-sw/2), Math.round(cyp+0.4*TS-sh/2), Math.round(sw), Math.round(sh)); }
        drawMoonGlyph(cxp+2.7*TS, cyp+0.4*TS, 15);
      }
    }
    // fountains (water pools)
    for(const f of world.fountains){ const r=20;
      ctx.fillStyle=COL.stoneD; ctx.beginPath(); ctx.arc(f.x,f.y,r+4,0,6.28); ctx.fill();
      ctx.fillStyle=COL.water; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.fill();
      ctx.fillStyle=COL.waterL; const ph=Math.sin(G.t*2+f.x)*3; ctx.fillRect(f.x-8,f.y-4+ph,5,3); ctx.fillRect(f.x+4,f.y+2-ph,4,3);
      ctx.fillStyle=COL.waterGlint; ctx.fillRect(f.x-3,f.y-8+ph,3,3);
      if(f.temple){ ctx.fillStyle=COL.textGold; ctx.fillRect(f.x-2,f.y-r-10,4,8); ctx.fillRect(f.x-6,f.y-r-6,12,3);}
      // CAS-1879: HOGUERA — llama/glow procedural $0 sobre el sitio de descanso, gateada por BONFIRE.enabled
      // (OFF ⇒ este bloque no dibuja nada ⇒ byte-idéntico a HEAD). sin(G.t)+radial gradient, sin assets nuevos.
      if(BONFIRE.enabled){ const gc=BONFIRE.glowColor, fl=1+Math.sin(G.t*6+f.x)*0.16, fh=(16+Math.sin(G.t*9+f.y)*4)*fl;
        const g=ctx.createRadialGradient(f.x,f.y-2,1,f.x,f.y-2,r*1.9); g.addColorStop(0,"rgba(255,180,90,0.5)"); g.addColorStop(1,"rgba(255,120,40,0)");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(f.x,f.y-2,r*1.9,0,6.28); ctx.fill();       // glow radial pulsante
        ctx.fillStyle=gc; ctx.beginPath(); ctx.moveTo(f.x-5*fl,f.y+2);                          // llama triangular procedural
        ctx.quadraticCurveTo(f.x-3*fl,f.y-fh*0.5,f.x,f.y-fh); ctx.quadraticCurveTo(f.x+3*fl,f.y-fh*0.5,f.x+5*fl,f.y+2); ctx.closePath(); ctx.fill();
        ctx.fillStyle="#ffe08a"; ctx.beginPath(); ctx.moveTo(f.x-2*fl,f.y+1);                   // núcleo claro
        ctx.quadraticCurveTo(f.x-1.4*fl,f.y-fh*0.34,f.x,f.y-fh*0.6); ctx.quadraticCurveTo(f.x+1.4*fl,f.y-fh*0.34,f.x+2*fl,f.y+1); ctx.closePath(); ctx.fill(); } }
    // CAS-1886: HOGUERAS standalone en zonas de caza (BONFIRE.sites) — base de piedra + leños + misma llama/glow procedural
    // $0, gateada BONFIRE.enabled (OFF ⇒ lista vacía ⇒ nada dibuja ⇒ byte-idéntico a HEAD). View-culled por site (radial
    // gradients son caros); tiempo de sim ⇒ 0 render RNG. sim.bonfireSitesPublic() resuelve posiciones deterministas.
    if(BONFIRE.enabled) for(const f of sim.bonfireSitesPublic()){
      if(f.x>camX+VW/Z+48 || f.x<camX-48 || f.y>camY+VH/Z+48 || f.y<camY-48) continue;          // view-cull
      ctx.fillStyle="rgba(0,0,0,0.30)"; ctx.beginPath(); ctx.ellipse(f.x,f.y+5,13,6,0,0,6.28); ctx.fill();  // sombra
      ctx.fillStyle=COL.stoneD; ctx.beginPath(); ctx.arc(f.x,f.y+2,10,0,6.28); ctx.fill();       // anillo de piedra
      ctx.fillStyle="#5b3a22"; ctx.fillRect(f.x-7,f.y,14,3); ctx.fillRect(f.x-2,f.y-5,4,11);      // leños cruzados
      const gc=BONFIRE.glowColor, fl=1+Math.sin(G.t*6+f.x)*0.16, fh=(16+Math.sin(G.t*9+f.y)*4)*fl;
      const g=ctx.createRadialGradient(f.x,f.y-2,1,f.x,f.y-2,38); g.addColorStop(0,"rgba(255,180,90,0.5)"); g.addColorStop(1,"rgba(255,120,40,0)");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(f.x,f.y-2,38,0,6.28); ctx.fill();                 // glow radial pulsante
      ctx.fillStyle=gc; ctx.beginPath(); ctx.moveTo(f.x-5*fl,f.y+2);                              // llama triangular
      ctx.quadraticCurveTo(f.x-3*fl,f.y-fh*0.5,f.x,f.y-fh); ctx.quadraticCurveTo(f.x+3*fl,f.y-fh*0.5,f.x+5*fl,f.y+2); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#ffe08a"; ctx.beginPath(); ctx.moveTo(f.x-2*fl,f.y+1);                       // núcleo claro
      ctx.quadraticCurveTo(f.x-1.4*fl,f.y-fh*0.34,f.x,f.y-fh*0.6); ctx.quadraticCurveTo(f.x+1.4*fl,f.y-fh*0.34,f.x+2*fl,f.y+1); ctx.closePath(); ctx.fill();
    }
    // CAS-2325: VESTIGIO DEL CAÍDO — glifo ⚱ + halo pulsante sobre la TILE del vestigio ambiental VIVO (estado del MUNDO COMPARTIDO derivado del
    // reloj vía sim.soulVestige ⇒ MISMO vestigio para todos los clientes en zona, 0 duplicación de lógica). $0 arte (canvas procedural, reusa la
    // ruta de glifo/halo). Gated on convergent facts (patrón anti-CAS-2310): SÓLO dibuja cuando SOUL_RECOVERY.enabled Y el sim autoritativo
    // devuelve un vestigio VIVO ⇒ OFF / caducó ⇒ nada dibuja ⇒ byte-idéntico a HEAD. View-culled. Tiempo de sim ⇒ 0 render RNG.
    if(SOUL_RECOVERY.enabled){ const sv=sim.soulVestige&&sim.soulVestige();
      if(sv && !(sv.x>camX+VW/Z+48 || sv.x<camX-48 || sv.y>camY+VH/Z+48 || sv.y<camY-48)){
        const vx=sv.x, vy=sv.y, pl=0.5+Math.sin(G.t*3)*0.5;                                        // pulso lento (renace/caduca)
        ctx.save();
        const g=ctx.createRadialGradient(vx,vy-2,1,vx,vy-2,sv.radius); g.addColorStop(0,"rgba(150,120,220,"+(0.10+pl*0.10).toFixed(3)+")"); g.addColorStop(1,"rgba(120,90,200,0)");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(vx,vy-2,sv.radius,0,6.28); ctx.fill();            // halo del radio de recuperación
        ctx.fillStyle="rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(vx,vy+6,7,3,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.72+pl*0.24; ctx.font="bold 18px "+FF; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
        ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.strokeText("⚱",vx,vy);
        ctx.fillStyle="#b79ce8"; ctx.fillText("⚱",vx,vy);
        ctx.globalAlpha=0.9; ctx.font="10px "+FF; ctx.fillStyle="#cbb8ee"; ctx.strokeText(sv.fallen.name,vx,vy-20); ctx.fillText(sv.fallen.name,vx,vy-20);
        ctx.restore();
      } }
    // CAS-114 — warp portals (town↔abyss). The town→abyss gate reads LOCKED (dim red,
    // a barred glyph) until the hero's power clears the gate, then OPEN (violet swirl);
    // the return gate is always open. Animated from sim time only (no render RNG).
    if(world.portals) for(const p of world.portals){
      if(p.stub) continue;   // CAS-2191: a house-door threshold is not a magic gate — no swirl (the house sprite's door is the affordance)
      // CAS-121: each deeper gate reads its own power requirement (abyss < cripta).
      const req = p.to==="abyss"?ABYSS_POWER_REQ : p.to==="frost"?FROST_POWER_REQ : p.to==="trial"?TRIAL_POWER_REQ : p.to==="caldera"?CALDERA_POWER_REQ : 0;
      const locked = req>0 && sim.heroPower(G.hero) < req;
      const base = locked ? "#7a2230" : "#6a3cc0";
      const glow = locked ? "#c23a4a" : "#b07cff";
      const rot = G.t*(locked?0.6:1.8); const r=18;
      ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.beginPath(); ctx.ellipse(p.x,p.y+6,r,7,0,0,6.28); ctx.fill();
      // stone ring base
      ctx.fillStyle=COL.stoneD||"#2a2f38"; ctx.beginPath(); ctx.arc(p.x,p.y,r+3,0,6.28); ctx.fill();
      ctx.fillStyle=base; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,6.28); ctx.fill();
      // swirling rune arc
      ctx.strokeStyle=glow; ctx.lineWidth=3; ctx.beginPath();
      ctx.arc(p.x,p.y,r-4,rot,rot+Math.PI*1.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x,p.y,r-9,-rot,-rot+Math.PI*0.9); ctx.stroke();
      // core glow pulse
      const pulse=2+Math.sin(G.t*(locked?2:4)+p.x)*1.5;
      ctx.fillStyle=glow; ctx.globalAlpha=locked?0.5:0.9; ctx.beginPath(); ctx.arc(p.x,p.y,4+pulse,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      if(locked){ ctx.strokeStyle="#1a0d10"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(p.x-9,p.y-9); ctx.lineTo(p.x+9,p.y+9); ctx.stroke(); }
    }
    // deco (trees, rocks, chests) - sorted by y handled in entities pass for overlap; draw ground deco here
    // CAS-353: view-cull deco. The wilderness forest adds thousands of decorative props to
    // world.deco; only those overlapping the camera rect (+margin for tall trees ≤96px /
    // wide ≤64px, bottom-anchored) become a closure + get drawn/y-sorted each frame, so the
    // dense forest costs one cheap bounds test per prop instead of a draw call. Off-screen
    // props are skipped entirely. Margin is asymmetric: props above (smaller y) can be tall.
    const order=[];
    const tvm=world.tiledVisual?1:0; const vL=camX-48-(tvm?336:0), vR=camX+VW/Z+48+(tvm?336:0), vT=camY-120, vB=camY+VH/Z+24+(tvm?616:0); // CAS-462
    for(const d of world.deco){ if(d.x<vL||d.x>vR||d.y<vT||d.y>vB) continue;
      // CAS-1808: a sliced tileset cell (custom stamp carrying d.sw, CAS-1729) is a FLOOR
      // tile — draw it INLINE right here in the ground pass (this loop runs before
      // renderEntities) with the same 9-arg blit, so hero and mobs always y-sort ABOVE it.
      // A full-house fill of cells with y>hero.y no longer buries the hero. Full-sheet custom
      // stamps (no d.sw, CAS-1716) keep flowing into `order` below so an intentional prop
      // occluder still overlaps by depth (byte-identical to HEAD for non-tileset stamps).
      if(d.kind==="custom" && d.sw){ const img=customImg(d.asset);
        if(img&&img.complete&&img.naturalWidth){ const w=d.w||d.sw, h=d.h||d.sh;
          ctx.drawImage(img, d.sx, d.sy, d.sw, d.sh, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h)); }
        continue; }
      order.push({y:(d.kind&&d.kind.startsWith("tp:"))?d.y-16:d.y,draw:()=>{
      if(d.kind && d.kind.startsWith("tp:")){ let ei=+d.kind.slice(3);
        const fr=TDECO.anim&&TDECO.anim[ei]; if(fr&&fr.length) ei=fr[((G.t*7)|0)%fr.length]; // CAS-463
        const e=TDECO.entries[ei], pa=IMG.tiled_props;
        if(e&&pa&&pa.complete&&pa.naturalWidth) ctx.drawImage(pa,e[0],e[1],e[2],e[3],Math.round(d.x-e[2]/2),Math.round(d.y-e[3]),e[2],e[3]);
        return; }
      // CAS-1716: custom uploaded sprite (map editor stamp). Bottom-anchored at authored
      // w,h (falls back to the image's natural size). Guard skips a missing / not-yet-
      // decoded image silently — no crash, no console noise.
      if(d.kind==="custom"){ const img=customImg(d.asset); if(img&&img.complete&&img.naturalWidth){
          // CAS-1729: a sliced tileset cell carries a source sub-rect (d.sw). Blit only
          // that cell with the 9-arg drawImage; without d.sw fall back to the whole sheet
          // (CAS-1716 path) so a non-sliced stamp is byte-identical.
          if(d.sw){ const w=d.w||d.sw, h=d.h||d.sh;
            ctx.drawImage(img, d.sx, d.sy, d.sw, d.sh, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h)); }
          else { const w=d.w||img.naturalWidth, h=d.h||img.naturalHeight;
            ctx.drawImage(img, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h)); } }
        return; }
      if(d.kind && d.kind.startsWith("prop_")){ const img=IMG[d.kind]; if(img&&img.complete&&img.naturalWidth){
          const s=PROP_SCALE[d.kind]||1, w=img.naturalWidth*s, h=img.naturalHeight*s; ctx.drawImage(img, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h));
          if(d.kind==="prop_torch"){ const fy=d.y-h+10;
            // CAS-224 (Art): the Cripta Helada burns COLD. Frost braziers were the last
            // warm-amber fixture in the frozen biome (QA holdback on b-tiles); swap the
            // procedural flame + glow to blue-white frostfire so fixtures match the cold
            // palette. Other zones keep the warm torch. zoneOf is sim-derived (no RNG).
            const cold=zoneOf(world,d.x,d.y)==="frost";
            const fc=cold?"#57c4ec":COL.flame, fl=cold?"#dcf5ff":COL.flameL;
            ctx.fillStyle=fc; ctx.beginPath(); ctx.arc(d.x,fy,5+Math.sin(G.t*9+d.x)*1.5,0,6.28); ctx.fill();
            ctx.fillStyle=fl; ctx.beginPath(); ctx.arc(d.x,fy,2.5,0,6.28); ctx.fill();
            ctx.globalAlpha=0.18; ctx.fillStyle=fc; ctx.beginPath(); ctx.arc(d.x,fy,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
        } return; }
      const spr=SP[d.kind]; if(!spr) return; const px=d.kind==="tree"?4:3; blit(ctx,spr.rows,spr.pal,d.x,d.y-(d.kind==="tree"?18:0),px,false);
    }}); }
    for(const c of world.chests){ if(!c.opened) order.push({y:c.y,draw:()=>blit(ctx,SP.chest.rows,SP.chest.pal,c.x,c.y,3,false)}); }
    for(const f of world.fragments){ if(!f.taken) order.push({y:f.y,draw:()=>drawFragment(ctx,f.x,f.y,2,G.t)}); }
    for(const d of G.drops){ order.push({y:d.y,draw:()=>{ if(d.kind==="gold")drawCoin(ctx,d.x,d.y,2,G.t); else if(d.kind==="gear")drawGearDrop(d); else if(d.kind==="potionhp")drawPotion(ctx,d.x,d.y,2,COL.hpf,"#ff8a8a"); else drawPotion(ctx,d.x,d.y,2,COL.mpf,"#8ab8ff"); }}); }
    // CAS-1681: telegraphed zone-event POI markers (procedural, y-sorted, RNG-neutral — animated from
    // sim time only). Only ACTIVE POIs draw; nothing exists unless ZONE_EVENTS.enabled seeded them.
    if(G.zoneEvents&&G.zoneEvents.pois.length) for(const poi of G.zoneEvents.pois){ if(poi.state!=="active") continue; order.push({y:poi.y,draw:()=>drawZonePOI(poi)}); }
    G._decoOrder=order;
  }

  // looted gear on the ground: a rarity-coloured gem (readable at a glance, no
  // RNG — purely deterministic bob from sim time so it never perturbs the sim).
  function drawGearDrop(d){ const col=gearCol(d.inst); const bob=Math.sin(G.t*4+d.x*0.05)*2; const x=d.x, y=d.y-6+bob;
    ctx.globalAlpha=0.3; ctx.fillStyle="#000"; ctx.beginPath(); ctx.ellipse(d.x,d.y+4,7,3,0,0,6.28); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle="#0c0e12"; ctx.beginPath(); ctx.moveTo(x,y-9); ctx.lineTo(x+7,y); ctx.lineTo(x,y+9); ctx.lineTo(x-7,y); ctx.closePath(); ctx.fill();
    ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(x,y-7); ctx.lineTo(x+5,y); ctx.lineTo(x,y+7); ctx.lineTo(x-5,y); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.moveTo(x,y-7); ctx.lineTo(x+2,y-1); ctx.lineTo(x-2,y-1); ctx.closePath(); ctx.fill();
  }

  // CAS-1681: procedural zone-event POI marker (no new art). Shrine = rune pillar, chest = the shared
  // chest sprite with a gold glint, goblin = a coin beacon above the fleeing courier (the mob itself is
  // drawn by drawEnemy). An "!" beacon floats over any POI the hero hasn't yet approached (opt-in signal).
  function drawZonePOI(poi){ const x=poi.x, y=poi.y, t=G.t; const bob=Math.sin(t*3+x*0.05)*3;
    ctx.globalAlpha=0.3; ctx.fillStyle="#000"; ctx.beginPath(); ctx.ellipse(x,y+4,9,4,0,0,6.28); ctx.fill(); ctx.globalAlpha=1;
    if(poi.type==="shrine"){
      ctx.fillStyle="#3a2f52"; ctx.fillRect(x-7,y-20,14,20); ctx.fillStyle="#241b38"; ctx.fillRect(x-7,y-20,14,4);
      const pulse=2+Math.sin(t*4+x)*1.5; ctx.globalAlpha=0.9; ctx.fillStyle="#b07cff";
      ctx.beginPath(); ctx.arc(x,y-14,4+pulse,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      for(let i=0;i<3;i++){ const a=t*1.6+i*2.09; ctx.fillStyle="#dcc6ff"; ctx.fillRect(Math.round(x+Math.cos(a)*10-1),Math.round(y-14+Math.sin(a)*6-1),2,2); }
    } else if(poi.type==="chest"){
      if(SP.chest) blit(ctx,SP.chest.rows,SP.chest.pal,x,y,3,false); else { ctx.fillStyle="#caa14a"; ctx.fillRect(x-8,y-8,16,10); }
      const gl=Math.sin(t*5+x)*0.5+0.5; ctx.globalAlpha=0.4+gl*0.5; ctx.fillStyle="#ffe27a"; ctx.fillRect(x-1,y-11,2,2); ctx.globalAlpha=1;
    } else if(poi.type==="goblin"){
      drawCoin(ctx,x,y-28+bob,2,t);
    }
    if(!poi.seen){ const by=y-32+Math.sin(t*4)*2; ctx.fillStyle="#ffd24d"; ctx.fillRect(Math.round(x)-1,Math.round(by),2,7); ctx.fillRect(Math.round(x)-1,Math.round(by)+9,2,2); }
  }

  // CAS-1867: marcador de la MANCHA DE SANGRE (Corpse-Run) — $0 arte, 100% procedural. Charco rojo oscuro
  // (markerColor) con sombra elíptica + un destello/glifo pulsante animado SÓLO desde G.t (0 RNG, no perturba el
  // sim). Se dibuja world-space, y-sorted con las entidades. Gated: sólo cuando BLOODSTAIN.enabled && hay mancha
  // activa && su zona === la zona actual del héroe (llamador). OFF o sin mancha ⇒ nada ⇒ byte-idéntico.
  function drawBloodstain(bs){ const x=bs.x, y=bs.y, t=G.t;
    ctx.globalAlpha=0.3; ctx.fillStyle="#000"; ctx.beginPath(); ctx.ellipse(x,y+4,9,4,0,0,6.28); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=BLOODSTAIN.markerColor; ctx.beginPath(); ctx.ellipse(x,y+2,8,4,0,0,6.28); ctx.fill();
    ctx.fillStyle="#5a0000"; ctx.beginPath(); ctx.ellipse(x,y+2,5,2.5,0,0,6.28); ctx.fill();
    const pulse=0.5+Math.sin(t*4+x*0.05)*0.5; ctx.globalAlpha=0.35+pulse*0.5;
    ctx.fillStyle="#ff6b6b"; const gy=y-7-Math.sin(t*2)*2;
    ctx.fillRect(Math.round(x)-1,Math.round(gy),2,7); ctx.fillRect(Math.round(x)-3,Math.round(gy)+3,6,2); // cruz/destello
    ctx.globalAlpha=1;
  }

  // CAS-1873: guardia del ESCUDO/BLOQUEO — $0 arte, 100% procedural. Sector frontal (frontArcDeg centrado en h.facing)
  // en tono frío #bfe3ff + borde brillante, pulsando suave con G.t (0 RNG, no perturba el sim). Gated por el llamador
  // (SHIELD_BLOCK.enabled && h.blocking) ⇒ OFF / sin bloquear no dibuja nada ⇒ byte-idéntico.
  function drawGuard(h){ const cx=h.x, cy=h.y-14, r=22; const half=SHIELD_BLOCK.frontArcDeg*Math.PI/360;
    const a0=h.facing-half, a1=h.facing+half; const pulse=0.5+Math.sin(G.t*6)*0.5;
    ctx.save();
    ctx.globalAlpha=0.14+pulse*0.10; ctx.fillStyle="#bfe3ff";
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,a0,a1); ctx.closePath(); ctx.fill();
    ctx.globalAlpha=0.6+pulse*0.25; ctx.strokeStyle="#dff1ff"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,r,a0,a1); ctx.stroke();
    ctx.restore(); ctx.globalAlpha=1;
  }

  // CAS-2094: PELIGROS DE ARENA — $0 arte, 100% procedural. Máquina de fases telegraph→active→fade dibujada como un
  // marcador de SUELO (bajo las entidades: los mobs/héroe pisan encima) para que se lea como terreno. telegraph = anillo
  // pulsante + relleno translúcido CRECIENTE del tint (el aviso se intensifica hacia el instante activo, mirror
  // telegraphmark); active = relleno tintado + borde con pulso rápido ("duele AHORA"); fade = alpha decae a 0. Glyph
  // procedural centrado (mirror label afijo render.js:1442). Presentación pura, animada SÓLO de G.t (0 RNG, no perturba el
  // sim). Gated: OFF / sin hazards ⇒ no dibuja nada ⇒ byte-idéntico a HEAD.
  function drawHazards(){
    if(!ARENA_HAZARDS.enabled || !G.hazards.length) return;
    const A=ARENA_HAZARDS, t=G.t;
    // CAS-2398 (board 4d0caf74 "elimina esos circulos"): the hard ground DISC + stroked RING that read
    // as a "círculo de daño pintado en el suelo" is REMOVED. ARENA_HAZARDS is a SERVER-AUTHORITATIVE
    // damage zone (sim.js + config byte-idénticos: enabled:true, still daña), so per the North-Star
    // combat-legibility guardrail we do NOT blank it silently — we RE-STYLE it as a soft heat/miasma HAZE
    // (radial gradient, NO hard edge, NO stroke ⇒ reads as glow, not a drawn circle) + a pulsing ⚠ warning
    // glyph, so the danger footprint + "sal/rueda" read survive. Intensity ramps telegraph→active; fade
    // decays to 0. Presentation-only (G.t, 0 RNG). Tradeoff flagged to board in the CAS-2398 comment.
    const rgba=(hex,a)=>{ const n=parseInt(hex.slice(1),16); return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")"; };
    for(const hz of G.hazards){
      const def=hz.def||A.types[hz.type]||{}; const tint=def.tint||"#ff6a2a"; const x=hz.x, y=hz.y, r=hz.r;
      let intensity, glyphScale;
      if(hz.phase==="telegraph"){ const k=clamp(hz.t/A.telegraphMs,0,1); intensity=0.10+0.28*k; glyphScale=0.7+0.3*k; }   // el aviso se intensifica hacia el golpe
      else if(hz.phase==="active"){ const pulse=0.5+0.5*Math.abs(Math.sin(t*10)); intensity=0.34+0.16*pulse; glyphScale=1.0+0.08*pulse; } // "duele AHORA"
      else { const k=clamp(1-hz.t/A.fadeMs,0,1); intensity=0.30*k; glyphScale=1.0; }                                     // fade presentacional
      ctx.save();
      // soft haze: brightest at centre, fully transparent by the edge ⇒ NO hard circle silhouette
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0,rgba(tint,intensity)); g.addColorStop(0.6,rgba(tint,intensity*0.5)); g.addColorStop(1,rgba(tint,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();
      // pulsing warning glyph (⚠ + type glyph) — ahora el AVISO primario de peligro (el anillo ya no existe)
      if(hz.phase!=="fade"){
        ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
        const fs=Math.round(15*glyphScale);
        ctx.globalAlpha=0.9; ctx.font="bold "+fs+"px "+FF; ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.8)";
        ctx.strokeText("⚠", x, y-2); ctx.fillStyle="#ffdf6a"; ctx.fillText("⚠", x, y-2);
        if(A.markerLabel && def.glyph){ ctx.globalAlpha=0.85; ctx.font="bold 11px "+FF; ctx.fillStyle="#fff2d8";
          ctx.strokeText(def.glyph, x, y+12); ctx.fillText(def.glyph, x, y+12); }
      }
      ctx.restore();
    }
    ctx.globalAlpha=1; ctx.textBaseline="alphabetic";
  }

  function renderEntities(){
    const h=G.hero;
    drawHazards();   // CAS-2094: capa de suelo (bajo las entidades) — OFF/sin hazards ⇒ no-op byte-id
    const list=[];
    for(const o of G._decoOrder) list.push(o);
    // CAS-1867: la mancha de sangre entra en el y-sort SÓLO si su zona coincide con la del héroe (no se ve en otras zonas).
    if(BLOODSTAIN.enabled && G.bloodstain && G.bloodstain.zone===zoneOf(world,h.x,h.y)) list.push({y:G.bloodstain.y,draw:()=>drawBloodstain(G.bloodstain)});
    for(const e of G.enemies) list.push({y:e.y,draw:()=>drawEnemy(e)});
    // CAS-1954: el ESPÍRITU invocado entra en el y-sort SÓLO cuando SUMMON.enabled && vivo ⇒ OFF / sin espíritu no dibuja nada ⇒ byte-idéntico.
    if(SUMMON.enabled && G._spirit && G._spirit.hp>0) list.push({y:G._spirit.y,draw:()=>drawSpirit(G._spirit)});
    for(const c of G.corpses) list.push({y:c.y,draw:()=>drawCorpse(c)}); // CAS-317: dragon death-anim corpses, y-sorted with the living
    for(const n of world.npcs) list.push({y:n.y,draw:()=>drawNPC(n)});
    list.push({y:h.y,draw:()=>drawHero(h)});
    list.sort((a,b)=>a.y-b.y);
    for(const o of list) o.draw();
    // CAS-1847: reticle del ENFOQUE DE OBJETIVO (Lock-On) — $0 arte, 100% procedural. Anillo + 4 chevrones
    // rotando con G.t alrededor del enemigo enfocado. Gated LOCK_ON.enabled && h.lockTarget (vivo) ⇒ OFF o sin
    // lock no dibuja nada ⇒ byte-idéntico. Se dibuja tras las entidades para leer por encima del sprite enemigo.
    if(LOCK_ON.enabled && h.lockTarget && !h.lockTarget.dead) drawLockReticle(h.lockTarget);
    // CAS-1873: arco de guardia frontal cuando el ESCUDO/BLOQUEO está arriba — se dibuja tras las entidades para leer
    // sobre el sprite del héroe. Gated ⇒ OFF / sin bloquear no dibuja nada ⇒ byte-idéntico.
    if(SHIELD_BLOCK.enabled && h.blocking) drawGuard(h);
    // projectiles + fx on top
    for(const f of G.fields) drawField(f);
    for(const p of G.projectiles) drawProjectile(p);
    for(const f of G.fx) drawFx(f);
    // CAS-127: damage numbers POP — a brief over-scale on spawn (eased down over ~0.16s)
    // then settle. Crits pop biggest; DoT/status ticks render small + status-coloured.
    // Pure presentation off pooled floater flags; no allocation, no sim state touched.
    for(const f of G.floaters){ const k=clamp(1-f.t/f.life,0,1); ctx.globalAlpha=k;
      // CAS-1614: bigger, bolder damage numbers so dense combat stays readable. Crits SUSTAIN a
      // 20px read (not just the transient spawn-pop), normal hits 15px, DoT/status ticks 12px —
      // so a crit is distinguishable by size even after the pop settles. Per-type hue rides on
      // f.col (unchanged). reduceMotion drops the spawn-pop overshoot (crit stays big via base
      // size, so the readability cue survives without the motion).
      const base=f.crit?20:(f.small?12:15);
      const pk=(!G.settings.reduceMotion && f.pop&&f.pop>1)?1+(f.pop-1)*clamp(1-f.t/0.16,0,1):1; const sz=Math.round(base*pk);
      // CAS-265: in colour-blind mode crits carry a "!" shape cue (the size-pop already
      // reads big), so a crit is distinguishable from a normal hit without relying on hue.
      const txt=(cb()&&f.crit)?("!"+f.txt):f.txt;
      ctx.font="bold "+sz+"px "+FF; ctx.textAlign="center";
      // CAS-273: apply the spawn-time anti-overlap lane offset (f.dx) so stacked numbers fan out.
      const fx=f.x+(f.dx||0);
      // CAS-1614: 2px near-black (#0a0c10 = COL.out) drop shadow keeps numbers legible over bright
      // terrain and busy VFX (was a 1px shadow).
      ctx.fillStyle=COL.out; ctx.fillText(txt,fx+2,f.y+2); ctx.fillStyle=f.col; ctx.fillText(txt,fx,f.y); ctx.globalAlpha=1; }
  }

  // CAS-1847: reticle procedural del ENFOQUE DE OBJETIVO — $0 arte. Anillo pulsante + 4 chevrones que rotan con
  // G.t alrededor del objetivo enfocado, en LOCK_ON.reticleCol. Sin assets, sin RNG (todo derivado de G.t/geometría).
  function drawLockReticle(e){
    const cx=e.x, cy=e.y-((e.tpl&&e.tpl.size)||14)*0.4;
    const r=((e.tpl&&e.tpl.size)||14)*1.15 + 6;
    const col=LOCK_ON.reticleCol||"#ffd15c";
    ctx.save();
    // anillo (pulso suave con G.t)
    ctx.globalAlpha=0.55+0.2*Math.sin(G.t*4);
    ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,6.283); ctx.stroke();
    // 4 chevrones rotando
    ctx.globalAlpha=0.9;
    const rot=G.t*1.4, cr=r+4, len=5;
    for(let k=0;k<4;k++){ const a=rot+k*(Math.PI/2);
      const px=cx+Math.cos(a)*cr, py=cy+Math.sin(a)*cr;
      // pequeño chevrón "<" apuntando hacia el centro (tangente ± a la radial)
      const ta=a+Math.PI;               // hacia el centro
      const b1=ta+0.55, b2=ta-0.55;
      ctx.beginPath();
      ctx.moveTo(px+Math.cos(b1)*len, py+Math.sin(b1)*len);
      ctx.lineTo(px, py);
      ctx.lineTo(px+Math.cos(b2)*len, py+Math.sin(b2)*len);
      ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha=1;
  }

  // CAS-1954: dibuja el ESPÍRITU invocado — $0 arte, 100% procedural. Reusa el sprite del molde (drawEnemy) con ALPHA espectral +
  // tinte cian aditivo (idiom "lighter"/halo de render.js:1141) para leerlo como aliado etéreo, y añade anillo de suelo + pip de HP +
  // timer sutil sobre la cabeza. Sin assets nuevos, sin RNG, sin estado del sim mutado. Sólo se llama gated (SUMMON.enabled && vivo).
  function drawSpirit(sp){ const sc=SUMMON.spirit, tint=sc.tint, sz=(sp.tpl&&sp.tpl.size)||18;
    // halo espectral aditivo + anillo de suelo cian pulsante (marca "aliado", distinto de las auras enemigas)
    ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.14+0.06*(0.5+0.5*Math.sin(G.t*4));
    ctx.fillStyle=tint; ctx.beginPath(); ctx.arc(sp.x,sp.y-sz*0.4,sz*1.05,0,6.28); ctx.fill();
    ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=0.5; ctx.strokeStyle=tint; ctx.lineWidth=2;
    const pr=sz*1.15+Math.sin(G.t*4)*2; ctx.beginPath(); ctx.ellipse(sp.x,sp.y+sz*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
    ctx.restore();
    // sprite del molde con ALPHA espectral (la blit procedural interior hereda este globalAlpha)
    ctx.save(); ctx.globalAlpha=sc.alpha; drawEnemy(sp); ctx.restore();
    // tinte cian aditivo sobre la masa del sprite (source render.js:901/1141: lighter) — lo "espectraliza" sin arte nuevo
    ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.22; ctx.fillStyle=tint;
    ctx.beginPath(); ctx.arc(sp.x,sp.y-sz*0.4,sz*0.9,0,6.28); ctx.fill(); ctx.restore();
    // barra/pip de HP (cian) + timer sutil sobre la cabeza
    const w=sz*1.4, x0=sp.x-w/2, y0=sp.y-sz-10;
    const hpF=Math.max(0,Math.min(1,sp.hp/sp.maxHp)), tF=Math.max(0,Math.min(1,sp.life/(SUMMON.summonMs/1000)));
    ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle="#10141c"; ctx.fillRect(x0-1,y0-1,w+2,5);
    ctx.fillStyle=tint; ctx.fillRect(x0,y0,w*hpF,2);
    ctx.globalAlpha=0.6; ctx.fillStyle="#cfe9ff"; ctx.fillRect(x0,y0+2.6,w*tF,1.2);   // vida restante (timer)
    ctx.restore(); ctx.globalAlpha=1;
  }

  function drawHero(h){
    const cls=h.cls||"warrior", feet=h.y+18, st=h.animState;
    // CAS-92: pick the Higgsfield animation strip from the sim's anim state.
    const state=(st==="attack")?"attack":(st==="roll")?"roll":(st==="walk")?"walk":"idle";
    const def=HERO_STRIPS[state];
    const ang=(st==="attack")?h.atkAng:((st==="roll"&&(h.rollX||h.rollY))?Math.atan2(h.rollY,h.rollX):h.facing);
    // walk loops; attack/roll play their frames once across their sim duration; idle holds.
    const fps=(state==="walk")?9:(state==="attack")?(def.fc/Math.max(0.15,CFG.atkCD)):(state==="roll")?(def.fc/Math.max(0.12,CFG.rollTime||0.2)):2;
    const loop=(state==="walk");
    let fi=Math.floor((h.animT||0)*fps); fi=loop?(fi%def.fc):Math.min(fi,def.fc-1);
    if(h.rolling){ ctx.globalAlpha=0.35; ctx.fillStyle="#aeb6c2"; ctx.beginPath(); ctx.arc(h.x,h.y+4,15,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      // CAS-1619: procedural DIRECTIONAL dash streak. The warrior_dash8 sprite bakes its
      // whoosh HORIZONTAL in every direction row (frames 0-3), so N/S/diagonal dashes read
      // as an E-O streak. We suppress those baked frames in drawHeroClass and draw the streak
      // here, oriented along the real dash vector (rollX,rollY) → all 8 directions. Additive,
      // gated on !reduceMotion, derived from rollT/rollTime only (no RNG, no sim mutation → Stage-2 safe).
      if(!G.settings.reduceMotion && (h.rollX||h.rollY)){
        const ra=Math.atan2(h.rollY,h.rollX), c=Math.cos(ra), s=Math.sin(ra);
        const fade=clamp((h.rollT||0)/Math.max(0.12,CFG.rollTime||0.2),0,1); // 1→0 across the dash (strongest at start)
        const cx0=h.x, cy0=h.y-6, len=34+18*fade;   // torso anchor; trail toward -dash
        ctx.save(); ctx.globalCompositeOperation="lighter";
        for(let i=0;i<3;i++){ const off=(i-1)*4, nx=-s*off, ny=c*off; // 3 stacked lines = streak body
          const g=ctx.createLinearGradient(cx0+nx,cy0+ny, cx0-c*len+nx, cy0-s*len+ny);
          g.addColorStop(0,`rgba(255,224,138,${0.55*fade})`);
          g.addColorStop(0.5,`rgba(255,176,71,${0.28*fade})`);
          g.addColorStop(1,"rgba(255,176,71,0)");
          ctx.strokeStyle=g; ctx.lineWidth=(i===1?5:2.4); ctx.lineCap="round";
          ctx.beginPath(); ctx.moveTo(cx0+nx,cy0+ny); ctx.lineTo(cx0-c*len+nx,cy0-s*len+ny); ctx.stroke(); }
        ctx.restore();
      }
    }
    // CAS-1785: PARADA CON TEMPO — a subtle golden glint ring around the hero while the parry window is
    // LIVE (h.parryT>0), so the read is legible ($0 art, procedural). Additive-lit, gated on !reduceMotion;
    // derived only from parryT (no RNG, no sim mutation) → Stage-2 safe. Absent when the feature is off
    // (parryT stays 0) or the window has lapsed.
    if(h.parryT>0 && !h.dead && !G.settings.reduceMotion){
      const a=clamp(h.parryT/0.15,0,1);             // 1→0 across the window (brightest at the read)
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.5*a+0.2;
      ctx.strokeStyle="#ffe27a"; ctx.lineWidth=2; ctx.beginPath();
      ctx.arc(h.x,h.y+2,15+3*(1-a),0,6.28); ctx.stroke();
      ctx.globalAlpha=0.28*a; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(h.x,h.y+2,15+3*(1-a),0,6.28); ctx.stroke();
      ctx.restore();
    }
    // CAS-2133: WINDUP DE CARGA — medidor visual de la carga en torno al héroe (h.charging && h.chargeT > 0).
    // Anillo dorado que crece con h.chargeT hasta chargeThresholdMs; al cruzar el umbral destella ("listo").
    // Procedural $0 arte, additive-lit; gated en CHARGED_ATTACK.enabled + !dead + !reduceMotion.
    // Derivado sólo de h.charging/h.chargeT (no RNG, no mutación sim) → Stage-2 safe. OFF ⇒ rama muerta ⇒ byte-id.
    if(CHARGED_ATTACK.enabled && h.charging && (h.chargeT||0)>0 && !h.dead && !G.settings.reduceMotion){
      const frac=Math.min((h.chargeT*1000)/CHARGED_ATTACK.chargeThresholdMs, 1);  // 0→1 hacia el umbral; >1 posible si sigue cargando
      const ready=frac>=1;
      const pulse=ready?(0.7+0.3*Math.sin(G.t*18)):0;   // parpadeo rápido al estar "listo"
      const alpha=ready?(0.7+pulse*0.25):(0.25+frac*0.45);
      const r=16+frac*6;                                  // anillo crece con la carga
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.strokeStyle=ready?"#ffee44":"#ffc840"; ctx.lineWidth=ready?3:2;
      ctx.globalAlpha=alpha; ctx.beginPath(); ctx.arc(h.x,h.y+2,r,0,6.28); ctx.stroke();
      if(ready){ ctx.globalAlpha=alpha*0.35; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(h.x,h.y+2,r+4,0,6.28); ctx.stroke(); }
      ctx.restore();
    }
    // CAS-1814: ESQUIVA RODANTE — a legible INVULNERABILITY aura during a roll's i-frame window: a soft
    // cyan/white ghost tint + a shimmer ring that reads clearly "you are invulnerable now". Procedural
    // ($0 art), additive-lit, reuses the streak machinery; gated on DODGE.enabled + an ACTIVE roll's
    // i-frame (h.rolling && h.iframe>0) + !reduceMotion. Derived only from h.iframe (no RNG, no sim
    // mutation) → Stage-2 safe. OFF (DODGE.enabled=false) ⇒ this block never runs ⇒ only the generic
    // flicker below remains (roll render byte-identical to HEAD).
    if(DODGE.enabled && h.rolling && h.iframe>0 && !h.dead && !G.settings.reduceMotion){
      const a=clamp((h.iframe||0)/Math.max(0.05,DODGE.iframeMs/1000),0,1); // 1→0 across the invuln window
      ctx.save(); ctx.globalCompositeOperation="lighter";
      const gr=ctx.createRadialGradient(h.x,h.y+2,2,h.x,h.y+2,17);      // ghost tint over the hero
      gr.addColorStop(0,`rgba(210,245,255,${0.30*a+0.05})`);
      gr.addColorStop(0.6,`rgba(120,220,255,${0.16*a})`);
      gr.addColorStop(1,"rgba(120,220,255,0)");
      ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(h.x,h.y+2,17,0,6.28); ctx.fill();
      const rr=14+4*(1-a);                                             // shimmer ring, expands as it fades
      ctx.strokeStyle=`rgba(190,240,255,${0.55*a+0.12})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(h.x,h.y+2,rr,0,6.28); ctx.stroke();
      ctx.strokeStyle=`rgba(255,255,255,${0.30*a})`; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(h.x,h.y+2,rr+3,0,6.28); ctx.stroke();
      ctx.restore();
    }
    if(h.iframe>0 && !h.dead && Math.floor(G.t*20)%2===0) ctx.globalAlpha=0.45;
    const flip=Math.cos(ang)<0, tint=h.hurtFlash>0?"#ffffff":(h._wbuff&&h.wbuffT>0&&WEAPON_BUFFS&&WEAPON_BUFFS.types[h._wbuff])?(WEAPON_BUFFS.types[h._wbuff].tint):null; // CAS-1926: tinte del color de la resina activa (hurtFlash tiene prioridad); OFF / sin buff ⇒ null ⇒ byte-id
    const bob=(state==="idle")?Math.sin(G.t*2)*1.2:0;   // gentle idle breathing only
    // CAS-97: procedural movement feel for the single-pose class hero — same
    // hop/squash/lunge/breathing as the CAS-82 hooded hero. Deterministic, derived
    // from sim time / animT (no render RNG, no per-frame allocation) → Stage-2 safe.
    const phase=(h.animT||0)*(h.rolling?16:9);
    let sqX=1, sqY=1, bobUp=0, hx=h.x, hfeet=feet;
    if(state==="walk"||state==="roll"){
      bobUp=Math.abs(Math.sin(phase))*3;            // footfall hops
      const land=Math.max(0,-Math.sin(phase*2));    // squash on landing
      sqX=1+0.06*land; sqY=1-0.06*land;
    } else if(state==="attack"){
      const prog=clamp((h.animT||0)/Math.max(0.15,CFG.atkCD),0,1), pop=Math.sin(prog*Math.PI);
      hx=h.x+Math.cos(h.atkAng)*pop*5; hfeet=feet+Math.sin(h.atkAng)*pop*2.5;  // lunge
      sqY=1+0.09*pop; sqX=1-0.05*pop;               // stretch into the strike
    } else { bobUp=Math.sin(G.t*2)*0.6; sqY=1+0.012*Math.sin(G.t*2); }  // idle breathing
    // CAS-223: the per-class strip is now state-driven inside drawHeroClass (idle/walk
    // for all classes + attack/death for Clarice). Pass the sim state (dead overrides).
    // CAS-256: special (skill cast) + hurt (hit-react) are real sim animStates that
    // drive their own Clarice strips; pass them straight through. They map to the idle
    // procedural feel above (no special lunge), and gate on a loaded strip in drawHeroClass
    // so non-warrior classes / the hooded hero keep their prior look unchanged.
    const cstate=h.dead?"dead":(st==="special"||st==="hurt")?st:state;
    // CAS-199: class-flavoured idle AURA under the hero (colour = the player's sash
    // accent, so it differs per class/customisation). Soft additive ground glow that
    // breathes — brings the sprite to life without touching the art. Drawn BEHIND.
    if(!h.dead && h.palette){
      const ac=h.palette.sash||h.palette.cloak||[180,200,255], pulse=0.5+0.5*Math.sin(G.t*2.2);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      const gx=h.x, gy=feet-7, rg=ctx.createRadialGradient(gx,gy,1,gx,gy,17);
      rg.addColorStop(0,`rgba(${ac[0]},${ac[1]},${ac[2]},${0.14+0.10*pulse})`); rg.addColorStop(1,`rgba(${ac[0]},${ac[1]},${ac[2]},0)`);
      ctx.fillStyle=rg; ctx.beginPath(); ctx.ellipse(gx,gy,17,19,0,0,6.283); ctx.fill(); ctx.restore();
    }
    // CAS-2208: PIXELART master A/B gate. When spritesEnabled===false the entire sprite chain is
    // short-circuited (ok=false) so the procedural `blit(SP.hero…)` fallback below runs. Default
    // true ⇒ the chain evaluates exactly as before (byte-identical LIVE).
    const ok=PIXELART.spritesEnabled && (
             drawHeroClass(CLASS_HERO_ART[cls],cstate,h.animT||0,hx,hfeet,flip,sqX,sqY,bobUp,tint,ang) // CAS-98/110/223 state-driven class anim; CAS-333 ang→8-dir row
          || drawHeroAnim(def.img,fi,h.x,feet,flip,tint,bob)                     // hooded anim fallback
          || drawHeroErw(h.x,feet,flip,1,1,0,tint)       // hooded pose until strips load
          || drawClassFrame(ctx,cls,(state==="roll")?"walk":state,dir4FromAngle(ang),fi,h.x,feet,HERO_SPRITE_SCALE,tint));
    ctx.globalAlpha=1;
    if(!ok){ const b2=h.walkT?Math.sin(h.walkT)*2:0; blit(ctx,SP.hero.rows, h.hurtFlash>0?redden(SP.hero.pal):SP.hero.pal, h.x,h.y-12-b2,3, Math.cos(h.facing)<0); }
    // CAS-2202: el PUNTO AMARILLO de dirección/apuntado (dot dorado a facing*18 enfrente del héroe) queda RETIRADO
    // por pedido del board (CAS-2201: "elimina ese ángulo de dirección… también el punto amarillo"). Presentación pura:
    // era el único overlay de facing SIEMPRE-visible que "sale enfrente del personaje". El facing interno (h.facing) sigue
    // intacto — sólo desaparece el dibujado. Reversible (revert-on-fail): re-descomentar restaura el marcador byte-idéntico.
    // if(!h.dead){ ctx.globalAlpha=0.8; ctx.fillStyle=COL.textGold; const fx=h.x+Math.cos(h.facing)*18, fy=h.y-2+Math.sin(h.facing)*18; ctx.fillRect(fx-1.5,fy-1.5,3,3); ctx.globalAlpha=1; }
    if(!h.dead) drawStatusFx(h, h.x, h.y+14, h.y-40); // CAS-118: the hero shows its own afflictions (aura + pips above head)
    // CAS-199: 3 floating motes orbiting the hero (class-accent colour), in FRONT for
    // depth. Off when reduce-motion is on. Pure presentation, derived from G.t.
    if(!h.dead && h.palette && !G.settings.reduceMotion){
      const ac=h.palette.sash||h.palette.cloak||[200,220,255];
      ctx.save(); ctx.globalCompositeOperation="lighter";
      for(let k=0;k<3;k++){ const a=G.t*1.1+k*2.094;
        const mx=h.x+Math.cos(a)*9, my=feet-22-5*Math.sin(G.t*1.6+k*1.3)-k*2, al=0.30+0.28*Math.sin(G.t*2.4+k*1.7);
        if(al>0){ ctx.fillStyle=`rgba(${ac[0]},${ac[1]},${ac[2]},${al})`; ctx.fillRect(mx-1,my-1,2,2); } }
      ctx.restore();
    }
    // CAS-2278: TÍTULO DE RENOMBRE sobre el nameplate del héroe (capa social MMO — en Stage-2 otros jugadores lo ven en el mundo
    // compartido; Stage-1 lo lleva el héroe local). Texto puro violeta ($0 arte), anclado sobre la cabeza (encima de los pips de
    // estado). Derivado puro de h.sanctuaryRewards (renownTitleOf; 0 sim/RNG). Gated ⇒ OFF / sin rewards ⇒ "" ⇒ nada dibuja ⇒ byte-id.
    if(!h.dead && SANCTUARY_REWARDS.enabled){ const rt=renownTitleOf(h);
      if(rt){ ctx.save(); ctx.globalAlpha=0.92; ctx.font="bold 9px "+FF; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
        const ty=h.y-52; ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.8)"; ctx.strokeText("«"+rt+"»",h.x,ty);
        ctx.fillStyle="#d9b8ff"; ctx.fillText("«"+rt+"»",h.x,ty); ctx.restore(); } }
    // CAS-2295: TAG DE ORDEN (Sanctuary Oath) sobre el nameplate — reusa la MISMA ruta de render que el título de renombre (capa
    // social MMO: en Stage-2 otros jugadores lo ven en el mundo compartido; Stage-1 lo lleva el héroe local). Texto puro verde-jade
    // ($0 arte), anclado SOBRE el título de renombre. Derivado puro de h.sanctuaryOath (oathTagOf; 0 sim/RNG). Gated ⇒ OFF / sin
    // juramento ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD.
    if(!h.dead && SANCTUARY_OATH.enabled){ const ot=oathTagOf(h);
      if(ot){ ctx.save(); ctx.globalAlpha=0.92; ctx.font="bold 9px "+FF; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
        const ty=h.y-62; ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.8)"; ctx.strokeText("⟦"+ot+"⟧",h.x,ty);
        ctx.fillStyle="#8fe0b0"; ctx.fillText("⟦"+ot+"⟧",h.x,ty);
        // CAS-2300: LIBRO DE LA ORDEN — ★ dorada junto al tag de orden cuando la orden CRUZÓ el objetivo colectivo esta semana (pasivo
        // "en racha"). Estado AUTORITATIVO del sim (sim.sanctuaryLedgerTag; 0 duplicación de lógica, capa social MMO). Gated ⇒ OFF /
        // sin racha ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD. Anclada al ancho del tag para no solaparse.
        if(SANCTUARY_LEDGER.enabled && sim.sanctuaryLedgerTag(h)){ const tw=ctx.measureText("⟦"+ot+"⟧").width;
          ctx.strokeText("★",h.x+tw/2+7,ty); ctx.fillStyle="#ffcf5c"; ctx.fillText("★",h.x+tw/2+7,ty); }
        // CAS-2305: CLASIFICACIÓN DE ÓRDENES — ♛ ámbar cuando la orden del héroe LIDERA la clasificación semanal del shard (pasivo del
        // líder activo). Estado AUTORITATIVO del sim (sim.sanctuaryStandingsTag; 0 duplicación de lógica, capa social MMO — en Stage-2
        // otros ven qué orden domina el realm). Gated ⇒ OFF / sin liderazgo ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD. Anclada a la
        // DERECHA de la ★ (o del tag si no hay racha) para no solaparse.
        if(ORDER_STANDINGS.enabled && sim.sanctuaryStandingsTag(h)){ const tw=ctx.measureText("⟦"+ot+"⟧").width;
          const cx=h.x+tw/2+7+((SANCTUARY_LEDGER.enabled&&sim.sanctuaryLedgerTag(h))?12:0);
          ctx.strokeText("♛",cx,ty); ctx.fillStyle="#ffc16a"; ctx.fillText("♛",cx,ty); }
        // CAS-2316: COMPAÑEROS DE RUTA — ∞ turquesa cuando la HERMANDAD del héroe está FORJADA (pasivo de vínculo activo). Estado AUTORITATIVO
        // del sim (sim.fellowshipTag; 0 duplicación de lógica, capa social MMO). Gated ⇒ OFF / sin forjar ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a
        // HEAD. Anclada a la DERECHA de la ♛/★ (o del tag) para no solaparse con los glifos de Orden.
        if(FELLOWSHIP_BOND.enabled && sim.fellowshipTag(h)){ const tw=ctx.measureText("⟦"+ot+"⟧").width;
          const fx=h.x+tw/2+7+((SANCTUARY_LEDGER.enabled&&sim.sanctuaryLedgerTag(h))?12:0)+((ORDER_STANDINGS.enabled&&sim.sanctuaryStandingsTag(h))?12:0);
          ctx.strokeText("∞",fx,ty); ctx.fillStyle="#7fe6d8"; ctx.fillText("∞",fx,ty); }
        ctx.restore(); } }
    // CAS-2322: VÍNCULO DE MENTOR — glifo ⚜ (mentor, oro) / ✦ (protégé, violeta) sobre el nameplate cuando el par está LIGADO. INDEPENDIENTE de la
    // Orden (el vínculo veterano↔novato no requiere Juramento) ⇒ bloque PROPIO anclado SOBRE el tag de Orden. Estado AUTORITATIVO del sim
    // (sim.mentorBondTag; 0 duplicación de lógica, capa social MMO). Gated ⇒ OFF / no ligado ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD.
    if(!h.dead && MENTOR_BOND.enabled){ const mg=sim.mentorBondTag(h);
      if(mg){ ctx.save(); ctx.globalAlpha=0.92; ctx.font="bold 11px "+FF; ctx.textAlign="center"; ctx.textBaseline="alphabetic";
        const ty=h.y-72; ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.8)"; ctx.strokeText(mg,h.x,ty);
        ctx.fillStyle=(mg==="⚜")?"#e8c877":"#c8b3ff"; ctx.fillText(mg,h.x,ty); ctx.restore(); } }
  }
  // CAS-92: draw one frame of a hero animation strip. Every frame is HERO_FW×HERO_FH;
  // source column HERO_AX (body centroid) maps to world hx and source row HERO_FOOT
  // (feet) maps to world feet, so the body never jitters between frames or states.
  // Scaled by HERO_ANIM_SCALE (size revert), nearest-neighbor, optional hurt tint.
  function drawHeroAnim(strip,fi,hx,feet,flip,tint,bob){
    const img=IMG[strip]; if(!img||!img.complete||!img.naturalWidth) return false;
    const S=HERO_ANIM_SCALE, dw=HERO_FW*S, dh=HERO_FH*S, sx=fi*HERO_FW;
    let src=img, ssx=sx, ssy=0;
    if(tint && _heroBx){ _heroBuf.width=HERO_FW; _heroBuf.height=HERO_FH;
      _heroBx.clearRect(0,0,HERO_FW,HERO_FH); _heroBx.imageSmoothingEnabled=false;
      _heroBx.globalCompositeOperation="source-over"; _heroBx.drawImage(img,sx,0,HERO_FW,HERO_FH,0,0,HERO_FW,HERO_FH);
      _heroBx.globalCompositeOperation="source-atop"; _heroBx.globalAlpha=0.85; _heroBx.fillStyle=tint; _heroBx.fillRect(0,0,HERO_FW,HERO_FH);
      _heroBx.globalAlpha=1; _heroBx.globalCompositeOperation="source-over";
      src=_heroBuf; ssx=0; ssy=0; }
    const dy=feet-HERO_FOOT*S-(bob||0);
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ const dx=hx-(HERO_FW-HERO_AX)*S; ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(src,ssx,ssy,HERO_FW,HERO_FH,0,0,dw,dh); }
    else { const dx=hx-HERO_AX*S; ctx.drawImage(src,ssx,ssy,HERO_FW,HERO_FH,dx,dy,dw,dh); }
    ctx.restore(); return true;
  }
  // CAS-98: draw frame `fi` of the selected class's animated idle loop from its
  // shared CLASS_FW×CLASS_FH cell (column fi*CLASS_FW), bottom-anchored at
  // (cx,feet) on the CLASS_FOOT baseline, centred on the lower-body centroid
  // (CLASS_AX), nearest-neighbor, with squash (sqX/sqY) + hop (bobUp) applied and
  // an optional silhouette tint (hurt flash). Scaled by CLASS_ANIM_SCALE → ~50px
  // (CAS-92 final size). Returns false until the strip loads (or for a class with
  // no art), so drawHero falls back to the hooded anim.
  // CAS-223: state-driven. `state` is the sim animState mapped to a strip:
  //   dead   → clsdeath_* (Clarice; play once, hold last frame)
  //   attack → clsattack_* (Clarice; play once across the swing)
  //   walk   → clswalk_*  (8-frame gait, all classes)
  //   else   → clshero_*  idle loop (also the fallback for roll / for classes that have
  //            no attack/death strip — preserves the prior CAS-98/110 behaviour exactly).
  // The attack/death branches only fire when that strip is loaded, so the four hooded
  // classes (no such file) keep their old look with zero change.
  function drawHeroClass(art,state,animT,cx,feet,flip,sqX,sqY,bobUp,tint,ang){
    if(!art) return false;
    const has=k=>{ const m=IMG[k]; return m&&m.complete&&m.naturalWidth; };
    // CAS-333 (CAS-301a): `rows`/`row` carry the 8-direction strip layout (8 stacked rows,
    // pick row by facing bucket); legacy single-facing strips keep rows=1,row=0. `flipOff`
    // suppresses the horizontal flip for 8-dir strips (every facing is real art).
    let key,fc,fi,rows=1,row=0,flipOff=false;
    if(state==="dead" && has("clsdeath_"+art)){
      key="clsdeath_"+art; fc=CLASS_DEATH_FC; fi=Math.min(fc-1,Math.floor((animT||0)*(fc/CLASS_DEATH_DUR)));
    } else if(state==="special" && has("clsspecial_"+art)){
      // CAS-256: skill/ability cast — play the 8f special strip once across its duration.
      key="clsspecial_"+art; fc=CLASS_SPECIAL_FC; fi=Math.min(fc-1,Math.floor((animT||0)*(fc/CLASS_SPECIAL_DUR)));
    } else if(state==="hurt" && has("clshurt_"+art)){
      // CAS-256: hit-react flinch — play the 6f hurt strip once across its duration.
      key="clshurt_"+art; fc=CLASS_HURT_FC; fi=Math.min(fc-1,Math.floor((animT||0)*(fc/CLASS_HURT_DUR)));
    } else if(state==="attack" && has("clsattack_"+art)){
      key="clsattack_"+art; fc=CLASS_ATTACK_FC; fi=Math.min(fc-1,Math.floor((animT||0)*(fc/Math.max(0.15,CFG.atkCD))));
    } else if(state==="roll" && has("clsdash8_"+art)){
      // CAS-345a (CAS-357): 8-DIRECTION dodge-roll dash (warrior). 9f lunge played once across
      // the roll; row = dash heading bucket (the call site passes ang=atan2(rollY,rollX) during
      // a roll). Real per-facing art → flip suppressed. Gated FIRST so it wins over the single-
      // dir clsdash_ strip; non-warrior / missing file falls through to clsdash_ then idle-roll.
      // CAS-1619: the 8 rows ARE distinct per-facing character art (E/W are mirror bakes —
      // verified: distinct row hashes), so the CHARACTER already rotates. The "solo E-O" bug
      // is that frames 0-3 of EVERY row bake a HORIZONTAL whoosh streak. Fix: keep the per-row
      // character (row=dir8FromAngle) and SKIP the baked streak frames 0-3 (play only the
      // character frames 4-7); the directional streak is drawn procedurally in drawHero along
      // the real dash vector. Rotating the whole cell (an earlier attempt) would tilt the
      // upright character 90° when dashing N/S — rejected.
      key="clsdash8_"+art; fc=CLASS_DASH8_FC; rows=8; row=dir8FromAngle(ang||0); flipOff=true;
      { const prog=Math.min(1,(animT||0)/Math.max(0.12, CFG.rollTime||0.2));
        fi=Math.min(fc-1, 4+Math.floor(prog*(fc-4))); }
    } else if(state==="roll" && has("clsdash_"+art)){
      // CAS-329: dodge-roll dash — play the 8f dash strip once across the roll duration.
      // Gated on the strip so non-warrior classes keep today's idle-loop roll (regression-safe).
      key="clsdash_"+art; fc=CLASS_DASH_FC; fi=Math.min(fc-1, Math.floor((animT||0)*(fc/Math.max(0.12, CFG.rollTime||0.2))));
    } else if(state==="walk" && has("clswalk8_"+art)){
      // CAS-333 (CAS-301a): 8-direction walk. Row = facing bucket; CLASS_WALK8_FC-frame cycle
      // looped at CLASS_WALK8_FPS. fw is read as naturalWidth/fc below (no hard-coded 140). Real
      // facing art → no flip. Falls through to the legacy clswalk_ strip if the file is absent.
      key="clswalk8_"+art; fc=CLASS_WALK8_FC; fi=Math.floor(G.t*CLASS_WALK8_FPS)%fc;
      rows=8; row=dir8FromAngle(ang||0); flipOff=true;
    } else if(state==="walk" && has("clswalk_"+art)){
      key="clswalk_"+art; fc=CLASS_WALK_FC; fi=Math.floor(G.t*CLASS_WALK_FPS)%fc;
    } else if(state==="idle" && has("clsidle8_"+art)){
      // CAS-333 (CAS-301a): 8-direction idle — single held pose per row, selected by the
      // hero's last facing. The procedural breathe/bob/squash from drawHero still applies.
      key="clsidle8_"+art; fc=CLASS_IDLE8_FC; fi=0;
      rows=8; row=dir8FromAngle(ang||0); flipOff=true;
    } else {
      key="clshero_"+art; if(!has(key)) return false;
      fc=CLASS_FC; const lf=(state==="attack")?9:(state==="roll")?11:2.6; fi=Math.floor(G.t*lf)%fc;
    }
    const img=IMG[key]; if(!img||!img.complete||!img.naturalWidth) return false;
    // CAS-282: per-strip frame geometry. The warrior's dynamic strips (attack/special/
    // hurt/death) are re-baked WIDER — and the special TALLER — than the shared 140×166
    // cell so their FX (the fiery sword sweep, the charge arc) is no longer clipped at
    // the cell edge ("no se ve el efecto completo del sprite"). Derive the frame width
    // from the image (naturalWidth/fc); WIDE strips (fw>CLASS_FW) centre the body
    // (ax=fw/2, as they were baked); legacy 140px strips keep CLASS_AX=65. The feet row
    // tracks the cell height (fh-BOTTOM_GAP), which equals CLASS_FOOT for legacy 166-tall
    // strips, so the figure stays planted and the same on-screen size with zero change to
    // idle/walk or the other classes' 140px strips.
    // CAS-333: `rows`>1 → a vertical stack of 8 facing rows; the CELL height is the sheet
    // height/rows (166 for the 8-dir strips) and the source row is offset by row*fh. Legacy
    // single-row strips keep rows=1 → fh==naturalHeight and sy==0, i.e. byte-identical path.
    const fw=Math.round(img.naturalWidth/fc), fh=Math.round(img.naturalHeight/rows);
    const _axT=DIR8_AX[key];  // CAS-469: anchor por fila para strips 8-dir
    const ax=(_axT&&rows>1)?_axT[row]:((fw>CLASS_FW)?fw/2:CLASS_AX), foot=fh-(CLASS_FH-CLASS_FOOT);
    const S=CLASS_ANIM_SCALE, dw=fw*S*sqX, dh=fh*S*sqY, sx=(fi||0)*fw, sy=row*fh;
    const dx=cx-ax*S*sqX, dy=feet-foot*S*sqY-(bobUp||0);
    const useFlip=flipOff?false:flip; // 8-dir strips carry real per-facing art → never mirror
    let src=img, ssx=sx, ssy=sy;
    if(tint && _heroBx){ _heroBuf.width=fw; _heroBuf.height=fh;
      _heroBx.clearRect(0,0,fw,fh); _heroBx.imageSmoothingEnabled=false;
      _heroBx.globalCompositeOperation="source-over"; _heroBx.drawImage(img,sx,sy,fw,fh,0,0,fw,fh);
      _heroBx.globalCompositeOperation="source-atop"; _heroBx.globalAlpha=0.85; _heroBx.fillStyle=tint; _heroBx.fillRect(0,0,fw,fh);
      _heroBx.globalAlpha=1; _heroBx.globalCompositeOperation="source-over";
      src=_heroBuf; ssx=0; ssy=0; }
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(useFlip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(src,ssx,ssy,fw,fh,0,0,dw,dh); }
    else ctx.drawImage(src,ssx,ssy,fw,fh,dx,dy,dw,dh);
    ctx.restore(); return true;
  }
  function redden(pal){ const o={}; for(const k in pal) o[k]="#ff9a8a"; o.o=pal.o; return o; }
  function whiten(pal){ const o={}; for(const k in pal) o[k]="#ffffff"; return o; }
  // CAS-82: draw the ERW hooded hero — tight content cell, bottom-anchored at
  // (cx,feet), nearest-neighbor, with squash (sqX/sqY) + hop (bobUp) applied and
  // an optional silhouette tint (hurt flash). Returns false until the PNG loads,
  // so drawHero falls back to the class sheet on the first frames.
  function drawHeroErw(cx,feet,flip,sqX,sqY,bobUp,tint){
    const img=IMG["hero_erw"]; if(!img||!img.complete||!img.naturalWidth) return false;
    const dw=ERW_SW*ERW_SCALE*sqX, dh=ERW_SH*ERW_SCALE*sqY, dx=cx-dw/2, dy=feet-dh-bobUp;
    let src=img, ssx=ERW_SX, ssy=ERW_SY;
    if(tint && _heroBx){ _heroBuf.width=ERW_SW; _heroBuf.height=ERW_SH;
      _heroBx.clearRect(0,0,ERW_SW,ERW_SH); _heroBx.imageSmoothingEnabled=false;
      _heroBx.globalCompositeOperation="source-over"; _heroBx.drawImage(img,ERW_SX,ERW_SY,ERW_SW,ERW_SH,0,0,ERW_SW,ERW_SH);
      _heroBx.globalCompositeOperation="source-atop"; _heroBx.globalAlpha=0.85; _heroBx.fillStyle=tint; _heroBx.fillRect(0,0,ERW_SW,ERW_SH);
      _heroBx.globalAlpha=1; _heroBx.globalCompositeOperation="source-over";
      src=_heroBuf; ssx=0; ssy=0; }
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(src,ssx,ssy,ERW_SW,ERW_SH,0,0,dw,dh); }
    else ctx.drawImage(src,ssx,ssy,ERW_SW,ERW_SH,dx,dy,dw,dh);
    ctx.restore(); return true;
  }

  // CAS-118 — status feedback on any afflicted entity (hero or enemy): a faint pulsing
  // ground aura in the dominant status colour + a small row of coloured icon pips above
  // it. Reads the same fields the sim drives (dots / slowT / stun), so it can never
  // disagree with the simulation. Cheap: early-out when the entity carries no status.
  function activeStatuses(ent){
    const out=[];
    if(ent.dots){ for(const k in ent.dots){ const s=STATUS[k]; if(s) out.push({col:s.col}); } }
    if(ent.slowT>0){ const s=STATUS.slow; out.push({col:s.col}); }
    if(ent.stun>0){ const s=STATUS.stun; out.push({col:s.col}); }
    return out;
  }
  function drawStatusFx(ent, cx, feetY, topY){
    const st=activeStatuses(ent); if(!st.length) return;
    // faint pulsing ground aura in the first status's colour
    const pulse=0.5+0.5*Math.abs(Math.sin(G.t*6));
    ctx.save(); ctx.globalAlpha=0.18+0.16*pulse; ctx.fillStyle=st[0].col;
    ctx.beginPath(); ctx.ellipse(cx,feetY,13,6,0,0,6.28); ctx.fill(); ctx.restore();
    // icon pips row, centred above the entity
    const n=st.length, sz=5, gap=3, total=n*sz+(n-1)*gap; let px=cx-total/2;
    ctx.save();
    for(let i=0;i<n;i++){ ctx.globalAlpha=0.95; ctx.fillStyle=COL.out; ctx.fillRect(px-1,topY-1,sz+2,sz+2);
      ctx.fillStyle=st[i].col; ctx.fillRect(px,topY,sz,sz); px+=sz+gap; }
    ctx.restore();
  }
  // CAS-222: per-mob step cadence. CAS-219 board feedback — mob steps looked too
  // fast/unreal. The walk-bob (procedural squash-stretch) AND the sliced / PixelLab
  // walk strips all read as "stepping", so both are slowed to a realistic footfall
  // and tuned per mob: quick critters (wolf/rat/bat) step faster, undead & heavy
  // brutes plod slower. `w` = angular freq for |sin(G.t*w)| → footfall period = PI/w
  // (wolf ~0.42s · medium ~0.52s · undead/heavy ~0.65s). `fps` = walk-strip frame
  // rate (lower = slower, still smooth on 6-frame strips). Pure render-time, reads no
  // sim state / RNG → Stage-2 deterministic; reduceMotion is gated at each call site.
  const MOB_GAIT = {
    wolf:{w:7.4,fps:9},  rat:{w:7.4,fps:9},  bat:{w:7.8,fps:9},  volatile:{w:7.8,fps:9},
    bandit:{w:6.0,fps:7}, revenant:{w:6.4,fps:8}, adv:{w:6.0,fps:7}, healer:{w:5.6,fps:6},
    orc:{w:4.4,fps:6},   moose:{w:4.4,fps:6}, charger:{w:5.0,fps:6},
    skeleton:{w:4.8,fps:6}, spearman:{w:4.8,fps:6}, mage:{w:4.6,fps:6},
    summoner:{w:4.6,fps:6}, wraith:{w:4.2,fps:6}, golem:{w:3.8,fps:6},
    // CAS-1692: new mob gaits
    thornspitter:{w:5.8,fps:7}, ironback:{w:4.0,fps:6}, ashwraith:{w:4.4,fps:6},
  };
  const mobGait = e => MOB_GAIT[e.type] || {w:6.0,fps:7};
  // ── CAS-2124: barra de vida + placa de nombre de enemigos estilo Tibia ──────────────────────────
  // Knob RENDER-LOCAL (a propósito NO en config.js): togglea/ajusta la capa de PRESENTACIÓN de los
  // enemigos sin tocar sim.js ni config.js ⇒ srand ON==OFF byte-idéntico garantizado (render-only).
  // default enabled:true — es un fix visual esperado por el board (no DARK). $0 arte, 100% canvas.
  const NAMEPLATE = { enabled:true, showBar:true, showName:true,
    normal:"#f2f4f6", elite:"#ffd84a", boss:"#ff7a3a",          // color del NOMBRE por rango (blanco/amarillo/naranja-rojo)
    border:"rgba(0,0,0,0.85)", track:"rgba(12,14,18,0.72)" };   // marco negro 1px + pista oscura translúcida
  // Gradiente de vida estilo Tibia por %HP: verde(>60%) → amarillo(30-60%) → naranja(12-30%) → rojo(<12%).
  function hpTibia(f){ return f>0.6?"#4fd651":(f>0.3?"#d8d43e":(f>0.12?"#e07f2a":"#d63a2a")); }
  // Texto de placa con OUTLINE negra 1px (4-vecinos, barato) para legibilidad sobre CUALQUIER fondo.
  function outlineText(txt,x,y,fill,sz){
    ctx.font="bold "+sz+"px "+FF; ctx.textAlign="center";
    ctx.fillStyle="#000"; ctx.fillText(txt,x-1,y); ctx.fillText(txt,x+1,y); ctx.fillText(txt,x,y-1); ctx.fillText(txt,x,y+1);
    ctx.fillStyle=fill; ctx.fillText(txt,x,y);
  }
  function drawEnemy(e){
    const spr=SP[e.tpl.sprite]; const px=e.isBoss?5:(e.champion?5:(e.tpl.size>20?4:3));
    const fl = (e.facing!==undefined)?Math.cos(e.facing)<0:false;
    // CAS-1826 POSTURA/ATURDIMIENTO ($0 art): while BROKEN (staggerT>0) the enemy wears a golden stun swirl —
    // a pulsing ground ring + orbiting stars — reading "hit it NOW". While postura is BUILDING (poise>0, not yet
    // broken) a thin pip-bar over the head shows the meter filling. Pure proc render off transient sim state; no
    // new art, no sim state mutated, no RNG. Gated so 0-poise enemies (basics / disabled) draw nothing.
    if(POISE.enabled){
      if(e.staggerT>0){ const t=G.t, cx=e.x, cy=e.y-e.tpl.size*0.5; ctx.save();
        ctx.globalAlpha=0.45+0.2*Math.sin(t*10); ctx.strokeStyle="#ffe27a"; ctx.lineWidth=2;
        const rr=e.tpl.size*1.15; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,rr,rr*0.4,0,0,6.28); ctx.stroke();
        ctx.globalCompositeOperation="lighter"; ctx.fillStyle="#fff4b0";
        for(let i=0;i<4;i++){ const a=t*4+i*1.57, sx=cx+Math.cos(a)*e.tpl.size*0.9, sy=cy+Math.sin(a)*e.tpl.size*0.5;
          ctx.globalAlpha=0.7; ctx.beginPath(); ctx.arc(sx,sy,2.2,0,6.28); ctx.fill(); }
        ctx.restore();
      } else if(e.poise>0 && e.poiseMax>0){ const w=e.tpl.size*1.4, x0=e.x-w/2, y0=e.y-e.tpl.size-8, fr=Math.min(1,e.poise/e.poiseMax);
        ctx.save(); ctx.globalAlpha=0.85; ctx.fillStyle="#20242e"; ctx.fillRect(x0-1,y0-1,w+2,4);
        ctx.fillStyle="#ffcf4d"; ctx.fillRect(x0,y0,w*fr,2); ctx.restore();
      }
    }
    // CAS-247: a Swift affix scales the WALK CADENCE (gait.w AND gait.fps) by the same factor as
    // its move speed, so faster steps stay natural — never reintroduce the CAS-219/240 desync.
    let gait=mobGait(e); if(e.affixGait && e.affixGait!==1) gait={w:gait.w*e.affixGait, fps:gait.fps*e.affixGait};
    // champion aura — a pulsing ground ring marks the elite as the hunt climax.
    // Capstone (CAS-65): the ring runs orange and turns red + double-pulses once
    // the boss enrages, telegraphing the phase shift at a glance.
    if(e.champion){ const cap=e.capstone, enr=e.enraged;
      const pr=e.tpl.size*1.3 + Math.sin(G.t*(enr?7:4))*(enr?3:2); ctx.save();
      ctx.globalAlpha=0.5; ctx.strokeStyle=cap?(enr?"#ff4636":"#ff9a3a"):"#ffcf4d"; ctx.lineWidth=cap?3:2;
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
      if(cap&&enr){ ctx.globalAlpha=0.28; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr+7,(pr+7)*0.42,0,0,6.28); ctx.stroke(); }
      ctx.restore(); }
    // CAS-146 elite-ambush leader aura — a pulsing crimson double-ring marks the promoted
    // mob as a notable (lighter than a champion's gold ring; it is not the hunt climax).
    if(e.elite && !e.champion){ const pr=e.tpl.size*1.25 + Math.sin(G.t*5)*2.5; ctx.save();
      ctx.globalAlpha=0.5; ctx.strokeStyle="#ff5a3c"; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
      ctx.globalAlpha=0.24; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr+6,(pr+6)*0.42,0,0,6.28); ctx.stroke();
      ctx.restore(); }
    // CAS-247 ELITE-AFFIX read (tint/glow only — NO new art): an affixed trash mob wears a
    // coloured ground ring + an additive body halo in its affix colour, so the player reads
    // "this one is special, and WHICH special" at a glance. The bigger silhouette (tpl.size
    // bump from applyAffix) is the third cue. Skipped for elites/champions/boss (they own a
    // louder aura already). Pure render off MOB_AFFIX[e.affix] — no sim state mutated, no RNG.
    // CAS-1590 ÉLITE CAMPEÓN telegraph ($0 art): a bold pulsing GOLD double-ring marks the mini-boss
    // at distance, additive halos in BOTH affix colours read its two modifiers on the body, and if it
    // carries Aura Gélida the slow-zone footprint still draws (danger area stays legible). Reuses the
    // affix render idiom + CHAMPION.col — no new art, no sim state mutated, no RNG. Drawn INSTEAD of the
    // light single-affix ring below (that block is gated off for champions).
    if(e.champElite && !e.isBoss){ const ids=e.affixes||(e.affix?[e.affix]:[]);
      const pr=e.tpl.size*1.35 + Math.sin(G.t*4)*3; ctx.save();
      ctx.globalAlpha=0.6; ctx.strokeStyle=CHAMPION.col; ctx.lineWidth=3;
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
      ctx.globalAlpha=0.3; ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr+8,(pr+8)*0.42,0,0,6.28); ctx.stroke();
      ctx.globalCompositeOperation="lighter";
      for(let i=0;i<ids.length;i++){ const A=MOB_AFFIX[ids[i]]; if(!A) continue;
        ctx.globalAlpha=0.12+0.05*(0.5+0.5*Math.sin(G.t*5+i*2));
        ctx.fillStyle=A.col; ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.size*(1.0+i*0.14),0,6.28); ctx.fill(); }
      if(ids.includes("frost") && MOB_AFFIX.frost.auraR){ const A=MOB_AFFIX.frost; ctx.globalCompositeOperation="source-over";
        ctx.globalAlpha=0.16+0.06*(0.5+0.5*Math.sin(G.t*3)); ctx.strokeStyle=A.col; ctx.lineWidth=1.5;
        if(ctx.setLineDash) ctx.setLineDash([6,7]);
        ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,A.auraR,A.auraR*0.5,0,0,6.28); ctx.stroke();
        if(ctx.setLineDash) ctx.setLineDash([]); }
      ctx.restore(); }
    if(e.affix && !e.champElite && !e.elite && !e.champion && !e.isBoss){ const A=MOB_AFFIX[e.affix];
      if(A){ const col=A.col, pr=e.tpl.size*1.12 + Math.sin(G.t*6)*2; ctx.save();
        ctx.globalAlpha=0.5; ctx.strokeStyle=col; ctx.lineWidth=2;
        ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
        // soft additive halo so the affix colour reads on the sprite mass itself (the "tint")
        ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.12+0.05*(0.5+0.5*Math.sin(G.t*5));
        ctx.fillStyle=col; ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.size*1.05,0,6.28); ctx.fill();
        // CAS-1586 AURA GÉLIDA telegraph: draw the actual SLOW-ZONE footprint (radius auraR) as a
        // faint dashed ice ring on the ground, so the danger area is legible — step outside it and
        // the slow lifts. Data-driven radius (MOB_AFFIX.frost.auraR); no new art, no sim state read.
        if(e.affix==="frost" && A.auraR){ ctx.globalCompositeOperation="source-over";
          ctx.globalAlpha=0.16+0.06*(0.5+0.5*Math.sin(G.t*3)); ctx.strokeStyle=col; ctx.lineWidth=1.5;
          if(ctx.setLineDash) ctx.setLineDash([6,7]);
          ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,A.auraR,A.auraR*0.5,0,0,6.28); ctx.stroke();
          if(ctx.setLineDash) ctx.setLineDash([]); }
        ctx.restore(); } }
    // CAS-2071 ENCOUNTER VARIANT marker — PROCEDURAL, $0 art. Mirror of the affix halo/tint above (mutually
    // exclusive with an affix by construction: maybeVariant never stacks on an affixed body). A soft ground ring
    // + additive tint in the variant's colour reads the behaviour mod on the sprite mass. OFF ⇒ no e.variant is
    // ever set ⇒ this branch is never entered ⇒ render behaviour byte-identical to HEAD.
    if(e.variant && e.variantTint && !e.affix && !e.champElite && !e.elite && !e.champion && !e.isBoss){ const col=e.variantTint;
      const pr=e.tpl.size*1.12 + Math.sin(G.t*6)*2; ctx.save();
      ctx.globalAlpha=0.5; ctx.strokeStyle=col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.5,pr,pr*0.42,0,0,6.28); ctx.stroke();
      ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.12+0.05*(0.5+0.5*Math.sin(G.t*5));
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.size*1.05,0,6.28); ctx.fill();
      ctx.restore(); }
    // CAS-121 CORAZA DE ESCARCHA telegraph: while the boss channels its Freeze Nova it
    // wears a pulsing ice shell (reads as IMMUNE) and a danger ring GROWS toward the nova
    // radius over the channel — the player reads "break it with a status, or roll out".
    if(e.shielded){
      ctx.save();
      // CAS-403 (board CAS-402): the growing ground danger ring (nova footprint) was a
      // ground-marked area → removed. The ice shell stays: it's the boss's IMMUNE-state
      // costume on the body, not a target-area marker; the nova shards themselves are
      // visible projectiles (frostnova kind in drawProjectile).
      // ice shell around the boss (the immune carapace)
      const sr=e.tpl.size*1.05+Math.sin(G.t*6)*2;
      ctx.globalAlpha=0.55; ctx.strokeStyle="#dff4ff"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(e.x,e.y,sr,0,6.28); ctx.stroke();
      ctx.globalAlpha=0.18; ctx.fillStyle="#bfe6ff"; ctx.beginPath(); ctx.arc(e.x,e.y,sr,0,6.28); ctx.fill();
      ctx.restore(); }
    // windup telegraph: flashing warning + slight grow
    if(e.state==="windup"){ const fl2=Math.floor(G.t*16)%2===0;
      // CAS-265: colour-blind universal "about to strike" cue — a flashing high-contrast
      // white dashed ring around any winding-up enemy, so the threat reads by SHAPE +
      // motion regardless of the (colour-coded) attack-specific telegraph below it.
      if(cb()){ ctx.save(); ctx.globalAlpha=fl2?0.92:0.4; ctx.strokeStyle="#ffffff"; ctx.lineWidth=2; ctx.setLineDash([3,4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, (e.tpl.size||16)*0.95+3, 0, 6.28); ctx.stroke();
        ctx.setLineDash([]); ctx.restore(); }
      // CAS-403 (board CAS-402): "elimina las areas y las flechas" — NO ground-marked danger
      // areas, lanes, radius rings, tethers or direction arrowheads draw during windup any more.
      // The per-arch telegraphs below (brute slam ellipse, rusher streak+arrowhead, charger
      // lane+arrowhead, summoner glyph ring, healer tether, volatile blast ring, warlock claw
      // arc, basic danger circle/arc, special-slam ring) are compiled out via TELEGRAPHS_OFF.
      // What remains: the windup flash/grow on the sprite, the cb()-gated accessibility ring
      // above (body-outline, non-directional, opt-in), the CAS-210 windupring flash fx, and —
      // per CAS-403 — the attack itself now VISIBLE in flight (drawProjectile). sim.js untouched.
      const TELEGRAPHS_OFF=true;
      if(TELEGRAPHS_OFF || e.tpl.ranged){
        // no directional/area telegraph
      } else if(e.tpl.arch==="brute"){
        // CAS-115 brute GROUND-SLAM tell: a red danger ellipse on the ground that grows
        // toward the AoE radius over the (long) windup, plus a pulsing full-size outline
        // so the player reads the final blast size at a glance and steps OUT of it.
        const R=e.tpl.aoe||56, prog=clamp(1-(e.st||0)/(e.tpl.windup||0.8),0,1), cy=e.y+e.tpl.size*0.35;
        ctx.save();
        ctx.globalAlpha=0.20+0.20*prog; ctx.fillStyle="#b3242a"; // CAS-211 (d): AoE danger-fill crimson-locked (was warm orange), bright outline kept for legibility
        ctx.beginPath(); ctx.ellipse(e.x,cy,R*prog,R*prog*0.5,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.45+0.30*Math.abs(Math.sin(G.t*14)); ctx.strokeStyle=fl2?"#ffd24d":"#ff7a3a"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.restore();
      } else if(e.tpl.arch==="rusher"){
        // CAS-115 rusher LUNGE tell: a dashed streak + arrowhead along the lunge path so
        // the player can sidestep the line before the dash fires.
        const L=e.tpl.lunge||110, a=e.facing, tx=e.x+Math.cos(a)*L, ty=e.y-4+Math.sin(a)*L;
        ctx.save();
        ctx.globalAlpha=fl2?0.85:0.5; ctx.strokeStyle=fl2?"#ffd24d":"#ff7a3a"; ctx.lineWidth=3; ctx.setLineDash([7,6]);
        ctx.beginPath(); ctx.moveTo(e.x,e.y-4); ctx.lineTo(tx,ty); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha=0.9; ctx.fillStyle="#ffd24d"; ctx.beginPath(); ctx.moveTo(tx,ty);
        ctx.lineTo(tx-Math.cos(a-0.45)*12,ty-Math.sin(a-0.45)*12); ctx.lineTo(tx-Math.cos(a+0.45)*12,ty-Math.sin(a+0.45)*12);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if(e.tpl.arch==="charger"){
        // CAS-126 charger CHARGE tell: a WIDE fixed charge LANE (committed facing — it does
        // NOT track) drawn as a translucent corridor + dashed edges + arrowhead, so the
        // player reads "step OUT of the lane", not "step away from the mob".
        const L=e.tpl.charge||300, a=e.facing, ca=Math.cos(a), sa=Math.sin(a);
        const w=e.tpl.size*0.9, nx=-sa*w, ny=ca*w, tx=e.x+ca*L, ty=e.y-4+sa*L;
        ctx.save();
        ctx.globalAlpha=0.16+0.12*Math.abs(Math.sin(G.t*12)); ctx.fillStyle="#b3242a"; // CAS-211 (d): charge-lane fill crimson-locked
        ctx.beginPath(); ctx.moveTo(e.x+nx,e.y-4+ny); ctx.lineTo(tx+nx,ty+ny); ctx.lineTo(tx-nx,ty-ny); ctx.lineTo(e.x-nx,e.y-4-ny); ctx.closePath(); ctx.fill();
        ctx.globalAlpha=fl2?0.9:0.55; ctx.strokeStyle=fl2?"#ffd24d":"#ff7a3a"; ctx.lineWidth=2.5; ctx.setLineDash([9,7]);
        ctx.beginPath(); ctx.moveTo(e.x+nx,e.y-4+ny); ctx.lineTo(tx+nx,ty+ny); ctx.moveTo(e.x-nx,e.y-4-ny); ctx.lineTo(tx-nx,ty-ny); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha=0.9; ctx.fillStyle="#ffd24d"; ctx.beginPath(); ctx.moveTo(tx,ty);
        ctx.lineTo(tx-ca*16-sa*12,ty-sa*16+ca*12); ctx.lineTo(tx-ca*16+sa*12,ty-sa*16-ca*12); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if(e.tpl.arch==="summoner"){
        // CAS-126 summoner tell: a growing purple glyph-RING under the caster as it channels
        // the raise — reads "adds incoming, cut the head off". No hero-facing danger zone.
        const prog=clamp(1-(e.st||0)/(e.tpl.windup||0.9),0,1), R=14+prog*30, cy=e.y+e.tpl.size*0.35;
        ctx.save(); ctx.globalAlpha=0.35+0.30*Math.abs(Math.sin(G.t*12));
        ctx.strokeStyle="#b48cff"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.globalAlpha=0.22; ctx.fillStyle="#9a6cff"; ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.5; ctx.lineWidth=1.5; ctx.beginPath(); ctx.ellipse(e.x,cy,R*0.55,R*0.28,0,0,6.28); ctx.stroke(); ctx.restore();
      } else if(e.tpl.arch==="healer"){
        // CAS-126 healer tell: a pulsing green TETHER from the medic to the ally it is about
        // to heal — the player reads "interrupt this / kill the medic". No hero danger zone.
        const t=e.healTgt;
        ctx.save(); ctx.globalAlpha=0.4+0.4*Math.abs(Math.sin(G.t*10)); ctx.strokeStyle="#7dffa0"; ctx.lineWidth=2.5; ctx.setLineDash([5,5]);
        if(t&&t.hp>0){ ctx.beginPath(); ctx.moveTo(e.x,e.y-4); ctx.lineTo(t.x,t.y-4); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha=0.8; ctx.fillStyle="#7dffa0";
          ctx.beginPath(); ctx.arc(t.x,t.y,4+(fl2?2:0),0,6.28); ctx.fill();
        } else { ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.size+6,0,6.28); ctx.stroke(); }
        ctx.setLineDash([]); ctx.restore();
      } else if(e.tpl.arch==="volatile"){
        // CAS-146 volatile tell: a hard-pulsing red blast ring that GROWS to the full `blast`
        // radius over the (short) windup — reads "it's about to blow, clear the circle / kill it".
        const R=e.tpl.blast||72, prog=clamp(1-(e.st||0)/(e.tpl.windup||0.7),0,1), cy=e.y+e.tpl.size*0.3;
        ctx.save();
        ctx.globalAlpha=0.22+0.26*prog; ctx.fillStyle="#d8403f"; // CAS-211 (d): volatile blast-fill crimson-locked (hotter crimson — about to detonate)
        ctx.beginPath(); ctx.ellipse(e.x,cy,R*prog,R*prog*0.5,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.5+0.4*Math.abs(Math.sin(G.t*20)); ctx.strokeStyle=fl2?"#ffe08a":"#ff5a3c"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.restore();
      } else if(e.tpl.arch==="warlock"){
        // CAS-321 dark_demon_3: the CAST (e.castNow, a hidden bolt) follows the CAS-303 ranged
        // convention — no origin-revealing danger zone, the cb ring + warlock cast pose are the
        // tell. The CLAW (melee) draws a TIGHT directional danger arc at meleeR so the swing
        // reads at a glance (the full `range` danger circle would be a misleading 235px ring).
        if(!e.castNow){ const R=e.tpl.meleeR||50;
          ctx.save();
          ctx.globalAlpha=0.5; ctx.fillStyle=fl2?"#e8463f":"#b3242a";
          ctx.beginPath(); ctx.arc(e.x,e.y,R+6,0,6.28); ctx.fill(); ctx.globalAlpha=1;
          ctx.fillStyle="rgba(179,36,42,0.38)"; ctx.beginPath(); ctx.moveTo(e.x,e.y);
          ctx.arc(e.x,e.y,R+12,e.facing-0.5,e.facing+0.5); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      } else {
        ctx.globalAlpha=0.5; ctx.fillStyle=fl2?"#e8463f":"#b3242a"; // CAS-211 (d): basic attack danger-fill crimson-locked (bright crimson flash, was gold/orange)
        ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.range+6,0,6.28); ctx.fill(); ctx.globalAlpha=1;
        ctx.fillStyle="rgba(179,36,42,0.38)"; ctx.beginPath(); ctx.moveTo(e.x,e.y);
        ctx.arc(e.x,e.y,e.tpl.range+12,e.facing-0.5,e.facing+0.5); ctx.closePath(); ctx.fill();
      }
      // CAS-109 special-slam tell: a red ring that GROWS over the (longer) windup so
      // the player reads "radial slam incoming — roll out/through" before it lands.
      // CAS-403: it's a ground-marked area → off with the rest of the telegraphs.
      if(!TELEGRAPHS_OFF && e.specialNow){ const wmax=(e.special&&e.special.windup)||e.tpl.windup;
        const prog=clamp(1-(e.st||0)/wmax,0,1), R=34+prog*72, cy=e.y+e.tpl.size*0.45;
        ctx.save(); ctx.globalAlpha=0.30+0.30*Math.abs(Math.sin(G.t*16));
        ctx.strokeStyle="#ff5230"; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.globalAlpha=0.45; ctx.lineWidth=1.5; ctx.strokeStyle="#ffd0a0";
        ctx.beginPath(); ctx.ellipse(e.x,cy,R*0.62,R*0.31,0,0,6.28); ctx.stroke(); ctx.restore(); }
    }
    // CAS-2208: PIXELART master A/B gate — `sprOn` short-circuits every mob sprite tier (drawAnim /
    // resolveStrip / ENEMY_IMG) so `drew` stays false and the procedural `blit(spr…)` fallback runs.
    // Default true ⇒ identical branch selection as before (byte-identical LIVE).
    const sprOn=PIXELART.spritesEnabled;
    let drew=false; const ch=ENEMY_ANIM[e.type];
    if(sprOn && ch && IMG[ch+"_walk"]){
      const ds=ANIM[ch]&&ANIM[ch].ds; const S=ds?ds*(e.isBoss?1.15:e.champion?1.0:0.82):(e.isBoss?1.3:0.85), feet=e.y+e.tpl.size*0.5, st=e.animState||"idle";
      const fps = st==="attack"? (ANIM[ch].fc.attack/(e.tpl.windup+0.15)) : (st==="walk"?gait.fps:6); // CAS-222 per-mob walk cadence
      const fi=frameIndex(ch,st,e.animT||0,fps, st!=="attack");
      drew=drawAnim(ctx,ch,st,fi,e.x,feet,S,fl, e.hurtFlash>0?"#ffffff":null);
    }
    // CAS-209: per-state PixelLab MCP strips for solid-bodied mobs (skel/bandit/orc).
    // resolveStrip picks the state-specific strip (idle/walk) or falls back to walk.
    // Stage-2 safe: reads only render state, mutates nothing.
    if(!drew && sprOn){ const st=e.animState||"idle"; const strip=resolveStrip(e.tpl.sprite,st);
      const simg=strip&&IMG[strip.key]&&IMG[strip.key].complete&&IMG[strip.key].naturalWidth?IMG[strip.key]:null;
      if(simg){
        const fw=strip.fw, fh=strip.fh;
        // CAS-233: strip.tiles pins an absolute on-screen height (in 32px tiles) so the
        // golem BOSS renders one consistent imposing size across all 4 zones (zone bosses
        // differ in tpl.size 36–50 — the generic size×3.4 mult would balloon the Coliseo
        // boss to ~5 tiles). Preserves the legacy ~3.6-tile "stone capstone" scale.
        // CAS-2194: strip.bodyScale (default 1) rescales the whole frame so a PixelLab strip with a
        // padded canvas (body << frame, e.g. pilot skel 61px body in a 124px frame) still renders at
        // the standard mob height instead of half-size. Existing strips omit it → byte-identical.
        const dh=(strip.tiles? strip.tiles*32 : e.tpl.size*(e.isBoss?3.4:e.champion?2.9:2.4))*(strip.bodyScale||1), dw=dh*(fw/fh);
        const feetY=e.y+e.tpl.size*0.5, ph=(e.gaitPhase!==undefined?e.gaitPhase:(e.x*0.7+e.y*0.9)); // CAS-240: STATIC spawn-phase, not live pos
        // CAS-317: attack1/attack2/hurt are ONE-SHOT (synced to the sim's e.animT clock, hold
        // the final frame); idle/walk loop on render time as before. Legacy "attack" (golem)
        // stays looped — untouched.
        const oneShot = (st==="attack1"||st==="attack2"||st==="hurt");
        const fps = st==="walk"?gait.fps : st==="attack1"?12 : st==="attack2"?14 : st==="hurt"?12 : st==="attack"?10 : st==="cast"?8 : 6; // CAS-222 per-mob walk cadence (CAS-312: demon warlock cast loops ~8fps as a channel)
        const fi = G.settings.reduceMotion ? (oneShot?strip.fc-1:0)
                 : oneShot ? Math.min(Math.floor((e.animT||0)*fps), strip.fc-1)
                 : (Math.floor(G.t*fps+ph*7)%strip.fc+strip.fc)%strip.fc;
        // CAS-2398 (board 4d0caf74 "elimina esos circulos"): the dark oval GROUNDING SHADOW under
        // richAnim characters is REMOVED — the board confirmed "las sombras ovaladas bajo los personajes"
        // as a target. Render-only (sprite still bottom-anchors at feetY, so no positional float); the
        // former CAS-317 shadow ellipse (rgba(0,0,0,0.32) at e.x,feetY, dw*0.30×dw*0.12) is gone.
        // Reversible: restore the one-line ellipse fill here to bring the shadow back.
        // CAS-331: dragon strips carry ~0.31·dh of empty rows below the feet; shift the draw
        // DOWN by footPad·dh so the content bottom plants on feetY (the shadow stays at feetY).
        // footPad is dragon-only (gate by strip.footPad) → other PixelLab/golem mobs untouched.
        const yOff=(strip.footPad||0)*dh;
        ctx.save(); ctx.translate(e.x, feetY);
        if(fl) ctx.scale(-1,1);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(simg, fi*fw,0,fw,fh, -dw/2,-dh+yOff,dw,dh);
        if(e.hurtFlash>0){ ctx.globalAlpha=0.6*Math.min(1,e.hurtFlash*4); ctx.globalCompositeOperation="lighter";
          ctx.drawImage(simg, fi*fw,0,fw,fh, -dw/2,-dh+yOff,dw,dh); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; }
        ctx.restore();
        drew=true;
      }
    }
    // CAS-206: FOUNTAINS-style PixelLab enemy cutout. Single-frame image drawn
    // bottom-anchored at the feet, sized to the mob's tpl.size, with the CAS-203
    // breathe/walk-bob applied so it never reads frozen. Hurt-flash brightens it.
    if(!drew && sprOn){ const ik=ENEMY_IMG[e.tpl.sprite]; const eimg=ik&&IMG[ik];
      if(eimg && eimg.complete && eimg.naturalWidth){
        const dh=e.tpl.size*(e.isBoss?3.4:e.champion?2.9:2.4), dw=dh*(eimg.naturalWidth/eimg.naturalHeight);
        const feetY=e.y+e.tpl.size*0.5, ph=(e.gaitPhase!==undefined?e.gaitPhase:(e.x*0.7+e.y*0.9)), st=e.animState||"idle"; // CAS-240: STATIC spawn-phase
        let sx=1, sy=1, bob=0;
        if(!G.settings.reduceMotion){
          if(st==="walk"){ const b=Math.abs(Math.sin(G.t*gait.w+ph)); bob=-b*2.4; sy=1+b*0.06; sx=1-b*0.05; } // CAS-222 cadence
          else if(st==="attack"){ const a=Math.sin(G.t*5+ph); sy=0.95+0.02*a; sx=1.05-0.02*a; bob=1.4; }
          else { const br=Math.sin(G.t*2.3+ph); sy=1+br*0.045; sx=1-br*0.03; bob=br*0.8; }
        }
        ctx.save(); ctx.translate(e.x, feetY+bob); ctx.scale(sx,sy);
        if(fl) ctx.scale(-1,1);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(eimg, -dw/2, -dh, dw, dh);
        if(e.hurtFlash>0){ ctx.globalAlpha=0.6*Math.min(1,e.hurtFlash*4); ctx.globalCompositeOperation="lighter";
          ctx.drawImage(eimg,-dw/2,-dh,dw,dh); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; }
        ctx.restore();
        drew=true;
      }
    }
    // CAS-1706 crash-guard: the richAnim CAVES mobs (ashwraith/ironback/thornspitter) have an
    // ENEMY_IMG cutout but NO procedural SP blob (unlike quillback/wendigo/mudlurker). The draw
    // chain above already covers them (resolveStrip → ENEMY_IMG); this `&& spr` keeps the last
    // procedural fallback from dereferencing an undefined SP entry in the pathological window
    // where BOTH the strip and the cutout are still loading. Existing mobs all have SP → no-op.
    if(!drew && spr){
      const rows=spr.rows, pal=(e.hurtFlash>0)?whiten(spr.pal):spr.pal;
      // CAS-203: every procedural mob now breathes / walk-bobs so nothing renders frozen.
      // Render-time squash-stretch anchored at the FEET, driven by sim time G.t + a stable
      // per-mob phase. Reads no sim state and mutates nothing (no RNG) → Stage-2 safe.
      // Honors reduceMotion. Idle = slow breathing; walk = bouncy hop; attack = brief crouch
      // anticipation (the windup ground-ring telegraphs above stay the primary tell).
      if(G.settings.reduceMotion){ blit(ctx,rows,pal,e.x,e.y,px,fl); }
      else {
        const h=rows.length, feetY=e.y+(h*px)/2, ph=(e.gaitPhase!==undefined?e.gaitPhase:(e.x*0.7+e.y*0.9)), st=e.animState||"idle"; // CAS-240: STATIC spawn-phase
        let sx=1, sy=1, bob=0;
        if(st==="walk"){ const b=Math.abs(Math.sin(G.t*gait.w+ph)); bob=-b*2.2; sy=1+b*0.06; sx=1-b*0.05; } // CAS-222 cadence
        else if(st==="attack"){ const a=Math.sin(G.t*5+ph); sy=0.95+0.02*a; sx=1.05-0.02*a; bob=1.2; }
        else { const br=Math.sin(G.t*2.3+ph); sy=1+br*0.045; sx=1-br*0.03; bob=br*0.7; }
        ctx.save(); ctx.translate(e.x, feetY+bob); ctx.scale(sx,sy);
        blit(ctx, rows, pal, 0, -(h*px)/2, px, fl);
        ctx.restore();
      }
    }
    // ── CAS-2124: barra de vida + placa de nombre estilo Tibia (RENDER-ONLY, $0 arte, 100% canvas) ──
    // Barra bordeada (borde negro 1px) sobre pista oscura translúcida, relleno con GRADIENTE por %vida
    // (verde→amarillo→naranja→rojo), y la placa de NOMBRE del mob centrada arriba con OUTLINE 1px negra,
    // coloreada por RANGO. Reusa STR.mobName(e.type) — la MISMA fuente de nombres que el Bestiario/Códice
    // (0 strings inventados). Toda decoración especial (jefe/campeón/campElite/élite/afijo/variante) se
    // PRESERVA como marcador/sufijo. El campeón conserva sus colores-señal (coraza cian / telegrafía roja).
    // Antes: mobs normales SIN nombre, relleno de color plano, texto sin contorno (ilegible sobre fondos claros).
    const special=e.isBoss||e.champion||e.champElite;
    // CAS-1590: un campeón/élite recibe la barra ANCHA siempre-visible; élite algo más ancha que un básico.
    const w=e.isBoss?66:(e.champion?58:(e.champElite?54:(e.elite?Math.max(30,e.tpl.size*1.9):Math.max(24,e.tpl.size*1.7))));
    const hh=e.isBoss?7:(special?6:(e.elite?5:4));
    const yy=e.y-e.tpl.size-(special?15:(e.elite?11:9));   // anclada al TOP del sprite (escala con size), por encima
    const hpF=clamp(e.hp/e.maxHp,0,1);
    const champCol=e.capstone?(e.enraged?"#ff4636":"#ff9a3a"):"#ffcf4d";
    if(NAMEPLATE.enabled){
      if(NAMEPLATE.showBar){
        ctx.fillStyle=NAMEPLATE.border; ctx.fillRect(e.x-w/2-1,yy-1,w+2,hh+2);   // marco negro 1px
        ctx.fillStyle=NAMEPLATE.track;  ctx.fillRect(e.x-w/2,yy,w,hh);           // pista oscura translúcida
        // relleno: gradiente por %vida; el campeón conserva su color-señal (coraza cian / telegrafía roja)
        const fill=(e.champion&&e.shielded)?"#9be7ff":((e.champion&&e.specialNow)?"#ff5230":hpTibia(hpF));
        ctx.fillStyle=fill; ctx.fillRect(e.x-w/2,yy,w*hpF,hh);
        ctx.fillStyle="rgba(255,255,255,0.20)"; ctx.fillRect(e.x-w/2,yy,w*hpF,1); // bisel Tibia: brillo superior 1px
        // CAS-1947: flash de VULNERABILIDAD del jefe insignia (overlay amarillo preservado)
        if(e.isBoss && SIGNATURE_BOSS.enabled && e._sbVuln){ ctx.fillStyle="#ffee44aa"; ctx.fillRect(e.x-w/2,yy,w*hpF,hh); }
      }
      if(NAMEPLATE.showName){
        // color por RANGO: normal=blanco · élite/afijo/variante=amarillo/tinte · campElite=CHAMPION.col · jefe/campeón=naranja-rojo
        let label, col, sz=9;
        if(e.isBoss){ label=e.tpl.bossLabel||"GÓLEM ANCESTRAL"; col=NAMEPLATE.boss; sz=10; }               // CAS-317 nombre de jefe data-driven
        else if(e.champion){ label=(e.capstone?"☠ ":"★ ")+e.tpl.champName+(e.shielded?" ❄ CORAZA":e.enraged?" ¡ENFURECIDO!":e.specialNow?" ¡CUIDADO!":""); col=e.shielded?"#9be7ff":(e.specialNow?"#ff5230":champCol); sz=10; }
        else if(e.champElite){ const ids=e.affixes||(e.affix?[e.affix]:[]); const names=ids.map(id=>MOB_AFFIX[id]&&MOB_AFFIX[id].name).filter(Boolean).join(" + "); label="👑 "+CHAMPION.name+(names?" · "+names:""); col=CHAMPION.col; sz=10; } // CAS-1590 nombra ambos afijos
        else if(e.elite){ label="⚔ "+STR.mobName(e.type); col=NAMEPLATE.elite; }                            // élite: marcador ⚔ + nombre del mob
        else if(e.affix && MOB_AFFIX[e.affix]){ label="✦ "+STR.mobName(e.type); col=MOB_AFFIX[e.affix].col; } // CAS-247 tinte del afijo + nombre (el aura ya nombra el modificador)
        else if(e.variant && ENCOUNTER_VARIANTS.markerLabel && ENCOUNTER_VARIANTS.variants[e.variant]){ label="◈ "+STR.mobName(e.type); col=ENCOUNTER_VARIANTS.variants[e.variant].tint; } // CAS-2071 tinte de variante
        else { label=STR.mobName(e.type); col=NAMEPLATE.normal; }                                            // CAS-2124: mob NORMAL ahora nombrado (antes sin nombre)
        outlineText(label, e.x, yy-3, col, sz);
        // CAS-1947: jefe insignia — indicador de FASE (glyph a la izquierda de la barra, con contorno, preservado)
        if(e.isBoss && SIGNATURE_BOSS.enabled && e._sbPhase){
          const ph=e._sbPhase, glyph=ph===2?"◆◆ FASE II":"◆ FASE I", gcol=e._sbVuln?"#ffee44":(ph===2?"#ff5520":"#ffb040");
          ctx.font="bold 9px "+FF; ctx.textAlign="left";
          ctx.fillStyle="#000"; ctx.fillText(glyph,e.x-w/2-1,yy-4); ctx.fillText(glyph,e.x-w/2+1,yy-4); ctx.fillText(glyph,e.x-w/2,yy-5); ctx.fillText(glyph,e.x-w/2,yy-3);
          ctx.fillStyle=gcol; ctx.fillText(glyph,e.x-w/2,yy-4);
        }
      }
    }
    // CAS-118: status icons/aura sit just above the HP bar so afflictions read at a glance.
    drawStatusFx(e, e.x, e.y+e.tpl.size*0.5, yy-9);
  }
  // CAS-1954: dibujar el ESPÍRITU invocado (Cenizas de Espíritu) — $0 arte. Reusa el sprite PROCEDURAL del molde
  // (skeleton, SP[tpl.sprite]) con tratamiento ESPECTRAL: silueta translúcida (alpha) + halo aditivo cian (lighter,
  // paleta cianizada = patrón whiten/redden) + anillo de suelo cian que lo marca como ALIADO (distinto del rojo/oro
  // enemigo) + pip de HP y sub-barra de temporizador en cian. Mismo bob/squash-stretch que los mobs (mobGait). NO lee
  // estado de sim más allá de la entidad, NO muta nada, 0 RNG. Sólo se invoca desde renderEntities cuando
  // SUMMON.enabled && G._spirit vivo ⇒ OFF / sin espíritu NO dibuja nada ⇒ byte-idéntico a HEAD.
  function cyanize(pal){ const o={}; for(const k in pal) o[k]=SUMMON.spirit.tint; o.o=pal.o||SUMMON.spirit.tint; return o; }
  function drawSpirit(sp){ const tint=SUMMON.spirit.tint, spr=SP[sp.tpl.sprite]; if(!spr) return;
    const px=(sp.tpl.size>20?4:3), fl=Math.cos(sp.facing||0)<0;
    const rows=spr.rows, hh=rows.length, feetY=sp.y+(hh*px)/2;
    const ph=(sp.gaitPhase!==undefined?sp.gaitPhase:(sp.x*0.7+sp.y*0.9)), st=sp.animState||"idle", gait=mobGait(sp);
    ctx.save();
    // anillo de suelo cian — marca de ALIADO (pulsa suave), leído bajo los pies
    { const pr=sp.tpl.size*1.12 + Math.sin(G.t*4)*2; ctx.globalAlpha=0.42; ctx.strokeStyle=tint; ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(sp.x, sp.y+sp.tpl.size*0.5, pr, pr*0.42, 0, 0, 6.28); ctx.stroke();
      ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.10+0.05*(0.5+0.5*Math.sin(G.t*5));
      ctx.fillStyle=tint; ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.tpl.size*1.05, 0, 6.28); ctx.fill();
      ctx.globalCompositeOperation="source-over"; }
    // cuerpo: mismo bob/squash-stretch que los mobs (procedural blit path)
    let bsx=1, bsy=1, bob=0;
    if(!G.settings.reduceMotion){
      if(st==="walk"){ const b=Math.abs(Math.sin(G.t*gait.w+ph)); bob=-b*2.2; bsy=1+b*0.06; bsx=1-b*0.05; }
      else if(st==="attack"){ const a=Math.sin(G.t*5+ph); bsy=0.95+0.02*a; bsx=1.05-0.02*a; bob=1.2; }
      else { const br=Math.sin(G.t*2.3+ph); bsy=1+br*0.045; bsx=1-br*0.03; bob=br*0.7; }
    }
    ctx.translate(sp.x, feetY+bob); ctx.scale(bsx,bsy);
    // silueta translúcida (alpha espectral)
    ctx.globalAlpha=SUMMON.spirit.alpha; blit(ctx, rows, spr.pal, 0, -(hh*px)/2, px, fl);
    // halo aditivo cian encima (glow espectral; brilla al recibir golpe)
    ctx.globalCompositeOperation="lighter";
    ctx.globalAlpha=0.28+((sp.hurtFlash||0)>0?0.5*Math.min(1,sp.hurtFlash*4):0.10*(0.5+0.5*Math.sin(G.t*3)));
    blit(ctx, rows, cyanize(spr.pal), 0, -(hh*px)/2, px, fl);
    ctx.restore(); ctx.globalAlpha=1; ctx.globalCompositeOperation="source-over";
    // pip de HP (cian ALIADO, no rojo enemigo) + sub-barra de temporizador de invocación + etiqueta
    const w=Math.max(20,sp.tpl.size*1.4), yy=sp.y-sp.tpl.size-8;
    ctx.fillStyle=COL.out; ctx.fillRect(sp.x-w/2-1,yy-1,w+2,6);
    ctx.fillStyle="#0a2630"; ctx.fillRect(sp.x-w/2,yy,w,3);
    ctx.fillStyle=tint; ctx.fillRect(sp.x-w/2,yy,w*clamp(sp.hp/sp.maxHp,0,1),3);
    const tf=clamp((sp.life||0)/(SUMMON.summonMs/1000),0,1);
    ctx.globalAlpha=0.7; ctx.fillStyle="#bfeaff"; ctx.fillRect(sp.x-w/2,yy+3.5,w*tf,1.4); ctx.globalAlpha=1;
    ctx.fillStyle=tint; ctx.font="bold 8px "+FF; ctx.textAlign="center"; ctx.fillText("espíritu", sp.x, yy-3);
  }
  // CAS-317: a rich-anim boss corpse — plays the DEATH strip ONE-SHOT, holds the collapsed
  // final frame, then fades out over the last 0.6s of its life. Grounding shadow + L/R flip
  // match the live boss so the kill reads as a real fall-down, not a pop-out. Presentation
  // only (G.corpses, aged by sim updateCorpses); no HP bar, no AI, no sim read.
  function drawCorpse(c){
    const strip=resolveStrip(c.sprite,"death"); if(!strip) return;
    const img=IMG[strip.key]; if(!img||!img.complete||!img.naturalWidth) return;
    // CAS-360: a standard richAnim mob (quillback) renders at size*2.4 while alive, so its corpse
    // must match — only a boss/champion uses the larger 3.4/2.9 mult (the dragon uses strip.tiles).
    const fw=strip.fw, fh=strip.fh, dh=(strip.tiles?strip.tiles*32:c.size*(c.isBoss?3.4:c.champion?2.9:2.4)), dw=dh*(fw/fh);
    const feetY=c.y+c.size*0.5, fps=8;
    const fi=G.settings.reduceMotion?strip.fc-1:Math.min(Math.floor((c.t||0)*fps),strip.fc-1);
    const LIFE=sim.CORPSE_LIFE||2.6, fade=c.t>LIFE-0.6?clamp((LIFE-c.t)/0.6,0,1):1;
    // CAS-2398: corpse grounding shadow REMOVED to match the live character (see drawEnemy) —
    // board target "sombras ovaladas bajo los personajes". Render-only; corpse still lands on feetY.
    ctx.save(); ctx.globalAlpha=fade; ctx.translate(c.x,feetY);
    if(c.fl) ctx.scale(-1,1);
    ctx.imageSmoothingEnabled=false;
    const yOff=(strip.footPad||0)*dh; // CAS-331: ground the dragon corpse like the live boss
    ctx.drawImage(img,fi*fw,0,fw,fh,-dw/2,-dh+yOff,dw,dh);
    ctx.restore();
  }
  function drawNPC(n){
    // CAS-84: animated town NPCs (e.g. the merchant) reuse the enemy drawAnim helper
    // with an idle-only loop. Purely cosmetic (driven by render time G.t, no RNG), so
    // it stays Stage-2 sim-determinism safe. Falls back to the procedural sprite while
    // the strip loads or for non-animated NPCs. topY = head height for the E/! marker.
    const ach=NPC_ANIM[n.sprite]; let topY;
    if(ach && IMG[ach+"_idle"] && IMG[ach+"_idle"].complete && IMG[ach+"_idle"].naturalWidth){
      // CAS-468: escala por NPC — healer (34px) y blacksmith (50px) se dibujan al
      // tamano del heroe (~63px, HERO_SPRITE_SCALE 1.85); el merchant (64px) ya coincide.
      const NS={healernpc:1.85, blacksmithnpc:1.25};
      const S=NS[ach]||1.0, feet=n.y+14;
      const cst=(n.castT!=null && (G.t-n.castT)<0.9 && ANIM[ach].fc.cast);  // CAS-466
      const st=cst?"cast":"idle";
      const fi=cst?frameIndex(ach,"cast",G.t-n.castT,7,false):frameIndex(ach,"idle",G.t,6,true);
      drawAnim(ctx,ach,st,fi,n.x,feet,S,false,null);
      topY=feet-ANIM[ach].fh[st]*S;
    } else { const spr=SP[n.sprite];
      // CAS-113: an animated NPC has NO SP fallback entry — while its strip image is
      // still loading (e.g. when we rehydrate a save straight into play), skip the
      // body this frame instead of crashing on a missing sprite.
      if(spr){ blit(ctx,spr.rows,spr.pal,n.x,n.y,3,false); topY=n.y-spr.rows.length*3/2; } else { topY=n.y-20; } }
    // marker
    const near=dist2(G.hero.x,G.hero.y,n.x,n.y)<CFG.talkRange*CFG.talkRange;
    let mk = n.role==="quest" && !G.quest.rewarded ? "!" : (near?"E":"");
    if(n.role==="quest" && G.quest.done && !G.quest.rewarded) mk="!";
    if(mk){ ctx.fillStyle=mk==="!"?COL.textGold:COL.cream; ctx.font="bold 14px "+FF; ctx.textAlign="center"; ctx.fillText(mk,n.x,topY-6+Math.sin(G.t*4)*2); }
  }
  // CAS-1545: pro combat-VFX kit. A soft ADDITIVE bloom drawn UNDER the crisp pixel shapes
  // is the single biggest lever that makes attacks/spells read as *powerful* rather than flat
  // line-art. Palette stays FOUNTAINS-locked (crimson + cold blue-white; spell hue via col).
  // Determinism-safe: presentation-only, no sim state or RNG-stream touched (uses G.t + index math).
  function fxGlow(x,y,r,col,a){ if(r<=0.5||a<=0.01||G.settings.reduceMotion) return;
    ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=clamp(a,0,1);
    const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,col); g.addColorStop(0.4,col); g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.fill(); ctx.restore(); }
  // additive hard-edged core dot — the white-hot centre that sells energy density
  function fxCore(x,y,r,col,a){ ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=clamp(a,0,1);
    ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.fill(); ctx.restore(); }
  // motion-trail smear behind a moving projectile (fading tail toward -velocity)
  function fxTrail(p,col,r,n){ if(G.settings.reduceMotion) return; const sp=Math.hypot(p.vx||0,p.vy||0)||1;
    const ux=-(p.vx||0)/sp, uy=-(p.vy||0)/sp; ctx.save(); ctx.globalCompositeOperation="lighter";
    for(let i=1;i<=n;i++){ const t=i/n; ctx.globalAlpha=(1-t)*0.5; const rr2=r*(1-t*0.7); const d=t*r*3.2;
      const g=ctx.createRadialGradient(p.x+ux*d,p.y+uy*d,0,p.x+ux*d,p.y+uy*d,rr2*2.2);
      g.addColorStop(0,col); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(p.x+ux*d,p.y+uy*d,rr2*2.2,0,6.28); ctx.fill(); } ctx.restore(); }
  function drawProjectile(p){
    // CAS-403 (board CAS-402): EVERY ranged attack draws its in-flight sprite, enemy shots
    // included. This reverses CAS-304's early-return that hid enemy spear/bolt — the board
    // now wants the attacks themselves visible ("haz que los ataques sean visibles"); what
    // must NOT show are the ground-marked target areas and direction arrows (removed in the
    // windup telegraph block above). Presentation-only: sim.js untouched.
    if(p.kind==="fire"){ const fl=Math.sin(G.t*22+p.x)*0.5+0.5; // CAS-1545: molten comet — flame bloom, hot core, ember tail
      fxTrail(p,"#ef8a2e",6,4);
      fxGlow(p.x,p.y,16+fl*3,COL.flame,0.85); fxGlow(p.x,p.y,9,COL.flameL,0.9);
      ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,6.28); ctx.fill();
      ctx.fillStyle="#ffc24d"; ctx.beginPath(); ctx.arc(p.x,p.y,3.2,0,6.28); ctx.fill();
      ctx.fillStyle="#fff3c8"; ctx.beginPath(); ctx.arc(p.x,p.y,1.6,0,6.28); ctx.fill(); }
    else if(p.kind==="rune"){ const pu=Math.sin(G.t*10)*0.5+0.5; // CAS-1545: glowing arcane sigil
      fxGlow(p.x,p.y,13+pu*2,COL.rune,0.75);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(G.t*2);
      ctx.fillStyle=COL.rune; ctx.fillRect(-4,-4,8,8); ctx.fillStyle="#aac4ff"; ctx.fillRect(-2.5,-2.5,5,5);
      ctx.fillStyle="#eaf1ff"; ctx.fillRect(-1,-1,2,2); ctx.restore(); }
    // CAS-121 Freeze Nova shard — a pale-blue ice splinter (the boss's punish-ring).
    else if(p.kind==="frostnova"){ const a=Math.atan2(p.vy,p.vx);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.globalAlpha=0.3; ctx.fillStyle="#7fd0ff"; ctx.beginPath(); ctx.arc(0,0,8,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#bfefff"; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-4,-3.5); ctx.lineTo(-4,3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#eafaff"; ctx.fillRect(-1.5,-1.5,3,3); ctx.restore(); }
    else if(p.kind==="spear"){ const img=IMG.prop_spear; const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx);
      if(img&&img.complete&&img.naturalWidth){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.imageSmoothingEnabled=false; const s=0.85; ctx.drawImage(img,-img.naturalWidth*s/2,-img.naturalHeight*s/2,img.naturalWidth*s,img.naturalHeight*s); ctx.restore(); }
      else { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.fillStyle="#cdb892"; ctx.fillRect(-10,-1.5,20,3); ctx.fillStyle="#e6ecf4"; ctx.fillRect(8,-2.5,5,5); ctx.restore(); } }
    else if(p.kind==="bolt"){ const pu=Math.sin(G.t*18)*0.5+0.5; // CAS-1545: arcane dart — comet trail + layered glow + white core
      fxTrail(p,"#7bd44a",5,4);
      fxGlow(p.x,p.y,14+pu*3,"#9bef5a",0.7);
      ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,6.28); ctx.fill();
      ctx.fillStyle="#d6ffb0"; ctx.beginPath(); ctx.arc(p.x,p.y,3,0,6.28); ctx.fill();
      fxCore(p.x,p.y,2.2,"#eafff0",1); }
    else if(p.kind==="arrow"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx); // CAS-1545: fletched shaft + speed-line streak
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=0.5; ctx.strokeStyle="#ffe7a8"; ctx.lineCap="round"; ctx.lineWidth=3.5; ctx.beginPath(); ctx.moveTo(-26,0); ctx.lineTo(2,0); ctx.stroke();
      ctx.globalAlpha=0.9; ctx.lineWidth=1.4; ctx.strokeStyle="#fff6d8"; ctx.beginPath(); ctx.moveTo(-16,0); ctx.lineTo(4,0); ctx.stroke(); ctx.restore();
      ctx.fillStyle="#6e4f33"; ctx.fillRect(-10,-1,16,2);
      ctx.fillStyle="#e8edf4"; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(0,-3.5); ctx.lineTo(0,3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#cf9a38"; ctx.fillRect(-10,-2.5,2,5); ctx.restore();
      fxCore(p.x+Math.cos(a)*6,p.y+Math.sin(a)*6,2.4,"#fff6d8",0.8); }
    else if(p.kind==="orb"){ const pu=Math.sin(G.t*16)*0.5+0.5; // CAS-1545: charged sphere — swirling orbit motes + dense core
      fxTrail(p,"#7bd44a",7,4);
      fxGlow(p.x,p.y,20+pu*4,"#9bef5a",0.6); fxGlow(p.x,p.y,11,"#bcff8a",0.7);
      ctx.fillStyle="#bcff8a"; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,6.28); ctx.fill();
      fxCore(p.x,p.y,2.6,"#f2ffe6",1);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle="#eafff0"; // orbiting motes
      for(let i=0;i<3;i++){ const oa=G.t*7+i*2.094, orr=8+pu*2; ctx.globalAlpha=0.55+0.35*Math.sin(oa*1.7);
        ctx.fillRect(p.x+Math.cos(oa)*orr-1.5,p.y+Math.sin(oa)*orr*0.6-1.5,3,3); } ctx.restore(); }
    // CAS-1920: CUCHILLO ARROJADIZO — hoja de acero recta que gira en vuelo (tinte/glyph procedural, $0 asset).
    else if(p.kind==="knife"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx); const spin=G.t*24+p.x*0.3;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a+Math.sin(spin)*0.5);
      ctx.fillStyle="#8a94a4"; ctx.fillRect(-7,-1.6,14,3.2);                 // hoja
      ctx.fillStyle=p.col||"#d8dee8"; ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(1,-2.4); ctx.lineTo(1,2.4); ctx.closePath(); ctx.fill(); // punta brillante
      ctx.fillStyle="#3a2c1e"; ctx.fillRect(-9,-1.8,3,3.6);                  // guarda/mango
      ctx.restore();
      fxCore(p.x+Math.cos(a)*6,p.y+Math.sin(a)*6,1.6,"#f2f6ff",0.7); }
    // CAS-1920: BOMBA INCENDIARIA — orbe con mecha ardiente + estela de humo; estalla en burn+aoe al impacto (updateProjectiles).
    else if(p.kind==="firebomb"){ const fl=Math.sin(G.t*20+p.x)*0.5+0.5;
      fxTrail(p,"#c65a20",6,4);
      fxGlow(p.x,p.y,14+fl*3,p.col||"#ff7a3c",0.8);
      ctx.fillStyle="#3a2114"; ctx.beginPath(); ctx.arc(p.x,p.y,4.4,0,6.28); ctx.fill();     // vasija de barro
      ctx.fillStyle=p.col||"#ff7a3c"; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,6.28); ctx.fill();
      ctx.fillStyle="#ffe08a"; ctx.beginPath(); ctx.arc(p.x-2,p.y-4,1.4+fl,0,6.28); ctx.fill(); // mecha
      fxCore(p.x,p.y,1.3,"#fff3c8",0.9); }
    // ---- spell projectiles (paladin/mage/priest slot 2-4) ----
    else if(p.kind==="judgment"){ const pu=Math.sin(G.t*20)*0.5+0.5; // CAS-1545: descending bolt of light — radiant star + glow column
      fxGlow(p.x,p.y,18+pu*4,"#ffe39a",0.7); fxGlow(p.x,p.y,9,"#fff6d8",0.85);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle="#ffd24d";
      ctx.fillRect(p.x-2,p.y-11,4,22); ctx.fillRect(p.x-11,p.y-2,22,4); // long 4-point star
      ctx.fillRect(p.x-1.4,p.y-7,2.8,14); ctx.fillRect(p.x-7,p.y-1.4,14,2.8); ctx.restore();
      fxCore(p.x,p.y,3,"#fffef0",1); }
    else if(p.kind==="voltbolt"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx); const zz=Math.sin(G.t*40)*3; // CAS-1545: crackling lightning dart
      fxGlow(p.x,p.y,13,"#9be7ff",0.7);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.globalCompositeOperation="lighter"; ctx.lineCap="round";
      ctx.globalAlpha=0.55; ctx.strokeStyle="#9be7ff"; ctx.lineWidth=4.5; ctx.beginPath(); ctx.moveTo(-34,0); ctx.lineTo(6,0); ctx.stroke();
      ctx.globalAlpha=0.9; ctx.strokeStyle="#eaffff"; ctx.lineWidth=1.6; // jagged bolt spine
      ctx.beginPath(); ctx.moveTo(-30,zz*0.4); ctx.lineTo(-20,-zz*0.5); ctx.lineTo(-10,zz*0.5); ctx.lineTo(0,-zz*0.3); ctx.lineTo(6,0); ctx.stroke();
      ctx.fillStyle="#eaffff"; ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-2,-4.5); ctx.lineTo(-2,4.5); ctx.closePath(); ctx.fill(); ctx.restore();
      fxCore(p.x+Math.cos(a)*7,p.y+Math.sin(a)*7,2.6,"#ffffff",1); }
    else if(p.kind==="holybolt"){ const pu=Math.sin(G.t*16)*0.5+0.5; // CAS-1545: sacred mote — golden bloom + cross flare
      fxGlow(p.x,p.y,16+pu*3,"#fff0b0",0.75); fxGlow(p.x,p.y,8,"#fff6d8",0.85);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(p.x,p.y,5,0,6.28); ctx.fill();
      ctx.fillStyle="#ffd24d"; ctx.fillRect(p.x-1.2,p.y-7,2.4,14); ctx.fillRect(p.x-7,p.y-1.2,14,2.4); ctx.restore();
      fxCore(p.x,p.y,2.2,"#fffef0",1); } }
  // Persistent ground zone (druid thornstorm). Pulses with the tick clock, fades as
  // it expires. Cosmetic-only: reads field state, jitter from the isolated render RNG.
  function drawField(f){ const col=f.col||"#5fae4a", life=clamp(f.life/(f.maxLife||f.life),0,1);
    const pulse=0.5+0.5*Math.sin(G.t*9), a=0.16*life+0.10*pulse*life;
    ctx.globalAlpha=a; ctx.fillStyle=col; ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,6.28); ctx.fill();
    ctx.globalAlpha=0.5*life; ctx.strokeStyle=col; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,f.r,0,6.28); ctx.stroke();
    // thorn spikes around the rim (deterministic angles; render-side flicker only)
    ctx.globalAlpha=(0.45+0.4*pulse)*life; ctx.fillStyle=col;
    for(let i=0;i<14;i++){ const ang=i/14*6.28 + G.t*0.4, r=f.r*(0.62+0.3*((i*5)%4)/3);
      ctx.fillRect(f.x+Math.cos(ang)*r-2, f.y+Math.sin(ang)*r-2, 4,4); }
    ctx.globalAlpha=1; }
  // CAS-1545: purchased pixel-art VFX strips (assets/fx/*_strip.png). Draws the animation
  // frame for this effect's life-progress, centred at (x,y), scaled to `size` px, optionally
  // rotated to the attack angle. Returns false if the strip isn't loaded yet -> caller falls
  // back to the procedural draw (graceful during asset load). Presentation-only, no RNG.
  // CAS-2216: per-cast element tint for the pilot Fire-Nova strip. The purchased fx_nova strip is
  // baked ORANGE, so cold/nature casts (frost/vines) read as fire. We recolour the whole strip once
  // per element colour (cached) using a "color" blend that keeps the sprite's LUMINANCE (bright core
  // stays bright) while adopting the element's hue+saturation, then clip back to the sprite alpha.
  const _fxTintCache=(typeof document!=="undefined")?Object.create(null):null;
  function tintedFxStrip(im,name,col){
    if(!_fxTintCache) return im;
    const ck=name+"|"+col; let cv=_fxTintCache[ck]; if(cv) return cv;
    const w=im.naturalWidth, h=im.naturalHeight;
    cv=document.createElement("canvas"); cv.width=w; cv.height=h;
    const g=cv.getContext("2d"); g.imageSmoothingEnabled=false;
    g.drawImage(im,0,0);
    g.globalCompositeOperation="color"; g.fillStyle=col; g.fillRect(0,0,w,h); // hue/sat of col, keep sprite luminance
    g.globalCompositeOperation="destination-in"; g.drawImage(im,0,0);         // restore original alpha mask
    g.globalCompositeOperation="source-over";
    _fxTintCache[ck]=cv; return cv; }
  // Decide whether a cast colour warrants a tint. Warm/fire (red-dominant) casts keep the default
  // orange strip untinted; cold/nature (blue- or green-leaning) casts get recoloured.
  function fxTintFor(col){
    if(!col||col[0]!=="#"||col.length<7) return null;
    const r=parseInt(col.slice(1,3),16), g=parseInt(col.slice(3,5),16), b=parseInt(col.slice(5,7),16);
    if(r>=g && r>=b && (r-b)>40) return null; // fire/warm → default orange strip
    return col; }
  function drawFxSprite(name,x,y,prog,size,ang,tint){ const im0=IMG["fx_"+name], m=FX_STRIP&&FX_STRIP[name];
    if(!PIXELART.spritesEnabled) return false;  // CAS-2208: master A/B gate ⇒ caller (drawFx) falls to procedural FX
    if(!m||!im0||!im0.complete||!im0.naturalWidth) return false;
    const im=tint?tintedFxStrip(im0,name,tint):im0;
    const fi=clamp(Math.floor(prog*m.n),0,m.n-1), fw=m.fw, s=size/fw;
    ctx.save(); ctx.imageSmoothingEnabled=false; ctx.translate(x,y); if(ang!=null) ctx.rotate(ang); ctx.scale(s,s);
    ctx.drawImage(im, fi*fw, 0, fw, fw, -fw/2, -fw/2, fw, fw); ctx.restore(); return true; }
  // fx.kind -> { sprite, fixed size OR size = radius*sizeR, rotate-to-angle }. These purchased
  // sprites REPLACE the procedural draw for the mapped kinds (procedural stays as fallback).
  const FXSPRITEMAP={ swing:{s:"slash",size:78,rot:true}, slashArc:{s:"slash",size:70,rot:true},
    flame:{s:"fire",size:86}, spellburst:{s:"nova",size:96}, novacast:{s:"nova",sizeR:1.8,rDef:90},
    holynova:{s:"holy",sizeR:2.0,rDef:80}, hitburst:{s:"impact",size:54}, impact:{s:"impact",size:60},
    shockring:{s:"crit",sizeR:2.4,rDef:44},
    healburst:{s:"heal",size:64}, orbburst:{s:"arcane",size:72}, blink:{s:"arcane",size:80},
    thornfield:{s:"thorn",sizeR:1.4,rDef:72}, spark:{s:"spark",size:60} };
  function drawFx(f){ const k=clamp(1-f.t/f.life,0,1), sw=1-k;
    const SM=FXSPRITEMAP[f.kind];
    if(SM && !G.settings.reduceMotion){ const size=SM.size || ((f.r||SM.rDef||80)*(SM.sizeR||1));
      const ang=SM.rot? (f.ang||0) : null;
      const tint=(SM.s==="nova")? fxTintFor(f.col) : null; // CAS-2216: recolour the Fire-Nova strip per element (frost=blue, nature=green; fire stays orange)
      if(drawFxSprite(SM.s, f.x, f.y, clamp(f.t/f.life,0,1), size, ang, tint)) return; }
    if(f.kind==="chainbolt"){ // CAS-1570: jagged lightning arc from (f.x,f.y) → (f.x2,f.y2)
      const x2=(f.x2!=null)?f.x2:f.x, y2=(f.y2!=null)?f.y2:f.y; const col=f.col||"#bfe6ff";
      const seg=6, dx=(x2-f.x)/seg, dy=(y2-f.y)/seg, nx=-(y2-f.y), ny=(x2-f.x), nl=Math.hypot(nx,ny)||1;
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=k;
      ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(f.x,f.y);
      for(let i=1;i<seg;i++){ const j=(((i*2654435761)>>>0)%100/100-0.5)*10*(1-Math.abs(i/seg-0.5)*2);
        ctx.lineTo(f.x+dx*i+nx/nl*j, f.y+dy*i+ny/nl*j); }
      ctx.lineTo(x2,y2); ctx.stroke();
      ctx.strokeStyle="#ffffff"; ctx.lineWidth=1; ctx.stroke(); ctx.restore(); return; }
    if(f.kind==="spark"){ const ease=sw*sw*(3-2*sw); // CAS-1545: white-hot star-burst — bloom + streaked shards
      fxGlow(f.x,f.y,sw*24,"#cfe6ff",k*0.7);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=k; ctx.fillStyle=COL.spark;
      for(let i=0;i<9;i++){ const a=i/9*6.28+f.t*7; const r=ease*26; const s=1.5+(1-sw)*2.5;
        ctx.fillRect(f.x+Math.cos(a)*r-s/2,f.y+Math.sin(a)*r-s/2,s,s); }
      ctx.globalAlpha=k*0.9; ctx.beginPath(); ctx.arc(f.x,f.y,(1-sw)*10+3,0,6.28); ctx.fill(); ctx.restore(); }
    else if(f.kind==="blood"){ ctx.globalAlpha=k*0.92; ctx.fillStyle=COL.blood; for(let i=0;i<9;i++){ const a=(f.ang||0)+rr(-1.0,1.0); const r=sw*26; const s=2+((i*7)%3); ctx.fillRect(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,s,s);} ctx.globalAlpha=1; }
    else if(f.kind==="flame"){ const ease=sw*sw*(3-2*sw); // CAS-1545: fire bloom — layered heat + licking tongues + white core
      fxGlow(f.x,f.y,sw*40,COL.flame,k*0.8); fxGlow(f.x,f.y,sw*22,COL.flameL,k*0.85);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=k; ctx.fillStyle=COL.flame;
      for(let i=0;i<8;i++){ const a=i/8*6.28+f.t*2; const r=ease*30; ctx.fillRect(f.x+Math.cos(a)*r-2.5,f.y+Math.sin(a)*r-2.5,5,5); }
      ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(f.x,f.y,sw*17,0,6.28); ctx.fill();
      ctx.fillStyle="#fff3c8"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*8,0,6.28); ctx.fill(); ctx.restore(); }
    else if(f.kind==="heal"){ ctx.globalAlpha=k; ctx.fillStyle=COL.heal; const yy=f.y-sw*26; ctx.fillRect(f.x-2,yy-5,4,12); ctx.fillRect(f.x-5,yy-2,12,4); ctx.globalAlpha=1; }
    else if(f.kind==="rune"){ ctx.globalAlpha=k*0.85; ctx.strokeStyle=COL.rune; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=k*0.5; ctx.strokeStyle="#cfe0ff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=1; }
    else if(f.kind==="poof"){ ctx.globalAlpha=k*0.7; ctx.fillStyle="#3a3a3a"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*16,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="dust"){ ctx.globalAlpha=k*0.45; ctx.fillStyle="#8d8576"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*6+1.5,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="swing"){ const a0=(f.ang||0)-0.9+sw*1.3;
      if(f.fx==="thorns"){ ctx.globalAlpha=k; ctx.fillStyle="#8fd47a"; for(let i=0;i<11;i++){ const aa=(f.ang||0)+(i-5)*0.17, r=12+sw*42; ctx.fillRect(f.x+Math.cos(aa)*r-2,f.y+Math.sin(aa)*r-2,4,4);} ctx.globalAlpha=k*0.55; ctx.strokeStyle="#4f8f3a"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,20+sw*26,(f.ang||0)-0.62,(f.ang||0)+0.62); ctx.stroke(); ctx.globalAlpha=1; }
      else { const R=22+sw*16, a1=a0+1.25; ctx.lineCap="round"; // CAS-1545: bladed slash — wide steel body + white leading edge + tip spark
        ctx.save(); ctx.globalCompositeOperation="lighter";
        ctx.globalAlpha=k*0.4; ctx.strokeStyle="#7fa8dd"; ctx.lineWidth=16; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0,a1); ctx.stroke(); // soft glow body
        ctx.globalAlpha=k*0.75; ctx.strokeStyle="#bcd2ee"; ctx.lineWidth=9; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0+0.06,a1); ctx.stroke();
        ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=3.2; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0+0.28,a1); ctx.stroke(); // bright leading edge
        const tx=f.x+Math.cos(a1)*R, ty=f.y+Math.sin(a1)*R; ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(tx,ty,3.2,0,6.28); ctx.fill();
        ctx.restore(); ctx.lineCap="butt"; } }
    else if(f.kind==="holynova"){ const R=f.r||80, r2=sw*R; // CAS-211 (d): power/AoE signature leads CRIMSON + cold blue-white (palette-lock), not warm holy-gold — pairs with the shockring shell
      ctx.globalAlpha=k; ctx.strokeStyle="#d8403f"; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.85; ctx.strokeStyle="#dbeeff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.45; ctx.fillStyle="#dbeeff"; ctx.beginPath(); ctx.arc(f.x,f.y,k*22,0,6.28); ctx.fill();
      ctx.globalAlpha=k*0.7; ctx.strokeStyle="#b3242a"; ctx.lineWidth=3; for(let i=0;i<8;i++){ const a=i/8*6.28; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r2*0.55,f.y+Math.sin(a)*r2*0.55); ctx.lineTo(f.x+Math.cos(a)*r2,f.y+Math.sin(a)*r2); ctx.stroke(); } ctx.globalAlpha=1; }
    else if(f.kind==="orbburst"){ const ease=sw*sw*(3-2*sw); const r=ease*44; // CAS-1545: arcane detonation — bloom + snap shell + white core + scatter
      fxGlow(f.x,f.y,sw*40,"#9bef5a",k*0.7);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k*0.8; ctx.strokeStyle="#9bef5a"; ctx.lineWidth=4-sw*2.5; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*k; ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(f.x,f.y,(1-sw)*16+3,0,6.28); ctx.fill();
      ctx.globalAlpha=k; ctx.fillStyle="#bcff8a"; for(let i=0;i<10;i++){ const a=i/10*6.28+f.t*4; const r3=ease*48; const s=2+(1-sw)*2; ctx.fillRect(f.x+Math.cos(a)*r3-s/2,f.y+Math.sin(a)*r3-s/2,s,s);} ctx.restore(); ctx.globalAlpha=1; }
    else if(f.kind==="impact"){ const ease=sw*sw*(3-2*sw); // CAS-1545: hit flash — eased snap ring + bloom + cross shards
      fxGlow(f.x,f.y,sw*20,"#dbeeff",k*0.6);
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=3.5-sw*2; ctx.beginPath(); ctx.arc(f.x,f.y,ease*22,0,6.28); ctx.stroke();
      ctx.fillStyle="#ffffff"; for(let i=0;i<6;i++){ const a=(f.ang||0)+i/6*6.28; const r=ease*20; const s=1.5+(1-sw)*2; ctx.fillRect(f.x+Math.cos(a)*r-s/2,f.y+Math.sin(a)*r-s/2,s,s);} ctx.restore(); ctx.globalAlpha=1; }
    // CAS-210 windup charge tell (orange→red pulse rings) — CAS-403 (board CAS-402): reads
    // as a marked ground area → draw NOTHING. The fx still spawns in sim.js (addFx order and
    // the fx RNG stream untouched → determinism intact); render just skips it.
    else if(f.kind==="windupring"){ }
    else if(f.kind==="telegraphmark"){ // CAS-1790 heavy wind-up cue — presentation only, spawned by sim only when TELEGRAPH.enabled (knob OFF ⇒ this fx never exists). k=remaining life ⇒ contracts toward the strike instant.
      if(f.ground){ // (b) anticipatory ground ring for radial bursts — sized to the blast, "step out / roll" before the runes fly
        const R=(f.r||96)*(0.82+0.18*k), cy=f.y+(f.oy||0);
        ctx.save();
        ctx.globalAlpha=0.12+0.20*k; ctx.fillStyle="#b3242a";
        ctx.beginPath(); ctx.ellipse(f.x,cy,R,R*0.5,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.35+0.35*Math.abs(Math.sin(G.t*14)); ctx.strokeStyle="#ff5230"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse(f.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.restore();
      } else { // (a) single strong "heavy incoming" ring closing onto the unit — distinct from the trash windupring flash
        const fl=Math.floor(G.t*16)%2===0, R=6+(f.r||24)*k;
        ctx.save();
        ctx.globalAlpha=(fl?0.92:0.5)*Math.max(k,0.18); ctx.strokeStyle="#ffcaa0"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(f.x,f.y,R,0,6.28); ctx.stroke();
        ctx.globalAlpha*=0.55; ctx.strokeStyle="#ff5230"; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(f.x,f.y,R+3,0,6.28); ctx.stroke();
        ctx.restore();
      }
    }
    else if(f.kind==="telegraphline"){ // CAS-1820 directional LUNGE lane tell — presentation only (sim spawns it ONLY for a lunge-special windup, so knob OFF ⇒ this fx never exists). Wedge along the LOCKED facing ⇒ "step out of the lane". k=remaining life ⇒ brightens toward the strike instant.
      const a=f.ang||0, len=f.len||120, w=f.w||16;
      const ux=Math.cos(a), uy=Math.sin(a), px=-uy, py=ux;   // unit forward + left-normal
      const w0=w, w1=w*0.6;                                  // slight taper toward the tip
      ctx.save();
      ctx.globalAlpha=0.10+0.18*k; ctx.fillStyle="#b3242a";  // translucent lane fill (matches the ground-mark red)
      ctx.beginPath();
      ctx.moveTo(f.x+px*w0, f.y+py*w0);
      ctx.lineTo(f.x+ux*len+px*w1, f.y+uy*len+py*w1);
      ctx.lineTo(f.x+ux*len-px*w1, f.y+uy*len-py*w1);
      ctx.lineTo(f.x-px*w0, f.y-py*w0);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha=0.35+0.4*Math.abs(Math.sin(G.t*14)); ctx.strokeStyle="#ff5230"; ctx.lineWidth=2; // pulsing edges
      ctx.beginPath(); ctx.moveTo(f.x+px*w0,f.y+py*w0); ctx.lineTo(f.x+ux*len+px*w1,f.y+uy*len+py*w1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(f.x-px*w0,f.y-py*w0); ctx.lineTo(f.x+ux*len-px*w1,f.y+uy*len-py*w1); ctx.stroke();
      ctx.restore();
    }
    else if(f.kind==="strikeflash"){ ctx.globalAlpha=k*0.9; ctx.strokeStyle="#dbeeff"; ctx.lineWidth=4; // CAS-211 (d): cold blue-white, FOUNTAINS signal-lock
      if(f.range){ ctx.beginPath(); ctx.arc(f.x,f.y,(f.range)*(0.6+sw*0.5),(f.ang||0)-0.7,(f.ang||0)+0.7); ctx.stroke(); }
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*10+2,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="dodgering"){ ctx.globalAlpha=k*0.8; ctx.strokeStyle="#bfeaff"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,10+sw*30,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(f.x,f.y,10+sw*30,0,6.28); ctx.stroke(); ctx.globalAlpha=1; }
    // ---- generic, colour-parameterised spell FX (data-driven; one effect serves many spells) ----
    else if(f.kind==="novacast"){ const R=f.r||90, ease=sw*sw*(3-2*sw), r2=ease*R, col=f.col||"#ffffff"; // CAS-1545: expanding shockwave — eased snap + glow rim + white edge
      fxGlow(f.x,f.y,r2*0.9,col,k*0.35);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=6-sw*4; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.9; ctx.strokeStyle="#ffffff"; ctx.lineWidth=1.6; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke(); ctx.restore();
      const spokes=f.style==="spike"?12:8; ctx.globalAlpha=k*0.7; ctx.fillStyle=col; ctx.strokeStyle=col;
      for(let i=0;i<spokes;i++){ const a=i/spokes*6.28;
        if(f.style==="spike"){ const r3=r2*0.92; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r3,f.y+Math.sin(a)*r3); ctx.lineTo(f.x+Math.cos(a)*(r2+8),f.y+Math.sin(a)*(r2+8)); ctx.lineWidth=3; ctx.stroke(); }
        else if(f.style==="crystal"){ ctx.fillRect(f.x+Math.cos(a)*r2-3,f.y+Math.sin(a)*r2-3,6,6); }
        else { ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r2*0.5,f.y+Math.sin(a)*r2*0.5); ctx.lineTo(f.x+Math.cos(a)*r2,f.y+Math.sin(a)*r2); ctx.stroke(); } }
      ctx.globalAlpha=1; }
    else if(f.kind==="conecast"){ const R=f.range||70, col=f.col||"#ffffff", a=f.ang||0, rr2=R*(0.5+sw*0.5); // CAS-1545: gushing cone — glowing wedge fill + streaked motes
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k*0.28; ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.arc(f.x,f.y,rr2,a-0.7,a+0.7); ctx.closePath(); ctx.fill();
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(f.x,f.y,rr2,a-0.7,a+0.7); ctx.stroke();
      ctx.globalAlpha=k*0.75; ctx.fillStyle=col; for(let i=0;i<9;i++){ const aa=a+((i%3-1))*0.28, r=R*sw*(0.4+0.6*((i*7)%5)/5); const s=2+(i%3); ctx.fillRect(f.x+Math.cos(aa)*r-s/2,f.y+Math.sin(aa)*r-s/2,s,s);} ctx.restore(); ctx.globalAlpha=1; }
    else if(f.kind==="buffaura"){ const col=f.col||"#ffd24d"; // CAS-1545: empower halo — glowing rising motes spiralling up
      fxGlow(f.x,f.y+6,14+sw*10,col,k*0.4);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k*0.85; ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(f.x,f.y+6,14+sw*22,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.fillStyle="#fff6d8"; for(let i=0;i<8;i++){ const a=i/8*6.28 - f.t*3; const r=12+sw*18; ctx.fillRect(f.x+Math.cos(a)*r-1.5, f.y+6+Math.sin(a)*r-1.5 - sw*20, 3,3);} ctx.restore(); ctx.globalAlpha=1; }
    else if(f.kind==="healburst"){ const col=f.col||COL.heal; // CAS-1545: restorative bloom — soft glow + rising cross
      fxGlow(f.x,f.y+4,sw*26,col,k*0.5);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=3.5; ctx.beginPath(); ctx.arc(f.x,f.y+4,sw*30,0,6.28); ctx.stroke();
      const yy=f.y+4-sw*24; ctx.fillStyle="#c8ffd8"; ctx.fillRect(f.x-3,yy-7,6,16); ctx.fillRect(f.x-7,yy-3,16,6);
      ctx.fillStyle="#ffffff"; ctx.fillRect(f.x-1.5,yy-1.5,3,3); ctx.restore(); ctx.globalAlpha=1; }
    else if(f.kind==="charge"){ const col=f.col||"#e8d28a", a=f.ang||0; ctx.globalAlpha=k*0.8; ctx.strokeStyle=col; ctx.lineWidth=5; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.x-Math.cos(a)*sw*42, f.y-Math.sin(a)*sw*42); ctx.stroke(); ctx.lineCap="butt";
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.fillRect(f.x+Math.cos(a)*6-2,f.y+Math.sin(a)*6-2,4,4); ctx.globalAlpha=1; }
    else if(f.kind==="spellburst"){ const col=f.col||"#ffffff", ease=sw*sw*(3-2*sw); // CAS-1545: cast detonation — bloom + snap ring + white core + shard scatter
      fxGlow(f.x,f.y,sw*34,col,k*0.7);
      ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=3.5-sw*2; ctx.beginPath(); ctx.arc(f.x,f.y,ease*28,0,6.28); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.globalAlpha=k; ctx.fillStyle=col;
      for(let i=0;i<10;i++){ const a=i/10*6.28+f.t*3; const r=ease*26; const s=1.5+(1-sw)*2; ctx.fillRect(f.x+Math.cos(a)*r-s/2,f.y+Math.sin(a)*r-s/2,s,s);}
      ctx.globalAlpha=k*k; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,(1-sw)*10+3,0,6.28); ctx.fill(); ctx.restore(); ctx.globalAlpha=1; }
    else if(f.kind==="blink"){ const col=f.col||"#9be7ff", a=f.ang||0;
      // arrival flares outward (sw small→large), departure collapses inward — a clear teleport read
      const r=f.arrive? sw*30 : (1-sw)*30; ctx.globalAlpha=k*0.85; ctx.strokeStyle=col; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.arc(f.x,f.y,r+6,0,6.28); ctx.stroke();
      ctx.fillStyle="#eaffff"; for(let i=0;i<8;i++){ const aa=i/8*6.28 + (f.arrive?0:1.4); ctx.fillRect(f.x+Math.cos(aa)*r-1.5,f.y+Math.sin(aa)*r-1.5,3,3); }
      ctx.globalAlpha=k*0.5; ctx.strokeStyle=col; ctx.lineWidth=4; ctx.lineCap="round"; ctx.beginPath();
      ctx.moveTo(f.x,f.y); ctx.lineTo(f.x-Math.cos(a)*sw*18,f.y-Math.sin(a)*sw*18); ctx.stroke(); ctx.lineCap="butt"; ctx.globalAlpha=1; }
    else if(f.kind==="thornfield"){ const col=f.col||"#5fae4a", R=f.r||72, r2=sw*R;
      ctx.globalAlpha=k*0.8; ctx.strokeStyle=col; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.fillStyle=col; for(let i=0;i<14;i++){ const a=i/14*6.28; const r3=r2*0.9;
        ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r3,f.y+Math.sin(a)*r3); ctx.lineTo(f.x+Math.cos(a)*(r2+10),f.y+Math.sin(a)*(r2+10)); ctx.lineWidth=3; ctx.stroke(); }
      ctx.globalAlpha=1; }
    // CAS-127: level-up flourish — twin gold rings expanding off the hero's feet.
    else if(f.kind==="lvlring"){ const r=sw*48; ctx.globalAlpha=k*0.9; ctx.strokeStyle="#ffe27a"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y+6,r,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.55; ctx.strokeStyle="#fff6d0"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y+6,r*0.6,0,6.28); ctx.stroke(); ctx.globalAlpha=1; }
    // CAS-127: rarity-coloured loot-pickup pop — an expanding ring + a quick sparkle ring
    // in the item's rarity colour, so collecting an item reads with weight.
    else if(f.kind==="lootpop"){ const col=f.col||"#cfe0ff", r=sw*30; ctx.globalAlpha=k*0.85; ctx.strokeStyle=col; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.fillStyle=col; for(let i=0;i<6;i++){ const a=i/6*6.28+f.t*5; const r3=sw*34; ctx.fillRect(f.x+Math.cos(a)*r3-1.5,f.y+Math.sin(a)*r3-1.5,3,3); } ctx.globalAlpha=1; }
    // ---- CAS-204: FOUNTAINS-style impact crunch (stylized crimson blood + white-hot flash) ----
    // hitburst — the white-hot pop at the moment of contact: a fast hard-edged ring that snaps
    // outward in the first frames, a solid core flash, and a 4-point cross spark. Reads as "CLACK".
    else if(f.kind==="hitburst"){ const ease=sw*sw*(3-2*sw); const r2=ease*26; // CAS-1545: ease-out pop + cold bloom + hot star
      fxGlow(f.x,f.y,(1-sw)*16+6,"#dbeeff",k*k*0.8);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=4-sw*2.5; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*k; ctx.fillStyle="#eaf2ff"; ctx.beginPath(); ctx.arc(f.x,f.y,(1-sw)*10,0,6.28); ctx.fill(); // CAS-211 (d): cold core, not warm peach
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; const cl=(1-sw)*16+4; const a0=f.ang||0; // a 4-point star kicked toward the hit angle
      for(let i=0;i<4;i++){ const a=a0+i*1.5708; const el=i%2?cl*0.6:cl; ctx.fillRect(f.x+Math.cos(a)*el-1.5,f.y+Math.sin(a)*el-1.5,3,3); } ctx.restore(); ctx.globalAlpha=1; }
    // debris — chunky pixel chips thrown in a CONE along the knockback direction (not radial),
    // FOUNTAINS-stylized crimson gore so blood reads as launched, not sprayed in place.
    else if(f.kind==="debris"){ ctx.globalAlpha=k*0.95; const a0=f.ang||0;
      for(let i=0;i<12;i++){ const a=a0+(((i*73)%100)/100-0.5)*1.1; const sp=12+((i*37)%44); const r=sw*sp;
        const s=3+((i*5)%5); ctx.fillStyle=i%3===0?"#d8403f":(i%3===1?"#b3242a":"#6e1418");
        ctx.fillRect(f.x+Math.cos(a)*r, f.y+Math.sin(a)*r + sw*sw*12, s,s); }
      const bigs=6+((f.life*10|0)%3), abig=a0+(((f.life*7|0)*29%100)/100-0.5)*0.5;
      ctx.fillStyle="#9b1a1f"; ctx.fillRect(f.x+Math.cos(abig)*sw*18-bigs*0.5, f.y+Math.sin(abig)*sw*18+sw*sw*8, bigs, bigs);
      ctx.globalAlpha=1; }
    // bloodstain — dark crimson pixel cluster at the hit location; lingers so violence reads as "was here".
    else if(f.kind==="bloodstain"){ ctx.globalAlpha=k*0.50; const a0=f.ang||0;
      const cols=["#3d0a0c","#5a1215","#6e1418","#4a0e10"];
      for(let i=0;i<9;i++){ const a=a0+(((i*59)%100)/100-0.5)*3.14; const r=3+((i*11)%14);
        const s=3+((i*7)%5); ctx.fillStyle=cols[i%4];
        ctx.fillRect(f.x+Math.cos(a)*r-s*0.5, f.y+Math.sin(a)*r-s*0.5, s,s); } ctx.globalAlpha=1; }
    // shockring — the heavy-hit signature reserved for crits/finishers: twin rings race outward.
    else if(f.kind==="shockring"){ const R=f.r||44, ease=sw*sw*(3-2*sw); // CAS-1545: crit/finisher signature — twin eased rings + bloom + crimson debris
      fxGlow(f.x,f.y,ease*R*0.7,"#cfe6ff",k*0.45);
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k; ctx.strokeStyle="#cfe6ff"; ctx.lineWidth=5-sw*4; ctx.beginPath(); ctx.arc(f.x,f.y,ease*R,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.7; ctx.strokeStyle="#ffffff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,ease*R*1.35,0,6.28); ctx.stroke(); ctx.restore();
      ctx.globalAlpha=k*0.6; ctx.fillStyle="#b3242a"; for(let i=0;i<10;i++){ const a=i/10*6.28+f.t*3; const r=ease*R*1.1; ctx.fillRect(f.x+Math.cos(a)*r-2,f.y+Math.sin(a)*r-2,4,4);} ctx.globalAlpha=1; }
    // slashArc — a bold directional crescent that sweeps through the hit on a melee connect:
    // a wide crimson body trailing a white leading edge, swung along the attack angle.
    else if(f.kind==="slashArc"){ const a0=(f.ang||0)-1.0+sw*1.5, a1=a0+1.15, R=18+(1-sw)*20; ctx.lineCap="round"; // CAS-1545: connect crescent — crimson body, glowing white edge, tip flare
      const body=f.crit?"#ffd24d":"#d8403f";
      ctx.globalAlpha=k*0.55; ctx.strokeStyle=body; ctx.lineWidth=11; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0,a1); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.globalAlpha=k*0.6; ctx.strokeStyle=f.crit?"#ffe9a8":"#ff6b6b"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0+0.1,a1); ctx.stroke();
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0+0.3,a1); ctx.stroke();
      const tx=f.x+Math.cos(a1)*R, ty=f.y+Math.sin(a1)*R; ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(tx,ty,3,0,6.28); ctx.fill();
      ctx.restore(); ctx.lineCap="butt"; ctx.globalAlpha=1; }
  }
  function drawAtkFx(cls,x,y,ang,p){ const a=Math.sin(Math.min(1,p)*Math.PI); if(a<=0.04) return;
    const dx=Math.cos(ang),dy=Math.sin(ang); ctx.save(); ctx.globalAlpha=a;
    // CAS-1545: per-class swing/cast tell — each gets a bloom underlay + brighter core so the
    // wind-up reads as *charged energy* not a thin outline. Palette per class-family.
    if(cls==="warrior"){ const r=13+p*9, a0=ang-0.95+p*1.1; // steel crescent w/ glow body + white edge
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.lineCap="round";
      ctx.globalAlpha=a*0.4; ctx.strokeStyle="#7fa8dd"; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(x,y,r,a0,a0+1.0); ctx.stroke();
      ctx.globalAlpha=a; ctx.strokeStyle="#eef3fa"; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(x,y,r,a0+0.12,a0+1.0); ctx.stroke(); ctx.restore(); }
    else if(cls==="paladin"){ const len=8+p*24; fxGlow(x+dx*len,y+dy*len,7,"#ffe7a8",a*0.7); // holy thrust
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.lineCap="round";
      ctx.globalAlpha=a*0.6; ctx.strokeStyle="#ffe7a8"; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx*len,y+dy*len); ctx.stroke();
      ctx.globalAlpha=a; ctx.strokeStyle="#fff6d8"; ctx.lineWidth=1.6; ctx.beginPath(); ctx.moveTo(x+dx*4,y+dy*4); ctx.lineTo(x+dx*len,y+dy*len); ctx.stroke();
      ctx.fillStyle="#fff"; ctx.fillRect(x+dx*len-2,y+dy*len-2,4,4); ctx.restore(); }
    else if(cls==="mage"){ fxGlow(x,y,10+p*10,"#9bef5a",a*0.7); // arcane charge
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(x,y,4+p*7,0,6.28); ctx.fill();
      ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(x,y,1.5+p*3,0,6.28); ctx.fill(); ctx.restore(); }
    else if(cls==="druid"){ fxGlow(x+dx*(6+p*10),y+dy*(6+p*10),9,"#8fd47a",a*0.5); // thorn spray
      ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle="#a8e88a";
      for(let i=0;i<6;i++){ const aa=ang+(i-2.5)*0.32, r=6+p*15; ctx.fillRect(x+Math.cos(aa)*r-1.5,y+Math.sin(aa)*r-1.5,3,3);} ctx.restore(); }
    else if(cls==="priest"){ fxGlow(x,y,8+p*10,"#ffe39a",a*0.65); // radiant pulse
      ctx.save(); ctx.globalCompositeOperation="lighter";
      ctx.strokeStyle="#ffe39a"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,4+p*13,0,6.28); ctx.stroke();
      ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(x,y,1.5+p*3,0,6.28); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }

  // ------------------------------- HUD -----------------------------------
  function bar(x,y,w,hh,frac,fg,bg,label){ ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,w+4,hh+4); ctx.fillStyle=bg; ctx.fillRect(x,y,w,hh);
    ctx.fillStyle=fg; ctx.fillRect(x,y,w*clamp(frac,0,1),hh); if(label){ ctx.fillStyle=COL.cream; ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.fillText(label,x+4,y+hh-2);} }
  // CAS-299: is the redesigned Tibia HUD (hud.js DOM overlay) currently the active UI?
  // When ON it OWNS the vitals/status/gold/name presentation, so the legacy on-canvas
  // duplicates below are suppressed to avoid a double-UI; the still-functional readouts
  // the HUD doesn't carry (consumable, spell bar, minimap, trackers, objective, progression
  // badges) stay on canvas but reflow clear of the HUD frames. Reads a live, read-only flag.
  function hudActive(){ try{ return !!(typeof window!=="undefined" && window.__hud && window.__hud.isOn()); }catch(e){ return false; } }

  // CAS-416 — audit-only rect export. When a QA harness sets window.__uiAudit=true,
  // renderHUD publishes the EXACT rects it just drew (trackers, banner, spell bar,
  // consumable, minimap) on window.__uiRects so tools/cas414-ui-audit.mjs can run a
  // DOM+canvas pairwise overlap check. Zero cost for players: one boolean test per
  // frame when off, and presentation-only either way (never read by the sim).
  let auditRects=null;
  function auditOn(){ try{ return !!(typeof window!=="undefined" && window.__uiAudit); }catch(e){ return false; } }
  function AR(k,x,y,w,h){ if(auditRects) auditRects[k]={x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)}; }

  function renderHUD(){ const h=G.hero; ctx.textAlign="left";
    const pad=12, bw=Math.min(220,VW*0.42);
    // CAS: fixed left sidebar (Tibia-style). When active it is the SOLE HUD — the DOM HUD is
    // force-hidden (game.js) and the scattered canvas vitals are suppressed (hudUI). Overlays
    // that belong over the world (zone/objective/banners) recentre on the visible game area.
    const sidebar=view.sbw>0, GCX=view.gcx();
    const hudUI=sidebar||hudActive(); // CAS-299 cutover: HUD overlay owns vitals → suppress canvas dupes
    // CAS-1613 (PR4): in the new sidebar-less default the HP/MP "hombreras" flanking the action
    // bar (renderVitalsShoulders) OWN the vitals — so suppress the legacy top-left HP/MP bars to
    // avoid a double read-out. Touch keeps the top-left bars (no hombreras on touch); the classic
    // sidebar and the DOM overlay each carry their own vitals (hudUI covers those).
    const shoulders = !sidebar && !hudActive() && !isTouch;
    auditRects = auditOn() ? {} : null; // CAS-416: collect drawn rects only under the QA flag
    uiLayout.frame(); // CAS-418: stamp this HUD pass — pub()'d widget rects go stale when not drawn (touch)
    // CAS-118: while the hero suffers a status, frame the screen with a pulsing edge
    // tint in that status's colour + a compact chip row (icon + label + seconds left),
    // so "el jugador también los sufre" reads instantly without crowding the HUD.
    // CAS-299: the HUD overlay paints its own status chips, so suppress the canvas chip row
    // when it is active (keep the screen-edge danger tint — that is ambient, not a chip dupe).
    { const chips=[];
      if(h.dots) for(const k in h.dots){ const s=STATUS[k]; if(s) chips.push({col:s.col,label:s.label,t:h.dots[k].t}); }
      if(h.slowT>0){ const s=STATUS.slow; chips.push({col:s.col,label:s.label,t:h.slowT}); }
      if(h.stun>0){ const s=STATUS.stun; chips.push({col:s.col,label:s.label,t:h.stun}); }
      if(chips.length){
        const pulse=0.5+0.5*Math.abs(Math.sin(G.t*6));
        ctx.save(); ctx.globalAlpha=0.22+0.20*pulse; ctx.strokeStyle=chips[0].col; ctx.lineWidth=6;
        ctx.strokeRect(3,3,VW-6,VH-6); ctx.restore();
        if(!hudUI){ let cy=pad+ (G.skull.level>0?120:116);
          ctx.font="bold 12px "+FF; ctx.textAlign="left";
          for(const c of chips){ ctx.fillStyle=COL.out; ctx.fillRect(pad-1,cy-1,9,9); ctx.fillStyle=c.col; ctx.fillRect(pad,cy,7,7);
            ctx.fillStyle=c.col; ctx.fillText(c.label+" "+c.t.toFixed(1)+"s", pad+13, cy+8); cy+=15; } }
      }
    }
    const mhp=heroMaxHp(h); // CAS-117: bar reflects the +vida affix pool
    // CAS: draw the fixed sidebar column (opaque bg + vitals + buttons) UNDER the minimap /
    // spell bar / consumable that render later so they overlay it. Recentred game overlays follow.
    if(sidebar){ drawSidebarPanel(h, mhp); drawBottomBar(h); }
    if(!hudUI && !shoulders){ // CAS-299: legacy vitals (HP/MP) — HUD owns these; CAS-1613: hombreras own these
      // CAS-1612: XP no longer lives here — it is the full-width strip pegged to the
      // bottom edge (renderXpBar), so drop the buried 10px bar and keep HP/MP only.
      bar(pad,pad,bw,16,h.hp/mhp,COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+mhp);
      bar(pad,pad+22,bw,12,h.mp/h.maxMp,COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    }
    // CAS-119: unspent talent-point badge — prompts the player to open the tree (T). CAS-299:
    // when the HUD owns the top-left, the badge moves to the left column UNDER the HUD panel.
    const badgeX = (hudUI||shoulders) ? pad : pad+bw+8; // CAS-1613: hombreras remove the top-left HP/MP block → badges anchor left
    if(!sidebar && (h.talentPts|0)>0){ const pl=0.55+0.45*Math.abs(Math.sin(G.t*4));
      ctx.save(); ctx.globalAlpha=pl; ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF; ctx.textAlign="left";
      const tby=hudUI?258:pad+47; if(auditRects) AR("talentBadge", badgeX, tby-13, ctx.measureText("★"+h.talentPts+" (T)").width, 15);
      ctx.fillText("★"+h.talentPts+" (T)", badgeX, tby); ctx.restore(); ctx.textAlign="left"; }
    // CAS-149: Elite-Mastery badge — the persistent, cross-session progression read-out,
    // kept always-visible (even rank 0, with kills-to-next) so the long-term hook that grows
    // across sessions is legible from minute one. CAS-299: reflows under the HUD panel.
    if(!sidebar){ const mr=sim.masteryRank(h.eliteKills|0); const nx=sim.masteryNextAt(mr);
      ctx.save(); ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.textAlign="left";
      const prog = nx!=null ? (" "+(h.eliteKills|0)+"/"+nx) : " MÁX";
      // CAS-150: "(V)" hint opens the reward-track panel — only while a milestone is still
      // pending (an unmet goal to chase), so a fully-unlocked track stays clean.
      const hint = sim.masteryNextMilestone(h.eliteKills|0) ? " (V)" : "";
      const mby=hudUI?238:pad+14; const mtx=STR.masteryHud(mr)+prog+hint;
      if(auditRects) AR("masteryBadge", badgeX, mby-12, ctx.measureText(mtx).width, 14);
      ctx.fillText(mtx, badgeX, mby); ctx.restore(); ctx.textAlign="left"; }
    if(!hudUI){ // gold + potions (HUD shows oro + carries equip/bag mirror)
      ctx.font="bold 13px "+FF; ctx.fillStyle=COL.gold; ctx.fillText(STR.gold(h.gold),pad,pad+66);
      ctx.fillStyle=COL.cream; ctx.fillText("♥"+h.potHP+"  ◆"+h.potMP+"  ✦"+h.blessings, pad,pad+84);
    }
    renderConsumableSlot(h, hudUI); // CAS-192: selected combat consumable + cooldown + active-buff timer
    // skull indicator / name — HUD shows the name in its vitals panel, so suppress when active.
    if(!hudUI){
      if(G.skull.level>0){ const sc=[null,COL.skullW,COL.skullY,COL.skullR][G.skull.level]; ctx.fillStyle=sc; ctx.font="bold 16px "+FF; ctx.fillText("☠ "+h.name, pad, pad+104); }
      else { ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; ctx.fillText(h.name, pad, pad+102); }
    }
    // zone name
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF;
    const zn={town:STR.zoneTown,forest:STR.zoneForest,caves:STR.zoneCaves,arena:STR.zoneArena,ruins:STR.zoneRuins,abyss:STR.zoneAbyss,frost:STR.zoneFrost,trial:STR.zoneTrial,field:STR.zoneField}[zoneOf(world,h.x,h.y)];
    AR("zone", GCX-ctx.measureText(zn).width/2, 10, ctx.measureText(zn).width, 12);
    ctx.fillText(zn, GCX, 20);
    // CAS-123: Stage-1 OBJECTIVE tracker — the single legible win-goal, top-centre and
    // ALWAYS visible so a new player reads where the run is headed from minute one. The
    // text + colour switch as the gate opens (locked → ready) and once the run is won.
    // CAS-416: drawn BEFORE the quest/hunt trackers so they can dodge below it when the
    // top strip gets cramped (800×600) instead of stacking on the banner.
    const ob=drawObjective(h);
    // quest tracker (top-right under buttons). CAS-299: shift LEFT of the HUD right rail
    // (minimapa/equipo/mochila) so the trackers never sit under the rail frames.
    ctx.textAlign="right"; ctx.font="bold 12px "+FF;
    const qx=sidebar?(view.sbx()-12):(VW-(hudUI?176:12)); let qy=isTouch?64:18;
    // CAS-1612: the minimap now defaults TOP-RIGHT (renderMiniMap, non-sidebar/non-touch),
    // so drop the tracker column below it — read the live anchor so a dragged minimap still
    // clears. Sidebar docks the minimap under vitals; touch hides it → trackers stay put.
    if(!sidebar && !isTouch){ const mm=uiLayout.get("minimap"); const mmBot=(mm?mm.y:12)+120+10; if(qy<mmBot) qy=mmBot; }
    ctx.fillStyle=COL.out; const qt=G.quest.done?STR.questDone:STR.questLabel(G.quest.wolves);
    const qw=ctx.measureText(qt).width+12;
    // CAS-416: at narrow widths the centred OBJETIVO banner reaches the tracker column;
    // drop the tracker stack just below the banner instead of overlapping it.
    if(ob && qx-qw < ob.x+ob.w+6 && qy < ob.y+ob.h+4) qy=ob.y+ob.h+8;
    AR("questTracker", qx-qw, qy-2, qw, 20);
    ctx.fillRect(qx-qw,qy-2,qw,20); ctx.fillStyle=G.quest.done?COL.heal:COL.textGold; ctx.fillText(qt,qx-6,qy+13);
    let rcBot=qy+18;   // CAS-2263: fondo de la columna derecha (quest tracker); crece con el hunt tracker si aparece
    // hunt-contract tracker (under the quest tracker) — only shows inside a hunt zone
    const hz=zoneOf(world,h.x,h.y); const HC=HUNTS[hz]; const HS=G.hunts&&G.hunts[hz];
    if(HC && HS){ let ht, hc; if(HS.cleared){ ht=STR.huntZoneCleared; hc=COL.heal; }
      else if(HS.champ){ ht=STR.huntChampApproaches; hc=COL.skullR; }
      else { ht=STR.huntLabel(HS.kills,HC.need); hc=COL.textGold; }
      const hy=qy+22; ctx.fillStyle=COL.out; const hw=ctx.measureText(ht).width+12;
      AR("huntTracker", qx-hw, hy-2, hw, 20);
      ctx.fillRect(qx-hw,hy-2,hw,20); ctx.fillStyle=hc; ctx.fillText(ht,qx-6,hy+13); rcBot=hy+18; }
    // CAS-2263: publish the right-column bottom for the safe-zone/rested badge row to dock beneath (only when the
    // column sits under the top-right minimap; sidebar/touch use the badge fallback anchor ⇒ leave 0).
    rightColBottom=(!sidebar && !isTouch)?rcBot:0;
    // spell bar
    renderSpellBar();
    renderAbilityBar(); // CAS-1570: the 2 drafted active-ability slots (radial cooldown)
    renderUltimateMeter(h); // CAS-1659: HABILIDAD DEFINITIVA charge meter + "listo" indicator
    renderFrenzyMeter(h);   // CAS-1773: MEDIDOR DE FRENESÍ pip bar (kill-streak momentum)
    renderPactBadge(h);     // CAS-2080: INTENSIDAD badge — in-run Ardor + active pact ranks (only when heat>0)
    renderVitalsShoulders(h, mhp); // CAS-1611: HP/MP "hombreras" flanking the action bar
    // minimap
    if(!isTouch || true) renderMiniMap();
    renderBoonChips(h);            // CAS-1612: active run-boons as a top-left chip row
    renderXpBar(h);               // CAS-1612: XP as a full-width strip on the bottom edge
    renderConsole();              // CAS-1613: collapsible chat/console with auto-fade (~6s)
    // CAS-1996: afordancia HUD del Códice de Combate — texto minúsculo "[`] Códice" en la esquina inferior derecha
    // (sobre la tira de XP, zona normalmente vacía). GATED: COMBAT_CODEX.enabled && showHudHint && !isTouch (la tecla es
    // sólo teclado). $0 arte, presentacional (0 sim). enabled:false ⇒ nunca se dibuja ⇒ byte-idéntico a HEAD.
    if(COMBAT_CODEX.enabled && COMBAT_CODEX.showHudHint && !isTouch){
      ctx.save(); ctx.globalAlpha=0.7; ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
      ctx.fillText("["+sim.keyLabel(COMBAT_CODEX.codexKey)+"] Códice", VW-10, VH-24); ctx.restore(); ctx.textAlign="left";
    }
    if(auditRects){ try{ window.__uiRects=auditRects; }catch(e){} }
  }
  // CAS-1613 (PR4): the chat/console is no longer a fixed 94px bar (that lived only in the
  // classic sidebar's bottom bar). In the sidebar-less default the last couple of lines fade in
  // at the bottom-left, just above the XP strip, and AUTO-FADE ~6s after the newest message — so
  // it costs ZERO permanent screen space. Pure presentation (reads G.chatLog / G.chatT); the
  // classic sidebar keeps its own always-on console via drawBottomBar.
  function renderConsole(){ if(view.sbw>0) return;
    const chat=G.chatLog||[]; if(!chat.length) return;
    const since=(G.t||0)-(G.chatT||0);
    const FADE=6, TAIL=1.2; if(since>FADE+TAIL) return;         // fully faded → skip entirely
    const a = since<=FADE ? 1 : Math.max(0, 1-(since-FADE)/TAIL);
    const n=Math.min(chat.length,2), xpH=9;
    const baseY=VH-xpH-8-(n-1)*15;                             // stack the lines upward from above the XP strip
    ctx.save(); ctx.globalAlpha=a; ctx.textAlign="left"; ctx.font="12px "+FF;
    for(let i=0;i<n;i++){ const c=chat[chat.length-n+i]; const ly=baseY+i*15; const who=(c.who||"")+": ";
      ctx.fillStyle=COL.out; ctx.fillText(who,13,ly+1);                        // 1px near-black shadow
      ctx.fillStyle=COL.textGold; ctx.fillText(who,12,ly); const ww=ctx.measureText(who).width;
      ctx.fillStyle=COL.out; ctx.fillText(c.text,12+ww+1,ly+1);
      ctx.fillStyle=COL.cream; ctx.fillText(c.text,12+ww,ly); }
    ctx.restore(); ctx.textAlign="left";
  }
  // CAS-1612 (AD P0 #4): XP as a full-width strip pegged to the bottom edge (PoE / Vampire
  // Survivors convention), replacing the 9px bar buried in the top-left stat block. Pure
  // presentation — a dark track + gold fill spanning the whole width, no ornamental frame;
  // a compact level tag anchors the left so it still reads as XP/level. Sits below the action
  // bar (y≈VH-72) with room to spare. Zero sim/rng reads (Stage-2 server-authority lens).
  function renderXpBar(h){
    const barH=9, y=VH-barH, w=VW;
    ctx.fillStyle="rgba(6,7,11,0.88)"; ctx.fillRect(0,y,w,barH);                 // track
    ctx.fillStyle=COL.xpf; ctx.fillRect(0,y,Math.round(w*clamp(h.xp/h.xpNext,0,1)),barH); // fill
    ctx.fillStyle="rgba(0,0,0,0.45)"; ctx.fillRect(0,y,w,1);                     // 1px seam for contrast
    ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 9px "+FF;
    ctx.fillText(STR.level(h.lvl), 6, y+barH-1);
    ctx.textAlign="left";
    AR("xpbar", 0, y, w, barH);
  }
  // CAS-1612 (AD): active run-boons as a top-left chip row (the universal status-effect
  // convention) so the roguelite build is legible at a glance mid-run. Reads h.boons (the
  // per-run drafted BOONS — sim-owned), grouped with a ×N count, coloured by category
  // (boonCatCol). Presentation-only. Default anchor is x=12,y=12; while the stat block still
  // owns the top-left corner it drops just below it (statframe retires in CAS-1613 → then y=12).
  function renderBoonChips(h){
    const owned=h.boons; if(!owned||!owned.length) return;
    const seen={}; for(const id of owned){ if(BOON_MAP[id]) seen[id]=(seen[id]||0)+1; }
    const keys=Object.keys(seen); if(!keys.length) return;
    const sidebar=view.sbw>0;
    let bx=12, by=12;                                    // top-left convention (corner)
    if(!sidebar) by=hudActive()?270:118;                 // clear the DOM statframe / canvas vitals column
    ctx.textAlign="left"; ctx.textBaseline="alphabetic"; ctx.font="18px "+FF;
    let gx=bx;
    for(const id of keys){ const b=BOON_MAP[id];
      const lbl=b.glyph+(seen[id]>1?("×"+seen[id]):"");
      ctx.fillStyle=boonCatCol(b.cat); ctx.fillText(lbl, gx, by+16);
      gx+=ctx.measureText(lbl).width+12; }
    AR("boonChips", bx, by, gx-bx, 20);
  }
  // CAS-123: the persistent Stage-1 objective banner (top-centre, under the zone name).
  function drawObjective(h){
    let txt, col;
    if(h.stage1){ txt=STR.objDone; col=COL.heal; }
    else { const pw=sim.heroPower(h), req=(STAGE1_GOAL&&STAGE1_GOAL.req)||FROST_POWER_REQ;
      if(pw>=req){ txt=STR.objReady; col="#7fd6ff"; }                 // gate open → go fight the boss
      else { txt=STR.objLocked(pw, req); col=COL.textGold; } }        // still building power
    const label=STR.objLabel+": "+txt;
    ctx.textAlign="center"; ctx.font="bold 11px "+FF;
    const w=ctx.measureText(label).width+16; let x=view.gcx(); const y=30;
    // CAS-416: at narrow widths the centred banner reaches the HUD stat frame
    // (top-left DOM panel, 268px × HUD scale) — nudge it right just enough to clear.
    if(hudActive()){ const hs=VW>=1280?1:VW>=1024?0.92:VW>=640?0.84:0.78;
      x=Math.max(x, 12+268*hs+8+w/2); }
    ctx.fillStyle="rgba(8,10,14,0.72)"; ctx.fillRect(x-w/2,y-1,w,18);
    ctx.fillStyle=col; ctx.fillRect(x-w/2,y-1,3,18);                  // accent tick
    ctx.fillStyle=col; ctx.fillText(label, x, y+12);
    ctx.textAlign="left";
    const rect={x:x-w/2, y:y-1, w, h:18};                             // CAS-416: trackers dodge this
    AR("objective", rect.x, rect.y, rect.w, rect.h);
    return rect;
  }
  // CAS-192: the combat-consumable slot — bottom-left HUD widget. Shows the SELECTED
  // consumable (icon + short name), its remaining count, a top-down cooldown wipe while
  // h.consumCD is live, and the [Q] use / [R] cycle key hints. An active timed buff
  // (furia) reads its remaining seconds as a shrinking bar above the slot, so the player
  // always knows the buff is up and roughly how long is left (duration telegraph).
  // CAS-417: per-consumable icon — the CAS-415 flask PNG recoloured ONCE to the
  // consumable's signature colour (c.col: fury orange / antidote green / greater heal-green)
  // via the color-blend + alpha-mask recipe, baked to an offscreen canvas and cached.
  // Zero per-frame allocs; the old text glyph stays as fallback until the PNG lands.
  const _consumIcon={};
  function consumIcon(c){
    if(_consumIcon[c.id]) return _consumIcon[c.id];
    const base=IMG["icon_hud_potion_hp"]; if(!base||!base.complete||!base.naturalWidth) return null;
    const cv=document.createElement("canvas"); cv.width=32; cv.height=32; const g=cv.getContext("2d");
    g.imageSmoothingEnabled=false; g.drawImage(base,0,0,32,32);
    g.globalCompositeOperation="color"; g.fillStyle=c.col||"#e0596a"; g.fillRect(0,0,32,32);
    g.globalCompositeOperation="destination-in"; g.drawImage(base,0,0,32,32);
    _consumIcon[c.id]=cv; return cv;
  }
  // CAS-1611 (board CAS-1603 / AD dir CAS-1604): ONE action bar abajo-centro — the single
  // command hub (Diablo IV / Hades / Last Epoch pattern). Seven contiguous 48px slots in one
  // centred row: [básico · 3 hechizos] · [Z · X habilidades] · [poción]. Every actor
  // (renderSpellBar/renderAbilityBar/renderConsumableSlot/renderVitalsShoulders) reads its
  // geometry from here so the block never desyncs. UI-ONLY: casts stay keyboard/touch-driven
  // (input.js hit-tests NOTHING here), so this just RELOCATES the block — the CAS-1570/1539
  // radial cooldown mechanic is untouched. Draggable+persistent via the uiLayout "actionbar"
  // anchor in the canvas-HUD path (sidebar mode pins it centred over the game area, as before).
  // Reused mutated object → zero per-frame alloc (frame-budget lens).
  const AB_S=48, AB_GAP=6, AB_N=7;               // 4 spells + 2 abilities + 1 potion = 7
  const _abGeom={s:AB_S,gap:AB_GAP,total:AB_N*AB_S+(AB_N-1)*AB_GAP,x0:0,y:0,h:AB_S+16,sidebar:false};
  function actionBarGeom(){
    const total=_abGeom.total, h=_abGeom.h, sidebar=view.sbw>0; let x0, y;
    if(sidebar){ x0=Math.round(view.gcx()-total/2); y=VH-view.bbh+8; }        // centred over game area
    else { x0=uiLayout.cx("actionbar", Math.round(VW/2-total/2), total);      // CAS-418 store default = bottom-centre
           y=uiLayout.cy("actionbar", VH-8-h, h);                             // y = VH - 8 - h (AD spec)
           uiLayout.pub("actionbar", x0, y, total, h); }                      // hit-rect for the drag router
    _abGeom.x0=x0; _abGeom.y=y; _abGeom.sidebar=sidebar; return _abGeom;
  }
  function abSlotX(i){ return _abGeom.x0+i*(_abGeom.s+_abGeom.gap); }           // slot 0..6 left→right
  function renderConsumableSlot(h, hudUI){ if(isTouch) return;
    const g=actionBarGeom(); const s=g.s, x=abSlotX(6), y=g.y;                 // potion = rightmost slot
    const c=CONSUMABLES[h.consumSel|0]||CONSUMABLES[0]; const qty=(h.consum&&h.consum[c.id])|0;
    // active fury buff timer (shrinking bar) above the slot
    if(h.atkspdBuffT>0){ const f=clamp(h.atkspdBuffT/6,0,1);
      ctx.fillStyle=COL.out; ctx.fillRect(x-1,y-12,s+2,8);
      ctx.fillStyle="#ff7a3a"; ctx.fillRect(x,y-11,s*f,6);
      ctx.fillStyle=COL.cream; ctx.font="bold 9px "+FF; ctx.textAlign="left";
      ctx.fillText("⚔ "+h.atkspdBuffT.toFixed(1)+"s", x+s+6, y-5); }
    // slot frame + body
    ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
    ctx.fillStyle=qty>0?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
    // icon + short name (dimmed when empty) — CAS-417: real flask PNG, glyph = load fallback
    ctx.globalAlpha=qty>0?1:0.4; ctx.textAlign="center";
    const cic=consumIcon(c);
    if(cic){ ctx.save(); ctx.imageSmoothingEnabled=false; ctx.drawImage(cic, Math.round(x+(s-32)/2), y+2, 32,32); ctx.restore(); }
    else { ctx.fillStyle=c.col; ctx.font="bold 20px "+FF; ctx.fillText(c.icon,x+s/2,y+24); }
    ctx.fillStyle=COL.cream; ctx.font="8px "+FF; ctx.fillText(c.short,x+s/2,y+s-5);
    ctx.globalAlpha=1;
    // cooldown wipe (top-down) — per-consumable cd; the row's cd is the true denominator
    const cd=(h.consumCD&&h.consumCD[c.id])||0;
    if(cd>0){ const f=clamp(cd/(c.cd||1),0,1);
      ctx.fillStyle="rgba(8,10,14,0.66)"; ctx.fillRect(x,y,s,s*f);
      ctx.fillStyle=COL.cream; ctx.font="bold 12px "+FF; ctx.textAlign="center";
      ctx.fillText(Math.ceil(cd),x+s/2,y+s/2+5); }
    // count badge (top-right)
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(x+s-5,y+5,8,0,6.28); ctx.fill();
    ctx.fillStyle=qty>0?COL.textGold:"#7a7f88"; ctx.font="bold 11px "+FF; ctx.textAlign="center";
    ctx.fillText(qty,x+s-5,y+9);
    // key hints — CAS-416: strip pulled up 2px + slimmed so it never clips below VH
    ctx.fillStyle=COL.out; ctx.fillRect(x-2,y+s+2,s+4,10);
    ctx.fillStyle=COL.cream; ctx.font="9px "+FF; ctx.textAlign="center";
    ctx.fillText("[Q] usar  [R] ↻",x+s/2,y+s+10);
    ctx.textAlign="left";
    AR("consumable", x-2, y-2, s+4, s+14);
  }
  // CAS-1570 — the two DRAFTED active-ability slots. CAS-1611: slots 4 & 5 of the unified
  // action bar (immediately RIGHT of the 4 class-spell slots), so all castable actions read
  // in one centred row. Reuses the exact CAS-1539 radial-cooldown sweep — mechanic unchanged,
  // block merely relocated. $0 art: the icon is the ability's glyph tinted by its colour.
  function renderAbilityBar(){ const h=G.hero; if(!h||!h.loadout||h.abilCD==null||isTouch) return;
    const n=2; const g=actionBarGeom(); const s=g.s, y=g.y;
    const keys=["Z","X"];
    for(let i=0;i<n;i++){ const a=ABILITY_MAP[h.loadout[i]]||{}; const x=abSlotX(4+i);
      const afford=h.mp>=(a.cost||0);
      ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
      ctx.fillStyle=afford?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
      ctx.save(); ctx.globalAlpha=afford?1:0.5; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle=a.col||"#cfd6de"; ctx.font="26px "+FF; ctx.fillText(a.glyph||"?",x+s/2,y+s/2+1); ctx.restore(); ctx.textBaseline="alphabetic";
      if(a.status && STATUS[a.status.type]){ const pc=STATUS[a.status.type].col;
        ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(x+s-8,y+8,4.5,0,6.28); ctx.fill();
        ctx.fillStyle=pc; ctx.beginPath(); ctx.arc(x+s-8,y+8,3,0,6.28); ctx.fill(); }
      if(h.abilCD[i]>0 && h.abilCDmax[i]>0){ const f=clamp(h.abilCD[i]/h.abilCDmax[i],0,1);
        const cx=x+s/2, cy=y+s/2, top=-Math.PI/2;
        ctx.fillStyle="rgba(8,10,14,0.42)"; ctx.fillRect(x,y,s,s);
        ctx.fillStyle="rgba(8,10,14,0.62)"; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,s*0.72,top,top+f*6.2832,false); ctx.closePath(); ctx.fill();
        const secs=h.abilCD[i]; const tx=(secs>=10)?(""+Math.ceil(secs)):secs.toFixed(1);
        ctx.font="bold 13px "+FF; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillStyle=COL.out; ctx.fillText(tx,cx+1,cy+1); ctx.fillStyle="#ffffff"; ctx.fillText(tx,cx,cy); ctx.textBaseline="alphabetic";
      } else if((a.cost||0)>0 && !afford){ ctx.fillStyle="rgba(150,32,32,0.30)"; ctx.fillRect(x,y,s,s); }
      ctx.fillStyle=COL.out; ctx.font="bold 12px "+FF; ctx.textAlign="left"; ctx.fillText(keys[i],x+3,y+13);
      ctx.fillStyle=COL.cream; ctx.font="8px "+FF; ctx.textAlign="center"; ctx.fillText(a.name||"",x+s/2,y+s-4);
      if((a.cost||0)>0){ ctx.fillStyle=afford?"#8ab8ff":"#ff6b6b"; ctx.font="8px "+FF; ctx.fillText((a.cost)+"mp",x+s/2,y+s+9); } }
    ctx.textAlign="left";
  }
  // CAS-1659 — HABILIDAD DEFINITIVA meter (desktop): a slim charge bar centred ABOVE the action bar,
  // with the ultimate glyph, a live % while charging, and a pulsing "¡LISTO! [C]" once full. Its own
  // HUD element (not an 8th action-bar slot). Only drawn when the run has a drafted ultimate. $0 art.
  function renderUltimateMeter(h){ if(!h||!h.ultId||isTouch) return;
    const u=ULTIMATE_MAP[h.ultId]||{}; const g=actionBarGeom();
    const w=Math.round(g.total*0.62), bh=13, x=Math.round(g.x0+g.total/2-w/2), y=g.y-30;
    const f=clamp(h.ultCharge||0,0,1), ready=f>=1, col=u.col||"#ffd24d";
    ctx.fillStyle=COL.out; ctx.fillRect(x-3,y-3,w+6,bh+6);                 // frame
    ctx.fillStyle="#12161f"; ctx.fillRect(x,y,w,bh);                       // track
    ctx.fillStyle=ready?col:"#6a5cc0"; ctx.fillRect(x,y,Math.round(w*f),bh); // fill
    if(ready){ const p=0.5+0.5*Math.sin((G.t||0)*6); ctx.globalAlpha=0.4*p; ctx.fillStyle=col; ctx.fillRect(x,y,w,bh); ctx.globalAlpha=1;
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(x-3.5,y-3.5,w+7,bh+7); }
    // glyph badge on the left
    ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=col; ctx.font="bold 18px "+FF;
    ctx.fillText(u.glyph||"★", x-16, y+bh/2+1); ctx.restore(); ctx.textBaseline="alphabetic";
    // label
    ctx.textAlign="center"; ctx.font="bold 9px "+FF;
    ctx.fillStyle=COL.out; ctx.fillText(ready?("¡DEFINITIVA LISTA!  [C]"):(u.name+"  "+Math.round(f*100)+"%"), x+w/2+1, y+bh-2);
    ctx.fillStyle=ready?"#0a0c10":COL.cream; ctx.fillText(ready?("¡DEFINITIVA LISTA!  [C]"):(u.name+"  "+Math.round(f*100)+"%"), x+w/2, y+bh-3);
    ctx.textAlign="left";
  }
  // CAS-1773 — MEDIDOR DE FRENESÍ HUD ($0 art, pure canvas): a compact pip strip above the action
  // bar showing frenzyStacks/maxStacks + an "xN FRENESÍ" counter. At high stacks (≥ maxStacks*0.75)
  // the frame gets a pulsing hot edge-glow. Hard-gated behind FRENZY.enabled AND only drawn while a
  // streak is live (frenzyStacks>0), so an idle/disabled run draws nothing.
  function renderFrenzyMeter(h){ if(!FRENZY.enabled||!h||!h.frenzyStacks) return;
    const g=actionBarGeom(); const max=FRENZY.maxStacks||1, st=Math.min(max,h.frenzyStacks|0);
    const pipGap=3, pipW=Math.max(6,Math.round((g.total*0.62 - (max-1)*pipGap)/max));
    const barW=max*pipW+(max-1)*pipGap, ph=9;
    const x=Math.round(g.x0+g.total/2-barW/2), y=g.y-(isTouch?52:46);
    const hot=st>=Math.ceil(max*0.75);
    const col=hot?"#ff5a2a":"#ff9a3c"; // ember → deep ember as the streak climbs
    ctx.fillStyle=COL.out; ctx.fillRect(x-3,y-3,barW+6,ph+6);      // frame
    for(let i=0;i<max;i++){ const px=x+i*(pipW+pipGap);
      ctx.fillStyle="#1a1410"; ctx.fillRect(px,y,pipW,ph);        // empty pip
      if(i<st){ ctx.fillStyle=col; ctx.fillRect(px,y,pipW,ph); } }
    if(hot){ const p=0.5+0.5*Math.sin((G.t||0)*7); ctx.globalAlpha=0.45*p; ctx.fillStyle=col;
      ctx.fillRect(x,y,barW,ph); ctx.globalAlpha=1; ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(x-3.5,y-3.5,barW+7,ph+7); }
    ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.font="bold 10px "+FF;
    const lbl="×"+st+" FRENESÍ"; ctx.fillStyle=COL.out; ctx.fillText(lbl,x+barW/2+1,y-9);
    ctx.fillStyle=col; ctx.fillText(lbl,x+barW/2,y-10); ctx.restore(); ctx.textBaseline="alphabetic"; ctx.textAlign="left";
  }
  // CAS-2080 — INTENSIDAD badge ($0 art, pure canvas): a compact in-run read-out of the active Pactos covenant so
  // its stakes are legible DURING play (today the Ardor/mults only show in the Pactos menu, renderPacts). Reads
  // sim.pactsSnap() (PURE read, 0 sim). HARD-GATED: only drawn while PACTS.enabled AND heat>0 (a run with no pact
  // ranked ⇒ heat 0 ⇒ nothing drawn ⇒ byte-identical to HEAD). Anchored top-centre over the game area (usually clear).
  function renderPactBadge(h){
    if(!PACTS.enabled || G.scene!=="play" || !h) return;
    const snap=sim.pactsSnap(); if(!(snap.heat>0)) return;
    const act=snap.items.filter(i=>i.rank>0);
    const head="⚔ INTENSIDAD · Ardor "+snap.heat;
    const sub="Esencia ×"+snap.essMul.toFixed(2)+"   Botín ×"+snap.dropMul.toFixed(2);
    const chips=act.map(i=>i.name.replace(/^Pacto( de)? /,"")+" "+i.rank).join("  ·  ");
    ctx.save(); ctx.textAlign="center";
    ctx.font="bold 11px "+FF; const w1=ctx.measureText(head).width;
    ctx.font="10px "+FF; const w2=ctx.measureText(sub).width, w3=chips?ctx.measureText(chips).width:0;
    const boxW=Math.ceil(Math.max(w1,w2,w3))+22, boxH=chips?48:36;
    const bx=Math.round(view.gcx()-boxW/2), by=8;
    ctx.fillStyle="rgba(10,12,16,0.74)"; ctx.fillRect(bx,by,boxW,boxH);
    ctx.strokeStyle="#e0813f"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,boxW-1,boxH-1);
    ctx.font="bold 11px "+FF; ctx.fillStyle="#e0813f"; ctx.fillText(head, bx+boxW/2, by+15);
    ctx.font="10px "+FF; ctx.fillStyle=COL.cream; ctx.fillText(sub, bx+boxW/2, by+29);
    if(chips){ ctx.fillStyle=COL.textGold; ctx.fillText(chips, bx+boxW/2, by+42); }
    ctx.restore(); ctx.textAlign="left";
  }
  function renderSpellBar(){ const h=G.hero; const n=4;
    if(isTouch) return; // touch uses buttons
    // CAS-1611: slots 0..3 (básico + 3 hechizos) of the unified action bar. Geometry + the
    // uiLayout "actionbar" anchor (default bottom-centre, draggable, Reset) come from
    // actionBarGeom(); this draws the class-spell cluster + the whole-bar drag affordance.
    const g=actionBarGeom(); const s=g.s, gap=g.gap, x0=g.x0, y=g.y, total=g.total;
    AR("actionbar", x0-2, y-2, total+4, s+13); // full 7-slot row incl. the mp-cost caption line
    if(uiLayout.dragging()==="actionbar"){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x0-4,y-4,total+8,s+15); }
    // costs / colours / labels are data-driven from SPELLS[cls] (slot 0 = basic attack)
    const sp=SPELLS[h.cls]||SPELLS.warrior; const names=(STR.spellNames&&STR.spellNames[h.cls])||["","",""];
    const costs=[0,sp[0].cost,sp[1].cost,sp[2].cost];
    const icls=SPELLS[h.cls]?h.cls:"warrior"; // icon files exist for the 5 canonical classes
    for(let i=0;i<n;i++){ const x=x0+i*(s+gap);
      ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
      ctx.fillStyle=h.mp>=costs[i]?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
      // CAS-417: real spell icon (CAS-415 art, 32x32) replaces the flat colour square;
      // the square stays ONLY as fallback while/if the PNG hasn't loaded.
      const ic=IMG["icon_spell_"+icls+"_"+i];
      if(ic&&ic.complete&&ic.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false;
        ctx.globalAlpha=h.mp>=costs[i]?1:0.45;
        ctx.drawImage(ic, Math.round(x+(s-32)/2), Math.round(y+(s-32)/2), 32,32); ctx.restore(); }
      else { ctx.fillStyle=(i===0)?"#cfd6de":(sp[i-1].col||"#cfd6de"); ctx.fillRect(x+6,y+6,s-12,s-12); }
      // CAS-120: status pip — a small dot in the effect colour marks a skill that
      // applies a CAS-118 status (veneno/quemadura/lentitud/aturdir), so the player
      // reads at a glance which skills deploy control/ignite.
      if(i>0){ const st=sp[i-1].status; if(st && STATUS[st.type]){ const pc=STATUS[st.type].col;
        ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(x+s-8,y+8,4.5,0,6.28); ctx.fill();
        ctx.fillStyle=pc; ctx.beginPath(); ctx.arc(x+s-8,y+8,3,0,6.28); ctx.fill(); } }
      // CAS-1539 (refs CAS-456): cooldown feedback for slots 1-3 — a radial "pie"
      // sweep (clock-style, 12-o'clock origin, draining clockwise) plus the seconds
      // remaining, so the player reads how close a skill is to ready at a glance.
      if(i>0 && h.spellCD && h.spellCD[i]>0 && h.spellCDmax[i]>0){
        const f=clamp(h.spellCD[i]/h.spellCDmax[i],0,1);
        const cx=x+s/2, cy=y+s/2, top=-Math.PI/2;
        ctx.fillStyle="rgba(8,10,14,0.42)"; ctx.fillRect(x,y,s,s);           // whole-slot dim = "on cooldown"
        ctx.fillStyle="rgba(8,10,14,0.62)";                                  // pie over the REMAINING cooldown
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,s*0.72,top,top+f*6.2832,false); ctx.closePath(); ctx.fill();
        const secs=h.spellCD[i]; const tx=(secs>=10)?(""+Math.ceil(secs)):secs.toFixed(1);
        ctx.font="bold 13px "+FF; ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.fillStyle=COL.out; ctx.fillText(tx,cx+1,cy+1); ctx.fillStyle="#ffffff"; ctx.fillText(tx,cx,cy);
        ctx.textBaseline="alphabetic";
      } else if(i>0 && costs[i]>0 && h.mp<costs[i]){
        ctx.fillStyle="rgba(150,32,32,0.30)"; ctx.fillRect(x,y,s,s);         // CAS-1539: red wash when ready but mana-gated
      }
      ctx.fillStyle=COL.out; ctx.font="bold 12px "+FF; ctx.textAlign="left"; ctx.fillText((i+1),x+3,y+13);
      const label=(i===0) ? ((STR.spellSlot0&&STR.spellSlot0[h.cls])||STR.spells[0]) : names[i-1];
      ctx.fillStyle=COL.cream; ctx.font="8px "+FF; ctx.textAlign="center"; ctx.fillText(label,x+s/2,y+s-4);
      if(costs[i]>0){ ctx.fillStyle=(h.mp>=costs[i])?"#8ab8ff":"#ff6b6b"; ctx.font="8px "+FF; ctx.fillText(costs[i]+"mp",x+s/2,y+s+9);} }
  }
  // CAS-1611 (AD P1 #5/#6): vitals as "hombreras" flanking the action bar — HP left, MP right,
  // engrosadas (≥22px) so the most important stat carries real visual weight (HP dominates:
  // taller + wider). They ride the action-bar flanks (move+persist with the "actionbar" uiLayout
  // anchor, restored by Reset). In the canvas-HUD overlay path the DOM statframe still owns
  // vitals until CAS-1613 retires it, so skip there to avoid a duplicate readout.
  function renderVitalsShoulders(h, mhp){ if(isTouch) return;
    // CAS-1613: the hombreras are the SOLE vitals in the new default. Skip when the classic
    // sidebar (opt-in) or the DOM overlay is up — each carries its own vitals (no double read).
    const sidebar=view.sbw>0; if(sidebar || hudActive()) return;
    const g=actionBarGeom();
    const hHP=26, hMP=22, wHP=138, wMP=120, gapB=16;        // HP taller+wider = dominates; both ≥22px
    const yHP=g.y+Math.round((g.s-hHP)/2), yMP=g.y+Math.round((g.s-hMP)/2);
    let xHP=g.x0-gapB-wHP; if(xHP<8) xHP=8;                 // never clip off the left edge
    let xMP=g.x0+g.total+gapB; const rEdge=sidebar?view.sbx():VW;
    if(xMP+wMP>rEdge-8) xMP=rEdge-8-wMP;                    // keep MP inside the game area / viewport
    bar(xHP,yHP,wHP,hHP, h.hp/mhp,          COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+mhp);
    // CAS-2114: RECUPERACIÓN/RALLY — overlay 'ghost HP' translúcido verde sobre la barra de HP: segmento desde el fin del
    // fill de HP hasta (hp+rallyPool) capado a mhp, mostrando el pool recuperable armado por el daño recibido. $0 arte:
    // reusa la primitiva canvas (fillRect) ya viva. Gated: RALLY.enabled=false / pool ~0 ⇒ no dibuja ⇒ byte-id a HEAD.
    if(RALLY.enabled && (h.rallyPool||0)>0.01){ const hpFrac=clamp(h.hp/mhp,0,1), poolFrac=clamp((h.hp+h.rallyPool)/mhp,0,1);
      if(poolFrac>hpFrac){ ctx.save(); ctx.globalAlpha=0.5; ctx.fillStyle="#8fff9a";
        ctx.fillRect(xHP+wHP*hpFrac, yHP, wHP*(poolFrac-hpFrac), hHP); ctx.restore(); } }
    bar(xMP,yMP,wMP,hMP, h.mp/h.maxMp,      COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    AR("vitals_hp", xHP-2, yHP-2, wHP+4, hHP+4); AR("vitals_mp", xMP-2, yMP-2, wMP+4, hMP+4);
  }
  // CAS: the fixed RIGHT sidebar (Tibia-style). Opaque column covering x∈[view.sbx(),VW] with
  // the hero identity + vitals at the top, then the docked minimap (renderMiniMap) and a stack
  // of action buttons (inventory / talents / mastery / wardrobe / map / menu) + a mastery
  // read-out. Buttons are hit-tested in input.js sidebarBtns() — this only DRAWS them.
  function drawSidebarPanel(h, mhp){
    const W=view.sbw, L=view.sbx(), P=14, iw=W-2*P, x0=L+P;
    ctx.fillStyle="#0e1016"; ctx.fillRect(L,0,W,VH);                 // opaque column
    ctx.fillStyle=COL.panelB; ctx.fillRect(L,0,2,VH);               // left divider
    // identity + gold
    let y=P; ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 15px "+FF;
    ctx.fillText(h.name||"—", x0, y+13);
    ctx.textAlign="right"; ctx.fillStyle=COL.gold; ctx.font="bold 12px "+FF; ctx.fillText((h.gold|0)+" oro", VW-P, y+12);
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF;
    const clsName=(STR.classes&&STR.classes[h.cls]&&STR.classes[h.cls].name)||h.cls;
    ctx.fillText(clsName+" · "+STR.level(h.lvl), x0, y+27);
    // vitals — CAS-1611: HP/MP relocated to the action-bar "hombreras" (renderVitalsShoulders);
    // CAS-1612: the XP/level bar is now the full-width bottom strip (renderXpBar), so the
    // sidebar no longer draws its own — level already reads in the identity caption above.
    // action buttons (minimap is drawn later by renderMiniMap into the gap at y≈104)
    const sb=sidebarBtns();
    if(sb){ for(const k in sb){ const b=sb[k];
      const hot=!isTouch && ui.mouseX>=b.x && ui.mouseX<=b.x+b.w && ui.mouseY>=b.y && ui.mouseY<=b.y+b.h;
      ctx.fillStyle=hot?"#20242f":"#171a22"; ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.strokeStyle=hot?COL.textGold:COL.panelB; ctx.lineWidth=1; ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
      ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="13px "+FF; ctx.fillText(b.icon, b.x+9, b.y+b.h/2+5);
      ctx.fillStyle=hot?COL.goldL:COL.cream; ctx.font="12px "+FF; ctx.fillText(b.label, b.x+34, b.y+b.h/2+4);
    } }
    // compact mastery / talent read-out below the buttons
    const mr=sim.masteryRank(h.eliteKills|0), nx=sim.masteryNextAt(mr);
    const btop=(sb&&sb.menu)?sb.menu.y+sb.menu.h+12:VH-140;
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="11px "+FF;
    ctx.fillText(STR.masteryHud(mr)+(nx!=null?(" "+(h.eliteKills|0)+"/"+nx):" MÁX"), x0, btop);
    if((h.talentPts|0)>0){ const pl=0.6+0.4*Math.abs(Math.sin(G.t*4));
      ctx.save(); ctx.globalAlpha=pl; ctx.fillStyle=COL.goldL; ctx.fillText("★ "+h.talentPts+" talento(s) (T)", x0, btop+16); ctx.restore(); }
    ctx.textAlign="left";
  }
  // CAS: the fixed BOTTOM bar — opaque strip under the game area holding the attacks hotbar
  // (drawn later by renderSpellBar) with the chat CONSOLE + input beneath it. The <input> itself
  // is a DOM element (game.js) so it can take real keyboard focus; here we draw the console log
  // and the bar background. Spans the game width (x∈[0, view.sbx()]).
  function drawBottomBar(h){
    const BY=VH-view.bbh, W=view.sbx();
    ctx.fillStyle="#0b0d12"; ctx.fillRect(0,BY,W,view.bbh);          // opaque bar
    ctx.fillStyle=COL.panelB; ctx.fillRect(0,BY,W,2);               // top divider
    // recent chat lines, just above the input row (newest last), left-aligned
    const chat=G.chatLog||[]; const n=Math.min(chat.length,2);
    ctx.textAlign="left"; ctx.font="12px "+FF;
    for(let i=0;i<n;i++){ const c=chat[chat.length-n+i]; const ly=VH-52+i*15;
      ctx.fillStyle=COL.textGold; const who=(c.who||"")+": ";
      ctx.fillText(who, 12, ly); const ww=ctx.measureText(who).width;
      ctx.fillStyle=COL.cream; ctx.fillText(c.text, 12+ww, ly); }
  }
  // CAS-2263: Y del borde inferior de la columna derecha de trackers (quest+hunt, que ya caen bajo el minimapa).
  // El tracker block la publica cada frame; badgeRowAnchor() la lee para acoplar la fila de badges DEBAJO de la
  // columna entera (minimapa + trackers), evitando re-colisión con el texto de los trackers. Lag de 1 frame OK.
  let rightColBottom=0;
  // CAS-466: silueta del continente para el minimapa (1px = 2 tiles, cacheada)
  let mmTerra=null, mmTerraW=0;
  function mmBuildTerra(){ const sc=2, cw=Math.ceil(MAP_W/sc), ch=Math.ceil(MAP_H/sc);
    const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
    const c2=cv.getContext("2d"); const img=c2.createImageData(cw,ch); const px=img.data;
    const C=[[96,130,96],[152,124,84],[62,68,82],[164,154,124],[192,172,116],[40,102,138],[150,190,212],[80,116,92]];
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ const c=C[world.terr[(y*sc)*MAP_W+(x*sc)]]||[50,50,50];
      const i=(y*cw+x)*4; px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=255; }
    c2.putImageData(img,0,0); mmTerra=cv; mmTerraW=cw; }
  // CAS-2226: extensible BLIP LAYER for the minimap + world map (M). Every blip is DERIVED PURELY
  // from world state — never hardcoded, never RNG — so it is deterministic and trivially made
  // server-authoritative when netcode lands. City landmark POIs come from the deco props placed by
  // CAS-2191 (temple/depot) + CAS-2224 (tavern) + the park well; a FUTURE source (NPCs today, remote
  // players later) is one push away — the draw loops below are source-agnostic ({x,y,col,label}).
  // Gated by MINIMAP.enabled (DARK): OFF ⇒ mapBlips() never called ⇒ maps render byte-identically.
  const CITY_POI = {
    prop_city_temple: { label:"Templo",   col:"#f0d878" }, // gold — respawn temple landmark
    prop_city_depot:  { label:"Depósito", col:"#7cb8f0" }, // blue — storage depot
    prop_city_tavern: { label:"Taberna",  col:"#f0a850" }, // amber — habitable tavern
    prop_city_well:   { label:"Parque",   col:"#74d68e" }, // green — park centrepiece (well+tree+bench)
  };
  let _blipCache=null, _blipWorld=null;
  function mapBlips(){
    if(_blipWorld===world && _blipCache) return _blipCache;   // deco is static per world build → memoize
    const out=[];
    for(const d of (world.deco||[])){ const p=CITY_POI[d.kind]; if(p) out.push({x:d.x, y:d.y, col:p.col, label:p.label}); }
    // Future sources plug in here (one push each): NPCs → world.npcs; remote players → net snapshot.
    _blipWorld=world; _blipCache=out; return out;
  }

  // CAS-2230: DÍA/NOCHE + FAROLAS (render-only, DARK — gated por DAYNIGHT.enabled en render()).
  // worldPhase() 0..1 (0=medianoche) desde el reloj COMPARTIDO/determinista: UTC real (Date.now, idéntico en
  // todo cliente) − epoch, mod cycleSeconds ⇒ mismo instante ⇒ misma fase en cada cliente por construcción
  // (listo para netcode autoritativo, sin desync; 0 RNG, 0 toque de sim/save). phaseOverride (config o el
  // override runtime de QA _dnPhaseOverride) fija una fase para screenshots deterministas.
  let _dnPhaseOverride=null;   // override de fase para dev/QA — NO toca config ni sim
  function worldPhase(){
    const cfgOv=DAYNIGHT.phaseOverride;
    const ov=(_dnPhaseOverride!=null)?_dnPhaseOverride:((typeof cfgOv==="number")?cfgOv:null);
    if(ov!=null) return ((ov%1)+1)%1;
    const cyc=Math.max(1, DAYNIGHT.cycleSeconds||1200);
    const t=(Date.now()/1000 - (DAYNIGHT.epochMs||0)/1000)/cyc;
    return ((t%1)+1)%1;   // 0..1
  }
  // Keyframes fase → [r,g,b,a de tinte-pantalla] + glow 0..1 (visibilidad del halo de farolas).
  // Interpolación lineal entre stops adyacentes ⇒ transición suave amanecer→día→atardecer→noche.
  const _DN_STOPS=[
    {p:0.00, c:[8,14,42,0.55],   g:1.00},  // medianoche — azul profundo
    {p:0.22, c:[16,22,58,0.46],  g:0.88},  // pre-amanecer
    {p:0.28, c:[255,150,74,0.24],g:0.42},  // amanecer cálido
    {p:0.36, c:[255,224,150,0.06],g:0.10}, // primera mañana
    {p:0.50, c:[0,0,0,0.0],      g:0.00},  // mediodía — sin tinte
    {p:0.66, c:[255,206,130,0.05],g:0.10}, // tarde
    {p:0.74, c:[255,126,52,0.26],g:0.46},  // atardecer cálido
    {p:0.84, c:[36,28,66,0.44],  g:0.88},  // crepúsculo
    {p:1.00, c:[8,14,42,0.55],   g:1.00},  // vuelta a medianoche
  ];
  function dayNightState(phase){
    const S=_DN_STOPS; let a=S[0], b=S[S.length-1];
    for(let i=0;i<S.length-1;i++){ if(phase>=S[i].p && phase<=S[i+1].p){ a=S[i]; b=S[i+1]; break; } }
    const span=(b.p-a.p)||1, k=clamp((phase-a.p)/span,0,1), L=(i)=>a.c[i]+(b.c[i]-a.c[i])*k;
    return { r:L(0)|0, g:L(1)|0, b:L(2)|0, a:L(3), glow:a.g+(b.g-a.g)*k };
  }
  function renderAmbientTint(st){ if(!st||st.a<=0.002) return;
    ctx.fillStyle="rgba("+st.r+","+st.g+","+st.b+","+st.a.toFixed(3)+")"; ctx.fillRect(0,0,VW,VH); }
  // Farolas: deriva PURA de world.deco (0 RNG, misma idea que mapBlips) → posición del foco (elevada al
  // farol). Memoizado por world build (estático). El halo se dibuja aditivo ("lighter") sólo en cámara.
  let _lampCache=null, _lampWorld=null;
  function lampGlows(){
    if(_lampWorld===world && _lampCache) return _lampCache;
    const out=[];
    for(const d of (world.deco||[])){ if(d.kind==="prop_city_lamp"||d.kind==="lantern") out.push({x:d.x, y:d.y-20}); }
    _lampWorld=world; _lampCache=out; return out;
  }
  const _lampRgb=(()=>{ const h=(DAYNIGHT.lampColor||"#ffd27a").replace("#",""); return [parseInt(h.slice(0,2),16)||255, parseInt(h.slice(2,4),16)||210, parseInt(h.slice(4,6),16)||122]; })();
  function renderLampGlow(glowAmt, camX, camY, Z){
    const lamps=lampGlows(); if(!lamps.length) return;
    const R=DAYNIGHT.lampRadius||120, rgb=_lampRgb;
    const vL=camX-R, vR=camX+VW/Z+R, vT=camY-R, vB=camY+VH/Z+R;   // rect de cámara (+R margen) en px de mundo
    ctx.save(); ctx.globalCompositeOperation="lighter";
    const A=(m)=>"rgba("+rgb[0]+","+rgb[1]+","+rgb[2]+","+(m*glowAmt).toFixed(3)+")";
    for(const l of lamps){ if(l.x<vL||l.x>vR||l.y<vT||l.y>vB) continue;
      const grd=ctx.createRadialGradient(l.x,l.y,0,l.x,l.y,R);
      grd.addColorStop(0,A(0.55)); grd.addColorStop(0.5,A(0.20)); grd.addColorStop(1,A(0));
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(l.x,l.y,R,0,6.2832); ctx.fill(); }
    ctx.restore();
  }
  // Dev/QA hook (expuesto vía __dev.daynight): daynight() lee estado. Formas de escritura:
  //   daynight(0.0)                     → fija override de fase 0..1 (null → vuelve al reloj compartido).
  //   daynight({enabled:true, phase:0}) → flip runtime IN-MEMORY (mismo patrón que __dev.pixelart) para
  //                                       OBSERVAR en DARK: el default en disco sigue false (build byte-id).
  // Render-only, RNG-neutral: no toca sim/save. El flip runtime NO persiste; el flip live real es config-only.
  function daynight(p){
    if(p!==undefined){
      if(p&&typeof p==="object"){
        if("enabled" in p) DAYNIGHT.enabled=!!p.enabled;
        if("lampGlow" in p) DAYNIGHT.lampGlow=!!p.lampGlow;   // A/B isolate the halo (QA)
        if("phase" in p) _dnPhaseOverride=(p.phase==null)?null:((((+p.phase)%1)+1)%1);
      } else _dnPhaseOverride=(p===null)?null:((((+p)%1)+1)%1);
    }
    const ph=worldPhase(), st=dayNightState(ph), lg=lampGlows();
    return { enabled:DAYNIGHT.enabled, phase:+ph.toFixed(4), override:_dnPhaseOverride,
      tint:{r:st.r,g:st.g,b:st.b,a:+st.a.toFixed(3)}, glow:+st.glow.toFixed(3),
      lamps:lg.length, lamp0:lg[0]?{x:Math.round(lg[0].x),y:Math.round(lg[0].y),tx:Math.round(lg[0].x/TS),ty:Math.round((lg[0].y+20)/TS)}:null };
  }

  // CAS-2231: SISTEMA DE CLIMA (lluvia / niebla, render-only, DARK — gated por WEATHER.enabled en render()).
  // worldWeatherPhase() 0..1 desde el reloj COMPARTIDO/determinista (UTC Date.now − epoch, mod cycleSeconds),
  // idéntico en todo cliente por construcción (mismo patrón que DÍA/NOCHE; 0 RNG, 0 toque de sim/save). El
  // ciclo recorre clear→rain→fog→clear por interpolación de keyframes. phaseOverride (config o _wPhaseOverride
  // runtime de QA) fija una fase para screenshots deterministas. Las gotas son un POOL FIJO memoizado (cap
  // WEATHER.maxDrops) animado sólo por el reloj ⇒ sin allocs por-frame en el hot loop; screen-space (windshield).
  let _wPhaseOverride=null;   // override de fase para dev/QA — NO toca config ni sim
  function worldWeatherPhase(){
    const cfgOv=WEATHER.phaseOverride;
    const ov=(_wPhaseOverride!=null)?_wPhaseOverride:((typeof cfgOv==="number")?cfgOv:null);
    if(ov!=null) return ((ov%1)+1)%1;
    const cyc=Math.max(1, WEATHER.cycleSeconds||900);
    const t=(Date.now()/1000 - (WEATHER.epochMs||0)/1000)/cyc;
    return ((t%1)+1)%1;   // 0..1
  }
  // Keyframes fase → intensidad de lluvia + niebla (0..1). Interpolación lineal entre stops adyacentes ⇒
  // transición suave clear→rain→fog→clear (secuencia determinista, byte-idéntica entre clientes).
  const _W_STOPS=[
    {p:0.00, rain:0.0, fog:0.0},   // clear
    {p:0.15, rain:0.0, fog:0.0},   // clear (hold)
    {p:0.28, rain:1.0, fog:0.0},   // lluvia plena
    {p:0.45, rain:1.0, fog:0.06},  // lluvia (hold, la niebla empieza a asomar)
    {p:0.55, rain:0.15,fog:0.55},  // transición lluvia→niebla
    {p:0.70, rain:0.0, fog:1.0},   // niebla plena
    {p:0.82, rain:0.0, fog:1.0},   // niebla (hold)
    {p:0.93, rain:0.0, fog:0.0},   // vuelta a clear
    {p:1.00, rain:0.0, fog:0.0},   // clear
  ];
  function weatherState(phase){
    const S=_W_STOPS; let a=S[0], b=S[S.length-1];
    for(let i=0;i<S.length-1;i++){ if(phase>=S[i].p && phase<=S[i+1].p){ a=S[i]; b=S[i+1]; break; } }
    const span=(b.p-a.p)||1, k=clamp((phase-a.p)/span,0,1);
    return { rain:a.rain+(b.rain-a.rain)*k, fog:a.fog+(b.fog-a.fog)*k };
  }
  // Hex → [r,g,b] (misma idea que _lampRgb del día/noche).
  const _wHexRgb=(hex,df)=>{ const h=(hex||df).replace("#",""); return [parseInt(h.slice(0,2),16)||0, parseInt(h.slice(2,4),16)||0, parseInt(h.slice(4,6),16)||0]; };
  const _rainTintRgb=_wHexRgb(WEATHER.rainTint,"#3a4a6a");
  const _fogRgb=_wHexRgb(WEATHER.fogColor,"#c8ccd4");
  // Pool FIJO de gotas (posiciones normalizadas 0..1 ⇒ independiente de VW/VH, sin rebuild en resize).
  // Deriva pura de un hash del índice (0 RNG, determinista). Memoizado ⇒ 0 allocs por-frame.
  let _rainDrops=null;
  function _wHash(i){ let h=(i*2654435761)>>>0; h^=h>>>15; h=(h*2246822519)>>>0; h^=h>>>13; return h>>>0; }
  function rainDrops(){
    if(_rainDrops) return _rainDrops;
    const n=Math.max(0, WEATHER.maxDrops|0), out=new Array(n);
    for(let i=0;i<n;i++){ const h=_wHash(i);
      out[i]={ xn:(h&0xffff)/0xffff,                 // 0..1 horizontal
               sp:0.9+((h>>>16)&0xff)/255*0.9,       // multiplicador de caída 0.9..1.8
               ln:0.6+((h>>>8)&0x7f)/127*0.9,        // multiplicador de longitud
               off:((h>>>4)&0xfff)/0xfff };          // offset de fase 0..1
    }
    _rainDrops=out; return out;
  }
  // Velo azulado-gris + rayas de lluvia animadas (screen-space). intensity 0..1 escala nº de gotas activas y alpha.
  function renderRain(intensity){
    const drops=rainDrops(); if(!drops.length) return;
    const dk=WEATHER.rainDarken*intensity;
    if(dk>0.002){ const c=_rainTintRgb; ctx.fillStyle="rgba("+c[0]+","+c[1]+","+c[2]+","+dk.toFixed(3)+")"; ctx.fillRect(0,0,VW,VH); }
    const t=Date.now()/1000, fall=VH+40, span=VW+40, slant=6;
    const nActive=Math.round(drops.length*intensity);
    ctx.save(); ctx.strokeStyle="rgba(200,214,235,"+(0.5*intensity).toFixed(3)+")"; ctx.lineWidth=1.4; ctx.lineCap="round";
    ctx.beginPath();
    for(let i=0;i<nActive;i++){ const d=drops[i];
      const prog=(d.off + t*d.sp*0.55)%1;             // 0..1 bajando la pantalla
      const y=prog*fall-20, x=d.xn*span-20, ln=10*d.ln;
      ctx.moveTo(x,y); ctx.lineTo(x-slant*0.3, y+ln); }
    ctx.stroke(); ctx.restore();
  }
  // Niebla: velo RADIAL (centro más claro = combate legible, bordes más densos = visibilidad ambiental reducida).
  // Gradiente memoizado por (VW,VH,alpha) ⇒ se reconstruye sólo cuando cambia (durante hold es estable).
  let _fogGrd=null, _fogKey="";
  function fogGradient(a){
    const key=VW+"x"+VH+":"+a.toFixed(3);
    if(key===_fogKey && _fogGrd) return _fogGrd;
    const c=_fogRgb, cx=VW/2, cy=VH/2, R=Math.hypot(VW,VH)/2;
    const grd=ctx.createRadialGradient(cx,cy,R*0.2, cx,cy,R);
    grd.addColorStop(0,"rgba("+c[0]+","+c[1]+","+c[2]+","+(a*0.45).toFixed(3)+")");
    grd.addColorStop(1,"rgba("+c[0]+","+c[1]+","+c[2]+","+a.toFixed(3)+")");
    _fogKey=key; _fogGrd=grd; return grd;
  }
  function renderFog(intensity){
    const a=WEATHER.fogMax*intensity; if(a<=0.002) return;
    ctx.fillStyle=fogGradient(a); ctx.fillRect(0,0,VW,VH);
  }
  // Composición: niebla (velo detrás) primero, luego las rayas de lluvia por encima. Se llama en render()
  // DESPUÉS del tinte día/noche y ANTES del halo de farolas ⇒ noche+lluvia = más oscuro, farolas perforan el clima.
  function renderWeather(st){
    if(!st) return;
    if(st.fog>0.002) renderFog(st.fog);
    if(st.rain>0.002) renderRain(st.rain);
  }
  // Dev/QA hook (expuesto vía __dev.weather): weather() lee estado. Formas de escritura (patrón __dev.daynight):
  //   weather(0.3)                     → fija override de fase 0..1 (null → vuelve al reloj compartido).
  //   weather({enabled:true, phase:0.3})→ flip runtime IN-MEMORY para OBSERVAR en DARK (disco sigue false).
  function weather(p){
    if(p!==undefined){
      if(p&&typeof p==="object"){
        if("enabled" in p) WEATHER.enabled=!!p.enabled;
        if("phase" in p) _wPhaseOverride=(p.phase==null)?null:((((+p.phase)%1)+1)%1);
      } else _wPhaseOverride=(p===null)?null:((((+p)%1)+1)%1);
    }
    const ph=worldWeatherPhase(), st=weatherState(ph);
    const state=st.rain>0.5?"rain":(st.fog>0.5?"fog":((st.rain>0.05||st.fog>0.05)?"mixed":"clear"));
    return { enabled:WEATHER.enabled, phase:+ph.toFixed(4), override:_wPhaseOverride,
      rain:+st.rain.toFixed(3), fog:+st.fog.toFixed(3), state:state,
      drops:rainDrops().length, maxDrops:WEATHER.maxDrops };
  }

  // CAS-2234: BANNER DE ZONA/REGIÓN (render+code, DARK). Las regiones DERIVAN PURAMENTE de los MISMOS POIs de
  // world.deco que usa el minimapa (mapBlips → Templo/Depósito/Taberna/Parque), más una región contenedora
  // "Ciudad" = bbox de esos POIs. 0 RNG, deriva determinista de world (memoizado como mapBlips) ⇒ idéntico en
  // TODO cliente por construcción. La "zona actual" = posición del héroe vs regiones estáticas (cosmético,
  // per-cliente, 0 escritura a sim/save).
  let _zbRegions=null, _zbWorld=null;
  function zoneRegions(){
    if(_zbWorld===world && _zbRegions) return _zbRegions;
    const out=[], blips=mapBlips();
    // Región circular por POI (radio ZONE_BANNER.radius). El label es el mismo del minimapa (CAS-2226).
    for(const b of blips) out.push({name:b.label, x:b.x, y:b.y, r:ZONE_BANNER.radius|0, sub:null, container:false});
    // Región contenedora "Ciudad" = bbox de los POIs expandido por cityMargin. Sólo si hay POIs (0 = sin ciudad).
    if(blips.length){
      let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
      for(const b of blips){ if(b.x<minx)minx=b.x; if(b.y<miny)miny=b.y; if(b.x>maxx)maxx=b.x; if(b.y>maxy)maxy=b.y; }
      const m=ZONE_BANNER.cityMargin|0;
      out.push({name:ZONE_BANNER.cityLabel, sub:ZONE_BANNER.citySubtitle||null, container:true,
        bbox:[minx-m, miny-m, maxx+m, maxy+m]});
    }
    _zbWorld=world; _zbRegions=out; return out;
  }
  // Resuelve la región que contiene (x,y): POI circular más cercano gana; si ninguno, la región contenedora
  // (Ciudad) si el punto cae en su bbox; si no, null (descampado = sin banner). Determinista, 0 RNG.
  function zoneAt(x,y){
    const R=zoneRegions(); let best=null, bestD=Infinity;
    for(const z of R){ if(z.container) continue; const dx=x-z.x, dy=y-z.y, d2=dx*dx+dy*dy, r=z.r;
      if(d2<=r*r && d2<bestD){ best=z; bestD=d2; } }
    if(best) return best;
    for(const z of R){ if(z.container && z.bbox){ const b=z.bbox;
      if(x>=b[0] && x<=b[2] && y>=b[1] && y<=b[3]) return z; } }
    return null;
  }
  // Estado del banner (render-local, NO sim/save): edge-detection del nombre de zona actual + tiempo de inicio.
  let _zbCur=null;      // nombre de la zona actual (para detectar cruces — no re-dispara si te quedas dentro)
  let _zbBanner=null;   // {name, sub, start} banner activo (start=Date.now ms; sólo cosmético/render, 0 sim)
  // Sobre-actualiza cada frame (barato: ~5 regiones). Sólo se llama con ZONE_BANNER.enabled ⇒ DARK byte-idéntico.
  function updateZoneBanner(){
    const h=G.hero; if(!h) return;
    const z=zoneAt(h.x,h.y), name=z?z.name:null;
    if(name!==_zbCur){ _zbCur=name; if(name) _zbBanner={name:name, sub:z.sub||null, start:Date.now()}; }
  }
  // Envolvente de opacidad: fade-in [0,fade] → hold [fade, fade+hold] → fade-out → 0. Deriva de tiempo real
  // (cosmético; NO toca sim/determinismo). el = segundos desde el disparo.
  function zbAlpha(el){
    const fi=ZONE_BANNER.fadeSeconds||0.6, hold=ZONE_BANNER.holdSeconds||2.5;
    if(el<0) return 0;
    if(el<fi) return el/fi;
    if(el<fi+hold) return 1;
    if(el<fi+hold+fi) return 1-(el-fi-hold)/fi;
    return 0;
  }
  // Dibuja el título de zona (screen-space, top-third). Fuente/estilo de HUD ya existente (FF, COL) — sin arte
  // nuevo. Contorno oscuro para legibilidad sobre cualquier terreno. No aloca por-frame. Al terminar el fade se
  // limpia _zbBanner (nada que dibujar).
  function renderZoneBanner(){
    const b=_zbBanner; if(!b) return;
    const el=(Date.now()-b.start)/1000, a=zbAlpha(el);
    if(a<=0.003){ if(el>0) _zbBanner=null; return; }
    ctx.save();
    ctx.globalAlpha=a; ctx.textAlign="center"; ctx.textBaseline="middle";
    const cx=VW/2, cy=Math.round(VH*(ZONE_BANNER.anchorY||0.17));
    ctx.font="bold 30px "+FF;
    ctx.lineWidth=4; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.85)"; ctx.strokeText(b.name,cx,cy);
    ctx.fillStyle=COL.textGold; ctx.fillText(b.name,cx,cy);
    if(b.sub){ ctx.font="bold 14px "+FF; ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.8)";
      ctx.strokeText(b.sub,cx,cy+24); ctx.fillStyle=COL.cream; ctx.fillText(b.sub,cx,cy+24); }
    ctx.restore();
  }
  // Dev/QA hook (expuesto vía __dev.zone): zone() lee estado. Formas de escritura (patrón __dev.weather):
  //   zone("Templo")            → fuerza un banner con ese texto (screenshots QA deterministas).
  //   zone(null)                → limpia el banner activo.
  //   zone({enabled:true})      → flip runtime IN-MEMORY para OBSERVAR en DARK (disco sigue false).
  //   zone({name:"Ciudad", sub:"Zona segura"}) → fuerza banner con sub-título.
  function zone(p){
    if(p!==undefined){
      if(p===null){ _zbBanner=null; }
      else if(typeof p==="object"){
        if("enabled" in p) ZONE_BANNER.enabled=!!p.enabled;
        if("name" in p) _zbBanner=(p.name==null)?null:{name:String(p.name), sub:(p.sub!=null?String(p.sub):null), start:Date.now()};
      } else { _zbBanner={name:String(p), sub:null, start:Date.now()}; }
    }
    const h=G.hero, z=h?zoneAt(h.x,h.y):null, b=_zbBanner, el=b?(Date.now()-b.start)/1000:0;
    return { enabled:ZONE_BANNER.enabled, current:z?z.name:null,
      banner:b?{name:b.name, sub:b.sub, alpha:+zbAlpha(el).toFixed(3), t:+el.toFixed(2)}:null,
      regions:zoneRegions().map(r=>r.container?{name:r.name, container:true, bbox:r.bbox}:{name:r.name, x:Math.round(r.x), y:Math.round(r.y), r:r.r}) };
  }

  // CAS-2242: ¿está (x,y) dentro de la Zona Segura de la Ciudad? Mismo bbox que la autoridad de sim (POIs de world.deco
  // + SAFEZONE.cityMargin), computado render-side sólo para la afordancia visual. Desacoplado de ZONE_BANNER (usa el
  // margen de SAFEZONE). 0 RNG, deriva pura de world (reusa mapBlips memoizado). Sólo se llama con SAFEZONE.enabled.
  function inCitySafe(x,y){ const blips=mapBlips(); if(!blips.length) return false;
    let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for(const b of blips){ if(b.x<minx)minx=b.x; if(b.y<miny)miny=b.y; if(b.x>maxx)maxx=b.x; if(b.y>maxy)maxy=b.y; }
    const m=SAFEZONE.cityMargin|0;
    return x>=minx-m && x<=maxx+m && y>=miny-m && y<=maxy+m; }
  // CAS-2263: ancla compartida de la fila de badges HUD (pip "Zona segura" + barra "Descanso"). En desktop
  // (no-touch, sin sidebar) el minimapa vive TOP-RIGHT y la fila solía solaparlo ⇒ la acoplamos JUSTO DEBAJO del
  // rect VIVO del minimapa (mismo patrón que la columna de trackers, render.js ~2210), alineada a su borde
  // izquierdo y re-leída cada frame vía cx/cy ⇒ sigue al mapa arrastrado/reposicionado (CAS-1612) sin re-colisión.
  // Fallback (touch / sidebar / minimapa ausente): ancla histórica en la esquina superior-derecha del área de juego.
  function badgeRowAnchor(){
    const sidebar=view.sbw>0;
    if(!isTouch && !sidebar){                             // minimapa top-right visible ⇒ acopla debajo
      const mmX=uiLayout.cx("minimap", VW-120-12, 120);   // borde izq del minimapa DIBUJADO (mismo clamp que renderMiniMap)
      const mmY=uiLayout.cy("minimap", 12, 120);
      // la columna de trackers (quest+hunt) YA cae bajo el minimapa (right-aligned) ⇒ acopla la fila DEBAJO del
      // punto más bajo entre el marco del minimapa y esa columna, para no re-colisionar con su texto (CAS-2263).
      const by=Math.max(mmY+120+10, (rightColBottom||0)+10);
      return { bx:mmX, by };                              // gap ~10px, alineado al borde izq del minimapa
    }
    const GCX=view.gcx ? view.gcx() : VW/2;                // centro X del área de juego visible (respeta el sidebar)
    const gx=(GCX*2>VW)?VW:GCX*2;                          // borde derecho útil del área de juego
    return { bx:gx-118, by:VH*0.055 };                     // fallback histórico esquina superior-derecha
  }
  // Pip discreto de "Zona segura": escudo procedural (canvas, $0 arte) + micro-label. Screen-space, no toca sim/save.
  // Sólo se dibuja dentro de la ciudad. CAS-2263: anclado vía badgeRowAnchor() (bajo el minimapa vivo o fallback).
  function renderSafeZoneBadge(){
    const h=G.hero; if(!h || !inCitySafe(h.x,h.y)) return;
    const a=badgeRowAnchor();
    const pulse=0.72+0.14*Math.sin(G.t*3);
    const bx=a.bx, by=a.by, sw=13, sh=16;  // ancla del escudo
    ctx.save(); ctx.globalAlpha=pulse;
    // escudo: contorno oscuro + relleno verde suave + tick de check
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx+sw, by); ctx.lineTo(bx+sw, by+sh*0.55);
    ctx.quadraticCurveTo(bx+sw, by+sh, bx+sw/2, by+sh); ctx.quadraticCurveTo(bx, by+sh, bx, by+sh*0.55);
    ctx.closePath();
    ctx.fillStyle="rgba(46,120,64,0.55)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.stroke();
    ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle="#8fe6a0"; ctx.lineJoin="round";
    ctx.moveTo(bx+sw*0.28, by+sh*0.5); ctx.lineTo(bx+sw*0.46, by+sh*0.68); ctx.lineTo(bx+sw*0.74, by+sh*0.3); ctx.stroke();
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=by+sh/2, tx=bx+sw+5;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText("Zona segura",tx,ty);
    ctx.fillStyle=COL.cream; ctx.fillText("Zona segura",tx,ty);
    // CAS-2310: DOMINIO DE ÓRDENES — estandarte de la orden CONTROLADORA del Santuario, desplegado mientras CUALQUIER jugador está DENTRO
    // de la Zona Segura (estado del MUNDO compartido; DERIVADO de la Clasificación server-auth vía sim.territoryBanner ⇒ MISMO controlador
    // para todos en la zona, 0 duplicación de lógica). $0 arte (glifo ⚑ + tag ámbar, anclado al ancho de "Zona segura"). Gated en
    // ORDER_TERRITORY.enabled ⇒ OFF ⇒ nada dibuja ⇒ byte-idéntico a HEAD (el badge de Zona segura queda intacto).
    if(ORDER_TERRITORY.enabled){ const tb=sim.territoryBanner();
      if(tb){ const lbl=" ⚑"+(tb.tag||tb.name||""); const lw=ctx.measureText("Zona segura").width;
        ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(lbl,tx+lw,ty);
        ctx.fillStyle="#ffc16a"; ctx.fillText(lbl,tx+lw,ty); } }
    // CAS-2313: ASALTO AL SANTUARIO — mientras la VENTANA de asalto está activa, TODOS los en-zona ven "Asalto en curso" + progreso del
    // retador (estado del MUNDO compartido; DERIVADO server-auth vía sim.contestBanner ⇒ MISMO estado para todos en la zona, 0 duplicación
    // de lógica). Al superar el umbral, el estandarte ⚑ de arriba YA muestra al retador (flip visible). $0 arte (segunda micro-línea + barra
    // procedural). Gated en ORDER_CONTEST.enabled ⇒ OFF ⇒ nada dibuja ⇒ byte-idéntico a HEAD.
    if(ORDER_CONTEST.enabled){ const cb=sim.contestBanner();
      if(cb){ ctx.font="bold 10px "+FF; const cy=ty+13;
        const msg=cb.flipped ? "⚔ Asalto: ¡"+(cb.challengerTag||"")+" toma el Santuario!" : "⚔ Asalto en curso · "+(cb.challengerTag||"");
        ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(msg,tx,cy);
        ctx.fillStyle=cb.flipped?"#ffd15c":"#ff8f6a"; ctx.fillText(msg,tx,cy);
        const mw=ctx.measureText(msg).width, bx2=tx, by2=cy+8, bw2=Math.max(60,mw), bh2=3;   // barra de progreso del asalto
        ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(bx2,by2,bw2,bh2);
        ctx.fillStyle=cb.flipped?"#ffd15c":"#ff8f6a"; ctx.fillRect(bx2,by2,bw2*Math.max(0,Math.min(1,+cb.progress||0)),bh2); } }
    ctx.restore();
  }

  // CAS-2255/CAS-2259: indicador "Descanso" (Rested XP). Barra discreta bajo el pip de Zona Segura que refleja
  // h.restedPool/poolCap (autoridad en sim). Sólo dibuja con pool>0 (el bono existe). Cosmético puro: no lee/escribe
  // sim ni RNG. Gated arriba en RESTED_XP.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  //   · DENTRO de la Zona Segura → el pool ACUMULA: barra dorada + micro-hint "acumulando".
  //   · FUERA de la Zona Segura con pool>0 → willSpend: el próximo gainXP GASTA descanso (bonus ×xpMult). Afordancia
  //     tipo "rested" de WoW: tag pulsante "zZ ×N" (alineado al borde de la barra) para que salir a cazar con bono se sienta.
  //   La condición willSpend refleja EXACTAMENTE la autoridad de sim: !inSafeZone (mismo bbox POI+cityMargin que inCitySafe).
  // CAS-2278: cap de Descanso VISUAL incluyendo el reward "restedCap" del Intendente (mirror sim.restedCapFor; 0 sim/RNG).
  // Gated ⇒ SANCTUARY_REWARDS OFF / sin ese reward ⇒ devuelve RESTED_XP.poolCap exacto ⇒ barra byte-idéntica a HEAD.
  function restedCapView(h){ if(!SANCTUARY_REWARDS.enabled || !h || !Array.isArray(h.sanctuaryRewards) || !h.sanctuaryRewards.length) return RESTED_XP.poolCap;
    const defs=SANCTUARY_REWARDS.rewards||[]; let sum=0;
    for(const d of defs){ if(d.kind==="restedCap" && h.sanctuaryRewards.indexOf(d.id)>=0) sum+=(+d.value||0); }
    return RESTED_XP.poolCap*(1+sum); }
  function renderRestedBadge(){
    const h=G.hero; if(!h) return;
    const pool=+(h.restedPool||0), cap=restedCapView(h)||1;
    if(pool<=0) return;                                   // sin bono acumulado ⇒ sin indicador (0 draws)
    const pct=Math.max(0,Math.min(1,pool/cap));
    const willSpend=!inCitySafe(h.x,h.y);                 // fuera de la Zona Segura ⇒ el bono se está gastando (WoW rested)
    const a=badgeRowAnchor();                              // CAS-2263: misma ancla que el pip "Zona segura"
    const bw=104, bh=6, bx=a.bx, by=a.by+22;              // justo bajo el pip "Zona segura" (fila anclada al minimapa vivo)
    ctx.save();
    // fila de etiqueta: "Descanso" a la izquierda + afordancia de estado ALINEADA A LA DERECHA del borde de la barra
    // (todo dentro de [bx, bx+bw] ⇒ nunca se sale del borde derecho del área de juego).
    const ly=by-2;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText("Descanso",bx,ly);
    ctx.fillStyle=COL.textGold; ctx.fillText("Descanso",bx,ly);
    if(willSpend){
      // burbuja "rested" (WoW): consumiendo bono ×xpMult mientras cazas fuera del santuario. Parpadeo suave + tag legible.
      const bp=0.72+0.28*Math.sin(G.t*4.5);
      const mtx="zZ ×"+(+RESTED_XP.xpMult).toFixed(RESTED_XP.xpMult%1?1:0);
      ctx.globalAlpha=bp; ctx.font="bold 10px "+FF; ctx.textAlign="right";
      ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(mtx,bx+bw,ly);
      ctx.fillStyle=COL.textGold; ctx.fillText(mtx,bx+bw,ly); ctx.globalAlpha=1;
    } else {
      // dentro del santuario: el pool ACUMULA (sutil, gris cálido, sin robar atención)
      ctx.globalAlpha=0.65; ctx.font="9px "+FF; ctx.textAlign="right"; ctx.fillStyle="#c9b98a";
      ctx.fillText("acumulando",bx+bw,ly); ctx.globalAlpha=1;
    }
    // barra: marco + relleno dorado proporcional al pool + brillo suave (pulso más vivo cuando se gasta el bono)
    ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(bx-1,by,bw+2,bh+2);
    ctx.fillStyle="rgba(60,44,16,0.85)"; ctx.fillRect(bx,by+1,bw,bh);
    const pulse=(willSpend?0.82:0.78)+(willSpend?0.16:0.12)*Math.sin(G.t*(willSpend?4.5:3));
    ctx.globalAlpha=pulse; ctx.fillStyle=COL.textGold; ctx.fillRect(bx,by+1,Math.round(bw*pct),bh);
    ctx.globalAlpha=1; ctx.lineWidth=1; ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.strokeRect(bx+0.5,by+0.5,bw,bh+1);
    ctx.restore();
  }

  // CAS-2266: indicador "Vínculo/Recall" (Piedra de Vínculo). Runa de vínculo procedural (canvas, $0 arte) + micro-label
  // "Recall" + estado del cooldown, ANCLADO en la fila de badges (bajo el pip Zona segura + la barra Descanso). Refleja la
  // autoridad de sim (h.bindPoint = vinculado; h.recallCD = cooldown restante; h.recallChannelT = canal). Cosmético puro:
  // no lee/escribe sim ni RNG. Gated arriba en RECALL.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  //   · Sin vínculo (nunca visitó un Santuario) → sin indicador (0 draws).
  //   · Vinculado + listo → runa azul brillante + "Recall" + "listo" (afordancia de que la habilidad está disponible).
  //   · Vinculado + cooldown → runa atenuada + cuenta atrás "mm:ss" (misma legibilidad que el resto de la fila).
  //   · Canalizando (channelSec>0, dormido Stage-1) → "canalizando…" pulsante.
  function renderRecallBadge(){
    const h=G.hero; if(!h || !h.bindPoint) return;                  // sin vínculo ⇒ sin indicador
    const cd=Math.max(0,+(h.recallCD||0)), channel=Math.max(0,+(h.recallChannelT||0));
    const ready=cd<=0 && channel<=0;
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+40, rw=13, rh=16;                        // bajo la barra "Descanso" (fila anclada al minimapa)
    const pulse=ready?(0.74+0.16*Math.sin(G.t*3)):0.6;
    ctx.save(); ctx.globalAlpha=pulse;
    // runa de vínculo: rombo/piedra con contorno oscuro + relleno azul (brillante si listo, atenuado en cooldown) + chispa
    const cx=bx+rw/2, cy=by+rh/2;
    ctx.beginPath();
    ctx.moveTo(cx, by); ctx.lineTo(bx+rw, cy); ctx.lineTo(cx, by+rh); ctx.lineTo(bx, cy); ctx.closePath();
    ctx.fillStyle=ready?"rgba(60,130,200,0.62)":"rgba(70,80,96,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.stroke();
    ctx.beginPath(); ctx.lineWidth=2; ctx.strokeStyle=ready?"#bfe4ff":"#9aa4b2"; ctx.lineJoin="round";
    ctx.moveTo(cx, by+rh*0.28); ctx.lineTo(cx, by+rh*0.72); ctx.moveTo(bx+rw*0.32, cy); ctx.lineTo(bx+rw*0.68, cy); ctx.stroke();
    // micro-label + estado
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+rw+5;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText("Recall",tx,ty);
    ctx.fillStyle=COL.cream; ctx.fillText("Recall",tx,ty);
    // estado a la derecha de la fila (dentro de [bx, bx+118])
    let st, stc;
    if(channel>0){ st="canalizando…"; stc="#bfe4ff"; }
    else if(ready){ st="listo"; stc="#8fd6ff"; }
    else { const m=Math.floor(cd/60), s=Math.floor(cd%60); st=m+":"+(s<10?"0":"")+s; stc="#c9b98a"; }
    ctx.globalAlpha=channel>0?(0.72+0.28*Math.sin(G.t*4.5)):(ready?pulse:0.7);
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=stc; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2269: indicador "Tablón/Recompensa" (Bounty Board). Pergamino de contrato procedural (canvas, $0 arte) + micro-label
  // con el nombre del contrato + progreso n/N + barra discreta, ANCLADO en la fila de badges (bajo el pip Zona segura + Descanso
  // + Recall). El progreso se DERIVA de los mismos contadores monótonos que usa sim (h.kills / h.killsByType), cosmético puro:
  // NO lee/escribe sim ni RNG. Gated arriba en BOUNTY_BOARD.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  //   · Con contrato activo → pergamino ámbar + "nombre" + "n/N" (verde "listo" cuando n≥N; rastreable mientras cazas fuera).
  //   · En el Santuario sin contrato → pergamino atenuado + pista "Tablón" + nombre del destacado (invita a aceptar).
  function renderBountyBadge(){
    const h=G.hero; if(!h) return;
    const b=h.bounty||null;
    const inZone=inCitySafe(h.x,h.y);
    if(!b && !inZone) return;                                        // sin contrato y fuera del Santuario ⇒ sin indicador
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+58, sw=13, sh=16;                        // bajo la fila del Recall (fila anclada al minimapa)
    // progreso derivado (mismo cálculo que sim; lectura pura)
    let prog=0, count=0, done=false, label="";
    if(b){ count=b.count|0;
      const cur=(b.target==="any") ? (h.kills|0) : (((h.killsByType||{})[b.target])|0);
      prog=Math.max(0, Math.min(count, cur-(b.base|0))); done=prog>=count && count>0;
      const def=(BOUNTY_BOARD.bounties||[]).find(x=>x.id===b.id); label=(def&&def.name)||"Contrato"; }
    else { const L=BOUNTY_BOARD.bounties||[]; const n=L.length; const feat=n?L[(((h.bountyIdx|0)%n)+n)%n]:null;
      label=feat?feat.name:"—"; }
    const pulse=b?(done?(0.78+0.16*Math.sin(G.t*3)):0.74):0.55;
    ctx.save(); ctx.globalAlpha=pulse;
    // pergamino: rectángulo con contorno oscuro + relleno pergamino (ámbar si activo, atenuado como pista) + dos líneas de texto
    ctx.beginPath();
    ctx.moveTo(bx, by+sh*0.16); ctx.lineTo(bx+sw, by+sh*0.16); ctx.lineTo(bx+sw, by+sh*0.84); ctx.lineTo(bx, by+sh*0.84); ctx.closePath();
    ctx.fillStyle=b?(done?"rgba(90,150,70,0.6)":"rgba(150,110,50,0.58)"):"rgba(90,84,70,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.stroke();
    ctx.beginPath(); ctx.lineWidth=1.5; ctx.strokeStyle=b?(done?"#c9f0a8":"#e9cf94"):"#b7ad97"; ctx.lineJoin="round";
    ctx.moveTo(bx+sw*0.24, by+sh*0.4); ctx.lineTo(bx+sw*0.76, by+sh*0.4);
    ctx.moveTo(bx+sw*0.24, by+sh*0.6); ctx.lineTo(bx+sw*0.62, by+sh*0.6); ctx.stroke();
    // micro-label (nombre del contrato / destacado)
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=by+sh/2, tx=bx+sw+5;
    const lbl=(b?label:("Tablón: "+label));
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=b?COL.cream:"#c9b98a"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha de la fila (dentro de [bx, bx+104]): progreso n/N o "listo"
    if(b){
      let st, stc;
      if(done){ st="listo"; stc="#a8e08a"; }
      else { st=prog+"/"+count; stc="#e9cf94"; }
      ctx.font="bold 10px "+FF; ctx.textAlign="right";
      ctx.globalAlpha=done?pulse:0.85;
      ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(st,bx+104,ty);
      ctx.fillStyle=stc; ctx.fillText(st,bx+104,ty);
      // barra de progreso discreta bajo la fila
      const barW=104, barH=3, byy=by+sh+2, fr=count>0?prog/count:0;
      ctx.globalAlpha=0.7;
      ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(bx,byy,barW,barH);
      ctx.fillStyle=done?"#8fe07a":"#d9a94e"; ctx.fillRect(bx,byy,Math.round(barW*fr),barH);
    }
    // CAS-2272: indicador de RENOMBRE DEL SANTUARIO (Sanctuary Reputation, render-only, $0 arte, DARK). Sólo DENTRO del Santuario
    // (inZone) — el faction-standing es cosmético del hub. Rango actual (violeta) + barra de progreso al siguiente umbral, DERIVADO
    // del total acumulado (misma aritmética pura que sim.sanctuaryRank; NO lee/escribe sim ni RNG). Gated en SANCTUARY_REP.enabled
    // ⇒ OFF nunca se dibuja ⇒ badge byte-idéntico a HEAD (CAS-2269, abs-diff limpio).
    if(SANCTUARY_REP.enabled && inZone){
      const rep=Math.max(0,h.sanctuaryRep|0), R=SANCTUARY_REP.ranks||[];
      let ci=0; for(let i=0;i<R.length;i++){ if(rep>=(R[i].at|0)) ci=i; }
      const cur=R[ci]||{name:"—",at:0}, next=R[ci+1]||null;
      const ry=by+sh+(b?9:3);
      ctx.globalAlpha=0.9; ctx.font="bold 10px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
      const rl="Santuario: "+(cur.name||"—");
      ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(rl,bx,ry+6);
      ctx.fillStyle="#d9c48a"; ctx.fillText(rl,bx,ry+6);
      if(next){ const into=Math.max(0,rep-(cur.at|0)), span=Math.max(1,(next.at|0)-(cur.at|0)), fr=Math.max(0,Math.min(1,into/span));
        const barW=104, barH=3, byy=ry+13;
        ctx.globalAlpha=0.72; ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(bx,byy,barW,barH);
        ctx.fillStyle="#b98fe0"; ctx.fillRect(bx,byy,Math.round(barW*fr),barH);   // violeta = faction-standing
        ctx.globalAlpha=0.82; ctx.font="9px "+FF; ctx.textAlign="right"; ctx.fillStyle="#c7b3e6"; ctx.fillText(into+"/"+span, bx+barW, ry+6);
      } else { ctx.globalAlpha=0.85; ctx.font="9px "+FF; ctx.textAlign="right"; ctx.fillStyle="#b98fe0"; ctx.fillText("máx", bx+104, ry+6); }
    }
    ctx.restore();
  }

  // CAS-2278: TÍTULO DE RENOMBRE — el `title` del reward RECLAMADO de mayor rango (o "" si ninguno). Cálculo PURO idéntico a
  // sim.sanctuaryRewardTitle (0 sim/RNG); lo comparten el badge del Intendente y el nameplate del héroe. Gated ⇒ OFF / sin
  // rewards ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD.
  function renownTitleOf(h){ if(!SANCTUARY_REWARDS.enabled || !h) return "";
    const arr=Array.isArray(h.sanctuaryRewards)?h.sanctuaryRewards:null; if(!arr||!arr.length) return "";
    const defs=SANCTUARY_REWARDS.rewards||[], ranks=SANCTUARY_REP.ranks||[];
    const rankIdxOf=id=>{ for(let i=0;i<ranks.length;i++){ if(ranks[i].id===id) return i; } return 1e9; };
    let best=-1, title=""; for(const d of defs){ if(arr.indexOf(d.id)>=0){ const ri=rankIdxOf(d.rank); if(ri>=best){ best=ri; title=d.title||d.name||""; } } }
    return title; }

  // CAS-2295: TAG DE ORDEN — el `tag` de la orden jurada (o "" si ninguna). Cálculo PURO idéntico a sim.sanctuaryOathTag (0 sim/RNG);
  // lo usa el nameplate del héroe. Gated ⇒ OFF / sin juramento ⇒ "" ⇒ nada dibuja ⇒ byte-idéntico a HEAD.
  function oathTagOf(h){ if(!SANCTUARY_OATH.enabled || !h || !h.sanctuaryOath) return "";
    const O=SANCTUARY_OATH.orders||[]; for(let i=0;i<O.length;i++){ if(O[i].id===h.sanctuaryOath) return O[i].tag||O[i].name||""; } return ""; }

  // CAS-2278: indicador "Intendente" (Sanctuary Quartermaster). Sólo DENTRO del Santuario (inCitySafe) — es un vendor de hub.
  // Muestra la cuenta de recompensas de renombre RECLAMABLES (rango de rep alcanzado + no reclamadas; ámbar-violeta pulsante si
  // ≥1) + el título de renombre actual. Progreso DERIVADO puro (misma aritmética que sim.tryQuartermaster; NO lee/escribe sim ni
  // RNG). Gated arriba en SANCTUARY_REWARDS.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  function renderQuartermasterBadge(){
    const h=G.hero; if(!h || !inCitySafe(h.x,h.y)) return;
    const defs=SANCTUARY_REWARDS.rewards||[], ranks=SANCTUARY_REP.ranks||[];
    const rep=Math.max(0,h.sanctuaryRep|0);
    let repIdx=0; for(let i=0;i<ranks.length;i++){ if(rep>=(ranks[i].at|0)) repIdx=i; }
    const rankIdxOf=id=>{ for(let i=0;i<ranks.length;i++){ if(ranks[i].id===id) return i; } return 1e9; };
    const claimedArr=Array.isArray(h.sanctuaryRewards)?h.sanctuaryRewards:null;
    let claimable=0; for(const d of defs){ const unlocked=repIdx>=rankIdxOf(d.rank), claimed=!!(claimedArr&&claimedArr.indexOf(d.id)>=0); if(unlocked&&!claimed) claimable++; }
    const title=renownTitleOf(h);
    if(claimable<=0 && !title) return;                    // sin recompensas listas ni título ⇒ sin indicador (0 draws)
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+100;                           // bajo la fila de badges (safezone/rested/recall/bounty+rep); gap generoso anti-solape (CAS-2263)
    ctx.save();
    // línea 1: ✦ Intendente + estado a la derecha (N listas [Supr] / al día)
    const pulse=claimable>0 ? (0.7+0.28*Math.sin(G.t*3.4)) : 0.62;
    ctx.globalAlpha=pulse; ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const lbl="✦ Intendente";
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,bx,by+6);
    ctx.fillStyle=claimable>0?"#e7c9ff":"#c9b3e0"; ctx.fillText(lbl,bx,by+6);
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=claimable>0?("✦"+claimable+" [Supr]"):"al día";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,by+6);
    ctx.fillStyle=claimable>0?"#d9b0ff":"#a99bc4"; ctx.fillText(st,bx+104,by+6);
    // línea 2: título de renombre reclamado
    if(title){ ctx.globalAlpha=0.85; ctx.font="9px "+FF; ctx.textAlign="left"; ctx.lineWidth=2.5; ctx.strokeStyle="rgba(0,0,0,0.6)";
      ctx.strokeText("«"+title+"»",bx,by+18); ctx.fillStyle="#c7b3e6"; ctx.fillText("«"+title+"»",bx,by+18); }
    ctx.restore();
  }

  // CAS-2284: indicador "Toque de Guerra" (World Event / Sanctuary Warhorn). SIEMPRE visible (evento MUNDIAL compartido, no
  // per-hub) cuando la feature está ON: un cuerno + estado del EVENTO. OCIOSO → "próx mm:ss" (cuenta atrás al siguiente Toque,
  // gris cálido). ACTIVO → "¡ACTIVO! mm:ss" ámbar/rojo pulsante + fase (Llamada/Fervor). Deriva de G.warhorn (autoridad en sim,
  // reloj compartido); cosmético puro (no lee/escribe sim/RNG/save). Gated arriba en WORLD_EVENT.enabled ⇒ OFF nunca se invoca.
  function renderWarhornBadge(){
    const w=G.warhorn; if(!w) return;                       // aún sin derivar (pre-primer-tick) ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+120, sw=14, sh=14;               // bajo toda la fila de badges (gap anti-solape con el Intendente @+100)
    const active=!!w.active, peak=w.phase==="peak";
    const secs=active?(+w.remainingSec||0):(+w.nextInSec||0);
    const mm=(secs/60)|0, ss=Math.max(0,Math.ceil(secs))%60, tstr=mm+":"+String(ss).padStart(2,"0");
    const pulse=active?(0.72+0.24*Math.sin(G.t*(peak?5.5:3.8))):0.6;
    const glyph=active?(peak?"#ff8a4a":"#ffcf5a"):"#c9b98a"; // pico=rojo-ámbar, llamada=ámbar, ocioso=gris cálido
    ctx.save(); ctx.globalAlpha=pulse;
    // cuerno procedural ($0 arte): arco cónico con boca abierta + contorno oscuro
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.beginPath();
    ctx.moveTo(bx, by+sh*0.72); ctx.quadraticCurveTo(bx+sw*0.2, by+sh*0.1, bx+sw*0.9, by+sh*0.2);
    ctx.lineTo(bx+sw, by+sh*0.5); ctx.quadraticCurveTo(bx+sw*0.5, by+sh*0.55, bx+sw*0.28, by+sh);
    ctx.closePath();
    ctx.fillStyle=active?(peak?"rgba(180,70,30,0.62)":"rgba(170,120,40,0.6)"):"rgba(96,88,66,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    // ondas de sonido si está activo (afordancia de "sonando")
    if(active){ ctx.beginPath(); ctx.lineWidth=1.4; ctx.strokeStyle=glyph;
      ctx.arc(bx+sw*0.98, cy, sh*0.34, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx+sw*0.98, cy, sh*0.6, -0.7, 0.7); ctx.globalAlpha=pulse*0.6; ctx.stroke(); ctx.globalAlpha=pulse; }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Toque de Guerra";
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=active?"#ffe6b0":"#c9b98a"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104])
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=active?("¡ACTIVO! "+tstr):("próx "+tstr);
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    // fase bajo la fila cuando está activo (Llamada / Fervor)
    if(active){ ctx.globalAlpha=pulse*0.9; ctx.font="9px "+FF; ctx.textAlign="left"; ctx.fillStyle=peak?"#ffb27a":"#e9cf94";
      ctx.fillText(peak?"Fervor":"Llamada", bx, by+sh+6); }
    ctx.restore();
  }

  // CAS-2292: indicador "Emisario del Santuario" (Sanctuary Emissary). Sello de emisario procedural (canvas, $0 arte) + micro-label
  // con el nombre de la world-quest ROTATIVA del turno + progreso n/N + barra discreta, ANCLADO bajo toda la fila de badges (gap
  // anti-solape con el Toque de Guerra @+120). El progreso se DERIVA de los MISMOS contadores monótonos que usa sim (h.killsByType),
  // cosmético puro: NO lee/escribe sim ni RNG. Gated arriba en SANCTUARY_EMISSARY.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  //   · Con emisario ACEPTADO del period actual → sello azul + "nombre" + "n/N" (verde "listo"/"cumplido"; rastreable al cazar fuera).
  //   · En el Santuario sin aceptar (o period rolado) → sello atenuado + pista "Emisario" + nombre del activo (invita a aceptar).
  function renderEmissaryBadge(){
    const h=G.hero; if(!h) return;
    const inZone=inCitySafe(h.x,h.y);
    const sched=G.emissary||null;                                    // rotación compartida (autoridad en sim, derivada del reloj)
    const q=h.emissary||null;
    const active=!!(q && sched && (q.period|0)===(sched.period|0));   // emisario aceptado y VIGENTE para el period actual (no rolado)
    if(!active && !inZone) return;                                    // sin emisario vigente y fuera del Santuario ⇒ sin indicador
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+142, sw=13, sh=14;                        // bajo el Toque de Guerra (@+120); gap anti-solape (CAS-2263)
    // progreso derivado (mismo cálculo que sim; lectura pura)
    let prog=0, count=0, done=false, claimed=false, label="";
    if(active){ count=q.count|0;
      const cur=(q.target==="any")?(h.kills|0):(((h.killsByType||{})[q.target])|0);
      prog=Math.max(0, Math.min(count, cur-(q.base|0))); done=prog>=count && count>0; claimed=!!q.claimed;
      const def=(SANCTUARY_EMISSARY.emissaries||[]).find(x=>x.id===q.id); label=(def&&def.name)||"Emisario"; }
    else { label=(sched&&sched.def&&sched.def.name)?sched.def.name:"—"; }                          // pista del emisario del turno
    const ready=active&&(done||claimed);
    const pulse=active?(ready?(0.78+0.16*Math.sin(G.t*3)):0.74):0.55;
    ctx.save(); ctx.globalAlpha=pulse;
    // sello de emisario ($0 arte): rombo (lacre) con contorno oscuro + cinta central (azul si vigente, atenuado como pista)
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.beginPath();
    ctx.moveTo(cx, by+sh*0.1); ctx.lineTo(bx+sw*0.92, cy); ctx.lineTo(cx, by+sh*0.9); ctx.lineTo(bx+sw*0.08, cy); ctx.closePath();
    ctx.fillStyle=active?(ready?"rgba(90,150,70,0.6)":"rgba(60,110,160,0.58)"):"rgba(80,86,96,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.75)"; ctx.stroke();
    ctx.beginPath(); ctx.lineWidth=1.4; ctx.strokeStyle=active?(ready?"#c9f0a8":"#bfe0ff"):"#adb7c2"; ctx.lineJoin="round";
    ctx.moveTo(bx+sw*0.28, cy); ctx.lineTo(bx+sw*0.72, cy); ctx.stroke();
    // micro-label (nombre del emisario / pista)
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5;
    const lbl=(active?label:("Emisario: "+label));
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=active?COL.cream:"#a9bccb"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha de la fila (dentro de [bx, bx+104]): "cumplido" / "listo" / progreso n/N
    if(active){
      let st, stc;
      if(claimed){ st="cumplido"; stc="#a8e08a"; }
      else if(done){ st="listo"; stc="#a8e08a"; }
      else { st=prog+"/"+count; stc="#bfe0ff"; }
      ctx.font="bold 10px "+FF; ctx.textAlign="right";
      ctx.globalAlpha=ready?pulse:0.85;
      ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.7)"; ctx.strokeText(st,bx+104,ty);
      ctx.fillStyle=stc; ctx.fillText(st,bx+104,ty);
      // barra de progreso discreta bajo la fila
      const barW=104, barH=3, byy=by+sh+2, fr=count>0?prog/count:0;
      ctx.globalAlpha=0.7;
      ctx.fillStyle="rgba(0,0,0,0.55)"; ctx.fillRect(bx,byy,barW,barH);
      ctx.fillStyle=(done||claimed)?"#8fe07a":"#5aa0e0"; ctx.fillRect(bx,byy,Math.round(barW*fr),barH);
    }
    ctx.restore();
  }

  // CAS-2329: indicador "Pulso del Mundo" (World Pulse). Rombo ◈ procedural (canvas, $0 arte) + micro-label "Pulso del Mundo: <zona>" con la zona-en-Pulso
  // AMBIENTAL COMPARTIDA del turno + cuenta atrás al próximo pulso, ANCLADO bajo toda la fila de badges (gap anti-solape con el Emisario @+142). El estado
  // se DERIVA del reloj de pared compartido (sim.worldPulse ⇒ MISMA zona-en-Pulso para todos en el shard, 0 duplicación de lógica); cosmético puro: NO
  // lee/escribe sim ni RNG. Gated arriba en WORLD_PULSE.enabled ⇒ OFF nunca se invoca ⇒ salida byte-idéntica.
  //   · Con pulso VIVO → rombo brillante + nombre de la zona + "aquí" (verde, si el héroe está EN la zona ⇒ recibe el passive) / "activo" (ámbar, en otra zona).
  //   · Decaído (entre pulsos) → rombo atenuado + "próx mm:ss" (cuenta atrás al siguiente pulso).
  function renderWorldPulseBadge(){
    const w=sim.worldPulse&&sim.worldPulse(); if(!w) return;              // autoridad en sim; pre-primer-tick (G.pulse null) ⇒ zona null ⇒ decaído
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+164, sw=14, sh=14;                            // bajo el Emisario (@+142); gap anti-solape (CAS-2263)
    const live=!!w.live, here=!!w.inZone;
    const secs=+w.nextInSec||0, mm=(secs/60)|0, ss=Math.max(0,Math.ceil(secs))%60, tstr=mm+":"+String(ss).padStart(2,"0");
    const pulse=live?(0.74+0.22*Math.sin(G.t*(here?4.6:3.4))):0.55;
    const glyph=live?(here?"#8fe0a0":"#7ad0ff"):"#8a9bb0";               // en zona=verde (buff), en otra=azul-cian, decaído=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    ctx.save(); ctx.globalAlpha=pulse;
    // rombo ◈ de energía ambiental ($0 arte): diamante con núcleo pulsante
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.beginPath();
    ctx.moveTo(cx, by+sh*0.06); ctx.lineTo(bx+sw*0.94, cy); ctx.lineTo(cx, by+sh*0.94); ctx.lineTo(bx+sw*0.06, cy); ctx.closePath();
    ctx.fillStyle=live?(here?"rgba(70,150,90,0.6)":"rgba(50,110,160,0.58)"):"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    if(live){ const pr=1.4+Math.sin(G.t*(here?5:3.6))*1.1; ctx.fillStyle=glyph; ctx.globalAlpha=pulse*0.9;
      ctx.beginPath(); ctx.arc(cx,cy,2+Math.max(0,pr),0,6.28); ctx.fill(); ctx.globalAlpha=pulse; }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Pulso del Mundo: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=live?"#dff0ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104])
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=live?(here?"aquí":"activo"):("próx "+tstr);
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2332: badge "Congregación" ($0 arte, render-only, DARK). Autoridad en sim (congregationVM). Glifo ⛭ procedural = anillo + N puntos (tier);
  // resalta cuando el héroe está en una zona en Congregación (recibe el passive compartido). Muestra tier + headcount LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderCongregationBadge(){
    const w=sim.congregationVM&&sim.congregationVM(); if(!w) return;      // pre-primer-tick (G.congregation null) ⇒ count 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+186, sw=14, sh=14;                            // bajo el Pulso del Mundo (@+164); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, cnt=w.count|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.2+tier*0.5))):0.55;
    const glyph=here?"#f0c67a":"#8a9bb0";                                // congregado=ámbar (buff), inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⛭ energía de multitud: anillo + puntos-de-cabeza (uno por jugador hasta el umbral del tier siguiente) procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(150,110,60,0.6)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    if(here){ ctx.fillStyle=glyph; const n=Math.min(3,tier); for(let i=0;i<n;i++){ const ang=-1.5708+i*(6.283/n); ctx.beginPath(); ctx.arc(cx+Math.cos(ang)*3.4,cy+Math.sin(ang)*3.4,1.5,0,6.28); ctx.fill(); } }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Congregación: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe6b8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + headcount
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" ×"+cnt):(w.congable?("×"+cnt):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2335: badge "Sendero Trillado" ($0 arte, render-only, DARK). Autoridad en sim (wayfarerVM). Glifo ⌇ procedural = traza sinuosa (el sendero);
  // resalta cuando el héroe transita una celda que cruzó el umbral de tránsito (recibe el passive compartido). Muestra el tread decaído vs umbral. Cosmético (no lee/escribe RNG ni save).
  function renderWayfarerBadge(){
    const w=sim.wayfarerVM&&sim.wayfarerVM(); if(!w) return;               // pre-primer-tick (G.wayfarer null) ⇒ tread 0 ⇒ no trillada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+208, sw=14, sh=14;                             // bajo la Congregación (@+186); gap anti-solape (CAS-2263)
    const here=!!w.trodden, tread=+w.tread||0, thr=+w.threshold||1;
    const frac=Math.max(0,Math.min(1,tread/thr));
    const pulse=here?(0.74+0.20*Math.sin(G.t*3.0)):0.55;
    const glyph=here?"#c8b68a":"#8a9bb0";                                 // sendero abierto=arena/tierra pisada, inerte=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⌇ traza del sendero: dos surcos sinuosos procedurales (huella de tránsito)
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(120,100,66,0.6)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    ctx.lineWidth=1.4; ctx.lineCap="round"; ctx.strokeStyle=here?glyph:"rgba(138,155,176,0.7)";
    for(let s=-1;s<=1;s+=2){ ctx.beginPath(); for(let i=0;i<=6;i++){ const px=cx-4+i*1.35, py=cy+s*1.6+Math.sin(i*1.1)*1.5; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); } ctx.stroke(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Sendero Trillado";
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e9dcb8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): trillado ✓ / progreso de tránsito %
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?"⌇ activo":(Math.round(frac*100)+"%");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2338: badge "Confluencia" ($0 arte, render-only, DARK). Autoridad en sim (confluenceVM). Glifo ❈ procedural = N radios de distinto tono (una clase distinta
  // por radio hasta el tier) = corrientes que confluyen; resalta cuando el héroe está en una zona con composición diversa (recibe el passive compartido). Muestra tier + diversidad LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderConfluenceBadge(){
    const w=sim.confluenceVM&&sim.confluenceVM(); if(!w) return;           // pre-primer-tick (G.confluence null) ⇒ diversity 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+230, sw=14, sh=14;                             // bajo el Sendero Trillado (@+208); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, div=w.diversity|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#9fd0c0":"#8a9bb0";                                 // confluencia=verde-azulado (mezcla), inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ❈ corrientes que confluyen: anillo + N radios (uno por clase distinta hasta el umbral del tier) procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(70,120,110,0.6)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    if(here){ ctx.strokeStyle=glyph; ctx.lineWidth=1.3; ctx.lineCap="round"; const n=Math.max(2,Math.min(4,div)); for(let i=0;i<n;i++){ const ang=-1.5708+i*(6.283/n); ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(ang)*4.2,cy+Math.sin(ang)*4.2); ctx.stroke(); } }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Confluencia: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8ede2":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + diversidad (clases distintas)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" ×"+div):(w.confable?("×"+div):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2341: badge "Vigilia" ($0 arte, render-only, DARK). Autoridad en sim (longWatchVM). Glifo ⌖ procedural = anillo de vigía + arco creciente (fracción por tier) +
  // manecilla = TIEMPO sostenido; resalta cuando el héroe está en una zona en Vigilia (recibe el passive compartido). Muestra tier + streak LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderLongWatchBadge(){
    const w=sim.longWatchVM&&sim.longWatchVM(); if(!w) return;             // pre-primer-tick (G.longWatch null) ⇒ streak 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+252, sw=14, sh=14;                             // bajo la Confluencia (@+230); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, streak=w.streak|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#d8c48a":"#8a9bb0";                                 // vigilia=ámbar-vela (fuego de guardia), inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⌖ vigía: anillo + arco creciente (fracción tier/tierCount) + manecilla = tiempo sostenido, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(120,100,50,0.55)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    if(here){ ctx.strokeStyle=glyph; ctx.lineWidth=1.5; ctx.lineCap="round";
      const frac=Math.max(0.15,Math.min(1,tier/Math.max(1,w.tierCount|0)));
      ctx.beginPath(); ctx.arc(cx,cy,sw*0.30,-1.5708,-1.5708+6.283*frac); ctx.stroke();   // arco = progreso de tier
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy-3.6); ctx.stroke(); }           // manecilla de vigilia
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Vigilia: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#efe0b0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + streak (segundos-continuos)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+streak+"s"):(w.watchable?(streak+"s"):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2347: badge "Expedición" ($0 arte, render-only, DARK). Autoridad en sim (frontierVM). Glifo ⌗ procedural = malla de sub-celdas cubiertas (más celdas marcadas
  // según el tier = más dispersión/cobertura); resalta cuando el héroe está en una zona en Expedición (recibe el passive compartido). Muestra tier + cobertura LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderFrontierBadge(){
    const w=sim.frontierVM&&sim.frontierVM(); if(!w) return;               // pre-primer-tick (G.frontier null) ⇒ cover 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+274, sw=14, sh=14;                             // bajo la Vigilia (@+252); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, cover=Math.round(w.cover||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#8fd0b0":"#8a9bb0";                                 // expedición=verde-frontera, inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⌗ malla: fondo + rejilla 2×2 de sub-celdas; se "encienden" (tier+1) celdas = cobertura/dispersión, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(50,110,90,0.5)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    const g0=cx-sw*0.26, g1=cy-sh*0.26, gs=sw*0.24;                       // esquina superior-izq de la rejilla 2×2 + lado de cada sub-celda
    const lit=here?Math.min(4,tier+1):0;                                  // nº de sub-celdas "cubiertas" mostradas (T1⇒2, T2⇒3, T3⇒4)
    let ci=0;
    for(let gy=0;gy<2;gy++){ for(let gx=0;gx<2;gx++){ const on=ci<lit; ci++;
      ctx.fillStyle=on?glyph:"rgba(120,140,130,0.30)"; ctx.fillRect(g0+gx*(gs+2),g1+gy*(gs+2),gs,gs); } }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Expedición: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#bfe8d4":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + cobertura (sub-celdas distintas)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+cover):(w.frontierable?(cover+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2352: badge "Afluencia" ($0 arte, render-only, DARK). Autoridad en sim (influxVM). Glifo ⇈ procedural = flechas de entrada ascendentes (más flechas encendidas
  // según el tier = más flujo de recién-llegados); resalta cuando el héroe está en una zona en Afluencia (recibe el passive compartido). Muestra tier + surge LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderInfluxBadge(){
    const w=sim.influxVM&&sim.influxVM(); if(!w) return;                   // pre-primer-tick (G.influx null) ⇒ surge 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+296, sw=14, sh=14;                             // bajo la Expedición (@+274); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, surge=Math.round(w.surge||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#7ec8f0":"#8a9bb0";                                 // afluencia=azul-flujo, inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⇈ flechas: fondo + hasta 3 chevrons ascendentes; se "encienden" (tier) chevrons = intensidad del flujo, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(40,90,130,0.5)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    const lit=here?Math.min(3,tier):0, aw=sw*0.22;                        // nº de chevrons "encendidos" (T1⇒1, T2⇒2, T3⇒3)
    ctx.lineWidth=1.6; ctx.lineCap="round"; ctx.lineJoin="round";
    for(let ai=0;ai<3;ai++){ const on=ai<lit; const ay=cy+sh*0.24-ai*(sh*0.20);   // de abajo hacia arriba (flujo entrante)
      ctx.strokeStyle=on?glyph:"rgba(120,150,180,0.30)";
      ctx.beginPath(); ctx.moveTo(cx-aw,ay); ctx.lineTo(cx,ay-aw*0.9); ctx.lineTo(cx+aw,ay); ctx.stroke(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Afluencia: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c4e4f6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + surge (llegadas acumuladas)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+surge):(w.influxable?(surge+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2355: badge "Sincronía" ($0 arte, render-only, DARK). Autoridad en sim (syncVM). Glifo ⇌ procedural = dos espadas/flechas cruzadas sincronizadas (más arcos encendidos
  // según el tier = más jugadores coordinados); resalta cuando el héroe está en una zona en Sincronía (recibe el passive compartido). Muestra tier + nº sincronizados LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderSyncBadge(){
    const w=sim.syncVM&&sim.syncVM(); if(!w) return;                       // pre-primer-tick (G.sync null) ⇒ count 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+318, sw=14, sh=14;                             // bajo la Afluencia (@+296); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, count=w.count|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#f0b878":"#8a9bb0";                                 // sincronía=ámbar-batalla, inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⇌ espadas cruzadas: fondo + hasta 3 pares de trazos cruzados; se "encienden" (tier) = intensidad de la coordinación, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(120,80,30,0.5)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    const lit=here?Math.min(3,tier):0, aw=sw*0.30;                        // nº de aspas "encendidas" (T1⇒1, T2⇒2, T3⇒3)
    ctx.lineWidth=1.6; ctx.lineCap="round"; ctx.lineJoin="round";
    // dos diagonales cruzadas (X) que se refuerzan por tier
    for(let ai=0;ai<3;ai++){ const on=ai<lit; const sc=aw*(1-ai*0.24);
      ctx.strokeStyle=on?glyph:"rgba(180,150,120,0.28)";
      ctx.beginPath(); ctx.moveTo(cx-sc,cy-sc); ctx.lineTo(cx+sc,cy+sc); ctx.moveTo(cx+sc,cy-sc); ctx.lineTo(cx-sc,cy+sc); ctx.stroke(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Sincronía: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f6dcc0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + nº de jugadores sincronizados
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" ×"+count):(w.syncable?(count+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2356: badge "Marcha" ($0 arte, render-only, DARK). Autoridad en sim (convoyVM). Glifo ⇉ procedural = flechas PARALELAS en el rumbo común del convoy (más flechas encendidas
  // según el tier = marcha más sostenida/coherente); resalta cuando el héroe está en una zona en Marcha (recibe el passive compartido). Muestra tier + march LIVE. Cosmético (no lee/escribe RNG ni save).
  function renderConvoyBadge(){
    const w=sim.convoyVM&&sim.convoyVM(); if(!w) return;                   // pre-primer-tick (G.convoy null) ⇒ march 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+340, sw=14, sh=14;                             // bajo la Sincronía (@+318); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, march=Math.round(w.march||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.5))):0.55;
    const glyph=here?"#8fe0a0":"#8a9bb0";                                 // marcha=verde-avance, inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⇉ flechas: fondo + hasta 3 chevrons PARALELOS apuntando al rumbo común; se "encienden" (tier) = coherencia sostenida del convoy, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(40,110,70,0.5)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    const lit=here?Math.min(3,tier):0, ah=sw*0.20;                        // nº de chevrons "encendidos" (T1⇒1, T2⇒2, T3⇒3)
    ctx.lineWidth=1.6; ctx.lineCap="round"; ctx.lineJoin="round";
    for(let ai=0;ai<3;ai++){ const on=ai<lit; const ax=cx-sw*0.24+ai*(sw*0.20);   // de izq a der (avance del convoy →)
      ctx.strokeStyle=on?glyph:"rgba(120,160,140,0.30)";
      ctx.beginPath(); ctx.moveTo(ax-ah*0.9,cy-ah); ctx.lineTo(ax+ah*0.4,cy); ctx.lineTo(ax-ah*0.9,cy+ah); ctx.stroke(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Marcha: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c6f0d2":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + march (marcha sostenida)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+march):(w.convoyable?(march+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2362: badge de recuperación del CORDÓN DE GUARDIA (WARDING_RING). Refleja el VM PURO (sim.wardVM, autoridad en sim) ⇒ MISMO ward/tier para todos los clientes con el mismo
  // snapshot. Glifo procedural ◯ = anillo de guardia; los sectores "encendidos" (tier) = cobertura angular sostenida. Reusa la fila de badges de recuperación ($0-arte). Cosmético puro.
  function renderWardBadge(){
    const w=sim.wardVM&&sim.wardVM(); if(!w) return;                      // pre-primer-tick (G.ward null) ⇒ ward 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+362, sw=14, sh=14;                             // bajo la Marcha (@+340); gap anti-solape (CAS-2263)
    const tier=w.tier|0, here=tier>0, ward=Math.round(w.ward||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#8fd0e0":"#8a9bb0";                                 // cordón=cian-guardia, inerte=gris
    const zn=w.zone?STR.zoneName(w.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2, R=sw*0.40;
    ctx.save(); ctx.globalAlpha=pulse;
    // ◯ anillo: fondo + hasta 8 marcas de sector alrededor del centro; se "encienden" (tier) = cobertura angular sostenida, procedural
    ctx.beginPath(); ctx.arc(cx,cy,sw*0.44,0,6.28);
    ctx.fillStyle=here?"rgba(40,90,110,0.5)":"rgba(74,84,100,0.5)"; ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.78)"; ctx.stroke();
    const lit=here?Math.min(8,2+tier*2):0;                                // nº de marcas de sector "encendidas" (T1⇒4, T2⇒6, T3⇒8 = anillo completo)
    ctx.lineWidth=1.6; ctx.lineCap="round";
    for(let si=0;si<8;si++){ const on=si<lit; const ang=(si/8)*6.283-1.5708;   // 8 rumbos del compás
      const ix=cx+Math.cos(ang)*R*0.55, iy=cy+Math.sin(ang)*R*0.55, ox=cx+Math.cos(ang)*R, oy=cy+Math.sin(ang)*R;
      ctx.strokeStyle=on?glyph:"rgba(120,150,160,0.30)";
      ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ox,oy); ctx.stroke(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Cordón: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c6ecf0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + ward (cordón sostenido)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+ward):(w.wardable?(ward+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2361: badge de CAMARADERÍA (KINSHIP_BOND). Refleja el VM PURO (sim.kinshipVM, autoridad en sim) ⇒ MISMO kinship/tier para todos los clientes con el mismo snapshot. Glifo procedural
  // ⚭ = vínculo pareado; dos nodos unidos por un lazo cuyo brillo sube con el tier (pares próximos sostenidos). Reusa la fila de badges de recuperación ($0-arte). Cosmético puro.
  function renderKinshipBadge(){
    const k=sim.kinshipVM&&sim.kinshipVM(); if(!k) return;                 // pre-primer-tick (G.kinship null) ⇒ kinship 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+384, sw=14, sh=14;                             // bajo el Cordón (@+362); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, kin=Math.round(k.kinship||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#e6c67a":"#8a9bb0";                                 // vínculo=oro-camaradería (canal goldFind), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2, r=sw*0.20, off=sw*0.24;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⚭ dos nodos unidos por un lazo: el brillo del lazo sube con el tier (T1 tenue → T3 pleno) = vínculo sostenido, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.strokeStyle=here?glyph:"rgba(120,150,160,0.30)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath(); ctx.moveTo(cx-off,cy); ctx.lineTo(cx+off,cy); ctx.stroke();   // el lazo
    ctx.globalAlpha=pulse;
    ctx.fillStyle=here?"rgba(120,92,30,0.55)":"rgba(74,84,100,0.5)";
    ctx.beginPath(); ctx.arc(cx-off,cy,r,0,6.28); ctx.fill();                       // nodo izq
    ctx.beginPath(); ctx.arc(cx+off,cy,r,0,6.28); ctx.fill();                       // nodo der
    ctx.lineWidth=1.4; ctx.strokeStyle=here?glyph:"rgba(120,150,160,0.45)";
    ctx.beginPath(); ctx.arc(cx-off,cy,r,0,6.28); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx+off,cy,r,0,6.28); ctx.stroke();
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Camaradería: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f0dca6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + kinship (vínculo sostenido)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+kin):(k.bondable?(kin+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2369: badge de TROTAMUNDOS (WAYFARER_ROAM). Refleja el VM PURO (sim.wayRoamVM, autoridad en sim) ⇒ MISMO breadth/tier para todos los clientes con el mismo snapshot. Glifo procedural
  // ⇈ (rumbo/brújula abierta): dos flechas ascendentes cuyo brillo sube con el tier. Cosmético puro (0 sim/RNG). $0 arte (reusa la fila de badges de recuperación).
  function renderWayRoamBadge(){
    const k=sim.wayRoamVM&&sim.wayRoamVM(); if(!k) return;                 // pre-primer-tick (G.wayRoam null) ⇒ breadth 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+406, sw=14, sh=14;                             // bajo la Camaradería (@+384); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, br=k.breadth|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#8fe0c0":"#8a9bb0";                                 // rumbo=verde-viajero (canal oocMitigation), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2, off=sw*0.22;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⇈ dos flechas ascendentes (rumbo cubierto): el brillo sube con el tier (T1 tenue → T3 pleno) = amplitud recorrida, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle=here?glyph:"rgba(120,150,160,0.35)"; ctx.globalAlpha=pulse*litA;
    for(const ax of [cx-off, cx+off]){
      ctx.beginPath(); ctx.moveTo(ax, cy+sh*0.28); ctx.lineTo(ax, cy-sh*0.30); ctx.stroke();          // asta
      ctx.beginPath(); ctx.moveTo(ax-off*0.7, cy-sh*0.06); ctx.lineTo(ax, cy-sh*0.30); ctx.lineTo(ax+off*0.7, cy-sh*0.06); ctx.stroke();   // punta
    }
    ctx.globalAlpha=pulse;
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Trotamundos: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8f0e0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + breadth (celdas distintas)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+br):(k.roamable?(br+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2370: badge de FUEGO CONCENTRADO (FOCUS_FIRE). Refleja el VM PURO (sim.focusVM, autoridad en sim) ⇒ MISMO focus/tier para todos los clientes con el mismo snapshot. Glifo procedural
  // ⊙ = retícula/objetivo concentrado; una diana cuyo brillo sube con el tier (atacantes distintos sobre un mismo objetivo, sostenido). Reusa la fila de badges de recuperación ($0-arte). Cosmético puro.
  function renderFocusBadge(){
    const k=sim.focusVM&&sim.focusVM(); if(!k) return;                     // pre-primer-tick (G.focus null) ⇒ focus 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+428, sw=14, sh=14;                             // bajo el Trotamundos (@+406); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, fv=Math.round(k.focus||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#e6a86a":"#8a9bb0";                                 // fuego concentrado=ámbar-brasa (canal goldFind), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2, rOut=sw*0.34, rIn=sw*0.13;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⊙ diana: anillo exterior + punto central; el brillo sube con el tier (T1 tenue → T3 pleno) = concentración sostenida, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.6; ctx.strokeStyle=here?glyph:"rgba(120,150,160,0.42)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath(); ctx.arc(cx,cy,rOut,0,6.28); ctx.stroke();                       // anillo de la retícula
    // marcas de cruz de la retícula (4 tics cortos)
    ctx.beginPath(); ctx.moveTo(cx-rOut-1.5,cy); ctx.lineTo(cx-rOut+2.5,cy); ctx.moveTo(cx+rOut-2.5,cy); ctx.lineTo(cx+rOut+1.5,cy);
    ctx.moveTo(cx,cy-rOut-1.5); ctx.lineTo(cx,cy-rOut+2.5); ctx.moveTo(cx,cy+rOut-2.5); ctx.lineTo(cx,cy+rOut+1.5); ctx.stroke();
    ctx.globalAlpha=pulse;
    ctx.fillStyle=here?glyph:"rgba(74,84,100,0.55)";
    ctx.beginPath(); ctx.arc(cx,cy,rIn,0,6.28); ctx.fill();                           // punto central (el objetivo)
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Fuego Conc.: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f0cfa0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + focus (concentración sostenida)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" "+fv):(k.focusable?(fv+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=glyph; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }
  // CAS-2377: badge de SENDERO (TRAILCRAFT). Refleja el VM PURO (sim.trailcraftVM, autoridad en sim) ⇒ MISMO craft/tier/pasos para todos los clientes con el mismo snapshot. Glifo procedural
  // ⟿ (sendero serpenteante) — el brillo sube con el tier. Muestra el estado del canal FRESCO lootQuality (calidad/rareza del drop) — cosmético puro, 0 sim/RNG.
  function renderTrailcraftBadge(){
    const k=sim.trailcraftVM&&sim.trailcraftVM(); if(!k) return;           // pre-primer-tick (G.trail null) ⇒ craft 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+450, sw=14, sh=14;                             // bajo el Fuego Concentrado (@+428); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, cv=Math.round(k.craft||0), steps=k.steps|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#9ad06a":"#8a9bb0";                                 // sendero=verde-musgo (canal lootQuality), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⟿ sendero serpenteante: una polilínea ondulada de izquierda a derecha; el brillo sube con el tier (T1 tenue → T3 pleno) = variedad de terreno sostenida, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle=here?glyph:"rgba(120,150,160,0.42)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath();
    const x0=cx-sw*0.34, x1=cx+sw*0.34, amp=sh*0.22;
    ctx.moveTo(x0, cy+amp);
    ctx.quadraticCurveTo(cx-sw*0.17, cy-amp*1.6, cx, cy);                 // primer arco (subida)
    ctx.quadraticCurveTo(cx+sw*0.17, cy+amp*1.6, x1, cy-amp);            // segundo arco (bajada) — la serpentina
    ctx.stroke();
    // 3 hitos del sendero (tipos de bioma distintos): puntos a lo largo de la polilínea; encendidos = pasos de piso de rareza activos
    ctx.globalAlpha=pulse;
    const marks=[[x0,cy+amp],[cx,cy],[x1,cy-amp]];
    for(let i=0;i<marks.length;i++){ const lit=here && i<=tier; ctx.fillStyle=lit?glyph:"rgba(74,84,100,0.5)";
      ctx.beginPath(); ctx.arc(marks[i][0],marks[i][1],1.5,0,6.28); ctx.fill(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Sendero: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8e8a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + craft (+ pasos de piso de rareza)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+steps):(k.craftable?(cv+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }
  // CAS-2380: badge de DESCENSO (DELVE). Refleja el VM PURO (sim.delveVM, autoridad en sim) ⇒ MISMO delve/bands/tier/crit para todos los clientes con el mismo snapshot. Glifo procedural ⏷ (escalera
  // descendente) — el brillo sube con el tier. Muestra el estado del canal FRESCO critChance (precisión ofensiva) — cosmético puro, 0 sim/RNG. Distinto y único (no colisiona con "Sendero"/"Sendero Trillado").
  function renderDelveBadge(){
    const k=sim.delveVM&&sim.delveVM(); if(!k) return;                     // pre-primer-tick (G.delve null) ⇒ delve 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+472, sw=14, sh=14;                             // bajo el Sendero (@+450); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, bands=k.bands|0, critPct=k.critPct|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#7ac0e0":"#8a9bb0";                                 // descenso=azul-abismal (canal critChance/precisión), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⏷ escalera descendente: 3 peldaños que bajan de izq a der; el brillo sube con el tier (T1 tenue → T3 pleno) = nº de bandas de profundidad alcanzadas, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle=here?glyph:"rgba(120,150,170,0.42)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath();
    const x0=cx-sw*0.36, xw=sw*0.72/3, yTop=cy-sh*0.30, yStep=sh*0.24;
    ctx.moveTo(x0, yTop);
    for(let i=0;i<3;i++){ const xa=x0+i*xw, ya=yTop+i*yStep; ctx.lineTo(xa+xw, ya); ctx.lineTo(xa+xw, ya+yStep); }   // peldaños que DESCIENDEN
    ctx.stroke();
    // 3 hitos de banda (bandas de profundidad distintas): puntos en cada peldaño; encendidos = tier vigente
    ctx.globalAlpha=pulse;
    const marks=[[x0+xw,yTop+yStep],[x0+2*xw,yTop+2*yStep],[x0+3*xw,yTop+3*yStep]];
    for(let i=0;i<marks.length;i++){ const lit=here && i<tier; ctx.fillStyle=lit?glyph:"rgba(74,84,100,0.5)";
      ctx.beginPath(); ctx.arc(marks[i][0],marks[i][1],1.5,0,6.28); ctx.fill(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Descenso: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#bfe4f4":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + bandas (+ bono de crit%)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+critPct+"%"):(k.delvable?(bands+"b"):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2381: badge de ERUDICIÓN (ERUDITION). Refleja el VM PURO (sim.eruditionVM, autoridad en sim) ⇒ MISMO erudition/tier/boost para todos los clientes con el mismo snapshot. Glifo procedural ✎ (pluma del
  // erudito sobre un tomo) — el brillo sube con el tier. Muestra el estado del canal REUSADO xpGain (multiplicador de XP tras de-stack con Hermandad) — cosmético puro, 0 sim/RNG. Label "Erudito:" (con colon) ÚNICO
  // (la mejora meta t2_xpGain se llama "Erudición" sin colon; no colisiona — mirror del fix "Sendero:" vs "Sendero Trillado").
  function renderEruditionBadge(){
    const k=sim.eruditionVM&&sim.eruditionVM(); if(!k) return;             // pre-primer-tick (G.lore null) ⇒ lore 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+494, sw=14, sh=14;                             // bajo el Descenso (@+472); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, lv=Math.round(k.lore||0), boostPct=Math.round((k.boost||0)*100);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#d0b46a":"#8a9bb0";                                 // erudición=dorado-pergamino (canal xpGain/saber), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ✎ tomo abierto + pluma: dos hojas en V + un trazo de pluma diagonal; el brillo sube con el tier (T1 tenue → T3 pleno) = variedad de presas catalogadas, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    ctx.lineWidth=1.6; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle=here?glyph:"rgba(150,140,110,0.42)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath();
    const bw=sw*0.34, bh=sh*0.24, spine=cx;
    ctx.moveTo(spine-bw, cy-bh*0.4); ctx.lineTo(spine, cy-bh);            // hoja izquierda (borde superior)
    ctx.lineTo(spine, cy+bh); ctx.lineTo(spine-bw, cy+bh*0.4);           // ...cierra izquierda
    ctx.moveTo(spine+bw, cy-bh*0.4); ctx.lineTo(spine, cy-bh);           // hoja derecha
    ctx.lineTo(spine, cy+bh); ctx.lineTo(spine+bw, cy+bh*0.4);           // ...cierra derecha
    ctx.stroke();
    // trazo de pluma diagonal sobre el tomo (el acto de escribir/catalogar)
    ctx.beginPath(); ctx.moveTo(spine+bw*0.5, cy-bh*1.3); ctx.lineTo(spine-bw*0.3, cy+bh*0.9); ctx.stroke();
    // 3 hitos de saber (tipos de presa distintos): puntos a lo largo del lomo; encendidos = tier vigente
    ctx.globalAlpha=pulse;
    const marks=[[spine,cy-bh],[spine,cy],[spine,cy+bh]];
    for(let i=0;i<marks.length;i++){ const lit=here && i<tier; ctx.fillStyle=lit?glyph:"rgba(84,78,60,0.5)";
      ctx.beginPath(); ctx.arc(marks[i][0],marks[i][1],1.4,0,6.28); ctx.fill(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Erudito: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#eadfb8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + bono de XP%
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+boostPct+"%"):(k.learnable?(lv+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2393: badge de CAZA NOCTURNA (NOCTURNE_HUNT). Refleja el VM PURO (sim.nocturneVM, autoridad en sim) ⇒ MISMO nocturne/tier/boost para todos los clientes con el mismo snapshot. Glifo procedural ☾ (luna
  // creciente) — el brillo sube con el tier. Muestra el estado del canal REUSADO `vamp` (robo de vida / lifesteal, share-cap con el Vampírico) — cosmético puro, 0 sim/RNG. Label "Nocturno:" (con colon) ÚNICO (no colisiona).
  function renderNocturneBadge(){
    const k=sim.nocturneVM&&sim.nocturneVM(); if(!k) return;               // pre-primer-tick (G.nocturne null) ⇒ noct 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+516, sw=14, sh=14;                             // bajo la Erudición (@+494); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, lv=Math.round(k.noct||0), boostPct=Math.round((k.boost||0)*100);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.6+tier*0.5))):0.55;
    const glyph=here?"#a9c0e6":"#8a9bb0";                                 // caza nocturna=azul-luna, inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ☾ luna creciente: un arco exterior + un arco interior desfasado que talla la creciente; el brillo sube con el tier, procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    const R=sh*0.42;
    ctx.lineWidth=1.8; ctx.lineCap="round"; ctx.strokeStyle=here?glyph:"rgba(150,164,190,0.42)"; ctx.globalAlpha=pulse*litA;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI*0.32, Math.PI*1.68); ctx.stroke();          // arco exterior de la luna (creciente izquierda)
    ctx.beginPath(); ctx.arc(cx+R*0.55, cy, R*0.92, Math.PI*0.55, Math.PI*1.45, true); ctx.stroke();  // arco interior que talla la creciente
    // 3 estrellas (hitos de caza nocturna): puntos junto a la luna; encendidos = tier vigente
    ctx.globalAlpha=pulse;
    const stars=[[cx+R*1.15,cy-R*0.7],[cx+R*1.35,cy+R*0.1],[cx+R*1.05,cy+R*0.85]];
    for(let i=0;i<stars.length;i++){ const lit=here && i<tier; ctx.fillStyle=lit?glyph:"rgba(80,92,120,0.5)";
      ctx.beginPath(); ctx.arc(stars[i][0],stars[i][1],1.3,0,6.28); ctx.fill(); }
    // micro-label
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Nocturno: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cfe0f5":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + robo de vida% (lifesteal añadida, sobre el share-cap)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+boostPct+"%"):(k.huntable?(lv+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2400: badge de CADENCIA / ÍMPETU DE COMBATE (CADENCE_RUSH). Refleja el VM PURO (sim.cadenceVM, autoridad en sim) ⇒ MISMO cad/tier/crit para todos los clientes con el mismo snapshot. Glifo procedural ⏩ (doble
  // chevrón/avance rápido = tempo) — el brillo sube con el tier. Muestra el estado del canal REUSADO critChance (bono de crítico del tier, share-cap con Delve) — cosmético puro, 0 sim/RNG. Label "Cadencia:" (con colon) ÚNICO.
  function renderCadenceBadge(){
    const k=sim.cadenceVM&&sim.cadenceVM(); if(!k) return;                 // pre-primer-tick (G.cadence null) ⇒ cad 0 ⇒ tier 0
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+538, sw=14, sh=14;                             // bajo el Nocturno (@+516); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, lv=Math.round(k.cad||0), critPct=Math.round(k.critPct||0);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(3.0+tier*0.6))):0.55;       // el pulso ACELERA con el tier (metáfora de tempo)
    const glyph=here?"#ffcf6e":"#8a9bb0";                                 // ímpetu=ámbar cálido (velocidad/crit), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⏩ doble chevrón hacia la derecha (avance rápido): galones "»"; el nº de galones ENCENDIDOS = tier (1/2/3), procedural
    const litA=here?Math.min(1,0.35+tier*0.22):0.22;
    const R=sh*0.40;
    ctx.lineWidth=1.9; ctx.lineCap="round"; ctx.lineJoin="round";
    const chev=[[cx-R*0.9,cy],[cx-R*0.05,cy],[cx+R*0.8,cy]];              // 3 posiciones-x base de galones
    for(let i=0;i<3;i++){ const lit=here && i<tier; ctx.strokeStyle=lit?glyph:"rgba(150,164,190,0.42)"; ctx.globalAlpha=pulse*(lit?1:litA*0.7);
      const gx=chev[i][0], gy=chev[i][1];
      ctx.beginPath(); ctx.moveTo(gx-R*0.42, gy-R*0.62); ctx.lineTo(gx+R*0.30, gy); ctx.lineTo(gx-R*0.42, gy+R*0.62); ctx.stroke(); }  // ">" galón
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Cadencia: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe6b0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + crit% (bono de crítico del tier, sobre el share-cap con Delve)
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+critPct+"%"):(k.rushable?(lv+""):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }
  // CAS-2404: badge de VENDAVAL / TEMPESTAD (TEMPEST_SURGE). Refleja el VM PURO (sim.tempestVM, autoridad en sim) ⇒ MISMA intensidad/tier/pasos para todos los clientes con el mismo reloj compartido. Glifo procedural ⛈
  // (nube de tormenta con rayo) — el brillo sube con la intensidad de tormenta. Muestra el estado del canal REUSADO lootQuality (rareza del drop, share-cap con Trailcraft) — cosmético puro, 0 sim/RNG. Label "Tempestad:" ÚNICO.
  function renderTempestBadge(){
    const k=sim.tempestVM&&sim.tempestVM(); if(!k) return;                 // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+560, sw=14, sh=14;                             // bajo la Cadencia (@+538); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, inten=Math.round((k.intensity||0)*100), steps=k.steps|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.4+tier*0.5))):0.55;
    const glyph=here?"#8fd0ff":"#8a9bb0";                                 // tormenta=azul-cielo eléctrico (canal lootQuality/rareza bajo lluvia), inerte=gris
    const zn=k.zone?STR.zoneName(k.zone):"—";
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⛈ nube de tormenta: un arco de nube (3 lóbulos) + un rayo en zig-zag debajo; el brillo del rayo sube con el tier
    const litA=here?Math.min(1,0.35+tier*0.28):0.22;
    ctx.globalAlpha=pulse*(here?0.9:litA);
    ctx.fillStyle=here?"rgba(120,150,180,0.9)":"rgba(120,140,160,0.4)";
    const cyC=cy-sh*0.16, r=sh*0.20;                                      // 3 lóbulos de nube
    ctx.beginPath(); ctx.arc(cx-r*1.1,cyC,r,0,6.28); ctx.arc(cx,cyC-r*0.5,r*1.15,0,6.28); ctx.arc(cx+r*1.1,cyC,r,0,6.28); ctx.fill();
    // rayo en zig-zag (destaca con el tier)
    ctx.globalAlpha=pulse*litA;
    ctx.strokeStyle=here?glyph:"rgba(150,164,190,0.42)"; ctx.lineWidth=1.7; ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.beginPath(); ctx.moveTo(cx-sw*0.06, cyC+r); ctx.lineTo(cx-sw*0.16, cy+sh*0.28); ctx.lineTo(cx+sw*0.02, cy+sh*0.18); ctx.lineTo(cx-sw*0.08, cy+sh*0.46); ctx.stroke();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Tempestad: "+zn;
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c6e6ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha (dentro de [bx, bx+104]): tier + pasos de piso de rareza; si no abre, la intensidad de tormenta o "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+steps):(k.exposed&&k.storming?(inten+"%"):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2409: badge de ÚLTIMA RESISTENCIA / AGUANTE (LAST_STAND). Refleja el VM PURO (sim.lastStandVM, autoridad en sim) ⇒ MISMO conteo/tier/boost para todos los clientes con el mismo estado de sim.
  // Glifo procedural ⚔ (aspas cruzadas = superado en número) — el brillo sube con el tier. Muestra el estado del canal REUSADO wardRegen (boost de regen del tier, share-cap con Warding Ring) — cosmético puro, 0 sim/RNG. Label "Resistencia:" ÚNICO.
  function renderLastStandBadge(){
    const k=sim.lastStandVM&&sim.lastStandVM(); if(!k) return;             // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+582, sw=14, sh=14;                             // bajo la Tempestad (@+560); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, count=k.count|0, boostPct=Math.round((k.combinedBoost||0)*100);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.4+tier*0.5))):0.55;
    const glyph=here?"#ffcf8f":"#8a9bb0";                                 // superado=ámbar cálido (atrincherarse/aguantar), inerte=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⚔ dos aspas cruzadas (X); el brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.8; ctx.lineCap="round";
    const r=sh*0.32;
    ctx.beginPath(); ctx.moveTo(cx-r,cy-r); ctx.lineTo(cx+r,cy+r); ctx.moveTo(cx+r,cy-r); ctx.lineTo(cx-r,cy+r); ctx.stroke();
    // pomos de las aspas (2 puntos) — destacan con el tier
    ctx.globalAlpha=pulse*litA; ctx.fillStyle=here?glyph:"rgba(150,160,176,0.4)";
    ctx.beginPath(); ctx.arc(cx-r,cy+r,1.4,0,6.28); ctx.arc(cx+r,cy+r,1.4,0,6.28); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Resistencia: "+(here?("×"+count):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe0b0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: tier + boost de regen efectivo (share-capped); si no abre, el conteo o "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("T"+tier+" +"+boostPct+"%"):(count>0?("×"+count):"—");
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2415: badge de TERRENO FIRME / PISADA FIRME (FIRM_FOOTING). Refleja el VM PURO (sim.firmFootingVM, autoridad en sim) ⇒ MISMO material/tier/bono para todos los clientes con el mismo estado de sim.
  // Glifo procedural ⛰ (montaña/terreno elevado firme) — el brillo sube con el tier. Muestra el estado del canal FRESCO atkspd (bono del tier + atkspd total capada, share-cap global) — cosmético puro, 0 sim/RNG. Label "Terreno:" ÚNICO.
  function renderFirmFootingBadge(){
    const k=sim.firmFootingVM&&sim.firmFootingVM(); if(!k) return;        // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+604, sw=14, sh=14;                            // bajo la Resistencia (@+582); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, bonus=k.bonus|0;
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.2+tier*0.5))):0.55;
    const glyph=here?"#bfe6a8":"#8a9bb0";                                // firme=verde tierra (pie plantado), inerte=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⛰ montaña/pico (triángulo de terreno firme); el brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.8; ctx.lineJoin="round"; ctx.lineCap="round";
    const r=sh*0.34, baseY=cy+r*0.85;
    ctx.beginPath(); ctx.moveTo(cx-r,baseY); ctx.lineTo(cx,cy-r); ctx.lineTo(cx+r,baseY); ctx.stroke();
    // base/suelo (línea horizontal) — destaca con el tier
    ctx.globalAlpha=pulse*litA; ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.4)";
    ctx.beginPath(); ctx.moveTo(cx-r*1.15,baseY); ctx.lineTo(cx+r*1.15,baseY); ctx.stroke();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Terreno: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#d4f0be":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: bono de atkspd del tier; si no abre, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("+"+bonus+" vel"):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }

  // CAS-2426: badge de ACECHO / SIGILO (SHADOW_STALK). Refleja el VM PURO (sim.shadowStalkVM, autoridad en sim) ⇒ MISMO tier/mit para todos los clientes con el mismo estado de sim.
  // Glifo procedural 🌒 (luna en sombra / ocultamiento) — el brillo sube con el tier de cobertura. Muestra el canal FRESCO detectRadius (reducción del radio de detección del cazador más cercano) — cosmético puro, 0 sim/RNG. Label "Sigilo:" ÚNICO.
  function renderShadowStalkBadge(){
    const k=sim.shadowStalkVM&&sim.shadowStalkVM(); if(!k) return;         // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+626, sw=14, sh=14;                             // bajo el Terreno (@+604); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, pct=Math.round((k.mit||0)*100);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#a9b8ff":"#8a9bb0";                                 // oculto=índigo/sombra, a la vista=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // 🌒 disco lunar con mordida de sombra (creciente); el brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24;
    const r=sh*0.36;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,r,0,6.283); ctx.stroke();             // disco
    ctx.globalAlpha=pulse*litA;                                          // mordida de sombra (creciente) — arco interno desplazado
    ctx.beginPath(); ctx.arc(cx+r*0.42,cy,r*0.92,0,6.283); ctx.stroke();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Sigilo: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8d2ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: % de reducción del radio de detección; si no abre, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("-"+pct+"% det"):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+104,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+104,ty);
    ctx.restore();
  }
  // CAS-2432: badge de PRESIÓN POR ESCASEZ (SCARCITY_EDGE). Refleja el VM PURO (sim.scarcityVM, autoridad en sim) ⇒ MISMA depletion/tier/mul para todos los clientes con el mismo estado de sim.
  // Glifo procedural ⧗ (reloj de arena / recursos agotándose) — el brillo sube con el tier de agotamiento. Muestra el canal FRESCO essenceFind (bono de forrajeo de esencia) — cosmético puro, 0 sim/RNG. Label "Escasez:" ÚNICO.
  function renderScarcityBadge(){
    const k=sim.scarcityVM&&sim.scarcityVM(); if(!k) return;               // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+648, sw=14, sh=14;                             // bajo el Sigilo (@+626); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, pct=Math.round((k.mul||0)*100), dep=Math.round((k.depletion||0)*100);
    const pulse=here?(0.74+0.20*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#8fe0ff":"#8a9bb0";                                 // agotada=cian esencia, rica=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⧗ reloj de arena: dos triángulos apex-a-apex; el brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.34;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx-r,cy-r); ctx.lineTo(cx+r,cy-r); ctx.lineTo(cx,cy); ctx.lineTo(cx-r,cy+r); ctx.lineTo(cx+r,cy+r); ctx.lineTo(cx,cy); ctx.closePath(); ctx.stroke();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Escasez: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c6f0ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: % de forrajeo (mul) sobre el xp del mob + % de agotamiento de la zona; si zona rica, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("+"+pct+"% ess "+dep+"%"):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+120,ty);
    ctx.restore();
  }
  // CAS-2439: badge de PROXIMIDAD A AMENAZA APEX (APEX_PROXIMITY). Refleja el VM PURO (sim.apexVM, autoridad en sim) ⇒ MISMA dist/tier/mats para todos los clientes con el mismo estado de sim.
  // Glifo procedural ▲ (pico/depredador apex acechando) — el brillo sube con el tier de proximidad. Muestra el canal FRESCO matFind (bono de mena de forrajeo) — cosmético puro, 0 sim/RNG. Label "Apex:" ÚNICO.
  function renderApexBadge(){
    const k=sim.apexVM&&sim.apexVM(); if(!k) return;                     // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+670, sw=14, sh=14;                            // bajo la Escasez (@+648); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, mats=k.mats|0, dist=(k.dist>=0?Math.round(k.dist):-1);
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#ff8f6a":"#8a9bb0";                                // apex cerca=rojo-peligro, lejos/sin apex=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ▲ pico/apex: un triángulo apuntando arriba; el brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.36;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r,cy+r); ctx.lineTo(cx-r,cy+r); ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.3+tier*0.35); ctx.fillStyle=glyph; ctx.fill(); }   // relleno crece con el tier (más cerca = más lleno)
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Apex: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffcdbb":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +mena de forrajeo por kill + distancia al apex; si sin apex, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("+"+mats+" mena "+dist+"px"):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+120,ty);
    ctx.restore();
  }

  // CAS-2445: badge de PELIGRO POR AFIJO DE MOB (MOB_AFFIX_DANGER). Refleja el VM PURO (sim.affixDangerVM, autoridad en sim) ⇒ MISMO score/tier/flasks para todos los clientes con el mismo estado de sim.
  function renderAffixDangerBadge(){
    const k=sim.affixDangerVM&&sim.affixDangerVM(); if(!k) return;         // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+692, sw=14, sh=14;                             // bajo la Proximidad Apex (@+670); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, flasks=k.flasks|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#c78bff":"#8a9bb0";                                 // peligro-de-afijo cerca=púrpura-encantado, sin afijos=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ❈ afijo/encantamiento: un rombo (cuadro rotado 45°) con brillo que sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.38;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r,cy); ctx.lineTo(cx,cy+r); ctx.lineTo(cx-r,cy); ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.3+tier*0.35); ctx.fillStyle=glyph; ctx.fill(); }   // relleno crece con el tier (más peligro = más lleno)
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Peligro: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e2ccff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +Estus de forrajeo por kill + score de afijos; si sin afijos, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st=here?("+"+flasks+" Estus s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st,bx+120,ty);
    ctx.restore();
  }

  // CAS-2450: badge de PARTICIPACIÓN EN EVENTO DE ZONA (ZONE_EVENT_SURGE). Refleja el VM PURO (sim.zoneEventVM, autoridad en sim) ⇒ MISMO score/tier/gems para todos los clientes con el mismo estado de sim.
  function renderZoneEventBadge(){
    const k=sim.zoneEventVM&&sim.zoneEventVM(); if(!k) return;             // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+714, sw=14, sh=14;                             // bajo el Peligro por Afijo (@+692); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, gems=k.gems|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#b79cff":"#8a9bb0";                                 // evento activo cerca=violeta-gema, sin evento=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ◈ evento/gema: un rombo con nodo central (nodo de evento) cuyo brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.4;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r,cy); ctx.lineTo(cx,cy+r); ctx.lineTo(cx-r,cy); ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;   // nodo central: círculo que crece con el tier (más eventos = más lleno)
      ctx.beginPath(); ctx.arc(cx,cy,Math.max(1.4,r*(0.32+tier*0.12)),0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Evento: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ddccff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +gemas de forrajeo por kill + score de eventos; si sin evento, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+gems+" Gema s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2456: badge de VARIANTE DE ENCUENTRO ACTIVA (ENCOUNTER_VARIANT_SURGE). Refleja el VM PURO (sim.variantSurgeVM, autoridad en sim) ⇒ MISMO score/tier/sockets para todos los clientes con el mismo estado de sim.
  function renderVariantSurgeBadge(){
    const k=sim.variantSurgeVM&&sim.variantSurgeVM(); if(!k) return;        // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+736, sw=14, sh=14;                             // bajo la Participación en Evento (@+714); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, sockets=k.sockets|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#7fe0c0":"#8a9bb0";                                 // variante activa cerca=verde-jade (engarce), sin variante=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ❖ variante/mutación: un rombo con un rombo interior (patrón anidado del encuentro) cuyo brillo sube con el tier
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.4;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r,cy); ctx.lineTo(cx,cy+r); ctx.lineTo(cx-r,cy); ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.strokeStyle=glyph; ctx.lineWidth=1.2;   // rombo interior: crece con el tier (más variantes = patrón más marcado)
      const ir=r*(0.34+tier*0.16); ctx.beginPath(); ctx.moveTo(cx,cy-ir); ctx.lineTo(cx+ir,cy); ctx.lineTo(cx,cy+ir); ctx.lineTo(cx-ir,cy); ctx.closePath(); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Variante: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8f4e6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +reagentes de forrajeo por kill + score de variantes; si sin variante, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+sockets+" Eng s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2464: badge de HAZARD DE ARENA ACTIVO (ARENA_HAZARD_SURGE). Refleja el VM PURO (sim.hazardSurgeVM, autoridad en sim) ⇒ MISMO score/tier/motes para todos los clientes con el mismo estado de sim.
  function renderHazardSurgeBadge(){
    const k=sim.hazardSurgeVM&&sim.hazardSurgeVM(); if(!k) return;         // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+758, sw=14, sh=14;                            // bajo la Variante de Encuentro (@+736); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, motes=k.motes|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#ff9a5a":"#8a9bb0";                                // hazard activo cerca=ámbar-brasa (peligro/calor), sin hazard=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ▲ hazard: un triángulo de aviso cuyo brillo/relleno sube con el tier (más/más-intensos hazards = triángulo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.44;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(cx,cy-r); ctx.lineTo(cx+r*0.92,cy+r*0.72); ctx.lineTo(cx-r*0.92,cy+r*0.72); ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;   // punto interior de aviso: crece con el tier
      const ir=r*(0.22+tier*0.1); ctx.beginPath(); ctx.arc(cx,cy+r*0.18,ir,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Hazard: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffc9a0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +brasas de forrajeo por kill + score de hazards; si sin hazard, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+motes+" Bra s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2468: badge de FASE DE ENFURECIMIENTO DE JEFE (BOSS_ENRAGE_SURGE). Refleja el VM PURO (sim.enrageSurgeVM, autoridad en sim) ⇒ MISMO score/tier/trofeos para todos los clientes con el mismo estado de sim.
  function renderEnrageSurgeBadge(){
    const k=sim.enrageSurgeVM&&sim.enrageSurgeVM(); if(!k) return;         // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+780, sw=14, sh=14;                            // bajo el Hazard de Arena (@+758); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, trophies=k.trophies|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#ffd34d":"#8a9bb0";                                // jefe enfurecido cerca=oro-furia (rabia/trofeo), sin furia=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ✦ furia: una estrella de 4 puntas cuyo brillo/tamaño sube con el tier (más/mayor-clase de furia = estrella más marcada)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const ir=r*(here?(0.30+tier*0.06):0.34);
    ctx.beginPath();
    for(let i=0;i<8;i++){ const ang=-Math.PI/2+i*Math.PI/4, rad=(i%2===0)?r:ir; const px=cx+Math.cos(ang)*rad, py=cy+Math.sin(ang)*rad; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
    ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;   // núcleo de furia: crece con el tier
      const cr=ir*(0.5+tier*0.14); ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Furia: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe9a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +trofeos de forrajeo por kill + score de furia; si sin furia, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+trophies+" Tro s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2477: badge de CAMPO DE BOTÍN DENSO (SPOILS_FIELD_SURGE). Refleja el VM PURO (sim.spoilsFieldVM, autoridad en sim) ⇒ MISMO score/tier/chatarra para todos los clientes con el mismo estado de sim.
  function renderSpoilsFieldBadge(){
    const k=sim.spoilsFieldVM&&sim.spoilsFieldVM(); if(!k) return;         // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+802, sw=14, sh=14;                            // bajo la Fase de Enfurecimiento (@+780); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, salvage=k.salvage|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#c9d67a":"#8a9bb0";                                // botín cerca=verde-chatarra (despojos/salvage), suelo limpio=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ◆ botín: un rombo cuyo brillo/tamaño sube con el tier (más/mayor-valor de despojos = rombo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    ctx.beginPath();
    ctx.moveTo(cx,cy-rr); ctx.lineTo(cx+rr*0.72,cy); ctx.lineTo(cx,cy+rr); ctx.lineTo(cx-rr*0.72,cy);
    ctx.closePath(); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;   // núcleo de botín: crece con el tier
      const cr=rr*(0.32+tier*0.10); ctx.beginPath();
      ctx.moveTo(cx,cy-cr); ctx.lineTo(cx+cr*0.72,cy); ctx.lineTo(cx,cy+cr); ctx.lineTo(cx-cr*0.72,cy); ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Botín: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e6f0b0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +chatarra de forrajeo por kill + score de densidad; si suelo limpio, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+salvage+" Cha s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2481: badge de CAMPO DE CARNICERÍA (CARNAGE_FIELD_SURGE). Refleja el VM PURO (sim.carnageFieldVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim.
  function renderCarnageFieldBadge(){
    const k=sim.carnageFieldVM&&sim.carnageFieldVM(); if(!k) return;        // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+824, sw=14, sh=14;                            // bajo el Campo de Botín (@+802); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, bone=k.bone|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#d8cbb0":"#8a9bb0";                                // cadáveres cerca=hueso/marfil (osario), suelo sin bajas=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ☠ carnicería: un anillo cuyo brillo/tamaño sube con el tier (más/mayor-rango de bajas = anillo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;   // núcleo de osario: crece con el tier
      const cr=rr*(0.32+tier*0.10); ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Osario: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ece0c6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de forrajeo por kill + score de densidad; si suelo sin bajas, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+bone+" Osa s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2488: badge de FRAGOR DE FUEGO CRUZADO (CROSSFIRE_FRAY_SURGE). Refleja el VM PURO (sim.crossfireFrayVM, autoridad en sim) ⇒ MISMO score/tier/ascuas para todos los clientes con el mismo estado de sim.
  function renderCrossfireFrayBadge(){
    const k=sim.crossfireFrayVM&&sim.crossfireFrayVM(); if(!k) return;      // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+846, sw=14, sh=14;                            // bajo el Campo de Carnicería (@+824); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, ember=k.ember|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.8+tier*0.7))):0.55;
    const glyph=here?"#ffb066":"#8a9bb0";                                // fuego cruzado cerca=ascua/ámbar, sin fuego=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ✷ fragor: un anillo cuyo brillo/tamaño sube con el tier (más densidad/fuego entrante = anillo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    // núcleo + rayos cruzados (evoca proyectiles entrantes/salientes)
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.strokeStyle=glyph;
      for(let i=0;i<4;i++){ const ang=i*Math.PI/2+Math.PI/4; ctx.beginPath(); ctx.moveTo(cx+Math.cos(ang)*rr*0.4,cy+Math.sin(ang)*rr*0.4); ctx.lineTo(cx+Math.cos(ang)*rr*1.15,cy+Math.sin(ang)*rr*1.15); ctx.stroke(); }
      ctx.fillStyle=glyph; const cr=rr*(0.28+tier*0.08); ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Fragor: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffd9b0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +ascuas de forrajeo por kill + score de densidad; si sin fuego cruzado, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+ember+" Fra s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2493: badge de VORÁGINE DE ZONAS DE ÁREA (MAELSTROM_FIELD_SURGE). Refleja el VM PURO (sim.maelstromFieldVM, autoridad en sim) ⇒ MISMO score/tier/cargas para todos los clientes con el mismo estado de sim.
  function renderMaelstromFieldBadge(){
    const k=sim.maelstromFieldVM&&sim.maelstromFieldVM(); if(!k) return;    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+868, sw=14, sh=14;                            // bajo el Fragor de Fuego Cruzado (@+846); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#8fd0ff":"#8a9bb0";                                // vorágine cerca=azul-tormenta, sin vorágine=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⊛ vorágine: un anillo con radios en espiral cuyo brillo/tamaño sube con el tier (más densidad/mayor-tamaño de zonas = anillo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    // anillo + radios en aspa girada (evoca zonas de negación solapadas remolineando)
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.strokeStyle=glyph;
      const spin=G.t*0.9; for(let i=0;i<4;i++){ const ang=i*Math.PI/2+spin; ctx.beginPath(); ctx.moveTo(cx+Math.cos(ang)*rr*0.35,cy+Math.sin(ang)*rr*0.35); ctx.lineTo(cx+Math.cos(ang)*rr*1.1,cy+Math.sin(ang)*rr*1.1); ctx.stroke(); }
      ctx.fillStyle=glyph; const cr=rr*(0.26+tier*0.08); ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Vorágine: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8e8ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +cargas de forrajeo por kill + score de densidad; si sin vorágine, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Vor s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2497: badge de COSECHA DE PLAGA (BLIGHT_HARVEST_SURGE). Refleja el VM PURO (sim.blightHarvestVM, autoridad en sim) ⇒ MISMO score/tier/esencias para todos los clientes con el mismo estado de sim.
  function renderBlightHarvestBadge(){
    const k=sim.blightHarvestVM&&sim.blightHarvestVM(); if(!k) return;      // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+890, sw=14, sh=14;                            // bajo la Vorágine (@+868); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, harvest=k.harvest|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#9be04a":"#8a9bb0";                                // plaga cerca=verde-veneno, sin plaga=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ☣ plaga: un anillo de burbujas/esporas cuyo brillo/tamaño sube con el tier (más densidad/mayor-profundidad de aflicción = anillo más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    // anillo + 3 nódulos de espora (evoca aflicción supurante que se extiende sobre un pack)
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.35); ctx.fillStyle=glyph;
      const spin=G.t*0.7; for(let i=0;i<3;i++){ const ang=i*(Math.PI*2/3)+spin; const nx=cx+Math.cos(ang)*rr*0.62, ny=cy+Math.sin(ang)*rr*0.62; ctx.beginPath(); ctx.arc(nx,ny,rr*(0.2+tier*0.06),0,Math.PI*2); ctx.fill(); }
      ctx.globalAlpha=pulse*Math.min(1,0.4+tier*0.3); ctx.beginPath(); ctx.arc(cx,cy,rr*(0.22+tier*0.07),0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Plaga: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#d2f2a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +esencias de forrajeo por kill + score de densidad; si sin plaga, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+harvest+" Plg s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2504: badge de LÍNEA DE ESCARAMUZA (SKIRMISH_LINE_SURGE). Refleja el VM PURO (sim.skirmishLineVM, autoridad en sim) ⇒ MISMO score/tier/marcas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSkirmishLineBadge(){
    const k=sim.skirmishLineVM&&sim.skirmishLineVM(); if(!k) return;       // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+912, sw=14, sh=14;                            // bajo la Plaga (@+890); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, mark=k.mark|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#ffd24a":"#8a9bb0";                                // línea de fuego cerca=ámbar-saeta, sin línea=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ➶ escaramuza: un abanico de saetas convergentes cuyo brillo/tamaño sube con el tier (más densidad/mayor-alcance de la línea = abanico más marcado)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    // anillo + 3 saetas apuntando al centro (evoca una descarga entrante de arqueros que converge sobre el héroe)
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.4+tier*0.35); ctx.strokeStyle=glyph;
      const spin=G.t*0.6; for(let i=0;i<3;i++){ const ang=i*(Math.PI*2/3)+spin; const ox=Math.cos(ang), oy=Math.sin(ang);
        const hx=cx+ox*rr*1.15, hy=cy+oy*rr*1.15, tx0=cx+ox*rr*0.3, ty0=cy+oy*rr*0.3;
        ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(tx0,ty0); ctx.stroke();                                   // asta de la saeta
        const pa=ang+Math.PI, wr=rr*(0.26+tier*0.05);                                                            // punta de flecha en el centro
        ctx.beginPath(); ctx.moveTo(tx0,ty0); ctx.lineTo(tx0+Math.cos(pa+0.5)*wr,ty0+Math.sin(pa+0.5)*wr); ctx.moveTo(tx0,ty0); ctx.lineTo(tx0+Math.cos(pa-0.5)*wr,ty0+Math.sin(pa-0.5)*wr); ctx.stroke(); }
      ctx.fillStyle=glyph; const cr=rr*(0.18+tier*0.06); ctx.beginPath(); ctx.arc(cx,cy,cr,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Escaramuza: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe9a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +marcas de forrajeo por kill + score de densidad; si sin línea, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+mark+" Esc s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2510: badge de COSECHA DE SOMETIMIENTO (CONTROL_HARVEST_SURGE). Refleja el VM PURO (sim.controlHarvestVM, autoridad en sim) ⇒ MISMO score/tier/cargas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderControlHarvestBadge(){
    const k=sim.controlHarvestVM&&sim.controlHarvestVM(); if(!k) return;    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+934, sw=14, sh=14;                            // bajo la Escaramuza (@+912); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#7fd0ff":"#8a9bb0";                                // pack sometido cerca=cian-hielo, sin pack=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⊗ sometimiento: un anillo con abrazaderas que convergen al centro (evoca un cepo/jaula que clava al pack en el sitio); brillo/tamaño suben con el tier (más densidad/severidad del CC)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.6; ctx.lineJoin="round"; ctx.lineCap="round";
    const rr=r*(here?(0.92+tier*0.05):0.82);
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();          // anillo del cepo
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.4+tier*0.35); ctx.strokeStyle=glyph;
      for(let i=0;i<4;i++){ const ang=i*(Math.PI/2)+Math.PI/4; const ox=Math.cos(ang), oy=Math.sin(ang);   // 4 abrazaderas ortogonales apretando hacia el centro
        const hx=cx+ox*rr*1.12, hy=cy+oy*rr*1.12, tx0=cx+ox*rr*0.42, ty0=cy+oy*rr*0.42;
        ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(tx0,ty0); ctx.stroke(); }
      // aspa central (⊗) = clavado en el sitio
      const dr=rr*(0.5+tier*0.06); ctx.beginPath();
      ctx.moveTo(cx-dr,cy-dr); ctx.lineTo(cx+dr,cy+dr); ctx.moveTo(cx+dr,cy-dr); ctx.lineTo(cx-dr,cy+dr); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Sometimiento: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cfeaff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +cargas de forrajeo por kill + score de densidad; si sin pack, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Ctrl s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2516: badge de SIEGA DE HERIDOS (BLOODHARVEST_SURGE). Refleja el VM PURO (sim.bloodHarvestVM, autoridad en sim) ⇒ MISMO score/tier/cargas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderBloodHarvestBadge(){
    const k=sim.bloodHarvestVM&&sim.bloodHarvestVM(); if(!k) return;    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+956, sw=14, sh=14;                          // bajo la Sometimiento (@+934); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#ff6a6a":"#8a9bb0";                              // campo de heridos cerca=rojo-sangre, sin campo=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ☠ siega: una gota de sangre que gotea, con brillo/tamaño según el tier (más densidad/severidad de heridas)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    const rr=r*(here?(0.92+tier*0.05):0.82);
    // cuerpo de la gota (círculo inferior + punta superior)
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy+rr*0.28,rr*0.78,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx,cy-rr*1.05); ctx.lineTo(cx-rr*0.62,cy+rr*0.3); ctx.lineTo(cx+rr*0.62,cy+rr*0.3); ctx.closePath(); ctx.fill();
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.4+tier*0.35);        // reflejo/severidad: una tacha de tajo por el centro (más brillante con el tier)
      ctx.strokeStyle="#ffd0d0"; ctx.lineWidth=1.4; ctx.lineCap="round";
      const dr=rr*(0.4+tier*0.06); ctx.beginPath(); ctx.moveTo(cx-dr,cy+rr*0.1); ctx.lineTo(cx+dr,cy+rr*0.32); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Siega: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffd0d0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +cargas de forrajeo por kill + score de densidad; si sin campo, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Siega s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2521: badge de SIEGA DE MANADA (PACKHARVEST_SURGE). Refleja el VM PURO (sim.packHarvestVM, autoridad en sim) ⇒ MISMO score/tier/cargas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderPackHarvestBadge(){
    const k=sim.packHarvestVM&&sim.packHarvestVM(); if(!k) return;      // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+978, sw=14, sh=14;                          // bajo la Siega-de-heridos (@+956); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#e0a24a":"#8a9bb0";                              // manada apiñada cerca=ámbar-jauría, sin manada=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⧉ manada: un racimo de puntos apiñados, con brillo/tamaño según el tier (más apiñamiento = más puntos brillantes)
    const litA=here?Math.min(1,0.4+tier*0.3):0.24; const r=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:litA);
    const rr=r*(here?(0.9+tier*0.06):0.8);
    // 3 nodos del racimo (triángulo apiñado) — el nº "encendido" sube con el tier
    const nodes=[[cx,cy-rr*0.62],[cx-rr*0.66,cy+rr*0.5],[cx+rr*0.66,cy+rr*0.5]];
    const lit=here?Math.min(3,1+tier):1;
    for(let i=0;i<nodes.length;i++){ ctx.globalAlpha=pulse*(i<lit?(here?0.95:litA):0.3);
      ctx.fillStyle=(i<lit&&here)?glyph:"rgba(150,160,176,0.42)";
      ctx.beginPath(); ctx.arc(nodes[i][0],nodes[i][1],rr*0.42,0,Math.PI*2); ctx.fill(); }
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.35+tier*0.3);         // vínculos del racimo: aristas que unen los nodos (más brillantes con el tier)
      ctx.strokeStyle="#ffe0a8"; ctx.lineWidth=1.2; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(nodes[0][0],nodes[0][1]); ctx.lineTo(nodes[1][0],nodes[1][1]); ctx.lineTo(nodes[2][0],nodes[2][1]); ctx.closePath(); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Manada: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe0a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +cargas de forrajeo por kill + score de cohesión; si sin manada, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Manada s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2527: badge de REMATE A DISTANCIA (LONGSHOT_SURGE). Refleja el VM PURO (sim.longshotVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderLongshotBadge(){
    const k=sim.longshotVM&&sim.longshotVM(); if(!k) return;             // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1000, sw=14, sh=14;                          // bajo la Siega-de-manada (@+978); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.4+tier*0.6))):0.55;
    const glyph=here?"#7fd0ff":"#8a9bb0";                               // long-shot disponible=azul-hielo puntería, sin blanco=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⌖ retícula de puntería: cruz + anillo; el anillo se cierra (radio↓) y brilla con el tier (más lejos = tiro más "apuntado")
    const rOuter=sh*0.46, rr=rOuter*(here?(1.0-tier*0.10):1.0);
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=1.3; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();       // anillo de mira
    // cruz de la retícula (4 marcas radiales); el nº "encendido" sube con el tier
    const marks=[[0,-1],[0,1],[-1,0],[1,0]]; const lit=here?Math.min(4,2+tier):2;
    for(let i=0;i<marks.length;i++){ ctx.globalAlpha=pulse*(i<lit?(here?0.95:0.3):0.3);
      ctx.strokeStyle=(i<lit&&here)?"#ffffff":"rgba(150,160,176,0.5)";
      ctx.beginPath(); ctx.moveTo(cx+marks[i][0]*rr*0.55, cy+marks[i][1]*rr*0.55); ctx.lineTo(cx+marks[i][0]*rr*1.05, cy+marks[i][1]*rr*1.05); ctx.stroke(); }
    if(here){ ctx.globalAlpha=pulse*Math.min(1,0.4+tier*0.3);           // punto central (blanco fijado)
      ctx.fillStyle=glyph; ctx.beginPath(); ctx.arc(cx,cy,rr*0.2,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Remate: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cdeaff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de puntería por kill + score de alcance; si sin blanco, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Remate s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+120,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+120,ty);
    ctx.restore();
  }

  // CAS-2532: badge de REMATE DE INTERRUPCIÓN (INTERRUPT_SURGE). Refleja el VM PURO (sim.interruptVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderInterruptBadge(){
    const k=sim.interruptVM&&sim.interruptVM(); if(!k) return;           // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1022, sw=14, sh=14;                          // bajo el Remate-a-distancia (@+1000); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#c99bff":"#8a9bb0";                               // acción interrumpible=violeta denegación, sin blanco=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⊘ denegación: anillo + barra diagonal que lo tacha (corte de la habilidad); el brillo/grosor sube con el tier
    const rr=sh*0.44;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.5:1.2; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke();       // anillo de prohibición
    // barra diagonal (la tachadura del ⊘) — más marcada con el tier
    ctx.lineWidth=here?(1.4+tier*0.4):1.2;
    ctx.strokeStyle=(here)?"#ffffff":"rgba(150,160,176,0.5)";
    ctx.beginPath(); ctx.moveTo(cx-rr*0.72, cy-rr*0.72); ctx.lineTo(cx+rr*0.72, cy+rr*0.72); ctx.stroke();
    if(here && tier>=2){ ctx.globalAlpha=pulse*0.85;                    // segunda marca en T2 (habilidad pesada denegada)
      ctx.beginPath(); ctx.moveTo(cx+rr*0.72, cy-rr*0.72); ctx.lineTo(cx-rr*0.72, cy+rr*0.72); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Interrupción: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e6d4ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de interrupción por kill + score; si sin blanco, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Interrup s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2537: badge de REMATE DE EMBESTIDA (HEADING_SURGE). Refleja el VM PURO (sim.headingVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderHeadingBadge(){
    const k=sim.headingVM&&sim.headingVM(); if(!k) return;              // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1044, sw=14, sh=14;                          // bajo el Remate-de-interrupción (@+1022); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#ff9e6b":"#8a9bb0";                               // mob cargando=ámbar embestida, sin carga=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // »» doble-chevron apuntando HACIA el centro (el mob que carga sobre el héroe); el brillo/nº de puntas sube con el tier
    const rr=sh*0.42;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.6:1.2; ctx.lineCap="round"; ctx.lineJoin="round";
    // chevron 1 (interior)
    ctx.beginPath(); ctx.moveTo(cx+rr*0.15, cy-rr*0.7); ctx.lineTo(cx-rr*0.5, cy); ctx.lineTo(cx+rr*0.15, cy+rr*0.7); ctx.stroke();
    if(here && tier>=2){ ctx.globalAlpha=pulse*0.85;                    // segunda punta en T2 (embestida de frente)
      ctx.strokeStyle="#ffffff";
      ctx.beginPath(); ctx.moveTo(cx+rr*0.75, cy-rr*0.7); ctx.lineTo(cx+rr*0.1, cy); ctx.lineTo(cx+rr*0.75, cy+rr*0.7); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Embestida: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffd9c2":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de embestida por kill + score; si sin carga, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Embest s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2541: badge de REMATE EN ZONA PELIGROSA (ZONETIER_SURGE). Refleja el VM PURO (sim.tierVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderZoneTierBadge(){
    const k=sim.tierVM&&sim.tierVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1066, sw=14, sh=14;                          // bajo el Remate-de-embestida (@+1044); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#8ad6ff":"#8a9bb0";                               // zona peligrosa=cian frontera, zona inicial=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ◈ rombo/faceta (marca de frontera/tierra profunda); el brillo/relleno sube con el tier
    const rr=sh*0.42;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.6:1.2; ctx.lineJoin="round";
    ctx.beginPath(); ctx.moveTo(cx, cy-rr); ctx.lineTo(cx+rr*0.78, cy); ctx.lineTo(cx, cy+rr); ctx.lineTo(cx-rr*0.78, cy); ctx.closePath(); ctx.stroke();
    if(here && tier>=2){ ctx.globalAlpha=pulse*0.85;                    // faceta interior rellena en T2 (zona endgame)
      ctx.fillStyle="#d8f0ff";
      ctx.beginPath(); ctx.moveTo(cx, cy-rr*0.5); ctx.lineTo(cx+rr*0.4, cy); ctx.lineTo(cx, cy+rr*0.5); ctx.lineTo(cx-rr*0.4, cy); ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Frontera: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cfeeff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de frontera por kill + score; si zona inicial, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Front s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2546: badge de REMATE DE MOLE (BULK_SURGE). Refleja el VM PURO (sim.bulkVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderBulkBadge(){
    const k=sim.bulkVM&&sim.bulkVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1088, sw=14, sh=14;                          // bajo el Remate-en-zona-peligrosa (@+1066); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#e0b877":"#8a9bb0";                               // mole=ámbar/bronce (masa), alimaña menuda=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⬢ hexágono (bulto/masa física); el brillo/relleno sube con el tier
    const rr=sh*0.44;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.6:1.2; ctx.lineJoin="round";
    ctx.beginPath();
    for(let i=0;i<6;i++){ const ang=Math.PI/6+i*Math.PI/3, px=cx+Math.cos(ang)*rr, py=cy+Math.sin(ang)*rr; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
    ctx.closePath(); ctx.stroke();
    if(here && tier>=2){ ctx.globalAlpha=pulse*0.85;                    // núcleo hexagonal relleno en T2 (mole grande)
      ctx.fillStyle="#f4dcae";
      ctx.beginPath();
      for(let i=0;i<6;i++){ const ang=Math.PI/6+i*Math.PI/3, px=cx+Math.cos(ang)*rr*0.5, py=cy+Math.sin(ang)*rr*0.5; if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py); }
      ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Mole: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f2e0bf":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de mole por kill + score; si alimaña menuda, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Mole s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2551: badge de REMATE DE CABECILLA (ROLE_SURGE). Refleja el VM PURO (sim.roleVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderRoleBadge(){
    const k=sim.roleVM&&sim.roleVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1110, sw=14, sh=14;                          // bajo el Remate-de-Mole (@+1088); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#b892e0":"#8a9bb0";                               // cabecilla=violeta (valor táctico/mando), peleador estándar=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ❖ rombo/nodo (pieza clave/mando); el brillo/relleno sube con el tier
    const rr=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.6:1.2; ctx.lineJoin="round";
    ctx.beginPath();
    ctx.moveTo(cx,cy-rr); ctx.lineTo(cx+rr,cy); ctx.lineTo(cx,cy+rr); ctx.lineTo(cx-rr,cy); ctx.closePath(); ctx.stroke();
    if(here && tier>=2){ ctx.globalAlpha=pulse*0.85;                    // núcleo romboidal relleno en T2 (habilitador)
      ctx.fillStyle="#d9c4f0";
      ctx.beginPath();
      ctx.moveTo(cx,cy-rr*0.5); ctx.lineTo(cx+rr*0.5,cy); ctx.lineTo(cx,cy+rr*0.5); ctx.lineTo(cx-rr*0.5,cy); ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Cabecilla: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e6d6f5":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de cabecilla por kill + score; si peleador estándar, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Cab s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2556: badge de REMATE DE PRESA VELOZ (SWIFT_SURGE). Refleja el VM PURO (sim.swiftVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSwiftBadge(){
    const k=sim.swiftVM&&sim.swiftVM(); if(!k) return;                  // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1132, sw=14, sh=14;                          // bajo el Remate-de-Cabecilla (@+1110); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#5fe0c0":"#8a9bb0";                               // veloz=cian/teal (líneas de velocidad), plúmbeo=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ⇶ triple-chevron apuntando a la derecha (líneas de velocidad/escurridizo); el nº de chevrones brillantes sube con el tier
    const rr=sh*0.46;
    ctx.globalAlpha=pulse*(here?0.95:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.7:1.2; ctx.lineJoin="round"; ctx.lineCap="round";
    for(let i=0;i<3;i++){ const ox=cx-rr+i*rr*0.72;                     // 3 chevrones ">" escalonados
      ctx.globalAlpha=pulse*(here?(i<=tier?0.95:0.30):0.28);           // T1 ilumina 2, T2 ilumina los 3 (i<=tier)
      ctx.beginPath();
      ctx.moveTo(ox-rr*0.28,cy-rr*0.66); ctx.lineTo(ox+rr*0.34,cy); ctx.lineTo(ox-rr*0.28,cy+rr*0.66); ctx.stroke(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Acoso: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8f2e6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de acoso por kill + score; si plúmbeo, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Acoso s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2563: badge de REMATE DE MATÓN (MENACE_SURGE). Refleja el VM PURO (sim.menaceVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderMenaceBadge(){
    const k=sim.menaceVM&&sim.menaceVM(); if(!k) return;                  // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1154, sw=14, sh=14;                          // bajo el Remate-de-Presa-Veloz (@+1132); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.24*Math.sin(G.t*(2.6+tier*0.7))):0.55;
    const glyph=here?"#e0785f":"#8a9bb0";                               // matón=rojo-teja (golpe pesado/impacto), alfeñique=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // starburst de impacto (líneas radiales = golpe fuerte); el nº de rayos brillantes sube con el tier
    const rr=sh*0.46;
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.7:1.2; ctx.lineJoin="round"; ctx.lineCap="round";
    for(let i=0;i<4;i++){ const ang=(-Math.PI/2)+i*(Math.PI/2)+Math.PI/4;   // 4 rayos diagonales tipo "⤬"
      ctx.globalAlpha=pulse*(here?(i<(tier+2)?0.95:0.30):0.28);          // T1 ilumina 3, T2 ilumina los 4
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(ang)*rr*0.34, cy+Math.sin(ang)*rr*0.34);
      ctx.lineTo(cx+Math.cos(ang)*rr*1.02, cy+Math.sin(ang)*rr*1.02); ctx.stroke(); }
    // núcleo del impacto
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Amenaza: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f2cabe":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de amenaza por kill + score; si alfeñique, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Amenaza s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2569: badge de REMATE DE COLOSO (TOUGH_SURGE). Refleja el VM PURO (sim.toughVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderToughBadge(){
    const k=sim.toughVM&&sim.toughVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1176, sw=14, sh=14;                          // bajo el Remate-de-Matón (@+1154); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#8fb3d9":"#8a9bb0";                               // coloso=azul-acero (durabilidad/armadura), frágil=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // escudo (silueta = durabilidad/aguante); el grosor del borde y el nº de anillos internos sube con el tier
    const w=sh*0.42, topY=cy-sh*0.44, midY=cy-sh*0.02, botY=cy+sh*0.5;
    const drawShield=(scale,alpha,fill)=>{ const ww=w*scale;
      ctx.globalAlpha=pulse*alpha;
      ctx.beginPath();
      ctx.moveTo(cx-ww, topY);
      ctx.lineTo(cx+ww, topY);
      ctx.lineTo(cx+ww, midY);
      ctx.quadraticCurveTo(cx+ww, botY-2, cx, botY);
      ctx.quadraticCurveTo(cx-ww, botY-2, cx-ww, midY);
      ctx.closePath();
      if(fill){ ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.fill(); }
      else { ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.7:1.2; ctx.lineJoin="round"; ctx.stroke(); }
    };
    drawShield(1.0, here?0.95:0.30, false);                            // contorno del escudo
    if(here && tier>=2) drawShield(0.52, 0.9, false);                  // anillo interno extra en T2 (coloso)
    // núcleo del escudo (remache central)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?1.7:1.2,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Aguante: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c9dcf0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de aguante por kill + score; si frágil, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Aguante s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2573: badge de REMATE DE VIGÍA (SENTINEL_SURGE). Refleja el VM PURO (sim.sentinelVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSentinelBadge(){
    const k=sim.sentinelVM&&sim.sentinelVM(); if(!k) return;                // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1198, sw=14, sh=14;                          // bajo el Remate-de-Coloso (@+1176); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#8fd9c4":"#8a9bb0";                               // vigía=verde-azulado (ojo/percepción), despistado=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ojo vigilante (anillos de detección concéntricos = radio de percepción); el nº de anillos sube con el tier
    const drawRing=(rad,alpha,lw)=>{ ctx.globalAlpha=pulse*alpha;
      ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=lw; ctx.beginPath(); ctx.arc(cx,cy,rad,0,Math.PI*2); ctx.stroke(); };
    drawRing(sh*0.44, here?0.95:0.30, here?1.6:1.2);                   // anillo exterior (radio de detección)
    if(here && tier>=2) drawRing(sh*0.30, 0.85, 1.3);                  // anillo medio extra en T2 (vigía)
    // pupila (núcleo del ojo = el foco de la mirada)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Centinela: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c4f0e6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de vigilia por kill + score; si despistado, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Centinela s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2580: badge de REMATE DE ARIETE (RAM_SURGE). Refleja el VM PURO (sim.ramVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderRamBadge(){
    const k=sim.ramVM&&sim.ramVM(); if(!k) return;                     // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1220, sw=14, sh=14;                          // bajo el Remate-de-Vigía (@+1198); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#e0a86a":"#8a9bb0";                               // ariete=ámbar-cobre (empuje/impacto físico), leve=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // impacto/onda de choque (rayos radiales de empuje); el nº de rayos sube con el tier
    const rays=here?(4+tier*2):3, R0=sh*(here?0.20:0.16), R1=sh*(here?0.46:0.34);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?1.6:1.2; ctx.lineCap="round";
    for(let i=0;i<rays;i++){ const an=(i/rays)*Math.PI*2; ctx.globalAlpha=pulse*(here?0.92:0.30);
      ctx.beginPath(); ctx.moveTo(cx+Math.cos(an)*R0, cy+Math.sin(an)*R0); ctx.lineTo(cx+Math.cos(an)*R1, cy+Math.sin(an)*R1); ctx.stroke(); }
    // núcleo del impacto (el punto de golpe)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.2:1.5,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Ariete: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f0d2ac":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de ariete por kill + score; si leve, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Ariete s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2585: badge de REMATE DE PRESAGIO (WINDUP_SURGE). Refleja el VM PURO (sim.windVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderWindupBadge(){
    const k=sim.windVM&&sim.windVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1242, sw=14, sh=14;                          // bajo el Remate-de-Ariete (@+1220); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.2+tier*0.6))):0.55;
    const glyph=here?"#b58ad9":"#8a9bb0";                               // presagio=violeta (el amago/tell que se carga), súbito=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // arco de CARGA del amago (barrido que se LLENA más con el tier = telegraph más largo); el ángulo barrido sube con el tier
    const sweep=here?(0.55+tier*0.55):0.4, R=sh*(here?0.40:0.32);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+sweep*Math.PI*2*0.5); ctx.stroke();   // arco parcial (medio giro máx)
    // aguja del reloj (dirección del amago acumulado)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    const an=-Math.PI/2+sweep*Math.PI; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(an)*R*0.9, cy+Math.sin(an)*R*0.9); ctx.stroke();
    // núcleo (el pivote del amago)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Presagio: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#d9c2ef":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de presagio por kill + score; si súbito, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Presagio s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2594: badge de REMATE DE RECOBRO (RECOVER_SURGE). Refleja el VM PURO (sim.recoverVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderRecoverBadge(){
    const k=sim.recoverVM&&sim.recoverVM(); if(!k) return;                // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1264, sw=14, sh=14;                          // bajo el Remate-de-Presagio (@+1242); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#7fc8a0":"#8a9bb0";                               // recobro=verde-azulado (la larga cola de exposición tras la estocada), ágil=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // arco de RECOBRO que se DRENA (barrido inverso que decae más con el tier = cola de exposición más larga); el ángulo drenado sube con el tier
    const drain=here?(0.55+tier*0.55):0.4, R=sh*(here?0.40:0.32);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,R,-Math.PI/2, -Math.PI/2 - drain*Math.PI*2*0.5, true); ctx.stroke();   // arco parcial ANTIHORARIO (drena, opuesto al amago de #99)
    // cola de asentamiento (la dirección del recobro que se disipa)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    const an=-Math.PI/2 - drain*Math.PI; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(an)*R*0.9, cy+Math.sin(an)*R*0.9); ctx.stroke();
    // núcleo (el pivote del recobro, exhausto)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Recobro: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c2efd6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de recobro por kill + score; si ágil, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Recobro s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2600: badge de REMATE DE ACOMETIDA (LUNGE_SURGE). Refleja el VM PURO (sim.lungeVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderLungeBadge(){
    const k=sim.lungeVM&&sim.lungeVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1286, sw=14, sh=14;                          // bajo el Remate-de-Recobro (@+1264); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#e0a24d":"#8a9bb0";                               // acometida=ámbar (el salto de acercamiento del pouncer), corto=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // flecha de POUNCE que se PROYECTA hacia delante (dardo de acometida; el alcance sube con el tier = salto más largo)
    const reach=here?(0.42+tier*0.30):0.30, R=sh*(here?0.46:0.34);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4; ctx.lineCap="round";
    const tipx=cx+R*reach*2.0;                                         // la punta del dardo avanza con el tier
    ctx.beginPath(); ctx.moveTo(cx-R*0.6,cy); ctx.lineTo(tipx,cy); ctx.stroke();   // asta del dardo (proyección hacia delante, opuesto al drenaje de #100)
    // punta de flecha (la cabeza del salto)
    ctx.globalAlpha=pulse*(here?0.95:0.30);
    ctx.beginPath(); ctx.moveTo(tipx,cy); ctx.lineTo(tipx-R*0.5,cy-R*0.45); ctx.moveTo(tipx,cy); ctx.lineTo(tipx-R*0.5,cy+R*0.45); ctx.stroke();
    // cola (el punto de despegue del pounce)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx-R*0.6,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Acometida: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#f0d29a":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de acometida por kill + score; si salto corto, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Acometida s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2611: badge de REMATE DE PERTRECHO (GEARCHANCE_SURGE). Refleja el VM PURO (sim.gearVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderGearBadge(){
    const k=sim.gearVM&&sim.gearVM(); if(!k) return;                     // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1308, sw=14, sh=14;                          // bajo el Remate-de-Acometida (@+1286); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#c9a24b":"#8a9bb0";                               // pertrecho=oro-latón (el equipo cargado del mob bien-armado), pelado=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // engranaje/rueda dentada de PERTRECHO (el gear del mob bien-armado; los dientes crecen con el tier = más equipo)
    const R=sh*(here?0.40:0.30), teeth=here?(4+tier*2):5;
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4; ctx.lineCap="round";
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();        // el cuerpo de la rueda
    ctx.globalAlpha=pulse*(here?0.9:0.30);
    for(let i=0;i<teeth;i++){ const ang=(i/teeth)*Math.PI*2; const ix=cx+Math.cos(ang)*R, iy=cy+Math.sin(ang)*R, ox=cx+Math.cos(ang)*R*1.5, oy=cy+Math.sin(ang)*R*1.5;
      ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ox,oy); ctx.stroke(); }   // los dientes (el equipo que carga)
    // cubo central (el eje del gear)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?2.0:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Pertrecho: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e8cf8a":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de pertrecho por kill + score; si pelado, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Pertrecho s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2615: badge de REMATE DE BOLSA (GOLD_SURGE). Refleja el VM PURO (sim.goldVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderGoldBadge(){
    const k=sim.goldVM&&sim.goldVM(); if(!k) return;                     // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1330, sw=14, sh=14;                          // bajo el Remate-de-Pertrecho (@+1308); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#ffcf40":"#8a9bb0";                               // bolsa=oro-moneda (el botín cargado del mob de bolsa gorda), bolsa-flaca=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // moneda de BOLSA (el coin del mob de bolsa gorda; los anillos crecen con el tier = más monedas)
    const R=sh*(here?0.42:0.30), rings=here?(1+tier):1;
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.stroke();        // el borde de la moneda
    ctx.globalAlpha=pulse*(here?0.85:0.30);
    for(let i=1;i<rings;i++){ ctx.beginPath(); ctx.arc(cx,cy,R*(1-i*0.28),0,Math.PI*2); ctx.stroke(); }   // anillos internos (las monedas apiladas)
    // marca central de valor (el cuño del coin)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?1.9:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Bolsa: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe08a":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de moneda por kill + score; si bolsa-flaca, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Bolsa s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2620: badge de REMATE DE ESTALLIDO (SPLASH_SURGE). Refleja el VM PURO (sim.splashVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSplashBadge(){
    const k=sim.splashVM&&sim.splashVM(); if(!k) return;                 // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1352, sw=14, sh=14;                          // bajo el Remate-de-Bolsa (@+1330); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#7ad0ff":"#8a9bb0";                               // estallido=onda de choque azul-área (el radio del ground-slam), sin-área=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // ONDA DE CHOQUE de ESTALLIDO (anillos concéntricos = radio del golpe de área; crecen con el tier = área más ancha)
    const R=sh*(here?0.46:0.30), rings=here?(1+tier):1;
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4;
    for(let i=0;i<rings;i++){ ctx.globalAlpha=pulse*(here?(0.9-i*0.28):0.30); ctx.beginPath(); ctx.arc(cx,cy,R*(1-i*0.30),0,Math.PI*2); ctx.stroke(); }   // anillos EXPANDIÉNDOSE hacia afuera (la salpicadura)
    // epicentro del estallido (el punto de impacto del ground-slam)
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy,here?1.9:1.4,0,Math.PI*2); ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Estallido: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#bfe6ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de estallido por kill + score; si sin-área, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Estallido s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2627: badge de REMATE DE PONZOÑA (BANE_SURGE). Refleja el VM PURO (sim.baneVM, autoridad en sim) ⇒ MISMO score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderBaneBadge(){
    const k=sim.baneVM&&sim.baneVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1374, sw=14, sh=14;                          // bajo el Remate-de-Estallido (@+1352); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const glyph=here?"#8ae05a":"#8a9bb0";                               // ponzoña=goteo verde-tóxico (la aflicción que su golpe deja), sin-aflicción=gris
    const cx=bx+sw/2, cy=by+sh/2;
    ctx.save(); ctx.globalAlpha=pulse;
    // GOTA DE PONZOÑA (una gota que cuelga = la secuela que gotea; el tamaño/cola crece con el tier = aflicción más duradera)
    const R=sh*(here?0.42:0.28);
    ctx.strokeStyle=here?glyph:"rgba(150,160,176,0.42)"; ctx.lineWidth=here?2.0:1.4;
    ctx.beginPath(); ctx.arc(cx,cy+R*0.30,R*(here?0.72:0.55),0,Math.PI*2); ctx.stroke();   // bulbo de la gota
    ctx.beginPath(); ctx.moveTo(cx,cy-R*(here?1.0:0.7)); ctx.lineTo(cx-R*0.5,cy+R*0.1); ctx.lineTo(cx+R*0.5,cy+R*0.1); ctx.closePath(); ctx.stroke();   // punta/cola de la gota (cuelga hacia arriba)
    // núcleo tóxico de la gota
    ctx.globalAlpha=pulse*(here?0.92:0.30);
    ctx.fillStyle=here?glyph:"rgba(150,160,176,0.42)";
    ctx.beginPath(); ctx.arc(cx,cy+R*0.30,here?1.9:1.4,0,Math.PI*2); ctx.fill();
    // motas de ponzoña extra por tier (más burbujas = aflicción más virulenta)
    if(here){ for(let i=0;i<tier;i++){ ctx.globalAlpha=pulse*(0.7-i*0.22); ctx.beginPath(); ctx.arc(cx+(i?R*0.7:-R*0.7),cy-R*(0.2+i*0.35),0.9,0,Math.PI*2); ctx.fill(); } }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Ponzoña: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c6f0a8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de ponzoña por kill + score; si sin-aflicción, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2=here?("+"+charge+" Ponzoña s"+score):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2,bx+140,ty);
    ctx.fillStyle=here?glyph:"#8a9bb0"; ctx.fillText(st2,bx+140,ty);
    ctx.restore();
  }

  // CAS-2634: badge de REMATE DE RALEA ABIGARRADA (MOTLEY_SURGE). Refleja el VM PURO (sim.motleyVM, autoridad en sim) ⇒ MISMO count/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderMotleyBadge(){
    const k=sim.motleyVM&&sim.motleyVM(); if(!k) return;                // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1396, sw=14, sh=14;                          // bajo el Remate-de-Ponzoña (@+1374); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, count=k.count|0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // tres marcas de FORMA/COLOR distinta = hueste heterogénea (cuantas más formas encendidas, más abigarrada); apagadas grises = monótona
    const cols=here?["#e0b0ff","#8ae05a","#7ad0ff"]:["rgba(150,160,176,0.42)","rgba(150,160,176,0.30)","rgba(150,160,176,0.22)"];
    const R=sh*(here?0.30:0.24);
    ctx.save(); ctx.globalAlpha=pulse;
    // círculo (izq)
    ctx.fillStyle=cols[0]; ctx.beginPath(); ctx.arc(cx-R*1.15,cy,R*0.7,0,Math.PI*2); ctx.fill();
    // triángulo (centro-arriba)
    ctx.fillStyle=cols[1]; ctx.beginPath(); ctx.moveTo(cx,cy-R*0.95); ctx.lineTo(cx-R*0.7,cy+R*0.5); ctx.lineTo(cx+R*0.7,cy+R*0.5); ctx.closePath(); ctx.fill();
    // cuadrado (der)
    ctx.fillStyle=cols[2]; ctx.fillRect(cx+R*0.5,cy-R*0.55,R*1.1,R*1.1);
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Ralea: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e8cfff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de ralea por kill + nº de especies; si monótona, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Ralea ×"+count):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+140,ty);
    ctx.fillStyle=here?"#e0b0ff":"#8a9bb0"; ctx.fillText(st2b,bx+140,ty);
    ctx.restore();
  }

  // CAS-2640: badge de REMATE DE HUESTE DISPERSA (DISPERSE_SURGE). Refleja el VM PURO (sim.disperseVM, autoridad en sim) ⇒ MISMO spread/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderDisperseBadge(){
    const k=sim.disperseVM&&sim.disperseVM(); if(!k) return;             // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1418, sw=14, sh=14;                          // bajo el Remate-de-Ralea (@+1396); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, spread=+k.spread||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // puntos que se ALEJAN del centro = formación desplegada (cuanto más lejos, más dispersa); apagados grises/juntos = apiñada
    const col=here?"#7ad0ff":"rgba(150,160,176,0.36)";
    const R=sh*(here?0.42:0.24);                                        // radio de despliegue de los puntos = más ancho cuanto más disperso
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.fillStyle=col;
    // punto central + 4 satélites radiando hacia afuera (metáfora de dispersión)
    ctx.beginPath(); ctx.arc(cx,cy,R*0.34,0,Math.PI*2); ctx.fill();
    for(let i=0;i<4;i++){ const ang=i*Math.PI/2+Math.PI/4, px=cx+Math.cos(ang)*R, py=cy+Math.sin(ang)*R;
      ctx.beginPath(); ctx.arc(px,py,R*0.28,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Dispersión: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cfeeff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de dispersión por kill + spread px; si apiñada, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Disp "+Math.round(spread)+"px"):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#7ad0ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2645: badge de REMATE DE FALANGE (FLANK_SURGE). Refleja el VM PURO (sim.flankVM, autoridad en sim) ⇒ MISMO conc/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderFlankBadge(){
    const k=sim.flankVM&&sim.flankVM(); if(!k) return;                  // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1440, sw=14, sh=14;                          // bajo el Remate-de-Hueste-Dispersa (@+1418); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, conc=+k.conc||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // cuña/arco amasado en UN sector = falange concentrada en un flanco; apagado gris = repartida/cercando
    const col=here?"#ffcf7a":"rgba(150,160,176,0.36)";
    const R=sh*0.42;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.fillStyle=col;
    // punto del héroe + una CUÑA de 3 satélites amasados en un sector estrecho (metáfora de flanco concentrado)
    ctx.beginPath(); ctx.arc(cx,cy,R*0.30,0,Math.PI*2); ctx.fill();
    const spread=here?(0.32+(1-Math.min(1,conc))*1.4):1.1;             // más concentrado (conc alto) ⇒ satélites más JUNTOS en un sector
    for(let i=0;i<3;i++){ const ang=-Math.PI/4+(i-1)*spread, px=cx+Math.cos(ang)*R, py=cy+Math.sin(ang)*R;
      ctx.beginPath(); ctx.arc(px,py,R*0.26,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Falange: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe6bf":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de falange por kill + concentración R; si cercado, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Fal R"+conc.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#ffcf7a":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2650: badge de REMATE DE COLUMNA (COLUMN_SURGE). Refleja el VM PURO (sim.columnVM, autoridad en sim) ⇒ MISMO elong/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderColumnBadge(){
    const k=sim.columnVM&&sim.columnVM(); if(!k) return;                 // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1462, sw=14, sh=14;                          // bajo el Remate-de-Falange (@+1440); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, elong=+k.elong||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // nube ESTIRADA en un eje = columna; nube redonda = isótropa; apagado gris = redonda
    const col=here?"#a0d8ff":"rgba(150,160,176,0.36)";
    const R=sh*0.42;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.fillStyle=col;
    // 4 satélites estirados a lo largo de un eje vertical (metáfora de columna); más elongado ⇒ más apretados en el eje
    const aspect=here?(0.10+(1-Math.min(1,elong))*0.9):0.7;            // más colineal (elong alto) ⇒ eje MENOR (X) más estrecho ⇒ columna delgada
    for(let i=0;i<4;i++){ const t=(i-1.5)/1.5, px=cx+t*R*aspect, py=cy+t*R;
      ctx.beginPath(); ctx.arc(px,py,R*0.24,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Columna: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#cfe8ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de columna por kill + elongación E; si redonda, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Col E"+elong.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#a0d8ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2655: badge de REMATE DE DESBANDADA (ORIENT_SURGE). Refleja el VM PURO (sim.orientVM, autoridad en sim) ⇒ MISMO spread/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderOrientBadge(){
    const k=sim.orientVM&&sim.orientVM(); if(!k) return;                 // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1484, sw=14, sh=14;                          // bajo el Remate-de-Columna (@+1462); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, spread=+k.spread||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // flechas irradiando; más dispersión (spread alto) ⇒ más ABIERTAS/divergentes (desbandada); poca ⇒ casi paralelas (marcha en unísono); apagado gris = unísono
    const col=here?"#c9a0ff":"rgba(150,160,176,0.36)";
    const R=sh*0.44;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.lineCap="round"; ctx.fillStyle=col;
    const spr=here?Math.min(1,spread):0.12;                            // apertura del abanico proporcional a la dispersión
    for(let i=0;i<3;i++){ const ang=(i-1)*spr*2.4 - Math.PI/2, ex=cx+Math.cos(ang)*R, ey=cy+Math.sin(ang)*R;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ex,ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex,ey,R*0.15,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Desbandada: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e2d0ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de desbandada por kill + dispersión S; si unísono, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Desb S"+spread.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#c9a0ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2660: badge de REMATE DE TROPEL DESIGUAL (SPEED_SURGE). Refleja el VM PURO (sim.speedVM, autoridad en sim) ⇒ MISMO cv/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSpeedBadge(){
    const k=sim.speedVM&&sim.speedVM(); if(!k) return;                  // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1506, sw=14, sh=14;                          // bajo el Remate-de-Desbandada (@+1484); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, cv=+k.cv||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // tres flechas horizontales de LONGITUD DESIGUAL; más CV (ritmos dispares) ⇒ más disparidad de largos (tropel de rezagados+chargers); poca ⇒ largos casi iguales (marcha pareja); apagado gris = paso parejo
    const col=here?"#9fe0d0":"rgba(150,160,176,0.36)";
    const R=sh*0.44;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.lineCap="round"; ctx.fillStyle=col;
    const disp=here?Math.min(1,cv*1.6):0.05;                            // disparidad visual de largos proporcional al CV
    const lens=[1-disp*0.6, 1, 1+disp*0.6];                            // 3 largos: corto/medio/largo (rezagado/normal/charger)
    for(let i=0;i<3;i++){ const ly=cy+(i-1)*R*0.7, ex=cx-R+2*R*Math.max(0.2,Math.min(1,lens[i]));
      ctx.beginPath(); ctx.moveTo(cx-R,ly); ctx.lineTo(ex,ly); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex,ly); ctx.lineTo(ex-R*0.28,ly-R*0.24); ctx.lineTo(ex-R*0.28,ly+R*0.24); ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Tropel: "+(here?("T"+tier):"—");
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#d2f0e6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de tropel por kill + CV; si paso parejo, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Trop CV"+cv.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#9fe0d0":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2665: badge de REMATE DE EMBESTIDA CONVERGENTE (CONVERGE_SURGE). Refleja el VM PURO (sim.convergeVM, autoridad en sim) ⇒ MISMO idx/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderConvergeBadge(){
    const k=sim.convergeVM&&sim.convergeVM(); if(!k) return;               // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1528, sw=14, sh=14;                            // bajo el Remate-de-Tropel (@+1506); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, idx=+k.idx||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // dos flechas horizontales CONVERGIENDO hacia el centro; más C (embestida cerrada) ⇒ más cerca/apuntando al centro (manada cerrando); apagado gris = millando/tangencial
    const col=here?"#ffcaa0":"rgba(150,160,176,0.36)";
    const R=sh*0.46;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.5; ctx.lineCap="round"; ctx.fillStyle=col;
    const conv=here?Math.max(0.15,Math.min(1,idx)):0.1;                   // avance visual proporcional al índice de convergencia
    const gap=R*(1.15-conv*0.8);                                          // más convergencia ⇒ menor separación (puntas casi tocándose en el centro)
    // flecha izquierda apuntando a la DERECHA (hacia el centro) + flecha derecha apuntando a la IZQUIERDA (hacia el centro)
    for(let s=-1;s<=1;s+=2){ const tipX=cx-s*gap, tailX=cx-s*(gap+R*1.1);
      ctx.beginPath(); ctx.moveTo(tailX,cy); ctx.lineTo(tipX,cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tipX,cy); ctx.lineTo(tipX+s*R*0.30,cy-R*0.26); ctx.lineTo(tipX+s*R*0.30,cy+R*0.26); ctx.closePath(); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Cierre: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Cierre" (embestida convergente) — distinta de "Embestida" #90 (rumbo MAX de 1 víctima)
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe0c6":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de embestida por kill + índice C; si millando, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Cierre C"+idx.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#ffcaa0":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2669: badge de REMATE DE CERCO (ENCIRCLE_SURGE). Refleja el VM PURO (sim.encircleVM, autoridad en sim) ⇒ MISMO cover/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderEncircleBadge(){
    const k=sim.encircleVM&&sim.encircleVM(); if(!k) return;               // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1550, sw=14, sh=14;                            // bajo el Remate-de-Cierre (@+1528); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, cover=+k.cover||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // un ANILLO alrededor del centro; la porción DIBUJADA (cobertura) crece con K, dejando ABIERTO el mayor-hueco; apagado gris = amontonados en un costado
    const col=here?"#b0d8ff":"rgba(150,160,176,0.36)";
    const R=sh*0.46;
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.lineCap="round";
    const cov=here?Math.max(0.12,Math.min(0.98,cover)):0.1;               // fracción del anillo cubierta = cobertura K
    const gapAng=(1-cov)*Math.PI*2;                                       // el mayor-hueco abierto (arco NO dibujado)
    ctx.beginPath(); ctx.arc(cx,cy,R, -Math.PI/2+gapAng/2, -Math.PI/2-gapAng/2+Math.PI*2); ctx.stroke();   // arco cubierto (deja el hueco arriba)
    // puntitos en los flancos cubiertos para leer "rodeado"
    ctx.fillStyle=col;
    for(let i=0;i<4;i++){ const ang=-Math.PI/2+gapAng/2+(Math.PI*2-gapAng)*(i/3); const px=cx+Math.cos(ang)*R, py=cy+Math.sin(ang)*R;
      ctx.beginPath(); ctx.arc(px,py,1.1,0,Math.PI*2); ctx.fill(); }
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Cerco: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Cerco" (cobertura angular) — distinta de "Falange" #108 (concentración R)
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#d6ebff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de cerco por kill + cobertura K; si amontonados, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Cerco K"+cover.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#b0d8ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2675: badge de REMATE DE FONDO (DEPTH_SURGE). Refleja el VM PURO (sim.depthVM, autoridad en sim) ⇒ MISMO cv/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderDepthBadge(){
    const k=sim.depthVM&&sim.depthVM(); if(!k) return;                     // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1572, sw=14, sh=14;                            // bajo el Remate-de-Cerco (@+1550); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, cv=+k.cv||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // rangos concéntricos: la SEPARACIÓN entre anillos crece con el CV (fondo profundo = anillos escalonados cerca+lejos); apagado gris = anillo delgado uniforme
    const col=here?"#c9b6ff":"rgba(150,160,176,0.36)";
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.4;
    const spread=here?Math.max(0.15,Math.min(1,cv)):0.05;                 // separación radial normalizada de los rangos = CV
    for(let i=0;i<3;i++){ const rr=sh*0.16 + i*sh*0.15*(0.5+spread); ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.stroke(); }   // 3 rangos concéntricos escalonados por el CV
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Fondo: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Fondo" (profundidad radial) — distinta de "Cerco" #113 (cobertura angular)/"Hueste" #107 (spread px)
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#e2d8ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de fondo por kill + CV; si anillo delgado, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Fondo CV"+cv.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#c9b6ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2680: badge de REMATE DE TALLA DISPAR (SIZECLASS_SURGE). Refleja el VM PURO (sim.sizeClassVM, autoridad en sim) ⇒ MISMO cv/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderSizeClassBadge(){
    const k=sim.sizeClassVM&&sim.sizeClassVM(); if(!k) return;              // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1594, sw=14, sh=14;                            // bajo el Remate-de-Fondo (@+1572); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, cv=+k.cv||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2;
    // tres círculos de RADIO DISPAR (menudo/medio/colosal): cuanto MAYOR el CV, MAYOR la diferencia de tamaño entre ellos (tallas dispares); apagado gris = calibre uniforme (tres círculos casi iguales)
    const col=here?"#ffd9a0":"rgba(150,160,176,0.36)";
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.4;
    const spread=here?Math.max(0.12,Math.min(1,cv)):0.04;                 // amplitud de la variación de radio entre los círculos = CV
    const base=sh*0.20, offs=[-1,0,1];
    for(let i=0;i<3;i++){ const rr=base*(1+offs[i]*spread*0.9); ctx.beginPath(); ctx.arc(cx,cy,Math.max(1,rr),0,Math.PI*2); ctx.stroke(); }   // 3 círculos de tallas dispares por el CV
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Talla: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Talla" (dispersión de talla-clase) — distinta de "Mole" #88 (talla de 1 víctima)/"Ralea" #106 (nº de tipos)/"Fondo" #114 (CV de distancias)
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#ffe9c8":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de talla por kill + CV; si mono-talla, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Talla CV"+cv.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#ffd9a0":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2684: badge de REMATE DE CARRUSEL (ORBIT_SURGE). Refleja el VM PURO (sim.orbitVM, autoridad en sim) ⇒ MISMO idx/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderOrbitBadge(){
    const k=sim.orbitVM&&sim.orbitVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1616, sw=14, sh=14;                            // bajo el Remate-de-Talla (@+1594); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, score=k.score|0, idx=+k.idx||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(2.0+tier*0.5))):0.55;
    const cx=bx+sw/2, cy=by+sh/2, rr=sh*0.30;
    // arco ORBITAL + punto que GIRA: cuanto MAYOR la circulación C, MAYOR el arco barrido (carrusel coherente); apagado gris = radial/mixto (arco corto quieto)
    const col=here?"#a0e0ff":"rgba(150,160,176,0.36)";
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.lineCap="round";
    const sweep=here?(0.35+Math.min(1,idx)*1.55)*Math.PI:0.5;             // amplitud del arco barrido = C
    const spin=here?(G.t*(1.2+tier*0.6)):0;                               // giro del carrusel (cosmético, refleja tier)
    ctx.beginPath(); ctx.arc(cx,cy,rr,spin,spin+sweep,false); ctx.stroke();   // arco orbital
    const px=cx+Math.cos(spin+sweep)*rr, py=cy+Math.sin(spin+sweep)*rr;   // punto en la cabeza del arco (el mob que orbita)
    ctx.beginPath(); ctx.arc(px,py,1.5,0,Math.PI*2); ctx.fillStyle=col; ctx.fill();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Órbita: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Órbita" (circulación orbital tangencial) — distinta de "Cierre/Embestida" #112 (velocidad radial)/"Desbandada" #110 (dispersión de rumbo)/"Tropel" #111 (CV de velocidad)
    ctx.lineWidth=3; ctx.lineJoin="round"; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#c8f0ff":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de carrusel por kill + C; si radial/mixto, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Órbita C"+idx.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#a0e0ff":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  // CAS-2688: badge de REMATE DE REVUELO (ACCEL_SURGE, EVO#117 — eje de 2º ORDEN / CHURN CINÉTICO). Refleja el VM PURO (sim.accelVM, autoridad en sim) ⇒ MISMO idx/score/tier/fichas para todos los clientes con el mismo estado de sim. Cosmético puro (0 efecto de sim). DARK (enabled:false) ⇒ el dispatch NO lo llama hasta el flip.
  function renderAccelBadge(){
    const k=sim.accelVM&&sim.accelVM(); if(!k) return;                    // sin VM ⇒ nada
    const a=badgeRowAnchor();
    const bx=a.bx, by=a.by+1638, sw=14, sh=14;                            // bajo el Remate-de-Carrusel (@+1616); gap anti-solape (CAS-2263)
    const tier=k.tier|0, here=tier>0, charge=k.charge|0, idx=+k.idx||0;
    const pulse=here?(0.74+0.22*Math.sin(G.t*(3.0+tier*0.9))):0.55;       // pulso MÁS nervioso que el carrusel (revuelo = alta frecuencia)
    const cx=bx+sw/2, cy=by+sh/2, rr=sh*0.32;
    // rayo de REVUELO: zig-zag cuya AMPLITUD crece con el churn C (mucho cambio = mucho temblor); apagado gris = velocidad constante (línea quieta)
    const col=here?"#ffe27a":"rgba(150,160,176,0.36)";
    ctx.save(); ctx.globalAlpha=pulse;
    ctx.strokeStyle=col; ctx.lineWidth=1.6; ctx.lineCap="round"; ctx.lineJoin="round";
    const amp=here?(0.5+Math.min(1,idx)*1.6):0.3;                         // amplitud del zig-zag = C
    const jit=here?Math.sin(G.t*(6.0+tier*2.0)):0;                        // temblor cosmético (refleja tier)
    ctx.beginPath();
    for(let s=0;s<=4;s++){ const fx=cx-rr+ (s/4)*rr*2; const fy=cy+((s%2===0)?-1:1)*rr*amp*(0.6+0.4*jit);
      if(s===0) ctx.moveTo(fx,fy); else ctx.lineTo(fx,fy); }
    ctx.stroke();
    // micro-label
    ctx.globalAlpha=pulse;
    ctx.font="bold 11px "+FF; ctx.textAlign="left"; ctx.textBaseline="middle";
    const ty=cy, tx=bx+sw+5, lbl="Revuelo: "+(here?("T"+tier):"—");   // etiqueta ÚNICA "Revuelo" (churn cinético 2º-orden) — distinta de "Órbita" #116 (tangencial)/"Cierre" #112 (radial)/"Desbandada" #110 (rumbo)/"Tropel" #111 (CV velocidad)
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(lbl,tx,ty);
    ctx.fillStyle=here?"#fff0c0":"#8a9bb0"; ctx.fillText(lbl,tx,ty);
    // estado a la derecha: +fichas de revuelo por kill + C; si ~constante, "—"
    ctx.font="bold 10px "+FF; ctx.textAlign="right";
    const st2b=here?("+"+charge+" Revuelo C"+idx.toFixed(2)):"—";
    ctx.lineWidth=3; ctx.strokeStyle="rgba(0,0,0,0.72)"; ctx.strokeText(st2b,bx+150,ty);
    ctx.fillStyle=here?"#ffe27a":"#8a9bb0"; ctx.fillText(st2b,bx+150,ty);
    ctx.restore();
  }

  function renderMiniMap(){ if(isTouch) return;
    const sidebar=view.sbw>0;
    let mw=120, mh=120, x, y;
    if(sidebar){ // CAS: minimap docked in the right sidebar (under the vitals), centred
      mw=mh=Math.min(view.sbw-28,176); x=view.sbx()+Math.round((view.sbw-mw)/2); y=104; }
    else { // CAS-418 anchor from the layout store, clamped every draw. CAS-1612 (AD P1 #9):
      // default moved to TOP-RIGHT (x=VW-mw-12, y=12) — the ARPG convention; Reset restores here.
      x=uiLayout.cx("minimap", VW-mw-12, mw);
      y=uiLayout.cy("minimap", 12, mh);
      uiLayout.pub("minimap", x, y, mw, mh); } // hit-rect for the input drag router
    AR("minimap", x-2, y-2, mw+4, mh+4);
    // CAS-454: gold border matching Tibia panels; dark fill
    ctx.fillStyle="rgba(12,14,19,0.88)"; ctx.fillRect(x-2,y-2,mw+4,mh+4);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x-2,y-2,mw+4,mh+4);
    if(uiLayout.dragging()==="minimap"){ ctx.strokeStyle="#ffe39a"; ctx.lineWidth=2; ctx.strokeRect(x-4,y-4,mw+8,mh+8); }
    // CAS-466: silueta + ventana con zoom centrada en el héroe
    if(!mmTerra || mmTerraW!==Math.ceil(MAP_W/2)) mmBuildTerra();
    const mz=(uiLayout.mmZoom?uiLayout.mmZoom():1);
    const vwPx=MAP_W*TS/mz, vhPx=MAP_H*TS/mz;
    let vx=G.hero.x-vwPx/2, vy=G.hero.y-vhPx/2;
    vx=Math.max(0,Math.min(MAP_W*TS-vwPx,vx)); vy=Math.max(0,Math.min(MAP_H*TS-vhPx,vy));
    const pis=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
    if(mmTerra) ctx.drawImage(mmTerra, vx/(TS*2), vy/(TS*2), vwPx/(TS*2), vhPx/(TS*2), x, y, mw, mh);
    ctx.imageSmoothingEnabled=pis;
    ctx.save(); ctx.beginPath(); ctx.rect(x,y,mw,mh); ctx.clip();
    const sx=mw/vwPx, sy=mh/vhPx, mmox=x-vx*sx, mmoy=y-vy*sy;
    // CAS-454: brightened minimap-only zone palette so the map reads in the cold-gloom world
    const MM={forest:"#4e7054",caves:"#484f5e",arena:"#7a7058",town:"#4a5c6a",ruins:"#5a6e52",abyss:"#5a3d70",frost:"#4e6878",trial:"#c8a24a",swamp:"#567a62"};
    const zr=[[world.forest,MM.forest],[world.caves,MM.caves],[world.arena,MM.arena],[world.town,MM.town],[world.ruins,MM.ruins],[world.abyss,MM.abyss],[world.frost,MM.frost],[world.trial,MM.trial],[world.swamp,MM.swamp]];
    ctx.globalAlpha=0.45;
    for(const [r,c] of zr){ if(!r) continue; ctx.fillStyle=c; ctx.fillRect(mmox+r.x*TS*sx,mmoy+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy); }
    ctx.globalAlpha=1;
    // CAS-454: viewport rectangle showing camera frustum
    const Z=zoom(); const vpW=VW/Z, vpH=VH/Z;
    ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.lineWidth=1;
    ctx.strokeRect(mmox+G.cam.x*sx, mmoy+G.cam.y*sy, vpW*sx, vpH*sy);
    // CAS-114 — portal blips on the minimap (violet)
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ if(p.stub) continue; ctx.fillRect(mmox+p.x*sx-1,mmoy+p.y*sy-1,3,3); } }
    ctx.fillStyle="#ff5a4a"; for(const e of G.enemies){ ctx.fillRect(mmox+e.x*sx-1,mmoy+e.y*sy-1,2,2); }
    // CAS-2226: city POI blips (DARK — only when MINIMAP.enabled). Small square + dark outline so
    // the landmark reads over the terrain silhouette. Text labels are reserved for the big map.
    if(MINIMAP.enabled){ for(const b of mapBlips()){ const bx=mmox+b.x*sx, by=mmoy+b.y*sy;
      ctx.fillStyle=b.col; ctx.fillRect(bx-2,by-2,4,4);
      ctx.strokeStyle="rgba(10,12,16,0.85)"; ctx.lineWidth=1; ctx.strokeRect(bx-2.5,by-2.5,5,5); } }
    // CAS-2284: OBJETIVO DE REUNIÓN del Toque de Guerra — blip pulsante (rombo ámbar/rojo) en el borde de la SAFEZONE durante la
    // ventana activa. Posición DERIVADA (G.warhorn.rally, hash puro de windowIdx ⇒ mismo punto para todos). Gated en
    // WORLD_EVENT.enabled ⇒ OFF nunca se dibuja ⇒ byte-idéntico. $0 arte (canvas procedural).
    if(WORLD_EVENT.enabled && G.warhorn && G.warhorn.active && G.warhorn.rally){
      const r=G.warhorn.rally, rx=mmox+r.x*sx, ry=mmoy+r.y*sy, pz=0.7+0.3*Math.sin(G.t*5), s=3.2+pz;
      ctx.save(); ctx.globalAlpha=0.55+0.4*pz; ctx.translate(rx,ry); ctx.rotate(Math.PI/4);
      ctx.fillStyle=G.warhorn.phase==="peak"?"#ff7a3a":"#ffcf5a"; ctx.fillRect(-s/2,-s/2,s,s);
      ctx.strokeStyle="rgba(10,12,16,0.9)"; ctx.lineWidth=1; ctx.strokeRect(-s/2,-s/2,s,s); ctx.restore(); }
    // CAS-454: directional arrow for player position
    const hx=mmox+G.hero.x*sx, hy=mmoy+G.hero.y*sy, fa=G.hero.facing, ar=5;
    ctx.save(); ctx.translate(hx,hy); ctx.rotate(fa);
    ctx.fillStyle=COL.textGold; ctx.beginPath(); ctx.moveTo(ar,0); ctx.lineTo(-ar*0.7,ar*0.6); ctx.lineTo(-ar*0.7,-ar*0.6); ctx.closePath(); ctx.fill();
    ctx.restore();   // héroe
    ctx.restore();   // CAS-466: clip del minimapa
    // CAS-466: botones de zoom [+]/[-]
    const bs=14, bx0=x+mw-bs-2;
    const mmBtns=[["mmZoomIn",y+2,"+"],["mmZoomOut",y+2+bs+3,"-"]];
    for(const [bid,by0,lbl] of mmBtns){
      ctx.fillStyle="rgba(12,14,19,0.85)"; ctx.fillRect(bx0,by0,bs,bs);
      ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(bx0,by0,bs,bs);
      ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.textAlign="center";
      ctx.fillText(lbl,bx0+bs/2,by0+bs-3);
      if(uiLayout.pubBtn) uiLayout.pubBtn(bid,bx0,by0,bs,bs);
    }
    if(mz>1){ ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.textAlign="left"; ctx.fillText("x"+mz,x+3,y+11); }
  }
  function renderBigMap(){ const mw=Math.min(VW*0.7,420), mh=mw; const x=(VW-mw)/2, y=(VH-mh)/2;
    panel(x-10,y-30,mw+20,mh+40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px "+FF; ctx.textAlign="center"; ctx.fillText("VALDORIA",VW/2,y-8);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass,STR.zoneForest],[world.caves,COL.stone,STR.zoneCaves],[world.arena,COL.sand,STR.zoneArena],[world.town,COL.cobble,STR.zoneTown],[world.ruins,COL.grass,STR.zoneRuins],[world.abyss,"#3a2350",STR.zoneAbyss],[world.frost,"#3a4e5e",STR.zoneFrost],[world.trial,"#c8a24a",STR.zoneTrial],[world.swamp,"#3f5a4c",STR.zoneSwamp]];
    for(const [r,c,nm] of zr){ if(!r) continue; ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy);
      ctx.fillStyle=COL.cream; ctx.font="9px "+FF; ctx.fillText(nm,x+(r.x+r.w/2)*TS*sx,y+(r.y+r.h/2)*TS*sy); }
    // CAS-114 — portal markers on the world map (violet diamonds)
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ if(p.stub) continue; ctx.fillRect(x+p.x*sx-2,y+p.y*sy-2,4,4); } }
    // CAS-2226: city POI markers (DARK — only when MINIMAP.enabled). Diamond + dark outline, with a
    // text label above when MINIMAP.labels. Same extensible blip source as the minimap (mapBlips()).
    if(MINIMAP.enabled){ ctx.lineWidth=1; for(const b of mapBlips()){ const bx=x+b.x*sx, by=y+b.y*sy;
      ctx.fillStyle=b.col; ctx.beginPath(); ctx.moveTo(bx,by-4); ctx.lineTo(bx+4,by); ctx.lineTo(bx,by+4); ctx.lineTo(bx-4,by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(10,12,16,0.85)"; ctx.stroke();
      if(MINIMAP.labels){ ctx.fillStyle=COL.cream; ctx.font="9px "+FF; ctx.textAlign="center"; ctx.fillText(b.label, bx, by-6); } } }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-3,y+G.hero.y*sy-3,6,6);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText("M / tap: cerrar",VW/2,y+mh+18);
  }

  function panel(x,y,w,h){ ctx.fillStyle="rgba(8,10,14,0.92)"; ctx.fillRect(0,0,VW,VH); ctx.fillStyle=COL.panel; ctx.fillRect(x,y,w,h);
    ctx.fillStyle=COL.panelB2; ctx.fillRect(x,y,w,6); ctx.fillRect(x,y+h-6,w,6); ctx.fillRect(x,y,6,h); ctx.fillRect(x+w-6,y,6,h);
    ctx.fillStyle=COL.panelB; ctx.fillRect(x+3,y+3,w-6,3); ctx.fillRect(x+3,y+h-6,w-6,3); }
  function panelLocal(x,y,w,h){ ctx.fillStyle=COL.panel; ctx.fillRect(x,y,w,h); ctx.fillStyle=COL.panelB2; ctx.fillRect(x,y,w,5); ctx.fillRect(x,y+h-5,w,5); ctx.fillRect(x,y,5,h); ctx.fillRect(x+w-5,y,5,h); }

  function renderDialogue(){ const d=G.dialog; if(!d) return;
    const bw=Math.min(VW*0.86,560), bh=120, x=(VW-bw)/2, y=VH-bh-30;
    ctx.fillStyle="rgba(8,10,14,0.55)"; ctx.fillRect(0,0,VW,VH);
    panelLocal(x,y,bw,bh);
    // CAS-112: portrait. Animated town NPCs (e.g. the merchant) have NO procedural
    // SP.rows entry — draw their idle frame via drawAnim, else the procedural sprite.
    const psp=SP[d.npc.sprite], pach=NPC_ANIM[d.npc.sprite];
    if(pach && IMG[pach+"_idle"] && IMG[pach+"_idle"].complete && IMG[pach+"_idle"].naturalWidth){
      const fi=frameIndex(pach,"idle",G.t,6,true); drawAnim(ctx,pach,"idle",fi, x+34, y+bh/2+ANIM[pach].fh.idle*0.32, 0.62, false, null);
    } else if(psp){ blit(ctx,psp.rows,psp.pal, x+34,y+bh/2, 4,false); }
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 15px "+FF; ctx.fillText(d.npc.name, x+70, y+28);
    ctx.fillStyle=COL.cream; ctx.font="14px "+FF; wrapText(d.lines[d.i],x+70,y+52,bw-90,18);
    ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; ctx.textAlign="right"; ctx.fillText("E / tap ▸ "+STR.dialogContinue, x+bw-14, y+bh-12);
  }
  function wrapText(txt,x,y,maxW,lh){ const words=txt.split(" "); let line="",yy=y; for(const w of words){ const t=line+w+" "; if(ctx.measureText(t).width>maxW){ ctx.fillText(line,x,yy); line=w+" "; yy+=lh;} else line=t; } ctx.fillText(line,x,yy); }

  // Compare arrow vs the piece currently equipped in this item's slot. Now factors
  // affixes in: a same-base-stat piece with stronger affixes still reads as an
  // upgrade. CAS-117 — score = resolved stat + a light affix weight.
  function affixScore(inst){ let s=0; for(const af of affixList(inst)) s+=af.amt; return s; }
  function cmpArrow(inst){ const eq=G.hero.equip[inst.slot]; const v=gearStat(inst)+affixScore(inst)*0.6, e=gearStat(eq)+affixScore(eq)*0.6;
    return v>e+0.5?{s:"▲",c:COL.heal}:(v<e-0.5?{s:"▼",c:"#d05555"}:{s:"=",c:COL.textDim}); }
  // One affix line, e.g. "+8% vel. ataque" in a soft cyan. CAS-117.
  function drawAffixLines(inst,ax,ay,lh){ const list=affixList(inst); ctx.font="10px "+FF; ctx.textAlign="left";
    for(let k=0;k<list.length;k++){ ctx.fillStyle="#9be7ff"; ctx.fillText("• "+affixLabel(list[k]), ax, ay+k*lh); } return list.length; }
  // CAS-1768: the equipped/candidate WEAPON's on-hit affix as a tinted glyph+name badge, anchored after the
  // item's headline. Only when the feature is enabled and the instance carries a resolved `wa` (weapons only);
  // absent/disabled ⇒ no draw ⇒ no layout change. $0 art (glyph + tint from config).
  function drawWeaponAffixTag(inst, ax, ay){ if(!WEAPON_AFFIXES.enabled) return; const id=inst&&inst.wa; if(!id) return;
    const def=WEAPON_AFFIXES.defs.find(d=>d.id===id); if(!def) return;
    ctx.textAlign="left"; ctx.font="bold 10px "+FF; ctx.fillStyle=def.tint||"#fff"; ctx.fillText(def.glyph+" "+def.name, ax, ay); }
  // A signed coloured delta token ("+12", "-3", "—"). CAS-117 equip-decision diff.
  function deltaTok(d){ if(!d) return {t:"—",c:COL.textDim}; return d>0?{t:"+"+d,c:COL.heal}:{t:""+d,c:"#d05555"}; }
  // CAS-1687: draw an instance's sockets as small pips — ◇ empty (dim) / ◆ filled (rune tint).
  // $0 art. Returns the count drawn. `sz` sets the glyph px; anchored left at (ax,ay) baseline.
  function drawSocketPips(inst, ax, ay, sz){ const sk=inst&&inst.sockets; if(!Array.isArray(sk)||!sk.length) return 0;
    ctx.textAlign="left"; ctx.font="bold "+(sz||9)+"px "+FF; let dx=ax;
    for(const s of sk){ const r=s&&s.type&&RUNES[s.type];
      if(r){ ctx.fillStyle=r.tint; ctx.fillText("◆", dx, ay); } else { ctx.fillStyle="#5a6472"; ctx.fillText("◇", dx, ay); }
      dx+=(sz||9)+1; }
    return sk.length; }
  // CAS-1687: one-line socket summary for the compare box (e.g. "Engarces: ◆Rubí ◇").
  function drawSocketLine(inst, ax, ay){ const sk=inst&&inst.sockets; if(!Array.isArray(sk)||!sk.length) return 0;
    ctx.textAlign="left"; ctx.font="10px "+FF; ctx.fillStyle=COL.textDim; ctx.fillText("Engarces:", ax, ay);
    let dx=ax+ctx.measureText("Engarces:").width+6;
    for(const s of sk){ const r=s&&s.type&&RUNES[s.type];
      if(r){ ctx.fillStyle=r.tint; ctx.fillText("◆", dx, ay); dx+=ctx.measureText("◆").width+1; }
      else { ctx.fillStyle="#5a6472"; ctx.fillText("◇", dx, ay); dx+=ctx.measureText("◇").width+2; } }
    return sk.length; }
  // CAS-417: one icon+count segment for the inventory footer (16px icon, glyph fallback
  // while the PNG loads); returns the x where the next segment starts.
  function invCount(key,glyph,txt,cx,by){ const im=IMG[key];
    if(im&&im.complete&&im.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false;
      ctx.drawImage(im,cx,by-12,16,16); ctx.restore();
      ctx.fillText(txt,cx+18,by); return cx+18+ctx.measureText(txt).width+14; }
    ctx.fillText(glyph+" "+txt,cx,by); return cx+ctx.measureText(glyph+" "+txt).width+14; }
  function renderInventory(){ const bw=Math.min(VW*0.9,560), bh=Math.min(VH*0.85,470), x=(VW-bw)/2, y=(VH-bh)/2; const h=G.hero;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText(STR.invTitle,VW/2,y+28);
    // ---- left: Tibia-style equip slots flanking the LIVE animated portrait ----
    // CAS-226. Only weapon/body/shield are functional (data-driven GEAR); the
    // other 7 slots are empty placeholders (no content/art yet) drawn dim. The
    // portrait shows the player's REAL class via the same baked per-state strip
    // (clshero_<cls>) the world renderer uses — animated idle, not a placeholder.
    const leftW=bw*0.50, SS=Math.min(40,Math.round(bh*0.085)), rgap=SS+19;
    ui.invSlotRects=[];
    // CAS-417: slots draw the real CAS-415 icon (icon_slot_<kind>, 32x32) — dimmed when
    // empty, full-strength as the ITEM icon when occupied (gear type == slot kind). The
    // old text glyph survives ONLY as fallback while/if the PNG hasn't loaded.
    function invSlot(sx,sy,ss,label,glyph,slotKey,iconKind){
      const inst=slotKey?h.equip[slotKey]:null;
      ctx.fillStyle="#10141b"; ctx.fillRect(sx,sy,ss,ss);
      ctx.strokeStyle=inst?gearCol(inst):"#3a4456"; ctx.lineWidth=inst?2:1; ctx.strokeRect(sx+0.5,sy+0.5,ss-1,ss-1);
      ctx.textAlign="center";
      const ic=iconKind?IMG["icon_slot_"+iconKind]:null;
      if(ic&&ic.complete&&ic.naturalWidth){ const ds=ss>=36?32:16; ctx.save(); ctx.imageSmoothingEnabled=false;
        ctx.globalAlpha=inst?1:0.42;
        ctx.drawImage(ic, Math.round(sx+(ss-ds)/2), Math.round(sy+(ss-ds)/2), ds,ds); ctx.restore(); }
      else if(inst){ ctx.fillStyle=gearCol(inst); ctx.font="bold "+Math.round(ss*0.5)+"px "+FF; ctx.fillText(glyph, sx+ss/2, sy+ss*0.64); }
      else { ctx.fillStyle="#3f4856"; ctx.font="bold "+Math.round(ss*0.44)+"px "+FF; ctx.fillText(glyph, sx+ss/2, sy+ss*0.62); }
      if(inst){ ctx.fillStyle=COL.cream; ctx.font="9px "+FF; ctx.textAlign="right"; ctx.fillText(String(gearStat(inst)), sx+ss-3, sy+ss-3);
        drawSocketPips(inst, sx+2, sy+9, 7); } // CAS-1687: sockets on the equipped piece (tap the slot to desengarzar)
      ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="8px "+FF; ctx.fillText(label, sx+ss/2, sy-3);
      ui.invSlotRects.push({x:sx,y:sy,w:ss,h:ss,slot:slotKey,inst:!!inst});
    }
    const sy0=y+78, lx=x+18, rrx=x+leftW-18-SS;
    const LCOL=[[STR.slotHead,"^",null,"head"],[STR.slotBody,"▣","body","body"],[STR.slotLegs,"Π",null,"legs"],[STR.slotFeet,"▾",null,"feet"]];
    const RCOL=[[STR.slotNeck,"◆",null,"neck"],[STR.slotBack,"≈",null,"back"],[STR.slotRing,"○",null,"ring"],[STR.slotBag,"▦",null,"bag"]];
    for(let i=0;i<LCOL.length;i++){ const s=LCOL[i]; invSlot(lx, sy0+i*rgap, SS, s[0], s[1], s[2], s[3]); }
    for(let i=0;i<RCOL.length;i++){ const s=RCOL[i]; invSlot(rrx, sy0+i*rgap, SS, s[0], s[1], s[2], s[3]); }
    // portrait between the columns — REAL class, animated idle (CAS-209 strip)
    const px=x+leftW/2, pTop=y+72, pW=Math.min(92,leftW-(SS*2)-72), pH=Math.min(150,Math.round(bh*0.34));
    ctx.fillStyle="#0d1117"; ctx.fillRect(px-pW/2,pTop,pW,pH);
    ctx.strokeStyle=COL.panelB; ctx.lineWidth=2; ctx.strokeRect(px-pW/2,pTop,pW,pH);
    const aimg=IMG["clshero_"+h.cls];
    if(aimg&&aimg.complete&&aimg.naturalWidth){
      const fitH=pH*0.84, fs=fitH/CLASS_FH, feetY=pTop+pH*0.93, fi=G.settings&&G.settings.reduceMotion?0:Math.floor(G.t*2.6)%CLASS_FC;
      ctx.save(); ctx.imageSmoothingEnabled=false;
      ctx.drawImage(aimg, fi*CLASS_FW,0,CLASS_FW,CLASS_FH, px-CLASS_AX*fs, feetY-CLASS_FOOT*fs, CLASS_FW*fs, CLASS_FH*fs);
      ctx.restore();
    } else { blit(ctx,SP.hero.rows,SP.hero.pal,px-18,pTop+pH*0.5-22,3,false); }
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 11px "+FF;
    ctx.fillText((STR.classes&&STR.classes[h.cls]?STR.classes[h.cls].name:h.cls), px, pTop+pH+13);
    // hands row below the portrait: Mano Izq (escudo) + Mano Der (arma)
    const hy=pTop+pH+22, hgap=10;
    invSlot(px-SS-hgap/2, hy, SS, STR.slotShield, "◈", "shield", "shield");
    invSlot(px+hgap/2,    hy, SS, STR.slotWeapon, "⚔", "weapon", "weapon");
    // ---- combat totals (folds every equipped affix) ----
    const af=affixTotals(h); const ty=y+bh-56;
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF;
    ctx.fillText(STR.statsDmg+": "+equippedDmg(h)+"   "+STR.statsDef+": "+equippedDef(h), x+18, ty);
    ctx.fillStyle=COL.cream; ctx.font="11px "+FF;
    ctx.fillText("♥ "+heroMaxHp(h)+(af.atkspd?"  ⚔+"+af.atkspd+"%":"")+(af.movespd?"  »+"+af.movespd+"%":"")+(af.onhit?"  ✦+"+af.onhit:""), x+18, ty+16);
    // CAS-417: potion counters lead with the real CAS-415 flask icons (glyph = load fallback)
    ctx.fillStyle=COL.cream; let ptx=x+18;
    ptx=invCount("icon_hud_potion_hp","♥","x"+h.potHP, ptx, ty+32);
    ptx=invCount("icon_hud_potion_mp","◆","x"+h.potMP, ptx, ty+32);
    ctx.fillText("✦ x"+h.blessings+"   ⚒ x"+(h.mats|0), ptx, ty+32);
    // CAS-237: open the Forja (forge equipment) panel — accessible from the inventory.
    const fbw=104, fbh=22, fbx=x+bw-fbw-16, fby=y+12;
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(fbx,fby,fbw,fbh); ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(fbx+0.5,fby+0.5,fbw-1,fbh-1);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.fillText(STR.invForge, fbx+fbw/2, fby+15);
    ui.invForgeRect={x:fbx,y:fby,w:fbw,h:fbh};
    // ---- right: backpack — CAS-1594 30-slot fixed grid + scroll ----
    const rx=x+bw*0.50, rw=bw*0.46;
    ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; ctx.textAlign="left"; ctx.fillText(STR.backpack, rx, y+54);
    ui.invRects=[];
    const bag=h.bag; if(G.invSel==null) G.invSel=0; G.invSel=Math.max(0,Math.min(G.invSel, Math.max(0,bag.length-1)));
    const cmpH=92;
    // Grid constants — 30 fixed slots in a 5-col grid
    const GCOLS=5, TOTAL_SLOTS=30;
    const GROWS=Math.ceil(TOTAL_SLOTS/GCOLS); // 6 rows
    const listY=y+62;
    const availH=bh-62-cmpH-20; // height budget for the grid
    const slotSz=Math.min(44, Math.floor((rw-4)/GCOLS)-2); // slot size (≤44px)
    const slotGap=2;
    const slotStep=slotSz+slotGap;
    const visRows=Math.max(1,Math.floor((availH+slotGap)/slotStep)); // visible rows at a time
    const maxScrollRow=Math.max(0, GROWS-visRows);
    if(G.invScrollRow==null) G.invScrollRow=0;
    G.invScrollRow=Math.max(0,Math.min(maxScrollRow, G.invScrollRow));
    // Ensure selected item stays in view
    if(G.invSel!=null){ const selRow=Math.floor(G.invSel/GCOLS);
      if(selRow<G.invScrollRow) G.invScrollRow=selRow;
      if(selRow>=G.invScrollRow+visRows) G.invScrollRow=selRow-visRows+1; }
    const gridW=GCOLS*slotStep-slotGap, gridH=visRows*slotStep-slotGap;
    const gx=rx+(rw-gridW)/2; // center grid horizontally in right panel
    // Draw grid slots
    ctx.save(); ctx.beginPath(); ctx.rect(gx-1,listY-1,gridW+2,gridH+2); ctx.clip();
    for(let si=0;si<TOTAL_SLOTS;si++){
      const row=Math.floor(si/GCOLS), col=si%GCOLS;
      const visR=row-G.invScrollRow; if(visR<0||visR>=visRows) continue;
      const sx=gx+col*slotStep, sy=listY+visR*slotStep;
      const inst=bag[si]||null; const sel=si===G.invSel;
      // slot background
      ctx.fillStyle=sel?(inst?"#2e3647":"#222a38"):(inst?"#1a2030":"#12161e");
      ctx.fillRect(sx,sy,slotSz,slotSz);
      ctx.strokeStyle=sel?COL.textGold:(inst?"#3a4456":"#222b38");
      ctx.lineWidth=sel?1.5:1; ctx.strokeRect(sx+0.5,sy+0.5,slotSz-1,slotSz-1);
      if(inst && inst.rune){
        // CAS-1687: a RUNE bag item — tinted ◆ glyph (no gearStat/affix pips); dblclick engarza.
        const r=RUNES[inst.rune]; ctx.textAlign="center"; ctx.fillStyle=(r&&r.tint)||"#c9a24a";
        ctx.font="bold "+Math.round(slotSz*0.6)+"px "+FF; ctx.fillText("◆", sx+slotSz/2, sy+slotSz*0.66);
      } else if(inst){
        const isz=Math.min(32,slotSz-4), ix=sx+(slotSz-isz)/2, iy=sy+(slotSz-isz)/2;
        const gi=IMG["icon_slot_"+inst.slot];
        if(gi&&gi.complete&&gi.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false; ctx.drawImage(gi,Math.round(ix),Math.round(iy),isz,isz); ctx.restore(); }
        else { ctx.textAlign="center"; ctx.fillStyle=gearCol(inst); ctx.font="bold "+Math.round(isz*0.7)+"px "+FF;
          ctx.fillText(({weapon:"⚔",body:"▣",shield:"◈",head:"^",legs:"Π",feet:"▾",neck:"◆",back:"≈",ring:"○",bag:"▦"}[inst.slot]||"▪"), sx+slotSz/2, sy+slotSz*0.68); }
        // rarity dot + affix pips
        ctx.fillStyle=gearCol(inst); ctx.font="7px "+FF; ctx.textAlign="right";
        ctx.fillText(String(gearStat(inst)), sx+slotSz-2, sy+slotSz-2);
        const na=affixList(inst).length; if(na){ ctx.fillStyle="#9be7ff"; ctx.font="7px "+FF; ctx.textAlign="left"; ctx.fillText("◈".repeat(na), sx+2, sy+slotSz-2); }
        // CAS-1687: socket pips top-left (◇ empty / ◆ rune-tinted filled)
        drawSocketPips(inst, sx+2, sy+9, 7);
      }
      // hit rect uses bag index (si); empty slots still register so DnD can target them later
      ui.invRects.push({x:sx,y:sy,w:slotSz,h:slotSz, idx:si});
    }
    ctx.restore();
    // Scroll indicator (only when content exceeds visible rows)
    if(maxScrollRow>0){
      const scrollH=gridH, trackX=gx+gridW+4, trackW=3;
      ctx.fillStyle="#1e2530"; ctx.fillRect(trackX,listY,trackW,scrollH);
      const thumbH=Math.max(12,scrollH*visRows/GROWS);
      const thumbY=listY+(scrollH-thumbH)*(G.invScrollRow/maxScrollRow);
      ctx.fillStyle=COL.textGold; ctx.fillRect(trackX,Math.round(thumbY),trackW,Math.round(thumbH));
    }
    // CAS-419: bag area rect for DnD drop-to-end
    ui.invBagAreaRect={x:gx,y:listY,w:gridW,h:gridH};
    // Store grid params for input scroll
    ui.invGrid={x:gx,y:listY,w:gridW,h:gridH,cols:GCOLS,slotStep,visRows,maxScrollRow};
    // ---- compare box: equipped vs selected (the equip DECISION). CAS-117 ----
    const cy=listY+gridH+6; const sel=bag[G.invSel];
    if(sel && sel.rune){
      // CAS-1687: a RUNE is selected — show a rune info card (name + bonus + engarza hint) instead
      // of the gear compare. No h.equip pollution (a rune has no slot). Dblclick engarza into a socket.
      ctx.fillStyle="#161b22"; ctx.fillRect(rx,cy,rw,cmpH); ctx.strokeStyle="#3a4456"; ctx.lineWidth=1; ctx.strokeRect(rx,cy,rw,cmpH);
      const r=RUNES[sel.rune]; ctx.textAlign="left"; ctx.font="bold 11px "+FF; ctx.fillStyle=(r&&r.tint)||COL.textGold;
      ctx.fillText("◆ "+(r?r.name:"Runa"), rx+6, cy+16);
      ctx.font="10px "+FF; ctx.fillStyle="#9be7ff"; ctx.fillText(r?r.label:"", rx+10, cy+32);
      ctx.fillStyle=COL.textDim; ctx.font="9px "+FF; ctx.fillText("Doble clic: engarzar en un hueco libre", rx+6, cy+cmpH-8);
    } else if(sel){ ctx.fillStyle="#161b22"; ctx.fillRect(rx,cy,rw,cmpH); ctx.strokeStyle="#3a4456"; ctx.lineWidth=1; ctx.strokeRect(rx,cy,rw,cmpH);
      const eq=h.equip[sel.slot];
      ctx.textAlign="left"; ctx.font="10px "+FF; ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpEquipped, rx+6, cy+13);
      ctx.fillStyle=gearCol(eq); const eqTxt=rarityMark(eq)+gearName(eq)+" ("+gearStat(eq)+")"; ctx.fillText(eqTxt, rx+6, cy+25);
      drawWeaponAffixTag(eq, rx+6+ctx.measureText(eqTxt).width+6, cy+25); // CAS-1768: on-hit affix badge (equipped)
      drawAffixLines(eq, rx+10, cy+36, 10);
      const midX=rx+rw*0.52;
      ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpNew, midX, cy+13);
      ctx.fillStyle=gearCol(sel); const selTxt="("+gearStat(sel)+")"; ctx.fillText(selTxt, midX, cy+25);
      drawWeaponAffixTag(sel, midX+ctx.measureText(selTxt).width+6, cy+25); // CAS-1768: on-hit affix badge (candidate in bag)
      drawAffixLines(sel, midX+4, cy+36, 10);
      drawSocketLine(eq, rx+6, cy+58); // CAS-1687: sockets on the EQUIPPED piece (engarce target)
      // net combat deltas if equipped (the tradeoff at a glance)
      const before={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const old=h.equip[sel.slot]; h.equip[sel.slot]=sel;
      const after={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const a2=affixTotals(h); h.equip[sel.slot]=old; const a1=affixTotals(h);
      const parts=[["Dmg",after.dmg-before.dmg],["Def",after.def-before.def],["HP",after.hp-before.hp],["AtkV%",a2.atkspd-a1.atkspd],["MovV%",a2.movespd-a1.movespd]];
      let dx=rx+6; ctx.font="bold 10px "+FF; const dyb=cy+cmpH-8;
      for(const [lbl,dv] of parts){ const tk=deltaTok(dv); const seg=lbl+" "; ctx.fillStyle=COL.textDim; ctx.fillText(seg,dx,dyb); dx+=ctx.measureText(seg).width;
        ctx.fillStyle=tk.c; ctx.fillText(tk.t+"  ",dx,dyb); dx+=ctx.measureText(tk.t+"  ").width; }
    }
    // ---- CAS-1654: SET summary — for each set with equipped pieces, show "name (x/3)" and mark
    // active tiers (2pz/3pz). Reuses the cyan affix-line style; $0 art. Read-live off setCounts. ----
    { const sc=setCounts(h); const setY=cy+cmpH+10; ctx.textAlign="left";
      let sn=0; for(const id of SET_ORDER){ const n=sc[id]|0; if(n<=0) continue; const s=SETS[id]; if(!s) continue;
        const ly=setY+sn*22; ctx.font="bold 10px "+FF; ctx.fillStyle="#9be7ff";
        ctx.fillText("◈ "+s.name+" ("+n+"/3)", rx+6, ly);
        // tier chips: bright when active (n>=2 / n>=3), dim otherwise
        ctx.font="9px "+FF;
        ctx.fillStyle=(n>=2)?"#7CFC9B":COL.textDim; ctx.fillText("2pz"+(n>=2?" ✓":""), rx+12, ly+11);
        ctx.fillStyle=(n>=3)?"#7CFC9B":COL.textDim; ctx.fillText("3pz"+(n>=3?" ✓":""), rx+62, ly+11);
        sn++; if(sn>=3) break; } }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.equipHint,VW/2,y+bh-6);
    // ---- CAS-419: DnD overlays — reject flash, target highlights, cursor ghost. ----
    // Pure presentation read from input state (ui.invDrag / ui.invReject) in the same
    // per-frame modal pass; zero RNG, zero state mutation (drops resolve in sim seams).
    const rej=ui.invReject;
    if(rej){ if(G.t<rej.until){ const rdx=Math.round(Math.sin(G.t*40)*3);
        ctx.strokeStyle="#d05555"; ctx.lineWidth=2; ctx.strokeRect(rej.x+rdx+0.5,rej.y+0.5,rej.w-1,rej.h-1); }
      else ui.invReject=null; }
    const drag=ui.invDrag;
    if(drag&&drag.active){ const item=drag.kind==="bag"?h.bag[drag.idx]:h.equip[drag.slot];
      if(item){ const pulse=0.55+0.35*Math.sin(G.t*8);
        if(drag.kind==="bag"){ // compatible equip slot(s) pulse gold; hovered row cues the swap
          for(const r of ui.invSlotRects){ if(r.slot===item.slot){ ctx.strokeStyle=COL.textGold; ctx.globalAlpha=pulse; ctx.lineWidth=2; ctx.strokeRect(r.x-1.5,r.y-1.5,r.w+3,r.h+3); ctx.globalAlpha=1; } }
          for(const r of ui.invRects){ if(r.idx!==drag.idx&&drag.x>=r.x&&drag.x<=r.x+r.w&&drag.y>=r.y&&drag.y<=r.y+r.h){ ctx.strokeStyle="#9be7ff"; ctx.lineWidth=1.5; ctx.strokeRect(r.x+0.5,r.y+0.5,r.w-1,r.h-1); } }
        } else { // equip-slot source → compatible bag rows pulse gold
          for(const r of ui.invRects){ const it=h.bag[r.idx]; if(it&&it.slot===drag.slot){ ctx.strokeStyle=COL.textGold; ctx.globalAlpha=pulse; ctx.lineWidth=1.5; ctx.strokeRect(r.x+0.5,r.y+0.5,r.w-1,r.h-1); ctx.globalAlpha=1; } }
        }
        ctx.save(); ctx.globalAlpha=0.85; ctx.imageSmoothingEnabled=false;
        const gi=IMG["icon_slot_"+item.slot]; const gs=28;
        if(gi&&gi.complete&&gi.naturalWidth) ctx.drawImage(gi, Math.round(drag.x-gs/2), Math.round(drag.y-gs/2), gs, gs);
        else { ctx.fillStyle=gearCol(item); ctx.font="bold 20px "+FF; ctx.textAlign="center"; ctx.fillText("▣", drag.x, drag.y+7); }
        ctx.fillStyle=gearCol(item); ctx.font="bold 11px "+FF; ctx.textAlign="center";
        ctx.fillText(gearName(item), drag.x, drag.y-gs/2-4);
        ctx.restore();
      }
    }
  }

  // CAS-119 — TALENT TREE panel. Tibia-style box: 3 branch columns (with connector
  // lines for prereqs), clickable nodes, a hover description, available-points
  // header, a respec button. State colours: ALLOCATED (green) > AVAILABLE (gold,
  // can spend) > LOCKED (dim). Hit-rects → ui.talentRects (read by input).
  function nodeState(h,node){ const r=nodeRank(h,node.id); if(r>=node.max && r>0) return "max";
    if(r>0) return "have"; if(canAllocTalent(h,node.id)) return "avail"; return "lock"; }
  function renderTalents(){ const h=G.hero; if(!h) return;
    const tree=TALENTS[h.cls]; if(!tree){ G.scene="play"; return; }
    const bw=Math.min(VW*0.94,660), bh=Math.min(VH*0.92,540), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF;
    ctx.fillText(STR.talentTitle+" — "+(STR.classes[h.cls]?STR.classes[h.cls].name:h.cls), VW/2, y+26);
    ctx.fillStyle=(h.talentPts>0)?COL.heal:COL.textDim; ctx.font="bold 13px "+FF;
    ctx.fillText(STR.talentPoints(h.talentPts|0)+(h.talentPts>0?"":"  ("+STR.talentNoPts+")"), VW/2, y+46);
    // CAS-1602: make the AXIS explicit — this is the per-RUN, level-keyed tree, NOT the
    // cross-run Esencia altar. Nivel actual shown so level-gated nodes read in context.
    ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
    ctx.fillText("Nivel "+(h.lvl|0)+"  ·  "+STR.talentAxis, VW/2, y+62);
    ui.talentRects=[];
    const nodes=tree.nodes; const nb=tree.branches.length;
    const colW=(bw-48)/nb, top=y+84, rowH=78, nh=54;
    const focusId=(function(){ const ns=talentNodes(h.cls); const i=G.talFocus||0; return ns[i]?ns[i].id:null; })();
    // branch headers
    for(let b=0;b<nb;b++){ const cx=x+24+colW*b+colW/2;
      ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.textAlign="center"; ctx.fillText(tree.branches[b], cx, top-8); }
    // Position each node by (branch, tier). When a tier holds MORE than one node
    // (an exclusive fork), spread the siblings horizontally so they don't overlap,
    // and shrink their width to fit the column. CAS-119.
    const cellCount={}; for(const n of nodes){ const k=n.br+":"+n.tier; cellCount[k]=(cellCount[k]||0)+1; }
    const cellIdx={}; const pos={}, sizeOf={};
    for(const n of nodes){ const k=n.br+":"+n.tier; const m=cellCount[k]; const idx=(cellIdx[k]=(cellIdx[k]||0)); cellIdx[k]++;
      const colLeft=x+24+colW*n.br; const cx=colLeft+colW*(idx+1)/(m+1); const cy=top+18+n.tier*rowH;
      pos[n.id]={cx,cy}; sizeOf[n.id]=Math.min((colW/m)-12, 168); }
    ctx.strokeStyle="#3a4456"; ctx.lineWidth=2;
    for(const n of nodes){ if(n.req&&pos[n.req]){ const a=pos[n.req], b2=pos[n.id];
      ctx.beginPath(); ctx.moveTo(a.cx,a.cy+nh/2); ctx.lineTo(b2.cx,b2.cy-nh/2); ctx.stroke(); } }
    // nodes
    let hover=null;
    for(let i=0;i<nodes.length;i++){ const n=nodes[i]; const p=pos[n.id]; const st=nodeState(h,n); const nw=sizeOf[n.id];
      const bx=p.cx-nw/2, by=p.cy-nh/2; const rank=nodeRank(h,n.id);
      const fill = st==="have"||st==="max" ? "#1d3324" : (st==="avail"? "#33301a" : "#181c22");
      const border = st==="max" ? COL.heal : (st==="have"? "#5fd66a" : (st==="avail"? COL.textGold : "#3a4456"));
      ctx.fillStyle=fill; ctx.fillRect(bx,by,nw,nh);
      ctx.strokeStyle=border; ctx.lineWidth=(n.id===focusId)?2.5:1.5; ctx.strokeRect(bx,by,nw,nh);
      // exclusive-fork marker
      if(n.excl){ ctx.fillStyle="#c77dff"; ctx.font="9px "+FF; ctx.textAlign="left"; ctx.fillText("◆", bx+4, by+12); }
      // CAS-1602: spell-empower node marker (★) — this node upgrades a class spell, not stats.
      if(n.empower){ ctx.fillStyle="#7fd6ff"; ctx.font="9px "+FF; ctx.textAlign="left"; ctx.fillText("★", bx+4, by+12); }
      ctx.textAlign="center"; ctx.fillStyle=(st==="lock")?COL.textDim:COL.cream; ctx.font=(nw<130?"bold 9px "+FF:"bold 11px "+FF);
      ctx.fillText(n.name, p.cx, by+22);
      ctx.fillStyle=(st==="max")?COL.heal:(st==="avail"?COL.textGold:COL.textDim); ctx.font="11px "+FF;
      ctx.fillText(STR.talentRank(rank,n.max), p.cx, by+40);
      // CAS-1598: level-gate label on nodes locked purely by hero level ("Nv 3").
      if(st==="lock"){ const lr=lockReason(h,n.id);
        if(lr&&lr.indexOf("level:")===0){ ctx.fillStyle="#d0a0a0"; ctx.font="bold 9px "+FF;
          ctx.fillText("Nv "+lr.slice(6), p.cx, by+51); } }
      ui.talentRects.push({x:bx,y:by,w:nw,h:nh, id:n.id, focus:i});
      if(ui.mouseX>=bx&&ui.mouseX<=bx+nw&&ui.mouseY>=by&&ui.mouseY<=by+nh) hover=n;
    }
    // description box (hovered, else keyboard-focused node)
    const dn = hover || talentNode(h.cls, focusId);
    const dy=y+bh-92, dbx=x+24, dbw=bw-48, dbh=52;
    panelLocal(dbx,dy,dbw,dbh);
    if(dn){ const st=nodeState(h,dn); ctx.textAlign="left";
      ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.fillText(dn.name+"  ["+STR.talentRank(nodeRank(h,dn.id),dn.max)+"]", dbx+10, dy+18);
      ctx.fillStyle=COL.cream; ctx.font="11px "+FF; ctx.fillText(dn.desc, dbx+10, dy+34);
      const lr=lockReason(h,dn.id); let hint="";
      // CAS-1602: level-gate reason ("level:N") → explicit "Requiere Nivel N".
      if(lr&&lr.indexOf("level:")===0) hint=STR.talentLevelReq(lr.slice(6));
      else if(lr==="req") hint=STR.talentLocked; else if(lr==="excl") hint=STR.talentExcl; else if(lr==="pts") hint=STR.talentNoPts; else if(lr==="max") hint="MÁX";
      if(hint){ ctx.fillStyle="#d0a0a0"; ctx.font="10px "+FF; ctx.fillText(hint, dbx+10, dy+48); }
    }
    // respec button + hint
    const rbw=210, rbh=26, rbx=VW/2-rbw/2, rby=y+bh-32;
    const canR=talentSpent(h)>0;
    ctx.fillStyle=canR?"#3a2c1e":"#23262c"; ctx.fillRect(rbx,rby,rbw,rbh);
    ctx.textAlign="center"; ctx.fillStyle=canR?COL.cream:COL.textDim; ctx.font="12px "+FF; ctx.fillText(STR.talentRespecBtn,VW/2,rby+17);
    ui.talentRects.push({x:rbx,y:rby,w:rbw,h:rbh, act:()=>sim.respecTalents()});
    ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText(STR.talentHint, VW/2, y+bh-6);
  }

  // CAS-150 — ELITE-MASTERY REWARD-TRACK panel. The cross-session hook made legible: a
  // vertical list of milestones (DESBLOQUEADO green / locked dim), a progress bar to the
  // next one, and the running elite-kill tally. Pure read-out (no spending) — opened with V
  // or the ✦ touch button. Mirrors the panel/panelLocal idiom of the talent/shop screens.
  function renderMastery(){ const h=G.hero; if(!h) return;
    const k=h.eliteKills|0; const track=sim.masteryTrack(k); const next=sim.masteryNextMilestone(k);
    const bw=Math.min(VW*0.92,560), bh=Math.min(VH*0.9,470), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF;
    ctx.fillText(STR.masteryTitle, VW/2, y+28);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.masteryPanelHint(k), VW/2, y+48);
    // progress bar toward the next milestone (or "complete")
    const pbx=x+30, pbw=bw-60, pby=y+60, pbh=14;
    ctx.fillStyle="#23262c"; ctx.fillRect(pbx,pby,pbw,pbh);
    if(next){ const prev=(function(){ let p=0; for(const m of track){ if(m.unlocked) p=m.at; } return p; })();
      const span=Math.max(1,next.at-prev); const frac=Math.max(0,Math.min(1,(k-prev)/span));
      ctx.fillStyle=COL.xpf; ctx.fillRect(pbx,pby,pbw*frac,pbh);
      ctx.fillStyle=COL.textGold; ctx.font="10px "+FF; ctx.textAlign="center";
      ctx.fillText(STR.masteryNextHint(Math.max(0,next.at-k), next.name), VW/2, pby+pbh+14);
    } else { ctx.fillStyle=COL.heal; ctx.fillRect(pbx,pby,pbw,pbh);
      ctx.fillStyle=COL.heal; ctx.font="10px "+FF; ctx.textAlign="center"; ctx.fillText(STR.masteryAllUnlocked, VW/2, pby+pbh+14); }
    // milestone rows
    const top=y+98, rowH=Math.min(78,(bh-130)/track.length);
    for(let i=0;i<track.length;i++){ const m=track[i]; const ry=top+i*rowH;
      const rx=x+24, rw=bw-48, rh=rowH-12;
      ctx.fillStyle=m.unlocked?"#1d3324":(m.isNext?"#33301a":"#181c22"); ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle=m.unlocked?COL.heal:(m.isNext?COL.textGold:"#3a4456"); ctx.lineWidth=m.isNext?2.5:1.5; ctx.strokeRect(rx,ry,rw,rh);
      // requirement badge (left)
      ctx.textAlign="left"; ctx.fillStyle=m.unlocked?COL.heal:COL.textDim; ctx.font="bold 11px "+FF;
      ctx.fillText((m.unlocked?"✦ ":"")+m.at+" élites", rx+10, ry+18);
      // name + desc
      ctx.fillStyle=m.unlocked?COL.cream:(m.isNext?COL.textGold:COL.textDim); ctx.font="bold 13px "+FF;
      ctx.fillText(m.name, rx+10, ry+38);
      ctx.fillStyle=m.unlocked?"#bfe6c4":COL.textDim; ctx.font="11px "+FF;
      ctx.fillText(m.desc, rx+10, ry+rh-8);
      // status chip (right)
      ctx.textAlign="right"; ctx.fillStyle=m.unlocked?COL.heal:(m.isNext?COL.textGold:COL.textDim); ctx.font="bold 11px "+FF;
      ctx.fillText(m.unlocked?"DESBLOQUEADO":(m.isNext?"PRÓXIMO":"BLOQUEADO"), rx+rw-10, ry+18);
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("V / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }

  // CAS-1751 — CÓDICE DE BOTÍN (Collection Log). A PURE VIEW over sim.codexSnap(): three sections
  // (Únicos / Conjuntos / Runas), each entry discovered (full-colour icon + name) or locked (dim
  // silhouette + "???"). Reuses the existing icon_slot_<slot> assets (0 new art); rune cells fall back
  // to the tinted ◆ glyph the sockets already use. Read-only — no game logic, no click rects (tap/ESC closes).
  function renderCodex(){ const snap=sim.codexSnap();
    const bw=Math.min(VW*0.92,600), bh=Math.min(VH*0.9,480), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText("Códice de Botín", VW/2, y+28);
    // accumulated bonus header — the payoff for collecting
    const b=snap.bonus;
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF;
    ctx.fillText("Bono del Códice:  +"+b.dmg+" daño   ·   +"+b.hp+" vida", VW/2, y+48);
    // three sections stacked; each a wrapped grid of icon cells
    const pad=24, cell=44, gap=10, labelH=13;
    let sy=y+72;
    for(const sec of snap.sections){
      // section header + progress
      ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF;
      ctx.fillText(sec.title, x+pad, sy);
      ctx.textAlign="right"; ctx.fillStyle= sec.found>=sec.total ? COL.heal : COL.textDim; ctx.font="bold 12px "+FF;
      ctx.fillText(sec.found+"/"+sec.total+(sec.found>=sec.total?"  ✦":""), x+bw-pad, sy);
      sy+=10;
      // cells
      const gx0=x+pad; const cols=Math.max(1,Math.floor((bw-2*pad+gap)/(cell+gap)));
      for(let i=0;i<sec.items.length;i++){ const it=sec.items[i];
        const cx=gx0+(i%cols)*(cell+gap); const cy=sy+Math.floor(i/cols)*(cell+labelH+gap+8);
        // cell frame
        ctx.fillStyle= it.found ? "#1c2230" : "#141821"; ctx.fillRect(cx,cy,cell,cell);
        ctx.strokeStyle= it.found ? (sec.key==="rune"? it.tint : COL.textGold) : "#2a3140"; ctx.lineWidth= it.found?2:1; ctx.strokeRect(cx+0.5,cy+0.5,cell-1,cell-1);
        if(it.found){
          if(sec.key==="rune"){ // rune → tinted ◆ glyph (mirrors the socket pips; 0 art)
            ctx.textAlign="center"; ctx.fillStyle=it.tint; ctx.font="bold "+Math.round(cell*0.55)+"px "+FF; ctx.fillText("◆", cx+cell/2, cy+cell*0.66);
          } else { const gi=IMG["icon_slot_"+it.slot];
            if(gi&&gi.complete&&gi.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false; ctx.drawImage(gi, cx+6, cy+6, cell-12, cell-12); ctx.restore(); }
            else { ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold "+Math.round(cell*0.5)+"px "+FF; ctx.fillText(GLY_SLOT[it.slot]||"◆", cx+cell/2, cy+cell*0.64); } }
          // name under the cell
          ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="9px "+FF;
          fitLabel(it.name, cx+cell/2, cy+cell+labelH-2, cell+gap-2);
        } else {
          // locked silhouette + "???"
          ctx.textAlign="center"; ctx.fillStyle="#39414f"; ctx.font="bold "+Math.round(cell*0.5)+"px "+FF; ctx.fillText("?", cx+cell/2, cy+cell*0.66);
          ctx.fillStyle=COL.textDim; ctx.font="9px "+FF; ctx.fillText("???", cx+cell/2, cy+cell+labelH-2);
        }
      }
      const rows=Math.ceil(sec.items.length/cols);
      sy += rows*(cell+labelH+gap+8) + 8;
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("K / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }
  // small helper: draw a label, shrinking the font once if it overflows the cell width (keeps names legible).
  function fitLabel(txt,cx,cy,maxW){ if(ctx.measureText(txt).width>maxW){ ctx.font="8px "+FF; if(ctx.measureText(txt).width>maxW){
      // hard clip with an ellipsis as a last resort
      let s=txt; while(s.length>2 && ctx.measureText(s+"…").width>maxW) s=s.slice(0,-1); txt=s+"…"; } }
    ctx.fillText(txt,cx,cy); }
  const GLY_SLOT={weapon:"⚔",body:"▣",shield:"◈"};

  // CAS-1758 — TÍTULOS DE GESTA (Feat Titles). A PURE VIEW over sim.titlesSnap(): a vertical list of every
  // title. Unlocked rows show the label + met condition and are TAPPABLE to equip (the equipped one is
  // highlighted); locked rows show "???" + the condition to earn it, with a live progress read (cur/n).
  // $0 art — text + existing glyphs/palette only. Writes ui.titleRects so input.titleTap can equip.
  function renderTitles(){ const snap=sim.titlesSnap();
    const bw=Math.min(VW*0.92,560), bh=Math.min(VH*0.9,480), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText("Títulos de Gesta", VW/2, y+28);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF;
    ctx.fillText("Desbloqueados  "+snap.unlocked+"/"+snap.total+"   ·   toca uno para lucirlo", VW/2, y+48);
    ui.titleRects=[];
    const pad=20, rowH=34, gap=5; let ry=y+64;
    for(const it of snap.items){
      const rx=x+pad, rw=bw-2*pad;
      // row frame — equipped highlighted, unlocked lit, locked dim
      ctx.fillStyle= it.equipped ? "#2a3320" : it.unlocked ? "#1c2230" : "#141821";
      ctx.fillRect(rx,ry,rw,rowH);
      ctx.strokeStyle= it.equipped ? COL.heal : it.unlocked ? COL.textGold : "#2a3140"; ctx.lineWidth= it.equipped?2: it.unlocked?1.5:1;
      ctx.strokeRect(rx+0.5,ry+0.5,rw-1,rowH-1);
      // glyph
      ctx.textAlign="center"; ctx.fillStyle= it.unlocked ? (it.equipped?COL.heal:COL.textGold) : "#39414f";
      ctx.font="bold 17px "+FF; ctx.fillText(it.unlocked?"◈":"?", rx+22, ry+rowH/2+6);
      // label + condition
      ctx.textAlign="left";
      if(it.unlocked){
        ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(it.label, rx+44, ry+15);
        ctx.fillStyle= it.equipped?COL.heal:COL.textDim; ctx.font="10px "+FF;
        ctx.fillText(it.equipped ? "Equipado ·  "+it.cond : it.cond, rx+44, ry+28);
      } else {
        ctx.fillStyle=COL.textDim; ctx.font="bold 13px "+FF; ctx.fillText("???", rx+44, ry+15);
        ctx.fillStyle="#5a6472"; ctx.font="10px "+FF; ctx.fillText(it.cond+"   ("+Math.min(it.cur,it.n)+"/"+it.n+")", rx+44, ry+28);
      }
      // only unlocked rows are hit-targets (locked can't be equipped)
      if(it.unlocked) ui.titleRects.push({x:rx,y:ry,w:rw,h:rowH,id:it.id,equipped:it.equipped});
      ry += rowH+gap;
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("Y / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }

  // CAS-1763 — PACTOS DE PODER (Power Pacts). A view over sim.pactsSnap(): one row per pact (name, current
  // rank/max, per-rank effect, heat contribution). Rows are INTERACTIVE — tap to +1 rank (wraps at max) so the
  // player builds their covenant here (writes ui.pactRects; input.pactTap drives sim.cyclePactRank). The footer
  // shows total Heat + the current reward multipliers (Esencia ×, botín ×). $0 art — text + ⚔/palette only.
  function renderPacts(){ const snap=sim.pactsSnap();
    const bw=Math.min(VW*0.92,560), bh=Math.min(VH*0.9,480), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText("Pactos de Poder", VW/2, y+28);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF;
    ctx.fillText("Sube el rango de un pacto para aumentar el Ardor y el botín · toca para +1", VW/2, y+48);
    ui.pactRects=[];
    // CAS-2080: the table grew 5→8; size the row STRIDE to fit N rows above the footer. On a normal viewport the
    // stride caps at 45 (rowH 40 + gap 5) ⇒ byte-identical to the pre-increment 5-row layout; it only compresses on
    // a short window so the extra rows never clip the footer.
    const pad=20, gap=5; let ry=y+64;
    const stride=Math.min(45, ((y+bh-40)-ry)/Math.max(1,snap.items.length));
    const rowH=Math.max(22, stride-gap);
    for(const it of snap.items){
      const rx=x+pad, rw=bw-2*pad; const active=it.rank>0;
      // row frame — active pacts lit gold, dormant dim
      ctx.fillStyle= active ? "#2f2418" : "#141821";
      ctx.fillRect(rx,ry,rw,rowH);
      ctx.strokeStyle= active ? COL.textGold : "#2a3140"; ctx.lineWidth= active?1.5:1;
      ctx.strokeRect(rx+0.5,ry+0.5,rw-1,rowH-1);
      // glyph
      ctx.textAlign="center"; ctx.fillStyle= active ? COL.textGold : "#39414f";
      ctx.font="bold 17px "+FF; ctx.fillText("⚔", rx+22, ry+rowH/2+6);
      // name + effect
      ctx.textAlign="left";
      ctx.fillStyle= active?COL.cream:COL.textDim; ctx.font="bold 13px "+FF; ctx.fillText(it.name, rx+44, ry+17);
      ctx.fillStyle= active?COL.textGold:"#5a6472"; ctx.font="10px "+FF; ctx.fillText(it.effect, rx+44, ry+31);
      // rank pips + heat (right side)
      ctx.textAlign="right";
      ctx.fillStyle= active?COL.cream:COL.textDim; ctx.font="bold 13px "+FF; ctx.fillText("Rango "+it.rank+"/"+it.max, rx+rw-14, ry+17);
      ctx.fillStyle= active?"#e0813f":"#5a6472"; ctx.font="10px "+FF; ctx.fillText(active?("Ardor +"+it.heatNow):("+"+it.heat+"/rango"), rx+rw-14, ry+31);
      ui.pactRects.push({x:rx,y:ry,w:rw,h:rowH,id:it.id});
      ry += stride;
    }
    // footer — total heat + live reward multipliers
    ctx.textAlign="center"; ctx.font="bold 12px "+FF;
    ctx.fillStyle= snap.heat>0 ? "#e0813f" : COL.textDim;
    ctx.fillText("Ardor total "+snap.heat+"   ·   Esencia ×"+snap.essMul.toFixed(2)+"   ·   Botín ×"+snap.dropMul.toFixed(2), VW/2, y+bh-26);
    ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("L / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }

  // CAS-1996 — CÓDICE DE COMBATE (Combat Codex). A PURE VIEW over COMBAT_CODEX_ENTRIES: the LIVE combat mechanics
  // (gate()===true) grouped Movimiento·Defensa·Ofensiva·Recursos·Jefes, each row "[tecla]  Etiqueta — descripción".
  // The key is resolved DATA-DRIVEN via entry.keyOf() → sim.keyLabel (never a hardcoded literal that could lie). $0 art —
  // text + MithraldaPixel + existing panel primitives only. Scrollable via G.ccScroll (clamped here). Read-only: 0 sim.
  const CC_GROUP_ORDER=["Movimiento","Defensa","Ofensiva","Recursos","Jefes"];
  function renderCombatCodex(){
    const bw=Math.min(VW*0.92,600), bh=Math.min(VH*0.9,500), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    const kdisp=sim.keyLabel(COMBAT_CODEX.codexKey);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText("Códice de Combate", VW/2, y+28);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText("Tus herramientas de combate · ↑/↓ desplazar · ["+kdisp+"] / ESC cerrar", VW/2, y+48);
    // build the flat, ordered line list (group header + one row per live entry)
    const live=COMBAT_CODEX_ENTRIES.filter(e=>{ try{ return !!e.gate(); }catch(_){ return false; } });
    const lines=[];
    for(const g of CC_GROUP_ORDER){ const rows=live.filter(e=>e.group===g); if(!rows.length) continue;
      lines.push({ h:true, text:g });
      for(const e of rows){ let raw; try{ raw=e.keyOf(); }catch(_){ raw="—"; } lines.push({ h:false, key:sim.keyLabel(raw), label:e.label, desc:e.desc }); } }
    // viewport geometry
    const pad=22, top=y+68, rowH=22, headH=20, botPad=16;
    const viewH=bh-(top-y)-botPad; const maxRows=Math.max(1,Math.floor(viewH/rowH));
    // total height in rows (headers count 1 row too) → clamp scroll
    const totalRows=lines.length; const maxScroll=Math.max(0,totalRows-maxRows);
    let sc=Math.min(Math.max(0,G.ccScroll||0),maxScroll); G.ccScroll=sc;   // write-back the clamp
    const keyX=x+pad, labX=x+pad+58, rightX=x+bw-pad;
    let ly=top;
    for(let i=sc;i<Math.min(lines.length,sc+maxRows);i++){ const ln=lines[i];
      if(ln.h){ ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF; ctx.fillText(ln.text, keyX, ly+headH-6); ly+=rowH; continue; }
      // key chip
      ctx.textAlign="left"; ctx.fillStyle=ln.key==="—"?COL.textDim:COL.cream; ctx.font="bold 12px "+FF; ctx.fillText("["+ln.key+"]", keyX, ly+15);
      // label + desc (desc dim, clipped to width)
      ctx.fillStyle=COL.cream; ctx.font="bold 12px "+FF; ctx.fillText(ln.label, labX, ly+15);
      const lw=ctx.measureText(ln.label).width;
      ctx.fillStyle=COL.textDim; ctx.font="11px "+FF;
      let desc=ln.desc; const availW=rightX-(labX+lw+10);
      if(ctx.measureText(desc).width>availW){ while(desc.length>4 && ctx.measureText(desc+"…").width>availW) desc=desc.slice(0,-1); desc+="…"; }
      ctx.fillText(desc, labX+lw+10, ly+15);
      ly+=rowH;
    }
    // scroll affordance
    if(maxScroll>0){ ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
      ctx.fillText((sc>0?"▲ ":"")+(sc<maxScroll?"▼":""), rightX, y+bh-8); }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("["+kdisp+"] / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }

  function renderShop(){ const items=sim.shopItems(); const bw=Math.min(VW*0.86,460), bh=Math.min(VH*0.82,420), x=(VW-bw)/2, y=(VH-bh)/2;
    const title=G.merchantShop?STR.merchantTitle:G.healShop?STR.npcLina:STR.shopTitle;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText(title,VW/2,y+30);
    ctx.fillStyle=COL.gold; ctx.font="bold 13px "+FF; ctx.fillText(STR.gold(G.hero.gold),VW/2,y+50);
    ui.shopRects=[]; const iy=y+72, ih=42;
    for(let i=0;i<items.length;i++){ const it=items[i]; const ry=iy+i*ih; const sel=i===G.shopSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-6);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-6); }
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText(it.name,x+34,ry+24);
      ctx.textAlign="right"; ctx.fillStyle=COL.gold; ctx.fillText(it.price+" oro",x+bw-34,ry+24);
      ui.shopRects.push({x:x+20,y:ry,w:bw-40,h:ih-6,act:()=>{G.shopSel=i; sim.buyItem(i);}});
    }
    // close
    const cy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,cy,120,24); ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("Cerrar (E)",VW/2,cy+17);
    ui.shopRects.push({x:x+bw/2-60,y:cy,w:120,h:24,act:()=>{G.scene="play";G.healShop=false;G.merchantShop=false;}});
  }

  // CAS-237 — FORJA panel. The equipment-progression sink: one clickable row per equipped
  // slot (arma/cuerpo/escudo) showing its forge level, resolved stat, and the next-level cost
  // (gold + mena). Forging routes through the sim authority (sim.forgeUpgrade); the panel is a
  // pure view (no game logic) — it only reads forgeState data + writes click rects. The stat
  // recomputes via gearStat the instant a level lands, so the increase is legible right here.
  function renderForge(){ const h=G.hero; if(!h) return;
    // pure view model built from the gear data helpers (no game logic here — forging routes
    // through sim.forgeUpgrade on click). Mirrors the sim.dev.forgeState() shape.
    const fs={ gold:h.gold, mats:h.mats|0, max:FORGE.max, slots:["weapon","body","shield"].map(slot=>{
      const inst=h.equip[slot]; const cost=inst?forgeNextCost(inst):null;
      return { slot, name:inst?gearName(inst):null, fl:inst?forgeLevel(inst):0, stat:inst?gearStat(inst):0, next:cost }; }) };
    const bw=Math.min(VW*0.86,470), bh=Math.min(VH*0.78,360), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText(STR.forgeTitle,VW/2,y+30);
    ctx.fillStyle=COL.gold; ctx.font="bold 13px "+FF; ctx.fillText(STR.forgeHave(fs.gold, fs.mats),VW/2,y+50);
    ui.forgeRects=[]; if(G.forgeSel==null) G.forgeSel=0; G.forgeSel=Math.max(0,Math.min(2,G.forgeSel|0));
    const GLY={weapon:"⚔",body:"▣",shield:"◈"}, SLBL={weapon:STR.slotWeapon,body:STR.slotBody,shield:STR.slotShield};
    const iy=y+70, ih=70;
    for(let i=0;i<fs.slots.length;i++){ const s=fs.slots[i]; const ry=iy+i*ih; const sel=i===G.forgeSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-10);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-10); }
      // CAS-417: slot icon (CAS-415) heads the row; glyph text = load fallback only
      const fic=IMG["icon_slot_"+s.slot];
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 15px "+FF;
      if(fic&&fic.complete&&fic.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false;
        ctx.drawImage(fic, x+32, ry+9, 16,16); ctx.restore(); ctx.fillText(SLBL[s.slot], x+54, ry+22); }
      else ctx.fillText(GLY[s.slot]+" "+SLBL[s.slot], x+34, ry+22);
      if(s.name){
        // current forge level + resolved stat
        ctx.fillStyle=COL.cream; ctx.font="12px "+FF;
        ctx.fillText(s.name+"  "+STR.forgeLvl(s.fl, fs.max), x+34, ry+40);
        ctx.fillStyle=COL.textGold; ctx.fillText((s.slot==="weapon"?STR.statsDmg:STR.statsDef)+": "+s.stat, x+34, ry+57);
        // right side: next-level cost or MÁX tag + a forge button
        if(s.next){
          ctx.textAlign="right"; ctx.fillStyle=COL.gold; ctx.font="12px "+FF; ctx.fillText(STR.forgeNeed(s.next.gold, s.next.mats), x+bw-110, ry+30);
          const can=fs.gold>=s.next.gold && fs.mats>=s.next.mats;
          const bx=x+bw-104, by=ry+12, bbw=80, bbh=30;
          ctx.fillStyle=can?"#3a2c1e":"#23262c"; ctx.fillRect(bx,by,bbw,bbh);
          ctx.strokeStyle=can?COL.textGold:"#3a4456"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bbw-1,bbh-1);
          ctx.textAlign="center"; ctx.fillStyle=can?COL.textGold:COL.textDim; ctx.font="bold 13px "+FF; ctx.fillText(STR.forgeBtn, bx+bbw/2, by+20);
          ui.forgeRects.unshift({x:bx,y:by,w:bbw,h:bbh,slot:s.slot,act:()=>{ G.forgeSel=i; return sim.forgeUpgrade(s.slot); }}); // button to FRONT of scan → wins the tap over its row rect (returns ok → CAS-279 forge telemetry in forgeTap)
        } else {
          ctx.textAlign="right"; ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText(STR.forgeMaxTag, x+bw-40, ry+34);
        }
      } else { ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; ctx.fillText(STR.forgeEmpty, x+34, ry+44); }
      // full-row select rect (keyboard/tap focus); pushed to the BACK so a button tap on the same row wins first
      ui.forgeRects.push({x:x+20,y:ry,w:bw-40,h:ih-10, sel:i});
    }
    const cy=y+bh-28; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,cy,120,22);
    ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText("Cerrar (G)",VW/2,cy+15);
    ui.forgeRects.push({x:x+bw/2-60,y:cy,w:120,h:22,act:()=>{G.scene="play";}});
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.forgeHint,VW/2,y+bh-8);
  }

  // CAS-134: the Bounty Board — today's daily contracts (progress + claim) and the login
  // streak (+ today's reward + claim), plus a live reset countdown. Pure view: reads the
  // daily.board() view model and writes tap rects into ui.bountyRects; the claim action is
  // the only state change and routes through daily.claim()/claimStreak() (the sim seam).
  function fmtCountdown(ms){ const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
    return (h<10?"0":"")+h+":"+(m<10?"0":"")+m+":"+(ss<10?"0":"")+ss; }
  function renderBounty(){ const b=daily.board(); ui.bountyRects=[];
    // CAS-2295: con SANCTUARY_OATH.enabled el panel crece 76px para alojar la fila de Órdenes bajo los contratos (gated ⇒ OFF el alto
    // y todo el layout quedan byte-idénticos a HEAD).
    const bw=Math.min(VW*0.9,500), bh=Math.min(VH*0.9,470)+(SANCTUARY_OATH.enabled?76:0)+(SANCTUARY_LEDGER.enabled?46:0)+(ORDER_STANDINGS.enabled?58:0)+(FELLOWSHIP_BOND.enabled?56:0)+(MENTOR_BOND.enabled?58:0)+(SOUL_RECOVERY.enabled?58:0), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText(STR.bountyTitle,VW/2,y+28);
    if(!b){ ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("—",VW/2,y+60); return; }
    // reset countdown (top-right of the panel)
    ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.bountyResetIn(fmtCountdown(b.resetMs)), x+bw-16, y+24);
    // gold readout (top-left)
    ctx.textAlign="left"; ctx.fillStyle=COL.gold; ctx.font="bold 12px "+FF; ctx.fillText(STR.gold(G.hero.gold), x+16, y+24);

    // ----- streak banner (CAS-243: escalating return hook — today's reward, tomorrow's preview) -----
    const sy=y+40, sh=58;
    ctx.fillStyle="#241d12"; ctx.fillRect(x+16,sy,bw-32,sh);
    ctx.fillStyle=COL.panelB; ctx.fillRect(x+16,sy,bw-32,3);
    const sr=b.streak.reward, snx=b.streak.next;
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText(STR.bountyStreak(b.streak.n), x+28, sy+18);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.bountyStreakReward(sr.gold, sr.mena)+(sr.potHP?" · +poción":""), x+28, sy+35);
    // tomorrow's escalating reward preview (the "come back" hook) — or milestone/comeback flag
    ctx.font="11px "+FF;
    if(sr.milestone){ ctx.fillStyle=COL.heal; ctx.fillText(STR.bountyStreakMilestone, x+28, sy+51); }
    else if(b.streak.comeback){ ctx.fillStyle=COL.textGold; ctx.fillText(STR.bountyComeback, x+28, sy+51); }
    else { ctx.fillStyle=COL.textDim; ctx.fillText(STR.bountyStreakNext(snx.gold, snx.mena)+(snx.potHP?" · +poción":""), x+28, sy+51); }
    // streak claim chip
    drawClaimChip(x+bw-128, sy+17, 100, 24, b.streak.claimable, !b.streak.claimable,
      ()=>{ daily.claimStreak(); }, b.streak.claimable?STR.bountyClaim:STR.bountyClaimed);

    // ----- contracts -----
    let cy=sy+sh+14; ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.bountyContracts, x+20, cy); cy+=8;
    const ih=78;
    for(let i=0;i<b.contracts.length;i++){ const c=b.contracts[i]; const ry=cy+i*ih; const sel=i===(G.bountySel||0);
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-10);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-10); }
      // title + reward
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(c.title, x+34, ry+22);
      ctx.fillStyle=COL.gold; ctx.font="12px "+FF; ctx.fillText(STR.bountyReward(c.gold,c.xp), x+34, ry+58);
      // progress bar
      const pbx=x+34, pbw=bw-200, pby=ry+32, pbh=10, f=c.need>0?Math.min(1,c.prog/c.need):0;
      ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
      ctx.fillStyle=c.done?COL.heal:COL.textGold; ctx.fillRect(pbx,pby,pbw*f,pbh);
      ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
      ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(c.prog+"/"+c.need, pbx+pbw+8, pby+9);
      // claim chip (right)
      const canClaim=c.done && !c.claimed;
      drawClaimChip(x+bw-128, ry+ (ih-10)/2-12, 100, 24, canClaim, c.claimed,
        ()=>{ G.bountySel=i; daily.claim(c.id); }, c.claimed?STR.bountyClaimed:STR.bountyClaim);
      // whole-row select (tap) — claim handled by the chip's own rect (pushed last = wins)
      ui.bountyRects.push({x:x+20,y:ry,w:bw-40,h:ih-10,act:()=>{ G.bountySel=i; }});
    }
    // CAS-2295: JURAMENTO DEL SANTUARIO — fila de Órdenes (elección desde la UI YA existente del Tablón; 0 hotkey nuevo — desktop
    // click + móvil tap por el MISMO ui.bountyRects/bountyTap, SIN tocar input.js). Gated ⇒ OFF nada se dibuja/empuja ⇒ escena
    // `bounty` byte-idéntica a HEAD (el bh ya se amplió arriba bajo el mismo gate).
    if(SANCTUARY_OATH.enabled) renderOathRow(x,y,bw,bh);
    // CAS-2300: LIBRO DE LA ORDEN — fila del marcador COLECTIVO semanal de la orden del héroe (SOLO lectura: barra de progreso +
    // estado de racha; sin hotkey, sin tap-rect nuevo). Gated ⇒ OFF nada se dibuja (el bh no creció) ⇒ escena byte-idéntica a HEAD.
    if(SANCTUARY_LEDGER.enabled) renderLedgerRow(x,y,bw,bh);
    // CAS-2305: CLASIFICACIÓN DE ÓRDENES — fila del ranking SEMANAL COMPARTIDO de las 3 Órdenes (SOLO lectura: podio + líder + pasivo;
    // sin hotkey, sin tap-rect nuevo). Se sitúa SOBRE la fila del Libro. Gated ⇒ OFF nada se dibuja (el bh no creció) ⇒ escena byte-id.
    if(ORDER_STANDINGS.enabled) renderStandingsRow(x,y,bw,bh);
    // CAS-2316: COMPAÑEROS DE RUTA — fila de la HERMANDAD semanal del héroe (SOLO lectura: banda de compañeros + barra de vínculo/tier + pasivo;
    // sin hotkey, sin tap-rect nuevo). Se sitúa SOBRE la fila de la Clasificación. Gated ⇒ OFF nada se dibuja (el bh no creció) ⇒ escena byte-id.
    if(FELLOWSHIP_BOND.enabled) renderFellowshipRow(x,y,bw,bh);
    // CAS-2322: VÍNCULO DE MENTOR — fila de la relación veterano↔novato del héroe (SOLO lectura: compañero asignado + rol + barra de dwell/tier +
    // boost del protégé; sin hotkey, sin tap-rect nuevo). Se sitúa SOBRE la fila de la Hermandad. Gated ⇒ OFF nada se dibuja (el bh no creció) ⇒ escena byte-id.
    if(MENTOR_BOND.enabled) renderMentorRow(x,y,bw,bh);
    // CAS-2325: VESTIGIO DEL CAÍDO — fila del vestigio ambiental + rol/dwell/pasivo del héroe (SOLO lectura: caído + zona + barra de dwell +
    // estado recuperado/buff; sin hotkey, sin tap-rect nuevo). Se sitúa SOBRE la fila del Vínculo de Mentor. Gated ⇒ OFF nada se dibuja (el bh no creció) ⇒ escena byte-id.
    if(SOUL_RECOVERY.enabled) renderSoulRow(x,y,bw,bh);
    // close
    const ccy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,ccy,120,24);
    ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("Cerrar (E)",VW/2,ccy+17);
    ui.bountyRects.push({x:x+bw/2-60,y:ccy,w:120,h:24,act:()=>{ G.scene="play"; }});
  }
  // CAS-2295: JURAMENTO DEL SANTUARIO — dibuja la fila de las 3 Órdenes como chips tappables (elección de afiliación desde la UI ya
  // existente del Tablón). Cada chip empuja un rect en ui.bountyRects ⇒ el MISMO handler de tap (input.js bountyTap) lo despacha en
  // desktop (click) y móvil (tap), sin hotkey nuevo ni cambio en input.js. La acción pasa por sim.tryPledgeOath (el ÚNICO chokepoint;
  // valida gate de rango + cooldown). Gate de rango DERIVADO puro (misma aritmética que sanctuaryRank; 0 sim/RNG). Sólo se invoca
  // bajo SANCTUARY_OATH.enabled ⇒ OFF nunca corre ⇒ escena byte-idéntica.
  function renderOathRow(x,y,bw,bh){
    const h=G.hero; if(!h) return;
    const oy=y+bh-30-70;                                                   // franja sobre el botón Cerrar (en el alto extra del panel)
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF;
    const sworn0=oathTagOf(h);
    ctx.fillText("Órdenes del Santuario"+(sworn0?"  ·  Jurado: "+sworn0:""), x+20, oy);
    const O=SANCTUARY_OATH.orders||[]; const n=Math.max(1,O.length);
    const gap=8, cw=(bw-40-gap*(n-1))/n, ch=52, cyy=oy+8;
    // gate de rango (reusa SANCTUARY_REP): índice del rango actual vs el índice del minRank exigido
    const ranks=SANCTUARY_REP.ranks||[]; const rankIdxOf=id=>{ for(let i=0;i<ranks.length;i++){ if(ranks[i].id===id) return i; } return 1e9; };
    const rep=Math.max(0,h.sanctuaryRep|0); let curIdx=0; for(let i=0;i<ranks.length;i++){ if(rep>=(ranks[i].at|0)) curIdx=i; }
    const rankOk = !SANCTUARY_REP.enabled || curIdx>=rankIdxOf(SANCTUARY_OATH.minRank||"neutral");
    for(let i=0;i<O.length;i++){ const o=O[i]; const cx=x+20+i*(cw+gap); const sworn=h.sanctuaryOath===o.id;
      ctx.fillStyle=sworn?"#233a30":"#20262f"; ctx.fillRect(cx,cyy,cw,ch);
      ctx.strokeStyle=sworn?"#8fe0b0":(rankOk?"#3a4150":"#2a2f38"); ctx.lineWidth=sworn?2:1; ctx.strokeRect(cx+0.5,cyy+0.5,cw,ch);
      ctx.textAlign="center";
      ctx.fillStyle=rankOk||sworn?COL.cream:COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText(o.name, cx+cw/2, cyy+17);
      ctx.fillStyle=rankOk||sworn?"#9fd0c0":COL.textDim; ctx.font="10px "+FF; ctx.fillText(o.desc, cx+cw/2, cyy+33);
      ctx.fillStyle=sworn?"#8fe0b0":(rankOk?COL.textGold:COL.textDim); ctx.font="bold 10px "+FF;
      ctx.fillText(sworn?"✓ Jurado":(rankOk?"Jurar":("Req. "+((ranks[rankIdxOf(SANCTUARY_OATH.minRank||"neutral")]||{}).name||"—"))), cx+cw/2, cyy+48);
      if(rankOk && !sworn) ui.bountyRects.push({x:cx,y:cyy,w:cw,h:ch,act:()=>{ sim.tryPledgeOath(o.id); }});   // sólo tappable si desbloqueada y no jurada
    }
    ctx.textAlign="left";
  }
  // CAS-2300: LIBRO DE LA ORDEN — dibuja el marcador COLECTIVO semanal de la orden del héroe: título + barra de progreso (total/goal)
  // + estado de racha. Estado AUTORITATIVO del sim (sim.sanctuaryLedger; 0 duplicación de lógica, 0 sim/RNG desde render). SOLO lectura
  // (no empuja tap-rects, no hotkey — la contribución es actividad ya existente). Se sitúa SOBRE la fila de Órdenes (o sobre Cerrar si
  // el Juramento está OFF). Sólo se invoca bajo SANCTUARY_LEDGER.enabled ⇒ OFF nunca corre ⇒ escena byte-idéntica.
  function renderLedgerRow(x,y,bw,bh){
    const v=sim.sanctuaryLedger(G.hero); if(!v) return;
    const ly=y+bh-30-(SANCTUARY_OATH.enabled?76:0)-40;                     // franja sobre la fila de Órdenes (o sobre Cerrar sin Juramento)
    ctx.textAlign="left"; ctx.font="11px "+FF;
    ctx.fillStyle=v.unlocked?"#ffcf5c":COL.textDim;
    const head="Libro de la Orden"+(v.order?("  ·  "+(v.orderName||v.order)):"  ·  (jura una Orden)");
    ctx.fillText(head, x+20, ly);
    if(v.unlocked){ ctx.textAlign="right"; ctx.fillStyle="#ffcf5c"; ctx.font="bold 11px "+FF; ctx.fillText("★ EN RACHA", x+bw-20, ly); ctx.textAlign="left"; }
    // barra colectiva total/goal
    const pbx=x+20, pbw=bw-40, pby=ly+8, pbh=12, f=Math.max(0,Math.min(1,v.frac));
    ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
    ctx.fillStyle=v.unlocked?COL.heal:"#c9a24a"; ctx.fillRect(pbx,pby,pbw*f,pbh);
    ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
    ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.textAlign="center";
    ctx.fillText(v.total+" / "+v.goal+" pts"+(v.contribution>0?("   (tú +"+v.contribution+")"):""), x+bw/2, pby+pbh+12);
    ctx.textAlign="left";
  }
  // CAS-2305: CLASIFICACIÓN DE ÓRDENES — dibuja el ranking SEMANAL COMPARTIDO de las 3 Órdenes como un podio de chips: puesto + nombre
  // + total colectivo, con el LÍDER resaltado en ámbar (♛) y la orden del héroe marcada. Estado AUTORITATIVO del sim (sim.orderStandings;
  // 0 duplicación de lógica, 0 sim/RNG desde render — el ranking es idéntico en todo cliente ⇒ capa social MMO). SOLO lectura (no empuja
  // tap-rects, no hotkey). Se sitúa SOBRE la fila del Libro. Sólo se invoca bajo ORDER_STANDINGS.enabled ⇒ OFF nunca corre ⇒ byte-id.
  function renderStandingsRow(x,y,bw,bh){
    const v=sim.orderStandings(G.hero); if(!v) return;
    const sy=y+bh-30-(SANCTUARY_OATH.enabled?76:0)-(SANCTUARY_LEDGER.enabled?46:0)-52;   // franja sobre la fila del Libro
    ctx.textAlign="left"; ctx.font="11px "+FF; ctx.fillStyle="#ffcf5c";
    ctx.fillText("Clasificación de Órdenes", x+20, sy);
    if(v.mineLeading){ ctx.textAlign="right"; ctx.fillStyle="#ffc16a"; ctx.font="bold 11px "+FF;
      ctx.fillText("♛ Tu Orden lidera: +"+Math.round(v.leadValue*100)+"% Descanso", x+bw-20, sy); ctx.textAlign="left"; }
    // podio: una fila de 3 chips (uno por orden, en orden de puesto)
    const arr=(v.order||[]).slice().sort((a,b)=>a.rank-b.rank);
    const n=Math.max(1,arr.length), gap=8, cw=(bw-40-gap*(n-1))/n, ch=34, cyy=sy+8;
    for(let i=0;i<arr.length;i++){ const o=arr[i]; const cx=x+20+i*(cw+gap);
      ctx.fillStyle=o.isLeader?"#3a3016":(o.isMine?"#20302a":"#20262f"); ctx.fillRect(cx,cyy,cw,ch);
      ctx.strokeStyle=o.isLeader?"#ffc16a":(o.isMine?"#8fe0b0":"#3a4150"); ctx.lineWidth=o.isLeader?2:1; ctx.strokeRect(cx+0.5,cyy+0.5,cw,ch);
      ctx.textAlign="left"; ctx.fillStyle=o.isLeader?"#ffcf5c":COL.textGold; ctx.font="bold 12px "+FF;
      ctx.fillText((o.isLeader?"♛ ":(o.rank+". "))+(o.tag||o.name), cx+8, cyy+15);
      ctx.fillStyle=o.isMine?"#9fd0c0":COL.textDim; ctx.font="10px "+FF;
      ctx.fillText(o.total+" pts"+(o.isMine?"  · tú":""), cx+8, cyy+29);
    }
    ctx.textAlign="left";
  }
  // CAS-2316: COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP — dibuja la HERMANDAD semanal del héroe: título + banda de compañeros (nombres, capa
  // social COMPARTIDA — misma banda para todo cliente con el mismo reloj) + barra de VÍNCULO (bond hacia el próximo tier) + el tier/pasivo.
  // Estado AUTORITATIVO del sim (sim.wayfarerFellowship; 0 duplicación de lógica, 0 sim/RNG desde render). SOLO lectura (no empuja tap-rects,
  // no hotkey — el vínculo es actividad ya existente). Se sitúa SOBRE la fila de la Clasificación. Sólo se invoca bajo FELLOWSHIP_BOND.enabled ⇒ OFF byte-id.
  function renderFellowshipRow(x,y,bw,bh){
    const v=sim.wayfarerFellowship(G.hero); if(!v) return;
    const fy=y+bh-30-(SANCTUARY_OATH.enabled?76:0)-(SANCTUARY_LEDGER.enabled?46:0)-(ORDER_STANDINGS.enabled?58:0)-50;   // franja sobre la fila de la Clasificación
    ctx.textAlign="left"; ctx.font="11px "+FF; ctx.fillStyle=v.forged?"#7fe6d8":COL.textDim;
    const band=(v.band||[]).map(c=>c.name).join(", ");
    ctx.fillText("Compañeros de Ruta"+(band?("  ·  "+band):"  ·  (en camino)"), x+20, fy);
    if(v.forged){ ctx.textAlign="right"; ctx.fillStyle="#7fe6d8"; ctx.font="bold 11px "+FF;
      ctx.fillText("∞ "+v.tierName+": +"+Math.round(v.bondValue*100)+"% XP", x+bw-20, fy); ctx.textAlign="left"; }
    // barra de vínculo (bond hacia el próximo tier; si ya es el máximo, llena)
    const pbx=x+20, pbw=bw-40, pby=fy+8, pbh=12;
    const nextAt=(v.nextAt!=null)?v.nextAt:Math.max(1,v.bond), f=Math.max(0,Math.min(1,nextAt>0?(v.bond/nextAt):1));
    ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
    ctx.fillStyle=v.forged?"#5fd0c0":"#3a8f86"; ctx.fillRect(pbx,pby,pbw*f,pbh);
    ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
    ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.textAlign="center";
    const tail=(v.nextTierName!=null)?("vínculo "+v.bond+" / "+v.nextAt+" → "+v.nextTierName):("vínculo "+v.bond+"  ·  "+v.tierName+" (máx)");
    ctx.fillText(tail, x+bw/2, pby+pbh+12);
    ctx.textAlign="left";
  }
  // CAS-2322: VÍNCULO DE MENTOR / MENTORSHIP BOND — dibuja la relación asimétrica del héroe: compañero asignado esta semana (nombre + nivel, capa
  // social COMPARTIDA — mismo compañero para todo cliente con el mismo reloj) + el ROL (Mentor/Protégé por gap de nivel) + barra de DWELL de co-presencia
  // hacia el próximo hito + el boost del protégé. Estado AUTORITATIVO del sim (sim.mentorshipBond; 0 duplicación de lógica, 0 sim/RNG desde render).
  // SOLO lectura (no empuja tap-rects, no hotkey). Se sitúa SOBRE la fila de la Hermandad. Sólo se invoca bajo MENTOR_BOND.enabled ⇒ OFF byte-id.
  function renderMentorRow(x,y,bw,bh){
    const v=sim.mentorshipBond(G.hero); if(!v) return;
    const my=y+bh-30-(SANCTUARY_OATH.enabled?76:0)-(SANCTUARY_LEDGER.enabled?46:0)-(ORDER_STANDINGS.enabled?58:0)-(FELLOWSHIP_BOND.enabled?56:0)-50;   // franja sobre la fila de la Hermandad
    const isMentor=v.role==="mentor", isProt=v.role==="protege", roleCol=isMentor?"#e8c877":(isProt?"#c8b3ff":COL.textDim);
    ctx.textAlign="left"; ctx.font="11px "+FF; ctx.fillStyle=v.bound?roleCol:COL.textDim;
    const pName=v.partner?(v.partner.name+" (Nv."+v.partner.lvl+")"):"(sin compañero)";
    const roleLbl=isMentor?("⚜ "+v.mentorTitle):(isProt?("✦ "+v.protegeTitle):"·");
    ctx.fillText("Vínculo de Mentor  ·  "+pName, x+20, my);
    ctx.textAlign="right"; ctx.font="bold 11px "+FF; ctx.fillStyle=v.bound?roleCol:COL.textDim;
    ctx.fillText(v.bound?(roleLbl+(isProt&&v.boost>0?("  +"+Math.round(v.boost*100)+"% XP"):"")):(v.role==="none"?"(gap < "+v.gapThreshold+")":roleLbl+" (sin ligar)"), x+bw-20, my);
    ctx.textAlign="left";
    // barra de DWELL (co-presencia hacia el próximo hito; si ya es el máximo, llena)
    const pbx=x+20, pbw=bw-40, pby=my+8, pbh=12;
    const nextAt=(v.nextAt!=null)?v.nextAt:Math.max(1,v.dwell), f=Math.max(0,Math.min(1,nextAt>0?(v.dwell/nextAt):1));
    ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
    ctx.fillStyle=v.bound?(isMentor?"#c79a3a":"#7d63c0"):"#3a4150"; ctx.fillRect(pbx,pby,pbw*f,pbh);
    ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
    ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.textAlign="center";
    const tail=(v.nextTierName!=null)?("co-presencia "+v.dwell+" / "+v.nextAt+" → "+v.nextTierName):("co-presencia "+v.dwell+"  ·  "+v.tierName+" (máx)");
    ctx.fillText(tail, x+bw/2, pby+pbh+12);
    ctx.textAlign="left";
  }
  // CAS-2325: VESTIGIO DEL CAÍDO / FALLEN WAYFARER'S VESTIGE — dibuja el loop de muerte/recuperación del mundo COMPARTIDO: el vestigio ambiental
  // VIVO (caído + zona, capa social COMPARTIDA — mismo vestigio para todo cliente con el mismo reloj) + el ROL del héroe (Recuperador/Caído por
  // identidad) + barra de DWELL de proximidad hacia la recuperación + el estado recuperado/buff. Estado AUTORITATIVO del sim (sim.fallenVestige;
  // 0 duplicación de lógica, 0 sim/RNG desde render). SOLO lectura (no empuja tap-rects, no hotkey). Se sitúa SOBRE la fila del Mentor. Sólo se
  // invoca bajo SOUL_RECOVERY.enabled ⇒ OFF byte-id.
  function renderSoulRow(x,y,bw,bh){
    const v=sim.fallenVestige(G.hero); if(!v) return;
    const my=y+bh-30-(SANCTUARY_OATH.enabled?76:0)-(SANCTUARY_LEDGER.enabled?46:0)-(ORDER_STANDINGS.enabled?58:0)-(FELLOWSHIP_BOND.enabled?56:0)-(MENTOR_BOND.enabled?58:0)-50;   // franja sobre la fila del Mentor
    const isFallen=v.role==="fallen", isRec=v.role==="recoverer", roleCol=isFallen?"#e88a8a":(isRec?"#b79ce8":COL.textDim);
    ctx.textAlign="left"; ctx.font="11px "+FF; ctx.fillStyle=v.vestige?roleCol:COL.textDim;
    const vLbl=v.vestige?("⚱ "+v.vestige.fallen.name+"  ·  "+v.vestige.zone):"(sin vestigio activo)";
    ctx.fillText("Vestigio del Caído  ·  "+vLbl, x+20, my);
    ctx.textAlign="right"; ctx.font="bold 11px "+FF; ctx.fillStyle=roleCol;
    const roleTxt=v.recovered?"✓ Recuperado":(v.respawnActive?"✦ Buff de recuperación":(isFallen?"Caído (tu vestigio)":(isRec?"Recuperador":"·")));
    ctx.fillText(roleTxt, x+bw-20, my);
    ctx.textAlign="left";
    // barra de DWELL (proximidad hacia la recuperación; llena = umbral alcanzado)
    const pbx=x+20, pbw=bw-40, pby=my+8, pbh=12, f=Math.max(0,Math.min(1,v.dwellFrac||0));
    ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
    ctx.fillStyle=v.recovered?"#5a8f5a":(isRec&&v.vestige?"#7d63c0":"#3a4150"); ctx.fillRect(pbx,pby,pbw*f,pbh);
    ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
    ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.textAlign="center";
    const tail=v.recovered?("vestigio recuperado  ·  +"+Math.round((SOUL_RECOVERY.recovererBoost||0)*100)+"% Descanso"):(v.vestige&&isRec?("permanencia "+Math.round(v.dwellMs/100)/10+" / "+v.dwellSec+"s → recuperar"):(isFallen?"no puedes recuperar tu propio vestigio":"acércate a un vestigio para recuperarlo"));
    ctx.fillText(tail, x+bw/2, pby+pbh+12);
    ctx.textAlign="left";
  }
  // a small CLAIM / CLAIMED chip; `on` = active (gold), `done` = already claimed (dim).
  function drawClaimChip(cx,cy,cw,ch,on,done,act,label){
    ctx.fillStyle=on?"#2e6b2e":(done?"#262b22":"#23272f");
    ctx.fillRect(cx,cy,cw,ch);
    ctx.strokeStyle=on?COL.heal:"#3a4150"; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,ch);
    ctx.textAlign="center"; ctx.fillStyle=on?COL.cream:COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText(label, cx+cw/2, cy+16);
    ctx.textAlign="left";
    if(on) ui.bountyRects.push({x:cx,y:cy,w:cw,h:ch,act});
  }

  // CAS-386: the Bestiary / Codex — a collection meta-goal over the kill roster. Pure view:
  // reads bestiary.board() (which reads the save's killsByType, CAS-375) and writes tap rects
  // into ui.bestRects. The only state change is a tier CLAIM, which routes through
  // bestiary.claim()/claimNext() → applyMetaReward (the SAME meta seam the bounty board uses).
  // A codex sprite thumbnail: the procedural SP sprite (same art the mob draws from as its
  // load-window fallback), or the first frame of a rich-anim strip (dragon), else a rune box.
  function drawCodexSprite(type, sprite, cx, cy, maxH, dim){
    ctx.save(); if(dim) ctx.globalAlpha=0.22;
    const spr=SP[sprite];
    if(spr&&spr.rows&&spr.rows.length){ const px=Math.max(1,Math.floor(maxH/spr.rows.length));
      blit(ctx, spr.rows, spr.pal, cx, cy, px, false); ctx.restore(); return; }
    const strip=resolveStrip(sprite,"idle");
    const simg=strip&&IMG[strip.key]&&IMG[strip.key].complete&&IMG[strip.key].naturalWidth?IMG[strip.key]:null;
    if(simg){ const s=Math.min(maxH/strip.fh, maxH/strip.fw), dw=strip.fw*s, dh=strip.fh*s;
      const sm=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
      ctx.drawImage(simg, 0,0,strip.fw,strip.fh, cx-dw/2, cy-dh/2, dw, dh); ctx.imageSmoothingEnabled=sm; ctx.restore(); return; }
    // last resort — a rune placeholder so an unloaded strip never renders blank
    ctx.globalAlpha=dim?0.22:0.7; ctx.strokeStyle=COL.panelB; ctx.lineWidth=2;
    ctx.strokeRect(cx-maxH*0.35,cy-maxH*0.35,maxH*0.7,maxH*0.7);
    ctx.fillStyle=COL.textDim; ctx.textAlign="center"; ctx.font="bold 18px "+FF; ctx.fillText("?",cx,cy+6); ctx.textAlign="left";
    ctx.restore();
  }
  function renderBestiary(){ const b=bestiary.board(); ui.bestRects=[];
    const bw=Math.min(VW*0.94,580), bh=Math.min(VH*0.92,520), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px "+FF; ctx.fillText(STR.bestiaryTitle,VW/2,y+28);
    if(!b||!b.entries.length){ ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("—",VW/2,y+60); return; }
    // header: discovered rollup (centre) + gold (left)
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.bestiarySub(b.discovered,b.total),VW/2,y+44);
    ctx.textAlign="left"; ctx.fillStyle=COL.gold; ctx.font="bold 12px "+FF; ctx.fillText(STR.gold(G.hero.gold), x+16, y+24);

    const n=b.entries.length, rowH=66, listTop=y+56, listBot=y+bh-38, vis=Math.max(1,Math.floor((listBot-listTop)/rowH));
    if(G.bestSel==null) G.bestSel=0; G.bestSel=Math.max(0,Math.min(n-1,G.bestSel|0));
    let scroll=G.bestScroll|0; const maxScroll=Math.max(0,n-vis);
    if(G.bestSel<scroll) scroll=G.bestSel; else if(G.bestSel>=scroll+vis) scroll=G.bestSel-vis+1;
    scroll=Math.max(0,Math.min(maxScroll,scroll)); G.bestScroll=scroll;

    for(let i=scroll;i<Math.min(n,scroll+vis);i++){ const e=b.entries[i]; const ry=listTop+(i-scroll)*rowH; const sel=i===G.bestSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+16,ry,bw-32,rowH-8);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+16,ry,bw-32,rowH-8); }
      // sprite thumbnail (left)
      const thumbCx=x+16+30, thumbCy=ry+(rowH-8)/2;
      drawCodexSprite(e.type, e.sprite, thumbCx, thumbCy, 44, !e.seen);
      // name + boss tag + kill count
      const tx=x+16+62;
      ctx.textAlign="left"; ctx.fillStyle=e.seen?COL.cream:COL.textDim; ctx.font="bold 14px "+FF; ctx.fillText(e.name, tx, ry+20);
      const nameW=ctx.measureText(e.name).width;
      if(e.seen&&e.boss){ ctx.fillStyle=COL.textGold; ctx.font="9px "+FF; ctx.fillText("★ JEFE", tx+nameW+10, ry+20); }
      ctx.fillStyle=e.seen?COL.gold:COL.textDim; ctx.font="11px "+FF; ctx.fillText(e.seen?STR.bestiaryKills(e.count):STR.bestiaryUndiscovered, tx, ry+38);
      // next-tier progress hint
      if(e.seen && e.nextNeed!=null){ ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText(STR.bestiaryNext(e.nextNeed), tx, ry+52); }
      // tier pips (3 boxes: reached=gold, claimed=green, locked=dark)
      const pipY=ry+(rowH-8)/2-9, pipX0=x+bw-170;
      for(let t=0;t<e.tiers.length;t++){ const ti=e.tiers[t]; const px2=pipX0+t*20;
        ctx.fillStyle=ti.claimed?"#2e6b2e":(ti.reached?COL.textGold:"#23272f");
        ctx.fillRect(px2,pipY,17,17);
        ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(px2+0.5,pipY+0.5,17,17);
        ctx.fillStyle=(ti.reached||ti.claimed)?"#0b0c11":COL.textDim; ctx.textAlign="center"; ctx.font="bold 11px "+FF;
        ctx.fillText(ti.claimed?"✓":ti.label.charAt(0), px2+8.5, pipY+13); ctx.textAlign="left"; }
      // claim chip (right) — claims the next reached-but-unclaimed tier
      drawBestChip(x+bw-96, ry+(rowH-8)/2-12, 80, 24, e.claimable,
        ()=>{ G.bestSel=i; bestiary.claimNext(e.type); }, STR.bestiaryClaim);
      // whole-row select (tap) — pushed AFTER the chip so the chip wins a first-match scan
      ui.bestRects.push({x:x+16,y:ry,w:bw-32,h:rowH-8,act:()=>{ G.bestSel=i; }});
    }
    // scroll indicators
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF;
    if(scroll>0) ctx.fillText("▲", VW/2, listTop-2);
    if(scroll+vis<n) ctx.fillText("▼", VW/2, listBot+12);
    // close
    const ccy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,ccy,120,24);
    ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("Cerrar (E)",VW/2,ccy+17); ctx.textAlign="left";
    ui.bestRects.push({x:x+bw/2-60,y:ccy,w:120,h:24,act:()=>{ G.scene="play"; }});
  }
  // a bestiary CLAIM chip; on=claimable (gold/green), else dim "Cobrado"/locked. Pushes its
  // own rect into ui.bestRects (before the row-select rect) so the chip wins a first-match tap.
  function drawBestChip(cx,cy,cw,ch,on,act,label){
    ctx.fillStyle=on?"#2e6b2e":"#262b22";
    ctx.fillRect(cx,cy,cw,ch);
    ctx.strokeStyle=on?COL.heal:"#3a4150"; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,ch);
    ctx.textAlign="center"; ctx.fillStyle=on?COL.cream:COL.textDim; ctx.font="bold 12px "+FF;
    ctx.fillText(on?label:STR.bestiaryClaimedChip, cx+cw/2, cy+16); ctx.textAlign="left";
    if(on) ui.bestRects.push({x:cx,y:cy,w:cw,h:ch,act});
  }

  // CAS-383: the INTER-ZONE BOON DRAFT panel. Appears on the "draft" scene after a zone
  // champion clear — three cards, pick one build-modifying boon for the rest of the run.
  // Pure view over G.draft (choices) + G.hero.boons (the active stack); the only state
  // change is the pick, routed through sim.pickBoon via ui.draftRects (tap) / input keys.
  // Reuses the shared panel() Tibia frame + COL palette + pixel-font idiom (no art spend).
  function boonCatCol(cat){ return cat==="offense"?"#ff7a5d":cat==="defense"?"#7fb2ff":"#8be07a"; }
  // CAS-388: rarity accent — common = muted frame, rare = blue, legendary = amber glow. Drives
  // the card's border + a small corner ribbon so the draw reads its tier at a glance.
  function boonRarCol(b){ const r=BOON_RARITY&&BOON_RARITY[b&&b.rarity]; return r?r.col:"#cfd6e0"; }
  function boonRarLabel(b){ const r=BOON_RARITY&&BOON_RARITY[b&&b.rarity]; return r?r.label:""; }
  // CAS-272 (juice v2): draft-card REVEAL pop — presentation only. The tween keys on the draft
  // OBJECT + its choice signature, so open/reroll/banish each retrigger it; hit rects register
  // at full size from frame 0 (input never waits on the tween) and reduce-motion (CAS-265)
  // lands the cards instantly. Steady-state cost once settled: one join + 3 compares per frame.
  let draftPopRef=null, draftPopKey=null, draftPopT0=0;
  const DRAFT_POP_MS=190, DRAFT_POP_STAG=55;
  function draftPopP(d,i){ const key=(d.choices||[]).join("|");
    if(d!==draftPopRef||key!==draftPopKey){ draftPopRef=d; draftPopKey=key; draftPopT0=performance.now(); }
    if(G.settings&&G.settings.reduceMotion) return 1;
    const t=(performance.now()-draftPopT0-i*DRAFT_POP_STAG)/DRAFT_POP_MS;
    return t<=0?0:t>=1?1:t*(2-t); }
  if(typeof window!=="undefined") window.__draftPop=()=>({key:draftPopKey,t0:draftPopT0,ms:DRAFT_POP_MS,stag:DRAFT_POP_STAG});
  function renderDraft(){ const d=G.draft; ui.draftRects=[]; ui.draftBanishRects=[]; ui.draftRerollRect=null; if(!d){ return; }
    const h=G.hero; const choices=d.choices||[];
    // CAS-392: a small red ✖ badge in a card's top-right corner banishes it (when a charge is left).
    // Registered as its own hit rect (checked BEFORE the card pick in draftTap) + a keyboard 'B' path.
    const canBanish=!!(h&&h.banishLeft>0);
    function banishBadge(cx,cy,cw,i){ if(!canBanish) return; const s=18, bx=cx+cw-s-4, by=cy+6;
      ctx.fillStyle="#3a2130"; ctx.fillRect(bx,by,s,s);
      ctx.strokeStyle="#d0556b"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,s,s);
      ctx.textAlign="center"; ctx.fillStyle="#ff9db0"; ctx.font="bold 12px "+FF; ctx.fillText("✖", bx+s/2, by+s-5);
      ui.draftBanishRects.push({x:bx,y:by,w:s,h:s,idx:i}); }
    const bw=Math.min(VW*0.94,660), bh=Math.min(VH*0.9,460), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    // CAS-450: the APEX ceremony hand re-titles the same panel (amber accent — the legendary
    // colour already in BOON_RARITY) so the full-conquest payoff reads as an EVENT, not another
    // routine draft. Same layout/rects — presentation only.
    ctx.textAlign="center"; ctx.fillStyle=d.apex?"#ffab2e":COL.textGold; ctx.font="bold 19px "+FF; ctx.fillText(d.apex?STR.apexDraftTitle:STR.draftTitle,VW/2,y+30);
    // subtitle: left-aligned wrap inside the frame + smaller font on narrow panels, so it
    // never bleeds past the border on a phone-portrait canvas.
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font=(bw<520?"10px":"12px")+" "+FF; wrapText(d.apex?STR.apexDraftSub:STR.draftSub,x+20,y+48,bw-40,14);

    const sel=Math.max(0,Math.min(choices.length-1,(G.draftSel||0)));
    const wide=bw>=560; // wide → 3 columns, narrow → 3 stacked rows (mobile-safe)
    const top=y+(wide?64:78), botH=54; // reserve a footer strip for the active-boon readout (extra top gap when the subtitle wraps)
    if(wide){
      const gap=14, cw=(bw-40-gap*(choices.length-1))/choices.length, ch=bh-64-botH-20, cx0=x+20;
      for(let i=0;i<choices.length;i++){ const b=BOON_MAP[choices[i]]; if(!b) continue;
        const cx=cx0+i*(cw+gap), cy=top; const on=i===sel; const cc=boonCatCol(b.cat);
        const rc=boonRarCol(b), leg=b.rarity==="legendary";
        const p=draftPopP(d,i), popped=p<1; // CAS-272 reveal pop (rects below stay full-size)
        if(popped){ ctx.save(); ctx.globalAlpha=Math.max(0,p); const pmx=cx+cw/2,pmy=cy+ch/2,ps=0.92+0.08*p;
          ctx.translate(pmx,pmy); ctx.scale(ps,ps); ctx.translate(-pmx,-pmy); }
        ctx.fillStyle=on?"#2c3446":"#20262f"; ctx.fillRect(cx,cy,cw,ch);
        // CAS-388: rarity frame — legendary always reads bold/amber even unselected.
        ctx.strokeStyle=on?COL.textGold:rc; ctx.lineWidth=(on||leg)?2:1; ctx.strokeRect(cx+0.5,cy+0.5,cw,ch);
        ctx.fillStyle=cc; ctx.fillRect(cx,cy,cw,4); // category color bar
        ctx.textAlign="center"; ctx.fillStyle=rc; ctx.font="bold 9px "+FF; ctx.fillText(boonRarLabel(b), cx+cw/2, cy+16); // rarity ribbon
        ctx.textAlign="center"; ctx.fillStyle=cc; ctx.font="30px "+FF; ctx.fillText(b.glyph, cx+cw/2, cy+46);
        ctx.fillStyle=COL.cream; ctx.font="bold 14px "+FF; ctx.fillText(b.name, cx+cw/2, cy+72);
        ctx.fillStyle=cc; ctx.font="11px "+FF; ctx.fillText((BOON_CAT_LABEL[b.cat]||b.cat).toUpperCase(), cx+cw/2, cy+90);
        ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; wrapText(b.desc, cx+12, cy+112, cw-24, 16);
        ctx.textAlign="center"; ctx.fillStyle=on?COL.textGold:COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText(STR.draftPick((i+1)), cx+cw/2, cy+ch-12);
        ui.draftRects.push({x:cx,y:cy,w:cw,h:ch,idx:i});
        banishBadge(cx,cy,cw,i); // CAS-392 (after card body so it draws on top)
        if(popped) ctx.restore(); // CAS-272 end reveal pop
      }
    } else {
      const rh=Math.min(96,(bh-64-botH-20)/choices.length-8), rw=bw-40, rx=x+20;
      for(let i=0;i<choices.length;i++){ const b=BOON_MAP[choices[i]]; if(!b) continue;
        const ry=top+i*(rh+8); const on=i===sel; const cc=boonCatCol(b.cat);
        const rc=boonRarCol(b), leg=b.rarity==="legendary";
        const p=draftPopP(d,i), popped=p<1; // CAS-272 reveal pop (rects below stay full-size)
        if(popped){ ctx.save(); ctx.globalAlpha=Math.max(0,p); const pmx=rx+rw/2,pmy=ry+rh/2,ps=0.92+0.08*p;
          ctx.translate(pmx,pmy); ctx.scale(ps,ps); ctx.translate(-pmx,-pmy); }
        ctx.fillStyle=on?"#2c3446":"#20262f"; ctx.fillRect(rx,ry,rw,rh);
        ctx.strokeStyle=on?COL.textGold:rc; ctx.lineWidth=(on||leg)?2:1; ctx.strokeRect(rx+0.5,ry+0.5,rw,rh);
        ctx.fillStyle=cc; ctx.fillRect(rx,ry,4,rh);
        ctx.textAlign="center"; ctx.fillStyle=cc; ctx.font="28px "+FF; ctx.fillText(b.glyph, rx+34, ry+rh/2+8);
        ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 14px "+FF; ctx.fillText(b.name+"  ", rx+62, ry+22);
        ctx.fillStyle=rc; ctx.font="9px "+FF; ctx.fillText(boonRarLabel(b), rx+rw-14-(canBanish?24:0)-ctx.measureText(boonRarLabel(b)).width, ry+16); // rarity ribbon (right; nudged left to clear the CAS-392 banish badge)
        ctx.fillStyle=cc; ctx.font="10px "+FF; ctx.fillText((BOON_CAT_LABEL[b.cat]||b.cat).toUpperCase(), rx+62, ry+38);
        ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; wrapText(b.desc, rx+62, ry+56, rw-172, 15);
        ctx.textAlign="right"; ctx.fillStyle=on?COL.textGold:COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText(STR.draftPick((i+1)), rx+rw-14, ry+rh/2+4);
        ui.draftRects.push({x:rx,y:ry,w:rw,h:rh,idx:i});
        banishBadge(rx,ry,rw,i); // CAS-392
        if(popped) ctx.restore(); // CAS-272 end reveal pop
      }
    }
    // active-boon readout — the run's accumulating stack (glyphs), so builds read as they diverge
    const owned=(h&&h.boons)||[]; const fy=y+bh-botH+18;
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF;
    ctx.fillText(STR.draftActive(owned.length), x+20, fy);
    // CAS-388: active SYNERGY chips on the same header line (right side) — an owned PAIR lights
    // up amber so the player reads which emergent bonuses their build has unlocked.
    { const os=new Set(owned); const live=SYNERGIES.filter(s=>s.need.every(id=>os.has(id)));
      if(live.length){ ctx.textAlign="right"; let sx=x+bw-20; ctx.font="bold 11px "+FF;
        for(let i=live.length-1;i>=0;i--){ const s=live[i]; const lbl="✦ "+s.name;
          ctx.fillStyle="#ffab2e"; ctx.fillText(lbl, sx, fy); sx-=ctx.measureText(lbl).width+16; }
        ctx.textAlign="left";
      } else { ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
        ctx.fillText(STR.draftSynHint, x+bw-20, fy); ctx.textAlign="left"; } }
    if(owned.length){ let gx=x+20; ctx.font="18px "+FF; const seen={};
      for(const id of owned){ const b=BOON_MAP[id]; if(!b) continue; seen[id]=(seen[id]||0)+1; }
      const keys=Object.keys(seen); ctx.textAlign="left";
      for(const id of keys){ const b=BOON_MAP[id]; ctx.fillStyle=boonCatCol(b.cat);
        const lbl=b.glyph+(seen[id]>1?("×"+seen[id]):""); ctx.fillText(lbl, gx, fy+22); gx+=ctx.measureText(lbl).width+14; }
    }
    // CAS-392: REROLL button (bottom-right) — re-draws the whole hand at the same depth odds while a
    // charge is left; greys out when spent. Registered as ui.draftRerollRect for touch + keyboard 'R'.
    if(h){ const canRe=h.rerollLeft>0; const label="⟳ "+STR.draftReroll+" ("+(h.rerollLeft|0)+")";
      ctx.font="bold 12px "+FF; ctx.textAlign="center";
      const rbw=Math.min(bw-40,ctx.measureText(label).width+22), rbh=24, rbx=x+bw-rbw-16, rby=y+bh-rbh-8;
      ctx.fillStyle=canRe?"#243a2b":"#26262a"; ctx.fillRect(rbx,rby,rbw,rbh);
      ctx.strokeStyle=canRe?"#5fd08a":"#555"; ctx.lineWidth=1; ctx.strokeRect(rbx+0.5,rby+0.5,rbw,rbh);
      ctx.fillStyle=canRe?"#bfeecb":"#777"; ctx.fillText(label, rbx+rbw/2, rby+16);
      if(canRe) ui.draftRerollRect={x:rbx,y:rby,w:rbw,h:rbh};
      // banished-count readout, left of the reroll pill, so the player sees the pool shrinking.
      const nb=(h.banished&&h.banished.length)||0;
      if(nb){ ctx.textAlign="right"; ctx.fillStyle="#d0556b"; ctx.font="10px "+FF; ctx.fillText(STR.draftBanished(nb), rbx-12, rby+16); }
    }
    ctx.textAlign="left";
  }

  // CAS-394: the OPT-IN ZONE MODIFIER offer. Appears on the "curse" scene the first time the hero
  // steps into a combat zone this run — one modifier, accept (harder + better reward) or skip
  // (untouched). Pure view over G.curse; the only state change is accept/skip via ui.curseRects
  // (tap) / keyboard (A / Esc). Reuses the shared panel() Tibia frame + COL palette (no art spend).
  // Mobile-safe: the panel width clamps to the canvas and the two action buttons stack full-width.
  function renderCurse(){ const c=G.curse; ui.curseRects=[]; if(!c) return;
    const m=ZONE_MOD_MAP[c.mod]; if(!m) return;
    const bw=Math.min(VW*0.9,460), bh=Math.min(VH*0.82,340), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center";
    ctx.fillStyle="#ff7a5d"; ctx.font="bold 19px "+FF; ctx.fillText(STR.curseTitle,VW/2,y+30);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.zoneName(c.zone),VW/2,y+48);
    // modifier card — glyph, name, effect line
    const cardY=y+62, cardH=bh-62-118, cw=bw-40, cx=x+20;
    ctx.fillStyle="#2a2130"; ctx.fillRect(cx,cardY,cw,cardH);
    ctx.strokeStyle="#ff7a5d"; ctx.lineWidth=2; ctx.strokeRect(cx+0.5,cardY+0.5,cw,cardH);
    ctx.fillStyle="#ff9a7d"; ctx.font="34px "+FF; ctx.fillText(m.glyph, VW/2, cardY+44);
    ctx.fillStyle=COL.cream; ctx.font="bold 16px "+FF; ctx.fillText(m.name, VW/2, cardY+70);
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; wrapText(m.desc, cx+16, cardY+92, cw-32, 16);
    // reward line (below the card) — centered wrap on the panel midline
    ctx.textAlign="center"; ctx.fillStyle="#e0c070"; ctx.font="10px "+FF;
    wrapText(STR.curseReward, VW/2, y+bh-108, bw-44, 13);
    // action buttons — Accept (red) / Skip (grey), full-width stacked, tap + keyboard
    const bwid=bw-40, bhei=34, bxx=x+20; let byy=y+bh-64;
    ctx.fillStyle="#3a2126"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle="#ff6a5d"; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle="#ffbfae"; ctx.font="bold 14px "+FF; ctx.fillText(STR.curseAccept, VW/2, byy+22);
    ui.curseRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"accept"});
    byy+=bhei+8;
    ctx.fillStyle="#262a30"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle="#7f8794"; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle=COL.textDim; ctx.font="bold 14px "+FF; ctx.fillText(STR.curseSkip, VW/2, byy+22);
    ui.curseRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"skip"});
    ctx.textAlign="left";
  }

  // CAS-450: the opt-in WORLD-TIER climb offer. Appears on the "ascend" scene right after the
  // apex draft resolves (full conquest cycle). Same skeleton as renderCurse — shared panel()
  // frame, one card, two stacked full-width buttons (tap via ui.ascendRects / keyboard A·Esc) —
  // but gold-keyed: this is a reward decision, not a risk one. Pure view over G.ascend.
  function renderAscend(){ const a=G.ascend; ui.ascendRects=[]; if(!a) return;
    // CAS-2024 NG+: explicit "Nueva Partida Plus / Ciclo N+1" framing when NG+ is live. View-only —
    // off ⇒ the CAS-450 copy renders byte-for-byte as before. No sim/RNG touched.
    const ngRe=NG_PLUS.enabled && NG_PLUS.reframePrompt;
    const sTitle=ngRe?STR.ngAscendTitle:STR.ascendTitle, sName=ngRe?STR.ngAscendName:STR.ascendName, sDesc=ngRe?STR.ngAscendDesc:STR.ascendDesc;
    const bw=Math.min(VW*0.9,460), bh=Math.min(VH*0.82,340), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 19px "+FF; ctx.fillText(sTitle,VW/2,y+30);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.conquestProgress(4,4),VW/2,y+48);
    // tier card — star glyph, target tier name, effect line
    const cardY=y+62, cardH=bh-62-118, cw=bw-40, cx=x+20;
    ctx.fillStyle="#2a2618"; ctx.fillRect(cx,cardY,cw,cardH);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(cx+0.5,cardY+0.5,cw,cardH);
    ctx.fillStyle="#ffd24d"; ctx.font="34px "+FF; ctx.fillText("★", VW/2, cardY+44);
    ctx.fillStyle=COL.cream; ctx.font="bold 16px "+FF; ctx.fillText(sName(a.tier), VW/2, cardY+70);
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; wrapText(sDesc(a.tier), cx+16, cardY+92, cw-32, 16);
    // stay-put line (below the card) — centered wrap on the panel midline
    ctx.textAlign="center"; ctx.fillStyle="#e0c070"; ctx.font="10px "+FF;
    wrapText(STR.ascendReward, VW/2, y+bh-108, bw-44, 13);
    // action buttons — Ascend (gold) / Stay (grey), full-width stacked, tap + keyboard
    const bwid=bw-40, bhei=34, bxx=x+20; let byy=y+bh-64;
    ctx.fillStyle="#3a3218"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle="#ffe2a0"; ctx.font="bold 14px "+FF; ctx.fillText(STR.ascendAccept, VW/2, byy+22);
    ui.ascendRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"accept"});
    byy+=bhei+8;
    ctx.fillStyle="#262a30"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle="#7f8794"; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle=COL.textDim; ctx.font="bold 14px "+FF; ctx.fillText(STR.ascendSkip, VW/2, byy+22);
    ui.ascendRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"skip"});
    ctx.textAlign="left";
  }

  // CAS-2035: the NG+ CYCLE RECAP overlay. Shown on the "ascendRecap" scene (only when
  // NG_PLUS.enabled && NG_PLUS.recap; DARK by default ⇒ this fn is never reached and renderAscend is
  // byte-id). Pure view over DURABLE/DERIVABLE state + sim.ngTierPreview — 0 RNG. Draws: cycle header,
  // hero snapshot (class/level/banked Esencia/best gear), and the tier+1 escalation preview (the hook).
  // Pushes the SAME accept/skip rects to ui.ascendRects so the CAS-450 input path is reused verbatim.
  function renderAscendRecap(){ const a=G.ascend; ui.ascendRects=[]; if(!a) return;
    const h=G.hero; if(!h) return;
    const snap=sim.conquestSnap(), prev=sim.ngTierPreview(a.tier);
    const fmtMul=(m)=> (Math.round(m*100)/100).toString();
    const bw=Math.min(VW*0.92,480), bh=Math.min(VH*0.92,472), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    const cx=x+20, cw=bw-40;
    // ---- title + cycle header ----
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 19px "+FF; ctx.fillText(STR.ngRecapTitle,VW/2,y+28);
    ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(STR.ngRecapCycleHdr(snap.tier),VW/2,y+48);
    const dn=(snap.zones||[]).filter(z=>z.down).length, tot=(snap.zones||[]).length||4;
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.conquestProgress(dn,tot),VW/2,y+64);
    // ---- hero snapshot ----
    ctx.textAlign="left";
    let cy=y+90;
    ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.fillText(STR.ngRecapHeroHdr,cx,cy); cy+=18;
    const cls=(STR.classLabel&&STR.classLabel[h.cls])||h.cls;
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.ngRecapHeroLine(cls,h.lvl|0),cx,cy); cy+=16;
    const ess=(G.meta&&G.meta.essence)|0;
    ctx.fillStyle=COL.textDim; ctx.fillText(STR.ngRecapEssence(ess),cx,cy); cy+=16;
    let best=null,bestRank=-1; for(const s of ["weapon","body","shield"]){ const it=h.equip&&h.equip[s]; if(!it) continue; const rk=rarityRank(it.rarity); if(rk>bestRank){ bestRank=rk; best=it; } }
    if(best){ ctx.fillStyle=gearCol(best); ctx.fillText(STR.ngRecapGear(gearName(best)),cx,cy); } cy+=22;
    // ---- NG+ N+1 escalation preview (THE HOOK) ----
    const showPoise=prev.poiseMul>1;
    const pvLines=3+(showPoise?1:0);
    const pvH=26+pvLines*15+8;
    ctx.fillStyle="#2a2618"; ctx.fillRect(cx,cy,cw,pvH);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,pvH);
    ctx.textAlign="center"; ctx.fillStyle="#ffd24d"; ctx.font="bold 12px "+FF; ctx.fillText(STR.ngRecapPreviewHdr(a.tier),VW/2,cy+20);
    ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="11px "+FF;
    let py=cy+40;
    ctx.fillText(STR.ngRecapThreat(Math.round(prev.hpPct*100),Math.round(prev.dmgPct*100)),cx+14,py); py+=15;
    const lootLbl=(STR.rarity&&STR.rarity[prev.lootFloor])||prev.lootFloor;
    ctx.fillText(STR.ngRecapLoot(lootLbl),cx+14,py); py+=15;
    ctx.fillText(STR.ngRecapEss(fmtMul(prev.essMul)),cx+14,py); py+=15;
    if(showPoise){ ctx.fillText(STR.ngRecapPoise(fmtMul(prev.poiseMul)),cx+14,py); py+=15; }
    // ---- reward framing (above buttons) ----
    ctx.textAlign="center"; ctx.fillStyle="#e0c070"; ctx.font="10px "+FF;
    wrapText(STR.ngRecapReward,VW/2,y+bh-100,bw-44,13);
    // ---- action buttons (identical skeleton to renderAscend → same ui.ascendRects contract) ----
    const bwid=bw-40, bhei=34, bxx=x+20; let byy=y+bh-64;
    ctx.fillStyle="#3a3218"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle="#ffe2a0"; ctx.font="bold 14px "+FF; ctx.fillText(STR.ascendAccept,VW/2,byy+22);
    ui.ascendRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"accept"});
    byy+=bhei+8;
    ctx.fillStyle="#262a30"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle="#7f8794"; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle=COL.textDim; ctx.font="bold 14px "+FF; ctx.fillText(STR.ascendSkip,VW/2,byy+22);
    ui.ascendRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"skip"});
    ctx.textAlign="left";
  }

  // CAS-2047: Boss Rush TIME-ATTACK results / records overlay. Shown on the "bossRushRecap" scene (only reached when
  // BOSS_RUSH.timeAttack && a gauntlet was COMPLETED; DARK by default ⇒ never reached ⇒ HEAD byte-id). Pure view over
  // the G.bossRushRecap payload (total time, per-round splits, hits, score, Δ vs previous record, NEW-RECORD flags) — 0
  // RNG. Clones renderAscendRecap's skeleton; pushes retry/menu rects to ui.bossRushRects (mirror ui.ascendRects).
  function renderBossRushRecap(){ const rc=G.bossRushRecap; ui.bossRushRects=[]; if(!rc) return;
    const bw=Math.min(VW*0.92,480), bh=Math.min(VH*0.92,472), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    const cx=x+20, cw=bw-40, rx=x+bw-20;
    // ---- title + complete header ----
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 19px "+FF; ctx.fillText(STR.brTitle,VW/2,y+28);
    ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(STR.brComplete,VW/2,y+48);
    // CAS-2090: en Desafío con Semilla, banner con el CÓDIGO compartible bajo el header (para comparar/compartir el run).
    // Gateado en rc.seededCode ⇒ un recap de Boss Rush normal NO lo dibuja ⇒ overlay byte-idéntico a HEAD.
    if(rc.seededCode){ ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.fillText("⚑ Semilla: "+rc.seededCode,VW/2,y+64); }
    ctx.textAlign="left"; let cy=y+78;
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF; ctx.fillText(STR.brTimeLabel,cx,cy);
    ctx.textAlign="right"; ctx.fillStyle=COL.cream; ctx.fillText(fmtBRTime(rc.timeMs),rx,cy); cy+=16;
    ctx.font="10px "+FF;
    if(rc.newTimeRecord){ ctx.fillStyle="#8fe08f"; ctx.fillText(STR.brTimeRecord,rx,cy); }
    else if((rc.prevBestTimeMs|0)>0){ const d=rc.timeMs-rc.prevBestTimeMs; ctx.fillStyle=COL.textDim;
      ctx.fillText(STR.brPrevBestTime(fmtBRTime(rc.prevBestTimeMs))+"  ("+(d>=0?"+":"−")+fmtBRTime(Math.abs(d))+")",rx,cy); }
    cy+=18; ctx.textAlign="left";
    // ---- per-round splits ----
    if(rc.roundMs && rc.roundMs.length){ ctx.font="11px "+FF;
      for(let i=0;i<rc.roundMs.length;i++){ ctx.fillStyle=COL.textDim; ctx.fillText(STR.brRoundSplit(i+1),cx+8,cy);
        ctx.textAlign="right"; ctx.fillStyle=COL.cream; ctx.fillText(fmtBRTime(rc.roundMs[i]),rx,cy); ctx.textAlign="left"; cy+=15; } }
    cy+=6;
    // ---- hits taken (green when flawless) ----
    ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF; ctx.fillText(STR.brHits,cx,cy);
    ctx.textAlign="right"; ctx.fillStyle=(rc.hits===0?"#8fe08f":COL.cream); ctx.fillText(String(rc.hits|0),rx,cy);
    ctx.textAlign="left"; cy+=20;
    // ---- score block (sub-toggle: showScore) — big score + Δ vs previous best + NEW RECORD ----
    if(BOSS_RUSH.showScore){
      const boxH=64;
      ctx.fillStyle="#2a2618"; ctx.fillRect(cx,cy,cw,boxH);
      ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,boxH);
      ctx.textAlign="center";
      ctx.fillStyle="#ffd24d"; ctx.font="bold 24px "+FF; ctx.fillText(String(rc.score|0),VW/2,cy+30);
      ctx.font="10px "+FF; ctx.fillStyle=COL.textDim; ctx.fillText(STR.brScoreLabel,VW/2,cy+44);
      ctx.font="11px "+FF;
      if(rc.newScoreRecord){ ctx.fillStyle="#ffe27a"; ctx.fillText(STR.brNewRecord,VW/2,cy+58); }
      else { const d=(rc.score|0)-(rc.prevBestScore|0); ctx.fillStyle=COL.textDim;
        ctx.fillText(STR.brPrevBest(rc.prevBestScore|0)+"  ("+(d>=0?"+":"")+d+")",VW/2,cy+58); }
      ctx.textAlign="left";
    }
    // ---- action buttons (identical skeleton to renderAscendRecap → ui.bossRushRects contract) ----
    const bwid=bw-40, bhei=34, bxx=x+20; let byy=y+bh-64;
    ctx.fillStyle="#3a3218"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.textAlign="center"; ctx.fillStyle="#ffe2a0"; ctx.font="bold 14px "+FF; ctx.fillText(STR.brRetry,VW/2,byy+22);
    ui.bossRushRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"retry"});
    byy+=bhei+8;
    ctx.fillStyle="#262a30"; ctx.fillRect(bxx,byy,bwid,bhei);
    ctx.strokeStyle="#7f8794"; ctx.lineWidth=1; ctx.strokeRect(bxx+0.5,byy+0.5,bwid,bhei);
    ctx.fillStyle=COL.textDim; ctx.font="bold 14px "+FF; ctx.fillText(STR.brMenu,VW/2,byy+22);
    ui.bossRushRects.push({x:bxx,y:byy,w:bwid,h:bhei,act:"menu"});
    ctx.textAlign="left";
  }

  // CAS-265: the pause / settings panel, reorganised into three grouped TABS
  // (Audio · Accesibilidad · Controles) for cohesion. All controls are tap-driven so
  // they behave identically on touch; every persistent toggle writes through
  // settings.save() so it survives a reload. A pinned footer keeps Resume / replay-guide
  // / new-game reachable from any tab.
  function renderPause(){ const bw=Math.min(VW*0.86,440), bh=Math.min(VH-20,580), x=(VW-bw)/2, y=(VH-bh)/2; panel(x,y,bw,bh);
    if(!G.setTab) G.setTab="access";
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 22px "+FF; ctx.fillText(STR.pauseTitle,VW/2,y+30);
    ui.pauseRects=[];
    const px=x+24, pw=bw-48;
    // ---- tab strip ----
    const tabs=[["audio",STR.setTabAudio],["access",STR.setTabAccess],["controls",STR.setTabControls]];
    const tw=pw/tabs.length, ty=y+44, th=26;
    tabs.forEach(([id,label],i)=>{ const tx=px+i*tw, on=G.setTab===id;
      ctx.fillStyle=on?"#2e3647":"#191e26"; ctx.fillRect(tx,ty,tw-3,th);
      if(on){ ctx.fillStyle=COL.textGold; ctx.fillRect(tx,ty+th-2,tw-3,2); }
      ctx.textAlign="center"; ctx.fillStyle=on?COL.cream:COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText(label,tx+(tw-3)/2,ty+17);
      ui.pauseRects.push({x:tx,y:ty,w:tw-3,h:th,tab:id}); });
    // ---- shared row widgets ----
    function toggle(label,on,act,oy){ ctx.textAlign="left"; ctx.fillStyle="#20262f"; ctx.fillRect(px,oy,pw,26);
      ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText(label,px+10,oy+17);
      const bx=px+pw-52, bon=!!on; ctx.fillStyle=bon?"#2e5a3a":"#3a2222"; ctx.fillRect(bx,oy+5,42,16);
      ctx.textAlign="center"; ctx.fillStyle=bon?"#9be7a0":"#e0a0a0"; ctx.font="bold 11px "+FF; ctx.fillText(bon?"ON":"OFF",bx+21,oy+17);
      ui.pauseRects.push({x:px,y:oy,w:pw,h:26,act}); }
    function slider(label,oy,get,set,dim){ const sh=22;
      ctx.textAlign="left"; ctx.fillStyle=dim?COL.textDim:COL.cream; ctx.font="12px "+FF; ctx.fillText(label,px,oy-2);
      const bx=px, by=oy+4, bwd=pw, bhd=sh-8;
      ctx.fillStyle="#20262f"; ctx.fillRect(bx,by,bwd,bhd);
      const f=Math.max(0,Math.min(1,get())); ctx.fillStyle=dim?"#46505f":COL.textGold; ctx.fillRect(bx,by,bwd*f,bhd);
      ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bwd,bhd);
      ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(Math.round(f*100)+"%",bx+bwd-3,oy-2);
      ui.pauseRects.push({x:bx,y:oy-6,w:bwd,h:sh+6,slider:true,set}); }
    // ---- tab body ----
    const save=()=>settings.save();
    let oy=ty+th+16;
    if(G.setTab==="audio"){
      toggle(STR.settingMute, audio.muted, ()=>audio.toggleMute(), oy); oy+=34;
      slider(STR.settingMaster,oy,()=>audio.master,(f)=>audio.setMaster(f),audio.muted); oy+=32;
      slider(STR.settingMusic,oy,()=>audio.music,(f)=>audio.setMusic(f),audio.muted); oy+=32;
      slider(STR.settingSfx,oy,()=>audio.sfxVol,(f)=>audio.setSfx(f),audio.muted); oy+=32;
    } else if(G.setTab==="access"){
      // reduce-motion is the master juice off-switch (gates shake + trims particles).
      toggle(STR.settingReduceMotion, G.settings.reduceMotion, ()=>{ G.settings.reduceMotion=!G.settings.reduceMotion; if(G.settings.reduceMotion) G.shake=0; save(); }, oy); oy+=32;
      toggle(STR.settingColorblind, G.settings.colorblind, ()=>{ G.settings.colorblind=!G.settings.colorblind; save(); }, oy); oy+=32;
      toggle(STR.settingShake, G.settings.shake>0, ()=>{ G.settings.shake=G.settings.shake>0?0:1; save(); }, oy); oy+=32;
      // CAS-2059: granular photosensitivity toggles — hit-freeze + crit/backstab flash banners (default ON, byte-preserved).
      toggle(STR.settingHitStop, G.settings.hitStop, ()=>{ G.settings.hitStop=!G.settings.hitStop; save(); }, oy); oy+=32;
      toggle(STR.settingFlash, G.settings.flash, ()=>{ G.settings.flash=!G.settings.flash; save(); }, oy); oy+=32;
      toggle(STR.settingCRT, G.settings.crt, ()=>{ G.settings.crt=!G.settings.crt; save(); }, oy); oy+=32;
      // CAS-1613 (PR4): opt back into the classic Tibia sidebar (OFF by default → full game width).
      toggle(STR.settingSidebar, uiLayout.sidebarOn(), ()=>{ uiLayout.setSidebar(!uiLayout.sidebarOn()); }, oy); oy+=32;
      // roll-direction is a two-value preference, not on/off — show its current value.
      ctx.textAlign="left"; ctx.fillStyle="#20262f"; ctx.fillRect(px,oy,pw,26);
      ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText(STR.settingRollDir,px+10,oy+17);
      ctx.textAlign="right"; ctx.fillStyle=COL.textGold; ctx.font="11px "+FF; ctx.fillText(G.settings.rollAim?STR.rollTowardAim:STR.rollTowardMove,px+pw-10,oy+17);
      ui.pauseRects.push({x:px,y:oy,w:pw,h:26,act:()=>{ G.settings.rollAim=!G.settings.rollAim; save(); }}); oy+=34;
      // CAS-418: restore every draggable HUD panel (DOM + minimap/spell bar) to defaults
      ctx.textAlign="center"; ctx.fillStyle="#20262f"; ctx.fillRect(px,oy,pw,24);
      ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.settingResetHud,VW/2,oy+16);
      ui.pauseRects.push({x:px,y:oy,w:pw,h:24,act:()=>uiLayout.reset()}); oy+=30;
    } else { // controls — 2-column rebind grid + reset
      ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.controlsHint,px,oy); oy+=14;
      const binds=G.settings.binds||settings.defaultBinds();
      const colW=pw/2, rh=21, gridY=oy;
      settings.REBINDS.forEach((rb,i)=>{ const col=i%2, row=(i-col)/2; const cx0=px+col*colW, cy0=gridY+row*rh;
        const arming=G.rebind===rb.a;
        ctx.fillStyle=arming?"#3a2c1e":"#191e26"; ctx.fillRect(cx0,cy0,colW-4,rh-3);
        ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="10px "+FF; ctx.fillText((STR.bindLabel[rb.a]||rb.a),cx0+6,cy0+14);
        ctx.textAlign="right"; ctx.fillStyle=arming?COL.textGold:"#9be7ff"; ctx.font="bold 10px "+FF;
        ctx.fillText(arming?"…":keyLabel(binds[rb.a]), cx0+colW-10, cy0+14);
        ui.pauseRects.push({x:cx0,y:cy0,w:colW-4,h:rh-3,rebind:rb.a}); });
      oy=gridY + Math.ceil(settings.REBINDS.length/2)*rh + 6;
      if(G.rebind){ ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="11px "+FF; ctx.fillText(STR.bindPressKey,VW/2,oy+10); oy+=18; }
      ctx.textAlign="center"; ctx.fillStyle="#20262f"; ctx.fillRect(px,oy,pw,24); ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.bindResetDefaults,VW/2,oy+16);
      ui.pauseRects.push({x:px,y:oy,w:pw,h:24,act:()=>{ settings.resetBinds(); G.rebind=null; }}); oy+=30;
    }
    // ---- pinned footer (Resume + replay guide + new game) ----
    let fy=y+bh-118;
    ctx.textAlign="center"; ctx.fillStyle="#20262f"; ctx.fillRect(px,fy,pw,24); ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(STR.tutReplay,VW/2,fy+16);
    // CAS-267: "reset onboarding" — replay now AND re-arm the persisted first-load
    // flag (clearTutSeen) so the coachmark also auto-shows again on the next fresh load.
    ui.pauseRects.push({x:px,y:fy,w:pw,h:24,act:()=>{ clearTutSeen(); G.scene="play"; sim.startTutorial(); }}); fy+=30;
    // CAS-113: "Nueva partida" — two-tap arm/confirm so a misclick can't nuke a run.
    if(G.resetArm){
      const half=(pw-8)/2;
      ctx.fillStyle="#3a2222"; ctx.fillRect(px,fy,half,24); ctx.fillStyle="#f0a0a0"; ctx.font="bold 11px "+FF; ctx.fillText("SÍ, BORRAR",px+half/2,fy+16);
      ui.pauseRects.push({x:px,y:fy,w:half,h:24,act:()=>{ G.resetArm=false; resetGame(); }});
      ctx.fillStyle="#20262f"; ctx.fillRect(px+half+8,fy,half,24); ctx.fillStyle=COL.cream; ctx.fillText("Cancelar",px+half+8+half/2,fy+16);
      ui.pauseRects.push({x:px+half+8,y:fy,w:half,h:24,act:()=>{ G.resetArm=false; }});
    } else {
      ctx.fillStyle="#2a1c14"; ctx.fillRect(px,fy,pw,24); ctx.fillStyle="#caa07a"; ctx.font="12px "+FF; ctx.fillText("Nueva partida (borrar guardado)",VW/2,fy+16);
      ui.pauseRects.push({x:px,y:fy,w:pw,h:24,act:()=>{ G.resetArm=true; }});
    }
    fy+=32;
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(VW/2-90,fy,180,30); ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText(STR.resume,VW/2,fy+20);
    ui.pauseRects.push({x:VW/2-90,y:fy,w:180,h:30,act:()=>{ G.resetArm=false; G.rebind=null; G.scene="play"; }});
  }

  // CAS-277: end-of-run RECAP. The death terminal now shows a concise "this run" summary
  // (READ from the frozen G.recap delta — no new economy) and turns the moment into "one
  // more run": a prominent OTRA RONDA primary + a calm Pueblo/Menú secondary. Keyboard +
  // touch (writes ui.deadRects). Honors reduce-motion (no drifting sparks) and is hue-safe.
  function renderDeath(){ ui.deadRects=[];
    ctx.fillStyle="rgba(40,8,8,0.66)"; ctx.fillRect(0,0,VW,VH);
    const cx=VW/2; let y=VH*0.16;
    ctx.textAlign="center";
    ctx.fillStyle=COL.skullR; ctx.font="bold 38px "+FF; ctx.fillText(STR.deathTitle,cx,y); y+=28;
    ctx.fillStyle=COL.cream; ctx.font="14px "+FF; ctx.fillText(STR.deathSub,cx,y); y+=34;
    // CAS-1664: in Arena de Oleadas the run's SCORE is the wave reached — surface it (and the best)
    // as a gold banner above the recap so the endgame result reads at a glance.
    if(G.arenaMode){ ctx.fillStyle=COL.textGold; ctx.font="bold 16px "+FF;
      ctx.fillText("Oleada alcanzada: "+(G.arena.wave|0)+"  ·  Mejor: "+(G.arena.best|0), cx, y); y+=22;
      // CAS-1675 — surface the persistent boss-wave record alongside the wave record.
      ctx.fillStyle=COL.cream; ctx.font="13px "+FF;
      ctx.fillText("Mejor Jefe: Oleada "+(G.arena.bestBossWave|0), cx, y); y+=24; }
    // CAS-1988: in Boss Rush the SCORE is the round reached — surface it (+ the best) as a gold banner.
    if(G.bossRushMode){ const N=BOSS_RUSH.sequence.length;
      ctx.fillStyle=COL.textGold; ctx.font="bold 16px "+FF;
      ctx.fillText("Ronda alcanzada: "+((G.bossRush.round|0)+1)+"/"+N+"  ·  Mejor: "+(G.bossRush.best|0), cx, y); y+=24; }
    // recap summary panel — reads the frozen delta snapshot built at death (G.recap)
    const r=G.recap;
    if(r){
      ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText(STR.recapHead,cx,y); y+=10;
      const lines=[ STR.recapTime(fmtTime(r.time)), STR.recapKills(r.kills|0), STR.recapGold(r.gold|0),
        STR.recapElites(r.elites|0), (r.lvlUp>0?STR.recapLevelUp(r.lvl|0,r.lvlUp|0):STR.recapLevel(r.lvl|0)) ];
      const pw=Math.min(VW*0.7,340), ph=lines.length*22+18, px=cx-pw/2;
      ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(px,y,pw,ph);
      ctx.fillStyle=COL.panelB; ctx.fillRect(px,y,pw,3);
      ctx.font="14px "+FF; ctx.textAlign="left"; ctx.fillStyle=COL.cream;
      let ly=y+24; for(const ln of lines){ ctx.fillText(ln, px+16, ly); ly+=22; }
      ctx.textAlign="center"; y+=ph+16;
    }
    // CAS-1557: the meta payoff — Esencia earned this run (frozen on the recap) + total banked.
    // Its own gold-accented line so the between-run currency reads at a glance.
    if(r && typeof r.essence==="number"){
      ctx.fillStyle=COL.textGold; ctx.font="bold 15px "+FF;
      ctx.fillText("✦ "+STR.recapEssence(r.essence|0)+"   ("+STR.altarBanked(r.essenceTotal|0)+")", cx, y); y+=22;
    }
    // CAS-1565: Ascensión badge on the recap (only once earned) — the multiplier already folded
    // into the essence gain above, surfaced so the prestige level reads at the between-run screen.
    { const al=(sim.metaSnap().ascension.level|0);
      if(al>0){ ctx.fillStyle="#c9a0ff"; ctx.font="bold 12px "+FF; ctx.fillText("★ "+STR.altarAscBadge(al), cx, y); y+=20; } }
    // PRIMARY — Otra ronda (bind-aware: surfaces the player's attack/confirm key)
    const binds=(G.settings&&G.settings.binds)||settings.defaultBinds();
    const retryKey=keyLabel(binds.attack)+"/Espacio";
    const bw=Math.min(VW*0.7,300), bx=cx-bw/2;
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(bx,y,bw,44);
    ctx.fillStyle=COL.textGold; ctx.fillRect(bx,y,bw,3);
    ctx.fillStyle=COL.textGold; ctx.font="bold 16px "+FF; ctx.fillText(STR.recapRetry(retryKey),cx,y+28);
    ui.deadRects.push({x:bx,y:y,w:bw,h:44,act:"retry"});
    y+=56;
    // CAS-1557: ALTAR — spend banked Esencia BETWEEN runs (before retrying). A gold-framed
    // secondary so it reads as the "invest before you go again" beat. Routed via ui.deadRects.
    const aw=Math.min(VW*0.55,240), ax=cx-aw/2;
    ctx.fillStyle="rgba(38,30,16,0.92)"; ctx.fillRect(ax,y,aw,34);
    ctx.fillStyle=COL.textGold; ctx.fillRect(ax,y,aw,2);
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF; ctx.fillText("✦ "+STR.altarOpen,cx,y+22);
    ui.deadRects.push({x:ax,y:y,w:aw,h:34,act:"altar"});
    y+=44;
    // SECONDARY — Pueblo / Menú (calm regroup at the fountain)
    const sw=Math.min(VW*0.55,240), sx=cx-sw/2;
    ctx.fillStyle="rgba(20,20,28,0.85)"; ctx.fillRect(sx,y,sw,34);
    ctx.fillStyle=COL.textDim; ctx.font="bold 13px "+FF; ctx.fillText(STR.recapHub,cx,y+22);
    ui.deadRects.push({x:sx,y:y,w:sw,h:34,act:"hub"});
    ctx.textAlign="left";
  }

  // CAS-1557: the ALTAR OF SOULS panel — the account-wide meta-progression shop, opened from
  // the death screen. Canvas HUD styling (no new assets; glyph placeholders per the plan — the
  // AD art issue drops polished icons later, non-blocking). Reads the sim's metaSnap() view
  // model; each row's buy button writes ui.altarRects, consumed by input.js altarTap. Esc/tap
  // "Volver" returns to the death recap so the retry/hub flow is preserved.
  // CAS-1557/1565: draw ONE altar node row at [px,y] with height rh; pushes the buy rect when
  // affordable. Shared by the Tier-1 and Tier-2 rows so both tiers read identically. rh is adaptive
  // (the fully-unlocked altar packs 10 rows), so icon/button sizes derive from it.
  function altarRow(n, essence, px, pw, y, rh){
    const capped=(n.cost==null), affordable=!capped && essence>=n.cost, isz=Math.min(32,rh-12);
    ctx.fillStyle="rgba(0,0,0,0.45)"; ctx.fillRect(px,y,pw,rh);
    ctx.fillStyle=n.lvl>0?COL.textGold:COL.panelB; ctx.fillRect(px,y,3,rh);
    // CAS-1562: PNG node icon (art CAS-1558), glyph as load-fallback (CAS-417 idiom). Tier-2 icons
    // ship later (AD) → their altar_t2_*.png are absent → the glyph branch renders, non-blocking.
    const im=IMG["assets/ui/icons/altar_"+n.key.toLowerCase()+".png"], iy=y+(rh-isz)/2;
    if(im&&im.complete&&im.naturalWidth){ ctx.drawImage(im,px+9,iy,isz,isz); }
    else { ctx.fillStyle="rgba(40,34,20,0.9)"; ctx.fillRect(px+9,iy,isz,isz);
      ctx.fillStyle=COL.textGold; ctx.font=(isz-8)+"px "+FF; ctx.textAlign="center"; ctx.fillText(n.glyph,px+9+isz/2,iy+isz-6); }
    // CAS-1580: an unlock row (cap:1) shows a 🔒/✓ state chip on the label and swaps the button copy.
    const lbl=(n.unlock?(n.unlocked?"✓ ":"🔒 "):"")+n.label;
    ctx.textAlign="left"; ctx.fillStyle=(n.unlock&&n.unlocked)?COL.textGold:COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(lbl,px+isz+18,y+rh*0.42);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(n.eff+"   "+STR.altarLvl(n.lvl,n.cap),px+isz+18,y+rh*0.80);
    const bw=100, bx=px+pw-bw-8, by=y+6, bh=rh-12;
    if(capped){ ctx.fillStyle=(n.unlock)?"rgba(30,44,30,0.9)":"rgba(30,30,36,0.9)"; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=(n.unlock)?"#7bd44a":COL.textDim; ctx.font="bold 11px "+FF; ctx.textAlign="center"; ctx.fillText(n.unlock?STR.altarUnlocked:STR.altarMax,bx+bw/2,by+bh/2+4); }
    else { ctx.fillStyle=affordable?"#3a2c1e":"rgba(30,26,20,0.85)"; ctx.fillRect(bx,by,bw,bh);
      ctx.fillStyle=affordable?COL.textGold:COL.textDim; ctx.fillRect(bx,by,bw,2);
      ctx.fillStyle=affordable?COL.textGold:COL.textDim; ctx.font="bold 11px "+FF; ctx.textAlign="center";
      ctx.fillText(n.unlock?STR.altarUnlock:STR.altarBuy,bx+bw/2,by+bh/2-3); ctx.font="10px "+FF; ctx.fillText(STR.altarCost(n.cost),bx+bw/2,by+bh/2+11);
      if(affordable) ui.altarRects.push({x:bx,y:by,w:bw,h:bh,key:n.key}); }
    ctx.textAlign="left";
  }
  // CAS-1649: draw ONE legacy-choice row at [px,y] (height rh) — the altar row idiom (bg + glyph
  // box + label/eff + a right-side action button), but pushes to ui.legacyRects with {key} (no cost,
  // always tappable). $0 art: reuses the node glyph. Shows the current owned count as "· xN".
  function legacyRow(n, px, pw, y, rh){
    const isz=Math.min(32,rh-12), iy=y+(rh-isz)/2;
    ctx.fillStyle="rgba(0,0,0,0.45)"; ctx.fillRect(px,y,pw,rh);
    ctx.fillStyle="#c9a0ff"; ctx.fillRect(px,y,3,rh);
    ctx.fillStyle="rgba(40,34,20,0.9)"; ctx.fillRect(px+9,iy,isz,isz);
    ctx.fillStyle=COL.textGold; ctx.font=(isz-8)+"px "+FF; ctx.textAlign="center"; ctx.fillText(n.glyph,px+9+isz/2,iy+isz-6);
    const lbl=n.label+(n.owned>0?"  · x"+n.owned:"");
    ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 13px "+FF; ctx.fillText(lbl,px+isz+18,y+rh*0.42);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(n.eff,px+isz+18,y+rh*0.80);
    const bw=100, bx=px+pw-bw-8, by=y+6, bh=rh-12;
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(bx,by,bw,bh); ctx.fillStyle=COL.textGold; ctx.fillRect(bx,by,bw,2);
    ctx.fillStyle=COL.textGold; ctx.font="bold 11px "+FF; ctx.textAlign="center"; ctx.fillText("Elegir",bx+bw/2,by+bh/2+4);
    ui.legacyRects.push({x:bx,y:by,w:bw,h:bh,key:n.key});
    ctx.textAlign="left";
  }
  function renderAltar(){
    ui.altarRects=[]; ui.legacyRects=[];
    ctx.fillStyle="rgba(14,10,20,0.9)"; ctx.fillRect(0,0,VW,VH);
    const snap=sim.metaSnap(), essence=snap.essence|0, cx=VW/2;
    const asc=snap.ascension||{level:0,mult:1}, showT2=!!snap.t2Unlocked;
    ctx.textAlign="center";
    let y=VH*0.055;
    ctx.fillStyle=COL.textGold; ctx.font="bold 24px "+FF; ctx.fillText(STR.altarTitle,cx,y); y+=20;
    ctx.fillStyle=COL.cream; ctx.font="11px "+FF; ctx.fillText(STR.altarSub,cx,y); y+=18;
    // CAS-1565: Ascensión badge (only once earned) — the prestige level + its permanent essence mult.
    if((asc.level|0)>0){ ctx.fillStyle="#c9a0ff"; ctx.font="bold 13px "+FF; ctx.fillText("★ "+STR.altarAscBadge(asc.level|0),cx,y); y+=17; }
    ctx.fillStyle=COL.textGold; ctx.font="bold 17px "+FF; ctx.fillText("✦ "+STR.altarBanked(essence),cx,y); y+=16;
    // Adaptive row height: reserve chrome (Tier-2 divider + Ascender + Back) and fit the rows in the rest.
    const pw=Math.min(VW*0.86,470), px=cx-pw/2, gap=6;
    // CAS-1574/1580: ability-rank + ability-unlock rows are ALWAYS shown (never gated) → count them + their dividers.
    const abils=snap.abilities||[], unlocks=snap.unlocks||[];
    const rowCount=snap.nodes.length+abils.length+unlocks.length+(showT2?snap.t2.length:0);
    const abilDivH=abils.length?20:0, unlockDivH=unlocks.length?20:0;
    const dividerH=showT2?22:0, ascendH=(showT2?40:0), backH=30, chrome=abilDivH+unlockDivH+dividerH+ascendH+backH+18;
    const avail=VH-y-chrome;
    const rh=Math.max(28, Math.min(50, Math.floor(avail/Math.max(1,rowCount))-gap));
    // Tier-1 rows
    for(const n of snap.nodes){ altarRow(n,essence,px,pw,y,rh); y+=rh+gap; }
    // CAS-1574: HABILIDADES — permanent ability-rank upgrades (always available, ungated). Reuses
    // altarRow (glyph icon fallback = $0 art), so the buy button pushes {key:"rank_<id>"} → the
    // generic altarTap buy path already handles it.
    if(abils.length){
      ctx.textAlign="center"; ctx.fillStyle="#8fd0ff"; ctx.font="bold 12px "+FF; ctx.fillText(STR.altarAbilities,cx,y+13); y+=abilDivH;
      for(const n of abils){ altarRow(n,essence,px,pw,y,rh); y+=rh+gap; }
    }
    // CAS-1580: DESBLOQUEOS — permanent Esencia unlocks for the locked abilities (always shown, ungated).
    // Reuses altarRow (cap:1 → "Desbloquear"/"✓ DESBLOQUEADA"); the buy button pushes {key:"unlock_<id>"}
    // → the same generic altarTap buy path (buyMetaNode) handles it with zero new input wiring.
    if(unlocks.length){
      ctx.textAlign="center"; ctx.fillStyle="#ffb27a"; ctx.font="bold 12px "+FF; ctx.fillText(STR.altarUnlocks,cx,y+13); y+=unlockDivH;
      for(const n of unlocks){ altarRow(n,essence,px,pw,y,rh); y+=rh+gap; }
    }
    // CAS-1565: Tier-2 — locked note until every v1 node is maxed, then the second row + Ascender.
    if(!showT2){
      ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.altarTier2Locked,cx,y+12); y+=22;
    } else {
      ctx.textAlign="center"; ctx.fillStyle="#c9a0ff"; ctx.font="bold 12px "+FF; ctx.fillText(STR.altarTier2,cx,y+14); y+=dividerH;
      for(const n of snap.t2){ altarRow(n,essence,px,pw,y,rh); y+=rh+gap; }
      // Ascender button — enabled only at full max (v1 + Tier-2), else shown disabled with the requisite.
      const can=!!snap.canAscend, aw=Math.min(pw,300), ax=cx-aw/2, ah=34;
      ctx.fillStyle=can?"#4a2c5e":"rgba(30,26,34,0.85)"; ctx.fillRect(ax,y,aw,ah);
      ctx.fillStyle=can?"#c9a0ff":COL.textDim; ctx.fillRect(ax,y,aw,2);
      ctx.fillStyle=can?"#e6c8ff":COL.textDim; ctx.font="bold 13px "+FF; ctx.textAlign="center";
      ctx.fillText(can?STR.altarAscend:STR.altarAscend+"  ·  "+STR.altarAscendReq, cx, y+ah/2+5);
      if(can) ui.altarRects.push({x:ax,y:y,w:aw,h:ah,act:"ascend"});
      y+=ascendH;
    }
    // back button
    const kw=Math.min(VW*0.5,220), kx=cx-kw/2;
    ctx.fillStyle="rgba(20,20,28,0.9)"; ctx.fillRect(kx,y,kw,28);
    ctx.fillStyle=COL.textDim; ctx.font="bold 12px "+FF; ctx.textAlign="center"; ctx.fillText(STR.altarBack,cx,y+19);
    ui.altarRects.push({x:kx,y:y,w:kw,h:28,act:"back"});
    ctx.textAlign="left";
    // CAS-1565: Ascensión confirm modal — an explicit trade-off gate before the sacrifice. When open,
    // it OWNS input: clear the underlying rects so only Confirmar/Cancelar are tappable.
    if(ui.altarAscendConfirm){
      ui.altarRects=[];
      ctx.fillStyle="rgba(0,0,0,0.72)"; ctx.fillRect(0,0,VW,VH);
      const mw=Math.min(VW*0.86,420), mh=190, mx=cx-mw/2, my=VH/2-mh/2;
      ctx.fillStyle="#1b1526"; ctx.fillRect(mx,my,mw,mh); ctx.fillStyle="#c9a0ff"; ctx.fillRect(mx,my,mw,3);
      ctx.textAlign="center"; ctx.fillStyle="#e6c8ff"; ctx.font="bold 18px "+FF; ctx.fillText(STR.altarAscConfirmTitle,cx,my+34);
      ctx.fillStyle=COL.cream; ctx.font="12px "+FF;
      const nextLvl=(asc.level|0)+1;
      wrapText(STR.altarAscConfirmBody(nextLvl, 1+0.25*nextLvl), cx, my+62, mw-40, 17);
      const byw=Math.min((mw-40)/2-8,150), byy=my+mh-48, gap2=16;
      const yx=cx-byw-gap2/2, nx=cx+gap2/2;
      ctx.fillStyle="#4a2c5e"; ctx.fillRect(yx,byy,byw,34); ctx.fillStyle="#c9a0ff"; ctx.fillRect(yx,byy,byw,2);
      ctx.fillStyle="#e6c8ff"; ctx.font="bold 13px "+FF; ctx.fillText(STR.altarAscYes,yx+byw/2,byy+22);
      ctx.fillStyle="rgba(40,36,46,0.95)"; ctx.fillRect(nx,byy,byw,34);
      ctx.fillStyle=COL.cream; ctx.fillText(STR.altarAscNo,nx+byw/2,byy+22);
      ui.altarRects.push({x:yx,y:byy,w:byw,h:34,act:"ascendYes"},{x:nx,y:byy,w:byw,h:34,act:"ascendNo"});
      ctx.textAlign="left";
    }
    // CAS-1649: LEGACY-CHOICE modal — opened right after a confirmed sacrifice. It OWNS input (clear
    // the underlying altar rects so only the legacy rows are tappable) and presents legacyChoices —
    // a FORCED pick (no cancel): choosing one grants it permanently and closes the modal.
    if(ui.legacyChoose){
      ui.altarRects=[];
      const choices=snap.legacyChoices||[];
      ctx.fillStyle="rgba(0,0,0,0.78)"; ctx.fillRect(0,0,VW,VH);
      const mw=Math.min(VW*0.9,480), rh=Math.max(40,Math.min(58,Math.floor((VH*0.62)/Math.max(1,choices.length))-8));
      const mh=Math.min(VH*0.9, 96+choices.length*(rh+8)), mx=cx-mw/2, my=VH/2-mh/2;
      ctx.fillStyle="#1b1526"; ctx.fillRect(mx,my,mw,mh); ctx.fillStyle="#c9a0ff"; ctx.fillRect(mx,my,mw,3);
      ctx.textAlign="center"; ctx.fillStyle="#e6c8ff"; ctx.font="bold 18px "+FF; ctx.fillText("✦ Elige un Nodo de Legado",cx,my+30);
      ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText("Permanente · sobrevive al sacrificio del altar",cx,my+50);
      const px2=mx+16, pw2=mw-32; let ly=my+66;
      for(const n of choices){ legacyRow(n,px2,pw2,ly,rh); ly+=rh+8; }
      ctx.textAlign="left";
    }
  }

  // CAS-123: the Stage-1 VICTORY / run-completion screen. Reads the frozen G.victory
  // snapshot built by the sim when the final boss died; a calm gold overlay (not the red
  // death wash), a run summary, and one button → free play with the same hero.
  function renderVictory(){
    const v=G.victory; if(!v){ return; }
    // backdrop — deep blue→gold celebratory wash + drifting sparks (seeded → stable)
    ctx.fillStyle="rgba(10,14,26,0.82)"; ctx.fillRect(0,0,VW,VH);
    rrng.seed(123); for(let i=0;i<70;i++){ const sx=rr(0,VW), sy=rr(0,VH); const tw=0.4+0.6*Math.abs(Math.sin(G.t*2+i));
      ctx.globalAlpha=0.25+0.4*tw; ctx.fillStyle=i%5===0?COL.textGold:"#7fd6ff"; ctx.fillRect(sx,sy,2,2); }
    ctx.globalAlpha=1;
    const cx=VW/2; let y=VH*0.18;
    // title
    ctx.textAlign="center";
    ctx.fillStyle=COL.out; ctx.font="bold 46px "+FF; ctx.fillText(STR.victoryTitle, cx+3, y+3);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.victoryTitle, cx, y); y+=40;
    ctx.fillStyle=COL.cream; ctx.font="14px "+FF; wrapText(STR.victorySub(v.bossName), cx, y, VW*0.8, 18); y+=46;
    // summary panel
    const clsName=(STR.classLabel&&STR.classLabel[v.cls])||v.cls;
    const rarName=(STR.rarityLabel&&v.lootRarity&&STR.rarityLabel[v.lootRarity])||v.lootRarity||"";
    const lines=[ STR.victoryClass(clsName), STR.victoryLevel(v.lvl), STR.victoryTime(fmtTime(v.playT)),
      STR.victoryDeaths(v.deaths), STR.victoryGold(v.gold) ];
    if(v.lootName) lines.push(STR.victoryLoot(v.lootName, rarName));
    const pw=Math.min(VW*0.7,360), ph=lines.length*22+20, px=cx-pw/2;
    ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(px,y,pw,ph);
    ctx.fillStyle=COL.panelB; ctx.fillRect(px,y,pw,3);
    ctx.font="14px "+FF; ctx.textAlign="left"; ctx.fillStyle=COL.cream;
    let ly=y+24; for(const ln of lines){ ctx.fillText(ln, px+18, ly); ly+=22; }
    y+=ph+28;
    // continue button (free play)
    ctx.textAlign="center";
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(cx-150,y,300,40);
    ctx.fillStyle=COL.textGold; ctx.font="bold 15px "+FF; ctx.fillText(STR.victoryContinue, cx, y+26);
    y+=58; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; wrapText(STR.victoryFooter, cx, y, VW*0.75, 16);
    ctx.textAlign="left";
  }
  // minimal word-wrap centred at x (used by the victory screen)
  function wrapText(txt, x, y, maxW, lh){ const words=String(txt).split(" "); let line="", yy=y;
    for(const w of words){ const t=line?line+" "+w:w; if(ctx.measureText(t).width>maxW && line){ ctx.fillText(line,x,yy); line=w; yy+=lh; } else line=t; }
    if(line) ctx.fillText(line,x,yy); return yy; }
  function fmtTime(s){ s=Math.max(0,Math.floor(s)); const m=Math.floor(s/60); const ss=s%60; return m+"m "+(ss<10?"0":"")+ss+"s"; }

  // CAS-128: the onboarding coachmark card. Top-centre (below the zone/objective HUD,
  // clear of the bottom touch joystick + action buttons), device-aware copy, with a
  // Skip button (writes ui.tutSkipRect for the input layer). No screen dim — it teaches
  // over live play. Deterministic: reads G.tut only, no RNG.
  function tutWrap(txt,maxW){ const words=String(txt).split(" "); const out=[]; let line="";
    for(const w of words){ const t=line?line+" "+w:w; if(ctx.measureText(t).width>maxW && line){ out.push(line); line=w; } else line=t; }
    if(line) out.push(line); return out; }
  function renderTutorial(){ const t=G.tut; if(!t) return; const step=sim.TUT_STEPS[t.i];
    // CAS-267: resolve copy against the player's LIVE keybindings (CAS-265 rebind
    // table) so the coachmark never shows a stale/hardcoded key. `pc` copy may be a
    // function of this resolver; touch copy / legacy strings pass through unchanged.
    // CAS-2017: the combat verbs bind to KNOB keys (fixed), not the rebindable table. One resolver serves
    // both — a knob alias resolves to keyLabel(<KNOB>.key), everything else to the live rebind table — so a
    // coachmark NEVER shows a hardcoded literal (same discipline as the Códice's keyOf). dodge = the `roll`
    // rebind; backstab is positional (no key ⇒ no alias). No alias collides with a rebind action name.
    const ONB_KNOB_KEY={ parry:PARRY.key, lockon:LOCK_ON.key, estus:FLASK.key, bonfire:BONFIRE.key };
    const tutKey=(a)=> (a in ONB_KNOB_KEY) ? keyLabel(ONB_KNOB_KEY[a]) : keyLabel((G.settings.binds||settings.defaultBinds())[a]);
    const bindAware=(v)=> typeof v==="function" ? v(tutKey) : v;
    let head, body, showSkip=true, prog=true;
    if(step==="done"){ head=STR.tutDoneHead; body=bindAware(STR.tutDone);
      // CAS-2017 (design D6): the terminal card points at the Códice for the rest — gated on the primer being
      // armed AND the Códice live (both off ⇒ done card byte-identical to HEAD). Pure pointer, no dependency.
      if(ONBOARDING.enabled && COMBAT_CODEX.enabled) body += " " + STR.tutDoneCodex(keyLabel(COMBAT_CODEX.codexKey));
      showSkip=false; prog=false; }
    else { head=STR.tutHead[step]||STR.tutTitle; const s=STR.tutSteps[step]; body=s?bindAware(isTouch?s.touch:s.pc):""; }
    const cw=Math.min(VW*0.86,460), cx=VW/2, x=cx-cw/2, y=VH*0.15, lh=17;
    ctx.font="13px "+FF; const lines=tutWrap(body, cw-28);
    const ch=44 + lines.length*lh + 14;
    // card
    ctx.fillStyle="rgba(8,10,14,0.86)"; ctx.fillRect(x,y,cw,ch);
    ctx.fillStyle=step==="done"?COL.heal:COL.textGold; ctx.fillRect(x,y,cw,3);
    // header strip: title · step  (left)  +  skip (right)
    ctx.textAlign="left"; ctx.font="bold 12px "+FF; ctx.fillStyle=COL.textGold;
    ctx.fillText(prog?(STR.tutTitle+"  ·  "+STR.tutStepLabel(t.i+1, sim.TUT_NSTEPS)):STR.tutTitle, x+14, y+18);
    if(showSkip){ const st=STR.tutSkip; ctx.font="bold 12px "+FF; const sw=ctx.measureText(st).width+16, sx=x+cw-sw-10, sy=y+5, sh=18;
      ctx.fillStyle="#20262f"; ctx.fillRect(sx,sy,sw,sh); ctx.fillStyle=COL.cream; ctx.textAlign="center"; ctx.fillText(st, sx+sw/2, sy+13);
      ui.tutSkipRect={x:sx,y:sy,w:sw,h:sh}; }
    else ui.tutSkipRect={x:0,y:0,w:0,h:0};
    // action verb + wrapped instruction
    ctx.textAlign="center"; ctx.fillStyle=step==="done"?COL.heal:"#9be7ff"; ctx.font="bold 13px "+FF; ctx.fillText(head, cx, y+36);
    ctx.fillStyle=COL.cream; ctx.font="13px "+FF; let yy=y+54; for(const ln of lines){ ctx.fillText(ln, cx, yy); yy+=lh; }
    ctx.textAlign="left";
  }
  function renderToast(){ if(G.toastT<=0) return; const a=clamp(G.toastT,0,1); ctx.globalAlpha=a; ctx.textAlign="center";
    ctx.font="bold 15px "+FF; const w=ctx.measureText(G.toast).width+24; ctx.fillStyle="rgba(8,10,14,0.9)"; ctx.fillRect(VW/2-w/2,VH*0.18,w,30);
    ctx.fillStyle=COL.panelB; ctx.fillRect(VW/2-w/2,VH*0.18,w,3); ctx.fillStyle=COL.textGold; ctx.fillText(G.toast,VW/2,VH*0.18+20); ctx.globalAlpha=1; }

  function renderTouch(){ const tb=tbtns(); const top=topBtns();
    // joystick
    if(stick.active){ ctx.globalAlpha=0.5; ctx.fillStyle="#1a1e26"; ctx.beginPath(); ctx.arc(stick.cx,stick.cy,52,0,6.28); ctx.fill();
      ctx.fillStyle="#5a4632"; let dx=stick.x-stick.cx,dy=stick.y-stick.cy; const m=Math.hypot(dx,dy)||1; const cl=Math.min(m,48); ctx.beginPath(); ctx.arc(stick.cx+dx/m*cl,stick.cy+dy/m*cl,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    // CAS-1614: mobile-contrast pass. ≥65% dark fill (0.55→0.68) so each button reads as a solid
    // disc over bright terrain; a crisp 2px colour-key outline (full alpha) rings it; the label
    // carries a near-black shadow so the bright glyph stays legible on light ground.
    function btn(b,col,big){ if(!b.r) return;
      const kc=col||COL.cream;
      ctx.globalAlpha=0.68; ctx.fillStyle="#12161d"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.28); ctx.fill();
      ctx.globalAlpha=1; ctx.strokeStyle=col||COL.panelB; ctx.lineWidth=2; ctx.stroke();
      ctx.font="bold "+(big?20:14)+"px "+FF; ctx.textAlign="center"; const ly=b.y+(big?7:5);
      ctx.fillStyle=COL.out; ctx.fillText(b.label,b.x+1,ly+1); ctx.fillStyle=kc; ctx.fillText(b.label,b.x,ly); }
    btn(tb.attack,COL.textGold,true); btn(tb.roll,COL.cream); btn(tb.s2,COL.flame); btn(tb.s3,COL.heal); btn(tb.s4,COL.rune); btn(tb.act,COL.cream); btn(tb.pick,COL.cream);
    if(tb.flask) btn(tb.flask,COL.heal); // CAS-1854: botón táctil del Estus (present only when FLASK.enabled ⇒ tb.flask undefined OFF ⇒ byte-id)
    if(tb.block) btn(tb.block, G.hero&&G.hero.blocking ? "#dff1ff" : "#7fb0d8"); // CAS-1873: botón HOLD del bloqueo (present only when SHIELD_BLOCK.enabled ⇒ undefined OFF ⇒ byte-id); se ilumina con la guardia arriba
    if(tb.twohand) btn(tb.twohand, G.hero&&G.hero.twoHand ? "#ffcf7a" : "#c79a55"); // CAS-1895: botón TOGGLE de empuñadura a dos manos (present only when TWO_HAND.enabled ⇒ undefined OFF ⇒ byte-id); se ilumina con la postura activa
    if(tb.weaponart) btn(tb.weaponart, G.hero&&(G.hero.artCD>0) ? "#6b5aa8" : "#b49af0"); // CAS-1914: botón del ARTE DE ARMA (present only when WEAPON_ARTS.enabled ⇒ undefined OFF ⇒ byte-id); se ATENÚA durante el cooldown (artCD>0)
    if(tb.guardbreak) btn(tb.guardbreak, G.hero&&(G.hero._gbCd>0) ? "#8a6a4a" : "#e0b060"); // CAS-2146: botón del EMPUJÓN/ROMPE-GUARDIA (present only when GUARD_BREAK.enabled ⇒ undefined OFF ⇒ byte-id); se ATENÚA durante la recuperación (_gbCd>0)
    if(tb.lunge) btn(tb.lunge, G.hero&&(G.hero._lungeCd>0) ? "#4a6a8a" : "#60b0e0"); // CAS-2156: botón de la ESTOCADA DE AVANCE (present only when LUNGE.enabled ⇒ undefined OFF ⇒ byte-id); se ATENÚA durante la recuperación (_lungeCd>0)
    if(tb.bounty){ const h=G.hero, b=h&&h.bounty; let rdy=false; // CAS-2273: botón del TABLÓN (present only when BOUNTY_BOARD.enabled Y en la SAFEZONE ⇒ undefined fuera/OFF ⇒ byte-id)
      if(b){ const cur=(b.target==="any")?(h.kills|0):(((h.killsByType||{})[b.target])|0); rdy=(Math.max(0,Math.min(b.count|0,cur-(b.base|0)))>=(b.count|0))&&(b.count|0)>0; } // progreso DERIVADO puro (mismo cálculo que renderBountyBadge; 0 sim, 0 RNG)
      btn(tb.bounty, rdy?COL.textGold:"#c8a24a"); } // se ilumina en oro cuando el contrato está LISTO para reclamar
    if(tb.quartermaster){ const h=G.hero; let ready=false; // CAS-2278: botón del INTENDENTE (present only when SANCTUARY_REWARDS.enabled Y en la SAFEZONE ⇒ undefined fuera/OFF ⇒ byte-id)
      if(h){ const defs=SANCTUARY_REWARDS.rewards||[], ranks=SANCTUARY_REP.ranks||[]; const rep=Math.max(0,h.sanctuaryRep|0);
        let repIdx=0; for(let i=0;i<ranks.length;i++){ if(rep>=(ranks[i].at|0)) repIdx=i; }
        const rankIdxOf=id=>{ for(let i=0;i<ranks.length;i++){ if(ranks[i].id===id) return i; } return 1e9; };
        const ca=Array.isArray(h.sanctuaryRewards)?h.sanctuaryRewards:null;
        for(const d of defs){ if(repIdx>=rankIdxOf(d.rank) && !(ca&&ca.indexOf(d.id)>=0)){ ready=true; break; } } } // ¿hay recompensa lista? (progreso DERIVADO puro, 0 sim/RNG)
      btn(tb.quartermaster, ready?"#e0b0ff":"#8f7ab0"); } // se ilumina en violeta cuando hay una recompensa de renombre LISTA para reclamar
    if(tb.emissary){ const h=G.hero, q=h&&h.emissary, sched=G.emissary; let rdy=false; // CAS-2292: botón del EMISARIO (present only when SANCTUARY_EMISSARY.enabled Y en la SAFEZONE ⇒ undefined fuera/OFF ⇒ byte-id)
      if(q && sched && (q.period|0)===(sched.period|0)){ const cur=(q.target==="any")?(h.kills|0):(((h.killsByType||{})[q.target])|0); rdy=(!q.claimed)&&(Math.max(0,Math.min(q.count|0,cur-(q.base|0)))>=(q.count|0))&&(q.count|0)>0; } // progreso DERIVADO puro (mismo cálculo que renderEmissaryBadge; 0 sim, 0 RNG)
      btn(tb.emissary, rdy?COL.textGold:"#5aa0e0"); } // se ilumina en oro cuando la world-quest está LISTA para entregar
    if(tb.throwable){ const h=G.hero; const noThrow=!h || h.throwCD>0 || h.throwWind>0 || (h[tb.throwable.chargeKey]||0)<=0; btn(tb.throwable, noThrow?"#7a5a3a":"#e0a45a"); // CAS-1920: botón del ARROJADIZO (present only when THROWABLES.enabled ⇒ undefined OFF ⇒ byte-id); se ATENÚA sin cargas / en cooldown / durante el windup; muestra el glyph del tipo activo
      if(h){ ctx.font="bold 9px "+FF; ctx.textAlign="center"; const cn=""+(h[tb.throwable.chargeKey]||0); ctx.fillStyle=COL.out; ctx.fillText(cn,tb.throwable.x+1,tb.throwable.y+tb.throwable.r+10); ctx.fillStyle=noThrow?"#caa27a":"#ffd9a0"; ctx.fillText(cn,tb.throwable.x,tb.throwable.y+tb.throwable.r+9); } } // conteo de cargas bajo el botón
    if(tb.throwcycle) btn(tb.throwcycle, "#c79a55"); // CAS-1920: botón de CICLAR el tipo de arrojadizo (present only when THROWABLES.enabled ⇒ undefined OFF ⇒ byte-id)
    if(tb.weaponbuff){ const h=G.hero; const t=h&&h._wbuff&&h.wbuffT>0&&WEAPON_BUFFS.types[h._wbuff]; const noBuff=!h||h.applyBuffT>0||(h[tb.weaponbuff.chargeKey]||0)<=0;
      btn(tb.weaponbuff, noBuff?"#5a5a3a":(t?t.tint:"#c8b86e")); // CAS-1926: botón de APLICAR resina (present only when WEAPON_BUFFS.enabled ⇒ undefined OFF ⇒ byte-id); se ilumina con el tinte del buff activo / atenúa sin cargas / durante el windup
      if(h){ ctx.font="bold 9px "+FF; ctx.textAlign="center"; const cn=""+(h[tb.weaponbuff.chargeKey]||0); ctx.fillStyle=COL.out; ctx.fillText(cn,tb.weaponbuff.x+1,tb.weaponbuff.y+tb.weaponbuff.r+10); ctx.fillStyle=noBuff?"#8a8a6a":"#ffd9a0"; ctx.fillText(cn,tb.weaponbuff.x,tb.weaponbuff.y+tb.weaponbuff.r+9); }
      if(t){ ctx.save(); ctx.globalAlpha=0.6; ctx.strokeStyle=t.tint; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(tb.weaponbuff.x,tb.weaponbuff.y,tb.weaponbuff.r+2.5,-Math.PI/2,-Math.PI/2+(h.wbuffT/WEAPON_BUFFS.types[h._wbuff].buffS)*6.2832,false); ctx.stroke(); ctx.restore(); } } // anillo de duración restante
    if(tb.buffcycle) btn(tb.buffcycle, "#a09848"); // CAS-1926: botón de CICLAR el tipo de resina (present only when WEAPON_BUFFS.enabled ⇒ undefined OFF ⇒ byte-id)
    btn(top.inv,COL.cream); btn(top.map,COL.cream); btn(top.pause,COL.cream);
    if(top.cdx) btn(top.cdx,COL.textGold); // CAS-1751: Códice touch button (present only when enabled)
    // CAS-1659: Ultimate touch button + charge ring — only when the run has a drafted ultimate.
    if(G.hero&&G.hero.ultId&&tb.ult&&tb.ult.r){ const b=tb.ult, u=ULTIMATE_MAP[G.hero.ultId]||{}, f=clamp(G.hero.ultCharge||0,0,1), ready=f>=1, col=u.col||COL.textGold;
      btn(b, ready?col:COL.rune, true);
      ctx.strokeStyle=ready?col:"#6a5cc0"; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(b.x,b.y,b.r+3,-Math.PI/2,-Math.PI/2+f*6.2832,false); ctx.stroke();
      ctx.textAlign="center"; ctx.font="bold 9px "+FF;
      ctx.fillStyle=COL.out; ctx.fillText(ready?"LISTO":(Math.round(f*100)+"%"), b.x+1, b.y+b.r+15);
      ctx.fillStyle=ready?col:COL.cream; ctx.fillText(ready?"LISTO":(Math.round(f*100)+"%"), b.x, b.y+b.r+14); }
    // mp cost hints on spell buttons (data-driven per class) — CAS-1614: near-black shadow so the
    // small light-blue digits stay readable over bright terrain.
    const sp=SPELLS[G.hero.cls]||SPELLS.warrior;
    ctx.font="9px "+FF; ctx.textAlign="center"; ctx.globalAlpha=0.9;
    const hint=(txt,bx,by)=>{ ctx.fillStyle=COL.out; ctx.fillText(txt,bx+1,by+1); ctx.fillStyle="#8ab8ff"; ctx.fillText(txt,bx,by); };
    hint(""+sp[0].cost,tb.s2.x,tb.s2.y+tb.s2.r+10); hint(""+sp[1].cost,tb.s3.x,tb.s3.y+tb.s3.r+10); hint(""+sp[2].cost,tb.s4.x,tb.s4.y+tb.s4.r+10); ctx.globalAlpha=1;
  }

  function renderCRT(){ ctx.globalAlpha=0.10; ctx.fillStyle="#000";
    for(let y=0;y<VH;y+=3){ ctx.fillRect(0,y,VW,1); } ctx.globalAlpha=1;
    const g=ctx.createRadialGradient(VW/2,VH/2,VH*0.25,VW/2,VH/2,VH*0.85); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.72)");
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH); }

  // ------------------------------- menu ----------------------------------
  // CAS-1664: Arena de Oleadas HUD overlay — the current wave + best (top-centre, under the zone
  // band) and, during the between-wave breather, a "Respiro…" note. Screen-space, pixel font, $0 art.
  function renderArenaOverlay(){ const A=G.arena; if(!A) return;
    ctx.save(); ctx.textAlign="center";
    const cx=VW/2, y=64;
    const label="Oleada "+(A.wave|0)+"  ·  Mejor "+(A.best|0);
    ctx.font="16px "+FF;
    ctx.fillStyle=COL.out; ctx.fillText(label,cx+1,y+1);
    ctx.fillStyle=COL.textGold; ctx.fillText(label,cx,y);
    if(A.resting){ ctx.font="12px "+FF; ctx.fillStyle=COL.cream;
      ctx.fillText("Respiro… próxima oleada",cx,y+18); }
    ctx.restore(); ctx.textAlign="left";
  }
  // CAS-1988: Modo Boss Rush HUD overlay — current round r/N + best round (top-centre, under the zone band)
  // and, during the between-round bonfire, a "Hoguera…" note. Screen-space, pixel font, $0 art (mirror renderArenaOverlay).
  function renderBossRushOverlay(){ const BR=G.bossRush; if(!BR) return;
    ctx.save(); ctx.textAlign="center";
    const cx=VW/2, y=64, N=BOSS_RUSH.sequence.length;
    const label="Ronda "+((BR.round|0)+1)+"/"+N+"  ·  Mejor "+(BR.best|0);
    ctx.font="16px "+FF;
    ctx.fillStyle=COL.out; ctx.fillText(label,cx+1,y+1);
    ctx.fillStyle=COL.textGold; ctx.fillText(label,cx,y);
    if(BR.resting){ ctx.font="12px "+FF; ctx.fillStyle=COL.cream;
      ctx.fillText("Hoguera… se acerca el siguiente jefe",cx,y+18); }
    // CAS-2090: en Desafío con Semilla, indicador + código compartible activo SOBRE la banda de ronda ($0 art, canvas text).
    // Gateado en seededChallengeMode ⇒ un Boss Rush normal NO lo dibuja ⇒ HUD byte-idéntico a HEAD.
    if(G.seededChallengeMode && G.seededCode){ ctx.font="12px "+FF; const sl="⚑ DESAFÍO · "+G.seededCode;
      ctx.fillStyle=COL.out; ctx.fillText(sl,cx+1,y-17); ctx.fillStyle=COL.textGold; ctx.fillText(sl,cx,y-18); }
    // CAS-2047 Time-Attack: running clock during play (canvas text, $0 art). Gated on timeAttack + showTimer ⇒ off = dead.
    // Timer FREEZES during the bonfire rest (combatMs doesn't accrue) — drawn under the rest note so it doesn't collide.
    if(BOSS_RUSH.timeAttack && BOSS_RUSH.showTimer){ const clk=fmtBRTime(BR.combatMs||0); const ty=y+(BR.resting?36:18);
      ctx.font="15px "+FF; ctx.fillStyle=COL.out; ctx.fillText(clk,cx+1,ty+1); ctx.fillStyle=COL.textGold; ctx.fillText(clk,cx,ty); }
    ctx.restore(); ctx.textAlign="left";
  }
  // CAS-2047: format an accumulated-ms clock as M:SS.d (tenths). Shared by the HUD timer + recap splits. Pure fn, no state.
  function fmtBRTime(ms){ const s=Math.max(0,ms)/1000; const m=Math.floor(s/60); const sec=s-m*60;
    return m+":"+(sec<10?"0":"")+sec.toFixed(1); }
  function renderMenu(){
    // dark fantasy backdrop
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    rrng.seed(7); for(let i=0;i<60;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    // silhouette trees
    ctx.fillStyle="#0c130d"; for(let i=0;i<10;i++){ const x=i*VW/9; ctx.fillRect(x-10,VH-120,20,120); ctx.beginPath(); ctx.moveTo(x-22,VH-100); ctx.lineTo(x,VH-180); ctx.lineTo(x+22,VH-100); ctx.fill(); }
    ctx.textAlign="center";
    // title
    ctx.fillStyle=COL.out; ctx.font="bold 56px "+FF; ctx.fillText(STR.title,VW/2+3,VH*0.30+3);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.title,VW/2,VH*0.30);
    ctx.fillStyle=COL.cream; ctx.font="bold 18px "+FF; ctx.fillText(STR.subtitle,VW/2,VH*0.30+34);
    // sword+shield emblem
    drawMenuEmblem(VW/2,VH*0.30-78);
    // play button
    const bw=200,bh=52,bx=VW/2-bw/2,by=VH*0.62; ui.menuPlayRect={x:bx,y:by,w:bw,h:bh};
    ctx.fillStyle="#2e231a"; ctx.fillRect(bx,by,bw,bh); ctx.fillStyle=COL.panelB; ctx.fillRect(bx,by,bw,4); ctx.fillRect(bx,by+bh-4,bw,4);
    ctx.fillStyle=COL.textGold; ctx.font="bold 24px "+FF; ctx.fillText(STR.play,VW/2,by+34);
    // CAS-1664: a SECOND entry — Arena de Oleadas (Wave Survival). Same class→ability→play flow
    // (sets G.pendingArena); shows the durable best wave. $0 art (reuses the button chrome).
    // CAS-2190: Arena de Oleadas OCULTA del menú (mundo-abierto directo). menuEnabled:false ⇒ NO se dibuja y su hit-rect
    // queda en cero (menú inalcanzable). ay/ah se declaran incondicionalmente (el bloque Boss Rush aún los referencia).
    const aw=200,ah=42,ax=VW/2-aw/2,ay=by+bh+16;
    if(ARENA.menuEnabled){ ui.menuArenaRect={x:ax,y:ay,w:aw,h:ah};
      ctx.fillStyle="#241d2e"; ctx.fillRect(ax,ay,aw,ah); ctx.fillStyle=COL.panelB; ctx.fillRect(ax,ay,aw,4); ctx.fillRect(ax,ay+ah-4,aw,4);
      ctx.fillStyle=COL.cream; ctx.font="bold 18px "+FF; ctx.fillText("Arena de Oleadas",VW/2,ay+27);
      { const best=(G.arena&&G.arena.best|0)||0, bestBoss=(G.arena&&G.arena.bestBossWave|0)||0; // loaded at boot by persist.bootArena
        if(best>0){ ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
          // CAS-1675 — show both persistent records under the Arena entry ($0 art, existing font).
          const rec=bestBoss>0 ? ("Mejor oleada: "+best+"  ·  Mejor Jefe: Oleada "+bestBoss) : ("Mejor oleada: "+best);
          ctx.fillText(rec,VW/2,ay+ah+14); } } }
    else ui.menuArenaRect={x:0,y:0,w:0,h:0};
    // CAS-1988: a THIRD entry — Modo Boss Rush (Gauntlet). Same class→ability→play flow (sets G.pendingBossRush);
    // shows the durable best round. $0 art (reuses the button chrome). HARD-GATED: with enabled:false the entry is
    // NOT drawn and its hit-rect stays zero (menu inalcanzable ⇒ byte-identical menu vs HEAD).
    if(BOSS_RUSH.enabled){ const rw=200,rh=42,rx=VW/2-rw/2,ry=ay+ah+24; ui.menuBossRushRect={x:rx,y:ry,w:rw,h:rh};
      ctx.fillStyle="#2e1a1a"; ctx.fillRect(rx,ry,rw,rh); ctx.fillStyle=COL.panelB; ctx.fillRect(rx,ry,rw,4); ctx.fillRect(rx,ry+rh-4,rw,4);
      ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="bold 18px "+FF; ctx.fillText("Modo Boss Rush",VW/2,ry+27);
      const br=(G.bossRush&&G.bossRush.best|0)||0, N=BOSS_RUSH.sequence.length; // loaded at boot by persist.bootBossRush
      if(br>0){ ctx.fillStyle=COL.textDim; ctx.font="10px "+FF;
        ctx.fillText(br>=N ? ("Gauntlet COMPLETA ("+N+"/"+N+")") : ("Mejor ronda: "+br+"/"+N),VW/2,ry+rh+14); } }
    else ui.menuBossRushRect={x:0,y:0,w:0,h:0};
    // CAS-2090: a FOURTH entry — Desafío con Semilla (run determinista compartible). Entra con la semilla del día
    // (menú, NO hotkey de play). $0 art (reusa la chrome del botón). HARD-GATED: enabled:false ⇒ NO se dibuja y su
    // hit-rect queda en cero (menú inalcanzable ⇒ byte-idéntico vs HEAD). Muestra el récord del código del día si existe.
    if(SEEDED_CHALLENGE.enabled){ const cw2=200,ch2=42,cx2=VW/2-cw2/2,cy2=(BOSS_RUSH.enabled?(ui.menuBossRushRect.y+ui.menuBossRushRect.h):(ui.menuArenaRect.y+ui.menuArenaRect.h))+24; ui.menuSeededRect={x:cx2,y:cy2,w:cw2,h:ch2};
      ctx.fillStyle="#1a2e26"; ctx.fillRect(cx2,cy2,cw2,ch2); ctx.fillStyle=COL.panelB; ctx.fillRect(cx2,cy2,cw2,4); ctx.fillRect(cx2,cy2+ch2-4,cw2,4);
      ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="bold 18px "+FF; ctx.fillText("Desafío con Semilla",VW/2,cy2+27);
      const code=(G.seededDailyCode||null); const rec=code&&G.seededRecords&&G.seededRecords[code];
      if(rec&&(rec.score|0)>0){ ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("Semilla del día · Mejor: "+(rec.score|0),VW/2,cy2+ch2+14); }
      else { ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText("Semilla del día — run determinista compartible",VW/2,cy2+ch2+14); } }
    else ui.menuSeededRect={x:0,y:0,w:0,h:0};
    ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; ctx.fillText(STR.controlsHintPC((a)=>keyLabel((G.settings.binds||settings.defaultBinds())[a])),VW/2,VH-40);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.version,VW/2,VH-18);
  }
  // CAS-1570 — run-start ability draft: pick 2 of the class-agnostic pool. Full-screen
  // scene (like class-select). Cards toggle on tap / 1-N keys; Listo confirms when 2 are
  // chosen. Selected cards get an amber frame + order badge. $0 art (glyph icons).
  function renderAbilitySelect(){
    // CAS-1580: draft the FILTERED pool (unlocked abilities only) captured at openAbilityDraft.
    // Fallback to ACTIVE_ABILITIES keeps a defensive non-empty list if the snapshot is missing.
    const pool=(G.abilPool&&G.abilPool.length)?G.abilPool:ACTIVE_ABILITIES, chosen=G.abilChosen||[], cur=G.abilCursor||0;
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    rrng.seed(11); for(let i=0;i<50;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 24px "+FF; ctx.fillText("Habilidades Activas",VW/2,VH*0.13);
    ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText("Elige 2 habilidades para tu partida  ·  toca / 1-"+pool.length+" · ←→ + Espacio · Enter para empezar",VW/2,VH*0.13+22);
    ctx.fillStyle=chosen.length>=2?"#7bd44a":COL.textDim; ctx.font="bold 12px "+FF; ctx.fillText("Seleccionadas: "+chosen.length+"/2",VW/2,VH*0.13+40);
    // CAS-1659 — run-start HABILIDAD DEFINITIVA offer (pick 1 of 3, its OWN slot). A slim strip in the
    // header band above the ability cards; tap a card (or press U) to choose. Persists for the run.
    if(!ui.ultRects) ui.ultRects=[]; ui.ultRects.length=0;
    const ults=((G.ultOffer||[]).map(id=>ULTIMATE_MAP[id]).filter(Boolean)), usel=(G.ultSel|0);
    if(ults.length){
      ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 12px "+FF;
      ctx.fillText("Definitiva — elige 1  ·  toca / tecla U  ·  se carga en combate", VW/2, VH*0.205);
      const un=ults.length, ug=10, ucw=Math.min(190,(VW-40)/un-ug), uch=42;
      const ut=un*ucw+(un-1)*ug, ux0=(VW-ut)/2, uy=VH*0.215;
      for(let i=0;i<un;i++){ const u=ults[i], rx=ux0+i*(ucw+ug), on=(usel===i);
        ctx.fillStyle=on?"#2b313d":COL.panel; ctx.fillRect(rx,uy,ucw,uch);
        ctx.strokeStyle=on?(u.col||COL.textGold):COL.panelB; ctx.lineWidth=on?3:2; ctx.strokeRect(rx+0.5,uy+0.5,ucw,uch);
        ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=u.col||"#cfd6de"; ctx.font="22px "+FF;
        ctx.fillText(u.glyph, rx+20, uy+uch/2); ctx.restore(); ctx.textBaseline="alphabetic";
        ctx.textAlign="left"; ctx.fillStyle=on?COL.textGold:COL.cream; ctx.font="bold 12px "+FF; ctx.fillText(u.name, rx+38, uy+18);
        ctx.fillStyle="#9aa0aa"; ctx.font="8px "+FF; ctx.fillText(u.type.toUpperCase()+"  ·  sin maná  ·  carga→listo", rx+38, uy+32);
        if(on){ ctx.fillStyle=u.col||COL.textGold; ctx.fillRect(rx+ucw-16,uy+6,10,10); }
        ui.ultRects.push({x:rx,y:uy,w:ucw,h:uch,idx:i});
      }
      ctx.textAlign="center";
    }
    ui.abilRects.length=0;
    const n=pool.length, gap=12, cw=Math.min(168,(VW-40)/n-gap), ch=Math.min(228,VH*0.5);
    const totalW=n*cw+(n-1)*gap, x0=(VW-totalW)/2, cy=VH*0.52;
    for(let i=0;i<n;i++){ const a=pool[i], rx=x0+i*(cw+gap), ry=cy-ch/2;
      const pick=chosen.indexOf(a.id), on=pick>=0, foc=(cur===i);
      ctx.fillStyle=on?"#2b313d":COL.panel; ctx.fillRect(rx,ry,cw,ch);
      ctx.strokeStyle=on?COL.textGold:(foc?COL.cream:COL.panelB); ctx.lineWidth=(on||foc)?3:2; ctx.strokeRect(rx+0.5,ry+0.5,cw,ch);
      ctx.fillStyle=a.col||"#cfd6de"; ctx.fillRect(rx+cw/2-16,ry+10,32,4);   // colour bar
      // big glyph icon
      ctx.save(); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillStyle=a.col||"#cfd6de";
      ctx.font="46px "+FF; ctx.fillText(a.glyph, rx+cw/2, ry+ch*0.30); ctx.restore(); ctx.textBaseline="alphabetic";
      ctx.textAlign="center"; ctx.fillStyle=on?COL.textGold:COL.cream; ctx.font="bold 14px "+FF; ctx.fillText(a.name, rx+cw/2, ry+ch*0.44);
      // type · CD · mana line
      const meta=a.type.toUpperCase()+"  ·  CD "+a.cd+"s"+(a.cost?("  ·  "+a.cost+" MP"):"");
      ctx.fillStyle="#9aa0aa"; ctx.font="9px "+FF; ctx.fillText(meta, rx+cw/2, ry+ch*0.44+16);
      ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; wrapText(a.desc, rx+12, ry+ch*0.44+36, cw-24, 15);
      // order badge on a chosen card
      if(on){ const bs=22, bx=rx+cw-bs-6, by=ry+6; ctx.fillStyle=COL.textGold; ctx.fillRect(bx,by,bs,bs);
        ctx.fillStyle="#1a1d24"; ctx.font="bold 14px "+FF; ctx.textAlign="center"; ctx.fillText((pick+1), bx+bs/2, by+bs-6); }
      ctx.textAlign="center"; ctx.fillStyle=on?COL.textGold:COL.textDim; ctx.font="bold 11px "+FF; ctx.fillText(on?"◄ SELECCIONADA":("["+(i+1)+"] elegir"), rx+cw/2, ry+ch-10);
      ui.abilRects.push({x:rx,y:ry,w:cw,h:ch,idx:i});
    }
    // Listo button
    const ready=chosen.length>=2, bw=Math.min(240,VW*0.5), bh=42, bx=VW/2-bw/2, by=cy+ch/2+22;
    ctx.fillStyle=ready?"#2c5a2c":"#242832"; ctx.fillRect(bx,by,bw,bh);
    ctx.strokeStyle=ready?"#7bd44a":COL.panelB; ctx.lineWidth=2; ctx.strokeRect(bx+0.5,by+0.5,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=ready?"#d6ffcf":COL.textDim; ctx.font="bold 16px "+FF;
    ctx.fillText(ready?"LISTO — ¡A la aventura!":"Elige 2 habilidades", VW/2, by+bh/2+6);
    ui.abilConfirmRect={x:bx,y:by,w:bw,h:bh};
    ctx.textAlign="left";
  }
  function renderClassSel(){
    const META={warrior:["Guerrero","Espada y escudo","#8d3636"], paladin:["Paladín","Arco sagrado","#e6e0cf"],
      mage:["Mago","Orbes arcanos","#2f6e6e"], druid:["Druida","Naturaleza","#41693c"], priest:["Sacerdote","Luz sagrada","#e2ddcd"]};
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    rrng.seed(7); for(let i=0;i<50;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 26px "+FF; ctx.fillText("Elige tu clase",VW/2,VH*0.15);
    ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("Toca una clase  ·  1-5 / ←→ + Enter  ·  C personalizar",VW/2,VH*0.15+24);
    ui.classRects.length=0;
    const n=CLASS_LIST.length, gap=10, cw=Math.min(150,(VW-30)/n-gap), ch=Math.min(210,VH*0.52);
    const totalW=n*cw+(n-1)*gap, x0=(VW-totalW)/2, cy=VH*0.55;
    for(let i=0;i<n;i++){ const cls=CLASS_LIST[i], rx=x0+i*(cw+gap), ry=cy-ch/2, sel=(G.classSel===i);
      ctx.fillStyle=sel?"#2b313d":COL.panel; ctx.fillRect(rx,ry,cw,ch);
      ctx.strokeStyle=sel?COL.textGold:COL.panelB; ctx.lineWidth=sel?3:2; ctx.strokeRect(rx,ry,cw,ch);
      ctx.fillStyle=META[cls][2]; ctx.fillRect(rx+cw/2-14,ry+10,28,4);
      // CAS-98: preview the actual class art you'll play (animated loop, frame
      // cycles on time so the card breathes), fit to the card; fall back to the
      // old procedural class sprite until the strip loads.
      const art=CLASS_HERO_ART[cls], aimg=art?IMG["clshero_"+art]:null, feetY=ry+ch*0.74;
      if(aimg&&aimg.complete&&aimg.naturalWidth){
        const fitH=ch*0.52, fs=fitH/CLASS_FH, dw=CLASS_FW*fs, fi=Math.floor(G.t*2.6)%CLASS_FC;
        ctx.save(); ctx.imageSmoothingEnabled=false;
        ctx.drawImage(aimg, fi*CLASS_FW,0,CLASS_FW,CLASS_FH, rx+cw/2-CLASS_AX*fs, feetY-CLASS_FOOT*fs, dw, CLASS_FH*fs);
        ctx.restore();
      } else {
        const sc=Math.max(2,Math.min(4,Math.floor((cw-10)/22)));
        drawClassFrame(ctx,cls,"idle","down",0, rx+cw/2, ry+ch*0.66, sc, null);
      }
      ctx.fillStyle=sel?COL.textGold:COL.cream; ctx.font="bold 14px "+FF; ctx.fillText(META[cls][0],rx+cw/2,ry+ch-40);
      ctx.fillStyle="#9aa0aa"; ctx.font="10px "+FF; ctx.fillText(META[cls][1],rx+cw/2,ry+ch-28);
      // CAS-100: per-class base stats so the player can SEE each class plays different,
      // not just looks different. 4 normalized bars (HP / MP / DMG / SPD) under the name.
      const cs=CLASS_STATS[cls]; if(cs){
        const rows=[["VID",cs.hp,135,"#c64b4b"],["MAN",cs.mp,82,"#4b86c6"],["DÑO",cs.dmg,14,"#e0b24a"],["VEL",cs.moveScale,1.07,"#5fae5a"]];
        const bx=rx+30, bw=cw-40, by=ry+ch-22, bh=3;
        ctx.textAlign="left"; ctx.font="7px "+FF;
        for(let r=0;r<rows.length;r++){ const [lab,v,mx,col]=rows[r], yy=by+r*5;
          ctx.fillStyle="#7a808a"; ctx.fillText(lab,rx+6,yy+3);
          ctx.fillStyle="#1b2027"; ctx.fillRect(bx,yy,bw,bh);
          ctx.fillStyle=col; ctx.fillRect(bx,yy,bw*Math.min(1,v/mx),bh); }
        ctx.textAlign="center";
      }
      ctx.fillStyle=COL.textDim; ctx.font="bold 11px "+FF; ctx.fillText(String(i+1),rx+10,ry+18);
      ui.classRects.push({x:rx,y:ry,w:cw,h:ch,cls});
    }
    // CAS-128: contextual help for the highlighted class — its role + a one-line fantasy
    // (attack flavour) so a first-time player picks with intent, not at random. Updates
    // live as the selection moves (1-5 / ←→ / tap-focus).
    const selCls=CLASS_LIST[G.classSel]||CLASS_LIST[0], info=(STR.classes&&STR.classes[selCls]);
    if(info){ const hy=cy+ch/2+26;
      ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText(info.name+" — "+info.role, VW/2, hy);
      ctx.fillStyle=COL.cream; ctx.font="12px "+FF; ctx.fillText(info.attack, VW/2, hy+20); }
    // CAS-169: "Personalizar ▸" — open the wardrobe for the highlighted class before play.
    const pbW=Math.min(220,VW*0.6), pbH=30, pbX=VW/2-pbW/2, pbY=Math.min(VH-46, cy+ch/2+40);
    ctx.fillStyle="#262d3a"; ctx.fillRect(pbX,pbY,pbW,pbH); ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(pbX,pbY,pbW,pbH);
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px "+FF; ctx.fillText(STR.customizeOpen+" ▸", VW/2, pbY+20);
    const pc=ui.classCustomRect; pc.x=pbX; pc.y=pbY; pc.w=pbW; pc.h=pbH;
  }
  // CAS-169: the 6 customization rows (4 recolorable parts + 2 variation swaps) and
  // their human labels / option display names. Order = keyboard up/down focus order.
  const CUST_ROWS=[
    {t:"color",key:"hood", label:"Capucha"},
    {t:"color",key:"cloak",label:"Capa"},
    {t:"color",key:"sash", label:"Banda"},
    {t:"color",key:"legs", label:"Piernas"},
    {t:"var",  key:"headwear",label:"Cabeza"},
    {t:"var",  key:"cape",    label:"Estilo capa"},
  ];
  const CUST_VARNAME={ hood:"Capucha", helmet:"Casco", none:"Descubierto",
    cape:"Capa corta", nocape:"Sin capa", longcape:"Capa larga" };
  function colEq(a,b){ return a&&b&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]; }
  // Live wardrobe screen: a big animated preview of the player's actual baked hero +
  // 4 color pickers + 2 variation selectors. Touch (rects) + keyboard (G.custFocus).
  function renderCustomize(){
    const h=G.hero; if(!h){ G.scene="play"; return; }
    ui.customRects.length=0;
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    rrng.seed(11); for(let i=0;i<40;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 22px "+FF; ctx.fillText(STR.customizeTitle, VW/2, 34);
    ctx.fillStyle=COL.cream; ctx.font="11px "+FF; ctx.fillText(STR.customizeHint, VW/2, 54);

    // ---- live preview (baked clshero strip, breathing idle loop) ----
    const pvW=Math.min(150,VW*0.34), pvX=VW*0.5-VW*0.30, pvY=72, pvH=Math.min(190,VH*0.34);
    ctx.fillStyle="#10141b"; ctx.fillRect(pvX-pvW/2,pvY,pvW,pvH);
    ctx.strokeStyle=COL.panelB; ctx.lineWidth=2; ctx.strokeRect(pvX-pvW/2,pvY,pvW,pvH);
    const aimg=IMG["clshero_"+h.cls];
    if(aimg&&aimg.complete&&aimg.naturalWidth){
      const fitH=pvH*0.82, fs=fitH/CLASS_FH, feetY=pvY+pvH*0.93, fi=Math.floor(G.t*2.6)%CLASS_FC;
      ctx.save(); ctx.imageSmoothingEnabled=false;
      ctx.drawImage(aimg, fi*CLASS_FW,0,CLASS_FW,CLASS_FH, pvX-CLASS_AX*fs, feetY-CLASS_FOOT*fs, CLASS_FW*fs, CLASS_FH*fs);
      ctx.restore();
    }

    // ---- control rows on the right ----
    const colX=VW*0.5-VW*0.10, colW=Math.min(300,VW*0.44), rowH=Math.min(40,(VH-pvY-60)/CUST_ROWS.length);
    const sw=CUSTOMIZE.swatches; ctx.textAlign="left";
    for(let r=0;r<CUST_ROWS.length;r++){
      const row=CUST_ROWS[r], ry=pvY+r*rowH, foc=(G.custFocus===r);
      ctx.fillStyle=foc?"#262d3a":"#181c24"; ctx.fillRect(colX,ry,colW,rowH-6);
      ctx.strokeStyle=foc?COL.textGold:"#3a4456"; ctx.lineWidth=foc?2:1; ctx.strokeRect(colX,ry,colW,rowH-6);
      ctx.fillStyle=foc?COL.textGold:COL.cream; ctx.font="bold 11px "+FF; ctx.fillText(row.label, colX+8, ry+15);
      if(row.t==="color"){
        const cur=h.palette[row.key];
        // current chip
        ctx.fillStyle="rgb("+cur[0]+","+cur[1]+","+cur[2]+")"; ctx.fillRect(colX+8,ry+rowH-18,12,10);
        ctx.strokeStyle="#0008"; ctx.lineWidth=1; ctx.strokeRect(colX+8,ry+rowH-18,12,10);
        // swatch strip
        const sx0=colX+28, cw=Math.max(9,Math.min(15,(colW-36)/sw.length)), cy=ry+rowH-19;
        for(let c=0;c<sw.length;c++){ const cx=sx0+c*cw, on=colEq(sw[c],cur);
          ctx.fillStyle="rgb("+sw[c][0]+","+sw[c][1]+","+sw[c][2]+")"; ctx.fillRect(cx,cy,cw-2,12);
          if(on){ ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.strokeRect(cx-1,cy-1,cw,14); }
          ui.customRects.push({kind:"swatch",slot:row.key,ci:c,x:cx,y:cy-1,w:cw,h:15});
        }
      } else {
        const val=h.variation[row.key], opts=CUSTOMIZE.variations[row.key], idx=Math.max(0,opts.indexOf(val));
        const aw=18, vy=ry+2, vh=rowH-10, rx=colX+colW-8;
        // ‹  value  ›
        ctx.textAlign="center";
        ctx.fillStyle="#2b3340"; ctx.fillRect(colX+90,vy,aw,vh); ctx.fillRect(rx-aw,vy,aw,vh);
        ctx.fillStyle=COL.textGold; ctx.font="bold 14px "+FF; ctx.fillText("‹",colX+90+aw/2,vy+vh*0.7); ctx.fillText("›",rx-aw/2,vy+vh*0.7);
        ctx.fillStyle=COL.cream; ctx.font="bold 11px "+FF; ctx.fillText(CUST_VARNAME[val]||val,(colX+90+aw+rx-aw)/2,vy+vh*0.7);
        ctx.textAlign="left";
        ui.customRects.push({kind:"var",key:row.key,dir:-1,x:colX+90,y:vy,w:aw,h:vh});
        ui.customRects.push({kind:"var",key:row.key,dir:1, x:rx-aw, y:vy,w:aw,h:vh});
      }
    }
    // ---- buttons ----
    ctx.textAlign="center";
    const by=VH-46, bw=Math.min(150,VW*0.4), bh=32, gap=14;
    const dX=VW/2+gap/2, sX=VW/2-gap/2-bw;
    ctx.fillStyle="#1d3324"; ctx.fillRect(dX,by,bw,bh); ctx.strokeStyle=COL.heal; ctx.lineWidth=2; ctx.strokeRect(dX,by,bw,bh);
    ctx.fillStyle=COL.heal; ctx.font="bold 14px "+FF; ctx.fillText(STR.customizeDone, dX+bw/2, by+21);
    ctx.fillStyle="#33301a"; ctx.fillRect(sX,by,bw,bh); ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(sX,by,bw,bh);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.customizeReset, sX+bw/2, by+21);
    ui.customRects.push({kind:"done",x:dX,y:by,w:bw,h:bh});
    ui.customRects.push({kind:"reset",x:sX,y:by,w:bw,h:bh});
    ctx.fillStyle=COL.textDim; ctx.font="10px "+FF; ctx.fillText(STR.customizeKeys, VW/2, VH-8);
    ctx.textAlign="left";
  }
  function drawMenuEmblem(x,y){ ctx.save(); ctx.translate(x,y);
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(0,0,26,0,6.28); ctx.fill(); ctx.fillStyle="#6b4a2a"; ctx.beginPath(); ctx.arc(0,0,22,0,6.28); ctx.fill();
    ctx.fillStyle="#8a6038"; ctx.beginPath(); ctx.arc(0,0,16,0,6.28); ctx.fill();
    ctx.strokeStyle="#cdd4dc"; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,18); ctx.moveTo(18,-18); ctx.lineTo(-18,18); ctx.stroke();
    ctx.strokeStyle=COL.out; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }

  return { render, customImgReady, daynight, weather, zone };
}
