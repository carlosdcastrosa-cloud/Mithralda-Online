// CAS-2374 — QA INDEPENDIENTE POST-FLIP (2-cliente) para TROTAMUNDOS / WAYFARER **LIVE** (WAYFARER_ROAM.enabled:true, flip CAS-2373). EVO mecánica #61.
// SUPERSEDES el stalled CAS-2372 (bloqueado descriptivamente sobre el flip child muerto CAS-2371; nunca despertó por 403 auth-boundary del CEO).
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2369-wayfarer-roam-{selfverify,live-observable-qa}.mjs):
//   · Oráculos re-derivados en Node (breadth = nº de celdas coarse DISTINTAS en ventana; tier = índice del tier más alto cuyo min≤breadth; mit = tiers[t-1].mit cap maxMitigation).
//   · Sets de POSICIONES/celdas propios de QA TRASLADADOS a otra base (QBX,QBY lejos del origen y del set DARK) ⇒ prueba invariancia por traslación del breadth (sólo cuenta nº de celdas, no su posición absoluta).
//   · Reloj de pared FIJO propio de QA (QNOW distinto del GE 9.6M y de la DARK QA 7.25M).
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT ad87e26206c3 (flip CAS-2373) y AVANZÓ del pre-flip 40622de6bc8f (EVO#60 KINSHIP_BOND flip CAS-2367).
//   (2) WAYFARER_ROAM served enabled:TRUE (ya no false) + 12 flags del arco served true (0-regresión) ⇒ 13 flags true LIVE; FOCUS_FIRE (#62) sigue served false (anti-stacking).
//   (3) DEFAULT-ON: wayfarerRoam().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal FRESCO oocMitigation MITIGA daño fuera de combate en el build LIVE; ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 doble-conteo) confirmada contra el served.
//
// Eje FRESCO = AMPLITUD DE EXPLORACIÓN INDIVIDUAL (roaming breadth). Canal FRESCO = oocMitigation (4º canal ⊥ restedMult/goldFind/wardRegen; sólo el 1er golpe de la refriega mitiga).
// Diferenciadores LIVE: 1 jugador SOLO basta (individual); QUIETO ⇒ 1 celda ⇒ NO abre (OPUESTO Kinship #60); cruzar celdas sin dirección/círculos ⇒ SÍ (≠ Convoy #58); no headcount/ángulos (≠ Cong/Warding #59); no llegar-a-zona (≠ Influx #56).
// Run: node tools/cas2374-wayfarer-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2374-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "ad87e26206c3";   // build deployado por el flip CAS-2373 (== version.json esperado)
const PREFLIP = "40622de6bc8f";        // build servido ANTES del flip wayfarer (EVO#60 KINSHIP_BOND flip CAS-2367) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él) ──────────────────────────────
const oracleBreadth = (marks, now, win) => {
  const lo = now - win, seen = new Set();
  for (const m of marks || []) { const t = +m.t || 0; if (t < lo || t > now) continue; seen.add(String(m.c)); }
  return seen.size;
};
const oracleTier = (breadth, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if (breadth >= tiers[i].min) idx = i + 1; return idx; };
const oracleMit = (breadth, tiers, cap) => { const t = oracleTier(breadth, tiers); if (t <= 0) return 0; const m = +tiers[t - 1].mit || 0; return cap > 0 ? Math.min(cap, m) : m; };

// QA reloj + celdas TRASLADADAS (base coarse distinta del DARK 128,-40 y del origen del GE)
const QNOW = 8650000;
const QBX = 256, QBY = 88;   // base coarse QA propia — celda distinta i ⇒ key `${QBX+i},${QBY}`

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
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

async function installQA(page) {
  await page.evaluate(({ QNOW, QBX, QBY }) => {
    window.__QNOW = QNOW; window.__QBX = QBX; window.__QBY = QBY;
    window.__qmarks = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ c: (window.__QBX + i) + "," + window.__QBY, t: (t == null ? window.__QNOW : t) }); return out; };
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

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installQA(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function runOnce(round) {
  console.log(`\n===== CAS-2374 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido (una vez) — 12 flags arco served true + WAYFARER_ROAM served true + FOCUS_FIRE served false
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const wayServed = en("WAYFARER_ROAM");
  const focusServed = en("FOCUS_FIRE");   // EVO#62 DARK — DEBE seguir served false (anti-stacking; 1 arco/vez)

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + WAYFARER_ROAM served true + 12 arco true + FOCUS_FIRE false + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarerRoam && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.wayfarerRoam+kinship+convoy+ward+saveBlob+fp hooks; served WAYFARER_ROAM.enabled:true + 12 arco true (0 regr) + FOCUS_FIRE false; 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && wayServed === "true" && arcTrue && focusServed === "false" && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} WAYFARER_ROAM=${wayServed} FOCUS_FIRE=${focusServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: wayfarerRoam().enabled===true (el flip cargó) + passive 0 sin roaming; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.wayfarerRoam(); return { enabled: s.enabled, mul: s.oocMitigMul, tier: s.tier, breadth: s.breadth, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(741));
    window.__dev.wayfarerRoam({ enabled: false, leave: true });
    const s = window.__dev.wayfarerRoam();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(741));
    window.__dev.wayfarerRoam({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.oocMitigMul, tag: s.tag, tier: s.tier, saveNoKey: !/["']wayRoam(Server)?["']/i.test(saveOff) && !/_roamCombatT/.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: wayfarerRoam().enabled===true (flip cargó) + passive 0 sin roaming; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave wayRoam/_roamCombatT + fingerprint estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.breadth === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installQA(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.wayfarerRoam({ enabled: true }));
  const cfg = await page.evaluate(() => { const s = window.__dev.wayfarerRoam({ enabled: true }); return { tiers: s.tiers, cap: s.maxMitigation, windowSec: s.windowSec, cellSize: s.cellSize, channel: s.channel, zones: s.zones }; });
  const WIN = cfg.windowSec * 1000;

  // 5 — ★ BREADTH via breadthProbe (fn PURA) cruzado contra ORÁCULO QA — celdas TRASLADADAS
  const pr = await page.evaluate((QNOW, WIN, QBX, QBY) => {
    window.__dev.wayfarerRoam({ enabled: true });
    const B = (marks, now) => window.__dev.wayfarerRoam({ breadthProbe: { marks, now: (now == null ? QNOW : now), windowMs: WIN } }).probe;
    const C = (i) => (QBX + i) + "," + QBY;
    const one = [{ c: C(0), t: QNOW }];
    const still = [{ c: C(9), t: QNOW - 3000 }, { c: C(9), t: QNOW - 1000 }, { c: C(9), t: QNOW }];               // quieto misma celda ⇒ 1
    const four = [{ c: C(0), t: QNOW }, { c: C(1), t: QNOW }, { c: C(2), t: QNOW }, { c: C(3), t: QNOW }];         // 4 distintas ⇒ 4
    const expire = [{ c: "50,50", t: QNOW - 30000 }, { c: C(1), t: QNOW }];                                        // 1 fuera de ventana + 1 dentro ⇒ 1
    return { one: { v: B(one), m: one }, still: { v: B(still), m: still }, four: { v: B(four), m: four }, expire: { v: B(expire), m: expire } };
  }, QNOW, WIN, QBX, QBY);
  const prOk = ["one", "still", "four", "expire"].every(k => pr[k].v === oracleBreadth(pr[k].m, QNOW, WIN));
  ok("5 ★ BREADTH (fn PURA) == ORÁCULO QA LIVE: 1 marca⇒1; N misma celda (quieto)⇒1; 4 distintas⇒4; 1 fuera de ventana⇒excluida (celdas trasladadas ⇒ invariante a traslación)",
     prOk && pr.one.v === 1 && pr.still.v === 1 && pr.four.v === 4 && pr.expire.v === 1,
     JSON.stringify({ one: pr.one.v, still: pr.still.v, four: pr.four.v, expire: pr.expire.v }));

  // 6 — TABLA tiers == ORÁCULO QA para breadth 1..5 (en zona)
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
  ok("6 TABLA tiers == ORÁCULO QA LIVE (breadth 1→T0 … 4→T3, 5→T3 cap; mit 0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 — server-authoritative reflect+project: podado de marcas fuera de ventana (celdas trasladadas)
  const refl = await page.evaluate((QNOW, QBX, QBY) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    const C = (i) => (QBX + i) + "," + QBY;
    const marks = [{ c: C(0), t: QNOW }, { c: C(1), t: QNOW - 5000 }, { c: C(2), t: QNOW - 10000 },
      { c: "300,7", t: QNOW - 40000 }, { c: "301,7", t: QNOW - 55000 }];
    const s = window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: marks } });
    return { breadth: s.breadth, map: s.breadthMap, self: s.self, marks };
  }, QNOW, QBX, QBY);
  const reflOk = refl.breadth === oracleBreadth(refl.marks, QNOW, WIN) && refl.breadth === 3 && refl.map && refl.map.self === 3;
  ok("7 SERVER-AUTHORITATIVE reflect+project == ORÁCULO LIVE: 3 en ventana + 2 fuera ⇒ breadth 3 (marcas viejas PODADAS)",
     reflOk, JSON.stringify({ breadth: refl.breadth, map: refl.map }));

  // 8 — ★ ACUMULADOR = fn de POSICIONES (path): quieto misma celda coarse ⇒ 1; cruzar 4 celdas ⇒ 4 (cellSize)
  const acc = await page.evaluate((QNOW, CS) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    const wpath = (path) => { window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW }); window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", path: { self: path } }); return window.__dev.wayfarerRoam({ nowMs: QNOW }).breadth; };
    const still = wpath([{ x: 12, y: 5, t: QNOW - 2000 }, { x: 40, y: 20, t: QNOW - 1000 }, { x: 70, y: 30, t: QNOW }]);
    const cross = wpath([{ x: 12, y: 5, t: QNOW - 3000 }, { x: CS + 12, y: 5, t: QNOW - 2000 }, { x: 2 * CS + 12, y: 5, t: QNOW - 1000 }, { x: 3 * CS + 12, y: 5, t: QNOW }]);
    return { still, cross };
  }, QNOW, cfg.cellSize);
  ok("8 ★ ACUMULADOR = fn de POSICIONES LIVE (path): quieto (misma celda coarse ×3)⇒breadth 1; cruzar 4 celdas distintas⇒breadth 4",
     acc.still === 1 && acc.cross === 4, JSON.stringify(acc));

  // 9 — ★ DIFERENCIADOR: 1 solo basta; QUIETO 1 celda⇒NO abre (opuesto Kinship); cruzar 3⇒T2; círculo 4 celdas⇒abre (≠Convoy)
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
  ok("9 ★ DIFERENCIADOR LIVE: 1 solo basta; QUIETO 1 celda⇒breadth1⇒NO abre (OPUESTO Kinship); cruzar 3⇒T2 abre; círculo 4 celdas⇒abre (≠Convoy sin dirección)",
     !diff.bad && diff.still.breadth === 1 && diff.still.tier === 0 && diff.still.mit === 0 &&
     diff.three.breadth === 3 && diff.three.tier === 2 && diff.three.mit > 0 &&
     diff.circle.breadth === 4 && diff.circle.tier === 3 && diff.circle.mit > 0, JSON.stringify(diff));

  // 10 — ★ DECAY 0-RNG por EXPIRACIÓN de ventana deslizante — cruzado contra ORÁCULO a dos instantes
  const decay = await page.evaluate((QNOW, QBX, QBY) => {
    window.__dev.wayfarerRoam({ enabled: true, self: "self" });
    window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    const C = (i) => (QBX + i) + "," + QBY;
    const marks = [{ c: C(0), t: QNOW - 18000 }, { c: C(1), t: QNOW - 16000 }, { c: C(2), t: QNOW - 2000 }, { c: C(3), t: QNOW }];
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: marks } });
    const at0 = window.__dev.wayfarerRoam({ nowMs: QNOW });
    const at5 = window.__dev.wayfarerRoam({ nowMs: QNOW + 5000 });
    return { marks, base: at0.breadth, baseT: at0.tier, dec: at5.breadth, decT: at5.tier };
  }, QNOW, QBX, QBY);
  const decOk = decay.base === oracleBreadth(decay.marks, QNOW, WIN) && decay.dec === oracleBreadth(decay.marks, QNOW + 5000, WIN) &&
    decay.base === 4 && decay.baseT === 3 && decay.dec === 2 && decay.decT === 1;
  ok("10 ★ DECAY 0-RNG por EXPIRACIÓN de ventana == ORÁCULO LIVE: breadth 4 (T3); +5s ⇒ 2 marcas viejas expiran ⇒ breadth 2 (T1)",
     decOk, JSON.stringify(decay));

  // 11 — PASSIVE isolado (oocMitigation): in-zone breadth≥umbral ⇒ mit==tier + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((QNOW) => {
    const w = window.__qpick(3); if (!w) return { bad: true };
    const inz = window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.wayfarerRoam({ leave: true });
    return { zone: w.zone, inMul: inz.oocMitigMul, inTier: inz.tier, inB: inz.breadth, outMul: out.oocMitigMul, outTier: out.tier };
  }, QNOW);
  ok("11 PASSIVE (canal oocMitigation, aislado) LIVE: EN zona breadth 3 ⇒ oocMitigMul==mit T2 (0.10) + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, oracleMit(3, cfg.tiers, cfg.cap)) && pass.inTier === 2 && pass.inB === 3 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 — ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE (hurtTick) cruzado contra ORÁCULO
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
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
    window.__dev.wayfarerRoam({ enabled: true });
    return { zone: w.zone, ooc, inc, gpOff, offTag: off.tag };
  }, QNOW);
  const mitT3 = oracleMit(4, cfg.tiers, cfg.cap);
  const hurtOk = !hurt.bad && hurt.ooc && near(hurt.ooc.mit, mitT3) && near(hurt.ooc.applied, Math.max(1, 200 * (1 - mitT3))) &&
    hurt.inc && hurt.inc.mit === 0 && near(hurt.inc.applied, 200) &&
    hurt.gpOff && hurt.gpOff.mit === 0 && near(hurt.gpOff.applied, 200) && hurt.offTag === "";
  ok("12 ★ CANAL FRESCO oocMitigation wired + MITIGACIÓN FUERA DE COMBATE == ORÁCULO LIVE: T3 fuera de combate 200→170; EN combate ⇒ 200 (full); OFF ⇒ full + tag \"\"",
     seamWired && hurtOk, `wired=${seamWired} ooc=${JSON.stringify(hurt.ooc)} inc=${JSON.stringify(hurt.inc)} off=${JSON.stringify(hurt.gpOff)}`);

  // 13 — ★ ORTOGONALIDAD oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen (0 doble-conteo)
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
    return { zone, channel: a.channel, oocBefore, restedBefore, goldBefore, wardBefore, oocAfter: b.oocMitigMul, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "oocMitigation" && orth.oocBefore > 0 &&
    near(orth.oocAfter, orth.oocBefore) && orth.goldBefore === 0 && orth.wardBefore === 0 &&
    orth.restedAfter > orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0;
  ok("13 ★ ORTOGONALIDAD LIVE oocMitigation ⊥ restedMult ⊥ goldFind ⊥ wardRegen: abrir roam NO toca los otros; CONVOY/KINSHIP/WARD NO cambian oocMitigMul (0 doble-conteo); canal='oocMitigation' ⇒ 4 canales ⊥",
     orthOk, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 12 flags del arco served true + WAYFARER_ROAM served TRUE (disco LIVE); FOCUS_FIRE (#62) sigue served false
  ok("14 ★ 0-regresión LIVE: 12 flags del arco served enabled:true + WAYFARER_ROAM served TRUE (13 flags true LIVE); FOCUS_FIRE EVO#62 sigue served false (anti-stacking, 1 arco/vez)",
     arcTrue && wayServed === "true" && focusServed === "false", JSON.stringify({ ...arc, WAYFARER_ROAM: wayServed, FOCUS_FIRE: focusServed }));

  // 15 — ★ ROAM en las 6 zonas broken=[]
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
  ok("15 ★ ROAM 6 zonas LIVE: las 6 zonas de WAYFARER_ROAM.zones hospedan el pasivo (breadth 4 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // shot + badge "Trotamundos"
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Trotamundos") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__qpick(4);
    window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { onCnt, fps };
  }, QNOW);
  ok("16 render badge \"Trotamundos\" se DIBUJA ON (count>0) + fps sano LIVE",
     badge.onCnt > 0 && badge.fps >= 30, `on=${badge.onCnt} fps=${badge.fps}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate((QNOW) => { const w = window.__qpick(4); window.__dev.wayfarerRoam({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(250);
  await page.screenshot({ path: shot });
  console.log(`  build=${build} fps=${badge.fps} shot=${shot}`);
  await page.close();
  return build;
}

// ─────────── ★ NORTH STAR: CONVERGENCIA 2-CLIENTE REAL LIVE (desync = sev-1) ───────────
async function northStar() {
  console.log(`\n===== ★ NORTH STAR 2-cliente LIVE (desync = sev-1) =====`);
  const nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ crear/bootear una página en 2º plano nunca llega al 'menu'.
  // Se crea, se trae al frente y se bootea CADA página en secuencia; la inyección __dev es síncrona + nowMs explícito ⇒ el estado de A persiste cuando B pasa al frente.
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await boot(p);
    await p.evaluate(() => window.__dev.wayfarerRoam({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const zone = await A.evaluate(() => (window.__dev.wayfarerRoam({ enabled: true }).zones || [])[2]);   // ruins idx2 (North Star canónico del arco)

  // snapshot COMPARTIDO { P:[4 celdas trasladadas escalonadas], A:[4], B:[2] } empujado idéntico por ambos clientes
  const SNAP = `{
    P: [{ c: "${QBX + 0},${QBY}", t: N - 18000 }, { c: "${QBX + 1},${QBY}", t: N - 16000 }, { c: "${QBX + 2},${QBY}", t: N - 2000 }, { c: "${QBX + 3},${QBY}", t: N }],
    A: [{ c: "${QBX + 0},${QBY}", t: N }, { c: "${QBX + 1},${QBY}", t: N }, { c: "${QBX + 2},${QBY}", t: N }, { c: "${QBX + 3},${QBY}", t: N }],
    B: [{ c: "${QBX + 0},${QBY}", t: N }, { c: "${QBX + 1},${QBY}", t: N }]
  }`;
  const readAs = async (self, elapsedSec) => {
    const src = `(function(o){ const N=${QNOW}; const snap=${SNAP};
      window.__dev.wayfarerRoam({enabled:true,self:o.self});
      window.__dev.wayfarerRoam({clear:true,nowMs:N});
      const s=window.__dev.wayfarerRoam({nowMs:N+(o.elapsedSec||0)*1000,self:o.self,push:snap,toZone:o.zone});
      return {self:s.self,breadth:s.breadth,tier:s.tier,mit:s.oocMitigMul,nowMs:s.nowMs,map:s.breadthMap}; })(${JSON.stringify({ self, elapsedSec, zone })})`;
    const [a, b] = await Promise.all([A.evaluate(src), B.evaluate(src)]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };

  let allEq = true, log = [];
  // (a) MISMO snapshot+reloj ⇒ VM byte-idéntico en A y B (P: T3; +5s decae a T1) — convergencia real
  const shared = await readAs("P", 0);
  const decayed = await readAs("P", 5);
  if (!(shared.eq && shared.a.tier === 3 && shared.a.breadth === 4)) allEq = false;
  if (!(decayed.eq && decayed.a.tier === 1 && decayed.a.breadth === 2)) allEq = false;
  log.push(`P:${shared.eq ? "==T" + shared.a.tier : "DESYNC " + JSON.stringify(shared.a) + "/" + JSON.stringify(shared.b)}`);
  log.push(`P+5s:${decayed.eq ? "==T" + decayed.a.tier : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (b) per-pid independence: A lee "A" (4⇒T3), B lee "B" (2⇒T1) del MISMO snapshot ⇒ pasivos distintos, breadthMap idéntico
  const indep = async (pg, self) => pg.evaluate(`(function(o){ const N=${QNOW}; const snap=${SNAP};
      window.__dev.wayfarerRoam({enabled:true,self:o.self}); window.__dev.wayfarerRoam({clear:true,nowMs:N});
      const s=window.__dev.wayfarerRoam({nowMs:N,self:o.self,push:snap,toZone:o.zone});
      return {self:s.self,breadth:s.breadth,tier:s.tier,mit:s.oocMitigMul,map:s.breadthMap}; })(${JSON.stringify({ self, zone })})`);
  const rA = await indep(A, "A");
  const rB = await indep(B, "B");
  const mapEq = JSON.stringify(rA.map) === JSON.stringify(rB.map);
  const indepOk = mapEq && rA.breadth === 4 && rA.tier === 3 && rB.breadth === 2 && rB.tier === 1 && rA.mit > rB.mit;
  log.push(`indep:A=T${rA.tier}/B=T${rB.tier}/mapEq=${mapEq}`);

  // (c) A SALE de la zona ⇒ Δ_A cae a 0 (zone-gate) PERO breadthMap + Δ_B quedan INTACTOS
  const aLeaves = await A.evaluate(() => { const s = window.__dev.wayfarerRoam({ leave: true }); return { mul: s.oocMitigMul, tier: s.tier, map: s.breadthMap }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.wayfarerRoam({nowMs:N,self:"B",toZone:${JSON.stringify(zone)}}); return {mul:s.oocMitigMul,tier:s.tier,breadth:s.breadth}; })()`);
  const leaveOk = aLeaves.mul === 0 && aLeaves.map && (aLeaves.map.A || 0) > 0 && bIntact.mul > 0 && bIntact.tier === 1;
  log.push(`A-leave:Δ_A=${aLeaves.mul} mapA=${aLeaves.map && aLeaves.map.A} Δ_B=${bIntact.mul}/T${bIntact.tier}`);

  ok("17 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ breadth/tier/mit byte-idénticos (P T3, decae T1); breadth per-pid (A=T3 vs B=T1 indep, breadthMap idéntico); A sale ⇒ Δ_A=0 PERO map + Δ_B INTACTOS (0 desync)",
     allEq && indepOk && leaveOk, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("18 determinismo ×2: mismo build servido en ambas rondas (== EXPECT)", b1 === b2 && b1 === EXPECT_BUILD, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors durante toda la corrida", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n=====  CAS-2374 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
