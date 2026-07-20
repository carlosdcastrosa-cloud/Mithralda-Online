// CAS-2625 — POST-FLIP LIVE QA for REMATE DE ESTALLIDO (LIVE, SPLASH_SURGE.enabled:TRUE — 46º flag @fbdb24b, served 7cf773339112/815). LIVE port of GE DARK cas2620-splash-selfverify: check2 flipped enabled:false→true (STATELESS gExists false: blastBounty transient, 100% derived) + check14 flipped splashDark→splashLive (SPLASH served true, n=46). All other checks byte-identical (local==LIVE proven by served config.js sha256==HEAD blob b687121c).
// (A) EJE FRESCO = RADIO DE ATAQUE DE ÁREA/SALPICADURA INTRÍNSECO del mob TYPE server-auth (cuán ANCHO es el golpe de área/ground-slam que carga su TIPO: ETPL[type].aoe). Presente EXCLUSIVAMENTE en 4 templates brute (orc:60/ironback:64/magmabrute:66/moose:68), ausente en TODOS los demás (config.js:288+). server-auth, MMORPG-native (recompensar cazar al brutón de estallido ancho cuyo golpe de área aprendiste a leer).
//     PRE-FLIGHT GATE PASA sin pivote del EJE ni del NOMBRE: `aoe` es un ESCALAR ESTÁTICO por template (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG) y NINGUNA de las 45 flags #59-#103 lo lee como SCORE. Los ÚNICOS lectores de ETPL[type].aoe: la máquina de COMBATE del mob (radio geométrico del golpe de área al atacar — comportamiento, NO puntúa banda) y los probes dev. OJO: `aoe` TAMBIÉN aparece en la habilidad de clase `fireball` (aoe48) y el ítem `firebomb` (aoe26) — NINGUNO es ETPL[type].aoe (splashWeight lee ETPL[e.type].aoe del TIPO del mob VÍCTIMA).
//     CRUX ⊥#93 ROLE: los 4 portadores de aoe son TODOS arch:"brute" (misma CATEGORÍA) PERO orc(aoe60)/ironback(aoe64) mid(w1) vs moose(aoe68)/magmabrute(aoe66) wide(w2) ⇒ SPLASH sub-divide la categoría brute que #93 trata como UN peso (mismo patrón #101 LUNGE).
//     CRUX ⊥#98 RAM: aoe = RADIO de salpicadura (geometría) vs knock = FUERZA de empuje (impulso). Par divergente: moose knock200/aoe68(wide) vs ironback knock200/aoe64(mid) ⇒ MISMO knock DISTINTA banda splash ⇒ ⊥#98 PROBADO.
//     CRUX ⊥#96 TOUGH / ⊥#103 GOLD: la banda 0 (sin aoe) ABARCA todo el rango hp(10..820) y gold(4..170) — jefe golem hp640/gold90 aoe0 banda0 vs orc hp96/gold20 aoe60 banda1 ⇒ MÁS hp/oro MENOR banda splash ⇒ NO co-monótono ⇒ ⊥#96/⊥#103 PROBADO.
//     CLAVE ⊥override/⊥#74/⊥afijo: aoeOf lee ETPL[e.type].aoe BASE, NO e.tpl.aoe (el CLON) — si un spawn afijado MUTARA el clon, aoeOf lo IGNORA y lee la fila base. applyZoneScale escala hp/dmg/spd/xp pero NUNCA aoe ⇒ área INDEPENDIENTE de zona (⊥#91).
//     splashWeight(e)=banda de aoeOf(e)=ETPL[type].aoe: aoe≥hiAoe(66) ⇒ wide ⇒ 2; aoe≥midAoe(60) ⇒ mid ⇒ 1; aoe<midAoe ⇒ 0. El score del kill = splashWeight(víctima) muestreado en el TOP de killEnemy (_splashPre). La señal VIVA del badge = splashScore(hero)=MAX splashWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #103 bolsa/#102 pertrecho/#101 acometida/#98 impacto/#93 rol/#92 mole).
// (B) CANAL FRESCO = splashFind (fichas de estallido por rematar a un brutón de ÁREA ANCHA — NINGUNA de las 45 flags lo usa; ⊥ coinFind #103/gearFind #102/goldFind #60/essenceFind #72). Moneda FRESCA (h.blastBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio blastBountyCap, 0 doble-dip.
//
// ★ aoeProbe LUT (check 5b): aoe→banda→weight — prueba el UMBRAL hiAoe(66)/midAoe(60), type-independiente (bordes 66/60/59 exactos).
// ★ REAL SERVER-AUTH (check 7): spawnSplash empuja un mob REAL del TIPO al MISMO G.enemies; splashProbeLive lee su peso REAL de ETPL[type].aoe.
// ★ ⊥override/#74 OVERRIDE (check 7b): spawnSplash{type:'orc',overrideAoe:99} sube el CLON e.tpl.aoe=99; aoeOf lee ETPL['orc'].aoe=60 BASE ⇒ weight SIGUE 1. Y bat{overrideAoe:99} ⇒ base 0 ⇒ weight SIGUE 0.
// ★ ⊥#98 RAM crux (check 8): moose (aoe68 wide w2, knock200⇒ram X) vs ironback (aoe64 mid w1, knock200⇒ram X) ⇒ MISMO knock (mismo ram) DISTINTA banda splash.
// ★ ⊥#93 ROLE crux (check 8b): orc (aoe60 mid w1, brute) vs moose (aoe68 wide w2, brute) ⇒ MISMO role (brute) DISTINTA banda splash.
// ★ ⊥#103 GOLD crux (check 8c): golem (gold90 opulent gold2, aoe0 splash0) vs moose (gold24 opulent gold2, aoe68 splash2) ⇒ MISMA banda gold (2) DISTINTA banda splash (0 vs 2).
// ★ ⊥#84 ESCARAMUZA crux (check 8d): mage (ranged, aoe0 splash0) y wolf (melee, aoe0 splash0) comparten la banda 0 mientras orc (melee, aoe60 splash1) es splash1 ⇒ la banda 0 mezcla ranged+melee ⇒ aoe ⊥ binario melee/ranged.
// ★ DIFERENCIADOR ⊥#96 (check 9): GOLEM (hp640 tough2, aoe0 splash0) vs MAGMABRUTE (hp132, aoe66 splash2) ⇒ el más TOUGH (golem) tiene splash0 y el splash-más-ancho (magmabrute) NO es el más tough ⇒ MÁS hp MENOR banda splash.
// ★ CANAL (check 10): forageChargePreview = blastBonus(score). Moose (wide) ⇒ charge>0; bat (point) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(blastBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con SPLASH_SURGE OFF, blastBonus(cualquier score)==0 y forageChargePreview==0 aun con un moose disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): splash (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de splash.
// ★ 0-REGRESIÓN (check 14): las 45 mecánicas del arco #59-#103 siguen served enabled:true; SPLASH_SURGE served false (DARK #104).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + splashProbeLive + aoeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). splashScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2625-splash-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2625-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 395;
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// aoeProbe esperado: aoe→banda→weight (UMBRAL hiAoe 66 / midAoe 60). Cubre los 3 buckets + los bordes exactos.
const EXPECT_AOE = [
  { a: 68, band: "wide", w: 2 }, { a: 66, band: "wide", w: 2 },                    // ≥hiAoe(66) ⇒ wide ⇒ 2 (borde 66 inclusive)
  { a: 65, band: "mid", w: 1 }, { a: 64, band: "mid", w: 1 }, { a: 60, band: "mid", w: 1 },   // ≥midAoe(60) ⇒ mid ⇒ 1 (borde 60 inclusive; 65 justo bajo hiAoe)
  { a: 59, band: "point", w: 0 }, { a: 48, band: "point", w: 0 }, { a: 0, band: "point", w: 0 },   // <midAoe ⇒ point ⇒ 0 (borde 59 justo bajo midAoe; aoe48=habilidad NO ETPL; 0=sin área)
];
// spawnSplash esperado por TIPO: type → base aoe → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "moose", a: 68, w: 2 }, { type: "magmabrute", a: 66, w: 2 },            // wide/estallido-ancho ⇒ 2
  { type: "orc", a: 60, w: 1 }, { type: "ironback", a: 64, w: 1 },                // medio ⇒ 1
  { type: "bat", a: 0, w: 0 }, { type: "wolf", a: 0, w: 0 }, { type: "rat", a: 0, w: 0 }, { type: "skeleton", a: 0, w: 0 }, { type: "golem", a: 0, w: 0 }, { type: "demon", a: 0, w: 0 },   // sin-área ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.splash && window.__dev.gold && window.__dev.gearchance && window.__dev.ram && window.__dev.role && window.__dev.tough && window.__dev.swift && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.splash + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: SPLASH_SURGE.enabled TRUE (46º flag LIVE); estado STATELESS (gExists false: blastBounty transitorio, 100% derivado)
  const dark = await page.evaluate(() => window.__dev.splash());
  ok("2 LIVE (fresh boot): SPLASH_SURGE.enabled TRUE (46º flag LIVE) AND estado STATELESS (gExists false: blastBounty transitorio, derivado)",
     dark.enabled === true && dark.gExists === false && dark.channel === "splashFind",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiAoe=${dark.hiAoe} midAoe=${dark.midAoe} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no splashFind/blastBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(splashFind|blastBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"blastBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'splashFind'/'blastBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.splash({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.splash({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.splash({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ aoeProbe LUT: aoe→band→weight (UMBRAL hiAoe/midAoe), type-independiente.
  const arp = await page.evaluate((cases) => cases.map(c => window.__dev.splash({ aoeProbe: { aoe: c.a } }).aoeProbe), EXPECT_AOE);
  const arpOK = EXPECT_AOE.every((c, i) => arp[i] && arp[i].band === c.band && arp[i].weight === c.w);
  ok("5b ★ aoeProbe LUT: aoe≥66⇒wide⇒2; ≥60⇒mid⇒1; <60⇒point⇒0 (UMBRAL hiAoe/midAoe, bordes 66/60/59 exactos)",
     arpOK, JSON.stringify(arp.map(x => ({ a: x.aoe, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnSplash pushes a real mob of TYPE to G.enemies; reads splashWeight from ETPL[type].aoe.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.splash({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.splash({ clearSplash: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.splash({ spawnSplash: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSplash;
      const tp = window.__dev.splash({ splashProbeLive: true }).splashProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srAoe: sr.aoe, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineAoe: mine ? mine.aoe : -1 });
    }
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srAoe === c.a && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineAoe === c.a && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnSplash empuja un mob REAL del TIPO; splashProbeLive lee el peso REAL de ETPL[type].aoe ⇒ moose68/magmabrute66⇒2, orc60/ironback64⇒1, bat/wolf/rat/skeleton/golem/demon(sin aoe)⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srAoe === EXPECT_TYPE[i].a && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, a: x.srAoe, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74 OVERRIDE: orc con e.tpl.aoe subido a 99 ⇒ aoeOf lee ETPL['orc'].aoe=60 BASE ⇒ weight SIGUE 1. bat con override 99 ⇒ base 0 ⇒ weight SIGUE 0.
  const ovr = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.splash({ spawnSplash: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnSplash;
    window.__dev.splash({ clearSplash: true });
    const orcOvr = window.__dev.splash({ spawnSplash: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideAoe: 99 } }).spawnSplash;
    const tp1 = window.__dev.splash({ splashProbeLive: true }).splashProbeLive;   // lectura REAL: sigue leyendo base ⇒ 1
    window.__dev.splash({ clearSplash: true });
    const batOvr = window.__dev.splash({ spawnSplash: { type: "bat", tx: Z.forest[0], ty: Z.forest[1], overrideAoe: 99 } }).spawnSplash;   // clon subido a 99
    const tp2 = window.__dev.splash({ splashProbeLive: true }).splashProbeLive;   // sigue leyendo base 0 ⇒ 0
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), bat2 = tp2.mobs.find(m => m.type === "bat");
    return { orcBaseAoe: orcBase.aoe, orcBaseW: orcBase.weight, orcOvrAoe: orcOvr.aoe, orcOvrTplAoe: orcOvr.tplAoe, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      batOvrAoe: batOvr.aoe, batOvrTplAoe: batOvr.tplAoe, batOvrW: batOvr.weight, tp2W: bat2 ? bat2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseAoe === 60 && ovr.orcBaseW === 1 &&
    ovr.orcOvrAoe === 60 && ovr.orcOvrTplAoe === 99 && ovr.orcOvrW === 1 && ovr.tp1W === 1 &&   // clon 99, BASE 60 ⇒ splash 1 (NO salta a 2)
    ovr.batOvrAoe === 0 && ovr.batOvrTplAoe === 99 && ovr.batOvrW === 0 && ovr.tp2W === 0;        // clon 99, BASE 0 ⇒ splash 0 (NO salta a 2)
  ok("7b ★ ⊥override/#74 OVERRIDE: e.tpl.aoe escalado (mimetiza afijo) ⇒ aoeOf lee ETPL[type].aoe BASE ⇒ orc SIGUE mid w1 (base 60 pese a clon 99), bat SIGUE point w0 (base 0 pese a clon 99) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#98 RAM crux: moose (aoe68 wide w2, knock200⇒ram X) vs ironback (aoe64 mid w1, knock200⇒ram X). MISMO knock (mismo ram) DISTINTA banda splash.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.splash({ clearSplash: true }); window.__dev.ram({ clearRam: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { splash: window.__dev.splash().score, ram: window.__dev.ram().score }; };
    const moose = read("moose"), ironback = read("ironback");
    window.__dev.splash({ clearSplash: true }); window.__dev.ram({ clearRam: true });
    window.__dev.splash({ enabled: false }); window.__dev.ram({ enabled: false });
    return { moose, ironback };
  }, Z);
  const crux98OK = crux98.moose.splash === 2 && crux98.ironback.splash === 1 && crux98.moose.ram === crux98.ironback.ram;
  ok("8 ★ ⊥#98 crux: MOOSE (aoe68 wide w2/knock200) vs IRONBACK (aoe64 mid w1/knock200) — MISMO knock (mismo ram) DISTINTA banda splash (2 vs 1) ⇒ radio de área ⊥ fuerza de impacto",
     crux98OK, JSON.stringify(crux98));

  // 8b ★ ⊥#93 ROLE crux: orc (aoe60 mid w1, brute) vs moose (aoe68 wide w2, brute). MISMO role (brute) DISTINTA banda splash.
  const crux93 = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true }); window.__dev.role({ enabled: true });
    const read = (type) => { window.__dev.splash({ clearSplash: true }); window.__dev.role({ clearRole: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.role({ spawnRole: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { splash: window.__dev.splash().score, role: window.__dev.role().score }; };
    const orc = read("orc"), moose = read("moose");
    window.__dev.splash({ clearSplash: true }); window.__dev.role({ clearRole: true });
    window.__dev.splash({ enabled: false }); window.__dev.role({ enabled: false });
    return { orc, moose };
  }, Z);
  const crux93OK = crux93.orc.splash === 1 && crux93.moose.splash === 2 && crux93.orc.role === crux93.moose.role;
  ok("8b ★ ⊥#93 crux: ORC (aoe60 mid w1, brute) vs MOOSE (aoe68 wide w2, brute) — MISMO role (brute, roleScore igual) DISTINTA banda splash (1 vs 2) ⇒ SPLASH sub-divide la categoría brute que #93 trata como UN peso",
     crux93OK, JSON.stringify(crux93));

  // 8c ★ ⊥#103 GOLD crux: golem (gold90 opulent gold2, aoe0 splash0) vs moose (gold24 opulent gold2, aoe68 splash2). MISMA banda gold DISTINTA banda splash.
  const crux103 = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true }); window.__dev.gold({ enabled: true });
    const read = (type) => { window.__dev.splash({ clearSplash: true }); window.__dev.gold({ clearGold: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gold({ spawnGold: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { splash: window.__dev.splash().score, gold: window.__dev.gold().score }; };
    const golem = read("golem"), moose = read("moose");
    window.__dev.splash({ clearSplash: true }); window.__dev.gold({ clearGold: true });
    window.__dev.splash({ enabled: false }); window.__dev.gold({ enabled: false });
    return { golem, moose };
  }, Z);
  const crux103OK = crux103.golem.gold === 2 && crux103.moose.gold === 2 && crux103.golem.splash === 0 && crux103.moose.splash === 2;
  ok("8c ★ ⊥#103 crux: GOLEM (gold90 opulent gold2/aoe0 splash0) vs MOOSE (gold24 opulent gold2/aoe68 splash2) — MISMA banda gold (2) DISTINTA banda splash (0 vs 2) ⇒ magnitud de oro ⊥ radio de área",
     crux103OK, JSON.stringify(crux103));

  // 8d ★ ⊥#84 ESCARAMUZA/ranged crux: mage (ranged, aoe0 splash0) & wolf (melee, aoe0 splash0) comparten banda 0 mientras orc (melee, aoe60 splash1) es splash1 ⇒ banda 0 mezcla ranged+melee.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true });
    const read = (type) => { window.__dev.splash({ clearSplash: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.splash().score; };
    const mage = read("mage"), wolf = read("wolf"), orc = read("orc");
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    return { mage, wolf, orc };
  }, Z);
  const crux84OK = crux84.mage === 0 && crux84.wolf === 0 && crux84.orc === 1;
  ok("8d ★ ⊥#84 crux: MAGE (ranged, aoe0 splash0) y WOLF (melee, aoe0 splash0) MISMA banda 0 mientras ORC (melee, aoe60 splash1) ⇒ la banda 0 mezcla ranged+melee ⇒ aoe ⊥ binario melee/ranged (⊥ range/projspd que co-varían con la clase)",
     crux84OK, JSON.stringify(crux84));

  // 9 ★ DIFERENCIADOR ⊥#96 TOUGH: golem (hp640 tough2, aoe0 splash0) vs magmabrute (hp132, aoe66 splash2). Más TOUGH ⇒ MENOR splash.
  const diff = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true }); window.__dev.tough({ enabled: true });
    const read = (type) => { window.__dev.splash({ clearSplash: true }); window.__dev.tough({ clearTough: true });
      window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { splash: window.__dev.splash().score, tough: window.__dev.tough().score }; };
    const golem = read("golem"), magmabrute = read("magmabrute");
    window.__dev.splash({ clearSplash: true }); window.__dev.tough({ clearTough: true });
    window.__dev.splash({ enabled: false }); window.__dev.tough({ enabled: false });
    return { golem, magmabrute };
  }, Z);
  const diffOK = diff.golem.splash === 0 && diff.magmabrute.splash === 2 && diff.golem.tough >= diff.magmabrute.tough;
  ok("9 ★ DIFERENCIADOR ⊥#96: GOLEM (hp640 tough≥magmabrute/aoe0 splash0) vs MAGMABRUTE (hp132/aoe66 splash2) — el más tough (golem) tiene splash0 y el splash-más-ancho (magmabrute) NO es el más tough ⇒ MÁS hp MENOR banda splash",
     diffOK, JSON.stringify(diff));

  // 10 CANAL splashFind: forageChargePreview moose (wide)>0 ; bat (point) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose ⇒ score 2 ⇒ T2
    const actVm = window.__dev.splash();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ spawnSplash: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 0
    const goVm = window.__dev.splash();
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL splashFind: forageChargePreview con moose (wide) ⇒ charge>0 (==blastBonus); con bat (point) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds blastBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.splash({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.splash().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>blastBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a moose available
  const neutral = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose disponible
    window.__dev.splash({ enabled: false });                             // now OFF
    const off = window.__dev.splash();
    window.__dev.splash({ enabled: true }); window.__dev.splash({ clearSplash: true }); window.__dev.splash({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, blastBonus(moose disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip splash OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de splash.
  const orth = await page.evaluate((Z) => {
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ enabled: false });
    const snap = () => JSON.stringify({ gld: window.__dev.gold(), gc: window.__dev.gearchance(), ram: window.__dev.ram(), rol: window.__dev.role(), tgh: window.__dev.tough(), swf: window.__dev.swift(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.splash({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.splash();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.splash();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD splashFind ⊥ peers: flip splash OFF→ON NO cambia gold/gearchance/ram/role/tough/swift/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de splash; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 45 arc flags served true; SPLASH_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const splashLive = flag("SPLASH_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 45 mecanismos del arco #59-#103 served enabled:true; SPLASH_SURGE served TRUE (LIVE #104, 46º flag)",
     arcAllOn && splashLive && arc.length === 45, `splash=${flag("SPLASH_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Estallido:" drawn ON+moose / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Estallido:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });   // moose ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Estallido:\" se DIBUJA ON+moose (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.splash({ enabled: true }); window.__dev.splash({ clearSplash: true }); window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.splash({ clearSplash: true }); window.__dev.splash({ enabled: false }); });

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
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG } = args;
    window.__dev.splash({ enabled: true });
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.splash({ spawnSplash: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.splash();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.splash({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const ars = [68, 66, 64, 60, 59, 0].map(v => { const q = window.__dev.splash({ aoeProbe: { aoe: v } }).aoeProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.splash({ splashProbeLive: true }).splashProbeLive;
    const mine = tp.mobs.find(m => m.type === "moose") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.splash({ clearSplash: true });
    window.__dev.splash({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineAoe: mine ? mine.aoe : -1, lut, ars, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineAoe === B.mineAoe && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.ars) === JSON.stringify(B.ars) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO moose+héroe ⇒ score/tier/charge + splashProbeLive(score,weight,aoe) + aoeProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineAoe:${A.mineAoe},ars:${JSON.stringify(A.ars)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineAoe:${B.mineAoe},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.splash({ enabled: false }));
  await pageB.evaluate(() => window.__dev.splash({ enabled: false }));

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
