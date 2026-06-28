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
import { TS, MAP_W, MAP_H, T_GRASS, T_STONE, T_SAND, T_COBBLE, CFG, CLASS_LIST, CLASS_STATS, SPELLS, HUNTS } from "../sim/config.js";
import { clamp, dist2 } from "../sim/math.js";
import { createRNG, hash2 } from "../sim/rng.js";
import { gearStat, gearName, gearCol, equippedDmg, equippedDef } from "../sim/gear.js";
import { STR } from "../strings.js";
import { audio } from "../audio.js";
import { view, zoom } from "../view.js";
import { COL } from "./palette.js";
import {
  blit, SP, IMG, loadImg, drawCoin, drawPotion, drawFragment,
  ANIM, ENEMY_ANIM, NPC_ANIM, CLS, PROP_SCALE, HERO_SPRITE_SCALE,
  dir4FromAngle, drawClassFrame, drawAnim, frameIndex,
} from "./sprites.js";

// CAS-82: the board's main-character art is a single 256×256 hooded pose
// (assets/erw/hero/hero_hooded.png) — a higher-fidelity match for our existing
// hooded hero, with NO walk/directional sheet. We draw the tight content cell
// (alpha bbox 58×158 @ 96,56) bottom-anchored at ~2 tiles, and give movement
// feel PROCEDURALLY (step-bob / squash / lunge) — all derived from sim time and
// animT, never render RNG, so it stays Stage-2 server-authority-safe.
const ERW_HERO_SRC="./assets/erw/hero/hero_hooded.png";
const ERW_SX=96, ERW_SY=56, ERW_SW=58, ERW_SH=158;
// 158px tall × 0.42 ≈ 66px ≈ 2 tiles — the OLD (too-big) size the board rejected.
const ERW_SCALE=0.42;
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
const HERO_ANIM_SCALE=0.32;
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
const CLASS_ANIM_SCALE=0.32;
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
  // offscreen buffer for the hero hurt-flash tint (only touched when flashing)
  const _heroBuf=(typeof document!=="undefined")?document.createElement("canvas"):null;
  const _heroBx=_heroBuf?_heroBuf.getContext("2d"):null;
  let VW = view.VW, VH = view.VH;      // synced from the viewport each frame
  const rr = (a,b)=>rrng.rr(a,b);

  const tileBase=[COL.grass,COL.dirt,COL.stone,COL.cobble,COL.sand,COL.water];
  const tileLight=[COL.grassL,COL.dirtL,COL.stoneL,COL.cobbleL,COL.sandL,COL.waterL];
  const tileDark=[COL.grassD,COL.dirtD,COL.stoneD,COL.cobbleD,COL.sandD,COL.water];

  function render(alpha){
    VW=view.VW; VH=view.VH;
    const Z=zoom();
    let camX=G.cam.x, camY=G.cam.y;
    if(G.shake>0){ camX+=rr(-G.shake,G.shake)/Z; camY+=rr(-G.shake,G.shake)/Z; }
    ctx.fillStyle=COL.bg; ctx.fillRect(0,0,VW,VH);
    if(G.scene==="menu"){ renderMenu(); return; }
    if(G.scene==="classsel"){ renderClassSel(); return; }
    ctx.save(); ctx.scale(Z,Z); ctx.translate(-camX,-camY);
    renderWorld(camX,camY,Z);
    renderEntities();
    ctx.restore();
    renderHUD();
    if(G.showMap) renderBigMap();
    if(G.scene==="inventory") renderInventory();
    if(G.scene==="dialogue") renderDialogue();
    if(G.scene==="shop") renderShop();
    if(G.scene==="pause") renderPause();
    if(G.scene==="dead") renderDeath();
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
    for(const f of G.floaters){ ctx.globalAlpha=clamp(1-f.t/f.life,0,1); ctx.font="bold 13px 'Courier New',monospace"; ctx.textAlign="center"; ctx.fillStyle=COL.out; ctx.fillText(f.txt,f.x+1,f.y+1); ctx.fillStyle=f.col; ctx.fillText(f.txt,f.x,f.y); ctx.globalAlpha=1; }
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
    const ok=drawHeroClass(CLASS_HERO_ART[cls],cfi,hx,hfeet,flip,sqX,sqY,bobUp,tint,walking) // CAS-98/110 per-class animated loop
          || drawHeroAnim(def.img,fi,h.x,feet,flip,tint,bob)                     // hooded anim fallback
          || drawHeroErw(h.x,feet,flip,1,1,0,tint)       // hooded pose until strips load
          || drawClassFrame(ctx,cls,(state==="roll")?"walk":state,dir4FromAngle(ang),fi,h.x,feet,HERO_SPRITE_SCALE,tint);
    ctx.globalAlpha=1;
    if(!ok){ const b2=h.walkT?Math.sin(h.walkT)*2:0; blit(ctx,SP.hero.rows, h.hurtFlash>0?redden(SP.hero.pal):SP.hero.pal, h.x,h.y-12-b2,3, Math.cos(h.facing)<0); }
    if(!h.dead){ ctx.globalAlpha=0.8; ctx.fillStyle=COL.textGold; const fx=h.x+Math.cos(h.facing)*18, fy=h.y-2+Math.sin(h.facing)*18; ctx.fillRect(fx-1.5,fy-1.5,3,3); ctx.globalAlpha=1; }
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
    // windup telegraph: flashing warning + slight grow
    if(e.state==="windup"){ const fl2=Math.floor(G.t*16)%2===0;
      if(e.tpl.ranged){ const a=e.facing; const col=e.tpl.proj==="bolt"?"#9bef5a":"#ffd24d";
        ctx.globalAlpha=0.55; ctx.strokeStyle=fl2?col:"#ff8a3a"; ctx.lineWidth=2; ctx.setLineDash([6,7]);
        ctx.beginPath(); ctx.moveTo(e.x,e.y-6); ctx.lineTo(e.x+Math.cos(a)*240,e.y-6+Math.sin(a)*240); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha=1;
        const cx=e.x+Math.cos(a)*14, cy=e.y-8+Math.sin(a)*14; ctx.globalAlpha=0.9; ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(cx,cy,3+(fl2?2:0),0,6.28); ctx.fill(); ctx.globalAlpha=1;
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
    if(!drew){ if(e.hurtFlash>0) blit(ctx,spr.rows,whiten(spr.pal),e.x,e.y,px,fl); else blit(ctx,spr.rows,spr.pal,e.x,e.y,px,fl); }
    // health bar
    const w=e.isBoss?64:(e.champion?58:Math.max(22,e.tpl.size*1.6)); const hh=(e.isBoss||e.champion)?6:4; const yy=e.y-e.tpl.size-((e.isBoss||e.champion)?14:8);
    ctx.fillStyle=COL.out; ctx.fillRect(e.x-w/2-1,yy-1,w+2,hh+2);
    ctx.fillStyle=COL.hpb; ctx.fillRect(e.x-w/2,yy,w,hh);
    const champCol=e.capstone?(e.enraged?"#ff4636":"#ff9a3a"):"#ffcf4d";
    ctx.fillStyle=e.champion?champCol:(e.hostile?"#ff5a4a":COL.hpf); ctx.fillRect(e.x-w/2,yy,w*clamp(e.hp/e.maxHp,0,1),hh);
    if(e.isBoss){ ctx.fillStyle=COL.textGold; ctx.font="bold 10px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("GÓLEM ANCESTRAL",e.x,yy-4); }
    else if(e.champion){ ctx.fillStyle=e.specialNow?"#ff5230":champCol; ctx.font="bold 10px 'Courier New'"; ctx.textAlign="center";
      ctx.fillText((e.capstone?"☠ ":"★ ")+e.tpl.champName+(e.enraged?" ¡ENFURECIDO!":e.specialNow?" ¡CUIDADO!":""),e.x,yy-4); }
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
    } else { const spr=SP[n.sprite]; blit(ctx,spr.rows,spr.pal,n.x,n.y,3,false); topY=n.y-spr.rows.length*3/2; }
    // marker
    const near=dist2(G.hero.x,G.hero.y,n.x,n.y)<CFG.talkRange*CFG.talkRange;
    let mk = n.role==="quest" && !G.quest.rewarded ? "!" : (near?"E":"");
    if(n.role==="quest" && G.quest.done && !G.quest.rewarded) mk="!";
    if(mk){ ctx.fillStyle=mk==="!"?COL.textGold:COL.cream; ctx.font="bold 14px 'Courier New'"; ctx.textAlign="center"; ctx.fillText(mk,n.x,topY-6+Math.sin(G.t*4)*2); }
  }
  function drawProjectile(p){ if(p.kind==="fire"){ ctx.fillStyle=COL.flameL; ctx.beginPath(); ctx.arc(p.x,p.y,6,0,6.28); ctx.fill(); ctx.fillStyle=COL.flame; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,6.28); ctx.fill(); }
    else if(p.kind==="rune"){ ctx.fillStyle=COL.rune; ctx.fillRect(p.x-4,p.y-4,8,8); ctx.fillStyle="#aac4ff"; ctx.fillRect(p.x-2,p.y-2,4,4); }
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
    bar(pad,pad,bw,16,h.hp/h.maxHp,COL.hpf,COL.hpb, STR.hp+" "+Math.max(0,Math.ceil(h.hp))+"/"+h.maxHp);
    bar(pad,pad+22,bw,12,h.mp/h.maxMp,COL.mpf,COL.mpb, STR.mp+" "+Math.ceil(h.mp)+"/"+h.maxMp);
    bar(pad,pad+38,bw,10,h.xp/h.xpNext,COL.xpf,COL.xpb, STR.level(h.lvl));
    // gold + potions
    ctx.font="bold 13px 'Courier New'"; ctx.fillStyle=COL.gold; ctx.fillText(STR.gold(h.gold),pad,pad+66);
    ctx.fillStyle=COL.cream; ctx.fillText("♥"+h.potHP+"  ◆"+h.potMP+"  ✦"+h.blessings, pad,pad+84);
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
    const zn={town:STR.zoneTown,forest:STR.zoneForest,caves:STR.zoneCaves,arena:STR.zoneArena,ruins:STR.zoneRuins,field:STR.zoneField}[zoneOf(world,h.x,h.y)];
    ctx.fillText(zn, VW/2, 20);
    // spell bar
    renderSpellBar();
    // minimap
    if(!isTouch || true) renderMiniMap();
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
    const zr=[[world.forest,COL.grass],[world.caves,COL.stone],[world.arena,COL.sand],[world.town,COL.cobble],[world.ruins,COL.grass]];
    for(const [r,c] of zr){ ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy); }
    ctx.fillStyle="#ff5a4a"; for(const e of G.enemies){ ctx.fillRect(x+e.x*sx-1,y+e.y*sy-1,2,2); }
    ctx.fillStyle=COL.textGold; ctx.fillRect(x+G.hero.x*sx-2,y+G.hero.y*sy-2,4,4);
  }
  function renderBigMap(){ const mw=Math.min(VW*0.7,420), mh=mw; const x=(VW-mw)/2, y=(VH-mh)/2;
    panel(x-10,y-30,mw+20,mh+40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.textAlign="center"; ctx.fillText("VALDORIA",VW/2,y-8);
    const sx=mw/(MAP_W*TS), sy=mh/(MAP_H*TS);
    const zr=[[world.forest,COL.grass,STR.zoneForest],[world.caves,COL.stone,STR.zoneCaves],[world.arena,COL.sand,STR.zoneArena],[world.town,COL.cobble,STR.zoneTown],[world.ruins,COL.grass,STR.zoneRuins]];
    for(const [r,c,nm] of zr){ ctx.fillStyle=c; ctx.fillRect(x+r.x*TS*sx,y+r.y*TS*sy,r.w*TS*sx,r.h*TS*sy);
      ctx.fillStyle=COL.cream; ctx.font="9px 'Courier New'"; ctx.fillText(nm,x+(r.x+r.w/2)*TS*sx,y+(r.y+r.h/2)*TS*sy); }
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

  // Compare arrow vs the piece currently equipped in this item's slot.
  function cmpArrow(inst){ const eq=gearStat(G.hero.equip[inst.slot]); const v=gearStat(inst);
    return v>eq?{s:"▲",c:COL.heal}:(v<eq?{s:"▼",c:"#d05555"}:{s:"=",c:COL.textDim}); }
  function renderInventory(){ const bw=Math.min(VW*0.9,560), bh=Math.min(VH*0.85,460), x=(VW-bw)/2, y=(VH-bh)/2; const h=G.hero;
    panel(x,y,bw,bh); ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 18px 'Courier New'"; ctx.fillText(STR.invTitle,VW/2,y+28);
    const colX=x+28, colW=bw*0.46;
    // ---- left: equipment doll + equipped slots + totals ----
    blit(ctx,SP.hero.rows,SP.hero.pal,colX+8,y+58,5,false);
    ctx.textAlign="left"; ctx.font="12px 'Courier New'";
    const slots=[[STR.slotWeapon,"weapon"],[STR.slotBody,"body"],[STR.slotShield,"shield"]];
    let ry=y+62; for(const [label,slot] of slots){ const inst=h.equip[slot];
      ctx.fillStyle=COL.textDim; ctx.fillText(label, colX+96, ry);
      ctx.fillStyle=gearCol(inst); ctx.fillText(gearName(inst), colX+96, ry+15);
      ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText((slot==="weapon"?STR.statsDmg:STR.statsDef)+" "+gearStat(inst), colX+96, ry+28); ctx.font="12px 'Courier New'";
      ry+=46; }
    ctx.fillStyle=COL.textGold; ctx.font="bold 13px 'Courier New'";
    ctx.fillText(STR.statsDmg+": "+equippedDmg(h), colX+8, ry+6);
    ctx.fillText(STR.statsDef+": "+equippedDef(h), colX+8, ry+24);
    // potions / blessings
    ctx.fillStyle=COL.cream; ctx.font="12px 'Courier New'";
    ctx.fillText("♥ x"+h.potHP+"   ◆ x"+h.potMP+"   ✦ x"+h.blessings, colX+8, y+bh-22);
    // ---- right: backpack list with compare arrows ----
    const rx=x+bw*0.50, rw=bw*0.46;
    ctx.fillStyle=COL.textDim; ctx.font="12px 'Courier New'"; ctx.fillText(STR.backpack, rx, y+54);
    ui.invRects=[];
    const bag=h.bag; if(G.invSel==null) G.invSel=0; G.invSel=Math.max(0,Math.min(G.invSel, Math.max(0,bag.length-1)));
    const rowH=30, listY=y+62, maxRows=Math.floor((bh-120)/rowH);
    if(!bag.length){ ctx.fillStyle=COL.textDim; ctx.fillText(STR.bagEmpty, rx, listY+18); }
    for(let i=0;i<bag.length && i<maxRows;i++){ const inst=bag[i]; const ay=listY+i*rowH; const sel=i===G.invSel;
      ctx.fillStyle=sel?"#2e3647":"#20262f"; ctx.fillRect(rx,ay,rw,rowH-4);
      if(sel){ ctx.strokeStyle=COL.textGold; ctx.lineWidth=1.5; ctx.strokeRect(rx,ay,rw,rowH-4); }
      ctx.textAlign="left"; ctx.fillStyle=gearCol(inst); ctx.font="12px 'Courier New'";
      ctx.fillText(gearName(inst)+" ("+gearStat(inst)+")", rx+8, ay+18);
      const ar=cmpArrow(inst); ctx.textAlign="right"; ctx.fillStyle=ar.c; ctx.font="bold 13px 'Courier New'"; ctx.fillText(ar.s, rx+rw-8, ay+18);
      ui.invRects.push({x:rx,y:ay,w:rw,h:rowH-4, idx:i});
    }
    ctx.textAlign="center"; ctx.fillStyle=COL.textDim; ctx.font="11px 'Courier New'"; ctx.fillText(STR.equipHint,VW/2,y+bh-6);
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

  function renderPause(){ const bw=Math.min(VW*0.8,400), bh=300, x=(VW-bw)/2, y=(VH-bh)/2; panel(x,y,bw,bh);
    ctx.textAlign="center"; ctx.fillStyle=COL.textGold; ctx.font="bold 22px 'Courier New'"; ctx.fillText(STR.pauseTitle,VW/2,y+40);
    ctx.fillStyle=COL.textDim; ctx.font="13px 'Courier New'"; ctx.fillText(STR.settingsTitle,VW/2,y+70);
    ui.pauseRects=[]; const opts=[
      [STR.settingShake+": "+(G.settings.shake>0?"ON":"OFF"),()=>{G.settings.shake=G.settings.shake>0?0:1;}],
      [STR.settingCRT+": "+(G.settings.crt?"ON":"OFF"),()=>{G.settings.crt=!G.settings.crt;}],
      [STR.settingRollDir+": "+(G.settings.rollAim?STR.rollTowardAim:STR.rollTowardMove),()=>{G.settings.rollAim=!G.settings.rollAim;}],
      ["Sonido: "+(audio.on?"ON":"OFF"),()=>audio.setEnabled(!audio.on)],
    ];
    let oy=y+90; for(const [label,act] of opts){ ctx.fillStyle="#20262f"; ctx.fillRect(x+30,oy,bw-60,30); ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText(label,VW/2,oy+20); ui.pauseRects.push({x:x+30,y:oy,w:bw-60,h:30,act}); oy+=38; }
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(x+bw/2-80,oy+6,160,30); ctx.fillStyle=COL.textGold; ctx.font="bold 14px 'Courier New'"; ctx.fillText(STR.resume,VW/2,oy+26); ui.pauseRects.push({x:x+bw/2-80,y:oy+6,w:160,h:30,act:()=>{G.scene="play";}});
  }

  function renderDeath(){ ctx.fillStyle="rgba(40,8,8,0.6)"; ctx.fillRect(0,0,VW,VH);
    ctx.textAlign="center"; ctx.fillStyle=COL.skullR; ctx.font="bold 40px 'Courier New'"; ctx.fillText(STR.deathTitle,VW/2,VH/2-30);
    ctx.fillStyle=COL.cream; ctx.font="16px 'Courier New'"; ctx.fillText(STR.deathSub,VW/2,VH/2+6);
    ctx.fillStyle="#3a2c1e"; ctx.fillRect(VW/2-90,VH/2+30,180,40); ctx.fillStyle=COL.textGold; ctx.font="bold 16px 'Courier New'"; ctx.fillText(STR.deathContinue,VW/2,VH/2+56);
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

  function renderCRT(){ ctx.globalAlpha=0.08; ctx.fillStyle="#000";
    for(let y=0;y<VH;y+=3){ ctx.fillRect(0,y,VW,1); } ctx.globalAlpha=1;
    const g=ctx.createRadialGradient(VW/2,VH/2,VH*0.3,VW/2,VH/2,VH*0.8); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(1,"rgba(0,0,0,0.5)");
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
    ctx.fillStyle=COL.cream; ctx.font="13px 'Courier New'"; ctx.fillText("Toca una clase  ·  o usa 1-5 / ←→ + Enter",VW/2,VH*0.15+24);
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
  }
  function drawMenuEmblem(x,y){ ctx.save(); ctx.translate(x,y);
    ctx.fillStyle=COL.out; ctx.beginPath(); ctx.arc(0,0,26,0,6.28); ctx.fill(); ctx.fillStyle="#6b4a2a"; ctx.beginPath(); ctx.arc(0,0,22,0,6.28); ctx.fill();
    ctx.fillStyle="#8a6038"; ctx.beginPath(); ctx.arc(0,0,16,0,6.28); ctx.fill();
    ctx.strokeStyle="#cdd4dc"; ctx.lineWidth=5; ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,18); ctx.moveTo(18,-18); ctx.lineTo(-18,18); ctx.stroke();
    ctx.strokeStyle=COL.out; ctx.lineWidth=1.5; ctx.stroke(); ctx.restore(); }

  return { render };
}
