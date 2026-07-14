// CAS-2356 — GE self-verify for MARCHA / CONVOY MARCH (DARK, CONVOY_MARCH.enabled:false). EVO mecánica #57 — PRIMER eje VECTORIAL/DIRECCIONAL de la serie.
// Eje FRESCO (NO repite #50-56, todos ESCALARES): NO reloj global (World Pulse #50), NO headcount/densidad (Congregación #51), NO footfall por celda (Sendero #52), NO variedad de
// clases (Confluencia #53), NO continuidad temporal (Vigilia #54), NO dispersión espacial (Expedición #55), NO tasa de llegada (Afluencia #56). Es COHERENCIA DIRECCIONAL de los
// vectores de VELOCIDAD: ¿la comunidad MARCHA JUNTA con rumbo común (convoy/caravana/migración)? El server suma los vectores de velocidad de los presentes EN MOVIMIENTO, compara
// |Σv| contra Σ|v| ⇒ coherencia c∈[0,1]; mientras ≥K se muevan con c≥umbral ACUMULA un `march` sostenido con DECAY, empuja { zona → { march, atMs } }; el cliente REFLEJA + PROYECTA
// al `now` compartido. Al cruzar umbrales (2/4/6 de marcha sostenida) la zona entra en Marcha por tiers y da a TODOS los presentes el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR (checks 5/8/9, no-negociable): la marcha es el RUMBO COMÚN INSTANTÁNEO del movimiento, no cuántos/dónde/desde-cuándo. N jugadores QUIETOS ⇒ movers 0 ⇒ NO abre
// (distingue de Congregación, que SÍ abriría por headcount N); N moviéndose en rumbos OPUESTOS/dispersos ⇒ |Σv|≈0 ⇒ c≈0 ⇒ NO abre (por muchos que sean); 1 solo moviéndose ⇒
// movers<K ⇒ NO abre; N con rumbo común sostenido ⇒ c=1 ⇒ abre. Prueba que el eje es DIRECCIÓN (vectorial), no densidad/composición/continuidad/dispersión/flujo/reloj.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO march {march,atMs} + MISMO reloj (nowMs) ⇒ ven march + tier + buff
// IDÉNTICOS byte-a-byte (0 desync). Sostener la marcha (march sube) y el decay al frenar CONVERGEN en ambos. Cualquier desync = sev-1. El passive es COMPARTIDO (no per-hero): A SALE
// físicamente de la zona ⇒ su Δ cae a 0 PERO el march/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 13): CONVOY_MARCH es la MÁS BAJA del canal restedMult (última fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE > CONGREGATION >
// WAYFARER > DIVERSE_COMPANY > LONG_WATCH > FRONTIER_SPREAD > INFLUX_SURGE — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco
// del canal está LIVE, para OBSERVAR el passive de Marcha en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.convoy (flip CONVOY_MARCH.enabled IN-MEMORY + inyección del snapshot {zona→{march,atMs}} / movement / coherenceProbe + nowMs/toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/confluence/longWatch/frontier/influx/territory/oath/saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Marcha").
//
// Checks:
//   1  boots to play, __dev.convoy + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): CONVOY_MARCH.enabled false AND G.convoy NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'convoy'/'convoyServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ COHERENCIA = función PURA (convoyCoherence vía coherenceProbe): 3 mismo rumbo⇒c=1/movers3; 2 opuestos⇒c=0/movers2; todos QUIETOS⇒movers0/c0; bajo-umbral⇒movers0; ortogonal (1,0)+(0,1)⇒c≈0.707.
//   6  TABLA de tiers = función PURA del MARCH: march→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; march negativo ⇒ clamped a 0/descartado.
//   8  ★ ACUMULADOR sostenido = función del MOVIMIENTO: convoy coherente (3 mismo rumbo) dt=3⇒march 3 (T1); dt=6⇒march 6 (T3) = accruePerSec·dt exacto.
//   9  ★ DIFERENCIADOR quietos/opuestos/solo vs convoy: 8 QUIETOS⇒march 0/tier 0/passive 0 (NO abre, ≠ Congregación); 8 OPUESTOS (c≈0)⇒0; 1 solo (movers<K)⇒0; 3 rumbo común⇒march≥2/tier≥1/passive>0.
//  10  ★ DECAY determinista 0-RNG: march baja por vida-media (march 8, +20s ⇒ 4 T2; +40s ⇒ 2 T1). Techo capMarch no interfiere.
//  11  PASSIVE compartido (aislado): peers OFF + march≥umbral + héroe EN la zona ⇒ convoyMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  12  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica convoyMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  13  PRECEDENCIA MÁXIMO ÚNICO: CONVOY(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 AND INFLUX⇒0; COEXISTE con TERRITORY(safeRegen ⊥).
//  14  ★ 0-REGRESIÓN: los 8 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE) siguen served enabled:true; CONVOY_MARCH served false (DARK).
//  15  ★ MARCHA 6 zonas: las 6 zonas de CONVOY_MARCH.zones hospedan una Marcha observable (march≥6 ⇒ T3) broken=[].
//  16  render badge "Marcha" se DIBUJA con la feature ON (ctx.fillText "Marcha" count>0) y NO con OFF (count 0) + arco regr + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO march+reloj ⇒ march/tier/buff IDÉNTICOS byte-a-byte; sostener(T3)/decaer(T2) CONVERGE;
//      A sale ⇒ Δ_A=0 PERO march/tier compartidos + Δ_B INTACTOS (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2356-convoy-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2356");
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

// vectores de prueba (rapidez > minSpeed 0.5 ⇒ cuenta como en movimiento)
const V = {
  same3: [{ vx: 2, vy: 0 }, { vx: 2, vy: 0 }, { vx: 2, vy: 0 }],   // 3 mismo rumbo ⇒ c=1
  opp2: [{ vx: 2, vy: 0 }, { vx: -2, vy: 0 }],                    // 2 opuestos ⇒ c=0
  still2: [{ vx: 0, vy: 0 }, { vx: 0, vy: 0 }],                   // quietos ⇒ movers 0
  below2: [{ vx: 0.2, vy: 0 }, { vx: 0.2, vy: 0 }],               // bajo umbral ⇒ movers 0
  ortho: [{ vx: 1, vy: 0 }, { vx: 0, vy: 1 }],                    // ortogonal ⇒ c=√2/2≈0.7071
  same8: Array.from({ length: 8 }, () => ({ vx: 1.5, vy: 1.5 })), // 8 mismo rumbo diagonal ⇒ c=1
  still8: Array.from({ length: 8 }, () => ({ vx: 0, vy: 0 })),    // 8 quietos ⇒ movers 0
  opp8: [...Array.from({ length: 4 }, () => ({ vx: 2, vy: 0 })), ...Array.from({ length: 4 }, () => ({ vx: -2, vy: 0 }))], // 8 opuestos ⇒ c=0
  one: [{ vx: 3, vy: 0 }],                                        // 1 solo moviéndose ⇒ movers 1 < K
};

// helper: desactiva los 10 peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE incl. INFLUX) para medir Marcha en AISLAMIENTO; y drivers de snapshot/proyección con reloj FIJO.
const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__CNOW = NOW;
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); window.__dev.frontier({ enabled: false }); window.__dev.influx({ enabled: false }); };
    // empuja el march crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ march == base exacto)
    window.__csnap = (zone, march) => { window.__dev.convoy({ clear: true, nowMs: window.__CNOW }); window.__dev.convoy({ nowMs: window.__CNOW, push: { [zone]: { march, atMs: window.__CNOW } } }); };
    // aplica MOVIMIENTO {vels,dt} en UNA zona (CLEAR antes ⇒ march = accruePerSec·dt si sostiene, o 0). Prueba coherencia/diferenciadores.
    window.__cmove = (zone, vels, dt) => { window.__dev.convoy({ clear: true, nowMs: window.__CNOW }); window.__dev.convoy({ nowMs: window.__CNOW, movement: { [zone]: { vels, dt } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__cat = (zone, elapsedSec) => window.__dev.convoy({ nowMs: window.__CNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un march `march` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (convoyable + zona coincide).
    window.__cpick = (march) => {
      window.__dev.convoy({ enabled: true });
      const zones = window.__dev.convoy().zones || [];
      for (const z of zones) {
        window.__dev.convoy({ clear: true, nowMs: window.__CNOW });
        const s = window.__dev.convoy({ nowMs: window.__CNOW, push: { [z]: { march, atMs: window.__CNOW } }, toZone: z });
        if (s.zone === z && s.convoyable) return { zone: z, march: s.march, tier: s.tier, boost: s.convoyMulRested };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.convoy && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.convoy + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.convoy never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.convoy());
  ok("2 byte-id OFF (fresh boot): CONVOY_MARCH.enabled false AND G.convoy NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.march === 0 && dark.boost === 0 && dark.tag === "" && dark.marchMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} march=${dark.march} boost=${dark.boost} tag="${dark.tag}" marchMap=${JSON.stringify(dark.marchMap)}`);

  // 3 save OFF has no 'convoy'/'convoyServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'convoy'/'convoyServer' key in save blob (estado 100% derivado/transitorio)", !/"convoy(Server)?"/.test(saveOff) && !/convoyServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.convoy({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.convoy({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 ★ coherence = pure fn (convoyCoherence via probe): same⇒c1; opposite⇒c0; stationary⇒movers0; below-threshold⇒movers0; orthogonal⇒0.7071
  const coh = await page.evaluate((V) => {
    window.__dev.convoy({ enabled: true });
    const P = (vels, minSpeed) => window.__dev.convoy({ coherenceProbe: (minSpeed != null ? { vels, minSpeed } : { vels }) }).probe;
    return { same: P(V.same3), opp: P(V.opp2), still: P(V.still2), below: P(V.below2), ortho: P(V.ortho) };
  }, V);
  ok("5 ★ COHERENCIA = función PURA (convoyCoherence): 3 mismo rumbo⇒c=1/movers3; 2 opuestos⇒c=0/movers2; QUIETOS⇒movers0; bajo-umbral⇒movers0; ortogonal⇒c≈0.7071",
     coh.same.movers === 3 && near(coh.same.c, 1) && coh.opp.movers === 2 && near(coh.opp.c, 0) &&
     coh.still.movers === 0 && near(coh.still.c, 0) && coh.below.movers === 0 && coh.ortho.movers === 2 && near(coh.ortho.c, 0.7071, 1e-3),
     JSON.stringify(coh));

  // 6 tier table = pure fn of MARCH: march→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(6); if (!w) return { bad: true };   // land in a convoyable zone at max tier
    const zone = w.zone; const out = [];
    for (const m of [1, 2, 4, 6, 8]) {
      window.__csnap(zone, m);
      const vm = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone });
      out.push({ m, march: vm.march, tier: vm.tier, boost: vm.convoyMulRested });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.march, r.m) && r.tier === expTier[r.m] && near(r.boost, expBoost[r.m]));
  ok("6 TABLA de tiers = función PURA del MARCH: march→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative march)
  const refl = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const zones = window.__dev.convoy().zones; const z0 = zones[0];
    window.__dev.convoy({ clear: true, nowMs: window.__CNOW });
    window.__dev.convoy({ nowMs: window.__CNOW, push: { [z0]: { march: 4, atMs: window.__CNOW }, town: { march: 6, atMs: window.__CNOW } } });
    const s = window.__dev.convoy({ nowMs: window.__CNOW, toZone: z0 });
    window.__dev.convoy({ clear: true, nowMs: window.__CNOW });
    window.__dev.convoy({ nowMs: window.__CNOW, push: { [z0]: { march: -5, atMs: window.__CNOW } } });
    const neg = window.__dev.convoy({ nowMs: window.__CNOW, toZone: z0 });
    return { z0, valid: s.march, marchMap: s.marchMap, negMarch: neg.march, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.marchMap || {})) && refl.negMarch === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida refleja march; zona fuera de `zones` DESCARTADA; march negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accrual = fn of MOVEMENT: coherent convoy (3 same-heading) dt=3 ⇒ march 3 (T1); dt=6 ⇒ march 6 (T3) = accruePerSec·dt
  const acc = await page.evaluate((V) => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__cmove(zone, V.same3, 3);
    const a = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone });
    window.__cmove(zone, V.same3, 6);
    const b = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone });
    return { zone, aMarch: a.march, aTier: a.tier, bMarch: b.march, bTier: b.tier };
  }, V);
  ok("8 ★ ACUMULADOR sostenido = función del MOVIMIENTO: convoy coherente (3 mismo rumbo) dt=3⇒march 3 (T1); dt=6⇒march 6 (T3) = accruePerSec·dt exacto",
     !acc.bad && near(acc.aMarch, 3) && acc.aTier === 1 && near(acc.bMarch, 6) && acc.bTier === 3, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — stationary / opposite / lone do NOT open; coherent convoy opens
  const diff = await page.evaluate((V) => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (vels, dt) => { window.__cmove(zone, vels, dt); const s = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); return { march: s.march, tier: s.tier, mul: s.convoyMulRested }; };
    return {
      zone,
      still: read(V.still8, 6),   // 8 QUIETOS ⇒ movers 0 ⇒ NO abre (≠ Congregación abriría por headcount 8)
      opp: read(V.opp8, 6),       // 8 OPUESTOS ⇒ c≈0 ⇒ NO abre
      lone: read(V.one, 6),       // 1 solo (movers<K) ⇒ NO abre
      convoy: read(V.same3, 4),   // 3 rumbo común dt=4 ⇒ march 4 ⇒ T2 ⇒ passive>0
    };
  }, V);
  ok("9 ★ DIFERENCIADOR quietos/opuestos/solo vs convoy: 8 QUIETOS⇒0 (NO abre, ≠ Congregación); 8 OPUESTOS (c≈0)⇒0; 1 solo (movers<K)⇒0; 3 rumbo común⇒march≥2/tier≥1/passive>0",
     !diff.bad && near(diff.still.march, 0) && diff.still.tier === 0 && diff.still.mul === 0 &&
     near(diff.opp.march, 0) && diff.opp.tier === 0 && near(diff.lone.march, 0) && diff.lone.tier === 0 &&
     diff.convoy.march >= 2 && diff.convoy.tier >= 1 && diff.convoy.mul > 0, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life (20s)
  const decay = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__csnap(zone, 8);                  // base march 8 (T3)
    const at0 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone });
    window.__csnap(zone, 8);
    const hl1 = window.__cat(zone, 20);       // +20s (1 vida-media) ⇒ 4 ⇒ T2
    window.__csnap(zone, 8);
    const hl2 = window.__cat(zone, 40);       // +40s (2 vidas-media) ⇒ 2 ⇒ T1
    return { zone, base: at0.march, baseT: at0.tier, hl1: hl1.march, hl1T: hl1.tier, hl2: hl2.march, hl2T: hl2.tier };
  });
  ok("10 ★ DECAY determinista 0-RNG: march baja por vida-media (base 8⇒T3; +20s⇒4 T2; +40s⇒2 T1)",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.hl1, 4) && decay.hl1T === 2 && near(decay.hl2, 2) && decay.hl2T === 1, JSON.stringify(decay));

  // 11 passive isolated: in-zone march≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(4); if (!w) return { bad: true };          // march 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.convoy({ nowMs: window.__CNOW, toZone: w.zone });
    const out = window.__dev.convoy({ leave: true });
    return { zone: w.zone, inMul: inz.convoyMulRested, inTier: inz.tier, inMarch: inz.march, outMul: out.convoyMulRested, outTier: out.tier };
  });
  ok("11 PASSIVE compartido (aislado): héroe EN la zona con march≥umbral ⇒ convoyMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inMarch, 4) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /convoyMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__cpick(2); if (!w) return { bad: true };          // march 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.convoy({ nowMs: window.__CNOW, toZone: w.zone }).convoyMulRested;
    window.__dev.convoy({ enabled: false });
    const s = window.__dev.convoy({ nowMs: window.__CNOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.convoyMulRested, tag: s.tag };
  });
  ok("12 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma convoyMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 13 precedence: CONVOY cedes to STANDINGS + CONGREGATION + WAYFARER + CONFLUENCE + LONG_WATCH + FRONTIER + INFLUX (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__cpick(2); if (!w) return { bad: true };          // base sin peers ⇒ 0.05
    const zone = w.zone; const setMarch = () => window.__csnap(zone, 2);
    setMarch(); const base = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }).convoyMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ convoyMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setMarch(); const s1 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.convoyMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ convoyMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setMarch(); const s2 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.convoyMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ convoyMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setMarch(); const s3 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.convoyMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs CONFLUENCIA: composición diversa en la MISMA zona ⇒ confMul>0 ⇒ convoyMul CEDE
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    setMarch(); const s4 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const confPeer = s4.confMulRested, confCeded = s4.convoyMulRested;
    window.__dev.confluence({ enabled: false });
    // (e) vs LONG_WATCH: streak≥umbral en la MISMA zona ⇒ longWatchMul>0 ⇒ convoyMul CEDE
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__CNOW, push: { [zone]: { streak: 90, atMs: window.__CNOW, present: 1 } } });
    setMarch(); const s5 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const lwPeer = s5.longWatchMulRested, lwCeded = s5.convoyMulRested;
    window.__dev.longWatch({ enabled: false });
    // (f) vs FRONTIER: cobertura≥umbral en la MISMA zona ⇒ frontierMul>0 ⇒ convoyMul CEDE
    window.__dev.frontier({ enabled: true }); window.__dev.frontier({ nowMs: window.__CNOW, push: { [zone]: { cover: 4, atMs: window.__CNOW } } });
    setMarch(); const s6 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const frPeer = s6.frontierMulRested, frCeded = s6.convoyMulRested;
    window.__dev.frontier({ enabled: false });
    // (g) vs INFLUX: surge≥umbral en la MISMA zona ⇒ influxMul>0 ⇒ convoyMul CEDE (INFLUX es la fuente inmediatamente superior)
    window.__dev.influx({ enabled: true }); window.__dev.influx({ clear: true, nowMs: window.__CNOW }); window.__dev.influx({ nowMs: window.__CNOW, push: { [zone]: { surge: 6, atMs: window.__CNOW } } });
    setMarch(); const s7 = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }); const inPeer = s7.influxMulRested, inCeded = s7.convoyMulRested;
    window.__dev.influx({ enabled: false });
    // (h) vs TERRITORY (⊥ safeRegen): NO afecta convoyMul ⇒ intacto
    setMarch(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.convoy({ nowMs: window.__CNOW, toZone: zone }).convoyMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, confPeer, confCeded, lwPeer, lwCeded, frPeer, frCeded, inPeer, inCeded, terrCoexist };
  });
  ok("13 PRECEDENCIA MÁXIMO ÚNICO: MARCHA(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 AND INFLUX⇒0; COEXISTE con TERRITORY(safeRegen ⊥)⇒0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 &&
     prec.frPeer > 0 && prec.frCeded === 0 && prec.inPeer > 0 && prec.inCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 14 0-regression: the 8 LIVE arc flags still served enabled:true in config.js; CONVOY_MARCH served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const liveFlag = (name) => new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const darkFlag = new RegExp("export const CONVOY_MARCH\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"), fs: liveFlag("FRONTIER_SPREAD"), inf: liveFlag("INFLUX_SURGE"), isDark: darkFlag };
  ok("14 ★ 0-REGRESIÓN: los 8 flags del arco LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE) served enabled:true; CONVOY_MARCH served false (DARK)",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && reg.lw && reg.fs && reg.inf && reg.isDark, JSON.stringify(reg));

  // 15 ★ 6-zone coverage: every CONVOY_MARCH.zones hosts an observable Marcha (march≥6 ⇒ T3)
  const cov = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const zones = window.__dev.convoy().zones || []; const broken = [];
    for (const z of zones) {
      window.__dev.convoy({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.convoy({ nowMs: window.__CNOW, push: { [z]: { march: 6, atMs: window.__CNOW } }, toZone: z });
      if (!(s.zone === z && s.convoyable && s.tier === 3 && s.convoyMulRested > 0)) broken.push({ z, zone: s.zone, convoyable: s.convoyable, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("15 ★ MARCHA 6 zonas: cada zona de CONVOY_MARCH.zones hospeda una Marcha observable (march≥6 ⇒ T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 16 render badge draws with feature ON — instrument ctx.fillText, count "Marcha" draws (deterministic, position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0;
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Marcha") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.convoy({ enabled: false }); });
  await page.evaluate(() => { window.__ftCount = 0; });
  await sleep(240);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.convoy({ enabled: true }); const w = window.__cpick(6); if (w) window.__dev.convoy({ nowMs: window.__CNOW, toZone: w.zone }); window.__ftCount = 0; });
  await sleep(280);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, conf: !!window.__dev.confluence, lw: !!window.__dev.longWatch, fr: !!window.__dev.frontier, inf: !!window.__dev.influx, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("16 render badge 'Marcha' se DIBUJA con feature ON (fillText count>0) y NO con OFF (0) + arco hooks presentes + fps",
     ftOn > 0 && ftOff === 0 && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.conf && arc.lw && arc.fr && arc.inf && arc.ledger && fps >= 55,
     `ftOff=${ftOff} ftOn=${ftOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 17 ★ NORTH STAR — 2-client convergence (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installPick(page2);

  // page2 picks a convoyable zone (march 2 ⇒ T1); page1 applies the SAME snapshot+clock on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.convoy({ enabled: true }); window.__iso(); return window.__cpick(2); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // baseline: both set march 2, atMs=NOW, project at NOW ⇒ march 2 ⇒ T1 identical
    const a = await page.evaluate((z) => { window.__dev.convoy({ enabled: true }); window.__iso();
      window.__csnap(z, 2); return window.__dev.convoy({ nowMs: window.__CNOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__csnap(z, 2); return window.__dev.convoy({ nowMs: window.__CNOW, toZone: z }); }, zone);
    // SUSTAIN UP: both push march 6 ⇒ T3 on both
    const aUp = await page.evaluate((z) => { window.__csnap(z, 6); return window.__dev.convoy({ nowMs: window.__CNOW, toZone: z }); }, zone);
    const bUp = await page2.evaluate((z) => { window.__csnap(z, 6); return window.__dev.convoy({ nowMs: window.__CNOW, toZone: z }); }, zone);
    // DECAY: re-snap march 8, +20s ⇒ 4 ⇒ T2 on both (converges)
    const aDn = await page.evaluate((z) => { window.__csnap(z, 8); return window.__cat(z, 20); }, zone);
    const bDn = await page2.evaluate((z) => { window.__csnap(z, 8); return window.__cat(z, 20); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared march/tier + B's Δ must stay intact
    const aOut = await page.evaluate(() => window.__dev.convoy({ leave: true }));
    const bAfter = await page2.evaluate((z) => { window.__csnap(z, 8); return window.__cat(z, 20); }, zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aC: a.march, bC: b.march, aM: a.convoyMulRested, bM: b.convoyMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpC: aUp.march, bUpC: bUp.march, aUpM: aUp.convoyMulRested, bUpM: bUp.convoyMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnC: aDn.march, bDnC: bDn.march, aDnM: aDn.convoyMulRested, bDnM: bDn.convoyMulRested,
      aOutM: aOut.convoyMulRested, aOutT: aOut.tier, bAfterC: bAfter.march, bAfterT: bAfter.tier, bAfterM: bAfter.convoyMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 1 && near(north.aC, north.bC) && near(north.aC, 2) && near(north.aM, north.bM) && near(north.aM, 0.05) &&   // baseline T1 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpC, north.bUpC) && near(north.aUpC, 6) && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&  // SUSTAIN UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 2 && near(north.aDnC, north.bDnC) && near(north.aDnC, 4) && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.10) &&   // DECAY converges T2
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                                            // A leaves ⇒ Δ_A 0
    near(north.bAfterC, 4) && north.bAfterT === 2 && near(north.bAfterM, 0.10);                                                                                          // B + shared march/tier intact
  ok("17 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO march+reloj ⇒ march/tier/buff IDÉNTICOS; sostener(T3)/decaer(T2) CONVERGE; A sale ⇒ Δ_A=0 pero march/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2356 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
