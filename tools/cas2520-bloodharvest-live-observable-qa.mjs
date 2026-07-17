// CAS-2520 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para SIEGA DE HERIDOS (BLOODHARVEST_SURGE.enabled:TRUE), EVO mecánica #86 (28º flag del arco).
// Mirror LIVE de la DARK QA CAS-2517/CAS-2518 (tools/cas2518-bloodharvest-dark-indep-qa.mjs). Patrón LIVE = cas2514 (CONTROL #85) / cas2509 (SKIRMISH #84) / cas2503 (BLIGHT #83).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 67a7fd6e1c86 (== flip CAS-2519 master b82b753+60f6ef5 == gh-pages 7b89796 == HTTP served; byte-verificado CTO 7/7 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2518): enabled:TRUE ⇒ el efecto BLOODHARVEST_SURGE está ACTIVO en el build servido, SIN toggle in-memory:
//   - bloodHarvestScore(h)=Σ bloodWeight(e) sobre los mobs VIVOS de G.enemies ENSANGRENTADOS cuyo CENTRO ∈ radius260 (server-auth; e.hp/e.maxHp estado DINÁMICO).
//   - bloodWeight(e): mob sano (frac>0.40) o muerto=0 · HERIDO (frac≤0.40, >0.15)=1 · a-punto-de-caer / EJECUCIÓN (frac≤0.15)=2. FILTRA !e.dead && e.hp>0.
//   - TABLA por score: tiers[{min:2,charge:1},{min:4,charge:2}] ⇒ score<2→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap bloodChargeCap=2).
//   - canal FRESCO bloodFind: rematar un mob MIENTRAS el héroe está EN MEDIO de un campo de HERIDOS denso ⇒ +cargas de siega (grantBloodCharge a h.bloodCharges, recurso TRANSITORIO fuera del save+fingerprint).
//     forageChargePreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo. Mob-sano-only NO rinde (peso 0).
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; kill DENTRO de un campo de heridos denso (score≥4) ⇒ forrajea. `_bloodPre` muestreado en el TOP de killEnemy tras e.dead=true.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.bloodHarvest (scoreProbe/spawnWound/woundProbe/clearWound/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Siega:"/☠ vía ctx.fillText.
// Run: node tools/cas2520-bloodharvest-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2520-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "67a7fd6e1c86";   // build deployado por el flip BLOODHARVEST_SURGE CAS-2519 (== version.json esperado)
const PREV_LIVE = "04171c2c1c08";      // build servido previo (#85 CONTROL_HARVEST_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const TS = 32, RADIUS = 260, R2 = RADIUS * RADIUS, CAP = 2;
const BLOODIED = 0.40, CRIT = 0.15;                          // fracción de vida: herido ≤0.40, ejecución ≤0.15
const WCRIT = 2, WWOUND = 1;                                 // a-punto-de-caer=2, herido=1, sano/muerto=0
const TIERS = [{ min: 2, charge: 1 }, { min: 4, charge: 2 }]; // score<2→T0/0, [2,3]→T1/1, ≥4→T2/2
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oWeight = (frac, dead) => { if (dead || frac == null || frac <= 0) return 0; if (frac <= CRIT) return WCRIT; if (frac <= BLOODIED) return WWOUND; return 0; };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= R2;   // Δ8=256px IN, Δ9=288px OUT
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 8, 99].map(s => ({ s, t: oTier(s), c: oCharge(s) }));
// 27 flags del arco #59-#85 (BLOODHARVEST_SURGE es #86, el nuevo). Todas deben seguir served:true.
const ARC27 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABlood";
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
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx, ty } });
    return window.__dev.bloodHarvest().hero;
  }, tx, ty);
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #85 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.bloodHarvest && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.bloodHarvest/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 27 flags arco #59-#85 served TRUE + BLOODHARVEST_SURGE #86 served TRUE ⇒ 28 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC27.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const bhsLive = flag("BLOODHARVEST_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 27 flags arco #59-#85 served true (intactas) + BLOODHARVEST_SURGE #86 served true ⇒ 28 flags LIVE, 0 perdidas",
     arcAllOn && bhsLive && ARC27.length === 27, `blood=${flag("BLOODHARVEST_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params BLOODHARVEST_SURGE served — canal FRESCO bloodFind + sub-cap bloodChargeCap:2 + radio 260 + weights crit2/wound1 + fracs
  const channelLive = /channel:\s*"bloodFind"/.test(cfgSrc);
  const capLive = /bloodChargeCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("BLOODHARVEST_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /bloodWeights:\s*\{\s*crit:\s*2,\s*wound:\s*1\s*\}/.test(cfgSrc);
  const fracLive = /bloodiedFrac:\s*0\.40/.test(cfgSrc) && /critFrac:\s*0\.15/.test(cfgSrc);
  ok("L2b params BLOODHARVEST_SURGE served: channel bloodFind + bloodChargeCap 2 + radius 260 + bloodWeights{crit:2,wound:1} + bloodiedFrac 0.40/critFrac 0.15",
     channelLive && capLive && radLive && wLive && fracLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive} fracs=${fracLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel bloodFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.bloodHarvest());
  ok("L3 LIVE default: __dev.bloodHarvest().enabled === TRUE (flip aplicado), channel bloodFind, gExists false (STATELESS, 0 mob de prueba), score/charge 0 en aire limpio",
     st.enabled === true && st.channel === "bloodFind" && st.gExists === false && st.score === 0 && st.charge === 0,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} score=${st.score} charge=${st.charge}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.bloodHarvest({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.c) && tab.every(r => r.charge <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto (score<2→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap bloodChargeCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.c], game: tab[i] ? [tab[i].tier, tab[i].charge] : null }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnWound inyecta mob REAL ensangrentado en G.enemies; woundProbe lee score REAL ═══
  //   per-fracción weight (crit2/wound1/sano0) por e.hp/e.maxHp + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const sa = await pageA.evaluate((h) => {
    window.__dev.bloodHarvest({ clearWound: true });
    const sCrit = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }).spawnWound;    // frac≤0.15 → weight 2
    const sWound = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "wound" } }).spawnWound;  // frac≤0.40 → weight 1
    const sHealthy = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx - 2, ty: h.ty, kind: "none" } }).spawnWound; // sano → weight 0
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const probe = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const vm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return { sCrit, sWound, sHealthy, probe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, charge: vm.charge };
  }, await anchorHero(pageA, 60, 60));
  const myScore5 = (sa.probe.mobs || []).reduce((s, m) => s + oWeight(m.frac, false), 0);
  const wCritOK = sa.sCrit.weight === 2 && sa.sCrit.frac <= CRIT;
  const wWoundOK = sa.sWound.weight === 1 && sa.sWound.frac <= BLOODIED && sa.sWound.frac > CRIT;
  const wHealthyOK = sa.sHealthy.weight === 0 && sa.sHealthy.frac > BLOODIED;
  // radius boundary
  const rad = await pageA.evaluate((h) => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.bloodHarvest({ clearWound: true });
      window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + d, ty: h.ty, kind: "crit" } });
      const bp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
      res[tag] = { score: bp.score, count: bp.count };
      window.__dev.bloodHarvest({ clearWound: true });
    }
    return res;
  }, await anchorHero(pageA, 60, 60));
  const radOK = rad.in.score > 0 && rad.in.count >= 1 && rad.out.score === 0 && rad.out.count === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnWound→G.enemies (e.hp/e.maxHp fracción de vida), woundProbe lee score REAL; INDEP crit=2/wound=1/sano=0 == my bloodWeights; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     wCritOK && wWoundOK && wHealthyOK && sa.probe.score === myScore5 && sa.score === myScore5 && sa.score === 3 && sa.charge === oCharge(sa.score) && radOK,
     `crit.w=${sa.sCrit.weight}(f${sa.sCrit.frac}) wound.w=${sa.sWound.weight}(f${sa.sWound.frac}) healthy.w=${sa.sHealthy.weight}(f${sa.sHealthy.frac}) probe.score=${sa.probe.score} myScore=${myScore5} vm.score=${sa.score} charge=${sa.charge} rad=${JSON.stringify(rad)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): campo de heridos denso ⇒ +charge por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate((h) => {
    window.__dev.bloodHarvest({ clearWound: true });
    // CAMPO: 2 mobs a-punto-de-caer (cada uno w2) ⇒ score4 ⇒ T2/charge2
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.bloodHarvest();
    const nearBank = nearVm.forageChargePreview;   // lo que banca UN kill ahora mismo (canal bloodFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles) ⇒ sin mobs heridos en radio ⇒ T0/+0
    window.__dev.bloodHarvest({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, charge: nearVm.charge, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, charge: farVm.charge, preview: farVm.forageChargePreview, tag: farVm.tag },
    };
  }, await anchorHero(pageA, 90, 90));
  const effOK = effect.enabled === true
    && effect.near.score === 4 && effect.near.tier === 2 && effect.near.charge === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.charge === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === oTier(effect.near.score) && effect.near.charge === oCharge(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): 2 mobs a-punto-de-caer (score 4) en radio ⇒ charge+2/T2 + forageChargePreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; campo denso ⇒ 2. SANO-only ⇒ 0 (peso 0) ═══
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.bloodHarvest().hero.bloodCharges | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _bloodPre=0 ⇒ 0 forage
    window.__dev.bloodHarvest({ clearWound: true });
    const h0 = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de un campo de heridos denso ⇒ _bloodPre≥4 ⇒ forage T2/cap2
    window.__dev.bloodHarvest({ clearWound: true });
    const h1 = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h1.tx + 3, ty: h1.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h1.tx, ty: h1.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL en medio del campo de heridos
    const deltaB = ct() - ctB0;
    // C: kill DENTRO de un pack de mobs SANOS (3 mobs sanos pegados) ⇒ score in-radio 0 ⇒ 0 forage (peso 0)
    window.__dev.bloodHarvest({ clearWound: true });
    const h2 = window.__dev.bloodHarvest().hero;
    for (const dx of [1, -1, 0]) window.__dev.bloodHarvest({ spawnWound: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 1 : 0), kind: "none" } });
    window.__dev.bloodHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const baseScoreC = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctC0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL en medio de mobs sanos
    const deltaC = ct() - ctC0;
    window.__dev.bloodHarvest({ clearWound: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB, baseScoreC, deltaC };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === oCharge(anti.baseScoreB) && anti.deltaB === 2
    && anti.baseScoreC === 0 && anti.deltaC === 0;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δcharge 0 (el propio mob no auto-cuenta); campo de heridos denso (pre≥4) ⇒ Δcharge == my LUT=2 (refleja _bloodPre pre-kill); SANO-only denso ⇒ score 0 ⇒ Δcharge 0 (mobs sanos NO son carne de remate, peso 0)",
     antiOK, JSON.stringify({ ...anti, myLut: oCharge(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio bloodChargeCap=2: ningún score produce charge>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals) }; });
  ok("L7 ★ SUB-CAP bloodChargeCap: ningún score produce charge>2 (sweep score∈[0,40]) (no stacking sin límite)",
     capChk.max <= 2, JSON.stringify(capChk));

  // ═══ L7b — TABLA/UMBRAL LIVE: 1 mob wound-solo (score1)⇒charge0 ; 1 mob crit (score2)⇒charge1 (mob herido AISLADO NO cosecha bajo umbral) ═══
  const umbral = await pageA.evaluate((h) => {
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty, kind: "wound" } });   // wound → w1
    const bp1 = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const c1 = window.__dev.bloodHarvest({ scoreProbe: { score: bp1.score } }).scoreProbe.charge;
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty, kind: "crit" } });     // crit → w2
    const bp2 = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const c2 = window.__dev.bloodHarvest({ scoreProbe: { score: bp2.score } }).scoreProbe.charge;
    window.__dev.bloodHarvest({ clearWound: true });
    return { wound: { score: bp1.score, c: c1 }, crit: { score: bp2.score, c: c2 } };
  }, await anchorHero(pageA, 110, 110));
  ok("L7b TABLA/UMBRAL LIVE: 1 wound-solo score1⇒charge0 (T0, un herido aislado NO cosecha); 1 crit score2⇒charge1 (campo genuino de carne-de-ejecución)",
     umbral.wound.score === 1 && umbral.wound.c === 0 && umbral.crit.score === 2 && umbral.crit.c === 1,
     JSON.stringify(umbral));

  // ═══ L8 — CANAL bloodFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const bloodFindCount = chanDecls.filter(c => c === "bloodFind").length;
  const arcChannels = ARC27.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesBlood = arcChannels.every(c => c !== "bloodFind");
  ok("L8 ★ CANAL bloodFind AISLADO / NO DOBLE-DIP: served declara `channel:\"bloodFind\"` EXACTAMENTE 1× (BLOODHARVEST_SURGE) + NINGUNA de las 27 flags del arco lo usa (canal FRESCO)",
     bloodFindCount === 1 && noArcUsesBlood, `bloodFindDecls=${bloodFindCount} arcUsesBlood=${!noArcUsesBlood}`);

  // ═══ L8b — STATELESS: save sin clave blood* + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((h) => { window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.bloodHarvest().hero; window.__dev.bloodHarvest({ scoreProbe: { score: 4 } }); window.__dev.bloodHarvest({ spawnWound: { tx: hh.tx + 3, ty: hh.ty, kind: "crit" } }); window.__dev.bloodHarvest({ clearWound: true }); }, await anchorHero(pageA, 130, 130));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"(bloodFind|bloodCharges)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN bloodFind/bloodCharges (h.bloodCharges TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las cargas NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Siega:" render (ctx.fillText) con campo de heridos denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async (h) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Siega:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con campo de heridos denso fresco en radio ⇒ tag + glifo dibujado
    const h2 = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ clearWound: true });
    for (const dx of [3, -3, 0]) window.__dev.bloodHarvest({ spawnWound: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 3 : 0), kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const nearTag = window.__dev.bloodHarvest().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.bloodHarvest({ tp: { tx: h2.tx - 40, ty: h2.ty } });
    const farTag = window.__dev.bloodHarvest().tag;
    window.__dev.bloodHarvest({ clearWound: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  }, await anchorHero(pageA, 150, 150));
  ok("L9 LIVE render: con campo de heridos denso EN radio parado ⇒ vm.tag (Siega:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥27: inyectar campo de heridos ⇒ siega→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83/escaramuza#84/control#85 IGNORAN + mob sano peso0 ═══
  const diff = await pageA.evaluate((h) => {
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => ({
      aff: window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score,           // afijo #74
      var: window.__dev.variantSurge({ variantProbe: true }).variantProbe.score,        // variante #76
      enr: window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score,           // furia #78
      bli: window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score,         // plaga #83
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,      // escaramuza #84
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,      // control #85
    });
    const pre = snap();
    const hh = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: hh.tx + 3, ty: hh.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: hh.tx, ty: hh.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: hh.tx, ty: hh.ty } });
    const bloodScore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const post = snap();
    // mob SANO adicional NO sube el score (peso 0)
    window.__dev.bloodHarvest({ spawnWound: { tx: hh.tx - 4, ty: hh.ty, kind: "none" } });
    window.__dev.bloodHarvest({ tp: { tx: hh.tx, ty: hh.ty } });
    const bloodScoreAfterHealthy = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    const ctrOn = window.__dev.controlHarvest ? window.__dev.controlHarvest().enabled : null;
    const skOn = window.__dev.skirmishLine ? window.__dev.skirmishLine().enabled : null;
    const blOn = window.__dev.blightHarvest ? window.__dev.blightHarvest().enabled : null;
    window.__dev.bloodHarvest({ clearWound: true });
    return { pre, post, bloodScore, bloodScoreAfterHealthy, ctrOn, skOn, blOn };
  }, await anchorHero(pageA, 170, 170));
  const peersFlat = ["aff", "var", "enr", "bli", "ski", "ctr"].every(k => diff.pre[k] === diff.post[k]);
  const bloodRose = diff.bloodScore >= 4 && diff.bloodScoreAfterHealthy === diff.bloodScore;
  const diffOK = peersFlat && bloodRose && diff.ctrOn === true && diff.skOn === true && diff.blOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥27: 2 mobs a-punto-de-caer ⇒ siega score≥4→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83/escaramuza#84/control#85 IGNORAN (probe sin cambio) + mob SANO añade 0 (peso 0); vecinos LIVE enabled:true coexisten (CONTROL#85/SKIRMISH#84/BLIGHT#83)",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate((h) => { window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.bloodHarvest().hero; for (const dx of [3, -3, 0]) window.__dev.bloodHarvest({ spawnWound: { tx: hh.tx + dx, ty: hh.ty + (dx === 0 ? 3 : 0), kind: "crit" } }); window.__dev.bloodHarvest({ tp: { tx: hh.tx, ty: hh.ty } }); }, await anchorHero(pageA, 150, 150));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan el MISMO campo (2 crit + 1 wound) + tp héroe a las MISMAS coords.
  const HT = { tx: 40, ty: 40 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });        // crit w2
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "crit" } });        // crit w2
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx - 3, ty: h.ty, kind: "wound" } });       // wound w1
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.bloodHarvest();
    const bp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const charges = vm.hero ? (vm.hero.bloodCharges | 0) : null;
    window.__dev.bloodHarvest({ clearWound: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag, spScore: bp.score, spCount: bp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, charges };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = WCRIT + WCRIT + WWOUND;   // 5 ⇒ T2 charge 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.charge === NC.charge && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.charge === oCharge(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO campo de heridos+héroe (2 clientes FRESCOS) ⇒ score/tier/charge + woundProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=5→T2/charge2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},charge:${NB.charge},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},charge:${NC.charge},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},charge:${oCharge(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — CARGAS PER-HERO (no compartidas, no dup entre clientes): h.bloodCharges transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"bloodCharges"\s*:/.test(NB.fp) && !/"bloodCharges"\s*:/.test(NC.fp) && typeof NB.charges === "number" && typeof NC.charges === "number";
  ok("L10c ★ CARGAS PER-HERO (no shared / no dup 2-cliente): h.bloodCharges transitorio per-hero, FUERA del save+worldFingerprint ⇒ las cargas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_charges=${NB.charges} C_charges=${NC.charges} fpHasChargesKey=${/"bloodCharges"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-bloodharvest.png") });

  // ═══ L11 — RECONEXIÓN mid-campo STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin bloodCharges + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.bloodHarvest", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.bloodHarvest();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.bloodHarvest({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, c: p.charge }; });
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx - 3, ty: h.ty, kind: "wound" } });
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.bloodHarvest();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bloodHarvest({ clearWound: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"(bloodFind|bloodCharges)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-campo STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin bloodCharges/bloodFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Siega:) (0 drift, 0 persistencia indebida de cargas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, BLOODHARVEST_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#86 28º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
