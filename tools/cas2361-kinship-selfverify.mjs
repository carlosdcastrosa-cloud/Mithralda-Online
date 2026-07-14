// CAS-2361 — GE self-verify for CAMARADERÍA / KINSHIP BOND (DARK, KINSHIP_BOND.enabled:false). EVO mecánica #60 — otro CANAL FRESCO + otro EJE FRESCO, ambos ⊥ a todo lo previo.
// (A) CANAL DE RECOMPENSA FRESCO = `goldFind` (bono de ORO al recoger monedas) — el arco #47–58 saturó `restedMult` (XP en gainXP), #59 abrió `wardRegen` (HP-regen); #60 abre un TERCER canal
//     `goldFind` (mult del oro), enganchado en el chokepoint ÚNICO de pickup de monedas (tryPickup, d.kind==="gold" ⇒ g=round(g*(1+kb))). ORTOGONAL (⊥) a restedMult (XP) y a wardRegen (HP)
//     por construcción (canal/seam distintos) ⇒ 0 doble-conteo; los canales del arco APILAN ENTRE sí (goldFind ⊥ wardRegen ⊥ restedMult), sólo de-stackean DENTRO de su canal.
// (B) EJE FRESCO = PERSISTENCIA DE VÍNCULO (proximidad pareada SOSTENIDA). NO headcount instantáneo (#51), NO área/celdas (#55), NO velocidad (#58), NO cobertura angular (#59). El server asigna
//     los presentes a celdas coarse (cellSize) y cuenta los PARES (i<j) cuyas celdas distan Chebyshev≤1 (misma o adyacente = próximos); ≥minPairs pares sostenidos ⇒ acumula un `kinship` con decay.
//
// ★ DIFERENCIADOR (checks 5/9, no-negociable): 1 solo ⇒ 0 pares ⇒ NO abre; 2 LEJOS (Chebyshev≥2) ⇒ 0 pares ⇒ NO abre; N AMONTONADOS ⇒ pares=C(N,2) alto ⇒ SÍ abre (OPUESTO a Warding, que con
// amontonados NO abría por onRing 0 ⇒ ejes ⊥); 2 clusters separados ⇒ pares INTRA (no inter) ⇒ cuenta PARES no headcount. ★ ≠ Congregación: un PAR 1 tick (dt=0.5) ⇒ kinship 0.5 < 2 ⇒ Tier 0 ⇒
// NO abre; hace falta PERMANENCIA (dt≥2). Funciona con jugadores QUIETOS (posiciones, no velocidad ⇒ ≠ Convoy).
//
// ★ ORTOGONALIDAD (check 13, no-negociable): abrir un vínculo (goldFindMul>0) NO cambia restedXpMult NI wardRegenMul; activar restedMult (CONVOY) o wardRegen (WARD) NO cambia goldFindMul. 3 canales ⊥.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO kinship {kinship,atMs} + MISMO reloj (nowMs) ⇒ ven kinship + tier + boost + goldFactor
// IDÉNTICOS byte-a-byte (0 desync). Sostener (kinship sube) y decay al romperse CONVERGEN. El passive es COMPARTIDO (no per-hero): A SALE de la zona ⇒ su Δ cae a 0 PERO el kinship/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.kinship (flip KINSHIP_BOND.enabled IN-MEMORY + inyección snapshot {zona→{kinship,atMs}} / positions / pairsProbe + nowMs/toZone/leave drivers + goldTick para el seam goldFind)
// + __dev.convoy (canal restedMult) + __dev.ward (canal wardRegen) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Camaradería").
//
// Checks:
//   1  boots to play, __dev.kinship + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): KINSHIP_BOND.enabled false AND G.kinship NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'kinship'/'kinshipServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ PARES = función PURA (kinshipPairs vía pairsProbe): same⇒1; adj⇒1; far⇒0; 1solo⇒0; clump4⇒6; 2clusters⇒2.
//   6  TABLA de tiers = función PURA del KINSHIP: kinship→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; kinship negativo ⇒ clamped a 0/descartado.
//   8  ★ ACUMULADOR sostenido = función de las POSICIONES: par sostenido dt=3⇒kinship 3 (T1); dt=6⇒kinship 6 (T3) = accruePerSec·dt exacto.
//   9  ★ DIFERENCIADOR solo/lejos vs amontonados/par + ≠ Congregación (1 tick): 1solo/far⇒0 (NO abre); clump4⇒abre (OPUESTO a Warding); par dt=0.5⇒0 (≠ Cong, requiere permanencia); par dt=4⇒T2.
//  10  ★ DECAY determinista 0-RNG: kinship baja por vida-media (base 8 T3; +25s ⇒ 4 T2; +50s ⇒ 2 T1). Techo capKinship no interfiere.
//  11  PASSIVE compartido (canal goldFind): kinship≥umbral + héroe EN la zona ⇒ goldFindMul==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  12  ★ CANAL FRESCO goldFind wired + BONO DE ORO: seam tryPickup gold ⇒ g=round(g*(1+kinshipMul(h,'goldFind'))); LIVE goldTick: vínculo abierto ⇒ oro pagado = round(raw*(1+boost)); OFF ⇒ paid==raw + tag "".
//  13  ★ ORTOGONALIDAD goldFind ⊥ restedMult ⊥ wardRegen (0 doble-conteo): abrir vínculo NO cambia restedXpMult/wardRegenMul; CONVOY(restedMult)/WARD(wardRegen) NO cambian goldFindMul.
//  14  ★ 0-REGRESIÓN: los 10 flags del arco ya LIVE siguen served enabled:true; WARDING_RING served false (DARK #59 pendiente flip); KINSHIP_BOND served false (DARK #60).
//  15  ★ VÍNCULO 6 zonas: las 6 zonas de KINSHIP_BOND.zones hospedan un vínculo observable (kinship≥6 ⇒ T3) broken=[].
//  16  render badge "Camaradería" se DIBUJA con la feature ON (ctx.fillText "Camaradería" count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO kinship+reloj ⇒ kinship/tier/boost/goldFactor IDÉNTICOS byte-a-byte; sostener(T3)/decaer(T2) CONVERGE; A sale ⇒ Δ_A=0 PERO kinship/tier compartidos + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2361-kinship-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2361");
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

// sets de POSICIONES de prueba (cellSize 128 ⇒ cell(x)=floor(x/128); par próximo = celdas Chebyshev≤1)
const P = {
  same:  [{ x: 10, y: 10 }, { x: 60, y: 60 }],                                           // ambos cell(0,0) ⇒ 1 par
  adj:   [{ x: 10, y: 10 }, { x: 140, y: 20 }],                                          // cell(0,0)+(1,0) adyacente ⇒ 1 par
  far:   [{ x: 10, y: 10 }, { x: 300, y: 10 }],                                          // cell(0,0)+(2,0) Chebyshev 2 ⇒ 0 pares (NO abre)
  one:   [{ x: 10, y: 10 }],                                                             // 1 solo ⇒ 0 pares
  clump4:[{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 40 }],       // 4 en cell(0,0) ⇒ C(4,2)=6 pares (AMONTONADOS ABREN, opuesto a Warding)
  two:   [{ x: 10, y: 10 }, { x: 30, y: 30 }, { x: 800, y: 800 }, { x: 820, y: 820 }],   // 2 clusters lejanos: 1 par intra-A + 1 par intra-B, 0 inter ⇒ 2 pares (PARES, no headcount)
};

const NOW = 9600000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installKin(page) {
  await page.evaluate((NOW) => {
    window.__KNOW = NOW;
    // empuja el kinship crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ kinship == base exacto)
    window.__ksnap = (zone, kin) => { window.__dev.kinship({ clear: true, nowMs: window.__KNOW }); window.__dev.kinship({ nowMs: window.__KNOW, push: { [zone]: { kinship: kin, atMs: window.__KNOW } } }); };
    // aplica POSICIONES {pts,dt} en UNA zona (CLEAR antes ⇒ kinship = accruePerSec·dt si sostiene, o 0). Prueba pares/diferenciadores.
    window.__kpos = (zone, pts, dt) => { window.__dev.kinship({ clear: true, nowMs: window.__KNOW }); window.__dev.kinship({ nowMs: window.__KNOW, positions: { [zone]: { pts, dt } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__kat = (zone, elapsedSec) => window.__dev.kinship({ nowMs: window.__KNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un kinship `kin` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (bondable + zona coincide).
    window.__kpick = (kin) => {
      window.__dev.kinship({ enabled: true });
      const zones = window.__dev.kinship().zones || [];
      for (const z of zones) {
        window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
        const s = window.__dev.kinship({ nowMs: window.__KNOW, push: { [z]: { kinship: kin, atMs: window.__KNOW } }, toZone: z });
        if (s.zone === z && s.bondable) return { zone: z, kinship: s.kinship, tier: s.tier, boost: s.goldFindMul };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.influx && window.__dev.standings && window.__dev.congregation && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.kinship + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.kinship never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.kinship());
  ok("2 byte-id OFF (fresh boot): KINSHIP_BOND.enabled false AND G.kinship NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.kinship === 0 && dark.boost === 0 && dark.tag === "" && dark.kinshipMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} kinship=${dark.kinship} boost=${dark.boost} tag="${dark.tag}" map=${JSON.stringify(dark.kinshipMap)}`);

  // 3 save OFF has no 'kinship'/'kinshipServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'kinship'/'kinshipServer' key in save blob (estado 100% derivado/transitorio)", !/"kinship(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.kinship({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.kinship({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installKin(page);

  // 5 ★ pairs = pure fn (kinshipPairs via probe)
  const pr = await page.evaluate((P) => {
    window.__dev.kinship({ enabled: true });
    const C = (positions) => window.__dev.kinship({ pairsProbe: { positions } }).probe;
    return { same: C(P.same), adj: C(P.adj), far: C(P.far), one: C(P.one), clump4: C(P.clump4), two: C(P.two) };
  }, P);
  ok("5 ★ PARES = función PURA (kinshipPairs): same⇒1; adj⇒1; far⇒0; 1solo⇒0; clump4⇒6; 2clusters⇒2",
     pr.same.pairs === 1 && pr.adj.pairs === 1 && pr.far.pairs === 0 && pr.one.pairs === 0 && pr.clump4.pairs === 6 && pr.two.pairs === 2, JSON.stringify(pr));

  // 6 tier table = pure fn of KINSHIP
  const tab = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const m of [1, 2, 4, 6, 8]) {
      window.__ksnap(zone, m);
      const vm = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
      out.push({ m, kinship: vm.kinship, tier: vm.tier, boost: vm.goldFindMul });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.kinship, r.m) && r.tier === expTier[r.m] && near(r.boost, expBoost[r.m]));
  ok("6 TABLA de tiers = función PURA del KINSHIP: kinship→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative kinship)
  const refl = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const zones = window.__dev.kinship().zones; const z0 = zones[0];
    window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
    window.__dev.kinship({ nowMs: window.__KNOW, push: { [z0]: { kinship: 4, atMs: window.__KNOW }, town: { kinship: 6, atMs: window.__KNOW } } });
    const s = window.__dev.kinship({ nowMs: window.__KNOW, toZone: z0 });
    window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
    window.__dev.kinship({ nowMs: window.__KNOW, push: { [z0]: { kinship: -5, atMs: window.__KNOW } } });
    const neg = window.__dev.kinship({ nowMs: window.__KNOW, toZone: z0 });
    return { z0, valid: s.kinship, map: s.kinshipMap, negK: neg.kinship, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.map || {})) && refl.negK === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: zona válida refleja kinship; zona fuera de `zones` DESCARTADA; kinship negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accrual = fn of POSITIONS: sustained pair dt=3 ⇒ kinship 3 (T1); dt=6 ⇒ kinship 6 (T3)
  const acc = await page.evaluate((P) => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__kpos(zone, P.same, 3);
    const a = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    window.__kpos(zone, P.same, 6);
    const b = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    return { zone, aK: a.kinship, aTier: a.tier, bK: b.kinship, bTier: b.tier };
  }, P);
  ok("8 ★ ACUMULADOR sostenido = función de las POSICIONES: par próximo sostenido dt=3⇒kinship 3 (T1); dt=6⇒kinship 6 (T3) = accruePerSec·dt exacto",
     !acc.bad && near(acc.aK, 3) && acc.aTier === 1 && near(acc.bK, 6) && acc.bTier === 3, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — lone/far do NOT open; clumped opens (opposite of Warding); 1-tick pair does NOT open (≠ Congregation)
  const diff = await page.evaluate((P) => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (pts, dt) => { window.__kpos(zone, pts, dt); const s = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone }); return { kinship: s.kinship, tier: s.tier, mul: s.goldFindMul }; };
    return {
      zone,
      lone:  read(P.one, 6),      // 1 solo ⇒ 0 pares ⇒ NO abre
      far:   read(P.far, 6),      // 2 lejos (Chebyshev≥2) ⇒ 0 pares ⇒ NO abre
      clump: read(P.clump4, 4),   // 4 AMONTONADOS ⇒ pares=6 ⇒ ABRE (OPUESTO a Warding, que con amontonados onRing 0 NO abría)
      tick:  read(P.same, 0.5),   // ★ ≠ Congregación: un PAR 1 tick (dt=0.5) ⇒ kinship 0.5 < 2 ⇒ NO abre (requiere PERMANENCIA)
      hold:  read(P.same, 4),     // par SOSTENIDO dt=4 ⇒ kinship 4 ⇒ T2 ⇒ passive>0
    };
  }, P);
  ok("9 ★ DIFERENCIADOR solo/lejos⇒0 (NO abre); amontonados⇒ABRE (opuesto a Warding); par 1-tick dt=0.5⇒0 (≠ Congregación, requiere permanencia); par sostenido dt=4⇒T2",
     !diff.bad && near(diff.lone.kinship, 0) && diff.lone.tier === 0 && near(diff.far.kinship, 0) && diff.far.tier === 0 &&
     diff.clump.kinship >= 4 && diff.clump.tier >= 2 && diff.clump.mul > 0 &&
     near(diff.tick.kinship, 0.5) && diff.tick.tier === 0 && diff.tick.mul === 0 &&
     near(diff.hold.kinship, 4) && diff.hold.tier === 2 && diff.hold.mul > 0, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life (25s)
  const decay = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__ksnap(zone, 8);                  // base kinship 8 (T3)
    const at0 = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    window.__ksnap(zone, 8);
    const hl1 = window.__kat(zone, 25);       // +25s (1 vida-media) ⇒ 4 ⇒ T2
    window.__ksnap(zone, 8);
    const hl2 = window.__kat(zone, 50);       // +50s (2 vidas-media) ⇒ 2 ⇒ T1
    return { zone, base: at0.kinship, baseT: at0.tier, hl1: hl1.kinship, hl1T: hl1.tier, hl2: hl2.kinship, hl2T: hl2.tier };
  });
  ok("10 ★ DECAY determinista 0-RNG: kinship baja por vida-media (base 8⇒T3; +25s⇒4 T2; +50s⇒2 T1)",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.hl1, 4) && decay.hl1T === 2 && near(decay.hl2, 2) && decay.hl2T === 1, JSON.stringify(decay));

  // 11 passive isolated (goldFind channel): in-zone kinship≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(4); if (!w) return { bad: true };          // kinship 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.kinship({ nowMs: window.__KNOW, toZone: w.zone });
    const out = window.__dev.kinship({ leave: true });
    return { zone: w.zone, inMul: inz.goldFindMul, inTier: inz.tier, inK: inz.kinship, inFactor: inz.goldFactor, outMul: out.goldFindMul, outTier: out.tier };
  });
  ok("11 PASSIVE compartido (canal goldFind, aislado): héroe EN la zona con kinship≥umbral ⇒ goldFindMul==boost del tier (T2=0.10, goldFactor 1.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inK, 4) && near(pass.inFactor, 1.10) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ FRESH CHANNEL goldFind wired + GOLD BONUS effect
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function kinshipMul/.test(simSrc) && /kinshipMul\(h,\s*KINSHIP_BOND\.channel\|\|"goldFind"\)/.test(simSrc) &&
    /if\(kb>0\)\s*g=Math\.round\(g\*\(1\+kb\)\)/.test(simSrc) && /d\.kind==="gold"/.test(simSrc);
  const gold = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(6); if (!w) return { bad: true };          // kinship 6 ⇒ T3 ⇒ boost 0.15
    const zone = w.zone;
    window.__ksnap(zone, 6); window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });   // vínculo abierto en la zona del héroe
    const before = window.__dev.kinship().hero.gold;
    const gp = window.__dev.kinship({ goldTick: 100 }).goldPicked;                            // recoge 100 sintético ⇒ paga round(100*1.15)=115
    const afterGold = window.__dev.kinship().hero.gold;
    // OFF ⇒ kinshipMul gated ⇒ goldTick paga raw exacto (byte-id) + tag ""
    window.__dev.kinship({ enabled: false });
    const offBefore = window.__dev.kinship().hero.gold;
    const gpOff = window.__dev.kinship({ goldTick: 100 }).goldPicked;
    const off = window.__dev.kinship(); const offAfter = off.hero.gold;
    return { zone, before, gp, afterGold, boost: 0.15, offBefore, gpOff, offAfter, offTag: off.tag };
  });
  const goldOk = !gold.bad && gold.gp && gold.gp.paid === 115 && near(gold.gp.boost, 0.15) && (gold.afterGold - gold.before) === 115 &&
    gold.gpOff && gold.gpOff.paid === 100 && (gold.offAfter - gold.offBefore) === 100 && gold.offTag === "";   // OFF ⇒ paid==raw
  ok("12 ★ CANAL FRESCO goldFind wired + BONO DE ORO: seam tryPickup gold ⇒ g=round(g*(1+kinshipMul)); vínculo T3 abierto ⇒ goldTick 100 paga 115 (round(100*1.15)); OFF ⇒ paid==raw (100) + tag \"\"",
     seamWired && goldOk, `wired=${seamWired} on(${gold.before}→${gold.afterGold} gp=${JSON.stringify(gold.gp)}) off(${gold.offBefore}→${gold.offAfter} gp=${JSON.stringify(gold.gpOff)}) offTag="${gold.offTag}"`);

  // 13 ★ ORTHOGONALITY goldFind ⊥ restedMult ⊥ wardRegen (0 double-count)
  const orth = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(6); if (!w) return { bad: true };          // kinship 6 ⇒ T3 ⇒ goldFind boost 0.15
    const zone = w.zone;
    const a = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    const goldBefore = a.goldFindMul, restedBefore = a.restedXpMult, wardBefore = a.wardRegenMul;
    // activa CONVOY_MARCH (canal restedMult) + WARDING_RING (canal wardRegen) en la MISMA zona ⇒ SUS canales suben pero goldFindMul NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__KNOW });
    window.__dev.convoy({ nowMs: window.__KNOW, push: { [zone]: { march: 6, atMs: window.__KNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__KNOW });
    window.__dev.ward({ nowMs: window.__KNOW, push: { [zone]: { ward: 6, atMs: window.__KNOW } }, toZone: zone });
    const b = window.__dev.kinship({ nowMs: window.__KNOW, toZone: zone });
    const cv = window.__dev.convoy({ nowMs: window.__KNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, goldBefore, restedBefore, wardBefore, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul, convoyRested: cv.convoyMulRested };
  });
  const orthOk = !orth.bad && orth.channel === "goldFind" && orth.goldBefore > 0 &&
    near(orth.goldAfter, orth.goldBefore) &&                          // los arcos restedMult/wardRegen NO cambian goldFind
    orth.convoyRested > 0 && orth.wardAfter > 0;                      // y CONVOY/WARD sí aportan en SUS canales (independientes)
  ok("13 ★ ORTOGONALIDAD goldFind ⊥ restedMult ⊥ wardRegen (0 doble-conteo): abrir vínculo NO toca restedMult/wardRegen; activar CONVOY/WARD NO cambia goldFindMul; canal='goldFind'",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 10 flags del arco siguen LIVE served; WARDING_RING + KINSHIP_BOND served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const wardDark = flag("WARDING_RING") === "false";
  const kinDark = flag("KINSHIP_BOND") === "false";
  ok("14 ★ 0-REGRESIÓN: 10 flags del arco served enabled:true; WARDING_RING + KINSHIP_BOND served false (DARK)",
     arcAllOn && wardDark && kinDark, `kinship=${flag("KINSHIP_BOND")} ward=${flag("WARDING_RING")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ VÍNCULO en las 6 zonas
  const zonesRes = await page.evaluate(() => {
    window.__dev.kinship({ enabled: true });
    const zones = window.__dev.kinship().zones; const broken = [];
    for (const z of zones) {
      window.__dev.kinship({ clear: true, nowMs: window.__KNOW });
      const s = window.__dev.kinship({ nowMs: window.__KNOW, push: { [z]: { kinship: 6, atMs: window.__KNOW } }, toZone: z });
      if (!(s.zone === z && s.bondable && s.tier === 3 && s.goldFindMul > 0)) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ VÍNCULO 6 zonas: las 6 zonas de KINSHIP_BOND.zones hospedan un vínculo observable (kinship≥6 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Camaradería" drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Camaradería") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.kinship({ enabled: true });
    const w = window.__kpick(6);
    window.__ksnap(w.zone, 6); window.__dev.kinship({ nowMs: window.__KNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.kinship({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("16 render badge \"Camaradería\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.kinship({ enabled: true }); const w = window.__kpick(6); window.__ksnap(w.zone, 6); window.__dev.kinship({ nowMs: window.__KNOW, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence
  await page.evaluate(() => window.__dev.kinship({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installKin(pageB);
  const northStar = await (async () => {
    const readBoth = async (kin, zone, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ kin, zone, elapsedSec, NOW }) => {
        window.__dev.kinship({ enabled: true });
        window.__dev.kinship({ clear: true, nowMs: NOW });
        const s = window.__dev.kinship({ nowMs: NOW + (elapsedSec || 0) * 1000, push: { [zone]: { kinship: kin, atMs: NOW } }, toZone: zone });
        return { kinship: s.kinship, tier: s.tier, boost: s.goldFindMul, factor: s.goldFactor, nowMs: s.nowMs, map: s.kinshipMap };
      }, { kin, zone, elapsedSec, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const zone = (await page.evaluate(() => (window.__dev.kinship().zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    const sustain = await readBoth(6, zone, 0);    // T3 sostenido
    const decayed = await readBoth(8, zone, 25);   // +25s ⇒ 4 ⇒ T2 (convergen tras decay)
    const aLeaves = await page.evaluate(() => { const s = window.__dev.kinship({ leave: true }); return { mul: s.goldFindMul, tier: s.tier, map: s.kinshipMap }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.kinship({ nowMs: NOW, toZone: zone }); return { mul: s.goldFindMul, tier: s.tier, kinship: s.kinship }; }, { zone, NOW });
    return { zone, sustain, decayed, aLeaves, bIntact };
  })();
  const nsOk = northStar.sustain.eq && northStar.sustain.a.tier === 3 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 2 && near(northStar.decayed.a.kinship, 4) &&
    northStar.aLeaves.mul === 0 &&                                     // A fuera ⇒ Δ_A=0
    northStar.bIntact.mul > 0 && northStar.bIntact.tier === 3 &&       // B intacto (kinship compartido server-authoritative)
    (northStar.aLeaves.map && (northStar.aLeaves.map[northStar.zone] || 0) > 0);
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO kinship+reloj ⇒ kinship/tier/boost/goldFactor byte-idénticos (sostener T3, decaer T2); A sale ⇒ Δ_A=0 PERO kinship compartido + Δ_B INTACTOS (0 desync)",
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
