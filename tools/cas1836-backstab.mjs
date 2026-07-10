// ---------------------------------------------------------------------------
// CAS-1837 (build for CAS-1836) — GOLPE POR LA ESPALDA (Backstab / positional crit, knob BACKSTAB). Closes the
// Souls-like loop on the POSITIONING axis (complements the TIMING axis: Telegrafía/Esquiva/Parada/Poise/Combos) and
// turns the Esquiva Rodante (CAS-1814) OFFENSIVE: roll behind an enemy whose facing is COMMITTED (a telegraphed
// wind-up, a lunge, a charge, or a STAGGER) → the rear-arc MELEE hit lands a POSITIONAL crit.
//
// The effect is a single deterministic multiplier in the hitEnemy sink, computed by pure geometry over `e.facing`
// (which already lives and is NOT serialized): a MELEE hit (opt.melee) whose attack vector `ang` enters the enemy's
// REAR ARC (|angDiff(ang,e.facing)| < rearArcDeg/2) deals ×mult dmg + ×knockMul knock. 100% geometry/arithmetic ⇒
// ZERO draws, NO backstabRng (nothing to seed) ⇒ srand BYTE-IDENTICAL ON==OFF even while a backstab fires for real.
// It adds NO field to hero or enemy ⇒ save.v1 byte-identical and NO new key. It STACKS on POISE.bonusDmg (CAS-1826)
// and the rematador (CAS-1831) — the three multiply in the same sink (a rear hit on a staggered élite = the kit peak).
// HARD-GATED: BACKSTAB.enabled=false ⇒ no branch runs ⇒ dmg/knock/VFX/save/srand byte-identical to HEAD.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL dev.backstab* hooks, which exercise
// the REAL hitEnemy path. The live QA (child) re-verifies feel on the deployed build.
//
// Proves:
//   [AC1 OFF]        BACKSTAB.enabled=false ⇒ a rear-arc MELEE hit == a frontal hit (dmg + knock byte-identical), + save byte-id.
//   [AC2 RNG-STRONG] a 48-draw FIXED srand script around a REAL backstab (+ loot kills) is BYTE-IDENTICAL ON vs OFF.
//   [AC3 arc]        a sweep around the 60° rear-arc edge: inside ⇒ ×1.8 dmg + ×1.6 knock; edge+/side/frontal ⇒ ×1 exact.
//   [AC4 melee-only] a rear-arc hit WITHOUT opt.melee (projectile/nova) ⇒ ×1; only the opt.melee rear hit crits.
//   [AC5 stacks]     a rear MELEE hit on a STAGGERED élite = backstab × POISE.bonusDmg × rematador (the three multiply).
//   [AC6 save]       neither hero nor enemy gains a field; save.v1 byte-identical ON/OFF, no backstab key.
//   [REG]            frenzy/parry/dodge/telegraph/abilities/poise/combos srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1836-backstab.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { BACKSTAB } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("BackstabBot", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.backstabMeta();
  if (meta.enabled && meta.rearArcDeg > 0 && meta.mult > 1 && meta.knockMul > 1)
    pass(`content: BACKSTAB knob present (rearArc=${meta.rearArcDeg}° ⇒ ±${meta.rearArcDeg / 2}° behind | dmg×${meta.mult} | knock×${meta.knockMul})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: rear-arc geometry sweep ----------
  const arc = d.backstabArcProbe();
  if (arc && arc.arcOk)
    pass(`AC3 arc: inside the ±${arc.half}° rear arc ⇒ ×${arc.rearMul} dmg (rear0/rear50/edgeIn all ≈${arc.expectMul}); edge+5° / side 90° / frontal 180° ⇒ ×1 EXACT ${J(arc.degs)}`);
  else fail(`AC3 arc geometry wrong: ${J(arc)}`);
  if (arc && arc.knockOk)
    pass(`AC3 knock: a rear-arc hit launches ×${arc.knockRearMul} ≈ knockMul (${arc.expectKnock}) vs a frontal hit — the backstab shoves harder`);
  else fail(`AC3 knock wrong: ${J(arc)}`);

  // ---------- [AC4]: melee-only ----------
  const mo = d.backstabMeleeOnlyProbe();
  if (mo && mo.meleeOnly)
    pass(`AC4 melee-only: a rear-arc RANGED hit ⇒ ×1 (${mo.rangedDmg}hp == frontal ${mo.frontDmg}hp) while the rear-arc MELEE hit ⇒ ×${mo.ratio}≈${mo.expect} (${mo.meleeDmg}hp) — opt.melee gate`);
  else fail(`AC4 melee-only wrong: ${J(mo)}`);

  // ---------- [AC5]: stacks with POISE bonus + rematador ----------
  const st = d.backstabStackProbe();
  if (st && st.stacksOk)
    pass(`AC5 stacks: a rear MELEE hit on a STAGGERED élite lands ×${st.ratio} (${st.fullDmg}hp) = backstab×${st.parts.mult} · POISE×${st.parts.bonus} · REMATE×${st.parts.punish} ≈ ${st.expect} (baseline frontal ${st.baseDmg}hp) — the three multiply`);
  else fail(`AC5 stacking wrong: ${J(st)}`);

  // ---------- [AC1]: OFF ⇒ rear hit == frontal hit ----------
  const off = d.backstabOffProbe();
  if (off && off.offOk)
    pass(`AC1 OFF: with BACKSTAB disabled a rear-arc MELEE hit is byte-identical to a frontal hit — dmg ${off.rearDmg}==${off.frontDmg}, knock ${off.rearKnock}==${off.frontKnock} (no branch runs)`);
  else fail(`AC1 OFF byte-behaviour wrong: ${J(off)}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (backstab FIRING) — ON == OFF ----------
  const SEED = 0x1836c0de, N = 24;
  const rON = d.backstabSrandProbe(true, SEED, N);
  const rOFF = d.backstabSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL backstab + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — the backstab is pure geometry (0 srand draws, no backstabRng) even while it fires`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.backstabFired)
    pass(`AC2: the ON probe DID land a real backstab (rear-arc MELEE ×${meta.mult}) while consuming 0 srand — it exercised the real fire path`);
  else fail(`AC2 backstab did not fire on the ON probe: ${J({ backstabFired: rON.backstabFired })}`);
  const rON2 = d.backstabSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [AC6 SAVE]: no new field, save byte-identical, no key ----------
  const sb = d.backstabSaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC6 SAVE: a fired backstab adds NO field ⇒ save.v1 BYTE-IDENTICAL ON/OFF (len ${sb.onLen}==${sb.offLen}), no backstab key — e.facing already lives, G.enemies is not serialized`);
  else fail(`AC6 SAVE byte-id broke: ${J(sb)}`);

  // ---------- [REG]: existing srand probes stay ON==OFF ----------
  const reg = [
    ["Frenzy",    0x1773c0de, d.frenzySrandProbe],
    ["Parry",     0x1785c0de, d.parrySrandProbe],
    ["Dodge",     0x1814c0de, d.dodgeSrandProbe],
    ["Telegraph", 0x1790c0de, d.telegraphSrandProbe],
    ["Abilities", 0x1819c0de, d.abilitySrandProbe],
    ["Poise",     0x1826c0de, d.poiseSrandProbe],
    ["Combos",    0x1831c0de, d.comboSrandProbe],
  ];
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`);
    else fail(`REG: ${name} srand regressed`);
  }

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1837 backstab harness: ALL PASS" : "\n❌ CAS-1837 backstab harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
