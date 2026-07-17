// CAS-2532 — self-verify for REMATE DE INTERRUPCIÓN (DARK, INTERRUPT_SURGE.enabled:false). EVO mecánica #89 (serializa tras #88 LONGSHOT_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 30 LIVE #59-#88.
// (A) EJE FRESCO = ESTADO-DE-ACCIÓN-EN-PROGRESO DEL MOB al instante del remate (denegar la habilidad enemiga: rematar a un mob MIENTRAS ejecuta una acción peligrosa — mid-windup / mid-strike / mid-canal — NO a un mob ocioso). server-auth, MMORPG-native (interrupt/ability-denial).
//     PRE-FLIGHT GATE PASA: EXISTE una máquina de estados de acción server-auth DETERMINISTA por mob en updateEnemies — `e.state` ∈ {idle,wander,chase,windup,strike,recover,shield,flee} + el timer `e.st` decrementado a paso-fijo `e.st-=dt` (sim.js:8010/8019/8027/8055/8124/8141). windup = el mob COMPROMETE un ataque (el aviso/telegraph antes del golpe); strike = ejecuta; shield = un jefe CANALIZA (carapace/Freeze Nova); `e.specialNow`/`e.castNow` = el ataque comprometido es un special (slam/lunge) / cast (warlock). DINÁMICO, server-auth (paso-fijo, NO wall-clock, NO interp de cliente), y NINGUNA de las 30 flags #59-#88 lo lee como eje de SCORE (los únicos lectores de e.state son gates de IA/anim/engage/wantCombat + harness de test).
//     interruptWeight(e) = habilidad PESADA en curso (canal shield/Freeze Nova, special slam/lunge specialNow, cast warlock castNow) ⇒ 2; ataque NORMAL comprometido (windup/strike) ⇒ 1; ocioso/persiguiendo/recover/flee ⇒ 0; EXCLUYE stun-frozen (e.stun>0 ⇒ 0). El score del kill = interruptWeight(víctima) muestreado en el TOP de killEnemy con la acción VIVA del mob (_interruptPre). La señal VIVA del badge = interruptScore(hero)=MAX interruptWeight sobre los mobs VIVOS en radio (la mejor interrupción DISPONIBLE). PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #88 remate).
//     CRUX ⊥ CC #85: #85 PUNTÚA e.stun/e.slowT = estado IMPUESTO SOBRE el mob (negación PASIVA que el héroe aplicó); interrupt PUNTÚA la ACCIÓN PROPIA del mob (windup/strike/shield) siendo DENEGADA al matarlo, COMPLEMENTO EXACTO — interruptWeight EXCLUYE a los stun-frozen (e.stun>0⇒0, gate 7942 congela la IA) mientras #85 los premia (⇒2); un mob castea sin estar CC'd (interrupt≥1/CC 0) y un mob CC'd está congelado sin ejecutar (CC 2/interrupt 0) ⇒ DISJUNTOS.
//     ⊥ #88 (remate = DISTANCIA magnitud hero↔víctima [geometría] vs ESTADO DE ACCIÓN categórico [sin geometría]), ⊥ #87 (manada = clustering mob↔mob), ⊥ #86 (siega = FRACCIÓN DE VIDA e.hp/e.maxHp), ⊥ #85 (control = ESTADO CC IMPUESTO e.stun/e.slowT — COMPLEMENTO, ver crux), ⊥ #84 (escaramuza = CLASE DE ALCANCE ESTÁTICA e.tpl.ranged [stat de spawn] vs ACCIÓN DINÁMICA en curso — arquero ocioso = alta escaramuza/cero interrupt; orco melee mid-slam = cero escaramuza/alto interrupt, DIVERGEN), ⊥ #83 (plaga = DoT e.dots), ⊥ #78 (furia = BOOLEANO e.enraged [fase de jefe]; enrage MODULA la duración del windup pero el eje es la fase, no "está-ejecutando"), ⊥ #73 (apex = DISTANCIA a un jefe/campeón), ⊥ #69 (LAST_STAND = CONTEO de enganchados en melee), ⊥ CADENCE #67/FRENZY (racha/tempo), ⊥ backstab/facing (ángulo geométrico), NO velocidad/sigilo/terreno/clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = interruptFind (recompensa de fichas de interrupción por rematar MID-ACCIÓN — NINGUNA de las 30 flags lo usa). La familia recompensa-de-forrajeo de moneda EXISTENTE (goldFind…packFind #87, reachFind #88) está LLENA ⇒ pivota a una moneda FRESCA (h.interruptBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio interruptBountyCap, 0 doble-dip.
//
// ★ ACTION-crux + COMPLEMENTO ⊥#85 (check 8): un mob mid-windup NO-CC'd ⇒ interrupt 1 / control 0; el MISMO mob mid-windup PERO stun-frozen ⇒ interrupt 0 / control 2. Prueba que interrupt EXCLUYE lo que CC INCLUYE (complemento exacto ⇒ ⊥ probado).
// ★ REAL SERVER-AUTH (check 7): spawnAct empuja un mob REAL al MISMO G.enemies y le fija un ESTADO DE ACCIÓN; actProbe lee el estado REAL (state,specialNow,castNow,stun,weight) ⇒ heavy⇒2/shield⇒2/cast⇒2/light⇒1/stun⇒0/idle⇒0 leídos de los MISMOS campos que updateEnemies escribe.
// ★ DIFERENCIADOR/⊥ (check 9): un mob mid-HEAVY (special slam) SANO SUELTO NO-CC'd ⇒ interrupt T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85) lo IGNORAN (melee/suelto/sano/sin-CC ⇒ sus probes 0), pese a estar in-radio de los peers.
// ★ CANAL (check 10): forageChargePreview = interruptBonus(score). Acción en curso ⇒ charge>0; ocioso / sin mob ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(interruptBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con INTERRUPT_SURGE OFF, interruptBonus(cualquier score)==0 y forageChargePreview==0 aun con un mob mid-acción ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): interrupt (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de interrupt.
// ★ 0-REGRESIÓN (check 14): las 30 mecánicas del arco #59-#88 siguen served enabled:true; INTERRUPT_SURGE served false (DARK #89).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob mid-heavy en el MISMO tile + héroe en el MISMO tile ⇒ score/tier/charge + actProbe + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). interruptScore es función PURA de G.enemies+estado ⇒ shard-consistente.
//
// Observado vía __dev.interrupt (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT puro + stateProbe path-de-estado + spawnAct inyección REAL con estado forzado + clearAct + actProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Interrupción:"). Los mobs inyectados son estacionarios (spd:0) ⇒ no se mueven ⇒ 0 efecto de sim en las lecturas.
//
// Run: node tools/cas2532-interrupt-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2532");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// path ESTADO→peso→forage: ocioso/chase/recover ⇒ w0/f0; windup/strike ⇒ w1/f1; special/cast/shield ⇒ w2/f2; windup+stun ⇒ w0/f0 (⊥ CC)
const EXPECT_STATE = [
  { state: "idle", w: 0, f: 0 }, { state: "chase", w: 0, f: 0 }, { state: "recover", w: 0, f: 0 },
  { state: "windup", w: 1, f: 1 }, { state: "strike", w: 1, f: 1 },
  { state: "windup", specialNow: true, w: 2, f: 2 }, { state: "strike", specialNow: true, w: 2, f: 2 },
  { state: "windup", castNow: true, w: 2, f: 2 }, { state: "shield", w: 2, f: 2 },
  { state: "windup", stun: 1, w: 0, f: 0 },   // ★ stun-frozen ⇒ 0 (⊥ CC #85: complemento)
];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.interrupt + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.interrupt());
  ok("2 byte-id OFF (fresh boot): INTERRUPT_SURGE.enabled false AND G.interruptBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "interruptFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no interruptFind/interruptBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(interruptFind|interruptBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"interruptBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'interruptFind'/'interruptBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.interrupt({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.interrupt({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.interrupt({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 6 stateProbe: ESTADO→peso→forage (el path exacto que el seam usa con _interruptPre)
  const st = await page.evaluate((cases) => { window.__dev.interrupt({ enabled: true }); const out = cases.map(c => window.__dev.interrupt({ stateProbe: { state: c.state, specialNow: !!c.specialNow, castNow: !!c.castNow, stun: c.stun || 0 } }).stateProbe); window.__dev.interrupt({ enabled: false }); return out; }, EXPECT_STATE);
  const stOK = EXPECT_STATE.every((c, i) => st[i] && st[i].weight === c.w && st[i].forage === c.f);
  ok("6 stateProbe ESTADO→peso→forage: ocioso/chase/recover⇒w0; windup/strike⇒w1; special/cast/shield⇒w2; windup+stun⇒w0 (⊥CC)",
     stOK, JSON.stringify(st.map(x => ({ s: x.state, sp: x.specialNow, ca: x.castNow, stn: x.stun, w: x.weight, f: x.forage }))));

  // 7 ★ REAL SERVER-AUTH: spawnAct pushes a real mob to G.enemies with a forced ACTION state; actProbe reads the REAL state field. heavy/shield/cast⇒2, light⇒1, stun/idle⇒0.
  const server7 = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    const out = {};
    for (const kind of ["heavy", "shield", "cast", "light", "stun", "idle"]) {
      window.__dev.interrupt({ clearAct: true });
      const sa = window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind } }).spawnAct;
      const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
      out[kind] = { saW: sa.weight, saState: sa.state, apScore: ap.score, apW: ap.mobs[0] ? ap.mobs[0].weight : -1 };
    }
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    return out;
  });
  const s7OK = server7.heavy.saW === 2 && server7.heavy.apScore === 2 && server7.heavy.saState === "strike" &&
    server7.shield.saW === 2 && server7.shield.apScore === 2 &&
    server7.cast.saW === 2 && server7.cast.apScore === 2 &&
    server7.light.saW === 1 && server7.light.apScore === 1 && server7.light.saState === "windup" &&
    server7.stun.saW === 0 && server7.stun.apScore === 0 &&
    server7.idle.saW === 0 && server7.idle.apScore === 0;
  ok("7 ★ REAL SERVER-AUTH: spawnAct empuja un mob REAL con ESTADO DE ACCIÓN forzado; actProbe lee el estado REAL ⇒ heavy/shield/cast⇒2, light⇒1, stun/idle⇒0",
     s7OK, JSON.stringify(server7));

  // 8 ★ ACTION-crux + COMPLEMENTO ⊥#85: mob mid-windup NO-CC'd ⇒ interrupt 1 / control 0; MISMO mob mid-windup STUN-FROZEN ⇒ interrupt 0 / control 2.
  const crux = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h0 = window.__dev.interrupt().hero;
    const RX = h0.tx - 100, RY = h0.ty;                                     // tile remoto fresco
    window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    // (a) mob mid-windup NO-CC'd (kind light) ⇒ interrupt 1 / control 0
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "light" } });
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const aCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    // (b) mob mid-windup PERO stun-frozen (kind stun) ⇒ interrupt 0 / control 2
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "stun" } });
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const bCtl = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    return { aInt, aCtl, bInt, bCtl };
  });
  const cruxOK = crux.aInt === 1 && crux.aCtl === 0 && crux.bInt === 0 && crux.bCtl === 2;
  ok("8 ★ ACTION-crux ⊥#85 (COMPLEMENTO): mob mid-windup NO-CC'd ⇒ interrupt 1/control 0; MISMO mob mid-windup STUN-FROZEN ⇒ interrupt 0/control 2 (interrupt EXCLUYE lo que CC INCLUYE)",
     cruxOK, JSON.stringify(crux));

  // 9 ★ DIFFERENTIATOR/⊥ vs skirmish(#84)/pack(#87)/blood(#86)/control(#85): un mob mid-HEAVY SANO SUELTO NO-CC'd ⇒ interrupt T2 MIENTRAS los peers lo IGNORAN.
  const diff = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h0 = window.__dev.interrupt().hero;
    const RX = h0.tx - 90, RY = h0.ty;                                      // tile remoto fresco
    window.__dev.interrupt({ tp: { tx: RX, ty: RY } });
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    // orco MELEE SANO SUELTO NO-CC'd mid-HEAVY (special slam) a +3 tiles: in-radio de todos los peers, pero melee/suelto/sano/sin-CC ⇒ peers 0
    window.__dev.interrupt({ spawnAct: { tx: RX + 3, ty: RY, kind: "heavy" } });
    const vm = window.__dev.interrupt();
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;   // orco = MELEE ⇒ escaramuza IGNORA
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;   // mob SUELTO (0 vecinos) ⇒ manada IGNORA
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;   // orco SANO ⇒ siega IGNORA
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;   // NO CC ⇒ control IGNORA
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter };
  });
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&                        // interrupt fires (mob mid-heavy)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // ★ escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore;                          // siega #86 / control #85 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥: un mob mid-HEAVY SANO SUELTO NO-CC'd ⇒ interrupt T2 MIENTRAS escaramuza(#84)/manada(#87)/siega(#86)/control(#85) IGNORAN",
     diffOK, JSON.stringify(diff));

  // 10 CANAL interruptFind: forageChargePreview mid-acción>0 ; ocioso/no mob → 0
  const forage = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });   // mid-heavy ⇒ score 2 ⇒ T2
    const actVm = window.__dev.interrupt();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "idle" } });    // ocioso ⇒ score 0
    const idleVm = window.__dev.interrupt();
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    return { actPrev, actCharge, idlePrev: idleVm.forageChargePreview, idleTier: idleVm.tier, idleScore: idleVm.score };
  });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.idlePrev === 0 && forage.idleTier === 0 && forage.idleScore === 0;
  ok("10 CANAL interruptFind: forageChargePreview con acción en curso ⇒ charge>0 (==interruptBonus); mob ocioso ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds interruptBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.interrupt().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>interruptBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a mid-action mob available
  const neutral = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });   // mob mid-heavy disponible
    window.__dev.interrupt({ enabled: false });                             // now OFF
    const off = window.__dev.interrupt();
    window.__dev.interrupt({ enabled: true }); window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, interruptBonus(mob mid-heavy)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip interrupt OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de interrupt.
  const orth = await page.evaluate(() => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });
    window.__dev.interrupt({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();                                             // INTERRUPT OFF (misma posición)
    window.__dev.interrupt({ enabled: true });
    const peersOn = snap();                                              // INTERRUPT ON — los peers NO deben cambiar
    const beforeArc = window.__dev.interrupt();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.interrupt();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });                              // restaura estado LIVE
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  });
  ok("13 ★ ORTOGONALIDAD interruptFind ⊥ peers: flip interrupt OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de interrupt; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 30 arc flags served true; INTERRUPT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ivDark = flag("INTERRUPT_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 30 mecanismos del arco #59-#88 served enabled:true; INTERRUPT_SURGE served false (DARK #89)",
     arcAllOn && ivDark && arc.length === 30, `interrupt=${flag("INTERRUPT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Interrupción:" drawn ON+mid-action mob / not OFF + fps. Mobs de prueba estacionarios (spd:0).
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Interrupción:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    const h = window.__dev.interrupt().hero;
    window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } });   // mid-heavy ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("15 render badge \"Interrupción:\" se DIBUJA ON+acción en curso (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.interrupt({ enabled: true }); window.__dev.interrupt({ clearAct: true }); const h = window.__dev.interrupt().hero; window.__dev.interrupt({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.interrupt({ spawnAct: { tx: h.tx + 3, ty: h.ty, kind: "heavy" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.interrupt({ clearAct: true }); window.__dev.interrupt({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence: SAME mid-heavy mob at SAME tile + hero at SAME tile ⇒ score/tier/charge + actProbe + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // FIXED absolute tiles: mob @ (56,40), hero @ (53,40) ⇒ 3 tiles = 96px ≤ radio 300 ⇒ mid-heavy ⇒ weight 2 ⇒ score 2/T2.
  const MOB = { tx: 56, ty: 40 }, HERO_TILE = { tx: 53, ty: 40 };
  const readVM = async (pg) => await pg.evaluate((M, HT) => {
    window.__dev.interrupt({ enabled: true });
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.interrupt({ spawnAct: { tx: M.tx, ty: M.ty, kind: "heavy" } });
    const vm = window.__dev.interrupt();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.interrupt({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });   // LUT PURA
    const ap = window.__dev.interrupt({ actProbe: true }).actProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.interrupt({ clearAct: true });
    window.__dev.interrupt({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, apScore: ap.score, apCount: ap.count, apW: ap.mobs[0] ? ap.mobs[0].weight : -1, apState: ap.mobs[0] ? ap.mobs[0].state : "", lut, fp };
  }, MOB, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.apScore === B.apScore && A.apCount === B.apCount && A.apW === B.apW && A.apState === B.apState && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mob mid-heavy+héroe ⇒ score/tier/charge + actProbe(score,count,weight,state) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},apScore:${A.apScore},apCount:${A.apCount},apW:${A.apW},apState:${A.apState},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},apScore:${B.apScore},apCount:${B.apCount},apW:${B.apW},apState:${B.apState},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.interrupt({ enabled: false }));
  await pageB.evaluate(() => window.__dev.interrupt({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
