// ---------------------------------------------------------------------------
// CAS-1774 (build for CAS-1773) — MEDIDOR DE FRENESÍ (kill-streak / momentum). A TRANSIENT run-state
// meter: killing enemies in quick succession fills a stack meter (0..maxStacks) that grants a
// DETERMINISTIC, stacking buff — additive atk-speed (heroAtkspd sink) + multiplicative damage
// (hitEnemy choke). The meter decays 1 stack every decayEvery s once the window lapses.
//
// Copies the EXACT pattern of the CAS-192 atkspdBuffT buff: field on the hero, initialised in newHero,
// NEVER serialized (no serializeSave / save.v1 touch), ticked in update(dt). It opens NO RNG stream —
// the buff is 100% derived from kill timing, so srand is byte-identical ON vs OFF (even stronger than
// Afijos, which needed affixRng).
//
// DOM-FREE harness: imports sim/sim.js directly (no browser) and drives the REAL sim hooks (dev.frenzy*).
// The live QA (Deploy child) re-verifies the HUD pip bar in a real browser.
//
// Proves:
//   [AC1/AC2 RNG-STRONG]  a 48-draw (2×24) FIXED srand script around REAL kills (drop RNG) is
//                         BYTE-IDENTICAL with FRENZY ON vs OFF — the meter touches NO srand.
//   [AC1 save byte-id]    a save with stacks>0 serializes to the SAME save.v1 bytes as stacks=0, no key.
//   [AC3 build-up]        killing within the window raises stacks → heroAtkspd rises and hitEnemy deals
//                         the expected per-stack % more damage.
//   [AC3 decay]           stopping kills ⇒ after the window, 1 stack lost every decayEvery s down to 0.
//   [AC4 no-persist]      save with stacks>0 → reload ⇒ frenzyStacks==0 and the blob == a stacks=0 save.
//   [REG]                 Afijos (CAS-1768) srand probe stays ON==OFF (no regression from the seams).
//
// Run: node tools/cas1773-frenzy.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { FRENZY } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that
// touch audio.sfx (killEnemy loot sfx, hitEnemy ehurt) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("FrenzyBot", "warrior");
  d.frenzyEnable(true);

  // ---------- content sanity: the knob ----------
  const meta = d.frenzyMeta();
  if (meta.enabled && meta.window === 3.0 && meta.decayEvery === 0.6 && meta.maxStacks === 8 &&
      meta.perStack.atkspd === 4 && meta.perStack.dmgPct === 3)
    pass(`content: FRENZY knob present (window=${meta.window}s decayEvery=${meta.decayEvery}s max=${meta.maxStacks} +${meta.perStack.atkspd}atkspd/+${meta.perStack.dmgPct}%dmg per stack)`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC1/AC2 RNG-STRONG]: 48-draw fixed srand script — ON == OFF ----------
  const SEED = 0x1773c0de, N = 24;
  const on = d.frenzySrandProbe(true, SEED, N);
  const off = d.frenzySrandProbe(false, SEED, N);
  if (on.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${on.fingerprint.length} srand values (2×${N}) over ${on.kills} REAL kills`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${on.fingerprint.length}`);
  if (J(on.fingerprint) === J(off.fingerprint))
    pass(`AC1/AC2: srand stream BYTE-IDENTICAL FRENZY ON vs OFF — the meter opens NO RNG stream`);
  else fail(`srand diverged ON vs OFF — on=${J(on.fingerprint).slice(0, 60)} off=${J(off.fingerprint).slice(0, 60)}`);
  if (off.stacks === 0) pass(`OFF: kills add zero stacks (feature disabled ⇒ no meter)`);
  else fail(`OFF leaked stacks: ${off.stacks}`);
  if (on.stacks > 0) pass(`ON: the same kills DO fill the meter (stacks=${on.stacks}) — proves the probe exercised the real increment`);
  else fail(`ON did not fill the meter: ${J(on)}`);
  // determinism: same seed reproduces the same fingerprint
  const on2 = d.frenzySrandProbe(true, SEED, N);
  if (J(on.fingerprint) === J(on2.fingerprint))
    pass(`determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`determinism broke`);

  // ---------- [AC1 save byte-id]: stacks>0 ⇒ same save.v1 bytes as stacks=0, no frenzy key ----------
  d.frenzyReset();
  const sb = d.frenzySaveByteId();
  if (sb.byteId && !sb.hasKey) pass(`AC1: a save with stacks>0 is BYTE-IDENTICAL to a stacks=0 save, no "frenzy" key (transient, out of serializeSave)`);
  else fail(`AC1 save byte-id broke: ${J(sb)}`);
  if (sb.afterLoadStacks === 0) pass(`AC4: loadSave rehydrates frenzyStacks==0 (reset per run) — the meter is NOT persisted`);
  else fail(`AC4 leaked stacks through load: ${sb.afterLoadStacks}`);

  // ---------- [AC3 build-up]: kill within window ⇒ stacks + atkspd + dmg rise ----------
  d.frenzyReset();
  const base = d.frenzyState();
  d.frenzyKill();                       // first kill after decay ⇒ re-arm at 1
  const k1 = d.frenzyState();
  d.frenzyKill(); d.frenzyKill();       // two more within window ⇒ 3
  const k3 = d.frenzyState();
  if (k1.stacks === 1 && k3.stacks === 3)
    pass(`AC3 build-up: first kill re-arms to 1, chaining within the window climbs to ${k3.stacks} stacks`);
  else fail(`AC3 build-up wrong: k1=${k1.stacks} k3=${k3.stacks}`);
  if (k3.atkspd === base.atkspd + 3 * FRENZY.perStack.atkspd && k3.atkspdContrib === 3 * FRENZY.perStack.atkspd)
    pass(`AC3 atk-speed: 3 stacks add +${3 * FRENZY.perStack.atkspd} to heroAtkspd (${base.atkspd} → ${k3.atkspd}) under the shared cap`);
  else fail(`AC3 atkspd wrong: base=${base.atkspd} k3=${k3.atkspd} contrib=${k3.atkspdContrib}`);
  // dmg: hitEnemy at N stacks vs 0 stacks, exact per-stack %
  const dmg0 = d.frenzyHitProbe(0).dmg;
  const dmg5 = d.frenzyHitProbe(5);
  const expectedMul = 1 + 5 * FRENZY.perStack.dmgPct / 100;
  if (dmg0 > 0 && Math.abs(dmg5.dmg / dmg0 - expectedMul) < 0.02 && dmg5.dmgMul === +expectedMul.toFixed(4))
    pass(`AC3 dmg: hitEnemy at 5 stacks deals ×${expectedMul} (${dmg0} → ${dmg5.dmg}) — +${FRENZY.perStack.dmgPct}%/stack, deterministic`);
  else fail(`AC3 dmg wrong: dmg0=${dmg0} dmg5=${dmg5.dmg} ratio=${(dmg5.dmg / dmg0).toFixed(4)} expected=${expectedMul}`);
  // cap: never exceeds maxStacks
  d.frenzyReset(); for (let i = 0; i < FRENZY.maxStacks + 4; i++) d.frenzyKill();
  const cap = d.frenzyState();
  if (cap.stacks === FRENZY.maxStacks) pass(`AC3 cap: stacks clamp at maxStacks=${FRENZY.maxStacks} (${FRENZY.maxStacks + 4} kills → ${cap.stacks})`);
  else fail(`AC3 cap wrong: ${cap.stacks}`);

  // ---------- [AC3 decay]: stop killing ⇒ 1 stack lost every decayEvery s ----------
  d.frenzyReset(); for (let i = 0; i < 4; i++) d.frenzyKill();     // 4 stacks, frenzyT = window
  let st = d.frenzyState();
  if (st.stacks === 4 && st.t > 0) pass(`AC3 decay setup: 4 stacks, window timer live (t=${st.t}s)`);
  else fail(`AC3 decay setup wrong: ${J(st)}`);
  // wind the window down to 0 (single steps, mirroring the game loop) — no stacks lost yet
  st = d.frenzyStep(FRENZY.window);
  if (st.stacks === 4) pass(`AC3 decay: inside/at the window the meter HOLDS (t≤0 now, stacks still ${st.stacks})`);
  else fail(`AC3 decay lost stacks too early: ${J(st)}`);
  // now each decayEvery s drops exactly 1 stack
  const seq = [];
  for (let i = 0; i < 4; i++) { st = d.frenzyStep(FRENZY.decayEvery); seq.push(st.stacks); }
  if (J(seq) === J([3, 2, 1, 0])) pass(`AC3 decay: after the window, 1 stack lost every ${FRENZY.decayEvery}s → ${J(seq)} down to 0`);
  else fail(`AC3 decay sequence wrong: ${J(seq)}`);
  // fractional accumulation: two half-decayEvery steps drop 1 stack (accumulator, not per-call reset)
  d.frenzyReset(); for (let i = 0; i < 2; i++) d.frenzyKill(); d.frenzyStep(FRENZY.window);
  const h1 = d.frenzyStep(FRENZY.decayEvery / 2).stacks, h2 = d.frenzyStep(FRENZY.decayEvery / 2).stacks;
  if (h1 === 2 && h2 === 1) pass(`AC3 decay: the decay accumulator is GRADUAL — two half-steps (${h1}→after 2nd ${h2}) drop 1 stack`);
  else fail(`AC3 decay accumulator wrong: h1=${h1} h2=${h2}`);

  // ---------- [OFF path]: kill switch reports disabled + no build-up / no buff ----------
  d.frenzyReset(); d.frenzyEnable(false);
  d.frenzyKill(); d.frenzyKill(); d.frenzyKill();
  const offState = d.frenzyState();
  if (!offState.enabled && offState.stacks === 0 && offState.atkspdContrib === 0 && offState.dmgMul === 1)
    pass(`OFF: frenzyEnable(false) ⇒ kills add 0 stacks, +0 atkspd, ×1 dmg (hard-gated no-op)`);
  else fail(`OFF path wrong: ${J(offState)}`);
  d.frenzyEnable(true);

  // ---------- [REG]: Afijos de Arma srand probe stays ON==OFF (no regression from the frenzy seams) ----------
  const wa = { on: d.waSrandProbe(true, 0x1768c0de, 24), off: d.waSrandProbe(false, 0x1768c0de, 24) };
  if (J(wa.on.fingerprint) === J(wa.off.fingerprint)) pass(`REG: Afijos de Arma srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Afijos srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1773 frenzy-meter harness: ALL PASS" : "\n❌ CAS-1773 frenzy-meter harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
