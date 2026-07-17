// CAS-2573 — self-verify for REMATE DE VIGÍA (DARK, SENTINEL_SURGE.enabled:false). EVO mecánica #97 (serializa tras #96 TOUGH_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 38 LIVE #59-#96.
// (A) EJE FRESCO = VIGILANCIA/RADIO-DE-PERCEPCIÓN BASE del mob TYPE server-auth (la ALERTA INTRÍNSECA: cuán LEJOS te DETECTA su TIPO de fábrica — un vigía como mago340/golem360/dragón380/bogtyrant380 que te fija desde muy lejos vs un vigilante moderado bandido250/alce260/toadbrute290 o un despistado rata170/orco220/murciélago220 que apenas te ve venir). server-auth, MMORPG-native (recompensar cegar al vigía que te detecta de lejos, no al despistado).
//     PRE-FLIGHT GATE PIVOTE: el eje RECOMENDADO del issue (REACH/RANGO base ETPL[type].range) COLISIONA con #84 SKIRMISH — skirmishWeight lee `e.tpl.range≥longR?2:1` como SCORE de recompensa (sim.js:4324) ⇒ range NO es un campo FRESCO. Pivote justificado al alterno FRESCO sancionado por el issue (perception/age/tier) = VIGILANCIA/RADIO-DE-PERCEPCIÓN base. PASA: `aggro` es ESCALAR ENTERO ESTÁTICO por template (config.js:290+, 0..380), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 38 flags #59-#96 lo lee como SCORE. Los únicos lectores de `.aggro`: (a) la máquina de estados de la IA (d<aggro, comportamiento); (b) SHADOW_STALK #2426 que reduce el radio EFECTIVO por LOS (canal detectRadius/sigilo DISTINTO, DINÁMICO); (c) bonfire/lastStand booleano '¿en aggro?' — jamás recompensa de kill por vigilancia base.
//     CLAVE ⊥override/⊥#74/⊥champion/⊥hostil: sentinelWeight lee ETPL[e.type].aggro (PERCEPCIÓN BASE INMUTABLE del TIPO), NO e.tpl.aggro (el CLON) — makeHostile(e) sobrescribe el clon a aggro:300, campeón a Math.max(base,320), jefe a Math.max(base,340), espíritu a 0, TODOS mutan el CLON pero JAMÁS la fila base ⇒ vigilancia DESACOPLADA por construcción (un adv neutral aggro0 hecho hostil clon300 SIGUE sentinel0; un orco campeón clon≥320 SIGUE sentinel0 leyendo base 220). applyZoneScale escala hp/dmg/spd/xp pero NUNCA aggro ⇒ percepción INDEPENDIENTE de zona.
//     sentinelWeight(e)=banda de sentinelOf(e)=ETPL[type].aggro: aggro≥hiAggro(320) ⇒ vigía ⇒ 2; aggro≥midAggro(250) ⇒ vigilante moderado ⇒ 1; aggro<midAggro ⇒ despistado ⇒ 0. El score del kill = sentinelWeight(víctima) muestreado en el TOP de killEnemy (_sentinelPre). La señal VIVA del badge = sentinelScore(hero)=MAX sentinelWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #96 aguante/#95 daño/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥38 VIGILANCIA/RADIO-DE-PERCEPCIÓN BASE ESTÁTICO: ⊥ #96 TOUGH (AGUANTE/HP — ironback hp112 tough2/aggro220 sentinel0 COLOSO-DESPISTADO vs mago hp56 tough1/aggro340 sentinel2 FIRME-VIGÍA ORDEN OPUESTO). ⊥ #95 MENACE (DAÑO — invocador dmg0 menace0/aggro330 sentinel2 INOFENSIVO-VIGILANTE vs orco dmg24 menace2/aggro220 sentinel0 PEGADOR-DESPISTADO OPUESTO). ⊥ #94 SWIFT (VELOCIDAD — murciélago spd158 swift2/aggro220 sentinel0 VELOZ-CIEGO vs mago spd62 swift0/aggro340 sentinel2 LENTO-VIGÍA DIAMÉTRICAMENTE OPUESTOS, crux reservado CAS-2564). ⊥ #92 BULK (TAMAÑO — mago sz21 bulk1/aggro340 sentinel2 vs ironback sz28 bulk2/aggro220 sentinel0: mago MENOR bulk pero MAYOR sentinel OPUESTO). ⊥ #84 ESCARAMUZA (CLASE DE ALCANCE e.tpl.ranged — golem MELEE/aggro360 sentinel2 vs lancero RANGED/aggro300 sentinel1: el MELEE puntúa MÁS que el a-distancia, REVIERTE la correlación reach⇒sentinel). ⊥ #93/#91/#90/#89/#88/#87/#86/#85/#74/#73/#78/#72/#2426 SHADOW_STALK.
// (B) CANAL FRESCO = sentinelFind (fichas de vigilia por rematar a un VIGÍA — NINGUNA de las 38 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…toughFind #96) está LLENA ⇒ moneda FRESCA (h.sentinelBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio sentinelBountyCap, 0 doble-dip.
//
// ★ aggroProbe LUT (check 5b): aggro→banda→weight — prueba el UMBRAL hiAggro(320)/midAggro(250) (≥320⇒vigilant⇒2, ≥250⇒wary⇒1, <250⇒oblivious⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnSentinel empuja un mob REAL del TIPO al MISMO G.enemies; sentinelProbe lee su peso REAL de ETPL[type].aggro.
// ★ ⊥override/#74/champion/hostil OVERRIDE (check 7b): spawnSentinel{type:'orc',overrideAggro:999} escala el CLON e.tpl.aggro→999 (mimetiza makeHostile/campeón/jefe); sentinelOf lee ETPL['orc'].aggro=220 BASE ⇒ weight SIGUE 0 pese a clon 999. Y mage{overrideAggro:10} ⇒ base 340 ⇒ weight SIGUE 2 pese a clon 10.
// ★ ⊥#96 tough crux (check 8): ironback (aggro220⇒sentinel0, hp112⇒tough2) vs mage (aggro340⇒sentinel2, hp56⇒tough1) ⇒ ORDEN OPUESTO.
// ★ ⊥#95 menace crux (check 8b): summoner (aggro330⇒sentinel2, dmg0⇒menace0) vs orc (aggro220⇒sentinel0, dmg24⇒menace2) ⇒ OPUESTO.
// ★ ⊥#94 swift crux (check 8c, REservado CAS-2564): bat (aggro220⇒sentinel0, spd158⇒swift2) vs mage (aggro340⇒sentinel2, spd62⇒swift0) ⇒ DIAMÉTRICAMENTE OPUESTOS.
// ★ ⊥#92 bulk crux (check 8d): mage (aggro340⇒sentinel2, sz21⇒bulk1) vs ironback (aggro220⇒sentinel0, sz28⇒bulk2) ⇒ mago menor bulk / mayor sentinel OPUESTO.
// ★ ⊥#84 reach-class crux (check 8e): golem MELEE (aggro360⇒sentinel2) vs spearman RANGED (aggro300⇒sentinel1) ⇒ el melee-vigía puntúa MÁS que el ranged, la clase-de-alcance NO predice la vigilancia (REVIERTE #84).
// ★ DIFERENCIADOR (check 9): un GOLEM (vigía aggro360⇒sentinel2, melee point-blank idle prado) ⇒ sentinel T2 MIENTRAS swift#94=0, reach#88=0 (point-blank), heading#90=0 (idle), zone#91=0 (prado).
// ★ CANAL (check 10): forageChargePreview = sentinelBonus(score). Mago (vigía) ⇒ charge>0; rata (despistado) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(sentinelBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con SENTINEL_SURGE OFF, sentinelBonus(cualquier score)==0 y forageChargePreview==0 aun con un mago disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): sentinel (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de sentinel.
// ★ 0-REGRESIÓN (check 14): las 38 mecánicas del arco #59-#96 siguen served enabled:true; SENTINEL_SURGE served false (DARK #97).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + sentinelProbe + aggroProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). sentinelScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2573-sentinel-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2573");
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
// aggroProbe esperado: aggro→banda→weight (UMBRAL hiAggro 320 / midAggro 250). Cubre los 3 buckets + los bordes exactos.
const EXPECT_AGGRO = [
  { aggro: 380, band: "vigilant", w: 2 }, { aggro: 340, band: "vigilant", w: 2 }, { aggro: 320, band: "vigilant", w: 2 },  // ≥hiAggro(320) ⇒ vigía ⇒ 2 (borde 320 inclusive)
  { aggro: 319, band: "wary", w: 1 }, { aggro: 300, band: "wary", w: 1 }, { aggro: 250, band: "wary", w: 1 },              // ≥midAggro(250) ⇒ vigilante ⇒ 1 (borde 250 inclusive, 319 justo bajo hiAggro)
  { aggro: 249, band: "oblivious", w: 0 }, { aggro: 220, band: "oblivious", w: 0 }, { aggro: 0, band: "oblivious", w: 0 }, // <midAggro ⇒ despistado ⇒ 0 (borde 249 justo bajo midAggro)
];
// spawnSentinel esperado por TIPO: type → base aggro → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "mage", aggro: 340, w: 2 }, { type: "wraith", aggro: 320, w: 2 }, { type: "summoner", aggro: 330, w: 2 }, { type: "healer", aggro: 330, w: 2 }, { type: "demon", aggro: 330, w: 2 }, { type: "wendigo", aggro: 330, w: 2 }, { type: "wisp", aggro: 330, w: 2 }, { type: "ashwraith", aggro: 340, w: 2 }, { type: "thornspitter", aggro: 320, w: 2 }, { type: "emberkin", aggro: 330, w: 2 }, { type: "golem", aggro: 360, w: 2 }, { type: "dragon", aggro: 380, w: 2 }, { type: "bogtyrant", aggro: 380, w: 2 }, { type: "calderatyrant", aggro: 380, w: 2 },
  { type: "bandit", aggro: 250, w: 1 }, { type: "mudlurker", aggro: 250, w: 1 }, { type: "moose", aggro: 260, w: 1 }, { type: "toadbrute", aggro: 290, w: 1 }, { type: "spearman", aggro: 300, w: 1 }, { type: "charger", aggro: 300, w: 1 }, { type: "volatile", aggro: 300, w: 1 }, { type: "revenant", aggro: 300, w: 1 },
  { type: "rat", aggro: 170, w: 0 }, { type: "orc", aggro: 220, w: 0 }, { type: "bat", aggro: 220, w: 0 }, { type: "ironback", aggro: 220, w: 0 }, { type: "quillback", aggro: 230, w: 0 }, { type: "skeleton", aggro: 230, w: 0 }, { type: "wolf", aggro: 240, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.longshot && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.sentinel + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.sentinel());
  ok("2 byte-id OFF (fresh boot): SENTINEL_SURGE.enabled false AND G.sentinelBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "sentinelFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiAggro=${dark.hiAggro} midAggro=${dark.midAggro} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no sentinelFind/sentinelBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(sentinelFind|sentinelBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"sentinelBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'sentinelFind'/'sentinelBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.sentinel({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.sentinel({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.sentinel({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ aggroProbe LUT: aggro→band→weight (UMBRAL hiAggro/midAggro), type-independiente.
  const agp = await page.evaluate((cases) => cases.map(c => window.__dev.sentinel({ aggroProbe: { aggro: c.aggro } }).aggroProbe), EXPECT_AGGRO);
  const agpOK = EXPECT_AGGRO.every((c, i) => agp[i] && agp[i].band === c.band && agp[i].weight === c.w);
  ok("5b ★ aggroProbe LUT: aggro≥320⇒vigilant⇒2; aggro≥250⇒wary⇒1; aggro<250⇒oblivious⇒0 (UMBRAL hiAggro/midAggro, bordes 320/250/249 exactos)",
     agpOK, JSON.stringify(agp.map(x => ({ a: x.aggro, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnSentinel pushes a real mob of TYPE to G.enemies; reads sentinelWeight from ETPL[type].aggro.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.sentinel({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.sentinel({ clearSentinel: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.sentinel({ spawnSentinel: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSentinel;
      const tp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srAggro: sr.aggro, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineAggro: mine ? mine.aggro : -1 });
    }
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srAggro === c.aggro && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineAggro === c.aggro && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnSentinel empuja un mob REAL del TIPO; sentinelProbe lee el peso REAL de ETPL[type].aggro ⇒ mage/wraith/summoner/healer/demon/wendigo/wisp/ashwraith/thornspitter/emberkin/golem/dragon/bogtyrant/calderatyrant⇒2, bandit/mudlurker/moose/toadbrute/spearman/charger/volatile/revenant⇒1, rat/orc/bat/ironback/quillback/skeleton/wolf⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, a: x.srAggro, w: x.srW }))));

  // 7b ★ ⊥override/#74/champion/hostil OVERRIDE: orc con e.tpl.aggro escalado a 999 (mimetiza makeHostile/campeón/jefe) ⇒ sentinelOf lee ETPL['orc'].aggro=220 BASE ⇒ weight SIGUE 0 pese a clon 999. mage con override 10 ⇒ base 340 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.sentinel({ spawnSentinel: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnSentinel;
    window.__dev.sentinel({ clearSentinel: true });
    const orcOvr = window.__dev.sentinel({ spawnSentinel: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideAggro: 999 } }).spawnSentinel;
    const tp1 = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;   // lectura REAL: sigue leyendo base ⇒ 0
    window.__dev.sentinel({ clearSentinel: true });
    const mageOvr = window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1], overrideAggro: 10 } }).spawnSentinel;   // clon apagado a 10
    const tp2 = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;   // sigue leyendo base 340 ⇒ 2
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), mag2 = tp2.mobs.find(m => m.type === "mage");
    return { orcBaseAggro: orcBase.aggro, orcBaseW: orcBase.weight, orcOvrAggro: orcOvr.aggro, orcOvrTplAggro: orcOvr.tplAggro, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      mageOvrAggro: mageOvr.aggro, mageOvrTplAggro: mageOvr.tplAggro, mageOvrW: mageOvr.weight, tp2W: mag2 ? mag2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseAggro === 220 && ovr.orcBaseW === 0 &&
    ovr.orcOvrAggro === 220 && ovr.orcOvrTplAggro === 999 && ovr.orcOvrW === 0 && ovr.tp1W === 0 &&   // clon 999, BASE 220 ⇒ sentinel 0 (NO salta a 2)
    ovr.mageOvrAggro === 340 && ovr.mageOvrTplAggro === 10 && ovr.mageOvrW === 2 && ovr.tp2W === 2;   // clon 10, BASE 340 ⇒ sentinel 2 (NO cae a 0)
  ok("7b ★ ⊥override/#74/champion/hostil OVERRIDE: e.tpl.aggro escalado (mimetiza makeHostile 300/campeón 320/jefe 340) ⇒ sentinelOf lee ETPL[type].aggro BASE ⇒ orc SIGUE sentinel0 (base 220 pese a clon 999), mage SIGUE sentinel2 (base 340 pese a clon 10) — desacople del clon (EXACTAMENTE lo que makeHostile/campeón/jefe sobrescriben)",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#96 tough crux: ironback (aggro220⇒sentinel0, hp112⇒tough2) vs mage (aggro340⇒sentinel2, hp56⇒tough1). ORDEN OPUESTO.
  const crux96 = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true }); window.__dev.tough({ enabled: true });
    const read = (type) => { window.__dev.sentinel({ clearSentinel: true }); window.__dev.tough({ clearTough: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { sentinel: window.__dev.sentinel().score, tough: window.__dev.tough().score }; };
    const ironback = read("ironback"), mage = read("mage");
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.tough({ clearTough: true });
    window.__dev.sentinel({ enabled: false }); window.__dev.tough({ enabled: false });
    return { ironback, mage };
  }, Z);
  const crux96OK = crux96.ironback.sentinel === 0 && crux96.ironback.tough === 2 && crux96.mage.sentinel === 2 && crux96.mage.tough === 1;
  ok("8 ★ ⊥#96 crux: IRONBACK (aggro220 sentinel0/hp112 tough2) COLOSO-DESPISTADO vs MAGE (aggro340 sentinel2/hp56 tough1) FIRME-VIGÍA — ORDEN OPUESTO (percepción vs durabilidad, el eje base más reciente)",
     crux96OK, JSON.stringify(crux96));

  // 8b ★ ⊥#95 menace crux: summoner (aggro330⇒sentinel2, dmg0⇒menace0) vs orc (aggro220⇒sentinel0, dmg24⇒menace2). OPUESTO.
  const crux95 = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true }); window.__dev.menace({ enabled: true });
    const read = (type) => { window.__dev.sentinel({ clearSentinel: true }); window.__dev.menace({ clearMenace: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { sentinel: window.__dev.sentinel().score, menace: window.__dev.menace().score }; };
    const summoner = read("summoner"), orc = read("orc");
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.sentinel({ enabled: false }); window.__dev.menace({ enabled: false });
    return { summoner, orc };
  }, Z);
  const crux95OK = crux95.summoner.sentinel === 2 && crux95.summoner.menace === 0 && crux95.orc.sentinel === 0 && crux95.orc.menace === 2;
  ok("8b ★ ⊥#95 crux: SUMMONER (aggro330 sentinel2/dmg0 menace0) INOFENSIVO-VIGILANTE vs ORC (aggro220 sentinel0/dmg24 menace2) PEGADOR-DESPISTADO — ORDEN OPUESTO",
     crux95OK, JSON.stringify(crux95));

  // 8c ★ ⊥#94 swift crux (RESERVADO CAS-2564): bat (aggro220⇒sentinel0, spd158⇒swift2) vs mage (aggro340⇒sentinel2, spd62⇒swift0). DIAMÉTRICAMENTE OPUESTOS.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.sentinel({ clearSentinel: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { sentinel: window.__dev.sentinel().score, swift: window.__dev.swift().score }; };
    const bat = read("bat"), mage = read("mage");
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false }); window.__dev.swift({ enabled: false });
    return { bat, mage };
  }, Z);
  const crux94OK = crux94.bat.sentinel === 0 && crux94.bat.swift === 2 && crux94.mage.sentinel === 2 && crux94.mage.swift === 0;
  ok("8c ★ ⊥#94 crux (RESERVADO CAS-2564): BAT (aggro220 sentinel0/spd158 swift2) VELOZ-CIEGO vs MAGE (aggro340 sentinel2/spd62 swift0) LENTO-VIGÍA — sentinel alto donde swift cero ⇒ DIAMÉTRICAMENTE OPUESTOS (vigilancia vs rapidez)",
     crux94OK, JSON.stringify(crux94));

  // 8d ★ ⊥#92 bulk crux: mage (aggro340⇒sentinel2, sz21⇒bulk1) vs ironback (aggro220⇒sentinel0, sz28⇒bulk2). mago menor bulk / mayor sentinel.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true }); window.__dev.bulk({ enabled: true });
    const read = (type) => { window.__dev.sentinel({ clearSentinel: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { sentinel: window.__dev.sentinel().score, bulk: window.__dev.bulk().score }; };
    const mage = read("mage"), ironback = read("ironback");
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { mage, ironback };
  }, Z);
  const crux92OK = crux92.mage.sentinel === 2 && crux92.mage.bulk === 1 && crux92.ironback.sentinel === 0 && crux92.ironback.bulk === 2;
  ok("8d ★ ⊥#92 crux: MAGE (aggro340 sentinel2/sz21 bulk1) vs IRONBACK (aggro220 sentinel0/sz28 bulk2) — mago MENOR bulk pero MAYOR sentinel ⇒ OPUESTO (vigilancia vs tamaño)",
     crux92OK, JSON.stringify(crux92));

  // 8e ★ ⊥#84 reach-class crux: golem MELEE (aggro360⇒sentinel2) vs spearman RANGED (aggro300⇒sentinel1). El melee-vigía puntúa MÁS que el ranged ⇒ la clase-de-alcance NO predice la vigilancia (REVIERTE #84).
  const crux84 = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    const read = (type) => { window.__dev.sentinel({ clearSentinel: true });
      window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSentinel;
      return { sentinel: window.__dev.sentinel().score, aggro: sr.aggro }; };
    const golem = read("golem"), spearman = read("spearman");
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    return { golem, spearman };
  }, Z);
  const crux84OK = crux84.golem.sentinel === 2 && crux84.spearman.sentinel === 1;   // golem MELEE (skirmish=0) sentinel2 > spearman RANGED (skirmish>0) sentinel1
  ok("8e ★ ⊥#84 crux: GOLEM MELEE (aggro360 sentinel2, e.tpl.ranged=false ⇒ skirmish0) > SPEARMAN RANGED (aggro300 sentinel1, ranged⇒skirmish>0) — el MELEE-vigía puntúa MÁS que el a-distancia ⇒ la CLASE DE ALCANCE (#84) NO predice la vigilancia, REVIERTE la correlación",
     crux84OK, JSON.stringify(crux84));

  // 9 ★ DIFFERENTIATOR: un GOLEM (vigía aggro360⇒sentinel2, melee point-blank idle prado) ⇒ sentinel T2 MIENTRAS swift#94/reach#88/heading#90/zona#91 IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.sentinel();
    const swift = window.__dev.swift().score;                                        // golem spd46 ⇒ swift0
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;      // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                       // golem idle ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, swift, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.swift === 0 && diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;
  ok("9 ★ DIFERENCIADOR: GOLEM (vigía aggro360 melee idle point-blank prado) ⇒ sentinel T2 MIENTRAS swift#94/reach#88/embestida#90/zona#91 IGNORAN (=0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL sentinelFind: forageChargePreview mago (vigía)>0 ; rata (despistado) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });   // mage ⇒ score 2 ⇒ T2
    const actVm = window.__dev.sentinel();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ spawnSentinel: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } });   // rata ⇒ score 0
    const ratVm = window.__dev.sentinel();
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    return { actPrev, actCharge, ratPrev: ratVm.forageChargePreview, ratTier: ratVm.tier, ratScore: ratVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.ratPrev === 0 && forage.ratTier === 0 && forage.ratScore === 0;
  ok("10 CANAL sentinelFind: forageChargePreview con mago (vigía) ⇒ charge>0 (==sentinelBonus); con rata (despistado) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds sentinelBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.sentinel().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>sentinelBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a mage available
  const neutral = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });   // mago disponible
    window.__dev.sentinel({ enabled: false });                             // now OFF
    const off = window.__dev.sentinel();
    window.__dev.sentinel({ enabled: true }); window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, sentinelBonus(mago disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip sentinel OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de sentinel.
  const orth = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ enabled: false });
    const snap = () => JSON.stringify({ tuf: window.__dev.tough(), men: window.__dev.menace(), swf: window.__dev.swift(), lng: window.__dev.longshot(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), rol: window.__dev.role(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.sentinel({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.sentinel();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.sentinel();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD sentinelFind ⊥ peers: flip sentinel OFF→ON NO cambia tough/menace/swift/longshot/heading/zonetier/bulk/role/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de sentinel; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 38 arc flags served true; SENTINEL_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const sentinelDark = flag("SENTINEL_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 38 mecanismos del arco #59-#96 served enabled:true; SENTINEL_SURGE served false (DARK #97)",
     arcAllOn && sentinelDark && arc.length === 38, `sentinel=${flag("SENTINEL_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Vigilia:" drawn ON+mage / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Centinela:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });   // mage ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Centinela:\" se DIBUJA ON+mago (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.sentinel({ enabled: true }); window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false }); });

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
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.sentinel();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const aggs = [380, 320, 319, 250, 249, 170].map(v => { const q = window.__dev.sentinel({ aggroProbe: { aggro: v } }).aggroProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
    const mine = tp.mobs.find(m => m.type === "mage") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineAggro: mine ? mine.aggro : -1, lut, aggs, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineAggro === B.mineAggro && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.aggs) === JSON.stringify(B.aggs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO mago+héroe ⇒ score/tier/charge + sentinelProbe(score,weight,aggro) + aggroProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineAggro:${A.mineAggro},aggs:${JSON.stringify(A.aggs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineAggro:${B.mineAggro},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.sentinel({ enabled: false }));
  await pageB.evaluate(() => window.__dev.sentinel({ enabled: false }));

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
