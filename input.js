// ===========================================================================
// input.js — the controller layer (keyboard / pointer / touch / gamepad).
//
// Bridges raw device input to simulation commands and produces the per-frame
// intent the sim samples via the injected `io` object. Also owns the immediate-
// mode UI hit-rects (`ui`) that render writes into and input reads back, plus
// the on-screen touch button layout. This is the one place (besides the menu
// DOM) that legitimately touches the document — the sim never does.
// ===========================================================================
import * as sim from "./sim/sim.js";
import { norm } from "./sim/math.js";
import { CLASS_LIST } from "./sim/config.js";
import { talentNodes } from "./sim/talents.js";
import { STR } from "./strings.js";
import { audio } from "./audio.js";
import { view, zoom } from "./view.js";
import { COL } from "./render/palette.js";

const G = sim.G;

// ----- shared UI state (read by render, written here / by render) ----------
// CAS-119: talentRects + a live mouse position so the talent panel can hover-describe.
export const ui = { pauseRects:[], shopRects:[], classRects:[], talentRects:[], mouseX:0, mouseY:0, menuPlayRect:{x:0,y:0,w:0,h:0} };
export const stick = { active:false, id:-1, cx:0, cy:0, x:0, y:0 };
export let isTouch = false;        // live binding consumed by sim (io) + render
let aimActive = false;
let mouseX = view.VW/2, mouseY = view.VH/2;

const keys = new Set();
const BIND = {KeyW:"up",KeyS:"down",KeyA:"left",KeyD:"right",ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right"};
const press = {}; // edge-triggered

let canvas = null, nameWrap = null, nameInput = null;

// ----------------------------- keyboard --------------------------------
function onKeyDown(e){
  if(G.scene==="menu"){ if(document.activeElement===nameInput && e.code!=="Enter") return;
    if(e.code==="Enter") startGame(); return; }
  if(G.scene==="classsel"){ const c=e.code;
    if(c==="Digit1"||c==="Numpad1") chooseClass(CLASS_LIST[0]);
    else if(c==="Digit2"||c==="Numpad2") chooseClass(CLASS_LIST[1]);
    else if(c==="Digit3"||c==="Numpad3") chooseClass(CLASS_LIST[2]);
    else if(c==="Digit4"||c==="Numpad4") chooseClass(CLASS_LIST[3]);
    else if(c==="Digit5"||c==="Numpad5") chooseClass(CLASS_LIST[4]);
    else if(c==="ArrowLeft"||c==="KeyA") G.classSel=(G.classSel+CLASS_LIST.length-1)%CLASS_LIST.length;
    else if(c==="ArrowRight"||c==="KeyD") G.classSel=(G.classSel+1)%CLASS_LIST.length;
    else if(c==="Enter"||c==="Space") chooseClass(CLASS_LIST[G.classSel]);
    e.preventDefault(); return; }
  if(BIND[e.code]) { keys.add(BIND[e.code]); e.preventDefault(); }
  edge(e.code);
  if(["Space","KeyJ","Digit1","Digit2","Digit3","Digit4","KeyF","KeyI","KeyM","KeyE","KeyT","Escape"].includes(e.code)) e.preventDefault();
}
function onKeyUp(e){ if(BIND[e.code]) keys.delete(BIND[e.code]); }
function edge(code){
  if(G.scene==="dead"){ if(code==="Space"||code==="Enter") sim.respawn(); return; }
  if(G.scene==="dialogue"){ if(code==="KeyE"||code==="Space"||code==="Enter") sim.advanceDialogue(); else if(code==="Escape"){G.dialog=null;G.scene="play";} return; }
  if(G.scene==="shop"){ if(code==="Escape"||code==="KeyE"){G.scene="play";G.healShop=false;G.merchantShop=false;}
    else if(code==="ArrowUp"){G.shopSel=(G.shopSel+sim.shopItems().length-1)%sim.shopItems().length;}
    else if(code==="ArrowDown"){G.shopSel=(G.shopSel+1)%sim.shopItems().length;}
    else if(code==="Enter"||code==="Space"){sim.buyItem(G.shopSel);} return; }
  if(G.scene==="inventory"){ const n=G.hero.bag.length;
    if(code==="KeyI"||code==="Escape") G.scene="play";
    else if(code==="ArrowUp"&&n){ G.invSel=(((G.invSel||0)-1)+n)%n; }
    else if(code==="ArrowDown"&&n){ G.invSel=(((G.invSel||0)+1))%n; }
    else if((code==="Enter"||code==="Space")&&n){ sim.equipBag(G.invSel||0); }
    else if(code==="KeyP"){ sim.doPotionHP(); }
    else if(code==="KeyO"){ sim.doPotionMP(); }
    return; }
  // CAS-119: talent panel — T/Escape close. Keyboard players can spend on the focused
  // node with Enter/Space; arrows move focus. Pointer/touch use ui.talentRects (tap).
  if(G.scene==="talents"){ if(code==="KeyT"||code==="Escape"){ G.scene="play"; }
    else if(code==="ArrowRight"||code==="ArrowDown"){ G.talFocus=focusStep(1); }
    else if(code==="ArrowLeft"||code==="ArrowUp"){ G.talFocus=focusStep(-1); }
    else if(code==="Enter"||code==="Space"){ const id=focusedNodeId(); if(id) sim.allocTalent(id); }
    else if(code==="KeyR"){ sim.respecTalents(); } return; }
  if(G.scene==="pause"){ if(code==="Escape"){ G.resetArm=false; G.scene="play"; }
    else if(code==="Digit1"){G.settings.shake=G.settings.shake>0?0:1;}
    else if(code==="Digit2"){G.settings.crt=!G.settings.crt;}
    else if(code==="Digit3"){G.settings.rollAim=!G.settings.rollAim;}
    else if(code==="Digit4"){toggleSound();} return; }
  if(G.scene!=="play") return;
  switch(code){
    case "Space": sim.doRoll(); break;
    case "KeyJ": case "Digit1": sim.castSpell(0); break;
    case "Digit2": sim.castSpell(1); break;
    case "Digit3": sim.castSpell(2); break;
    case "Digit4": sim.castSpell(3); break;
    case "KeyF": sim.tryPickup(); break;
    case "KeyI": G.scene="inventory"; break;
    case "KeyT": G.scene="talents"; G.talFocus=G.talFocus||0; break; // CAS-119 talent panel
    case "KeyM": G.showMap=!G.showMap; break;
    case "KeyE": sim.interact(); break;
    case "Escape": G.scene="pause"; break;
    case "KeyP": sim.doPotionHP(); break;
    case "KeyO": sim.doPotionMP(); break;
  }
}

// ----------------------------- pointer ---------------------------------
function onPointerDown(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
  audio.resume();
  if(G.scene==="menu"){ if(menuPlayHit(x,y)) startGame(); return; }
  if(G.scene==="classsel"){ for(const c of ui.classRects){ if(x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h){ chooseClass(c.cls); return; } } return; }
  if(handleUITap(x,y)) return;
  if(G.scene==="play"){
    // touch zones: left half = move stick, right half handled by buttons; tap world = attack toward point
    if(isTouch && x<view.VW*0.42){ stick.active=true; stick.id=e.pointerId; stick.cx=x; stick.cy=y; stick.x=x; stick.y=y; }
    else if(!isTouch){ aimActive=true; mouseX=x; mouseY=y; faceMouse(); sim.castSpell(0); }
  }
}
function onPointerMove(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top;
  mouseX=x; mouseY=y; ui.mouseX=x; ui.mouseY=y; // CAS-119: feed the talent panel's hover
  if(stick.active && e.pointerId===stick.id){ stick.x=x; stick.y=y; }
  else if(!isTouch && G.scene==="play"){ faceMouse(); }
}
function onPointerUp(e){ if(stick.active&&e.pointerId===stick.id){ stick.active=false; } aimActive=false; }
function faceMouse(){ const h=G.hero; if(!h) return; const wx=G.cam.x+mouseX/zoom(), wy=G.cam.y+mouseY/zoom(); h.facing=Math.atan2(wy-h.y,wx-h.x); }

function moveVec(){
  if(isTouch && stick.active){ let dx=stick.x-stick.cx, dy=stick.y-stick.cy; const m=Math.hypot(dx,dy);
    if(m<8) return [0,0]; const cl=Math.min(m,48)/m; return [dx*cl/48, dy*cl/48]; }
  let dx=0,dy=0; if(keys.has("left"))dx--; if(keys.has("right"))dx++; if(keys.has("up"))dy--; if(keys.has("down"))dy++;
  // gamepad
  const gp=(navigator.getGamepads&&navigator.getGamepads()[0]);
  if(gp){ const lx=gp.axes[0]||0, ly=gp.axes[1]||0; if(Math.abs(lx)>0.2)dx+=lx; if(Math.abs(ly)>0.2)dy+=ly; }
  if(dx===0&&dy===0) return [0,0]; return norm(dx,dy);
}
// gamepad edge buttons
const padPrev={};
function pollPad(){ const gp=(navigator.getGamepads&&navigator.getGamepads()[0]); if(!gp) return;
  const map={0:()=>sim.castSpell(0),1:sim.doRoll,2:()=>sim.castSpell(1),3:()=>sim.castSpell(2),5:()=>sim.castSpell(3),9:()=>{G.scene=G.scene==="pause"?"play":"pause";},8:sim.tryPickup,4:sim.interact};
  gp.buttons.forEach((b,i)=>{ const p=!!b.pressed; if(p&&!padPrev[i]&&map[i]&&G.scene==="play") map[i](); if(i===9&&p&&!padPrev[i]&&G.scene==="pause")G.scene="play"; padPrev[i]=p; });
  const rx=gp.axes[2]||0, ry=gp.axes[3]||0; if(Math.hypot(rx,ry)>0.3 && G.hero) G.hero.facing=Math.atan2(ry,rx);
}

// ------------------------- on-screen touch UI --------------------------
export function tbtns(){ // returns button rects for current scene
  const VW=view.VW, VH=view.VH;
  const s=Math.min(VW,VH); const bs=Math.max(50,s*0.11); const m=14;
  const right=VW-m;
  return {
    attack:{x:right-bs/2, y:VH-m-bs/2, r:bs*0.62, label:"⚔", act:()=>sim.castSpell(0)},
    roll:{x:right-bs*1.5-10, y:VH-m-bs*0.5, r:bs*0.5, label:"↻", act:sim.doRoll},
    s2:{x:right-bs*0.5, y:VH-m-bs*1.7, r:bs*0.44, label:"2", act:()=>sim.castSpell(1)},
    s3:{x:right-bs*1.5-10, y:VH-m-bs*1.9, r:bs*0.44, label:"3", act:()=>sim.castSpell(2)},
    s4:{x:right-bs*2.4-20, y:VH-m-bs*1.1, r:bs*0.44, label:"4", act:()=>sim.castSpell(3)},
    act:{x:right-bs*2.6-20, y:VH-m-bs*0.5, r:bs*0.46, label:"E", act:sim.interact},
    pick:{x:m+bs*0.5, y:VH-m-bs*2.2, r:bs*0.4, label:"F", act:sim.tryPickup},
    bs
  };
}
export function topBtns(){ const VW=view.VW, VH=view.VH; const s=Math.min(VW,VH); const b=Math.max(34,s*0.072); const y=14+b/2; return {
  inv:{x:VW-14-b*0.5, y, r:b*0.5, label:"I", act:()=>{G.scene=G.scene==="inventory"?"play":"inventory";}},
  tal:{x:VW-14-b*1.6, y, r:b*0.5, label:"T", act:()=>{G.scene=G.scene==="talents"?"play":"talents";}}, // CAS-119
  map:{x:VW-14-b*2.7, y, r:b*0.5, label:"M", act:()=>{G.showMap=!G.showMap;}},
  pause:{x:VW-14-b*3.8, y, r:b*0.5, label:"❚❚", act:()=>{G.scene="pause";}}, b }; }

function handleUITap(x,y){
  if(G.scene==="dead"){ sim.respawn(); return true; }
  if(G.scene==="dialogue"){ sim.advanceDialogue(); return true; }
  if(G.scene==="pause"){ return pauseTap(x,y); }
  if(G.scene==="inventory"){ return invTap(x,y); }
  if(G.scene==="talents"){ return talentTap(x,y); }
  if(G.scene==="shop"){ return shopTap(x,y); }
  if(G.scene==="play" && isTouch){
    const tb=tbtns(); for(const k in tb){ const b=tb[k]; if(b.r&&dist2tap(x,y,b.x,b.y)<b.r*b.r){ b.act(); return true; } }
    const top=topBtns(); for(const k in top){ const b=top[k]; if(b.r&&dist2tap(x,y,b.x,b.y)<b.r*b.r){ b.act(); return true; } }
  }
  return false;
}
function dist2tap(ax,ay,bx,by){ const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy; }
// CAS-119 talent keyboard focus (index into the class node list).
function talNodeList(){ return (G.hero && talentNodes(G.hero.cls)) || []; }
function focusStep(d){ const n=talNodeList().length; if(!n) return 0; return (((G.talFocus||0)+d)%n+n)%n; }
function focusedNodeId(){ const ns=talNodeList(); const i=G.talFocus||0; return ns[i]?ns[i].id:null; }
// Tap a talent node rect → spend a point; tap the respec/close chrome rects → act.
// Tapping empty panel space keeps the panel open (unlike inventory) so accidental
// taps near nodes don't dump the player back to play mid-build.
function talentTap(x,y){ for(const r of (ui.talentRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
    if(r.id){ G.talFocus=r.focus!=null?r.focus:G.talFocus; sim.allocTalent(r.id); }
    else if(r.act) r.act();
    return true; } } return true; }
function pauseTap(x,y){ for(const r of ui.pauseRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
function shopTap(x,y){ for(const r of ui.shopRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
// tap a backpack row to select+equip it; tap elsewhere in the panel closes.
function invTap(x,y){ for(const r of (ui.invRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ G.invSel=r.idx; sim.equipBag(r.idx); return true; } } G.scene="play"; return true; }
function menuPlayHit(x,y){ const r=ui.menuPlayRect; return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h; }

// ----------------------------- menu flow -------------------------------
function startGame(){
  let nm=(nameInput.value||"").trim();
  if(nm.length<2){ nameInput.focus(); nameInput.style.borderColor="#c83b3b"; setTimeout(()=>nameInput.style.borderColor=COL.panelB,800); sim.toast(STR.nameTooShort); return; }
  G.pendingName=nm; nameWrap.style.display="none"; G.scene="classsel"; G.classSel=0;
  audio.init(); audio.resume();
}
function chooseClass(cls){ sim.createHero(G.pendingName||"Héroe",cls);
  audio.playMusic("town"); audio.start(); }
function toggleSound(){ audio.setEnabled(!audio.on); }

export function positionNameInput(){ if(!nameWrap) return; const cy=view.VH*0.52; nameWrap.style.top=(cy-26)+"px"; }
// keep the hero-name input visible on the menu (DOM, owned by the controller)
export function syncMenuDom(){
  if(!nameWrap) return;
  if(G.scene==="menu"){ if(nameWrap.style.display!=="block"){ positionNameInput(); nameWrap.style.display="block"; } }
}

// the intent surface the simulation samples each tick (no DOM exposed to sim)
export const io = {
  moveVec, pollPad, aim: faceMouse,
  get isTouch(){ return isTouch; },
  get aimActive(){ return aimActive; },
};

// bind DOM listeners; called once by the orchestrator with the canvas + inputs
export function initInput(cnv){
  canvas = cnv;
  nameWrap = document.getElementById("nameWrap");
  nameInput = document.getElementById("nameInput");
  nameInput.placeholder = STR.namePlaceholder;
  window.addEventListener("touchstart",()=>{ isTouch=true; },{once:true,passive:true});
  addEventListener("keydown",onKeyDown);
  addEventListener("keyup",onKeyUp);
  canvas.addEventListener("pointerdown",onPointerDown);
  canvas.addEventListener("pointermove",onPointerMove);
  canvas.addEventListener("pointerup",onPointerUp);
  canvas.addEventListener("pointercancel",onPointerUp);
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
}
