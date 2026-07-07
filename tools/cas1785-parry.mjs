// ---------------------------------------------------------------------------
// CAS-1786 (build for CAS-1785) — PARADA CON TEMPO (timing parry). A TRANSIENT run-state skill:
// pressing the parry key (KeyH) arms a narrow window (PARRY.windowMs); taking a CONTACT (melee) hit
// inside it NEGATES the hit entirely and fires a short counter (damage + knockback) at the attacker,
// plus a consumable 1-hit riposte buff (the next hero hit ×PARRY.riposteMul). Projectiles pass
// src=null to damageHero, so the parry is melee-only NATURALLY (no extra logic).
//
// Copies the EXACT transient pattern of CAS-1773 Frenzy / CAS-192 atkspdBuffT: fields on the hero,
// initialised in newHero, NEVER serialized (no serializeSave / save.v1 touch), ticked in update(dt)
// via a shared tickParry. It opens NO RNG stream — the parry is 100% timing-driven, so srand is
// BYTE-IDENTICAL ON vs OFF even when a parry actually FIRES (the counter's hitEnemy rolls crit only
// if the build has crit — a fresh warrior does not — so 0 srand is consumed on the parry path).
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL sim hooks (dev.parry*).
// The live QA (Deploy child) re-verifies the window glint + feel in a real browser.
//
// Proves:
//   [AC-window]     armed window ⇒ a melee hit is NEGATED (damageHero=false), hero takes 0 dmg, the
//                   attacker takes PARRY.counterDmg + knockback, the riposte buff is armed.
//   [AC-out]        no window ⇒ the same melee hit is a NORMAL hit (hero takes damage, no counter).
//   [AC-ranged]     window armed + src=null (projectile) ⇒ NOT parried (melee-only), hero takes damage.
//   [AC-riposte]    the 1-hit riposte buff multiplies the NEXT hero hit ×riposteMul then is spent.
//   [AC-cooldown]   a whiff (press out of window) sets parryCD ⇒ a second press inside CD is a no-op.
//   [AC-tick]       tickParry winds the window + cooldown down deterministically (shared game-loop path).
//   [AC-RNG-STRONG] a 2×24 FIXED srand script around REAL kills + a REAL parry-negation is BYTE-IDENTICAL
//                   with PARRY ON vs OFF — the parry touches NO srand.
//   [AC-SAVE]       a save with hot parry fields serializes to the SAME save.v1 bytes as a clean state,
//                   no parry key; loadSave rehydrates the fields at 0 (reset per run).
//   [OFF]           PARRY.enabled=false ⇒ the window can't arm, melee hits are never parried (no-op).
//   [REG]           Frenzy (CAS-1773) srand probe stays ON==OFF (no regression from the parry seams).
//
// Run: node tools/cas1785-parry.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { PARRY } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that
// touch audio.sfx (killEnemy loot sfx, hitEnemy ehurt, tryParry roll sfx) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("ParryBot", "warrior");
  d.parryEnable(true);

  // ---------- content sanity: the knob ----------
  const meta = d.parryMeta();
  if (meta.enabled && meta.windowMs === 150 && meta.cooldownS === 0.55 && meta.counterDmg === 26 &&
      meta.knockback === 230 && meta.riposteMul === 1.5)
    pass(`content: PARRY knob present (window=${meta.windowMs}ms cd=${meta.cooldownS}s counter=${meta.counterDmg} knock=${meta.knockback} riposte×${meta.riposteMul})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC-window]: armed window ⇒ negate + counter ----------
  const inW = d.parryMeleeProbe(true);
  if (inW.negated && inW.heroDmg === 0)
    pass(`AC-window: a melee hit inside the window is NEGATED (damageHero=false), hero takes 0 damage`);
  else fail(`AC-window negate broke: ${J(inW)}`);
  if (inW.enemyDmg >= PARRY.counterDmg && inW.knockApplied)
    pass(`AC-window: the counter deals ${inW.enemyDmg} (≥counterDmg=${PARRY.counterDmg}) + knockback to the attacker`);
  else fail(`AC-window counter broke: enemyDmg=${inW.enemyDmg} knock=${inW.knockApplied}`);
  if (inW.riposteAfter === 1 && inW.parryTAfter === 0)
    pass(`AC-window: the parry consumes the window (parryT→0) and arms the 1-hit riposte buff`);
  else fail(`AC-window state broke: riposte=${inW.riposteAfter} parryT=${inW.parryTAfter}`);

  // ---------- [AC-out]: no window ⇒ normal hit, no counter ----------
  const outW = d.parryMeleeProbe(false);
  if (!outW.negated && outW.heroDmg > 0 && outW.enemyDmg === 0 && outW.riposteAfter === 0)
    pass(`AC-out: a melee hit with NO window is a normal hit (hero -${outW.heroDmg}hp, attacker unhurt, no riposte)`);
  else fail(`AC-out no-op broke: ${J(outW)}`);

  // ---------- [AC-ranged]: melee-only — a projectile (src=null) is never parried ----------
  const rng = d.parryRangedProbe();
  if (!rng.negated && rng.heroDmg > 0 && rng.parryTAfter > 0)
    pass(`AC-ranged: a projectile (src=null) inside the window is NOT parried (hero -${rng.heroDmg}hp, window intact) — melee-only`);
  else fail(`AC-ranged broke: ${J(rng)}`);

  // ---------- [AC-riposte]: the 1-hit buff multiplies the next hit ×riposteMul, then spent ----------
  const rp = d.parryRiposteProbe();
  if (rp.base > 0 && Math.abs(rp.ratio - PARRY.riposteMul) < 0.02 && rp.riposteAfter === 0 && rp.after === rp.base)
    pass(`AC-riposte: the buffed hit deals ×${PARRY.riposteMul} (${rp.base}→${rp.boosted}), is spent (next=${rp.after}==base), no RNG`);
  else fail(`AC-riposte broke: ${J(rp)}`);

  // ---------- [AC-cooldown]: a whiff sets parryCD ⇒ second press is a no-op ----------
  d.parryReset();
  const p1 = d.parryPress();                 // arms window + cooldown
  const s1 = d.parryState();
  const p2 = d.parryPress();                 // still in cooldown ⇒ whiff
  if (p1 === true && s1.parryCD > 0 && p2 === false)
    pass(`AC-cooldown: first press arms (parryCD=${s1.parryCD}s), a second press inside CD whiffs (no re-arm)`);
  else fail(`AC-cooldown broke: p1=${p1} cd=${s1.parryCD} p2=${p2}`);

  // ---------- [AC-tick]: tickParry winds window + cooldown down deterministically ----------
  d.parryReset(); d.parryPress();
  const t0 = d.parryState();
  const t1 = d.parryStep(0.15);              // window (0.15s) fully elapses
  const t2 = d.parryStep(0.40);              // cooldown winds toward 0 (0.55 - 0.15 - 0.40 = 0)
  if (t0.parryT > 0 && t1.parryT === 0 && +t2.parryCD.toFixed(2) === 0)
    pass(`AC-tick: tickParry winds the window to 0 after ${meta.windowMs}ms and the cooldown to 0 (shared game-loop path)`);
  else fail(`AC-tick broke: t0=${J(t0)} t1=${J(t1)} t2=${J(t2)}`);

  // ---------- [AC-RNG-STRONG]: 48-draw fixed srand script (with a REAL parry firing) — ON == OFF ----------
  const SEED = 0x1785c0de, N = 24;
  const on = d.parrySrandProbe(true, SEED, N);
  const off = d.parrySrandProbe(false, SEED, N);
  if (on.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${on.fingerprint.length} srand values (2×${N}) around ${on.kills} REAL kills + a real parry`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${on.fingerprint.length}`);
  if (J(on.fingerprint) === J(off.fingerprint))
    pass(`AC-RNG (ON==OFF): srand stream BYTE-IDENTICAL PARRY ON vs OFF — the parry opens NO RNG stream (0 draws even when it fires)`);
  else fail(`srand diverged ON vs OFF — on=${J(on.fingerprint).slice(0, 60)} off=${J(off.fingerprint).slice(0, 60)}`);
  if (on.parried && !off.parried)
    pass(`AC-RNG: the ON probe DID fire a real parry (negate+counter) while OFF could not — proves the probe exercised the real path`);
  else fail(`RNG probe parry state wrong: on.parried=${on.parried} off.parried=${off.parried}`);
  const on2 = d.parrySrandProbe(true, SEED, N);
  if (J(on.fingerprint) === J(on2.fingerprint)) pass(`determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`determinism broke`);

  // ---------- [AC-SAVE]: hot parry fields ⇒ same save.v1 bytes as clean, no parry key, reset on load ----------
  const sb = d.parrySaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC-SAVE: a save with hot parry fields is BYTE-IDENTICAL to a clean save, no "parry" key (transient, out of serializeSave)`);
  else fail(`AC-SAVE byte-id broke: ${J(sb)}`);
  if (sb.afterLoad.parryT === 0 && sb.afterLoad.parryCD === 0 && sb.afterLoad.riposte === 0)
    pass(`AC-SAVE: loadSave rehydrates the parry run-state at 0 (reset per run) — NOT persisted`);
  else fail(`AC-SAVE leaked state through load: ${J(sb.afterLoad)}`);

  // ---------- [OFF]: kill switch ⇒ window can't arm, melee never parried ----------
  d.parryReset(); d.parryEnable(false);
  const offPress = d.parryPress();
  const offMelee = d.parryMeleeProbe(true);  // even with parryT forced, the gate blocks the negation
  if (offPress === false && !offMelee.negated && offMelee.heroDmg > 0 && offMelee.enemyDmg === 0)
    pass(`OFF: parryEnable(false) ⇒ press whiffs, a melee hit is a normal hit (hard-gated no-op)`);
  else fail(`OFF path wrong: press=${offPress} melee=${J(offMelee)}`);
  d.parryEnable(true);

  // ---------- [REG]: Frenzy srand probe stays ON==OFF (no regression from the parry seams) ----------
  const fr = { on: d.frenzySrandProbe(true, 0x1773c0de, 24), off: d.frenzySrandProbe(false, 0x1773c0de, 24) };
  if (J(fr.on.fingerprint) === J(fr.off.fingerprint)) pass(`REG: Frenzy srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Frenzy srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1785 timing-parry harness: ALL PASS" : "\n❌ CAS-1785 timing-parry harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
