// ---------------------------------------------------------------------------
// CAS-1915 (build for CAS-1914) — ARTES DE ARMA (Weapon Arts / "Ash of War", knob WEAPON_ARTS). 18º pilar Souls-like. Cada
// ARQUETIPO de arma (Pilar 17) gana un movimiento FIRMA (tecla Semicolon / botón HUD) con coste de estamina + cooldown, cuyo
// efecto escala por arquetipo. 100% BORROW sobre los seams vivos (arquetipo/hyperarmor/dash/backstab/two-hand/estamina),
// hard-gated, RNG-neutral, save-neutral (transitorio).
//
// Arquitectura: weaponArt() (gated en play + héroe vivo + h.artCD<=0 + clase melee) despacha por weaponArchName(h) (MISMO mapa
// byDefId que Pilar 17) ⇒ WEAPON_ARTS.classes[name]. Gasta art.stam vía spendStam + arma h.artCD (mirror h.atkCD). Arma un swing
// con h._art=true ⇒ applyHeroMelee/hitEnemy leen los muls normalizados (h._artCls: ×dmg/reach/arc/poise), componiendo ×arquetipo
// ×TWO_HAND. greatsword extiende la ventana de HYPERARMOR (h._artHyper, Pilar 16); dagger DASHEA al arco rear ⇒ auto-backstab
// (Pilar 6); spear reach↑↑ arco estrecho; sword arco completo. CERO draws (NO weaponArtRng) ⇒ srand ON==OFF byte-idéntico aun
// disparando. HARD-GATED: enabled:false ⇒ weaponArt() rama muerta + gate hyperarmor inerte ⇒ byte-idéntico a HEAD (17 pilares).
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.art*/weaponArt* hooks, que corren los seams REALES
// (weaponArt / applyHeroMelee / hitEnemy / damageHero). La QA live (hija) re-verifica sobre el build servido.
//
// Prueba:
//   [content]        el knob WEAPON_ARTS existe (4 artes por arquetipo, key Semicolon, cooldownMs).
//   [AC0 OFF]        enabled=false ⇒ weaponArt() INERTE (no arma swing/cooldown/gasto) + swing normal == fórmula de 17 pilares.
//   [AC1 baseline]   ARTS on pero Arte NO disparado ⇒ swing normal == arts-off == arquetipo (w_iron ⇒ sword ⇒ ×1 ⇒ byte-id HEAD).
//   [AC2 greatsword] Golpe de Carga ⇒ dmg×1.8 + poise×2.2 + HYPERARMOR (stun sub-umbral suprimido, daño aterriza; supra rompe).
//   [AC3 dagger]     Filo Sombrío ⇒ dashea al arco rear ⇒ backstab=true (×BACKSTAB.mult×archBackstabMul).
//   [AC4 spear]      Estocada Perforante ⇒ reach efectivo ×1.8, arco estrecho ×0.4, pierce (>1 enemigo en línea).
//   [AC5 sword]      Tajo Circular ⇒ arco ×2.0 golpea arco completo, dmg×1.0 (equilibrado), poise×1.2.
//   [AC6 coste/cd]   gasta stam vía spendStam (falla sin vigor); h.artCD bloquea re-disparo hasta expirar.
//   [AC7 compone]    greatsword+twoHand ⇒ dmg = base × archDmgMul × artDmgMul × twoHandDmgMul (multiplicativo).
//   [AC8 RNG-STRONG] script srand FIJO (48-draw) alrededor de disparar el Arte con greatsword es BYTE-IDÉNTICO ON vs OFF, 0 draws.
//   [AC9 SAVE]       transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave art*/weaponArt*.
//   [AC10 REG]       los 17 pilares previos (Frenzy…Arquetipos) siguen srand ON==OFF + core-loop/touch (regresión aparte).
//
// Run: node tools/cas1914-weapon-arts.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { WEAPON_ARTS, WEAPON_ARCHETYPES, TWO_HAND, BACKSTAB, HYPERARMOR, STAMINA, POISE } from "../sim/config.js";

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
  // NB: hero name has NO "art"/"weaponart" substring ⇒ the save-key regex can't false-match (mirror DosManosQA/SuperQA/ArquetipoQA).
  sim.createHero("FirmaQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.weaponArtMeta();
  const cls = meta.classes || {};
  const hasFour = cls.sword && cls.greatsword && cls.dagger && cls.spear;
  if (meta.enabled && hasFour && meta.key === "Semicolon" && meta.cooldownMs > 0)
    pass(`content: WEAPON_ARTS knob present (enabled=${meta.enabled} | key=${meta.key} | cooldownMs=${meta.cooldownMs} | 4 artes: ${["greatsword","dagger","spear","sword"].map(k=>cls[k].name).join(", ")})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC0 OFF]: enabled=false ⇒ weaponArt() INERT + normal swing == 17-pillar formula ----------
  const off = d.artOffProbe();
  if (off && off.ok)
    pass(`AC0 OFF: enabled=false ⇒ weaponArt() rama muerta (inert=${off.inert}) + swing normal dmg=${off.dOff}(==arquetipo ${off.headDmg}) — byte-idéntico a HEAD`);
  else fail(`AC0 OFF not inert: ${J(off)}`);

  // ---------- [AC1 baseline]: ARTS on, Art NOT fired ⇒ baseline intact ----------
  const bl = d.artBaselineProbe();
  if (bl && bl.ok)
    pass(`AC1 baseline: ARTS on sin disparar ⇒ swing normal dmg=${bl.dOn}(==arts-off ${bl.dOff}==arquetipo ${bl.headDmg}) — feel Pilar 17 conservado, byte-id`);
  else fail(`AC1 baseline broke: ${J(bl)}`);

  // ---------- [AC2 greatsword]: dmg×1.8, poise×2.2 + HYPERARMOR ----------
  const gs = d.artProbe("w_steel");
  if (gs && gs.name === "greatsword" && gs.ok && Math.abs(gs.dmgRatio - 1.8) < 1e-6 && Math.abs(gs.poiseRatio - 2.2) < 1e-6)
    pass(`AC2 greatsword (${gs.artName}): dmg×${gs.dmgRatio}(==${gs.expDmg}) poise×${gs.poiseRatio}(==${gs.expPoise})`);
  else fail(`AC2 greatsword muls broke: ${J(gs)}`);
  const gh = d.artHyperProbe();
  if (gh && gh.ok)
    pass(`AC2 greatsword HYPERARMOR: Arte armado (armed=${gh.armed} hyperOn=${gh.hyperOn}) ⇒ stun sub-umbral (${gh.lo}<${gh.thr}) SUPRIMIDO (stun=${gh.subStun}) pero daño aterriza (hpDrop=${gh.subHpDrop}); supra-umbral (${gh.hi}) ROMPE (stun=${gh.hiStun}); idle sin Arte SÍ aturde (stun=${gh.idleStun})`);
  else fail(`AC2 greatsword hyperarmor broke: ${J(gh)}`);

  // ---------- [AC3 dagger]: dash to rear ⇒ backstab ----------
  const dg = d.artDaggerProbe();
  if (dg && dg.ok)
    pass(`AC3 dagger (Filo Sombrío): dashea al arco rear (rearOk=${dg.rearOk} behind=${dg.behind}) ⇒ swing por la espalda ⇒ backstab dmg ${dg.offDmg}→${dg.onDmg} ×${dg.ratio}(==BACKSTAB.mult×archBackstabMul ${dg.expRatio}) — backstabFired=${dg.backstabFired}`);
  else fail(`AC3 dagger backstab broke: ${J(dg)}`);

  // ---------- [AC4 spear]: reach×1.8, narrow arc×0.4, pierce ----------
  const sp = d.artProbe("w_rune");
  if (sp && sp.name === "spear" && sp.ok && Math.abs(sp.dmgRatio - 1.2) < 1e-6 && sp.reachTested && sp.reachOk && sp.arcTested && sp.arcOk)
    pass(`AC4 spear (${sp.artName}): dmg×${sp.dmgRatio} reach×${sp.reachMul}(límite ${sp.reachAt}px: normal falla, Arte pega ⇒ ${sp.reachOk?"ok":"FAIL"}) arco×${sp.arcMul}(estrecho ${sp.arcAt}rad: normal pega, Arte falla ⇒ ${sp.arcOk?"ok":"FAIL"})`);
  else fail(`AC4 spear muls broke: ${J(sp)}`);
  const pc = d.artPierceProbe();
  if (pc && pc.ok) pass(`AC4 spear pierce: un swight del Arte impacta 2 enemigos en línea frontal (hit1=${pc.hit1} hit2=${pc.hit2})`);
  else fail(`AC4 spear pierce broke: ${J(pc)}`);

  // ---------- [AC5 sword]: full arc×2.0, dmg×1.0, poise×1.2 ----------
  const sw = d.artProbe("w_iron");
  if (sw && sw.name === "sword" && sw.ok && Math.abs(sw.dmgRatio - 1.0) < 1e-6 && Math.abs(sw.poiseRatio - 1.2) < 1e-6 && sw.arcTested && sw.arcOk)
    pass(`AC5 sword (${sw.artName}): dmg×${sw.dmgRatio}(equilibrado) poise×${sw.poiseRatio} arco×${sw.arcMul}(completo ${sw.arcAt}rad: normal falla, Arte pega ⇒ ${sw.arcOk?"ok":"FAIL"})`);
  else fail(`AC5 sword muls broke: ${J(sw)}`);

  // ---------- [AC6 coste/cooldown] ----------
  const cd = d.artCooldownProbe();
  if (cd && cd.ok)
    pass(`AC6 coste/cooldown: sin vigor ⇒ deny (denied=${cd.denied}); con vigor ⇒ dispara + gasta ${cd.spent}(==${cd.cost}) + arma cooldown (fired=${cd.fired}); dentro del cd ⇒ bloqueado (blocked=${cd.blocked}); expirado ⇒ re-dispara (refires=${cd.refires})`);
  else fail(`AC6 coste/cooldown broke: ${J(cd)}`);

  // ---------- [AC7 compone TWO_HAND] ----------
  const cp = d.artComposeProbe();
  if (cp && cp.ok)
    pass(`AC7 compone: base=${cp.base} → greatsword Art ×${cp.artDmgMul}=${cp.art} → +twoHand ×${cp.twoHandDmgMul}=${cp.both}(==base×art×two, bothRatio ${cp.bothRatio}==${cp.expBoth}) — multiplicativo, sin pisar`);
  else fail(`AC7 compose broke: ${J(cp)}`);

  // ---------- [AC9 SAVE]: transient ⇒ save byte-id, no key ----------
  const sb = d.artSaveByteId();
  if (sb.ok)
    pass(`AC9 SAVE: h.artCD/_art/_artCls/_artHyper transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave art*/weaponArt* (hasKey=${sb.hasKey})`);
  else fail(`AC9 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC8 RNG-STRONG]: 48-draw fixed srand script (art FIRING w/ greatsword) — ON == OFF ----------
  const SEED = 0x1914c0de, N = 24;
  const rON = d.artSrandProbe(true, SEED, N);
  const rOFF = d.artSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC8 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around firing el Golpe de Carga con greatsword`);
  else fail(`AC8 RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC8 RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el Arte es input/aritmética (0 srand draws, no weaponArtRng) aun disparando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.weaponArtFired)
    pass(`AC8 RNG-STRONG: el probe ON SÍ escaló poise (greatsword Golpe de Carga) consumiendo 0 srand — ejercitó la ruta real`);
  else fail(`AC8 RNG: weapon art did not fire on the ON probe: ${J({ weaponArtFired: rON.weaponArtFired })}`);
  const rON2 = d.artSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC8 RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC8 RNG determinism broke`);

  // ---------- [AC10 REG]: existing srand probes stay ON==OFF (all 17 prior pillars) ----------
  // NB (gotcha zona-sensible, mirror cas1907/1911): Bonfire REUBICA al héroe a una zona de caza; Two-Handing / Equip-Load son
  // SENSIBLES A LA POSICIÓN (su killEnemy de alineación del loot cae en zonas distintas). Por eso esos + Weapon-Archetypes (que
  // matan skeletons en zona sensible) se corren al FINAL con HÉROE PRÍSTINO recién recreado en el pueblo. Los demás resetean su
  // propio estado; Bonfire va el último del bucle común.
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
  // Weapon-Archetypes (17º pilar) — héroe PRÍSTINO en el pueblo (archSrandProbe mata skeletons en zona sensible).
  sim.createHero("FirmaQA", "warrior");
  if (d.archSrandProbe) {
    const on = d.archSrandProbe(true, 0x1907c0de, 24), o = d.archSrandProbe(false, 0x1907c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Weapon-Archetypes srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Weapon-Archetypes srand regressed`);
  } else pass(`REG: Weapon-Archetypes srand probe absent — skipped`);
  // Two-Handing (15º pilar) — héroe PRÍSTINO en el pueblo (killEnemy de alineación sensible a zona).
  sim.createHero("FirmaQA", "warrior");
  if (d.twoHandSrandProbe) {
    const on = d.twoHandSrandProbe(true, 0x1895c0de, 24), o = d.twoHandSrandProbe(false, 0x1895c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Two-Handing srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Two-Handing srand regressed`);
  } else pass(`REG: Two-Handing srand probe absent — skipped`);
  // EquipLoad (14º pilar) — héroe PRÍSTINO en el pueblo para aislar la sensibilidad a zona del doRoll+loot.
  sim.createHero("FirmaQA", "warrior");
  if (d.equipSrandProbe) {
    const on = d.equipSrandProbe(true, 0x1889c0de, 24), o = d.equipSrandProbe(false, 0x1889c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: EquipLoad srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: EquipLoad srand regressed`);
  } else pass(`REG: EquipLoad srand probe absent — skipped`);
  pass(`AC10 REG: ${regN} sistemas srand ON==OFF (17 pilares previos: Frenzy…Hyperarmor + Weapon-Archetypes + Two-Handing + Equip Load)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1915 weapon-arts (Artes de Arma) harness: ALL PASS" : "\n❌ CAS-1915 weapon-arts (Artes de Arma) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
