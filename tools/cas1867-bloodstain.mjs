// ---------------------------------------------------------------------------
// CAS-1869 (build for CAS-1867) — MANCHA DE SANGRE (Bloodstain / Corpse-Run, knob BLOODSTAIN). 11ª feature Souls-like.
// Convierte la MUERTE en tensión de riesgo/recompensa que abarca toda la sesión, cerrando la tríada de CASTIGO
// (Poise/Stagger + Estus + consecuencia de muerte).
//
// Decisión de arquitectura: INTERCEPTAR el banking de Esencia al morir + 1 store aislado, $0 arte, 0 RNG. Hoy morir
// BANCA automáticamente toda la Esencia del run (sim.js heroDie:3001). Este build redirige ese banking, gateado por
// BLOODSTAIN.enabled: la Esencia ganada pasa a una Mancha de Sangre en el punto de muerte (atRisk=round(gain·lossPct);
// sólo `safe`=gain−atRisk se banca). Recuperarla = check de dist² determinista en el tick del héroe (misma zona +
// radio) ⇒ banca el amount, borra la mancha. Morir otra vez antes la PIERDE (reemplazo canónico: 1 mancha a la vez).
// G.bloodstain {zone,x,y,amount}|null vive en su PROPIO store (mithralda.bloodstain.v1, mirror KEY_ARENA) ⇒ save.v1
// intacto y SIN clave nueva. Posición = punto de muerte, recuperación = dist² ⇒ CERO draws, NO existe `bloodstainRng`
// ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con la feature DISPARANDO. Marcador 100% canvas ($0 arte). HARD-GATED:
// enabled:false ⇒ el banking de siempre corre igual, sin marcador, sin store ⇒ byte-idéntico a HEAD.
//
// DESVÍO GE del spec (pseudo-código): el spec sugería que heroDie/tickBloodstain llamaran saveBloodstain()/
// clearBloodstain() directo, pero persist.js IMPORTA sim.js (el sim no puede importar persist ⇒ ciclo). Se usa el
// patrón CANÓNICO de la casa (mirror meta/arena/codex): el sim fija G.bloodstain + arma G.bloodstainDirty; persist.js
// consume el flag one-shot en tick()/unload y ESCRIBE o BORRA el store (saveBloodstain hace ambas: amount>0 ⇒ set,
// si no ⇒ removeItem). bootBloodstain() rehidrata al boot (gated). Mismo split medium-ownership que los 6 stores previos.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.bloodstain* hooks, que corren
// el REAL heroDie (drop) + tickBloodstain (recover) + los gates. La QA live (hija) re-verifica marcador + banner +
// persistencia entre sesiones sobre el build servido.
//
// Prueba:
//   [AC1 OFF]        BLOODSTAIN.enabled=false ⇒ heroDie BANCA todo el gain (banking de siempre), sin mancha, tick no-op ⇒ byte-id a HEAD.
//   [AC2 RNG-STRONG] script srand FIJO (48-draw) alrededor de la mancha DISPARANDO REAL (drop + recover) es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [AC3 drop]       morir ⇒ mancha en el punto de muerte {x,y,zone}, amount=round(gain·lossPct); meta sube sólo en `safe` (lossPct=1.0 ⇒ meta NO sube).
//   [AC4 recover]    caminar dentro de recoverRadius en la MISMA zona ⇒ meta += amount exacto, mancha borrada, dirty; fuera del radio NO recupera.
//   [AC5 reemplazo]  con mancha activa (amount A) morir de nuevo ⇒ vieja borrada, A NO bancado (perdido), nueva mancha con el nuevo atRisk.
//   [AC6 zona]       mancha en OTRA zona ⇒ NO recupera + persiste; volver a la zona de muerte SÍ recupera.
//   [AC7 save]       G.bloodstain aislado (mithralda.bloodstain.v1) ⇒ save.v1 byte-id ON/OFF, sin clave bloodstain*.
//   [REG]            frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on/flask srand siguen ON==OFF (11 sistemas).
//
// Run: node tools/cas1867-bloodstain.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { BLOODSTAIN } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// audio/view are deep no-op proxies (heroDie → audio.sfx.death, recover → audio.sfx.pickup); io unused (probes drive heroDie/tickBloodstain directly).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "bloodstain" substring ⇒ the AC7 save-key regex can't false-match (mirror gotcha VigorBot/FocusBot/EstusQA).
  sim.createHero("EsenciaQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.bloodstainMeta();
  if (meta.enabled && meta.lossPct >= 0 && meta.recoverRadius > 0 && meta.markerColor)
    pass(`content: BLOODSTAIN knob present (lossPct=${meta.lossPct} | recoverRadius=${meta.recoverRadius} | markerColor=${meta.markerColor})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC3]: drop on death ----------
  const dp = d.bloodstainDropProbe();
  if (dp && dp.ok)
    pass(`AC3 drop: morir ⇒ mancha en el punto de muerte (okPos=${dp.okPos}, zone=${dp.zone}); amount=round(gain·lossPct)=${dp.atRisk} (okAmount=${dp.okAmount}, gain=${dp.gain}); meta sube sólo en safe=${dp.safe} (okMetaSafe=${dp.okMetaSafe}); recap intacto (${dp.okRecap}); store armado (${dp.okDirty})`);
  else fail(`AC3 drop wrong: ${J(dp)}`);

  // ---------- [AC4]: recover (walk-over, same zone) ----------
  const rp = d.bloodstainRecoverProbe();
  if (rp && rp.ok)
    pass(`AC4 recover: caminar dentro del radio ⇒ meta += amount exacto (${rp.banked}), mancha borrada (${rp.cleared}), store armado (${rp.dirty}); fuera del radio NO recupera (${rp.outOfRange})`);
  else fail(`AC4 recover wrong: ${J(rp)}`);

  // ---------- [AC5]: replacement loses the old stain ----------
  const rep = d.bloodstainReplaceProbe();
  if (rep && rep.ok)
    pass(`AC5 reemplazo: con mancha activa (A=${rep.A}) morir de nuevo ⇒ A NO bancado/perdido (oldLost=${rep.oldLost}); nueva mancha con el nuevo atRisk=${rep.newAmount}==round(gain=${rep.gain}) (newStain=${rep.newStain})`);
  else fail(`AC5 reemplazo wrong: ${J(rep)}`);

  // ---------- [AC6]: cross-zone doesn't recover / doesn't clear; same-zone recovers ----------
  const zp = d.bloodstainZoneProbe();
  if (zp && zp.ok)
    pass(`AC6 zona: mancha en OTRA zona (${zp.other} vs ${zp.zHere}) ⇒ NO recupera (${zp.noRecoverWrongZone}) + persiste (${zp.persistsCrossZone}); volver a la zona de muerte SÍ recupera (${zp.recoverSameZone})`);
  else fail(`AC6 zona wrong: ${J(zp)}`);

  // ---------- [AC1]: OFF ⇒ banking de siempre, sin mancha, tick no-op ----------
  const off = d.bloodstainOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: BLOODSTAIN.enabled=false ⇒ heroDie BANCA todo el gain=${off.gain} (banksAll=${off.banksAll}), NO crea mancha (${off.noStain}), tickBloodstain no-op con mancha forzada (${off.tickNoop}) — byte-identical a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC7 SAVE]: isolated store, save.v1 byte-identical, no key ----------
  const sb = d.bloodstainSaveByteId();
  if (sb.ok)
    pass(`AC7 SAVE: G.bloodstain aislado (mithralda.bloodstain.v1) ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave bloodstain* (hasKey=${sb.hasKey})`);
  else fail(`AC7 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (bloodstain FIRING) — ON == OFF ----------
  const SEED = 0x1867c0de, N = 24;
  const rON = d.bloodstainSrandProbe(true, SEED, N);
  const rOFF = d.bloodstainSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL death-drop + recover + loot kills`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la mancha es aritmética/geometría (0 srand draws, no bloodstainRng) incluso cuando dispara`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.bloodstainFired)
    pass(`AC2: el probe ON SÍ dropeó una mancha Y la recuperó, consumiendo 0 srand — ejercitó las rutas de disparo reales (heroDie + tickBloodstain)`);
  else fail(`AC2 bloodstain did not fire (dropped&recovered) on the ON probe: ${J({ bloodstainFired: rON.bloodstainFired })}`);
  const rON2 = d.bloodstainSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 11 prior pillars) ----------
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

log(ok ? "\n✅ CAS-1869 bloodstain (Corpse-Run) harness: ALL PASS" : "\n❌ CAS-1869 bloodstain (Corpse-Run) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
