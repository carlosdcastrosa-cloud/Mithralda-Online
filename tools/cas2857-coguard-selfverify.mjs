// CAS-2857 — self-verify for BROQUEL (DARK, CO_GUARD_SURGE.enabled:false). EVO mecánica #150 (base master 94b4895 tras #149 ÉGIDA CO_BUFF_UPTIME LIVE&served 7d6126f3e504/815, census 77) — EJE FRESCO + CANAL FRESCO, ⊥ a los 91 LIVE #59-#149. El 32º eje de COMPOSICIÓN-DE-INTENCIÓN y la QUINCEAVA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=APLICAN-heal/EVENTO, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN, #142 PIÑA=APIÑADOS, #143 ENVITE=EMPUJAN, #144 DIANA=CONVERGEN/CONTEO, #145 TENAZA=GEOMETRÍA, #146 CONJURO=ACTIVAN/cast-EVENTO, #147 QUIEBRO=ESQUIVAN/dodge-EVENTO, #148 YUGO=INTERRUMPEN/interrupt-EVENTO, #149 ÉGIDA=PORTAN-buff/uptime-STATE); es la SEGUNDA sub-faceta DEFENSIVE REACTION-EVENT (par con #147 QUIEBRO pero OPUESTA: QUIEBRO=EVADIR/dodge, BROQUEL=INTERCEPTAR/block-parry).
// CONTEXTO (por qué NO co-revive): co-revive COLAPSA — grep confirmó (a) NO existe estado downed/bleedout/incap en el juego (heroDie()→pantalla-muerte→respawn es INSTANTÁNEO); (b) #139 SOCORRO ya incluye `revive` en el support-credit `p.support`. El umbrella autoriza explícitamente el fallback a co-block/co-parry (GREP block/parry/guard/SHIELD_BLOCK/GUARD_COUNTER ⇒ h.blocking/h.parryT/GUARD_COUNTER/RIPOSTE/DEFLECT = guardia-activa REAL).
// (A) EJE FRESCO = BROQUEL/CO-GUARD = G = nº de jugadores VIVOS DISTINTOS con el flag `guard` (block/parry/guard-up ACTIVO) este frame (co-block/co-parry), ⊥ #147 QUIEBRO (INTERCEPTAR ⊥ EVADIR — bloquear/plantar ⊥ rodar/apartarse, OPUESTOS), ⊥ #140 MURALLA (GUARDIA-ACCIÓN ⊥ ABSORBER-daño-intake), ⊥ #149 ÉGIDA (guardia-ACCIÓN-EVENTO ⊥ portar-buff-uptime-STATE), ⊥ #148 YUGO (defensivo ⊥ interrupt-ofensivo), ⊥ #132 PARTY_VITAL (guardia BOOLEANA-ENTERA ⊥ HP-fracción-media float). Tally BOOLEANO ENTERO. 🔑 DETERMINISMO (sev-1): G = conteo ENTERO de banderas (CERO float/atan2 en el score/decisión; el conteo es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midGuard2,hiGuard3} ⇒ 0-float en el score/decisión. Bandas: G≥hiGuard(3) ⇒ broquel-pleno ⇒ 2; G≥midGuard(2) ⇒ broquel-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 en guardia ⇒ G colapsa ⇒ 0 (colapso LIMPIO).
// (B) CANAL FRESCO = coGuardFind (fichas de broquel por rematar con el broquel ACREDITADO — NINGUNO de los 91 flags lo usa). Moneda FRESCA (h.coGuardBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA, PRIMARIO) ⊥#147 QUIEBRO (INTERCEPTAR ⊥ EVADIR): 3 bloqueando ⇒ BROQUEL G3/w2 pero QUIEBRO D0/w0 (plantados en guardia); 3 rodando ⇒ QUIEBRO D3/w2 pero BROQUEL G0/w0 (esquivando) — OPUESTOS, conteos INDEPENDIENTES. ⊥#140 MURALLA (guardia ⊥ absorber). ⊥#149 ÉGIDA (guardia-ACCIÓN ⊥ buff-STATE). ⊥#148 YUGO (defensivo ⊥ ofensivo).
//
// Run: node tools/cas2857-coguard-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2857");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// guardProbe LUT esperada: (guarders=nº de jugadores en guardia activa, players=P gate)→G=clamp(guarders,0,players)→banda(G vs {midGuard2,hiGuard3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiGuard 3 / midGuard 2 + colapso single-player (G<minPlayers2 ⇒ 0).
const EXPECT_GUARD = [
  { name: "solo-P1",       guarders: 1, players: 1, G: 1, w: 0 },   // single-player: G1<midGuard ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",        guarders: 2, players: 2, G: 2, w: 1 },   // 2 en guardia ⇒ G2 ⇒ 1 (broquel parcial)
  { name: "duo-of-4",      guarders: 2, players: 4, G: 2, w: 1 },   // 2 en guardia DE un roster de 4 ⇒ G2 ⇒ 1
  { name: "trio-P3",       guarders: 3, players: 3, G: 3, w: 2 },   // 3 en guardia ⇒ G3 ⇒ 2 (broquel pleno)
  { name: "quad-4",        guarders: 4, players: 4, G: 4, w: 2 },   // 4 en guardia ⇒ G4 ⇒ 2
  { name: "none",          guarders: 0, players: 3, G: 0, w: 0 },   // 🔑 0 guardias (nadie bloquea) ⇒ G0 ⇒ 0
  { name: "one-of-4",      guarders: 1, players: 4, G: 1, w: 0 },   // 🔑 1 solo en guardia de 4 ⇒ G1 ⇒ 0
  { name: "clamp-players", guarders: 9, players: 3, G: 3, w: 2 },   // guarders>P se clampa a P=3 ⇒ G3 ⇒ 2
];
// driveGuard REAL: inyecta roster sintético (P jugadores con {guard,dead}) ⇒ G server-auth = # jugadores VIVOS con el flag `guard`.
// filas: [guard, dead].
const EXPECT_DRIVE = [
  { name: "duo-guard",         players: [[true, false], [true, false]],                         G: 2, w: 1 },   // 2 en guardia ⇒ G2 (broquel parcial)
  { name: "one-guard",         players: [[true, false], [false, false]],                        G: 1, w: 0 },   // 🔑 1 en guardia, 1 no ⇒ G1 ⇒ 0
  { name: "solo",              players: [[true, false]],                                        G: 1, w: 0 },   // 1 ⇒ G1 ⇒ 0
  { name: "trio-guard",        players: [[true, false], [true, false], [true, false]],          G: 3, w: 2 },   // 3 en guardia ⇒ G3 (broquel pleno)
  { name: "unguarded-excluded",players: [[true, false], [true, false], [false, false]],         G: 2, w: 1 },   // 🔑 3º SIN guardia ⇒ EXCLUIDO ⇒ G2
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           G: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ G2 (ANTI-cadáveres)
  { name: "quad-guard",        players: [[true, false], [true, false], [true, false], [true, false]], G: 4, w: 2 },   // 4 en guardia ⇒ G4
  { name: "all-unguarded",     players: [[false, false], [false, false], [false, false]],       G: 0, w: 0 },   // 🔑 nadie en guardia ⇒ G0 ⇒ 0
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coGuard && window.__dev.coBuff && window.__dev.coInterrupt && window.__dev.coDodge && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coGuard + peer hooks (coBuff/coInterrupt/coDodge/coCast/coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coGuard());
  ok("2 byte-id OFF (fresh boot): CO_GUARD_SURGE.enabled false AND G.coGuardBounty NUNCA se crea (gExists false) AND G._coGuardParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.guard === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coGuardFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} guard=${dark.guard} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiGuard=${dark.hiGuard} midGuard=${dark.midGuard} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coGuardFind/coGuardBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coGuardFind|coGuardBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coGuardBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coGuardFind'/'coGuardBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coGuard({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coGuard({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ guardProbe LUT: (guarders,players)→G=clamp→banda(G vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coGuard({ guardProbe: { guarders: c.guarders, players: c.players } }).guardProbe), EXPECT_GUARD);
  const tabOK = EXPECT_GUARD.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].guard === c.G);
  ok("5 ★ guardProbe LUT (BROQUEL G=# en guardia distintos): solo-P1(G1)⇒0, duo(G2)⇒1, duo-of-4(G2)⇒1, trio(G3)⇒2, quad(G4)⇒2, none(G0)⇒0, one-of-4(G1)⇒0, clamp-players⇒G3. UMBRAL hiGuard 3/midGuard 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_GUARD[i].name, p: x.players, G: x.guard, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH BROQUEL: driveGuard inyecta roster sintético ({guard,dead}) ⇒ G REAL server-auth = # jugadores VIVOS con el flag `guard` (filtra muertos + sin-guardia).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ guard: !!r[0], dead: !!r[1] }));
    window.__dev.coGuard({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coGuard({ driveGuard: { players: mkParty(c.players), wipe: true } }).driveGuard;
      const live = window.__dev.coGuard({ guardProbeLive: true }).guardProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvGuard: dv.guard, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveGuard: live.guard, livePlayers: live.players });
    }
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvGuard === c.G && comp[i].liveGuard === c.G);
  ok("5c ★ REAL SERVER-AUTH BROQUEL (tally de banderas guard entre VIVOS): duo-guard(G2)=w1, one-guard(G1)=w0, solo(G1)=w0, trio-guard(G3)=w2, unguarded-excl(G2)=w1, dead-excl(G2)=w1, quad-guard(G4)=w2, all-unguarded(G0)=w0 (filtra muertos + sin-guardia)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#147 QUIEBRO (INTERCEPTAR ⊥ EVADIR, las dos reacciones defensivas OPUESTAS) — LUT: los conteos G (bloquear/plantar) y D (rodar/apartarse) se mueven INDEPENDIENTEMENTE.
  const cruxDodge = await page.evaluate(() => {
    const gd = (guarders, P) => window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe;
    const dg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    // guardia: 3 plantados bloqueando/parando (G3) pero NINGUNO rodando (D0)
    const block = { gd: gd(3, 3), dg: dg(0, 3) };
    // esquiva: 3 rodando/i-frame (D3) pero NINGUNO en guardia (G0) — OPUESTOS
    const roll = { gd: gd(0, 3), dg: dg(3, 3) };
    return { block, roll };
  });
  const cd = cruxDodge;
  const cruxDodgeOK =
    cd.block.gd.guard === 3 && cd.block.gd.weight === 2 && cd.block.dg && cd.block.dg.weight === 0
    && cd.roll.gd.guard === 0 && cd.roll.gd.weight === 0 && cd.roll.dg && cd.roll.dg.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#147 QUIEBRO (INTERCEPTAR ⊥ EVADIR): {3 bloqueando, 0 rodando} ⇒ BROQUEL G3/w2 pero QUIEBRO D0/w0; {0 en guardia, 3 rodando} ⇒ BROQUEL G0/w0 pero QUIEBRO D3/w2 ⇒ plantarse-en-guardia ⊥ apartarse-rodando (OPUESTOS, conteos divergen en AMBOS sentidos)",
     cruxDodgeOK, JSON.stringify(cruxDodge));

  // 6b ★ CRUX ⊥#140 MURALLA (GUARDIA-ACCIÓN ⊥ ABSORBER-daño-intake): estar en guardia ≠ recibir un golpe. Conteos independientes.
  const cruxTank = await page.evaluate(() => {
    const gd = (guarders, P) => window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe;
    const tk = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    // 3 en guardia sin recibir golpe (G3) pero 0 absorbiendo (T0)
    const A = { gd: gd(3, 3), tk: tk(0, 3) };
    // 3 tanqueando golpes a pecho descubierto (T3) pero 0 en guardia (G0)
    const B = { gd: gd(0, 3), tk: tk(3, 3) };
    return { A, B };
  });
  const ct = cruxTank;
  const cruxTankOK = ct.A.gd.guard === 3 && ct.A.gd.weight === 2 && ct.A.tk && ct.A.tk.weight === 0
    && ct.B.gd.guard === 0 && ct.B.gd.weight === 0 && ct.B.tk && ct.B.tk.weight === 2;
  ok("6b ★ CRUX ⊥#140 MURALLA (GUARDIA-ACCIÓN ⊥ ABSORBER-daño-intake): {3 en guardia sin golpe} ⇒ BROQUEL G3/w2 pero MURALLA T0/w0; {0 en guardia, 3 tanqueando} ⇒ BROQUEL G0/w0 pero MURALLA T3/w2 ⇒ guardia-activa ⊥ daño-absorbido",
     cruxTankOK, JSON.stringify(cruxTank));

  // 6c ★ CRUX ⊥#149 ÉGIDA (guardia-ACCIÓN-EVENTO ⊥ portar-buff-uptime-STATE): bloquear ≠ tener un aura activo. Conteos independientes.
  const cruxBuff = await page.evaluate(() => {
    const gd = (guarders, P) => window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe;
    const bf = (buffers, P) => window.__dev.coBuff({ buffProbe: { buffers, players: P } }).buffProbe;
    // 3 en guardia (G3) pero 0 portando buff (B0)
    const A = { gd: gd(3, 3), bf: bf(0, 3) };
    // 3 portando aura (B3) pero 0 en guardia (G0)
    const B = { gd: gd(0, 3), bf: bf(3, 3) };
    return { A, B };
  });
  const cb = cruxBuff;
  const cruxBuffOK = cb.A.gd.guard === 3 && cb.A.gd.weight === 2 && cb.A.bf && cb.A.bf.weight === 0
    && cb.B.gd.guard === 0 && cb.B.gd.weight === 0 && cb.B.bf && cb.B.bf.weight === 2;
  ok("6c ★ CRUX ⊥#149 ÉGIDA (guardia-ACCIÓN ⊥ portar-buff-uptime-STATE): {3 en guardia, 0 buffeados} ⇒ BROQUEL G3/w2 pero ÉGIDA B0/w0; {0 en guardia, 3 portando aura} ⇒ BROQUEL G0/w0 pero ÉGIDA B3/w2 ⇒ guardia-EVENTO ⊥ buff-STATE",
     cruxBuffOK, JSON.stringify(cruxBuff));

  // 6d ★ CRUX ⊥#148 YUGO (guardia-DEFENSIVA ⊥ interrupt-OFENSIVO): bloquear ⊥ landear un stagger. Conteos independientes.
  const cruxInt = await page.evaluate(() => {
    const gd = (guarders, P) => window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe;
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const A = { gd: gd(3, 3), itr: itr(0, 3) };   // 3 en guardia (G3) pero 0 interrumpiendo (I0)
    const B = { gd: gd(0, 3), itr: itr(3, 3) };   // 3 interrumpiendo (I3) pero 0 en guardia (G0)
    return { A, B };
  });
  const ci = cruxInt;
  const cruxIntOK = ci.A.gd.guard === 3 && ci.A.gd.weight === 2 && ci.A.itr && ci.A.itr.weight === 0
    && ci.B.gd.guard === 0 && ci.B.gd.weight === 0 && ci.B.itr && ci.B.itr.weight === 2;
  ok("6d ★ CRUX ⊥#148 YUGO (guardia-DEFENSIVA ⊥ interrupt-OFENSIVO): {3 en guardia, 0 interrumpiendo} ⇒ BROQUEL G3/w2 pero YUGO I0/w0; {0 en guardia, 3 interrumpiendo} ⇒ BROQUEL G0/w0 pero YUGO I3/w2 ⇒ defensivo ⊥ ofensivo",
     cruxIntOK, JSON.stringify(cruxInt));

  // 6f ★ CRUX CANAL DISTINTO: coGuardFind ⊥ coDodgeFind/coTankFind/coBuffFind/coInterruptFind.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coGuardCh = grab("CO_GUARD_SURGE"), coDodgeCh = grab("CO_DODGE_SURGE"), coTankCh = grab("CO_TANK_SURGE"), coBuffCh = grab("CO_BUFF_UPTIME_SURGE"), coIntCh = grab("CO_INTERRUPT_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coGuard().channel);
  const chOK = coGuardCh === "coGuardFind" && vmCh === "coGuardFind" && coDodgeCh === "coDodgeFind" && coTankCh === "coTankFind" && coBuffCh === "coBuffFind"
    && [coDodgeCh, coTankCh, coBuffCh, coIntCh].every(c => c && c !== coGuardCh);
  ok("6f ★ CRUX CANAL FRESCO coGuardFind ⊥ coDodgeFind #147 / coTankFind #140 / coBuffFind #149 / coInterruptFind #148 (canal DISTINTO por construcción; VM idem)",
     chOK, `coGuard=${coGuardCh} vm=${vmCh} coDodge=${coDodgeCh} coTank=${coTankCh} coBuff=${coBuffCh} coInt=${coIntCh}`);

  // 7 ★ G-SENSITIVITY: más guardias activas simultáneas ⇒ G sube.
  const gSens = await page.evaluate(() => {
    const t = (guarders, P) => { const m = window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe; return { G: m.guard, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const gSensOK = gSens.duo.G === 2 && gSens.trio.G === 3 && gSens.quad.G === 4 && gSens.duo.w === 1 && gSens.trio.w === 2 && gSens.quad.w === 2;
  ok("7 ★ G-SENSITIVITY (G sube con más guardias activas): 2⇒G2/w1, 3⇒G3/w2, 4⇒G4/w2 (BROQUEL mide CUÁNTOS bloquean/paran simultáneamente)",
     gSensOK, JSON.stringify(gSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveGuard REAL): 1 en guardia ⇒ 0; ≥2 ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coGuard({ enabled: true });
    const drive = (rows) => { window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coGuard({ driveGuard: { players: rows.map(r => ({ guard: !!r[0], dead: !!r[1] })), wipe: true } }).driveGuard;
      const live = window.__dev.coGuard({ guardProbeLive: true }).guardProbeLive;
      return { idx: dv.idx, guard: dv.guard, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);                                    // 1 en guardia: G=1 ⇒ 0 (colapso)
    const mp = drive([[true, false], [true, false], [true, false]]);      // 3 en guardia: G3 ⇒ score2 (bien-definido)
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.guard === 1 && degen.sp.score === 0 && degen.mp.guard === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 en guardia ⇒ G1/score0; 3 bloqueando ⇒ G3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-bloquear en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos guardProbe idénticos ⇒ G/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coGuard({ guardProbe: { guarders: 3, players: 4 } }).guardProbe;
    const b = window.__dev.coGuard({ guardProbe: { guarders: 3, players: 4 } }).guardProbe;
    return { a: { G: a.guard, w: a.weight }, b: { G: b.guard, w: b.weight } };
  });
  const detOK = det.a.G === det.b.G && det.a.w === det.b.w && det.a.G === 3;
  ok("9 ★ INTEGER-DETERMINISM: guardProbe repetido ⇒ G/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo (determinismo): permutar el orden del roster ⇒ MISMO G (el conteo es CONMUTATIVO).
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coGuard({ enabled: true });
    const g = (rows) => { window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coGuard({ driveGuard: { players: rows.map(r => ({ guard: !!r[0], dead: !!r[1] })), wipe: true } }).driveGuard.guard; };
    const a = g([[true, false], [false, false], [true, false]]);   // 2 en guardia ⇒ G2
    const b = g([[false, false], [true, false], [true, false]]);   // MISMOS jugadores, orden permutado ⇒ MISMO G2
    window.__dev.coGuard({ clearGuard: true }); window.__dev.coGuard({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 en guardia) en 2 órdenes distintos ⇒ MISMO G2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coGuardFind: forageChargePreview con broquel acreditado >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coGuard({ enabled: true });
    window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } });   // broquel-pleno ⇒ score2
    const actVm = window.__dev.coGuard();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: false }], wipe: true } });   // solitario (G1) ⇒ score0
    const goVm = window.__dev.coGuard();
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coGuardFind: forageChargePreview broquel pleno (G≥3) ⇒ charge>0 (==coGuardBonus); con solitario (G1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coGuardBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coGuard({ guardProbe: { guarders: s, players: s } }).guardProbe.charge);  // G=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coGuard().cap };
  });
  ok("11 ★ SUB-CAP: ningún broquel pleno produce charge>coGuardBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full guard-wall available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coGuard({ enabled: true });
    window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } });   // broquel-pleno disponible
    window.__dev.coGuard({ enabled: false });                          // now OFF
    const off = window.__dev.coGuard();
    window.__dev.coGuard({ enabled: true }); window.__dev.coGuard({ clearGuard: true }); window.__dev.coGuard({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, guard: off.guard };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.guard === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coGuardBonus(broquel pleno disponible)==0 + forageChargePreview==0 + idx==0 + guard==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling peers no cambia la señal de coGuard.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coGuard({ enabled: true });
    window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } }).driveGuard;
    const snap = () => JSON.stringify({ coBuff: window.__dev.coBuff(), coInterrupt: window.__dev.coInterrupt(), coDodge: window.__dev.coDodge(), coCast: window.__dev.coCast(), coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { cbf: window.__dev.coBuff().enabled, cin: window.__dev.coInterrupt().enabled, cdg: window.__dev.coDodge().enabled, cc: window.__dev.coCast().enabled, fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, csp: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coBuff({ enabled: !prev.cbf }); window.__dev.coInterrupt({ enabled: !prev.cin }); window.__dev.coDodge({ enabled: !prev.cdg }); window.__dev.coCast({ enabled: !prev.cc }); window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.csp }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coGuard({ guardProbeLive: true }).guardProbeLive;
    window.__dev.coBuff({ enabled: prev.cbf }); window.__dev.coInterrupt({ enabled: prev.cin }); window.__dev.coDodge({ enabled: prev.cdg }); window.__dev.coCast({ enabled: prev.cc }); window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.csp }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.guard === after.guard;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeGuard: before.guard, afterGuard: after.guard };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coGuardFind ⊥ peers: la señal de co-guard (score/guard) NO cambia al togglear CO-BUFF #149/CO-INTERRUPT #148/CO-DODGE #147/CO-CAST #146/CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: DARK config — 78 `_SURGE` totales, sole-false = CO_GUARD (77 true, incl. CO_BUFF_UPTIME #149 LIVE).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coBuffLive = census.find(([n]) => n === "CO_BUFF_UPTIME_SURGE");
  const censusOK = total === 78 && trues === 77 && falses.length === 1 && falses[0] === "CO_GUARD_SURGE" && coBuffLive && coBuffLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: config 78 `_SURGE` totales, 77 enabled:true (incl. CO_BUFF_UPTIME_SURGE #149 LIVE), sole-false = CO_GUARD_SURGE (DARK #150) → target census 78",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coBuff=${coBuffLive ? coBuffLive[1] : "?"}`);

  // 15 render badge "Broquel:" drawn ON+guard / not OFF + fps. 🔑 label ÚNICO "Broquel:" (⊥ #149 'Égida:'/#148 'Yugo:'/#147 'Quiebro:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Broquel:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coGuard({ enabled: true });
    window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    const enAtOff = window.__dev.coGuard().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Broquel:\" se DIBUJA ON+guard (G>0, re-driven cada frame) y NO OFF (G 0) + fps sano (label ÚNICO ⊥ #149 'Égida:'/#148 'Yugo:'/#147 'Quiebro:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coGuard({ enabled: true }); window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coGuard({ clearGuard: true }); window.__dev.coGuard({ enabled: false }); });

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
    window.__dev.coGuard({ enabled: true });
    window.__dev.coGuard({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coGuard({ driveGuard: { players: [{ guard: true }, { guard: true }, { guard: true }], wipe: true } }).driveGuard;   // G=3 ⇒ score2
    const vm = window.__dev.coGuard();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([guarders, P]) => { const m = window.__dev.coGuard({ guardProbe: { guarders, players: P } }).guardProbe; return { p: m.players, G: m.guard, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coGuard({ guardProbeLive: true }).guardProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coGuard({ clearGuard: true });
    window.__dev.coGuard({ enabled: false });
    return { score: dv.score, idx: dv.idx, guard: dv.guard, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveGuard: live.guard, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.guard === B.guard && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveGuard === B.liveGuard && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO broquel G=3 ⇒ score/idx/guard/players/tier/charge + guardProbeLive(field,guard,players,score) + guardProbe LUT (G enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},guard:${A.guard},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveGuard:${A.liveGuard},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},guard:${B.guard},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveGuard:${B.liveGuard},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coGuard({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coGuard({ enabled: false }));

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
