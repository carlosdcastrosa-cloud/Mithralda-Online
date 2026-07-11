// ---------------------------------------------------------------------------
// CAS-2110 (Build DARK, umbrella) — CONTRAATAQUE DE ESQUIVA / PERFECT DODGE COUNTER (knob DODGE_COUNTER). 34ª mecánica
// Souls-like. Cierra el gap #2 del audit de cohesión CAS-2085: el Guard Counter (#33, CAS-2105) premia BLOQUEAR pero
// REQUIERE escudo ⇒ las clases ranged/sin-escudo no tienen conversión defensa→ofensiva. Esta mecánica da esa conversión
// vía el verbo ESQUIVA (universal, todas las clases): una ESQUIVA PERFECTA (i-frames de un ROLL activo que SOLAPAN un
// ataque que HABRÍA conectado — ya detectada por perfectDodge()) abre una ventana breve donde el SIGUIENTE swing LIGHT
// pega reforzado — daño ×dmgMul + poise-damage ×poiseMul. Números POR DEBAJO del Guard Counter (dmg 1.5<1.8, poise
// 2.0<2.5, stam 6<10) porque la esquiva es más accesible. 100% BORROW, hard-gated, RNG-neutral, save-neutral.
//
// Arquitectura: estado TRANSITORIO `h.dodgeCounterT` (mirror h.guardCounterT/h.parryT, fuera del allowlist de
// serializeSave) ⇒ save.v1 byte-id y SIN clave nueva; decae por dt en tickDodgeCounter. Seams (todos gated DODGE_COUNTER.enabled):
//   (1) perfectDodge (llamado por damageHero SÓLO cuando los i-frames de un roll activo niegan un golpe real entrante) ⇒
//       si el rodar arrancó hace ≤ perfectWindowMs (h._rollAge) ⇒ abre h.dodgeCounterT=windowS. Un rodar VIEJO o un
//       i-frame de MERCED (sin rolling) NO abren.
//   (2) applyHeroMelee: un swing LIGHT en ventana ⇒ dmg ×dmgMul, opt.dodgeCounter ⇒ hitEnemy escala POISE.gain ×poiseMul,
//       gasta staminaCost (STAMINA CAS-1841) y cierra la ventana (h.dodgeCounterT=0). Sin ventana ⇒ swing byte-idéntico.
//   (3) Composición con GUARD_COUNTER (AC3): una esquiva NIEGA el hit ANTES de la rama de bloqueo ⇒ nunca abren ambas por
//       el mismo evento; y en un swing con ambas ventanas abiertas, dc está gated en `!gc` ⇒ nunca multiplican los dos.
// CERO draws (NO dodgeCounterRng) ⇒ srand ON==OFF byte-idéntico aun con el contragolpe disparando. HARD-GATED: enabled:false
// ⇒ h.dodgeCounterT nunca sube, ramas muertas ⇒ byte-idéntico a HEAD (OFF==baseline). $0 arte (VFX = primitiva canvas existente).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.dodgeCounter* hooks, que corren los
// seams REALES (damageHero → perfectDodge / applyHeroMelee / hitEnemy). La QA OBSERVABLE re-verifica sobre el build servido.
//
// Prueba:
//   [AC ventana]    esquiva perfecta (rolling+iframe+rollAge≤perfectWindowMs) niega un golpe real ⇒ ABRE; rodar viejo /
//                   i-frame de merced NO abren; UNIVERSAL: abre igual en clase sin-escudo/ranged (mage).
//   [AC dmg]        applyHeroMelee en ventana pega ×dmgMul, consume la ventana y gasta staminaCost.
//   [AC poise]      el contragolpe acumula light×poiseMul (staggerea/rompe más rápido).
//   [AC compose]    con GUARD_COUNTER: mismo evento ⇒ sólo dodge abre (bloqueo nunca corre); mismo swing ⇒ sólo guard-mul (dc gated !gc).
//   [AC OFF]        enabled=false ⇒ esquiva NO abre ventana + forzar dodgeCounterT>0 es INERTE (dmg byte-id a HEAD).
//   [AC SAVE]       h.dodgeCounterT/_rollAge transitorios ⇒ serializeSave() byte-id ON/OFF, sin clave dodgeCounter*/rollAge*.
//   [AC RNG-STRONG] script srand FIJO (48-draw) alrededor de una esquiva que abre + un swing que consume (disparando real) BYTE-IDÉNTICO ON vs OFF.
//   [REG]           las mecánicas previas (Frenzy…Two-Hand…Shield…Guard-Counter) siguen srand ON==OFF (0 regresión).
//
// Run: node tools/cas2110-dodge-counter.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { DODGE_COUNTER, GUARD_COUNTER, STAMINA, POISE } from "../sim/config.js";

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

function runOnce(tag) {
  let localOk = true;
  const lfail = (m) => { localOk = false; ok = false; console.error(`✖ [${tag}] ${m}`); };
  const lpass = (m) => log(`✔ [${tag}] ${m}`);

  // NB: hero name has NO "dodge"/"counter"/"roll" substring ⇒ the save-key regex can't false-match.
  sim.createHero("EvadeQA", "warrior");

  // ---------- content sanity: the knob (DARK: enabled:false shipped) ----------
  const meta = d.dodgeCounterMeta();
  const numsOk = meta.windowS > 0 && meta.dmgMul > 1 && meta.poiseMul > 1 && meta.staminaCost >= 0 && meta.perfectWindowMs > 0;
  if (numsOk) lpass(`content: DODGE_COUNTER knob present (enabled=${meta.enabled} | windowS=${meta.windowS} | dmgMul=${meta.dmgMul} | poiseMul=${meta.poiseMul} | staminaCost=${meta.staminaCost} | perfectWindowMs=${meta.perfectWindowMs} | requiresShield=${meta.requiresShield})`);
  else lfail(`content wrong: ${J(meta)}`);
  if (meta.enabled === false) lpass(`content: SHIP DARK — enabled=false (el CEO flipea en el Gate CAS-2111)`);
  else lfail(`content: expected enabled=false (DARK), got ${meta.enabled}`);
  // paridad de identidad: números por debajo del Guard Counter (esquiva más accesible)
  const gm = { dmgMul: GUARD_COUNTER.dmgMul, poiseMul: GUARD_COUNTER.poiseMul, staminaCost: GUARD_COUNTER.staminaCost };
  if (meta.dmgMul < gm.dmgMul && meta.poiseMul < gm.poiseMul && meta.staminaCost < gm.staminaCost && meta.requiresShield === false)
    lpass(`content: paridad — dmg ${meta.dmgMul}<${gm.dmgMul}, poise ${meta.poiseMul}<${gm.poiseMul}, stam ${meta.staminaCost}<${gm.staminaCost} (Guard), UNIVERSAL requiresShield=false`);
  else lfail(`content: paridad rota vs GUARD_COUNTER: dodge=${J(meta)} guard=${J(gm)}`);

  // ---------- [AC ventana]: esquiva perfecta abre; rodar viejo / merced NO; UNIVERSAL ranged abre ----------
  const wp = d.dodgeCounterWindowProbe();
  if (wp && wp.ok)
    lpass(`AC ventana: esquiva perfecta ABRE dodgeCounterT=${wp.openT}(==windowS ${meta.windowS}); rodar viejo NO abre (${wp.staleNoOpen}); i-frame merced NO abre (${wp.mercyNoOpen}); UNIVERSAL clase ranged/mage ABRE (${wp.rangedOpen})`);
  else lfail(`AC ventana broke: ${J(wp)}`);

  // ---------- [AC dmg]: contragolpe ×dmgMul + consume + stam ----------
  const dm = d.dodgeCounterDmgProbe();
  if (dm && dm.ok)
    lpass(`AC dmg: swing sin ventana=${dm.dOff} vs en ventana=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(${dm.expect}); consume ventana (${dm.consumed}); gasta ${dm.stSpent}==staminaCost(${meta.staminaCost})`);
  else lfail(`AC dmg ×dmgMul broke: ${J(dm)}`);

  // ---------- [AC poise]: contragolpe poise-damage ×poiseMul ----------
  const pp = d.dodgeCounterPoiseProbe();
  if (pp && pp.ok)
    lpass(`AC poise: swing sin ventana acumula ${pp.pOff}(=light ${POISE.gain.light}) vs contragolpe ${pp.pOn}(=light·poiseMul ${pp.expect}) ⇒ rompe postura más rápido`);
  else lfail(`AC poise ×poiseMul broke: ${J(pp)}`);

  // ---------- [AC compose]: con GUARD_COUNTER sin colisión ----------
  const cp = d.dodgeCounterComposeProbe();
  if (cp && cp.ok)
    lpass(`AC compose: mismo evento ⇒ SÓLO dodge abre (${cp.dodgeOpened}), bloqueo nunca corre (guardStayedClosed=${cp.guardStayedClosed}); mismo swing con ambas ⇒ ratio=${cp.ratioBoth}==guardMul(sólo guard, ${cp.onlyGuard}), esquiva NO consumida (${cp.dodgeNotConsumed}), guard consumido (${cp.guardConsumed})`);
  else lfail(`AC compose broke: ${J(cp)}`);

  // ---------- [AC OFF]: enabled=false ⇒ no abre + forzar dodgeCounterT INERTE ----------
  const off = d.dodgeCounterOffProbe();
  if (off && off.ok)
    lpass(`AC OFF: DODGE_COUNTER.enabled=false ⇒ esquiva NO abre ventana (${off.noOpen}) + forzar dodgeCounterT>0 INERTE — dmg idéntico (${off.dForced}==${off.dRef}) ⇒ rama de ataque byte-idéntica a HEAD`);
  else lfail(`AC OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient window ⇒ save.v1 byte-identical, no key ----------
  const sb = d.dodgeCounterSaveByteId();
  if (sb.ok)
    lpass(`AC SAVE: h.dodgeCounterT/_rollAge transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave dodgeCounter*/rollAge* (hasKey=${sb.hasKey})`);
  else lfail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: 48-draw fixed srand script (esquiva-abre + swing-consume FIRING) — ON == OFF ----------
  const SEED = 0x2110c0de, N = 24;
  const rON = d.dodgeCounterSrandProbe(true, SEED, N);
  const rOFF = d.dodgeCounterSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) lpass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around una esquiva que abre + un swing que consume real`);
  else lfail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    lpass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el contragolpe es timing/aritmética (0 draws, no dodgeCounterRng) aun disparando`);
  else lfail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.counterFired)
    lpass(`AC RNG-STRONG: el probe ON SÍ abrió la ventana + consumió el contragolpe con 0 srand — ejercitó la ruta de disparo real`);
  else lfail(`AC RNG: dodge-counter did not fire on the ON probe: ${J({ counterFired: rON.counterFired })}`);
  const rON2 = d.dodgeCounterSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) lpass(`AC RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else lfail(`AC RNG determinism broke`);

  return localOk;
}

try {
  // PASS×2 (mirror el chain): dos corridas independientes deben ambas PASAR.
  const p1 = runOnce("run1");
  const p2 = runOnce("run2");
  if (p1 && p2) pass(`PASS×2: ambas corridas independientes PASARON`);
  else fail(`PASS×2 broke: run1=${p1} run2=${p2}`);

  // ---------- [REG]: existing srand probes stay ON==OFF (0 regresión en las mecánicas vivas) ----------
  sim.createHero("EvadeQA", "warrior");
  const reg = [
    ["Frenzy", 0x1773c0de, d.frenzySrandProbe],
    ["Parry", 0x1785c0de, d.parrySrandProbe],
    ["Dodge", 0x1814c0de, d.dodgeSrandProbe],
    ["Telegraph", 0x1790c0de, d.telegraphSrandProbe],
    ["Poise", 0x1826c0de, d.poiseSrandProbe],
    ["Combos", 0x1831c0de, d.comboSrandProbe],
    ["Backstab", 0x1836c0de, d.backstabSrandProbe],
    ["Stamina", 0x1841c0de, d.staminaSrandProbe],
    ["Flask", 0x1854c0de, d.flaskSrandProbe],
    ["Bloodstain", 0x1867c0de, d.bloodstainSrandProbe],
    ["Shield", 0x1873c0de, d.shieldSrandProbe],
    ["Two-Hand", 0x1895c0de, d.twoHandSrandProbe],
    ["Guard-Counter", 0x2107c0de, d.guardCounterSrandProbe],
  ];
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`);
    else fail(`REG: ${name} srand regressed`);
  }

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-2110 dodge-counter (Contraataque de Esquiva, mec #34 DARK) harness: ALL PASS" : "\n❌ CAS-2110 dodge-counter harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
