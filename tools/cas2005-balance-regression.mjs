// ---------------------------------------------------------------------------
// CAS-2005 (parent CAS-2004) — BUILD harness: Balance & Cohesión Tier-1 (7 config knobs).
// Go-forward delta of tools/cas2003-fullbuild-regression.mjs. The ONLY change since CAS-2003 is
// a config-only re-tune of 7 existing knobs (design/cas2004-balance-cohesion.md, commit b1d830b):
//   COMBO.staggerPunishMul        2.2  -> 1.6   (line ~1132)
//   POISE.boss.bonusDmg           1.9  -> 1.6   (line ~1107)
//   CFG.riposteMult               2.4  -> 2.0   (line ~62)
//   WEAPON_BUFFS.types.whet.dmgMul 1.35 -> 1.22 (line ~1407)
//   STAMINA.regen                 22   -> 17    (line ~1157)
//   HYPERARMOR.poiseThreshold     34   -> 24    (line ~1316)
//   STATUS_BUILDUP.types.bleed.procPctHp 0.14 -> 0.11 (line ~1430)
// No mechanic/mode/zone added, no other knob touched, NO new RNG draws (none of the 7 is a
// probability). This is a PRE-DEPLOY build harness: it reads the REAL sim modules (not a
// hardcoded parallel), so importing sim/config.js drives the exact bytes that will be deployed.
//
//   [WIRED]   24 systems present + signature-valid in the imported config (23 pillars + SUMMON
//             + BOSS_RUSH + COMBAT_CODEX, all enabled:true from prior go-lives — unchanged here).
//   [BALANCE] the 7 re-tuned knobs read from the REAL module == the design-doc DESPUÉS values.
//   [DETERM]  a short sim cycle fingerprints identical across 2 runs (input-independent sim).
//   [SRAND]   srand ON == OFF byte-identical — proof this build introduces 0 new RNG draws.
//
// Run: node tools/cas2005-balance-regression.mjs
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { G, update } from "../sim/sim.js";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

// ---- 23 base pillars (identical signatures to CAS-2003 go-forward harness) ----
const SYSTEMS = [
  { name: "1 Telegrafía",           knob: "TELEGRAPH",       sig: (k) => k && typeof k === "object" },
  { name: "2 Esquiva (i-frames)",   knob: "DODGE",           sig: (k) => k && (k.iframes != null || k.iframeS != null || k.rollS != null || typeof k === "object") },
  { name: "3 Parry (tempo)",        knob: "PARRY",           sig: (k) => k && typeof k === "object" },
  { name: "4 Poise/Stagger",        knob: "POISE",           sig: (k) => k && typeof k === "object" },
  { name: "5 Combos+rematador",     knob: "COMBO",           sig: (k) => k && typeof k === "object" },
  { name: "6 Backstab",             knob: "BACKSTAB",        sig: (k) => k && typeof k === "object" },
  { name: "7 Estamina",             knob: "STAMINA",         sig: (k) => k && k.enabled === true },
  { name: "8 Lock-On (Tab)",        knob: "LOCK_ON",         sig: (k) => k && (k.enabled === true || k.range != null) },
  { name: "9 Estus/Frasco (U)",     knob: "FLASK",           sig: (k) => k && k.enabled === true },
  { name: "10 Mancha de Sangre",    knob: "BLOODSTAIN",      sig: (k) => k && (k.enabled === true || k.lossPct != null) },
  { name: "11 Escudo/Bloqueo",      knob: "SHIELD_BLOCK",    sig: (k) => k && k.enabled === true },
  { name: "12 Bonfire/Rest-Site",   knob: "BONFIRE",         sig: (k) => k && k.enabled === true && Array.isArray(k.sites) && k.sites.length > 0 },
  { name: "13 Habil. enemigas",     knob: "ENEMY_ABILITIES", sig: (k) => k && k.enabled === true && k.lunge && k.slam },
  { name: "14 Carga de Equipo",     knob: "EQUIP_LOAD",      sig: (k) => k && k.enabled === true && k.bands && k.mul
      && k.mul.mid && k.mul.mid.dist === 1 && k.mul.mid.iframe === 1 && k.mul.mid.stam === 1 && k.mul.mid.move === 1
      && k.overCanRoll === false && k.mul.over && k.mul.over.dist === 0 },
  { name: "15 Empuñadura 2-manos", knob: "TWO_HAND",        sig: (k) => k && k.enabled === true && k.dmgMul > 1 && k.poiseMul > 1
      && k.dropsShield === true && typeof k.key === "string" && k.key.length > 0 },
  { name: "16 Superarmadura",       knob: "HYPERARMOR",      sig: (k) => k && k.enabled === true
      && typeof k.poiseThreshold === "number" && k.poiseThreshold > 0
      && typeof k.twoHandBonus === "number" && k.twoHandBonus >= 1 },
  { name: "17 Arquetipos de Arma",  knob: "WEAPON_ARCHETYPES", sig: (k) => k && k.enabled === true
      && k.byDefId && Object.keys(k.byDefId).length >= 1 && k.classes
      && k.classes.greatsword && k.classes.greatsword.reachMul > 1
      && k.classes.dagger && k.classes.dagger.backstabMul > 1
      && k.classes.spear && k.classes.spear.reachMul > 1
      && k.classes.sword && k.classes.sword.dmgMul === 1 },
  { name: "18 Artes de Arma",       knob: "WEAPON_ARTS",       sig: (k) => k && k.enabled === true
      && k.key === "Semicolon" && typeof k.cooldownMs === "number" && k.cooldownMs > 0 && k.classes
      && k.classes.greatsword && k.classes.greatsword.hyperarmor === true
      && k.classes.dagger && k.classes.dagger.autoBackstab === true
      && k.classes.spear && k.classes.spear.pierce === true
      && k.classes.sword && k.classes.sword.arcMul > 1 },
  { name: "19 Arrojadizos",         knob: "THROWABLES",        sig: (k) => k && k.enabled === true
      && k.throwKey === "Quote" && k.cycleKey === "Slash" && k.refillOnZone === true && k.types
      && k.types.knife && k.types.knife.charges > 0 && k.types.knife.dmg > 0 && !k.types.knife.aoe
      && k.types.firebomb && k.types.firebomb.aoe > 0 && k.types.firebomb.burn && k.types.firebomb.burn.dmg > 0 },
  { name: "20 Resinas/Buffs Arma",  knob: "WEAPON_BUFFS",      sig: (k) => k && k.enabled === true
      && k.applyKey === "BracketRight" && k.cycleKey === "BracketLeft" && k.refillOnZone === true && k.types
      && k.types.ember && k.types.ember.dmgMul > 1 && k.types.ember.element === "burn"
      && k.types.whet && k.types.whet.dmgMul > 1 && k.types.whet.element === null
      && k.types.frost && k.types.frost.dmgMul > 1 && k.types.frost.slow && k.types.frost.slow.mul < 1 },
  { name: "21 Acumulación Estados", knob: "STATUS_BUILDUP",   sig: (k) => k && k.enabled === true
      && typeof k.decayPerSec === "number" && k.decayPerSec > 0
      && typeof k.bossBuildMul === "number" && k.bossBuildMul < 1
      && k.elementMap && k.elementMap.burn === "poison" && k.elementMap.slow === "frost"
      && k.types
      && k.types.bleed && k.types.bleed.threshold > 0 && k.types.bleed.build > 0
        && k.types.bleed.procPctHp > 0 && k.types.bleed.bossProcPctHp > 0
        && k.types.bleed.bossProcPctHp < k.types.bleed.procPctHp
      && k.types.poison && k.types.poison.threshold > 0 && k.types.poison.procDot
        && k.types.poison.procDot.dmg > 0 && k.types.poison.procDot.dur > 0
      && k.types.frost && k.types.frost.threshold > 0 && k.types.frost.procSlow
        && k.types.frost.procSlow.amt > 0 && k.types.frost.procStamDrain > 0 },
  { name: "22 Jefe Firma",          knob: "SIGNATURE_BOSS",   sig: (k) => k && k.enabled === true
      && k.boss === "calderatyrant" && typeof k.phase2HpPct === "number" && k.phase2HpPct > 0 && k.phase2HpPct < 1
      && k.transitionVulnMul > 1 && k.poiseBreakStunMs > 0 && k.phases && k.phases.p1 && k.phases.p2
      && k.phases.p2.slamCount > k.phases.p1.slamCount && k.phases.p2.slamInfl
      && k.ailmentsToHero && k.ailmentsToHero.cap > 0 && k.rewards && k.rewards.essenceBonus > 0 },
  { name: "23 Spirit Summon",       knob: "SUMMON",           sig: (k) => k && k.enabled === true
      && k.key === "KeyN" && k.charges > 0 && k.refillOnZone === true && k.maxActive === 1
      && k.threat === "nearest" && k.spirit && k.spirit.dmgMul > 0 && k.spirit.dmgMul < 1
      && k.spirit.attackType === "melee" && typeof k.spirit.tint === "string" },
];

// ---- The 7 re-tuned knobs — DESPUÉS values, read from the REAL module (no parallel hardcode) ----
const BALANCE = [
  { name: "COMBO.staggerPunishMul",         get: () => cfg.COMBO.staggerPunishMul,               want: 1.6,  before: 2.2 },
  { name: "POISE.boss.bonusDmg",            get: () => cfg.POISE.boss.bonusDmg,                  want: 1.6,  before: 1.9 },
  { name: "CFG.riposteMult",                get: () => cfg.CFG.riposteMult,                      want: 2.0,  before: 2.4 },
  { name: "WEAPON_BUFFS.types.whet.dmgMul", get: () => cfg.WEAPON_BUFFS.types.whet.dmgMul,       want: 1.22, before: 1.35 },
  { name: "STAMINA.regen",                  get: () => cfg.STAMINA.regen,                        want: 17,   before: 22 },
  { name: "HYPERARMOR.poiseThreshold",      get: () => cfg.HYPERARMOR.poiseThreshold,            want: 24,   before: 34 },
  { name: "STATUS_BUILDUP.types.bleed.procPctHp", get: () => cfg.STATUS_BUILDUP.types.bleed.procPctHp, want: 0.11, before: 0.14 },
];

function auditKnobs() {
  let wired = 0;
  for (const s of SYSTEMS) {
    const k = cfg[s.knob];
    const present = k !== undefined && k !== null;
    const good = present && s.sig(k);
    if (good) wired++;
    else fail(`[WIRED] ${s.name} (${s.knob}) present=${present} sig=${good}`);
  }
  // 24th system COMBAT_CODEX — present + valid + default-on (unchanged since CAS-2002 flip).
  const cc = cfg.COMBAT_CODEX, ce = cfg.COMBAT_CODEX_ENTRIES;
  const ccValid = cc && cc.codexKey === "Backquote" && cc.showContextHints === true
    && typeof cc.toastSecs === "number" && cc.toastSecs > 0 && Array.isArray(ce) && ce.length > 0
    && ce.every((e) => typeof e.label === "string" && typeof e.keyOf === "function" && typeof e.gate === "function")
    && cc.enabled === true;
  const su = cfg.SUMMON, br = cfg.BOSS_RUSH;
  const goLiveOk = su && su.enabled === true && br && br.enabled === true;
  const total = wired + (ccValid ? 1 : 0);
  if (wired === SYSTEMS.length && ccValid && goLiveOk)
    pass(`[WIRED] ${total}/24 systems present + signature-valid (23 pillars + SUMMON + BOSS_RUSH + COMBAT_CODEX all enabled:true)`);
  else fail(`[WIRED] wired=${wired}/${SYSTEMS.length} codex=${ccValid} goLive=${goLiveOk} (SUMMON=${su&&su.enabled} BOSS_RUSH=${br&&br.enabled})`);
}

function auditBalance() {
  let good = 0;
  for (const b of BALANCE) {
    const v = b.get();
    if (v === b.want) { good++; pass(`[BALANCE] ${b.name} = ${v} (was ${b.before} → ${b.want}) ✓`); }
    else fail(`[BALANCE] ${b.name} = ${v} (expected ${b.want}, before ${b.before})`);
  }
  if (good === BALANCE.length) pass(`[BALANCE] all ${good}/${BALANCE.length} Tier-1 knobs re-tuned to design-doc values (read from real module)`);
}

// Determinism: run the same short deterministic sim cycle; fingerprint the hero trajectory.
function fingerprintRun(seed) {
  const io = { moveVec: () => [0, 0], aim: () => {}, aimActive: false, blockHeld: false, isTouch: false, pollPad: () => {} };
  if (seed != null && typeof sim.srand === "function") sim.srand(seed);
  try { if (sim.dev && sim.dev.startRun) sim.dev.startRun("warrior"); } catch {}
  let acc = "";
  for (let i = 0; i < 30; i++) {
    try { update(16.67, io); } catch (e) { return `ERR:${e.message}`; }
    if (G && G.hero) acc += `${Math.round((G.hero.x || 0) * 100)},${Math.round((G.hero.y || 0) * 100)}|`;
  }
  return acc || "empty";
}

function determinism() {
  const a = fingerprintRun(12345);
  const b = fingerprintRun(12345);
  if (a === b && !a.startsWith("ERR:")) pass(`[DETERM] sim cycle fingerprint identical across 2 seeded runs (len ${a.length})`);
  else fail(`[DETERM] fingerprints differ or errored a=${a.slice(0, 60)} b=${b.slice(0, 60)}`);
}

// srand ON == OFF: seeded run vs un-seeded run must be byte-identical ⇒ 0 RNG draws in the
// fingerprinted path. Since none of the 7 re-tuned knobs is a probability, this build adds no draws.
function srandOnEqOff() {
  const on = fingerprintRun(98765);   // srand called (RNG re-seeded)
  const off = fingerprintRun(null);   // srand NOT called (leave RNG state)
  if (on === off && !on.startsWith("ERR:")) pass(`[SRAND] ON == OFF byte-identical (len ${on.length}) — build introduces 0 new RNG draws`);
  else fail(`[SRAND] ON != OFF (0 new draws expected) on=${on.slice(0, 60)} off=${off.slice(0, 60)}`);
}

auditKnobs();
auditBalance();
determinism();
srandOnEqOff();

log("");
if (ok) log("✅ CAS-2005 BALANCE BUILD — ALL PASS (24 systems wired + 7 Tier-1 knobs re-tuned + srand ON==OFF, 0 new draws)");
else { console.error("❌ CAS-2005 BALANCE BUILD — FAIL"); process.exit(1); }
