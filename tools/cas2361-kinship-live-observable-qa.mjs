// CAS-2361 — QA INDEPENDIENTE (2-cliente) para CAMARADERÍA / KINSHIP BOND (DARK, KINSHIP_BOND.enabled:false). EVO mecánica #60.
// Harness ESCRITO POR QA (b5c10283), independiente del self-verify del GE (tools/cas2361-kinship-selfverify.mjs):
//   · Oráculos re-derivados en Node (pares por celda coarse, tiers, decay vida-media, bono de oro) — NO se reusa ninguna función del juego como fuente de verdad.
//   · Sets de POSICIONES propios de QA con celdas TRASLADADAS (base lejos del origen) ⇒ prueba que el cómputo de pares NO depende de coords absolutas (invariante a traslación).
//   · Reloj de pared propio de QA (≠ 9_600_000 del GE).
//   · North Star = CONVERGENCIA 2-CLIENTE REAL con 2 páginas puppeteer independientes (desync = sev-1).
//
// DOS pivotes FRESCOS bajo prueba:
//   (A) CANAL FRESCO `goldFind` (bono de ORO al recoger monedas) — ORTOGONAL (⊥) a restedMult (XP, seam gainXP) y a wardRegen (HP, #59). Enganchado al chokepoint ÚNICO tryPickup (d.kind==="gold").
//   (B) EJE FRESCO = PERSISTENCIA DE VÍNCULO (proximidad pareada SOSTENIDA) — cuenta PARES (i<j) de jugadores en celda coarse 128 Chebyshev≤1, acumulados SOSTENIDAMENTE.
//
// Diferenciadores probados: AMONTONADOS ⇒ pares=C(N,2) ⇒ ABREN (OPUESTO a Warding #59); par 1-tick ⇒ NO abre (≠ Congregación, requiere permanencia); QUIETOS cuentan (≠ Convoy velocidad); 1 solo / 2 lejos ⇒ NO abre.
// Ortogonalidad (check no-negociable): abrir un vínculo (goldFind) NO cambia restedXpMult NI wardRegenMul; activar CONVOY (restedMult) / WARD (wardRegen) NO cambia goldFindMul ⇒ 3 canales ⊥ ⇒ 0 doble-conteo.
// Run: node tools/cas2361-kinship-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2361-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

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
// goto + toPlay con UN reintento (reload) si el boot se atasca bajo carga acumulada del navegador.
async function boot(page) {
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
async function runOnce(round) {
  console.log(`\n===== CAS-2361 QA independiente — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });   // save aislado por página ⇒ boot siempre en 'menu'
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[r${round}] ${m.text()}`); });
  await boot(page);
  await installKin(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 — boot + hooks (kinship + otros 2 canales del arco para probar ortogonalidad + save/fingerprint)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boot to play, __dev.kinship + convoy + ward + saveBlob + worldFingerprint, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 — DARK byte-id: fresh boot enabled:false + G.kinship nunca creado
  const dark = await page.evaluate(() => window.__dev.kinship());
  ok("2 DARK OFF fresh: enabled false + gExists false (G.kinship nunca creado) + tier/kinship/boost 0 + tag '' + map null",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.kinship === 0 && dark.boost === 0 && dark.tag === "" && dark.kinshipMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} tag="${dark.tag}" map=${JSON.stringify(dark.kinshipMap)}`);

  // 3 — save byte-id OFF: sin clave kinship/kinshipServer
  const saveClean = await page.evaluate(() => { const b = window.__dev.saveBlob ? window.__dev.saveBlob() : ""; const s = typeof b === "string" ? b : JSON.stringify(b); return !/"kinship(Server)?"/.test(s); });
  ok("3 save byte-id OFF: saveBlob() SIN clave 'kinship'/'kinshipServer' (0 persistencia nueva)", saveClean);

  // 4 — worldFingerprint estable a través del toggle enabled
  const fpStable = await page.evaluate(() => {
    const fp0 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ enabled: false });
    return fp0 === JSON.stringify(window.__dev.worldFingerprint(321));
  });
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpStable);

  // Enciende IN-MEMORY para el resto (disco sigue false)
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
  ok("5 ★ PARES puros: juego == oráculo QA en 6 sets (celdas trasladadas lejos del origen ⇒ invariante a traslación): same1/adj1/far0/solo0/clump5=10/two=6",
     pairRes.every(r => !r.includes("!=")), pairRes.join(" "));

  // 6 — TABLA de tiers = función pura del kinship (juego vs oráculo QA)
  const tierRes = [];
  for (const kv of [0, 1, 2, 3, 4, 5, 6, 9]) {
    const g = await page.evaluate((kv) => { const s = window.__kpick(kv); return s ? { tier: s.tier, boost: s.boost } : { tier: 0, boost: 0 }; }, kv);
    const okT = g.tier === qaTier(kv) && near(g.boost, qaBoost(kv));
    tierRes.push(`k${kv}:T${g.tier}${okT ? "" : "X"}`); if (!okT) FAIL++;
  }
  ok("6 tiers puros del kinship: juego == oráculo QA (1→T0,2→T1,4→T2,6→T3; boost 0/0.05/0.10/0.15)", tierRes.every(r => !r.includes("X")), tierRes.join(" "));

  // 7 — server-authoritative: zona fuera de `zones` descartada; kinship negativo clamped
  const authz = await page.evaluate(() => {
    window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
    window.__dev.kinship({ nowMs: window.__KNOW, push: { town: { kinship: 6, atMs: window.__KNOW }, forest: { kinship: -5, atMs: window.__KNOW } } });
    const m = window.__dev.kinship().kinshipMap || {};
    return { townDropped: !("town" in m), forestClamped: !("forest" in m) || (m.forest || 0) <= 0 };
  });
  ok("7 server-authoritative reflect: zona no-caza 'town' descartada + kinship negativo clamped/descartado",
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
  ok("8 ★ acumulador de POSICIONES: par próximo dt3⇒kinship3 / dt6⇒kinship6 (accruePerSec·dt); far⇒0; solo⇒0",
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
  ok("9 ★ diferenciadores: clump5 ABRE (T2, opuesto a Warding); par 1-tick⇒NO (≠ Congregación); quietos sostenidos ABREN (≠ Convoy); far/solo⇒NO",
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
  ok("10 ★ DECAY 0-RNG: juego == oráculo QA vida-media 25s (8→+25s4→+50s2→+75s1)", decRes.every(r => !r.includes("!=")), decRes.join(" "));

  // 11 — PASSIVE compartido (canal goldFind): héroe EN zona con kinship≥umbral ⇒ goldFindMul==boost + tier; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const p = window.__kpick(4);                         // kinship 4 ⇒ T2 ⇒ 0.10
    const inz = window.__dev.kinship({ nowMs: window.__KNOW, toZone: p.zone });
    const out = window.__dev.kinship({ leave: true });
    return { inMul: inz.goldFindMul, inTier: inz.tier, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 passive compartido canal goldFind: en-zona kinship4 ⇒ goldFindMul 0.10/T2 (goldFactor 1.10); leave ⇒ 0/T0",
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
  ok("12 ★ CANAL FRESCO goldFind: goldTick 100 con T3 ⇒ paga round(100·1.15)=115 (== oráculo QA); OFF ⇒ paid==raw (100) + tag ''",
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
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    return { channel: a.channel, goldBefore, restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul };
  });
  const orthOk = orth.channel === "goldFind" && orth.goldBefore > 0 && near(orth.goldAfter, orth.goldBefore) &&
    orth.restedAfter > orth.restedBefore && orth.wardAfter > orth.wardBefore;   // CONVOY/WARD sí aportan en SUS canales
  ok("13 ★ ORTOGONALIDAD: abrir vínculo (goldFind 0.15) NO cambia restedXpMult/wardRegenMul; activar CONVOY/WARD NO cambia goldFindMul; canal='goldFind' ⇒ 3 canales ⊥",
     orthOk, JSON.stringify(orth));

  // 14 — ★ 0-REGRESIÓN: 10 flags del arco served true; WARDING_RING + KINSHIP_BOND served false (DARK en disco)
  const regr = await page.evaluate(async () => {
    const r = await fetch("sim/config.js").then(x => x.text());
    const flags = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
    const served = {}; for (const f of flags) { const m = r.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); served[f] = m ? m[1] : "?"; }
    return served;
  });
  const arcTrue = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"].every(f => regr[f] === "true");
  ok("14 ★ 0-regresión: 10 flags del arco served enabled:true + WARDING_RING + KINSHIP_BOND served false (DARK en disco)",
     arcTrue && regr.WARDING_RING === "false" && regr.KINSHIP_BOND === "false", JSON.stringify(regr));

  // 15 — ★ 6 zonas hospedan un vínculo observable (kinship≥6 ⇒ T3)
  const zonesRes = await page.evaluate(() => {
    const zones = window.__dev.kinship().zones; const broken = [];
    for (const z of zones) { window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
      const s = window.__dev.kinship({ nowMs: window.__KNOW, push: { [z]: { kinship: 6, atMs: window.__KNOW } }, toZone: z });
      if (!(s.zone === z && s.bondable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z); }
    return { n: zones.length, broken };
  });
  ok("15 ★ 6 zonas de caza hospedan vínculo (kinship6⇒T3, goldFind>0) broken=[]",
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

// ─────────── 16 — ★ NORTH STAR: CONVERGENCIA 2-CLIENTE REAL (desync = sev-1) ───────────
async function northStar() {
  console.log(`\n===== 16 ★ NORTH STAR 2-cliente (desync = sev-1) =====`);
  const nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ crear/bootear una página en 2º plano nunca llega al 'menu'.
  // Se crea, se trae al frente y se bootea CADA página en secuencia; la inyección __dev es síncrona + nowMs explícito ⇒ el estado de A persiste cuando B pasa al frente.
  async function mkPage(n) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[NS${n}] ${e}`));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[NS${n}] ${m.text()}`); });
    await p.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
    await p.bringToFront();
    await boot(p); await installKin(p);
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
  ok("16 ★ NORTH STAR 2-cliente: mismo kinship+reloj ⇒ VM byte-idéntico (T1/T3/decay); A sale ⇒ Δ_A=0 + kinship compartido + Δ_B intacto (0 desync)",
     allEq && shared, log.join("  "));
  await A.close(); await B.close(); await nsBrowser.close();
}

try {
  const b1 = await runOnce(1);
  const b2 = await runOnce(2);
  ok("17 determinismo ×2: mismo build servido en ambas rondas", b1 === b2, `${b1} / ${b2}`);
  await northStar();
  ok("0 no JS errors durante toda la corrida", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n=====  CAS-2361 QA independiente: ${PASS} PASS / ${FAIL} FAIL  =====`);
process.exit(FAIL === 0 ? 0 : 1);
