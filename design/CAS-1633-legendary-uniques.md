# CAS-1633 — Ítems Únicos / Legendarios (loot que define builds)

**Owner:** CTO (spec) → Game Engineer (build). Deploy gated on CAS-1605 UI sign-off.

Next ARPG evolution after: active abilities → ranks → talents-por-nivel → afijos → élites → World Tier. Deepens loot hunting (core retention). **$0 art** — reuses existing rarity tint/pips (CAS-1593). Purely additive, data-driven, copy-on-write over existing seams — **no combat/loot rewrite**.

---

## 1. New top rarity `legendary`

`sim/gear.js` `RARITY` enum — append a 5th tier:

```js
legendary: { col:"#ff9a2e", mult:2.05, weight:0, rank:4 },
```

- Append `"legendary"` to `RARITY_ORDER`.
- **`weight:0` is load-bearing for RNG-neutrality**: `rollRarity()` sums weights into `total` and subtracts them; a 0-weight tier contributes 0 to `total` and 0 to the running subtract, so `rollRarity()` can **never** return `legendary`. It is assigned *only* by the explicit append-only roll (§3). Verify this stays byte-identical.
- `RARITY_MARK` (render.js ~L196): add `legendary:"✦ "` (colorblind shape mark, distinct from epic `★`).
- Gold-orange `col` flows through the existing `drawGearDrop()` / inventory tint & pip path → **AC1 visible/distinguible, $0 art**.
- `gearStat()` already multiplies by `RARITY[rarity].mult` → legendary gets top base stats automatically.

## 2. The 6 uniques (each = ONE build-defining mod on an existing system)

Data-driven table `UNIQUES` in `sim/config.js` (or gear.js). A legendary instance carries `inst.unique = "<id>"`. The unique's custom name **overrides** the base gear display name; its `mod` object is read by a new `uniqueMods(h)` aggregator (mirror of `affixTotals()`) that scans equipped slots.

| id | Nombre | Slot | Mod | Hook (existing seam) |
|----|--------|------|-----|----------------------|
| `chrono` | **Reloj de Kael** | weapon | `-22%` cooldown de habilidades/hechizos | CD formula in `castSpell`/`castAbility`: `cd*(1-(h.tt.cdr + uniqueMods.cdrPct)/100)` |
| `avarice` | **Corazón Ávido** | body | `+30%` Esencia ganada | `essenceForRun` gain: `* (1 + uniqueMods.essencePct/100)` at bank site (sim.js ~L1899) |
| `venom` | **Colmillo Venenoso** | weapon | ataque básico aplica veneno DoT | append proc to `weaponProcs(h)` → existing `applyStatus(e,"poison",{dmg})` in `hitEnemy` |
| `chainlink` | **Prisma de Cadenas** | weapon | habilidad Cadena `+2` saltos | `uniqueEmpower(h,sp)` copy-on-write beside `talentEmpower` for `chain` resolver (jumps+2) |
| `supernova` | **Núcleo de Supernova** | weapon | Nova hace `2×` daño+radio | `uniqueEmpower` on `nova`/`holynova` (dmg*2, radius*1.5) |
| `colossus` | **Égida del Coloso** | shield | `+40%` vida máxima | `heroMaxHp(h)`: nest `* (1 + uniqueMods.hpPct/100)` with existing `bb.hpMul` |

**`uniqueMods(h)`** returns `{cdrPct, essencePct, hpPct, procs:[...], chainJumps, novaMul}` aggregated from equipped `.unique` items (empty/zero if none equipped → **zero behavioral change when unequipped**). Each unique documented inline with its config entry.

## 3. Append-only, RNG-neutral drop (AC3 — the critical constraint)

**Contract:** with no legendary rolled, the *entire* existing loot distribution is **byte-identical** under a fixed seed. Proven by setting rate→0 and diffing terrain/loot hash (CAS-1590/1586 precedent).

`maybeLegendary(srand, inst, bias)` in gear.js:

```js
export function maybeLegendary(srand, inst, bias){
  if(!inst) return inst;
  const rate = LEGENDARY_RATE * (bias||0);
  if(rate <= 0) return inst;              // ZERO srand at rate 0 → byte-identical
  if(srand() < rate){                     // APPENDED as the LAST roll for this drop
    inst.rarity = "legendary";
    inst.unique = pickUnique(srand, inst.slot);   // extra srand ONLY when it hits
  }
  return inst;
}
```

- Call it **immediately after** each `rollGearInst(...)` at **elite / champion / boss** drop sites only (AC3 "sesgada a élites/campeones/jefes"). **Do NOT call it on trash drops** → trash loot stays byte-identical unconditionally.
  - Boss (sim.js ~L1297): `bias` high (e.g. `1.0`).
  - ChampElite (sim.js ~L2592-2599): `bias` high — apply to the guaranteed epic roll.
  - Hunt champion (sim.js ~L1420): `bias` mid.
  - Ambush elite (sim.js ~L2578): `bias` low.
- `LEGENDARY_RATE` config small (e.g. `0.05`); `bias` scales per source. Because trash never calls it and elite calls are the *last* RNG for that drop, `__dev.setLegendaryRate(0)` (or `LEGENDARY_RATE=0`) makes **every** drop site consume 0 extra srand → whole run byte-identical. That is the QA seed test.
- `pickUnique(srand, slot)`: filter UNIQUES to those matching `slot`, pick one with `srand()`. Only runs on a hit.

## 4. Display / equip / persist

- render.js gear-name sites: if `inst.unique`, show `UNIQUES[inst.unique].name` instead of base def name (keep the `✦` mark + gold col).
- Equip flows through existing `equipBag()` unchanged; mods apply via `uniqueMods` in the stat/CD/essence formulas.
- **Persistence:** `inst.unique` is a plain string field on the gear instance. Confirm `serializeSave`/`loadSave` persist the full instance object (don't strip unknown keys) so equipped/bagged uniques survive save/reload.

## 5. Dev hooks (for QA harness)

Add to game.js `__dev` (curated bridge): `setLegendaryRate(r)`, `grantUnique(id)` (inject a specific unique into bag), `uniqueMods()` (read aggregate). Mirror the `__dev.setChampRate`/`abilityRank` pattern.

## Acceptance criteria
- **AC1** legendary rarity visible/distinguible (gold-orange tint + `✦` mark), reuses existing pip/tint path, $0 art.
- **AC2** the 6 uniques each work in-run (CD reduction, +Esencia, basic-attack DoT, Chain +jumps, Nova 2×, +max HP) — each hooking an existing system.
- **AC3** drop append-only: `LEGENDARY_RATE=0` (or `__dev.setLegendaryRate(0)`) → existing loot byte-identical under fixed seed (terrain/loot hash unchanged); trash never rolls legendary.
- **AC4** no regression: draggable HUD, inv 30, abilities, ranks, talents, afijos, World Tier all intact; `npm test` green + determinism.
- **AC5** $0 art (no new sprites/PNGs).

## Verification (build-time, before deploy)
- `npm test` green (determinism + existing suites).
- New harness `tools/cas163X-legendary.mjs`: real drop roll with rate 0 → byte-identical hash vs baseline; rate 1 → legendary appears; each of 6 uniques' mod applied via real formulas (not stubs).

## Deploy gate
**Do NOT deploy to gh-pages until CAS-1605 (UI redesign, build `c4a549ae2fa1`) is signed live** (QA CAS-1636 → CEO CAS-1637). Build + verify now; CTO deploys isolated-overlay after UI signs, then QA live (PASS ×2 desktop+mobile, md5 live==HEAD, seed byte-identity) → CEO gate `e77e7f98`.
