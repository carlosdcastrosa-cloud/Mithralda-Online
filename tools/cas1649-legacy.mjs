// ---------------------------------------------------------------------------
// CAS-1649 — META-PROGRESIÓN v3: NODOS DE LEGADO (headless, no browser).
//
// Drives the REAL deterministic sim (sim/sim.js) through the legacy flows and
// asserts the epic's acceptance criteria (parent CAS-1648):
//   (a) PERSISTENCE — serialize→load round-trips legacyNodes; a v1/v2 blob with
//       NO legacyNodes migrates to []; unknown keys are filtered (untrusted guard).
//   (b) SACRIFICE-SAFE — ascendMeta() resets nodes+essence but NEVER touches
//       legacyNodes (AC2); legacies accumulate across ascensions.
//   (c) 5 EFFECTS WIRED — each legacy moves a REAL sim number at its seam:
//       vigia (t2 unlock), avaro (+reroll), superviviente (+potions),
//       cazador (+dmg vs elite), erudito (+Esencia). Stackables stack.
//   (d) POOL — one-time nodes drop out of the pool once owned; stackables stay.
//   (e) AC6 RNG-NEUTRAL — the legacy system NEVER perturbs the shared srand loot
//       stream: dropStream(seed) is byte-identical with 0 legacies vs 5 legacies.
//       (Full-sim byte-identity is separately gated by tools/determinism-check.mjs.)
//
// Run: node tools/cas1649-legacy.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const snap = () => sim.metaSnap();
const owned = (k) => (snap().legacy.find((n) => n.key === k) || {}).owned;
const poolKeys = () => snap().legacyChoices.map((n) => n.key);

// Full-max altar blob (every v1 + Tier-2 node at cap) — the ascend precondition.
const FULLMAX = { v: 2, essence: 0, nodes: { hpMax: 5, dmg: 5, moveSpd: 4, reroll: 2, startGold: 5, t2_boonRare: 3, t2_startBoon: 2, t2_dashIframe: 2, t2_xpGain: 3, t2_reroll: 2 } };
// Deterministic run setup (matches cas1564): raw = lvl*2 + elites*5 + zonas*10 + (tier-1)*15 = 62.
const RUN = (h) => { h.lvl = 6; h.eliteKills = 3; sim.G.run.elite0 = 0; h.conquest.bossesDown = ["swamp", "abyss"]; h.conquest.tier = 2; };
const runEssence = (name) => { sim.createHero(name, "warrior"); RUN(sim.G.hero); sim.dev.killHero(); return sim.dev.recapState().essence; };

// ============ (a) PERSISTENCE + MIGRATION =================================
sim.loadMeta({ v: 2, essence: 100, nodes: {}, legacyNodes: ["leg_avaro", "leg_avaro", "leg_cazador"] });
if (owned("leg_avaro") === 2 && owned("leg_cazador") === 1) pass("[PERS] legacyNodes load: avaro×2 + cazador×1 counted");
else fail("[PERS] legacy load wrong: " + JSON.stringify(snap().legacy));
let blob = sim.serializeMeta();
if (Array.isArray(blob.legacyNodes) && blob.legacyNodes.length === 3 && blob.v === 2 && !("legacyNodes" in blob) === false)
  pass("[PERS] serializeMeta emits legacyNodes array (v NOT bumped, stays 2): " + JSON.stringify(blob.legacyNodes));
else fail("[PERS] serialize shape wrong: " + JSON.stringify(blob));
sim.loadMeta(blob);
if (owned("leg_avaro") === 2 && owned("leg_cazador") === 1) pass("[PERS] round-trip serialize→load preserves the legacy stack");
else fail("[PERS] round-trip lost legacies: " + JSON.stringify(snap().legacy));

// v1/v2 blob with NO legacyNodes → [] (additive migration, no corruption).
sim.loadMeta({ v: 1, essence: 500, nodes: { hpMax: 5, dmg: 3 } });
if (snap().legacy.every((n) => n.owned === 0) && snap().essence === 500) pass("[PERS] v1 blob (no legacyNodes) migrates to [] (v1 data intact)");
else fail("[PERS] v1 migration wrong: " + JSON.stringify(snap().legacy));
sim.loadMeta({ v: 2, essence: 0, nodes: {} });
if (snap().legacy.every((n) => n.owned === 0)) pass("[PERS] v2 blob without legacyNodes → []");
else fail("[PERS] v2 no-legacy migration wrong");

// Untrusted-blob guardrail: unknown keys filtered on load.
sim.loadMeta({ v: 2, essence: 0, nodes: {}, legacyNodes: ["leg_avaro", "bogus_key", "leg_erudito", 42, null] });
if (owned("leg_avaro") === 1 && owned("leg_erudito") === 1 && sim.serializeMeta().legacyNodes.length === 2)
  pass("[PERS] unknown/garbage keys filtered on load (only valid legacies survive)");
else fail("[PERS] guardrail leaked: " + JSON.stringify(sim.serializeMeta().legacyNodes));

// ============ (d) POOL eligibility ========================================
sim.resetMeta();
if (poolKeys().length === 5 && poolKeys().includes("leg_vigia")) pass("[POOL] fresh meta: all 5 nodes eligible");
else fail("[POOL] fresh pool wrong: " + JSON.stringify(poolKeys()));
if (sim.chooseLegacy("leg_vigia") === true && owned("leg_vigia") === 1) pass("[POOL] chooseLegacy(leg_vigia) grants it");
else fail("[POOL] chooseLegacy(vigia) failed");
if (!poolKeys().includes("leg_vigia") && poolKeys().length === 4) pass("[POOL] one-time leg_vigia drops OUT of the pool once owned");
else fail("[POOL] one-time node still offered: " + JSON.stringify(poolKeys()));
if (sim.chooseLegacy("leg_vigia") === false && owned("leg_vigia") === 1) pass("[POOL] re-choosing an owned one-time node is refused (0-RNG guard)");
else fail("[POOL] one-time double-grant leaked");
sim.chooseLegacy("leg_avaro"); sim.chooseLegacy("leg_avaro");
if (owned("leg_avaro") === 2 && poolKeys().includes("leg_avaro")) pass("[POOL] stackable leg_avaro stays eligible + stacks to 2");
else fail("[POOL] stackable pool/stack wrong: " + owned("leg_avaro"));
if (sim.chooseLegacy("nope") === false) pass("[POOL] unknown key refused");
else fail("[POOL] unknown key accepted");

// ============ (c) 5 EFFECTS WIRED =========================================
// 1. leg_vigia → t2Unlocked() true even though v1 is NOT maxed.
sim.loadMeta({ v: 2, essence: 0, nodes: {} }); // v1 all zero → normally t2 locked
if (snap().t2Unlocked === false) pass("[EFF vigia] baseline: Tier-2 locked (v1 not maxed)");
else fail("[EFF vigia] baseline t2 should be locked");
sim.chooseLegacy("leg_vigia");
if (snap().t2Unlocked === true) pass("[EFF vigia] leg_vigia unlocks Tier-2 with v1 un-maxed");
else fail("[EFF vigia] t2 still locked after vigia");

// 2. leg_avaro → +1 rerollLeft/stack at run-start (applyMetaReroll).
sim.resetMeta(); sim.createHero("RRbase", "warrior");
const rr0 = sim.G.hero.rerollLeft;
sim.chooseLegacy("leg_avaro"); sim.chooseLegacy("leg_avaro"); sim.createHero("RRlegacy", "warrior");
if (sim.G.hero.rerollLeft === rr0 + 2) pass(`[EFF avaro] rerollLeft ${rr0} → ${sim.G.hero.rerollLeft} (+1/stack, ×2)`);
else fail(`[EFF avaro] reroll not applied: base=${rr0} got=${sim.G.hero.rerollLeft}`);

// 3. leg_superviviente → +1 greater HP potion & +1 mana potion at run-start (newHero only).
sim.resetMeta(); sim.createHero("POTbase", "warrior");
const g0 = sim.G.hero.consum.greater, m0 = sim.G.hero.consum.mana;
sim.chooseLegacy("leg_superviviente"); sim.createHero("POTlegacy", "warrior");
if (sim.G.hero.consum.greater === g0 + 1 && sim.G.hero.consum.mana === m0 + 1)
  pass(`[EFF superviviente] potions greater ${g0}→${sim.G.hero.consum.greater}, mana ${m0}→${sim.G.hero.consum.mana} (+1 each)`);
else fail(`[EFF superviviente] potions off: greater=${sim.G.hero.consum.greater} mana=${sim.G.hero.consum.mana}`);

// 4. leg_cazador → +10%/stack damage vs elite targets (hitEnemy), normal targets untouched.
sim.resetMeta(); sim.createHero("CZ", "warrior");
const dEliteBase = sim.dev.dmgVsTarget(true), dNormBase = sim.dev.dmgVsTarget(false);
sim.chooseLegacy("leg_cazador");
const dElite1 = sim.dev.dmgVsTarget(true), dNorm1 = sim.dev.dmgVsTarget(false);
if (Math.abs(dElite1 - dEliteBase * 1.10) < 0.05 && Math.abs(dNorm1 - dNormBase) < 0.01)
  pass(`[EFF cazador] elite dmg ${dEliteBase}→${dElite1} (+10%); normal dmg unchanged (${dNormBase}→${dNorm1})`);
else fail(`[EFF cazador] wrong: eliteBase=${dEliteBase} elite1=${dElite1} normBase=${dNormBase} norm1=${dNorm1}`);
sim.chooseLegacy("leg_cazador");
const dElite2 = sim.dev.dmgVsTarget(true);
if (Math.abs(dElite2 - dEliteBase * 1.20) < 0.05) pass(`[EFF cazador] stacks: ×2 → ${dElite2} (+20%)`);
else fail(`[EFF cazador] stack wrong: ${dElite2} expected ~${dEliteBase * 1.2}`);

// 5. leg_erudito → +50%/stack Esencia payout (essenceForRun), before ascMult.
sim.resetMeta();
const eBase = runEssence("ERbase");
sim.chooseLegacy("leg_erudito");
const eLeg = runEssence("ERlegacy");
if (eBase === 62 && eLeg === Math.floor(62 * 1.5)) pass(`[EFF erudito] Esencia ${eBase} → ${eLeg} (+50% pre-Ascensión)`);
else fail(`[EFF erudito] essence off: base=${eBase} legacy=${eLeg}`);

// ============ (b) SACRIFICE-SAFE (AC2) ====================================
sim.loadMeta(FULLMAX);
sim.chooseLegacy("leg_vigia"); sim.chooseLegacy("leg_erudito"); sim.chooseLegacy("leg_erudito");
const preLegacy = sim.serializeMeta().legacyNodes.slice();
if (snap().canAscend) pass("[SACRIFICE] full-max altar can ascend"); else fail("[SACRIFICE] should be able to ascend");
sim.ascendMeta();
const postLegacy = sim.serializeMeta().legacyNodes.slice();
const s = snap();
if (JSON.stringify(preLegacy) === JSON.stringify(postLegacy) && postLegacy.length === 3)
  pass(`[SACRIFICE] ascendMeta() left legacyNodes UNTOUCHED (${postLegacy.join(",")}) — legacies survive the sacrifice (AC2)`);
else fail(`[SACRIFICE] legacyNodes changed on ascend: pre=${JSON.stringify(preLegacy)} post=${JSON.stringify(postLegacy)}`);
if (s.essence === 0 && s.nodes.every((n) => n.lvl === 0) && s.ascension.level === 1)
  pass("[SACRIFICE] the sacrifice still fires: nodes+essence wiped, ascension level 1 (ascMult intact, AC5)");
else fail("[SACRIFICE] sacrifice math wrong: " + JSON.stringify(s.ascension));
// Accumulate a SECOND ascension's legacy on top.
sim.loadMeta(Object.assign({}, FULLMAX, { legacyNodes: postLegacy, ascension: { level: 1 } }));
sim.chooseLegacy("leg_cazador"); sim.ascendMeta();
if (sim.serializeMeta().legacyNodes.length === 4 && snap().ascension.level === 2)
  pass("[SACRIFICE] legacies ACCUMULATE across ascensions (3 → 4 after a second ascend, level 2)");
else fail("[SACRIFICE] accumulation wrong: " + JSON.stringify(sim.serializeMeta().legacyNodes));

// ============ (e) AC6 RNG-NEUTRAL loot stream =============================
// The legacy system lives entirely OUTSIDE the shared srand loot roll: no legacy hook draws
// srand. So the SHARED-srand drop stream on a fixed seed must be byte-identical whether 0 or
// all-5 legacies are held. setLegRate(0) + strip the appended uniq drops (the CAS-1638 idiom:
// the legendary roll rides a dedicated legRng stream that seed() never resets, so it is excluded
// from the shared-stream comparison). Full-sim determinism is separately gated by determinism-check.mjs.
const stripLeg = (s) => JSON.stringify(s.filter((d) => !d.uniq));
const dropRun = (legs) => { sim.resetMeta(); for (const k of legs) sim.chooseLegacy(k); sim.createHero("RNG", "warrior"); sim.dev.setLegRate(0); return sim.dev.dropStream(400, 13371337); };
const stream0 = stripLeg(dropRun([]));
const streamCtl = stripLeg(dropRun([])); // control: same seed, no legacy → reproducibility baseline
const streamL = stripLeg(dropRun(["leg_vigia", "leg_avaro", "leg_superviviente", "leg_cazador", "leg_erudito"]));
if (stream0 === streamCtl && stream0 === streamL)
  pass("[AC6] shared-srand loot stream BYTE-IDENTICAL with 0 vs 5 legacies (legacy system draws no srand)");
else fail(`[AC6] shared loot RNG stream perturbed (control-repro=${stream0 === streamCtl} legacy-neutral=${stream0 === streamL})`);

console.log(ok ? "\n✅ CAS-1649 legacy nodes: ALL PASS" : "\n❌ CAS-1649 legacy nodes: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
