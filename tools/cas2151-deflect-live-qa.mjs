// ---------------------------------------------------------------------------
// CAS-2151 — DEFLECT / REFLEJO DE PROYECTIL (mecánica #39, 39ª). DOM-free build/QA harness that DRIVES the real sim loop
// (updateProjectiles → deflectProjectile flip + velocity reverse → capped hitEnemy on the shooter) via the dev probes —
// the SAME code paths the served build runs, NOT a byte/md5 check. Evidence generator for the DARK build:
//
//   AC0  META            — DEFLECT knob served as designed (enabled:false DARK, captureRadiusPx 34, dmgFracCap 0.15, …)
//   AC1  FLIP+REVERSE    — a projectile caught in the parry window FLIPS owner (enemy→hero), reverses velocity, flies back
//                          and DAMAGES the shooter; the hero takes 0; the window is CONSUMED (parryTAfter 0); stamina spent
//   AC2  CAP anti-1shot  — reflected damage is capped ≤dmgFracCap×maxHp of the target (huge dmg does NOT scale past the cap)
//   AC3  ONCE-PER-WINDOW — the deflect consumes h.parryT ⇒ a burst is not reflected wholesale by a single press
//   AC4  OFF byte-id     — DEFLECT.enabled=false ⇒ NO flip: the projectile hits the hero exactly like HEAD (window intact)
//   AC5  WINDOW-GATED    — enabled but window NOT armed ⇒ NO flip (it is a tempo-gate, not a passive shield)
//   AC6  SAVE byte-id    — driving a real deflect leaves serializeSave() identical ON/OFF, no _deflect*/deflect* key
//   AC7  0-RNG STRONG    — master srand ON==OFF byte-identical around a real deflect (NO deflectRng), 32-draw fingerprint
//   AC8  NO-REGRESSION   — neighbours (plain projectile hit, riposte hit) still behave ⇒ the verb is orthogonal
//   AC9  DETERMINISM     — the whole suite re-runs with every observable number identical
//
// Run: node tools/cas2151-deflect-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { DEFLECT, PARRY, STAMINA } from "../sim/config.js";

const log = (m) => console.log(m);
const pass = (b) => b ? "PASS" : "**FAIL**";
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("ReflejoQA", "warrior");   // NB: name must NOT contain the substring "deflect" (AC6 scans the save for stray keys)
const d = sim.dev;

let allOk = true;
const gate = (ok) => { allOk = allOk && ok; return ok; };

function runSuite(tag){
  log(`\n========================= ${tag} =========================`);

  // AC0 META
  const metaOk = (DEFLECT.enabled===false && DEFLECT.captureRadiusPx===34 && DEFLECT.dmgFracCap===0.15
    && DEFLECT.speedMul===1.15 && DEFLECT.staminaCost===12 && DEFLECT.oncePerWindow===true && DEFLECT.requiresParryWindow===true);
  log(`AC0 META: ${JSON.stringify(DEFLECT)} ⇒ enabled:false DARK + capR 34 + cap 0.15 + speedMul 1.15 + stam 12 ⇒ ${pass(gate(metaOk))}`);

  // AC1 FLIP + REVERSE (ON, window armed)
  const on = d.deflectProbe({ enabled:true, dmg:40, targetHp:500 });
  const a1 = on.ownerFlipped && on.velReversedAtFlip && on.vx0<0 && on.shooterHpLoss>0 && on.heroHpLoss===0
    && on.parryTAfter===0 && on.stamSpent===(STAMINA.enabled?DEFLECT.staminaCost:0);
  log(`AC1 FLIP+REVERSE: flip=${on.ownerFlipped} velRev=${on.velReversedAtFlip} (vx0 ${on.vx0}) shooterHpLoss=${on.shooterHpLoss} heroHpLoss=${on.heroHpLoss} parryTAfter=${on.parryTAfter} stamSpent=${on.stamSpent} ⇒ ${pass(gate(a1))}`);

  // AC2 CAP — a huge-dmg projectile is capped ≤ dmgFracCap×targetHp; raising dmg further does NOT raise reflected raw
  const capA = d.deflectProbe({ enabled:true, dmg:400, targetHp:300 });   // cap = 45
  const capB = d.deflectProbe({ enabled:true, dmg:9999, targetHp:300 });  // still cap 45
  const a2 = capA.capHit && capB.capHit && capA.reflectedRaw===capA.capValue && capB.reflectedRaw===capB.capValue
    && capA.reflectedRaw===capB.reflectedRaw && capA.reflectedRaw < 400;
  log(`AC2 CAP: dmg400→raw ${capA.reflectedRaw}==cap ${capA.capValue}, dmg9999→raw ${capB.reflectedRaw} (no scale past cap, capHit=${capA.capHit}) ⇒ ${pass(gate(a2))}`);

  // AC3 ONCE-PER-WINDOW — the window is consumed by the deflect (parryTAfter 0), so a burst can't be fully reflected
  const a3 = (on.parryTAfter===0 && DEFLECT.oncePerWindow===true);
  log(`AC3 ONCE-PER-WINDOW: deflect consumes parryT ⇒ parryTAfter=${on.parryTAfter}, oncePerWindow=${DEFLECT.oncePerWindow} ⇒ ${pass(gate(a3))}`);

  // AC4 OFF byte-id — disabled ⇒ no flip, projectile hits the hero, window untouched
  const off = d.deflectProbe({ enabled:false, dmg:40, targetHp:500 });
  const a4 = (!off.ownerFlipped && off.heroHpLoss>0 && off.shooterHpLoss===0 && off.stamSpent===0 && off.parryTAfter>0);
  log(`AC4 OFF byte-id: flip=${off.ownerFlipped} heroHpLoss=${off.heroHpLoss} shooterHpLoss=${off.shooterHpLoss} stamSpent=${off.stamSpent} parryTAfter=${off.parryTAfter} (intact) ⇒ ${pass(gate(a4))}`);

  // AC5 WINDOW-GATED — enabled but window NOT armed ⇒ no flip (tempo-gate, not passive)
  const noWin = d.deflectProbe({ enabled:true, arm:false, dmg:40, targetHp:500 });
  const a5 = (!noWin.ownerFlipped && noWin.heroHpLoss>0 && noWin.shooterHpLoss===0);
  log(`AC5 WINDOW-GATED: no window ⇒ flip=${noWin.ownerFlipped} heroHpLoss=${noWin.heroHpLoss} (hits hero) ⇒ ${pass(gate(a5))}`);

  // AC6 SAVE byte-id — a real deflect must not persist any transient; serializeSave identical ON/OFF, no deflect key
  d.deflectProbe({ enabled:true, dmg:40, targetHp:500 });   const svOn = JSON.stringify(sim.serializeSave());
  d.deflectProbe({ enabled:false, dmg:40, targetHp:500 });  const svOff = JSON.stringify(sim.serializeSave());
  const hasKey = /deflect|_deflect/i.test(svOn);
  const a6 = (svOn===svOff && !hasKey);
  log(`AC6 SAVE byte-id: ON==OFF=${svOn===svOff} (len ${svOn.length}), no deflect* key=${!hasKey} ⇒ ${pass(gate(a6))}`);

  // AC7 0-RNG STRONG — master srand fingerprint identical ON vs OFF around a real deflect (32 draws)
  const fpOn = d.deflectSrandFp(true, 1337, 32);
  const fpOff = d.deflectSrandFp(false, 1337, 32);
  const a7 = (fpOn===fpOff);
  log(`AC7 0-RNG STRONG: srand fp ON==OFF=${a7} (${fpOn.slice(0,28)}…) ⇒ ${pass(gate(a7))}`);

  // AC8 NO-REGRESSION — plain projectile → hero still damages, riposte hit still crits (combat intact around the new branch)
  const plain = d.deflectProbe({ enabled:false, dmg:50, targetHp:500 });
  const baseHit = d.hitProbe(false, 100), ripHit = d.hitProbe(true, 100);
  const a8 = (plain.heroHpLoss>0 && baseHit.dmg>0 && ripHit.dmg>baseHit.dmg);
  log(`AC8 NO-REGRESSION: plain proj heroHpLoss=${plain.heroHpLoss}, base hit ${baseHit.dmg}, riposte hit ${ripHit.dmg} (>base) ⇒ ${pass(gate(a8))}`);

  return { on, capA, off, noWin, fpOn };
}

const r1 = runSuite("RUN 1");
const r2 = runSuite("RUN 2 (determinism)");

// AC9 DETERMINISM — every observable number identical run-to-run
const detOk = JSON.stringify(r1) === JSON.stringify(r2);
log(`\nAC9 DETERMINISM: RUN1===RUN2 observable state=${detOk} ⇒ ${pass(gate(detOk))}`);

log(`\n===================== ${allOk ? "ALL PASS ✅" : "FAIL ❌"} =====================`);
process.exit(allOk ? 0 : 1);
