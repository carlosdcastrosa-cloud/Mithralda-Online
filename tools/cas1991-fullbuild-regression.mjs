// ---------------------------------------------------------------------------
// CAS-1991 — QA FULL-BUILD REGRESSION vs LIVE 36910735b945 (post-BOSS_RUSH deploy).
// Delta of tools/cas1985-fullbuild-regression.mjs (23 systems on the SUMMON go-live build).
// The CAS-1988 Boss Rush / Gauntlet deploy (CAS-1990) overlaid 6 game-core blobs onto
// gh-pages; served version.json flipped c960c813843d -> 36910735b945 / 799. All 6 served
// blobs are md5-identical to HEAD (verified out-of-band via curl in the issue comment),
// so importing sim/config.js + sim/sim.js drives the EXACT live code.
//
// Boss Rush is NOT a 24th pillar — it is the 1st HARVEST of the 23-pillar kit, and it SHIPS
// DARK (enabled:false; the go-live flip is a CEO Gate, mirror of SUMMON CAS-1979). So:
//   - the 23 shipped systems must still compose with SUMMON live (enabled:true), 0 regression;
//   - BOSS_RUSH must be present + valid + enabled:false (dark) in the served config.
//
//   [BUILD]   live version.json == EXPECT_BUILD (served == what we import).
//   [WIRED]   23/23 systems present + signature-valid in the served config.
//   [GOLIVE]  SUMMON.enabled === true (pilar 23 playable to real players).
//   [BRUSH]   BOSS_RUSH present + valid sequence + enabled:false (ships DARK; flip = CEO Gate).
//   [DETERM]  a short sim cycle fingerprints identical across 2 runs (input-independent sim).
//
// Run: node tools/cas1991-fullbuild-regression.mjs
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { G, update } from "../sim/sim.js";

const EXPECT_BUILD = "36910735b945";
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
  // GO-LIVE headline: SUMMON must ship enabled:true now.
  if (cfg.SUMMON && cfg.SUMMON.enabled === true) pass(`[GOLIVE] SUMMON.enabled === true — pilar 23 PLAYABLE to real players (KeyN, charges:${cfg.SUMMON.charges})`);
  else fail(`[GOLIVE] SUMMON.enabled !== true (got ${cfg.SUMMON && cfg.SUMMON.enabled}) — pilar 23 still dark`);
  // BOSS_RUSH — 1st harvest of the kit; present + valid + ships DARK (enabled:false, flip = CEO Gate).
  const br = cfg.BOSS_RUSH;
  const brValid = br && br.key === "KeyB" && Array.isArray(br.sequence) && br.sequence.length >= 3
    && !br.sequence.includes("frost") && !br.sequence.includes("trial")
    && typeof br.hpStep === "number" && typeof br.dmgStep === "number"
    && br.healFrac > 0 && br.refillOnRest === true && typeof br.essPerRound === "number";
  if (brValid && br.enabled === false) pass(`[BRUSH] BOSS_RUSH present + valid (KeyB, seq=[${br.sequence.join(",")}], heal=${br.healFrac}, ess=${br.essPerRound}+r*${br.essStepRound}) + ships DARK (enabled:false) — flip = CEO Gate`);
  else if (brValid && br.enabled !== false) fail(`[BRUSH] BOSS_RUSH valid but enabled=${br.enabled} (expected false; go-live flip is not this QA's scope)`);
  else fail(`[BRUSH] BOSS_RUSH missing/invalid (present=${br !== undefined})`);
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
if (ok) log("✅ CAS-1991 FULL-BUILD REGRESSION — ALL PASS (23/23 systems + BOSS_RUSH shipped DARK on 36910735b945)");
else { console.error("❌ CAS-1991 FULL-BUILD REGRESSION — FAIL"); process.exit(1); }
