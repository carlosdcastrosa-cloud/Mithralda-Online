// CAS-2580 — self-verify for REMATE DE ARIETE (DARK, RAM_SURGE.enabled:false). EVO mecánica #98 (serializa tras #97 SENTINEL_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 39 LIVE #59-#97.
// (A) EJE FRESCO = FUERZA DE IMPACTO/KNOCKBACK BASE del mob TYPE server-auth (la POTENCIA DE EMPUJE INTRÍNSECA: cuánto te ARROLLA su TIPO de fábrica al golpear — un ariete/demoledor como charger235/toadbrute225/magmabrute210/moose200/ironback200 que te lanza por los aires vs un pegador firme rat110/bandit110/orco150 o un golpe leve summoner40/mage60/golem60/dragón85 que apenas te mueve). server-auth, MMORPG-native (recompensar descolocar al demoledor que te arrolla, no al de golpe leve).
//     PRE-FLIGHT GATE PASA sin pivote: `knock` es ESCALAR ENTERO ESTÁTICO por template (config.js:290+, 40..235 en 31 tipos), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 39 flags #59-#97 lo lee como SCORE. El ÚNICO lector de `.knock`: la FÍSICA de knockback (e.knockX+=cos*e.tpl.knock*mul al golpear, sim.js:6071/6914/7873 — magnitud de EMPUJE, JAMÁS recompensa de kill). AÚN más limpio que aggro #97 (que tenía lectores de IA state-machine).
//     CLAVE ⊥override/⊥#74/⊥champion/⊥élite: ramWeight lee ETPL[e.type].knock (IMPACTO BASE INMUTABLE del TIPO), NO e.tpl.knock (el CLON) — AMBUSH.elite sobrescribe el clon a round(base*knockMul), spawn escalado a Math.max(60,round(base*0.6)), mutan el CLON pero JAMÁS la fila base ⇒ impacto DESACOPLADO por construcción (un orco campeón clon escalado SIGUE ram1 leyendo base 150). applyZoneScale escala hp/dmg/spd/xp pero NUNCA knock ⇒ impacto INDEPENDIENTE de zona.
//     ramWeight(e)=banda de ramOf(e)=ETPL[type].knock: knock≥hiKnock(200) ⇒ ariete ⇒ 2; knock≥midKnock(110) ⇒ pegador firme ⇒ 1; knock<midKnock ⇒ leve ⇒ 0. El score del kill = ramWeight(víctima) muestreado en el TOP de killEnemy (_ramPre). La señal VIVA del badge = ramScore(hero)=MAX ramWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #97 vigilancia/#96 aguante/#95 daño/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥39 FUERZA DE IMPACTO/KNOCKBACK BASE ESTÁTICO: ⊥ #97 SENTINEL (VIGILANCIA/aggro — golem aggro360 sentinel2/knock60 ram0 VIGÍA-LEVE vs charger aggro300 sentinel1/knock235 ram2 ORDEN OPUESTO). ⊥ #96 TOUGH (AGUANTE/HP — golem hp640 tough2/knock60 ram0 vs rat hp20 tough0/knock110 ram1 OPUESTO). ⊥ #95 MENACE (DAÑO — golem dmg30 menace2/knock60 ram0 vs rat dmg6 menace0/knock110 ram1 OPUESTO). ⊥ #94 SWIFT (VELOCIDAD — murciélago spd158 swift2/knock90 ram0 vs charger spd74 swift0/knock235 ram2 DIAMÉTRICAMENTE OPUESTOS). ⊥ #92 BULK (TAMAÑO — golem sz36 bulk2/knock60 ram0 vs charger sz26 bulk1/knock235 ram2 OPUESTOS). ⊥ #93 ROLE (arch — summoner enabler rol2/knock40 ram0 vs charger rol0/knock235 ram2 selección OPUESTA). ⊥ #84 ESCARAMUZA (CLASE DE ALCANCE e.tpl.ranged — lancero RANGED skirmish>0/knock80 ram0 vs moose MELEE skirmish0/knock200 ram2 OPUESTO). ⊥ #91/#90/#89/#88/#87/#86/#85/#74/#73/#78/#72/#2426.
// (B) CANAL FRESCO = ramFind (fichas de ariete por rematar a un DEMOLEDOR — NINGUNA de las 39 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…sentinelFind #97) está LLENA ⇒ moneda FRESCA (h.ramBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio ramBountyCap, 0 doble-dip.
//
// ★ knockProbe LUT (check 5b): knock→banda→weight — prueba el UMBRAL hiKnock(200)/midKnock(110) (≥200⇒battering⇒2, ≥110⇒forceful⇒1, <110⇒light⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnRam empuja un mob REAL del TIPO al MISMO G.enemies; ramProbe lee su peso REAL de ETPL[type].knock.
// ★ ⊥override/#74/champion/élite OVERRIDE (check 7b): spawnRam{type:'orc',overrideKnock:999} escala el CLON e.tpl.knock→999 (mimetiza AMBUSH.elite); ramOf lee ETPL['orc'].knock=150 BASE ⇒ weight SIGUE 1 pese a clon 999. Y charger{overrideKnock:10} ⇒ base 235 ⇒ weight SIGUE 2 pese a clon 10.
// ★ ⊥#97 sentinel crux (check 8): golem (knock60⇒ram0, aggro360⇒sentinel2) vs charger (knock235⇒ram2, aggro300⇒sentinel1) ⇒ ORDEN OPUESTO.
// ★ ⊥#96 tough crux (check 8b): golem (knock60⇒ram0, hp640⇒tough2) vs rat (knock110⇒ram1, hp20⇒tough0) ⇒ OPUESTO.
// ★ ⊥#95 menace crux (check 8c): golem (knock60⇒ram0, dmg30⇒menace2) vs rat (knock110⇒ram1, dmg6⇒menace0) ⇒ OPUESTO.
// ★ ⊥#94 swift crux (check 8d): bat (knock90⇒ram0, spd158⇒swift2) vs charger (knock235⇒ram2, spd74⇒swift0) ⇒ DIAMÉTRICAMENTE OPUESTOS.
// ★ ⊥#92 bulk crux (check 8e): golem (knock60⇒ram0, sz36⇒bulk2) vs rat (knock110⇒ram1, sz15⇒bulk0) ⇒ golem MAYOR bulk / MENOR ram, rata MENOR bulk / MAYOR ram — DIAMÉTRICAMENTE OPUESTOS (mole GRANDE-BLANDA-DE-EMPUJE vs alimaña MENUDA-pero-FIRME).
// ★ ⊥#84 reach-class crux (check 8f): moose MELEE (knock200⇒ram2, skirmish0) vs spearman RANGED (knock80⇒ram0, skirmish>0) ⇒ el melee-ariete puntúa MÁS que el a-distancia (REVIERTE #84).
// ★ DIFERENCIADOR (check 9): un CHARGER (ariete knock235⇒ram2, melee point-blank idle prado) ⇒ ram T2 MIENTRAS swift#94=0, reach#88=0 (point-blank), heading#90=0 (idle), zone#91=0 (prado).
// ★ CANAL (check 10): forageChargePreview = ramBonus(score). Charger (ariete) ⇒ charge>0; mago (leve) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(ramBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con RAM_SURGE OFF, ramBonus(cualquier score)==0 y forageChargePreview==0 aun con un charger disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): ram (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de ram.
// ★ 0-REGRESIÓN (check 14): las 39 mecánicas del arco #59-#97 siguen served enabled:true; RAM_SURGE served false (DARK #98).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + ramProbe + knockProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). ramScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2580-ram-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2580");
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
// knockProbe esperado: knock→banda→weight (UMBRAL hiKnock 200 / midKnock 110). Cubre los 3 buckets + los bordes exactos.
const EXPECT_KNOCK = [
  { knock: 235, band: "battering", w: 2 }, { knock: 210, band: "battering", w: 2 }, { knock: 200, band: "battering", w: 2 },  // ≥hiKnock(200) ⇒ ariete ⇒ 2 (borde 200 inclusive)
  { knock: 199, band: "forceful", w: 1 }, { knock: 150, band: "forceful", w: 1 }, { knock: 110, band: "forceful", w: 1 },      // ≥midKnock(110) ⇒ pegador ⇒ 1 (borde 110 inclusive, 199 justo bajo hiKnock)
  { knock: 109, band: "light", w: 0 }, { knock: 60, band: "light", w: 0 }, { knock: 0, band: "light", w: 0 },                  // <midKnock ⇒ leve ⇒ 0 (borde 109 justo bajo midKnock)
];
// spawnRam esperado por TIPO: type → base knock → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "moose", knock: 200, w: 2 }, { type: "ironback", knock: 200, w: 2 }, { type: "magmabrute", knock: 210, w: 2 }, { type: "toadbrute", knock: 225, w: 2 }, { type: "charger", knock: 235, w: 2 },
  { type: "rat", knock: 110, w: 1 }, { type: "bandit", knock: 110, w: 1 }, { type: "demon", knock: 110, w: 1 }, { type: "skeleton", knock: 120, w: 1 }, { type: "revenant", knock: 120, w: 1 }, { type: "quillback", knock: 120, w: 1 }, { type: "mudlurker", knock: 120, w: 1 }, { type: "wolf", knock: 140, w: 1 }, { type: "orc", knock: 150, w: 1 },
  { type: "summoner", knock: 40, w: 0 }, { type: "healer", knock: 50, w: 0 }, { type: "wisp", knock: 50, w: 0 }, { type: "thornspitter", knock: 55, w: 0 }, { type: "emberkin", knock: 58, w: 0 }, { type: "mage", knock: 60, w: 0 }, { type: "wraith", knock: 60, w: 0 }, { type: "golem", knock: 60, w: 0 }, { type: "volatile", knock: 60, w: 0 }, { type: "ashwraith", knock: 60, w: 0 }, { type: "spearman", knock: 80, w: 0 }, { type: "dragon", knock: 85, w: 0 }, { type: "bogtyrant", knock: 88, w: 0 }, { type: "bat", knock: 90, w: 0 }, { type: "calderatyrant", knock: 90, w: 0 }, { type: "wendigo", knock: 95, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.longshot && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.ram + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.ram());
  ok("2 byte-id OFF (fresh boot): RAM_SURGE.enabled false AND G.ramBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "ramFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiKnock=${dark.hiKnock} midKnock=${dark.midKnock} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no ramFind/ramBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(ramFind|ramBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"ramBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'ramFind'/'ramBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.ram({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.ram({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.ram({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ knockProbe LUT: knock→band→weight (UMBRAL hiKnock/midKnock), type-independiente.
  const knp = await page.evaluate((cases) => cases.map(c => window.__dev.ram({ knockProbe: { knock: c.knock } }).knockProbe), EXPECT_KNOCK);
  const knpOK = EXPECT_KNOCK.every((c, i) => knp[i] && knp[i].band === c.band && knp[i].weight === c.w);
  ok("5b ★ knockProbe LUT: knock≥200⇒battering⇒2; knock≥110⇒forceful⇒1; knock<110⇒light⇒0 (UMBRAL hiKnock/midKnock, bordes 200/110/109 exactos)",
     knpOK, JSON.stringify(knp.map(x => ({ k: x.knock, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnRam pushes a real mob of TYPE to G.enemies; reads ramWeight from ETPL[type].knock.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.ram({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.ram({ clearRam: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.ram({ spawnRam: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRam;
      const tp = window.__dev.ram({ ramProbe: true }).ramProbe;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srKnock: sr.knock, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineKnock: mine ? mine.knock : -1 });
    }
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srKnock === c.knock && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineKnock === c.knock && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnRam empuja un mob REAL del TIPO; ramProbe lee el peso REAL de ETPL[type].knock ⇒ moose/ironback/magmabrute/toadbrute/charger⇒2, rat/bandit/demon/skeleton/revenant/quillback/mudlurker/wolf/orc⇒1, summoner/healer/wisp/mage/golem/dragon/bat/…⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, k: x.srKnock, w: x.srW }))));

  // 7b ★ ⊥override/#74/champion/élite OVERRIDE: orc con e.tpl.knock escalado a 999 (mimetiza AMBUSH.elite) ⇒ ramOf lee ETPL['orc'].knock=150 BASE ⇒ weight SIGUE 1 pese a clon 999. charger con override 10 ⇒ base 235 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.ram({ spawnRam: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnRam;
    window.__dev.ram({ clearRam: true });
    const orcOvr = window.__dev.ram({ spawnRam: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideKnock: 999 } }).spawnRam;
    const tp1 = window.__dev.ram({ ramProbe: true }).ramProbe;   // lectura REAL: sigue leyendo base ⇒ 1
    window.__dev.ram({ clearRam: true });
    const chOvr = window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1], overrideKnock: 10 } }).spawnRam;   // clon apagado a 10
    const tp2 = window.__dev.ram({ ramProbe: true }).ramProbe;   // sigue leyendo base 235 ⇒ 2
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), ch2 = tp2.mobs.find(m => m.type === "charger");
    return { orcBaseKnock: orcBase.knock, orcBaseW: orcBase.weight, orcOvrKnock: orcOvr.knock, orcOvrTplKnock: orcOvr.tplKnock, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      chOvrKnock: chOvr.knock, chOvrTplKnock: chOvr.tplKnock, chOvrW: chOvr.weight, tp2W: ch2 ? ch2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseKnock === 150 && ovr.orcBaseW === 1 &&
    ovr.orcOvrKnock === 150 && ovr.orcOvrTplKnock === 999 && ovr.orcOvrW === 1 && ovr.tp1W === 1 &&   // clon 999, BASE 150 ⇒ ram 1 (NO salta a 2)
    ovr.chOvrKnock === 235 && ovr.chOvrTplKnock === 10 && ovr.chOvrW === 2 && ovr.tp2W === 2;         // clon 10, BASE 235 ⇒ ram 2 (NO cae a 0)
  ok("7b ★ ⊥override/#74/champion/élite OVERRIDE: e.tpl.knock escalado (mimetiza AMBUSH.elite ×knockMul) ⇒ ramOf lee ETPL[type].knock BASE ⇒ orc SIGUE ram1 (base 150 pese a clon 999), charger SIGUE ram2 (base 235 pese a clon 10) — desacople del clon (EXACTAMENTE lo que élite/campeón sobrescriben)",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#97 sentinel crux: golem (knock60⇒ram0, aggro360⇒sentinel2) vs charger (knock235⇒ram2, aggro300⇒sentinel1). ORDEN OPUESTO.
  const crux97 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.sentinel({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true }); window.__dev.sentinel({ clearSentinel: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { ram: window.__dev.ram().score, sentinel: window.__dev.sentinel().score }; };
    const golem = read("golem"), charger = read("charger");
    window.__dev.ram({ clearRam: true }); window.__dev.sentinel({ clearSentinel: true });
    window.__dev.ram({ enabled: false }); window.__dev.sentinel({ enabled: false });
    return { golem, charger };
  }, Z);
  const crux97OK = crux97.golem.ram === 0 && crux97.golem.sentinel === 2 && crux97.charger.ram === 2 && crux97.charger.sentinel === 1;
  ok("8 ★ ⊥#97 crux: GOLEM (knock60 ram0/aggro360 sentinel2) VIGÍA-LEVE vs CHARGER (knock235 ram2/aggro300 sentinel1) ARIETE-VIGILANTE — ORDEN OPUESTO (impacto vs percepción, el eje base más reciente)",
     crux97OK, JSON.stringify(crux97));

  // 8b ★ ⊥#96 tough crux: golem (knock60⇒ram0, hp640⇒tough2) vs rat (knock110⇒ram1, hp20⇒tough0). OPUESTO.
  const crux96 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.tough({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true }); window.__dev.tough({ clearTough: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { ram: window.__dev.ram().score, tough: window.__dev.tough().score }; };
    const golem = read("golem"), rat = read("rat");
    window.__dev.ram({ clearRam: true }); window.__dev.tough({ clearTough: true });
    window.__dev.ram({ enabled: false }); window.__dev.tough({ enabled: false });
    return { golem, rat };
  }, Z);
  const crux96OK = crux96.golem.ram === 0 && crux96.golem.tough === 2 && crux96.rat.ram === 1 && crux96.rat.tough === 0;
  ok("8b ★ ⊥#96 crux: GOLEM (knock60 ram0/hp640 tough2) COLOSO-LEVE vs RAT (knock110 ram1/hp20 tough0) FRÁGIL-FIRME — ORDEN OPUESTO (impacto vs durabilidad)",
     crux96OK, JSON.stringify(crux96));

  // 8c ★ ⊥#95 menace crux: golem (knock60⇒ram0, dmg30⇒menace2) vs rat (knock110⇒ram1, dmg6⇒menace0). OPUESTO.
  const crux95 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.menace({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true }); window.__dev.menace({ clearMenace: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { ram: window.__dev.ram().score, menace: window.__dev.menace().score }; };
    const golem = read("golem"), rat = read("rat");
    window.__dev.ram({ clearRam: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.ram({ enabled: false }); window.__dev.menace({ enabled: false });
    return { golem, rat };
  }, Z);
  const crux95OK = crux95.golem.ram === 0 && crux95.golem.menace === 2 && crux95.rat.ram === 1 && crux95.rat.menace === 0;
  ok("8c ★ ⊥#95 crux: GOLEM (knock60 ram0/dmg30 menace2) DURO-LEVE vs RAT (knock110 ram1/dmg6 menace0) DÉBIL-FIRME — ORDEN OPUESTO (impacto vs daño)",
     crux95OK, JSON.stringify(crux95));

  // 8d ★ ⊥#94 swift crux: bat (knock90⇒ram0, spd158⇒swift2) vs charger (knock235⇒ram2, spd74⇒swift0). DIAMÉTRICAMENTE OPUESTOS.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { ram: window.__dev.ram().score, swift: window.__dev.swift().score }; };
    const bat = read("bat"), charger = read("charger");
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false }); window.__dev.swift({ enabled: false });
    return { bat, charger };
  }, Z);
  const crux94OK = crux94.bat.ram === 0 && crux94.bat.swift === 2 && crux94.charger.ram === 2 && crux94.charger.swift === 0;
  ok("8d ★ ⊥#94 crux: BAT (knock90 ram0/spd158 swift2) VELOZ-LEVE vs CHARGER (knock235 ram2/spd74 swift0) LENTO-ARIETE — ram alto donde swift cero ⇒ DIAMÉTRICAMENTE OPUESTOS (impacto vs rapidez)",
     crux94OK, JSON.stringify(crux94));

  // 8e ★ ⊥#92 bulk crux: golem (knock60⇒ram0, sz36⇒bulk2) vs rat (knock110⇒ram1, sz15⇒bulk0). golem mayor bulk / menor ram; rata menor bulk / mayor ram.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.bulk({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { ram: window.__dev.ram().score, bulk: window.__dev.bulk().score }; };
    const golem = read("golem"), rat = read("rat");
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { golem, rat };
  }, Z);
  const crux92OK = crux92.golem.ram === 0 && crux92.golem.bulk === 2 && crux92.rat.ram === 1 && crux92.rat.bulk === 0;
  ok("8e ★ ⊥#92 crux: GOLEM (knock60 ram0/sz36 bulk2) MOLE-GRANDE-BLANDA vs RAT (knock110 ram1/sz15 bulk0) ALIMAÑA-MENUDA-FIRME — golem MAYOR bulk MENOR ram, rata MENOR bulk MAYOR ram ⇒ DIAMÉTRICAMENTE OPUESTOS (impacto vs tamaño)",
     crux92OK, JSON.stringify(crux92));

  // 8f ★ ⊥#84 reach-class crux: moose MELEE (knock200⇒ram2, skirmish0) vs spearman RANGED (knock80⇒ram0, skirmish>0). El melee-ariete puntúa MÁS que el ranged ⇒ REVIERTE #84.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.ram({ clearRam: true });
      window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRam;
      return { ram: window.__dev.ram().score, knock: sr.knock }; };
    const moose = read("moose"), spearman = read("spearman");
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    return { moose, spearman };
  }, Z);
  const crux84OK = crux84.moose.ram === 2 && crux84.spearman.ram === 0;   // moose MELEE (skirmish=0) ram2 > spearman RANGED (skirmish>0) ram0
  ok("8f ★ ⊥#84 crux: MOOSE MELEE (knock200 ram2, e.tpl.ranged=false ⇒ skirmish0) > SPEARMAN RANGED (knock80 ram0, ranged⇒skirmish>0) — el MELEE-ariete puntúa MÁS que el a-distancia ⇒ la CLASE DE ALCANCE (#84) NO predice el impacto, REVIERTE la correlación",
     crux84OK, JSON.stringify(crux84));

  // 9 ★ DIFFERENTIATOR: un CHARGER (ariete knock235⇒ram2, melee point-blank idle prado) ⇒ ram T2 MIENTRAS swift#94/reach#88/heading#90/zona#91 IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.ram();
    const swift = window.__dev.swift().score;                                        // charger spd74 ⇒ swift0
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;      // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                       // charger idle ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, swift, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.swift === 0 && diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;
  ok("9 ★ DIFERENCIADOR: CHARGER (ariete knock235 melee idle point-blank prado) ⇒ ram T2 MIENTRAS swift#94/reach#88/embestida#90/zona#91 IGNORAN (=0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL ramFind: forageChargePreview charger (ariete)>0 ; mago (leve) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });   // charger ⇒ score 2 ⇒ T2
    const actVm = window.__dev.ram();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ spawnRam: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });   // mago ⇒ score 0
    const mageVm = window.__dev.ram();
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    return { actPrev, actCharge, magePrev: mageVm.forageChargePreview, mageTier: mageVm.tier, mageScore: mageVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.magePrev === 0 && forage.mageTier === 0 && forage.mageScore === 0;
  ok("10 CANAL ramFind: forageChargePreview con charger (ariete) ⇒ charge>0 (==ramBonus); con mago (leve) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds ramBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.ram().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>ramBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a charger available
  const neutral = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });   // charger disponible
    window.__dev.ram({ enabled: false });                             // now OFF
    const off = window.__dev.ram();
    window.__dev.ram({ enabled: true }); window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, ramBonus(charger disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip ram OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de ram.
  const orth = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ enabled: false });
    const snap = () => JSON.stringify({ sen: window.__dev.sentinel(), tuf: window.__dev.tough(), men: window.__dev.menace(), swf: window.__dev.swift(), lng: window.__dev.longshot(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), rol: window.__dev.role(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.ram({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.ram();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.ram();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD ramFind ⊥ peers: flip ram OFF→ON NO cambia sentinel/tough/menace/swift/longshot/heading/zonetier/bulk/role/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de ram; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 39 arc flags served true; RAM_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ramDark = flag("RAM_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 39 mecanismos del arco #59-#97 served enabled:true; RAM_SURGE served false (DARK #98)",
     arcAllOn && ramDark && arc.length === 39, `ram=${flag("RAM_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Ariete:" drawn ON+charger / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Ariete:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });   // charger ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Ariete:\" se DIBUJA ON+charger (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.ram({ enabled: true }); window.__dev.ram({ clearRam: true }); window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false }); });

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
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.ram();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const kns = [235, 200, 199, 110, 109, 60].map(v => { const q = window.__dev.ram({ knockProbe: { knock: v } }).knockProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.ram({ ramProbe: true }).ramProbe;
    const mine = tp.mobs.find(m => m.type === "charger") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineKnock: mine ? mine.knock : -1, lut, kns, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineKnock === B.mineKnock && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.kns) === JSON.stringify(B.kns) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO charger+héroe ⇒ score/tier/charge + ramProbe(score,weight,knock) + knockProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineKnock:${A.mineKnock},kns:${JSON.stringify(A.kns)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineKnock:${B.mineKnock},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.ram({ enabled: false }));
  await pageB.evaluate(() => window.__dev.ram({ enabled: false }));

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
