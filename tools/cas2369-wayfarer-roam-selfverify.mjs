// CAS-2369 — GE self-verify for TROTAMUNDOS / WAYFARER (DARK, WAYFARER_ROAM.enabled:false). EVO mecánica #61 — EJE FRESCO + CANAL FRESCO, ambos OPUESTOS/⊥ a #60 Kinship y a todo #47-60.
// (A) EJE FRESCO = AMPLITUD DE EXPLORACIÓN INDIVIDUAL (roaming breadth). server-authoritative, 0-RNG: por JUGADOR (pid) el server registra su POSICIÓN como una CELDA coarse con marca de tiempo y
//     cuenta el nº de CELDAS DISTINTAS ocupadas dentro de una VENTANA temporal DESLIZANTE [now−windowSec, now]. `wayRoamBreadth(marks,now,win)` PURA. Decay = EXPIRACIÓN de ventana (0-RNG).
// (B) CANAL PASIVO FRESCO = `oocMitigation` (mitigación de daño FUERA DE COMBATE) — el arco saturó restedMult (XP), wardRegen/soulRecovery (HP), goldFind (oro); #61 abre un CUARTO canal en el sink
//     damageHero: un golpe FUERA de combate (h._roamCombatT<=0) se MITIGA por wayRoamMul; ese golpe ARMA la ventana de combate ⇒ los siguientes NO se mitigan. DESACOPLADO del movimiento (no toca velocidad).
//
// ★ DIFERENCIADOR (checks 5/9, no-negociable): 1 jugador SOLO basta (individual); quedarse QUIETO ⇒ 1 sola celda ⇒ breadth 1 < 2 ⇒ NO abre (OPUESTO a Kinship, que premia quedarse junto a otro); cruzar
// muchas celdas DISTINTAS ⇒ SÍ (sin importar dirección ⇒ círculos cuentan ⇒ ≠ Convoy); patrullar 1 celda ⇒ NO. NO es sobre otros jugadores/ángulos (≠ Cong/Warding) ni llegar a una zona (≠ Influx).
//
// ★ ORTOGONALIDAD (check 13, no-negociable): abrir un roam (oocMitigMul>0) NO cambia restedXpMult/goldFindMul/wardRegenMul; activar restedMult (CONVOY)/goldFind (KINSHIP)/wardRegen (WARD) NO cambia oocMitigMul.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→marks} + MISMO reloj (nowMs) ⇒ ven breadth + tier + mit IDÉNTICOS byte-a-byte
// (0 desync). La ventana deslizante decae CONVERGE. El breadth es per-JUGADOR: A (self="A") y B (self="B") leen breadth INDEPENDIENTES del MISMO snapshot; A SALE de la zona ⇒ su Δ cae a 0 (zone-gate) PERO el breadthMap server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.wayfarerRoam (flip WAYFARER_ROAM.enabled IN-MEMORY + inyección snapshot {pid→marks} / path / breadthProbe + nowMs/self/toZone/leave drivers + hurtTick para el seam oocMitigation)
// + __dev.convoy (restedMult) + __dev.kinship (goldFind) + __dev.ward (wardRegen) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Trotamundos").
//
// Checks:
//   1  boots to play, __dev.wayfarerRoam + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): WAYFARER_ROAM.enabled false AND G.wayRoam NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'wayRoam'/'wayRoamServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ BREADTH = función PURA (wayRoamBreadth vía breadthProbe): 1 marca⇒1; N misma celda (quieto)⇒1; K distintas⇒K; marca fuera de ventana⇒excluida.
//   6  TABLA de tiers = función PURA del BREADTH: breadth→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + mit (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→marks} reflejado; marcas fuera de ventana PODADAS (no cuentan).
//   8  ★ ACUMULADOR = función de las POSICIONES (path): quieto (misma celda ×N)⇒breadth 1; cruzar 4 celdas distintas⇒breadth 4 = celdas coarse distintas.
//   9  ★ DIFERENCIADOR: 1 solo basta (individual); QUIETO 1 celda⇒breadth 1⇒NO abre (OPUESTO a Kinship); cruzar 3 celdas⇒T2 abre; círculo cubriendo celdas⇒abre (≠Convoy sin dirección).
//  10  ★ DECAY determinista 0-RNG por EXPIRACIÓN de ventana: breadth 4 (T3) con marcas escalonadas; avanzar `now` +5s ⇒ 2 más viejas expiran ⇒ breadth 2 (T1). Ventana deslizante.
//  11  PASSIVE individual (canal oocMitigation): breadth≥umbral + héroe EN zona de caza ⇒ oocMitigMul==mit del tier + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0.
//  12  ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE: seam damageHero ⇒ real=max(1,real*(1-wayRoamMul)) gated por h._roamCombatT; hurtTick fuera de combate ⇒ applied=raw*(1-mit); EN combate ⇒ applied=raw (full); OFF ⇒ mul 0.
//  13  ★ ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 doble-conteo): abrir roam NO cambia los otros; activar CONVOY/KINSHIP/WARD NO cambia oocMitigMul.
//  14  ★ 0-REGRESIÓN: los 12 flags del arco ya LIVE siguen served enabled:true; WAYFARER_ROAM served false (DARK #61).
//  15  ★ ROAM 6 zonas: el pasivo aplica en las 6 zonas de WAYFARER_ROAM.zones (breadth≥4 ⇒ T3) broken=[].
//  16  render badge "Trotamundos" se DIBUJA con la feature ON (ctx.fillText "Trotamundos" count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ breadth/tier/mit IDÉNTICOS byte-a-byte; ventana decae CONVERGE; breadth per-pid (A vs B independientes); A sale de zona ⇒ Δ_A=0 PERO breadthMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2369-wayfarer-roam-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2369");
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

const NOW = 9600000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installWay(page) {
  await page.evaluate((NOW) => {
    window.__WNOW = NOW;
    // construye `n` marcas de CELDAS DISTINTAS, todas @NOW (dentro de ventana ⇒ breadth==n exacto)
    window.__marks = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ c: i + ",0", t: (t == null ? window.__WNOW : t) }); return out; };
    // empuja marcas para un pid (CLEAR antes ⇒ snapshot limpio). Prueba breadth/diferenciadores.
    window.__wpush = (pid, marks) => { window.__dev.wayfarerRoam({ clear: true, nowMs: window.__WNOW }); window.__dev.wayfarerRoam({ nowMs: window.__WNOW, self: pid, push: { [pid]: marks } }); };
    // aplica un PATH de posiciones {x,y,t} para un pid (CLEAR antes). Prueba el acumulador de celdas coarse desde posiciones.
    window.__wpath = (pid, path) => { window.__dev.wayfarerRoam({ clear: true, nowMs: window.__WNOW }); window.__dev.wayfarerRoam({ nowMs: window.__WNOW, self: pid, path: { [pid]: path } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el snapshot (ventana deslizante ⇒ marcas viejas expiran)
    window.__wat = (elapsedSec) => window.__dev.wayfarerRoam({ nowMs: window.__WNOW + (elapsedSec || 0) * 1000 });
    // inyecta `breadth` celdas distintas para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (roamable + zona coincide).
    window.__wpick = (breadth) => {
      window.__dev.wayfarerRoam({ enabled: true, self: "self" });
      const zones = window.__dev.wayfarerRoam().zones || [];
      const marks = window.__marks(breadth);
      for (const z of zones) {
        window.__dev.wayfarerRoam({ clear: true, nowMs: window.__WNOW });
        const s = window.__dev.wayfarerRoam({ nowMs: window.__WNOW, self: "self", push: { self: marks }, toZone: z });
        if (s.zone === z && s.roamable) return { zone: z, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarerRoam && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.standings && window.__dev.congregation && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.wayfarerRoam + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.wayRoam never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.wayfarerRoam());
  ok("2 byte-id OFF (fresh boot): WAYFARER_ROAM.enabled false AND G.wayRoam NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.breadth === 0 && dark.boost === 0 && dark.tag === "" && dark.breadthMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} breadth=${dark.breadth} boost=${dark.boost} tag="${dark.tag}" map=${JSON.stringify(dark.breadthMap)}`);

  // 3 save OFF has no 'wayRoam'/'wayRoamServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'wayRoam'/'wayRoamServer' key in save blob (estado 100% derivado/transitorio)", !/"wayRoam(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installWay(page);

  // 5 ★ breadth = pure fn (wayRoamBreadth via probe)
  const pr = await page.evaluate((NOW) => {
    window.__dev.wayfarerRoam({ enabled: true });
    const win = 20000;
    const B = (marks, now) => window.__dev.wayfarerRoam({ breadthProbe: { marks, now: (now == null ? NOW : now), windowMs: win } }).probe;
    return {
      one:    B([{ c: "0,0", t: NOW }]),                                              // 1 marca ⇒ 1
      still:  B([{ c: "5,5", t: NOW - 3000 }, { c: "5,5", t: NOW - 1000 }, { c: "5,5", t: NOW }]),  // N MISMA celda (quieto) ⇒ 1
      four:   B([{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }]),  // 4 distintas ⇒ 4
      expire: B([{ c: "0,0", t: NOW - 30000 }, { c: "1,0", t: NOW }]),                // 1 fuera de ventana (30s>20s) + 1 dentro ⇒ 1
    };
  }, NOW);
  ok("5 ★ BREADTH = función PURA (wayRoamBreadth): 1 marca⇒1; N misma celda (quieto)⇒1; 4 distintas⇒4; 1 fuera de ventana⇒excluida (⇒1)",
     pr.one === 1 && pr.still === 1 && pr.four === 4 && pr.expire === 1, JSON.stringify(pr));

  // 6 tier table = pure fn of BREADTH
  const tab = await page.evaluate((NOW) => {
    const w = window.__wpick(4); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const b of [1, 2, 3, 4, 5]) {
      window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
      const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: window.__marks(b) }, toZone: zone });
      out.push({ b, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul });
    }
    return { zone, out };
  }, NOW);
  const expTier = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3 };
  const expMit = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => r.breadth === r.b && r.tier === expTier[r.b] && near(r.mit, expMit[r.b]));
  ok("6 TABLA de tiers = función PURA del BREADTH: breadth→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + mit (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + project (prune out-of-window marks)
  const refl = await page.evaluate((NOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    // 3 distintas dentro + 2 distintas FUERA de ventana ⇒ reflejado breadth 3 (podadas las viejas)
    const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [
      { c: "0,0", t: NOW }, { c: "1,0", t: NOW - 5000 }, { c: "2,0", t: NOW - 10000 },
      { c: "8,0", t: NOW - 40000 }, { c: "9,0", t: NOW - 50000 } ] } });
    return { breadth: s.breadth, map: s.breadthMap, self: s.self };
  }, NOW);
  const reflOk = refl.breadth === 3 && refl.map && refl.map.self === 3;
  ok("7 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→marks} reflejado; 3 en ventana + 2 fuera ⇒ breadth 3 (marcas viejas PODADAS)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accrual = fn of POSITIONS (path): quieto misma celda ⇒ 1; cruzar 4 celdas ⇒ 4 (cellSize 128)
  const acc = await page.evaluate((NOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    // quieto: 3 muestras dentro de la MISMA celda coarse (x<128) ⇒ 1
    window.__wpath("self", [{ x: 10, y: 10, t: NOW - 2000 }, { x: 40, y: 20, t: NOW - 1000 }, { x: 60, y: 30, t: NOW }]);
    const still = window.__dev.wayfarerRoam({ nowMs: NOW }).breadth;
    // cruzar: 4 celdas coarse distintas (x=10,140,300,460 ⇒ cell 0,1,2,3) ⇒ 4
    window.__wpath("self", [{ x: 10, y: 10, t: NOW - 3000 }, { x: 140, y: 10, t: NOW - 2000 }, { x: 300, y: 10, t: NOW - 1000 }, { x: 460, y: 10, t: NOW }]);
    const cross = window.__dev.wayfarerRoam({ nowMs: NOW }).breadth;
    return { still, cross };
  }, NOW);
  ok("8 ★ ACUMULADOR = función de las POSICIONES (path): quieto (misma celda coarse ×3)⇒breadth 1; cruzar 4 celdas distintas⇒breadth 4",
     acc.still === 1 && acc.cross === 4, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — lone player suffices; standing still (1 cell) does NOT open (opposite Kinship); crossing cells opens; circle counts (≠ Convoy)
  const diff = await page.evaluate((NOW) => {
    const w = window.__wpick(4); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (path) => { window.__wpath("self", path); window.__dev.wayfarerRoam({ toZone: zone }); const s = window.__dev.wayfarerRoam({ nowMs: NOW, toZone: zone }); return { breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul }; };
    return {
      zone,
      still: read([{ x: 10, y: 10, t: NOW - 4000 }, { x: 20, y: 20, t: NOW - 2000 }, { x: 30, y: 30, t: NOW }]),                 // QUIETO 1 celda ⇒ breadth 1 ⇒ NO abre (OPUESTO a Kinship)
      three: read([{ x: 10, y: 10, t: NOW - 2000 }, { x: 140, y: 10, t: NOW - 1000 }, { x: 300, y: 10, t: NOW }]),               // cruzar 3 celdas ⇒ T2 abre
      // círculo: recorre 4 celdas distintas volviendo cerca del origen (sin coherencia direccional) ⇒ 4 celdas ⇒ abre (≠ Convoy que exige rumbo común)
      circle: read([{ x: 10, y: 10, t: NOW - 4000 }, { x: 140, y: 10, t: NOW - 3000 }, { x: 140, y: 140, t: NOW - 2000 }, { x: 10, y: 140, t: NOW - 1000 }, { x: 20, y: 20, t: NOW }]),
    };
  }, NOW);
  ok("9 ★ DIFERENCIADOR: 1 solo basta (individual); QUIETO 1 celda⇒breadth 1⇒NO abre (opuesto Kinship); cruzar 3⇒T2 abre; círculo 4 celdas⇒abre (≠Convoy, sin dirección)",
     !diff.bad && diff.still.breadth === 1 && diff.still.tier === 0 && diff.still.mit === 0 &&
     diff.three.breadth === 3 && diff.three.tier === 2 && diff.three.mit > 0 &&
     diff.circle.breadth === 4 && diff.circle.tier === 3 && diff.circle.mit > 0, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by SLIDING WINDOW expiration
  const decay = await page.evaluate((NOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    // 4 celdas con marcas escalonadas: 2 viejas (NOW-18s, NOW-16s) + 2 recientes (NOW-2s, NOW)
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [
      { c: "0,0", t: NOW - 18000 }, { c: "1,0", t: NOW - 16000 }, { c: "2,0", t: NOW - 2000 }, { c: "3,0", t: NOW } ] } });
    const at0 = window.__dev.wayfarerRoam({ nowMs: NOW });                    // ventana [NOW-20s,NOW] ⇒ 4 dentro ⇒ T3
    const at5 = window.__dev.wayfarerRoam({ nowMs: NOW + 5000 });             // ventana [NOW-15s,NOW+5s] ⇒ 2 viejas expiran ⇒ breadth 2 ⇒ T1
    return { base: at0.breadth, baseT: at0.tier, dec: at5.breadth, decT: at5.tier };
  }, NOW);
  ok("10 ★ DECAY determinista 0-RNG por EXPIRACIÓN de ventana deslizante: breadth 4 (T3); +5s ⇒ 2 marcas viejas expiran ⇒ breadth 2 (T1)",
     decay.base === 4 && decay.baseT === 3 && decay.dec === 2 && decay.decT === 1, JSON.stringify(decay));

  // 11 passive isolated (oocMitigation channel): in-zone breadth≥umbral ⇒ mit == tier mit + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((NOW) => {
    const w = window.__wpick(3); if (!w) return { bad: true };                // breadth 3 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.wayfarerRoam({ nowMs: NOW, toZone: w.zone });
    const out = window.__dev.wayfarerRoam({ leave: true });
    return { zone: w.zone, inMul: inz.oocMitigMul, inTier: inz.tier, inB: inz.breadth, outMul: out.oocMitigMul, outTier: out.tier };
  }, NOW);
  ok("11 PASSIVE individual (canal oocMitigation, aislado): héroe EN zona de caza con breadth≥umbral ⇒ oocMitigMul==mit del tier (T2=0.10) + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.inB === 3 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ FRESH CHANNEL oocMitigation wired + OUT-OF-COMBAT DAMAGE MITIGATION
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function wayRoamMul/.test(simSrc) &&
    /wayRoamMul\(h,\s*WAYFARER_ROAM\.channel\|\|"oocMitigation"\)/.test(simSrc) &&
    /real=Math\.max\(1,\s*real\*\(1-mit\)\)/.test(simSrc) && /_roamCombatT/.test(simSrc);
  const hurt = await page.evaluate((NOW) => {
    const w = window.__wpick(4); if (!w) return { bad: true };               // breadth 4 ⇒ T3 ⇒ mit 0.15
    window.__dev.wayfarerRoam({ nowMs: NOW, toZone: w.zone });
    const ooc = window.__dev.wayfarerRoam({ hurtTick: { dmg: 100, inCombat: false } }).hurtPicked;   // fuera de combate ⇒ mitiga: 100*(1-0.15)=85
    const inc = window.__dev.wayfarerRoam({ hurtTick: { dmg: 100, inCombat: true } }).hurtPicked;    // EN combate ⇒ full 100
    // OFF ⇒ wayRoamMul gated ⇒ hurtTick paga full (byte-id) + tag ""
    window.__dev.wayfarerRoam({ enabled: false });
    const gpOff = window.__dev.wayfarerRoam({ hurtTick: { dmg: 100, inCombat: false } }).hurtPicked;
    const off = window.__dev.wayfarerRoam();
    return { zone: w.zone, ooc, inc, gpOff, offTag: off.tag };
  }, NOW);
  const hurtOk = !hurt.bad && hurt.ooc && near(hurt.ooc.mit, 0.15) && near(hurt.ooc.applied, 85) &&
    hurt.inc && hurt.inc.mit === 0 && near(hurt.inc.applied, 100) &&
    hurt.gpOff && hurt.gpOff.mit === 0 && near(hurt.gpOff.applied, 100) && hurt.offTag === "";
  ok("12 ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE: seam damageHero real=max(1,real*(1-wayRoamMul)) gated por _roamCombatT; T3 fuera de combate ⇒ 100→85; EN combate ⇒ 100 (full); OFF ⇒ full + tag \"\"",
     seamWired && hurtOk, `wired=${seamWired} ooc=${JSON.stringify(hurt.ooc)} inc=${JSON.stringify(hurt.inc)} off=${JSON.stringify(hurt.gpOff)} offTag="${hurt.offTag}"`);

  // 13 ★ ORTHOGONALITY oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__wpick(4); if (!w) return { bad: true };               // breadth 4 ⇒ T3 ⇒ oocMitigation 0.15
    const zone = w.zone;
    const a = window.__dev.wayfarerRoam({ nowMs: NOW, toZone: zone });
    const oocBefore = a.oocMitigMul, restedBefore = a.restedXpMult, goldBefore = a.goldFindMul, wardBefore = a.wardRegenMul;
    // activa CONVOY (restedMult) + KINSHIP (goldFind) + WARD (wardRegen) en la MISMA zona ⇒ SUS canales suben pero oocMitigMul NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    const b = window.__dev.wayfarerRoam({ nowMs: NOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, oocBefore, restedBefore, goldBefore, wardBefore, oocAfter: b.oocMitigMul, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "oocMitigation" && orth.oocBefore > 0 &&
    near(orth.oocAfter, orth.oocBefore) &&                            // los otros canales NO cambian oocMitigation
    orth.restedAfter > orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0;   // y CONVOY/KINSHIP/WARD sí aportan en SUS canales
  ok("13 ★ ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 doble-conteo): abrir roam NO toca los otros; activar CONVOY/KINSHIP/WARD NO cambia oocMitigMul; canal='oocMitigation'",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 12 flags del arco siguen LIVE served; WAYFARER_ROAM served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const roamDark = flag("WAYFARER_ROAM") === "false";
  ok("14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true; WAYFARER_ROAM served false (DARK)",
     arcAllOn && roamDark, `wayfarerRoam=${flag("WAYFARER_ROAM")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ ROAM en las 6 zonas
  const zonesRes = await page.evaluate((NOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    const zones = window.__dev.wayfarerRoam().zones; const broken = [];
    for (const z of zones) {
      window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
      const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: window.__marks(4) }, toZone: z });
      if (!(s.zone === z && s.roamable && s.tier === 3 && s.oocMitigMul > 0)) broken.push(z);
    }
    return { zones, broken };
  }, NOW);
  ok("15 ★ ROAM 6 zonas: las 6 zonas de WAYFARER_ROAM.zones hospedan el pasivo (breadth≥4 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Trotamundos" drawn ON / not OFF + fps
  const badge = await page.evaluate(async (NOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Trotamundos") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__wpick(4);
    window.__dev.wayfarerRoam({ nowMs: NOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.wayfarerRoam({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, NOW);
  ok("16 render badge \"Trotamundos\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((NOW) => { const w = window.__wpick(4); window.__dev.wayfarerRoam({ nowMs: NOW, toZone: w.zone }); }, NOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installWay(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.wayfarerRoam({ enabled: true }).zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    // snapshot COMPARTIDO { A:[4 celdas], B:[2 celdas], P:[4 celdas escalonadas] }; ambos clientes lo empujan idéntico
    const snap = (NOW) => ({
      A: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }],
      B: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }],
      P: [{ c: "0,0", t: NOW - 18000 }, { c: "1,0", t: NOW - 16000 }, { c: "2,0", t: NOW - 2000 }, { c: "3,0", t: NOW }],
    });
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.wayfarerRoam({ enabled: true, self });
        window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
        const s = window.__dev.wayfarerRoam({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }],
          B: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }],
          P: [{ c: "0,0", t: NOW - 18000 }, { c: "1,0", t: NOW - 16000 }, { c: "2,0", t: NOW - 2000 }, { c: "3,0", t: NOW }],
        }, toZone: zone });
        return { self: s.self, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul, nowMs: s.nowMs, map: s.breadthMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: breadth 4 (T3), byte-idéntico
    const decayed = await readAs("P", 5);      // +5s ⇒ ventana desliza ⇒ P breadth 2 (T1), converge
    // per-pid independence: A lee "A" (breadth 4 T3), B lee "B" (breadth 2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const rA = await page.evaluate(({ zone, NOW }) => { window.__dev.wayfarerRoam({ enabled: true, self: "A" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW }); const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "A", push: { A: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }], B: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }] }, toZone: zone }); return { self: s.self, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul, map: s.breadthMap }; }, { zone, NOW });
      const rB = await pageB.evaluate(({ zone, NOW }) => { window.__dev.wayfarerRoam({ enabled: true, self: "B" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW }); const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "B", push: { A: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }], B: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }] }, toZone: zone }); return { self: s.self, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul, map: s.breadthMap }; }, { zone, NOW });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ Δ_A=0 (zone-gate) PERO breadthMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.wayfarerRoam({ leave: true }); return { mul: s.oocMitigMul, tier: s.tier, map: s.breadthMap }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.wayfarerRoam({ nowMs: NOW, self: "B", toZone: zone }); return { mul: s.oocMitigMul, tier: s.tier, breadth: s.breadth }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && northStar.shared.a.breadth === 4 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && northStar.decayed.a.breadth === 2 &&
    northStar.indep.mapEq && northStar.indep.rA.breadth === 4 && northStar.indep.rA.tier === 3 && northStar.indep.rB.breadth === 2 && northStar.indep.rB.tier === 1 &&
    northStar.aLeaves.mul === 0 &&                                     // A fuera de zona ⇒ Δ_A=0
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&   // breadthMap server-authoritative INTACTO
    northStar.bIntact.mul > 0 && northStar.bIntact.tier === 1;         // B intacto (per-pid independiente)
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ breadth/tier/mit byte-idénticos (P T3, decae T1); breadth per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ Δ_A=0 PERO map + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aMul: northStar.aLeaves.mul, bMul: northStar.bIntact.mul, bTier: northStar.bIntact.tier, errB: errB.length }));

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
