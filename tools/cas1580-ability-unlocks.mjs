// ---------------------------------------------------------------------------
// CAS-1580 — Lockable Active Abilities + altar unlock (Esencia) logic test (headless).
//
// Drives the REAL deterministic sim (sim/sim.js) and asserts the acceptance criteria:
//   (a) a LOCKED ability is NOT in draftPool() by default (hidden from the run-start draft).
//   (b) buyMetaNode("unlock_<id>") consumes the correct Esencia, persists via serializeMeta/
//       loadMeta round-trip (mithralda.meta.v2), and THEN draftPool() includes the ability.
//   (c) the 4 ORIGINAL abilities are ALWAYS in draftPool() (never lockable).
//   (d) RNG-neutral: with NO unlocks, draftPool() == the 4 originals in their original order,
//       and metaDefault/serialize round-trips leave them locked (draft identical to pre-CAS-1580).
//   (e) unlock rows are NOT gated by t2Unlocked (buyable on a fresh meta); cap:1 (no over-buy).
//   (f) legacy/corrupt blob migrates additively: no unlock_* → all locked; over-cap → clamped.
//   (g) setLoadout can never equip a LOCKED ability; dev hooks (draftPool/abilityUnlocks) report state.
//
// Run: node tools/cas1580-ability-unlocks.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { ACTIVE_ABILITIES, ABILITY_UNLOCKS, ABILITY_UNLOCK_MAP } from "../sim/config.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };

const ORIGINALS = ACTIVE_ABILITIES.filter((a) => !a.locked).map((a) => a.id);
const LOCKED = ACTIVE_ABILITIES.filter((a) => a.locked).map((a) => a.id);
const poolIds = () => sim.draftPool().map((a) => a.id);

// ============ (a) locked abilities hidden by default =======================
sim.resetMeta();
if (LOCKED.length >= 3) pass("config declares " + LOCKED.length + " lockable abilities (" + LOCKED.join(",") + ")"); else fail("expected >=3 locked abilities, got " + LOCKED.length);
if (LOCKED.every((id) => !poolIds().includes(id))) pass("default draftPool() EXCLUDES every locked ability"); else fail("a locked ability leaked into default draftPool: " + JSON.stringify(poolIds()));

// ============ (c)+(d) originals always present + RNG-neutral order =========
if (ORIGINALS.length === 4) pass("4 original (unlocked) abilities: " + ORIGINALS.join(",")); else fail("expected 4 originals, got " + ORIGINALS.length);
if (JSON.stringify(poolIds()) === JSON.stringify(ORIGINALS)) pass("default draftPool() == the 4 originals IN ORDER (RNG-neutral; draft identical to pre-CAS-1580)"); else fail("default pool != originals order: " + JSON.stringify(poolIds()));
// hook parity
if (JSON.stringify(sim.dev.draftPool()) === JSON.stringify(ORIGINALS)) pass("__dev.draftPool() mirrors the filtered pool ids"); else fail("dev.draftPool mismatch: " + JSON.stringify(sim.dev.draftPool()));

// ============ (e) ungated + cap:1 + accounting =============================
if (!sim.metaSnap().t2Unlocked) pass("fresh meta: Tier-2 locked (proves unlocks buy WITHOUT the T2 gate)"); else fail("expected fresh meta t2 locked");
const first = LOCKED[0], key = "unlock_" + first, cost = ABILITY_UNLOCK_MAP[first].cost(0);
if (sim.buyMetaNode(key) === false && !poolIds().includes(first)) pass("buy refused at 0 essence (" + first + " stays locked)"); else fail("unlock leaked at 0 essence");
sim.dev.metaGrant(10000);
const e0 = sim.metaSnap().essence;
if (sim.buyMetaNode(key) && sim.metaSnap().essence === e0 - cost) pass("buy " + key + ": spent " + cost + " Esencia (data-driven cost)"); else fail("unlock buy accounting wrong: essence=" + sim.metaSnap().essence + " expected " + (e0 - cost));
if (poolIds().includes(first)) pass("after unlock, draftPool() INCLUDES " + first); else fail(first + " missing from pool after unlock");
if (sim.buyMetaNode(key) === false) pass("cap:1 respected — cannot buy " + key + " twice"); else fail("unlock over-bought past cap 1");

// ============ (b) persistence round-trip (v2) ==============================
let blob = sim.serializeMeta();
if (blob.v === 2 && blob.nodes[key] === 1) pass("serializeMeta emits " + key + "=1 into the SAME store (mithralda.meta.v2)"); else fail("serializeMeta unlock wrong: " + JSON.stringify(blob.nodes));
sim.resetMeta();
if (!poolIds().includes(first)) pass("after resetMeta, " + first + " re-locked (unlock is persistent state, not code)"); else fail("reset did not re-lock");
sim.loadMeta(blob);
if (poolIds().includes(first)) pass("v2 blob round-trips: " + first + " unlocked after reload (persists across recarga)"); else fail("unlock lost on round-trip");

// ============ (f) legacy + corrupt migration ==============================
sim.loadMeta({ v: 2, essence: 500, nodes: { hpMax: 2 } }); // no unlock_* keys
if (LOCKED.every((id) => !poolIds().includes(id)) && sim.metaSnap().essence === 500) pass("legacy blob (no unlock_*) migrates additively: all abilities locked, essence preserved"); else fail("legacy migration wrong");
sim.loadMeta({ v: 2, essence: 0, nodes: { [key]: 99, unlock_bogus: 3 } });
if (poolIds().includes(first) && sim.metaSnap().unlocks.find((u) => u.key === key).lvl === 1 && !("unlock_bogus" in sim.serializeMeta().nodes))
  pass("corrupt unlock blob clamped to cap 1, unknown key dropped"); else fail("unlock clamp wrong");

// ============ (g) setLoadout guard + dev hooks ============================
sim.resetMeta();
sim.createHero("QA", "warrior");
sim.dev.setLoadout([first, LOCKED[1] || ORIGINALS[0]]); // try to equip a LOCKED ability
if (!sim.dev.loadout().includes(first)) pass("setLoadout REJECTS a locked ability (falls back to unlocked)"); else fail("locked ability equipped: " + JSON.stringify(sim.dev.loadout()));
const uh = sim.dev.abilityUnlocks();
if (uh.length === LOCKED.length && uh.every((u) => u.locked === true) && uh.find((u) => u.id === first).cost === cost)
  pass("__dev.abilityUnlocks() reports {id,locked,cost} for all lockable abilities"); else fail("dev.abilityUnlocks wrong: " + JSON.stringify(uh));
// metaSnap.unlocks shape for the altar UI
const snapU = sim.metaSnap().unlocks;
if (snapU && snapU.length === LOCKED.length && snapU.every((u) => u.unlock === true && typeof u.unlocked === "boolean" && u.cap === 1))
  pass("metaSnap().unlocks exposes altar rows {unlock,unlocked,cap:1,cost,affordable}"); else fail("metaSnap.unlocks shape wrong: " + JSON.stringify(snapU));

console.log(ok ? "\nCAS-1580 ability unlocks: ALL PASS" : "\nCAS-1580 ability unlocks: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
