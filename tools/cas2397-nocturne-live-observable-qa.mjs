// CAS-2397 — QA INDEPENDIENTE POST-FLIP (2-cliente) para NOCTURNE / CAZADOR NOCTURNO **LIVE** (NOCTURNE_HUNT.enabled:true, flip CAS-2396 CTO). EVO mecánica #66.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local ni el Higgsfield retirado.
//
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del CTO y de la DARK QA (tools/cas2395-nocturne-vamp-observable-qa.mjs):
//   · Oráculos re-derivados en Node: oracleTally/oracleTier/oracleBoost/oracleDecay/oraclePhase/oracleIsNight + share-cap oracleVampEff/Capped/Heal reimplementados desde la spec (NO importados de sim.js), cruzados CONTRA el VM (__dev.nocturne), la autoridad.
//   · Reloj de pared FIJO propio de QA (QNOW=9.270M, DISTINTO del GE 8.642M, CTO/goldFind 9.066M y de la DARK-vamp QA 9.195M) ⇒ una copia de los números no pasaría en silencio.
//   · PIDS RE-ETIQUETADOS (obs-A/obs-B/peer) — server-auth per-pid, invariante por renombrado.
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT fb99d94eca23 (flip CAS-2396) y AVANZÓ del pre-flip bdf43dcd2099 (EVO#65 ERUDITION flip CAS-2390).
//   (2) NOCTURNE_HUNT served enabled:TRUE (ya no false) + 18 flags arco true (incl. ERUDITION #65) ⇒ 19 flags true LIVE (0-regresión).
//   (3) DEFAULT-ON: nocturne().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ vampMul 0 + tag "").
//   (4) canal REUSADO `vamp` (lifesteal por el chokepoint del golpe melee hitEnemy) ACTIVO en el build LIVE con SHARE-CAP vs Vampírico (eff=min(vampCap≤0.5, base+boost), 0 doble-dip); ORTOGONALIDAD ⊥ goldFind/restedMult/xpGain/wardRegen/oocMitigation/lootQuality/critChance.
//
// Eje FRESCO = FASE TEMPORAL / CAZA NOCTURNA: nº de kills hechos DE NOCHE (isNightAt del reloj compartido) en ventana 30s, per-pid, decay half-life 25s.
// Diferenciadores LIVE: matar N× de NOCHE⇒tally N⇒ABRE (a CUÁNDO matas); cazar de DÍA⇒tally 0⇒NUNCA abre (OPUESTO a Erudition #65 diversidad de presas).
// Run: node tools/cas2397-nocturne-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2397-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "fb99d94eca23";   // build deployado por el flip NOCTURNE CAS-2396 (== version.json esperado)
const PREFLIP = "bdf43dcd2099";        // build servido ANTES del flip NOCTURNE (EVO#65 ERUDITION flip CAS-2390) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the NOCTURNE spec; NOT imported from sim.js) ──
const CFG = { minKills: 3, halfLifeSec: 25, accruePerSec: 1, capNocturne: 12, windowSec: 30,
  cycleSeconds: 1200, epochMs: 0, nightStart: 0.78, nightEnd: 0.28, vampCap: 0.5,
  tiers: [{ min: 2, boost: 0.06 }, { min: 4, boost: 0.12 }, { min: 6, boost: 0.20 }] };
const oraclePhase = (t) => { const cyc = Math.max(1, CFG.cycleSeconds); const x = ((+t || 0) / 1000 - CFG.epochMs / 1000) / cyc; return ((x % 1) + 1) % 1; };
const oracleIsNight = (t) => { const ph = oraclePhase(t), s = CFG.nightStart, e = CFG.nightEnd; return (s <= e) ? (ph >= s && ph < e) : (ph >= s || ph < e); };
const oracleTally = (marks, now, winMs) => { if (!Array.isArray(marks)) return 0; const lo = now - winMs; let n = 0;
  for (const m of marks) { const t = +(m && m.t) || 0; if (t < lo || t > now) continue; if ((+(m && m.n) || 0) === 1) n++; } return n; };
const oracleTier = (noct) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { if (noct >= CFG.tiers[i].min) idx = i + 1; } return idx; };
const oracleBoost = (noct) => { const t = oracleTier(noct); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capNocturne, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));
// ★ SHARE-CAP lifesteal oracle (VAMP): efectiva = min(vampCap, base + boost); capada si base+boost>cap. heal = round(dmg·eff). PURA.
const oracleVampEff = (base, boost) => Math.min(CFG.vampCap, (+base || 0) + (+boost || 0));
const oracleVampCapped = (base, boost) => ((+base || 0) + (+boost || 0)) > CFG.vampCap + 1e-12;
const oracleVampHeal = (dmg, eff) => Math.round((+dmg || 0) * eff);

const QNOW = 9_270_000;   // reloj de pared QA FIJO (≠ 8.642M GE, 9.066M goldFind, 9.195M DARK-vamp) — proyección determinista, mismo en ambos clientes.

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QANoct";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2", key: "2", bubbles: true })));  // class 2 (re-labeled)
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

async function installNoct(page) {
  await page.evaluate((QNOW) => {
    window.__QN = QNOW;
    window.__nmarks = (pid, marks) => { window.__dev.nocturne({ clear: true, nowMs: window.__QN }); window.__dev.nocturne({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    window.__nkills = (pid, ts, night) => { window.__dev.nocturne({ clear: true, nowMs: window.__QN, phaseOverride: (night ? 0.9 : 0.5) }); window.__dev.nocturne({ nowMs: window.__QN, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    window.__nstep = (pid, dt) => window.__dev.nocturne({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    window.__npick = (noct) => {
      window.__dev.nocturne({ enabled: true, self: "self" });
      const zones = window.__dev.nocturne().zones || [];
      for (const z of zones) {
        window.__dev.nocturne({ clear: true, nowMs: window.__QN });
        const s = window.__dev.nocturne({ nowMs: window.__QN, self: "self", noct, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.huntable) return { zone: z, noct: s.noct, tier: s.tier, boost: s.boost, vampMul: s.vampMul };
      }
      return null;
    };
    window.__night = (n, now) => Array.from({ length: n }, (_, i) => ({ n: 1, t: now - i * 500 }));
    window.__day = (n, now) => Array.from({ length: n }, (_, i) => ({ n: 0, t: now - i * 500 }));
  }, QNOW);
}

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installNoct(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function runOnce(round) {
  console.log(`\n===== CAS-2397 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page);
  const build = await page.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido — 18 flags arco true (incl. ERUDITION) + NOCTURNE_HUNT served true ⇒ 19 flags true (0-regr) + channel vamp + vampCap 0.5
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "FELLOWSHIP_BOND", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const noctServed = en("NOCTURNE_HUNT");          // EVO#66 — DEBE estar served true (flip CAS-2396 landed)
  const chanOk = /channel:\s*"vamp"/.test(cfgSrc) && /vampCap:\s*0\.5/.test(cfgSrc);

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + NOCTURNE served true + 18 arco true + channel vamp/vampCap 0.5 + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.nocturne && window.__dev.erudition && window.__dev.delve && window.__dev.trailcraft && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.fellowship && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.nocturne+arc hooks(+erudition/focus/fellowship)+saveBlob+fp; served NOCTURNE_HUNT.enabled:true + 18 arco true (19 flags true, 0-regr) + channel vamp + vampCap 0.5 + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && noctServed === "true" && arcTrue && chanOk && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} NOCTURNE=${noctServed} chan=${chanOk} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: nocturne().enabled===true (el flip cargó) + channel 'vamp' + vampCap 0.5 + passive 0 sin caza; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.nocturne(); return { enabled: s.enabled, tier: s.tier, noct: s.noct, boost: s.boost, vampMul: s.vampMul, channel: s.channel, vampCap: s.vampCap, tag: s.tag }; });
  const off = await page.evaluate(() => { window.__dev.nocturne({ enabled: false, leave: true }); const s = window.__dev.nocturne(); const t = { vampMul: s.vampMul, tag: s.tag }; window.__dev.nocturne({ enabled: true }); return t; });
  ok("2 DEFAULT-ON (flip cargó): nocturne().enabled===true; channel 'vamp'; vampCap 0.5; sin caza ⇒ tier/noct/boost/vampMul 0 tag \"\"; TOGGLE enabled:false ⇒ vampMul 0 + tag \"\" (byte-neutro)",
     dOn.enabled === true && dOn.channel === "vamp" && near(dOn.vampCap, 0.5) && dOn.tier === 0 && dOn.noct === 0 && dOn.boost === 0 && dOn.vampMul === 0 && dOn.tag === "" && off.vampMul === 0 && off.tag === "",
     `enabled=${dOn.enabled} channel=${dOn.channel} vampCap=${dOn.vampCap} vampMul=${dOn.vampMul} tag="${dOn.tag}"`);

  // 3 ★ tally pure fn — VM probe == oracle re-derivado (n=1 noche cuenta, n=0 día nunca)
  const tallyData = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true });
    const win = 30000;
    const T = (marks) => window.__dev.nocturne({ tallyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      oneNight:  [{ n: 1, t: QNOW }],
      manyNight: [{ n: 1, t: QNOW - 4000 }, { n: 1, t: QNOW - 2000 }, { n: 1, t: QNOW }],
      allDay:    [{ n: 0, t: QNOW - 4000 }, { n: 0, t: QNOW - 2000 }, { n: 0, t: QNOW }],
      mixed:     [{ n: 1, t: QNOW - 3000 }, { n: 0, t: QNOW - 2000 }, { n: 1, t: QNOW }],
      expired:   [{ n: 1, t: QNOW - 45000 }, { n: 1, t: QNOW }],
      empty:     [],
    };
    const vm = {}; for (const k in cases) vm[k] = T(cases[k]);
    return { cases, vm };
  }, QNOW);
  const tallyOracleOk = Object.keys(tallyData.cases).every(k => tallyData.vm[k] === oracleTally(tallyData.cases[k], QNOW, 30000));
  const tallyExpectOk = tallyData.vm.oneNight === 1 && tallyData.vm.manyNight === 3 && tallyData.vm.allDay === 0 && tallyData.vm.mixed === 2 && tallyData.vm.expired === 1 && tallyData.vm.empty === 0;
  ok("3 ★ TALLY = fn PURA (VM probe == oracle): 1 noche⇒1; 3 noche⇒3; 3 DÍA⇒0 (n=0 nunca cuenta); mixto 2N+1D⇒2; fuera-ventana⇒excl; vacío⇒0",
     tallyOracleOk && tallyExpectOk, `vm=${JSON.stringify(tallyData.vm)}`);

  // 4 tier table — VM vs oracle
  const tab = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const lv of [6, 4, 2, 1, 0]) {
      window.__dev.nocturne({ clear: true, nowMs: QNOW });
      const s = window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: lv, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ lv, noct: s.noct, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.noct, r.lv) && r.tier === oracleTier(r.lv) && near(r.boost, oracleBoost(r.lv)));
  ok("4 TABLA de tiers = fn PURA de nocturne (VM == oracle): 6→T3+0.20; 4→T2+0.12; 2→T1+0.06; 1→T0; 0→T0",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 5 reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    window.__dev.nocturne({ clear: true, nowMs: QNOW });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", push: { "obs-A": { noct: 8, atMs: QNOW }, peer: { noct: 5, atMs: QNOW } } });
    const at0 = window.__dev.nocturne({ nowMs: QNOW });
    const at25 = window.__dev.nocturne({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.nocturne({ nowMs: QNOW + 50000 });
    return { a0: at0.noctMap["obs-A"], p0: at0.noctMap.peer, a25: at25.noctMap["obs-A"], a50: at50.noctMap["obs-A"] };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02);
  ok("5 SERVER-AUTH reflect+project: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s)",
     reflOk, JSON.stringify(refl));

  // 6 ★ accumulator = fn of NIGHT TALLY (día tally0 ⇒ jamás abre; noche sostenida ⇒ T1→T2→T3)
  const acc = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    const tDay = window.__dev.nocturne({ tallyProbe: { marks: window.__day(4, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    const tNight = window.__dev.nocturne({ tallyProbe: { marks: window.__night(4, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    window.__nmarks("self", window.__day(4, QNOW));
    window.__dev.nocturne({ toZone: zone });
    const dayStep = window.__nstep("self", 5);
    window.__nmarks("self", window.__night(4, QNOW));
    window.__dev.nocturne({ toZone: zone });
    const tick1 = window.__nstep("self", 0.5);
    const s2 = window.__nstep("self", 1.5);
    const s3 = window.__nstep("self", 2);
    const s4 = window.__nstep("self", 2);
    return { zone, tDay, tNight, dayNoct: dayStep.noct, dayTier: dayStep.tier, tick1Noct: tick1.noct, tick1Tier: tick1.tier, s2Tier: s2.tier, s3Tier: s3.tier, s4Tier: s4.tier };
  }, QNOW);
  const accOk = !acc.bad && acc.tDay === 0 && acc.tNight === 4 &&
    near(acc.dayNoct, 0) && acc.dayTier === 0 &&
    acc.tick1Noct > 0 && acc.tick1Noct < 2 && oracleTier(acc.tick1Noct) === 0 && acc.tick1Tier === 0 &&
    acc.s2Tier >= 1 && acc.s3Tier >= 2 && acc.s4Tier === 3;
  ok("6 ★ ACUMULADOR = fn del TALLY NOCTURNO: kills de DÍA (tally0)⇒add 0 (jamás abre, eje TEMPORAL); 4 kills de NOCHE 1-tick dt=0.5⇒noct<2⇒T0 (permanencia); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify(acc));

  // 7 ★ differentiator (WHEN you kill) + phase derivation PURE
  const diff = await page.evaluate((QNOW) => {
    const pN1 = window.__dev.nocturne({ phaseProbe: 1080000 }).phaseProbe;   // phase 0.9 ⇒ night
    const pDay = window.__dev.nocturne({ phaseProbe: 600000 }).phaseProbe;   // phase 0.5 ⇒ day
    const pN2 = window.__dev.nocturne({ phaseProbe: 120000 }).phaseProbe;    // phase 0.1 ⇒ night (wraps midnight)
    window.__nkills("self", [QNOW - 6000, QNOW - 5000, QNOW - 4000, QNOW - 3000, QNOW - 2000, QNOW - 1000, QNOW - 500, QNOW], true);
    const nightTally = window.__dev.nocturne({ nowMs: QNOW, self: "self" });
    const nightStep = window.__nstep("self", 6);
    window.__nkills("self", [QNOW - 6000, QNOW - 5000, QNOW - 4000, QNOW - 3000, QNOW - 2000, QNOW - 1000, QNOW - 500, QNOW], false);
    const dayStep = window.__nstep("self", 6);
    return { pN1, pDay, pN2, nightMap: nightTally.noctMap, nightTier: nightStep.tier, dayTier: dayStep.tier };
  }, QNOW);
  const phaseOk = diff.pN1 && near(diff.pN1.phase, oraclePhase(1080000), 1e-5) && diff.pN1.night === oracleIsNight(1080000) && diff.pN1.night === true &&
    diff.pDay && diff.pDay.night === oracleIsNight(600000) && diff.pDay.night === false &&
    diff.pN2 && diff.pN2.night === oracleIsNight(120000) && diff.pN2.night === true;
  const diffOk = phaseOk && diff.nightTier === 3 && diff.dayTier === 0;
  ok("7 ★ DIFERENCIADOR: matar 8× DE NOCHE⇒tally sube⇒ABRE (OPUESTO a Erudition #65); cazar de DÍA⇒tally 0⇒NO abre (TEMPORAL); isNightAt PURA (0.9⇒noche,0.5⇒día,0.1⇒noche)",
     diffOk, JSON.stringify({ phaseOk, nightTier: diff.nightTier, dayTier: diff.dayTier }));

  // 8 ★ decay steps tier down
  const decay = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.nocturne({ clear: true, nowMs: QNOW });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.nocturne({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.nocturne({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.noct, t0: a0.tier, b0: a0.boost, d25: a25.noct, t25: a25.tier, b25: a25.boost, d50: a50.noct, t50: a50.tier, b50: a50.boost };
  }, QNOW);
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && near(decay.b0, 0.20) &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000)) && near(decay.b25, oracleBoost(oracleDecay(6, 25000))) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000)) && decay.t50 === 0;
  ok("8 ★ DECAY 0-RNG vida-media (VM == oracle): 6(T3+.20)→3@25s(T1+.06)→1.5@50s(T0)",
     decayOk, JSON.stringify(decay));

  // 9 passive isolated (canal vamp): vampMul en zona / 0 fuera
  const pass = await page.evaluate((QNOW) => {
    const w = window.__npick(4); if (!w) return { bad: true };   // T2 +0.12 lifesteal
    const inz = window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.nocturne({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.vampMul, outBoost: out.boost, outTier: out.tier, outMul: out.vampMul };
  }, QNOW);
  ok("9 PASSIVE individual (canal vamp, aislado): héroe EN zona con noct4 ⇒ boost==0.12 (T2) + tier2 + vampMul>0; leave (fuera de zona) ⇒ boost 0 + tier 0 + vampMul 0",
     !pass.bad && near(pass.inBoost, 0.12) && pass.inTier === 2 && near(pass.inMul, 0.12) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 10 ★ CANAL REUSADO vamp wired + SEAM MELEE LIFESTEAL (grep seam + vampHit vs oracle)
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function nocturneMul\(h,\s*kind\)/.test(simSrc) &&
    /function nocturneVampSteal\(h,\s*base\)/.test(simSrc) &&
    /const eff\s*=\s*nocturneVampSteal\(h,\s*bb\.lifesteal\s*\|\|\s*0\)/.test(simSrc) &&        // seam melee usa lifesteal EFECTIVA (share-cap)
    /const gf\s*=\s*kinshipMul\(h,"goldFind"\)\s*\+\s*focusMul\(h,"goldFind"\)\s*;/.test(simSrc) && // goldFind YA NO referencia nocturne (repunte CAS-2394)
    !/nocturneMul\(h,\s*"goldFind"\)/.test(simSrc);                                              // 0 rastro de nocturne en goldFind
  const vamp = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };   // noct6 ⇒ T3 ⇒ boost 0.20
    window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    const on = window.__dev.nocturne({ vampHit: { dmg: 1000, base: 0 } }).vampHit;      // eff=min(0.5,0+0.20)=0.20 ⇒ heal round(1000·0.20)=200
    window.__dev.nocturne({ enabled: false });
    const off = window.__dev.nocturne({ vampHit: { dmg: 1000, base: 0.3 } }).vampHit;   // OFF ⇒ nv0 ⇒ eff===base 0.3 (byte-id) ⇒ heal 300
    const offTag = window.__dev.nocturne().tag;
    window.__dev.nocturne({ enabled: true });
    return { on, off, offTag };
  }, QNOW);
  const vampOk = !vamp.bad && vamp.on && near(vamp.on.nocturneBonus, 0.20) &&
    near(vamp.on.eff, oracleVampEff(0, 0.20)) && vamp.on.heal === oracleVampHeal(1000, oracleVampEff(0, 0.20)) && vamp.on.heal === 200 && vamp.on.capped === oracleVampCapped(0, 0.20) &&
    vamp.off && vamp.off.nocturneBonus === 0 && near(vamp.off.eff, 0.3) && vamp.off.heal === 300 && vamp.offTag === "";
  ok("10 ★ CANAL REUSADO vamp wired + SEAM MELEE LIFESTEAL (grep nocturneVampSteal + eff=nocturneVampSteal(bb.lifesteal); goldFind SIN nocturne): T3 vampHit dmg1000 base0 ⇒ eff 0.20 heal 200 (VM==oracle); OFF ⇒ nocturneBonus 0 ⇒ eff===base 0.3 heal 300 byte-id + tag \"\"",
     seamWired && vampOk, `wired=${seamWired} ${JSON.stringify(vamp)}`);

  // 11 ★ SHARE-CAP con el Vampírico existente: eff = min(vampCap≤0.5, base + boost)
  const scap = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };   // T3 ⇒ boost 0.20
    window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    const cap = window.__dev.nocturne().vampCap;
    const hit = (base) => window.__dev.nocturne({ vampHit: { dmg: 1000, base } }).vampHit;
    return { cap,
      solo:  hit(0),      // base0 ⇒ Nocturne solo ⇒ eff 0.20 (no capped)
      add:   hit(0.1),    // 0.1+0.20=0.30 < cap ⇒ eff 0.30 (suma, no capped)
      cap45: hit(0.45),   // 0.45+0.20=0.65 > cap ⇒ eff cap 0.50 (SUMA capada, capped=true — 0 doble-dip)
      cap50: hit(0.5),    // base ya en cap ⇒ Nocturne no añade ⇒ eff 0.50 (capped)
    };
  }, QNOW);
  const scapOk = !scap.bad && near(scap.cap, CFG.vampCap) &&
    near(scap.solo.eff, oracleVampEff(0, 0.20)) && scap.solo.capped === oracleVampCapped(0, 0.20) && scap.solo.heal === oracleVampHeal(1000, oracleVampEff(0, 0.20)) && near(scap.solo.eff, 0.20) && scap.solo.heal === 200 &&
    near(scap.add.eff, oracleVampEff(0.1, 0.20)) && scap.add.capped === oracleVampCapped(0.1, 0.20) && near(scap.add.eff, 0.30) && scap.add.heal === 300 &&
    near(scap.cap45.eff, oracleVampEff(0.45, 0.20)) && scap.cap45.capped === true && oracleVampCapped(0.45, 0.20) === true && near(scap.cap45.eff, 0.50) && scap.cap45.heal === 500 &&
    near(scap.cap50.eff, 0.50) && scap.cap50.capped === true;
  ok("11 ★ SHARE-CAP con Vampírico (VM==oracle min(vampCap,base+boost)): base0⇒eff 0.20 (Nocturne solo); base0.1⇒eff 0.30 (suma); base0.45+0.20⇒eff CAPADO a 0.50 (NO 0.65, capped=true, 0 doble-dip); base0.5⇒eff 0.50 (Nocturne no añade)",
     scapOk, JSON.stringify(scap));

  // 12 ★ ORTHOGONALITY vamp ⊥ goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance
  const orth = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.kinship({ enabled: false }); window.__dev.focus({ enabled: false });
    const a = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    const vampBefore = a.vampMul, goldBefore = a.goldFindMul, restedBefore = a.restedXpMult;
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: QNOW });
    window.__dev.kinship({ nowMs: QNOW, push: { [zone]: { kinship: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: QNOW });
    window.__dev.convoy({ nowMs: QNOW, push: { [zone]: { march: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: QNOW });
    window.__dev.ward({ nowMs: QNOW, push: { [zone]: { ward: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: [{ c: "0,0", t: QNOW }, { c: "1,0", t: QNOW }, { c: "2,0", t: QNOW }, { c: "3,0", t: QNOW }] }, toZone: zone });
    window.__dev.fellowship({ enabled: true, nowMs: QNOW });
    window.__dev.trailcraft({ enabled: true, self: "self" }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
    window.__dev.trailcraft({ nowMs: QNOW, self: "self", craft: 6, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.delve({ enabled: true, self: "self" }); window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.erudition({ enabled: true, self: "self" }); window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: zone });   // re-assert self
    const b = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    window.__dev.kinship({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false }); window.__dev.fellowship({ enabled: false }); window.__dev.trailcraft({ enabled: false }); window.__dev.delve({ enabled: false }); window.__dev.erudition({ enabled: false });
    return { zone, channel: a.channel, vampBefore, goldBefore, restedBefore,
      vampAfter: b.vampMul, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, xpAfter: b.xpGainMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "vamp" && near(orth.vampBefore, 0.20) &&
    near(orth.vampAfter, orth.vampBefore) &&
    orth.goldBefore === 0 &&
    orth.goldAfter > 0 && orth.xpAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "" && orth.critAfter > 0;
  ok("12 ★ ORTOGONALIDAD vamp ⊥ goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance: el vampMul de nocturne (0.20) queda INTACTO con 8 canales rivales al máximo (0.20→0.20); goldFind SIN nocturne (0 antes de KINSHIP); cada canal responde SÓLO a su propio seam (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 13 ★ 6 zones host the passive (vampMul>0)
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    const zones = window.__dev.nocturne().zones; const broken = [];
    for (const z of zones) {
      window.__dev.nocturne({ clear: true, nowMs: QNOW });
      const s = window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.huntable && s.tier === 3 && Math.abs(s.boost - 0.20) < 1e-6 && s.vampMul > 0)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("13 ★ NOCTURNE 6 zonas: las 6 zonas de NOCTURNE_HUNT.zones hospedan el pasivo (noct6⇒T3, boost 0.20, vampMul>0) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 14 render badge "Nocturno:" ON / not OFF + fps 60-budget
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Nocturno:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__npick(6); window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.nocturne({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    window.__dev.nocturne({ enabled: true });
    return { onCnt, offCnt, fps };
  }, QNOW);
  ok("14 render badge \"Nocturno:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano ≥30 (colon único, no colisiona)",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate((QNOW) => { const w = window.__npick(6); window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(300);
  if (round === 1) await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.close();
  return build;
}

async function northStar() {
  console.log(`\n===== ★ NORTH STAR 2-cliente LIVE (desync = sev-1) =====`);
  const nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await boot(p);
    await p.evaluate(() => window.__dev.nocturne({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const zone = await A.evaluate(() => (window.__dev.nocturne({ enabled: true }).zones || [])[3]);   // idx3 (re-labeled)

  const readBoth = async (elapsedSec) => {
    const inj = (pg, selfPid) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
      window.__dev.nocturne({ enabled: true, self });
      window.__dev.nocturne({ clear: true, nowMs: QNOW });
      const s = window.__dev.nocturne({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
        "obs-A": { noct: 6, atMs: QNOW }, "obs-B": { noct: 2, atMs: QNOW }, peer: { noct: 6, atMs: QNOW },
      }, toZone: zone });
      return { self: s.self, noct: s.noct, tier: s.tier, boost: s.boost, mul: s.vampMul, nowMs: s.nowMs, map: s.noctMap };
    }, { self: selfPid, elapsedSec, zone, QNOW });
    const [a, b] = await Promise.all([inj(A, "peer"), inj(B, "peer")]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };

  let allEq = true, log = [];
  // (a) MISMO snapshot+reloj (peer=T3+.20) ⇒ noct/tier/boost/vampMul byte-id + noctMap idéntico
  const shared = await readBoth(0);
  const sharedOk = shared.eq && shared.a.tier === 3 && near(shared.a.noct, 6) && near(shared.a.boost, 0.20) && near(shared.a.mul, 0.20);
  if (!sharedOk) allEq = false;
  log.push(`shared:${shared.eq ? "==T" + shared.a.tier + "/+" + shared.a.boost : "DESYNC " + JSON.stringify(shared.a) + "/" + JSON.stringify(shared.b)}`);

  // (b) decay converge: peer 6 +25s ⇒ 3 (T1 +.06) en ambos
  const decayed = await readBoth(25);
  const decayEq = decayed.eq && decayed.a.tier === 1 && near(decayed.a.noct, oracleDecay(6, 25000), 0.02) && near(decayed.a.boost, 0.06);
  if (!decayEq) allEq = false;
  log.push(`decay+25s:${decayEq ? "==T1/+.06" : "DESYNC " + JSON.stringify(decayed.a) + "/" + JSON.stringify(decayed.b)}`);

  // (c) per-pid: A=obs-A (T3+.20) vs B=obs-B (T1+.06) — cada self ve SU noct, pero noctMap idéntico
  const push = { "obs-A": { noct: 6, atMs: QNOW }, "obs-B": { noct: 2, atMs: QNOW } };
  const rA = await A.evaluate(({ zone, QNOW, push }) => { window.__dev.nocturne({ enabled: true, self: "obs-A" }); window.__dev.nocturne({ clear: true, nowMs: QNOW }); const s = window.__dev.nocturne({ nowMs: QNOW, self: "obs-A", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, mul: s.vampMul, map: s.noctMap }; }, { zone, QNOW, push });
  const rB = await B.evaluate(({ zone, QNOW, push }) => { window.__dev.nocturne({ enabled: true, self: "obs-B" }); window.__dev.nocturne({ clear: true, nowMs: QNOW }); const s = window.__dev.nocturne({ nowMs: QNOW, self: "obs-B", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, mul: s.vampMul, map: s.noctMap }; }, { zone, QNOW, push });
  const perpidOk = rA.self === "obs-A" && rA.tier === 3 && near(rA.boost, 0.20) &&
    rB.self === "obs-B" && rB.tier === 1 && near(rB.boost, 0.06) &&
    JSON.stringify(rA.map) === JSON.stringify(rB.map);
  if (!perpidOk) allEq = false;
  log.push(`perpid:A(T${rA.tier}/+${rA.boost})/B(T${rB.tier}/+${rB.boost}) mapEq=${JSON.stringify(rA.map) === JSON.stringify(rB.map)}`);

  // (d) A SALE de zona ⇒ boost/vampMul 0 (Δ_A=0) PERO noctMap server-auth + Δ_B INTACTOS
  await readBoth(0);
  const aLeaves = await A.evaluate(() => { const s = window.__dev.nocturne({ leave: true }); return { boost: s.boost, mul: s.vampMul, tier: s.tier, map: s.noctMap, noct: s.noct }; });
  const bIntact = await B.evaluate(`(function(){ const N=${QNOW}; const s=window.__dev.nocturne({self:"obs-B",nowMs:N,toZone:${JSON.stringify(zone)}}); return {boost:s.boost,mul:s.vampMul,tier:s.tier,noct:s.noct}; })()`);
  const leaveOk = aLeaves.boost === 0 && aLeaves.mul === 0 && aLeaves.tier === 0 && aLeaves.map && (aLeaves.map["obs-A"] || 0) > 0 && (aLeaves.map["obs-B"] || 0) > 0 &&
    near(aLeaves.noct, 6) && near(bIntact.boost, 0.06) && bIntact.tier === 1;
  if (!leaveOk) allEq = false;
  log.push(`A-leave:Δ_A=${aLeaves.boost === 0 ? "0" : aLeaves.boost} mapA=${aLeaves.map && aLeaves.map["obs-A"]} mapB=${aLeaves.map && aLeaves.map["obs-B"]} Δ_B=+${bIntact.boost}/T${bIntact.tier}`);

  ok("15 ★ NORTH STAR 2-cliente LIVE: MISMO snapshot+reloj ⇒ noct/tier/boost/vampMul byte-idénticos (peer T3+.20, decae T1+.06); per-pid A(T3+.20) vs B(T1+.06) noctMap idéntico; A sale ⇒ boost/vampMul 0 (Δ_A=0) PERO noctMap+Δ_B INTACTOS (0 desync)",
     allEq, log.join("  "));
  await A.screenshot({ path: join(OUT, "client-a-nightlord.png") });
  await B.screenshot({ path: join(OUT, "client-b-incipient.png") });
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
console.log(`\n=====  CAS-2397 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  build=${EXPECT_BUILD}  =====`);
process.exit(FAIL === 0 ? 0 : 1);
