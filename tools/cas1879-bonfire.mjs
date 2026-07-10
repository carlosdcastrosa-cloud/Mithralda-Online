// ---------------------------------------------------------------------------
// CAS-1881 (build for CAS-1879) — HOGUERA / REST SITE (Bonfire, knob BONFIRE). 13ª feature Souls-like y el CAPSTONE
// que UNIFICA Estus (CAS-1854), Mancha de Sangre / corpse-run (CAS-1867) y el checkpoint/respawn existente.
//
// Decisión de arquitectura: la FUENTE ya cura HP/MP/stam + fija h.respawn. La Hoguera EXTIENDE esa rama de interact()
// gateada por BONFIRE.enabled ⇒ recarga Estus (reusa FLASK.charges), fija el ancla (ya lo hace la fuente) y REPUEBLA
// los no-jefes de la zona de forma DETERMINISTA (grid por índice, tipo por índice, applyZoneScale = aritmética pura).
// Sólo utilizable en SEGURIDAD: un no-jefe en aggro dentro de safeRadius deniega el descanso (toast unsafe + sfx.deny).
// PROHIBIDO rr()/ri()/srand()/maybeAffix en la ruta de descanso ⇒ srand BYTE-IDÉNTICO ON==OFF (0 draws, no bonfireRng).
// $0 arte (llama/glow procedural canvas). El ancla reusa h.respawn (ya en save.v1) ⇒ save.v1 byte-id, sin clave nueva.
// HARD-GATED: enabled:false ⇒ la rama de fuente queda intacta (heal + ancla) ⇒ byte-idéntico a HEAD.
//
// DOM-free harness: importa sim/sim.js directo (sin navegador) y ejercita los REALES dev.bonfire* hooks, que corren la
// REAL rama de descanso de interact() (heal + recarga Estus + world reset) + los helpers bonfireUnsafe/bonfireRespawn.
// La QA live (hija) re-verifica el descanso (KeyE en fuente), la llama, el reset y el gate sobre el build servido.
//
// Prueba (AC1-8 del spec design/cas1879-bonfire-rest-site.md):
//   [AC1 cura+recarga] descanso en sitio SEGURO ⇒ HP/MP/stam a tope Y h.flaskCharges==FLASK.charges (recarga Estus).
//   [AC2 ancla]        el descanso fija h.respawn al sitio (consumido por corpse-run CAS-1867 y respawn de muerte).
//   [AC3 world reset]  el descanso REEMPLAZA los no-jefes de la zona (repuebla); el JEFE NO revuelve (isBoss excluido).
//   [AC4 gate segur.]  no-jefe en aggro dentro de safeRadius ⇒ descanso DENEGADO (no cura/recarga/reset); fuera/idle/jefe ⇒ seguro.
//   [AC5 RNG-STRONG]   srand fijo (48-draw) alrededor del descanso+reset REAL ⇒ BYTE-IDÉNTICO ON vs OFF, 0 draws (no bonfireRng).
//   [AC6 OFF byte-id]  BONFIRE.enabled=false ⇒ la fuente SIGUE curando+fijando ancla pero NO recarga Estus ni repuebla ⇒ HEAD.
//   [AC7 SAVE]         el ancla reusa h.respawn ⇒ save.v1 byte-id ON/OFF, sin clave bonfire*.
//   [REG]              frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on/flask/bloodstain/shield srand ON==OFF (13 sistemas).
//
// CAS-1886 PLACEMENT RETUNE (repop live observable): BONFIRE.sites coloca hogueras STANDALONE en zonas de caza pobladas
// (las 2 fountains viven en `field` sin spawner ⇒ bonfireRespawn DORMIDO live). P1 sites resueltos+forest+zoneOf match ·
// P2 descanso por proximidad al site ⇒ repop>0 (JEFE intacto) · P3 safe-gate en site · P4 OFF byte-id · P5 determinismo.
//
// Run: node tools/cas1879-bonfire.mjs
// ---------------------------------------------------------------------------
import * as sim from "../sim/sim.js";
import { BONFIRE, FLASK } from "../sim/config.js";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const J = (v) => JSON.stringify(v);
const d = sim.dev;

// audio/view are deep no-op proxies (rest → audio.sfx.heal, deny → audio.sfx.deny); io unused (probes drive interact directly).
const noop = () => {};
const deep = new Proxy(noop, { get: () => deep, apply: () => undefined });
const io = { moveVec: () => [0, 0], aim: noop, aimActive: false, blockHeld: false, isTouch: false, pollPad: noop };
sim.configure({ io, audio: deep, view: deep });

try {
  // NB: hero name has NO "bonfire" substring ⇒ the AC7 save-key regex can't false-match (mirror gotcha GuardiaQA/GraveQA/EstusQA).
  sim.createHero("HogueraQA", "warrior");

  // ---------- content sanity: the knob ----------
  const meta = d.bonfireMeta();
  if (meta.enabled && meta.key && meta.safeRadius > 0 && meta.glowColor)
    pass(`content: BONFIRE knob present (key=${meta.key} | healFull=${meta.healFull} | refillFlasks=${meta.refillFlasks} | respawnEnemies=${meta.respawnEnemies} | setCheckpoint=${meta.setCheckpoint} | safeRadius=${meta.safeRadius} | glow=${meta.glowColor})`);
  else fail(`content wrong: ${J(meta)}`);

  // ---------- [AC1 cura+recarga] + [AC2 ancla] + [AC3 world reset] ----------
  const rp = d.bonfireRestProbe();
  if (rp && rp.ok)
    pass(`AC1/2/3 rest: descanso seguro (zona=${rp.zone}) ⇒ cura a tope (${rp.healed}) + recarga Estus a FLASK.charges (${rp.refilled}) + ancla h.respawn fijada al sitio (${rp.anchored}); world reset ⇒ no-jefes viejos reemplazados (${rp.oldGone}) + repoblados (${rp.repop}), JEFE intacto NO revuelve (${rp.bossAlive})`);
  else fail(`AC1/2/3 rest wrong: ${J(rp)}`);

  // ---------- [AC4 gate de seguridad] ----------
  const sg = d.bonfireSafeGateProbe();
  if (sg && sg.ok)
    pass(`AC4 safe-gate: no-jefe en aggro dentro de safeRadius ⇒ unsafe (${sg.unsafeNear}); fuera de radio ⇒ seguro (${sg.safeFar}); idle/no-aggro ⇒ seguro (${sg.safeIdle}); JEFE en aggro NO bloquea ⇒ seguro (${sg.safeBoss}); interact() con enemigo unsafe ⇒ DENEGADO sin curar/recargar/anclar (${sg.denied})`);
  else fail(`AC4 safe-gate wrong: ${J(sg)}`);

  // ---------- [AC6 OFF byte-id] ----------
  const off = d.bonfireOffProbe();
  if (off && off.ok)
    pass(`AC6 OFF: BONFIRE.enabled=false ⇒ la fuente SIGUE curando (${off.healed}) + fijando ancla (${off.anchored}) pero NO recarga Estus (${off.noRefill}) ni repuebla no-jefes (${off.noReset}) — byte-identical a HEAD`);
  else fail(`AC6 OFF not inert: ${J(off)}`);

  // ---------- [AC7 SAVE]: ancla transitoria, save.v1 byte-id, no key ----------
  const sb = d.bonfireSaveByteId();
  if (sb.ok)
    pass(`AC7 SAVE: el ancla reusa h.respawn (ya en save.v1) ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave bonfire* (hasKey=${sb.hasKey})`);
  else fail(`AC7 SAVE byte-id broke: ${J({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---------- [AC5 RNG-STRONG]: 48-draw fixed srand script (rest+reset FIRING) — ON == OFF ----------
  const SEED = 0x1879c0de, N = 24;
  const rON = d.bonfireSrandProbe(true, SEED, N);
  const rOFF = d.bonfireSrandProbe(false, SEED, N);
  if (rON.fingerprint.length === 48) pass(`AC5 RNG-STRONG: fixed script draws ${rON.fingerprint.length} srand values (2×${N}) around a REAL descanso + world reset`);
  else fail(`AC5: expected 48 draws, got ${rON.fingerprint.length}`);
  if (J(rON.fingerprint) === J(rOFF.fingerprint))
    pass(`AC5 (ON==OFF): srand stream BYTE-IDENTICAL ON vs OFF — el descanso/reset es geometría + spawnEnemy/applyZoneScale (0 srand draws, no bonfireRng) incluso cuando repuebla`);
  else fail(`srand diverged ON vs OFF — on=${J(rON.fingerprint).slice(0, 70)} off=${J(rOFF.fingerprint).slice(0, 70)}`);
  if (rON.bonfireFired)
    pass(`AC5: el probe ON SÍ descansó (repobló no-jefes + recargó Estus), consumiendo 0 srand — ejercitó la ruta real (interact()→bonfireRespawn)`);
  else fail(`AC5 bonfire did not fire on the ON probe: ${J({ bonfireFired: rON.bonfireFired })}`);
  const rON2 = d.bonfireSrandProbe(true, SEED, N);
  if (J(rON.fingerprint) === J(rON2.fingerprint)) pass(`AC5 determinism: same seed reproduces the same srand stream — Stage-2 ready`);
  else fail(`AC5 determinism broke`);

  // ==================== CAS-1886 PLACEMENT: BONFIRE.sites en zonas de caza (repop live observable) ====================
  // La mecánica HEADLINE (bonfireRespawn) quedaba DORMIDA live: las 2 fountains viven en `field` (0 spawners ⇒ repop=0).
  // BONFIRE.sites coloca hogueras STANDALONE en zonas POBLADAS ⇒ zoneOf(site)=zona con spawners ⇒ repop>0 observable.
  //   [P1 sites]     ≥1 site resuelto, forest presente, TODOS con zoneOf(site)===zona objetivo (guard descarta `field`).
  //   [P2 repop>0]   descanso por PROXIMIDAD a un site (sin fountain) ⇒ heal+Estus+ancla+world reset repuebla; JEFE intacto.
  //   [P3 safe-gate] no-jefe en aggro dentro de safeRadius del site ⇒ DENEGADO; fuera ⇒ permite.
  //   [P4 OFF]       BONFIRE.enabled=false ⇒ site no detectado ⇒ héroe sobre el site NO cura/reset ⇒ byte-idéntico a HEAD.
  //   [P5 determin.] dos world-builds misma semilla ⇒ mismos site.x/site.y (resolución = función pura del build).
  const info = d.bonfireSitesInfo();
  if (info.count >= 1 && info.hasForest && info.allMatch)
    pass(`P1 sites: ${info.count} hoguera(s) resueltas en zonas pobladas [${info.zones.join(",")}] — forest presente (${info.hasForest}), TODAS con zoneOf(site)===zona (${info.allMatch})`);
  else fail(`P1 sites wrong: ${J(info)}`);

  for (const zn of ["forest", "caves", "abyss"]) {
    if (!info.zones.includes(zn)) { pass(`P2 repop[${zn}]: zona ausente en este build — skipped`); continue; }
    const sp = d.bonfireSiteRestProbe(zn);
    if (sp && sp.ok)
      pass(`P2 repop[${zn}]: descanso por proximidad al site (zona=${sp.zone}) ⇒ cura (${sp.healed})+Estus (${sp.refilled})+ancla (${sp.anchored}); world reset ⇒ viejo reemplazado (${sp.oldGone}) + REPOBLADO repop=${sp.repop}>0, JEFE intacto (${sp.bossAlive})`);
    else fail(`P2 repop[${zn}] wrong: ${J(sp)}`);
  }

  const sgs = d.bonfireSiteSafeGateProbe("forest");
  if (sgs && sgs.ok)
    pass(`P3 safe-gate en site: no-jefe en aggro dentro de safeRadius ⇒ DENEGADO (${sgs.denied}); tras alejarlo ⇒ el descanso procede (${sgs.allowed})`);
  else fail(`P3 safe-gate en site wrong: ${J(sgs)}`);

  const offS = d.bonfireSiteOffProbe("forest");
  if (offS && offS.ok)
    pass(`P4 OFF placement: BONFIRE.enabled=false ⇒ el site NO se detecta ⇒ héroe sobre el site NO cura/recarga/resetea (inert=${offS.inert}) — byte-idéntico a HEAD`);
  else fail(`P4 OFF placement not inert: ${J(offS)}`);

  const det = d.bonfireSitesDeterministic();
  if (det.same)
    pass(`P5 determinismo: dos world-builds con la MISMA semilla ⇒ site.x/site.y idénticos (${det.a.length} sites) — Stage-2 ready`);
  else fail(`P5 determinism broke — a=${J(det.a).slice(0,90)} b=${J(det.b).slice(0,90)}`);

  // ---------- [REG]: existing srand probes stay ON==OFF (all 13 prior systems / pillars) ----------
  // Reset a un baseline LIMPIO de pueblo antes de la regresión: las probes de descanso dejan al héroe en el CENTRO de
  // un spawner de ZONA DE CAZA (p.ej. forest), y killEnemy dibuja RNG de loot CONDICIONAL a la zona ⇒ la probe de
  // Frenzy (que mata 6 esqueletos en la posición del héroe) divergiría por la ZONA, no por un cambio real en Frenzy.
  // Recrear el héroe lo devuelve al pueblo (mismo estado implícito que ven las regresiones en los harness previos).
  sim.createHero("HogueraQA", "warrior");
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

log(ok ? "\n✅ CAS-1881/1886 bonfire (Hoguera/Rest Site + placement en zonas de caza) harness: ALL PASS" : "\n❌ CAS-1881/1886 bonfire harness: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
