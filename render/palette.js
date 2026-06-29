// ===========================================================================
// render/palette.js — the locked STYLE-FORMULA colour palette (presentation).
// ===========================================================================
// CAS-209 (FOUNTAINS parity, priority A): environment terrain + ambient re-skinned to
// the board-adopted FOUNTAINS dark-fantasy palette (design/palette.fountains.json,
// roles.environment — approval c360188d / CAS-200). Cold, desaturated, gloom-soaked so
// terrain RECEDES into shadow; the live procedural floor (render.js tileBase/L/D) now
// matches the committed tiles_fountains/ tileset instead of the old warm sandstone.
// Signal (flame/heal/rune/blood/loot) + UI + HP/MP/XP kept saturated per the formula
// (they are the only glow) — this edit is terrain/ambient only.
export const COL = {
  bg:"#06070a", night:"#0a0d12",
  grass:"#26302a", grassL:"#334036", grassD:"#19211c", twig:"#2a2016",
  dirt:"#2c2925", dirtL:"#3a352d", dirtD:"#1c1a16",
  stone:"#2b2f38", stoneL:"#3a4150", stoneD:"#1b1f26",
  cobble:"#23303a", cobbleL:"#33424f", cobbleD:"#161e26",
  sand:"#322f29", sandL:"#423d33", sandD:"#1f1d18", bloodSand:"#3f1216",
  water:"#142329", waterL:"#234048", waterGlint:"#5f8e90",
  out:"#0a0c10",
  hpf:"#c83b3b", hpb:"#3a1416", mpf:"#3f6bd0", mpb:"#14203a",
  xpf:"#e0b94a", xpb:"#2a2410",
  gold:"#f2c14e", goldL:"#ffe39a", goldD:"#b88a2e",
  cream:"#e8e0d0", textGold:"#e8c46a", textDim:"#9a9484",
  panel:"#1a1e26", panelB:"#5a4632", panelB2:"#3a2c1e",
  flame:"#ff8a2a", flameL:"#ffd24d", heal:"#5fd66a", rune:"#5a8aff", spark:"#ffffff", blood:"#8a1f1f",
  skullW:"#e8e0d0", skullY:"#e8c44a", skullR:"#d23b3b",
  frag:"#3fd0c0", fragL:"#8fece0",
};
