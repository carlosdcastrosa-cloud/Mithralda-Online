// ---------------------------------------------------------------------------
// CAS-2096 (Build DARK for CAS-2094 / EVO CAS-2094) — PELIGROS DE ARENA / ENVIRONMENTAL HAZARDS (mecánica #32).
// A THIN, additive, DARK layer: procedural, TELEGRAPHED ground hazards planted during boss/elite fights that force
// repositioning. Reuses damage (damageHero(cap,ang,null,null): src=null ⇒ only the roll's i-frame evades) + status
// (statusOrBuildup/addBuildup). Gated on ARENA_HAZARDS.enabled (default false ⇒ maybeSpawnHazard returns on its first
// line ⇒ 0 draws on ANY stream ⇒ G.hazards stays [] ⇒ updateHazards/render no-op ⇒ byte-id HEAD).
//
// DOM-free harness: imports sim/sim.js directly and drives the REAL dev.hazard* hooks (hazardEnable / hazardSpawnProbe /
// hazardSrandProbe / hazardDamageProbe) over a parked hero. The child QA re-verifies the OBSERVABLE on the served build.
//
//   [AC0]  [OFF=BYTE-ID] enabled defaults false (DARK); knob shape present; OFF ⇒ the master-srand fingerprint of a fixed
//          spawn script is deterministic ×2 AND spawns ZERO hazards (maybeSpawnHazard no-ops before any draw).
//   [AC1]  [GATE] no boss/elite alive ⇒ 0 hazards even enabled; a boss present ⇒ hazards spawn.
//   [AC2]  [TELEGRAPH JUSTO] NEVER damages during the telegraph phase (≥ telegraphMs of warning), then reaches active.
//   [AC3]  [DAMAGE CAPEADO] standing in an active hazard ⇒ every tick ≤ min(dmgFlat, maxHp*dmgFracCap); status applied;
//          NEVER one-shot (hero survives a full active window from full HP).
//   [AC4]  [I-FRAME EVADE] a rolling hero (h.iframe>0) inside the hazard ⇒ 0 damage (damageHero returns early).
//   [AC5]  [RNG-NEUTRAL STRONG] the MASTER srand fingerprint is BYTE-IDENTICAL ON vs OFF (all hazard randomness draws
//          from the dedicated arenaHazardRng), while ON actually plants hazards (non-vacuous).
//   [AC6]  [SAVE/PERF] G.hazards is NOT serialized (serializeSave has no "hazard"); live count ≤ maxActive; the update
//          array reference is stable when nothing expires (no per-frame realloc).
//
// Run: node tools/cas2094-arena-hazards.mjs   (expects a clean PASS twice — determinism proof)
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ARENA_HAZARDS } from "../sim/config.js";

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
const AH_DEFAULT = ARENA_HAZARDS.enabled;

function runAll(tag) {
  const fp = [];
  sim.createHero("HazardQA", "warrior");
  ARENA_HAZARDS.enabled = AH_DEFAULT;   // isolate: restore the HEAD default at the top of each run

  // ---- AC0: knob present, DARK default, OFF ⇒ 0 hazards + deterministic master-srand fingerprint ----
  {
    if (AH_DEFAULT === false) pass("AC0 enabled default=false (ships DARK)");
    else fail(`AC0 enabled should default false, got ${AH_DEFAULT}`);
    const need = ["rngSeed", "spawnGate", "cadenceMs", "maxActive", "telegraphMs", "activeMs", "tickMs", "dmgFlat", "dmgFracCap", "radius", "minGapPx", "byZone", "types"];
    const miss = need.filter(k => !(k in ARENA_HAZARDS));
    if (!miss.length) pass(`AC0 knob shape present (rngSeed=0x${(ARENA_HAZARDS.rngSeed >>> 0).toString(16)})`);
    else fail(`AC0 missing knob keys: ${J(miss)}`);
    const a = d.hazardSrandProbe(false, 0xC0FFEE, 24);
    const b = d.hazardSrandProbe(false, 0xC0FFEE, 24);
    if (a.spawnCount === 0) pass("AC0 OFF plants ZERO hazards (maybeSpawnHazard no-op)");
    else fail(`AC0 OFF should yield 0 hazards, got ${a.spawnCount}`);
    if (J(a.fingerprint) === J(b.fingerprint)) pass("AC0 OFF master-srand fingerprint deterministic ×2");
    else fail("AC0 OFF fingerprint not deterministic");
    fp.push("AC0", AH_DEFAULT, a.spawnCount, a.fingerprint.length);
  }

  // ---- AC1: gate — no boss ⇒ 0 hazards even enabled; boss present ⇒ hazards spawn ----
  {
    const noBoss = d.hazardSpawnProbe("caldera", false, 16);
    const boss = d.hazardSpawnProbe("caldera", true, 16);
    if (noBoss.spawnedCount === 0) pass(`AC1 no boss/elite ⇒ 0 hazards (gate holds; zone=${noBoss.zone})`);
    else fail(`AC1 gate leaked: ${noBoss.spawnedCount} hazards with no boss`);
    if (boss.spawnedCount > 0) pass(`AC1 boss present ⇒ hazards spawn (${boss.spawnedCount}/16, types=${J([...new Set(boss.spawned.map(s => s.type))])})`);
    else fail("AC1 boss present but 0 hazards spawned");
    // every spawned hazard begins in the telegraph phase (never born already-damaging)
    if (boss.spawned.every(s => s.phase === "telegraph")) pass("AC1 every hazard is born in the telegraph phase (never born active)");
    else fail(`AC1 a hazard spawned outside telegraph: ${J(boss.spawned)}`);
    fp.push("AC1", noBoss.spawnedCount, boss.spawnedCount);
  }

  // ---- AC2 + AC3 + AC4: telegraph justice / capped damage+status / i-frame evade ----
  for (const type of ["magma", "poison", "ice", "collapse"]) {
    const r = d.hazardDamageProbe(type);
    const label = `[${type}]`;
    // AC2: 0 damage across the full telegraph window, then it reaches active
    if (r.telegraphDmg === 0) pass(`AC2 ${label} 0 damage during telegraph (≥${ARENA_HAZARDS.telegraphMs}ms warning)`);
    else fail(`AC2 ${label} damaged during telegraph: ${r.telegraphDmg}`);
    if (r.reachedActive) pass(`AC2 ${label} telegraph → active transition fires`);
    else fail(`AC2 ${label} never reached active`);
    // AC3: capped ticks, never one-shot, sustained (some damage), status applied when the type carries one
    if (r.ticks.length && r.maxTick <= r.cap) pass(`AC3 ${label} every tick ≤ cap=${r.cap} (maxTick=${r.maxTick}, ticks=${r.ticks.length})`);
    else fail(`AC3 ${label} tick over cap or no ticks: ${J({ cap: r.cap, maxTick: r.maxTick, ticks: r.ticks })}`);
    if (!r.oneShot && r.hpAfterStanding > 0) pass(`AC3 ${label} NEVER one-shot (hp ${r.hpAfterStanding}/${r.maxHp} after a full active window)`);
    else fail(`AC3 ${label} one-shot the hero: hp ${r.hpAfterStanding}`);
    if (r.standingTotal > 0) pass(`AC3 ${label} standing DOES take sustained damage (total=${r.standingTotal})`);
    else fail(`AC3 ${label} standing took 0 damage`);
    const def = ARENA_HAZARDS.types[type];
    if (def.status) {
      if (r.statusApplied) pass(`AC3 ${label} status "${def.status}" applied (bld=${J(r.bld)}, dots=${J(r.dots)})`);
      else fail(`AC3 ${label} status "${def.status}" NOT applied: ${J({ bld: r.bld, dots: r.dots })}`);
    } else {
      if (r.statusApplied === null) pass(`AC3 ${label} statusless type (physical-only, no ailment channel)`);
      else fail(`AC3 ${label} expected no status`);
    }
    // AC4: rolling (i-frame) ⇒ 0 damage — the HEADLINE evade
    if (r.rollingDmg === 0) pass(`AC4 ${label} rolling (i-frame) inside hazard ⇒ 0 damage (roll evades)`);
    else fail(`AC4 ${label} took ${r.rollingDmg} damage while rolling (i-frame should evade)`);
    fp.push("AC234", type, r.cap, r.maxTick, r.ticks.length, r.rollingDmg, r.statusApplied);
  }

  // ---- AC5: RNG-neutral STRONG — master srand fingerprint byte-identical ON vs OFF, ON non-vacuous ----
  {
    const off = d.hazardSrandProbe(false, 0xBADF00D, 24);
    const on = d.hazardSrandProbe(true, 0xBADF00D, 24);
    if (J(off.fingerprint) === J(on.fingerprint)) pass("AC5 master-srand fingerprint byte-identical ON==OFF (hazard draws never touch master srand)");
    else fail("AC5 master-srand fingerprint DIVERGES ON vs OFF — a hazard draw leaked into master srand");
    if (on.spawnCount > 0) pass(`AC5 ON plants hazards (non-vacuous: ${on.spawnCount}/24)`);
    else fail("AC5 ON produced 0 hazards — neutrality proof would be vacuous");
    if (off.spawnCount === 0) pass("AC5 OFF still 0 hazards");
    else fail(`AC5 OFF should be 0, got ${off.spawnCount}`);
    fp.push("AC5", on.spawnCount);
  }

  // ---- AC6: save-neutral + maxActive cap + stable array reference ----
  {
    const blob = sim.serializeSave();
    const s = J(blob);
    if (s.indexOf("hazard") < 0) pass("AC6 serializeSave has NO hazard field (G.hazards transient, never serialized)");
    else fail("AC6 hazard leaked into the save blob");
    // maxActive: drive many spawns through the REAL update loop WITHOUT clearing between; the live count must hold ≤ cap
    d.hazardEnable(true);
    d.hazardClear();
    G.enemies.length = 0; G.enemies.push({ isBoss: true, dead: false, hp: 1000, x: G.hero.x + 400, y: G.hero.y, tpl: { size: 16 } });
    let overCap = false;
    for (let i = 0; i < 40; i++) { G.hazardT = ARENA_HAZARDS.cadenceMs; sim.update(16); if (G.hazards.length > ARENA_HAZARDS.maxActive) overCap = true; }
    if (!overCap) pass(`AC6 live hazard count never exceeded maxActive=${ARENA_HAZARDS.maxActive}`);
    else fail(`AC6 hazard count exceeded maxActive=${ARENA_HAZARDS.maxActive}`);
    // stable array reference when nothing expires (no realloc on a quiet frame)
    d.hazardClear();
    const before = G.hazards;
    sim.update(16);
    if (G.hazards === before) pass("AC6 empty-frame update keeps the same G.hazards array (no per-frame realloc)");
    else fail("AC6 G.hazards array reallocated on a quiet frame");
    G.enemies.length = 0; d.hazardClear(); d.hazardEnable(AH_DEFAULT);
    fp.push("AC6", overCap);
  }

  ARENA_HAZARDS.enabled = AH_DEFAULT;
  return fp.join("|");
}

// Determinism proof: run the whole suite TWICE — the accumulated fingerprint must be byte-identical.
const fp1 = runAll("run#1");
const fp2 = runAll("run#2");
if (fp1 === fp2) pass("DETERMINISM run#1 fingerprint == run#2 (byte-identical)");
else { fail("DETERMINISM run#1 != run#2"); log(`fp1=${fp1}`); log(`fp2=${fp2}`); }

// restore the HEAD default so the module is left DARK
ARENA_HAZARDS.enabled = AH_DEFAULT;

log(ok ? "\nPASS — CAS-2096 arena hazards (all AC0–AC6)" : "\nFAIL — see ✖ above");
process.exit(ok ? 0 : 1);
