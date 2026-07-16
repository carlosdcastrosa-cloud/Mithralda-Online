// CAS-2389 — QA INDEPENDIENTE POST-FLIP (2-cliente) para DELVE / DESCENSO **LIVE** (DELVE.enabled:true, flip CAS-2387/2388). EVO mecánica #64.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local ni el Higgsfield retirado.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2380-delve-{selfverify,observable-qa}.mjs):
//   · Oráculos re-derivados en Node: oracleBands / oracleTier / oracleCrit / oracleDecay / oracleCritTotal reimplementados desde la spec (NO importados de sim.js), cruzados CONTRA el VM (__dev.delve), la autoridad.
//   · Reloj de pared FIJO propio de QA (QNOW=8.780M, distinto del GE 9.14M y de la DARK QA 8.642M) ⇒ una copia de los números no pasaría en silencio.
//   · PIDS RE-ETIQUETADOS (cli-A/cli-B/peer) — server-auth per-pid, invariante por renombrado.
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT f4c877cf5725 (flip CAS-2387) y AVANZÓ del pre-flip 9aeb83a279a3 (EVO#63 TRAILCRAFT flip CAS-2378).
//   (2) DELVE served enabled:TRUE (ya no false) + 16 flags del arco served true (0-regresión) ⇒ 17 flags true LIVE; ERUDITION #65 sigue DARK (false/absent).
//   (3) DEFAULT-ON: delve().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal critChance (PROBABILIDAD de crítico, precisión ofensiva) ACTIVO en el build LIVE con CAP DURO absoluto (critCapPct=50=0.5 abs); ORTOGONALIDAD ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality.
//
// Eje FRESCO = PROFUNDIDAD / DESCENSO VERTICAL: nº de BANDAS de profundidad DISTINTAS alcanzadas (depthBandOf=ZONE_TIER.tier) en ventana 30s, per-pid, decay half-life 25s.
// Diferenciadores LIVE: quieto en 1 banda profunda⇒bands 1⇒NUNCA abre (no por posición absoluta); DESCENDER K bandas distintas⇒bands K⇒abre por tiers.
//   ORTOGONAL a Trailcraft #63 (diversidad de TIPOS): 2 zonas MISMO tier⇒bands 1 (Trailcraft contaría 2 tipos). ⊥ Kinship/Wayfarer.
// Run: node tools/cas2389-delve-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2389-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "f4c877cf5725";   // build deployado por el flip DELVE CAS-2387 (== version.json esperado)
const PREFLIP = "9aeb83a279a3";        // build servido ANTES del flip DELVE (EVO#63 TRAILCRAFT flip CAS-2378) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the spec; NOT imported from sim.js) ──
const CFG = { minBands: 2, halfLifeSec: 25, accruePerSec: 1, capDelve: 12, critCapPct: 50, windowSec: 30,
  tiers: [{ min: 2, bands: 2, critPct: 8 }, { min: 4, bands: 3, critPct: 15 }, { min: 6, bands: 5, critPct: 25 }] };
const oracleBands = (marks, now, winMs) => {   // nº de bandas d>0 DISTINTAS con t ∈ [now-win, now]
  if (!Array.isArray(marks)) return 0; const lo = now - winMs; const set = new Set();
  for (const m of marks) { const d = (m && +m.d) | 0, t = +(m && m.t) || 0; if (d > 0 && t >= lo && t <= now) set.add(d); }
  return set.size;
};
const oracleTier = (delve, bands) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { const t = CFG.tiers[i]; if (delve >= t.min && bands >= t.bands) idx = i + 1; } return idx; };
const oracleCrit = (delve, bands) => { const t = oracleTier(delve, bands); return t > 0 ? CFG.tiers[t - 1].critPct : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capDelve, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));
const oracleCritTotal = (base, bonus) => base + Math.min(bonus, Math.max(0, CFG.critCapPct - base));

const QNOW = 8780000;   // reloj de pared QA FIJO (≠ 9.14M GE, ≠ 8.642M DARK QA) — proyección determinista, mismo en ambos clientes.

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2", key: "2", bubbles: true })));  // class 2 (re-labeled vs GE class 1)
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

async function installDelve(page) {
  await page.evaluate((QNOW) => {
    window.__QN = QNOW;
    window.__marks = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ d: i + 1, t: (t == null ? window.__QN : t) }); return o; };
    window.__setmarks = (pid, marks) => { window.__dev.delve({ clear: true, nowMs: window.__QN }); window.__dev.delve({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    window.__step = (pid, dt) => window.__dev.delve({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    window.__set = (pid, delve, bands) => { window.__dev.delve({ clear: true, nowMs: window.__QN }); window.__dev.delve({ nowMs: window.__QN, self: pid, delve, bands, pid, atMs: window.__QN }); };
    window.__pick = (delve, bands) => {
      window.__dev.delve({ enabled: true, self: "self" });
      const zones = window.__dev.delve().zones || [];
      for (const z of zones) {
        window.__dev.delve({ clear: true, nowMs: window.__QN });
        const s = window.__dev.delve({ nowMs: window.__QN, self: "self", delve, bands, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.delvable) return { zone: z, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct };
      }
      return null;
    };
  }, QNOW);
}

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installDelve(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function runOnce(round) {
  console.log(`\n===== CAS-2389 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido — 16 flags arco served true + DELVE served true (0-regr) + ERUDITION served false (DARK)
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const delveServed = en("DELVE");                 // EVO#64 — DEBE estar served true (flip CAS-2387 landed)
  const erudServed = en("ERUDITION");              // EVO#65 — DEBE seguir DARK (false o ABSENT)
  const critCapServed = /critCapPct:\s*50/.test(cfgSrc);

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + DELVE served true + 16 arco true + ERUDITION dark + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.delve && window.__dev.trailcraft && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.delve+arc hooks+saveBlob+fp; served DELVE.enabled:true + 16 arco true (0 regr, 17 total) + ERUDITION dark + critCapPct:50 + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && delveServed === "true" && arcTrue && (erudServed === "false" || erudServed === "MISSING") && critCapServed && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} DELVE=${delveServed} ERUDITION=${erudServed} critCap50=${critCapServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: delve().enabled===true (el flip cargó) + passive 0 sin descenso; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.delve(); return { enabled: s.enabled, tier: s.tier, delve: s.delve, bands: s.bands, critBonusPct: s.critBonusPct, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(412));
    window.__dev.delve({ enabled: false, leave: true });
    const s = window.__dev.delve();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(412));
    window.__dev.delve({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, tier: s.tier, bonus: s.critBonusPct, tag: s.tag, saveNoKey: !/["']delve(Server|Marks)?["']/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: delve().enabled===true (flip cargó) + passive 0 sin descenso; byte-id OFF (toggle): enabled false ⇒ tier 0 + tag \"\" + save SIN clave delve/delveServer/delveMarks + fingerprint estable (0 RNG drift)",
     dOn.enabled === true && dOn.tier === 0 && dOn.delve === 0 && dOn.bands === 0 && dOn.critBonusPct === 0 &&
     byteId.enabled === false && byteId.tier === 0 && byteId.bonus === 0 && byteId.tag === "" && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installDelve(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.delve({ enabled: true }));

  // 5 — ★ BANDS (fn PURA vía bandsProbe) cruzada contra ORÁCULO QA + depthBandOf=ZONE_TIER.tier
  const bandsData = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true });
    const win = 30000;
    const B = (marks) => window.__dev.delve({ bandsProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      one:    [{ d: 1, t: QNOW }],
      still:  [{ d: 4, t: QNOW - 4000 }, { d: 4, t: QNOW - 2000 }, { d: 4, t: QNOW }],
      four:   [{ d: 1, t: QNOW }, { d: 3, t: QNOW }, { d: 5, t: QNOW }, { d: 6, t: QNOW }],
      zeroband: [{ d: 0, t: QNOW }, { d: 3, t: QNOW }],
      expired: [{ d: 2, t: QNOW - 45000 }, { d: 5, t: QNOW }],
    };
    const vm = {}; for (const k in cases) vm[k] = B(cases[k]);
    const bandOf = (z) => window.__dev.delve({ toZone: z }).band;
    return { cases, vm, forest: bandOf("forest"), ruins: bandOf("ruins"), caves: bandOf("caves"), abyss: bandOf("abyss"), frost: bandOf("frost"), swamp: bandOf("swamp") };
  }, QNOW);
  const bandsOracleOk = Object.keys(bandsData.cases).every(k => bandsData.vm[k] === oracleBands(bandsData.cases[k], QNOW, 30000));
  const expBand = { forest: 1, ruins: 2, caves: 3, abyss: 5, frost: 6, swamp: 4 };
  const bandOfOk = Object.keys(expBand).every(z => bandsData[z] === expBand[z]);
  ok("5 ★ BANDS = fn PURA (VM probe == oracle re-derivado) LIVE: 1⇒1; N misma⇒1; distintas⇒K; banda0⇒excl; fuera-ventana⇒excl. depthBandOf=ZONE_TIER.tier (forest1/ruins2/caves3/swamp4/abyss5/frost6)",
     bandsOracleOk && bandOfOk, `vm=${JSON.stringify(bandsData.vm)} band=${JSON.stringify(expBand)}`);

  // 6 — TABLA de tiers = fn PURA de (delve,bands) — VM vs oracle sobre 5 casos
  const tab = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const [dv, bn] of [[6, 5], [6, 3], [6, 2], [1, 5], [6, 1]]) {
      window.__dev.delve({ clear: true, nowMs: QNOW });
      const s = window.__dev.delve({ nowMs: QNOW, self: "self", delve: dv, bands: bn, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ dv, bn, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.delve, r.dv) && r.bands === r.bn && r.tier === oracleTier(r.dv, r.bn) && r.critPct === oracleCrit(r.dv, r.bn));
  ok("6 TABLA de tiers = fn PURA (VM == oracle) LIVE: (6,5)→T3+25; (6,3)→T2+15; (6,2)→T1+8; (1,5)→T0 (delve<min); (6,1)→T0 (bands<minBands)",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 — server-auth reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", push: { "cli-A": { delve: 8, bands: 5, atMs: QNOW }, peer: { delve: 5, bands: 3, atMs: QNOW } } });
    const at0 = window.__dev.delve({ nowMs: QNOW });
    const at25 = window.__dev.delve({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.delve({ nowMs: QNOW + 50000 });
    return { a0: at0.delveMap["cli-A"], p0: at0.delveMap.peer, a25: at25.delveMap["cli-A"], a50: at50.delveMap["cli-A"], b0: at0.bandsMap, b25: at25.bandsMap };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02) &&
    refl.b0["cli-A"] === 5 && refl.b0.peer === 3 && refl.b25["cli-A"] === 5;
  ok("7 SERVER-AUTH reflect+project LIVE: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s); bands sin decaer (server-auth) per-pid",
     reflOk, JSON.stringify(refl));

  // 8 — ★ ACUMULADOR = fn de BANDS (step)
  const acc = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    window.__setmarks("self", [{ d: 6, t: QNOW - 2000 }, { d: 6, t: QNOW - 1000 }, { d: 6, t: QNOW }]);   // 1 banda (quieto)
    window.__dev.delve({ toZone: zone });
    const one = window.__step("self", 5);
    window.__setmarks("self", [{ d: 1, t: QNOW }, { d: 2, t: QNOW }, { d: 3, t: QNOW }, { d: 5, t: QNOW }, { d: 6, t: QNOW }]);   // 5 bandas
    window.__dev.delve({ toZone: zone });
    const tick1 = window.__step("self", 0.5);
    const s2 = window.__step("self", 1.5);
    const s3 = window.__step("self", 2);
    const s4 = window.__step("self", 2);
    return { zone, oneDelve: one.delve, oneBands: one.bands, tick1Delve: tick1.delve, s2delve: s2.delve, s3delve: s3.delve, s4delve: s4.delve };
  }, QNOW);
  const accTiers = await page.evaluate((QNOW, acc) => {
    const zone = acc.zone; const rd = (dv) => { window.__dev.delve({ clear: true, nowMs: QNOW }); return window.__dev.delve({ nowMs: QNOW, self: "self", delve: dv, bands: 5, pid: "self", atMs: QNOW, toZone: zone }).tier; };
    return { t1: rd(acc.tick1Delve), t2: rd(acc.s2delve), t3: rd(acc.s3delve), t4: rd(acc.s4delve) };
  }, QNOW, acc);
  const accOk = !acc.bad && near(acc.oneDelve, 0) && acc.oneBands === 1 &&
    acc.tick1Delve > 0 && acc.tick1Delve < 2 && oracleTier(acc.tick1Delve, 5) === 0 && accTiers.t1 === 0 &&
    accTiers.t2 >= 1 && accTiers.t3 >= 2 && accTiers.t4 === 3;
  ok("8 ★ ACUMULADOR = fn de BANDS LIVE: 1 banda⇒add 0 (nunca abre, no por posición); 5 bandas 1-tick dt=0.5⇒delve<2⇒T0 (permanencia, oracle); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify({ acc, accTiers }));

  // 9 — ★ DIFERENCIADOR (bands vertical, ortogonal a Trailcraft tipos)
  const diff = await page.evaluate((QNOW) => {
    const win = 30000; const B = (marks) => window.__dev.delve({ bandsProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const stillDeep = B([{ d: 6, t: QNOW - 6000 }, { d: 6, t: QNOW - 5000 }, { d: 6, t: QNOW - 4000 }, { d: 6, t: QNOW - 3000 }, { d: 6, t: QNOW - 2000 }, { d: 6, t: QNOW - 1000 }, { d: 6, t: QNOW }]);
    const descend = B([{ d: 1, t: QNOW - 4000 }, { d: 2, t: QNOW - 3000 }, { d: 3, t: QNOW - 2000 }, { d: 5, t: QNOW - 1000 }, { d: 6, t: QNOW }]);
    const sameTier = B([{ d: 4, t: QNOW - 1000 }, { d: 4, t: QNOW }]);   // 2 zonas MISMO tier 4 ⇒ 1 banda (Trailcraft contaría 2 tipos)
    return { stillDeep, descend, sameTier };
  }, QNOW);
  const diffOk = diff.stillDeep === 1 && diff.descend === 5 && diff.sameTier === 1 &&
    diff.stillDeep === oracleBands([{ d: 6, t: QNOW }], QNOW, 30000);
  ok("9 ★ DIFERENCIADOR LIVE: quieto 1 banda profunda⇒bands 1⇒NO abre (no por posición); DESCENDER 5 bandas⇒bands 5 (VERTICAL); 2 zonas MISMO tier⇒bands 1 (ORTOGONAL a Trailcraft diversidad de tipos)",
     diffOk, JSON.stringify(diff));

  // 10 — ★ DECAY steps tier down — cross-check oracle a +hl y +2·hl
  const decay = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.delve({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.delve({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.delve, t0: a0.tier, c0: a0.critPct, d25: a25.delve, t25: a25.tier, c25: a25.critPct, d50: a50.delve, t50: a50.tier, c50: a50.critPct };
  }, QNOW);
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && decay.c0 === 25 &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000), 5) && decay.c25 === oracleCrit(oracleDecay(6, 25000), 5) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000), 5) && decay.t50 === 0;
  ok("10 ★ DECAY 0-RNG vida-media (VM == oracle) LIVE: 6(T3+25)→3@25s(T1+8)→1.5@50s(T0). El min crece por tier ⇒ decay baja el tier gradual",
     decayOk, JSON.stringify(decay));

  // 11 — PASSIVE aislado (critChance)
  const pass = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 3); if (!w) return { bad: true };   // T2 +15
    const inz = window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.delve({ leave: true });
    return { zone: w.zone, inBonus: inz.critBonusPct, inTier: inz.tier, inPct: inz.critPct, outBonus: out.critBonusPct, outTier: out.tier };
  }, QNOW);
  ok("11 PASSIVE aislado (critChance) LIVE: en zona con delve6,bands3 ⇒ critBonusPct==tier.critPct (T2=+15); leave ⇒ 0 + tier 0",
     !pass.bad && pass.inBonus === 15 && pass.inTier === 2 && pass.inPct === 15 && pass.outBonus === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 — ★ CANAL critChance wired (served sim.js) + CAP DURO absoluto (grep seam + critTick vs oracle)
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function delveCritBonusPct/.test(simSrc) &&
    /const db=delveCritBonusPct\(\)/.test(simSrc) && /critPct\+=Math\.min\(db,room\)/.test(simSrc);
  const crit = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true };   // T3 +25
    window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    const capped = window.__dev.delve({ critTick: { base: 40 } }).critPicked;    // 40+25 ⇒ cap 50
    const uncapped = window.__dev.delve({ critTick: { base: 10 } }).critPicked;  // 10+25 ⇒ 35
    window.__dev.delve({ enabled: false });
    const off = window.__dev.delve({ critTick: { base: 40 } }).critPicked;
    const offTag = window.__dev.delve().tag;
    window.__dev.delve({ enabled: true });
    return { capped, uncapped, off, offTag };
  }, QNOW);
  const critOk = !crit.bad &&
    crit.capped.total === oracleCritTotal(40, 25) && crit.capped.total === 50 && crit.capped.capped === true && crit.capped.delveBonus === 25 &&
    crit.uncapped.total === oracleCritTotal(10, 25) && crit.uncapped.total === 35 && crit.uncapped.capped === false &&
    crit.off.total === 40 && crit.off.delveBonus === 0 && crit.offTag === "";
  ok("12 ★ CANAL critChance wired (served sim.js) + CAP DURO ≤0.5abs (grep seam + VM==oracle) LIVE: base40+25⇒cap 50 (capped, el bono NUNCA reduce base); base10+25⇒35; OFF ⇒ total==base (40) byte-id + tag \"\"",
     seamWired && critOk, `wired=${seamWired} ${JSON.stringify(crit)}`);

  // 13 — ★ ORTOGONALIDAD critChance ⊥ 5 canales
  const orth = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    const a = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    const critBefore = a.critBonusPct, restedBefore = a.restedXpMult;
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: QNOW });
    window.__dev.convoy({ nowMs: QNOW, push: { [zone]: { march: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: QNOW });
    window.__dev.kinship({ nowMs: QNOW, push: { [zone]: { kinship: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: QNOW });
    window.__dev.ward({ nowMs: QNOW, push: { [zone]: { ward: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: [{ c: "0,0", t: QNOW }, { c: "1,0", t: QNOW }, { c: "2,0", t: QNOW }, { c: "3,0", t: QNOW }] }, toZone: zone });
    window.__dev.trailcraft({ enabled: true, self: "self" }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
    window.__dev.trailcraft({ nowMs: QNOW, self: "self", craft: 6, pid: "self", atMs: QNOW, toZone: zone });
    const b = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, critBefore, restedBefore, critAfter: b.critBonusPct, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, restedAfter: b.restedXpMult };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "critChance" && orth.critBefore === 25 && orth.critAfter === orth.critBefore &&
    orth.restedAfter >= orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "";
  ok("13 ★ ORTOGONALIDAD critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality LIVE: abrir descenso NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT NO cambia el bono critChance (25→25)",
     orthOk, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 16 flags del arco served true + DELVE served TRUE (17 flags true) + ERUDITION dark
  ok("14 ★ 0-regresión LIVE: 16 flags del arco served enabled:true + DELVE served TRUE (17 flags true LIVE incl TRAILCRAFT #63) + ERUDITION #65 dark (false/absent)",
     arcTrue && delveServed === "true" && (erudServed === "false" || erudServed === "MISSING"), JSON.stringify({ ...arc, DELVE: delveServed, ERUDITION: erudServed }));

  // 15 — ★ DESCENSO en las 6 zonas broken=[]
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    const zones = window.__dev.delve().zones; const broken = [];
    for (const z of zones) {
      window.__dev.delve({ clear: true, nowMs: QNOW });
      const s = window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.delvable && s.tier === 3 && s.critPct === 25)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("15 ★ DESCENSO 6 zonas LIVE: las 6 de DELVE.zones hospedan el pasivo (delve6+bands5⇒T3, critPct 25) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 — render badge "Descenso:" (colon único, ≠ Sendero/Sendero Trillado) drawn ON + fps
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Descenso:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__pick(6, 5); window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { onCnt, fps };
  }, QNOW);
  ok("16 render badge \"Descenso:\" (colon único, no colisiona con Sendero/Sendero Trillado) se DIBUJA ON (count>0) + fps sano LIVE",
     badge.onCnt > 0 && badge.fps >= 30, `on=${badge.onCnt} fps=${badge.fps}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate((QNOW) => { window.__dev.delve({ enabled: true }); const w = window.__pick(6, 5); window.__dev.delve({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
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
    await p.evaluate(() => window.__dev.delve({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  // idx3 = abyss (band 5) — North Star canónico del descenso profundo
  const zone = await A.evaluate(() => (window.__dev.delve({ enabled: true }).zones || [])[3]);

  // ambos clientes reciben el MISMO snapshot crudo per-pid; cada uno se declara self=su-pid; MISMO reloj ⇒ delve/bands/tier/crit byte-id per-pid
  const readBoth = async (elapsedSec) => {
    const inj = (pg, selfPid) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
      window.__dev.delve({ enabled: true, self });
      window.__dev.delve({ clear: true, nowMs: QNOW });
      const s = window.__dev.delve({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
        "cli-A": { delve: 6, bands: 5, atMs: QNOW }, "cli-B": { delve: 2, bands: 2, atMs: QNOW }, peer: { delve: 6, bands: 5, atMs: QNOW },
      }, toZone: zone });
      return { self: s.self, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct, nowMs: s.nowMs, map: s.delveMap, bmap: s.bandsMap };
    }, { self: selfPid, elapsedSec, zone, QNOW });
    const [a, b] = await Promise.all([inj(A, "peer"), inj(B, "peer")]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };

  let allEq = true, log = [];
  // (a) MISMO snapshot+reloj (peer=T3+25) ⇒ delve/bands/tier/crit byte-id + delveMap idéntico (server-auth)
  const shared = await readBoth(0);
  const sharedOk = shared.eq && shared.a.tier === 3 && near(shared.a.delve, 6) && shared.a.critPct === 25;
  if (!sharedOk) allEq = false;
  log.push(`shared:${shared.eq ? "==T" + shared.a.tier + "/+" + shared.a.critPct : "DESYNC " + JSON.stringify(shared.a) + "/" + JSON.stringify(shared.b)}`);

  // (b) decay converge: peer 6 +25s ⇒ 3 (T1 +8) en ambos
  const decayed = await readBoth(25);
  const decayEq = decayed.eq && decayed.a.tier === 1 && near(decayed.a.delve, oracleDecay(6, 25000), 0.02) && decayed.a.critPct === 8;
  if (!decayEq) allEq = false;
  log.push(`decay+25s:${decayEq ? "==T1/+8" : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (c) per-pid: A=cli-A (T3+25) vs B=cli-B (T1+8) — cada self ve SU delve, pero delveMap (autoridad) idéntico
  const push = { "cli-A": { delve: 6, bands: 5, atMs: QNOW }, "cli-B": { delve: 2, bands: 2, atMs: QNOW } };
  const rA = await A.evaluate(({ zone, QNOW, push }) => { window.__dev.delve({ enabled: true, self: "cli-A" }); window.__dev.delve({ clear: true, nowMs: QNOW }); const s = window.__dev.delve({ nowMs: QNOW, self: "cli-A", push, toZone: zone }); return { self: s.self, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, QNOW, push });
  const rB = await B.evaluate(({ zone, QNOW, push }) => { window.__dev.delve({ enabled: true, self: "cli-B" }); window.__dev.delve({ clear: true, nowMs: QNOW }); const s = window.__dev.delve({ nowMs: QNOW, self: "cli-B", push, toZone: zone }); return { self: s.self, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, QNOW, push });
  const perpidOk = rA.self === "cli-A" && rA.tier === 3 && rA.critPct === 25 &&
    rB.self === "cli-B" && rB.tier === 1 && rB.critPct === 8 &&
    JSON.stringify(rA.map) === JSON.stringify(rB.map);
  if (!perpidOk) allEq = false;
  log.push(`perpid:A(T${rA.tier}/+${rA.critPct})/B(T${rB.tier}/+${rB.critPct}) mapEq=${JSON.stringify(rA.map) === JSON.stringify(rB.map)}`);

  // (d) A SALE de zona ⇒ crit 0 (Δ_A=0) PERO delveMap server-auth + Δ_B INTACTOS. Reestablece snapshot limpio en ambos antes del leave.
  await readBoth(0);
  const aLeaves = await A.evaluate(() => { const s = window.__dev.delve({ leave: true }); return { bonus: s.critBonusPct, tier: s.tier, map: s.delveMap, delve: s.delve }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.delve({self:"cli-B",nowMs:N,toZone:${JSON.stringify(zone)}}); return {bonus:s.critBonusPct,tier:s.tier,delve:s.delve}; })()`);
  const leaveOk = aLeaves.bonus === 0 && aLeaves.tier === 0 && aLeaves.map && (aLeaves.map["cli-A"] || 0) > 0 && (aLeaves.map["cli-B"] || 0) > 0 &&
    near(aLeaves.delve, 6) && bIntact.bonus === 8 && bIntact.tier === 1;
  if (!leaveOk) allEq = false;
  log.push(`A-leave:Δ_A=${aLeaves.bonus === 0 ? "0" : aLeaves.bonus} mapA=${aLeaves.map && aLeaves.map["cli-A"]} mapB=${aLeaves.map && aLeaves.map["cli-B"]} Δ_B=+${bIntact.bonus}/T${bIntact.tier}`);

  ok("17 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ delve/bands/tier/crit byte-idénticos (peer T3+25, decae T1+8); per-pid A(T3+25) vs B(T1+8) delveMap idéntico; A sale ⇒ crit 0 (Δ_A=0) PERO delveMap+Δ_B INTACTOS (0 desync)",
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
console.log(`\n=====  CAS-2389 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
