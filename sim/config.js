// ===========================================================================
// sim/config.js — data-driven simulation constants (no behavior, no DOM).
// World dimensions, tile ids, hero tuning, per-class attacks, enemy templates,
// playable class list. Designers/balance live here, not in code paths.
// ===========================================================================
export const TS = 32;                 // world pixels per tile
export const MAP_W = 110, MAP_H = 110;

// terrain tile ids
export const T_GRASS = 0, T_DIRT = 1, T_STONE = 2, T_COBBLE = 3, T_SAND = 4, T_WATER = 5;

export const CFG = {
  heroSpeed: 152, rollSpeed: 430, rollTime: 0.20, rollIFrame: 0.34, rollCD: 0.62,
  atkRange: 50, atkArc: Math.PI * 0.62, atkCD: 0.42, atkActive: 0.16,
  pickRange: 44, talkRange: 56, fountainRange: 60,
};

// per-class basic attack (key J / 1 / click)
export const ATK = {
  warrior:{type:"melee", range:54, arc:Math.PI*0.66, cd:0.40, dmgMul:1.0,  fx:"slash"},
  druid:  {type:"melee", range:62, arc:Math.PI*1.05, cd:0.46, dmgMul:0.9,  fx:"thorns"},
  priest: {type:"nova",  range:84, cd:0.52, dmgMul:0.8,  heal:8, fx:"holy"},
  paladin:{type:"proj",  cd:0.40, dmgMul:1.05, kind:"arrow", spd:440, fx:"arrow"},
  mage:   {type:"proj",  cd:0.50, dmgMul:1.15, kind:"orb",   spd:300, fx:"orb"},
};

export const ETPL = {
  wolf:    {hp:34, dmg:10, spd:120, aggro:240, range:42, windup:0.45, recover:0.45, xp:12, gold:[2,6], sprite:"wolf", size:18, knock:140, boss:false},
  rat:     {hp:20, dmg:6,  spd:132, aggro:170, range:36, windup:0.35, recover:0.4,  xp:8,  gold:[1,4], sprite:"rat", size:15, knock:110, boss:false},
  skeleton:{hp:52, dmg:14, spd:86,  aggro:230, range:46, windup:0.6,  recover:0.55, xp:20, gold:[4,9], sprite:"skel", size:20, knock:120, boss:false},
  orc:     {hp:84, dmg:22, spd:70,  aggro:220, range:50, windup:0.78, recover:0.7,  xp:32, gold:[8,16],sprite:"orc", size:22, knock:90,  boss:false},
  spearman:{hp:42, dmg:13, spd:74,  aggro:300, range:210, windup:0.7, recover:0.75, xp:26, gold:[6,12],sprite:"skel", size:19, knock:80, boss:false, ranged:true, projspd:300, proj:"spear"},
  mage:    {hp:56, dmg:16, spd:58,  aggro:340, range:250, windup:0.9, recover:0.85, xp:34, gold:[10,18],sprite:"skel", size:21, knock:60, boss:false, ranged:true, projspd:240, proj:"bolt"},
  golem:   {hp:640,dmg:30, spd:46,  aggro:360, range:64, windup:0.95, recover:0.8,  xp:220,gold:[60,90],sprite:"golem",size:36, knock:60, boss:true},
  adv:     {hp:64, dmg:16, spd:96,  aggro:0,   range:44, windup:0.5,  recover:0.5,  xp:0,  gold:[0,0], sprite:"adv", size:18, knock:120, boss:false, neutral:true},
};

export const CLASS_LIST = ["warrior", "paladin", "mage", "druid", "priest"];
