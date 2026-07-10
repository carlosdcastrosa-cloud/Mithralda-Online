// ---------------------------------------------------------------------------
// CAS-1909 (build for CAS-1907) — ARQUETIPOS DE ARMA (Weapon Archetypes, knob WEAPON_ARCHETYPES). 17º pilar Souls-like. El
// arma equipada define una CLASE de manejo (sword/greatsword/dagger/spear) que reescala alcance/arco/velocidad/daño/poise-
// damage/estamina/backstab del swing melee. 100% BORROW sobre pilares 8-16, hard-gated, RNG-neutral, save-neutral (derivado).
//
// Arquitectura: helper `weaponArchetype(h)` (espejo de equipLoad(h)) lee h.equip.weapon.defId ⇒ mapa `byDefId` ⇒ clase de mul.
// 0-draw, SIN campo de save (el defId ya se serializa como gear real). Seams (todos gated WEAPON_ARCHETYPES.enabled, todos
// ×mul): applyHeroMelee (reach ×reachMul, arc ×arcMul, dmg ×dmgMul + opt.arch ⇒ hitEnemy escala poise ×poiseDmgMul y backstab
// ×backstabMul), heroAttack/heavyAttack (swing ×swingMul en atkCD y atkAnim), heavy/finisher stam (×stamMul). Los mul COMPONEN
// con TWO_HAND (multiplicativo). CERO draws (NO archetypeRng) ⇒ srand ON==OFF byte-idéntico aun disparando. HARD-GATED:
// enabled:false ⇒ TODOS los seams usan la unidad (×1) ⇒ byte-idéntico a HEAD. Loadout inicial w_iron ⇒ 'sword' ⇒ todo ×1 (AC2).
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.arch*/weaponArchetype* hooks, que
// corren los seams REALES (applyHeroMelee / heroAttack / heavyAttack / hitEnemy). La QA live (hija) re-verifica sobre el build.
//
// Prueba:
//   [content]       el knob WEAPON_ARCHETYPES existe (4 clases, byDefId no mapea w_iron ⇒ AC2).
//   [AC2 default]   w_iron ⇒ 'sword' ⇒ todos los mul == 1 ⇒ combate byte-id (headEquiv).
//   [AC5 muls]      por arquetipo (greatsword/dagger/spear): reach/arc/swing/dmg/poise/stam/backstab escalan vs sword baseline.
//   [AC6 compone]   greatsword + twoHand ⇒ dmg = base × archDmgMul × twoHandDmgMul (multiplicativo).
//   [AC1 OFF]       enabled=false ⇒ un arma mapeada (greatsword) es INERTE (dmg/swing/stam == fórmula HEAD).
//   [AC4 SAVE]      derivado ⇒ serializeSave() byte-id ON/OFF, sin clave archetype*/weaponArch*.
//   [AC3 RNG-STRONG]script srand FIJO (48-draw) alrededor de swing + PODER-swing con greatsword DISPARANDO es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [AC7 REG]       los 16 pilares previos (Frenzy…Hyperarmor) siguen srand ON==OFF.
//
// Run: node tools/cas1907-weapon-archetypes.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { WEAPON_ARCHETYPES, TWO_HAND, STAMINA, POISE } from "../sim/config.js";

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
  // NB: hero name has NO "arch"/"archetype"/"weapon" substring ⇒ the save-key regex can't false-match (mirror GuardiaQA/SuperQA).
  sim.createHero("ArquetipoQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.weaponArchetypeMeta();
  const cls = meta.classes || {};
  const hasFour = cls.sword && cls.greatsword && cls.dagger && cls.spear;
  const swordUnit = cls.sword && Object.values(cls.sword).every((v) => v === 1);
  if (meta.enabled && hasFour && swordUnit)
    pass(`content: WEAPON_ARCHETYPES knob present (enabled=${meta.enabled} | 4 clases | sword=todo 1 | byDefId=${J(meta.byDefId)})`);
  else fail(`content wrong: ${J(meta)}`);
  // AC2 guard: byDefId must NOT map the starter weapon w_iron (⇒ starter derives 'sword')
  if (!("w_iron" in (meta.byDefId || {}))) pass(`content AC2: byDefId NO mapea w_iron (loadout inicial ⇒ 'sword' ⇒ 0 regresión)`);
  else fail(`content AC2: byDefId maps w_iron ⇒ starter would NOT be 'sword': ${J(meta.byDefId)}`);

  // ---------- [AC2 default]: w_iron ⇒ sword ⇒ all muls 1, combat byte-id ----------
  const sw = d.archWeaponProbe("w_iron");
  if (sw && sw.archName === "sword" && sw.headEquiv && Math.abs(sw.dmgRatio - 1) < 1e-9 && Math.abs(sw.swingRatio - 1) < 1e-9)
    pass(`AC2 default: w_iron ⇒ '${sw.archName}' ⇒ dmg×${sw.dmgRatio} swing×${sw.swingRatio} poise×${sw.poiseRatio} (todo 1) + headEquiv ⇒ combate byte-id a HEAD`);
  else fail(`AC2 default sword broke: ${J(sw)}`);

  // ---------- [AC5 muls]: per-archetype scaling ----------
  const cases = [
    ["w_steel", "greatsword"],
    ["w_rusty", "dagger"],
    ["w_rune", "spear"],
  ];
  for (const [defId, expectName] of cases) {
    const p = d.archWeaponProbe(defId);
    if (!p) { fail(`AC5 ${defId}: probe null`); continue; }
    if (p.archName !== expectName) { fail(`AC5 ${defId}: expected '${expectName}', resolved '${p.archName}'`); continue; }
    if (p.ok)
      pass(`AC5 ${expectName} (${defId}): reach×${p.cls.reachMul}(${p.reachTested ? (p.reachOk ? "ok" : "FAIL") : "n/a"}) arc×${p.cls.arcMul}(${p.arcTested ? (p.arcOk ? "ok" : "FAIL") : "n/a"}) swing×${p.swingRatio}==${p.cls.swingMul} dmg×${p.dmgRatio}==${p.cls.dmgMul} poise×${p.poiseRatio}==${p.cls.poiseDmgMul} stam ${p.sOff}→${p.sOn}(=${p.stamExpOn}) backstab×${p.backstabRatio}==${p.cls.backstabMul}`);
    else fail(`AC5 ${expectName} (${defId}) scaling broke: ${J(p)}`);
  }
  // Explicit headline reads per the acceptance table (greatsword reach↑ dmg↑ poise↑ swing lento; dagger backstab↑ reach↓ dmg↓; spear reach↑↑ arc↓)
  const gs = d.archWeaponProbe("w_steel"), dg = d.archWeaponProbe("w_rusty"), sp = d.archWeaponProbe("w_rune");
  if (gs.cls.reachMul > 1 && gs.cls.dmgMul > 1 && gs.cls.poiseDmgMul > 1 && gs.cls.swingMul > 1) pass(`AC5 read: greatsword = alcance↑ daño↑ poise↑ swing LENTO (swingMul ${gs.cls.swingMul}>1)`);
  else fail(`AC5 read greatsword wrong: ${J(gs.cls)}`);
  if (dg.cls.backstabMul > 1 && dg.cls.reachMul < 1 && dg.cls.dmgMul < 1) pass(`AC5 read: dagger = backstab↑ (${dg.cls.backstabMul}) alcance↓ (${dg.cls.reachMul}) daño↓ (${dg.cls.dmgMul})`);
  else fail(`AC5 read dagger wrong: ${J(dg.cls)}`);
  if (sp.cls.reachMul > gs.cls.reachMul && sp.cls.arcMul < 1) pass(`AC5 read: spear = alcance↑↑ (${sp.cls.reachMul}) arco↓ (${sp.cls.arcMul})`);
  else fail(`AC5 read spear wrong: ${J(sp.cls)}`);

  // ---------- [AC6 compone]: greatsword × twoHand multiplicative ----------
  const cp = d.archComposeProbe();
  if (cp && cp.ok)
    pass(`AC6 compone: base=${cp.base} → greatsword ×${cp.archDmgMul}=${cp.arch} → +twoHand ×${cp.twoHandDmgMul}=${cp.both}(==base×arch×two ${cp.expBoth}) — multiplicativo, sin pisar`);
  else fail(`AC6 compose broke: ${J(cp)}`);

  // ---------- [AC1 OFF]: enabled=false ⇒ mapped weapon INERT == HEAD formula ----------
  const off = d.archOffProbe();
  if (off && off.ok)
    pass(`AC1 OFF: enabled=false ⇒ greatsword INERTE — dmg=${off.dOff}(==equippedDmg·dmgMul ${off.headDmg}), swing cd=${off.cdOff}(==HEAD ${off.headCD}), heavy stam=${off.sOff}(==cost) — byte-idéntico a HEAD`);
  else fail(`AC1 OFF not inert: ${J(off)}`);

  // ---------- [AC4 SAVE]: derived ⇒ save.v1 byte-identical, no key ----------
  const sb = d.archSaveByteId();
  if (sb.ok)
    pass(`AC4 SAVE: arquetipo DERIVADO ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave archetype*/weaponArch* (hasKey=${sb.hasKey})`);
  else fail(`AC4 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC3 RNG-STRONG]: 48-draw fixed srand script (swing+heavy FIRING w/ greatsword) — ON == OFF ----------
  const SEED = 0x1907c0de, N = 24;
  const rON = d.archSrandProbe(true, SEED, N);
  const rOFF = d.archSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC3 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around swing + PODER-swing con greatsword`);
  else fail(`AC3 RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC3 RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el arquetipo es input/aritmética (0 srand draws, no archetypeRng) aun disparando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.archetypeFired)
    pass(`AC3 RNG-STRONG: el probe ON SÍ escaló dmg/poise/reach/stam (greatsword) consumiendo 0 srand — ejercitó la ruta real`);
  else fail(`AC3 RNG: archetype did not fire on the ON probe: ${J({ archetypeFired: rON.archetypeFired })}`);
  const rON2 = d.archSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC3 RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC3 RNG determinism broke`);

  // ---------- [AC7 REG]: existing srand probes stay ON==OFF (all 16 prior pillars) ----------
  // NB: Bonfire REUBICA al héroe a una zona de caza; EquipLoad y Two-Handing son SENSIBLES A LA POSICIÓN (su killEnemy de
  // alineación del loot cae en zonas distintas). Por eso esos se corren al FINAL con HÉROE PRÍSTINO recién recreado en el
  // pueblo (mirror gotcha cas1893/cas1896/cas1901). Los demás resetean su propio estado; Bonfire va el último del loop.
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
    ["Hyperarmor", 0x1901c0de, d.hyperSrandProbe],
    ["Bonfire", 0x1879c0de, d.bonfireSrandProbe],
  ];
  let regN = 0;
  for (const [name, seed, probe] of reg) {
    if (!probe) { pass(`REG: ${name} srand probe absent — skipped`); continue; }
    const on = probe.call(d, true, seed, 24), o = probe.call(d, false, seed, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: ${name} srand still BYTE-IDENTICAL ON vs OFF`); }
    else fail(`REG: ${name} srand regressed`);
  }
  // Two-Handing (15º pilar) — héroe PRÍSTINO en el pueblo (killEnemy de alineación sensible a zona; Bonfire reubicó al héroe).
  sim.createHero("ArquetipoQA", "warrior");
  if (d.twoHandSrandProbe) {
    const on = d.twoHandSrandProbe(true, 0x1895c0de, 24), o = d.twoHandSrandProbe(false, 0x1895c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Two-Handing srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Two-Handing srand regressed`);
  } else pass(`REG: Two-Handing srand probe absent — skipped`);
  // EquipLoad (14º pilar) — héroe PRÍSTINO en el pueblo para aislar la sensibilidad a zona del doRoll+loot.
  sim.createHero("ArquetipoQA", "warrior");
  if (d.equipSrandProbe) {
    const on = d.equipSrandProbe(true, 0x1889c0de, 24), o = d.equipSrandProbe(false, 0x1889c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: EquipLoad srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: EquipLoad srand regressed`);
  } else pass(`REG: EquipLoad srand probe absent — skipped`);
  pass(`AC7 REG: ${regN} sistemas srand ON==OFF (16 pilares previos: Frenzy…Hyperarmor + Two-Handing + Equip Load)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1909 weapon-archetypes (Arquetipos de Arma) harness: ALL PASS" : "\n❌ CAS-1909 weapon-archetypes (Arquetipos de Arma) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
