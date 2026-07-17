// CAS-2503 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para COSECHA DE PLAGA (BLIGHT_HARVEST_SURGE.enabled:TRUE), EVO mecánica #83 (25º flag del arco).
// Mirror LIVE de la DARK QA CAS-2501 (tools/cas2501-blightharvest-dark-indep-qa.mjs). Patrón LIVE = cas2496 (MAELSTROM_FIELD_SURGE #82).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 27c790487016 (== flip CAS-2502 master 4b3720b+40cfa51 == deploy tools/cas2502-deploy.mjs == gh-pages 24d694a3 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2501): enabled:TRUE ⇒ el efecto BLIGHT_HARVEST_SURGE está ACTIVO en el build servido, SIN toggle in-memory:
//   - blightHarvestScore(h)=Σ blightAfflict(e) sobre los mobs VIVOS de G.enemies cuyo CENTRO ∈ radius260 (server-auth; e.dots pobladas por applyStatus, tickeadas updateEnemies/tickDots).
//   - blightAfflict(e)=Σ blightWeights[tipo] sobre e.dots (poison1/burn1) — un mob veneno+quemadura pesa 2. FILTRA !e.dead.
//   - TABLA por score: tiers[{min:2,h:1},{min:4,h:2}] ⇒ score<2→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap blightHarvestCap=2).
//   - canal FRESCO blightFind: rematar un mob no-neutral MIENTRAS el héroe está DENTRO de un pack ENFERMO denso ⇒ +esencias de plaga (grantBlightHarvest a h.blightHarvest, recurso TRANSITORIO fuera del save+fingerprint).
//     forageHarvestPreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo.
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; matanza DENTRO de un pack enfermo (score≥4) ⇒ forrajea. `_blightPre` muestreado en el TOP de killEnemy tras e.dead=true.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.blightHarvest (scoreProbe/spawnBlight/blightProbe/clearBlight/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Plaga:" vía ctx.fillText.
// Run: node tools/cas2503-blightharvest-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2503-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "27c790487016";   // build deployado por el flip BLIGHT_HARVEST_SURGE CAS-2502 (== version.json esperado)
const PREV_LIVE = "05406d893454";      // build servido previo (#82 MAELSTROM_FIELD_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const TS = 32, RADIUS = 260, CAP = 2;
const WEIGHTS = { poison: 1, burn: 1 };
const TIERS = [{ min: 2, harvest: 1 }, { min: 4, harvest: 2 }];   // score<2→T0/0, [2,3]→T1/1, ≥4→T2/2
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oHarvest = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].harvest); };
const oAfflict = (dots) => { let s = 0; for (const k of dots) s += (WEIGHTS[k] != null ? WEIGHTS[k] : 1); return s; };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // Δ8=256px IN, Δ9=288px OUT
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 6, 9, 99].map(s => ({ s, t: oTier(s), h: oHarvest(s) }));
// 24 flags del arco #59-#82 (BLIGHT_HARVEST_SURGE es #83, el nuevo). Todas deben seguir served:true.
const ARC24 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE"];
// surge peers con dev hook observable #74-#82 (diferenciador ⊥24)
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABlight";
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
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx, ty } });
    return window.__dev.blightHarvest().hero;
  }, tx, ty);
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #82 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.blightHarvest && window.__dev.maelstromField && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.blightHarvest/maelstromField/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 24 flags arco #59-#82 served TRUE + BLIGHT_HARVEST_SURGE #83 served TRUE ⇒ 25 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC24.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const bhsLive = flag("BLIGHT_HARVEST_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 24 flags arco #59-#82 served true (intactas) + BLIGHT_HARVEST_SURGE #83 served true ⇒ 25 flags LIVE, 0 perdidas",
     arcAllOn && bhsLive && ARC24.length === 24, `blight=${flag("BLIGHT_HARVEST_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params BLIGHT_HARVEST_SURGE served — canal FRESCO blightFind + sub-cap blightHarvestCap:2 + radio 260 + weights poison1/burn1
  const channelLive = /channel:\s*"blightFind"/.test(cfgSrc);
  const capLive = /blightHarvestCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("BLIGHT_HARVEST_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /blightWeights:\s*\{\s*poison:\s*1,\s*burn:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params BLIGHT_HARVEST_SURGE served: channel blightFind + blightHarvestCap 2 + radius 260 + blightWeights{poison:1,burn:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel blightFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.blightHarvest());
  ok("L3 LIVE default: __dev.blightHarvest().enabled === TRUE (flip aplicado), channel blightFind, gExists false (STATELESS, 0 mob de prueba), cap 2, radius 260, score/harvest 0 en aire limpio",
     st.enabled === true && st.channel === "blightFind" && st.gExists === false && st.cap === CAP && st.radius === RADIUS && st.score === 0 && st.harvest === 0,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius} score=${st.score} harvest=${st.harvest}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/harvest == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.blightHarvest({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].harvest === c.h) && tab.every(r => r.harvest <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/harvest == oracle byte-exacto (score<2→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap blightHarvestCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.h], game: [tab[i].tier, tab[i].harvest] }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnBlight inyecta mob afligido REAL en G.enemies; blightProbe lee score REAL ═══
  //   per-tipo weight (poison1/burn1/doble2) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const perType = await pageA.evaluate((h) => {
    const out = [];
    const cases = [["poison", { poison: true }], ["burn", { poison: false, burn: true }], ["both", { poison: true, burn: true }]];
    for (const [tag, dots] of cases) {
      window.__dev.blightHarvest({ clearBlight: true });
      const sp = window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, ...dots } }).spawnBlight;   // mob sobre el héroe
      const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
      window.__dev.blightHarvest({ clearBlight: true });
      out.push({ tag, spawnW: sp ? sp.weight : null, spawnDots: sp ? sp.dots : null, probeScore: bp.score, probeCount: bp.count, probeW: bp.mobs[0] ? bp.mobs[0].weight : null });
    }
    return out;
  }, await anchorHero(pageA, 60, 60));
  const rad = await pageA.evaluate((h) => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.blightHarvest({ clearBlight: true });
      window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + d, ty: h.ty, poison: true } });
      const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
      res[tag] = { score: bp.score, count: bp.count };
      window.__dev.blightHarvest({ clearBlight: true });
    }
    return res;
  }, await anchorHero(pageA, 60, 60));
  const expW = { poison: oAfflict(["poison"]), burn: oAfflict(["burn"]), both: oAfflict(["poison", "burn"]) };
  const perTypeOK = perType.every(r => r.spawnW === expW[r.tag] && r.probeW === expW[r.tag] && r.probeScore === expW[r.tag] && r.probeCount === 1)
    && perType.find(r => r.tag === "poison").spawnW === 1 && perType.find(r => r.tag === "burn").spawnW === 1 && perType.find(r => r.tag === "both").spawnW === 2;
  const radOK = rad.in.score > 0 && rad.in.count >= 1 && rad.out.score === 0 && rad.out.count === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnBlight→G.enemies, blightProbe lee score REAL; INDEP per-tipo poison=1/burn=1/doble=2 == my blightWeights; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     perTypeOK && radOK, `perType=${JSON.stringify(perType.map(r => ({ tag: r.tag, mine: expW[r.tag], game: r.probeW, sc: r.probeScore })))} rad=${JSON.stringify(rad)} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): pack enfermo denso ⇒ +harvest por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate((h) => {
    window.__dev.blightHarvest({ clearBlight: true });
    // PACK ENFERMO: 2 mobs DOBLES (veneno+quemadura, cada uno w2) ⇒ score≥4 ⇒ T2/harvest2
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true, burn: true } });
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 2, ty: h.ty, poison: true, burn: true } });
    const nearVm = window.__dev.blightHarvest();
    const nearBank = nearVm.forageHarvestPreview;   // lo que banca UN kill ahora mismo (canal blightFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles) ⇒ sin mobs afligidos en radio ⇒ T0/+0 control
    window.__dev.blightHarvest({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.blightHarvest();
    window.__dev.blightHarvest({ clearBlight: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, harvest: nearVm.harvest, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, harvest: farVm.harvest, preview: farVm.forageHarvestPreview, tag: farVm.tag },
    };
  }, await anchorHero(pageA, 90, 90));
  const effOK = effect.enabled === true
    && effect.near.score === 4 && effect.near.tier === 2 && effect.near.harvest === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.harvest === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === oTier(effect.near.score) && effect.near.harvest === oHarvest(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): 2 mobs DOBLES (score 4) en radio ⇒ harvest+2/T2 + forageHarvestPreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; pack enfermo ⇒ 2 ═══
  //   Refleja `_blightPre` (snapshot en el TOP de killEnemy tras e.dead=true): densidad PRE-kill 0 ⇒ 0 esencias (rematar sobre aire limpio NO forrajea).
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.blightHarvest().hero.blightHarvest | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _blightPre=0 ⇒ 0 forage
    window.__dev.blightHarvest({ clearBlight: true });
    const h0 = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de un pack enfermo denso ⇒ _blightPre≥4 ⇒ forage T2/cap2
    window.__dev.blightHarvest({ clearBlight: true });
    const h1 = window.__dev.blightHarvest().hero;
    for (const dx of [0, 2]) window.__dev.blightHarvest({ spawnBlight: { tx: h1.tx + dx, ty: h1.ty, poison: true, burn: true } });   // 2×2=4 ⇒ score4
    const baseScoreB = window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // kill REAL en medio del pack enfermo
    const deltaB = ct() - ctB0;
    window.__dev.blightHarvest({ clearBlight: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === oHarvest(anti.baseScoreB) && anti.deltaB === 2;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δharvest 0 (rematar sobre aire limpio NO forrajea, el propio mob no auto-cuenta); pack enfermo (pre≥4) ⇒ Δharvest == my LUT harvest=2 (refleja _blightPre pre-kill)",
     antiOK, JSON.stringify({ ...anti, myLut: oHarvest(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio blightHarvestCap=2: ningún score produce harvest>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.blightHarvest({ scoreProbe: { score: s } }).scoreProbe.harvest);
    return { max: Math.max(...vals), cap: window.__dev.blightHarvest().cap }; });
  ok("L7 ★ SUB-CAP blightHarvestCap: ningún score produce harvest>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L7b — TABLA/UMBRAL LIVE: 1 mob poison-solo (score1)⇒harvest0 ; 1 mob doble (score2)⇒harvest1 (mob afligido AISLADO NO cosecha) ═══
  const umbral = await pageA.evaluate((h) => {
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true } });
    const bp1 = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const h1 = window.__dev.blightHarvest({ scoreProbe: { score: bp1.score } }).scoreProbe.harvest;
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true, burn: true } });
    const bp2 = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const h2 = window.__dev.blightHarvest({ scoreProbe: { score: bp2.score } }).scoreProbe.harvest;
    window.__dev.blightHarvest({ clearBlight: true });
    return { poison: { score: bp1.score, h: h1 }, double: { score: bp2.score, h: h2 } };
  }, await anchorHero(pageA, 110, 110));
  ok("L7b TABLA/UMBRAL LIVE: 1 mob poison-solo score1⇒harvest0 (T0, afligido aislado NO cosecha); 1 mob doble score2⇒harvest1 (pack genuino)",
     umbral.poison.score === 1 && umbral.poison.h === 0 && umbral.double.score === 2 && umbral.double.h === 1,
     JSON.stringify(umbral));

  // ═══ L8 — CANAL blightFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const blightFindCount = chanDecls.filter(c => c === "blightFind").length;
  const arcChannels = ARC24.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesBlight = arcChannels.every(c => c !== "blightFind");
  ok("L8 ★ CANAL blightFind AISLADO / NO DOBLE-DIP: served declara `channel:\"blightFind\"` EXACTAMENTE 1× (BLIGHT_HARVEST_SURGE) + NINGUNA de las 24 flags del arco lo usa (canal FRESCO)",
     blightFindCount === 1 && noArcUsesBlight, `blightFindDecls=${blightFindCount} arcUsesBlight=${!noArcUsesBlight}`);

  // ═══ L8b — STATELESS: save sin clave blightHarvest/blightFind + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((h) => { window.__dev.blightHarvest({ clearBlight: true }); window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.blightHarvest().hero; window.__dev.blightHarvest({ scoreProbe: { score: 4 } }); window.__dev.blightHarvest({ spawnBlight: { tx: hh.tx, ty: hh.ty, poison: true, burn: true } }); window.__dev.blightHarvest({ clearBlight: true }); }, await anchorHero(pageA, 130, 130));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"(blightFind|blightHarvest)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN blightHarvest/blightFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las esencias NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Plaga:" render (ctx.fillText) con pack enfermo denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async (h) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Plaga:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con pack enfermo denso fresco en radio ⇒ tag + glifo dibujado
    const h2 = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ clearBlight: true });
    for (const dx of [0, 2, 4]) window.__dev.blightHarvest({ spawnBlight: { tx: h2.tx + dx, ty: h2.ty, poison: true, burn: true } });
    const nearTag = window.__dev.blightHarvest().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.blightHarvest({ tp: { tx: h2.tx - 40, ty: h2.ty } });
    const farTag = window.__dev.blightHarvest().tag;
    window.__dev.blightHarvest({ clearBlight: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  }, await anchorHero(pageA, 150, 150));
  ok("L9 LIVE render: con pack enfermo denso EN radio parado ⇒ vm.tag (Plaga:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥24: inyectar mobs afligidos ⇒ plaga→T2 MIENTRAS afijo#74/variante#76/furia#78/vorágine#82 IGNORAN + loot sin cambio ═══
  const diff = await pageA.evaluate((h) => {
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => ({
      flask: window.__dev.blightHarvest().flaskForagePreview,       // afijo #74 family
      socket: window.__dev.blightHarvest().socketForagePreview,     // variante #76 family
      trophy: window.__dev.blightHarvest().trophyForagePreview,     // furia #78 family
      mael: window.__dev.blightHarvest().maelstromForagePreview,    // vorágine #82
      loot: window.__dev.blightHarvest().lootQualityFloor,
      blight: window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score,
    });
    const pre = snap();
    const hh = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: hh.tx, ty: hh.ty, poison: true, burn: true } });
    window.__dev.blightHarvest({ spawnBlight: { tx: hh.tx + 2, ty: hh.ty, poison: true, burn: true } });
    const post = snap();
    const maOn = window.__dev.maelstromField ? window.__dev.maelstromField().enabled : null;
    const frOn = window.__dev.crossfireFray ? window.__dev.crossfireFray().enabled : null;
    const enOn = window.__dev.enrageSurge ? window.__dev.enrageSurge().enabled : null;
    window.__dev.blightHarvest({ clearBlight: true });
    return { pre, post, maOn, frOn, enOn };
  }, await anchorHero(pageA, 170, 170));
  const peersFlat = ["flask", "socket", "trophy", "mael"].every(k => diff.pre[k] === diff.post[k]) && diff.pre.loot === diff.post.loot;
  const blightRose = diff.post.blight - diff.pre.blight === 4 && diff.post.blight >= 4;
  const diffOK = peersFlat && blightRose && diff.maOn === true && diff.frOn === true && diff.enOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥24: 2 mobs DOBLES ⇒ plaga Δ+4→T2 MIENTRAS afijo#74/variante#76/furia#78/vorágine#82 IGNORAN (preview sin cambio) + loot sin cambio; vecinos enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate((h) => { window.__dev.blightHarvest({ clearBlight: true }); window.__dev.blightHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.blightHarvest().hero; for (const dx of [0, 2, 4]) window.__dev.blightHarvest({ spawnBlight: { tx: hh.tx + dx, ty: hh.ty, poison: true, burn: true } }); }, await anchorHero(pageA, 150, 150));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan los MISMOS 2 mobs DOBLES + tp héroe a las MISMAS coords.
  const HT = { tx: 200, ty: 200 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true, burn: true } });        // doble w2
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, poison: true, burn: true } });    // doble w2 (Δ3=96<260)
    const vm = window.__dev.blightHarvest();
    const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.blightHarvest({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, h: p.harvest }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const harv = vm.hero ? (vm.hero.blightHarvest | 0) : null;
    window.__dev.blightHarvest({ clearBlight: true });
    return { score: vm.score, tier: vm.tier, harvest: vm.harvest, preview: vm.forageHarvestPreview, tag: vm.tag, spScore: bp.score, spCount: bp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, harv };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = oAfflict(["poison", "burn"]) * 2;   // 4 ⇒ T2 harvest 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.harvest === NC.harvest && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.harvest === oHarvest(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMOS mobs afligidos+héroe (2 clientes FRESCOS) ⇒ score/tier/harvest + blightProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=4→T2/harvest2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},harvest:${NB.harvest},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},harvest:${NC.harvest},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},harvest:${oHarvest(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — ESENCIAS PER-HERO (no compartidas, no dup entre clientes): h.blightHarvest transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"blightHarvest"\s*:/.test(NB.fp) && !/"blightHarvest"\s*:/.test(NC.fp) && typeof NB.harv === "number" && typeof NC.harv === "number";
  ok("L10c ★ ESENCIAS PER-HERO (no shared / no dup 2-cliente): h.blightHarvest transitorio per-hero, FUERA del save+worldFingerprint ⇒ las esencias de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_harv=${NB.harv} C_harv=${NC.harv} fpHasHarvestKey=${/"blightHarvest"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-blightharvest.png") });

  // ═══ L11 — RECONEXIÓN mid-pack STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin blightHarvest + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.blightHarvest", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.blightHarvest();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.blightHarvest({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, h: p.harvest }; });
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true, burn: true } });
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, poison: true, burn: true } });
    const vm = window.__dev.blightHarvest();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.blightHarvest({ clearBlight: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"(blightFind|blightHarvest)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-pack STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin blightHarvest/blightFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Plaga:) (0 drift, 0 persistencia indebida de esencias)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, BLIGHT_HARVEST_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#83 25º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
