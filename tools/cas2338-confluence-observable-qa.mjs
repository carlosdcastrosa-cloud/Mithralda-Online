// CAS-2338 — QA OBSERVABLE for CONFLUENCIA / DIVERSE COMPANY (DARK, DIVERSE_COMPANY.enabled:false). EVO mecánica #53.
// INDEPENDENT QA harness (NOT the GE self-verify). Eje FRESCO vs Congregación #51: Congregación premia el HEADCOUNT BRUTO por zona (cuánta gente);
// Confluencia premia la VARIEDAD de COMPOSICIÓN — el nº de CLASES DISTINTAS co-presentes en la misma zona. El server empuja el snapshot server-authoritative
// { zona → { clase → cuenta } }; el cliente REFLEJA. Diversidad = clases DISTINTAS con cuenta>0 (NO suma de cabezas). Umbrales 2/3/4 clases distintas ⇒
// T1/T2/T3 ⇒ pasivo restedMult COMPARTIDO 0.05/0.10/0.15 a TODOS los presentes en la zona. Determinista (0 RNG), pura función del snapshot.
//
// ★★ DIFERENCIADOR QA (check 6b) = N CLONES vs MEZCLA: N clones de la MISMA clase (o 1 jugador solo) NO abren nada (diversidad 1 ⇒ T0 ⇒ 0), sólo la MEZCLA
// de clases distintas. Es la prueba de que el eje es COMPOSICIÓN y NO headcount (si fuese Congregación, 50 cabezas abrirían el tier máximo). 50 clones ⇒ 0;
// 2 clases distintas ⇒ T1/0.05.
//
// ★ North Star (check 11) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO snapshot de composición
// { zona → { clase → cuenta } } ⇒ ven la MISMA diversidad + el MISMO tier + el MISMO pasivo IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral arriba (4 clases,
// T3) / abajo (2 clases, T1) converge en ambos. El passive es COMPARTIDO (nace de la COMPOSICIÓN de la zona, no del jugador): A SALE físicamente de la zona ⇒
// su Δ cae a 0 PERO la composición/tier server-authoritative de la zona + el Δ de B (que sigue en ella) quedan INTACTOS. Cualquier desync de tier/valor = sev-1.
//
// ★ COBERTURA 6 ZONAS (check 6c): cada zona de DIVERSE_COMPANY.zones puede hospedar una Confluencia observable (toZone aterriza en la zona + push roster
// de 2 clases ⇒ tier≥1 + boost 0.05). Re-test de la clase de footgun soulPos CAS-2326.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 9): DIVERSE_COMPANY es la MÁS BAJA del canal restedMult (8ª fuente) ⇒ CEDE (return 0) a STANDINGS > MENTOR >
// SOUL > PULSE > CONGREGATION > WAYFARER. FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Todo el arco del canal está LIVE (DEFAULT-ON) ⇒ para
// medir la Confluencia AISLADA hay que flippar esos peers OFF in-memory (footgun heredado CAS-2329/2332/2335) ⇒ __iso().
//
// Observado vía __dev.confluence (flip enabled IN-MEMORY + inyección del snapshot { zona → { clase → cuenta } } + toZone/leave/clear) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/territory/oath/saveBlob/worldFingerprint.
// Run: node tools/cas2338-confluence-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2338-qa");
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

// __iso(): flip OFF los peers DEFAULT-ON del canal restedMult (STANDINGS/MENTOR/SOUL/PULSE/CONGREGATION/WAYFARER) para medir la Confluencia en AISLAMIENTO.
// __cbuild(classes): construye un roster { clase → 1 } de las N primeras clases distintas.
// __cput(zone, roster): arranca la feature, aísla, teleporta a `zone`, empuja el roster server-authoritative EN ESA ZONA, y devuelve el estado observado.
//   Null si toZone no aterriza en la zona (confable false).
async function install(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); };
    window.__cput = (zone, roster) => {
      window.__dev.confluence({ enabled: true }); window.__dev.confluence({ clear: true }); window.__iso();
      window.__dev.confluence({ toZone: zone });
      const before = window.__dev.confluence();               // ¿aterrizó el héroe en la zona? (confable)
      if (!before || !before.confable || before.zone !== zone) return null;
      const snap = {}; snap[zone] = roster;
      window.__dev.confluence({ rosters: snap });             // el server empuja la composición de ESTA zona
      return window.__dev.confluence();
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.confluence && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.confluence + arc hooks + __BUILD, 0 JS err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false AND G.confluence NUNCA se crea (gExists false) — read BEFORE any inject
  const off = await page.evaluate(() => window.__dev.confluence());
  ok("2 byte-id OFF fresh boot: enabled=false AND gExists=false AND diversity/tier/boost 0 AND confMul 0 AND tag \"\" AND rosters null (0 estado nuevo)",
     off.enabled === false && off.gExists === false && off.diversity === 0 && off.tier === 0 && off.boost === 0 && off.confMulRested === 0 && off.tag === "" && off.rosters === null,
     `enabled=${off.enabled} gExists=${off.gExists} diversity=${off.diversity} tier=${off.tier} boost=${off.boost} confMul=${off.confMulRested} tag="${off.tag}" rosters=${JSON.stringify(off.rosters)}`);

  // 3 byte-id save OFF: no 'confluence'/'confServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: saveBlob SIN clave confluence/confServer (estado 100% derivado/transitorio)", !/"conf(luence|Server)"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable+inject toggle (0 RNG drift)
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => { window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { forest: { warrior: 1, mage: 1, druid: 1 } } }); });
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.confluence({ enabled: false, clear: true }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled+inject roster (0 RNG drift)", fpA === fpB, `stable=${fpA === fpB}`);

  // 5 TABLA DE TIERS determinista + DECAY: diversidad 1→T0/0, 2→T1/0.05, 3→T2/0.10, 4→T3/0.15, 5→T3/0.15 (cap); caer de 4→1 clases ⇒ tier DECAE a 0 (monótono, sin histéresis)
  const tiers = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const CLS = window.__dev.confluence().classes;                // ["warrior","paladin","mage","druid","priest"]
    const z = window.__dev.confluence().zones[0];
    window.__dev.confluence({ toZone: z });
    const mk = (n) => { const r = {}; for (let i = 0; i < n; i++) r[CLS[i]] = 1; return r; };
    const out = {};
    for (const n of [1, 2, 3, 4, 5]) { const s = window.__cput(z, mk(n)); out[n] = { div: s.diversity, tier: s.tier, boost: s.boost, mul: s.confMulRested }; }
    // DECAY: subir a 4 (T3) y luego caer a 1 clase ⇒ tier vuelve a 0 determinista
    window.__cput(z, mk(4)); const up = window.__dev.confluence();
    const down = window.__cput(z, mk(1));
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { out, up: { tier: up.tier, mul: up.confMulRested }, down: { div: down.diversity, tier: down.tier, mul: down.confMulRested } };
  });
  const tiersOk = tiers.out[1].tier === 0 && tiers.out[1].mul === 0 &&
                  tiers.out[2].tier === 1 && near(tiers.out[2].mul, 0.05) &&
                  tiers.out[3].tier === 2 && near(tiers.out[3].mul, 0.10) &&
                  tiers.out[4].tier === 3 && near(tiers.out[4].mul, 0.15) &&
                  tiers.out[5].tier === 3 && near(tiers.out[5].mul, 0.15) &&
                  tiers.up.tier === 3 && tiers.down.tier === 0 && tiers.down.mul === 0;
  ok("5 TIERS determinista: div 1→T0/0, 2→T1/0.05, 3→T2/0.10, 4→T3/0.15, 5→T3/0.15(cap); DECAY 4 clases(T3)→1 clase ⇒ tier 0 (monótono, sin histéresis)", tiersOk, JSON.stringify(tiers));

  // 6 server-authoritative reflect + VALIDACIÓN: push roster con clase DESCONOCIDA + cuenta ≤0 ⇒ DESCARTADAS (cliente sólo refleja clases conocidas con cuenta>0)
  const reflect = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const z = window.__dev.confluence().zones[0]; window.__dev.confluence({ toZone: z });
    const snap = {}; snap[z] = { warrior: 2, mage: 1, rogue: 5, druid: 0, priest: -3 };   // rogue=desconocida, druid=0, priest<0 ⇒ descartadas
    window.__dev.confluence({ rosters: snap });
    const s = window.__dev.confluence();
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { roster: s.roster, classesPresent: s.classesPresent.slice().sort(), diversity: s.diversity };
  });
  const reflOk = reflect.diversity === 2 && JSON.stringify(reflect.classesPresent) === JSON.stringify(["mage", "warrior"]) && !("rogue" in reflect.roster) && !("druid" in reflect.roster) && !("priest" in reflect.roster);
  ok("6 server-authoritative reflect+validate: clase desconocida(rogue)/cuenta 0(druid)/cuenta<0(priest) DESCARTADAS ⇒ diversidad 2 (warrior,mage) (cliente sólo refleja)", reflOk, JSON.stringify(reflect));

  // 6b ★★ DIFERENCIADOR N CLONES vs MEZCLA (composición, NO headcount): 50 clones de UNA clase ⇒ diversidad 1 / T0 / 0; 2 clases DISTINTAS (1 c/u) ⇒ T1/0.05
  const clones = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const CLS = window.__dev.confluence().classes; const z = window.__dev.confluence().zones[0];
    const solo = window.__cput(z, { [CLS[0]]: 50 });                          // 50 cabezas MISMA clase ⇒ diversidad 1
    const solo1 = window.__cput(z, { [CLS[0]]: 1 });                          // 1 jugador solo ⇒ diversidad 1
    const mix = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });               // 2 clases distintas ⇒ T1
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { solo: { div: solo.diversity, tier: solo.tier, mul: solo.confMulRested }, solo1: { div: solo1.diversity, tier: solo1.tier, mul: solo1.confMulRested }, mix: { div: mix.diversity, tier: mix.tier, mul: mix.confMulRested } };
  });
  const clonesOk = clones.solo.div === 1 && clones.solo.tier === 0 && clones.solo.mul === 0 &&
                   clones.solo1.div === 1 && clones.solo1.tier === 0 && clones.solo1.mul === 0 &&
                   clones.mix.div === 2 && clones.mix.tier === 1 && near(clones.mix.mul, 0.05);
  ok("6b ★★ DIFERENCIADOR (composición≠headcount): 50 clones MISMA clase ⇒ div 1/T0/0 AND 1 solo ⇒ div 1/T0/0; 2 clases DISTINTAS ⇒ T1/0.05 (la MEZCLA abre, NO las cabezas)", clonesOk, JSON.stringify(clones));

  // 6c ★ COBERTURA 6 ZONAS: cada zona de DIVERSE_COMPANY.zones puede hospedar una Confluencia observable (toZone aterriza + roster 2 clases ⇒ tier1 + 0.05)
  const zoneCov = await page.evaluate(() => {
    const zones = window.__dev.confluence().zones; const CLS = window.__dev.confluence().classes; const broken = [], live = [];
    for (const z of zones) {
      const s = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });
      if (s && s.confable && s.zone === z && s.diversity === 2 && s.tier === 1 && Math.abs(s.confMulRested - 0.05) < 1e-9) live.push(z); else broken.push(z);
    }
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { zones, live, broken };
  });
  ok("6c ★ COBERTURA 6 zonas: TODAS pueden hospedar una Confluencia observable (broken=[])", zoneCov.broken.length === 0 && zoneCov.live.length === zoneCov.zones.length, `live=${JSON.stringify(zoneCov.live)} broken=${JSON.stringify(zoneCov.broken)}`);

  // 7 PASSIVE aislado: héroe EN zona con composición diversa ⇒ confMulRested==boost + tag ❈ + rested>boost; leave ⇒ 0 + tag "" + no confable
  const iso = await page.evaluate(() => {
    const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes;
    const s = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 });   // 3 clases ⇒ T2/0.10
    const inZone = { mul: s.confMulRested, tier: s.tier, boost: s.boost, tag: s.tag, rested: s.restedXpMult };
    const g = window.__dev.confluence({ leave: true });
    window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { inZone, leftMul: g.confMulRested, leftTag: g.tag, leftConfable: g.confable };
  });
  ok("7 PASSIVE aislado: 3 clases ⇒ mul 0.10 + tier 2 + tag ❈ + rested>0.10; leave ⇒ mul 0 + tag \"\" + no confable",
     near(iso.inZone.mul, 0.10) && iso.inZone.tier === 2 && near(iso.inZone.boost, 0.10) && iso.inZone.tag === "❈" && iso.inZone.rested > 0.10 && iso.leftMul === 0 && iso.leftTag === "" && iso.leftConfable === false, JSON.stringify(iso));

  // 8 seam gainXP wired + byte-id pasivo OFF: served sim aplica confMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag ""
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /confMul\(h,\s*"restedMult"\)/.test(simSrc);
  const seamOff = await page.evaluate(() => {
    const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes;
    const on = window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1 });
    const onMul = on.confMulRested;
    window.__dev.confluence({ enabled: false });
    const s = window.__dev.confluence();
    window.__dev.confluence({ clear: true, leave: true });
    return { onMul, enabled: s.enabled, mul: s.confMulRested, tag: s.tag };
  });
  ok("8 seam gainXP servido (confMul en gainXP) + byte-id pasivo OFF: ON aislado ⇒ mul 0.05; enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && near(seamOff.onMul, 0.05) && seamOff.enabled === false && seamOff.mul === 0 && seamOff.tag === "", `wired=${seamWired} ${JSON.stringify(seamOff)}`);

  // 9 PRECEDENCIA MÁXIMO ÚNICO: CONFLUENCIA cede a STANDINGS + SOUL + CONGREGATION + WAYFARER (peer DRIVEN a mul>0 ⇒ CONFLUENCIA 0); coexiste con TERRITORY (safeRegen ⊥)
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
    // (b) SOUL: morir ⇒ buff recuperación caído ⇒ soulMul>0 ⇒ CONFLUENCIA cede (soul.die respawnea ⇒ re-put después)
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
    window.__dev.territory({ enabled: false }); window.__dev.confluence({ enabled: false, clear: true, leave: true });
    return { base, standPeer, standCeded, soulPeer, soulCeded, congPeer, congCeded, wayPeer, wayCeded, terrCoexist, heroZone };
  });
  ok("9 precedencia MÁXIMO ÚNICO: CONFLUENCIA(0.05) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND CONGREGATION⇒0 AND WAYFARER⇒0; COEXISTE con TERRITORY(⊥) ⇒ 0.05 intacto",
     near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 10/11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL
  const pageB = await browser.newPage();
  pageB.on("pageerror", (e) => errors.push("B:" + String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await install(pageB);

  // ambos: misma zona ⇒ mismo snapshot de composición ⇒ deben converger byte-a-byte (misma diversidad/tier/buff)
  const applyBoth = async (roster) => {
    const a = await page.evaluate((r) => { const z = window.__dev.confluence().zones[0]; const s = window.__cput(z, r); return { zone: s.zone, diversity: s.diversity, tier: s.tier, mul: s.confMulRested, roster: s.roster }; }, roster);
    const b = await pageB.evaluate((r) => { const z = window.__dev.confluence().zones[0]; const s = window.__cput(z, r); return { zone: s.zone, diversity: s.diversity, tier: s.tier, mul: s.confMulRested, roster: s.roster }; }, roster);
    return { a, b };
  };
  const CLS = await page.evaluate(() => window.__dev.confluence().classes);
  // 11a baseline: mismo snapshot (2 clases) ⇒ A==B (misma zona/diversidad/tier/mul 0.05)
  const c2 = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1 });
  const conv2 = JSON.stringify(c2.a) === JSON.stringify(c2.b) && c2.a.diversity === 2 && c2.a.tier === 1 && near(c2.a.mul, 0.05);
  ok("11a NORTH STAR convergencia: mismo snapshot (2 clases distintas) ⇒ A==B byte-a-byte (misma zona/diversidad 2/T1/0.05)", conv2, `A=${JSON.stringify(c2.a)} B=${JSON.stringify(c2.b)}`);

  // 11b CRUZAR UMBRAL ARRIBA: 4 clases distintas ⇒ ambos T3/0.15 idénticos
  const c4 = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1, [CLS[3]]: 1 });
  const conv4 = JSON.stringify(c4.a) === JSON.stringify(c4.b) && c4.a.diversity === 4 && c4.a.tier === 3 && near(c4.a.mul, 0.15);
  ok("11b NORTH STAR cruzar umbral ARRIBA: 4 clases distintas ⇒ ambos T3/0.15 idénticos (0 desync de tier/valor)", conv4, `A=${JSON.stringify(c4.a)} B=${JSON.stringify(c4.b)}`);

  // 11c CRUZAR UMBRAL ABAJO: caer a 2 clases ⇒ ambos T1/0.05 idénticos (decae determinista, converge)
  const c2b = await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1 });
  const conv2b = JSON.stringify(c2b.a) === JSON.stringify(c2b.b) && c2b.a.diversity === 2 && c2b.a.tier === 1 && near(c2b.a.mul, 0.05);
  ok("11c NORTH STAR cruzar umbral ABAJO: caer 4→2 clases ⇒ ambos T1/0.05 idénticos (decae determinista, converge)", conv2b, `A=${JSON.stringify(c2b.a)} B=${JSON.stringify(c2b.b)}`);

  // 11d A SALE de la zona ⇒ Δ_A=0 PERO composición/tier server-authoritative de la zona + Δ_B INTACTOS (passive COMPARTIDO, no per-hero). Re-push fresh en ambos.
  await applyBoth({ [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 });   // 3 clases ⇒ T2/0.10 en ambos
  const aLeave = await page.evaluate(() => { const s = window.__dev.confluence({ leave: true }); return { mul: s.confMulRested, tag: s.tag, confable: s.confable, rosters: s.rosters }; });
  const bStill = await pageB.evaluate(() => { const s = window.__dev.confluence(); return { mul: s.confMulRested, tier: s.tier, diversity: s.diversity, tag: s.tag }; });
  const zoneKey = await pageB.evaluate(() => window.__dev.confluence().zone);
  const zoneStillDiverse = !!(aLeave.rosters && aLeave.rosters[zoneKey] && Object.keys(aLeave.rosters[zoneKey]).length === 3);
  const noDesync = aLeave.mul === 0 && aLeave.tag === "" && aLeave.confable === false && zoneStillDiverse && near(bStill.mul, 0.10) && bStill.tier === 2 && bStill.diversity === 3 && bStill.tag === "❈";
  ok("11d NORTH STAR A sale zona: Δ_A=0 + no confable PERO composición/tier compartidos de la zona intactos + Δ_B INTACTO (0.10/T2/❈) — 0 desync", noDesync, `A=${JSON.stringify(aLeave.mul)},confable=${aLeave.confable} zoneRoster=${JSON.stringify(aLeave.rosters ? aLeave.rosters[zoneKey] : null)} B=${JSON.stringify(bStill)}`);

  await page.bringToFront();
  await sleep(250);
  // 12 render badge ON vs OFF (Δ px en la región top-right, mirror CAS-2335) + noise-floor + arco regr + fps
  const sampleRegion = (pg) => pg.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d"); const dpr = window.devicePixelRatio || 1;
    const VW = c.width, VH = c.height;
    const x = Math.max(0, VW - Math.round(300 * dpr)), y = Math.round(300 * dpr), w = Math.round(300 * dpr), h = Math.round(120 * dpr);
    const d = g.getImageData(x, y, Math.min(w, VW - x), Math.min(h, VH - y)).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0;
  });
  // OFF control: enabled false ⇒ renderConfluenceBadge NUNCA corre (gate render.js:368)
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.confluence({ leave: true }); window.__dev.confluence({ enabled: false, clear: true }); });
  await sleep(220);
  const offSum = await sampleRegion(page);
  const offSum2 = await sampleRegion(page);
  const noise = Math.abs(offSum - offSum2);
  // ON: enabled + héroe en zona con composición diversa ⇒ badge ❈ "Confluencia"
  await page.evaluate(() => { const z = window.__dev.confluence().zones[0]; const CLS = window.__dev.confluence().classes; window.__cput(z, { [CLS[0]]: 1, [CLS[1]]: 1, [CLS[2]]: 1 }); });
  await sleep(220);
  const onSum = await sampleRegion(page);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const delta = Math.abs(onSum - offSum);
  ok("12a render badge 'Confluencia' DIBUJA en región top-right (Δ>noise) vs OFF-control", delta > 0 && delta > noise, `offSum=${offSum} onSum=${onSum} delta=${delta} noise=${noise}`);

  // arco regr: todos los flags previos re-activables LIVE (enabled true en DISCO) — 0 regr
  const arcDisk = await page.evaluate(() => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); window.__dev.soul({ enabled: true }); window.__dev.pulse({ enabled: true }); window.__dev.mentor({ enabled: true }); window.__dev.congregation({ enabled: true }); window.__dev.wayfarer({ enabled: true });
    return { standings: window.__dev.standings().enabled, territory: window.__dev.territory().enabled, soul: window.__dev.soul().enabled, pulse: window.__dev.pulse().enabled, mentor: window.__dev.mentor().enabled, cong: window.__dev.congregation().enabled, wayfarer: window.__dev.wayfarer().enabled };
  });
  ok("12b arco previo re-activable LIVE (standings/territory/soul/pulse/mentor/congregation/wayfarer) — 0 regr", Object.values(arcDisk).every(Boolean), JSON.stringify(arcDisk));

  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(r => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); } requestAnimationFrame(f); }); return n; });
  ok("12c fps estable ≥55", fps >= 55, `fps=${fps}`);

  console.log(`\n=== CAS-2338 QA OBSERVABLE: ${PASS} PASS / ${FAIL} FAIL / ${errors.length} JS-err ===`);
  if (errors.length) console.log("ERRORS:", errors.slice(0, 8).join("\n"));
  console.log("build=" + build);
} finally {
  await browser.close();
  await server.close();
}
process.exit(FAIL === 0 && errors.length === 0 ? 0 : 1);
