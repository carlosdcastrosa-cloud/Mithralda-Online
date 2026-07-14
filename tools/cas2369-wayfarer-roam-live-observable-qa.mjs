// CAS-2369 — QA INDEPENDIENTE (observable DARK) para TROTAMUNDOS / WAYFARER (WAYFARER_ROAM.enabled:false). EVO mecánica #61.
// Harness QA PROPIO (NO reusa el del GE): reloj QA distinto (QA_NOW=7_250_000), CELDAS TRASLADADAS (base coarse (128,-40) ⇒ invariante-traslación
// del breadth: sólo cuenta nº de celdas DISTINTAS, no su posición absoluta), y ORÁCULOS RE-DERIVADOS en Node (breadth = nº de celdas distintas en
// ventana; tier = índice del tier más alto cuyo min≤breadth; mit = tiers[t-1].mit cap maxMitigation) — cruzados contra el VM del sim (autoridad).
//
// Eje FRESCO = AMPLITUD DE EXPLORACIÓN INDIVIDUAL (roaming breadth): server cuenta celdas coarse DISTINTAS que UN pid ocupa en ventana deslizante 20s.
// Canal FRESCO = oocMitigation (mitigación de daño FUERA DE COMBATE, 4º canal ⊥ restedMult/goldFind/wardRegen). Sólo el 1er golpe de la refriega mitiga.
//
// ★ DIFERENCIADORES (ortogonalidad): 1 jugador SOLO basta (individual, ≠ Kinship pareado); QUIETO ⇒ 1 celda ⇒ breadth 1 <2 ⇒ NO abre (OPUESTO Kinship #60);
//   cruzar celdas SIN dirección / círculos ⇒ SÍ (≠ Convoy #58 rumbo común); no headcount/ángulos (≠ Cong/Warding #59); no llegar-a-zona (≠ Influx #56).
// ★ ORTOGONALIDAD: abrir roam (oocMitigMul>0) NO cambia restedMult/goldFind/wardRegen y viceversa (0 doble-conteo, canales ⊥, seams distintos).
// ★ NORTH STAR 2-CLIENTE: 2 páginas puppeteer independientes, MISMO snapshot {pid→marks} + MISMO reloj ⇒ breadth/tier/mit IDÉNTICOS byte-a-byte (0 desync);
//   ventana decae converge; breadth per-pid (A self=A vs B self=B independientes del MISMO snapshot); A SALE de zona ⇒ Δ_A=0 (zone-gate) PERO breadthMap + Δ_B intactos.
// Run: node tools/cas2369-wayfarer-roam-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2369-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él) ──────────────────────────────
// breadth: nº de celdas coarse DISTINTAS con t dentro de [now-win, now]. Independiente de la implementación del sim.
const oracleBreadth = (marks, now, win) => {
  const lo = now - win, seen = new Set();
  for (const m of marks || []) { const t = +m.t || 0; if (t < lo || t > now) continue; seen.add(String(m.c)); }
  return seen.size;
};
// tier: índice (1-based, 0=ninguno) del tier más alto cuyo min ≤ breadth. mit: tiers[t-1].mit cap a maxMitigation.
const oracleTier = (breadth, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if (breadth >= tiers[i].min) idx = i + 1; return idx; };
const oracleMit = (breadth, tiers, cap) => { const t = oracleTier(breadth, tiers); if (t <= 0) return 0; const m = +tiers[t - 1].mit || 0; return cap > 0 ? Math.min(cap, m) : m; };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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

// QA reloj + celdas TRASLADADAS (base coarse desplazada ⇒ prueba invariancia por traslación del breadth)
const QNOW = 7250000;
const QBX = 128, QBY = -40;   // base coarse QA (≠ "0,0" del GE) — celda distinta i ⇒ key `${QBX+i},${QBY}`
async function installQA(page) {
  await page.evaluate(({ QNOW, QBX, QBY }) => {
    window.__QNOW = QNOW; window.__QBX = QBX; window.__QBY = QBY;
    // n celdas coarse DISTINTAS TRASLADADAS @t (default QNOW) ⇒ breadth==n
    window.__qmarks = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ c: (window.__QBX + i) + "," + window.__QBY, t: (t == null ? window.__QNOW : t) }); return out; };
    // inyecta breadth celdas para self, recorre zonas y devuelve la 1ª donde el héroe cae DENTRO (roamable + zona coincide)
    window.__qpick = (breadth) => {
      window.__dev.wayfarerRoam({ enabled: true, self: "self" });
      const zones = window.__dev.wayfarerRoam().zones || [];
      const marks = window.__qmarks(breadth);
      for (const z of zones) {
        window.__dev.wayfarerRoam({ clear: true, nowMs: window.__QNOW });
        const s = window.__dev.wayfarerRoam({ nowMs: window.__QNOW, self: "self", push: { self: marks }, toZone: z });
        if (s.zone === z && s.roamable) return { zone: z, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul };
      }
      return null;
    };
  }, { QNOW, QBX, QBY });
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarerRoam && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.wayfarerRoam + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (read BEFORE any inject): enabled false + G.wayRoam never created
  const dark = await page.evaluate(() => window.__dev.wayfarerRoam());
  ok("2 byte-id OFF (fresh boot): WAYFARER_ROAM.enabled false + G.wayRoam NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.breadth === 0 && dark.boost === 0 && dark.tag === "" && dark.breadthMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} breadth=${dark.breadth} tag="${dark.tag}"`);

  // 3 save OFF has no 'wayRoam'/'wayRoamServer' key + no '_roamCombatT'
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: sin clave 'wayRoam'/'wayRoamServer'/'_roamCombatT' (estado 100% derivado/transitorio)",
     !/"wayRoam(Server)?"/.test(saveOff) && !/_roamCombatT/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(7)));
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(7)));
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installQA(page);
  // config leída del VM (tiers/cap) — la QA re-deriva el oráculo con estos parámetros
  const cfg = await page.evaluate(() => { const s = window.__dev.wayfarerRoam({ enabled: true }); return { tiers: s.tiers, cap: s.maxMitigation, windowSec: s.windowSec, cellSize: s.cellSize, channel: s.channel, zones: s.zones }; });
  const WIN = cfg.windowSec * 1000;

  // 5 ★ BREADTH via breadthProbe (fn PURA) cruzado contra ORÁCULO QA — celdas TRASLADADAS
  const pr = await page.evaluate((QNOW, WIN) => {
    window.__dev.wayfarerRoam({ enabled: true });
    const B = (marks, now) => window.__dev.wayfarerRoam({ breadthProbe: { marks, now: (now == null ? QNOW : now), windowMs: WIN } }).probe;
    const one = [{ c: "128,-40", t: QNOW }];
    const still = [{ c: "200,-40", t: QNOW - 3000 }, { c: "200,-40", t: QNOW - 1000 }, { c: "200,-40", t: QNOW }];       // quieto misma celda ⇒ 1
    const four = [{ c: "128,-40", t: QNOW }, { c: "129,-40", t: QNOW }, { c: "130,-40", t: QNOW }, { c: "131,-40", t: QNOW }];  // 4 distintas ⇒ 4
    const expire = [{ c: "50,50", t: QNOW - 30000 }, { c: "51,50", t: QNOW }];                                            // 1 fuera de ventana + 1 dentro ⇒ 1
    return { one: { v: B(one), m: one }, still: { v: B(still), m: still }, four: { v: B(four), m: four }, expire: { v: B(expire), m: expire } };
  }, QNOW, WIN);
  const prOk = ["one", "still", "four", "expire"].every(k => pr[k].v === oracleBreadth(pr[k].m, QNOW, WIN));
  ok("5 ★ BREADTH (fn PURA) == ORÁCULO QA: 1 marca⇒1; N misma celda (quieto)⇒1; 4 distintas⇒4; 1 fuera de ventana⇒excluida",
     prOk && pr.one.v === 1 && pr.still.v === 1 && pr.four.v === 4 && pr.expire.v === 1,
     JSON.stringify({ one: pr.one.v, still: pr.still.v, four: pr.four.v, expire: pr.expire.v }));

  // 6 TABLA tiers == ORÁCULO QA para breadth 1..5 (en zona)
  const tab = await page.evaluate((QNOW) => {
    const w = window.__qpick(4); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const b of [1, 2, 3, 4, 5]) {
      window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
      const s = window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: window.__qmarks(b) }, toZone: zone });
      out.push({ b, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => r.breadth === r.b && r.tier === oracleTier(r.b, cfg.tiers) && near(r.mit, oracleMit(r.b, cfg.tiers, cfg.cap)));
  ok("6 TABLA tiers == ORÁCULO QA (breadth 1→T0 … 4→T3, 5→T3 cap; mit 0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect+project: podado de marcas fuera de ventana (celdas trasladadas)
  const refl = await page.evaluate((QNOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    const marks = [{ c: "128,-40", t: QNOW }, { c: "129,-40", t: QNOW - 5000 }, { c: "130,-40", t: QNOW - 10000 },
      { c: "300,7", t: QNOW - 40000 }, { c: "301,7", t: QNOW - 55000 }];
    const s = window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: marks } });
    return { breadth: s.breadth, map: s.breadthMap, self: s.self, marks };
  }, QNOW);
  const reflOk = refl.breadth === oracleBreadth(refl.marks, QNOW, WIN) && refl.breadth === 3 && refl.map && refl.map.self === 3;
  ok("7 SERVER-AUTHORITATIVE reflect+project == ORÁCULO: 3 en ventana + 2 fuera ⇒ breadth 3 (marcas viejas PODADAS)",
     reflOk, JSON.stringify({ breadth: refl.breadth, map: refl.map }));

  // 8 ★ ACUMULADOR = fn de POSICIONES (path): quieto misma celda coarse ⇒ 1; cruzar 4 celdas ⇒ 4 (cellSize)
  const acc = await page.evaluate((QNOW, CS) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    const wpath = (path) => { window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW }); window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", path: { self: path } }); return window.__dev.wayfarerRoam({ nowMs: QNOW }).breadth; };
    // quieto: 3 muestras dentro de la MISMA celda coarse ⇒ 1
    const still = wpath([{ x: 12, y: 5, t: QNOW - 2000 }, { x: 40, y: 20, t: QNOW - 1000 }, { x: 70, y: 30, t: QNOW }]);
    // cruzar: 4 celdas coarse distintas (x separadas por > cellSize) ⇒ 4
    const cross = wpath([{ x: 12, y: 5, t: QNOW - 3000 }, { x: CS + 12, y: 5, t: QNOW - 2000 }, { x: 2 * CS + 12, y: 5, t: QNOW - 1000 }, { x: 3 * CS + 12, y: 5, t: QNOW }]);
    return { still, cross };
  }, QNOW, cfg.cellSize);
  ok("8 ★ ACUMULADOR = fn de POSICIONES (path): quieto (misma celda coarse ×3)⇒breadth 1; cruzar 4 celdas distintas⇒breadth 4",
     acc.still === 1 && acc.cross === 4, JSON.stringify(acc));

  // 9 ★ DIFERENCIADOR: 1 solo basta; QUIETO 1 celda⇒NO abre (opuesto Kinship); cruzar 3⇒T2; círculo 4 celdas⇒abre (≠Convoy)
  const diff = await page.evaluate((QNOW, CS) => {
    const w = window.__qpick(4); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (path) => { window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW }); window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", path: { self: path } }); const s = window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: zone }); return { breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul }; };
    return {
      zone,
      still: read([{ x: 10, y: 10, t: QNOW - 4000 }, { x: 20, y: 20, t: QNOW - 2000 }, { x: 30, y: 30, t: QNOW }]),                     // QUIETO 1 celda ⇒ NO abre
      three: read([{ x: 10, y: 10, t: QNOW - 2000 }, { x: CS + 10, y: 10, t: QNOW - 1000 }, { x: 2 * CS + 10, y: 10, t: QNOW }]),       // cruzar 3 celdas ⇒ T2
      circle: read([{ x: 10, y: 10, t: QNOW - 4000 }, { x: CS + 10, y: 10, t: QNOW - 3000 }, { x: CS + 10, y: CS + 10, t: QNOW - 2000 }, { x: 10, y: CS + 10, t: QNOW - 1000 }, { x: 20, y: 20, t: QNOW }]),  // círculo 4 celdas
    };
  }, QNOW, cfg.cellSize);
  ok("9 ★ DIFERENCIADOR: 1 solo basta; QUIETO 1 celda⇒breadth1⇒NO abre (OPUESTO Kinship); cruzar 3⇒T2 abre; círculo 4 celdas⇒abre (≠Convoy sin dirección)",
     !diff.bad && diff.still.breadth === 1 && diff.still.tier === 0 && diff.still.mit === 0 &&
     diff.three.breadth === 3 && diff.three.tier === 2 && diff.three.mit > 0 &&
     diff.circle.breadth === 4 && diff.circle.tier === 3 && diff.circle.mit > 0, JSON.stringify(diff));

  // 10 ★ DECAY 0-RNG por EXPIRACIÓN de ventana deslizante — cruzado contra ORÁCULO a dos instantes
  const decay = await page.evaluate((QNOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    const marks = [{ c: "128,-40", t: QNOW - 18000 }, { c: "129,-40", t: QNOW - 16000 }, { c: "130,-40", t: QNOW - 2000 }, { c: "131,-40", t: QNOW }];
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: marks } });
    const at0 = window.__dev.wayfarerRoam({ nowMs: QNOW });
    const at5 = window.__dev.wayfarerRoam({ nowMs: QNOW + 5000 });
    return { marks, base: at0.breadth, baseT: at0.tier, dec: at5.breadth, decT: at5.tier };
  }, QNOW);
  const decOk = decay.base === oracleBreadth(decay.marks, QNOW, WIN) && decay.dec === oracleBreadth(decay.marks, QNOW + 5000, WIN) &&
    decay.base === 4 && decay.baseT === 3 && decay.dec === 2 && decay.decT === 1;
  ok("10 ★ DECAY 0-RNG por EXPIRACIÓN de ventana == ORÁCULO: breadth 4 (T3); +5s ⇒ 2 marcas viejas expiran ⇒ breadth 2 (T1)",
     decOk, JSON.stringify(decay));

  // 11 passive isolado (oocMitigation): in-zone breadth≥umbral ⇒ mit==tier + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((QNOW) => {
    const w = window.__qpick(3); if (!w) return { bad: true };
    const inz = window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.wayfarerRoam({ leave: true });
    return { zone: w.zone, inMul: inz.oocMitigMul, inTier: inz.tier, inB: inz.breadth, outMul: out.oocMitigMul, outTier: out.tier };
  }, QNOW);
  ok("11 PASSIVE (canal oocMitigation, aislado): EN zona breadth 3 ⇒ oocMitigMul==mit T2 (0.10) + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, oracleMit(3, cfg.tiers, cfg.cap)) && pass.inTier === 2 && pass.inB === 3 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE (hurtTick) cruzado contra ORÁCULO
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function wayRoamMul/.test(simSrc) &&
    /wayRoamMul\(h,\s*WAYFARER_ROAM\.channel\|\|"oocMitigation"\)/.test(simSrc) &&
    /real=Math\.max\(1,\s*real\*\(1-mit\)\)/.test(simSrc) && /_roamCombatT/.test(simSrc);
  const hurt = await page.evaluate((QNOW) => {
    const w = window.__qpick(4); if (!w) return { bad: true };   // breadth 4 ⇒ T3
    window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone });
    const ooc = window.__dev.wayfarerRoam({ hurtTick: { dmg: 200, inCombat: false } }).hurtPicked;   // fuera de combate ⇒ mitiga
    const inc = window.__dev.wayfarerRoam({ hurtTick: { dmg: 200, inCombat: true } }).hurtPicked;    // EN combate ⇒ full
    window.__dev.wayfarerRoam({ enabled: false });
    const gpOff = window.__dev.wayfarerRoam({ hurtTick: { dmg: 200, inCombat: false } }).hurtPicked;  // OFF ⇒ full (byte-id)
    const off = window.__dev.wayfarerRoam();
    return { zone: w.zone, ooc, inc, gpOff, offTag: off.tag };
  }, QNOW);
  const mitT3 = oracleMit(4, cfg.tiers, cfg.cap);
  const hurtOk = !hurt.bad && hurt.ooc && near(hurt.ooc.mit, mitT3) && near(hurt.ooc.applied, Math.max(1, 200 * (1 - mitT3))) &&
    hurt.inc && hurt.inc.mit === 0 && near(hurt.inc.applied, 200) &&
    hurt.gpOff && hurt.gpOff.mit === 0 && near(hurt.gpOff.applied, 200) && hurt.offTag === "";
  ok("12 ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE == ORÁCULO: T3 fuera de combate 200→170; EN combate ⇒ 200 (full); OFF ⇒ full + tag \"\"",
     seamWired && hurtOk, `wired=${seamWired} ooc=${JSON.stringify(hurt.ooc)} inc=${JSON.stringify(hurt.inc)} off=${JSON.stringify(hurt.gpOff)}`);

  // 13 ★ ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 doble-conteo)
  const orth = await page.evaluate((QNOW) => {
    const w = window.__qpick(4); if (!w) return { bad: true };
    const zone = w.zone;
    const a = window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: zone });
    const oocBefore = a.oocMitigMul, restedBefore = a.restedXpMult, goldBefore = a.goldFindMul, wardBefore = a.wardRegenMul;
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: QNOW });
    window.__dev.convoy({ nowMs: QNOW, push: { [zone]: { march: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: QNOW });
    window.__dev.kinship({ nowMs: QNOW, push: { [zone]: { kinship: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: QNOW });
    window.__dev.ward({ nowMs: QNOW, push: { [zone]: { ward: 6, atMs: QNOW } }, toZone: zone });
    const b = window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, oocBefore, restedBefore, goldBefore, wardBefore, oocAfter: b.oocMitigMul, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "oocMitigation" && orth.oocBefore > 0 &&
    near(orth.oocAfter, orth.oocBefore) && orth.goldBefore === 0 && orth.wardBefore === 0 &&
    orth.restedAfter > orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0;
  ok("13 ★ ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen: abrir roam NO toca los otros; CONVOY/KINSHIP/WARD NO cambian oocMitigMul (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true; WAYFARER_ROAM served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const roamDark = flag("WAYFARER_ROAM") === "false";
  ok("14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true; WAYFARER_ROAM served false (DARK)",
     arcAllOn && roamDark, `wayfarerRoam=${flag("WAYFARER_ROAM")} arcAllOn=${arcAllOn} ${JSON.stringify(arcLive)}`);

  // 15 ★ ROAM en las 6 zonas broken=[]
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    const zones = window.__dev.wayfarerRoam().zones; const broken = [];
    for (const z of zones) {
      window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
      const s = window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: window.__qmarks(4) }, toZone: z });
      if (!(s.zone === z && s.roamable && s.tier === 3 && s.oocMitigMul > 0)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("15 ★ ROAM 6 zonas: las 6 zonas de WAYFARER_ROAM.zones hospedan el pasivo (breadth 4 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Trotamundos" ON / not OFF + fps
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Trotamundos") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__qpick(4);
    window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.wayfarerRoam({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, QNOW);
  ok("16 render badge \"Trotamundos\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate((QNOW) => { const w = window.__qpick(4); window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL + independencia per-pid
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installQA(pageB);
  const zone2 = await page.evaluate(() => (window.__dev.wayfarerRoam({ enabled: true }).zones || [])[2]);   // ruins idx2 (North Star canónico)
  // snapshot COMPARTIDO { A:[4 celdas trasladadas], B:[2 celdas], P:[4 escalonadas] } empujado idéntico por ambos clientes
  const SNAP_JS = `{
    A: [{ c: "128,-40", t: N }, { c: "129,-40", t: N }, { c: "130,-40", t: N }, { c: "131,-40", t: N }],
    B: [{ c: "128,-40", t: N }, { c: "129,-40", t: N }],
    P: [{ c: "128,-40", t: N - 18000 }, { c: "129,-40", t: N - 16000 }, { c: "130,-40", t: N - 2000 }, { c: "131,-40", t: N }]
  }`;
  const readAs = async (self, elapsedSec) => {
    const fn = ({ self, elapsedSec, zone, QNOW }) => {
      const N = QNOW; const snap = SNAP_PLACEHOLDER;
      window.__dev.wayfarerRoam({ enabled: true, self });
      window.__dev.wayfarerRoam({ clear: true, nowMs: N });
      const s = window.__dev.wayfarerRoam({ nowMs: N + (elapsedSec || 0) * 1000, self, push: snap, toZone: zone });
      return { self: s.self, breadth: s.breadth, tier: s.tier, mit: s.oocMitigMul, nowMs: s.nowMs, map: s.breadthMap };
    };
    const src = fn.toString().replace("SNAP_PLACEHOLDER", SNAP_JS);
    const inj = (pg) => pg.evaluate(`(${src})(${JSON.stringify({ self, elapsedSec, zone: zone2, QNOW })})`);
    const [a, b] = await Promise.all([inj(page), inj(pageB)]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };
  const shared = await readAs("P", 0);      // ambos leen pid P: breadth 4 (T3) byte-idéntico
  const decayed = await readAs("P", 5);      // +5s ⇒ ventana desliza ⇒ P breadth 2 (T1), converge
  // per-pid independence: A lee "A" (4 T3), B lee "B" (2 T1) del MISMO snapshot ⇒ pasivos distintos, mapa idéntico
  const indepSnap = `{ A: [{ c: "128,-40", t: N }, { c: "129,-40", t: N }, { c: "130,-40", t: N }, { c: "131,-40", t: N }], B: [{ c: "128,-40", t: N }, { c: "129,-40", t: N }] }`;
  const indepFn = (self) => `((${JSON.stringify({ self, zone: zone2, QNOW })}).self, (function(o){ const N=${QNOW}; window.__dev.wayfarerRoam({enabled:true,self:o.self}); window.__dev.wayfarerRoam({clear:true,nowMs:N}); const s=window.__dev.wayfarerRoam({nowMs:N,self:o.self,push:${indepSnap},toZone:o.zone}); return {self:s.self,breadth:s.breadth,tier:s.tier,mit:s.oocMitigMul,map:s.breadthMap}; })(${JSON.stringify({ self, zone: zone2, QNOW })}))`;
  const rA = await page.evaluate(indepFn("A"));
  const rB = await pageB.evaluate(indepFn("B"));
  const mapEq = JSON.stringify(rA.map) === JSON.stringify(rB.map);
  // A sale de zona ⇒ Δ_A=0 (zone-gate) PERO breadthMap + B intactos
  const aLeaves = await page.evaluate(() => { const s = window.__dev.wayfarerRoam({ leave: true }); return { mul: s.oocMitigMul, tier: s.tier, map: s.breadthMap }; });
  const bIntact = await pageB.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.wayfarerRoam({nowMs:N,self:"B",toZone:${JSON.stringify(zone2)}}); return {mul:s.oocMitigMul,tier:s.tier,breadth:s.breadth}; })()`);
  const nsOk = shared.eq && shared.a.tier === 3 && shared.a.breadth === 4 &&
    decayed.eq && decayed.a.tier === 1 && decayed.a.breadth === 2 &&
    mapEq && rA.breadth === 4 && rA.tier === 3 && rB.breadth === 2 && rB.tier === 1 &&
    aLeaves.mul === 0 && aLeaves.map && (aLeaves.map.A || 0) > 0 &&
    bIntact.mul > 0 && bIntact.tier === 1;
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMO snapshot+reloj ⇒ breadth/tier/mit byte-idénticos (P T3, decae T1); breadth per-pid (A=T3 vs B=T1 indep, mapa idéntico); A sale de zona ⇒ Δ_A=0 PERO map + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: shared.eq, eqDecay: decayed.eq, mapEq, aMul: aLeaves.mul, bMul: bIntact.mul, bTier: bIntact.tier, errB: errB.length }));

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
