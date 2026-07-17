// CAS-2551 — self-verify for REMATE DE CABECILLA (DARK, ROLE_SURGE.enabled:false). EVO mecánica #93 (serializa tras #92 BULK_SURGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥ a las 34 LIVE #59-#92.
// (A) EJE FRESCO = ROL/ARQUETIPO DE COMBATE del mob TYPE server-auth (la FUNCIÓN de IA intrínseca: un habilitador de soporte — médico/nigromante — vs un disruptor especialista — brujo/kamikaze/castigador — vs un peleador estándar). server-auth, MMORPG-native (recompensar despachar al habilitador/pieza clave del pack, no al bruto de a pie).
//     PRE-FLIGHT GATE (recomendado = KILL-EFFORT / Nº de golpes para matar) → FALLA: NO existe contador entero determinista de golpes-por-mob server-auth — hitEnemy (sim.js:5668) hace `e.hp-=dmg` (sim.js:5966) SIN incrementar e.hits/e.timesHit/nº-de-instancias-de-daño; spawnEnemy (sim.js:2258) NO estampa contador; y aún si se añadiera, nº-de-golpes-para-matar = e.maxHp/dañoPorGolpe-del-héroe ⇒ ENTRELAZADO con el DPS/tempo del héroe (frenesí +dmg/stack, combo/cadence#67) ⇒ NO propiedad INTRÍNSECA del mob y NO ⊥ cadence#67/frenzy/combo ⇒ PIVOTE al alterno FRESCO sancionado #2 del board: ARQUETIPO/ROL.
//     PRE-FLIGHT del alterno ARQUETIPO/ROL → PASA: `arch` es CATEGÓRICO ESTÁTICO por template (config.js:290+; brute/caster/charger/healer/punisher/rusher/summoner/volatile/warlock), server-auth (constante de ETPL, replicada del mismo config; NO wall-clock, NO estado de cliente, NO RNG, NO DPS-del-héroe), y NINGUNA de las 34 flags #59-#92 lo lee como SCORE (`arch` sólo IA de movimiento [sim.js:4519/8225/8255/8269] + gate de pool de afijos [excluye volatile] + telegraph de render).
//     CLAVE ⊥#73/⊥champion: roleWeight lee el ROL BASE INMUTABLE ETPL[e.type].arch (el rol del TIPO), NO e.tpl.arch — la promoción a campeón (sim.js:6318) LIMPIA el CLON e.tpl.arch=undefined pero jamás muta la fila base de ETPL ⇒ rol DESACOPLADO de campeón/afijo por construcción.
//     roleWeight(e)=banda de roleBand(roleOf(e)): enabler(summoner/healer, dmg:0) ⇒ 2; disruptor(warlock/volatile/punisher) ⇒ 1; brawler(brute/charger/rusher/caster, o sin arch) ⇒ 0. El score del kill = roleWeight(víctima) muestreado en el TOP de killEnemy (_rolePre). La señal VIVA del badge = roleScore(hero)=MAX roleWeight sobre los mobs VIVOS en radio. PURO, 0-RNG, 0-timer, STATELESS. El eje ES la víctima propia (⊥ auto-conteo N/A, como #92 mole/#88 remate).
//     CRUX ⊥34 ROL/FUNCIÓN DE COMBATE ESTÁTICO del TIPO: ⊥ #92 BULK/MOLE (BANDA DE TAMAÑO físico ETPL[type].size; rol = FUNCIÓN de IA arch — summoner sz20 mole-media 1 pero ENABLER rol 2; moose sz26 mole-grande 2 pero BRUTE rol 0, DISJUNTOS). ⊥ #84 ESCARAMUZA (CLASE DE ALCANCE e.tpl.ranged; rol = CAMPO arch DISTINTO — caster spearman ranged⇒rol 0 pero skirmish>0; healer NO-ranged⇒rol 2 pero skirmish 0, OPUESTOS; disruptor MEZCLA ranged warlock + melee volatile/punisher ⇒ ninguna banda rastrea ranged). ⊥ #91 zone-tier (área/terreno). ⊥ #86 siega (e.hp/e.maxHp DINÁMICO; rol = categórico ESTÁTICO). ⊥ #89 interrupt (ESTADO DE ACCIÓN e.state — caster ocioso interrupt 0 vs casteando interrupt 2 con el MISMO arch; rol = identidad ESTÁTICA). ⊥ #85/#88/#87/#90/#78/#76/#74/#73 y velocidad.
// (B) CANAL FRESCO = roleFind (fichas de cabecilla por rematar a un mob de alto valor táctico — NINGUNA de las 34 flags lo usa). La familia recompensa-de-forrajeo EXISTENTE (goldFind…tierFind #91, bulkFind #92) está LLENA ⇒ moneda FRESCA (h.roleBounty, recurso TRANSITORIO NUEVO, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio roleBountyCap, 0 doble-dip.
//
// ★ archProbe LUT (check 5b): arch→band→weight — prueba la LUT roleTier (summoner/healer⇒enabler⇒2, warlock/volatile/punisher⇒disruptor⇒1, brute/charger/rusher/caster/""⇒brawler⇒0), type-independiente.
// ★ REAL SERVER-AUTH (check 7): spawnRole empuja un mob REAL del TIPO al MISMO G.enemies; roleProbe lee su peso REAL de ETPL[type].arch ⇒ summoner/healer⇒2, demon/volatile/revenant⇒1, orc/wolf/spearman/mage⇒0.
// ★ ⊥#73/⊥champion OVERRIDE (check 7b): spawnRole{type:'healer',overrideArch:'brute'} clona e.tpl y sobrescribe e.tpl.arch→'brute' (mimetiza el campeón arch=undefined); roleOf lee ETPL['healer'].arch='healer' BASE ⇒ weight SIGUE 2 pese a tplArch='brute'. Prueba el desacople del clon por construcción.
// ★ ⊥#92 crux (check 8): summoner (arch summoner⇒rol2/enabler) tiene mole 1 (sz20); moose (arch brute⇒rol0) tiene mole 2 (sz26). NO correlacionan (rol alto donde mole media; rol cero donde mole alta) ⇒ DISJUNTOS (función de IA vs tamaño físico).
// ★ ⊥#84 crux (check 8b): spearman (caster, ranged:true) ⇒ rol 0 pero skirmish>0; healer (enabler, NO ranged) ⇒ rol 2 pero skirmish 0. OPUESTOS (rol lee arch/FUNCIÓN, skirmish lee ranged/ALCANCE).
// ★ DIFERENCIADOR/⊥ TODOS los peers (check 9): un VOLATILE (disruptor, sz16⇒mole0, melee⇒skirmish0, idle, point-blank, sano, no-CC, prado) ⇒ rol T1 MIENTRAS bulk#92/escaramuza#84/manada#87/siega#86/control#85/interrupt#89/reach#88/embestida#90/zona#91 lo IGNORAN (todos 0).
// ★ CANAL (check 10): forageChargePreview = roleBonus(score). Healer (enabler) ⇒ charge>0; orco (brawler) ⇒ 0.
// ★ SUB-CAP (check 11): charge EFECTIVA = min(roleBountyCap=2, tier.charge). Ningún score produce charge>2.
// ★ BYTE-NEUTRAL OFF (check 12): con ROLE_SURGE OFF, roleBonus(cualquier score)==0 y forageChargePreview==0 aun con un healer disponible ⇒ 0 fichas al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 13): role (score/tier/charge) NO cambia los readouts de los hooks peer; activar APEX/SCARCITY NO cambia la señal de role.
// ★ 0-REGRESIÓN (check 14): las 34 mecánicas del arco #59-#92 siguen served enabled:true; ROLE_SURGE served false (DARK #93).
// North Star (check 16) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO mob (tipo) + héroe ⇒ score/tier/charge + roleProbe + archProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). roleScore es función PURA de G.enemies+tipos ⇒ shard-consistente.
//
// Observado vía __dev.role (flip enabled IN-MEMORY + tp teleport + scoreProbe LUT + archProbe LUT + spawnRole inyección REAL [+overrideArch ⊥#73] + clearRole + roleProbe lectura server-auth) + peer hooks + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Cabecilla:").
//
// Run: node tools/cas2551-role-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2551");
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
// archProbe esperado: arch→band→weight (LUT roleTier). Cubre los 3 buckets + valores no listados.
const EXPECT_ARCH = [
  { arch: "summoner", band: "enabler", w: 2 }, { arch: "healer", band: "enabler", w: 2 },      // habilitador de soporte ⇒ 2
  { arch: "warlock", band: "disruptor", w: 1 }, { arch: "volatile", band: "disruptor", w: 1 }, { arch: "punisher", band: "disruptor", w: 1 },   // disruptor especialista ⇒ 1
  { arch: "brute", band: "brawler", w: 0 }, { arch: "charger", band: "brawler", w: 0 }, { arch: "rusher", band: "brawler", w: 0 }, { arch: "caster", band: "brawler", w: 0 },   // peleador estándar ⇒ 0
  { arch: "", band: "brawler", w: 0 }, { arch: "nonexistent", band: "brawler", w: 0 },          // sin/arch desconocido ⇒ brawler ⇒ 0
];
// spawnRole esperado por TIPO: type → base arch → band → weight. Cubre bandas 0/1/2 con mobs REALES.
const EXPECT_TYPE = [
  { type: "summoner", arch: "summoner", band: "enabler", w: 2 }, { type: "healer", arch: "healer", band: "enabler", w: 2 },
  { type: "demon", arch: "warlock", band: "disruptor", w: 1 }, { type: "volatile", arch: "volatile", band: "disruptor", w: 1 }, { type: "revenant", arch: "punisher", band: "disruptor", w: 1 },
  { type: "orc", arch: "brute", band: "brawler", w: 0 }, { type: "wolf", arch: "rusher", band: "brawler", w: 0 }, { type: "spearman", arch: "caster", band: "brawler", w: 0 }, { type: "charger", arch: "charger", band: "brawler", w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.role + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.role());
  ok("2 byte-id OFF (fresh boot): ROLE_SURGE.enabled false AND G.roleBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "roleFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" weights=${JSON.stringify(dark.weights)} roleTier=${JSON.stringify(dark.roleTier)}`);

  // 3 save OFF has no roleFind/roleBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(roleFind|roleBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"roleBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'roleFind'/'roleBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.role({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.role({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of score (scoreProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.role({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 TABLA de tiers = función PURA del SCORE: 0→T0/0, 1→T1/1, ≥2→T2/2 (cap 2)", tabOK, JSON.stringify(tab));

  // 5b ★ archProbe LUT: arch→band→weight (LUT roleTier), type-independiente.
  const arp = await page.evaluate((cases) => cases.map(c => window.__dev.role({ archProbe: { arch: c.arch } }).archProbe), EXPECT_ARCH);
  const arpOK = EXPECT_ARCH.every((c, i) => arp[i] && arp[i].band === c.band && arp[i].weight === c.w);
  ok("5b ★ archProbe LUT: summoner/healer⇒enabler⇒2; warlock/volatile/punisher⇒disruptor⇒1; brute/charger/rusher/caster/''/desconocido⇒brawler⇒0 (LUT roleTier)",
     arpOK, JSON.stringify(arp.map(x => ({ a: x.arch, b: x.band, w: x.weight }))));

  // 7 ★ REAL SERVER-AUTH: spawnRole pushes a real mob of TYPE to G.enemies; reads roleWeight from ETPL[type].arch. summoner/healer⇒2, demon/volatile/revenant⇒1, orc/wolf/spearman⇒0.
  const server7 = await page.evaluate((args) => {
    const { EXPECT_TYPE, Z } = args;
    window.__dev.role({ enabled: true });
    const out = [];
    for (const c of EXPECT_TYPE) {
      window.__dev.role({ clearRole: true });
      window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.role({ spawnRole: { type: c.type, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRole;
      const rp = window.__dev.role({ roleProbe: true }).roleProbe;
      out.push({ type: c.type, srArch: sr.arch, srBand: sr.band, srW: sr.weight, valid: sr.valid, rpScore: rp.score, rpW: rp.mobs[0] ? rp.mobs[0].weight : -1, rpArch: rp.mobs[0] ? rp.mobs[0].arch : "", rpType: rp.mobs[0] ? rp.mobs[0].type : "" });
    }
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return out;
  }, { EXPECT_TYPE, Z });
  const s7OK = EXPECT_TYPE.every((c, i) => server7[i] && server7[i].srArch === c.arch && server7[i].srBand === c.band && server7[i].srW === c.w && server7[i].valid && server7[i].rpW === c.w && server7[i].rpArch === c.arch && server7[i].rpType === c.type);
  ok("7 ★ REAL SERVER-AUTH: spawnRole empuja un mob REAL del TIPO; roleProbe lee el peso REAL de ETPL[type].arch ⇒ summoner/healer⇒2, demon/volatile/revenant⇒1, orc/wolf/spearman/charger⇒0",
     s7OK, JSON.stringify(server7.map(x => ({ t: x.type, a: x.srArch, b: x.srBand, w: x.srW }))));

  // 7b ★ ⊥#73/⊥champion OVERRIDE: healer con e.tpl.arch sobrescrito a 'brute' (mimetiza campeón arch=undefined) ⇒ roleOf lee ETPL['healer'].arch='healer' BASE ⇒ weight SIGUE 2 pese a tplArch='brute'.
  const ovr = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const healBase = window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } }).spawnRole;
    window.__dev.role({ clearRole: true });
    const healOvr = window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1], overrideArch: "brute" } }).spawnRole;
    const rp = window.__dev.role({ roleProbe: true }).roleProbe;   // lectura REAL: sigue leyendo base
    // control positivo: un orco con arch sobrescrito a 'summoner' sigue leyendo 'brute' (base) ⇒ weight 0 (no salta a 2)
    window.__dev.role({ clearRole: true });
    const orcOvr = window.__dev.role({ spawnRole: { type: "orc", tx: Z.forest[0], ty: Z.forest[1], overrideArch: "summoner" } }).spawnRole;
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return { healBaseArch: healBase.arch, healBaseW: healBase.weight, healOvrTpl: healOvr.tplArch, healOvrArch: healOvr.arch, healOvrW: healOvr.weight, rpW: rp.mobs[0] ? rp.mobs[0].weight : -99,
      orcOvrTpl: orcOvr.tplArch, orcOvrArch: orcOvr.arch, orcOvrW: orcOvr.weight };
  }, Z);
  const ovrOK = ovr.healBaseArch === "healer" && ovr.healBaseW === 2 &&
    ovr.healOvrTpl === "brute" && ovr.healOvrArch === "healer" && ovr.healOvrW === 2 && ovr.rpW === 2 &&   // clon arch='brute', BASE 'healer' ⇒ rol 2
    ovr.orcOvrTpl === "summoner" && ovr.orcOvrArch === "brute" && ovr.orcOvrW === 0;                        // clon arch='summoner', BASE 'brute' ⇒ rol 0 (NO 2)
  ok("7b ★ ⊥#73/⊥champion OVERRIDE: e.tpl.arch sobrescrito (mimetiza campeón arch=undefined) ⇒ roleOf lee ETPL[type].arch BASE ⇒ healer SIGUE rol2, orco SIGUE rol0 (desacople del clon)",
     ovrOK, JSON.stringify(ovr));

  // 8 ★ ⊥#92 crux: summoner (arch summoner⇒rol2) tiene mole 1 (sz20); moose (arch brute⇒rol0) tiene mole 2 (sz26). NO correlacionan ⇒ DISJUNTOS (función de IA vs tamaño físico).
  const crux = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.role({ clearRole: true });
    // SUMMONER en el PRADO
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { role: window.__dev.role().score, mole: window.__dev.bulk().score };
    window.__dev.role({ clearRole: true });
    // MOOSE en el PRADO
    window.__dev.role({ spawnRole: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const moose = { role: window.__dev.role().score, mole: window.__dev.bulk().score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { summoner, moose };
  }, Z);
  const cruxOK = crux.summoner.role === 2 && crux.summoner.mole === 1 &&   // summoner: rol 2 (enabler), mole 1 (media)
    crux.moose.role === 0 && crux.moose.mole === 2;                        // moose: rol 0 (brute), mole 2 (grande)
  ok("8 ★ ⊥#92 crux: SUMMONER (arch summoner⇒rol2/enabler) mole 1 (sz20); MOOSE (arch brute⇒rol0) mole 2 (sz26) — rol alto donde mole media, rol cero donde mole alta ⇒ DISJUNTOS (IA vs tamaño)",
     cruxOK, JSON.stringify(crux));

  // 8b ★ ⊥#84 crux: spearman (caster, ranged:true) ⇒ rol 0 pero skirmish>0; healer (enabler, NO ranged) ⇒ rol 2 pero skirmish 0. OPUESTOS.
  const crux84 = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // SPEARMAN (caster ranged) en el PRADO
    window.__dev.role({ spawnRole: { type: "spearman", tx: Z.forest[0], ty: Z.forest[1] } });
    const spearman = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    // HEALER (enabler, NO ranged) en el PRADO
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });
    const healer = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return { spearman, healer };
  }, Z);
  const crux84OK = crux84.spearman.role === 0 && crux84.spearman.skirmish > 0 &&   // caster ranged: rol 0, skirmish>0
    crux84.healer.role === 2 && crux84.healer.skirmish === 0;                      // enabler no-ranged: rol 2, skirmish 0
  ok("8b ★ ⊥#84 crux: SPEARMAN (caster ranged) ⇒ rol0/skirmish>0; HEALER (enabler NO-ranged) ⇒ rol2/skirmish0 — OPUESTOS (rol lee arch/FUNCIÓN, skirmish lee ranged/ALCANCE)",
     crux84OK, JSON.stringify(crux84));

  // 9 ★ DIFFERENTIATOR/⊥ ALL peers: un VOLATILE (disruptor, sz16⇒mole0, melee, idle, point-blank, sano, no-CC, prado) ⇒ rol T1 MIENTRAS TODOS los peers IGNORAN.
  const diff = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const bulBefore = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const skiBefore = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakBefore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloBefore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrBefore = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intBefore = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    // VOLATILE (disruptor rol 1) sz16 melee sano suelto no-CC idle point-blank prado: in-radio de todos los peers, pero mole0/melee/suelto/sano/sin-CC/idle/point-blank/zona-inicial ⇒ SÓLO role dispara
    window.__dev.role({ spawnRole: { type: "volatile", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.role();
    const bulAfter = window.__dev.bulk({ bulkProbe: true }).bulkProbe.score;
    const skiAfter = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const pakAfter = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const bloAfter = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrAfter = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const intAfter = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    const reach = window.__dev.longshot({ reachProbe: true }).reachProbe.score;   // point-blank ⇒ 0
    const head = window.__dev.heading().score;                                     // volatile idle estacionario ⇒ 0
    const zone = window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });   // prado ⇒ 0
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge,
      bulBefore, bulAfter, skiBefore, skiAfter, pakBefore, pakAfter, bloBefore, bloAfter, ctrBefore, ctrAfter, intBefore, intAfter, reach, head, zoneScore };
  }, Z);
  const diffOK = diff.score === 1 && diff.tier === 1 && diff.charge >= 1 &&                        // role fires (volatile disruptor)
    diff.bulAfter === diff.bulBefore && diff.bulAfter === 0 &&                                     // mole #92 IGNORA (sz16<18 ⇒ 0)
    diff.skiAfter === diff.skiBefore && diff.pakAfter === diff.pakBefore &&                        // escaramuza #84 / manada #87 IGNORAN
    diff.bloAfter === diff.bloBefore && diff.ctrAfter === diff.ctrBefore && diff.intAfter === diff.intBefore && // siega #86 / control #85 / interrupt #89 IGNORAN
    diff.reach === 0 && diff.head === 0 && diff.zoneScore === 0;                                   // reach #88 / embestida #90 / zona #91 IGNORAN
  ok("9 ★ DIFERENCIADOR/⊥ TODOS: VOLATILE (disruptor sz16 melee sano suelto no-CC idle point-blank prado) ⇒ rol T1 MIENTRAS mole/escaramuza/manada/siega/control/interrupt/reach/embestida/zona IGNORAN",
     diffOK, JSON.stringify(diff));

  // 10 CANAL roleFind: forageChargePreview healer (enabler)>0 ; orco (brawler) → 0
  const forage = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });   // healer ⇒ score 2 ⇒ T2
    const actVm = window.__dev.role();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.role({ clearRole: true });
    window.__dev.role({ spawnRole: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });      // orco ⇒ score 0
    const orcVm = window.__dev.role();
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return { actPrev, actCharge, orcPrev: orcVm.forageChargePreview, orcTier: orcVm.tier, orcScore: orcVm.score };
  }, Z);
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.orcPrev === 0 && forage.orcTier === 0 && forage.orcScore === 0;
  ok("10 CANAL roleFind: forageChargePreview con healer (enabler) ⇒ charge>0 (==roleBonus); con orco (brawler) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds roleBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.role({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.role().cap };
  });
  ok("11 ★ SUB-CAP: ningún score produce charge>roleBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a healer available
  const neutral = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });   // healer disponible
    window.__dev.role({ enabled: false });                             // now OFF
    const off = window.__dev.role();
    window.__dev.role({ enabled: true }); window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score };
  }, Z);
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, roleBonus(healer disponible)==0 + forageChargePreview==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip role OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling APEX/SCARCITY no cambia la señal de role.
  const orth = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ enabled: false });
    const snap = () => JSON.stringify({ blo: window.__dev.bloodHarvest(), pak: window.__dev.packHarvest(), ski: window.__dev.skirmishLine(), lng: window.__dev.longshot(), itr: window.__dev.interrupt(), hdg: window.__dev.heading(), zt: window.__dev.zonetier(), blk: window.__dev.bulk(), apx: window.__dev.apex().enabled, scr: window.__dev.scarcity().enabled });
    const peersOff = snap();
    window.__dev.role({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.role();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true });
    window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.role();
    const apAfter = window.__dev.apex().enabled, scAfter = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity({ enabled: scPrev });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge;
    return { peersUnchanged, sigUnchanged, apAfter, scAfter };
  }, Z);
  ok("13 ★ ORTOGONALIDAD roleFind ⊥ peers: flip role OFF→ON NO cambia bloodHarvest/packHarvest/skirmishLine/longshot/interrupt/heading/zonetier/bulk/apex/scarcity; toggling APEX/SCARCITY NO cambia la señal de role; ambos operables",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 34 arc flags served true; ROLE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const roleDark = flag("ROLE_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 34 mecanismos del arco #59-#92 served enabled:true; ROLE_SURGE served false (DARK #93)",
     arcAllOn && roleDark && arc.length === 34, `role=${flag("ROLE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Cabecilla:" drawn ON+healer / not OFF + fps.
  const badge = await page.evaluate(async (Z) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cabecilla:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });   // healer ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, Z);
  ok("15 render badge \"Cabecilla:\" se DIBUJA ON+healer (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((Z) => { window.__dev.role({ enabled: true }); window.__dev.role({ clearRole: true }); window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false }); });

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
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.role();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.role({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const archs = ["summoner", "healer", "warlock", "volatile", "punisher", "brute", "caster", ""].map(a => { const q = window.__dev.role({ archProbe: { arch: a } }).archProbe; return { a, b: q.band, w: q.weight }; });
    const rp = window.__dev.role({ roleProbe: true }).roleProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score, rpCount: rp.count, rpW: rp.mobs[0] ? rp.mobs[0].weight : -1, rpArch: rp.mobs[0] ? rp.mobs[0].arch : "", rpType: rp.mobs[0] ? rp.mobs[0].type : "", lut, archs, fp };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore && A.rpCount === B.rpCount && A.rpW === B.rpW && A.rpArch === B.rpArch && A.rpType === B.rpType && JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.archs) === JSON.stringify(B.archs) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMO healer+héroe ⇒ score/tier/charge + roleProbe(score,count,weight,arch,type) + archProbe LUT + scoreProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},rpScore:${A.rpScore},rpCount:${A.rpCount},rpW:${A.rpW},rpArch:${A.rpArch},rpType:${A.rpType},archs:${JSON.stringify(A.archs)},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},rpScore:${B.rpScore},rpCount:${B.rpCount},rpW:${B.rpW},rpArch:${B.rpArch},rpType:${B.rpType},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.role({ enabled: false }));
  await pageB.evaluate(() => window.__dev.role({ enabled: false }));

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
