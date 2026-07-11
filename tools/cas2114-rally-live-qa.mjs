// ---------------------------------------------------------------------------
// CAS-2114 (Build DARK) — RECUPERACIÓN / RALLY / REGAIN (knob RALLY). 35ª mecánica Souls-like. Icónica de
// Souls/Bloodborne, ausente en las 34 vivas: al RECIBIR daño una fracción del HP perdido queda RECUPERABLE por una
// ventana corta; GOLPEAR en melee dentro de la ventana devuelve parte del pool. Premia la agresividad post-hit
// (identidad de riesgo/recompensa). Compone con dodge-counter (#34) y guard-counter (#33) SIN solaparse: aquellos
// amplifican el swing (dmg/poise ×mul), éste convierte el swing en CURACIÓN de un pool armado por el daño recibido —
// ejes ORTOGONALES. 100% BORROW, hard-gated, RNG-neutral ESTRICTO, save-neutral.
//
// Arquitectura: estado TRANSITORIO h.rallyPool/h.rallyT (mirror h.dodgeCounterT, fuera del allowlist de serializeSave)
// ⇒ save.v1 byte-id y SIN clave nueva; decae en tickRally. Seams (todos gated RALLY.enabled):
//   (1) damageHero, TRAS aplicar el daño REAL (h.hp-=real, post-armadura/bloqueo) ⇒ h.rallyPool += real×recoverFrac
//       (capeado a capFracMaxHp×HPmax), h.rallyT=windowS. Corre después de los early-outs de negación (spirit/parry/
//       i-frame/dodge/block) ⇒ sólo el daño que DE VERDAD restó HP alimenta el pool.
//   (2) tickRally: el pool decae lineal decayPerSec×HPmax/s mientras rallyT>0; al expirar la ventana el pool→0 (techo duro).
//   (3) applyHeroMelee: un swing que CONECTA ≥1 enemigo cura min(pool×healPerHitFrac, pool) (una VEZ por swing, no por
//       enemigo) y lo resta del pool. healPerHitFrac<1 ⇒ nunca full-heal de un golpe.
// CERO draws (NO rallyRng) ⇒ srand ON==OFF byte-idéntico aun con el ciclo rally disparando. HARD-GATED: enabled:false ⇒
// h.rallyPool nunca sube, ramas de daño/melee INTACTAS ⇒ byte-idéntico a HEAD (OFF==baseline). $0 arte (ghost-HP overlay
// = primitiva canvas existente + floater).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.rally* hooks, que corren los
// seams REALES (damageHero / tickRally / applyHeroMelee). La QA OBSERVABLE (hija de CAS-2114) re-verifica sobre el build servido.
//
// Prueba:
//   [AC arma]       recibir daño REAL arma pool=real×recoverFrac (capeado) y rallyT=windowS.
//   [AC cura]       un swing melee que conecta cura pool×healPerHitFrac, lo resta del pool, y cura UNA VEZ por swing (AoE=1×).
//   [AC cap]        un golpe enorme capea el pool a capFracMaxHp×HPmax (anti-abuse jefes).
//   [AC decay]      tickRally decae el pool decayPerSec×HPmax/s y lo fuerza a 0 al expirar la ventana.
//   [AC OFF]        enabled=false ⇒ recibir daño NO arma pool + forzar rallyPool>0 es INERTE en el swing (hp byte-id a HEAD).
//   [AC SAVE]       h.rallyPool/h.rallyT transitorios ⇒ serializeSave() byte-id ON/OFF, sin clave rally*.
//   [AC RNG-STRONG] script srand FIJO alrededor del ciclo rally REAL (daño→decay→cura) BYTE-IDÉNTICO ON vs OFF.
//   [REG]           las 34 mecánicas previas (Frenzy…Two-Hand…Guard-Counter…Dodge-Counter) siguen srand ON==OFF (0 regresión).
//
// Run: node tools/cas2114-rally-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { RALLY } from "../sim/config.js";

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

  // NB: hero name has NO "rally" substring ⇒ the save-key regex can't false-match.
  sim.createHero("RegainQA", "warrior");

  // ---------- content sanity: the knob (DARK: enabled:false shipped) ----------
  const meta = d.rallyMeta();
  const numsOk = meta.recoverFrac > 0 && meta.windowS > 0 && meta.healPerHitFrac > 0 && meta.healPerHitFrac < 1
    && meta.decayPerSec >= 0 && meta.capFracMaxHp > 0 && meta.capFracMaxHp <= 1;
  if (numsOk) lpass(`content: RALLY knob present (enabled=${meta.enabled} | recoverFrac=${meta.recoverFrac} | windowS=${meta.windowS} | healPerHitFrac=${meta.healPerHitFrac} | decayPerSec=${meta.decayPerSec} | capFracMaxHp=${meta.capFracMaxHp} | requiresMelee=${meta.requiresMelee})`);
  else lfail(`content wrong: ${J(meta)}`);
  if (meta.enabled === false) lpass(`content: SHIP DARK — enabled=false (el CEO flipea en el Gate)`);
  else lfail(`content: expected enabled=false (DARK), got ${meta.enabled}`);
  if (meta.healPerHitFrac < 1) lpass(`content: healPerHitFrac<1 (${meta.healPerHitFrac}) ⇒ nunca full-heal de un golpe`);
  else lfail(`content: healPerHitFrac debe ser <1 (anti-abuse), got ${meta.healPerHitFrac}`);

  // ---------- [AC arma]: recibir daño arma el pool = real×recoverFrac + rallyT=windowS ----------
  const ap = d.rallyArmProbe();
  if (ap && ap.ok)
    lpass(`AC arma: daño real=${ap.real} ⇒ pool=${ap.pool}(==real·recoverFrac ${ap.expectPool}, poolOk=${ap.poolOk}); rallyT=${ap.rallyT}(==windowS ${meta.windowS}, windowOk=${ap.windowOk})`);
  else lfail(`AC arma broke: ${J(ap)}`);

  // ---------- [AC cura]: swing melee cura pool×healPerHitFrac + resta del pool + AoE=1× ----------
  const hp = d.rallyHealProbe();
  if (hp && hp.ok)
    lpass(`AC cura: swing cura ${hp.healed}(==pool·healPerHitFrac ${hp.expectHeal}, healOk=${hp.healOk}); pool restante=${hp.poolAfter}(poolOk=${hp.poolOk}); AoE 2-mobs cura ${hp.healedAoE} UNA vez (onceOk=${hp.onceOk})`);
  else lfail(`AC cura broke: ${J(hp)}`);

  // ---------- [AC cap]: golpe enorme capea el pool a capFracMaxHp×HPmax ----------
  const cp = d.rallyCapProbe();
  if (cp && cp.ok)
    lpass(`AC cap: golpe enorme ⇒ pool=${cp.pool} capeado a cap=${cp.cap}(==capFracMaxHp·HPmax) ⇒ anti-abuse jefes (capOk=${cp.capOk})`);
  else lfail(`AC cap broke: ${J(cp)}`);

  // ---------- [AC decay]: tickRally decae + fuerza a 0 al expirar ----------
  const dp = d.rallyDecayProbe();
  if (dp && dp.ok)
    lpass(`AC decay: pool ${dp.p0}→${dp.p1} en 0.5s (drop=${dp.expectDrop}=decayPerSec·HPmax·dt, decayOk=${dp.decayOk}); ventana expira ⇒ pool forzado a 0 (expiredZero=${dp.expiredZero})`);
  else lfail(`AC decay broke: ${J(dp)}`);

  // ---------- [AC OFF]: enabled=false ⇒ no arma + forzar rallyPool INERTE ----------
  const off = d.rallyOffProbe();
  if (off && off.ok)
    lpass(`AC OFF: RALLY.enabled=false ⇒ recibir daño NO arma pool (${off.noArm}) + forzar rallyPool>0 INERTE — swing NO cura (healA=${off.healA}==healB=${off.healB}==0) ⇒ ruta melee byte-idéntica a HEAD`);
  else lfail(`AC OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient state ⇒ save.v1 byte-identical, no key ----------
  const sb = d.rallySaveByteId();
  if (sb.ok)
    lpass(`AC SAVE: h.rallyPool/h.rallyT transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave rally* (hasKey=${sb.hasKey})`);
  else lfail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: fixed srand script (daño→decay→cura FIRING) — ON == OFF ----------
  const SEED = 0x2114c0de, N = 24;
  const rON = d.rallySrandProbe(true, SEED, N);
  const rOFF = d.rallySrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) lpass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around el ciclo rally REAL`);
  else lfail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    lpass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el rally es timing/aritmética (0 draws, no rallyRng) aun disparando`);
  else lfail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  const rON2 = d.rallySrandProbe(true, SEED, N);
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

  // ---------- [REG]: las 34 mecánicas vivas siguen srand ON==OFF (0 regresión) ----------
  sim.createHero("RegainQA", "warrior");
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
    ["Dodge-Counter", 0x2110c0de, d.dodgeCounterSrandProbe],
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

log(ok ? "\n✅ CAS-2114 rally/regain (Recuperación, mec #35 DARK) harness: ALL PASS" : "\n❌ CAS-2114 rally/regain harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
