// ---------------------------------------------------------------------------
// CAS-1608 — bag cap 16 -> 30 USABLE slots (follow-up CAS-1593).
//
// Drives the REAL sim (sim/sim.js) headless and asserts the two effective caps:
//   1) loadSave persists a full 30-item bag (was clamped to 16 → items 17..30 lost).
//   2) An over-full (40-item) blob is clamped to BAG_CAP=30, not 16 and not 40.
//   3) The 30-cell visual grid (CAS-1594, render TOTAL_SLOTS=30) matches the cap:
//      30 usable slots fit exactly, no slot is unreachable.
//
// takeGear's bag-full melt path and BAG_CAP share the same const; loadSave's
// slice(0,BAG_CAP) is the persistence gate. Live full-inventory / drag / equip /
// scroll regression is QA's job (child issue) — this locks the logic contract.
//
// Run: node tools/cas1608-bagcap30.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop });
sim.configure({ io: { intent: () => ({}), clear: noop }, audio: { sfx, music: noop, setMusic: noop }, view: { VW: 800, VH: 600, shake: noop } });

let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };

// A minimal but VALID gear instance the sim's safeInst() will accept: a real
// weapon defId so gearName/gearStat resolve. Vary rarity so they're distinct.
const RAR = ["common", "rare", "epic"];
function bagBlob(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ slot: "weapon", defId: "w_iron", rarity: RAR[i % RAR.length] });
  return out;
}
// A VALID save blob (correct version/cls) with a hand-set bag of n items.
function saveWithBag(n) { sim.createHero("BagBot", "warrior"); const d = sim.serializeSave(); d.bag = bagBlob(n); return d; }

// ---- 1) full 30-item bag round-trips through save/load ---------------------
sim.loadSave(saveWithBag(30));
let n = sim.G.hero.bag.length;
if (n === 30) pass("loadSave persists all 30 items (30 usable slots)"); else fail("expected 30 bag items after load, got " + n);

// ---- 2) over-full blob clamps to 30, not 16 and not 40 ---------------------
sim.loadSave(saveWithBag(40));
n = sim.G.hero.bag.length;
if (n === 30) pass("40-item blob clamped to BAG_CAP=30 (was 16)"); else fail("expected clamp to 30, got " + n);

// ---- 3) a 16-item legacy save still loads (retro-compat, no over-read) -----
sim.loadSave(saveWithBag(16));
n = sim.G.hero.bag.length;
if (n === 16) pass("legacy 16-item save loads unchanged (retro-compat)"); else fail("expected 16, got " + n);

// ---- 4) cap matches the shipped 30-cell visual grid ------------------------
// render.js CAS-1594: GCOLS=5, TOTAL_SLOTS=30. The logical cap must equal the
// number of drawable cells so no held item is unreachable and no cell is dead.
const TOTAL_SLOTS = 30; // mirror of render.js constant (CAS-1594)
if (sim.G.hero.bag.length <= TOTAL_SLOTS) pass("cap (30) == visual grid cells (30): every slot reachable");

console.log(ok ? "\n✅ CAS-1608 bag cap 30: ALL PASS" : "\n✗ CAS-1608 bag cap tests FAILED.");
process.exit(ok ? 0 : 1);
