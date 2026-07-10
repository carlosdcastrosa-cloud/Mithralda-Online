// ---------------------------------------------------------------------------
// CAS-1896 (build for CAS-1895) — EMPUÑADURA A DOS MANOS (Two-Handing, knob TWO_HAND). 15º pilar Souls-like. Un TOGGLE de
// postura ofensiva: agarrar el arma con las dos manos ENVAINA el escudo ⇒ más pegada a cambio de defensa. 100% BORROW
// sobre pilares vivos, hard-gated, RNG-neutral, save-neutral (toggle transitorio).
//
// Arquitectura: estado TRANSITORIO `h.twoHand` (mirror h.blocking, fuera del allowlist de serializeSave) ⇒ save.v1 byte-id
// y SIN clave nueva. Seams (todos gated TWO_HAND.enabled): (1) equipLoad(h) EXCLUYE el escudo a dos manos ⇒ ratio baja ⇒
// drop de banda (sinergia CAS-1889); (2) applyHeroMelee ×dmgMul en el daño + opt.twoHand ⇒ hitEnemy escala el poise-damage
// (POISE.gain CAS-1826) ×poiseMul; (3) heavyAttack/finisher gastan round(cost·stamMul) (STAMINA CAS-1841); (4) la rama de
// bloqueo de damageHero (SHIELD_BLOCK CAS-1873) SALE temprano a dos manos (reusa el gate h.blocking, sin nueva rama);
// (5) HUD DOM ($0 arte). CERO draws (NO twoHandRng) ⇒ srand ON==OFF byte-idéntico aun con la postura activa. HARD-GATED:
// enabled:false ⇒ toggle inerte, h.twoHand nunca sube, todas las ramas muertas ⇒ byte-idéntico a HEAD.
//
// Decisión de tecla (CTO): KeyH del spec YA es Parada con Tempo (CAS-1785) y las 26 letras + ShiftLeft(bloqueo)/Tab/Space/
// Digits están ocupadas ⇒ `ShiftRight` (libre, simétrico al ShiftLeft del bloqueo). Móvil = botón HUD toggle.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.twoHand* hooks, que corren los
// seams REALES (equipLoad / applyHeroMelee / heavyAttack / damageHero). La QA live (hija) re-verifica sobre el build servido.
//
// Prueba:
//   [AC toggle]     twoHandToggle alterna h.twoHand (una mano ⇄ dos manos).
//   [AC banda]      loadout rare ⇒ carga 'fat'; a dos manos el escudo sale de equipLoad ⇒ 'mid' ⇒ drop observable.
//   [AC dmg]        applyHeroMelee a dos manos pega ×dmgMul (ratio EXACTO robusto al valor base).
//   [AC poise]      el golpe acumula light×poiseMul a dos manos vs light a una mano (staggerea más rápido).
//   [AC stam]       el PODER-swing pesado gasta round(cost·stamMul) a dos manos vs cost a una mano.
//   [AC escudo DENY]guardia arriba + frontal: mitiga a una mano, DENY (daño completo) a dos manos.
//   [AC1 OFF]       enabled=false ⇒ forzar h.twoHand=true es INERTE (dmg/banda/escudo byte-id a HEAD).
//   [AC SAVE]       h.twoHand transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave two*.
//   [AC RNG-STRONG] script srand FIJO (48-draw) alrededor de un TOGGLE + swing + PODER-swing DISPARANDO REAL es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [REG]           los 14 pilares previos (Frenzy…Equip Load) siguen srand ON==OFF.
//
// Run: node tools/cas1895-two-hand.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { TWO_HAND, STAMINA, POISE } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// audio/view = deep no-op proxies. io minimal (blockHeld MUTABLE isn't needed — probes force h.blocking directly).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "twohand"/"twoHand"/"two" substring ⇒ the save-key regex can't false-match (mirror GuardiaQA/EstusQA).
  sim.createHero("DosManosQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.twoHandMeta();
  const numsOk = meta.dmgMul > 1 && meta.poiseMul > 1 && meta.stamMul > 1 && typeof meta.key === "string" && meta.key.length > 0;
  if (meta.enabled && numsOk && meta.dropsShield)
    pass(`content: TWO_HAND knob present (key=${meta.key} | dmgMul=${meta.dmgMul} | poiseMul=${meta.poiseMul} | stamMul=${meta.stamMul} | dropsShield=${meta.dropsShield} | moveMul=${meta.moveMul})`);
  else fail(`content wrong: ${J(meta)}`);
  // key deviation documented (KeyH taken by Parry CAS-1785 ⇒ ShiftRight)
  if (meta.key === "ShiftRight") pass(`content: tecla = ShiftRight (desvío documentado del spec KeyH, ya ocupada por Parada CAS-1785)`);
  else fail(`content: expected key ShiftRight, got ${meta.key}`);

  // ---------- [AC toggle]: twoHandToggle flips h.twoHand ----------
  d._twoHandArm();
  const s0 = d.twoHandState();
  const t1 = d.twoHandToggle();
  const t2 = d.twoHandToggle();
  if (s0 && s0.twoHand === false && t1 && t1.twoHand === true && t2 && t2.twoHand === false)
    pass(`AC toggle: postura alterna una-mano(${s0.twoHand}) → dos-manos(${t1.twoHand}) → una-mano(${t2.twoHand})`);
  else fail(`AC toggle broke: ${J({ s0, t1, t2 })}`);

  // ---------- [AC banda]: shield leaves equipLoad a dos manos ⇒ band drop ----------
  const eb = d.twoHandEquipBandProbe();
  if (eb && eb.ok)
    pass(`AC banda: loadout rare ⇒ banda '${eb.bandFull}' (ratio=${eb.ratioFull}); a dos manos el escudo SALE ⇒ '${eb.bandTwo}' (ratio=${eb.ratioTwo}) ⇒ drop observable (sinergia CAS-1889)`);
  else fail(`AC banda drop broke: ${J(eb)}`);

  // ---------- [AC dmg]: applyHeroMelee ×dmgMul ----------
  const dm = d.twoHandDmgProbe();
  if (dm && dm.ok)
    pass(`AC dmg: swing melee a una mano=${dm.dOff} vs dos manos=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(${dm.expect})`);
  else fail(`AC dmg ×dmgMul broke: ${J(dm)}`);

  // ---------- [AC poise]: hit poise-damage ×poiseMul ----------
  const pp = d.twoHandPoiseProbe();
  if (pp && pp.ok)
    pass(`AC poise: golpe a una mano acumula ${pp.pOff}(=light ${POISE.gain.light}) vs dos manos ${pp.pOn}(=light·poiseMul ${pp.expect}) ⇒ staggerea más rápido`);
  else fail(`AC poise ×poiseMul broke: ${J(pp)}`);

  // ---------- [AC stam]: heavy PODER-swing ×stamMul ----------
  const st = d.twoHandStamProbe();
  if (st && st.ok)
    pass(`AC stam: PODER-swing pesado gasta ${st.spentOff}(=cost ${st.expOff}) a una mano vs ${st.spentOn}(=round(cost·stamMul) ${st.expOn}) a dos manos`);
  else fail(`AC stam ×stamMul broke: ${J(st)}`);

  // ---------- [AC escudo DENY]: shield branch exits early a dos manos ----------
  const sd = d.twoHandShieldDenyProbe();
  if (sd && sd.ok)
    pass(`AC escudo DENY: sin bloquear=${sd.dU}; guardia a 1 mano MITIGA=${sd.dBlock}(<${sd.dU}); guardia+2 manos ⇒ DENY daño COMPLETO=${sd.dTwo}(==${sd.dU}) — reusa el gate, sin nueva rama`);
  else fail(`AC escudo DENY broke: ${J(sd)}`);

  // ---------- [AC1 OFF]: enabled=false ⇒ forced h.twoHand=true INERT ----------
  const off = d.twoHandOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: TWO_HAND.enabled=false ⇒ h.twoHand=true INERTE — dmg idéntico (${off.dForced}==${off.dRef}), banda idéntica (${off.bandForced}==${off.bandRef}, escudo sigue contando), escudo sigue mitigando (${off.dBlock}<${off.dU}) — byte-idéntico a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient toggle ⇒ save.v1 byte-identical, no key ----------
  const sb = d.twoHandSaveByteId();
  if (sb.ok)
    pass(`AC SAVE: h.twoHand transitorio ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave two* (hasKey=${sb.hasKey})`);
  else fail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: 48-draw fixed srand script (toggle+swing+heavy FIRING) — ON == OFF ----------
  const SEED = 0x1895c0de, N = 24;
  const rON = d.twoHandSrandProbe(true, SEED, N);
  const rOFF = d.twoHandSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around un TOGGLE + swing + PODER-swing real`);
  else fail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la empuñadura es input/aritmética (0 srand draws, no twoHandRng) aun disparando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.twoHandFired)
    pass(`AC RNG-STRONG: el probe ON SÍ activó la postura + escaló dmg/poise/stam consumiendo 0 srand — ejercitó la ruta de disparo real`);
  else fail(`AC RNG: two-hand did not fire on the ON probe: ${J({ twoHandFired: rON.twoHandFired })}`);
  const rON2 = d.twoHandSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC RNG determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 14 prior pillars) ----------
  // NB: la sonda de Bonfire REUBICA al héroe a una zona de caza (gotcha documentado) y la de EquipLoad es SENSIBLE A LA
  // POSICIÓN (su doRoll deny-vs-roll mueve al héroe ⇒ el loot compartido cae en zonas distintas). Por eso EquipLoad se
  // corre al FINAL con un HÉROE PRÍSTINO recién recreado en el pueblo (mirror gotcha cas1893). Los demás resetean su propio estado.
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
    ["Flask", 0x1854c0de, d.flaskSrandProbe],
    ["Bloodstain", 0x1867c0de, d.bloodstainSrandProbe],
    ["Shield", 0x1873c0de, d.shieldSrandProbe],
    ["Bonfire", 0x1879c0de, d.bonfireSrandProbe],
  ];
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`);
    else fail(`REG: ${name} srand regressed`);
  }
  // EquipLoad (14º pilar) — héroe PRÍSTINO en el pueblo para aislar la sensibilidad a zona del doRoll+loot.
  sim.createHero("DosManosQA", "warrior");
  if (d.equipSrandProbe) {
    const on = d.equipSrandProbe(true, 0x1889c0de, 24), o = d.equipSrandProbe(false, 0x1889c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) pass(`REG: EquipLoad srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`);
    else fail(`REG: EquipLoad srand regressed`);
  } else pass(`REG: EquipLoad srand probe absent — skipped`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1896 two-hand (Empuñadura a Dos Manos) harness: ALL PASS" : "\n❌ CAS-1896 two-hand (Empuñadura a Dos Manos) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
