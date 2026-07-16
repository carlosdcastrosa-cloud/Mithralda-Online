// CAS-2381 — GE self-verify for ERUDICIÓN / LOREKEEPER (DARK, ERUDITION.enabled:false). EVO mecánica #65 (serializa tras #64 DELVE) — EJE FRESCO + CANAL REUSADO, ⊥/OPUESTOS a #47-64.
// (A) EJE FRESCO = DIVERSIDAD DE PRESAS / BESTIARY BREADTH (variedad CUALITATIVA de FOES abatidos). server-authoritative, 0-RNG, INDIVIDUAL (per-pid): el server registra las marcas de kill { pid → [{k,t}] }
//     (k = TIPO/especie de enemigo abatido, e.type), computa `loreVariety(marks,now,win)` = nº de TIPOS DISTINTOS en la ventana [now−windowSec, now] (PURA), y mientras variety≥minVariety ACUMULA `erudition`
//     (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-64). El decay es half-life determinista (0-RNG).
// (B) CANAL REUSADO = `xpGain` (multiplicador de XP por el ÚNICO chokepoint gainXP). De-stack máximo-único: si FELLOWSHIP_BOND (#47, más antigua) tiene vínculo FORJADO (fellowMul>0) ⇒ ERUDITION CEDE (0 ⇒ el MAYOR).
//     Mirror EXACTO de FOCUS_FIRE #62 cediendo a KINSHIP #60 en goldFind. Con erudición abierta (tier≥1) y sin vínculo Hermandad, la XP de cada kill se multiplica por (1+boost) en gainXP.
//
// ★ DIFERENCIADOR (checks 8/9, no-negociable): OPUESTO a Focus (#62, concentración en UN objetivo). Matar SIEMPRE el mismo tipo (muchas marcas MISMO k) ⇒ variety 1 < minVariety ⇒ NUNCA acumula (cerrado);
// abatir 4 tipos DISTINTOS ⇒ variety 4 ⇒ acumula. INDIVIDUAL (1 solo jugador basta) + CUALITATIVO (por TIPO de presa, no cantidad). Permanencia: 1-tick dt=0.5 con variety≥min ⇒ lore≈0.5 < 2 ⇒ Tier 0 (NO abre).
//
// ★ DE-STACK (check 13, no-negociable): FELLOWSHIP forjado ⇒ fellowMul(xpGain)>0 ⇒ eruditionMul CEDE a 0 (máximo-único, 0 doble-dip). ★ ORTOGONALIDAD (check 14): abrir erudición (xpGainMul≠0) NO cambia restedXpMult/goldFind/wardRegen/oocMitigation/lootQuality/critChance.
//
// North Star (check 18, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→lore} + MISMO reloj (nowMs) ⇒ ven lore + tier + boost IDÉNTICOS byte-a-byte (0 desync).
// El acumulador decae por vida-media CONVERGE. El lore es per-JUGADOR: A (self="A") y B (self="B") leen lore INDEPENDIENTES del MISMO snapshot; A SALE de la zona ⇒ su boost cae a 0 (zone-gate) PERO el loreMap server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.erudition (flip ERUDITION.enabled IN-MEMORY + inyección snapshot {pid→lore} / marks / kills / step / varietyProbe + nowMs/self/toZone/leave drivers + xpTick para el seam xpGain)
// + __dev.fellowship (forja vínculo ⇒ de-stack) + __dev.convoy (restedMult) + __dev.kinship (goldFind) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Erudito:").
//
// Checks:
//   1  boots to play, __dev.erudition + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): ERUDITION.enabled false AND G.lore NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'lore'/'loreServer'/'loreMarks' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ VARIETY = función PURA (loreVariety vía varietyProbe): 1 marca⇒1; N mismo tipo⇒1; 4 distintos⇒4; marca fuera de ventana⇒excluida.
//   6  TABLA de tiers = función PURA del LORE (acumulador): lore→tier (1→T0,2→T1,4→T2,6→T3) + boost (0/.05/.10/.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→lore} reflejado + DECAY half-life determinista (0-RNG) al proyectar el reloj.
//   8  ★ ACUMULADOR = función de la VARIEDAD (step): 1 tipo (variety 1)⇒add 0 (nunca abre, OPUESTO Focus); 4 tipos + dt sostenido⇒acumula; 1-tick dt=0.5⇒lore ínfimo < 2 (permanencia).
//   9  ★ DIFERENCIADOR: matar el MISMO tipo 8×⇒variety 1⇒NO abre (OPUESTO Focus concentración); abatir 4 tipos distintos⇒variety 4⇒acumula; CUALITATIVO (tipos, no cantidad); 1 solo jugador basta (individual).
//  10  ★ DECAY determinista 0-RNG por VIDA-MEDIA: lore 6 (T3); avanzar `now` +25s (halfLife) ⇒ lore 3 (T1). Reloj compartido.
//  11  PASSIVE individual (canal xpGain): lore≥umbral + héroe EN zona de caza ⇒ boost>0 + tier≥1; leave (fuera de zona) ⇒ boost 0 + tier 0.
//  12  ★ CANAL REUSADO xpGain wired + MULTIPLICADOR DE XP: seam gainXP n·(1+fellowMul+eruditionMul); xpTick base ⇒ paid==round(base·(1+boost)) abierto; OFF ⇒ paid==round(base·(1+fellow)) byte-id.
//  13  ★ DE-STACK máximo-único: FELLOWSHIP forjado ⇒ fellowMul(xpGain)>0 ⇒ eruditionMul CEDE a 0 (0 doble-dip). Sin Hermandad ⇒ ERUDITION aplica.
//  14  ★ ORTOGONALIDAD xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 doble-conteo): abrir erudición NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER NO cambia el xpGainMul.
//  15  ★ 0-REGRESIÓN: los 16 flags del arco ya LIVE siguen served enabled:true; ERUDITION served false (DARK #65); DELVE served false (DARK #64).
//  16  ★ ERUDICIÓN 6 zonas: el pasivo aplica en las 6 zonas de ERUDITION.zones (lore≥6 ⇒ T3, boost>0) broken=[].
//  17  render badge "Erudito:" se DIBUJA con la feature ON (ctx.fillText "Erudito:" count>0) y NO con OFF (count 0) + fps.
//  18  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ lore/tier/boost IDÉNTICOS byte-a-byte; el acumulador decae CONVERGE; lore per-pid (A vs B independientes); A sale de zona ⇒ boost=0 PERO loreMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2381-erudition-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2381");
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

const NOW = 8642000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installLore(page) {
  await page.evaluate((NOW) => {
    window.__LNOW = NOW;
    // construye `n` marcas de TIPOS DISTINTOS, todas @NOW (dentro de ventana ⇒ variety==n exacto)
    window.__vkills = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ k: "mob" + i, t: (t == null ? window.__LNOW : t) }); return out; };
    // fija marcas de kill para un pid (CLEAR antes ⇒ snapshot limpio). Prueba variety/diferenciadores.
    window.__lmarks = (pid, marks) => { window.__dev.erudition({ clear: true, nowMs: window.__LNOW }); window.__dev.erudition({ nowMs: window.__LNOW, self: pid, marks: { [pid]: marks } }); };
    // corre un STEP de acumulación (variety→accrue) con dt para un pid (usa las marcas ya fijadas)
    window.__lstep = (pid, dt) => window.__dev.erudition({ nowMs: window.__LNOW, self: pid, step: { [pid]: { dt } } });
    // empuja el lore crudo (acumulador) de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__lore = (pid, lore) => { window.__dev.erudition({ clear: true, nowMs: window.__LNOW }); window.__dev.erudition({ nowMs: window.__LNOW, self: pid, lore, pid, atMs: window.__LNOW }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el snapshot (decay half-life)
    window.__lat = (elapsedSec) => window.__dev.erudition({ nowMs: window.__LNOW + (elapsedSec || 0) * 1000 });
    // inyecta `lore` para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (learnable + zona coincide).
    window.__lpick = (lore) => {
      window.__dev.erudition({ enabled: true, self: "self" });
      const zones = window.__dev.erudition().zones || [];
      for (const z of zones) {
        window.__dev.erudition({ clear: true, nowMs: window.__LNOW });
        const s = window.__dev.erudition({ nowMs: window.__LNOW, self: "self", lore, pid: "self", atMs: window.__LNOW, toZone: z });
        if (s.zone === z && s.learnable) return { zone: z, lore: s.lore, tier: s.tier, boost: s.boost, xpGainMul: s.xpGainMul };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.erudition && window.__dev.fellowship && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.erudition + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.lore never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.erudition());
  ok("2 byte-id OFF (fresh boot): ERUDITION.enabled false AND G.lore NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.lore === 0 && dark.boost === 0 && dark.xpGainMul === 0 && dark.tag === "" && dark.loreMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} lore=${dark.lore} boost=${dark.boost} xpGainMul=${dark.xpGainMul} tag="${dark.tag}" map=${JSON.stringify(dark.loreMap)}`);

  // 3 save OFF has no 'lore'/'loreServer'/'loreMarks' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'lore'/'loreServer'/'loreMarks' key in save blob (estado 100% derivado/transitorio)", !/"lore(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(381)));
  await page.evaluate(() => window.__dev.erudition({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(381)));
  await page.evaluate(() => window.__dev.erudition({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installLore(page);

  // 5 ★ variety = pure fn (loreVariety via probe)
  const pr = await page.evaluate((NOW) => {
    window.__dev.erudition({ enabled: true });
    const win = 30000;
    const V = (marks, now) => window.__dev.erudition({ varietyProbe: { marks, now: (now == null ? NOW : now), windowMs: win } }).probe;
    return {
      one:    V([{ k: "goblin", t: NOW }]),                                              // 1 marca ⇒ 1
      same:   V([{ k: "goblin", t: NOW - 3000 }, { k: "goblin", t: NOW - 1000 }, { k: "goblin", t: NOW }]),  // N MISMO tipo ⇒ 1
      four:   V([{ k: "goblin", t: NOW }, { k: "ogre", t: NOW }, { k: "wraith", t: NOW }, { k: "troll", t: NOW }]),  // 4 distintos ⇒ 4
      expire: V([{ k: "goblin", t: NOW - 40000 }, { k: "ogre", t: NOW }]),               // 1 fuera de ventana (40s>30s) + 1 dentro ⇒ 1
    };
  }, NOW);
  ok("5 ★ VARIETY = función PURA (loreVariety): 1 marca⇒1; N mismo tipo⇒1; 4 distintos⇒4; 1 fuera de ventana⇒excluida (⇒1)",
     pr.one === 1 && pr.same === 1 && pr.four === 4 && pr.expire === 1, JSON.stringify(pr));

  // 6 tier table = pure fn of LORE (accumulator)
  const tab = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6]) {
      window.__dev.erudition({ clear: true, nowMs: NOW });
      const s = window.__dev.erudition({ nowMs: NOW, self: "self", lore: c, pid: "self", atMs: NOW, toZone: zone });
      out.push({ c, lore: s.lore, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, NOW);
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.lore, r.c) && r.tier === expTier[r.c] && near(r.boost, expBoost[r.c]));
  ok("6 TABLA de tiers = función PURA del LORE: lore→tier (1→T0,2→T1,4→T2,6→T3) + boost (0/.05/.10/.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + project (half-life decay)
  const refl = await page.evaluate((NOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    window.__dev.erudition({ clear: true, nowMs: NOW });
    window.__dev.erudition({ nowMs: NOW, self: "self", push: { self: { lore: 8, atMs: NOW }, other: { lore: 4, atMs: NOW } } });
    const at0 = window.__dev.erudition({ nowMs: NOW });                       // lore 8 (self), 4 (other) proyectados sin decay (dt 0)
    const at25 = window.__dev.erudition({ nowMs: NOW + 25000 });              // +25s = 1 half-life ⇒ self 4, other 2
    return { self0: at0.loreMap && at0.loreMap.self, other0: at0.loreMap && at0.loreMap.other, self25: at25.loreMap && at25.loreMap.self, other25: at25.loreMap && at25.loreMap.other };
  }, NOW);
  const reflOk = near(refl.self0, 8) && near(refl.other0, 4) && near(refl.self25, 4, 0.02) && near(refl.other25, 2, 0.02);
  ok("7 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→lore} reflejado; DECAY half-life 0-RNG (+25s=1 vida-media ⇒ 8→4, 4→2)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of VARIETY (step): 1 type ⇒ add 0 (never opens); 4 types sustained ⇒ accrues; 1-tick ⇒ tiny (permanence)
  const acc = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    // matar SIEMPRE el mismo tipo: variety 1 < minVariety(3) ⇒ step add 0 ⇒ lore 0 (nunca abre, OPUESTO Focus)
    window.__lmarks("self", [{ k: "goblin", t: NOW - 2000 }, { k: "goblin", t: NOW - 1000 }, { k: "goblin", t: NOW }]);
    window.__dev.erudition({ toZone: zone });
    const one = window.__lstep("self", 5);   // dt grande, pero variety 1 ⇒ add 0 (snapshot .lore/.tier)
    // 4 tipos distintos: variety 4 ≥ 3 ⇒ 1-tick dt=0.5 ⇒ lore≈0.5 < 2 ⇒ Tier 0 (permanencia)
    window.__lmarks("self", [{ k: "goblin", t: NOW }, { k: "ogre", t: NOW }, { k: "wraith", t: NOW }, { k: "troll", t: NOW }]);
    window.__dev.erudition({ toZone: zone });
    const tick1 = window.__lstep("self", 0.5);
    // sostenido: acumula hasta abrir (dt=1.5 ⇒ lore≈2 ⇒ T1; +dt=2 ⇒ lore≈4 ⇒ T2)
    const s2 = window.__lstep("self", 1.5);   // lore ≈ 0.5+1.5 = 2 ⇒ T1
    const s3 = window.__lstep("self", 2);     // lore ≈ 4 ⇒ T2
    return { zone, oneLore: one.lore, oneTier: one.tier, tick1Lore: tick1.lore, tick1Tier: tick1.tier, sust2: s2.lore, sust2Tier: s2.tier, sust3: s3.lore, sust3Tier: s3.tier };
  }, NOW);
  const accOk = !acc.bad && near(acc.oneLore || 0, 0) && acc.oneTier === 0 &&          // 1 tipo ⇒ nunca acumula
    acc.tick1Lore > 0 && acc.tick1Lore < 2 && acc.tick1Tier === 0 &&                   // 1-tick dt=0.5 ⇒ lore ínfimo ⇒ T0 (permanencia)
    acc.sust2Tier >= 1 && acc.sust3Tier >= 2;                                          // sostenido ⇒ abre + sube
  ok("8 ★ ACUMULADOR = función de la VARIEDAD (step): 1 tipo (variety 1)⇒lore 0/T0 (nunca abre, OPUESTO Focus); 4 tipos 1-tick dt=0.5⇒lore<2⇒T0 (permanencia); sostenido⇒T1→T2",
     accOk, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — variety (types), qualitative + individual
  const diff = await page.evaluate((NOW) => {
    const win = 30000;
    const V = (marks) => window.__dev.erudition({ varietyProbe: { marks, now: NOW, windowMs: win } }).probe;
    return {
      // matar el MISMO tipo 8×: variety 1 ⇒ NO abre (OPUESTO a Focus, que concentraría en 1 objetivo y SÍ abriría)
      sameEight: V([{ k: "goblin", t: NOW - 7000 }, { k: "goblin", t: NOW - 6000 }, { k: "goblin", t: NOW - 5000 }, { k: "goblin", t: NOW - 4000 }, { k: "goblin", t: NOW - 3000 }, { k: "goblin", t: NOW - 2000 }, { k: "goblin", t: NOW - 1000 }, { k: "goblin", t: NOW }]),
      // abatir 4 tipos distintos ⇒ variety 4 (aunque sean pocas marcas) ⇒ abre — CUALITATIVO
      crossFour: V([{ k: "goblin", t: NOW - 3000 }, { k: "ogre", t: NOW - 2000 }, { k: "wraith", t: NOW - 1000 }, { k: "troll", t: NOW }]),
      // 1 solo jugador basta (individual): estas marcas son de UN pid
      loneThree: V([{ k: "goblin", t: NOW - 1000 }, { k: "ogre", t: NOW - 500 }, { k: "wraith", t: NOW }]),
    };
  }, NOW);
  ok("9 ★ DIFERENCIADOR: matar el MISMO tipo 8×⇒variety 1⇒NO abre (OPUESTO Focus concentración en 1 objetivo); abatir 4 tipos distintos⇒variety 4 (CUALITATIVO); 1 solo jugador basta (individual, 3 tipos⇒3)",
     diff.sameEight === 1 && diff.crossFour === 4 && diff.loneThree === 3, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.erudition({ clear: true, nowMs: NOW });
    window.__dev.erudition({ nowMs: NOW, self: "self", lore: 6, pid: "self", atMs: NOW, toZone: zone });
    const at0 = window.__dev.erudition({ nowMs: NOW, toZone: zone });          // lore 6 ⇒ T3
    const at25 = window.__dev.erudition({ nowMs: NOW + 25000, toZone: zone }); // +25s ⇒ lore 3 ⇒ T1
    return { base: at0.lore, baseT: at0.tier, dec: at25.lore, decT: at25.tier };
  }, NOW);
  ok("10 ★ DECAY determinista 0-RNG por VIDA-MEDIA: lore 6 (T3); +25s (1 half-life) ⇒ lore 3 (T1)",
     !decay.bad && near(decay.base, 6) && decay.baseT === 3 && near(decay.dec, 3, 0.02) && decay.decT === 1, JSON.stringify(decay));

  // 11 passive isolated (xpGain channel): in-zone lore≥umbral ⇒ boost>0 + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((NOW) => {
    const w = window.__lpick(4); if (!w) return { bad: true };                 // lore 4 ⇒ Tier 2 ⇒ boost 0.10
    const inz = window.__dev.erudition({ nowMs: NOW, toZone: w.zone });
    const out = window.__dev.erudition({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.xpGainMul, outBoost: out.boost, outTier: out.tier, outMul: out.xpGainMul };
  }, NOW);
  ok("11 PASSIVE individual (canal xpGain, aislado): héroe EN zona con lore≥umbral ⇒ boost==0.10 (T2) + tier≥1 + xpGainMul>0; leave (fuera de zona) ⇒ boost 0 + tier 0 + xpGainMul 0",
     !pass.bad && near(pass.inBoost, 0.10) && pass.inTier === 2 && near(pass.inMul, 0.10) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 12 ★ REUSED CHANNEL xpGain wired + XP MULTIPLY
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function eruditionMul/.test(simSrc) &&
    /n=Math\.round\(n\*\(1\+fellowMul\(h,"xpGain"\)\+eruditionMul\(h,"xpGain"\)\)\)/.test(simSrc) &&
    /if\(fellowMul\(h,"xpGain"\)>0\) return 0;/.test(simSrc);
  const xp = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };                 // lore 6 ⇒ T3 ⇒ boost 0.15
    window.__dev.erudition({ nowMs: NOW, toZone: w.zone });
    const on = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;    // paid = 1000·(1+0.15) = 1150
    window.__dev.erudition({ enabled: false });
    const off = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // OFF ⇒ eb 0 ⇒ paid == 1000·(1+fellow)
    const offTag = window.__dev.erudition().tag;
    window.__dev.erudition({ enabled: true });
    return { zone: w.zone, on, off, offTag };
  }, NOW);
  const xpOk = !xp.bad && xp.on && near(xp.on.eruditionBonus, 0.15) && xp.on.paid === 1150 &&
    xp.off && xp.off.eruditionBonus === 0 && xp.off.paid === Math.round(1000 * (1 + xp.off.fellowBonus)) && xp.offTag === "";
  ok("12 ★ CANAL REUSADO xpGain wired + MULTIPLICADOR DE XP: seam gainXP n·(1+fellow+erudition); T3 xpTick base 1000 ⇒ paid 1150 (+15%); OFF ⇒ eruditionBonus 0 ⇒ paid==base·(1+fellow) byte-id + tag \"\"",
     seamWired && xpOk, `wired=${seamWired} on=${JSON.stringify(xp.on)} off=${JSON.stringify(xp.off)} offTag="${xp.offTag}"`);

  // 13 ★ DE-STACK máximo-único: FELLOWSHIP forjado ⇒ eruditionMul cede a 0
  const dstack = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };                 // lore 6 ⇒ T3 ⇒ boost 0.15 (sin Hermandad)
    const zone = w.zone;
    window.__dev.erudition({ nowMs: NOW, toZone: zone });
    const before = window.__dev.erudition({ nowMs: NOW, toZone: zone });        // sin vínculo ⇒ eruditionMul 0.15, fellow 0
    // forja la Hermandad: snapshot base @NOW, luego bump kills grande ⇒ bond≥forgeTier ⇒ fellowMul(xpGain)>0
    window.__dev.fellowship({ enabled: true, nowMs: NOW });
    window.__dev.fellowship({ kill: { n: 100000 } });
    const fx = window.__dev.fellowship();                                       // fellowMulXp>0 ⇒ forjado
    const after = window.__dev.erudition({ nowMs: NOW, toZone: zone });         // MISMO lore/zona, PERO fellow forjado ⇒ eruditionMul CEDE a 0
    return { zone, beforeMul: before.xpGainMul, beforeFellow: before.fellowXpMul, fellowForged: fx.forged, fellowMulXp: fx.fellowMulXp, afterMul: after.xpGainMul, afterFellow: after.fellowXpMul };
  }, NOW);
  const dstackOk = !dstack.bad && near(dstack.beforeMul, 0.15) && dstack.beforeFellow === 0 &&   // sin Hermandad ⇒ ERUDITION aplica
    dstack.fellowForged === true && dstack.fellowMulXp > 0 &&                                    // Hermandad forjada
    dstack.afterMul === 0 && dstack.afterFellow > 0;                                             // ERUDITION cede ⇒ SÓLO fellow ≠0 (0 doble-dip)
  ok("13 ★ DE-STACK máximo-único: sin Hermandad ⇒ eruditionMul 0.15 (aplica); FELLOWSHIP forjado (fellowMul>0) ⇒ eruditionMul CEDE a 0 ⇒ SÓLO uno ≠0 (0 doble-dip, mirror FOCUS→KINSHIP)",
     dstackOk, JSON.stringify(dstack));
  // reset fellowship para no contaminar los checks siguientes
  await page.evaluate(() => window.__dev.fellowship({ enabled: false }));

  // 14 ★ ORTHOGONALITY xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__lpick(6); if (!w) return { bad: true };                 // lore 6 ⇒ T3 ⇒ boost 0.15
    const zone = w.zone;
    const a = window.__dev.erudition({ nowMs: NOW, toZone: zone });
    const xpBefore = a.xpGainMul, restedBefore = a.restedXpMult, goldBefore = a.goldFindMul, wardBefore = a.wardRegenMul, oocBefore = a.oocMitigMul, lootBefore = a.lootQualityFloor, critBefore = a.critBonusPct;
    // activa CONVOY (restedMult) + KINSHIP (goldFind) + WARD (wardRegen) + WAYFARER (oocMitigation) en la MISMA zona ⇒ SUS canales suben pero el xpGainMul NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }] }, toZone: zone });
    // re-inyecta el lore (los toZone de arriba no lo tocan, pero re-aseguramos)
    const b = window.__dev.erudition({ nowMs: NOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, xpBefore, restedBefore, goldBefore, wardBefore, oocBefore, lootBefore, critBefore,
      xpAfter: b.xpGainMul, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "xpGain" && near(orth.xpBefore, 0.15) &&
    near(orth.xpAfter, orth.xpBefore) &&                              // activar 4 pasivos NO cambia el xpGainMul (erudición ⊥ a todos)
    orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 &&  // KINSHIP/WARD/WAYFARER sí aportan en SUS canales (3 canales frescos independientes activos) y NO tocan xpGain
    near(orth.restedBefore, orth.restedAfter) &&                      // restedMult (Convoy — cede a fuentes ambientales del reloj) sin cambio por erudición (⊥)
    orth.lootBefore === orth.lootAfter && orth.critBefore === orth.critAfter;   // lootQuality + critChance intactos (⊥)
  ok("14 ★ ORTOGONALIDAD xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 doble-conteo): abrir erudición NO toca los otros; activar CONVOY/KINSHIP/WARD/WAYFARER NO cambia el xpGainMul; canal='xpGain'",
     orthOk, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: los 16 flags del arco siguen LIVE served; ERUDITION + DELVE served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const eruditionDark = flag("ERUDITION") === "false", delveDark = flag("DELVE") === "false";
  ok("15 ★ 0-REGRESIÓN: 16 flags del arco served enabled:true; ERUDITION served false (DARK #65); DELVE served false (DARK #64)",
     arcAllOn && eruditionDark && delveDark && arc.length === 16, `erudition=${flag("ERUDITION")} delve=${flag("DELVE")} arc=${JSON.stringify(arcLive)}`);

  // 16 ★ ERUDICIÓN en las 6 zonas
  const zonesRes = await page.evaluate((NOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    const zones = window.__dev.erudition().zones; const broken = [];
    for (const z of zones) {
      window.__dev.erudition({ clear: true, nowMs: NOW });
      const s = window.__dev.erudition({ nowMs: NOW, self: "self", lore: 6, pid: "self", atMs: NOW, toZone: z });
      if (!(s.zone === z && s.learnable && s.tier === 3 && Math.abs(s.boost - 0.15) < 1e-6 && s.xpGainMul > 0)) broken.push(z);
    }
    return { zones, broken };
  }, NOW);
  ok("16 ★ ERUDICIÓN 6 zonas: las 6 zonas de ERUDITION.zones hospedan el pasivo (lore≥6 ⇒ T3, boost 0.15, xpGainMul>0) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 17 render badge "Erudito:" drawn ON / not OFF + fps
  const badge = await page.evaluate(async (NOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Erudito:") >= 0) cnt++; return orig(t, x, y); };  // "Erudito:" (con colon) = ÚNICO de mi badge (la mejora meta t2_xpGain es "Erudición" sin colon)
    const w = window.__lpick(6);
    window.__dev.erudition({ nowMs: NOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.erudition({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, NOW);
  ok("17 render badge \"Erudito:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((NOW) => { const w = window.__lpick(6); window.__dev.erudition({ nowMs: NOW, toZone: w.zone }); }, NOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 18 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.erudition({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installLore(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.erudition({ enabled: true }).zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    // snapshot COMPARTIDO { A:{lore6}, B:{lore2}, P:{lore6} } @NOW; ambos clientes lo empujan idéntico
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.erudition({ enabled: true, self });
        window.__dev.erudition({ clear: true, nowMs: NOW });
        const s = window.__dev.erudition({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: { lore: 6, atMs: NOW }, B: { lore: 2, atMs: NOW }, P: { lore: 6, atMs: NOW },
        }, toZone: zone });
        return { self: s.self, lore: s.lore, tier: s.tier, boost: s.boost, nowMs: s.nowMs, map: s.loreMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: lore 6 (T3, boost 0.15), byte-idéntico
    const decayed = await readAs("P", 25);     // +25s ⇒ half-life ⇒ P lore 3 (T1, boost 0.05), converge
    // per-pid independence: A lee "A" (lore 6 T3), B lee "B" (lore 2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const push = { A: { lore: 6, atMs: NOW }, B: { lore: 2, atMs: NOW } };
      const rA = await page.evaluate(({ zone, NOW, push }) => { window.__dev.erudition({ enabled: true, self: "A" }); window.__dev.erudition({ clear: true, nowMs: NOW }); const s = window.__dev.erudition({ nowMs: NOW, self: "A", push, toZone: zone }); return { self: s.self, lore: s.lore, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, NOW, push });
      const rB = await pageB.evaluate(({ zone, NOW, push }) => { window.__dev.erudition({ enabled: true, self: "B" }); window.__dev.erudition({ clear: true, nowMs: NOW }); const s = window.__dev.erudition({ nowMs: NOW, self: "B", push, toZone: zone }); return { self: s.self, lore: s.lore, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, NOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ boost 0 (zone-gate) PERO loreMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.erudition({ leave: true }); return { boost: s.boost, mul: s.xpGainMul, tier: s.tier, map: s.loreMap, lore: s.lore }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.erudition({ nowMs: NOW, self: "B", toZone: zone }); return { boost: s.boost, tier: s.tier, lore: s.lore }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.lore, 6) && near(northStar.shared.a.boost, 0.15) &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.lore, 3, 0.02) && near(northStar.decayed.a.boost, 0.05) &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && near(northStar.indep.rA.boost, 0.15) && northStar.indep.rB.tier === 1 && near(northStar.indep.rB.boost, 0.05) &&
    northStar.aLeaves.boost === 0 && northStar.aLeaves.mul === 0 &&                    // A fuera de zona ⇒ boost 0
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&                   // loreMap server-authoritative INTACTO
    near(northStar.aLeaves.lore, 6) &&                                                // lore (per-pid A) sigue proyectado
    near(northStar.bIntact.boost, 0.05) && northStar.bIntact.tier === 1;              // B intacto (per-pid independiente)
  ok("18 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ lore/tier/boost byte-idénticos (P T3 boost.15, decae T1 boost.05); lore per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ boost=0 PERO loreMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aBoost: northStar.aLeaves.boost, bBoost: northStar.bIntact.boost, bTier: northStar.bIntact.tier, errB: errB.length }));

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
