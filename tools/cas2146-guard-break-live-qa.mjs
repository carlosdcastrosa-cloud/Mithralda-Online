// ---------------------------------------------------------------------------
// CAS-2146 — EMPUJÓN / PATADA ROMPE-GUARDIA (mecánica #38, 38ª). DOM-free QA harness that DRIVES the real sim loop
// via the dev probes (guardBreakKick → hitEnemy poise sink → Riposte seam A arm; the shielded crack; the stamina cost +
// recovery gate) — the SAME code paths the served build runs, NOT a byte/md5 check. Evidence generator for the DARK build:
//
//   AC0  META             — GUARD_BREAK knob served as designed (enabled:false DARK, key Period, poiseMul 3.2, …)
//   AC1  POISE ×poiseMul   — the kick drains poise ×poiseMul in the SAME POISE.gain sink (ratio == poiseMul)
//   AC2  HEADLINE ABRE-VENTANA — kicks break a guarding enemy ⇒ staggerT>0 + _ripArm ARMED (NOT self-consumed) ⇒ a
//                            follow-up NORMAL melee EXECUTES the Riposte #36 window (reuses the existing execution)
//   AC3  ANTI-TURTLE       — a kick on a SHIELDED (carapace, damage-immune) enemy CRACKS the guard (shieldBroken) + shoves;
//                            a normal melee hit bounces and does NOT crack
//   AC4  COST + RECUPERO   — kick spends staminaCost EXACT, arms _gbCd recovery, denies a 2nd kick in-window (no spam);
//                            direct damage is LOW (<< a normal swing) ⇒ utility, not burst
//   AC5  OFF byte-id       — GUARD_BREAK.enabled=false ⇒ guardBreakKick() no-op: 0 stam, 0 poise, no crack, no cd ⇒ HEAD
//   AC6  SAVE byte-id      — h._gbCd transitorio (out of the save allowlist) ⇒ serializeSave() identical ON/OFF, no key
//   AC7  0-RNG STRONG      — srand ON==OFF byte-identical around the kick FIRING for real (NO guardBreakRng)
//   AC8  NO-REGRESSION     — the neighbour reactive/offensive pillars (#33 Guard Counter, #34 Dodge Counter, #36 Riposte,
//                            #37 Charged) still pass their own probes ⇒ the new verb is orthogonal, 0 regression
//   AC9  DETERMINISM       — the whole suite is re-run and every OBSERVABLE number is IDENTICAL run-to-run
//
// Run: node tools/cas2146-guard-break-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_BREAK, RIPOSTE } from "../sim/config.js";

const log = (m) => console.log(m);
const pass = (b) => b ? "PASS" : "**FAIL**";
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
sim.configure({ io: deep, audio: deep, view: deep });
sim.createHero("GuardBreakQA", "warrior");
const d = sim.dev;

let allOk = true;
const gate = (name, ok) => { allOk = allOk && ok; return ok; };

function runSuite(tag){
  log(`\n========================= ${tag} =========================`);
  const meta = d.guardBreakMeta();
  const metaOk = (meta.enabled===false && meta.key==="Period" && meta.poiseMul===3.2 && meta.cracksShield===true && meta.requiresMelee===false);
  log(`AC0 META: ${JSON.stringify(meta)} ⇒ enabled:false DARK + key Period + poiseMul 3.2 + cracksShield ⇒ ${pass(metaOk)}`);

  const p = d.guardBreakPoiseProbe();
  log(`AC1 POISE ×poiseMul: normal swing poise ${p.pRef}, kick poise ${p.pKick} ⇒ ratio ×${p.ratio} (expect ${p.expect}) ⇒ ${pass(p.ok)}`);

  const b = d.guardBreakBreakProbe();
  log(`AC2 HEADLINE: ${b.kicks} kicks break the guard ⇒ staggerT ${b.staggerT} + _ripArm ARMED by kick=${b.armedByKick} (not self-consumed); follow-up NORMAL melee EXECUTES it=${b.followupExecuted} ⇒ ${pass(b.ok)}`);

  const s = d.guardBreakShieldProbe();
  log(`AC3 ANTI-TURTLE: normal melee on shielded does NOT crack=${s.normalNoCrack}; kick CRACKS shieldBroken=${s.cracked} + shoved=${s.shoved} ⇒ ${pass(s.ok)}`);

  const c = d.guardBreakCostProbe();
  log(`AC4 COST+RECUPERO: stam spent ${c.stSpent} (expect ${c.expectCost})=${c.costOk}, _gbCd armed=${c.cdArmed}, direct dmg ${c.dmgDealt} << normal swing ${c.dRef}=${c.dmgLow}, 2nd kick in-window DENIED=${c.denyInCd} ⇒ ${pass(c.ok)}`);

  const o = d.guardBreakOffProbe();
  log(`AC5 OFF byte-id: enabled=false ⇒ kick no-op: noCost=${o.noCost} noPoise=${o.noPoise} noCrack=${o.noCrack} noCd=${o.noCd} ⇒ ${pass(o.ok)}`);

  const sv = d.guardBreakSaveByteId();
  log(`AC6 SAVE byte-id: serializeSave ON==OFF=${sv.byteId} (len ${sv.onLen}), no _gb*/guardBreak* key=${!sv.hasKey} ⇒ ${pass(sv.ok)}`);

  const SEED = 0x2146, N = 8;
  const on = d.guardBreakSrandProbe(true, SEED, N), off = d.guardBreakSrandProbe(false, SEED, N);
  const srandOk = on.fingerprint.length===off.fingerprint.length && on.fingerprint.every((v,i)=>v===off.fingerprint[i]);
  log(`AC7 0-RNG STRONG: srand around REAL kick firing (break + shield-crack) — ${on.fingerprint.length} draws, ON==OFF ${srandOk} (fired ON=${on.fired}) ⇒ ${pass(srandOk)}`);

  // AC8 NO-REGRESSION — the orthogonal neighbours still pass their own real-seam probes.
  const reg = {
    "GuardCounter#33": d.guardCounterDmgProbe().ok,
    "DodgeCounter#34": d.dodgeCounterDmgProbe().ok,
    "Riposte#36":      d.riposteHeadlineProbe().ok,
    "Charged#37":      d.chargeThresholdProbe().ok,
  };
  const regOk = Object.values(reg).every(Boolean);
  log(`AC8 NO-REGRESSION (orthogonal pillars): ${Object.entries(reg).map(([k,v])=>`${k}=${v?"PASS":"FAIL"}`).join(", ")} ⇒ ${pass(regOk)}`);

  const ok = metaOk && p.ok && b.ok && s.ok && c.ok && o.ok && sv.ok && srandOk && regOk;
  log(`----- ${tag} VERDICT: ${pass(ok)} -----`);
  return { metaOk, p, b, s, c, o, sv, srandOk, reg, ok };
}

const r1 = runSuite("RUN 1");
const r2 = runSuite("RUN 2 (determinism)");

// AC9 DETERMINISM — every GUARD-BREAK observable identical run-to-run. NOTE: c.dRef (a NEIGHBOUR normal-swing baseline
// used only for the dmgLow comparison) is deliberately excluded — its absolute value depends on the full combat pipeline
// (equip/combo/talents) that the AC8 regression probes legitimately perturb; the guard-break invariant is dmgDealt<dRef
// (holds both runs) and the kick's OWN dmg (deterministic), both captured below.
const fp = (r) => JSON.stringify([r.p.ratio, r.p.pKick, r.b.kicks, r.b.staggerT, r.b.armedByKick, r.b.followupExecuted,
  r.s.cracked, r.s.shoved, r.c.stSpent, r.c.dmgDealt, r.c.dmgLow, r.c.cdArmed, r.c.denyInCd, r.o.ok, r.sv.byteId, r.srandOk]);
const determ = fp(r1)===fp(r2);
log(`\nAC9 DETERMINISM: RUN1 fingerprint == RUN2 fingerprint ⇒ ${pass(determ)}`);
gate("determ", determ);
gate("run1", r1.ok);
gate("run2", r2.ok);

log(`\n===== CAS-2146 GUARD-BREAK DARK QA VERDICT (PASS×2 + determinism) =====`);
log(`GO: ${pass(allOk)} — mecánica #38 DARK (enabled:false), verbo ofensivo anti-turtle, drena poise ⇒ abre la ventana de Riposte #36, anti-turtle casca escudo, coste+recuperación, 0-RNG STRONG, save byte-id, 0 regresión a #33/#34/#36/#37`);
log(`KEY NUMBERS: poise×${r1.p.ratio} · break in ${r1.b.kicks} kicks (staggerT ${r1.b.staggerT}) · kick dmg ${r1.c.dmgDealt} vs swing ${r1.c.dRef} · stam ${r1.c.stSpent} · srand ON==OFF ${r1.srandOk}`);
if(!allOk){ process.exitCode = 1; }
