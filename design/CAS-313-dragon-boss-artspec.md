# CAS-313 — Dracónic BOSS art spec & integration contract

Art Director sign-off for the board-supplied dragon boss (board CAS-310). The asset
is **complete, on-style, and production-ready** — no re-draw, no background removal.
This doc is the contract the Engineer (1d999a14) wires against and QA (b5c10283) verifies.

## 1. Asset (staged in repo)

Source ZIP `Creature character/` (board attachment on CAS-310). Provenance copy kept at
`assets/pixellab/dragon_boss/` (raw originals + Preview.png + source ZIP).

**Live strips** (sliced-ready, renamed to the FOUNTAINS anim convention
`assets/pixellab/fountains/anim/{key}.png`, same folder/pattern as the golem boss):

| anim state | file (key)                  | frames | strip px   | frame px |
|------------|-----------------------------|:------:|------------|----------|
| idle       | `dragon_idle_strip.png`     | 10     | 1330×133   | 133×133  |
| walk       | `dragon_walk_strip.png`     | 10     | 1330×133   | 133×133  |
| attack1    | `dragon_attack1_strip.png`  | 9      | 1197×133   | 133×133  |
| attack2    | `dragon_attack2_strip.png`  | 17     | 2261×133   | 133×133  |
| hurt       | `dragon_hurt_strip.png`     | 3      | 399×133    | 133×133  |
| death      | `dragon_death_strip.png`    | 7      | 931×133    | 133×133  |

- All frames exactly **133×133**, horizontal strips, RGBA, **real alpha** (86% transparent,
  corner alpha=0) → composites clean on tiles, **no `remove_background` needed**.
- Single orientation = **side view facing RIGHT**. Mirror for left-facing (flip on horizontal
  movement sign, same as hero `side`/`left` and the class strips).

## 2. STYLE FORMULA check — PASS

- **Silhouette:** reads instantly as a low quadrupedal dragon/reptile-beast — dorsal spine
  ridge, long tail, elongated maw. Shape communicates "boss predator" before color.
- **Palette:** muted gray-brown body + crimson maw / white teeth. Sits inside the adopted
  FOUNTAINS dark-fantasy palette (`render/palette.js` COL) — the crimson maw is the lone
  signal-glow accent, consistent with our eyes/flame rule. No new hue family introduced.
- **Proportion / density:** uniform pixel density across all 6 strips, same character in
  every state (no batch drift like the old class-attack mismatch CAS-288). Death collapses
  to a lying pose; hurt is a 3-frame flinch; attack1 = rear→bite→recover, attack2 = longer
  combo bite. Motion has anticipation + settle, loops/holds cleanly.

## 3. Perspective & scale guidance (minimal, non-destructive)

The sprite is a **pure lateral view**; the game is top-down 3/4. Per the board brief this is
**acceptable for a boss that moves horizontally and flips L/R** — do NOT re-draw it.
Minimal grounding adjustments the Engineer should apply (all render-side, zero art edits):

1. **Flip by movement direction** (face the player on the horizontal axis), same flip path
   the golem/hero strips use.
2. **Drop shadow:** draw the existing soft ellipse shadow under the boss (same as other
   mobs/golem) so the lateral sprite reads as grounded in the 3/4 world.
3. **Scale = imposing.** Render bigger than the golem so it reads as a distinct, larger boss.
   Use the `strip.tiles` absolute-height convention (golem = 3.6). **Recommend `tiles: 4.6`**
   (≈147px box → beast body ≈ 4 tiles wide), dwarfing the ~1.5-tile hero. Tune ±0.4 in-engine
   for feel; this is a feel call, flag me if it fights legibility against the boss-arena bg.

## 4. Animation wiring contract (all 6 MUST fire — board hard requirement)

Current `ENEMY_STRIPS`/`resolveStrip` only model **idle/walk/attack**. This boss adds
**attack2, hurt, death** — new states that must be added to the strip resolver AND driven by
the sim boss state machine. Suggested approach (data-driven, matches CAS-233 golem):

- Add a `dragon` block to `render/sprites.js ENEMY_STRIPS` with all 6 strips
  (`fw:133, fh:133, tiles:4.6`, fc per table above).
- Extend `resolveStrip` / `drawEnemyStrip` to honor `hurt` and `death` states (one-shot, not
  looped) and to pick `attack1`/`attack2` (e.g. alternate, or attack2 = the boss's telegraphed
  heavy/combo via the existing `boss{}` windup block). Fallback chain: state → walk → idle.
- **Recommended fps / playback:**
  - idle 10f → ~7 fps, loop
  - walk 10f → ~10 fps, loop (gait; couple cadence to spawn `gaitPhase` per CAS-240, don't
    re-derive from live position)
  - attack1 9f → ~12 fps, one-shot on basic strike (sync the bite contact frame to the
    existing windup→strike hit tick)
  - attack2 17f → ~14 fps, one-shot on the boss's heavy/combo attack
  - hurt 3f → ~12 fps, one-shot on damage taken (don't interrupt death)
  - death 7f → ~8 fps, one-shot, **hold final frame** (collapsed pose) until corpse fade
- Hook hurt→on-damage, death→on-zero-hp, attack1/attack2→combat attack events of the
  mob/boss system. Place the boss in the **Stage-1 boss zone** (new `dragon` base + a `boss{}`
  block pointing `sprite:"dragon"`, same shape as the golem zone bosses in `sim/config.js`).
  Boss name/label is Engineer/board's call (suggest a dracónic name, gold label like
  "GÓLEM ANCESTRAL" currently does).

## 5. Definition of done (for QA b5c10283)

Live on the players' URL (gh-pages / deploy_game), build id flipped:
- All **6** animations visibly play and are each triggered in real gameplay (idle at rest,
  walk on move, attack1 + attack2 in combat, hurt on taking damage, death on kill).
- Boss is enfrentable y muere (full encounter), flips to face the player, has a grounding
  shadow, reads as larger/imposing vs the hero.
- 60fps / 0 console errors. PASS = build live + URL 200.
