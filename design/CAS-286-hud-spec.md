# CAS-286 — HUD Redesign Spec (Mithralda)
### "Tibia-like, but better designed" — dark-fantasy pixel-art HUD

**Parent:** CAS-285 "Mejora la UI del juego" · **Owner:** Art Director · **Status:** spec for CEO approval → CTO implements in sibling issue.

This document is the **source of truth** for the HUD redesign. The implementation issue (sibling, depends on this) must conform to the layout map, palette, typography, states, and asset manifest below. Nothing here changes game balance; the HUD is a presentation layer.

---

## 0. Constraints (non-negotiable)

| Constraint | Rule |
|---|---|
| **Render approach** | HTML/CSS overlay over the canvas (same pattern as `overlay.js`). The HUD must **not** be baked into `render/render.js` per-frame canvas draws. Canvas keeps the world; DOM owns the chrome. |
| **Balance** | ZERO balance change. Read-only mirror of `G` state. No new gameplay values. |
| **Soak-safe** | No new persisted keys beyond reusing CAS-265 `mithralda.settings.v1`. No autosave triggers. Live URL must keep returning 200. |
| **Accessibility** | Respect existing CAS-265 toggles: `G.settings.colorblind` (shape-cues) and `G.settings.reduceMotion`. Honor `prefers-reduced-motion`. |
| **Responsive** | Scales from 360px (mobile portrait) to desktop. Touch-friendly hit targets ≥ 44px. |
| **Asset cost** | UI art via PixelLab `create_ui_asset` on active subscription = **$0**. |

---

## 1. Design intent — why "better than Tibia"

Tibia's HUD is information-dense but **cluttered, warm-brown, and cramped** (tiny slots, hard-edged panels jammed edge-to-edge, low contrast text). We keep its proven **spatial grammar** (vitals top-left, equipment+bag right rail, action bar + log bottom) but fix its failures:

1. **Less saturation, more hierarchy.** One cold palette (forged iron + near-black), gold reserved for emphasis only. Saturated color is a *signal* (HP red, MP blue, hazards), never decoration.
2. **Breathing room.** Consistent 8px spacing grid, panels float with a 1px gold hairline + 2px shadow gap instead of butting together.
3. **Legible type.** Numeric vitals get a tabular, high-contrast cream-on-dark readout — not Tibia's cramped 8px bitmap.
4. **Responsive + touch.** Right rail collapses to a drawer on mobile; action bar becomes a swipeable strip.
5. **Accessible.** Shape-cues on rarities/states, reduce-motion kills the bar shimmer and portrait idle.

---

## 2. Layout map

ASCII reference (desktop, 16:9). Coordinates are anchors, not pixels — see §3 for responsive rules.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ╔═══════════════════╗                                  ╔════════════╗ │
│ ║ ◉  Clarice  Lv.14 ║   ← VITALS (top-left)            ║  MINIMAP   ║ │
│ ║ ▮▮▮▮▮▮▮░░ 148/210 ║                                  ║   ▣ ▣      ║ │
│ ║ ▮▮▮▮▮▮▮▮░  64/ 80 ║                                  ║      ◆     ║ │
│ ║ XP ▮▮▮▮▮░░░░░  62% ║                                  ╚════════════╝ │
│ ╚═══════════════════╝                                  ╔════════════╗ │
│  [status chips: ☠ ◦ ◆]                                 ║ PAPER-DOLL ║ │
│                                                        ║ ⛊  ◉  ⛨    ║ │
│                                                        ║ 🜍  □  🜎    ║ │
│              (game world / canvas)                     ║ ⚔  □  ◈    ║ │
│                                                        ╠════════════╣ │
│                                                        ║ BACKPACK   ║ │
│                                                        ║ □□□□ □□□□   ║ │
│                                                        ║ □□□□ □□□□   ║ │
│                                                        ╚════════════╝ │
│ ╔══════════════════════════════════╗  ╔═════════════════════════════╗ │
│ ║ COMBAT LOG / CHAT                 ║  ║ [1][2][3][4][5][6][7][8][9][0]║ │
│ ║ · Golpeas al orco por 24         ║  ║   ACTION / HOTKEY BAR        ║ │
│ ║ · Subes a nivel 14               ║  ╚═════════════════════════════╝ │
│ ╚══════════════════════════════════╝                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Panels & anchors

| # | Panel | Anchor | Contents | Source state |
|---|---|---|---|---|
| **A** | **Vitals** | top-left, 12px inset | Round portrait (animated class idle) · name · level · **HP bar+numeric** · **MP bar+numeric** · **XP bar+%** | `G.hero` (hp/mp/xp/lvl/cls/name) |
| **B** | **Status chips** | under Vitals | DoT / slow / stun / buff chips w/ duration + shape-cue | existing status array |
| **C** | **Minimap** | top-right, 12px inset | 120–160px framed minimap, player dot, zone tint | `renderMiniMap()` data |
| **D** | **Paper-doll** | right rail, under minimap | 9 equip slots around class figure (reuse CAS-226 `renderInventory` equip model) | `G.hero.equip` |
| **E** | **Backpack** | right rail, under paper-doll | scrollable item grid (reuse existing backpack list) | `G.hero.bag` |
| **F** | **Action bar** | bottom-center/right | hotkey slots 1–0 (spells + consumables, reuse `renderSpellBar` + consumable slot) | `G.hero.spells`, consumables |
| **G** | **Combat log / chat** | bottom-left | rolling 3–5 line log of combat/level/loot events | new read-only event feed (presentation only) |
| **H** | **Objective banner** | top-center | existing Stage-1 objective text (kept, restyled) | existing |

> D, E, F reuse the already-shipped Tibia inventory/equip/spell models (CAS-226 / b16a74ae / 7365d767). The redesign **reframes** them in the new panel chrome and moves them into the persistent right rail + bottom bar; it does not re-implement their data logic.

---

## 3. Responsive behavior

| Breakpoint | Layout |
|---|---|
| **≥ 1024px (desktop)** | Full layout as mapped. Right rail persistent (minimap → paper-doll → backpack stacked). Action bar bottom-right, log bottom-left. |
| **640–1023px (tablet)** | Right rail narrows; backpack collapses to a toggle (bag button). Minimap shrinks to 120px. Log → 3 lines. |
| **< 640px (mobile portrait)** | Vitals compact (portrait + bars only, numerics on tap). Right rail becomes a **slide-in drawer** (bag/equip button top-right). Action bar = swipeable strip of ≥44px slots pinned bottom. Minimap → small corner badge, tap to expand. Log auto-hides, surfaces on event for 3s. |

Scaling uses a single root `--hud-scale` CSS var driven by viewport width so pixel art stays crisp (`image-rendering: pixelated`, integer-ish scale steps).

---

## 4. Palette (locked to FOUNTAINS `render/palette.js` COL)

The HUD introduces **no new colors**. It draws from the existing frozen palette so chrome matches the world.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#06070a` | deepest panel interior / scrim |
| `panel` | `#12141b` | panel fill |
| `panelB` | `#3a3f49` | panel border (light bevel) |
| `panelB2` | `#22262e` | panel border (dark bevel / recess) |
| `textGold` | `#d8b25e` | emphasis: names, level, trim hairline |
| `goldL` / `goldD` | `#ffe39a` / `#a87f2e` | bevel highlight / shadow on gold trim |
| `cream` | `#d8d3c4` | body text, numerics |
| `textDim` | `#8a8678` | secondary text, slot labels |
| `hpf` / `hpb` | `#b3242a` / `#2e1012` | HP fill / groove |
| `mpf` / `mpb` | `#3f6bd0` / `#101a30` | MP fill / groove |
| `xpf` / `xpb` | `#d0aa44` / `#231d0e` | XP fill / groove |
| `gold` | `#e0b94a` | gold count |
| signal (FX only) | `flame #ef8a2e · heal #4fbf6a · rune #5a8aff · poison #8be04a · burn #ff8a3a · slow #7fd0ff · stun #ffe066` | status chips & alerts ONLY |

**Rule:** chrome is iron + gold. Saturation is reserved for vitals fills and status signals. No panel may introduce a hue outside this table.

---

## 5. Typography

- **Family:** `'Courier New', monospace` (the game's existing face — keeps pixel/terminal identity, zero new font load).
- **Scale (at 1× HUD scale):**
  - Numeric vitals (HP/MP values): **14px**, cream `#d8d3c4`, tabular, 1px dark text-shadow `#06070a` for contrast over bars.
  - Name + Level: **13px** gold `#d8b25e`, slight letter-spacing.
  - Slot labels / secondary: **11px** dim `#8a8678`.
  - Log lines: **12px** cream, dim for old lines (fade older entries to `#8a8678`).
- **Alignment:** vitals numerics right-aligned in their groove; labels left. Tabular numerals so values don't jitter.
- **Rendering:** `image-rendering: pixelated` on art layers; text crisp (no AA hint needed at these sizes).

---

## 6. Interaction states

Every interactive element (slots, buttons, hotkeys, bag/equip toggles) defines four states. Art ships a base panel; states are CSS overlays so they're free and theme-consistent.

| State | Treatment |
|---|---|
| **normal** | base iron face, 1px `#3a3f49` border, interior `#12141b`. |
| **hover** | +1px gold hairline `#d8b25e` (60% alpha), interior lightens to `#1a1d26`, cursor pointer. (Suppressed on touch.) |
| **active / pressed / equipped** | inset shadow (recessed), gold border `#e0b94a`, subtle inner glow. Equipped slot shows item glyph + rarity cue. |
| **disabled / on-cooldown** | desaturate to `#22262e`, 50% opacity, cooldown wipe (radial) for hotkeys; no hover response. |

**Bars:** fill animates with a 120ms ease on value change; a 1px specular highlight line runs along the top of the fill. Under `reduceMotion`/`prefers-reduced-motion` the shimmer and fill-tween are disabled (instant set), and the portrait idle freezes at frame 0.

**Accessibility cues (CAS-265):**
- `colorblind=true` → rarity shape-cues prepended (`◦` uncommon, `◆` rare, `★` epic) on slots & bag rows; status chips carry a shape glyph (`☠` poison, `❄` slow, `✦` buff) in addition to color.
- Focus ring (keyboard nav) = 2px gold dashed outline on the active slot/button.
- All hit targets ≥ 44×44 CSS px on touch.

---

## 7. Asset manifest (PixelLab `create_ui_asset`, $0 subscription)

Generated this issue, seed `286`, FOUNTAINS palette hint. 9-slice / stretch where noted so panels scale without distorting the iron trim. Saved under `assets/pixellab/ui/cas286/`.

| Asset | File | Size | Role | 9-slice |
|---|---|---|---|---|
| Stat frame | `hud_statframe.png` | 688×256 | Panel A chrome (portrait socket + bar grooves) | yes (horizontal) |
| Minimap frame | `hud_minimap_frame.png` | 256×256 | Panel C frame | corners fixed |
| Paper-doll | `hud_paperdoll.png` | 288×512 | Panel D equipment chrome | vertical stretch |
| Backpack grid | `hud_backpack_grid.png` | 320×320 | Panel E slot grid | tile interior |
| Action bar | `hud_actionbar.png` | 688×192 | Panel F hotkey rail | horizontal stretch |
| Console | `hud_console.png` | 512×256 | Panel G log/chat frame | 9-slice |
| Button | `hud_button.png` | 320×192 | shared button base (Forja/Opciones/etc.) | 9-slice |

Iconography (slot glyphs, status, hotkey numbers) stays as the existing Unicode + canvas glyph system already in `render.js` to avoid a second source of truth; the panels are the *housing*, glyphs are tinted per state in CSS. If the CEO wants bespoke pixel icons per slot, that's a follow-up batch.

---

## 8. Implementation handoff notes (for CTO sibling issue)

1. New root module `hud.js` (mirror `overlay.js` structure: own boot, no balance writes) injecting a `#hud` DOM layer above `#c`. Register in `index.html` MODS + build-id ROOT_FILES (3 places, per CAS-265/279 gotcha).
2. Panels are absolutely-positioned divs using the PixelLab PNGs as `border-image` (9-slice) so they scale crisply.
3. Bars = nested divs (groove + fill), width bound to `hp/hpMax` etc. Numerics read straight from `G.hero` each rAF (read-only).
4. Reuse existing equip/bag/spell **data + click handlers** from `render.js` (CAS-226) — move the *presentation* to DOM, keep the *logic*.
5. Honor `G.settings.colorblind` / `reduceMotion`; add no new settings keys.
6. Verify: live URL 200, 60fps unchanged (DOM HUD is cheap vs per-frame canvas redraw), no save-version bump, accessibility toggles still apply.

---

## 9. Acceptance criteria (for CEO sign-off)

- [ ] Layout matches §2 map; right rail + bottom bar present, vitals top-left, minimap top-right.
- [ ] Reads cleaner & less saturated than Tibia; gold used only for emphasis (§1).
- [ ] All chrome colors ∈ §4 palette table (no new hues).
- [ ] Numeric HP/MP legible at mobile scale; tabular.
- [ ] 4 interaction states defined & visually distinct (§6).
- [ ] Responsive across 360px→desktop; touch targets ≥44px.
- [ ] CAS-265 accessibility toggles respected.
- [ ] 7 UI assets generated, on-style, attached to issue.

---

*Reference mockup image: `design/CAS-286-hud-mockup.png` (attached to issue). UI asset PNGs attached individually.*
