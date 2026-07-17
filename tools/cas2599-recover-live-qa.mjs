// CAS-2599 — POST-FLIP LIVE QA for REMATE DE RECOBRO (LIVE, RECOVER_SURGE.enabled:TRUE, served e1d801e51573/815). EVO mecánica #100 = 42º flag LIVE. Ported from DARK cas2594 selfverify: flag ON at boot (check 2), 42 arc flags served true 0-regr (check 14). Oráculos JS puro. HEAD==served BYTE-IDÉNTICO ⇒ observable local == LIVE.
// (A) EJE FRESCO = VENTANA DE RECUPERACIÓN POST-ATAQUE / RECOVER BASE del mob TYPE server-auth (la LENTITUD DE RECOBRO INTRÍNSECA: cuánto TARDA su TIPO de fábrica en recomponerse DESPUÉS de golpear — la cola de exposición tras la estocada — un plúmbeo summoner0.95/toadbrute0.92/charger0.9/mage0.85/golem0.8 que se queda plantado un LARGO recobro vs un rezagado orco0.72/moose0.7 o una alimaña ÁGIL volatile0.1/bat0.35/rat0.4 que se recompone en un parpadeo). server-auth, MMORPG-native (recompensar castigar la larga cola de exposición que aprendiste a leer, no al que se recompone antes de que puedas capitalizar).
//     PRE-FLIGHT GATE PASA sin pivote: `recover` es ESCALAR DECIMAL ESTÁTICO por template (config.js:290+, 0.1..0.95 en 31 tipos), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 41 flags #59-#99 lo lee como SCORE. El ÚNICO lector de `.recover`: la máquina de estados de la IA (arma e.state="recover"; e.st=e.tpl.recover, DURACIÓN del estado — comportamiento). CRUX ⊥#99 WINDUP lee ETPL[type].windup (la cola ANTES del golpe — el amago), NO ETPL[type].recover (la cola DESPUÉS del golpe — el recobro); MISMA fila ETPL, campos DISTINTOS, bandas DIVERGENTES.
//     CLAVE ⊥override/⊥#74/⊥champion/⊥élite: recoverWeight lee ETPL[e.type].recover (RECOBRO BASE INMUTABLE del TIPO), NO e.tpl.recover (el CLON) — si un spawn escalado/élite sobrescribiera el clon, recoverOf lo IGNORA y lee la fila base ⇒ un orco campeón SIGUE recov1 (base 0.72). applyZoneScale escala hp/dmg/spd/xp pero NUNCA recover ⇒ recobro INDEPENDIENTE de zona (⊥#94 swift lee spd que SÍ escala por zona; ⊥#91).
//     recoverWeight(e)=banda de recoverOf(e)=ETPL[type].recover: recover≥hiRecover(0.8) ⇒ plúmbeo ⇒ 2; recover≥midRecover(0.7) ⇒ rezagado ⇒ 1; recover<midRecover ⇒ ágil ⇒ 0. El score del kill = recoverWeight(víctima) muestreado en el TOP de killEnemy (_recoverPre). La señal VIVA del badge = recoverScore(hero)=MAX recoverWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #99 amago/#98 impacto/#97 vigilancia/#96 aguante/#95 daño/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥41 VENTANA DE RECUPERACIÓN/RECOVER BASE ESTÁTICO: ⊥ #99 WINDUP (AMAGO/windup=cola ANTES — charger windup0.66 wind1/recover0.9 recov2 vs volatile windup0.7 wind1/recover0.1 recov0 MISMO wind OPUESTO recover, eje base más reciente). ⊥ #98 RAM (IMPACTO/knock — charger knock235 ram2/recover0.9 recov2 vs golem knock60 ram0/recover0.8 recov2 MISMO recov OPUESTO ram). ⊥ #96 TOUGH (AGUANTE/HP — revenant hp120 tough2/recover0.55 recov0 vs golem hp640 tough2/recover0.8 recov2 MISMO tough OPUESTO recover). ⊥ #95 MENACE (DAÑO — summoner dmg0 menace0/recover0.95 recov2 vs volatile dmg23 menace2/recover0.1 recov0 OPUESTO). ⊥ #94 SWIFT (VELOCIDAD — bat spd158 swift2/recover0.35 recov0 vs golem spd46 swift0/recover0.8 recov2 DIAMÉTRICAMENTE OPUESTOS; applyZoneScale escala spd NUNCA recover ⇒ decoupled). ⊥ #92 BULK (TAMAÑO — summoner sz20 bulk1/recover0.95 recov2 vs skeleton sz20 bulk1/recover0.55 recov0 MISMO bulk OPUESTO recover). ⊥ #89 INTERRUPT (ESTADO DE ACCIÓN DINÁMICO e.state — golem idle recov2/interrupt0 vs bat idle recov0/interrupt0: MISMO interrupt DISTINTO recover ⇒ recover NO es función del estado-de-acción; INTERRUPT puntúa la CATEGORÍA recover-state⇒0 NUNCA el NÚMERO). ⊥ #93/#91/#90/#88/#87/#86/#85/#84/#74/#73/#78/#72/#2426.
// (B) CANAL FRESCO = recoverFind (fichas de recobro por rematar a un LENTO-DE-RECOBRO — NINGUNA de las 41 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…windFind #99) está LLENA ⇒ moneda FRESCA (h.recoverBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio recoverBountyCap, 0 doble-dip.
//
// ★ recoverProbe LUT (check 5b): recover→banda→weight — prueba el UMBRAL hiRecover(0.8)/midRecover(0.7) (≥0.8⇒sluggish⇒2, ≥0.7⇒lagging⇒1, <0.7⇒nimble⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnRecover empuja un mob REAL del TIPO al MISMO G.enemies; recoverProbeLive lee su peso REAL de ETPL[type].recover.
// ★ ⊥override/#74/champion/élite OVERRIDE (check 7b): spawnRecover{type:'orc',overrideRecover:0.99} escala el CLON e.tpl.recover→0.99; recoverOf lee ETPL['orc'].recover=0.72 BASE ⇒ weight SIGUE 1 pese a clon 0.99. Y golem{overrideRecover:0.1} ⇒ base 0.8 ⇒ weight SIGUE 2 pese a clon 0.1.
// ★ ⊥#99 windup crux (check 8): charger (recover0.9⇒recov2, windup0.66⇒wind1) vs volatile (recover0.1⇒recov0, windup0.7⇒wind1) ⇒ MISMO wind OPUESTO recover (amago ANTES ⊥ recobro DESPUÉS).
// ★ ⊥#98 ram crux (check 8b): charger (recover0.9⇒recov2, knock235⇒ram2) vs golem (recover0.8⇒recov2, knock60⇒ram0) ⇒ MISMO recov OPUESTO ram.
// ★ ⊥#96 tough crux (check 8c): revenant (recover0.55⇒recov0, hp120⇒tough2) vs golem (recover0.8⇒recov2, hp640⇒tough2) ⇒ MISMO tough OPUESTO recover.
// ★ ⊥#95 menace crux (check 8d): summoner (recover0.95⇒recov2, dmg0⇒menace0) vs volatile (recover0.1⇒recov0, dmg23⇒menace2) ⇒ OPUESTO.
// ★ ⊥#94 swift crux (check 8e): bat (recover0.35⇒recov0, spd158⇒swift2) vs golem (recover0.8⇒recov2, spd46⇒swift0) ⇒ DIAMÉTRICAMENTE OPUESTOS (applyZoneScale escala spd NUNCA recover).
// ★ ⊥#92 bulk crux (check 8f): summoner (recover0.95⇒recov2, sz20⇒bulk1) vs skeleton (recover0.55⇒recov0, sz20⇒bulk1) ⇒ MISMO bulk OPUESTO recover.
// ★ ⊥#89 interrupt crux (check 8g): golem idle (recover0.8⇒recov2, e.state idle⇒interrupt0) vs bat idle (recover0.35⇒recov0, interrupt0): MISMO interrupt (0, estado idle) DISTINTO recover (2 vs 0) ⇒ recover lee la CONSTANTE ETPL[type].recover, NO el e.state DINÁMICO.
// ★ DIFERENCIADOR (check 9): un SUMMONER (plúmbeo recover0.95⇒recov2, knock40 leve, dmg0 inerme, spd60 lento, idle prado) ⇒ recover T2 MIENTRAS ram#98=0/menace#95=0/swift#94=0/heading#90=0/zone#91=0.
// ★ CANAL (check 10): forageChargePreview = recoverBonus(score). Summoner (plúmbeo) ⇒ charge>0; bat (ágil) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(recoverBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con RECOVER_SURGE OFF, recoverBonus(cualquier score)==0 y forageChargePreview==0 aun con un summoner disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): recover (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de recover.
// ★ 0-REGRESIÓN (check 14): las 41 mecánicas del arco #59-#99 siguen served enabled:true; RECOVER_SURGE served false (DARK #100).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + recoverProbeLive + recoverProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). recoverScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2594-recover-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2599");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// Tiles REALES por zona (mundo determinista; el mundo se construye igual del mismo seed). Reutilizadas del arco.
const Z = { forest: [192, 723], abyss: [192, 768] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// recoverProbe esperado: recover→banda→weight (UMBRAL hiRecover 0.8 / midRecover 0.7). Cubre los 3 buckets + los bordes exactos.
const EXPECT_RECOVER = [
  { recover: 0.95, band: "sluggish", w: 2 }, { recover: 0.85, band: "sluggish", w: 2 }, { recover: 0.8, band: "sluggish", w: 2 },   // ≥hiRecover(0.8) ⇒ plúmbeo ⇒ 2 (borde 0.8 inclusive)
  { recover: 0.79, band: "lagging", w: 1 }, { recover: 0.75, band: "lagging", w: 1 }, { recover: 0.7, band: "lagging", w: 1 },       // ≥midRecover(0.7) ⇒ rezagado ⇒ 1 (borde 0.7 inclusive, 0.79 justo bajo hiRecover)
  { recover: 0.69, band: "nimble", w: 0 }, { recover: 0.45, band: "nimble", w: 0 }, { recover: 0, band: "nimble", w: 0 },            // <midRecover ⇒ ágil ⇒ 0 (borde 0.69 justo bajo midRecover)
];
// spawnRecover esperado por TIPO: type → base recover → weight. Cubre bandas 0/1/2 con mobs REALES (excluye adv neutral).
const EXPECT_TYPE = [
  { type: "mage", recover: 0.85, w: 2 }, { type: "wraith", recover: 0.8, w: 2 }, { type: "golem", recover: 0.8, w: 2 }, { type: "charger", recover: 0.9, w: 2 }, { type: "summoner", recover: 0.95, w: 2 }, { type: "healer", recover: 0.85, w: 2 }, { type: "wisp", recover: 0.8, w: 2 }, { type: "toadbrute", recover: 0.92, w: 2 }, { type: "bogtyrant", recover: 0.8, w: 2 }, { type: "ashwraith", recover: 0.85, w: 2 }, { type: "thornspitter", recover: 0.8, w: 2 }, { type: "emberkin", recover: 0.82, w: 2 }, { type: "calderatyrant", recover: 0.8, w: 2 },
  { type: "orc", recover: 0.72, w: 1 }, { type: "spearman", recover: 0.75, w: 1 }, { type: "dragon", recover: 0.78, w: 1 }, { type: "moose", recover: 0.7, w: 1 }, { type: "demon", recover: 0.72, w: 1 }, { type: "wendigo", recover: 0.76, w: 1 }, { type: "ironback", recover: 0.74, w: 1 }, { type: "magmabrute", recover: 0.76, w: 1 },
  { type: "wolf", recover: 0.45, w: 0 }, { type: "rat", recover: 0.4, w: 0 }, { type: "skeleton", recover: 0.55, w: 0 }, { type: "bat", recover: 0.35, w: 0 }, { type: "bandit", recover: 0.55, w: 0 }, { type: "volatile", recover: 0.1, w: 0 }, { type: "revenant", recover: 0.55, w: 0 }, { type: "quillback", recover: 0.55, w: 0 }, { type: "mudlurker", recover: 0.55, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.recover && window.__dev.wind && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.interrupt && window.__dev.heading && window.__dev.apex && window.__dev.scarcity && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.recover + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: RECOVER_SURGE.enabled TRUE (served default), pero sin mobs ⇒ score/tier/charge 0 y G.recoverBounty aún no creado (seam de kill)
  const dark = await page.evaluate(() => window.__dev.recover());
  ok("2 LIVE (fresh boot): RECOVER_SURGE.enabled TRUE (served default) AND sin mobs score/tier/charge 0 + gExists false (canal transitorio en seam de kill)",
     dark.enabled === true && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "recoverFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiRecover=${dark.hiRecover} midRecover=${dark.midRecover} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no recoverFind/recoverBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(recoverFind|recoverBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"recoverBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'recoverFind'/'recoverBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.recover({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.recover({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.recover({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ recoverProbe LUT: recover→band→weight (UMBRAL hiRecover/midRecover), type-independiente.
  const rnp = await page.evaluate((cases) => cases.map(c => window.__dev.recover({ recoverProbe: { recover: c.recover } }).recoverProbe), EXPECT_RECOVER);
  const rnpOK = EXPECT_RECOVER.every((c, i) => rnp[i] && rnp[i].band === c.band && rnp[i].weight === c.w);
  ok("5b ★ recoverProbe LUT: recover≥0.8⇒sluggish⇒2; recover≥0.7⇒lagging⇒1; recover<0.7⇒nimble⇒0 (UMBRAL hiRecover/midRecover, bordes 0.8/0.7/0.69 exactos)",
     rnpOK, JSON.stringify(rnp.map(x => ({ r: x.recover, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnRecover pushes a real mob of TYPE to G.enemies; reads recoverWeight from ETPL[type].recover.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.recover({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.recover({ clearRecover: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.recover({ spawnRecover: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRecover;
      const tp = window.__dev.recover({ recoverProbeLive: true }).recoverProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srRecover: sr.recover, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineRecover: mine ? mine.recover : -1 });
    }
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srRecover === c.recover && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineRecover === c.recover && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnRecover empuja un mob REAL del TIPO; recoverProbeLive lee el peso REAL de ETPL[type].recover ⇒ summoner/toadbrute/charger/mage/golem/…⇒2, orc/spearman/dragon/moose/demon/wendigo/ironback/magmabrute⇒1, bat/rat/wolf/skeleton/bandit/volatile/revenant/quillback/mudlurker⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srRecover === EXPECT_TYPE[i].recover && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, rc: x.srRecover, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74/champion/élite OVERRIDE: orc con e.tpl.recover escalado a 0.99 ⇒ recoverOf lee ETPL['orc'].recover=0.72 BASE ⇒ weight SIGUE 1 pese a clon 0.99. golem con override 0.1 ⇒ base 0.8 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.recover({ spawnRecover: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnRecover;
    window.__dev.recover({ clearRecover: true });
    const orcOvr = window.__dev.recover({ spawnRecover: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideRecover: 0.99 } }).spawnRecover;
    const tp1 = window.__dev.recover({ recoverProbeLive: true }).recoverProbeLive;   // lectura REAL: sigue leyendo base ⇒ 1
    window.__dev.recover({ clearRecover: true });
    const goOvr = window.__dev.recover({ spawnRecover: { type: "golem", tx: Z.forest[0], ty: Z.forest[1], overrideRecover: 0.1 } }).spawnRecover;   // clon apagado a 0.1
    const tp2 = window.__dev.recover({ recoverProbeLive: true }).recoverProbeLive;   // sigue leyendo base 0.8 ⇒ 2
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), go2 = tp2.mobs.find(m => m.type === "golem");
    return { orcBaseRecover: orcBase.recover, orcBaseW: orcBase.weight, orcOvrRecover: orcOvr.recover, orcOvrTplRecover: orcOvr.tplRecover, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      goOvrRecover: goOvr.recover, goOvrTplRecover: goOvr.tplRecover, goOvrW: goOvr.weight, tp2W: go2 ? go2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseRecover === 0.72 && ovr.orcBaseW === 1 &&
    ovr.orcOvrRecover === 0.72 && ovr.orcOvrTplRecover === 0.99 && ovr.orcOvrW === 1 && ovr.tp1W === 1 &&   // clon 0.99, BASE 0.72 ⇒ recov 1 (NO salta a 2)
    ovr.goOvrRecover === 0.8 && ovr.goOvrTplRecover === 0.1 && ovr.goOvrW === 2 && ovr.tp2W === 2;          // clon 0.1, BASE 0.8 ⇒ recov 2 (NO cae a 0)
  ok("7b ★ ⊥override/#74/champion/élite OVERRIDE: e.tpl.recover escalado (mimetiza spawn escalado/élite) ⇒ recoverOf lee ETPL[type].recover BASE ⇒ orc SIGUE recov1 (base 0.72 pese a clon 0.99), golem SIGUE recov2 (base 0.8 pese a clon 0.1) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#99 windup crux: charger (recover0.9⇒recov2, windup0.66⇒wind1) vs volatile (recover0.1⇒recov0, windup0.7⇒wind1). MISMO wind OPUESTO recover.
  const crux99 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.wind({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true }); window.__dev.wind({ clearWind: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, wind: window.__dev.wind().score }; };
    const charger = read("charger"), volatile2 = read("volatile");
    window.__dev.recover({ clearRecover: true }); window.__dev.wind({ clearWind: true });
    window.__dev.recover({ enabled: false }); window.__dev.wind({ enabled: false });
    return { charger, volatile2 };
  }, Z);
  const crux99OK = crux99.charger.recover === 2 && crux99.charger.wind === 1 && crux99.volatile2.recover === 0 && crux99.volatile2.wind === 1;
  ok("8 ★ ⊥#99 crux: CHARGER (recover0.9 recov2/windup0.66 wind1) PLÚMBEO-medido vs VOLATILE (recover0.1 recov0/windup0.7 wind1) ÁGIL-medido — MISMO wind (1) OPUESTO recover (2 vs 0) ⇒ amago ANTES ⊥ recobro DESPUÉS (el eje base más reciente)",
     crux99OK, JSON.stringify(crux99));

  // 8b ★ ⊥#98 ram crux: charger (recover0.9⇒recov2, knock235⇒ram2) vs golem (recover0.8⇒recov2, knock60⇒ram0). MISMO recov OPUESTO ram.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true }); window.__dev.ram({ clearRam: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, ram: window.__dev.ram().score }; };
    const charger = read("charger"), golem = read("golem");
    window.__dev.recover({ clearRecover: true }); window.__dev.ram({ clearRam: true });
    window.__dev.recover({ enabled: false }); window.__dev.ram({ enabled: false });
    return { charger, golem };
  }, Z);
  const crux98OK = crux98.charger.recover === 2 && crux98.charger.ram === 2 && crux98.golem.recover === 2 && crux98.golem.ram === 0;
  ok("8b ★ ⊥#98 crux: CHARGER (recover0.9 recov2/knock235 ram2) vs GOLEM (recover0.8 recov2/knock60 ram0) — MISMO recov (2) OPUESTO ram (2 vs 0) ⇒ recobro ⊥ impacto",
     crux98OK, JSON.stringify(crux98));

  // 8c ★ ⊥#96 tough crux: revenant (recover0.55⇒recov0, hp120⇒tough2) vs golem (recover0.8⇒recov2, hp640⇒tough2). MISMO tough OPUESTO recover.
  const crux96 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.tough({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true }); window.__dev.tough({ clearTough: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, tough: window.__dev.tough().score }; };
    const revenant = read("revenant"), golem = read("golem");
    window.__dev.recover({ clearRecover: true }); window.__dev.tough({ clearTough: true });
    window.__dev.recover({ enabled: false }); window.__dev.tough({ enabled: false });
    return { revenant, golem };
  }, Z);
  const crux96OK = crux96.revenant.recover === 0 && crux96.revenant.tough === 2 && crux96.golem.recover === 2 && crux96.golem.tough === 2;
  ok("8c ★ ⊥#96 crux: REVENANT (recover0.55 recov0/hp120 tough2) ÁGIL-COLOSO vs GOLEM (recover0.8 recov2/hp640 tough2) PLÚMBEO-COLOSO — MISMO tough (2) OPUESTO recover (0 vs 2) ⇒ recobro ⊥ durabilidad",
     crux96OK, JSON.stringify(crux96));

  // 8d ★ ⊥#95 menace crux: summoner (recover0.95⇒recov2, dmg0⇒menace0) vs volatile (recover0.1⇒recov0, dmg23⇒menace2). OPUESTO.
  const crux95 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.menace({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true }); window.__dev.menace({ clearMenace: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, menace: window.__dev.menace().score }; };
    const summoner = read("summoner"), volatile2 = read("volatile");
    window.__dev.recover({ clearRecover: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.recover({ enabled: false }); window.__dev.menace({ enabled: false });
    return { summoner, volatile2 };
  }, Z);
  const crux95OK = crux95.summoner.recover === 2 && crux95.summoner.menace === 0 && crux95.volatile2.recover === 0 && crux95.volatile2.menace === 2;
  ok("8d ★ ⊥#95 crux: SUMMONER (recover0.95 recov2/dmg0 menace0) PLÚMBEO-INERME vs VOLATILE (recover0.1 recov0/dmg23 menace2) ÁGIL-PEGADOR — ORDEN OPUESTO (recobro vs daño)",
     crux95OK, JSON.stringify(crux95));

  // 8e ★ ⊥#94 swift crux: bat (recover0.35⇒recov0, spd158⇒swift2) vs golem (recover0.8⇒recov2, spd46⇒swift0). DIAMÉTRICAMENTE OPUESTOS (applyZoneScale escala spd NUNCA recover).
  const crux94 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, swift: window.__dev.swift().score }; };
    const bat = read("bat"), golem = read("golem");
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false }); window.__dev.swift({ enabled: false });
    return { bat, golem };
  }, Z);
  const crux94OK = crux94.bat.recover === 0 && crux94.bat.swift === 2 && crux94.golem.recover === 2 && crux94.golem.swift === 0;
  ok("8e ★ ⊥#94 crux: BAT (recover0.35 recov0/spd158 swift2) ÁGIL-VELOZ vs GOLEM (recover0.8 recov2/spd46 swift0) PLÚMBEO-LENTO — recov alto donde swift cero ⇒ DIAMÉTRICAMENTE OPUESTOS (recobro vs velocidad; applyZoneScale escala spd NUNCA recover ⇒ decoupled por zona)",
     crux94OK, JSON.stringify(crux94));

  // 8f ★ ⊥#92 bulk crux: summoner (recover0.95⇒recov2, sz20⇒bulk1) vs skeleton (recover0.55⇒recov0, sz20⇒bulk1). MISMO bulk OPUESTO recover.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.bulk({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, bulk: window.__dev.bulk().score }; };
    const summoner = read("summoner"), skeleton = read("skeleton");
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { summoner, skeleton };
  }, Z);
  const crux92OK = crux92.summoner.recover === 2 && crux92.summoner.bulk === 1 && crux92.skeleton.recover === 0 && crux92.skeleton.bulk === 1;
  ok("8f ★ ⊥#92 crux: SUMMONER (recover0.95 recov2/sz20 bulk1) PLÚMBEO vs SKELETON (recover0.55 recov0/sz20 bulk1) ÁGIL — MISMO bulk (1) OPUESTO recover (2 vs 0) ⇒ recobro ⊥ tamaño",
     crux92OK, JSON.stringify(crux92));

  // 8g ★ ⊥#89 interrupt crux: golem idle (recover0.8⇒recov2, e.state idle⇒interrupt0) vs bat idle (recover0.35⇒recov0, interrupt0). MISMO interrupt, DISTINTO recover ⇒ recover lee la CONSTANTE ETPL[type].recover, NO el e.state DINÁMICO.
  const crux89 = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.interrupt({ enabled: true });
    const read = (type) => { window.__dev.recover({ clearRecover: true });
      window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.recover({ spawnRecover: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { recover: window.__dev.recover().score, interrupt: window.__dev.interrupt().score }; };
    const golem = read("golem"), bat = read("bat");
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false }); window.__dev.interrupt({ enabled: false });
    return { golem, bat };
  }, Z);
  const crux89OK = crux89.golem.recover === 2 && crux89.bat.recover === 0 && crux89.golem.interrupt === crux89.bat.interrupt;
  ok("8g ★ ⊥#89 crux: GOLEM idle (recover0.8 recov2) vs BAT idle (recover0.35 recov0) — MISMO interrupt (ambos idle, e.state NO ejecuta) pero recover DISTINTO (2 vs 0) ⇒ recover lee la CONSTANTE ETPL[type].recover (RECOBRO ESTÁTICO del TIPO), NO el e.state DINÁMICO (¿ejecuta AHORA?; recover-state ⇒ categoría 0) — DISJUNTOS, NO re-map",
     crux89OK, JSON.stringify(crux89));

  // 9 ★ DIFFERENTIATOR: un SUMMONER (plúmbeo recover0.95⇒recov2, idle point-blank prado) ⇒ recover T2 MIENTRAS ram#98/menace#95/swift#94/heading#90/zona#91 IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true }); window.__dev.ram({ enabled: true }); window.__dev.menace({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.recover();
    const ram = window.__dev.ram().score;                                           // summoner knock40 ⇒ ram0
    const menace = window.__dev.menace().score;                                     // summoner dmg0 ⇒ menace0
    const swift = window.__dev.swift().score;                                        // summoner spd60 ⇒ swift0
    const head = window.__dev.heading().score;                                       // summoner idle ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false }); window.__dev.ram({ enabled: false }); window.__dev.menace({ enabled: false }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, ram, menace, swift, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.ram === 0 && diff.menace === 0 && diff.swift === 0 && diff.head === 0 && diff.zoneScore === 0;
  ok("9 ★ DIFERENCIADOR: SUMMONER (plúmbeo recover0.95, knock40 leve, dmg0 inerme, spd60 lento, idle prado) ⇒ recover T2 MIENTRAS ram#98/menace#95/swift#94/embestida#90/zona#91 IGNORAN (=0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL recoverFind: forageChargePreview summoner (plúmbeo)>0 ; bat (ágil) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });   // summoner ⇒ score 2 ⇒ T2
    const actVm = window.__dev.recover();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ spawnRecover: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 0
    const batVm = window.__dev.recover();
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    return { actPrev, actCharge, batPrev: batVm.forageChargePreview, batTier: batVm.tier, batScore: batVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.batPrev === 0 && forage.batTier === 0 && forage.batScore === 0;
  ok("10 CANAL recoverFind: forageChargePreview con summoner (plúmbeo) ⇒ charge>0 (==recoverBonus); con bat (ágil) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds recoverBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.recover({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.recover().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>recoverBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a summoner available
  const neutral = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });   // summoner disponible
    window.__dev.recover({ enabled: false });                             // now OFF
    const off = window.__dev.recover();
    window.__dev.recover({ enabled: true }); window.__dev.recover({ clearRecover: true }); window.__dev.recover({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, recoverBonus(summoner disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip recover OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de recover.
  const orth = await page.evaluate((Z) => {
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ enabled: false });
    const snap = () => JSON.stringify({ wind: window.__dev.wind(), ram: window.__dev.ram(), sen: window.__dev.sentinel(), tuf: window.__dev.tough(), men: window.__dev.menace(), swf: window.__dev.swift(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.recover({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.recover();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.recover();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD recoverFind ⊥ peers: flip recover OFF→ON NO cambia wind/ram/sentinel/tough/menace/swift/interrupt/heading/zonetier/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de recover; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION LIVE: 42 arc flags served true INCL RECOVER_SURGE (42º flag LIVE); 0 dark
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const recoverLive = flag("RECOVER_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN LIVE: 42 mecanismos del arco #59-#100 served enabled:true INCL RECOVER_SURGE (42º flag LIVE); 0 dark",
     arcAllOn && recoverLive && arc.length === 42, `recover=${flag("RECOVER_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Recobro:" drawn ON+summoner / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Recobro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });   // summoner ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Recobro:\" se DIBUJA ON+summoner (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.recover({ enabled: true }); window.__dev.recover({ clearRecover: true }); window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.recover({ clearRecover: true }); window.__dev.recover({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.recover({ enabled: true });
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.recover({ spawnRecover: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.recover();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.recover({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const rns = [0.95, 0.8, 0.79, 0.7, 0.69, 0.35].map(v => { const q = window.__dev.recover({ recoverProbe: { recover: v } }).recoverProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.recover({ recoverProbeLive: true }).recoverProbeLive;
    const mine = tp.mobs.find(m => m.type === "summoner") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.recover({ clearRecover: true });
    window.__dev.recover({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineRecover: mine ? mine.recover : -1, lut, rns, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineRecover === B.mineRecover && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.rns) === JSON.stringify(B.rns) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO summoner+héroe ⇒ score/tier/charge + recoverProbeLive(score,weight,recover) + recoverProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineRecover:${A.mineRecover},rns:${JSON.stringify(A.rns)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineRecover:${B.mineRecover},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.recover({ enabled: false }));
  await pageB.evaluate(() => window.__dev.recover({ enabled: false }));

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
