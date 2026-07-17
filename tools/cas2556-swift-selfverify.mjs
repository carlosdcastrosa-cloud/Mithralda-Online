// CAS-2556 — self-verify for REMATE DE PRESA VELOZ (DARK, SWIFT_SURGE.enabled:false). EVO mecánica #94 (serializa tras #93 ROLE_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 35 LIVE #59-#93.
// (A) EJE FRESCO = VELOCIDAD DE MOVIMIENTO BASE del mob TYPE server-auth (la RAPIDEZ INTRÍNSECA de la criatura: una alimaña escurridiza que corretea — murciélago/kamikaze/lobo — vs un plúmbeo que se arrastra — golem/brujo backline/invocador). server-auth, MMORPG-native (recompensar acorralar a la presa escurridiza que huye rápido, no al plantón ya clavado).
//     DEDUP: gemelo EVO#94 CAS-2557 WORTH_SURGE (xp-worth) SUPERSEDIDO — xp-worth FALLA ⊥#72: SCARCITY_EDGE (#72, LIVE) recompensa esencia por kill = round(scarcityMul(zone)*tpl.xp), PROPORCIONAL a tpl.xp ⇒ una banda-por-xp sería CO-MONÓTONA con la esencia de #72 en la misma zona ⇒ NO ⊥#72 (el writeup de WORTH lo OMITE). VELOCIDAD BASE no la lee NINGÚN seam de recompensa (los 27 *Weight NO leen spd) ⇒ eje limpio. Patch de WORTH preservado en tools/_cas2557-worth-superseded.patch.
//     PRE-FLIGHT GATE (recomendado = KILL-EFFORT / Nº de golpes) → FALLA (idéntico a #93): sin contador entero determinista de golpes-por-mob (hitEnemy hace e.hp-=dmg sin e.hits), y nº-golpes=hp/dmg entrelazado con DPS/tempo del héroe ⇒ NO ⊥ cadence#67/frenzy/combo. Los alternos sancionados fallan: (a) xp-worth NO ⊥#72 (arriba); (b) daño-total DINÁMICO acoplado a la defensa del héroe (bloqueo/esquiva/i-frames ⇒ 0 amenaza a un bruto esquivado) + sin acumulador; (c) edad sin timestamp de spawn horneado. ⇒ pivote al eje FRESCO ESTÁTICO más limpio VELOCIDAD BASE.
//     PRE-FLIGHT del eje VELOCIDAD BASE → PASA: `spd` es ESCALAR ENTERO ESTÁTICO por template (config.js:290+, 56..158), server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 35 flags #59-#93 lo lee como SCORE (`spd` sólo cinemática de movimiento + gait de render). MÁS AÚN: las crux de #92 BULK y #93 ROLE citan EXPLÍCITAMENTE "⊥ velocidad" como el eje RESERVADO-e-INTOCADO ⇒ #94 consume ese eje certificado fresco.
//     CLAVE ⊥#74/⊥#85/⊥zona/⊥champion: swiftWeight lee ETPL[e.type].spd (VELOCIDAD BASE INMUTABLE del TIPO), NO e.spd/e.tpl.spd — el afijo A.spdMul ('Veloz' 1.42/'Acorazado' 0.92), la zona z.spdMul (spawn) y el frost-slow de CC (e.slowT) escalan el CLON/entidad viva pero JAMÁS la fila base ⇒ velocidad DESACOPLADA por construcción (magmabrute 'Veloz' sigue swift0, bat congelado sigue swift2).
//     swiftWeight(e)=banda de swiftOf(e)=ETPL[type].spd: spd≥hiSpd(120) ⇒ escurridiza ⇒ 2; spd≥midSpd(90) ⇒ ágil ⇒ 1; spd<midSpd ⇒ plúmbeo ⇒ 0. El score del kill = swiftWeight(víctima) muestreado en el TOP de killEnemy (_swiftPre). La señal VIVA del badge = swiftScore(hero)=MAX swiftWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #93 rol/#92 mole/#88 remate).
//     CRUX ⊥35 VELOCIDAD BASE ESTÁTICA: ⊥ #93 ROLE (arch FUNCIÓN de IA; velocidad=MAGNITUD de rapidez — wolf rusher(rol0) swift2 vs summoner enabler(rol2) swift0, DIAMÉTRICAMENTE OPUESTOS). ⊥ #92 BULK (TAMAÑO ETPL[type].size; bat sz14 bulk0/spd158 swift2 vs moose sz26 bulk2/spd82 swift0 OPUESTOS). ⊥ #84 ESCARAMUZA (e.tpl.ranged; TODOS los ranged son lentos swift0 pero swift0 MEZCLA melee orc spd64 + ranged mage spd62 ⇒ la banda NO determina alcance: orc melee swift0/skirmish0 vs spearman ranged swift0/skirmish>0, MISMO swift banda distinta). ⊥ #91 zona (z.spdMul escala e.spd VIVO pero swift lee BASE). ⊥ #86 siega (e.hp/e.maxHp DINÁMICO). ⊥ #85 CC (e.slowT ralentiza la entidad viva; swift lee spd BASE). ⊥ #90/#89/#88/#87/#78/#74/#73/#72 y valor(xp).
// (B) CANAL FRESCO = swiftFind (fichas de acoso por rematar a una PRESA ESCURRIDIZA — NINGUNA de las 35 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…bulkFind #92, roleFind #93) está LLENA ⇒ moneda FRESCA (h.swiftBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio swiftBountyCap, 0 doble-dip.
//
// ★ spdProbe LUT (check 5b): spd→banda→weight — prueba el UMBRAL hiSpd(120)/midSpd(90) (≥120⇒swift⇒2, ≥90⇒brisk⇒1, <90⇒plodder⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnSwift empuja un mob REAL del TIPO al MISMO G.enemies; swiftProbe lee su peso REAL de ETPL[type].spd ⇒ bat/volatile/rat/wolf⇒2, mudlurker/bandit/revenant⇒1, orc/mage/summoner/moose⇒0.
// ★ ⊥#74/#85/zona OVERRIDE (check 7b): spawnSwift{type:'magmabrute',overrideSpd:200} escala el CLON e.spd/e.tpl.spd→200 (mimetiza afijo/zona/CC); swiftOf lee ETPL['magmabrute'].spd=56 BASE ⇒ weight SIGUE 0 pese a eSpd=200. Y bat{overrideSpd:10} ⇒ base 158 ⇒ weight SIGUE 2 pese a eSpd=10 (mimetiza frost-slow). Prueba el desacople del clon por construcción.
// ★ ⊥#93 role crux (check 8): wolf (arch rusher⇒rol0/brawler) es swift2; summoner (arch summoner⇒rol2/enabler, la pieza clave más valiosa) es swift0 ⇒ DIAMÉTRICAMENTE OPUESTOS (rapidez vs función de IA).
// ★ ⊥#92 bulk crux (check 8b): bat (sz14⇒bulk0) es swift2; moose (sz26⇒bulk2) es swift0 ⇒ OPUESTOS (rapidez vs tamaño físico).
// ★ ⊥#84 skirmish crux (check 8c): orc (melee, spd64) ⇒ swift0/skirmish0; spearman (ranged, spd78) ⇒ swift0/skirmish>0 ⇒ MISMO swift banda 0, OPUESTO skirmish (la banda swift NO determina alcance).
// ★ DIFERENCIADOR/⊥ TODOS los peers (check 9): un BAT (rusher rol0, sz14⇒bulk0, melee⇒skirmish0, idle, point-blank, sano, no-CC, prado) ⇒ swift T2 MIENTRAS role#93/bulk#92/skirmish#84/pack#87/blood#86/control#85/interrupt#89/reach#88/heading#90/zone#91 lo IGNORAN (todos 0).
// ★ CANAL (check 10): forageChargePreview = swiftBonus(score). Bat (escurridiza) ⇒ charge>0; orco (plúmbeo) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(swiftBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con SWIFT_SURGE OFF, swiftBonus(cualquier score)==0 y forageChargePreview==0 aun con un bat disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): swift (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de swift.
// ★ 0-REGRESIÓN (check 14): las 35 mecánicas del arco #59-#93 siguen served enabled:true; SWIFT_SURGE served false (DARK #94).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + swiftProbe + spdProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). swiftScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Observado vía __dev.swift (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT + spdProbe LUT + spawnSwift inyección REAL [+overrideSpd ⊥#74/#85/zona] + clearSwift + swiftProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Acoso:").
//
// Run: node tools/cas2556-swift-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2556");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// Tiles REALES por zona (mundo determinista 760×908; el mundo se construye igual del mismo seed ⇒ estas tiles caen SIEMPRE en la misma zona). Reutilizadas del arco.
const Z = { forest: [192, 723], abyss: [192, 768] };
// LUT esperada score→{tier,charge}: 0→T0/0, 1→T1/1, ≥2→T2/2 (capado a 2)
const EXPECT_SCORE = [
  { score: 0, t: 0, s: 0 }, { score: 1, t: 1, s: 1 },
  { score: 2, t: 2, s: 2 }, { score: 3, t: 2, s: 2 }, { score: 9, t: 2, s: 2 },
];
// spdProbe esperado: spd→banda→weight (UMBRAL hiSpd 120 / midSpd 90). Cubre los 3 buckets + los bordes exactos de umbral.
const EXPECT_SPD = [
  { spd: 158, band: "swift", w: 2 }, { spd: 128, band: "swift", w: 2 }, { spd: 120, band: "swift", w: 2 },   // ≥hiSpd(120) ⇒ escurridiza ⇒ 2 (borde 120 inclusive)
  { spd: 119, band: "brisk", w: 1 }, { spd: 104, band: "brisk", w: 1 }, { spd: 90, band: "brisk", w: 1 },     // ≥midSpd(90) ⇒ ágil ⇒ 1 (borde 90 inclusive, 119 justo bajo hiSpd)
  { spd: 89, band: "plodder", w: 0 }, { spd: 62, band: "plodder", w: 0 }, { spd: 0, band: "plodder", w: 0 },  // <midSpd ⇒ plúmbeo ⇒ 0 (borde 89 justo bajo midSpd)
];
// spawnSwift esperado por TIPO: type → base spd → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "bat", spd: 158, w: 2 }, { type: "volatile", spd: 152, w: 2 }, { type: "rat", spd: 132, w: 2 }, { type: "wolf", spd: 128, w: 2 },
  { type: "mudlurker", spd: 112, w: 1 }, { type: "bandit", spd: 106, w: 1 }, { type: "revenant", spd: 104, w: 1 },
  { type: "orc", spd: 64, w: 0 }, { type: "mage", spd: 62, w: 0 }, { type: "summoner", spd: 60, w: 0 }, { type: "moose", spd: 82, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.swift + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.swift());
  ok("2 byte-id OFF (fresh boot): SWIFT_SURGE.enabled false AND G.swiftBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "swiftFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSpd=${dark.hiSpd} midSpd=${dark.midSpd} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no swiftFind/swiftBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(swiftFind|swiftBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"swiftBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'swiftFind'/'swiftBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.swift({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.swift({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ spdProbe LUT: spd→band→weight (UMBRAL hiSpd/midSpd), type-independiente.
  const spp = await page.evaluate((cases) => cases.map(c => window.__dev.swift({ spdProbe: { spd: c.spd } }).spdProbe), EXPECT_SPD);
  const sppOK = EXPECT_SPD.every((c, i) => spp[i] && spp[i].band === c.band && spp[i].weight === c.w);
  ok("5b ★ spdProbe LUT: spd≥120⇒swift⇒2; spd≥90⇒brisk⇒1; spd<90⇒plodder⇒0 (UMBRAL hiSpd/midSpd, bordes 120/90/89 exactos)",
     sppOK, JSON.stringify(spp.map(x => ({ spd: x.spd, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnSwift pushes a real mob of TYPE to G.enemies; reads swiftWeight from ETPL[type].spd. bat/volatile/rat/wolf⇒2, mudlurker/bandit/revenant⇒1, orc/mage/summoner/moose⇒0.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.swift({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.swift({ clearSwift: true });
      window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.swift({ spawnSwift: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSwift;
      const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
      out.push({ type: c.type, srSpd: sr.spd, srW: sr.weight, valid: sr.valid, spScore: sp.score, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spSpd: sp.mobs[0] ? sp.mobs[0].spd : -1, spType: sp.mobs[0] ? sp.mobs[0].type : "" });
    }
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srSpd === c.spd && server7[i].srW === c.w && server7[i].valid && server7[i].spW === c.w && server7[i].spSpd === c.spd && server7[i].spType === c.type);
  ok("7 ★ REAL SERVER-AUTH: spawnSwift empuja un mob REAL del TIPO; swiftProbe lee el peso REAL de ETPL[type].spd ⇒ bat/volatile/rat/wolf⇒2, mudlurker/bandit/revenant⇒1, orc/mage/summoner/moose⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, spd: x.srSpd, w: x.srW }))));

  // 7b ★ ⊥#74/#85/zona OVERRIDE: magmabrute con e.spd/e.tpl.spd escalado a 200 (mimetiza afijo 'Veloz'/zona) ⇒ swiftOf lee ETPL['magmabrute'].spd=56 BASE ⇒ weight SIGUE 0 pese a eSpd=200. bat con override 10 (mimetiza frost-slow #85) ⇒ base 158 ⇒ weight SIGUE 2.
  const ovr = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const mbBase = window.__dev.swift({ spawnSwift: { type: "magmabrute", tx: Z.forest[0], ty: Z.forest[1] } }).spawnSwift;
    window.__dev.swift({ clearSwift: true });
    const mbOvr = window.__dev.swift({ spawnSwift: { type: "magmabrute", tx: Z.forest[0], ty: Z.forest[1], overrideSpd: 200 } }).spawnSwift;
    const sp1 = window.__dev.swift({ swiftProbe: true }).swiftProbe;   // lectura REAL: sigue leyendo base ⇒ 0
    window.__dev.swift({ clearSwift: true });
    const batOvr = window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1], overrideSpd: 10 } }).spawnSwift;   // frost-slow deflaciona el clon
    const sp2 = window.__dev.swift({ swiftProbe: true }).swiftProbe;   // sigue leyendo base 158 ⇒ 2
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return { mbBaseSpd: mbBase.spd, mbBaseW: mbBase.weight, mbOvrSpd: mbOvr.spd, mbOvrESpd: mbOvr.eSpd, mbOvrTpl: mbOvr.tplSpd, mbOvrW: mbOvr.weight, sp1W: sp1.mobs[0] ? sp1.mobs[0].weight : -99,
      batOvrSpd: batOvr.spd, batOvrESpd: batOvr.eSpd, batOvrW: batOvr.weight, sp2W: sp2.mobs[0] ? sp2.mobs[0].weight : -99 };
  }, Z);
  const ovrOK = ovr.mbBaseSpd === 56 && ovr.mbBaseW === 0 &&
    ovr.mbOvrSpd === 56 && ovr.mbOvrESpd === 200 && ovr.mbOvrW === 0 && ovr.sp1W === 0 &&   // clon eSpd=200, BASE 56 ⇒ swift 0 (NO salta a 2)
    ovr.batOvrSpd === 158 && ovr.batOvrESpd === 10 && ovr.batOvrW === 2 && ovr.sp2W === 2;  // clon eSpd=10, BASE 158 ⇒ swift 2 (NO cae a 0)
  ok("7b ★ ⊥#74/#85/zona OVERRIDE: e.spd/e.tpl.spd escalado (mimetiza afijo A.spdMul/zona z.spdMul/frost-slow) ⇒ swiftOf lee ETPL[type].spd BASE ⇒ magmabrute SIGUE swift0 (base 56 pese a clon 200), bat SIGUE swift2 (base 158 pese a clon 10) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#93 role crux: wolf (arch rusher⇒rol0/brawler) es swift2; summoner (arch summoner⇒rol2/enabler) es swift0. DIAMÉTRICAMENTE OPUESTOS (rapidez vs función de IA).
  const crux = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.role({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    // WOLF en el PRADO
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1] } });
    const wolf = { swift: window.__dev.swift().score, role: window.__dev.role().score };
    window.__dev.swift({ clearSwift: true });
    // SUMMONER en el PRADO
    window.__dev.swift({ spawnSwift: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { swift: window.__dev.swift().score, role: window.__dev.role().score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false }); window.__dev.role({ enabled: false });
    return { wolf, summoner };
  }, Z);
  const cruxOK = crux.wolf.swift === 2 && crux.wolf.role === 0 &&        // wolf: swift 2 (escurridiza), rol 0 (brawler)
    crux.summoner.swift === 0 && crux.summoner.role === 2;              // summoner: swift 0 (plúmbeo), rol 2 (enabler)
  ok("8 ★ ⊥#93 crux: WOLF (arch rusher⇒rol0) swift2; SUMMONER (arch summoner⇒rol2/enabler, pieza clave) swift0 — swift alto donde rol cero, swift cero donde rol alto ⇒ DIAMÉTRICAMENTE OPUESTOS (rapidez vs función de IA)",
     cruxOK, JSON.stringify(crux));

  // 8b ★ ⊥#92 bulk crux: bat (sz14⇒bulk0) es swift2; moose (sz26⇒bulk2) es swift0. OPUESTOS.
  const crux92 = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const bat = { swift: window.__dev.swift().score, bulk: window.__dev.bulk().score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ spawnSwift: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const moose = { swift: window.__dev.swift().score, bulk: window.__dev.bulk().score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { bat, moose };
  }, Z);
  const crux92OK = crux92.bat.swift === 2 && crux92.bat.bulk === 0 &&    // bat: swift 2, bulk 0 (sz14)
    crux92.moose.swift === 0 && crux92.moose.bulk === 2;                // moose: swift 0, bulk 2 (sz26)
  ok("8b ★ ⊥#92 crux: BAT (sz14⇒bulk0) swift2; MOOSE (sz26⇒bulk2) swift0 — OPUESTOS (rapidez vs tamaño físico)",
     crux92OK, JSON.stringify(crux92));

  // 8c ★ ⊥#84 skirmish crux: orc (melee, spd64) ⇒ swift0/skirmish0; spearman (ranged, spd78) ⇒ swift0/skirmish>0. MISMO swift banda 0, OPUESTO skirmish.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const orc = { swift: window.__dev.swift().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ spawnSwift: { type: "spearman", tx: Z.forest[0], ty: Z.forest[1] } });
    const spearman = { swift: window.__dev.swift().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return { orc, spearman };
  }, Z);
  const crux84OK = crux84.orc.swift === 0 && crux84.orc.skirmish === 0 &&        // orc melee spd64: swift 0, skirmish 0
    crux84.spearman.swift === 0 && crux84.spearman.skirmish > 0;                // spearman ranged spd78: swift 0, skirmish>0
  ok("8c ★ ⊥#84 crux: ORC (melee spd64) ⇒ swift0/skirmish0; SPEARMAN (ranged spd78) ⇒ swift0/skirmish>0 — MISMO swift banda0, OPUESTO skirmish (la banda swift NO determina alcance)",
     crux84OK, JSON.stringify(crux84));

  // 9 ★ DIFFERENTIATOR/⊥ ALL peers: un BAT (rusher rol0, sz14⇒bulk0, melee, idle, point-blank, sano, no-CC, prado) ⇒ swift T2 MIENTRAS TODOS los peers IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.bulk({ enabled: true }); window.__dev.role({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const bulBefore = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const rolBefore = window.__dev.role({ roleProbe: true }).roleProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // BAT (rusher rol0) sz14 melee sano suelto no-CC idle point-blank prado: in-radio de todos los peers, pero rol0/bulk0/melee/suelto/sano/sin-CC/idle/point-blank/zona-inicial ⇒ SÓLO swift dispara
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const bulAfter = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const rolAfter = window.__dev.role({ roleProbe: true }).roleProbe.score;
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                     // bat idle estacionario ⇒ 0
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false }); window.__dev.bulk({ enabled: false }); window.__dev.role({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      bulBefore, bulAfter, rolBefore, rolAfter, skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&                         // swift fires (bat escurridiza T2)
    diff.bulAfter === diff.bulBefore && diff.bulAfter === 0 &&                                      // mole #92 IGNORA (sz14<18 ⇒ 0)
    diff.rolAfter === diff.rolBefore && diff.rolAfter === 0 &&                                      // rol #93 IGNORA (rusher ⇒ 0)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                         // escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;                                    // reach #88 / embestida #90 / zona #91 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥ TODOS: BAT (rusher rol0 sz14 melee sano suelto no-CC idle point-blank prado) ⇒ swift T2 MIENTRAS rol/mole/escaramuza/manada/siega/control/interrupt/reach/embestida/zona IGNORAN",
     diffOK, JSON.stringify(diff));

  // 10 CANAL swiftFind: forageChargePreview bat (escurridiza)>0 ; orco (plúmbeo) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 2 ⇒ T2
    const actVm = window.__dev.swift();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ spawnSwift: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orco ⇒ score 0
    const orcVm = window.__dev.swift();
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return { actPrev, actCharge, orcPrev: orcVm.forageChargePreview, orcTier: orcVm.tier, orcScore: orcVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.orcPrev === 0 && forage.orcTier === 0 && forage.orcScore === 0;
  ok("10 CANAL swiftFind: forageChargePreview con bat (escurridiza) ⇒ charge>0 (==swiftBonus); con orco (plúmbeo) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds swiftBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.swift().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>swiftBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a bat available
  const neutral = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat disponible
    window.__dev.swift({ enabled: false });                             // now OFF
    const off = window.__dev.swift();
    window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, swiftBonus(bat disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip swift OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de swift.
  const orth = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), rol: window.__dev.role(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.swift({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.swift();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.swift();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD swiftFind ⊥ peers: flip swift OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/zonetier/bulk/role/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de swift; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 35 arc flags served true; SWIFT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const swiftDark = flag("SWIFT_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 35 mecanismos del arco #59-#93 served enabled:true; SWIFT_SURGE served false (DARK #94)",
     arcAllOn && swiftDark && arc.length === 35, `swift=${flag("SWIFT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Acoso:" drawn ON+bat / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Acoso:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Acoso:\" se DIBUJA ON+bat (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true }); window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false }); });

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
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const spds = [158, 120, 119, 90, 89, 62].map(v => { const q = window.__dev.swift({ spdProbe: { spd: v } }).spdProbe; return { v, b: q.band, w: q.weight }; });
    const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spSpd: sp.mobs[0] ? sp.mobs[0].spd : -1, spType: sp.mobs[0] ? sp.mobs[0].type : "", lut, spds, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && A.spW === B.spW && A.spSpd === B.spSpd && A.spType === B.spType && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.spds) === JSON.stringify(B.spds) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO bat+héroe ⇒ score/tier/charge + swiftProbe(score,count,weight,spd,type) + spdProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},spScore:${A.spScore},spCount:${A.spCount},spW:${A.spW},spSpd:${A.spSpd},spType:${A.spType},spds:${JSON.stringify(A.spds)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},spScore:${B.spScore},spW:${B.spW},spSpd:${B.spSpd},spType:${B.spType},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  await pageB.evaluate(() => window.__dev.swift({ enabled: false }));

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
