// ---------------------------------------------------------------------------
// CAS-1827 (build for CAS-1826) — ATURDIMIENTO POR POSTURA (Poise / Stagger). Every ÉLITE / CAMPEÓN / JEFE
// carries a hidden POSTURA bar that fills with each hero hit; crossing its ceiling BREAKS it into a STAGGER —
// which IS an `e.stun` (reuses the existing AI-freeze gate, sim.js:3274, so 0 new AI code) plus an `e.staggerT`
// window that grants bonus damage. NOT a new system: it BORROWS the stun gate, the FRENZY/PARRY deterministic
// multiply sink in hitEnemy, and the transient-enemy-state pattern (never serialized). $0 art (proc VFX only).
//
// HARD-GATED behind POISE.enabled: OFF ⇒ no field touched, no branch runs ⇒ sim + save.v1 byte-identical to HEAD.
// Postura is 100% DETERMINISTIC (arithmetic accrual + threshold) ⇒ it opens NO srand stream (there is no
// poiseRng) ⇒ the srand fingerprint is BYTE-IDENTICAL ON==OFF even while a stagger fires for real. The 5 new
// fields (poise/poiseMax/staggerT/staggerCD/_poiseDecayT) are transient enemy run-state; G.enemies is never
// serialized ⇒ save is isolated.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL dev.poise* hooks, which exercise
// the REAL hitEnemy / updateEnemies / damageHero paths. The live QA (child) re-verifies feel in a real browser.
//
// Proves:
//   [AC1/AC8 SAVE]  a live élite with HOT postura ⇒ save.v1 byte-identical ON/OFF, no poise/stagger key (transient).
//   [AC2 RNG-STRONG] a 2×24 FIXED srand script around a REAL postura FILL→BREAK (+ bonus hit) is BYTE-IDENTICAL ON vs OFF.
//   [AC3 accrue/break] N light hits fill poise → break → e.stun + e.staggerT set + poise reset → AI frozen → dmg×bonus.
//   [AC4 decay]     partial postura decays after decayDelay of no hits.
//   [AC5 re-stagger] after a break, postura won't re-accrue until the re-stagger cooldown drains (no infinite lock).
//   [AC6 boss]      boss profile: higher ceiling, shorter stun, bigger bonus-dmg than élite.
//   [AC7 synergy]   a successful parry pulses gain.parry; punishing a live telegraph adds gain.telegraphPunish.
//   [AC-gain]       opt.heavy / opt.ultimate carry more postura than a light hit (light < heavy < ultimate).
//   [REG]           Parry + Dodge + Telegraph + Abilities srand probes stay ON==OFF (no regression from the new seams).
//
// Run: node tools/cas1826-poise.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { POISE } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that touch
// audio.sfx (ehurt, stun sfx, loot sfx) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("PoiseBot", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.poiseMeta();
  if (meta.enabled && meta.elite && meta.boss && meta.elite.max > 0 && meta.boss.max > 0 && meta.gain.light > 0)
    pass(`content: POISE knob present (élite max=${meta.elite.max} dur=${meta.elite.dur} bonus=${meta.elite.bonusDmg} | boss max=${meta.boss.max} dur=${meta.boss.dur} bonus=${meta.boss.bonusDmg} | gain light=${meta.gain.light}/heavy=${meta.gain.heavy}/ult=${meta.gain.ultimate})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: fill → break → freeze → bonus dmg ----------
  const a = d.poiseAccrueProbe();
  if (a && a.hits === a.expectHits && a.staggered && a.stunned && a.poiseReset)
    pass(`AC3: ${a.hits} light hits (=ceil(${a.max}/${a.per})) FILL postura → BREAK: e.stun set + e.staggerT>0 + poise reset to 0`);
  else fail(`AC3 accrue/break wrong: ${J(a)}`);
  if (a && a.frozen)
    pass(`AC3: the staggered enemy's AI is FROZEN (existing e.stun gate) — no chase movement, not winding up/striking`);
  else fail(`AC3 AI not frozen: ${J(a)}`);
  if (a && a.staggerDmg > a.baseDmg && Math.abs(a.ratio - a.bonusDmg) < 0.02)
    pass(`AC3: a hit INSIDE the window lands for -${a.staggerDmg}hp vs baseline -${a.baseDmg}hp (×${a.ratio} ≈ bonusDmg ${a.bonusDmg}) — read→punish payoff`);
  else fail(`AC3 bonus dmg wrong: ${J(a)}`);

  // ---------- [AC4]: decay ----------
  const dc = d.poiseDecayProbe();
  if (dc && dc.decayed && dc.built > 0)
    pass(`AC4: partial postura ${dc.built} DECAYS to ${dc.afterDelay} after decayDelay=${dc.decayDelay}s of no hits (rate ${dc.decayRate}/s) — a dropped combo doesn't bank`);
  else fail(`AC4 decay wrong: ${J(dc)}`);

  // ---------- [AC5]: re-stagger cooldown ----------
  const rs = d.poiseReStaggerProbe();
  if (rs && rs.broke && rs.cdStillActive && rs.blockedInCD && rs.reAccrues)
    pass(`AC5: after a break the re-stagger CD (=${rs.cd0}s, still ${rs.cdAfterWindow}s once the window expired) BLOCKS re-accrual; draining it re-arms accrual — no infinite lock`);
  else fail(`AC5 re-stagger wrong: ${J(rs)}`);

  // ---------- [AC6]: boss profile ----------
  const t = d.poiseTierProbe();
  if (t && t.maxHigher && t.durShorter && t.bonusHigher)
    pass(`AC6: boss profile (max ${t.bossMax}>${t.eliteMax}, dur ${t.bossDur}<${t.eliteDur}, bonus ${t.bossBonus}>${t.eliteBonus}) — more postura, shorter stun, BIGGER opening (climax)`);
  else fail(`AC6 boss profile wrong: ${J(t)}`);

  // ---------- [AC7]: synergy — parry pulse + telegraph punish ----------
  const sy = d.poiseSynergyProbe();
  if (sy && sy.parryOk)
    pass(`AC7: a successful PARRY (negated=${sy.parried}) pulses gain.parry (+${sy.parryGain} = ${sy.expectParry}) — direct read→punish synergy with CAS-1785`);
  else fail(`AC7 parry synergy wrong: ${J(sy)}`);
  if (sy && sy.punishOk)
    pass(`AC7: punishing a live TELEGRAPH (e.st>0) adds gain.telegraphPunish (+${sy.punishGain} vs +${sy.plainGain} plain = Δ${sy.telegraphPunish})`);
  else fail(`AC7 telegraph punish wrong: ${J(sy)}`);

  // ---------- [AC-gain]: light < heavy < ultimate ----------
  const gt = d.poiseGainTierProbe();
  if (gt && gt.ordered && gt.light === gt.gain.light && gt.heavy === gt.gain.heavy && gt.ultimate === gt.gain.ultimate)
    pass(`AC-gain: postura per hit scales light(${gt.light}) < heavy(${gt.heavy}) < ultimate(${gt.ultimate}) — heavier reads break faster`);
  else fail(`AC-gain wrong: ${J(gt)}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (stagger FIRING) — ON == OFF ----------
  const SEED = 0x1826c0de, N = 24;
  const rON = d.poiseSrandProbe(true, SEED, N);
  const rOFF = d.poiseSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL postura fill→break + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — postura is pure arithmetic (0 srand draws, no poiseRng) even while the stagger fires`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.staggerFired)
    pass(`AC2: the ON probe DID break postura into a real stagger while consuming 0 srand — proves it exercised the real fill→break→bonus path`);
  else fail(`AC2 stagger did not fire on the ON probe: ${J({ staggerFired: rON.staggerFired })}`);
  const rON2 = d.poiseSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [AC1/AC8 SAVE]: hot postura ⇒ save.v1 byte-identical, no poise key ----------
  const sb = d.poiseSaveByteId();
  if (sb.byteId && sb.hotPoise && !sb.hasKey)
    pass(`AC1/AC8 SAVE: a live élite with HOT postura ⇒ save.v1 BYTE-IDENTICAL ON/OFF, no poise/stagger key — the 5 fields are transient, out of serializeSave`);
  else fail(`AC1/AC8 SAVE byte-id broke: ${J(sb)}`);

  // ---------- [REG]: Parry + Dodge + Telegraph + Abilities srand probes stay ON==OFF ----------
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

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1827 poise/stagger harness: ALL PASS" : "\n❌ CAS-1827 poise/stagger harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
