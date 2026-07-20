// CAS-2611 — self-verify for REMATE DE PERTRECHO (DARK, GEARCHANCE_SURGE.enabled:false). EVO mecánica #102 (serializa tras #101 LUNGE_SURGE LIVE&served fed1aac601f6/815) — EJE FRESCO + CANAL FRESCO, ⊥ a las 43 LIVE #59-#101.
// (A) EJE FRESCO = PROBABILIDAD DE SOLTAR EQUIPO / GEAR-DROP INTRÍNSECA del mob TYPE server-auth (cuán PERTRECHADO va de fábrica su TIPO — la probabilidad base `gearChance` con que suelta una instancia de equipo al morir). Todas las filas de ETPL definen gearChance (config.js:290+; bat0.08..revenant/demon0.32). server-auth, MMORPG-native (recompensar cazar al mob cargado de equipo cuya alta prob de gear aprendiste a leer, no al bicho pelado).
//     PRE-FLIGHT GATE PASA sin pivote: `gearChance` es ESCALAR DECIMAL ESTÁTICO por template ∈[0,1], server-auth (constante de ETPL; NO wall-clock, NO estado de cliente, NO RNG EN EL READ usado para bandear — gearOf lee el VALOR ESTÁTICO del template, NO una tirada rodada), y NINGUNA de las 43 flags #59-#101 lo lee como SCORE. Los ÚNICOS lectores de `.gearChance`: (a) la TIRADA DE DROP de loot (srand()<tpl.gearChance*mul — probabilidad DENTRO de la rama de loot), (b) los modificadores de AFIJO/FORJA que SUMAN gearBonus al CLON (mutan la prob), (c) los probes dev. NINGUNO puntúa banda.
//     CRUX ⊥#72 SCARCITY (el riesgo señalado por el issue): #72 lee ETPL[type].xp como MAGNITUD de esencia (round(scarcityMul(zone)*tpl.xp), canal essenceFind), NO gearChance — CAMPOS DISTINTOS de ETPL. La banda de gearChance NO es proxy de xp: DENTRO de kitted (gear1, gearChance 0.22-0.26) el xp barre 20→38 (skeleton xp20 gearChance0.22 vs emberkin xp38 gearChance0.26 — MISMO gearWeight1, ~2× esencia SCARCITY) ⇒ NO co-monótono ⇒ ⊥#72 PROBADO.
//     CLAVE ⊥override/⊥#74/⊥campeón/⊥Forja: gearWeight lee ETPL[e.type].gearChance (GEAR-DROP BASE INMUTABLE del TIPO), NO e.tpl.gearChance (el CLON) — si un spawn afijado/Forja/campeón ELEVARA el clon vía gearBonus, gearOf lo IGNORA y lee la fila base ⇒ un orc Forja SIGUE gear2 (base 0.30). applyZoneScale escala hp/dmg/spd/xp pero NUNCA gearChance ⇒ pertrecho INDEPENDIENTE de zona (⊥#91).
//     gearWeight(e)=banda de gearOf(e)=ETPL[type].gearChance: gearChance≥hiGear(0.30) ⇒ arsenal ⇒ 2; gearChance≥midGear(0.22) ⇒ kitted ⇒ 1; gearChance<midGear ⇒ 0. El score del kill = gearWeight(víctima) muestreado en el TOP de killEnemy (_gearPre). La señal VIVA del badge = gearScore(hero)=MAX gearWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #101 acometida/#100 recobro/#99 amago/#98 impacto/#94 velocidad/#93 rol/#92 mole).
//     CRUX ⊥43 GEAR-DROP ESTÁTICO: ⊥ #101 LUNGE (bandit lunge132 lunge2/gearChance0.26 gear1 vs moose lunge0/gearChance0.32 gear2 OPUESTO). ⊥ #100 RECOVER (DENTRO de recov0: revenant recover0.55/gearChance0.32 gear2 vs bat recover0.35/gearChance0.08 gear0 MISMO recov OPUESTO gear). ⊥ #99 WINDUP (volatile windup0.7 wind1/gearChance0.10 gear0 vs bandit windup0.5 wind0/gearChance0.26 gear1 OPUESTO). ⊥ #98 RAM/#97 SENTINEL/#96/#95/#94/#93/#92/#89/#84/#79/#72.
// (B) CANAL FRESCO = gearFind (fichas de pertrecho por rematar a un mob BIEN-ARMADO — NINGUNA de las 43 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…lungeFind #101) está LLENA ⇒ moneda FRESCA (h.gearBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio gearBountyCap, 0 doble-dip.
//
// ★ gearProbe LUT (check 5b): gearChance→banda→weight — prueba el UMBRAL hiGear(0.30)/midGear(0.22), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnGear empuja un mob REAL del TIPO al MISMO G.enemies; gearProbeLive lee su peso REAL de ETPL[type].gearChance.
// ★ ⊥override/#74/campeón/Forja OVERRIDE (check 7b): spawnGear{type:'orc',overrideGear:0.05} apaga el CLON e.tpl.gearChance→0.05; gearOf lee ETPL['orc'].gearChance=0.30 BASE ⇒ weight SIGUE 2. Y bat{overrideGear:0.9} ⇒ base 0.08 ⇒ weight SIGUE 0.
// ★ ⊥#101 lunge crux (check 8): bandit (gear1, lunge132⇒lunge2) vs moose (gear2, lunge0) ⇒ ORDEN OPUESTO.
// ★ ⊥#100 recover crux (check 8c): revenant (gear2, recover0.55⇒recov0) vs bat (gear0, recover0.35⇒recov0) ⇒ MISMO recov OPUESTO gear.
// ★ ⊥#99 windup crux (check 8d): volatile (gear0, windup0.7⇒wind1) vs bandit (gear1, windup0.5⇒wind0) ⇒ OPUESTO.
// ★ ⊥#98 ram crux (check 8e): summoner (gear1, knock40⇒ram0) vs bat (gear0, knock90⇒ram0) MISMO ram OPUESTO gear; y moose gear2/ram2 vs revenant gear2/ram1 MISMO gear distinto ram.
// ★ ⊥#72 SCARCITY/xp crux (check 8f): skeleton (gear1, xp20) vs emberkin (gear1, xp38) ⇒ MISMO gearWeight1 pese a ~2× xp ⇒ gear NO es proxy de la magnitud de recompensa de #72.
// ★ DIFERENCIADOR (check 9): un ORC (arsenal gearChance0.30⇒gear2) ⇒ gear T2 MIENTRAS swift#94=0(steady)/lunge#101=0(sin salto)/windup#99=1 — el eje donde el orc alcanza la banda TOP por su prob de drop es gear.
// ★ CANAL (check 10): forageChargePreview = gearBonus(score). Orc (arsenal) ⇒ charge>0; bat (pelado) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(gearBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con GEARCHANCE_SURGE OFF, gearBonus(cualquier score)==0 y forageChargePreview==0 aun con un orc disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): gear (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de gear.
// ★ 0-REGRESIÓN (check 14): las 43 mecánicas del arco #59-#101 siguen served enabled:true; GEARCHANCE_SURGE served false (DARK #102).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + gearProbeLive + gearProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). gearScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Run: node tools/cas2611-gear-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2611");
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
// gearProbe esperado: gearChance→banda→weight (UMBRAL hiGear 0.30 / midGear 0.22). Cubre los 3 buckets + los bordes exactos.
const EXPECT_GEAR = [
  { g: 0.32, band: "arsenal", w: 2 }, { g: 0.30, band: "arsenal", w: 2 },                       // ≥hiGear(0.30) ⇒ arsenal ⇒ 2 (borde 0.30 inclusive)
  { g: 0.29, band: "kitted", w: 1 }, { g: 0.26, band: "kitted", w: 1 }, { g: 0.22, band: "kitted", w: 1 },   // ≥midGear(0.22) ⇒ kitted ⇒ 1 (borde 0.22 inclusive, 0.29 justo bajo hiGear)
  { g: 0.21, band: "bare", w: 0 }, { g: 0.14, band: "bare", w: 0 }, { g: 0.08, band: "bare", w: 0 },         // <midGear ⇒ pelado ⇒ 0 (borde 0.21 justo bajo midGear; wolf0.14; bat0.08)
];
// spawnGear esperado por TIPO: type → base gearChance → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "orc", g: 0.30, w: 2 }, { type: "moose", g: 0.32, w: 2 }, { type: "revenant", g: 0.32, w: 2 },
  { type: "skeleton", g: 0.22, w: 1 }, { type: "mage", g: 0.26, w: 1 }, { type: "bandit", g: 0.26, w: 1 }, { type: "summoner", g: 0.24, w: 1 },
  { type: "bat", g: 0.08, w: 0 }, { type: "wolf", g: 0.14, w: 0 }, { type: "volatile", g: 0.10, w: 0 }, { type: "rat", g: 0.10, w: 0 },   // pelados ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.gearchance && window.__dev.lunge && window.__dev.recover && window.__dev.wind && window.__dev.ram && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.interrupt && window.__dev.heading && window.__dev.apex && window.__dev.scarcity && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.gear + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.gearchance());
  ok("2 byte-id OFF (fresh boot): GEARCHANCE_SURGE.enabled false AND G.gearBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "gearFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiGear=${dark.hiGear} midGear=${dark.midGear} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no gearFind/gearBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(gearFind|gearBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"gearBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'gearFind'/'gearBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.gearchance({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(394)));
  await page.evaluate(() => window.__dev.gearchance({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.gearchance({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ gearProbe LUT: gearChance→band→weight (UMBRAL hiGear/midGear), type-independiente.
  const grp = await page.evaluate((cases) => cases.map(c => window.__dev.gearchance({ gearProbe: { gearChance: c.g } }).gearProbe), EXPECT_GEAR);
  const grpOK = EXPECT_GEAR.every((c, i) => grp[i] && grp[i].band === c.band && grp[i].weight === c.w);
  ok("5b ★ gearProbe LUT: gearChance≥0.30⇒arsenal⇒2; ≥0.22⇒kitted⇒1; <0.22⇒bare⇒0 (UMBRAL hiGear/midGear, bordes 0.30/0.22/0.21 exactos)",
     grpOK, JSON.stringify(grp.map(x => ({ g: x.gearChance, b: x.band, wt: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnGear pushes a real mob of TYPE to G.enemies; reads gearWeight from ETPL[type].gearChance.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.gearchance({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.gearchance({ clearGear: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.gearchance({ spawnGear: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnGear;
      const tp = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;
      const mine = tp.mobs.find(m => m.type === c.type) || null;
      out.push({ type: c.type, srGear: sr.gearChance, srW: sr.weight, valid: sr.valid, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineGear: mine ? mine.gearChance : -1 });
    }
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && Math.abs(server7[i].srGear - c.g) < 1e-9 && server7[i].srW === c.w && server7[i].valid && server7[i].mineW === c.w && Math.abs(server7[i].mineGear - c.g) < 1e-9 && server7[i].tpScore >= c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnGear empuja un mob REAL del TIPO; gearProbeLive lee el peso REAL de ETPL[type].gearChance ⇒ orc0.30/moose0.32/revenant0.32⇒2, skeleton0.22/mage0.26/bandit0.26/summoner0.24⇒1, bat0.08/wolf0.14/volatile0.10/rat0.10⇒0",
     s7OK, JSON.stringify(server7.filter((x, i) => !(x && Math.abs(x.srGear - EXPECT_TYPE[i].g) < 1e-9 && x.srW === EXPECT_TYPE[i].w && x.valid && x.mineW === EXPECT_TYPE[i].w)).map(x => ({ t: x.type, g: x.srGear, w: x.srW })) || server7.slice(0, 3)));

  // 7b ★ ⊥override/#74/campeón/Forja OVERRIDE: orc con e.tpl.gearChance apagado a 0.05 ⇒ gearOf lee ETPL['orc'].gearChance=0.30 BASE ⇒ weight SIGUE 2. bat con override 0.9 ⇒ base 0.08 ⇒ weight SIGUE 0.
  const ovr = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const orcBase = window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }).spawnGear;
    window.__dev.gearchance({ clearGear: true });
    const orcOvr = window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideGear: 0.05 } }).spawnGear;
    const tp1 = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;   // lectura REAL: sigue leyendo base ⇒ 2
    window.__dev.gearchance({ clearGear: true });
    const batOvr = window.__dev.gearchance({ spawnGear: { type: "bat", tx: Z.forest[0], ty: Z.forest[1], overrideGear: 0.9 } }).spawnGear;   // clon subido a 0.9
    const tp2 = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;   // sigue leyendo base 0.08 ⇒ 0
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    const orc1 = tp1.mobs.find(m => m.type === "orc"), bat2 = tp2.mobs.find(m => m.type === "bat");
    return { orcBaseGear: orcBase.gearChance, orcBaseW: orcBase.weight, orcOvrGear: orcOvr.gearChance, orcOvrTplGear: orcOvr.tplGear, orcOvrW: orcOvr.weight, tp1W: orc1 ? orc1.weight : -99,
      batOvrGear: batOvr.gearChance, batOvrTplGear: batOvr.tplGear, batOvrW: batOvr.weight, tp2W: bat2 ? bat2.weight : -99 };
  }, Z);
  const ovrOK = Math.abs(ovr.orcBaseGear - 0.30) < 1e-9 && ovr.orcBaseW === 2 &&
    Math.abs(ovr.orcOvrGear - 0.30) < 1e-9 && Math.abs(ovr.orcOvrTplGear - 0.05) < 1e-9 && ovr.orcOvrW === 2 && ovr.tp1W === 2 &&   // clon 0.05, BASE 0.30 ⇒ gear 2 (NO cae a 0)
    Math.abs(ovr.batOvrGear - 0.08) < 1e-9 && Math.abs(ovr.batOvrTplGear - 0.9) < 1e-9 && ovr.batOvrW === 0 && ovr.tp2W === 0;        // clon 0.9, BASE 0.08 ⇒ gear 0 (NO salta a 2)
  ok("7b ★ ⊥override/#74/campeón/Forja OVERRIDE: e.tpl.gearChance escalado (mimetiza afijo/Forja/campeón vía gearBonus) ⇒ gearOf lee ETPL[type].gearChance BASE ⇒ orc SIGUE gear2 (base 0.30 pese a clon 0.05), bat SIGUE gear0 (base 0.08 pese a clon 0.9) — desacople del clon",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#101 lunge crux: bandit (gear1, lunge132⇒lunge2) vs moose (gear2, lunge0). ORDEN OPUESTO.
  const crux101 = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true }); window.__dev.lunge({ enabled: true });
    const read = (type) => { window.__dev.gearchance({ clearGear: true }); window.__dev.lunge({ clearLunge: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gear: window.__dev.gearchance().score, lunge: window.__dev.lunge().score }; };
    const bandit = read("bandit"), moose = read("moose");
    window.__dev.gearchance({ clearGear: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.gearchance({ enabled: false }); window.__dev.lunge({ enabled: false });
    return { bandit, moose };
  }, Z);
  const crux101OK = crux101.bandit.gear === 1 && crux101.bandit.lunge === 2 && crux101.moose.gear === 2 && crux101.moose.lunge === 0;
  ok("8 ★ ⊥#101 crux: BANDIT (gearChance0.26 gear1/lunge132 lunge2 POUNCER) vs MOOSE (gearChance0.32 gear2/sin lunge lunge0) — ORDEN OPUESTO ⇒ prob de drop ⊥ distancia de acometida",
     crux101OK, JSON.stringify(crux101));

  // 8c ★ ⊥#100 recover crux: revenant (gear2, recover0.55⇒recov0) vs bat (gear0, recover0.35⇒recov0). MISMO recov OPUESTO gear.
  const crux100 = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true }); window.__dev.recover({ enabled: true });
    const read = (type) => { window.__dev.gearchance({ clearGear: true }); window.__dev.recover({ clearRecover: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gear: window.__dev.gearchance().score, recover: window.__dev.recover().score }; };
    const revenant = read("revenant"), bat = read("bat");
    window.__dev.gearchance({ clearGear: true }); window.__dev.recover({ clearRecover: true });
    window.__dev.gearchance({ enabled: false }); window.__dev.recover({ enabled: false });
    return { revenant, bat };
  }, Z);
  const crux100OK = crux100.revenant.gear === 2 && crux100.revenant.recover === 0 && crux100.bat.gear === 0 && crux100.bat.recover === 0;
  ok("8c ★ ⊥#100 crux: REVENANT (gearChance0.32 gear2/recover0.55 recov0) vs BAT (gearChance0.08 gear0/recover0.35 recov0) — MISMO recov (0) OPUESTO gear (2 vs 0) ⇒ prob de drop ⊥ ventana de recobro",
     crux100OK, JSON.stringify(crux100));

  // 8d ★ ⊥#99 windup crux: volatile (gear0, windup0.7⇒wind1) vs bandit (gear1, windup0.5⇒wind0). OPUESTO.
  const crux99 = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true }); window.__dev.wind({ enabled: true });
    const read = (type) => { window.__dev.gearchance({ clearGear: true }); window.__dev.wind({ clearWind: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gear: window.__dev.gearchance().score, wind: window.__dev.wind().score }; };
    const volatile_ = read("volatile"), bandit = read("bandit");
    window.__dev.gearchance({ clearGear: true }); window.__dev.wind({ clearWind: true });
    window.__dev.gearchance({ enabled: false }); window.__dev.wind({ enabled: false });
    return { volatile_, bandit };
  }, Z);
  const crux99OK = crux99.volatile_.gear === 0 && crux99.volatile_.wind === 1 && crux99.bandit.gear === 1 && crux99.bandit.wind === 0;
  ok("8d ★ ⊥#99 crux: VOLATILE (gearChance0.10 gear0/windup0.7 wind1) vs BANDIT (gearChance0.26 gear1/windup0.5 wind0) — OPUESTO (prob de drop ⊥ tiempo de presagio)",
     crux99OK, JSON.stringify(crux99));

  // 8e ★ ⊥#98 ram crux: moose (gear2, knock200⇒ram2) vs revenant (gear2, knock120⇒ram1). MISMO gear distinto ram.
  const crux98 = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true }); window.__dev.ram({ enabled: true });
    const read = (type) => { window.__dev.gearchance({ clearGear: true }); window.__dev.ram({ clearRam: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } });
      return { gear: window.__dev.gearchance().score, ram: window.__dev.ram().score }; };
    const moose = read("moose"), revenant = read("revenant");
    window.__dev.gearchance({ clearGear: true }); window.__dev.ram({ clearRam: true });
    window.__dev.gearchance({ enabled: false }); window.__dev.ram({ enabled: false });
    return { moose, revenant };
  }, Z);
  const crux98OK = crux98.moose.gear === 2 && crux98.moose.ram === 2 && crux98.revenant.gear === 2 && crux98.revenant.ram === 1;
  ok("8e ★ ⊥#98 crux: MOOSE (gearChance0.32 gear2/knock200 ram2) vs REVENANT (gearChance0.32 gear2/knock120 ram1) — MISMO gear (2) DISTINTO ram (2 vs 1) ⇒ impacto ⊥ prob de drop",
     crux98OK, JSON.stringify(crux98));

  // 8f ★ ⊥#72 SCARCITY/xp crux: skeleton (gear1, xp20) vs emberkin (gear1, xp38). MISMO gearWeight1 pese a ~2× xp ⇒ gear NO es proxy de la magnitud de recompensa de #72.
  const crux72 = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    const read = (type) => { window.__dev.gearchance({ clearGear: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnGear;
      return { gear: window.__dev.gearchance().score, gc: sr.gearChance }; };
    const skeleton = read("skeleton"), emberkin = read("emberkin");
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    return { skeleton, emberkin };
  }, Z);
  // skeleton xp20 gearChance0.22 gear1 ; emberkin xp38 gearChance0.26 gear1 — MISMO gearWeight, xp barre 20→38 (≈2×)
  const crux72OK = crux72.skeleton.gear === 1 && crux72.emberkin.gear === 1 && Math.abs(crux72.skeleton.gc - 0.22) < 1e-9 && Math.abs(crux72.emberkin.gc - 0.26) < 1e-9;
  ok("8f ★ ⊥#72 SCARCITY/xp crux: SKELETON (gearChance0.22 gear1, xp20) vs EMBERKIN (gearChance0.26 gear1, xp38) — MISMO gearWeight (1) pese a ~2× xp ⇒ gear NO es proxy de la MAGNITUD de recompensa de #72 (essence ∝ xp); prob de drop ⊥ magnitud",
     crux72OK, JSON.stringify(crux72));

  // 9 ★ DIFFERENTIATOR: un ORC (arsenal gearChance0.30⇒gear2) ⇒ gear T2 MIENTRAS swift#94=0(steady)/lunge#101=0(sin salto)/windup#99=1 — la banda TOP por prob de drop es gear.
  const diff = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true }); window.__dev.swift({ enabled: true }); window.__dev.lunge({ enabled: true }); window.__dev.wind({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.gearchance();
    const swift = window.__dev.swift().score;                                        // orc spd64 ⇒ swift0 (steady)
    const lunge = window.__dev.lunge().score;                                        // orc sin lunge ⇒ lunge0
    const wind = window.__dev.wind().score;                                          // orc windup0.82 ⇒ wind1 (measured)
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false }); window.__dev.swift({ enabled: false }); window.__dev.lunge({ enabled: false }); window.__dev.wind({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, swift, lunge, wind };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 2 &&
    diff.swift === 0 && diff.lunge === 0 && diff.wind === 1;
  ok("9 ★ DIFERENCIADOR: ORC (arsenal gearChance0.30) ⇒ gear T2 MIENTRAS swift#94=0(steady)/lunge#101=0(sin salto)/windup#99=1(measured) — la banda TOP (2) del orc por su prob de drop es gear",
     diffOK, JSON.stringify(diff));

  // 10 CANAL gearFind: forageChargePreview orc (arsenal)>0 ; bat (pelado) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc ⇒ score 2 ⇒ T2
    const actVm = window.__dev.gearchance();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ spawnGear: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });   // bat ⇒ score 0
    const goVm = window.__dev.gearchance();
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL gearFind: forageChargePreview con orc (arsenal) ⇒ charge>0 (==gearBonus); con bat (pelado) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds gearBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.gearchance({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.gearchance().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>gearBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with an orc available
  const neutral = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc disponible
    window.__dev.gearchance({ enabled: false });                             // now OFF
    const off = window.__dev.gearchance();
    window.__dev.gearchance({ enabled: true }); window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, gearBonus(orc disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip gear OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de gear.
  const orth = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ enabled: false });
    const snap = () => JSON.stringify({ lng: window.__dev.lunge(), rec: window.__dev.recover(), wind: window.__dev.wind(), ram: window.__dev.ram(), swf: window.__dev.swift(), rol: window.__dev.role(), men: window.__dev.menace(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.gearchance({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.gearchance();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.gearchance();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD gearFind ⊥ peers: flip gear OFF→ON NO cambia lunge/recover/wind/ram/swift/role/menace/interrupt/heading/zonetier/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de gear; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 43 arc flags served true; GEARCHANCE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const gearDark = flag("GEARCHANCE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 43 mecanismos del arco #59-#101 served enabled:true; GEARCHANCE_SURGE served false (DARK #102)",
     arcAllOn && gearDark && arc.length === 43, `gear=${flag("GEARCHANCE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Pertrecho:" drawn ON+orc / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Pertrecho:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });   // orc ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Pertrecho:\" se DIBUJA ON+orc (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.gearchance({ enabled: true }); window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false }); });

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
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.gearchance();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.gearchance({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const grs = [0.32, 0.30, 0.29, 0.22, 0.21, 0.08].map(v => { const q = window.__dev.gearchance({ gearProbe: { gearChance: v } }).gearProbe; return { v, b: q.band, w: q.weight }; });
    const tp = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;
    const mine = tp.mobs.find(m => m.type === "orc") || null;
    const fp = JSON.stringify(window.__dev.worldFingerprint(394));
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, mineW: mine ? mine.weight : -1, mineGear: mine ? mine.gearChance : -1, lut, grs, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.mineW === B.mineW && A.mineGear === B.mineGear && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.grs) === JSON.stringify(B.grs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO orc+héroe ⇒ score/tier/charge + gearProbeLive(score,weight,gearChance) + gearProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpScore:${A.tpScore},mineW:${A.mineW},mineGear:${A.mineGear},grs:${JSON.stringify(A.grs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpScore:${B.tpScore},mineW:${B.mineW},mineGear:${B.mineGear},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.gearchance({ enabled: false }));
  await pageB.evaluate(() => window.__dev.gearchance({ enabled: false }));

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
