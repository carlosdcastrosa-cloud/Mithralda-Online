# CAS-1751 — Códice de Botín (Collection Log)

**Owner (design):** CTO · **Type:** retention beat, game-code only, $0 art, RNG-neutral
**Amplifies:** CAS-1631 uniques (`inst.uniq`), CAS-1653 sets (`inst.set`), CAS-1686 runes (`inst.rune`).

## Product intent
A permanent, account-wide collection log. The **first** time the player ever picks up
a given unique item, set piece, or rune, that entry is recorded forever and grants a
small permanent bonus to the account (e.g. +dmg per unique, +hp per set piece, +hp per
rune type). This creates a "gotta collect them all" loop that rewards engaging with the
loot systems already shipped. A panel shows discovered vs locked and the accumulated bonus.

## Architecture & domain lenses

- **State authority / determinism:** the codex is a **pure read-side ledger**. It NEVER
  calls any RNG stream and NEVER writes to `sim`/combat state other than a derived,
  cached stat total. It only READS drop/pickup events that already fire.
- **RNG-neutral by construction:** because the codex touches no RNG, RNG-neutrality is
  guaranteed structurally — not by gating a stream. The `enabled=false` proof is that the
  srand/sim sequence and `save.v1` serialization are byte-identical to HEAD.
- **Reversibility:** append-only ledger in its own key; discovery is a one-way set-insert.
  Cheap to reverse (delete key), no migration.
- **Blast radius:** everything gated behind `CFG.CODEX.enabled`. When false: no pickup
  hook side effect, no stat contribution, no HUD button, no panel. Isolated behind the flag.
- **YAGNI / load-bearing:** the load-bearing piece is the *bonus recompute point* and the
  *persistence isolation*. Keep the ledger a flat map; no over-engineering.

## Persistence (isolated, additive)

- New key **`mithralda.codex.v1`** in `persist.js`, own lifecycle (mirror `KEY_ARENA`/`KEY_META`).
  Add `KEY_CODEX`, `bootCodex()`, `saveCodex()`, and wire `bootCodex()` in `game.js`
  boot BEFORE `persist.boot()` (line ~116), same slot as `bootMeta`/`bootArena`, because
  it is account-wide and a loaded hero must reconcile against it.
- Shape (sim owns serialize/load, persist owns medium):
  ```js
  { v:1, uniq:{ "<uniqId>":1, ... }, set:{ "<setId>":1, ... }, rune:{ "<runeType>":1, ... } }
  ```
  Missing/corrupt → empty codex (`{v:1,uniq:{},set:{},rune:{}}`). Never touches `save.v1`.
- When `CODEX.enabled=false`: `bootCodex()` still loads (harmless read) but the ledger is
  never mutated and contributes 0 — so no observable difference. Simplest: guard the
  discovery write and the stat contribution on the flag.

## Discovery hook (read-only)

In `sim.js tryPickup()` (~sim.js:2352), in the existing branches, AFTER the item is taken:
- gear branch (`takeGear`): if `inst.uniq` and not yet in `codex.uniq` → `recordCodex("uniq",inst.uniq)`;
  if `inst.set` and not in `codex.set` → `recordCodex("set",inst.set)`.
- rune branch (`takeRune`): if `d.rune`/rune type not in `codex.rune` → `recordCodex("rune",type)`.

`recordCodex(cat,id)` (no-op when `!CODEX.enabled`):
1. if already present → return (idempotent, one-way).
2. insert, recompute cached bonus totals, apply to hero, `persist.saveCodex()`, floater
   "¡Nuevo en el Códice! +N vida" (reuse `floater()`), sfx optional (reuse existing loot sfx — no new stream).

## Stat application (permanent, account-wide)

- Derive `codexBonus()` from the ledger counts × `CODEX.bonus`:
  - `dmg = count(uniq) * CODEX.bonus.dmgPerUniq`
  - `hp  = count(set) * CODEX.bonus.hpPerSet + count(rune) * CODEX.bonus.hpPerRune`
- Fold into the existing aggregators in `gear.js`:
  - `equippedDmg(h)` += `h.codexDmg||0`
  - `heroMaxHp(h)` additive term += `h.codexHp||0` (inside the additive group, before mults).
- Set `h.codexDmg/h.codexHp` at: hero load/reconcile (`loadSave`/`reconcileMeta`), respawn,
  and on each new discovery. Guard all with `CODEX.enabled` (0 when off).
- **OFF proof:** with `enabled=false`, `h.codexDmg=h.codexHp=0` and no ledger writes ⇒ combat,
  health, and save bytes identical to HEAD.

## UI panel ($0 art)

- New scene `G.scene="codex"`. Add a HUD button + toggle in `input.js` (mirror the `inv`
  action, glyph `◆`); ESC/toggle returns to `play`.
- `renderCodex()` in `render.js`: reuse the existing `panel()` frame. Three sections
  (Únicos / Conjuntos / Runas). Each entry: reuse existing item icon assets
  (`IMG["icon_slot_"+slot]`) or proc glyph fallback (`gearCol`, Unicode) exactly like the
  inventory grid draws them. Discovered = full color + name; locked = dimmed silhouette + "???".
- Header shows accumulated bonus ("Bono del Códice: +X daño, +Y vida") and progress
  (`discovered/total` per section). No new art, no new fonts.

## Config knob (`sim/config.js`, after NEW_MOBS ~L866)

```js
export const CODEX = {
  enabled: true,
  bonus: { dmgPerUniq: 2, hpPerSet: 15, hpPerRune: 10 },
};
```
Magnitudes tuneable per the ACs. `enabled:false` ⇒ byte-identical to HEAD.

## Acceptance (Build)
1. `mithralda.codex.v1` isolated key; save/load additive; existing `save.v1` untouched.
2. First pickup of a unique/set/rune records exactly one entry (idempotent on repeats).
3. Bonus applies to live dmg/maxHp and persists across reload (reconciled at boot).
4. Codex panel opens from HUD, shows discovered vs locked + accumulated bonus, reuses
   existing icons (0 new assets).
5. `CODEX.enabled=false` ⇒ no ledger writes, 0 stat contribution, no HUD button/panel,
   and sim/srand + `save.v1` serialization **byte-identical to HEAD** (RNG-neutral proof).
6. DOM-free harness covers: idempotent discovery, bonus math, OFF byte-identity, persistence round-trip.

## Chain
Build (GE) → Deploy gh-pages (CTO) → QA live PASS×2 md5 live==HEAD (QA) → Gate CEO (e77e7f98).
Blockers set at creation (blockedBy PATCH → 500). Serialize deploy after any Zone5 (CAS-1744) unblock.
