// CAS-2377 — GE self-verify for SENDERO / TRAILCRAFT (DARK, TRAILCRAFT.enabled:false). EVO mecánica #63 — EJE FRESCO + CANAL FRESCO, ambos ⊥/OPUESTOS a #47-62.
// (A) EJE FRESCO = DIVERSIDAD DE TERRENO (variedad CUALITATIVA). server-authoritative, 0-RNG, INDIVIDUAL (per-pid): el server registra las marcas de bioma { pid → [{b,t}] } (b = zona/bioma pisado,
//     vía zoneOf), computa `trailVariety(marks,now,win)` = nº de TIPOS de bioma DISTINTOS en la ventana [now−windowSec, now] (PURA), y mientras variety≥minVariety ACUMULA `trailcraft`
//     (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-62). El decay es half-life determinista (0-RNG).
// (B) CANAL PASIVO FRESCO = `lootQuality` (RAREZA/calidad del drop, NO cantidad de oro) — el arco saturó restedMult (XP), wardRegen (HP), goldFind (oro), oocMitigation (mitigación); #63 abre un
//     QUINTO canal en el sink de loot killEnemy: con sendero abierto (tier≥1) el server SUBE el piso de rareza (`minR`) de rollGearInst en la rama de drop de basura. Sube CALIDAD, no cantidad.
//
// ★ DIFERENCIADOR (checks 8/9, no-negociable): OPUESTO a Wayfarer (#61, celdas/amplitud). Dar vueltas en UN solo bioma (muchas marcas MISMO b) ⇒ variety 1 < minVariety ⇒ NUNCA acumula (cerrado);
// cruzar 4 biomas DISTINTOS ⇒ variety 4 ⇒ acumula. INDIVIDUAL (1 solo jugador basta) + CUALITATIVO (tipos, no cantidad). Permanencia: 1-tick dt=0.5 con variety≥2 ⇒ craft≈0.5 < 2 ⇒ Tier 0 (NO abre).
//
// ★ ORTOGONALIDAD (check 13, no-negociable): abrir un sendero (lootQualityFloor≠"") NO cambia restedXpMult/goldFindMul/wardRegenMul/oocMitigMul; activar restedMult (CONVOY)/goldFind (KINSHIP)/wardRegen (WARD)/oocMitigation (WAYFARER) NO cambia el piso lootQuality.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→craft} + MISMO reloj (nowMs) ⇒ ven craft + tier + steps + floor IDÉNTICOS
// byte-a-byte (0 desync). El acumulador decae por vida-media CONVERGE. El craft es per-JUGADOR: A (self="A") y B (self="B") leen craft INDEPENDIENTES del MISMO snapshot; A SALE de la zona ⇒ su floor cae a "" (zone-gate) PERO el craftMap server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.trailcraft (flip TRAILCRAFT.enabled IN-MEMORY + inyección snapshot {pid→craft} / marks / path / step / varietyProbe + nowMs/self/toZone/leave drivers + lootTick para el seam lootQuality)
// + __dev.convoy (restedMult) + __dev.kinship (goldFind) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Sendero").
//
// Checks:
//   1  boots to play, __dev.trailcraft + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): TRAILCRAFT.enabled false AND G.trail NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'trail'/'trailServer'/'trailMarks' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ VARIETY = función PURA (trailVariety vía varietyProbe): 1 marca⇒1; N mismo bioma (vueltas)⇒1; 4 distintos⇒4; marca fuera de ventana⇒excluida.
//   6  TABLA de tiers = función PURA del CRAFT (acumulador): craft→tier (1→T0,2→T1,4→T2,6→T3) + steps (0/1/1/2) determinista.
//   7  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→craft} reflejado + DECAY half-life determinista (0-RNG) al proyectar el reloj.
//   8  ★ ACUMULADOR = función de la VARIEDAD (step): 1 bioma (variety 1)⇒add 0 (nunca abre, OPUESTO Wayfarer); 4 biomas + dt sostenido⇒acumula; 1-tick dt=0.5⇒craft ínfimo < 2 (permanencia).
//   9  ★ DIFERENCIADOR: 1 solo basta (individual); vueltas en 1 bioma⇒variety 1⇒NO abre (opuesto Wayfarer amplitud); cruzar 4 biomas distintos⇒variety 4⇒acumula; CUALITATIVO (tipos, no cantidad).
//  10  ★ DECAY determinista 0-RNG por VIDA-MEDIA: craft 6 (T3); avanzar `now` +25s (halfLife) ⇒ craft 3 (T1). Reloj compartido.
//  11  PASSIVE individual (canal lootQuality): craft≥umbral + héroe EN zona de caza ⇒ floor==bumpRarity(steps) + tier≥1; leave (fuera de zona) ⇒ "" + tier 0.
//  12  ★ CANAL FRESCO lootQuality wired + SUBIDA DE RAREZA DEL DROP: seam killEnemy rollGearInst(...,trailcraftFloor()||undefined); lootTick seed-fijo ⇒ floorRarity≥baseRarity abierto; OFF ⇒ floorRarity==baseRarity byte-id.
//  13  ★ ORTOGONALIDAD lootQuality ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation (0 doble-conteo): abrir sendero NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER NO cambia el piso lootQuality.
//  14  ★ 0-REGRESIÓN: los 15 flags del arco ya LIVE siguen served enabled:true; TRAILCRAFT served false (DARK #63).
//  15  ★ SENDERO 6 zonas: el pasivo aplica en las 6 zonas de TRAILCRAFT.zones (craft≥6 ⇒ T3, steps>0) broken=[].
//  16  render badge "Sendero" se DIBUJA con la feature ON (ctx.fillText "Sendero" count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ craft/tier/steps/floor IDÉNTICOS byte-a-byte; el acumulador decae CONVERGE; craft per-pid (A vs B independientes); A sale de zona ⇒ floor="" PERO craftMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2377-trailcraft-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2377");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

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

const NOW = 8720000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installTrail(page) {
  await page.evaluate((NOW) => {
    window.__TNOW = NOW;
    // construye `n` marcas de BIOMAS DISTINTOS, todas @NOW (dentro de ventana ⇒ variety==n exacto)
    window.__vmarks = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ b: "b" + i, t: (t == null ? window.__TNOW : t) }); return out; };
    // fija marcas de bioma para un pid (CLEAR antes ⇒ snapshot limpio). Prueba variety/diferenciadores.
    window.__tmarks = (pid, marks) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ nowMs: window.__TNOW, self: pid, marks: { [pid]: marks } }); };
    // corre un STEP de acumulación (variety→accrue) con dt para un pid (usa las marcas ya fijadas)
    window.__tstep = (pid, dt) => window.__dev.trailcraft({ nowMs: window.__TNOW, self: pid, step: { [pid]: { dt } } });
    // empuja el craft crudo (acumulador) de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__tcraft = (pid, craft) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ nowMs: window.__TNOW, self: pid, craft, pid, atMs: window.__TNOW }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el snapshot (decay half-life)
    window.__tat = (elapsedSec) => window.__dev.trailcraft({ nowMs: window.__TNOW + (elapsedSec || 0) * 1000 });
    // inyecta `craft` para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (craftable + zona coincide).
    window.__tpick = (craft) => {
      window.__dev.trailcraft({ enabled: true, self: "self" });
      const zones = window.__dev.trailcraft().zones || [];
      for (const z of zones) {
        window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
        const s = window.__dev.trailcraft({ nowMs: window.__TNOW, self: "self", craft, pid: "self", atMs: window.__TNOW, toZone: z });
        if (s.zone === z && s.craftable) return { zone: z, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor };
      }
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
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.trailcraft && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.trailcraft + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.trail never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.trailcraft());
  ok("2 byte-id OFF (fresh boot): TRAILCRAFT.enabled false AND G.trail NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.craft === 0 && dark.steps === 0 && dark.floor === "" && dark.tag === "" && dark.craftMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} craft=${dark.craft} steps=${dark.steps} floor="${dark.floor}" tag="${dark.tag}" map=${JSON.stringify(dark.craftMap)}`);

  // 3 save OFF has no 'trail'/'trailServer'/'trailMarks' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'trail'/'trailServer'/'trailMarks' key in save blob (estado 100% derivado/transitorio)", !/"trail(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(377)));
  await page.evaluate(() => window.__dev.trailcraft({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(377)));
  await page.evaluate(() => window.__dev.trailcraft({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installTrail(page);

  // 5 ★ variety = pure fn (trailVariety via probe)
  const pr = await page.evaluate((NOW) => {
    window.__dev.trailcraft({ enabled: true });
    const win = 30000;
    const V = (marks, now) => window.__dev.trailcraft({ varietyProbe: { marks, now: (now == null ? NOW : now), windowMs: win } }).probe;
    return {
      one:    V([{ b: "forest", t: NOW }]),                                              // 1 marca ⇒ 1
      still:  V([{ b: "forest", t: NOW - 3000 }, { b: "forest", t: NOW - 1000 }, { b: "forest", t: NOW }]),  // N MISMO bioma (vueltas) ⇒ 1
      four:   V([{ b: "forest", t: NOW }, { b: "caves", t: NOW }, { b: "ruins", t: NOW }, { b: "frost", t: NOW }]),  // 4 distintos ⇒ 4
      expire: V([{ b: "forest", t: NOW - 40000 }, { b: "caves", t: NOW }]),              // 1 fuera de ventana (40s>30s) + 1 dentro ⇒ 1
    };
  }, NOW);
  ok("5 ★ VARIETY = función PURA (trailVariety): 1 marca⇒1; N mismo bioma (vueltas)⇒1; 4 distintos⇒4; 1 fuera de ventana⇒excluida (⇒1)",
     pr.one === 1 && pr.still === 1 && pr.four === 4 && pr.expire === 1, JSON.stringify(pr));

  // 6 tier table = pure fn of CRAFT (accumulator)
  const tab = await page.evaluate((NOW) => {
    const w = window.__tpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6]) {
      window.__dev.trailcraft({ clear: true, nowMs: NOW });
      const s = window.__dev.trailcraft({ nowMs: NOW, self: "self", craft: c, pid: "self", atMs: NOW, toZone: zone });
      out.push({ c, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor });
    }
    return { zone, out };
  }, NOW);
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3 };
  const expSteps = { 1: 0, 2: 1, 4: 1, 6: 2 };
  const expFloor = { 1: "", 2: "uncommon", 4: "uncommon", 6: "rare" };
  const tabOk = !tab.bad && tab.out.every(r => near(r.craft, r.c) && r.tier === expTier[r.c] && r.steps === expSteps[r.c] && r.floor === expFloor[r.c]);
  ok("6 TABLA de tiers = función PURA del CRAFT: craft→tier (1→T0,2→T1,4→T2,6→T3) + steps (0/1/1/2) + floor (\"\"/uncommon/uncommon/rare) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + project (half-life decay)
  const refl = await page.evaluate((NOW) => {
    window.__dev.trailcraft({ enabled: true, self: "self" });
    window.__dev.trailcraft({ clear: true, nowMs: NOW });
    window.__dev.trailcraft({ nowMs: NOW, self: "self", push: { self: { craft: 8, atMs: NOW }, other: { craft: 4, atMs: NOW } } });
    const at0 = window.__dev.trailcraft({ nowMs: NOW });                       // craft 8 (self), 4 (other) proyectados sin decay (dt 0)
    const at25 = window.__dev.trailcraft({ nowMs: NOW + 25000 });              // +25s = 1 half-life ⇒ self 4, other 2
    return { self0: at0.craftMap && at0.craftMap.self, other0: at0.craftMap && at0.craftMap.other, self25: at25.craftMap && at25.craftMap.self, other25: at25.craftMap && at25.craftMap.other };
  }, NOW);
  const reflOk = near(refl.self0, 8) && near(refl.other0, 4) && near(refl.self25, 4, 0.02) && near(refl.other25, 2, 0.02);
  ok("7 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→craft} reflejado; DECAY half-life 0-RNG (+25s=1 vida-media ⇒ 8→4, 4→2)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of VARIETY (step): 1 biome ⇒ add 0 (never opens); 4 biomes sustained ⇒ accrues; 1-tick ⇒ tiny (permanence)
  const acc = await page.evaluate((NOW) => {
    const w = window.__tpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    // 1 solo bioma (vueltas): variety 1 < 2 ⇒ step add 0 ⇒ craft 0 (nunca abre, OPUESTO Wayfarer)
    window.__tmarks("self", [{ b: "forest", t: NOW - 2000 }, { b: "forest", t: NOW - 1000 }, { b: "forest", t: NOW }]);
    window.__dev.trailcraft({ toZone: zone });
    const one = window.__tstep("self", 5);   // dt grande, pero variety 1 ⇒ add 0
    // 4 biomas distintos: variety 4 ≥ 2 ⇒ 1-tick dt=0.5 ⇒ craft≈0.5 < 2 ⇒ Tier 0 (permanencia)
    window.__tmarks("self", [{ b: "forest", t: NOW }, { b: "caves", t: NOW }, { b: "ruins", t: NOW }, { b: "frost", t: NOW }]);
    window.__dev.trailcraft({ toZone: zone });
    const tick1 = window.__tstep("self", 0.5);
    // sostenido: acumula hasta abrir (2 pasos de dt=1.5 ⇒ craft≈3 ⇒ T1)
    const s2 = window.__tstep("self", 1.5);   // craft ≈ 0.5+1.5 = 2 ⇒ T1
    const s3 = window.__tstep("self", 2);     // craft ≈ 4 ⇒ T2
    return { zone, oneVar: one.craft, tick1Var: tick1.craft, tick1Tier: tick1.tier, sust2: s2.craft, sust2Tier: s2.tier, sust3: s3.craft, sust3Tier: s3.tier };
  }, NOW);
  const accOk = !acc.bad && near(acc.oneVar, 0) &&                        // 1 bioma ⇒ nunca acumula
    acc.tick1Var > 0 && acc.tick1Var < 2 && acc.tick1Tier === 0 &&        // 1-tick dt=0.5 ⇒ craft ínfimo ⇒ T0 (permanencia)
    acc.sust2Tier >= 1 && acc.sust3Tier >= 2;                            // sostenido ⇒ abre + sube
  ok("8 ★ ACUMULADOR = función de la VARIEDAD (step): 1 bioma (variety 1)⇒add 0 (nunca abre, OPUESTO Wayfarer); 4 biomas 1-tick dt=0.5⇒craft<2⇒T0 (permanencia); sostenido⇒T1→T2",
     accOk, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — variety (types), qualitative + individual
  const diff = await page.evaluate((NOW) => {
    const win = 30000;
    const V = (marks) => window.__dev.trailcraft({ varietyProbe: { marks, now: NOW, windowMs: win } }).probe;
    return {
      // vueltas en 1 bioma: 8 marcas MISMO b ⇒ variety 1 ⇒ NO abre (OPUESTO a Wayfarer, que contaría 8 celdas distintas)
      circleOneBiome: V([{ b: "forest", t: NOW - 7000 }, { b: "forest", t: NOW - 6000 }, { b: "forest", t: NOW - 5000 }, { b: "forest", t: NOW - 4000 }, { b: "forest", t: NOW - 3000 }, { b: "forest", t: NOW - 2000 }, { b: "forest", t: NOW - 1000 }, { b: "forest", t: NOW }]),
      // cruzar 4 biomas distintos ⇒ variety 4 (aunque sean pocas marcas) ⇒ abre — CUALITATIVO
      crossFour: V([{ b: "forest", t: NOW - 3000 }, { b: "caves", t: NOW - 2000 }, { b: "ruins", t: NOW - 1000 }, { b: "swamp", t: NOW }]),
      // 1 solo jugador basta (individual): estas marcas son de UN pid
      loneTwo: V([{ b: "forest", t: NOW - 1000 }, { b: "abyss", t: NOW }]),
    };
  }, NOW);
  ok("9 ★ DIFERENCIADOR: vueltas en 1 bioma (8 marcas mismo b)⇒variety 1⇒NO abre (OPUESTO Wayfarer amplitud/celdas); cruzar 4 biomas distintos⇒variety 4 (CUALITATIVO); 1 solo jugador basta (individual, 2 tipos⇒2)",
     diff.circleOneBiome === 1 && diff.crossFour === 4 && diff.loneTwo === 2, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate((NOW) => {
    const w = window.__tpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.trailcraft({ clear: true, nowMs: NOW });
    window.__dev.trailcraft({ nowMs: NOW, self: "self", craft: 6, pid: "self", atMs: NOW, toZone: zone });
    const at0 = window.__dev.trailcraft({ nowMs: NOW, toZone: zone });          // craft 6 ⇒ T3
    const at25 = window.__dev.trailcraft({ nowMs: NOW + 25000, toZone: zone }); // +25s ⇒ craft 3 ⇒ T1
    return { base: at0.craft, baseT: at0.tier, dec: at25.craft, decT: at25.tier };
  }, NOW);
  ok("10 ★ DECAY determinista 0-RNG por VIDA-MEDIA: craft 6 (T3); +25s (1 half-life) ⇒ craft 3 (T1)",
     !decay.bad && near(decay.base, 6) && decay.baseT === 3 && near(decay.dec, 3, 0.02) && decay.decT === 1, JSON.stringify(decay));

  // 11 passive isolated (lootQuality channel): in-zone craft≥umbral ⇒ floor == bumpRarity(steps) + tier≥1; leave ⇒ ""
  const pass = await page.evaluate((NOW) => {
    const w = window.__tpick(4); if (!w) return { bad: true };                // craft 4 ⇒ Tier 2 ⇒ steps 1 ⇒ floor uncommon
    const inz = window.__dev.trailcraft({ nowMs: NOW, toZone: w.zone });
    const out = window.__dev.trailcraft({ leave: true });
    return { zone: w.zone, inFloor: inz.floor, inTier: inz.tier, inSteps: inz.steps, inLoot: inz.lootQualityFloor, outFloor: out.floor, outTier: out.tier, outLoot: out.lootQualityFloor };
  }, NOW);
  ok("11 PASSIVE individual (canal lootQuality, aislado): héroe EN zona con craft≥umbral ⇒ floor==bumpRarity(steps) (T2=uncommon) + tier≥1; leave (fuera de zona) ⇒ \"\" + tier 0",
     !pass.bad && pass.inFloor === "uncommon" && pass.inTier === 2 && pass.inSteps === 1 && pass.inLoot === "uncommon" && pass.outFloor === "" && pass.outTier === 0 && pass.outLoot === "", JSON.stringify(pass));

  // 12 ★ FRESH CHANNEL lootQuality wired + DROP RARITY FLOOR LIFT
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function trailcraftFloor/.test(simSrc) &&
    /rollGearInst\(srand,win\[0\],win\[1\],\s*trailcraftFloor\(\)\|\|undefined\)/.test(simSrc) &&
    /return bumpRarity\("common",\s*steps\)/.test(simSrc);
  const loot = await page.evaluate((NOW) => {
    const w = window.__tpick(6); if (!w) return { bad: true };                // craft 6 ⇒ T3 ⇒ steps 2 ⇒ floor rare
    window.__dev.trailcraft({ nowMs: NOW, toZone: w.zone });
    // seed fijo: rueda un drop CON y SIN el piso ⇒ floorRarity ≥ baseRarity (piso rare)
    const on = window.__dev.trailcraft({ lootTick: { seed: 0x51ee7, tmin: 1, tmax: 3 } }).lootPicked;
    // OFF ⇒ floor "" ⇒ floorRarity == baseRarity (byte-id)
    window.__dev.trailcraft({ enabled: false });
    const off = window.__dev.trailcraft({ lootTick: { seed: 0x51ee7, tmin: 1, tmax: 3 } }).lootPicked;
    const offTag = window.__dev.trailcraft().tag;
    window.__dev.trailcraft({ enabled: true });
    return { zone: w.zone, on, off, offTag };
  }, NOW);
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const lootOk = !loot.bad && loot.on && loot.on.steps === 2 && loot.on.floor === "rare" &&
    RANK[loot.on.floorRarity] >= RANK[loot.on.baseRarity] && RANK[loot.on.floorRarity] >= RANK.rare &&
    loot.off && loot.off.floor === "" && loot.off.floorRarity === loot.off.baseRarity && loot.offTag === "";
  ok("12 ★ CANAL FRESCO lootQuality wired + SUBIDA DE RAREZA DEL DROP: seam killEnemy rollGearInst(...,trailcraftFloor()||undefined); T3 seed-fijo ⇒ floorRarity≥baseRarity (≥rare); OFF ⇒ floorRarity==baseRarity byte-id + tag \"\"",
     seamWired && lootOk, `wired=${seamWired} on=${JSON.stringify(loot.on)} off=${JSON.stringify(loot.off)} offTag="${loot.offTag}"`);

  // 13 ★ ORTHOGONALITY lootQuality ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__tpick(6); if (!w) return { bad: true };                // craft 6 ⇒ T3 ⇒ floor rare
    const zone = w.zone;
    const a = window.__dev.trailcraft({ nowMs: NOW, toZone: zone });
    const lootBefore = a.lootQualityFloor, restedBefore = a.restedXpMult, goldBefore = a.goldFindMul, wardBefore = a.wardRegenMul, oocBefore = a.oocMitigMul;
    // activa CONVOY (restedMult) + KINSHIP (goldFind) + WARD (wardRegen) + WAYFARER (oocMitigation) en la MISMA zona ⇒ SUS canales suben pero el piso lootQuality NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }] }, toZone: zone });
    const b = window.__dev.trailcraft({ nowMs: NOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, lootBefore, restedBefore, goldBefore, wardBefore, oocBefore, lootAfter: b.lootQualityFloor, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "lootQuality" && orth.lootBefore === "rare" &&
    orth.lootAfter === orth.lootBefore &&                             // los otros canales NO cambian el piso lootQuality
    orth.restedAfter > orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0;   // y CONVOY/KINSHIP/WARD/WAYFARER sí aportan en SUS canales
  ok("13 ★ ORTOGONALIDAD lootQuality ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation (0 doble-conteo): abrir sendero NO toca los otros; activar CONVOY/KINSHIP/WARD/WAYFARER NO cambia el piso; canal='lootQuality'",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 15 flags del arco siguen LIVE served; TRAILCRAFT served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const trailDark = flag("TRAILCRAFT") === "false";
  ok("14 ★ 0-REGRESIÓN: 15 flags del arco served enabled:true; TRAILCRAFT served false (DARK)",
     arcAllOn && trailDark && arc.length === 15, `trailcraft=${flag("TRAILCRAFT")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ SENDERO en las 6 zonas
  const zonesRes = await page.evaluate((NOW) => {
    window.__dev.trailcraft({ enabled: true, self: "self" });
    const zones = window.__dev.trailcraft().zones; const broken = [];
    for (const z of zones) {
      window.__dev.trailcraft({ clear: true, nowMs: NOW });
      const s = window.__dev.trailcraft({ nowMs: NOW, self: "self", craft: 6, pid: "self", atMs: NOW, toZone: z });
      if (!(s.zone === z && s.craftable && s.tier === 3 && s.steps === 2 && s.floor === "rare")) broken.push(z);
    }
    return { zones, broken };
  }, NOW);
  ok("15 ★ SENDERO 6 zonas: las 6 zonas de TRAILCRAFT.zones hospedan el pasivo (craft≥6 ⇒ T3, steps 2, floor rare) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Sendero" drawn ON / not OFF + fps
  const badge = await page.evaluate(async (NOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sendero:") >= 0) cnt++; return orig(t, x, y); };  // "Sendero:" (con colon) = ÚNICO de mi badge (WAYFARER_TRAIL usa "Sendero Trillado", sin colon)
    const w = window.__tpick(6);
    window.__dev.trailcraft({ nowMs: NOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.trailcraft({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, NOW);
  ok("16 render badge \"Sendero\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((NOW) => { const w = window.__tpick(6); window.__dev.trailcraft({ nowMs: NOW, toZone: w.zone }); }, NOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.trailcraft({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installTrail(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.trailcraft({ enabled: true }).zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    // snapshot COMPARTIDO { A:{craft6}, B:{craft2}, P:{craft6} } @NOW; ambos clientes lo empujan idéntico
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.trailcraft({ enabled: true, self });
        window.__dev.trailcraft({ clear: true, nowMs: NOW });
        const s = window.__dev.trailcraft({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: { craft: 6, atMs: NOW }, B: { craft: 2, atMs: NOW }, P: { craft: 6, atMs: NOW },
        }, toZone: zone });
        return { self: s.self, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor, nowMs: s.nowMs, map: s.craftMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: craft 6 (T3, steps 2, floor rare), byte-idéntico
    const decayed = await readAs("P", 25);     // +25s ⇒ half-life ⇒ P craft 3 (T1, steps 1, floor uncommon), converge
    // per-pid independence: A lee "A" (craft 6 T3), B lee "B" (craft 2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const push = { A: { craft: 6, atMs: NOW }, B: { craft: 2, atMs: NOW } };
      const rA = await page.evaluate(({ zone, NOW, push }) => { window.__dev.trailcraft({ enabled: true, self: "A" }); window.__dev.trailcraft({ clear: true, nowMs: NOW }); const s = window.__dev.trailcraft({ nowMs: NOW, self: "A", push, toZone: zone }); return { self: s.self, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor, map: s.craftMap }; }, { zone, NOW, push });
      const rB = await pageB.evaluate(({ zone, NOW, push }) => { window.__dev.trailcraft({ enabled: true, self: "B" }); window.__dev.trailcraft({ clear: true, nowMs: NOW }); const s = window.__dev.trailcraft({ nowMs: NOW, self: "B", push, toZone: zone }); return { self: s.self, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor, map: s.craftMap }; }, { zone, NOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ floor "" (zone-gate) PERO craftMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.trailcraft({ leave: true }); return { floor: s.floor, loot: s.lootQualityFloor, tier: s.tier, map: s.craftMap, craft: s.craft }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.trailcraft({ nowMs: NOW, self: "B", toZone: zone }); return { floor: s.floor, tier: s.tier, craft: s.craft }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.craft, 6) && northStar.shared.a.floor === "rare" &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.craft, 3, 0.02) && northStar.decayed.a.floor === "uncommon" &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && northStar.indep.rA.floor === "rare" && northStar.indep.rB.tier === 1 && northStar.indep.rB.floor === "uncommon" &&
    northStar.aLeaves.floor === "" && northStar.aLeaves.loot === "" &&                 // A fuera de zona ⇒ floor ""
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&                   // craftMap server-authoritative INTACTO
    near(northStar.aLeaves.craft, 6) &&                                               // craft (per-pid A) sigue proyectado
    northStar.bIntact.floor === "uncommon" && northStar.bIntact.tier === 1;           // B intacto (per-pid independiente)
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ craft/tier/steps/floor byte-idénticos (P T3 rare, decae T1 uncommon); craft per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ floor=\"\" PERO craftMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aFloor: northStar.aLeaves.floor, bFloor: northStar.bIntact.floor, bTier: northStar.bIntact.tier, errB: errB.length }));

  // 0 no JS errors
  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}  build=${build}`);
  process.exit(FAIL === 0 ? 0 : 1);
} catch (e) {
  console.error("HARNESS ERROR", e);
  process.exit(2);
} finally {
  await browser.close();
  await server.stop();
}
