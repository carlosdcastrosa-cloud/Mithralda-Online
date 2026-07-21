// CAS-2853 — self-verify for ÉGIDA (DARK, CO_BUFF_UPTIME_SURGE.enabled:false). EVO mecánica #149 (base master 9c136a6 tras #148 YUGO CO_INTERRUPT LIVE&served 4a0403b7e832/815, census 76) — EJE FRESCO + CANAL FRESCO, ⊥ a los 90 LIVE #59-#148. El 31º eje de COMPOSICIÓN-DE-INTENCIÓN y la CATORCEAVA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=APLICAN-heal/EVENTO, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN, #142 PIÑA=APIÑADOS, #143 ENVITE=EMPUJAN, #144 DIANA=CONVERGEN/CONTEO, #145 TENAZA=GEOMETRÍA, #146 CONJURO=ACTIVAN/cast-EVENTO, #147 QUIEBRO=ESQUIVAN/dodge-EVENTO, #148 YUGO=INTERRUMPEN/interrupt-EVENTO); es la sub-faceta SUSTAINED-STATE / SHARED-EMPOWERMENT (el CONTRAPUNTO SOSTENIDO de las tres sub-facetas EVENTO #146/#147/#148).
// (A) EJE FRESCO = ÉGIDA/CO-BUFF = B = nº de jugadores VIVOS DISTINTOS con un flag de buff/aura ACTIVO (`buff` — shield/haste/might/regen/resina, la UPTIME) este frame (co-buff/shared-aegis), ⊥ #139 SOCORRO (SUSTAINED-STATE ⊥ APPLICATION-EVENT — portar-un-buff ⊥ aplicar-un-socorro), ⊥ #146 CONJURO (STATE-DE-BUFF ⊥ ANY-CAST — tener-el-buff ⊥ activarlo), ⊥ #132 PARTY_VITAL (buff-uptime BOOLEANA-ENTERA ⊥ HP-fracción-media float), ⊥ #140 MURALLA (portar ⊥ absorber), ⊥ #138 CUADRILLA (portar ⊥ rematar), ⊥ #147/#148 (estado ⊥ dodge/interrupt EVENTO). Tally BOOLEANO ENTERO. 🔑 DETERMINISMO (sev-1): B = conteo ENTERO de banderas (CERO float/atan2 en el score/decisión; el conteo es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midBuff2,hiBuff3} ⇒ 0-float en el score/decisión. Bandas: B≥hiBuff(3) ⇒ égida-plena ⇒ 2; B≥midBuff(2) ⇒ égida-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 buffeado ⇒ B colapsa ⇒ 0 (colapso LIMPIO).
// (B) CANAL FRESCO = coBuffFind (fichas de égida por rematar con la égida ACREDITADA — NINGUNO de los 90 flags lo usa). Moneda FRESCA (h.coBuffBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — ÉGIDA = SIMULTANEIDAD-DE-ESTADO-SOSTENIDO-DE-BUFF (uptime de aura/shield/might/regen ACTIVO) ⊥ TODOS los priores. PRIMARIO ⊥#139 SOCORRO (SUSTAINED-STATE ⊥ APPLICATION-EVENT): 3 portando un aura de hace rato ⇒ ÉGIDA B3/w2 pero SOCORRO S0/w0 (0 aplicaciones este frame); 3 mid-support-cast ⇒ SOCORRO S3/w2 pero ÉGIDA B0/w0 (aplicando pero nadie buffeado aún) — los conteos se mueven INDEPENDIENTEMENTE. ⊥#146 CONJURO (STATE ⊥ ANY-CAST-EVENTO). ⊥#132 PARTY_VITAL (int-bool ⊥ HP-float). ⊥#148 YUGO (estado-sostenido ⊥ interrupt-EVENTO).
//
// Run: node tools/cas2853-cobuff-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2853");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// buffProbe LUT esperada: (buffers=nº de jugadores portando un buff activo, players=P gate)→B=clamp(buffers,0,players)→banda(B vs {midBuff2,hiBuff3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiBuff 3 / midBuff 2 + colapso single-player (B<minPlayers2 ⇒ 0).
const EXPECT_BUFF = [
  { name: "solo-P1",       buffers: 1, players: 1, B: 1, w: 0 },   // single-player: B1<midBuff ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",        buffers: 2, players: 2, B: 2, w: 1 },   // 2 buffeados ⇒ B2 ⇒ 1 (égida parcial)
  { name: "duo-of-4",      buffers: 2, players: 4, B: 2, w: 1 },   // 2 buffeados DE un roster de 4 ⇒ B2 ⇒ 1
  { name: "trio-P3",       buffers: 3, players: 3, B: 3, w: 2 },   // 3 buffeados ⇒ B3 ⇒ 2 (égida plena)
  { name: "quad-4",        buffers: 4, players: 4, B: 4, w: 2 },   // 4 buffeados ⇒ B4 ⇒ 2
  { name: "none",          buffers: 0, players: 3, B: 0, w: 0 },   // 🔑 0 buffs (nadie porta aura) ⇒ B0 ⇒ 0
  { name: "one-of-4",      buffers: 1, players: 4, B: 1, w: 0 },   // 🔑 1 solo buffeado de 4 ⇒ B1 ⇒ 0 (uno porta aura, los demás no)
  { name: "clamp-players", buffers: 9, players: 3, B: 3, w: 2 },   // buffers>P se clampa a P=3 ⇒ B3 ⇒ 2
];
// driveBuff REAL: inyecta roster sintético (P jugadores con {buff,dead}) ⇒ B server-auth = # jugadores VIVOS con el flag `buff`.
// filas: [buff, dead].
const EXPECT_DRIVE = [
  { name: "duo-buff",          players: [[true, false], [true, false]],                         B: 2, w: 1 },   // 2 portando aura ⇒ B2 (égida parcial)
  { name: "one-buff",          players: [[true, false], [false, false]],                        B: 1, w: 0 },   // 🔑 1 porta, 1 no ⇒ B1 ⇒ 0
  { name: "solo",              players: [[true, false]],                                        B: 1, w: 0 },   // 1 ⇒ B1 ⇒ 0
  { name: "trio-buff",         players: [[true, false], [true, false], [true, false]],          B: 3, w: 2 },   // 3 portando ⇒ B3 (égida plena)
  { name: "unbuffed-excluded", players: [[true, false], [true, false], [false, false]],         B: 2, w: 1 },   // 🔑 3º SIN buff ⇒ EXCLUIDO ⇒ B2
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           B: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ B2 (ANTI-cadáveres)
  { name: "quad-buff",         players: [[true, false], [true, false], [true, false], [true, false]], B: 4, w: 2 },   // 4 portando ⇒ B4
  { name: "all-unbuffed",      players: [[false, false], [false, false], [false, false]],       B: 0, w: 0 },   // 🔑 nadie porta ⇒ B0 ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coBuff && window.__dev.coInterrupt && window.__dev.coDodge && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coBuff + peer hooks (coInterrupt/coDodge/coCast/coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coBuff());
  ok("2 byte-id OFF (fresh boot): CO_BUFF_UPTIME_SURGE.enabled false AND G.coBuffBounty NUNCA se crea (gExists false) AND G._coBuffParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.buff === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coBuffFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} buff=${dark.buff} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiBuff=${dark.hiBuff} midBuff=${dark.midBuff} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coBuffFind/coBuffBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coBuffFind|coBuffBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coBuffBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coBuffFind'/'coBuffBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coBuff({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coBuff({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ buffProbe LUT: (buffers,players)→B=clamp→banda(B vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coBuff({ buffProbe: { buffers: c.buffers, players: c.players } }).buffProbe), EXPECT_BUFF);
  const tabOK = EXPECT_BUFF.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].buff === c.B);
  ok("5 ★ buffProbe LUT (ÉGIDA B=# buffeados distintos): solo-P1(B1)⇒0, duo(B2)⇒1, duo-of-4(B2)⇒1, trio(B3)⇒2, quad(B4)⇒2, none(B0)⇒0, one-of-4(B1)⇒0, clamp-players⇒B3. UMBRAL hiBuff 3/midBuff 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_BUFF[i].name, p: x.players, B: x.buff, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH ÉGIDA: driveBuff inyecta roster sintético ({buff,dead}) ⇒ B REAL server-auth = # jugadores VIVOS con el flag `buff` (filtra muertos + no-buffeados).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ buff: !!r[0], dead: !!r[1] }));
    window.__dev.coBuff({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coBuff({ driveBuff: { players: mkParty(c.players), wipe: true } }).driveBuff;
      const live = window.__dev.coBuff({ buffProbeLive: true }).buffProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvBuff: dv.buff, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveBuff: live.buff, livePlayers: live.players });
    }
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvBuff === c.B && comp[i].liveBuff === c.B);
  ok("5c ★ REAL SERVER-AUTH ÉGIDA (tally de banderas buff entre VIVOS): duo-buff(B2)=w1, one-buff(B1)=w0, solo(B1)=w0, trio-buff(B3)=w2, unbuffed-excl(B2)=w1, dead-excl(B2)=w1, quad-buff(B4)=w2, all-unbuffed(B0)=w0 (filtra muertos + no-buffeados)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#139 SOCORRO (SUSTAINED-STATE ⊥ APPLICATION-EVENT) — LUT: los conteos B (portar-un-buff) y S (aplicar-un-socorro) se mueven INDEPENDIENTEMENTE.
  const cruxSup = await page.evaluate(() => {
    const bf = (buffers, P) => window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    // uptime: 3 portando un aura de hace rato (B3) pero NINGUNO aplicando socorro este frame (S0)
    const carry = { bf: bf(3, 3), aid: aid(0, 3) };
    // socorro: 3 aplicando heal/shield (S3) pero NINGUNO buffeado aún (B0) — conteos independientes
    const apply = { bf: bf(0, 3), aid: aid(3, 3) };
    return { carry, apply };
  });
  const cs = cruxSup;
  const cruxSupOK =
    cs.carry.bf.buff === 3 && cs.carry.bf.weight === 2 && cs.carry.aid && cs.carry.aid.weight === 0
    && cs.apply.bf.buff === 0 && cs.apply.bf.weight === 0 && cs.apply.aid && cs.apply.aid.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#139 SOCORRO (SUSTAINED-STATE ⊥ APPLICATION-EVENT): {3 portando un aura, 0 aplicando} ⇒ ÉGIDA B3/w2 pero SOCORRO S0/w0; {0 buffeados, 3 aplicando} ⇒ ÉGIDA B0/w0 pero SOCORRO S3/w2 ⇒ portar-un-buff-SOSTENIDO ⊥ aplicar-un-socorro-EVENTO (conteos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6b ★ CRUX ⊥#146 CONJURO (STATE-DE-BUFF ⊥ ANY-CAST-EVENTO): castear un buff ≠ tenerlo ya activo. Conteos independientes.
  const cruxCast = await page.evaluate(() => {
    const bf = (buffers, P) => window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe;
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    // 3 portando un aura pasivo (B3) pero 0 casteando (U0)
    const A = { bf: bf(3, 3), cst: cst(0, 3) };
    // 3 mid-cast (U3) pero 0 buffeados aún (B0)
    const B = { bf: bf(0, 3), cst: cst(3, 3) };
    return { A, B };
  });
  const cc = cruxCast;
  const cruxCastOK = cc.A.bf.buff === 3 && cc.A.bf.weight === 2 && cc.A.cst && cc.A.cst.weight === 0
    && cc.B.bf.buff === 0 && cc.B.bf.weight === 0 && cc.B.cst && cc.B.cst.weight === 2;
  ok("6b ★ CRUX ⊥#146 CONJURO (STATE-DE-BUFF ⊥ ANY-CAST-EVENTO): {3 portando aura, 0 casteando} ⇒ ÉGIDA B3/w2 pero CONJURO U0/w0; {0 buffeados, 3 mid-cast} ⇒ ÉGIDA B0/w0 pero CONJURO U3/w2 ⇒ tener-el-buff ⊥ activarlo (OPUESTOS)",
     cruxCastOK, JSON.stringify(cruxCast));

  // 6c ★ CRUX ⊥#148 YUGO (estado-de-buff SOSTENIDO ⊥ interrupt-EVENTO): portar un aura ⊥ landear un stagger. Conteos independientes.
  const cruxInt = await page.evaluate(() => {
    const bf = (buffers, P) => window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe;
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    // 3 portando un aura (B3) pero 0 interrumpiendo (I0)
    const A = { bf: bf(3, 3), itr: itr(0, 3) };
    // 3 interrumpiendo (I3) pero 0 buffeados (B0)
    const B = { bf: bf(0, 3), itr: itr(3, 3) };
    return { A, B };
  });
  const ci = cruxInt;
  const cruxIntOK = ci.A.bf.buff === 3 && ci.A.bf.weight === 2 && ci.A.itr && ci.A.itr.weight === 0
    && ci.B.bf.buff === 0 && ci.B.bf.weight === 0 && ci.B.itr && ci.B.itr.weight === 2;
  ok("6c ★ CRUX ⊥#148 YUGO (estado-de-buff SOSTENIDO ⊥ interrupt-EVENTO): {3 portando aura, 0 interrumpiendo} ⇒ ÉGIDA B3/w2 pero YUGO I0/w0; {0 buffeados, 3 interrumpiendo} ⇒ ÉGIDA B0/w0 pero YUGO I3/w2 ⇒ uptime-sostenido ⊥ evento-de-control",
     cruxIntOK, JSON.stringify(cruxInt));

  // 6f ★ CRUX CANAL DISTINTO: coBuffFind ⊥ coSupportFind/coCastFind/coInterruptFind/partyVitalFind.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coBuffCh = grab("CO_BUFF_UPTIME_SURGE"), coSupCh = grab("CO_SUPPORT_SURGE"), coCastCh = grab("CO_CAST_SURGE"), coIntCh = grab("CO_INTERRUPT_SURGE"), pvCh = grab("PARTY_VITAL_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coBuff().channel);
  const chOK = coBuffCh === "coBuffFind" && vmCh === "coBuffFind" && coSupCh === "coSupportFind" && coCastCh === "coCastFind" && coIntCh === "coInterruptFind"
    && [coSupCh, coCastCh, coIntCh, pvCh].every(c => c && c !== coBuffCh);
  ok("6f ★ CRUX CANAL FRESCO coBuffFind ⊥ coSupportFind #139 / coCastFind #146 / coInterruptFind #148 / partyVitalFind #132 (canal DISTINTO por construcción; VM idem)",
     chOK, `coBuff=${coBuffCh} vm=${vmCh} coSup=${coSupCh} coCast=${coCastCh} coInt=${coIntCh} pv=${pvCh}`);

  // 7 ★ B-SENSITIVITY: más auras activos simultáneos ⇒ B sube.
  const bSens = await page.evaluate(() => {
    const t = (buffers, P) => { const m = window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe; return { B: m.buff, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const bSensOK = bSens.duo.B === 2 && bSens.trio.B === 3 && bSens.quad.B === 4 && bSens.duo.w === 1 && bSens.trio.w === 2 && bSens.quad.w === 2;
  ok("7 ★ B-SENSITIVITY (B sube con más auras activos): 2⇒B2/w1, 3⇒B3/w2, 4⇒B4/w2 (ÉGIDA mide CUÁNTOS portan un buff simultáneamente)",
     bSensOK, JSON.stringify(bSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveBuff REAL): 1 buffeado ⇒ 0; ≥2 ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coBuff({ enabled: true });
    const drive = (rows) => { window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coBuff({ driveBuff: { players: rows.map(r => ({ buff: !!r[0], dead: !!r[1] })), wipe: true } }).driveBuff;
      const live = window.__dev.coBuff({ buffProbeLive: true }).buffProbeLive;
      return { idx: dv.idx, buff: dv.buff, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);                                    // 1 buffeado: B=1 ⇒ 0 (colapso)
    const mp = drive([[true, false], [true, false], [true, false]]);      // 3 buffeados: B3 ⇒ score2 (bien-definido)
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.buff === 1 && degen.sp.score === 0 && degen.mp.buff === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 buffeado ⇒ B1/score0; 3 portando ⇒ B3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE compartir una égida en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos buffProbe idénticos ⇒ B/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coBuff({ buffProbe: { buffers: 3, players: 4 } }).buffProbe;
    const b = window.__dev.coBuff({ buffProbe: { buffers: 3, players: 4 } }).buffProbe;
    return { a: { B: a.buff, w: a.weight }, b: { B: b.buff, w: b.weight } };
  });
  const detOK = det.a.B === det.b.B && det.a.w === det.b.w && det.a.B === 3;
  ok("9 ★ INTEGER-DETERMINISM: buffProbe repetido ⇒ B/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo (determinismo): permutar el orden del roster ⇒ MISMO B (el conteo es CONMUTATIVO).
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coBuff({ enabled: true });
    const g = (rows) => { window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coBuff({ driveBuff: { players: rows.map(r => ({ buff: !!r[0], dead: !!r[1] })), wipe: true } }).driveBuff.buff; };
    const a = g([[true, false], [false, false], [true, false]]);   // 2 portando ⇒ B2
    const b = g([[false, false], [true, false], [true, false]]);   // MISMOS jugadores, orden permutado ⇒ MISMO B2
    window.__dev.coBuff({ clearBuff: true }); window.__dev.coBuff({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 buffeados) en 2 órdenes distintos ⇒ MISMO B2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coBuffFind: forageChargePreview con égida acreditada >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coBuff({ enabled: true });
    window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } });   // égida-plena ⇒ score2
    const actVm = window.__dev.coBuff();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: false }], wipe: true } });   // solitario (B1) ⇒ score0
    const goVm = window.__dev.coBuff();
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coBuffFind: forageChargePreview égida plena (B≥3) ⇒ charge>0 (==coBuffBonus); con solitario (B1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coBuffBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coBuff({ buffProbe: { buffers: s, players: s } }).buffProbe.charge);  // B=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coBuff().cap };
  });
  ok("11 ★ SUB-CAP: ninguna égida plena produce charge>coBuffBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full aegis available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coBuff({ enabled: true });
    window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } });   // égida-plena disponible
    window.__dev.coBuff({ enabled: false });                          // now OFF
    const off = window.__dev.coBuff();
    window.__dev.coBuff({ enabled: true }); window.__dev.coBuff({ clearBuff: true }); window.__dev.coBuff({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, buff: off.buff };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.buff === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coBuffBonus(égida plena disponible)==0 + forageChargePreview==0 + idx==0 + buff==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling peers no cambia la señal de coBuff.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coBuff({ enabled: true });
    window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } }).driveBuff;
    const snap = () => JSON.stringify({ coInterrupt: window.__dev.coInterrupt(), coDodge: window.__dev.coDodge(), coCast: window.__dev.coCast(), coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { cin: window.__dev.coInterrupt().enabled, cdg: window.__dev.coDodge().enabled, cc: window.__dev.coCast().enabled, fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, csp: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coInterrupt({ enabled: !prev.cin }); window.__dev.coDodge({ enabled: !prev.cdg }); window.__dev.coCast({ enabled: !prev.cc }); window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.csp }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coBuff({ buffProbeLive: true }).buffProbeLive;
    window.__dev.coInterrupt({ enabled: prev.cin }); window.__dev.coDodge({ enabled: prev.cdg }); window.__dev.coCast({ enabled: prev.cc }); window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.csp }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.buff === after.buff;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeBuff: before.buff, afterBuff: after.buff };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coBuffFind ⊥ peers: la señal de co-buff (score/buff) NO cambia al togglear CO-INTERRUPT #148/CO-DODGE #147/CO-CAST #146/CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 77 `_SURGE` totales, sole-false = CO_BUFF_UPTIME (76 true, incl. CO_INTERRUPT #148 LIVE).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coIntLive = census.find(([n]) => n === "CO_INTERRUPT_SURGE");
  const censusOK = total === 77 && trues === 76 && falses.length === 1 && falses[0] === "CO_BUFF_UPTIME_SURGE" && coIntLive && coIntLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 77 `_SURGE` totales, 76 enabled:true (incl. CO_INTERRUPT_SURGE #148 LIVE), sole-false = CO_BUFF_UPTIME_SURGE (DARK #149)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coInt=${coIntLive ? coIntLive[1] : "?"}`);

  // 15 render badge "Égida:" drawn ON+aegis / not OFF + fps. 🔑 label ÚNICO "Égida:" (⊥ #148 'Yugo:'/#147 'Quiebro:'/#146 'Conjuro:'/#139 'Socorro:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Égida:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coBuff({ enabled: true });
    window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    const enAtOff = window.__dev.coBuff().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Égida:\" se DIBUJA ON+aegis (B>0, re-driven cada frame) y NO OFF (B 0) + fps sano (label ÚNICO ⊥ #148 'Yugo:'/#147 'Quiebro:'/#146 'Conjuro:'/#139 'Socorro:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coBuff({ enabled: true }); window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coBuff({ clearBuff: true }); window.__dev.coBuff({ enabled: false }); });

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
    window.__dev.coBuff({ enabled: true });
    window.__dev.coBuff({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coBuff({ driveBuff: { players: [{ buff: true }, { buff: true }, { buff: true }], wipe: true } }).driveBuff;   // B=3 ⇒ score2
    const vm = window.__dev.coBuff();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([buffers, P]) => { const m = window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe; return { p: m.players, B: m.buff, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coBuff({ buffProbeLive: true }).buffProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coBuff({ clearBuff: true });
    window.__dev.coBuff({ enabled: false });
    return { score: dv.score, idx: dv.idx, buff: dv.buff, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveBuff: live.buff, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.buff === B.buff && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveBuff === B.liveBuff && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA égida B=3 ⇒ score/idx/buff/players/tier/charge + buffProbeLive(field,buff,players,score) + buffProbe LUT (B enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},buff:${A.buff},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveBuff:${A.liveBuff},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},buff:${B.buff},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveBuff:${B.liveBuff},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coBuff({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coBuff({ enabled: false }));

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
