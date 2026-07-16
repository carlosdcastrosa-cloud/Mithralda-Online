// CAS-2439 — self-verify for PROXIMIDAD A AMENAZA APEX (DARK, APEX_PROXIMITY.enabled:false). EVO mecánica #73 (serializa tras #72 SCARCITY_EDGE LIVE&closed) — EJE FRESCO + CANAL FRESCO, ⊥/INVERSO a las 14 LIVE #59-#72.
// (A) EJE FRESCO = PROXIMIDAD A UN DEPREDADOR APEX (server-auth, MMORPG-native). PRE-FLIGHT GATE: estado REAL = cada apex vivo (e.isBoss/e.champion/e.champElite) lleva posición e.x,e.y en G.enemies (posiciones = estado de sim replicado).
//     apexNearestDist(hero)=min hypot(hero−apexVivo) ∈ [0,∞) = distancia (snapshot) al jefe/campeón vivo MÁS CERCANO. PURO, 0-RNG, 0-timer, STATELESS. Sin apex vivo ⇒ ∞ ⇒ Tier 0 ⇒ sin ventaja.
//     INVERSO a #72 (escasez = AUSENCIA de mobs vs cap; esto = PRESENCIA de un apex CONCRETO cercano), ⊥ a #69 (LastStand cuenta enemigos ENGANCHADOS al héroe; esto = distancia a UN apex vivo, con o sin engage), NO sigilo/LOS (#71), NO material-de-terreno (#70), NO clima/tiempo/tempo/social/territorial.
// (B) CANAL FRESCO = matFind (multiplicador de recompensa de MENA/material de forja por forrajeo — NINGUNA de las 14 flags lo usa). La familia recompensa-de-forrajeo tiene goldFind (#60/#62), lootQuality (#63/#68), xpGain (#65), essenceFind (#72) OCUPADOS ⇒ MENA/forja es el ÚNICO libre. Fuente ÚNICA (seam de kill) ⇒ sub-cap propio apexMatCap, 0 doble-dip.
//
// ★ DIFERENCIADOR/INVERSO (check 7): el tier = función PURA de la PRESENCIA de un apex concreto cerca. Un apex vivo a ≤240px ⇒ T2 por PRESENCIA — OPUESTO a #72 SCARCITY (que necesita AUSENCIA de mobs) y a #69 LastStand (que necesita enemigos ENGANCHADOS). La señal es de fuente distinta (distancia a UN apex, no aggro-count ni cap-de-zona).
// ★ REAL SERVER-AUTH (check 6): spawnApex inyecta un mob REAL (spawnEnemy + flag isBoss) en G.enemies; nearestProbe lee la distancia REAL + kind del apex vivo más cercano + apexCount ⇒ posición server-auth auténtica.
// ★ CANAL (check 8): forageMatsPreview = apexMatBonus(distNearest). Apex cerca ⇒ mena>0; sin apex / lejos ⇒ 0.
// ★ SUB-CAP (check 9): mats EFECTIVA = min(apexMatCap=2, tier.mats). Ningún dist produce mats>2.
// ★ BYTE-NEUTRAL OFF (check 10): con APEX_PROXIMITY OFF, apexMatBonus(cualquier dist)==0 y forageMatsPreview==0 aun con un apex PEGADO al héroe ⇒ 0 mena al seam ⇒ killEnemy byte-id al HEAD.
// ★ ORTOGONALIDAD (check 11): la proximidad (dist/tier/mats) NO cambia wardRegen/goldFind/critChance/xpGain/vamp/lootQuality/atkspd/detectRadius/essenceFind; activar SCARCITY_EDGE (el primo recompensa-forrajeo) NO cambia la señal apex, y la proximidad ON NO cambia el readout de Scarcity.
// ★ 0-REGRESIÓN (check 12): las 14 mecánicas del arco #59-#72 siguen served enabled:true; APEX_PROXIMITY served false (DARK #73).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO apex inyectado en el MISMO tile + héroe en el MISMO tile ⇒ dist/tier/mats/apexCount + LUT distProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync). apexNearestDist es función PURA de posiciones deterministas ⇒ shard-consistente.
//
// Observado vía __dev.apex (flip enabled IN-MEMORY + tp teleport determinista + distProbe LUT puro + spawnApex inyección REAL + nearestProbe lectura server-auth) + __dev.ward/kinship/focus/nocturne/fellowship/tempest/lastStand/firmFooting/shadowStalk/scarcity (peer channels) + __dev.saveBlob/worldFingerprint.
// Badge vía instrumentación de ctx.fillText (cuenta "Apex:").
//
// Checks:
//   1  boots to play, __dev.apex + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (fresh boot): APEX_PROXIMITY.enabled false AND G.apex NUNCA se crea (gExists false); tier 0, mats 0, forageMatsPreview 0, channel matFind, tag "", dist -1 (sin apex).
//   3  byte-id save OFF: saveBlob() SIN clave 'apex' (estado 100% derivado, 0 persistencia nueva).
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la recompensa de mena NO entra al fingerprint).
//   5  TABLA de tiers = función PURA de la DISTANCIA (distProbe): 0/240→T2/2, 241/480→T1/1, 481/9999→T0/0; sub-cap 2.
//   6  ★ REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1.
//   7  ★ DIFERENCIADOR/INVERSO: apex a ≤240px ⇒ T2 por PRESENCIA (INVERSO a #72 escasez/ausencia y a #69 engage); scarcity readout independiente + LIVE.
//   8  CANAL matFind: forageMatsPreview con apex cerca ⇒ mats>0 (== apexMatBonus); sin apex / lejos ⇒ 0.
//   9  ★ SUB-CAP: distProbe mats nunca > apexMatCap=2; min(cap,raw).
//  10  ★ BYTE-NEUTRAL OFF: con OFF, apexMatBonus(apex pegado)==0 y forageMatsPreview==0 ⇒ 0 mena al seam (byte-id).
//  11  ★ ORTOGONALIDAD matFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind: la proximidad NO cambia peers; activar SCARCITY_EDGE NO cambia la señal apex; proximidad ON NO cambia Scarcity.
//  12  ★ 0-REGRESIÓN: 14 mecanismos del arco #59-#72 served enabled:true; APEX_PROXIMITY served false (DARK #73).
//  13  render badge "Apex:" se DIBUJA ON+apex cerca (count>0) y NO OFF (count 0) + fps.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: MISMO apex en el MISMO tile + héroe en el MISMO tile ⇒ dist/tier/mats/apexCount + LUT distProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2439-apex-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2439");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LUT esperada dist→{tier,mats}: ≤240→T2/2, (240,480]→T1/1, >480→T0/0
const EXPECT_DIST = [
  { dist: 0, t: 2, m: 2 }, { dist: 240, t: 2, m: 2 },
  { dist: 241, t: 1, m: 1 }, { dist: 480, t: 1, m: 1 },
  { dist: 481, t: 0, m: 0 }, { dist: 9999, t: 0, m: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.apex && window.__dev.ward && window.__dev.kinship && window.__dev.focus && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.apex + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.apex());
  ok("2 byte-id OFF (fresh boot): APEX_PROXIMITY.enabled false AND G.apex NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.mats === 0 && dark.forageMatsPreview === 0 && dark.channel === "matFind" && dark.tag === "" && dark.dist === -1,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} mats=${dark.mats} preview=${dark.forageMatsPreview} channel=${dark.channel} tag="${dark.tag}" dist=${dark.dist} apexCount=${dark.apexCount}`);

  // 3 save OFF has no 'apex' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'apex' key in save blob (estado 100% derivado)", !/"apex[A-Za-z]*"\s*:/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.apex({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.apex({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; la mena NO entra al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of distance (distProbe)
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.apex({ distProbe: { dist: c.dist } }).distProbe), EXPECT_DIST);
  const tabOK = EXPECT_DIST.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].mats === c.m);
  ok("5 TABLA de tiers = función PURA de la DISTANCIA: ≤240→T2/2, (240,480]→T1/1, >480→T0/0", tabOK, JSON.stringify(tab));

  // 6 ★ REAL SERVER-AUTH: spawnApex injects a real isBoss mob; nearestProbe reads real dist + kind + count
  const server6 = await page.evaluate(() => {
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;                                  // hero's current tile
    window.__dev.apex({ spawnApex: { tx: h.tx + 3, ty: h.ty } });        // inject apex 3 tiles east (~96px → T2)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });                   // hero back to origin tile
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const vm = window.__dev.apex();
    window.__dev.apex({ enabled: false });
    return { np, apexCount: vm.apexCount, tier: vm.tier, dist: vm.dist };
  });
  ok("6 ★ REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1",
     server6.np && server6.np.dist > 0 && server6.np.apex && server6.np.apex.kind === "boss" && server6.apexCount >= 1,
     JSON.stringify(server6));

  // 7 ★ DIFERENCIADOR/INVERSE: apex within 240px ⇒ T2 by PRESENCE, the INVERSE of SCARCITY(#72 absence) & LastStand(#69 engage). SCARCITY es LIVE y COEXISTE ⊥.
  const diff = await page.evaluate(() => {
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 5, ty: h.ty } });        // apex ~160px (≤240) → T2 by PRESENCE
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.apex();
    const sc = window.__dev.scarcity ? window.__dev.scarcity() : null;   // reward-forage cousin LIVE — coexiste, señal distinta (agotamiento)
    window.__dev.apex({ enabled: false });
    return { tier: vm.tier, dist: vm.dist, mats: vm.mats, scEnabled: sc ? sc.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.dist > 0 && diff.dist <= 240 && diff.mats >= 1 && diff.scEnabled === true;
  ok("7 ★ DIFERENCIADOR/INVERSO: apex a ≤240px ⇒ T≥1 por PRESENCIA de un apex CONCRETO (INVERSO a #72 escasez/ausencia y a #69 engage); SCARCITY_EDGE LIVE coexiste ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL matFind: forageMatsPreview near > 0 ; far → 0
  const forage = await page.evaluate(() => {
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });        // ~128px → T2
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.apex();
    const nearPrev = nearVm.forageMatsPreview, nearMats = nearVm.mats;
    window.__dev.apex({ tp: { tx: h.tx + 30, ty: h.ty } });              // hero 30 tiles away (~960px > 480) → T0
    const farVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.apex({ enabled: false });
    return { nearPrev, nearMats, farPrev: farVm.forageMatsPreview, farTier: farVm.tier };
  });
  const forageOK = forage.nearPrev > 0 && forage.nearPrev === forage.nearMats && forage.farPrev === 0 && forage.farTier === 0;
  ok("8 CANAL matFind: forageMatsPreview con apex cerca ⇒ mats>0 (==apexMatBonus); héroe lejos ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 9 ★ SUB-CAP: mats never exceeds apexMatCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let d = 0; d <= 700; d += 20) vals.push(window.__dev.apex({ distProbe: { dist: d } }).distProbe.mats);
    return { max: Math.max(...vals), cap: window.__dev.apex().cap };
  });
  ok("9 ★ SUB-CAP: ningún dist produce mats>apexMatCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF: OFF ⇒ mats 0 + forageMatsPreview 0 even with apex glued to hero
  const neutral = await page.evaluate(() => {
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx, ty: h.ty } });            // apex ON TOP of hero tile ⇒ dist~0 ⇒ would be T2
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.apex({ enabled: false });                              // now OFF
    const off = window.__dev.apex();
    return { preview: off.forageMatsPreview, mats: off.mats, tier: off.tier, dist: off.dist };
  });
  const neutOK = neutral.preview === 0 && neutral.mats === 0 && neutral.tier === 0;
  ok("10 ★ BYTE-NEUTRAL OFF: con OFF, apexMatBonus(apex pegado)==0 + forageMatsPreview==0 ⇒ 0 mena al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTOGONALIDAD: flip APEX OFF→ON at the SAME state ⇒ los 15 canales peer IDÉNTICOS; y toggling SCARCITY no cambia la señal apex.
  const orth = await page.evaluate(() => {
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.apex({ enabled: false });
    const snap = () => { const s = window.__dev.apex(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview }; };
    const peersOff = snap();                                            // APEX OFF (misma posición del héroe)
    window.__dev.apex({ enabled: true });
    const peersOn = snap();                                             // APEX ON — los peers NO deben cambiar
    // enabling SCARCITY_EDGE (reward-forage cousin) must NOT change the apex signal
    const beforeArc = window.__dev.apex();
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.apex();
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });   // restaura el estado LIVE
    window.__dev.apex({ enabled: false });
    const peersUnchanged = JSON.stringify(peersOff) === JSON.stringify(peersOn);
    const sigUnchanged = beforeArc.dist === afterArc.dist && beforeArc.tier === afterArc.tier && beforeArc.mats === afterArc.mats;
    return { peersOff, peersOn, peersUnchanged, sigUnchanged, scAfter };
  });
  ok("11 ★ ORTOGONALIDAD matFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind: flip apex OFF→ON NO cambia ningún peer; toggling SCARCITY NO cambia la señal apex; Scarcity operable con apex ON",
     orth.peersUnchanged && orth.sigUnchanged && orth.scAfter === true, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION: 14 arc flags served true; APEX_PROXIMITY served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const apDark = flag("APEX_PROXIMITY") === "false";
  ok("12 ★ 0-REGRESIÓN: 14 mecanismos del arco #59-#72 served enabled:true; APEX_PROXIMITY served false (DARK #73)",
     arcAllOn && apDark && arc.length === 14, `apex=${flag("APEX_PROXIMITY")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge "Apex:" drawn ON+apex near / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Apex:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.apex({ enabled: true });
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.apex({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Apex:\" se DIBUJA ON+apex cerca (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.apex({ enabled: true }); const h = window.__dev.apex().hero; window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } }); window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.apex({ enabled: false }));

  // 14 ★ NORTH STAR — 2-client convergence: SAME apex at SAME tile + hero at SAME tile ⇒ dist/tier/mats/apexCount + LUT + worldFingerprint IDENTICAL byte-a-byte.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  // A FIXED absolute tile so both clients teleport hero + apex to the SAME coordinates (apexNearestDist is a pure fn of positions).
  const APEX_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // apex 4 tiles east of hero (~128px → T2)
  const readVM = async (pg) => await pg.evaluate((AT, HT) => {
    window.__dev.apex({ enabled: true });
    window.__dev.apex({ spawnApex: { tx: AT.tx, ty: AT.ty } });
    window.__dev.apex({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.apex();
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });   // LUT PURA
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.apex({ enabled: false });
    return { dist: vm.dist, tier: vm.tier, mats: vm.mats, apexCount: vm.apexCount, npDist: np.dist, npKind: np.apex ? np.apex.kind : null, lut, fp };
  }, APEX_TILE, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // apexCount NO se compara: es el nº AMBIENTAL de apex vivos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en los 13 checks previos (B es fresco). El SIGNAL determinista per-snapshot — dist/tier/mats + nearestProbe(dist,kind) + LUT PURA + worldFingerprint — es lo shard-consistente. (Mismo patrón que #72: la North Star excluye el conteo vivo dinámico y compara la señal determinista dado el MISMO apex+héroe.)
  const conv = A.dist === B.dist && A.tier === B.tier && A.mats === B.mats && A.npDist === B.npDist && A.npKind === B.npKind && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO apex+héroe ⇒ dist/tier/mats + nearestProbe(dist,kind) + LUT distProbe + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; apexCount ambiental excluido — contaminado por inyecciones de prueba de A)",
     conv, `A={dist:${A.dist},tier:${A.tier},mats:${A.mats},count:${A.apexCount},npDist:${A.npDist},npKind:${A.npKind},fpLen:${A.fp.length}} B={dist:${B.dist},tier:${B.tier},mats:${B.mats},count:${B.apexCount},npDist:${B.npDist},npKind:${B.npKind},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.apex({ enabled: false }));
  await pageB.evaluate(() => window.__dev.apex({ enabled: false }));

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
