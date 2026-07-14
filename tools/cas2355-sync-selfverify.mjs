// CAS-2355 — GE self-verify for SINCRONÍA DE BATALLA / BATTLE SYNCHRONY (DARK, BATTLE_SYNC.enabled:false). EVO mecánica #57.
// Eje FRESCO (NO repite #47-56): NO reloj global (World Pulse #50), NO headcount/densidad (Congregación #51), NO footfall por celda (Sendero #52), NO variedad de clases
// (Confluencia #53), NO continuidad temporal (Vigilia #54), NO dispersión espacial (Expedición #55), NO tasa de llegada/flujo (Afluencia #56), NO nivel/clase (Mentor/Diverse).
// Es CORRELACIÓN / SIMULTANEIDAD de gestas de combate: cuántos jugadores DISTINTOS co-presentes anotan una GESTA (kill — REUSA el contador monótono h.kills que YA existe) dentro
// de la MISMA ventana deslizante corta (~5s). El server marca el instante de la última gesta de cada jugador por zona, empuja { zona → { id → últimoKillMs } }; el cliente lo
// REFLEJA + PROYECTA al `now` compartido contando ids DISTINTOS con gesta DENTRO de la ventana. Al cruzar umbrales (2/3/4 sincronizados) la zona entra en Sincronía por tiers y da a
// TODOS los presentes el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR (checks 5/8, no-negociable): la sincronía es la CO-OCURRENCIA temporal de acciones de combate, no el stock presente ni el flujo de llegadas. N presentes pero
// INACTIVOS (0 kills / gestas viejas) ⇒ 0 sincronizados ⇒ NO abre (distingue de Congregación #51, que abriría por headcount, y de Afluencia #56, que abriría por llegadas sin combatir);
// 2 jugadores que matan en ventanas SEPARADAS/no-solapadas ⇒ en cualquier `now` sólo 1 cae en la ventana ⇒ 0 (es CORRELACIÓN, no un rate acumulado); 1 solo matando ⇒ 1 ⇒ NO abre
// (requiere ≥2 DISTINTOS); 2+ matando a la vez en la ventana ⇒ abre. Premia COORDINAR gestas simultáneas entre jugadores distintos.
//
// North Star (check 16, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot de gestas { id → últimoKillMs } + MISMO reloj (nowMs) ⇒
// ven count + tier + buff IDÉNTICOS byte-a-byte (0 desync). Subir la sincronía (más ids en ventana) y la EXPIRACIÓN de la ventana al parar CONVERGEN en ambos. Cualquier desync de
// count/tier/buff = sev-1. El passive es COMPARTIDO (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO el count/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 12): BATTLE_SYNC es la MÁS BAJA del canal restedMult (12ª fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION > WAYFARER >
// DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD > INFLUX_SURGE — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del canal
// está LIVE, para OBSERVAR el passive de Sincronía en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.sync (flip BATTLE_SYNC.enabled IN-MEMORY + inyección del snapshot {zona→{id→últimoKillMs}} / kills / push + nowMs/toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/confluence/longWatch/frontier/influx/territory/oath/saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Sincronía").
//
// Checks:
//   1  boots to play, __dev.sync + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): BATTLE_SYNC.enabled false AND G.sync NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'sync'/'syncServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ SINCRONÍA = función PURA de la VENTANA (syncCount vía push): 2 distintos en ventana⇒2; N INACTIVOS (gestas viejas)⇒0; 1 solo⇒1; 2 en ventanas SEPARADAS⇒1; 4 a la vez⇒4.
//   6  TABLA de tiers = función PURA del COUNT: count→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; gesta en el FUTURO (dt<0) NO cuenta.
//   8  ★ DIFERENCIADOR inactivos vs sincronizados: 8 presentes INACTIVOS (gestas viejas) ⇒ 0 / tier 0 / passive 0 (NO abre, ≠ Congregación/Afluencia); 1 solo ⇒ 1 / tier 0; 2 a la vez ⇒ 2 / T1 / passive>0.
//   9  ★ DECAY = EXPIRACIÓN de la ventana deslizante (0-RNG): 4 sincronizados en la ventana ⇒ T3; +6s (>window 5s) ⇒ 0 / T0; slide parcial (2 recientes + 2 viejas) ⇒ 2 / T1.
//  10  PASSIVE compartido (aislado): peers OFF + count≥umbral + héroe EN la zona ⇒ syncMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  11  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica syncMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  12  PRECEDENCIA MÁXIMO ÚNICO: SYNC(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 AND INFLUX⇒0; COEXISTE con TERRITORY(safeRegen ⊥).
//  13  ★ 0-REGRESIÓN: los 8 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE) siguen served enabled:true; BATTLE_SYNC served false (DARK).
//  14  ★ SINCRONÍA 6 zonas: las 6 zonas de BATTLE_SYNC.zones hospedan una Sincronía observable (count≥4 ⇒ T3) broken=[].
//  15  render badge "Sincronía" se DIBUJA con la feature ON (ctx.fillText "Sincronía" count>0) y NO con OFF (count 0) + arco regr + fps.
//  16  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot de gestas+reloj ⇒ count/tier/buff IDÉNTICOS byte-a-byte; subir(T3)/expirar-ventana(T1) CONVERGE;
//      A sale ⇒ Δ_A=0 PERO count/tier compartidos + Δ_B INTACTOS (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2355-sync-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2355");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

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

// helper: desactiva los 10 peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE incl. INFLUX) para medir Sincronía en AISLAMIENTO; y drivers de snapshot/proyección con reloj FIJO.
const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__ISNOW = NOW;
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); window.__dev.frontier({ enabled: false }); window.__dev.influx({ enabled: false }); };
    // marks de `n` jugadores DISTINTOS matando en `atMs` (default NOW)
    window.__marks = (n, atMs) => { const m = {}; const at = (atMs == null ? window.__ISNOW : atMs); for (let i = 0; i < n; i++) m["p" + i] = at; return m; };
    // empuja `count` gestas frescas (todas en NOW) en UNA zona (CLEAR antes ⇒ count == count exacto proyectado a NOW)
    window.__ssnap = (zone, count) => { window.__dev.sync({ clear: true, nowMs: window.__ISNOW }); window.__dev.sync({ nowMs: window.__ISNOW, push: { [zone]: window.__marks(count) } }); };
    // empuja un snapshot CRUDO de marks {id:ms} en UNA zona (CLEAR antes)
    window.__spush = (zone, marks) => { window.__dev.sync({ clear: true, nowMs: window.__ISNOW }); window.__dev.sync({ nowMs: window.__ISNOW, push: { [zone]: marks } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dt = elapsedSec*1000 ⇒ expiración de ventana)
    window.__sat = (zone, elapsedSec) => window.__dev.sync({ nowMs: window.__ISNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta `count` gestas frescas (atMs=NOW) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (syncable + zona coincide).
    window.__spick = (count) => {
      window.__dev.sync({ enabled: true });
      const zones = window.__dev.sync().zones || [];
      for (const z of zones) {
        window.__dev.sync({ clear: true, nowMs: window.__ISNOW });
        const s = window.__dev.sync({ nowMs: window.__ISNOW, push: { [z]: window.__marks(count) }, toZone: z });
        if (s.zone === z && s.syncable) return { zone: z, count: s.count, tier: s.tier, boost: s.syncMulRested };
      }
      return null;
    };
  }, NOW);
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
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sync && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.sync + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.sync never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.sync());
  ok("2 byte-id OFF (fresh boot): BATTLE_SYNC.enabled false AND G.sync NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.count === 0 && dark.boost === 0 && dark.tag === "" && dark.countMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} count=${dark.count} boost=${dark.boost} tag="${dark.tag}" countMap=${JSON.stringify(dark.countMap)}`);

  // 3 save OFF has no 'sync'/'syncServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'sync'/'syncServer' key in save blob (estado 100% derivado/transitorio)", !/"sync(Server)?"/.test(saveOff) && !/syncServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.sync({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.sync({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 ★ syncCount = pure window fn (via push): 2 distinct in window⇒2; N inactive (old kills)⇒0; solo⇒1; separate windows⇒1; 4 at once⇒4
  const cntfn = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const zones = window.__dev.sync().zones || []; const z = zones[0];
    const read = (marks) => { window.__spush(z, marks); return window.__dev.sync({ nowMs: window.__ISNOW, toZone: z }).count; };
    const N = window.__ISNOW;
    return {
      two: read({ a: N, b: N }),                                   // 2 distintos en ventana ⇒ 2
      inactive: read({ a: N - 100000, b: N - 100000, c: N - 100000 }),  // 3 presentes pero gestas MUY viejas (dt>window) ⇒ 0
      solo: read({ a: N }),                                        // 1 solo ⇒ 1
      separate: read({ a: N - 10000, b: N }),                      // a mató hace 10s (expiró), b ahora ⇒ sólo 1 en ventana ⇒ 1
      four: read({ a: N, b: N, c: N, d: N }),                      // 4 a la vez ⇒ 4
    };
  });
  ok("5 ★ SINCRONÍA = función PURA de la VENTANA (syncCount): 2 distintos⇒2; 3 INACTIVOS (gestas viejas)⇒0; 1 solo⇒1; 2 en ventanas SEPARADAS⇒1; 4 a la vez⇒4",
     near(cntfn.two, 2) && near(cntfn.inactive, 0) && near(cntfn.solo, 1) && near(cntfn.separate, 1) && near(cntfn.four, 4), JSON.stringify(cntfn));

  // 6 tier table = pure fn of COUNT: count→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__spick(4); if (!w) return { bad: true };   // land in a syncable zone at max tier
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 3, 4, 5]) {
      window.__ssnap(zone, c);
      const vm = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone });
      out.push({ c, count: vm.count, tier: vm.tier, boost: vm.syncMulRested });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3 };
  const expBoost = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => r.count === r.c && r.tier === expTier[r.c] && near(r.boost, expBoost[r.c]));
  ok("6 TABLA de tiers = función PURA del COUNT: count→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + future-timestamped kills)
  const refl = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const zones = window.__dev.sync().zones; const z0 = zones[0]; const N = window.__ISNOW;
    window.__dev.sync({ clear: true, nowMs: N });
    window.__dev.sync({ nowMs: N, push: { [z0]: { a: N, b: N }, town: { a: N, b: N, c: N } } });
    const s = window.__dev.sync({ nowMs: N, toZone: z0 });
    // gestas en el FUTURO (dt<0) NO cuentan (ventana [now-w, now])
    window.__dev.sync({ clear: true, nowMs: N });
    window.__dev.sync({ nowMs: N, push: { [z0]: { a: N + 100000, b: N + 100000 } } });
    const fut = window.__dev.sync({ nowMs: N, toZone: z0 });
    return { z0, valid: s.count, countMap: s.countMap, futCount: fut.count, futTier: fut.tier };
  });
  const reflOk = refl.valid === 2 && !("town" in (refl.countMap || {})) && refl.futCount === 0 && refl.futTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida cuenta 2; zona fuera de `zones` DESCARTADA; gesta en el FUTURO (dt<0) NO cuenta (0)",
     reflOk, JSON.stringify(refl));

  // 8 ★ DIFFERENTIATOR — inactive crowd does NOT open; solo does NOT open; 2 killing in window opens
  const diff = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__spick(2); if (!w) return { bad: true };
    const zone = w.zone; const N = window.__ISNOW;
    // 8 players PRESENT but INACTIVE (kills 100s old, dt>window) ⇒ 0 synced ⇒ tier 0 ⇒ passive 0 (Congregación SÍ abriría por headcount 8; Afluencia por llegadas)
    const CROWD = {}; for (const id of ["a", "b", "c", "d", "e", "f", "g", "h"]) CROWD[id] = N - 100000;
    window.__spush(zone, CROWD);
    const cr = window.__dev.sync({ nowMs: N, toZone: zone });
    // 1 SOLO killing ⇒ count 1 ⇒ tier 0 (requiere ≥2 DISTINTOS)
    window.__spush(zone, { a: N });
    const so = window.__dev.sync({ nowMs: N, toZone: zone });
    // 2 killing IN the window ⇒ count 2 ⇒ tier 1 ⇒ passive>0
    window.__spush(zone, { a: N, b: N });
    const sy = window.__dev.sync({ nowMs: N, toZone: zone });
    return { zone, crC: cr.count, crT: cr.tier, crM: cr.syncMulRested, soC: so.count, soT: so.tier, soM: so.syncMulRested, syC: sy.count, syT: sy.tier, syM: sy.syncMulRested };
  });
  ok("8 ★ DIFERENCIADOR inactivos vs sincronizados: 8 presentes INACTIVOS (gestas viejas) ⇒ 0/T0/passive 0 (NO abre, ≠ Congregación/Afluencia); 1 solo ⇒ 1/T0; 2 a la vez ⇒ 2/T1/passive>0",
     !diff.bad && diff.crC === 0 && diff.crT === 0 && diff.crM === 0 && diff.soC === 1 && diff.soT === 0 && diff.soM === 0 && diff.syC === 2 && diff.syT === 1 && diff.syM > 0, JSON.stringify(diff));

  // 9 ★ DECAY = sliding-window expiry deterministic 0-RNG
  const decay = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__spick(4); if (!w) return { bad: true };
    const zone = w.zone; const N = window.__ISNOW;
    window.__ssnap(zone, 4);                    // 4 fresh ⇒ T3
    const at0 = window.__dev.sync({ nowMs: N, toZone: zone });
    window.__ssnap(zone, 4);
    const exp = window.__sat(zone, 6);          // +6s (> window 5s) ⇒ todas expiran ⇒ 0 / T0
    // slide parcial: 2 recientes (NOW) + 2 viejas (NOW-4s); proyectar a NOW+2s ⇒ viejas dt=6s expiran, recientes dt=2s ⇒ 2 ⇒ T1
    window.__spush(zone, { p0: N, p1: N, p2: N - 4000, p3: N - 4000 });
    const slide = window.__dev.sync({ nowMs: N + 2000, toZone: zone });
    return { zone, base: at0.count, baseT: at0.tier, expC: exp.count, expT: exp.tier, slC: slide.count, slT: slide.tier };
  });
  ok("9 ★ DECAY = EXPIRACIÓN ventana deslizante 0-RNG: 4 sincronizados ⇒ T3; +6s (>5s)⇒0/T0; slide parcial (2 recientes+2 viejas)⇒2/T1",
     !decay.bad && decay.base === 4 && decay.baseT === 3 && decay.expC === 0 && decay.expT === 0 && decay.slC === 2 && decay.slT === 1, JSON.stringify(decay));

  // 10 passive isolated: in-zone count≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__spick(3); if (!w) return { bad: true };          // count 3 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.sync({ nowMs: window.__ISNOW, toZone: w.zone });
    const out = window.__dev.sync({ leave: true });
    return { zone: w.zone, inMul: inz.syncMulRested, inTier: inz.tier, inCount: inz.count, outMul: out.syncMulRested, outTier: out.tier };
  });
  ok("10 PASSIVE compartido (aislado): héroe EN la zona con count≥umbral ⇒ syncMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.inCount === 3 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 11 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /syncMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__spick(2); if (!w) return { bad: true };          // count 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.sync({ nowMs: window.__ISNOW, toZone: w.zone }).syncMulRested;
    window.__dev.sync({ enabled: false });
    const s = window.__dev.sync({ nowMs: window.__ISNOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.syncMulRested, tag: s.tag };
  });
  ok("11 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma syncMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 12 precedence: SYNC cedes to STANDINGS + CONGREGATION + WAYFARER + CONFLUENCE + LONG_WATCH + FRONTIER + INFLUX (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__spick(2); if (!w) return { bad: true };          // base sin peers ⇒ 0.05
    const zone = w.zone; const setSync = () => window.__ssnap(zone, 2);
    setSync(); const base = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }).syncMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ syncMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setSync(); const s1 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.syncMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ syncMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setSync(); const s2 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.syncMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ syncMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setSync(); const s3 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.syncMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs CONFLUENCIA: composición diversa en la MISMA zona ⇒ confMul>0 ⇒ syncMul CEDE
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    setSync(); const s4 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const confPeer = s4.confMulRested, confCeded = s4.syncMulRested;
    window.__dev.confluence({ enabled: false });
    // (e) vs LONG_WATCH: streak≥umbral en la MISMA zona ⇒ longWatchMul>0 ⇒ syncMul CEDE
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__ISNOW, push: { [zone]: { streak: 90, atMs: window.__ISNOW, present: 1 } } });
    setSync(); const s5 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const lwPeer = s5.longWatchMulRested, lwCeded = s5.syncMulRested;
    window.__dev.longWatch({ enabled: false });
    // (f) vs FRONTIER: cobertura≥umbral en la MISMA zona ⇒ frontierMul>0 ⇒ syncMul CEDE
    window.__dev.frontier({ enabled: true }); window.__dev.frontier({ nowMs: window.__ISNOW, push: { [zone]: { cover: 4, atMs: window.__ISNOW } } });
    setSync(); const s6 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const frPeer = s6.frontierMulRested, frCeded = s6.syncMulRested;
    window.__dev.frontier({ enabled: false });
    // (g) vs INFLUX: surge≥umbral en la MISMA zona ⇒ influxMul>0 ⇒ syncMul CEDE (INFLUX es la fuente inmediatamente superior)
    window.__dev.influx({ enabled: true }); window.__dev.influx({ clear: true, nowMs: window.__ISNOW }); window.__dev.influx({ nowMs: window.__ISNOW, push: { [zone]: { surge: 4, atMs: window.__ISNOW } } });
    setSync(); const s7 = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }); const inPeer = s7.influxMulRested, inCeded = s7.syncMulRested;
    window.__dev.influx({ enabled: false });
    // (h) vs TERRITORY (⊥ safeRegen): NO afecta syncMul ⇒ intacto
    setSync(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.sync({ nowMs: window.__ISNOW, toZone: zone }).syncMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, confPeer, confCeded, lwPeer, lwCeded, frPeer, frCeded, inPeer, inCeded, terrCoexist };
  });
  ok("12 PRECEDENCIA MÁXIMO ÚNICO: SINCRONÍA(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 AND INFLUX⇒0; COEXISTE con TERRITORY(safeRegen ⊥)⇒0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 &&
     prec.frPeer > 0 && prec.frCeded === 0 && prec.inPeer > 0 && prec.inCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 13 0-regression: the 8 LIVE arc flags still served enabled:true in config.js; BATTLE_SYNC served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const liveFlag = (name) => new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const darkFlag = new RegExp("export const BATTLE_SYNC\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"), fs: liveFlag("FRONTIER_SPREAD"), inf: liveFlag("INFLUX_SURGE"), isDark: darkFlag };
  ok("13 ★ 0-REGRESIÓN: los 8 flags del arco LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE) served enabled:true; BATTLE_SYNC served false (DARK)",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && reg.lw && reg.fs && reg.inf && reg.isDark, JSON.stringify(reg));

  // 14 ★ 6-zone coverage: every BATTLE_SYNC.zones hosts an observable Sincronía (count≥4 ⇒ T3)
  const cov = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const zones = window.__dev.sync().zones || []; const broken = [];
    for (const z of zones) {
      window.__dev.sync({ clear: true, nowMs: window.__ISNOW });
      const s = window.__dev.sync({ nowMs: window.__ISNOW, push: { [z]: window.__marks(4) }, toZone: z });
      if (!(s.zone === z && s.syncable && s.tier === 3 && s.syncMulRested > 0)) broken.push({ z, zone: s.zone, syncable: s.syncable, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("14 ★ SINCRONÍA 6 zonas: cada zona de BATTLE_SYNC.zones hospeda una Sincronía observable (count≥4 ⇒ T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 15 render badge draws with feature ON — instrument ctx.fillText, count "Sincronía" draws (deterministic, position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0;
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Sincronía") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.sync({ enabled: false }); });
  await page.evaluate(() => { window.__ftCount = 0; });
  await sleep(240);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.sync({ enabled: true }); const w = window.__spick(4); if (w) window.__dev.sync({ nowMs: window.__ISNOW, toZone: w.zone }); window.__ftCount = 0; });
  await sleep(280);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, conf: !!window.__dev.confluence, lw: !!window.__dev.longWatch, fr: !!window.__dev.frontier, inf: !!window.__dev.influx, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("15 render badge 'Sincronía' se DIBUJA con feature ON (fillText count>0) y NO con OFF (0) + arco hooks presentes + fps",
     ftOn > 0 && ftOff === 0 && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.conf && arc.lw && arc.fr && arc.inf && arc.ledger && fps >= 55,
     `ftOff=${ftOff} ftOn=${ftOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 16 ★ NORTH STAR — 2-client convergence (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installPick(page2);

  // page2 picks a syncable zone (count 2 ⇒ T1); page1 applies the SAME snapshot+clock on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.sync({ enabled: true }); window.__iso(); return window.__spick(2); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // baseline: both set 2 synced, project at NOW ⇒ count 2 ⇒ T1 identical
    const a = await page.evaluate((z) => { window.__dev.sync({ enabled: true }); window.__iso();
      window.__ssnap(z, 2); return window.__dev.sync({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__ssnap(z, 2); return window.__dev.sync({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    // SYNC UP: both push 4 synced ⇒ T3 on both
    const aUp = await page.evaluate((z) => { window.__ssnap(z, 4); return window.__dev.sync({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    const bUp = await page2.evaluate((z) => { window.__ssnap(z, 4); return window.__dev.sync({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    // WINDOW SLIDE: push 4 marks (2 recent NOW, 2 old NOW-4s), project at NOW+2s ⇒ old expire ⇒ 2 ⇒ T1 on both (converges)
    const slideMarks = (N) => ({ p0: N, p1: N, p2: N - 4000, p3: N - 4000 });
    const aDn = await page.evaluate((z) => { const N = window.__ISNOW; window.__spush(z, { p0: N, p1: N, p2: N - 4000, p3: N - 4000 }); return window.__dev.sync({ nowMs: N + 2000, toZone: z }); }, zone);
    const bDn = await page2.evaluate((z) => { const N = window.__ISNOW; window.__spush(z, { p0: N, p1: N, p2: N - 4000, p3: N - 4000 }); return window.__dev.sync({ nowMs: N + 2000, toZone: z }); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared count/tier + B's Δ must stay intact
    const aOut = await page.evaluate(() => window.__dev.sync({ leave: true }));
    const bAfter = await page2.evaluate((z) => { const N = window.__ISNOW; window.__spush(z, { p0: N, p1: N, p2: N - 4000, p3: N - 4000 }); return window.__dev.sync({ nowMs: N + 2000, toZone: z }); }, zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aC: a.count, bC: b.count, aM: a.syncMulRested, bM: b.syncMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpC: aUp.count, bUpC: bUp.count, aUpM: aUp.syncMulRested, bUpM: bUp.syncMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnC: aDn.count, bDnC: bDn.count, aDnM: aDn.syncMulRested, bDnM: bDn.syncMulRested,
      aOutM: aOut.syncMulRested, aOutT: aOut.tier, bAfterC: bAfter.count, bAfterT: bAfter.tier, bAfterM: bAfter.syncMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 1 && north.aC === north.bC && north.aC === 2 && near(north.aM, north.bM) && near(north.aM, 0.05) &&   // baseline T1 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && north.aUpC === north.bUpC && north.aUpC === 4 && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&  // SYNC UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 1 && north.aDnC === north.bDnC && north.aDnC === 2 && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&   // WINDOW SLIDE converges T1
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                                     // A leaves ⇒ Δ_A 0
    north.bAfterC === 2 && north.bAfterT === 1 && near(north.bAfterM, 0.05);                                                                                      // B + shared count/tier intact
  ok("16 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO snapshot+reloj ⇒ count/tier/buff IDÉNTICOS; subir(T3)/expirar-ventana(T1) CONVERGE; A sale ⇒ Δ_A=0 pero count/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2355 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  ok("0 no JS errors during run", errors.length === 0, `errors=${errors.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close && server.close();
}
if (FAIL > 0) process.exitCode = 1;
