// CAS-2600 — self-verify for REMATE DE ACOMETIDA (DARK, LUNGE_SURGE.enabled:false). EVO mecánica #101 (serializa tras #100 RECOVER_SURGE LIVE&served e1d801e51573/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 42 LIVE #59-#100.
// (A) EJE FRESCO = DISTANCIA DE ESTOCADA/POUNCE INTRÍNSECA del mob TYPE server-auth (cuánto se ABALANZA de fábrica su TIPO para cerrar distancia en su lunge de rusher — la px que RECORRE en su salto de acercamiento). Sólo rushers/pouncers cargan `lunge` (bandit132/mudlurker126/wolf118/bat96); los melee-estáticos NO lo tienen (undefined ⇒ 0). server-auth, MMORPG-native (recompensar castigar el salto de acometida largo que aprendiste a leer, no al melee-estático que no salta).
//     PRE-FLIGHT GATE PASA sin pivote: `lunge` es ESCALAR ESTÁTICO por template (config.js:290+, sólo 4 tipos rusher), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 42 flags #59-#100 lo lee como SCORE. El ÚNICO lector de `.lunge`: la máquina de MOVIMIENTO de la IA (`lspd=(e.tpl.lunge||110)/0.2` — velocidad del dash de la estocada especial del rusher; comportamiento). INTERRUPT #89 menciona "special slam/lunge" en comentarios pero lee `e.specialNow`/`e.state`, NUNCA el NÚMERO `.lunge`.
//     CLAVE ⊥override/⊥#74/⊥champion/⊥élite: lungeWeight lee ETPL[e.type].lunge (LUNGE BASE INMUTABLE del TIPO), NO e.tpl.lunge (el CLON) — si un spawn escalado/élite/variante-stalker (lungeMul) sobrescribiera el clon, lungeOf lo IGNORA y lee la fila base ⇒ un bandit campeón SIGUE lunge2 (base 132). applyZoneScale escala hp/dmg/spd/xp pero NUNCA lunge ⇒ acometida INDEPENDIENTE de zona (⊥#94 swift lee spd que SÍ escala por zona; ⊥#91).
//     lungeWeight(e)=banda de lungeOf(e)=ETPL[type].lunge: lunge≥hiLunge(130) ⇒ pouncer ⇒ 2; lunge≥midLunge(110) ⇒ estocada media ⇒ 1; lunge<midLunge (corto/sin lunge) ⇒ 0. El score del kill = lungeWeight(víctima) muestreado en el TOP de killEnemy (_lungePre). La señal VIVA del badge = lungeScore(hero)=MAX lungeWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #100 recobro/#99 amago/#98 impacto/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥42 DISTANCIA DE POUNCE ESTÁTICA: ⊥ #94 SWIFT (crucero/spd — DENTRO de swift2: bat spd158 swift2/lunge96 lunge0 vs wolf spd128 swift2/lunge118 lunge1 MISMO swift OPUESTO lunge; un veloz puede tener salto corto). ⊥ #93 ROLE (arch — los 4 lunge-carriers son arch:"rusher" IDÉNTICO pero lunge ∈{0,1,2}: bat0/wolf1/mudlurker1/bandit2 ⇒ NO re-map de arch, el CRUX MÁS FIRME). ⊥ #100 RECOVER (los 4 son recov0 pero lunge barre 0/1/2; golem recover0.8 recov2/lunge0 vs bandit recover0.55 recov0/lunge2 OPUESTO). ⊥ #99 WINDUP (los 4 son wind0 pero lunge barre 0/1/2; golem windup0.95 wind2/lunge0 vs bandit windup0.5 wind0/lunge2 OPUESTO). ⊥ #98 RAM (KNOCKBACK saliente; moose knock200 ram2/lunge0 vs bandit knock110 ram1/lunge2 ORDEN OPUESTO). ⊥ #92/#96/#95/#97/#89/#84/#91/#90/#88/#87/#86/#85/#74/#73/#78/#72/#2426.
// (B) CANAL FRESCO = lungeFind (fichas de acometida por rematar a un SALTADOR-LARGO — NINGUNA de las 42 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…recoverFind #100) está LLENA ⇒ moneda FRESCA (h.lungeBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio lungeBountyCap, 0 doble-dip.
//
// ★ lungeProbe LUT (check 5b): lunge→banda→weight — prueba el UMBRAL hiLunge(130)/midLunge(110) (≥130⇒pouncer⇒2, ≥110⇒lunger⇒1, <110⇒short⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnLunge empuja un mob REAL del TIPO al MISMO G.enemies; lungeProbeLive lee su peso REAL de ETPL[type].lunge.
// ★ ⊥override/#74/champion/élite OVERRIDE (check 7b): spawnLunge{type:'bandit',overrideLunge:50} apaga el CLON e.tpl.lunge→50; lungeOf lee ETPL['bandit'].lunge=132 BASE ⇒ weight SIGUE 2 pese a clon 50. Y wolf{overrideLunge:200} ⇒ base 118 ⇒ weight SIGUE 1 pese a clon 200.
// ★ ⊥#93 role crux (check 8): bat/wolf/bandit TODOS arch:"rusher" (MISMO role) pero lunge 0/1/2 DISTINTO ⇒ lunge NO es re-map de arch.
// ★ ⊥#94 swift crux (check 8b): bat (lunge96⇒0, spd158⇒swift2) vs wolf (lunge118⇒1, spd128⇒swift2) ⇒ MISMO swift(2) OPUESTO lunge.
// ★ ⊥#100 recover crux (check 8c): bandit (lunge132⇒2, recover0.55⇒recov0) vs golem (lunge0, recover0.8⇒recov2) ⇒ OPUESTO.
// ★ ⊥#99 windup crux (check 8d): bandit (lunge132⇒2, windup0.5⇒wind0) vs golem (lunge0, windup0.95⇒wind2) ⇒ OPUESTO.
// ★ ⊥#98 ram crux (check 8e): moose (lunge0, knock200⇒ram2) vs bandit (lunge132⇒2, knock110⇒ram1) ⇒ ORDEN OPUESTO (impacto SALIENTE ⊥ distancia de acercamiento).
// ★ DIFERENCIADOR (check 9): un BANDIT (pouncer lunge132⇒2) ⇒ lunge T2 MIENTRAS swift#94=1(brisk)/ram#98=1(firm)/windup#99=0/recover#100=0 — el ÚNICO eje donde el bandit alcanza la banda TOP es lunge.
// ★ CANAL (check 10): forageChargePreview = lungeBonus(score). Bandit (pouncer) ⇒ charge>0; golem (sin lunge) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(lungeBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con LUNGE_SURGE OFF, lungeBonus(cualquier score)==0 y forageChargePreview==0 aun con un bandit disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): lunge (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de lunge.
// ★ 0-REGRESIÓN (check 14): las 42 mecánicas del arco #59-#100 siguen served enabled:true; LUNGE_SURGE served false (DARK #101).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + lungeProbeLive + lungeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). lungeScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2600-lunge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2600");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// lungeProbe esperado: lunge→banda→weight (UMBRAL hiLunge 130 / midLunge 110). Cubre los 3 buckets + los bordes exactos.
const EXPECT_LUNGE = [
  { lunge: 132, band: "pouncer", w: 2 }, { lunge: 131, band: "pouncer", w: 2 }, { lunge: 130, band: "pouncer", w: 2 },   // ≥hiLunge(130) ⇒ pouncer ⇒ 2 (borde 130 inclusive)
  { lunge: 129, band: "lunger", w: 1 }, { lunge: 118, band: "lunger", w: 1 }, { lunge: 110, band: "lunger", w: 1 },       // ≥midLunge(110) ⇒ estocada media ⇒ 1 (borde 110 inclusive, 129 justo bajo hiLunge)
  { lunge: 109, band: "short", w: 0 }, { lunge: 96, band: "short", w: 0 }, { lunge: 0, band: "short", w: 0 },             // <midLunge ⇒ corto/sin lunge ⇒ 0 (borde 109 justo bajo midLunge; bat96; sin lunge 0)
];
// spawnLunge esperado por TIPO: type → base lunge → weight. Cubre bandas 0/1/2 con mobs REALES (los 4 rushers con lunge + melee-estáticos sin lunge).
const EXPECT_TYPE = [
  { type: "bandit", lunge: 132, w: 2 },
  { type: "wolf", lunge: 118, w: 1 }, { type: "mudlurker", lunge: 126, w: 1 },
  { type: "bat", lunge: 96, w: 0 },                                    // rusher CON lunge pero corto (96<110) ⇒ 0
  { type: "golem", lunge: 0, w: 0 }, { type: "moose", lunge: 0, w: 0 }, { type: "summoner", lunge: 0, w: 0 }, { type: "skeleton", lunge: 0, w: 0 }, { type: "orc", lunge: 0, w: 0 }, { type: "charger", lunge: 0, w: 0 },   // melee-estáticos SIN lunge ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lunge && window.__dev.recover && window.__dev.wind && window.__dev.ram && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.interrupt && window.__dev.heading && window.__dev.apex && window.__dev.scarcity && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.lunge + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.lunge());
  ok("2 byte-id OFF (fresh boot): LUNGE_SURGE.enabled false AND G.lungeBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "lungeFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiLunge=${dark.hiLunge} midLunge=${dark.midLunge} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no lungeFind/lungeBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(lungeFind|lungeBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"lungeBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'lungeFind'/'lungeBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.lunge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.lunge({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ lungeProbe LUT: lunge→band→weight (UMBRAL hiLunge/midLunge), type-independiente.
  const lnp = await page.evaluate((cases) => cases.map(c => window.__dev.lunge({ lungeProbe: { lunge: c.lunge } }).lungeProbe), EXPECT_LUNGE);
  const lnpOK = EXPECT_LUNGE.every((c, i) => lnp[i] && lnp[i].band === c.band && lnp[i].weight === c.w);
  ok("5b ★ lungeProbe LUT: lunge≥130⇒pouncer⇒2; lunge≥110⇒lunger⇒1; lunge<110⇒short⇒0 (UMBRAL hiLunge/midLunge, bordes 130/110/109 exactos)",
     lnpOK, JSON.stringify(lnp.map(x => ({ l: x.lunge, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnLunge pushes a real mob of TYPE to G.enemies; reads lungeWeight from ETPL[type].lunge.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.lunge({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.lunge({ spawnLunge: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnLunge;
      const tp = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srLunge: sr.lunge, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineLunge: mine ? mine.lunge : -1 });
    }
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srLunge === c.lunge && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineLunge === c.lunge && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnLunge empuja un mob REAL del TIPO; lungeProbeLive lee el peso REAL de ETPL[type].lunge ⇒ bandit132⇒2, wolf118/mudlurker126⇒1, bat96/golem/moose/summoner/skeleton/orc/charger⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srLunge === EXPECT_TYPE[i].lunge && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, ln: x.srLunge, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74/champion/élite OVERRIDE: bandit con e.tpl.lunge apagado a 50 ⇒ lungeOf lee ETPL['bandit'].lunge=132 BASE ⇒ weight SIGUE 2. wolf con override 200 ⇒ base 118 ⇒ weight SIGUE 1.
  const ovr = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const banBase = window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }).spawnLunge;
    window.__dev.lunge({ clearLunge: true });
    const banOvr = window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1], overrideLunge: 50 } }).spawnLunge;
    const tp1 = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;   // lectura REAL: sigue leyendo base ⇒ 2
    window.__dev.lunge({ clearLunge: true });
    const woOvr = window.__dev.lunge({ spawnLunge: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1], overrideLunge: 200 } }).spawnLunge;   // clon subido a 200
    const tp2 = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;   // sigue leyendo base 118 ⇒ 1
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    const ban1 = tp1.mobs.find(m => m.type === "bandit"), wo2 = tp2.mobs.find(m => m.type === "wolf");
    return { banBaseLunge: banBase.lunge, banBaseW: banBase.weight, banOvrLunge: banOvr.lunge, banOvrTplLunge: banOvr.tplLunge, banOvrW: banOvr.weight, tp1W: ban1 ? ban1.weight : -99,
      woOvrLunge: woOvr.lunge, woOvrTplLunge: woOvr.tplLunge, woOvrW: woOvr.weight, tp2W: wo2 ? wo2.weight : -99 };
  }, Z);
  const ovrOK = ovr.banBaseLunge === 132 && ovr.banBaseW === 2 &&
    ovr.banOvrLunge === 132 && ovr.banOvrTplLunge === 50 && ovr.banOvrW === 2 && ovr.tp1W === 2 &&   // clon 50, BASE 132 ⇒ lunge 2 (NO cae a 0)
    ovr.woOvrLunge === 118 && ovr.woOvrTplLunge === 200 && ovr.woOvrW === 1 && ovr.tp2W === 1;        // clon 200, BASE 118 ⇒ lunge 1 (NO salta a 2)
  ok("7b ★ ⊥override/#74/champion/élite OVERRIDE: e.tpl.lunge escalado (mimetiza spawn escalado/élite/variante-stalker) ⇒ lungeOf lee ETPL[type].lunge BASE ⇒ bandit SIGUE lunge2 (base 132 pese a clon 50), wolf SIGUE lunge1 (base 118 pese a clon 200) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#93 role crux: bat/wolf/bandit TODOS arch:"rusher" (MISMO role weight) pero lunge 0/1/2. lunge NO es re-map de arch.
  const crux93 = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.role({ enabled: true });
    const read = (type) => { window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { lunge: window.__dev.lunge().score, role: window.__dev.role().score }; };
    const bat = read("bat"), wolf = read("wolf"), bandit = read("bandit");
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false }); window.__dev.role({ enabled: false });
    return { bat, wolf, bandit };
  }, Z);
  const crux93OK = crux93.bat.lunge === 0 && crux93.wolf.lunge === 1 && crux93.bandit.lunge === 2 &&
    crux93.bat.role === crux93.wolf.role && crux93.wolf.role === crux93.bandit.role;   // rusher ⇒ role 'brawler' banda 0 para los 3 (MISMO role) — lunge barre 0/1/2
  ok("8 ★ ⊥#93 crux: BAT/WOLF/BANDIT TODOS arch:\"rusher\" (MISMO role banda 'brawler'=0) pero lunge DISTINTO (0/1/2) ⇒ lunge NO es re-map de arch — el CRUX MÁS FIRME (mismo rol, la distancia de salto barre las 3 bandas)",
     crux93OK, `${JSON.stringify(crux93)} roleAllEqual=${crux93.bat.role === crux93.wolf.role && crux93.wolf.role === crux93.bandit.role}`);

  // 8b ★ ⊥#94 swift crux: bat (lunge96⇒0, spd158⇒swift2) vs wolf (lunge118⇒1, spd128⇒swift2). MISMO swift OPUESTO lunge.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { lunge: window.__dev.lunge().score, swift: window.__dev.swift().score }; };
    const bat = read("bat"), wolf = read("wolf");
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false }); window.__dev.swift({ enabled: false });
    return { bat, wolf };
  }, Z);
  const crux94OK = crux94.bat.lunge === 0 && crux94.bat.swift === 2 && crux94.wolf.lunge === 1 && crux94.wolf.swift === 2;
  ok("8b ★ ⊥#94 crux: BAT (lunge96 lunge0/spd158 swift2) vs WOLF (lunge118 lunge1/spd128 swift2) — MISMO swift (2) OPUESTO lunge (0 vs 1) ⇒ velocidad de crucero ⊥ distancia de salto (un veloz puede tener salto corto)",
     crux94OK, JSON.stringify(crux94));

  // 8c ★ ⊥#100 recover crux: bandit (lunge132⇒2, recover0.55⇒recov0) vs golem (lunge0, recover0.8⇒recov2). OPUESTO.
  const crux100 = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.recover({ enabled: true });
    const read = (type) => { window.__dev.lunge({ clearLunge: true }); window.__dev.recover({ clearRecover: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { lunge: window.__dev.lunge().score, recover: window.__dev.recover().score }; };
    const bandit = read("bandit"), golem = read("golem");
    window.__dev.lunge({ clearLunge: true }); window.__dev.recover({ clearRecover: true });
    window.__dev.lunge({ enabled: false }); window.__dev.recover({ enabled: false });
    return { bandit, golem };
  }, Z);
  const crux100OK = crux100.bandit.lunge === 2 && crux100.bandit.recover === 0 && crux100.golem.lunge === 0 && crux100.golem.recover === 2;
  ok("8c ★ ⊥#100 crux: BANDIT (lunge132 lunge2/recover0.55 recov0) POUNCER-ÁGIL vs GOLEM (sin lunge lunge0/recover0.8 recov2) SIN-SALTO-PLÚMBEO — OPUESTO (distancia de salto ⊥ ventana de recobro)",
     crux100OK, JSON.stringify(crux100));

  // 8d ★ ⊥#99 windup crux: bandit (lunge132⇒2, windup0.5⇒wind0) vs golem (lunge0, windup0.95⇒wind2). OPUESTO.
  const crux99 = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.wind({ enabled: true });
    const read = (type) => { window.__dev.lunge({ clearLunge: true }); window.__dev.wind({ clearWind: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { lunge: window.__dev.lunge().score, wind: window.__dev.wind().score }; };
    const bandit = read("bandit"), golem = read("golem");
    window.__dev.lunge({ clearLunge: true }); window.__dev.wind({ clearWind: true });
    window.__dev.lunge({ enabled: false }); window.__dev.wind({ enabled: false });
    return { bandit, golem };
  }, Z);
  const crux99OK = crux99.bandit.lunge === 2 && crux99.bandit.wind === 0 && crux99.golem.lunge === 0 && crux99.golem.wind === 2;
  ok("8d ★ ⊥#99 crux: BANDIT (lunge132 lunge2/windup0.5 wind0 SNAPPY) vs GOLEM (sin lunge lunge0/windup0.95 wind2 DELIBERATE) — OPUESTO (distancia de salto ⊥ tiempo de presagio)",
     crux99OK, JSON.stringify(crux99));

  // 8e ★ ⊥#98 ram crux: moose (lunge0, knock200⇒ram2) vs bandit (lunge132⇒2, knock110⇒ram1). ORDEN OPUESTO.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.lunge({ clearLunge: true }); window.__dev.ram({ clearRam: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { lunge: window.__dev.lunge().score, ram: window.__dev.ram().score }; };
    const moose = read("moose"), bandit = read("bandit");
    window.__dev.lunge({ clearLunge: true }); window.__dev.ram({ clearRam: true });
    window.__dev.lunge({ enabled: false }); window.__dev.ram({ enabled: false });
    return { moose, bandit };
  }, Z);
  const crux98OK = crux98.moose.lunge === 0 && crux98.moose.ram === 2 && crux98.bandit.lunge === 2 && crux98.bandit.ram === 1;
  ok("8e ★ ⊥#98 crux: MOOSE (sin lunge lunge0/knock200 ram2 ARIETE) vs BANDIT (lunge132 lunge2/knock110 ram1 firme) — ORDEN OPUESTO ⇒ impacto SALIENTE ⊥ distancia de acercamiento",
     crux98OK, JSON.stringify(crux98));

  // 9 ★ DIFFERENTIATOR: un BANDIT (pouncer lunge132⇒lunge2) ⇒ lunge T2 MIENTRAS swift#94=1(brisk)/ram#98=1(firm)/windup#99=0/recover#100=0 — el ÚNICO eje donde el bandit alcanza la banda TOP es lunge.
  const diff = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.swift({ enabled: true }); window.__dev.ram({ enabled: true }); window.__dev.wind({ enabled: true }); window.__dev.recover({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.lunge();
    const swift = window.__dev.swift().score;                                        // bandit spd106 ⇒ swift1 (brisk)
    const ram = window.__dev.ram().score;                                           // bandit knock110 ⇒ ram1 (firm)
    const wind = window.__dev.wind().score;                                          // bandit windup0.5 ⇒ wind0 (snappy)
    const recover = window.__dev.recover().score;                                    // bandit recover0.55 ⇒ recov0 (nimble)
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false }); window.__dev.swift({ enabled: false }); window.__dev.ram({ enabled: false }); window.__dev.wind({ enabled: false }); window.__dev.recover({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, swift, ram, wind, recover };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.swift === 1 && diff.ram === 1 && diff.wind === 0 && diff.recover === 0;
  ok("9 ★ DIFERENCIADOR: BANDIT (pouncer lunge132) ⇒ lunge T2 MIENTRAS swift#94=1(brisk)/ram#98=1(firm)/windup#99=0/recover#100=0 — el ÚNICO eje donde el bandit alcanza la banda TOP (2) es lunge",
     diffOK, JSON.stringify(diff));

  // 10 CANAL lungeFind: forageChargePreview bandit (pouncer)>0 ; golem (sin lunge) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit ⇒ score 2 ⇒ T2
    const actVm = window.__dev.lunge();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ spawnLunge: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem ⇒ score 0
    const goVm = window.__dev.lunge();
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL lungeFind: forageChargePreview con bandit (pouncer) ⇒ charge>0 (==lungeBonus); con golem (sin lunge) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds lungeBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.lunge({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.lunge().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>lungeBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a bandit available
  const neutral = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit disponible
    window.__dev.lunge({ enabled: false });                             // now OFF
    const off = window.__dev.lunge();
    window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, lungeBonus(bandit disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip lunge OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de lunge.
  const orth = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ enabled: false });
    const snap = () => JSON.stringify({ rec: window.__dev.recover(), wind: window.__dev.wind(), ram: window.__dev.ram(), swf: window.__dev.swift(), rol: window.__dev.role(), men: window.__dev.menace(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.lunge({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.lunge();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.lunge();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD lungeFind ⊥ peers: flip lunge OFF→ON NO cambia recover/wind/ram/swift/role/menace/interrupt/heading/zonetier/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de lunge; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 42 arc flags served true; LUNGE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const lungeDark = flag("LUNGE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 42 mecanismos del arco #59-#100 served enabled:true; LUNGE_SURGE served false (DARK #101)",
     arcAllOn && lungeDark && arc.length === 42, `lunge=${flag("LUNGE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Acometida:" drawn ON+bandit / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Acometida:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Acometida:\" se DIBUJA ON+bandit (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false }); });

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
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.lunge();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.lunge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const lns = [132, 130, 129, 110, 109, 96].map(v => { const q = window.__dev.lunge({ lungeProbe: { lunge: v } }).lungeProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
    const mine = tp.mobs.find(m => m.type === "bandit") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineLunge: mine ? mine.lunge : -1, lut, lns, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineLunge === B.mineLunge && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.lns) === JSON.stringify(B.lns) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO bandit+héroe ⇒ score/tier/charge + lungeProbeLive(score,weight,lunge) + lungeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineLunge:${A.mineLunge},lns:${JSON.stringify(A.lns)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineLunge:${B.mineLunge},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.lunge({ enabled: false }));

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
