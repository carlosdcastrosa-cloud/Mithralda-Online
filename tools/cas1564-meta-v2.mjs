// ---------------------------------------------------------------------------
// CAS-1565 — meta-progression v2 logic test (headless, no browser).
//
// Drives the REAL deterministic sim (sim/sim.js) through the v2 flows and asserts
// the acceptance criteria from the plan (CAS-1564):
//   (a) v1 -> v2 migration round-trips with NO corruption (the one-way-door test):
//       a v1 blob loads clean, v1 nodes + essence preserved, t2_* default 0, ascension {0,1}.
//   (b) Tier-2 is GATED: locked until every v1 node is at cap; buys refused while locked.
//   (c) Ascensión math: full-max altar can ascend; nodes+essence wiped, level+1, mult=1.25,
//       and essenceForRun is multiplied from the very next death.
//   (d) reconcileMeta idempotency across an ascend: baked v1 stats revert on the next
//       run-start seam (delta engine) and a repeat reconcile is a no-op.
//
// SWAP NOTE: the plan's 5th Tier-2 node `t2_zoneChest` has no clean sim hook (the world is a
// boot-time singleton whose chests never reset between runs) so it was swapped to `t2_xpGain`
// ("Erudición", +XP) which rides the single gainXP() chokepoint. Flagged to the CTO on CAS-1565.
//
// Run: node tools/cas1564-meta-v2.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const snap = () => sim.metaSnap();
const v1Lvl = (k) => snap().nodes.find((n) => n.key === k).lvl;
const t2Lvl = (k) => snap().t2.find((n) => n.key === k).lvl;

// ============ (a) migration v1 -> v2, no corruption ========================
sim.loadMeta({ v: 1, essence: 500, nodes: { hpMax: 5, dmg: 3, moveSpd: 2, reroll: 1, startGold: 4 } });
let s = snap();
if (s.essence === 500 && v1Lvl("hpMax") === 5 && v1Lvl("dmg") === 3 && v1Lvl("moveSpd") === 2 && v1Lvl("reroll") === 1 && v1Lvl("startGold") === 4)
  pass("v1 blob: essence + all 5 v1 nodes preserved (no wipe)");
else fail("v1 migration lost data: " + JSON.stringify(s));
if (s.t2.length === 5 && s.t2.every((n) => n.lvl === 0)) pass("v1 blob: all 5 Tier-2 nodes default to 0 (no corruption)");
else fail("t2 defaults wrong: " + JSON.stringify(s.t2));
if (s.ascension.level === 0 && s.ascension.mult === 1) pass("v1 blob: ascension defaults to {level:0,mult:1}");
else fail("ascension default wrong: " + JSON.stringify(s.ascension));

let blob = sim.serializeMeta();
if (blob.v === 2 && "t2_boonRare" in blob.nodes && "t2_xpGain" in blob.nodes && blob.ascension && blob.ascension.level === 0)
  pass("serializeMeta shape is v2 {v:2, nodes(+t2_*), ascension}");
else fail("serializeMeta v2 shape wrong: " + JSON.stringify(blob));
sim.loadMeta(blob);
if (snap().essence === 500 && v1Lvl("hpMax") === 5 && snap().ascension.level === 0) pass("v2 blob round-trips clean");
else fail("v2 round-trip lost data: " + JSON.stringify(snap()));

sim.loadMeta({ v: 2, essence: -9, nodes: { hpMax: 99, t2_boonRare: 99, t2_xpGain: 99, bogus: 7 }, ascension: { level: -4, mult: 999 } });
s = snap();
if (s.essence === 0 && v1Lvl("hpMax") === 5 && t2Lvl("t2_boonRare") === 3 && t2Lvl("t2_xpGain") === 3 && s.ascension.level === 0 && s.ascension.mult === 1)
  pass("corrupt blob clamped: essence≥0, levels≤cap, unknown dropped, ascension floored + mult recomputed");
else fail("clamp wrong: " + JSON.stringify(s));

// ============ (b) Tier-2 gating ===========================================
sim.resetMeta();
if (!snap().t2Unlocked) pass("fresh meta: Tier-2 locked"); else fail("t2 should be locked on fresh meta");
sim.loadMeta({ v: 2, essence: 9999, nodes: { hpMax: 4, dmg: 5, moveSpd: 4, reroll: 2, startGold: 5 } }); // hpMax below cap(5)
if (!snap().t2Unlocked && sim.buyMetaNode("t2_boonRare") === false && t2Lvl("t2_boonRare") === 0)
  pass("Tier-2 buy refused while a v1 node is below cap (gate holds even with essence)");
else fail("Tier-2 gate leaked while v1 not maxed");
sim.loadMeta({ v: 2, essence: 9999, nodes: { hpMax: 5, dmg: 5, moveSpd: 4, reroll: 2, startGold: 5 } });
if (snap().t2Unlocked) pass("Tier-2 unlocks once ALL v1 nodes are at cap"); else fail("Tier-2 failed to unlock at full v1 max");
let e0 = snap().essence;
if (sim.buyMetaNode("t2_boonRare") && t2Lvl("t2_boonRare") === 1 && snap().essence === e0 - 60) pass("buy t2_boonRare: lvl 1, spent 60 essence");
else fail("t2 buy accounting wrong: " + JSON.stringify(snap()));
sim.buyMetaNode("t2_boonRare"); sim.buyMetaNode("t2_boonRare"); // -> cap 3
if (t2Lvl("t2_boonRare") === 3 && sim.buyMetaNode("t2_boonRare") === false) pass("t2_boonRare respects cap (3), never over-buys");
else fail("t2 cap breached: " + t2Lvl("t2_boonRare"));

// ============ (c) ascend math + essenceMult ===============================
const RUN = (h) => { h.lvl = 6; h.eliteKills = 3; sim.G.run.elite0 = 0; h.conquest.bossesDown = ["swamp", "abyss"]; h.conquest.tier = 2; }; // raw = 12+15+20+15 = 62
sim.loadMeta({ v: 2, essence: 1000, nodes: { hpMax: 5, dmg: 5, moveSpd: 4, reroll: 2, startGold: 5, t2_boonRare: 3, t2_startBoon: 2, t2_dashIframe: 2, t2_xpGain: 3, t2_reroll: 2 } });
if (snap().canAscend) pass("full-max altar (v1 + Tier-2): canAscend true"); else fail("canAscend should be true at full max");

sim.createHero("AscPre", "warrior"); RUN(sim.G.hero); sim.dev.killHero();
const essPre = sim.dev.recapState().essence; // ascension 0 -> x1

if (sim.ascendMeta()) pass("ascendMeta() succeeds at full max"); else fail("ascendMeta refused at full max");
s = snap();
if (s.essence === 0 && s.nodes.every((n) => n.lvl === 0) && s.t2.every((n) => n.lvl === 0) && s.ascension.level === 1 && Math.abs(s.ascension.mult - 1.25) < 1e-9)
  pass("ascend: all nodes + essence sacrificed, ascension level 1, mult 1.25");
else fail("ascend state wrong: " + JSON.stringify(s));
if (!s.canAscend && !s.t2Unlocked) pass("post-ascend: altar reset → Tier-2 locked, cannot ascend again"); else fail("post-ascend gates wrong");

sim.createHero("AscPost", "warrior"); RUN(sim.G.hero); sim.dev.killHero();
const essPost = sim.dev.recapState().essence; // ascension 1 -> x1.25
if (essPre === 62 && essPost === Math.floor(62 * 1.25)) pass("essenceForRun multiplier: 62 before ascend → " + Math.floor(62 * 1.25) + " after (x1.25)");
else fail("essence mult wrong: pre=" + essPre + " post=" + essPost);

// ============ (d) reconcile idempotency across ascend =====================
sim.resetMeta(); sim.createHero("Base", "warrior");
const baseHp = sim.G.hero.maxHp, baseDmg = sim.G.hero.baseDmg;
sim.loadMeta({ v: 2, essence: 0, nodes: { hpMax: 5, dmg: 5, moveSpd: 4, reroll: 2, startGold: 5, t2_boonRare: 3, t2_startBoon: 2, t2_dashIframe: 2, t2_xpGain: 3, t2_reroll: 2 } });
sim.createHero("Baked", "warrior");
let h = sim.G.hero;
if (h.maxHp === baseHp + 60 && h.metaApplied.hp === 60) pass("v1 stats bake at run-start: +60 maxHp (hpMax cap 5 × 12)");
else fail("bake wrong: maxHp=" + h.maxHp + " expected=" + (baseHp + 60) + " metaApplied=" + JSON.stringify(h.metaApplied));
sim.ascendMeta();          // nodes -> 0, metaApplied deliberately left intact
sim.respawn();             // next run-start seam → reconcileMeta strips the sacrificed stats
h = sim.G.hero;
if (h.maxHp === baseHp && h.metaApplied.hp === 0 && h.baseDmg === baseDmg)
  pass("post-ascend respawn: baked v1 stats fully reverted (delta engine, want=0 vs had=60)");
else fail("revert wrong: maxHp=" + h.maxHp + " (base " + baseHp + ") baseDmg=" + h.baseDmg + " metaApplied=" + JSON.stringify(h.metaApplied));
const hp2 = h.maxHp; sim.respawn(); h = sim.G.hero;
if (h.maxHp === hp2 && h.metaApplied.hp === 0) pass("reconcileMeta idempotent after ascend revert (repeat seam = no-op)");
else fail("not idempotent: maxHp=" + h.maxHp + " vs " + hp2);

console.log(ok ? "\nCAS-1565 meta v2: ALL PASS" : "\nCAS-1565 meta v2: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
