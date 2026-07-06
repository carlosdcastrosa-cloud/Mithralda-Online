// ---------------------------------------------------------------------------
// Pure-node unit test for CAS-1601 (parent CAS-1598):
//   ENTREGABLE 2 — level-gated talent tree (tier-1 → Nv 3, tier-2 → Nv 6).
//   ENTREGABLE 1 — class-spell audit (druid slot-2 swap).
//
// Imports the REAL pure functions from sim/talents.js + the SPELLS data from
// sim/config.js and exercises them directly (no DOM / no browser) — the same
// rules the sim & UI read, so a green run proves the logic without Chromium.
//
// Run: node tools/cas1601-talent-levelgate.mjs   (wired into `npm test`)
// ---------------------------------------------------------------------------
import { SPELLS } from "../sim/config.js";
import { canAllocTalent, lockReason, sanitizeTalents, talentNode } from "../sim/talents.js";

let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const eq = (a, b, m) => (a === b ? pass(`${m} (=${JSON.stringify(a)})`) : fail(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`));

// A minimal hero fixture — only the fields the pure talent fns read.
function hero(over) { return Object.assign({ cls: "warrior", lvl: 1, talentPts: 10, talents: {} }, over || {}); }

// ---- ENTREGABLE 2: level gates -------------------------------------------
// wA2 (Frenesí) is tier-1 → levelReq:3, prereq wA1. wA3 (Golpe brutal) is tier-2 → levelReq:6.
eq(talentNode("warrior", "wA2").levelReq, 3, "[data] wA2 (tier-1) levelReq");
eq(talentNode("warrior", "wA3").levelReq, 6, "[data] wA3 (tier-2) levelReq");
eq(talentNode("warrior", "wA1").levelReq, undefined, "[data] wA1 (tier-0) has NO levelReq");

// (1) canAllocTalent FALSE when hero level < node.levelReq (prereq met, points free).
{ const h = hero({ lvl: 1, talents: { wA1: 1 } });
  eq(canAllocTalent(h, "wA2"), false, "[AC3] canAllocTalent(wA2) FALSE at lvl 1 (< levelReq 3)"); }

// (2) canAllocTalent TRUE when hero level >= node.levelReq (prereq met, points free).
{ const h = hero({ lvl: 3, talents: { wA1: 1 } });
  eq(canAllocTalent(h, "wA2"), true, "[AC4] canAllocTalent(wA2) TRUE at lvl 3 (>= levelReq 3, wA1 taken)"); }

// tier-2 needs level 6 even with prereq (wA2) taken.
{ const h5 = hero({ lvl: 5, talents: { wA1: 1, wA2: 1 } });
  eq(canAllocTalent(h5, "wA3"), false, "[gate] canAllocTalent(wA3 tier-2) FALSE at lvl 5 (< 6)");
  const h6 = hero({ lvl: 6, talents: { wA1: 1, wA2: 1 } });
  eq(canAllocTalent(h6, "wA3"), true, "[gate] canAllocTalent(wA3 tier-2) TRUE at lvl 6"); }

// (3) lockReason returns "level:3" for a tier-1 node at level 1 (prereq met so the
//     level gate is the operative reason, not "req").
{ const h = hero({ lvl: 1, talents: { wA1: 1 } });
  eq(lockReason(h, "wA2"), "level:3", "[AC3] lockReason(wA2) = 'level:3' at lvl 1"); }
{ const h = hero({ lvl: 5, talents: { wA1: 1, wA2: 1 } });
  eq(lockReason(h, "wA3"), "level:6", "[gate] lockReason(wA3 tier-2) = 'level:6' at lvl 5"); }

// (4) sanitizeTalents does NOT strip a valid tier-1 rank on load, regardless of the
//     level in the blob — a build earned at level must survive a reload (AC per spec).
{ const blob = { wA1: 3, wA2: 2 };                 // legal build (prereq present)
  const out = sanitizeTalents(blob, "warrior");
  eq(out.wA1, 3, "[AC-persist] sanitizeTalents keeps wA1 (tier-0)");
  eq(out.wA2, 2, "[AC-persist] sanitizeTalents keeps wA2 (tier-1) — level NOT re-checked on load"); }
// still enforces prereq: an orphan tier-1 rank (no wA1) is dropped as before.
{ const out = sanitizeTalents({ wA2: 2 }, "warrior");
  eq(out.wA2, undefined, "[AC-persist] orphan tier-1 (no prereq) still dropped"); }

// every class has its tier-1 and tier-2 nodes gated (5 gated nodes each).
for (const cls of ["warrior", "paladin", "mage", "druid", "priest"]) {
  const { TALENTS } = await import("../sim/talents.js");
  const gated = TALENTS[cls].nodes.filter((n) => n.levelReq);
  const t1 = TALENTS[cls].nodes.filter((n) => n.tier === 1).every((n) => n.levelReq === 3);
  // CAS-1602: tier-2 STAT capstones stay Nv6; the tier-2 SPELL-EMPOWER node is a deeper Nv8
  // gate (validated in tools/cas1602-talent-empower.mjs), so exclude empower nodes here.
  const t2 = TALENTS[cls].nodes.filter((n) => n.tier === 2 && !n.empower).every((n) => n.levelReq === 6);
  const t0 = TALENTS[cls].nodes.filter((n) => n.tier === 0).every((n) => !n.levelReq);
  if (t1 && t2 && t0 && gated.length >= 5) pass(`[data] ${cls}: tier-1→Nv3, tier-2→Nv6, tier-0 ungated (${gated.length} gated)`);
  else fail(`[data] ${cls} gating wrong: t1=${t1} t2=${t2} t0=${t0} gated=${gated.length}`);
}

// ---- ENTREGABLE 1: spell audit (druid slot-2 swap; priest slot-2 = CAS-1600) ----
eq(SPELLS.druid[1].id, "floracion", "[AC1] druid slot-2 = floracion (was regen)");
eq(SPELLS.druid[1].type, "nova", "[AC1] floracion reuses the nova resolver");
eq(SPELLS.druid[1].heal, 10, "[AC1] floracion heals the hero (nova+heal path)");
eq(SPELLS.druid[1].status.type, "slow", "[AC1] floracion slows nearby enemies");
// slot 1 + 3 INTACT (only slot 2 changed).
eq(SPELLS.druid[0].id, "vines", "[AC6] druid slot-1 (vines) intact");
eq(SPELLS.druid[2].id, "thornstorm", "[AC6] druid slot-3 (thornstorm) intact");
// priest slot-2 was reassigned by sibling CAS-1600 → holynova (offensive AoE tool);
// assert it is an offensive slot-2 (not the old redundant powerword buff).
{ const p1 = SPELLS.priest[1];
  if (p1.id !== "powerword" && (p1.type === "nova" || p1.type === "cone") && p1.dmg > 0)
    pass(`[AC2*] priest slot-2 is an offensive tool ('${p1.id}' ${p1.type}, dmg ${p1.dmg}) — CAS-1600 holynova, satisfies audit intent`);
  else fail(`[AC2*] priest slot-2 not an offensive tool: ${JSON.stringify(p1)}`); }
eq(SPELLS.priest[0].id, "greaterheal", "[AC6] priest slot-1 (greaterheal) intact");
eq(SPELLS.priest[2].id, "smite", "[AC6] priest slot-3 (smite) intact");
// other classes fully unchanged.
eq(SPELLS.warrior.map((s) => s.id).join(","), "shieldbash,warcry,charge", "[AC6] warrior spells intact");
eq(SPELLS.mage.map((s) => s.id).join(","), "fireball,frost,blink", "[AC6] mage spells intact");

console.log(ok ? "\n✓ CAS-1601 talent-levelgate + spell-audit unit tests passed." : "\n✗ CAS-1601 unit tests FAILED.");
process.exit(ok ? 0 : 1);
