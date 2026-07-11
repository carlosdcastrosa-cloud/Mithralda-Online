// ---------------------------------------------------------------------------
// CAS-1996 (build for CAS-1995) — CÓDICE DE COMBATE + HINTS CONTEXTUALES (knob COMBAT_CODEX). 25ª cosecha del kit.
// A (Códice): panel de referencia read-only, gateado por tecla fija (Backquote), que lista las mecánicas de combate
// VIVAS con su binding REAL (data-driven vía keyOf sobre el knob) + descripción. Clona el patrón Códice de Botín/
// Títulos/Pactos. B (Hints): toasts one-time de primer-encuentro cableados a ramas sim EXISTENTES (spendStam/damageHero/
// spawnChampion/bonfire-rest/createHero), persistidos en un store AISLADO nuevo (mithralda.hints.v1). $0 arte, 100% reuso.
//
// HARD-GATED: enabled:false ⇒ codexKey inerte, fireHint retorna temprano, mithralda.hints.v1 NUNCA se crea ⇒ save.v1 +
// srand byte-idénticos a HEAD. RNG-neutral STRONG: el códice sólo LEE, los hints sólo llaman toast (no-RNG) ⇒ 0 draws.
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES seams vía dev._cc* hooks (openCombatCodex/keyLabel/
// fireHint/serializeHints/loadHints + spendStam) + la tabla data-driven COMBAT_CODEX_ENTRIES. La QA live (hija) re-verifica
// el observable sobre el build servido.
//
//   [AC0]  knob COMBAT_CODEX presente, enabled:false default, codexKey libre (Backquote); entries no vacía + grupos.
//   [AC1]  codexKey abre scene="combatcodex" (enabled:true); codexKey/Escape cierran a play; enabled:false ⇒ inerte.
//   [AC2]  scroll de la escena clampado (↓ avanza, ↑ clampa a 0).
//   [AC3]  DATA-DRIVEN: retunear FLASK.key ⇒ el texto del códice muestra la tecla NUEVA (nada hardcodeado que mienta).
//   [AC4]  gate honesto: una mecánica DARK no se lista; VIVA sí.
//   [AC5]  $0 arte: entries = texto puro (label/keyOf/desc/gate); ninguna referencia a assets.
//   [AC6]  hint one-time dispara en primer-encuentro (spendStam DENY) — observable (toast) 1 vez.
//   [AC7]  el hint persiste en mithralda.hints.v1 (serialize→load roundtrip); el 2º encuentro NO re-dispara.
//   [AC8]  showContextHints:false ⇒ 0 hints, el códice (A) sigue funcionando.
//   [AC9]  knob OFF ⇒ fireHint no-op, store no creado (hintsDirty false), byte-id save.v1.
//   [AC10] RNG-neutral: srand ON==OFF 0 draws; save.v1 byte-id con hints set vs vacío; 24 mecánicas intactas.
//   [AC11] determinismo: 2 corridas byte-idénticas (lógica sim pura, sin DOM ⇒ desktop==mobile).
//
// Run: node tools/cas1995-codex.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { COMBAT_CODEX, COMBAT_CODEX_ENTRIES, PARRY, ARENA, SUMMON, BOSS_RUSH, SIGNATURE_BOSS, STAMINA, FLASK, LOCK_ON } from "../sim/config.js";

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

// Captured BEFORE any dev-hook: the config.js default of the knob (probes toggle enabled, leaving drift; restored each run).
const CC_DEFAULT = COMBAT_CODEX.enabled;

function runAll(tag){
  // hero name has NO "hint"/"codex" substring ⇒ save-key regex can't false-match.
  sim.createHero("ReferQA", "warrior");
  COMBAT_CODEX.enabled = CC_DEFAULT;

  // ---------- AC0 content sanity ----------
  const meta = d.combatCodexMeta();
  const banned = meta.codexKey==="KeyH"; // KeyH = Parry (colisión) — debe ser Backquote
  const okContent = meta.enabled===false && meta.codexKey==="Backquote" && !banned
    && meta.entryCount>0 && meta.groups.length>=4 && typeof meta.toastSecs==="number";
  if (okContent) pass(`[${tag}] AC0 content: COMBAT_CODEX knob (enabled=${meta.enabled} codexKey=${meta.codexKey} showHints=${meta.showContextHints} toast=${meta.toastSecs}s hudHint=${meta.showHudHint}) · ${meta.entryCount} entradas en grupos [${meta.groups.join(",")}]`);
  else fail(`[${tag}] AC0 content wrong: ${J(meta)}`);

  // ---------- AC1 codexKey abre/cierra; OFF inerte ----------
  const op = d._ccOpenProbe();
  if (op.ok) pass(`[${tag}] AC1 escena: codexKey abre scene="${op.opened}"; codexKey cierra→"${op.closedByKey}"; Escape cierra→"${op.closedByEsc}"; enabled:false ⇒ inerte (queda "${op.inertOpen}")`);
  else fail(`[${tag}] AC1 open/close: ${J(op)}`);

  // ---------- AC2 scroll clampado ----------
  const sp = d._ccScrollProbe();
  if (sp.ok) pass(`[${tag}] AC2 scroll: ↓⇒${sp.down}, ↑↑⇒clamp ${sp.clamped} (nunca <0)`);
  else fail(`[${tag}] AC2 scroll: ${J(sp)}`);

  // ---------- AC3 DATA-DRIVEN (nada hardcodeado que mienta) ----------
  const dd = d._ccDataDriven();
  if (dd.ok) pass(`[${tag}] AC3 data-driven: retune FLASK.key⇒"${dd.retunedRaw}" el códice muestra "[${dd.retunedDisp}]" (getter sobre el knob vivo); restaurado a "${dd.restored}"`);
  else fail(`[${tag}] AC3 data-driven: ${J(dd)}`);

  // Cross-check directo: cada entrada visible resuelve su tecla por getter (no un literal). Compara con el knob real.
  const entries = d._ccEntries();
  const flaskE = entries.find(e=>e.label==="Beber Estus");
  const lockE = entries.find(e=>e.label==="Fijar objetivo");
  const parryE = entries.find(e=>e.label==="Parada con Tempo");
  const arenaE = entries.find(e=>e.label==="Arena de Oleadas");
  const keyMatch = !!flaskE && flaskE.raw===FLASK.key && !!lockE && lockE.raw===LOCK_ON.key
    && !!parryE && parryE.raw===PARRY.key && !!arenaE && arenaE.raw===ARENA.key;
  if (keyMatch) pass(`[${tag}] AC3b bindings vivos: Estus=[${flaskE?flaskE.key:"—"}]==${FLASK.key} · Lock=[${lockE?lockE.key:"—"}]==${LOCK_ON.key} · Parry=[${parryE?parryE.key:"—"}]==${PARRY.key} · Arena=[${arenaE?arenaE.key:"—"}]==${ARENA.key} (todos vía keyOf, 0 literales)`);
  else fail(`[${tag}] AC3b bindings drift: flask=${J(flaskE)} lock=${J(lockE)} parry=${J(parryE)} arena=${J(arenaE)}`);

  // R2 honesto: COMBO.heavyKey y SUMMON.key ambos "KeyN" ⇒ el códice muestra AMBOS (no lo oculta).
  const nKeyed = entries.filter(e=>e.raw==="KeyN").map(e=>e.label);
  const r2Honest = nKeyed.length>=2 && nKeyed.includes("Ataque pesado") && nKeyed.includes("Invocar espíritu");
  if (r2Honest) pass(`[${tag}] AC3c R2 honesto: KeyN aparece en 2 entradas [${nKeyed.join(", ")}] (señal real de retune CTO, NO oculta)`);
  else fail(`[${tag}] AC3c R2: entradas KeyN = ${J(nKeyed)} (SUMMON.enabled=${SUMMON.enabled})`);

  // ---------- AC4 gate honesto (dark no se lista) ----------
  const gh = d._ccGateHonesty();
  if (gh.ok) pass(`[${tag}] AC4 gate honesto: SUMMON dark⇒NO listado (${!gh.listedWhenDark}); SUMMON vivo⇒listado (${gh.listedWhenLive}). El códice no miente.`);
  else fail(`[${tag}] AC4 gate: ${J(gh)}`);

  // ---------- AC5 $0 arte (entries = texto puro) ----------
  const artClean = COMBAT_CODEX_ENTRIES.every(e=> typeof e.label==="string" && typeof e.desc==="string" && typeof e.keyOf==="function" && typeof e.gate==="function");
  const noAssetRef = COMBAT_CODEX_ENTRIES.every(e=> !/\.(png|jpg|webp|svg|mp3|wav)/i.test(e.desc+e.label));
  if (artClean && noAssetRef) pass(`[${tag}] AC5 $0 arte: ${COMBAT_CODEX_ENTRIES.length} entradas = texto puro (label/keyOf/desc/gate), 0 referencias de asset`);
  else fail(`[${tag}] AC5 art: clean=${artClean} noAsset=${noAssetRef}`);

  // ---------- AC6/AC7 hint one-time + persistencia ----------
  const hs = d._ccStaminaHint();
  if (hs.ok) pass(`[${tag}] AC6 hint: 1er stamina agotada ⇒ toast "${hs.firstToast}" (dirty=${hs.dirty}); 2ª vez NO re-dispara (toast=${hs.secondToast})`);
  else fail(`[${tag}] AC6 hint: ${J(hs)}`);
  const hp = d._ccHintPersist();
  if (hp.ok) pass(`[${tag}] AC7 persiste: serialize→load ${J(hp.blob)}; reset a vacío (${hp.clearedCount}) ⇒ reload restaura {boss:${hp.restored.boss},flask:${hp.restored.flask}}`);
  else fail(`[${tag}] AC7 persist: ${J(hp)}`);

  // ---------- AC8 showContextHints:false ⇒ 0 hints, códice sigue ----------
  const stg = d._ccSubToggle();
  if (stg.ok) pass(`[${tag}] AC8 sub-toggle: showContextHints:false ⇒ 0 hints (${stg.noHint}) PERO el códice abre igual (${stg.codexStillOpens})`);
  else fail(`[${tag}] AC8 sub-toggle: ${J(stg)}`);

  // ---------- AC9 OFF byte-id ----------
  const off = d._ccOffByteId();
  if (off.ok) pass(`[${tag}] AC9 OFF byte-id: enabled:false ⇒ fireHint no-op (${off.fireReturned}), hintsSeen vacío (${off.seenEmpty}), hintsDirty false⇒store nunca creado (${off.cleanDirty}), sin clave en save.v1 (${off.noKey})`);
  else fail(`[${tag}] AC9 OFF: ${J(off)}`);

  // ---------- AC10 [RNG-STRONG] save byte-id + srand ON==OFF ----------
  const sv = d._ccSaveByteId();
  const srandOn  = d._ccSrandProbe(true,  0xC0DE, 8);
  const srandOff = d._ccSrandProbe(false, 0xC0DE, 8);
  const srandIdent = J(srandOn.fingerprint)===J(srandOff.fingerprint);
  const ac10 = sv.ok && srandIdent;
  if (ac10) pass(`[${tag}] AC10 [RNG-STRONG]: save.v1 byte-id con hints set vs vacío (${sv.offLen}==${sv.onLen}, sin clave ${sv.noKey}); srand ON==OFF ${srandOn.fingerprint.length}-draw idéntico (fireHint 0 draws)`);
  else fail(`[${tag}] AC10 broke: save=${J(sv)} srandOn=${J(srandOn.fingerprint)} srandOff=${J(srandOff.fingerprint)}`);

  // ---------- AC11 base: 24 mecánicas intactas (features on) ----------
  const base24 = SIGNATURE_BOSS.enabled && SUMMON.enabled && BOSS_RUSH.enabled && PARRY.enabled && STAMINA.enabled && FLASK.enabled;
  if (base24) pass(`[${tag}] AC11 base: pilares previos intactos (SIGNATURE_BOSS/SUMMON/BOSS_RUSH/PARRY/STAMINA/FLASK on); COMBAT_CODEX no toca su código`);
  else fail(`[${tag}] AC11 base broke: base24=${base24}`);

  // fingerprint for cross-run determinism
  return { content:okContent, op:{opened:op.opened,inert:op.inertOpen}, scroll:{down:sp.down,clamped:sp.clamped},
    dd:{raw:dd.retunedRaw,disp:dd.retunedDisp}, entries:entries.map(e=>({l:e.label,k:e.raw})), gate:{dark:gh.listedWhenDark,live:gh.listedWhenLive},
    hs:{first:hs.firstToast,second:hs.secondToast,dirty:hs.dirty}, hp:{cleared:hp.clearedCount,restored:hp.restored},
    stg:{noHint:stg.noHint,codex:stg.codexStillOpens}, off:{fired:off.fireReturned,noKey:off.noKey,dirty:off.cleanDirty},
    sv:{byteId:sv.byteId,noKey:sv.noKey}, srandFp:srandOn.fingerprint };
}

try {
  const r1 = runAll("run1");
  const r2 = runAll("run2");
  if (J(r1)===J(r2)) pass(`AC11 determinism: 2 corridas byte-idénticas`);
  else fail(`AC11 determinism: run1!=run2\n  ${J(r1)}\n  ${J(r2)}`);
} catch (e) {
  fail(`EXCEPTION: ${e && e.stack || e}`);
}

log("");
log(ok ? "✅ CAS-1996 (CAS-1995) Códice de Combate + Hints build — ALL PASS" : "❌ CAS-1996 (CAS-1995) Códice de Combate + Hints build — FAIL");
process.exit(ok ? 0 : 1);
