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

## Review

`cas415-montage.png` — full set at 1× and 2× on `#12141b`
(regenerate with `node tools/cas415-icons-montage.mjs`).
