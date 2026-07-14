// CAS-2368 — QA INDEPENDIENTE POST-FLIP (2-cliente) para CAMARADERÍA / KINSHIP BOND **LIVE** (KINSHIP_BOND.enabled:true, flip CAS-2367). EVO mecánica #60.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores), NO un mirror local.
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE y de la DARK QA (tools/cas2361-kinship-{selfverify,live-observable-qa}.mjs):
//   · Oráculos re-derivados en Node (pares por celda coarse, tiers, decay vida-media, bono de oro) — NO se reusa ninguna función del juego como fuente de verdad.
//   · Sets de POSICIONES propios de QA con celdas TRASLADADAS (base lejos del origen) ⇒ prueba que el cómputo de pares NO depende de coords absolutas (invariante a traslación).
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes contra el LIVE (desync = sev-1).
//
// Difs vs la DARK QA (esto es POST-FLIP LIVE):
//   (1) build servido = version.json = EXPECT 40622de6bc8f (flip CAS-2367) y AVANZÓ del pre-flip ce3717254190 (EVO#59 WARDING_RING flip CAS-2365).
//   (2) KINSHIP_BOND served enabled:TRUE (ya no false) + 11 flags del arco served true (0-regresión) ⇒ 12 flags true LIVE.
//   (3) DEFAULT-ON: kinship().enabled===true al bootear (el flip cargó); byte-id verificada vía TOGGLE (enabled false ⇒ 0 + save sin clave + fingerprint estable).
//   (4) canal FRESCO goldFind PAGA bono de oro en el build LIVE; ORTOGONALIDAD goldFind ⊥ restedMult ⊥ wardRegen (0 doble-conteo) confirmada contra el served.
//
// DOS pivotes FRESCOS bajo prueba: (A) CANAL goldFind (bono de ORO al recoger monedas, seam tryPickup) ⊥ restedMult (XP) ⊥ wardRegen (HP, #59). (B) EJE PERSISTENCIA DE VÍNCULO (proximidad pareada SOSTENIDA).
// Diferenciadores LIVE: AMONTONADOS ⇒ ABREN (OPUESTO a Warding #59); par 1-tick ⇒ NO (≠ Congregación, requiere permanencia); QUIETOS cuentan (≠ Convoy velocidad); 1 solo / 2 lejos ⇒ NO.
// Run: node tools/cas2368-kinship-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2368-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "40622de6bc8f";   // build deployado por el flip CAS-2367 (== version.json esperado)
const PREFLIP = "ce3717254190";        // build servido ANTES del flip (EVO#59 WARDING_RING flip CAS-2365) — el LIVE debe AVANZAR de este

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ─────────── ORÁCULOS QA (re-derivados, independientes del juego) ───────────
const CELL = 128, MIN_PAIRS = 1, HALFLIFE_MS = 25000, CAP = 12, ACCRUE = 1;
const TIERS = [{ min: 2, boost: 0.05 }, { min: 4, boost: 0.10 }, { min: 6, boost: 0.15 }];
const cellOf = (v) => Math.floor(v / CELL);
function qaPairs(pts) {                                   // oráculo: pares próximos (Chebyshev≤1 en celda coarse) — PURO
  const P = pts.filter(p => p && isFinite(p.x) && isFinite(p.y));
  const c = P.map(p => [cellOf(p.x), cellOf(p.y)]);
  let pairs = 0;
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++)
    if (Math.max(Math.abs(c[i][0] - c[j][0]), Math.abs(c[i][1] - c[j][1])) <= 1) pairs++;
  return { members: P.length, pairs };
}
function qaTier(k) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (k >= TIERS[i].min) t = i + 1; return t; }
function qaBoost(k) { const t = qaTier(k); return t > 0 ? TIERS[t - 1].boost : 0; }
const qaDecay = (base, dtMs) => Math.min(CAP, base * Math.pow(0.5, dtMs / HALFLIFE_MS));
const qaGold = (raw, boost) => Math.round(raw * (1 + boost));

// ─────────── SETS DE POSICIONES PROPIOS DE QA (celdas TRASLADADAS lejos del origen) ───────────
// Base en celda (5,-4) ≈ (640..767, -512..-385) — muy lejos de los sets del GE (cerca del origen) ⇒ prueba invariancia a traslación del conteo de pares.
const QP = {
  same:  [{ x: 700, y: -400 }, { x: 760, y: -390 }],                                             // ambos celda(5,-4) ⇒ 1 par
  adj:   [{ x: 700, y: -400 }, { x: 800, y: -400 }],                                             // celda(5,-4)+(6,-4) adyacente ⇒ 1 par
  far:   [{ x: 700, y: -400 }, { x: 1050, y: -400 }],                                            // celda(5,-4)+(8,-4) Chebyshev 3 ⇒ 0 pares (NO abre)
  solo:  [{ x: 700, y: -400 }],                                                                  // 1 solo ⇒ 0 pares
  clump5:[{ x: 650, y: -390 }, { x: 700, y: -400 }, { x: 720, y: -410 }, { x: 745, y: -500 }, { x: 760, y: -460 }], // 5 en celda(5,-4) ⇒ C(5,2)=10 (AMONTONADOS ABREN, opuesto a Warding)
  two:   [{ x: 700, y: -400 }, { x: 720, y: -410 }, { x: 660, y: -450 }, { x: 2600, y: 2600 }, { x: 2650, y: 2650 }, { x: 2620, y: 2680 }], // 2 clusters lejanos de 3: intra C(3,2)×2 = 6, inter 0 ⇒ 6 pares
};
const NOW = 6_300_000;   // reloj de pared FIJO propio de QA (≠ 9_600_000 del GE)

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
async function installKin(page) {
  await page.evaluate((NOW) => {
    window.__KNOW = NOW;
    // empuja el kinship crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ kinship == base exacto)
    window.__ksnap = (zone, kin) => { window.__dev.kinship({ clear: true, nowMs: window.__KNOW }); return window.__dev.kinship({ nowMs: window.__KNOW, push: { [zone]: { kinship: kin, atMs: window.__KNOW } } }); };
    // aplica POSICIONES {pts,dt} en UNA zona (CLEAR antes ⇒ kinship = accruePerSec·dt si sostiene, o 0)
    window.__kpos = (zone, pts, dt) => { window.__dev.kinship({ clear: true, nowMs: window.__KNOW }); return window.__dev.kinship({ nowMs: window.__KNOW, positions: { [zone]: { pts, dt } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__kat = (zone, elapsedSec) => window.__dev.kinship({ nowMs: window.__KNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta kinship `kin` en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (bondable + zona coincide).
    window.__kpick = (kin) => {
      window.__dev.kinship({ enabled: true });
      const zones = window.__dev.kinship().zones || [];
      for (const z of zones) {
        window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
        const s = window.__dev.kinship({ nowMs: window.__KNOW, push: { [z]: { kinship: kin, atMs: window.__KNOW } }, toZone: z });
        if (s.zone === z && s.bondable) return { zone: z, kinship: s.kinship, tier: s.tier, boost: s.goldFindMul };
      }
      return null;
    };
  }, NOW);
}
async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installKin(page);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
async function runOnce(round) {
  console.log(`\n===== CAS-2368 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido (una vez) — 11 flags arco served true + KINSHIP_BOND.enabled:true
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const kinServed = en("KINSHIP_BOND");
  const fellowServed = en("FELLOWSHIP_BOND");   // EVO#47 (canal xpGain distinto) — DEBE seguir LIVE e intacto

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + KINSHIP_BOND served true + 11 arco true + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.kinship+convoy+ward+saveBlob+fp hooks; served KINSHIP_BOND.enabled:true + 11 flags arco true (0 regr); 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && kinServed === "true" && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} KINSHIP_BOND=${kinServed} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: kinship().enabled===true (el flip cargó) + passive 0 sin pares; byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.kinship(); return { enabled: s.enabled, mul: s.goldFindMul, tier: s.tier, kinship: s.kinship, tag: s.tag }; });
  const byteId = await page.evaluate(() => {
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.kinship({ enabled: false, leave: true });
    const s = window.__dev.kinship();
    const saveOff = (() => { const b = window.__dev.saveBlob(); return typeof b === "string" ? b : JSON.stringify(b); })();
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.kinship({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.goldFindMul, tag: s.tag, tier: s.tier, saveNoKey: !/["']kinship(Server)?["']/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON servido: kinship().enabled===true (flip cargó) + passive 0 sin pares; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave kinship + fingerprint estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.kinship === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installKin(page);   // re-instala tras el toggle (idempotente)
  await page.evaluate(() => window.__dev.kinship({ enabled: true }));

  // 5 — ★ PARES = función pura, oráculo QA vs juego (pairsProbe), sets con celdas TRASLADADAS
  const pairRes = [];
  for (const [k, pts] of Object.entries(QP)) {
    const g = await page.evaluate((pts) => window.__dev.kinship({ pairsProbe: { positions: pts } }).probe, pts);
    const o = qaPairs(pts);
    const match = g && g.pairs === o.pairs && g.members === o.members;
    pairRes.push(`${k}:p${g && g.pairs}${match ? "" : `!=QA(${o.pairs})`}`);
    if (!match) FAIL++;
  }
  ok("5 ★ PARES puros LIVE: juego == oráculo QA en 6 sets (celdas trasladadas lejos del origen ⇒ invariante a traslación): same1/adj1/far0/solo0/clump5=10/two=6",
     pairRes.every(r => !r.includes("!=")), pairRes.join(" "));

  // 6 — TABLA de tiers = función pura del kinship (juego vs oráculo QA)
  const tierRes = [];
  for (const kv of [0, 1, 2, 3, 4, 5, 6, 9]) {
    const g = await page.evaluate((kv) => { const s = window.__kpick(kv); return s ? { tier: s.tier, boost: s.boost } : { tier: 0, boost: 0 }; }, kv);
    const okT = g.tier === qaTier(kv) && near(g.boost, qaBoost(kv));
    tierRes.push(`k${kv}:T${g.tier}${okT ? "" : "X"}`); if (!okT) FAIL++;
  }
  ok("6 tiers puros del kinship LIVE: juego == oráculo QA (1→T0,2→T1,4→T2,6→T3; boost 0/0.05/0.10/0.15)", tierRes.every(r => !r.includes("X")), tierRes.join(" "));

  // 7 — server-authoritative: zona fuera de `zones` descartada; kinship negativo clamped
  const authz = await page.evaluate(() => {
    window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
    window.__dev.kinship({ nowMs: window.__KNOW, push: { town: { kinship: 6, atMs: window.__KNOW }, forest: { kinship: -5, atMs: window.__KNOW } } });
    const m = window.__dev.kinship().kinshipMap || {};
    return { townDropped: !("town" in m), forestClamped: !("forest" in m) || (m.forest || 0) <= 0 };
  });
  ok("7 server-authoritative reflect LIVE: zona no-caza 'town' descartada + kinship negativo clamped/descartado",
     authz.townDropped && authz.forestClamped, JSON.stringify(authz));

  // 8 — ★ ACUMULADOR = función de las POSICIONES: par sostenido dt3⇒3(T1)/dt6⇒6(T3); far/solo⇒0
  const accr = await page.evaluate((QP) => {
    const z = window.__dev.kinship().zones[0];
    const dt3 = (window.__kpos(z, QP.same, 3).kinshipMap || {})[z] || 0;   // sostiene ⇒ 3
    const dt6 = (window.__kpos(z, QP.same, 6).kinshipMap || {})[z] || 0;   // sostiene ⇒ 6
    const farK = (window.__kpos(z, QP.far, 6).kinshipMap || {})[z] || 0;   // 0 pares ⇒ 0
    const soloK = (window.__kpos(z, QP.solo, 6).kinshipMap || {})[z] || 0; // 0 pares ⇒ 0
    return { dt3, dt6, farK, soloK };
  }, QP);
  ok("8 ★ acumulador de POSICIONES LIVE: par próximo dt3⇒kinship3 / dt6⇒kinship6 (accruePerSec·dt); far⇒0; solo⇒0",
     near(accr.dt3, 3 * ACCRUE) && near(accr.dt6, 6 * ACCRUE) && accr.farK === 0 && accr.soloK === 0, JSON.stringify(accr));

  // 9 — ★ DIFERENCIADORES: clump5 ABRE (opuesto a Warding); par 1-tick dt0.5⇒NO (≠ Congregación); quietos cuentan (≠ Convoy); far/solo NO
  const diff = await page.evaluate((QP) => {
    const z = window.__dev.kinship().zones[0]; const out = {};
    const read = (pts, dt) => { const s = window.__kpos(z, pts, dt); const k = (s.kinshipMap || {})[z] || 0; const vm = window.__dev.kinship({ nowMs: window.__KNOW, toZone: z }); return { kinship: k, tier: vm.tier, mul: vm.goldFindMul }; };
    out.clump = read(QP.clump5, 4);   // AMONTONADOS pares=10 sostenidos dt4 ⇒ kinship4 ⇒ T2 (ABRE, opuesto a Warding onRing0)
    out.tick  = read(QP.same, 0.5);   // par 1-tick dt0.5 ⇒ kinship0.5 < 2 ⇒ NO abre (≠ Congregación)
    out.hold  = read(QP.same, 4);     // par SOSTENIDO dt4 (QUIETOS) ⇒ kinship4 ⇒ T2 (cuenta ≠ Convoy velocidad)
    out.far   = read(QP.far, 6);      // 2 lejos ⇒ 0 pares ⇒ NO abre
    out.solo  = read(QP.solo, 6);     // 1 solo ⇒ NO abre
    return out;
  }, QP);
  const opens = (o) => o.tier >= 1 && o.mul > 0;
  ok("9 ★ diferenciadores LIVE: clump5 ABRE (T2, opuesto a Warding); par 1-tick⇒NO (≠ Congregación); quietos sostenidos ABREN (≠ Convoy); far/solo⇒NO",
     opens(diff.clump) && diff.clump.tier === 2 && !opens(diff.tick) && near(diff.tick.kinship, 0.5) && opens(diff.hold) && diff.hold.tier === 2 && !opens(diff.far) && !opens(diff.solo),
     Object.entries(diff).map(([k, v]) => `${k}:k${v.kinship}/T${v.tier}`).join(" "));

  // 10 — ★ DECAY determinista 0-RNG: juego vs oráculo QA vida-media 25s (base 8 T3 ⇒ +25s→4 T2 ⇒ +50s→2 T1 ⇒ +75s→1 T0)
  const decRes = [];
  for (const [el, xt] of [[0, 3], [25, 2], [50, 1], [75, 0]]) {
    const g = await page.evaluate((el) => { const z = window.__dev.kinship().zones[0]; window.__ksnap(z, 8); const s = window.__kat(z, el); return { kinship: s.kinship, tier: s.tier }; }, el);
    const expK = qaDecay(8, el * 1000), expT = qaTier(expK);
    const good = near(g.kinship, +expK.toFixed(4), 0.02) && g.tier === xt && g.tier === expT;
    decRes.push(`+${el}s:k${g.kinship.toFixed(2)}/T${g.tier}${good ? "" : `!=QA(${expK.toFixed(2)}/T${expT})`}`); if (!good) FAIL++;
  }
  ok("10 ★ DECAY 0-RNG LIVE: juego == oráculo QA vida-media 25s (8→+25s4→+50s2→+75s1)", decRes.every(r => !r.includes("!=")), decRes.join(" "));

  // 11 — PASSIVE compartido (canal goldFind): héroe EN zona con kinship≥umbral ⇒ goldFindMul==boost + tier; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const p = window.__kpick(4);                         // kinship 4 ⇒ T2 ⇒ 0.10
    const inz = window.__dev.kinship({ nowMs: window.__KNOW, toZone: p.zone });
    const out = window.__dev.kinship({ leave: true });
    return { inMul: inz.goldFindMul, inTier: inz.tier, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 passive compartido canal goldFind LIVE: en-zona kinship4 ⇒ goldFindMul 0.10/T2 (goldFactor 1.10); leave ⇒ 0/T0",
     near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inFactor, 1.10) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 — ★ CANAL FRESCO goldFind: BONO DE ORO en tryPickup — juego vs oráculo QA round(raw*(1+boost)); OFF ⇒ paid==raw
  const gold = await page.evaluate(() => {
    const p = window.__kpick(6);                         // kinship 6 ⇒ T3 ⇒ boost 0.15
    window.__ksnap(p.zone, 6); window.__dev.kinship({ nowMs: window.__KNOW, toZone: p.zone });
    const gpOn = window.__dev.kinship({ goldTick: 100 }).goldPicked;   // ON ⇒ paga round(100*1.15)
    window.__dev.kinship({ enabled: false });
    const gpOff = window.__dev.kinship({ goldTick: 100 }).goldPicked;  // OFF ⇒ raw exacto
    const offTag = window.__dev.kinship().tag;
    window.__dev.kinship({ enabled: true });
    return { onPaid: gpOn && gpOn.paid, onBoost: gpOn && gpOn.boost, offPaid: gpOff && gpOff.paid, offTag };
  });
  const goldOk = gold.onPaid === qaGold(100, 0.15) && near(gold.onBoost, 0.15) && gold.offPaid === 100 && gold.offTag === "";
  ok("12 ★ CANAL FRESCO goldFind LIVE: goldTick 100 con T3 ⇒ paga round(100·1.15)=115 (== oráculo QA); OFF ⇒ paid==raw (100) + tag ''",
     goldOk, `on=${gold.onPaid}(QA${qaGold(100, 0.15)}) boost=${gold.onBoost} off=${gold.offPaid} offTag="${gold.offTag}"`);

  // 13 — ★ ORTOGONALIDAD goldFind ⊥ restedMult ⊥ wardRegen (0 doble-conteo)
  const orth = await page.evaluate(() => {
    const p = window.__kpick(6);                         // vínculo T3 ⇒ goldFindMul 0.15
    const zone = p.zone;
    const a = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    const goldBefore = a.goldFindMul, restedBefore = a.restedXpMult, wardBefore = a.wardRegenMul;
    // activa CONVOY (canal restedMult) + WARD (canal wardRegen) en la MISMA zona ⇒ SUS canales suben pero goldFindMul NO cambia
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__KNOW });
    window.__dev.convoy({ nowMs: window.__KNOW, push: { [zone]: { march: 6, atMs: window.__KNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__KNOW });
    window.__dev.ward({ nowMs: window.__KNOW, push: { [zone]: { ward: 6, atMs: window.__KNOW } }, toZone: zone });
    const b = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    return { channel: a.channel, goldBefore, restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul };
  });
  const orthOk = orth.channel === "goldFind" && orth.goldBefore > 0 && near(orth.goldAfter, orth.goldBefore) &&
    orth.restedAfter > orth.restedBefore && orth.wardAfter > orth.wardBefore;   // CONVOY/WARD sí aportan en SUS canales
  ok("13 ★ ORTOGONALIDAD LIVE: abrir vínculo (goldFind 0.15) NO cambia restedXpMult/wardRegenMul; activar CONVOY/WARD NO cambia goldFindMul; canal='goldFind' ⇒ 3 canales ⊥",
     orthOk, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN LIVE: 11 flags del arco served true + KINSHIP_BOND served TRUE (disco LIVE); FELLOWSHIP_BOND (EVO#47) sigue LIVE e intacto
  ok("14 ★ 0-regresión LIVE: 11 flags del arco served enabled:true + KINSHIP_BOND served TRUE (12 flags true LIVE); FELLOWSHIP_BOND EVO#47 sigue true (canal xpGain ⊥, intacto)",
     arcTrue && kinServed === "true" && fellowServed === "true", JSON.stringify({ ...arc, KINSHIP_BOND: kinServed, FELLOWSHIP_BOND: fellowServed }));

  // 15 — ★ 6 zonas hospedan un vínculo observable (kinship≥6 ⇒ T3)
  const zonesRes = await page.evaluate(() => {
    const zones = window.__dev.kinship().zones; const broken = [];
    for (const z of zones) { window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
      const s = window.__dev.kinship({ nowMs: window.__KNOW, push: { [z]: { kinship: 6, atMs: window.__KNOW } }, toZone: z });
      if (!(s.zone === z && s.bondable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z); }
    return { n: zones.length, broken };
  });
  ok("15 ★ 6 zonas de caza hospedan vínculo LIVE (kinship6⇒T3, goldFind>0) broken=[]",
     zonesRes.n === 6 && zonesRes.broken.length === 0, `n=${zonesRes.n} broken=${JSON.stringify(zonesRes.broken)}`);

  const shot = join(OUT, round === 1 ? "selfverify.png" : `selfverify-r${round}.png`);
  await page.evaluate(() => { const p = window.__kpick(6); window.__ksnap(p.zone, 6); window.__dev.kinship({ nowMs: window.__KNOW, toZone: p.zone }); });
  await sleep(250);
  await page.screenshot({ path: shot });
  const fps = await page.evaluate(() => (window.__dev.fps ? window.__dev.fps() : null));
  console.log(`  build=${build} fps=${fps} shot=${shot}`);
  await page.close();
  return build;
}

// ─────────── 16 — ★ NORTH STAR: CONVERGENCIA 2-CLIENTE REAL LIVE (desync = sev-1) ───────────
async function northStar() {
  console.log(`\n===== 16 ★ NORTH STAR 2-cliente LIVE (desync = sev-1) =====`);
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
    await p.evaluate(() => window.__dev.kinship({ enabled: true }));
    return p;
  }
  const A = await mkPage("A");
  const B = await mkPage("B");
  const vm = async (p, zone, at) => p.evaluate((z, now) => { const s = window.__dev.kinship({ nowMs: now, toZone: z }); return { kinship: s.kinship, tier: s.tier, boost: s.goldFindMul, factor: s.goldFactor }; }, zone, at);
  const push = async (p, zone, kin, at) => p.evaluate((z, k, a) => window.__dev.kinship({ nowMs: a, push: { [z]: { kinship: k, atMs: a } } }), zone, kin, at);
  const clear = async (p) => p.evaluate((now) => window.__dev.kinship({ clear: true, nowMs: now }), NOW);

  const z = (await A.evaluate(() => window.__dev.kinship().zones[2]));   // ruins idx2 (North Star canónico del arco)
  let allEq = true, log = [];
  // (a) mismo kinship+reloj ⇒ VM byte-idéntico en A y B, a 3 niveles (T1 / T3 / decay+50s)
  for (const [k, el, lbl] of [[2, 0, "T1"], [6, 0, "T3"], [8, 50000, "decay+50s"]]) {
    await clear(A); await clear(B);
    await push(A, z, k, NOW); await push(B, z, k, NOW);
    const va = await vm(A, z, NOW + el);
    const vb = await vm(B, z, NOW + el);
    const eq = JSON.stringify(va) === JSON.stringify(vb);
    if (!eq) allEq = false; log.push(`${lbl}:${eq ? "==" : "DESYNC " + JSON.stringify(va) + "/" + JSON.stringify(vb)}`);
  }
  // (b) A SALE de la zona ⇒ Δ_A cae a 0 PERO el kinship server-authoritative + Δ_B quedan INTACTOS
  await clear(A); await clear(B);
  await push(A, z, 6, NOW); await push(B, z, 6, NOW);
  const bBefore = await vm(B, z, NOW);
  await A.evaluate(() => window.__dev.kinship({ leave: true }));
  const aAfter = await A.evaluate(() => window.__dev.kinship());
  const bAfter = await vm(B, z, NOW);
  const shared = aAfter.goldFindMul === 0 && aAfter.kinshipMap && near(aAfter.kinshipMap[z], 6) && JSON.stringify(bBefore) === JSON.stringify(bAfter);
  log.push(`A-leave:Δ_A=${aAfter.goldFindMul} sharedKin=${aAfter.kinshipMap && aAfter.kinshipMap[z]} Δ_B_intact=${JSON.stringify(bBefore) === JSON.stringify(bAfter)}`);
  ok("16 ★ NORTH STAR 2-cliente LIVE: mismo kinship+reloj ⇒ VM byte-idéntico (T1/T3/decay); A sale ⇒ Δ_A=0 + kinship compartido + Δ_B intacto (0 desync)",
     allEq && shared, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("17 determinismo ×2: mismo build servido en ambas rondas", b1 === b2 && b1 === EXPECT_BUILD, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors durante toda la corrida", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n=====  CAS-2368 QA POST-FLIP LIVE: ${PASS} PASS / ${FAIL} FAIL  =====`);
process.exit(FAIL === 0 ? 0 : 1);
