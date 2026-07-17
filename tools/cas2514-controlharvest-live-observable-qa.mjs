// CAS-2514 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para COSECHA DE SOMETIMIENTO (CONTROL_HARVEST_SURGE.enabled:TRUE), EVO mecánica #85 (27º flag del arco).
// Mirror LIVE de la DARK QA CAS-2511 (tools/cas2511-controlharvest-dark-indep-qa.mjs). Patrón LIVE = cas2509 (SKIRMISH #84) / cas2503 (BLIGHT #83) / cas2496 (MAELSTROM #82).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 04171c2c1c08 (== flip CAS-2513 master d50bf29+fc92084 == gh-pages 10a2c339 == HTTP served; byte-verificado CTO 4/4 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2511): enabled:TRUE ⇒ el efecto CONTROL_HARVEST_SURGE está ACTIVO en el build servido, SIN toggle in-memory:
//   - controlHarvestScore(h)=Σ controlWeight(e) sobre los mobs VIVOS de G.enemies bajo CC cuyo CENTRO ∈ radius260 (server-auth; e.stun/e.slowT estado DINÁMICO).
//   - controlWeight(e): mob no-controlado/muerto=0 · SLOW blando (e.slowT>0 sin stun)=1 · STUN duro (e.stun>0, IA congelada)=2. FILTRA !e.dead.
//   - TABLA por score: tiers[{min:2,charge:1},{min:4,charge:2}] ⇒ score<2→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap controlChargeCap=2).
//   - canal FRESCO controlFind: rematar un mob MIENTRAS el héroe está EN MEDIO de un pack SOMETIDO por CC denso ⇒ +cargas de sometimiento (grantControlCharge a h.controlCharges, recurso TRANSITORIO fuera del save+fingerprint).
//     forageChargePreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo. Mob-libre-only NO rinde (peso 0).
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; kill DENTRO de un pack sometido denso (score≥4) ⇒ forrajea. `_ctrlPre` muestreado en el TOP de killEnemy tras e.dead=true.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.controlHarvest (scoreProbe/spawnControl/controlProbe/clearControl/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Sometimiento:"/⊗ vía ctx.fillText.
// Run: node tools/cas2514-controlharvest-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2514-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "04171c2c1c08";   // build deployado por el flip CONTROL_HARVEST_SURGE CAS-2513 (== version.json esperado)
const PREV_LIVE = "5e2e9945a645";      // build servido previo (#84 SKIRMISH_LINE_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const TS = 32, RADIUS = 260, R2 = RADIUS * RADIUS, CAP = 2;
const WSTUN = 2, WSLOW = 1;                                   // STUN duro=2, SLOW blando=1, no-controlado/muerto=0
const TIERS = [{ min: 2, charge: 1 }, { min: 4, charge: 2 }]; // score<2→T0/0, [2,3]→T1/1, ≥4→T2/2
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oWeight = (stun, slowT, dead) => { if (dead) return 0; if (stun > 0) return WSTUN; if (slowT > 0) return WSLOW; return 0; };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= R2;   // Δ8=256px IN, Δ9=288px OUT
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 8, 99].map(s => ({ s, t: oTier(s), c: oCharge(s) }));
// 26 flags del arco #59-#84 (CONTROL_HARVEST_SURGE es #85, el nuevo). Todas deben seguir served:true.
const ARC26 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QACtrl";
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
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ tp: { tx, ty } });
    return window.__dev.controlHarvest().hero;
  }, tx, ty);
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #84 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.controlHarvest && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.controlHarvest/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 26 flags arco #59-#84 served TRUE + CONTROL_HARVEST_SURGE #85 served TRUE ⇒ 27 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC26.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const chsLive = flag("CONTROL_HARVEST_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 26 flags arco #59-#84 served true (intactas) + CONTROL_HARVEST_SURGE #85 served true ⇒ 27 flags LIVE, 0 perdidas",
     arcAllOn && chsLive && ARC26.length === 26, `control=${flag("CONTROL_HARVEST_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params CONTROL_HARVEST_SURGE served — canal FRESCO controlFind + sub-cap controlChargeCap:2 + radio 260 + weights stun2/slow1
  const channelLive = /channel:\s*"controlFind"/.test(cfgSrc);
  const capLive = /controlChargeCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("CONTROL_HARVEST_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /controlWeights:\s*\{\s*stun:\s*2,\s*slow:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params CONTROL_HARVEST_SURGE served: channel controlFind + controlChargeCap 2 + radius 260 + controlWeights{stun:2,slow:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel controlFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.controlHarvest());
  ok("L3 LIVE default: __dev.controlHarvest().enabled === TRUE (flip aplicado), channel controlFind, gExists false (STATELESS, 0 mob de prueba), score/charge 0 en aire limpio",
     st.enabled === true && st.channel === "controlFind" && st.gExists === false && st.score === 0 && st.charge === 0,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} score=${st.score} charge=${st.charge}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.controlHarvest({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.c) && tab.every(r => r.charge <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto (score<2→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap controlChargeCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.c], game: tab[i] ? [tab[i].tier, tab[i].charge] : null }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnControl inyecta mob REAL bajo CC en G.enemies; controlProbe lee score REAL ═══
  //   per-estado weight (stun2/slow1/libre0) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const sa = await pageA.evaluate((h) => {
    window.__dev.controlHarvest({ clearControl: true });
    const sStun = window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } }).spawnControl;   // e.stun>0 → weight 2
    const sSlow = window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty + 3, kind: "slow" } }).spawnControl;   // e.slowT>0 → weight 1
    const sFree = window.__dev.controlHarvest({ spawnControl: { tx: h.tx - 2, ty: h.ty, kind: "none" } }).spawnControl;   // sin CC → weight 0
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const probe = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const vm = window.__dev.controlHarvest();
    window.__dev.controlHarvest({ clearControl: true });
    return { sStun, sSlow, sFree, probe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, charge: vm.charge };
  }, await anchorHero(pageA, 60, 60));
  const myScore5 = sa.probe.mobs.reduce((s, m) => s + oWeight(m.stun, m.slowT, false), 0);
  const wStunOK = sa.sStun.weight === 2 && sa.sStun.stun > 0;
  const wSlowOK = sa.sSlow.weight === 1 && sa.sSlow.slowT > 0 && !(sa.sSlow.stun > 0);
  const wFreeOK = sa.sFree.weight === 0 && !(sa.sFree.stun > 0) && !(sa.sFree.slowT > 0);
  // radius boundary
  const rad = await pageA.evaluate((h) => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.controlHarvest({ clearControl: true });
      window.__dev.controlHarvest({ spawnControl: { tx: h.tx + d, ty: h.ty, kind: "stun" } });
      const bp = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
      res[tag] = { score: bp.score, count: bp.count };
      window.__dev.controlHarvest({ clearControl: true });
    }
    return res;
  }, await anchorHero(pageA, 60, 60));
  const radOK = rad.in.score > 0 && rad.in.count >= 1 && rad.out.score === 0 && rad.out.count === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnControl→G.enemies (e.stun/e.slowT vía applyStatus), controlProbe lee score REAL; INDEP stun=2/slow=1/libre=0 == my controlWeights; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     wStunOK && wSlowOK && wFreeOK && sa.probe.score === myScore5 && sa.score === myScore5 && sa.score === 3 && sa.charge === oCharge(sa.score) && radOK,
     `stun.w=${sa.sStun.weight}(s${sa.sStun.stun}) slow.w=${sa.sSlow.weight}(sl${sa.sSlow.slowT}) free.w=${sa.sFree.weight} probe.score=${sa.probe.score} myScore=${myScore5} vm.score=${sa.score} charge=${sa.charge} rad=${JSON.stringify(rad)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): pack sometido denso ⇒ +charge por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate((h) => {
    window.__dev.controlHarvest({ clearControl: true });
    // PACK sometido: 2 mobs aturdidos (cada uno w2) ⇒ score4 ⇒ T2/charge2
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty + 3, kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.controlHarvest();
    const nearBank = nearVm.forageChargePreview;   // lo que banca UN kill ahora mismo (canal controlFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles) ⇒ sin mobs bajo CC en radio ⇒ T0/+0
    window.__dev.controlHarvest({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.controlHarvest();
    window.__dev.controlHarvest({ clearControl: true });
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
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): 2 mobs aturdidos (score 4) en radio ⇒ charge+2/T2 + forageChargePreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; pack sometido denso ⇒ 2. LIBRE-only ⇒ 0 (peso 0) ═══
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.controlHarvest().hero.controlCharges | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _ctrlPre=0 ⇒ 0 forage
    window.__dev.controlHarvest({ clearControl: true });
    const h0 = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");             // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de un pack sometido denso ⇒ _ctrlPre≥4 ⇒ forage T2/cap2
    window.__dev.controlHarvest({ clearControl: true });
    const h1 = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h1.tx + 3, ty: h1.ty, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: h1.tx, ty: h1.ty + 3, kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");             // kill REAL en medio del pack sometido
    const deltaB = ct() - ctB0;
    // C: kill DENTRO de un pack de mobs LIBRES (3 mobs sin CC pegados) ⇒ score in-radio 0 ⇒ 0 forage (peso 0)
    window.__dev.controlHarvest({ clearControl: true });
    const h2 = window.__dev.controlHarvest().hero;
    for (const dx of [1, -1, 0]) window.__dev.controlHarvest({ spawnControl: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 1 : 0), kind: "none" } });
    window.__dev.controlHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const baseScoreC = window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score;
    const ctC0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");             // kill REAL en medio de mobs libres
    const deltaC = ct() - ctC0;
    window.__dev.controlHarvest({ clearControl: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB, baseScoreC, deltaC };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === oCharge(anti.baseScoreB) && anti.deltaB === 2
    && anti.baseScoreC === 0 && anti.deltaC === 0;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δcharge 0 (el propio mob no auto-cuenta); pack sometido denso (pre≥4) ⇒ Δcharge == my LUT=2 (refleja _ctrlPre pre-kill); LIBRE-only denso ⇒ score 0 ⇒ Δcharge 0 (mobs que corren libres NO son pack sometido, peso 0)",
     antiOK, JSON.stringify({ ...anti, myLut: oCharge(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio controlChargeCap=2: ningún score produce charge>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.controlHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals) }; });
  ok("L7 ★ SUB-CAP controlChargeCap: ningún score produce charge>2 (sweep score∈[0,40]) (no stacking sin límite)",
     capChk.max <= 2, JSON.stringify(capChk));

  // ═══ L7b — TABLA/UMBRAL LIVE: 1 mob slow-solo (score1)⇒charge0 ; 1 mob stun (score2)⇒charge1 (mob sometido AISLADO NO cosecha bajo umbral) ═══
  const umbral = await pageA.evaluate((h) => {
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty, kind: "slow" } });   // slow → w1
    const bp1 = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const c1 = window.__dev.controlHarvest({ scoreProbe: { score: bp1.score } }).scoreProbe.charge;
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty, kind: "stun" } });    // stun → w2
    const bp2 = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const c2 = window.__dev.controlHarvest({ scoreProbe: { score: bp2.score } }).scoreProbe.charge;
    window.__dev.controlHarvest({ clearControl: true });
    return { slow: { score: bp1.score, c: c1 }, stun: { score: bp2.score, c: c2 } };
  }, await anchorHero(pageA, 110, 110));
  ok("L7b TABLA/UMBRAL LIVE: 1 slow-solo score1⇒charge0 (T0, un mob ralentizado aislado NO cosecha); 1 stun score2⇒charge1 (pack genuinamente sometido)",
     umbral.slow.score === 1 && umbral.slow.c === 0 && umbral.stun.score === 2 && umbral.stun.c === 1,
     JSON.stringify(umbral));

  // ═══ L8 — CANAL controlFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const controlFindCount = chanDecls.filter(c => c === "controlFind").length;
  const arcChannels = ARC26.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesControl = arcChannels.every(c => c !== "controlFind");
  ok("L8 ★ CANAL controlFind AISLADO / NO DOBLE-DIP: served declara `channel:\"controlFind\"` EXACTAMENTE 1× (CONTROL_HARVEST_SURGE) + NINGUNA de las 26 flags del arco lo usa (canal FRESCO)",
     controlFindCount === 1 && noArcUsesControl, `controlFindDecls=${controlFindCount} arcUsesControl=${!noArcUsesControl}`);

  // ═══ L8b — STATELESS: save sin clave control* + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((h) => { window.__dev.controlHarvest({ clearControl: true }); window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.controlHarvest().hero; window.__dev.controlHarvest({ scoreProbe: { score: 4 } }); window.__dev.controlHarvest({ spawnControl: { tx: hh.tx + 3, ty: hh.ty, kind: "stun" } }); window.__dev.controlHarvest({ clearControl: true }); }, await anchorHero(pageA, 130, 130));
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"control[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN control* (h.controlCharges TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las cargas NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Sometimiento:" render (ctx.fillText) con pack sometido denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async (h) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Sometimiento:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con pack sometido denso fresco en radio ⇒ tag + glifo dibujado
    const h2 = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ clearControl: true });
    for (const dx of [3, -3, 0]) window.__dev.controlHarvest({ spawnControl: { tx: h2.tx + dx, ty: h2.ty + (dx === 0 ? 3 : 0), kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const nearTag = window.__dev.controlHarvest().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.controlHarvest({ tp: { tx: h2.tx - 40, ty: h2.ty } });
    const farTag = window.__dev.controlHarvest().tag;
    window.__dev.controlHarvest({ clearControl: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  }, await anchorHero(pageA, 150, 150));
  ok("L9 LIVE render: con pack sometido denso EN radio parado ⇒ vm.tag (Sometimiento:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥26: inyectar pack sometido ⇒ control→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83/escaramuza#84 IGNORAN + loot sin cambio ═══
  const diff = await pageA.evaluate((h) => {
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => ({
      flask: window.__dev.controlHarvest().flaskForagePreview,       // afijo #74 family
      socket: window.__dev.controlHarvest().socketForagePreview,     // variante #76 family
      trophy: window.__dev.controlHarvest().trophyForagePreview,     // furia #78 family
      blight: window.__dev.controlHarvest().blightForagePreview,     // plaga #83
      skirmish: window.__dev.controlHarvest().skirmishForagePreview, // escaramuza #84
      loot: window.__dev.controlHarvest().lootQualityFloor,
      control: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
    });
    const pre = snap();
    const hh = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: hh.tx + 3, ty: hh.ty, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: hh.tx, ty: hh.ty + 3, kind: "stun" } });
    window.__dev.controlHarvest({ tp: { tx: hh.tx, ty: hh.ty } });
    const post = snap();
    const blOn = window.__dev.blightHarvest ? window.__dev.blightHarvest().enabled : null;
    const skOn = window.__dev.skirmishLine ? window.__dev.skirmishLine().enabled : null;
    const maOn = window.__dev.maelstromField ? window.__dev.maelstromField().enabled : null;
    window.__dev.controlHarvest({ clearControl: true });
    return { pre, post, blOn, skOn, maOn };
  }, await anchorHero(pageA, 170, 170));
  const peersFlat = ["flask", "socket", "trophy", "blight", "skirmish"].every(k => JSON.stringify(diff.pre[k]) === JSON.stringify(diff.post[k])) && diff.pre.loot === diff.post.loot;
  const controlRose = diff.post.control - diff.pre.control === 4 && diff.post.control >= 4;
  const diffOK = peersFlat && controlRose && diff.blOn === true && diff.skOn === true && diff.maOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥26: 2 mobs aturdidos ⇒ control Δ+4→T2 MIENTRAS afijo#74/variante#76/furia#78/plaga#83/escaramuza#84 IGNORAN (preview sin cambio) + loot sin cambio; vecinos LIVE enabled:true coexisten (SKIRMISH#84/BLIGHT#83/MAELSTROM#82)",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate((h) => { window.__dev.controlHarvest({ clearControl: true }); window.__dev.controlHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.controlHarvest().hero; for (const dx of [3, -3, 0]) window.__dev.controlHarvest({ spawnControl: { tx: hh.tx + dx, ty: hh.ty + (dx === 0 ? 3 : 0), kind: "stun" } }); window.__dev.controlHarvest({ tp: { tx: hh.tx, ty: hh.ty } }); }, await anchorHero(pageA, 150, 150));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan el MISMO pack (2 stun + 1 slow) + tp héroe a las MISMAS coords.
  const HT = { tx: 40, ty: 40 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } });       // stun w2
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty + 3, kind: "stun" } });       // stun w2
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx - 3, ty: h.ty, kind: "slow" } });       // slow w1
    window.__dev.controlHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.controlHarvest();
    const bp = window.__dev.controlHarvest({ controlProbe: true }).controlProbe;
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.controlHarvest({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const charges = vm.hero ? (vm.hero.controlCharges | 0) : null;
    window.__dev.controlHarvest({ clearControl: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag, spScore: bp.score, spCount: bp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, charges };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = WSTUN + WSTUN + WSLOW;   // 5 ⇒ T2 charge 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.charge === NC.charge && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.charge === oCharge(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO pack sometido+héroe (2 clientes FRESCOS) ⇒ score/tier/charge + controlProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=5→T2/charge2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},charge:${NB.charge},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},charge:${NC.charge},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},charge:${oCharge(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — CARGAS PER-HERO (no compartidas, no dup entre clientes): h.controlCharges transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"controlCharges"\s*:/.test(NB.fp) && !/"controlCharges"\s*:/.test(NC.fp) && typeof NB.charges === "number" && typeof NC.charges === "number";
  ok("L10c ★ CARGAS PER-HERO (no shared / no dup 2-cliente): h.controlCharges transitorio per-hero, FUERA del save+worldFingerprint ⇒ las cargas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_charges=${NB.charges} C_charges=${NC.charges} fpHasChargesKey=${/"controlCharges"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-controlharvest.png") });

  // ═══ L11 — RECONEXIÓN mid-pack STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin controlCharges + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.controlHarvest", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.controlHarvest();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.controlHarvest({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, c: p.charge }; });
    window.__dev.controlHarvest({ clearControl: true });
    window.__dev.controlHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.controlHarvest().hero;
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx + 3, ty: h.ty, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx, ty: h.ty + 3, kind: "stun" } });
    window.__dev.controlHarvest({ spawnControl: { tx: h.tx - 3, ty: h.ty, kind: "slow" } });
    window.__dev.controlHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.controlHarvest();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.controlHarvest({ clearControl: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"control[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-pack STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin controlCharges/controlFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Sometimiento:) (0 drift, 0 persistencia indebida de cargas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, CONTROL_HARVEST_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#85 27º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
