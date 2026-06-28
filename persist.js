// ===========================================================================
// persist.js — client-side progression persistence (CAS-113).
//
// The deterministic sim owns SERIALIZATION (serializeSave / loadSave in
// sim/sim.js); THIS controller owns the storage medium (localStorage) and the
// save cadence, so no DOM / web-storage I/O ever leaks into the sim core. A
// Stage-2 build swaps this file for a server sync without touching gameplay.
//
// Cadence: a throttled autosave (never per-frame) + a flush on tab hide/unload
// so the latest gold / XP / upgrades survive a refresh. All storage calls are
// wrapped — private-mode / quota failures degrade silently, the game still runs.
// ===========================================================================
import { G, serializeSave, loadSave } from "./sim/sim.js";

const KEY = "mithralda.save.v1";
const SAVE_THROTTLE = 2.0;      // seconds between throttled autosaves while in a run
let acc = 0;
let suppressed = false;         // once true, ALL writes are no-ops until the page reloads

function read(){
  try{ const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }       // missing storage OR corrupt JSON → treated as "no save"
}
// Stop all further writes for the remainder of this page life. resetGame() arms it
// so the unload-flush can't re-save the run we are deliberately wiping right before
// a reload (the new page starts with suppressed=false, so saving resumes normally).
export function suppress(){ suppressed = true; }
export function save(){
  if(suppressed) return false;
  try{ const blob = serializeSave(); if(!blob) return false;
    localStorage.setItem(KEY, JSON.stringify(blob)); return true; }
  catch(e){ return false; }       // quota / private mode → fail quiet, gameplay unaffected
}
export function clear(){ try{ localStorage.removeItem(KEY); }catch(e){} }
export function hasSave(){ return !!read(); }

// Boot: if a VALID save exists, rehydrate straight into play (skipping the name /
// class flow); otherwise leave the normal menu flow untouched. A corrupt, old or
// invalid save is discarded (cleared) and the player starts clean — never crashes.
export function boot(){
  const blob = read();
  if(!blob) return false;
  if(!loadSave(blob)){ clear(); return false; }   // version mismatch / bad data → clean start
  return true;
}

// Throttled autosave — call once per sim step with the step in SECONDS. Only saves
// while there is a live run to persist, and at most once per SAVE_THROTTLE.
export function tick(dtSec){
  if(!G.started || G.scene==="menu" || G.scene==="classsel") return;
  acc += dtSec;
  if(acc >= SAVE_THROTTLE){ acc = 0; save(); }
}

// Full reset ("Nueva partida"): wipe the save and reload to the fresh menu flow —
// the simplest robust path (no partial state to untangle).
export function resetGame(){ suppress(); clear(); try{ if(typeof location!=="undefined") location.reload(); }catch(e){} }

// Flush the latest state on tab hide / unload so a refresh never loses the last
// few seconds of progress between throttled autosaves.
export function initFlush(){
  if(typeof window==="undefined") return;
  const flush = ()=>{ if(G.started) save(); };
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  if(typeof document!=="undefined")
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flush(); });
}
