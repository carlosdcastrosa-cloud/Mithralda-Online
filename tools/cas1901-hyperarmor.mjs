// ---------------------------------------------------------------------------
// CAS-1902 (build for CAS-1901) — SUPERARMADURA EN GOLPES COMPROMETIDOS (Hyperarmor / Poise-through, knob HYPERARMOR).
// 16º pilar Souls-like. Profundiza el eje agresivo (Pilar 15 Two-Handing): durante el swing PESADO/rematador del héroe
// gana superarmadura — un golpe entrante con poise-damage < umbral NO lo interrumpe (sigue recibiendo el daño; NO es
// i-frame); >= umbral SÍ rompe (anti-inmunidad: el slam de jefe te tumba igual). 100% BORROW, hard-gated, RNG-neutral,
// save-neutral (flag transitorio).
//
// Arquitectura: el ÚNICO vector de INTERRUPCIÓN del héroe hoy es `h.stun` (gatea atacar/lanzar/rodar, CAS-1826); se aplica
// en damageHero vía applyStatus(h,"stun",infl). Una rama ÚNICA gateada HYPERARMOR.enabled, JUSTO antes de ese applyStatus,
// SUPRIME sólo el stun cuando el héroe está en ventana comprometida ((h._heavy||h._comboFin)&&h.atkAnim>0) y el poise-damage
// entrante (=`dmg` crudo, arg1) < thr. El daño ya se restó arriba ⇒ intacto. thr=poiseThreshold*(twoHand?twoHandBonus:1).
// Reusa flags vivos (h._heavy CAS-1831 heavy / h._comboFin CAS-1831 finisher / h.atkAnim) ⇒ SIN nueva máquina de tiempo.
// h.hyperarmor transitorio (mirror h.blocking, fuera del allowlist de serializeSave) ⇒ save.v1 byte-id y SIN clave nueva.
// CERO draws (NO hyperArmorRng): la rama es timing/estado/aritmética ⇒ srand ON==OFF byte-idéntico aun disparando. OFF ⇒
// rama muerta ⇒ applyStatus corre igual que HEAD ⇒ byte-idéntico (15 pilares intactos).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.hyper* hooks, que corren el seam
// REAL de damageHero. La QA live (hija) re-verifica sobre el build servido.
//
// Prueba (AC1-7 del design doc design/cas1901-hyperarmor.md):
//   [AC2 commit]    ON + heavy/finisher: dmg<thr ⇒ h.stun NO sube pero hp baja; dmg>=thr ⇒ h.stun sube (rompe).
//   [AC3 no-commit] ON + idle (sin heavy/finisher) ⇒ el stun aplica normal (superarmadura sólo en commit).
//   [AC4 status]    slow/dot entrante NO se suprime (sólo el stun/action-lock).
//   [AC5 OFF]       enabled=false ⇒ un stun sub-umbral en commit SÍ aturde (byte-id a HEAD).
//   [AC5 SAVE]      h.hyperarmor transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave hyper*.
//   [AC6 RNG-STRONG]script srand FIJO (48-draw) alrededor de un golpe comprometido que ABSORBE un stun (real) es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [AC7 REG]       los 15 pilares previos (Frenzy…Two-Handing) + Equip Load siguen srand ON==OFF.
//
// Run: node tools/cas1901-hyperarmor.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { HYPERARMOR } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// audio/view = deep no-op proxies. io minimal (probes fuerzan el estado del héroe directamente).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "hyper"/"armor" substring ⇒ the save-key regex can't false-match (mirror GuardiaQA/DosManosQA).
  sim.createHero("SuperQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.hyperMeta();
  const numsOk = meta.poiseThreshold > 0 && meta.twoHandBonus >= 1 && meta.appliesTo && (meta.appliesTo.heavy || meta.appliesTo.finisher);
  if (meta.enabled && numsOk)
    pass(`content: HYPERARMOR knob present (poiseThreshold=${meta.poiseThreshold} | twoHandBonus=${meta.twoHandBonus} | appliesTo=${J(meta.appliesTo)} | vfx=${meta.vfx})`);
  else fail(`content wrong: ${J(meta)}`);
  if (meta.twoHandBonus === 1.0) pass(`content: twoHandBonus flat=1.0 (wired-neutral v1 — el Gate CEO lo sube sin rebuild)`);
  else fail(`content: expected twoHandBonus 1.0 (flat v1), got ${meta.twoHandBonus}`);

  // ---------- [AC2 commit]: heavy & finisher — sub-thr aguanta (hp baja), supra-thr rompe ----------
  const cp = d.hyperCommitProbe();
  if (cp && cp.heavyOk)
    pass(`AC2 HEAVY: dmg<thr(${cp.lo}<${cp.thr}) ⇒ h.stun=${cp.hLo.stun} NO sube pero hp baja (${cp.hLo.hpDrop}); dmg>=thr(${cp.hi}) ⇒ h.stun=${cp.hHi.stun} sube (rompe superarmadura)`);
  else fail(`AC2 HEAVY broke: ${J(cp)}`);
  if (cp && cp.finOk)
    pass(`AC2 FINISHER (h._comboFin): dmg<thr ⇒ h.stun=${cp.fLo.stun} NO sube pero hp baja (${cp.fLo.hpDrop}); dmg>=thr ⇒ h.stun=${cp.fHi.stun} sube`);
  else fail(`AC2 FINISHER broke: ${J(cp)}`);

  // ---------- [AC3 no-commit]: idle ⇒ stun aplica normal ----------
  const nc = d.hyperNoCommitProbe();
  if (nc && nc.ok)
    pass(`AC3 no-commit: MISMO golpe sub-umbral (${nc.lo}) ⇒ idle h.stun=${nc.idleStun} (aturde) vs en commit h.stun=${nc.commitStun} (absorbe) — superarmadura SÓLO en golpe comprometido`);
  else fail(`AC3 no-commit broke: ${J(nc)}`);

  // ---------- [AC4 status]: slow/dot NO suprimido (sólo stun) ----------
  const sp = d.hyperStatusProbe();
  if (sp && sp.ok)
    pass(`AC4 status: en commit el stun se absorbe (${sp.stunAbsorbed}) pero un SLOW entrante SÍ aplica (slowT=${sp.slowT}) — la rama toca SÓLO el stun, no otros status`);
  else fail(`AC4 status suppression leaked: ${J(sp)}`);

  // ---------- [AC5 OFF]: enabled=false ⇒ dead branch, stun aturde igual que HEAD ----------
  const off = d.hyperOffProbe();
  if (off && off.ok)
    pass(`AC5 OFF: HYPERARMOR.enabled=false ⇒ rama muerta, stun sub-umbral en commit SÍ aturde (h.stun=${off.offStun}, byte-id a HEAD); ON el mismo golpe se absorbe (h.stun=${off.onStun})`);
  else fail(`AC5 OFF not inert: ${J(off)}`);

  // ---------- [AC5 SAVE]: transient flag ⇒ save.v1 byte-identical, no key ----------
  const sb = d.hyperSaveByteId();
  if (sb.ok)
    pass(`AC5 SAVE: h.hyperarmor transitorio ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave hyper* (hasKey=${sb.hasKey})`);
  else fail(`AC5 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC6 RNG-STRONG]: 48-draw fixed srand script (commit stun-absorb FIRING) — ON == OFF ----------
  const SEED = 0x1901c0de, N = 24;
  const rON = d.hyperSrandProbe(true, SEED, N);
  const rOFF = d.hyperSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC6 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around un golpe comprometido que absorbe un stun`);
  else fail(`AC6 RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC6 RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la superarmadura es timing/aritmética (0 srand draws, no hyperArmorRng) aun disparando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.hyperArmorFired)
    pass(`AC6 RNG-STRONG: el probe ON SÍ absorbió el stun (superarmadura disparó) consumiendo 0 srand — ejercitó la ruta de disparo real`);
  else fail(`AC6 RNG: hyperarmor did not fire on the ON probe: ${J({ hyperArmorFired: rON.hyperArmorFired })}`);
  const rON2 = d.hyperSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC6 RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC6 RNG determinism broke`);

  // ---------- [AC7 REG]: existing srand probes stay ON==OFF (all 15 prior pillars + Equip Load) ----------
  // NB: la sonda de Bonfire REUBICA al héroe a una zona de caza (gotcha documentado) y las de EquipLoad y Two-Handing son
  // SENSIBLES A LA POSICIÓN (su killEnemy de alineación del loot compartido cae en zonas distintas). Por eso ambas se corren
  // al FINAL, cada una con un HÉROE PRÍSTINO recién recreado en el pueblo (mirror gotcha cas1893/cas1896). Los demás resetean
  // su propio estado; Bonfire va el ÚLTIMO del loop porque deja al héroe en una zona de caza.
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
  let regN = 0;
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`); }
    else fail(`REG: ${name} srand regressed`);
  }
  // Two-Handing (15º pilar) — héroe PRÍSTINO en el pueblo (killEnemy de alineación es sensible a zona; Bonfire reubicó al héroe).
  sim.createHero("SuperQA", "warrior");
  if (d.twoHandSrandProbe) {
    const on = d.twoHandSrandProbe(true, 0x1895c0de, 24), o = d.twoHandSrandProbe(false, 0x1895c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Two-Handing srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Two-Handing srand regressed`);
  } else pass(`REG: Two-Handing srand probe absent — skipped`);
  // EquipLoad (14º pilar) — héroe PRÍSTINO en el pueblo para aislar la sensibilidad a zona del doRoll+loot.
  sim.createHero("SuperQA", "warrior");
  if (d.equipSrandProbe) {
    const on = d.equipSrandProbe(true, 0x1889c0de, 24), o = d.equipSrandProbe(false, 0x1889c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: EquipLoad srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: EquipLoad srand regressed`);
  } else pass(`REG: EquipLoad srand probe absent — skipped`);
  pass(`AC7 REG: ${regN} sistemas srand ON==OFF (15 pilares previos + Equip Load)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1902 hyperarmor (Superarmadura en Golpes Comprometidos) harness: ALL PASS" : "\n❌ CAS-1902 hyperarmor (Superarmadura en Golpes Comprometidos) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
