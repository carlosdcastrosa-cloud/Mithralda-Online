// ---------------------------------------------------------------------------
// CAS-1557 — meta-progression v1 logic test (headless, no browser).
//
// Drives the REAL deterministic sim (sim/sim.js) through the meta flows and
// asserts the acceptance criteria that live in the sim core:
//   1) mithralda.meta.v1 shape round-trips through serializeMeta/loadMeta; resetMeta wipes it.
//   2) Esencia is earned on death (heroDie), banked in the store, stamped on the recap.
//   3) Altar buys spend essence, respect caps, never over-spend.
//   4) Bonuses (+HP/+dmg/+gold/+reroll/+vel) apply at createHero AND respawn, and a
//      serializeSave→loadSave round-trip never double-counts them.
//
// Run: node tools/cas1557-meta.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";

// The sim needs its injected deps; audio.sfx.* is called on death/level paths → no-op stub.
const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const near = (a, b) => Math.abs(a - b) < 1e-6;

// ---- 1) store shape + reset ------------------------------------------------
sim.resetMeta();
let snap = sim.metaSnap();
if (snap.essence === 0 && snap.nodes.length === 5) pass("fresh meta: essence 0, 5 nodes"); else fail("fresh meta wrong: " + JSON.stringify(snap));
const blob = sim.serializeMeta();
// CAS-1565: the store internal version was bumped 1 -> 2 (Tier-2 + ascension added to the SAME
// mithralda.meta.v1 localStorage key); v1 fields (essence + 5 nodes) remain a compatible prefix.
if (blob && blob.v === 2 && blob.nodes && "hpMax" in blob.nodes && "reroll" in blob.nodes) pass("serializeMeta shape {v:2,essence,nodes}"); else fail("serializeMeta shape wrong: " + JSON.stringify(blob));
// load a hand-authored blob and read it back
sim.loadMeta({ v: 1, essence: 999, nodes: { hpMax: 2, dmg: 1, moveSpd: 4, reroll: 2, startGold: 3 } });
snap = sim.metaSnap();
const lvlOf = (k) => snap.nodes.find((n) => n.key === k).lvl;
if (snap.essence === 999 && lvlOf("hpMax") === 2 && lvlOf("moveSpd") === 4 && lvlOf("reroll") === 2) pass("loadMeta round-trips levels+essence"); else fail("loadMeta wrong: " + JSON.stringify(snap));
// corrupt/over-cap blob is clamped, not trusted
sim.loadMeta({ essence: -5, nodes: { hpMax: 99, moveSpd: 99, reroll: 99, bogus: 3 } });
snap = sim.metaSnap();
if (snap.essence === 0 && lvlOf("hpMax") === 5 && lvlOf("moveSpd") === 4 && lvlOf("reroll") === 2) pass("loadMeta clamps essence>=0 + level<=cap, drops unknown keys"); else fail("clamp wrong: " + JSON.stringify(snap));

// ---- 2) essence earned on death + banked -----------------------------------
sim.resetMeta();
sim.createHero("MetaBot", "warrior");
const h = sim.G.hero;
// simulate some run progress the formula reads: level up + this-run elites + a cleared conquest zone
h.lvl = 6;                                   // lvl*2 = 12
h.eliteKills = 3; sim.G.run.elite0 = 0;      // recap elites = 3 → +15
h.conquest.bossesDown = ["swamp", "abyss"];  // zonas=2 → +20
h.conquest.tier = 2;                          // (tier-1)*15 = +15
// expected essence = 12 + 15 + 20 + 15 = 62
sim.dev.killHero();
const recap = sim.dev.recapState();
const bank = sim.metaSnap().essence;
if (recap && recap.essence === 62 && recap.essenceTotal === 62) pass("death banks Esencia = 62, stamped on recap"); else fail("essence gain wrong: recap=" + JSON.stringify(recap && { e: recap.essence, t: recap.essenceTotal }));
if (bank === 62) pass("Esencia banked in store (62)"); else fail("bank wrong: " + bank);

// ---- 3) altar buy: spend, caps, no over-spend ------------------------------
// hpMax cost at lvl0 = 10*(0+1) = 10; buy once
let before = sim.metaSnap().essence;
let bought = sim.buyMetaNode("hpMax");
snap = sim.metaSnap();
if (bought && lvlOf("hpMax") === 1 && snap.essence === before - 10) pass("buy hpMax: lvl 0->1, spent 10 (62->" + snap.essence + ")"); else fail("buy hpMax wrong: " + JSON.stringify({ bought, snap }));
// exhaust hpMax to cap (5); costs 20,30,40,50 → then capped (buy returns false, cost null).
// Top up essence first so the cap — not the wallet — is what stops the buys.
sim.loadMeta({ v: 1, essence: 500, nodes: { hpMax: 1, dmg: 0, moveSpd: 0, reroll: 0, startGold: 0 } });
sim.buyMetaNode("hpMax"); sim.buyMetaNode("hpMax"); sim.buyMetaNode("hpMax"); sim.buyMetaNode("hpMax");
snap = sim.metaSnap();
const hpNode = snap.nodes.find((n) => n.key === "hpMax");
const capBuy = sim.buyMetaNode("hpMax");
if (hpNode.lvl === 5 && hpNode.cost === null && capBuy === false) pass("hpMax capped at 5, further buy refused, cost=null"); else fail("cap wrong: " + JSON.stringify(hpNode) + " capBuy=" + capBuy);
// over-spend guard: drain essence, then a buy that costs more than we hold is refused
sim.loadMeta({ v: 1, essence: 5, nodes: { hpMax: 0, dmg: 0, moveSpd: 0, reroll: 0, startGold: 0 } });
const poorBuy = sim.buyMetaNode("dmg"); // dmg lvl0 cost = 15 > 5
if (poorBuy === false && sim.metaSnap().essence === 5 && lvlOf("dmg") === 0) pass("over-spend refused (5 essence, 15 cost)"); else fail("over-spend not guarded");

// ---- 4) bonuses apply at createHero, respawn, and survive save/load --------
// Set a known meta: +2 hpMax(=24hp), +3 dmg(=6), +4 moveSpd(=+12%), +2 reroll, +2 startGold(=50g)
sim.loadMeta({ v: 1, essence: 0, nodes: { hpMax: 2, dmg: 3, moveSpd: 4, reroll: 2, startGold: 2 } });
// baseline (zero-meta) warrior for reference deltas
sim.resetMeta();
sim.createHero("Base", "warrior");
const base = { maxHp: sim.G.hero.maxHp, dmg: sim.G.hero.baseDmg, gold: sim.G.hero.gold, spd: sim.G.hero.moveSpeed, rr: sim.G.hero.rerollLeft };
// now with meta, fresh createHero
sim.loadMeta({ v: 1, essence: 0, nodes: { hpMax: 2, dmg: 3, moveSpd: 4, reroll: 2, startGold: 2 } });
sim.createHero("Buffed", "warrior");
let hb = sim.G.hero;
const okCreate = hb.maxHp === base.maxHp + 24 && hb.baseDmg === base.dmg + 6 && hb.gold === base.gold + 50 && hb.rerollLeft === base.rr + 2 && near(hb.moveSpeed, base.spd * 1.12);
if (okCreate) pass("createHero applies +24HP/+6dmg/+50gold/+2reroll/+12% vel"); else fail("createHero apply wrong: " + JSON.stringify({ dHp: hb.maxHp - base.maxHp, dDmg: hb.baseDmg - base.dmg, dGold: hb.gold - base.gold, dRr: hb.rerollLeft - base.rr, spdRatio: hb.moveSpeed / base.spd }));
// spend gold + rerolls mid-run, then die + respawn: HP/dmg carry (no double), reroll re-applied
hb.rerollLeft = 0; const goldMid = hb.gold; const maxHpMid = hb.maxHp; const dmgMid = hb.baseDmg; const spdMid = hb.moveSpeed;
sim.dev.killHero();
sim.dev.retryRun(); // respawn()
hb = sim.G.hero;
const okRespawn = hb.maxHp === maxHpMid && hb.baseDmg === dmgMid && near(hb.moveSpeed, spdMid) && hb.gold === goldMid && hb.rerollLeft === 1 + 2;
if (okRespawn) pass("respawn: HP/dmg/gold/vel NOT double-applied; reroll re-added (1 base +2 meta = 3)"); else fail("respawn wrong: " + JSON.stringify({ maxHp: hb.maxHp, wantMaxHp: maxHpMid, dmg: hb.baseDmg, gold: hb.gold, wantGold: goldMid, rr: hb.rerollLeft, spd: hb.moveSpeed, wantSpd: spdMid }));
// save→load round-trip must NOT re-apply meta (metaApplied baseline persisted)
const saveBlob = sim.serializeSave();
const loadedMaxHp = saveBlob.maxHp, loadedDmg = saveBlob.baseDmg, loadedGold = saveBlob.gold;
if (saveBlob.metaApplied && saveBlob.metaApplied.hp === 24 && saveBlob.metaApplied.dmg === 6) pass("save persists metaApplied baseline {hp:24,dmg:6,...}"); else fail("metaApplied not saved: " + JSON.stringify(saveBlob.metaApplied));
sim.loadSave(saveBlob);
const hl = sim.G.hero;
if (hl.maxHp === loadedMaxHp && hl.baseDmg === loadedDmg && hl.gold === loadedGold) pass("loadSave: meta NOT double-applied after reload"); else fail("loadSave double-count: " + JSON.stringify({ maxHp: hl.maxHp, want: loadedMaxHp, dmg: hl.baseDmg, gold: hl.gold }));
// buying a NEW node after load applies only the DELTA on next run-start
sim.buyMetaNode("hpMax"); // hpMax 2->3 (essence was 0... top it up)
sim.loadMeta({ v: 1, essence: 500, nodes: { hpMax: 3, dmg: 3, moveSpd: 4, reroll: 2, startGold: 2 } });
const preBuyMaxHp = sim.G.hero.maxHp;
sim.dev.killHero(); sim.dev.retryRun();
if (sim.G.hero.maxHp === preBuyMaxHp + 12) pass("bought +hpMax node applies only +12 delta on next respawn"); else fail("delta apply wrong: " + (sim.G.hero.maxHp - preBuyMaxHp));

console.log(ok ? "\n✅ CAS-1557 meta logic PASS" : "\n❌ CAS-1557 meta logic FAIL");
process.exit(ok ? 0 : 1);
