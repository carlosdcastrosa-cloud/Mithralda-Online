// CAS-2487 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para CAMPO DE CARNICERÍA (CARNAGE_FIELD_SURGE.enabled:TRUE), EVO mecánica #80 (22º flag del arco).
// Mirror LIVE de la DARK QA CAS-2482/2483 (tools/cas2482-carnagefield-dark-observable-qa.mjs). Patrón LIVE = cas2480 (SPOILS_FIELD_SURGE #79).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = a6cac7667834 (== flip CAS-2484 master 823380a+bdf1556 == deploy tools/cas2484-deploy.mjs == gh-pages 4e5d4c81 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2482): enabled:TRUE ⇒ el efecto CARNAGE_FIELD_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - carnageFieldScore(h)=Σ carnageWeights[rango] sobre los cadáveres de G.corpses dentro de radius260 (server-auth; poblados DETERMINISTA en killEnemy, envejecidos CORPSE_LIFE=2.6s).
//   - TABLA por score: score≥3→T2/bone2, [1,3)→T1/bone1, 0→T0/bone0 (sub-cap carnageBoneCap=2).
//   - canal FRESCO boneFind: rematar mobs MIENTRAS el suelo de la vecindad está DENSO en cadáveres frescos ⇒ +fichas de osario (grantBone a h.boneTokens, recurso TRANSITORIO fuera del save+fingerprint).
//     forageBonePreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo.
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): suelo limpio (score 0) ⇒ forrajeo 0; matanza en ráfaga sobre campo denso (score≥3) ⇒ forrajea. `_carnagePre` muestreado en el TOP de killEnemy ANTES de que el kill empuje su propio cadáver.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.carnageField (scoreProbe/spawnCorpse/carnageProbe/clearCorpses/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Osario:" vía ctx.fillText.
// Run: node tools/cas2487-carnagefield-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2487-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "a6cac7667834";   // build deployado por el flip CARNAGE_FIELD_SURGE CAS-2484 (== version.json esperado)
const PREV_LIVE = "047bcd0e2e5f";      // build servido previo (#79 SPOILS_FIELD_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// carnageWeights {boss:3,champion:2,normal:1}; tiers [{min:1,bone:1},{min:3,bone:2}]; carnageBoneCap 2; radius 260; TS 32.
const TS = 32;
const RADIUS = 260;
const WEIGHTS = { boss: 3, champion: 2, normal: 1 };   // rango ausente ⇒ 1 (fallback)
const TIERS = [{ min: 1, bone: 1 }, { min: 3, bone: 2 }];
const CAP = 2;
const myWeight = (rank) => (WEIGHTS[rank] != null ? WEIGHTS[rank] : 1);
const myTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const myBone = (score) => { const t = myTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].bone); };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // distancia misma-fila px
const EXPECT_SCORE = [0, 1, 2, 3, 4, 6, 12, 99].map(s => ({ s, t: myTier(s), b: myBone(s) }));
// 21 flags del arco #59-#79 (CARNAGE_FIELD_SURGE es #80, el nuevo). Todas deben seguir served:true.
const ARC21 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QACarnage";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #79 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.carnageField/spoilsField/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 21 flags arco #59-#79 served TRUE + CARNAGE_FIELD_SURGE #80 served TRUE ⇒ 22 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC21.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsLive = flag("CARNAGE_FIELD_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 21 flags arco #59-#79 served true (intactas) + CARNAGE_FIELD_SURGE #80 served true ⇒ 22 flags LIVE, 0 perdidas",
     arcAllOn && cfsLive && ARC21.length === 21, `carnage=${flag("CARNAGE_FIELD_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params CARNAGE_FIELD_SURGE served — canal FRESCO boneFind + sub-cap carnageBoneCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"boneFind"/.test(cfgSrc);
  const capLive = /carnageBoneCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("CARNAGE_FIELD_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /carnageWeights:\s*\{\s*boss:\s*3,\s*champion:\s*2,\s*normal:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params CARNAGE_FIELD_SURGE served: channel boneFind + carnageBoneCap 2 + radius 260 + carnageWeights{boss:3,champion:2,normal:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel boneFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.carnageField());
  ok("L3 LIVE default: __dev.carnageField().enabled === TRUE (flip aplicado), channel boneFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "boneFind" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/bone == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.carnageField({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].bone === c.b) && tab.every(r => r.bone <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/bone == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap carnageBoneCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.b], game: [tab[i].tier, tab[i].bone] }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnCorpse inyecta cadáver REAL en G.corpses; carnageProbe lee score REAL ═══
  //   per-rango weight (boss=3, champion=2, normal=1) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const ranks = ["boss", "champion", "normal"];
  const perRank = await pageA.evaluate((rr) => {
    const out = [];
    for (const r of rr) {
      window.__dev.carnageField({ clearCorpses: true });
      const h = window.__dev.carnageField().hero;
      const sc = window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 2, ty: h.ty, rank: r } }).spawnCorpse;   // 64px, en radio
      window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
      const pr = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
      window.__dev.carnageField({ clearCorpses: true });
      out.push({ rank: r, spawnWeight: sc.weight, probeScore: pr.score, probeCount: pr.count, probeRank: pr.corpses[0] ? pr.corpses[0].rank : null, probeWeight: pr.corpses[0] ? pr.corpses[0].weight : null });
    }
    return out;
  }, ranks);
  const rad = await pageA.evaluate(() => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.carnageField({ clearCorpses: true });
      const h = window.__dev.carnageField().hero;
      window.__dev.carnageField({ spawnCorpse: { tx: h.tx + d, ty: h.ty, rank: "normal" } });
      window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
      res[tag] = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
      window.__dev.carnageField({ clearCorpses: true });
    }
    return res;
  });
  const perRankOK = perRank.every(r => r.spawnWeight === myWeight(r.rank) && r.probeWeight === myWeight(r.rank) && r.probeScore === myWeight(r.rank) && r.probeCount === 1 && r.probeRank === r.rank);
  const radOK = rad.in > 0 && rad.out === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnCorpse→G.corpses, carnageProbe lee score REAL; INDEP per-rango boss=+3 champion=+2 normal=+1 == my carnageWeights[rank]; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     perRankOK && radOK, `perRank=${JSON.stringify(perRank.map(r => ({ r: r.rank, mine: myWeight(r.rank), game: r.probeWeight, sc: r.probeScore })))} rad=${JSON.stringify(rad)} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): campo denso ⇒ +bone por tier; suelo limpio ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h0 = window.__dev.carnageField().hero;
    const RX = h0.tx + 120, RY = h0.ty + 50;
    window.__dev.carnageField({ clearCorpses: true });
    // CAMPO DENSO: boss(3)+champion(2)=5 ⇒ score≥3 ⇒ T2/bone2
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 2, ty: RY, rank: "boss" } });        // ~64px
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "champion" } });    // ~96px
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });                                   // héroe en el campo denso
    const nearVm = window.__dev.carnageField();
    const nearBank = nearVm.forageBonePreview;   // lo que banca UN kill ahora mismo (canal boneFind)
    // SUELO LIMPIO: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin cadáveres en radio ⇒ T0/+0 control
    window.__dev.carnageField({ tp: { tx: RX - 40, ty: RY } });
    const farVm = window.__dev.carnageField();
    window.__dev.carnageField({ clearCorpses: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, bone: nearVm.bone, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, bone: farVm.bone, preview: farVm.forageBonePreview, tag: farVm.tag },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score === 5 && effect.near.tier === 2 && effect.near.bone === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.bone === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === myTier(effect.near.score) && effect.near.bone === myBone(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): campo denso boss+champion (score 5) en radio ⇒ bone+2/T2 + forageBonePreview 2 (lo que banca el kill) + tag; héroe en suelo limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): suelo limpio ⇒ 0; campo denso ⇒ 2 ═══
  //   Refleja `_carnagePre` (snapshot en el TOP de killEnemy ANTES de que el kill empuje su propio cadáver): densidad PRE-kill 0 ⇒ 0 fichas.
  const anti = await pageA.evaluate(() => {
    const bt = () => window.__dev.carnageField().hero.boneTokens | 0;
    // A: kill solitario sobre SUELO LIMPIO (tile remoto) ⇒ _carnagePre=0 ⇒ 0 forage
    window.__dev.carnageField({ clearCorpses: true });
    const h0 = window.__dev.carnageField().hero;
    window.__dev.carnageField({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    const btA0 = bt();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // spawn+killEnemy REAL en el héroe (suelo limpio)
    const deltaA = bt() - btA0;
    // B: kill DENTRO de un campo de carnicería denso ⇒ _carnagePre≥3 ⇒ forage T2/cap2
    window.__dev.carnageField({ clearCorpses: true });
    const h1 = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h1.tx, ty: h1.ty, rank: "boss" } });        // weight3 en el héroe ⇒ score3
    window.__dev.carnageField({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    const btB0 = bt();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL en medio del campo de cadáveres
    const deltaB = bt() - btB0;
    window.__dev.carnageField({ clearCorpses: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 3 && anti.deltaB === myBone(anti.baseScoreB) && anti.deltaB === 2;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): suelo limpio (pre=0) ⇒ Δbone 0 (rematar sobre suelo limpio NO da forraje); campo denso (pre≥3) ⇒ Δbone == my LUT bone=2 (refleja _carnagePre pre-kill)",
     antiOK, JSON.stringify({ ...anti, myLut: myBone(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio carnageBoneCap=2: ningún score produce bone>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe.bone);
    return { max: Math.max(...vals), cap: window.__dev.carnageField().cap }; });
  ok("L7 ★ SUB-CAP carnageBoneCap: ningún score produce bone>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL boneFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const boneFindCount = chanDecls.filter(c => c === "boneFind").length;
  const arcChannels = ARC21.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesBone = arcChannels.every(c => c !== "boneFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.carnageField(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview,
      flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.carnageField({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL boneFind AISLADO / NO DOBLE-DIP: served declara `channel:\"boneFind\"` EXACTAMENTE 1× (CARNAGE_FIELD_SURGE) + NINGUNA de las 21 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 16 peers byte-idénticos)",
     boneFindCount === 1 && noArcUsesBone && pure.unchanged,
     `boneFindDecls=${boneFindCount} arcUsesBone=${!noArcUsesBone} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave boneTokens/boneFind/carnageField + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.carnageField().hero; window.__dev.carnageField({ scoreProbe: { score: 4 } }); window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 200, ty: h.ty + 80, rank: "boss" } }); window.__dev.carnageField({ clearCorpses: true }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"boneTokens"\s*:/.test(saveBlob) && !/"(carnageField|boneFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN boneTokens/carnageField/boneFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las fichas NO entran al fingerprint; cadáveres de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Osario:" render (ctx.fillText) con campo denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Osario:") >= 0) glyphCnt++; return orig(t, x, y); };
    const h0 = window.__dev.carnageField().hero;
    const RX = h0.tx + 130, RY = h0.ty + 68;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con campo denso fresco en radio ⇒ tag + glifo dibujado
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 2, ty: RY, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "champion" } });
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const nearTag = window.__dev.carnageField().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ suelo limpio ⇒ tag ''
    window.__dev.carnageField({ tp: { tx: RX - 40, ty: RY } });
    const farTag = window.__dev.carnageField().tag;
    window.__dev.carnageField({ clearCorpses: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  });
  ok("L9 LIVE render: con campo denso EN radio parado ⇒ vm.tag (Osario:) + glifo dibujado (nearGlyph>0); héroe en suelo limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥21: inyectar cadáveres ⇒ carnicería→T2 MIENTRAS botín#79/furia#78/hazard#77/variante#76 IGNORAN + lootQuality#63/#68 sin cambio ═══
  const diff = await pageA.evaluate(() => {
    const h0 = window.__dev.carnageField().hero;
    const RX = h0.tx - 175, RY = h0.ty + 74;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const s0 = window.__dev.carnageField();
    const base = s0.score;
    const spoB = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrB = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazB = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varB = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootB = s0.lootQualityFloor;
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 2, ty: RY, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "champion" } });   // boss3+champ2 = 5 ⇒ T2
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const s1 = window.__dev.carnageField();
    const spoA = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrA = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazA = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varA = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootA = s1.lootQualityFloor;
    const soOn = window.__dev.spoilsField ? window.__dev.spoilsField().enabled : null;
    const enOn = window.__dev.enrageSurge ? window.__dev.enrageSurge().enabled : null;
    const hzOn = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    const vsOn = window.__dev.variantSurge ? window.__dev.variantSurge().enabled : null;
    window.__dev.carnageField({ clearCorpses: true });
    return { base, score: s1.score, tier: s1.tier, bone: s1.bone,
      spoB, spoA, enrB, enrA, hazB, hazA, varB, varA, lootB, lootA, soOn, enOn, hzOn, vsOn };
  });
  const diffOK = diff.score - diff.base === 5 && diff.tier === 2 && diff.bone === 2 &&
    diff.spoA === diff.spoB && diff.enrA === diff.enrB && diff.hazA === diff.hazB && diff.varA === diff.varB && diff.lootA === diff.lootB &&
    diff.soOn === true && diff.enOn === true && diff.hzOn === true && diff.vsOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥21: inyectar cadáveres ⇒ carnicería Δ+5→T2 MIENTRAS botín#79/furia#78/hazard#77/variante#76 IGNORAN (score sin cambio) + lootQuality#63/#68 sin cambio; todos los vecinos enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.carnageField().hero; const RX = h.tx + 130, RY = h.ty + 80; window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ spawnCorpse: { tx: RX + 2, ty: RY, rank: "boss" } }); window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "champion" } }); window.__dev.carnageField({ tp: { tx: RX, ty: RY } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian cadáveres, inyectan el MISMO campo (boss+normal) + tp héroe a las MISMAS coords.
  const CA = { tx: 60, ty: 40 }, CB = { tx: 61, ty: 40 }, HT = { tx: 63, ty: 40 };   // cadáveres 2-3 tiles al oeste del héroe (en radio)
  const readNS = async (pg) => await pg.evaluate((CA, CB, HT) => {
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: CA.tx, ty: CA.ty, rank: "boss" } });     // 3
    window.__dev.carnageField({ spawnCorpse: { tx: CB.tx, ty: CB.ty, rank: "normal" } });   // 1
    window.__dev.carnageField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.carnageField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, b: p.bone }; });
    const sp = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const tokens = vm.hero ? vm.hero.boneTokens : null;
    window.__dev.carnageField({ clearCorpses: true });
    return { score: vm.score, tier: vm.tier, bone: vm.bone, preview: vm.forageBonePreview, tag: vm.tag, spScore: sp.score, spCount: sp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, tokens };
  }, CA, CB, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = myWeight("boss") + myWeight("normal");   // 4 ⇒ T2 bone 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.bone === NC.bone && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === myTier(expScore) && NB.bone === myBone(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMOS cadáveres+héroe (2 clientes FRESCOS) ⇒ score/tier/bone + carnageProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=4→T2/bone2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},bone:${NB.bone},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},bone:${NC.bone},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${myTier(expScore)},bone:${myBone(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — FICHAS PER-HERO (no compartidas, no dup entre clientes): h.boneTokens transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"boneTokens"\s*:/.test(NB.fp) && !/"boneTokens"\s*:/.test(NC.fp) && typeof NB.tokens === "number" && typeof NC.tokens === "number";
  ok("L10c ★ FICHAS PER-HERO (no shared / no dup 2-cliente): h.boneTokens transitorio per-hero, FUERA del save+worldFingerprint ⇒ las fichas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_tokens=${NB.tokens} C_tokens=${NC.tokens} fpHasTokenKey=${/"boneTokens"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-carnagefield.png") });

  // ═══ L11 — RECONEXIÓN mid-campo STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin boneTokens + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.carnageField", { timeout: 8000 });
  const reconn = await pageB.evaluate((CA, CB, HT) => {
    const s = window.__dev.carnageField();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 3, 6].map(sc => { const p = window.__dev.carnageField({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, b: p.bone }; });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: CA.tx, ty: CA.ty, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: CB.tx, ty: CB.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.carnageField();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.carnageField({ clearCorpses: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"boneTokens"\s*:|"(carnageField|boneFind)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, CA, CB, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-campo STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin boneTokens/boneFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Osario:) (0 drift, 0 persistencia indebida de fichas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, CARNAGE_FIELD_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#80 22º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
