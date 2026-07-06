// ---------------------------------------------------------------------------
// CAS-1600 — Priest offensive fill: unit test (data-level, no browser).
//
// Reconciled ENTREGABLE 1: the priest's redundant `powerword` (+def buff,
// overlapping the Égida/divineshield/boons defensive space) is REASSIGNED to
// `holynova` — an AoE-damage-plus-minor-heal spell that REUSES the existing
// `nova` resolver (same shape as paladin.consecration → 0 new combat code).
//
// Asserts (blocking ACs):
//   AC1: priest has exactly 3 spells, ≥2 of which deal damage (smite + holynova).
//   AC2: holynova is type "nova" (existing resolver) AND carries both dmg>0 and
//        heal>0 (damages in area + applies its minor heal). No 4th slot added.
//   AC3: warrior / paladin / mage / druid SPELLS are byte-identical to baseline
//        (RNG-neutral: the priest reassignment moves no other class' data).
//
// The `nova` resolver's dmg+heal+status handling is already exercised live by
// paladin.consecration (identical shape) and by tools/spells.mjs (headless
// spellProbe), so this data-level test is the smallest proof of the swap.
//
// Run: node tools/cas1600-priest-fill.mjs   (wired into `npm test`)
// ---------------------------------------------------------------------------
import { SPELLS } from "../sim/config.js";

let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => console.log(`✔ ${m}`);
const damages = (s) => (s.dmg || 0) > 0;

// --- AC1: priest = exactly 3 spells, ≥2 damaging -------------------------------
const priest = SPELLS.priest;
if (!Array.isArray(priest) || priest.length !== 3)
  fail(`priest must have exactly 3 spells, got ${priest ? priest.length : "none"} (no 4th slot allowed — spellCD[1..3])`);
else pass("priest has exactly 3 spells (slots 1-3, no 4th slot)");

const dmgSpells = priest.filter(damages);
if (dmgSpells.length < 2)
  fail(`priest must have ≥2 damaging spells, got ${dmgSpells.length} (${dmgSpells.map(s=>s.id).join(",")})`);
else pass(`priest has ${dmgSpells.length} damaging spells: ${dmgSpells.map(s=>s.id).join(", ")}`);

if (!priest.some(s => s.id === "smite" && damages(s))) fail("priest must still keep damaging `smite`");
else pass("priest keeps `smite` (nuke + stun)");

if (!priest.some(s => s.id === "greaterheal" && s.type === "heal")) fail("priest must keep `greaterheal` (healer identity)");
else pass("priest keeps `greaterheal` (healer identity)");

if (priest.some(s => s.id === "powerword")) fail("`powerword` must be REPLACED (redundant +def buff), not kept");
else pass("redundant `powerword` removed");

// --- AC2: holynova reuses the `nova` resolver, damages AND heals ----------------
const hn = priest.find(s => s.id === "holynova");
if (!hn) fail("priest must contain the new `holynova` spell");
else {
  if (hn.type !== "nova") fail(`holynova must be type "nova" (reuse existing resolver), got "${hn.type}"`);
  else pass('holynova casts via the existing "nova" resolver (0 new combat code)');
  if (!(hn.dmg > 0)) fail(`holynova must deal area damage (dmg>0), got ${hn.dmg}`);
  else pass(`holynova deals area damage (dmg=${hn.dmg}, range=${hn.range})`);
  if (!(hn.heal > 0)) fail(`holynova must apply its minor heal (heal>0), got ${hn.heal}`);
  else pass(`holynova applies minor heal (heal=${hn.heal}) — support-DPS fantasy`);
  // priest is slot index 1 (greaterheal / holynova / smite)
  if (priest[1].id !== "holynova") fail(`holynova should occupy slot 2 (index 1), found "${priest[1].id}"`);
  else pass("holynova occupies priest slot 2");
}

// --- AC3: the other 4 classes are byte-identical to baseline -------------------
// Frozen JSON snapshot of the pre-CAS-1600 data for warrior/paladin/mage/druid.
// If ANY of these change, the priest reassignment leaked into another class
// (RNG/save/blast-radius regression) and this test fails loudly.
const BASELINE = {
  warrior: [
    {id:"shieldbash", type:"cone", cost:8,  cd:3.0, dmg:20, range:74, arc:Math.PI*0.70, status:{type:"stun",dur:0.9}, knock:1.7, col:"#dfe6f0", fx:"conecast", sfx:"sword"},
    {id:"warcry",     type:"buff", cost:12, cd:9.0, stat:"dmg", amt:9,  dur:6.0, col:"#c8313a", fx:"buffaura", sfx:"rune"},
    {id:"charge",     type:"dash", cost:14, cd:5.0, dmg:30, range:64, col:"#dfe6f0", fx:"charge", sfx:"roll"},
  ],
  paladin: [
    {id:"consecration", type:"nova", cost:14, cd:4.0, dmg:26, range:104, heal:10, status:{type:"burn"}, col:"#ffe39a", fx:"holynova", sfx:"rune"},
    {id:"divineshield", type:"buff", cost:12, cd:10.0, stat:"def", amt:11, dur:6.0, col:"#ffe39a", fx:"buffaura", sfx:"heal"},
    {id:"judgment",     type:"proj", cost:16, cd:3.0, dmg:46, spd:480, kind:"judgment", col:"#ffd24d", fx:"spellburst", sfx:"fire"},
  ],
  mage: [
    {id:"fireball", type:"proj", cost:10, cd:1.4, dmg:24, spd:320, kind:"fire", aoe:48, status:{type:"burn"}, col:"#ff7a3a", fx:"flame", sfx:"fire"},
    {id:"frost",    type:"nova", cost:14, cd:3.5, dmg:16, range:110, status:{type:"slow",amt:0.45,dur:2.5}, col:"#7fd6ff", fx:"novacast", style:"crystal", sfx:"rune"},
    {id:"blink",    type:"blink", cost:14, cd:5.5, range:158, iframe:0.42, col:"#9be7ff", fx:"blink", sfx:"roll"},
  ],
  druid: [
    // CAS-1601 reconciliation: druid slot-2 `regen`→`floracion` is a SEPARATE, legitimate
    // audit change (sibling task, parent CAS-1598). Baseline updated so this test still proves
    // the priest reassignment didn't LEAK into druid; warrior/paladin/mage stay frozen as the
    // no-leak proof. slot-1 (vines) + slot-3 (thornstorm) remain byte-identical.
    {id:"vines",      type:"nova", cost:12, cd:4.0, dmg:14, range:92,  status:{type:"stun",dur:1.4}, col:"#8fd47a", fx:"novacast", style:"spike", sfx:"rune"},
    {id:"floracion", type:"nova", cost:12, cd:5.0, dmg:14, range:88, heal:10, status:{type:"slow",amt:0.4,dur:2.2}, col:"#7bd44a", fx:"novacast", style:"spike", sfx:"heal"},
    {id:"thornstorm", type:"field", cost:20, cd:6.0, dmg:11, tick:0.5, dur:3.0, range:74, offset:46, status:{type:"slow",amt:0.6,dur:1.1}, col:"#5fae4a", fx:"thornfield", style:"spike", sfx:"rune"},
  ],
};
for (const cls of Object.keys(BASELINE)) {
  const got = JSON.stringify(SPELLS[cls]);
  const want = JSON.stringify(BASELINE[cls]);
  if (got !== want) fail(`${cls} SPELLS changed — must be byte-identical (RNG-neutral). CAS-1600 touches ONLY priest.`);
  else pass(`${cls} SPELLS byte-identical to baseline`);
}

if (!ok) { console.error("\n✖ CAS-1600 priest-fill test FAILED."); process.exit(1); }
console.log("\n✓ CAS-1600 priest offensive fill: 3 spells (≥2 damage), holynova reuses nova + heals, other 4 classes intact.");
