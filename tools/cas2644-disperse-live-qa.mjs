// CAS-2644 — POST-FLIP LIVE QA for REMATE DE HUESTE DISPERSA (LIVE, DISPERSE_SURGE.enabled:true). EVO mecánica #107 = 49º flag LIVE&served b8b8c3ac28f7/815 (flip 4cfc16c + stamp 33d8b07). Flag-ON port of DARK harness CAS-2640 (fp 15920977 0-desync) — 2 assertions flipped (check2 enabled:true STATELESS, check14 49 flags served true off=[]). EJE FRESCO + CANAL FRESCO, ⊥ a las 48 LIVE #59-#106.
// (A) EJE FRESCO = ESTRUCTURAL/GEOMÉTRICO DISPERSIÓN ESPACIAL de la MANADA VIVA que rodea al héroe = disperseSpread(hero) = distancia MEDIA de los mobs VIVOS al CENTROIDE de la manada en radio. disperseBand: ≥hiSpread(110) ⇒ dispersa/desparramada ⇒ 2; ≥midSpread(55) ⇒ suelta ⇒ 1; <mid (blob apiñado) ⇒ 0. Requiere ≥minMobs(2) vivos. ESCALA INTENSIVA (invariante al conteo).
//     PRE-FLIGHT del eje RECOMENDADO pack SPATIAL DISPERSION → PASA sin pivote: la dispersión = distancia MEDIA al centroide es un ESCALAR GEOMÉTRICO band-able (formaciones normales rinden bandas DISTINTAS: enjambre melee anillado ⇒ spread bajo; grupo suelto ⇒ medio; línea de hostigamiento desplegada ⇒ alto — verificado por spawnDisperse) y NINGUNA de las 48 flags lo lee como SCORE.
//     CRUX ⊥#87 PACKHARVEST: #87 SUMA por-mob la COHESIÓN LOCAL (nº de vecinos en cohesionR 88) ⇒ EXTENSIVA/escala-con-conteo. DISPERSE mide la ESCALA GLOBAL (spread al centroide) ⇒ INTENSIVA. NO son inversas monótonas: 3 PAREJAS tupidas desplegadas lejos ⇒ #87 alto/spread alto; BLOB único ⇒ #87 alto/spread 0 ⇒ #87 NO monótona en spread ⇒ INDEPENDIENTES.
//     CRUX ⊥#106 MOTLEY: cardinalidad de e.type vs geometría. {rat,orc,bat} apiñado (motley2/spread0) vs desparramado (motley2/spread2) ⇒ motley igual/disperse distinto.
//     CRUX ⊥#84 SKIRMISH: clase e.tpl.ranged vs posición. {mage×3} apiñado ⇒ skirmish>0/spread0; {rat,orc,bat} melee desparramado ⇒ skirmish0/spread2 ⇒ OPUESTOS.
// (B) CANAL FRESCO = disperseFind (fichas de dispersión por rematar en medio de una formación desplegada — NINGUNA de las 48 flags lo usa; ⊥ motleyFind #106/packFind #87/skirmishFind #84/baneFind #105). Moneda FRESCA (h.disperseBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio disperseBountyCap, 0 doble-dip.
//
// Run: node tools/cas2640-disperse-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2644-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 395;
// spreadProbe LUT esperada: spread→banda→{tier,charge}. UMBRALES hiSpread 110 / midSpread 55, bordes exactos.
const EXPECT_SPREAD = [
  { spread: 0, w: 0, t: 0, s: 0 }, { spread: 54, w: 0, t: 0, s: 0 },   // <midSpread ⇒ apiñada ⇒ 0 (borde 54 justo bajo)
  { spread: 55, w: 1, t: 1, s: 1 }, { spread: 109, w: 1, t: 1, s: 1 }, // ≥midSpread ⇒ suelta ⇒ 1 (bordes 55 inclusive / 109)
  { spread: 110, w: 2, t: 2, s: 2 }, { spread: 200, w: 2, t: 2, s: 2 }, // ≥hiSpread ⇒ dispersa ⇒ 2 (borde 110 inclusive)
];
// spawnDisperse esperado por FORMACIÓN (offsets px CARDINALES simétricos ⇒ centroide=héroe ⇒ spread = radio del anillo). Cubre bandas 0/1/2 + minMobs.
const EXPECT_SPAWN = [
  { name: "tight", pts: [[30,0],[-30,0],[0,30],[0,-30]], spread: 30, w: 0 },     // anillo 30px ⇒ blob apiñado ⇒ 0
  { name: "loose", pts: [[75,0],[-75,0],[0,75],[0,-75]], spread: 75, w: 1 },     // anillo 75px ⇒ suelta ⇒ 1
  { name: "scatter", pts: [[140,0],[-140,0],[0,140],[0,-140]], spread: 140, w: 2 }, // anillo 140px ⇒ dispersa ⇒ 2
  { name: "twofar", pts: [[100,0],[-100,0]], spread: 100, w: 1 },                // 2 mobs (minMobs=2 justo) a 100 del centroide ⇒ suelta ⇒ 1
  { name: "one", pts: [[60,0]], spread: 0, w: 0 },                               // 1 mob <minMobs ⇒ dispersión indefinida ⇒ 0
  { name: "empty", pts: [], spread: 0, w: 0 },                                   // campo vacío ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.disperse && window.__dev.packHarvest && window.__dev.skirmishLine && window.__dev.motley && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.disperse + peer hooks (packHarvest/skirmishLine/motley) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE fresh boot: enabled TRUE (49º flag LIVE) + STATELESS (disperseBounty transitorio, derivado ⇒ gExists false, empty-field score 0)
  const dark = await page.evaluate(() => window.__dev.disperse());
  ok("2 LIVE (fresh boot): DISPERSE_SURGE.enabled TRUE (49º flag LIVE) AND estado STATELESS (gExists false: disperseBounty transitorio derivado; empty-field score/spread 0)",
     dark.enabled === true && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.spread === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "disperseFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} spread=${dark.spread} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSpread=${dark.hiSpread} midSpread=${dark.midSpread} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no disperseFind/disperseBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(disperseFind|disperseBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"disperseBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'disperseFind'/'disperseBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.disperse({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.disperse({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ spreadProbe LUT: spread→band→tier→charge (UMBRALES hiSpread/midSpread + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.disperse({ spreadProbe: { spread: c.spread } }).spreadProbe), EXPECT_SPREAD);
  const tabOK = EXPECT_SPREAD.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ spreadProbe LUT: spread≥110⇒dispersa⇒2/T2; ≥55⇒suelta⇒1/T1; <55⇒apiñada⇒0/T0 (UMBRAL hiSpread 110/midSpread 55, bordes 54/55/109/110 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ sp: x.spread, w: x.weight, t: x.tier, c: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnDisperse (wipe) inyecta mobs REALES en offsets px del héroe; disperseSpread = distancia MEDIA al centroide; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    window.__dev.disperse({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const pts = c.pts.map(([dx, dy]) => ({ dx, dy, type: "rat" }));
      const sr = window.__dev.disperse({ spawnDisperse: { pts, wipe: true } }).spawnDisperse;
      const live = window.__dev.disperse({ disperseProbeLive: true }).disperseProbeLive;
      out.push({ name: c.name, srSpread: sr.spread, srScore: sr.score, liveSpread: live.spread, liveScore: live.score, mobCount: live.mobCount });
    }
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srSpread - c.spread) < 1.0 && Math.abs(comp[i].liveSpread - c.spread) < 1.0);
  ok("5b ★ REAL SERVER-AUTH: spawnDisperse empuja mobs REALES en offsets px; disperseSpread = distancia MEDIA al centroide ⇒ anillo30⇒0, anillo75⇒1, anillo140⇒2, 2-mobs-100⇒1 (minMobs justo), 1-mob⇒0 (<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 7 ★ ⊥#87 PACKHARVEST crux: #87 NO monótona en spread. 3 PAREJAS tupidas desplegadas ⇒ #87 alto (cada mob con vecino) Y disperse alto (formación ancha); BLOB único ⇒ #87 alto / disperse 0.
  const crux87 = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const read = (pts) => { window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.disperse({ spawnDisperse: { pts: pts.map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
      return { disperse: window.__dev.disperse().score, spread: window.__dev.disperse().spread, pack: window.__dev.packHarvest().score }; };
    // 3 parejas: cada mob a 20px de su compañero (dentro de cohesionR 88 ⇒ #87 loose), parejas a ~150px del héroe (⊥ blob)
    const pairs = read([[150,0],[170,0],[-150,0],[-170,0],[0,150],[0,170]]);
    // blob único tupido: 6 mobs juntos (dentro de cohesionR ⇒ #87 core alto), spread ~10px ⇒ disperse 0
    const blob = read([[0,0],[15,0],[0,15],[15,15],[-15,0],[0,-15]]);
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false }); window.__dev.packHarvest({ enabled: false });
    return { pairs, blob };
  }, Z);
  const crux87OK = crux87.pairs.pack > 0 && crux87.pairs.disperse === 2 && crux87.blob.pack > 0 && crux87.blob.disperse === 0;
  ok("7 ★ ⊥#87 crux: 3 PAREJAS tupidas desplegadas ⇒ packHarvest>0 (cohesión local) Y DISPERSE 2 (spread ancho); BLOB único ⇒ packHarvest>0 Y DISPERSE 0 ⇒ #87 NO monótona en spread ⇒ COHESIÓN-LOCAL ⊥ SPREAD-GLOBAL (INDEPENDIENTES)",
     crux87OK, JSON.stringify(crux87));

  // 8 ★ ⊥#106 MOTLEY crux: MISMOS 3 tipos {rat,orc,bat}: APIÑADOS ⇒ motley 2 (3 tipos)/disperse 0; DESPARRAMADOS ⇒ motley 2/disperse 2 ⇒ diversidad IGUAL, spread DISTINTO.
  const crux106 = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true }); window.__dev.motley({ enabled: true });
    const read = (pts, types) => { window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.disperse({ spawnDisperse: { pts: pts.map(([dx, dy], i) => ({ dx, dy, type: types[i] })), wipe: true } });
      return { disperse: window.__dev.disperse().score, motley: window.__dev.motley().score, motleyCount: window.__dev.motley().count }; };
    const tight = read([[15,0],[-15,0],[0,15]], ["rat", "orc", "bat"]);        // 3 tipos apiñados ⇒ motley2/disperse0
    const spread = read([[150,0],[-150,0],[0,150]], ["rat", "orc", "bat"]);    // 3 tipos desparramados ⇒ motley2/disperse2
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false }); window.__dev.motley({ enabled: false });
    return { tight, spread };
  }, Z);
  const crux106OK = crux106.tight.motley === 2 && crux106.tight.disperse === 0 && crux106.spread.motley === 2 && crux106.spread.disperse === 2 && crux106.tight.motleyCount === 3;
  ok("8 ★ ⊥#106 crux: MISMOS {rat,orc,bat} APIÑADOS ⇒ MOTLEY 2 (3 tipos)/DISPERSE 0; DESPARRAMADOS ⇒ MOTLEY 2/DISPERSE 2 ⇒ CARDINALIDAD-de-tipo IGUAL, SPREAD DISTINTO (identidad ⊥ geometría)",
     crux106OK, JSON.stringify(crux106));

  // 9 ★ ⊥#84 SKIRMISH crux: {mage×3} APIÑADOS (ranged) ⇒ skirmish>0/disperse 0; {rat,orc,bat} DESPARRAMADOS (melee) ⇒ skirmish 0/disperse 2 ⇒ OPUESTOS.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true }); window.__dev.skirmishLine({ enabled: true });
    const read = (pts, types) => { window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.disperse({ spawnDisperse: { pts: pts.map(([dx, dy], i) => ({ dx, dy, type: types[i] })), wipe: true } });
      return { disperse: window.__dev.disperse().score, skirmish: window.__dev.skirmishLine().score }; };
    const magesTight = read([[12,0],[-12,0],[0,12]], ["mage", "mage", "mage"]);      // 3 ranged apiñados ⇒ skirmish>0/disperse0
    const meleeSpread = read([[150,0],[-150,0],[0,150]], ["rat", "orc", "bat"]);     // 3 melee desparramados ⇒ skirmish0/disperse2
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false }); window.__dev.skirmishLine({ enabled: false });
    return { magesTight, meleeSpread };
  }, Z);
  const crux84OK = crux84.magesTight.skirmish > 0 && crux84.magesTight.disperse === 0 && crux84.meleeSpread.skirmish === 0 && crux84.meleeSpread.disperse === 2;
  ok("9 ★ ⊥#84 crux: {mage×3} APIÑADOS ⇒ skirmish>0/DISPERSE 0; {rat,orco,murciélago} DESPARRAMADOS melee ⇒ skirmish 0/DISPERSE 2 ⇒ FRACCIÓN-ranged ⊥ SPREAD-geométrico (OPUESTOS)",
     crux84OK, JSON.stringify(crux84));

  // 10 CANAL disperseFind: forageChargePreview con formación desplegada >0 ; con apiñada → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true });
    window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // anillo140 ⇒ score2 ⇒ T2
    const actVm = window.__dev.disperse();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.disperse({ spawnDisperse: { pts: [[15,0],[-15,0],[0,15]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // blob ⇒ score0
    const goVm = window.__dev.disperse();
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL disperseFind: forageChargePreview con anillo140 desplegado ⇒ charge>0 (==disperseBonus); con blob apiñado ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds disperseBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 400; s += 20) vals.push(window.__dev.disperse({ spreadProbe: { spread: s } }).spreadProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.disperse().cap };
  });
  ok("11 ★ SUB-CAP: ningún spread produce charge>disperseBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a scattered pack available
  const neutral = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true });
    window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // formación desplegada disponible
    window.__dev.disperse({ enabled: false });                             // now OFF
    const off = window.__dev.disperse();
    window.__dev.disperse({ enabled: true }); window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } }); window.__dev.disperse({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, spread: off.spread };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.spread === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, disperseBonus(formación desplegada disponible)==0 + forageChargePreview==0 + spread==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip disperse OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling packHarvest/skirmish no cambia la señal de disperse.
  const orth = await page.evaluate((Z) => {
    window.__dev.disperse({ enabled: true });
    window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    window.__dev.disperse({ enabled: false });
    const snap = () => JSON.stringify({ motley: window.__dev.motley(), bane: window.__dev.bane(), splash: window.__dev.splash() });
    const peersOff = snap();
    window.__dev.disperse({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.disperse();
    const pkPrev = window.__dev.packHarvest().enabled, skPrev = window.__dev.skirmishLine().enabled;
    window.__dev.packHarvest({ enabled: true });
    window.__dev.skirmishLine({ enabled: true });
    const afterArc = window.__dev.disperse();
    const pkAfter = window.__dev.packHarvest().enabled, skAfter = window.__dev.skirmishLine().enabled;
    window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.skirmishLine({ enabled: skPrev });
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.spread - afterArc.spread) < 0.01;
    return { peersUnchanged, sigUnchanged, pkAfter, skAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD disperseFind ⊥ peers: flip disperse OFF→ON NO cambia motley/bane/splash; toggling PACKHARVEST/SKIRMISH NO cambia la señal de disperse; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.pkAfter === true && orth.skAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 48 arc flags served true; DISPERSE_SURGE served TRUE ⇒ 49 flags served true off=[]
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const disperseLive = flag("DISPERSE_SURGE") === "true";
  ok("14 ★ 0-REGRESIÓN: 48 mecanismos del arco #59-#106 served enabled:true; DISPERSE_SURGE served TRUE (LIVE #107, 49º flag) ⇒ 49 flags served true off=[]",
     arcAllOn && disperseLive && arc.length === 48, `disperse=${flag("DISPERSE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length + 1} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true").concat(disperseLive ? [] : [["DISPERSE_SURGE", flag("DISPERSE_SURGE")]]))}`);

  // 15 render badge "Dispersión:" drawn ON+scattered / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Dispersión:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.disperse({ enabled: true });
    window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });  // anillo140 ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Dispersión:\" se DIBUJA ON+formación desplegada (spread>0) y NO OFF (spread 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.disperse({ enabled: true }); window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140],[100,100]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate((Z) => { window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } }); window.__dev.disperse({ enabled: false }); }, Z);

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
    window.__dev.disperse({ enabled: true });
    window.__dev.disperse({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.disperse({ spawnDisperse: { pts: [[140,0],[-140,0],[0,140],[0,-140]].map(([dx, dy]) => ({ dx, dy, type: "rat" })), wipe: true } });
    const vm = window.__dev.disperse();
    const lut = [0, 55, 110, 200].map(s => { const p = window.__dev.disperse({ spreadProbe: { spread: s } }).spreadProbe; return { spread: s, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.disperse({ disperseProbeLive: true }).disperseProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.disperse({ spawnDisperse: { pts: [], wipe: true } });
    window.__dev.disperse({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spread: vm.spread, liveSpread: live.spread, liveScore: live.score, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spread === B.spread && A.liveSpread === B.liveSpread && A.liveScore === B.liveScore && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación anillo140+héroe ⇒ score/tier/charge/spread + disperseProbeLive(spread,score) + spreadProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},spread:${A.spread},liveSpread:${A.liveSpread},liveScore:${A.liveScore},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},spread:${B.spread},liveSpread:${B.liveSpread},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.disperse({ enabled: false }));
  await pageB.evaluate(() => window.__dev.disperse({ enabled: false }));

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
