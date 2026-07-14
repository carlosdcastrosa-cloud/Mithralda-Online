// CAS-2370 — QA INDEPENDIENTE (observable DARK) para FUEGO CONCENTRADO / FOCUS FIRE (FOCUS_FIRE.enabled:false). EVO mecánica #62.
// Harness QA PROPIO (NO reusa el del GE): reloj QA distinto (QNOW=8_450_000), ASIGNACIONES RE-ETIQUETADAS (players/targets propios) y
// ORÁCULOS RE-DERIVADOS en Node — focusConcentration reimplementada de cero (agrupa por objetivo, dedup jugadores, MÁX atacantes distintos),
// tier = índice del tier más alto cuyo min≤focus, boost = tiers[t-1].boost, decay = base·0.5^(dt/hl) cap capFocus, gold = round(raw·(1+boost)).
// Los oráculos NO leen el VM del sim: se cruzan CONTRA él (el sim es la autoridad server-authoritative).
//
// Eje FRESCO = CONCENTRACIÓN DE OBJETIVO: MÁX nº de jugadores DISTINTOS concentrando ataque sobre el MISMO enemigo A LA VEZ, SOSTENIDO.
// Canal REUSADO = goldFind (de KINSHIP_BOND #60): de-stack máximo-único ⇒ FOCUS_FIRE (más nueva) CEDE a KINSHIP_BOND ⇒ 0 doble-conteo.
//
// ★ DIFERENCIADORES (ortogonalidad): objetivos DISTINTOS ⇒ conc 1 ⇒ NO abre (≠ Congregación headcount); MISMO objetivo aunque DISPERSOS ⇒ ABRE
//   (OPUESTO a Kinship, que exige proximidad); mismo jugador ×N ⇒ 1 (dedup); idle (sin objetivo) ⇒ 0; 1 tick dt=0.5 ⇒ 0 (permanencia);
//   QUIETOS martillando ⇒ ABRE (≠ Convoy velocidad); atacantes concurrentes sobre objetivo VIVO sin kill (≠ BATTLE_SYNC gestas correlacionadas).
// ★ ORTOGONALIDAD: goldFind ⊥ restedMult (seam gainXP) ⊥ wardRegen (regen HP) — abrir focus NO toca los otros canales y viceversa.
// ★ NORTH STAR 2-CLIENTE: 2 páginas puppeteer independientes, MISMO snapshot {zona→{focus,atMs}} + MISMO reloj ⇒ focus/tier/boost/goldFactor
//   IDÉNTICOS byte-a-byte (0 desync); sostener(T3)/decaer(T2) converge; A SALE ⇒ Δ_A=0 (zone-gate) PERO focus server-auth + Δ_B INTACTOS.
// Run: node tools/cas2370-focus-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2370-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él, la autoridad) ─────────────────
// conc = MÁX nº de jugadores DISTINTOS sobre un único objetivo. Reimplementación INDEPENDIENTE de focusConcentration.
const oracleConc = (assignments) => {
  const byT = new Map(); const players = new Set();
  (assignments || []).forEach((a, i) => {
    if (!a) return; const t = a.t, p = a.p;
    if (t === null || t === undefined || t === "") return;         // idle ⇒ no cuenta
    const pk = (p === null || p === undefined) ? ("#idx" + i) : ("" + p);
    players.add(pk);
    let s = byT.get("" + t); if (!s) { s = new Set(); byT.set("" + t, s); } s.add(pk);
  });
  let conc = 0; for (const s of byT.values()) if (s.size > conc) conc = s.size;
  return { members: players.size, conc };
};
const oracleTier = (focus, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if ((+focus || 0) >= tiers[i].min) idx = i + 1; return idx; };
const oracleBoost = (focus, tiers) => { const t = oracleTier(focus, tiers); return t > 0 ? (+tiers[t - 1].boost || 0) : 0; };
const oracleDecay = (base, dtSec, hlSec, cap) => { const w = base * Math.pow(0.5, dtSec / hlSec); return cap > 0 ? Math.min(cap, w) : w; };
const oracleGold = (raw, boost) => (boost > 0 ? Math.round(raw * (1 + boost)) : raw);
// focus acumulado = accruePerSec·dt SI conc≥minFocus, si no 0
const oracleAccrue = (assignments, dt, accruePerSec, minFocus) => (oracleConc(assignments).conc >= minFocus ? accruePerSec * dt : 0);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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

// ── ASIGNACIONES QA re-etiquetadas (players/targets propios ≠ los del GE) ────────────────────────────────
// conc = MÁX atacantes DISTINTOS sobre un objetivo. Cambio deliberado de etiquetas ⇒ prueba invariancia por renombrado.
const A = {
  sameFour: [{ p: "u7", t: "ogre" }, { p: "u8", t: "ogre" }, { p: "u9", t: "ogre" }, { p: "u10", t: "ogre" }], // 4 sobre ogre ⇒ conc 4
  disperso: [{ p: "u7", t: "ogre" }, { p: "u8", t: "ogre" }, { p: "u9", t: "ogre" }],                          // 3 sobre MISMO objetivo (aunque dispersos) ⇒ conc 3 ABRE
  distintos:[{ p: "u7", t: "orcA" }, { p: "u8", t: "wolfB" }, { p: "u9", t: "batC" }, { p: "u10", t: "ratD" }],// objetivos distintos ⇒ conc 1 (NO abre)
  solo:     [{ p: "u7", t: "ogre" }],                                                                          // 1 solo ⇒ conc 1
  dup:      [{ p: "u7", t: "ogre" }, { p: "u7", t: "ogre" }, { p: "u7", t: "ogre" }],                          // mismo jugador ×3 ⇒ dedup ⇒ conc 1
  idle:     [{ p: "u7", t: null }, { p: "u8", t: undefined }, { p: "u9", t: "" }],                             // sin objetivo ⇒ conc 0
  split:    [{ p: "u7", t: "ogre" }, { p: "u8", t: "ogre" }, { p: "u9", t: "troll" }, { p: "u10", t: "troll" }, { p: "u11", t: "troll" }], // 2+3 ⇒ MÁX 3
};

const QNOW = 8450000;   // reloj de pared QA FIJO (≠ 9_600_000 del GE) — proyección determinista, mismo en ambos clientes
async function installQA(page) {
  await page.evaluate((QNOW) => {
    window.__QNOW = QNOW;
    // empuja focus crudo de UNA zona (CLEAR antes ⇒ atMs=QNOW ⇒ dtMs=0 ⇒ focus == base exacto)
    window.__fsnap = (zone, f) => { window.__dev.focus({ clear: true, nowMs: window.__QNOW }); window.__dev.focus({ nowMs: window.__QNOW, push: { [zone]: { focus: f, atMs: window.__QNOW } } }); };
    // aplica ASIGNACIONES {list,dt} en UNA zona (CLEAR antes ⇒ focus = accruePerSec·dt si sostiene, o 0)
    window.__fpos = (zone, list, dt) => { window.__dev.focus({ clear: true, nowMs: window.__QNOW }); window.__dev.focus({ nowMs: window.__QNOW, assignments: { [zone]: { list, dt } } }); };
    // proyecta (re-tick) a QNOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec·1000 ⇒ decay)
    window.__fat = (zone, elapsedSec) => window.__dev.focus({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta focus `f` (atMs=QNOW) en cada zona candidata, teleporta, devuelve la 1ª donde el héroe cae DENTRO
    window.__fpick = (f) => {
      window.__dev.focus({ enabled: true });
      const zones = window.__dev.focus().zones || [];
      for (const z of zones) {
        window.__dev.focus({ clear: true, nowMs: window.__QNOW });
        const s = window.__dev.focus({ nowMs: window.__QNOW, push: { [z]: { focus: f, atMs: window.__QNOW } }, toZone: z });
        if (s.zone === z && s.focusable) return { zone: z, focus: s.focus, tier: s.tier, boost: s.goldFindMul };
      }
      return null;
    };
  }, QNOW);
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.focus + arc hooks (kinship/convoy/ward) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.focus());
  ok("2 byte-id OFF (fresh boot): FOCUS_FIRE.enabled false AND G.focus NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.focus === 0 && dark.boost === 0 && dark.tag === "" && dark.focusMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} focus=${dark.focus} tag="${dark.tag}" map=${JSON.stringify(dark.focusMap)}`);

  // 3 save OFF has no 'focus'/'focusServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: sin clave 'focus'/'focusServer' (estado 100% derivado/transitorio, 0 persistencia nueva)",
     !/"focus(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(59)));
  await page.evaluate(() => window.__dev.focus({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(59)));
  await page.evaluate(() => window.__dev.focus({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installQA(page);
  // config leída del VM — la QA re-deriva sus oráculos con estos parámetros
  const cfg = await page.evaluate(() => { const s = window.__dev.focus({ enabled: true }); return { tiers: s.tiers, cap: s.capFocus, minFocus: s.minFocus, halfLifeSec: s.halfLifeSec, accruePerSec: s.accruePerSec, channel: s.channel, zones: s.zones }; });

  // 5 ★ CONCENTRACIÓN (fn PURA focusConcentration vía concProbe) cruzada contra ORÁCULO QA — asignaciones re-etiquetadas
  const pr = await page.evaluate((A) => {
    window.__dev.focus({ enabled: true });
    const C = (assignments) => window.__dev.focus({ concProbe: { assignments } }).probe;
    return { sameFour: C(A.sameFour), disperso: C(A.disperso), distintos: C(A.distintos), solo: C(A.solo), dup: C(A.dup), idle: C(A.idle), split: C(A.split) };
  }, A);
  const prKeys = ["sameFour", "disperso", "distintos", "solo", "dup", "idle", "split"];
  const prOk = prKeys.every(k => pr[k].conc === oracleConc(A[k]).conc && pr[k].members === oracleConc(A[k]).members);
  ok("5 ★ CONCENTRACIÓN (fn PURA) == ORÁCULO QA: 4 sobre uno⇒4; disperso mismo obj⇒3; objetivos distintos⇒1; solo⇒1; dup jugador⇒1; idle⇒0; split 2+3⇒3",
     prOk && pr.sameFour.conc === 4 && pr.disperso.conc === 3 && pr.distintos.conc === 1 && pr.solo.conc === 1 && pr.dup.conc === 1 && pr.idle.conc === 0 && pr.split.conc === 3,
     JSON.stringify(Object.fromEntries(prKeys.map(k => [k, pr[k].conc]))));

  // 6 ★ TABLA tiers + boost == ORÁCULO QA para focus 1..8 (en zona)
  const tab = await page.evaluate(() => {
    const w = window.__fpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const f of [1, 2, 3, 4, 5, 6, 8]) {
      window.__fsnap(zone, f);
      const vm = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
      out.push({ f, focus: vm.focus, tier: vm.tier, boost: vm.goldFindMul });
    }
    return { zone, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => near(r.focus, r.f) && r.tier === oracleTier(r.f, cfg.tiers) && near(r.boost, oracleBoost(r.f, cfg.tiers)));
  ok("6 ★ TABLA tiers+boost == ORÁCULO QA (focus 1→T0,2→T1,3→T1,4→T2,5→T2,6→T3,8→T3; boost 0/.05/.05/.10/.10/.15/.15) determinista, monótona",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + clamp negative)
  const refl = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const zones = window.__dev.focus().zones; const z0 = zones[0];
    window.__dev.focus({ clear: true, nowMs: window.__QNOW });
    window.__dev.focus({ nowMs: window.__QNOW, push: { [z0]: { focus: 4, atMs: window.__QNOW }, town: { focus: 6, atMs: window.__QNOW }, plaza: { focus: 5, atMs: window.__QNOW } } });
    const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: z0 });
    window.__dev.focus({ clear: true, nowMs: window.__QNOW });
    window.__dev.focus({ nowMs: window.__QNOW, push: { [z0]: { focus: -9, atMs: window.__QNOW } } });
    const neg = window.__dev.focus({ nowMs: window.__QNOW, toZone: z0 });
    return { z0, valid: s.focus, map: s.focusMap, negK: neg.focus, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.map || {})) && !("plaza" in (refl.map || {})) && refl.negK === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: zona válida refleja focus 4; zonas fuera de `zones` (town/plaza) DESCARTADAS; focus negativo ⇒ 0 (clamp)",
     reflOk, JSON.stringify(refl));

  // 8 ★ ACUMULADOR sostenido = fn de las ASIGNACIONES == ORÁCULO (accruePerSec·dt si sostiene)
  const acc = await page.evaluate((A) => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const dt of [2, 3, 4, 6]) {
      window.__fpos(zone, A.sameFour, dt);
      const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
      out.push({ dt, focus: s.focus, tier: s.tier });
    }
    return { zone, out };
  }, A);
  const accOk = !acc.bad && acc.out.every(r => near(r.focus, oracleAccrue(A.sameFour, r.dt, cfg.accruePerSec, cfg.minFocus)) && r.tier === oracleTier(r.focus, cfg.tiers));
  ok("8 ★ ACUMULADOR sostenido == ORÁCULO QA: mismo-objetivo sostenido dt=2⇒2(T1); dt=3⇒3(T1); dt=4⇒4(T2); dt=6⇒6(T3) = accruePerSec·dt exacto",
     accOk, JSON.stringify(acc.out));

  // 9 ★ DIFERENCIADOR — distintos/solo/idle⇒0 (NO abre); MISMO objetivo aunque disperso⇒ABRE (OPUESTO Kinship); 1-tick⇒0 (permanencia)
  const diff = await page.evaluate((A) => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (list, dt) => { window.__fpos(zone, list, dt); const s = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone }); return { focus: s.focus, tier: s.tier, mul: s.goldFindMul }; };
    return {
      zone,
      distintos: read(A.distintos, 6),   // objetivos distintos ⇒ conc 1 ⇒ NO abre (≠ Congregación headcount)
      solo:      read(A.solo, 6),         // 1 solo ⇒ conc 1 ⇒ NO abre
      idle:      read(A.idle, 6),         // sin objetivo ⇒ conc 0 ⇒ NO abre
      disperso:  read(A.disperso, 6),     // 3 sobre MISMO objetivo (dispersos) ⇒ conc 3 ⇒ ABRE (OPUESTO a Kinship)
      tick:      read(A.sameFour, 0.5),   // 1 tick dt=0.5 ⇒ focus 0.5 < minFocus ⇒ NO abre (permanencia)
    };
  }, A);
  const diffOk = !diff.bad && near(diff.distintos.focus, 0) && diff.distintos.tier === 0 &&
    near(diff.solo.focus, 0) && diff.solo.tier === 0 && near(diff.idle.focus, 0) && diff.idle.tier === 0 &&
    diff.disperso.focus >= 6 && diff.disperso.tier === 3 && diff.disperso.mul > 0 &&
    near(diff.tick.focus, 0.5) && diff.tick.tier === 0 && diff.tick.mul === 0;
  ok("9 ★ DIFERENCIADOR: objetivos-distintos/solo/idle⇒0 NO abre (≠ Congregación); MISMO objetivo DISPERSO⇒ABRE (OPUESTO Kinship); 1-tick dt=0.5⇒0 (permanencia)",
     diffOk, JSON.stringify(diff));

  // 10 ★ DECAY determinista 0-RNG por vida-media (25s) == ORÁCULO a tres instantes
  const decay = await page.evaluate(() => {
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__fsnap(zone, 8); const at0 = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    window.__fsnap(zone, 8); const hl1 = window.__fat(zone, 25);
    window.__fsnap(zone, 8); const hl2 = window.__fat(zone, 50);
    return { zone, base: at0.focus, baseT: at0.tier, hl1: hl1.focus, hl1T: hl1.tier, hl2: hl2.focus, hl2T: hl2.tier };
  });
  const decOk = !decay.bad && near(decay.base, oracleDecay(8, 0, cfg.halfLifeSec, cfg.cap)) &&
    near(decay.hl1, oracleDecay(8, 25, cfg.halfLifeSec, cfg.cap)) && near(decay.hl2, oracleDecay(8, 50, cfg.halfLifeSec, cfg.cap)) &&
    decay.baseT === 3 && decay.hl1T === 2 && decay.hl2T === 1;
  ok("10 ★ DECAY determinista 0-RNG por vida-media == ORÁCULO QA: base 8(T3); +25s⇒4(T2); +50s⇒2(T1)",
     decOk, JSON.stringify(decay));

  // 11 passive isolated (goldFind channel): in-zone focus≥umbral ⇒ boost==tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.kinship({ enabled: false });
    const w = window.__fpick(4); if (!w) return { bad: true };          // focus 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone });
    const out = window.__dev.focus({ leave: true });
    return { zone: w.zone, inMul: inz.goldFindMul, inTier: inz.tier, inK: inz.focus, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 PASSIVE (canal goldFind, aislado): EN zona focus 4 ⇒ goldFindMul==boost T2 (0.10, goldFactor 1.10) + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, oracleBoost(4, cfg.tiers)) && pass.inTier === 2 && near(pass.inK, 4) && near(pass.inFactor, 1.10) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ CANAL goldFind wired + BONO DE ORO (seam tryPickup) cruzado contra ORÁCULO — QUIETOS martillando abren (≠ Convoy)
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function focusMul/.test(simSrc) && /kinshipMul\(h,"goldFind"\)\+focusMul\(h,"goldFind"\)/.test(simSrc) &&
    /if\(gf>0\)\s*g=Math\.round\(g\*\(1\+gf\)\)/.test(simSrc) && /d\.kind==="gold"/.test(simSrc);
  const gold = await page.evaluate(() => {
    window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ 0.15
    const zone = w.zone;
    window.__fsnap(zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    const before = window.__dev.focus().hero.gold;
    const gp = window.__dev.focus({ goldTick: 200 }).goldPicked;        // recoge 200 sintético ⇒ round(200*1.15)=230
    const afterGold = window.__dev.focus().hero.gold;
    window.__dev.focus({ enabled: false });
    const offBefore = window.__dev.focus().hero.gold;
    const gpOff = window.__dev.focus({ goldTick: 200 }).goldPicked;     // OFF ⇒ paid==raw (byte-id)
    const off = window.__dev.focus(); const offAfter = off.hero.gold;
    return { zone, before, gp, afterGold, offBefore, gpOff, offAfter, offTag: off.tag };
  });
  const goldOk = !gold.bad && gold.gp && gold.gp.paid === oracleGold(200, oracleBoost(6, cfg.tiers)) && gold.gp.paid === 230 &&
    near(gold.gp.boost, 0.15) && (gold.afterGold - gold.before) === 230 &&
    gold.gpOff && gold.gpOff.paid === 200 && (gold.offAfter - gold.offBefore) === 200 && gold.offTag === "";
  ok("12 ★ CANAL goldFind wired + BONO DE ORO == ORÁCULO: seam gold ⇒ round(g*(1+gf)); QUIETOS martillando T3 ⇒ goldTick 200 paga 230; OFF ⇒ paid==raw (200) + tag \"\"",
     seamWired && goldOk, `wired=${seamWired} on(${gold.before}→${gold.afterGold} gp=${JSON.stringify(gold.gp)}) off(gp=${JSON.stringify(gold.gpOff)}) offTag="${gold.offTag}"`);

  // 13 ★ DE-STACK máximo-único con KINSHIP (0 doble-conteo) + ORTOGONALIDAD ⊥ restedMult ⊥ wardRegen
  const orth = await page.evaluate(() => {
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ 0.15
    const zone = w.zone;
    const a = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    const focusAlone = a.goldFindMul, restedBefore = a.restedXpMult, wardBefore = a.wardRegenMul;
    // (i) DE-STACK: abre KINSHIP (mismo canal goldFind) en la MISMA zona ⇒ FOCUS cede (0), kinship aporta
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__QNOW });
    window.__dev.kinship({ nowMs: window.__QNOW, push: { [zone]: { kinship: 6, atMs: window.__QNOW } }, toZone: zone });
    const ceded = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    window.__dev.kinship({ enabled: false });
    const backv = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    // (ii) ORTOGONALIDAD: CONVOY (restedMult) + WARD (wardRegen) suben SUS canales pero goldFindMul de focus NO cambia
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__QNOW });
    window.__dev.convoy({ nowMs: window.__QNOW, push: { [zone]: { march: 6, atMs: window.__QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__QNOW });
    window.__dev.ward({ nowMs: window.__QNOW, push: { [zone]: { ward: 6, atMs: window.__QNOW } }, toZone: zone });
    const b = window.__dev.focus({ nowMs: window.__QNOW, toZone: zone });
    const cv = window.__dev.convoy({ nowMs: window.__QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, focusAlone, cededMul: ceded.goldFindMul, cededKin: ceded.kinshipMulGold, back: backv.goldFindMul,
      restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul, convoyRested: cv.convoyMulRested };
  });
  const orthFull = !orth.bad && orth.channel === "goldFind" && orth.focusAlone > 0 &&
    orth.cededMul === 0 && orth.cededKin > 0 &&              // KINSHIP abierto ⇒ FOCUS cede (0), kinship aporta ⇒ máximo-único
    near(orth.back, orth.focusAlone) &&                      // cierra kinship ⇒ focus recupera su boost
    near(orth.goldAfter, orth.focusAlone) &&                 // restedMult/wardRegen NO cambian goldFind de focus (⊥)
    orth.wardBefore === 0 &&                                 // focus solo NO abre wardRegen
    orth.restedAfter > orth.restedBefore &&                  // CONVOY sí sube SU canal restedMult (independiente)
    orth.convoyRested > 0 && orth.wardAfter > 0;             // CONVOY/WARD aportan en SUS canales
  ok("13 ★ DE-STACK máximo-único con KINSHIP (KINSHIP abierto⇒FOCUS cede 0, kinship aporta; cierra⇒recupera) + ORTOGONALIDAD ⊥ restedMult/wardRegen (0 doble-conteo)",
     orthFull, JSON.stringify(orth));

  // 14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true; FOCUS_FIRE served false (DARK #62)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const focusDark = flag("FOCUS_FIRE") === "false";
  const wayfarerDark = flag("WAYFARER_ROAM") === "false";   // el otro DARK del arco (#61) — no debe haber flippeado sola
  ok("14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true (incl WARDING_RING/KINSHIP_BOND); FOCUS_FIRE + WAYFARER_ROAM served false (DARK)",
     arcAllOn && focusDark && wayfarerDark, `focus=${flag("FOCUS_FIRE")} wayfarer=${flag("WAYFARER_ROAM")} arcAllOn=${arcAllOn} ${JSON.stringify(arcLive)}`);

  // 15 ★ FOCUS en las 6 zonas broken=[]
  const zonesRes = await page.evaluate(() => {
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const zones = window.__dev.focus().zones; const broken = [];
    for (const z of zones) {
      window.__dev.focus({ clear: true, nowMs: window.__QNOW });
      const s = window.__dev.focus({ nowMs: window.__QNOW, push: { [z]: { focus: 6, atMs: window.__QNOW } }, toZone: z });
      if (!(s.zone === z && s.focusable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ FOCUS 6 zonas: las 6 de FOCUS_FIRE.zones hospedan un fuego concentrado observable (focus 6 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Fuego Conc." drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fuego Conc.") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6);
    window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.focus({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("16 render badge \"Fuego Conc.\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate(() => { window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false }); const w = window.__fpick(6); window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__QNOW, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL
  await page.evaluate(() => window.__dev.focus({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installQA(pageB);
  const readBoth = async (f, zone, elapsedSec) => {
    const inj = (pg) => pg.evaluate(({ f, zone, elapsedSec, QNOW }) => {
      window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
      window.__dev.focus({ clear: true, nowMs: QNOW });
      const s = window.__dev.focus({ nowMs: QNOW + (elapsedSec || 0) * 1000, push: { [zone]: { focus: f, atMs: QNOW } }, toZone: zone });
      return { focus: s.focus, tier: s.tier, boost: s.goldFindMul, factor: s.goldFactor, nowMs: s.nowMs, map: s.focusMap };
    }, { f, zone, elapsedSec, QNOW });
    const [a, b] = await Promise.all([inj(page), inj(pageB)]);
    return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
  };
  const zone = await page.evaluate(() => (window.__dev.focus().zones || [])[2]);   // ruins idx2 (North Star canónico del arco)
  const sustain = await readBoth(6, zone, 0);    // T3 sostenido byte-idéntico
  const decayed = await readBoth(8, zone, 25);   // +25s ⇒ 4 (T2) converge tras decay
  const aLeaves = await page.evaluate(() => { const s = window.__dev.focus({ leave: true }); return { mul: s.goldFindMul, tier: s.tier, map: s.focusMap }; });
  const bIntact = await pageB.evaluate(({ zone, QNOW }) => { const s = window.__dev.focus({ nowMs: QNOW, toZone: zone }); return { mul: s.goldFindMul, tier: s.tier, focus: s.focus }; }, { zone, QNOW });
  const nsOk = sustain.eq && sustain.a.tier === 3 && near(sustain.a.focus, 6) &&
    decayed.eq && decayed.a.tier === 2 && near(decayed.a.focus, 4) &&
    aLeaves.mul === 0 && aLeaves.map && (aLeaves.map[zone] || 0) > 0 &&
    bIntact.mul > 0 && bIntact.tier === 3;
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMO snapshot+reloj ⇒ focus/tier/boost/goldFactor byte-idénticos (sostener T3, decaer T2); A sale de zona ⇒ Δ_A=0 PERO focus server-auth + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqSust: sustain.eq, eqDecay: decayed.eq, aMul: aLeaves.mul, bMul: bIntact.mul, bTier: bIntact.tier, errB: errB.length }));

  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}  build=${build}`);
  process.exit(FAIL === 0 ? 0 : 1);
} catch (e) {
  console.error("HARNESS ERROR", e);
  process.exit(2);
} finally {
  await browser.close();
  await server.stop();
}
