// ---------------------------------------------------------------------------
// CAS-1815 (build for CAS-1814) — ESQUIVA RODANTE (dodge roll con i-frames). A knob-gated REACTIVE
// enhancement of the EXISTING doRoll (CAS-1618), NOT a new mechanic: the roll already dodges (Space),
// already negates ALL damage (melee AND ranged) via the universal i-frame choke in damageHero, and
// already has a transient cooldown (rollCD). With DODGE.enabled the roll derives iframe/cooldown/
// distance from the reactive knob band (vs CFG.roll*), keeping the existing bonuses (bb.iframeAdd +
// metaDashIframe + Estela Ardiente) summed in; render draws a legible invulnerability aura. OFF ⇒
// CFG.rollIFrame/rollCD/rollSpeed EXACT + no aura ⇒ sim + render byte-identical to HEAD.
//
// The roll is 100% timing/input — it opens NO RNG stream (reuses the i-frame that is already 0-RNG),
// so srand is BYTE-IDENTICAL ON vs OFF even when a roll actually FIRES and negates a hit. The cooldown
// reuses rollCD (transient run-state, NOT serialized); the new per-roll speed rides h.rollSpd (also
// transient) → save.v1 byte-identical with or without the flag.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL sim hooks (dev.dodge*).
// The live QA (Deploy child) re-verifies the invuln aura + feel in a real browser.
//
// Proves:
//   [AC1-OFF]       DODGE off ⇒ doRoll uses CFG.rollIFrame/rollCD/rollSpeed EXACT (fresh warrior, sums=0).
//   [AC-derive]     DODGE on  ⇒ iframe=280ms, cd=900ms, speed=distance/rollTime (from the knob band).
//   [AC3-melee]     a roll's i-frame NEGATES a real melee hit (src=enemy); baseline (no roll) lands.
//   [AC3-ranged]    the SAME choke negates a projectile (src=null) — ranged evasion is free.
//   [AC4-cooldown]  a second roll inside the cooldown is a no-op; after it drains the roll re-arms.
//   [AC-RNG-STRONG] a 2×24 FIXED srand script around a REAL roll+negation+loot-kills is BYTE-IDENTICAL
//                   DODGE ON vs OFF — the roll/i-frame path touches NO srand.
//   [AC6-SAVE]      hot roll fields (incl. rollSpd) serialize to the SAME save.v1 bytes as a clean state,
//                   no roll/dodge key; DODGE ON vs OFF ⇒ byte-identical save.
//   [REG]           Parry (CAS-1785) + Frenzy (CAS-1773) srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1814-dodge.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { DODGE, CFG } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that
// touch audio.sfx (doRoll roll sfx, killEnemy loot sfx, perfectDodge roll sfx) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("DodgeBot", "warrior");

  // ---------- content sanity: the knob ----------
  d.dodgeEnable(true);
  const meta = d.dodgeMeta();
  if (meta.enabled && meta.cooldownMs === 900 && meta.iframeMs === 280 && meta.distance === 92)
    pass(`content: DODGE knob present (cd=${meta.cooldownMs}ms iframe=${meta.iframeMs}ms distance=${meta.distance}px)`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC1-OFF]: DODGE off ⇒ CFG.roll* EXACT ----------
  const off = d.dodgeParamsProbe(false);
  if (off.rolling && near(off.iframe, CFG.rollIFrame) && near(off.rollCD, CFG.rollCD) && near(off.rollSpd, CFG.rollSpeed))
    pass(`AC1-OFF: DODGE off ⇒ doRoll uses CFG EXACT (iframe=${off.iframe}==${CFG.rollIFrame}, cd=${off.rollCD}==${CFG.rollCD}, speed=${off.rollSpd}==${CFG.rollSpeed})`);
  else fail(`AC1-OFF params drifted: ${J(off)}`);

  // ---------- [AC-derive]: DODGE on ⇒ knob band ----------
  const on = d.dodgeParamsProbe(true);
  if (on.rolling && near(on.iframe, on.knob.iframe) && near(on.rollCD, on.knob.cd) && near(on.rollSpd, on.knob.spd))
    pass(`AC-derive: DODGE on ⇒ knob band (iframe=${on.iframe}s cd=${on.rollCD}s speed=${on.rollSpd}px/s from distance ${DODGE.distance}/rollTime ${CFG.rollTime})`);
  else fail(`AC-derive params wrong: ${J(on)}`);
  if (on.iframe < off.iframe && on.rollCD > off.rollCD)
    pass(`AC-derive: reactive retune vs HEAD (iframe ${CFG.rollIFrame}→${on.iframe}s shorter, cooldown ${CFG.rollCD}→${on.rollCD}s longer — deliberate reactive tool)`);
  else fail(`AC-derive band direction wrong: iframe ${off.iframe}->${on.iframe} cd ${off.rollCD}->${on.rollCD}`);

  // ---------- [AC3-melee]: roll i-frame negates a real melee hit; baseline lands ----------
  d.dodgeEnable(true);
  const mel = d.dodgeMeleeProbe();
  if (mel.heroDmgBase > 0 && !mel.baseNegated && mel.rolling && mel.negated && mel.heroDmg === 0)
    pass(`AC3-melee: a real melee hit lands for -${mel.heroDmgBase}hp with no roll, but is NEGATED (0 dmg) inside the roll's i-frame`);
  else fail(`AC3-melee broke: ${J(mel)}`);

  // ---------- [AC3-ranged]: the SAME choke negates a projectile (src=null) ----------
  const rng = d.dodgeRangedProbe();
  if (rng.heroDmgBase > 0 && !rng.baseNegated && rng.rolling && rng.negated && rng.heroDmg === 0)
    pass(`AC3-ranged: a projectile (src=null) lands for -${rng.heroDmgBase}hp with no roll, but is NEGATED inside the roll — ranged evasion is free (universal i-frame)`);
  else fail(`AC3-ranged broke: ${J(rng)}`);

  // ---------- [AC4-cooldown]: inside CD ⇒ no-op; after CD ⇒ re-arms ----------
  const cd = d.dodgeCooldownProbe();
  if (cd.armed1 && near(cd.cd, DODGE.cooldownMs / 1000) && cd.blockedInCD && cd.rearmed)
    pass(`AC4-cooldown: first roll arms cd=${cd.cd}s, a second roll inside CD is a no-op, and after the CD drains the roll re-arms`);
  else fail(`AC4-cooldown broke: ${J(cd)}`);

  // ---------- [AC-RNG-STRONG]: 48-draw fixed srand script (with a REAL roll firing) — ON == OFF ----------
  const SEED = 0x1814c0de, N = 24;
  const rON = d.dodgeSrandProbe(true, SEED, N);
  const rOFF = d.dodgeSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL roll+negation + loot kills`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC-RNG (ON==OFF): srand stream BYTE-IDENTICAL DODGE ON vs OFF — the roll/i-frame opens NO RNG stream (0 draws even when it fires)`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 60)} off=${J(rOFF.fingerprint).slice(0, 60)}`);
  if (rON.fired) pass(`AC-RNG: the ON probe DID fire a real roll and negate a hit while consuming 0 srand — proves the probe exercised the real path`);
  else fail(`RNG probe roll did not fire: ${J(rON)}`);
  const rON2 = d.dodgeSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`determinism broke`);

  // ---------- [AC6-SAVE]: hot roll fields (incl rollSpd) ⇒ same save.v1 bytes, no roll/dodge key ----------
  const sb = d.dodgeSaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC6-SAVE: hot roll fields (incl. rollSpd) are BYTE-IDENTICAL to a clean save, no roll/dodge key — transient, out of serializeSave (DODGE ON==OFF)`);
  else fail(`AC6-SAVE byte-id broke: ${J(sb)}`);

  // ---------- [REG]: Parry + Frenzy srand probes stay ON==OFF (no regression from the dodge seams) ----------
  const pr = { on: d.parrySrandProbe(true, 0x1785c0de, 24), off: d.parrySrandProbe(false, 0x1785c0de, 24) };
  if (J(pr.on.fingerprint) === J(pr.off.fingerprint)) pass(`REG: Parry srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Parry srand regressed`);
  const fr = { on: d.frenzySrandProbe(true, 0x1773c0de, 24), off: d.frenzySrandProbe(false, 0x1773c0de, 24) };
  if (J(fr.on.fingerprint) === J(fr.off.fingerprint)) pass(`REG: Frenzy srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Frenzy srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1815 dodge-roll harness: ALL PASS" : "\n❌ CAS-1815 dodge-roll harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
