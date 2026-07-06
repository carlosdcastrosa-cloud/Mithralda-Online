// ===========================================================================
// render/palette.js — the locked STYLE-FORMULA colour palette (presentation).
// ===========================================================================
// CAS-209 (FOUNTAINS parity, priority A): environment terrain + ambient re-skinned to
// the board-adopted FOUNTAINS dark-fantasy palette (design/palette.fountains.json,
// roles.environment — approval c360188d / CAS-200). Cold, desaturated, gloom-soaked so
// terrain RECEDES into shadow; the live procedural floor (render.js tileBase/L/D) now
// matches the committed tiles_fountains/ tileset instead of the old warm sandstone.
// CAS-215 (FOUNTAINS roster regen, priority C — UI/FX/signal): bring COL{} into exact
// agreement with the single-source-of-truth design/palette.fountains.json (roles.ui +
// roles.signal). CAS-209 reskinned terrain/ambient only and left the warm-wood UI frame
// (panelB #5a4632) + warmer signal hues in place — they contradicted the frozen formula's
// "cold iron-and-stone framing, grimmer than the warm wood UI". UI frame is now cold iron;
// signal glows match the locked palette exactly (slightly less-warm gold, crimson blood,
// cooler heal). Signal hues stay the ONLY saturated glow per the formula.
export const COL = {
  bg:"#06070a", night:"#0a0d12",
  // CAS-423: outdoor ground tones re-lit — the CAS-209 cold-gloom pass crushed grass/dirt/sand
  // to near-black and the board read the whole map as "el mapa se ve negro". Daylight ground
  // (field/forest grass, town dirt paths, arena sand) gets natural mid tones again; dungeon
  // stone/cobble stay dark on purpose (caves/abyss/crypt gloom is zone identity, not a bug).
  grass:"#3e5040", grassL:"#50644c", grassD:"#2b392e", twig:"#4a3a24",
  dirt:"#4a3f30", dirtL:"#5d5040", dirtD:"#332b20",
  stone:"#2b2f38", stoneL:"#3a4150", stoneD:"#1b1f26",
  cobble:"#23303a", cobbleL:"#33424f", cobbleD:"#161e26",
  sand:"#57503e", sandL:"#6b6350", sandD:"#3a352a", bloodSand:"#5a1c20",
  water:"#142329", waterL:"#234048", waterGlint:"#5f8e90",
  out:"#0a0c10",
  hpf:"#b3242a", hpb:"#2e1012", mpf:"#3f6bd0", mpb:"#101a30",
  xpf:"#d0aa44", xpb:"#231d0e",
  gold:"#e0b94a", goldL:"#ffe39a", goldD:"#a87f2e",
  cream:"#d8d3c4", textGold:"#d8b25e", textDim:"#8a8678",
  panel:"#12141b", panelB:"#3a3f49", panelB2:"#22262e",
  flame:"#ef8a2e", flameL:"#ffc24d", heal:"#4fbf6a", rune:"#5a8aff", spark:"#ffffff", blood:"#b3242a",
  skullW:"#d8d3c4", skullY:"#d8b25e", skullR:"#b3242a",
  frag:"#3fd0c0", fragL:"#8fece0",
};
