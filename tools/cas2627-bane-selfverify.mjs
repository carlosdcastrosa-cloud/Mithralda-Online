// CAS-2627 — self-verify for REMATE DE PONZOÑA (DARK, BANE_SURGE.enabled:false). EVO mecánica #105 (serializa tras #104 SPLASH_SURGE LIVE&served 7cf773339112/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 46 LIVE #59-#104.
// (A) EJE FRESCO = DURACIÓN DE LA AFLICCIÓN/DEBUFF QUE INFLIGE EL ATAQUE del mob TYPE server-auth (cuánto DURA la secuela — veneno/quemadura/ralentización — que su TIPO deja pegada al golpearte: ETPL[type].infl.dur). Presente EXCLUSIVAMENTE en 4 afligidores (bandit poison4.0/thornspitter poison3.5/emberkin burn2.6/wraith slow2.2), ausente en TODOS los demás (config.js:288+). server-auth, MMORPG-native (recompensar cazar al afligidor cuya secuela más duradera aprendiste a temer).
//     PRE-FLIGHT del eje RECOMENDADO meleeR FALLA (existe SÓLO en 3 warlocks demon54/wendigo50/wisp46 ⇒ banda>0 ⟺ arch:warlock ⇒ COLISIÓN #93 ROLE + #84 ranged) ⇒ PIVOTE al eje FRESCO infl.dur: los 4 portadores MEZCLAN melee (bandit) + ranged (thornspitter/emberkin/wraith) y rusher(bandit)+caster(otros 3) ⇒ NO proxy ni de #84 ni de #93. `infl.dur` es un ESCALAR ESTÁTICO por template (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG) y NINGUNA de las 46 flags #59-#104 lo lee como SCORE. Los ÚNICOS lectores de ETPL[type].infl: la máquina de COMBATE del mob (damageHero→statusOrBuildup aplica el DoT/slow AL HÉROE al golpear — comportamiento, NO puntúa banda) y los probes dev. OJO: `infl` TAMBIÉN aparece en proyectiles de hechizo del héroe (sp.status), el slam de fase-2 del jefe firma (_sb) y la bomba throwable — NINGUNO es ETPL[type].infl (baneWeight lee ETPL[e.type].infl.dur del TIPO del mob VÍCTIMA).
//     CRUX ⊥#84 ESCARAMUZA: tier2 = {bandit MELEE(range48), thornspitter RANGED(range230)} MISMO tier clase OPUESTA; banda0 mezcla melee (wolf/orc sin infl) y ranged (mage sin infl) ⇒ pertenencia a banda ⊥ binario melee/ranged.
//     CRUX ⊥#93 ROLE: portadores span rusher(bandit)+caster(thornspitter/emberkin/wraith) PERO NO todos los rushers/casters; DENTRO de caster thornspitter dur3.5 tier2 vs wraith dur2.2 tier1 vs mage sin-infl tier0 ⇒ 3 bandas MISMO arch ⇒ infl NO es re-map de arch (patrón #104 SPLASH sub-dividía brute; aquí sub-divide caster Y cruza a rusher).
//     CRUX ⊥#102 GEARCHANCE / ⊥#72 SCARCITY: los 4 portadores comparten gearChance0.26 (gear1) PERO barren dur 2.2→4.0 ⇒ aflicción varía DENTRO de gearChance FIJO; y bandit dur4.0/xp30 vs thornspitter dur3.5/xp34 (MÁS aflicción MENOS xp) ⇒ NO co-monótono con xp.
//     CLAVE ⊥override/⊥#74/⊥afijo: baneOf lee ETPL[e.type].infl.dur BASE, NO e.tpl.infl (el CLON) — MOB_AFFIX NO añade infl; applyZoneScale escala hp/dmg/spd/xp pero NUNCA infl ⇒ aflicción INDEPENDIENTE de zona (⊥#91).
//     baneWeight(e)=banda de baneOf(e)=ETPL[type].infl.dur: dur≥hiBane(3.5) ⇒ virulent ⇒ 2; dur≥midBane(2.2) ⇒ noxious ⇒ 1; dur<midBane ⇒ 0. El score del kill = baneWeight(víctima) muestreado en el TOP de killEnemy (_banePre). La señal VIVA del badge = baneScore(hero)=MAX baneWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #104 estallido/#103 bolsa/#102 pertrecho/#92 mole).
// (B) CANAL FRESCO = baneFind (fichas de ponzoña por rematar a un afligidor de secuela duradera — NINGUNA de las 46 flags lo usa; ⊥ splashFind #104/coinFind #103/gearFind #102/goldFind #60/essenceFind #72). Moneda FRESCA (h.baneBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio baneBountyCap, 0 doble-dip.
//
// Run: node tools/cas2627-bane-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2627");
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
// durProbe esperado: dur→banda→weight (UMBRAL hiBane 3.5 / midBane 2.2). Cubre los 3 buckets + los bordes exactos.
const EXPECT_DUR = [
  { d: 4.0, band: "virulent", w: 2 }, { d: 3.5, band: "virulent", w: 2 },                  // ≥hiBane(3.5) ⇒ virulent ⇒ 2 (borde 3.5 inclusive)
  { d: 3.4, band: "noxious", w: 1 }, { d: 2.6, band: "noxious", w: 1 }, { d: 2.2, band: "noxious", w: 1 },   // ≥midBane(2.2) ⇒ noxious ⇒ 1 (borde 2.2 inclusive; 3.4 justo bajo hiBane)
  { d: 2.1, band: "clean", w: 0 }, { d: 1.0, band: "clean", w: 0 }, { d: 0, band: "clean", w: 0 },   // <midBane ⇒ clean ⇒ 0 (borde 2.1 justo bajo midBane; 0=sin aflicción)
];
// spawnBane esperado por TIPO: type → base dur → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "bandit", d: 4.0, w: 2 }, { type: "thornspitter", d: 3.5, w: 2 },        // virulent/aflicción-larga ⇒ 2 (bandit MELEE, thornspitter RANGED — mismo tier clase OPUESTA)
  { type: "emberkin", d: 2.6, w: 1 }, { type: "wraith", d: 2.2, w: 1 },            // media ⇒ 1
  { type: "rat", d: 0, w: 0 }, { type: "wolf", d: 0, w: 0 }, { type: "orc", d: 0, w: 0 }, { type: "mage", d: 0, w: 0 }, { type: "golem", d: 0, w: 0 }, { type: "skeleton", d: 0, w: 0 },   // sin-aflicción ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bane && window.__dev.splash && window.__dev.gold && window.__dev.gearchance && window.__dev.lunge && window.__dev.role && window.__dev.tough && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.bane + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.bane());
  ok("2 byte-id OFF (fresh boot): BANE_SURGE.enabled false AND G.baneBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "baneFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiBane=${dark.hiBane} midBane=${dark.midBane} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no baneFind/baneBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(baneFind|baneBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"baneBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'baneFind'/'baneBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.bane({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.bane({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.bane({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ durProbe LUT: dur→band→weight (UMBRAL hiBane/midBane), type-independiente.
  const drp = await page.evaluate((cases) => cases.map(c => window.__dev.bane({ durProbe: { dur: c.d } }).durProbe), EXPECT_DUR);
  const drpOK = EXPECT_DUR.every((c, i) => drp[i] && drp[i].band === c.band && drp[i].weight === c.w);
  ok("5b ★ durProbe LUT: dur≥3.5⇒virulent⇒2; ≥2.2⇒noxious⇒1; <2.2⇒clean⇒0 (UMBRAL hiBane/midBane, bordes 3.5/2.2/2.1 exactos)",
     drpOK, JSON.stringify(drp.map(x => ({ d: x.dur, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnBane pushes a real mob of TYPE to G.enemies; reads baneWeight from ETPL[type].infl.dur.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.bane({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.bane({ clearBane: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.bane({ spawnBane: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnBane;
      const tp = window.__dev.bane({ baneProbeLive: true }).baneProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srDur: sr.dur, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineDur: mine ? mine.dur : -1 });
    }
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srDur === c.d && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && server7[i].mineDur === c.d && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnBane empuja un mob REAL del TIPO; baneProbeLive lee el peso REAL de ETPL[type].infl.dur ⇒ bandit4.0/thornspitter3.5⇒2, emberkin2.6/wraith2.2⇒1, rat/wolf/orc/mage/golem/skeleton(sin infl)⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && x.srDur === EXPECT_TYPE[i].d && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, d: x.srDur, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74 OVERRIDE: bandit con e.tpl.infl.dur bajado a 0.9 ⇒ baneOf lee ETPL['bandit'].infl.dur=4.0 BASE ⇒ weight SIGUE 2. orc con override 9 ⇒ base sin infl ⇒ weight SIGUE 0.
  const ovr = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const banditBase = window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }).spawnBane;
    window.__dev.bane({ clearBane: true });
    const banditOvr = window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1], overrideDur: 0.9 } }).spawnBane;
    const tp1 = window.__dev.bane({ baneProbeLive: true }).baneProbeLive;   // lectura REAL: sigue leyendo base 4.0 ⇒ 2
    window.__dev.bane({ clearBane: true });
    const orcOvr = window.__dev.bane({ spawnBane: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideDur: 9 } }).spawnBane;   // clon con infl.dur=9
    const tp2 = window.__dev.bane({ baneProbeLive: true }).baneProbeLive;   // sigue leyendo base sin infl ⇒ 0
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    const bandit1 = tp1.mobs.find(m => m.type === "bandit"), orc2 = tp2.mobs.find(m => m.type === "orc");
    return { banditBaseDur: banditBase.dur, banditBaseW: banditBase.weight, banditOvrDur: banditOvr.dur, banditOvrTplDur: banditOvr.tplDur, banditOvrW: banditOvr.weight, tp1W: bandit1 ? bandit1.weight : -99,
      orcOvrDur: orcOvr.dur, orcOvrTplDur: orcOvr.tplDur, orcOvrW: orcOvr.weight, tp2W: orc2 ? orc2.weight : -99 };
  }, Z);
  const ovrOK = ovr.banditBaseDur === 4.0 && ovr.banditBaseW === 2 &&
    ovr.banditOvrDur === 4.0 && ovr.banditOvrTplDur === 0.9 && ovr.banditOvrW === 2 && ovr.tp1W === 2 &&   // clon 0.9, BASE 4.0 ⇒ bane 2 (NO cae a 0)
    ovr.orcOvrDur === 0 && ovr.orcOvrTplDur === 9 && ovr.orcOvrW === 0 && ovr.tp2W === 0;                    // clon 9, BASE sin infl ⇒ bane 0 (NO salta a 2)
  ok("7b ★ ⊥override/#74 OVERRIDE: e.tpl.infl.dur mutado (mimetiza afijo) ⇒ baneOf lee ETPL[type].infl.dur BASE ⇒ bandit SIGUE virulent w2 (base 4.0 pese a clon 0.9), orc SIGUE clean w0 (base sin infl pese a clon 9) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#84 ESCARAMUZA crux: bandit (MELEE, dur4 w2) vs thornspitter (RANGED, dur3.5 w2) MISMO tier clase OPUESTA; mage (ranged, w0) & wolf (melee, w0) comparten banda 0.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true });
    const read = (type) => { window.__dev.bane({ clearBane: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.bane({ spawnBane: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.bane().score; };
    const bandit = read("bandit"), thornspitter = read("thornspitter"), mage = read("mage"), wolf = read("wolf");
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    return { bandit, thornspitter, mage, wolf };
  }, Z);
  const crux84OK = crux84.bandit === 2 && crux84.thornspitter === 2 && crux84.mage === 0 && crux84.wolf === 0;
  ok("8 ★ ⊥#84 crux: BANDIT (MELEE, dur4 w2) y THORNSPITTER (RANGED, dur3.5 w2) MISMO tier2 clase OPUESTA; MAGE (ranged, w0) y WOLF (melee, w0) MISMA banda 0 ⇒ pertenencia a banda ⊥ binario melee/ranged (⊥ range/projspd que co-varían con la clase)",
     crux84OK, JSON.stringify(crux84));

  // 8b ★ ⊥#93 ROLE crux: thornspitter (caster, dur3.5 w2) vs wraith (caster, dur2.2 w1). MISMO role (caster) DISTINTA banda bane.
  const crux93 = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true }); window.__dev.role({ enabled: true });
    const read = (type) => { window.__dev.bane({ clearBane: true }); window.__dev.role({ clearRole: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.bane({ spawnBane: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.role({ spawnRole: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { bane: window.__dev.bane().score, role: window.__dev.role().score }; };
    const thornspitter = read("thornspitter"), wraith = read("wraith");
    window.__dev.bane({ clearBane: true }); window.__dev.role({ clearRole: true });
    window.__dev.bane({ enabled: false }); window.__dev.role({ enabled: false });
    return { thornspitter, wraith };
  }, Z);
  const crux93OK = crux93.thornspitter.bane === 2 && crux93.wraith.bane === 1 && crux93.thornspitter.role === crux93.wraith.role;
  ok("8b ★ ⊥#93 crux: THORNSPITTER (caster, dur3.5 w2) vs WRAITH (caster, dur2.2 w1) — MISMO role (caster, roleScore igual) DISTINTA banda bane (2 vs 1) ⇒ infl sub-divide la categoría caster que #93 trata como UN peso",
     crux93OK, JSON.stringify(crux93));

  // 8c ★ ⊥#102 GEARCHANCE crux: bandit (gearChance0.26 gear1, dur4 bane2) vs emberkin (gearChance0.26 gear1, dur2.6 bane1). MISMA banda gear DISTINTA banda bane.
  const crux102 = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true }); window.__dev.gearchance({ enabled: true });
    const read = (type) => { window.__dev.bane({ clearBane: true }); window.__dev.gearchance({ clearGear: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.bane({ spawnBane: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { bane: window.__dev.bane().score, gear: window.__dev.gearchance().score }; };
    const bandit = read("bandit"), emberkin = read("emberkin");
    window.__dev.bane({ clearBane: true }); window.__dev.gearchance({ clearGear: true });
    window.__dev.bane({ enabled: false }); window.__dev.gearchance({ enabled: false });
    return { bandit, emberkin };
  }, Z);
  const crux102OK = crux102.bandit.gear === 1 && crux102.emberkin.gear === 1 && crux102.bandit.bane === 2 && crux102.emberkin.bane === 1;
  ok("8c ★ ⊥#102 crux: BANDIT (gearChance0.26 gear1/dur4 bane2) vs EMBERKIN (gearChance0.26 gear1/dur2.6 bane1) — MISMA banda gear (1) DISTINTA banda bane (2 vs 1) ⇒ probabilidad de gear ⊥ duración de aflicción",
     crux102OK, JSON.stringify(crux102));

  // 8d ★ ⊥#104 SPLASH crux (soportes DISJUNTOS): orc (aoe60 splash1, sin infl bane0) vs bandit (sin aoe splash0, dur4 bane2).
  const crux104 = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true }); window.__dev.splash({ enabled: true });
    const read = (type) => { window.__dev.bane({ clearBane: true }); window.__dev.splash({ clearSplash: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.bane({ spawnBane: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.splash({ spawnSplash: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { bane: window.__dev.bane().score, splash: window.__dev.splash().score }; };
    const orc = read("orc"), bandit = read("bandit");
    window.__dev.bane({ clearBane: true }); window.__dev.splash({ clearSplash: true });
    window.__dev.bane({ enabled: false }); window.__dev.splash({ enabled: false });
    return { orc, bandit };
  }, Z);
  const crux104OK = crux104.orc.splash === 1 && crux104.orc.bane === 0 && crux104.bandit.splash === 0 && crux104.bandit.bane === 2;
  ok("8d ★ ⊥#104 crux: ORC (aoe60 splash1/sin infl bane0) vs BANDIT (sin aoe splash0/dur4 bane2) — SOPORTES DISJUNTOS: los 4 brutes con aoe NO tienen infl, los 4 afligidores con infl NO tienen aoe ⇒ radio de área ⊥ duración de aflicción",
     crux104OK, JSON.stringify(crux104));

  // 9 ★ DIFERENCIADOR ⊥#101 LUNGE: bandit (lunge132 lunge>0, dur4 bane2) vs wolf (lunge118 lunge>0, sin infl bane0) vs thornspitter (sin lunge, dur3.5 bane2). Soportes {lunge}≠{infl}.
  const diff = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true }); window.__dev.lunge({ enabled: true });
    const read = (type) => { window.__dev.bane({ clearBane: true }); window.__dev.lunge({ clearLunge: true });
      window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.bane({ spawnBane: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { bane: window.__dev.bane().score, lunge: window.__dev.lunge().score }; };
    const bandit = read("bandit"), wolf = read("wolf"), thornspitter = read("thornspitter");
    window.__dev.bane({ clearBane: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.bane({ enabled: false }); window.__dev.lunge({ enabled: false });
    return { bandit, wolf, thornspitter };
  }, Z);
  const diffOK = diff.bandit.lunge > 0 && diff.bandit.bane === 2 && diff.wolf.lunge > 0 && diff.wolf.bane === 0 && diff.thornspitter.lunge === 0 && diff.thornspitter.bane === 2;
  ok("9 ★ DIFERENCIADOR ⊥#101: BANDIT (lunge>0/bane2) vs WOLF (lunge>0/bane0 sin infl) vs THORNSPITTER (lunge0/bane2) — soportes {lunge}≠{infl}: un lunger puede no afligir y un afligidor no saltar ⇒ acometida ⊥ aflicción",
     diffOK, JSON.stringify(diff));

  // 10 CANAL baneFind: forageChargePreview bandit (virulent)>0 ; rat (clean) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit ⇒ score 2 ⇒ T2
    const actVm = window.__dev.bane();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ spawnBane: { type: "rat", tx: Z.forest[0], ty: Z.forest[1] } });   // rat ⇒ score 0
    const goVm = window.__dev.bane();
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL baneFind: forageChargePreview con bandit (virulent) ⇒ charge>0 (==baneBonus); con rat (clean) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds baneBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.bane({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.bane().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>baneBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a bandit available
  const neutral = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit disponible
    window.__dev.bane({ enabled: false });                             // now OFF
    const off = window.__dev.bane();
    window.__dev.bane({ enabled: true }); window.__dev.bane({ clearBane: true }); window.__dev.bane({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, baneBonus(bandit disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip bane OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de bane.
  const orth = await page.evaluate((Z) => {
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ enabled: false });
    const snap = () => JSON.stringify({ spl: window.__dev.splash(), gld: window.__dev.gold(), gc: window.__dev.gearchance(), lng: window.__dev.lunge(), rol: window.__dev.role(), tgh: window.__dev.tough(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.bane({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.bane();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.bane();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD baneFind ⊥ peers: flip bane OFF→ON NO cambia splash/gold/gearchance/lunge/role/tough/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de bane; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 46 arc flags served true; BANE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const baneDark = flag("BANE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 46 mecanismos del arco #59-#104 served enabled:true; BANE_SURGE served false (DARK #105)",
     arcAllOn && baneDark && arc.length === 46, `bane=${flag("BANE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Ponzoña:" drawn ON+bandit / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Ponzoña:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });   // bandit ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Ponzoña:\" se DIBUJA ON+bandit (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.bane({ enabled: true }); window.__dev.bane({ clearBane: true }); window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bane({ clearBane: true }); window.__dev.bane({ enabled: false }); });

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
    window.__dev.bane({ enabled: true });
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bane({ spawnBane: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bane();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.bane({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const drs = [4.0, 3.5, 3.4, 2.2, 2.1, 0].map(v => { const q = window.__dev.bane({ durProbe: { dur: v } }).durProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.bane({ baneProbeLive: true }).baneProbeLive;
    const mine = tp.mobs.find(m => m.type === "bandit") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.bane({ clearBane: true });
    window.__dev.bane({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineDur: mine ? mine.dur : -1, lut, drs, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineDur === B.mineDur && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.drs) === JSON.stringify(B.drs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO bandit+héroe ⇒ score/tier/charge + baneProbeLive(score,weight,dur) + durProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineDur:${A.mineDur},drs:${JSON.stringify(A.drs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineDur:${B.mineDur},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.bane({ enabled: false }));
  await pageB.evaluate(() => window.__dev.bane({ enabled: false }));

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
