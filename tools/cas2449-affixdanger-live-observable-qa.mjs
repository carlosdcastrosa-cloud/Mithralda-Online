// CAS-2449 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PELIGRO POR AFIJO DE MOB (MOB_AFFIX_DANGER.enabled:TRUE), EVO mecánica #74.
// Mirror LIVE de la DARK QA CAS-2447. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = ad855d365976 (== master flip 4105f6f == deploy 09769f2 == gh-pages 5e2218c == HTTP served; byte-verificado CTO+CEO).
//
// Diferencia clave vs DARK: enabled:TRUE ⇒ el efecto MOB_AFFIX_DANGER está ACTIVO en el build servido, SIN flip in-memory:
//   - affixDangerScore(h)=Σ affixWeights[id] sobre mobAffixes de mobs afijados VIVOS en radius260 (server-auth: e.affix/affixes en G.enemies = estado de sim replicado).
//   - TABLA por score: score≥3→T2/flasks2, [1,3)→T1/flasks1, 0→T0/flasks0 (sub-cap dangerFlaskCap=2).
//   - canal FRESCO flaskPotency: mob afijado en radio ⇒ +cargas de Estus por kill de trash (grantFlask a h.flaskCharges, recurso TRANSITORIO fuera del save+fingerprint).
//   - trash plano sin afijos / lejos (>260px) ⇒ 0 bono (control, Tier 0).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.affixDanger (scoreProbe/spawnAffix/dangerProbe/tp) + peers (ward/gold/atk/crit/xp/vamp/loot/det/ess/mat) + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2449-affixdanger-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2449-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "ad855d365976";   // build deployado por el flip MOB_AFFIX_DANGER CAS-2448 (== version.json esperado)
const DARK_BUILD = "fd4766f76ab8";     // build DARK previo (CAS-2445/2447) — el LIVE DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
// score→{tier,flasks}: ≥3→T2/2, [1,3)→T1/1, 0→T0/0 ; flasks sub-cap dangerFlaskCap=2
const ORACLE_WEIGHTS = { swift: 1, armored: 1, vampiric: 1, volatile: 2, frost: 2 }; // id ausente → 1
const oracleTier = (score) => (score >= 3 ? 2 : score >= 1 ? 1 : 0);
const oracleFlasks = (score) => { const t = oracleTier(score); return Math.min(2, t === 2 ? 2 : t === 1 ? 1 : 0); };
// LUT esperada score→{tier,flasks}
const EXPECT_SCORE = [
  { s: 0, t: 0, f: 0 }, { s: 1, t: 1, f: 1 }, { s: 2, t: 1, f: 1 },
  { s: 3, t: 2, f: 2 }, { s: 4, t: 2, f: 2 }, { s: 6, t: 2, f: 2 }, { s: 99, t: 2, f: 2 },
];
// 15 flags del arco #59-#73 (MOB_AFFIX_DANGER es #74, el nuevo). Todas deben seguir served:true.
const ARC15 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAAffix";
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
const errA = [], errB = [], errC = [], net404 = [];
async function bootFresh(err) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.bringToFront();
  page.on("pageerror", (e) => err.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) err.push(m.text()); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(rp.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  return page;
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del DARK) + hooks (criterio 1) ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.affixDanger && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del DARK ${DARK_BUILD}); __dev.affixDanger/ward/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 15 flags arco #59-#73 served TRUE + MOB_AFFIX_DANGER #74 served TRUE (criterio 6) ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC15.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const affixLive = flag("MOB_AFFIX_DANGER") === "true";
  ok("L2 ★ 0-REGRESIÓN: 15 flags arco #59-#73 served true (intactas) + MOB_AFFIX_DANGER #74 served true ⇒ 16 flags LIVE, 0 perdidas",
     arcAllOn && affixLive && ARC15.length === 15, `affix=${flag("MOB_AFFIX_DANGER")} arc=${JSON.stringify(arcLive)}`);

  // params MOB_AFFIX_DANGER served — canal FRESCO flaskPotency + sub-cap dangerFlaskCap:2 + radio 260
  const channelLive = /channel:\s*"flaskPotency"/.test(cfgSrc);
  const capLive = /dangerFlaskCap:\s*2/.test(cfgSrc);
  const radLive = /radius:\s*260/.test(cfgSrc);
  ok("L2b params MOB_AFFIX_DANGER served: channel flaskPotency + dangerFlaskCap 2 + radius 260",
     channelLive && capLive && radLive, `channel=${channelLive} cap=${capLive} radius=${radLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel flaskPotency, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.affixDanger());
  ok("L3 LIVE default: __dev.affixDanger().enabled === TRUE (flip aplicado), channel flaskPotency, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "flaskPotency" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/flasks == oracle byte-exacto (criterio 3) ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.affixDanger({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].flasks === c.f);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/flasks == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap dangerFlaskCap=2",
     tabOK && tab.every(r => r.flasks <= 2), JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH: spawnAffix inyecta mob REAL afijado; dangerProbe lee score REAL desde el array replicado (criterio 4) ═══
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.affixDanger().hero;
    const sp = window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } }).spawnAffix;  // afijo REAL ~96px, en radio260
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    const dp = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe;
    return { spWeight: sp && sp.weight, dpScore: dp.score, dpCount: dp.count, dpHasVolatile: dp.mobs.some(m => m.affixes.includes("volatile")) };
  });
  ok("L5 ★ REAL SERVER-AUTH: spawnAffix inyecta mob REAL(volatile,w=2) en G.enemies; dangerProbe lee score REAL≥2 + count≥1 + el mob lleva 'volatile' (señal = estado de sim replicado, no cosmético)",
     server5.spWeight === 2 && server5.dpScore >= 2 && server5.dpCount >= 1 && server5.dpHasVolatile,
     JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): pack afijado en radio ⇒ +Estus por tier; trash lejos ⇒ +0 (criterio 3) ═══
  const effect = await pageA.evaluate(() => {
    const h = window.__dev.affixDanger().hero;
    // PACK peligroso: volatile(2)+frost(2) = score≥4 ⇒ T2/flasks2
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } }); // ~96px
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "frost" } });    // ~128px
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });                                 // héroe en el pack ⇒ ambos en radio
    const nearVm = window.__dev.affixDanger();
    // LEJOS: teleport héroe fuera del radio260 (>8 tiles) ⇒ trash plano ⇒ T0/+0 control
    window.__dev.affixDanger({ tp: { tx: h.tx + 40, ty: h.ty } });
    const farVm = window.__dev.affixDanger();
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });                                 // restaurar
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, flasks: nearVm.flasks, preview: nearVm.forageFlasksPreview },
      far: { score: farVm.score, tier: farVm.tier, flasks: farVm.flasks, preview: farVm.forageFlasksPreview },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score >= 3 && effect.near.tier === 2 && effect.near.flasks === 2 && effect.near.preview === 2
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.flasks === 0 && effect.far.preview === 0
    && effect.near.tier === oracleTier(effect.near.score) && effect.near.flasks === oracleFlasks(effect.near.score)
    && effect.far.tier === oracleTier(effect.far.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): pack afijado (volatile+frost, score≥3) en radio ⇒ flasks+2/T2; héroe lejos (>260px) ⇒ trash plano +0/T0 (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L7 — SUB-CAP propio dangerFlaskCap=2: ningún score produce flasks>2 (sweep completo) (criterio 3) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.affixDanger({ scoreProbe: { score: s } }).scoreProbe.flasks);
    return { max: Math.max(...vals), cap: window.__dev.affixDanger().cap }; });
  ok("L7 ★ SUB-CAP dangerFlaskCap: ningún score produce flasks>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL flaskPotency AISLADO / NO doble-dip (criterio 3/6) ═══
  //  (a) UNICIDAD served: `channel:"flaskPotency"` aparece EXACTAMENTE 1 vez (en MOB_AFFIX_DANGER) y NINGUNA de las 15 flags del arco lo usa
  //      ⇒ recompensa FRESCA, ningún canal existente se toca (prueba estructural de no-doble-dip, robusta a reactividad de posición).
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  //  Nota: NO se compara peers cerca-vs-lejos por teleport — atkspd(LAST_STAND)/detectRadius(SHADOW_STALK)/essenceFind(SCARCITY) son
  //  reactivos a posición/zona/mobs por DISEÑO propio; su variación al mover el héroe NO es doble-dip de flaskPotency (sería falso-FAIL).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const flaskPotencyCount = chanDecls.filter(c => c === "flaskPotency").length;
  // canal usado por CADA flag del arco (bloque de config de cada flag) — ninguno debe ser flaskPotency
  const arcChannels = ARC15.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesFlask = arcChannels.every(c => c !== "flaskPotency");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.affixDanger(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul,
      vamp: s.vampMul, loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.affixDanger({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL flaskPotency AISLADO / NO DOBLE-DIP: served declara `channel:\"flaskPotency\"` EXACTAMENTE 1× (MOB_AFFIX_DANGER) + NINGUNA de las 15 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 10 peers byte-idénticos)",
     flaskPotencyCount === 1 && noArcUsesFlask && pure.unchanged,
     `flaskPotencyDecls=${flaskPotencyCount} arcChannels=${JSON.stringify(arcChannels)} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave flaskCharges/affixDanger + worldFingerprint byte-estable a través de probes (criterio 4) ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.affixDanger().hero; window.__dev.affixDanger({ scoreProbe: { score: 4 } }); window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } }); window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noFlaskKey = !/flaskCharges/.test(saveBlob) && !/"affixDanger[A-Za-z]*"\s*:/.test(saveBlob) && !/dangerFlask/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN flaskCharges/affixDanger/dangerFlask (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (el Estus NO entra al fingerprint; 0 RNG/timer drift)",
     noFlaskKey && fpBefore === fpAfter, `noFlaskKey=${noFlaskKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge "Peligro:❈" render: "Peligro: T<n>" con afijo EN radio, "Peligro: —" sin afijos + mov/combate sin crash + fps (criterio 2) ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let tCnt = 0, dashCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Peligro: T") >= 0) tCnt++; if (t.indexOf("Peligro: —") >= 0) dashCnt++; } return orig(t, x, y); };
    const h = window.__dev.affixDanger().hero;
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } });
    window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "frost" } });
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });               // afijo EN radio ⇒ badge "Peligro: T2"
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 800));                       // warmup tras probes pesadas
    tCnt = 0; dashCnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1600) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const nearT = tCnt, nearDash = dashCnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.affixDanger({ tp: { tx: h.tx + 40, ty: h.ty } });          // afijo fuera de radio ⇒ badge "Peligro: —"
    tCnt = 0; dashCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const farT = tCnt, farDash = dashCnt;
    window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } });
    cx.fillText = orig;
    return { nearT, nearDash, farT, farDash, fps };
  });
  ok("L9 LIVE render (criterio 2): badge \"Peligro: T<n>\" con afijo EN radio (nearT>0, nearDash0) y \"Peligro: —\" sin afijos en radio (farDash>0, farT0); movimiento+combate sin crash; fps sano",
     badge.nearT > 0 && badge.nearDash === 0 && badge.farDash > 0 && badge.farT === 0 && badge.fps >= 50,
     `nearT=${badge.nearT} nearDash=${badge.nearDash} farT=${badge.farT} farDash=${badge.farDash} fps=${badge.fps}`);

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.affixDanger().hero; window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 3, ty: h.ty, affix: "volatile" } }); window.__dev.affixDanger({ spawnAffix: { tx: h.tx + 4, ty: h.ty, affix: "frost" } }); window.__dev.affixDanger({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección (criterio 5) ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA (score=Σ afijos en radio, acumulado). Comparar A vs B daría falso-desync.
  // Test honesto: dos clientes FRESCOS en el MISMO shard ⇒ MISMO seed ⇒ MISMO mundo/ambiente (worldFingerprint byte-id) + MISMA inyección determinista ⇒ MISMA señal.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes inyectan el MISMO pack + tp héroe a las MISMAS coords (affixDangerScore = fn PURA de mobs afijados en radio).
  const A_TILE = { tx: 61, ty: 40 }, B_TILE = { tx: 62, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };  // pack 3-2 tiles del héroe (~96-128px → en radio260)
  const readNS = async (pg) => await pg.evaluate((AT, BT, HT) => {
    window.__dev.affixDanger({ spawnAffix: { tx: AT.tx, ty: AT.ty, affix: "volatile" } });
    window.__dev.affixDanger({ spawnAffix: { tx: BT.tx, ty: BT.ty, affix: "frost" } });
    window.__dev.affixDanger({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.affixDanger();
    const dp = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe;
    const lut = [0, 2, 4].map(s => { const p = window.__dev.affixDanger({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, flasks: p.flasks }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, flasks: vm.flasks, dpScore: dp.score, dpCount: dp.count, lut, fp, enabled: vm.enabled };
  }, A_TILE, B_TILE, HERO_TILE);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  // affixMobCount NO se compara: nº AMBIENTAL de mobs afijados (rate ~0.13). La señal determinista per-snapshot (score/tier/flasks + dangerProbe + LUT + worldFingerprint byte-id) es lo shard-consistente.
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.flasks === NC.flasks &&
                 NB.dpScore === NC.dpScore && NB.dpCount === NC.dpCount &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true && NB.tier === 2;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO pack+héroe (2 clientes FRESCOS) ⇒ score/tier/flasks + dangerProbe(score,count) + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; afijo ambiental excluido), enabled:true, T2",
     convOK, `B={score:${NB.score},tier:${NB.tier},flasks:${NB.flasks},dpScore:${NB.dpScore},dpCount:${NB.dpCount},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},flasks:${NC.flasks},dpScore:${NC.dpScore},dpCount:${NC.dpCount},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-affix.png") });

  // ═══ L11 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin flaskCharges + LUT/fp idénticos (criterio 4) ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.affixDanger", { timeout: 8000 });
  const reconn = await pageB.evaluate((AT, BT, HT) => {
    const s = window.__dev.affixDanger();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 2, 4].map(sc => { const p = window.__dev.affixDanger({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, tier: p.tier, flasks: p.flasks }; });
    window.__dev.affixDanger({ spawnAffix: { tx: AT.tx, ty: AT.ty, affix: "volatile" } });
    window.__dev.affixDanger({ spawnAffix: { tx: BT.tx, ty: BT.ty, affix: "frost" } });
    window.__dev.affixDanger({ tp: { tx: HT.tx, ty: HT.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /flaskCharges|"affixDanger[A-Za-z]*"\s*:|dangerFlask/.test(save), lut, fp };
  }, A_TILE, B_TILE, HERO_TILE);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre;
  ok("L11 RECONNECT STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin flaskCharges/affixDanger + LUT idéntica + worldFingerprint idéntico (0 drift, 0 persistencia indebida de cargas)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), fpMatch: reconn.fp === fpB_pre }));

  // ═══ L12 — sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B + C) (criterio 1) ═══
  ok("L12 ★ 0 JS ERROR: sin errores JS ni 404 (no-favicon) en toda la corrida (A=0 + B=0 + C=0)",
     errA.length === 0 && errB.length === 0 && errC.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} C=${errC.length} 404=${net404.length} ${errA.concat(errB, errC).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, MOB_AFFIX_DANGER.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
