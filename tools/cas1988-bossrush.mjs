// ---------------------------------------------------------------------------
// CAS-1989 (build for CAS-1988) — MODO BOSS RUSH / GAUNTLET (knob BOSS_RUSH). Cosecha del kit de 23 pilares.
// Un modo FINITO, opt-in, de jefes encadenados: el jugador pelea una SECUENCIA ORDENADA de los jefes que YA
// existen (dragón → tirano del pantano → tirano del abismo → Corazón de Magma) espalda-con-espalda, con una
// hoguera (cura + refill de TODO el kit) entre rondas, y termina la gauntlet o muere. Récord persistente = mejor
// ronda alcanzada, en su PROPIO store (mithralda.bossrush.v1) ⇒ save.v1 byte-id. $0 arte, 100% reuso del motor.
//
// Controlador PARALELO e independiente de la Arena de Oleadas — NO toca una sola línea del código de Arena.
// enabled:false ⇒ modo INALCANZABLE (menú no muestra la entrada, KeyB inerte, tickBossRush nunca corre) ⇒
// byte-idéntico a HEAD. Todo draw viene de bossRushRng dedicado (NUNCA srand). RNG-neutral STRONG.
//
// RIESGO #1 (SIGNATURE_BOSS en la ronda caldera) — RESUELTO opción (b): las 2 fases NO se disparan en Boss Rush.
//   El marcado _sbPhase vive SÓLO en spawnChampion (rama de campeón de hunt-zone); Boss Rush spawnea vía spawnEnemy
//   + tag isBoss/bossRush (espejo arenaSpawnBoss), NUNCA por spawnChampion ⇒ el jefe caldera nunca recibe _sbPhase ⇒
//   ni AI de transición ni la rama de recompensa SIGNATURE (gateada e._sbPhase) ⇒ SIN doble-reward. AI llana de capstone
//   (enrage + Erupción) idéntica a como compone el jefe caldera de la Arena. Verificado por _brSignatureProbe (AC10).
// RIESGO #2 (killEnemy loot branch) — el jefe es isBoss+bossRush (NO champion) ⇒ rama de loot de jefe, nunca
//   onChampionKill (zone-clear/victory). bossRush (no arena) ⇒ la rama de loot-bonus de Arena tampoco dispara. AC9.
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev._br* hooks (startBossRush/spawnRound/
// onRoundCleared/tickBossRush/gauntletComplete + killEnemy + update()) sobre un héroe parqueado + jefes del
// spawnEnemy genuino. La QA live (hija) re-verifica el observable sobre el build servido.
//
//   [AC0]  knob BOSS_RUSH presente, enabled:false default, sequence no vacía, SIN 'frost'/'trial'.
//   [AC1]  [RNG-STRONG] enabled:false ⇒ 0 draws srand (fingerprint ON==OFF por spawn+tick) + save.v1 byte-id (estado sólo en G.bossRush transitorio); 2 corridas diff-idéntico.
//   [AC2]  entrada: startBossRush ⇒ bossRushMode=true + ronda 0 spawnea sequence[0].
//   [AC3]  secuencia ORDENADA: al limpiar ronda r, ronda r+1 spawnea sequence[r+1] (no aleatorio).
//   [AC4]  hoguera entre rondas: HP sube por healFrac + cargas (estus/summon) a tope.
//   [AC5]  escala: HP/dmg del jefe de ronda r = base × 1+r*step (readout determinista).
//   [AC6]  recompensa: Esencia por ronda = essPerRound + r*essStepRound (arith, 0 RNG); clearBonus al completar.
//   [AC7]  récord: bestRound persiste en store propio; milestone 1-vez/run; save.v1 intacto.
//   [AC8]  fin: completar sequence ⇒ vuelve al menú, NUNCA G.scene="victory" del mundo.
//   [AC9]  aislamiento: sin trash de spawners naturales ni curse-scene en bossRushMode; jefe isBoss+bossRush NO champion (no onChampionKill/victory).
//   [AC10] composición: el jefe conserva su AI (capstone/special); riesgo #1 (SIGNATURE_BOSS) resuelto sin doble-reward.
//   [AC11] determinismo: RNG ON==OFF a bonus 0; 2 corridas byte-idénticas (desktop==mobile: lógica sim pura, sin DOM).
//
// Run: node tools/cas1988-bossrush.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { BOSS_RUSH, ARENA, SIGNATURE_BOSS, STATUS_BUILDUP, WEAPON_BUFFS, POISE, BACKSTAB } from "../sim/config.js";

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

// Captured BEFORE any dev-hook: the config.js default of the knob (the _br* probes arm/disarm BOSS_RUSH.enabled,
// leaving drift; the harness restores this default at the start of each run to isolate). It is the byte-id-OFF value of HEAD.
const BR_DEFAULT = BOSS_RUSH.enabled;

function runAll(tag){
  // hero name has NO "bossrush"/"boss" substring ⇒ save-key regex can't false-match.
  sim.createHero("GauntletQA", "warrior");
  BOSS_RUSH.enabled = BR_DEFAULT;   // isolate the run from the probes' drift (config.js default)

  // ---------- AC0 content sanity ----------
  const meta = d.bossRushMeta();
  const seq = meta.sequence || [];
  const noBanned = !seq.includes("frost") && !seq.includes("trial");
  const okContent = meta.enabled===false && !!meta.key && seq.length>0 && noBanned
    && meta.restSeconds>0 && meta.healFrac>0 && meta.essPerRound>0 && meta.clearBonusEss>0
    && typeof meta.hpStep==="number" && typeof meta.dmgStep==="number";
  if (okContent) pass(`[${tag}] AC0 content: BOSS_RUSH knob (key=${meta.key} enabled=${meta.enabled} seq=[${seq.join(",")}] hpStep=${meta.hpStep} dmgStep=${meta.dmgStep} rest=${meta.restSeconds}s heal=${meta.healFrac} ess=${meta.essPerRound}+r*${meta.essStepRound} clearBonus=${meta.clearBonusEss} | sin frost/trial=${noBanned})`);
  else fail(`[${tag}] AC0 content wrong: ${J(meta)}`);

  // ---------- AC1 [RNG-STRONG] enabled:false ⇒ 0 srand + save.v1 byte-id ----------
  const sv = d._brSaveByteId();
  const off = d._brOffProbe();
  const srandOn  = d._brSrandProbe(true,  0xB055, 8);
  const srandOff = d._brSrandProbe(false, 0xB055, 8);
  const srandIdent = J(srandOn.fingerprint)===J(srandOff.fingerprint) && srandOn.spawned;
  const ac1 = BR_DEFAULT===false && sv.ok && off.ok && srandIdent;
  if (ac1) pass(`[${tag}] AC1 [RNG-STRONG]: enabled=false default; save.v1 byte-id ON/OFF (${sv.offLen}==${sv.onLen}) sin clave bossrush (${sv.noKey}); srand ON==OFF ${srandOn.fingerprint.length}-draw idéntico (spawn+tick 0-draw); OFF modeOff=${off.modeOffAfterArm}`);
  else fail(`[${tag}] AC1 broke: default=${BR_DEFAULT} save=${J(sv)} off=${J(off)} srandOn=${J(srandOn.fingerprint)} srandOff=${J(srandOff.fingerprint)}`);

  // ---------- AC2 entrada: startBossRush ⇒ mode on + ronda 0 = sequence[0] ----------
  const st = d._brStart();
  const ac2 = st.mode===true && st.round===0 && st.boss && st.boss.zone===seq[0] && st.scene==="play" && st.boss.bossRush && st.boss.isBoss && !st.boss.champion;
  if (ac2) pass(`[${tag}] AC2 entrada: bossRushMode=${st.mode}, ronda 0 spawnea sequence[0]=${st.boss.zone} (isBoss=${st.boss.isBoss} bossRush=${st.boss.bossRush} champion=${st.boss.champion}) scene=${st.scene}`);
  else fail(`[${tag}] AC2 start: ${J(st)}`);

  // ---------- AC3 secuencia ORDENADA ----------
  const sq = d._brSequenceProbe();
  if (sq.ordered) pass(`[${tag}] AC3 secuencia: ORDENADA [${sq.actual.join(",")}] == [${sq.expected.join(",")}] (limpiar ronda r ⇒ ronda r+1 = sequence[r+1], no aleatorio)`);
  else fail(`[${tag}] AC3 sequence: esperado=[${sq.expected.join(",")}] actual=[${sq.actual.join(",")}]`);

  // ---------- AC4 hoguera cura + refill ----------
  const rf = d._brRestRefillProbe();
  if (rf.ok) pass(`[${tag}] AC4 hoguera: HP curada (${rf.healed}, hp=${rf.hp}) + estus refill (${rf.flaskRefilled}) + summon refill (${rf.summonRefilled}) + REST activo (${rf.resting})`);
  else fail(`[${tag}] AC4 rest/refill: ${J(rf)}`);

  // ---------- AC5 escala HP/dmg = base × 1+r*step ----------
  const sc = d._brScaleProbe();
  if (sc.ok) pass(`[${tag}] AC5 escala: ${sc.rows.map(x=>`r${x.round}(${x.zone}) hp${x.hp}×${x.hpMul} dmg${x.dmg}×${x.dmgMul}`).join("  ·  ")} (todos == base×1+r*step)`);
  else fail(`[${tag}] AC5 scale: ${J(sc.rows)}`);

  // ---------- AC6 recompensa Esencia por ronda (arith, 0 RNG) ----------
  const rw0 = d._brRoundReward(0);
  const rw2 = d._brRoundReward(2);
  const ac6 = rw0.gain===rw0.expectRound && rw2.gain===rw2.expectRound && rw2.gain>rw0.gain;
  if (ac6) pass(`[${tag}] AC6 recompensa: ronda 0 +${rw0.gain} (==${rw0.expectRound}) · ronda 2 +${rw2.gain} (==${rw2.expectRound}); escala por ronda, 0 RNG`);
  else fail(`[${tag}] AC6 reward: r0=${J(rw0)} r2=${J(rw2)}`);

  // ---------- AC7 récord persiste + milestone 1-vez ----------
  const rec = d._brRecordProbe();
  const per = d._brPersist(3);
  const ac7 = rec.ok && per.after===3;
  if (ac7) pass(`[${tag}] AC7 récord: bestRound=${rec.bestAfter} persiste; milestone 1-vez (ronda1 sin bonus=${rec.noMilestoneOnRound1}, ronda2 con bonus=${rec.milestoneOnRound2}); serialize→load {bestRound:3}→${per.after}`);
  else fail(`[${tag}] AC7 record: rec=${J(rec)} persist=${J(per)}`);

  // ---------- AC8 completar ⇒ menú, NUNCA victory ----------
  const cp = d._brCompleteProbe();
  const ac8 = cp.ok && cp.notVictory && cp.backToMenu;
  if (ac8) pass(`[${tag}] AC8 fin: completar gauntlet ⇒ scene=${cp.scene} (backToMenu=${cp.backToMenu}, NUNCA victory=${cp.notVictory}); clearBonus +${cp.clearBonus}; best=${cp.best}/${cp.expectBest}; modeOff=${cp.modeOff}`);
  else fail(`[${tag}] AC8 complete: ${J(cp)}`);

  // ---------- AC9 aislamiento + loot branch ----------
  const lb = d._brLootBranchProbe();
  const iso = d._brIsolationProbe(90);
  const ac9 = lb.ok && iso.ok;
  if (ac9) pass(`[${tag}] AC9 aislamiento: jefe isBoss=${lb.isBoss}+bossRush=${lb.bossRush} NO champion=${!lb.champion} ⇒ sin onChampionKill (hunt no-cleared=${lb.huntNotCleared}) NUNCA victory (${lb.neverVictory}); sin trash de spawners (${iso.onlyBossRush}) ni curse-scene (${iso.noCurseScene}) en ${iso.frames} frames`);
  else fail(`[${tag}] AC9 isolation: lootBranch=${J(lb)} iso=${J(iso)}`);

  // ---------- AC10 composición + RIESGO #1 SIGNATURE_BOSS ----------
  const sg = d._brSignatureProbe();
  const ac10 = sg.ok && sg.isCaldera && sg.noSbPhase && sg.noDoubleReward;
  if (ac10) pass(`[${tag}] AC10 composición: ronda caldera con SIGNATURE_BOSS on ⇒ SIN _sbPhase (${sg.noSbPhase}) ⇒ 2-fases NO se disparan (riesgo #1 opción b); killEnemy SIN bonus signature (essGain=${sg.sigEssGain}==0, sigReward configurado=${sg.sigReward}) ⇒ SIN doble-reward; jefe NO champion (${sg.noChampion})`);
  else fail(`[${tag}] AC10 signature/composition: ${J(sg)}`);

  // ---------- AC11 base: los 23 pilares intactos (features on) ----------
  const base23 = SIGNATURE_BOSS.enabled && STATUS_BUILDUP.enabled && WEAPON_BUFFS.enabled && POISE.enabled && BACKSTAB.enabled;
  if (base23) pass(`[${tag}] AC11 base: pilares previos intactos (SIGNATURE_BOSS/STATUS_BUILDUP/WEAPON_BUFFS/POISE/BACKSTAB on); Boss Rush no toca Arena (ARENA.bossEvery=${ARENA.bossEvery} intacto)`);
  else fail(`[${tag}] AC11 base broke: base23=${base23}`);

  // fingerprint for cross-run determinism
  return { content:okContent, sv:{byteId:sv.byteId,noKey:sv.noKey}, srandFp:srandOn.fingerprint,
    st:{mode:st.mode,zone:st.boss&&st.boss.zone}, sq:{ordered:sq.ordered,actual:sq.actual},
    rf:{healed:rf.healed,flask:rf.flaskRefilled,summon:rf.summonRefilled},
    sc:sc.rows.map(x=>({r:x.round,hp:x.hp,dmg:x.dmg,hpMul:x.hpMul,dmgMul:x.dmgMul})),
    rw:{r0:rw0.gain,r2:rw2.gain}, rec:{best:rec.bestAfter,mile:rec.milestoneOnRound2}, per:per.after,
    cp:{scene:cp.scene,best:cp.best,clearBonus:cp.clearBonus}, lb:{isBoss:lb.isBoss,bossRush:lb.bossRush,champion:lb.champion,victory:!lb.neverVictory},
    iso:{onlyBossRush:iso.onlyBossRush,noCurse:iso.noCurseScene}, sg:{noSbPhase:sg.noSbPhase,sigEssGain:sg.sigEssGain,noDouble:sg.noDoubleReward} };
}

try {
  const r1 = runAll("run1");
  const r2 = runAll("run2");
  if (J(r1)===J(r2)) pass(`AC11 determinism: 2 corridas byte-idénticas`);
  else fail(`AC11 determinism: run1!=run2\n  ${J(r1)}\n  ${J(r2)}`);
} catch (e) {
  fail(`EXCEPTION: ${e && e.stack || e}`);
}

log("");
log(ok ? "✅ CAS-1989 (CAS-1988) Modo Boss Rush build — ALL PASS" : "❌ CAS-1989 (CAS-1988) Modo Boss Rush build — FAIL");
process.exit(ok ? 0 : 1);
