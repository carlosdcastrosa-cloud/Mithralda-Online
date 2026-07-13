// CAS-2332 — GE self-verify for CONGREGACIÓN / GATHERING DENSITY (DARK, CONGREGATION.enabled:false). EVO mecánica #51.
// La mecánica MÁS multiplayer-native del arco: CELEBRA el pilar de CONCURRENCIA Y ESCALA. La dirige el HEADCOUNT REAL de jugadores LIVE por zona
// (presencia SERVER-AUTHORITATIVE), NO un reloj (World Pulse #50) NI un vínculo/proximidad (Fellowship/Mentor/Soul #47–49). Al cruzar umbrales de
// headcount, la zona entra en Congregación por tiers y otorga a TODOS los presentes el MISMO passive escalable (canal RESTED_XP). Forma hubs orgánicos.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO snapshot de
// presencia server-authoritative { zona → cuenta } ⇒ ven tier + cuenta + buff IDÉNTICOS byte-a-byte (0 desync). Cruzar umbral ARRIBA (entra jugador)
// y ABAJO (sale/logout) CONVERGE en ambos (mismo tier tras el evento). Cualquier desync de cuenta/tier/buff = sev-1. El passive es COMPARTIDO (no
// per-hero): A SALE físicamente de la zona ⇒ su Δ cae a 0 PERO la cuenta/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): CONGREGATION es la MÁS BAJA del canal restedMult ⇒ CEDE a STANDINGS(colectivo) > MENTOR(personal) >
// SOUL(recuperación) > PULSE(ambiental) — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) ⊥ ⇒ coexisten. Como TODO el arco
// del canal está LIVE (standings/mentor/soul/pulse enabled:true), para OBSERVAR el passive de Congregación en AISLAMIENTO hay que desactivar esos peers
// in-memory (footgun heredado CAS-2326/2329) ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.congregation (flip CONGREGATION.enabled IN-MEMORY + inyección del snapshot de presencia { zona → cuenta } que empuja el server +
// toZone/leave drivers de proximidad) + __dev.standings/mentor/soul/pulse/territory/oath/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.congregation + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): CONGREGATION.enabled false AND G.congregation NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'congregation'/'congServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA del headcount: count→tier determinista (0/1→T0, 2/3→T1, 4/7→T2, 8/100→T3) + boost por tier (0/0.05/0.10/0.15).
//   6  SERVER-AUTHORITATIVE reflect: inyectar snapshot ⇒ congCount refleja la zona válida; zona fuera de `zones` y cuenta ≤0 se DESCARTAN (cliente sólo refleja).
//   7  CRUCE de umbral ARRIBA y ABAJO (1-página): subiendo la cuenta 1→2→4→8 el tier sube 0→1→2→3; bajando 8→4→2→1 DECAE 3→2→1→0 (determinista, sin histéresis).
//   8  PASSIVE compartido (aislado): peers OFF + snapshot≥umbral + héroe EN la zona ⇒ congMulRested==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//   9  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica congMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  10  PRECEDENCIA MÁXIMO ÚNICO: CONG(0.05) CEDE a STANDINGS ⇒ 0 AND CEDE a SOUL ⇒ 0 AND CEDE a PULSE ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ intacto.
//  11  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot ⇒ tier/cuenta/buff IDÉNTICOS byte-a-byte; cruzar umbral arriba/abajo CONVERGE
//      en ambos; A sale de la zona ⇒ Δ_A=0 PERO cuenta/tier compartidos + Δ_B INTACTOS (concurrencia compartida, 0 desync).
//  12  render badge "Congregación" se DIBUJA con la feature ON (Δ px vs OFF-control) + arco regr (STANDINGS/TERRITORY/CONTEST/FELLOWSHIP/MENTOR/SOUL/PULSE/LEDGER) + fps.
//   0  no JS errors during run.
// Run: node tools/cas2332-congregation-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2332");
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

// helper: desactiva los peers DEFAULT-ON del mismo canal restedMult para medir Congregación en AISLAMIENTO; y encuentra una zona congregable donde
// toZone aterriza al héroe DENTRO de ella tras inyectar el snapshot con `count`.
async function installPick(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); };
    // inyecta `count` en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (congable + zona coincide).
    window.__cpick = (count) => {
      window.__dev.congregation({ enabled: true });
      const zones = window.__dev.congregation().zones || [];
      for (const z of zones) {
        const cc = {}; cc[z] = count; window.__dev.congregation({ counts: cc });
        const s = window.__dev.congregation({ toZone: z });
        if (s.zone === z && s.congable) return { zone: z, count: s.count, tier: s.tier, boost: s.congMulRested };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.congregation && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.congregation + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.congregation never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.congregation());
  ok("2 byte-id OFF (fresh boot): CONGREGATION.enabled false AND G.congregation NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.count === 0 && dark.boost === 0 && dark.tag === "" && dark.counts === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} count=${dark.count} boost=${dark.boost} tag="${dark.tag}" counts=${JSON.stringify(dark.counts)}`);

  // 3 save OFF has no 'congregation'/'congServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'congregation'/'congServer' key in save blob (estado 100% derivado/transitorio)", !/"cong(regation|Server)"/.test(saveOff) && !/congServer/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.congregation({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.congregation({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 tier table = pure fn of headcount: count→tier + boost, deterministic
  const tab = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();
    const w = window.__cpick(8); if (!w) return { bad: true };   // land in a congregable zone at max tier
    const zone = w.zone; const out = [];
    for (const n of [0, 1, 2, 3, 4, 7, 8, 100]) {
      const cc = {}; cc[zone] = n; window.__dev.congregation({ counts: cc });
      const s = window.__dev.congregation({ toZone: zone });
      out.push({ n, tier: s.tier, boost: s.congMulRested });
    }
    return { zone, out };
  });
  const expTier = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 7: 2, 8: 3, 100: 3 };
  const expBoost = { 0: 0, 1: 0, 2: 0.05, 3: 0.05, 4: 0.10, 7: 0.10, 8: 0.15, 100: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => r.tier === expTier[r.n] && near(r.boost, expBoost[r.n]));
  ok("5 TABLA de tiers = función PURA del headcount: count→tier (0/1→T0,2/3→T1,4/7→T2,8/100→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 6 server-authoritative reflect + validate (drop out-of-zones + counts ≤0)
  const refl = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();
    const zones = window.__dev.congregation().zones;
    const z0 = zones[0];
    window.__dev.congregation({ counts: { [z0]: 5, town: 9, bogus: 7, [zones[1]]: -3 } });
    const s = window.__dev.congregation({ toZone: z0 });
    return { z0, zones, countZ0: s.count, keys: Object.keys(s.counts || {}), snapshot: s.counts };
  });
  const reflOk = refl.countZ0 === 5 && refl.keys.length === 1 && refl.keys[0] === refl.z0 && !("town" in (refl.snapshot||{})) && !("bogus" in (refl.snapshot||{}));
  ok("6 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ congCount refleja zona válida; zona fuera de `zones` y cuenta ≤0 DESCARTADAS (cliente sólo refleja)",
     reflOk, JSON.stringify(refl));

  // 7 threshold up + down (single page)
  const cross = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();
    const w = window.__cpick(1); if (!w) return { bad: true };
    const zone = w.zone; const up = [], down = [];
    for (const n of [1, 2, 4, 8]) { const cc = {}; cc[zone] = n; window.__dev.congregation({ counts: cc }); up.push(window.__dev.congregation({ toZone: zone }).tier); }
    for (const n of [8, 4, 2, 1]) { const cc = {}; cc[zone] = n; window.__dev.congregation({ counts: cc }); down.push(window.__dev.congregation({ toZone: zone }).tier); }
    return { zone, up, down };
  });
  const crossOk = !cross.bad && JSON.stringify(cross.up) === JSON.stringify([0, 1, 2, 3]) && JSON.stringify(cross.down) === JSON.stringify([3, 2, 1, 0]);
  ok("7 CRUCE de umbral ARRIBA/ABAJO: subiendo 1→2→4→8 tier 0→1→2→3; bajando 8→4→2→1 DECAE 3→2→1→0 (determinista, sin histéresis)",
     crossOk, `zone=${cross.zone} up=${JSON.stringify(cross.up)} down=${JSON.stringify(cross.down)}`);

  // 8 passive isolated: in-zone ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();
    const w = window.__cpick(4); if (!w) return { bad: true };            // count 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.congregation({ toZone: w.zone });
    const out = window.__dev.congregation({ leave: true });
    return { zone: w.zone, inMul: inz.congMulRested, inTier: inz.tier, inCount: inz.count, outMul: out.congMulRested, outTier: out.tier };
  });
  ok("8 PASSIVE compartido (aislado): héroe EN la zona con snapshot≥umbral ⇒ congMulRested==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.inCount === 4 && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 9 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /congMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso();
    const w = window.__cpick(2); if (!w) return { bad: true };            // count 2 ⇒ Tier 1 ⇒ 0.05
    const onMul = window.__dev.congregation({ toZone: w.zone }).congMulRested;
    window.__dev.congregation({ enabled: false });
    const s = window.__dev.congregation({ toZone: w.zone });
    return { onMul, enabled: s.enabled, mul: s.congMulRested, tag: s.tag };
  });
  ok("9 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma congMul(h,'restedMult') (T1=0.05); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.05) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 10 precedence: CONG cedes to STANDINGS + SOUL + PULSE (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.congregation({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__cpick(2); if (!w) return { bad: true };            // base sin peers ⇒ 0.05
    const zone = w.zone; const base = window.__dev.congregation({ toZone: zone }).congMulRested;
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ congMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const s1 = window.__dev.congregation({ toZone: zone }); const standPeer = s1.standingsMulRested, standCeded = s1.congMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs SOUL: recupera/muere ⇒ soulMul>0 ⇒ congMul CEDE
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: 1234 * 300000 }); window.__dev.soul({ die: true });
    const s2 = window.__dev.congregation({ toZone: zone }); const soulPeer = s2.soulMulRested, soulCeded = s2.congMulRested;
    window.__dev.soul({ enabled: false });
    // (c) vs PULSE: pulso vivo en la MISMA zona ⇒ pulseMul>0 ⇒ congMul CEDE
    window.__dev.pulse({ enabled: true });
    let pulsePeer = 0, pulseCeded = base;
    for (let p = 1000; p < 1120; p++) { const nm = p * 240000 + 24000; const ps = window.__dev.pulse({ nowMs: nm });
      if (ps.live && ps.zone === zone) { const cc = {}; cc[zone] = 2; window.__dev.congregation({ counts: cc });
        const s3 = window.__dev.congregation({ toZone: zone }); pulsePeer = s3.pulseMulRested; pulseCeded = s3.congMulRested; break; } }
    window.__dev.pulse({ enabled: false });
    // (d) vs TERRITORY (⊥ safeRegen): NO afecta congMul ⇒ intacto
    const cc = {}; cc[zone] = 2; window.__dev.congregation({ counts: cc });
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.congregation({ toZone: zone }).congMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, soulPeer, soulCeded, pulsePeer, pulseCeded, terrCoexist };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: CONG(0.05) CEDE a STANDINGS ⇒ 0 AND a SOUL ⇒ 0 AND a PULSE ⇒ 0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.05 intacto",
     !prec.bad && near(prec.base, 0.05) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 &&
     prec.pulsePeer > 0 && prec.pulseCeded === 0 && near(prec.terrCoexist, 0.05), JSON.stringify(prec));

  // 12 render badge draws with feature ON (Δ px vs OFF-control) — measured on THIS page before opening page2
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); });
  await page.evaluate(() => window.__dev.congregation({ enabled: false }));
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 360).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate(() => { const w = window.__cpick(8); if (w) window.__dev.congregation({ toZone: w.zone }); });
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 360).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, pulse: !!window.__dev.pulse, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12 render badge 'Congregación' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps",
     sumOn !== sumOff && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.pulse && arc.ledger && fps >= 55,
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

  // page2 picks a congregable zone (count 4 ⇒ T2); page1 applies the SAME server snapshot on the SAME zone ⇒ must converge byte-a-byte.
  const w2 = await page2.evaluate(() => { window.__dev.congregation({ enabled: true }); window.__iso(); return window.__cpick(4); });
  const north = w2 ? await (async () => {
    const zone = w2.zone;
    // page1: isolate peers, enable, SAME snapshot {zone:4}, teleport in-zone
    const a = await page.evaluate((z) => { window.__dev.congregation({ enabled: true }); window.__iso();
      const cc = {}; cc[z] = 4; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    const b = await page2.evaluate((z) => { const cc = {}; cc[z] = 4; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    // cross threshold UP (player enters ⇒ count 8): both converge to T3
    const aUp = await page.evaluate((z) => { const cc = {}; cc[z] = 8; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    const bUp = await page2.evaluate((z) => { const cc = {}; cc[z] = 8; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    // cross threshold DOWN (logout ⇒ count 2): both converge to T1
    const aDn = await page.evaluate((z) => { const cc = {}; cc[z] = 2; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    const bDn = await page2.evaluate((z) => { const cc = {}; cc[z] = 2; window.__dev.congregation({ counts: cc }); return window.__dev.congregation({ toZone: z }); }, zone);
    // A leaves the zone physically ⇒ A's Δ falls to 0; shared count/tier + B's Δ must stay intact (count still 2 ⇒ T1)
    const aOut = await page.evaluate((z) => window.__dev.congregation({ leave: true }), zone);
    const bAfter = await page2.evaluate((z) => window.__dev.congregation({ toZone: z }), zone);
    return {
      zone, aZ: a.zone, bZ: b.zone, aT: a.tier, bT: b.tier, aC: a.count, bC: b.count, aM: a.congMulRested, bM: b.congMulRested,
      aUpT: aUp.tier, bUpT: bUp.tier, aUpM: aUp.congMulRested, bUpM: bUp.congMulRested,
      aDnT: aDn.tier, bDnT: bDn.tier, aDnM: aDn.congMulRested, bDnM: bDn.congMulRested, aOutM: aOut.congMulRested, aOutT: aOut.tier,
      bAfterC: bAfter.count, bAfterT: bAfter.tier, bAfterM: bAfter.congMulRested,
    };
  })() : { bad: true };
  const northOk = !north.bad &&
    north.aZ === north.bZ && north.aZ === north.zone &&
    north.aT === north.bT && north.aT === 2 && north.aC === north.bC && north.aC === 4 && near(north.aM, north.bM) && near(north.aM, 0.10) &&   // baseline T2 identical
    north.aUpT === north.bUpT && north.aUpT === 3 && near(north.aUpM, north.bUpM) && near(north.aUpM, 0.15) &&                                   // UP converges T3
    north.aDnT === north.bDnT && north.aDnT === 1 && near(north.aDnM, north.bDnM) && near(north.aDnM, 0.05) &&                                   // DOWN converges T1
    north.aOutM === 0 && north.aOutT === 0 &&                                                                                                    // A leaves ⇒ Δ_A 0
    north.bAfterC === 2 && north.bAfterT === 1 && near(north.bAfterM, 0.05);                                                                     // B + shared count/tier intact
  ok("11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO snapshot ⇒ tier/cuenta/buff IDÉNTICOS; cruzar umbral arriba(T3)/abajo(T1) CONVERGE; A sale ⇒ Δ_A=0 pero cuenta/tier compartidos + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2332 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
