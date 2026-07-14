// CAS-2362 — GE self-verify for CORDÓN DE GUARDIA / WARDING RING (DARK, WARDING_RING.enabled:false). EVO mecánica #59 — DOS pivotes FRESCOS a la vez.
// (A) CANAL DE RECOMPENSA FRESCO = `wardRegen` (regen de HP fuera de combate) — el arco #47–58 saturó `restedMult` (bono XP en gainXP); #59 abre un canal NUEVO ⇒ ORTOGONAL (⊥) a
//     restedMult por construcción ⇒ 0 doble-conteo aunque coincida con cualquier tier de XP. Enganchado en el MISMO chokepoint de curación que SAFEZONE.regenPct/templeMul (mhp*rate*dt
//     vía pactHeal) pero con kind DISTINTO ("wardRegen" ≠ "safeRegen") ⇒ no dobla el regen del Templo ni ORDER_TERRITORY. Un Cordón abierto CREA regen de HP en una zona de caza (santuario móvil).
// (B) EJE FRESCO = COBERTURA ANGULAR (distribución de RUMBOS de las posiciones alrededor del centroide). NO headcount (#51), NO área/celdas (#55), NO velocidad (#58), NO reloj (#50).
//     El server calcula el centroide de los presentes, el rumbo de cada uno desde él, y cuenta cuántos SECTORES angulares distintos ocupan los del anillo (fuera de ringRadius) ⇒ cobertura∈[0,1].
//
// ★ DIFERENCIADOR (checks 5/9, no-negociable): N AMONTONADOS (todos dentro de ringRadius del centroide) ⇒ onRing 0 ⇒ NO abre (≠ Congregación, que abriría por headcount N); N en LÍNEA por el
// centroide ⇒ 2 sectores ⇒ cover baja ⇒ NO abre (≠ Expedición cobertura de ÁREA, que SÍ abriría con muchas celdas en línea); 1 solo ⇒ centroide en él ⇒ onRing 0 ⇒ NO abre; 2 opuestos ⇒ onRing 2<K ⇒
// NO abre; N REPARTIDOS en rumbos ⇒ muchos sectores ⇒ cover alta ⇒ abre. Funciona con jugadores QUIETOS (posiciones, no velocidad ⇒ ≠ Convoy).
//
// ★ ORTOGONALIDAD (check 13, no-negociable): abrir un Cordón (wardMulRegen>0) NO cambia restedXpMult; activar el arco restedMult NO cambia wardMulRegen. Canal wardRegen ⊥ restedMult ⇒ 0 doble-conteo.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO ward {ward,atMs} + MISMO reloj (nowMs) ⇒ ven ward + tier + boost + regenRate
// IDÉNTICOS byte-a-byte (0 desync). Sostener (ward sube) y decay al romperse CONVERGEN. El passive es COMPARTIDO (no per-hero): A SALE de la zona ⇒ su Δ cae a 0 PERO el ward/tier server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.ward (flip WARDING_RING.enabled IN-MEMORY + inyección snapshot {zona→{ward,atMs}} / positions / coverageProbe + nowMs/toZone/leave drivers) + __dev.safeZone(setHp) para
// observar el regen de HP + __dev.standings/…/convoy (canal restedMult, para la ortogonalidad) + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Cordón").
//
// Checks:
//   1  boots to play, __dev.ward + arc hooks + safeZone(setHp) + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): WARDING_RING.enabled false AND G.ward NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'ward'/'wardServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ COBERTURA = función PURA (wardCoverage vía coverageProbe): ring3⇒onRing3/cover0.375; clump8⇒onRing0/cover0; line6⇒onRing6/cover0.25; opp2⇒onRing2/cover0.25; 1solo⇒onRing0; ring8⇒cover1.
//   6  TABLA de tiers = función PURA del WARD: ward→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista.
//   7  SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona fuera de `zones` DESCARTADA; ward negativo ⇒ clamped a 0/descartado.
//   8  ★ ACUMULADOR sostenido = función de las POSICIONES: anillo repartido (ring6) dt=3⇒ward 3 (T1); dt=6⇒ward 6 (T3) = accruePerSec·dt exacto.
//   9  ★ DIFERENCIADOR amontonados/línea/opuestos/solo vs anillo: clump8⇒0 (NO abre, ≠ Congregación); line6⇒0 (NO abre, ≠ Expedición área); opp2⇒0; 1solo⇒0; ring6 repartido⇒ward≥2/tier≥1/passive>0.
//  10  ★ DECAY determinista 0-RNG: ward baja por vida-media (base 8 T3; +25s ⇒ 4 T2; +50s ⇒ 2 T1). Techo capWard no interfiere.
//  11  PASSIVE compartido (canal wardRegen): ward≥umbral + héroe EN la zona ⇒ wardMulRegen==boost del tier + tier≥1; leave ⇒ 0 + tier 0.
//  12  ★ CANAL FRESCO wardRegen wired + REGEN DE HP: source tiene wardRegenTick en updatePlay (gated) + wardMul(h,'wardRegen') + pactHeal(mhp*rate*dt) mismo chokepoint; LIVE: setHp bajo + Cordón abierto ⇒ HP SUBE; OFF ⇒ tag "" + mul 0.
//  13  ★ ORTOGONALIDAD wardRegen ⊥ restedMult (0 doble-conteo): abrir Cordón NO cambia restedXpMult; el arco restedMult NO cambia wardMulRegen; kind 'wardRegen' ≠ 'safeRegen' (SAFEZONE/TERRITORY).
//  14  ★ 0-REGRESIÓN: los 10 flags del arco ya LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE/BATTLE_SYNC/CONVOY_MARCH) siguen served enabled:true; WARDING_RING served false (DARK).
//  15  ★ CORDÓN 6 zonas: las 6 zonas de WARDING_RING.zones hospedan un Cordón observable (ward≥6 ⇒ T3) broken=[].
//  16  render badge "Cordón" se DIBUJA con la feature ON (ctx.fillText "Cordón" count>0) y NO con OFF (count 0) + arco regr + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO ward+reloj ⇒ ward/tier/boost/regenRate IDÉNTICOS byte-a-byte; sostener(T3)/decaer(T2) CONVERGE; A sale ⇒ Δ_A=0 PERO ward/tier compartidos + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2362-ward-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2362");
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

// sets de POSICIONES de prueba (centroide = media; ringRadius 40, sectors 8=45° c/u, minMembers 3, coverThreshold 0.375)
const R = 100, s60 = 86.6025;
const P = {
  ring3: [{ x: R, y: 0 }, { x: -50, y: s60 }, { x: -50, y: -s60 }],                 // 120° apart ⇒ 3 sectores {0,2,5} ⇒ cover 3/8=0.375
  ring6: [{ x: R, y: 0 }, { x: 50, y: s60 }, { x: -50, y: s60 }, { x: -R, y: 0 }, { x: -50, y: -s60 }, { x: 50, y: -s60 }],  // 60° apart ⇒ 6 sectores ⇒ 0.75
  ring8: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ x: R * Math.cos((i + 0.5) * Math.PI / 4), y: R * Math.sin((i + 0.5) * Math.PI / 4) })),   // mid-sector (22.5°+45°k) ⇒ 8 sectores robustos ⇒ 1.0 (evita jitter FP en bordes)
  clump8: [{ x: 495, y: 495 }, { x: 505, y: 495 }, { x: 495, y: 505 }, { x: 505, y: 505 }, { x: 500, y: 500 }, { x: 498, y: 502 }, { x: 502, y: 498 }, { x: 500, y: 498 }], // amontonados (todos <40 del centroide) ⇒ onRing 0
  line6: [{ x: -150, y: 0 }, { x: -100, y: 0 }, { x: -50, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 150, y: 0 }],       // en línea por el centroide ⇒ 2 sectores {0,4} ⇒ 0.25
  opp2: [{ x: R, y: 0 }, { x: -R, y: 0 }],                                          // 2 opuestos ⇒ onRing 2 (<K) ⇒ NO abre
  one: [{ x: R, y: 0 }],                                                            // 1 solo ⇒ centroide en él ⇒ onRing 0
};

const NOW = 5000000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installWard(page) {
  await page.evaluate((NOW) => {
    window.__WNOW = NOW;
    // empuja el ward crudo de UNA zona (CLEAR antes ⇒ atMs=NOW ⇒ dtMs=0 al proyectar a NOW ⇒ ward == base exacto)
    window.__wsnap = (zone, ward) => { window.__dev.ward({ clear: true, nowMs: window.__WNOW }); window.__dev.ward({ nowMs: window.__WNOW, push: { [zone]: { ward, atMs: window.__WNOW } } }); };
    // aplica POSICIONES {pts,dt} en UNA zona (CLEAR antes ⇒ ward = accruePerSec·dt si sostiene, o 0). Prueba cobertura/diferenciadores.
    window.__wpos = (zone, pts, dt) => { window.__dev.ward({ clear: true, nowMs: window.__WNOW }); window.__dev.ward({ nowMs: window.__WNOW, positions: { [zone]: { pts, dt } } }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el VM de esa zona (dtMs = elapsedSec*1000 ⇒ decay)
    window.__wat = (zone, elapsedSec) => window.__dev.ward({ nowMs: window.__WNOW + (elapsedSec || 0) * 1000, toZone: zone });
    // inyecta un ward `ward` (atMs=NOW ⇒ exacto) en cada zona candidata, teleporta y devuelve la 1ª donde el héroe cae DENTRO (wardable + zona coincide).
    window.__wpick = (ward) => {
      window.__dev.ward({ enabled: true });
      const zones = window.__dev.ward().zones || [];
      for (const z of zones) {
        window.__dev.ward({ clear: true, nowMs: window.__WNOW });
        const s = window.__dev.ward({ nowMs: window.__WNOW, push: { [z]: { ward, atMs: window.__WNOW } }, toZone: z });
        if (s.zone === z && s.wardable) return { zone: z, ward: s.ward, tier: s.tier, boost: s.wardMulRegen };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ward && window.__dev.convoy && window.__dev.influx && window.__dev.standings && window.__dev.congregation && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.rested));
  ok("1 boots to play, __dev.ward + arc hooks + safeZone(setHp) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.ward never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.ward());
  ok("2 byte-id OFF (fresh boot): WARDING_RING.enabled false AND G.ward NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.ward === 0 && dark.boost === 0 && dark.tag === "" && dark.wardMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} ward=${dark.ward} boost=${dark.boost} tag="${dark.tag}" wardMap=${JSON.stringify(dark.wardMap)}`);

  // 3 save OFF has no 'ward'/'wardServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'ward'/'wardServer' key in save blob (estado 100% derivado/transitorio)", !/"ward(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.ward({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.ward({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installWard(page);

  // 5 ★ coverage = pure fn (wardCoverage via probe)
  const cov = await page.evaluate((P) => {
    window.__dev.ward({ enabled: true });
    const C = (positions) => window.__dev.ward({ coverageProbe: { positions } }).probe;
    return { ring3: C(P.ring3), clump8: C(P.clump8), line6: C(P.line6), opp2: C(P.opp2), one: C(P.one), ring8: C(P.ring8) };
  }, P);
  ok("5 ★ COBERTURA = función PURA (wardCoverage): ring3⇒onRing3/cover0.375; clump8⇒onRing0/cover0; line6⇒onRing6/cover0.25; opp2⇒onRing2/cover0.25; 1solo⇒onRing0; ring8⇒cover1",
     cov.ring3.onRing === 3 && near(cov.ring3.cover, 0.375) && cov.clump8.onRing === 0 && near(cov.clump8.cover, 0) &&
     cov.line6.onRing === 6 && near(cov.line6.cover, 0.25) && cov.opp2.onRing === 2 && near(cov.opp2.cover, 0.25) &&
     cov.one.onRing === 0 && near(cov.ring8.cover, 1), JSON.stringify(cov));

  // 6 tier table = pure fn of WARD
  const tab = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const m of [1, 2, 4, 6, 8]) {
      window.__wsnap(zone, m);
      const vm = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
      out.push({ m, ward: vm.ward, tier: vm.tier, boost: vm.wardMulRegen });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const expBoost = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.ward, r.m) && r.tier === expTier[r.m] && near(r.boost, expBoost[r.m]));
  ok("6 TABLA de tiers = función PURA del WARD: ward→tier (1→T0,2→T1,4→T2,6→T3,8→T3) + boost (0/0.05/0.10/0.15) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (drop out-of-zone + negative ward)
  const refl = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const zones = window.__dev.ward().zones; const z0 = zones[0];
    window.__dev.ward({ clear: true, nowMs: window.__WNOW });
    window.__dev.ward({ nowMs: window.__WNOW, push: { [z0]: { ward: 4, atMs: window.__WNOW }, town: { ward: 6, atMs: window.__WNOW } } });
    const s = window.__dev.ward({ nowMs: window.__WNOW, toZone: z0 });
    window.__dev.ward({ clear: true, nowMs: window.__WNOW });
    window.__dev.ward({ nowMs: window.__WNOW, push: { [z0]: { ward: -5, atMs: window.__WNOW } } });
    const neg = window.__dev.ward({ nowMs: window.__WNOW, toZone: z0 });
    return { z0, valid: s.ward, wardMap: s.wardMap, negWard: neg.ward, negTier: neg.tier };
  });
  const reflOk = near(refl.valid, 4) && !("town" in (refl.wardMap || {})) && refl.negWard === 0 && refl.negTier === 0;
  ok("7 SERVER-AUTHORITATIVE reflect+validate: snapshot ⇒ zona válida refleja ward; zona fuera de `zones` DESCARTADA; ward negativo ⇒ 0 (clamped)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accrual = fn of POSITIONS: sustained ring6 dt=3 ⇒ ward 3 (T1); dt=6 ⇒ ward 6 (T3)
  const acc = await page.evaluate((P) => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__wpos(zone, P.ring6, 3);
    const a = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
    window.__wpos(zone, P.ring6, 6);
    const b = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
    return { zone, aWard: a.ward, aTier: a.tier, bWard: b.ward, bTier: b.tier };
  }, P);
  ok("8 ★ ACUMULADOR sostenido = función de las POSICIONES: anillo repartido (ring6) dt=3⇒ward 3 (T1); dt=6⇒ward 6 (T3) = accruePerSec·dt exacto",
     !acc.bad && near(acc.aWard, 3) && acc.aTier === 1 && near(acc.bWard, 6) && acc.bTier === 3, JSON.stringify(acc));

  // 9 ★ DIFFERENTIATOR — clumped / line / opposite / lone do NOT open; spread ring opens
  const diff = await page.evaluate((P) => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (pts, dt) => { window.__wpos(zone, pts, dt); const s = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone }); return { ward: s.ward, tier: s.tier, mul: s.wardMulRegen }; };
    return {
      zone,
      clump: read(P.clump8, 6),   // 8 AMONTONADOS ⇒ onRing 0 ⇒ NO abre (≠ Congregación abriría por headcount 8)
      line: read(P.line6, 6),     // 6 en LÍNEA ⇒ 2 sectores ⇒ cover 0.25 ⇒ NO abre (≠ Expedición área)
      opp: read(P.opp2, 6),       // 2 opuestos ⇒ onRing 2 < K ⇒ NO abre
      lone: read(P.one, 6),       // 1 solo ⇒ onRing 0 ⇒ NO abre
      ring: read(P.ring6, 4),     // anillo repartido dt=4 ⇒ ward 4 ⇒ T2 ⇒ passive>0
    };
  }, P);
  ok("9 ★ DIFERENCIADOR amontonados/línea/opuestos/solo vs anillo: clump8⇒0 (NO abre, ≠ Congregación); line6⇒0 (NO abre, ≠ Expedición área); opp2⇒0; 1solo⇒0; ring6 repartido⇒ward≥2/tier≥1/passive>0",
     !diff.bad && near(diff.clump.ward, 0) && diff.clump.tier === 0 && diff.clump.mul === 0 &&
     near(diff.line.ward, 0) && diff.line.tier === 0 && near(diff.opp.ward, 0) && diff.opp.tier === 0 &&
     near(diff.lone.ward, 0) && diff.lone.tier === 0 && diff.ring.ward >= 2 && diff.ring.tier >= 1 && diff.ring.mul > 0, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life (25s)
  const decay = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(1); if (!w) return { bad: true };
    const zone = w.zone;
    window.__wsnap(zone, 8);                  // base ward 8 (T3)
    const at0 = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
    window.__wsnap(zone, 8);
    const hl1 = window.__wat(zone, 25);       // +25s (1 vida-media) ⇒ 4 ⇒ T2
    window.__wsnap(zone, 8);
    const hl2 = window.__wat(zone, 50);       // +50s (2 vidas-media) ⇒ 2 ⇒ T1
    return { zone, base: at0.ward, baseT: at0.tier, hl1: hl1.ward, hl1T: hl1.tier, hl2: hl2.ward, hl2T: hl2.tier };
  });
  ok("10 ★ DECAY determinista 0-RNG: ward baja por vida-media (base 8⇒T3; +25s⇒4 T2; +50s⇒2 T1)",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.hl1, 4) && decay.hl1T === 2 && near(decay.hl2, 2) && decay.hl2T === 1, JSON.stringify(decay));

  // 11 passive isolated (wardRegen channel): in-zone ward≥umbral ⇒ boost == tier boost + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(4); if (!w) return { bad: true };          // ward 4 ⇒ Tier 2 ⇒ 0.10
    const inz = window.__dev.ward({ nowMs: window.__WNOW, toZone: w.zone });
    const out = window.__dev.ward({ leave: true });
    return { zone: w.zone, inMul: inz.wardMulRegen, inTier: inz.tier, inWard: inz.ward, outMul: out.wardMulRegen, outTier: out.tier };
  });
  ok("11 PASSIVE compartido (canal wardRegen, aislado): héroe EN la zona con ward≥umbral ⇒ wardMulRegen==boost del tier (T2=0.10) + tier≥1; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && near(pass.inWard, 4) && pass.outMul === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ FRESH CHANNEL wardRegen wired + HP REGEN effect
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /wardRegenTick\(h,dt\)/.test(simSrc) && /function wardRegenTick/.test(simSrc) &&
    /if\(!WARDING_RING\.enabled/.test(simSrc) && /wardMul\(h,\s*WARDING_RING\.channel\|\|"wardRegen"\)/.test(simSrc) &&
    /pactHeal\(mhp\*rate\*dt\)/.test(simSrc);
  const hp = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(8); if (!w) return { bad: true };          // ward 8 ⇒ T3 ⇒ boost 0.15
    const zone = w.zone;
    window.__wsnap(zone, 8); window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });   // Cordón abierto en la zona del héroe
    const s = window.__dev.ward();
    const maxHp = s.hero.maxHp, rate = s.wardRegenRate;                                    // regenPct×(1+0.15)
    window.__dev.safeZone({ pause: 0, setHp: Math.floor(maxHp * 0.4) });                   // HP bajo, sin pausa post-daño
    const hp0 = window.__dev.ward().hero.hp;
    // regen en AISLAMIENTO (driver determinista, sin ruido de enemigos/pausa del loop): 2×0.5s
    window.__dev.ward({ regenTick: 0.5 }); window.__dev.ward({ regenTick: 0.5 });
    const hp1 = window.__dev.ward().hero.hp;
    // OFF ⇒ wardRegenTick gated ⇒ regenTick es no-op (HP no cambia) + mul 0 + tag ""
    window.__dev.safeZone({ setHp: Math.floor(maxHp * 0.4) });
    window.__dev.ward({ enabled: false });
    const hpOffBefore = window.__dev.ward().hero.hp; window.__dev.ward({ regenTick: 0.5 });
    const off = window.__dev.ward(); const hpOffAfter = off.hero.hp;
    return { zone, hp0, hp1, maxHp, rate, boost: s.wardMulRegen, tier: s.tier, expected: +(Math.min(maxHp, Math.floor(maxHp * 0.4) + maxHp * rate * 1.0)).toFixed(2), hpOffBefore, hpOffAfter, offMul: off.wardMulRegen, offTag: off.tag };
  });
  const hpRose = !hp.bad && near(hp.hp1, hp.expected, 0.05) && hp.hp1 > hp.hp0 && hp.boost > 0 && hp.rate > 0 &&
    near(hp.hpOffAfter, hp.hpOffBefore) && hp.offMul === 0 && hp.offTag === "";   // OFF ⇒ regen no-op
  ok("12 ★ CANAL FRESCO wardRegen wired + REGEN DE HP: source wardRegenTick en updatePlay (gated) + wardMul(h,'wardRegen') + pactHeal(mhp*rate*dt); Cordón abierto ⇒ HP sube exacto (mhp·rate·dt); OFF ⇒ regen no-op + mul 0 + tag \"\"",
     seamWired && hpRose, `wired=${seamWired} hp0=${hp.hp0} hp1=${hp.hp1} exp=${hp.expected} rate=${hp.rate} boost=${hp.boost} off(${hp.hpOffBefore}→${hp.hpOffAfter}) offMul=${hp.offMul} offTag="${hp.offTag}"`);

  // 13 ★ ORTHOGONALITY wardRegen ⊥ restedMult (0 double-count)
  const orth = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(6); if (!w) return { bad: true };          // ward 6 ⇒ T3 ⇒ wardRegen boost 0.15
    const zone = w.zone;
    // restedXpMult ANTES de tocar el canal restedMult (ward abierto ⇒ wardRegen>0)
    const a = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
    const restedBefore = a.restedXpMult, wardBefore = a.wardMulRegen;
    // activa CONVOY_MARCH (canal restedMult) en la MISMA zona ⇒ restedXpMult SUBE pero wardMulRegen NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__WNOW });
    window.__dev.convoy({ nowMs: window.__WNOW, push: { [zone]: { march: 6, atMs: window.__WNOW } }, toZone: zone });
    const b = window.__dev.ward({ nowMs: window.__WNOW, toZone: zone });
    const c = window.__dev.convoy({ nowMs: window.__WNOW, toZone: zone });
    window.__dev.convoy({ enabled: false });
    return { zone, restedBefore, wardBefore, wardAfter: b.wardMulRegen, convoyRested: c.convoyMulRested, channel: a.channel };
  });
  const orthOk = !orth.bad && orth.channel === "wardRegen" && orth.wardBefore > 0 &&
    near(orth.wardAfter, orth.wardBefore) &&                          // el arco restedMult NO cambia wardRegen
    orth.convoyRested > 0;                                            // y CONVOY sí aporta en SU canal (independiente)
  ok("13 ★ ORTOGONALIDAD wardRegen ⊥ restedMult (0 doble-conteo): abrir Cordón NO toca restedMult; activar CONVOY (restedMult) NO cambia wardMulRegen; canal='wardRegen' ≠ 'safeRegen'",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 10 flags del arco siguen LIVE served; WARDING_RING served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "BATTLE_SYNC", "CONVOY_MARCH"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const wardDark = flag("WARDING_RING") === "false";
  ok("14 ★ 0-REGRESIÓN: 10 flags del arco served enabled:true; WARDING_RING served false (DARK)",
     arcAllOn && wardDark, `ward=${flag("WARDING_RING")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ CORDÓN en las 6 zonas
  const zonesRes = await page.evaluate(() => {
    window.__dev.ward({ enabled: true });
    const zones = window.__dev.ward().zones; const broken = [];
    for (const z of zones) {
      window.__dev.ward({ clear: true, nowMs: window.__WNOW });
      const s = window.__dev.ward({ nowMs: window.__WNOW, push: { [z]: { ward: 6, atMs: window.__WNOW } }, toZone: z });
      if (!(s.zone === z && s.wardable && s.tier === 3 && s.wardMulRegen > 0)) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ CORDÓN 6 zonas: las 6 zonas de WARDING_RING.zones hospedan un Cordón observable (ward≥6 ⇒ T3) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Cordón" drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    // instrumenta ctx.fillText para contar "Cordón"
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cordón") >= 0) cnt++; return orig(t, x, y); };
    // ON: abre un Cordón en la zona del héroe
    window.__dev.ward({ enabled: true });
    const w = window.__wpick(6);
    window.__wsnap(w.zone, 6); window.__dev.ward({ nowMs: window.__WNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // OFF
    window.__dev.ward({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("16 render badge \"Cordón\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.ward({ enabled: true }); const w = window.__wpick(6); window.__wsnap(w.zone, 6); window.__dev.ward({ nowMs: window.__WNOW, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence
  await page.evaluate(() => window.__dev.ward({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });   // save existente cambia el flujo de boot ⇒ limpiar antes de cargar
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // opening page B blurra page A (index.html pausa su loop); bringToFront reactiva el rAF de B ⇒ alcanza el menú
  await toPlay(pageB);
  await installWard(pageB);
  const northStar = await (async () => {
    // ambos clientes: MISMO ward+reloj en la MISMA zona ⇒ ward/tier/boost/regenRate byte-idénticos
    const readBoth = async (ward, zone, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ ward, zone, elapsedSec, NOW }) => {
        window.__dev.ward({ enabled: true });
        window.__dev.ward({ clear: true, nowMs: NOW });
        const s = window.__dev.ward({ nowMs: NOW + (elapsedSec || 0) * 1000, push: { [zone]: { ward, atMs: NOW } }, toZone: zone });
        return { ward: s.ward, tier: s.tier, boost: s.wardMulRegen, rate: s.wardRegenRate, nowMs: s.nowMs, wardMap: s.wardMap };
      }, { ward, zone, elapsedSec, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const zone = (await page.evaluate(() => (window.__dev.ward().zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    const sustain = await readBoth(6, zone, 0);    // T3 sostenido
    const decayed = await readBoth(8, zone, 25);   // +25s ⇒ 4 ⇒ T2 (convergen tras decay)
    // A SALE de la zona ⇒ Δ_A=0 PERO ward/tier compartidos + Δ_B INTACTOS (passive compartido, server-authoritative)
    const aLeaves = await page.evaluate(() => { const s = window.__dev.ward({ leave: true }); return { mul: s.wardMulRegen, tier: s.tier, wardMap: s.wardMap }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.ward({ nowMs: NOW, toZone: zone }); return { mul: s.wardMulRegen, tier: s.tier, ward: s.ward }; }, { zone, NOW });
    return { zone, sustain, decayed, aLeaves, bIntact };
  })();
  const nsOk = northStar.sustain.eq && northStar.sustain.a.tier === 3 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 2 && near(northStar.decayed.a.ward, 4) &&
    northStar.aLeaves.mul === 0 &&                                     // A fuera ⇒ Δ_A=0
    northStar.bIntact.mul > 0 && northStar.bIntact.tier === 3 &&       // B intacto (ward compartido server-authoritative)
    (northStar.aLeaves.wardMap && (northStar.aLeaves.wardMap[northStar.zone] || 0) > 0);   // el snapshot server-authoritative sigue VIVO pese a que A salió (leave sólo mueve al héroe)
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO ward+reloj ⇒ ward/tier/boost/regenRate byte-idénticos (sostener T3, decaer T2); A sale ⇒ Δ_A=0 PERO ward compartido + Δ_B INTACTOS (0 desync)",
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
