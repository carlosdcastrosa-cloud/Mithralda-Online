# CAS-2193 class-hero generation configs (mage / paladin / druid / priest)

CEO roster decision CAS-2195 = **Option A** → roster `warrior/paladin/mage/druid/priest`.
Warrior already delivered (`f1f9eee`). These 4 remain.

## Pipeline per class (zero-drift siblings of the shipped hero)
1. **Re-costume** the shipped **Mithralda Warrior** body (`c19a526a`, 124px 8-dir low-top-down)
   via `create_character_state` → new `character_id` (keeps identity/proportions/scale;
   the FOUNTAINS "same character, different role" mandate).
2. **Animate** the new char: `walk` (template `walking-6-frames`) + `attack` (v3
   `action_description`, class-appropriate) in directions `[south, north, east]` only
   (down/up/side; west/left = mirrored at render). Idle = 0-gen breathing bob from rotation.
3. **Slice**: fill `<class>.json` with the base URL + animation UUIDs, then
   `node tools/cas2193-class-slice.mjs tools/cas2193-cfg/<class>.json`
   → `assets/class/<class>_{idle,walk,attack}_{down,side,up}.png` + `shots/cas2193/<class>_framedata.json`.

## Costume edit_descriptions (create_character_state, seed per class)
- **mage**  (seed 70013): remove shield + plate armor; deep-blue hooded wizard robe, silver trim, crimson sash; tall wooden staff topped with a glowing cyan crystal in place of the sword.
- **paladin** (seed 70014): keep the shield; armor becomes gleaming golden-silver holy plate with a white tabard bearing a sun emblem; blessed longsword.
- **druid** (seed 70015): replace plate with earthy green leather + a leaf-trimmed brown cloak; gnarled wooden staff wrapped in vines; small antler headpiece.
- **priest** (seed 70016): no shield; flowing white-and-gold clerical robes with a hood; ornate golden holy scepter.

## Attack action_descriptions (v3 animate, frame_count 8, dirs south/north/east)
- **mage**: thrusting the staff forward and casting a bolt of arcane energy
- **paladin**: heavy overhead holy sword slash (mirror warrior's swing)
- **druid**: sweeping the vine-staff to summon a burst of nature energy
- **priest**: raising the scepter overhead to channel a holy smite

## Config JSON shape (filled after animate jobs complete — get_character gives UUIDs)
```json
{ "class":"mage",
  "base":"https://backblaze.pixellab.ai/file/pixellab-characters/<projectId>/<charId>/",
  "anim": { "walk":   {"down":["<uuid>",6],"up":["<uuid>",6],"side":["<uuid>",6]},
            "attack": {"down":["<uuid>",8],"up":["<uuid>",8],"side":["<uuid>",8]} } }
```

## ⚠ Shared-account slot cap
PixelLab enforces an 8-concurrent-job cap **shared across the whole account** (city-art
CAS-2186 batches contend). If `create_*`/`animate_*` returns `rate limit exceeded (N/8)`,
back off and retry when the concurrent batch drains — do not fight it.
