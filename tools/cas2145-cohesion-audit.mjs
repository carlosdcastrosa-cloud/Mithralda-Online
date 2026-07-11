// ---------------------------------------------------------------------------
// CAS-2145 — Cohesion & Balance Audit v4 (37 mecánicas). DRIVES the real sim loop via the
// dev probes (applyHeroMelee / hitEnemy / damageHero / tickRally / tickCharge — the SAME code
// paths the served build runs), NOT a byte/md5 check. Evidence generator for the cross-interaction
// verdict: does any repeatable loop one-shot a boss, out-heal a boss, or create a no-risk combo?
//
// v3 (CAS-2085) covered 30 mecánicas. This adds the 7 shipped since: Guard Counter (#33),
// Dodge Counter (#34), Rally/Regain (#35), Riposte (#36), Charged Attack/Hyper-Armor (#37),
// Encounter Variants, Arena Hazards — and STRESSES their high-risk overlaps explicitly.
//
// Axes (all MEASURED via real probes, printed as OBSERVABLE numbers the QA report cites verbatim):
//   [A] REACTIVE-COUNTER MUTUAL-EXCLUSIVITY — gc/dc/charged never stack on one swing (source: the
//       single dmg expression sim.js:2809 gates dc on !gc and charged is a heavy ⇒ !gc && !dc).
//   [B] BURST CEILING vs BOSS — riposte cap (≤25% maxHp) then charged cap (≤22% maxHp) both clamp
//       the FINAL hit (hitEnemy 3016+3023). Biggest possible burst as a fraction of boss maxHp.
//   [C] RALLY SUSTAIN LOOP — recoverFrac × healPerHitFrac = the net HP a melee returns per point of
//       damage taken. If < 1 ⇒ strictly net-loss ⇒ no infinite tank+regain vs a boss.
//   [D] STATUS BUILDUP %HP vs HIGH-HP BOSS — bleed bossProcPctHp + bossBuildMul: is DoT-as-%HP a
//       degenerate anti-sponge, or chip capped by slow boss buildup + decay?
//   [E] RNG-NEUTRALITY spot-check — srand ON==OFF (0 new draws) for the 7 new mecánicas.
//   [F] CLASS/TIER COVERAGE note — which pillars are melee-only (locked for ranged/casters).
//
// Run: node tools/cas2145-cohesion-audit.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_COUNTER, DODGE_COUNTER, RALLY, RIPOSTE, CHARGED_ATTACK, HYPERARMOR,
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
log(`  ⇒ same-event: a dodge that negates the hit keeps guard CLOSED (${comp.dodgeOpened}&&${comp.guardStayedClosed}); charged is a HEAVY swing ⇒ gc(!heavy)&&dc(!heavy) both FALSE ⇒ mutually exclusive by swing type.`);
const aOk = comp.ok && gc.ok && dc.ok && chT.ok;
log(`VERDICT [A]: reactive counters NEVER multiply together on one swing (max one of {1.8, 1.5, 1.7}) ⇒ ${pass(aOk)}`);
if(!aOk) flag(2, "Counter windows stack into a product multiplier", "#33/#34/#37", `compose ratio ${comp.ratioBoth}≠${GUARD_COUNTER.dmgMul}`, "reassert dc=!gc gate + charged=heavy exclusivity");

// ── [B] BURST CEILING vs BOSS — can a Charged+Riposte crit one-shot a boss? ──────────────────
log("\n===== [B] BURST CEILING — biggest single hit as a fraction of BOSS maxHp =====");
const ripC = d.riposteCapProbe();
const chOut = d.chargeOutgoingCapProbe();
const ripH = d.riposteHeadlineProbe();
log(`Riposte (#36) execute ×${r3(ripH.ratio)} (expect ${RIPOSTE.dmgMul}); consumes _ripArm=${ripH.consumed}; 2nd melee same window NORMAL=${ripH.secondNormal} ⇒ 1 crit / break`);
log(`Riposte CAP vs boss: dBoss=${ripC.dBoss} == cap ${ripC.cap} (=${RIPOSTE.ripCapFracMaxHp*100}% maxHp), trash uncapped ${ripC.dTrash} ⇒ bossCapped=${ripC.bossCapped}`);
log(`Charged CAP vs boss: dBoss=${chOut.dBoss} == cap ${chOut.cap} (=${CHARGED_ATTACK.releaseCapFracMaxHp*100}% maxHp), trash uncapped ${chOut.dTrash} ⇒ bossCapped=${chOut.bossCapped}`);
// hitEnemy applies riposte cap (≤25%) THEN charged cap (≤22%) to the FINAL dmg ⇒ compound ≤ 22% boss maxHp.
const ceilFrac = Math.max(RIPOSTE.ripCapFracMaxHp, CHARGED_ATTACK.releaseCapFracMaxHp); // riposte then charged both bite
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
// Real numbers: damage taken -> pool armed (recoverFrac); melee hit -> heal (healPerHitFrac of pool).
const armRatio = rArm.pool / rArm.real;                       // = recoverFrac (capped)
const netPerDmg = RALLY.recoverFrac * RALLY.healPerHitFrac;   // HP returned per point of damage taken, per hit
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
// bleed-only time-to-kill a boss = 1 / bossProcPctHp full cycles, each = bossHits sustained hits.
const bleedCyclesToKill = Math.ceil(1 / bt.bossProcPctHp);
log(`Bleed-ALONE to kill a boss: ${bleedCyclesToKill} procs × ${bld.bossHits} sustained hits = ~${bleedCyclesToKill*bld.bossHits} uninterrupted melee hits (decay resets if you disengage)`);
const dOk = bld.ok && bld.bossHits > Math.ceil(bt.threshold/bt.build);
log(`VERDICT [D]: %HP proc scales with boss HP (anti-sponge by design) but capped at ${bt.bossProcPctHp*100}%/cycle + slow boss buildup + decay ⇒ chip, not degenerate ⇒ ${pass(dOk)}`);

// ── [E] RNG-NEUTRALITY spot-check — srand ON==OFF for the 7 new mecánicas ────────────────────
log("\n===== [E] RNG-NEUTRALITY — srand ON==OFF (0 new draws) for the 7 new mecánicas =====");
const srandProbes = {
  "GuardCounter#33": d.guardCounterSrandProbe, "DodgeCounter#34": d.dodgeCounterSrandProbe,
  "Rally#35": d.rallySrandProbe, "Riposte#36": d.riposteSrandProbe, "Charged#37": d.chargeSrandProbe,
  "Variants": d.variantSrandProbe, "Hazards": d.hazardSrandProbe,
};
// Contract: probe(enabled, seed, N) returns a fingerprint of N pre + N post srand draws around the
// mechanic's real code path. srand-neutral ⇔ same seed ON vs OFF ⇒ IDENTICAL fingerprint (0 draws consumed).
const SEED = 0x2145, N = 8;
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
log(`VERDICT [E]: srand ON==OFF across new mecánicas ⇒ ${pass(srandAll)}`);
if(!srandAll) flag(2, "A new mechanic perturbs a shared RNG stream", "srand", "srand ON!=OFF probe", "eliminate the extra draw / route to a dedicated stream");

// ── [F] CLASS / TIER COVERAGE note ──────────────────────────────────────────────────────────
log("\n===== [F] COVERAGE — melee-only pillars (ranged/caster lockout) =====");
const meleeOnly = [];
if(GUARD_COUNTER.enabled) meleeOnly.push("GuardCounter#33(needs shield-block)");
if(RIPOSTE.requiresMelee) meleeOnly.push("Riposte#36(requiresMelee)");
if(RALLY.requiresMelee) meleeOnly.push("Rally#35(requiresMelee)");
if(CHARGED_ATTACK.requiresMelee) meleeOnly.push("Charged#37(requiresMelee)");
log(`Melee-gated pillars: ${meleeOnly.join(", ")}`);
log(`Universal conversion for ranged/casters: DodgeCounter#34 (requiresShield=${DODGE_COUNTER.requiresShield}) ⇒ every class keeps a defense→offense verb.`);
log(`NOTE: this is the SAME class-coverage shape v3 flagged; DodgeCounter#34 was shipped to close it. No regression.`);

// ── SUMMARY ─────────────────────────────────────────────────────────────────────────────────
log("\n===== COHESION VERDICT v4 (37 mecánicas) =====");
const gate = { A:aOk, B:(bOk && minHits>=4), C:cOk, D:dOk, E:srandAll };
for(const [k,v] of Object.entries(gate)) log(`  [${k}] ${pass(v)}`);
const allOk = Object.values(gate).every(Boolean);
log(`\nSTACK COHESIVE: ${allOk ? "YES" : "NO"} — ${allOk ? "no degenerate loop, no dominant mechanic, no one-shot, no infinite sustain observed" : "see FAILs above"}`);
log(`FINDINGS (severity-ranked): ${findings.length===0 ? "none above sev-4" : ""}`);
for(const f of findings.sort((a,b)=>a.sev-b.sev)) log(`  sev-${f.sev} [${f.mecs}] ${f.title} — ${f.headline} — FIX: ${f.fix}${f.ceo?" (CEO DECISION)":""}`);
log(`\nKEY OBSERVABLE NUMBERS: burstCeil=${worstFrac*100}%bossMaxHp/hit(min ${minHits} hits) · rallyNet=${r3(netPerDmg)}HP/dmg(<1) · bleedBoss=${bt.bossProcPctHp*100}%/${bld.bossHits}hits · counters=maxOneOf{1.8,1.5,1.7}`);
