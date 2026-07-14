// CAS-2370 — GE self-verify for FUEGO CONCENTRADO / FOCUS FIRE (DARK, FOCUS_FIRE.enabled:false). EVO mecánica #62 (renumerada desde #61 por colisión con CAS-2369 Wayfarer, más avanzado).
// EJE FRESCO = CONCENTRACIÓN DE OBJETIVO (focus-fire): cuántos jugadores DISTINTOS concentran su ataque sobre el MISMO enemigo A LA VEZ, SOSTENIDO. El server toma las ASIGNACIONES { jugador → objetivo }
// de los presentes en combate, las agrupa por objetivo y toma el MÁX nº de atacantes DISTINTOS sobre un único objetivo (`focusConcentration` PURA). ≥minFocus sostenido ⇒ acumula `focus` con decay.
// CANAL = `goldFind` (REUSA el de KINSHIP_BOND #60; NO restedMult/XP, NO wardRegen/HP). De-stack máximo-único DENTRO de goldFind: FOCUS_FIRE (más nueva) CEDE a KINSHIP_BOND ⇒ jamás doblan.
//
// ★ DIFERENCIADOR (checks 5/9, no-negociable): N sobre el MISMO objetivo ⇒ conc N ⇒ ABRE (aunque DISPERSOS ⇒ OPUESTO a Kinship, que exige proximidad); N sobre objetivos DISTINTOS ⇒ conc 1 ⇒ NO
// abre (≠ Congregación headcount); 1 solo ⇒ conc 1 ⇒ NO abre; mismo jugador 2 veces ⇒ atacantes DISTINTOS ⇒ 1; idle (sin objetivo) ⇒ no cuenta; concentración 1 tick (dt=0.5) ⇒ focus 0.5<2 ⇒ NO abre.
//
// ★ DE-STACK máximo-único (check 13, no-negociable): con KINSHIP abierto en la MISMA zona, focusMul CEDE (goldFindMul 0, el boost de kinship aplica); con KINSHIP cerrado, focus aplica su boost. 0 doble-conteo.
// ★ ORTOGONALIDAD (check 13): goldFind ⊥ restedMult ⊥ wardRegen — abrir focus NO cambia restedXpMult/wardRegenMul; activar CONVOY(restedMult)/WARD(wardRegen) NO cambia goldFindMul de focus.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO focus {focus,atMs} + MISMO reloj (nowMs) ⇒ ven focus + tier + boost + goldFactor
// IDÉNTICOS byte-a-byte (0 desync). Sostener (focus sube) y decay al dispersarse CONVERGEN. El passive es COMPARTIDO (no per-hero): A SALE ⇒ Δ_A cae a 0 PERO el focus/tier server-authoritative + Δ_B INTACTOS.
//
// Observado vía __dev.focus (flip FOCUS_FIRE.enabled IN-MEMORY + inyección snapshot {zona→{focus,atMs}} / assignments / concProbe + nowMs/toZone/leave drivers + goldTick para el seam goldFind)
// + __dev.kinship (mismo canal goldFind, de-stack) + __dev.convoy (restedMult) + __dev.ward (wardRegen) para ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText ("Fuego Conc.").
//
// Checks:
//   1  boots to play, __dev.focus + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): FOCUS_FIRE.enabled false AND G.focus NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'focus'/'focusServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ CONCENTRACIÓN = función PURA (focusConcentration vía concProbe): sameT3⇒3; diffT3⇒1; 1solo⇒1; dupPlayer⇒1; idle⇒0; split⇒2.
//   6  TABLA de tiers = función PURA del FOCUS: focus→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: zona fuera de `zones` DESCARTADA; focus negativo ⇒ clamped a 0/descartado.
//   8  ★ ACUMULADOR sostenido = función de las ASIGNACIONES: sameT sostenido dt=3⇒focus 3 (T1); dt=6⇒focus 6 (T3) = accruePerSec·dt exacto.
//   9  ★ DIFERENCIADOR objetivos-distintos/solo/idle ⇒ 0 (NO abre, ≠ Congregación); mismo-objetivo ⇒ ABRE (OPUESTO a Kinship); 1 tick dt=0.5⇒0 (permanencia); sostenido dt=4⇒T2.
//  10  ★ DECAY determinista 0-RNG: focus baja por vida-media (base 8 T3; +25s ⇒ 4 T2; +50s ⇒ 2 T1). Techo capFocus no interfiere.
//  11  PASSIVE compartido (canal goldFind): focus≥umbral + héroe EN la zona ⇒ goldFindMul==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  12  ★ CANAL goldFind wired + BONO DE ORO: seam tryPickup gold ⇒ g=round(g*(1+(kinshipMul+focusMul))); LIVE goldTick: focus abierto ⇒ oro pagado = round(raw*(1+boost)); OFF ⇒ paid==raw + tag "".
//  13  ★ DE-STACK máximo-único con KINSHIP (0 doble-conteo) + ORTOGONALIDAD ⊥ restedMult/wardRegen: KINSHIP abierto ⇒ focus cede (0); activar CONVOY/WARD NO cambia goldFindMul.
//  14  ★ 0-REGRESIÓN: los 12 flags del arco ya LIVE siguen served enabled:true (incl. WARDING_RING/KINSHIP_BOND); FOCUS_FIRE served false (DARK #62).
//  15  ★ FOCUS 6 zonas: las 6 zonas de FOCUS_FIRE.zones hospedan un fuego concentrado observable (focus≥6 ⇒ T3) broken=[].
//  16  render badge "Fuego Conc." se DIBUJA con la feature ON (ctx.fillText count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO focus+reloj ⇒ focus/tier/boost/goldFactor IDÉNTICOS byte-a-byte; sostener(T3)/decaer(T2) CONVERGE; A sale ⇒ Δ_A=0 PERO focus/tier compartidos + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2370-focus-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2370");
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

// sets de ASIGNACIONES de prueba { p:jugador, t:objetivo }. conc = MÁX nº de jugadores DISTINTOS sobre un único objetivo.
const A = {
  sameT3:  [{ p: "p1", t: "tA" }, { p: "p2", t: "tA" }, { p: "p3", t: "tA" }],                       // 3 sobre tA ⇒ conc 3 (ABRE)
  diffT3:  [{ p: "p1", t: "tA" }, { p: "p2", t: "tB" }, { p: "p3", t: "tC" }],                       // objetivos distintos ⇒ conc 1 (NO abre, ≠ Congregación)
  one:     [{ p: "p1", t: "tA" }],                                                                   // 1 solo ⇒ conc 1
  dup:     [{ p: "p1", t: "tA" }, { p: "p1", t: "tA" }],                                             // mismo jugador 2 veces ⇒ atacantes DISTINTOS ⇒ conc 1
  idle:    [{ p: "p1", t: null }, { p: "p2", t: null }],                                             // sin objetivo ⇒ no cuenta ⇒ conc 0
  split:   [{ p: "p1", t: "tA" }, { p: "p2", t: "tA" }, { p: "p3", t: "tB" }, { p: "p4", t: "tB" }], // 2 en tA + 2 en tB ⇒ MÁX 2 (grupo mayor)
};

const NOW = 9600000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installFoc(page) {
  await page.evaluate((NOW) => {
    window.__FNOW = NOW;
    // empuja el focus crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ focus == base exacto)
    window.__fsnap = (zone, f) => { window.__dev.focus({ clear: true, nowMs: window.__FNOW }); window.__dev.focus({ nowMs: window.__FNOW, push: { [zone]: { focus: f, atMs: window.__FNOW } } }); };
    // aplica ASIGNACIONES {list,dt} en UNA zona (CLEAR antes ⇒ focus = accruePerSec·dt si sostiene, o 0). Prueba concentración/diferenciadores.
    window.__fpos = (zone, list, dt) => { window.__dev.focus({ clear: true, nowMs: window.__FNOW }); window.__dev.focus({ nowMs: window.__FNOW, assignments: { [zone]: { list, dt } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__fat = (zone, elapsedSec) => window.__dev.focus({ nowMs: window.__FNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un focus `f` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (focusable + zona coincide).
    window.__fpick = (f) => {
      window.__dev.focus({ enabled: true });
      const zones = window.__dev.focus().zones || [];
      for (const z of zones) {
        window.__dev.focus({ clear: true, nowMs: window.__FNOW });
        const s = window.__dev.focus({ nowMs: window.__FNOW, push: { [z]: { focus: f, atMs: window.__FNOW } }, toZone: z });
        if (s.zone === z && s.focusable) return { zone: z, focus: s.focus, tier: s.tier, boost: s.goldFindMul };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.congregation && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.focus + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.focus never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.focus());
  ok("2 byte-id OFF (fresh boot): FOCUS_FIRE.enabled false AND G.focus NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.focus === 0 && dark.boost === 0 && dark.tag === "" && dark.focusMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} focus=${dark.focus} boost=${dark.boost} tag="${dark.tag}" map=${JSON.stringify(dark.focusMap)}`);

  // 3 save OFF has no 'focus'/'focusServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'focus'/'focusServer' key in save blob (estado 100% derivado/transitorio)", !/"focus(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.focus({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.focus({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installFoc(page);

  // 5 ★ concentration = pure fn (focusConcentration via probe)
  const pr = await page.evaluate((A) => {
    window.__dev.focus({ enabled: true });
    const C = (assignments) => window.__dev.focus({ concProbe: { assignments } }).probe;
    return { sameT3: C(A.sameT3), diffT3: C(A.diffT3), one: C(A.one), dup: C(A.dup), idle: C(A.idle), split: C(A.split) };
  }, A);
  ok("5 ★ CONCENTRACIÓN = función PURA (focusConcentration): sameT3⇒3; diffT3⇒1; 1solo⇒1; dupPlayer⇒1; idle⇒0; split⇒2",
     pr.sameT3.conc === 3 && pr.diffT3.conc === 1 && pr.one.conc === 1 && pr.dup.conc === 1 && pr.idle.conc === 0 && pr.split.conc === 2, JSON.stringify(pr));

  // 6 tier table = pure fn of FOCUS
  const tab = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const m of [1, 2, 4, 6, 8]) {
      window.__fsnap(zone, m);
      const vm = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
      out.push({ m, focus: vm.focus, tier: vm.tier, boost: vm.goldFindMul });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.focus, r.m) && r.tier === expTier[r.m] && near(r.boost, expBoost[r.m]));
  ok("6 TABLA de tiers = función PURA del FOCUS: focus→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative focus)
  const refl = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const zones = window.__dev.focus().zones; const z0 = zones[0];
    window.__dev.focus({ clear: true, nowMs: window.__FNOW });
    window.__dev.focus({ nowMs: window.__FNOW, push: { [z0]: { focus: 4, atMs: window.__FNOW }, town: { focus: 6, atMs: window.__FNOW } } });
    const s = window.__dev.focus({ nowMs: window.__FNOW, toZone: z0 });
    window.__dev.focus({ clear: true, nowMs: window.__FNOW });
    window.__dev.focus({ nowMs: window.__FNOW, push: { [z0]: { focus: -5, atMs: window.__FNOW } } });
    const neg = window.__dev.focus({ nowMs: window.__FNOW, toZone: z0 });
    return { z0, valid: s.focus, map: s.focusMap, negK: neg.focus, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.map || {})) && refl.negK === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: zona válida refleja focus; zona fuera de `zones` DESCARTADA; focus negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accrual = fn of ASSIGNMENTS: sustained same-target dt=3 ⇒ focus 3 (T1); dt=6 ⇒ focus 6 (T3)
  const acc = await page.evaluate((A) => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__fpos(zone, A.sameT3, 3);
    const a = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    window.__fpos(zone, A.sameT3, 6);
    const b = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    return { zone, aK: a.focus, aTier: a.tier, bK: b.focus, bTier: b.tier };
  }, A);
  ok("8 ★ ACUMULADOR sostenido = función de las ASIGNACIONES: mismo-objetivo sostenido dt=3⇒focus 3 (T1); dt=6⇒focus 6 (T3) = accruePerSec·dt exacto",
     !acc.bad && near(acc.aK, 3) && acc.aTier === 1 && near(acc.bK, 6) && acc.bTier === 3, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — different-targets/lone/idle do NOT open; same-target opens (opposite of Kinship); 1-tick does NOT open
  const diff = await page.evaluate((A) => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (list, dt) => { window.__fpos(zone, list, dt); const s = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone }); return { focus: s.focus, tier: s.tier, mul: s.goldFindMul }; };
    return {
      zone,
      diffT: read(A.diffT3, 6),    // objetivos DISTINTOS ⇒ conc 1 ⇒ NO abre (≠ Congregación headcount)
      lone:  read(A.one, 6),       // 1 solo ⇒ conc 1 ⇒ NO abre
      idle:  read(A.idle, 6),      // sin objetivo ⇒ conc 0 ⇒ NO abre
      same:  read(A.sameT3, 4),    // 3 sobre el MISMO objetivo ⇒ conc 3 ⇒ ABRE (OPUESTO a Kinship, que exige proximidad)
      tick:  read(A.sameT3, 0.5),  // ★ concentración 1 tick (dt=0.5) ⇒ focus 0.5 < 2 ⇒ NO abre (requiere PERMANENCIA)
    };
  }, A);
  ok("9 ★ DIFERENCIADOR objetivos-distintos/solo/idle⇒0 (NO abre, ≠ Congregación); mismo-objetivo⇒ABRE (opuesto a Kinship); 1-tick dt=0.5⇒0 (permanencia); sostenido dt=4⇒T2",
     !diff.bad && near(diff.diffT.focus, 0) && diff.diffT.tier === 0 && near(diff.lone.focus, 0) && diff.lone.tier === 0 &&
     near(diff.idle.focus, 0) && diff.idle.tier === 0 &&
     diff.same.focus >= 4 && diff.same.tier >= 2 && diff.same.mul > 0 &&
     near(diff.tick.focus, 0.5) && diff.tick.tier === 0 && diff.tick.mul === 0, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life (25s)
  const decay = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__fsnap(zone, 8);                  // base focus 8 (T3)
    const at0 = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    window.__fsnap(zone, 8);
    const hl1 = window.__fat(zone, 25);       // +25s (1 vida-media) ⇒ 4 ⇒ T2
    window.__fsnap(zone, 8);
    const hl2 = window.__fat(zone, 50);       // +50s (2 vidas-media) ⇒ 2 ⇒ T1
    return { zone, base: at0.focus, baseT: at0.tier, hl1: hl1.focus, hl1T: hl1.tier, hl2: hl2.focus, hl2T: hl2.tier };
  });
  ok("10 ★ DECAY determinista 0-RNG: focus baja por vida-media (base 8⇒T3; +25s⇒4 T2; +50s⇒2 T1)",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.hl1, 4) && decay.hl1T === 2 && near(decay.hl2, 2) && decay.hl2T === 1, JSON.stringify(decay));

  // 11 passive isolated (goldFind channel): in-zone focus≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(4); if (!w) return { bad: true };          // focus 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.focus({ nowMs: window.__FNOW, toZone: w.zone });
    const out = window.__dev.focus({ leave: true });
    return { zone: w.zone, inMul: inz.goldFindMul, inTier: inz.tier, inK: inz.focus, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 PASSIVE compartido (canal goldFind, aislado): héroe EN la zona con focus≥umbral ⇒ goldFindMul==boost del tier (T2=0.10, goldFactor 1.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inK, 4) && near(pass.inFactor, 1.10) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ goldFind wired + GOLD BONUS effect
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function focusMul/.test(simSrc) && /kinshipMul\(h,"goldFind"\)\+focusMul\(h,"goldFind"\)/.test(simSrc) &&
    /if\(gf>0\)\s*g=Math\.round\(g\*\(1\+gf\)\)/.test(simSrc) && /d\.kind==="gold"/.test(simSrc);
  const gold = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ boost 0.15
    const zone = w.zone;
    window.__fsnap(zone, 6); window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });   // fuego abierto en la zona del héroe
    const before = window.__dev.focus().hero.gold;
    const gp = window.__dev.focus({ goldTick: 100 }).goldPicked;                            // recoge 100 sintético ⇒ paga round(100*1.15)=115
    const afterGold = window.__dev.focus().hero.gold;
    // OFF ⇒ focusMul gated ⇒ goldTick paga raw exacto (byte-id) + tag ""
    window.__dev.focus({ enabled: false });
    const offBefore = window.__dev.focus().hero.gold;
    const gpOff = window.__dev.focus({ goldTick: 100 }).goldPicked;
    const off = window.__dev.focus(); const offAfter = off.hero.gold;
    return { zone, before, gp, afterGold, offBefore, gpOff, offAfter, offTag: off.tag };
  });
  const goldOk = !gold.bad && gold.gp && gold.gp.paid === 115 && near(gold.gp.boost, 0.15) && (gold.afterGold - gold.before) === 115 &&
    gold.gpOff && gold.gpOff.paid === 100 && (gold.offAfter - gold.offBefore) === 100 && gold.offTag === "";   // OFF ⇒ paid==raw
  ok("12 ★ CANAL goldFind wired + BONO DE ORO: seam tryPickup gold ⇒ g=round(g*(1+(kinshipMul+focusMul))); focus T3 abierto ⇒ goldTick 100 paga 115 (round(100*1.15)); OFF ⇒ paid==raw (100) + tag \"\"",
     seamWired && goldOk, `wired=${seamWired} on(${gold.before}→${gold.afterGold} gp=${JSON.stringify(gold.gp)}) off(${gold.offBefore}→${gold.offAfter} gp=${JSON.stringify(gold.gpOff)}) offTag="${gold.offTag}"`);

  // 13 ★ DE-STACK máximo-único con KINSHIP + ORTHOGONALITY goldFind ⊥ restedMult ⊥ wardRegen
  const orth = await page.evaluate(() => {
    window.__dev.focus({ enabled: true });
    window.__dev.kinship({ enabled: false });      // KINSHIP cerrado ⇒ focus aplica su boost
    const w = window.__fpick(6); if (!w) return { bad: true };          // focus 6 ⇒ T3 ⇒ 0.15
    const zone = w.zone;
    const a = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    const focusAlone = a.goldFindMul, restedBefore = a.restedXpMult, wardBefore = a.wardRegenMul;
    // (i) DE-STACK: abre KINSHIP (mismo canal goldFind) en la MISMA zona ⇒ FOCUS cede (goldFindMul de focus ⇒ 0); kinship aporta su boost
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__FNOW });
    window.__dev.kinship({ nowMs: window.__FNOW, push: { [zone]: { kinship: 6, atMs: window.__FNOW } }, toZone: zone });
    const ceded = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });   // focus DEBE ceder ⇒ goldFindMul 0
    window.__dev.kinship({ enabled: false });                                   // cierra kinship ⇒ focus recupera su boost
    const back = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    // (ii) ORTOGONALIDAD: activa CONVOY (restedMult) + WARD (wardRegen) ⇒ SUS canales suben pero goldFindMul de focus NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__FNOW });
    window.__dev.convoy({ nowMs: window.__FNOW, push: { [zone]: { march: 6, atMs: window.__FNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__FNOW });
    window.__dev.ward({ nowMs: window.__FNOW, push: { [zone]: { ward: 6, atMs: window.__FNOW } }, toZone: zone });
    const b = window.__dev.focus({ nowMs: window.__FNOW, toZone: zone });
    const cv = window.__dev.convoy({ nowMs: window.__FNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, focusAlone, cededMul: ceded.goldFindMul, cededKin: ceded.kinshipMulGold, back: back.goldFindMul,
      restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul, convoyRested: cv.convoyMulRested };
  });
  const orthOk = !orth.bad && orth.channel === "goldFind" && orth.focusAlone > 0 &&
    orth.cededMul === 0 && orth.cededKin > 0 &&              // KINSHIP abierto ⇒ FOCUS cede (0), kinship aporta ⇒ máximo-único
    near(orth.back, orth.focusAlone) &&                      // cierra kinship ⇒ focus recupera su boost
    near(orth.goldAfter, orth.focusAlone) &&                 // los arcos restedMult/wardRegen NO cambian goldFind de focus
    orth.convoyRested > 0 && orth.wardAfter > 0;             // y CONVOY/WARD sí aportan en SUS canales (independientes)
  ok("13 ★ DE-STACK máximo-único con KINSHIP (KINSHIP abierto ⇒ FOCUS cede 0, kinship aporta; cierra ⇒ recupera) + ORTOGONALIDAD ⊥ restedMult/wardRegen (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 12 flags del arco siguen LIVE served; FOCUS_FIRE served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const focusDark = flag("FOCUS_FIRE") === "false";
  ok("14 ★ 0-REGRESIÓN: 12 flags del arco served enabled:true (incl WARDING_RING/KINSHIP_BOND); FOCUS_FIRE served false (DARK #62)",
     arcAllOn && focusDark, `focus=${flag("FOCUS_FIRE")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ FOCUS en las 6 zonas
  const zonesRes = await page.evaluate(() => {
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const zones = window.__dev.focus().zones; const broken = [];
    for (const z of zones) {
      window.__dev.focus({ clear: true, nowMs: window.__FNOW });
      const s = window.__dev.focus({ nowMs: window.__FNOW, push: { [z]: { focus: 6, atMs: window.__FNOW } }, toZone: z });
      if (!(s.zone === z && s.focusable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ FOCUS 6 zonas: las 6 zonas de FOCUS_FIRE.zones hospedan un fuego concentrado observable (focus≥6 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Fuego Conc." drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fuego Conc.") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
    const w = window.__fpick(6);
    window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__FNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.focus({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("16 render badge \"Fuego Conc.\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false }); const w = window.__fpick(6); window.__fsnap(w.zone, 6); window.__dev.focus({ nowMs: window.__FNOW, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence
  await page.evaluate(() => window.__dev.focus({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installFoc(pageB);
  const northStar = await (async () => {
    const readBoth = async (f, zone, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ f, zone, elapsedSec, NOW }) => {
        window.__dev.focus({ enabled: true }); window.__dev.kinship({ enabled: false });
        window.__dev.focus({ clear: true, nowMs: NOW });
        const s = window.__dev.focus({ nowMs: NOW + (elapsedSec || 0) * 1000, push: { [zone]: { focus: f, atMs: NOW } }, toZone: zone });
        return { focus: s.focus, tier: s.tier, boost: s.goldFindMul, factor: s.goldFactor, nowMs: s.nowMs, map: s.focusMap };
      }, { f, zone, elapsedSec, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const zone = (await page.evaluate(() => (window.__dev.focus().zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    const sustain = await readBoth(6, zone, 0);    // T3 sostenido
    const decayed = await readBoth(8, zone, 25);   // +25s ⇒ 4 ⇒ T2 (convergen tras decay)
    const aLeaves = await page.evaluate(() => { const s = window.__dev.focus({ leave: true }); return { mul: s.goldFindMul, tier: s.tier, map: s.focusMap }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.focus({ nowMs: NOW, toZone: zone }); return { mul: s.goldFindMul, tier: s.tier, focus: s.focus }; }, { zone, NOW });
    return { zone, sustain, decayed, aLeaves, bIntact };
  })();
  const nsOk = northStar.sustain.eq && northStar.sustain.a.tier === 3 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 2 && near(northStar.decayed.a.focus, 4) &&
    northStar.aLeaves.mul === 0 &&                                     // A fuera ⇒ Δ_A=0
    northStar.bIntact.mul > 0 && northStar.bIntact.tier === 3 &&       // B intacto (focus compartido server-authoritative)
    (northStar.aLeaves.map && (northStar.aLeaves.map[northStar.zone] || 0) > 0);
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO focus+reloj ⇒ focus/tier/boost/goldFactor byte-idénticos (sostener T3, decaer T2); A sale ⇒ Δ_A=0 PERO focus compartido + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqSust: northStar.sustain.eq, eqDecay: northStar.decayed.eq, aMul: northStar.aLeaves.mul, bMul: northStar.bIntact.mul, bTier: northStar.bIntact.tier, errB: errB.length }));

  // 0 no JS errors
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
