// CAS-2442 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PROXIMIDAD A AMENAZA APEX (APEX_PROXIMITY.enabled:TRUE), EVO mecánica #73.
// Mirror LIVE de la DARK QA CAS-2440 (self-verify GE CAS-2439). URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = c0318e23765d (== master flip bf05ed7 == gh-pages d588d48 == HTTP served; byte-verificado 2× por CTO CAS-2441 + CEO). AVANZÓ del LIVE #72 8c6257f18c72.
//
// Diferencia clave vs DARK: enabled:TRUE ⇒ el efecto APEX_PROXIMITY está ACTIVO en el build servido (SIN toggle in-memory):
//   - apexNearestDist(hero)=min hypot(hero−apexVivo) sobre G.enemies isBoss/champion/champElite (server-auth, posiciones = estado de sim replicado).
//   - LUT por proximidad: dist ≤240→T2/+2 mena, ≤480→T1/+1 mena, >480 / sin apex → T0/0. Sub-cap propio apexMatCap=2.
//   - canal FRESCO matFind: matar cerca de un apex vivo ⇒ mena/material de forja (grantMats) al seam killEnemy. Lejos/sin apex ⇒ +0 (control).
// Oráculos RE-DERIVADOS desde 0 (NO importo la tabla del selfverify GE ni de la DARK QA).
// Observado vía __dev.apex (spawnApex inyección REAL + nearestProbe server-auth + tp determinista + distProbe LUT pura, SIN tocar enabled — ya true por el flip)
//   + __dev.scarcity/lastStand (peers ⊥) + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText ("Apex:").
// Run: node tools/cas2442-apex-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2442-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "c0318e23765d";   // build deployado por el flip APEX_PROXIMITY CAS-2441 (== version.json esperado)
const PREV_LIVE_BUILD = "8c6257f18c72"; // LIVE #72 previo (SCARCITY_EDGE) — el LIVE #73 DEBE haber avanzado de aquí

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados) ──
// tiers: [{max:480,mats:1},{max:240,mats:2}] — el tier vigente = el MÁS peligroso (menor `max`) cuya distancia se satisface.
const oracleTier = (dist) => (dist <= 240 ? 2 : (dist <= 480 ? 1 : 0));
const oracleMats = (dist) => Math.min(2, [0, 1, 2][oracleTier(dist)]);   // sub-cap apexMatCap=2
// LUT esperada dist→{tier,mats}
const EXPECT_DIST = [
  { dist: 0, t: 2, m: 2 }, { dist: 240, t: 2, m: 2 },
  { dist: 241, t: 1, m: 1 }, { dist: 480, t: 1, m: 1 },
  { dist: 481, t: 0, m: 0 }, { dist: 9999, t: 0, m: 0 },
];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAApex";
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

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errA = [], errB = [], net404 = [];
async function boot(page, err) {
  page.on("pageerror", (e) => err.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) err.push(m.text()); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(rp.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}

try {
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageA.bringToFront();
  await boot(pageA, errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del LIVE #72) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.apex && window.__dev.scarcity && window.__dev.lastStand && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del LIVE #72 ${PREV_LIVE_BUILD}); __dev.apex/scarcity/lastStand/saveBlob/worldFingerprint; 0 err/404`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prev=${PREV_LIVE_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 14 flags arco #59-#72 served TRUE + APEX_PROXIMITY #73 served TRUE (15 total) ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const apLive = flag("APEX_PROXIMITY") === "true";
  ok("L2 0-REGRESIÓN: 14 flags arco #59-#72 served true (intactas) + APEX_PROXIMITY #73 served true ⇒ 15 flags LIVE, 0 perdidas",
     arcAllOn && apLive && arc.length === 14, `apex=${flag("APEX_PROXIMITY")} arc=${JSON.stringify(arcLive)}`);

  // params APEX_PROXIMITY served — canal FRESCO matFind + sub-cap apexMatCap 2 + tiers LUT
  const channelLive = /channel:\s*"matFind"/.test(cfgSrc);
  const capLive = /apexMatCap:\s*2/.test(cfgSrc);
  const tiersLive = /max:\s*480,\s*mats:\s*1/.test(cfgSrc) && /max:\s*240,\s*mats:\s*2/.test(cfgSrc);
  ok("L2b params APEX_PROXIMITY served: channel matFind + apexMatCap 2 + tiers {≤480:1, ≤240:2}",
     channelLive && capLive && tiersLive, `channel=${channelLive} cap=${capLive} tiers=${tiersLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel matFind, STATELESS, cap 2 ═══
  const st = await pageA.evaluate(() => window.__dev.apex());
  ok("L3 LIVE default: __dev.apex().enabled === TRUE (flip aplicado), channel matFind, gExists false (STATELESS), cap apexMatCap 2",
     st.enabled === true && st.channel === "matFind" && st.gExists === false && st.cap === 2,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap}`);

  // ═══ L4 — LUT PURA re-derivada: distProbe.tier/mats == oracleTier/oracleMats byte-exacto (sub-cap 2) ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.apex({ distProbe: { dist: c.dist } }).distProbe), EXPECT_DIST);
  const tabOK = EXPECT_DIST.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].mats === c.m &&
    tab[i].tier === oracleTier(c.dist) && tab[i].mats === oracleMats(c.dist));
  ok("L4 LUT PURA re-derivada: distProbe.tier/mats == oracleTier/oracleMats byte-exacto (≤240→T2/2, (240,480]→T1/1, >480→T0/0)",
     tabOK, JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount ═══
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;                                  // tile actual del héroe
    window.__dev.apex({ spawnApex: { tx: h.tx + 3, ty: h.ty } });        // inyecta apex 3 tiles al este (~96px → T2)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });                   // héroe de vuelta al tile origen
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const vm = window.__dev.apex();
    return { np, apexCount: vm.apexCount, tier: vm.tier, dist: vm.dist };
  });
  ok("L5 ★ REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1",
     server5.np && server5.np.dist > 0 && server5.np.apex && server5.np.apex.kind === "boss" && server5.apexCount >= 1,
     JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle): apex cerca ⇒ matFind bonus>0 (==oráculo); lejos ⇒ 0 (control) ═══
  const forage = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });        // ~128px → T2
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.apex();
    const nearPrev = nearVm.forageMatsPreview, nearMats = nearVm.mats, nearDist = nearVm.dist, nearTier = nearVm.tier;
    window.__dev.apex({ tp: { tx: h.tx + 30, ty: h.ty } });              // héroe 30 tiles lejos (~960px > 480) → T0
    const farVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });                   // restaura
    return { nearPrev, nearMats, nearDist, nearTier, farPrev: farVm.forageMatsPreview, farTier: farVm.tier, enabled: window.__dev.apex().enabled };
  });
  const forageOK = forage.enabled === true && forage.nearPrev > 0 && forage.nearPrev === forage.nearMats &&
                   forage.nearPrev === oracleMats(forage.nearDist) && forage.farPrev === 0 && forage.farTier === 0;
  ok("L6 ★ EFECTO ACTIVO LIVE: (enabled:true) apex ≤240px ⇒ forageMatsPreview = matFind bonus > 0 (== oráculo); héroe 30 tiles lejos ⇒ 0 (control)",
     forageOK, JSON.stringify(forage) + ` oracleNear=${oracleMats(forage.nearDist)}`);

  // ═══ L7 — SUB-CAP propio apexMatCap=2: ningún dist produce mats>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let d = 0; d <= 700; d += 20) vals.push(window.__dev.apex({ distProbe: { dist: d } }).distProbe.mats);
    return { max: Math.max(...vals), cap: window.__dev.apex().cap }; });
  ok("L7 ★ SUB-CAP apexMatCap: ningún dist produce mats>2 (sweep dist∈[0,700]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — DIFERENCIADOR/INVERSO: apex ≤240 ⇒ T≥1 por PRESENCIA (INVERSO #72 ausencia / #69 engage); SCARCITY_EDGE+LAST_STAND LIVE coexisten ⊥ ═══
  const diff = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 5, ty: h.ty } });        // ~160px (≤240) → T2 por PRESENCIA
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.apex();
    const sc = window.__dev.scarcity ? window.__dev.scarcity() : null;   // primo recompensa-forrajeo (LIVE #72) — coexiste, señal distinta (agotamiento)
    const ls = window.__dev.lastStand ? window.__dev.lastStand() : null; // #69 engage-count LIVE
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    return { tier: vm.tier, dist: vm.dist, mats: vm.mats, scEnabled: sc ? sc.enabled : null, lsEnabled: ls ? ls.enabled : null };
  });
  const diffOK = diff.tier >= 1 && diff.dist > 0 && diff.dist <= 240 && diff.mats >= 1 && diff.scEnabled === true && diff.lsEnabled === true;
  ok("L8 ★ DIFERENCIADOR/INVERSO: apex a ≤240px ⇒ T≥1 por PRESENCIA de un apex CONCRETO (INVERSO a #72 escasez/ausencia y a #69 engage); SCARCITY_EDGE + LAST_STAND LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // ═══ L9 — STATELESS + NO doble-dip: save sin clave + gExists false + peers ⊥ + fp estable ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("L9a STATELESS: saveBlob() SIN clave apex* (efecto 100% derivado de posiciones del mundo, 0 persistencia nueva)",
     !/"apex[A-Za-z]*"\s*:/.test(saveBlob), `saveLen=${saveBlob.length}`);

  // NO doble-dip: los canales-peer NO cambian por proximidad apex; y toggling SCARCITY no cambia la señal apex
  const orth = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => { const s = window.__dev.apex(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview }; };
    const peersA = snap();
    const beforeArc = window.__dev.apex();
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.scarcity && window.__dev.scarcity({ enabled: !scPrev });   // togglear el primo NO debe cambiar la señal apex
    const afterArc = window.__dev.apex();
    const peersB = snap();
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });    // restaura el estado LIVE
    return { peersUnchanged: JSON.stringify(peersA) === JSON.stringify(peersB),
      sigUnchanged: beforeArc.dist === afterArc.dist && beforeArc.tier === afterArc.tier && beforeArc.mats === afterArc.mats,
      scRestored: (window.__dev.scarcity ? window.__dev.scarcity().enabled : null) === scPrev, peersA };
  });
  ok("L9b ★ NO DOBLE-DIP: canal matFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind; toggling SCARCITY NO cambia la señal apex; Scarcity restaurado a LIVE",
     orth.peersUnchanged && orth.sigUnchanged && orth.scRestored, JSON.stringify(orth));

  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.apex().hero; window.__dev.apex({ spawnApex: { tx: h.tx + 2, ty: h.ty } }); window.__dev.apex({ distProbe: { dist: 100 } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("L9c worldFingerprint(393) byte-estable a través de probes (proximidad/mena NO entra al fingerprint; 0 RNG/timer drift; worldFingerprint NO lee G.enemies)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ L10 — badge "Apex:" render + movimiento/combate sin crash + fps sano (régimen permanente) ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Apex:") >= 0) cnt++; return orig(t, x, y); };
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    // warmup 700ms tras probes pesadas
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    // medición régimen permanente 2s en movimiento+combate
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 2000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { badgeCnt: cnt, fps };
  });
  ok("L10 LIVE render: movimiento (ArrowRight) + combate (Digit1) sin crash; fps RÉGIMEN PERMANENTE sano (≥55); badge \"Apex:\" DIBUJA (enabled:true + apex cerca ⇒ count>0, contraste con DARK count==0)",
     badge.fps >= 55 && badge.badgeCnt > 0, `badgeCnt=${badge.badgeCnt} fps=${badge.fps}`);

  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L11 — North Star 2-cliente / 0-desync (segundo cliente LIVE, mismo shard) ═══
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.bringToFront();
  await boot(pageB, errB);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  ok(`L11a cliente B carga el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD, `buildB=${buildB}`);

  // MISMO apex en el MISMO tile absoluto + héroe en el MISMO tile ⇒ dist/tier/mats + nearestProbe + LUT + worldFingerprint IDÉNTICOS byte-a-byte.
  const APEX_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // apex 4 tiles al este del héroe (~128px → T2)
  const readNS = async (pg) => await pg.evaluate((AT, HT) => {
    window.__dev.apex({ spawnApex: { tx: AT.tx, ty: AT.ty } });
    window.__dev.apex({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.apex();
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });   // LUT PURA
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { dist: vm.dist, tier: vm.tier, mats: vm.mats, apexCount: vm.apexCount, npDist: np.dist, npKind: np.apex ? np.apex.kind : null, lut, fp, enabled: vm.enabled };
  }, APEX_TILE, HERO_TILE);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  // apexCount NO se compara: es el nº AMBIENTAL de apex vivos, contaminado por las inyecciones de PRUEBA que el cliente A acumuló en L5-L10 (B es fresco).
  // El SIGNAL determinista per-snapshot dado el MISMO apex+héroe — dist/tier/mats + nearestProbe(dist,kind) + LUT PURA + worldFingerprint — es lo shard-consistente. (Mismo patrón #72.)
  const convOK = NA.dist === NB.dist && NA.tier === NB.tier && NA.mats === NB.mats && NA.npDist === NB.npDist && NA.npKind === NB.npKind &&
                 JSON.stringify(NA.lut) === JSON.stringify(NB.lut) && NA.enabled === true && NB.enabled === true;
  ok("L11b NORTH STAR 2-CLIENTE: MISMO apex+héroe ⇒ dist/tier/mats + nearestProbe(dist,kind) + LUT distProbe IDÉNTICOS A↔B, enabled:true en ambos (0 desync; apexCount ambiental excluido — contaminado por inyecciones de prueba de A)",
     convOK, `A={dist:${NA.dist},tier:${NA.tier},mats:${NA.mats},npDist:${NA.npDist},npKind:${NA.npKind}} B={dist:${NB.dist},tier:${NB.tier},mats:${NB.mats},npDist:${NB.npDist},npKind:${NB.npKind}} lut=${JSON.stringify(NA.lut) === JSON.stringify(NB.lut)}`);
  ok("L11c NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado, misma semilla, 0 desync; apex de prueba NO perturba el fingerprint)",
     NA.fp === NB.fp, `len=${NA.fp.length} match=${NA.fp === NB.fp}`);

  // ═══ L12 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin clave + LUT idéntica + fp estable ═══
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.apex", { timeout: 8000 });
  const reconn = await pageB.evaluate(() => {
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });
    const s = window.__dev.apex();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { lut, enabled: s.enabled, gExists: s.gExists, channel: s.channel, cap: s.cap, hasKey: /"apex[A-Za-z]*"\s*:/.test(save), fp };
  });
  const reconnOK = JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) &&
                   reconn.enabled === true && reconn.gExists === false && reconn.channel === "matFind" && reconn.cap === 2 && reconn.hasKey === false && reconn.fp === NB.fp;
  ok("L12 RECONNECT STATELESS 0-drift: tras reload, LUT idéntica + enabled:true + gExists false + channel matFind + cap 2 + save sin clave + fp estable (0 drift, 0 persistencia)",
     reconnOK, JSON.stringify({ lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, fpMatch: reconn.fp === NB.fp }));

  // ═══ L13 — sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B) ═══
  ok("L13 sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B)",
     errA.length === 0 && errB.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} 404=${net404.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, APEX_PROXIMITY.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
