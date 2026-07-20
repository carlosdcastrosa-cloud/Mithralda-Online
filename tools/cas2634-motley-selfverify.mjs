// CAS-2634 — self-verify for REMATE DE RALEA ABIGARRADA (DARK, MOTLEY_SURGE.enabled:false). EVO mecánica #106 (serializa tras #105 BANE_SURGE LIVE&served 8e1b7d472e89/815, base HEAD 9b39af1) — EJE FRESCO + CANAL FRESCO, ⊥ a las 47 LIVE #59-#105.
// (A) EJE FRESCO = DIVERSIDAD/HETEROGENEIDAD DE ESPECIES de la MANADA VIVA que rodea al héroe = motleyCount(hero) = nº de TIPOS de mob DISTINTOS (e.type, identidad ESTÁTICA de spawn) entre los mobs VIVOS cuyo centro cae dentro de MOTLEY_SURGE.radius. motleyBand: ≥hiMotley(3) ⇒ ralea-abigarrada ⇒ 2; ≥midMotley(2) ⇒ mixta ⇒ 1; <2 (monótona/solitaria) ⇒ 0.
//     PRE-FLIGHT del eje RECOMENDADO infl.mag FALLA: NO existe campo `mag` — los 4 portadores de `infl` usan dmg (poison/burn) o amt (slow): bandit(poison dmg4)/thornspitter(poison dmg4)/emberkin(burn dmg4)/wraith(slow amt0.5 SIN dmg). La MAGNITUD de daño es UNIFORME (dmg:4 en los 3 DoT) y el 4º usa OTRA unidad ⇒ 0 valores band-ables ⇒ RECHAZADO. Y infl.type (poison/burn/slow) COLISIONA con #105 (poison={bandit,thornspitter}==banda virulent). PIVOTE a la familia pack/composición bendecida por el issue: DIVERSIDAD DE ESPECIES.
//     CRUX ⊥#87 PACKHARVEST: #87 cuenta el Nº DE MOBS (densidad/clustering); MOTLEY cuenta TIPOS DISTINTOS (cardinalidad). 5 ratas apiñadas = #87 alto/MOTLEY 0 (1 tipo) DIAMETRALMENTE OPUESTOS.
//     CRUX ⊥#84 SKIRMISH_LINE: #84 cuenta la FRACCIÓN ranged (categoría binaria); MOTLEY cuenta cardinalidad de tipos. {mage×3} = #84 máx (3 ranged)/MOTLEY 0 (1 tipo); {rata,orco,murciélago} melee = #84 0/MOTLEY 2 OPUESTOS.
//     CRUX ⊥ ERUDICIÓN/loreVariety: tipos DISTINTOS KILLED en VENTANA TEMPORAL per-pid (log temporal con decay) vs snapshot ESPACIAL instantáneo de la manada VIVA — matar 3 especies solo-en-campo-vacío = Erudición3/MOTLEY0. ⊥ DIVERSE_COMPANY #53 (CLASES DE HÉROE en roster). ⊥ #83/#85/#86 (DoT/CC/vida-fracción DINÁMICOS del vecino — MOTLEY lee IDENTIDAD DE TIPO ESTÁTICA).
// (B) CANAL FRESCO = motleyFind (fichas de ralea por rematar rodeado de una hueste heterogénea — NINGUNA de las 47 flags lo usa; ⊥ baneFind #105/splashFind #104/packFind #87/skirmishFind #84). Moneda FRESCA (h.motleyBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio motleyBountyCap, 0 doble-dip.
//
// Run: node tools/cas2634-motley-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2634");
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
// countProbe esperado: count→banda→weight (UMBRAL hiMotley 3 / midMotley 2). Cubre los 3 buckets + los bordes exactos.
const EXPECT_COUNT = [
  { c: 5, w: 2 }, { c: 4, w: 2 }, { c: 3, w: 2 },                 // ≥hiMotley(3) ⇒ ralea ⇒ 2 (borde 3 inclusive)
  { c: 2, w: 1 },                                                 // ≥midMotley(2) ⇒ mixta ⇒ 1 (borde 2 inclusive)
  { c: 1, w: 0 }, { c: 0, w: 0 },                                 // <midMotley ⇒ monótona/solitaria ⇒ 0 (borde 1 justo bajo midMotley)
];
// spawnMotley esperado por COMPOSICIÓN: types → distinct count → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_COMP = [
  { types: ["rat", "orc", "bat"], c: 3, w: 2 },                         // 3 especies ⇒ ralea abigarrada ⇒ 2
  { types: ["rat", "orc", "bat", "wolf", "mage"], c: 5, w: 2 },         // 5 especies ⇒ 2
  { types: ["rat", "orc"], c: 2, w: 1 },                                // 2 especies ⇒ mixta ⇒ 1
  { types: ["rat", "rat", "orc"], c: 2, w: 1 },                         // duplicados colapsan ⇒ 2 distintos ⇒ 1
  { types: ["rat", "rat", "rat"], c: 1, w: 0 },                         // cardumen monótona ⇒ 1 tipo ⇒ 0
  { types: ["rat"], c: 1, w: 0 },                                       // solitario ⇒ 0
  { types: [], c: 0, w: 0 },                                            // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.motley && window.__dev.packHarvest && window.__dev.skirmishLine && window.__dev.bane && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.motley + peer hooks (packHarvest/skirmishLine/bane) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.motley());
  ok("2 byte-id OFF (fresh boot): MOTLEY_SURGE.enabled false AND G.motleyBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.count === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "motleyFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} count=${dark.count} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiMotley=${dark.hiMotley} midMotley=${dark.midMotley} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no motleyFind/motleyBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(motleyFind|motleyBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"motleyBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'motleyFind'/'motleyBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.motley({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.motley({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.motley({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ countProbe LUT: count→band→weight (UMBRAL hiMotley/midMotley).
  const cnp = await page.evaluate((cases) => cases.map(c => window.__dev.motley({ countProbe: { count: c.c } }).countProbe), EXPECT_COUNT);
  const cnpOK = EXPECT_COUNT.every((c, i) => cnp[i] && cnp[i].weight === c.w && cnp[i].count === c.c);
  ok("5b ★ countProbe LUT: count≥3⇒ralea⇒2; ≥2⇒mixta⇒1; <2⇒monótona⇒0 (UMBRAL hiMotley 3/midMotley 2, bordes 3/2/1 exactos)",
     cnpOK, JSON.stringify(cnp.map(x => ({ c: x.count, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnMotley (wipe) inyecta mobs REALES de tipos dados; motleyCount = nº de TIPOS DISTINTOS de e.type; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_COMP, Z } = args;
    window.__dev.motley({ enabled: true });
    const out = [];
    for (const c of EXPECT_COMP) {
      window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.motley({ spawnMotley: { types: c.types, tx: Z.forest[0], ty: Z.forest[1], wipe: true } }).spawnMotley;
      const live = window.__dev.motley({ motleyProbeLive: true }).motleyProbeLive;
      out.push({ types: c.types.join("+"), srCount: sr.count, srScore: sr.score, liveCount: live.count, liveScore: live.score, mobCount: live.mobCount });
    }
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    return out;
  }, { EXPECT_COMP, Z });
  const compOK = EXPECT_COMP.every((c, i) => comp[i] && comp[i].srCount === c.c && comp[i].srScore === c.w && comp[i].liveCount === c.c && comp[i].liveScore === c.w);
  ok("7 ★ REAL SERVER-AUTH: spawnMotley empuja mobs REALES; motleyCount = nº de TIPOS DISTINTOS (e.type) ⇒ {rat,orc,bat}=3⇒2, ×5=5⇒2, {rat,orc}=2⇒1, {rat,rat,orc}=2⇒1 (dup colapsa), {rat×3}=1⇒0, {rat}=1⇒0, {}=0⇒0",
     compOK, JSON.stringify(comp));

  // 8 ★ ⊥#87 PACKHARVEST crux: 5 RATAS apiñadas ⇒ packHarvest score>0 (clustering) PERO motley 0 (1 tipo). {rat,orc,bat} ⇒ motley 2. Conteo ⊥ diversidad.
  const crux87 = await page.evaluate((Z) => {
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const read = (types) => { window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.motley({ spawnMotley: { types, tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
      return { motley: window.__dev.motley().score, pack: window.__dev.packHarvest().score, count: window.__dev.motley().count }; };
    const fiveRats = read(["rat", "rat", "rat", "rat", "rat"]);
    const motley3 = read(["rat", "orc", "bat"]);
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false }); window.__dev.packHarvest({ enabled: false });
    return { fiveRats, motley3 };
  }, Z);
  const crux87OK = crux87.fiveRats.pack > 0 && crux87.fiveRats.motley === 0 && crux87.fiveRats.count === 1 && crux87.motley3.motley === 2 && crux87.motley3.count === 3;
  ok("8 ★ ⊥#87 crux: 5 RATAS apiñadas ⇒ packHarvest>0 (clustering/CONTEO) PERO MOTLEY 0 (1 tipo); {rat,orco,murciélago} ⇒ MOTLEY 2 (3 tipos) ⇒ CONTEO ⊥ DIVERSIDAD (cardumen monótona = alta densidad/cero variedad)",
     crux87OK, JSON.stringify(crux87));

  // 9 ★ ⊥#84 SKIRMISH_LINE crux: {mage×3} TODOS ranged ⇒ skirmish score>0 PERO motley 0 (1 tipo). {rat,orc,bat} TODOS melee ⇒ skirmish 0 PERO motley 2.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.motley({ enabled: true }); window.__dev.skirmishLine({ enabled: true });
    const read = (types) => { window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.motley({ spawnMotley: { types, tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
      return { motley: window.__dev.motley().score, skirmish: window.__dev.skirmishLine().score, count: window.__dev.motley().count }; };
    const mages = read(["mage", "mage", "mage"]);
    const meleeMix = read(["rat", "orc", "bat"]);
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false }); window.__dev.skirmishLine({ enabled: false });
    return { mages, meleeMix };
  }, Z);
  const crux84OK = crux84.mages.skirmish > 0 && crux84.mages.motley === 0 && crux84.mages.count === 1 && crux84.meleeMix.skirmish === 0 && crux84.meleeMix.motley === 2 && crux84.meleeMix.count === 3;
  ok("9 ★ ⊥#84 crux: {mage×3} TODOS ranged ⇒ skirmish>0/MOTLEY 0 (1 tipo); {rat,orco,murciélago} TODOS melee ⇒ skirmish 0/MOTLEY 2 ⇒ FRACCIÓN-ranged ⊥ CARDINALIDAD-de-tipos (OPUESTOS)",
     crux84OK, JSON.stringify(crux84));

  // 10 CANAL motleyFind: forageChargePreview con hueste ≥mixta >0 ; con monótona → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.motley({ enabled: true });
    window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });   // 3 tipos ⇒ score 2 ⇒ T2
    const actVm = window.__dev.motley();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.motley({ spawnMotley: { types: ["rat", "rat", "rat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });   // 1 tipo ⇒ score 0
    const goVm = window.__dev.motley();
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL motleyFind: forageChargePreview con hueste {rat,orc,bat} (3 tipos) ⇒ charge>0 (==motleyBonus); con {rat×3} (monótona) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds motleyBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.motley({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.motley().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>motleyBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a diverse pack available
  const neutral = await page.evaluate((Z) => {
    window.__dev.motley({ enabled: true });
    window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });   // hueste abigarrada disponible
    window.__dev.motley({ enabled: false });                             // now OFF
    const off = window.__dev.motley();
    window.__dev.motley({ enabled: true }); window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } }); window.__dev.motley({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, count: off.count };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.count === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, motleyBonus(hueste abigarrada disponible)==0 + forageChargePreview==0 + count==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip motley OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling packHarvest/skirmish no cambia la señal de motley.
  const orth = await page.evaluate((Z) => {
    window.__dev.motley({ enabled: true });
    window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    const snap = () => JSON.stringify({ bane: window.__dev.bane(), splash: window.__dev.splash(), gld: window.__dev.gold() });
    const peersOff = snap();
    window.__dev.motley({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.motley();
    const pkPrev = window.__dev.packHarvest().enabled, skPrev = window.__dev.skirmishLine().enabled;
    window.__dev.packHarvest({ enabled: true });
    window.__dev.skirmishLine({ enabled: true });
    const afterArc = window.__dev.motley();
    const pkAfter = window.__dev.packHarvest().enabled, skAfter = window.__dev.skirmishLine().enabled;
    window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.skirmishLine({ enabled: skPrev });
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && beforeArc.count === afterArc.count;
    return { peersUnchanged, sigUnchanged, pkAfter, skAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD motleyFind ⊥ peers: flip motley OFF→ON NO cambia bane/splash/gold; toggling PACKHARVEST/SKIRMISH NO cambia la señal de motley; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.pkAfter === true && orth.skAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 47 arc flags served true; MOTLEY_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const motleyDark = flag("MOTLEY_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 47 mecanismos del arco #59-#105 served enabled:true; MOTLEY_SURGE served false (DARK #106)",
     arcAllOn && motleyDark && arc.length === 47, `motley=${flag("MOTLEY_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Ralea:" drawn ON+pack / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Ralea:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.motley({ enabled: true });
    window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });   // 3 tipos ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Ralea:\" se DIBUJA ON+hueste (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.motley({ enabled: true }); window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat", "wolf"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate((Z) => { window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } }); window.__dev.motley({ enabled: false }); }, Z);

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
    window.__dev.motley({ enabled: true });
    window.__dev.motley({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.motley({ spawnMotley: { types: ["rat", "orc", "bat"], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    const vm = window.__dev.motley();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.motley({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const cns = [5, 3, 2, 1, 0].map(v => { const q = window.__dev.motley({ countProbe: { count: v } }).countProbe; return { v, w: q.weight }; });
    const live = window.__dev.motley({ motleyProbeLive: true }).motleyProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.motley({ spawnMotley: { types: [], tx: Z.forest[0], ty: Z.forest[1], wipe: true } });
    window.__dev.motley({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, count: vm.count, liveCount: live.count, liveScore: live.score, lut, cns, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.count === B.count && A.liveCount === B.liveCount && A.liveScore === B.liveScore && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.cns) === JSON.stringify(B.cns) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA hueste {rat,orc,bat}+héroe ⇒ score/tier/charge/count + motleyProbeLive(count,score) + countProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},count:${A.count},liveCount:${A.liveCount},liveScore:${A.liveScore},cns:${JSON.stringify(A.cns)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},count:${B.count},liveCount:${B.liveCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.motley({ enabled: false }));
  await pageB.evaluate(() => window.__dev.motley({ enabled: false }));

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
