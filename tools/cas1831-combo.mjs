// ---------------------------------------------------------------------------
// CAS-1832 (build for CAS-1831) — SISTEMA DE COMBOS / MOVESET con rematador anti-Stagger. Closes the Souls-like
// loop on the OFFENSIVE side: a light chain L→L→L (the chainLen-th swing is the FINISHER: +dmg/+knockback + feeds
// POISE heavy), a dedicated HEAVY attack (slower, harder, the natural stagger-break), and the REMATADOR — a ×extra
// on a MELEE hit against an enemy inside its STAGGER window (e.staggerT>0 from CAS-1826), STACKING on POISE.bonusDmg.
//
// 100% TIMING/INPUT: the chain advances by a time window and the rematador by an arithmetic threshold ⇒ ZERO draws,
// NO comboRng (nothing to seed) ⇒ the srand fingerprint is BYTE-IDENTICAL ON==OFF even while the combo fires for real.
// State (comboCount/comboT) is transient hero run-state (mirror frenzyStacks) ⇒ serializeSave (allowlist) excludes it
// ⇒ save.v1 byte-identical and NO new mithralda.combo.* key. HARD-GATED: COMBO.enabled=false ⇒ no branch runs, the
// attack button + heavy key are inert ⇒ byte-identical to HEAD.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL dev.combo* hooks, which exercise the
// REAL heroAttack / heavyAttack / applyHeroMelee / hitEnemy / tickCombo paths. The live QA (child) re-verifies feel.
//
// Proves:
//   [AC1 OFF]        COMBO.enabled=false ⇒ save.v1 byte-identical + swing sequence identical (no finisher/punish, heavy inert).
//   [AC2 RNG-STRONG] a 2×24 FIXED srand script around a REAL finisher + a REAL rematador (+ heavy) is BYTE-IDENTICAL ON vs OFF.
//   [AC3 chain]      3 swings within windowMs ⇒ 3rd is the finisher (dmg×finisherMul, knock×finisherKnock); 4th resets.
//   [AC4 expire]     a gap > windowMs (ticked) cools the chain ⇒ count→0; next swing is a fresh count=1, no finisher.
//   [AC5 heavy]      the heavy swing: slower cd (×heavyCdMul), harder (×heavyDmgMul), feeds POISE heavy (gain.heavy>light).
//   [AC6 rematador]  a MELEE hit on a staggered enemy ⇒ dmg×staggerPunishMul + VFX, STACKING on POISE.bonusDmg.
//   [AC7 melee-only] a ranged class swing does NOT chain; a ranged hit on a staggered enemy gets NO rematador.
//   [AC8 synergy]    FRENZY dmg mult still multiplies a finisher; PARRY riposte still multiplies a hit (no regression).
//   [AC9 no-persist] a HOT chain ⇒ save.v1 byte-identical, no combo key (transient).
//   [REG]            Parry + Dodge + Telegraph + Abilities + Poise srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1831-combo.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { COMBO } from "../sim/config.js";

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
  sim.createHero("ComboBot", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.comboMeta();
  if (meta.enabled && meta.chainLen >= 2 && meta.finisherMul > 1 && meta.staggerPunishMul > 1 && meta.heavyDmgMul > 1 && meta.heavyKey)
    pass(`content: COMBO knob present (chainLen=${meta.chainLen} window=${meta.windowMs}ms finisher×${meta.finisherMul}/knock×${meta.finisherKnock} | heavy ${meta.heavyKey} cd×${meta.heavyCdMul}/dmg×${meta.heavyDmgMul}/poise=${meta.heavyPoise} | REMATE×${meta.staggerPunishMul})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: light chain → finisher on the 3rd swing ----------
  const ch = d.comboChainProbe();
  if (ch && ch.firstTwoBuild && ch.thirdIsFinisher)
    pass(`AC3: swings build count ${J(ch.counts)} (fins ${J(ch.fins)}) — the ${COMBO.chainLen}rd swing is the FINISHER (count resets to 0)`);
  else fail(`AC3 chain build wrong: ${J(ch)}`);
  if (ch && ch.finDmgOk)
    pass(`AC3: finisher damage ${ch.finDmg} ≈ base×finisherMul (${ch.expectFinDmg}) — the 3rd hit lands HARDER (dmgs ${J(ch.dmgs)})`);
  else fail(`AC3 finisher dmg wrong: ${J(ch)}`);
  if (ch && ch.finKnockOk)
    pass(`AC3: finisher knockback ×${ch.finKnockMul} ≈ finisherKnock (${ch.expectKnockMul}) — the 3rd hit LAUNCHES harder (knocks ${J(ch.knocks)})`);
  else fail(`AC3 finisher knock wrong: ${J(ch)}`);
  if (ch && ch.fourthResets)
    pass(`AC3: the 4th swing restarts the chain at count=1 (not a finisher) — L→L→L→L reads as L→L→[FIN]→L`);
  else fail(`AC3 fourth-resets wrong: ${J(ch)}`);

  // ---------- [AC4]: window expiration ----------
  const ex = d.comboExpireProbe();
  if (ex && ex.reset)
    pass(`AC4: built to count ${ex.before}, a gap > windowMs (ticked) cools it to ${ex.afterTick} (window gone=${ex.windowGone}); next swing is a fresh count=${ex.resumeCount}, fin=${ex.resumeFin}`);
  else fail(`AC4 expire wrong: ${J(ex)}`);

  // ---------- [AC5]: heavy attack ----------
  const hv = d.comboHeavyProbe();
  if (hv && hv.cdOk)
    pass(`AC5: heavy cooldown ${hv.heavyCd}s vs light ${hv.lightCd}s = ×${hv.cdRatio} ≈ heavyCdMul (${hv.expectCdMul}) — the heavy commits longer`);
  else fail(`AC5 heavy cd wrong: ${J(hv)}`);
  if (hv && hv.dmgOk)
    pass(`AC5: heavy damage ${hv.heavyDmg} ≈ base×heavyDmgMul (${hv.expectHeavyDmg}) vs light ${hv.lightDmg} — the heavy hits harder`);
  else fail(`AC5 heavy dmg wrong: ${J(hv)}`);
  if (hv && hv.poiseOk)
    pass(`AC5: a heavy hit fills POISE by ${hv.heavyPoise} (gain.heavy) vs a light hit ${hv.lightPoise} (gain.light) — the natural stagger-break path`);
  else fail(`AC5 heavy poise wrong: ${J(hv)}`);

  // ---------- [AC6 heart]: the rematador stacks on the POISE bonus ----------
  const pu = d.comboPunishProbe();
  if (pu && pu.stacksOk)
    pass(`AC6: a MELEE hit on a STAGGERED élite lands ×${pu.fullRatio} (${pu.fullDmg}hp) = POISE bonus ×${pu.expectPoise} (${pu.poiseDmg}hp) × REMATE ×${COMBO.staggerPunishMul} — it STACKS (baseline ${pu.baseDmg}hp)`);
  else fail(`AC6 rematador stacking wrong: ${J(pu)}`);
  if (pu && pu.punishAbovePoise && pu.vfx)
    pass(`AC6: the rematador beats the POISE-only hit (${pu.fullDmg}>${pu.poiseDmg}) and fires its VFX/floater (¡REMATE!) — the read→aturdes→rematas payoff`);
  else fail(`AC6 rematador vfx/magnitude wrong: ${J(pu)}`);

  // ---------- [AC7]: melee-only ----------
  const mo = d.comboMeleeOnlyProbe();
  if (mo && mo.chainNoAdvance)
    pass(`AC7: a ranged (proj) class swing does NOT advance the light chain (comboCount=${mo.comboCountAfterProj}) — the chain is melee-only`);
  else fail(`AC7 ranged chained: ${J(mo)}`);
  if (mo && mo.meleeOnly)
    pass(`AC7: a ranged hit on a staggered enemy gets NO rematador (${mo.rangedDmg}hp) while the melee hit does (${mo.meleeDmg}hp, ×${mo.punishRatio}≈${mo.expectPunish}) — opt.melee gate`);
  else fail(`AC7 melee-only punish wrong: ${J(mo)}`);

  // ---------- [AC8]: synergy without regression ----------
  const sy = d.comboSynergyProbe();
  if (sy && sy.frenzyOk)
    pass(`AC8: FRENZY still multiplies a finisher — 5 stacks ×${sy.frenzyRatio} ≈ ${sy.expectFrenzy} (no-frenzy ${sy.finNoFrenzy} → frenzy ${sy.finFrenzy}); the multipliers STACK`);
  else fail(`AC8 frenzy synergy wrong: ${J(sy)}`);
  if (sy && sy.riposteOk)
    pass(`AC8: PARRY riposte still multiplies a hero hit ×${sy.riposteRatio} ≈ ${sy.expectRiposte} (plain ${sy.plain} → riposte ${sy.ripo}) — no regression`);
  else fail(`AC8 riposte synergy wrong: ${J(sy)}`);

  // ---------- [AC1]: OFF ⇒ swing sequence identical, heavy inert ----------
  const off = d.comboOffProbe();
  if (off && off.offOk)
    pass(`AC1 OFF: with COMBO disabled all 4 swings deal the SAME base damage ${J(off.dmgs)} (no finisher spike, fins ${J(off.fins)}), knockback uniform, and the heavy key is INERT (no swing armed)`);
  else fail(`AC1 OFF byte-behaviour wrong: ${J(off)}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (finisher + rematador FIRING) — ON == OFF ----------
  const SEED = 0x1831c0de, N = 24;
  const rON = d.comboSrandProbe(true, SEED, N);
  const rOFF = d.comboSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL finisher + rematador + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — the combo is pure timing/arithmetic (0 srand draws, no comboRng) even while it fires`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.finisherFired && rON.punishFired)
    pass(`AC2: the ON probe DID land a real finisher AND a real rematador while consuming 0 srand — it exercised the real fire paths`);
  else fail(`AC2 combo did not fire on the ON probe: ${J({ finisherFired: rON.finisherFired, punishFired: rON.punishFired })}`);
  const rON2 = d.comboSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [AC1/AC9 SAVE]: hot chain ⇒ save.v1 byte-identical, no combo key ----------
  const sb = d.comboSaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC1/AC9 SAVE: a HOT chain (comboCount/comboT set) ⇒ save.v1 BYTE-IDENTICAL ON/OFF, no combo key — the fields are transient, out of serializeSave`);
  else fail(`AC1/AC9 SAVE byte-id broke: ${J(sb)}`);

  // ---------- [REG]: Parry + Dodge + Telegraph + Abilities + Poise srand probes stay ON==OFF ----------
  const pr = { on: d.parrySrandProbe(true, 0x1785c0de, 24), off: d.parrySrandProbe(false, 0x1785c0de, 24) };
  if (J(pr.on.fingerprint) === J(pr.off.fingerprint)) pass(`REG: Parry srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Parry srand regressed`);
  const dg = { on: d.dodgeSrandProbe(true, 0x1814c0de, 24), off: d.dodgeSrandProbe(false, 0x1814c0de, 24) };
  if (J(dg.on.fingerprint) === J(dg.off.fingerprint)) pass(`REG: Dodge srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Dodge srand regressed`);
  const tg = { on: d.telegraphSrandProbe(true, 0x1790c0de, 24), off: d.telegraphSrandProbe(false, 0x1790c0de, 24) };
  if (J(tg.on.fingerprint) === J(tg.off.fingerprint)) pass(`REG: Telegraph srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Telegraph srand regressed`);
  const ab = { on: d.abilitySrandProbe(true, 0x1819c0de, 24), off: d.abilitySrandProbe(false, 0x1819c0de, 24) };
  if (J(ab.on.fingerprint) === J(ab.off.fingerprint)) pass(`REG: Abilities srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Abilities srand regressed`);
  const po = { on: d.poiseSrandProbe(true, 0x1826c0de, 24), off: d.poiseSrandProbe(false, 0x1826c0de, 24) };
  if (J(po.on.fingerprint) === J(po.off.fingerprint)) pass(`REG: Poise srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Poise srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1832 combo/moveset harness: ALL PASS" : "\n❌ CAS-1832 combo/moveset harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
