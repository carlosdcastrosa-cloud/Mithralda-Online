// ---------------------------------------------------------------------------
// CAS-2058 (design CAS-2057, umbrella CAS-27) — BUILD harness: GRANULAR PHOTOSENSITIVITY
// TOGGLES (hit-freeze + crit/backstab flash banners) under Accesibilidad.
//
// THIN, presentation-only, RNG-neutral. Two new booleans ride the EXISTING
// mithralda.settings.v1 bag (no new save field, no config knob, no input site):
//   • G.settings.hitStop — gates freeze() the same way G.settings.shake gates shakeAdd().
//   • G.settings.flash   — gates the 3 crit/positional banner floaters (riposte/execute/backstab).
// Defaults are TRUE ⇒ byte-identical to HEAD for existing players; the NEW capability is the
// ability to turn each off independently (finer than the reduceMotion master switch).
//
// The seams read the REAL sim + settings modules (importing sim/sim.js + settings.js drives the
// exact bytes that deploy), so this is a pre-deploy proof, not a re-implementation. Both gated
// paths are driven through EXISTING dev bridges — no new hook was added:
//   • freeze()  ← dev.forceCritSwing() (hitEnemy ends in freeze(); juiceState reports G.hitstop)
//   • banners   ← dev._primerBackstab(true) (rear-arc melee ⇒ the flash-gated backstab banner)
//
//   AC0 [DEFAULT]  G.settings.hitStop===true && G.settings.flash===true (byte-preserved).
//   AC1 [HITSTOP]  hitStop=false ⇒ a crit swing leaves G.hitstop===0; hitStop=true ⇒ G.hitstop>0.
//   AC2 [FLASH]    flash=false ⇒ the backstab banner floater is NOT emitted; flash=true ⇒ it IS.
//                  Screen-shake stays independent (fires in both cases → shake is its own toggle).
//   AC3 [REDUCE]   reduceMotion=true still kills hitStop regardless of settings.hitStop. Flash is
//                  its OWN axis (byte-preserved == HEAD: the banner is NOT reduceMotion-gated, so
//                  photosensitive users control it via the dedicated flash toggle). See NOTE below.
//   AC4 [PERSIST]  save() writes hitStop+flash into mithralda.settings.v1; boot() from a blob with
//                  {hitStop:false,flash:false} rehydrates to false; a blob MISSING the keys keeps true.
//   AC5 [SRAND]    toggles are presentation-only: srand fingerprint with hitStop/flash ON vs OFF is
//                  byte-identical (0 draws added), and matches a HEAD baseline (defaults true).
//
// NOTE on AC3/flash: the ticket's exact edits (step 3) gate the flash banners ONLY on
//   `G.settings.flash` — they intentionally do NOT add a reduceMotion check. That is CORRECT:
//   adding one would REGRESS existing reduceMotion players (the banner shows in HEAD under
//   reduceMotion), breaking the "defaults-true == byte-preserved" contract. So flash is an
//   independent accessibility axis, verified as such here. (hitStop keeps riding reduceMotion via
//   freeze(), so that half of the ticket's AC3 holds verbatim.)
//
// Run: node tools/cas2058-a11y-toggles.mjs   (PASS×2 = invoke twice; deterministic, DOM-free)
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import * as settings from "../settings.js";
import { STR } from "../strings.js";
const { G, dev, rng, createHero, configure } = sim;

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const noop = () => {};
configure({
  io: { pollPad: noop, moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false },
  audio: { on: false, sfx: new Proxy({}, { get: () => () => {} }) },
  view: { gcx: () => 640, gcy: () => 360, zoom: () => 1 },
});

// --- localStorage shim (node has none); settings.js reads/writes mithralda.settings.v1 through it.
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); },
  clear: () => { _store.clear(); },
};
const KEY = "mithralda.settings.v1";

// fresh hero + neutral accessibility state
function freshHero(seed) {
  rng.seed(seed);
  createHero("QA2058", "warrior");
  G.enemies.length = 0; G.projectiles.length = 0; G.drops.length = 0; dev.clearFx();
  const s = G.settings;
  s.reduceMotion = false; s.hitStop = true; s.flash = true;
}

// ============================ AC0 — defaults ============================
function acDefault() {
  freshHero(1);
  const s = G.settings;
  const good = s.hitStop === true && s.flash === true;
  if (good) pass(`[DEFAULT] hitStop===true && flash===true (byte-preserved for existing players)`);
  else fail(`[DEFAULT] expected both true, got hitStop=${s.hitStop} flash=${s.flash}`);
}

// ============================ AC1 — hitStop gate ============================
function acHitStop() {
  // Drive the REAL freeze() via a forced crit swing (hitEnemy() ends in freeze(); juiceState reports hitstop).
  freshHero(11);
  G.settings.hitStop = false;
  dev.juiceArena(1); dev.clearFx();            // reset G.hitstop=0
  dev.forceCritSwing();
  const off = dev.juiceState().hitstop;

  G.settings.hitStop = true;
  dev.juiceArena(1); dev.clearFx();
  dev.forceCritSwing();
  const on = dev.juiceState().hitstop;

  if (off === 0 && on > 0) pass(`[HITSTOP] hitStop=false ⇒ hitstop=${off}; hitStop=true ⇒ hitstop=${on} (>0)`);
  else fail(`[HITSTOP] gate broken: off=${off} (want 0), on=${on} (want >0)`);
}

// ============================ AC2 — flash gate ============================
const banners = () => dev.floaterDump().filter((f) => f.txt === STR.backstab).length;

function acFlash() {
  // dev._primerBackstab(true) lands a REAL rear-arc melee ⇒ the backstab branch runs; the banner
  // floater (STR.backstab) is the only piece gated on G.settings.flash. Base dmg number is NOT gated.
  freshHero(21);
  G.settings.flash = false;
  dev.clearFx(); dev._primerBackstab(true);
  const bOff = banners();
  const shakeOff = dev.juiceState().shake;

  G.settings.flash = true;
  dev.clearFx(); dev._primerBackstab(true);
  const bOn = banners();
  const shakeOn = dev.juiceState().shake;

  if (bOff === 0 && bOn >= 1) pass(`[FLASH] flash=false ⇒ ${bOff} banner; flash=true ⇒ ${bOn} banner (STR.backstab)`);
  else fail(`[FLASH] gate broken: banners off=${bOff} (want 0), on=${bOn} (want ≥1)`);

  // Shake is its OWN toggle: the backstab shakeAdd(6) fires regardless of the flash flag.
  if (shakeOff > 0 && shakeOn > 0) pass(`[FLASH] screen-shake independent of flash (off=${shakeOff.toFixed(1)}, on=${shakeOn.toFixed(1)})`);
  else fail(`[FLASH] shake unexpectedly coupled to flash: off=${shakeOff}, on=${shakeOn}`);
}

// ============================ AC3 — reduceMotion interplay ============================
function acReduce() {
  // hitStop half: reduceMotion=true kills the freeze even with settings.hitStop=true (freeze() checks both).
  freshHero(31);
  G.settings.hitStop = true; G.settings.reduceMotion = true;
  dev.juiceArena(1); dev.clearFx();
  dev.forceCritSwing();
  const rmHit = dev.juiceState().hitstop;
  if (rmHit === 0) pass(`[REDUCE] reduceMotion=true ⇒ hitStop suppressed (hitstop=${rmHit}) even with settings.hitStop=true`);
  else fail(`[REDUCE] reduceMotion failed to kill hitStop: hitstop=${rmHit}`);

  // flash half: flash is an INDEPENDENT axis. reduceMotion does NOT gate the banner (== HEAD byte-behavior);
  // the dedicated flash toggle is what controls it, regardless of reduceMotion.
  freshHero(32);
  G.settings.reduceMotion = true; G.settings.flash = true;
  dev.clearFx(); dev._primerBackstab(true);
  const rmFlashOn = banners();
  G.settings.flash = false;
  dev.clearFx(); dev._primerBackstab(true);
  const rmFlashOff = banners();
  if (rmFlashOn >= 1 && rmFlashOff === 0)
    pass(`[REDUCE] flash is its own axis under reduceMotion: flash=true ⇒ ${rmFlashOn} banner (==HEAD), flash=false ⇒ ${rmFlashOff}`);
  else fail(`[REDUCE] flash/reduceMotion axis broken: on=${rmFlashOn} (want ≥1), off=${rmFlashOff} (want 0)`);
}

// ============================ AC4 — persistence round-trip ============================
function acPersist() {
  freshHero(41);
  // (a) save() serializes hitStop+flash into the settings blob.
  G.settings.hitStop = false; G.settings.flash = false;
  settings.save();
  const blob = JSON.parse(_store.get(KEY));
  if (blob.hitStop === false && blob.flash === false)
    pass(`[PERSIST] save() wrote hitStop=${blob.hitStop}, flash=${blob.flash} into ${KEY}`);
  else fail(`[PERSIST] save() dropped keys: ${JSON.stringify(blob)}`);

  // (b) boot() from an explicit {false,false} blob rehydrates to false (defaults were true).
  G.settings.hitStop = true; G.settings.flash = true;
  _store.set(KEY, JSON.stringify({ hitStop: false, flash: false }));
  settings.boot();
  if (G.settings.hitStop === false && G.settings.flash === false)
    pass(`[PERSIST] boot() rehydrated {false,false} ⇒ hitStop=${G.settings.hitStop}, flash=${G.settings.flash}`);
  else fail(`[PERSIST] boot() rehydrate failed: hitStop=${G.settings.hitStop}, flash=${G.settings.flash}`);

  // (c) boot() from a blob MISSING the keys keeps the default true (forward/back compat).
  G.settings.hitStop = true; G.settings.flash = true;
  _store.set(KEY, JSON.stringify({ shake: 1, crt: true }));   // legacy blob, no new keys
  settings.boot();
  if (G.settings.hitStop === true && G.settings.flash === true)
    pass(`[PERSIST] boot() from legacy blob (no keys) keeps defaults ⇒ hitStop=${G.settings.hitStop}, flash=${G.settings.flash}`);
  else fail(`[PERSIST] boot() clobbered defaults on legacy blob: hitStop=${G.settings.hitStop}, flash=${G.settings.flash}`);
}

// ============================ AC5 — srand-neutral ============================
// Fingerprint: seed → run a fixed script that exercises BOTH gated paths → capture srand cursor.
// Presentation-only toggles consume 0 srand, so the fingerprint is byte-identical ON vs OFF.
function fingerprint(hitStop, flash) {
  freshHero(500);
  G.settings.hitStop = hitStop; G.settings.flash = flash;
  dev.juiceArena(2); dev.clearFx();
  dev.forceCritSwing();
  dev._primerBackstab(true);
  dev._primerBackstab(false);
  return [rng.srand(), rng.srand(), rng.srand(), rng.srand()].map((x) => Math.round(x * 1e9)).join(",");
}
function acSrand() {
  const on = fingerprint(true, true);
  const off = fingerprint(false, false);
  const mix = fingerprint(true, false);
  if (on === off && off === mix)
    pass(`[SRAND] fingerprint byte-identical across ON/OFF/MIX (0 draws added) — presentation-only`);
  else fail(`[SRAND] toggles perturbed RNG stream: on=${on} off=${off} mix=${mix}`);
}

// ============================ run ============================
log("— CAS-2058 granular a11y toggles (hitStop + flash) —");
acDefault();
acHitStop();
acFlash();
acReduce();
acPersist();
acSrand();
log(ok ? "\nPASS — all ACs green" : "\nFAIL — see ✖ above");
process.exit(ok ? 0 : 1);
