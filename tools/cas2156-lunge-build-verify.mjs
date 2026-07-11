// CAS-2156 — LUNGE / Estocada de Avance (mec #40) DARK build verification (GE self-check before Deploy).
// DOM-free: drives the REAL sim loop via dev.lungeProbe / dev.lungeSrandFp. Asserts the 8 AC families +
// OFF byte-id + save-neutral + RNG-neutral + determinism. NOT the observable browser QA (that is QA b5c10283's).
import * as sim from "../sim/sim.js";
import { LUNGE, STAMINA } from "../sim/config.js";

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("GEBot", "warrior");
const d = sim.dev;
const L = (m) => console.log(m);
const P = (b) => b ? "PASS" : "**FAIL**";
let allOk = true;
const check = (name, b, detail="") => { allOk = allOk && b; L(`  ${P(b)}  ${name}${detail?"  ·  "+detail:""}`); };

L(`\n===== CAS-2156 LUNGE (mec #40) BUILD VERIFY — LUNGE.enabled(default)=${LUNGE.enabled} =====`);
L(`knobs: distance=${LUNGE.distance} dashMs=${LUNGE.dashMs} range=${LUNGE.range} arcDeg=${LUNGE.arcDeg} dmgMul=${LUNGE.dmgMul} staminaCost=${LUNGE.staminaCost} recoverMs=${LUNGE.recoverMs} key=${LUNGE.key}`);

function run(tag){
  L(`\n----- RUN ${tag} -----`);
  // AC4 OFF byte-id: key inert, no displacement, no state
  const off = d.lungeProbe({enabled:false});
  check("AC4 OFF: no fire", off.fired===false, `fired=${off.fired}`);
  check("AC4 OFF: no displacement", off.displacement<1, `disp=${off.displacement}`);
  check("AC4 OFF: no enemy dmg", off.enemyHpLoss===0, `hpLoss=${off.enemyHpLoss}`);
  check("AC4 OFF: no floater", off.floated===false);

  // AC1 DASH + AC2 STRIKE + AC3 NO-IFRAMES + AC5 COST
  const on = d.lungeProbe({enabled:true, probeRecovery:true});
  check("AC1 DASH: hero displaced ~distance", on.displacement > LUNGE.distance*0.6, `disp=${on.displacement} (cfg ${LUNGE.distance})`);
  check("AC2 STRIKE: enemy took damage", on.enemyHpLoss > 0, `hpLoss=${on.enemyHpLoss}`);
  check("AC3 NO-IFRAMES: i-frames NOT granted (vulnerable)", on.iframeGranted===false, `iframeMax=${on.iframeMax}`);
  check("AC5 COST: stamina spent == staminaCost", on.stamSpent===LUNGE.staminaCost, `spent=${on.stamSpent}`);
  check("AC5 RECOVERY: _lungeCd armed after fire", on.lungeCdAfterFire > 0, `cd=${on.lungeCdAfterFire}`);
  check("AC5 RECOVERY: re-lunge in window DENIED", on.reLungeFired===false && on.reLungeStamSpent===0, `reFired=${on.reLungeFired} reStam=${on.reLungeStamSpent}`);
  check("AC5 not rolling (no i-frame roll state)", on.rolling===false);
  check("headline floater ¡ESTOCADA! observable", on.floated===true);

  // AC5 deny path: no stamina ⇒ no fire
  const deny = d.lungeProbe({enabled:true, noStam:true});
  check("AC5 DENY: no stamina ⇒ no dash", deny.fired===false && deny.displacement<1, `fired=${deny.fired} disp=${deny.displacement}`);

  // universal (ranged class still closes distance)
  const mage = d.lungeProbe({enabled:true, cls:"mage"});
  check("UNIVERSAL: mage (ranged) also dashes", mage.displacement > LUNGE.distance*0.6, `disp=${mage.displacement}`);
  check("UNIVERSAL: mage strike connects", mage.enemyHpLoss > 0, `hpLoss=${mage.enemyHpLoss}`);

  // AC7 RNG-neutral STRONG: srand fingerprint ON == OFF
  const fpOn  = d.lungeSrandFp(true, 12345, 32);
  const fpOff = d.lungeSrandFp(false, 12345, 32);
  check("AC7 0-RNG STRONG: srand ON==OFF (32 draws)", fpOn===fpOff, `on[0..24]=${fpOn.slice(0,24)}`);

  // AC6 SAVE byte-id: no lunge* key, save identical before/after a real lunge (both probes warrior ⇒ the ONLY delta would be a
  // lunge transient leaking into save — there is none). Normalizes cls first so the prior mage probe can't skew the compare.
  d.lungeProbe({enabled:true, cls:"warrior"});
  const sav0 = JSON.stringify(sim.serializeSave());
  d.lungeProbe({enabled:true, cls:"warrior"});
  const sav1 = JSON.stringify(sim.serializeSave());
  const noLungeKey = !/lunge/i.test(sav0) && !/lunge/i.test(sav1);
  check("AC6 SAVE: no 'lunge' key in save.v1", noLungeKey);
  check("AC6 SAVE: byte-id before/after lunge", sav0===sav1);

  return { off, on, deny, mage, fpOn, fpOff };
}

const r1 = run("1");
const r2 = run("2");

// determinism ACROSS runs (same fingerprints + same observables)
const det = r1.fpOn===r2.fpOn && r1.on.displacement===r2.on.displacement && r1.on.enemyHpLoss===r2.on.enemyHpLoss && r1.on.stamSpent===r2.on.stamSpent;
check("DETERMINISM: run1==run2 (fp + observables)", det, `disp ${r1.on.displacement}/${r2.on.displacement} · dmg ${r1.on.enemyHpLoss}/${r2.on.enemyHpLoss}`);

L(`\n===== CAS-2156 BUILD VERIFY: ${allOk ? "ALL PASS ✅" : "**FAIL** ❌"} =====\n`);
process.exit(allOk ? 0 : 1);
