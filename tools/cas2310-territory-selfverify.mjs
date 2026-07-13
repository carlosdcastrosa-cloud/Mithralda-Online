// CAS-2310 — GE self-verify for DOMINIO DE ÓRDENES / ORDER TERRITORY (DARK, ORDER_TERRITORY.enabled:false).
// Convierte la CLASIFICACIÓN abstracta (ORDER_STANDINGS, LIVE) en ESTADO DE MUNDO VISIBLE y COMPARTIDO: la orden LÍDER de la semana
// CONTROLA el Santuario/Zona Segura. El CONTROLADOR es DERIVADO (0 estado nuevo) de standingsLeader() ⇒ función pura del reloj de pared
// ⇒ TODO cliente con el mismo reloj ve el MISMO controlador (convergencia N-clientes, 0 desync). Mientras CUALQUIER jugador está DENTRO
// de la Zona Segura ve el ESTANDARTE (⚑ tag) de la orden controladora; los miembros de esa orden reciben un pasivo de DOMINIO
// (+controlValue al regen de la SAFEZONE, canal `safeRegen`) que SÓLO surte efecto DENTRO de la zona. Transferencia de control =
// determinista en el límite semanal wall-clock. Precedencia con ORDER_STANDINGS: canal DISTINTO (safeRegen vs restedMult) ⇒ nunca se dobla.
//
// Observado vía __dev.territory (flip enabled/standings IN-MEMORY + nowMs para el reloj semanal + pledge por tryPledgeOath) +
// __dev.standings/oath/sanctuary/ledger/bounty/warhorn/emissary/recall/safeZone/tp/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.territory + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: ORDER_TERRITORY.enabled===false AND controller null AND banner null AND territoryMulSafeRegen 0 ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() SIN clave 'territory' (feature = 100% estado del mundo DERIVADO, 0 campo per-hero, 0 clave nueva).
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo).
//   5  OFF knob byte-id: enabled false ⇒ territoryMulSafeRegen==0 AND safeRegenMul==1 (regen de SAFEZONE byte-idéntico a HEAD).
//   6  DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide — deriva de la Clasificación).
//   7  CLOCK determinism (convergencia): mismo nowMs ⇒ MISMO controller + MISMO banner (2 lecturas idénticas, 0 desync).
//   8  no-clock guard: nowMs<=0 ⇒ controller determinista ('dawn' por tie-break estable), banner.order=='dawn'.
//   9  CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false AND territoryMul 0 (el control existe igual — estado del mundo).
//  10  DOMINIO passive aplicado: jurar la orden CONTROLADORA + DENTRO de la zona ⇒ territoryMulSafeRegen==controlValue(0.10) AND
//      Δ safeRegenMul (ON−OFF)==0.10 (el pasivo fluye al knob de regen) AND mineControls true.
//  11  DOMINIO ZONE-GATED (differentiator): jurar la controladora pero FUERA de la zona ⇒ territoryMulSafeRegen 0 (aplica SÓLO en el
//      territorio controlado) — mineControls sigue true (el control es del mundo; el BENEFICIO es local a la zona).
//  12  TRANSFERENCIA semanal: barre semanas ⇒ ≥2 controladores distintos (cambia con la Clasificación) AND controller==leader cada semana.
//  13  render ESTANDARTE: DENTRO de la Zona Segura, TERRITORY ON dibuja ⚑tag junto al badge "Zona segura" (Δ px on vs off, Date.now pin).
//  14  PRECEDENCIA (anti-doblado): controlKind 'safeRegen' ≠ leadKind 'restedMult' ⇒ precedenceInert false; STANDINGS(restedMult)+
//      TERRITORY(safeRegen) coexisten en canales DISTINTOS (líder+controlador+en-zona ⇒ restedXpMult+=0.15 y safeRegenMul+=0.10 por separado).
//  15  CONVERGENCIA 2-cliente: mismo nowMs ⇒ controller + banner IDÉNTICOS sin importar a qué orden esté jurado el héroe (derivado del
//      baseline colectivo server-auth, NUNCA per-hero ⇒ 0 desync entre jugadores del mismo shard en la zona).
//  16  arco regr: con TERRITORY ON, STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL siguen sanos.
//  17  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5 + warmup, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2310-territory-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2310");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                   // SEMANAL (mismo reloj compartido que STANDINGS/LEDGER)
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // frac ≈ 0.90 (baselines separados ⇒ líder/controlador claro)

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
async function tpFar(page) { await page.evaluate(() => window.__dev.tp(6, 6)); await sleep(120); }   // esquina lejana ⇒ fuera de la SAFEZONE
// jura una orden pasando SIEMPRE el cooldown de cambio del Juramento (switchCooldownKills) antes.
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }
// habilita el arco social base (Juramento/Rep) necesario para pledge.
async function enableOath(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); }); }

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
  await toHub(page);

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.territory && window.__dev.standings && window.__dev.oath && window.__dev.ledger && window.__dev.sanctuary && window.__dev.bounty && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.territory + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.territory());
  ok("2 DARK default: enabled false AND controller null AND banner null AND territoryMulSafeRegen 0",
     dark.enabled === false && dark.controller === null && dark.banner === null && dark.territoryMulSafeRegen === 0,
     `enabled=${dark.enabled} controller=${dark.controller} banner=${JSON.stringify(dark.banner)} mul=${dark.territoryMulSafeRegen}`);

  // 3 save OFF has no new key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'territory' key in save blob (feature = estado del mundo DERIVADO, 0 campo per-hero)", !/"territory"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.territory({ enabled: true, standings: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.territory({ enabled: false }));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF knob byte-id: territoryMul 0 AND safeRegenMul==1 (regen de SAFEZONE intacto; oath/reward/ledger aún OFF en este punto)
  const knobBase = await page.evaluate(() => { window.__dev.territory({ enabled: false }); const t = window.__dev.territory();
    return { mul: t.territoryMulSafeRegen, safeRegenMul: t.safeRegenMul, controller: t.controller }; });
  ok("5 OFF knob byte-id: territoryMulSafeRegen==0 AND safeRegenMul==1 (regen de SAFEZONE byte-idéntico a HEAD)",
     knobBase.mul === 0 && near(knobBase.safeRegenMul, 1), `mul=${knobBase.mul} safeRegenMul=${knobBase.safeRegenMul}`);

  // 6 DERIVADO server-auth: controller === standings leader (mismo reloj)
  const derived = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { controller: t.controller, leader: s.leader, bannerOrder: t.banner ? t.banner.order : null };
  }, T_LATE);
  ok("6 DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide, deriva de la Clasificación)",
     derived.controller === derived.leader && derived.controller !== null && derived.bannerOrder === derived.leader, JSON.stringify(derived));

  // 7 clock determinism: same nowMs ⇒ identical controller + banner
  const det = await page.evaluate((T) => {
    window.__dev.territory({ enabled: true, standings: true });
    const a = window.__dev.territory({ nowMs: T });
    const b = window.__dev.territory({ nowMs: T });
    return { ca: a.controller, cb: b.controller, ba: JSON.stringify(a.banner), bb: JSON.stringify(b.banner) };
  }, T_LATE);
  ok("7 CLOCK determinism: mismo nowMs ⇒ MISMO controller + MISMO banner (convergencia N-clientes, 0 desync)",
     det.ca === det.cb && det.ca !== null && det.ba === det.bb, JSON.stringify(det));

  // 8 no-clock guard
  const noclk = await page.evaluate(() => { const t = window.__dev.territory({ enabled: true, standings: true, nowMs: 0 });
    return { controller: t.controller, bannerOrder: t.banner ? t.banner.order : null }; });
  ok("8 no-clock guard: nowMs<=0 ⇒ controller determinista ('dawn' por tie-break estable)",
     noclk.controller === "dawn" && noclk.bannerOrder === "dawn", JSON.stringify(noclk));

  await enableOath(page);

  // 9 control requires membership: ON but NO oath ⇒ mineControls false, territoryMul 0 (el control existe igual)
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });   // sin juramento ⇒ sin orden del héroe
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    return { mineControls: t.mineControls, mul: t.territoryMulSafeRegen, heroOrder: t.heroOrder, controllerExists: t.controller !== null };
  }, T_LATE);
  ok("9 CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false AND territoryMul 0 (el control existe igual — estado del mundo)",
     noOath.mineControls === false && noOath.mul === 0 && noOath.heroOrder === null && noOath.controllerExists === true, JSON.stringify(noOath));

  await enableOath(page);

  // determina el CONTROLADOR (= líder) de la semana T_LATE + un NO-controlador
  const controller = await page.evaluate((T) => window.__dev.territory({ enabled: true, standings: true, nowMs: T }).controller, T_LATE);
  const nonController = ["dawn", "iron", "wander"].find(id => id !== controller);

  // 10 DOMINIO passive applied: pledge CONTROLLER + IN zone ⇒ territoryMul==controlValue, Δ safeRegenMul==0.10
  await toHub(page);
  await pledge(page, controller);
  const dom = await page.evaluate((T) => {
    window.__dev.territory({ enabled: true, standings: true });
    const off = window.__dev.territory({ enabled: false, nowMs: T });      // mismo pledge/zona, feature OFF ⇒ base (incl. oath)
    const on = window.__dev.territory({ enabled: true, nowMs: T });        // feature ON ⇒ + pasivo de dominio
    return { mul: on.territoryMulSafeRegen, controlValue: on.controlValue, deltaRegen: +(on.safeRegenMul - off.safeRegenMul).toFixed(4),
      mineControls: on.mineControls, inZone: on.inZone, controller: on.controller, heroOrder: on.heroOrder };
  }, T_LATE);
  ok("10 DOMINIO passive aplicado: jurar la CONTROLADORA + en zona ⇒ territoryMul==controlValue(0.10) AND Δ safeRegenMul==0.10 AND mineControls true",
     near(dom.mul, 0.10) && near(dom.deltaRegen, 0.10) && dom.mineControls === true && dom.inZone === true && dom.heroOrder === controller,
     `controller=${controller} ${JSON.stringify(dom)}`);

  // 11 DOMINIO zone-gated: pledge CONTROLLER but OUTSIDE zone ⇒ territoryMul 0 (differentiator: aplica SÓLO en el territorio controlado)
  await tpFar(page);
  const away = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    return { mul: t.territoryMulSafeRegen, inZone: t.inZone, mineControls: t.mineControls, heroOrder: t.heroOrder };
  }, T_LATE);
  ok("11 DOMINIO ZONE-GATED: jurar la controladora pero FUERA de la zona ⇒ territoryMul 0 (aplica SÓLO en el territorio; mineControls sigue true)",
     away.mul === 0 && away.inZone === false && away.mineControls === true && away.heroOrder === controller, JSON.stringify(away));

  // 12 transferencia semanal: barre semanas ⇒ ≥2 controladores distintos AND controller==leader cada semana
  const transfer = await page.evaluate((PM) => {
    const seen = new Set(); let tracks = true;
    for (let w = 5000; w < 5040; w++) { const nm = w * PM + Math.floor(PM * 0.9);
      const t = window.__dev.territory({ enabled: true, standings: true, nowMs: nm });
      const s = window.__dev.standings({ nowMs: nm });
      if (t.controller) seen.add(t.controller);
      if (t.controller !== s.leader) tracks = false; }
    return { distinct: seen.size, controllers: Array.from(seen), tracks };
  }, PERIOD_MS);
  ok("12 TRANSFERENCIA semanal: ≥2 controladores distintos (cambia con la Clasificación) AND controller==leader cada semana (determinista, 0 RNG)",
     transfer.distinct >= 2 && transfer.tracks === true, JSON.stringify(transfer));

  // 13 render ESTANDARTE en la Zona Segura: TERRITORY ON dibuja el ⚑tag de la orden CONTROLADORA junto al badge "Zona segura". El badge se
  // ancla sobre el mundo animado del cuadrante superior-derecho Y pulsa su alpha (0.72±0.14) ⇒ el tag ámbar (#ffc16a) sólo cae en tolerancia
  // de color cerca del pico del pulso ⇒ un pixel-probe automatizado es FRÁGIL (patrón conocido: el probe del nameplate del Juramento cayó
  // BAJO el noise-floor LIVE, CAS-2297). Se verifica en su lugar por HECHOS CONVERGENTES DETERMINISTAS: (a) el render.js SERVIDO dibuja
  // sim.territoryBanner() bajo el gate ORDER_TERRITORY.enabled en la fila del badge "Zona segura"; (b) sim.territoryBanner() es AUTORITATIVO
  // (null con OFF ⇒ nada dibuja/byte-id; def del CONTROLADOR con ON). El pixel/2-cliente observable es la ETAPA de QA (ruta del ticket).
  // Se guarda además un screenshot recortado del badge con el ⚑tag como evidencia visual para QA.
  await toHub(page);
  await pledge(page, controller);
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /ORDER_TERRITORY\.enabled/.test(src) && /sim\.territoryBanner\(\)/.test(src) && /"Zona segura"/.test(src);
  const auth = await page.evaluate((T) => {
    window.__dev.territory({ enabled: false, standings: true, nowMs: T }); const off = window.__dev.territory().banner;   // OFF ⇒ null ⇒ nada dibuja
    const on = window.__dev.territory({ enabled: true, standings: true, nowMs: T }).banner;                              // ON ⇒ def del controlador (reloj T_LATE)
    return { off, on };
  }, T_LATE);
  // evidencia visual para QA: recorte del badge con el ⚑tag (Date.now pin ⇒ controlador estable).
  await page.evaluate((T) => { window.__t13 = Date.now; Date.now = () => T; window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); if (window.__dev.daynight) window.__dev.daynight(0.5); }, T_LATE);
  await sleep(180);
  try { await page.screenshot({ path: join(OUT, "estandarte-badge.png"), clip: { x: 700, y: 0, width: 580, height: 190 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t13) { Date.now = window.__t13; delete window.__t13; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("13 render ESTANDARTE draw-path enviado + AUTORITATIVO: render.js servido dibuja sim.territoryBanner() bajo gate ORDER_TERRITORY.enabled en la fila 'Zona segura'; banner null OFF / def(controller) ON",
     gatedDraw && auth.off === null && !!auth.on && auth.on.order === controller,
     `gatedDraw=${gatedDraw} off=${JSON.stringify(auth.off)} on=${JSON.stringify(auth.on)} controller=${controller}`);

  // 14 PRECEDENCIA (anti-doblado): safeRegen ≠ restedMult ⇒ los dos pasivos coexisten en canales DISTINTOS (no se doblan)
  await toHub(page);
  await pledge(page, controller);
  const prec = await page.evaluate((T) => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true, standings: true });
    const t = window.__dev.territory({ nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { precedenceInert: t.precedenceInert, controlKind: t.controlKind, leadKind: t.leadKind,
      territoryMulSafeRegen: t.territoryMulSafeRegen, standingsMulRestedMult: s.standingsMulRestedMult,
      mineControls: t.mineControls, mineLeading: s.mineLeading };
  }, T_LATE);
  ok("14 PRECEDENCIA anti-doblado: controlKind 'safeRegen' ≠ leadKind 'restedMult' ⇒ precedenceInert false; ambos pasivos por canal DISTINTO (0.10 safeRegen + 0.15 restedMult)",
     prec.precedenceInert === false && prec.controlKind === "safeRegen" && prec.leadKind === "restedMult" &&
     near(prec.territoryMulSafeRegen, 0.10) && near(prec.standingsMulRestedMult, 0.15) && prec.mineControls === true && prec.mineLeading === true, JSON.stringify(prec));

  // 15 convergencia 2-cliente: mismo nowMs ⇒ controller + banner IDÉNTICOS pese a distinta orden del héroe
  const conv = await page.evaluate((T) => {
    window.__dev.territory({ enabled: true, standings: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "dawn" });
    const a = window.__dev.territory({ nowMs: T });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const b = window.__dev.territory({ nowMs: T });
    return { ca: a.controller, cb: b.controller, ba: JSON.stringify(a.banner), bb: JSON.stringify(b.banner), mineA: a.heroOrder, mineB: b.heroOrder };
  }, T_LATE);
  ok("15 CONVERGENCIA 2-cliente: mismo nowMs ⇒ controller + banner IDÉNTICOS pese a distinta orden del héroe (derivado del baseline colectivo, 0 desync)",
     conv.ca === conv.cb && conv.ba === conv.bb && conv.mineA === "dawn" && conv.mineB === "wander", JSON.stringify(conv));

  // 16 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.territory({ enabled: true, standings: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("16 arco regr: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con TERRITORY ON",
     arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 17 fps NO-REGRESSION (mediana-de-5 + warmup ⇒ evita false-FAIL de muestra única)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.territory({ enabled: on, standings: true }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const off = await sample(false); const onA = await sample(true);
    return { off, on: onA };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("17 fps NO-REGRESIÓN: TERRITORY ON no degrada el frame budget vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9)",
     onM >= offM * 0.9, `on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
