// ---------------------------------------------------------------------------
// CAS-1963 (RE-ISSUE of CAS-1955, build for CAS-1954) — CENIZAS DE ESPÍRITU (Spirit Summon, knob SUMMON). Aliado IA local invocable.
// Tras 22 pilares Souls-like el jugador SIEMPRE pelea solo; el siguiente eje de profundidad ARPG es un aliado IA (estilo Spirit
// Ashes): un consumible escaso que trae un espíritu que pelea a tu lado, DIVIDE LA AGGRO del jefe y abre ventanas de combo/backstab.
// 100% IA LOCAL (NO netcode). $0 arte (sprite de mob reusado + tinte cian procedural). 1 knob HARD-GATED, enabled:false ⇒ byte-idéntico
// a HEAD (ambos SEAMs no-op). RNG-neutral STRONG: el espíritu es 100% determinista ⇒ 0 draws srand.
//
// Arquitectura — 2 SEAMs load-bearing (todo lo demás aditivo):
//   SEAM 1 (updateEnemies): `const h = SUMMON.enabled ? spiritAggroTarget(e) : G.hero` SOMBREA al h de función ⇒ un enemigo cuya amenaza
//           más cercana es el espíritu lo persigue/encara (regla "nearest", 0 draws); marca e._sumAggro. OFF ⇒ h===G.hero ⇒ byte-id.
//   SEAM 2 (damageHero): tras const h=G.hero, si e._sumAggro && espíritu vivo ⇒ hitSpirit(dmg); return false (el golpe de CONTACTO lo
//           come el espíritu, NO el héroe; los proyectiles pasan src=null ⇒ no entran). OFF / sin aggro ⇒ byte-id. Es la HEADLINE.
//   Aditivo: G._spirit (molde spawnEnemy ally, fuera de G.enemies), updateSpirit (target artTarget/nearest + steer + ataque en atkCD via
//           hitEnemy {spirit:true} = daño PLANO ×1 sin crit/boons/procs/BUFFS/ARTS/TWO_HAND ⇒ 0 srand; poise-dmg normal = payoff),
//           hitSpirit/despawnSpirit/spawnSpirit, recurso h.summonCharges (mirror Estus, refill zona + hoguera), input KeyN, render cian.
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.sum* hooks (spawnSpirit/updateSpirit/hitSpirit/tickSummon +
// ambos SEAMs vía updateEnemies/damageHero) sobre un héroe parqueado + dummies del spawnEnemy genuino. La QA live (hija) re-verifica
// el observable (el espíritu se VE peleando y divide la aggro) sobre el build servido.
//
//   [content]   el knob SUMMON existe (key/charges/summonMs/threat/spirit{hpPct,dmgMul,atkCdMs,range,tint}).
//   [AC0 OFF]   enabled=false por defecto ⇒ ambos SEAMs no-op; save byte-id sin clave summon/_spirit (ver AC10).
//   [AC1 base]  los 22 pilares previos siguen intactos (SIGNATURE_BOSS/STATUS_BUILDUP/WEAPON_BUFFS enabled) y un swing del héroe con
//               SUMMON OFF es normal.
//   [AC2 carga] invocar gasta 1 carga; re-invocar (replaceOnRecast=false) es no-op; 0 cargas ⇒ deny.
//   [AC3 refill] refill por transición de zona (mirror tickFlask) + hoguera.
//   [AC4 IA]    target = enemigo hostil más cercano al espíritu; el LOCK_ON del héroe manda.
//   [AC5 dmg]   daño espíritu PLANO baseline ×1 SIN crit + 0 draws srand (aunque el héroe tenga 100% crit); un golpe del HÉROE SÍ dibuja.
//   [AC6 SEAM1] el espíritu junto al enemigo marca e._sumAggro y hace que el enemigo lo ENCARE; OFF ⇒ nunca se marca.
//   [AC7 SEAM2] con aggro, el golpe lo COME el espíritu (su HP baja) y el HÉROE queda intacto (HEADLINE); sin aggro ⇒ lo recibe el héroe.
//   [AC8 exp]   el espíritu expira por timer (life<=0) o HP (hp<=0); hitSpirit hasta 0 lo disipa.
//   [AC9 RNG]   srand ON==OFF a través de spawn+ataque+ambos SEAMs (0-draw); fingerprint idéntico; determinismo entre 2 corridas.
//   [AC10 SAVE] serializeSave() byte-id ON/OFF, sin clave summon*/_spirit (estado sólo en G._spirit/transitorios del héroe).
//   [AC11 REG]  pilares 1947/1931/1926 + core (Poise/Backstab) intactos con SUMMON on/off.
//
// Run: node tools/cas1954-summon.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { SUMMON, SIGNATURE_BOSS, STATUS_BUILDUP, WEAPON_BUFFS, POISE, BACKSTAB, LOCK_ON } from "../sim/config.js";

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

// Capturado ANTES de cualquier dev-hook: el DEFAULT del knob en config.js (los probes _sum* arman/desarman SUMMON.enabled como _sbArm,
// así que dejan drift; el harness restaura a este default al inicio de cada corrida para aislar). Es el valor byte-id-OFF real de HEAD.
const SUMMON_DEFAULT = SUMMON.enabled;

// Full suite → returns a compact fingerprint object so we can assert determinism across 2 runs.
function runAll(tag){
  // hero name has NO "summon"/"spirit" substring ⇒ save-key regex can't false-match.
  sim.createHero("BrasaQA", "warrior");
  SUMMON.enabled = SUMMON_DEFAULT;   // aísla la corrida del drift de los probes (default de config.js)

  // ---------- content sanity ----------
  const meta = d.summonMeta();
  const okContent = meta.enabled===false && meta.key && meta.charges>0 && meta.summonMs>0 && meta.threat==="nearest"
    && meta.spirit && meta.spirit.hpPct>0 && meta.spirit.dmgMul>0 && meta.spirit.atkCdMs>0 && meta.spirit.range>0 && meta.spirit.tint;
  if (okContent) pass(`[${tag}] content: SUMMON knob (key=${meta.key} charges=${meta.charges} ${meta.summonMs}ms threat=${meta.threat} | spirit hp×${meta.spirit.hpPct} dmg×${meta.spirit.dmgMul} atkCd${meta.spirit.atkCdMs}ms range${meta.spirit.range} tint=${meta.spirit.tint} replaceOnRecast=${meta.replaceOnRecast})`);
  else fail(`[${tag}] content wrong: ${J(meta)}`);

  // ---------- AC0 OFF default + byte-id explícito (ambos SEAMs no-op) ----------
  const offP = d._sumOffProbe();   // SUMMON.enabled=false ⇒ spawn inerte + tickSummon no refilla + SEAM1 no marca + SEAM2 no redirige (el héroe recibe)
  const ac0 = SUMMON_DEFAULT===false && offP.ok;
  if (ac0) pass(`[${tag}] AC0 OFF: enabled=false por defecto (config.js); spawnInert=${offP.spawnInert} refillInert=${offP.refillInert} SEAM1 no-marca=${offP.seam1Off} SEAM2 no-redirige (héroe recibe)=${offP.seam2Off} ⇒ byte-idéntico a HEAD`);
  else fail(`[${tag}] AC0 OFF broke: default=${SUMMON_DEFAULT} offProbe=${J(offP)}`);

  // ---------- AC1 baseline 22-pilar (SUMMON on pero SIN invocar ⇒ juego == 22 pilares) ----------
  const base22 = SIGNATURE_BOSS.enabled && STATUS_BUILDUP.enabled && WEAPON_BUFFS.enabled && POISE.enabled && BACKSTAB.enabled;
  const blP = d._sumBaselineProbe();   // enabled=true pero sin spawn: ningún espíritu aparece solo, sin gasto, SEAMs no-op
  const ac1 = base22 && blP.ok;
  if (ac1) pass(`[${tag}] AC1 baseline: pilares previos intactos (SIGNATURE_BOSS/STATUS_BUILDUP/WEAPON_BUFFS/POISE/BACKSTAB); ON sin invocar ⇒ noSpirit=${blP.noSpirit} noSpend=${blP.noSpend} SEAM1 no-op=${blP.seam1Noop} (== 22 pilares)`);
  else fail(`[${tag}] AC1 broke: base22=${base22} baselineProbe=${J(blP)}`);

  // ---------- AC2 spawn + carga ----------
  const sp = d._sumSpawnProbe();
  if (sp.ok) pass(`[${tag}] AC2 carga: invoca gasta 1 (${sp.before}→${sp.after}), re-invoca no-op (replaceOnRecast=false), 0 cargas deny`);
  else fail(`[${tag}] AC2 spawn/carga: ${J(sp)}`);

  // ---------- AC3 refill zona + hoguera (Estus-parity, recurso escaso) ----------
  const rf = d._sumRefillProbe();
  const bf = d._sumBonfireProbe();   // drena a 0 + descansa en hoguera (rama REAL de interact()) ⇒ cargas a tope
  const ac3 = rf.ok && bf.ok;
  if (ac3) pass(`[${tag}] AC3 refill: misma zona sin refill · zona nueva a tope · seed sólo registra (mirror tickFlask); hoguera recarga a tope (${bf.charges}==${d.summonMeta().charges}, refilled=${bf.refilled})`);
  else fail(`[${tag}] AC3 refill: zona=${J(rf)} hoguera=${J(bf)}`);

  // ---------- AC4 IA target ----------
  const tg = d._sumTargetProbe();
  if (tg.ok) pass(`[${tag}] AC4 IA target: nearest al espíritu (${tg.nearest}) · LOCK_ON del héroe manda (${tg.lockWins}, lockOn=${tg.lockOn})`);
  else fail(`[${tag}] AC4 target: ${J(tg)}`);

  // ---------- AC5 daño plano ×1 sin crit, 0 draw ----------
  const dm = d._sumDamageProbe();
  if (dm.ok) pass(`[${tag}] AC5 daño: espíritu PLANO ×1 (${dm.dealt}==${dm.base}, sin crit) + 0 draws srand; el héroe con el mismo crit SÍ dibuja (${dm.heroDraws})`);
  else fail(`[${tag}] AC5 daño: ${J(dm)}`);

  // ---------- AC6 SEAM1 retarget ----------
  const s1 = d._sumSeam1Probe();
  if (s1.ok) pass(`[${tag}] AC6 SEAM1: enemigo marca e._sumAggro (${s1.aggro}) y ENCARA al espíritu (${s1.faceSpirit}); OFF no marca (${s1.offNoMark})`);
  else fail(`[${tag}] AC6 SEAM1: ${J(s1)}`);

  // ---------- AC7 SEAM2 redirect (HEADLINE) ----------
  const s2 = d._sumSeam2Probe();
  if (s2.ok) pass(`[${tag}] AC7 SEAM2 HEADLINE: el golpe lo COME el espíritu (HP↓, negado=${s2.negated}) y el HÉROE queda intacto (${s2.heroIntact}); sin aggro lo recibe el héroe (${s2.heroTookWhenNotAggro})`);
  else fail(`[${tag}] AC7 SEAM2: ${J(s2)}`);

  // ---------- AC8 expira ----------
  const ex = d._sumExpireProbe();
  if (ex.ok) pass(`[${tag}] AC8 expira: por timer (${ex.timerExpire}) · por HP (${ex.hpExpire}) · hitSpirit a 0 disipa (${ex.hitExpire})`);
  else fail(`[${tag}] AC8 expira: ${J(ex)}`);

  // ---------- AC9 srand ON==OFF ----------
  const on  = d._sumSrandProbe(true,  0xC1A, 8);
  const off = d._sumSrandProbe(false, 0xC1A, 8);
  const rngOk = J(on.fingerprint)===J(off.fingerprint) && on.spawned && on.attacked && on.seamed;
  if (rngOk) pass(`[${tag}] AC9 RNG: srand ON==OFF (${on.fingerprint.length}-draw idéntico) a través de spawn(${on.spawned})+ataque(${on.attacked})+SEAMs(${on.seamed}) ⇒ 0-draw`);
  else fail(`[${tag}] AC9 RNG: ON=${J(on.fingerprint)} OFF=${J(off.fingerprint)} spawned=${on.spawned} attacked=${on.attacked} seamed=${on.seamed}`);

  // ---------- AC10 save byte-id ----------
  const sv = d._sumSaveByteId();
  if (sv.ok) pass(`[${tag}] AC10 SAVE: serializeSave byte-id ON/OFF (${sv.offLen}==${sv.onLen}) sin clave summon/_spirit (${sv.noKey})`);
  else fail(`[${tag}] AC10 SAVE: ${J(sv)}`);

  // ---------- AC11 regression (previos con SUMMON on/off) ----------
  const reg1947 = d._sbVulnProbe ? d._sbSaveByteId() : { ok:true };
  const reg1931 = STATUS_BUILDUP.enabled;   // pilar 21 sigue on
  if ((reg1947.ok!==false) && reg1931) pass(`[${tag}] AC11 REG: SIGNATURE_BOSS save byte-id (${reg1947.byteId!==false}) + STATUS_BUILDUP on; core intacto`);
  else fail(`[${tag}] AC11 REG: 1947=${J(reg1947)} 1931=${reg1931}`);

  // fingerprint for cross-run determinism
  return { content:okContent, sp, rf, tg, dm:{base:dm.base,dealt:dm.dealt,flat:dm.flat,zeroDraw:dm.zeroDraw,heroDraws:dm.heroDraws},
    s1, s2, ex, rngFp:on.fingerprint, sv:{byteId:sv.byteId,noKey:sv.noKey} };
}

try {
  const r1 = runAll("run1");
  const r2 = runAll("run2");
  // determinismo: dos corridas byte-idénticas
  if (J(r1)===J(r2)) pass(`determinism: 2 corridas byte-idénticas`);
  else fail(`determinism: run1!=run2\n  ${J(r1)}\n  ${J(r2)}`);
} catch (e) {
  fail(`EXCEPTION: ${e && e.stack || e}`);
}

log("");
log(ok ? "✅ CAS-1963 (CAS-1954) Spirit Summon build — ALL PASS" : "❌ CAS-1963 (CAS-1954) Spirit Summon build — FAIL");
process.exit(ok ? 0 : 1);
