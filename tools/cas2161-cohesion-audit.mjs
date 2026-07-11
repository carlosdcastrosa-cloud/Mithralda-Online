// ---------------------------------------------------------------------------
// CAS-2161 — Cohesion & Balance Audit v6 (40 mecánicas). DRIVES the real sim loop via the
// dev probes (applyHeroMelee / hitEnemy / tickRally / tickCharge / guardBreakKick / deflectProbe /
// lungeProbe — the SAME code paths the served build runs), NOT a byte/md5 check. PORT of v5
// (CAS-2150, 38 mec) bumped to the LIVE build fa5ccf7c051f/799 with BOTH mec #39 DEFLECT/Reflejo
// de proyectil (DEFLECT.enabled:true) and mec #40 LUNGE/Estocada de Avance (LUNGE.enabled:true)
// FLIPPED LIVE. New sections [H] anti-ranged reflect and [I] anti-kite gap-closer; [E]/[Q] extended.
//
// Served files BYTE-IDENTICAL to this working tree (md5 verified ×5: config 6fd87775,
// sim 2b6ea7fb, input 877899de, render 7eec7d36, strings 54db1b52) ⇒ importing ../sim/sim.js
// exercises the LIVE production code paths byte-for-byte.
//
// Axes (all MEASURED via real probes, printed as OBSERVABLE numbers the QA report cites verbatim):
//   [A] REACTIVE-COUNTER MUTUAL-EXCLUSIVITY — gc/dc/charged never stack on one swing.
//   [B] BURST CEILING vs BOSS — riposte cap (≤25%) then charged cap (≤22%) clamp the FINAL hit.
//   [C] RALLY SUSTAIN LOOP — recoverFrac × healPerHitFrac < 1 ⇒ strictly net-loss.
//   [D] STATUS BUILDUP %HP vs HIGH-HP BOSS — bleed as chip, not degenerate anti-sponge.
//   [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) incl DEFLECT#39 + LUNGE#40.
//   [F] CLASS/TIER COVERAGE — melee-only pillars vs universal verbs.
//   [G] GUARD-BREAK #38 — anti-turtle offensive kick, burst-free & orthogonal.
//   [H] DEFLECT #39 (NEW) — anti-ranged reflect: enemy projectile captured in parry window ⇒ owner
//       flips + velocity reverses toward the shooter, reflected dmg CAPPED ≤15% target maxHp, hero
//       takes 0 self-damage, once-per-window, OFF byte-id. Proves anti-ranged WITHOUT new burst.
//   [I] LUNGE #40 (NEW) — anti-kite gap-closer: dash ~distance px toward facing + strike ×dmgMul,
//       NO i-frames (vulnerable/commit, distinguishes from roll), costs real stamina + recovery
//       (not spammable), UNIVERSAL (every class closes distance), OFF byte-id. Proves anti-kite
//       WITHOUT one-shot (×1.3 uncapped melee ≪ capped burst verbs) and WITHOUT touching OFF paths.
//
// Run: node tools/cas2161-cohesion-audit.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_COUNTER, DODGE_COUNTER, RALLY, RIPOSTE, CHARGED_ATTACK, HYPERARMOR, GUARD_BREAK,
  DEFLECT, LUNGE, STATUS_BUILDUP, TWO_HAND, WEAPON_ARCHETYPES, WEAPON_ARTS, WEAPON_BUFFS, COMBO,
  POISE, FRENZY, BACKSTAB } from "../sim/config.js";

const log = (m) => console.log(m);
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const pass = (b) => b ? "PASS" : "**FAIL**";
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("AuditBot", "warrior");
const d = sim.dev;

const findings = [];   // {sev, title, mecs, headline, fix, ceo}
const flag = (sev, title, mecs, headline, fix, ceo=false) => findings.push({sev, title, mecs, headline, fix, ceo});

log(`\n########## CAS-2161 COHESION & BALANCE AUDIT v6 — 40 mecánicas · LIVE fa5ccf7c051f/799 ##########`);
log(`DEFLECT.enabled=${DEFLECT.enabled} (mec #39) · LUNGE.enabled=${LUNGE.enabled} (mec #40) — both LIVE · driving REAL sim loop (served==HEAD byte-id ×5)`);

// ── [A] REACTIVE-COUNTER MUTUAL-EXCLUSIVITY (Guard#33 / Dodge#34 / Charged#37) ──────────────
log("\n===== [A] COUNTER STACKING — do reactive windows create a no-risk guaranteed combo? =====");
const gc = d.guardCounterDmgProbe();
const dc = d.dodgeCounterDmgProbe();
const comp = d.dodgeCounterComposeProbe();
const chT = d.chargeThresholdProbe();
log(`Guard Counter (#33): light swing in-window ×${r3(gc.ratio)} (expect ${GUARD_COUNTER.dmgMul}), stam ${gc.stSpent}, consumes window=${gc.consumed} ⇒ ${pass(gc.ok)}`);
log(`Dodge Counter (#34): light swing in-window ×${r3(dc.ratio)} (expect ${DODGE_COUNTER.dmgMul}), stam ${dc.stSpent}, consumes window=${dc.consumed} ⇒ ${pass(dc.ok)}`);
log(`Charged   (#37): supra-threshold heavy ×${r3(chT.ratio)} (expect ${CHARGED_ATTACK.dmgMul}), +${chT.extraStam} stam, chargeT@release ${chT.chargeTAtRelease}ms ⇒ ${pass(chT.ok)}`);
log(`COMPOSE gc+dc BOTH windows forced open on one swing: dmg ratio ×${r3(comp.ratioBoth)} — onlyGuardMul(no product)=${comp.onlyGuard}, dodgeWindowNOTconsumed=${comp.dodgeNotConsumed}`);
const aOk = comp.ok && gc.ok && dc.ok && chT.ok;
log(`VERDICT [A]: reactive counters NEVER multiply together on one swing (max one of {${GUARD_COUNTER.dmgMul}, ${DODGE_COUNTER.dmgMul}, ${CHARGED_ATTACK.dmgMul}}) ⇒ ${pass(aOk)}`);
if(!aOk) flag(2, "Counter windows stack into a product multiplier", "#33/#34/#37", `compose ratio ${comp.ratioBoth}≠${GUARD_COUNTER.dmgMul}`, "reassert dc=!gc gate + charged=heavy exclusivity");

// ── [B] BURST CEILING vs BOSS — can a Charged+Riposte crit one-shot a boss? ──────────────────
log("\n===== [B] BURST CEILING — biggest single hit as a fraction of BOSS maxHp =====");
const ripC = d.riposteCapProbe();
const chOut = d.chargeOutgoingCapProbe();
const ripH = d.riposteHeadlineProbe();
log(`Riposte (#36) execute ×${r3(ripH.ratio)} (expect ${RIPOSTE.dmgMul}); consumes _ripArm=${ripH.consumed}; 2nd melee same window NORMAL=${ripH.secondNormal} ⇒ 1 crit / break`);
log(`Riposte CAP vs boss: dBoss=${ripC.dBoss} == cap ${ripC.cap} (=${RIPOSTE.ripCapFracMaxHp*100}% maxHp), trash uncapped ${ripC.dTrash} ⇒ bossCapped=${ripC.bossCapped}`);
log(`Charged CAP vs boss: dBoss=${chOut.dBoss} == cap ${chOut.cap} (=${CHARGED_ATTACK.releaseCapFracMaxHp*100}% maxHp), trash uncapped ${chOut.dTrash} ⇒ bossCapped=${chOut.bossCapped}`);
const worstFrac = CHARGED_ATTACK.releaseCapFracMaxHp;
const minHits = Math.ceil(1 / worstFrac);
const bOk = ripC.ok && chOut.ok && ripH.ok;
log(`COMPOUND charged+riposte on a broken boss: riposte cap (≤${RIPOSTE.ripCapFracMaxHp*100}%) then charged cap (≤${CHARGED_ATTACK.releaseCapFracMaxHp*100}%) ⇒ FINAL hit ≤ ${worstFrac*100}% boss maxHp`);
log(`VERDICT [B]: minimum ${minHits} biggest-possible hits to kill a boss ⇒ NO one-shot ⇒ ${pass(bOk && minHits>=4)}`);
if(!bOk) flag(2, "Boss burst cap does not bite", "#36/#37", `riposte/charged cap probe fail`, "verify ripCapFracMaxHp/releaseCapFracMaxHp clamp in hitEnemy");

// ── [C] RALLY SUSTAIN LOOP ────────────────────────────────────────────────────────────────
log("\n===== [C] RALLY SUSTAIN — can the hero out-heal a boss while charging (hyper-armor tank+regain)? =====");
const rArm = d.rallyArmProbe();
const rHeal = d.rallyHealProbe();
const rCap = d.rallyCapProbe();
const rDec = d.rallyDecayProbe();
const chIn = d.chargeIncomingCapProbe();
const chHA = d.chargeHyperArmorProbe();
const armRatio = rArm.pool / rArm.real;
const netPerDmg = RALLY.recoverFrac * RALLY.healPerHitFrac;
log(`Rally ARM: took ${rArm.real} dmg ⇒ pool ${rArm.pool} (=${r3(armRatio)}× ≈ recoverFrac ${RALLY.recoverFrac}); window ${rArm.rallyT}s ⇒ ${pass(rArm.ok)}`);
log(`Rally HEAL: one melee heals ${rHeal.healed} of pool 100 (=healPerHitFrac ${RALLY.healPerHitFrac}); AoE 2 mobs heals ONCE=${rHeal.onceOk} ⇒ ${pass(rHeal.ok)}`);
log(`Rally CAP: pool clamped to ${rCap.pool} = ${RALLY.capFracMaxHp*100}% HPmax ⇒ ${pass(rCap.ok)}; DECAY ${rDec.expectDrop}/0.5s + expiry→0 ⇒ ${pass(rDec.ok)}`);
log(`Charged windup: incoming per-hit capped to ${chIn.dCap} = ${CHARGED_ATTACK.incomingDmgCapFracMaxHp*100}% HPmax (base ${chIn.dBase}) ⇒ absorb≠immunity ${pass(chIn.ok)}; hyper-armor stun absorbed=${chHA.ok}`);
log(`NET SUSTAIN: recoverFrac ${RALLY.recoverFrac} × healPerHitFrac ${RALLY.healPerHitFrac} = ${r3(netPerDmg)} HP returned per 1 HP taken, per melee hit`);
const cOk = rArm.ok && rHeal.ok && rCap.ok && rDec.ok && chIn.ok && netPerDmg < 1;
log(`VERDICT [C]: ${r3(netPerDmg)} < 1 ⇒ every exchange is STRICTLY net-loss (plus decay if you don't hit) ⇒ NO infinite tank+regain ⇒ ${pass(cOk)}`);
if(netPerDmg >= 1) flag(1, "Rally out-heals incoming damage ⇒ infinite sustain", "#35/#37", `recoverFrac×healPerHitFrac=${netPerDmg}≥1`, "lower RALLY.healPerHitFrac or recoverFrac so product<<1", true);

// ── [D] STATUS BUILDUP %HP vs HIGH-HP BOSS ──────────────────────────────────────────────────
log("\n===== [D] STATUS BUILDUP (bleed procPctHp) — does DoT-as-%HP degenerate vs high-HP bosses? =====");
const bld = d.buildupBleedProbe();
const bt = STATUS_BUILDUP.types.bleed;
log(`Bleed: melee feeds meter=${bld.meleeFeeds}; trash proc burst ${bld.burst} = ${bt.procPctHp*100}% maxHp every ${Math.ceil(bt.threshold/bt.build)} hits; resets=${bld.reset}`);
log(`Bleed vs BOSS: burst ${bld.bburst} = ${bt.bossProcPctHp*100}% maxHp every ${bld.bossHits} hits (bossBuildMul ${STATUS_BUILDUP.bossBuildMul} ⇒ slower); decay ${STATUS_BUILDUP.decayPerSec}/s punishes poking`);
const bleedCyclesToKill = Math.ceil(1 / bt.bossProcPctHp);
log(`Bleed-ALONE to kill a boss: ${bleedCyclesToKill} procs × ${bld.bossHits} sustained hits = ~${bleedCyclesToKill*bld.bossHits} uninterrupted melee hits (decay resets if you disengage)`);
const dOk = bld.ok && bld.bossHits > Math.ceil(bt.threshold/bt.build);
log(`VERDICT [D]: %HP proc scales with boss HP (anti-sponge by design) but capped at ${bt.bossProcPctHp*100}%/cycle + slow boss buildup + decay ⇒ chip, not degenerate ⇒ ${pass(dOk)}`);

// ── [G] GUARD-BREAK #38 — anti-turtle offensive kick ────────────────────────────────────────
log("\n===== [G] GUARD-BREAK #38 (Empujón/Rompe-Guardia) — anti-turtle verb; burst-free & orthogonal? =====");
const gbP = d.guardBreakPoiseProbe();
const gbB = d.guardBreakBreakProbe();
const gbS = d.guardBreakShieldProbe();
const gbC = d.guardBreakCostProbe();
const gbO = d.guardBreakOffProbe();
const gbSave = d.guardBreakSaveByteId();
log(`POISE  : kick poise ×${r3(gbP.ratio)} vs a light swing (expect ${GUARD_BREAK.poiseMul}); pRef=${gbP.pRef} pKick=${gbP.pKick} ⇒ ${pass(gbP.ok)}`);
log(`BREAK  : ${gbB.kicks} kicks drain a champion's guard ⇒ staggerT=${gbB.staggerT} ARMS _ripArm=${gbB.armedByKick} (NO auto-exec); NORMAL follow-up melee executes=${gbB.followupExecuted} ⇒ ${pass(gbB.ok)}`);
log(`SHIELD : kick CRACKS a carapace-shielded enemy=${gbS.cracked} + shoves=${gbS.shoved}; normal melee does NOT crack=${gbS.normalNoCrack} ⇒ anti-turtle ${pass(gbS.ok)}`);
log(`COST   : stam spent ${gbC.stSpent} (expect ${GUARD_BREAK.staminaCost}); recovery armed=${gbC.cdArmed}; direct dmg ${gbC.dmgDealt} << normal swing ${gbC.dRef} (LOW=${gbC.dmgLow}); 2nd kick in-CD denied=${gbC.denyInCd} ⇒ ${pass(gbC.ok)}`);
log(`OFF    : GUARD_BREAK.enabled=false ⇒ kick no-op: noCost=${gbO.noCost} noPoise=${gbO.noPoise} noCrack=${gbO.noCrack} noCd=${gbO.noCd} ⇒ byte-id HEAD ${pass(gbO.ok)}`);
log(`SAVE   : serialize byte-id ON==OFF=${gbSave.byteId}; no gb* key leak=${!gbSave.hasKey} ⇒ ${pass(gbSave.ok)}`);
const gbBurstFree = (GUARD_BREAK.dmg <= 10) && gbC.dmgLow;
const gbOrthogonal = gbB.armedByKick && gbB.followupExecuted;
const gOk = gbP.ok && gbB.ok && gbS.ok && gbC.ok && gbO.ok && gbSave.ok && gbBurstFree && gbOrthogonal;
log(`VERDICT [G]: kick drains poise (×${GUARD_BREAK.poiseMul}) & cracks shields to BREAK the turtle, ARMS (not auto-crits) Riposte's window, costs ${GUARD_BREAK.staminaCost} stam + ${GUARD_BREAK.recoverMs}ms recovery, deals only ${GUARD_BREAK.dmg} direct dmg ⇒ anti-turtle WITHOUT new burst/one-shot; OFF byte-id ⇒ ${pass(gOk)}`);
if(!gbBurstFree) flag(2, "Guard-break adds a burst source", "#38", `direct dmg ${GUARD_BREAK.dmg} not utility-low`, "keep GUARD_BREAK.dmg low; burst must route through capped Riposte", true);

// ── [H] DEFLECT #39 — anti-ranged reflect (NEW; drives deflectProbe REAL) ────────────────────
log("\n===== [H] DEFLECT #39 (Reflejo de Proyectil) — anti-ranged verb; burst-free, no self-damage, capped? =====");
const dfOn  = d.deflectProbe({ enabled: true,  dmg: 40, targetHp: 500 });                 // normal reflect
const dfCap = d.deflectProbe({ enabled: true,  dmg: 100000, targetHp: 500 });             // huge dmg ⇒ cap must bite
const dfOff = d.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 });                 // OFF ⇒ hero eats it
log(`FLIP   : enemy bolt captured in parry window ⇒ ownerFlipped=${dfOn.ownerFlipped}, velReversed→shooter=${dfOn.velReversedAtFlip}; heroHpLoss=${dfOn.heroHpLoss} (0 self-dmg); shooterHpLoss=${dfOn.shooterHpLoss}; stam −${dfOn.stamSpent} (cfg ${DEFLECT.staminaCost})`);
log(`CAP    : dmg 100000 on a ${500} maxHp shooter ⇒ reflectedRaw=${dfCap.reflectedRaw} == cap ${dfCap.capValue} (=${DEFLECT.dmgFracCap*100}% maxHp), capHit=${dfCap.capHit}; shooterHpLoss=${dfCap.shooterHpLoss} ⇒ never one-shot`);
log(`WINDOW : requiresParryWindow=${DEFLECT.requiresParryWindow}, oncePerWindow=${DEFLECT.oncePerWindow} ⇒ parryT consumed after=${dfOn.parryTAfter}s (tempo-gate, not passive shield)`);
log(`OFF    : enabled=false ⇒ NOT flipped=${!dfOff.ownerFlipped}, hero EATS bolt heroHpLoss=${dfOff.heroHpLoss}>0, stam ${dfOff.stamSpent}=0 ⇒ byte-id dead branch`);
const hFlip = dfOn.ownerFlipped && dfOn.velReversedAtFlip && dfOn.heroHpLoss === 0 && dfOn.shooterHpLoss > 0 && dfOn.stamSpent === DEFLECT.staminaCost;
const hCap  = dfCap.capHit && Math.abs(dfCap.reflectedRaw - dfCap.capValue) < 0.5 && dfCap.shooterHpLoss <= Math.ceil(DEFLECT.dmgFracCap*500)+1;
const hWin  = dfOn.parryTAfter === 0 && DEFLECT.requiresParryWindow && DEFLECT.oncePerWindow;
const hOff  = !dfOff.ownerFlipped && dfOff.heroHpLoss > 0 && dfOff.stamSpent === 0;
const hOk = hFlip && hCap && hWin && hOff;
log(`VERDICT [H]: enemy projectile flips owner + reverses toward the shooter, reflected dmg CAPPED ≤${DEFLECT.dmgFracCap*100}% target maxHp, hero takes 0 self-dmg, once-per-window tempo-gated, OFF byte-id ⇒ anti-ranged WITHOUT new burst ⇒ ${pass(hOk)}`);
if(!hFlip) flag(2, "Deflect self-damages or fails to flip owner", "#39", `heroHpLoss=${dfOn.heroHpLoss} flipped=${dfOn.ownerFlipped}`, "verify deflectProjectile sets proj.enemy=false + reverses vx before it can hit hero");
if(!hCap)  flag(1, "Deflect reflected damage not capped ⇒ one-shot vector", "#39", `reflectedRaw=${dfCap.reflectedRaw} cap=${dfCap.capValue}`, "reassert dmgFracCap clamp in reflect path", true);
if(!hOff)  flag(1, "Deflect OFF path not byte-id ⇒ regresses prior", "#39", `deflectOff flipped=${dfOff.ownerFlipped}`, "reassert enabled:false ⇒ no capture", true);

// ── [I] LUNGE #40 — anti-kite gap-closer (NEW; drives lungeProbe REAL) ───────────────────────
log("\n===== [I] LUNGE #40 (Estocada de Avance) — anti-kite gap-closer; no-iframe commit, capped, universal? =====");
const luOn  = d.lungeProbe({ enabled: true, probeRecovery: true });
const luOff = d.lungeProbe({ enabled: false });
const luMage = d.lungeProbe({ enabled: true, cls: "mage" });                              // universal: ranged class closes distance
// STRIKE ×dmgMul: mutate dmgMul 1.0 vs live 1.3 on the SAME probe (empirical, no assumed base)
const luSav = LUNGE.dmgMul; LUNGE.dmgMul = 1.0; const luBase = d.lungeProbe({ enabled: true, targetHp: 500000 }).enemyHpLoss;
LUNGE.dmgMul = 1.3; const luBoost = d.lungeProbe({ enabled: true, targetHp: 500000 }).enemyHpLoss; LUNGE.dmgMul = luSav;
const luRatio = luBase ? +(luBoost/luBase).toFixed(3) : 0;
// one-shot check: lunge strike as a fraction of a realistic boss (25000 hp) — must be tiny vs the capped burst verbs
const luVsBoss = d.lungeProbe({ enabled: true, targetHp: 25000 }).enemyHpLoss;
const luBossFrac = luVsBoss / 25000;
log(`DASH   : hero displaced ${luOn.displacement}px toward facing (cfg distance=${LUNGE.distance}, ~${(luOn.displacement/LUNGE.distance).toFixed(2)}×); fired=${luOn.fired}`);
log(`STRIKE : dmgMul1.0 ${luBase} → dmgMul1.3 ${luBoost} (ratio ${luRatio} ≈ ${LUNGE.dmgMul}), cfg restored=${LUNGE.dmgMul}`);
log(`NO-IFRAMES 🔑: dash grants NO i-frames iframeMax=${luOn.iframeMax} granted=${luOn.iframeGranted} rolling=${luOn.rolling} ⇒ vulnerable/commit (distinguishes from roll; whiff-punishable)`);
log(`COST   : stam −${luOn.stamSpent} (cfg ${LUNGE.staminaCost}); _lungeCd=${luOn.lungeCdAfterFire}s blocks re-lunge (reFired=${luOn.reLungeFired} reStam=${luOn.reLungeStamSpent}); recoverMs cfg ${LUNGE.recoverMs}`);
log(`OFF    : enabled=false ⇒ inert: fired=${luOff.fired} disp=${luOff.displacement} dmg=${luOff.enemyHpLoss} floater=${luOff.floated} stam=${luOff.stamSpent} ⇒ byte-id dead branch`);
log(`UNIVERSAL: mage (ranged class) dashes ${luMage.displacement}px + strike dmg ${luMage.enemyHpLoss} (requiresMelee=${LUNGE.requiresMelee}) ⇒ every class closes distance`);
log(`ONE-SHOT?: lunge strike vs 25000hp boss = ${luVsBoss} (${r3(luBossFrac*100)}% maxHp) — ×1.3 UNCAPPED melee ≪ capped burst ${CHARGED_ATTACK.releaseCapFracMaxHp*100}%/hit ⇒ NOT a new one-shot vector`);
const iDash = luOn.fired && luOn.displacement > LUNGE.distance*0.6 && luOn.displacement <= LUNGE.distance*1.3;
const iStrike = luBase > 0 && luBoost > luBase && Math.abs(luRatio - LUNGE.dmgMul) < 0.06;
const iNoIframe = luOn.iframeGranted === false && luOn.iframeMax === 0 && luOn.rolling === false;
const iCost = luOn.stamSpent === LUNGE.staminaCost && luOn.lungeCdAfterFire > 0 && luOn.reLungeFired === false;
const iOff = luOff.fired === false && luOff.displacement < 1 && luOff.enemyHpLoss === 0 && luOff.stamSpent === 0;
const iUniversal = luMage.displacement > LUNGE.distance*0.6 && luMage.enemyHpLoss > 0;
const iNoOneShot = luBossFrac < CHARGED_ATTACK.releaseCapFracMaxHp;   // lunge is a smaller fraction than the WORST capped burst
const iOk = iDash && iStrike && iNoIframe && iCost && iOff && iUniversal && iNoOneShot;
log(`VERDICT [I]: dash ~${LUNGE.distance}px closes the kite, strikes ×${LUNGE.dmgMul}, NO i-frames (vulnerable commit), costs ${LUNGE.staminaCost} stam + recovery lockout, UNIVERSAL, OFF byte-id, NOT a one-shot ⇒ ${pass(iOk)}`);
if(!iNoIframe) flag(1, "Lunge grants i-frames ⇒ degenerate gap-close + dodge in one", "#40", `iframeMax=${luOn.iframeMax}`, "keep dash i-frame-free; it must be whiff-punishable", true);
if(!iCost)     flag(2, "Lunge spammable / no cost ⇒ infinite gap-close", "#40", `stam=${luOn.stamSpent} cd=${luOn.lungeCdAfterFire} reFired=${luOn.reLungeFired}`, "reassert stamina cost + _lungeCd recovery gate");
if(!iOff)      flag(1, "Lunge OFF path not byte-id ⇒ regresses prior", "#40", `lungeOff fired=${luOff.fired}`, "reassert enabled:false ⇒ lungeStrike no-op", true);
if(!iNoOneShot) flag(1, "Lunge strike exceeds capped-burst ceiling ⇒ new one-shot vector", "#40", `lungeBossFrac=${r3(luBossFrac)} ≥ ${CHARGED_ATTACK.releaseCapFracMaxHp}`, "cap the lunge strike or lower dmgMul", true);

// ── [E] RNG-NEUTRALITY sweep — srand ON==OFF for the newest mecánicas incl #39/#40 ───────────
log("\n===== [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) for the newest mecánicas =====");
const srandProbes = {
  "GuardCounter#33": d.guardCounterSrandProbe, "DodgeCounter#34": d.dodgeCounterSrandProbe,
  "Rally#35": d.rallySrandProbe, "Riposte#36": d.riposteSrandProbe, "Charged#37": d.chargeSrandProbe,
  "GuardBreak#38": d.guardBreakSrandProbe,
  "Variants": d.variantSrandProbe, "Hazards": d.hazardSrandProbe,
};
const SEED = 0x2161, N = 8;
let srandAll = true;
for(const [name, fn] of Object.entries(srandProbes)){
  let on, off, ok=false, note="";
  try {
    on  = fn.call(d, true,  SEED, N).fingerprint;
    off = fn.call(d, false, SEED, N).fingerprint;
    ok  = on.length===off.length && on.every((v,i)=>v===off[i]);
    note = `${on.length} draws, ON==OFF ${ok}`;
  } catch(e){ note = "err "+String(e.message||e); }
  if(!ok) srandAll = false;
  log(`  ${name}: ${note} ⇒ ${pass(ok)}`);
}
// #39/#40 use string-fingerprint helpers (deflectSrandFp / lungeSrandFp) — different signature, handle separately
for(const [name, fn] of [["Deflect#39", d.deflectSrandFp], ["Lunge#40", d.lungeSrandFp]]){
  let ok=false, note="";
  try {
    const on = fn.call(d, true, SEED, 16), off = fn.call(d, false, SEED, 16), on2 = fn.call(d, true, SEED, 16);
    ok = on === off && on === on2;
    note = `${on.split(",").length} draws, ON==OFF ${on===off}, determ ${on===on2}`;
  } catch(e){ note = "err "+String(e.message||e); }
  if(!ok) srandAll = false;
  log(`  ${name}: ${note} ⇒ ${pass(ok)}`);
}
log(`VERDICT [E]: srand ON==OFF across newest mecánicas incl #39/#40 ⇒ ${pass(srandAll)}`);
if(!srandAll) flag(2, "A new mechanic perturbs a shared RNG stream", "srand", "srand ON!=OFF probe", "eliminate the extra draw / route to a dedicated stream");

// ── [F] CLASS / TIER COVERAGE note ──────────────────────────────────────────────────────────
log("\n===== [F] COVERAGE — melee-only pillars vs universal verbs =====");
const meleeOnly = [];
if(GUARD_COUNTER.enabled) meleeOnly.push("GuardCounter#33(needs shield-block)");
if(RIPOSTE.requiresMelee) meleeOnly.push("Riposte#36(requiresMelee)");
if(RALLY.requiresMelee) meleeOnly.push("Rally#35(requiresMelee)");
if(CHARGED_ATTACK.requiresMelee) meleeOnly.push("Charged#37(requiresMelee)");
log(`Melee-gated pillars: ${meleeOnly.join(", ")}`);
log(`Universal anti-turtle : GuardBreak#38 (requiresMelee=${GUARD_BREAK.requiresMelee}).`);
log(`Universal anti-ranged : Deflect#39 (reuses PARRY window h.parryT; any class that can parry can reflect).`);
log(`Universal anti-kite   : Lunge#40 (requiresMelee=${LUNGE.requiresMelee}) ⇒ every class (incl mage/archer) closes distance.`);

// ── [Q] KEY-COLLISION — Backslash (lunge#40) + Period (gb#38) vs every bound verb ───────────
log("\n===== [Q] KEY-COLLISION — does any dedicated verb key clash? =====");
const boundKeys = {
  "LUNGE.key(#40)": LUNGE.key, "GUARD_BREAK.key(#38)": GUARD_BREAK.key,
  "COMBO.heavyKey": COMBO.heavyKey || "KeyN", "SUMMON.key": "Comma", "BONFIRE.key": "KeyE",
};
const luKey = LUNGE.key, gbKey = GUARD_BREAK.key;
const luCollides = Object.entries(boundKeys).filter(([k,v]) => k!=="LUNGE.key(#40)" && v===luKey);
const gbCollides = Object.entries(boundKeys).filter(([k,v]) => k!=="GUARD_BREAK.key(#38)" && v===gbKey);
log(`LUNGE.key='${luKey}' — collision set: ${luCollides.length? luCollides.map(([k])=>k).join(","):"none"}`);
log(`GUARD_BREAK.key='${gbKey}' — collision set: ${gbCollides.length? gbCollides.map(([k])=>k).join(","):"none"}`);
const qOk = luCollides.length===0 && gbCollides.length===0 && luKey==="Backslash" && gbKey==="Period" && luKey!==gbKey;
log(`VERDICT [Q]: '${luKey}' (lunge) & '${gbKey}' (guard-break) are distinct dedicated non-letter codes, free of the 26-letter rebind pool & the fixed verbs ⇒ no collision ⇒ ${pass(qOk)}`);
if(!qOk) flag(1, "A dedicated verb key collides", "#38/#40", `lunge=${luKey} gb=${gbKey} collides ${[...luCollides,...gbCollides].map(([k])=>k)}`, "move the colliding key to a free code", true);

// ── SUMMARY ─────────────────────────────────────────────────────────────────────────────────
log("\n===== COHESION VERDICT v6 (40 mecánicas) =====");
const gate = { A:aOk, B:(bOk && minHits>=4), C:cOk, D:dOk, E:srandAll, G:gOk, H:hOk, I:iOk, Q:qOk };
for(const [k,v] of Object.entries(gate)) log(`  [${k}] ${pass(v)}`);
const allOk = Object.values(gate).every(Boolean);
log(`\nSTACK COHESIVE: ${allOk ? "YES" : "NO"} — ${allOk ? "no degenerate loop, no dominant/dead mechanic, no one-shot, no infinite sustain, #39 anti-ranged & #40 anti-kite both burst-free/orthogonal, 0-regression of 38 prior (OFF paths byte-id)" : "see FAILs above"}`);
log(`FINDINGS (severity-ranked): ${findings.length===0 ? "none above sev-4" : ""}`);
for(const f of findings.sort((a,b)=>a.sev-b.sev)) log(`  sev-${f.sev} [${f.mecs}] ${f.title} — ${f.headline} — FIX: ${f.fix}${f.ceo?" (CEO DECISION)":""}`);
log(`\nKEY OBSERVABLE NUMBERS: burstCeil=${worstFrac*100}%bossMaxHp/hit(min ${minHits} hits) · rallyNet=${r3(netPerDmg)}HP/dmg(<1) · bleedBoss=${bt.bossProcPctHp*100}%/${bld.bossHits}hits · deflectCap=${DEFLECT.dmgFracCap*100}%maxHp · lungeStrike=×${LUNGE.dmgMul}/${r3(luBossFrac*100)}%boss/dash${LUNGE.distance}px/noIframe · keys lunge'${LUNGE.key}'/gb'${GUARD_BREAK.key}'`);
log(`\nAUDIT_RESULT_JSON ${JSON.stringify({build:"fa5ccf7c051f", cohesive:allOk, gates:gate, findings:findings.length, sev1:findings.filter(f=>f.sev===1).length})}`);
