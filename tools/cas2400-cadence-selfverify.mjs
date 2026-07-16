// CAS-2400 — self-verify for CADENCIA / ÍMPETU DE COMBATE (DARK, CADENCE_RUSH.enabled:false). EVO mecánica #67 (serializa tras #66 NOCTURNE LIVE) — EJE FRESCO + CANAL REUSADO, ⊥/DISTINTO a #47-66.
// (A) EJE FRESCO = TEMPO / CADENCIA DE MATANZA (con qué RAPIDEZ EN SUCESIÓN peleas). server-authoritative, 0-RNG, INDIVIDUAL (per-pid): un COMBO-METER rodante que SUBE bumpPerKill en CADA kill y DECAE por vida-media
//     continua (reloj COMPARTIDO ⇒ mismo meter en N clientes, sin timer client-local). El RATE emerge del balance bump-vs-decay: matar RÁPIDO (bumps ganan al decay) ⇒ el meter TREPA sobre umbrales de tier; una PAUSA lo deja
//     decaer. NO es CUÁNDO (Nocturne fase temporal), A QUIÉN (Focus/Erudition), DÓNDE (Trailcraft/Delve/Wayfarer) ni SOCIAL (Kinship) — es CUÁN RÁPIDO EN SUCESIÓN. Distinto a Nocturne: SIN ventana-conteo ni gate de fase.
// (B) CANAL REUSADO = `critChance` (precisión ofensiva, MISMO canal que Delve #64). SUMA % de crítico como TÉRMINO AISLADO con DOBLE cap: (1) CAP DURO propio cadenceCritCap (≤0.35 abs) y (2) SHARE-CAP con el bono de
//     crit de Delve — el bono COMBINADO delve+cadence = min(cadenceCritCap, delveBonus+cadenceBonus) ⇒ 0 doble-dip más allá del techo (mismo patrón share-cap que Nocturne vamp vs Vampírico).
//
// ★ DIFERENCIADOR (check 7, no-negociable): eje RATE. Un BURST (6 kills muy juntos, gap 0.5s) ⇒ los bumps ganan al decay ⇒ meter TREPA ⇒ ABRE (tier≥2). Los MISMOS 6 kills ESPARCIDOS (gap 6s=1 vida-media) ⇒ el decay se come
// cada bump previo ⇒ meter≈bumpPerKill ⇒ NUNCA abre (T0). Mide TEMPO, no conteo. INDIVIDUAL (1 solo jugador basta). Permanencia: 1 kill ⇒ meter≈1 < 2 ⇒ Tier 0.
//
// ★ SHARE-CAP (check 12, no-negociable): el bono de crit COMBINADO delve+cadence del seam = min(cadenceCritCap≤0.35, delveBonus + cadenceBonus). Delve T3 (25) + Cadence T3 (25) ⇒ combinado CAPADO a 35 (Cadence cede 10, NO 25)
// ⇒ 0 doble-dip más allá del techo. cadence solo ⇒ hasta 25 (≤ cadenceCritCap). OFF ⇒ total==base (byte-id). ★ ORTOGONALIDAD (check 14): abrir ímpetu (critBonusPct≠0) NO cambia goldFind/restedMult/vamp/xpGain/wardRegen/oocMitigation/lootQuality.
//
// North Star (check 18, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→cad} + MISMO reloj (nowMs) ⇒ ven cad + tier + crit IDÉNTICOS byte-a-byte (0 desync).
// El acumulador decae por vida-media CONVERGE. El cad es per-JUGADOR: A y B leen cad INDEPENDIENTES del MISMO snapshot; A SALE de la zona ⇒ su crit cae a 0 (zone-gate) PERO el cadMap server-auth + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.cadence (flip CADENCE_RUSH.enabled IN-MEMORY + inyección snapshot {pid→cad} / kills / cad-crudo + nowMs/self/toZone/leave drivers + critTick para el seam crit + SHARE-CAP con Delve)
// + __dev.delve (share partner critChance) + __dev.kinship/focus (goldFind) + __dev.convoy (restedMult) + __dev.nocturne (vamp) + __dev.fellowship (xpGain) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation)
// para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Cadencia:").
//
// Checks:
//   1  boots to play, __dev.cadence + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): CADENCE_RUSH.enabled false AND G.cadence NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'cadence'/'cadenceServer' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  TABLA de tiers = función PURA del CAD (acumulador): cad→tier (1→T0,2→T1,4→T2,6→T3) + critPct (0/8/15/25) determinista.
//   6  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→cad} reflejado + DECAY half-life determinista (0-RNG) al proyectar el reloj.
//   7  ★ DIFERENCIADOR RATE: BURST (6 kills gap 0.5s)⇒meter TREPA⇒ABRE (tier≥2); MISMOS 6 kills ESPARCIDOS (gap 6s)⇒meter≈1⇒T0 (TEMPO, no conteo); 1 kill⇒meter≈1⇒T0 (permanencia).
//   8  ★ BUMP acumulador = función de los kills: 1 kill⇒cad≈bumpPerKill(1); 2 kills juntos⇒cad>1.8 (bumps se apilan); decay entre bumps.
//   9  PASSIVE individual (canal critChance): cad≥umbral + héroe EN zona de caza ⇒ critBonusPct>0 + tier≥1; leave (fuera de zona) ⇒ critBonusPct 0 + tier 0.
//  10  ★ DECAY determinista 0-RNG por VIDA-MEDIA: cad 6 (T3); avanzar `now` +6s (halfLife) ⇒ cad 3 (T1). Reloj compartido.
//  11  ★ CANAL REUSADO critChance wired + SEAM CRIT: seam killEnemy SUMA cadenceCritBonusPct capado; critTick base⇒total=base+bono; OFF ⇒ total==base (byte-id).
//  12  ★ SHARE-CAP con Delve: Delve T3(25)+Cadence T3(25)⇒bono combinado CAPADO a 35 (Cadence cede 10, NO 25, capped=true, 0 doble-dip); cadence solo⇒25 (≤ cadenceCritCap 35).
//  13  ★ CAP DURO cadenceCritCap ≤0.35: cadence sola T3 ⇒ bono 25 ≤ 35; el cap combinado NUNCA deja pasar > cadenceCritCap; respeta también el cap ABSOLUTO del crit total (50).
//  14  ★ ORTOGONALIDAD critChance ⊥ goldFind ⊥ restedMult ⊥ vamp ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 doble-conteo): abrir ímpetu NO cambia los otros; activar KINSHIP/CONVOY/NOCTURNE/FELLOWSHIP/WARD/WAYFARER NO cambia el critBonusPct.
//  15  ★ 0-REGRESIÓN: los 19 flags del arco ya LIVE siguen served enabled:true (incl. NOCTURNE_HUNT #66); CADENCE_RUSH served false (DARK #67).
//  16  ★ CADENCE 6 zonas: el pasivo aplica en las 6 zonas de CADENCE_RUSH.zones (cad≥6 ⇒ T3, critBonusPct>0) broken=[].
//  17  render badge "Cadencia:" se DIBUJA con la feature ON (ctx.fillText "Cadencia:" count>0) y NO con OFF (count 0) + fps.
//  18  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ cad/tier/crit IDÉNTICOS byte-a-byte; el acumulador decae CONVERGE; cad per-pid (A vs B independientes); A sale de zona ⇒ crit=0 PERO cadMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2400-cadence-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2400");
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

const NOW = 9270000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes)
async function installCad(page) {
  await page.evaluate((NOW) => {
    window.__CNOW = NOW;
    // inyecta kills (timestamps) para un pid ⇒ el server BUMPEA el meter en cada uno (decay del propio t). CLEAR antes ⇒ snapshot limpio. Prueba el eje RATE.
    window.__ckills = (pid, ts) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW }); window.__dev.cadence({ nowMs: window.__CNOW, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    // empuja el meter crudo de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__ccad = (pid, cad) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW }); window.__dev.cadence({ nowMs: window.__CNOW, self: pid, cad, pid, atMs: window.__CNOW }); };
    // proyecta (re-tick) a NOW + elapsedSec y devuelve el snapshot (decay half-life)
    window.__cat = (elapsedSec) => window.__dev.cadence({ nowMs: window.__CNOW + (elapsedSec || 0) * 1000 });
    // inyecta `cad` para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (rushable + zona coincide).
    window.__cpick = (cad) => {
      window.__dev.cadence({ enabled: true, self: "self" });
      const zones = window.__dev.cadence().zones || [];
      for (const z of zones) {
        window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
        const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad, pid: "self", atMs: window.__CNOW, toZone: z });
        if (s.zone === z && s.rushable) return { zone: z, cad: s.cad, tier: s.tier, critPct: s.critPct, critBonusPct: s.critBonusPct };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.cadence && window.__dev.delve && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.nocturne && window.__dev.fellowship && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.cadence + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.cadence never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.cadence());
  ok("2 byte-id OFF (fresh boot): CADENCE_RUSH.enabled false AND G.cadence NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.cad === 0 && dark.critPct === 0 && dark.critBonusPct === 0 && dark.channel === "critChance" && dark.tag === "" && dark.cadMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} cad=${dark.cad} critPct=${dark.critPct} critBonusPct=${dark.critBonusPct} channel=${dark.channel} tag="${dark.tag}" map=${JSON.stringify(dark.cadMap)}`);

  // 3 save OFF has no 'cadence'/'cadenceServer' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'cadence'/'cadenceServer' key in save blob (estado 100% derivado/transitorio)", !/"cadence(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.cadence({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.cadence({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installCad(page);

  // 5 tier table = pure fn of CAD (accumulator)
  const tab = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6]) {
      window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: c, pid: "self", atMs: window.__CNOW, toZone: zone });
      out.push({ c, cad: s.cad, tier: s.tier, critPct: s.critPct });
    }
    return { zone, out };
  });
  const expTier = { 1: 0, 2: 1, 4: 2, 6: 3 };
  const expCrit = { 1: 0, 2: 8, 4: 15, 6: 25 };
  const tabOk = !tab.bad && tab.out.every(r => near(r.cad, r.c) && r.tier === expTier[r.c] && r.critPct === expCrit[r.c]);
  ok("5 TABLA de tiers = función PURA del CAD: cad→tier (1→T0,2→T1,4→T2,6→T3) + critPct (0/8/15/25) determinista",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 6 server-authoritative reflect + project (half-life decay)
  const refl = await page.evaluate(() => {
    window.__dev.cadence({ enabled: true, self: "self" });
    window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", push: { self: { cad: 8, atMs: window.__CNOW }, other: { cad: 4, atMs: window.__CNOW } } });
    const at0 = window.__dev.cadence({ nowMs: window.__CNOW });                    // cad 8 (self), 4 (other) proyectados sin decay (dt 0)
    const at6 = window.__dev.cadence({ nowMs: window.__CNOW + 6000 });             // +6s = 1 half-life ⇒ self 4, other 2
    return { self0: at0.cadMap && at0.cadMap.self, other0: at0.cadMap && at0.cadMap.other, self6: at6.cadMap && at6.cadMap.self, other6: at6.cadMap && at6.cadMap.other };
  });
  const reflOk = near(refl.self0, 8) && near(refl.other0, 4) && near(refl.self6, 4, 0.02) && near(refl.other6, 2, 0.02);
  ok("6 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→cad} reflejado; DECAY half-life 0-RNG (+6s=1 vida-media ⇒ 8→4, 4→2)",
     reflOk, JSON.stringify(refl));

  // 7 ★ DIFFERENTIATOR — RATE: burst climbs & opens, spread stays T0 (tempo not count)
  const rate = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    // BURST: 6 kills gap 0.5s (span 2.5s) ⇒ bumps ganan al decay ⇒ meter TREPA ⇒ ABRE (tier≥2)
    window.__ckills("self", [0, 1, 2, 3, 4, 5].map(i => window.__CNOW - (5 - i) * 500));
    window.__dev.cadence({ toZone: zone });
    const burst = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone });
    // ESPARCIDO: los MISMOS 6 kills gap 6s (=1 half-life) ⇒ el decay se come cada bump ⇒ meter≈1 ⇒ NUNCA abre (T0)
    window.__ckills("self", [0, 1, 2, 3, 4, 5].map(i => window.__CNOW - (5 - i) * 6000));
    window.__dev.cadence({ toZone: zone });
    const spread = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone });
    // 1 solo kill ⇒ meter ≈ bumpPerKill(1) < 2 ⇒ T0 (permanencia)
    window.__ckills("self", [window.__CNOW]);
    window.__dev.cadence({ toZone: zone });
    const one = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone });
    return { zone, burstCad: burst.cad, burstTier: burst.tier, spreadCad: spread.cad, spreadTier: spread.tier, oneCad: one.cad, oneTier: one.tier };
  });
  const rateOk = !rate.bad && rate.burstTier >= 2 && rate.burstCad >= 4 &&              // burst ⇒ abre (tempo alto)
    rate.spreadTier === 0 && rate.spreadCad < 2 &&                                       // esparcido ⇒ T0 (decay gana; MISMO conteo, distinto tempo)
    near(rate.oneCad, 1, 0.05) && rate.oneTier === 0;                                    // 1 kill ⇒ meter≈1 ⇒ T0 (permanencia)
  ok("7 ★ DIFERENCIADOR RATE: BURST 6 kills gap0.5s⇒meter TREPA (cad≥4)⇒ABRE (tier≥2); MISMOS 6 kills gap6s⇒meter≈1⇒T0 (TEMPO, no conteo); 1 kill⇒cad≈1⇒T0 (permanencia)",
     rateOk, JSON.stringify(rate));

  // 8 ★ BUMP accumulator = fn of kills (bumpPerKill + decay between bumps)
  const bump = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    window.__ckills("self", [window.__CNOW]);                                            // 1 kill ⇒ cad = bumpPerKill
    const k1 = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone }).cad;
    window.__ckills("self", [window.__CNOW - 500, window.__CNOW]);                        // 2 kills gap 0.5s ⇒ cad = 1*0.5^(0.5/6)+1 ≈ 1.944 (>1.8, bumps se apilan)
    const k2 = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone }).cad;
    return { zone, k1, k2, bumpPerKill: window.__dev.cadence().bumpPerKill };
  });
  const bumpOk = !bump.bad && near(bump.k1, 1, 0.02) && bump.k2 > 1.8 && bump.k2 < 2 && bump.bumpPerKill === 1;
  ok("8 ★ BUMP acumulador = función de los kills: 1 kill⇒cad≈bumpPerKill(1); 2 kills gap0.5s⇒cad≈1.94 (>1.8, se apilan con decay entre bumps)",
     bumpOk, JSON.stringify(bump));

  // 9 passive isolated (critChance channel): in-zone cad≥threshold ⇒ critBonusPct>0 + tier≥1; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const w = window.__cpick(4); if (!w) return { bad: true };                            // cad 4 ⇒ Tier 2 ⇒ critPct 15
    const inz = window.__dev.cadence({ nowMs: window.__CNOW, toZone: w.zone });
    const out = window.__dev.cadence({ leave: true });
    return { zone: w.zone, inCrit: inz.critPct, inTier: inz.tier, inBonus: inz.critBonusPct, outCrit: out.critPct, outTier: out.tier, outBonus: out.critBonusPct };
  });
  ok("9 PASSIVE individual (canal critChance, aislado): héroe EN zona con cad≥umbral ⇒ critPct==15 (T2) + tier≥1 + critBonusPct>0; leave (fuera de zona) ⇒ critPct 0 + tier 0 + critBonusPct 0",
     !pass.bad && pass.inCrit === 15 && pass.inTier === 2 && pass.inBonus === 15 && pass.outCrit === 0 && pass.outTier === 0 && pass.outBonus === 0, JSON.stringify(pass));

  // 10 ★ DECAY deterministic 0-RNG by half-life
  const decay = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: zone });
    const at0 = window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone });             // cad 6 ⇒ T3
    const at6 = window.__dev.cadence({ nowMs: window.__CNOW + 6000, toZone: zone });      // +6s ⇒ cad 3 ⇒ T1
    return { base: at0.cad, baseT: at0.tier, dec: at6.cad, decT: at6.tier };
  });
  ok("10 ★ DECAY determinista 0-RNG por VIDA-MEDIA: cad 6 (T3); +6s (1 half-life) ⇒ cad 3 (T1)",
     !decay.bad && near(decay.base, 6) && decay.baseT === 3 && near(decay.dec, 3, 0.02) && decay.decT === 1, JSON.stringify(decay));

  // 11 ★ REUSED CHANNEL critChance wired + CRIT SEAM
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function cadenceCritBonusPct/.test(simSrc) &&
    /function cadenceCritCapPct/.test(simSrc) &&
    /if\(CADENCE_RUSH\.enabled\)\{ const cb=cadenceCritBonusPct\(\);/.test(simSrc) &&
    /const eff=Math\.max\(0, Math\.min\(shareCap, db\+cb\) - db\);/.test(simSrc);         // el seam de crit aplica el SHARE-CAP con Delve
  const seam = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };                            // cad 6 ⇒ T3 ⇒ critBonusPct 25
    window.__dev.cadence({ nowMs: window.__CNOW, toZone: w.zone });
    const on = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;               // base 10 + cadence 25 (delve 0 aquí) ⇒ total 35 (< abs 50)
    window.__dev.cadence({ enabled: false });
    const off = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;              // OFF ⇒ cadence 0 ⇒ total==base 10 (byte-id)
    const offTag = window.__dev.cadence().tag;
    window.__dev.cadence({ enabled: true });
    return { zone: w.zone, on, off, offTag };
  });
  const seamOk = !seam.bad && seam.on && seam.on.cadenceBonus === 25 && near(seam.on.cadenceEff, 25) && near(seam.on.total, 35) &&
    seam.off && seam.off.cadenceBonus === 0 && near(seam.off.total, 10) && seam.offTag === "";
  ok("11 ★ CANAL REUSADO critChance wired + SEAM CRIT: seam killEnemy SUMA cadenceCritBonusPct capado; T3 critTick base10 ⇒ total 35 (cadence +25); OFF ⇒ cadenceBonus 0 ⇒ total==base 10 byte-id + tag \"\"",
     seamWired && seamOk, `wired=${seamWired} on=${JSON.stringify(seam.on)} off=${JSON.stringify(seam.off)} offTag="${seam.offTag}"`);

  // 12 ★ SHARE-CAP con Delve (canal critChance compartido): combinado delve+cadence ≤ cadenceCritCap
  const scap = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };                            // cad 6 ⇒ T3 ⇒ cadence 25
    const zone = w.zone;
    window.__dev.cadence({ nowMs: window.__CNOW, toZone: zone });
    // cadence SOLA (delve sin meter ⇒ db 0): base 0 + cadence 25 ⇒ total 25 (≤ cadenceCritCap 35, no capped)
    const solo = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    // Delve T3 (25) EN LA MISMA zona: empuja delve raw 6/bands 5 ⇒ delveCritBonusPct 25. Combinado delve(25)+cadence(25)=50 ⇒ CAPADO a 35 ⇒ cadence cede 10 (NO 25). total = 0 + 25(delve) + 10(cadence) = 35.
    window.__dev.delve({ enabled: true, self: "self" });
    window.__dev.delve({ clear: true, nowMs: window.__CNOW });
    window.__dev.delve({ nowMs: window.__CNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: window.__CNOW, toZone: zone });
    const both = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    const delveBonus = window.__dev.cadence().delveCritMul;
    return { zone, solo, both, delveBonus, shareCap: window.__dev.cadence().cadenceCritCap };
  });
  const scapOk = !scap.bad && scap.shareCap === 35 &&
    scap.solo && scap.solo.cadenceBonus === 25 && near(scap.solo.total, 25) && scap.solo.capped === false &&           // cadence sola ⇒ 25 (≤35, no capped)
    near(scap.delveBonus, 25) &&                                                                                       // Delve aporta 25 en el MISMO canal
    scap.both && near(scap.both.delveBonus, 25) && scap.both.cadenceBonus === 25 && near(scap.both.cadenceEff, 10) &&  // Cadence CEDE: sólo 10 (35-25), NO 25
    near(scap.both.total, 35) && scap.both.capped === true;                                                            // combinado CAPADO a 35 (0 doble-dip más allá del techo)
  ok("12 ★ SHARE-CAP con Delve: cadence SOLA T3⇒25 (≤35, no capped); Delve T3(25)+Cadence T3(25) EN LA MISMA zona⇒bono combinado CAPADO a 35 (Cadence cede eff=10, NO 25, capped=true, 0 doble-dip)",
     scapOk, JSON.stringify(scap));
  await page.evaluate(() => window.__dev.delve({ clear: true, nowMs: window.__CNOW, leave: true }));   // quiesce delve meter tras la prueba de share-cap

  // 13 ★ HARD CAP cadenceCritCap ≤0.35 + cap absoluto del crit total (50)
  const hcap = await page.evaluate(() => {
    const w = window.__cpick(6); if (!w) return { bad: true };
    window.__dev.cadence({ nowMs: window.__CNOW, toZone: w.zone });
    const cfg = window.__dev.cadence();
    // base ALTO (48) + cadence 25 ⇒ el cap ABSOLUTO del crit total (50) recorta a 50 (cadence sólo añade 2, NUNCA reduce base)
    const hi = window.__dev.cadence({ critTick: { base: 48 } }).critPicked;
    return { cadenceCritCap: cfg.cadenceCritCap, critCapPct: cfg.critCapPct, hiTotal: hi.total, hiBase: hi.base, hiCadenceBonus: hi.cadenceBonus };
  });
  const hcapOk = !hcap.bad && hcap.cadenceCritCap === 35 && hcap.cadenceCritCap <= 35 && hcap.critCapPct === 50 &&
    near(hcap.hiTotal, 50) && hcap.hiBase === 48 && hcap.hiCadenceBonus === 25;                    // total capado al abs 50 (base48 + solo +2), nunca reduce base
  ok("13 ★ CAP DURO cadenceCritCap=35 (≤0.35 abs) + cap ABSOLUTO crit total=50: base48+cadence25 ⇒ total CAPADO a 50 (cadence añade sólo +2, NUNCA reduce el crit base)",
     hcapOk, JSON.stringify(hcap));

  // 14 ★ ORTHOGONALITY critChance ⊥ goldFind ⊥ restedMult ⊥ vamp ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__cpick(6); if (!w) return { bad: true };                            // cad 6 ⇒ T3 ⇒ critBonusPct 25
    const zone = w.zone;
    const a = window.__dev.cadence({ nowMs: NOW, toZone: zone });
    const critBefore = a.critBonusPct, goldBefore = a.goldFindMul, restedBefore = a.restedXpMult, vampBefore = a.vampMul, xpBefore = a.xpGainMul, wardBefore = a.wardRegenMul, oocBefore = a.oocMitigMul, lootBefore = a.lootQualityFloor;
    // activa KINSHIP (goldFind) + CONVOY (restedMult) + NOCTURNE (vamp) + FELLOWSHIP (xpGain) + WARD (wardRegen) + WAYFARER (oocMitigation) ⇒ SUS canales suben pero el critBonusPct (cadence) NO cambia (⊥)
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.nocturne({ enabled: true, self: "self" }); window.__dev.nocturne({ clear: true, nowMs: NOW });
    window.__dev.nocturne({ nowMs: NOW, self: "self", noct: 6, pid: "self", atMs: NOW, toZone: zone });
    window.__dev.fellowship({ enabled: true, nowMs: NOW }); window.__dev.fellowship({ kill: { n: 100000 } });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }] }, toZone: zone });
    const b = window.__dev.cadence({ nowMs: NOW, toZone: zone });
    window.__dev.kinship({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.nocturne({ enabled: false }); window.__dev.fellowship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, critBefore, goldBefore, restedBefore, vampBefore, xpBefore, wardBefore, oocBefore, lootBefore,
      critAfter: b.critBonusPct, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, vampAfter: b.vampMul, xpAfter: b.xpGainMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "critChance" && orth.critBefore === 25 &&
    orth.critAfter === orth.critBefore &&                             // activar 6 pasivos NO cambia el critBonusPct (cadence ⊥ a todos)
    orth.goldAfter > 0 && orth.vampAfter > 0 && orth.xpAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 &&   // KINSHIP(goldFind)/NOCTURNE(vamp)/FELLOWSHIP/WARD/WAYFARER sí aportan en SUS canales y NO tocan cadence
    orth.goldBefore === 0 && orth.vampBefore === 0 &&                 // sin esos pasivos ⇒ sus canales 0 (cadence no los alimenta)
    near(orth.restedBefore, orth.restedAfter) &&                      // restedMult sin cambio por cadence (⊥)
    orth.lootBefore === orth.lootAfter;                               // lootQuality intacto (⊥)
  ok("14 ★ ORTOGONALIDAD critChance ⊥ goldFind ⊥ restedMult ⊥ vamp ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 doble-conteo): abrir ímpetu NO toca los otros; activar KINSHIP/CONVOY/NOCTURNE/FELLOWSHIP/WARD/WAYFARER NO cambia el critBonusPct; canal='critChance'",
     orthOk, JSON.stringify(orth));

  // 15 ★ 0-REGRESSION: los 19 flags del arco siguen LIVE served; CADENCE served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["NOCTURNE_HUNT", "ERUDITION", "DELVE", "TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cadenceDark = flag("CADENCE_RUSH") === "false";
  ok("15 ★ 0-REGRESIÓN: 19 flags del arco served enabled:true (incl. NOCTURNE_HUNT #66 LIVE); CADENCE_RUSH served false (DARK #67)",
     arcAllOn && cadenceDark && arc.length === 19, `cadence=${flag("CADENCE_RUSH")} arc=${JSON.stringify(arcLive)}`);

  // 16 ★ CADENCE en las 6 zonas
  const zonesRes = await page.evaluate(() => {
    window.__dev.cadence({ enabled: true, self: "self" });
    const zones = window.__dev.cadence().zones; const broken = [];
    for (const z of zones) {
      window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
      if (!(s.zone === z && s.rushable && s.tier === 3 && s.critPct === 25 && s.critBonusPct > 0)) broken.push(z);
    }
    return { zones, broken };
  });
  ok("16 ★ CADENCE 6 zonas: las 6 zonas de CADENCE_RUSH.zones hospedan el pasivo (cad≥6 ⇒ T3, critPct 25, critBonusPct>0) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 17 render badge "Cadencia:" drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cadencia:") >= 0) cnt++; return orig(t, x, y); };  // "Cadencia:" (con colon) = ÚNICO de mi badge
    const w = window.__cpick(6);
    window.__dev.cadence({ nowMs: window.__CNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.cadence({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("17 render badge \"Cadencia:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { const w = window.__cpick(6); window.__dev.cadence({ nowMs: window.__CNOW, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 18 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.cadence({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installCad(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.cadence({ enabled: true }).zones || [])[2]));   // ruins idx2 (North Star canónico del arco)
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.cadence({ enabled: true, self });
        window.__dev.cadence({ clear: true, nowMs: NOW });
        const s = window.__dev.cadence({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: { cad: 6, atMs: NOW }, B: { cad: 2, atMs: NOW }, P: { cad: 6, atMs: NOW },
        }, toZone: zone });
        return { self: s.self, cad: s.cad, tier: s.tier, critPct: s.critPct, nowMs: s.nowMs, map: s.cadMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: cad 6 (T3, critPct 25), byte-idéntico
    const decayed = await readAs("P", 6);      // +6s ⇒ half-life ⇒ P cad 3 (T1, critPct 8), converge
    // per-pid independence: A lee "A" (cad 6 T3), B lee "B" (cad 2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const push = { A: { cad: 6, atMs: NOW }, B: { cad: 2, atMs: NOW } };
      const rA = await page.evaluate(({ zone, NOW, push }) => { window.__dev.cadence({ enabled: true, self: "A" }); window.__dev.cadence({ clear: true, nowMs: NOW }); const s = window.__dev.cadence({ nowMs: NOW, self: "A", push, toZone: zone }); return { self: s.self, cad: s.cad, tier: s.tier, critPct: s.critPct, map: s.cadMap }; }, { zone, NOW, push });
      const rB = await pageB.evaluate(({ zone, NOW, push }) => { window.__dev.cadence({ enabled: true, self: "B" }); window.__dev.cadence({ clear: true, nowMs: NOW }); const s = window.__dev.cadence({ nowMs: NOW, self: "B", push, toZone: zone }); return { self: s.self, cad: s.cad, tier: s.tier, critPct: s.critPct, map: s.cadMap }; }, { zone, NOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ critPct 0 (zone-gate) PERO cadMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.cadence({ leave: true }); return { critPct: s.critPct, bonus: s.critBonusPct, tier: s.tier, map: s.cadMap, cad: s.cad }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.cadence({ nowMs: NOW, self: "B", toZone: zone }); return { critPct: s.critPct, tier: s.tier, cad: s.cad }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.cad, 6) && northStar.shared.a.critPct === 25 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.cad, 3, 0.02) && northStar.decayed.a.critPct === 8 &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && northStar.indep.rA.critPct === 25 && northStar.indep.rB.tier === 1 && northStar.indep.rB.critPct === 8 &&
    northStar.aLeaves.critPct === 0 && northStar.aLeaves.bonus === 0 &&                 // A fuera de zona ⇒ critPct 0
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&                    // cadMap server-authoritative INTACTO
    near(northStar.aLeaves.cad, 6) &&                                                   // cad (per-pid A) sigue proyectado
    northStar.bIntact.critPct === 8 && northStar.bIntact.tier === 1;                    // B intacto (per-pid independiente)
  ok("18 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ cad/tier/crit byte-idénticos (P T3 crit25, decae T1 crit8); cad per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ crit=0 PERO cadMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aCrit: northStar.aLeaves.critPct, bCrit: northStar.bIntact.critPct, bTier: northStar.bIntact.tier, errB: errB.length }));

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
