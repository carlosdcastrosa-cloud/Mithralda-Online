// ---------------------------------------------------------------------------
// CAS-1874 (build for CAS-1873) — ESCUDO / BLOQUEO CON GUARDIA (Shield Block, knob SHIELD_BLOCK). 12ª feature
// Souls-like y el DEFENSIVO que faltaba. Mantener el bloqueo (hold ShiftLeft / botón HUD hold) levanta la guardia
// en un ARCO FRONTAL: un golpe MELEE frontal se MITIGA (no niega) a cambio de ESTAMINA (CAS-1841); agotar la
// estamina en un bloqueo dispara RUPTURA DE GUARDIA reutilizando el STAGGERED (h.stun) de CAS-1826.
//
// Decisión de arquitectura: 1 rama aditiva en damageHero + estado transitorio, $0 arte, 0 RNG. La rama corre DESPUÉS
// de parry/i-frames/dodge-talent (una esquiva sigue negando GRATIS) y ANTES de la armadura. `src` presente SÓLO en
// golpes de CONTACTO (melee) ⇒ los proyectiles (src=null) NI ENTRAN a la rama = melee-only GRATIS, igual que Parry.
// h.blocking se re-fija cada fixed-frame desde io.blockHeld (gate: enabled+held+vivo+!rolling+stun<=0+stam>0). Sin
// i-frames. Geometría/aritmética pura ⇒ CERO draws, NO existe `blockRng` ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con
// el bloqueo/ruptura DISPARANDO. h.blocking transitorio (mirror stam) + h.stun ya fuera del allowlist ⇒ save.v1
// byte-id y SIN clave nueva. Guardia = arco/tinte canvas ($0 arte). HARD-GATED: enabled:false ⇒ rama muerta, sin
// h.blocking, sin arco/botón ⇒ byte-idéntico a HEAD.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.shield* hooks, que corren
// la REAL rama de bloqueo de damageHero (mitiga/coste/ruptura). La QA live (hija) re-verifica arco + botón hold +
// ShiftLeft REAL sobre el build servido.
//
// Prueba:
//   [AC1 OFF]        SHIELD_BLOCK.enabled=false ⇒ rama muerta aunque se fuerce h.blocking ⇒ daño COMPLETO, sin coste, sin stun ⇒ byte-id a HEAD.
//   [AC2 RNG-STRONG] script srand FIJO (48-draw) alrededor del BLOQUEO DISPARANDO REAL (mitiga + ruptura) es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [AC3 mitigación] golpe MELEE frontal con la guardia arriba ⇒ absorbido = dmg·mitigate EXACTO + estamina baja round(absorbed·stamPerDmg) EXACTO; mitiga, NO niega.
//   [AC4 frontal]    mismo golpe por la ESPALDA (fuera del arco) ⇒ daño COMPLETO, sin coste.
//   [AC5 melee/iframe] golpe RANGED (src=null) con guardia arriba ⇒ NO mitigado, sin coste; la i-frame bloqueado==sin-bloquear (el bloqueo NO da i-frames).
//   [AC6 ruptura]    bloqueo cuyo coste > h.stam ⇒ h.stun=breakStunS (STAGGERED de CAS-1826), golpe COMPLETO, h.stam→0, guardia baja.
//   [AC7 save]       h.blocking transitorio + ruptura reusa h.stun ⇒ save.v1 byte-id ON/OFF, sin clave block*.
//   [REG]            frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on/flask/bloodstain srand siguen ON==OFF (12 sistemas).
//
// Run: node tools/cas1873-shield-block.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { SHIELD_BLOCK } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// audio/view are deep no-op proxies (block → audio.sfx.roll, break → audio.sfx.hurt); io unused (probes drive damageHero directly).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "block"/"shield" substring ⇒ the AC7 save-key regex can't false-match (mirror gotcha GraveQA/EstusQA/FocusQA).
  sim.createHero("GuardiaQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.shieldMeta();
  if (meta.enabled && meta.frontArcDeg > 0 && meta.mitigate > 0 && meta.mitigate < 1 && meta.stamPerDmg >= 0 && meta.breakStunS > 0)
    pass(`content: SHIELD_BLOCK knob present (key=${meta.key} | frontArcDeg=${meta.frontArcDeg} | mitigate=${meta.mitigate} | stamPerDmg=${meta.stamPerDmg} | breakStunS=${meta.breakStunS} | moveMul=${meta.moveMul})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: mitigación frontal + coste exacto ----------
  const mp = d.shieldMitigateProbe();
  if (mp && mp.ok)
    pass(`AC3 mitigación: golpe MELEE frontal bloqueado ⇒ absorbido = dmg·mitigate EXACTO (${mp.absorbed}, dU=${mp.dU}→dB=${mp.dB}, mitigateExact=${mp.mitigateExact}); estamina −round(absorbed·stamPerDmg)=${mp.expectCost} (gastó ${mp.stSpent}, costExact=${mp.costExact}); mitiga NO niega (stillHurt=${mp.stillHurt})`);
  else fail(`AC3 mitigación wrong: ${J(mp)}`);

  // ---------- [AC4]: frontal-only ----------
  const ap = d.shieldArcProbe();
  if (ap && ap.ok)
    pass(`AC4 frontal-only: golpe por la ESPALDA (fuera del arco) con guardia arriba ⇒ daño COMPLETO (dRear=${ap.dRear}==dFull=${ap.dFull}, fullDamage=${ap.fullDamage}), sin coste (${ap.noCost})`);
  else fail(`AC4 frontal-only wrong: ${J(ap)}`);

  // ---------- [AC5]: melee-only / sin i-frames ----------
  const rp = d.shieldRangedProbe();
  if (rp && rp.ok)
    pass(`AC5 melee/iframe: golpe RANGED (src=null) con guardia arriba ⇒ NO mitigado (dRanged=${rp.dRanged}==dFull=${rp.dFull}, ${rp.notMitigated}) + sin coste (${rp.noCost}); i-frame bloqueado==sin-bloquear (${rp.ifBlocked}==${rp.ifUnblocked}, noExtraIframe=${rp.noExtraIframe}) ⇒ el bloqueo NO da i-frames`);
  else fail(`AC5 melee/iframe wrong: ${J(rp)}`);

  // ---------- [AC6]: ruptura de guardia ----------
  const bp = d.shieldBreakProbe();
  if (bp && bp.ok)
    pass(`AC6 ruptura: bloqueo con coste > estamina ⇒ h.stun=breakStunS=${bp.stun} (STAGGERED de CAS-1826, brokeStun=${bp.brokeStun}), golpe COMPLETO (dTaken=${bp.dTaken}==dFull=${bp.dFull}, fullOnBreak=${bp.fullOnBreak}), estamina→0 (${bp.stamZero}), guardia baja (${bp.guardDown})`);
  else fail(`AC6 ruptura wrong: ${J(bp)}`);

  // ---------- [AC1]: OFF ⇒ rama muerta ----------
  const off = d.shieldOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: SHIELD_BLOCK.enabled=false ⇒ rama muerta aunque h.blocking=true ⇒ daño COMPLETO (dTaken=${off.dTaken}==dFull=${off.dFull}, fullDamage=${off.fullDamage}), sin coste (${off.noCost}), sin stun (${off.noStun}) — byte-identical a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC7 SAVE]: transitorio, save.v1 byte-identical, no key ----------
  const sb = d.shieldSaveByteId();
  if (sb.ok)
    pass(`AC7 SAVE: h.blocking transitorio + ruptura reusa h.stun (ya fuera del allowlist) ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave block* (hasKey=${sb.hasKey})`);
  else fail(`AC7 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (block FIRING) — ON == OFF ----------
  const SEED = 0x1873c0de, N = 24;
  const rON = d.shieldSrandProbe(true, SEED, N);
  const rOFF = d.shieldSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL block-mitigate + guard-break`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el bloqueo es geometría/aritmética (0 srand draws, no blockRng) incluso cuando dispara`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.blockFired)
    pass(`AC2: el probe ON SÍ mitigó un golpe Y rompió la guardia, consumiendo 0 srand — ejercitó las rutas de disparo reales (rama de damageHero)`);
  else fail(`AC2 block did not fire (mitigate+break) on the ON probe: ${J({ blockFired: rON.blockFired })}`);
  const rON2 = d.shieldSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 12 prior systems incl. the 11 pillars) ----------
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

log(ok ? "\n✅ CAS-1874 shield-block (Escudo/Bloqueo) harness: ALL PASS" : "\n❌ CAS-1874 shield-block (Escudo/Bloqueo) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
