// ---------------------------------------------------------------------------
// CAS-1922 (build for CAS-1920) — CONSUMIBLES ARROJADIZOS (Throwing Items, knob THROWABLES). 19º pilar Souls-like. La primera
// herramienta a DISTANCIA de recurso limitado tras 18 pilares melee: 2 consumibles firma (cuchillo recto / bomba incendiaria) con
// coste de estamina + cargas finitas (refill por zona / hoguera). 100% BORROW sobre los seams vivos (proyectil de hechizo, LOCK_ON
// aim, STAMINA coste, refill-por-zona tipo Estus, status `burn`), hard-gated, RNG-neutral, save-neutral (transitorio), $0 arte.
//
// Arquitectura: throwItem() (gated en play + héroe vivo + throwCD<=0 + throwWind<=0 + no rodando/aturdido) selecciona h.throwSel ⇒
// THROWABLES.types[sel]; deny sin cargas / sin vigor (spendStam); al disparar gasta stam + 1 carga + arma throwCD/throwWind; apunta
// vía artTarget (LOCK_ON Pilar 12) o h.facing; spawna reusando el MOLDE de proyectil de hechizo (G.projectiles.push) ⇒ la colisión /
// hitEnemy / applyStatus(burn) / aoe / filtro life>0 YA viven en updateProjectiles. El cuchillo (infl:null, recto) y la bomba
// (infl:burn, aoe) sólo difieren por DATOS del knob. cycleThrow() cicla el tipo. tickThrow refilla al cambiar de zona + decrementa
// throwCD/throwWind. CERO draws (NO throwRng) ⇒ srand ON==OFF byte-idéntico aun lanzando. HARD-GATED: enabled:false ⇒ throwItem()/
// cycleThrow() rama muerta ⇒ byte-idéntico a HEAD (18 pilares).
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.throw* hooks, que corren los seams REALES (throwItem /
// cycleThrow / tickThrow / refillThrowables / updateProjectiles / hitEnemy / applyStatus). La QA live (hija) re-verifica sobre el build servido.
//
// Prueba:
//   [content]        el knob THROWABLES existe (2 tipos knife/firebomb, throwKey Quote, cycleKey Slash, cooldownMs/windupMs).
//   [AC0 OFF]        enabled=false ⇒ throwItem()/cycleThrow() INERTES (no proyectil/gasto/cooldown/ciclo) — byte-idéntico a HEAD.
//   [AC1 baseline]   ON pero sin lanzar ⇒ un tick no consume nada (cargas/estamina/proyectiles intactos) — feel 18 pilares conservado.
//   [AC2 cuchillo]   knife ⇒ proyectil RECTO kind:"knife", infl:null (sin burn), gasta stam+1 carga, cd bloquea; impacto ⇒ hitEnemy dmg.
//   [AC3 bomba]      firebomb ⇒ kind:"firebomb" aoe>0 + infl:burn; impacto ⇒ applyStatus(burn) DoT + daño de ÁREA; más cara + más escasa.
//   [AC4 apuntado]   con lockTarget ⇒ ángulo hacia el objetivo (artTarget); sin lock ⇒ ángulo = h.facing.
//   [AC5 recurso]    cargas decrementan; a 0 ⇒ no lanza; MISMA zona ⇒ no refill; CAMBIO de zona / bonfire ⇒ refill a tope. NO infinito.
//   [AC6 coste]      lanzar gasta stam vía spendStam; vigor insuficiente ⇒ no lanza (0 cargas gastadas).
//   [AC7 windup]     tras lanzar, throwWind>0 BLOQUEA attack + move (comprometido); expirado ⇒ libres.
//   [AC8 RNG-STRONG] script srand FIJO (48-draw) alrededor de LANZAR una bomba es BYTE-IDÉNTICO ON vs OFF, 0 draws; throwableFired 0-draw.
//   [AC9 SAVE]       transitorio ⇒ serializeSave() byte-id ON/OFF, sin clave throw*/knifeCharges/bombCharges.
//   [AC10 REG]       los 18 pilares previos (Frenzy…Artes de Arma) siguen srand ON==OFF + core-loop/touch (regresión aparte).
//
// Run: node tools/cas1920-throwables.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { THROWABLES, STAMINA } from "../sim/config.js";

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
  // NB: hero name has NO "throw"/"knife"/"bomb" substring ⇒ the save-key regex can't false-match (mirror FirmaQA/DosManosQA).
  sim.createHero("VueloQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.throwMeta();
  const ty = meta.types || {};
  const hasTwo = ty.knife && ty.firebomb;
  if (meta.enabled && hasTwo && meta.throwKey === "Quote" && meta.cycleKey === "Slash" && meta.cooldownMs > 0 && meta.windupMs > 0)
    pass(`content: THROWABLES knob present (enabled=${meta.enabled} | throwKey=${meta.throwKey} | cycleKey=${meta.cycleKey} | cd=${meta.cooldownMs} wind=${meta.windupMs} | tipos: ${meta.order.map(k=>`${ty[k].name}(x${ty[k].charges})`).join(", ")})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC0 OFF] ----------
  const off = d.throwOffProbe();
  if (off && off.ok) pass(`AC0 OFF: enabled=false ⇒ throwItem() rama muerta (inert=${off.inert}) + cycleThrow() inerte (${off.cycleInert}) — byte-idéntico a HEAD`);
  else fail(`AC0 OFF not inert: ${J(off)}`);

  // ---------- [AC1 baseline] ----------
  const bl = d.throwBaselineProbe();
  if (bl && bl.ok) pass(`AC1 baseline: ON sin lanzar ⇒ un tick no consume nada (cargas/estamina/proyectiles intactos) — feel 18 pilares conservado`);
  else fail(`AC1 baseline broke: ${J(bl)}`);

  // ---------- [AC2 cuchillo] ----------
  const kn = d.throwKnifeProbe();
  if (kn && kn.ok)
    pass(`AC2 cuchillo: proyectil RECTO kind:"knife" (straight=${kn.straight}) infl:null (sin burn=${!kn.burnApplied}) sin aoe(${kn.noAoe}); gasta 1 carga(${kn.chargeSpent})+stam(${kn.stamSpent}); impacto ⇒ hitEnemy dmg(${kn.hitApplied}); cd bloquea re-lanzar(${kn.cdBlocks})`);
  else fail(`AC2 cuchillo broke: ${J(kn)}`);

  // ---------- [AC3 bomba] ----------
  const bmb = d.throwBombProbe();
  if (bmb && bmb.ok)
    pass(`AC3 bomba: kind:"firebomb" aoe>0(${bmb.hasAoe}) + infl:burn(${bmb.hasBurn}); impacto directo(${bmb.directHit}) ⇒ applyStatus(burn) DoT(${bmb.burnApplied}) + daño de ÁREA a 2º enemigo(${bmb.aoeHit}); más cara stam ${bmb.fbStam}>${bmb.knStam} + más escasa ${bmb.fbCh}<${bmb.knCh} cargas (pricier=${bmb.pricier})`);
  else fail(`AC3 bomba broke: ${J(bmb)}`);

  // ---------- [AC4 apuntado] ----------
  const aim = d.throwAimProbe();
  if (aim && aim.ok) pass(`AC4 apuntado: con lockTarget ⇒ ángulo hacia el objetivo (artTarget, ${aim.lockAng}rad, lockOk=${aim.lockOk}); sin lock ⇒ ángulo = h.facing (${aim.faceAng}rad, faceOk=${aim.faceOk})`);
  else fail(`AC4 apuntado broke: ${J(aim)}`);

  // ---------- [AC5 recurso] ----------
  const res = d.throwResourceProbe();
  if (res && res.ok)
    pass(`AC5 recurso: ${res.throws}/${res.cap} lanzamientos drenan a 0(${res.drained}); a 0 ⇒ deny(${res.emptyDenies}); MISMA zona ⇒ NO refill(${res.sameZoneNoRefill}); CAMBIO de zona ⇒ refill a tope(${res.zoneRefill}); bonfire ⇒ refill a tope(${res.bonfireRefill}) — recurso escaso, NO infinito`);
  else fail(`AC5 recurso broke: ${J(res)}`);

  // ---------- [AC6 coste estamina] ----------
  const st = d.throwStamProbe();
  if (st && st.ok) pass(`AC6 coste: vigor insuficiente ⇒ no lanza (denied=${st.denied}, 0 cargas); con vigor ⇒ dispara + gasta ${st.cost} stam (fired=${st.fired}, spent=${st.spent})`);
  else fail(`AC6 coste broke: ${J(st)}`);

  // ---------- [AC7 windup punible] ----------
  const wu = d.throwWindupProbe();
  if (wu && wu.ok) pass(`AC7 windup: tras lanzar throwWind>0(${wu.windOn}) BLOQUEA attack(${wu.atkBlocked}) + move(vx=${wu.vxWind}, blocked=${wu.moveBlocked}); expirado ⇒ move libre(vx=${wu.vxFree}) + attack libre(${wu.atkFree})`);
  else fail(`AC7 windup broke: ${J(wu)}`);

  // ---------- [AC9 SAVE] ----------
  const sb = d.throwSaveByteId();
  if (sb.ok)
    pass(`AC9 SAVE: h.throwSel/knifeCharges/bombCharges/throwCD/throwWind/throwZone transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave throw*/knifeCharges/bombCharges (hasKey=${sb.hasKey})`);
  else fail(`AC9 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC8 RNG-STRONG]: 48-draw fixed srand script (LANZANDO una bomba) — ON == OFF ----------
  const SEED = 0x1920c0de, N = 24;
  const rON = d.throwSrandProbe(true, SEED, N);
  const rOFF = d.throwSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC8 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around LANZAR la Bomba Incendiaria`);
  else fail(`AC8 RNG: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC8 RNG-STRONG (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el arrojadizo es spawn/geometría/timing (0 srand draws, no throwRng) aun lanzando`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.throwableFired) pass(`AC8 RNG-STRONG: el probe ON SÍ spawneó el proyectil (throwableFired) consumiendo 0 srand — ejercitó la ruta real`);
  else fail(`AC8 RNG: throwable did not fire on the ON probe: ${J({ throwableFired: rON.throwableFired })}`);
  const rON2 = d.throwSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC8 RNG-STRONG determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC8 RNG determinism broke`);

  // ---------- [AC10 REG]: existing srand probes stay ON==OFF (all 18 prior pillars) ----------
  // NB (gotcha zona-sensible, mirror cas1914/1911): Bonfire REUBICA al héroe; Weapon-Arts/Archetypes/Two-Handing/Equip-Load son
  // SENSIBLES A LA POSICIÓN (matan enemigos en zonas de alineación del loot) ⇒ se corren al FINAL con HÉROE PRÍSTINO recién recreado
  // en el pueblo. Los demás resetean su propio estado; Bonfire va el último del bucle común.
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
  // Weapon-Arts (18º pilar) — héroe PRÍSTINO en el pueblo (artSrandProbe mata skeletons en zona sensible).
  sim.createHero("VueloQA", "warrior");
  if (d.artSrandProbe) {
    const on = d.artSrandProbe(true, 0x1914c0de, 24), o = d.artSrandProbe(false, 0x1914c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Weapon-Arts srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Weapon-Arts srand regressed`);
  } else pass(`REG: Weapon-Arts srand probe absent — skipped`);
  // Weapon-Archetypes (17º pilar) — héroe PRÍSTINO en el pueblo.
  sim.createHero("VueloQA", "warrior");
  if (d.archSrandProbe) {
    const on = d.archSrandProbe(true, 0x1907c0de, 24), o = d.archSrandProbe(false, 0x1907c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Weapon-Archetypes srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Weapon-Archetypes srand regressed`);
  } else pass(`REG: Weapon-Archetypes srand probe absent — skipped`);
  // Two-Handing (15º pilar) — héroe PRÍSTINO en el pueblo.
  sim.createHero("VueloQA", "warrior");
  if (d.twoHandSrandProbe) {
    const on = d.twoHandSrandProbe(true, 0x1895c0de, 24), o = d.twoHandSrandProbe(false, 0x1895c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: Two-Handing srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: Two-Handing srand regressed`);
  } else pass(`REG: Two-Handing srand probe absent — skipped`);
  // EquipLoad (14º pilar) — héroe PRÍSTINO en el pueblo.
  sim.createHero("VueloQA", "warrior");
  if (d.equipSrandProbe) {
    const on = d.equipSrandProbe(true, 0x1889c0de, 24), o = d.equipSrandProbe(false, 0x1889c0de, 24);
    if (J(on.fingerprint) === J(o.fingerprint)) { regN++; pass(`REG: EquipLoad srand still BYTE-IDENTICAL ON vs OFF (héroe pueblo)`); }
    else fail(`REG: EquipLoad srand regressed`);
  } else pass(`REG: EquipLoad srand probe absent — skipped`);
  pass(`AC10 REG: ${regN} sistemas srand ON==OFF (18 pilares previos: Frenzy…Hyperarmor + Weapon-Arts + Weapon-Archetypes + Two-Handing + Equip Load)`);

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
}

log(ok ? "\n✅ CAS-1922 throwables (Consumibles Arrojadizos) harness: ALL PASS" : "\n❌ CAS-1922 throwables (Consumibles Arrojadizos) harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
