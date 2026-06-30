# CAS-301 — 8-Direction Omnidirectional Hero Animations — Art + Engine Contract

**Owner:** Art Director. Parent CAS-300 (board). Scope: mage, paladin, priest, druid.

## Hard constraint (board): SAME SPRITE
Do NOT redesign/restyle/re-identity any class. The new facings must be the **exact live
character** — same colours, silhouette, proportions, gear — only turned to face new
directions. Identity is guaranteed by feeding each class's **existing live idle frame**
(`assets/erw/hero/classes/<cls>.png` frame 0) into PixelLab as the `reference_image`.

### ⚠ Provenance finding (why we do NOT reuse the existing PixelLab characters)
PixelLab still holds 4 characters named "Transform into a MAG/DRU/PAL/PRI" (group
`61cf6540`, native 8-dir). These are the **CAS-292 set, which was CANCELLED / superseded
by CAS-291**. They are a *different* look from what is live (e.g. PixelLab mage = BLUE
pointed-hat witch; LIVE mage = PURPLE hooded staff-wielder). Exporting their facings would
ship the wrong character and **violate the same-sprite rule**. We therefore generate fresh
facings from the LIVE frames as reference.

## STYLE FORMULA (frozen — every new facing must pass)
- **Cell / geometry:** `CLASS_FW=140 × CLASS_FH=166`, anchor `CLASS_AX=65`, foot baseline
  `CLASS_FOOT=163`, on-screen `CLASS_ANIM_SCALE=0.30` (~50px tall in world). Identical to
  the live single-facing strips — new strips drop into the same render path.
- **Palette:** per-class family is LOCKED to the live sprite (mage purple+gold,
  paladin holy-gold steel, priest cream/gold, druid forest-green). No new hues. Outline =
  single-colour dark; shading ramp preserved (PixelLab medium shading).
- **Silhouette signatures (must survive rotation):** mage = pointed posture + tall staff;
  paladin = armoured + cross; priest = robe + halo; druid = antler/leaf accent.
- **View:** `low top-down` (~20° 3/4 RPG) to match the world camera + all other sprites.
- **Cadence (CAS-219/240):** walk footfall must land in the **0.4–0.6 s** band. A 6-frame
  PixelLab walk = 2 footfalls/cycle → engine fps tuned so one full cycle ≈ 0.8–1.2 s.

## Direction model (engine wiring — Game Engineer)
Top-down, screen space (`+x` = east, `+y` = south because y grows downward).
8 buckets from the movement/facing vector:

```
bucket = ((Math.round(Math.atan2(dy, dx) / (Math.PI/4)) % 8) + 8) % 8
// 0=E  1=SE  2=S  3=SW  4=W  5=NW  6=N  7=NE   (screen-space, y-down)
```

**Strips are baked with rows in THIS bucket order (row index == bucket).** No horizontal
flip needed (all 8 facings are real art). The renderer selects the row by `bucket`, then
the frame within the row by the existing walk/idle timing.

## Asset deliverables (per class, in `assets/erw/hero/classes/`) — DELIVERED
- `<cls>_walk8.png` — **8 rows × 7 frames**, each cell `140×166`. Sheet = `980 × 1328`.
  Row = direction bucket (above). Frames 0..6 = one walk cycle, looped. (`CLASS_WALK8_FC=7`.)
- `<cls>_idle8.png` — **8 rows × 1 frame**, each cell `140×166`. Sheet = `140 × 1328`.
  Row = direction bucket. Single held idle pose; engine adds the existing procedural
  breathe/bob (drawHero idle path), exactly like today's single-facing idle.

Files (all 4 classes mage/paladin/priest/druid):
`assets/erw/hero/classes/{mage,paladin,priest,druid}_idle8.png` (140×1328)
`assets/erw/hero/classes/{mage,paladin,priest,druid}_walk8.png` (980×1328)

Frame-count note: PixelLab v3 stored 7 frames/direction (ref + 6). Cadence: drive the
loop at ~7–9 fps so one cycle ≈ 0.8–1.0 s (footfall in the CAS-219/240 0.4–0.6 s band).
The engine should read frame width as `naturalWidth/7` (same pattern as the WIDE
attack/death strips) rather than hard-coding 140, for safety.

Existing single-facing strips (`<cls>.png`, `<cls>_walk.png`, `<cls>_attack.png`,
`<cls>_death.png`) are **left byte-untouched** — they remain the fallback + the source of
attack/death (attack/death stay south-facing this pass; omnidirectional attack/death is
out of scope per ticket "idle + walk cycle" and can be a follow-up).

## Engine wiring summary (Game Engineer child)
1. Add `dir8FromAngle(dy,dx)` → bucket (formula above).
2. In `drawHeroClass` walk/idle branches: if `<cls>_walk8`/`<cls>_idle8` loaded, pick
   `srcY = bucket*166`, `srcX = frame*140`, draw the cell (no flip). Else fall back to the
   current single-facing strip + flip (zero regression for unmigrated classes/warrior).
3. Frame counts: idle8 = 1, walk8 = 6 (`CLASS_WALK8_FC=6`), walk fps per cadence above.
4. Soak-safe / zero balance change — presentation only.

## Pipeline (this ticket, $0 PixelLab subscription)
1. Crop live idle frame 0 per class → reference (`tools/cas301-crop.mjs`).
2. `create_8_direction_object(reference_image=…)` → 8 rotations of the exact sprite.
3. `animate_object(walking)` for all 8 directions → walk frames.
4. Slice rotations+walk into `<cls>_idle8.png` / `<cls>_walk8.png` at 140×166 cell, rows
   in bucket order (`tools/cas301-slice.mjs`).
5. Hand off → Game Engineer (wiring) → QA (live 8-dir verification).
