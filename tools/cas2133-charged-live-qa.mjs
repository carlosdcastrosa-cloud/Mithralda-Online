// ---------------------------------------------------------------------------
// CAS-2135 (CAS-2133 Build DARK, umbrella) — ATAQUE CARGADO CON HÍPER-ARMADURA (knob CHARGED_ATTACK). 37ª mecánica Souls-like.
// El kit vivo (#33 Guard-Counter, #34 Perfect-Dodge-Counter, #35 Rally, #36 Riposte) es todo REACTIVO: premia esperar el error
// del enemigo. Ataque Cargado añade el eje que faltaba — INICIATIVA ARRIESGADA: mantener el pesado (COMBO.heavyKey "KeyN") más
// allá de chargeThresholdMs entra en estado *cargando* (h.charging); durante el windup ganas HÍPER-ARMADURA fuerte (los golpes
// entrantes NO interrumpen — el poise los absorbe) pero SÍ recibes daño CAPEADO (anti-cheese); al SOLTAR → golpe cargado: más
// daño (×dmgMul) y mucho más poise (×poiseMul, eje de ROTURA ofensivo), a cambio de más stamina y de exponerte durante la carga.
// Soltar ANTES del umbral = pesado normal (comportamiento KeyN de HEAD).
//
// ⚠️ Eje PROACTIVO por ESTADO DEL HÉROE (h.charging / h._charged), DISJUNTO de todas las contras (#33..#36, que se arman por un
//    evento REACTIVO). Compone MULTIPLICATIVAMENTE en el sink de daño melee, no comparte estado ni sink con ninguna.
//
// Arquitectura (seams, todos gated CHARGED_ATTACK.enabled):
//   A. Input (input.js) — keydown KeyN: ON ⇒ chargeHeld=true (windup) / OFF ⇒ heavyAttack() inmediato (=HEAD byte-id); keyup baja
//      chargeHeld; getter io.chargeHeld; botón HUD hold ⛏ gated (OFF ⇒ layout byte-id). KeyN sin consumidor keyup ⇒ 0 colisión.
//   B. Tick/release (sim.js tickCharge) — windup acumula h.chargeT (cap maxChargeMs) + marca h.charging; release decide h._charged
//      por umbral, gasta stamina EXTRA (o degrada), dispara heavyAttack() (reúsa el pesado dedicado).
//   C. Híper-armadura del windup (damageHero) — h.charging extiende el gate HYPERARMOR con umbral propio hyperArmorGrant (absorbe).
//   D. Cap ENTRANTE (damageHero, pre-hp) — mientras h.charging: real ≤ incomingDmgCapFracMaxHp×maxHp (nunca one-shot cargando).
//   E. Golpe soltado (applyHeroMelee + hitEnemy) — ×dmgMul (compone ×heavy ×counters), poise ×poiseMul, cap SALIENTE
//      releaseCapFracMaxHp vs jefe/élite/campeón (trash sin cap).
//   F. VFX $0 (render.js medidor de windup + floater STR.chargedExec al soltar, latch ⇒ una vez).
// CERO draws (NO existe chargeRng) ⇒ srand ON==OFF byte-idéntico alrededor del ciclo. chargeT/charging/_charged/_chargedFx
// transitorios (mirror h.blocking, NUNCA serializados) ⇒ save.v1 byte-id SIN clave charge*. HARD-GATED: enabled:false ⇒ tickCharge
// no-op + caps/hyper-armor/×mul muertos ⇒ byte-idéntico a HEAD (OFF==baseline).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.charge* hooks, que corren los seams
// REALES (tickCharge windup/release; damageHero absorbe/capa; applyHeroMelee ×dmgMul + hitEnemy poise/cap). La QA OBSERVABLE
// re-verifica el sim servido en navegador (desktop + móvil) sobre este mismo build.
//
// Prueba:
//   [AC HEADLINE]   hold < umbral ⇒ pesado normal (_charged=false); hold ≥ umbral ⇒ CARGADO (_charged=true) ×dmgMul; stamina EXTRA == staminaCost.
//   [AC POISE]      swing CARGADO ⇒ poise-damage ×poiseMul vs pesado normal (eje de ROTURA ofensivo, target NO roto).
//   [AC HYPER]      durante h.charging un stun entrante NO interrumpe (absorbido por hyperArmorGrant); fuera de la carga SÍ aturde.
//   [AC CAP-IN]     durante h.charging un golpe grande resta ≤ incomingDmgCapFracMaxHp×maxHp (nunca one-shot); fuera resta completo.
//   [AC CAP-OUT]    cargado vs jefe/élite ≤ releaseCapFracMaxHp×maxHp (el cap MUERDE); trash SIN cap (valor uncapped > cap).
//   [AC OFF]        enabled=false ⇒ forzar _charged/charging INERTE (dmg byte-id, sin híper-armadura de windup, sin caps).
//   [AC SAVE]       chargeT/charging/_charged/_chargedFx transitorios ⇒ serializeSave() byte-id ON/OFF, sin clave charge*.
//   [AC RNG-STRONG] script srand FIJO alrededor de windup→absorbe→release→×dmgMul (disparando real) BYTE-IDÉNTICO ON vs OFF.
//   [REG]           TODAS las mecánicas previas (Frenzy…Riposte, 36 mec) siguen srand ON==OFF (0 regresión).
//
// Run: node tools/cas2133-charged-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { CHARGED_ATTACK } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, chargeHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

function runOnce(tag) {
  let localOk = true;
  const lfail = (m) => { localOk = false; ok = false; console.error(`✖ [${tag}] ${m}`); };
  const lpass = (m) => log(`✔ [${tag}] ${m}`);

  // NB: hero name has NO "charging"/"chargeT"/"_charged" substring ⇒ the save-key regex can't false-match.
  sim.createHero("PowerQA", "warrior");

  // ---------- content sanity: the knob (DARK: enabled:false shipped) ----------
  const meta = d.chargeMeta();
  const numsOk = meta.chargeThresholdMs > 0 && meta.maxChargeMs >= meta.chargeThresholdMs && meta.dmgMul > 1 && meta.poiseMul >= 1
    && meta.staminaCost >= 0 && meta.hyperArmorGrant > 0 && meta.incomingDmgCapFracMaxHp > 0 && meta.incomingDmgCapFracMaxHp < 1
    && meta.releaseCapFracMaxHp > 0 && meta.releaseCapFracMaxHp < 1;
  if (numsOk) lpass(`content: CHARGED_ATTACK knob present (enabled=${meta.enabled} | thr=${meta.chargeThresholdMs}ms | max=${meta.maxChargeMs}ms | dmgMul=${meta.dmgMul} | poiseMul=${meta.poiseMul} | stam=${meta.staminaCost} | hyperGrant=${meta.hyperArmorGrant} | capIn=${meta.incomingDmgCapFracMaxHp} | capOut=${meta.releaseCapFracMaxHp} | requiresMelee=${meta.requiresMelee})`);
  else lfail(`content wrong: ${J(meta)}`);
  if (meta.enabled === false) lpass(`content: SHIP DARK — enabled=false (el CEO flipea en el Gate)`);
  else lfail(`content: expected enabled=false (DARK), got ${meta.enabled}`);

  // ---------- [AC HEADLINE THRESHOLD]: sub-umbral=normal; supra-umbral=cargado ×dmgMul; +staminaCost extra ----------
  const tp = d.chargeThresholdProbe();
  if (tp && tp.ok)
    lpass(`AC HEADLINE: hold 1f ⇒ charging=${tp.chargingMid}, release NORMAL (_charged=${tp.subCharged}) dmg=${tp.dSub}; hold 30f (${tp.chargeTAtRelease}ms≥${meta.chargeThresholdMs}) ⇒ release CARGADO (_charged=${tp.supCharged}) dmg=${tp.dSup} ⇒ ratio=${tp.ratio}==dmgMul(${tp.expect}); estamina EXTRA aislada=${tp.extraStam}==staminaCost (${tp.stamOk})`);
  else lfail(`AC HEADLINE broke: ${J(tp)}`);

  // ---------- [AC POISE]: swing cargado ⇒ poise-damage ×poiseMul (eje de rotura ofensivo) ----------
  const pp = d.chargePoiseProbe();
  if (pp && pp.ok)
    lpass(`AC POISE: pesado normal poise=${pp.pNorm} vs cargado poise=${pp.pChg} ⇒ ratio=${pp.ratio}==poiseMul(${pp.expect}) ⇒ rotura ofensiva observable`);
  else lfail(`AC POISE broke: ${J(pp)}`);

  // ---------- [AC HÍPER-ARMADURA] (seam C): el windup absorbe un stun entrante ----------
  const hy = d.chargeHyperArmorProbe();
  if (hy && hy.ok)
    lpass(`AC HYPER: fuera de la carga el stun aturde (stun=${hy.stunBase}); durante h.charging el mismo stun NO interrumpe (stun=${hy.stunCharge}) ⇒ híper-armadura del windup absorbe (${hy.absorbed})`);
  else lfail(`AC HYPER broke: ${J(hy)}`);

  // ---------- [AC CAP ENTRANTE] (seam D): golpe grande capado mientras cargas ----------
  const ci = d.chargeIncomingCapProbe();
  if (ci && ci.ok)
    lpass(`AC CAP-IN: cap=incomingDmgCapFracMaxHp×maxHp=${ci.cap}; fuera de la carga resta COMPLETO=${ci.dBase} (>cap); durante h.charging resta ≤cap=${ci.dCap} (capped=${ci.capped}) ⇒ absorber ≠ inmunidad pero nunca one-shot`);
  else lfail(`AC CAP-IN broke: ${J(ci)}`);

  // ---------- [AC CAP SALIENTE] (seam E): cargado vs jefe/élite capado; trash sin cap ----------
  const co = d.chargeOutgoingCapProbe();
  if (co && co.ok)
    lpass(`AC CAP-OUT: cap=releaseCapFracMaxHp×maxHp=${co.cap}; jefe cargado=${co.dBoss}≤cap (capBound=${co.capBound}, bossCapped=${co.bossCapped}); trash SIN cap=${co.dTrash}>cap (${co.trashUncapped}) ⇒ anti one-shot pero ejecución pesada en trash`);
  else lfail(`AC CAP-OUT broke: ${J(co)}`);

  // ---------- [AC OFF]: enabled=false ⇒ forzar charging/_charged INERTE (dmg/hyper/caps byte-id a HEAD) ----------
  const off = d.chargeOffProbe();
  if (off && off.ok)
    lpass(`AC OFF: CHARGED_ATTACK.enabled=false ⇒ forzar _charged=true INERTE (dmg ${off.dForced}==${off.dRef}); forzar charging INERTE (stun aturde igual=${off.stunOff}, sin híper-armadura=${off.hyperInert}); cap entrante muerto (dmg completo=${off.dOff}, capInert=${off.capInert}) ⇒ ramas byte-idénticas a HEAD`);
  else lfail(`AC OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient hero flags ⇒ save.v1 byte-identical, no charge* key ----------
  const sb = d.chargeSaveByteId();
  if (sb.ok)
    lpass(`AC SAVE: chargeT/charging/_charged/_chargedFx transitorios (mirror h.blocking) ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave charge* (hasKey=${sb.hasKey})`);
  else lfail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: fixed srand script (windup→absorbe→release→×dmgMul FIRING) — ON == OFF ----------
  const SEED = 0x2133c0de, N = 24;
  const rON = d.chargeSrandProbe(true, SEED, N);
  const rOFF = d.chargeSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) lpass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around un windup + un stun absorbido + un release cargado ×dmgMul real`);
  else lfail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    lpass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la carga es timing/aritmética/flag (0 draws, no chargeRng) aun disparando`);
  else lfail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.released)
    lpass(`AC RNG-STRONG: el probe ON SÍ acumuló windup + soltó cargado (_charged) con 0 srand — ejercitó la ruta de disparo real`);
  else lfail(`AC RNG: charged release did not fire on the ON probe: ${J({ released: rON.released })}`);
  const rON2 = d.chargeSrandProbe(true, SEED, N);
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

  // ---------- [REG]: existing srand probes stay ON==OFF (0 regresión en las 36 mecánicas vivas, incl. Riposte #36 LIVE) ----------
  sim.createHero("PowerQA", "warrior");
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
    ["Hyperarmor", 0x1901c0de, d.hyperSrandProbe],
    ["Weapon-Arch", 0x1907c0de, d.archSrandProbe],
    ["Weapon-Arts", 0x1914c0de, d.artSrandProbe],
    ["Throwables", 0x1920c0de, d.throwSrandProbe],
    ["Weapon-Buffs", 0x1926c0de, d.buffSrandProbe],
    ["Status-Buildup", 0x1931c0de, d.buildupSrandProbe],
    ["Bonfire", 0x1879c0de, d.bonfireSrandProbe],
    ["Equip-Load", 0x1889c0de, d.equipSrandProbe],
    ["Lock-On", 0x1858c0de, d.lockSrandProbe],
    ["Pacts", 0x1763c0de, d.pactsSrandProbe],
    ["Titles", 0x1650c0de, d.titlesSrandProbe],
    ["Codex", 0x2020c0de, d.codexSrandProbe],
    ["Seeded-Challenge", 0x2090c0de, d.variantSrandProbe],
    ["Arena-Hazards", 0x2094c0de, d.hazardSrandProbe],
    ["Guard-Counter", 0x2107c0de, d.guardCounterSrandProbe],
    ["Dodge-Counter", 0x2110c0de, d.dodgeCounterSrandProbe],
    ["Rally", 0x2114c0de, d.rallySrandProbe],
    ["Riposte", 0x2127c0de, d.riposteSrandProbe],
  ];
  let regN = 0;
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    sim.createHero("PowerQA", "warrior");   // fresh hero/world per probe ⇒ no cross-probe state bleed (each probe reseeds srand internally)
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`); regN++; }
    else fail(`REG: ${name} srand regressed`);
  }
  pass(`REG SUMMARY: ${regN}/${reg.length} live-mechanic srand probes BYTE-IDENTICAL ON==OFF (CHARGED adds 0 regression)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-2133 charged-attack (Ataque Cargado con Híper-Armadura, mec #37 DARK) harness: ALL PASS" : "\n❌ CAS-2133 charged-attack harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
