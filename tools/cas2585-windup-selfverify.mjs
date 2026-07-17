// CAS-2585 — self-verify for REMATE DE PRESAGIO (DARK, WINDUP_SURGE.enabled:false). EVO mecánica #99 (serializa tras #98 RAM_SURGE LIVE&served 0a45234850cd) — EJE FRESCO + CANAL FRESCO, ⊥ a las 40 LIVE #59-#98.
// (A) EJE FRESCO = TIEMPO DE PRESAGIO / WIND-UP BASE del mob TYPE server-auth (la CADENCIA DE ANTICIPACIÓN INTRÍNSECA: cuánto TELEGRAFÍA su TIPO de fábrica ANTES de golpear — un pegador ponderoso muy telegrafiado como golem0.95/summoner0.95/dragón0.92/mage0.9/moose0.88/ironback0.86 con un aviso LARGO y legible vs un golpe medido charger0.66/orco0.82 o un jab SÚBITO bat0.28/rat0.35/wolf0.42 que apenas presagia). server-auth, MMORPG-native (recompensar castigar el amago largo que aprendiste a leer, no al que te sorprende sin aviso).
//     PRE-FLIGHT GATE PASA sin pivote: `windup` es ESCALAR DECIMAL ESTÁTICO por template (config.js:290+, 0.28..0.95 en 31 tipos), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO daño-del-héroe), y NINGUNA de las 40 flags #59-#98 lo lee como SCORE. Los ÚNICOS lectores de `.windup`: (a) la máquina de estados de la IA (arma e.st=tpl.windup, DURACIÓN del estado — comportamiento) y (b) el render del TELL (dibuja el amago). CRUX ⊥#89 INTERRUPT lee e.state DINÁMICO (¿ejecuta AHORA?), NO ETPL[type].windup ESTÁTICO (cuánto dura el tell del TIPO).
//     CLAVE ⊥override/⊥#74/⊥champion/⊥élite: windWeight lee ETPL[e.type].windup (AMAGO BASE INMUTABLE del TIPO), NO e.tpl.windup (el CLON) — si un spawn escalado/élite sobrescribiera el clon, windOf lo IGNORA y lee la fila base ⇒ un orco campeón SIGUE wind1 (base 0.82). applyZoneScale escala hp/dmg/spd/xp pero NUNCA windup ⇒ presagio INDEPENDIENTE de zona.
//     windWeight(e)=banda de windOf(e)=ETPL[type].windup: windup≥hiWind(0.85) ⇒ ponderoso ⇒ 2; windup≥midWind(0.62) ⇒ medido ⇒ 1; windup<midWind ⇒ súbito ⇒ 0. El score del kill = windWeight(víctima) muestreado en el TOP de killEnemy (_windPre). La señal VIVA del badge = windScore(hero)=MAX windWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #98 impacto/#97 vigilancia/#96 aguante/#95 daño/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥40 TIEMPO DE PRESAGIO/WIND-UP BASE ESTÁTICO: ⊥ #98 RAM (IMPACTO/knock — golem knock60 ram0/windup0.95 wind2 LEVE-PONDEROSO vs charger knock235 ram2/windup0.66 wind1 ORDEN OPUESTO). ⊥ #97 SENTINEL (VIGILANCIA/aggro — ironback aggro220 sentinel0/windup0.86 wind2 vs mudlurker aggro250 sentinel1/windup0.48 wind0 OPUESTO). ⊥ #96 TOUGH (AGUANTE/HP — charger hp140 tough2/windup0.66 wind1 vs mage hp56 tough1/windup0.9 wind2 OPUESTO). ⊥ #95 MENACE (DAÑO — summoner dmg0 menace0/windup0.95 wind2 vs volatile dmg23 menace2/windup0.7 wind1 OPUESTO). ⊥ #94 SWIFT (VELOCIDAD — murciélago spd158 swift2/windup0.28 wind0 vs golem spd46 swift0/windup0.95 wind2 DIAMÉTRICAMENTE OPUESTOS). ⊥ #92 BULK (TAMAÑO — charger sz26 bulk2/windup0.66 wind1 vs summoner sz20 bulk1/windup0.95 wind2 OPUESTO). ⊥ #89 INTERRUPT (ESTADO DE ACCIÓN DINÁMICO e.state — golem idle wind2/interrupt0 vs bat idle wind0/interrupt0: MISMO interrupt DISTINTO wind ⇒ wind NO es función del estado-de-acción). ⊥ #91/#90/#88/#87/#86/#85/#84/#74/#73/#78/#72/#2426.
// (B) CANAL FRESCO = windFind (fichas de presagio por rematar a un TELEGRAFIADO — NINGUNA de las 40 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…ramFind #98) está LLENA ⇒ moneda FRESCA (h.windBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio windBountyCap, 0 doble-dip.
//
// ★ windupProbe LUT (check 5b): windup→banda→weight — prueba el UMBRAL hiWind(0.85)/midWind(0.62) (≥0.85⇒deliberate⇒2, ≥0.62⇒measured⇒1, <0.62⇒snappy⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnWind empuja un mob REAL del TIPO al MISMO G.enemies; windProbe lee su peso REAL de ETPL[type].windup.
// ★ ⊥override/#74/champion/élite OVERRIDE (check 7b): spawnWind{type:'orc',overrideWindup:0.99} escala el CLON e.tpl.windup→0.99; windOf lee ETPL['orc'].windup=0.82 BASE ⇒ weight SIGUE 1 pese a clon 0.99. Y golem{overrideWindup:0.1} ⇒ base 0.95 ⇒ weight SIGUE 2 pese a clon 0.1.
// ★ ⊥#98 ram crux (check 8): golem (windup0.95⇒wind2, knock60⇒ram0) vs charger (windup0.66⇒wind1, knock235⇒ram2) ⇒ ORDEN OPUESTO.
// ★ ⊥#97 sentinel crux (check 8b): ironback (windup0.86⇒wind2, aggro220⇒sentinel0) vs mudlurker (windup0.48⇒wind0, aggro250⇒sentinel1) ⇒ OPUESTO.
// ★ ⊥#96 tough crux (check 8c): charger (windup0.66⇒wind1, hp140⇒tough2) vs mage (windup0.9⇒wind2, hp56⇒tough1) ⇒ OPUESTO.
// ★ ⊥#95 menace crux (check 8d): summoner (windup0.95⇒wind2, dmg0⇒menace0) vs volatile (windup0.7⇒wind1, dmg23⇒menace2) ⇒ OPUESTO.
// ★ ⊥#94 swift crux (check 8e): bat (windup0.28⇒wind0, spd158⇒swift2) vs golem (windup0.95⇒wind2, spd46⇒swift0) ⇒ DIAMÉTRICAMENTE OPUESTOS.
// ★ ⊥#92 bulk crux (check 8f): charger (windup0.66⇒wind1, sz26⇒bulk2) vs summoner (windup0.95⇒wind2, sz20⇒bulk1) ⇒ OPUESTO.
// ★ ⊥#89 interrupt crux (check 8g): golem idle (windup0.95⇒wind2, e.state idle⇒interrupt0) vs bat idle (windup0.28⇒wind0, interrupt0): MISMO interrupt (0, estado idle) DISTINTO wind (2 vs 0) ⇒ wind lee la CONSTANTE ETPL[type].windup, NO el e.state DINÁMICO (disjunto — interrupt colapsa a 0 ambos, wind los separa).
// ★ DIFERENCIADOR (check 9): un GOLEM (ponderoso windup0.95⇒wind2, spd46 slow, knock60 leve, idle prado) ⇒ wind T2 MIENTRAS swift#94=0 (lento), ram#98=0 (leve empuje), heading#90=0 (idle), zone#91=0 (prado).
// ★ CANAL (check 10): forageChargePreview = windBonus(score). Golem (ponderoso) ⇒ charge>0; bat (súbito) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(windBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con WINDUP_SURGE OFF, windBonus(cualquier score)==0 y forageChargePreview==0 aun con un golem disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): wind (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de wind.
// ★ 0-REGRESIÓN (check 14): las 40 mecánicas del arco #59-#98 siguen served enabled:true; WINDUP_SURGE served false (DARK #99).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + windProbe + windupProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). windScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2585-windup-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2585");
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
// windupProbe esperado: windup→banda→weight (UMBRAL hiWind 0.85 / midWind 0.62). Cubre los 3 buckets + los bordes exactos.
const EXPECT_WINDUP = [
  { windup: 0.95, band: "deliberate", w: 2 }, { windup: 0.88, band: "deliberate", w: 2 }, { windup: 0.85, band: "deliberate", w: 2 },  // ≥hiWind(0.85) ⇒ ponderoso ⇒ 2 (borde 0.85 inclusive)
  { windup: 0.84, band: "measured", w: 1 }, { windup: 0.7, band: "measured", w: 1 }, { windup: 0.62, band: "measured", w: 1 },           // ≥midWind(0.62) ⇒ medido ⇒ 1 (borde 0.62 inclusive, 0.84 justo bajo hiWind)
  { windup: 0.61, band: "snappy", w: 0 }, { windup: 0.42, band: "snappy", w: 0 }, { windup: 0, band: "snappy", w: 0 },                   // <midWind ⇒ súbito ⇒ 0 (borde 0.61 justo bajo midWind)
];
// spawnWind esperado por TIPO: type → base windup → weight. Cubre bandas 0/1/2 con mobs REALES (excluye adv neutral).
const EXPECT_TYPE = [
  { type: "mage", windup: 0.9, w: 2 }, { type: "wraith", windup: 0.85, w: 2 }, { type: "golem", windup: 0.95, w: 2 }, { type: "dragon", windup: 0.92, w: 2 }, { type: "moose", windup: 0.88, w: 2 }, { type: "summoner", windup: 0.95, w: 2 }, { type: "wendigo", windup: 0.85, w: 2 }, { type: "wisp", windup: 0.85, w: 2 }, { type: "bogtyrant", windup: 0.94, w: 2 }, { type: "ashwraith", windup: 0.9, w: 2 }, { type: "ironback", windup: 0.86, w: 2 }, { type: "thornspitter", windup: 0.85, w: 2 }, { type: "emberkin", windup: 0.88, w: 2 }, { type: "magmabrute", windup: 0.88, w: 2 }, { type: "calderatyrant", windup: 0.95, w: 2 },
  { type: "orc", windup: 0.82, w: 1 }, { type: "spearman", windup: 0.7, w: 1 }, { type: "charger", windup: 0.66, w: 1 }, { type: "healer", windup: 0.82, w: 1 }, { type: "volatile", windup: 0.7, w: 1 }, { type: "revenant", windup: 0.62, w: 1 }, { type: "demon", windup: 0.82, w: 1 }, { type: "toadbrute", windup: 0.68, w: 1 },
  { type: "wolf", windup: 0.42, w: 0 }, { type: "rat", windup: 0.35, w: 0 }, { type: "skeleton", windup: 0.6, w: 0 }, { type: "bat", windup: 0.28, w: 0 }, { type: "bandit", windup: 0.5, w: 0 }, { type: "quillback", windup: 0.6, w: 0 }, { type: "mudlurker", windup: 0.48, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wind && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.interrupt && window.__dev.heading && window.__dev.longshot && window.__dev.apex && window.__dev.scarcity && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.wind + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.wind());
  ok("2 byte-id OFF (fresh boot): WINDUP_SURGE.enabled false AND G.windBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "windFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiWind=${dark.hiWind} midWind=${dark.midWind} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no windFind/windBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(windFind|windBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"windBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'windFind'/'windBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.wind({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.wind({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.wind({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ windupProbe LUT: windup→band→weight (UMBRAL hiWind/midWind), type-independiente.
  const wnp = await page.evaluate((cases) => cases.map(c => window.__dev.wind({ windupProbe: { windup: c.windup } }).windupProbe), EXPECT_WINDUP);
  const wnpOK = EXPECT_WINDUP.every((c, i) => wnp[i] && wnp[i].band === c.band && wnp[i].weight === c.w);
  ok("5b ★ windupProbe LUT: windup≥0.85⇒deliberate⇒2; windup≥0.62⇒measured⇒1; windup<0.62⇒snappy⇒0 (UMBRAL hiWind/midWind, bordes 0.85/0.62/0.61 exactos)",
     wnpOK, JSON.stringify(wnp.map(x => ({ w: x.windup, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnWind pushes a real mob of TYPE to G.enemies; reads windWeight from ETPL[type].windup.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.wind({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.wind({ clearWind: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.wind({ spawnWind: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnWind;
      const tp = window.__dev.wind({ windProbe: true }).windProbe;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srWindup: sr.windup, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineWindup: mine ? mine.windup : -1 });
    }
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srWindup === c.windup && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineWindup === c.windup && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnWind empuja un mob REAL del TIPO; windProbe lee el peso REAL de ETPL[type].windup ⇒ golem/summoner/mage/dragon/moose/ironback/…⇒2, orc/charger/demon/spearman/revenant/toadbrute/healer/volatile⇒1, bat/rat/wolf/skeleton/bandit/quillback/mudlurker⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srWindup === EXPECT_TYPE[i].windup && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, wu: x.srWindup, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74/champion/élite OVERRIDE: orc con e.tpl.windup escalado a 0.99 ⇒ windOf lee ETPL['orc'].windup=0.82 BASE ⇒ weight SIGUE 1 pese a clon 0.99. golem con override 0.1 ⇒ base 0.95 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.wind({ spawnWind: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnWind;
    window.__dev.wind({ clearWind: true });
    const orcOvr = window.__dev.wind({ spawnWind: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideWindup: 0.99 } }).spawnWind;
    const tp1 = window.__dev.wind({ windProbe: true }).windProbe;   // lectura REAL: sigue leyendo base ⇒ 1
    window.__dev.wind({ clearWind: true });
    const goOvr = window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1], overrideWindup: 0.1 } }).spawnWind;   // clon apagado a 0.1
    const tp2 = window.__dev.wind({ windProbe: true }).windProbe;   // sigue leyendo base 0.95 ⇒ 2
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), go2 = tp2.mobs.find(m => m.type === "golem");
    return { orcBaseWindup: orcBase.windup, orcBaseW: orcBase.weight, orcOvrWindup: orcOvr.windup, orcOvrTplWindup: orcOvr.tplWindup, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      goOvrWindup: goOvr.windup, goOvrTplWindup: goOvr.tplWindup, goOvrW: goOvr.weight, tp2W: go2 ? go2.weight : -99 };
  }, Z);
  const ovrOK = ovr.orcBaseWindup === 0.82 && ovr.orcBaseW === 1 &&
    ovr.orcOvrWindup === 0.82 && ovr.orcOvrTplWindup === 0.99 && ovr.orcOvrW === 1 && ovr.tp1W === 1 &&   // clon 0.99, BASE 0.82 ⇒ wind 1 (NO salta a 2)
    ovr.goOvrWindup === 0.95 && ovr.goOvrTplWindup === 0.1 && ovr.goOvrW === 2 && ovr.tp2W === 2;         // clon 0.1, BASE 0.95 ⇒ wind 2 (NO cae a 0)
  ok("7b ★ ⊥override/#74/champion/élite OVERRIDE: e.tpl.windup escalado (mimetiza spawn escalado/élite) ⇒ windOf lee ETPL[type].windup BASE ⇒ orc SIGUE wind1 (base 0.82 pese a clon 0.99), golem SIGUE wind2 (base 0.95 pese a clon 0.1) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#98 ram crux: golem (windup0.95⇒wind2, knock60⇒ram0) vs charger (windup0.66⇒wind1, knock235⇒ram2). ORDEN OPUESTO.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true }); window.__dev.ram({ clearRam: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, ram: window.__dev.ram().score }; };
    const golem = read("golem"), charger = read("charger");
    window.__dev.wind({ clearWind: true }); window.__dev.ram({ clearRam: true });
    window.__dev.wind({ enabled: false }); window.__dev.ram({ enabled: false });
    return { golem, charger };
  }, Z);
  const crux98OK = crux98.golem.wind === 2 && crux98.golem.ram === 0 && crux98.charger.wind === 1 && crux98.charger.ram === 2;
  ok("8 ★ ⊥#98 crux: GOLEM (windup0.95 wind2/knock60 ram0) PONDEROSO-LEVE vs CHARGER (windup0.66 wind1/knock235 ram2) SÚBITO-ARIETE — ORDEN OPUESTO (amago vs impacto, el eje base más reciente)",
     crux98OK, JSON.stringify(crux98));

  // 8b ★ ⊥#97 sentinel crux: ironback (windup0.86⇒wind2, aggro220⇒sentinel0) vs mudlurker (windup0.48⇒wind0, aggro250⇒sentinel1). OPUESTO.
  const crux97 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.sentinel({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true }); window.__dev.sentinel({ clearSentinel: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, sentinel: window.__dev.sentinel().score }; };
    const ironback = read("ironback"), mudlurker = read("mudlurker");
    window.__dev.wind({ clearWind: true }); window.__dev.sentinel({ clearSentinel: true });
    window.__dev.wind({ enabled: false }); window.__dev.sentinel({ enabled: false });
    return { ironback, mudlurker };
  }, Z);
  const crux97OK = crux97.ironback.wind === 2 && crux97.ironback.sentinel === 0 && crux97.mudlurker.wind === 0 && crux97.mudlurker.sentinel === 1;
  ok("8b ★ ⊥#97 crux: IRONBACK (windup0.86 wind2/aggro220 sentinel0) PONDEROSO-DESPISTADO vs MUDLURKER (windup0.48 wind0/aggro250 sentinel1) SÚBITO-VIGILANTE — ORDEN OPUESTO (amago vs vigilancia)",
     crux97OK, JSON.stringify(crux97));

  // 8c ★ ⊥#96 tough crux: charger (windup0.66⇒wind1, hp140⇒tough2) vs mage (windup0.9⇒wind2, hp56⇒tough1). OPUESTO.
  const crux96 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.tough({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true }); window.__dev.tough({ clearTough: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, tough: window.__dev.tough().score }; };
    const charger = read("charger"), mage = read("mage");
    window.__dev.wind({ clearWind: true }); window.__dev.tough({ clearTough: true });
    window.__dev.wind({ enabled: false }); window.__dev.tough({ enabled: false });
    return { charger, mage };
  }, Z);
  const crux96OK = crux96.charger.wind === 1 && crux96.charger.tough === 2 && crux96.mage.wind === 2 && crux96.mage.tough === 1;
  ok("8c ★ ⊥#96 crux: CHARGER (windup0.66 wind1/hp140 tough2) SÚBITO-COLOSO vs MAGE (windup0.9 wind2/hp56 tough1) PONDEROSO-FIRME — ORDEN OPUESTO (amago vs durabilidad)",
     crux96OK, JSON.stringify(crux96));

  // 8d ★ ⊥#95 menace crux: summoner (windup0.95⇒wind2, dmg0⇒menace0) vs volatile (windup0.7⇒wind1, dmg23⇒menace2). OPUESTO.
  const crux95 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.menace({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true }); window.__dev.menace({ clearMenace: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, menace: window.__dev.menace().score }; };
    const summoner = read("summoner"), volatile2 = read("volatile");
    window.__dev.wind({ clearWind: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.wind({ enabled: false }); window.__dev.menace({ enabled: false });
    return { summoner, volatile2 };
  }, Z);
  const crux95OK = crux95.summoner.wind === 2 && crux95.summoner.menace === 0 && crux95.volatile2.wind === 1 && crux95.volatile2.menace === 2;
  ok("8d ★ ⊥#95 crux: SUMMONER (windup0.95 wind2/dmg0 menace0) PONDEROSO-INERME vs VOLATILE (windup0.7 wind1/dmg23 menace2) MEDIDO-PEGADOR — ORDEN OPUESTO (amago vs daño)",
     crux95OK, JSON.stringify(crux95));

  // 8e ★ ⊥#94 swift crux: bat (windup0.28⇒wind0, spd158⇒swift2) vs golem (windup0.95⇒wind2, spd46⇒swift0). DIAMÉTRICAMENTE OPUESTOS.
  const crux94 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.swift({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, swift: window.__dev.swift().score }; };
    const bat = read("bat"), golem = read("golem");
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false }); window.__dev.swift({ enabled: false });
    return { bat, golem };
  }, Z);
  const crux94OK = crux94.bat.wind === 0 && crux94.bat.swift === 2 && crux94.golem.wind === 2 && crux94.golem.swift === 0;
  ok("8e ★ ⊥#94 crux: BAT (windup0.28 wind0/spd158 swift2) SÚBITO-VELOZ vs GOLEM (windup0.95 wind2/spd46 swift0) PONDEROSO-LENTO — wind alto donde swift cero ⇒ DIAMÉTRICAMENTE OPUESTOS (amago vs rapidez)",
     crux94OK, JSON.stringify(crux94));

  // 8f ★ ⊥#92 bulk crux: charger (windup0.66⇒wind1, sz26⇒bulk2) vs summoner (windup0.95⇒wind2, sz20⇒bulk1). OPUESTO.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.bulk({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, bulk: window.__dev.bulk().score }; };
    const charger = read("charger"), summoner = read("summoner");
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { charger, summoner };
  }, Z);
  const crux92OK = crux92.charger.wind === 1 && crux92.charger.bulk === 2 && crux92.summoner.wind === 2 && crux92.summoner.bulk === 1;
  ok("8f ★ ⊥#92 crux: CHARGER (windup0.66 wind1/sz26 bulk2) SÚBITO-MOLE vs SUMMONER (windup0.95 wind2/sz20 bulk1) PONDEROSO-MENUDO — ORDEN OPUESTO (amago vs tamaño)",
     crux92OK, JSON.stringify(crux92));

  // 8g ★ ⊥#89 interrupt crux: golem idle (windup0.95⇒wind2, e.state idle⇒interrupt0) vs bat idle (windup0.28⇒wind0, interrupt0). MISMO interrupt, DISTINTO wind ⇒ wind lee la CONSTANTE ETPL[type].windup, NO el e.state DINÁMICO.
  const crux89 = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.interrupt({ enabled: true });
    const read = (type) => { window.__dev.wind({ clearWind: true });
      window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { wind: window.__dev.wind().score, interrupt: window.__dev.interrupt().score }; };
    const golem = read("golem"), bat = read("bat");
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false }); window.__dev.interrupt({ enabled: false });
    return { golem, bat };
  }, Z);
  // ambos recién-spawneados idle ⇒ interrupt 0; wind separa 2 vs 0. Disjunto: wind es ESTÁTICO (ETPL.windup), interrupt es DINÁMICO (e.state).
  const crux89OK = crux89.golem.wind === 2 && crux89.bat.wind === 0 && crux89.golem.interrupt === crux89.bat.interrupt;
  ok("8g ★ ⊥#89 crux: GOLEM idle (windup0.95 wind2) vs BAT idle (windup0.28 wind0) — MISMO interrupt (ambos idle, e.state NO ejecuta) pero wind DISTINTO (2 vs 0) ⇒ wind lee la CONSTANTE ETPL[type].windup (TELEGRAFO ESTÁTICO del TIPO), NO el e.state DINÁMICO (¿ejecuta AHORA?) — DISJUNTOS, NO re-map",
     crux89OK, JSON.stringify(crux89));

  // 9 ★ DIFFERENTIATOR: un GOLEM (ponderoso windup0.95⇒wind2, idle point-blank prado) ⇒ wind T2 MIENTRAS ram#98/swift#94/heading#90/zona#91 IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true }); window.__dev.ram({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.wind();
    const ram = window.__dev.ram().score;                                           // golem knock60 ⇒ ram0
    const swift = window.__dev.swift().score;                                        // golem spd46 ⇒ swift0
    const head = window.__dev.heading().score;                                       // golem idle ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false }); window.__dev.ram({ enabled: false }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, ram, swift, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.ram === 0 && diff.swift === 0 && diff.head === 0 && diff.zoneScore === 0;
  ok("9 ★ DIFERENCIADOR: GOLEM (ponderoso windup0.95, knock60 leve, spd46 lento, idle prado) ⇒ wind T2 MIENTRAS ram#98/swift#94/embestida#90/zona#91 IGNORAN (=0)",
     diffOK, JSON.stringify(diff));

  // 10 CANAL windFind: forageChargePreview golem (ponderoso)>0 ; bat (súbito) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem ⇒ score 2 ⇒ T2
    const actVm = window.__dev.wind();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ spawnWind: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 0
    const batVm = window.__dev.wind();
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    return { actPrev, actCharge, batPrev: batVm.forageChargePreview, batTier: batVm.tier, batScore: batVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.batPrev === 0 && forage.batTier === 0 && forage.batScore === 0;
  ok("10 CANAL windFind: forageChargePreview con golem (ponderoso) ⇒ charge>0 (==windBonus); con bat (súbito) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds windBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.wind().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>windBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a golem available
  const neutral = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem disponible
    window.__dev.wind({ enabled: false });                             // now OFF
    const off = window.__dev.wind();
    window.__dev.wind({ enabled: true }); window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, windBonus(golem disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip wind OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de wind.
  const orth = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ enabled: false });
    const snap = () => JSON.stringify({ ram: window.__dev.ram(), sen: window.__dev.sentinel(), tuf: window.__dev.tough(), men: window.__dev.menace(), swf: window.__dev.swift(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.wind({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.wind();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.wind();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD windFind ⊥ peers: flip wind OFF→ON NO cambia ram/sentinel/tough/menace/swift/interrupt/heading/zonetier/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de wind; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 40 arc flags served true; WINDUP_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const windDark = flag("WINDUP_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 40 mecanismos del arco #59-#98 served enabled:true; WINDUP_SURGE served false (DARK #99)",
     arcAllOn && windDark && arc.length === 40, `wind=${flag("WINDUP_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Presagio:" drawn ON+golem / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Presagio:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });   // golem ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Presagio:\" se DIBUJA ON+golem (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.wind({ enabled: true }); window.__dev.wind({ clearWind: true }); window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false }); });

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
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.wind();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const wns = [0.95, 0.85, 0.84, 0.62, 0.61, 0.28].map(v => { const q = window.__dev.wind({ windupProbe: { windup: v } }).windupProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.wind({ windProbe: true }).windProbe;
    const mine = tp.mobs.find(m => m.type === "golem") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineWindup: mine ? mine.windup : -1, lut, wns, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineWindup === B.mineWindup && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.wns) === JSON.stringify(B.wns) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO golem+héroe ⇒ score/tier/charge + windProbe(score,weight,windup) + windupProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineWindup:${A.mineWindup},wns:${JSON.stringify(A.wns)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineWindup:${B.mineWindup},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.wind({ enabled: false }));
  await pageB.evaluate(() => window.__dev.wind({ enabled: false }));

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
