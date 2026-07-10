// ---------------------------------------------------------------------------
// CAS-1820 (build for CAS-1819) — HABILIDADES ESPECIALES TELEGRAFIADAS PARA ENEMIGOS. Two telegraphed
// enemy specials mounted on EXISTING élites by BORROWING the live machinery (special.slam radial + the
// windup→strike AI + armTelegraph + the damageHero choke), NOT a new system. $0 art, $0 new mob.
//
//   A1 — EMBESTIDA (directional lunge) on a rusher-family élite: heavy ring + a NEW procedural lane tell
//        along the facing FROZEN at windup; strike dashes straight ⇒ damageHero(dmg,ang,infl,e) with src=e
//        ⇒ PARABLE (KeyH) and EVADIBLE by dash i-frames and by sidestepping the lane.
//   A2 — GOLPE DE SUELO (radial slam) on a brute-family élite that lacked one: reuses special.slam; the
//        ground-ring radius comes from the knob; shards are src=null ⇒ NOT parryable but EVADIBLE (roll / out).
//
// HARD-GATED behind ENEMY_ABILITIES.enabled: OFF ⇒ 0 assignments ⇒ the strike never reaches the new
// branches ⇒ sim + save byte-identical to HEAD (reversible in one line). Cadence-deterministic (e.atkCount %
// every) ⇒ 0 srand draws (dedicated abilityRng 0x0ab111a7 for any optional variance) ⇒ srand ON==OFF.
// `e.special` is transient entity run-state, never serialized ⇒ save.v1 byte-identical.
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL dev.ability* hooks, which
// exercise the REAL updateEnemies/damageHero paths. The live QA (child) re-verifies feel in a real browser.
//
// Proves:
//   [AC-assign]     rusher-élite→A1 lunge, brute-élite→A2 slam, other archetype→none; knob OFF ⇒ no assignment.
//   [AC-A1]         a real lunge STRIKE spawns the lane tell + heavy ring; contact routes through damageHero
//                   with src=e ⇒ lands baseline, NEGATED by a roll i-frame, PARRIED (+counter) by KeyH.
//   [AC-A2]         a real slam STRIKE emits `count` shards, ground-ring radius = knob, shards src=null ⇒
//                   NEGATED by an i-frame but NOT parryable.
//   [AC-RNG-STRONG] a 2×24 FIXED srand script around REAL lunge+slam FIRINGS is BYTE-IDENTICAL ON vs OFF.
//   [AC-SAVE]       a hot mounted special ⇒ save.v1 byte-identical ON/OFF, no ability key (transient state).
//   [REG]           Dodge + Parry + Telegraph srand probes stay ON==OFF (no regression from the new seams).
//
// Run: node tools/cas1819-abilities.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ENEMY_ABILITIES } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that touch
// audio.sfx (windup roar, slam boss sfx, loot sfx) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("AbilityBot", "warrior");
  d.abilityEnable(true);

  // ---------- content sanity: the knob ----------
  const meta = d.abilityMeta();
  if (meta.enabled && meta.lunge && meta.slam && meta.lunge.every > 0 && meta.slam.count > 0 && meta.slam.radius > 0)
    pass(`content: ENEMY_ABILITIES knob present (lunge every=${meta.lunge.every} dist=${meta.lunge.distance}px | slam every=${meta.slam.every} count=${meta.slam.count} radius=${meta.slam.radius}px)`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC-assign]: archetype → ability mapping; OFF ⇒ none ----------
  const asg = d.abilityAssignProbe();
  if (asg.rusher && asg.rusher.arch === "rusher" && asg.rusher.hasLunge && !asg.rusher.hasSlam)
    pass(`AC-assign: a rusher-family élite (wolf) gets A1 LUNGE (every=${asg.rusher.every}, dmg=${asg.rusher.dmg})`);
  else fail(`AC-assign rusher wrong: ${J(asg.rusher)}`);
  if (asg.brute && asg.brute.arch === "brute" && asg.brute.hasSlam && !asg.brute.hasLunge)
    pass(`AC-assign: a brute-family élite (orc) gets A2 SLAM (every=${asg.brute.every}, dmg=${asg.brute.dmg})`);
  else fail(`AC-assign brute wrong: ${J(asg.brute)}`);
  if (asg.caster && !asg.caster.hasLunge && !asg.caster.hasSlam)
    pass(`AC-assign: an off-family archetype (caster) gets NO ability (conservative density — only rusher/brute)`);
  else fail(`AC-assign caster should get none: ${J(asg.caster)}`);
  if (asg.offRusher && asg.offRusher.arch === "rusher" && asg.offRusher.hasSpecial === false)
    pass(`AC-assign-OFF: with the knob OFF a rusher élite gets NO special ⇒ élite is byte-identical to HEAD`);
  else fail(`AC-assign-OFF should assign nothing: ${J(asg.offRusher)}`);

  // ---------- [AC-A1]: real lunge STRIKE — tells + src=e (parable + i-frame evadible) ----------
  const l = d.abilityLungeProbe();
  if (l && l.hasLunge && l.laneTell && l.heavyRing)
    pass(`AC-A1: a real rusher-élite lunge windup spawns the directional lane tell + the heavy incoming ring (both telegraphs live)`);
  else fail(`AC-A1 telegraph missing: ${J(l)}`);
  if (l && l.baseLanded && l.landed > 0 && l.negatedByIframe)
    pass(`AC-A1: the lunge contact lands for -${l.landed}hp (src=e), but is fully NEGATED inside a roll's i-frame (dodgeable)`);
  else fail(`AC-A1 iframe/contact broke: ${J(l)}`);
  if (l && l.negatedByParry && l.countered)
    pass(`AC-A1: a live PARRY window (KeyH) negates the SAME contact AND fires a counter — proves src=e ⇒ parryable`);
  else fail(`AC-A1 parry broke: ${J(l)}`);

  // ---------- [AC-A2]: real slam STRIKE — shards from config, radius from knob, src=null ----------
  const s = d.abilitySlamProbe();
  if (s && s.hasSlam && s.shardCount === s.expectShards && s.shardCount === ENEMY_ABILITIES.slam.count)
    pass(`AC-A2: a real brute-élite slam emits ${s.shardCount} radial shards (= knob count ${s.expectShards})`);
  else fail(`AC-A2 shard count wrong: ${J(s)}`);
  if (s && s.ringRadius === s.cfgRadius && s.ringRadius === ENEMY_ABILITIES.slam.radius)
    pass(`AC-A2: the telegraphed ground-ring radius (${s.ringRadius}px) is read from the knob (radius param wired)`);
  else fail(`AC-A2 ring radius not from config: ${J(s)}`);
  if (s && s.srcNull && s.landed > 0 && s.negatedByIframe && s.notParryable)
    pass(`AC-A2: shards are src=null ⇒ land for -${s.landed}hp, NEGATED by an i-frame (roll out), but NOT parryable (parry lands)`);
  else fail(`AC-A2 shard semantics broke: ${J(s)}`);

  // ---------- [AC-RNG-STRONG]: 48-draw fixed srand script (abilities FIRING) — ON == OFF ----------
  const SEED = 0x1819c0de, N = 24;
  const rON = d.abilitySrandProbe(true, SEED, N);
  const rOFF = d.abilitySrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around REAL lunge + slam firings`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC-RNG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — the specials are cadence-deterministic (0 srand draws even while firing)`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.lungeFired && rON.slamFired)
    pass(`AC-RNG: the ON probe DID fire a real lunge AND a real slam while consuming 0 srand — proves it exercised the real paths`);
  else fail(`RNG probe abilities did not fire: ${J({ lungeFired: rON.lungeFired, slamFired: rON.slamFired })}`);
  const rON2 = d.abilitySrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`determinism broke`);

  // ---------- [AC-SAVE]: hot mounted special ⇒ save.v1 byte-identical, no ability key ----------
  const sb = d.abilitySaveByteId();
  if (sb.byteId && sb.hotSpecial && !sb.hasKey)
    pass(`AC-SAVE: a live élite carrying a HOT special ⇒ save.v1 BYTE-IDENTICAL ON/OFF, no ability key — e.special is transient, out of serializeSave`);
  else fail(`AC-SAVE byte-id broke: ${J(sb)}`);

  // ---------- [REG]: Dodge + Parry + Telegraph srand probes stay ON==OFF ----------
  const dg = { on: d.dodgeSrandProbe(true, 0x1814c0de, 24), off: d.dodgeSrandProbe(false, 0x1814c0de, 24) };
  if (J(dg.on.fingerprint) === J(dg.off.fingerprint)) pass(`REG: Dodge srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Dodge srand regressed`);
  const pr = { on: d.parrySrandProbe(true, 0x1785c0de, 24), off: d.parrySrandProbe(false, 0x1785c0de, 24) };
  if (J(pr.on.fingerprint) === J(pr.off.fingerprint)) pass(`REG: Parry srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Parry srand regressed`);
  const tg = { on: d.telegraphSrandProbe(true, 0x1790c0de, 24), off: d.telegraphSrandProbe(false, 0x1790c0de, 24) };
  if (J(tg.on.fingerprint) === J(tg.off.fingerprint)) pass(`REG: Telegraph srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Telegraph srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1820 enemy-abilities harness: ALL PASS" : "\n❌ CAS-1820 enemy-abilities harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
