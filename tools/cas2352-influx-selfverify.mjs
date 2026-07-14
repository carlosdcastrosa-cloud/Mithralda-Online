// CAS-2352 — GE self-verify for AFLUENCIA / INFLUX SURGE (DARK, INFLUX_SURGE.enabled:false). EVO mecánica #56.
// Eje FRESCO (NO repite #50-55): NO reloj global (World Pulse #50), NO headcount/densidad (Congregación #51), NO footfall por celda (Sendero #52), NO variedad de clases
// (Confluencia #53), NO continuidad temporal (Vigilia #54), NO dispersión espacial (Expedición #55). Es TASA DE LLEGADA (flujo/afluencia): cuántos jugadores NUEVOS CRUZAN
// HACIA una zona por ventana de tiempo. El server detecta las LLEGADAS (transición de borde fuera→dentro, EDGE-triggered = ids nuevos), las acumula en un `surge` con DECAY,
// empuja { zona → { surge, atMs } }; el cliente lo REFLEJA + PROYECTA al `now` compartido. Al cruzar umbrales (2/4/6 llegadas) la zona entra en Afluencia por tiers y da a
// TODOS los presentes el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR (checks 5/8, no-negociable): la afluencia es el FLUJO de recién-llegados, no el stock presente. Una MISMA multitud quieta (prev==now, MISMOS ids, aunque
// sean 8) ⇒ 0 llegadas ⇒ NO abre (distingue de Congregación, que SÍ abriría por headcount 8); una OLEADA de recién-llegados (ids nuevos) ⇒ llegadas=|nuevos| ⇒ abre el tier.
// Premia ATRAER un flujo de recién-llegados / ondas de entrada, no amontonar cabezas que ya estaban. Prueba que el eje es TASA DE LLEGADA (derivada), no densidad/composición/continuidad/dispersión/reloj.
//
// North Star (check 16, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO surge {surge,atMs} + MISMO reloj (nowMs) ⇒ ven surge +
// tier + buff IDÉNTICOS byte-a-byte (0 desync). Un flujo (surge sube) y el decay al parar CONVERGEN en ambos. Cualquier desync de surge/tier/buff = sev-1. El passive es
// COMPARTIDO (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO el surge/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 12): INFLUX_SURGE es la MÁS BAJA del canal restedMult (11ª fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION >
// WAYFARER > DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del
// canal está LIVE, para OBSERVAR el passive de Afluencia en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.influx (flip INFLUX_SURGE.enabled IN-MEMORY + inyección del snapshot {zona→{surge,atMs}} / arrivals / transition + nowMs/toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/confluence/longWatch/frontier/territory/oath/saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Afluencia").
//
// Checks:
//   1  boots to play, __dev.influx + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): INFLUX_SURGE.enabled false AND G.influx NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'influx'/'influxServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ LLEGADAS = función PURA EDGE (influxArrivals vía transition): prev=[]/now=[x]⇒1; MISMA multitud prev==now (5 ids)⇒0; 1 recién-llegado entre 2 que vuelven⇒1; 4 nuevos⇒4.
//   6  TABLA de tiers = función PURA del SURGE: surge→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; surge negativo ⇒ clamped a 0/descartado.
//   8  ★ DIFERENCIADOR multitud-quieta vs oleada: 8 MISMOS ids (prev==now) ⇒ 0 llegadas / tier 0 / passive 0 (NO abre, ≠ Congregación); OLEADA de 2 nuevos ⇒ surge 2 / tier 1 / passive>0.
//   9  ★ DECAY determinista 0-RNG: surge baja por vida-media (surge 8, +30s ⇒ 4 T2; +60s ⇒ 2 T1). Techo capSurge no interfiere.
//  10  PASSIVE compartido (aislado): peers OFF + surge≥umbral + héroe EN la zona ⇒ influxMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  11  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica influxMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  12  PRECEDENCIA MÁXIMO ÚNICO: INFLUX(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0; COEXISTE con TERRITORY(safeRegen ⊥).
//  13  ★ 0-REGRESIÓN: los 7 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD) siguen served enabled:true; INFLUX_SURGE served false (DARK).
//  14  ★ AFLUENCIA 6 zonas: las 6 zonas de INFLUX_SURGE.zones hospedan una Afluencia observable (surge≥6 ⇒ T3) broken=[].
//  15  render badge "Afluencia" se DIBUJA con la feature ON (ctx.fillText "Afluencia" count>0) y NO con OFF (count 0) + arco regr + fps.
//  16  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO surge+reloj ⇒ surge/tier/buff IDÉNTICOS byte-a-byte; flujo(T3)/decaer(T1) CONVERGE;
//      A sale ⇒ Δ_A=0 PERO surge/tier compartidos + Δ_B INTACTOS (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2352-influx-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2352");
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

// helper: desactiva los 9 peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE incl. FRONTIER) para medir Afluencia en AISLAMIENTO; y drivers de snapshot/proyección con reloj FIJO.
const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__ISNOW = NOW;
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); window.__dev.frontier({ enabled: false }); };
    // empuja el surge crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ surge == base exacto)
    window.__isnap = (zone, surge) => { window.__dev.influx({ clear: true, nowMs: window.__ISNOW }); window.__dev.influx({ nowMs: window.__ISNOW, push: { [zone]: { surge, atMs: window.__ISNOW } } }); };
    // registra N LLEGADAS directas en UNA zona (CLEAR antes ⇒ surge = N exacto en NOW)
    window.__iarr = (zone, n) => { window.__dev.influx({ clear: true, nowMs: window.__ISNOW }); window.__dev.influx({ nowMs: window.__ISNOW, arrivals: { [zone]: n } }); };
    // aplica una TRANSICIÓN de borde {prev,now} en UNA zona (CLEAR antes ⇒ surge = influxArrivals(prev,now) exacto en NOW). Prueba EDGE (multitud quieta⇒0)
    window.__itrans = (zone, prev, nowIds) => { window.__dev.influx({ clear: true, nowMs: window.__ISNOW }); window.__dev.influx({ nowMs: window.__ISNOW, transition: { [zone]: { prev, now: nowIds } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__iat = (zone, elapsedSec) => window.__dev.influx({ nowMs: window.__ISNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un surge `surge` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (influxable + zona coincide).
    window.__ipick = (surge) => {
      window.__dev.influx({ enabled: true });
      const zones = window.__dev.influx().zones || [];
      for (const z of zones) {
        window.__dev.influx({ clear: true, nowMs: window.__ISNOW });
        const s = window.__dev.influx({ nowMs: window.__ISNOW, push: { [z]: { surge, atMs: window.__ISNOW } }, toZone: z });
        if (s.zone === z && s.influxable) return { zone: z, surge: s.surge, tier: s.tier, boost: s.influxMulRested };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.influx + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.influx never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.influx());
  ok("2 byte-id OFF (fresh boot): INFLUX_SURGE.enabled false AND G.influx NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.surge === 0 && dark.boost === 0 && dark.tag === "" && dark.surgeMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} surge=${dark.surge} boost=${dark.boost} tag="${dark.tag}" surgeMap=${JSON.stringify(dark.surgeMap)}`);

  // 3 save OFF has no 'influx'/'influxServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'influx'/'influxServer' key in save blob (estado 100% derivado/transitorio)", !/"influx(Server)?"/.test(saveOff) && !/influxServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.influx({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.influx({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 ★ arrivals = pure EDGE fn (via transition): prev=[]/now=[x]⇒1; same crowd⇒0; 1 newcomer among returners⇒1; 4 new⇒4
  const arrfn = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const zones = window.__dev.influx().zones || []; const z = zones[0];
    const read = (prev, nowIds) => { window.__itrans(z, prev, nowIds); return window.__dev.influx({ nowMs: window.__ISNOW, toZone: z }).surge; };
    return {
      one: read([], ["x"]),
      crowd: read(["a", "b", "c", "d", "e"], ["a", "b", "c", "d", "e"]),
      newcomer: read(["a", "b"], ["a", "b", "c"]),
      four: read([], ["n1", "n2", "n3", "n4"]),
    };
  });
  ok("5 ★ LLEGADAS = función PURA EDGE (influxArrivals): prev=[]/now=[x]⇒1; MISMA multitud (5 ids, prev==now)⇒0; 1 recién-llegado entre 2 que vuelven⇒1; 4 nuevos⇒4",
     near(arrfn.one, 1) && near(arrfn.crowd, 0) && near(arrfn.newcomer, 1) && near(arrfn.four, 4), JSON.stringify(arrfn));

  // 6 tier table = pure fn of SURGE: surge→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__ipick(6); if (!w) return { bad: true };   // land in an influxable zone at max tier
    const zone = w.zone; const out = [];
    for (const s of [1, 2, 4, 6, 8]) {
      window.__isnap(zone, s);
      const vm = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone });
      out.push({ s, surge: vm.surge, tier: vm.tier, boost: vm.influxMulRested });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.surge, r.s) && r.tier === expTier[r.s] && near(r.boost, expBoost[r.s]));
  ok("6 TABLA de tiers = función PURA del SURGE: surge→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative surge)
  const refl = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const zones = window.__dev.influx().zones; const z0 = zones[0];
    window.__dev.influx({ clear: true, nowMs: window.__ISNOW });
    window.__dev.influx({ nowMs: window.__ISNOW, push: { [z0]: { surge: 4, atMs: window.__ISNOW }, town: { surge: 6, atMs: window.__ISNOW } } });
    const s = window.__dev.influx({ nowMs: window.__ISNOW, toZone: z0 });
    window.__dev.influx({ clear: true, nowMs: window.__ISNOW });
    window.__dev.influx({ nowMs: window.__ISNOW, push: { [z0]: { surge: -5, atMs: window.__ISNOW } } });
    const neg = window.__dev.influx({ nowMs: window.__ISNOW, toZone: z0 });
    return { z0, valid: s.surge, surgeMap: s.surgeMap, negSurge: neg.surge, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.surgeMap || {})) && refl.negSurge === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida refleja surge; zona fuera de `zones` DESCARTADA; surge negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ DIFFERENTIATOR — static crowd (same ids) does NOT open; wave of newcomers opens
  const diff = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__ipick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const CROWD = ["a", "b", "c", "d", "e", "f", "g", "h"];   // 8 players
    // 8 SAME ids present before and now (static crowd) ⇒ 0 arrivals ⇒ tier 0 ⇒ passive 0 (Congregación SÍ abriría por headcount 8)
    window.__itrans(zone, CROWD, CROWD);
    const cr = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone });
    // WAVE of 2 NEW arrivals (prev empty) ⇒ surge 2 ⇒ tier 1 ⇒ passive>0
    window.__itrans(zone, [], ["n1", "n2"]);
    const wv = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone });
    return { zone, crSurge: cr.surge, crTier: cr.tier, crMul: cr.influxMulRested, wvSurge: wv.surge, wvTier: wv.tier, wvMul: wv.influxMulRested };
  });
  ok("8 ★ DIFERENCIADOR multitud-quieta vs oleada: 8 MISMOS ids (prev==now) ⇒ 0 llegadas / tier 0 / passive 0 (NO abre, ≠ Congregación); OLEADA de 2 nuevos ⇒ surge 2 / tier 1 / passive>0",
     !diff.bad && near(diff.crSurge, 0) && diff.crTier === 0 && diff.crMul === 0 && near(diff.wvSurge, 2) && diff.wvTier === 1 && diff.wvMul > 0, JSON.stringify(diff));

  // 9 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__ipick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__isnap(zone, 8);                 // base surge 8 (T3)
    const at0 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone });
    window.__isnap(zone, 8);
    const hl1 = window.__iat(zone, 30);      // +30s (1 vida-media) ⇒ 4 ⇒ T2
    window.__isnap(zone, 8);
    const hl2 = window.__iat(zone, 60);      // +60s (2 vidas-media) ⇒ 2 ⇒ T1
    return { zone, base: at0.surge, baseT: at0.tier, hl1: hl1.surge, hl1T: hl1.tier, hl2: hl2.surge, hl2T: hl2.tier };
  });
  ok("9 ★ DECAY determinista 0-RNG: surge baja por vida-media (base 8⇒T3; +30s⇒4 T2; +60s⇒2 T1)",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.hl1, 4) && decay.hl1T === 2 && near(decay.hl2, 2) && decay.hl2T === 1, JSON.stringify(decay));

  // 10 passive isolated: in-zone surge≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__ipick(4); if (!w) return { bad: true };          // surge 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.influx({ nowMs: window.__ISNOW, toZone: w.zone });
    const out = window.__dev.influx({ leave: true });
    return { zone: w.zone, inMul: inz.influxMulRested, inTier: inz.tier, inSurge: inz.surge, outMul: out.influxMulRested, outTier: out.tier };
  });
  ok("10 PASSIVE compartido (aislado): héroe EN la zona con surge≥umbral ⇒ influxMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inSurge, 4) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 11 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /influxMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__ipick(2); if (!w) return { bad: true };          // surge 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.influx({ nowMs: window.__ISNOW, toZone: w.zone }).influxMulRested;
    window.__dev.influx({ enabled: false });
    const s = window.__dev.influx({ nowMs: window.__ISNOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.influxMulRested, tag: s.tag };
  });
  ok("11 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma influxMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 12 precedence: INFLUX cedes to STANDINGS + CONGREGATION + WAYFARER + CONFLUENCE + LONG_WATCH + FRONTIER (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__ipick(2); if (!w) return { bad: true };          // base sin peers ⇒ 0.05
    const zone = w.zone; const setSurge = () => window.__isnap(zone, 2);
    setSurge(); const base = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }).influxMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ influxMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setSurge(); const s1 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.influxMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ influxMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setSurge(); const s2 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.influxMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ influxMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setSurge(); const s3 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.influxMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs CONFLUENCIA: composición diversa en la MISMA zona ⇒ confMul>0 ⇒ influxMul CEDE
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    setSurge(); const s4 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const confPeer = s4.confMulRested, confCeded = s4.influxMulRested;
    window.__dev.confluence({ enabled: false });
    // (e) vs LONG_WATCH: streak≥umbral en la MISMA zona ⇒ longWatchMul>0 ⇒ influxMul CEDE
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__ISNOW, push: { [zone]: { streak: 90, atMs: window.__ISNOW, present: 1 } } });
    setSurge(); const s5 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const lwPeer = s5.longWatchMulRested, lwCeded = s5.influxMulRested;
    window.__dev.longWatch({ enabled: false });
    // (f) vs FRONTIER: cobertura≥umbral en la MISMA zona ⇒ frontierMul>0 ⇒ influxMul CEDE (FRONTIER es la fuente inmediatamente superior)
    window.__dev.frontier({ enabled: true }); window.__dev.frontier({ nowMs: window.__ISNOW, push: { [zone]: { cover: 4, atMs: window.__ISNOW } } });
    setSurge(); const s6 = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }); const frPeer = s6.frontierMulRested, frCeded = s6.influxMulRested;
    window.__dev.frontier({ enabled: false });
    // (g) vs TERRITORY (⊥ safeRegen): NO afecta influxMul ⇒ intacto
    setSurge(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.influx({ nowMs: window.__ISNOW, toZone: zone }).influxMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, confPeer, confCeded, lwPeer, lwCeded, frPeer, frCeded, terrCoexist };
  });
  ok("12 PRECEDENCIA MÁXIMO ÚNICO: AFLUENCIA(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0; COEXISTE con TERRITORY(safeRegen ⊥)⇒0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 &&
     prec.frPeer > 0 && prec.frCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 13 0-regression: the 7 LIVE arc flags still served enabled:true in config.js; INFLUX_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const liveFlag = (name) => new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const darkFlag = new RegExp("export const INFLUX_SURGE\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"), fs: liveFlag("FRONTIER_SPREAD"), isDark: darkFlag };
  ok("13 ★ 0-REGRESIÓN: los 7 flags del arco LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD) served enabled:true; INFLUX_SURGE served false (DARK)",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && reg.lw && reg.fs && reg.isDark, JSON.stringify(reg));

  // 14 ★ 6-zone coverage: every INFLUX_SURGE.zones hosts an observable Afluencia (surge≥6 ⇒ T3)
  const cov = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const zones = window.__dev.influx().zones || []; const broken = [];
    for (const z of zones) {
      window.__dev.influx({ clear: true, nowMs: window.__ISNOW });
      const s = window.__dev.influx({ nowMs: window.__ISNOW, push: { [z]: { surge: 6, atMs: window.__ISNOW } }, toZone: z });
      if (!(s.zone === z && s.influxable && s.tier === 3 && s.influxMulRested > 0)) broken.push({ z, zone: s.zone, influxable: s.influxable, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("14 ★ AFLUENCIA 6 zonas: cada zona de INFLUX_SURGE.zones hospeda una Afluencia observable (surge≥6 ⇒ T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 15 render badge draws with feature ON — instrument ctx.fillText, count "Afluencia" draws (deterministic, position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0;
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Afluencia") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.influx({ enabled: false }); });
  await page.evaluate(() => { window.__ftCount = 0; });
  await sleep(240);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.influx({ enabled: true }); const w = window.__ipick(6); if (w) window.__dev.influx({ nowMs: window.__ISNOW, toZone: w.zone }); window.__ftCount = 0; });
  await sleep(280);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, conf: !!window.__dev.confluence, lw: !!window.__dev.longWatch, fr: !!window.__dev.frontier, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("15 render badge 'Afluencia' se DIBUJA con feature ON (fillText count>0) y NO con OFF (0) + arco hooks presentes + fps",
     ftOn > 0 && ftOff === 0 && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.conf && arc.lw && arc.fr && arc.ledger && fps >= 55,
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

  // page2 picks an influxable zone (surge 2 ⇒ T1); page1 applies the SAME snapshot+clock on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.influx({ enabled: true }); window.__iso(); return window.__ipick(2); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // baseline: both set surge 2, atMs=NOW, project at NOW ⇒ surge 2 ⇒ T1 identical
    const a = await page.evaluate((z) => { window.__dev.influx({ enabled: true }); window.__iso();
      window.__isnap(z, 2); return window.__dev.influx({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__isnap(z, 2); return window.__dev.influx({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    // SURGE UP: both push surge 6 ⇒ T3 on both
    const aUp = await page.evaluate((z) => { window.__isnap(z, 6); return window.__dev.influx({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    const bUp = await page2.evaluate((z) => { window.__isnap(z, 6); return window.__dev.influx({ nowMs: window.__ISNOW, toZone: z }); }, zone);
    // DECAY: re-snap surge 8, +30s ⇒ 4 ⇒ T2 on both (converges)
    const aDn = await page.evaluate((z) => { window.__isnap(z, 8); return window.__iat(z, 30); }, zone);
    const bDn = await page2.evaluate((z) => { window.__isnap(z, 8); return window.__iat(z, 30); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared surge/tier + B's Δ must stay intact
    const aOut = await page.evaluate(() => window.__dev.influx({ leave: true }));
    const bAfter = await page2.evaluate((z) => { window.__isnap(z, 8); return window.__iat(z, 30); }, zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aC: a.surge, bC: b.surge, aM: a.influxMulRested, bM: b.influxMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpC: aUp.surge, bUpC: bUp.surge, aUpM: aUp.influxMulRested, bUpM: bUp.influxMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnC: aDn.surge, bDnC: bDn.surge, aDnM: aDn.influxMulRested, bDnM: bDn.influxMulRested,
      aOutM: aOut.influxMulRested, aOutT: aOut.tier, bAfterC: bAfter.surge, bAfterT: bAfter.tier, bAfterM: bAfter.influxMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 1 && near(north.aC, north.bC) && near(north.aC, 2) && near(north.aM, north.bM) && near(north.aM, 0.05) &&   // baseline T1 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpC, north.bUpC) && near(north.aUpC, 6) && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&  // SURGE UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 2 && near(north.aDnC, north.bDnC) && near(north.aDnC, 4) && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.10) &&   // DECAY converges T2
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                                            // A leaves ⇒ Δ_A 0
    near(north.bAfterC, 4) && north.bAfterT === 2 && near(north.bAfterM, 0.10);                                                                                          // B + shared surge/tier intact
  ok("16 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO surge+reloj ⇒ surge/tier/buff IDÉNTICOS; flujo(T3)/decaer(T2) CONVERGE; A sale ⇒ Δ_A=0 pero surge/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2352 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
