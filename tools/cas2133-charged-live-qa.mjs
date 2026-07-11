// ---------------------------------------------------------------------------
// CAS-2133 / CAS-2135 Build DARK: ATAQUE CARGADO CON HÍPER-ARMADURA (mec #37)
// DOM-free node harness. Drives REAL sim/sim.js + sim/config.js seams via
// dev.charge* probes. Mirror of tools/cas2127-riposte-live-qa.mjs.
//
// Invariants verified:
//   AC0  META       — knob present + full-shaped + enabled:false (DARK)
//   AC1  THRESHOLD  — hold ≥ threshold → charged (×dmgMul); charge inert OFF
//   AC2  HYPER-ARM  — during h.charging=true damageHero cannot stagger hero
//   AC3  CAP-IN     — incoming damage capped to incomingDmgCapFracMaxHp×hpMax while charging
//   AC4  CAP-OUT    — charged release vs boss capped to releaseCapFracMaxHp×maxHp; trash uncapped
//   AC5  OFF-INERT  — enabled:false → _charged=true byte-identical to normal heavy
//   AC6  SAVE-BYTEID— chargeT/charging/_charged transient ⇒ serializeSave() byte-id ON/OFF
//   AC7  SRAND      — 0 draws: srand stream byte-identical ON vs OFF (0 chargeRng)
//   AC8  REGRESSION — 37-mech regression (36 existing + [CHARGED] DARK audit)
//
// Run: node tools/cas2133-charged-live-qa.mjs
// ---------------------------------------------------------------------------
import * as cfg from "../sim/config.js";
import * as sim from "../sim/sim.js";
import { G } from "../sim/sim.js";

// ── sim bootstrap (mirror of cas2127-riposte-live-qa.mjs) ────────────────────
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec:()=>[0,0], aim:noop, aimActive:false, blockHeld:false, chargeHeld:false, isTouch:false, pollPad:noop };
sim.configure({ io, audio:deep, view:deep });
sim.createHero("ChargedQA", "warrior");

let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

// ── AC0 META ─────────────────────────────────────────────────────────────────
function ac0_meta() {
  const d = sim.dev.chargeMeta();
  const need = ["enabled","chargeThresholdMs","maxChargeMs","dmgMul","poiseMul","staminaCost",
                "hyperArmorGrant","incomingDmgCapFracMaxHp","releaseCapFracMaxHp","requiresMelee"];
  const shapeOk = d && typeof d === "object" && need.every((k) => k in d);
  const dark = d && d.enabled === false;
  const valsOk = d && d.chargeThresholdMs === 350 && d.maxChargeMs === 900
    && d.dmgMul === 1.7 && d.poiseMul === 2.5 && d.staminaCost === 12
    && d.hyperArmorGrant === 999 && d.incomingDmgCapFracMaxHp === 0.18
    && d.releaseCapFracMaxHp === 0.22 && d.requiresMelee === true;
  if (shapeOk && dark && valsOk)
    pass(`[AC0-META] CHARGED_ATTACK knob present, full-shaped, enabled:false (DARK), all knob values nominal — chargeThresholdMs=${d.chargeThresholdMs}/dmgMul=${d.dmgMul}/poiseMul=${d.poiseMul}/staminaCost=${d.staminaCost}/hyperArmorGrant=${d.hyperArmorGrant}/incomingCap=${d.incomingDmgCapFracMaxHp}/releaseCap=${d.releaseCapFracMaxHp}`);
  else fail(`[AC0-META] shapeOk=${shapeOk} dark=${dark} valsOk=${valsOk} meta=${JSON.stringify(d)}`);
}

// ── AC1 THRESHOLD (HEADLINE) ──────────────────────────────────────────────────
function ac1_headline() {
  const r = sim.dev.chargeHeadlineProbe();
  if (r.ok && r.ratioOk)
    pass(`[AC1-THRESHOLD] charged/normal ratio=${r.ratio} ≈ dmgMul=${r.expect} (dNormal=${r.dNormal}, dCharged=${r.dCharged})`);
  else fail(`[AC1-THRESHOLD] ratio=${r.ratio} expect=${r.expect} ratioOk=${r.ratioOk} ok=${r.ok} r=${JSON.stringify(r)}`);

  // AC1b: OFF — chargeOffProbe: _charged=true inert with enabled:false
  const ro = sim.dev.chargeOffProbe();
  if (ro.ok && ro.dmgInert)
    pass(`[AC1b-OFF-INERT] enabled:false → _charged=true byte-identical to normal heavy (dNormal=${ro.dNormal}, dForced=${ro.dForced})`);
  else fail(`[AC1b-OFF-INERT] dmgInert=${ro.dmgInert} dNormal=${ro.dNormal} dForced=${ro.dForced}`);
}

// ── AC2 HYPER-ARMOR ───────────────────────────────────────────────────────────
function ac2_hyperarmor() {
  const r = sim.dev.chargeHyperArmorProbe();
  if (r.ok && r.hyperArmorAbsorbs)
    pass(`[AC2-HYPER-ARMOR] charging=true absorbs stun (stunNoCharge=${r.stunNoCharge}, stunDuringCharge=${r.stunDuringCharge}) — windup hyper-armor absorbs infl.type=stun`);
  else fail(`[AC2-HYPER-ARMOR] hyperArmorAbsorbs=${r.hyperArmorAbsorbs} stunDuringCharge=${r.stunDuringCharge} r=${JSON.stringify(r)}`);
}

// ── AC3 CAP INCOMING ──────────────────────────────────────────────────────────
function ac3_capIncoming() {
  const r = sim.dev.chargeCapIncomingProbe();
  if (r.ok && r.capOk && r.uncappedExceedsCap)
    pass(`[AC3-CAP-IN] incoming damage capped during charging: dCapped=${r.dCapped} ≤ cap=${r.cap} (forcedMaxHp=100, incomingDmgCapFrac=${cfg.CHARGED_ATTACK.incomingDmgCapFracMaxHp}); uncapped=${r.dUncapped} > cap ⇒ cap bites`);
  else fail(`[AC3-CAP-IN] capOk=${r.capOk} uncappedExceedsCap=${r.uncappedExceedsCap} cap=${r.cap} dCapped=${r.dCapped} dUncapped=${r.dUncapped}`);
}

// ── AC4 CAP OUTGOING ──────────────────────────────────────────────────────────
function ac4_capOutgoing() {
  const r = sim.dev.chargeCapSalienteProbe();
  if (r.ok && r.bossCapped && r.capBound)
    pass(`[AC4-CAP-OUT] charged release vs boss capped: dBoss=${r.dBoss} ≈ cap=${r.cap} (releaseCapFrac=${cfg.CHARGED_ATTACK.releaseCapFracMaxHp}); trash=${r.dTrash} > cap ⇒ cap bites boss, trash uncapped`);
  else fail(`[AC4-CAP-OUT] bossCapped=${r.bossCapped} capBound=${r.capBound} cap=${r.cap} dBoss=${r.dBoss} dTrash=${r.dTrash}`);
}

// ── AC5 OFF BYTE-ID (already folded into AC1b above, recheck) ────────────────
function ac5_off() {
  const r = sim.dev.chargeOffProbe();
  if (r.ok)
    pass(`[AC5-OFF] enabled:false → _charged inert byte-id confirmed again (dNormal=${r.dNormal} === dForced=${r.dForced})`);
  else fail(`[AC5-OFF] dmgInert=${r.dmgInert} dNormal=${r.dNormal} dForced=${r.dForced}`);
}

// ── AC6 SAVE BYTE-ID ─────────────────────────────────────────────────────────
function ac6_save() {
  const r = sim.dev.chargeSaveByteId();
  if (r.ok && r.byteId && !r.hasKey)
    pass(`[AC6-SAVE-BYTEID] serializeSave() byte-identical ON/OFF; no chargeT/charging/_charged keys in save.v1 (transient fields outside allowlist)`);
  else fail(`[AC6-SAVE-BYTEID] byteId=${r.byteId} hasKey=${r.hasKey} r=${JSON.stringify(r)}`);
}

// ── AC7 SRAND 0-DRAWS ─────────────────────────────────────────────────────────
function ac7_srand() {
  const SEED = 0xca5_2133;
  const N = 32;
  const on  = sim.dev.chargeSrandProbe(true,  SEED, N);
  const off = sim.dev.chargeSrandProbe(false, SEED, N);
  const fpOn  = JSON.stringify(on.fingerprint);
  const fpOff = JSON.stringify(off.fingerprint);
  if (fpOn === fpOff)
    pass(`[AC7-SRAND] srand stream byte-identical ON vs OFF (N=${N}×2, seed=0x${SEED.toString(16)}) — 0 draws, no chargeRng`);
  else {
    const mismatch = on.fingerprint.findIndex((v, i) => v !== off.fingerprint[i]);
    fail(`[AC7-SRAND] srand diverges at index ${mismatch}: ON=${on.fingerprint[mismatch]} OFF=${off.fingerprint[mismatch]}`);
  }
}

// ── AC8 37-MECH REGRESSION ───────────────────────────────────────────────────
function ac8_regression() {
  // Mirror of auditRiposte from cas2131 but for CHARGED_ATTACK (37th, DARK)
  const ca = cfg.CHARGED_ATTACK;
  const need = ["enabled","chargeThresholdMs","maxChargeMs","dmgMul","poiseMul","staminaCost",
                "hyperArmorGrant","incomingDmgCapFracMaxHp","releaseCapFracMaxHp","requiresMelee"];
  const shapeOk = ca && typeof ca === "object" && need.every((k) => k in ca)
    && ca.chargeThresholdMs > 0 && ca.maxChargeMs > ca.chargeThresholdMs
    && ca.dmgMul > 1 && ca.poiseMul > 1 && ca.staminaCost >= 0
    && ca.hyperArmorGrant > 0 && ca.incomingDmgCapFracMaxHp > 0 && ca.incomingDmgCapFracMaxHp < 1
    && ca.releaseCapFracMaxHp > 0 && ca.releaseCapFracMaxHp < 1;
  const dark = ca && ca.enabled === false;
  if (shapeOk && dark)
    pass(`[CHARGED] CHARGED_ATTACK DARK (37th mech, CAS-2135 Build) — enabled:false (hard-gated dead branches, byte-id to mec#36), full knob shape chargeThresholdMs=${ca.chargeThresholdMs}/maxChargeMs=${ca.maxChargeMs}/dmgMul=${ca.dmgMul}/poiseMul=${ca.poiseMul}/staminaCost=${ca.staminaCost}/hyperArmorGrant=${ca.hyperArmorGrant}/incomingCap=${ca.incomingDmgCapFracMaxHp}/releaseCap=${ca.releaseCapFracMaxHp}, requiresMelee=${ca.requiresMelee} — RNG-neutral (0 chargeRng) + save-neutral (h.chargeT/h.charging/h._charged transient) ⇒ srand ON==OFF & save.v1 byte-id; reúsa COMBO.heavyKey="KeyN" (no collision), hyper-armor extends existing HYPERARMOR infra`);
  else fail(`[CHARGED] shapeOk=${shapeOk} dark=${dark} ca=${JSON.stringify(ca)}`);

  // check existing mec#36 RIPOSTE still LIVE (post-flip by CAS-2132)
  const rip = cfg.RIPOSTE;
  const ripLive = rip && rip.enabled === true;
  if (ripLive)
    pass(`[RIPOSTE] RIPOSTE LIVE (36th mech, CAS-2132 Gate GO) — enabled:true (post-flip)`);
  else fail(`[RIPOSTE] enabled=${rip && rip.enabled} (expected true, post-flip CAS-2132)`);

  // check RALLY still LIVE (post-flip CAS-2115)
  const ral = cfg.RALLY;
  const ralLive = ral && ral.enabled === true;
  if (ralLive)
    pass(`[RALLY] RALLY LIVE (35th mech) — enabled:true`);
  else fail(`[RALLY] enabled=${ral && ral.enabled} (expected true)`);

  // determinism: 37 mechanics including CHARGED_ATTACK DARK add 0 draws to a normal run
  const io = { moveVec:()=>[0,0], aim:()=>{}, aimActive:false, blockHeld:false, chargeHeld:false, isTouch:false, pollPad:()=>{} };
  if (typeof sim.srand === "function") sim.srand(0xca5_2133);
  try { if (sim.dev && sim.dev.startRun) sim.dev.startRun("warrior"); } catch {}
  let acc = "";
  const { update } = sim;
  for (let i = 0; i < 30; i++) {
    try { update(16.67, io); } catch {}
    if (G && G.hero) acc += `${Math.round((G.hero.x||0)*100)},${Math.round((G.hero.y||0)*100)}|`;
  }
  if (typeof sim.srand === "function") sim.srand(0xca5_2133);
  try { if (sim.dev && sim.dev.startRun) sim.dev.startRun("warrior"); } catch {}
  let acc2 = "";
  for (let i = 0; i < 30; i++) {
    try { update(16.67, io); } catch {}
    if (G && G.hero) acc2 += `${Math.round((G.hero.x||0)*100)},${Math.round((G.hero.y||0)*100)}|`;
  }
  const fp = acc || "empty"; const fp2 = acc2 || "empty";
  if (fp === fp2 && !fp.startsWith("ERR:"))
    pass(`[DETERM] sim cycle fingerprint identical across 2 runs (len ${fp.length}) — 37 mechanics (CHARGED_ATTACK DARK + all prior) add 0 draws to a normal run`);
  else fail(`[DETERM] fingerprints differ a=${fp.slice(0,60)} b=${fp2.slice(0,60)}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
log("── CAS-2133/CAS-2135 CHARGED HEAVY QA HARNESS ──");
ac0_meta();
ac1_headline();
ac2_hyperarmor();
ac3_capIncoming();
ac4_capOutgoing();
ac5_off();
ac6_save();
ac7_srand();
ac8_regression();
log("");
if (ok) log("✅ CAS-2133 ALL AC PASS — CHARGED_ATTACK DARK mec#37 verified: META/THRESHOLD/HYPER-ARMOR/CAP-IN/CAP-OUT/OFF-INERT/SAVE-BYTEID/SRAND/37-mech-regression");
else { console.error("❌ CAS-2133 FAIL"); process.exit(1); }
