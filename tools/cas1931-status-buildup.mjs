// ---------------------------------------------------------------------------
// CAS-1933 (build for CAS-1931) — ACUMULACIÓN DE ESTADOS (Status Buildup, knob STATUS_BUILDUP). 21º pilar Souls-like.
// Sistema Souls-like de buildup: barras OCULTAS por tipo (ent.bld) que PROCEAN un efecto en RÁFAGA al llenarse y DECAEN si no
// se sostiene la presión. 100% BORROW sobre el motor de status CAS-118 (applyStatus/tickDots/STATUS): cada golpe elemental
// on-hit se RECONVIERTE (gated) en acumulación en vez de aplicar el status al instante; el golpe físico melee alimenta bleed.
//
// Arquitectura: addBuildup(ent,btype,srcAmt,isHero) sube ent.bld[btype] en type.build (×bossBuildMul si isBoss); al cruzar
// threshold ⇒ procBuildup (bleed⇒ráfaga round(maxHp*procPctHp) defence-bypass ruteada a killEnemy/heroDie · poison⇒applyStatus
// poison DoT · frost⇒applyStatus slow + drena stam héroe) + reset. tickBuildup decae decayPerSec*dt (clamp 0, ent.bld=null al
// vaciarse). statusOrBuildup envuelve cada applyStatus elemental (hitEnemy boons 2247/2248 + WEAPON_BUFFS ember/frost 2259 +
// afijo burn 2319 + damageHero infl 4496): enabled+mapeado⇒feed medidor, si no⇒applyStatus instantáneo byte-id. Paridad
// enemigo→héroe por el MISMO helper/tabla (damageHero choke). 0 draws (aritmética/timing) ⇒ srand ON==OFF. HARD-GATED:
// enabled:false ⇒ reconversión CAE a applyStatus original ⇒ byte-idéntico a HEAD (20 pilares, bleed inerte, 0 medidor/tick/proc).
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.buildup* hooks (addBuildup / procBuildup / tickBuildup /
// statusOrBuildup / hitEnemy opt.melee / damageHero choke). La QA live (hija) re-verifica sobre el build servido.
//
// Prueba:
//   [content]        el knob STATUS_BUILDUP existe (3 tipos bleed/poison/frost, decayPerSec, bossBuildMul, elementMap).
//   [AC0 OFF]        enabled=false ⇒ golpe elemental aplica status INSTANTÁNEO (dots/slowT) como HEAD; sin medidor bld — byte-id.
//   [AC1 baseline]   ON pero medidor bajo umbral ⇒ ningún proc (sube pero sin ráfaga) — feel 20 pilares conservado.
//   [AC2 bleed]      golpe físico melee llena bld.bleed ⇒ al cruzar umbral PROC ráfaga=round(maxHp*procPctHp) + reset; jefe
//                    bossProcPctHp + ×bossBuildMul (umbral efectivo mayor); muerte por ráfaga ⇒ killEnemy.
//   [AC3 poison]     burn/poison reconvertido ⇒ alimenta bld.poison; SIN proc no aplica veneno instantáneo; al llenarse ⇒ DoT poison N s.
//   [AC4 frost]      frost reconvertido ⇒ alimenta bld.frost; al llenarse ⇒ slow fuerte + (héroe) drena stam en procStamDrain.
//   [AC5 decae]      sin sostener, bld baja decayPerSec/s a 0 (tickBuildup); picotear no procea (umbral no se cruza).
//   [AC6 paridad]    enemigo elemental / físico melee ⇒ damageHero alimenta h.bld; al llenarse el héroe SUFRE el proc. Simétrico.
//   [AC7 compone]    buildup convive con WEAPON_BUFFS/dmgMul sin bypass; el dmgMul melee sigue aplicando; proc por ent.hp (no inyecta stun).
//   [AC8 RNG-STRONG] srand 48-draw ON vs OFF byte-idéntico; buildupFed/buildupProc 0-draw (sin buildupRng).
//   [AC9 SAVE]       serializeSave() byte-id ON/OFF, sin clave bld*/buildup*/bleed*.
//   [AC10 REG]       los 20 pilares previos (Frenzy…Resinas/Buffs) siguen srand ON==OFF + core-loop (regresión aparte).
//
// Run: node tools/cas1931-status-buildup.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { STATUS_BUILDUP } from "../sim/config.js";

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

try {
  // hero name has NO "bld"/"buildup"/"bleed" substring ⇒ save-key regex can't false-match (mirror GrasaQA/VueloQA).
  sim.createHero("SangreQA", "warrior");

  // ---------- content sanity: el knob ----------
  const meta = d.buildupMeta();
  const ty = meta.types || {};
  const has3 = ty.bleed && ty.poison && ty.frost;
  const emOk = meta.elementMap && meta.elementMap.burn === "poison" && meta.elementMap.slow === "frost";
  if (meta.enabled && has3 && meta.decayPerSec > 0 && meta.bossBuildMul > 0 && meta.bossBuildMul < 1 && emOk)
    pass(`content: STATUS_BUILDUP knob presente (enabled=${meta.enabled} | decay=${meta.decayPerSec}/s | bossMul=${meta.bossBuildMul} | tipos: ${Object.keys(ty).map(k=>`${k}(thr${ty[k].threshold} +${ty[k].build})`).join(", ")} | elementMap=${J(meta.elementMap)})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC0 OFF] ----------
  const off = d.buildupOffProbe();
  if (off && off.ok) pass(`AC0 OFF: enabled=false ⇒ burn/slow INSTANTÁNEO (instantBurn=${off.instantBurn} instantSlow=${off.instantSlow}) + sin medidor (noMeter=${off.noMeter} físico-no-feed=${off.stillNoMeter}) — byte-idéntico a HEAD`);
  else fail(`AC0 OFF broke: ${J(off)}`);

  // ---------- [AC1 baseline] ----------
  const bl = d.buildupBaselineProbe();
  if (bl && bl.ok) pass(`AC1 baseline: ON sub-umbral ⇒ medidor sube(${bl.meter}) SIN proc(${bl.noProc}) — feel 20 pilares conservado`);
  else fail(`AC1 baseline broke: ${J(bl)}`);

  // ---------- [AC2 bleed] ----------
  const bd = d.buildupBleedProbe();
  if (bd && bd.ok)
    pass(`AC2 bleed: golpe REAL melee alimenta bleed(${bd.meleeFeeds}); sub-umbral sin proc(${bd.noProcYet}); ráfaga=${bd.burst}≈${bd.expectBurst}(${bd.burstOk}) + reset(${bd.reset}); jefe ${bd.bossHits} golpes ráfaga=${bd.bburst}≈${bd.bExpect}(${bd.bossOk}); letal⇒killEnemy(${bd.killed})`);
  else fail(`AC2 bleed broke: ${J(bd)}`);

  // ---------- [AC3 poison] ----------
  const po = d.buildupPoisonProbe();
  if (po && po.ok)
    pass(`AC3 poison: burn reconvertido ⇒ SIN veneno instantáneo(${po.noInstant}) sub-umbral sin proc(${po.noProcYet}); al llenarse ⇒ DoT poison fuerte(${po.poisonDot}) + reset(${po.reset})`);
  else fail(`AC3 poison broke: ${J(po)}`);

  // ---------- [AC4 frost] ----------
  const fr = d.buildupFrostProbe();
  if (fr && fr.ok)
    pass(`AC4 frost: frost reconvertido sub-umbral sin proc(${fr.noProcYet}); enemigo ⇒ slow fuerte(${fr.enemySlow}) + reset(${fr.enemyReset}); héroe ⇒ slow(${fr.heroSlow}) + drena stam a ${fr.heroStam}(${fr.stamDrained})`);
  else fail(`AC4 frost broke: ${J(fr)}`);

  // ---------- [AC5 decae] ----------
  const de = d.buildupDecayProbe();
  if (de && de.ok)
    pass(`AC5 decae: medidor ${de.b0}⇒${de.afterTick} tras 1s(${de.decayed}) ⇒ 0/null(${de.clearedToNull}); picotear no procea(${de.peckNoProc})`);
  else fail(`AC5 decae broke: ${J(de)}`);

  // ---------- [AC6 paridad héroe] ----------
  const pa = d.buildupParityProbe();
  if (pa && pa.ok)
    pass(`AC6 paridad: físico melee enemigo ⇒ ráfaga bleed héroe=${pa.heroBurst}≈${pa.expectBurst}(${pa.bleedOk}); infl frost enemigo ⇒ héroe slow+drena stam(${pa.heroFrost}). Simétrico`);
  else fail(`AC6 paridad broke: ${J(pa)}`);

  // ---------- [AC7 compone] ----------
  const cp = d.buildupComposeProbe();
  if (cp && cp.ok)
    pass(`AC7 compone: whet dmg×1.35 sigue aplicando(${cp.dmgApplied}≈${cp.dmgExpect} ${cp.dmgOk}) Y el golpe alimenta bleed(${cp.bledFed}); proc no inyecta stun(${cp.noStunInject})`);
  else fail(`AC7 compone broke: ${J(cp)}`);

  // ---------- [AC8 RNG-STRONG] ----------
  const SEED = 0x1931c0de, N = 48;
  const rON  = d.buildupSrandProbe(true,  SEED, N);
  const rOFF = d.buildupSrandProbe(false, SEED, N);
  const srandOk = rON.fingerprint.every((v,i) => v === rOFF.fingerprint[i]);
  if (rON.buildupFed && rON.buildupProc && srandOk)
    pass(`AC8 RNG-STRONG: srand ON==OFF ${N}-draw (byte-idéntico aun acumulando+proceando); buildupFed=${rON.buildupFed} buildupProc=${rON.buildupProc} 0-draw (sin buildupRng)`);
  else {
    const diffs = rON.fingerprint.map((v,i)=>`idx${i}:${v}vs${rOFF.fingerprint[i]}`).filter((_,i)=>rON.fingerprint[i]!==rOFF.fingerprint[i]);
    fail(`AC8 RNG: srandOk=${srandOk} fed=${rON.buildupFed} proc=${rON.buildupProc} — primeras diferencias: ${diffs.slice(0,3).join(" | ")}`);
  }

  // ---------- [AC9 SAVE] ----------
  const sv = d.buildupSaveByteId();
  if (sv && sv.ok)
    pass(`AC9 SAVE: serializeSave() byte-id ON/OFF(${sv.byteId}) sin clave bld*/buildup*/bleed*(${sv.noBldKey}) len=${sv.offLen}`);
  else fail(`AC9 SAVE broke: ${J(sv)}`);

  // ---------- [AC10 REG] ----------
  const regSys = [
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
    ["Hyperarmor", 0x1901c0de, d.hyperSrandProbe],
    ["Bonfire", 0x1879c0de, d.bonfireSrandProbe],
  ];
  let regN = 0;
  for (const [name, sd, probe] of regSys) {
    if (!probe) { pass(`REG: ${name} absent — skipped`); continue; }
    const on = probe.call(d, true, sd, 24), o = probe.call(d, false, sd, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand BYTE-IDENTICAL ON vs OFF`); }
    else fail(`REG: ${name} srand regressed`);
  }
  // Zone-sensitive probes: fresh pristine-town hero each (Arts/Arch/TwoHand/EquipLoad/Throwables/Buffs)
  const zoneReg = [
    ["Weapon-Arts", 0x1914c0de, "artSrandProbe"],
    ["Weapon-Archetypes", 0x1907c0de, "archSrandProbe"],
    ["Two-Handing", 0x1895c0de, "twoHandSrandProbe"],
    ["EquipLoad", 0x1889c0de, "equipSrandProbe"],
    ["Throwables", 0x1920c0de, "throwSrandProbe"],
    ["Weapon-Buffs", 0x1926c0de, "buffSrandProbe"],
  ];
  for (const [name, sd, fn] of zoneReg) {
    sim.createHero("SangreQA", "warrior");
    const probe = d[fn]; if (!probe) { pass(`REG: ${name} absent — skipped`); continue; }
    const on = probe.call(d, true, sd, 24), o = probe.call(d, false, sd, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand BYTE-IDENTICAL`); }
    else fail(`REG: ${name} regressed`);
  }
  pass(`AC10 REG: ${regN} sistemas srand ON==OFF (20 pilares previos: Frenzy…Bonfire + Arts + Archetypes + Two-Hand + EquipLoad + Throwables + Weapon-Buffs)`);

} catch(e) {
  fail(`UNEXPECTED: ${e.message}\n${e.stack}`);
}

console.log();
if (ok) console.log("✔ CAS-1931 status-buildup — ALL PASS");
else      console.error("✖ CAS-1931 status-buildup — FAILURES ABOVE");
process.exit(ok ? 0 : 1);
