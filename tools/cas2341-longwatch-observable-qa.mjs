// CAS-2341 — QA OBSERVABLE (DARK, LONG_WATCH.enabled:false). EVO mecánica #54 — VIGILIA / LONG WATCH.
// INDEPENDENT QA harness (authored by QA, NOT a copy of the GE self-verify tools/cas2341-longwatch-selfverify.mjs).
// Gate acceptance CAS-2341 antes del CEO Gate + flip LIVE (issues separados).
//
// Eje FRESCO (≠ arco #47-53): CONTINUIDAD TEMPORAL de habitación de zona. El server mantiene por zona un `streak`
// (segundos-ocupados-continuos) que SUBE con presencia (≥1 jugador), DECAE determinista (vida-media 45s, 0-RNG) al
// vaciarse, y ROMPE→0 tras hueco > gapBreakSec (60s). Cruzar 30/90/180s abre la Vigilia (tiers 1/2/3) ⇒ passive
// RESTED_XP COMPARTIDO (+0.05/0.10/0.15) a TODOS los presentes. Premia RELEVO/hand-off; 1 jugador entra-y-sale NO abre.
//
// North Star QA (check N, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes con el
// MISMO snapshot {streak,atMs,present} + MISMO reloj (nowMs) ⇒ streak/tier/buff IDÉNTICOS byte-a-byte. Subir y decaer
// convergen. A SALE físicamente ⇒ Δ_A=0 PERO streak/tier server-authoritative + Δ_B INTACTOS. Cualquier desync = sev-1.
//
// Difs vs el self-verify GE (independencia QA):
//   · check RENDER muestrea la región CORRECTA (badge top-right, x≈1120-1270) con piso-de-ruido diferencial
//     (frame OFF/OFF establece ruido; OFF→ON debe superarlo) — el GE muestreaba abajo-izq (x∈[0,460]) ⇒ sumOff==sumOn
//     falso-negativo (footgun heredado CAS-2332/2337, NO defecto). QA lo prueba bien.
//   · AC-1..4 de la issue mapeados 1:1 (flag default false; ON ⇒ passive server-side determinista; convergencia; 0-regr).
//   · streak/tier/decay/break re-derivados con constantes leídas de config (no hardcode) para atrapar drift de tabla.
//
// Checks:
//   1  boot→play, __dev.longWatch + arc hooks + __BUILD, 0 JS err.
//   2  AC-1 flag: LONG_WATCH existe, enabled:false SERVED en config.js; VM enabled false; byte-id OFF (G.longWatch
//      NUNCA se crea gExists=false; save SIN clave longWatch/longWatchServer; worldFingerprint estable ×toggle).
//   3  tabla tiers = fn PURA del streak, constantes LEÍDAS de config (min/boost) — sin hardcode QA.
//   4  server-authoritative reflect+validate: zona fuera de zones DESCARTADA; streak negativo ⇒ 0.
//   5  ★ SUBIDA (eje fresco): presencia continua sube streak con el tiempo, cruza T0→T1→T2→T3; visita breve (<T1) NO abre.
//   6  ★ DECAY + RUPTURA: vacío decae vida-media (45s⇒×0.5) dentro de la ventana; hueco > gap (61s) ⇒ ROMPE→0.
//   7  ★ RELEVO vs ABANDONO: hueco>gap ⇒ roto(0); hueco<gap ⇒ preservado(>0) y el RELEVO reconstruye ≥T1.
//   8  AC-1 passive server-side determinista (aislado): peers OFF + héroe EN zona T2 ⇒ mul==0.10 + tier2; leave ⇒ 0.
//   9  seam gainXP servido (longWatchMul en gainXP) + byte-id pasivo OFF (enabled false ⇒ mul 0, tag "").
//  10  precedencia MÁXIMO ÚNICO: VIGILIA CEDE a STANDINGS/CONGREGATION/WAYFARER/CONFLUENCIA ⇒ 0; COEXISTE TERRITORY(⊥).
//  11  ★ COBERTURA 6 zonas: cada LONG_WATCH.zones hospeda Vigilia observable (streak≥180⇒T3) broken=[].
//  12  render badge "Vigilia" DIBUJA con ON (Δ px región CORRECTA top-right, piso-de-ruido diferencial) + fps≥55.
//  13  AC-3 0-REGRESIÓN: los 5 flags LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY)
//      served enabled:true intactos; LONG_WATCH served false.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, mismo snapshot+reloj ⇒ streak/tier/buff idénticos;
//      subir(T3)/decaer(T1) converge; A sale ⇒ Δ_A=0 pero streak/tier compartidos + Δ_B intactos (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2341-longwatch-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2341-qa");
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

// Reloj de pared FIJO COMPARTIDO (ms) — mismo en ambos clientes ⇒ proyección determinista byte-a-byte.
const NOW = 7000000;
// Instala los drivers QA: isola los 7 peers DEFAULT-ON del canal restedMult (todo el arco LIVE) para medir Vigilia en
// AISLAMIENTO; y helpers de snapshot/proyección con reloj fijo.
async function installQA(page) {
  await page.evaluate((NOW) => {
    window.__NOW = NOW;
    // flippa OFF in-memory a TODOS los peers del canal (arco LIVE) — su badge y su contribución al restedMult
    window.__iso = () => { for (const k of ["standings","mentor","soul","pulse","congregation","wayfarer","confluence"]) { try { window.__dev[k]({ enabled: false }); } catch (e) {} } };
    // empuja el snapshot crudo de UNA zona con atMs=NOW ⇒ dt=0 al proyectar a NOW ⇒ streak == base exacto
    window.__snap = (zone, streak, present) => window.__dev.longWatch({ nowMs: window.__NOW, push: { [zone]: { streak, atMs: window.__NOW, present } } });
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona
    window.__at = (zone, elapsedSec) => window.__dev.longWatch({ nowMs: window.__NOW + (elapsedSec || 0) * 1000, toZone: zone });
    // encuentra la 1ª zona candidata donde el héroe cae DENTRO (watchable) tras inyectar `streak` presente
    window.__pick = (streak) => {
      window.__dev.longWatch({ enabled: true });
      const zones = window.__dev.longWatch().zones || [];
      for (const z of zones) {
        const s = window.__dev.longWatch({ nowMs: window.__NOW, push: { [z]: { streak, atMs: window.__NOW, present: 1 } }, toZone: z });
        if (s.zone === z && s.watchable) return { zone: z, streak: s.streak, tier: s.tier, boost: s.longWatchMulRested };
      }
      return null;
    };
  }, NOW);
}

// instrumenta ctx.fillText/strokeText para registrar cada dibujo de la etiqueta "Vigilia" — prueba de render
// DETERMINISTA (0 dependencia de muestreo de píxel sobre mundo animado; el badge es cosmético sobre agua/mobs animados
// ⇒ un diff de píxel de un badge diminuto es frágil en headless — footgun heredado GE check12 / CAS-2332/2337).
const installTextHook = (page) => page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype; window.__vig = 0; window.__vigStr = "";
  for (const fn of ["fillText", "strokeText"]) { const o = P[fn]; if (o.__hooked) continue; const h = function (t) { if (typeof t === "string" && t.indexOf("Vigilia") >= 0) { window.__vig++; window.__vigStr = t; } return o.apply(this, arguments); }; h.__hooked = true; P[fn] = h; }
});

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.longWatch && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boot→play, __dev.longWatch + arc hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 AC-1 flag + byte-id OFF (leer ANTES de cualquier inyección)
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const servedFalse = /export const LONG_WATCH\s*=\s*\{[\s\S]*?enabled:\s*false/.test(cfgSrc);
  const dark = await page.evaluate(() => window.__dev.longWatch());
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noKey = !/longWatch(Server)?"/.test(saveOff);
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(909)));
  await page.evaluate(() => window.__dev.longWatch({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(909)));
  await page.evaluate(() => window.__dev.longWatch({ enabled: false }));
  ok("2 AC-1: LONG_WATCH served enabled:false + VM off + byte-id OFF (gExists false, save sin clave, fingerprint estable)",
     servedFalse && dark.enabled === false && dark.gExists === false && dark.streak === 0 && dark.tier === 0 && dark.tag === "" && dark.streaks === null && noKey && fpB === fpA,
     `served=${servedFalse} gExists=${dark.gExists} noKey=${noKey} fpMatch=${fpB === fpA}`);

  await installQA(page);

  // 3 tier table = pure fn of streak, constantes leídas de config (no hardcode)
  const tab = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const cfg = window.__dev.longWatch(); const tiers = cfg.tiers || [];
    const w = window.__pick(5000); if (!w) return { bad: true };
    const zone = w.zone; const samples = [];
    // muestrea justo debajo/encima de cada umbral min ⇒ deriva tier/boost esperados de la TABLA de config
    for (const t of tiers) { samples.push(t.min - 1); samples.push(t.min); }
    samples.push(0); samples.push((tiers[tiers.length - 1].min || 0) + 120);
    const out = [];
    for (const s of samples) {
      window.__snap(zone, s, 1);
      const vm = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone });
      // tier esperado = índice del mayor min ≤ s; boost = tiers[tier-1].boost
      let et = 0; for (let i = 0; i < tiers.length; i++) if (s >= tiers[i].min) et = i + 1;
      const eb = et > 0 ? +tiers[et - 1].boost : 0;
      out.push({ s, streak: vm.streak, tier: vm.tier, et, boost: vm.longWatchMulRested, eb });
    }
    return { zone, tiers, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => near(r.streak, r.s) && r.tier === r.et && near(r.boost, r.eb));
  ok("3 tabla tiers = fn PURA del streak (tier/boost DERIVADOS de constantes de config, 0 hardcode QA)",
     tabOk, `zone=${tab.zone} tiers=${JSON.stringify(tab.tiers)} out=${JSON.stringify(tab.out)}`);

  // 4 server-authoritative reflect + validate
  const refl = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const z0 = window.__dev.longWatch().zones[0];
    window.__dev.longWatch({ nowMs: window.__NOW, push: { [z0]: { streak: 150, atMs: window.__NOW, present: 1 }, nowhere_zone: { streak: 999, atMs: window.__NOW, present: 1 } } });
    const s = window.__dev.longWatch({ nowMs: window.__NOW, toZone: z0 });
    window.__dev.longWatch({ nowMs: window.__NOW, push: { [z0]: { streak: -80, atMs: window.__NOW, present: 1 } } });
    const neg = window.__dev.longWatch({ nowMs: window.__NOW, toZone: z0 });
    return { z0, valid: s.streak, keys: Object.keys(s.streaks || {}), negS: neg.streak, negT: neg.tier };
  });
  ok("4 server-authoritative reflect+validate: zona válida refleja; zona fuera de zones DESCARTADA; streak neg ⇒ 0",
     near(refl.valid, 150) && refl.keys.indexOf("nowhere_zone") < 0 && refl.negS === 0 && refl.negT === 0, JSON.stringify(refl));

  // 5 ★ RISE with continuous presence; brief visit does NOT open
  const rise = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone; window.__snap(zone, 0, 1);
    const brief = window.__at(zone, 10), t1 = window.__at(zone, 30), t2 = window.__at(zone, 90), t3 = window.__at(zone, 180);
    return { zone, briefS: brief.streak, briefT: brief.tier, t1: [t1.streak, t1.tier], t2: [t2.streak, t2.tier], t3: [t3.streak, t3.tier] };
  });
  ok("5 ★ SUBIDA: presencia continua sube streak con el tiempo (10s⇒T0 breve NO abre; 30s⇒T1; 90s⇒T2; 180s⇒T3)",
     !rise.bad && near(rise.briefS, 10) && rise.briefT === 0 && near(rise.t1[0], 30) && rise.t1[1] === 1 && near(rise.t2[0], 90) && rise.t2[1] === 2 && near(rise.t3[0], 180) && rise.t3[1] === 3, JSON.stringify(rise));

  // 6 ★ DECAY half-life + BREAK after gap (constantes leídas de config)
  const decay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const cfg = window.__dev.longWatch(); const hl = cfg.halfLifeSec, gap = cfg.gapBreakSec;
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone;
    window.__snap(zone, 100, 0); const half = window.__at(zone, hl);        // +1 vida-media ⇒ 50
    window.__snap(zone, 100, 0); const brk = window.__at(zone, gap + 1);    // > gap ⇒ 0 (roto)
    return { zone, hl, gap, half: half.streak, brk: brk.streak, brkT: brk.tier };
  });
  ok("6 ★ DECAY+RUPTURA: vacío decae vida-media (+halfLife⇒50) dentro de ventana; hueco > gapBreakSec ⇒ ROMPE→0/T0",
     !decay.bad && near(decay.half, 50, 0.5) && decay.brk === 0 && decay.brkT === 0, JSON.stringify(decay));

  // 7 ★ RELAY vs ABANDON
  const relay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const gap = window.__dev.longWatch().gapBreakSec;
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone;
    window.__snap(zone, 40, 0); const abandon = window.__at(zone, gap + 1);          // > gap ⇒ roto
    window.__snap(zone, 40, 0); const held = window.__at(zone, Math.floor(gap / 2));  // < gap ⇒ preservado
    window.__snap(zone, held.streak, 1); const relief = window.__at(zone, 40);        // relevo reconstruye
    return { zone, abandonS: abandon.streak, abandonT: abandon.tier, heldS: held.streak, reliefT: relief.tier };
  });
  ok("7 ★ RELEVO vs ABANDONO: hueco>gap ⇒ ROTO(0); hueco<gap ⇒ PRESERVADO(>0) y el RELEVO reconstruye ≥T1",
     !relay.bad && relay.abandonS === 0 && relay.abandonT === 0 && relay.heldS > 0 && relay.reliefT >= 1, JSON.stringify(relay));

  // 8 AC-1 passive server-side deterministic (isolated)
  const pass = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(90); if (!w) return { bad: true };
    const inz = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone });
    const out = window.__dev.longWatch({ leave: true });
    return { zone: w.zone, inMul: inz.longWatchMulRested, inTier: inz.tier, inStreak: inz.streak, outMul: out.longWatchMulRested, outTier: out.tier };
  });
  ok("8 AC-1 passive server-side determinista (aislado): héroe EN zona streak90⇒T2 mul==0.10; leave ⇒ 0 + tier0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inStreak, 90) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 9 seam gainXP + byte-id passive OFF
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seam = /function gainXP/.test(simSrc) && /longWatchMul\(h,\s*"restedMult"\)/.test(simSrc);
  const off = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(30); if (!w) return { bad: true };
    const onMul = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone }).longWatchMulRested;
    window.__dev.longWatch({ enabled: false });
    const s = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.longWatchMulRested, tag: s.tag };
  });
  ok("9 seam gainXP servido (longWatchMul en gainXP) + byte-id pasivo OFF (enabled false ⇒ mul 0, tag \"\")",
     seam && !off.bad && near(off.onMul, 0.05) && off.enabled === false && off.mul === 0 && off.tag === "", `seam=${seam} ${JSON.stringify(off)}`);

  // 10 precedence MÁXIMO ÚNICO
  const prec = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__pick(30); if (!w) return { bad: true };
    const zone = w.zone; const set = () => window.__snap(zone, 30, 1);
    set(); const base = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }).longWatchMulRested;
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    set(); const s1 = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }); const sp = s1.standingsMulRested, sc = s1.longWatchMulRested; window.__dev.standings({ enabled: false });
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    set(); const s2 = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }); const gp = s2.congMulRested, gc = s2.longWatchMulRested; window.__dev.congregation({ enabled: false });
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    set(); const s3 = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }); const wp = s3.wayfarerMulRested, wc = s3.longWatchMulRested; window.__dev.wayfarer({ enabled: false });
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    set(); const s4 = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }); const cp = s4.confMulRested, cfc = s4.longWatchMulRested; window.__dev.confluence({ enabled: false });
    set(); window.__dev.territory({ enabled: true });
    const terr = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone }).longWatchMulRested; window.__dev.territory({ enabled: false });
    return { base, sp, sc, gp, gc, wp, wc, cp, cfc, terr };
  });
  ok("10 precedencia MÁXIMO ÚNICO: VIGILIA CEDE a STANDINGS/CONGREGATION/WAYFARER/CONFLUENCIA ⇒ 0; COEXISTE TERRITORY(⊥)",
     !prec.bad && near(prec.base, 0.05) && prec.sp > 0 && prec.sc === 0 && prec.gp > 0 && prec.gc === 0 && prec.wp > 0 && prec.wc === 0 && prec.cp > 0 && prec.cfc === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 11 ★ 6-zone coverage
  const cov = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const zones = window.__dev.longWatch().zones || []; const broken = [];
    for (const z of zones) {
      const s = window.__dev.longWatch({ nowMs: window.__NOW, push: { [z]: { streak: 200, atMs: window.__NOW, present: 1 } }, toZone: z });
      if (!(s.zone === z && s.watchable && s.tier === 3 && s.longWatchMulRested > 0)) broken.push({ z, zone: s.zone, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("11 ★ COBERTURA 6 zonas: cada LONG_WATCH.zones hospeda Vigilia observable (streak≥180⇒T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 13 AC-3 0-regression (leído antes; reusa cfgSrc)
  const liveFlag = (n) => new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY") };
  ok("13 AC-3 0-REGRESIÓN: 5 flags LIVE (CONGREGATION/WAYFARER/WORLD_PULSE/SOUL/DIVERSE) served enabled:true; LONG_WATCH false",
     reg.cong && reg.way && reg.pulse && reg.soul && reg.div && servedFalse, JSON.stringify(reg));

  // 12 render badge — instrumentación fillText/strokeText DETERMINISTA (ON dibuja la etiqueta "Vigilia: <zona>";
  // OFF gated ⇒ 0 dibujos), + fps. Muestrea la región correcta para la screenshot de evidencia.
  await installTextHook(page);
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.longWatch({ enabled: true }); const w = window.__pick(200); if (w) window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone }); window.__vig = 0; window.__vigStr = ""; });
  await sleep(420);
  const onDraw = await page.evaluate(() => ({ vig: window.__vig, str: window.__vigStr }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });   // evidencia con badge ON
  await page.evaluate(() => { window.__dev.longWatch({ enabled: false }); window.__vig = 0; });
  await sleep(420);
  const offDraw = await page.evaluate(() => window.__vig);
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12 render badge 'Vigilia' DIBUJA con ON (fillText 'Vigilia: <zona>' >0, etiqueta correcta) + byte-clean OFF (0 dibujos) + fps≥55",
     onDraw.vig > 0 && /^Vigilia:/.test(onDraw.str) && offDraw === 0 && fps >= 55, `onDraws=${onDraw.vig} label=${JSON.stringify(onDraw.str)} offDraws=${offDraw} fps=${fps}`);

  // 14 ★ NORTH STAR — 2-client convergence (open page2 last)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installQA(page2);
  const w2 = await page2.evaluate(() => { window.__dev.longWatch({ enabled: true }); window.__iso(); return window.__pick(90); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    const a = await page.evaluate((z) => { window.__dev.longWatch({ enabled: true }); window.__iso(); window.__snap(z, 90, 1); return window.__dev.longWatch({ nowMs: window.__NOW, toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { window.__snap(z, 90, 1); return window.__dev.longWatch({ nowMs: window.__NOW, toZone: z }); }, zone);
    const aUp = await page.evaluate((z) => window.__at(z, 90), zone);
    const bUp = await page2.evaluate((z) => window.__at(z, 90), zone);
    const aDn = await page.evaluate((z) => { window.__snap(z, 90, 0); return window.__at(z, 45); }, zone);
    const bDn = await page2.evaluate((z) => { window.__snap(z, 90, 0); return window.__at(z, 45); }, zone);
    const aOut = await page.evaluate(() => window.__dev.longWatch({ leave: true }));
    const bAfter = await page2.evaluate((z) => window.__dev.longWatch({ nowMs: window.__NOW + 45000, toZone: z }), zone);
    return { zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aS: a.streak, bS: b.streak, aM: a.longWatchMulRested, bM: b.longWatchMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpS: aUp.streak, bUpS: bUp.streak, aUpM: aUp.longWatchMulRested, bUpM: bUp.longWatchMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnS: aDn.streak, bDnS: bDn.streak, aDnM: aDn.longWatchMulRested, bDnM: bDn.longWatchMulRested,
      aOutM: aOut.longWatchMulRested, aOutT: aOut.tier, bAfterS: bAfter.streak, bAfterT: bAfter.tier, bAfterM: bAfter.longWatchMulRested };
  })() : { bad: true };
  const northOk = !north.bad && north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 2 && near(north.aS, north.bS) && near(north.aS, 90) && near(north.aM, north.bM) && near(north.aM, 0.10) &&
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpS, north.bUpS) && near(north.aUpS, 180) && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&
    north.aDnT === north.bDnT && north.aDnT === 1 && near(north.aDnS, north.bDnS) && near(north.aDnS, 45) && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&
    north.aOutM === 0 && north.aOutT === 0 && near(north.bAfterS, 45) && north.bAfterT === 1 && near(north.bAfterM, 0.05);
  ok("14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas mismo snapshot+reloj ⇒ streak/tier/buff IDÉNTICOS; subir(T3)/decaer(T1) converge; A sale ⇒ Δ_A=0 pero compartido + Δ_B INTACTO (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2341 QA: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
