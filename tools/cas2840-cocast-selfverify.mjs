// CAS-2840 — self-verify for CONJURO (DARK, CO_CAST_SURGE.enabled:false). EVO mecánica #146 (base master 4758b411 tras #145 TENAZA CO_FLANK LIVE&served 251653b6d194/815, census 73) — EJE FRESCO + CANAL FRESCO, ⊥ a los 87 LIVE #59-#145. El 28º eje de COMPOSICIÓN-DE-INTENCIÓN y la ONCEAVA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN/heal, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN, #142 PIÑA=APIÑADOS, #143 ENVITE=EMPUJAN, #144 DIANA=CONVERGEN-el-aim/CONTEO, #145 TENAZA=GEOMETRÍA); es la sub-faceta ACTION-EVENT (evento-de-activación).
// (A) EJE FRESCO = CONJURO/CO-CAST = U = nº de jugadores VIVOS DISTINTOS con un flag de activación-de-habilidad (`cast`) ACTIVO este frame (co-cast/ability-sync), ⊥ #139 SOCORRO (SUPPORT-ONLY — ANY-ABILITY ⊥ heal-class), ⊥ #138 CUADRILLA (casting ⊥ killing), ⊥ #144 DIANA (activar ⊥ compartir-objetivo), ⊥ #145 TENAZA (evento ⊥ geometría). Tally BOOLEANO ENTERO. 🔑 DETERMINISMO (sev-1): U = conteo ENTERO de banderas (CERO float/atan2 en el score/decisión; el conteo es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midCast2,hiCast3} ⇒ 0-float en el score/decisión. Bandas: U≥hiCast(3) ⇒ sync-pleno ⇒ 2; U≥midCast(2) ⇒ sync-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 caster ⇒ U colapsa ⇒ 0 (colapso LIMPIO).
// (B) CANAL FRESCO = coCastFind (fichas de conjuro por rematar con la sincronía ACREDITADA — NINGUNO de los 87 flags lo usa). Moneda FRESCA (h.coCastBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — CONJURO = SIMULTANEIDAD-DE-ACTIVACIÓN (evento cast/skill) ⊥ TODOS los priores. PRIMARIO ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY): 3 lanzando DPS ⇒ CONJURO U3/w2 pero SOCORRO S0/w0 (ningún heal); 3 sanando ⇒ SOCORRO S3/w2 pero si NO se flaggean cast ⇒ CONJURO U0/w0 — los conteos se mueven INDEPENDIENTEMENTE. ⊥#138 CUADRILLA (casting ⊥ killing). ⊥#144 DIANA (activar ⊥ compartir-objetivo). ⊥#145 TENAZA (evento ⊥ geometría).
//
// Run: node tools/cas2840-cocast-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2840");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// castProbe LUT esperada: (casters=nº de jugadores activando una habilidad, players=P gate)→U=clamp(casters,0,players)→banda(U vs {midCast2,hiCast3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiCast 3 / midCast 2 + colapso single-player (U<minPlayers2 ⇒ 0).
const EXPECT_CAST = [
  { name: "solo-P1",       casters: 1, players: 1, U: 1, w: 0 },   // single-player: U1<midCast ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",        casters: 2, players: 2, U: 2, w: 1 },   // 2 casters ⇒ U2 ⇒ 1 (sync parcial)
  { name: "duo-of-4",      casters: 2, players: 4, U: 2, w: 1 },   // 2 casters DE un roster de 4 ⇒ U2 ⇒ 1
  { name: "trio-P3",       casters: 3, players: 3, U: 3, w: 2 },   // 3 casters ⇒ U3 ⇒ 2 (sync pleno)
  { name: "quad-4",        casters: 4, players: 4, U: 4, w: 2 },   // 4 casters ⇒ U4 ⇒ 2
  { name: "none",          casters: 0, players: 3, U: 0, w: 0 },   // 🔑 0 casters (nadie activa) ⇒ U0 ⇒ 0
  { name: "one-of-4",      casters: 1, players: 4, U: 1, w: 0 },   // 🔑 1 solo caster de 4 ⇒ U1 ⇒ 0 (uno lanza, los demás no)
  { name: "clamp-players", casters: 9, players: 3, U: 3, w: 2 },   // casters>P se clampa a P=3 ⇒ U3 ⇒ 2
];
// driveCast REAL: inyecta roster sintético (P jugadores con {cast,dead}) ⇒ U server-auth = # jugadores VIVOS con el flag `cast`.
// filas: [cast, dead].
const EXPECT_DRIVE = [
  { name: "duo-cast",          players: [[true, false], [true, false]],                         U: 2, w: 1 },   // 2 casteando ⇒ U2 (sync parcial)
  { name: "one-cast",          players: [[true, false], [false, false]],                        U: 1, w: 0 },   // 🔑 1 castea, 1 no ⇒ U1 ⇒ 0
  { name: "solo",              players: [[true, false]],                                        U: 1, w: 0 },   // 1 ⇒ U1 ⇒ 0
  { name: "trio-cast",         players: [[true, false], [true, false], [true, false]],          U: 3, w: 2 },   // 3 casteando ⇒ U3 (sync pleno)
  { name: "noncast-excluded",  players: [[true, false], [true, false], [false, false]],         U: 2, w: 1 },   // 🔑 3º NO castea ⇒ EXCLUIDO ⇒ U2
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           U: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ U2 (ANTI-cadáveres)
  { name: "quad-cast",         players: [[true, false], [true, false], [true, false], [true, false]], U: 4, w: 2 },   // 4 casteando ⇒ U4
  { name: "all-idle",          players: [[false, false], [false, false], [false, false]],       U: 0, w: 0 },   // 🔑 nadie castea ⇒ U0 ⇒ 0
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
  page.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coCast + peer hooks (coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coCast());
  ok("2 byte-id OFF (fresh boot): CO_CAST_SURGE.enabled false AND G.coCastBounty NUNCA se crea (gExists false) AND G._coCastParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.cast === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coCastFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} cast=${dark.cast} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCast=${dark.hiCast} midCast=${dark.midCast} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coCastFind/coCastBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coCastFind|coCastBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coCastBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coCastFind'/'coCastBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCast({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCast({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ castProbe LUT: (casters,players)→U=clamp→banda(U vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coCast({ castProbe: { casters: c.casters, players: c.players } }).castProbe), EXPECT_CAST);
  const tabOK = EXPECT_CAST.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].cast === c.U);
  ok("5 ★ castProbe LUT (CONJURO U=# casters distintos): solo-P1(U1)⇒0, duo(U2)⇒1, duo-of-4(U2)⇒1, trio(U3)⇒2, quad(U4)⇒2, none(U0)⇒0, one-of-4(U1)⇒0, clamp-players⇒U3. UMBRAL hiCast 3/midCast 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_CAST[i].name, p: x.players, U: x.cast, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH CONJURO: driveCast inyecta roster sintético ({cast,dead}) ⇒ U REAL server-auth = # jugadores VIVOS con el flag `cast` (filtra muertos + no-casters).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ cast: !!r[0], dead: !!r[1] }));
    window.__dev.coCast({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCast({ driveCast: { players: mkParty(c.players), wipe: true } }).driveCast;
      const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvCast: dv.cast, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveCast: live.cast, livePlayers: live.players });
    }
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvCast === c.U && comp[i].liveCast === c.U);
  ok("5c ★ REAL SERVER-AUTH CONJURO (tally de banderas cast entre VIVOS): duo-cast(U2)=w1, one-cast(U1)=w0, solo(U1)=w0, trio-cast(U3)=w2, noncast-excl(U2)=w1, dead-excl(U2)=w1, quad-cast(U4)=w2, all-idle(U0)=w0 (filtra muertos + no-casters)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY) — LUT: los conteos U (cualquier cast) y S (heal-only) se mueven INDEPENDIENTEMENTE.
  const cruxSup = await page.evaluate(() => {
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    // DPS salvo: 3 casteando DPS (U3) pero NINGUNO aplica soporte (S0)
    const dps = { cst: cst(3, 3), aid: aid(0, 3) };
    // heal-only: 3 socorredores (S3) pero NO flaggeados como cast genérico en este probe (U0) — conteos independientes
    const heal = { cst: cst(0, 3), aid: aid(3, 3) };
    return { dps, heal };
  });
  const cruxSupOK =
    cruxSup.dps.cst.cast === 3 && cruxSup.dps.cst.weight === 2 && cruxSup.dps.aid.aid === 0 && cruxSup.dps.aid.weight === 0
    && cruxSup.heal.cst.cast === 0 && cruxSup.heal.cst.weight === 0 && cruxSup.heal.aid.aid === 3 && cruxSup.heal.aid.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY): {3 DPS casteando, 0 heal} ⇒ CONJURO U3/w2 pero SOCORRO S0/w0; {0 cast-genérico, 3 socorredores} ⇒ CONJURO U0/w0 pero SOCORRO S3/w2 ⇒ activar-cualquier-habilidad ⊥ aplicar-soporte (conteos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6b ★ CRUX ⊥#138 CUADRILLA (casting ⊥ killing): CONJURO cuenta activación; CUADRILLA cuenta killers acreditados. Conteos independientes.
  const cruxKill = await page.evaluate(() => {
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    // 3 casteando (U3) pero 0 remates acreditados este frame (K0)
    const A = { cst: cst(3, 3), kill: kill(0, 3) };
    // 3 rematando (K3) pero 0 flaggeados cast (U0)
    const B = { cst: cst(0, 3), kill: kill(3, 3) };
    return { A, B };
  });
  const ckA = cruxKill.A, ckB = cruxKill.B;
  const cruxKillOK = ckA.cst.cast === 3 && ckA.cst.weight === 2 && ckA.kill && ckA.kill.weight === 0
    && ckB.cst.cast === 0 && ckB.cst.weight === 0 && ckB.kill && ckB.kill.weight === 2;
  ok("6b ★ CRUX ⊥#138 CUADRILLA (casting ⊥ killing): {3 casteando, 0 remates} ⇒ CONJURO U3/w2 pero CUADRILLA K0/w0; {0 cast, 3 remates} ⇒ CONJURO U0/w0 pero CUADRILLA w2 ⇒ activar-habilidad ⊥ rematar",
     cruxKillOK, JSON.stringify(cruxKill));

  // 6f ★ CRUX ⊥#139/#138/#145/#144 CANAL DISTINTO: coCastFind ⊥ coSupportFind/coKillFind/coFlankFind/coFocusFind.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coCastCh = grab("CO_CAST_SURGE"), coSupCh = grab("CO_SUPPORT_SURGE"), coKillCh = grab("CO_KILL_SURGE"), coFlankCh = grab("CO_FLANK_SURGE"), coFocusCh = grab("CO_FOCUS_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coCast().channel);
  const chOK = coCastCh === "coCastFind" && vmCh === "coCastFind" && coSupCh === "coSupportFind" && coKillCh === "coKillFind" && coFlankCh === "coFlankFind" && coFocusCh === "coFocusFind"
    && [coSupCh, coKillCh, coFlankCh, coFocusCh].every(c => c !== coCastCh);
  ok("6f ★ CRUX CANAL FRESCO coCastFind ⊥ coSupportFind #139 / coKillFind #138 / coFlankFind #145 / coFocusFind #144 (canal DISTINTO por construcción; VM idem)",
     chOK, `coCast=${coCastCh} vm=${vmCh} coSup=${coSupCh} coKill=${coKillCh} coFlank=${coFlankCh} coFocus=${coFocusCh}`);

  // 7 ★ U-SENSITIVITY: más casters simultáneos ⇒ U sube.
  const uSens = await page.evaluate(() => {
    const t = (casters, P) => { const m = window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe; return { U: m.cast, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const uSensOK = uSens.duo.U === 2 && uSens.trio.U === 3 && uSens.quad.U === 4 && uSens.duo.w === 1 && uSens.trio.w === 2 && uSens.quad.w === 2;
  ok("7 ★ U-SENSITIVITY (U sube con más casters): 2⇒U2/w1, 3⇒U3/w2, 4⇒U4/w2 (CONJURO mide CUÁNTOS activan simultáneamente)",
     uSensOK, JSON.stringify(uSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveCast REAL): 1 caster ⇒ 0; ≥2 ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    const drive = (rows) => { window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCast({ driveCast: { players: rows.map(r => ({ cast: !!r[0], dead: !!r[1] })), wipe: true } }).driveCast;
      const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
      return { idx: dv.idx, cast: dv.cast, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);                                    // 1 caster: U=1 ⇒ 0 (colapso)
    const mp = drive([[true, false], [true, false], [true, false]]);      // 3 casters: U3 ⇒ score2 (bien-definido)
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.cast === 1 && degen.sp.score === 0 && degen.mp.cast === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 caster ⇒ U1/score0; 3 casteando ⇒ U3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-castear en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos castProbe idénticos ⇒ U/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coCast({ castProbe: { casters: 3, players: 4 } }).castProbe;
    const b = window.__dev.coCast({ castProbe: { casters: 3, players: 4 } }).castProbe;
    return { a: { U: a.cast, w: a.weight }, b: { U: b.cast, w: b.weight } };
  });
  const detOK = det.a.U === det.b.U && det.a.w === det.b.w && det.a.U === 3;
  ok("9 ★ INTEGER-DETERMINISM: castProbe repetido ⇒ U/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo (determinismo): permutar el orden del roster ⇒ MISMO U (el conteo es CONMUTATIVO).
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    const g = (rows) => { window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coCast({ driveCast: { players: rows.map(r => ({ cast: !!r[0], dead: !!r[1] })), wipe: true } }).driveCast.cast; };
    const a = g([[true, false], [false, false], [true, false]]);   // 2 casteando ⇒ U2
    const b = g([[false, false], [true, false], [true, false]]);   // MISMOS jugadores, orden permutado ⇒ MISMO U2
    window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 casters) en 2 órdenes distintos ⇒ MISMO U2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coCastFind: forageChargePreview con sincronía acreditada >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });   // sync-pleno ⇒ score2
    const actVm = window.__dev.coCast();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: false }], wipe: true } });   // solitario (U1) ⇒ score0
    const goVm = window.__dev.coCast();
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coCastFind: forageChargePreview sync pleno (U≥3) ⇒ charge>0 (==coCastBonus); con solitario (U1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coCastBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coCast({ castProbe: { casters: s, players: s } }).castProbe.charge);  // U=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coCast().cap };
  });
  ok("11 ★ SUB-CAP: ningún sync pleno produce charge>coCastBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full salvo available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });   // sync-pleno disponible
    window.__dev.coCast({ enabled: false });                          // now OFF
    const off = window.__dev.coCast();
    window.__dev.coCast({ enabled: true }); window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, cast: off.cast };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.cast === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coCastBonus(sync pleno disponible)==0 + forageChargePreview==0 + idx==0 + cast==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling peers no cambia la señal de coCast.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }).driveCast;
    const snap = () => JSON.stringify({ coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, cs: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.cs }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
    window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.cs }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.cast === after.cast;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeCast: before.cast, afterCast: after.cast };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coCastFind ⊥ peers: la señal de co-cast (score/cast) NO cambia al togglear CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 74 `_SURGE` totales, sole-false = CO_CAST (73 true, incl. CO_FLANK #145 LIVE).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coFlankLive = census.find(([n]) => n === "CO_FLANK_SURGE");
  const censusOK = total === 74 && trues === 73 && falses.length === 1 && falses[0] === "CO_CAST_SURGE" && coFlankLive && coFlankLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 74 `_SURGE` totales, 73 enabled:true (incl. CO_FLANK_SURGE #145 LIVE), sole-false = CO_CAST_SURGE (DARK #146)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coFlank=${coFlankLive ? coFlankLive[1] : "?"}`);

  // 15 render badge "Conjuro:" drawn ON+salvo / not OFF + fps. 🔑 label ÚNICO "Conjuro:" (⊥ #145 'Tenaza:'/#144 'Diana:'/#139 'Socorro:'/#138 'Cuadrilla:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Conjuro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    const enAtOff = window.__dev.coCast().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Conjuro:\" se DIBUJA ON+salvo (U>0, re-driven cada frame) y NO OFF (U 0) + fps sano (label ÚNICO ⊥ #145 'Tenaza:'/#144 'Diana:'/#139 'Socorro:'/#138 'Cuadrilla:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coCast({ enabled: true }); window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1).
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }).driveCast;   // U=3 ⇒ score2
    const vm = window.__dev.coCast();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([casters, P]) => { const m = window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe; return { p: m.players, U: m.cast, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { score: dv.score, idx: dv.idx, cast: dv.cast, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveCast: live.cast, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.cast === B.cast && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveCast === B.liveCast && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA salva U=3 ⇒ score/idx/cast/players/tier/charge + castProbeLive(field,cast,players,score) + castProbe LUT (U enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},cast:${A.cast},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveCast:${A.liveCast},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},cast:${B.cast},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveCast:${B.liveCast},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coCast({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coCast({ enabled: false }));

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
