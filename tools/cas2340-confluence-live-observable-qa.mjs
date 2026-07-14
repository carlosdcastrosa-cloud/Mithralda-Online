// CAS-2340 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — CONFLUENCIA / DIVERSE COMPANY (DIVERSE_COMPANY.enabled:true LIVE). EVO mecánica #53.
// Gemelo LIVE de la DARK observable `tools/cas2338-confluence-observable-qa.mjs` (18/18 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages tras el
// flip CTO CAS-2339 (DIVERSE_COMPANY.enabled false→true, commit d36e800+dd20ede). Pre-check: version.json servido debe AVANZAR de la base pre-flip
// `dc55a612ecf3` (Sendero Trillado / Wayfarer LIVE) y el config servido debe mostrar DIVERSE_COMPANY.enabled:true (si aún DARK ⇒ FAIL check 1, NO self-heal
// destructivo — sólo señala; el HB re-checkout si el flip no había propagado a gh-pages).
//
// EVO#53 = PILAR FRESCO vs Congregación #51: Congregación premia el HEADCOUNT BRUTO por zona (cuánta gente); Confluencia premia la VARIEDAD de COMPOSICIÓN —
// el nº de CLASES DISTINTAS co-presentes en la misma zona. El server empuja el snapshot server-authoritative { zona → { clase → cuenta } }; el cliente REFLEJA.
// Diversidad = clases DISTINTAS con cuenta>0 (NO suma de cabezas). Umbrales 2/3/4 clases distintas ⇒ T1/T2/T3 ⇒ pasivo restedMult COMPARTIDO 0.05/0.10/0.15
// a TODOS los presentes en la zona. Determinista (0 RNG), pura función del snapshot (sin reloj/decay).
//
// ★★ DIFERENCIADOR QA (check 6b) = N CLONES vs MEZCLA: N clones de la MISMA clase (o 1 jugador solo) NO abren nada (diversidad 1 ⇒ T0 ⇒ 0), sólo la MEZCLA de
// clases distintas. Es la prueba de que el eje es COMPOSICIÓN y NO headcount. 50 clones ⇒ 0; 2 clases distintas ⇒ T1/0.05.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO snapshot de composición
// { zona → { clase → cuenta } } ⇒ ven la MISMA diversidad + el MISMO tier + el MISMO pasivo IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral arriba (4 clases,
// T3) / abajo (2 clases, T1) converge en ambos. El passive es COMPARTIDO (nace de la COMPOSICIÓN de la zona, no del jugador): A SALE físicamente de la zona ⇒
// su Δ cae a 0 PERO la composición/tier server-authoritative de la zona + el Δ de B (que sigue en ella) quedan INTACTOS. Cualquier desync de tier/valor = sev-1.
//
// ★ COBERTURA 6 ZONAS (check 6c): cada zona de DIVERSE_COMPANY.zones puede hospedar una Confluencia observable contra el sim SERVIDO. broken=[] obligatorio.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 9): DIVERSE_COMPANY es la MÁS BAJA del canal restedMult (8ª fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR >
// SOUL > PULSE > CONGREGATION > WAYFARER. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE ⇒ para medir la
// Confluencia AISLADA hay que flippar esos peers OFF in-memory antes de medir (footgun heredado CAS-2329/2332/2335/2337) ⇒ __iso().
//
// Patrón DEFAULT-ON (mirror wayfarer-live CAS-2337 / congregation-live CAS-2334): el flip ya cargó ⇒ confluence().enabled===true en boot fresco SIN __dev flip.
// byte-id OFF se re-verifica INDEP vía TOGGLE enabled:false (Confluencia es byte-id OFF por CONSTRUCCIÓN: 0 estado nuevo, 0 clave serializada ⇒ save nunca
// contiene 'confluence'/'confServer' aun con enabled ON).
//
// LIVE wiring (mirror CAS-2337): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded) y != base pre-flip; favicon-404 filtrado.
// Run: node tools/cas2340-confluence-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2340-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "dc55a612ecf3";          // build servido ANTES del flip CAS-2339 (Sendero Trillado / Wayfarer LIVE) — el LIVE debe AVANZAR de este
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

// __iso(): flip OFF peers DEFAULT-ON del canal restedMult (STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER) para medir la Confluencia en AISLAMIENTO.
// __cput(zone, roster): arranca la feature, aísla, teleporta a `zone`, empuja el roster server-authoritative EN ESA ZONA, y devuelve el estado observado.
//   Null si toZone no aterriza en la zona (confable false).
async function install(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); };
    window.__cput = (zone, roster) => {
      window.__dev.confluence({ enabled: true }); window.__dev.confluence({ clear: true }); window.__iso();
      window.__dev.confluence({ toZone: zone });
      const before = window.__dev.confluence();
      if (!before || !before.confable || before.zone !== zone) return null;
      const snap = {}; snap[zone] = roster;
      window.__dev.confluence({ rosters: snap });
      return window.__dev.confluence();
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

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + build AVANZÓ de pre-flip + served DIVERSE_COMPANY.enabled:true + arco 0-regr + DARK trío false
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.confluence && window.__dev.wayfarer && window.__dev.congregation && window.__dev.pulse && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { DIVERSE: en("DIVERSE_COMPANY"), WAYFARER: en("WAYFARER_TRAIL"), CONGREGATION: en("CONGREGATION"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const arcTrue = ["WAYFARER","CONGREGATION","PULSE","SOUL","MENTOR","FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.confluence + arc hooks; served DIVERSE_COMPANY.enabled:true + arco entero true (0 regr) + DARK trío false; 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && cfg.DIVERSE === "true" && arcTrue && darksFalse && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} DIVERSE=${cfg.DIVERSE} arcTrue=${arcTrue} darksFalse=${darksFalse} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ confluence().enabled===true (el flip cargó del config servido) + boost 0 sin composición diversa
  const dOn = await page.evaluate(() => { const s = window.__dev.confluence(); return { enabled: s.enabled, boost: s.confMulRested, diversity: s.diversity, tier: s.tier }; });
  ok("2 DEFAULT-ON desde config servido: confluence().enabled===true (flip cargó) AND confMulRested 0 + diversity 0/tier 0 (passive NO activo sin composición diversa)",
     dOn.enabled === true && dOn.boost === 0 && dOn.diversity === 0 && dOn.tier === 0, JSON.stringify(dOn));

  // 3 byte-id OFF via TOGGLE (LIVE re-verify INDEP): enabled:false ⇒ confMulRested 0 + tag "" + rosters vacío (null o {} — DEFAULT-ON servido ya pudo instanciar
  //   G.confluence; el byte-id REAL es save-SIN-clave + fingerprint byte-estable) + save SIN clave confluence/confServer; restaura ON.
  const byteId = await page.evaluate(() => {
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    const s = window.__dev.confluence();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.confluence({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.confluence({ enabled: true });                                        // restaura ON (DEFAULT-ON servido)
    const noRosters = s.rosters === null || Object.keys(s.rosters || {}).length === 0;
    return { enabled: s.enabled, mul: s.confMulRested, tag: s.tag, diversity: s.diversity, tier: s.tier, noRosters, saveNoKey: !/"conf(luence|Server)"/.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("3 byte-id OFF (toggle LIVE): enabled false ⇒ confMulRested 0 + tag \"\" + diversity/tier 0 + rosters vacío (null|{}) + save SIN clave confluence/confServer + fingerprint byte-estable (0 estado/clave serializada)",
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.diversity === 0 && byteId.tier === 0 && byteId.noRosters && byteId.saveNoKey && byteId.fpMatch, JSON.stringify(byteId));

  // 5 TABLA DE TIERS determinista + DECAY SERVIDO: diversidad 1→T0/0, 2→T1/0.05, 3→T2/0.10, 4→T3/0.15, 5→T3/0.15 (cap); caer de 4→1 clases ⇒ tier DECAE a 0 (monótono)
  const tiers = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const CLS = window.__dev.confluence().classes;
    const z = window.__dev.confluence().zones[0];
    window.__dev.confluence({ toZone: z });
    const mk = (n) => { const r = {}; for (let i = 0; i < n; i++) r[CLS[i]] = 1; return r; };
    const out = {};
    for (const n of [1, 2, 3, 4, 5]) { const s = window.__cput(z, mk(n)); out[n] = { div: s.diversity, tier: s.tier, boost: s.boost, mul: s.confMulRested }; }
    window.__cput(z, mk(4)); const up = window.__dev.confluence();
    const down = window.__cput(z, mk(1));
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { out, up: { tier: up.tier, mul: up.confMulRested }, down: { div: down.diversity, tier: down.tier, mul: down.confMulRested } };
  });
  const tiersOk = tiers.out[1].tier === 0 && tiers.out[1].mul === 0 &&
                  tiers.out[2].tier === 1 && near(tiers.out[2].mul, 0.05) &&
                  tiers.out[3].tier === 2 && near(tiers.out[3].mul, 0.10) &&
                  tiers.out[4].tier === 3 && near(tiers.out[4].mul, 0.15) &&
                  tiers.out[5].tier === 3 && near(tiers.out[5].mul, 0.15) &&
                  tiers.up.tier === 3 && tiers.down.tier === 0 && tiers.down.mul === 0;
  ok("5 TIERS determinista SERVIDO: div 1→T0/0, 2→T1/0.05, 3→T2/0.10, 4→T3/0.15, 5→T3/0.15(cap); DECAY 4 clases(T3)→1 clase ⇒ tier 0 (monótono, sin histéresis)", tiersOk, JSON.stringify(tiers));

  // 6 server-authoritative reflect + VALIDACIÓN SERVIDO: push roster con clase DESCONOCIDA + cuenta ≤0 ⇒ DESCARTADAS (cliente sólo refleja clases conocidas con cuenta>0)
  const reflect = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const z = window.__dev.confluence().zones[0]; window.__dev.confluence({ toZone: z });
    const snap = {}; snap[z] = { warrior: 2, mage: 1, rogue: 5, druid: 0, priest: -3 };
    window.__dev.confluence({ rosters: snap });
    const s = window.__dev.confluence();
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { roster: s.roster, classesPresent: s.classesPresent.slice().sort(), diversity: s.diversity };
  });
  const reflOk = reflect.diversity === 2 && JSON.stringify(reflect.classesPresent) === JSON.stringify(["mage", "warrior"]) && !("rogue" in reflect.roster) && !("druid" in reflect.roster) && !("priest" in reflect.roster);
  ok("6 server-authoritative reflect+validate SERVIDO: clase desconocida(rogue)/cuenta 0(druid)/cuenta<0(priest) DESCARTADAS ⇒ diversidad 2 (warrior,mage) (cliente sólo refleja)", reflOk, JSON.stringify(reflect));

  // 6b ★★ DIFERENCIADOR N CLONES vs MEZCLA (composición, NO headcount): 50 clones de UNA clase ⇒ diversidad 1 / T0 / 0; 2 clases DISTINTAS (1 c/u) ⇒ T1/0.05
  const clones = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const CLS = window.__dev.confluence().classes; const z = window.__dev.confluence().zones[0];
    const solo = window.__cput(z, { [CLS[0]]: 50 });
    const solo1 = window.__cput(z, { [CLS[0]]: 1 });
    const mix = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { solo: { div: solo.diversity, tier: solo.tier, mul: solo.confMulRested }, solo1: { div: solo1.diversity, tier: solo1.tier, mul: solo1.confMulRested }, mix: { div: mix.diversity, tier: mix.tier, mul: mix.confMulRested } };
  });
  const clonesOk = clones.solo.div === 1 && clones.solo.tier === 0 && clones.solo.mul === 0 &&
                   clones.solo1.div === 1 && clones.solo1.tier === 0 && clones.solo1.mul === 0 &&
                   clones.mix.div === 2 && clones.mix.tier === 1 && near(clones.mix.mul, 0.05);
  ok("6b ★★ DIFERENCIADOR LIVE (composición≠headcount): 50 clones MISMA clase ⇒ div 1/T0/0 AND 1 solo ⇒ div 1/T0/0; 2 clases DISTINTAS ⇒ T1/0.05 (la MEZCLA abre, NO las cabezas)", clonesOk, JSON.stringify(clones));

  // 6c ★ COBERTURA 6 ZONAS SERVIDO: cada zona de DIVERSE_COMPANY.zones puede hospedar una Confluencia observable (toZone aterriza + roster 2 clases ⇒ tier1 + 0.05)
  const zoneCov = await page.evaluate(() => {
    const zones = window.__dev.confluence().zones; const CLS = window.__dev.confluence().classes; const broken = [], live = [];
    for (const z of zones) {
      const s = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });
      if (s && s.confable && s.zone === z && s.diversity === 2 && s.tier === 1 && Math.abs(s.confMulRested - 0.05) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6c ★ COBERTURA LIVE 6 zonas: TODAS pueden hospedar una Confluencia observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length && zoneCov.zones.length === 6, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 PASSIVE aislado SERVIDO: héroe EN zona con composición diversa ⇒ confMulRested==boost + tag ❈ + rested>boost; leave ⇒ 0 + tag "" + no confable
  const iso = await page.evaluate(() => {
    const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes;
    const s = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 });
    const inZone = { mul: s.confMulRested, tier: s.tier, boost: s.boost, tag: s.tag, rested: s.restedXpMult };
    const g = window.__dev.confluence({ leave: true });
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { inZone, leftMul: g.confMulRested, leftTag: g.tag, leftConfable: g.confable };
  });
  ok("7 PASSIVE aislado SERVIDO: 3 clases ⇒ mul 0.10 + tier 2 + tag ❈ + rested>0.10; leave ⇒ mul 0 + tag \"\" + no confable",
     near(iso.inZone.mul, 0.10) && iso.inZone.tier === 2 && near(iso.inZone.boost, 0.10) && iso.inZone.tag === "❈" && iso.inZone.rested > 0.10 && iso.leftMul === 0 && iso.leftTag === "" && iso.leftConfable === false, JSON.stringify(iso));

  // 8 seam gainXP SERVIDO wired + byte-id pasivo OFF: served sim aplica confMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag ""
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /confMul\(h,\s*"restedMult"\)/.test(simSrc);
  const seamOff = await page.evaluate(() => {
    const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes;
    const on = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });
    const onMul = on.confMulRested;
    window.__dev.confluence({ enabled: false });
    const s = window.__dev.confluence();
    window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { onMul, enabled: s.enabled, mul: s.confMulRested, tag: s.tag };
  });
  ok("8 seam gainXP SERVIDO (confMul en gainXP) + byte-id pasivo OFF: ON aislado ⇒ mul 0.05; enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && near(seamOff.onMul, 0.05) && seamOff.enabled === false && seamOff.mul === 0 && seamOff.tag === "", `wired=${seamWired} ${JSON.stringify(seamOff)}`);

  // 9 PRECEDENCIA MÁXIMO ÚNICO SERVIDO: CONFLUENCIA cede a STANDINGS + SOUL + CONGREGATION + WAYFARER (peer DRIVEN a mul>0 ⇒ CONFLUENCIA 0); coexiste con TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.territory({ enabled: false });
    const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes;
    const roster = { [CLS[0]]: 1, [CLS[1]]: 1 };
    window.__cput(z, roster);
    const base = window.__dev.confluence().confMulRested;     // 0.05 aislado
    // (a) STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ CONFLUENCIA cede
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const s1 = window.__dev.confluence(); const standPeer = s1.standingsMulRested, standCeded = s1.confMulRested;
    window.__dev.standings({ enabled: false });
    // (b) SOUL: morir ⇒ buff recuperación caído ⇒ soulMul>0 ⇒ CONFLUENCIA cede
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: 1234 * 300000 }); window.__dev.soul({ die: true });
    const s2 = window.__dev.confluence(); const soulPeer = s2.soulMulRested, soulCeded = s2.confMulRested;
    window.__dev.soul({ enabled: false });
    // (c) CONGREGATION: headcount ≥ umbral en la zona del héroe ⇒ congMul>0 ⇒ CONFLUENCIA cede
    const cput = window.__cput(z, roster); const heroZone = cput.zone;
    let congPeer = 0, congCeded = base;
    if (heroZone) { window.__dev.congregation({ enabled: true }); const cc = {}; cc[heroZone] = 8; window.__dev.congregation({ counts: cc });
      const s3 = window.__dev.confluence(); congPeer = s3.congMulRested; congCeded = s3.confMulRested; window.__dev.congregation({ enabled: false }); }
    // (d) WAYFARER: sendero trillado en la celda del héroe ⇒ wayfarerMul>0 ⇒ CONFLUENCIA cede (la más cercana en precedencia)
    window.__cput(z, roster);
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 5e6 }); window.__dev.wayfarer({ tread: 200, atMs: 5e6 });
    const s4 = window.__dev.confluence(); const wayPeer = s4.wayfarerMulRested, wayCeded = s4.confMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (e) TERRITORY (⊥ safeRegen): NO afecta confMul ⇒ intacto
    window.__cput(z, roster);
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.confluence().confMulRested;
    window.__dev.territory({ enabled: false }); window.__dev.confluence({ enabled: true, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, congPeer, congCeded, wayPeer, wayCeded, terrCoexist, heroZone };
  });
  ok("9 precedencia MÁXIMO ÚNICO LIVE: CONFLUENCIA(0.05) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0; COEXISTE con TERRITORY(⊥) ⇒ 0.05 intacto",
     near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await freshPage(browser, errors, net404, "p2");

  const applyBoth = async (roster) => {
    const a = await page.evaluate((r) => { const z = window.__dev.confluence().zones[0]; const s = window.__cput(z, r); return { zone: s.zone, diversity: s.diversity, tier: s.tier, mul: s.confMulRested, roster: s.roster }; }, roster);
    const b = await page2.evaluate((r) => { const z = window.__dev.confluence().zones[0]; const s = window.__cput(z, r); return { zone: s.zone, diversity: s.diversity, tier: s.tier, mul: s.confMulRested, roster: s.roster }; }, roster);
    return { a, b };
  };
  const CLS = await page.evaluate(() => window.__dev.confluence().classes);
  // 11a baseline: mismo snapshot (2 clases) ⇒ A==B (misma zona/diversidad/tier/mul 0.05)
  const c2 = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1 });
  const conv2 = JSON.stringify(c2.a) === JSON.stringify(c2.b) && c2.a.diversity === 2 && c2.a.tier === 1 && near(c2.a.mul, 0.05);
  ok("11a NORTH STAR LIVE convergencia: mismo snapshot (2 clases distintas) ⇒ A==B byte-a-byte (misma zona/diversidad 2/T1/0.05)", conv2, `A=${JSON.stringify(c2.a)} B=${JSON.stringify(c2.b)}`);

  // 11b CRUZAR UMBRAL ARRIBA: 4 clases distintas ⇒ ambos T3/0.15 idénticos
  const c4 = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1, [CLS[3]]: 1 });
  const conv4 = JSON.stringify(c4.a) === JSON.stringify(c4.b) && c4.a.diversity === 4 && c4.a.tier === 3 && near(c4.a.mul, 0.15);
  ok("11b NORTH STAR LIVE cruzar umbral ARRIBA: 4 clases distintas ⇒ ambos T3/0.15 idénticos (0 desync de tier/valor)", conv4, `A=${JSON.stringify(c4.a)} B=${JSON.stringify(c4.b)}`);

  // 11c CRUZAR UMBRAL ABAJO: caer a 2 clases ⇒ ambos T1/0.05 idénticos (decae determinista, converge)
  const c2b = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1 });
  const conv2b = JSON.stringify(c2b.a) === JSON.stringify(c2b.b) && c2b.a.diversity === 2 && c2b.a.tier === 1 && near(c2b.a.mul, 0.05);
  ok("11c NORTH STAR LIVE cruzar umbral ABAJO: caer 4→2 clases ⇒ ambos T1/0.05 idénticos (decae determinista, converge)", conv2b, `A=${JSON.stringify(c2b.a)} B=${JSON.stringify(c2b.b)}`);

  // 11d A SALE de la zona ⇒ Δ_A=0 PERO composición/tier server-authoritative de la zona + Δ_B INTACTOS (passive COMPARTIDO, no per-hero). Re-push fresh en ambos.
  await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 });   // 3 clases ⇒ T2/0.10 en ambos
  const aLeave = await page.evaluate(() => { const s = window.__dev.confluence({ leave: true }); return { mul: s.confMulRested, tag: s.tag, confable: s.confable, rosters: s.rosters }; });
  const bStill = await page2.evaluate(() => { const s = window.__dev.confluence(); return { mul: s.confMulRested, tier: s.tier, diversity: s.diversity, tag: s.tag }; });
  const zoneKey = await page2.evaluate(() => window.__dev.confluence().zone);
  const zoneStillDiverse = !!(aLeave.rosters && aLeave.rosters[zoneKey] && Object.keys(aLeave.rosters[zoneKey]).length === 3);
  const noDesync = aLeave.mul === 0 && aLeave.tag === "" && aLeave.confable === false && zoneStillDiverse && near(bStill.mul, 0.10) && bStill.tier === 2 && bStill.diversity === 3 && bStill.tag === "❈";
  ok("11d NORTH STAR LIVE A sale zona: Δ_A=0 + no confable PERO composición/tier compartidos de la zona intactos + Δ_B INTACTO (0.10/T2/❈) — 0 desync", noDesync, `A=${JSON.stringify(aLeave.mul)},confable=${aLeave.confable} zoneRoster=${JSON.stringify(aLeave.rosters ? aLeave.rosters[zoneKey] : null)} B=${JSON.stringify(bStill)}`);
  await page2.screenshot({ path: join(OUT, "client-b-confluence.png") });
  // North Star 2-cliente COMPLETO ⇒ cierro page2 antes de render/fps: 2 canvas vivos en el MISMO browser headless hambrean el rAF de page1 (fps undercount,
  // footgun multi-tab headless — NO regr de producto; DARK single-page midió 61). Con 1 sola página el fps es real (mirror CAS-2337).
  await page2.close();

  // 12 render badge ON vs OFF (Δ px en la región top-right, mirror CAS-2338/2337) + noise-floor + arco regr + fps
  await page.bringToFront();
  await sleep(400);
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.confluence({ leave: true }); window.__dev.confluence({ enabled: false, clear: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);
  const noise = Math.abs(offSum - offSum2);
  await page.evaluate(() => { const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes; window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 }); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  ok("12a render badge 'Confluencia' DIBUJA en región top-right (Δ>noise) vs OFF-control LIVE", delta > 0 && delta > noise, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // 12b arco previo re-activable LIVE (peers flippeados OFF in-memory arriba; re-flip ON verifica DISCO true) — 0 regr
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.congregation({ enabled: true }); window.__dev.wayfarer({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled, cong: window.__dev.congregation().enabled, wayfarer: window.__dev.wayfarer().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor/congregation/wayfarer) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  // best-of-3 ventanas de 1s (page2 ya cerrada): rechaza una única ventana lenta; el loop está capado a 60 por rAF ⇒ el mejor ~60
  const measureFps = () => page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  const fpsSamples = [await measureFps(), await measureFps(), await measureFps()];
  const fps = Math.max(...fpsSamples);
  ok("12c fps estable ≥60 LIVE (best-of-3, single-page)", fps >= 60, `fps=${fps} samples=${JSON.stringify(fpsSamples)}`);

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2340 QA LIVE observable+2cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
