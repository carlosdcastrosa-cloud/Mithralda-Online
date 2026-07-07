// ---------------------------------------------------------------------------
// CAS-1764 (build for CAS-1763) — PACTOS DE PODER (Power Pacts). An OPT-IN, stackable difficulty
// covenant: the player ranks up pacts (own store mithralda.pacts.v1), each contributing HEAT + a per-rank
// effect (enemy hp/dmg/spd, élite promotion rate, heal cut). HEAT scales the endgame rewards (Esencia +
// loot/unique/rune chance). PURE READ-SIDE: the ranks persist as a cross-run PREFERENCE and their effects
// are DERIVED IN THE SEAM each run — deterministic arithmetic on an already-existing stat/heal/essence
// value, or a threshold shift on a roll that ALREADY fires. It adds/removes NO authoritative srand draw.
//
// This is a DOM-FREE harness: it imports sim/sim.js directly (no browser) and drives the REAL sim hooks
// (dev.pacts*). The live QA (Deploy child) re-verifies the panel/HUD/persistence in a real browser.
//
// Proves:
//   [OFF byte-id]  PACTS.enabled=false ⇒ heat 0, 0 store, and the gameplay srand stream is BYTE-IDENTICAL
//                  to enabled+heat=0 and to a stat pact active (RNG-neutral STRONG by construction).
//   [heat=0 byte-id] enabled but no ranks ⇒ every multiplier 1.0, enemy stats unchanged, srand identical.
//   [AC-RNG-STRONG] a 48-draw (2×24) FIXED spawn/scale script with a STAT pact active (vigor r3, +45% HP)
//                  yields a srand stream IDENTICAL to OFF while the scaled mob HP DIFFERS.
//   [AC1 heat/stack] ranks raise heat; multiple pacts stack; setPactRank clamps [0,max]; cycle wraps max→0.
//   [AC2 reward]     essenceForRun + reward muls scale by 1+perHeat·min(heat,cap) with heat>0.
//   [stat effects]   enemy hp/dmg/spd move by pactStatMul; heal cut reduces player heal (pactHeal).
//   [AC3 persist]    the pact preference round-trips through its OWN blob (mithralda.pacts.v1); save.v1 untouched.
//   [REG]            Códice (CAS-1751) + Títulos (CAS-1758) srand probes stay ON==OFF (no regression).
//
// Run: node tools/cas1763-pacts.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { PACTS } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// DOM-free dependency stub: a deep no-op proxy stands in for io/audio/view so the REAL sim hooks that
// touch audio.sfx (tryPickup→takeGear in the Códice/Títulos regression probes) run without a browser.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });

try {
  // live hero so the essence seam has a subject (DOM-free createHero)
  sim.createHero("PactBot", "warrior");
  d.pactsEnable(true); d.pactsReset();

  // ---------- content sanity: the fixed table of 5 pacts ----------
  const st0 = d.pactsState();
  if (st0.enabled && st0.total === 5 && st0.active === 0 && st0.heat === 0 && st0.essMul === 1 && st0.dropMul === 1)
    pass(`content: fixed table of ${st0.total} pacts, none active, heat 0, reward muls 1.0`);
  else fail(`content wrong: ${J(st0)}`);

  // ---------- [AC-RNG-STRONG]: 48-draw fixed script — OFF == heat=0 == stat pact active ----------
  const SEED = 0x1763c0de, N = 24;   // 2×24 = 48 draws
  const off = d.pactsSrandProbe(false, null, SEED, N);        // feature OFF
  const heat0 = d.pactsSrandProbe(true, {}, SEED, N);         // enabled, no ranks
  const vigor = d.pactsSrandProbe(true, { vigor: 3 }, SEED, N); // enabled, +45% enemy HP stat pact
  if (off.fingerprint.length === 48)
    pass(`AC-RNG-STRONG: fixed script draws ${off.fingerprint.length} srand values (2×${N})`);
  else fail(`AC-RNG-STRONG: expected 48 draws, got ${off.fingerprint.length}`);
  if (J(off.fingerprint) === J(heat0.fingerprint))
    pass(`OFF byte-id + heat=0 byte-id: srand stream IDENTICAL PACTS.enabled=false vs enabled+heat=0`);
  else fail(`heat=0 srand diverged from OFF — off=${J(off.fingerprint).slice(0,60)} heat0=${J(heat0.fingerprint).slice(0,60)}`);
  if (J(off.fingerprint) === J(vigor.fingerprint))
    pass(`AC-RNG-STRONG: srand stream BYTE-IDENTICAL with a STAT pact active (vigor r3) vs OFF — 0 draw perturbation`);
  else fail(`AC-RNG-STRONG: stat pact perturbed srand — off=${J(off.fingerprint).slice(0,60)} vigor=${J(vigor.fingerprint).slice(0,60)}`);
  if (off.heat === 0 && heat0.heat === 0 && vigor.heat === 24)
    pass(`heat derivation: OFF 0, heat=0 0, vigor r3 = 24 (3×8)`);
  else fail(`heat wrong: off=${off.heat} heat0=${heat0.heat} vigor=${vigor.heat}`);
  // the SAME script MUST move the derived mob HP (feature is live) even though srand is untouched
  if (off.mobHp === heat0.mobHp && vigor.mobHp > off.mobHp && vigor.mobHp === Math.round(off.mobHp * 1.45))
    pass(`stat effect: mob HP unchanged at heat=0 (${off.mobHp}), +45% with vigor r3 (${off.mobHp}→${vigor.mobHp}) — arithmetic only`);
  else fail(`mob HP scaling wrong: off=${off.mobHp} heat0=${heat0.mobHp} vigor=${vigor.mobHp}`);

  // ---------- [AC1]: heat + stacking + clamp + cycle wrap ----------
  d.pactsReset();
  d.pactsSetRank("cruento", 3);     // 3×10 = 30
  d.pactsSetRank("vigor", 2);       // 2×8  = 16
  const stack = d.pactsState();
  if (stack.heat === 46 && stack.active === 2)
    pass(`AC1: pacts STACK — cruento r3 (30) + vigor r2 (16) = heat 46, 2 active`);
  else fail(`AC1: stacking wrong: ${J(stack)}`);
  const clampHi = d.pactsSetRank("cruento", 99).state.items.find((i) => i.id === "cruento").rank; // max 5
  const clampLo = d.pactsSetRank("vigor", -4).state.items.find((i) => i.id === "vigor").rank;      // → 0 (cleared)
  if (clampHi === 5 && clampLo === 0)
    pass(`AC1: setPactRank clamps to [0,max] — cruento 99→5, vigor -4→0`);
  else fail(`AC1: clamp wrong: cruento=${clampHi} vigor=${clampLo}`);
  d.pactsReset();
  const cyc = [];
  for (let i = 0; i < 5; i++) cyc.push(d.pactsCycle("celeridad").state.items.find((x) => x.id === "celeridad").rank); // max 3 → 1,2,3,0,1
  if (J(cyc) === J([1, 2, 3, 0, 1]))
    pass(`AC1: cyclePactRank wraps past max back to 0 — celeridad (max 3): ${J(cyc)}`);
  else fail(`AC1: cycle wrap wrong: ${J(cyc)}`);

  // ---------- [AC2]: reward multipliers + essenceForRun scale with heat ----------
  d.pactsReset();
  d.pactsSetRank("cruento", 5);     // heat 50
  const rw = d.pactsState();
  const expEss = +(1 + PACTS.essencePerHeat * 50).toFixed(6), expDrop = +(1 + PACTS.dropPerHeat * 50).toFixed(6);
  if (rw.essMul === expEss && rw.dropMul === expDrop)
    pass(`AC2: reward muls at heat 50 — Esencia ×${rw.essMul}, botín ×${rw.dropMul} (1+perHeat·heat)`);
  else fail(`AC2: reward muls wrong: ess=${rw.essMul} (exp ${expEss}) drop=${rw.dropMul} (exp ${expDrop})`);
  const essBase = (d.pactsReset(), d.pactEssence(20, 3));
  d.pactsSetRank("cruento", 5);
  const essHot = d.pactEssence(20, 3);
  if (essHot === Math.round(essBase * expEss) && essHot > essBase)
    pass(`AC2: essenceForRun scales — ${essBase} → ${essHot} (×${expEss}) at heat 50`);
  else fail(`AC2: essence scaling wrong: base=${essBase} heat=${essHot} exp=${Math.round(essBase * expEss)}`);
  // reward heat is CAPPED at rewardHeatCap (effects still stack past it)
  d.pactsReset(); d.pactsSetRank("cruento", 5); d.pactsSetRank("vigor", 5); d.pactsSetRank("celeridad", 3);
  d.pactsSetRank("jauria", 3); d.pactsSetRank("fragil", 3); // heat = 50+40+36+45+36 = 207 > cap 150
  const capped = d.pactsState();
  const expCapEss = +(1 + PACTS.essencePerHeat * PACTS.rewardHeatCap).toFixed(6);
  if (capped.heat === 207 && capped.essMul === expCapEss)
    pass(`AC2: reward heat CLAMPED at ${PACTS.rewardHeatCap} — heat 207 stacks but Esencia ×${capped.essMul} uses the cap`);
  else fail(`AC2: reward cap wrong: heat=${capped.heat} essMul=${capped.essMul} exp=${expCapEss}`);

  // ---------- stat effects: enemy dmg/spd move; a stat pact is pure arithmetic ----------
  d.pactsReset();
  const base = d.pactMobScale("skeleton", "frost");
  d.pactsSetRank("cruento", 4);      // +40% dmg
  d.pactsSetRank("celeridad", 2);    // +16% spd
  const scaled = d.pactMobScale("skeleton", "frost");
  if (scaled.dmg === Math.round(base.dmg * 1.4) && scaled.spd === Math.max(1, Math.round(base.spd * 1.16)))
    pass(`stat effects: enemy dmg ${base.dmg}→${scaled.dmg} (+40%), spd ${base.spd}→${scaled.spd} (+16%)`);
  else fail(`stat effects wrong: base=${J(base)} scaled=${J(scaled)}`);

  // ---------- [AC3]: pact preference round-trips through its OWN blob (save.v1 untouched) ----------
  d.pactsReset();
  d.pactsSetRank("cruento", 3); d.pactsSetRank("jauria", 2);
  const rt = d.pactsPersist();
  const rtBefore = J(rt.before.items), rtAfter = J(rt.after.items);
  if (rt.blob && rt.blob.v === 1 && rt.blob.ranks && rt.blob.ranks.cruento === 3 && rt.clearedFirst && rtBefore === rtAfter && rt.after.heat === rt.before.heat)
    pass(`AC3: pacts round-trip through mithralda.pacts.v1 blob (cleared→reloaded to the same ranks + heat)`);
  else fail(`AC3: round-trip mismatch: before=${rtBefore} after=${rtAfter} blob=${J(rt.blob)}`);
  // untrusted-blob guardrail: unknown ids dropped, ranks clamped
  sim.loadPacts({ v: 1, ranks: { cruento: 99, bogus: 4, vigor: -2 } });
  const guarded = d.pactsState();
  const cr = guarded.items.find((i) => i.id === "cruento").rank;
  const hasBogus = guarded.items.some((i) => i.id === "bogus");
  if (cr === 5 && !hasBogus && guarded.active === 1)
    pass(`AC3: loadPacts guards a tampered blob — unknown id dropped, cruento 99→5, negative rank ignored`);
  else fail(`AC3: load guard wrong: cruento=${cr} hasBogus=${hasBogus} active=${guarded.active}`);
  // save.v1 must NOT carry pacts (own store)
  const saveBlob = sim.serializeSave();
  if (saveBlob && saveBlob.pacts === undefined)
    pass(`AC3: save.v1 does NOT carry pacts (own store mithralda.pacts.v1 — save.v1 whitelist untouched)`);
  else fail(`AC3: save.v1 leaked a pacts field: ${J(saveBlob && saveBlob.pacts)}`);

  // ---------- OFF path: short-circuit EVEN WITH ranks present (heat 0, muls 1.0, setPactRank no-op) ----------
  d.pactsReset(); d.pactsSetRank("cruento", 5); // ranks present…
  d.pactsEnable(false);                          // …but disabled ⇒ nothing evaluates
  const offState = d.pactsState();
  const offSet = d.pactsSetRank("vigor", 3);
  const offSnap = sim.pactsSnap();
  if (!offState.enabled && offState.heat === 0 && offSet.ok === false && offSnap.heat === 0 && offSnap.essMul === 1 && offSnap.dropMul === 1)
    pass(`OFF: enabled=false ⇒ heat 0 + reward muls 1.0 EVEN WITH ranks stored, setPactRank no-op (short-circuit)`);
  else fail(`OFF path not clean: ${J({ offState, offSet, essMul: offSnap.essMul, snapHeat: offSnap.heat })}`);
  // OFF: a stat pact "active" in the ranks map still yields NO scaling (guard short-circuits)
  const offMob = d.pactMobScale("skeleton", "frost");
  d.pactsEnable(true); d.pactsReset(); const onBaseMob = d.pactMobScale("skeleton", "frost"); d.pactsEnable(false);
  const offMob2 = d.pactMobScale("skeleton", "frost"); d.pactsEnable(true);
  if (offMob.hp === offMob2.hp && offMob.hp === onBaseMob.hp)
    pass(`OFF: enemy scaling byte-identical to enabled+heat=0 (${offMob.hp} HP) — no seam evaluation`);
  else fail(`OFF: enemy scaling diverged: off=${offMob.hp} off2=${offMob2.hp} onBase=${onBaseMob.hp}`);

  // ---------- [REG]: Códice + Títulos srand probes stay ON==OFF (no regression from the pacts seams) ----------
  const cod = { on: d.codexSrandProbe(true, 0x1751c0de, 24), off: d.codexSrandProbe(false, 0x1751c0de, 24) };
  if (J(cod.on.fingerprint) === J(cod.off.fingerprint))
    pass(`REG: Códice srand probe still BYTE-IDENTICAL ON vs OFF (no regression)`);
  else fail(`REG: Códice srand regressed — on=${J(cod.on.fingerprint).slice(0,50)} off=${J(cod.off.fingerprint).slice(0,50)}`);
  const tit = { on: d.titlesSrandProbe(true, 0x1758c0de, 24), off: d.titlesSrandProbe(false, 0x1758c0de, 24) };
  if (J(tit.on.fingerprint) === J(tit.off.fingerprint))
    pass(`REG: Títulos srand probe still BYTE-IDENTICAL ON vs OFF (no regression)`);
  else fail(`REG: Títulos srand regressed — on=${J(tit.on.fingerprint).slice(0,50)} off=${J(tit.off.fingerprint).slice(0,50)}`);

  // ---------- determinism: same seed + ranks reproduces the same fingerprint ----------
  const r1 = d.pactsSrandProbe(true, { vigor: 3 }, SEED, N);
  const r2 = d.pactsSrandProbe(true, { vigor: 3 }, SEED, N);
  if (J(r1.fingerprint) === J(r2.fingerprint) && r1.mobHp === r2.mobHp)
    pass(`determinism: same seed + ranks reproduces the same srand stream + mob HP (Stage-2 ready)`);
  else fail(`determinism broke: r1=${r1.mobHp} r2=${r2.mobHp}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1763 pactos harness: ALL PASS" : "\n❌ CAS-1763 pactos harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
