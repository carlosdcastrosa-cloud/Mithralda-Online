// ---------------------------------------------------------------------------
// CAS-1948 (build for CAS-1947) — JEFE FIRMA MULTI-FASE (Signature Boss, knob SIGNATURE_BOSS). Pilar 22 / PAYOFF.
// Tras 21 pilares de combate Souls-like, el mayor lever de DIVERSIÓN no es un pilar nuevo sino un PAYOFF: un jefe firma
// multi-fase, capa de comportamiento GATED sobre el capstone existente de la Caldera (`calderatyrant` "Corazón de Magma").
// 100% BORROW ($0 arte): reusa special/slam CAS-109 · STATUS_BUILDUP Pilar 21 · killEnemy loot · barra de jefe · POISE stagger ·
// doRoll/parry/backstab. NO crea enemigo nuevo, NO abre zona, NO toca trash. enabled:false ⇒ el jefe es el `calderatyrant` de
// HEAD, byte-idéntico (sin fases/ventana/feed/glyph).
//
// Arquitectura del build: el spawn MUTA e.special del jefe firma con los params de la fase activa (p1 al spawn, p2 en la
// transición) ⇒ cadencia/windup/slam leen e.special. Marca al spawn (spawnChampion) sólo el capstone de la Caldera con
// transitorios _sbPhase/_sbTransT/_sbVuln/_sbPoiseBase/_sbPoiseMul (save-neutral). Fase 1 = moveset de hoy (every 3, slam 14/24).
// Transición @ ≤50% HP (una sola vez, guard _sbPhase===1) abre ventana de vulnerabilidad (_sbVuln, transitionWindowMs, self-stun +
// flash) ⇒ el héroe pega ×transitionVulnMul. Fase 2 = moveset ampliado (every 2, slam 18/26, windup ≥ fase 1, poiseMul 1.4) y la
// Erupción monta slamInfl frost (marcado _sb) que alimenta h.bld por damageHero (Pilar 21) CAPEADO SÓLO en su tipo (cap<threshold
// ⇒ nunca one-shot; un feed genérico NO se capa ⇒ Pilar 21 intacto); respeta i-frames/dodge/parry. Poise-break escala el umbral
// ×poiseMul (en hitEnemy, lectura autoritativa) y abre poiseBreakStunMs. killEnemy rama champion firma: +essenceBonus + drop
// garantizado guaranteedRarity vía bossRng dedicado. 0 draws srand ⇒ srand ON==OFF.
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.sb* hooks sobre el capstone spawneado por el genuino
// spawnChampion (kill-quota met, sin atajo alrededor de la IA windup→strike/special ni del reward path). La QA live (hija)
// re-verifica sobre el build servido (glyph fase 1/2 + drop en el loop real).
//
// Prueba:
//   [content]  el knob SIGNATURE_BOSS existe (boss/zone/phase2HpPct/fases p1·p2/ailmentsToHero cap<threshold/rewards).
//   [AC0 OFF]  enabled=false ⇒ el jefe de la Caldera es el `calderatyrant` de HEAD: sin _sb*, Erupción 14 shards/24 dmg SIN infl,
//              la transición NO dispara al bajar HP; save byte-id.
//   [AC1 F1]   ON, HP>50% ⇒ moveset == capstone de hoy (Erupción 14/24, telegrafiada) + fase 1; sbMarked.
//   [AC2 TX]   bajar HP a ≤phase2HpPct ⇒ _sbPhase 1→2 UNA SOLA VEZ (no rebota), abre _sbVuln/transitionWindowMs + self-stun;
//              durante la ventana el héroe pega ×transitionVulnMul.
//   [AC3 F2]   fase 2 Erupción ampliada (18 shards/26 dmg, windup ≥ fase 1) y monta slamInfl frost marcado _sb.
//   [AC4 kit]  backstab por el arco trasero aplica BACKSTAB.mult; dodge i-frame NIEGA el slam+infl (sin feed).
//   [AC5 poise] poiseMul escala el umbral del jefe (fase 2 aguanta más, lectura por golpe); al romperse abre poiseBreakStunMs.
//   [AC6 feed] fase 2 slamInfl alimenta h.bld por damageHero CAPEADO a `cap` (< threshold ⇒ nunca one-shot); dodge evita el infl.
//   [AC7 rwd]  matar al jefe firma ⇒ +essenceBonus Esencia + ≥1 drop garantizado guaranteedRarity (reusa loot, bossRng).
//   [AC8 RNG]  srand ON==OFF 48-draw (transición+slam+feed 0-draw; reward vía bossRng); transFired/slamFired/fedHero; determinism.
//   [AC9 SAVE] serializeSave() byte-id ON/OFF, sin clave _sb*/sbPhase* (estado sólo en la entidad, no serializado).
//   [AC10 REG] Pilar 21 intacto (feed genérico NO capado) + pilares 1931/1926/1920 + core (Poise/Backstab) srand ON==OFF.
//
// Run: node tools/cas1947-signature-boss.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { SIGNATURE_BOSS, STATUS_BUILDUP } from "../sim/config.js";

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

try {
  // hero name has NO "_sb"/"signature" substring ⇒ save-key regex can't false-match.
  sim.createHero("FirmaQA", "warrior");

  // ---------- content sanity ----------
  const meta = d.sbMeta();
  const okContent = meta.enabled && meta.boss === "calderatyrant" && meta.zone === "caldera" && meta.phase2HpPct === 0.5
    && meta.phases && meta.phases.p1 && meta.phases.p2 && meta.phases.p2.slamInfl && meta.phases.p2.slamCount > meta.phases.p1.slamCount
    && meta.phases.p2.specialEvery < meta.phases.p1.specialEvery && meta.phases.p2.windup >= meta.phases.p1.windup
    && meta.phases.p2.poiseMul > meta.phases.p1.poiseMul
    && meta.ailmentsToHero && meta.ailmentsToHero.cap < STATUS_BUILDUP.types.frost.threshold
    && meta.rewards && meta.rewards.essenceBonus > 0 && meta.rewards.guaranteedRarity;
  if (okContent) pass(`content: SIGNATURE_BOSS knob (boss=${meta.boss} zone=${meta.zone} @≤${meta.phase2HpPct*100}%HP | p1 slam${meta.phases.p1.slamCount}/${meta.phases.p1.slamDmg} every${meta.phases.p1.specialEvery} | p2 slam${meta.phases.p2.slamCount}/${meta.phases.p2.slamDmg} every${meta.phases.p2.specialEvery} infl=${meta.phases.p2.slamInfl.type} poise×${meta.phases.p2.poiseMul} | vuln×${meta.transitionVulnMul} stun${meta.poiseBreakStunMs}ms | feed +${meta.ailmentsToHero.buildPerHit} cap${meta.ailmentsToHero.cap}<thr${STATUS_BUILDUP.types.frost.threshold} | reward +${meta.rewards.essenceBonus}ess/${meta.rewards.guaranteedRarity})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC0 OFF] byte-identical calderatyrant of HEAD ----------
  const offSnap = d._sbArm(false);
  const offFire = d._sbFireSpecial();
  const offTx = d._sbForcePhase2();               // enabled=false ⇒ transition gated off
  const off = offSnap && offFire && offTx
    && offSnap.sbMarked === false && offSnap.champion === true && offSnap.capstone === true
    && offFire.count === 14 && offFire.dmg === 24 && offFire.infl === null
    && (offTx.phaseAfter === undefined || offTx.phaseAfter === null);
  if (off) pass(`AC0 OFF: capstone byte-id HEAD (sbMarked=${offSnap.sbMarked}); Erupción ${offFire.count} shards/${offFire.dmg}dmg SIN infl(${offFire.infl===null}); bajar HP NO transiciona(phase=${offTx.phaseAfter})`);
  else fail(`AC0 OFF broke: snap=${J(offSnap)} fire=${J(offFire)} tx=${J(offTx)}`);

  // ---------- [AC1 Fase 1 baseline] ----------
  const f1 = d._sbArm(true);
  const f1Fire = d._sbFireSpecial();
  const ac1 = f1 && f1Fire && f1.sbMarked === true && f1.phase === 1
    && f1Fire.count === 14 && f1Fire.dmg === 24 && f1Fire.infl === null && f1Fire.phase === 1;
  if (ac1) pass(`AC1 Fase 1: sbMarked _sbPhase=${f1.phase}; moveset == capstone de hoy (Erupción ${f1Fire.count}/${f1Fire.dmg}, sin infl) — telegrafiado`);
  else fail(`AC1 broke: snap=${J(f1)} fire=${J(f1Fire)}`);

  // ---------- [AC2 Transición] (same boss instance) ----------
  const tx = d._sbForcePhase2();
  const vuln = d._sbVulnProbe();
  const ac2 = tx && vuln && tx.phaseBefore === 1 && tx.phaseAfter === 2 && tx.vuln === true
    && Math.abs(tx.transT - tx.expectWindow) < 0.05 && tx.stun > 0 && tx.reOpened === false && vuln.ok;
  if (ac2) pass(`AC2 Transición: _sbPhase 1→2 UNA VEZ (reOpened=${tx.reOpened}); _sbVuln=${tx.vuln} ventana ${tx.transT}s + self-stun ${tx.stun}s; héroe pega ×${vuln.ratio}≈${vuln.expect} (base ${vuln.baseDmg}→win ${vuln.winDmg})`);
  else fail(`AC2 broke: tx=${J(tx)} vuln=${J(vuln)}`);

  // ---------- [AC3 Fase 2 moveset] (boss now in phase 2) ----------
  const f2Fire = d._sbFireSpecial();
  const ac3 = f2Fire && f2Fire.phase === 2 && f2Fire.count === 18 && f2Fire.dmg === 26
    && f2Fire.infl && f2Fire.infl.type === "frost" && f2Fire.infl.sb === true
    && meta.phases.p2.windup >= meta.phases.p1.windup;
  if (ac3) pass(`AC3 Fase 2: Erupción ampliada ${f2Fire.count} shards/${f2Fire.dmg}dmg (>fase1), windup ${meta.phases.p2.windup}≥${meta.phases.p1.windup}; monta slamInfl ${f2Fire.infl.type} (_sb=${f2Fire.infl.sb})`);
  else fail(`AC3 broke: ${J(f2Fire)}`);

  // ---------- [AC4 kit: backstab + dodge] ----------
  const bs = d._sbBackstabProbe();
  const feed = d._sbHeroFeed();
  const ac4 = bs && feed && bs.ok && feed.dodgedNoFeed;
  if (ac4) pass(`AC4 kit: backstab arco trasero ×${bs.mult} (frente ${bs.frontDmg}→espalda ${bs.rearDmg}); dodge i-frame NIEGA slam+infl (dodgedNoFeed=${feed.dodgedNoFeed})`);
  else fail(`AC4 broke: backstab=${J(bs)} feed=${J(feed)}`);

  // ---------- [AC5 Poise-break] ----------
  const poise = d._sbPoiseProbe();
  const ac5 = poise && poise.scaled && poise.durOk;
  if (ac5) pass(`AC5 poise: fase 2 umbral ×poiseMul (${poise.pm1}→${poise.pm2}==${poise.expectPm2}, scaled=${poise.scaled}); al romperse abre ${poise.staggerT}s≈${poise.expectDur} (durOk=${poise.durOk})`);
  else fail(`AC5 broke: ${J(poise)}`);

  // ---------- [AC6 status al héroe CAPEADO] ----------
  const ac6 = feed && feed.ok;
  if (ac6) pass(`AC6 feed CAPEADO: 20 golpes slamInfl ⇒ h.bld.${feed.bt}=${feed.meter} ≤ cap ${feed.cap} (< threshold ⇒ nunca procea en una Erupción, capped=${feed.capped} belowThr=${feed.belowThreshold} noOneShot=${feed.noOneShot}); +${feed.fedPerHit}/golpe`);
  else fail(`AC6 broke: ${J(feed)}`);

  // ---------- [AC7 Drop garantizado] (fresh boss at caldera) ----------
  d._sbArm(true);
  const rwd = d._sbRewardProbe();
  const ac7 = rwd && rwd.ok;
  if (ac7) pass(`AC7 reward: matar jefe firma ⇒ +${rwd.essGain} Esencia (≥${rwd.essBonus}, essOk=${rwd.essOk}); drops ${J(rwd.rarities)} ⇒ ≥1 garantizado ${SIGNATURE_BOSS.rewards.guaranteedRarity}+ (${rwd.hasGuaranteed})`);
  else fail(`AC7 broke: ${J(rwd)}`);

  // ---------- [AC8 RNG-STRONG] ----------
  const SEED = 0x1947c0de, N = 48;
  const rON = d._sbSrandProbe(true, SEED, N);
  const rOFF = d._sbSrandProbe(false, SEED, N);
  const srandOk = rON.fingerprint.every((v, i) => v === rOFF.fingerprint[i]);
  if (rON.transFired && rON.slamFired && rON.fedHero && srandOk)
    pass(`AC8 RNG-STRONG: srand ON==OFF ${N}-draw (byte-idéntico aun transicionando+slam+feed); transFired=${rON.transFired} slamFired=${rON.slamFired} fedHero=${rON.fedHero} 0-draw (kill-reward vía bossRng)`);
  else {
    const diffs = rON.fingerprint.map((v, i) => `idx${i}:${v}vs${rOFF.fingerprint[i]}`).filter((_, i) => rON.fingerprint[i] !== rOFF.fingerprint[i]);
    fail(`AC8 RNG: srandOk=${srandOk} trans=${rON.transFired} slam=${rON.slamFired} fed=${rON.fedHero} — primeras diferencias: ${diffs.slice(0, 3).join(" | ")}`);
  }

  // ---------- [AC9 SAVE] ----------
  const sv = d._sbSaveByteId();
  if (sv && sv.ok)
    pass(`AC9 SAVE: serializeSave() byte-id ON/OFF(${sv.byteId}) sin clave _sb*/sbPhase*(${sv.noSbKey}); jefe marcado tras spawn(${sv.marked}) len=${sv.offLen}`);
  else fail(`AC9 SAVE broke: ${J(sv)}`);

  // ---------- [AC10 REG] Pilar 21 intacto (feed genérico NO capado) + recent pillars + core ----------
  sim.createHero("FirmaQA", "warrior");
  const gen = d._sbGenericFeedUncapped();
  if (gen && gen.ok) pass(`AC10 REG (Pilar 21 intacto): un feed frost NO-firma alcanza el proc (procd=${gen.procd}) ⇒ el cap NO es global (sin regresión STATUS_BUILDUP del héroe)`);
  else fail(`AC10 REG Pilar 21 regressed (feed genérico capado globalmente): ${J(gen)}`);

  const regSys = [
    ["Poise", 0x1826c0de, d.poiseSrandProbe],
    ["Backstab", 0x1836c0de, d.backstabSrandProbe],
  ];
  let regN = 0;
  for (const [name, sd, probe] of regSys) {
    if (!probe) { pass(`REG: ${name} absent — skipped`); continue; }
    const on = probe.call(d, true, sd, 24), o = probe.call(d, false, sd, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand BYTE-IDENTICAL ON vs OFF`); }
    else fail(`REG: ${name} srand regressed`);
  }
  const zoneReg = [
    ["Status-Buildup(1931)", 0x1931c0de, "buildupSrandProbe"],
    ["Weapon-Buffs(1926)", 0x1926c0de, "buffSrandProbe"],
    ["Throwables(1920)", 0x1920c0de, "throwSrandProbe"],
  ];
  for (const [name, sd, fn] of zoneReg) {
    sim.createHero("FirmaQA", "warrior");
    const probe = d[fn]; if (!probe) { pass(`REG: ${name} absent — skipped`); continue; }
    const on = probe.call(d, true, sd, 24), o = probe.call(d, false, sd, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand BYTE-IDENTICAL`); }
    else fail(`REG: ${name} regressed`);
  }
  pass(`AC10 REG: ${regN} sistemas srand ON==OFF (Poise + Backstab + Status-Buildup 1931 + Weapon-Buffs 1926 + Throwables 1920) + Pilar 21 no-regresión`);

} catch (e) {
  fail(`UNEXPECTED: ${e.message}\n${e.stack}`);
}

console.log();
if (ok) console.log("✔ CAS-1947 signature-boss — ALL PASS");
else console.error("✖ CAS-1947 signature-boss — FAILURES ABOVE");
process.exit(ok ? 0 : 1);
