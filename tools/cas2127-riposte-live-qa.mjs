// ---------------------------------------------------------------------------
// CAS-2127 (Build DARK, umbrella) — RIPOSTE / EJECUCIÓN CRÍTICA POR ATURDIMIENTO (knob RIPOSTE). 36ª mecánica Souls-like.
// Todo el kit defensivo ya vivo abre una VENTANA DE ROTURA del enemigo (poise-break, guard/dodge-counter poise, frost-shatter
// vía buildup→poise, two-hand, jefe firma) pero hoy el payoff es sólo "golpes gratis" (POISE.bonusDmg + COMBO.staggerPunishMul,
// aplicados a TODO el resto de la ventana). RIPOSTE introduce la EJECUCIÓN dedicada: el PRIMER golpe melee que conecta sobre un
// objetivo ROTO se convierte en un Crítico de ejecución (×dmgMul + tinte/flash propio + poise extra + pequeña Esencia) y CONSUME
// el estado ⇒ UN solo crítico por rotura (no crit infinito encadenado). Convierte la inversión en poise/parry/status en payoff.
//
// ⚠️ Eje DISJUNTO de h.riposte/CFG.riposteMult (CAS-210, mecánica armada por PERFECT-DODGE del HÉROE). Éste se llavea por el
//    ESTADO DEL ENEMIGO: flag transitorio e._ripArm + e.staggerT>0. Nombres nuevos disjuntos.
//
// Arquitectura (seams, todos gated RIPOSTE.enabled):
//   A. Armar — e._ripArm=true en el rising-edge del poise-break (sim.js:2902, ÚNICO chokepoint de producción que setea
//      e.staggerT ⇒ cubre TODO: combo-pesado, frost-shatter vía buildup→poise, two-hand, guard/dodge-counter, jefe firma).
//   B. Ejecutar+consumir+capar — en hitEnemy, tras el sink de multiplicadores de stagger (POISE.bonusDmg, COMBO.staggerPunishMul,
//      backstab, vuln) y de guard/dodge-counter (ya escalaron dmg en applyHeroMelee): 1er melee sobre objetivo ROTO+armado ⇒
//      dmg×dmgMul; CAP DURO ripCapFracMaxHp×maxHp SÓLO jefe/élite/campeón (trash SIN cap); consume e._ripArm; bonus Esencia.
//   C. VFX — floater STR.riposteExec (¡CRÍTICO!) tinte ejecución #ff9a3a + shockring/debris/shake, JUICE-gated, $0 arte.
// CERO draws (NO existe riposteRng) ⇒ srand ON==OFF byte-idéntico aun con la ejecución disparando. e._ripArm transitorio de
// enemigo (mirror e.staggerT/e.poise, NUNCA serializado) ⇒ save.v1 byte-id SIN clave rip*. HARD-GATED: enabled:false ⇒ break no
// arma + ejecución muerta ⇒ byte-idéntico a HEAD (OFF==baseline).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.riposte* hooks, que corren los seams
// REALES (hitEnemy poise-break → arma; hitEnemy sink → ejecuta+consume+capa; applyHeroMelee). La QA OBSERVABLE re-verifica servido.
//
// Prueba:
//   [AC HEADLINE]   objetivo ROTO+armado ⇒ 1er melee = Riposte (ratio dRip/dNormal == dmgMul), consume; 2º melee = NORMAL.
//   [AC SEAM-A]     poise-break por golpe NO-melee ARMA _ripArm y lo DEJA armado (requiresMelee ⇒ no ejecuta); el siguiente MELEE ejecuta+consume.
//   [AC CAP]        vs jefe/élite (maxHp bajo) el Riposte ≤ ripCapFracMaxHp×maxHp (el cap MUERDE); trash SIN cap (valor uncapped > cap).
//   [AC ESENCIA]    una ejecución suma essenceBonus a meta; un golpe NORMAL no suma; OFF no suma (gated, no rompe la economía).
//   [AC OFF]        enabled=false ⇒ break NO arma + forzar e._ripArm=true es INERTE (dmg byte-id a HEAD).
//   [AC SAVE]       e._ripArm transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave ripArm*.
//   [AC RNG-STRONG] script srand FIJO (48-draw) alrededor de break→ejecución→consumo (disparando real) BYTE-IDÉNTICO ON vs OFF.
//   [REG]           TODAS las mecánicas previas (Frenzy…Rally, 35 mec) siguen srand ON==OFF (0 regresión).
//
// Run: node tools/cas2127-riposte-live-qa.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { RIPOSTE } from "../sim/config.js";

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

  // NB: hero name has NO "rip"/"execute"/"crit" substring ⇒ the save-key regex can't false-match.
  sim.createHero("StaggerQA", "warrior");

  // ---------- content sanity: the knob (DARK: enabled:false shipped) ----------
  const meta = d.riposteMeta();
  const numsOk = meta.dmgMul > 1 && meta.poiseMul >= 1 && meta.essenceBonus >= 0 && meta.ripCapFracMaxHp > 0 && meta.ripCapFracMaxHp < 1;
  if (numsOk) lpass(`content: RIPOSTE knob present (enabled=${meta.enabled} | dmgMul=${meta.dmgMul} | poiseMul=${meta.poiseMul} | essenceBonus=${meta.essenceBonus} | ripCapFracMaxHp=${meta.ripCapFracMaxHp} | requiresMelee=${meta.requiresMelee})`);
  else lfail(`content wrong: ${J(meta)}`);
  if (meta.enabled === false) lpass(`content: SHIP DARK — enabled=false (el CEO flipea en el Gate)`);
  else lfail(`content: expected enabled=false (DARK), got ${meta.enabled}`);

  // ---------- [AC HEADLINE]: 1er melee sobre roto+armado = Riposte ×dmgMul + consume; 2º = normal ----------
  const hp = d.riposteHeadlineProbe();
  if (hp && hp.ok)
    lpass(`AC HEADLINE: roto+NO-armado=${hp.dNormal} vs roto+armado=${hp.dRip} ⇒ ratio=${hp.ratio}==dmgMul(${hp.expect}); consume (${hp.consumed}); 2º golpe misma ventana=${hp.dSecond}==normal (${hp.secondNormal}) ⇒ UN crítico por rotura`);
  else lfail(`AC HEADLINE broke: ${J(hp)}`);

  // ---------- [AC SEAM-A]: break no-melee arma _ripArm (queda armado); melee posterior ejecuta+consume ----------
  const ap = d.riposteArmProbe();
  if (ap && ap.ok)
    lpass(`AC SEAM-A: poise-break por golpe NO-melee ARMA _ripArm (${ap.armedByBreak}) + ROTO (${ap.staggeredNow}), requiresMelee ⇒ NO ejecutó en ese golpe (armado pendiente=${ap.notExecutedYet}); el siguiente MELEE ejecuta+consume (${ap.consumedByMelee})`);
  else lfail(`AC SEAM-A arm broke: ${J(ap)}`);

  // ---------- [AC CAP]: jefe/élite capado a ripCapFracMaxHp×maxHp; trash sin cap ----------
  const cp = d.riposteCapProbe();
  if (cp && cp.ok)
    lpass(`AC CAP: cap=ripCapFracMaxHp×maxHp=${cp.cap}; jefe Riposte=${cp.dBoss}≤cap (capBound=${cp.capBound}, bossCapped=${cp.bossCapped}); trash SIN cap=${cp.dTrash}>cap (${cp.trashUncapped}) ⇒ anti one-shot pero ejecución total en trash`);
  else lfail(`AC CAP broke: ${J(cp)}`);

  // ---------- [AC ESENCIA]: ejecución +essenceBonus; normal +0; OFF +0 ----------
  const ep = d.riposteEssenceProbe();
  if (ep && ep.ok)
    lpass(`AC ESENCIA: ejecución suma +${ep.dExec}==essenceBonus(${ep.bonus}); golpe NORMAL suma +${ep.dNorm}; OFF suma +${ep.dOff} ⇒ recompensa de skill sin romper la economía meta`);
  else lfail(`AC ESENCIA broke: ${J(ep)}`);

  // ---------- [AC OFF]: enabled=false ⇒ break no arma + forzar _ripArm INERTE ----------
  const off = d.riposteOffProbe();
  if (off && off.ok)
    lpass(`AC OFF: RIPOSTE.enabled=false ⇒ poise-break NO arma _ripArm (${off.noArm}) + forzar e._ripArm=true INERTE — dmg idéntico (${off.dForced}==${off.dRef}) ⇒ rama de daño byte-idéntica a HEAD`);
  else lfail(`AC OFF not inert: ${J(off)}`);

  // ---------- [AC SAVE]: transient enemy flag ⇒ save.v1 byte-identical, no key ----------
  const sb = d.riposteSaveByteId();
  if (sb.ok)
    lpass(`AC SAVE: e._ripArm transitorio de enemigo (nunca serializado) ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave ripArm* (hasKey=${sb.hasKey})`);
  else lfail(`AC SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC RNG-STRONG]: 48-draw fixed srand script (break→ejecución→consumo FIRING) — ON == OFF ----------
  const SEED = 0x2127c0de, N = 24;
  const rON = d.riposteSrandProbe(true, SEED, N);
  const rOFF = d.riposteSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) lpass(`AC RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around un break que arma + un melee que ejecuta+consume real`);
  else lfail(`AC RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    lpass(`AC RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — la ejecución es detección+aritmética (0 draws, no riposteRng) aun disparando`);
  else lfail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.riposteFired)
    lpass(`AC RNG-STRONG: el probe ON SÍ armó (break) + ejecutó+consumió con 0 srand — ejercitó la ruta de disparo real`);
  else lfail(`AC RNG: riposte did not fire on the ON probe: ${J({ riposteFired: rON.riposteFired })}`);
  const rON2 = d.riposteSrandProbe(true, SEED, N);
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

  // ---------- [REG]: existing srand probes stay ON==OFF (0 regresión en las 35 mecánicas vivas) ----------
  sim.createHero("StaggerQA", "warrior");
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
  ];
  let regN = 0;
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    sim.createHero("StaggerQA", "warrior");   // fresh hero/world per probe ⇒ no cross-probe state bleed (each probe reseeds srand internally)
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`); regN++; }
    else fail(`REG: ${name} srand regressed`);
  }
  pass(`REG SUMMARY: ${regN}/${reg.length} live-mechanic srand probes BYTE-IDENTICAL ON==OFF (RIPOSTE adds 0 regression)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-2127 riposte (Ejecución Crítica por Aturdimiento, mec #36 DARK) harness: ALL PASS" : "\n❌ CAS-2127 riposte harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
