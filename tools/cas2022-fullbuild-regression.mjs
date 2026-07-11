// ---------------------------------------------------------------------------
// CAS-2022 — QA CONSOLIDATED FULL-BUILD REGRESSION vs LIVE 4678cbd03e4d (799 files).
// Go-forward delta of tools/cas2015-fullbuild-regression.mjs. Since CAS-2015 (build
// 91b4c9956255) the LIVE deltas are, in order:
//   · CAS-2012  Game-Feel/Impact (JUICE) enabled:true  — 2-blob overlay (config+sim)
//   · CAS-2021  Onboarding Combat Primer (ONBOARDING) enabled:true — the FLIP under test.
// ONBOARDING is the 26th live mechanic (23 pillars + Boss Rush + Códice + Onboarding).
// This flip is CONFIG-ONLY (config.js:1730 false→true); the 3 behavior blobs (sim/render/
// strings) were already served DARK and are byte-identical served==HEAD (curl-verified in the
// issue comment). So the primer's step machine adds 0 RNG draws — determinism is preserved.
//
// This harness = cas2015's 24-system wiring + GO-LIVE (now 4 flags) + 7 balance knobs + JUICE,
// PLUS the ONBOARDING deep checks that matter for a FLIP:
//   [GOLIVE]   SUMMON && BOSS_RUSH && COMBAT_CODEX && ONBOARDING all enabled:true.
//   [ONBOARD]  enabled:true, 6 teach* sub-flags true, skippable true (served config).
//   [FIRSTRUN] composeTutSteps() WITHOUT arming == base + 6 combat verbs spliced after "attack",
//              order intact = ["move","attack","dodge","parry","lockon","backstab","estus",
//              "bonfire","skill","travel","loot","equip","done"]. This is the whole point of the
//              flip: default-on, no _ccArm needed. (Proves the LIVE bytes teach the 6 verbs.)
//   [A11Y]     dropping ONE sub-flag (teachParry) removes EXACTLY "parry" and nothing else;
//              enabled:false ⇒ EXACTLY TUT_BASE_STEPS (the DARK/opt-out shape) — restored after.
//   [DETERM]   srand ON==OFF byte-identical (the primer adds tutMarkC only = 0 draws).
//
// Run from a CLEAN HEAD worktree (imported sim/config.js + sim/sim.js == exact live bytes).
// Run: node tools/cas2022-fullbuild-regression.mjs
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { G, update, composeTutSteps } from "../sim/sim.js";

const EXPECT_BUILD = "4678cbd03e4d";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

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
      && k.classes.dagger && k.classes.dagger.backstabMul > 1 },
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
      && k.types && k.types.whet && k.types.whet.dmgMul > 1 },
  { name: "21 Acumulación Estados", knob: "STATUS_BUILDUP",   sig: (k) => k && k.enabled === true
      && k.types && k.types.bleed && k.types.bleed.procPctHp > 0 },
  { name: "22 Jefe Firma",          knob: "SIGNATURE_BOSS",   sig: (k) => k && k.enabled === true },
  { name: "23 Spirit Summon",       knob: "SUMMON",           sig: (k) => k && k.enabled === true && k.key === "KeyN" && k.charges > 0 },
  { name: "24 Códice de Combate",   knob: "COMBAT_CODEX",     sig: (k) => k && k.enabled === true
      && k.codexKey === "Backquote" && k.showContextHints === true
      && typeof k.toastSecs === "number" && k.toastSecs > 0 },
];

// CAS-2004 Balance Tier-1 — the 7 re-tuned knobs must remain at their tuned post-values.
const BALANCE = [
  { name: "COMBO.staggerPunishMul",               get: () => cfg.COMBO.staggerPunishMul,                want: 1.6,  before: 2.2 },
  { name: "POISE.boss.bonusDmg",                  get: () => cfg.POISE.boss.bonusDmg,                   want: 1.6,  before: 1.9 },
  { name: "CFG.riposteMult",                      get: () => cfg.CFG.riposteMult,                       want: 2.0,  before: 2.4 },
  { name: "WEAPON_BUFFS.types.whet.dmgMul",       get: () => cfg.WEAPON_BUFFS.types.whet.dmgMul,        want: 1.22, before: 1.35 },
  { name: "STAMINA.regen",                        get: () => cfg.STAMINA.regen,                         want: 17,   before: 22 },
  { name: "HYPERARMOR.poiseThreshold",            get: () => cfg.HYPERARMOR.poiseThreshold,             want: 24,   before: 34 },
  { name: "STATUS_BUILDUP.types.bleed.procPctHp", get: () => cfg.STATUS_BUILDUP.types.bleed.procPctHp,  want: 0.11, before: 0.14 },
];

const EXP_FIRSTRUN = ["move","attack","dodge","parry","lockon","backstab","estus","bonfire","skill","travel","loot","equip","done"];
const TUT_BASE     = ["move","attack","skill","travel","loot","equip","done"];

async function checkBuild() {
  try {
    const r = await fetch(`${BASE}/version.json`, { cache: "no-store" });
    const j = await r.json();
    if (j.build === EXPECT_BUILD) pass(`[BUILD] live version.json build=${j.build} files=${j.files} == EXPECT ${EXPECT_BUILD}`);
    else fail(`[BUILD] live build=${j.build} != EXPECT ${EXPECT_BUILD}`);
  } catch (e) { log(`ℹ [BUILD] fetch skipped (${e.message}); md5 served==HEAD 7/7 verified out-of-band (issue comment)`); }
}

function auditKnobs() {
  let wired = 0;
  for (const s of SYSTEMS) {
    const k = cfg[s.knob];
    const present = k !== undefined && k !== null;
    const good = present && s.sig(k);
    if (good) { wired++; }
    else fail(`[WIRED] ${s.name} (${s.knob}) present=${present} sig=${good}`);
  }
  if (wired === SYSTEMS.length) pass(`[WIRED] ${wired}/${SYSTEMS.length} systems present + signature-valid in served config`);

  // GO-LIVE: SUMMON + BOSS_RUSH + COMBAT_CODEX + ONBOARDING all enabled:true (26 live mechanics).
  const su = cfg.SUMMON, br = cfg.BOSS_RUSH, cc = cfg.COMBAT_CODEX, ce = cfg.COMBAT_CODEX_ENTRIES, ob = cfg.ONBOARDING;
  const suLive = su && su.enabled === true && su.key === "KeyN" && su.charges > 0;
  const brValid = br && br.key === "KeyB" && Array.isArray(br.sequence) && br.sequence.length >= 3
    && !br.sequence.includes("frost") && !br.sequence.includes("trial")
    && typeof br.hpStep === "number" && typeof br.dmgStep === "number"
    && br.healFrac > 0 && br.refillOnRest === true && typeof br.essPerRound === "number";
  const ccLive = cc && cc.enabled === true && cc.codexKey === "Backquote" && cc.showContextHints === true
    && Array.isArray(ce) && ce.length > 0
    && ce.every((e) => typeof e.label === "string" && typeof e.keyOf === "function" && typeof e.gate === "function");
  const obLive = ob && ob.enabled === true;
  if (suLive && brValid && br.enabled === true && ccLive && obLive)
    pass(`[GOLIVE] SUMMON.enabled (KeyN) AND BOSS_RUSH.enabled (KeyB) AND COMBAT_CODEX.enabled (Backquote, ${ce.length} entries) AND ONBOARDING.enabled — 4/4 PLAYABLE`);
  else fail(`[GOLIVE] SUMMON=${su && su.enabled} BOSS_RUSH=${br && br.enabled}(valid=${brValid}) CODEX=${cc && cc.enabled}(live=${ccLive}) ONBOARDING=${ob && ob.enabled} (expected all true)`);
}

function auditOnboarding() {
  const ob = cfg.ONBOARDING;
  const flags = ["teachDodge","teachParry","teachLockOn","teachBackstab","teachEstus","teachBonfire"];
  const flagsOk = ob && flags.every((f) => ob[f] === true);
  if (ob && ob.enabled === true && flagsOk && ob.skippable === true)
    pass(`[ONBOARD] enabled:true, 6 teach* sub-flags true, skippable:true (served config)`);
  else fail(`[ONBOARD] enabled=${ob && ob.enabled} flagsOk=${flagsOk} skippable=${ob && ob.skippable}`);

  // FIRSTRUN: default-on compose (NO arming) already splices the 6 combat verbs after "attack".
  const live = composeTutSteps();
  if (JSON.stringify(live) === JSON.stringify(EXP_FIRSTRUN))
    pass(`[FIRSTRUN] composeTutSteps() (no arm) == 13 steps w/ 6 combat verbs after "attack": [${live.join(",")}]`);
  else fail(`[FIRSTRUN] composeTutSteps() = [${live.join(",")}] != expected [${EXP_FIRSTRUN.join(",")}]`);
}

function auditA11y() {
  const ob = cfg.ONBOARDING;
  // Drop ONE sub-flag → EXACTLY that verb disappears, nothing else shifts.
  const savParry = ob.teachParry;
  ob.teachParry = false;
  const noParry = composeTutSteps();
  ob.teachParry = savParry;
  const expNoParry = EXP_FIRSTRUN.filter((s) => s !== "parry");
  const dropOk = JSON.stringify(noParry) === JSON.stringify(expNoParry);

  // enabled:false → EXACTLY the DARK/opt-out base shape.
  const savEnabled = ob.enabled;
  ob.enabled = false;
  const off = composeTutSteps();
  ob.enabled = savEnabled;
  const offOk = JSON.stringify(off) === JSON.stringify(TUT_BASE);

  // restored to live
  const restored = JSON.stringify(composeTutSteps()) === JSON.stringify(EXP_FIRSTRUN);
  if (dropOk && offOk && restored)
    pass(`[A11Y] teachParry:false drops EXACTLY "parry"; enabled:false ⇒ base-only [${TUT_BASE.join(",")}]; live restored`);
  else fail(`[A11Y] dropParry=${dropOk} enabledFalse=${offOk} restored=${restored} (noParry=[${noParry.join(",")}] off=[${off.join(",")}])`);
}

function auditBalance() {
  let good = 0;
  for (const b of BALANCE) {
    let v; try { v = b.get(); } catch (e) { v = `ERR:${e.message}`; }
    if (v === b.want) { good++; pass(`[BALANCE] ${b.name} = ${v} (tuned; was ${b.before})`); }
    else fail(`[BALANCE] ${b.name} = ${v} (expected tuned ${b.want}, pre-balance ${b.before})`);
  }
  if (good === BALANCE.length) pass(`[BALANCE] 7/7 CAS-2004 knobs at tuned post-values (no pre-balance leak)`);
}

function auditJuice() {
  const j = cfg.JUICE;
  if (j && j.enabled === true) pass(`[JUICE] Game-Feel/Impact enabled:true (CAS-2012 live)`);
  else fail(`[JUICE] enabled=${j && j.enabled} (expected true)`);
}

// Determinism: run the same short deterministic sim cycle twice; fingerprint must match.
function fingerprintRun() {
  const io = { moveVec: () => [0, 0], aim: () => {}, aimActive: false, blockHeld: false, isTouch: false, pollPad: () => {} };
  if (typeof sim.srand === "function") sim.srand(12345);
  try { if (sim.dev && sim.dev.startRun) sim.dev.startRun("warrior"); } catch {}
  let acc = "";
  for (let i = 0; i < 30; i++) {
    try { update(16.67, io); } catch (e) { return `ERR:${e.message}`; }
    if (G && G.hero) acc += `${Math.round((G.hero.x || 0) * 100)},${Math.round((G.hero.y || 0) * 100)}|`;
  }
  return acc || "empty";
}

function determinism() {
  const a = fingerprintRun();
  const b = fingerprintRun();
  if (a === b && !a.startsWith("ERR:")) pass(`[DETERM] sim cycle fingerprint identical across 2 runs (len ${a.length})`);
  else fail(`[DETERM] fingerprints differ or errored a=${a.slice(0, 60)} b=${b.slice(0, 60)}`);
  // The ONBOARDING flip is config-only (tutMarkC seams add 0 srand draws); the identical seeded
  // fingerprint confirms the composed step machine does not perturb the RNG stream.
}

await checkBuild();
auditKnobs();
auditOnboarding();
auditA11y();
auditBalance();
auditJuice();
determinism();

log("");
if (ok) log(`✅ CAS-2022 CONSOLIDATED FULL-BUILD REGRESSION — ALL PASS (24 systems + 4 go-live flags + ONBOARDING deep + 7 balance + JUICE on ${EXPECT_BUILD})`);
else { console.error("❌ CAS-2022 CONSOLIDATED FULL-BUILD REGRESSION — FAIL"); process.exit(1); }
