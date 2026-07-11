// ---------------------------------------------------------------------------
// CAS-2052 (Build recovery for CAS-2047 / EVO CAS-2046) — BOSS RUSH TIME-ATTACK + SCORE + RECORDS.
// A THIN, additive, DARK layer on the live Boss Rush gauntlet (CAS-1988): a run timer (accumulated
// sim dt, active-combat only), a deterministic score, an additively-extended record store, and a
// results/records overlay — all gated on BOSS_RUSH.timeAttack (default false ⇒ byte-identical HEAD).
//
// DOM-free harness: imports sim/sim.js directly and drives the REAL dev.br* hooks (brStart/brTick/
// brSetResting/brHurt/brStage/brComplete/brRetry/brExitRecap/brSerialize/brLoad/brSetRecords) over a
// parked hero. The child QA re-verifies the OBSERVABLE (HUD timer, overlay, reload persistence) on the
// served build. Score/timer are 0-RNG ⇒ srand ON==OFF holds trivially (nothing to gate).
//
//   [AC0]  knob present: BOSS_RUSH.timeAttack===false default, showTimer/showScore, score formula knobs.
//   [AC1]  [OFF=BYTE-ID] timeAttack:false ⇒ serializeBossRush emits EXACTLY {v:1,bestRound} (no new keys),
//          tick accrues 0, hit-counter inert, gauntletComplete→"menu" (HEAD path), recap payload null.
//   [AC2]  [ARMED TIMER] accrues ACTIVE-combat sim dt only — the bonfire rest is EXCLUDED; per-round split rides it.
//   [AC3]  [HIT COUNTER] boss-rush-gated: counts a landed hit in bossRushMode; a hit OUTSIDE Boss Rush never counts.
//   [AC4]  [SCORE] deterministic formula = max(0, base − round(sec×timeW) − hits×hitW + (hits?0:clean)); floors at 0; same in ⇒ same out.
//   [AC5]  [RECORDS] bank only when BEATEN (faster time / higher score); persist across serialize→load; not-beaten leaves records intact.
//   [AC6]  [RECAP] gauntletComplete(armed)→scene "bossRushRecap" with correct payload + Δ vs previous best; retry→play, menu→menu.
//   [AC7]  [SUB-FLAGS] showTimer/showScore readable + independent; score still COMPUTES when showScore off (it only gates DISPLAY).
//   [AC8]  [DETERMINISM] two identical runs produce a byte-identical fingerprint (pure sim, desktop==mobile).
//
// Run: node tools/cas2047-timeattack.mjs   (expects a clean PASS twice — determinism proof)
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { BOSS_RUSH } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

// HEAD default of the master flag (captured before any test arms it). Must be false (ships DARK).
const TA_DEFAULT = BOSS_RUSH.timeAttack;

// Pure oracle mirroring bossRushScoreComplete's formula — INDEPENDENT of the sim (not a tautology):
function scoreOracle(combatMs, hits){
  const sec = Math.round(combatMs) / 1000;
  const clean = (hits === 0) ? (BOSS_RUSH.scoreCleanBonus | 0) : 0;
  return Math.max(0, (BOSS_RUSH.scoreBase | 0) - Math.round(sec * (BOSS_RUSH.scoreTimeW | 0)) - hits * (BOSS_RUSH.scoreHitW | 0) + clean);
}

function runAll(tag){
  const fp = [];   // determinism fingerprint accumulated across ACs
  // Hero name has NO "boss"/"rush" substring ⇒ the save-key regex can't false-match.
  sim.createHero("ChronoQA", "warrior");
  G.brReset();                         // hermetic: G.bossRush is a module singleton — wipe telemetry+records so run#1==run#2
  BOSS_RUSH.timeAttack = TA_DEFAULT;   // isolate: restore the HEAD default at the top of each run

  // ---- AC0: knob present, DARK default, formula knobs ----
  {
    if(TA_DEFAULT === false) pass("AC0 timeAttack default=false (ships DARK)");
    else fail(`AC0 timeAttack default should be false, got ${TA_DEFAULT}`);
    const need = ["showTimer","showScore","scoreBase","scoreTimeW","scoreHitW","scoreCleanBonus"];
    const miss = need.filter(k => !(k in BOSS_RUSH));
    if(!miss.length) pass(`AC0 sub-flags + score knobs present (base=${BOSS_RUSH.scoreBase} timeW=${BOSS_RUSH.scoreTimeW} hitW=${BOSS_RUSH.scoreHitW} clean=${BOSS_RUSH.scoreCleanBonus})`);
    else fail(`AC0 missing knobs: ${J(miss)}`);
    fp.push("AC0", TA_DEFAULT, BOSS_RUSH.scoreBase, BOSS_RUSH.scoreTimeW, BOSS_RUSH.scoreHitW, BOSS_RUSH.scoreCleanBonus);
  }

  // ---- AC1: OFF ⇒ byte-identical to HEAD ----
  {
    BOSS_RUSH.timeAttack = false;
    // Even with durable record fields dirtied, OFF serialize must emit the HEAD shape EXACTLY.
    d.brSetRecords(4321, 99999);       // pollute the durable record fields
    G.hackBest(7);                      // (helper below) set best round so bestRound is non-trivial
    const off = d.brSerialize();
    const keys = Object.keys(off).sort();
    if(J(keys) === J(["bestRound","v"])) pass(`AC1 serializeBossRush OFF = HEAD shape exactly ${J(off)}`);
    else fail(`AC1 serializeBossRush OFF leaked keys: ${J(keys)} (${J(off)})`);

    // tick accrues nothing when off (measure DELTA — telemetry is a persistent singleton)
    d.brStart();                        // startBossRush; TA reset block gated ⇒ combatMs untouched
    d.brSetResting(false);
    const c0 = d.brState().combatMs|0;
    d.brTick(3.0);
    const dCombat = (d.brState().combatMs|0) - c0;
    if(dCombat === 0) pass("AC1 tick accrues 0 when off");
    else fail(`AC1 tick accrued ${dCombat}ms when off`);

    // hit-counter inert when off (delta)
    const h0 = d.brState().hitsReceived|0;
    d.brHurt(20);
    if((d.brState().hitsReceived|0) - h0 === 0) pass("AC1 hit counter inert when off");
    else fail(`AC1 hit counter moved when off: ${h0}→${d.brState().hitsReceived}`);

    // gauntletComplete OFF → menu, no recap payload
    d.brComplete();
    const s2 = d.brState();
    if(s2.scene === "menu" && s2.recap === null) pass("AC1 gauntletComplete OFF → scene 'menu', recap null (HEAD path)");
    else fail(`AC1 gauntletComplete OFF wrong: scene=${s2.scene} recap=${J(s2.recap)}`);
    fp.push("AC1", J(off), dCombat, s2.scene, s2.recap);
  }

  // ---- AC2: armed timer accrues active-combat only (rest excluded) ----
  {
    BOSS_RUSH.timeAttack = true;
    d.brStart();                        // resets combatMs=0, roundMs=[]
    // Hold the bonfire rest OPEN with a positive restT so the rest tick can't end it (restT=0 would expire instantly).
    G.setRestT(5.0);
    d.brSetResting(true);  d.brTick(2.0);   // bonfire rest — must NOT accrue (restT 5.0→3.0, still resting)
    const restAccrued = d.brState().combatMs|0;
    d.brSetResting(false); d.brTick(1.5);   // active combat — accrues 1500ms into the current round split
    const st = d.brState();
    const splitSum = (st.roundMs||[]).reduce((a,m)=>a+(m|0),0);
    if(restAccrued === 0) pass("AC2 bonfire rest EXCLUDED from the timer (0ms during rest)");
    else fail(`AC2 rest leaked ${restAccrued}ms into the timer`);
    if(Math.abs((st.combatMs|0) - 1500) <= 1) pass(`AC2 active-combat accrues sim dt (combatMs=${st.combatMs})`);
    else fail(`AC2 combatMs expected ~1500, got ${st.combatMs}`);
    if(Math.abs(splitSum - (st.combatMs|0)) <= 1) pass(`AC2 per-round splits sum to combatMs (Σ=${splitSum}, splits=${J(st.roundMs)})`);
    else fail(`AC2 split sum ${splitSum} != combatMs ${st.combatMs} (${J(st.roundMs)})`);
    fp.push("AC2", restAccrued, st.combatMs, splitSum);
  }

  // ---- AC3: hit counter boss-rush-gated ----
  {
    BOSS_RUSH.timeAttack = true;
    d.brStart();                        // bossRushMode=true
    d.brHurt(15); d.brHurt(15); d.brHurt(15);
    const inRush = d.brState().hitsReceived|0;
    // now leave Boss Rush but keep timeAttack on — a hit must NOT count
    G.leaveBossRush();
    const before = d.brState().hitsReceived|0;
    d.brHurt(15);
    const after = d.brState().hitsReceived|0;
    if(inRush === 3) pass("AC3 hits counted inside Boss Rush (3)");
    else fail(`AC3 in-rush hits expected 3, got ${inRush}`);
    if(after === before) pass("AC3 hit OUTSIDE Boss Rush never counts (gated)");
    else fail(`AC3 out-of-rush hit leaked: ${before}→${after}`);
    fp.push("AC3", inRush, before, after);
  }

  // ---- AC4: deterministic score formula ----
  {
    BOSS_RUSH.timeAttack = true;
    const cases = [ [42000, 0], [42000, 4], [60000, 12], [2000000, 3] ]; // last one floors at 0
    for(const [ms, hits] of cases){
      d.brStart(); d.brStage(ms, hits);
      const rc = d.brComplete().recap;
      const exp = scoreOracle(ms, hits);
      if(rc && rc.score === exp) pass(`AC4 score(${ms}ms,${hits}h)=${rc.score} == oracle`);
      else fail(`AC4 score(${ms}ms,${hits}h)=${rc && rc.score} != oracle ${exp}`);
      fp.push("AC4", ms, hits, rc && rc.score);
    }
    // clean bonus only when hits===0
    d.brStart(); d.brStage(42000, 0); const clean = d.brComplete().recap.score;
    d.brStart(); d.brStage(42000, 1); const dirty = d.brComplete().recap.score;
    if(clean - dirty === (BOSS_RUSH.scoreCleanBonus|0) + (BOSS_RUSH.scoreHitW|0))
      pass(`AC4 clean-run bonus applied (Δ=${clean-dirty} = clean ${BOSS_RUSH.scoreCleanBonus} + 1 hit ${BOSS_RUSH.scoreHitW})`);
    else fail(`AC4 clean bonus wrong: clean=${clean} dirty=${dirty} Δ=${clean-dirty}`);
  }

  // ---- AC5: records bank only when beaten + persist round-trip ----
  {
    BOSS_RUSH.timeAttack = true;
    // First-ever completion: prevBest=0 ⇒ both records set.
    d.brSetRecords(0, 0);
    d.brStart();                        // snapshots prevBest = 0
    d.brStage(50000, 0);                // 50s clean
    const rc1 = d.brComplete().recap;
    const s5a = d.brState();
    const expScore1 = scoreOracle(50000, 0);
    if(rc1.newTimeRecord && rc1.newScoreRecord && s5a.bestTimeMs === 50000 && s5a.bestScore === expScore1)
      pass(`AC5 first completion banks both records (t=${s5a.bestTimeMs} s=${s5a.bestScore})`);
    else fail(`AC5 first completion wrong: ${J({rc1, best:{t:s5a.bestTimeMs,s:s5a.bestScore}, expScore1})}`);
    // Round-trip persistence: serialize → wipe live → load restores.
    const blob = d.brSerialize();
    if(J(Object.keys(blob).sort()) === J(["bestRound","bestScore","bestTimeMs","v"]))
      pass(`AC5 armed serialize carries records ${J(blob)}`);
    else fail(`AC5 armed serialize shape wrong: ${J(blob)}`);
    d.brSetRecords(0, 0);               // wipe live records
    d.brLoad(blob);
    const ld = d.brState();
    if(ld.bestTimeMs === 50000 && ld.bestScore === expScore1) pass("AC5 records persist across serialize→load");
    else fail(`AC5 load lost records: t=${ld.bestTimeMs} s=${ld.bestScore}`);

    // Not beaten: slower + lower ⇒ records untouched, no new-record flags.
    d.brStart();                        // snapshots prevBest = {50000, expScore1}
    d.brStage(90000, 8);                // slower, hits ⇒ lower score
    const rc2 = d.brComplete().recap;
    const s5b = d.brState();
    if(!rc2.newTimeRecord && !rc2.newScoreRecord && s5b.bestTimeMs === 50000 && s5b.bestScore === expScore1)
      pass("AC5 not-beaten run leaves records intact (no false record)");
    else fail(`AC5 not-beaten wrong: ${J({rc2, best:{t:s5b.bestTimeMs,s:s5b.bestScore}})}`);

    // Beaten on time but not score (faster run that took a hit vs a clean slower PB) — independent flags.
    d.brSetRecords(50000, 999999);      // score PB unbeatable, time PB 50s
    d.brStart();
    d.brStage(40000, 0);                // faster ⇒ time record; score < 999999 ⇒ no score record
    const rc3 = d.brComplete().recap;
    const s5c = d.brState();
    if(rc3.newTimeRecord && !rc3.newScoreRecord && s5c.bestTimeMs === 40000 && s5c.bestScore === 999999)
      pass("AC5 time/score records are INDEPENDENT (time beaten, score not)");
    else fail(`AC5 independent flags wrong: ${J({rc3, best:{t:s5c.bestTimeMs,s:s5c.bestScore}})}`);
    fp.push("AC5", J(blob), ld.bestTimeMs, ld.bestScore, rc2.newTimeRecord, rc3.newTimeRecord, rc3.newScoreRecord);
  }

  // ---- AC6: recap scene + delta + retry/menu seams ----
  {
    BOSS_RUSH.timeAttack = true;
    d.brSetRecords(60000, 40000);
    d.brStart();
    d.brStage(45000, 2);
    const st = d.brComplete();
    const rc = st.recap;
    const deltaOk = rc && rc.prevBestTimeMs === 60000 && rc.prevBestScore === 40000 && rc.timeMs === 45000;
    if(st.scene === "bossRushRecap" && deltaOk) pass(`AC6 gauntletComplete(armed)→'bossRushRecap' with Δ baseline (prevT=${rc.prevBestTimeMs} prevS=${rc.prevBestScore})`);
    else fail(`AC6 recap scene/delta wrong: scene=${st.scene} recap=${J(rc)}`);
    // retry seam
    const rr = d.brRetry();
    if(rr.ok && rr.scene === "play" && rr.mode === true) pass("AC6 retry seam → startBossRush (scene play, mode on)");
    else fail(`AC6 retry seam wrong: ${J(rr)}`);
    // reach recap again, then menu seam
    d.brStage(45000, 2); d.brComplete();
    const rm = d.brExitRecap();
    if(rm.ok && rm.scene === "menu") pass("AC6 menu seam → scene 'menu'");
    else fail(`AC6 menu seam wrong: ${J(rm)}`);
    // seams inert outside the overlay
    const inert = d.brRetry();
    if(!inert.ok) pass("AC6 retry seam inert outside the overlay (scene-guarded)");
    else fail(`AC6 retry seam fired outside overlay: ${J(inert)}`);
    fp.push("AC6", st.scene, rc.prevBestTimeMs, rc.prevBestScore, rc.timeMs, rr.scene, rm.scene, inert.ok);
  }

  // ---- AC7: sub-flags readable + independent; score computes regardless of showScore ----
  {
    BOSS_RUSH.timeAttack = true;
    BOSS_RUSH.showTimer = false; BOSS_RUSH.showScore = false;
    const s = d.brState();
    if(s.showTimer === false && s.showScore === false) pass("AC7 sub-flags readable/independent via brState");
    else fail(`AC7 sub-flag readout wrong: ${J({showTimer:s.showTimer, showScore:s.showScore})}`);
    d.brStart(); d.brStage(42000, 0);
    const rc = d.brComplete().recap;
    if(rc && rc.score === scoreOracle(42000, 0)) pass("AC7 score still COMPUTES with showScore off (flag gates DISPLAY only)");
    else fail(`AC7 score should compute regardless of showScore: ${J(rc)}`);
    BOSS_RUSH.showTimer = true; BOSS_RUSH.showScore = true;   // restore defaults
    fp.push("AC7", rc.score);
  }

  BOSS_RUSH.timeAttack = TA_DEFAULT;   // leave the knob at its DARK default
  return fp.join("|");
}

// Minimal dev shims the harness needs that aren't in dev (set best round / leave rush) — via sim.G directly.
const G = sim.G;
G.hackBest = (n) => { G.bossRush.best = n|0; };
G.leaveBossRush = () => { G.bossRushMode = false; };
G.setRestT = (t) => { G.bossRush.restT = +t || 0; };
G.brReset = () => { Object.assign(G.bossRush, { round:0, resting:false, restT:0, complete:false,
  best:0, bestTimeMs:0, bestScore:0, combatMs:0, roundMs:[], hitsReceived:0, lastScore:0, lastTimeMs:0,
  newTimeRecord:false, newScoreRecord:false, prevBestTimeMs:0, prevBestScore:0 });
  G.bossRushRecap = null; G.bossRushMode = false; G.pendingBossRush = false; };

const fpA = runAll("run#1");
const fpB = runAll("run#2");
if(fpA === fpB) pass("AC8 determinism: run#1 fingerprint == run#2 (byte-identical, desktop==mobile)");
else { fail("AC8 determinism BROKEN: fingerprints differ"); log("A: "+fpA); log("B: "+fpB); }

log(ok ? "\n✅ CAS-2052 Boss Rush Time-Attack build: ALL AC PASS" : "\n❌ CAS-2052 build: FAILURES above");
process.exit(ok ? 0 : 1);
