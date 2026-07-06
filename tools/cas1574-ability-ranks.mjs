// ---------------------------------------------------------------------------
// CAS-1574 — Ability Ranks (data-driven meta-progression) logic test (headless).
//
// Drives the REAL deterministic sim (sim/sim.js) and asserts the acceptance criteria:
//   (a) each ability has >=3 buyable ranks; buying raises metaLvl, charges Esencia,
//       respects the cap and refuses at 0 essence.
//   (b) the cost curve is data-driven + strictly INCREASING per rank.
//   (c) `apply(sp,lvl)` scales the expected ONE param per ability; lvl 0 is a no-op
//       copy identical to the base (the RNG-neutral guarantee).
//   (d) ranks persist in the SAME store: serializeMeta emits rank_*, a v2 blob round-
//       trips, and a legacy blob with NO rank_* migrates to 0 (additive, no break).
//   (e) rank rows are NOT gated by t2Unlocked (buyable on a fresh meta).
//   (f) __dev.abilityRank reports {lvl,cost,ranked} for QA.
//
// Run: node tools/cas1574-ability-ranks.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ABILITY_RANKS, ABILITY_RANK_MAP, ABILITY_MAP } from "../sim/config.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const snap = () => sim.metaSnap();
const abilLvl = (k) => snap().abilities.find((a) => a.key === k).lvl;

// ============ (a)+(e) buyable, ungated, cap, accounting ====================
sim.resetMeta();
const s0 = snap();
if (s0.abilities && s0.abilities.length === 4) pass("metaSnap exposes 4 ability-rank rows"); else fail("abilities missing/short: " + JSON.stringify(s0.abilities));
if (ABILITY_RANKS.every((r) => r.cap >= 3)) pass("every ability rank has cap >= 3"); else fail("a rank cap < 3");
if (!snap().t2Unlocked) pass("fresh meta: Tier-2 locked (proves ranks buy WITHOUT the T2 gate)"); else fail("expected fresh meta t2 locked");

// buy refused with no essence
if (sim.buyMetaNode("rank_escarcha") === false && abilLvl("rank_escarcha") === 0) pass("buy refused at 0 essence"); else fail("buy leaked at 0 essence");

sim.dev.metaGrant(10000);
let e0 = snap().essence;
const c0 = ABILITY_RANK_MAP.escarcha.cost(0);
if (sim.buyMetaNode("rank_escarcha") && abilLvl("rank_escarcha") === 1 && snap().essence === e0 - c0)
  pass("buy rank_escarcha (ungated): lvl 1, spent " + c0 + " Esencia");
else fail("rank buy accounting wrong: " + JSON.stringify(snap().abilities.find((a)=>a.key==="rank_escarcha")) + " essence=" + snap().essence);

// buy to cap, then refuse
while (sim.buyMetaNode("rank_escarcha")) {}
if (abilLvl("rank_escarcha") === ABILITY_RANK_MAP.escarcha.cap && sim.buyMetaNode("rank_escarcha") === false)
  pass("rank_escarcha respects cap (" + ABILITY_RANK_MAP.escarcha.cap + "), never over-buys");
else fail("cap breached: lvl=" + abilLvl("rank_escarcha"));

// ============ (b) increasing cost curve ===================================
let inc = true; for (const r of ABILITY_RANKS) for (let l = 1; l < r.cap; l++) if (!(r.cost(l) > r.cost(l - 1))) inc = false;
if (inc) pass("cost curve strictly increasing per rank for all abilities"); else fail("a rank cost curve not increasing");

// ============ (c) apply scales the right ONE param; lvl0 = identity ========
const base = ABILITY_MAP;
// arremetida -> +dmg
if (ABILITY_RANK_MAP.arremetida.apply(base.arremetida, 2).dmg === base.arremetida.dmg + 16 && ABILITY_RANK_MAP.arremetida.apply(base.arremetida, 2).range === base.arremetida.range)
  pass("arremetida rank2: +16 dmg, range untouched"); else fail("arremetida scaling wrong");
// escarcha -> +range
if (ABILITY_RANK_MAP.escarcha.apply(base.escarcha, 3).range === base.escarcha.range + 48 && ABILITY_RANK_MAP.escarcha.apply(base.escarcha, 3).dmg === base.escarcha.dmg)
  pass("escarcha rank3: +48 range, dmg untouched"); else fail("escarcha scaling wrong");
// egida -> +dur
if (ABILITY_RANK_MAP.egida.apply(base.egida, 2).dur === base.egida.dur + 2)
  pass("egida rank2: +2s dur"); else fail("egida scaling wrong: " + ABILITY_RANK_MAP.egida.apply(base.egida, 2).dur);
// rayo -> -cd, floored at 1
if (ABILITY_RANK_MAP.rayo.apply(base.rayo, 3).cd === Math.max(1, base.rayo.cd - 1.8) && ABILITY_RANK_MAP.rayo.apply(base.rayo, 100).cd >= 1)
  pass("rayo rank3: -1.8s cd, floored at 1s"); else fail("rayo scaling wrong: " + ABILITY_RANK_MAP.rayo.apply(base.rayo, 3).cd);
// lvl 0 = identity copy (values equal base, but a distinct object — never mutates the shared entry)
let identOK = true;
for (const r of ABILITY_RANKS) { const b = base[r.abil], a = r.apply(b, 0);
  if (a === b) identOK = false; // must be a copy, not the same reference
  for (const k of ["dmg", "range", "dur", "cd", "cost"]) if ((a[k] || 0) !== (b[k] || 0)) identOK = false; }
if (identOK) pass("apply(sp,0) = value-identical COPY of base (RNG-neutral, non-mutating)"); else fail("lvl0 apply not an identity copy");

// ============ (d) persistence: same store, migration =======================
sim.resetMeta(); sim.dev.metaGrant(10000);
sim.buyMetaNode("rank_arremetida"); sim.buyMetaNode("rank_rayo"); sim.buyMetaNode("rank_rayo");
let blob = sim.serializeMeta();
if ("rank_arremetida" in blob.nodes && blob.nodes.rank_arremetida === 1 && blob.nodes.rank_rayo === 2)
  pass("serializeMeta emits rank_* into the SAME store (mithralda.meta.v" + blob.v + ")");
else fail("serializeMeta rank_* wrong: " + JSON.stringify(blob.nodes));
sim.resetMeta(); sim.loadMeta(blob);
if (abilLvl("rank_arremetida") === 1 && abilLvl("rank_rayo") === 2) pass("v2 blob round-trips rank_* clean"); else fail("rank round-trip lost data");
// legacy blob with NO rank_* -> ranks migrate to 0, nothing breaks
sim.loadMeta({ v: 2, essence: 300, nodes: { hpMax: 3 } });
if (snap().abilities.every((a) => a.lvl === 0) && snap().essence === 300)
  pass("legacy blob (no rank_*) migrates additively: all ranks 0, essence preserved");
else fail("legacy migration wrong: " + JSON.stringify(snap().abilities.map((a) => a.lvl)));
// corrupt/over-cap clamps
sim.loadMeta({ v: 2, essence: 0, nodes: { rank_egida: 99, rank_bogus: 5 } });
if (abilLvl("rank_egida") === ABILITY_RANK_MAP.egida.cap && !("rank_bogus" in sim.serializeMeta().nodes))
  pass("corrupt rank blob clamped to cap, unknown key dropped"); else fail("rank clamp wrong");

// ============ (f) dev hook ================================================
sim.resetMeta(); sim.dev.metaGrant(10000); sim.buyMetaNode("rank_egida");
const dr = sim.dev.abilityRank("egida");
if (dr && dr.lvl === 1 && dr.cost === ABILITY_RANK_MAP.egida.cost(1) && dr.ranked.dur === ABILITY_MAP.egida.dur + 1)
  pass("__dev.abilityRank('egida') reports {lvl,cost,ranked} with scaled dur"); else fail("dev.abilityRank wrong: " + JSON.stringify(dr));
if (sim.dev.abilityRank("nope") === null) pass("__dev.abilityRank(unknown) → null"); else fail("dev hook should null on unknown id");

console.log(ok ? "\nCAS-1574 ability ranks: ALL PASS" : "\nCAS-1574 ability ranks: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
