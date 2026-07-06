# CAS-415 — UI icon set (spell bar + inventory slots + HUD consumables)

Pixel-art dark-fantasy icons, **32×32 native PNG, transparent background** — draw with
`imageSmoothingEnabled = false`, never rescale non-integer. Designed to read on the panel
color `#12141b`. Generated with PixelLab (single style pass for consistency), CAS-415.

## Spell icons — `spell_<class>_<i>.png`

Index `i` matches the spell-bar slot: `0` = basic attack (strings.js `spellSlot0`),
`1..3` = `SPELLS[cls][0..2]` in `sim/config.js` (same order as strings.js `spellNames`).

| file | label (ES) | motif / palette (config `col`) |
|---|---|---|
| spell_warrior_0 | CORTE | sword slash arc, steel `#dfe6f0` |
| spell_warrior_1 | GOLPE ESCUDO | shield + impact star, steel |
| spell_warrior_2 | GRITO | crimson war horn `#c8313a` |
| spell_warrior_3 | EMBESTIDA | charging bull, steel dash |
| spell_paladin_0 | FLECHA | golden holy bow `#ffd24d` |
| spell_paladin_1 | CONSAGRAR | gold ground sunburst `#ffe39a` |
| spell_paladin_2 | ESC. DIVINO | gold cross shield `#ffe39a` |
| spell_paladin_3 | JUICIO | warhammer + bolt `#ffd24d` |
| spell_mage_0 | ORBE | violet arcane orb |
| spell_mage_1 | BOLA FUEGO | fireball `#ff7a3a` |
| spell_mage_2 | ESCARCHA | snowflake `#7fd6ff` |
| spell_mage_3 | PARPADEO | teleport vortex `#9be7ff` |
| spell_druid_0 | ESPINAS | thorn cone `#8fd47a` |
| spell_druid_1 | ENREDADERAS | vine tendril `#8fd47a` |
| spell_druid_2 | REGENERAR | healing leaf `#7bd44a` |
| spell_druid_3 | T. ESPINAS | bramble storm `#5fae4a` |
| spell_priest_0 | NOVA | light nova `#fff0b0` |
| spell_priest_1 | SANACIÓN | healing cross `#7fffa8` |
| spell_priest_2 | PAL. PODER | rune ward glyph `#bfeaff` |
| spell_priest_3 | CASTIGO | holy bolt `#fff0b0` |

## Equipment slots — `slot_<name>.png`

`slot_head, slot_body, slot_legs, slot_feet, slot_neck, slot_back, slot_ring,
slot_bag, slot_weapon, slot_shield` — one per Tibia-style equip slot
(strings.js `slotHead..slotBag`). Replaces the text glyphs `^ ≈ ○ ▤`.

## HUD / consumables

`hud_potion_hp.png` (red flask), `hud_potion_mp.png` (blue flask),
`hud_coin.png` (gold coin) — replace the `♥ ◆` text glyphs where an icon fits.

## Meta-progression altar — node icons `altar_*.png`

Same 32×32 native formula, palette locked to the HUD set (steel, gold, crimson,
frost `#7fd6ff`, arcane `#b57bff`, leather). Key → `altar_<key.toLowerCase()>.png`;
GE renders PNG with a glyph fallback (CAS-417/1562).

**v1 (CAS-1558)** — `altar_hpmax` (crimson heart+gold `+`), `altar_dmg` (steel sword),
`altar_movespd` (boot+wind), `altar_reroll` (cyan cycle+bone die), `altar_startgold`
(coin stack), `altar_essence` (arcane shard currency).

**v2 Tier-2 + Ascension (CAS-1566)** — regenerate with `node tools/cas1566-altar-t2-icons.mjs`:

| file | motif / palette |
|---|---|
| altar_t2_boonrare | frost-blue faceted "rare" gem + gold boon sparkle |
| altar_t2_startboon | arcane gift box, crimson ribbon+bow, gold sparkle (boon granted at run start) |
| altar_t2_dashiframe | steel shield + cyan dash streaks + cyan chevron glimmer (invuln dash) |
| altar_t2_zonechest | wooden treasure chest, gold bands + lock |
| altar_t2_reroll | cyan cycle arrows + bone die + gold `+` (extra Tier-2 reroll charge) |
| altar_ascension | radiant gold rising chevrons + crowning star (rank marker) |

`tools/cas1566-montage.png` — v1 (row 1) vs v2 (row 2) at 1× and 5× on `#12141b`.

## Review

`cas415-montage.png` — full set at 1× and 2× on `#12141b`
(regenerate with `node tools/cas415-icons-montage.mjs`).
