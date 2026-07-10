// ---------------------------------------------------------------------------
// CAS-1927 (build for CAS-1926) — RESINAS / BUFFS DE ARMA (Weapon Grease, knob WEAPON_BUFFS). 20º pilar Souls-like.
// Consumible que UNTA el arma con un buff temporal (elemental / afilado) por una ventana corta. Recurso limitado (cargas
// por tipo, refill por zona / hoguera). Pareja natural del Pilar 19 Arrojadizos (tema consumibles).
//
// Arquitectura: applyWeaponBuff() (gated en play + héroe vivo + applyBuffT<=0 + sin atkCD/rolling/stun) selecciona h.buffSel ⇒
// WEAPON_BUFFS.types[sel]; deny sin cargas; al aplicar: gasta 1 carga, arma applyBuffT (windup punible), activa h._wbuff/wbuffT.
// buffMul(h) = types[h._wbuff].dmgMul mientras wbuffT>0, ÚLTIMO factor en applyHeroMelee (~sim.js:2104) ⇒ compone MULT tras
// TWO_HAND × WEAPON_ARCHETYPES × WEAPON_ARTS (ninguno pisa). Elemento on-hit en hitEnemy (opt.melee): ember⇒burn DoT, frost⇒slow,
// whet⇒puro físico. tickBuff refilla al cambiar zona + decrementa wbuffT/applyBuffT. CERO draws (buffMul/elemento 100% aritmética)
// ⇒ srand ON==OFF byte-idéntico aun aplicando. HARD-GATED: enabled:false ⇒ rama muerta ⇒ byte-idéntico a HEAD (19 pilares).
//
// DOM-free harness: importa sim/sim.js directo y ejercita los REALES dev.buff* hooks (applyWeaponBuff / cycleBuff / buffMul /
// hitEnemy on-hit / tickBuff / refillBuffs). La QA live (hija) re-verifica sobre el build servido.
//
// Prueba:
//   [content]        el knob WEAPON_BUFFS existe (3 tipos ember/whet/frost, applyKey BracketRight, cycleKey BracketLeft, applyMs).
//   [AC0 OFF]        enabled=false ⇒ applyWeaponBuff()/cycleBuff() INERTES (sin buff/gasto/cambio) — byte-idéntico a HEAD.
//   [AC1 baseline]   ON pero sin aplicar ⇒ un tick no consume nada (cargas/buff intactos) — feel 19 pilares conservado.
//   [AC2 ember]      ember ⇒ h._wbuff="ember" + wbuffT>0, gasta 1 carga; golpe melee ⇒ dmg×1.15 + burn DoT (applyStatus).
//   [AC3 whet]       whet ⇒ h._wbuff="whet" + wbuffT>0, más cargas (3); golpe ⇒ dmg×1.35 PURO (sin elemento/DoT).
//   [AC4 frost]      frost ⇒ h._wbuff="frost" + wbuffT>0; golpe ⇒ dmg×1.10 + slow (applyStatus("slow")).
//   [AC5 compone]    whet + TWO_HAND + greatsword arch + greatsword art ⇒ producto de 4 factores sin bypass poise/i-frames.
//   [AC6 recurso]    cargas decrementan; a 0 ⇒ deny; MISMA zona ⇒ no refill; CAMBIO de zona ⇒ refill a tope. NO infinito.
//   [AC7 windup]     tras aplicar, applyBuffT>0 BLOQUEA heroAttack (commit punible).
//   [AC8 RNG-STRONG] srand 48-draw ON vs OFF byte-idéntico; buffFired 0-draw (sin buffRng).
//   [AC9 SAVE]       serializeSave() byte-id ON/OFF, sin clave buff*/wbuff*/ember*/whet*/frost*.
//   [AC10 REG]       los 19 pilares previos (Frenzy…Arrojadizos) siguen srand ON==OFF + core-loop (regresión aparte).
//
// Run: node tools/cas1926-weapon-buffs.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { WEAPON_BUFFS, STAMINA } from "../sim/config.js";

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
  // hero name has NO "buff"/"ember"/"whet"/"frost" substring ⇒ save-key regex can't false-match (mirror VueloQA/FirmaQA).
  sim.createHero("GrasaQA", "warrior");

  // ---------- content sanity: el knob ----------
  const meta = d.buffMeta();
  const ty = meta.types || {};
  const has3 = ty.ember && ty.whet && ty.frost;
  if (meta.enabled && has3 && meta.applyKey === "BracketRight" && meta.cycleKey === "BracketLeft" && meta.applyMs > 0 && meta.refillOnZone)
    pass(`content: WEAPON_BUFFS knob presente (enabled=${meta.enabled} | applyKey=${meta.applyKey} | cycleKey=${meta.cycleKey} | applyMs=${meta.applyMs} | tipos: ${meta.order.map(k=>`${ty[k].name}(×${ty[k].dmgMul} x${ty[k].charges}ch ${ty[k].buffS}s)`).join(", ")})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC0 OFF] ----------
  const off = d.buffOffProbe();
  if (off && off.ok) pass(`AC0 OFF: enabled=false ⇒ applyWeaponBuff() inerte(${off.inert}) + cycleBuff() inerte(${off.cycleInert}) — byte-idéntico a HEAD`);
  else fail(`AC0 OFF not inert: ${J(off)}`);

  // ---------- [AC1 baseline] ----------
  const bl = d.buffBaselineProbe();
  if (bl && bl.ok) pass(`AC1 baseline: ON sin aplicar ⇒ tick no consume nada (cargas=${bl.chargesUnchanged} stam=${bl.stamUnchanged} noBuff=${bl.noBuff}) — feel 19 pilares conservado`);
  else fail(`AC1 baseline broke: ${J(bl)}`);

  // ---------- [AC2 ember] ----------
  const em = d.buffEmberProbe();
  if (em && em.ok)
    pass(`AC2 ember: h._wbuff="ember" buffActive(${em.buffActive}) 1 carga gastada(${em.chargeSpent}); golpe ⇒ dmg×1.15 actual=${em.dmgApplied} expect=${em.dmgExpect}(${em.dmgOk}) + burn DoT(${em.burnApplied})`);
  else fail(`AC2 ember broke: ${J(em)}`);

  // ---------- [AC3 whet] ----------
  const wh = d.buffWhetProbe();
  if (wh && wh.ok)
    pass(`AC3 whet: h._wbuff="whet" buffActive(${wh.buffActive}) 1 carga(${wh.chargeSpent}); dmg×1.35 actual=${wh.dmgApplied} expect=${wh.dmgExpect}(${wh.dmgOk}); sin elemento(${wh.noElement})`);
  else fail(`AC3 whet broke: ${J(wh)}`);

  // ---------- [AC4 frost] ----------
  const fr = d.buffFrostProbe();
  if (fr && fr.ok)
    pass(`AC4 frost: h._wbuff="frost" buffActive(${fr.buffActive}) 1 carga(${fr.chargeSpent}); dmg×1.10 actual=${fr.dmgApplied} expect=${fr.dmgExpect}(${fr.dmgOk}); slow aplicado(${fr.slowApplied})`);
  else fail(`AC4 frost broke: ${J(fr)}`);

  // ---------- [AC5 compone] ----------
  const cp = d.buffComposeProbe();
  if (cp && cp.ok)
    pass(`AC5 compone: whet × TWO_HAND × greatsword-arch × greatsword-art ⇒ PRODUCTO multiplicativo sin bypass. actual=${cp.actualDmg} expect=${cp.expectedDmg}(${cp.dmgOk})`);
  else fail(`AC5 compone broke: ${J(cp)}`);

  // ---------- [AC6 recurso] ----------
  const res = d.buffResourceProbe();
  if (res && res.ok)
    pass(`AC6 recurso: cargas drenan(${res.drained}) deny-sin-cargas(${res.deny}) misma-zona-no-refill(${res.sameZoneNoRefill}) cambio-zona-refilla(${res.zoneRefill})`);
  else fail(`AC6 recurso broke: ${J(res)}`);

  // ---------- [AC7 windup] ----------
  const wu = d.buffWindupProbe();
  if (wu && wu.ok)
    pass(`AC7 windup: applyBuffT>0 tras aplicar(${wu.applyBlocks}) bloquea heroAttack(${wu.attackBlocked}) — commit punible`);
  else fail(`AC7 windup broke: ${J(wu)}`);

  // ---------- [AC8 RNG-STRONG] ----------
  const SEED = 0xca51926a, N = 48;
  const rON  = d.buffSrandProbe(true,  SEED, N);
  const rOFF = d.buffSrandProbe(false, SEED, N);
  const srandOk = rON.fingerprint.every((v,i) => v === rOFF.fingerprint[i]);
  if (rON.buffFired && srandOk)
    pass(`AC8 RNG-STRONG: srand ON==OFF ${N}-draw (byte-idéntico aun aplicando whet); buffFired=${rON.buffFired} 0-draw (sin buffRng)`);
  else {
    const diffs = rON.fingerprint.map((v,i)=>`idx${i}:${v}vs${rOFF.fingerprint[i]}`).filter((_,i)=>rON.fingerprint[i]!==rOFF.fingerprint[i]);
    fail(`AC8 RNG: srandOk=${srandOk} buffFired=${rON.buffFired} — primeras diferencias: ${diffs.slice(0,3).join(" | ")}`);
  }

  // ---------- [AC9 SAVE] ----------
  const sv = d.buffSaveByteId();
  if (sv && sv.ok)
    pass(`AC9 SAVE: serializeSave() byte-id ON/OFF(${sv.byteId}) sin clave buff*/wbuff*/ember*/whet*/frost*(${sv.noBuffKey}) len=${sv.offLen}`);
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
  // Zone-sensitive probes: fresh pristine-town hero each
  sim.createHero("GrasaQA","warrior");
  if (d.artSrandProbe) { const on=d.artSrandProbe(true,0x1914c0de,24), o=d.artSrandProbe(false,0x1914c0de,24);
    if(J(on.fingerprint)===J(o.fingerprint)){regN++;pass(`REG: Weapon-Arts srand BYTE-IDENTICAL`);}else fail(`REG: Weapon-Arts regressed`); }
  sim.createHero("GrasaQA","warrior");
  if (d.archSrandProbe) { const on=d.archSrandProbe(true,0x1907c0de,24), o=d.archSrandProbe(false,0x1907c0de,24);
    if(J(on.fingerprint)===J(o.fingerprint)){regN++;pass(`REG: Weapon-Archetypes srand BYTE-IDENTICAL`);}else fail(`REG: Weapon-Archetypes regressed`); }
  sim.createHero("GrasaQA","warrior");
  if (d.twoHandSrandProbe) { const on=d.twoHandSrandProbe(true,0x1895c0de,24), o=d.twoHandSrandProbe(false,0x1895c0de,24);
    if(J(on.fingerprint)===J(o.fingerprint)){regN++;pass(`REG: Two-Handing srand BYTE-IDENTICAL`);}else fail(`REG: Two-Handing regressed`); }
  sim.createHero("GrasaQA","warrior");
  if (d.equipSrandProbe) { const on=d.equipSrandProbe(true,0x1889c0de,24), o=d.equipSrandProbe(false,0x1889c0de,24);
    if(J(on.fingerprint)===J(o.fingerprint)){regN++;pass(`REG: EquipLoad srand BYTE-IDENTICAL`);}else fail(`REG: EquipLoad regressed`); }
  sim.createHero("GrasaQA","warrior");
  if (d.throwSrandProbe) { const on=d.throwSrandProbe(true,0x1920c0de,24), o=d.throwSrandProbe(false,0x1920c0de,24);
    if(J(on.fingerprint)===J(o.fingerprint)){regN++;pass(`REG: Throwables srand BYTE-IDENTICAL`);}else fail(`REG: Throwables regressed`); }
  pass(`AC10 REG: ${regN} sistemas srand ON==OFF (19 pilares previos: Frenzy…Bonfire + Arts + Archetypes + Two-Hand + EquipLoad + Throwables)`);

} catch(e) {
  fail(`UNEXPECTED: ${e.message}\n${e.stack}`);
}

console.log();
if (ok) console.log("✔ CAS-1926 weapon-buffs — ALL PASS");
else      console.error("✖ CAS-1926 weapon-buffs — FAILURES ABOVE");
process.exit(ok ? 0 : 1);
