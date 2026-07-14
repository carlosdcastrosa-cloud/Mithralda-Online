// CAS-2347 — GE self-verify for EXPEDICIÓN / FRONTIER SPREAD (DARK, FRONTIER_SPREAD.enabled:false). EVO mecánica #55.
// Eje FRESCO (NO repite #50-54): NO reloj global (World Pulse #50), NO headcount/densidad (Congregación #51), NO footfall por celda (Sendero #52), NO variedad de clases
// (Confluencia #53), NO continuidad temporal (Vigilia #54). Es DISPERSIÓN ESPACIAL: cuán ESPARCIDA está la comunidad en una zona. El server agrupa a los presentes en
// SUB-CELDAS COARSE (mismo grid que Sendero) y cuenta el nº de sub-celdas DISTINTAS ocupadas (= cobertura/spread); empuja { zona → { cover, atMs } }; el cliente lo REFLEJA
// y lo PROYECTA al `now` compartido con DECAY determinista. Al cruzar umbrales (2/3/4 sub-celdas distintas) la zona entra en Expedición por tiers y da a TODOS los presentes
// el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR (checks 5/8, no-negociable): la cobertura es función de CÓMO se REPARTEN en el ESPACIO, no del headcount. 1 jugador ⇒ cover 1 ⇒ NO abre; N jugadores
// AMONTONADOS en la MISMA sub-celda ⇒ cover 1 ⇒ NO abre (distingue de Congregación, que SÍ abriría por headcount); N jugadores REPARTIDOS en ≥2 sub-celdas ⇒ abre el tier.
// Premia repartirse / sostener frontera en vez de amontonarse. Prueba que el eje es DISPERSIÓN, no densidad/composición/continuidad/reloj.
//
// North Star (check 16, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMA cobertura {cover,atMs} + MISMO reloj (nowMs) ⇒ ven cover +
// tier + buff IDÉNTICOS byte-a-byte (0 desync). Repartirse (cover sube) y decaer CONVERGEN en ambos. Cualquier desync de cover/tier/buff = sev-1. El passive es COMPARTIDO
// (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO el cover/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 12): FRONTIER_SPREAD es la MÁS BAJA del canal restedMult (10ª fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION >
// WAYFARER > DIVERSE_COMPANY > LONG_WATCH — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del canal está LIVE, para
// OBSERVAR el passive de Expedición en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.frontier (flip FRONTIER_SPREAD.enabled IN-MEMORY + inyección del snapshot {zona→{cover,atMs}} / occupants + nowMs/toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/confluence/longWatch/territory/oath/saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Expedición").
//
// Checks:
//   1  boots to play, __dev.frontier + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): FRONTIER_SPREAD.enabled false AND G.frontier NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'frontier'/'frontierServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ COBERTURA = función PURA del ESPACIO (frontierCoverage vía occupants): 1 pos ⇒ 1; 5 AMONTONADOS en la misma sub-celda ⇒ 1; repartidos en 2/3/4 sub-celdas ⇒ 2/3/4.
//   6  TABLA de tiers = función PURA del COVER: cover→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; cover negativo ⇒ clamped a 0/descartado.
//   8  ★ DIFERENCIADOR crammed vs spread: N AMONTONADOS (misma sub-celda) ⇒ cover 1 ⇒ tier 0 NO abre (≠ Congregación); N REPARTIDOS ≥2 ⇒ abre el tier + passive>0.
//   9  ★ DECAY determinista 0-RNG: cover baja por vida-media (cover 4, +45s ⇒ 2 aún T1; +90s ⇒ 1 ⇒ T0). Techo capCover no interfiere.
//  10  PASSIVE compartido (aislado): peers OFF + cover≥umbral + héroe EN la zona ⇒ frontierMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  11  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica frontierMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  12  PRECEDENCIA MÁXIMO ÚNICO: FRONTIER(0.05) CEDE a STANDINGS ⇒ 0 AND CONGREGATION ⇒ 0 AND WAYFARER ⇒ 0 AND CONFLUENCIA ⇒ 0 AND LONG_WATCH ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥).
//  13  ★ 0-REGRESIÓN: los 6 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH) siguen served enabled:true; FRONTIER_SPREAD served false (DARK).
//  14  ★ COBERTURA 6 zonas: las 6 zonas de FRONTIER_SPREAD.zones hospedan una Expedición observable (cover≥4 ⇒ T3) broken=[].
//  15  render badge "Expedición" se DIBUJA con la feature ON (ctx.fillText "Expedición" count>0) y NO con OFF (count 0) + arco regr + fps.
//  16  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMA cover+reloj ⇒ cover/tier/buff IDÉNTICOS byte-a-byte; repartirse(T3)/decaer(T1) CONVERGE;
//      A sale ⇒ Δ_A=0 PERO cover/tier compartidos + Δ_B INTACTOS (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2347-frontier-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2347");
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

// helper: desactiva los 8 peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE) para medir Expedición en AISLAMIENTO; y drivers de snapshot/proyección con reloj FIJO.
const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__FSNOW = NOW;
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); };
    // empuja la cobertura cruda de UNA zona (atMs = NOW ⇒ dtMs=0 al proyectar a NOW ⇒ cover == base exacto)
    window.__fsnap = (zone, cover) => { window.__dev.frontier({ nowMs: window.__FSNOW, push: { [zone]: { cover, atMs: window.__FSNOW } } }); };
    // empuja OCCUPANTS (posiciones) de UNA zona ⇒ el server agrupa en sub-celdas ⇒ cover=|distintas| (prueba crammed vs spread)
    window.__focc = (zone, occ) => { window.__dev.frontier({ nowMs: window.__FSNOW, occupants: { [zone]: occ } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__fat = (zone, elapsedSec) => window.__dev.frontier({ nowMs: window.__FSNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un cover `cover` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (frontierable + zona coincide).
    window.__fpick = (cover) => {
      window.__dev.frontier({ enabled: true });
      const zones = window.__dev.frontier().zones || [];
      for (const z of zones) {
        const s = window.__dev.frontier({ nowMs: window.__FSNOW, push: { [z]: { cover, atMs: window.__FSNOW } }, toZone: z });
        if (s.zone === z && s.frontierable) return { zone: z, cover: s.cover, tier: s.tier, boost: s.frontierMulRested };
      }
      return null;
    };
  }, NOW);
}

// posiciones AMONTONADAS en 1 sola sub-celda (cellSize 128): todas floor(x/128)=0, floor(y/128)=0
const CRAMMED = [[10, 10], [50, 50], [100, 100], [120, 20], [30, 110]];
// posiciones REPARTIDAS en K sub-celdas distintas (x = 0,200,400,600 ⇒ celdas 0,1,3,4)
const spread = (k) => [[0, 0], [200, 0], [400, 0], [600, 0]].slice(0, k);
// 5 jugadores repartidos en EXACTAMENTE 2 sub-celdas (3 en celda 0, 2 en celda 1)
const SPREAD2 = [[0, 0], [10, 10], [50, 50], [200, 0], [210, 10]];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.frontier && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.frontier + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.frontier never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.frontier());
  ok("2 byte-id OFF (fresh boot): FRONTIER_SPREAD.enabled false AND G.frontier NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.cover === 0 && dark.boost === 0 && dark.tag === "" && dark.coverMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} cover=${dark.cover} boost=${dark.boost} tag="${dark.tag}" coverMap=${JSON.stringify(dark.coverMap)}`);

  // 3 save OFF has no 'frontier'/'frontierServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'frontier'/'frontierServer' key in save blob (estado 100% derivado/transitorio)", !/"frontier(Server)?"/.test(saveOff) && !/frontierServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.frontier({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.frontier({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 ★ coverage = pure fn of SPACE (via occupants): 1⇒1, crammed 5⇒1, spread 2/3/4 ⇒ 2/3/4
  const covfn = await page.evaluate((args) => {
    const { CRAMMED, s2, s3, s4 } = args;
    window.__dev.frontier({ enabled: true }); window.__iso();
    const zones = window.__dev.frontier().zones || []; const z = zones[0];
    const read = (occ) => { window.__focc(z, occ); return window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z }).cover; };
    return { one: read([[7, 7]]), crammed: read(CRAMMED), sp2: read(s2), sp3: read(s3), sp4: read(s4) };
  }, { CRAMMED, s2: spread(2), s3: spread(3), s4: spread(4) });
  ok("5 ★ COBERTURA = función PURA del ESPACIO (frontierCoverage): 1 pos⇒1; 5 AMONTONADOS en la misma sub-celda⇒1; repartidos 2/3/4 sub-celdas⇒2/3/4",
     near(covfn.one, 1) && near(covfn.crammed, 1) && near(covfn.sp2, 2) && near(covfn.sp3, 3) && near(covfn.sp4, 4), JSON.stringify(covfn));

  // 6 tier table = pure fn of COVER: cover→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__fpick(4); if (!w) return { bad: true };   // land in a frontierable zone at max tier
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 3, 4, 5]) {
      window.__fsnap(zone, c);
      const vm = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone });
      out.push({ c, cover: vm.cover, tier: vm.tier, boost: vm.frontierMulRested });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 3 };
  const expBoost = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.cover, r.c) && r.tier === expTier[r.c] && near(r.boost, expBoost[r.c]));
  ok("6 TABLA de tiers = función PURA del COVER: cover→tier (1→T0,2→T1,3→T2,4→T3,5→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative cover)
  const refl = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const zones = window.__dev.frontier().zones; const z0 = zones[0];
    window.__dev.frontier({ nowMs: window.__FSNOW, push: { [z0]: { cover: 3, atMs: window.__FSNOW }, town: { cover: 4, atMs: window.__FSNOW } } });
    const s = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z0 });
    window.__dev.frontier({ nowMs: window.__FSNOW, push: { [z0]: { cover: -5, atMs: window.__FSNOW } } });
    const neg = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z0 });
    return { z0, valid: s.cover, coverMap: s.coverMap, negCover: neg.cover, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 3) && !("town" in (refl.coverMap || {})) && refl.negCover === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida refleja cover; zona fuera de `zones` DESCARTADA; cover negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ DIFFERENTIATOR — crammed (same sub-cell) does NOT open; spread ≥2 opens
  const diff = await page.evaluate((args) => {
    const { CRAMMED, SPREAD2 } = args;
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    // N crammed in ONE sub-cell ⇒ cover 1 ⇒ tier 0 ⇒ passive 0 (Congregación SÍ abriría por headcount 5)
    window.__focc(zone, CRAMMED);
    const cr = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone });
    // 5 players spread across 2 sub-cells ⇒ cover 2 ⇒ tier 1 ⇒ passive>0
    window.__focc(zone, SPREAD2);
    const sp = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone });
    return { zone, crCover: cr.cover, crTier: cr.tier, crMul: cr.frontierMulRested, spCover: sp.cover, spTier: sp.tier, spMul: sp.frontierMulRested };
  }, { CRAMMED, SPREAD2 });
  ok("8 ★ DIFERENCIADOR crammed vs spread: 5 AMONTONADOS (misma sub-celda) ⇒ cover 1 / tier 0 / passive 0 (NO abre, ≠ Congregación); 5 REPARTIDOS en 2 sub-celdas ⇒ cover 2 / tier 1 / passive>0",
     !diff.bad && near(diff.crCover, 1) && diff.crTier === 0 && diff.crMul === 0 && near(diff.spCover, 2) && diff.spTier === 1 && diff.spMul > 0, JSON.stringify(diff));

  // 9 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__fsnap(zone, 4);                 // base cover 4 (T3)
    const at0 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone });
    window.__fsnap(zone, 4);
    const hl1 = window.__fat(zone, 45);      // +45s (1 vida-media) ⇒ 2 ⇒ T1
    window.__fsnap(zone, 4);
    const hl2 = window.__fat(zone, 90);      // +90s (2 vidas-media) ⇒ 1 ⇒ T0
    return { zone, base: at0.cover, baseT: at0.tier, hl1: hl1.cover, hl1T: hl1.tier, hl2: hl2.cover, hl2T: hl2.tier };
  });
  ok("9 ★ DECAY determinista 0-RNG: cover baja por vida-media (base 4⇒T3; +45s⇒2 aún T1; +90s⇒1⇒T0)",
     !decay.bad && near(decay.base, 4) && decay.baseT === 3 && near(decay.hl1, 2) && decay.hl1T === 1 && near(decay.hl2, 1) && decay.hl2T === 0, JSON.stringify(decay));

  // 10 passive isolated: in-zone cover≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__fpick(3); if (!w) return { bad: true };          // cover 3 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: w.zone });
    const out = window.__dev.frontier({ leave: true });
    return { zone: w.zone, inMul: inz.frontierMulRested, inTier: inz.tier, inCover: inz.cover, outMul: out.frontierMulRested, outTier: out.tier };
  });
  ok("10 PASSIVE compartido (aislado): héroe EN la zona con cover≥umbral ⇒ frontierMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inCover, 3) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 11 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /frontierMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__fpick(2); if (!w) return { bad: true };          // cover 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: w.zone }).frontierMulRested;
    window.__dev.frontier({ enabled: false });
    const s = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.frontierMulRested, tag: s.tag };
  });
  ok("11 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma frontierMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 12 precedence: FRONTIER cedes to STANDINGS + CONGREGATION + WAYFARER + CONFLUENCE + LONG_WATCH (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__fpick(2); if (!w) return { bad: true };          // base sin peers ⇒ 0.05
    const zone = w.zone; const setCover = () => window.__fsnap(zone, 2);
    setCover(); const base = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }).frontierMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ frontierMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setCover(); const s1 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.frontierMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ frontierMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setCover(); const s2 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.frontierMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ frontierMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setCover(); const s3 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.frontierMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs CONFLUENCIA: composición diversa en la MISMA zona ⇒ confMul>0 ⇒ frontierMul CEDE
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    setCover(); const s4 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }); const confPeer = s4.confMulRested, confCeded = s4.frontierMulRested;
    window.__dev.confluence({ enabled: false });
    // (e) vs LONG_WATCH: streak≥umbral en la MISMA zona ⇒ longWatchMul>0 ⇒ frontierMul CEDE
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__FSNOW, push: { [zone]: { streak: 90, atMs: window.__FSNOW, present: 1 } } });
    setCover(); const s5 = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }); const lwPeer = s5.longWatchMulRested, lwCeded = s5.frontierMulRested;
    window.__dev.longWatch({ enabled: false });
    // (f) vs TERRITORY (⊥ safeRegen): NO afecta frontierMul ⇒ intacto
    setCover(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.frontier({ nowMs: window.__FSNOW, toZone: zone }).frontierMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, confPeer, confCeded, lwPeer, lwCeded, terrCoexist };
  });
  ok("12 PRECEDENCIA MÁXIMO ÚNICO: EXPEDICIÓN(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0; COEXISTE con TERRITORY(safeRegen ⊥)⇒0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 13 0-regression: the 6 LIVE arc flags still served enabled:true in config.js; FRONTIER_SPREAD served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const liveFlag = (name) => new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const darkFlag = new RegExp("export const FRONTIER_SPREAD\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"), fsDark: darkFlag };
  ok("13 ★ 0-REGRESIÓN: los 6 flags del arco LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH) served enabled:true; FRONTIER_SPREAD served false (DARK)",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && reg.lw && reg.fsDark, JSON.stringify(reg));

  // 14 ★ 6-zone coverage: every FRONTIER_SPREAD.zones hosts an observable Expedición (cover≥4 ⇒ T3)
  const cov = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const zones = window.__dev.frontier().zones || []; const broken = [];
    for (const z of zones) {
      const s = window.__dev.frontier({ nowMs: window.__FSNOW, push: { [z]: { cover: 4, atMs: window.__FSNOW } }, toZone: z });
      if (!(s.zone === z && s.frontierable && s.tier === 3 && s.frontierMulRested > 0)) broken.push({ z, zone: s.zone, frontierable: s.frontierable, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("14 ★ COBERTURA 6 zonas: cada zona de FRONTIER_SPREAD.zones hospeda una Expedición observable (cover≥4 ⇒ T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 15 render badge draws with feature ON — instrument ctx.fillText, count "Expedición" draws (deterministic, position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0;
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Expedición") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.frontier({ enabled: false }); });
  await page.evaluate(() => { window.__ftCount = 0; });
  await sleep(240);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.frontier({ enabled: true }); const w = window.__fpick(4); if (w) window.__dev.frontier({ nowMs: window.__FSNOW, toZone: w.zone }); window.__ftCount = 0; });
  await sleep(280);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, conf: !!window.__dev.confluence, lw: !!window.__dev.longWatch, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("15 render badge 'Expedición' se DIBUJA con feature ON (fillText count>0) y NO con OFF (0) + arco hooks presentes + fps",
     ftOn > 0 && ftOff === 0 && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.conf && arc.lw && arc.ledger && fps >= 55,
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

  // page2 picks a frontierable zone (cover 2 ⇒ T1); page1 applies the SAME snapshot+clock on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.frontier({ enabled: true }); window.__iso(); return window.__fpick(2); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // baseline: both set cover 2, atMs=NOW, project at NOW ⇒ cover 2 ⇒ T1 identical
    const a = await page.evaluate((z) => { window.__dev.frontier({ enabled: true }); window.__iso();
      window.__fsnap(z, 2); return window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__fsnap(z, 2); return window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z }); }, zone);
    // SPREAD UP: both push cover 4 ⇒ T3 on both
    const aUp = await page.evaluate((z) => { window.__fsnap(z, 4); return window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z }); }, zone);
    const bUp = await page2.evaluate((z) => { window.__fsnap(z, 4); return window.__dev.frontier({ nowMs: window.__FSNOW, toZone: z }); }, zone);
    // DECAY: re-snap cover 4, +45s ⇒ 2 ⇒ T1 on both (converges)
    const aDn = await page.evaluate((z) => { window.__fsnap(z, 4); return window.__fat(z, 45); }, zone);
    const bDn = await page2.evaluate((z) => { window.__fsnap(z, 4); return window.__fat(z, 45); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared cover/tier + B's Δ must stay intact
    const aOut = await page.evaluate(() => window.__dev.frontier({ leave: true }));
    const bAfter = await page2.evaluate((z) => { window.__fsnap(z, 4); return window.__fat(z, 45); }, zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aC: a.cover, bC: b.cover, aM: a.frontierMulRested, bM: b.frontierMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpC: aUp.cover, bUpC: bUp.cover, aUpM: aUp.frontierMulRested, bUpM: bUp.frontierMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnC: aDn.cover, bDnC: bDn.cover, aDnM: aDn.frontierMulRested, bDnM: bDn.frontierMulRested,
      aOutM: aOut.frontierMulRested, aOutT: aOut.tier, bAfterC: bAfter.cover, bAfterT: bAfter.tier, bAfterM: bAfter.frontierMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 1 && near(north.aC, north.bC) && near(north.aC, 2) && near(north.aM, north.bM) && near(north.aM, 0.05) &&   // baseline T1 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpC, north.bUpC) && near(north.aUpC, 4) && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&  // SPREAD UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 1 && near(north.aDnC, north.bDnC) && near(north.aDnC, 2) && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&   // DECAY converges T1
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                                            // A leaves ⇒ Δ_A 0
    near(north.bAfterC, 2) && north.bAfterT === 1 && near(north.bAfterM, 0.05);                                                                                          // B + shared cover/tier intact
  ok("16 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMA cover+reloj ⇒ cover/tier/buff IDÉNTICOS; repartirse(T3)/decaer(T1) CONVERGE; A sale ⇒ Δ_A=0 pero cover/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2347 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
