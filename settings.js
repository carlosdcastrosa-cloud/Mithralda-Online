// ===========================================================================
// settings.js — persistent client SETTINGS controller (CAS-265).
//
// Accessibility + quality-of-life preferences (reduce-motion, colour-blind cues,
// screen-shake, CRT, roll direction, and key REBINDINGS) live on G.settings (a
// presentation-only bag the sim never reads for gameplay — Stage-2 safe). THIS
// controller owns the storage medium (localStorage) + the merge-on-boot, mirroring
// persist.js / audio.js: no web-storage I/O leaks into the sim core.
//
// Deliberately a SEPARATE key from the save blob (like the audio mix) so deleting a
// character ("Nueva partida") never wipes a player's accessibility preferences.
// Every field DEFAULTS to the existing behaviour, so a brand-new player — or anyone
// with no stored settings — sees zero change. All writes are wrapped: private-mode /
// quota failures degrade silently and the game keeps running.
// ===========================================================================
import { G } from "./sim/sim.js";

const KEY = "mithralda.settings.v1";

// The REBINDABLE play-scene action set, with each action's factory-default
// KeyboardEvent.code. Order is the display order in the Controls tab.
// Movement (up/down/left/right) ALSO always accepts the arrow keys as a FIXED
// fallback (see input.js) so a bad rebind can never strand a player without
// movement. Panel-navigation keys (arrows / Enter / Escape inside menus) are
// intentionally NOT rebindable — rebinding only touches the live play scene.
export const REBINDS = [
  { a:"up",              def:"KeyW" },
  { a:"down",            def:"KeyS" },
  { a:"left",            def:"KeyA" },
  { a:"right",           def:"KeyD" },
  { a:"attack",          def:"KeyJ" },
  { a:"roll",            def:"Space" },
  { a:"skill2",          def:"Digit2" },
  { a:"skill3",          def:"Digit3" },
  { a:"skill4",          def:"Digit4" },
  { a:"ability1",        def:"KeyZ" },   // CAS-1570: drafted active-ability slots (Q/E are taken by potion/interact; rebindable here)
  { a:"ability2",        def:"KeyX" },
  { a:"ultimate",        def:"KeyC" },   // CAS-1659: HABILIDAD DEFINITIVA (charge-gated; C freed by moving customize→B)
  { a:"pickup",          def:"KeyF" },
  { a:"interact",        def:"KeyE" },
  { a:"useConsumable",   def:"KeyQ" },
  { a:"cycleConsumable", def:"KeyR" },
  { a:"potionHP",        def:"KeyP" },
  { a:"potionMP",        def:"KeyO" },
  { a:"inventory",       def:"KeyI" },
  { a:"forge",           def:"KeyG" },
  { a:"talents",         def:"KeyT" },
  { a:"mastery",         def:"KeyV" },
  { a:"customize",       def:"KeyB" },   // CAS-1659: moved off C (now Ultimate); wardrobe also opens via its HUD button
  { a:"map",             def:"KeyM" },
  { a:"pause",           def:"Escape" },
];

export function defaultBinds(){ const o={}; for(const r of REBINDS) o[r.a]=r.def; return o; }

// the presentation/accessibility/controls fields we persist — NEVER gameplay state.
function snapshot(){ const s=G.settings; return {
  shake:s.shake, crt:s.crt, rollAim:s.rollAim, reduceMotion:s.reduceMotion,
  colorblind:s.colorblind, hitStop:s.hitStop, flash:s.flash, binds:s.binds }; }

let suppressed = false;
export function save(){
  if(suppressed) return false;
  try{ localStorage.setItem(KEY, JSON.stringify(snapshot())); return true; }
  catch(e){ return false; }       // quota / private mode → fail quiet, game unaffected
}

// Boot: ensure a binds table exists, then merge any STORED settings over the
// defaults already sitting on G.settings. Missing / malformed keys keep their
// current (default) value, so the game's behaviour is unchanged for a fresh player.
export function boot(){
  if(!G.settings.binds) G.settings.binds = defaultBinds();
  let saved = null;
  try{ const raw = localStorage.getItem(KEY); saved = raw ? JSON.parse(raw) : null; }
  catch(e){ saved = null; }        // missing storage OR corrupt JSON → keep defaults
  if(saved && typeof saved === "object"){
    const s = G.settings;
    if(saved.shake === 0 || saved.shake === 1) s.shake = saved.shake;
    if(typeof saved.crt === "boolean") s.crt = saved.crt;
    if(typeof saved.rollAim === "boolean") s.rollAim = saved.rollAim;
    if(typeof saved.reduceMotion === "boolean") s.reduceMotion = saved.reduceMotion;
    if(typeof saved.colorblind === "boolean") s.colorblind = saved.colorblind;
    if(typeof saved.hitStop === "boolean") s.hitStop = saved.hitStop;
    if(typeof saved.flash === "boolean") s.flash = saved.flash;
    if(saved.binds && typeof saved.binds === "object"){
      const b = defaultBinds();    // start from defaults so a partial/old table still binds every action
      for(const r of REBINDS){ const c = saved.binds[r.a]; if(typeof c === "string" && c) b[r.a] = c; }
      s.binds = b;
    }
  }
  if(G.settings.reduceMotion) G.shake = 0;   // honour a persisted reduce-motion immediately
}

// Rebind one action to a key code. If another action already holds that code we
// SWAP (give the displaced action this action's old key) so no action is ever left
// unbound by a remap. Persists immediately.
export function setBind(action, code){
  const b = G.settings.binds || (G.settings.binds = defaultBinds());
  if(!(action in b)) return false;
  const old = b[action];
  for(const k in b){ if(b[k] === code && k !== action) b[k] = old; }
  b[action] = code;
  save();
  return true;
}

export function resetBinds(){ G.settings.binds = defaultBinds(); save(); }
export function suppress(){ suppressed = true; }
