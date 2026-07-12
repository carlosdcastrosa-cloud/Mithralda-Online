// ---------------------------------------------------------------------------
// CAS-2188 — Cohesion & Balance Audit v7 (41 mecánicas). DRIVES the real sim loop via the dev
// probes (applyHeroMelee / hitEnemy / tickRally / tickCharge / guardBreakKick / deflectProbe /
// lungeProbe / secondWindProbe — the SAME code paths the served build runs), NOT a byte/md5 check.
// PORT of v6 (CAS-2161, 40 mec) re-pointed to the CURRENT live build 126fbb5fbf44/799 with mec #41
// SECOND_WIND / Segundo Aliento now FLIPPED LIVE (SECOND_WIND.enabled:true — CEO gate CAS-2165,
// QA-PASSED×2 CAS-2181/2182). New section [SW]. Adds gate [SW] to the summary.
//
// 🔑 v6→v7 DRIFT FIX (QA-tooling, sev-4 — NOT a gameplay regression):
//   v6 was authored against the pre-SECOND_WIND build fa5ccf7c051f. When SECOND_WIND went LIVE
//   (enabled:true), two v6 sub-probes started reporting SPURIOUS FAILs — [C] chargeIncomingCap
//   (dBase=0) and [H] deflect OFF-path (heroHpLoss=0). ROOT CAUSE (proven, tools/_dbg_seq2.mjs):
//   with SECOND_WIND live, the rally-CAP probe drives the SHARED audit hero to hp<=0, which now
//   fires the REAL deny path (damageHero L5657) and arms a 0.6s i-frame `h._secondWindIframeT` +
//   consumes `h._secondWindLeft`. Those two NEW transient hero fields LEAK into the next probes;
//   damageHero L5605 then short-circuits (`return false`) so later damageHero-driven probes read 0.
//   FIX is harness-side isolation — resetSW() clears the new transients between sub-probes, exactly
//   as the probes already reset h.iframe/h.stun/h.hp. sim.js is BYTE-IDENTICAL (d7b985b6) between the
//   DARK build (QA-PASSED CAS-2167) and current live, and neither drifted probe references SECOND_WIND
//   ⇒ the 2 FAILs are pure test-fixture contamination, 0-regression already established in CAS-2181.
//
// Served files BYTE-IDENTICAL to this working tree (md5 verified live: sim d7b985b6, config 249ed684,
// render 353e50da) ⇒ importing ../sim/sim.js exercises the LIVE production code paths byte-for-byte.
// config 249ed684 carries SECOND_WIND.enabled:true (the LIVE flip).
//
// Axes (all MEASURED via real probes, printed as OBSERVABLE numbers the QA report cites verbatim):
//   [A] REACTIVE-COUNTER MUTUAL-EXCLUSIVITY — gc/dc/charged never stack on one swing.
//   [B] BURST CEILING vs BOSS — riposte cap (≤25%) then charged cap (≤22%) clamp the FINAL hit.
//   [C] RALLY SUSTAIN LOOP — recoverFrac × healPerHitFrac < 1 ⇒ strictly net-loss (+ SW isolation).
//   [D] STATUS BUILDUP %HP vs HIGH-HP BOSS — bleed as chip, not degenerate anti-sponge.
//   [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) incl DEFLECT#39 + LUNGE#40 + SECOND_WIND#41.
//   [F] CLASS/TIER COVERAGE — melee-only pillars vs universal verbs.
//   [G] GUARD-BREAK #38 — anti-turtle offensive kick, burst-free & orthogonal.
//   [H] DEFLECT #39 — anti-ranged reflect: capped ≤15% maxHp, 0 self-dmg, once-per-window, OFF byte-id.
//   [I] LUNGE #40 — anti-kite gap-closer: no-iframe commit, capped, universal, OFF byte-id.
//   [SW] SECOND_WIND #41 (NEW) — clutch survival verb: a LETHAL result (hp<=0), not a specific hit,
//        is negated ONCE per charge (hp clamped to surviveHpFrac×maxHp), a radial nova pushes enemies
//        INSIDE novaRadius (creates space), i-frames arm to survive the same-tick multi-hit, the charge
//        is consumed (1/rest, no infinite immortality), and OFF ⇒ the hero dies (byte-id dead branch).
//        Proves clutch-survival WITHOUT infinite sustain or a new burst source.
//
// Run: node tools/cas2188-cohesion-audit.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_COUNTER, DODGE_COUNTER, RALLY, RIPOSTE, CHARGED_ATTACK, HYPERARMOR, GUARD_BREAK,
  DEFLECT, LUNGE, SECOND_WIND, STATUS_BUILDUP, TWO_HAND, WEAPON_ARCHETYPES, WEAPON_ARTS, WEAPON_BUFFS,
  COMBO, POISE, FRENZY, BACKSTAB } from "../sim/config.js";

const log = (m) => console.log(m);
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
const pass = (b) => b ? "PASS" : "**FAIL**";
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("AuditBot", "warrior");
const d = sim.dev;

// 🔑 v7 SW-ISOLATION HELPER — clears the two NEW transient hero fields SECOND_WIND arms on the SHARED
// audit hero (_secondWindIframeT i-frame + spent _secondWindLeft charge). ANY probe that drives the
// hero to hp<=0 (e.g. the rally-CAP probe) now fires the LIVE deny path and leaves a 0.6s i-frame that
// makes the NEXT damageHero-driven probe read 0. Call between such probes — same intent as the probes'
// own h.iframe=0 / h.stun=0 / h.hp=1e6 resets, just for the fields that didn't exist when v6 was written.
const resetSW = () => { const h = sim.G.hero; if(h){ h._secondWindIframeT = 0; h._secondWindLeft = SECOND_WIND.chargesPerRest; } };

const findings = [];   // {sev, title, mecs, headline, fix, ceo}
const flag = (sev, title, mecs, headline, fix, ceo=false) => findings.push({sev, title, mecs, headline, fix, ceo});

log(`\n########## CAS-2188 COHESION & BALANCE AUDIT v7 — 41 mecánicas · LIVE 126fbb5fbf44/799 ##########`);
log(`DEFLECT.enabled=${DEFLECT.enabled} (#39) · LUNGE.enabled=${LUNGE.enabled} (#40) · SECOND_WIND.enabled=${SECOND_WIND.enabled} (#41) — all LIVE · driving REAL sim loop (sim.js served==HEAD byte-id d7b985b6)`);

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
// 🔑 v7: rallyCapProbe just drove the hero to hp<=0 ⇒ with SECOND_WIND live it armed a leftover i-frame.
// Isolate it (mirror the probes' own iframe/stun resets) so the two damageHero-driven charge sub-probes
// below measure real incoming damage instead of an SW-negated 0. Proven fix (tools/_dbg_seq2.mjs).
resetSW();
const chIn = d.chargeIncomingCapProbe();
resetSW();
const chHA = d.chargeHyperArmorProbe();
const armRatio = rArm.pool / rArm.real;
const netPerDmg = RALLY.recoverFrac * RALLY.healPerHitFrac;
log(`Rally ARM: took ${rArm.real} dmg ⇒ pool ${rArm.pool} (=${r3(armRatio)}× ≈ recoverFrac ${RALLY.recoverFrac}); window ${rArm.rallyT}s ⇒ ${pass(rArm.ok)}`);
log(`Rally HEAL: one melee heals ${rHeal.healed} of pool 100 (=healPerHitFrac ${RALLY.healPerHitFrac}); AoE 2 mobs heals ONCE=${rHeal.onceOk} ⇒ ${pass(rHeal.ok)}`);
log(`Rally CAP: pool clamped to ${rCap.pool} = ${RALLY.capFracMaxHp*100}% HPmax ⇒ ${pass(rCap.ok)}; DECAY ${rDec.expectDrop}/0.5s + expiry→0 ⇒ ${pass(rDec.ok)}`);
log(`Charged windup: incoming per-hit capped to ${chIn.dCap} = ${CHARGED_ATTACK.incomingDmgCapFracMaxHp*100}% HPmax (base ${chIn.dBase}) ⇒ absorb≠immunity ${pass(chIn.ok)}; hyper-armor stun absorbed=${chHA.ok} [SW-isolated]`);
log(`NET SUSTAIN: recoverFrac ${RALLY.recoverFrac} × healPerHitFrac ${RALLY.healPerHitFrac} = ${r3(netPerDmg)} HP returned per 1 HP taken, per melee hit`);
const cOk = rArm.ok && rHeal.ok && rCap.ok && rDec.ok && chIn.ok && netPerDmg < 1;
log(`VERDICT [C]: ${r3(netPerDmg)} < 1 ⇒ every exchange is STRICTLY net-loss (plus decay if you don't hit) ⇒ NO infinite tank+regain ⇒ ${pass(cOk)}`);
if(netPerDmg >= 1) flag(1, "Rally out-heals incoming damage ⇒ infinite sustain", "#35/#37", `recoverFrac×healPerHitFrac=${netPerDmg}≥1`, "lower RALLY.healPerHitFrac or recoverFrac so product<<1", true);
if(!chIn.ok) flag(2, "Charged incoming-cap probe reads 0 ⇒ audit fixture drift", "#37", `dBase=${chIn.dBase} dCap=${chIn.dCap} (SW transient leaked?)`, "resetSW() before chargeIncomingCapProbe — harness isolation, not a game bug");

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
resetSW();   // isolate any leftover SW transient from prior damageHero-driven probes
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
log(`VERDICT [G]: kick drains poise (×${GUARD_BREAK.poiseMul}) & cracks shields to BREAK the turtle, ARMS (not auto-crits) Riposte's window, costs ${GUARD_BREAK.staminaCost} stam + ${GUARD_BREAK.recoverMs}ms recovery, deals only ${GUARD_BREAK.dmg} direct dmg ⇒ anti-turtle WITHOUT new burst; OFF byte-id ⇒ ${pass(gOk)}`);
if(!gbBurstFree) flag(2, "Guard-break adds a burst source", "#38", `direct dmg ${GUARD_BREAK.dmg} not utility-low`, "keep GUARD_BREAK.dmg low; burst must route through capped Riposte", true);

// ── [H] DEFLECT #39 — anti-ranged reflect (drives deflectProbe REAL) ─────────────────────────
log("\n===== [H] DEFLECT #39 (Reflejo de Proyectil) — anti-ranged verb; burst-free, no self-damage, capped? =====");
const dfOn  = d.deflectProbe({ enabled: true,  dmg: 40, targetHp: 500 });                 // normal reflect
const dfCap = d.deflectProbe({ enabled: true,  dmg: 100000, targetHp: 500 });             // huge dmg ⇒ cap must bite
// 🔑 v7: the OFF path is the drifted probe — it needs the hero to actually EAT the bolt (heroHpLoss>0).
// A leftover SW i-frame (from any prior hp<=0 probe) would negate that hit ⇒ spurious heroHpLoss=0.
// Isolate immediately before, exactly like the probes reset iframe. Proven fix (tools/_dbg_seq2.mjs).
resetSW();
const dfOff = d.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 });                 // OFF ⇒ hero eats it
log(`FLIP   : enemy bolt captured in parry window ⇒ ownerFlipped=${dfOn.ownerFlipped}, velReversed→shooter=${dfOn.velReversedAtFlip}; heroHpLoss=${dfOn.heroHpLoss} (0 self-dmg); shooterHpLoss=${dfOn.shooterHpLoss}; stam −${dfOn.stamSpent} (cfg ${DEFLECT.staminaCost})`);
log(`CAP    : dmg 100000 on a ${500} maxHp shooter ⇒ reflectedRaw=${dfCap.reflectedRaw} == cap ${dfCap.capValue} (=${DEFLECT.dmgFracCap*100}% maxHp), capHit=${dfCap.capHit}; shooterHpLoss=${dfCap.shooterHpLoss} ⇒ never one-shot`);
log(`WINDOW : requiresParryWindow=${DEFLECT.requiresParryWindow}, oncePerWindow=${DEFLECT.oncePerWindow} ⇒ parryT consumed after=${dfOn.parryTAfter}s (tempo-gate, not passive shield)`);
log(`OFF    : enabled=false ⇒ NOT flipped=${!dfOff.ownerFlipped}, hero EATS bolt heroHpLoss=${dfOff.heroHpLoss}>0, stam ${dfOff.stamSpent}=0 ⇒ byte-id dead branch [SW-isolated]`);
const hFlip = dfOn.ownerFlipped && dfOn.velReversedAtFlip && dfOn.heroHpLoss === 0 && dfOn.shooterHpLoss > 0 && dfOn.stamSpent === DEFLECT.staminaCost;
const hCap  = dfCap.capHit && Math.abs(dfCap.reflectedRaw - dfCap.capValue) < 0.5 && dfCap.shooterHpLoss <= Math.ceil(DEFLECT.dmgFracCap*500)+1;
const hWin  = dfOn.parryTAfter === 0 && DEFLECT.requiresParryWindow && DEFLECT.oncePerWindow;
const hOff  = !dfOff.ownerFlipped && dfOff.heroHpLoss > 0 && dfOff.stamSpent === 0;
const hOk = hFlip && hCap && hWin && hOff;
log(`VERDICT [H]: enemy projectile flips owner + reverses toward the shooter, reflected dmg CAPPED ≤${DEFLECT.dmgFracCap*100}% target maxHp, hero takes 0 self-dmg, once-per-window tempo-gated, OFF byte-id ⇒ anti-ranged WITHOUT new burst ⇒ ${pass(hOk)}`);
if(!hFlip) flag(2, "Deflect self-damages or fails to flip owner", "#39", `heroHpLoss=${dfOn.heroHpLoss} flipped=${dfOn.ownerFlipped}`, "verify deflectProjectile sets proj.enemy=false + reverses vx before it can hit hero");
if(!hCap)  flag(1, "Deflect reflected damage not capped ⇒ one-shot vector", "#39", `reflectedRaw=${dfCap.reflectedRaw} cap=${dfCap.capValue}`, "reassert dmgFracCap clamp in reflect path", true);
if(!hOff)  flag(2, "Deflect OFF path reads 0 hero dmg ⇒ audit fixture drift", "#39", `dfOff heroHpLoss=${dfOff.heroHpLoss} (SW transient leaked?)`, "resetSW() before the OFF deflectProbe — harness isolation, not a game bug");

// ── [I] LUNGE #40 — anti-kite gap-closer (drives lungeProbe REAL) ────────────────────────────
log("\n===== [I] LUNGE #40 (Estocada de Avance) — anti-kite gap-closer; no-iframe commit, capped, universal? =====");
resetSW();
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

// ── [SW] SECOND_WIND #41 — clutch survival verb (NEW; drives secondWindProbe REAL) ───────────
log("\n===== [SW] SECOND_WIND #41 (Segundo Aliento) — clutch-survival verb; 1-use, no infinite immortality, no new burst? =====");
resetSW();
const swOn  = d.secondWindProbe({ enabled: true });                       // deny lethal + nova
const swIf  = d.secondWindProbe({ enabled: true, probeIframe: true });    // i-frame ignores a 2nd same-tick lethal hit
const swNoC = d.secondWindProbe({ enabled: true, probeNoCharge: true });  // 0 charge ⇒ dies
const swOff = d.secondWindProbe({ enabled: false });                      // OFF ⇒ dies (byte-id dead branch)
log(`DENY   : lethal hp<=0 negated ⇒ survived=${swOn.survived}, hpAfter=${swOn.hpAfter} == ceil(maxHp ${swOn.maxHp} × ${SECOND_WIND.surviveHpFrac}) ${swOn.hpExpected}; damageHero returned ${swOn.landedReturn} (true=hit LANDED, death separately negated)`);
log(`CHARGE : consumed 1/rest ⇒ before ${swOn.chargeBefore} → after ${swOn.chargeAfter} (cfg chargesPerRest ${SECOND_WIND.chargesPerRest}); i-frame armed=${swOn.iframeArmed} (${swOn.iframeT}s == ${SECOND_WIND.iframesMs}ms)`);
log(`NOVA   : enemy INSIDE r${SECOND_WIND.novaRadius} pushed=${swOn.novaInPushed} (Δ${swOn.novaInDisp}px moved-out=${swOn.novaInMovedOut}); enemy OUTSIDE pushed=${swOn.novaOutPushed} (Δ${swOn.novaOutDisp}px) ⇒ radius-gated space-maker; VFX floater=${swOn.floated}`);
log(`IFRAME : a 2nd lethal hit while SW i-frame live is IGNORED=${swIf.iframeIgnoresHit} ⇒ survives the same-tick multi-hit (mercy iframe isolated)`);
log(`1-USE  : with 0 charge the lethal hit is NOT denied ⇒ noChargeDies=${swNoC.noChargeDies} ⇒ NOT infinite immortality`);
log(`OFF    : SECOND_WIND.enabled=false ⇒ deny branch skipped ⇒ survived=${swOff.survived} (hero DIES) ⇒ byte-id dead branch`);
// deny is proven by survival + hp clamped to surviveHpFrac×maxHp. NOTE damageHero returns TRUE (the hit
// LANDED and dealt damage); SECOND_WIND negates the DEATH separately (heroDie in update), not the hit ⇒
// landedReturn is deliberately NOT part of the deny assertion (asserting ===false was a v7 authoring bug).
const swDeny   = swOn.survived && swOn.hpAfter === swOn.hpExpected;
const swCharge = swOn.chargeBefore === SECOND_WIND.chargesPerRest && swOn.chargeAfter === swOn.chargeBefore - 1 && swOn.iframeArmed;
const swNova   = swOn.novaInPushed && swOn.novaInMovedOut && !swOn.novaOutPushed;   // in-radius pushed, out-radius untouched
const swIframe = swIf.iframeIgnoresHit === true;
const swOnce   = swNoC.noChargeDies === true;
const swOffOk  = swOff.survived === false;
const swBurstFree = SECOND_WIND.novaPoiseDmg === 0;                                 // nova repositions; grants no free stagger/burst
const swOk = swDeny && swCharge && swNova && swIframe && swOnce && swOffOk && swBurstFree;
log(`VERDICT [SW]: a LETHAL RESULT is negated ONCE/charge (hp→${SECOND_WIND.surviveHpFrac*100}% maxHp) with a radius-gated push-nova + brief i-frame, the charge is consumed (0-charge ⇒ dies), nova deals ${SECOND_WIND.novaPoiseDmg} poise (repositions, no free burst), OFF ⇒ hero dies (byte-id) ⇒ clutch-survival WITHOUT infinite sustain/one-shot ⇒ ${pass(swOk)}`);
if(!swDeny)   flag(1, "SECOND_WIND does not clamp survival / negates the wrong thing", "#41", `survived=${swOn.survived} hpAfter=${swOn.hpAfter}≠${swOn.hpExpected}`, "verify deny clamps hp to surviveHpFrac×maxHp AFTER hp-=real, BEFORE the death-check", true);
if(!swOnce)   flag(1, "SECOND_WIND lacks a charge gate ⇒ infinite immortality", "#41", `noChargeDies=${swNoC.noChargeDies}`, "require _secondWindLeft>0; consume it on deny; rearm only at beginRun/bonfire", true);
if(!swOffOk)  flag(1, "SECOND_WIND OFF path not byte-id ⇒ regresses prior", "#41", `swOff survived=${swOff.survived}`, "reassert enabled:false ⇒ deny branch skipped ⇒ hero dies", true);
if(!swBurstFree) flag(2, "SECOND_WIND nova adds a free burst/stagger source", "#41", `novaPoiseDmg=${SECOND_WIND.novaPoiseDmg}`, "keep novaPoiseDmg=0; the nova is a repositioner, not a damage/stagger verb", true);
resetSW();   // clear the deny-armed transient before the srand sweep

// ── [E] RNG-NEUTRALITY sweep — srand ON==OFF for the newest mecánicas incl #39/#40/#41 ────────
log("\n===== [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) for the newest mecánicas =====");
const srandProbes = {
  "GuardCounter#33": d.guardCounterSrandProbe, "DodgeCounter#34": d.dodgeCounterSrandProbe,
  "Rally#35": d.rallySrandProbe, "Riposte#36": d.riposteSrandProbe, "Charged#37": d.chargeSrandProbe,
  "GuardBreak#38": d.guardBreakSrandProbe,
  "Variants": d.variantSrandProbe, "Hazards": d.hazardSrandProbe,
};
const SEED = 0x2188, N = 8;
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
// #39/#40/#41 use string-fingerprint helpers (deflectSrandFp / lungeSrandFp / secondWindSrandFp) — handle separately
for(const [name, fn] of [["Deflect#39", d.deflectSrandFp], ["Lunge#40", d.lungeSrandFp], ["SecondWind#41", d.secondWindSrandFp]]){
  let ok=false, note="";
  try {
    const on = fn.call(d, true, SEED, 16), off = fn.call(d, false, SEED, 16), on2 = fn.call(d, true, SEED, 16);
    ok = on === off && on === on2;
    note = `${on.split(",").length} draws, ON==OFF ${on===off}, determ ${on===on2}`;
  } catch(e){ note = "err "+String(e.message||e); }
  if(!ok) srandAll = false;
  log(`  ${name}: ${note} ⇒ ${pass(ok)}`);
}
log(`VERDICT [E]: srand ON==OFF across newest mecánicas incl #39/#40/#41 ⇒ ${pass(srandAll)}`);
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
log(`Universal clutch-save : SecondWind#41 (AUTOMATIC on lethal result, no key, every class) ⇒ 1/rest survival net.`);

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
log(`SECOND_WIND#41: AUTOMATIC (no dedicated key — fires on lethal result) ⇒ 0 key-collision surface.`);
const qOk = luCollides.length===0 && gbCollides.length===0 && luKey==="Backslash" && gbKey==="Period" && luKey!==gbKey;
log(`VERDICT [Q]: '${luKey}' (lunge) & '${gbKey}' (guard-break) are distinct dedicated non-letter codes, free of the 26-letter rebind pool & the fixed verbs; SecondWind is keyless ⇒ no collision ⇒ ${pass(qOk)}`);
if(!qOk) flag(1, "A dedicated verb key collides", "#38/#40", `lunge=${luKey} gb=${gbKey} collides ${[...luCollides,...gbCollides].map(([k])=>k)}`, "move the colliding key to a free code", true);

// ── SUMMARY ─────────────────────────────────────────────────────────────────────────────────
log("\n===== COHESION VERDICT v7 (41 mecánicas) =====");
const gate = { A:aOk, B:(bOk && minHits>=4), C:cOk, D:dOk, E:srandAll, G:gOk, H:hOk, I:iOk, SW:swOk, Q:qOk };
for(const [k,v] of Object.entries(gate)) log(`  [${k}] ${pass(v)}`);
const allOk = Object.values(gate).every(Boolean);
log(`\nSTACK COHESIVE: ${allOk ? "YES" : "NO"} — ${allOk ? "no degenerate loop, no dominant/dead mechanic, no one-shot, no infinite sustain; #39 anti-ranged / #40 anti-kite / #41 clutch-survival all burst-free & orthogonal, 0-regression of 40 prior (OFF paths byte-id)" : "see FAILs above"}`);
log(`FINDINGS (severity-ranked): ${findings.length===0 ? "none above sev-4" : ""}`);
for(const f of findings.sort((a,b)=>a.sev-b.sev)) log(`  sev-${f.sev} [${f.mecs}] ${f.title} — ${f.headline} — FIX: ${f.fix}${f.ceo?" (CEO DECISION)":""}`);
log(`\nKEY OBSERVABLE NUMBERS: burstCeil=${worstFrac*100}%bossMaxHp/hit(min ${minHits} hits) · rallyNet=${r3(netPerDmg)}HP/dmg(<1) · bleedBoss=${bt.bossProcPctHp*100}%/${bld.bossHits}hits · deflectCap=${DEFLECT.dmgFracCap*100}%maxHp · lungeStrike=×${LUNGE.dmgMul}/${r3(luBossFrac*100)}%boss/noIframe · secondWind=survive@${SECOND_WIND.surviveHpFrac*100}%maxHp/1-use/nova r${SECOND_WIND.novaRadius}/iframe${SECOND_WIND.iframesMs}ms`);
log(`\nAUDIT_RESULT_JSON ${JSON.stringify({build:"126fbb5fbf44", cohesive:allOk, gates:gate, findings:findings.length, sev1:findings.filter(f=>f.sev===1).length})}`);
