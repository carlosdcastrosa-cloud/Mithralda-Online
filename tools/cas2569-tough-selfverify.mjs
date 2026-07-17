// CAS-2569 — self-verify for REMATE DE COLOSO (DARK, TOUGH_SURGE.enabled:false). EVO mecánica #96 (serializa tras #95 MENACE_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 37 LIVE #59-#95.
// (A) EJE FRESCO = AGUANTE/MAX-HP BASE del mob TYPE server-auth (la DURABILIDAD INTRÍNSECA: cuánto castigo AGUANTA su TIPO de fábrica — un coloso como golem640/dragón820/alce150/charger140 que soaka una barbaridad vs un firme mago56/bandido60/esqueleto52 o un frágil rata20/murciélago16/lobo34/lancero42). server-auth, MMORPG-native (recompensar abatir al coloso que aguanta el castigo, no al de cristal).
//     PRE-FLIGHT GATE (recomendado issue = AGUANTE/MAX-HP BASE ETPL[type].hp) → PASA sin pivote: `hp` es ESCALAR ENTERO ESTÁTICO por template (config.js:290+, 16..1020), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 37 flags #59-#95 lo lee como SCORE de recompensa. El ÚNICO `*Weight` que toca vida es bloodWeight #86 SIEGA que lee la FRACCIÓN DINÁMICA e.hp/e.maxHp (mob YA herido), NO la fila base estática ETPL[type].hp. Los demás lectores de `.hp`/`e.tpl.hp`: spawn/jefe/campeón init e.hp=e.maxHp=e.tpl.hp, escala de campeón base.hp*hpMul sobre el CLON, probes de debug — jamás recompensa de kill.
//     CLAVE ⊥#86/⊥#74/⊥champion/⊥zona: toughWeight lee ETPL[e.type].hp (AGUANTE/MAX-HP BASE INMUTABLE del TIPO), NO e.hp (vida VIVA/herida) ni e.maxHp/e.tpl.hp — la herida acumulada, el afijo A.hpMul, el campeón C.hpMul y la zona z.hpMul escalan el CLON/entidad viva pero JAMÁS la fila base ⇒ aguante DESACOPLADO por construcción (golem al 5% de vida SIGUE tough2 leyendo base 640; lobo 'Feroz' con clon inflado SIGUE tough0).
//     toughWeight(e)=banda de toughOf(e)=ETPL[type].hp: hp≥hiHp(110) ⇒ coloso ⇒ 2; hp≥midHp(46) ⇒ firme ⇒ 1; hp<midHp ⇒ frágil ⇒ 0. El score del kill = toughWeight(víctima) muestreado en el TOP de killEnemy (_toughPre). La señal VIVA del badge = toughScore(hero)=MAX toughWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #95 daño/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥37 AGUANTE/MAX-HP BASE ESTÁTICO: ⊥ #86 SIEGA (FRACCIÓN DE VIDA DINÁMICA e.hp/e.maxHp [mob herido] — golem plena-vida tough2/siege0 vs rata al 5% tough0/siege2 DISJUNTOS; el eje MÁS afín, decoupled por base-vs-fracción). ⊥ #95 MENACE (DAÑO BASE ETPL[type].dmg — volátil hp26 tough0/dmg23 menace2 CRISTAL pero PEGADOR vs wendigo hp118 tough2/dmg21 menace1 vs orco hp96 tough1/dmg24 menace2: orco tough1/menace2 y wendigo tough2/menace1 ORDEN OPUESTO). ⊥ #94 SWIFT (VELOCIDAD ETPL[type].spd — golem spd46 swift0/hp640 tough2 LENTO-TANQUE vs murciélago spd158 swift2/hp16 tough0 VELOZ-CRISTAL OPUESTOS). ⊥ #92 BULK (TAMAÑO ETPL[type].size — revenant sz20 bulk1/hp120 tough2 MENUDO pero DURO vs emberkin sz24 bulk2/hp58 tough1 GRANDE pero BLANDO OPUESTOS). ⊥ #93 ROLE (arch — invocador enabler(rol2)/hp46 tough1 vs orco brute(rol0)/hp96 tough1 MISMO tough distinto rol). ⊥ #91/#90/#89/#88/#87/#85/#84/#74/#73/#78/#72 y valor(xp).
// (B) CANAL FRESCO = toughFind (fichas de aguante por rematar a un COLOSO — NINGUNA de las 37 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…menaceFind #95) está LLENA ⇒ moneda FRESCA (h.toughBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio toughBountyCap, 0 doble-dip.
//
// ★ hpProbe LUT (check 5b): hp→banda→weight — prueba el UMBRAL hiHp(110)/midHp(46) (≥110⇒tank⇒2, ≥46⇒sturdy⇒1, <46⇒fragile⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnTough empuja un mob REAL del TIPO al MISMO G.enemies; toughProbe lee su peso REAL de ETPL[type].hp ⇒ golem/dragon/moose/charger/revenant/demon/wendigo/toadbrute/ironback/magmabrute⇒2, orc/bandit/mudlurker/mage/skeleton/wraith/summoner/healer⇒1, rat/bat/volatile/wolf/spearman⇒0.
// ★ ⊥#86/#74/zona/champion OVERRIDE (check 7b): spawnTough{type:'rat',overrideHp:2000} escala el CLON e.hp/e.maxHp/e.tpl.hp→2000 (mimetiza herida-inversa/afijo/zona/campeón); toughOf lee ETPL['rat'].hp=20 BASE ⇒ weight SIGUE 0 pese a eHp=2000. Y golem{overrideHp:5} ⇒ base 640 ⇒ weight SIGUE 2 pese a eHp=5. Prueba el desacople del clon/herida por construcción (EXACTAMENTE lo que ⊥#86 lee).
// ★ ⊥#86 SIEGE crux (check 8, EL MÁS AFÍN — REAL 2 mobs): un ORCO HERIDO al 10% (spawnWound crit, e.hp/e.maxHp DINÁMICO) ⇒ siege2 pero tough1 (base hp96, IGNORA la herida); un GOLEM a plena vida ⇒ tough2 pero siege0 (frac 1.0 sano). ORDEN OPUESTO ⇒ DISJUNTOS por base-estático-vs-fracción-dinámica.
// ★ ⊥#95 menace crux (check 8b): volatile (hp26⇒tough0, dmg23) es menace2; wendigo (hp118⇒tough2, dmg21) es menace1; orc (hp96⇒tough1, dmg24) es menace2 ⇒ orco tough1/menace2 y wendigo tough2/menace1 ORDEN OPUESTO (durabilidad defensiva vs fuerza ofensiva).
// ★ ⊥#94 swift crux (check 8c): golem (spd46⇒swift0) es tough2; bat (spd158⇒swift2) es tough0 ⇒ DIAMÉTRICAMENTE OPUESTOS (durabilidad vs rapidez — el lento aguanta, el veloz es de cristal).
// ★ ⊥#92 bulk crux (check 8d): revenant (sz20⇒bulk1, hp120) es tough2; emberkin (sz24⇒bulk2, hp58) es tough1 ⇒ OPUESTOS (menudo pero duro vs grande pero blando).
// ★ DIFERENCIADOR (check 9): un GOLEM (coloso hp640⇒tough2, melee point-blank idle prado) ⇒ tough T2 MIENTRAS swift#94 (⊥ adyacente)=0, reach#88=0 (point-blank), heading#90=0 (idle), zone#91=0 (prado).
// ★ CANAL (check 10): forageChargePreview = toughBonus(score). Golem (coloso) ⇒ charge>0; rata (frágil) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(toughBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con TOUGH_SURGE OFF, toughBonus(cualquier score)==0 y forageChargePreview==0 aun con un golem disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): tough (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de tough.
// ★ 0-REGRESIÓN (check 14): las 37 mecánicas del arco #59-#95 siguen served enabled:true; TOUGH_SURGE served false (DARK #96).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + toughProbe + hpProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). toughScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Observado vía __dev.tough (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT + hpProbe LUT + spawnTough inyección REAL [+overrideHp ⊥#86/#74/zona/champion] + clearTough + toughProbe lectura server-auth) + __dev.bloodHarvest (spawnWound/woundProbe #86 REAL) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Aguante:").
//
// Run: node tools/cas2569-tough-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2569");
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
// hpProbe esperado: hp→banda→weight (UMBRAL hiHp 110 / midHp 46). Cubre los 3 buckets + los bordes exactos de umbral.
const EXPECT_HP = [
  { hp: 640, band: "tank", w: 2 }, { hp: 150, band: "tank", w: 2 }, { hp: 110, band: "tank", w: 2 },          // ≥hiHp(110) ⇒ coloso ⇒ 2 (borde 110 inclusive)
  { hp: 109, band: "sturdy", w: 1 }, { hp: 96, band: "sturdy", w: 1 }, { hp: 46, band: "sturdy", w: 1 },        // ≥midHp(46) ⇒ firme ⇒ 1 (borde 46 inclusive, 109 justo bajo hiHp)
  { hp: 45, band: "fragile", w: 0 }, { hp: 26, band: "fragile", w: 0 }, { hp: 0, band: "fragile", w: 0 },        // <midHp ⇒ frágil ⇒ 0 (borde 45 justo bajo midHp)
];
// spawnTough esperado por TIPO: type → base hp → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "golem", hp: 640, w: 2 }, { type: "dragon", hp: 820, w: 2 }, { type: "moose", hp: 150, w: 2 }, { type: "charger", hp: 140, w: 2 }, { type: "revenant", hp: 120, w: 2 }, { type: "demon", hp: 135, w: 2 }, { type: "wendigo", hp: 118, w: 2 }, { type: "toadbrute", hp: 145, w: 2 }, { type: "ironback", hp: 112, w: 2 }, { type: "magmabrute", hp: 132, w: 2 },
  { type: "orc", hp: 96, w: 1 }, { type: "bandit", hp: 60, w: 1 }, { type: "mudlurker", hp: 64, w: 1 }, { type: "mage", hp: 56, w: 1 }, { type: "skeleton", hp: 52, w: 1 }, { type: "wraith", hp: 48, w: 1 }, { type: "summoner", hp: 46, w: 1 }, { type: "healer", hp: 50, w: 1 },
  { type: "rat", hp: 20, w: 0 }, { type: "bat", hp: 16, w: 0 }, { type: "volatile", hp: 26, w: 0 }, { type: "wolf", hp: 34, w: 0 }, { type: "spearman", hp: 42, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.bloodHarvest && window.__dev.zonetier && window.__dev.heading && window.__dev.longshot && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.tough + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.tough());
  ok("2 byte-id OFF (fresh boot): TOUGH_SURGE.enabled false AND G.toughBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "toughFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiHp=${dark.hiHp} midHp=${dark.midHp} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no toughFind/toughBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(toughFind|toughBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"toughBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'toughFind'/'toughBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.tough({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.tough({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.tough({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ hpProbe LUT: hp→band→weight (UMBRAL hiHp/midHp), type-independiente.
  const hpp = await page.evaluate((cases) => cases.map(c => window.__dev.tough({ hpProbe: { hp: c.hp } }).hpProbe), EXPECT_HP);
  const hppOK = EXPECT_HP.every((c, i) => hpp[i] && hpp[i].band === c.band && hpp[i].weight === c.w);
  ok("5b ★ hpProbe LUT: hp≥110⇒tank⇒2; hp≥46⇒sturdy⇒1; hp<46⇒fragile⇒0 (UMBRAL hiHp/midHp, bordes 110/46/45 exactos)",
     hppOK, JSON.stringify(hpp.map(x => ({ hp: x.hp, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnTough pushes a real mob of TYPE to G.enemies; reads toughWeight from ETPL[type].hp.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.tough({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.tough({ clearTough: true });
      window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.tough({ spawnTough: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnTough;
      const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
      // toughProbe.mobs puede incluir mobs de ambiente edad-sesión; asertar el peso MAX y el mob inyectado
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srHp: sr.hp, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineHp: mine ? mine.hp : -1 });
    }
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srHp === c.hp && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineHp === c.hp && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnTough empuja un mob REAL del TIPO; toughProbe lee el peso REAL de ETPL[type].hp ⇒ golem/dragon/moose/charger/revenant/demon/wendigo/toadbrute/ironback/magmabrute⇒2, orc/bandit/mudlurker/mage/skeleton/wraith/summoner/healer⇒1, rat/bat/volatile/wolf/spearman⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, hp: x.srHp, w: x.srW }))));

  // 7b ★ ⊥#86/#74/zona/champion OVERRIDE: rat con e.hp/e.maxHp/e.tpl.hp escalado a 2000 (mimetiza herida-inversa/afijo/zona/campeón) ⇒ toughOf lee ETPL['rat'].hp=20 BASE ⇒ weight SIGUE 0 pese a eHp=2000. golem con override 5 (mimetiza herida al mínimo) ⇒ base 640 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const ratBase = window.__dev.tough({ spawnTough: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } }).spawnTough;
    window.__dev.tough({ clearTough: true });
    const ratOvr = window.__dev.tough({ spawnTough: { type: "rat", tx: Z.forest[0], ty: Z.forest[1], overrideHp: 2000 } }).spawnTough;
    const tp1 = window.__dev.tough({ toughProbe: true }).toughProbe;   // lectura REAL: sigue leyendo base ⇒ 0
    window.__dev.tough({ clearTough: true });
    const golemOvr = window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1], overrideHp: 5 } }).spawnTough;   // clon herido a 5
    const tp2 = window.__dev.tough({ toughProbe: true }).toughProbe;   // sigue leyendo base 640 ⇒ 2
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    const rat1 = tp1.mobs.find(m => m.type === "rat"), gol2 = tp2.mobs.find(m => m.type === "golem");
    return { ratBaseHp: ratBase.hp, ratBaseW: ratBase.weight, ratOvrHp: ratOvr.hp, ratOvrEHp: ratOvr.eHp, ratOvrW: ratOvr.weight, tp1W: rat1 ? rat1.weight : -99,
      golemOvrHp: golemOvr.hp, golemOvrEHp: golemOvr.eHp, golemOvrW: golemOvr.weight, tp2W: gol2 ? gol2.weight : -99 };
  }, Z);
  const ovrOK = ovr.ratBaseHp === 20 && ovr.ratBaseW === 0 &&
    ovr.ratOvrHp === 20 && ovr.ratOvrEHp === 2000 && ovr.ratOvrW === 0 && ovr.tp1W === 0 &&   // clon eHp=2000, BASE 20 ⇒ tough 0 (NO salta a 2)
    ovr.golemOvrHp === 640 && ovr.golemOvrEHp === 5 && ovr.golemOvrW === 2 && ovr.tp2W === 2; // clon eHp=5, BASE 640 ⇒ tough 2 (NO cae a 0)
  ok("7b ★ ⊥#86/#74/zona/champion OVERRIDE: e.hp/e.maxHp/e.tpl.hp escalado (mimetiza herida e.hp/afijo A.hpMul/campeón C.hpMul/zona z.hpMul) ⇒ toughOf lee ETPL[type].hp BASE ⇒ rat SIGUE tough0 (base 20 pese a clon 2000), golem SIGUE tough2 (base 640 pese a clon 5) — desacople del clon/herida (EXACTAMENTE lo que ⊥#86 lee)",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#86 SIEGE crux (EL MÁS AFÍN — REAL 2 mobs): ORCO HERIDO al 10% (spawnWound crit) ⇒ siege2 pero tough1 (base hp96, IGNORA la herida); GOLEM a plena vida ⇒ tough2 pero siege0.
  const crux86 = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true }); window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // orco herido al 10% (spawnWound spawnea un orc REAL con e.hp fijado a frac 0.10)
    window.__dev.bloodHarvest({ spawnWound: { tx: Z.forest[0], ty: Z.forest[1], kind: "crit" } });
    const woundedOrc = { tough: window.__dev.tough().score, siege: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score };
    window.__dev.tough({ clearTough: true }); window.__dev.bloodHarvest({ clearWound: true });
    // golem a plena vida (spawnTough spawnea un golem REAL sano)
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const fullGolem = { tough: window.__dev.tough().score, siege: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score };
    window.__dev.tough({ clearTough: true }); window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.tough({ enabled: false });
    return { woundedOrc, fullGolem };
  }, Z);
  const crux86OK = crux86.woundedOrc.tough === 1 && crux86.woundedOrc.siege === 2 &&   // orco herido: tough 1 (base hp96 firme, IGNORA herida), siege 2 (frac 0.10)
    crux86.fullGolem.tough === 2 && crux86.fullGolem.siege === 0;                     // golem sano: tough 2 (base hp640 coloso), siege 0 (frac 1.0)
  ok("8 ★ ⊥#86 SIEGE crux (EL MÁS AFÍN, REAL): ORCO HERIDO 10% tough1(base96)/siege2 vs GOLEM sano tough2/siege0 — ORDEN OPUESTO ⇒ tough lee MAX-HP BASE ESTÁTICO, siege lee FRACCIÓN DINÁMICA ⇒ DISJUNTOS",
     crux86OK, JSON.stringify(crux86));

  // 8b ★ ⊥#95 menace crux: volatile (hp26⇒tough0, dmg23) menace2; wendigo (hp118⇒tough2, dmg21) menace1; orc (hp96⇒tough1, dmg24) menace2. ORDEN OPUESTO orc/wendigo.
  const crux95 = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true }); window.__dev.menace({ enabled: true });
    const read = (type) => { window.__dev.tough({ clearTough: true }); window.__dev.menace({ clearMenace: true });
      window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { tough: window.__dev.tough().score, menace: window.__dev.menace().score }; };
    const volatile = read("volatile"), wendigo = read("wendigo"), orc = read("orc");
    window.__dev.tough({ clearTough: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.tough({ enabled: false }); window.__dev.menace({ enabled: false });
    return { volatile, wendigo, orc };
  }, Z);
  const crux95OK = crux95.volatile.tough === 0 && crux95.volatile.menace === 2 &&
    crux95.wendigo.tough === 2 && crux95.wendigo.menace === 1 &&
    crux95.orc.tough === 1 && crux95.orc.menace === 2;   // orc tough1/menace2 y wendigo tough2/menace1 ORDEN OPUESTO
  ok("8b ★ ⊥#95 crux: VOLATILE (hp26 tough0/dmg23 menace2) CRISTAL-PEGADOR; WENDIGO (hp118 tough2/dmg21 menace1) y ORC (hp96 tough1/dmg24 menace2) ORDEN OPUESTO — durabilidad defensiva vs fuerza ofensiva",
     crux95OK, JSON.stringify(crux95));

  // 8c ★ ⊥#94 swift crux: golem (spd46⇒swift0) tough2; bat (spd158⇒swift2) tough0. DIAMÉTRICAMENTE OPUESTOS.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.tough({ clearTough: true });
      window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { tough: window.__dev.tough().score, swift: window.__dev.swift().score }; };
    const golem = read("golem"), bat = read("bat");
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false }); window.__dev.swift({ enabled: false });
    return { golem, bat };
  }, Z);
  const crux94OK = crux94.golem.tough === 2 && crux94.golem.swift === 0 && crux94.bat.tough === 0 && crux94.bat.swift === 2;
  ok("8c ★ ⊥#94 crux: GOLEM (spd46⇒swift0) tough2; BAT (spd158⇒swift2) tough0 — tough alto donde swift cero ⇒ DIAMÉTRICAMENTE OPUESTOS (durabilidad vs rapidez)",
     crux94OK, JSON.stringify(crux94));

  // 8d ★ ⊥#92 bulk crux: revenant (sz20⇒bulk1, hp120) tough2; emberkin (sz24⇒bulk2, hp58) tough1. OPUESTOS.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true }); window.__dev.bulk({ enabled: true });
    const read = (type) => { window.__dev.tough({ clearTough: true });
      window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { tough: window.__dev.tough().score, bulk: window.__dev.bulk().score }; };
    const revenant = read("revenant"), emberkin = read("emberkin");
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { revenant, emberkin };
  }, Z);
  const crux92OK = crux92.revenant.tough === 2 && crux92.revenant.bulk === 1 && crux92.emberkin.tough === 1 && crux92.emberkin.bulk === 2;
  ok("8d ★ ⊥#92 crux: REVENANT (sz20⇒bulk1, hp120) tough2; EMBERKIN (sz24⇒bulk2, hp58) tough1 — OPUESTOS (menudo pero duro vs grande pero blando)",
     crux92OK, JSON.stringify(crux92));

  // 9 ★ DIFFERENTIATOR: un GOLEM (coloso hp640⇒tough2, melee point-blank idle prado) ⇒ tough T2 MIENTRAS swift#94/reach#88/heading#90/zona#91 IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.tough();
    const swift = window.__dev.swift().score;                                        // golem spd46 ⇒ swift0
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;      // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                       // golem idle ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, swift, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.swift === 0 && diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;
  ok("9 ★ DIFERENCIADOR: GOLEM (coloso hp640 melee idle point-blank prado) ⇒ tough T2 MIENTRAS swift#94/reach#88/embestida#90/zona#91 IGNORAN (=0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL toughFind: forageChargePreview golem (coloso)>0 ; rata (frágil) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem ⇒ score 2 ⇒ T2
    const actVm = window.__dev.tough();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ spawnTough: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } });   // rata ⇒ score 0
    const ratVm = window.__dev.tough();
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    return { actPrev, actCharge, ratPrev: ratVm.forageChargePreview, ratTier: ratVm.tier, ratScore: ratVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.ratPrev === 0 && forage.ratTier === 0 && forage.ratScore === 0;
  ok("10 CANAL toughFind: forageChargePreview con golem (coloso) ⇒ charge>0 (==toughBonus); con rata (frágil) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds toughBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.tough().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>toughBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a golem available
  const neutral = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem disponible
    window.__dev.tough({ enabled: false });                             // now OFF
    const off = window.__dev.tough();
    window.__dev.tough({ enabled: true }); window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, toughBonus(golem disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip tough OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de tough.
  const orth = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ enabled: false });
    const snap = () => JSON.stringify({ men: window.__dev.menace(), swf: window.__dev.swift(), blo: window.__dev.bloodHarvest(), lng: window.__dev.longshot(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), rol: window.__dev.role(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.tough({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.tough();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.tough();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD toughFind ⊥ peers: flip tough OFF→ON NO cambia menace/swift/bloodHarvest/longshot/heading/zonetier/bulk/role/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de tough; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 37 arc flags served true; TOUGH_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const toughDark = flag("TOUGH_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 37 mecanismos del arco #59-#95 served enabled:true; TOUGH_SURGE served false (DARK #96)",
     arcAllOn && toughDark && arc.length === 37, `tough=${flag("TOUGH_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Aguante:" drawn ON+golem / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Aguante:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Aguante:\" se DIBUJA ON+golem (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.tough({ enabled: true }); window.__dev.tough({ clearTough: true }); window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false }); });

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
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.tough();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const hps = [640, 110, 109, 46, 45, 16].map(v => { const q = window.__dev.tough({ hpProbe: { hp: v } }).hpProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
    const mine = tp.mobs.find(m => m.type === "golem") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineHp: mine ? mine.hp : -1, lut, hps, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineHp === B.mineHp && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.hps) === JSON.stringify(B.hps) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO golem+héroe ⇒ score/tier/charge + toughProbe(score,weight,hp) + hpProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineHp:${A.mineHp},hps:${JSON.stringify(A.hps)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineHp:${B.mineHp},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.tough({ enabled: false }));
  await pageB.evaluate(() => window.__dev.tough({ enabled: false }));

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
