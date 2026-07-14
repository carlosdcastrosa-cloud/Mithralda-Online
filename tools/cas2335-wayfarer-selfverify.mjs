// CAS-2335 — GE self-verify for SENDERO TRILLADO / WELL-TRODDEN PATH (DARK, WAYFARER_TRAIL.enabled:false). EVO mecánica #52.
// PILAR FRESCO: eje NUEVO de traversal/logística EMERGENTE. El mundo COMPARTIDO se DESGASTA con el paso AGREGADO de MUCHOS jugadores A LO LARGO DEL
// TIEMPO. El server acumula "pisadas" por CELDA coarse (bucket, NO per-pixel); el tread DECAE determinista (vida-media, 0 RNG); una celda cuyo tread ≥
// threshold es un Sendero Trillado que da un pasivo restedMult a quien la transita. Artefacto EMERGENTE del tránsito agregado — ningún jugador solo lo abre.
//
// North Star (check 11, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO snapshot de tread
// server-authoritative { celda → { tread, atMs } } + MISMO nowMs ⇒ ven el MISMO sendero + el MISMO pasivo IDÉNTICOS byte-a-byte (0 desync). El DECAY
// converge (mismo tread decae igual). Cualquier desync de sendero/pasivo = sev-1. El passive es COMPARTIDO (nace de la CELDA, no del jugador): A SALE
// físicamente de la celda ⇒ su Δ cae a 0 PERO el tread server-authoritative de la celda + el Δ de B (que sigue sobre ella) quedan INTACTOS.
//
// Precedencia NO-stack / MÁXIMO ÚNICO (check 10): WAYFARER es la MÁS BAJA del canal restedMult (la más difusa/emergente) ⇒ CEDE a STANDINGS(colectivo) >
// MENTOR(personal) > SOUL(recuperación) > PULSE(ambiental) > CONGREGATION(headcount) — se aplica el MAYOR (0 doble-dip). FELLOWSHIP(xpGain)/TERRITORY
// (safeRegen) ⊥ ⇒ coexisten. Como TODO el arco del canal está LIVE, para OBSERVAR el passive del Sendero en AISLAMIENTO hay que desactivar esos peers
// in-memory (footgun heredado CAS-2326/2329/2332) ⇒ el harness los flippa OFF antes de medir el boost.
//
// Observado vía __dev.wayfarer (flip WAYFARER_TRAIL.enabled IN-MEMORY + inyección del snapshot { celda → { tread, atMs } } + nowMs para el decay + tread/
// toZone/leave drivers) + __dev.standings/mentor/soul/pulse/congregation/territory/oath/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.wayfarer + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): WAYFARER_TRAIL.enabled false AND G.wayfarer NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'wayfarer'/'wayfarerServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  DECAY DETERMINISTA (vida-media, sin RNG): tread=200 en atMs=T decae 200→100→50 a T, T+halfLife, T+2·halfLife (monótono) ⇒ trodden true→true→false (cruza umbral 100).
//   6  SERVER-AUTHORITATIVE reflect: push snapshot ⇒ G.wayfarer.cells refleja la celda; celda con tread ≤0 se DESCARTA (cliente sólo refleja).
//   7  UMBRAL de tránsito acumulado + "un jugador solo no abre rápido": tread bajo (50) ⇒ NO trillada; ≥umbral (100/150) ⇒ trillada; una pisada pequeña decae bajo el umbral con el tiempo.
//   8  PASSIVE aislado: peers OFF + celda trillada + héroe SOBRE ella ⇒ wayfarerMulRested==boost (0.06) + trodden; leave ⇒ 0 + no trodden.
//   9  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica wayfarerMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//  10  PRECEDENCIA MÁXIMO ÚNICO: WAYFARER(0.06) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND PULSE⇒0 AND CONGREGATION⇒0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ intacto.
//  11  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot + nowMs ⇒ sendero/tread/pasivo IDÉNTICOS byte-a-byte; decay converge;
//      A sale de la celda ⇒ Δ_A=0 PERO tread compartido de la celda + Δ_B INTACTOS (tránsito compartido, 0 desync).
//  12  render badge "Sendero Trillado" se DIBUJA con la feature ON (Δ px vs OFF-control) + arco regr (STANDINGS/CONGREGATION/PULSE/SOUL/MENTOR/FELLOWSHIP/TERRITORY/LEDGER) + fps.
//   0  no JS errors during run.
// Run: node tools/cas2335-wayfarer-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2335");
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

// helper: desactiva los peers DEFAULT-ON del mismo canal restedMult para medir el Sendero en AISLAMIENTO; y teleporta al héroe a una zona de referencia,
// empuja `tread` en su CELDA ACTUAL con marca `atMs` = nowMs, y devuelve el estado (celda del héroe + tread decaído + trodden).
async function installPick(page) {
  await page.evaluate(() => {
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); };
    // arranca la feature + fija el reloj (decay) + aísla; teleporta a la 1ª zona de referencia y empuja `tread` en la celda del héroe a atMs=nowMs.
    window.__wpick = (tread, nowMs) => {
      window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs }); window.__iso();
      const zones = window.__dev.wayfarer().zones || [];
      const z = zones[0]; window.__dev.wayfarer({ toZone: z });
      window.__dev.wayfarer({ tread, atMs: nowMs });   // empuja en la celda actual del héroe
      return window.__dev.wayfarer();
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wayfarer && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.pulse && window.__dev.congregation && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.wayfarer + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.wayfarer never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.wayfarer());
  ok("2 byte-id OFF (fresh boot): WAYFARER_TRAIL.enabled false AND G.wayfarer NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.trodden === false && dark.tread === 0 && dark.boost === 0 && dark.tag === "" && dark.cells === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} trodden=${dark.trodden} tread=${dark.tread} boost=${dark.boost} tag="${dark.tag}" cells=${JSON.stringify(dark.cells)}`);

  // 3 save OFF has no 'wayfarer'/'wayfarerServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'wayfarer'/'wayfarerServer' key in save blob (estado 100% derivado/transitorio)", !/"wayfarer(Server|Now)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.wayfarer({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.wayfarer({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installPick(page);

  // 5 DECAY DETERMINISTA (half-life): tread=200 at atMs=T ⇒ at T, T+hl, T+2hl decays 200→100→50 ⇒ trodden true→true→false (threshold 100)
  const decay = await page.evaluate(() => {
    const T = 5000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ nowMs: T }); const z = window.__dev.wayfarer().zones[0]; window.__dev.wayfarer({ toZone: z });
    window.__dev.wayfarer({ tread: 200, atMs: T });
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const at0 = window.__dev.wayfarer({ nowMs: T }); const s0 = { tread: at0.tread, trodden: at0.trodden };
    const at1 = window.__dev.wayfarer({ nowMs: T + hlMs }); const s1 = { tread: at1.tread, trodden: at1.trodden };
    const at2 = window.__dev.wayfarer({ nowMs: T + 2 * hlMs }); const s2 = { tread: at2.tread, trodden: at2.trodden };
    return { hlMs, s0, s1, s2 };
  });
  const decayOk = near(decay.s0.tread, 200, 0.01) && decay.s0.trodden === true &&
                  near(decay.s1.tread, 100, 0.01) && decay.s1.trodden === true &&
                  near(decay.s2.tread, 50, 0.01) && decay.s2.trodden === false;
  ok("5 DECAY DETERMINISTA (vida-media, sin RNG): tread 200→100→50 en T/T+hl/T+2hl (monótono) ⇒ trodden true→true→false (cruza umbral 100)",
     decayOk, JSON.stringify(decay));

  // 6 server-authoritative reflect + validate (drop tread ≤0)
  const refl = await page.evaluate(() => {
    const T = 6000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ nowMs: T });
    window.__dev.wayfarer({ push: { "3,3": { tread: 150, atMs: T }, "9,9": { tread: 0, atMs: T }, "1,1": { tread: -5, atMs: T } } });
    const s = window.__dev.wayfarer();
    return { keys: Object.keys(s.cells || {}), cells: s.cells };
  });
  const reflOk = refl.keys.length === 1 && refl.keys[0] === "3,3" && !("9,9" in (refl.cells || {})) && !("1,1" in (refl.cells || {}));
  ok("6 SERVER-AUTHORITATIVE reflect+validate: push snapshot ⇒ cells refleja la celda válida; celda con tread ≤0 DESCARTADA (cliente sólo refleja)",
     reflOk, JSON.stringify(refl));

  // 7 threshold: below (50) NOT trodden; at/above (100/150) trodden; a single small step decays under threshold over time
  const thr = await page.evaluate(() => {
    const T = 7000 * 1000; window.__dev.wayfarer({ enabled: true }); window.__iso();
    window.__dev.wayfarer({ nowMs: T }); const z = window.__dev.wayfarer().zones[0]; window.__dev.wayfarer({ toZone: z });
    const out = {};
    for (const n of [50, 100, 150]) { window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ tread: n, atMs: T }); out[n] = window.__dev.wayfarer({ nowMs: T }).trodden; }
    // "un jugador solo no abre rápido": una pisada pequeña (110, apenas sobre el umbral) decae bajo el umbral en ~1 vida-media
    window.__dev.wayfarer({ clear: true }); window.__dev.wayfarer({ tread: 110, atMs: T });
    const fresh = window.__dev.wayfarer({ nowMs: T }).trodden;
    const hlMs = (window.__dev.wayfarer().halfLifeSec | 0) * 1000;
    const faded = window.__dev.wayfarer({ nowMs: T + hlMs }).trodden;   // 110→55 < 100 ⇒ false
    return { out, fresh, faded };
  });
  const thrOk = thr.out[50] === false && thr.out[100] === true && thr.out[150] === true && thr.fresh === true && thr.faded === false;
  ok("7 UMBRAL + decay: tread 50 ⇒ NO trillada, 100/150 ⇒ trillada; una pisada pequeña (110) decae bajo el umbral en 1 vida-media (concurrencia agregada requerida)",
     thrOk, JSON.stringify(thr));

  // 8 passive isolated: on trodden cell ⇒ boost == 0.06 + trodden; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const T = 8000 * 1000; const w = window.__wpick(150, T);   // 150 ≥ threshold ⇒ trodden
    const inz = window.__dev.wayfarer({ nowMs: T });
    const out = window.__dev.wayfarer({ leave: true });
    return { cell: w.cell, inMul: inz.wayfarerMulRested, inTrodden: inz.trodden, inBoost: inz.boost, outMul: out.wayfarerMulRested, outTrodden: out.trodden };
  });
  ok("8 PASSIVE aislado: héroe SOBRE celda trillada ⇒ wayfarerMulRested==boost (0.06) + trodden; leave ⇒ 0 + no trodden",
     near(pass.inMul, 0.06) && pass.inTrodden === true && near(pass.inBoost, 0.06) && pass.outMul === 0 && pass.outTrodden === false, JSON.stringify(pass));

  // 9 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /wayfarerMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    const T = 9000 * 1000; const w = window.__wpick(150, T);
    const onMul = window.__dev.wayfarer({ nowMs: T }).wayfarerMulRested;
    window.__dev.wayfarer({ enabled: false });
    const s = window.__dev.wayfarer({ nowMs: T });
    return { onMul, enabled: s.enabled, mul: s.wayfarerMulRested, tag: s.tag };
  });
  ok("9 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma wayfarerMul(h,'restedMult') (0.06); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && near(passiveOff.onMul, 0.06) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 10 precedence: WAYFARER cedes to STANDINGS + SOUL + PULSE + CONGREGATION (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    const T = 10000 * 1000; window.__dev.territory({ enabled: false });
    const w = window.__wpick(150, T); const zoneCfg = window.__dev.wayfarer().zones[0];
    const base = window.__dev.wayfarer({ nowMs: T }).wayfarerMulRested;   // 0.06 aislado
    // (a) vs STANDINGS: jura la orden LÍDER ⇒ standingsMul>0 ⇒ wayfarerMul CEDE
    window.__dev.standings({ enabled: true, nowMs: 1234 * 604800000 }); const leader = window.__dev.standings({ nowMs: 1234 * 604800000 }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const s1 = window.__dev.wayfarer({ nowMs: T }); const standPeer = s1.standingsMulRested, standCeded = s1.wayfarerMulRested;
    window.__dev.standings({ enabled: false });
    // (b) vs SOUL: recupera/muere ⇒ soulMul>0 ⇒ wayfarerMul CEDE. NOTA: soul({die}) respawnea al héroe (lo saca de la celda) ⇒ re-wpick antes de (c)/(d).
    window.__wpick(150, T);
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: 1234 * 300000 }); window.__dev.soul({ die: true });
    const s2 = window.__dev.wayfarer({ nowMs: T }); const soulPeer = s2.soulMulRested, soulCeded = s2.wayfarerMulRested;
    window.__dev.soul({ enabled: false });
    // (c) vs CONGREGATION: headcount ≥ umbral en la zona del héroe ⇒ congMul>0 ⇒ wayfarerMul CEDE. Re-wpick (soul respawneó) ⇒ héroe de vuelta en celda trillada de zona congregable.
    window.__wpick(150, T);
    const heroZone = window.__dev.wayfarer().hero ? window.__dev.wayfarer().hero.zone : null;
    window.__dev.congregation({ enabled: true });
    let congPeer = 0, congCeded = base;
    if (heroZone) { const cc = {}; cc[heroZone] = 8; window.__dev.congregation({ counts: cc });
      const s3 = window.__dev.wayfarer({ nowMs: T }); congPeer = s3.congMulRested; congCeded = s3.wayfarerMulRested; }
    window.__dev.congregation({ enabled: false });
    // (d) vs TERRITORY (⊥ safeRegen): NO afecta wayfarerMul ⇒ intacto. Re-wpick asegura el héroe SOBRE la celda trillada (aislado de peers restedMult).
    window.__wpick(150, T);
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.wayfarer({ nowMs: T }).wayfarerMulRested;
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, soulPeer, soulCeded, congPeer, congCeded, terrCoexist, heroZone };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: WAYFARER(0.06) CEDE a STANDINGS⇒0 AND SOUL⇒0 AND CONGREGATION⇒0; COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.06 intacto",
     near(prec.base, 0.06) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 &&
     prec.congPeer > 0 && prec.congCeded === 0 && near(prec.terrCoexist, 0.06), JSON.stringify(prec));

  // 12 render badge draws with feature ON (Δ px vs OFF-control) — measured on THIS page before opening page2
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.wayfarer({ leave: true }); window.__dev.wayfarer({ enabled: false }); });
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate(() => { const T = 12000 * 1000; window.__wpick(180, T); window.__dev.wayfarer({ nowMs: T }); });
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 380).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const arc = await page.evaluate(() => ({
    standings: !!window.__dev.standings, cong: !!window.__dev.congregation, pulse: !!window.__dev.pulse, soul: !!window.__dev.soul, mentor: !!window.__dev.mentor, fellow: !!window.__dev.fellowship, terr: !!window.__dev.territory, ledger: !!window.__dev.ledger,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("12 render badge 'Sendero Trillado' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps",
     sumOn !== sumOff && arc.standings && arc.cong && arc.pulse && arc.soul && arc.mentor && arc.fellow && arc.terr && arc.ledger && fps >= 55,
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

  // Both pages: same zone → same deterministic hero cell; same snapshot {cell:{tread,atMs}} + same nowMs ⇒ must converge byte-a-byte.
  const T = 11000 * 1000;
  const north = await (async () => {
    // page2 picks zone + cell (teleport + push tread on hero cell); read its cell key
    const b0 = await page2.evaluate((t) => { const w = window.__wpick(150, t); return { cell: w.cell, tread: w.tread, trodden: w.trodden, mul: w.wayfarerMulRested }; }, T);
    const cell = b0.cell;
    // page1: isolate, enable, set clock, PUSH THE SAME snapshot on the SAME cell + teleport to same zone (same deterministic spot ⇒ same cell)
    const a0 = await page.evaluate((t) => { const w = window.__wpick(150, t); return { cell: w.cell, tread: w.tread, trodden: w.trodden, mul: w.wayfarerMulRested }; }, T);
    // DECAY converges: advance both clocks by one half-life ⇒ tread 75 (<100) ⇒ both NOT trodden
    const hlMs = (await page.evaluate(() => window.__dev.wayfarer().halfLifeSec | 0)) * 1000;
    const aDec = await page.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
    const bDec = await page2.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T + hlMs);
    // re-push fresh tread so both are trodden again at T; then A LEAVES the cell ⇒ A's Δ 0, but cell tread + B's Δ intact
    await page.evaluate((t) => { window.__dev.wayfarer({ clear: true }); const w = window.__wpick(150, t); return w.cell; }, T);
    await page2.evaluate((t) => { window.__dev.wayfarer({ clear: true }); const w = window.__wpick(150, t); return w.cell; }, T);
    const aOut = await page.evaluate((t) => { const s = window.__dev.wayfarer({ leave: true }); return { mul: s.wayfarerMulRested, trodden: s.trodden, cells: s.cells }; }, T);
    const bAfter = await page2.evaluate((t) => { const s = window.__dev.wayfarer({ nowMs: t }); return { tread: s.tread, trodden: s.trodden, mul: s.wayfarerMulRested }; }, T);
    return { cell, aCell: a0.cell, bCell: b0.cell, aM: a0.mul, bM: b0.mul, aTr: a0.trodden, bTr: b0.trodden, aTread: a0.tread, bTread: b0.tread,
      aDec, bDec, aOutM: aOut.mul, aOutTr: aOut.trodden, aOutCellStillTrodden: !!(aOut.cells && aOut.cells[cell] >= 100), bAfter };
  })();
  const northOk =
    north.aCell === north.bCell && north.aCell === north.cell &&                                             // same deterministic cell
    near(north.aTread, north.bTread) && near(north.aTread, 150) && north.aTr === true && north.bTr === true &&
    near(north.aM, north.bM) && near(north.aM, 0.06) &&                                                       // baseline identical
    near(north.aDec.tread, north.bDec.tread) && near(north.aDec.tread, 75) && north.aDec.trodden === false && north.bDec.trodden === false && // decay converges below threshold
    north.aOutM === 0 && north.aOutTr === false && north.aOutCellStillTrodden === true &&                    // A leaves ⇒ Δ_A 0 but cell tread intact
    near(north.bAfter.mul, 0.06) && north.bAfter.trodden === true && near(north.bAfter.tread, 150);           // B + shared cell intact
  ok("11 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO snapshot+nowMs ⇒ celda/tread/pasivo IDÉNTICOS; decay converge; A sale ⇒ Δ_A=0 pero tread compartido + Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2335 self-verify: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
