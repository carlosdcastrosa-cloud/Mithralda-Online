// CAS-2338 — GE self-verify for CONFLUENCIA / DIVERSE COMPANY (DARK, DIVERSE_COMPANY.enabled:false). EVO mecánica #53.
// Eje FRESCO (NO repite Congregación #51): Congregación premia el HEADCOUNT bruto por zona; Confluencia premia la VARIEDAD de COMPOSICIÓN — cuántas
// CLASES/ARQUETIPOS DISTINTOS co-existen en la misma zona. El server empuja { zona → { clase → cuenta } }; el cliente REFLEJA. La DIVERSIDAD = nº de clases
// distintas con cuenta>0. Al cruzar umbrales (2/3/4 clases distintas) la zona entra en Confluencia por tiers y da a TODOS los presentes el MISMO passive (RESTED_XP).
//
// ★ DIFERENCIADOR vs Congregación (check 6b, no-negociable): N CLONES de la MISMA clase (headcount alto) NO abren Confluencia (diversidad 1 ⇒ Tier 0 ⇒ 0);
// SÓLO la MEZCLA de clases distintas la abre. Esto prueba que el eje es COMPOSICIÓN, no densidad.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot de composición server-authoritative
// ⇒ ven diversidad + tier + buff IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral ARRIBA (llega una clase nueva) y ABAJO (una clase se va) CONVERGE en ambos.
// Cualquier desync de diversidad/tier/buff = sev-1. El passive es COMPARTIDO (no per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO la composición/tier
// server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): DIVERSE_COMPANY es la MÁS BAJA del canal restedMult (8ª fuente) ⇒ CEDE a STANDINGS > MENTOR > SOUL > PULSE >
// CONGREGATION > WAYFARER — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del canal está LIVE, para
// OBSERVAR el passive de Confluencia en AISLAMIENTO hay que desactivar esos peers in-memory ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.confluence (flip DIVERSE_COMPANY.enabled IN-MEMORY + inyección del snapshot { zona → { clase → cuenta } } + toZone/leave drivers) +
// __dev.standings/mentor/soul/pulse/congregation/wayfarer/territory/oath/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.confluence + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): DIVERSE_COMPANY.enabled false AND G.confluence NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'confluence'/'confServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA de la DIVERSIDAD: nDistinct→tier (0/1→T0, 2→T1, 3→T2, 4/5→T3) + boost (0/0.05/0.10/0.15) determinista.
//   6a SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ diversidad refleja clases válidas; zona fuera de `zones`, clase desconocida y cuenta ≤0 se DESCARTAN.
//   6b ★ EJE FRESCO: N clones de la MISMA clase (count 50) ⇒ diversidad 1 ⇒ Tier 0 ⇒ 0; sólo la MEZCLA (2+ clases distintas) abre Confluencia.
//   7  CRUCE de umbral ARRIBA y ABAJO (1-página): añadiendo clases 1→2→3→4 el tier sube 0→1→2→3; quitándolas 4→3→2→1 DECAE 3→2→1→0 (determinista, sin histéresis).
//   8  PASSIVE compartido (aislado): peers OFF + snapshot≥umbral + héroe EN la zona ⇒ confMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//   9  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica confMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  10  PRECEDENCIA MÁXIMO ÚNICO: CONF(0.05) CEDE a STANDINGS ⇒ 0 AND a CONGREGATION ⇒ 0 AND a WAYFARER ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ intacto.
//  11  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot ⇒ diversidad/tier/buff IDÉNTICOS byte-a-byte; cruzar umbral arriba/abajo CONVERGE;
//      A sale ⇒ Δ_A=0 PERO composición/tier compartidos + Δ_B INTACTOS (composición compartida, 0 desync).
//  12  render badge "Confluencia" se DIBUJA con la feature ON (Δ px vs OFF-control) + arco regr + fps.
//   0  no JS errors during run.
// Run: node tools/cas2338-confluence-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2338");
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

// helper: desactiva los peers DEFAULT-ON del mismo canal restedMult (todo el arco LIVE) para medir Confluencia en AISLAMIENTO; y encuentra una zona confluible
// donde toZone aterriza al héroe DENTRO tras inyectar una composición con `nDistinct` clases distintas (cada una count 1).
async function installPick(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); };
    // construye un roster { clase → 1 } con las primeras `nDistinct` clases de DIVERSE_COMPANY.classes
    window.__roster = (nDistinct) => { const cls = (window.__dev.confluence().classes || []); const r = {}; for (let i = 0; i < nDistinct && i < cls.length; i++) r[cls[i]] = 1; return r; };
    // inyecta un roster de `nDistinct` clases distintas en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (confable + zona coincide).
    window.__cpick = (nDistinct) => {
      window.__dev.confluence({ enabled: true });
      const zones = window.__dev.confluence().zones || [];
      for (const z of zones) {
        const rr = {}; rr[z] = window.__roster(nDistinct); window.__dev.confluence({ rosters: rr });
        const s = window.__dev.confluence({ toZone: z });
        if (s.zone === z && s.confable) return { zone: z, diversity: s.diversity, tier: s.tier, boost: s.confMulRested };
      }
      return null;
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
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.confluence && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.wayfarer && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.confluence + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.confluence never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.confluence());
  ok("2 byte-id OFF (fresh boot): DIVERSE_COMPANY.enabled false AND G.confluence NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.diversity === 0 && dark.boost === 0 && dark.tag === "" && dark.rosters === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} diversity=${dark.diversity} boost=${dark.boost} tag="${dark.tag}" rosters=${JSON.stringify(dark.rosters)}`);

  // 3 save OFF has no 'confluence'/'confServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'confluence'/'confServer' key in save blob (estado 100% derivado/transitorio)", !/"conf(luence|Server)"/.test(saveOff) && !/confServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.confluence({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.confluence({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 tier table = pure fn of DIVERSITY: nDistinct→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const w = window.__cpick(4); if (!w) return { bad: true };   // land in a confluible zone at max tier
    const zone = w.zone; const out = [];
    for (const n of [0, 1, 2, 3, 4, 5]) {
      const rr = {}; rr[zone] = window.__roster(n); window.__dev.confluence({ rosters: rr });
      const s = window.__dev.confluence({ toZone: zone });
      out.push({ n, diversity: s.diversity, tier: s.tier, boost: s.confMulRested });
    }
    return { zone, out };
  });
  const expTier = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 3 };
  const expBoost = { 0: 0, 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 5: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => r.diversity === r.n && r.tier === expTier[r.n] && near(r.boost, expBoost[r.n]));
  ok("5 TABLA de tiers = función PURA de la DIVERSIDAD: nDistinct→tier (0/1→T0,2→T1,3→T2,4/5→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 6a server-authoritative reflect + validate (drop out-of-zones + unknown class + counts ≤0)
  const refl = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const zones = window.__dev.confluence().zones;
    const z0 = zones[0];
    window.__dev.confluence({ rosters: { [z0]: { warrior: 2, mage: 1, ranger: 4, priest: -3 }, town: { warrior: 1, mage: 1 } } });
    const s = window.__dev.confluence({ toZone: z0 });
    return { z0, diversity: s.diversity, roster: s.roster, rosters: s.rosters };
  });
  // warrior(2) + mage(1) válidas ⇒ diversidad 2; ranger desconocida ⇒ descartada; priest(-3) ⇒ descartada; town fuera de zones ⇒ descartada
  const reflOk = refl.diversity === 2 && !("ranger" in (refl.roster || {})) && !("priest" in (refl.roster || {})) && !("town" in (refl.rosters || {})) && (refl.roster.warrior === 2 && refl.roster.mage === 1);
  ok("6a SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ diversidad refleja clases válidas; zona fuera de `zones`, clase desconocida y cuenta ≤0 DESCARTADAS",
     reflOk, JSON.stringify(refl));

  // 6b ★ FRESH AXIS: N clones of the SAME class (count 50) ⇒ diversity 1 ⇒ Tier 0 ⇒ 0; only a MIX opens Confluencia
  const fresh = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const w = window.__cpick(2); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.confluence({ rosters: { [zone]: { warrior: 50 } } });   // 50 del MISMO arquetipo
    const clones = window.__dev.confluence({ toZone: zone });
    window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });  // mezcla mínima
    const mixed = window.__dev.confluence({ toZone: zone });
    return { zone, clonesDiv: clones.diversity, clonesTier: clones.tier, clonesBoost: clones.confMulRested, mixedDiv: mixed.diversity, mixedTier: mixed.tier, mixedBoost: mixed.confMulRested };
  });
  ok("6b ★ EJE FRESCO: 50 clones de la MISMA clase ⇒ diversidad 1 / Tier 0 / boost 0 (headcount NO abre); mezcla 2 clases ⇒ diversidad 2 / T1 / 0.05 (variedad SÍ abre)",
     !fresh.bad && fresh.clonesDiv === 1 && fresh.clonesTier === 0 && fresh.clonesBoost === 0 && fresh.mixedDiv === 2 && fresh.mixedTier === 1 && near(fresh.mixedBoost, 0.05),
     JSON.stringify(fresh));

  // 7 threshold up + down (single page)
  const cross = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const w = window.__cpick(1); if (!w) return { bad: true };
    const zone = w.zone; const up = [], down = [];
    for (const n of [1, 2, 3, 4]) { const rr = {}; rr[zone] = window.__roster(n); window.__dev.confluence({ rosters: rr }); up.push(window.__dev.confluence({ toZone: zone }).tier); }
    for (const n of [4, 3, 2, 1]) { const rr = {}; rr[zone] = window.__roster(n); window.__dev.confluence({ rosters: rr }); down.push(window.__dev.confluence({ toZone: zone }).tier); }
    return { zone, up, down };
  });
  const crossOk = !cross.bad && JSON.stringify(cross.up) === JSON.stringify([0, 1, 2, 3]) && JSON.stringify(cross.down) === JSON.stringify([3, 2, 1, 0]);
  ok("7 CRUCE de umbral ARRIBA/ABAJO: añadiendo clases 1→2→3→4 tier 0→1→2→3; quitándolas 4→3→2→1 DECAE 3→2→1→0 (determinista, sin histéresis)",
     crossOk, `zone=${cross.zone} up=${JSON.stringify(cross.up)} down=${JSON.stringify(cross.down)}`);

  // 8 passive isolated: in-zone ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const w = window.__cpick(3); if (!w) return { bad: true };            // diversity 3 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.confluence({ toZone: w.zone });
    const out = window.__dev.confluence({ leave: true });
    return { zone: w.zone, inMul: inz.confMulRested, inTier: inz.tier, inDiv: inz.diversity, outMul: out.confMulRested, outTier: out.tier };
  });
  ok("8 PASSIVE compartido (aislado): héroe EN la zona con snapshot≥umbral ⇒ confMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.inDiv === 3 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 9 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /confMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso();
    const w = window.__cpick(2); if (!w) return { bad: true };            // diversity 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.confluence({ toZone: w.zone }).confMulRested;
    window.__dev.confluence({ enabled: false });
    const s = window.__dev.confluence({ toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.confMulRested, tag: s.tag };
  });
  ok("9 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma confMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 10 precedence: CONF cedes to STANDINGS + CONGREGATION + WAYFARER (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.confluence({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__cpick(2); if (!w) return { bad: true };            // base sin peers ⇒ 0.05
    const zone = w.zone; const setRoster = () => { const rr = {}; rr[zone] = window.__roster(2); window.__dev.confluence({ rosters: rr }); };
    const base = window.__dev.confluence({ toZone: zone }).confMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ confMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    setRoster(); const s1 = window.__dev.confluence({ toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.confMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs CONGREGATION: headcount≥umbral en la MISMA zona ⇒ congMul>0 ⇒ confMul CEDE
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    setRoster(); const s2 = window.__dev.confluence({ toZone: zone }); const congPeer = s2.congMulRested, congCeded = s2.confMulRested;
    window.__dev.congregation({ enabled: false });
    // (c) vs WAYFARER: celda trillada en la MISMA posición ⇒ wayfarerMul>0 ⇒ confMul CEDE
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    setRoster(); const s3 = window.__dev.confluence({ toZone: zone }); const wayPeer = s3.wayfarerMulRested, wayCeded = s3.confMulRested;
    window.__dev.wayfarer({ enabled: false });
    // (d) vs TERRITORY (⊥ safeRegen): NO afecta confMul ⇒ intacto
    setRoster(); window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.confluence({ toZone: zone }).confMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, congPeer, congCeded, wayPeer, wayCeded, terrCoexist };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: CONF(0.05) CEDE a STANDINGS ⇒ 0 AND a CONGREGATION ⇒ 0 AND a WAYFARER ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.congPeer > 0 && prec.congCeded === 0 &&
     prec.wayPeer > 0 && prec.wayCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 12 render badge draws with feature ON (Δ px vs OFF-control) — measured on THIS page before opening page2
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); });
  await page.evaluate(() => window.__dev.confluence({ enabled: false }));
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate(() => { const w = window.__cpick(4); if (w) window.__dev.confluence({ toZone: w.zone }); });
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, cong: !!window.__dev.congregation, way: !!window.__dev.wayfarer, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12 render badge 'Confluencia' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps",
     sumOn !== sumOff && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.cong && arc.way && arc.ledger && fps >= 55,
     `sumOff=${sumOff} sumOn=${sumOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 11 ★ NORTH STAR — 2-client convergence (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installPick(page2);

  // page2 picks a confluible zone (diversity 3 ⇒ T2); page1 applies the SAME composition snapshot on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.confluence({ enabled: true }); window.__iso(); return window.__cpick(3); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    const mk = (n) => { const r = {}; const cls = ["warrior", "paladin", "mage", "druid", "priest"]; for (let i = 0; i < n; i++) r[cls[i]] = 1; return r; };
    // page1: isolate peers, enable, SAME snapshot {zone: 3 distinct}, teleport in-zone
    const a = await page.evaluate((z, ros) => { window.__dev.confluence({ enabled: true }); window.__iso();
      window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(3));
    const b = await page2.evaluate((z, ros) => { window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(3));
    // cross threshold UP (a new class arrives ⇒ 4 distinct): both converge to T3
    const aUp = await page.evaluate((z, ros) => { window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(4));
    const bUp = await page2.evaluate((z, ros) => { window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(4));
    // cross threshold DOWN (classes leave ⇒ 2 distinct): both converge to T1
    const aDn = await page.evaluate((z, ros) => { window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(2));
    const bDn = await page2.evaluate((z, ros) => { window.__dev.confluence({ rosters: { [z]: ros } }); return window.__dev.confluence({ toZone: z }); }, zone, mk(2));
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared composition/tier + B's Δ must stay intact (diversity still 2 ⇒ T1)
    const aOut = await page.evaluate(() => window.__dev.confluence({ leave: true }));
    const bAfter = await page2.evaluate((z) => window.__dev.confluence({ toZone: z }), zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aD: a.diversity, bD: b.diversity, aM: a.confMulRested, bM: b.confMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpM: aUp.confMulRested, bUpM: bUp.confMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnM: aDn.confMulRested, bDnM: bDn.confMulRested, aOutM: aOut.confMulRested, aOutT: aOut.tier,
      bAfterD: bAfter.diversity, bAfterT: bAfter.tier, bAfterM: bAfter.confMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 2 && north.aD === north.bD && north.aD === 3 && near(north.aM, north.bM) && near(north.aM, 0.10) &&   // baseline T2 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&                                   // UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 1 && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&                                   // DOWN converges T1
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                    // A leaves ⇒ Δ_A 0
    north.bAfterD === 2 && north.bAfterT === 1 && near(north.bAfterM, 0.05);                                                                     // B + shared composition/tier intact
  ok("11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO snapshot ⇒ diversidad/tier/buff IDÉNTICOS; cruzar umbral arriba(T3)/abajo(T1) CONVERGE; A sale ⇒ Δ_A=0 pero composición/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2338 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
