// ---------------------------------------------------------------------------
// CAS-1891 (build for CAS-1889) — CARGA DE EQUIPO / TIPOS DE RODADA (Equip Load & Roll Types, knob EQUIP_LOAD). 14º
// pilar Souls-like. El PESO total del equipo equipado (weapon/body/shield) contra una `capacity` ⇒ un `ratio` ⇒ 4
// BANDAS (fast/mid/fat/over) que MULTIPLICAN valores YA vivos: DODGE{distance,iframeMs} (CAS-1814) + STAMINA.cost.dodge
// (CAS-1841) + move speed. 100% BORROW, hard-gated.
//
// Arquitectura: peso 100% DERIVADO del equipo YA guardado — `Σ slotWeight[slot]*rarityWeight[rarity]` sobre h.equip ⇒
// CERO draws, NO existe `equipLoadRng`, NINGÚN campo nuevo en save.v1 (recomputable de {slot,rarity}). Seams: (1)
// equipLoad(h)⇒{total,ratio,band}; (2) doRoll() gatea iframe/dist/coste-estamina por la banda + deny en `over`; (3) el
// factor move de la banda entra en `sp`; (4) tinte HUD de la barra de vigor por banda ($0 arte). HARD-GATED:
// enabled:false ⇒ multiplicadores=1 (mid) ⇒ byte-idéntico a HEAD (Estamina/Esquiva/Bloqueo intactos) + sin HUD nuevo.
//
// AC2 CRÍTICO: `capacity`(20)+`slotWeight`{w4,b5,s4} elegidos para que el LOADOUT INICIAL (3 piezas common, sim.js:374)
// caiga en MID (13/20=0.65 ∈ (0.30,0.70]) ⇒ multiplicadores todos 1 ⇒ el feel actual NO regresa.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.equip* hooks, que corren el
// REAL equipLoad() + la REAL rama de doRoll (mul/deny) + la REAL fórmula de move (sp). La QA live (hija) re-verifica las
// 4 bandas + el tinte del HUD sobre el build servido.
//
// Prueba:
//   [AC2 mid==baseline] loadout inicial (3 common) ⇒ banda mid ⇒ mul todos 1 (dist/iframe/stam/move) ⇒ feel intacto.
//   [AC bandas]         las 4 bandas alcanzables con inventarios reales (fast=1 slot · mid=inicial · fat=uniforme uncommon-epic · over=legendary).
//   [AC roll]           la banda multiplica el REAL doRoll: rollSpd/iframe = base·mul EXACTO; estamina = round(cost·mul.stam); `over`+overCanRoll:false ⇒ deny (no rueda, 0 gasto).
//   [AC move]           el factor move de la banda entra en `sp`: vx(fat)=vx(mid)·0.85, vx(over)=vx(mid)·0.6 EXACTO.
//   [AC1 OFF]           EQUIP_LOAD.enabled=false ⇒ mul=1 aunque el equipo sea legendary ⇒ doRoll NORMAL, rollSpd=base, estamina=cost ⇒ byte-id a HEAD.
//   [AC SAVE]           peso DERIVADO ⇒ serializeSave() byte-id ON/OFF, sin clave equipLoad*/equipBand*.
//   [AC2 RNG-STRONG]    script srand FIJO (48-draw) alrededor de un doRoll DISPARANDO REAL (equipo epic ⇒ fat) es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [REG]               los 13 pilares vivos (Frenzy…Bonfire) siguen srand ON==OFF.
//
// Run: node tools/cas1889-equip-load.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { EQUIP_LOAD, DODGE, STAMINA, CFG } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const approx = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const d = sim.dev;

// audio/view = deep no-op proxies (roll → audio.sfx.roll, deny → audio.sfx.deny). io.moveVec is MUTABLE so the move
// probe can inject [1,0]; default [0,0] (doRoll uses facing when the move vector is zero).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
let MV = [0, 0];
const io = { moveVec: () => MV, aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "equip"/"load" substring ⇒ the save-key regex can't false-match (mirror GuardiaQA/GraveQA/EstusQA).
  sim.createHero("CargaQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.equipLoadMeta();
  const bandsOk = meta.bands && meta.bands.fast > 0 && meta.bands.fast < meta.bands.mid && meta.bands.mid < meta.bands.fat;
  const midOne = meta.mul && meta.mul.mid && meta.mul.mid.dist === 1 && meta.mul.mid.iframe === 1 && meta.mul.mid.stam === 1 && meta.mul.mid.move === 1;
  if (meta.enabled && meta.capacity > 0 && bandsOk && midOne)
    pass(`content: EQUIP_LOAD knob present (capacity=${meta.capacity} | slotWeight=${J(meta.slotWeight)} | bands=${J(meta.bands)} | mid mul all 1 | overCanRoll=${meta.overCanRoll})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC2 mid==baseline]: initial loadout (3 common) lands in mid ⇒ mul all 1 ----------
  const ib = d.equipInitialBand();
  if (ib && ib.ok)
    pass(`AC2 mid==baseline: loadout INICIAL (3 common) total=${ib.total} ratio=${ib.ratio} ⇒ banda '${ib.band}' ⇒ multiplicadores todos 1 (mulAllOne=${ib.mulAllOne}) ⇒ el feel actual NO regresa`);
  else fail(`AC2 initial loadout NOT mid/baseline: ${J(ib)}`);

  // ---------- [AC bandas]: the 4 bands are reachable with real inventories ----------
  const cases = [
    ["fast", [null, null, "common"]],          // 1 slot (glass build) ⇒ fast
    ["mid", ["common", "common", "common"]],   // initial kit ⇒ mid
    ["fat", ["uncommon", "uncommon", "uncommon"]], // uniform uncommon upgrade ⇒ fat
    ["over", ["legendary", "legendary", "legendary"]], // full legendary ⇒ over
  ];
  for (const [want, [rw, rb, rs]] of cases) {
    const el = d.equipLoadOf(rw, rb, rs);
    if (el && el.band === want) pass(`AC bandas: equip {w:${rw},b:${rb},s:${rs}} ⇒ total=${el.total} ratio=${el.ratio.toFixed ? el.ratio.toFixed(4) : el.ratio} ⇒ banda '${el.band}' (== esperada)`);
    else fail(`AC bandas: expected '${want}', got ${J(el)}`);
  }

  // ---------- [AC roll]: band multiplies the REAL doRoll (rollSpd/iframe/stam) ----------
  const baseSpd = DODGE.distance / CFG.rollTime;
  const rMid = d.equipRollProbe("common", "common", "common");   // mid
  const rFast = d.equipRollProbe(null, null, "common");          // fast
  const rFat = d.equipRollProbe("uncommon", "uncommon", "uncommon"); // fat
  const rOver = d.equipRollProbe("legendary", "legendary", "legendary"); // over
  // mid = baseline exact
  if (rMid.band === "mid" && rMid.fired && approx(rMid.rollSpd, baseSpd) && rMid.stamSpent === STAMINA.cost.dodge)
    pass(`AC roll (mid): rollSpd=${rMid.rollSpd}==base(${baseSpd.toFixed(4)}) + estamina=${rMid.stamSpent}==cost(${STAMINA.cost.dodge}) ⇒ baseline exacto`);
  else fail(`AC roll mid wrong: ${J({ rMid, baseSpd })}`);
  // fast = base × 1.15
  if (rFast.band === "fast" && approx(rFast.rollSpd, baseSpd * EQUIP_LOAD.mul.fast.dist) && rFast.stamSpent === Math.round(STAMINA.cost.dodge * EQUIP_LOAD.mul.fast.stam))
    pass(`AC roll (fast): rollSpd=${rFast.rollSpd}==base·${EQUIP_LOAD.mul.fast.dist} + estamina=${rFast.stamSpent} ⇒ esquiva más larga`);
  else fail(`AC roll fast wrong: ${J({ rFast, expect: baseSpd * EQUIP_LOAD.mul.fast.dist })}`);
  // fat = base × 0.7, stam × 1.4
  if (rFat.band === "fat" && approx(rFat.rollSpd, baseSpd * EQUIP_LOAD.mul.fat.dist) && rFat.stamSpent === Math.round(STAMINA.cost.dodge * EQUIP_LOAD.mul.fat.stam))
    pass(`AC roll (fat): rollSpd=${rFat.rollSpd}==base·${EQUIP_LOAD.mul.fat.dist} + estamina=${rFat.stamSpent}==round(cost·${EQUIP_LOAD.mul.fat.stam}) ⇒ esquiva corta + cara`);
  else fail(`AC roll fat wrong: ${J({ rFat, expectSpd: baseSpd * EQUIP_LOAD.mul.fat.dist, expectStam: Math.round(STAMINA.cost.dodge * EQUIP_LOAD.mul.fat.stam) })}`);
  // over + overCanRoll:false ⇒ deny (no roll, 0 stam spent)
  if (rOver.band === "over" && !rOver.fired && rOver.stamSpent === 0)
    pass(`AC roll (over): sobrecargado (overCanRoll=${EQUIP_LOAD.overCanRoll}) ⇒ doRoll DENY (fired=${rOver.fired}, sin gasto de estamina=${rOver.stamSpent}) ANTES de gastar`);
  else fail(`AC roll over wrong: ${J(rOver)}`);
  // iframe scales too (ratio-based to be robust to any additive meta iframes on a clean warrior=0)
  if (approx(rFast.iframe / rMid.iframe, EQUIP_LOAD.mul.fast.iframe, 1e-4) && approx(rFat.iframe / rMid.iframe, EQUIP_LOAD.mul.fat.iframe, 1e-4))
    pass(`AC roll (iframe): i-frames escalan por banda (fast/mid=${(rFast.iframe / rMid.iframe).toFixed(3)}·, fat/mid=${(rFat.iframe / rMid.iframe).toFixed(3)}·)`);
  else fail(`AC roll iframe wrong: fast/mid=${rFast.iframe / rMid.iframe} fat/mid=${rFat.iframe / rMid.iframe}`);

  // ---------- [AC move]: band move factor enters `sp` (vx pre-clamp) ----------
  MV = [1, 0];
  const mMid = d.equipMoveProbe("common", "common", "common");
  const mFat = d.equipMoveProbe("uncommon", "uncommon", "uncommon");
  const mOver = d.equipMoveProbe("legendary", "legendary", "legendary");
  MV = [0, 0];
  if (mMid.vx > 0 && approx(mFat.vx / mMid.vx, EQUIP_LOAD.mul.fat.move, 1e-4) && approx(mOver.vx / mMid.vx, EQUIP_LOAD.mul.over.move, 1e-4))
    pass(`AC move: el factor de banda entra en la velocidad (vx mid=${mMid.vx}; fat/mid=${(mFat.vx / mMid.vx).toFixed(3)}·==${EQUIP_LOAD.mul.fat.move}; over/mid=${(mOver.vx / mMid.vx).toFixed(3)}·==${EQUIP_LOAD.mul.over.move})`);
  else fail(`AC move wrong: ${J({ mMid, mFat, mOver })}`);

  // ---------- [AC1 OFF]: enabled=false ⇒ mul=1 aunque el equipo sea legendary ⇒ doRoll NORMAL ----------
  const off = d.equipOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: EQUIP_LOAD.enabled=false ⇒ equipo legendary rueda NORMAL (fired=${off.fired}), rollSpd=${off.rollSpd}==base(${off.base}) (${off.rollSpdBase}), estamina=${off.stamSpent}==cost(${off.expectStam}) (${off.stamBase}) — byte-identical a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: derived weight ⇒ save.v1 byte-identical, no key ----------
  const sb = d.equipSaveByteId();
  if (sb.ok)
    pass(`AC SAVE: peso DERIVADO del equipo guardado ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave equipLoad*/equipBand* (hasKey=${sb.hasKey})`);
  else fail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC2 RNG-STRONG]: 48-draw fixed srand script (roll FIRING with mul) — ON == OFF ----------
  const SEED = 0x1889c0de, N = 24;
  const rON = d.equipSrandProbe(true, SEED, N);
  const rOFF = d.equipSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC2 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL banded doRoll`);
  else fail(`AC2: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC2 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la carga es aritmética sobre el equipo (0 srand draws, no equipLoadRng) incluso rodando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.rollFired)
    pass(`AC2: el probe ON SÍ rodó (equipo epic ⇒ fat, mul≠1) consumiendo 0 srand — ejercitó la ruta de disparo real (doRoll)`);
  else fail(`AC2 roll did not fire on the ON probe: ${J({ rollFired: rON.rollFired })}`);
  const rON2 = d.equipSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC2 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC2 determinism broke`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 13 prior pillars) ----------
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

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1891 equip-load (Carga de Equipo) harness: ALL PASS" : "\n❌ CAS-1891 equip-load (Carga de Equipo) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
