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
import { TS, MAP_W, MAP_H, T_GRASS, T_STONE, T_SAND, T_COBBLE, CFG, CLASS_LIST, CLASS_STATS, SPELLS, HUNTS, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, STAGE1_GOAL, STATUS, CONSUMABLES, CUSTOMIZE } from "../sim/config.js";
import { clamp, dist2 } from "../sim/math.js";
import { createRNG, hash2 } from "../sim/rng.js";
import { gearStat, gearName, gearCol, equippedDmg, equippedDef, heroMaxHp, affixTotals, affixList, affixLabel } from "../sim/gear.js";
import { TALENTS, talentNodes, talentNode, nodeRank, canAllocTalent, lockReason, talentSpent } from "../sim/talents.js";
import { STR } from "../strings.js";
import { audio } from "../audio.js";
import { view, zoom } from "../view.js";
import { COL } from "./palette.js";
import { resetGame } from "../persist.js";   // CAS-113: pause-menu "Nueva partida"
import { daily } from "../daily.js";          // CAS-134: daily return loop (bounty board view model)
import {
  blit, SP, IMG, loadImg, drawCoin, drawPotion, drawFragment,
  ANIM, ENEMY_ANIM, ENEMY_IMG, ENEMY_STRIP, NPC_ANIM, CLS, PROP_SCALE, HERO_SPRITE_SCALE,
  dir4FromAngle, drawClassFrame, drawAnim, frameIndex,
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
// input owns the UI hit-rects + touch state/layout; render writes rects, reads layout.
import { ui, stick, tbtns, topBtns, isTouch } from "../input.js";

export function createRenderer(ctx){
  const G = sim.G, world = sim.world;
  const rrng = createRNG();            // presentation-only RNG (isolated from sim)
  loadImg("hero_erw", ERW_HERO_SRC);   // CAS-82: hooded pose (now the load-time fallback)
  for(const k in HERO_STRIPS) loadImg(HERO_STRIPS[k].img, `./assets/erw/hero/${HERO_STRIPS[k].img}.png`); // CAS-92 anim strips
  for(const k of CLASS_HERO_KEYS) loadImg("clshero_"+k, `./assets/erw/hero/classes/${k}.png`); // CAS-98 per-class clean cutouts
  for(const k of CLASS_HERO_KEYS) loadImg("clswalk_"+k, `./assets/erw/hero/classes/${k}_walk.png`); // CAS-110 per-class walk-cycle strips
  // CAS-169: start loading the recolorable part masks; the baked look replaces the
  // class strips below once ready. Until then the CAS-167 PNG strips render (no blank).
  ensureMasks();
  // Re-bake the hero's strips ONLY when the chosen look changes (class / palette /
  // variation). A cheap signature dirty-check keeps the bake off the hot path: it runs
  // on createHero, loadSave and every live customization edit, never per frame.
  let _lookSig="";
  function syncHeroLook(){
    const h=G.hero; if(!h||!h.palette||!h.variation) return;
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

  // CAS-121: T_ICE (index 6) — pale-blue frozen floor for the Cripta Helada, drawn
  // procedurally (no image) via the fallback fill path so the zone reads as colder.
  const tileBase=[COL.grass,COL.dirt,COL.stone,COL.cobble,COL.sand,COL.water,"#9fc2d6"];
  const tileLight=[COL.grassL,COL.dirtL,COL.stoneL,COL.cobbleL,COL.sandL,COL.waterL,"#d6ecf6"];
  const tileDark=[COL.grassD,COL.dirtD,COL.stoneD,COL.cobbleD,COL.sandD,COL.water,"#7ba2b8"];

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
    if(G.scene==="bounty") renderBounty();
    if(G.scene==="pause") renderPause();
    if(G.scene==="dead") renderDeath();
    if(G.scene==="victory") renderVictory();
    // CAS-128: onboarding coachmarks — drawn only in free play, never over a panel, so
    // they teach without blocking. Cleared once finished/skipped (G.tut.active=false).
    if(G.scene==="play" && G.tut && G.tut.active) renderTutorial();
    renderToast();
    if(isTouch && G.scene==="play") renderTouch();
    if(G.settings.crt) renderCRT();
  }

  function renderWorld(camX,camY,Z){
    const x0=Math.max(0,Math.floor(camX/TS)-1), y0=Math.max(0,Math.floor(camY/TS)-1);
    const x1=Math.min(MAP_W-1,Math.ceil((camX+VW/Z)/TS)+1), y1=Math.min(MAP_H-1,Math.ceil((camY+VH/Z)/TS)+1);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const t=world.terr[y*MAP_W+x]; const px=x*TS, py=y*TS;
      if(world.wallSet && world.wallSet.has(y*MAP_W+x)){ const wimg=(hash2(x,y)<0.5?IMG.wall:IMG.wall2);
        if(wimg&&wimg.complete&&wimg.naturalWidth) ctx.drawImage(wimg,px,py,TS,TS); else { ctx.fillStyle="#2b313a"; ctx.fillRect(px,py,TS,TS); }
        continue; }
      if(t===T_STONE){ const img = (hash2(x,y)<0.5?IMG.cave_floor:IMG.cave_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      // CAS-77: real EPIC RPG World — Ancient Ruins ground. Town plaza (T_COBBLE)
      // pays in flagstone; forest/ruins/field (T_GRASS) in grass. Two deterministic
      // variants per kind via hash2(); fall through to the procedural fill below when
      // the image hasn't loaded (unit tooling / first frame). Collision is untouched.
      if(t===T_COBBLE){ const img=(hash2(x,y)<0.5?IMG.ruins_floor:IMG.ruins_floor2);
        if(img&&img.complete&&img.naturalWidth){ ctx.drawImage(img,px,py,TS,TS);
          if(world.wallSet.has((y-1)*MAP_W+x)){ ctx.fillStyle="rgba(0,0,0,0.34)"; ctx.fillRect(px,py,TS,6); }
          continue; } }
      if(t===T_GRASS){ const img=(hash2(x,y)<0.5?IMG.ruins_grass:IMG.ruins_grass2);
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
    const order=[];
    for(const d of world.deco) order.push({y:d.y,draw:()=>{
      if(d.kind && d.kind.startsWith("prop_")){ const img=IMG[d.kind]; if(img&&img.complete&&img.naturalWidth){
          const s=PROP_SCALE[d.kind]||1, w=img.naturalWidth*s, h=img.naturalHeight*s; ctx.drawImage(img, Math.round(d.x-w/2), Math.round(d.y-h), Math.round(w), Math.round(h));
          if(d.kind==="prop_torch"){ const fy=d.y-h+10; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(d.x,fy,5+Math.sin(G.t*9+d.x)*1.5,0,6.28); ctx.fill();
            ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(d.x,fy,2.5,0,6.28); ctx.fill();
            ctx.globalAlpha=0.18; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(d.x,fy,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
        } return; }
      const spr=SP[d.kind]; if(!spr) return; const px=d.kind==="tree"?4:3; blit(ctx,spr.rows,spr.pal,d.x,d.y-(d.kind==="tree"?18:0),px,false);
    }});
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
      ctx.font="bold "+sz+"px 'Courier New',monospace"; ctx.textAlign="center";
      ctx.fillStyle=COL.out; ctx.fillText(f.txt,f.x+1,f.y+1); ctx.fillStyle=f.col; ctx.fillText(f.txt,f.x,f.y); ctx.globalAlpha=1; }
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
    if(h.rolling){ ctx.globalAlpha=0.35; ctx.fillStyle="#aeb6c2"; ctx.beginPath(); ctx.arc(h.x,h.y+4,15,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
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
    // CAS-110: when walking, play the dedicated 8-frame walk-cycle strip (real gait)
    // at CLASS_WALK_FPS; otherwise cycle the CAS-98/101 idle loop (time-driven, always
    // moving), a touch faster while rolling/attacking so the loop still reads as motion.
    const walking=(state==="walk");
    const cfps=(state==="roll")?11:(state==="attack")?9:2.6;
    const cfi=walking?(Math.floor(G.t*CLASS_WALK_FPS)%CLASS_WALK_FC):(Math.floor(G.t*cfps)%CLASS_FC);
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
    const ok=drawHeroClass(CLASS_HERO_ART[cls],cfi,hx,hfeet,flip,sqX,sqY,bobUp,tint,walking) // CAS-98/110 per-class animated loop
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
  function drawHeroClass(art,fi,cx,feet,flip,sqX,sqY,bobUp,tint,walk){
    // CAS-110: walk → dedicated clswalk_* strip (8 frames). Same cell geom as the idle,
    // so the only difference is which image + how many columns; falls back to the idle
    // strip (clamped to CLASS_FC) until the walk PNG loads → no blank frame.
    let img=art?IMG[(walk?"clswalk_":"clshero_")+art]:null;
    if(walk && (!img||!img.complete||!img.naturalWidth)){ img=art?IMG["clshero_"+art]:null; fi=(fi||0)%CLASS_FC; }
    if(!img||!img.complete||!img.naturalWidth) return false;
    const S=CLASS_ANIM_SCALE, dw=CLASS_FW*S*sqX, dh=CLASS_FH*S*sqY, sx=(fi||0)*CLASS_FW;
    const dx=cx-CLASS_AX*S*sqX, dy=feet-CLASS_FOOT*S*sqY-(bobUp||0);
    let src=img, ssx=sx, ssy=0;
    if(tint && _heroBx){ _heroBuf.width=CLASS_FW; _heroBuf.height=CLASS_FH;
      _heroBx.clearRect(0,0,CLASS_FW,CLASS_FH); _heroBx.imageSmoothingEnabled=false;
      _heroBx.globalCompositeOperation="source-over"; _heroBx.drawImage(img,sx,0,CLASS_FW,CLASS_FH,0,0,CLASS_FW,CLASS_FH);
      _heroBx.globalCompositeOperation="source-atop"; _heroBx.globalAlpha=0.85; _heroBx.fillStyle=tint; _heroBx.fillRect(0,0,CLASS_FW,CLASS_FH);
      _heroBx.globalAlpha=1; _heroBx.globalCompositeOperation="source-over";
      src=_heroBuf; ssx=0; ssy=0; }
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if(flip){ ctx.translate(dx+dw,dy); ctx.scale(-1,1); ctx.drawImage(src,ssx,ssy,CLASS_FW,CLASS_FH,0,0,dw,dh); }
    else ctx.drawImage(src,ssx,ssy,CLASS_FW,CLASS_FH,dx,dy,dw,dh);
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
  function drawEnemy(e){
    const spr=SP[e.tpl.sprite]; const px=e.isBoss?5:(e.champion?5:(e.tpl.size>20?4:3));
    const fl = (e.facing!==undefined)?Math.cos(e.facing)<0:false;
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
    // CAS-121 CORAZA DE ESCARCHA telegraph: while the boss channels its Freeze Nova it
    // wears a pulsing ice shell (reads as IMMUNE) and a danger ring GROWS toward the nova
    // radius over the channel — the player reads "break it with a status, or roll out".
    if(e.shielded){ const C=e.carapace, ch=(C&&C.channel)||2.4, prog=clamp(1-(e.st||0)/ch,0,1);
      const Rmax=((C&&C.nova)?C.nova.spd*C.nova.life:210);
      ctx.save();
      // growing ground danger ring (nova footprint)
      ctx.globalAlpha=0.16+0.18*prog; ctx.fillStyle="#7fd0ff";
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.4,Rmax*prog,Rmax*prog*0.5,0,0,6.28); ctx.fill();
      ctx.globalAlpha=0.4+0.3*Math.abs(Math.sin(G.t*10)); ctx.strokeStyle="#bfefff"; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.ellipse(e.x,e.y+e.tpl.size*0.4,Rmax,Rmax*0.5,0,0,6.28); ctx.stroke();
      // ice shell around the boss (the immune carapace)
      const sr=e.tpl.size*1.05+Math.sin(G.t*6)*2;
      ctx.globalAlpha=0.55; ctx.strokeStyle="#dff4ff"; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(e.x,e.y,sr,0,6.28); ctx.stroke();
      ctx.globalAlpha=0.18; ctx.fillStyle="#bfe6ff"; ctx.beginPath(); ctx.arc(e.x,e.y,sr,0,6.28); ctx.fill();
      ctx.restore(); }
    // windup telegraph: flashing warning + slight grow
    if(e.state==="windup"){ const fl2=Math.floor(G.t*16)%2===0;
      if(e.tpl.ranged){ const a=e.facing; const col=e.tpl.proj==="bolt"?"#9bef5a":"#ffd24d";
        ctx.globalAlpha=0.55; ctx.strokeStyle=fl2?col:"#ff8a3a"; ctx.lineWidth=2; ctx.setLineDash([6,7]);
        ctx.beginPath(); ctx.moveTo(e.x,e.y-6); ctx.lineTo(e.x+Math.cos(a)*240,e.y-6+Math.sin(a)*240); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha=1;
        const cx=e.x+Math.cos(a)*14, cy=e.y-8+Math.sin(a)*14; ctx.globalAlpha=0.9; ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(cx,cy,3+(fl2?2:0),0,6.28); ctx.fill(); ctx.globalAlpha=1;
      } else if(e.tpl.arch==="brute"){
        // CAS-115 brute GROUND-SLAM tell: a red danger ellipse on the ground that grows
        // toward the AoE radius over the (long) windup, plus a pulsing full-size outline
        // so the player reads the final blast size at a glance and steps OUT of it.
        const R=e.tpl.aoe||56, prog=clamp(1-(e.st||0)/(e.tpl.windup||0.8),0,1), cy=e.y+e.tpl.size*0.35;
        ctx.save();
        ctx.globalAlpha=0.20+0.20*prog; ctx.fillStyle="#ff5230";
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
        ctx.globalAlpha=0.16+0.12*Math.abs(Math.sin(G.t*12)); ctx.fillStyle="#ff5230";
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
        ctx.globalAlpha=0.22+0.26*prog; ctx.fillStyle="#ff3b2e";
        ctx.beginPath(); ctx.ellipse(e.x,cy,R*prog,R*prog*0.5,0,0,6.28); ctx.fill();
        ctx.globalAlpha=0.5+0.4*Math.abs(Math.sin(G.t*20)); ctx.strokeStyle=fl2?"#ffe08a":"#ff5a3c"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.restore();
      } else {
        ctx.globalAlpha=0.5; ctx.fillStyle=fl2?"#ffd24d":"#ff6a3a";
        ctx.beginPath(); ctx.arc(e.x,e.y,e.tpl.range+6,0,6.28); ctx.fill(); ctx.globalAlpha=1;
        ctx.fillStyle="rgba(255,120,60,0.35)"; ctx.beginPath(); ctx.moveTo(e.x,e.y);
        ctx.arc(e.x,e.y,e.tpl.range+12,e.facing-0.5,e.facing+0.5); ctx.closePath(); ctx.fill();
      }
      // CAS-109 special-slam tell: a red ring that GROWS over the (longer) windup so
      // the player reads "radial slam incoming — roll out/through" before it lands.
      if(e.specialNow){ const wmax=(e.special&&e.special.windup)||e.tpl.windup;
        const prog=clamp(1-(e.st||0)/wmax,0,1), R=34+prog*72, cy=e.y+e.tpl.size*0.45;
        ctx.save(); ctx.globalAlpha=0.30+0.30*Math.abs(Math.sin(G.t*16));
        ctx.strokeStyle="#ff5230"; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(e.x,cy,R,R*0.5,0,0,6.28); ctx.stroke();
        ctx.globalAlpha=0.45; ctx.lineWidth=1.5; ctx.strokeStyle="#ffd0a0";
        ctx.beginPath(); ctx.ellipse(e.x,cy,R*0.62,R*0.31,0,0,6.28); ctx.stroke(); ctx.restore(); }
    }
    let drew=false; const ch=ENEMY_ANIM[e.type];
    if(ch && IMG[ch+"_walk"]){
      const ds=ANIM[ch]&&ANIM[ch].ds; const S=ds?ds*(e.isBoss?1.15:e.champion?1.0:0.82):(e.isBoss?1.3:0.85), feet=e.y+e.tpl.size*0.5, st=e.animState||"idle";
      const fps = st==="attack"? (ANIM[ch].fc.attack/(e.tpl.windup+0.15)) : (st==="walk"?10:6);
      const fi=frameIndex(ch,st,e.animT||0,fps, st!=="attack");
      drew=drawAnim(ctx,ch,st,fi,e.x,feet,S,fl, e.hurtFlash>0?"#ffffff":null);
    }
    // CAS-209: real PixelLab walk-cycle strip for solid-bodied mobs (skel/bandit/orc).
    // 6-frame 64×64 strip; frame chosen off sim time G.t (+ stable per-mob phase) so
    // the legs actually step — a genuine animation, not the procedural bob. Bottom-
    // anchored, flip + hurt-flash honored, reduceMotion freezes to frame 0. Reads only
    // render state (G.t/e.x/e.y/tpl/animState/hurtFlash) and mutates nothing → Stage-2 safe.
    if(!drew){ const strip=ENEMY_STRIP[e.tpl.sprite]; const simg=strip&&IMG[strip.key];
      if(simg && simg.complete && simg.naturalWidth){
        const fw=strip.fw, fh=strip.fh;
        const dh=e.tpl.size*(e.isBoss?3.4:e.champion?2.9:2.4), dw=dh*(fw/fh);
        const feetY=e.y+e.tpl.size*0.5, ph=(e.x*0.7+e.y*0.9), st=e.animState||"idle";
        const fps = st==="walk"?9 : st==="attack"?10 : 4;
        const fi = G.settings.reduceMotion ? 0 : (Math.floor(G.t*fps+ph*7)%strip.fc+strip.fc)%strip.fc;
        const bob = (!G.settings.reduceMotion && st==="idle") ? Math.sin(G.t*2.3+ph)*0.8 : 0;
        ctx.save(); ctx.translate(e.x, feetY+bob);
        if(fl) ctx.scale(-1,1);
        ctx.imageSmoothingEnabled=false;
        ctx.drawImage(simg, fi*fw,0,fw,fh, -dw/2,-dh,dw,dh);
        if(e.hurtFlash>0){ ctx.globalAlpha=0.6*Math.min(1,e.hurtFlash*4); ctx.globalCompositeOperation="lighter";
          ctx.drawImage(simg, fi*fw,0,fw,fh, -dw/2,-dh,dw,dh); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; }
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
        const feetY=e.y+e.tpl.size*0.5, ph=(e.x*0.7+e.y*0.9), st=e.animState||"idle";
        let sx=1, sy=1, bob=0;
        if(!G.settings.reduceMotion){
          if(st==="walk"){ const b=Math.abs(Math.sin(G.t*9+ph)); bob=-b*2.4; sy=1+b*0.06; sx=1-b*0.05; }
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
        const h=rows.length, feetY=e.y+(h*px)/2, ph=(e.x*0.7+e.y*0.9), st=e.animState||"idle";
        let sx=1, sy=1, bob=0;
        if(st==="walk"){ const b=Math.abs(Math.sin(G.t*9+ph)); bob=-b*2.2; sy=1+b*0.06; sx=1-b*0.05; }
        else if(st==="attack"){ const a=Math.sin(G.t*5+ph); sy=0.95+0.02*a; sx=1.05-0.02*a; bob=1.2; }
        else { const br=Math.sin(G.t*2.3+ph); sy=1+br*0.045; sx=1-br*0.03; bob=br*0.7; }
        ctx.save(); ctx.translate(e.x, feetY+bob); ctx.scale(sx,sy);
        blit(ctx, rows, pal, 0, -(h*px)/2, px, fl);
        ctx.restore();
      }
    }
    // health bar
    const w=e.isBoss?64:(e.champion?58:Math.max(22,e.tpl.size*1.6)); const hh=(e.isBoss||e.champion)?6:4; const yy=e.y-e.tpl.size-((e.isBoss||e.champion)?14:8);
    ctx.fillStyle=COL.out; ctx.fillRect(e.x-w/2-1,yy-1,w+2,hh+2);
    ctx.fillStyle=COL.hpb; ctx.fillRect(e.x-w/2,yy,w,hh);
    const champCol=e.capstone?(e.enraged?"#ff4636":"#ff9a3a"):"#ffcf4d";
    ctx.fillStyle=e.champion?champCol:(e.hostile?"#ff5a4a":COL.hpf); ctx.fillRect(e.x-w/2,yy,w*clamp(e.hp/e.maxHp,0,1),hh);
    if(e.isBoss){ ctx.fillStyle=COL.textGold; ctx.font="bold 10px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("GÓLEM ANCESTRAL",e.x,yy-4); }
    else if(e.champion){ ctx.fillStyle=e.shielded?"#9be7ff":(e.specialNow?"#ff5230":champCol); ctx.font="bold 10px 'Courier New'"; ctx.textAlign="center";
      ctx.fillText((e.capstone?"☠ ":"★ ")+e.tpl.champName+(e.shielded?" ❄ CORAZA":e.enraged?" ¡ENFURECIDO!":e.specialNow?" ¡CUIDADO!":""),e.x,yy-4); }
    else if(e.elite){ ctx.fillStyle="#ff7a4d"; ctx.font="bold 9px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("⚔ ÉLITE",e.x,yy-3); }
    // CAS-118: status icons/aura sit just above the HP bar so afflictions read at a glance.
    drawStatusFx(e, e.x, e.y+e.tpl.size*0.5, yy-9);
  }
  function drawNPC(n){
    // CAS-84: animated town NPCs (e.g. the merchant) reuse the enemy drawAnim helper
    // with an idle-only loop. Purely cosmetic (driven by render time G.t, no RNG), so
    // it stays Stage-2 sim-determinism safe. Falls back to the procedural sprite while
    // the strip loads or for non-animated NPCs. topY = head height for the E/! marker.
    const ach=NPC_ANIM[n.sprite]; let topY;
    if(ach && IMG[ach+"_idle"] && IMG[ach+"_idle"].complete && IMG[ach+"_idle"].naturalWidth){
      const S=1.0, feet=n.y+14, fi=frameIndex(ach,"idle",G.t,6,true);
      drawAnim(ctx,ach,"idle",fi,n.x,feet,S,false,null);
      topY=feet-ANIM[ach].fh.idle*S;
    } else { const spr=SP[n.sprite];
      // CAS-113: an animated NPC has NO SP fallback entry — while its strip image is
      // still loading (e.g. when we rehydrate a save straight into play), skip the
      // body this frame instead of crashing on a missing sprite.
      if(spr){ blit(ctx,spr.rows,spr.pal,n.x,n.y,3,false); topY=n.y-spr.rows.length*3/2; } else { topY=n.y-20; } }
    // marker
    const near=dist2(G.hero.x,G.hero.y,n.x,n.y)<CFG.talkRange*CFG.talkRange;
    let mk = n.role==="quest" && !G.quest.rewarded ? "!" : (near?"E":"");
    if(n.role==="quest" && G.quest.done && !G.quest.rewarded) mk="!";
    if(mk){ ctx.fillStyle=mk==="!"?COL.textGold:COL.cream; ctx.font="bold 14px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(mk,n.x,topY-6+Math.sin(G.t*4)*2); }
  }
  function drawProjectile(p){ if(p.kind==="fire"){ ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,6.28); ctx.fill(); ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,6.28); ctx.fill(); }
    else if(p.kind==="rune"){ ctx.fillStyle=COL.rune; ctx.fillRect(p.x-4,p.y-4,8,8); ctx.fillStyle="#aac4ff"; ctx.fillRect(p.x-2,p.y-2,4,4); }
    // CAS-121 Freeze Nova shard — a pale-blue ice splinter (the boss's punish-ring).
    else if(p.kind==="frostnova"){ const a=Math.atan2(p.vy,p.vx);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.globalAlpha=0.3; ctx.fillStyle="#7fd0ff"; ctx.beginPath(); ctx.arc(0,0,8,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#bfefff"; ctx.beginPath(); ctx.moveTo(7,0); ctx.lineTo(-4,-3.5); ctx.lineTo(-4,3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#eafaff"; ctx.fillRect(-1.5,-1.5,3,3); ctx.restore(); }
    else if(p.kind==="spear"){ const img=IMG.prop_spear; const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx);
      if(img&&img.complete&&img.naturalWidth){ ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.imageSmoothingEnabled=false; const s=0.85; ctx.drawImage(img,-img.naturalWidth*s/2,-img.naturalHeight*s/2,img.naturalWidth*s,img.naturalHeight*s); ctx.restore(); }
      else { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a); ctx.fillStyle="#cdb892"; ctx.fillRect(-10,-1.5,20,3); ctx.fillStyle="#e6ecf4"; ctx.fillRect(8,-2.5,5,5); ctx.restore(); } }
    else if(p.kind==="bolt"){ const pu=Math.sin(G.t*18)*0.5+0.5;
      ctx.globalAlpha=0.25; ctx.fillStyle="#7bd44a"; ctx.beginPath(); ctx.arc(p.x,p.y,11+pu*2,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,6.28); ctx.fill();
      ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,6.28); ctx.fill(); }
    else if(p.kind==="arrow"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx);
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.globalAlpha=0.35; ctx.strokeStyle="#ffe7a8"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-22,0); ctx.lineTo(2,0); ctx.stroke(); ctx.globalAlpha=1;
      ctx.fillStyle="#6e4f33"; ctx.fillRect(-10,-1,16,2);
      ctx.fillStyle="#e8edf4"; ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(0,-3.5); ctx.lineTo(0,3.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#cf9a38"; ctx.fillRect(-10,-2.5,2,5); ctx.restore(); }
    else if(p.kind==="orb"){ const pu=Math.sin(G.t*16)*0.5+0.5;
      ctx.globalAlpha=0.22; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x,p.y,15+pu*3,0,6.28); ctx.fill();
      ctx.globalAlpha=0.5; ctx.fillStyle="#7bd44a"; ctx.beginPath(); ctx.arc(p.x,p.y,9+pu*1.5,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#bcff8a"; ctx.beginPath(); ctx.arc(p.x,p.y,5.5,0,6.28); ctx.fill();
      ctx.fillStyle="#f2ffe6"; ctx.beginPath(); ctx.arc(p.x,p.y,2.6,0,6.28); ctx.fill();
      // trailing wisp
      ctx.globalAlpha=0.3; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(p.x-p.vx*0.02,p.y-p.vy*0.02,3,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    // ---- spell projectiles (paladin/mage/priest slot 2-4) ----
    else if(p.kind==="judgment"){ const pu=Math.sin(G.t*20)*0.5+0.5; // descending bolt of light (mono-objetivo)
      ctx.globalAlpha=0.3; ctx.fillStyle="#ffe39a"; ctx.beginPath(); ctx.arc(p.x,p.y,12+pu*2,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#ffd24d"; ctx.fillRect(p.x-2,p.y-9,4,18); ctx.fillRect(p.x-9,p.y-2,18,4);
      ctx.fillStyle="#fff6d8"; ctx.fillRect(p.x-1.5,p.y-1.5,3,3); }
    else if(p.kind==="voltbolt"){ const a=p.ang!==undefined?p.ang:Math.atan2(p.vy,p.vx); // fast arcane dart
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(a);
      ctx.globalAlpha=0.4; ctx.strokeStyle="#9be7ff"; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(-30,0); ctx.lineTo(6,0); ctx.stroke(); ctx.globalAlpha=1;
      ctx.fillStyle="#eaffff"; ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-2,-4); ctx.lineTo(-2,4); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#9be7ff"; ctx.fillRect(-3,-2,5,4); ctx.restore(); }
    else if(p.kind==="holybolt"){ const pu=Math.sin(G.t*16)*0.5+0.5; // holy projectile (castigo)
      ctx.globalAlpha=0.28; ctx.fillStyle="#fff0b0"; ctx.beginPath(); ctx.arc(p.x,p.y,11+pu*2,0,6.28); ctx.fill(); ctx.globalAlpha=1;
      ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(p.x,p.y,5.5,0,6.28); ctx.fill();
      ctx.fillStyle="#ffd24d"; ctx.fillRect(p.x-1,p.y-5,2,10); ctx.fillRect(p.x-5,p.y-1,10,2); } }
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
  function drawFx(f){ const k=clamp(1-f.t/f.life,0,1), sw=1-k;
    if(f.kind==="spark"){ ctx.globalAlpha=k; ctx.fillStyle=COL.spark; for(let i=0;i<9;i++){ const a=i/9*6.28+f.t*7; const r=sw*24; ctx.fillRect(f.x+Math.cos(a)*r-1.5,f.y+Math.sin(a)*r-1.5,4,4);} ctx.globalAlpha=k*0.8; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*11,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="blood"){ ctx.globalAlpha=k*0.92; ctx.fillStyle=COL.blood; for(let i=0;i<9;i++){ const a=(f.ang||0)+rr(-1.0,1.0); const r=sw*26; const s=2+((i*7)%3); ctx.fillRect(f.x+Math.cos(a)*r,f.y+Math.sin(a)*r,s,s);} ctx.globalAlpha=1; }
    else if(f.kind==="flame"){ ctx.globalAlpha=k; ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(f.x,f.y,sw*32,0,6.28); ctx.fill(); ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(f.x,f.y,sw*19,0,6.28); ctx.fill(); ctx.fillStyle="#fff3c8"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*8,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="heal"){ ctx.globalAlpha=k; ctx.fillStyle=COL.heal; const yy=f.y-sw*26; ctx.fillRect(f.x-2,yy-5,4,12); ctx.fillRect(f.x-5,yy-2,12,4); ctx.globalAlpha=1; }
    else if(f.kind==="rune"){ ctx.globalAlpha=k*0.85; ctx.strokeStyle=COL.rune; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=k*0.5; ctx.strokeStyle="#cfe0ff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,sw*104,(f.ang||0)-0.65,(f.ang||0)+0.65); ctx.stroke(); ctx.globalAlpha=1; }
    else if(f.kind==="poof"){ ctx.globalAlpha=k*0.7; ctx.fillStyle="#3a3a3a"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*16,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="dust"){ ctx.globalAlpha=k*0.45; ctx.fillStyle="#8d8576"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*6+1.5,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="swing"){ const a0=(f.ang||0)-0.9+sw*1.3;
      if(f.fx==="thorns"){ ctx.globalAlpha=k; ctx.fillStyle="#8fd47a"; for(let i=0;i<11;i++){ const aa=(f.ang||0)+(i-5)*0.17, r=12+sw*42; ctx.fillRect(f.x+Math.cos(aa)*r-2,f.y+Math.sin(aa)*r-2,4,4);} ctx.globalAlpha=k*0.55; ctx.strokeStyle="#4f8f3a"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,20+sw*26,(f.ang||0)-0.62,(f.ang||0)+0.62); ctx.stroke(); ctx.globalAlpha=1; }
      else { ctx.lineCap="round"; ctx.globalAlpha=k*0.5; ctx.strokeStyle="#bcd2ee"; ctx.lineWidth=13; ctx.beginPath(); ctx.arc(f.x,f.y,22+sw*16,a0,a0+1.25); ctx.stroke(); ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,22+sw*16,a0,a0+1.25); ctx.stroke(); ctx.globalAlpha=1; ctx.lineCap="butt"; } }
    else if(f.kind==="holynova"){ const R=f.r||80, r2=sw*R;
      ctx.globalAlpha=k; ctx.strokeStyle="#ffe39a"; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.8; ctx.strokeStyle="#fff6d8"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.45; ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(f.x,f.y,k*22,0,6.28); ctx.fill();
      ctx.globalAlpha=k*0.7; ctx.strokeStyle="#ffe39a"; ctx.lineWidth=3; for(let i=0;i<8;i++){ const a=i/8*6.28; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r2*0.55,f.y+Math.sin(a)*r2*0.55); ctx.lineTo(f.x+Math.cos(a)*r2,f.y+Math.sin(a)*r2); ctx.stroke(); } ctx.globalAlpha=1; }
    else if(f.kind==="orbburst"){ const r=sw*42; ctx.globalAlpha=k*0.8; ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(f.x,f.y,r,0,6.28); ctx.fill(); ctx.globalAlpha=k; ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*18,0,6.28); ctx.fill(); ctx.fillStyle="#bcff8a"; for(let i=0;i<8;i++){ const a=i/8*6.28+f.t*4; const r3=sw*46; ctx.fillRect(f.x+Math.cos(a)*r3-2,f.y+Math.sin(a)*r3-2,4,4);} ctx.globalAlpha=1; }
    else if(f.kind==="impact"){ ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,sw*22,0,6.28); ctx.stroke(); ctx.fillStyle="#ffffff"; for(let i=0;i<6;i++){ const a=(f.ang||0)+i/6*6.28; const r=sw*20; ctx.fillRect(f.x+Math.cos(a)*r-1.5,f.y+Math.sin(a)*r-1.5,3,3);} ctx.globalAlpha=1; }
    // CAS-210: windup charge tell — orange→red ring that pulses outward while enemy winds up.
    // Multiple overlapping pulses give a "charging" read so the player knows to dodge.
    else if(f.kind==="windupring"){ const R=f.r||16, ease=sw*sw*(3-2*sw);
      ctx.globalAlpha=k*0.75; ctx.strokeStyle=k>0.5?"#ff6600":"#ff2222"; ctx.lineWidth=2+k*2;
      ctx.beginPath(); ctx.arc(f.x,f.y,R*(1+ease*0.6),0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.35; ctx.strokeStyle="#ffddaa"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(f.x,f.y,R*(1+ease*0.9),0,6.28); ctx.stroke(); ctx.globalAlpha=1; }
    else if(f.kind==="strikeflash"){ ctx.globalAlpha=k*0.9; ctx.strokeStyle="#fff2c8"; ctx.lineWidth=4;
      if(f.range){ ctx.beginPath(); ctx.arc(f.x,f.y,(f.range)*(0.6+sw*0.5),(f.ang||0)-0.7,(f.ang||0)+0.7); ctx.stroke(); }
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*10+2,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    else if(f.kind==="dodgering"){ ctx.globalAlpha=k*0.8; ctx.strokeStyle="#bfeaff"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,10+sw*30,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(f.x,f.y,10+sw*30,0,6.28); ctx.stroke(); ctx.globalAlpha=1; }
    // ---- generic, colour-parameterised spell FX (data-driven; one effect serves many spells) ----
    else if(f.kind==="novacast"){ const R=f.r||90, r2=sw*R, col=f.col||"#ffffff";
      ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.8; ctx.strokeStyle="#ffffff"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      const spokes=f.style==="spike"?12:8; ctx.globalAlpha=k*0.7; ctx.fillStyle=col; ctx.strokeStyle=col;
      for(let i=0;i<spokes;i++){ const a=i/spokes*6.28;
        if(f.style==="spike"){ const r3=r2*0.92; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r3,f.y+Math.sin(a)*r3); ctx.lineTo(f.x+Math.cos(a)*(r2+8),f.y+Math.sin(a)*(r2+8)); ctx.lineWidth=3; ctx.stroke(); }
        else if(f.style==="crystal"){ ctx.fillRect(f.x+Math.cos(a)*r2-3,f.y+Math.sin(a)*r2-3,6,6); }
        else { ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(f.x+Math.cos(a)*r2*0.5,f.y+Math.sin(a)*r2*0.5); ctx.lineTo(f.x+Math.cos(a)*r2,f.y+Math.sin(a)*r2); ctx.stroke(); } }
      ctx.globalAlpha=1; }
    else if(f.kind==="conecast"){ const R=f.range||70, col=f.col||"#ffffff", a=f.ang||0;
      ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(f.x,f.y,R*(0.5+sw*0.5),a-0.7,a+0.7); ctx.stroke();
      ctx.globalAlpha=k*0.6; ctx.fillStyle=col; for(let i=0;i<7;i++){ const aa=a+(i-3)*0.2, r=R*sw; ctx.fillRect(f.x+Math.cos(aa)*r-2,f.y+Math.sin(aa)*r-2,4,4);} ctx.globalAlpha=1; }
    else if(f.kind==="buffaura"){ const col=f.col||"#ffd24d"; ctx.globalAlpha=k*0.85; ctx.strokeStyle=col; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y+6,14+sw*22,0,6.28); ctx.stroke();
      ctx.globalAlpha=k; ctx.fillStyle=col; for(let i=0;i<7;i++){ const a=i/7*6.28 - f.t*3; const r=12+sw*18; ctx.fillRect(f.x+Math.cos(a)*r-1.5, f.y+6+Math.sin(a)*r-1.5 - sw*14, 3,3);} ctx.globalAlpha=1; }
    else if(f.kind==="healburst"){ const col=f.col||COL.heal; ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(f.x,f.y+4,sw*30,0,6.28); ctx.stroke();
      const yy=f.y+4-sw*22; ctx.fillStyle=col; ctx.fillRect(f.x-3,yy-7,6,16); ctx.fillRect(f.x-7,yy-3,16,6); ctx.globalAlpha=1; }
    else if(f.kind==="charge"){ const col=f.col||"#e8d28a", a=f.ang||0; ctx.globalAlpha=k*0.8; ctx.strokeStyle=col; ctx.lineWidth=5; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(f.x,f.y); ctx.lineTo(f.x-Math.cos(a)*sw*42, f.y-Math.sin(a)*sw*42); ctx.stroke(); ctx.lineCap="butt";
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; ctx.fillRect(f.x+Math.cos(a)*6-2,f.y+Math.sin(a)*6-2,4,4); ctx.globalAlpha=1; }
    else if(f.kind==="spellburst"){ const col=f.col||"#ffffff"; ctx.globalAlpha=k; ctx.strokeStyle=col; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(f.x,f.y,sw*26,0,6.28); ctx.stroke();
      ctx.fillStyle=col; for(let i=0;i<8;i++){ const a=i/8*6.28; const r=sw*22; ctx.fillRect(f.x+Math.cos(a)*r-1.5,f.y+Math.sin(a)*r-1.5,3,3);} ctx.globalAlpha=k*0.6; ctx.fillStyle="#ffffff"; ctx.beginPath(); ctx.arc(f.x,f.y,sw*9,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
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
    else if(f.kind==="hitburst"){ const ease=sw*sw*(3-2*sw); const r2=ease*26; // ease-out so it pops then settles
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=4-sw*2.5; ctx.beginPath(); ctx.arc(f.x,f.y,r2,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*k; ctx.fillStyle="#fff3e0"; ctx.beginPath(); ctx.arc(f.x,f.y,(1-sw)*10,0,6.28); ctx.fill();
      ctx.globalAlpha=k; ctx.fillStyle="#ffffff"; const cl=(1-sw)*16+4; const a0=f.ang||0; // a 4-point star kicked toward the hit angle
      for(let i=0;i<4;i++){ const a=a0+i*1.5708; ctx.fillRect(f.x+Math.cos(a)*cl-1.5,f.y+Math.sin(a)*cl-1.5,3,3); } ctx.globalAlpha=1; }
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
    else if(f.kind==="shockring"){ const R=f.r||44, ease=sw*sw*(3-2*sw);
      ctx.globalAlpha=k; ctx.strokeStyle="#fff2c8"; ctx.lineWidth=5-sw*4; ctx.beginPath(); ctx.arc(f.x,f.y,ease*R,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.7; ctx.strokeStyle="#ffffff"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(f.x,f.y,ease*R*1.35,0,6.28); ctx.stroke();
      ctx.globalAlpha=k*0.5; ctx.fillStyle="#b3242a"; for(let i=0;i<10;i++){ const a=i/10*6.28+f.t*3; const r=ease*R*1.1; ctx.fillRect(f.x+Math.cos(a)*r-2,f.y+Math.sin(a)*r-2,4,4);} ctx.globalAlpha=1; }
    // slashArc — a bold directional crescent that sweeps through the hit on a melee connect:
    // a wide crimson body trailing a white leading edge, swung along the attack angle.
    else if(f.kind==="slashArc"){ const a0=(f.ang||0)-1.0+sw*1.5, R=18+(1-sw)*20; ctx.lineCap="round";
      ctx.globalAlpha=k*0.55; ctx.strokeStyle=f.crit?"#ffd24d":"#b3242a"; ctx.lineWidth=11; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0,a0+1.15); ctx.stroke();
      ctx.globalAlpha=k; ctx.strokeStyle="#ffffff"; ctx.lineWidth=3.5; ctx.beginPath(); ctx.arc(f.x,f.y,R,a0+0.15,a0+1.15); ctx.stroke(); ctx.lineCap="butt"; ctx.globalAlpha=1; }
  }
  function drawAtkFx(cls,x,y,ang,p){ const a=Math.sin(Math.min(1,p)*Math.PI); if(a<=0.04) return;
    const dx=Math.cos(ang),dy=Math.sin(ang); ctx.save(); ctx.globalAlpha=a;
    if(cls==="warrior"){ const r=13+p*9, a0=ang-0.95+p*1.1; ctx.strokeStyle="#eef3fa"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(x,y,r,a0,a0+1.0); ctx.stroke(); }
    else if(cls==="paladin"){ const len=8+p*24; ctx.strokeStyle="#ffe7a8"; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx*len,y+dy*len); ctx.stroke(); ctx.fillStyle="#fff"; ctx.fillRect(x+dx*len-1.5,y+dy*len-1.5,3,3); }
    else if(cls==="mage"){ ctx.fillStyle="#9bef5a"; ctx.beginPath(); ctx.arc(x,y,5+p*9,0,6.28); ctx.fill(); ctx.globalAlpha=a*0.5; ctx.fillStyle="#eafff0"; ctx.beginPath(); ctx.arc(x,y,2+p*4,0,6.28); ctx.fill(); }
    else if(cls==="druid"){ ctx.fillStyle="#8fd47a"; for(let i=0;i<6;i++){ const aa=ang+(i-2.5)*0.32, r=6+p*15; ctx.fillRect(x+Math.cos(aa)*r-1.5,y+Math.sin(aa)*r-1.5,3,3);} }
    else if(cls==="priest"){ ctx.strokeStyle="#ffe39a"; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,4+p*13,0,6.28); ctx.stroke(); ctx.globalAlpha=a*0.6; ctx.fillStyle="#fff6d8"; ctx.beginPath(); ctx.arc(x,y,2+p*3,0,6.28); ctx.fill(); }
    ctx.restore();
  }

  // ------------------------------- HUD -----------------------------------
  function bar(x,y,w,hh,frac,fg,bg,label){ ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,w+4,hh+4); ctx.fillStyle=bg; ctx.fillRect(x,y,w,hh);
    ctx.fillStyle=fg; ctx.fillRect(x,y,w*clamp(frac,0,1),hh); if(label){ ctx.fillStyle=COL.cream; ctx.font="bold 11px 'Courier New'"; ctx.textAlign="left"; ctx.fillText(label,x+4,y+hh-2);} }
  function renderHUD(){ const h=G.hero; ctx.textAlign="left";
    const pad=12, bw=Math.min(220,VW*0.42);
    // CAS-118: while the hero suffers a status, frame the screen with a pulsing edge
    // tint in that status's colour + a compact chip row (icon + label + seconds left),
    // so "el jugador también los sufre" reads instantly without crowding the HUD.
    { const chips=[];
      if(h.dots) for(const k in h.dots){ const s=STATUS[k]; if(s) chips.push({col:s.col,label:s.label,t:h.dots[k].t}); }
      if(h.slowT>0){ const s=STATUS.slow; chips.push({col:s.col,label:s.label,t:h.slowT}); }
      if(h.stun>0){ const s=STATUS.stun; chips.push({col:s.col,label:s.label,t:h.stun}); }
      if(chips.length){
        const pulse=0.5+0.5*Math.abs(Math.sin(G.t*6));
        ctx.save(); ctx.globalAlpha=0.22+0.20*pulse; ctx.strokeStyle=chips[0].col; ctx.lineWidth=6;
        ctx.strokeRect(3,3,VW-6,VH-6); ctx.restore();
        let cy=pad+ (G.skull.level>0?120:116);
        ctx.font="bold 12px 'Courier New'"; ctx.textAlign="left";
        for(const c of chips){ ctx.fillStyle=COL.out; ctx.fillRect(pad-1,cy-1,9,9); ctx.fillStyle=c.col; ctx.fillRect(pad,cy,7,7);
          ctx.fillStyle=c.col; ctx.fillText(c.label+" "+c.t.toFixed(1)+"s", pad+13, cy+8); cy+=15; }
      }
    }
    const mhp=heroMaxHp(h); // CAS-117: bar reflects the +vida affix pool
    bar(pad,pad,bw,16,h.hp/mhp,COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+mhp);
    bar(pad,pad+22,bw,12,h.mp/h.maxMp,COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    bar(pad,pad+38,bw,10,h.xp/h.xpNext,COL.xpf,COL.xpb, STR.level(h.lvl));
    // CAS-119: unspent talent-point badge beside the XP bar — pulses gold to prompt the
    // player to open the tree (T). Disappears once all points are spent.
    if((h.talentPts|0)>0){ const pl=0.55+0.45*Math.abs(Math.sin(G.t*4));
      ctx.save(); ctx.globalAlpha=pl; ctx.fillStyle=COL.textGold; ctx.font="bold 13px 'Courier New'"; ctx.textAlign="left";
      ctx.fillText("★"+h.talentPts+" (T)", pad+bw+8, pad+47); ctx.restore(); ctx.textAlign="left"; }
    // CAS-149: Elite-Mastery badge — the persistent, cross-session progression read-out,
    // kept always-visible (even rank 0, with kills-to-next) so the long-term hook that grows
    // across sessions is legible from minute one. Sits right of the HP bar (clear of the XP★).
    { const mr=sim.masteryRank(h.eliteKills|0); const nx=sim.masteryNextAt(mr);
      ctx.save(); ctx.fillStyle=COL.textGold; ctx.font="bold 12px 'Courier New'"; ctx.textAlign="left";
      const prog = nx!=null ? (" "+(h.eliteKills|0)+"/"+nx) : " MÁX";
      // CAS-150: "(V)" hint opens the reward-track panel — only while a milestone is still
      // pending (an unmet goal to chase), so a fully-unlocked track stays clean.
      const hint = sim.masteryNextMilestone(h.eliteKills|0) ? " (V)" : "";
      ctx.fillText(STR.masteryHud(mr)+prog+hint, pad+bw+8, pad+14); ctx.restore(); ctx.textAlign="left"; }
    // gold + potions
    ctx.font="bold 13px 'Courier New'"; ctx.fillStyle=COL.gold; ctx.fillText(STR.gold(h.gold),pad,pad+66);
    ctx.fillStyle=COL.cream; ctx.fillText("♥"+h.potHP+"  ◆"+h.potMP+"  ✦"+h.blessings, pad,pad+84);
    renderConsumableSlot(h); // CAS-192: selected combat consumable + cooldown + active-buff timer
    // skull indicator
    if(G.skull.level>0){ const sc=[null,COL.skullW,COL.skullY,COL.skullR][G.skull.level]; ctx.fillStyle=sc; ctx.font="bold 16px 'Courier New'"; ctx.fillText("☠ "+h.name, pad, pad+104); }
    else { ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(h.name, pad, pad+102); }
    // quest tracker (top-right under buttons)
    ctx.textAlign="right"; ctx.font="bold 12px 'Courier New'";
    const qx=VW-12, qy=isTouch?64:18;
    ctx.fillStyle=COL.out; const qt=G.quest.done?STR.questDone:STR.questLabel(G.quest.wolves);
    const qw=ctx.measureText(qt).width+12; ctx.fillRect(qx-qw,qy-2,qw,20); ctx.fillStyle=G.quest.done?COL.heal:COL.textGold; ctx.fillText(qt,qx-6,qy+13);
    // hunt-contract tracker (under the quest tracker) — only shows inside a hunt zone
    const hz=zoneOf(world,h.x,h.y); const HC=HUNTS[hz]; const HS=G.hunts&&G.hunts[hz];
    if(HC && HS){ let ht, hc; if(HS.cleared){ ht=STR.huntZoneCleared; hc=COL.heal; }
      else if(HS.champ){ ht=STR.huntChampApproaches; hc=COL.skullR; }
      else { ht=STR.huntLabel(HS.kills,HC.need); hc=COL.textGold; }
      const hy=qy+22; ctx.fillStyle=COL.out; const hw=ctx.measureText(ht).width+12;
      ctx.fillRect(qx-hw,hy-2,hw,20); ctx.fillStyle=hc; ctx.fillText(ht,qx-6,hy+13); }
    // zone name
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'";
    const zn={town:STR.zoneTown,forest:STR.zoneForest,caves:STR.zoneCaves,arena:STR.zoneArena,ruins:STR.zoneRuins,abyss:STR.zoneAbyss,frost:STR.zoneFrost,trial:STR.zoneTrial,field:STR.zoneField}[zoneOf(world,h.x,h.y)];
    ctx.fillText(zn, VW/2, 20);
    // CAS-123: Stage-1 OBJECTIVE tracker — the single legible win-goal, top-centre and
    // ALWAYS visible so a new player reads where the run is headed from minute one. The
    // text + colour switch as the gate opens (locked → ready) and once the run is won.
    drawObjective(h);
    // spell bar
    renderSpellBar();
    // minimap
    if(!isTouch || true) renderMiniMap();
  }
  // CAS-123: the persistent Stage-1 objective banner (top-centre, under the zone name).
  function drawObjective(h){
    let txt, col;
    if(h.stage1){ txt=STR.objDone; col=COL.heal; }
    else { const pw=sim.heroPower(h), req=(STAGE1_GOAL&&STAGE1_GOAL.req)||FROST_POWER_REQ;
      if(pw>=req){ txt=STR.objReady; col="#7fd6ff"; }                 // gate open → go fight the boss
      else { txt=STR.objLocked(pw, req); col=COL.textGold; } }        // still building power
    const label=STR.objLabel+": "+txt;
    ctx.textAlign="center"; ctx.font="bold 11px 'Courier New'";
    const w=ctx.measureText(label).width+16, x=VW/2, y=30;
    ctx.fillStyle="rgba(8,10,14,0.72)"; ctx.fillRect(x-w/2,y-1,w,18);
    ctx.fillStyle=col; ctx.fillRect(x-w/2,y-1,3,18);                  // accent tick
    ctx.fillStyle=col; ctx.fillText(label, x, y+12);
    ctx.textAlign="left";
  }
  // CAS-192: the combat-consumable slot — bottom-left HUD widget. Shows the SELECTED
  // consumable (icon + short name), its remaining count, a top-down cooldown wipe while
  // h.consumCD is live, and the [Q] use / [R] cycle key hints. An active timed buff
  // (furia) reads its remaining seconds as a shrinking bar above the slot, so the player
  // always knows the buff is up and roughly how long is left (duration telegraph).
  function renderConsumableSlot(h){ if(isTouch) return; const s=44; const x=12, y=VH-12-s;
    const c=CONSUMABLES[h.consumSel|0]||CONSUMABLES[0]; const qty=(h.consum&&h.consum[c.id])|0;
    // active fury buff timer (shrinking bar) above the slot
    if(h.atkspdBuffT>0){ const f=clamp(h.atkspdBuffT/6,0,1);
      ctx.fillStyle=COL.out; ctx.fillRect(x-1,y-12,s+2,8);
      ctx.fillStyle="#ff7a3a"; ctx.fillRect(x,y-11,s*f,6);
      ctx.fillStyle=COL.cream; ctx.font="bold 9px 'Courier New'"; ctx.textAlign="left";
      ctx.fillText("⚔ "+h.atkspdBuffT.toFixed(1)+"s", x+s+6, y-5); }
    // slot frame + body
    ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
    ctx.fillStyle=qty>0?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
    // icon + short name (dimmed when empty)
    ctx.globalAlpha=qty>0?1:0.4; ctx.textAlign="center";
    ctx.fillStyle=c.col; ctx.font="bold 20px 'Courier New'"; ctx.fillText(c.icon,x+s/2,y+24);
    ctx.fillStyle=COL.cream; ctx.font="8px 'Courier New'"; ctx.fillText(c.short,x+s/2,y+s-5);
    ctx.globalAlpha=1;
    // cooldown wipe (top-down) — per-consumable cd; the row's cd is the true denominator
    const cd=(h.consumCD&&h.consumCD[c.id])||0;
    if(cd>0){ const f=clamp(cd/(c.cd||1),0,1);
      ctx.fillStyle="rgba(8,10,14,0.66)"; ctx.fillRect(x,y,s,s*f);
      ctx.fillStyle=COL.cream; ctx.font="bold 12px 'Courier New'"; ctx.textAlign="center";
      ctx.fillText(Math.ceil(cd),x+s/2,y+s/2+5); }
    // count badge (top-right)
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(x+s-5,y+5,8,0,6.28); ctx.fill();
    ctx.fillStyle=qty>0?COL.textGold:"#7a7f88"; ctx.font="bold 11px 'Courier New'"; ctx.textAlign="center";
    ctx.fillText(qty,x+s-5,y+9);
    // key hints
    ctx.fillStyle=COL.out; ctx.fillRect(x-2,y+s+4,s+4,14);
    ctx.fillStyle=COL.cream; ctx.font="9px 'Courier New'"; ctx.textAlign="center";
    ctx.fillText("[Q] usar  [R] ↻",x+s/2,y+s+14);
    ctx.textAlign="left";
  }
  function renderSpellBar(){ const h=G.hero; const n=4; const s=Math.min(46,VW*0.1); const gap=6; const total=n*s+(n-1)*gap;
    const x0=VW/2-total/2; const y=VH-(isTouch?0:14)-s; if(isTouch) return; // touch uses buttons
    // costs / colours / labels are data-driven from SPELLS[cls] (slot 0 = basic attack)
    const sp=SPELLS[h.cls]||SPELLS.warrior; const names=(STR.spellNames&&STR.spellNames[h.cls])||["","",""];
    const costs=[0,sp[0].cost,sp[1].cost,sp[2].cost];
    for(let i=0;i<n;i++){ const x=x0+i*(s+gap);
      ctx.fillStyle=COL.out; ctx.fillRect(x-2,y-2,s+4,s+4);
      ctx.fillStyle=h.mp>=costs[i]?"#2a3142":"#1a1d24"; ctx.fillRect(x,y,s,s);
      ctx.fillStyle=(i===0)?"#cfd6de":(sp[i-1].col||"#cfd6de"); ctx.fillRect(x+6,y+6,s-12,s-12);
      // CAS-120: status pip — a small dot in the effect colour marks a skill that
      // applies a CAS-118 status (veneno/quemadura/lentitud/aturdir), so the player
      // reads at a glance which skills deploy control/ignite.
      if(i>0){ const st=sp[i-1].status; if(st && STATUS[st.type]){ const pc=STATUS[st.type].col;
        ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(x+s-8,y+8,4.5,0,6.28); ctx.fill();
        ctx.fillStyle=pc; ctx.beginPath(); ctx.arc(x+s-8,y+8,3,0,6.28); ctx.fill(); } }
      // cooldown sweep (top-down dark wipe) for slots 1-3
      if(i>0 && h.spellCD && h.spellCD[i]>0 && h.spellCDmax[i]>0){ const f=clamp(h.spellCD[i]/h.spellCDmax[i],0,1);
        ctx.fillStyle="rgba(8,10,14,0.66)"; ctx.fillRect(x,y,s,s*f); }
      ctx.fillStyle=COL.out; ctx.font="bold 12px 'Courier New'"; ctx.textAlign="left"; ctx.fillText((i+1),x+3,y+13);
      const label=(i===0) ? ((STR.spellSlot0&&STR.spellSlot0[h.cls])||STR.spells[0]) : names[i-1];
      ctx.fillStyle=COL.cream; ctx.font="8px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(label,x+s/2,y+s-4);
      if(costs[i]>0){ ctx.fillStyle="#8ab8ff"; ctx.font="8px 'Courier New'"; ctx.fillText(costs[i]+"mp",x+s/2,y+s+9);} }
  }
  function renderMiniMap(){ const mw=120, mh=120; const x=VW-mw-12, y=VH-mh-12; if(isTouch) return;
    ctx.fillStyle="rgba(12,14,19,0.8)"; ctx.fillRect(x-2,y-2,mw+4,mh+4); ctx.strokeStyle=COL.panelB; ctx.lineWidth=2; ctx.strokeRect(x-2,y-2,mw+4,mh+4);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass],[world.caves,COL.stone],[world.arena,COL.sand],[world.town,COL.cobble],[world.ruins,COL.grass],[world.abyss,"#3a2350"],[world.frost,"#9fc2d6"],[world.trial,"#c8a24a"]];
    for(const [r,c] of zr){ if(!r) continue; ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy); }
    // CAS-114 — portal blips on the minimap (violet)
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ ctx.fillRect(x+p.x*sx-1,y+p.y*sy-1,3,3); } }
    ctx.fillStyle="#ff5a4a"; for(const e of G.enemies){ ctx.fillRect(x+e.x*sx-1,y+e.y*sy-1,2,2); }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-2,y+G.hero.y*sy-2,4,4);
  }
  function renderBigMap(){ const mw=Math.min(VW*0.7,420), mh=mw; const x=(VW-mw)/2, y=(VH-mh)/2;
    panel(x-10,y-30,mw+20,mh+40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("VALDORIA",VW/2,y-8);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass,STR.zoneForest],[world.caves,COL.stone,STR.zoneCaves],[world.arena,COL.sand,STR.zoneArena],[world.town,COL.cobble,STR.zoneTown],[world.ruins,COL.grass,STR.zoneRuins],[world.abyss,"#3a2350",STR.zoneAbyss],[world.frost,"#9fc2d6",STR.zoneFrost],[world.trial,"#c8a24a",STR.zoneTrial]];
    for(const [r,c,nm] of zr){ if(!r) continue; ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy);
      ctx.fillStyle=COL.cream; ctx.font="9px 'Courier New'"; ctx.fillText(nm,x+(r.x+r.w/2)*TS*sx,y+(r.y+r.h/2)*TS*sy); }
    // CAS-114 — portal markers on the world map (violet diamonds)
    if(world.portals){ ctx.fillStyle="#b07cff"; for(const p of world.portals){ ctx.fillRect(x+p.x*sx-2,y+p.y*sy-2,4,4); } }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-3,y+G.hero.y*sy-3,6,6);
    ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText("M / tap: cerrar",VW/2,y+mh+18);
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
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 15px 'Courier New'"; ctx.fillText(d.npc.name, x+70, y+28);
    ctx.fillStyle=COL.cream; ctx.font="14px 'Courier New'"; wrapText(d.lines[d.i],x+70,y+52,bw-90,18);
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.textAlign="right"; ctx.fillText("E / tap ▸ "+STR.dialogContinue, x+bw-14, y+bh-12);
  }
  function wrapText(txt,x,y,maxW,lh){ const words=txt.split(" "); let line="",yy=y; for(const w of words){ const t=line+w+" "; if(ctx.measureText(t).width>maxW){ ctx.fillText(line,x,yy); line=w+" "; yy+=lh;} else line=t; } ctx.fillText(line,x,yy); }

  // Compare arrow vs the piece currently equipped in this item's slot. Now factors
  // affixes in: a same-base-stat piece with stronger affixes still reads as an
  // upgrade. CAS-117 — score = resolved stat + a light affix weight.
  function affixScore(inst){ let s=0; for(const af of affixList(inst)) s+=af.amt; return s; }
  function cmpArrow(inst){ const eq=G.hero.equip[inst.slot]; const v=gearStat(inst)+affixScore(inst)*0.6, e=gearStat(eq)+affixScore(eq)*0.6;
    return v>e+0.5?{s:"▲",c:COL.heal}:(v<e-0.5?{s:"▼",c:"#d05555"}:{s:"=",c:COL.textDim}); }
  // One affix line, e.g. "+8% vel. ataque" in a soft cyan. CAS-117.
  function drawAffixLines(inst,ax,ay,lh){ const list=affixList(inst); ctx.font="10px 'Courier New'"; ctx.textAlign="left";
    for(let k=0;k<list.length;k++){ ctx.fillStyle="#9be7ff"; ctx.fillText("• "+affixLabel(list[k]), ax, ay+k*lh); } return list.length; }
  // A signed coloured delta token ("+12", "-3", "—"). CAS-117 equip-decision diff.
  function deltaTok(d){ if(!d) return {t:"—",c:COL.textDim}; return d>0?{t:"+"+d,c:COL.heal}:{t:""+d,c:"#d05555"}; }
  function renderInventory(){ const bw=Math.min(VW*0.9,560), bh=Math.min(VH*0.85,470), x=(VW-bw)/2, y=(VH-bh)/2; const h=G.hero;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.invTitle,VW/2,y+28);
    const colX=x+28;
    // ---- left: equipment doll + equipped slots (with affixes) + totals ----
    blit(ctx,SP.hero.rows,SP.hero.pal,colX+8,y+58,5,false);
    ctx.textAlign="left"; ctx.font="12px 'Courier New'";
    const slots=[[STR.slotWeapon,"weapon"],[STR.slotBody,"body"],[STR.slotShield,"shield"]];
    let ry=y+62; for(const [label,slot] of slots){ const inst=h.equip[slot];
      ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(label, colX+96, ry);
      ctx.fillStyle=gearCol(inst); ctx.fillText(gearName(inst), colX+96, ry+14);
      ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText((slot==="weapon"?STR.statsDmg:STR.statsDef)+" "+gearStat(inst), colX+96, ry+26);
      const n=drawAffixLines(inst, colX+96, ry+38, 11); ry+=40+n*11; }
    const af=affixTotals(h);
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px 'Courier New'";
    ctx.fillText(STR.statsDmg+": "+equippedDmg(h)+"   "+STR.statsDef+": "+equippedDef(h), colX+8, ry+8);
    ctx.fillStyle=COL.cream; ctx.font="11px 'Courier New'";
    ctx.fillText("♥ "+heroMaxHp(h)+(af.atkspd?"  ⚔+"+af.atkspd+"%":"")+(af.movespd?"  »+"+af.movespd+"%":"")+(af.onhit?"  ✦+"+af.onhit:""), colX+8, ry+26);
    ctx.fillStyle=COL.cream; ctx.fillText("♥ x"+h.potHP+"   ◆ x"+h.potMP+"   ✦ x"+h.blessings, colX+8, y+bh-20);
    // ---- right: backpack list with compare arrows ----
    const rx=x+bw*0.50, rw=bw*0.46;
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.textAlign="left"; ctx.fillText(STR.backpack, rx, y+54);
    ui.invRects=[];
    const bag=h.bag; if(G.invSel==null) G.invSel=0; G.invSel=Math.max(0,Math.min(G.invSel, Math.max(0,bag.length-1)));
    const cmpH=92; const rowH=28, listY=y+62, maxRows=Math.max(1,Math.floor((bh-120-cmpH)/rowH));
    if(!bag.length){ ctx.fillStyle=COL.textDim; ctx.fillText(STR.bagEmpty, rx, listY+18); }
    for(let i=0;i<bag.length && i<maxRows;i++){ const inst=bag[i]; const ay=listY+i*rowH; const sel=i===G.invSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(rx,ay,rw,rowH-4);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=1.5; ctx.strokeRect(rx,ay,rw,rowH-4); }
      ctx.textAlign="left"; ctx.fillStyle=gearCol(inst); ctx.font="12px 'Courier New'";
      ctx.fillText(gearName(inst)+" ("+gearStat(inst)+")", rx+8, ay+16);
      const na=affixList(inst).length; if(na){ ctx.fillStyle="#9be7ff"; ctx.font="10px 'Courier New'"; ctx.fillText("◈".repeat(na), rx+8, ay+rowH-7); }
      const ar=cmpArrow(inst); ctx.textAlign="right"; ctx.fillStyle=ar.c; ctx.font="bold 13px 'Courier New'"; ctx.fillText(ar.s, rx+rw-8, ay+16);
      ui.invRects.push({x:rx,y:ay,w:rw,h:rowH-4, idx:i});
    }
    // ---- compare box: equipped vs selected (the equip DECISION). CAS-117 ----
    const cy=listY+Math.min(bag.length,maxRows)*rowH+6; const sel=bag[G.invSel];
    if(sel){ ctx.fillStyle="#161b22"; ctx.fillRect(rx,cy,rw,cmpH); ctx.strokeStyle="#3a4456"; ctx.lineWidth=1; ctx.strokeRect(rx,cy,rw,cmpH);
      const eq=h.equip[sel.slot];
      ctx.textAlign="left"; ctx.font="10px 'Courier New'"; ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpEquipped, rx+6, cy+13);
      ctx.fillStyle=gearCol(eq); ctx.fillText(gearName(eq)+" ("+gearStat(eq)+")", rx+6, cy+25);
      drawAffixLines(eq, rx+10, cy+36, 10);
      const midX=rx+rw*0.52;
      ctx.fillStyle=COL.textDim; ctx.fillText(STR.cmpNew, midX, cy+13);
      ctx.fillStyle=gearCol(sel); ctx.fillText("("+gearStat(sel)+")", midX, cy+25);
      drawAffixLines(sel, midX+4, cy+36, 10);
      // net combat deltas if equipped (the tradeoff at a glance)
      const before={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const old=h.equip[sel.slot]; h.equip[sel.slot]=sel;
      const after={dmg:equippedDmg(h),def:equippedDef(h),hp:heroMaxHp(h)}; const a2=affixTotals(h); h.equip[sel.slot]=old; const a1=affixTotals(h);
      const parts=[["Dmg",after.dmg-before.dmg],["Def",after.def-before.def],["HP",after.hp-before.hp],["AtkV%",a2.atkspd-a1.atkspd],["MovV%",a2.movespd-a1.movespd]];
      let dx=rx+6; ctx.font="bold 10px 'Courier New'"; const dyb=cy+cmpH-8;
      for(const [lbl,dv] of parts){ const tk=deltaTok(dv); const seg=lbl+" "; ctx.fillStyle=COL.textDim; ctx.fillText(seg,dx,dyb); dx+=ctx.measureText(seg).width;
        ctx.fillStyle=tk.c; ctx.fillText(tk.t+"  ",dx,dyb); dx+=ctx.measureText(tk.t+"  ").width; }
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.equipHint,VW/2,y+bh-6);
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
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'";
    ctx.fillText(STR.talentTitle+" — "+(STR.classes[h.cls]?STR.classes[h.cls].name:h.cls), VW/2, y+26);
    ctx.fillStyle=(h.talentPts>0)?COL.heal:COL.textDim; ctx.font="bold 13px 'Courier New'";
    ctx.fillText(STR.talentPoints(h.talentPts|0)+(h.talentPts>0?"":"  ("+STR.talentNoPts+")"), VW/2, y+46);
    ui.talentRects=[];
    const nodes=tree.nodes; const nb=tree.branches.length;
    const colW=(bw-48)/nb, top=y+70, rowH=78, nh=54;
    const focusId=(function(){ const ns=talentNodes(h.cls); const i=G.talFocus||0; return ns[i]?ns[i].id:null; })();
    // branch headers
    for(let b=0;b<nb;b++){ const cx=x+24+colW*b+colW/2;
      ctx.fillStyle=COL.cream; ctx.font="bold 13px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(tree.branches[b], cx, top-8); }
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
      if(n.excl){ ctx.fillStyle="#c77dff"; ctx.font="9px 'Courier New'"; ctx.textAlign="left"; ctx.fillText("◆", bx+4, by+12); }
      ctx.textAlign="center"; ctx.fillStyle=(st==="lock")?COL.textDim:COL.cream; ctx.font=(nw<130?"bold 9px 'Courier New'":"bold 11px 'Courier New'");
      ctx.fillText(n.name, p.cx, by+22);
      ctx.fillStyle=(st==="max")?COL.heal:(st==="avail"?COL.textGold:COL.textDim); ctx.font="11px 'Courier New'";
      ctx.fillText(STR.talentRank(rank,n.max), p.cx, by+40);
      ui.talentRects.push({x:bx,y:by,w:nw,h:nh, id:n.id, focus:i});
      if(ui.mouseX>=bx&&ui.mouseX<=bx+nw&&ui.mouseY>=by&&ui.mouseY<=by+nh) hover=n;
    }
    // description box (hovered, else keyboard-focused node)
    const dn = hover || talentNode(h.cls, focusId);
    const dy=y+bh-92, dbx=x+24, dbw=bw-48, dbh=52;
    panelLocal(dbx,dy,dbw,dbh);
    if(dn){ const st=nodeState(h,dn); ctx.textAlign="left";
      ctx.fillStyle=COL.textGold; ctx.font="bold 12px 'Courier New'"; ctx.fillText(dn.name+"  ["+STR.talentRank(nodeRank(h,dn.id),dn.max)+"]", dbx+10, dy+18);
      ctx.fillStyle=COL.cream; ctx.font="11px 'Courier New'"; ctx.fillText(dn.desc, dbx+10, dy+34);
      const lr=lockReason(h,dn.id); let hint="";
      if(lr==="req") hint=STR.talentLocked; else if(lr==="excl") hint=STR.talentExcl; else if(lr==="pts") hint=STR.talentNoPts; else if(lr==="max") hint="MÁX";
      if(hint){ ctx.fillStyle="#d0a0a0"; ctx.font="10px 'Courier New'"; ctx.fillText(hint, dbx+10, dy+48); }
    }
    // respec button + hint
    const rbw=210, rbh=26, rbx=VW/2-rbw/2, rby=y+bh-32;
    const canR=talentSpent(h)>0;
    ctx.fillStyle=canR?"#3a2c1e":"#23262c"; ctx.fillRect(rbx,rby,rbw,rbh);
    ctx.textAlign="center"; ctx.fillStyle=canR?COL.cream:COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(STR.talentRespecBtn,VW/2,rby+17);
    ui.talentRects.push({x:rbx,y:rby,w:rbw,h:rbh, act:()=>sim.respecTalents()});
    ctx.fillStyle=COL.textDim; ctx.font="10px 'Courier New'"; ctx.fillText(STR.talentHint, VW/2, y+bh-6);
  }

  // CAS-150 — ELITE-MASTERY REWARD-TRACK panel. The cross-session hook made legible: a
  // vertical list of milestones (DESBLOQUEADO green / locked dim), a progress bar to the
  // next one, and the running elite-kill tally. Pure read-out (no spending) — opened with V
  // or the ✦ touch button. Mirrors the panel/panelLocal idiom of the talent/shop screens.
  function renderMastery(){ const h=G.hero; if(!h) return;
    const k=h.eliteKills|0; const track=sim.masteryTrack(k); const next=sim.masteryNextMilestone(k);
    const bw=Math.min(VW*0.92,560), bh=Math.min(VH*0.9,470), x=(VW-bw)/2, y=(VH-bh)/2;
    panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'";
    ctx.fillText(STR.masteryTitle, VW/2, y+28);
    ctx.fillStyle=COL.cream; ctx.font="12px 'Courier New'"; ctx.fillText(STR.masteryPanelHint(k), VW/2, y+48);
    // progress bar toward the next milestone (or "complete")
    const pbx=x+30, pbw=bw-60, pby=y+60, pbh=14;
    ctx.fillStyle="#23262c"; ctx.fillRect(pbx,pby,pbw,pbh);
    if(next){ const prev=(function(){ let p=0; for(const m of track){ if(m.unlocked) p=m.at; } return p; })();
      const span=Math.max(1,next.at-prev); const frac=Math.max(0,Math.min(1,(k-prev)/span));
      ctx.fillStyle=COL.xpf; ctx.fillRect(pbx,pby,pbw*frac,pbh);
      ctx.fillStyle=COL.textGold; ctx.font="10px 'Courier New'"; ctx.textAlign="center";
      ctx.fillText(STR.masteryNextHint(Math.max(0,next.at-k), next.name), VW/2, pby+pbh+14);
    } else { ctx.fillStyle=COL.heal; ctx.fillRect(pbx,pby,pbw,pbh);
      ctx.fillStyle=COL.heal; ctx.font="10px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(STR.masteryAllUnlocked, VW/2, pby+pbh+14); }
    // milestone rows
    const top=y+98, rowH=Math.min(78,(bh-130)/track.length);
    for(let i=0;i<track.length;i++){ const m=track[i]; const ry=top+i*rowH;
      const rx=x+24, rw=bw-48, rh=rowH-12;
      ctx.fillStyle=m.unlocked?"#1d3324":(m.isNext?"#33301a":"#181c22"); ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle=m.unlocked?COL.heal:(m.isNext?COL.textGold:"#3a4456"); ctx.lineWidth=m.isNext?2.5:1.5; ctx.strokeRect(rx,ry,rw,rh);
      // requirement badge (left)
      ctx.textAlign="left"; ctx.fillStyle=m.unlocked?COL.heal:COL.textDim; ctx.font="bold 11px 'Courier New'";
      ctx.fillText((m.unlocked?"✦ ":"")+m.at+" élites", rx+10, ry+18);
      // name + desc
      ctx.fillStyle=m.unlocked?COL.cream:(m.isNext?COL.textGold:COL.textDim); ctx.font="bold 13px 'Courier New'";
      ctx.fillText(m.name, rx+10, ry+38);
      ctx.fillStyle=m.unlocked?"#bfe6c4":COL.textDim; ctx.font="11px 'Courier New'";
      ctx.fillText(m.desc, rx+10, ry+rh-8);
      // status chip (right)
      ctx.textAlign="right"; ctx.fillStyle=m.unlocked?COL.heal:(m.isNext?COL.textGold:COL.textDim); ctx.font="bold 11px 'Courier New'";
      ctx.fillText(m.unlocked?"DESBLOQUEADO":(m.isNext?"PRÓXIMO":"BLOQUEADO"), rx+rw-10, ry+18);
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="10px 'Courier New'"; ctx.fillText("V / ESC para cerrar", VW/2, y+bh-8);
    ctx.textAlign="left";
  }

  function renderShop(){ const items=sim.shopItems(); const bw=Math.min(VW*0.86,460), bh=Math.min(VH*0.82,420), x=(VW-bw)/2, y=(VH-bh)/2;
    const title=G.merchantShop?STR.merchantTitle:G.healShop?STR.npcLina:STR.shopTitle;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(title,VW/2,y+30);
    ctx.fillStyle=COL.gold; ctx.font="bold 13px 'Courier New'"; ctx.fillText(STR.gold(G.hero.gold),VW/2,y+50);
    ui.shopRects=[]; const iy=y+72, ih=42;
    for(let i=0;i<items.length;i++){ const it=items[i]; const ry=iy+i*ih; const sel=i===G.shopSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-6);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-6); }
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(it.name,x+34,ry+24);
      ctx.textAlign="right"; ctx.fillStyle=COL.gold; ctx.fillText(it.price+" oro",x+bw-34,ry+24);
      ui.shopRects.push({x:x+20,y:ry,w:bw-40,h:ih-6,act:()=>{G.shopSel=i; sim.buyItem(i);}});
    }
    // close
    const cy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,cy,120,24); ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Cerrar (E)",VW/2,cy+17);
    ui.shopRects.push({x:x+bw/2-60,y:cy,w:120,h:24,act:()=>{G.scene="play";G.healShop=false;G.merchantShop=false;}});
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
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.bountyTitle,VW/2,y+28);
    if(!b){ ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("—",VW/2,y+60); return; }
    // reset countdown (top-right of the panel)
    ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.bountyResetIn(fmtCountdown(b.resetMs)), x+bw-16, y+24);
    // gold readout (top-left)
    ctx.textAlign="left"; ctx.fillStyle=COL.gold; ctx.font="bold 12px 'Courier New'"; ctx.fillText(STR.gold(G.hero.gold), x+16, y+24);

    // ----- streak banner -----
    const sy=y+40, sh=44;
    ctx.fillStyle="#241d12"; ctx.fillRect(x+16,sy,bw-32,sh);
    ctx.fillStyle=COL.panelB; ctx.fillRect(x+16,sy,bw-32,3);
    ctx.textAlign="left"; ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText(STR.bountyStreak(b.streak.n), x+28, sy+20);
    ctx.fillStyle=COL.cream; ctx.font="12px 'Courier New'"; ctx.fillText(STR.bountyStreakReward(b.streak.reward.gold)+(b.streak.reward.potHP?"  (+poción)":""), x+28, sy+37);
    // streak claim chip
    drawClaimChip(x+bw-128, sy+11, 100, 24, b.streak.claimable, !b.streak.claimable,
      ()=>{ daily.claimStreak(); }, b.streak.claimable?STR.bountyClaim:STR.bountyClaimed);

    // ----- contracts -----
    let cy=sy+sh+14; ctx.textAlign="left"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.bountyContracts, x+20, cy); cy+=8;
    const ih=78;
    for(let i=0;i<b.contracts.length;i++){ const c=b.contracts[i]; const ry=cy+i*ih; const sel=i===(G.bountySel||0);
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(x+20,ry,bw-40,ih-10);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(x+20,ry,bw-40,ih-10); }
      // title + reward
      ctx.textAlign="left"; ctx.fillStyle=COL.cream; ctx.font="bold 13px 'Courier New'"; ctx.fillText(c.title, x+34, ry+22);
      ctx.fillStyle=COL.gold; ctx.font="12px 'Courier New'"; ctx.fillText(STR.bountyReward(c.gold,c.xp), x+34, ry+58);
      // progress bar
      const pbx=x+34, pbw=bw-200, pby=ry+32, pbh=10, f=c.need>0?Math.min(1,c.prog/c.need):0;
      ctx.fillStyle="#14181f"; ctx.fillRect(pbx,pby,pbw,pbh);
      ctx.fillStyle=c.done?COL.heal:COL.textGold; ctx.fillRect(pbx,pby,pbw*f,pbh);
      ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(pbx+0.5,pby+0.5,pbw,pbh);
      ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(c.prog+"/"+c.need, pbx+pbw+8, pby+9);
      // claim chip (right)
      const canClaim=c.done && !c.claimed;
      drawClaimChip(x+bw-128, ry+ (ih-10)/2-12, 100, 24, canClaim, c.claimed,
        ()=>{ G.bountySel=i; daily.claim(c.id); }, c.claimed?STR.bountyClaimed:STR.bountyClaim);
      // whole-row select (tap) — claim handled by the chip's own rect (pushed last = wins)
      ui.bountyRects.push({x:x+20,y:ry,w:bw-40,h:ih-10,act:()=>{ G.bountySel=i; }});
    }
    // close
    const ccy=y+bh-30; ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-60,ccy,120,24);
    ctx.textAlign="center"; ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Cerrar (E)",VW/2,ccy+17);
    ui.bountyRects.push({x:x+bw/2-60,y:ccy,w:120,h:24,act:()=>{ G.scene="play"; }});
  }
  // a small CLAIM / CLAIMED chip; `on` = active (gold), `done` = already claimed (dim).
  function drawClaimChip(cx,cy,cw,ch,on,done,act,label){
    ctx.fillStyle=on?"#2e6b2e":(done?"#262b22":"#23272f");
    ctx.fillRect(cx,cy,cw,ch);
    ctx.strokeStyle=on?COL.heal:"#3a4150"; ctx.lineWidth=1; ctx.strokeRect(cx+0.5,cy+0.5,cw,ch);
    ctx.textAlign="center"; ctx.fillStyle=on?COL.cream:COL.textDim; ctx.font="bold 12px 'Courier New'"; ctx.fillText(label, cx+cw/2, cy+16);
    ctx.textAlign="left";
    if(on) ui.bountyRects.push({x:cx,y:cy,w:cw,h:ch,act});
  }

  function renderPause(){ const bw=Math.min(VW*0.8,400), bh=Math.min(VH-20,560), x=(VW-bw)/2, y=(VH-bh)/2; panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 22px 'Courier New'"; ctx.fillText(STR.pauseTitle,VW/2,y+34);
    ctx.fillStyle=COL.textDim; ctx.font="13px 'Courier New'"; ctx.fillText(STR.settingsTitle,VW/2,y+58);
    ui.pauseRects=[];
    // CAS-131: a labelled, draggable/tappable mix slider (master / music / sfx). The
    // tap x sets the fill fraction; pauseTap routes slider rows through r.set(frac).
    function slider(label,oy,get,set,dim){ const sx=x+30, sw=bw-60, sh=22;
      ctx.textAlign="left"; ctx.fillStyle=dim?COL.textDim:COL.cream; ctx.font="12px 'Courier New'"; ctx.fillText(label,sx,oy-2);
      const bx=sx, by=oy+4, bwd=sw, bhd=sh-8;
      ctx.fillStyle="#20262f"; ctx.fillRect(bx,by,bwd,bhd);
      const f=Math.max(0,Math.min(1,get())); ctx.fillStyle=dim?"#46505f":COL.textGold; ctx.fillRect(bx,by,bwd*f,bhd);
      ctx.strokeStyle="#3a4150"; ctx.lineWidth=1; ctx.strokeRect(bx+0.5,by+0.5,bwd,bhd);
      ctx.textAlign="right"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(Math.round(f*100)+"%",bx+bwd-3,oy-2);
      ui.pauseRects.push({x:bx,y:oy-6,w:bwd,h:sh+6,slider:true,set}); }
    const opts=[
      [STR.settingShake+": "+(G.settings.shake>0?"ON":"OFF"),()=>{G.settings.shake=G.settings.shake>0?0:1;}],
      // CAS-127: accessibility off-switch — kills screen shake + trims flourish particles.
      [STR.settingReduceMotion+": "+(G.settings.reduceMotion?"ON":"OFF"),()=>{G.settings.reduceMotion=!G.settings.reduceMotion; if(G.settings.reduceMotion) G.shake=0;}],
      [STR.settingCRT+": "+(G.settings.crt?"ON":"OFF"),()=>{G.settings.crt=!G.settings.crt;}],
      [STR.settingRollDir+": "+(G.settings.rollAim?STR.rollTowardAim:STR.rollTowardMove),()=>{G.settings.rollAim=!G.settings.rollAim;}],
      // CAS-131: mute kills all audio; the 3 sliders below are the persisted mix.
      [STR.settingMute+": "+(audio.muted?"ON":"OFF"),()=>audio.toggleMute()],
      // CAS-128: replay the onboarding guide on demand (returning players never auto-get it).
      [STR.tutReplay,()=>{ G.scene="play"; sim.startTutorial(); }],
    ];
    let oy=y+78; for(const [label,act] of opts){
      ctx.textAlign="center"; ctx.fillStyle="#20262f"; ctx.fillRect(x+30,oy,bw-60,26); ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(label,VW/2,oy+18); ui.pauseRects.push({x:x+30,y:oy,w:bw-60,h:26,act}); oy+=32; }
    // mix sliders (dim when muted to show they're inactive)
    oy+=4;
    slider(STR.settingMaster,oy,()=>audio.master,(f)=>audio.setMaster(f),audio.muted); oy+=30;
    slider(STR.settingMusic,oy,()=>audio.music,(f)=>audio.setMusic(f),audio.muted); oy+=30;
    slider(STR.settingSfx,oy,()=>audio.sfxVol,(f)=>audio.setSfx(f),audio.muted); oy+=34;
    // CAS-113: "Nueva partida" — wipes the localStorage save + restarts clean.
    // Two-tap arm/confirm so an accidental click can't nuke a run.
    const reset=[]; if(G.resetArm){
      reset.push(["⚠ ¿Borrar progreso? — SÍ, BORRAR", ()=>{ G.resetArm=false; resetGame(); }]);
      reset.push(["Cancelar", ()=>{ G.resetArm=false; }]);
    } else { reset.push(["Nueva partida (borrar guardado)", ()=>{ G.resetArm=true; }]); }
    ctx.textAlign="center"; for(const [label,act] of reset){ const danger=/BORRAR|Nueva partida/.test(label);
      ctx.fillStyle=danger?"#3a2222":"#20262f"; ctx.fillRect(x+30,oy,bw-60,26); ctx.fillStyle=danger?"#f0a0a0":COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(label,VW/2,oy+18); ui.pauseRects.push({x:x+30,y:oy,w:bw-60,h:26,act}); oy+=32; }
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-80,oy+4,160,30); ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText(STR.resume,VW/2,oy+24); ui.pauseRects.push({x:x+bw/2-80,y:oy+4,w:160,h:30,act:()=>{G.resetArm=false;G.scene="play";}});
  }

  function renderDeath(){ ctx.fillStyle="rgba(40,8,8,0.6)"; ctx.fillRect(0,0,VW,VH);
    ctx.textAlign="center"; ctx.fillStyle=COL.skullR; ctx.font="bold 40px 'Courier New'"; ctx.fillText(STR.deathTitle,VW/2,VH/2-30);
    ctx.fillStyle=COL.cream; ctx.font="16px 'Courier New'"; ctx.fillText(STR.deathSub,VW/2,VH/2+6);
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(VW/2-90,VH/2+30,180,40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.fillText(STR.deathContinue,VW/2,VH/2+56);
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
    ctx.fillStyle=COL.out; ctx.font="bold 46px 'Courier New'"; ctx.fillText(STR.victoryTitle, cx+3, y+3);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.victoryTitle, cx, y); y+=40;
    ctx.fillStyle=COL.cream; ctx.font="14px 'Courier New'"; wrapText(STR.victorySub(v.bossName), cx, y, VW*0.8, 18); y+=46;
    // summary panel
    const clsName=(STR.classLabel&&STR.classLabel[v.cls])||v.cls;
    const rarName=(STR.rarityLabel&&v.lootRarity&&STR.rarityLabel[v.lootRarity])||v.lootRarity||"";
    const lines=[ STR.victoryClass(clsName), STR.victoryLevel(v.lvl), STR.victoryTime(fmtTime(v.playT)),
      STR.victoryDeaths(v.deaths), STR.victoryGold(v.gold) ];
    if(v.lootName) lines.push(STR.victoryLoot(v.lootName, rarName));
    const pw=Math.min(VW*0.7,360), ph=lines.length*22+20, px=cx-pw/2;
    ctx.fillStyle="rgba(0,0,0,0.5)"; ctx.fillRect(px,y,pw,ph);
    ctx.fillStyle=COL.panelB; ctx.fillRect(px,y,pw,3);
    ctx.font="14px 'Courier New'"; ctx.textAlign="left"; ctx.fillStyle=COL.cream;
    let ly=y+24; for(const ln of lines){ ctx.fillText(ln, px+18, ly); ly+=22; }
    y+=ph+28;
    // continue button (free play)
    ctx.textAlign="center";
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(cx-150,y,300,40);
    ctx.fillStyle=COL.textGold; ctx.font="bold 15px 'Courier New'"; ctx.fillText(STR.victoryContinue, cx, y+26);
    y+=58; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; wrapText(STR.victoryFooter, cx, y, VW*0.75, 16);
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
    let head, body, showSkip=true, prog=true;
    if(step==="done"){ head=STR.tutDoneHead; body=STR.tutDone; showSkip=false; prog=false; }
    else { head=STR.tutHead[step]||STR.tutTitle; const s=STR.tutSteps[step]; body=s?(isTouch?s.touch:s.pc):""; }
    const cw=Math.min(VW*0.86,460), cx=VW/2, x=cx-cw/2, y=VH*0.15, lh=17;
    ctx.font="13px 'Courier New'"; const lines=tutWrap(body, cw-28);
    const ch=44 + lines.length*lh + 14;
    // card
    ctx.fillStyle="rgba(8,10,14,0.86)"; ctx.fillRect(x,y,cw,ch);
    ctx.fillStyle=step==="done"?COL.heal:COL.textGold; ctx.fillRect(x,y,cw,3);
    // header strip: title · step  (left)  +  skip (right)
    ctx.textAlign="left"; ctx.font="bold 12px 'Courier New'"; ctx.fillStyle=COL.textGold;
    ctx.fillText(prog?(STR.tutTitle+"  ·  "+STR.tutStepLabel(t.i+1, sim.TUT_NSTEPS)):STR.tutTitle, x+14, y+18);
    if(showSkip){ const st=STR.tutSkip; ctx.font="bold 12px 'Courier New'"; const sw=ctx.measureText(st).width+16, sx=x+cw-sw-10, sy=y+5, sh=18;
      ctx.fillStyle="#20262f"; ctx.fillRect(sx,sy,sw,sh); ctx.fillStyle=COL.cream; ctx.textAlign="center"; ctx.fillText(st, sx+sw/2, sy+13);
      ui.tutSkipRect={x:sx,y:sy,w:sw,h:sh}; }
    else ui.tutSkipRect={x:0,y:0,w:0,h:0};
    // action verb + wrapped instruction
    ctx.textAlign="center"; ctx.fillStyle=step==="done"?COL.heal:"#9be7ff"; ctx.font="bold 13px 'Courier New'"; ctx.fillText(head, cx, y+36);
    ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; let yy=y+54; for(const ln of lines){ ctx.fillText(ln, cx, yy); yy+=lh; }
    ctx.textAlign="left";
  }
  function renderToast(){ if(G.toastT<=0) return; const a=clamp(G.toastT,0,1); ctx.globalAlpha=a; ctx.textAlign="center";
    ctx.font="bold 15px 'Courier New'"; const w=ctx.measureText(G.toast).width+24; ctx.fillStyle="rgba(8,10,14,0.9)"; ctx.fillRect(VW/2-w/2,VH*0.18,w,30);
    ctx.fillStyle=COL.panelB; ctx.fillRect(VW/2-w/2,VH*0.18,w,3); ctx.fillStyle=COL.textGold; ctx.fillText(G.toast,VW/2,VH*0.18+20); ctx.globalAlpha=1; }

  function renderTouch(){ const tb=tbtns(); const top=topBtns();
    // joystick
    if(stick.active){ ctx.globalAlpha=0.5; ctx.fillStyle="#1a1e26"; ctx.beginPath(); ctx.arc(stick.cx,stick.cy,52,0,6.28); ctx.fill();
      ctx.fillStyle="#5a4632"; let dx=stick.x-stick.cx,dy=stick.y-stick.cy; const m=Math.hypot(dx,dy)||1; const cl=Math.min(m,48); ctx.beginPath(); ctx.arc(stick.cx+dx/m*cl,stick.cy+dy/m*cl,22,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    function btn(b,col,big){ if(!b.r) return; ctx.globalAlpha=0.55; ctx.fillStyle="#12161d"; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.28); ctx.fill();
      ctx.globalAlpha=0.9; ctx.strokeStyle=col||COL.panelB; ctx.lineWidth=2; ctx.stroke(); ctx.fillStyle=col||COL.cream; ctx.font="bold "+(big?20:14)+"px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(b.label,b.x,b.y+ (big?7:5)); ctx.globalAlpha=1; }
    btn(tb.attack,COL.textGold,true); btn(tb.roll,COL.cream); btn(tb.s2,COL.flame); btn(tb.s3,COL.heal); btn(tb.s4,COL.rune); btn(tb.act,COL.cream); btn(tb.pick,COL.cream);
    btn(top.inv,COL.cream); btn(top.map,COL.cream); btn(top.pause,COL.cream);
    // mp cost hints on spell buttons (data-driven per class)
    const sp=SPELLS[G.hero.cls]||SPELLS.warrior;
    ctx.globalAlpha=0.8; ctx.font="9px 'Courier New'"; ctx.fillStyle="#8ab8ff"; ctx.textAlign="center";
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
    ctx.fillStyle=COL.out; ctx.font="bold 56px 'Courier New'"; ctx.fillText(STR.title,VW/2+3,VH*0.30+3);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.title,VW/2,VH*0.30);
    ctx.fillStyle=COL.cream; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.subtitle,VW/2,VH*0.30+34);
    // sword+shield emblem
    drawMenuEmblem(VW/2,VH*0.30-78);
    // play button
    const bw=200,bh=52,bx=VW/2-bw/2,by=VH*0.62; ui.menuPlayRect={x:bx,y:by,w:bw,h:bh};
    ctx.fillStyle="#2e231a"; ctx.fillRect(bx,by,bw,bh); ctx.fillStyle=COL.panelB; ctx.fillRect(bx,by,bw,4); ctx.fillRect(bx,by+bh-4,bw,4);
    ctx.fillStyle=COL.textGold; ctx.font="bold 24px 'Courier New'"; ctx.fillText(STR.play,VW/2,by+34);
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(STR.controlsHintPC,VW/2,VH-40);
    ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.version,VW/2,VH-18);
  }
  function renderClassSel(){
    const META={warrior:["Guerrero","Espada y escudo","#8d3636"], paladin:["Paladín","Arco sagrado","#e6e0cf"],
      mage:["Mago","Orbes arcanos","#2f6e6e"], druid:["Druida","Naturaleza","#41693c"], priest:["Sacerdote","Luz sagrada","#e2ddcd"]};
    ctx.fillStyle=COL.night; ctx.fillRect(0,0,VW,VH);
    rrng.seed(7); for(let i=0;i<50;i++){ ctx.fillStyle=i%9===0?"#2a3a2a":"#161b22"; ctx.fillRect(rr(0,VW),rr(0,VH),2,2); }
    ctx.textAlign="center";
    ctx.fillStyle=COL.textGold; ctx.font="bold 26px 'Courier New'"; ctx.fillText("Elige tu clase",VW/2,VH*0.15);
    ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Toca una clase  ·  1-5 / ←→ + Enter  ·  C personalizar",VW/2,VH*0.15+24);
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
      ctx.fillStyle=sel?COL.textGold:COL.cream; ctx.font="bold 14px 'Courier New'"; ctx.fillText(META[cls][0],rx+cw/2,ry+ch-40);
      ctx.fillStyle="#9aa0aa"; ctx.font="10px 'Courier New'"; ctx.fillText(META[cls][1],rx+cw/2,ry+ch-28);
      // CAS-100: per-class base stats so the player can SEE each class plays different,
      // not just looks different. 4 normalized bars (HP / MP / DMG / SPD) under the name.
      const cs=CLASS_STATS[cls]; if(cs){
        const rows=[["VID",cs.hp,135,"#c64b4b"],["MAN",cs.mp,82,"#4b86c6"],["DÑO",cs.dmg,14,"#e0b24a"],["VEL",cs.moveScale,1.07,"#5fae5a"]];
        const bx=rx+30, bw=cw-40, by=ry+ch-22, bh=3;
        ctx.textAlign="left"; ctx.font="7px 'Courier New'";
        for(let r=0;r<rows.length;r++){ const [lab,v,mx,col]=rows[r], yy=by+r*5;
          ctx.fillStyle="#7a808a"; ctx.fillText(lab,rx+6,yy+3);
          ctx.fillStyle="#1b2027"; ctx.fillRect(bx,yy,bw,bh);
          ctx.fillStyle=col; ctx.fillRect(bx,yy,bw*Math.min(1,v/mx),bh); }
        ctx.textAlign="center";
      }
      ctx.fillStyle=COL.textDim; ctx.font="bold 11px 'Courier New'"; ctx.fillText(String(i+1),rx+10,ry+18);
      ui.classRects.push({x:rx,y:ry,w:cw,h:ch,cls});
    }
    // CAS-128: contextual help for the highlighted class — its role + a one-line fantasy
    // (attack flavour) so a first-time player picks with intent, not at random. Updates
    // live as the selection moves (1-5 / ←→ / tap-focus).
    const selCls=CLASS_LIST[G.classSel]||CLASS_LIST[0], info=(STR.classes&&STR.classes[selCls]);
    if(info){ const hy=cy+ch/2+26;
      ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText(info.name+" — "+info.role, VW/2, hy);
      ctx.fillStyle=COL.cream; ctx.font="12px 'Courier New'"; ctx.fillText(info.attack, VW/2, hy+20); }
    // CAS-169: "Personalizar ▸" — open the wardrobe for the highlighted class before play.
    const pbW=Math.min(220,VW*0.6), pbH=30, pbX=VW/2-pbW/2, pbY=Math.min(VH-46, cy+ch/2+40);
    ctx.fillStyle="#262d3a"; ctx.fillRect(pbX,pbY,pbW,pbH); ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(pbX,pbY,pbW,pbH);
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px 'Courier New'"; ctx.fillText(STR.customizeOpen+" ▸", VW/2, pbY+20);
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
    ctx.fillStyle=COL.textGold; ctx.font="bold 22px 'Courier New'"; ctx.fillText(STR.customizeTitle, VW/2, 34);
    ctx.fillStyle=COL.cream; ctx.font="11px 'Courier New'"; ctx.fillText(STR.customizeHint, VW/2, 54);

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
      ctx.fillStyle=foc?COL.textGold:COL.cream; ctx.font="bold 11px 'Courier New'"; ctx.fillText(row.label, colX+8, ry+15);
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
        ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText("‹",colX+90+aw/2,vy+vh*0.7); ctx.fillText("›",rx-aw/2,vy+vh*0.7);
        ctx.fillStyle=COL.cream; ctx.font="bold 11px 'Courier New'"; ctx.fillText(CUST_VARNAME[val]||val,(colX+90+aw+rx-aw)/2,vy+vh*0.7);
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
    ctx.fillStyle=COL.heal; ctx.font="bold 14px 'Courier New'"; ctx.fillText(STR.customizeDone, dX+bw/2, by+21);
    ctx.fillStyle="#33301a"; ctx.fillRect(sX,by,bw,bh); ctx.strokeStyle=COL.textGold; ctx.lineWidth=2; ctx.strokeRect(sX,by,bw,bh);
    ctx.fillStyle=COL.textGold; ctx.fillText(STR.customizeReset, sX+bw/2, by+21);
    ui.customRects.push({kind:"done",x:dX,y:by,w:bw,h:bh});
    ui.customRects.push({kind:"reset",x:sX,y:by,w:bw,h:bh});
    ctx.fillStyle=COL.textDim; ctx.font="10px 'Courier New'"; ctx.fillText(STR.customizeKeys, VW/2, VH-8);
    ctx.textAlign="left";
  }
  function drawMenuEmblem(x,y){ ctx.save(); ctx.translate(x,y);
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(0,0,26,0,6.28); ctx.fill(); ctx.fillStyle="#6b4a2a"; ctx.beginPath(); ctx.arc(0,0,22,0,6.28); ctx.fill();
    ctx.fillStyle="#8a6038"; ctx.beginPath(); ctx.arc(0,0,16,0,6.28); ctx.fill();
    ctx.strokeStyle="#cdd4dc"; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,18); ctx.moveTo(18,-18); ctx.lineTo(-18,18); ctx.stroke();
    ctx.strokeStyle=COL.out; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }

  return { render };
}
