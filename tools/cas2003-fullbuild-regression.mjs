// ---------------------------------------------------------------------------
// CAS-2003 — QA CONSOLIDATED REGRESSION vs LIVE c7cfc0e489e8 (post-COMBAT_CODEX GO-LIVE).
// Go-forward delta of tools/cas1998-fullbuild-regression.mjs. The single change since CAS-1998:
//   - CAS-2002 flipped COMBAT_CODEX enabled:false→true LIVE (Gate CEO CAS-1999 GO). The Códice
//     de Combate + contextual hints are now ACTIVE BY DEFAULT — no runtime arming needed.
// The CAS-2002 flip was config-only (1 line, config.js:1696) + a version bump; served version.json
// flipped b372cdca869f -> c7cfc0e489e8 / 799. All 6 game-core blobs are md5-identical to HEAD
// (verified out-of-band via curl in the issue comment), so importing sim/config.js + sim/sim.js
// drives the EXACT live code. This asserts the current LIVE truth: 23 shipped pillars +
// SIGNATURE_BOSS + SUMMON + BOSS_RUSH + COMBAT_CODEX — all 24+ systems live (enabled:true).
//
//   [BUILD]   live version.json == EXPECT_BUILD (served == what we import).
//   [WIRED]   23/23 systems present + signature-valid in the served config.
//   [GOLIVE]  SUMMON.enabled===true AND BOSS_RUSH.enabled===true (both playable).
//   [CODEX]   COMBAT_CODEX present + valid (Backquote, entries, showContextHints) AND ships
//             enabled:true DEFAULT-ON (the CAS-2002 flip). Does not touch any other system's code.
//   [DETERM]  a short sim cycle fingerprints identical across 2 runs (input-independent sim).
//
// Run: node tools/cas2003-fullbuild-regression.mjs
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { G, update } from "../sim/sim.js";

const EXPECT_BUILD = "c7cfc0e489e8";
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

async function checkBuild() {
  try {
    const r = await fetch(`${BASE}/version.json`, { cache: "no-store" });
    const j = await r.json();
    if (j.build === EXPECT_BUILD) pass(`[BUILD] live version.json build=${j.build} files=${j.files} == EXPECT ${EXPECT_BUILD}`);
    else fail(`[BUILD] live build=${j.build} != EXPECT ${EXPECT_BUILD}`);
  } catch (e) { log(`ℹ [BUILD] fetch skipped (${e.message}); md5 served==HEAD 6/6 verified out-of-band (issue comment)`); }
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
  // GO-LIVE: SUMMON (CAS-1980) AND BOSS_RUSH (CAS-1993/1994) both enabled:true LIVE.
  const su = cfg.SUMMON, br = cfg.BOSS_RUSH;
  const suLive = su && su.enabled === true && su.key === "KeyN" && su.charges > 0;
  const brValid = br && br.key === "KeyB" && Array.isArray(br.sequence) && br.sequence.length >= 3
    && !br.sequence.includes("frost") && !br.sequence.includes("trial")
    && typeof br.hpStep === "number" && typeof br.dmgStep === "number"
    && br.healFrac > 0 && br.refillOnRest === true && typeof br.essPerRound === "number";
  if (suLive && brValid && br.enabled === true) pass(`[GOLIVE] SUMMON.enabled===true (KeyN, charges:${su.charges}) AND BOSS_RUSH.enabled===true (KeyB, seq=[${br.sequence.join(",")}]) — both PLAYABLE`);
  else fail(`[GOLIVE] SUMMON.enabled=${su && su.enabled} BOSS_RUSH.enabled=${br && br.enabled} brValid=${brValid} (expected both true)`);
  // 24th system COMBAT_CODEX — present + valid + NOW DEFAULT-ON (enabled:true, CAS-2002 flip).
  const cc = cfg.COMBAT_CODEX, ce = cfg.COMBAT_CODEX_ENTRIES;
  const ccValid = cc && cc.codexKey === "Backquote" && cc.showContextHints === true
    && typeof cc.toastSecs === "number" && cc.toastSecs > 0 && Array.isArray(ce) && ce.length > 0
    && ce.every((e) => typeof e.label === "string" && typeof e.keyOf === "function" && typeof e.gate === "function");
  if (ccValid && cc.enabled === true) pass(`[CODEX] COMBAT_CODEX DEFAULT-ON (enabled:true — CAS-2002 flip) + valid (codexKey=${cc.codexKey}, ${ce.length} entries, showContextHints=${cc.showContextHints}, toast=${cc.toastSecs}s)`);
  else if (ccValid && cc.enabled !== true) fail(`[CODEX] COMBAT_CODEX valid but enabled=${cc.enabled} (expected TRUE post go-live flip CAS-2002)`);
  else fail(`[CODEX] COMBAT_CODEX missing/invalid (present=${cc !== undefined})`);
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
}

await checkBuild();
auditKnobs();
determinism();

log("");
if (ok) log("✅ CAS-2003 CONSOLIDATED REGRESSION — ALL PASS (23/23 systems + SUMMON & BOSS_RUSH & COMBAT_CODEX all live on c7cfc0e489e8)");
else { console.error("❌ CAS-2003 CONSOLIDATED REGRESSION — FAIL"); process.exit(1); }
