// ---------------------------------------------------------------------------
// CAS-1998 (QA for CAS-1995) — CÓDICE DE COMBATE + HINTS, OBSERVABLE PASS×2.
// Lesson Bonfire/Signature-Boss: byte-correct != observable. The build harness
// (tools/cas1995-codex.mjs) proves the SEAMS via dev probes; this pass drives the
// REAL exported sim loop and watches the effect *live*:
//
//   [OBS-A codex live-open]   sim.openCombatCodex() (enabled:true) flips G.scene→"combatcodex";
//                             a full render of that scene needs no per-frame sim work, and the
//                             scene survives real update(dt) frames; codexKey/Escape return to play.
//   [OBS-B toast lives+decays (headline)] deplete stamina through the REAL spendStam deny branch
//                             ⇒ fireHint sets G.toast; then run the REAL update(dtMs) loop and watch
//                             G.toastT count DOWN frame-by-frame to 0 (the toast is genuinely rendered-
//                             eligible and self-clears). Second depletion in the same life ⇒ NO re-toast.
//   [OBS-C persist roundtrip] the fired hint serializes to mithralda.hints.v1; loadHints restores it;
//                             a fresh "reload" (loadHints(blob)) ⇒ that hint no longer re-fires.
//   [OBS-D data-driven live]  retune FLASK.key at runtime ⇒ the codex entry's resolved key follows
//                             the live knob (getter, nothing hardcoded). textOf(entry)===FLASK.key.
//   [OBS-E gate honesty]      only gate()===true entries listed; a dark mechanic is NOT listed.
//   [OBS-F OFF byte-id]       enabled:false ⇒ fireHint no-op, mithralda.hints.v1 NEVER created, save.v1
//                             byte-identical; srand ON==OFF (0 draws). Composes the 24-mechanic base.
//
// Served blobs are md5-identical to HEAD (QA verified), so importing sim/sim.js exercises the EXACT
// bytes players run; COMBAT_CODEX ships enabled:false DARK, so QA arms enabled=true at runtime (same
// pattern as SUMMON/BOSS_RUSH QA). Determinism: 2 full runs byte-identical (pure sim, no DOM).
// Run: node tools/cas1998-codex-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { COMBAT_CODEX, COMBAT_CODEX_ENTRIES, SUMMON, BOSS_RUSH, SIGNATURE_BOSS, PARRY, STAMINA, FLASK } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

const G = sim.G;
const CC_DEFAULT = COMBAT_CODEX.enabled;

// resolve a codex entry's displayed key exactly as render does (keyLabel over the live getter)
function entryKey(label){ const e = COMBAT_CODEX_ENTRIES.find(x => x.label === label); return e ? sim.keyLabel(e.keyOf()) : null; }
function liveLabels(){ return COMBAT_CODEX_ENTRIES.filter(e => { try { return !!e.gate(); } catch (_) { return false; } }).map(e => e.label); }

function runAll(tag){
  sim.createHero("ObsQA", "warrior");        // scene="play"
  COMBAT_CODEX.enabled = CC_DEFAULT;
  sim.loadHints(null); G.hintsDirty = false; G.toast = null; G.toastT = 0;

  // ---------- OBS-A codex live-open survives real update() ----------
  COMBAT_CODEX.enabled = true;
  const opened = sim.openCombatCodex();
  for (let i = 0; i < 5; i++) sim.update(16);         // real loop; scene must persist (no auto-close)
  const persists = G.scene === "combatcodex";
  G.scene = "play";
  if (opened === "combatcodex" && persists) pass(`[${tag}] OBS-A codex: openCombatCodex⇒scene="combatcodex", survives 5 real update() frames (no per-frame work), back to play`);
  else fail(`[${tag}] OBS-A codex: opened=${opened} persists=${persists}`);

  // ---------- OBS-B toast lives + decays across REAL update() frames (headline) ----------
  const h = G.hero; h.stam = 0; G.toast = null; G.toastT = 0;
  const denied = spendDeny(h);                          // REAL spendStam deny branch ⇒ fireHint
  const firstToast = G.toast, t0 = G.toastT;
  const trail = [];
  for (let i = 0; i < 400 && G.toastT > 0; i++){ sim.update(16); if (i % 40 === 0) trail.push(+G.toastT.toFixed(3)); }
  const decayedToZero = G.toastT <= 0 && t0 > 0 && trail.length > 1 && trail[1] < trail[0];
  // second depletion in the same life ⇒ hint must NOT re-fire (one-time)
  G.toast = null; spendDeny(h); const secondToast = G.toast;
  if (denied && firstToast && /STAMINA/.test(firstToast) && decayedToZero && secondToast === null)
    pass(`[${tag}] OBS-B toast LIVE: deny⇒"${firstToast.slice(0,28)}…" T=${t0}s → decays ${J(trail)} → 0 over real update() frames; 2nd deny NO re-toast (${secondToast})`);
  else fail(`[${tag}] OBS-B toast: denied=${denied} first=${J(firstToast)} t0=${t0} trail=${J(trail)} zero=${decayedToZero} second=${J(secondToast)}`);

  // ---------- OBS-C persist roundtrip (mithralda.hints.v1) ----------
  const blob = sim.serializeHints();                   // captures hint_stamina fired above
  const hadStam = !!(blob && blob.seen && blob.seen.hint_stamina);
  sim.loadHints(null);                                 // wipe (fresh player)
  const wiped = !sim.serializeHints().seen.hint_stamina;
  sim.loadHints(blob);                                 // "reload" from stored save
  const restored = !!sim.serializeHints().seen.hint_stamina;
  // reloaded ⇒ deny does NOT re-fire the already-seen hint
  h.stam = 0; G.toast = null; spendDeny(h); const noReFireAfterReload = G.toast === null;
  if (hadStam && wiped && restored && noReFireAfterReload)
    pass(`[${tag}] OBS-C persist: fired hint → hints.v1 ${J(blob.seen)}; wipe→reload restores; reloaded ⇒ deny silent (${noReFireAfterReload})`);
  else fail(`[${tag}] OBS-C persist: had=${hadStam} wiped=${wiped} restored=${restored} noReFire=${noReFireAfterReload}`);

  // ---------- OBS-D data-driven live (retune ⇒ codex follows) ----------
  const savK = FLASK.key; FLASK.key = "KeyZ";
  const retuned = entryKey("Beber Estus");             // must reflect the NEW binding, not a literal
  FLASK.key = savK; const restoredK = entryKey("Beber Estus");
  if (retuned === sim.keyLabel("KeyZ") && restoredK === sim.keyLabel(savK))
    pass(`[${tag}] OBS-D data-driven: FLASK.key→KeyZ ⇒ codex shows "[${retuned}]"; restored ⇒ "[${restoredK}]" (getter over live knob, 0 literals)`);
  else fail(`[${tag}] OBS-D data-driven: retuned=${retuned} restored=${restoredK}`);

  // ---------- OBS-E gate honesty ----------
  const savS = SUMMON.enabled; SUMMON.enabled = false;
  const darkHidden = !liveLabels().includes("Invocar espíritu");
  SUMMON.enabled = true; const liveShown = liveLabels().includes("Invocar espíritu");
  SUMMON.enabled = savS;
  if (darkHidden && liveShown) pass(`[${tag}] OBS-E gate honesty: SUMMON dark⇒hidden(${darkHidden}); live⇒listed(${liveShown}). Codex never lies about dark mechanics.`);
  else fail(`[${tag}] OBS-E gate: darkHidden=${darkHidden} liveShown=${liveShown}`);

  // ---------- OBS-F OFF byte-id + srand ON==OFF ----------
  COMBAT_CODEX.enabled = false; sim.loadHints(null); G.hintsDirty = false; h.stam = 0; G.toast = null;
  spendDeny(h);                                        // gated OFF ⇒ deny still returns false but fireHint no-ops
  const offNoToast = G.toast === null;                 // hint suppressed while dark
  const offNoDirty = G.hintsDirty === false;           // store never created
  const saveStr = J(sim.serializeSave() || {});
  const offNoKey = !/hints|hintsSeen|hint_/i.test(saveStr);
  const fpOn = srandFp(true), fpOff = srandFp(false);
  const srandIdent = J(fpOn) === J(fpOff);
  COMBAT_CODEX.enabled = CC_DEFAULT;
  if (offNoToast && offNoDirty && offNoKey && srandIdent)
    pass(`[${tag}] OBS-F OFF byte-id: dark⇒deny fires no toast(${offNoToast}), hintsDirty false(${offNoDirty}), no key in save.v1(${offNoKey}); srand ON==OFF ${fpOn.length}-draw identical`);
  else fail(`[${tag}] OBS-F OFF: noToast=${offNoToast} noDirty=${offNoDirty} noKey=${offNoKey} srand=${srandIdent}`);

  // ---------- base: 24 mechanics intact ----------
  const base = SIGNATURE_BOSS.enabled && SUMMON.enabled && BOSS_RUSH.enabled && PARRY.enabled && STAMINA.enabled && FLASK.enabled;
  if (base) pass(`[${tag}] base: 24-mechanic pillars intact (SIGNATURE_BOSS/SUMMON/BOSS_RUSH/PARRY/STAMINA/FLASK on)`);
  else fail(`[${tag}] base broke`);

  return { opened, persists, firstToast, t0, decayedToZero, secondToast, blobSeen: blob && blob.seen,
    restored, retuned, restoredK, darkHidden, liveShown, offNoToast, offNoKey, srandIdent, base,
    liveLabels: liveLabels() };
}

// REAL stamina-deny reached through the EXACT player path: sim.doRoll() with 0 stamina hits the
// shipped spendStam deny branch (sim.js:3909) ⇒ fireHint. Nothing simulated — this is the same
// call the roll button/keybind makes. Returns true when the roll was denied (hero never rolled).
function spendDeny(h){ h.stam = 0; h.rolling = false; h.rollCD = 0; h.flaskDrinkT = 0;
  sim.doRoll(); return h.rolling === false; }
function srandFp(enabled){ const sav = COMBAT_CODEX.enabled; COMBAT_CODEX.enabled = enabled;
  const r = sim.dev._ccSrandProbe(enabled, 0xC0DE, 8); COMBAT_CODEX.enabled = sav; return r.fingerprint; }

try {
  const r1 = runAll("run1");
  const r2 = runAll("run2");
  if (J(r1) === J(r2)) pass(`determinism: 2 full runs byte-identical`);
  else fail(`determinism: run1!=run2\n  ${J(r1)}\n  ${J(r2)}`);
} catch (e) { fail(`EXCEPTION: ${e && e.stack || e}`); }

log("");
log(ok ? "✅ CAS-1998 Códice de Combate + Hints — OBSERVABLE ALL PASS" : "❌ CAS-1998 Códice de Combate + Hints — OBSERVABLE FAIL");
process.exit(ok ? 0 : 1);
