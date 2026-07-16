// CAS-2455 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PARTICIPACIÓN EN EVENTO DE ZONA (ZONE_EVENT_SURGE.enabled:TRUE), EVO mecánica #75.
// Mirror LIVE de la DARK QA CAS-2453. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 3a834d06862e (== master flip a9b2ce7 == deploy 2009ed7 == gh-pages 15f162865f28 == HTTP served; byte-verificado CTO+CEO 5/5).
//
// Diferencia clave vs DARK (cas2453): enabled:TRUE ⇒ el efecto ZONE_EVENT_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - zoneEventScore(h)=Σ eventWeights[type] sobre POIs de evento con state==="active" dentro de radius360 (server-auth: G.zoneEvents.pois = estado ZONE_EVENTS/CAS-1681 replicado).
//   - TABLA por score: score≥3→T2/gems2, [1,3)→T1/gems1, 0→T0/gems0 (sub-cap eventGemCap=2).
//   - canal FRESCO gemFind: forrajeo DENTRO de un evento activo en radio ⇒ +esquirlas de gema por kill (grantGems a h.eventGems, recurso TRANSITORIO fuera del save+fingerprint).
//   - POI done/escaped (consumido) o sin evento en radio (>360px) ⇒ peso 0 ⇒ T0/+0 (control).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.zoneEvent (scoreProbe/spawnEvent/eventProbe/tp) + peers + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2455-zoneevent-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2455-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "3a834d06862e";   // build deployado por el flip ZONE_EVENT_SURGE CAS-2454 (== version.json esperado)
const DARK_BUILD = "f7b79c60d831";     // build DARK previo (CAS-2450/2453) — el LIVE DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// eventWeights {shrine:1,chest:2,goblin:2}; tiers [{min:1,gems:1},{min:3,gems:2}]; eventGemCap 2.
const ORACLE_WEIGHTS = { shrine: 1, chest: 2, goblin: 2 };   // id ausente → 1 (fallback)
const ORACLE_TIERS = [{ min: 1, gems: 1 }, { min: 3, gems: 2 }];
const ORACLE_CAP = 2;
function oracleTierGems(score) {
  let g = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; g = ORACLE_TIERS[i].gems; }
  return { tier: t, gems: Math.min(ORACLE_CAP, g) };
}
const EXPECT_SCORE = [
  { s: 0, t: 0, g: 0 }, { s: 1, t: 1, g: 1 }, { s: 2, t: 1, g: 1 },
  { s: 3, t: 2, g: 2 }, { s: 4, t: 2, g: 2 }, { s: 6, t: 2, g: 2 }, { s: 99, t: 2, g: 2 },
];
// 16 flags del arco #59-#74 (ZONE_EVENT_SURGE es #75, el nuevo). Todas deben seguir served:true.
const ARC16 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAZone";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del DARK) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.zoneEvent && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del DARK ${DARK_BUILD}); __dev.zoneEvent/ward/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 16 flags arco #59-#74 served TRUE + ZONE_EVENT_SURGE #75 served TRUE ⇒ 17 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC16.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const zeLive = flag("ZONE_EVENT_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 16 flags arco #59-#74 served true (intactas) + ZONE_EVENT_SURGE #75 served true ⇒ 17 flags LIVE, 0 perdidas",
     arcAllOn && zeLive && ARC16.length === 16, `zoneEvent=${flag("ZONE_EVENT_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params ZONE_EVENT_SURGE served — canal FRESCO gemFind + sub-cap eventGemCap:2 + radio 360 + weights
  const channelLive = /channel:\s*"gemFind"/.test(cfgSrc);
  const capLive = /eventGemCap:\s*2/.test(cfgSrc);
  const radLive = /radius:\s*360/.test(cfgSrc);
  const wLive = /eventWeights:\s*\{\s*shrine:\s*1,\s*chest:\s*2,\s*goblin:\s*2\s*\}/.test(cfgSrc);
  ok("L2b params ZONE_EVENT_SURGE served: channel gemFind + eventGemCap 2 + radius 360 + eventWeights{shrine:1,chest:2,goblin:2}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel gemFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.zoneEvent());
  ok("L3 LIVE default: __dev.zoneEvent().enabled === TRUE (flip aplicado), channel gemFind, gExists false (STATELESS), cap 2, radius 360",
     st.enabled === true && st.channel === "gemFind" && st.gExists === false && st.cap === 2 && st.radius === 360,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/gems == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.zoneEvent({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].gems === c.g) &&
    tab.every(r => { const o = oracleTierGems(r.tier === 0 ? 0 : r.tier === 1 ? 1 : 3); return r.gems <= ORACLE_CAP; });
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/gems == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap eventGemCap=2",
     tabOK && tab.every(r => r.gems <= 2), JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH + INDEP EXTRAS: spawnEvent inyecta POI REAL; eventProbe lee score REAL desde G.zoneEvents.pois ═══
  //   per-tipo weight (shrine=+1 vs chest/goblin=+2) + state done/escaped ⇒ peso 0 (evento consumido, delta 0).
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.zoneEvent().hero;
    const measure = (type, state) => {
      window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score;
      window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 2, ty: h.ty, type, state } });   // ~64px, dentro de radio360
      window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.zoneEvent({ eventProbe: true });
      const poi = after.eventProbe.pois.find(p => p.type === type);
      return { delta: after.eventProbe.score - before, count: after.eventProbe.count, poiType: poi ? poi.type : null, poiState: poi ? poi.state : null, poiWeight: poi ? poi.weight : null };
    };
    const shrine = measure("shrine", "active");   // peso 1
    const chest = measure("chest", "active");      // peso 2
    const goblin = measure("goblin", "active");    // peso 2
    const doneP = measure("chest", "done");        // consumido ⇒ peso 0 ⇒ delta 0
    const escP = measure("goblin", "escaped");     // consumido ⇒ peso 0 ⇒ delta 0
    return { shrine, chest, goblin, doneP, escP };
  });
  const s5OK = server5.shrine.delta === 1 && server5.shrine.poiWeight === 1 && server5.shrine.poiState === "active" &&
    server5.chest.delta === 2 && server5.chest.poiWeight === 2 &&
    server5.goblin.delta === 2 && server5.goblin.poiWeight === 2 &&
    server5.doneP.delta === 0 && server5.escP.delta === 0;
  ok("L5 ★ REAL SERVER-AUTH: spawnEvent→G.zoneEvents.pois, eventProbe lee score REAL; INDEP per-tipo shrine=+1 chest=+2 goblin=+2; state done/escaped ⇒ peso 0 (delta 0)",
     s5OK, JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): POI activo de alto valor en radio ⇒ +gemas por tier; sin evento lejos ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h = window.__dev.zoneEvent().hero;
    // EVENTO de alto valor: chest(2)+goblin(2) = score≥4 ⇒ T2/gems2
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 3, ty: h.ty, type: "chest", state: "active" } });  // ~96px
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "goblin", state: "active" } }); // ~128px
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });                                                // héroe en el evento
    const nearVm = window.__dev.zoneEvent();
    // LEJOS: teleport héroe fuera del radio360 (>12 tiles) ⇒ sin evento en radio ⇒ T0/+0 control
    window.__dev.zoneEvent({ tp: { tx: h.tx + 40, ty: h.ty } });
    const farVm = window.__dev.zoneEvent();
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });                                                // restaurar
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, gems: nearVm.gems, preview: nearVm.forageGemsPreview },
      far: { score: farVm.score, tier: farVm.tier, gems: farVm.gems, preview: farVm.forageGemsPreview },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score >= 3 && effect.near.tier === 2 && effect.near.gems === 2 && effect.near.preview === 2
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.gems === 0 && effect.far.preview === 0
    && effect.near.tier === oracleTierGems(effect.near.score).tier && effect.near.gems === oracleTierGems(effect.near.score).gems
    && effect.far.tier === oracleTierGems(effect.far.score).tier;
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): evento de alto valor (chest+goblin, score≥3) en radio ⇒ gems+2/T2; héroe lejos (>360px) ⇒ sin evento +0/T0 (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L7 — SUB-CAP propio eventGemCap=2: ningún score produce gems>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe.gems);
    return { max: Math.max(...vals), cap: window.__dev.zoneEvent().cap }; });
  ok("L7 ★ SUB-CAP eventGemCap: ningún score produce gems>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL gemFind AISLADO / NO doble-dip ═══
  //  (a) UNICIDAD served: `channel:"gemFind"` aparece EXACTAMENTE 1 vez (en ZONE_EVENT_SURGE) y NINGUNA de las 16 flags del arco lo usa.
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  //  Nota: NO se compara peers cerca-vs-lejos por teleport — atkspd/detectRadius/essenceFind/matFind/flaskPotency son reactivos a
  //  posición/zona/mobs/eventos por DISEÑO propio; su variación al mover el héroe NO es doble-dip de gemFind (sería falso-FAIL).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const gemFindCount = chanDecls.filter(c => c === "gemFind").length;
  const arcChannels = ARC16.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesGem = arcChannels.every(c => c !== "gemFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.zoneEvent(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.zoneEvent({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL gemFind AISLADO / NO DOBLE-DIP: served declara `channel:\"gemFind\"` EXACTAMENTE 1× (ZONE_EVENT_SURGE) + NINGUNA de las 16 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 11 peers byte-idénticos)",
     gemFindCount === 1 && noArcUsesGem && pure.unchanged,
     `gemFindDecls=${gemFindCount} arcChannels=${JSON.stringify(arcChannels)} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave eventGems/gemFind/zoneEventSurge + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.zoneEvent().hero; window.__dev.zoneEvent({ scoreProbe: { score: 4 } }); window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 3, ty: h.ty, type: "chest", state: "active" } }); window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noGemKey = !/"eventGems"\s*:/.test(saveBlob) && !/"(zoneEventSurge|gemFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN eventGems/gemFind/zoneEventSurge (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las gemas NO entran al fingerprint; 0 RNG/timer drift)",
     noGemKey && fpBefore === fpAfter, `noGemKey=${noGemKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge "Evento:◈" render: "Evento: T<n>" con evento activo EN radio, "Evento: —" sin evento + mov/combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let tCnt = 0, dashCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Evento: T") >= 0) tCnt++; if (t.indexOf("Evento: —") >= 0) dashCnt++; } return orig(t, x, y); };
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 3, ty: h.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "goblin", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });                 // evento EN radio ⇒ badge "Evento: T2"
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 800));                       // warmup tras probes pesadas
    tCnt = 0; dashCnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1600) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const nearT = tCnt, nearDash = dashCnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.zoneEvent({ tp: { tx: h.tx + 40, ty: h.ty } });            // evento fuera de radio ⇒ badge "Evento: —"
    tCnt = 0; dashCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const farT = tCnt, farDash = dashCnt;
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    cx.fillText = orig;
    return { nearT, nearDash, farT, farDash, fps };
  });
  ok("L9 LIVE render: badge \"Evento: T<n>\" con evento activo EN radio (nearT>0, nearDash0) y \"Evento: —\" sin evento en radio (farDash>0, farT0); movimiento+combate sin crash; fps sano",
     badge.nearT > 0 && badge.nearDash === 0 && badge.farDash > 0 && badge.farT === 0 && badge.fps >= 50,
     `nearT=${badge.nearT} nearDash=${badge.nearDash} farT=${badge.farT} farDash=${badge.farDash} fps=${badge.fps}`);

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.zoneEvent().hero; window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 3, ty: h.ty, type: "chest", state: "active" } }); window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "goblin", state: "active" } }); window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA (score=Σ POIs activos en radio, acumulado). Comparar A vs B daría falso-desync.
  // Test honesto: dos clientes FRESCOS en el MISMO shard ⇒ MISMO seed ⇒ MISMO mundo/ambiente (worldFingerprint byte-id) + MISMA inyección determinista ⇒ MISMA señal.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes inyectan el MISMO evento + tp héroe a las MISMAS coords (zoneEventScore = fn PURA de POIs activos en radio).
  const A_TILE = { tx: 70, ty: 44 }, B_TILE = { tx: 71, ty: 44 }, HERO_TILE = { tx: 74, ty: 44 };  // evento 3-4 tiles del héroe (~96-128px → en radio360)
  const readNS = async (pg) => await pg.evaluate((AT, BT, HT) => {
    window.__dev.zoneEvent({ spawnEvent: { tx: AT.tx, ty: AT.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ spawnEvent: { tx: BT.tx, ty: BT.ty, type: "goblin", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.zoneEvent();
    const ep = window.__dev.zoneEvent({ eventProbe: true }).eventProbe;
    const lut = [0, 1, 3].map(s => { const p = window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, gems: p.gems }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, gems: vm.gems, epScore: ep.score, epCount: ep.count, lut, fp, enabled: vm.enabled };
  }, A_TILE, B_TILE, HERO_TILE);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  // activeEventCount NO se compara: nº AMBIENTAL de POIs de evento (sembrados por ZONE_EVENTS). La señal determinista per-snapshot
  // (score/tier/gems + eventProbe.score + LUT + worldFingerprint byte-id) es lo shard-consistente.
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.gems === NC.gems &&
                 NB.epScore === NC.epScore &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true && NB.tier === 2;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO evento+héroe (2 clientes FRESCOS) ⇒ score/tier/gems + eventProbe.score + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; activeEventCount ambiental excluido), enabled:true, T2",
     convOK, `B={score:${NB.score},tier:${NB.tier},gems:${NB.gems},epScore:${NB.epScore},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},gems:${NC.gems},epScore:${NC.epScore},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-zoneevent.png") });

  // ═══ L11 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin eventGems + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.zoneEvent", { timeout: 8000 });
  const reconn = await pageB.evaluate((AT, BT, HT) => {
    const s = window.__dev.zoneEvent();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 3].map(sc => { const p = window.__dev.zoneEvent({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, tier: p.tier, gems: p.gems }; });
    window.__dev.zoneEvent({ spawnEvent: { tx: AT.tx, ty: AT.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ spawnEvent: { tx: BT.tx, ty: BT.ty, type: "goblin", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: HT.tx, ty: HT.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"eventGems"\s*:|"(zoneEventSurge|gemFind)[A-Za-z]*"\s*:/.test(save), lut, fp };
  }, A_TILE, B_TILE, HERO_TILE);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre;
  ok("L11 RECONNECT STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin eventGems/gemFind + LUT idéntica + worldFingerprint idéntico (0 drift, 0 persistencia indebida de gemas)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), fpMatch: reconn.fp === fpB_pre }));

  // ═══ L12 — sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B + C) ═══
  ok("L12 ★ 0 JS ERROR: sin errores JS ni 404 (no-favicon) en toda la corrida (A=0 + B=0 + C=0)",
     errA.length === 0 && errB.length === 0 && errC.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} C=${errC.length} 404=${net404.length} ${errA.concat(errB, errC).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, ZONE_EVENT_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
