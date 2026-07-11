// ---------------------------------------------------------------------------
// CAS-2072 (Build for CAS-2071 / EVO CAS-2071) — VARIEDAD DE ENCUENTROS (variantes de COMPORTAMIENTO).
// A THIN, additive, DARK layer: behaviour variants (Acechador / Bastión / Frágil) that reuse the mob sprite +
// the shared windup→strike→recover AI and ONLY modulate stats on a CLONE of the tpl (mirror applyAffix/
// applyZoneScale). A procedural marker (tint/label) reuses the affix render path — $0 art. Gated on
// ENCOUNTER_VARIANTS.enabled (default false ⇒ maybeVariant returns on its first line ⇒ 0 draws ⇒ byte-id HEAD).
//
// DOM-free harness: imports sim/sim.js directly and drives the REAL dev.variant* hooks (variantEnable / variantMods
// / variantAssign / variantSrandProbe / variantPoiseTest) over a parked hero. The child QA re-verifies the
// OBSERVABLE (each variant EXHIBITS its gimmick against the hero) on the served build.
//
//   [AC0]  [OFF=BYTE-ID] enabled:false ⇒ a fixed spawn script's gameplay-srand fingerprint is deterministic ×2
//          AND produces ZERO variants (maybeVariant no-ops before any draw).
//   [AC1]  [RNG-NEUTRAL STRONG] the srand fingerprint is BYTE-IDENTICAL ON vs OFF (variant draws come only from the
//          dedicated enemyVariantRng), while ON actually assigns variants (non-vacuous).
//   [AC2]  [ACECHADOR] windup < baseline (and ≥ windupFloor, floor kicks in on a low-windup mob); lunge > baseline.
//   [AC3]  [BASTIÓN] one LIGHT hit does NOT break postura; a combo/heavy DOES; ceiling == round(elite.max × mul);
//          strictly tankier than a plain elite.
//   [AC4]  [FRÁGIL] hp == round(base × hpMul); dies in FEWER hits; spd > baseline.
//   [AC5]  [CLONE SAFETY] the shared ETPL rows are byte-identical after baking many variants (never mutated).
//   [AC6]  [DETERMINISM] same (spawnerIdx, x, y) ⇒ same variant ×2, independent of spawn order.
//
// Run: node tools/cas2071-variants.mjs   (expects a clean PASS twice — determinism proof)
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ENCOUNTER_VARIANTS, POISE, ETPL } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;
const G = sim.G;

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

// HEAD default of the master flag (captured before any test arms it). Must be false (ships DARK).
const EV_DEFAULT = ENCOUNTER_VARIANTS.enabled;

function runAll(tag) {
  const fp = [];   // determinism fingerprint accumulated across ACs
  sim.createHero("VariantQA", "warrior");
  ENCOUNTER_VARIANTS.enabled = EV_DEFAULT;   // isolate: restore the HEAD default at the top of each run

  // ---- AC0: knob present, DARK default, OFF ⇒ 0 variants + deterministic srand fingerprint ----
  {
    if (EV_DEFAULT === false) pass("AC0 enabled default=false (ships DARK)");
    else fail(`AC0 enabled should default false, got ${EV_DEFAULT}`);
    const need = ["rngSeed", "chancePerZone", "markerLabel", "variants", "byZone"];
    const miss = need.filter(k => !(k in ENCOUNTER_VARIANTS));
    if (!miss.length) pass(`AC0 knob shape present (rngSeed=0x${(ENCOUNTER_VARIANTS.rngSeed >>> 0).toString(16)})`);
    else fail(`AC0 missing knob keys: ${J(miss)}`);
    const a = d.variantSrandProbe(false, 0xC0FFEE, 24);
    const b = d.variantSrandProbe(false, 0xC0FFEE, 24);
    if (a.variantCount === 0) pass("AC0 OFF produces ZERO variants (maybeVariant no-op)");
    else fail(`AC0 OFF should yield 0 variants, got ${a.variantCount}`);
    if (J(a.fingerprint) === J(b.fingerprint)) pass("AC0 OFF srand fingerprint deterministic ×2");
    else fail("AC0 OFF fingerprint not deterministic");
    fp.push("AC0", EV_DEFAULT, a.variantCount, a.fingerprint.length);
  }

  // ---- AC1: RNG-neutral STRONG — srand fingerprint byte-identical ON vs OFF, ON non-vacuous ----
  {
    const off = d.variantSrandProbe(false, 0xBADF00D, 24);
    const on = d.variantSrandProbe(true, 0xBADF00D, 24);
    if (J(off.fingerprint) === J(on.fingerprint)) pass("AC1 srand fingerprint byte-identical ON==OFF (variant draws never touch master srand)");
    else fail("AC1 srand fingerprint DIVERGES ON vs OFF — a variant draw leaked into master srand");
    if (on.variantCount > 0) pass(`AC1 ON assigns variants (non-vacuous: ${on.variantCount}/24, mix=${J([...new Set(on.assigned.filter(Boolean))])})`);
    else fail("AC1 ON produced 0 variants — neutrality proof would be vacuous");
    if (off.variantCount === 0) pass("AC1 OFF still 0 variants");
    else fail(`AC1 OFF should be 0, got ${off.variantCount}`);
    fp.push("AC1", on.variantCount, on.assigned.join(","));
  }

  // ---- AC2: Acechador — shorter windup (with a floor) + longer lunge ----
  {
    const r = d.variantMods("stalker", "wolf", "forest");
    const V = ENCOUNTER_VARIANTS.variants.stalker;
    const expectW = Math.max(V.windupFloor, r.base.windup * V.windupMul);
    if (r.variant.windup < r.base.windup) pass(`AC2 windup shortened ${r.base.windup}→${r.variant.windup} (parry/dodge window tighter)`);
    else fail(`AC2 windup not shortened: base ${r.base.windup} variant ${r.variant.windup}`);
    if (Math.abs(r.variant.windup - expectW) < 1e-9) pass(`AC2 windup == max(floor,base×mul) = ${r.variant.windup}`);
    else fail(`AC2 windup expected ${expectW}, got ${r.variant.windup}`);
    if (r.variant.windup >= V.windupFloor - 1e-9) pass(`AC2 windup ≥ floor ${V.windupFloor} (still parryable)`);
    else fail(`AC2 windup ${r.variant.windup} below floor ${V.windupFloor}`);
    if (r.variant.lunge > r.base.lunge) pass(`AC2 lunge lengthened ${r.base.lunge}→${r.variant.lunge}`);
    else fail(`AC2 lunge not lengthened: base ${r.base.lunge} variant ${r.variant.lunge}`);
    // floor actually clamps on a low-windup mob (rat windup 0.35 × 0.70 = 0.245 < floor 0.28)
    const rr = d.variantMods("stalker", "rat", "forest");
    if (rr.base.windup * V.windupMul < V.windupFloor && Math.abs(rr.variant.windup - V.windupFloor) < 1e-9)
      pass(`AC2 windupFloor clamps a low-windup mob (rat ${rr.base.windup}→${rr.variant.windup})`);
    else fail(`AC2 floor clamp failed: rat base ${rr.base.windup} variant ${rr.variant.windup} (floor ${V.windupFloor})`);
    fp.push("AC2", r.variant.windup, r.variant.lunge, rr.variant.windup);
  }

  // ---- AC3: Bastión — light no-break / combo breaks / ceiling scales / tankier than elite ----
  {
    const p = d.variantPoiseTest("bastion", "orc", "caves");
    if (p.ceiling === p.expectCeiling) pass(`AC3 ceiling == round(elite.max×${p.poiseMul}) = ${p.ceiling}`);
    else fail(`AC3 ceiling ${p.ceiling} != expected ${p.expectCeiling}`);
    if (!p.oneLightStagger && p.oneLightPoise < p.ceiling) pass(`AC3 single LIGHT hit does NOT break (poise ${p.oneLightPoise} < ${p.ceiling})`);
    else fail(`AC3 single light hit broke postura (poise ${p.oneLightPoise}, stagger ${p.oneLightStagger})`);
    if (p.bastionLightStaggered && p.bastionLightHits > 1) pass(`AC3 a combo of lights DOES break it (${p.bastionLightHits} hits)`);
    else fail(`AC3 light combo failed to break: ${J({ hits: p.bastionLightHits, st: p.bastionLightStaggered })}`);
    if (p.bastionHeavyStaggered && p.bastionHeavyHits < p.bastionLightHits) pass(`AC3 heavies break faster (${p.bastionHeavyHits} < ${p.bastionLightHits})`);
    else fail(`AC3 heavy combo not faster: ${J({ heavy: p.bastionHeavyHits, light: p.bastionLightHits })}`);
    if (p.ceiling > p.eliteCeiling && p.bastionLightHits > p.eliteLightHits)
      pass(`AC3 strictly tankier than a plain elite (ceiling ${p.ceiling}>${p.eliteCeiling}, hits ${p.bastionLightHits}>${p.eliteLightHits})`);
    else fail(`AC3 not tankier than elite: ${J(p)}`);
    fp.push("AC3", p.ceiling, p.bastionLightHits, p.bastionHeavyHits, p.eliteLightHits);
  }

  // ---- AC4: Frágil — low hp (exact), dies in fewer hits, faster ----
  {
    const r = d.variantMods("glass", "orc", "abyss");
    const V = ENCOUNTER_VARIANTS.variants.glass;
    const expectHp = Math.round(r.base.hp * V.hpMul);
    if (r.variant.hp === expectHp) pass(`AC4 hp == round(base×${V.hpMul}) = ${r.variant.hp} (base ${r.base.hp})`);
    else fail(`AC4 hp ${r.variant.hp} != round(${r.base.hp}×${V.hpMul})=${expectHp}`);
    const D = 20; // fixed per-hit damage oracle
    const baseHits = Math.ceil(r.base.hp / D), varHits = Math.ceil(r.variant.hp / D);
    if (varHits < baseHits) pass(`AC4 dies in fewer hits @${D}dmg (${varHits} < ${baseHits}) — rewards a wide arc`);
    else fail(`AC4 not fewer hits: base ${baseHits} variant ${varHits}`);
    if (r.variant.spd > r.base.spd) pass(`AC4 spd raised ${r.base.spd}→${r.variant.spd} (punishes if ignored)`);
    else fail(`AC4 spd not raised: base ${r.base.spd} variant ${r.variant.spd}`);
    fp.push("AC4", r.variant.hp, varHits, r.variant.spd);
  }

  // ---- AC5: clone safety — the shared ETPL rows are never mutated ----
  {
    const rows = ["wolf", "orc", "skeleton", "rat"];
    const before = {}; for (const k of rows) before[k] = J(ETPL[k]);
    // bake a LOT of variants across mobs/zones through the REAL paths
    for (const id of ["stalker", "bastion", "glass"]) for (const t of rows) { d.variantMods(id, t, "abyss"); }
    for (let k = 0; k < 40; k++) d.variantAssign("forest", k, 100 + k * 13, 200 + k * 7, "wolf");
    d.variantPoiseTest("bastion", "orc", "caves");
    let clean = true;
    for (const k of rows) if (J(ETPL[k]) !== before[k]) { clean = false; fail(`AC5 ETPL.${k} MUTATED by variant bake`); }
    if (clean) pass("AC5 ETPL rows byte-identical after baking variants (clone-not-mutate)");
    fp.push("AC5", clean);
  }

  // ---- AC6: determinism of assignment — same (idx,x,y) ⇒ same variant ×2 ----
  {
    ENCOUNTER_VARIANTS.enabled = true;
    const probe = [];
    for (let k = 0; k < 40; k++) probe.push(d.variantAssign("abyss", k, 300 + k * 9, 140 + k * 17, "wolf"));
    const probe2 = [];
    for (let k = 0; k < 40; k++) probe2.push(d.variantAssign("abyss", k, 300 + k * 9, 140 + k * 17, "wolf"));
    if (J(probe) === J(probe2)) pass("AC6 same (idx,x,y) → same variant assignment ×2 (position-deterministic)");
    else fail("AC6 assignment not reproducible for identical positions");
    const assigned = probe.filter(Boolean);
    if (assigned.length > 0 && assigned.length < probe.length) pass(`AC6 a mix of base + variants (${assigned.length}/${probe.length} variant, chance-gated)`);
    else fail(`AC6 expected a partial mix, got ${assigned.length}/${probe.length}`);
    // a single fixed position is stable regardless of what ran before it
    const one = d.variantAssign("abyss", 7, 555, 333, "wolf");
    const oneAgain = d.variantAssign("abyss", 7, 555, 333, "wolf");
    if (one === oneAgain) pass(`AC6 single fixed (idx,x,y) stable across calls (=${one})`);
    else fail(`AC6 single-position instability: ${one} vs ${oneAgain}`);
    ENCOUNTER_VARIANTS.enabled = EV_DEFAULT;
    fp.push("AC6", probe.join(","), one);
  }

  return fp.join("|");
}

// Determinism proof: run the whole suite TWICE — the accumulated fingerprint must be byte-identical.
const fp1 = runAll("run#1");
const fp2 = runAll("run#2");
if (fp1 === fp2) pass("DETERMINISM run#1 fingerprint == run#2 (byte-identical)");
else { fail("DETERMINISM run#1 != run#2"); log(`fp1=${fp1}`); log(`fp2=${fp2}`); }

// restore the HEAD default so the module is left DARK
ENCOUNTER_VARIANTS.enabled = EV_DEFAULT;

log(ok ? "\nPASS — CAS-2072 encounter variants (all AC0–AC6)" : "\nFAIL — see ✖ above");
process.exit(ok ? 0 : 1);
