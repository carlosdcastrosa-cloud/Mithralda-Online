// ---------------------------------------------------------------------------
// Pure-node unit test for CAS-1602 (parent CAS-1598, sibling of A = CAS-1600):
//   ENTREGABLE 2 — extend the per-LEVEL talent tree with
//     (Gap 2) SPELL-EMPOWER nodes: a data-driven, copy-on-write overlay that
//             upgrades ONE class spell (the ENTREGABLE 1↔2 bridge), and
//     (Gap 1) a deeper Nv8 level gate + sanitize level-clamp.
//
// Imports the REAL pure functions from sim/talents.js + the SPELLS data from
// sim/config.js and exercises them directly (no DOM / no browser) — the same
// rules the sim & UI read, so a green run proves the logic without Chromium.
//
// Run: node tools/cas1602-talent-empower.mjs   (wired into `npm test`)
// ---------------------------------------------------------------------------
import { SPELLS } from "../sim/config.js";
import { TALENTS, talentEmpower, talentNode, canAllocTalent, lockReason, sanitizeTalents } from "../sim/talents.js";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const eq = (a, b, m) => (a === b ? pass(`${m} (=${JSON.stringify(a)})`) : fail(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`));

function hero(over) { return Object.assign({ cls: "warrior", lvl: 10, talentPts: 20, talents: {} }, over || {}); }

// The empower node id + the spell param it scales, per class (the signature spell).
const EMP = {
  warrior: { node: "wC3", spell: "shieldbash", read: (sp) => sp.status.dur },
  paladin: { node: "pC3", spell: "consecration", read: (sp) => sp.range },
  mage:    { node: "mC3", spell: "fireball",  read: (sp) => sp.aoe },
  druid:   { node: "dC3", spell: "thornstorm", read: (sp) => sp.dur },
  priest:  { node: "prC3", spell: "holynova", read: (sp) => sp.range },
};

// ---- Gap 2: every class has exactly one spell-empower node, Nv8-gated, targeting its spell ----
for (const cls of Object.keys(EMP)) {
  const { node, spell } = EMP[cls];
  const n = talentNode(cls, node);
  if (!n) { fail(`[data] ${cls} empower node ${node} missing`); continue; }
  eq(!!n.empower, true, `[AC2] ${cls}.${node} is a spell-empower node`);
  eq(n.empower.spell, spell, `[AC2] ${cls}.${node} targets '${spell}'`);
  eq(n.levelReq, 8, `[Gap1] ${cls}.${node} is a deep Nv8 capstone`);
  eq(n.tier, 2, `[data] ${cls}.${node} tier-2`);
  // exactly ONE empower node per class
  eq(TALENTS[cls].nodes.filter((x) => x.empower).length, 1, `[AC2] ${cls} has exactly 1 spell-empower node`);
}

// ---- AC3 (+AC2): priest capstone empowers the ENTREGABLE 1 holynova (radio ↑) ----
{ const base = SPELLS.priest[1];                          // holynova (slot 2, from CAS-1600)
  eq(base.id, "holynova", "[AC3] priest signature spell = holynova (ENTREGABLE 1)");
  const emp = talentNode("priest", "prC3").empower.apply(base, 1);
  eq(emp.range, base.range + 28, "[AC3] prC3 empowers holynova range +28 (observable)");
  eq(emp !== base, true, "[AC3] empower returns a COPY (not the shared SPELLS entry)");
  eq(base.range, 104, "[AC5] base holynova.range UNMUTATED after apply (copy-on-write)"); }

// ---- AC2/AC5: talentEmpower is 0-delta (same object) when node NOT bought ----
for (const cls of Object.keys(EMP)) {
  const { spell, read } = EMP[cls];
  const base = SPELLS[cls].find((s) => s.id === spell);
  const h = hero({ cls, talents: {} });                   // nothing bought
  const got = talentEmpower(h, base);
  eq(got === base, true, `[AC5] ${cls}: unbought → talentEmpower returns SAME object (0-delta, RNG-neutral)`);
  // and when bought, it returns a copy with the param scaled
  const hb = hero({ cls, talents: { [EMP[cls].node]: 1 } });
  const emp = talentEmpower(hb, base);
  eq(emp !== base, true, `[AC2] ${cls}: bought → talentEmpower returns a COPY`);
  if (read(emp) > read(base)) pass(`[AC2] ${cls}: bought empower observably raises '${spell}' param (${read(base)}→${read(emp)})`);
  else fail(`[AC2] ${cls}: empower did not raise the spell param (${read(base)}→${read(emp)})`);
  eq(read(base), read(base), `[AC5] ${cls}: base spell param unchanged after both calls`);
}

// warrior nested-object copy: empowering shieldbash must not mutate the shared status object.
{ const base = SPELLS.warrior[0];
  const beforeDur = base.status.dur;
  const emp = talentNode("warrior", "wC3").empower.apply(base, 1);
  eq(emp.status.dur, beforeDur + 0.6, "[AC2] wC3 stun dur +0.6");
  eq(base.status.dur, beforeDur, "[AC5] shieldbash.status.dur UNMUTATED (nested copy-on-write)");
  eq(emp.status !== base.status, true, "[AC5] empowered status is a distinct object"); }

// ---- Gap 1: Nv8 gate on the empower node (prereq met, points free) ----
{ const h7 = hero({ cls: "priest", lvl: 7, talents: { prC1: 1, prC2: 1 } });
  eq(canAllocTalent(h7, "prC3"), false, "[AC1] prC3 NOT allocable at lvl 7 (< Nv8)");
  eq(lockReason(h7, "prC3"), "level:8", "[AC1] lockReason(prC3) = 'level:8' at lvl 7");
  const h8 = hero({ cls: "priest", lvl: 8, talents: { prC1: 1, prC2: 1 } });
  eq(canAllocTalent(h8, "prC3"), true, "[AC1] prC3 allocable at lvl 8 (prereq + level met)"); }

// ---- Gap 1: sanitizeTalents level-clamp — a build above the loaded level is dropped ----
{ const blob = { wC1: 1, wC2: 1, wC3: 1 };                // legal only at lvl>=8
  const legal = sanitizeTalents(blob, "warrior", 10);
  eq(legal.wC3, 1, "[AC5] sanitize keeps wC3 when loaded lvl 10 >= Nv8");
  const clamped = sanitizeTalents(blob, "warrior", 5);    // tampered: wC3 bought but only lvl 5
  eq(clamped.wC3, undefined, "[AC5] sanitize DROPS wC3 when loaded lvl 5 < Nv8 (build always legal)");
  eq(clamped.wC2, 1, "[AC5] sanitize keeps wC2 (Nv3 <= lvl 5)");
  // retro-compat: omitting lvl (old callers) = no level clamp (only prereq/excl rules).
  const legacy = sanitizeTalents(blob, "warrior");
  eq(legacy.wC3, 1, "[AC5] sanitize WITHOUT lvl keeps wC3 (retro-compat, level check off)"); }

console.log(ok ? "\n✓ CAS-1602 talent spell-empower + level-clamp unit tests passed." : "\n✗ CAS-1602 unit tests FAILED.");
process.exit(ok ? 0 : 1);
