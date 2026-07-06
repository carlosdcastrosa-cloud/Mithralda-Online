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
import { TS, MAP_W, MAP_H, T_GRASS, T_STONE, T_SAND, T_COBBLE, T_ICE, T_SWAMP, CFG, CLASS_LIST, CLASS_STATS, SPELLS, ACTIVE_ABILITIES, ABILITY_MAP, HUNTS, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, STAGE1_GOAL, STATUS, CONSUMABLES, CUSTOMIZE, MOB_AFFIX, CHAMPION, BOON_MAP, BOON_CAT_LABEL, BOON_RARITY, SYNERGIES, SYN_MAP, ZONE_MOD_MAP } from "../sim/config.js";
import { clamp, dist2 } from "../sim/math.js";
import { createRNG, hash2 } from "../sim/rng.js";
import { gearStat, gearName, gearCol, equippedDmg, equippedDef, heroMaxHp, affixTotals, affixList, affixLabel, FORGE, forgeLevel, forgeNextCost } from "../sim/gear.js";
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
  const RARITY_MARK = { common:"", uncommon:"◦ ", rare:"◆ ", epic:"★ " };
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

  // CAS-121/224: T_ICE (index 6) — frozen Cripta Helada floor. Primary path draws the
  // hi-fi FOUNTAINS dark flagstone with a cold wash (see renderWorld); these fallback
  // tones are now DARK frozen-stone (not bright pale-blue) so the zone reads cold even
  // before the image loads / in unit tooling.
  // index 7 = T_SWAMP (CAS-441) — teal marsh fallback tones until the CAS-439 tiles load.
  const tileBase=[COL.grass,COL.dirt,COL.stone,COL.cobble,COL.sand,COL.water,"#2c3a48","#3a463e"];
  const tileLight=[COL.grassL,COL.dirtL,COL.stoneL,COL.cobbleL,COL.sandL,COL.waterL,"#4a6072","#4e5f52"];
  const tileDark=[COL.grassD,COL.dirtD,COL.stoneD,COL.cobbleD,COL.sandD,COL.water,"#1a2632","#2a342e"];

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
    renderHUD();
    if(G.showMap) renderBigMap();
    if(G.scene==="inventory") renderInventory();
    if(G.scene==="talents") renderTalents();
    if(G.scene==="mastery") renderMastery(); // CAS-150 elite-mastery reward track
    if(G.scene==="dialogue") renderDialogue();
    if(G.scene==="shop") renderShop();
    if(G.scene==="forge") renderForge(); // CAS-237 equipment forge
    if(G.scene==="bounty") renderBounty();
    if(G.scene==="bestiary") renderBestiary(); // CAS-386 bestiary / codex collection
    if(G.scene==="draft") renderDraft(); // CAS-383 inter-zone boon draft
    if(G.scene==="curse") renderCurse(); // CAS-394 opt-in zone modifier offer
    if(G.scene==="ascend") renderAscend(); // CAS-450 opt-in World-Tier climb offer
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
    const x0=Math.max(0,Math.floor(camX/TS)-1), y0=Math.max(0,Math.floor(camY/TS)-1);
    const x1=Math.min(MAP_W-1,Math.ceil((camX+VW/Z)/TS)+1), y1=Math.min(MAP_H-1,Math.ceil((camY+VH/Z)/TS)+1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=world.terr[y*MAP_W+x]; const px=x*TS, py=y*TS;
      // CAS-462: dentro del continente Tiled el suelo se dibuja del atlas horneado del TMX.
      if(world.tiledVisual && x<GROUND.W && y<GROUND.H){ const ga=IMG.tiled_ground;
        if(ga&&ga.complete&&ga.naturalWidth){ let gi=GROUND.grid[y*GROUND.W+x];
          if(gi>=GROUND.animStart) gi+=((G.t*8)|0)%GROUND.animFrames;   // CAS-463: agua animada
          ctx.drawImage(ga,(gi%GROUND.cols)*TS,((gi/GROUND.cols)|0)*TS,TS,TS,px,py,TS,TS); continue; } }
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
        if(wimg&&wimg.complete&&wimg.naturalWidth) ctx.drawImage(wimg,px,py,TS,TS); else { ctx.fillStyle="#2b313a"; ctx.fillRect(px,py,TS,TS); }
        continue; }
      if(t===T_STONE){ const r=hash2(x,y); const img = (r<0.10?IMG.cave_blood:(r<0.65?IMG.cave_floor:IMG.cave_floor2)); // CAS-217: flagstone-dominant + void + rare war-torn blood accent
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-224 (Art): Cripta Helada floor — was a flat bright-grey grid. Re-source the
      // SAME hi-fi FOUNTAINS dark flagstone as caves/abyss (parity with CAS-217), then wash
      // it cold: an UNEVEN near-black ambient (torch-pool falloff) + rime-blue tint so the
      // crypt reads frozen-and-dark, not bright. Rime cracks/glints carry icy zone identity.
      if(t===T_ICE){ const r=hash2(x,y); const img=(r<0.58?IMG.cave_floor:IMG.cave_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          const dk=(0.30+hash2(x*3,y*3)*0.24).toFixed(2);                 // 0.30–0.54 per-tile = torch falloff
          ctx.fillStyle="rgba(8,16,28,"+dk+")"; ctx.fillRect(px,py,TS,TS); // near-black cold ambient
          ctx.fillStyle="rgba(120,170,205,0.12)"; ctx.fillRect(px,py,TS,TS); // rime-blue chill tint
          if(hash2(x+5,y)<0.42){ ctx.strokeStyle="rgba(196,224,238,0.45)"; ctx.lineWidth=1; // frozen crack
            const ix=px+((hash2(x,y)*18)|0)+6, iy=py+((hash2(y,x)*18)|0)+6;
            ctx.beginPath(); ctx.moveTo(ix,iy); ctx.lineTo(ix+5,iy+4); ctx.lineTo(ix+3,iy+10); ctx.stroke(); }
          if(hash2(x,y+9)<0.20){ ctx.fillStyle="rgba(220,238,248,0.6)"; ctx.fillRect(px+((hash2(x+3,y)*22)|0)+4, py+((hash2(x,y+3)*22)|0)+4, 2,2); } // ice glint
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
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      if(t===T_GRASS){ const img=(hash2(x,y)<0.5?IMG.ruins_grass:IMG.ruins_grass2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS); continue; } }
      // CAS-441: Ciénaga de Bruma floor (CAS-439 teal marsh tiles). A LOW-frequency hash
      // (x>>1,y>>1) gates the water so pools clump into 2×2-ish ponds instead of lone
      // speckles; puddles + the two mud variants alternate per-tile. All walkable —
      // the marsh is shallow (wading), depth reads from the props, not collision.
      if(t===T_SWAMP){ const pool=hash2(x>>1,y>>1), r=hash2(x,y);
        const img=(pool<0.08?IMG.swamp_water:(r<0.12?IMG.swamp_puddle:(r<0.66?IMG.swamp_mud:IMG.swamp_mud2)));
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS); continue; } }
      ctx.fillStyle=tileBase[t]; ctx.fillRect(px,py,TS,TS);
      const hv=hash2(x,y);
      // texture flecks (deterministic)
      ctx.fillStyle = hv<0.5? tileDark[t]: tileLight[t];
      const fx=px+((hv*53)%1)*24+4, fy=py+((hv*97)%1)*24+4;
      ctx.fillRect(fx|0, fy|0, 4,4);
      if(hash2(x+7,y+3)<0.28){ ctx.fillStyle=tileLight[t]; ctx.fillRect(px+ ((hash2(x,y+1)*22)|0)+5, py+((hash2(x+1,y)*22)|0)+5, 3,3); }
      if(t===T_GRASS && hash2(x*2,y)<0.10){ ctx.fillStyle=COL.twig; ctx.fillRect(px+10,py+14,3,6); }
      if(t===T_SAND && hash2(x,y*2)<0.08){ ctx.fillStyle=COL.bloodSand; ctx.fillRect(px+8,py+10,6,5); }
    }
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
      if(f.temple){ ctx.fillStyle=COL.textGold; ctx.fillRect(f.x-2,f.y-r-10,4,8); ctx.fillRect(f.x-6,f.y-r-6,12,3);} }
    // CAS-114 — warp portals (town↔abyss). The town→abyss gate reads LOCKED (dim red,
    // a barred glyph) until the hero's power clears the gate, then OPEN (violet swirl);
    // the return gate is always open. Animated from sim time only (no render RNG).
    if(world.portals) for(const p of world.portals){
      // CAS-121: each deeper gate reads its own power requirement (abyss < cripta).
      const req = p.to==="abyss"?ABYSS_POWER_REQ : p.to==="frost"?FROST_POWER_REQ : p.to==="trial"?TRIAL_POWER_REQ : 0;
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
    for(const d of world.deco){ if(d.x<vL||d.x>vR||d.y<vT||d.y>vB) continue; order.push({y:(d.kind&&d.kind.startsWith("tp:"))?d.y-16:d.y,draw:()=>{
      if(d.kind && d.kind.startsWith("tp:")){ let ei=+d.kind.slice(3);
        const fr=TDECO.anim&&TDECO.anim[ei]; if(fr&&fr.length) ei=fr[((G.t*7)|0)%fr.length]; // CAS-463
        const e=TDECO.entries[ei], pa=IMG.tiled_props;
        if(e&&pa&&pa.complete&&pa.naturalWidth) ctx.drawImage(pa,e[0],e[1],e[2],e[3],Math.round(d.x-e[2]/2),Math.round(d.y-e[3]),e[2],e[3]);
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

  function renderEntities(){
    const h=G.hero;
    const list=[];
    for(const o of G._decoOrder) list.push(o);
    for(const e of G.enemies) list.push({y:e.y,draw:()=>drawEnemy(e)});
    for(const c of G.corpses) list.push({y:c.y,draw:()=>drawCorpse(c)}); // CAS-317: dragon death-anim corpses, y-sorted with the living
    for(const n of world.npcs) list.push({y:n.y,draw:()=>drawNPC(n)});
    list.push({y:h.y,draw:()=>drawHero(h)});
    list.sort((a,b)=>a.y-b.y);
    for(const o of list) o.draw();
    // projectiles + fx on top
    for(const f of G.fields) drawField(f);
    for(const p of G.projectiles) drawProjectile(p);
    for(const f of G.fx) drawFx(f);
    // CAS-127: damage numbers POP — a brief over-scale on spawn (eased down over ~0.16s)
    // then settle. Crits pop biggest; DoT/status ticks render small + status-coloured.
    // Pure presentation off pooled floater flags; no allocation, no sim state touched.
    for(const f of G.floaters){ const k=clamp(1-f.t/f.life,0,1); ctx.globalAlpha=k;
      const base=f.small?10:13; const pk=(f.pop&&f.pop>1)?1+(f.pop-1)*clamp(1-f.t/0.16,0,1):1; const sz=Math.round(base*pk);
      // CAS-265: in colour-blind mode crits carry a "!" shape cue (the size-pop already
      // reads big), so a crit is distinguishable from a normal hit without relying on hue.
      const txt=(cb()&&f.crit)?("!"+f.txt):f.txt;
      ctx.font="bold "+sz+"px "+FF; ctx.textAlign="center";
      // CAS-273: apply the spawn-time anti-overlap lane offset (f.dx) so stacked numbers fan out.
      const fx=f.x+(f.dx||0);
      ctx.fillStyle=COL.out; ctx.fillText(txt,fx+1,f.y+1); ctx.fillStyle=f.col; ctx.fillText(txt,fx,f.y); ctx.globalAlpha=1; }
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
    if(h.iframe>0 && !h.dead && Math.floor(G.t*20)%2===0) ctx.globalAlpha=0.45;
    const flip=Math.cos(ang)<0, tint=h.hurtFlash>0?"#ffffff":null;
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
    const ok=drawHeroClass(CLASS_HERO_ART[cls],cstate,h.animT||0,hx,hfeet,flip,sqX,sqY,bobUp,tint,ang) // CAS-98/110/223 state-driven class anim; CAS-333 ang→8-dir row
          || drawHeroAnim(def.img,fi,h.x,feet,flip,tint,bob)                     // hooded anim fallback
          || drawHeroErw(h.x,feet,flip,1,1,0,tint)       // hooded pose until strips load
          || drawClassFrame(ctx,cls,(state==="roll")?"walk":state,dir4FromAngle(ang),fi,h.x,feet,HERO_SPRITE_SCALE,tint);
    ctx.globalAlpha=1;
    if(!ok){ const b2=h.walkT?Math.sin(h.walkT)*2:0; blit(ctx,SP.hero.rows, h.hurtFlash>0?redden(SP.hero.pal):SP.hero.pal, h.x,h.y-12-b2,3, Math.cos(h.facing)<0); }
    if(!h.dead){ ctx.globalAlpha=0.8; ctx.fillStyle=COL.textGold; const fx=h.x+Math.cos(h.facing)*18, fy=h.y-2+Math.sin(h.facing)*18; ctx.fillRect(fx-1.5,fy-1.5,3,3); ctx.globalAlpha=1; }
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
  };
  const mobGait = e => MOB_GAIT[e.type] || {w:6.0,fps:7};
  function drawEnemy(e){
    const spr=SP[e.tpl.sprite]; const px=e.isBoss?5:(e.champion?5:(e.tpl.size>20?4:3));
    const fl = (e.facing!==undefined)?Math.cos(e.facing)<0:false;
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
    let drew=false; const ch=ENEMY_ANIM[e.type];
    if(ch && IMG[ch+"_walk"]){
      const ds=ANIM[ch]&&ANIM[ch].ds; const S=ds?ds*(e.isBoss?1.15:e.champion?1.0:0.82):(e.isBoss?1.3:0.85), feet=e.y+e.tpl.size*0.5, st=e.animState||"idle";
      const fps = st==="attack"? (ANIM[ch].fc.attack/(e.tpl.windup+0.15)) : (st==="walk"?gait.fps:6); // CAS-222 per-mob walk cadence
      const fi=frameIndex(ch,st,e.animT||0,fps, st!=="attack");
      drew=drawAnim(ctx,ch,st,fi,e.x,feet,S,fl, e.hurtFlash>0?"#ffffff":null);
    }
    // CAS-209: per-state PixelLab MCP strips for solid-bodied mobs (skel/bandit/orc).
    // resolveStrip picks the state-specific strip (idle/walk) or falls back to walk.
    // Stage-2 safe: reads only render state, mutates nothing.
    if(!drew){ const st=e.animState||"idle"; const strip=resolveStrip(e.tpl.sprite,st);
      const simg=strip&&IMG[strip.key]&&IMG[strip.key].complete&&IMG[strip.key].naturalWidth?IMG[strip.key]:null;
      if(simg){
        const fw=strip.fw, fh=strip.fh;
        // CAS-233: strip.tiles pins an absolute on-screen height (in 32px tiles) so the
        // golem BOSS renders one consistent imposing size across all 4 zones (zone bosses
        // differ in tpl.size 36–50 — the generic size×3.4 mult would balloon the Coliseo
        // boss to ~5 tiles). Preserves the legacy ~3.6-tile "stone capstone" scale.
        const dh=(strip.tiles? strip.tiles*32 : e.tpl.size*(e.isBoss?3.4:e.champion?2.9:2.4)), dw=dh*(fw/fh);
        const feetY=e.y+e.tpl.size*0.5, ph=(e.gaitPhase!==undefined?e.gaitPhase:(e.x*0.7+e.y*0.9)); // CAS-240: STATIC spawn-phase, not live pos
        // CAS-317: attack1/attack2/hurt are ONE-SHOT (synced to the sim's e.animT clock, hold
        // the final frame); idle/walk loop on render time as before. Legacy "attack" (golem)
        // stays looped — untouched.
        const oneShot = (st==="attack1"||st==="attack2"||st==="hurt");
        const fps = st==="walk"?gait.fps : st==="attack1"?12 : st==="attack2"?14 : st==="hurt"?12 : st==="attack"?10 : st==="cast"?8 : 6; // CAS-222 per-mob walk cadence (CAS-312: demon warlock cast loops ~8fps as a channel)
        const fi = G.settings.reduceMotion ? (oneShot?strip.fc-1:0)
                 : oneShot ? Math.min(Math.floor((e.animT||0)*fps), strip.fc-1)
                 : (Math.floor(G.t*fps+ph*7)%strip.fc+strip.fc)%strip.fc;
        // CAS-317: a soft grounding shadow plants the lateral dragon sprite in the 3/4 world.
        if(e.tpl.richAnim){ ctx.save(); ctx.globalAlpha=0.32; ctx.fillStyle="#000";
          ctx.beginPath(); ctx.ellipse(e.x,feetY,dw*0.30,dw*0.12,0,0,6.28); ctx.fill(); ctx.restore(); }
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
    if(!drew){ const ik=ENEMY_IMG[e.tpl.sprite]; const eimg=ik&&IMG[ik];
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
    if(!drew){
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
    // health bar
    const w=e.isBoss?64:(e.champion?58:(e.champElite?54:Math.max(22,e.tpl.size*1.6))); const hh=(e.isBoss||e.champion||e.champElite)?6:4; const yy=e.y-e.tpl.size-((e.isBoss||e.champion||e.champElite)?14:8); // CAS-1590: a champion gets the wide always-on bar
    ctx.fillStyle=COL.out; ctx.fillRect(e.x-w/2-1,yy-1,w+2,hh+2);
    ctx.fillStyle=COL.hpb; ctx.fillRect(e.x-w/2,yy,w,hh);
    const champCol=e.capstone?(e.enraged?"#ff4636":"#ff9a3a"):"#ffcf4d";
    ctx.fillStyle=e.champion?champCol:(e.champElite?CHAMPION.col:(e.hostile?"#ff5a4a":COL.hpf)); ctx.fillRect(e.x-w/2,yy,w*clamp(e.hp/e.maxHp,0,1),hh);
    if(e.isBoss){ ctx.fillStyle=COL.textGold; ctx.font="bold 10px "+FF; ctx.textAlign="center"; ctx.fillText(e.tpl.bossLabel||"GÓLEM ANCESTRAL",e.x,yy-4); } // CAS-317: data-driven boss name (dragon = "DRAGÓN ANCESTRAL")
    else if(e.champion){ ctx.fillStyle=e.shielded?"#9be7ff":(e.specialNow?"#ff5230":champCol); ctx.font="bold 10px "+FF; ctx.textAlign="center";
      ctx.fillText((e.capstone?"☠ ":"★ ")+e.tpl.champName+(e.shielded?" ❄ CORAZA":e.enraged?" ¡ENFURECIDO!":e.specialNow?" ¡CUIDADO!":""),e.x,yy-4); }
    // CAS-1590: the champion nameplate names BOTH affixes in gold so its two modifiers read at a glance.
    else if(e.champElite){ const ids=e.affixes||(e.affix?[e.affix]:[]);
      const names=ids.map(id=>MOB_AFFIX[id]&&MOB_AFFIX[id].name).filter(Boolean).join(" + ");
      ctx.fillStyle=CHAMPION.col; ctx.font="bold 10px "+FF; ctx.textAlign="center";
      ctx.fillText("👑 "+CHAMPION.name+(names?" · "+names:""),e.x,yy-4); }
    else if(e.elite){ ctx.fillStyle="#ff7a4d"; ctx.font="bold 9px "+FF; ctx.textAlign="center"; ctx.fillText("⚔ ÉLITE",e.x,yy-3); }
    // CAS-247: name the affix above the HP bar in its colour, so the modifier is unmistakable.
    else if(e.affix && MOB_AFFIX[e.affix]){ ctx.fillStyle=MOB_AFFIX[e.affix].col; ctx.font="bold 9px "+FF; ctx.textAlign="center"; ctx.fillText("✦ "+MOB_AFFIX[e.affix].name,e.x,yy-3); }
    // CAS-118: status icons/aura sit just above the HP bar so afflictions read at a glance.
    drawStatusFx(e, e.x, e.y+e.tpl.size*0.5, yy-9);
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
    // soft grounding shadow
    ctx.save(); ctx.globalAlpha=0.32*fade; ctx.fillStyle="#000";
    ctx.beginPath(); ctx.ellipse(c.x,feetY,dw*0.30,dw*0.12,0,0,6.28); ctx.fill(); ctx.restore();
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
  function drawFxSprite(name,x,y,prog,size,ang){ const im=IMG["fx_"+name], m=FX_STRIP&&FX_STRIP[name];
    if(!m||!im||!im.complete||!im.naturalWidth) return false;
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
      if(drawFxSprite(SM.s, f.x, f.y, clamp(f.t/f.life,0,1), size, ang)) return; }
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
    if(!hudUI){ // CAS-299: legacy vitals (HP/MP/XP bars · gold/potions · name/skull) — HUD owns these
      bar(pad,pad,bw,16,h.hp/mhp,COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+mhp);
      bar(pad,pad+22,bw,12,h.mp/h.maxMp,COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
      bar(pad,pad+38,bw,10,h.xp/h.xpNext,COL.xpf,COL.xpb, STR.level(h.lvl));
    }
    // CAS-119: unspent talent-point badge — prompts the player to open the tree (T). CAS-299:
    // when the HUD owns the top-left, the badge moves to the left column UNDER the HUD panel.
    const badgeX = hudUI ? pad : pad+bw+8;
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
    ctx.fillStyle=COL.out; const qt=G.quest.done?STR.questDone:STR.questLabel(G.quest.wolves);
    const qw=ctx.measureText(qt).width+12;
    // CAS-416: at narrow widths the centred OBJETIVO banner reaches the tracker column;
    // drop the tracker stack just below the banner instead of overlapping it.
    if(ob && qx-qw < ob.x+ob.w+6 && qy < ob.y+ob.h+4) qy=ob.y+ob.h+8;
    AR("questTracker", qx-qw, qy-2, qw, 20);
    ctx.fillRect(qx-qw,qy-2,qw,20); ctx.fillStyle=G.quest.done?COL.heal:COL.textGold; ctx.fillText(qt,qx-6,qy+13);
    // hunt-contract tracker (under the quest tracker) — only shows inside a hunt zone
    const hz=zoneOf(world,h.x,h.y); const HC=HUNTS[hz]; const HS=G.hunts&&G.hunts[hz];
    if(HC && HS){ let ht, hc; if(HS.cleared){ ht=STR.huntZoneCleared; hc=COL.heal; }
      else if(HS.champ){ ht=STR.huntChampApproaches; hc=COL.skullR; }
      else { ht=STR.huntLabel(HS.kills,HC.need); hc=COL.textGold; }
      const hy=qy+22; ctx.fillStyle=COL.out; const hw=ctx.measureText(ht).width+12;
      AR("huntTracker", qx-hw, hy-2, hw, 20);
      ctx.fillRect(qx-hw,hy-2,hw,20); ctx.fillStyle=hc; ctx.fillText(ht,qx-6,hy+13); }
    // spell bar
    renderSpellBar();
    renderAbilityBar(); // CAS-1570: the 2 drafted active-ability slots (radial cooldown)
    // minimap
    if(!isTouch || true) renderMiniMap();
    if(auditRects){ try{ window.__uiRects=auditRects; }catch(e){} }
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
  function renderConsumableSlot(h, hudUI){ if(isTouch) return; const s=44;
    // CAS-299: the legacy slot lives bottom-left, where the HUD console now sits. When the
    // HUD is active, reflow the quick-use slot to just LEFT of the spell bar (combat-coherent:
    // potions beside spells) so it never overlaps the console frame.
    const sidebar=view.sbw>0;
    let x=12, y=VH-12-s;
    if(sidebar){ // CAS: quick-use slot sits in the bottom bar, just LEFT of the attacks hotbar
      const sb=Math.min(46,VW*0.1), sbTotal=4*sb+3*6, hbx=Math.round(view.gcx()-sbTotal/2);
      x=Math.max(10, hbx-s-14); y=VH-view.bbh+8; }
    else if(hudUI){ const sb=Math.min(46,VW*0.1); const sbTotal=4*sb+3*6; const sbx=VW/2-sbTotal/2;
      x=Math.max(12, Math.round(sbx-s-16)); y=VH-14-s;
      // CAS-416: below ~930px wide the spell bar sits close enough to the left corner
      // that "just LEFT of the spell bar" lands ON the HUD console frame (DOM panel,
      // 340px × HUD scale wide). Flip the slot to the RIGHT of the spell bar instead
      // (still combat-coherent, and the minimap corner stays clear down to 640px).
      const hs=VW>=1280?1:VW>=1024?0.92:VW>=640?0.84:0.78; // mirror hud.js applyScale --s
      if(x<12+340*hs+8) x=Math.round(sbx+sbTotal+16); }
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
  // CAS-1570 — the two DRAFTED active-ability slots. Sits just LEFT of the class spellbar
  // so all castable actions read in one row. Reuses the exact CAS-1539 radial-cooldown
  // sweep. $0 art: the icon is the ability's glyph tinted by its colour (no PNG needed).
  function renderAbilityBar(){ const h=G.hero; if(!h||!h.loadout||h.abilCD==null||isTouch) return;
    const n=2, s=Math.min(46,VW*0.1), gap=6, sp4=4*s+3*gap, total=n*s+(n-1)*gap;
    // Sit LEFT of the consumable quick-slot (which itself sits left of the spellbar), so
    // the three clusters — abilities | potion | class spells — never overlap. cons=44+14.
    const sidebar=view.sbw>0; let x0, y;
    if(sidebar){ x0=Math.round(view.gcx()-sp4/2)-58-total-12; y=VH-view.bbh+8; }
    else { x0=(uiLayout.cx("spellbar", VW/2-sp4/2, sp4))-58-total-12; y=uiLayout.cy("spellbar", VH-14-s, s+11); }
    if(x0<8) x0=8; // never clip off the left edge on a narrow canvas
    const keys=["Z","X"];
    for(let i=0;i<n;i++){ const a=ABILITY_MAP[h.loadout[i]]||{}; const x=x0+i*(s+gap);
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
  function renderSpellBar(){ const h=G.hero; const n=4; const s=Math.min(46,VW*0.1); const gap=6; const total=n*s+(n-1)*gap;
    if(isTouch) return; // touch uses buttons
    // CAS-418: anchor from the layout store (default = bottom-centre, unchanged);
    // cx/cy clamp a stored anchor to the live viewport EVERY draw (covers load+resize).
    const sidebar=view.sbw>0;
    let x0, y;
    if(sidebar){ // CAS: attacks hotbar sits in the bottom bar, centred over the game area, just
      // above the chat input (which the DOM owns at y≈VH-30)
      x0=Math.round(view.gcx()-total/2); y=VH-view.bbh+8; }
    else {
      x0=uiLayout.cx("spellbar", VW/2-total/2, total);
      y=uiLayout.cy("spellbar", VH-14-s, s+11);
      uiLayout.pub("spellbar", x0, y, total, s+11); } // hit-rect for the input drag router
    AR("spellbar", x0-2, y-2, total+4, s+13); // incl. the mp-cost caption line
    if(uiLayout.dragging()==="spellbar"){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x0-4,y-4,total+8,s+15); }
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
    // vitals bars
    y+=34;
    bar(x0,y,    iw,16, h.hp/mhp,      COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+mhp);
    bar(x0,y+20, iw,13, h.mp/h.maxMp,  COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    bar(x0,y+37, iw,9,  h.xp/h.xpNext, COL.xpf,COL.xpb, STR.level(h.lvl));
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
  // CAS-466: silueta del continente para el minimapa (1px = 2 tiles, cacheada)
  let mmTerra=null, mmTerraW=0;
  function mmBuildTerra(){ const sc=2, cw=Math.ceil(MAP_W/sc), ch=Math.ceil(MAP_H/sc);
    const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
    const c2=cv.getContext("2d"); const img=c2.createImageData(cw,ch); const px=img.data;
    const C=[[96,130,96],[152,124,84],[62,68,82],[164,154,124],[192,172,116],[40,102,138],[150,190,212],[80,116,92]];
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ const c=C[world.terr[(y*sc)*MAP_W+(x*sc)]]||[50,50,50];
      const i=(y*cw+x)*4; px[i]=c[0];px[i+1]=c[1];px[i+2]=c[2];px[i+3]=255; }
    c2.putImageData(img,0,0); mmTerra=cv; mmTerraW=cw; }
  function renderMiniMap(){ if(isTouch) return;
    const sidebar=view.sbw>0;
    let mw=120, mh=120, x, y;
    if(sidebar){ // CAS: minimap docked in the right sidebar (under the vitals), centred
      mw=mh=Math.min(view.sbw-28,176); x=view.sbx()+Math.round((view.sbw-mw)/2); y=104; }
    else { // CAS-418: anchor from the layout store (default = bottom-right, unchanged), clamped every draw
      x=uiLayout.cx("minimap", VW-mw-12, mw);
      y=uiLayout.cy("minimap", VH-mh-12, mh);
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
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ ctx.fillRect(mmox+p.x*sx-1,mmoy+p.y*sy-1,3,3); } }
    ctx.fillStyle="#ff5a4a"; for(const e of G.enemies){ ctx.fillRect(mmox+e.x*sx-1,mmoy+e.y*sy-1,2,2); }
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
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ ctx.fillRect(x+p.x*sx-2,y+p.y*sy-2,4,4); } }
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
  // A signed coloured delta token ("+12", "-3", "—"). CAS-117 equip-decision diff.
  function deltaTok(d){ if(!d) return {t:"—",c:COL.textDim}; return d>0?{t:"+"+d,c:COL.heal}:{t:""+d,c:"#d05555"}; }
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
      if(inst){ ctx.fillStyle=COL.cream; ctx.font="9px "+FF; ctx.textAlign="right"; ctx.fillText(String(gearStat(inst)), sx+ss-3, sy+ss-3); }
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
      if(inst){
        const isz=Math.min(32,slotSz-4), ix=sx+(slotSz-isz)/2, iy=sy+(slotSz-isz)/2;
        const gi=IMG["icon_slot_"+inst.slot];
        if(gi&&gi.complete&&gi.naturalWidth){ ctx.save(); ctx.imageSmoothingEnabled=false; ctx.drawImage(gi,Math.round(ix),Math.round(iy),isz,isz); ctx.restore(); }
        else { ctx.textAlign="center"; ctx.fillStyle=gearCol(inst); ctx.font="bold "+Math.round(isz*0.7)+"px "+FF;
          ctx.fillText(({weapon:"⚔",body:"▣",shield:"◈",head:"^",legs:"Π",feet:"▾",neck:"◆",back:"≈",ring:"○",bag:"▦"}[inst.slot]||"▪"), sx+slotSz/2, sy+slotSz*0.68); }
        // rarity dot + affix pips
        ctx.fillStyle=gearCol(inst); ctx.font="7px "+FF; ctx.textAlign="right";
        ctx.fillText(String(gearStat(inst)), sx+slotSz-2, sy+slotSz-2);
        const na=affixList(inst).length; if(na){ ctx.fillStyle="#9be7ff"; ctx.font="7px "+FF; ctx.textAlign="left"; ctx.fillText("◈".repeat(na), sx+2, sy+slotSz-2); }
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
    if(sel){ ctx.fillStyle="#161b22"; ctx.fillRect(rx,cy,rw,cmpH); ctx.strokeStyle="#3a4456"; ctx.lineWidth=1; ctx.strokeRect(rx,cy,rw,cmpH);
      const eq=h.equip[sel.slot];
      ctx.textAlign="left"; ctx.font="10px "+FF; ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpEquipped, rx+6, cy+13);
      ctx.fillStyle=gearCol(eq); ctx.fillText(rarityMark(eq)+gearName(eq)+" ("+gearStat(eq)+")", rx+6, cy+25);
      drawAffixLines(eq, rx+10, cy+36, 10);
      const midX=rx+rw*0.52;
      ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpNew, midX, cy+13);
      ctx.fillStyle=gearCol(sel); ctx.fillText("("+gearStat(sel)+")", midX, cy+25);
      drawAffixLines(sel, midX+4, cy+36, 10);
      // net combat deltas if equipped (the tradeoff at a glance)
      const before={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const old=h.equip[sel.slot]; h.equip[sel.slot]=sel;
      const after={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const a2=affixTotals(h); h.equip[sel.slot]=old; const a1=affixTotals(h);
      const parts=[["Dmg",after.dmg-before.dmg],["Def",after.def-before.def],["HP",after.hp-before.hp],["AtkV%",a2.atkspd-a1.atkspd],["MovV%",a2.movespd-a1.movespd]];
      let dx=rx+6; ctx.font="bold 10px "+FF; const dyb=cy+cmpH-8;
      for(const [lbl,dv] of parts){ const tk=deltaTok(dv); const seg=lbl+" "; ctx.fillStyle=COL.textDim; ctx.fillText(seg,dx,dyb); dx+=ctx.measureText(seg).width;
        ctx.fillStyle=tk.c; ctx.fillText(tk.t+"  ",dx,dyb); dx+=ctx.measureText(tk.t+"  ").width; }
    }
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
    const bw=Math.min(VW*0.9,500), bh=Math.min(VH*0.9,470), x=(VW-bw)/2, y=(VH-bh)/2;
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
    // close
    const ccy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,ccy,120,24);
    ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px "+FF; ctx.fillText("Cerrar (E)",VW/2,ccy+17);
    ui.bountyRects.push({x:x+bw/2-60,y:ccy,w:120,h:24,act:()=>{ G.scene="play"; }});
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
    const bw=Math.min(VW*0.9,460), bh=Math.min(VH*0.82,340), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 19px "+FF; ctx.fillText(STR.ascendTitle,VW/2,y+30);
    ctx.fillStyle=COL.textDim; ctx.font="11px "+FF; ctx.fillText(STR.conquestProgress(4,4),VW/2,y+48);
    // tier card — star glyph, target tier name, effect line
    const cardY=y+62, cardH=bh-62-118, cw=bw-40, cx=x+20;
    ctx.fillStyle="#2a2618"; ctx.fillRect(cx,cardY,cw,cardH);
    ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(cx+0.5,cardY+0.5,cw,cardH);
    ctx.fillStyle="#ffd24d"; ctx.font="34px "+FF; ctx.fillText("★", VW/2, cardY+44);
    ctx.fillStyle=COL.cream; ctx.font="bold 16px "+FF; ctx.fillText(STR.ascendName(a.tier), VW/2, cardY+70);
    ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="12px "+FF; wrapText(STR.ascendDesc(a.tier), cx+16, cardY+92, cw-32, 16);
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
      toggle(STR.settingCRT, G.settings.crt, ()=>{ G.settings.crt=!G.settings.crt; save(); }, oy); oy+=32;
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
  function renderAltar(){
    ui.altarRects=[];
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
    const tutKey=(a)=>keyLabel((G.settings.binds||settings.defaultBinds())[a]);
    const bindAware=(v)=> typeof v==="function" ? v(tutKey) : v;
    let head, body, showSkip=true, prog=true;
    if(step==="done"){ head=STR.tutDoneHead; body=bindAware(STR.tutDone); showSkip=false; prog=false; }
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
    function btn(b,col,big){ if(!b.r) return; ctx.globalAlpha=0.55; ctx.fillStyle="#12161d"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.28); ctx.fill();
      ctx.globalAlpha=0.9; ctx.strokeStyle=col||COL.panelB; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=col||COL.cream; ctx.font="bold "+(big?20:14)+"px "+FF; ctx.textAlign="center"; ctx.fillText(b.label,b.x,b.y+ (big?7:5)); ctx.globalAlpha=1; }
    btn(tb.attack,COL.textGold,true); btn(tb.roll,COL.cream); btn(tb.s2,COL.flame); btn(tb.s3,COL.heal); btn(tb.s4,COL.rune); btn(tb.act,COL.cream); btn(tb.pick,COL.cream);
    btn(top.inv,COL.cream); btn(top.map,COL.cream); btn(top.pause,COL.cream);
    // mp cost hints on spell buttons (data-driven per class)
    const sp=SPELLS[G.hero.cls]||SPELLS.warrior;
    ctx.globalAlpha=0.8; ctx.font="9px "+FF; ctx.fillStyle="#8ab8ff"; ctx.textAlign="center";
    ctx.fillText(""+sp[0].cost,tb.s2.x,tb.s2.y+tb.s2.r+10); ctx.fillText(""+sp[1].cost,tb.s3.x,tb.s3.y+tb.s3.r+10); ctx.fillText(""+sp[2].cost,tb.s4.x,tb.s4.y+tb.s4.r+10); ctx.globalAlpha=1;
  }

  function renderCRT(){ ctx.globalAlpha=0.10; ctx.fillStyle="#000";
    for(let y=0;y<VH;y+=3){ ctx.fillRect(0,y,VW,1); } ctx.globalAlpha=1;
    const g=ctx.createRadialGradient(VW/2,VH/2,VH*0.25,VW/2,VH/2,VH*0.85); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.72)");
    ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH); }

  // ------------------------------- menu ----------------------------------
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

  return { render };
}
