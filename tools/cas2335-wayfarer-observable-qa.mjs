// CAS-2335 — QA OBSERVABLE for SENDERO TRILLADO / WELL-TRODDEN PATH (DARK, WAYFARER_TRAIL.enabled:false). EVO mecánica #52.
// INDEPENDENT QA harness (not the GE self-verify). PILAR FRESCO: eje NUEVO de traversal/logística EMERGENTE. El mundo COMPARTIDO se DESGASTA con el paso
// AGREGADO de MUCHOS jugadores A LO LARGO DEL TIEMPO. El server acumula "pisadas" por CELDA coarse (bucket cellSize px, NO per-pixel); el tread DECAE
// determinista por vida-media (0 RNG); una celda cuyo tread ≥ threshold es un Sendero Trillado que da un pasivo restedMult a quien la transita. Artefacto
// EMERGENTE del tránsito agregado — ningún jugador solo lo abre (su pisada decae antes de cruzar el umbral).
//
// ★ North Star (check 11) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO snapshot de tread server-authoritative
// { celda → { tread, atMs } } + MISMO nowMs ⇒ ven el MISMO sendero + el MISMO pasivo IDÉNTICOS byte-a-byte (0 desync). El DECAY converge. El passive es
// COMPARTIDO (nace de la CELDA, no del jugador): A SALE físicamente de la celda ⇒ su Δ cae a 0 PERO el tread server-authoritative de la celda + el Δ de B
// (que sigue sobre ella) quedan INTACTOS. Cualquier desync de sendero/pasivo = sev-1.
//
// ★★ DIFERENCIADOR QA (check 6b) = COBERTURA de las 6 ZONAS de WAYFARER_TRAIL.zones: cada zona debe poder hospedar un Sendero Trillado observable (toZone
// aterriza DENTRO de una celda válida + push tread ≥ umbral ⇒ trodden + boost 0.06). Re-test de la clase de footgun soulPos CAS-2326 (donde pulseSpot/zoneOf
// dejaba 3/6 zonas irrecuperables). El gate del passive es la CELDA (no la zona), pero el helper de prueba usa toZone(pulseSpot) ⇒ verifico que TODAS aterrizan.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): WAYFARER es la MÁS BAJA del canal restedMult ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL > PULSE >
// CONGREGATION. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE ⇒ para medir el Sendero AISLADO hay que
// flippar esos peers OFF in-memory (footgun heredado CAS-2326/2329/2332) ⇒ __iso().
//
// Observado vía __dev.wayfarer (flip enabled IN-MEMORY + inyección del snapshot { celda → { tread, atMs } } + nowMs para el decay + tread/toZone/leave)
// + __dev.standings/mentor/soul/pulse/congregation/territory/oath/saveBlob/worldFingerprint.
// Run: node tools/cas2335-wayfarer-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2335-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
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

// __iso(): flip OFF peers DEFAULT-ON del canal restedMult (STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION) para medir el Sendero en AISLAMIENTO.
// __wput(zone, tread, nowMs): arranca la feature, fija reloj (decay), aísla, teleporta a `zone`, empuja `tread` en la CELDA ACTUAL del héroe con atMs=nowMs,
//   y devuelve el estado observado (celda + tread decaído + trodden + mul). Null si toZone no aterriza (spot ausente).
async function install(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); };
    window.__wput = (zone, tread, nowMs) => {
      window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs }); window.__iso();
      window.__dev.wayfarer({ toZone: zone });
      const before = window.__dev.wayfarer();               // ¿aterrizó el héroe en una celda? (cell no-null)
      if (!before || before.cell == null) return null;
      window.__dev.wayfarer({ tread, atMs: nowMs });        // empuja en la celda actual del héroe
      return window.__dev.wayfarer({ nowMs });
    };
  });
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
  await install(page);

  // 1 boots + hooks + build
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarer && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.wayfarer + arc hooks + __BUILD, 0 JS err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false AND G.wayfarer NUNCA se crea (gExists false) — read BEFORE any inject
  const off = await page.evaluate(() => window.__dev.wayfarer());
  ok("2 byte-id OFF fresh boot: enabled=false AND gExists=false AND tread/boost 0 AND tag \"\" AND cells null (0 estado nuevo)",
     off.enabled === false && off.gExists === false && off.trodden === false && off.tread === 0 && off.boost === 0 && off.tag === "" && off.cells === null,
     `enabled=${off.enabled} gExists=${off.gExists} trodden=${off.trodden} tread=${off.tread} boost=${off.boost} tag="${off.tag}" cells=${JSON.stringify(off.cells)}`);

  // 3 byte-id save OFF: no 'wayfarer'/'wayfarerServer'/'wayfarerNow' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: saveBlob SIN clave wayfarer/wayfarerServer/wayfarerNow (estado 100% derivado/transitorio)", !/"wayfarer(Server|Now)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle (0 RNG drift)
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => { window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 5e6 }); window.__dev.wayfarer({ push: { "3,3": { tread: 200, atMs: 5e6 } } }); });
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.wayfarer({ enabled: false, clear: true }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled+inject (0 RNG drift)", fpA === fpB, `stable=${fpA === fpB}`);

  // 5 DECAY DETERMINISTA (vida-media, sin RNG): tread=200 en atMs=T ⇒ en T/T+hl/T+2hl decae 200→100→50 (monótono) ⇒ trodden true→true→false (umbral 100)
  const decay = await page.evaluate(() => {
    const T = 5000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs: T });
    const z = window.__dev.wayfarer().zones[0]; window.__dev.wayfarer({ toZone: z });
    window.__dev.wayfarer({ tread: 200, atMs: T });
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const s0 = window.__dev.wayfarer({ nowMs: T });
    const s1 = window.__dev.wayfarer({ nowMs: T + hlMs });
    const s2 = window.__dev.wayfarer({ nowMs: T + 2 * hlMs });
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { hlMs, s0: { t: s0.tread, tr: s0.trodden }, s1: { t: s1.tread, tr: s1.trodden }, s2: { t: s2.tread, tr: s2.trodden } };
  });
  const decayOk = near(decay.s0.t, 200, 0.01) && decay.s0.tr === true &&
                  near(decay.s1.t, 100, 0.01) && decay.s1.tr === true &&
                  near(decay.s2.t, 50, 0.01) && decay.s2.tr === false;
  ok("5 DECAY DETERMINISTA (vida-media, 0 RNG): tread 200→100→50 en T/T+hl/T+2hl ⇒ trodden true→true→false (cruza umbral 100)", decayOk, JSON.stringify(decay));

  // 6 server-authoritative reflect + validation: push snapshot ⇒ refleja la celda válida; celda con tread ≤0 DESCARTADA (cliente sólo refleja, 0 confianza)
  const reflect = await page.evaluate(() => {
    const T = 6000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs: T });
    window.__dev.wayfarer({ push: { "3,3": { tread: 150, atMs: T }, "9,9": { tread: 0, atMs: T }, "1,1": { tread: -5, atMs: T } } });
    const s = window.__dev.wayfarer();
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { keys: Object.keys(s.cells || {}), cells: s.cells };
  });
  const reflOk = reflect.keys.length === 1 && reflect.keys[0] === "3,3" && !("9,9" in (reflect.cells || {})) && !("1,1" in (reflect.cells || {}));
  ok("6 server-authoritative reflect+validate: celda válida refleja; tread ≤0 DESCARTADA (cliente sólo refleja)", reflOk, JSON.stringify(reflect));

  // 6b ★ COBERTURA 6 ZONAS: cada zona de WAYFARER_TRAIL.zones puede hospedar un Sendero Trillado observable (toZone aterriza + tread 150 ⇒ trodden + boost 0.06)
  const zoneCov = await page.evaluate(() => {
    const T = 6100 * 1000; const zones = window.__dev.wayfarer().zones; const broken = [], live = [];
    for (const z of zones) {
      const s = window.__wput(z, 150, T);
      if (s && s.cell != null && s.trodden === true && Math.abs(s.wayfarerMulRested - 0.06) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6b ★ COBERTURA 6 zonas: TODAS pueden hospedar un Sendero Trillado observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 UMBRAL + "un jugador solo no abre rápido": tread 50 ⇒ NO trillada; 100/150 ⇒ trillada; una pisada pequeña (110) decae bajo el umbral en 1 vida-media
  const thr = await page.evaluate(() => {
    const T = 7000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    const z = window.__dev.wayfarer().zones[0]; const out = {};
    for (const n of [50, 100, 150]) { const s = window.__wput(z, n, T); out[n] = s.trodden; }
    window.__wput(z, 110, T);                                     // apenas sobre el umbral
    const fresh = window.__dev.wayfarer({ nowMs: T }).trodden;    // true
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const faded = window.__dev.wayfarer({ nowMs: T + hlMs }).trodden;   // 110→55 < 100 ⇒ false
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { out, fresh, faded };
  });
  const thrOk = thr.out[50] === false && thr.out[100] === true && thr.out[150] === true && thr.fresh === true && thr.faded === false;
  ok("7 UMBRAL + decay: tread 50 ⇒ NO trillada, 100/150 ⇒ trillada; pisada pequeña (110) decae bajo umbral en 1 vida-media (concurrencia agregada requerida)", thrOk, JSON.stringify(thr));

  // 8 PASSIVE aislado: héroe SOBRE celda trillada ⇒ wayfarerMulRested==boost (0.06) + trodden + tag ⌇; leave ⇒ 0 + no trodden
  const iso = await page.evaluate(() => {
    const T = 8000 * 1000; const s = window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const inZone = { mul: s.wayfarerMulRested, trodden: s.trodden, boost: s.boost, tag: s.tag, rested: s.restedXpMult };
    const g = window.__dev.wayfarer({ leave: true });
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { inZone, leftMul: g.wayfarerMulRested, leftTrodden: g.trodden };
  });
  ok("8 PASSIVE aislado: en celda trillada ⇒ mul 0.06 + trodden + tag ⌇ + rested>0.06; leave ⇒ mul 0 + no trodden",
     near(iso.inZone.mul, 0.06) && iso.inZone.trodden === true && near(iso.inZone.boost, 0.06) && iso.inZone.tag === "⌇" && iso.inZone.rested > 0.06 && iso.leftMul === 0 && iso.leftTrodden === false, JSON.stringify(iso));

  // 9 seam gainXP wired + byte-id pasivo OFF: served sim aplica wayfarerMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag ""
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /wayfarerMul\(h,\s*"restedMult"\)/.test(simSrc);
  const seamOff = await page.evaluate(() => {
    const T = 9000 * 1000; const on = window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const onMul = on.wayfarerMulRested;
    window.__dev.wayfarer({ enabled: false });
    const s = window.__dev.wayfarer({ nowMs: T });
    window.__dev.wayfarer({ clear: true, leave: true });
    return { onMul, enabled: s.enabled, mul: s.wayfarerMulRested, tag: s.tag };
  });
  ok("9 seam gainXP servido (wayfarerMul en gainXP) + byte-id pasivo OFF: ON aislado ⇒ mul 0.06; enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && near(seamOff.onMul, 0.06) && seamOff.enabled === false && seamOff.mul === 0 && seamOff.tag === "", `wired=${seamWired} ${JSON.stringify(seamOff)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: WAYFARER cede a STANDINGS + SOUL + CONGREGATION (peer DRIVEN a mul>0 ⇒ WAYFARER 0); coexiste con TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    const T = 10000 * 1000; window.__dev.territory({ enabled: false });
    const w = window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const base = window.__dev.wayfarer({ nowMs: T }).wayfarerMulRested;     // 0.06 aislado
    // (a) STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ WAYFARER cede
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const s1 = window.__dev.wayfarer({ nowMs: T }); const standPeer = s1.standingsMulRested, standCeded = s1.wayfarerMulRested;
    window.__dev.standings({ enabled: false });
    // (b) SOUL: morir ⇒ buff recuperación caído ⇒ soulMul>0 ⇒ WAYFARER cede (soul.die respawnea ⇒ re-wput después)
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: 1234 * 300000 }); window.__dev.soul({ die: true });
    const s2 = window.__dev.wayfarer({ nowMs: T }); const soulPeer = s2.soulMulRested, soulCeded = s2.wayfarerMulRested;
    window.__dev.soul({ enabled: false });
    // (c) CONGREGATION: headcount ≥ umbral en la zona del héroe ⇒ congMul>0 ⇒ WAYFARER cede
    window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const heroZone = window.__dev.wayfarer().hero ? window.__dev.wayfarer().hero.zone : null;
    let congPeer = 0, congCeded = base;
    if (heroZone) { window.__dev.congregation({ enabled: true }); const cc = {}; cc[heroZone] = 8; window.__dev.congregation({ counts: cc });
      const s3 = window.__dev.wayfarer({ nowMs: T }); congPeer = s3.congMulRested; congCeded = s3.wayfarerMulRested; window.__dev.congregation({ enabled: false }); }
    // (d) TERRITORY (⊥ safeRegen): NO afecta wayfarerMul ⇒ intacto
    window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.wayfarer({ nowMs: T }).wayfarerMulRested;
    window.__dev.territory({ enabled: false }); window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, congPeer, congCeded, terrCoexist, heroZone };
  });
  ok("10 precedencia MÁXIMO ÚNICO: WAYFARER(0.06) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND CONGREGATION⇒0; COEXISTE con TERRITORY(⊥) ⇒ 0.06 intacto",
     near(prec.base, 0.06) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 && near(prec.terrCoexist, 0.06), JSON.stringify(prec));

  // 11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL
  const pageB = await browser.newPage();
  pageB.on("pageerror", (e) => errors.push("B:" + String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await install(pageB);

  const T = 11000 * 1000;
  // ambos: misma zona ⇒ misma celda determinista; mismo snapshot {celda:{tread,atMs}} + mismo nowMs ⇒ deben converger byte-a-byte
  const applyBoth = async (tread) => {
    const a = await page.evaluate((t, tr) => { const s = window.__wput(window.__dev.wayfarer().zones[0], tr, t); return { cell: s.cell, tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T, tread);
    const b = await pageB.evaluate((t, tr) => { const s = window.__wput(window.__dev.wayfarer().zones[0], tr, t); return { cell: s.cell, tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T, tread);
    return { a, b };
  };
  // 11a baseline: mismo snapshot 150 ⇒ A==B (misma celda/tread/trodden/mul 0.06)
  const c1 = await applyBoth(150);
  const conv1 = JSON.stringify(c1.a) === JSON.stringify(c1.b) && c1.a.cell === c1.b.cell && c1.a.trodden === true && near(c1.a.mul, 0.06) && near(c1.a.tread, 150);
  ok("11a NORTH STAR convergencia: mismo snapshot (celda,tread 150,nowMs) ⇒ A==B byte-a-byte (misma celda / trodden / 0.06)", conv1, `A=${JSON.stringify(c1.a)} B=${JSON.stringify(c1.b)}`);

  // 11b DECAY converge: avanzar AMBOS relojes una vida-media ⇒ tread 75 (<100) ⇒ ambos NO trodden, mul 0
  const hlMs = (await page.evaluate(() => window.__dev.wayfarer().halfLifeSec | 0)) * 1000;
  const aDec = await page.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
  const bDec = await pageB.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
  const convDec = JSON.stringify(aDec) === JSON.stringify(bDec) && near(aDec.tread, 75, 0.01) && aDec.trodden === false && aDec.mul === 0;
  ok("11b NORTH STAR decay converge: +1 vida-media ⇒ ambos tread 75 (<100) ⇒ trodden false + mul 0 (idénticos)", convDec, `A=${JSON.stringify(aDec)} B=${JSON.stringify(bDec)}`);

  // 11c A SALE de la celda ⇒ Δ_A=0 PERO tread compartido de la celda + Δ_B INTACTOS (passive compartido, no per-hero). Re-push fresh en ambos a T.
  await applyBoth(150);
  const cell = c1.a.cell;
  const aLeave = await page.evaluate(() => { const s = window.__dev.wayfarer({ leave: true }); return { mul: s.wayfarerMulRested, trodden: s.trodden, cells: s.cells }; });
  const bStill = await pageB.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { mul: s.wayfarerMulRested, trodden: s.trodden, tread: s.tread }; }, T);
  const cellStillTrodden = !!(aLeave.cells && aLeave.cells[cell] >= 100);
  const noDesync = aLeave.mul === 0 && aLeave.trodden === false && cellStillTrodden && near(bStill.mul, 0.06) && bStill.trodden === true && near(bStill.tread, 150);
  ok("11c NORTH STAR A sale celda: Δ_A=0 + no trodden PERO tread compartido de la celda intacto + Δ_B INTACTO (0.06/trodden/150) — 0 desync", noDesync, `A=${JSON.stringify(aLeave.mul)},${aLeave.trodden} cellTread=${aLeave.cells ? aLeave.cells[cell] : null} B=${JSON.stringify(bStill)}`);

  await page.bringToFront();
  await sleep(250);
  // 12 render badge ON vs OFF (Δ px en la región del badge top-right bajo el minimapa, badgeRowAnchor) + noise-floor + arco regr + fps
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  // OFF control: enabled false ⇒ renderWayfarerBadge NUNCA corre (gate render.js:364)
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.wayfarer({ leave: true }); window.__dev.wayfarer({ enabled: false, clear: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);
  const noise = Math.abs(offSum - offSum2);
  // ON: enabled + héroe sobre celda trillada ⇒ badge ⌇ "Sendero Trillado"
  await page.evaluate(() => { const T = 12000 * 1000; window.__wput(window.__dev.wayfarer().zones[0], 180, T); window.__dev.wayfarer({ nowMs: T }); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  ok("12a render badge 'Sendero Trillado' DIBUJA en región top-right (Δ>noise) vs OFF-control", delta > 0 && delta > noise, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // arco regr: todos los flags previos re-activables LIVE (enabled true en DISCO) — 0 regr
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.congregation({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled, cong: window.__dev.congregation().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor/congregation) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(r => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); } requestAnimationFrame(f); }); return n; });
  ok("12c fps estable ≥55", fps >= 55, `fps=${fps}`);

  console.log(`\n=== CAS-2335 QA OBSERVABLE: ${PASS} PASS / ${FAIL} FAIL / ${errors.length} JS-err ===`);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8).join("\n"));
  console.log("build=" + build);
} finally {
  await browser.close();
  await server.close();
}
process.exit(FAIL === 0 && errors.length === 0 ? 0 : 1);
