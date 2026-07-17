// CAS-2563 — self-verify for REMATE DE MATÓN (DARK, MENACE_SURGE.enabled:false). EVO mecánica #95 (serializa tras #94 SWIFT_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 36 LIVE #59-#94.
// (A) EJE FRESCO = POTENCIA DE DAÑO BASE del mob TYPE server-auth (la FUERZA OFENSIVA INTRÍNSECA: cuán DURO pega de fábrica — un MATÓN demoledor orco/alce/charger/volátil que arranca vida vs un alfeñique que apenas roza rata/murciélago/lobo, o un habilitador dmg:0 invocador/sanador). server-auth, MMORPG-native (recompensar abatir al pegador peligroso, no al que hace cosquillas).
//     DEDUP: create-race TWIN de CAS-2564 + CAS-2565 (3 umbrellas EVO#95 gemelas, mismo goal, todas a GE, MISMO eje base-daño MENACE_SURGE/menaceFind). CAS-2563 = CANÓNICO (creado primero 14:11:36 vs 14:12:04 vs 14:12:15). Los twins backed off (working-copy dedup dejó una sola declaración). CEO deduplicará CAS-2564/2565.
//     PRE-FLIGHT GATE (recomendado del issue = POTENCIA DE DAÑO / base-attack stat en ETPL) → PASA sin pivote: `dmg` es el campo CANÓNICO de daño base en CADA fila de ETPL (config.js:290+, 0..35), ESCALAR ENTERO ESTÁTICO por template, server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 36 flags #59-#94 lo lee como SCORE de recompensa (los únicos lectores de `.dmg` son escalado de COMBATE WORLD_TIER/ZONE_TIER/afijo/campeón sobre el CLON, tiering de GEAR del héroe, y un probe de debug — jamás recompensa de kill; los 28 *Weight/forage seams NO leen dmg).
//     CLAVE ⊥#74/⊥champion/⊥zona: menaceWeight lee ETPL[e.type].dmg (POTENCIA DE DAÑO BASE INMUTABLE del TIPO), NO e.dmg/e.tpl.dmg — el afijo A.dmgMul ('Feroz' ×1.6), el campeón/élite C.dmgMul (×1.5..2.3) y la zona z.dmgMul (spawn/applyZoneScale) escalan el CLON/entidad viva pero JAMÁS la fila base ⇒ daño DESACOPLADO por construcción (lobo 'Feroz' clon×1.6 sigue menace0, orco deflado sigue menace2).
//     menaceWeight(e)=banda de menaceOf(e)=ETPL[type].dmg: dmg≥hiDmg(22) ⇒ matón/pegador pesado ⇒ 2; dmg≥midDmg(14) ⇒ moderado ⇒ 1; dmg<midDmg ⇒ alfeñique ⇒ 0. El score del kill = menaceWeight(víctima) muestreado en el TOP de killEnemy (_menacePre). La señal VIVA del badge = menaceScore(hero)=MAX menaceWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #94 velocidad/#93 rol/#92 mole/#88 remate).
//     CRUX ⊥36 POTENCIA DE DAÑO BASE ESTÁTICA: ⊥ #94 SWIFT (velocidad kinemática ETPL[type].spd; daño=FUERZA ofensiva — murciélago spd158 swift2/dmg7 menace0 VELOZ pero ALFEÑIQUE vs orco spd64 swift0/dmg24 menace2 LENTO pero MATÓN, DIAMÉTRICAMENTE OPUESTOS). ⊥ #93 ROLE (arch FUNCIÓN de IA; invocador/sanador enabler(rol2, pieza clave) dmg:0 ⇒ menace0, DIAMÉTRICAMENTE OPUESTOS). ⊥ #92 BULK (TAMAÑO ETPL[type].size; volátil sz16 bulk0/dmg23 menace2 MENUDO pero PEGADOR vs invocador sz20 bulk1/dmg0 menace0 OPUESTOS). ⊥ #91 zona (z.dmgMul escala e.dmg VIVO pero menace lee BASE). ⊥ #90/#89/#88/#87/#86/#85/#84/#78/#74/#73/#72 y valor(xp).
// (B) CANAL FRESCO = menaceFind (fichas de amenaza por rematar a un MATÓN — NINGUNA de las 36 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…roleFind #93, swiftFind #94) está LLENA ⇒ moneda FRESCA (h.menaceBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio menaceBountyCap, 0 doble-dip.
//
// ★ dmgProbe LUT (check 5b): dmg→banda→weight — prueba el UMBRAL hiDmg(22)/midDmg(14) (≥22⇒heavy⇒2, ≥14⇒moderate⇒1, <14⇒feeble⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnMenace empuja un mob REAL del TIPO al MISMO G.enemies; menaceProbe lee su peso REAL de ETPL[type].dmg ⇒ revenant/volatile/orc/charger/moose⇒2, skeleton/wraith/mage/bandit/wendigo⇒1, rat/bat/wolf/spearman/summoner⇒0.
// ★ ⊥#74/champion/zona OVERRIDE (check 7b): spawnMenace{type:'wolf',overrideDmg:200} escala el CLON e.dmg/e.tpl.dmg→200 (mimetiza afijo 'Feroz'/campeón/zona); menaceOf lee ETPL['wolf'].dmg=10 BASE ⇒ weight SIGUE 0 pese a eDmg=200. Y orc{overrideDmg:1} ⇒ base 24 ⇒ weight SIGUE 2 pese a eDmg=1. Prueba el desacople del clon por construcción.
// ★ ⊥#94 swift crux (check 8): orc (spd64⇒swift0) es menace2; bat (spd158⇒swift2) es menace0 ⇒ DIAMÉTRICAMENTE OPUESTOS (fuerza ofensiva vs rapidez kinemática).
// ★ ⊥#93 role crux (check 8b): orc (arch brute⇒rol0/brawler) es menace2; summoner (arch summoner⇒rol2/enabler, dmg:0) es menace0 ⇒ OPUESTOS (castigo vs función de IA).
// ★ ⊥#92 bulk crux (check 8c): volatile (sz16⇒bulk0) es menace2; summoner (sz20⇒bulk1) es menace0 ⇒ OPUESTOS (potencia de daño vs tamaño físico).
// ★ DIFERENCIADOR (check 9): un ORCO (menace2) — el predecesor #94 swift lo IGNORA (swift0), rol#93 lo IGNORA (brute⇒0), escaramuza#84 lo IGNORA (melee0), reach#88/heading#90/zona#91/interrupt#89/blood#86/control#85/pack#87 lo IGNORAN (0); bulk#92 lee su tamaño REAL (1, orco es corpulento) ≠ menace(2) ⇒ eje DISTINTO.
// ★ CANAL (check 10): forageChargePreview = menaceBonus(score). Orco (matón) ⇒ charge>0; rata (alfeñique) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(menaceBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con MENACE_SURGE OFF, menaceBonus(cualquier score)==0 y forageChargePreview==0 aun con un orco disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): menace (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de menace.
// ★ 0-REGRESIÓN (check 14): las 36 mecánicas del arco #59-#94 siguen served enabled:true; MENACE_SURGE served false (DARK #95).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + menaceProbe + dmgProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). menaceScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Observado vía __dev.menace (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT + dmgProbe LUT + spawnMenace inyección REAL [+overrideDmg ⊥#74/champion/zona] + clearMenace + menaceProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Amenaza:").
//
// Run: node tools/cas2563-menace-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2563");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723], abyss: [192, 768] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// dmgProbe esperado: dmg→banda→weight (UMBRAL hiDmg 22 / midDmg 14). Cubre los 3 buckets + los bordes exactos de umbral.
const EXPECT_DMG = [
  { dmg: 35, band: "heavy", w: 2 }, { dmg: 26, band: "heavy", w: 2 }, { dmg: 22, band: "heavy", w: 2 },        // ≥hiDmg(22) ⇒ matón ⇒ 2 (borde 22 inclusive)
  { dmg: 21, band: "moderate", w: 1 }, { dmg: 16, band: "moderate", w: 1 }, { dmg: 14, band: "moderate", w: 1 }, // ≥midDmg(14) ⇒ moderado ⇒ 1 (borde 14 inclusive, 21 justo bajo hiDmg)
  { dmg: 13, band: "feeble", w: 0 }, { dmg: 6, band: "feeble", w: 0 }, { dmg: 0, band: "feeble", w: 0 },        // <midDmg ⇒ alfeñique ⇒ 0 (borde 13 justo bajo midDmg)
];
// spawnMenace esperado por TIPO: type → base dmg → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "revenant", dmg: 22, w: 2 }, { type: "volatile", dmg: 23, w: 2 }, { type: "orc", dmg: 24, w: 2 }, { type: "charger", dmg: 25, w: 2 }, { type: "moose", dmg: 26, w: 2 },
  { type: "skeleton", dmg: 14, w: 1 }, { type: "wraith", dmg: 15, w: 1 }, { type: "mage", dmg: 16, w: 1 }, { type: "bandit", dmg: 18, w: 1 }, { type: "wendigo", dmg: 21, w: 1 },
  { type: "rat", dmg: 6, w: 0 }, { type: "bat", dmg: 7, w: 0 }, { type: "wolf", dmg: 10, w: 0 }, { type: "spearman", dmg: 13, w: 0 }, { type: "summoner", dmg: 0, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.menace + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.menace());
  ok("2 byte-id OFF (fresh boot): MENACE_SURGE.enabled false AND G.menaceBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "menaceFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiDmg=${dark.hiDmg} midDmg=${dark.midDmg} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no menaceFind/menaceBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(menaceFind|menaceBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"menaceBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'menaceFind'/'menaceBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.menace({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.menace({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.menace({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ dmgProbe LUT: dmg→band→weight (UMBRAL hiDmg/midDmg), type-independiente.
  const dpp = await page.evaluate((cases) => cases.map(c => window.__dev.menace({ dmgProbe: { dmg: c.dmg } }).dmgProbe), EXPECT_DMG);
  const dppOK = EXPECT_DMG.every((c, i) => dpp[i] && dpp[i].band === c.band && dpp[i].weight === c.w);
  ok("5b ★ dmgProbe LUT: dmg≥22⇒heavy⇒2; dmg≥14⇒moderate⇒1; dmg<14⇒feeble⇒0 (UMBRAL hiDmg/midDmg, bordes 22/14/13 exactos)",
     dppOK, JSON.stringify(dpp.map(x => ({ dmg: x.dmg, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnMenace pushes a real mob of TYPE to G.enemies; reads menaceWeight from ETPL[type].dmg.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.menace({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.menace({ clearMenace: true });
      window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.menace({ spawnMenace: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnMenace;
      const sp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
      out.push({ type: c.type, srDmg: sr.dmg, srW: sr.weight, valid: sr.valid, spScore: sp.score, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spDmg: sp.mobs[0] ? sp.mobs[0].dmg : -1, spType: sp.mobs[0] ? sp.mobs[0].type : "" });
    }
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srDmg === c.dmg && server7[i].srW === c.w && server7[i].valid && server7[i].spW === c.w && server7[i].spDmg === c.dmg && server7[i].spType === c.type);
  ok("7 ★ REAL SERVER-AUTH: spawnMenace empuja un mob REAL del TIPO; menaceProbe lee el peso REAL de ETPL[type].dmg ⇒ revenant/volatile/orc/charger/moose⇒2, skeleton/wraith/mage/bandit/wendigo⇒1, rat/bat/wolf/spearman/summoner⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, dmg: x.srDmg, w: x.srW }))));

  // 7b ★ ⊥#74/champion/zona OVERRIDE: wolf con e.dmg/e.tpl.dmg escalado a 200 (mimetiza afijo 'Feroz'/campeón/zona) ⇒ menaceOf lee ETPL['wolf'].dmg=10 BASE ⇒ weight SIGUE 0 pese a eDmg=200. orc con override 1 (deflado) ⇒ base 24 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const wolfBase = window.__dev.menace({ spawnMenace: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1] } }).spawnMenace;
    window.__dev.menace({ clearMenace: true });
    const wolfOvr = window.__dev.menace({ spawnMenace: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1], overrideDmg: 200 } }).spawnMenace;
    const sp1 = window.__dev.menace({ menaceProbe: true }).menaceProbe;   // lectura REAL: sigue leyendo base ⇒ 0
    window.__dev.menace({ clearMenace: true });
    const orcOvr = window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideDmg: 1 } }).spawnMenace;   // afijo/zona deflaciona el clon
    const sp2 = window.__dev.menace({ menaceProbe: true }).menaceProbe;   // sigue leyendo base 24 ⇒ 2
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    return { wolfBaseDmg: wolfBase.dmg, wolfBaseW: wolfBase.weight, wolfOvrDmg: wolfOvr.dmg, wolfOvrEDmg: wolfOvr.eDmg, wolfOvrTpl: wolfOvr.tplDmg, wolfOvrW: wolfOvr.weight, sp1W: sp1.mobs[0] ? sp1.mobs[0].weight : -99,
      orcOvrDmg: orcOvr.dmg, orcOvrEDmg: orcOvr.eDmg, orcOvrW: orcOvr.weight, sp2W: sp2.mobs[0] ? sp2.mobs[0].weight : -99 };
  }, Z);
  const ovrOK = ovr.wolfBaseDmg === 10 && ovr.wolfBaseW === 0 &&
    ovr.wolfOvrDmg === 10 && ovr.wolfOvrEDmg === 200 && ovr.wolfOvrW === 0 && ovr.sp1W === 0 &&   // clon eDmg=200, BASE 10 ⇒ menace 0 (NO salta a 2)
    ovr.orcOvrDmg === 24 && ovr.orcOvrEDmg === 1 && ovr.orcOvrW === 2 && ovr.sp2W === 2;          // clon eDmg=1, BASE 24 ⇒ menace 2 (NO cae a 0)
  ok("7b ★ ⊥#74/champion/zona OVERRIDE: e.dmg/e.tpl.dmg escalado (mimetiza afijo A.dmgMul/campeón C.dmgMul/zona z.dmgMul) ⇒ menaceOf lee ETPL[type].dmg BASE ⇒ wolf SIGUE menace0 (base 10 pese a clon 200), orc SIGUE menace2 (base 24 pese a clon 1) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#94 swift crux: orc (spd64⇒swift0) es menace2; bat (spd158⇒swift2) es menace0. DIAMÉTRICAMENTE OPUESTOS (fuerza ofensiva vs rapidez).
  const crux = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true }); window.__dev.swift({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const orc = { menace: window.__dev.menace().score, swift: window.__dev.swift().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ spawnMenace: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const bat = { menace: window.__dev.menace().score, swift: window.__dev.swift().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false }); window.__dev.swift({ enabled: false });
    return { orc, bat };
  }, Z);
  const cruxOK = crux.orc.menace === 2 && crux.orc.swift === 0 &&        // orc: menace 2 (matón), swift 0 (plúmbeo)
    crux.bat.menace === 0 && crux.bat.swift === 2;                       // bat: menace 0 (alfeñique), swift 2 (escurridiza)
  ok("8 ★ ⊥#94 crux: ORCO (spd64⇒swift0) menace2; MURCIÉLAGO (spd158⇒swift2) menace0 — menace alto donde swift cero, menace cero donde swift alto ⇒ DIAMÉTRICAMENTE OPUESTOS (fuerza ofensiva vs rapidez)",
     cruxOK, JSON.stringify(crux));

  // 8b ★ ⊥#93 role crux: orc (arch brute⇒rol0/brawler) es menace2; summoner (arch summoner⇒rol2/enabler, dmg:0) es menace0. OPUESTOS.
  const crux93 = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true }); window.__dev.role({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const orc = { menace: window.__dev.menace().score, role: window.__dev.role().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ spawnMenace: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { menace: window.__dev.menace().score, role: window.__dev.role().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false }); window.__dev.role({ enabled: false });
    return { orc, summoner };
  }, Z);
  const crux93OK = crux93.orc.menace === 2 && crux93.orc.role === 0 &&    // orc: menace 2, role 0 (brute/brawler)
    crux93.summoner.menace === 0 && crux93.summoner.role === 2;          // summoner: menace 0 (dmg:0), role 2 (enabler)
  ok("8b ★ ⊥#93 crux: ORCO (arch brute⇒rol0) menace2; INVOCADOR (arch summoner⇒rol2/enabler, dmg:0) menace0 — OPUESTOS (potencia de daño vs función de IA)",
     crux93OK, JSON.stringify(crux93));

  // 8c ★ ⊥#92 bulk crux: volatile (sz16⇒bulk0) es menace2; summoner (sz20⇒bulk1) es menace0. OPUESTOS.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "volatile", tx: Z.forest[0], ty: Z.forest[1] } });
    const volatile2 = { menace: window.__dev.menace().score, bulk: window.__dev.bulk().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ spawnMenace: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { menace: window.__dev.menace().score, bulk: window.__dev.bulk().score };
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { volatile2, summoner };
  }, Z);
  const crux92OK = crux92.volatile2.menace === 2 && crux92.volatile2.bulk === 0 &&    // volatile: menace 2 (dmg23), bulk 0 (sz16)
    crux92.summoner.menace === 0 && crux92.summoner.bulk === 1;                        // summoner: menace 0 (dmg0), bulk 1 (sz20)
  ok("8c ★ ⊥#92 crux: VOLÁTIL (sz16⇒bulk0) menace2; INVOCADOR (sz20⇒bulk1) menace0 — OPUESTOS (potencia de daño vs tamaño físico)",
     crux92OK, JSON.stringify(crux92));

  // 9 ★ DIFFERENTIATOR: ORC (menace2) — swift#94/role#93/skirmish#84/reach#88/heading#90/zone#91/interrupt#89/blood#86/control#85/pack#87 IGNORAN; bulk#92 lee tamaño REAL (1) ≠ menace(2).
  const diff = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true }); window.__dev.swift({ enabled: true }); window.__dev.role({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const swiBefore = window.__dev.swift().score;
    const rolBefore = window.__dev.role({ roleProbe: true }).roleProbe.score;
    const bulBefore = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // ORC (brute rol0) dmg24 melee sano suelto no-CC idle point-blank prado: menace T2 pero swift0/rol0/skirmish0/reach0/heading0/zone0/interrupt0/blood0/control0/pack0; bulk lee tamaño REAL (sz22⇒1) ≠ menace(2)
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.menace();
    const swiAfter = window.__dev.swift().score;
    const rolAfter = window.__dev.role({ roleProbe: true }).roleProbe.score;
    const bulAfter = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                     // orc idle estacionario ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false }); window.__dev.swift({ enabled: false }); window.__dev.role({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      swiBefore, swiAfter, rolBefore, rolAfter, bulBefore, bulAfter, skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&                         // menace fires (orc matón T2)
    diff.swiAfter === diff.swiBefore && diff.swiAfter === 0 &&                                      // swift #94 IGNORA (orc spd64 ⇒ 0)
    diff.rolAfter === diff.rolBefore && diff.rolAfter === 0 &&                                      // rol #93 IGNORA (brute ⇒ 0)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                         // escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0 &&                                  // reach #88 / embestida #90 / zona #91 IGNORAN
    diff.bulAfter === 1 && diff.bulAfter !== diff.score;                                            // bulk #92 lee tamaño REAL (orco sz22⇒1) ≠ menace(2) ⇒ eje DISTINTO
  ok("9 ★ DIFERENCIADOR: ORCO (menace2) ⇒ swift/rol/escaramuza/manada/siega/control/interrupt/reach/embestida/zona IGNORAN (0); bulk lee tamaño REAL (1) ≠ menace(2) ⇒ eje DISTINTO",
     diffOK, JSON.stringify(diff));

  // 10 CANAL menaceFind: forageChargePreview orc (matón)>0 ; rata (alfeñique) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc ⇒ score 2 ⇒ T2
    const actVm = window.__dev.menace();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ spawnMenace: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } });   // rata ⇒ score 0
    const ratVm = window.__dev.menace();
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    return { actPrev, actCharge, ratPrev: ratVm.forageChargePreview, ratTier: ratVm.tier, ratScore: ratVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.ratPrev === 0 && forage.ratTier === 0 && forage.ratScore === 0;
  ok("10 CANAL menaceFind: forageChargePreview con orc (matón) ⇒ charge>0 (==menaceBonus); con rata (alfeñique) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds menaceBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.menace().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>menaceBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with an orc available
  const neutral = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc disponible
    window.__dev.menace({ enabled: false });                             // now OFF
    const off = window.__dev.menace();
    window.__dev.menace({ enabled: true }); window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, menaceBonus(orc disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip menace OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de menace.
  const orth = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ enabled: false });
    const snap = () => JSON.stringify({ swi: window.__dev.swift(), blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), rol: window.__dev.role(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.menace({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.menace();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.menace();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD menaceFind ⊥ peers: flip menace OFF→ON NO cambia swift/bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/zonetier/bulk/role/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de menace; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 36 arc flags served true; MENACE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const menaceDark = flag("MENACE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 36 mecanismos del arco #59-#94 served enabled:true; MENACE_SURGE served false (DARK #95)",
     arcAllOn && menaceDark && arc.length === 36, `menace=${flag("MENACE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Amenaza:" drawn ON+orc / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Amenaza:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Amenaza:\" se DIBUJA ON+orc (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.menace({ enabled: true }); window.__dev.menace({ clearMenace: true }); window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false }); });

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
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.menace();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const dmgs = [35, 22, 21, 14, 13, 6].map(v => { const q = window.__dev.menace({ dmgProbe: { dmg: v } }).dmgProbe; return { v, b: q.band, w: q.weight }; });
    const sp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spDmg: sp.mobs[0] ? sp.mobs[0].dmg : -1, spType: sp.mobs[0] ? sp.mobs[0].type : "", lut, dmgs, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && A.spW === B.spW && A.spDmg === B.spDmg && A.spType === B.spType && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.dmgs) === JSON.stringify(B.dmgs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO orc+héroe ⇒ score/tier/charge + menaceProbe(score,count,weight,dmg,type) + dmgProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},spScore:${A.spScore},spCount:${A.spCount},spW:${A.spW},spDmg:${A.spDmg},spType:${A.spType},dmgs:${JSON.stringify(A.dmgs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},spScore:${B.spScore},spW:${B.spW},spDmg:${B.spDmg},spType:${B.spType},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.menace({ enabled: false }));
  await pageB.evaluate(() => window.__dev.menace({ enabled: false }));

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
