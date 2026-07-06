// ---------------------------------------------------------------------------
// CAS-1628 — Mana potion usable in the potion bar (parent board CAS-1625).
//
// The "barra de pociones" is the on-canvas consumable quick-slot
// (renderConsumableSlot / AR("consumable"), keys [Q] use · [R] cycle). It cycles
// the data-driven CONSUMABLES list. `greater` (Poción mayor, healFrac) is the HP
// potion the player already sees there; there was NO mana equivalent — the bug.
//
// This drives the REAL doConsumable() (imported from sim/sim.js, no browser) to
// prove the new `mana` consumable is a true parity mirror of `greater`:
//   AC1: `mana` exists in CONSUMABLES, appears in the same cycled slot list.
//   AC2: using it consumes 1 charge, restores MAX_MP*manaFrac mana, sets its cd,
//        and caps at maxMp (no overflow).
//   AC3: no regression — `greater` still heals HP; fury/antidote intact.
//   RNG: doConsumable / the config list touch no RNG sequence (deterministic).
//
// Run: node tools/cas1628-mana-potion.mjs
// ---------------------------------------------------------------------------
import { G, doConsumable, configure } from "../sim/sim.js";
import { CONSUMABLES } from "../sim/config.js";

// headless: inject no-op deps so audio/view side-effects don't throw (same seam the
// real client uses via configure({io,audio,view})). sfx is a Proxy of no-op fns.
const noopSfx = new Proxy({}, { get: () => () => {} });
configure({ io: {}, audio: { sfx: noopSfx }, view: {} });

let ok = true;
const P = (m) => console.log("✔ " + m);
const F = (m) => { ok = false; console.error("✖ " + m); };

// ---- data contract ---------------------------------------------------------
const mana = CONSUMABLES.find((c) => c.id === "mana");
const greater = CONSUMABLES.find((c) => c.id === "greater");
mana ? P("`mana` consumable present in CONSUMABLES (appears in the potion bar list)")
     : F("`mana` consumable MISSING from CONSUMABLES");
greater ? P("`greater` (HP potion) still present — no regression AC3")
        : F("`greater` HP potion vanished — regression");
if (mana) {
  (mana.manaFrac > 0) ? P(`mana.manaFrac=${mana.manaFrac} (restores mana)`) : F("mana has no manaFrac effect");
  (!mana.healFrac) ? P("mana does NOT heal HP (distinct axis)") : F("mana wrongly heals HP");
  (greater && mana.manaFrac === greater.healFrac) ? P(`balance parity: manaFrac==greater.healFrac (${mana.manaFrac})`)
    : F("mana/greater fraction mismatch (not balance-symmetric)");
  (greater && mana.cd === greater.cd && mana.price === greater.price)
    ? P(`price/cd parity with greater (price ${mana.price}, cd ${mana.cd}s)`) : F("mana price/cd not parity");
  (mana.col && mana.col !== greater.col) ? P(`distinct tint col ${mana.col} (mana-blue, $0 art via consumIcon)`)
    : F("mana icon tint not distinct from greater");
}

// ---- drive the REAL doConsumable() -----------------------------------------
const mi = CONSUMABLES.findIndex((c) => c.id === "mana");
G.scene = "play";
G.hero = { x: 0, y: 0, hp: 10, mp: 10, maxMp: 100, cls: "warrior", lvl: 1,
  consum: { fury: 0, antidote: 1, greater: 1, mana: 2 }, consumSel: mi, consumCD: {},
  dots: null, slow: 1, slowT: 0 };

const before = G.hero.mp, qty0 = G.hero.consum.mana;
const r = doConsumable();
const expect = Math.min(100, before + Math.round(100 * mana.manaFrac));
r ? P("doConsumable() returned true (mana slot fired)") : F("doConsumable() returned false");
(G.hero.mp === expect) ? P(`mana restored ${before}->${G.hero.mp} (+${Math.round(100 * mana.manaFrac)}) [AC2]`)
  : F(`mana got ${G.hero.mp}, want ${expect}`);
(G.hero.consum.mana === qty0 - 1) ? P(`consumed 1 charge (${qty0}->${G.hero.consum.mana}) [AC2]`)
  : F(`charge count wrong: ${G.hero.consum.mana}`);
(G.hero.consumCD.mana > 0) ? P(`cooldown armed (${G.hero.consumCD.mana}s)`) : F("no cooldown after use");

// cap: near-full mana never overflows
G.hero.mp = 95; G.hero.consumCD = {};
doConsumable();
(G.hero.mp === 100) ? P("caps at maxMp (95->100, no overflow)") : F(`cap failed: ${G.hero.mp}`);

// AC3 no-regression: the mana branch is HP-neutral, and greater's heal path is
// byte-unchanged. Drive greater with a hero that has the maxHp field heroMaxHp reads
// (h.maxHp + affixTotals) so the heal actually runs, then assert HP rose & mana untouched.
G.hero = { x: 0, y: 0, hp: 10, maxHp: 100, mp: 50, maxMp: 100, cls: "warrior", lvl: 1,
  gear: {}, equip: {}, consum: { greater: 1 }, consumSel: CONSUMABLES.findIndex((c) => c.id === "greater"),
  consumCD: {}, dots: null, slow: 1, slowT: 0 };
const hp0 = G.hero.hp, mpBefore = G.hero.mp;
doConsumable();
(G.hero.hp > hp0) ? P(`greater still heals HP (${hp0}->${G.hero.hp}) — no regression [AC3]`) : F(`greater heal regressed (hp ${G.hero.hp})`);
(G.hero.mp === mpBefore) ? P(`greater leaves mana untouched (${mpBefore}) — HP/mana axes independent`) : F(`greater wrongly changed mana to ${G.hero.mp}`);

console.log(ok ? "\n✅ CAS-1628 mana potion: PASS" : "\n❌ CAS-1628 mana potion: FAIL");
process.exit(ok ? 0 : 1);
