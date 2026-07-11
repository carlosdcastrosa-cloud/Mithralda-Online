// CAS-2163 — SEGUNDO ALIENTO / SECOND_WIND (mec #41) DARK build verification (GE self-check before Deploy).
// DOM-free: drives the REAL damageHero deny path via dev.secondWindProbe / dev.secondWindSrandFp. Asserts the AC
// families + OFF byte-id + save-neutral + RNG-neutral STRONG + determinism. NOT the observable browser QA (QA child).
import * as sim from "../sim/sim.js";
import { SECOND_WIND } from "../sim/config.js";

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("GEBot", "warrior");
const d = sim.dev;
const L = (m) => console.log(m);
const P = (b) => b ? "PASS" : "**FAIL**";
let allOk = true;
const check = (name, b, detail="") => { allOk = allOk && b; L(`  ${P(b)}  ${name}${detail?"  ·  "+detail:""}`); };

L(`\n===== CAS-2163 SECOND_WIND (mec #41) BUILD VERIFY — SECOND_WIND.enabled(default)=${SECOND_WIND.enabled} =====`);
L(`knobs: surviveHpFrac=${SECOND_WIND.surviveHpFrac} novaRadius=${SECOND_WIND.novaRadius} novaKnockback=${SECOND_WIND.novaKnockback} novaPoiseDmg=${SECOND_WIND.novaPoiseDmg} iframesMs=${SECOND_WIND.iframesMs} chargesPerRest=${SECOND_WIND.chargesPerRest}`);

function run(tag){
  L(`\n----- RUN ${tag} -----`);
  // AC-OFF byte-id: enabled=false ⇒ lethal hit is NOT denied ⇒ hero would die, no nova, no floater, charge untouched.
  const off = d.secondWindProbe({enabled:false});
  check("AC-OFF: lethal hit NOT denied (hero dies)", off.survived===false, `hpAfter=${off.hpAfter}`);
  check("AC-OFF: no nova push (inside enemy still)", off.novaInPushed===false, `inSpeed=${off.novaInSpeed}`);
  check("AC-OFF: no floater", off.floated===false);
  check("AC-OFF: charge not consumed", off.chargeAfter===off.chargeBefore, `${off.chargeBefore}->${off.chargeAfter}`);

  // AC1 HEADLINE: lethal hit DENIED, hp clamped to surviveHpFrac×maxHp
  const on = d.secondWindProbe({enabled:true});
  check("AC1 DENY: lethal hit negated (survived)", on.survived===true, `hpAfter=${on.hpAfter}`);
  check("AC1 CLAMP: hp == ceil(maxHp*surviveHpFrac)", on.hpAfter===on.hpExpected, `hpAfter=${on.hpAfter} expected=${on.hpExpected} (maxHp ${on.maxHp})`);
  // AC2 COST: exactly one charge consumed
  check("AC2 COST: one charge consumed", on.chargeAfter===on.chargeBefore-1, `${on.chargeBefore}->${on.chargeAfter}`);
  // AC3 I-FRAMES armed
  check("AC3 IFRAMES: window armed (~iframesMs)", on.iframeArmed && Math.abs(on.iframeT-SECOND_WIND.iframesMs/1000)<1e-6, `iframeT=${on.iframeT} (cfg ${SECOND_WIND.iframesMs/1000})`);
  // AC4 NOVA: enemy INSIDE radius pushed, enemy OUTSIDE untouched (radius gate)
  check("AC4 NOVA: enemy INSIDE radius pushed", on.novaInPushed===true, `inSpeed=${on.novaInSpeed}`);
  check("AC4 NOVA: enemy OUTSIDE radius NOT pushed", on.novaOutPushed===false, `outSpeed=${on.novaOutSpeed}`);
  // AC5 VFX floater observable
  check("AC5 VFX: ¡SEGUNDO ALIENTO! floater fired", on.floated===true);

  // AC6 IFRAMES ignore a same-window lethal multi-hit (isolate SW iframe: mercy iframe cleared)
  const ifr = d.secondWindProbe({enabled:true, probeIframe:true});
  check("AC6 IFRAMES: further lethal hit IGNORED in window", ifr.iframeIgnoresHit===true, `ignored=${ifr.iframeIgnoresHit}`);

  // AC7 NO-CHARGE: with 0 charge left, the lethal hit is NOT denied ⇒ hero dies (1-use per rest, not infinite)
  const noc = d.secondWindProbe({enabled:true, charge:0});
  check("AC7 NO-CHARGE: charge=0 ⇒ lethal NOT denied (dies)", noc.survived===false, `hpAfter=${noc.hpAfter}`);
  const noc2 = d.secondWindProbe({enabled:true, probeNoCharge:true});
  check("AC7 NO-CHARGE: post-consume, next lethal kills", noc2.noChargeDies===true);

  // AC8 RNG-neutral STRONG: srand fingerprint ON == OFF across a real deny mid-stream
  const fpOn  = d.secondWindSrandFp(true, 12345, 32);
  const fpOff = d.secondWindSrandFp(false, 12345, 32);
  check("AC8 0-RNG STRONG: srand ON==OFF (32 draws)", fpOn===fpOff, `on[0..24]=${fpOn.slice(0,24)}`);

  // AC9 SAVE byte-id: no secondWind/_secondWind key in save.v1, byte-id before/after a real deny
  d.secondWindProbe({enabled:true});
  const sav0 = JSON.stringify(sim.serializeSave());
  d.secondWindProbe({enabled:true});
  const sav1 = JSON.stringify(sim.serializeSave());
  const noKey = !/secondwind|_secondWind|secondWindLeft/i.test(sav0) && !/secondwind|_secondWind|secondWindLeft/i.test(sav1);
  check("AC9 SAVE: no secondWind* key in save.v1", noKey);
  check("AC9 SAVE: byte-id before/after deny", sav0===sav1);

  return { on, off, ifr, noc, fpOn, fpOff };
}

const r1 = run("1");
const r2 = run("2");

// determinism ACROSS runs (same fingerprints + same observables)
const det = r1.fpOn===r2.fpOn && r1.on.hpAfter===r2.on.hpAfter && r1.on.chargeAfter===r2.on.chargeAfter && r1.on.novaInSpeed===r2.on.novaInSpeed;
check("DETERMINISM: run1==run2 (fp + observables)", det, `hp ${r1.on.hpAfter}/${r2.on.hpAfter} · nova ${r1.on.novaInSpeed}/${r2.on.novaInSpeed}`);

L(`\n===== CAS-2163 BUILD VERIFY: ${allOk ? "ALL PASS ✅" : "**FAIL** ❌"} =====\n`);
process.exit(allOk ? 0 : 1);
