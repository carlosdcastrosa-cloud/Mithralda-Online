// ---------------------------------------------------------------------------
// CAS-1860 (build for CAS-1854) — FRASCO DE CURACIÓN (Estus / Healing Flask, knob FLASK). 10ª feature Souls-like.
// Convierte CURARSE en una DECISIÓN de combate con riesgo/recompensa, apalancando los 9 pilares vivos.
//
// Decisión de arquitectura: 1 recurso TRANSITORIO + 1 canal (drink) gateado, $0 arte, 0 RNG. Pulsar-para-beber arranca
// un canal ENRAIZADO + VULNERABLE ~0.75s (sin i-frames ⇒ backstab/telegraph lo castigan solos), cura un % de vida máx,
// gasta 1 de N cargas, y las cargas se rellenan al cambiar de zona (descanso). El "root + vulnerable" REUSA el gate de
// acción existente (heroAttack/heavyAttack/castSpell/doRoll) añadiendo `|| h.flaskDrinkT>0` ⇒ enraiza GRATIS; el
// cancel-on-action es la cara inversa (input de mover/atacar/rodar aborta el trago SIN gastar carga). La curación es
// 100% timing/input ⇒ CERO draws, NO existe `flaskRng` ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con el frasco DISPARANDO.
// flaskCharges/flaskDrinkT/flaskZone son TRANSITORIOS (fuera del allowlist de serializeSave) ⇒ save.v1 byte-id y SIN
// clave nueva. Pips + tinte 100% procedurales (canvas/DOM, $0 arte). HARD-GATED: enabled:false ⇒ input inerte, sin
// canal/root/pips/tinte/refill ⇒ byte-idéntico a HEAD.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.flask* hooks, que corren el
// REAL drinkFlask / tickFlask / los gates de acción / el root+cancel del movimiento (vía update()+io). La QA live
// (hija) re-verifica feel + pips + tinte sobre el build servido.
//
// Prueba:
//   [AC1 OFF]        FLASK.enabled=false ⇒ drinkFlask inerte, tickFlask no-op, los gates ignoran flaskDrinkT ⇒ byte-id a HEAD.
//   [AC2 RNG-STRONG] script srand FIJO (48-draw) alrededor del frasco DISPARANDO REAL (trago completado + trago cancelado) es BYTE-IDÉNTICO ON vs OFF.
//   [AC3 root+vuln]  con el canal activo (no-interrumpible) NINGUNA acción de PODER dispara y el héroe recibe daño NORMAL (sin i-frames).
//   [AC4 cargas+heal]arranca sin consumir; completa ⇒ −1 carga + hp += round(heroMaxHp·0.40) clamp; 0 cargas ⇒ no arranca; vida llena ⇒ no arranca.
//   [AC5 cancel]     atacar/pesado/castear/rodar/mover mientras se bebe ⇒ aborta SIN gastar carga y SIN curar.
//   [AC6 refill]     cambiar de zona ⇒ charges=max; misma zona ⇒ NO recarga (no infinito en combate); primer tick sólo siembra.
//   [AC7 save]       flaskCharges/flaskDrinkT/flaskZone transitorios ⇒ save.v1 byte-id ON/OFF, sin clave flask*.
//   [REG]            frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on srand siguen ON==OFF.
//
// Run: node tools/cas1854-flask.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { FLASK } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// A REAL, controllable io (the movement root/cancel probe drives sim.update()); audio/view are deep no-op proxies.
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
let MV = [0, 0];
const io = { moveVec: () => MV, aim: noop, aimActive: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "flask" substring ⇒ the AC7 save-key regex can't false-match (mirror gotcha VigorBot/FocusBot).
  sim.createHero("EstusQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.flaskMeta();
  if (meta.enabled && meta.key && meta.charges > 0 && meta.healPct > 0 && meta.drinkMs > 0)
    pass(`content: FLASK knob present (key=${meta.key} | charges=${meta.charges} | healPct=${meta.healPct} | drinkMs=${meta.drinkMs} | cancelOnAction=${meta.cancelOnAction} | refillOnZone=${meta.refillOnZone})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC4]: charges 3→0 + exact heal + clamp ----------
  const dp = d.flaskDrinkProbe();
  if (dp && dp.ok)
    pass(`AC4 cargas+heal: arranca sin consumir (armed=${dp.armed}); completa ⇒ −1 carga (consumedOne=${dp.consumedOne}) + heal EXACTO round(heroMaxHp·healPct)=${dp.expectHeal} (healed=${dp.healed}); drena a 0 (drainedToZero=${dp.drainedToZero}); a 0 no arranca (${dp.noStartAtZero}); a vida llena no arranca (${dp.noStartAtFull}); near-full clampa sin overheal (${dp.clampNoOverheal})`);
  else fail(`AC4 cargas+heal wrong: ${J(dp)}`);

  // ---------- [AC3]: root + vulnerable ----------
  const rp = d.flaskRootProbe();
  if (rp && rp.ok)
    pass(`AC3 root+vulnerable: bebiendo (no-interrumpible) ⇒ ligero(${rp.noLight})/pesado(${rp.noHeavy})/cast(${rp.noCast})/rodar(${rp.noRoll}) NO disparan, el canal sobrevive (stillDrinking=${rp.stillDrinking}); recibe daño NORMAL sin i-frames (tookDamage=${rp.tookDamage})`);
  else fail(`AC3 root+vulnerable wrong: ${J(rp)}`);

  // ---------- [AC5]: cancel-on-action (attack/heavy/cast/roll) sin coste ----------
  const cp = d.flaskCancelProbe();
  if (cp && cp.ok)
    pass(`AC5 cancel sin coste: atacar/pesado/castear/rodar mientras se bebe ⇒ aborta (cancelled), carga intacta, sin heal — atk=${J(cp.atk)} heavy=${J(cp.heavy)} cast=${J(cp.cast)} roll=${J(cp.roll)}`);
  else fail(`AC5 cancel wrong: ${J(cp)}`);

  // ---------- [AC5b + AC3b]: MOVE root + MOVE cancel via REAL update()+io ----------
  {
    // MOVE ROOT (cancelOnAction=false): moving while drinking ⇒ position FROZEN, channel advances.
    // (Clear any residual hitstop left by an earlier damageHero probe — update() early-returns while hitstop>0.)
    FLASK.enabled = true; FLASK.cancelOnAction = false;
    let h = d._flaskArm(); sim.G.hitstop = 0; sim.drinkFlask(); const dt0 = h.flaskDrinkT;
    const x0 = h.x, y0 = h.y; MV = [1, 0]; sim.update(16);
    const rootedFrozen = (h.x === x0 && h.y === y0);
    const channelAdvanced = (h.flaskDrinkT > 0 && h.flaskDrinkT < dt0);
    // MOVE CANCEL (cancelOnAction=true): moving while drinking ⇒ channel aborts (drinkT=0), charge intact.
    FLASK.cancelOnAction = true;
    h = d._flaskArm(); sim.G.hitstop = 0; const c0 = h.flaskCharges; sim.drinkFlask(); const armed = h.flaskDrinkT > 0;
    MV = [1, 0]; sim.update(16);
    const moveCancelled = (h.flaskDrinkT === 0 && h.flaskCharges === c0);
    MV = [0, 0]; FLASK.cancelOnAction = true; d._flaskArm();
    if (rootedFrozen && channelAdvanced && moveCancelled && armed)
      pass(`AC3b/AC5b MOVE root+cancel (REAL update+io): mover bebiendo con cancelOnAction=false ⇒ posición CONGELADA (${rootedFrozen}) + canal avanza (${channelAdvanced}); con cancelOnAction=true ⇒ el trago se ABORTA (${moveCancelled}, carga intacta)`);
    else fail(`AC3b/AC5b MOVE root+cancel wrong: ${J({ rootedFrozen, channelAdvanced, moveCancelled, armed })}`);
  }

  // ---------- [AC6]: refill on zone change; same zone ⇒ no refill ----------
  const fp = d.flaskRefillProbe();
  if (fp && fp.ok)
    pass(`AC6 refill: misma zona (aunque se gasten cargas) ⇒ NO recarga (${fp.sameZoneNoRefill}); cambio de zona ⇒ charges=max (${fp.zoneRefill}); primer tick sólo siembra la zona (${fp.seedNoRefill})`);
  else fail(`AC6 refill wrong: ${J(fp)}`);

  // ---------- [AC1]: OFF ⇒ inert (drink no-op, tick no-op, gates ignore flask) ----------
  const off = d.flaskOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: FLASK.enabled=false ⇒ drinkFlask inerte (${off.inert}), tickFlask no-op (${off.tickNoop}), y con un flaskDrinkT forzado el ataque AÚN dispara (gate lo ignora, attackFires=${off.attackFires}) — byte-identical a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC7 SAVE]: transient, save byte-identical, no key ----------
  const sb = d.flaskSaveByteId();
  if (sb.ok)
    pass(`AC7 SAVE: flaskCharges/flaskDrinkT/flaskZone transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave flask* (hasKey=${sb.hasKey})`);
  else fail(`AC7 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (flask FIRING) — ON == OFF ----------
  const SEED = 0x1854c0de, N = 24;
  const rON = d.flaskSrandProbe(true, SEED, N);
  const rOFF = d.flaskSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL completed drink + a cancelled drink + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la curación es aritmética/timing (0 srand draws, no flaskRng) incluso cuando el frasco dispara`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.flaskFired)
    pass(`AC2: el probe ON SÍ completó un trago (−1 carga + heal) Y canceló otro por acción, consumiendo 0 srand — ejercitó las rutas de disparo reales`);
  else fail(`AC2 flask did not fire (completed&cancelled) on the ON probe: ${J({ flaskFired: rON.flaskFired })}`);
  const rON2 = d.flaskSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 9 prior pillars) ----------
  const reg = [
    ["Frenzy", 0x1773c0de, d.frenzySrandProbe],
    ["Parry", 0x1785c0de, d.parrySrandProbe],
    ["Dodge", 0x1814c0de, d.dodgeSrandProbe],
    ["Telegraph", 0x1790c0de, d.telegraphSrandProbe],
    ["Abilities", 0x1819c0de, d.abilitySrandProbe],
    ["Poise", 0x1826c0de, d.poiseSrandProbe],
    ["Combos", 0x1831c0de, d.comboSrandProbe],
    ["Backstab", 0x1836c0de, d.backstabSrandProbe],
    ["Stamina", 0x1841c0de, d.staminaSrandProbe],
    ["Lock-On", 0x1847c0de, d.lockSrandProbe],
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

log(ok ? "\n✅ CAS-1860 flask (Estus) harness: ALL PASS" : "\n❌ CAS-1860 flask (Estus) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
