// CAS-2392 — QA INDEPENDIENTE POST-FLIP (2-cliente) para ERUDICIÓN / LOREKEEPER **LIVE** (ERUDITION.enabled:true, flip CAS-2390 CTO). EVO mecánica #65.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local ni el Higgsfield retirado.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2381-erudition-{selfverify,observable-qa}.mjs):
//   · Oráculos re-derivados en Node: oracleVariety / oracleTier / oracleBoost / oracleDecay reimplementados desde la spec (NO importados de sim.js), cruzados CONTRA el VM (__dev.erudition), la autoridad.
//   · Reloj de pared FIJO propio de QA (QNOW=8.915M, DISTINTO del GE 8.780M y de la DARK QA 8.780M) ⇒ una copia de los números no pasaría en silencio.
//   · PIDS RE-ETIQUETADOS (cli-A/cli-B/peer) + TIPOS de enemigo RE-ETIQUETADOS (specter/gargoyle/basilisk/wight/revenant) — server-auth per-pid, invariante por renombrado.
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT bdf43dcd2099 (flip CAS-2390) y AVANZÓ del pre-flip f4c877cf5725 (EVO#64 DELVE flip CAS-2387).
//   (2) ERUDITION served enabled:TRUE (ya no false) + 16 flags arco + DELVE served true (0-regresión) ⇒ 18 flags true LIVE.
//   (3) DEFAULT-ON: erudition().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave lore + fingerprint estable).
//   (4) canal REUSADO xpGain (multiplicador de XP por gainXP) ACTIVO en el build LIVE con DE-STACK máximo-único (cede a FELLOWSHIP #47); ORTOGONALIDAD ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance.
//
// Eje FRESCO = DIVERSIDAD DE PRESAS / BESTIARY BREADTH: nº de TIPOS de enemigo DISTINTOS abatidos (e.type) en ventana 30s, per-pid, decay half-life 25s.
// Diferenciadores LIVE: matar SIEMPRE el mismo tipo⇒variety 1⇒NUNCA abre (OPUESTO a Focus concentración/BOUNTY conteo); K tipos distintos⇒variety K⇒abre (a QUIÉN matas).
//   ORTOGONAL a Trailcraft #63 (variedad de TERRENO/bioma) y a Delve #64 (profundidad). ⊥ Kinship/Wayfarer/Focus.
// Run: node tools/cas2392-erudition-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2392-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "bdf43dcd2099";   // build deployado por el flip ERUDITION CAS-2390 (== version.json esperado)
const PREFLIP = "f4c877cf5725";        // build servido ANTES del flip ERUDITION (EVO#64 DELVE flip CAS-2387) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the spec; NOT imported from sim.js) ──
const CFG = { minVariety: 3, halfLifeSec: 25, accruePerSec: 1, capLore: 12, windowSec: 30,
  tiers: [{ min: 2, boost: 0.05 }, { min: 4, boost: 0.10 }, { min: 6, boost: 0.15 }] };
const oracleVariety = (marks, now, winMs) => {   // nº de TIPOS (k) DISTINTOS con t ∈ [now-win, now]
  if (!Array.isArray(marks)) return 0; const lo = now - winMs; const set = new Set();
  for (const m of marks) { const k = String((m && m.k) == null ? "" : m.k), t = +(m && m.t) || 0; if (t >= lo && t <= now) set.add(k); }
  return set.size;
};
const oracleTier = (lore) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { if (lore >= CFG.tiers[i].min) idx = i + 1; } return idx; };
const oracleBoost = (lore) => { const t = oracleTier(lore); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capLore, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));

const QNOW = 8915000;   // reloj de pared QA FIJO (≠ 8.780M GE/DARK) — proyección determinista, mismo en ambos clientes.
// RE-LABELED enemy types (distintos de GE/DARK-QA) — las 5 especies para construir variedad.
const TY = ["specter", "gargoyle", "basilisk", "wight", "revenant"];

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALore";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3", key: "3", bubbles: true })));  // class 3 (re-labeled vs GE)
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

async function installEru(page) {
  await page.evaluate((QNOW, TY) => {
    window.__QN = QNOW; window.__TY = TY;
    window.__distinct = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ k: window.__TY[i % window.__TY.length], t: (t == null ? window.__QN : t) }); return o; };
    window.__same = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ k: window.__TY[0], t: (t == null ? window.__QN : t) }); return o; };
    window.__setmarks = (pid, marks) => { window.__dev.erudition({ clear: true, nowMs: window.__QN }); window.__dev.erudition({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    window.__step = (pid, dt) => window.__dev.erudition({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    window.__pick = (lore) => {
      window.__dev.erudition({ enabled: true, self: "self" });
      const zones = window.__dev.erudition().zones || [];
      for (const z of zones) {
        window.__dev.erudition({ clear: true, nowMs: window.__QN });
        const s = window.__dev.erudition({ nowMs: window.__QN, self: "self", lore, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.learnable) return { zone: z, lore: s.lore, tier: s.tier, boost: s.boost };
      }
      return null;
    };
  }, QNOW, TY);
}

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installEru(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function runOnce(round) {
  console.log(`\n===== CAS-2392 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido — 16 flags arco + DELVE + ERUDITION served true (0-regr, 18 flags true)
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const delveServed = en("DELVE");                 // EVO#64 — DEBE seguir served true (flip CAS-2387 landed, 0-regr)
  const erudServed = en("ERUDITION");              // EVO#65 — DEBE estar served true (flip CAS-2390 landed)

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + ERUDITION served true + DELVE + 16 arco true + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.erudition && window.__dev.delve && window.__dev.trailcraft && window.__dev.fellowship && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.erudition+arc hooks(+fellowship)+saveBlob+fp; served ERUDITION.enabled:true + DELVE true + 16 arco true (18 flags true, 0-regr) + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && erudServed === "true" && delveServed === "true" && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} ERUDITION=${erudServed} DELVE=${delveServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: erudition().enabled===true (el flip cargó) + passive 0 sin variedad; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.erudition(); return { enabled: s.enabled, tier: s.tier, lore: s.lore, boost: s.boost, xpGainMul: s.xpGainMul, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(392));
    window.__dev.erudition({ enabled: false, leave: true });
    const s = window.__dev.erudition();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(392));
    window.__dev.erudition({ enabled: true });                                       // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, tier: s.tier, mul: s.xpGainMul, tag: s.tag, saveNoKey: !/["']lore(Server|Marks)?["']/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: erudition().enabled===true (flip cargó) + passive 0 sin variedad; byte-id OFF (toggle): enabled false ⇒ tier 0 + tag \"\" + save SIN clave lore/loreServer/loreMarks + fingerprint estable (0 RNG drift)",
     dOn.enabled === true && dOn.tier === 0 && dOn.lore === 0 && dOn.boost === 0 && dOn.xpGainMul === 0 &&
     byteId.enabled === false && byteId.tier === 0 && byteId.mul === 0 && byteId.tag === "" && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installEru(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.erudition({ enabled: true }));

  // 3 — ★ VARIETY (fn PURA vía varietyProbe) cruzada contra ORÁCULO QA
  const varData = await page.evaluate((QNOW, TY) => {
    window.__dev.erudition({ enabled: true });
    const win = 30000;
    const V = (marks) => window.__dev.erudition({ varietyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      one:      [{ k: TY[0], t: QNOW }],
      sameMany: [{ k: TY[0], t: QNOW - 4000 }, { k: TY[0], t: QNOW - 2000 }, { k: TY[0], t: QNOW }],
      three:    [{ k: TY[0], t: QNOW }, { k: TY[1], t: QNOW }, { k: TY[2], t: QNOW }],
      five:     [{ k: TY[0], t: QNOW }, { k: TY[1], t: QNOW }, { k: TY[2], t: QNOW }, { k: TY[3], t: QNOW }, { k: TY[4], t: QNOW }],
      expired:  [{ k: TY[1], t: QNOW - 45000 }, { k: TY[2], t: QNOW }],   // 1 en ventana, 1 fuera
      empty:    [],
    };
    const vm = {}; for (const k in cases) vm[k] = V(cases[k]);
    return { cases, vm };
  }, QNOW, TY);
  const varOracleOk = Object.keys(varData.cases).every(k => varData.vm[k] === oracleVariety(varData.cases[k], QNOW, 30000));
  const varExpectOk = varData.vm.one === 1 && varData.vm.sameMany === 1 && varData.vm.three === 3 && varData.vm.five === 5 && varData.vm.expired === 1 && varData.vm.empty === 0;
  ok("3 ★ VARIETY = fn PURA (VM probe == oracle re-derivado) LIVE: 1 kill⇒1; N MISMO tipo⇒1; 3 tipos⇒3; 5 tipos⇒5; fuera-ventana⇒excl; vacío⇒0",
     varOracleOk && varExpectOk, `vm=${JSON.stringify(varData.vm)}`);

  // 4 — TABLA de tiers = fn PURA de lore — VM vs oracle sobre 5 casos
  const tab = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const lv of [6, 4, 2, 1, 0]) {
      window.__dev.erudition({ clear: true, nowMs: QNOW });
      const s = window.__dev.erudition({ nowMs: QNOW, self: "self", lore: lv, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ lv, lore: s.lore, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.lore, r.lv) && r.tier === oracleTier(r.lv) && near(r.boost, oracleBoost(r.lv)));
  ok("4 TABLA de tiers = fn PURA de lore (VM == oracle) LIVE: 6→T3+0.15; 4→T2+0.10; 2→T1+0.05; 1→T0; 0→T0",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 5 — server-auth reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", push: { "cli-A": { lore: 8, atMs: QNOW }, peer: { lore: 5, atMs: QNOW } } });
    const at0 = window.__dev.erudition({ nowMs: QNOW });
    const at25 = window.__dev.erudition({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.erudition({ nowMs: QNOW + 50000 });
    return { a0: at0.loreMap["cli-A"], p0: at0.loreMap.peer, a25: at25.loreMap["cli-A"], a50: at50.loreMap["cli-A"] };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02);
  ok("5 SERVER-AUTH reflect+project LIVE: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s) per-pid",
     reflOk, JSON.stringify(refl));

  // 6 — ★ ACUMULADOR = fn de VARIEDAD (step). NOTA: el step hook devuelve el snapshot completo (leer .lore/.tier), no el loreStep raw.
  const acc = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    const vSame = window.__dev.erudition({ varietyProbe: { marks: window.__same(3, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    const vDist = window.__dev.erudition({ varietyProbe: { marks: window.__distinct(3, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    window.__setmarks("self", window.__same(3, QNOW));      // 3 marcas MISMO tipo (variety 1)
    window.__dev.erudition({ toZone: zone });
    const one = window.__step("self", 5);                    // variety 1 < min ⇒ add 0 ⇒ lore stays 0
    window.__setmarks("self", window.__distinct(3, QNOW));   // 3 tipos DISTINTOS (variety 3) — clear resets lore to 0
    window.__dev.erudition({ toZone: zone });
    const tick1 = window.__step("self", 0.5);                // 1-tick permanencia ⇒ lore≈0.5 < 2 ⇒ T0
    const s2 = window.__step("self", 1.5);                   // cumulative lore ≈ 2.0
    const s3 = window.__step("self", 2);                     // ≈ 4.0
    const s4 = window.__step("self", 2);                     // ≈ 6.0
    return { zone, vSame, vDist, oneLore: one.lore, oneTier: one.tier, tick1Lore: tick1.lore, tick1Tier: tick1.tier, s2Tier: s2.tier, s3Tier: s3.tier, s4Tier: s4.tier };
  }, QNOW);
  const accOk = !acc.bad && acc.vSame === 1 && acc.vDist === 3 &&
    near(acc.oneLore, 0) && acc.oneTier === 0 &&
    acc.tick1Lore > 0 && acc.tick1Lore < 2 && oracleTier(acc.tick1Lore) === 0 && acc.tick1Tier === 0 &&
    acc.s2Tier >= 1 && acc.s3Tier >= 2 && acc.s4Tier === 3;
  ok("6 ★ ACUMULADOR = fn de VARIEDAD LIVE: 1 tipo (variety1<3)⇒add 0 (nunca abre, no por conteo de kills); 3 tipos 1-tick dt=0.5⇒lore<2⇒T0 (permanencia, oracle); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify(acc));

  // 7 — ★ DIFERENCIADOR (a QUIÉN matas; opuesto Focus concentración)
  const diff = await page.evaluate((QNOW) => {
    const win = 30000; const V = (marks) => window.__dev.erudition({ varietyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const sameSpam = V(window.__same(8, QNOW));           // 8 kills MISMO tipo ⇒ variety 1
    const diverse = V(window.__distinct(4, QNOW));        // 4 tipos DISTINTOS ⇒ variety 4
    const oneType = V([{ k: "specter", t: QNOW - 1000 }, { k: "specter", t: QNOW }]);   // Bounty/Emissary contarían 2 kills; aquí 1 tipo
    return { sameSpam, diverse, oneType };
  }, QNOW);
  const diffOk = diff.sameSpam === 1 && diff.diverse === 4 && diff.oneType === 1 &&
    diff.sameSpam < CFG.minVariety && diff.diverse >= CFG.minVariety;
  ok("7 ★ DIFERENCIADOR LIVE: matar SIEMPRE el mismo tipo (8 kills)⇒variety 1<3⇒NO abre (OPUESTO a Focus concentración/BOUNTY conteo); 4 tipos distintos⇒variety 4⇒abre (a QUIÉN matas)",
     diffOk, JSON.stringify(diff));

  // 8 — ★ DECAY steps tier down — cross-check oracle a +hl y +2·hl
  const decay = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.erudition({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.erudition({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.lore, t0: a0.tier, b0: a0.boost, d25: a25.lore, t25: a25.tier, b25: a25.boost, d50: a50.lore, t50: a50.tier, b50: a50.boost };
  }, QNOW);
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && near(decay.b0, 0.15) &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000)) && near(decay.b25, oracleBoost(oracleDecay(6, 25000))) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000)) && decay.t50 === 0;
  ok("8 ★ DECAY 0-RNG vida-media (VM == oracle) LIVE: 6(T3+.15)→3@25s(T1+.05)→1.5@50s(T0). El min crece por tier ⇒ decay baja el tier gradual",
     decayOk, JSON.stringify(decay));

  // 9 — PASSIVE aislado (xpGain)
  const pass = await page.evaluate((QNOW) => {
    const w = window.__pick(4); if (!w) return { bad: true };   // T2 +10%
    const inz = window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.erudition({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.xpGainMul, outBoost: out.boost, outTier: out.tier, outMul: out.xpGainMul };
  }, QNOW);
  ok("9 PASSIVE aislado (xpGain) LIVE: en zona con lore4 ⇒ boost==tier.boost (T2=+0.10) == xpGainMul; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inBoost, 0.10) && pass.inTier === 2 && near(pass.inMul, 0.10) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 10 — ★ CANAL xpGain wired (served sim.js) + seam gainXP (grep seam + xpTick vs oracle; OFF byte-id)
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function eruditionMul\(h,kind\)/.test(simSrc) &&
    /n=Math\.round\(n\*\(1\+fellowMul\(h,"xpGain"\)\+eruditionMul\(h,"xpGain"\)\)\)/.test(simSrc);
  const xp = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true };   // T3 +0.15, sin fellowship forjada (fb=0)
    window.__dev.fellowship({ enabled: false });
    window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    const on = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // 1000·1.15 = 1150
    window.__dev.erudition({ enabled: false });
    const off = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // enabled false ⇒ eb 0 ⇒ 1000·(1+fb)
    const offTag = window.__dev.erudition().tag;
    window.__dev.erudition({ enabled: true });
    return { on, off, offTag };
  }, QNOW);
  const xpOk = !xp.bad &&
    xp.on.paid === Math.round(1000 * (1 + xp.on.fellowBonus + 0.15)) && near(xp.on.eruditionBonus, 0.15) &&
    xp.off.paid === Math.round(1000 * (1 + xp.off.fellowBonus)) && xp.off.eruditionBonus === 0 && xp.offTag === "";
  ok("10 ★ CANAL xpGain wired + seam gainXP (grep n·(1+fellowMul+eruditionMul) + VM==oracle) LIVE: ON lore6⇒base1000·1.15=1150; OFF ⇒ paid==base·(1+fellow) byte-id + tag \"\"",
     seamWired && xpOk, `wired=${seamWired} ${JSON.stringify(xp)}`);

  // 11 — ★ DE-STACK máximo-único: FELLOWSHIP forjada ⇒ ERUDITION cede (mirror FOCUS→KINSHIP en goldFind)
  const destack = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.erudition({ enabled: true, self: "self" });
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    const before = window.__dev.erudition({ nowMs: QNOW, toZone: zone });   // fellowship OFF ⇒ eruditionMul = 0.15
    window.__dev.fellowship({ enabled: true, nowMs: QNOW });
    window.__dev.fellowship({ kill: { n: 100000 } });
    window.__dev.fellowship({ nowMs: QNOW });
    const fs = window.__dev.fellowship();
    const after = window.__dev.erudition({ nowMs: QNOW, toZone: zone });    // fellowMul(xpGain)>0 ⇒ eruditionMul CEDE a 0
    const xpAfter = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // paid = 1000·(1+0.10+0) — el MAYOR (fellow), no doble
    window.__dev.fellowship({ enabled: false });
    return { zone, beforeMul: before.xpGainMul, beforeTier: before.tier, afterMul: after.xpGainMul, afterFellow: after.fellowXpMul, afterTier: after.tier, forged: fs.forged, xpAfter };
  }, QNOW);
  const destackOk = !destack.bad && near(destack.beforeMul, 0.15) && destack.beforeTier === 3 &&
    destack.forged === true && near(destack.afterFellow, 0.10) &&
    destack.afterMul === 0 && destack.afterTier === 3 &&   // tier sigue 3 (lore intacto) pero MUL cede a 0
    destack.xpAfter.eruditionBonus === 0 && near(destack.xpAfter.fellowBonus, 0.10) && destack.xpAfter.paid === Math.round(1000 * 1.10);
  ok("11 ★ DE-STACK máximo-único LIVE: FELLOWSHIP forjada (fellowMul xpGain=0.10)⇒ERUDITION CEDE (eruditionMul 0.15→0, aplica el MAYOR); paid=1000·1.10 (NO 1.25 doble-dip). Mirror FOCUS→KINSHIP en goldFind",
     destackOk, JSON.stringify(destack));

  // 12 — ★ ORTOGONALIDAD xpGain ⊥ 6 canales (incl. critChance/delve YA LIVE)
  const orth = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.fellowship({ enabled: false });   // sin interferencia de-stack
    const a = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    const eruBefore = a.xpGainMul, restedBefore = a.restedXpMult;
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
    window.__dev.delve({ enabled: true, self: "self" }); window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });   // re-assert self
    const b = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, eruBefore, restedBefore, eruAfter: b.xpGainMul, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct, restedAfter: b.restedXpMult };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "xpGain" && near(orth.eruBefore, 0.15) && near(orth.eruAfter, orth.eruBefore) &&
    near(orth.restedAfter, orth.restedBefore) && orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "" && orth.critAfter > 0;
  ok("12 ★ ORTOGONALIDAD xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance LIVE: abrir erudición NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT/DELVE NO cambia el bono xpGain (0.15→0.15)",
     orthOk, JSON.stringify(orth));

  // 13 — ★ 0-REGRESIÓN LIVE: 16 flags arco + DELVE + ERUDITION served true (18 flags true)
  ok("13 ★ 0-regresión LIVE: 16 flags del arco served enabled:true + DELVE served TRUE + ERUDITION served TRUE (18 flags true LIVE, arco #59→#65 completo)",
     arcTrue && delveServed === "true" && erudServed === "true", JSON.stringify({ ...arc, DELVE: delveServed, ERUDITION: erudServed }));

  // 14 — ★ ERUDICIÓN 6 zonas broken=[] + render badge "Erudito:" (colon único) dibujado ON + fps
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    const zones = window.__dev.erudition().zones; const broken = [];
    for (const z of zones) {
      window.__dev.erudition({ clear: true, nowMs: QNOW });
      const s = window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.learnable && s.tier === 3 && Math.abs(s.boost - 0.15) < 1e-9)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Erudito:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__pick(6); window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { onCnt, fps };
  }, QNOW);
  ok("14 ★ ERUDICIÓN 6 zonas LIVE (lore6⇒T3, boost 0.15) broken=[] + render badge \"Erudito:\" (colon único, ≠ mejora meta \"Erudición\") se DIBUJA ON (count>0) + fps sano",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0 && badge.onCnt > 0 && badge.fps >= 30,
     `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)} badgeOn=${badge.onCnt} fps=${badge.fps}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate((QNOW) => { window.__dev.erudition({ enabled: true }); const w = window.__pick(6); window.__dev.erudition({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
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
    await p.evaluate(() => window.__dev.erudition({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const zone = await A.evaluate(() => (window.__dev.erudition({ enabled: true }).zones || [])[2]);   // idx2 (re-labeled)

  // ambos clientes reciben el MISMO snapshot crudo per-pid; cada uno se declara self=su-pid; MISMO reloj ⇒ lore/tier/boost byte-id per-pid
  const readBoth = async (elapsedSec) => {
    const inj = (pg, selfPid) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
      window.__dev.erudition({ enabled: true, self });
      window.__dev.erudition({ clear: true, nowMs: QNOW });
      const s = window.__dev.erudition({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
        "cli-A": { lore: 6, atMs: QNOW }, "cli-B": { lore: 2, atMs: QNOW }, peer: { lore: 6, atMs: QNOW },
      }, toZone: zone });
      return { self: s.self, lore: s.lore, tier: s.tier, boost: s.boost, nowMs: s.nowMs, map: s.loreMap };
    }, { self: selfPid, elapsedSec, zone, QNOW });
    const [a, b] = await Promise.all([inj(A, "peer"), inj(B, "peer")]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };

  let allEq = true, log = [];
  // (a) MISMO snapshot+reloj (peer=T3+.15) ⇒ lore/tier/boost byte-id + loreMap idéntico (server-auth)
  const shared = await readBoth(0);
  const sharedOk = shared.eq && shared.a.tier === 3 && near(shared.a.lore, 6) && near(shared.a.boost, 0.15);
  if (!sharedOk) allEq = false;
  log.push(`shared:${shared.eq ? "==T" + shared.a.tier + "/+" + shared.a.boost : "DESYNC " + JSON.stringify(shared.a) + "/" + JSON.stringify(shared.b)}`);

  // (b) decay converge: peer 6 +25s ⇒ 3 (T1 +.05) en ambos
  const decayed = await readBoth(25);
  const decayEq = decayed.eq && decayed.a.tier === 1 && near(decayed.a.lore, oracleDecay(6, 25000), 0.02) && near(decayed.a.boost, 0.05);
  if (!decayEq) allEq = false;
  log.push(`decay+25s:${decayEq ? "==T1/+.05" : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (c) per-pid: A=cli-A (T3+.15) vs B=cli-B (T1+.05) — cada self ve SU lore, pero loreMap (autoridad) idéntico
  const push = { "cli-A": { lore: 6, atMs: QNOW }, "cli-B": { lore: 2, atMs: QNOW } };
  const rA = await A.evaluate(({ zone, QNOW, push }) => { window.__dev.erudition({ enabled: true, self: "cli-A" }); window.__dev.erudition({ clear: true, nowMs: QNOW }); const s = window.__dev.erudition({ nowMs: QNOW, self: "cli-A", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, QNOW, push });
  const rB = await B.evaluate(({ zone, QNOW, push }) => { window.__dev.erudition({ enabled: true, self: "cli-B" }); window.__dev.erudition({ clear: true, nowMs: QNOW }); const s = window.__dev.erudition({ nowMs: QNOW, self: "cli-B", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, QNOW, push });
  const perpidOk = rA.self === "cli-A" && rA.tier === 3 && near(rA.boost, 0.15) &&
    rB.self === "cli-B" && rB.tier === 1 && near(rB.boost, 0.05) &&
    JSON.stringify(rA.map) === JSON.stringify(rB.map);
  if (!perpidOk) allEq = false;
  log.push(`perpid:A(T${rA.tier}/+${rA.boost})/B(T${rB.tier}/+${rB.boost}) mapEq=${JSON.stringify(rA.map) === JSON.stringify(rB.map)}`);

  // (d) A SALE de zona ⇒ boost 0 (Δ_A=0) PERO loreMap server-auth + Δ_B INTACTOS. Reestablece snapshot limpio en ambos antes del leave.
  await readBoth(0);
  const aLeaves = await A.evaluate(() => { const s = window.__dev.erudition({ leave: true }); return { boost: s.boost, tier: s.tier, map: s.loreMap, lore: s.lore }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.erudition({self:"cli-B",nowMs:N,toZone:${JSON.stringify(zone)}}); return {boost:s.boost,tier:s.tier,lore:s.lore}; })()`);
  const leaveOk = aLeaves.boost === 0 && aLeaves.tier === 0 && aLeaves.map && (aLeaves.map["cli-A"] || 0) > 0 && (aLeaves.map["cli-B"] || 0) > 0 &&
    near(aLeaves.lore, 6) && near(bIntact.boost, 0.05) && bIntact.tier === 1;
  if (!leaveOk) allEq = false;
  log.push(`A-leave:Δ_A=${aLeaves.boost === 0 ? "0" : aLeaves.boost} mapA=${aLeaves.map && aLeaves.map["cli-A"]} mapB=${aLeaves.map && aLeaves.map["cli-B"]} Δ_B=+${bIntact.boost}/T${bIntact.tier}`);

  ok("15 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ lore/tier/boost byte-idénticos (peer T3+.15, decae T1+.05); per-pid A(T3+.15) vs B(T1+.05) loreMap idéntico; A sale ⇒ boost 0 (Δ_A=0) PERO loreMap+Δ_B INTACTOS (0 desync)",
     allEq, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("16 determinismo ×2: mismo build servido en ambas rondas (== EXPECT)", b1 === b2 && b1 === EXPECT_BUILD, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors durante toda la corrida", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n=====  CAS-2392 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
