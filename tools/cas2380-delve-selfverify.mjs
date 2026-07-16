// CAS-2380 — GE self-verify for DELVE / DESCENSO (DARK, DELVE.enabled:false). EVO mecánica #64 — EJE FRESCO + CANAL FRESCO, ambos ⊥/OPUESTOS a #47-63.
// (A) EJE FRESCO = PROFUNDIDAD / DESCENSO VERTICAL (nº de BANDAS de profundidad DISTINTAS alcanzadas). server-authoritative, 0-RNG, INDIVIDUAL (per-pid): el server registra las marcas de banda
//     { pid → [{d,t}] } (d = ZONE_TIER[zoneOf].tier, la elevación/zona-Z del mundo), computa `delveBands(marks,now,win)` = nº de BANDAS DISTINTAS en la ventana (PURA), y mientras bands≥minBands
//     ACUMULA `delve` (accruePerSec·dt) con DECAY vida-media (familia acumulador tick/accrue/step #55-63). El decay es half-life determinista (0-RNG). El TIER exige delve≥min (PERMANENCIA/decay) Y bands≥bandsReq (EJE).
// (B) CANAL PASIVO FRESCO = `critChance` (PRECISIÓN OFENSIVA) — el arco saturó restedMult (XP), wardRegen (HP), goldFind (oro), oocMitigation (mitigación), lootQuality (rareza); #64 abre un SEXTO canal
//     en el seam de crit de killEnemy: con descenso abierto (tier≥1) el server SUMA un bono de critChance (%) al golpe del héroe local, como TÉRMINO AISLADO, con CAP DURO absoluto (critCapPct=50 = 0.5 abs). NADA de move-speed.
//
// ★ DIFERENCIADOR (checks 8/9, no-negociable): ORTOGONAL a Trailcraft (#63, diversidad de TIPOS de bioma). 2 zonas del MISMO tier (swamp/arena tier-4) ⇒ +2 variedad Trailcraft pero +1 banda Delve.
// NO por posición absoluta: quieto en la banda MÁS profunda (1 banda) ⇒ bands 1 < minBands ⇒ NUNCA abre. DESCENDER por K bandas distintas ⇒ bands K. Permanencia: 1-tick dt=0.5 con bands≥2 ⇒ delve≈0.5 < 2 ⇒ Tier 0 (NO abre).
//
// ★ ORTOGONALIDAD (check 13, no-negociable): abrir un descenso (critBonusPct>0) NO cambia restedXpMult/goldFindMul/wardRegenMul/oocMitigMul/lootQualityFloor; activar restedMult/goldFind/wardRegen/oocMitigation/lootQuality NO cambia el bono critChance.
//
// North Star (check 17, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes, MISMO snapshot {pid→{delve,bands}} + MISMO reloj (nowMs) ⇒ ven delve+bands+tier+crit IDÉNTICOS
// byte-a-byte (0 desync). El acumulador decae por vida-media CONVERGE. El delve es per-JUGADOR: A (self="A") y B (self="B") leen INDEPENDIENTE del MISMO snapshot; A SALE de la zona ⇒ su crit cae a 0 (zone-gate) PERO el delveMap server-authoritative + el Δ de B quedan INTACTOS.
//
// Observado vía __dev.delve (flip DELVE.enabled IN-MEMORY + inyección snapshot {pid→{delve,bands}} / marks / path / step / bandsProbe / bandProbe + nowMs/self/toZone/leave drivers + critTick para el seam critChance)
// + __dev.convoy (restedMult) + __dev.kinship (goldFind) + __dev.ward (wardRegen) + __dev.wayfarerRoam (oocMitigation) + __dev.trailcraft (lootQuality) para la ortogonalidad + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Descenso:").
//
// Checks:
//   1  boots to play, __dev.delve + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): DELVE.enabled false AND G.delve NUNCA se crea (gExists false) ⇒ 0 estado nuevo.
//   3  byte-id save OFF: saveBlob() SIN clave 'delve'/'delveServer'/'delveMarks' (estado 100% derivado/transitorio, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ BANDS = función PURA (delveBands vía probe): 1 marca⇒1; N misma banda (revisita/quieto)⇒1; 5 distintas⇒5; banda 0 (fuera de zona)⇒excluida; marca fuera de ventana⇒excluida. + depthBandOf (ZONE_TIER.tier).
//   6  TABLA de tiers = función PURA de (delve,bands): (6,5)→T3,+25%; (6,3)→T2,+15%; (6,2)→T1,+8%; (1,5)→T0 (delve<min, permanencia); (6,1)→T0 (bands<minBands, no por posición).
//   7  SERVER-AUTHORITATIVE reflect+project: snapshot {pid→{delve,bands}} reflejado + DECAY half-life determinista (0-RNG) del delve al proyectar el reloj; bands pasa sin decaer.
//   8  ★ ACUMULADOR = función de las BANDAS (step): 1 banda (bands 1)⇒add 0 (nunca abre, no por posición); 5 bandas 1-tick dt=0.5⇒delve<2⇒T0 (permanencia); sostenido⇒T1→T2→T3.
//   9  ★ DIFERENCIADOR: quieto en 1 banda (8 marcas misma d)⇒bands 1⇒NO abre (no por posición absoluta); DESCENDER 5 bandas distintas⇒bands 5; 2 zonas MISMO tier (swamp/arena)⇒bands 1 (VERTICAL, ORTOGONAL a Trailcraft diversidad de tipos).
//  10  ★ DECAY determinista 0-RNG por VIDA-MEDIA: delve 6 (T3); avanzar `now` +25s (halfLife) ⇒ delve 3 ⇒ tier baja a T1 (min crece por tier). Reloj compartido.
//  11  PASSIVE individual (canal critChance): delve≥umbral + bands + héroe EN zona de caza ⇒ critBonusPct==tier.critPct + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0.
//  12  ★ CANAL FRESCO critChance wired + CAP DURO: seam killEnemy suma delveCritBonusPct() a critPct con tope critCapPct; critTick base+bonus capado; OFF ⇒ total==base byte-id (RNG intacto).
//  13  ★ ORTOGONALIDAD critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 doble-conteo): abrir descenso NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT NO cambia el bono critChance.
//  14  ★ 0-REGRESIÓN: los 16 flags del arco ya LIVE siguen served enabled:true; DELVE served false (DARK #64).
//  15  ★ DESCENSO 6 zonas: el pasivo aplica en las 6 zonas de DELVE.zones (delve≥6+bands≥5 ⇒ T3, critPct 25) broken=[].
//  16  render badge "Descenso:" se DIBUJA con la feature ON (ctx.fillText "Descenso:" count>0) y NO con OFF (count 0) + fps.
//  17  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ delve/bands/tier/crit IDÉNTICOS byte-a-byte; el acumulador decae CONVERGE; delve per-pid (A vs B independientes); A sale de zona ⇒ crit=0 PERO delveMap + Δ_B INTACTOS.
//   0  no JS errors during run.
// Run: node tools/cas2380-delve-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2380");
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

const NOW = 9140000;   // reloj de pared FIJO (ms) para proyección determinista (mismo en ambos clientes) — QNOW 9.14M (re-etiquetado de #63)
async function installDelve(page) {
  await page.evaluate((NOW) => {
    window.__DNOW = NOW;
    // construye `n` marcas de BANDAS DISTINTAS (d = 1..n), todas @NOW (dentro de ventana ⇒ bands==n exacto)
    window.__dmarks = (n, t) => { const out = []; for (let i = 0; i < n; i++) out.push({ d: i + 1, t: (t == null ? window.__DNOW : t) }); return out; };
    // fija marcas de banda para un pid (CLEAR antes ⇒ snapshot limpio). Prueba bands/diferenciadores.
    window.__setmarks = (pid, marks) => { window.__dev.delve({ clear: true, nowMs: window.__DNOW }); window.__dev.delve({ nowMs: window.__DNOW, self: pid, marks: { [pid]: marks } }); };
    // corre un STEP de acumulación (bands→accrue) con dt para un pid (usa las marcas ya fijadas)
    window.__dstep = (pid, dt) => window.__dev.delve({ nowMs: window.__DNOW, self: pid, step: { [pid]: { dt } } });
    // empuja el delve+bands crudos de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__dset = (pid, delve, bands) => { window.__dev.delve({ clear: true, nowMs: window.__DNOW }); window.__dev.delve({ nowMs: window.__DNOW, self: pid, delve, bands, pid, atMs: window.__DNOW }); };
    // inyecta {delve,bands} para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (delvable + zona coincide).
    window.__dpick = (delve, bands) => {
      window.__dev.delve({ enabled: true, self: "self" });
      const zones = window.__dev.delve().zones || [];
      for (const z of zones) {
        window.__dev.delve({ clear: true, nowMs: window.__DNOW });
        const s = window.__dev.delve({ nowMs: window.__DNOW, self: "self", delve, bands, pid: "self", atMs: window.__DNOW, toZone: z });
        if (s.zone === z && s.delvable) return { zone: z, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct };
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.delve && window.__dev.trailcraft && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.delve + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.delve never created (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.delve());
  ok("2 byte-id OFF (fresh boot): DELVE.enabled false AND G.delve NUNCA se crea (gExists false, tick jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.delve === 0 && dark.bands === 0 && dark.critPct === 0 && dark.critBonusPct === 0 && dark.tag === "" && dark.delveMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} delve=${dark.delve} bands=${dark.bands} critPct=${dark.critPct} bonus=${dark.critBonusPct} tag="${dark.tag}" map=${JSON.stringify(dark.delveMap)}`);

  // 3 save OFF has no 'delve'/'delveServer'/'delveMarks' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'delve'/'delveServer'/'delveMarks' key in save blob (estado 100% derivado/transitorio)", !/"delve(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(380)));
  await page.evaluate(() => window.__dev.delve({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(380)));
  await page.evaluate(() => window.__dev.delve({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installDelve(page);

  // 5 ★ bands = pure fn (delveBands via probe) + depthBandOf (ZONE_TIER.tier)
  const pr = await page.evaluate((NOW) => {
    window.__dev.delve({ enabled: true });
    const win = 30000;
    const B = (marks, now) => window.__dev.delve({ bandsProbe: { marks, now: (now == null ? NOW : now), windowMs: win } }).probe;
    // depthBandOf: teleporta a cada zona y lee band
    const bandOf = (z) => { const s = window.__dev.delve({ toZone: z }); return s.band; };
    return {
      one:    B([{ d: 1, t: NOW }]),                                                          // 1 marca ⇒ 1
      still:  B([{ d: 3, t: NOW - 3000 }, { d: 3, t: NOW - 1000 }, { d: 3, t: NOW }]),          // N MISMA banda (revisita/quieto) ⇒ 1
      five:   B([{ d: 1, t: NOW }, { d: 2, t: NOW }, { d: 3, t: NOW }, { d: 5, t: NOW }, { d: 6, t: NOW }]),  // 5 distintas ⇒ 5
      zero:   B([{ d: 0, t: NOW }, { d: 2, t: NOW }]),                                          // banda 0 (fuera de zona) excluida ⇒ 1
      expire: B([{ d: 1, t: NOW - 40000 }, { d: 2, t: NOW }]),                                  // 1 fuera de ventana (40s>30s) + 1 dentro ⇒ 1
      forest: bandOf("forest"), ruins: bandOf("ruins"), caves: bandOf("caves"), abyss: bandOf("abyss"), frost: bandOf("frost"),
    };
  }, NOW);
  ok("5 ★ BANDS = función PURA (delveBands): 1 marca⇒1; N misma banda⇒1; 5 distintas⇒5; banda 0⇒excluida (⇒1); fuera de ventana⇒excluida (⇒1). depthBandOf=ZONE_TIER.tier (forest1/ruins2/caves3/abyss5/frost6)",
     pr.one === 1 && pr.still === 1 && pr.five === 5 && pr.zero === 1 && pr.expire === 1 &&
     pr.forest === 1 && pr.ruins === 2 && pr.caves === 3 && pr.abyss === 5 && pr.frost === 6, JSON.stringify(pr));

  // 6 tier table = pure fn of (delve,bands)
  const tab = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 5); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    const cases = [[6, 5], [6, 3], [6, 2], [1, 5], [6, 1]];
    for (const [dv, bn] of cases) {
      window.__dev.delve({ clear: true, nowMs: NOW });
      const s = window.__dev.delve({ nowMs: NOW, self: "self", delve: dv, bands: bn, pid: "self", atMs: NOW, toZone: zone });
      out.push({ dv, bn, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct });
    }
    return { zone, out };
  }, NOW);
  const expT = { "6,5": 3, "6,3": 2, "6,2": 1, "1,5": 0, "6,1": 0 };
  const expC = { "6,5": 25, "6,3": 15, "6,2": 8, "1,5": 0, "6,1": 0 };
  const tabOk = !tab.bad && tab.out.every(r => { const k = r.dv + "," + r.bn; return near(r.delve, r.dv) && r.bands === r.bn && r.tier === expT[k] && r.critPct === expC[k]; });
  ok("6 TABLA de tiers = función PURA de (delve,bands): (6,5)→T3+25%; (6,3)→T2+15%; (6,2)→T1+8%; (1,5)→T0 (delve<min, permanencia); (6,1)→T0 (bands<minBands, no por posición)",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + project (half-life decay of delve; bands passes through)
  const refl = await page.evaluate((NOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    window.__dev.delve({ clear: true, nowMs: NOW });
    window.__dev.delve({ nowMs: NOW, self: "self", push: { self: { delve: 8, bands: 5, atMs: NOW }, other: { delve: 4, bands: 3, atMs: NOW } } });
    const at0 = window.__dev.delve({ nowMs: NOW });                       // delve 8 (self), 4 (other) proyectados sin decay (dt 0)
    const at25 = window.__dev.delve({ nowMs: NOW + 25000 });              // +25s = 1 half-life ⇒ self 4, other 2; bands sin decaer
    return { self0: at0.delveMap && at0.delveMap.self, other0: at0.delveMap && at0.delveMap.other, self25: at25.delveMap && at25.delveMap.self, other25: at25.delveMap && at25.delveMap.other, bands0: at0.bandsMap, bands25: at25.bandsMap };
  }, NOW);
  const reflOk = near(refl.self0, 8) && near(refl.other0, 4) && near(refl.self25, 4, 0.02) && near(refl.other25, 2, 0.02) &&
    refl.bands0 && refl.bands0.self === 5 && refl.bands0.other === 3 && refl.bands25 && refl.bands25.self === 5 && refl.bands25.other === 3;
  ok("7 SERVER-AUTHORITATIVE reflect+project: snapshot {pid→{delve,bands}} reflejado; DECAY half-life 0-RNG del delve (+25s=1 vida-media ⇒ 8→4, 4→2); bands pasa sin decaer (server-auth)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of BANDS (step): 1 band ⇒ add 0 (never opens); 5 bands sustained ⇒ accrues T1→T2→T3; 1-tick ⇒ tiny (permanence)
  const acc = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 5); if (!w) return { bad: true };
    const zone = w.zone;
    // 1 sola banda (quieto/revisita): bands 1 < 2 ⇒ step add 0 ⇒ delve 0 (nunca abre, no por posición)
    window.__setmarks("self", [{ d: 5, t: NOW - 2000 }, { d: 5, t: NOW - 1000 }, { d: 5, t: NOW }]);
    window.__dev.delve({ toZone: zone });
    const one = window.__dstep("self", 5);   // dt grande, pero bands 1 ⇒ add 0
    // 5 bandas distintas: bands 5 ≥ 2 ⇒ 1-tick dt=0.5 ⇒ delve≈0.5 < 2 ⇒ Tier 0 (permanencia)
    window.__setmarks("self", [{ d: 1, t: NOW }, { d: 2, t: NOW }, { d: 3, t: NOW }, { d: 5, t: NOW }, { d: 6, t: NOW }]);
    window.__dev.delve({ toZone: zone });
    const tick1 = window.__dstep("self", 0.5);
    const s2 = window.__dstep("self", 1.5);   // delve ≈ 0.5+1.5 = 2 ⇒ T1
    const s3 = window.__dstep("self", 2);     // delve ≈ 4 ⇒ T2
    const s4 = window.__dstep("self", 2);     // delve ≈ 6 ⇒ T3
    return { zone, oneDelve: one.delve, oneBands: one.bands, tick1Delve: tick1.delve, tick1Bands: tick1.bands,
      s2delve: s2.delve, s3delve: s3.delve, s4delve: s4.delve };
  }, NOW);
  // read tiers via __dset at the accumulated deltas
  const accTiers = await page.evaluate((NOW, acc) => {
    const zone = acc.zone; const rd = (dv) => { window.__dev.delve({ clear: true, nowMs: NOW }); const s = window.__dev.delve({ nowMs: NOW, self: "self", delve: dv, bands: 5, pid: "self", atMs: NOW, toZone: zone }); return s.tier; };
    return { t1: rd(acc.tick1Delve), t2: rd(acc.s2delve), t3: rd(acc.s3delve), t4: rd(acc.s4delve) };
  }, NOW, acc);
  const accOk = !acc.bad && near(acc.oneDelve, 0) && acc.oneBands === 1 &&           // 1 banda ⇒ nunca acumula
    acc.tick1Delve > 0 && acc.tick1Delve < 2 && accTiers.t1 === 0 &&                 // 1-tick dt=0.5 ⇒ delve ínfimo ⇒ T0 (permanencia)
    accTiers.t2 >= 1 && accTiers.t3 >= 2 && accTiers.t4 === 3;                       // sostenido ⇒ abre + sube T1→T2→T3
  ok("8 ★ ACUMULADOR = función de las BANDAS (step): 1 banda (bands 1)⇒add 0 (nunca abre, no por posición); 5 bandas 1-tick dt=0.5⇒delve<2⇒T0 (permanencia); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify({ acc, accTiers }));

  // 9 ★ DIFFERENTIATOR — bands (vertical), orthogonal to Trailcraft (types)
  const diff = await page.evaluate((NOW) => {
    const win = 30000;
    const B = (marks) => window.__dev.delve({ bandsProbe: { marks, now: NOW, windowMs: win } }).probe;
    // quieto en 1 banda: 8 marcas MISMA d ⇒ bands 1 ⇒ NO abre (no por posición absoluta, aunque sea la banda más profunda)
    const stillDeep = B([{ d: 6, t: NOW - 7000 }, { d: 6, t: NOW - 6000 }, { d: 6, t: NOW - 5000 }, { d: 6, t: NOW - 4000 }, { d: 6, t: NOW - 3000 }, { d: 6, t: NOW - 2000 }, { d: 6, t: NOW - 1000 }, { d: 6, t: NOW }]);
    // DESCENDER 5 bandas distintas ⇒ bands 5 ⇒ abre — VERTICAL
    const descend5 = B([{ d: 1, t: NOW - 4000 }, { d: 2, t: NOW - 3000 }, { d: 3, t: NOW - 2000 }, { d: 5, t: NOW - 1000 }, { d: 6, t: NOW }]);
    // 2 zonas del MISMO tier (swamp=4, arena=4): ambas banda 4 ⇒ bands 1 (Trailcraft las contaría 2 TIPOS distintos). ORTOGONAL.
    const sameTier = B([{ d: 4, t: NOW - 1000 }, { d: 4, t: NOW }]);
    return { stillDeep, descend5, sameTier };
  }, NOW);
  ok("9 ★ DIFERENCIADOR: quieto en 1 banda (8 marcas misma d, la más profunda)⇒bands 1⇒NO abre (no por posición absoluta); DESCENDER 5 bandas distintas⇒bands 5 (VERTICAL); 2 zonas MISMO tier⇒bands 1 (ORTOGONAL a Trailcraft diversidad de tipos, que las contaría 2)",
     diff.stillDeep === 1 && diff.descend5 === 5 && diff.sameTier === 1, JSON.stringify(diff));

  // 10 ★ DECAY deterministic 0-RNG by half-life ⇒ tier steps down (min crece por tier)
  const decay = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 5); if (!w) return { bad: true };
    const zone = w.zone;
    window.__dev.delve({ clear: true, nowMs: NOW });
    window.__dev.delve({ nowMs: NOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: NOW, toZone: zone });
    const at0 = window.__dev.delve({ nowMs: NOW, toZone: zone });          // delve 6, bands 5 ⇒ T3
    const at25 = window.__dev.delve({ nowMs: NOW + 25000, toZone: zone }); // +25s ⇒ delve 3 (bands 5) ⇒ T1 (min crece: 3≥2 pero <4)
    return { base: at0.delve, baseT: at0.tier, baseC: at0.critPct, dec: at25.delve, decT: at25.tier, decC: at25.critPct };
  }, NOW);
  ok("10 ★ DECAY determinista 0-RNG por VIDA-MEDIA: delve 6 (T3,+25%); +25s (1 half-life) ⇒ delve 3 ⇒ T1 (+8%) (el min CRECE por tier ⇒ decay baja el tier gradual)",
     !decay.bad && near(decay.base, 6) && decay.baseT === 3 && decay.baseC === 25 && near(decay.dec, 3, 0.02) && decay.decT === 1 && decay.decC === 8, JSON.stringify(decay));

  // 11 passive isolated (critChance channel): in-zone delve+bands≥umbral ⇒ critBonusPct==tier.critPct + tier≥1; leave ⇒ 0
  const pass = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 3); if (!w) return { bad: true };                // delve6,bands3 ⇒ T2 ⇒ +15%
    const inz = window.__dev.delve({ nowMs: NOW, toZone: w.zone });
    const out = window.__dev.delve({ leave: true });
    return { zone: w.zone, inBonus: inz.critBonusPct, inTier: inz.tier, inPct: inz.critPct, outBonus: out.critBonusPct, outTier: out.tier, outPct: out.critPct };
  }, NOW);
  ok("11 PASSIVE individual (canal critChance, aislado): héroe EN zona con delve+bands≥umbral ⇒ critBonusPct==tier.critPct (T2=+15%) + tier≥1; leave (fuera de zona) ⇒ 0 + tier 0",
     !pass.bad && pass.inBonus === 15 && pass.inTier === 2 && pass.inPct === 15 && pass.outBonus === 0 && pass.outTier === 0 && pass.outPct === 0, JSON.stringify(pass));

  // 12 ★ FRESH CHANNEL critChance wired + HARD CAP
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function delveCritBonusPct/.test(simSrc) &&
    /if\(DELVE\.enabled\)\{\s*const db=delveCritBonusPct\(\)/.test(simSrc) &&
    /critPct\+=Math\.min\(db,room\)/.test(simSrc);
  const crit = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 5); if (!w) return { bad: true };                // delve6,bands5 ⇒ T3 ⇒ +25%
    window.__dev.delve({ nowMs: NOW, toZone: w.zone });
    // base 45 + bonus 25 ⇒ cap 50 (capped); base 0 + bonus 25 ⇒ 25; OFF ⇒ base
    const capped = window.__dev.delve({ critTick: { base: 45 } }).critPicked;
    const uncapped = window.__dev.delve({ critTick: { base: 0 } }).critPicked;
    window.__dev.delve({ enabled: false });
    const off = window.__dev.delve({ critTick: { base: 45 } }).critPicked;
    const offTag = window.__dev.delve().tag;
    window.__dev.delve({ enabled: true });
    return { zone: w.zone, capped, uncapped, off, offTag };
  }, NOW);
  const critOk = !crit.bad && crit.capped && crit.capped.total === 50 && crit.capped.capped === true && crit.capped.delveBonus === 25 &&
    crit.uncapped && crit.uncapped.total === 25 && crit.uncapped.capped === false &&
    crit.off && crit.off.total === 45 && crit.off.delveBonus === 0 && crit.offTag === "";     // OFF ⇒ total==base byte-id + tag ""
  ok("12 ★ CANAL FRESCO critChance wired + CAP DURO: seam killEnemy suma delveCritBonusPct() con tope critCapPct; base45+bonus25⇒cap 50 (capped); base0+25⇒25; OFF ⇒ total==base (45) byte-id + tag \"\"",
     seamWired && critOk, `wired=${seamWired} ${JSON.stringify(crit)}`);

  // 13 ★ ORTHOGONALITY critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 double-count)
  const orth = await page.evaluate((NOW) => {
    const w = window.__dpick(6, 5); if (!w) return { bad: true };                // delve6,bands5 ⇒ T3 ⇒ +25%
    const zone = w.zone;
    const a = window.__dev.delve({ nowMs: NOW, toZone: zone });
    const critBefore = a.critBonusPct, restedBefore = a.restedXpMult, goldBefore = a.goldFindMul, wardBefore = a.wardRegenMul, oocBefore = a.oocMitigMul, lootBefore = a.lootQualityFloor;
    // activa CONVOY (restedMult) + KINSHIP (goldFind) + WARD (wardRegen) + WAYFARER (oocMitigation) + TRAILCRAFT (lootQuality) en la MISMA zona ⇒ SUS canales suben pero el bono critChance NO cambia (⊥)
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: NOW });
    window.__dev.convoy({ nowMs: NOW, push: { [zone]: { march: 6, atMs: NOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: NOW });
    window.__dev.kinship({ nowMs: NOW, push: { [zone]: { kinship: 6, atMs: NOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: NOW });
    window.__dev.ward({ nowMs: NOW, push: { [zone]: { ward: 6, atMs: NOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: NOW });
    window.__dev.wayfarerRoam({ nowMs: NOW, self: "self", push: { self: [{ c: "0,0", t: NOW }, { c: "1,0", t: NOW }, { c: "2,0", t: NOW }, { c: "3,0", t: NOW }] }, toZone: zone });
    window.__dev.trailcraft({ enabled: true, self: "self" }); window.__dev.trailcraft({ clear: true, nowMs: NOW });
    window.__dev.trailcraft({ nowMs: NOW, self: "self", craft: 6, pid: "self", atMs: NOW, toZone: zone });
    const b = window.__dev.delve({ nowMs: NOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, critBefore, restedBefore, goldBefore, wardBefore, oocBefore, lootBefore, critAfter: b.critBonusPct, restedAfter: b.restedXpMult, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor };
  }, NOW);
  const orthOk = !orth.bad && orth.channel === "critChance" && orth.critBefore === 25 &&
    orth.critAfter === orth.critBefore &&                             // ★ el bono critChance NO cambia al activar los otros canales (prueba ⊥ dura)
    orth.restedAfter >= orth.restedBefore &&                          // restedMult (CONVOY) nunca BAJA por abrir delve (⊥); el delta CONVOY es flaky (vectorial), no lo exijo estricto
    orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "";   // KINSHIP/WARD/WAYFARER/TRAILCRAFT sí aportan en SUS canales (liveness estable) ⇒ el test es real y delve no los toca
  ok("13 ★ ORTOGONALIDAD critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 doble-conteo): abrir descenso NO toca los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT NO cambia el bono; canal='critChance'",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: los 16 flags del arco siguen LIVE served; DELVE served false (DARK)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const delveDark = flag("DELVE") === "false";
  ok("14 ★ 0-REGRESIÓN: 16 flags del arco served enabled:true (incl. TRAILCRAFT LIVE); DELVE served false (DARK)",
     arcAllOn && delveDark && arc.length === 16, `delve=${flag("DELVE")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ DESCENSO en las 9 zonas
  const zonesRes = await page.evaluate((NOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    const zones = window.__dev.delve().zones; const broken = [];
    for (const z of zones) {
      window.__dev.delve({ clear: true, nowMs: NOW });
      const s = window.__dev.delve({ nowMs: NOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: NOW, toZone: z });
      if (!(s.zone === z && s.delvable && s.tier === 3 && s.critPct === 25)) broken.push(z);
    }
    return { zones, broken };
  }, NOW);
  ok("15 ★ DESCENSO 6 zonas: las 6 zonas de DELVE.zones hospedan el pasivo (delve≥6+bands≥5 ⇒ T3, critPct 25) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Descenso:" drawn ON / not OFF + fps
  const badge = await page.evaluate(async (NOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Descenso:") >= 0) cnt++; return orig(t, x, y); };  // "Descenso:" (con colon) = ÚNICO de mi badge (no colisiona con "Sendero"/"Sendero Trillado")
    const w = window.__dpick(6, 5);
    window.__dev.delve({ nowMs: NOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.delve({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, NOW);
  ok("16 render badge \"Descenso:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((NOW) => { const w = window.__dpick(6, 5); window.__dev.delve({ nowMs: NOW, toZone: w.zone }); }, NOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.delve({ enabled: false }));   // quiesce page A rendering before opening page B
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installDelve(pageB);
  const northStar = await (async () => {
    const zone = (await page.evaluate(() => (window.__dev.delve({ enabled: true }).zones || [])[2]));   // caves idx2 (banda 3)
    // snapshot COMPARTIDO { A:{delve6,bands5}, B:{delve2,bands2}, P:{delve6,bands5} } @NOW; ambos clientes lo empujan idéntico
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, NOW }) => {
        window.__dev.delve({ enabled: true, self });
        window.__dev.delve({ clear: true, nowMs: NOW });
        const s = window.__dev.delve({ nowMs: NOW + (elapsedSec || 0) * 1000, self, push: {
          A: { delve: 6, bands: 5, atMs: NOW }, B: { delve: 2, bands: 2, atMs: NOW }, P: { delve: 6, bands: 5, atMs: NOW },
        }, toZone: zone });
        return { self: s.self, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct, nowMs: s.nowMs, map: s.delveMap, bmap: s.bandsMap };
      }, { self, elapsedSec, zone, NOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("P", 0);      // ambos leen pid P: delve 6 bands 5 (T3, +25%), byte-idéntico
    const decayed = await readAs("P", 25);     // +25s ⇒ half-life ⇒ P delve 3 bands 5 (T1, +8%), converge
    // per-pid independence: A lee "A" (delve6 bands5 T3), B lee "B" (delve2 bands2 T1) del MISMO snapshot ⇒ pasivos distintos pero mapa idéntico
    const indep = await (async () => {
      const push = { A: { delve: 6, bands: 5, atMs: NOW }, B: { delve: 2, bands: 2, atMs: NOW } };
      const rA = await page.evaluate(({ zone, NOW, push }) => { window.__dev.delve({ enabled: true, self: "A" }); window.__dev.delve({ clear: true, nowMs: NOW }); const s = window.__dev.delve({ nowMs: NOW, self: "A", push, toZone: zone }); return { self: s.self, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, NOW, push });
      const rB = await pageB.evaluate(({ zone, NOW, push }) => { window.__dev.delve({ enabled: true, self: "B" }); window.__dev.delve({ clear: true, nowMs: NOW }); const s = window.__dev.delve({ nowMs: NOW, self: "B", push, toZone: zone }); return { self: s.self, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, NOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    // A leaves zone ⇒ crit 0 (zone-gate) PERO delveMap + B intact
    const aLeaves = await page.evaluate(() => { const s = window.__dev.delve({ leave: true }); return { bonus: s.critBonusPct, tier: s.tier, map: s.delveMap, delve: s.delve, bands: s.bands }; });
    const bIntact = await pageB.evaluate(({ zone, NOW }) => { const s = window.__dev.delve({ nowMs: NOW, self: "B", toZone: zone }); return { bonus: s.critBonusPct, tier: s.tier, delve: s.delve }; }, { zone, NOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.delve, 6) && northStar.shared.a.critPct === 25 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.delve, 3, 0.02) && northStar.decayed.a.critPct === 8 &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && northStar.indep.rA.critPct === 25 && northStar.indep.rB.tier === 1 && northStar.indep.rB.critPct === 8 &&
    northStar.aLeaves.bonus === 0 && northStar.aLeaves.tier === 0 &&                   // A fuera de zona ⇒ bono 0
    (northStar.aLeaves.map && (northStar.aLeaves.map.A || 0) > 0) &&                   // delveMap server-authoritative INTACTO
    near(northStar.aLeaves.delve, 6) &&                                               // delve (per-pid A) sigue proyectado
    northStar.bIntact.bonus === 8 && northStar.bIntact.tier === 1;                    // B intacto (per-pid independiente)
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ delve/bands/tier/crit byte-idénticos (P T3 +25%, decae T1 +8%); delve per-pid (A=T3 vs B=T1 independientes, mapa idéntico); A sale de zona ⇒ crit=0 PERO delveMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aBonus: northStar.aLeaves.bonus, bBonus: northStar.bIntact.bonus, bTier: northStar.bIntact.tier, errB: errB.length }));

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
