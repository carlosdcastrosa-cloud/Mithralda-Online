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
import { G, serializeSave, loadSave, setTutArm, serializeMeta, loadMeta } from "./sim/sim.js";

const KEY = "mithralda.save.v1";
// CAS-1557: the ACCOUNT-WIDE meta-progression store — deliberately SEPARATE from the run save
// so wiping a character ("Nueva partida") never touches banked Esencia or altar upgrades, and
// vice-versa. Same storage-medium ownership split as the run save: the sim owns the shape
// (serializeMeta / loadMeta), this controller owns localStorage + the write cadence.
const KEY_META = "mithralda.meta.v1";
// CAS-128: a tiny, SEPARATE first-run marker. Set the first time the onboarding
// tutorial finishes or is skipped, so a returning player never gets the tutorial
// auto-started again (even after "Nueva partida" wipes the save). Independent of the
// save blob so it survives a save reset; gameplay never reads it.
const KEY_TUT = "mithralda.tut.v1";
const SAVE_THROTTLE = 2.0;      // seconds between throttled autosaves while in a run
let acc = 0;
let suppressed = false;         // once true, ALL writes are no-ops until the page reloads

export function tutSeen(){ try{ return localStorage.getItem(KEY_TUT)==="1"; }catch(e){ return false; } }
function markTutSeen(){ try{ localStorage.setItem(KEY_TUT,"1"); }catch(e){} }
export function clearTutSeen(){ try{ localStorage.removeItem(KEY_TUT); }catch(e){} } // dev/QA helper

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

// CAS-1557: meta store I/O (isolated from the run save above). All wrapped — a private-mode /
// quota failure degrades silently, the game still runs with the in-memory default meta.
function readMeta(){ try{ const raw=localStorage.getItem(KEY_META); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
export function saveMeta(){ if(suppressed) return false;
  try{ const blob=serializeMeta(); if(!blob) return false; localStorage.setItem(KEY_META, JSON.stringify(blob)); return true; }
  catch(e){ return false; } }
// Rehydrate the account meta at boot (independent of any run save — a brand-new player with no
// character still has a valid, zeroed meta). A corrupt/absent blob → loadMeta installs defaults.
export function bootMeta(){ loadMeta(readMeta()); G.metaDirty=false; }

// Boot: if a VALID save exists, rehydrate straight into play (skipping the name /
// class flow); otherwise leave the normal menu flow untouched. A corrupt, old or
// invalid save is discarded (cleared) and the player starts clean — never crashes.
export function boot(){
  const blob = read();
  const loaded = !!blob && loadSave(blob);
  if(blob && !loaded) clear();                     // version mismatch / bad data → clean start
  // CAS-128: arm the onboarding tutorial ONLY for a true first run — no save loaded AND
  // the tutorial-seen marker unset. A returning player (loaded save, or a veteran who
  // wiped progress) starts straight into play with no tutorial; they can replay it from
  // the pause menu. A save that itself carried an in-progress tutorial resumes it inside
  // loadSave, independent of this arm flag.
  setTutArm(!loaded && !tutSeen());
  return loaded;
}

// Throttled autosave — call once per sim step with the step in SECONDS. Only saves
// while there is a live run to persist, and at most once per SAVE_THROTTLE.
export function tick(dtSec){
  // CAS-1557: flush the account meta the instant it is dirtied (essence banked on death, node
  // bought at the altar) — BEFORE the run-save scene gate, so a buy on the death screen persists
  // even though no run is "live". One-shot: the flag clears on write. Cheap (small blob, rare).
  if(G.metaDirty){ if(saveMeta()) G.metaDirty=false; }
  if(!G.started || G.scene==="menu" || G.scene==="classsel") return;
  // CAS-128: the moment the tutorial is finished/skipped, write the one-time seen marker
  // so it never auto-starts for this player again. flushed gates it to a single write.
  if(G.tut && G.tut.finished && !G.tut.flushed){ markTutSeen(); G.tut.flushed=true; }
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
  const flush = ()=>{ if(G.started) save(); if(G.metaDirty){ if(saveMeta()) G.metaDirty=false; } }; // CAS-1557: meta rides the same unload flush
  window.addEventListener("beforeunload", flush);
  window.addEventListener("pagehide", flush);
  if(typeof document!=="undefined")
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") flush(); });
}
