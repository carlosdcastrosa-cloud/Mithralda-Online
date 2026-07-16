// CAS-2462 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para VARIANTE DE ENCUENTRO ACTIVA (ENCOUNTER_VARIANT_SURGE.enabled:TRUE), EVO mecánica #76.
// Mirror LIVE de la DARK QA CAS-2457. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 4ffd21ead509 (== master flip ac1b910 == deploy tools/cas2460-deploy.mjs == gh-pages f0040be == HTTP served; byte-verificado CTO+CEO 6/6).
//
// Diferencia clave vs DARK (cas2457): enabled:TRUE ⇒ el efecto ENCOUNTER_VARIANT_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - variantSurgeScore(h)=Σ variantWeights[e.variant] sobre mobs-variante VIVOS dentro de radius260 (server-auth: G.enemies con e.variant, subsistema ENCOUNTER_VARIANTS/CAS-2071).
//   - TABLA por score: score≥3→T2/sockets2, [1,3)→T1/sockets1, 0→T0/sockets0 (sub-cap variantSocketCap=2).
//   - canal FRESCO socketFind: forrajeo DENTRO de un encuentro de variante en radio ⇒ +reagentes de engarce por kill (grantSocket a h.socketShards, recurso TRANSITORIO fuera del save+fingerprint).
//   - mob-variante FUERA de radio (>260px) o mob plano (sin variante) ⇒ peso 0 ⇒ T0/+0 (control).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.variantSurge (scoreProbe/spawnVariant/variantProbe/tp) + peers + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2462-variantsurge-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2462-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "4ffd21ead509";   // build deployado por el flip ENCOUNTER_VARIANT_SURGE CAS-2460 (== version.json esperado)
const DARK_BUILD = "f7b79c60d831";     // build DARK previo (CAS-2456/2457) — el LIVE DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// variantWeights {stalker:1,bastion:2,glass:1}; tiers [{min:1,sockets:1},{min:3,sockets:2}]; variantSocketCap 2.
const ORACLE_WEIGHTS = { stalker: 1, bastion: 2, glass: 1 };   // id ausente → applyVariant rechaza (delta 0)
const ORACLE_TIERS = [{ min: 1, sockets: 1 }, { min: 3, sockets: 2 }];
const ORACLE_CAP = 2;
function oracleTierSockets(score) {
  let k = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; k = ORACLE_TIERS[i].sockets; }
  return { tier: t, sockets: Math.min(ORACLE_CAP, k) };
}
const EXPECT_SCORE = [
  { s: 0, t: 0, k: 0 }, { s: 1, t: 1, k: 1 }, { s: 2, t: 1, k: 1 },
  { s: 3, t: 2, k: 2 }, { s: 4, t: 2, k: 2 }, { s: 6, t: 2, k: 2 }, { s: 99, t: 2, k: 2 },
];
// 17 flags del arco #59-#75 (ENCOUNTER_VARIANT_SURGE es #76, el nuevo). Todas deben seguir served:true.
const ARC17 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAVar";
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
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.variantSurge && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del DARK ${DARK_BUILD}); __dev.variantSurge/ward/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 17 flags arco #59-#75 served TRUE + ENCOUNTER_VARIANT_SURGE #76 served TRUE ⇒ 18 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC17.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const vsLive = flag("ENCOUNTER_VARIANT_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 17 flags arco #59-#75 served true (intactas) + ENCOUNTER_VARIANT_SURGE #76 served true ⇒ 18 flags LIVE, 0 perdidas",
     arcAllOn && vsLive && ARC17.length === 17, `variantSurge=${flag("ENCOUNTER_VARIANT_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params ENCOUNTER_VARIANT_SURGE served — canal FRESCO socketFind + sub-cap variantSocketCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"socketFind"/.test(cfgSrc);
  const capLive = /variantSocketCap:\s*2/.test(cfgSrc);
  const radLive = /radius:\s*260/.test(cfgSrc);
  const wLive = /variantWeights:\s*\{\s*stalker:\s*1,\s*bastion:\s*2,\s*glass:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params ENCOUNTER_VARIANT_SURGE served: channel socketFind + variantSocketCap 2 + radius 260 + variantWeights{stalker:1,bastion:2,glass:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel socketFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.variantSurge());
  ok("L3 LIVE default: __dev.variantSurge().enabled === TRUE (flip aplicado), channel socketFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "socketFind" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/sockets == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.variantSurge({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].sockets === c.k) && tab.every(r => r.sockets <= ORACLE_CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/sockets == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap variantSocketCap=2",
     tabOK, JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH + INDEP EXTRAS: spawnVariant inyecta mob-variante REAL; variantProbe lee score REAL desde G.enemies ═══
  //   per-variante weight (stalker=+1 vs bastion=+2 vs glass=+1) + id NO canónico ⇒ applyVariant rechaza (delta 0) + radius-gating (>260px ⇒ delta 0).
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.variantSurge().hero;
    const measure = (variant, offTiles) => {
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
      window.__dev.variantSurge({ spawnVariant: { tx: h.tx + offTiles, ty: h.ty, variant } });
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.variantSurge({ variantProbe: true });
      const mob = after.variantProbe.mobs.find(m => m.variant === variant);
      return { delta: after.variantProbe.score - before, count: after.variantProbe.count, mobVariant: mob ? mob.variant : null, mobWeight: mob ? mob.weight : null };
    };
    const stalker = measure("stalker", 2);      // ~64px, in radius → peso 1
    const bastion = measure("bastion", 2);       // ~64px, in radius → peso 2
    const glass = measure("glass", 2);           // ~64px, in radius → peso 1
    const noncanon = measure("zzz_absent", 2);   // id NO canónico ⇒ applyVariant no aplica ⇒ delta 0, sin mob-variante en la lista
    const farBastion = measure("bastion", 40);   // ~1280px > radius 260 → delta 0 (radius-gating)
    return { stalker, bastion, glass, noncanon, farBastion };
  });
  const s5OK = server5.stalker.delta === 1 && server5.stalker.mobWeight === 1 &&
    server5.bastion.delta === 2 && server5.bastion.mobWeight === 2 &&
    server5.glass.delta === 1 && server5.glass.mobWeight === 1 &&
    server5.noncanon.delta === 0 && server5.noncanon.mobVariant === null &&
    server5.farBastion.delta === 0;
  ok("L5 ★ REAL SERVER-AUTH: spawnVariant→G.enemies, variantProbe lee score REAL; INDEP per-variante stalker=+1 bastion=+2 glass=+1; id NO canónico ⇒ applyVariant rechaza (delta 0); radius-gating mob lejos ⇒ delta 0",
     s5OK, JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): variantes de alto valor en radio ⇒ +sockets por tier; sin variante lejos ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h = window.__dev.variantSurge().hero;
    // encuentro de alto valor: bastion(2)+stalker(1) = score≥3 ⇒ T2/sockets2
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } });  // ~96px
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "stalker" } });  // ~128px
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });                                      // héroe en el encuentro
    const nearVm = window.__dev.variantSurge();
    // LEJOS: teleport héroe OESTE fuera del radio260 (>10 tiles) ⇒ sin variante en radio ⇒ T0/+0 control.
    // OESTE (h.tx-40) a propósito: TODAS las inyecciones de prueba (L5 stalker/bastion/glass +2, farBastion +40; L6 +3/+4) están al ESTE ⇒ oeste queda limpio.
    window.__dev.variantSurge({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.variantSurge();
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });                                      // restaurar
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, sockets: nearVm.sockets, preview: nearVm.forageSocketsPreview },
      far: { score: farVm.score, tier: farVm.tier, sockets: farVm.sockets, preview: farVm.forageSocketsPreview },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score >= 3 && effect.near.tier === 2 && effect.near.sockets === 2 && effect.near.preview === 2
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.sockets === 0 && effect.far.preview === 0
    && effect.near.tier === oracleTierSockets(effect.near.score).tier && effect.near.sockets === oracleTierSockets(effect.near.score).sockets
    && effect.far.tier === oracleTierSockets(effect.far.score).tier;
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): encuentro de alto valor (bastion+stalker, score≥3) en radio ⇒ sockets+2/T2; héroe lejos (>260px) ⇒ sin variante +0/T0 (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L7 — SUB-CAP propio variantSocketCap=2: ningún score produce sockets>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe.sockets);
    return { max: Math.max(...vals), cap: window.__dev.variantSurge().cap }; });
  ok("L7 ★ SUB-CAP variantSocketCap: ningún score produce sockets>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL socketFind AISLADO / NO doble-dip ═══
  //  (a) UNICIDAD served: `channel:"socketFind"` aparece EXACTAMENTE 1 vez (en ENCOUNTER_VARIANT_SURGE) y NINGUNA de las 17 flags del arco lo usa.
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  //  Nota: NO se compara peers cerca-vs-lejos por teleport — atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind son reactivos a
  //  posición/zona/mobs/eventos por DISEÑO propio; su variación al mover el héroe NO es doble-dip de socketFind (sería falso-FAIL).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const socketFindCount = chanDecls.filter(c => c === "socketFind").length;
  const arcChannels = ARC17.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesSocket = arcChannels.every(c => c !== "socketFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.variantSurge(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.variantSurge({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL socketFind AISLADO / NO DOBLE-DIP: served declara `channel:\"socketFind\"` EXACTAMENTE 1× (ENCOUNTER_VARIANT_SURGE) + NINGUNA de las 17 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 12 peers byte-idénticos)",
     socketFindCount === 1 && noArcUsesSocket && pure.unchanged,
     `socketFindDecls=${socketFindCount} arcChannels=${JSON.stringify(arcChannels)} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave socketShards/socketFind/variantSurge + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.variantSurge().hero; window.__dev.variantSurge({ scoreProbe: { score: 4 } }); window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } }); window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noSockKey = !/"socketShards"\s*:/.test(saveBlob) && !/"(variantSurge|socketFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN socketShards/socketFind/variantSurge (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (los reagentes NO entran al fingerprint; 0 RNG/timer drift)",
     noSockKey && fpBefore === fpAfter, `noSockKey=${noSockKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge "Variante:❖" render: "Variante: T<n>" con variante activa EN radio, "Variante: —" sin variante + mov/combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let tCnt = 0, dashCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Variante: T") >= 0) tCnt++; if (t.indexOf("Variante: —") >= 0) dashCnt++; } return orig(t, x, y); };
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } });
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "stalker" } });
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });               // variante EN radio ⇒ badge "Variante: T2"
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 800));                        // warmup tras probes pesadas
    tCnt = 0; dashCnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1600) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const nearT = tCnt, nearDash = dashCnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.variantSurge({ tp: { tx: h.tx - 40, ty: h.ty } });          // OESTE limpio: variante fuera de radio ⇒ badge "Variante: —"
    tCnt = 0; dashCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const farT = tCnt, farDash = dashCnt;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    cx.fillText = orig;
    return { nearT, nearDash, farT, farDash, fps };
  });
  ok("L9 LIVE render: badge \"Variante: T<n>\" con variante activa EN radio (nearT>0, nearDash0) y \"Variante: —\" sin variante en radio (farDash>0, farT0); movimiento+combate sin crash; fps sano",
     badge.nearT > 0 && badge.nearDash === 0 && badge.farDash > 0 && badge.farT === 0 && badge.fps >= 50,
     `nearT=${badge.nearT} nearDash=${badge.nearDash} farT=${badge.farT} farDash=${badge.farDash} fps=${badge.fps}`);

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.variantSurge().hero; window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } }); window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "stalker" } }); window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA (score=Σ variantes vivas en radio, acumulado). Comparar A vs B daría falso-desync.
  // Test honesto: dos clientes FRESCOS en el MISMO shard ⇒ MISMO seed ⇒ MISMO mundo/ambiente (worldFingerprint byte-id) + MISMA inyección determinista ⇒ MISMA señal.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes inyectan el MISMO mob-variante + tp héroe a las MISMAS coords (variantSurgeScore = fn PURA de variantes vivas en radio).
  const A_TILE = { tx: 70, ty: 44 }, B_TILE = { tx: 71, ty: 44 }, HERO_TILE = { tx: 73, ty: 44 };  // variantes 2-3 tiles del héroe (~64-96px → en radio260)
  const readNS = async (pg) => await pg.evaluate((AT, BT, HT) => {
    window.__dev.variantSurge({ spawnVariant: { tx: AT.tx, ty: AT.ty, variant: "bastion" } });
    window.__dev.variantSurge({ spawnVariant: { tx: BT.tx, ty: BT.ty, variant: "stalker" } });
    window.__dev.variantSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.variantSurge();
    const vp = window.__dev.variantSurge({ variantProbe: true }).variantProbe;
    const lut = [0, 1, 3].map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, sockets: p.sockets }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, sockets: vm.sockets, vpScore: vp.score, vpCount: vp.count, lut, fp, enabled: vm.enabled };
  }, A_TILE, B_TILE, HERO_TILE);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  // variantMobCount ambiental NO se compara: nº AMBIENTAL de mobs-variante (sembrados por ENCOUNTER_VARIANTS). La señal determinista per-snapshot
  // (score/tier/sockets + variantProbe.score + LUT + worldFingerprint byte-id) es lo shard-consistente.
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.sockets === NC.sockets &&
                 NB.vpScore === NC.vpScore &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true && NB.tier === 2;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO mob-variante+héroe (2 clientes FRESCOS) ⇒ score/tier/sockets + variantProbe.score + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; variantMobCount ambiental excluido), enabled:true, T2",
     convOK, `B={score:${NB.score},tier:${NB.tier},sockets:${NB.sockets},vpScore:${NB.vpScore},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},sockets:${NC.sockets},vpScore:${NC.vpScore},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-variant.png") });

  // ═══ L11 — ⊥ ORTOGONALIDAD LIVE: mob-variante ⇒ variantSurge T≥1, pero afijo#74/evento#75/apex#73 lo IGNORAN + los 3 primos coexisten enabled:true ═══
  const orth = await pageA.evaluate(() => {
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;
    const evBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : null;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 5, ty: h.ty, variant: "bastion" } });  // ~160px, en radio
    const affixAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;  // mob-variante NO lleva afijo ⇒ sin cambio
    const evAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : null;                // mob NO es POI ⇒ sin cambio
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;                          // mob NO es jefe ⇒ tier 0
    const vm = window.__dev.variantSurge();
    const adEnabled = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const evEnabled = window.__dev.zoneEvent ? window.__dev.zoneEvent().enabled : null;
    const apEnabled = window.__dev.apex ? window.__dev.apex().enabled : null;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    return { vsTier: vm.tier, vsScore: vm.score, affixBefore, affixAfter, evBefore, evAfter, apexBefore, apexAfter, adEnabled, evEnabled, apEnabled };
  });
  const orthOK = orth.vsTier >= 1 && orth.vsScore >= 1 &&
    orth.affixAfter === orth.affixBefore && orth.evAfter === orth.evBefore && orth.apexAfter === 0 && orth.apexBefore === 0 &&
    orth.adEnabled === true && orth.evEnabled === true && orth.apEnabled === true;
  ok("L11 ★ ⊥ ORTOGONALIDAD LIVE: mob-variante ⇒ variantSurge T≥1, pero afijo#74 (dangerProbe sin cambio), evento#75 (zoneEvent sin cambio), apex#73 (tier 0) lo IGNORAN; affixDanger+zoneEvent+apex TODOS enabled:true (coexisten, 0 cross-contamination)",
     orthOK, JSON.stringify(orth));

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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, ENCOUNTER_VARIANT_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
