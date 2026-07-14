// CAS-2376 — QA INDEPENDIENTE POST-FLIP (2-cliente) para FUEGO CONCENTRADO / FOCUS FIRE **LIVE** (FOCUS_FIRE.enabled:true, flip CAS-2375). EVO mecánica #62.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2370-focus-{selfverify,live-observable-qa}.mjs):
//   · Oráculos re-derivados en Node: focusConcentration reimplementada (agrupa por objetivo, dedup jugadores, MÁX atacantes distintos);
//     tier = índice del tier más alto cuyo min≤focus; boost = tiers[t-1].boost; decay = base·0.5^(dt/hl) cap capFocus; gold = round(raw·(1+boost)).
//   · ASIGNACIONES RE-ETIQUETADAS (players/targets propios de QA, u12..u16 / obj propios) ⇒ prueba invariancia por renombrado.
//   · Reloj de pared FIJO propio de QA (QNOW distinto del GE 9.6M y de la DARK QA 8.45M).
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT 66ccf593d6c6 (flip CAS-2375) y AVANZÓ del pre-flip ad87e26206c3 (EVO#61 WAYFARER_ROAM flip CAS-2373).
//   (2) FOCUS_FIRE served enabled:TRUE (ya no false) + 13 flags del arco served true (0-regresión) ⇒ 14 flags true LIVE (incl FELLOWSHIP_BOND EVO#47).
//   (3) DEFAULT-ON: focus().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal goldFind ACTIVO en el build LIVE; DE-STACK máximo-único FOCUS cede a KINSHIP + ORTOGONALIDAD ⊥ restedMult ⊥ wardRegen (0 doble-conteo) contra el served.
//
// Eje FRESCO = CONCENTRACIÓN DE OBJETIVO: MÁX nº de jugadores DISTINTOS concentrando ataque sobre el MISMO enemigo A LA VEZ, SOSTENIDO.
// Diferenciadores LIVE: objetivos DISTINTOS⇒conc 1⇒NO abre (≠Congregación); MISMO objetivo aunque DISPERSOS⇒ABRE (OPUESTO Kinship #60); dup jugador⇒dedup 1;
//   idle⇒0; 1-tick dt=0.5⇒0 (permanencia); QUIETOS martillando⇒ABRE (≠Convoy velocidad).
// Run: node tools/cas2376-focus-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2376-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "66ccf593d6c6";   // build deployado por el flip CAS-2375 (== version.json esperado)
const PREFLIP = "ad87e26206c3";        // build servido ANTES del flip focus (EVO#61 WAYFARER_ROAM flip CAS-2373) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él, la autoridad) ──────────────────
const oracleConc = (assignments) => {
  const byT = new Map(); const players = new Set();
  (assignments || []).forEach((a, i) => {
    if (!a) return; const t = a.t, p = a.p;
    if (t === null || t === undefined || t === "") return;         // idle ⇒ no cuenta
    const pk = (p === null || p === undefined) ? ("#idx" + i) : ("" + p);
    players.add(pk);
    let s = byT.get("" + t); if (!s) { s = new Set(); byT.set("" + t, s); } s.add(pk);
  });
  let conc = 0; for (const s of byT.values()) if (s.size > conc) conc = s.size;
  return { members: players.size, conc };
};
const oracleTier = (focus, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if ((+focus || 0) >= tiers[i].min) idx = i + 1; return idx; };
const oracleBoost = (focus, tiers) => { const t = oracleTier(focus, tiers); return t > 0 ? (+tiers[t - 1].boost || 0) : 0; };
const oracleDecay = (base, dtSec, hlSec, cap) => { const w = base * Math.pow(0.5, dtSec / hlSec); return cap > 0 ? Math.min(cap, w) : w; };
const oracleGold = (raw, boost) => (boost > 0 ? Math.round(raw * (1 + boost)) : raw);
const oracleAccrue = (assignments, dt, accruePerSec, minFocus) => (oracleConc(assignments).conc >= minFocus ? accruePerSec * dt : 0);

// ── ASIGNACIONES QA re-etiquetadas (players/targets propios ≠ DARK QA) ────────────────────────────────
const A = {
  sameFour: [{ p: "u12", t: "wyrm" }, { p: "u13", t: "wyrm" }, { p: "u14", t: "wyrm" }, { p: "u15", t: "wyrm" }], // 4 sobre wyrm ⇒ conc 4
  disperso: [{ p: "u12", t: "wyrm" }, { p: "u13", t: "wyrm" }, { p: "u14", t: "wyrm" }],                          // 3 sobre MISMO objetivo (dispersos) ⇒ conc 3 ABRE
  distintos:[{ p: "u12", t: "kA" }, { p: "u13", t: "kB" }, { p: "u14", t: "kC" }, { p: "u15", t: "kD" }],         // objetivos distintos ⇒ conc 1 (NO abre)
  solo:     [{ p: "u12", t: "wyrm" }],                                                                            // 1 solo ⇒ conc 1
  dup:      [{ p: "u12", t: "wyrm" }, { p: "u12", t: "wyrm" }, { p: "u12", t: "wyrm" }],                          // mismo jugador ×3 ⇒ dedup ⇒ conc 1
  idle:     [{ p: "u12", t: null }, { p: "u13", t: undefined }, { p: "u14", t: "" }],                             // sin objetivo ⇒ conc 0
  split:    [{ p: "u12", t: "wyrm" }, { p: "u13", t: "wyrm" }, { p: "u14", t: "hydra" }, { p: "u15", t: "hydra" }, { p: "u16", t: "hydra" }], // 2+3 ⇒ MÁX 3
};

const QNOW = 8720000;   // reloj de pared QA FIJO (≠ 9.6M GE, ≠ 8.45M DARK QA) — proyección determinista, mismo en ambos clientes

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
    window.__QNOW = QNOW;
    window.__fsnap = (zone, f) => { window.__dev.focus({ clear: true, nowMs: window.__QNOW }); window.__dev.focus({ nowMs: window.__QNOW, push: { [zone]: { focus: f, atMs: window.__QNOW } } }); };
    window.__fpos = (zone, list, dt) => { window.__dev.focus({ clear: true, nowMs: window.__QNOW }); window.__dev.focus({ nowMs: window.__QNOW, assignments: { [zone]: { list, dt } } }); };
    window.__fat = (zone, elapsedSec) => window.__dev.focus({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__fpick = (f) => {
      window.__dev.focus({ enabled: true });
      const zones = window.__dev.focus().zones || [];
      for (const z of zones) {
        window.__dev.focus({ clear: true, nowMs: window.__QNOW });
        const s = window.__dev.focus({ nowMs: window.__QNOW, push: { [z]: { focus: f, atMs: window.__QNOW } }, toZone: z });
        if (s.zone === z && s.focusable) return { zone: z, focus: s.focus, tier: s.tier, boost: s.goldFindMul };
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

async function runOnce(round) {
  console.log(`\n===== CAS-2376 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido — 13 flags arco served true + FOCUS_FIRE served true (0-regresión)
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const focusServed = en("FOCUS_FIRE");            // EVO#62 — DEBE estar served true (flip CAS-2375 landed)
  const fellowServed = en("FELLOWSHIP_BOND");      // EVO#47 LIVE intacto

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + FOCUS_FIRE served true + 13 arco true + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.focus+kinship+convoy+ward+saveBlob+fp hooks; served FOCUS_FIRE.enabled:true + 13 arco true (0 regr) + FELLOWSHIP true; 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && focusServed === "true" && arcTrue && fellowServed === "true" && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} FOCUS_FIRE=${focusServed} FELLOWSHIP=${fellowServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: focus().enabled===true (el flip cargó) + passive 0 sin concentración; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.focus(); return { enabled: s.enabled, mul: s.goldFindMul, tier: s.tier, focus: s.focus, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(741));
    window.__dev.focus({ enabled: false, leave: true });
    const s = window.__dev.focus();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(741));
    window.__dev.focus({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.goldFindMul, tag: s.tag, tier: s.tier, saveNoKey: !/["']focus(Server)?["']/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: focus().enabled===true (flip cargó) + passive 0 sin concentración; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave focus/focusServer + fingerprint estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.focus === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installQA(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.focus({ enabled: true }));
  const cfg = await page.evaluate(() => { const s = window.__dev.focus({ enabled: true }); return { tiers: s.tiers, cap: s.capFocus, minFocus: s.minFocus, halfLifeSec: s.halfLifeSec, accruePerSec: s.accruePerSec, channel: s.channel, zones: s.zones }; });

  // 5 — ★ CONCENTRACIÓN (fn PURA focusConcentration vía concProbe) cruzada contra ORÁCULO QA — asignaciones re-etiquetadas
  const pr = await page.evaluate((A) => {
    window.__dev.focus({ enabled: true });
    const C = (assignments) => window.__dev.focus({ concProbe: { assignments } }).probe;
    return { sameFour: C(A.sameFour), disperso: C(A.disperso), distintos: C(A.distintos), solo: C(A.solo), dup: C(A.dup), idle: C(A.idle), split: C(A.split) };
  }, A);
  const prKeys = ["sameFour", "disperso", "distintos", "solo", "dup", "idle", "split"];
  const prOk = prKeys.every(k => pr[k].conc === oracleConc(A[k]).conc && pr[k].members === oracleConc(A[k]).members);
  ok("5 ★ CONCENTRACIÓN (fn PURA) == ORÁCULO QA LIVE: 4 sobre uno⇒4; disperso mismo obj⇒3; objetivos distintos⇒1; solo⇒1; dup jugador⇒1; idle⇒0; split 2+3⇒3 (etiquetas u12..u16 ⇒ invariante a renombrado)",
     prOk && pr.sameFour.conc === 4 && pr.disperso.conc === 3 && pr.distintos.conc === 1 && pr.solo.conc === 1 && pr.dup.conc === 1 && pr.idle.conc === 0 && pr.split.conc === 3,
     JSON.stringify(Object.fromEntries(prKeys.map(k => [k, pr[k].conc]))));

  // 6 — ★ TABLA tiers + boost == ORÁCULO QA para focus 1..8 (en zona)
  const tab = await page.evaluate(() => {
    const w = window.__fpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const f of [1, 2, 3, 4, 5, 6, 8]) {
      window.__fsnap(zone, f);
      const vm = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
      out.push({ f, focus: vm.focus, tier: vm.tier, boost: vm.goldFindMul });
    }
    return { zone, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => near(r.focus, r.f) && r.tier === oracleTier(r.f, cfg.tiers) && near(r.boost, oracleBoost(r.f, cfg.tiers)));
  ok("6 ★ TABLA tiers+boost == ORÁCULO QA LIVE (focus 1→T0,2→T1,3→T1,4→T2,5→T2,6→T3,8→T3; boost 0/.05/.05/.10/.10/.15/.15) determinista, monótona",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 — server-authoritative reflect + validate (drop out-of-zone + clamp negative)
  const refl = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const zones = window.__dev.focus().zones; const z0 = zones[0];
    window.__dev.focus({ clear: true, nowMs: window.__QNOW });
    window.__dev.focus({ nowMs: window.__QNOW, push: { [z0]: { focus: 4, atMs: window.__QNOW }, town: { focus: 6, atMs: window.__QNOW }, plaza: { focus: 5, atMs: window.__QNOW } } });
    const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: z0 });
    window.__dev.focus({ clear: true, nowMs: window.__QNOW });
    window.__dev.focus({ nowMs: window.__QNOW, push: { [z0]: { focus: -9, atMs: window.__QNOW } } });
    const neg = window.__dev.focus({ nowMs: window.__QNOW, toZone: z0 });
    return { z0, valid: s.focus, map: s.focusMap, negK: neg.focus, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.map || {})) && !("plaza" in (refl.map || {})) && refl.negK === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate LIVE: zona válida refleja focus 4; zonas fuera de `zones` (town/plaza) DESCARTADAS; focus negativo ⇒ 0 (clamp)",
     reflOk, JSON.stringify(refl));

  // 8 — ★ ACUMULADOR sostenido = fn de las ASIGNACIONES == ORÁCULO (accruePerSec·dt si sostiene)
  const acc = await page.evaluate((A) => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const dt of [2, 3, 4, 6]) {
      window.__fpos(zone, A.sameFour, dt);
      const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
      out.push({ dt, focus: s.focus, tier: s.tier });
    }
    return { zone, out };
  }, A);
  const accOk = !acc.bad && acc.out.every(r => near(r.focus, oracleAccrue(A.sameFour, r.dt, cfg.accruePerSec, cfg.minFocus)) && r.tier === oracleTier(r.focus, cfg.tiers));
  ok("8 ★ ACUMULADOR sostenido == ORÁCULO QA LIVE: mismo-objetivo sostenido dt=2⇒2(T1); dt=3⇒3(T1); dt=4⇒4(T2); dt=6⇒6(T3) = accruePerSec·dt exacto",
     accOk, JSON.stringify(acc.out));

  // 9 — ★ DIFERENCIADOR — distintos/solo/idle⇒0 (NO abre); MISMO objetivo aunque disperso⇒ABRE (OPUESTO Kinship); 1-tick⇒0 (permanencia)
  const diff = await page.evaluate((A) => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (list, dt) => { window.__fpos(zone, list, dt); const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone }); return { focus: s.focus, tier: s.tier, mul: s.goldFindMul }; };
    return {
      zone,
      distintos: read(A.distintos, 6),
      solo:      read(A.solo, 6),
      idle:      read(A.idle, 6),
      disperso:  read(A.disperso, 6),
      tick:      read(A.sameFour, 0.5),
    };
  }, A);
  const diffOk = !diff.bad && near(diff.distintos.focus, 0) && diff.distintos.tier === 0 &&
    near(diff.solo.focus, 0) && diff.solo.tier === 0 && near(diff.idle.focus, 0) && diff.idle.tier === 0 &&
    diff.disperso.focus >= 6 && diff.disperso.tier === 3 && diff.disperso.mul > 0 &&
    near(diff.tick.focus, 0.5) && diff.tick.tier === 0 && diff.tick.mul === 0;
  ok("9 ★ DIFERENCIADOR LIVE: objetivos-distintos/solo/idle⇒0 NO abre (≠Congregación); MISMO objetivo DISPERSO⇒ABRE T3 (OPUESTO Kinship proximidad); 1-tick dt=0.5⇒0 (permanencia)",
     diffOk, JSON.stringify(diff));

  // 10 — ★ DECAY determinista 0-RNG por vida-media == ORÁCULO a tres instantes
  const decay = await page.evaluate(() => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__fsnap(zone, 8); const at0 = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    window.__fsnap(zone, 8); const hl1 = window.__fat(zone, 25);
    window.__fsnap(zone, 8); const hl2 = window.__fat(zone, 50);
    return { zone, base: at0.focus, baseT: at0.tier, hl1: hl1.focus, hl1T: hl1.tier, hl2: hl2.focus, hl2T: hl2.tier };
  });
  const decOk = !decay.bad && near(decay.base, oracleDecay(8, 0, cfg.halfLifeSec, cfg.cap)) &&
    near(decay.hl1, oracleDecay(8, 25, cfg.halfLifeSec, cfg.cap)) && near(decay.hl2, oracleDecay(8, 50, cfg.halfLifeSec, cfg.cap)) &&
    decay.baseT === 3 && decay.hl1T === 2 && decay.hl2T === 1;
  ok("10 ★ DECAY determinista 0-RNG por vida-media == ORÁCULO QA LIVE: base 8(T3); +25s⇒4(T2); +50s⇒2(T1)",
     decOk, JSON.stringify(decay));

  // 11 — passive isolated (goldFind channel): in-zone focus≥umbral ⇒ boost==tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.kinship({ enabled: false });
    const w = window.__fpick(4); if (!w) return { bad: true };
    const inz = window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone });
    const out = window.__dev.focus({ leave: true });
    window.__dev.kinship({ enabled: true });
    return { zone: w.zone, inMul: inz.goldFindMul, inTier: inz.tier, inK: inz.focus, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 PASSIVE (canal goldFind, aislado) LIVE: EN zona focus 4 ⇒ goldFindMul==boost T2 (0.10, goldFactor 1.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, oracleBoost(4, cfg.tiers)) && pass.inTier === 2 && near(pass.inK, 4) && near(pass.inFactor, 1.10) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 — ★ CANAL goldFind wired + BONO DE ORO (seam tryPickup) cruzado contra ORÁCULO — QUIETOS martillando abren (≠ Convoy)
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function focusMul/.test(simSrc) && /kinshipMul\(h,"goldFind"\)\+focusMul\(h,"goldFind"\)/.test(simSrc) &&
    /if\(gf>0\)\s*g=Math\.round\(g\*\(1\+gf\)\)/.test(simSrc) && /d\.kind==="gold"/.test(simSrc);
  const gold = await page.evaluate(() => {
    window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ 0.15
    const zone = w.zone;
    window.__fsnap(zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    const before = window.__dev.focus().hero.gold;
    const gp = window.__dev.focus({ goldTick: 200 }).goldPicked;        // recoge 200 sintético ⇒ round(200*1.15)=230
    const afterGold = window.__dev.focus().hero.gold;
    window.__dev.focus({ enabled: false });
    const offBefore = window.__dev.focus().hero.gold;
    const gpOff = window.__dev.focus({ goldTick: 200 }).goldPicked;     // OFF ⇒ paid==raw (byte-id)
    const off = window.__dev.focus(); const offAfter = off.hero.gold;
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: true });
    return { zone, before, gp, afterGold, offBefore, gpOff, offAfter, offTag: off.tag };
  });
  const goldOk = !gold.bad && gold.gp && gold.gp.paid === oracleGold(200, oracleBoost(6, cfg.tiers)) && gold.gp.paid === 230 &&
    near(gold.gp.boost, 0.15) && (gold.afterGold - gold.before) === 230 &&
    gold.gpOff && gold.gpOff.paid === 200 && (gold.offAfter - gold.offBefore) === 200 && gold.offTag === "";
  ok("12 ★ CANAL goldFind wired + BONO DE ORO == ORÁCULO LIVE: seam gold ⇒ round(g*(1+gf)); QUIETOS martillando T3 ⇒ goldTick 200 paga 230; OFF ⇒ paid==raw (200) + tag \"\"",
     seamWired && goldOk, `wired=${seamWired} on(${gold.before}→${gold.afterGold} gp=${JSON.stringify(gold.gp)}) off(gp=${JSON.stringify(gold.gpOff)}) offTag="${gold.offTag}"`);

  // 13 — ★ DE-STACK máximo-único con KINSHIP (0 doble-conteo) + ORTOGONALIDAD ⊥ restedMult ⊥ wardRegen
  // Sólo hooks SÍNCRONOS (focus/kinship/ward proyectan al leer). El positivo-control de CONVOY (restedMult) se
  // valida en CAS-2360 (canal vectorial que proyecta tras un tick rAF ⇒ no determinista en lectura síncrona);
  // aquí la ortogonalidad ⊥ restedMult se prueba mostrando que abrir focus/kinship/ward DEJA restedXpMult en su
  // baseline (focus NO toca rested; sólo CONVOY lo movería) ⇒ 0 doble-conteo cruzado.
  const orth = await page.evaluate(() => {
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ 0.15
    const zone = w.zone;
    const a = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    const focusAlone = a.goldFindMul, restedBefore = a.restedXpMult, wardBefore = a.wardRegenMul;
    // (i) DE-STACK: abre KINSHIP (mismo canal goldFind) ⇒ FOCUS cede (0), kinship aporta ⇒ máximo-único
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__QNOW });
    window.__dev.kinship({ nowMs: window.__QNOW, push: { [zone]: { kinship: 6, atMs: window.__QNOW } }, toZone: zone });
    const ceded = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    window.__dev.kinship({ enabled: false });
    const backv = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    // (ii) ORTOGONALIDAD: abre WARD (wardRegen, canal aparte) ⇒ sube SU canal pero focus.goldFindMul NO cambia; rested queda en baseline
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__QNOW });
    window.__dev.ward({ nowMs: window.__QNOW, push: { [zone]: { ward: 6, atMs: window.__QNOW } }, toZone: zone });
    const b = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    window.__dev.ward({ enabled: false }); window.__dev.kinship({ enabled: true });
    return { zone, channel: a.channel, focusAlone, cededMul: ceded.goldFindMul, cededKin: ceded.kinshipMulGold, back: backv.goldFindMul,
      restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul };
  });
  const orthFull = !orth.bad && orth.channel === "goldFind" && orth.focusAlone > 0 &&
    orth.cededMul === 0 && orth.cededKin > 0 &&              // KINSHIP abierto ⇒ FOCUS cede (0), kinship aporta ⇒ máximo-único
    near(orth.back, orth.focusAlone) &&                      // cierra kinship ⇒ focus recupera su boost
    near(orth.goldAfter, orth.focusAlone) &&                 // WARD NO cambia goldFind de focus (⊥)
    orth.wardBefore === 0 &&                                 // focus solo NO abre wardRegen
    near(orth.restedAfter, orth.restedBefore) &&             // focus/kinship/ward NO tocan restedMult (⊥ restedMult, 0 doble-conteo)
    orth.wardAfter > 0;                                      // WARD sí aporta en SU canal (independiente)
  ok("13 ★ DE-STACK máximo-único con KINSHIP LIVE (KINSHIP abierto⇒FOCUS cede 0, kinship aporta; cierra⇒recupera) + ORTOGONALIDAD ⊥ restedMult/wardRegen (rested queda baseline; ward sube su canal; 0 doble-conteo)",
     orthFull, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 13 flags del arco served true + FOCUS_FIRE served TRUE (disco LIVE) + FELLOWSHIP_BOND #47 intacto
  ok("14 ★ 0-regresión LIVE: 13 flags del arco served enabled:true + FOCUS_FIRE served TRUE (14 flags true LIVE incl FELLOWSHIP #47)",
     arcTrue && focusServed === "true" && fellowServed === "true", JSON.stringify({ ...arc, FOCUS_FIRE: focusServed, FELLOWSHIP_BOND: fellowServed }));

  // 15 — ★ FOCUS en las 6 zonas broken=[]
  const zonesRes = await page.evaluate(() => {
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const zones = window.__dev.focus().zones; const broken = [];
    for (const z of zones) {
      window.__dev.focus({ clear: true, nowMs: window.__QNOW });
      const s = window.__dev.focus({ nowMs: window.__QNOW, push: { [z]: { focus: 6, atMs: window.__QNOW } }, toZone: z });
      if (!(s.zone === z && s.focusable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z);
    }
    window.__dev.kinship({ enabled: true });
    return { zones, broken };
  });
  ok("15 ★ FOCUS 6 zonas LIVE: las 6 de FOCUS_FIRE.zones hospedan un fuego concentrado observable (focus 6 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 — render badge "Fuego Conc." drawn ON + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fuego Conc.") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6);
    window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.kinship({ enabled: true });
    cx.fillText = orig;
    return { onCnt, fps };
  });
  ok("16 render badge \"Fuego Conc.\" se DIBUJA ON (count>0) + fps sano LIVE",
     badge.onCnt > 0 && badge.fps >= 30, `on=${badge.onCnt} fps=${badge.fps}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate(() => { window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false }); const w = window.__fpick(6); window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone }); });
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
    await p.evaluate(() => { window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false }); });
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const zone = await A.evaluate(() => (window.__dev.focus({ enabled: true }).zones || [])[2]);   // ruins idx2 (North Star canónico del arco)

  const readBoth = async (f, elapsedSec) => {
    const inj = (pg) => pg.evaluate(({ f, zone, elapsedSec, QNOW }) => {
      window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
      window.__dev.focus({ clear: true, nowMs: QNOW });
      const s = window.__dev.focus({ nowMs: QNOW + (elapsedSec || 0) * 1000, push: { [zone]: { focus: f, atMs: QNOW } }, toZone: zone });
      return { focus: s.focus, tier: s.tier, boost: s.goldFindMul, factor: s.goldFactor, nowMs: s.nowMs, map: s.focusMap };
    }, { f, zone, elapsedSec, QNOW });
    const [a, b] = await Promise.all([inj(A), inj(B)]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };

  let allEq = true, log = [];
  // (a) MISMO snapshot+reloj ⇒ VM byte-idéntico en A y B (focus 6: T3; +25s decae a 4 T2) — convergencia real
  const sustain = await readBoth(6, 0);
  const decayed = await readBoth(8, 25);
  if (!(sustain.eq && sustain.a.tier === 3 && near(sustain.a.focus, 6))) allEq = false;
  if (!(decayed.eq && decayed.a.tier === 2 && near(decayed.a.focus, 4))) allEq = false;
  log.push(`sustain:${sustain.eq ? "==T" + sustain.a.tier : "DESYNC " + JSON.stringify(sustain.a) + "/" + JSON.stringify(sustain.b)}`);
  log.push(`decay+25s:${decayed.eq ? "==T" + decayed.a.tier : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (b) A SALE de la zona ⇒ Δ_A cae a 0 (zone-gate) PERO focus server-auth + Δ_B quedan INTACTOS
  const aLeaves = await A.evaluate(() => { const s = window.__dev.focus({ leave: true }); return { mul: s.goldFindMul, tier: s.tier, map: s.focusMap }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.focus({nowMs:N,toZone:${JSON.stringify(zone)}}); return {mul:s.goldFindMul,tier:s.tier,focus:s.focus}; })()`);
  // B intact reads a reloj base QNOW donde focus=8 ⇒ T3 (el decay +25s fue una proyección efímera, no persistió el estado base).
  const leaveOk = aLeaves.mul === 0 && aLeaves.map && (aLeaves.map[zone] || 0) > 0 && bIntact.mul > 0 && bIntact.tier === 3;
  log.push(`A-leave:Δ_A=${aLeaves.mul} mapZone=${aLeaves.map && aLeaves.map[zone]} Δ_B=${bIntact.mul}/T${bIntact.tier}`);

  ok("17 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ focus/tier/boost/goldFactor byte-idénticos (sostener T3, decaer T2); A sale ⇒ Δ_A=0 PERO focus server-auth + Δ_B INTACTOS (0 desync)",
     allEq && leaveOk, log.join("  "));
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
console.log(`\n=====  CAS-2376 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
