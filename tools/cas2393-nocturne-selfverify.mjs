// CAS-2393/2394 — self-verify for NOCTURNE / CAZADOR NOCTURNO (DARK, NOCTURNE_HUNT.enabled:false). EVO mecánica #66 (serializa tras #65 ERUDITION LIVE) — EJE FRESCO + CANAL REUSADO, ⊥/OPUESTOS a #47-65.
// CAS-2394 (CEO decisión): repunte de canal goldFind→`vamp` (lifesteal). El EJE TEMPORAL es IDÉNTICO al build goldFind; SÓLO cambia el canal + su de-stack (precedencia máximo-único → SHARE-CAP con el Vampírico).
// (A) EJE FRESCO = FASE TEMPORAL / CAZA NOCTURNA (nº de kills hechos DE NOCHE en la ventana). server-authoritative, 0-RNG, INDIVIDUAL (per-pid): el PRIMER eje del arco anclado al RELOJ (fase día/noche), NO al espacio
//     (Delve/Trailcraft/Wayfarer), presa (Erudition) ni otros jugadores (Kinship/Focus). El server registra marcas de kill { pid → [{n,t}] } (n=1 si el kill cayó de NOCHE, derivado de la FASE del reloj COMPARTIDO en el
//     instante del kill, isNightAt(t)), computa `nightTally(marks,now,win)` = nº de marcas NOCTURNAS (n===1) en la ventana (PURA), y mientras tally≥minKills ACUMULA `nocturne` (accruePerSec·dt) con DECAY vida-media.
// (B) CANAL REUSADO = `vamp` (robo de vida / lifesteal por el chokepoint del golpe melee del héroe). De-stack por SHARE-CAP con el Vampírico existente (Sed de Sangre/afijo): lifesteal EFECTIVA = min(vampCap≤0.5, base+boost).
//
// ★ DIFERENCIADOR (checks 8/9, no-negociable): OPUESTO a Erudition (#65, DIVERSIDAD de presas). Matar el MISMO tipo N× de NOCHE ⇒ tally N ⇒ ABRE (Erudition NO abriría — exige tipos distintos). Cazar de DÍA (n=0) ⇒
// tally 0 ⇒ NUNCA abre (eje puramente TEMPORAL). INDIVIDUAL (1 solo jugador basta). Permanencia: 1-tick dt=0.5 con tally≥min ⇒ nocturne≈0.5 < 2 ⇒ Tier 0 (NO abre).
//
// ★ SHARE-CAP (check 13, no-negociable): la lifesteal EFECTIVA del seam melee = min(vampCap≤0.5, baseLifesteal + boostNocturno). base 0 ⇒ eff = boost (Nocturne aplica solo); base alto ⇒ SUMA capada al techo (0 doble-dip más
// allá del cap). OFF ⇒ nv 0 ⇒ eff===base (byte-id). ★ ORTOGONALIDAD (check 14): abrir caza nocturna (vampMul≠0) NO cambia goldFind/restedMult/xpGain/wardRegen/oocMitigation/lootQuality/critChance.
//
// North Star (check 18, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→noct} + MISMO reloj (nowMs) ⇒ ven noct + tier + boost IDÉNTICOS byte-a-byte (0 desync).
// El acumulador decae por vida-media CONVERGE. El noct es per-JUGADOR: A y B leen noct INDEPENDIENTES del MISMO snapshot; A SALE de la zona ⇒ su boost cae a 0 (zone-gate) PERO el noctMap server-auth + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.nocturne (flip NOCTURNE_HUNT.enabled IN-MEMORY + inyección snapshot {pid→noct} / marks / kills / step / tallyProbe / phaseProbe + phaseOverride/nowMs/self/toZone/leave drivers + vampHit para el seam melee lifesteal)
// + __dev.kinship + __dev.focus (goldFind — ahora ⊥) + __dev.convoy (restedMult) + __dev.fellowship (xpGain) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Nocturno:").
//
// Checks:
//   1  boots to play, __dev.nocturne + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): NOCTURNE_HUNT.enabled false AND G.nocturne NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'nocturne'/'nocturneServer'/'nocturneMarks' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ TALLY = función PURA (nightTally vía tallyProbe): 1 marca noche⇒1; N noche⇒N; marcas de DÍA (n=0)⇒0; marca fuera de ventana⇒excluida.
//   6  TABLA de tiers = función PURA del NOCTURNE (acumulador): noct→tier (1→T0,2→T1,4→T2,6→T3) + boost (0/.06/.12/.20) determinista.
//   7  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→noct} reflejado + DECAY half-life determinista (0-RNG) al proyectar el reloj.
//   8  ★ ACUMULADOR = función del TALLY (step): kills de DÍA (tally 0)⇒add 0 (nunca abre, TEMPORAL); kills de NOCHE sostenidos⇒acumula; 1-tick dt=0.5⇒noct ínfimo < 2 (permanencia).
//   9  ★ DIFERENCIADOR: matar el MISMO tipo de NOCHE⇒tally sube⇒abre (OPUESTO Erudition); cazar de DÍA⇒tally 0⇒NO abre (TEMPORAL); derivación de fase isNightAt PURA (override 0.9⇒noche, 0.5⇒día, 0.1⇒noche).
//  10  ★ DECAY determinista 0-RNG por VIDA-MEDIA: noct 6 (T3); avanzar `now` +25s (halfLife) ⇒ noct 3 (T1). Reloj compartido.
//  11  PASSIVE individual (canal vamp): noct≥umbral + héroe EN zona de caza ⇒ vampMul>0 + tier≥1; leave (fuera de zona) ⇒ vampMul 0 + tier 0.
//  12  ★ CANAL REUSADO vamp wired + SEAM MELEE LIFESTEAL: seam hitEnemy eff=min(vampCap, base+nocturne); vampHit dmg+base=0 ⇒ eff==boost + heal==round(dmg·boost) abierto; OFF ⇒ eff==base ⇒ byte-id.
//  13  ★ SHARE-CAP con el Vampírico: base 0 ⇒ eff=boost (Nocturne solo); base bajo ⇒ eff=base+boost; base alto ⇒ eff=vampCap (SUMA capada, capped=true, 0 doble-dip más allá del techo).
//  14  ★ ORTOGONALIDAD vamp ⊥ goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 doble-conteo): abrir caza nocturna NO cambia los otros; activar KINSHIP/CONVOY/FELLOWSHIP/WARD/WAYFARER NO cambia el vampMul.
//  15  ★ 0-REGRESIÓN: los 18 flags del arco ya LIVE siguen served enabled:true; NOCTURNE_HUNT served false (DARK #66).
//  16  ★ NOCTURNE 6 zonas: el pasivo aplica en las 6 zonas de NOCTURNE_HUNT.zones (noct≥6 ⇒ T3, vampMul>0) broken=[].
//  17  render badge "Nocturno:" se DIBUJA con la feature ON (ctx.fillText "Nocturno:" count>0) y NO con OFF (count 0) + fps.
//  18  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ noct/tier/boost IDÉNTICOS byte-a-byte; el acumulador decae CONVERGE; noct per-pid (A vs B independientes); A sale de zona ⇒ boost=0 PERO noctMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2393-nocturne-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2393");
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
async function installNoct(page) {
  await page.evaluate((NOW) => {
    window.__NNOW = NOW;
    // fija marcas de kill DIRECTAS (n explícito) para un pid (CLEAR antes ⇒ snapshot limpio). Prueba tally/diferenciadores.
    window.__nmarks = (pid, marks) => { window.__dev.nocturne({ clear: true, nowMs: window.__NNOW }); window.__dev.nocturne({ nowMs: window.__NNOW, self: pid, marks: { [pid]: marks } }); };
    // inyecta kills (timestamps) con una FASE forzada (night bool) ⇒ el server deriva n=isNightAt(t) del override. CLEAR antes.
    window.__nkills = (pid, ts, night) => { window.__dev.nocturne({ clear: true, nowMs: window.__NNOW, phaseOverride: (night ? 0.9 : 0.5) }); window.__dev.nocturne({ nowMs: window.__NNOW, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    // corre un STEP de acumulación (tally→accrue) con dt para un pid (usa las marcas ya fijadas)
    window.__nstep = (pid, dt) => window.__dev.nocturne({ nowMs: window.__NNOW, self: pid, step: { [pid]: { dt } } });
    // empuja el nocturne crudo (acumulador) de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__noct = (pid, noct) => { window.__dev.nocturne({ clear: true, nowMs: window.__NNOW }); window.__dev.nocturne({ nowMs: window.__NNOW, self: pid, noct, pid, atMs: window.__NNOW }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el snapshot (decay half-life)
    window.__nat = (elapsedSec) => window.__dev.nocturne({ nowMs: window.__NNOW + (elapsedSec || 0) * 1000 });
    // inyecta `noct` para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (huntable + zona coincide).
    window.__npick = (noct) => {
      window.__dev.nocturne({ enabled: true, self: "self" });
      const zones = window.__dev.nocturne().zones || [];
      for (const z of zones) {
        window.__dev.nocturne({ clear: true, nowMs: window.__NNOW });
        const s = window.__dev.nocturne({ nowMs: window.__NNOW, self: "self", noct, pid: "self", atMs: window.__NNOW, toZone: z });
        if (s.zone === z && s.huntable) return { zone: z, noct: s.noct, tier: s.tier, boost: s.boost, vampMul: s.vampMul };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.nocturne && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.fellowship && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.nocturne + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.nocturne never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.nocturne());
  ok("2 byte-id OFF (fresh boot): NOCTURNE_HUNT.enabled false AND G.nocturne NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.noct === 0 && dark.boost === 0 && dark.vampMul === 0 && dark.channel === "vamp" && dark.tag === "" && dark.noctMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} noct=${dark.noct} boost=${dark.boost} vampMul=${dark.vampMul} channel=${dark.channel} tag="${dark.tag}" map=${JSON.stringify(dark.noctMap)}`);

  // 3 save OFF has no 'nocturne'/'nocturneServer'/'nocturneMarks' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'nocturne'/'nocturneServer'/'nocturneMarks' key in save blob (estado 100% derivado/transitorio)", !/"nocturne(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.nocturne({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.nocturne({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installNoct(page);

  // 5 ★ tally = pure fn (nightTally via probe)
  const pr = await page.evaluate((NOW) => {
    window.__dev.nocturne({ enabled: true });
    const win = 30000;
    const T = (marks, now) => window.__dev.nocturne({ tallyProbe: { marks, now: (now == null ? NOW : now), windowMs: win } }).probe;
    return {
      one:    T([{ n: 1, t: NOW }]),                                                    // 1 marca noche ⇒ 1
      night4: T([{ n: 1, t: NOW - 3000 }, { n: 1, t: NOW - 2000 }, { n: 1, t: NOW - 1000 }, { n: 1, t: NOW }]),  // 4 noche ⇒ 4
      day:    T([{ n: 0, t: NOW - 2000 }, { n: 0, t: NOW - 1000 }, { n: 0, t: NOW }]),   // 3 de DÍA (n=0) ⇒ 0
      mixed:  T([{ n: 1, t: NOW - 2000 }, { n: 0, t: NOW - 1000 }, { n: 1, t: NOW }]),   // 2 noche + 1 día ⇒ 2
      expire: T([{ n: 1, t: NOW - 40000 }, { n: 1, t: NOW }]),                           // 1 fuera de ventana (40s>30s) + 1 dentro ⇒ 1
    };
  }, NOW);
  ok("5 ★ TALLY = función PURA (nightTally): 1 noche⇒1; 4 noche⇒4; 3 de DÍA (n=0)⇒0; mixto 2n+1d⇒2; 1 fuera de ventana⇒excluida (⇒1)",
     pr.one === 1 && pr.night4 === 4 && pr.day === 0 && pr.mixed === 2 && pr.expire === 1, JSON.stringify(pr));

  // 6 tier table = pure fn of NOCTURNE (accumulator)
  const tab = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6]) {
      window.__dev.nocturne({ clear: true, nowMs: NOW });
      const s = window.__dev.nocturne({ nowMs: NOW, self: "self", noct: c, pid: "self", atMs: NOW, toZone: zone });
      out.push({ c, noct: s.noct, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, NOW);
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3 };
  const expBoost = { 1: 0, 2: 0.06, 4: 0.12, 6: 0.20 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.noct, r.c) && r.tier === expTier[r.c] && near(r.boost, expBoost[r.c]));
  ok("6 TABLA de tiers = función PURA del NOCTURNE: noct→tier (1→T0,2→T1,4→T2,6→T3) + boost (0/.06/.12/.20) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + project (half-life decay)
  const refl = await page.evaluate((NOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    window.__dev.nocturne({ clear: true, nowMs: NOW });
    window.__dev.nocturne({ nowMs: NOW, self: "self", push: { self: { noct: 8, atMs: NOW }, other: { noct: 4, atMs: NOW } } });
    const at0 = window.__dev.nocturne({ nowMs: NOW });                       // noct 8 (self), 4 (other) proyectados sin decay (dt 0)
    const at25 = window.__dev.nocturne({ nowMs: NOW + 25000 });              // +25s = 1 half-life ⇒ self 4, other 2
    return { self0: at0.noctMap && at0.noctMap.self, other0: at0.noctMap && at0.noctMap.other, self25: at25.noctMap && at25.noctMap.self, other25: at25.noctMap && at25.noctMap.other };
  }, NOW);
  const reflOk = near(refl.self0, 8) && near(refl.other0, 4) && near(refl.self25, 4, 0.02) && near(refl.other25, 2, 0.02);
  ok("7 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→noct} reflejado; DECAY half-life 0-RNG (+25s=1 vida-media ⇒ 8→4, 4→2)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of TALLY (step): day kills ⇒ add 0 (never opens); night sustained ⇒ accrues; 1-tick ⇒ tiny (permanence)
  const acc = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };
    const zone = w.zone;
    // cazar de DÍA: 5 kills n=0 ⇒ tally 0 < minKills(3) ⇒ step add 0 ⇒ noct 0 (nunca abre, TEMPORAL)
    window.__nkills("self", [NOW - 4000, NOW - 3000, NOW - 2000, NOW - 1000, NOW], false);
    window.__dev.nocturne({ toZone: zone });
    const day = window.__nstep("self", 5);   // snapshot: dt grande, pero tally 0 ⇒ add 0 ⇒ noct 0/T0
    // cazar de NOCHE: 4 kills n=1 ⇒ tally 4 ≥ 3 ⇒ 1-tick dt=0.5 ⇒ noct≈0.5 < 2 ⇒ Tier 0 (permanencia)
    window.__nkills("self", [NOW - 3000, NOW - 2000, NOW - 1000, NOW], true);
    window.__dev.nocturne({ toZone: zone });
    const tick1 = window.__nstep("self", 0.5);
    // sostenido: acumula hasta abrir (dt=1.5 ⇒ noct≈2 ⇒ T1; +dt=2 ⇒ noct≈4 ⇒ T2)
    const s2 = window.__nstep("self", 1.5);   // noct ≈ 0.5+1.5 = 2 ⇒ T1
    const s3 = window.__nstep("self", 2);     // noct ≈ 4 ⇒ T2
    return { zone, dayNoct: day.noct, dayTier: day.tier, tick1Noct: tick1.noct, tick1Tier: tick1.tier, s2Noct: s2.noct, s2Tier: s2.tier, s3Noct: s3.noct, s3Tier: s3.tier };
  }, NOW);
  const accOk = !acc.bad && near(acc.dayNoct || 0, 0) && acc.dayTier === 0 &&                  // de día ⇒ tally 0 ⇒ nunca acumula
    acc.tick1Noct > 0 && acc.tick1Noct < 2 && acc.tick1Tier === 0 &&                           // 1-tick dt=0.5 noche ⇒ noct ínfimo ⇒ T0 (permanencia)
    acc.s2Tier >= 1 && acc.s3Tier >= 2;                                                        // sostenido ⇒ abre + sube
  ok("8 ★ ACUMULADOR = función del TALLY (step): 5 kills de DÍA (tally 0)⇒noct 0/T0 (nunca abre, TEMPORAL); 4 kills de NOCHE 1-tick dt=0.5⇒noct<2⇒T0 (permanencia); sostenido⇒T1→T2",
     accOk, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — temporal phase, same-type at night opens, day never
  const diff = await page.evaluate((NOW) => {
    const win = 30000;
    const T = (marks) => window.__dev.nocturne({ tallyProbe: { marks, now: NOW, windowMs: win } }).probe;
    // matar el MISMO tipo 8× de NOCHE (todas n=1) ⇒ tally 8 ⇒ ABRE (OPUESTO a Erudition, que exigiría tipos distintos y NO abriría)
    const sameNight8 = T([...Array(8)].map((_, i) => ({ n: 1, t: NOW - i * 1000 })));
    // cazar de DÍA (todas n=0), incluso muchos kills ⇒ tally 0 ⇒ NO abre (eje TEMPORAL)
    const day8 = T([...Array(8)].map((_, i) => ({ n: 0, t: NOW - i * 1000 })));
    // derivación de fase isNightAt PURA (override): 0.9⇒noche, 0.5⇒día, 0.1⇒noche (envuelve medianoche)
    const p9 = window.__dev.nocturne({ phaseOverride: 0.9, phaseProbe: NOW }).phaseProbe;
    const p5 = window.__dev.nocturne({ phaseOverride: 0.5, phaseProbe: NOW }).phaseProbe;
    const p1 = window.__dev.nocturne({ phaseOverride: 0.1, phaseProbe: NOW }).phaseProbe;
    window.__dev.nocturne({ phaseOverride: null });
    return { sameNight8, day8, p9: p9.night, p5: p5.night, p1: p1.night };
  }, NOW);
  ok("9 ★ DIFERENCIADOR: matar el MISMO tipo 8× de NOCHE⇒tally 8⇒ABRE (OPUESTO Erudition variedad); cazar de DÍA 8×⇒tally 0⇒NO abre (TEMPORAL); fase isNightAt PURA (0.9⇒noche, 0.5⇒día, 0.1⇒noche)",
     diff.sameNight8 === 8 && diff.day8 === 0 && diff.p9 === true && diff.p5 === false && diff.p1 === true, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.nocturne({ clear: true, nowMs: NOW });
    window.__dev.nocturne({ nowMs: NOW, self: "self", noct: 6, pid: "self", atMs: NOW, toZone: zone });
    const at0 = window.__dev.nocturne({ nowMs: NOW, toZone: zone });          // noct 6 ⇒ T3
    const at25 = window.__dev.nocturne({ nowMs: NOW + 25000, toZone: zone }); // +25s ⇒ noct 3 ⇒ T1
    return { base: at0.noct, baseT: at0.tier, dec: at25.noct, decT: at25.tier };
  }, NOW);
  ok("10 ★ DECAY determinista 0-RNG por VIDA-MEDIA: noct 6 (T3); +25s (1 half-life) ⇒ noct 3 (T1)",
     !decay.bad && near(decay.base, 6) && decay.baseT === 3 && near(decay.dec, 3, 0.02) && decay.decT === 1, JSON.stringify(decay));

  // 11 passive isolated (vamp channel): in-zone noct≥threshold ⇒ vampMul>0 + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((NOW) => {
    const w = window.__npick(4); if (!w) return { bad: true };                 // noct 4 ⇒ Tier 2 ⇒ boost 0.12 (lifesteal)
    const inz = window.__dev.nocturne({ nowMs: NOW, toZone: w.zone });
    const out = window.__dev.nocturne({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.vampMul, outBoost: out.boost, outTier: out.tier, outMul: out.vampMul };
  }, NOW);
  ok("11 PASSIVE individual (canal vamp, aislado): héroe EN zona con noct≥umbral ⇒ boost==0.12 (T2) + tier≥1 + vampMul>0; leave (fuera de zona) ⇒ boost 0 + tier 0 + vampMul 0",
     !pass.bad && near(pass.inBoost, 0.12) && pass.inTier === 2 && near(pass.inMul, 0.12) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 12 ★ REUSED CHANNEL vamp wired + MELEE LIFESTEAL SEAM
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function nocturneMul/.test(simSrc) &&
    /function nocturneVampSteal\(h, base\)/.test(simSrc) &&
    /const eff=nocturneVampSteal\(h, bb\.lifesteal\|\|0\);/.test(simSrc) &&                       // el seam melee usa la lifesteal EFECTIVA (share-cap)
    /const gf=kinshipMul\(h,"goldFind"\)\+focusMul\(h,"goldFind"\); if\(gf>0\)/.test(simSrc) &&    // goldFind YA NO referencia nocturne (repunte CAS-2394)
    !/nocturneMul\(h,"goldFind"\)/.test(simSrc);                                                   // 0 rastro de nocturne en goldFind
  const vamp = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };                 // noct 6 ⇒ T3 ⇒ boost 0.20 (lifesteal)
    window.__dev.nocturne({ nowMs: NOW, toZone: w.zone });
    const on = window.__dev.nocturne({ vampHit: { dmg: 1000, base: 0 } }).vampHit;   // eff=min(0.5, 0+0.20)=0.20 ⇒ heal round(1000·0.20)=200
    window.__dev.nocturne({ enabled: false });
    const off = window.__dev.nocturne({ vampHit: { dmg: 1000, base: 0.3 } }).vampHit; // OFF ⇒ nv 0 ⇒ eff===base 0.3 (byte-id) ⇒ heal round(1000·0.3)=300
    const offTag = window.__dev.nocturne().tag;
    window.__dev.nocturne({ enabled: true });
    return { zone: w.zone, on, off, offTag };
  }, NOW);
  const vampOk = !vamp.bad && vamp.on && near(vamp.on.nocturneBonus, 0.20) && near(vamp.on.eff, 0.20) && vamp.on.heal === 200 && vamp.on.capped === false &&
    vamp.off && vamp.off.nocturneBonus === 0 && near(vamp.off.eff, 0.3) && vamp.off.heal === 300 && vamp.offTag === "";
  ok("12 ★ CANAL REUSADO vamp wired + SEAM MELEE LIFESTEAL: seam hitEnemy eff=min(vampCap, base+nocturne); T3 vampHit dmg1000 base0 ⇒ eff 0.20 heal 200; OFF ⇒ nocturneBonus 0 ⇒ eff===base 0.3 heal 300 byte-id + tag \"\"",
     seamWired && vampOk, `wired=${seamWired} on=${JSON.stringify(vamp.on)} off=${JSON.stringify(vamp.off)} offTag="${vamp.offTag}"`);

  // 13 ★ SHARE-CAP con el Vampírico existente: eff = min(vampCap≤0.5, baseLifesteal + boostNocturno)
  const scap = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };                 // noct 6 ⇒ T3 ⇒ boost 0.20
    const zone = w.zone;
    window.__dev.nocturne({ nowMs: NOW, toZone: zone });
    const cap = window.__dev.nocturne().vampCap;
    const hit = (base) => window.__dev.nocturne({ vampHit: { dmg: 1000, base } }).vampHit;
    return {
      zone, cap,
      solo:  hit(0),      // base 0 ⇒ Nocturne SOLO ⇒ eff 0.20 (no capped)
      add:   hit(0.1),    // base 0.1 + 0.20 = 0.30 < cap ⇒ eff 0.30 (suma, no capped)
      cap45: hit(0.45),   // base 0.45 + 0.20 = 0.65 > cap ⇒ eff = cap 0.50 (SUMA capada, capped=true — 0 doble-dip)
      cap50: hit(0.5),    // base ya en cap ⇒ Nocturne no añade ⇒ eff 0.50 (capped)
    };
  }, NOW);
  const scapOk = !scap.bad && near(scap.cap, 0.5) &&
    near(scap.solo.eff, 0.20) && scap.solo.capped === false && scap.solo.heal === 200 &&
    near(scap.add.eff, 0.30) && scap.add.capped === false && scap.add.heal === 300 &&
    near(scap.cap45.eff, 0.50) && scap.cap45.capped === true && scap.cap45.heal === 500 &&        // NO 0.65 ⇒ no double-dip
    near(scap.cap50.eff, 0.50) && scap.cap50.capped === true;                                     // base ya en cap ⇒ Nocturne no añade
  ok("13 ★ SHARE-CAP con Vampírico: base0⇒eff 0.20 (Nocturne solo); base0.1⇒eff 0.30 (suma); base0.45+0.20⇒eff CAPADO a 0.50 (NO 0.65, capped=true, 0 doble-dip); base0.5⇒eff 0.50 (Nocturne no añade)",
     scapOk, JSON.stringify(scap));

  // 14 ★ ORTHOGONALITY vamp ⊥ goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };                 // noct 6 ⇒ T3 ⇒ vampMul 0.20
    const zone = w.zone;
    const a = window.__dev.nocturne({ nowMs: NOW, toZone: zone });
    const vampBefore = a.vampMul, goldBefore = a.goldFindMul, restedBefore = a.restedXpMult, xpBefore = a.xpGainMul, wardBefore = a.wardRegenMul, oocBefore = a.oocMitigMul, lootBefore = a.lootQualityFloor, critBefore = a.critBonusPct;
    // activa KINSHIP (goldFind) + CONVOY (restedMult) + FELLOWSHIP (xpGain) + WARD (wardRegen) + WAYFARER (oocMitigation) ⇒ SUS canales suben pero el vampMul (nocturne) NO cambia (⊥; repunte CAS-2394 ⇒ goldFind ahora AJENO)
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.fellowship({ enabled: true, nowMs: NOW }); window.__dev.fellowship({ kill: { n: 100000 } });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }] }, toZone: zone });
    const b = window.__dev.nocturne({ nowMs: NOW, toZone: zone });
    window.__dev.kinship({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.fellowship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, vampBefore, goldBefore, restedBefore, xpBefore, wardBefore, oocBefore, lootBefore, critBefore,
      vampAfter: b.vampMul, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, xpAfter: b.xpGainMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "vamp" && near(orth.vampBefore, 0.20) &&
    near(orth.vampAfter, orth.vampBefore) &&                          // activar 5 pasivos NO cambia el vampMul (nocturne ⊥ a todos)
    orth.goldAfter > 0 && orth.xpAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 &&   // KINSHIP(goldFind)/FELLOWSHIP/WARD/WAYFARER sí aportan en SUS canales y NO tocan vamp
    orth.goldBefore === 0 &&                                          // sin KINSHIP ⇒ goldFind 0 (nocturne ya NO lo alimenta, repunte CAS-2394)
    near(orth.restedBefore, orth.restedAfter) &&                      // restedMult (Convoy — cede a fuentes ambientales) sin cambio por nocturne (⊥)
    orth.lootBefore === orth.lootAfter && orth.critBefore === orth.critAfter;   // lootQuality + critChance intactos (⊥)
  ok("14 ★ ORTOGONALIDAD vamp ⊥ goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 doble-conteo): abrir caza nocturna NO toca los otros; activar KINSHIP/CONVOY/FELLOWSHIP/WARD/WAYFARER NO cambia el vampMul; canal='vamp'; goldFind SIN nocturne (0 antes de KINSHIP)",
     orthOk, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: los 18 flags del arco siguen LIVE served; NOCTURNE served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["ERUDITION", "DELVE", "TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const nocturneDark = flag("NOCTURNE_HUNT") === "false";
  ok("15 ★ 0-REGRESIÓN: 18 flags del arco served enabled:true; NOCTURNE_HUNT served false (DARK #66)",
     arcAllOn && nocturneDark && arc.length === 18, `nocturne=${flag("NOCTURNE_HUNT")} arc=${JSON.stringify(arcLive)}`);

  // 16 ★ NOCTURNE en las 6 zonas
  const zonesRes = await page.evaluate((NOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    const zones = window.__dev.nocturne().zones; const broken = [];
    for (const z of zones) {
      window.__dev.nocturne({ clear: true, nowMs: NOW });
      const s = window.__dev.nocturne({ nowMs: NOW, self: "self", noct: 6, pid: "self", atMs: NOW, toZone: z });
      if (!(s.zone === z && s.huntable && s.tier === 3 && Math.abs(s.boost - 0.20) < 1e-6 && s.vampMul > 0)) broken.push(z);
    }
    return { zones, broken };
  }, NOW);
  ok("16 ★ NOCTURNE 6 zonas: las 6 zonas de NOCTURNE_HUNT.zones hospedan el pasivo (noct≥6 ⇒ T3, boost 0.20, vampMul>0) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 17 render badge "Nocturno:" drawn ON / not OFF + fps
  const badge = await page.evaluate(async (NOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Nocturno:") >= 0) cnt++; return orig(t, x, y); };  // "Nocturno:" (con colon) = ÚNICO de mi badge
    const w = window.__npick(6);
    window.__dev.nocturne({ nowMs: NOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.nocturne({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, NOW);
  ok("17 render badge \"Nocturno:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((NOW) => { const w = window.__npick(6); window.__dev.nocturne({ nowMs: NOW, toZone: w.zone }); }, NOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 18 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.nocturne({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installNoct(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.nocturne({ enabled: true }).zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.nocturne({ enabled: true, self });
        window.__dev.nocturne({ clear: true, nowMs: NOW });
        const s = window.__dev.nocturne({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: { noct: 6, atMs: NOW }, B: { noct: 2, atMs: NOW }, P: { noct: 6, atMs: NOW },
        }, toZone: zone });
        return { self: s.self, noct: s.noct, tier: s.tier, boost: s.boost, nowMs: s.nowMs, map: s.noctMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: noct 6 (T3, boost 0.20), byte-idéntico
    const decayed = await readAs("P", 25);     // +25s ⇒ half-life ⇒ P noct 3 (T1, boost 0.06), converge
    // per-pid independence: A lee "A" (noct 6 T3), B lee "B" (noct 2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const push = { A: { noct: 6, atMs: NOW }, B: { noct: 2, atMs: NOW } };
      const rA = await page.evaluate(({ zone, NOW, push }) => { window.__dev.nocturne({ enabled: true, self: "A" }); window.__dev.nocturne({ clear: true, nowMs: NOW }); const s = window.__dev.nocturne({ nowMs: NOW, self: "A", push, toZone: zone }); return { self: s.self, noct: s.noct, tier: s.tier, boost: s.boost, map: s.noctMap }; }, { zone, NOW, push });
      const rB = await pageB.evaluate(({ zone, NOW, push }) => { window.__dev.nocturne({ enabled: true, self: "B" }); window.__dev.nocturne({ clear: true, nowMs: NOW }); const s = window.__dev.nocturne({ nowMs: NOW, self: "B", push, toZone: zone }); return { self: s.self, noct: s.noct, tier: s.tier, boost: s.boost, map: s.noctMap }; }, { zone, NOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ boost 0 (zone-gate) PERO noctMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.nocturne({ leave: true }); return { boost: s.boost, mul: s.vampMul, tier: s.tier, map: s.noctMap, noct: s.noct }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.nocturne({ nowMs: NOW, self: "B", toZone: zone }); return { boost: s.boost, tier: s.tier, noct: s.noct }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.noct, 6) && near(northStar.shared.a.boost, 0.20) &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.noct, 3, 0.02) && near(northStar.decayed.a.boost, 0.06) &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && near(northStar.indep.rA.boost, 0.20) && northStar.indep.rB.tier === 1 && near(northStar.indep.rB.boost, 0.06) &&
    northStar.aLeaves.boost === 0 && northStar.aLeaves.mul === 0 &&                    // A fuera de zona ⇒ boost 0
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&                   // noctMap server-authoritative INTACTO
    near(northStar.aLeaves.noct, 6) &&                                                // noct (per-pid A) sigue proyectado
    near(northStar.bIntact.boost, 0.06) && northStar.bIntact.tier === 1;              // B intacto (per-pid independiente)
  ok("18 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ noct/tier/boost byte-idénticos (P T3 boost.20, decae T1 boost.06); noct per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ boost=0 PERO noctMap + Δ_B INTACTOS (0 desync)",
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
