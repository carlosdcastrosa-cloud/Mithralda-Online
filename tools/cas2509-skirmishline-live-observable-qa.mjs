// CAS-2509 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para LÍNEA DE ESCARAMUZA (SKIRMISH_LINE_SURGE.enabled:TRUE), EVO mecánica #84 (26º flag del arco).
// Mirror LIVE de la DARK QA CAS-2506 (tools/cas2506-skirmishline-dark-indep-qa.mjs). Patrón LIVE = cas2503 (BLIGHT_HARVEST_SURGE #83) / cas2496 (MAELSTROM #82).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 5e2e9945a645 (== flip CAS-2507 master 2e7f31d+a18fa01 == gh-pages e31e2243 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2506): enabled:TRUE ⇒ el efecto SKIRMISH_LINE_SURGE está ACTIVO en el build servido, SIN toggle in-memory:
//   - skirmishLineScore(h)=Σ skirmishWeight(e) sobre los mobs A-DISTANCIA VIVOS de G.enemies cuyo CENTRO ∈ radius260 (server-auth; e.tpl.ranged/e.tpl.range template ETPL).
//   - skirmishWeight(e): melee (e.tpl.ranged falsy)=0 · corto (range<240)=1 · artillería largo alcance (range≥240)=2. FILTRA !e.dead.
//   - TABLA por score: tiers[{min:2,mark:1},{min:4,mark:2}] ⇒ score<2→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap skirmishMarkCap=2).
//   - canal FRESCO skirmishFind: rematar un mob MIENTRAS el héroe está DENTRO de una LÍNEA de mobs a-distancia densa ⇒ +marcas de escaramuza (grantSkirmish a h.skirmishMarks, recurso TRANSITORIO fuera del save+fingerprint).
//     forageMarkPreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo. Melee-only NO rinde (peso 0).
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; kill DENTRO de una línea a-distancia densa (score≥4) ⇒ forrajea. `_skirmPre` muestreado en el TOP de killEnemy tras e.dead=true.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.skirmishLine (scoreProbe/spawnSkirmish/skirmishProbe/clearSkirmish/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Escaramuza:"/➶ vía ctx.fillText.
// Run: node tools/cas2509-skirmishline-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2509-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "5e2e9945a645";   // build deployado por el flip SKIRMISH_LINE_SURGE CAS-2507 (== version.json esperado)
const PREV_LIVE = "27c790487016";      // build servido previo (#83 BLIGHT_HARVEST_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const TS = 32, RADIUS = 260, R2 = RADIUS * RADIUS, LONGR = 240, CAP = 2;
const WLONG = 2, WSHORT = 1;                                  // artillería largo alcance=2, corto=1, melee=0
const TIERS = [{ min: 2, mark: 1 }, { min: 4, mark: 2 }];     // score<2→T0/0, [2,3]→T1/1, ≥4→T2/2
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oMark = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].mark); };
const oWeight = (ranged, range, dead) => { if (dead || !ranged) return 0; return (range >= LONGR) ? WLONG : WSHORT; };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= R2;   // Δ8=256px IN, Δ9=288px OUT
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 8, 99].map(s => ({ s, t: oTier(s), m: oMark(s) }));
// 25 flags del arco #59-#83 (SKIRMISH_LINE_SURGE es #84, el nuevo). Todas deben seguir served:true.
const ARC25 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QASkirm";
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

// ancla el héroe a un tile fijo (tp-snap a centro), limpia mobs de prueba; devuelve el tile del héroe
async function anchorHero(page, tx, ty) {
  return await page.evaluate((tx, ty) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx, ty } });
    return window.__dev.skirmishLine().hero;
  }, tx, ty);
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #83 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.skirmishLine && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.skirmishLine/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 25 flags arco #59-#83 served TRUE + SKIRMISH_LINE_SURGE #84 served TRUE ⇒ 26 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC25.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const slsLive = flag("SKIRMISH_LINE_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 25 flags arco #59-#83 served true (intactas) + SKIRMISH_LINE_SURGE #84 served true ⇒ 26 flags LIVE, 0 perdidas",
     arcAllOn && slsLive && ARC25.length === 25, `skirmish=${flag("SKIRMISH_LINE_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params SKIRMISH_LINE_SURGE served — canal FRESCO skirmishFind + sub-cap skirmishMarkCap:2 + radio 260 + longR 240 + weights long2/short1
  const channelLive = /channel:\s*"skirmishFind"/.test(cfgSrc);
  const capLive = /skirmishMarkCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("SKIRMISH_LINE_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const longRLive = /longR:\s*240/.test(cfgSrc);
  const wLive = /skirmishWeights:\s*\{\s*long:\s*2,\s*short:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params SKIRMISH_LINE_SURGE served: channel skirmishFind + skirmishMarkCap 2 + radius 260 + longR 240 + skirmishWeights{long:2,short:1}",
     channelLive && capLive && radLive && longRLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} longR=${longRLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel skirmishFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.skirmishLine());
  ok("L3 LIVE default: __dev.skirmishLine().enabled === TRUE (flip aplicado), channel skirmishFind, gExists false (STATELESS, 0 mob de prueba), cap 2, radius 260, score/mark 0 en aire limpio",
     st.enabled === true && st.channel === "skirmishFind" && st.gExists === false && st.cap === CAP && st.radius === RADIUS && st.score === 0 && st.mark === 0,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius} score=${st.score} mark=${st.mark}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/mark == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.skirmishLine({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].mark === c.m) && tab.every(r => r.mark <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/mark == oracle byte-exacto (score<2→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap skirmishMarkCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.m], game: tab[i] ? [tab[i].tier, tab[i].mark] : null }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnSkirmish inyecta mob a-distancia REAL en G.enemies; skirmishProbe lee score REAL ═══
  //   per-clase weight (long2/short1/melee0) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const sa = await pageA.evaluate((h) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    const sLong = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } }).spawnSkirmish;      // mage range250 → weight 2
    const sShort = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: false } }).spawnSkirmish;    // spearman range210 → weight 1
    const sMelee = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 2, ty: h.ty, melee: true } }).spawnSkirmish;    // orc melee → weight 0
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const probe = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const vm = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { sLong, sShort, sMelee, probe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, mark: vm.mark };
  }, await anchorHero(pageA, 60, 60));
  const myScore5 = sa.probe.mobs.reduce((s, m) => s + oWeight(m.ranged, m.range, false), 0);
  const wLongOK = sa.sLong.weight === 2 && sa.sLong.ranged === true && sa.sLong.range >= LONGR;
  const wShortOK = sa.sShort.weight === 1 && sa.sShort.ranged === true && sa.sShort.range < LONGR;
  const wMeleeOK = sa.sMelee.weight === 0 && sa.sMelee.ranged === false;
  // radius boundary
  const rad = await pageA.evaluate((h) => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.skirmishLine({ clearSkirmish: true });
      window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + d, ty: h.ty, long: true } });
      const bp = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
      res[tag] = { score: bp.score, count: bp.count };
      window.__dev.skirmishLine({ clearSkirmish: true });
    }
    return res;
  }, await anchorHero(pageA, 60, 60));
  const radOK = rad.in.score > 0 && rad.in.count >= 1 && rad.out.score === 0 && rad.out.count === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnSkirmish→G.enemies (e.tpl.ranged/range), skirmishProbe lee score REAL; INDEP artillería=2/corto=1/melee=0 == my skirmishWeights; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     wLongOK && wShortOK && wMeleeOK && sa.probe.score === myScore5 && sa.score === myScore5 && sa.score === 3 && sa.mark === oMark(sa.score) && radOK,
     `long.w=${sa.sLong.weight}(r${sa.sLong.range}) short.w=${sa.sShort.weight}(r${sa.sShort.range}) melee.w=${sa.sMelee.weight} probe.score=${sa.probe.score} myScore=${myScore5} vm.score=${sa.score} mark=${sa.mark} rad=${JSON.stringify(rad)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): línea a-distancia densa ⇒ +mark por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate((h) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    // LÍNEA densa: 2 artillería largo alcance (cada uno w2) ⇒ score4 ⇒ T2/mark2
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.skirmishLine();
    const nearBank = nearVm.forageMarkPreview;   // lo que banca UN kill ahora mismo (canal skirmishFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles) ⇒ sin mobs a-distancia en radio ⇒ T0/+0 control
    window.__dev.skirmishLine({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ clearSkirmish: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, mark: nearVm.mark, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, mark: farVm.mark, preview: farVm.forageMarkPreview, tag: farVm.tag },
    };
  }, await anchorHero(pageA, 90, 90));
  const effOK = effect.enabled === true
    && effect.near.score === 4 && effect.near.tier === 2 && effect.near.mark === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.mark === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === oTier(effect.near.score) && effect.near.mark === oMark(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): 2 artillería a-distancia (score 4) en radio ⇒ mark+2/T2 + forageMarkPreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; línea densa ⇒ 2. MELEE-only ⇒ 0 (peso 0) ═══
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.skirmishLine().hero.skirmishMarks | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _skirmPre=0 ⇒ 0 forage
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h0 = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de una línea a-distancia densa ⇒ _skirmPre≥4 ⇒ forage T2/cap2
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h1 = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h1.tx + 3, ty: h1.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h1.tx, ty: h1.ty + 3, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // kill REAL en medio de la línea a-distancia
    const deltaB = ct() - ctB0;
    // C: kill DENTRO de una brawl MELEE densa (3 orcos pegados) ⇒ score in-radio 0 ⇒ 0 forage (peso 0)
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h2 = window.__dev.skirmishLine().hero;
    for (const dx of [1, -1, 0]) window.__dev.skirmishLine({ spawnSkirmish: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 1 : 0), melee: true } });
    window.__dev.skirmishLine({ tp: { tx: h2.tx, ty: h2.ty } });
    const baseScoreC = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score;
    const ctC0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // kill REAL en medio de melee-only
    const deltaC = ct() - ctC0;
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB, baseScoreC, deltaC };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === oMark(anti.baseScoreB) && anti.deltaB === 2
    && anti.baseScoreC === 0 && anti.deltaC === 0;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δmark 0 (el propio mob no auto-cuenta); línea a-distancia densa (pre≥4) ⇒ Δmark == my LUT=2 (refleja _skirmPre pre-kill); MELEE-only densa ⇒ score 0 ⇒ Δmark 0 (una brawl melee NO es línea de fuego, peso 0)",
     antiOK, JSON.stringify({ ...anti, myLut: oMark(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio skirmishMarkCap=2: ningún score produce mark>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.skirmishLine({ scoreProbe: { score: s } }).scoreProbe.mark);
    return { max: Math.max(...vals), cap: window.__dev.skirmishLine().cap }; });
  ok("L7 ★ SUB-CAP skirmishMarkCap: ningún score produce mark>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L7b — TABLA/UMBRAL LIVE: 1 mob corto-solo (score1)⇒mark0 ; 1 mob artillería (score2)⇒mark1 (a-distancia AISLADO NO cosecha) ═══
  const umbral = await pageA.evaluate((h) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty, long: false } });   // corto → w1
    const bp1 = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const m1 = window.__dev.skirmishLine({ scoreProbe: { score: bp1.score } }).scoreProbe.mark;
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty, long: true } });     // artillería → w2
    const bp2 = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const m2 = window.__dev.skirmishLine({ scoreProbe: { score: bp2.score } }).scoreProbe.mark;
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { short: { score: bp1.score, m: m1 }, long: { score: bp2.score, m: m2 } };
  }, await anchorHero(pageA, 110, 110));
  ok("L7b TABLA/UMBRAL LIVE: 1 corto-solo score1⇒mark0 (T0, a-distancia aislado NO cosecha); 1 artillería score2⇒mark1 (línea genuina)",
     umbral.short.score === 1 && umbral.short.m === 0 && umbral.long.score === 2 && umbral.long.m === 1,
     JSON.stringify(umbral));

  // ═══ L8 — CANAL skirmishFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const skirmishFindCount = chanDecls.filter(c => c === "skirmishFind").length;
  const arcChannels = ARC25.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesSkirmish = arcChannels.every(c => c !== "skirmishFind");
  ok("L8 ★ CANAL skirmishFind AISLADO / NO DOBLE-DIP: served declara `channel:\"skirmishFind\"` EXACTAMENTE 1× (SKIRMISH_LINE_SURGE) + NINGUNA de las 25 flags del arco lo usa (canal FRESCO)",
     skirmishFindCount === 1 && noArcUsesSkirmish, `skirmishFindDecls=${skirmishFindCount} arcUsesSkirmish=${!noArcUsesSkirmish}`);

  // ═══ L8b — STATELESS: save sin clave skirmish* + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((h) => { window.__dev.skirmishLine({ clearSkirmish: true }); window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.skirmishLine().hero; window.__dev.skirmishLine({ scoreProbe: { score: 4 } }); window.__dev.skirmishLine({ spawnSkirmish: { tx: hh.tx + 3, ty: hh.ty, long: true } }); window.__dev.skirmishLine({ clearSkirmish: true }); }, await anchorHero(pageA, 130, 130));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"skirmish[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN skirmish* (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las marcas NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Escaramuza:" render (ctx.fillText) con línea a-distancia densa EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async (h) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escaramuza:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con línea a-distancia densa fresca en radio ⇒ tag + glifo dibujado
    const h2 = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ clearSkirmish: true });
    for (const dx of [3, -3, 0]) window.__dev.skirmishLine({ spawnSkirmish: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 3 : 0), long: true } });
    window.__dev.skirmishLine({ tp: { tx: h2.tx, ty: h2.ty } });
    const nearTag = window.__dev.skirmishLine().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.skirmishLine({ tp: { tx: h2.tx - 40, ty: h2.ty } });
    const farTag = window.__dev.skirmishLine().tag;
    window.__dev.skirmishLine({ clearSkirmish: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  }, await anchorHero(pageA, 150, 150));
  ok("L9 LIVE render: con línea a-distancia densa EN radio parado ⇒ vm.tag (Escaramuza:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥25: inyectar línea a-distancia ⇒ escaramuza→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83 IGNORAN + loot sin cambio ═══
  const diff = await pageA.evaluate((h) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => ({
      flask: window.__dev.skirmishLine().flaskForagePreview,       // afijo #74 family
      socket: window.__dev.skirmishLine().socketForagePreview,     // variante #76 family
      trophy: window.__dev.skirmishLine().trophyForagePreview,     // furia #78 family
      blight: window.__dev.skirmishLine().blightForagePreview,     // plaga #83
      loot: window.__dev.skirmishLine().lootQualityFloor,
      skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
    });
    const pre = snap();
    const hh = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: hh.tx + 3, ty: hh.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: hh.tx, ty: hh.ty + 3, long: true } });
    window.__dev.skirmishLine({ tp: { tx: hh.tx, ty: hh.ty } });
    const post = snap();
    const blOn = window.__dev.blightHarvest ? window.__dev.blightHarvest().enabled : null;
    const maOn = window.__dev.maelstromField ? window.__dev.maelstromField().enabled : null;
    const frOn = window.__dev.crossfireFray ? window.__dev.crossfireFray().enabled : null;
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { pre, post, blOn, maOn, frOn };
  }, await anchorHero(pageA, 170, 170));
  const peersFlat = ["flask", "socket", "trophy", "blight"].every(k => JSON.stringify(diff.pre[k]) === JSON.stringify(diff.post[k])) && diff.pre.loot === diff.post.loot;
  const skirmishRose = diff.post.skirmish - diff.pre.skirmish === 4 && diff.post.skirmish >= 4;
  const diffOK = peersFlat && skirmishRose && diff.blOn === true && diff.maOn === true && diff.frOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥25: 2 artillería ⇒ escaramuza Δ+4→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83 IGNORAN (preview sin cambio) + loot sin cambio; vecinos LIVE enabled:true coexisten (BLIGHT#83/MAELSTROM#82/CROSSFIRE#81)",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate((h) => { window.__dev.skirmishLine({ clearSkirmish: true }); window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.skirmishLine().hero; for (const dx of [3, -3, 0]) window.__dev.skirmishLine({ spawnSkirmish: { tx: hh.tx + dx, ty: hh.ty + (dx === 0 ? 3 : 0), long: true } }); window.__dev.skirmishLine({ tp: { tx: hh.tx, ty: hh.ty } }); }, await anchorHero(pageA, 150, 150));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan la MISMA línea (2 largo + 1 corto) + tp héroe a las MISMAS coords.
  const HT = { tx: 40, ty: 40 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });       // largo w2
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: true } });       // largo w2
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 3, ty: h.ty, long: false } });      // corto w1
    window.__dev.skirmishLine({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.skirmishLine();
    const bp = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.skirmishLine({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, m: p.mark }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const marks = vm.hero ? (vm.hero.skirmishMarks | 0) : null;
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { score: vm.score, tier: vm.tier, mark: vm.mark, preview: vm.forageMarkPreview, tag: vm.tag, spScore: bp.score, spCount: bp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, marks };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = WLONG + WLONG + WSHORT;   // 5 ⇒ T2 mark 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.mark === NC.mark && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.mark === oMark(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMA línea a-distancia+héroe (2 clientes FRESCOS) ⇒ score/tier/mark + skirmishProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=5→T2/mark2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},mark:${NB.mark},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},mark:${NC.mark},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},mark:${oMark(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — MARCAS PER-HERO (no compartidas, no dup entre clientes): h.skirmishMarks transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"skirmishMarks"\s*:/.test(NB.fp) && !/"skirmishMarks"\s*:/.test(NC.fp) && typeof NB.marks === "number" && typeof NC.marks === "number";
  ok("L10c ★ MARCAS PER-HERO (no shared / no dup 2-cliente): h.skirmishMarks transitorio per-hero, FUERA del save+worldFingerprint ⇒ las marcas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_marks=${NB.marks} C_marks=${NC.marks} fpHasMarksKey=${/"skirmishMarks"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-skirmishline.png") });

  // ═══ L11 — RECONEXIÓN mid-línea STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin skirmishMarks + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.skirmishLine", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.skirmishLine();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.skirmishLine({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, m: p.mark }; });
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 3, ty: h.ty, long: false } });
    window.__dev.skirmishLine({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.skirmishLine();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"skirmish[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-línea STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin skirmishMarks/skirmishFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Escaramuza:) (0 drift, 0 persistencia indebida de marcas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, SKIRMISH_LINE_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#84 26º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
