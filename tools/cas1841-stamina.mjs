// ---------------------------------------------------------------------------
// CAS-1842 (build for CAS-1841) — ESTAMINA / VIGOR (Pilar 8 · economía de recurso, knob STAMINA). The 7 live Souls-like
// pillars (Telegrafía/Esquiva/Parada/Habilidades/Poise/Combos/Backstab) are all ADDITIVE offense/reaction — each GIVES
// power, none CHARGES for it. Stamina adds the missing RESOURCE-ECONOMY axis: a transient vigor pool that makes each
// PODER action a decision with a cost, WITHOUT choking the moment-to-moment (the light attack L never spends).
//
// The effect is ONE arithmetic gate — spendStam(h,cost) — at each power action: dodge/parry/heavy/finisher/ability/
// ultimate. h.stam is a TRANSIENT hero resource (refill to full each run like h.mp), consumed by compare+subtract ⇒
// ZERO draws, NO staminaRng (nothing to seed) ⇒ srand BYTE-IDENTICAL ON==OFF even while stamina is spent/denied/
// regenerated for real. It is out of serializeSave's allowlist ⇒ save.v1 byte-identical and NO new key. HARD-GATED:
// STAMINA.enabled=false ⇒ spendStam returns true instantly (no state touched) and the HUD bar is not created ⇒
// dmg/knock/save/srand/DOM byte-identical to HEAD.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL dev.stamina* hooks, which exercise the
// REAL doRoll/tryParry/heavyAttack/heroAttack-finisher/castAbility/castUltimate gates + tickStamina regen. A COUNTING
// audio stub proves audio.sfx.deny fires on a deny. The live QA (child) re-verifies feel + the HUD bar on the build.
//
// Proves:
//   [AC1 OFF]        STAMINA.enabled=false ⇒ even with stam=5 (below every cost) every action fires and h.stam/_stamFlash are untouched.
//   [AC2 RNG-STRONG] a 48-draw FIXED srand script around REAL stamina firing (spend+deny+regen) + loot kills is BYTE-IDENTICAL ON vs OFF.
//   [AC3 cost]       each PODER action subtracts its EXACT cost; the light L subtracts NOTHING (0 delta).
//   [AC4 deny]       with stam=0 each action DENIES (does not execute, arms _stamFlash, calls sfx.deny); the finisher DEGRADES (still lands).
//   [AC5 regen]      +regen/s toward max; a spend pauses regen for regenDelay, then it resumes; clamps at max.
//   [AC6 save]       h.stam is transient ⇒ save.v1 byte-identical ON/OFF, no stamina key.
//   [REG]            frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1841-stamina.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { STAMINA } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stubs: a deep no-op proxy for io/view; a COUNTING audio stub so a deny is observable (sfx.deny).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
let denyCount = 0;
const sfxStub = new Proxy({}, { get: (_t, k) => (k === "deny" ? (() => { denyCount++; }) : noop) });
const audioStub = new Proxy({}, { get: (_t, k) => (k === "sfx" ? sfxStub : noop) });
sim.configure({ io: deep, audio: audioStub, view: deep });

try {
  sim.createHero("VigorBot", "warrior");   // NB: no "stam" substring in the name ⇒ the AC6 save-key regex can't false-match

  // ---------- content sanity: the knob ----------
  const meta = d.staminaMeta();
  if (meta.enabled && meta.max > 0 && meta.regen > 0 && meta.cost && meta.cost.dodge > 0)
    pass(`content: STAMINA knob present (max=${meta.max} | regen=${meta.regen}/s | regenDelay=${meta.regenDelay}s | cost=${J(meta.cost)})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: exact cost per power action; light L = 0 delta ----------
  const cp = d.staminaCostProbe();
  if (cp && cp.ok)
    pass(`AC3 cost: dodge -${cp.dodge} · parry -${cp.parry} · heavy -${cp.heavy} · finisher -${cp.finisher} · ability -${cp.ability} · ultimate -${cp.ultimate} (each == its knob cost ${J(cp.cost)})`);
  else fail(`AC3 cost mismatch: ${J(cp)}`);
  if (cp && Math.abs(cp.light) < 1e-9)
    pass(`AC3 light L free: a plain (non-finisher) swing spends ${cp.light} vigor — the moment-to-moment is never gated`);
  else fail(`AC3 light L is NOT free (spent ${cp && cp.light}): ${J(cp)}`);

  // ---------- [AC4]: no vigor ⇒ deny (not cost-0), _stamFlash armed, sfx.deny called; finisher degrades ----------
  const denyBefore = denyCount;
  const dp = d.staminaDenyProbe();
  const denyFired = denyCount - denyBefore;
  if (dp && dp.ok)
    pass(`AC4 deny: with stam=0 dodge/parry/heavy/ability/ultimate DENY (do not execute) + arm _stamFlash; the finisher DEGRADES to a normal swing that STILL lands (landed=${dp.finisher.landed}, _comboFin=false)`);
  else fail(`AC4 deny wrong: ${J(dp)}`);
  if (denyFired === 6)
    pass(`AC4 sfx: audio.sfx.deny fired exactly ${denyFired}× (one per denied power action) — the deny branch (flash + sfx) ran, not a silent cost-0`);
  else fail(`AC4 sfx.deny count expected 6, got ${denyFired}`);

  // ---------- [AC1]: OFF ⇒ actions fire, vigor untouched (byte-identical behaviour) ----------
  const offp = d.staminaOffProbe();
  if (offp && offp.ok)
    pass(`AC1 OFF: with STAMINA disabled every action fires even at stam=5 (below every cost) and h.stam/_stamFlash are NEVER touched — spendStam returns true instantly (byte-identical to HEAD)`);
  else fail(`AC1 OFF byte-behaviour wrong: ${J(offp)}`);

  // ---------- [AC5]: regen + post-spend pause + clamp ----------
  const rp = d.staminaRegenProbe();
  if (rp && rp.ok)
    pass(`AC5 regen: +${rp.gained} over 0.5s (==regen·dt ${rp.expect}); a spend PAUSES regen for regenDelay (pausedNoRegen=${rp.pausedNoRegen}) then it resumes (${rp.resumed}); clamps at max (${rp.clamped})`);
  else fail(`AC5 regen wrong: ${J(rp)}`);

  // ---------- [AC6 SAVE]: transient, save byte-identical, no key ----------
  const sb = d.staminaSaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC6 SAVE: live vigor state (stam/_stamFlash/_stamRegenPauseT) is transient ⇒ save.v1 BYTE-IDENTICAL ON/OFF (len ${sb.onLen}==${sb.offLen}), no stamina key`);
  else fail(`AC6 SAVE byte-id broke: ${J(sb)}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (stamina FIRING) — ON == OFF ----------
  const SEED = 0x1841c0de, N = 24;
  const rON = d.staminaSrandProbe(true, SEED, N);
  const rOFF = d.staminaSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around REAL stamina spend+deny+regen + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — the stamina economy is pure arithmetic (0 srand draws, no staminaRng) even while it fires`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.staminaFired)
    pass(`AC2: the ON probe DID spend, deny AND regen real vigor while consuming 0 srand — it exercised the real fire paths`);
  else fail(`AC2 stamina did not fire (spend&deny&regen) on the ON probe: ${J({ staminaFired: rON.staminaFired })}`);
  const rON2 = d.staminaSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF ----------
  const reg = [
    ["Frenzy",    0x1773c0de, d.frenzySrandProbe],
    ["Parry",     0x1785c0de, d.parrySrandProbe],
    ["Dodge",     0x1814c0de, d.dodgeSrandProbe],
    ["Telegraph", 0x1790c0de, d.telegraphSrandProbe],
    ["Abilities", 0x1819c0de, d.abilitySrandProbe],
    ["Poise",     0x1826c0de, d.poiseSrandProbe],
    ["Combos",    0x1831c0de, d.comboSrandProbe],
    ["Backstab",  0x1836c0de, d.backstabSrandProbe],
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

log(ok ? "\n✅ CAS-1842 stamina harness: ALL PASS" : "\n❌ CAS-1842 stamina harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
