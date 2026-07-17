// CAS-2531 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para REMATE A DISTANCIA (LONGSHOT_SURGE.enabled:TRUE), EVO mecánica #88 (30º flag del arco).
// Mirror LIVE de la DARK QA CAS-2529 (tools/cas2529-longshot-dark-indep-qa.mjs). Patrón LIVE = cas2526 (PACK #87) / cas2520 (BLOOD #86) / cas2514 (CONTROL #85).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 9e9beb7f0958 (== flip CAS-2530 master 484cd93+b2cfdca == HTTP served; byte-verificado CTO 7/7 + CEO 2ª).
//
// EJE = DISTANCIA DE REMATE (geometría hero↔víctima al kill), health-agnóstico / velocidad-agnóstico ⊥29. enabled:TRUE ⇒ efecto ACTIVO en el build servido, SIN toggle in-memory:
//   - reachWeight(dist) = peso de UN remate por la DISTANCIA (px) hero↔víctima: far(≥farR 210)⇒2 (sniper), near(≥midR 110,<farR)⇒1 (stand-off), point-blank(<midR)⇒0 (melee).
//   - longshotScore(hero) = MAX reachWeight sobre los mobs VIVOS en radius(300) del héroe (el mejor long-shot disponible ahora). Server-auth (posiciones replicadas).
//   - TABLA por score: tiers[{min:1,charge:1},{min:2,charge:2}] ⇒ score<1→T0/0, score1→T1/1, score≥2→T2/2 (sub-cap reachBountyCap=2).
//   - canal FRESCO reachFind: rematar un mob DE LEJOS (reachWeight≥1 vía _reachPre muestreado en el TOP de killEnemy con la posición VIVA de la víctima) ⇒ +fichas de puntería (grantReachBounty a h.reachBounty, recurso TRANSITORIO fuera del save+fingerprint).
//     forageChargePreview / distProbe.forage = lo que banca el seam AHORA (canal reachFind) — la MISMA fn pura longshotForage que el seam invoca en killEnemy (línea 6072-6073). ANTI-AUTO-CONTEO N/A: el eje ES la víctima propia (su distancia geométrica), no densidad de vecindad.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.longshot (scoreProbe/distProbe/spawnShot/reachProbe/clearShot/tp) + affixSpawnKill (kill REAL point-blank ⇒ Δ0) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Remate:"/⌖ vía ctx.fillText.
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2531-longshot-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2531-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "9e9beb7f0958";   // build deployado por el flip LONGSHOT_SURGE CAS-2530 (== version.json esperado)
const PREV_LIVE = "df231e10b1de";      // build servido previo (#87 PACKHARVEST_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const FAR_R = 210, MID_R = 110, RADIUS = 300, CAP = 2;
const W_FAR = 2, W_NEAR = 1;
const TIERS = [{ min: 1, charge: 1 }, { min: 2, charge: 2 }]; // score<1→T0/0, score1→T1/1, score≥2→T2/2
const oWeight = (dist) => { const d = +dist || 0; if (d >= FAR_R) return W_FAR; if (d >= MID_R) return W_NEAR; return 0; };
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const EXPECT_SCORE = [0, 1, 2, 3, 9].map(s => ({ s, t: oTier(s), c: oCharge(s) }));
const EXPECT_DIST = [0, 109, 110, 209, 210, 300].map(d => ({ d, w: oWeight(d), f: oCharge(oWeight(d)) }));
// 29 flags del arco #59-#87 (LONGSHOT_SURGE es #88, el nuevo). Todas deben seguir served:true + LONGSHOT served:true ⇒ 30.
const ARC29 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAReach";
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
  await page.bringToFront();   // headless chromium throttla el rAF de páginas en 2º plano ⇒ el boot se estanca; foregroundear antes de bootear
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #87 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.longshot && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.longshot/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 29 flags arco #59-#87 served TRUE + LONGSHOT_SURGE #88 served TRUE ⇒ 30 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC29.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const lsLive = flag("LONGSHOT_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 29 flags arco #59-#87 served true (intactas) + LONGSHOT_SURGE #88 served true ⇒ 30 flags LIVE, 0 perdidas",
     arcAllOn && lsLive && ARC29.length === 29, `longshot=${flag("LONGSHOT_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params LONGSHOT_SURGE served — canal FRESCO reachFind + sub-cap reachBountyCap:2 + radius300 + farR210 + midR110 + reachWeights + tiers
  const channelLive = /channel:\s*"reachFind"/.test(cfgSrc);
  const capLive = /reachBountyCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("LONGSHOT_SURGE[\\s\\S]*?radius:\\s*300").test(cfgSrc);
  const farLive = /farR:\s*210/.test(cfgSrc);
  const midLive = /midR:\s*110/.test(cfgSrc);
  const wLive = /reachWeights:\s*\{\s*far:\s*2,\s*near:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params LONGSHOT_SURGE served: channel reachFind + reachBountyCap 2 + radius 300 + farR 210 + midR 110 + reachWeights{far:2,near:1}",
     channelLive && capLive && radLive && farLive && midLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} farR=${farLive} midR=${midLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel reachFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.longshot());
  ok("L3 LIVE default: __dev.longshot().enabled === TRUE (flip aplicado), channel reachFind, gExists false (STATELESS, G.reachBounty null), score/charge 0 en aire limpio + knobs served (radius300/farR210/midR110/cap2)",
     st.enabled === true && st.channel === "reachFind" && st.gExists === false && st.score === 0 && st.charge === 0 &&
     st.radius === RADIUS && st.farR === FAR_R && st.midR === MID_R && st.cap === CAP,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} score=${st.score} charge=${st.charge} radius=${st.radius} farR=${st.farR} midR=${st.midR} cap=${st.cap}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/charge + distProbe.weight/forage == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.longshot({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const dtab = await pageA.evaluate((cases) => cases.map(c => window.__dev.longshot({ distProbe: { dist: c.d } }).distProbe), EXPECT_DIST);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.c) && tab.every(r => r.charge <= CAP);
  const dtabOK = EXPECT_DIST.every((c, i) => dtab[i] && dtab[i].weight === c.w && dtab[i].forage === c.f) && dtab.every(r => r.forage <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/charge (score<1→T0/0, 1→T1/1, ≥2→T2/2) + distProbe.weight/forage (dist<110→0, [110,210)→w1/f1, ≥210→w2/f2) == oracle byte-exacto + sub-cap reachBountyCap=2",
     tabOK && dtabOK, `scores=${JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.c], game: tab[i] ? [tab[i].tier, tab[i].charge] : null })))} dists=${JSON.stringify(EXPECT_DIST.map((c, i) => ({ d: c.d, mine: [c.w, c.f], game: dtab[i] ? [dtab[i].weight, dtab[i].forage] : null })))}`);

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnShot inyecta un mob REAL a G.enemies; reachProbe lee la DISTANCIA real; re-derivo el peso YO (mi oráculo) y comparo al served (FAR y point-blank) ═══
  const sa = await pageA.evaluate(() => {
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });               // héroe a un tile aislado
    const far = window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });   // mob FAR (+8 tiles ≈ 256px ≥ farR 210)
    const rpFar = window.__dev.longshot({ reachProbe: true }).reachProbe;
    window.__dev.longshot({ clearShot: true });
    const pb = window.__dev.longshot({ spawnShot: { tx: 200, ty: 150 } });     // mob POINT-BLANK (mismo tile del héroe)
    const rpPb = window.__dev.longshot({ reachProbe: true }).reachProbe;
    window.__dev.longshot({ clearShot: true });
    return { farDist: far.spawnShot.dist, farW: far.spawnShot.weight, rpFarScore: rpFar.score, rpFarCount: rpFar.count, rpFarDist: rpFar.mobs[0] ? rpFar.mobs[0].dist : -1,
      pbDist: pb.spawnShot.dist, pbW: pb.spawnShot.weight, rpPbScore: rpPb.score };
  });
  const myFarW = oWeight(sa.farDist), myPbW = oWeight(sa.pbDist);
  ok("L5 ★ REAL SERVER-AUTH: spawnShot→G.enemies (mob REAL estacionario), reachProbe lee DISTANCIA real; mi oráculo re-derivado(dist)==peso served — FAR(≥210)⇒w2/score2, POINT-BLANK(<110)⇒w0/score0 (geometría hero↔víctima, health/velocidad-agnóstico)",
     sa.farDist >= FAR_R && sa.farW === myFarW && myFarW === 2 && sa.rpFarScore === 2 && sa.rpFarCount === 1 &&
     sa.pbDist < MID_R && sa.pbW === myPbW && myPbW === 0 && sa.rpPbScore === 0,
     `farDist=${sa.farDist} farW=${sa.farW}(oracle ${myFarW}) rpFarScore=${sa.rpFarScore} rpFarCount=${sa.rpFarCount} pbDist=${sa.pbDist} pbW=${sa.pbW}(oracle ${myPbW}) rpPbScore=${sa.rpPbScore}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): mob FAR en radio ⇒ score2/T2/charge2 + preview2 + tag ⌖ + distProbe.forage(grant)=2; point-blank ⇒ 0/T0/tag''/forage0 ═══
  const effect = await pageA.evaluate(() => {
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });        // FAR
    const nearVm = window.__dev.longshot();                            // score EN VIVO (mejor long-shot en radio300)
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ spawnShot: { tx: 200, ty: 150 } });        // POINT-BLANK (mismo tile)
    const pbVm = window.__dev.longshot();
    window.__dev.longshot({ clearShot: true });
    // aire limpio: sin mob en radio ⇒ 0
    const airVm = window.__dev.longshot();
    return { enabled: nearVm.enabled,
      far: { score: nearVm.score, tier: nearVm.tier, charge: nearVm.charge, preview: nearVm.forageChargePreview, tag: nearVm.tag },
      pb: { score: pbVm.score, tier: pbVm.tier, charge: pbVm.charge, preview: pbVm.forageChargePreview, tag: pbVm.tag },
      air: { score: airVm.score, tier: airVm.tier, charge: airVm.charge, preview: airVm.forageChargePreview, tag: airVm.tag } };
  });
  const effOK = effect.enabled === true
    && effect.far.score === 2 && effect.far.tier === 2 && effect.far.charge === 2 && effect.far.preview === 2 && effect.far.tag === "⌖"
    && effect.pb.score === 0 && effect.pb.tier === 0 && effect.pb.charge === 0 && effect.pb.preview === 0 && effect.pb.tag === ""
    && effect.air.score === 0 && effect.air.tier === 0 && effect.air.charge === 0 && effect.air.tag === ""
    && effect.far.tier === oTier(effect.far.score) && effect.far.charge === oCharge(effect.far.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): mob FAR (≥210px) en radio ⇒ score2/T2/charge2 + forageChargePreview 2 (lo que banca el kill vía reachFind) + tag ⌖; mob point-blank (<110px) ⇒ 0/T0/preview0/tag''; aire limpio ⇒ 0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE REAL-KILL point-blank (affixSpawnKill→killEnemy en h.x,h.y ⇒ dist≈0): kill point-blank NO forrajea ⇒ Δ reachBounty 0.
  //   El seam usa _reachPre=reachWeight(dist víctima) muestreado en el TOP; la víctima nace AL PIE del héroe (dist 0 ⇒ peso 0) ⇒ un remate melee NO banca fichas de puntería. ═══
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.longshot().hero.reachBounty | 0;
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });               // tile aislado limpio
    const preScore = window.__dev.longshot({ reachProbe: true }).reachProbe.score;
    const c0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");         // spawn+killEnemy REAL en el héroe (dist víctima ≈ 0 ⇒ point-blank)
    const deltaPb = ct() - c0;
    window.__dev.longshot({ clearShot: true });
    return { preScore, deltaPb };
  });
  const antiOK = anti.preScore === 0 && anti.deltaPb === 0;
  ok("L6b ★ REAL-KILL point-blank (affixSpawnKill→killEnemy, víctima al pie del héroe ⇒ dist≈0): un remate MELEE (point-blank) NO banca fichas de puntería ⇒ Δ reachBounty 0 (el seam usa _reachPre=reachWeight(dist víctima)=0 ⇒ rama sin grant; hace falta abatir DE LEJOS para forrajear)",
     antiOK, JSON.stringify(anti));

  // ═══ L7 — SUB-CAP propio reachBountyCap=2: ningún score produce charge>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.longshot({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals) }; });
  ok("L7 ★ SUB-CAP reachBountyCap: ningún score produce charge>2 (sweep score∈[0,40]) (fuente única, sub-cap propio, no stacking)",
     capChk.max <= 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL reachFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const reachFindCount = chanDecls.filter(c => c === "reachFind").length;
  const arcChannels = ARC29.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesReach = arcChannels.every(c => c !== "reachFind");
  ok("L8 ★ CANAL reachFind AISLADO / NO DOBLE-DIP: served declara `channel:\"reachFind\"` EXACTAMENTE 1× (LONGSHOT_SURGE) + NINGUNA de las 29 flags del arco lo usa (canal FRESCO)",
     reachFindCount === 1 && noArcUsesReach, `reachFindDecls=${reachFindCount} arcUsesReach=${!noArcUsesReach}`);

  // ═══ L8b — STATELESS: save sin clave reach* + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { window.__dev.longshot({ clearShot: true }); window.__dev.longshot({ tp: { tx: 200, ty: 150 } }); window.__dev.longshot({ scoreProbe: { score: 2 } }); window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } }); window.__dev.longshot({ reachProbe: true }); window.__dev.longshot({ clearShot: true }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"(reachFind|reachBounty)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN reachFind/reachBounty (h.reachBounty TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (fichas NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Remate:" render (ctx.fillText) con mob FAR EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Remate:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con un mob FAR fresco en radio ⇒ tag + glifo dibujado
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });
    const nearTag = window.__dev.longshot().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR/aire limpio — sin mob en radio ⇒ tag ''
    window.__dev.longshot({ clearShot: true });
    const airTag = window.__dev.longshot().tag;
    cx.fillText = orig;
    return { nearTag, nearGlyph, airTag, fps };
  });
  ok("L9 LIVE render: con mob FAR EN radio parado ⇒ vm.tag (Remate:/⌖) + glifo dibujado (nearGlyph>0); aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.airTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} airTag="${badge.airTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥29: mob FAR SANO SUELTO ⇒ remate→T2 MIENTRAS pack#87/blood#86/control#85/skirmish#84 IGNORAN (geometría hero↔víctima ≠ clustering/vida/CC/alcance-mob) ═══
  const diff = await pageA.evaluate(() => {
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: 200, ty: 150 } });
    window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } });        // 1 orco melee sano SUELTO, FAR (dentro del radio260 de los peers)
    const ls = window.__dev.longshot();
    const peers = {
      pak: (window.__dev.packHarvest ? (window.__dev.packHarvest().score || 0) : 0),        // manada #87 (clustering inter-mob: 1 solo mob ⇒ 0 vecinos ⇒ 0)
      blo: (window.__dev.bloodHarvest ? (window.__dev.bloodHarvest().score || 0) : 0),       // siega #86 (mob a plena vida ⇒ 0)
      ctr: (window.__dev.controlHarvest ? (window.__dev.controlHarvest().score || 0) : 0),   // control #85 (sin CC ⇒ 0)
      ski: (window.__dev.skirmishLine ? (window.__dev.skirmishLine().score || 0) : 0),       // escaramuza #84 (orco melee, no ranged ⇒ 0)
    };
    const pakOn = window.__dev.packHarvest ? window.__dev.packHarvest().enabled : null;
    const bloOn = window.__dev.bloodHarvest ? window.__dev.bloodHarvest().enabled : null;
    const ctrOn = window.__dev.controlHarvest ? window.__dev.controlHarvest().enabled : null;
    window.__dev.longshot({ clearShot: true });
    return { ls: { score: ls.score, tier: ls.tier, charge: ls.charge }, peers, pakOn, bloOn, ctrOn };
  });
  const diffOK = diff.ls.score === 2 && diff.ls.tier === 2 && diff.ls.charge === 2 &&
    diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 && diff.peers.ski === 0 &&
    diff.pakOn === true && diff.bloOn === true && diff.ctrOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥29: mob FAR SANO SUELTO ⇒ remate score2/T2/charge2 MIENTRAS manada#87/siega#86/control#85/escaramuza#84 = 0 (geometría hero↔víctima ⊥ clustering/vida/CC/alcance-del-mob); vecinos LIVE enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { window.__dev.longshot({ clearShot: true }); window.__dev.longshot({ tp: { tx: 200, ty: 150 } }); window.__dev.longshot({ spawnShot: { tx: 208, ty: 150 } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan el MISMO mob FAR + tp héroe a las MISMAS coords.
  const HT = { tx: 200, ty: 150 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: HT.tx, ty: HT.ty } });
    const shot = window.__dev.longshot({ spawnShot: { tx: HT.tx + 8, ty: HT.ty } });
    const rp = window.__dev.longshot({ reachProbe: true }).reachProbe;
    const vm = window.__dev.longshot();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.longshot({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const dlut = [0, 110, 210].map(d => { const p = window.__dev.longshot({ distProbe: { dist: d } }).distProbe; return { d, w: p.weight, f: p.forage }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const charges = vm.hero ? (vm.hero.reachBounty | 0) : null;
    window.__dev.longshot({ clearShot: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag,
      rpScore: rp.score, rpCount: rp.count, rpDist: rp.mobs[0] ? rp.mobs[0].dist : -1, shotDist: shot.spawnShot.dist,
      lut, dlut, fp, fpLen: fp.length, enabled: vm.enabled, charges };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = 2;   // mob FAR único (+8 tiles ≈ 256px ≥ farR): w2 ⇒ score 2 ⇒ T2 charge 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.charge === NC.charge && NB.preview === NC.preview &&
                 NB.rpScore === NC.rpScore && NB.rpCount === NC.rpCount && NB.rpDist === NC.rpDist && NB.shotDist === NC.shotDist && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && JSON.stringify(NB.dlut) === JSON.stringify(NC.dlut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.charge === oCharge(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO mob FAR+héroe (2 clientes FRESCOS) ⇒ score/tier/charge + reachProbe(score,count,dist) + spawnShot.dist + LUT scoreProbe/distProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=2→T2/charge2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},charge:${NB.charge},prev:${NB.preview},rpSc:${NB.rpScore},rpCt:${NB.rpCount},rpD:${NB.rpDist},shotD:${NB.shotDist},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},charge:${NC.charge},prev:${NC.preview},rpSc:${NC.rpScore},rpCt:${NC.rpCount},rpD:${NC.rpDist},shotD:${NC.shotDist},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},charge:${oCharge(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — CARGAS PER-HERO (no compartidas, no dup entre clientes): h.reachBounty transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"reachBounty"\s*:/.test(NB.fp) && !/"reachBounty"\s*:/.test(NC.fp) && typeof NB.charges === "number" && typeof NC.charges === "number";
  ok("L10c ★ CARGAS PER-HERO (no shared / no dup 2-cliente): h.reachBounty transitorio per-hero, FUERA del save+worldFingerprint ⇒ las fichas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_charges=${NB.charges} C_charges=${NC.charges} fpHasChargesKey=${/"reachBounty"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-longshot.png") });

  // ═══ L11 — RECONEXIÓN mid-remate STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin reachBounty + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.longshot", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.longshot();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2].map(sc => { const p = window.__dev.longshot({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, c: p.charge }; });
    window.__dev.longshot({ clearShot: true });
    window.__dev.longshot({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.longshot({ spawnShot: { tx: HT.tx + 8, ty: HT.ty } });
    const vm = window.__dev.longshot();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.longshot({ clearShot: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"(reachFind|reachBounty)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-remate STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin reachBounty/reachFind + LUT idéntica + worldFingerprint idéntico + re-sync geometría (T2/tag Remate:) (0 drift, 0 persistencia indebida de fichas)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), fpMatch: reconn.fp === fpB_pre, tier: reconn.tier, tag: reconn.tag }));

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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, LONGSHOT_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#88 30º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
