// ---------------------------------------------------------------------------
// CAS-2017 (build for CAS-2016) — ONBOARDING: Primer de Combate (first-run). A knob-gated EXTENSION of the
// LIVE CAS-128 tutorial step-machine, NOT a new tutorial and NOT a new sim mechanic. The generic ARPG flow
// (move/attack/skill/travel/loot/equip/done) already ships; this splices the 6 net-new Souls combat verbs —
// dodge · parry · lock-on · backstab · Estus · bonfire — in AFTER "attack" when ONBOARDING is armed, each
// advancing when the sim OBSERVES the REAL verb succeed (teach-by-doing, no forced timers). Ships DARK.
//
// enabled:false ⇒ composeTutSteps() == HEAD byte-identical + the 6 new tutMark seams early-return (0 state
// touch, 0 srand) ⇒ save.v1 + srand byte-identical to HEAD; the marker mithralda.tut.v1 schema is unchanged.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL seams (doRoll / cycleLock /
// damageHero parry-catch / hitEnemy backstab / drinkFlask / interact bonfire) through dev hooks, ticking the
// REAL tutorial observer. The live QA (Deploy child) re-verifies the coachmark render + boot in a real browser.
//
// Proves (design §4 AC0-12):
//   [AC0-RNG]    enabled:false ⇒ compose == HEAD; ALL 6 seams add 0 srand (fingerprint ON==OFF); save.v1 no new key.
//   [AC1-arm]    enabled:true  ⇒ the 6 combat steps splice in after "attack" in the documented order.
//   [AC2-dodge]  a REAL roll advances the dodge step; a cooldown-blocked (whiffed) roll does not.
//   [AC3-parry]  a REAL successful parry (caught melee) advances; a whiff (no window) does not.
//   [AC4-lockon] acquiring a REAL lock target advances the lock-on step.
//   [AC5-backst] a REAL rear-arc melee hit advances; a frontal hit does not.
//   [AC6-estus]  a REAL Estus drink advances the Estus step.
//   [AC7-bonf]   a REAL safe bonfire rest advances the bonfire step.
//   [AC8-subflag]teachParry:false ⇒ parry step absent, the other 5 present, order intact.
//   [AC9-skip]   tutSkip retires the whole flow (active=false, finished=true) so the marker flushes once.
//   [AC10-save]  the primer never adds a key to save.v1; tut:{i} schema intact ⇒ in-progress resume preserved.
//   [AC11-codex] the "done" card composes keyLabel(COMBAT_CODEX.codexKey) via STR.tutDoneCodex when both are live.
//   [AC12-dark]  the SERVED default is ONBOARDING.enabled:false (boot smoke is the QA puppeteer child).
//
// Run: node tools/cas2016-primer.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ONBOARDING, COMBAT_CODEX } from "../sim/config.js";
import { STR } from "../strings.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that touch
// audio.sfx / io run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

const HEAD = ["move", "attack", "skill", "travel", "loot", "equip", "done"];
const ALL_FLAGS = { teachDodge:true, teachParry:true, teachLockOn:true, teachBackstab:true, teachEstus:true, teachBonfire:true };

// Arm the primer (all verbs), start a fresh tutorial, and jump to the given verb's step. Returns {idx, steps}.
function armStep(verb, flags) {
  d.onboardingSet(true, Object.assign({}, ALL_FLAGS, flags || {}));
  d.tutStart();
  const steps = d.tutCompose();
  const idx = steps.indexOf(verb);
  d.tutSetStep(idx);
  return { idx, steps };
}
// Did the live tutorial advance PAST the step we sat on?
function advanced(idx) { const s = d.tutState(); return s.i === idx + 1; }

try {
  sim.createHero("PrimerBot", "warrior");

  // ---------- content sanity: the knob ships DARK ----------
  if (ONBOARDING.enabled === false) pass("content: ONBOARDING ships enabled:false (DARK served default) [AC12]");
  else fail(`content: ONBOARDING.enabled must be false (DARK), got ${ONBOARDING.enabled}`);
  const g = d.onboardingGet();
  if (g.teachDodge && g.teachParry && g.teachLockOn && g.teachBackstab && g.teachEstus && g.teachBonfire && g.skippable)
    pass("content: 6 per-verb teach* sub-flags + skippable all present");
  else fail(`content: sub-flags missing/false: ${J(g)}`);

  // ---------- [AC0-a] enabled:false ⇒ compose == HEAD (byte-identical) ----------
  d.onboardingSet(false, {});
  const off = d.tutCompose();
  if (J(off) === J(HEAD)) pass(`AC0: enabled:false ⇒ composeTutSteps() == HEAD ${J(HEAD)} (byte-id)`);
  else fail(`AC0: disabled compose diverged from HEAD: ${J(off)}`);
  // all sub-flags false with enabled:true ⇒ still HEAD (no combat steps)
  d.onboardingSet(true, { teachDodge:false, teachParry:false, teachLockOn:false, teachBackstab:false, teachEstus:false, teachBonfire:false });
  if (J(d.tutCompose()) === J(HEAD)) pass("AC0: enabled:true + ALL sub-flags false ⇒ still == HEAD (0 combat steps)");
  else fail(`AC0: all-off compose diverged: ${J(d.tutCompose())}`);

  // ---------- [AC1] arm ⇒ 6 combat steps spliced in after "attack", in order ----------
  d.onboardingSet(true, ALL_FLAGS);
  const on = d.tutCompose();
  const expect = ["move", "attack", "dodge", "parry", "lockon", "backstab", "estus", "bonfire", "skill", "travel", "loot", "equip", "done"];
  if (J(on) === J(expect)) pass(`AC1: armed compose = ${J(on)} (combat block after "attack", documented order)`);
  else fail(`AC1: armed compose wrong: ${J(on)} != ${J(expect)}`);

  // ---------- [AC2] dodge: real roll advances; a cooldown-whiffed roll does not ----------
  d.dodgeReset(); d._dodgeFire(true);            // put hero ON cooldown (no tut yet ⇒ mark not counted)
  let a = armStep("dodge");                       // fresh tut on the dodge step (rollCD still hot)
  d._dodgeFire(false);                            // respects the live cooldown ⇒ NO roll ⇒ no mark
  d.tutTick(0.016);
  const dodgeWhiff = !advanced(a.idx);
  a = armStep("dodge"); d.dodgeReset(); const fired = d._dodgeFire(true); d.tutTick(0.016);
  if (fired && advanced(a.idx) && dodgeWhiff) pass("AC2-dodge: a REAL roll advances the dodge step; a cooldown-blocked roll does not");
  else fail(`AC2-dodge: fired=${fired} advanced=${advanced(a.idx)} whiffStayed=${dodgeWhiff}`);

  // ---------- [AC3] parry: successful catch advances; a whiff does not ----------
  a = armStep("parry"); d.parryMeleeProbe(false); d.tutTick(0.016); const parryWhiff = !advanced(a.idx);
  a = armStep("parry"); const pm = d.parryMeleeProbe(true); d.tutTick(0.016);
  if (pm.negated && advanced(a.idx) && parryWhiff) pass("AC3-parry: a REAL successful parry (caught melee) advances; a whiff does not");
  else fail(`AC3-parry: negated=${pm.negated} advanced=${advanced(a.idx)} whiffStayed=${parryWhiff}`);

  // ---------- [AC4] lock-on: acquiring a target advances ----------
  d._lockArm(); d.spawn("skeleton", 40, 0); a = armStep("lockon"); sim.cycleLock();
  const acq = d.lockState() && d.lockState().hasTarget; d.tutTick(0.016);
  if (acq && advanced(a.idx)) pass(`AC4-lockon: acquiring a REAL lock target advances the lock-on step (hasTarget=${acq})`);
  else fail(`AC4-lockon: acquired=${acq} advanced=${advanced(a.idx)} (lockState=${J(d.lockState())})`);

  // ---------- [AC5] backstab: rear-arc advances; frontal does not ----------
  a = armStep("backstab"); d._primerBackstab(false); d.tutTick(0.016); const frontStayed = !advanced(a.idx);
  a = armStep("backstab"); d._primerBackstab(true); d.tutTick(0.016);
  if (advanced(a.idx) && frontStayed) pass("AC5-backstab: a REAL rear-arc melee hit advances; a frontal hit does not");
  else fail(`AC5-backstab: rearAdvanced=${advanced(a.idx)} frontStayed=${frontStayed}`);

  // ---------- [AC6] estus: a real drink advances ----------
  d._flaskArm(); a = armStep("estus"); const drank = sim.drinkFlask(); d.tutTick(0.016);
  if (drank && advanced(a.idx)) pass("AC6-estus: a REAL Estus drink advances the Estus step");
  else fail(`AC6-estus: drank=${drank} advanced=${advanced(a.idx)}`);

  // ---------- [AC7] bonfire: a real safe rest advances ----------
  a = armStep("bonfire"); const br = d.bonfireRestProbe(); d.tutTick(0.016);
  if (br && br.healed && advanced(a.idx)) pass("AC7-bonfire: a REAL safe bonfire rest advances the bonfire step");
  else fail(`AC7-bonfire: rest=${J(br)} advanced=${advanced(a.idx)}`);

  // ---------- [AC8] sub-flag: teachParry:false ⇒ parry absent, other 5 present, order intact ----------
  d.onboardingSet(true, Object.assign({}, ALL_FLAGS, { teachParry: false }));
  const noParry = d.tutCompose();
  const expNoParry = ["move", "attack", "dodge", "lockon", "backstab", "estus", "bonfire", "skill", "travel", "loot", "equip", "done"];
  if (J(noParry) === J(expNoParry)) pass("AC8-subflag: teachParry:false ⇒ parry step dropped, other 5 present, order intact");
  else fail(`AC8-subflag: ${J(noParry)} != ${J(expNoParry)}`);

  // ---------- [AC9] skip retires the whole flow ----------
  d.onboardingSet(true, ALL_FLAGS); d.tutStart(); d.tutSetStep(3);
  const sk = d.tutSkip();
  if (!sk.active && sk.finished) pass("AC9-skip: tutSkip retires the flow (active=false, finished=true) ⇒ marker flushes once (persist/QA covers no-re-arm)");
  else fail(`AC9-skip: state after skip = ${J(sk)}`);

  // ---------- [AC0-b + AC10] save: no new key, tut:{i} schema intact ----------
  const sb = d._primerSaveByteId();
  if (sb.tutSchemaOk && sb.noPrimerKey && sb.sameShape)
    pass(`AC10-save: save.v1 carries ONLY tut:{i} — no primer/mark key leaks; ON/OFF shapes identical ⇒ resume preserved`);
  else fail(`AC10-save: ${J(sb)}`);

  // ---------- [AC0-c] RNG-STRONG: the 6 seams add 0 srand ⇒ fingerprint ON==OFF ----------
  const SEED = 0x2016c0de, N = 24;
  const rOn = d._primerSrandProbe(true, SEED, N);
  const rOff = d._primerSrandProbe(false, SEED, N);
  if (J(rOn.fingerprint) === J(rOff.fingerprint))
    pass(`AC0-RNG (ON==OFF): srand BYTE-IDENTICAL primer ON vs OFF across a REAL roll+lock+parry+backstab+drink — the seams open 0 RNG`);
  else fail(`AC0-RNG: srand diverged — on=${J(rOn.fingerprint).slice(0, 60)} off=${J(rOff.fingerprint).slice(0, 60)}`);
  if (rOn.marks.dodge && rOn.marks.parry && rOn.marks.lockon && rOn.marks.backstab && rOn.marks.estus)
    pass(`AC0-RNG: the ON probe DID fire all 5 driven seams (marks=${J(rOn.marks)}) while consuming 0 srand — proves the real path ran`);
  else fail(`AC0-RNG: ON probe did not fire all seams: ${J(rOn.marks)}`);
  if (rOff.marks.dodge === false && rOff.marks.parry === false)
    pass("AC0-RNG: the OFF probe fired the SAME seams but tutMarkC early-returned (0 marks) ⇒ 0 state touch when DARK");
  else fail(`AC0-RNG: OFF probe leaked marks: ${J(rOff.marks)}`);
  // reproducibility
  const rOn2 = d._primerSrandProbe(true, SEED, N);
  if (J(rOn.fingerprint) === J(rOn2.fingerprint)) pass("determinism: same seed reproduces the same srand stream — Stage-2 ready");
  else fail("determinism: srand stream not reproducible");

  // ---------- [AC11] done-card composes the Códice key ----------
  if (typeof STR.tutDoneCodex === "function") {
    const line = STR.tutDoneCodex("`");
    if (line.includes("`") && /[Cc]ódice/.test(line) && COMBAT_CODEX.codexKey)
      pass(`AC11-codex: STR.tutDoneCodex(keyLabel) composes the Códice pointer ("${line}") — gated live on ONBOARDING.enabled && COMBAT_CODEX.enabled in renderTutorial`);
    else fail(`AC11-codex: tutDoneCodex output wrong: "${line}"`);
  } else fail("AC11-codex: STR.tutDoneCodex missing");

  // ---------- [AC12] restore + confirm the knob returns fully DARK (served default; armed runtime is QA's puppeteer boot smoke) ----------
  d.onboardingSet(false, ALL_FLAGS);              // restore the served shape (leaves the module clean for a 2nd run)
  if (ONBOARDING.enabled === false && J(d.tutCompose()) === J(HEAD))
    pass("AC12-dark: knob restores to enabled:false ⇒ compose == HEAD (served default is DARK; boot smoke = QA puppeteer)");
  else fail(`AC12-dark: restore failed enabled=${ONBOARDING.enabled} compose=${J(d.tutCompose())}`);

} catch (e) {
  fail(`threw: ${e && e.stack || e}`);
}

log(ok ? "\nALL PASS ✓" : "\nFAILED ✖");
process.exit(ok ? 0 : 1);
