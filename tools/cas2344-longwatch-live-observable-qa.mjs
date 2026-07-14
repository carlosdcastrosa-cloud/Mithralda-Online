// CAS-2344 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — VIGILIA / LONG WATCH (LONG_WATCH.enabled:true LIVE). EVO mecánica #54.
// Gemelo LIVE de la DARK observable `tools/cas2341-longwatch-observable-qa.mjs` (14/14 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages tras el
// flip CTO CAS-2343 (LONG_WATCH.enabled false→true, commit c9fb0d8+f814267). Pre-check: version.json servido debe AVANZAR de la base pre-flip
// `2ee8e57d9807` (class-hero deploy CAS-2342) y el config servido debe mostrar LONG_WATCH.enabled:true (si aún DARK ⇒ FAIL check 1, NO self-heal — sólo señala).
//
// EVO#54 = PILAR FRESCO (≠ arco #47-53): CONTINUIDAD TEMPORAL de habitación de zona. El server mantiene por zona un `streak` (segundos-ocupados-continuos)
// que SUBE con presencia (≥1 jugador), DECAE determinista (vida-media 45s, 0-RNG) al vaciarse, y ROMPE→0 tras hueco > gapBreakSec (60s). Cruzar 30/90/180s abre
// la Vigilia (tiers 1/2/3) ⇒ passive RESTED_XP COMPARTIDO (+0.05/0.10/0.15) a TODOS los presentes. Premia RELEVO/hand-off; 1 jugador entra-y-sale NO abre.
//
// North Star (check 14, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO snapshot {streak,atMs,present}
// + MISMO reloj (nowMs) ⇒ streak/tier/buff IDÉNTICOS byte-a-byte. Subir(T3)/decaer(T1) convergen. A SALE físicamente ⇒ Δ_A=0 PERO streak/tier server-authoritative
// de la zona + Δ_B INTACTOS. Cualquier desync = sev-1.
//
// Patrón DEFAULT-ON (mirror confluence-live CAS-2340 / wayfarer-live CAS-2337): el flip ya cargó ⇒ longWatch().enabled===true en boot fresco SIN __dev flip. Todo
// el arco del canal restedMult está LIVE ⇒ para medir la Vigilia AISLADA hay que flippar esos peers OFF in-memory antes de medir ⇒ __iso() (7 peers).
// byte-id OFF se re-verifica INDEP vía TOGGLE enabled:false (Vigilia es byte-id OFF por CONSTRUCCIÓN: 0 estado nuevo, 0 clave serializada).
//
// render badge: instrumentación fillText/strokeText DETERMINISTA (footgun heredado CAS-2341/2332/2337: badge top-right + sidebar + mundo animado + teleport ⇒
// pixel-diff frágil; se cuenta el nº de dibujos de la etiqueta "Vigilia" ON vs OFF). LIVE wiring: gh-pages ?dev=1; build vs version.json (no hardcode) != pre-flip.
// Run: node tools/cas2344-longwatch-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2344-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "2ee8e57d9807";          // build servido ANTES del flip CAS-2343 (class-hero deploy CAS-2342) — el LIVE debe AVANZAR de este
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");
const NOW = 7000000;                     // reloj de pared FIJO COMPARTIDO (ms) — mismo en ambos clientes ⇒ proyección determinista byte-a-byte

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

// __iso(): flip OFF los 7 peers DEFAULT-ON del canal restedMult (arco LIVE) para medir la Vigilia en AISLAMIENTO.
// __snap/__at/__pick: snapshot server-authoritative con reloj fijo NOW (mirror DARK cas2341 installQA).
async function install(page) {
  await page.evaluate((NOW) => {
    window.__NOW = NOW;
    window.__iso = () => { for (const k of ["standings","mentor","soul","pulse","congregation","wayfarer","confluence"]) { try { window.__dev[k]({ enabled: false }); } catch (e) {} } };
    window.__snap = (zone, streak, present) => window.__dev.longWatch({ nowMs: window.__NOW, push: { [zone]: { streak, atMs: window.__NOW, present } } });
    window.__at = (zone, elapsedSec) => window.__dev.longWatch({ nowMs: window.__NOW + (elapsedSec || 0) * 1000, toZone: zone });
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

const installTextHook = (page) => page.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype; window.__vig = 0; window.__vigStr = "";
  for (const fn of ["fillText", "strokeText"]) { const o = P[fn]; if (o.__hooked) continue; const h = function (t) { if (typeof t === "string" && t.indexOf("Vigilia") >= 0) { window.__vig++; window.__vigStr = t; } return o.apply(this, arguments); }; h.__hooked = true; P[fn] = h; }
});

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

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + AVANZÓ de pre-flip + served LONG_WATCH.enabled:true + arco 0-regr (5 flags true)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.longWatch && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { LONG_WATCH: en("LONG_WATCH"), DIVERSE: en("DIVERSE_COMPANY"), WAYFARER: en("WAYFARER_TRAIL"), CONGREGATION: en("CONGREGATION"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS") };
  }, LIVE);
  const arcTrue = ["DIVERSE","WAYFARER","CONGREGATION","PULSE","SOUL","MENTOR","FELLOWSHIP","TERRITORY","STANDINGS"].every((k) => cfg[k] === "true");
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.longWatch + arc hooks; served LONG_WATCH.enabled:true + arco 5 flags true (0 regr); 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && cfg.LONG_WATCH === "true" && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} LONG_WATCH=${cfg.LONG_WATCH} arcTrue=${arcTrue} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ longWatch().enabled===true (el flip cargó del config servido) + boost 0 sin streak
  const dOn = await page.evaluate(() => { const s = window.__dev.longWatch(); return { enabled: s.enabled, mul: s.longWatchMulRested, streak: s.streak, tier: s.tier, tag: s.tag }; });
  ok("2 DEFAULT-ON desde config servido: longWatch().enabled===true (flip cargó) AND mul 0 + streak/tier 0 (passive NO activo sin streak)",
     dOn.enabled === true && dOn.mul === 0 && dOn.streak === 0 && dOn.tier === 0, JSON.stringify(dOn));

  // 3 byte-id OFF via TOGGLE (LIVE re-verify INDEP): enabled:false ⇒ mul 0 + tag "" + save SIN clave longWatch/longWatchServer + fingerprint byte-estable; restaura ON
  await install(page);
  const byteId = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: false, leave: true });
    const s = window.__dev.longWatch();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.longWatch({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.longWatch({ enabled: true });                                   // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.longWatchMulRested, tag: s.tag, streak: s.streak, tier: s.tier, saveNoKey: !/longWatch(Server)?"/.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("3 byte-id OFF (toggle LIVE): enabled false ⇒ mul 0 + tag \"\" + streak/tier 0 + save SIN clave longWatch/longWatchServer + fingerprint byte-estable (0 estado/clave serializada)",
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.streak === 0 && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch, JSON.stringify(byteId));

  // 4 tabla tiers = fn PURA del streak, constantes LEÍDAS de config (no hardcode QA)
  const tab = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const cfg = window.__dev.longWatch(); const tiers = cfg.tiers || [];
    const w = window.__pick(5000); if (!w) return { bad: true };
    const zone = w.zone; const samples = [];
    for (const t of tiers) { samples.push(t.min - 1); samples.push(t.min); }
    samples.push(0); samples.push((tiers[tiers.length - 1].min || 0) + 120);
    const out = [];
    for (const s of samples) {
      window.__snap(zone, s, 1);
      const vm = window.__dev.longWatch({ nowMs: window.__NOW, toZone: zone });
      let et = 0; for (let i = 0; i < tiers.length; i++) if (s >= tiers[i].min) et = i + 1;
      const eb = et > 0 ? +tiers[et - 1].boost : 0;
      out.push({ s, streak: vm.streak, tier: vm.tier, et, boost: vm.longWatchMulRested, eb });
    }
    return { zone, tiers, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => Math.abs(r.streak - r.s) < 1e-4 && r.tier === r.et && near(r.boost, r.eb));
  ok("4 tabla tiers SERVIDA = fn PURA del streak (tier/boost DERIVADOS de constantes de config, 0 hardcode QA)",
     tabOk, `zone=${tab.zone} tiers=${JSON.stringify(tab.tiers)} out=${JSON.stringify(tab.out)}`);

  // 5 server-authoritative reflect + validate
  const refl = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const z0 = window.__dev.longWatch().zones[0];
    window.__dev.longWatch({ nowMs: window.__NOW, push: { [z0]: { streak: 150, atMs: window.__NOW, present: 1 }, nowhere_zone: { streak: 999, atMs: window.__NOW, present: 1 } } });
    const s = window.__dev.longWatch({ nowMs: window.__NOW, toZone: z0 });
    window.__dev.longWatch({ nowMs: window.__NOW, push: { [z0]: { streak: -80, atMs: window.__NOW, present: 1 } } });
    const neg = window.__dev.longWatch({ nowMs: window.__NOW, toZone: z0 });
    return { z0, valid: s.streak, keys: Object.keys(s.streaks || {}), negS: neg.streak, negT: neg.tier };
  });
  ok("5 server-authoritative reflect+validate SERVIDO: zona válida refleja(150); zona fuera de zones DESCARTADA; streak neg ⇒ 0/T0",
     near(refl.valid, 150) && refl.keys.indexOf("nowhere_zone") < 0 && refl.negS === 0 && refl.negT === 0, JSON.stringify(refl));

  // 6 ★ RISE con presencia continua; visita breve NO abre
  const rise = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone; window.__snap(zone, 0, 1);
    const brief = window.__at(zone, 10), t1 = window.__at(zone, 30), t2 = window.__at(zone, 90), t3 = window.__at(zone, 180);
    return { zone, briefS: brief.streak, briefT: brief.tier, t1: [t1.streak, t1.tier], t2: [t2.streak, t2.tier], t3: [t3.streak, t3.tier] };
  });
  ok("6 ★ SUBIDA SERVIDA: presencia continua sube streak (10s⇒T0 breve NO abre; 30s⇒T1; 90s⇒T2; 180s⇒T3)",
     !rise.bad && near(rise.briefS, 10) && rise.briefT === 0 && near(rise.t1[0], 30) && rise.t1[1] === 1 && near(rise.t2[0], 90) && rise.t2[1] === 2 && near(rise.t3[0], 180) && rise.t3[1] === 3, JSON.stringify(rise));

  // 7 ★ DECAY half-life + BREAK after gap
  const decay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const cfg = window.__dev.longWatch(); const hl = cfg.halfLifeSec, gap = cfg.gapBreakSec;
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone;
    window.__snap(zone, 100, 0); const half = window.__at(zone, hl);
    window.__snap(zone, 100, 0); const brk = window.__at(zone, gap + 1);
    return { zone, hl, gap, half: half.streak, brk: brk.streak, brkT: brk.tier };
  });
  ok("7 ★ DECAY+RUPTURA SERVIDO: vacío decae vida-media (+halfLife⇒50) dentro de ventana; hueco > gapBreakSec ⇒ ROMPE→0/T0",
     !decay.bad && near(decay.half, 50, 0.5) && decay.brk === 0 && decay.brkT === 0, JSON.stringify(decay));

  // 8 ★ RELAY vs ABANDON
  const relay = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const gap = window.__dev.longWatch().gapBreakSec;
    const w = window.__pick(0); if (!w) return { bad: true };
    const zone = w.zone;
    window.__snap(zone, 40, 0); const abandon = window.__at(zone, gap + 1);
    window.__snap(zone, 40, 0); const held = window.__at(zone, Math.floor(gap / 2));
    window.__snap(zone, held.streak, 1); const relief = window.__at(zone, 40);
    return { zone, abandonS: abandon.streak, abandonT: abandon.tier, heldS: held.streak, reliefT: relief.tier };
  });
  ok("8 ★ RELEVO vs ABANDONO SERVIDO: hueco>gap ⇒ ROTO(0); hueco<gap ⇒ PRESERVADO(>0) y el RELEVO reconstruye ≥T1",
     !relay.bad && relay.abandonS === 0 && relay.abandonT === 0 && relay.heldS > 0 && relay.reliefT >= 1, JSON.stringify(relay));

  // 9 PASSIVE server-side determinista (aislado)
  const pass = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(90); if (!w) return { bad: true };
    const inz = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone });
    const out = window.__dev.longWatch({ leave: true });
    return { zone: w.zone, inMul: inz.longWatchMulRested, inTier: inz.tier, inStreak: inz.streak, inTag: inz.tag, outMul: out.longWatchMulRested, outTier: out.tier };
  });
  ok("9 PASSIVE server-side determinista SERVIDO (aislado): héroe EN zona streak90⇒T2 mul==0.10 + tag; leave ⇒ 0 + tier0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inStreak, 90) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 10 seam gainXP SERVIDO + byte-id passive OFF
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seam = /function gainXP/.test(simSrc) && /longWatchMul\(h,\s*"restedMult"\)/.test(simSrc);
  const off = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const w = window.__pick(30); if (!w) return { bad: true };
    const onMul = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone }).longWatchMulRested;
    window.__dev.longWatch({ enabled: false });
    const s = window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone });
    window.__dev.longWatch({ enabled: true });
    return { onMul, enabled: s.enabled, mul: s.longWatchMulRested, tag: s.tag };
  });
  ok("10 seam gainXP SERVIDO (longWatchMul en gainXP) + byte-id pasivo OFF: ON aislado ⇒ mul 0.05; enabled false ⇒ mul 0 AND tag \"\"",
     seam && !off.bad && near(off.onMul, 0.05) && off.enabled === false && off.mul === 0 && off.tag === "", `seam=${seam} ${JSON.stringify(off)}`);

  // 11 precedencia MÁXIMO ÚNICO SERVIDO
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
  ok("11 precedencia MÁXIMO ÚNICO LIVE: VIGILIA(0.05) CEDE a STANDINGS⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0; COEXISTE con TERRITORY(⊥) ⇒ 0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.sp > 0 && prec.sc === 0 && prec.gp > 0 && prec.gc === 0 && prec.wp > 0 && prec.wc === 0 && prec.cp > 0 && prec.cfc === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 12 ★ COBERTURA 6 zonas SERVIDA
  const cov = await page.evaluate(() => {
    window.__dev.longWatch({ enabled: true }); window.__iso();
    const zones = window.__dev.longWatch().zones || []; const broken = [];
    for (const z of zones) {
      const s = window.__dev.longWatch({ nowMs: window.__NOW, push: { [z]: { streak: 200, atMs: window.__NOW, present: 1 } }, toZone: z });
      if (!(s.zone === z && s.watchable && s.tier === 3 && s.longWatchMulRested > 0)) broken.push({ z, zone: s.zone, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("12 ★ COBERTURA LIVE 6 zonas: cada LONG_WATCH.zones hospeda Vigilia observable (streak≥180⇒T3) broken=[]",
     cov.n === 6 && cov.broken.length === 0, `n=${cov.n} broken=${JSON.stringify(cov.broken)}`);

  // 13 render badge — instrumentación fillText DETERMINISTA (ON dibuja "Vigilia: <zona>"; OFF gated ⇒ 0) + fps
  await installTextHook(page);
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.longWatch({ enabled: true }); const w = window.__pick(200); if (w) window.__dev.longWatch({ nowMs: window.__NOW, toZone: w.zone }); window.__vig = 0; window.__vigStr = ""; });
  await sleep(450);
  const onDraw = await page.evaluate(() => ({ vig: window.__vig, str: window.__vigStr }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.longWatch({ enabled: false }); window.__vig = 0; });
  await sleep(450);
  const offDraw = await page.evaluate(() => window.__vig);
  await page.evaluate(() => { window.__dev.longWatch({ enabled: true }); });
  ok("13 render badge 'Vigilia' DIBUJA con ON (fillText 'Vigilia: <zona>' >0, etiqueta correcta) + byte-clean OFF (0 dibujos)",
     onDraw.vig > 0 && /^Vigilia:/.test(onDraw.str) && offDraw === 0, `onDraws=${onDraw.vig} label=${JSON.stringify(onDraw.str)} offDraws=${offDraw}`);

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (open page2 last: blurea page1 ⇒ pausa loop de page1)
  const page2 = await freshPage(browser, errors, net404, "p2");
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
  ok("14 ★ NORTH STAR LIVE — CONVERGENCIA 2-CLIENTE: 2 páginas mismo snapshot+reloj ⇒ streak/tier/buff IDÉNTICOS; subir(T3)/decaer(T1) converge; A sale ⇒ Δ_A=0 pero compartido + Δ_B INTACTO (0 desync)",
     northOk, JSON.stringify(north));
  await page2.screenshot({ path: join(OUT, "client-b-vigilia.png") });
  // page2 cerrada antes de fps (2 canvas headless hambrean rAF de page1 — footgun multi-tab, no regr)
  await page2.close();

  // 15 fps estable (best-of-3, single-page)
  await page.bringToFront();
  await sleep(300);
  const measureFps = () => page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  const fpsSamples = [await measureFps(), await measureFps(), await measureFps()];
  const fps = Math.max(...fpsSamples);
  ok("15 fps estable ≥60 LIVE (best-of-3, single-page)", fps >= 60, `fps=${fps} samples=${JSON.stringify(fpsSamples)}`);

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2344 QA LIVE observable+2cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
