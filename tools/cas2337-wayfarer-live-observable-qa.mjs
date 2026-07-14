// CAS-2337 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — SENDERO TRILLADO / WELL-TRODDEN PATH (WAYFARER_TRAIL.enabled:true LIVE). EVO mecánica #52.
// Gemelo LIVE de la DARK observable `tools/cas2335-wayfarer-observable-qa.mjs` (17/17 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages tras el
// flip CTO CAS-2336 (WAYFARER_TRAIL.enabled false→true, commit 6db4926+ae4b63f). Pre-check: version.json servido debe AVANZAR de la base pre-flip
// `3963b5470441` (Congregación LIVE) y el config servido debe mostrar WAYFARER_TRAIL.enabled:true (si aún DARK ⇒ FAIL check 1, NO self-heal destructivo —
// sólo señala; el HB re-checkout si el flip no había propagado a gh-pages).
//
// EVO#52 = PILAR FRESCO: eje NUEVO de traversal/logística EMERGENTE. El mundo COMPARTIDO se DESGASTA con el paso AGREGADO de MUCHOS jugadores A LO LARGO
// DEL TIEMPO: el server acumula "pisadas" por CELDA coarse (bucket cellSize px, NO per-pixel) y las EMPUJA { celda → { tread, atMs } }; el tread DECAE
// determinista por vida-media (0 RNG); una celda cuyo tread ≥ threshold es un Sendero Trillado que da un pasivo restedMult a quien la transita. Artefacto
// EMERGENTE del tránsito agregado — ningún jugador solo lo abre (su pisada decae antes de cruzar el umbral).
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO snapshot de tread
// server-authoritative { celda → { tread, atMs } } + MISMO nowMs ⇒ ven el MISMO sendero + el MISMO pasivo IDÉNTICOS byte-a-byte (0 desync). El DECAY
// converge. El passive es COMPARTIDO (nace de la CELDA, no del jugador): A SALE físicamente de la celda ⇒ su Δ cae a 0 PERO el tread server-authoritative
// de la celda + el Δ de B (que sigue sobre ella) quedan INTACTOS. Cualquier desync de sendero/pasivo/tread = sev-1.
//
// ★ DIFERENCIADOR QA (check 6b) = COBERTURA de las 6 ZONAS de WAYFARER_TRAIL.zones (re-test CLASE de footgun soulPos CAS-2326): cada zona hospeda un
// Sendero Trillado observable (toZone aterriza DENTRO de una celda válida + push tread ≥ umbral ⇒ trodden + boost 0.06) contra el sim SERVIDO. broken=[] obligatorio.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): WAYFARER es la MÁS BAJA del canal restedMult ⇒ CEDE (return 0) a STANDINGS > MENTOR > SOUL > PULSE >
// CONGREGATION. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE ⇒ para medir el Sendero AISLADO hay que
// flippar esos peers OFF in-memory antes de medir (footgun heredado CAS-2326/2329/2332/2334) ⇒ __iso().
//
// Patrón DEFAULT-ON (mirror congregation-live CAS-2334 / pulse-live CAS-2331): el flip ya cargó ⇒ wayfarer().enabled===true en boot fresco SIN __dev flip.
// byte-id OFF se re-verifica INDEP vía TOGGLE enabled:false (Sendero es byte-id OFF por CONSTRUCCIÓN: 0 estado nuevo, 0 clave serializada ⇒ save nunca
// contiene 'wayfarer'/'wayfarerServer'/'wayfarerNow' aun con enabled ON).
//
// LIVE wiring (mirror CAS-2334): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded) y != base pre-flip; favicon-404 filtrado.
// Run: node tools/cas2337-wayfarer-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2337-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "3963b5470441";          // build servido ANTES del flip CAS-2336 (Congregación LIVE) — el LIVE debe AVANZAR de este
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 25000 });
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
      const before = window.__dev.wayfarer();
      if (!before || before.cell == null) return null;
      window.__dev.wayfarer({ tread, atMs: nowMs });
      return window.__dev.wayfarer({ nowMs });
    };
  });
}

async function freshPage(browser, errors, net404, tag) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${tag}:` + String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`${tag}:` + m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page); await install(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404, "p1");
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + build AVANZÓ de pre-flip + served WAYFARER_TRAIL.enabled:true + arco 0-regr + DARK trío false
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarer && window.__dev.congregation && window.__dev.pulse && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { WAYFARER: en("WAYFARER_TRAIL"), CONGREGATION: en("CONGREGATION"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const arcTrue = ["CONGREGATION","PULSE","SOUL","MENTOR","FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.wayfarer + arc hooks; served WAYFARER_TRAIL.enabled:true + arco entero true (0 regr) + DARK trío false; 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && cfg.WAYFARER === "true" && arcTrue && darksFalse && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} WAYFARER=${cfg.WAYFARER} arcTrue=${arcTrue} darksFalse=${darksFalse} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ wayfarer().enabled===true (el flip cargó del config servido) + boost 0 sin estar sobre celda trillada
  const dOn = await page.evaluate(() => { const s = window.__dev.wayfarer(); return { enabled: s.enabled, boost: s.wayfarerMulRested, trodden: s.trodden }; });
  ok("2 DEFAULT-ON desde config servido: wayfarer().enabled===true (flip cargó) AND wayfarerMulRested 0 + no trodden (passive NO activo sin sendero)",
     dOn.enabled === true && dOn.boost === 0 && dOn.trodden === false, JSON.stringify(dOn));

  // 3 byte-id OFF via TOGGLE (LIVE re-verify INDEP): enabled:false ⇒ wayfarerMulRested 0 + tag "" + 0 celdas activas (null o {} — DEFAULT-ON servido ya instanció
  //   G.wayfarer en boot ⇒ el mapa de tread queda VACÍO, no null; el byte-id REAL es save-SIN-clave + fingerprint byte-estable) + save SIN clave wayfarer/wayfarerServer/wayfarerNow; restaura ON.
  const byteId = await page.evaluate(() => {
    window.__dev.wayfarer({ enabled: false, clear: true, leave: true });
    const s = window.__dev.wayfarer();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.wayfarer({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.wayfarer({ enabled: true });                                        // restaura ON (DEFAULT-ON servido)
    const noActiveCells = s.cells === null || Object.keys(s.cells).length === 0;
    return { enabled: s.enabled, mul: s.wayfarerMulRested, tag: s.tag, cells: s.cells, noActiveCells, saveNoKey: !/"wayfarer(Server|Now)?"/.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("3 byte-id OFF (toggle LIVE): enabled false ⇒ wayfarerMulRested 0 + tag \"\" + 0 celdas activas (null|{}) + save SIN clave wayfarer/wayfarerServer/wayfarerNow + fingerprint byte-estable (0 estado/clave serializada)",
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.noActiveCells && byteId.saveNoKey && byteId.fpMatch, JSON.stringify(byteId));

  // 4 DECAY DETERMINISTA (vida-media, sin RNG) SERVIDO: tread=200 en atMs=T ⇒ en T/T+hl/T+2hl decae 200→100→50 (monótono) ⇒ trodden true→true→false (umbral 100)
  const decay = await page.evaluate(() => {
    const T = 5000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs: T });
    const z = window.__dev.wayfarer().zones[0]; window.__dev.wayfarer({ toZone: z });
    window.__dev.wayfarer({ tread: 200, atMs: T });
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const s0 = window.__dev.wayfarer({ nowMs: T });
    const s1 = window.__dev.wayfarer({ nowMs: T + hlMs });
    const s2 = window.__dev.wayfarer({ nowMs: T + 2 * hlMs });
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { hlMs, s0: { t: s0.tread, tr: s0.trodden }, s1: { t: s1.tread, tr: s1.trodden }, s2: { t: s2.tread, tr: s2.trodden } };
  });
  const decayOk = near(decay.s0.t, 200, 0.01) && decay.s0.tr === true &&
                  near(decay.s1.t, 100, 0.01) && decay.s1.tr === true &&
                  near(decay.s2.t, 50, 0.01) && decay.s2.tr === false;
  ok("4 DECAY DETERMINISTA SERVIDO (vida-media, 0 RNG): tread 200→100→50 en T/T+hl/T+2hl ⇒ trodden true→true→false (cruza umbral 100)", decayOk, JSON.stringify(decay));

  // 5 server-authoritative reflect + validation: push snapshot ⇒ refleja la celda válida; celda con tread ≤0 DESCARTADA (cliente sólo refleja, 0 confianza)
  const reflect = await page.evaluate(() => {
    const T = 6000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs: T });
    window.__dev.wayfarer({ push: { "3,3": { tread: 150, atMs: T }, "9,9": { tread: 0, atMs: T }, "1,1": { tread: -5, atMs: T } } });
    const s = window.__dev.wayfarer();
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { keys: Object.keys(s.cells || {}), cells: s.cells };
  });
  const reflOk = reflect.keys.length === 1 && reflect.keys[0] === "3,3" && !("9,9" in (reflect.cells || {})) && !("1,1" in (reflect.cells || {}));
  ok("5 server-authoritative reflect+validate SERVIDO: celda válida refleja; tread ≤0 DESCARTADA (cliente sólo refleja)", reflOk, JSON.stringify(reflect));

  // 6b ★ COBERTURA 6 ZONAS (re-test footgun CAS-2326, sim SERVIDO): cada zona de WAYFARER_TRAIL.zones puede hospedar un Sendero Trillado observable (toZone aterriza + tread 150 ⇒ trodden + boost 0.06)
  const zoneCov = await page.evaluate(() => {
    const T = 6100 * 1000; const zones = window.__dev.wayfarer().zones; const broken = [], live = [];
    for (const z of zones) {
      const s = window.__wput(z, 150, T);
      if (s && s.cell != null && s.trodden === true && Math.abs(s.wayfarerMulRested - 0.06) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6b ★ COBERTURA LIVE 6 zonas: TODAS pueden hospedar un Sendero Trillado observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length && zoneCov.zones.length === 6, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 UMBRAL + "un jugador solo no abre rápido": tread 50 ⇒ NO trillada; 100/150 ⇒ trillada; una pisada pequeña (110) decae bajo el umbral en 1 vida-media
  const thr = await page.evaluate(() => {
    const T = 7000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    const z = window.__dev.wayfarer().zones[0]; const out = {};
    for (const n of [50, 100, 150]) { const s = window.__wput(z, n, T); out[n] = s.trodden; }
    window.__wput(z, 110, T);
    const fresh = window.__dev.wayfarer({ nowMs: T }).trodden;
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const faded = window.__dev.wayfarer({ nowMs: T + hlMs }).trodden;
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { out, fresh, faded };
  });
  const thrOk = thr.out[50] === false && thr.out[100] === true && thr.out[150] === true && thr.fresh === true && thr.faded === false;
  ok("7 UMBRAL + decay SERVIDO: tread 50 ⇒ NO trillada, 100/150 ⇒ trillada; pisada pequeña (110) decae bajo umbral en 1 vida-media (concurrencia agregada requerida)", thrOk, JSON.stringify(thr));

  // 8 PASSIVE aislado: héroe SOBRE celda trillada ⇒ wayfarerMulRested==boost (0.06) + trodden + tag ⌇; leave ⇒ 0 + no trodden
  const iso = await page.evaluate(() => {
    const T = 8000 * 1000; const s = window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const inZone = { mul: s.wayfarerMulRested, trodden: s.trodden, boost: s.boost, tag: s.tag, rested: s.restedXpMult };
    const g = window.__dev.wayfarer({ leave: true });
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { inZone, leftMul: g.wayfarerMulRested, leftTrodden: g.trodden };
  });
  ok("8 PASSIVE aislado SERVIDO: en celda trillada ⇒ mul 0.06 + trodden + tag ⌇ + rested>0.06; leave ⇒ mul 0 + no trodden",
     near(iso.inZone.mul, 0.06) && iso.inZone.trodden === true && near(iso.inZone.boost, 0.06) && iso.inZone.tag === "⌇" && iso.inZone.rested > 0.06 && iso.leftMul === 0 && iso.leftTrodden === false, JSON.stringify(iso));

  // 9 seam gainXP SERVIDO wired + byte-id pasivo OFF: served sim aplica wayfarerMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag ""
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /wayfarerMul\(h,\s*"restedMult"\)/.test(simSrc);
  const seamOff = await page.evaluate(() => {
    const T = 9000 * 1000; const on = window.__wput(window.__dev.wayfarer().zones[0], 150, T);
    const onMul = on.wayfarerMulRested;
    window.__dev.wayfarer({ enabled: false });
    const s = window.__dev.wayfarer({ nowMs: T });
    window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { onMul, enabled: s.enabled, mul: s.wayfarerMulRested, tag: s.tag };
  });
  ok("9 seam gainXP SERVIDO (wayfarerMul en gainXP) + byte-id pasivo OFF: ON aislado ⇒ mul 0.06; enabled false ⇒ mul 0 AND tag \"\"",
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
    window.__dev.territory({ enabled: false }); window.__dev.wayfarer({ enabled: true, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, congPeer, congCeded, terrCoexist, heroZone };
  });
  ok("10 precedencia MÁXIMO ÚNICO LIVE: WAYFARER(0.06) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND CONGREGATION⇒0; COEXISTE con TERRITORY(⊥) ⇒ 0.06 intacto",
     near(prec.base, 0.06) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 && near(prec.terrCoexist, 0.06), JSON.stringify(prec));

  // 11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await freshPage(browser, errors, net404, "p2");

  const T = 11000 * 1000;
  const applyBoth = async (tread) => {
    const a = await page.evaluate((t, tr) => { const s = window.__wput(window.__dev.wayfarer().zones[0], tr, t); return { cell: s.cell, tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T, tread);
    const b = await page2.evaluate((t, tr) => { const s = window.__wput(window.__dev.wayfarer().zones[0], tr, t); return { cell: s.cell, tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T, tread);
    return { a, b };
  };
  // 11a baseline: mismo snapshot 150 ⇒ A==B (misma celda/tread/trodden/mul 0.06)
  const c1 = await applyBoth(150);
  const conv1 = JSON.stringify(c1.a) === JSON.stringify(c1.b) && c1.a.cell === c1.b.cell && c1.a.trodden === true && near(c1.a.mul, 0.06) && near(c1.a.tread, 150);
  ok("11a NORTH STAR LIVE convergencia: mismo snapshot (celda,tread 150,nowMs) ⇒ A==B byte-a-byte (misma celda / trodden / 0.06)", conv1, `A=${JSON.stringify(c1.a)} B=${JSON.stringify(c1.b)}`);

  // 11b DECAY converge: avanzar AMBOS relojes una vida-media ⇒ tread 75 (<100) ⇒ ambos NO trodden, mul 0
  const hlMs = (await page.evaluate(() => window.__dev.wayfarer().halfLifeSec | 0)) * 1000;
  const aDec = await page.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
  const bDec = await page2.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
  const convDec = JSON.stringify(aDec) === JSON.stringify(bDec) && near(aDec.tread, 75, 0.01) && aDec.trodden === false && aDec.mul === 0;
  ok("11b NORTH STAR LIVE decay converge: +1 vida-media ⇒ ambos tread 75 (<100) ⇒ trodden false + mul 0 (idénticos)", convDec, `A=${JSON.stringify(aDec)} B=${JSON.stringify(bDec)}`);

  // 11c A SALE de la celda ⇒ Δ_A=0 PERO tread compartido de la celda + Δ_B INTACTOS (passive compartido, no per-hero). Re-push fresh en ambos a T.
  await applyBoth(150);
  const cell = c1.a.cell;
  const aLeave = await page.evaluate(() => { const s = window.__dev.wayfarer({ leave: true }); return { mul: s.wayfarerMulRested, trodden: s.trodden, cells: s.cells }; });
  const bStill = await page2.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { mul: s.wayfarerMulRested, trodden: s.trodden, tread: s.tread }; }, T);
  const cellStillTrodden = !!(aLeave.cells && aLeave.cells[cell] >= 100);
  const noDesync = aLeave.mul === 0 && aLeave.trodden === false && cellStillTrodden && near(bStill.mul, 0.06) && bStill.trodden === true && near(bStill.tread, 150);
  ok("11c NORTH STAR LIVE A sale celda: Δ_A=0 + no trodden PERO tread compartido de la celda intacto + Δ_B INTACTO (0.06/trodden/150) — 0 desync", noDesync, `A=${JSON.stringify(aLeave.mul)},${aLeave.trodden} cellTread=${aLeave.cells ? aLeave.cells[cell] : null} B=${JSON.stringify(bStill)}`);
  await page2.screenshot({ path: join(OUT, "client-b-wayfarer.png") });
  // North Star 2-cliente COMPLETO ⇒ cierro page2 antes de la sección de render/fps: 2 canvas vivos en el MISMO browser headless hacen que el scheduler
  // hambree el rAF de page1 (fps undercount, footgun multi-tab headless — NO regr de producto; DARK single-page midió 61). Con 1 sola página el fps es real.
  await page2.close();

  // 12 render badge ON vs OFF (Δ px en la región top-right bajo el minimapa, badgeRowAnchor) + noise-floor + arco regr + fps
  await page.bringToFront();
  await sleep(400);
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.wayfarer({ leave: true }); window.__dev.wayfarer({ enabled: false, clear: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);
  const noise = Math.abs(offSum - offSum2);
  await page.evaluate(() => { const T = 12000 * 1000; window.__wput(window.__dev.wayfarer().zones[0], 180, T); window.__dev.wayfarer({ nowMs: T }); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  ok("12a render badge 'Sendero Trillado' DIBUJA en región top-right (Δ>noise) vs OFF-control LIVE", delta > 0 && delta > noise, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // 12b arco previo re-activable LIVE (peers flippeados OFF in-memory arriba; re-flip ON verifica DISCO true) — 0 regr
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.congregation({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled, cong: window.__dev.congregation().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor/congregation) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  // best-of-3 ventanas de 1s (page2 ya cerrada): rechaza una única ventana lenta; el loop está capado a 60 por rAF ⇒ el mejor ~60
  const measureFps = () => page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  const fpsSamples = [await measureFps(), await measureFps(), await measureFps()];
  const fps = Math.max(...fpsSamples);
  ok("12c fps estable ≥60 LIVE (best-of-3, single-page)", fps >= 60, `fps=${fps} samples=${JSON.stringify(fpsSamples)}`);

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2337 QA LIVE observable+2cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  if (net404.length) console.log("net404:\n" + net404.join("\n"));
  ok("0 no JS errors/404 during run", errors.length === 0 && net404.length === 0, `errors=${errors.length} net404=${net404.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (FAIL > 0) process.exitCode = 1;
