// ---------------------------------------------------------------------------
// CAS-2107 (Build DARK for umbrella CAS-2105) — CONTRAGOLPE DE GUARDIA (Guard Counter, knob GUARD_COUNTER). 33ª mecánica
// Souls-like. Convierte el BLOQUEO con escudo (SHIELD_BLOCK CAS-1873, hoy 100% defensivo/pasivo) en oportunidad OFENSIVA:
// tras ABSORBER un golpe melee frontal con la guardia SIN romperla, se abre una ventana breve (windowS) en la que el
// SIGUIENTE swing LIGHT del héroe se convierte en un Contragolpe — daño ×dmgMul + poise-damage ×poiseMul (ALTO ⇒ eje de
// stagger/rotura). NO exige timing en la parada (distinto de PARRY CAS-1785). 100% BORROW, hard-gated, RNG-neutral, save-neutral.
//
// Arquitectura: estado TRANSITORIO `h.guardCounterT` (mirror h.parryT/h.blocking, fuera del allowlist de serializeSave) ⇒
// save.v1 byte-id y SIN clave nueva; decae por dt en tickGuardCounter. Seams (todos gated GUARD_COUNTER.enabled):
//   (1) rama BLOQUEO OK de damageHero (no-break) ⇒ abre h.guardCounterT=windowS; la RUPTURA NO abre (sin premio); ranged
//       (src=null) ni entra a la rama; dos manos (escudo envainado) sale temprano ⇒ ninguno abre.
//   (2) applyHeroMelee: un swing LIGHT en ventana ⇒ dmg ×dmgMul, opt.guardCounter ⇒ hitEnemy escala POISE.gain ×poiseMul,
//       gasta staminaCost (STAMINA CAS-1841) y cierra la ventana (h.guardCounterT=0). Sin ventana ⇒ swing byte-idéntico.
// CERO draws (NO guardCounterRng) ⇒ srand ON==OFF byte-idéntico aun con el contragolpe disparando. HARD-GATED: enabled:false
// ⇒ h.guardCounterT nunca sube, ramas muertas ⇒ byte-idéntico a HEAD (OFF==baseline). $0 arte (VFX = primitiva canvas existente).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.guardCounter* hooks, que corren los
// seams REALES (damageHero / applyHeroMelee / hitEnemy). La QA OBSERVABLE (hija de CAS-2105) re-verifica sobre el build servido.
//
// Prueba:
//   [AC ventana]    bloqueo OK (no-break) frontal ABRE la ventana; ruptura/ranged/dos-manos NO abren.
//   [AC dmg]        applyHeroMelee en ventana pega ×dmgMul, consume la ventana y gasta staminaCost.
//   [AC poise]      el contragolpe acumula light×poiseMul (staggerea/rompe más rápido).
//   [AC OFF]        enabled=false ⇒ bloqueo NO abre ventana + forzar guardCounterT>0 es INERTE (dmg byte-id a HEAD).
//   [AC SAVE]       h.guardCounterT transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave guardCounter*.
//   [AC RNG-STRONG] script srand FIJO (48-draw) alrededor de un BLOQUEO que abre + un swing que consume (disparando real) BYTE-IDÉNTICO ON vs OFF.
//   [REG]           las mecánicas previas (Frenzy…Two-Hand…Shield) siguen srand ON==OFF (0 regresión).
//
// Run: node tools/cas2107-guard-counter.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { GUARD_COUNTER, STAMINA, POISE } from "../sim/config.js";

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

  // NB: hero name has NO "guard"/"counter" substring ⇒ the save-key regex can't false-match (mirror GuardiaQA/EstusQA).
  sim.createHero("BraceQA", "warrior");

  // ---------- content sanity: the knob (DARK: enabled:false shipped) ----------
  const meta = d.guardCounterMeta();
  const numsOk = meta.windowS > 0 && meta.dmgMul > 1 && meta.poiseMul > 1 && meta.staminaCost >= 0;
  if (numsOk) lpass(`content: GUARD_COUNTER knob present (enabled=${meta.enabled} | windowS=${meta.windowS} | dmgMul=${meta.dmgMul} | poiseMul=${meta.poiseMul} | staminaCost=${meta.staminaCost})`);
  else lfail(`content wrong: ${J(meta)}`);
  if (meta.enabled === false) lpass(`content: SHIP DARK — enabled=false (el CEO flipea en el Gate)`);
  else lfail(`content: expected enabled=false (DARK), got ${meta.enabled}`);

  // ---------- [AC ventana]: bloqueo OK abre; ruptura/ranged/dos-manos NO abren ----------
  const wp = d.guardCounterWindowProbe();
  if (wp && wp.ok)
    lpass(`AC ventana: bloqueo OK (no-break) ABRE guardCounterT=${wp.openT}(==windowS ${meta.windowS}, noBreak=${wp.noBreak}); ruptura NO abre (${wp.brokeNoOpen}); ranged NO abre (${wp.rangedNoOpen}); dos-manos NO abre (${wp.twoHandNoOpen})`);
  else lfail(`AC ventana broke: ${J(wp)}`);

  // ---------- [AC dmg]: contragolpe ×dmgMul + consume + stam ----------
  const dm = d.guardCounterDmgProbe();
  if (dm && dm.ok)
    lpass(`AC dmg: swing sin ventana=${dm.dOff} vs en ventana=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(${dm.expect}); consume ventana (${dm.consumed}); gasta ${dm.stSpent}==staminaCost(${meta.staminaCost})`);
  else lfail(`AC dmg ×dmgMul broke: ${J(dm)}`);

  // ---------- [AC poise]: contragolpe poise-damage ×poiseMul ----------
  const pp = d.guardCounterPoiseProbe();
  if (pp && pp.ok)
    lpass(`AC poise: swing sin ventana acumula ${pp.pOff}(=light ${POISE.gain.light}) vs contragolpe ${pp.pOn}(=light·poiseMul ${pp.expect}) ⇒ rompe postura más rápido`);
  else lfail(`AC poise ×poiseMul broke: ${J(pp)}`);

  // ---------- [AC OFF]: enabled=false ⇒ no abre + forzar guardCounterT INERTE ----------
  const off = d.guardCounterOffProbe();
  if (off && off.ok)
    lpass(`AC OFF: GUARD_COUNTER.enabled=false ⇒ bloqueo NO abre ventana (${off.noOpen}) + forzar guardCounterT>0 INERTE — dmg idéntico (${off.dForced}==${off.dRef}) ⇒ rama de ataque byte-idéntica a HEAD`);
  else lfail(`AC OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient window ⇒ save.v1 byte-identical, no key ----------
  const sb = d.guardCounterSaveByteId();
  if (sb.ok)
    lpass(`AC SAVE: h.guardCounterT transitorio ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave guardCounter* (hasKey=${sb.hasKey})`);
  else lfail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: 48-draw fixed srand script (bloqueo-abre + swing-consume FIRING) — ON == OFF ----------
  const SEED = 0x2107c0de, N = 24;
  const rON = d.guardCounterSrandProbe(true, SEED, N);
  const rOFF = d.guardCounterSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) lpass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around un BLOQUEO que abre + un swing que consume real`);
  else lfail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    lpass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el contragolpe es timing/aritmética (0 draws, no guardCounterRng) aun disparando`);
  else lfail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.counterFired)
    lpass(`AC RNG-STRONG: el probe ON SÍ abrió la ventana + consumió el contragolpe con 0 srand — ejercitó la ruta de disparo real`);
  else lfail(`AC RNG: guard-counter did not fire on the ON probe: ${J({ counterFired: rON.counterFired })}`);
  const rON2 = d.guardCounterSrandProbe(true, SEED, N);
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
  sim.createHero("BraceQA", "warrior");
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

log(ok ? "\n✅ CAS-2107 guard-counter (Contragolpe de Guardia, mec #33 DARK) harness: ALL PASS" : "\n❌ CAS-2107 guard-counter harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
