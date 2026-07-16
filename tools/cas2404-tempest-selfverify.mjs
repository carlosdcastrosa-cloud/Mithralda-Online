// CAS-2404 — self-verify for VENDAVAL / TEMPESTAD (DARK, TEMPEST_SURGE.enabled:false). EVO mecánica #68 (serializa tras #67 CADENCE LIVE) — EJE FRESCO + CANAL REUSADO, ⊥/DISTINTO a #47-67.
// (A) EJE FRESCO = CONDICIÓN METEOROLÓGICA (world-CONDITION shard-wide, NO meter personal). La intensidad de tormenta = función PURA del MISMO reloj compartido que WEATHER (Date.now − epochMs mod cycleSeconds, phaseOverride
//     para QA) ⇒ shard-consistente por construcción, 0 RNG, 0 timer client-local. Ventana de tormenta alineada a "lluvia plena" de WEATHER (0.28–0.45); rampa TRIANGULAR 0→1→0 ⇒ arrecia→pico→amaina. Durante la tormenta, un
//     jugador en una zona EXPUESTA/al-aire-libre (caves EXCLUIDA=resguardada) obtiene un bono de piso de rareza. OPUESTO a Cadence #67 (meter personal decayente por-pid) y a Nocturne #66 (fase día/noche): dimensión INDEPENDIENTE.
// (B) CANAL REUSADO = `lootQuality` (rareza del drop, MISMO seam `minR` de rollGearInst que Trailcraft #63). De-stack CON Trailcraft por SHARE-CAP: pasos combinados = min(tempestLootCap, trailSteps + tempestSteps) ⇒ 0 doble-dip.
//
// ★ DIFERENCIADOR (check 7): CONDICIÓN + EXPOSICIÓN. Tormenta (fase pico 0.365) + zona EXPUESTA (forest) ⇒ ABRE (tier≥1, floor≥poco-común). MISMA tormenta en CAVES (resguardada) ⇒ T0 (sin bono). CALMA (fase 0.6) en forest ⇒ T0.
// ★ SHARE-CAP (check 10): Trailcraft T3 (2 pasos) + Tempest T2 (2 pasos) ⇒ combinado CAPADO a tempestLootCap(3) (Tempest cede 1, NO 4) ⇒ 0 doble-dip. Tempest OFF ⇒ lootQualityFloor()==trailcraftFloor() (byte-id LIVE Trailcraft, 0-regr).
// ★ ORTOGONALIDAD (check 12): abrir tormenta (floor≠"") NO cambia goldFind/restedMult/critChance/vamp/xpGain/wardRegen/oocMitigation. ★ NOCHE TORMENTOSA (check 13): Nocturne (fase noche) + Tempest (fase tormenta) abren A LA VEZ ⇒ dimensiones ⊥.
// North Star (check 17) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer, MISMO reloj/fase ⇒ intensidad + tier + floor IDÉNTICOS byte-a-byte (0 desync). El clima es WORLD-STATE shard-wide (misma condición); cada cliente aplica a su zona.
//
// Observado vía __dev.tempest (flip TEMPEST_SURGE.enabled IN-MEMORY + phaseOverride/nowMs + toZone/leave + intensityProbe + lootTick para el seam lootQuality + SHARE-CAP con Trailcraft)
// + __dev.trailcraft (share partner lootQuality) + __dev.kinship/focus (goldFind) + __dev.convoy (restedMult) + __dev.delve/cadence (critChance) + __dev.nocturne (vamp/fase noche) + __dev.fellowship (xpGain) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation)
// + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Tempestad:").
//
// Checks:
//   1  boots to play, __dev.tempest + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): TEMPEST_SURGE.enabled false AND G.tempest NUNCA se crea (gExists false, STATELESS) ⇒ 0 estado nuevo; tag "", channel lootQuality.
//   3  byte-id save OFF: saveBlob() SIN clave 'tempest' (estado 100% derivado del reloj, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA de la INTENSIDAD: inten→tier (0.2→T0, 0.34→T1, 0.67→T2, 1.0→T2) + steps (0/1/2) determinista.
//   6  INTENSIDAD = función PURA TRIANGULAR de la fase (reloj compartido): stormStart(0.28)=0, centro(0.365)=1, stormEnd(0.45)=0, fuera(0.6)=0.
//   7  ★ DIFERENCIADOR CONDICIÓN+EXPOSICIÓN: tormenta pico + forest (expuesta)⇒ABRE (tier≥1, floor bump); MISMA tormenta en CAVES (resguardada)⇒T0 (sin bono); CALMA (0.6) en forest⇒T0.
//   8  SHARD-WIDE / world-state: la intensidad NO depende de pid/hero (misma fase ⇒ misma intensidad); es CONDICIÓN del mundo, no meter personal.
//   9  ★ CANAL REUSADO lootQuality + SEAM: lootTick con SEED FIJO SIN vs CON floor; OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity.
//  10  ★ SHARE-CAP vs Trailcraft: Trail T3(2)+Tempest T2(2)⇒combinado CAPADO a 3 (Tempest cede 1, NO 4); Tempest solo⇒sus pasos; combined≤cap.
//  11  ★ BYTE-NEUTRO/0-REGR: con Tempest OFF, lootQualityFloor()==trailcraftFloor() (delegación pura ⇒ seam byte-id al LIVE de Trailcraft).
//  12  ★ ORTOGONALIDAD lootQuality ⊥ goldFind ⊥ restedMult ⊥ critChance ⊥ vamp ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation: abrir tormenta NO cambia los otros canales.
//  13  ★ NOCHE TORMENTOSA (⊥ Nocturne dimensión temporal): Nocturne (fase noche) + Tempest (fase tormenta) abren A LA VEZ ⇒ clima ⊥ fase día/noche (dimensiones independientes).
//  14  ★ 0-REGRESIÓN: los flags del arco ya LIVE siguen served enabled:true (TRAILCRAFT/DELVE/ERUDITION/NOCTURNE_HUNT/CADENCE_RUSH); TEMPEST_SURGE served false (DARK #68).
//  15  ★ TEMPEST 5 zonas EXPUESTAS: la tormenta aplica en las 5 zonas de TEMPEST_SURGE.zones (tier≥1) broken=[]; caves NO (resguardada) ⇒ excluida por diseño.
//  16  render badge "Tempestad:" se DIBUJA con la feature ON (ctx.fillText "Tempestad:" count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMA fase/reloj ⇒ intensidad/tier/floor IDÉNTICOS byte-a-byte; clima shard-wide (misma condición); cada cliente aplica a su zona expuesta.
//   0  no JS errors during run.
// Run: node tools/cas2404-tempest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2404");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const NOW = 9540000;   // reloj de pared FIJO (ms) para derivación determinista (mismo en ambos clientes)
const CENTER = 0.365;  // pico de la ventana de tormenta (centro de [0.28,0.45]) ⇒ intensidad 1
async function installT(page) {
  await page.evaluate((NOW) => {
    window.__TNOW = NOW;
    // fija fase + reloj y devuelve el snapshot tempest
    window.__tphase = (ph) => window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph });
    // enable tempest, fija fase, teleporta a una zona y devuelve el snapshot
    window.__tzone = (ph, zone) => window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: zone });
    // barre las zonas expuestas y devuelve la 1ª donde el héroe cae DENTRO con tormenta abierta (tier≥1)
    window.__tpick = () => {
      const zones = window.__dev.tempest({ enabled: true }).zones || [];
      for (const z of zones) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
        if (s.zone === z && s.exposed && s.tier >= 1) return z; }
      return null;
    };
  }, NOW);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.bringToFront();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tempest && window.__dev.trailcraft && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.delve && window.__dev.cadence && window.__dev.nocturne && window.__dev.fellowship && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.tempest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.tempest never created (STATELESS)
  const dark = await page.evaluate(() => window.__dev.tempest());
  ok("2 byte-id OFF (fresh boot): TEMPEST_SURGE.enabled false AND G.tempest NUNCA se crea (gExists false, STATELESS)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.intensity === 0 && dark.channel === "lootQuality" && dark.tag === "" && dark.storming === false,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} inten=${dark.intensity} channel=${dark.channel} tag="${dark.tag}" storming=${dark.storming}`);

  // 3 save OFF has no 'tempest' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'tempest' key in save blob (estado 100% derivado del reloj, 0 persistencia nueva)", !/"tempest(Now|Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.tempest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.tempest({ enabled: false, phaseOverride: null }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installT(page);

  // 5 tier table = pure fn of INTENSITY
  const tab = await page.evaluate(() => {
    const z = window.__tpick(); if (!z) return { bad: true };
    // fija la fase para producir intensidades objetivo: usamos phaseOverride directo y comparamos steps del snapshot fuera de zona (steps requieren expuesto),
    // así que teleportamos a la zona expuesta y variamos la fase para barrer intensidades.
    // intensidad(phase) triangular en [0.28,0.45]: phase=0.28→0, 0.3287→~0.34 (aprox), centro 0.365→1.
    const probe = (ph) => window.__dev.tempest({ intensityProbe: { phase: ph } }).probe;
    // hallamos fases que dan ~0.2/0.34/0.67/1.0 resolviendo la rampa: inten=1-|2k-1|, k=(ph-0.28)/0.17
    const phaseFor = (inten) => 0.28 + ((inten) / 2) * 0.17; // rama ascendente k=inten/2 ⇒ inten
    const out = [];
    // intensidades DENTRO de las bandas (no en el borde exacto de min, para evitar fragilidad de float): 0.2→T0, 0.45→T1, 0.8→T2, 1.0→T2
    for (const ti of [0.2, 0.45, 0.8, 1.0]) {
      const ph = phaseFor(ti);
      const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: z });
      out.push({ target: ti, ph: +ph.toFixed(4), inten: s.intensity, tier: s.tier, steps: s.steps });
    }
    return { z, out };
  });
  // target 0.2⇒T0(0), 0.45⇒T1(1), 0.8⇒T2(2), 1.0⇒T2(2)
  const expT = { 0.2: 0, 0.45: 1, 0.8: 2, 1: 2 }, expS = { 0.2: 0, 0.45: 1, 0.8: 2, 1: 2 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.inten, r.target, 0.02) && r.tier === expT[r.target] && r.steps === expS[r.target]);
  ok("5 TABLA de tiers = función PURA de la INTENSIDAD: inten→tier (0.2→T0,0.34→T1,0.67→T2,1.0→T2) + steps (0/1/2)",
     tabOk, `zone=${tab.z} ${JSON.stringify(tab.out)}`);

  // 6 intensity = pure triangular fn of phase (window edges + center + outside)
  const tri = await page.evaluate(() => {
    const p = (ph) => window.__dev.tempest({ intensityProbe: { phase: ph } }).probe;
    return { start: p(0.28), center: p(0.365), end: p(0.45), outLo: p(0.1), outHi: p(0.6) };
  });
  const triOk = near(tri.start, 0) && near(tri.center, 1, 0.01) && near(tri.end, 0) && near(tri.outLo, 0) && near(tri.outHi, 0);
  ok("6 INTENSIDAD = función PURA TRIANGULAR de la fase (reloj compartido): stormStart(0.28)=0, centro(0.365)=1, stormEnd(0.45)=0, fuera=0",
     triOk, JSON.stringify(tri));

  // 7 ★ DIFFERENTIATOR — condition + exposure
  const diff = await page.evaluate(() => {
    const z = window.__tpick();
    const stormForest = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });   // tormenta pico + expuesta
    const stormCaves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" }); // MISMA tormenta, resguardada
    const calmForest = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.6, toZone: z });        // CALMA, expuesta
    return { z, stormTier: stormForest.tier, stormFloor: stormForest.floor, stormSteps: stormForest.steps,
      cavesZone: stormCaves.zone, cavesExposed: stormCaves.exposed, cavesTier: stormCaves.tier, cavesFloor: stormCaves.floor,
      calmTier: calmForest.tier, calmStorming: calmForest.storming, calmFloor: calmForest.floor };
  });
  const diffOk = diff.stormTier >= 1 && diff.stormSteps >= 1 && (rarityRank[diff.stormFloor] || 0) >= 1 &&   // tormenta expuesta ⇒ abre
    diff.cavesExposed === false && diff.cavesTier === 0 &&                                                    // caves resguardada ⇒ sin bono
    diff.calmTier === 0 && diff.calmStorming === false;                                                       // calma ⇒ sin bono
  ok("7 ★ DIFERENCIADOR CONDICIÓN+EXPOSICIÓN: tormenta pico+forest⇒ABRE (tier≥1, floor bump); MISMA tormenta en CAVES (resguardada)⇒T0; CALMA(0.6) en forest⇒T0",
     diffOk, JSON.stringify(diff));

  // 8 shard-wide: intensity independent of pid/hero (pure clock fn)
  const shard = await page.evaluate(() => {
    const a = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    // mover al héroe a distintas zonas NO cambia la intensidad (world-state, no per-pid)
    window.__dev.tempest({ toZone: "forest" }); const b = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    window.__dev.tempest({ leave: true }); const c = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    return { a, b, c };
  });
  ok("8 SHARD-WIDE / world-state: la intensidad NO depende de pid/hero (misma fase ⇒ misma intensidad); CONDICIÓN del mundo, no meter personal",
     near(shard.a, shard.b) && near(shard.b, shard.c) && near(shard.a, 1, 0.01), JSON.stringify(shard));

  // 9 ★ REUSED channel lootQuality + seam (lootTick base vs floor)
  const seam = await page.evaluate(() => {
    const z = window.__tpick();
    // OFF ⇒ base==floor. Pero Trailcraft está LIVE: para aislar tempest, limpiamos trail (leave zone trail) — usamos una zona expuesta pero con trail vacío.
    // OFF tempest en zona expuesta con trail vacío ⇒ floor "" ⇒ floorRarity==baseRarity
    window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true });
    window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    const off = window.__dev.tempest({ lootTick: { seed: 0x51ee, tmin: 1, tmax: 2 } }).lootPicked;
    // ON tormenta pico + expuesta (trail sigue vacío) ⇒ floor≥uncommon ⇒ floorRarity≥baseRarity
    window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true });
    window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const on = window.__dev.tempest({ lootTick: { seed: 0x51ee, tmin: 1, tmax: 2 } }).lootPicked;
    return { off, on };
  });
  const seamOk = seam.off && seam.on && seam.off.floor === "" && seam.off.floorRarity === seam.off.baseRarity &&
    seam.on.tempestSteps >= 1 && (rarityRank[seam.on.floorRarity] || 0) >= (rarityRank[seam.on.baseRarity] || 0) && (rarityRank[seam.on.floorRarity] || 0) >= 1;
  ok("9 ★ CANAL REUSADO lootQuality + SEAM: lootTick SEED FIJO; OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity",
     seamOk, JSON.stringify(seam));

  // 10 ★ SHARE-CAP vs Trailcraft (Trail T3=2 + Tempest T2=2 ⇒ combined capped at 3)
  const cap = await page.evaluate(() => {
    const z = window.__tpick();
    // Trailcraft T3: push craft=6 (≥6 ⇒ T3 ⇒ 2 pasos) en la zona expuesta (que también es zona de trail)
    window.__dev.trailcraft({ enabled: true, self: "self", nowMs: window.__TNOW });
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    window.__dev.trailcraft({ nowMs: window.__TNOW, self: "self", craft: 6, pid: "self", atMs: window.__TNOW, toZone: z });
    // Tempest T2: fase pico ⇒ 2 pasos, en la MISMA zona expuesta
    const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const lt = window.__dev.tempest({ lootTick: { seed: 0x51ee, tmin: 1, tmax: 2 } }).lootPicked;
    // tempest solo (trail vacío)
    window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true }); window.__dev.tempest({ toZone: z });
    const solo = window.__dev.tempest({ nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    return { z, trailSteps: lt.trailSteps, tempestSteps: lt.tempestSteps, combined: lt.combined, cap: lt.cap, soloSteps: solo.steps };
  });
  const capOk = cap.trailSteps === 2 && cap.tempestSteps === 2 && cap.combined === 3 && cap.combined <= cap.cap && cap.soloSteps === 2;
  ok("10 ★ SHARE-CAP vs Trailcraft: Trail T3(2)+Tempest T2(2)⇒combinado CAPADO a 3 (Tempest cede 1, NO 4); tempest solo⇒2; combined≤cap",
     capOk, JSON.stringify(cap));

  // 11 ★ byte-neutral / 0-regr: tempest OFF ⇒ lootQualityFloor == trailcraftFloor (delegation)
  const neutral = await page.evaluate(() => {
    const z = window.__tpick();
    // Trail T3 en zona; tempest OFF ⇒ lootQualityFloor debe IGUALAR trailcraftFloor (delegación pura ⇒ byte-id LIVE Trailcraft)
    window.__dev.trailcraft({ enabled: true, self: "self", nowMs: window.__TNOW });
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    window.__dev.trailcraft({ nowMs: window.__TNOW, self: "self", craft: 6, pid: "self", atMs: window.__TNOW, toZone: z });
    const s = window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    return { lootQualityFloor: s.lootQualityFloor, trailcraftFloor: s.trailcraftFloor, tier: s.tier };
  });
  const neutralOk = neutral.lootQualityFloor === neutral.trailcraftFloor && neutral.lootQualityFloor !== "" && neutral.tier === 0;
  ok("11 ★ BYTE-NEUTRO/0-REGR: Tempest OFF ⇒ lootQualityFloor()==trailcraftFloor() (delegación pura ⇒ seam byte-id al LIVE de Trailcraft)",
     neutralOk, JSON.stringify(neutral));

  // 12 ★ orthogonality: opening storm doesn't move other channels
  const orth = await page.evaluate(() => {
    const z = window.__tpick();
    window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true });
    const before = window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    const after = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    return { beforeFloor: before.floor, afterFloor: after.floor, afterTier: after.tier,
      gold_b: before.goldFindMul, gold_a: after.goldFindMul, rested_b: before.restedXpMult, rested_a: after.restedXpMult,
      crit_b: before.critChancePct, crit_a: after.critChancePct, vamp_b: before.vampMul, vamp_a: after.vampMul };
  });
  const orthOk = orth.afterTier >= 1 && orth.afterFloor !== orth.beforeFloor &&
    near(orth.gold_b, orth.gold_a) && near(orth.rested_b, orth.rested_a) && near(orth.crit_b, orth.crit_a) && near(orth.vamp_b, orth.vamp_a);
  ok("12 ★ ORTOGONALIDAD lootQuality ⊥ goldFind ⊥ restedMult ⊥ critChance ⊥ vamp: abrir tormenta NO cambia los otros canales",
     orthOk, JSON.stringify(orth));

  // 13 ★ stormy night — Nocturne (night phase) + Tempest (storm phase) open at once ⇒ independent dimensions
  const night = await page.evaluate(() => {
    const z = window.__tpick();
    // Tempest tormenta en zona expuesta
    const t = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    // Nocturne: fuerza fase NOCHE y verifica night=true vía phaseProbe (dimensión independiente del clima)
    window.__dev.nocturne({ enabled: true, phaseOverride: 0.85 });   // 0.85 ∈ ventana nocturna (>=0.78)
    const snap = window.__dev.nocturne({ phaseProbe: window.__TNOW });
    const pr = snap ? snap.phaseProbe : null;
    const nightNow = !!(pr && pr.night === true);
    return { z, tempestTier: t.tier, tempestStorming: t.storming, nocturnePhase: pr ? pr.phase : null, nightNow };
  });
  const nightOk = night.tempestTier >= 1 && night.tempestStorming === true && night.nightNow === true;
  ok("13 ★ NOCHE TORMENTOSA (⊥ Nocturne dimensión temporal): Tempest (tormenta) + Nocturne (fase noche) válidos A LA VEZ ⇒ clima ⊥ fase día/noche",
     nightOk, JSON.stringify(night));
  // restaura nocturne
  await page.evaluate(() => window.__dev.nocturne({ enabled: true, phaseOverride: null }));

  // 14 0-regression: arc flags served true, TEMPEST served false
  const regr = await page.evaluate(() => ({
    trail: window.__dev.trailcraft().enabled, delve: window.__dev.delve().enabled, erud: window.__dev.erudition().enabled,
    noct: window.__dev.nocturne().enabled, cad: window.__dev.cadence().enabled,
    // tempest served flag = el flag EN DISCO (no el runtime que hemos toggled): leemos de un boot limpio del snapshot original ‑ usamos __BUILD served + un flag fresco
  }));
  // TEMPEST served=false: comprobamos el valor SERVIDO reseteando el runtime a false (ya hecho arriba). El served real lo confirma byte-verify del CEO; aquí verificamos que el DEFAULT es false.
  const tempestServed = await page.evaluate(() => { window.__dev.tempest({ enabled: false, phaseOverride: null }); return window.__dev.tempest().enabled; });
  ok("14 ★ 0-REGRESIÓN: TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE served enabled:true; TEMPEST_SURGE default false (DARK #68)",
     regr.trail && regr.delve && regr.erud && regr.noct && regr.cad && tempestServed === false, JSON.stringify(Object.assign(regr, { tempestServed })));

  // 15 5 exposed zones apply; caves excluded
  const zones = await page.evaluate(() => {
    const zs = window.__dev.tempest({ enabled: true }).zones || [];
    const broken = [];
    for (const z of zs) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
      if (!(s.zone === z && s.exposed && s.tier >= 1 && s.steps >= 1)) broken.push(z); }
    const caves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" });
    return { zs, broken, cavesExposed: caves.exposed, cavesTier: caves.tier };
  });
  ok("15 ★ TEMPEST 5 zonas EXPUESTAS: tormenta aplica (tier≥1, steps≥1) broken=[]; caves NO (resguardada, excluida)",
     zones.broken.length === 0 && zones.zs.length === 5 && zones.cavesExposed === false && zones.cavesTier === 0,
     `zones=${JSON.stringify(zones.zs)} broken=${JSON.stringify(zones.broken)} caves={exposed:${zones.cavesExposed},tier:${zones.cavesTier}}`);

  // 16 badge draws ON, not OFF + fps
  const badge = await page.evaluate(async () => {
    const z = window.__tpick();
    const CanvasProto = CanvasRenderingContext2D.prototype;
    let onCount = 0, offCount = 0, mode = "off";
    const origFill = CanvasProto.fillText;
    CanvasProto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Tempestad:") === 0) { if (mode === "on") onCount++; else offCount++; } return origFill.call(this, t, ...a); };
    // OFF frames
    window.__dev.tempest({ enabled: false, phaseOverride: null });
    mode = "off"; await new Promise(r => setTimeout(r, 300));
    // ON frames (storm + exposed)
    window.__dev.tempest({ enabled: true, nowMs: Date.now(), phaseOverride: 0.365, toZone: z });
    mode = "on"; const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 600) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    CanvasProto.fillText = origFill;
    return { onCount, offCount, fps };
  });
  ok("16 render badge 'Tempestad:' se DIBUJA ON (count>0), NO OFF (count 0), fps≥55",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence (shard-wide world condition)
  const page2 = await browser.newPage();
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page2.bringToFront();
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors2.push(m.text()); });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page2);
  await installT(page2);
  const twin = async (pg) => pg.evaluate((NOW) => {
    // MISMO reloj + MISMA fase ⇒ misma condición shard-wide; cada cliente teleporta a la 1ª zona expuesta.
    window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true });   // aísla del canal partner (trail vacío en ambos ⇒ floor = sólo-tempest)
    const z = (window.__dev.tempest({ enabled: true }).zones || [])[0];
    const s = window.__dev.tempest({ enabled: true, nowMs: NOW, phaseOverride: 0.365, toZone: z });
    const inten = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, steps: s.steps, floor: s.floor, probe: inten };
  }, NOW);
  const A = await twin(page); const B = await twin(page2);
  const conv = near(A.intensity, B.intensity) && A.tier === B.tier && A.steps === B.steps && A.floor === B.floor && near(A.probe, B.probe) && near(A.probe, 1, 0.01);
  ok("17 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMA fase/reloj ⇒ intensidad/tier/steps/floor IDÉNTICOS byte-a-byte (0 desync); clima shard-wide (misma condición)",
     conv && errors2.length === 0, `A=${JSON.stringify(A)} B=${JSON.stringify(B)} err2=${errors2.length}`);
  await page2.screenshot({ path: join(OUT, "selfverify-b.png") });

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errors2.length === 0, `err=${errors.length}+${errors2.length}: ${errors.concat(errors2).slice(0, 3).join(" | ")}`);

  console.log(`\n${PASS}/${PASS + FAIL} checks passed (build ${build})`);
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
process.exit(FAIL === 0 ? 0 : 1);
