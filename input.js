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
import { CLASS_LIST, ACTIVE_ABILITIES, ABILITY_MAP, ULTIMATE_MAP, CODEX, TITLES, PACTS, PARRY, COMBO, LOCK_ON, FLASK, SHIELD_BLOCK } from "./sim/config.js";
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
export const ui = { pauseRects:[], shopRects:[], bountyRects:[], bestRects:[], draftRects:[], curseRects:[], ascendRects:[], classRects:[], abilRects:[], abilConfirmRect:{x:0,y:0,w:0,h:0}, talentRects:[], customRects:[], forgeRects:[], titleRects:[], pactRects:[], deadRects:[], altarRects:[], altarAscendConfirm:false, legacyRects:[], legacyChoose:false, invForgeRect:{x:0,y:0,w:0,h:0}, mouseX:0, mouseY:0, menuPlayRect:{x:0,y:0,w:0,h:0}, menuArenaRect:{x:0,y:0,w:0,h:0}, tutSkipRect:{x:0,y:0,w:0,h:0}, classCustomRect:{x:0,y:0,w:0,h:0},
  // CAS-419 inventory DnD: live drag state (render draws the ghost/highlights from it),
  // last rejected drop rect (render shakes it red until `until`, sim time), and the
  // backpack list area rect render publishes so an equip-slot drag can target empty rows.
  invDrag:null, invReject:null, invBagAreaRect:{x:0,y:0,w:0,h:0} };
export const stick = { active:false, id:-1, cx:0, cy:0, x:0, y:0 };
export let isTouch = false;        // live binding consumed by sim (io) + render
let aimActive = false;
// CAS-1873: ESCUDO / BLOQUEO CON GUARDIA — estado HELD del bloqueo (mirror aimActive). Desktop: SHIELD_BLOCK.key
// (ShiftLeft) fija true en keydown / false en keyup. Móvil: el botón HUD hold `tb.block` lo mantiene mientras el
// dedo (blockPointerId) siga abajo. El sim lo lee vía io.blockHeld y fija h.blocking cada fixed-frame (gated).
let blockHeld = false, blockPointerId = -1;
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
  ability1:()=>{ if(!isTouch) faceMouse(); sim.castAbility(0); },   // CAS-1570 drafted ability slots
  ability2:()=>{ if(!isTouch) faceMouse(); sim.castAbility(1); },
  ultimate:()=>{ if(!isTouch) faceMouse(); sim.castUltimate(); },   // CAS-1659 HABILIDAD DEFINITIVA (charge-gated, no mana)
  pickup:()=>sim.tryPickup(), interact:()=>sim.interact(),
  useConsumable:()=>sim.doConsumable(), cycleConsumable:()=>sim.cycleConsumable(1),
  potionHP:()=>sim.doPotionHP(), potionMP:()=>sim.doPotionMP(),
  inventory:()=>{ G.scene="inventory"; }, forge:()=>{ G.scene="forge"; G.forgeSel=G.forgeSel||0; },
  talents:()=>{ G.scene="talents"; G.talFocus=G.talFocus||0; }, mastery:()=>{ G.scene="mastery"; },
  customize:()=>{ G.scene="customize"; G.custFocus=G.custFocus||0; }, map:()=>{ G.showMap=!G.showMap; },
  codex:()=>{ if(CODEX.enabled) G.scene="codex"; }, // CAS-1751: open the Códice de Botín (gated — no-op when disabled)
  titles:()=>{ if(TITLES.enabled) G.scene="titles"; }, // CAS-1758: open the Títulos de Gesta (gated — no-op when disabled)
  pacts:()=>{ if(PACTS.enabled) G.scene="pacts"; }, // CAS-1763: open the Pactos de Poder (gated — no-op when disabled)
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
    if(e.code==="Enter"){ G.pendingArena=false; startGame(); }       // CAS-1664: Enter = normal adventure
    else if(e.code==="KeyA"){ G.pendingArena=true; startGame(); }     // CAS-1664: A = Arena de Oleadas
    return; }
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
  if(G.scene==="abilitysel"){ const c=e.code; const pool=(G.abilPool&&G.abilPool.length)?G.abilPool:ACTIVE_ABILITIES; const n=pool.length;   // CAS-1570 draft / CAS-1580 filtered pool
    const toggle=(i)=>{ if(i<0||i>=n) return; G.abilCursor=i; const id=pool[i].id; const at=G.abilChosen.indexOf(id);
      if(at>=0) G.abilChosen.splice(at,1); else if(G.abilChosen.length<2) G.abilChosen.push(id); };
    if(c==="ArrowLeft"||c==="KeyA") G.abilCursor=(G.abilCursor+n-1)%n;
    else if(c==="ArrowRight"||c==="KeyD") G.abilCursor=(G.abilCursor+1)%n;
    else if(c==="Digit1"||c==="Numpad1") toggle(0);
    else if(c==="Digit2"||c==="Numpad2") toggle(1);
    else if(c==="Digit3"||c==="Numpad3") toggle(2);
    else if(c==="Digit4"||c==="Numpad4") toggle(3);
    else if(c==="Digit5"||c==="Numpad5") toggle(4);
    else if(c==="Space") toggle(G.abilCursor);
    else if(c==="KeyU"){ const un=(G.ultOffer&&G.ultOffer.length)||0; if(un) G.ultSel=((G.ultSel|0)+1)%un; } // CAS-1659: cycle the Ultimate pick
    else if(c==="Enter") confirmLoadout();
    e.preventDefault(); return; }
  const md=moveDir(e.code); if(md){ keys.add(md); e.preventDefault(); }
  edge(e.code);
  // swallow the browser default for any key the game consumes (movement, a bound
  // play action, or the numeric attack alias) so scrolling / find-on-page don't fire.
  // CAS-1847: suprime el default del navegador para la tecla de lock cuando está enabled (Tab mueve el foco del
  // navegador si no se hace preventDefault). OFF ⇒ la condición no añade nada ⇒ byte-idéntico a hoy.
  // CAS-1873: suprime el default del navegador para la tecla de bloqueo cuando está enabled (ShiftLeft es un
  // modificador; sin esto podría interferir con atajos). OFF ⇒ la condición no añade nada ⇒ byte-idéntico a hoy.
  if(md || playAction(e.code) || e.code==="Digit1" || e.code==="Escape" || (LOCK_ON.enabled && e.code===LOCK_ON.key) || (SHIELD_BLOCK.enabled && e.code===SHIELD_BLOCK.key)) e.preventDefault();
}
function onKeyUp(e){ const md=moveDir(e.code); if(md) keys.delete(md);
  // CAS-1873: soltar la tecla de bloqueo BAJA la guardia (HELD). Siempre se limpia (aunque OFF) ⇒ el estado no queda
  // colgado si el knob se apaga con la tecla pulsada. El sim ya gatea h.blocking en enabled, así que esto es inocuo OFF.
  if(e.code===SHIELD_BLOCK.key) blockHeld=false; }
function edge(code){
  // CAS-277: end-of-run recap — PRIMARY "otra ronda" (Space/Enter or the bound attack key)
  // → fresh run; SECONDARY "pueblo/menú" (Escape) → respawn into the calm pause hub.
  if(G.scene==="dead"){ const b=G.settings.binds;
    if(code==="KeyA") G.scene="altar";                       // CAS-1557: open the meta altar
    else if(code==="Space"||code==="Enter"||(b&&code===b.attack)) deadRetry();
    else if(code==="Escape") deadHub();
    return; }
  // CAS-1557: altar scene — Esc/A closes back to the death recap. Number keys 1-5 buy the
  // matching node (sim guards cap + essence), a lightweight keyboard path alongside the taps.
  if(G.scene==="altar"){
    // CAS-1649: the legacy-choice modal (opened after a confirmed ascend) OWNS input — it is a
    // forced choice (like the boon draft, no skip). Number keys pick the matching eligible legacy.
    if(ui.legacyChoose){ if(code.startsWith("Digit")){ const i=(+code.slice(5))-1;
        const ch=(sim.metaSnap().legacyChoices||[])[i]; if(ch){ sim.chooseLegacy(ch.key); ui.legacyChoose=false; } } return; }
    // CAS-1565: while the Ascensión confirm modal is open it owns input — Esc cancels it (not the altar).
    if(ui.altarAscendConfirm){ if(code==="Escape") ui.altarAscendConfirm=false; return; }
    if(code==="Escape"||code==="KeyA") G.scene="dead";
    else if(code.startsWith("Digit")){ const i=(+code.slice(5))-1; const n=sim.META_NODES&&sim.META_NODES[i]; if(n) sim.buyMetaNode(n.key); }
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
  if(G.scene==="inventory"){ const n=G.hero.bag.length; const cols=(ui.invGrid&&ui.invGrid.cols)||5;
    if(code==="KeyI"||code==="Escape") G.scene="play";
    else if(code==="ArrowUp"&&n){ G.invSel=Math.max(0,(G.invSel||0)-cols); }
    else if(code==="ArrowDown"&&n){ G.invSel=Math.min(n-1,(G.invSel||0)+cols); }
    else if(code==="ArrowLeft"&&n){ G.invSel=Math.max(0,(G.invSel||0)-1); }
    else if(code==="ArrowRight"&&n){ G.invSel=Math.min(n-1,(G.invSel||0)+1); }
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
  if(G.scene==="codex"){ if(code==="KeyK"||code==="Escape"){ G.scene="play"; } return; } // CAS-1751: Códice toggle/close
  if(G.scene==="titles"){ if(code==="KeyY"||code==="Escape"){ G.scene="play"; } return; } // CAS-1758: Títulos toggle/close
  if(G.scene==="pacts"){ if(code==="KeyL"||code==="Escape"){ G.scene="play"; } return; } // CAS-1763: Pactos toggle/close
  // CAS-169: wardrobe / customization — C/Escape/Enter close (changes are live + autosaved).
  // ↑/↓ move the focused row; ←/→ change it (cycle swatch on a color row, swap a variation);
  // R restores the class default. Pointer/touch use ui.customRects.
  if(G.scene==="customize"){ const N=6;
    if(code==="KeyC"||code==="Escape"||code==="Enter"){ closeCustomize(); }
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
  // CAS-1751: fixed KeyK alias opens the Códice de Botín (gated — no-op when CODEX.enabled=false). The
  // codex scene's own handler closes it on KeyK/ESC, so K toggles. Not a rebindable action (a read-only panel).
  if(code==="KeyK"){ ACTIONS.codex(); return; }
  // CAS-1758: fixed KeyY alias opens the Títulos de Gesta (gated — no-op when TITLES.enabled=false). Y (not
  // the spec's T, which is already bound to Habilidades/talents) mirrors the read-only Códice's fixed KeyK.
  if(code==="KeyY"){ ACTIONS.titles(); return; }
  // CAS-1763: fixed KeyL alias opens the Pactos de Poder (gated — no-op when PACTS.enabled=false). L is free
  // (K=Códice, Y=Títulos, T=talentos, V=maestría, C=personaje, U=ultimate all taken); mirrors KeyK/KeyY.
  if(code==="KeyL"){ ACTIONS.pacts(); return; }
  // CAS-1785: dedicated KeyH arms the PARADA CON TEMPO (timing parry) — gated on PARRY.enabled, so with
  // the feature off KeyH is inert (falls through, no new state, settings snapshot byte-identical). Not a
  // rebindable action (deliberate: never touches REBINDS/settings.binds). Mirrors the fixed KeyK/KeyY/KeyL.
  if(code==="KeyH" && PARRY.enabled){ sim.tryParry(); return; }
  // CAS-1831: dedicated COMBO.heavyKey (default KeyN) fires the HEAVY attack — gated on COMBO.enabled, so with
  // the feature off the key is inert (falls through, no state change). Not a rebindable action (deliberate, like
  // KeyH parry: never touches REBINDS/settings.binds ⇒ the attack button + settings snapshot stay byte-identical).
  if(code===COMBO.heavyKey && COMBO.enabled){ sim.heavyAttack(); return; }
  // CAS-1847: dedicated LOCK_ON.key (default Tab) fija/cicla el ENFOQUE DE OBJETIVO — gated on LOCK_ON.enabled,
  // so con la feature off la tecla es inerte (falls through, no state change). Not a rebindable action (deliberate,
  // like KeyH parry / COMBO.heavyKey: never touches REBINDS/settings.binds). cycleLock es cross-platform.
  if(code===LOCK_ON.key && LOCK_ON.enabled){ sim.cycleLock(); return; }
  // CAS-1854: dedicated FLASK.key (default KeyU — KeyF ya es pickup) bebe del FRASCO DE CURACIÓN (Estus) — gated on FLASK.enabled, so con
  // la feature off la tecla es inerte (falls through, no state change). Not a rebindable action (deliberate, como
  // KeyH parry / COMBO.heavyKey / LOCK_ON.key: never touches REBINDS/settings.binds). El cancel-on-action se resuelve
  // en el sim (mover/atacar/rodar), así que desktop y móvil comparten la lógica de abortar el trago.
  if(code===FLASK.key && FLASK.enabled){ sim.drinkFlask(); return; }
  // CAS-1873: dedicated SHIELD_BLOCK.key (default ShiftLeft) LEVANTA la guardia mientras se MANTIENE — gated on
  // SHIELD_BLOCK.enabled, so con la feature off la tecla es inerte (falls through, no state change). Es HELD (no edge):
  // fija blockHeld=true aquí y lo baja onKeyUp. No es una acción rebindable (deliberate, como KeyH parry / FLASK.key:
  // never touches REBINDS/settings.binds). El sim decide si la guardia realmente sube (estamina/stun/rolling gate).
  if(code===SHIELD_BLOCK.key && SHIELD_BLOCK.enabled){ blockHeld=true; return; }
  // Digit1 is a FIXED numeric attack alias (always works, regardless of rebinds).
  if(code==="Digit1"){ kbCast(0); } // CAS-347: keyboard attack still aims at the cursor on desktop
}

// ----------------------------- pointer ---------------------------------
function onPointerDown(e){ const r=canvas.getBoundingClientRect(); const x=e.clientX-r.left, y=e.clientY-r.top;
  audio.resume();
  if(G.scene==="menu"){ if(menuArenaHit(x,y)){ G.pendingArena=true; startGame(); } // CAS-1664: Arena de Oleadas entry
    else if(menuPlayHit(x,y)){ G.pendingArena=false; startGame(); } return; }
  if(G.scene==="classsel"){ const pc=ui.classCustomRect; if(pc&&pc.w&&x>=pc.x&&x<=pc.x+pc.w&&y>=pc.y&&y<=pc.y+pc.h){ customizeNewHero(CLASS_LIST[G.classSel]); return; }
    for(const c of ui.classRects){ if(x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h){ chooseClass(c.cls); return; } } return; }
  if(G.scene==="abilitysel"){ // CAS-1570: tap an ability card to toggle it, tap Listo to confirm
    const cf=ui.abilConfirmRect; if(cf&&cf.w&&x>=cf.x&&x<=cf.x+cf.w&&y>=cf.y&&y<=cf.y+cf.h){ confirmLoadout(); return; }
    // CAS-1659: tap one of the 3 offered Ultimate cards to pick it for the run.
    for(const r of (ui.ultRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ G.ultSel=r.idx; return; } }
    for(const r of (ui.abilRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
      const pool=(G.abilPool&&G.abilPool.length)?G.abilPool:ACTIVE_ABILITIES; // CAS-1580 filtered pool
      G.abilCursor=r.idx; const id=pool[r.idx].id; const at=G.abilChosen.indexOf(id);
      if(at>=0) G.abilChosen.splice(at,1); else if(G.abilChosen.length<2) G.abilChosen.push(id); return; } } return; }
  if(G.scene==="inventory"){ invDown(x,y,e.pointerId); return; } // CAS-419: arm DnD / tap-defer
  // CAS-1873: botón táctil HOLD del ESCUDO/BLOQUEO — se resuelve ANTES del dispatch de tap (handleUITap) porque es
  // press-and-hold, no tap: recuerda el pointerId y mantiene blockHeld hasta que ESE dedo se levante (onPointerUp).
  // Gated a play+touch+enabled ⇒ OFF / desktop ni entra. Consume el evento (no dispara un ataque detrás del botón).
  if(isTouch && SHIELD_BLOCK.enabled && G.scene==="play"){ const tb=tbtns();
    if(tb.block && dist2tap(x,y,tb.block.x,tb.block.y)<tb.block.r*tb.block.r){ blockHeld=true; blockPointerId=e.pointerId; return; } }
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
  if(stick.active&&e.pointerId===stick.id){ stick.active=false; } aimActive=false;
  // CAS-1873: levantar el dedo que sostenía el botón de bloqueo BAJA la guardia (HELD táctil).
  if(e.pointerId===blockPointerId){ blockHeld=false; blockPointerId=-1; } }
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
    // CAS-1570: drafted-ability buttons — a distinct LEFT cluster (glyph-labelled) so the
    // two active abilities read separately from the class-spell numbers on the right.
    ab1:{x:m+bs*0.5,  y:VH-m-bs*3.35, r:bs*0.46, label:abilGlyph(0), act:()=>sim.castAbility(0)},
    ab2:{x:m+bs*1.55, y:VH-m-bs*3.35, r:bs*0.46, label:abilGlyph(1), act:()=>sim.castAbility(1)},
    // CAS-1659: Ultimate button — above the ability cluster, distinct star/glyph. Only meaningful
    // (and drawn) when the run has a drafted ultimate; casting no-ops otherwise (charge-gated).
    ult:{x:m+bs*0.5,  y:VH-m-bs*4.45, r:(G.hero&&G.hero.ultId)?bs*0.5:0, label:ultGlyph(), act:()=>sim.castUltimate()},
    // CAS-1854: botón táctil del FRASCO DE CURACIÓN (Estus) — SÓLO cuando FLASK.enabled, así con el knob OFF no hay
    // botón ⇒ el layout de controles es byte-idéntico a HEAD. Mover el joystick durante el trago lo cancela (mismo
    // seam del sim que desktop). Junto al botón de recoger (F) en el cluster izquierdo. $0 arte (glifo procedural).
    ...(FLASK.enabled ? { flask:{x:m+bs*1.55, y:VH-m-bs*2.2, r:bs*0.4, label:"⚕", act:()=>sim.drinkFlask()} } : {}),
    // CAS-1873: botón táctil HOLD del ESCUDO/BLOQUEO CON GUARDIA — SÓLO cuando SHIELD_BLOCK.enabled, así con el knob
    // OFF no hay botón ⇒ el layout de controles es byte-idéntico a HEAD (mirror tb.flask). Es HOLD, no tap: onPointerDown
    // fija blockHeld mientras el dedo siga abajo (ver blockPointerId), onPointerUp lo suelta. `act` no-op (el hold lo
    // maneja el pointer handler, no el dispatch de tap). $0 arte (glifo procedural 🛡). Cluster izquierdo, sobre pick/⚕.
    ...(SHIELD_BLOCK.enabled ? { block:{x:m+bs*2.6, y:VH-m-bs*2.2, r:bs*0.4, label:"🛡", act:()=>{} } } : {}),
    bs
  };
}
// CAS-1570: current drafted-ability glyph for a touch slot (falls back to slot number).
function abilGlyph(slot){ const lo=(G.hero&&G.hero.loadout)||[]; const a=ABILITY_MAP[lo[slot]]; return a?a.glyph:String(slot+1); }
// CAS-1659: current drafted-ultimate glyph for the touch button (falls back to ★).
function ultGlyph(){ const u=G.hero&&ULTIMATE_MAP[G.hero.ultId]; return u?u.glyph:"★"; }
export function topBtns(){ const VW=view.VW, VH=view.VH; const s=Math.min(VW,VH); const b=Math.max(38,s*0.075); const y=14+b/2;
  // CAS-1751: the Códice button only exists when the feature is enabled — with it OFF there is NO HUD
  // affordance at all (byte-identical HUD to a build without the feature). Its presence shifts the row.
  const cdx=CODEX.enabled?1:0;
  // CAS-1758: the Títulos button only exists when the feature is enabled — with it OFF there is NO HUD
  // affordance (byte-identical HUD to a build without the feature). Its presence shifts the row like cdx.
  const ttl=TITLES.enabled?1:0;
  // CAS-1763: the Pactos ⚔ button only exists when the feature is enabled — with it OFF there is NO HUD
  // affordance (byte-identical HUD to a build without the feature). Its presence shifts the row like cdx/ttl.
  const pct=PACTS.enabled?1:0;
  const out={
  inv:{x:VW-14-b*0.5, y, r:b*0.5, label:"I", act:()=>{G.scene=G.scene==="inventory"?"play":"inventory";}},
  tal:{x:VW-14-b*1.6, y, r:b*0.5, label:"T", act:()=>{G.scene=G.scene==="talents"?"play":"talents";}}, // CAS-119
  mst:{x:VW-14-b*2.7, y, r:b*0.5, label:"✦", act:()=>{G.scene=G.scene==="mastery"?"play":"mastery";}}, // CAS-150 mastery track
  cst:{x:VW-14-b*3.8, y, r:b*0.5, label:"♟", act:()=>{G.scene=G.scene==="customize"?"play":"customize"; G.custFocus=G.custFocus||0;}}, // CAS-169 wardrobe
  map:{x:VW-14-b*4.9, y, r:b*0.5, label:"M", act:()=>{G.showMap=!G.showMap;}},
  pause:{x:VW-14-b*(6.0+cdx+ttl+pct), y, r:b*0.5, label:"❚❚", act:()=>{G.scene="pause";}}, b };
  if(cdx) out.cdx={x:VW-14-b*6.0, y, r:b*0.5, label:"◆", act:()=>{G.scene=G.scene==="codex"?"play":"codex";}}; // CAS-1751
  if(ttl) out.ttl={x:VW-14-b*(6.0+cdx), y, r:b*0.5, label:"◈", act:()=>{G.scene=G.scene==="titles"?"play":"titles";}}; // CAS-1758 (sits just left of the Códice ◆)
  if(pct) out.pct={x:VW-14-b*(6.0+cdx+ttl), y, r:b*0.5, label:"⚔", act:()=>{G.scene=G.scene==="pacts"?"play":"pacts";}}; // CAS-1763 (sits just left of the Títulos ◈)
  return out; }

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
  // CAS-1751: insert the Códice row (before "Menú") ONLY when the feature is enabled — with it OFF the
  // sidebar has no Códice affordance (byte-identical chrome to a build without the feature).
  if(CODEX.enabled) items.splice(items.length-1, 0, ["cdx","◆","Códice", ()=>{ G.scene=G.scene==="codex"?"play":"codex"; }]);
  // CAS-1758: insert the Títulos row (before "Menú") ONLY when enabled — with it OFF the sidebar has no
  // Títulos affordance (byte-identical chrome to a build without the feature).
  if(TITLES.enabled) items.splice(items.length-1, 0, ["ttl","◈","Títulos", ()=>{ G.scene=G.scene==="titles"?"play":"titles"; }]);
  // CAS-1763: insert the Pactos row (before "Menú") ONLY when enabled — with it OFF the sidebar has no
  // Pactos affordance (byte-identical chrome to a build without the feature).
  if(PACTS.enabled) items.splice(items.length-1, 0, ["pct","⚔","Pactos", ()=>{ G.scene=G.scene==="pacts"?"play":"pacts"; }]);
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
// CAS-1557: the ALTAR panel taps — a node buy button (key set) buys the next level (sim guards
// cap + essence); the back button (or a miss) returns to the death recap so retry/hub stay live.
function altarTap(x,y){
  // CAS-1649: the legacy-choice modal owns taps while open — a tap on a row grants that legacy
  // and closes the modal. It is a forced choice, so a miss is swallowed (no close).
  if(ui.legacyChoose){ for(const r of (ui.legacyRects||[])){ if(r.key&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
        sim.chooseLegacy(r.key); ui.legacyChoose=false; return true; } } return true; }
  for(const r of (ui.altarRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
      if(r.act==="back"){ G.scene="dead"; return true; }
      // CAS-1565: Ascensión flow — open the confirm modal, then commit/cancel from it.
      if(r.act==="ascend"){ ui.altarAscendConfirm=true; return true; }
      // CAS-1649: a confirmed sacrifice hands off to the legacy-choice modal (agency payoff) rather
      // than just closing — the player picks 1 permanent legacy before returning to the altar.
      if(r.act==="ascendYes"){ sim.ascendMeta(); ui.altarAscendConfirm=false; ui.legacyChoose=true; return true; }
      if(r.act==="ascendNo"){ ui.altarAscendConfirm=false; return true; }
      if(r.key){ sim.buyMetaNode(r.key); return true; } } }
  return true; }

function handleUITap(x,y){
  // CAS-128: tutorial Skip button (pointer + touch). Checked before the play-scene
  // attack so a click on Skip never also triggers a swing.
  if(G.scene==="play" && G.tut && G.tut.active){ const r=ui.tutSkipRect; if(r && r.w && x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ sim.tutSkip(); return true; } }
  // CAS-277: recap taps route through ui.deadRects (primary=retry, secondary=hub). A tap
  // that misses both buttons falls through to retry — preserving the "tap anywhere to go
  // again" feel of the old death screen.
  if(G.scene==="dead"){ for(const r of (ui.deadRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
        if(r.act==="hub") deadHub(); else if(r.act==="altar") G.scene="altar"; else deadRetry(); return true; } } // CAS-1557: "Altar" opens the meta shop
    deadRetry(); return true; }
  if(G.scene==="altar"){ return altarTap(x,y); } // CAS-1557 meta-progression altar
  if(G.scene==="victory"){ sim.dismissVictory(); return true; } // CAS-123: tap to free play
  if(G.scene==="dialogue"){ sim.advanceDialogue(); return true; }
  if(G.scene==="pause"){ return pauseTap(x,y); }
  if(G.scene==="inventory"){ return invTap(x,y); }
  if(G.scene==="talents"){ return talentTap(x,y); }
  if(G.scene==="mastery"){ G.scene="play"; return true; } // CAS-150: tap anywhere closes the read-only track
  if(G.scene==="codex"){ G.scene="play"; return true; } // CAS-1751: tap anywhere closes the read-only Códice
  if(G.scene==="titles"){ return titleTap(x,y); } // CAS-1758: tap an unlocked title equips it; a miss closes the panel
  if(G.scene==="pacts"){ return pactTap(x,y); } // CAS-1763: tap a pact row → +1 rank (wraps at max); a miss closes the panel
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
// CAS-1758: tap an UNLOCKED title cell → equip it (toggle off if already equipped) through the REAL
// sim.equipTitle (validates against unlocked). A tap that misses every cell closes the read-only panel.
function titleTap(x,y){ for(const r of (ui.titleRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
    if(r.id) sim.equipTitle(r.equipped ? null : r.id); // re-tapping the equipped title clears it
    return true; } }
  G.scene="play"; return true; }
// CAS-1763: tap a pact row → advance its rank by 1 (wraps past max back to 0) through the REAL sim.cyclePactRank
// (clamps + marks the store dirty). A tap that misses every row closes the panel (like the read-only Códice).
function pactTap(x,y){ for(const r of (ui.pactRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){
    if(r.id) sim.cyclePactRank(r.id);
    return true; } }
  G.scene="play"; return true; }
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
  // CAS-1594: only arm drag if the slot is occupied; empty grid slots are consumed
  if(row){ if(G.hero.bag[row.idx]) ui.invDrag={kind:"bag", idx:row.idx, x, y, sx:x, sy:y, id:pid, active:false}; return; }
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
  if(!d.active){ // below threshold → tap semantics. CAS-1579: single tap SELECTS (feeds the
    // CAS-117 compare box); DOUBLE-click/tap on the SAME row equips (board: "doble click para
    // equipar"). Drag-to-equip (below) is unchanged. Window uses G.t (game-seconds).
    if(d.kind==="bag"){ const lt=ui.invLastTap; const hasItem=!!G.hero.bag[d.idx];
      if(hasItem&&lt&&lt.idx===d.idx&&(G.t-lt.t)<=0.35){ G.invSel=d.idx; sim.equipBag(d.idx); ui.invLastTap=null; }
      else if(hasItem){ G.invSel=d.idx; ui.invLastTap={idx:d.idx,t:G.t}; }
      else { G.invSel=d.idx; ui.invLastTap=null; } }
    // CAS-1687: a tap on an EQUIPPED functional slot DESENGARZA its last filled socket back to the
    // bag (no-op if the piece has none / bag full). The equip-slot tap had no other action.
    else if(d.kind==="equip"){ sim.unsocketRune(d.slot); }
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
  for(const r of (ui.invRects||[])){ if(x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h){ G.invSel=r.idx; if(G.hero.bag[r.idx]) sim.equipBag(r.idx); return true; } }
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
function menuArenaHit(x,y){ const r=ui.menuArenaRect; return r&&r.w&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h; } // CAS-1664

// ----------------------------- menu flow -------------------------------
function startGame(){
  let nm=(nameInput.value||"").trim();
  if(nm.length<2){ nameInput.focus(); nameInput.style.borderColor="#c83b3b"; setTimeout(()=>nameInput.style.borderColor=COL.panelB,800); sim.toast(STR.nameTooShort); return; }
  G.pendingName=nm; nameWrap.style.display="none"; G.scene="classsel"; G.classSel=0;
  audio.init(); audio.resume();
}
function chooseClass(cls){ sim.createHero(G.pendingName||"Héroe",cls);
  audio.playMusic("town"); audio.setAmbient("town"); audio.start(); openAbilityDraft(); }
// CAS-1570 — open the run-start ability-draft scene (pick 2 of the pool). Seeds the
// selection with the hero's current/default loadout so confirming immediately is valid.
function openAbilityDraft(){ G.needAbilityDraft=false; G.abilCursor=0;
  // CAS-1580: snapshot the FILTERED pool (unlocked abilities only) so render + keyboard + touch all
  // index the SAME list. Seed the selection from the current loadout, keeping only ids still in pool.
  G.abilPool=(sim.draftPool&&sim.draftPool())||ACTIVE_ABILITIES.filter(a=>!a.locked);
  const poolIds=new Set(G.abilPool.map(a=>a.id));
  const lo=(sim.dev.loadout&&sim.dev.loadout())||[]; G.abilChosen=lo.filter(id=>poolIds.has(id)).slice(0,2);
  // CAS-1659: draw the run-start Ultimate offer (3-of-4 via the dedicated ultRng) + default to the
  // first, so the same-scene pick persists and a single confirm still enters play (offer[0]).
  if(sim.openUltimateOffer) sim.openUltimateOffer(); else { G.ultOffer=[]; G.ultSel=0; }
  G.scene="abilitysel"; }
function confirmLoadout(){ if(!G.abilChosen||G.abilChosen.length<2) return;
  sim.dev.setLoadout(G.abilChosen.slice());
  // CAS-1659: bank the drafted Ultimate (default = first offered) for the run before entering play.
  const off=G.ultOffer||[]; if(sim.chooseUltimate) sim.chooseUltimate(off[G.ultSel|0]||off[0]||null);
  G.scene="play"; }
// CAS-169: pick a class but open the wardrobe BEFORE play (createHero spawns the hero
// in town + starts the run audio; we just hold on the customize scene first). "Listo"
// in the wardrobe drops into play.
function customizeNewHero(cls){ sim.createHero(G.pendingName||"Héroe",cls);
  audio.playMusic("town"); audio.setAmbient("town"); audio.start(); G.scene="customize"; G.custFocus=0; G.needAbilityDraft=true; }
// CAS-1570 — leaving the wardrobe: on the NEW-hero path route into the ability draft
// first; a mid-run wardrobe re-open (topBtns) just returns to play.
function closeCustomize(){ if(G.needAbilityDraft){ openAbilityDraft(); } else { G.scene="play"; } }
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
    else if(r.kind==="done"){ closeCustomize(); }
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
  get blockHeld(){ return blockHeld; },   // CAS-1873: estado HELD del bloqueo (ShiftLeft / botón táctil hold) — el sim fija h.blocking desde aquí
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
  // CAS-1594: wheel scroll in inventory bag grid
  canvas.addEventListener("wheel", e=>{
    if(G.scene!=="inventory") return;
    const g=ui.invGrid; if(!g) return;
    const rect=canvas.getBoundingClientRect(), cx=e.clientX-rect.left, cy=e.clientY-rect.top;
    const scale=canvas.width/rect.width;
    if(cx*scale>=g.x&&cx*scale<=g.x+g.w&&cy*scale>=g.y&&cy*scale<=g.y+g.h){
      const dir=e.deltaY>0?1:-1;
      G.invScrollRow=Math.max(0,Math.min(g.maxScrollRow,(G.invScrollRow||0)+dir));
      e.preventDefault(); }
  },{passive:false});
}
