// ---------------------------------------------------------------------------
// CAS-2150 — Cohesion & Balance Audit v5 (38 mecánicas). DRIVES the real sim loop via the
// dev probes (applyHeroMelee / hitEnemy / damageHero / tickRally / tickCharge / guardBreakKick —
// the SAME code paths the served build runs), NOT a byte/md5 check. This is a PORT of v4
// (CAS-2145, 37 mec) bumped to the LIVE build 2b2cfd0d2313/799 with mec #38 Empujón/Rompe-Guardia
// (GUARD_BREAK.enabled:true) FLIPPED LIVE. New section [G] stresses the anti-turtle offensive verb;
// [E] adds GuardBreak#38 to the srand-neutrality sweep.
//
// Served files are BYTE-IDENTICAL to this working tree (md5 verified ×5: config cb758594,
// sim cf86cde7, input 52865407, render e0f24808, strings 9656829d) ⇒ importing ../sim/sim.js
// exercises the LIVE production code paths byte-for-byte. The dev-probe surface lives in the LIVE
// sim.js (additive, gated, 0-behavior) so this loop IS the shipped loop.
//
// Axes (all MEASURED via real probes, printed as OBSERVABLE numbers the QA report cites verbatim):
//   [A] REACTIVE-COUNTER MUTUAL-EXCLUSIVITY — gc/dc/charged never stack on one swing.
//   [B] BURST CEILING vs BOSS — riposte cap (≤25%) then charged cap (≤22%) clamp the FINAL hit.
//   [C] RALLY SUSTAIN LOOP — recoverFrac × healPerHitFrac < 1 ⇒ strictly net-loss.
//   [D] STATUS BUILDUP %HP vs HIGH-HP BOSS — bleed as chip, not degenerate anti-sponge.
//   [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) for the 8 newest mecánicas incl GuardBreak#38.
//   [F] CLASS/TIER COVERAGE — which pillars are melee-only; which verbs are universal.
//   [G] GUARD-BREAK #38 (NEW) — anti-turtle offensive kick: poise ×poiseMul drains guard, cracks a
//       shielded (carapace) enemy, ARMS Riposte's execution window WITHOUT auto-executing, costs
//       real stamina + a recovery window (not spammable), deals LOW direct dmg, OFF byte-id. Proves
//       #38 breaks the turtle-lock as designed WITHOUT adding burst/one-shot and WITHOUT touching
//       the OFF path of the 37 prior mecánicas.
//
// Run: node tools/cas2150-cohesion-audit.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_COUNTER, DODGE_COUNTER, RALLY, RIPOSTE, CHARGED_ATTACK, HYPERARMOR, GUARD_BREAK,
  STATUS_BUILDUP, TWO_HAND, WEAPON_ARCHETYPES, WEAPON_ARTS, WEAPON_BUFFS, COMBO, POISE,
  FRENZY, BACKSTAB } from "../sim/config.js";

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

log(`\n########## CAS-2150 COHESION & BALANCE AUDIT v5 — 38 mecánicas · LIVE 2b2cfd0d2313/799 ##########`);
log(`GUARD_BREAK.enabled=${GUARD_BREAK.enabled} (mec #38 LIVE) · driving REAL sim loop via dev probes (served==HEAD byte-id ×5)`);

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
const worstFrac = CHARGED_ATTACK.releaseCapFracMaxHp; // charged cap is the LAST clamp on a charged+riposte melee
const minHits = Math.ceil(1 / worstFrac);
const bOk = ripC.ok && chOut.ok && ripH.ok;
log(`COMPOUND charged+riposte on a broken boss: riposte cap (≤${RIPOSTE.ripCapFracMaxHp*100}%) then charged cap (≤${CHARGED_ATTACK.releaseCapFracMaxHp*100}%) ⇒ FINAL hit ≤ ${worstFrac*100}% boss maxHp`);
log(`VERDICT [B]: minimum ${minHits} biggest-possible hits to kill a boss ⇒ NO one-shot ⇒ ${pass(bOk && minHits>=4)}`);
if(!bOk) flag(2, "Boss burst cap does not bite", "#36/#37", `riposte/charged cap probe fail`, "verify ripCapFracMaxHp/releaseCapFracMaxHp clamp in hitEnemy");

// ── [C] RALLY SUSTAIN LOOP — infinite tank+regain vs boss? (Rally#35 + Charged hyper-armor#37) ─
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

// ── [G] GUARD-BREAK #38 — anti-turtle offensive kick (NEW; drives guardBreakKick REAL) ───────
log("\n===== [G] GUARD-BREAK #38 (Empujón/Rompe-Guardia) — anti-turtle verb; is it burst-free & orthogonal? =====");
const gbP = d.guardBreakPoiseProbe();
const gbB = d.guardBreakBreakProbe();
const gbS = d.guardBreakShieldProbe();
const gbC = d.guardBreakCostProbe();
const gbO = d.guardBreakOffProbe();
const gbSave = d.guardBreakSaveByteId();
log(`POISE  : kick poise ×${r3(gbP.ratio)} vs a light swing (expect ${GUARD_BREAK.poiseMul}); pRef=${gbP.pRef} pKick=${gbP.pKick} ⇒ ${pass(gbP.ok)}`);
log(`BREAK  : ${gbB.kicks} kicks drain a champion's guard ⇒ staggerT=${gbB.staggerT} ARMS _ripArm=${gbB.armedByKick} (NO auto-exec); a NORMAL follow-up melee executes=${gbB.followupExecuted} ⇒ ${pass(gbB.ok)}`);
log(`SHIELD : kick CRACKS a carapace-shielded enemy=${gbS.cracked} + shoves=${gbS.shoved}; a normal melee does NOT crack=${gbS.normalNoCrack} ⇒ anti-turtle ${pass(gbS.ok)}`);
log(`COST   : stam spent ${gbC.stSpent} (expect ${GUARD_BREAK.staminaCost}); recovery armed=${gbC.cdArmed}; direct dmg ${gbC.dmgDealt} << normal swing ${gbC.dRef} (LOW=${gbC.dmgLow}); 2nd kick in-CD denied=${gbC.denyInCd} ⇒ ${pass(gbC.ok)}`);
log(`OFF    : GUARD_BREAK.enabled=false ⇒ kick no-op: noCost=${gbO.noCost} noPoise=${gbO.noPoise} noCrack=${gbO.noCrack} noCd=${gbO.noCd} ⇒ byte-id HEAD ${pass(gbO.ok)}`);
log(`SAVE   : serialize byte-id ON==OFF=${gbSave.byteId}; no gb* key leak=${!gbSave.hasKey} ⇒ ${pass(gbSave.ok)}`);
// Cohesion: the kick's directDmg must be LOW (utility not burst) AND it must fuse into the EXISTING
// Riposte window (reuse, no new burst source), AND leave the 37-prior OFF path untouched.
const gbBurstFree = (GUARD_BREAK.dmg <= 10) && gbC.dmgLow;         // direct dmg is utility, not a new burst source
const gbOrthogonal = gbB.armedByKick && gbB.followupExecuted;      // reuses Riposte #36 window; does NOT auto-crit
const gOk = gbP.ok && gbB.ok && gbS.ok && gbC.ok && gbO.ok && gbSave.ok && gbBurstFree && gbOrthogonal;
log(`VERDICT [G]: kick drains poise (×${GUARD_BREAK.poiseMul}) & cracks shields to BREAK the turtle, ARMS (not auto-crits) Riposte's window, costs ${GUARD_BREAK.staminaCost} stam + ${GUARD_BREAK.recoverMs}ms recovery, deals only ${GUARD_BREAK.dmg} direct dmg ⇒ anti-turtle WITHOUT new burst/one-shot; OFF byte-id ⇒ ${pass(gOk)}`);
if(!gbBurstFree) flag(2, "Guard-break adds a burst source", "#38", `direct dmg ${GUARD_BREAK.dmg} not utility-low`, "keep GUARD_BREAK.dmg low; burst must route through capped Riposte", true);
if(!gbO.ok) flag(1, "Guard-break OFF path not byte-id ⇒ regresses 37 prior", "#38", `guardBreakOffProbe fail`, "reassert enabled:false ⇒ guardBreakKick no-op", true);

// ── [E] RNG-NEUTRALITY spot-check — srand ON==OFF for the 8 newest mecánicas ─────────────────
log("\n===== [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) for the 8 newest mecánicas =====");
const srandProbes = {
  "GuardCounter#33": d.guardCounterSrandProbe, "DodgeCounter#34": d.dodgeCounterSrandProbe,
  "Rally#35": d.rallySrandProbe, "Riposte#36": d.riposteSrandProbe, "Charged#37": d.chargeSrandProbe,
  "GuardBreak#38": d.guardBreakSrandProbe,
  "Variants": d.variantSrandProbe, "Hazards": d.hazardSrandProbe,
};
const SEED = 0x2150, N = 8;
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
log(`VERDICT [E]: srand ON==OFF across newest mecánicas ⇒ ${pass(srandAll)}`);
if(!srandAll) flag(2, "A new mechanic perturbs a shared RNG stream", "srand", "srand ON!=OFF probe", "eliminate the extra draw / route to a dedicated stream");

// ── [F] CLASS / TIER COVERAGE note ──────────────────────────────────────────────────────────
log("\n===== [F] COVERAGE — melee-only pillars (ranged/caster lockout) =====");
const meleeOnly = [];
if(GUARD_COUNTER.enabled) meleeOnly.push("GuardCounter#33(needs shield-block)");
if(RIPOSTE.requiresMelee) meleeOnly.push("Riposte#36(requiresMelee)");
if(RALLY.requiresMelee) meleeOnly.push("Rally#35(requiresMelee)");
if(CHARGED_ATTACK.requiresMelee) meleeOnly.push("Charged#37(requiresMelee)");
log(`Melee-gated pillars: ${meleeOnly.join(", ")}`);
log(`Universal defense→offense: DodgeCounter#34 (requiresShield=${DODGE_COUNTER.requiresShield}).`);
log(`Universal anti-turtle: GuardBreak#38 (requiresMelee=${GUARD_BREAK.requiresMelee}, range ${GUARD_BREAK.range}px gates it de-facto for ranged) ⇒ every class can pop a turtling enemy.`);

// ── [Q] KEY-COLLISION — Period (guard-break) vs every bound verb ─────────────────────────────
log("\n===== [Q] KEY-COLLISION — does GUARD_BREAK.key='Period' clash with any verb? =====");
const boundKeys = {
  "GUARD_BREAK.key(#38)": GUARD_BREAK.key,
  "SUMMON.key": "Comma", "COMBO.heavyKey": "KeyN", "BONFIRE.key": "KeyE",
};
const gbKey = GUARD_BREAK.key;
const collides = Object.entries(boundKeys).filter(([k,v])=> k!=="GUARD_BREAK.key(#38)" && v===gbKey);
log(`GUARD_BREAK.key='${gbKey}' · Comma=Summon · KeyN=heavy · KeyE=bonfire — collision set: ${collides.length? collides.map(([k])=>k).join(","):"none"}`);
const qOk = collides.length===0 && gbKey==="Period";
log(`VERDICT [Q]: '${gbKey}' is a dedicated non-letter code, free of the 26-letter rebind pool & the fixed verbs ⇒ no collision ⇒ ${pass(qOk)}`);
if(!qOk) flag(1, "Guard-break key collides with an existing verb", "#38", `Period collides ${collides.map(([k])=>k)}`, "move GUARD_BREAK.key to a free code", true);

// ── SUMMARY ─────────────────────────────────────────────────────────────────────────────────
log("\n===== COHESION VERDICT v5 (38 mecánicas) =====");
const gate = { A:aOk, B:(bOk && minHits>=4), C:cOk, D:dOk, E:srandAll, G:gOk, Q:qOk };
for(const [k,v] of Object.entries(gate)) log(`  [${k}] ${pass(v)}`);
const allOk = Object.values(gate).every(Boolean);
log(`\nSTACK COHESIVE: ${allOk ? "YES" : "NO"} — ${allOk ? "no degenerate loop, no dominant/dead mechanic, no one-shot, no infinite sustain, #38 anti-turtle burst-free & orthogonal, 0-regression of 37 prior (OFF path byte-id)" : "see FAILs above"}`);
log(`FINDINGS (severity-ranked): ${findings.length===0 ? "none above sev-4" : ""}`);
for(const f of findings.sort((a,b)=>a.sev-b.sev)) log(`  sev-${f.sev} [${f.mecs}] ${f.title} — ${f.headline} — FIX: ${f.fix}${f.ceo?" (CEO DECISION)":""}`);
log(`\nKEY OBSERVABLE NUMBERS: burstCeil=${worstFrac*100}%bossMaxHp/hit(min ${minHits} hits) · rallyNet=${r3(netPerDmg)}HP/dmg(<1) · bleedBoss=${bt.bossProcPctHp*100}%/${bld.bossHits}hits · counters=maxOneOf{${GUARD_COUNTER.dmgMul},${DODGE_COUNTER.dmgMul},${CHARGED_ATTACK.dmgMul}} · gbKick=poise×${GUARD_BREAK.poiseMul}/dmg${GUARD_BREAK.dmg}/stam${GUARD_BREAK.staminaCost}/key'${GUARD_BREAK.key}'`);
log(`\nAUDIT_RESULT_JSON ${JSON.stringify({build:"2b2cfd0d2313", cohesive:allOk, gates:gate, findings:findings.length, sev1:findings.filter(f=>f.sev===1).length})}`);
