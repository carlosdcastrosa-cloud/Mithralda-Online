// ---------------------------------------------------------------------------
// CAS-1791 (build for CAS-1790) — TELEGRAFÍA DE ATAQUE ENEMIGO (heavy attack wind-ups).
// Heavy units (boss/champion/capstone/elite) gain a readable warning before a heavy hit:
//   M1 — a lead-time FLOOR on the wind-up (deterministic arithmetic, 0 RNG draws), so parry
//        (150ms) + dash always have a fair, consistent reaction window vs the archetype's native
//        wind-up. Basic mobs are EXACT (heavyOnly).
//   M2 — a procedural, 100%-cosmetic cue (addFx only, never srand): a single contracting ring on
//        the heavy unit + an anticipatory GROUND mark for the radial bursts that today erupt with
//        no warning (boss ground-wave, capstone enraged slam, champion special slam). The burst
//        resolves EXACTLY as before (same projectiles: count / kind / dmg / timing).
//
// HARD-GATED: TELEGRAPH.enabled=false ⇒ armTelegraph is never called (guard at the wind-up entry)
// ⇒ 0 FX, 0 wind-up change, 0 reads ⇒ sim + save.v1 byte-identical to HEAD. The cue rides addFx
// (no combat RNG, no seeded fxRng), so the srand stream is BYTE-IDENTICAL ON vs OFF even when a
// heavy wind-up actually FIRES (incl. the boss ground-wave). NO save key: presentation + transient.
//
// DOM-FREE harness: imports sim/sim.js directly and drives the REAL wired path (dev.telegraph* →
// updateEnemies). The live QA (CAS-1793) re-verifies the cue + real reaction window in a browser.
//
// Proves:
//   [content]        the TELEGRAPH knob is present (enabled, leadMs=300, heavyOnly).
//   [AC-floor]       a PESADO with a short native wind-up (bat 0.28s) is floored to ≥leadMs (0.30s);
//                    an orc (0.82s, already ≥floor) keeps its wind-up (the floor is a MAX, not a set).
//   [AC-floor-basic] a BASIC mob (not heavy) is EXACT — wind-up untouched, NO cue spawned (heavyOnly).
//   [AC-cue]         a heavy in wind-up spawns the cosmetic contracting-ring cue.
//   [AC-burst]       a burst-armed boss spawns a pre-warn GROUND mark at wind-up AND still emits the
//                    SAME radial projectiles (count/kind/dmg) at the strike instant — mark is pre-warn only.
//   [AC-RNG-STRONG]  a 2×24 FIXED srand script around a REAL heavy wind-up FIRING (→ ground-wave) +
//                    scripted heavy kills is BYTE-IDENTICAL with TELEGRAPH ON vs OFF (0 srand consumed).
//   [AC-SAVE]        save.v1 is byte-identical with the knob ON vs OFF, no telegraph key (transient).
//   [OFF]            TELEGRAPH.enabled=false ⇒ heavy wind-up unchanged, NO cue, NO mark (hard-gated no-op).
//   [REG]            Parry (CAS-1785) + Frenzy (CAS-1773) srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1790-telegraph.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { TELEGRAPH } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that
// touch audio.sfx (bossAtk whoosh, killEnemy loot sfx, ehurt) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  sim.createHero("TelegraphBot", "warrior");
  d.telegraphEnable(true);

  // ---------- content sanity: the knob ----------
  const meta = d.telegraphMeta();
  if (meta.enabled && meta.leadMs === 300 && meta.heavyOnly === true)
    pass(`content: TELEGRAPH knob present (leadMs=${meta.leadMs} heavyOnly=${meta.heavyOnly})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC-floor]: a heavy short wind-up is floored to ≥leadMs ----------
  const hb = d.telegraphHeavyProbe("bat");     // bat native windup 0.28s (< 0.30 floor)
  if (hb.isHeavy && hb.state === "windup" && hb.windupBefore === 0.28 && hb.windupAfter === hb.floorS && hb.windupAfter >= hb.floorS)
    pass(`AC-floor: a heavy bat's wind-up ${hb.windupBefore}s is floored UP to ${hb.windupAfter}s (≥leadMs ${hb.floorS}s) — 0-RNG timing`);
  else fail(`AC-floor (raise) broke: ${J(hb)}`);
  if (hb.cueSpawned)
    pass(`AC-cue: the heavy in wind-up spawns the cosmetic contracting-ring cue`);
  else fail(`AC-cue: no telegraphmark cue spawned for a heavy: ${J(hb)}`);

  const ho = d.telegraphHeavyProbe("orc");     // orc native windup 0.82s (already ≥ floor)
  if (ho.isHeavy && ho.windupBefore === 0.82 && ho.windupAfter === 0.82 && ho.windupAfter >= ho.floorS && ho.cueSpawned)
    pass(`AC-floor: an orc's wind-up ${ho.windupBefore}s (already ≥floor) is KEPT (floor is a max, not a set) + cue spawned`);
  else fail(`AC-floor (max, not set) broke: ${J(ho)}`);

  // ---------- [AC-floor-basic]: a basic mob is EXACT — untouched, no cue ----------
  const bb = d.telegraphBasicProbe("bat");
  if (!bb.isHeavy && bb.state === "windup" && bb.windupUnchanged && bb.windupAfter === 0.28 && !bb.cueSpawned)
    pass(`AC-floor-basic: a basic bat is EXACT (wind-up ${bb.windupAfter}s unchanged, no cue) — heavyOnly`);
  else fail(`AC-floor-basic broke: ${J(bb)}`);

  // ---------- [AC-burst]: pre-warn ground mark + SAME radial projectiles ----------
  const br = d.telegraphBurstProbe();
  if (br.markSpawned)
    pass(`AC-burst: a burst-armed boss spawns an anticipatory GROUND mark at wind-up entry`);
  else fail(`AC-burst: no ground mark spawned: ${J(br)}`);
  if (br.runeCount === 10 && br.allRune && br.runeDmg === 18)
    pass(`AC-burst-neutral: the ground-wave still emits the SAME ${br.runeCount} rune projectiles (dmg=${br.runeDmg}) at strike — mark is pre-warn only`);
  else fail(`AC-burst-neutral broke (projectiles changed): ${J(br)}`);

  // ---------- [AC-RNG-STRONG]: 48-draw fixed srand script around a REAL heavy wind-up FIRING ----------
  const SEED = 0x1790c0de, N = 24;
  const on = d.telegraphSrandProbe(true, SEED, N, true);    // fingerprint AROUND a real heavy windup→strike (ground-wave)
  const off = d.telegraphSrandProbe(false, SEED, N, true);
  const base = d.telegraphSrandProbe(true, SEED, N, false); // clean baseline: NO wind-up injected
  if (on.fingerprint.length === 48) pass(`AC-RNG-STRONG: fixed script draws ${on.fingerprint.length} srand values (2×${N}) around a real heavy wind-up`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${on.fingerprint.length}`);
  if (on.fired)
    pass(`AC-RNG: the ON probe DID drive a REAL heavy wind-up to strike (ground-wave) — proves the probe exercised the real wired path`);
  else fail(`RNG probe never fired a heavy strike: ${J({ fired: on.fired })}`);
  if (J(on.fingerprint) === J(off.fingerprint))
    pass(`AC-RNG (ON==OFF): srand stream BYTE-IDENTICAL TELEGRAPH ON vs OFF — the cue opens NO RNG stream (0 draws even when a heavy fires)`);
  else fail(`srand diverged ON vs OFF — on=${J(on.fingerprint).slice(0, 60)} off=${J(off.fingerprint).slice(0, 60)}`);
  if (J(on.fingerprint) === J(base.fingerprint))
    pass(`AC-RNG (ON==baseline): a real heavy wind-up FIRING consumes 0 srand — the stream matches a run with NO wind-up injected (strongest guardrail)`);
  else fail(`the wind-up firing consumed srand: on=${J(on.fingerprint).slice(0, 60)} base=${J(base.fingerprint).slice(0, 60)}`);
  const on2 = d.telegraphSrandProbe(true, SEED, N, true);
  if (J(on.fingerprint) === J(on2.fingerprint)) pass(`determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`determinism broke`);

  // ---------- [AC-SAVE]: save.v1 byte-identical ON vs OFF, no telegraph key ----------
  const sb = d.telegraphSaveByteId();
  if (sb.byteId && !sb.hasKey)
    pass(`AC-SAVE: save.v1 is BYTE-IDENTICAL with TELEGRAPH ON vs OFF, no "telegraph" key (presentation + transient)`);
  else fail(`AC-SAVE byte-id broke: ${J(sb)}`);

  // ---------- [OFF]: kill switch ⇒ heavy wind-up unchanged, no cue, no mark ----------
  d.telegraphEnable(false);
  const offHeavy = d.telegraphHeavyProbe("bat");
  if (offHeavy.isHeavy && offHeavy.windupAfter === 0.28 && !offHeavy.cueSpawned && !offHeavy.markSpawned)
    pass(`OFF: enabled=false ⇒ even a heavy bat keeps its native ${offHeavy.windupAfter}s wind-up, NO cue, NO mark (hard-gated no-op)`);
  else fail(`OFF path wrong: ${J(offHeavy)}`);
  const offBurst = d.telegraphBurstProbe();
  if (!offBurst.markSpawned && offBurst.runeCount === 10 && offBurst.runeDmg === 18)
    pass(`OFF: a boss ground-wave still fires the SAME ${offBurst.runeCount} runes with NO pre-warn mark — identical to HEAD`);
  else fail(`OFF burst path wrong: ${J(offBurst)}`);
  d.telegraphEnable(true);

  // ---------- [REG]: Parry + Frenzy srand probes stay ON==OFF ----------
  const pr = { on: d.parrySrandProbe(true, 0x1785c0de, 24), off: d.parrySrandProbe(false, 0x1785c0de, 24) };
  if (J(pr.on.fingerprint) === J(pr.off.fingerprint)) pass(`REG: Parry srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Parry srand regressed`);
  const fr = { on: d.frenzySrandProbe(true, 0x1773c0de, 24), off: d.frenzySrandProbe(false, 0x1773c0de, 24) };
  if (J(fr.on.fingerprint) === J(fr.off.fingerprint)) pass(`REG: Frenzy srand still BYTE-IDENTICAL ON vs OFF`);
  else fail(`REG: Frenzy srand regressed`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1790 enemy-telegraph harness: ALL PASS" : "\n❌ CAS-1790 enemy-telegraph harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
