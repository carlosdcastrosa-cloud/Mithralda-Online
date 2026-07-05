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
import { daily } from "./daily.js";   // CAS-134: bounty-board claim actions
import { bestiary } from "./bestiary.js";   // CAS-386: bestiary claim actions
import * as settings from "./settings.js"; // CAS-265: key-rebinding table + persistence
import { analytics } from "./analytics.js"; // CAS-277: fire the CAS-132 retry/return funnel events
import { uiLayout } from "./ui/layout.js";  // CAS-418: drag routing for the canvas widgets (minimap/spell bar)

const G = sim.G;

// ----- shared UI state (read by render, written here / by render) ----------
// CAS-119: talentRects + a live mouse position so the talent panel can hover-describe.
export const ui = { pauseRects:[], shopRects:[], bountyRects:[], bestRects:[], draftRects:[], curseRects:[], ascendRects:[], classRects:[], talentRects:[], customRects:[], forgeRects:[], deadRects:[], invForgeRect:{x:0,y:0,w:0,h:0}, mouseX:0, mouseY:0, menuPlayRect:{x:0,y:0,w:0,h:0}, tutSkipRect:{x:0,y:0,w:0,h:0}, classCustomRect:{x:0,y:0,w:0,h:0},
  // CAS-419 inventory DnD: live drag state (render draws the ghost/highlights from it),
  // last rejected drop rect (render shakes it red until `until`, sim time), and the
  // backpack list area rect render publishes so an equip-slot drag can target empty rows.
  invDrag:null, invReject:null, invBagAreaRect:{x:0,y:0,w:0,h:0} };
export const stick = { active:false, id:-1, cx:0, cy:0, x:0, y:0 };
export let isTouch = false;        // live binding consumed by sim (io) + render
let aimActive = false;
let mouseX = view.VW/2, mouseY = view.VH/2;

const keys = new Set();
// CAS-265: arrow keys are a PERMANENT movement fallback (never rebindable) so a bad
// remap can't strand a player. WASD (or whatever the player bound) comes from
// G.settings.binds via moveDir(); the two are unioned in onKeyDown/onKeyUp.
const ARROW = {ArrowUp:"up", ArrowDown:"down", ArrowLeft:"left", ArrowRight:"right"};
// Map a keydown code → movement direction ("up"/"down"/"left"/"right"), honouring the
// live rebind table plus the fixed arrow fallback. null if the code isn't a move key.
function moveDir(code){ if(ARROW[code]) return ARROW[code];
  const b = G.settings.binds; if(b){ if(code===b.up)return"up"; if(code===b.down)return"down"; if(code===b.left)return"left"; if(code===b.right)return"right"; }
  return null; }
// CAS-265: the rebindable play-scene action verbs. Resolved from the live bind table
// (playAction) so a remap takes effect with no other code change. Movement is handled
// separately (held state, not edge-triggered) and is NOT in this table.
// CAS-347: on desktop a keyboard attack/skill still aims at the cursor (face the mouse the
// instant it fires) — combat aim is unchanged. Only plain locomotion now faces the movement
// vector instead of the cursor. (Mouse-click attacks already faceMouse() in onPointerDown;
// gamepad uses its own dispatch.) On touch, castSpell uses the current movement facing.
const kbCast=(i)=>{ if(!isTouch) faceMouse(); sim.castSpell(i); };
const ACTIONS = {
  attack:()=>kbCast(0), roll:()=>sim.doRoll(),
  skill2:()=>kbCast(1), skill3:()=>kbCast(2), skill4:()=>kbCast(3),
  pickup:()=>sim.tryPickup(), interact:()=>sim.interact(),
  useConsumable:()=>sim.doConsumable(), cycleConsumable:()=>sim.cycleConsumable(1),
  potionHP:()=>sim.doPotionHP(), potionMP:()=>sim.doPotionMP(),
  inventory:()=>{ G.scene="inventory"; }, forge:()=>{ G.scene="forge"; G.forgeSel=G.forgeSel||0; },
  talents:()=>{ G.scene="talents"; G.talFocus=G.talFocus||0; }, mastery:()=>{ G.scene="mastery"; },
  customize:()=>{ G.scene="customize"; G.custFocus=G.custFocus||0; }, map:()=>{ G.showMap=!G.showMap; },
  pause:()=>{ G.scene="pause"; },
};
// Reverse-resolve a keydown code → its bound play-scene action verb (or null).
function playAction(code){ const b=G.settings.binds; if(!b) return null;
  for(const a in ACTIONS){ if(b[a]===code) return a; } return null; }
const press = {}; // edge-triggered

let canvas = null, nameWrap = null, nameInput = null;

// ----------------------------- keyboard --------------------------------
function onKeyDown(e){
  // CAS-265: rebind CAPTURE — when the Controls tab is waiting for a key, the next
  // press (other than Escape, which cancels) becomes that action's binding.
  if(G.rebind){ const code=e.code;
    if(code!=="Escape" && code!=="Tab") settings.setBind(G.rebind, code);
    G.rebind=null; e.preventDefault(); return; }
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
    else if(c==="KeyC") customizeNewHero(CLASS_LIST[G.classSel]); // CAS-169: personalize before play
    else if(c==="Enter"||c==="Space") chooseClass(CLASS_LIST[G.classSel]);
    e.preventDefault(); return; }
  const md=moveDir(e.code); if(md){ keys.add(md); e.preventDefault(); }
  edge(e.code);
  // swallow the browser default for any key the game consumes (movement, a bound
  // play action, or the numeric attack alias) so scrolling / find-on-page don't fire.
  if(md || playAction(e.code) || e.code==="Digit1" || e.code==="Escape") e.preventDefault();
}
function onKeyUp(e){ const md=moveDir(e.code); if(md) keys.delete(md); }
function edge(code){
  // CAS-277: end-of-run recap — PRIMARY "otra ronda" (Space/Enter or the bound attack key)
  // → fresh run; SECONDARY "pueblo/menú" (Escape) → respawn into the calm pause hub.
  if(G.scene==="dead"){ const b=G.settings.binds;
    if(code==="Space"||code==="Enter"||(b&&code===b.attack)) deadRetry();
    else if(code==="Escape") deadHub();
    return; }
  if(G.scene==="victory"){ if(code==="Space"||code==="Enter"||code==="Escape") sim.dismissVictory(); return; } // CAS-123
  if(G.scene==="dialogue"){ if(code==="KeyE"||code==="Space"||code==="Enter") sim.advanceDialogue(); else if(code==="Escape"){G.dialog=null;G.scene="play";} return; }
  if(G.scene==="shop"){ if(code==="Escape"||code==="KeyE"){G.scene="play";G.healShop=false;G.merchantShop=false;}
    else if(code==="ArrowUp"){G.shopSel=(G.shopSel+sim.shopItems().length-1)%sim.shopItems().length;}
    else if(code==="ArrowDown"){G.shopSel=(G.shopSel+1)%sim.shopItems().length;}
    else if(code==="Enter"||code==="Space"){sim.buyItem(G.shopSel);} return; }
  // CAS-134: bounty board — E/Escape close; ↑/↓ pick a contract; Enter/Space claim it;
  // S claims the login-streak reward.
  if(G.scene==="bounty"){ const b=daily.board(); const n=(b&&b.contracts.length)||0;
    if(code==="Escape"||code==="KeyE"){ G.scene="play"; }
    else if(code==="ArrowUp"&&n){ G.bountySel=(((G.bountySel||0)-1)+n)%n; }
    else if(code==="ArrowDown"&&n){ G.bountySel=(((G.bountySel||0)+1))%n; }
    else if((code==="Enter"||code==="Space")&&n){ const c=b.contracts[G.bountySel||0]; if(c) daily.claim(c.id); }
    else if(code==="KeyS"){ daily.claimStreak(); }
    return; }
  // CAS-386: bestiary — E/Escape close; ↑/↓ pick an entry; Enter/Space claims the
  // selected entry's next reached-but-unclaimed mastery tier.
  if(G.scene==="bestiary"){ const b=bestiary.board(); const n=(b&&b.entries.length)||0;
    if(code==="Escape"||code==="KeyE"){ G.scene="play"; }
    else if(code==="ArrowUp"&&n){ G.bestSel=(((G.bestSel||0)-1)+n)%n; }
    else if(code==="ArrowDown"&&n){ G.bestSel=(((G.bestSel||0)+1))%n; }
    else if((code==="Enter"||code==="Space")&&n){ const e=b.entries[G.bestSel||0]; if(e) bestiary.claimNext(e.type); }
    return; }
  // CAS-383: boon draft — ←/→ (or ↑/↓) move the highlight; 1-3 pick directly; Enter/Space picks
  // the highlighted card. No close/skip: a draft always resolves into a boon (that's the reward).
  if(G.scene==="draft"){ const d=G.draft; const n=(d&&d.choices.length)||0; if(!n) return;
    if(code==="ArrowLeft"||code==="ArrowUp"){ G.draftSel=(((G.draftSel||0)-1)+n)%n; if(G.draft) G.draft.sel=G.draftSel; }
    else if(code==="ArrowRight"||code==="ArrowDown"){ G.draftSel=(((G.draftSel||0)+1))%n; if(G.draft) G.draft.sel=G.draftSel; }
    else if(code==="Digit1"||code==="Numpad1"){ sim.pickBoon(0); }
    else if(code==="Digit2"||code==="Numpad2"){ if(n>1) sim.pickBoon(1); }
    else if(code==="Digit3"||code==="Numpad3"){ if(n>2) sim.pickBoon(2); }
    else if(code==="KeyR"){ sim.rerollDraft(); }                 // CAS-392: reroll the whole hand
    else if(code==="KeyB"){ sim.banishBoon(G.draftSel||0); }     // CAS-392: banish the highlighted card
    else if(code==="Enter"||code==="Space"){ sim.pickBoon(G.draftSel||0); }
    return; }
  // CAS-394: zone-modifier offer — A / Enter / Space accepts (harder zone + better reward),
  // Esc / S skips (zone untouched). Both resume play; the offer never re-fires for that zone.
  if(G.scene==="curse"){
    if(code==="KeyA"||code==="Enter"||code==="Space"){ sim.acceptCurse(); }
    else if(code==="Escape"||code==="KeyS"){ sim.skipCurse(); }
    return; }
  // CAS-450: World-Tier ascend offer — A / Enter / Space climbs (world re-arms, harder + richer),
  // Esc / S stays on the current tier. Both resume play; a new offer needs a new full clear.
  if(G.scene==="ascend"){
    if(code==="KeyA"||code==="Enter"||code==="Space"){ sim.acceptAscend(); }
    else if(code==="Escape"||code==="KeyS"){ sim.declineAscend(); }
    return; }
  if(G.scene==="inventory"){ const n=G.hero.bag.length;
    if(code==="KeyI"||code==="Escape") G.scene="play";
    else if(code==="ArrowUp"&&n){ G.invSel=(((G.invSel||0)-1)+n)%n; }
    else if(code==="ArrowDown"&&n){ G.invSel=(((G.invSel||0)+1))%n; }
    else if((code==="Enter"||code==="Space")&&n){ sim.equipBag(G.invSel||0); }
    else if(code==="KeyP"){ sim.doPotionHP(); }
    else if(code==="KeyO"){ sim.doPotionMP(); }
    else if(code==="KeyG"){ G.scene="forge"; G.forgeSel=G.forgeSel||0; } // CAS-237: jump from inventory to the forge
    return; }
  // CAS-237: FORJA panel — G/E/Escape close. ↑/↓ pick a slot; Enter/Space forges it one level
  // through the sim authority. Pointer/touch use ui.forgeRects (tap).
  if(G.scene==="forge"){ const n=3;
    if(code==="KeyG"||code==="KeyE"||code==="Escape"){ G.scene="play"; }
    else if(code==="ArrowUp"){ G.forgeSel=(((G.forgeSel||0)-1)+n)%n; }
    else if(code==="ArrowDown"){ G.forgeSel=(((G.forgeSel||0)+1))%n; }
    else if(code==="Enter"||code==="Space"){ if(sim.forgeUpgrade(["weapon","body","shield"][G.forgeSel||0])) analytics.event("forge_upgrade"); } // CAS-279: count successful Forja upgrades (observation only)
    return; }
  // CAS-119: talent panel — T/Escape close. Keyboard players can spend on the focused
  // node with Enter/Space; arrows move focus. Pointer/touch use ui.talentRects (tap).
  if(G.scene==="talents"){ if(code==="KeyT"||code==="Escape"){ G.scene="play"; }
    else if(code==="ArrowRight"||code==="ArrowDown"){ G.talFocus=focusStep(1); }
    else if(code==="ArrowLeft"||code==="ArrowUp"){ G.talFocus=focusStep(-1); }
    else if(code==="Enter"||code==="Space"){ const id=focusedNodeId(); if(id) sim.allocTalent(id); }
    else if(code==="KeyR"){ sim.respecTalents(); } return; }
  // CAS-150: elite-mastery reward-track panel — V/Escape close (read-only screen).
  if(G.scene==="mastery"){ if(code==="KeyV"||code==="Escape"){ G.scene="play"; } return; }
  // CAS-169: wardrobe / customization — C/Escape/Enter close (changes are live + autosaved).
  // ↑/↓ move the focused row; ←/→ change it (cycle swatch on a color row, swap a variation);
  // R restores the class default. Pointer/touch use ui.customRects.
  if(G.scene==="customize"){ const N=6;
    if(code==="KeyC"||code==="Escape"||code==="Enter"){ G.scene="play"; }
    else if(code==="ArrowUp"){ G.custFocus=((G.custFocus||0)-1+N)%N; }
    else if(code==="ArrowDown"){ G.custFocus=((G.custFocus||0)+1)%N; }
    else if(code==="ArrowLeft"){ custAdjust(-1); }
    else if(code==="ArrowRight"){ custAdjust(1); }
    else if(code==="KeyR"){ sim.resetCustomize(); }
    return; }
  // CAS-265: the pause/settings panel is tab + tap driven (see render.renderPause /
  // pauseTap). Escape closes it (also cancels a pending rebind); everything else is
  // routed through the panel hit-rects so it works identically on touch.
  if(G.scene==="pause"){ if(code==="Escape"){ G.resetArm=false; G.rebind=null; G.scene="play"; } return; }
  if(G.scene!=="play") return;
  // CAS-265: rebindable play-scene actions resolve from G.settings.binds first.
  const act=playAction(code); if(act){ ACTIONS[act](); return; }
  // Digit1 is a FIXED numeric attack alias (always works, regardless of rebinds).
  if(code==="Digit1"){ kbCast(0); } // CAS-347: keyboard attack still aims at the cursor on desktop
}

// ----------------------------- pointer ---------------------------------
function onPointerDown(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
  audio.resume();
  if(G.scene==="menu"){ if(menuPlayHit(x,y)) startGame(); return; }
  if(G.scene==="classsel"){ const pc=ui.classCustomRect; if(pc&&pc.w&&x>=pc.x&&x<=pc.x+pc.w&&y>=pc.y&&y<=pc.y+pc.h){ customizeNewHero(CLASS_LIST[G.classSel]); return; }
    for(const c of ui.classRects){ if(x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h){ chooseClass(c.cls); return; } } return; }
  if(G.scene==="inventory"){ invDown(x,y,e.pointerId); return; } // CAS-419: arm DnD / tap-defer
  if(handleUITap(x,y)) return;
  if(G.scene==="play"){
    // CAS: the fixed left sidebar owns the whole left column — a press there fires its
    // button or is swallowed, never an attack behind the opaque panel.
    if(sidebarTap(x,y)) return;
    // CAS-418 — a press on a movable canvas widget (minimap / spell bar) starts a
    // potential drag and is CONSUMED either way: a click on UI chrome never attacks.
    if(uiLayout.canvasDown(x,y)) return;
    // touch zones: left half = move stick, right half handled by buttons; tap world = attack toward point
    if(isTouch && x<view.VW*0.42){ stick.active=true; stick.id=e.pointerId; stick.cx=x; stick.cy=y; stick.x=x; stick.y=y; }
    else if(!isTouch){ aimActive=true; mouseX=x; mouseY=y; faceMouse(); sim.castSpell(0); }
  }
}
function onPointerMove(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top;
  mouseX=x; mouseY=y; ui.mouseX=x; ui.mouseY=y; // CAS-119: feed the talent panel's hover
  if(uiLayout.canvasMove(x,y)) return;          // CAS-418: live canvas-widget drag owns the pointer
  if(invMove(x,y,e.pointerId)) return;          // CAS-419: live inventory item drag owns the pointer
  if(stick.active && e.pointerId===stick.id){ stick.x=x; stick.y=y; }
  else if(!isTouch && G.scene==="play" && aimActive){ faceMouse(); } // CAS-347: only re-aim to cursor while the mouse is held (aiming); a plain hover no longer swivels the hero — facing follows movement
}
function onPointerUp(e){ uiLayout.canvasUp(); // CAS-418: commit (clamp+persist) a widget drag; no-op otherwise
  invUp(e.pointerId, e.type==="pointercancel"); // CAS-419: resolve drop / deferred tap (cancel = no action)
  if(stick.active&&e.pointerId===stick.id){ stick.active=false; } aimActive=false; }
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
  // CAS-265 touch-comfort pass: raise the base-size floor (50→56) so every action button
  // clears a ~44px comfortable tap target even on the smallest phones; the layout scales
  // uniformly off `bs` (this is the single source render reads too), so spacing is preserved.
  const s=Math.min(VW,VH); const bs=Math.max(56,s*0.115); const m=14;
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
export function topBtns(){ const VW=view.VW, VH=view.VH; const s=Math.min(VW,VH); const b=Math.max(38,s*0.075); const y=14+b/2; return {
  inv:{x:VW-14-b*0.5, y, r:b*0.5, label:"I", act:()=>{G.scene=G.scene==="inventory"?"play":"inventory";}},
  tal:{x:VW-14-b*1.6, y, r:b*0.5, label:"T", act:()=>{G.scene=G.scene==="talents"?"play":"talents";}}, // CAS-119
  mst:{x:VW-14-b*2.7, y, r:b*0.5, label:"✦", act:()=>{G.scene=G.scene==="mastery"?"play":"mastery";}}, // CAS-150 mastery track
  cst:{x:VW-14-b*3.8, y, r:b*0.5, label:"♟", act:()=>{G.scene=G.scene==="customize"?"play":"customize"; G.custFocus=G.custFocus||0;}}, // CAS-169 wardrobe
  map:{x:VW-14-b*4.9, y, r:b*0.5, label:"M", act:()=>{G.showMap=!G.showMap;}},
  pause:{x:VW-14-b*6.0, y, r:b*0.5, label:"❚❚", act:()=>{G.scene="pause";}}, b }; }

// CAS: fixed-sidebar action buttons (desktop, RIGHT side). Single source of the button rects —
// render.js reads this to DRAW them and input hit-tests it to dispatch. Rects are canvas-space
// (the sidebar occupies x∈[view.sbx(), VW]). SIDEBAR_BTN_TOP must clear the vitals + minimap
// render draws above it. Returns null when the sidebar is collapsed (narrow/mobile).
export const SIDEBAR_BTN_TOP=286, SIDEBAR_BTN_H=30, SIDEBAR_BTN_GAP=7;
export function sidebarBtns(){ if(!view.sbw) return null;
  const P=14, x=view.sbx()+P, w=view.sbw-2*P;
  const items=[
    ["inv","🎒","Inventario", ()=>{ G.scene=G.scene==="inventory"?"play":"inventory"; }],
    ["tal","✦","Habilidades", ()=>{ G.scene=G.scene==="talents"?"play":"talents"; }],
    ["mst","★","Maestría",    ()=>{ G.scene=G.scene==="mastery"?"play":"mastery"; }],
    ["cst","♟","Personaje",   ()=>{ G.scene=G.scene==="customize"?"play":"customize"; G.custFocus=G.custFocus||0; }],
    ["map","🗺","Mapa",        ()=>{ G.showMap=!G.showMap; }],
    ["menu","❚❚","Menú",      ()=>{ G.scene="pause"; }],
  ];
  const out={};
  items.forEach(([id,icon,label,act],i)=>{ out[id]={x, y:SIDEBAR_BTN_TOP+i*(SIDEBAR_BTN_H+SIDEBAR_BTN_GAP), w, h:SIDEBAR_BTN_H, icon, label, act}; });
  return out;
}
// hit-test the fixed chrome: any press on the RIGHT sidebar or the BOTTOM bar fires its button
// (if any) and is CONSUMED so it never attacks the world behind the opaque panels.
function sidebarTap(x,y){ if(G.scene!=="play") return false;
  const onSidebar = view.sbw>0 && x>=view.sbx();
  const onBottom  = view.bbh>0 && y>=view.VH-view.bbh && x<view.sbx();
  if(!onSidebar && !onBottom) return false;
  if(onSidebar){
    if(uiLayout.canvasDown(x,y)) return true;   // CAS-466: botones de zoom del minimapa anclado
    const sb=sidebarBtns();
    if(sb) for(const k in sb){ const b=sb[k]; if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){ audio.sfx&&audio.sfx.uiOpen&&audio.sfx.uiOpen(); b.act(); return true; } } }
  return true; // press was on the sidebar / bottom-bar chrome — swallow it
}

// CAS-277: the two end-of-run recap actions. Each fires its CAS-132 funnel event (so the
// "one more run" hook is measurable) then drives the existing sim respawn flow — no new
// game state, no balance touch.
function deadRetry(){ analytics.event("recap_retry"); sim.respawn(); }
function deadHub(){ analytics.event("recap_hub"); sim.returnToHub(); }

function handleUITap(x,y){
  // CAS-128: tutorial Skip button (pointer + touch). Checked before the play-scene
  // attack so a click on Skip never also triggers a swing.
  if(G.scene==="play" && G.tut && G.tut.active){ const r=ui.tutSkipRect; if(r && r.w && x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ sim.tutSkip(); return true; } }
  // CAS-277: recap taps route through ui.deadRects (primary=retry, secondary=hub). A tap
  // that misses both buttons falls through to retry — preserving the "tap anywhere to go
  // again" feel of the old death screen.
  if(G.scene==="dead"){ for(const r of (ui.deadRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
        if(r.act==="hub") deadHub(); else deadRetry(); return true; } }
    deadRetry(); return true; }
  if(G.scene==="victory"){ sim.dismissVictory(); return true; } // CAS-123: tap to free play
  if(G.scene==="dialogue"){ sim.advanceDialogue(); return true; }
  if(G.scene==="pause"){ return pauseTap(x,y); }
  if(G.scene==="inventory"){ return invTap(x,y); }
  if(G.scene==="talents"){ return talentTap(x,y); }
  if(G.scene==="mastery"){ G.scene="play"; return true; } // CAS-150: tap anywhere closes the read-only track
  if(G.scene==="customize"){ return customTap(x,y); } // CAS-169 wardrobe
  if(G.scene==="shop"){ return shopTap(x,y); }
  if(G.scene==="forge"){ return forgeTap(x,y); } // CAS-237
  if(G.scene==="bounty"){ return bountyTap(x,y); }
  if(G.scene==="bestiary"){ return bestiaryTap(x,y); } // CAS-386
  if(G.scene==="draft"){ return draftTap(x,y); } // CAS-383
  if(G.scene==="curse"){ return curseTap(x,y); } // CAS-394
  if(G.scene==="ascend"){ return ascendTap(x,y); } // CAS-450
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
function pauseTap(x,y){ for(const r of ui.pauseRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
  if(r.slider){ r.set(Math.max(0,Math.min(1,(x-r.x)/r.w))); }
  else if(r.tab){ G.setTab=r.tab; G.rebind=null; }                       // CAS-265: switch settings tab
  else if(r.rebind){ G.rebind = (G.rebind===r.rebind)?null:r.rebind; }   // CAS-265: arm/cancel a key rebind
  else if(r.act){ r.act(); }
  return true; } } return true; }
function shopTap(x,y){ for(const r of ui.shopRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
// CAS-134: bounty board taps. Each contract pushes its CLAIM-chip rect BEFORE its
// row-select rect, so a first-match-wins forward scan fires the claim when the tap lands
// on the chip (drawn on top) and only selects the row otherwise.
function bountyTap(x,y){ for(const r of ui.bountyRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
// CAS-386: bestiary taps. Each entry pushes its CLAIM-chip rect BEFORE its row-select
// rect (same first-match-wins scheme as the bounty board), so a tap on the chip claims
// and a tap elsewhere on the row selects it.
function bestiaryTap(x,y){ for(const r of ui.bestRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ r.act(); return true; } } return true; }
// CAS-383: tap a boon card to pick it (highlight follows the tap first, then the pick
// resolves and returns to play). A tap outside all cards is swallowed (draft must resolve).
function draftTap(x,y){
  // CAS-392: reroll + banish chrome is checked BEFORE the card pick (banish badges are drawn ON TOP
  // of the cards, so their small rects must win the tap over the full-card pick rect underneath).
  const rr=ui.draftRerollRect; if(rr&&x>=rr.x&&x<=rr.x+rr.w&&y>=rr.y&&y<=rr.y+rr.h){ sim.rerollDraft(); return true; }
  for(const r of (ui.draftBanishRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ sim.banishBoon(r.idx); return true; } }
  for(const r of ui.draftRects){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ G.draftSel=r.idx; if(G.draft) G.draft.sel=r.idx; sim.pickBoon(r.idx); return true; } } return true; }
// CAS-394: tap Accept / Skip on the zone-modifier offer. A tap outside both buttons is swallowed
// (the offer must resolve one way or the other before play resumes).
function curseTap(x,y){ for(const r of (ui.curseRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
  if(r.act==="accept") sim.acceptCurse(); else sim.skipCurse(); return true; } } return true; }
// CAS-450: tap Ascender / Quedarse on the World-Tier offer. A tap outside both buttons is
// swallowed (the offer must resolve one way or the other before play resumes).
function ascendTap(x,y){ for(const r of (ui.ascendRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
  if(r.act==="accept") sim.acceptAscend(); else sim.declineAscend(); return true; } } return true; }
// CAS-419 — inventory drag & drop. A press on a bag row or an occupied functional
// equip slot ARMS a drag; crossing DRAG_PX activates it (render then draws the ghost
// + target highlights). Release below the threshold falls back to the CAS-226 tap
// (select+equip), so touch/accessibility behaviour is unchanged. Every drop resolves
// through the SAME sim seams the tap path uses (equipBag / moveBag) — DnD is only an
// input path; an incompatible target flashes red (ui.invReject) with zero state change.
const DRAG_PX = 6;
function rectHit(rects,x,y){ for(const r of (rects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h) return r; } return null; }
function invReject(r){ ui.invReject={x:r.x,y:r.y,w:r.w,h:r.h,until:G.t+0.45}; audio.sfx.deny(); }
// press: chrome (Forja) acts immediately; a draggable rect arms the drag; a press on a
// placeholder/empty slot is consumed (CAS-226); empty panel space still closes.
function invDown(x,y,pid){
  const fr=ui.invForgeRect; if(fr&&fr.w&&x>=fr.x&&x<=fr.x+fr.w&&y>=fr.y&&y<=fr.y+fr.h){ G.scene="forge"; G.forgeSel=G.forgeSel||0; return; }
  const row=rectHit(ui.invRects,x,y);
  if(row){ ui.invDrag={kind:"bag", idx:row.idx, x, y, sx:x, sy:y, id:pid, active:false}; return; }
  const sl=rectHit(ui.invSlotRects,x,y);
  if(sl){ if(sl.slot&&sl.inst) ui.invDrag={kind:"equip", slot:sl.slot, x, y, sx:x, sy:y, id:pid, active:false}; return; }
  G.scene="play"; }
function invMove(x,y,pid){ const d=ui.invDrag; if(!d) return false;
  if(G.scene!=="inventory"){ ui.invDrag=null; return false; } // scene left mid-drag (Esc) → drop the drag
  if(pid!==d.id) return true;
  d.x=x; d.y=y;
  if(!d.active && Math.hypot(x-d.sx,y-d.sy)>=DRAG_PX) d.active=true;
  return true; }
function invUp(pid,cancelled){ const d=ui.invDrag; if(!d) return false; if(pid!==d.id) return true;
  ui.invDrag=null; if(cancelled||G.scene!=="inventory") return true;
  const h=G.hero, x=d.x, y=d.y;
  if(!d.active){ // below threshold → the original tap semantics
    if(d.kind==="bag"){ G.invSel=d.idx; sim.equipBag(d.idx); }
    return true; }
  const sl=rectHit(ui.invSlotRects,x,y), row=rectHit(ui.invRects,x,y);
  if(d.kind==="bag"){ const item=h.bag[d.idx]; if(!item) return true;
    if(sl){ if(sl.slot===item.slot){ G.invSel=d.idx; sim.equipBag(d.idx); } else invReject(sl); return true; }
    if(row){ if(row.idx!==d.idx) sim.moveBag(d.idx,row.idx); return true; }
    const ba=ui.invBagAreaRect;
    if(ba.w&&x>=ba.x&&x<=ba.x+ba.w&&y>=ba.y&&y<=ba.y+ba.h){ sim.moveBag(d.idx,-1); return true; }
    return true; } // dropped outside every target → cancel, no state change
  // equip-slot source: dropping on a COMPATIBLE bag item swaps through equipBag (the
  // equipped piece lands in the bag = desequipado, the bag piece equips). Empty bag
  // space is a visual reject: the 3 functional slots are non-nullable in the save
  // shape (loadSave resurrects newHero defaults), so a true unequip-to-empty needs a
  // save migration — proposed separately per the CAS-419 constraint, not shipped here.
  if(row){ const it=h.bag[row.idx];
    if(it&&it.slot===d.slot){ G.invSel=row.idx; sim.equipBag(row.idx); } else invReject(row); return true; }
  if(sl){ if(sl.slot!==d.slot) invReject(sl); return true; } // own slot = cancel
  const ba=ui.invBagAreaRect;
  if(ba.w&&x>=ba.x&&x<=ba.x+ba.w&&y>=ba.y&&y<=ba.y+ba.h) invReject(ba);
  return true; }
// tap a backpack row to select+equip it; tap elsewhere in the panel closes.
// (kept for keyboard-driven scenes routing through handleUITap; pointer presses in the
// inventory are intercepted by invDown BEFORE handleUITap — see onPointerDown.)
function invTap(x,y){
  // CAS-237: the Forja button opens the forge panel.
  const fr=ui.invForgeRect; if(fr&&fr.w&&x>=fr.x&&x<=fr.x+fr.w&&y>=fr.y&&y<=fr.y+fr.h){ G.scene="forge"; G.forgeSel=G.forgeSel||0; return true; }
  for(const r of (ui.invRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ G.invSel=r.idx; sim.equipBag(r.idx); return true; } }
  // CAS-226: taps on the Tibia equip slots are consumed (equipping is driven
  // from the backpack list) so a slot tap doesn't accidentally close the panel.
  for(const r of (ui.invSlotRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h) return true; }
  G.scene="play"; return true; }
// CAS-237: forge taps. Each slot's Forjar button rect is pushed AFTER its row-select rect,
// then the row-select rects are unshifted to the FRONT in render — so a forward scan hits the
// button first when the tap lands on it; otherwise a row tap just moves the selection.
function forgeTap(x,y){ for(const r of (ui.forgeRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
    if(r.act){ const ok=r.act(); if(ok===true && r.slot) analytics.event("forge_upgrade"); } // CAS-279: count successful Forja taps (observation only)
    else if(r.sel!=null) G.forgeSel=r.sel; return true; } } return true; }
function menuPlayHit(x,y){ const r=ui.menuPlayRect; return x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h; }

// ----------------------------- menu flow -------------------------------
function startGame(){
  let nm=(nameInput.value||"").trim();
  if(nm.length<2){ nameInput.focus(); nameInput.style.borderColor="#c83b3b"; setTimeout(()=>nameInput.style.borderColor=COL.panelB,800); sim.toast(STR.nameTooShort); return; }
  G.pendingName=nm; nameWrap.style.display="none"; G.scene="classsel"; G.classSel=0;
  audio.init(); audio.resume();
}
function chooseClass(cls){ sim.createHero(G.pendingName||"Héroe",cls);
  audio.playMusic("town"); audio.setAmbient("town"); audio.start(); }
// CAS-169: pick a class but open the wardrobe BEFORE play (createHero spawns the hero
// in town + starts the run audio; we just hold on the customize scene first). "Listo"
// in the wardrobe drops into play.
function customizeNewHero(cls){ sim.createHero(G.pendingName||"Héroe",cls);
  audio.playMusic("town"); audio.setAmbient("town"); audio.start(); G.scene="customize"; G.custFocus=0; }
// CAS-169: the focus-row keys, mirroring render.js CUST_ROWS order (4 color slots, 2 vars).
const CUST_KEYS=["hood","cloak","sash","legs","headwear","cape"];
function isColorRow(k){ return CUST_KEYS.indexOf(k)<4; }
// ←/→ on the focused row: cycle the swatch palette for a color slot, or swap a variation.
function custAdjust(dir){ const st=sim.customizeState(); if(!st) return;
  const key=CUST_KEYS[G.custFocus||0];
  if(isColorRow(key)){ const sw=st.swatches, cur=st.palette[key];
    let idx=sw.findIndex(c=>c[0]===cur[0]&&c[1]===cur[1]&&c[2]===cur[2]);
    if(idx<0) idx = dir>0?-1:0;                 // off-palette → first step lands on an end
    idx=((idx+dir)%sw.length+sw.length)%sw.length; sim.setPartColor(key, idx);
  } else sim.cycleVariation(key, dir); }
// Wardrobe taps: a swatch sets that slot's color (+ focuses the row), a ‹/› arrow swaps a
// variation, Listo/Restaurar act. Tapping empty space keeps the panel open.
function customTap(x,y){ for(const r of (ui.customRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
    if(r.kind==="swatch"){ G.custFocus=CUST_KEYS.indexOf(r.slot); sim.setPartColor(r.slot, r.ci); }
    else if(r.kind==="var"){ G.custFocus=CUST_KEYS.indexOf(r.key); sim.cycleVariation(r.key, r.dir); }
    else if(r.kind==="done"){ G.scene="play"; }
    else if(r.kind==="reset"){ sim.resetCustomize(); }
    return true; } } return true; }

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
  uiLayout.setPlayCheck(()=>G.scene==="play"); // CAS-418: panels drag ONLY in play
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
