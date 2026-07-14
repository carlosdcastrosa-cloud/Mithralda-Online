// CAS-2379 — QA INDEPENDIENTE POST-FLIP (2-cliente) para SENDERO / TRAILCRAFT **LIVE** (TRAILCRAFT.enabled:true, flip CAS-2378). EVO mecánica #63.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2377-trailcraft-{selfverify,observable-qa}.mjs):
//   · Oráculos re-derivados en Node: trailVariety reimplementada (nº de TIPOS de bioma DISTINTOS en ventana);
//     tier = índice del tier más alto cuyo min≤craft; steps = tiers[t-1].steps; floor = RARITY_ORDER[steps]; decay = base·0.5^(dt/hl) cap capCraft.
//   · BIOMAS/PIDS RE-ETIQUETADOS (mesa/dune/glade/fen, A/B) ⇒ prueba invariancia por renombrado (trailVariety cuenta strings distintos).
//   · Reloj de pared FIJO propio de QA (QNOW distinto del GE 8.72M y de la DARK QA 7.31M).
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT 9aeb83a279a3 (flip CAS-2378) y AVANZÓ del pre-flip 66ccf593d6c6 (EVO#62 FOCUS_FIRE flip CAS-2375).
//   (2) TRAILCRAFT served enabled:TRUE (ya no false) + 15 flags del arco served true (0-regresión) ⇒ 16 flags true LIVE (incl FELLOWSHIP_BOND EVO#47 + FOCUS_FIRE EVO#62).
//   (3) DEFAULT-ON: trailcraft().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal lootQuality (RAREZA del drop, NO oro) ACTIVO en el build LIVE; ORTOGONALIDAD ⊥ goldFind ⊥ restedMult ⊥ wardRegen ⊥ oocMitigation (0 doble-conteo) contra el served.
//
// Eje FRESCO = DIVERSIDAD DE TERRENO (variedad CUALITATIVA): nº de TIPOS de bioma DISTINTOS pisados (zoneOf) en ventana deslizante, per-pid.
// Diferenciadores LIVE: OPUESTO a WAYFARER_ROAM #61 (amplitud/celdas) — vueltas en 1 bioma (muchas celdas)⇒variety 1⇒NUNCA abre; cruzar biomas DISTINTOS⇒ABRE;
//   1 marca⇒variety 1 (NO abre); N marcas MISMO bioma⇒variety 1; 1-tick dt=0.5 con variety≥2⇒craft≈0.5<2⇒T0 (permanencia).
// Run: node tools/cas2379-trailcraft-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2379-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "9aeb83a279a3";   // build deployado por el flip CAS-2378 (== version.json esperado)
const PREFLIP = "66ccf593d6c6";        // build servido ANTES del flip trailcraft (EVO#62 FOCUS_FIRE flip CAS-2375) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él, la autoridad) ─────────────────
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
// variety = nº de TIPOS de bioma DISTINTOS (m.b, no vacío) con t dentro de [now-win, now]. Reimplementación INDEPENDIENTE de trailVariety.
const oracleVariety = (marks, now, windowMs) => {
  if (!Array.isArray(marks) || !marks.length) return 0;
  const lo = (+now || 0) - Math.max(0, +windowMs || 0), hi = (+now || 0);
  const seen = new Set();
  for (const m of marks) { if (!m) continue; const t = +m.t || 0; if (t < lo || t > hi) continue; const k = String(m.b); if (k === "") continue; seen.add(k); }
  return seen.size;
};
const oracleTier = (craft, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if ((+craft || 0) >= (+tiers[i].min || 0)) idx = i + 1; return idx; };
const oracleSteps = (craft, tiers) => { const t = oracleTier(craft, tiers); return t > 0 ? (tiers[t - 1].steps | 0) : 0; };
const oracleFloor = (craft, tiers) => { const s = oracleSteps(craft, tiers); return s > 0 ? RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, 0 + s)] : ""; };
const oracleDecay = (base, dtSec, hlSec, cap) => { const w = base * Math.pow(0.5, dtSec / hlSec); return cap > 0 ? Math.min(cap, w) : w; };
const oracleAccrue = (marks, now, win, dt, accruePerSec, minVariety) => (oracleVariety(marks, now, win) >= minVariety ? accruePerSec * dt : 0);

// ── BIOMAS QA re-etiquetados (labels de variedad ≠ los del GE/DARK QA) ────────────────────
const QNOW = 9140000;   // reloj de pared QA FIJO (≠ 8.72M GE, ≠ 7.31M DARK QA) — proyección determinista, mismo en ambos clientes
const M = {
  empty: [],
  one:   [{ b: "mesa", t: QNOW }],
  same4: [{ b: "dune", t: QNOW - 4000 }, { b: "dune", t: QNOW - 3000 }, { b: "dune", t: QNOW - 2000 }, { b: "dune", t: QNOW - 1000 }],
  four:  [{ b: "mesa", t: QNOW - 3000 }, { b: "dune", t: QNOW - 2000 }, { b: "glade", t: QNOW - 1000 }, { b: "fen", t: QNOW }],
  three: [{ b: "mesa", t: QNOW - 2000 }, { b: "dune", t: QNOW - 1000 }, { b: "glade", t: QNOW }],
  stale: [{ b: "mesa", t: QNOW - 999000 }, { b: "dune", t: QNOW }],
  blank: [{ b: "", t: QNOW }, { b: "mesa", t: QNOW }],
};

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
  await page.evaluate((QNOW) => {
    window.__TNOW = QNOW;
    window.__tsnap = (pid, craft) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, push: { [pid]: { craft, atMs: window.__TNOW } } }); };
    window.__tat = (pid, craft, elapsedSec, zone) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); return window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW + (elapsedSec || 0) * 1000, push: { [pid]: { craft, atMs: window.__TNOW } }, toZone: zone }); };
    window.__tstep = (pid, marks, dt) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, marks: { [pid]: marks } }); window.__dev.trailcraft({ nowMs: window.__TNOW, step: { [pid]: { dt } } }); };
    window.__tpick = (pid, craft) => {
      window.__dev.trailcraft({ enabled: true });
      const zones = window.__dev.trailcraft().zones || [];
      for (const z of zones) {
        window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
        const s = window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, push: { [pid]: { craft, atMs: window.__TNOW } }, toZone: z });
        if (s.zone === z && s.craftable) return { zone: z, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor };
      }
      return null;
    };
  }, QNOW);
}

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installQA(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

async function runOnce(round) {
  console.log(`\n===== CAS-2379 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido — 15 flags arco served true + TRAILCRAFT served true (0-regresión)
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const trailServed = en("TRAILCRAFT");            // EVO#63 — DEBE estar served true (flip CAS-2378 landed)

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + TRAILCRAFT served true + 15 arco true + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.trailcraft && window.__dev.wayfarerRoam && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.trailcraft+5 canales arco+saveBlob+fp hooks; served TRAILCRAFT.enabled:true + 15 arco true (0 regr, 16 total) + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && trailServed === "true" && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} TRAILCRAFT=${trailServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: trailcraft().enabled===true (el flip cargó) + passive 0 sin diversidad; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.trailcraft(); return { enabled: s.enabled, floor: s.lootQualityFloor, tier: s.tier, craft: s.craft, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(963));
    window.__dev.trailcraft({ enabled: false, leave: true });
    const s = window.__dev.trailcraft();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(963));
    window.__dev.trailcraft({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, floor: s.lootQualityFloor, tag: s.tag, tier: s.tier, saveNoKey: !/["']trail(Server|Marks)?["']/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: trailcraft().enabled===true (flip cargó) + passive 0 sin diversidad; byte-id OFF (toggle): enabled false ⇒ floor \"\" + tag \"\" + save SIN clave trail/trailServer/trailMarks + fingerprint estable",
     dOn.enabled === true && dOn.floor === "" && dOn.tier === 0 && dOn.craft === 0 &&
     byteId.enabled === false && byteId.floor === "" && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installQA(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.trailcraft({ enabled: true }));
  const cfg = await page.evaluate(() => { const s = window.__dev.trailcraft({ enabled: true }); return { tiers: s.tiers, cap: s.capCraft, minVariety: s.minVariety, windowSec: s.windowSec, halfLifeSec: s.halfLifeSec, accruePerSec: s.accruePerSec, channel: s.channel, zones: s.zones }; });
  const WIN = cfg.windowSec * 1000;

  // 5 — ★ VARIEDAD (fn PURA trailVariety vía varietyProbe) cruzada contra ORÁCULO QA — biomas re-etiquetados
  const pr = await page.evaluate((M, WIN) => {
    window.__dev.trailcraft({ enabled: true, nowMs: window.__TNOW });
    const V = (marks) => window.__dev.trailcraft({ varietyProbe: { marks, now: window.__TNOW, windowMs: WIN } }).probe;
    return { empty: V(M.empty), one: V(M.one), same4: V(M.same4), four: V(M.four), three: V(M.three), stale: V(M.stale), blank: V(M.blank) };
  }, M, WIN);
  const prKeys = ["empty", "one", "same4", "four", "three", "stale", "blank"];
  const prOk = prKeys.every(k => pr[k] === oracleVariety(M[k], QNOW, WIN));
  ok("5 ★ VARIEDAD (fn PURA) == ORÁCULO QA LIVE: []⇒0; 1 marca⇒1; 4 MISMO bioma⇒1 (OPUESTO Wayfarer); 4 distintos⇒4; 3 distintos⇒3; fuera-de-ventana⇒1; bioma \"\"⇒1",
     prOk && pr.empty === 0 && pr.one === 1 && pr.same4 === 1 && pr.four === 4 && pr.three === 3 && pr.stale === 1 && pr.blank === 1,
     JSON.stringify(pr));

  // 6 — ★ TABLA tiers + steps + floor == ORÁCULO QA para craft 1..7 (en zona)
  const tab = await page.evaluate(() => {
    const w = window.__tpick("qSelf", 6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 3, 4, 5, 6, 7]) {
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      const vm = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: c, atMs: window.__TNOW } }, toZone: zone });
      out.push({ c, craft: vm.craft, tier: vm.tier, steps: vm.steps, floor: vm.floor });
    }
    return { zone, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => near(r.craft, r.c) && r.tier === oracleTier(r.c, cfg.tiers) && r.steps === oracleSteps(r.c, cfg.tiers) && r.floor === oracleFloor(r.c, cfg.tiers));
  ok("6 ★ TABLA tiers+steps+floor == ORÁCULO QA LIVE (craft 1→T0/0/\"\"; 2,3→T1/1/uncommon; 4,5→T2/1/uncommon; 6,7→T3/2/rare) determinista, monótona",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 — server-authoritative reflect + validate (per-pid + clamp craft negativo)
  const refl = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones; const z0 = zones[0];
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 4, atMs: window.__TNOW }, qOther: { craft: 6, atMs: window.__TNOW } }, toZone: z0 });
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const neg = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: -9, atMs: window.__TNOW } }, toZone: z0 });
    return { z0, selfCraft: s.craft, mapSelf: s.craftMap ? s.craftMap.qSelf : null, mapOther: s.craftMap ? s.craftMap.qOther : null, negCraft: neg.craft, negTier: neg.tier, negMap: neg.craftMap };
  });
  const reflOk = near(refl.selfCraft, 4) && near(refl.mapSelf, 4) && near(refl.mapOther, 6) && refl.negCraft === 0 && refl.negTier === 0 && !(refl.negMap && ("qSelf" in refl.negMap));
  ok("7 SERVER-AUTHORITATIVE reflect+validate per-pid LIVE: qSelf refleja craft 4 (LOCAL) mientras qOther=6 coexiste en craftMap; craft negativo ⇒ 0 (clamp, ausente del map)",
     reflOk, JSON.stringify(refl));

  // 8 — ★ ACUMULADOR sostenido (marks+step) == ORÁCULO (accruePerSec·dt si variety≥minVariety)
  const acc = await page.evaluate((M) => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const dt of [2, 4, 6]) {
      window.__tstep("qSelf", M.three, dt);
      const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
      out.push({ dt, craft: s.craft, tier: s.tier });
    }
    return { zone, out };
  }, M);
  const accOk = !acc.bad && acc.out.every(r => near(r.craft, oracleAccrue(M.three, QNOW, WIN, r.dt, cfg.accruePerSec, cfg.minVariety)) && r.tier === oracleTier(r.craft, cfg.tiers));
  ok("8 ★ ACUMULADOR sostenido == ORÁCULO QA LIVE: 3 biomas distintos sostenido dt=2⇒2(T1); dt=4⇒4(T2); dt=6⇒6(T3) = accruePerSec·dt exacto",
     accOk, JSON.stringify(acc.out));

  // 9 — ★ DIFERENCIADOR — OPUESTO a Wayfarer: MISMO bioma (muchas marcas/celdas)⇒variety1⇒NO abre; distintos⇒ABRE; 1-marca⇒NO; 1-tick⇒0 (permanencia)
  const diff = await page.evaluate((M) => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (marks, dt) => { window.__tstep("qSelf", marks, dt); const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone }); return { craft: s.craft, tier: s.tier, floor: s.floor }; };
    return {
      zone,
      same4: read(M.same4, 6),
      one:   read(M.one, 6),
      four:  read(M.four, 6),
      tick:  read(M.four, 0.5),
    };
  }, M);
  const diffOk = !diff.bad && near(diff.same4.craft, 0) && diff.same4.tier === 0 && diff.same4.floor === "" &&
    near(diff.one.craft, 0) && diff.one.tier === 0 &&
    diff.four.craft >= 6 && diff.four.tier === 3 && diff.four.floor === "rare" &&
    near(diff.tick.craft, 0.5) && diff.tick.tier === 0 && diff.tick.floor === "";
  ok("9 ★ DIFERENCIADOR LIVE (OPUESTO Wayfarer): MISMO bioma×4 (muchas celdas)⇒variety1⇒NO abre; 1-marca⇒NO; 4 distintos⇒ABRE(T3/rare); 1-tick dt=0.5⇒0 (permanencia)",
     diffOk, JSON.stringify(diff));

  // 10 — ★ DECAY determinista 0-RNG por vida-media (25s) == ORÁCULO a tres instantes
  const decay = await page.evaluate(() => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone;
    const at0 = window.__tat("qSelf", 8, 0, zone);
    const hl1 = window.__tat("qSelf", 8, 25, zone);
    const hl2 = window.__tat("qSelf", 8, 50, zone);
    return { zone, base: at0.craft, baseT: at0.tier, hl1: hl1.craft, hl1T: hl1.tier, hl2: hl2.craft, hl2T: hl2.tier };
  });
  const decOk = !decay.bad && near(decay.base, oracleDecay(8, 0, cfg.halfLifeSec, cfg.cap)) &&
    near(decay.hl1, oracleDecay(8, 25, cfg.halfLifeSec, cfg.cap)) && near(decay.hl2, oracleDecay(8, 50, cfg.halfLifeSec, cfg.cap)) &&
    decay.baseT === 3 && decay.hl1T === 2 && decay.hl2T === 1;
  ok("10 ★ DECAY determinista 0-RNG por vida-media == ORÁCULO QA LIVE: base 8(T3); +25s⇒4(T2); +50s⇒2(T1)",
     decOk, JSON.stringify(decay));

  // 11 — ★ PATH→bioma (zoneOf REAL) diferenciador Wayfarer: vueltas en 1 zona⇒variety1⇒NO; cruzar 3 zonas distintas⇒variety3⇒ABRE
  const pathRes = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones || [];
    const spots = [];
    for (const z of zones) { const s = window.__dev.trailcraft({ toZone: z }); if (s.zone === z) spots.push({ z, x: window.__dev.trailcraft().hero.x, y: window.__dev.trailcraft().hero.y }); if (spots.length >= 3) break; }
    if (spots.length < 3) return { bad: true, got: spots.length };
    const home = spots[0].z;
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const loopPath = [0, 1, 2, 3, 4].map(i => ({ x: spots[0].x + (i % 2), y: spots[0].y + (i % 2), t: window.__TNOW }));
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, path: { qSelf: loopPath } });
    window.__dev.trailcraft({ nowMs: window.__TNOW, step: { qSelf: { dt: 6 } } });
    const loop = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: home });
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const crossPath = spots.map(s => ({ x: s.x, y: s.y, t: window.__TNOW }));
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, path: { qSelf: crossPath } });
    window.__dev.trailcraft({ nowMs: window.__TNOW, step: { qSelf: { dt: 6 } } });
    const cross = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: home });
    return { home, biomes: spots.map(s => s.z), loopCraft: loop.craft, loopTier: loop.tier, crossCraft: cross.craft, crossTier: cross.tier, crossFloor: cross.floor };
  });
  const pathOk = !pathRes.bad && near(pathRes.loopCraft, 0) && pathRes.loopTier === 0 &&
    pathRes.crossCraft >= 6 && pathRes.crossTier === 3 && pathRes.crossFloor === "rare";
  ok("11 ★ PATH→bioma (zoneOf REAL) LIVE: LOOP en 1 zona (muchas posiciones)⇒variety1⇒NO abre; CRUZAR 3 zonas distintas⇒variety3⇒ABRE(T3/rare) — diferenciador Wayfarer con biomas reales",
     pathOk, JSON.stringify(pathRes));

  // 12 — ★ CANAL lootQuality wired + BYTE-NEUTRO seam (seed-fijo) — OFF ⇒ floorRarity==baseRarity byte-id; abierto ⇒ floorRarity≥baseRarity y ≥ piso del tier
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function trailcraftFloor\(\)/.test(simSrc) && /rollGearInst\(srand,win\[0\],win\[1\],\s*trailcraftFloor\(\)\|\|undefined\)/.test(simSrc) && /if\(!TRAILCRAFT\.enabled\)\s*return\s*"";/.test(simSrc);
  const loot = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: false });
    const seeds = [0x1111, 0x2222, 0x3333, 0x4444];
    const offSame = seeds.map(seed => { const lp = window.__dev.trailcraft({ lootTick: { seed, tmin: 1, tmax: 2 } }).lootPicked; return lp && lp.floor === "" && lp.baseRarity === lp.floorRarity; });
    window.__dev.trailcraft({ enabled: true });
    const w = window.__tpick("qSelf", 6); const zone = w.zone;
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    const open = seeds.map(seed => window.__dev.trailcraft({ lootTick: { seed, tmin: 1, tmax: 2 } }).lootPicked);
    return { offSame, open, steps: window.__dev.trailcraft().steps };
  });
  const lootOk = seamWired && loot.offSame.every(Boolean) &&
    loot.open.every(lp => lp && lp.floor === "rare" && RANK[lp.floorRarity] >= RANK[lp.baseRarity] && RANK[lp.floorRarity] >= RANK.rare);
  ok("12 ★ CANAL lootQuality wired (served) + BYTE-NEUTRO seam LIVE: OFF ⇒ floorRarity==baseRarity (byte-id vs HEAD, 4 semillas); sendero T3 abierto ⇒ floor rare, floorRarity≥baseRarity y ≥rare",
     lootOk, `wired=${seamWired} offSame=${JSON.stringify(loot.offSame)} open=${JSON.stringify(loot.open)}`);

  // 13 — ★ ORTOGONALIDAD 5 canales: abrir lootQuality (rareza) NO toca goldFind/restedMult/wardRegen/oocMitigation; y abrir esos NO crea floor
  const orth = await page.evaluate(() => {
    window.__dev.kinship({ enabled: false }); window.__dev.focus({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    const w = window.__tpick("qSelf", 6); if (!w) return { bad: true };
    const zone = w.zone;
    const a = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    const floorAlone = a.lootQualityFloor, goldAlone = a.goldFindMul, restedAlone = a.restedXpMult, wardAlone = a.wardRegenMul, oocAlone = a.oocMitigMul;
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__TNOW }); window.__dev.kinship({ nowMs: window.__TNOW, push: { [zone]: { kinship: 6, atMs: window.__TNOW } }, toZone: zone });
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__TNOW }); window.__dev.convoy({ nowMs: window.__TNOW, push: { [zone]: { march: 6, atMs: window.__TNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__TNOW }); window.__dev.ward({ nowMs: window.__TNOW, push: { [zone]: { ward: 6, atMs: window.__TNOW } }, toZone: zone });
    const b = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.focus({ enabled: true }); window.__dev.convoy({ enabled: true }); window.__dev.ward({ enabled: true }); window.__dev.wayfarerRoam({ enabled: true });
    return { zone, channel: a.channel, floorAlone, goldAlone, restedAlone, wardAlone, oocAlone,
      floorAfter: b.lootQualityFloor, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul };
  });
  const orthOk = !orth.bad && orth.channel === "lootQuality" && orth.floorAlone === "rare" &&
    orth.goldAlone === 0 && orth.wardAlone === 0 && orth.oocAlone === 0 &&
    orth.floorAfter === "rare" &&
    orth.goldAfter > 0 && orth.wardAfter > 0 && orth.restedAfter > orth.restedAlone;
  ok("13 ★ ORTOGONALIDAD 5 canales LIVE: trail solo ⇒ floor rare, goldFind/wardRegen/oocMitigation 0 (⊥); abrir kinship(goldFind)/convoy(restedMult)/ward(wardRegen) ⇒ suben SUS muls PERO floor de trail INTACTO (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 15 flags del arco served true + TRAILCRAFT served TRUE (16 flags true LIVE)
  ok("14 ★ 0-regresión LIVE: 15 flags del arco served enabled:true + TRAILCRAFT served TRUE (16 flags true LIVE incl FELLOWSHIP #47 + FOCUS_FIRE #62)",
     arcTrue && trailServed === "true", JSON.stringify({ ...arc, TRAILCRAFT: trailServed }));

  // 15 — ★ TRAILCRAFT en las 6 zonas broken=[]
  const zonesRes = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones; const broken = [];
    for (const z of zones) {
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: z });
      if (!(s.zone === z && s.craftable && s.tier === 3 && s.steps === 2 && s.floor === "rare")) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ TRAILCRAFT 6 zonas LIVE: las 6 de TRAILCRAFT.zones hospedan un sendero observable (craft 6 ⇒ T3 / floor rare) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 — render badge "Sendero:" (con colon — único, ≠ "Sendero Trillado" de WAYFARER_TRAIL) drawn ON + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0, cntTrillado = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Sendero:") >= 0) cnt++; if (t.indexOf("Sendero Trillado") >= 0) cntTrillado++; } return orig(t, x, y); };
    window.__dev.trailcraft({ enabled: true });
    const w = window.__tpick("qSelf", 6);
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { onCnt, fps, cntTrillado };
  });
  ok("16 render badge \"Sendero:\" (con colon, único vs \"Sendero Trillado\" de WAYFARER_TRAIL) se DIBUJA ON (count>0) + fps sano LIVE",
     badge.onCnt > 0 && badge.fps >= 30, `on=${badge.onCnt} fps=${badge.fps} trillado=${badge.cntTrillado}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate(() => { window.__dev.trailcraft({ enabled: true }); const w = window.__tpick("qSelf", 6); window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: w.zone }); });
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
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ crear/bootear página en 2º plano nunca llega al 'menu'.
  // Se crea, se trae al frente y se bootea CADA página en secuencia; inyección __dev síncrona + nowMs explícito ⇒ estado de A persiste cuando B pasa al frente.
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await boot(p);
    await p.evaluate(() => window.__dev.trailcraft({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const zone = await A.evaluate(() => (window.__dev.trailcraft({ enabled: true }).zones || [])[2]);   // ruins idx2 (North Star canónico del arco)

  // ambos clientes reciben el MISMO snapshot crudo per-pid {A,B}; cada uno se declara self=su-pid; MISMO reloj ⇒ craft/tier/steps/floor byte-id per-pid
  const readBoth = async (craftA, craftB, elapsedSec) => {
    const push = { A: { craft: craftA, atMs: QNOW }, B: { craft: craftB, atMs: QNOW } };
    const inj = (pg, selfPid) => pg.evaluate(({ push, zone, elapsedSec, QNOW, selfPid }) => {
      window.__dev.trailcraft({ enabled: true }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
      const s = window.__dev.trailcraft({ self: selfPid, nowMs: QNOW + (elapsedSec || 0) * 1000, push, toZone: zone });
      return { self: s.self, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor, nowMs: s.nowMs, map: s.craftMap };
    }, { push, zone, elapsedSec, QNOW, selfPid });
    const [a, b] = await Promise.all([inj(A, "A"), inj(B, "B")]);
    return { a, b };
  };

  let allEq = true, log = [];
  // (a) A y B con MISMO craft ⇒ self-craft byte-id (mismo snapshot/reloj), y craftMap idéntico en ambos (server-auth)
  const sustain = await readBoth(6, 6, 0);
  const mapEq = JSON.stringify(sustain.a.map) === JSON.stringify(sustain.b.map);
  const sustainEq = sustain.a.craft === sustain.b.craft && sustain.a.tier === sustain.b.tier && sustain.a.steps === sustain.b.steps && sustain.a.floor === sustain.b.floor;
  if (!(mapEq && sustainEq && sustain.a.tier === 3 && near(sustain.a.craft, 6))) allEq = false;
  log.push(`sustain:${sustainEq && mapEq ? "==T" + sustain.a.tier + "/" + sustain.a.floor : "DESYNC " + JSON.stringify(sustain.a) + "/" + JSON.stringify(sustain.b)}`);

  // (b) per-pid: A alto (craft 6→T3) vs B bajo (craft 3→T1) — cada self ve SU craft, pero el craftMap (autoridad) es idéntico
  const perpid = await readBoth(6, 3, 0);
  const perpidOk = perpid.a.self === "A" && near(perpid.a.craft, 6) && perpid.a.tier === 3 &&
    perpid.b.self === "B" && near(perpid.b.craft, 3) && perpid.b.tier === 1 &&
    JSON.stringify(perpid.a.map) === JSON.stringify(perpid.b.map);
  if (!perpidOk) allEq = false;
  log.push(`perpid:A(T${perpid.a.tier})/B(T${perpid.b.tier}) mapEq=${JSON.stringify(perpid.a.map) === JSON.stringify(perpid.b.map)}`);

  // (c) decay converge: base 8 +25s ⇒ 4 (T2) en ambos
  const decayed = await readBoth(8, 8, 25);
  const decayEq = decayed.a.craft === decayed.b.craft && near(decayed.a.craft, 4) && decayed.a.tier === 2 && decayed.b.tier === 2;
  if (!decayEq) allEq = false;
  log.push(`decay+25s:${decayEq ? "==T2" : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (d) A SALE de zona ⇒ floor "" (Δ_A=0) PERO craftMap server-auth + Δ_B INTACTOS. Reestablece snapshot limpio craft 6 en ambos antes del leave (estado determinista).
  await readBoth(6, 6, 0);
  const aLeaves = await A.evaluate(() => { const s = window.__dev.trailcraft({ self: "A", leave: true }); return { floor: s.floor, lootQualityFloor: s.lootQualityFloor, tier: s.tier, map: s.craftMap }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.trailcraft({self:"B",nowMs:N,toZone:${JSON.stringify(zone)}}); return {craft:s.craft,tier:s.tier,floor:s.floor}; })()`);
  const leaveOk = aLeaves.floor === "" && aLeaves.lootQualityFloor === "" && aLeaves.map && (aLeaves.map.A || 0) > 0 && (aLeaves.map.B || 0) > 0 &&
    near(bIntact.craft, 6) && bIntact.tier === 3 && bIntact.floor === "rare";
  if (!leaveOk) allEq = false;
  log.push(`A-leave:Δ_A=${aLeaves.floor === "" ? "0" : aLeaves.floor} mapA=${aLeaves.map && aLeaves.map.A} mapB=${aLeaves.map && aLeaves.map.B} Δ_B=${bIntact.craft}/T${bIntact.tier}/${bIntact.floor}`);

  ok("17 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ craft/tier/steps/floor byte-idénticos + craftMap idéntico; per-pid A(T3) vs B(T1); decay converge (T2); A sale ⇒ floor \"\" (Δ_A=0) PERO craftMap+Δ_B INTACTOS (0 desync)",
     allEq, log.join("  "));
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
console.log(`\n=====  CAS-2379 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
