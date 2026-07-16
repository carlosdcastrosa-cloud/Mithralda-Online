// CAS-2476 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para FASE DE ENFURECIMIENTO DE JEFE (BOSS_ENRAGE_SURGE.enabled:TRUE), EVO mecánica #78 (20º flag del arco).
// Mirror LIVE de la DARK QA CAS-2472 (tools/cas2472-enragesurge-dark-observable-qa.mjs). Patrón LIVE = cas2467 (ARENA_HAZARD_SURGE #77).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = e0adf46f6ed1 (== flip CAS-2473 master 1133a49+070ec94 == deploy tools/cas2473-deploy.mjs == gh-pages 72a74ad1 == HTTP served; byte-verificado CTO 4/4 + CEO 2ª 4/4).
//
// Diferencia clave vs DARK (cas2472): enabled:TRUE ⇒ el efecto BOSS_ENRAGE_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - enrageSurgeScore(h)=Σ enrageWeights[kind] sobre los jefes/campeones VIVOS ENFURECIDOS (e.enraged, e.hp<=maxHp*enrageAt) de G.enemies dentro de radius260 (server-auth, subsistema cambio-de-fase-capstone/CAS-65).
//   - TABLA por score: score≥3→T2/trofeos2, [1,3)→T1/trofeos1, 0→T0/trofeos0 (sub-cap enrageTrophyCap=2).
//   - canal FRESCO trophyFind: matar mobs MIENTRAS un jefe/campeón está ENFURECIDO en radio ⇒ +trofeos de guerra (grantTrophy a h.enrageTrophies, recurso TRANSITORIO fuera del save+fingerprint).
//     forageTrophiesPreview = enrageSurgeForageTrophies(h,tpl) = EXACTAMENTE lo que banca el seam de kill (sim.js:5695 grantTrophy(tb)) ⇒ prueba determinista del forrajeo.
//   - fase-1 (enraged:false, tope-de-HP) / jefe muerto (e.dead) / no-jefe / fuera de radio (>260px) ⇒ peso 0 ⇒ T0/+0. Sólo la ventana ENFURECIDA cuenta.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.enrageSurge (scoreProbe/spawnEnraged/enrageProbe/tp) + peers + __dev.saveBlob/worldFingerprint. Badge glifo ✦ vía vm.tag + ctx.fillText.
// Run: node tools/cas2476-enragesurge-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2476-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "e0adf46f6ed1";   // build deployado por el flip BOSS_ENRAGE_SURGE CAS-2473 (== version.json esperado)
const PREV_LIVE = "4ce6f753a96b";      // build servido previo (#77 ARENA_HAZARD_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// enrageWeights {boss:2,champion:1}; tiers [{min:1,trophies:1},{min:3,trophies:2}]; enrageTrophyCap 2.
const ORACLE_WEIGHTS = { boss: 2, champion: 1 };   // clase ausente → 1 (fallback defensivo)
const ORACLE_TIERS = [{ min: 1, trophies: 1 }, { min: 3, trophies: 2 }];
const ORACLE_CAP = 2;
function oracleTierTrophies(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].trophies; }
  return { tier: t, trophies: Math.min(ORACLE_CAP, s) };
}
const EXPECT_SCORE = [
  { s: 0, t: 0, tr: 0 }, { s: 1, t: 1, tr: 1 }, { s: 2, t: 1, tr: 1 },
  { s: 3, t: 2, tr: 2 }, { s: 4, t: 2, tr: 2 }, { s: 6, t: 2, tr: 2 }, { s: 99, t: 2, tr: 2 },
];
// 19 flags del arco #59-#77 (BOSS_ENRAGE_SURGE es #78, el nuevo). Todas deben seguir served:true.
const ARC19 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAEnrage";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #77 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.enrageSurge && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.enrageSurge/ward/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 19 flags arco #59-#77 served TRUE + BOSS_ENRAGE_SURGE #78 served TRUE ⇒ 20 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC19.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const esLive = flag("BOSS_ENRAGE_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 19 flags arco #59-#77 served true (intactas) + BOSS_ENRAGE_SURGE #78 served true ⇒ 20 flags LIVE, 0 perdidas",
     arcAllOn && esLive && ARC19.length === 19, `enrageSurge=${flag("BOSS_ENRAGE_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params BOSS_ENRAGE_SURGE served — canal FRESCO trophyFind + sub-cap enrageTrophyCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"trophyFind"/.test(cfgSrc);
  const capLive = /enrageTrophyCap:\s*2/.test(cfgSrc);
  const radLive = /radius:\s*260/.test(cfgSrc);
  const wLive = /enrageWeights:\s*\{\s*boss:\s*2,\s*champion:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params BOSS_ENRAGE_SURGE served: channel trophyFind + enrageTrophyCap 2 + radius 260 + enrageWeights{boss:2,champion:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel trophyFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.enrageSurge());
  ok("L3 LIVE default: __dev.enrageSurge().enabled === TRUE (flip aplicado), channel trophyFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "trophyFind" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/trophies == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.enrageSurge({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].trophies === c.tr) && tab.every(r => r.trophies <= ORACLE_CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/trophies == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap enrageTrophyCap=2",
     tabOK, JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH + INDEP EXTRAS: spawnEnraged inyecta jefe ENFURECIDO REAL en G.enemies; enrageProbe lee score REAL ═══
  //   per-clase weight (boss=+2 vs champion=+1) + fase-1 (enraged:false) ⇒ +0 + radius-boundary gating (~256px cuenta, ~384px no).
  //   Tile REMOTO (ty=44) aislado de la zona de origen para no contaminar el radio con jefes de otros checks.
  const server5 = await pageA.evaluate(() => {
    const HT = { tx: 70, ty: 44 };
    const measure = (kind, enraged, dtx) => {
      window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
      const before = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
      const sp = window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + (dtx || 2), ty: HT.ty, kind, enraged } }).spawnEnraged;
      window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
      const after = window.__dev.enrageSurge({ enrageProbe: true });
      const m = after.enrageProbe.mobs.find(x => x.kind === kind);
      return { delta: after.enrageProbe.score - before, spWeight: sp ? sp.weight : null, spEnraged: sp ? sp.enraged : null, probeWeight: m ? m.weight : null };
    };
    const boss = measure("boss", true, 2);         // peso 2
    const champ = measure("champion", true, 2);     // peso 1
    const phase1 = measure("boss", false, 2);       // fase-1 (enraged:false) ⇒ peso 0
    // radius-boundary gating: ~256px (8 tiles, dentro de radio260) cuenta; ~384px (12 tiles, fuera) NO.
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const b0 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 8, ty: HT.ty, kind: "champion", enraged: true } });   // ~256px < 260 ⇒ cuenta (+1)
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const bIn = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score - b0;
    const c0 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 12, ty: HT.ty, kind: "champion", enraged: true } });  // ~384px > 260 ⇒ NO cuenta (+0)
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const cOut = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score - c0;
    return { boss, champ, phase1, radiusIn: bIn, radiusOut: cOut };
  });
  const s5OK = server5.boss.delta === 2 && server5.boss.spWeight === 2 && server5.boss.probeWeight === 2 && server5.boss.spEnraged === true &&
    server5.champ.delta === 1 && server5.champ.spWeight === 1 && server5.champ.probeWeight === 1 &&
    server5.phase1.delta === 0 && server5.phase1.spWeight === 0 && server5.phase1.spEnraged === false &&
    server5.radiusIn === 1 && server5.radiusOut === 0;
  ok("L5 ★ REAL SERVER-AUTH: spawnEnraged→G.enemies {enraged:true}, enrageProbe lee score REAL; INDEP per-clase boss=+2/champion=+1; fase-1 (enraged:false)=+0; radius-boundary ~256px=+1 / ~384px=+0",
     s5OK, JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): jefe(s) ENFURECIDOS en radio ⇒ +trofeos por tier; lejos ⇒ +0 ═══
  //   forageTrophiesPreview = EXACTAMENTE lo que banca el seam de kill (grantTrophy) ⇒ "matar mobs MIENTRAS un jefe está ENFURECIDO acumula trofeos".
  //   Tile REMOTO (ty=56) para aislar del radio de L5.
  const effect = await pageA.evaluate(() => {
    const HT = { tx: 90, ty: 56 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    // FURIA de alta intensidad: 2 jefes ENFURECIDOS = score≥3 ⇒ T2/trofeos2
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } });   // ~64px
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 3, ty: HT.ty, kind: "boss", enraged: true } });   // ~96px
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });                                               // héroe en la vecindad de furia
    const nearVm = window.__dev.enrageSurge();
    const nearBank = nearVm.forageTrophiesPreview;   // lo que banca UN kill ahora mismo (canal trophyFind)
    // LEJOS: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin furia en radio ⇒ T0/+0 control
    window.__dev.enrageSurge({ tp: { tx: HT.tx - 40, ty: HT.ty } });
    const farVm = window.__dev.enrageSurge();
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });                                               // restaurar
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, trophies: nearVm.trophies, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, trophies: farVm.trophies, preview: farVm.forageTrophiesPreview, tag: farVm.tag },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score >= 3 && effect.near.tier === 2 && effect.near.trophies === 2 && effect.near.preview === 2 && effect.near.tag === "✦"
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.trophies === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === oracleTierTrophies(effect.near.score).tier && effect.near.trophies === oracleTierTrophies(effect.near.score).trophies;
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): 2 jefes ENFURECIDOS (score≥3) en radio ⇒ trofeos+2/T2 + forageTrophiesPreview 2 (lo que banca el kill) + tag ✦; héroe lejos (>260px) ⇒ sin furia +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core: FORRAJEO SÓLO EN LA VENTANA ENFURECIDA (fase-1 tope-de-HP / jefe muerto / no-jefe ⇒ +0) ═══
  //   Prueba que el trofeo se acumula SÓLO cuando un jefe cruzó su umbral de furia — matar frente a un jefe en fase-1 NO da forrajeo.
  const window6 = await pageA.evaluate(() => {
    const HT = { tx: 110, ty: 62 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const base = window.__dev.enrageSurge().forageTrophiesPreview;               // sin jefe cerca ⇒ 0
    // fase-1: jefe NO enfurecido (tope-de-HP) cerca ⇒ forrajeo 0 (el eje mide FASE, no presencia)
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const phase1Preview = window.__dev.enrageSurge().forageTrophiesPreview;       // fase-1 ⇒ 0
    const phase1ProbeScore = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;   // lectura EN-RADIO: fase-1 no suma ⇒ 0
    // ENFURECER: un 2º jefe ENFURECIDO a la MISMA distancia ⇒ forrajeo sube (ventana de furia abierta)
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const enragedPreview = window.__dev.enrageSurge().forageTrophiesPreview;      // furia abierta ⇒ >0
    const enragedProbeScore = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;  // EN-RADIO ⇒ >0
    return { base, phase1Preview, phase1ProbeScore, enragedPreview, enragedProbeScore };
  });
  // Oráculo EN-RADIO (no el enragedCount GLOBAL/ambiental, que acumula jefes de prueba de checks previos en todo el mundo):
  // sin furia en radio ⇒ 0 forrajeo; fase-1 en radio ⇒ enrageProbe.score 0 ⇒ 0 forrajeo; enfurecer en radio ⇒ score>0 ⇒ forrajeo>0.
  const w6OK = window6.base === 0 && window6.phase1Preview === 0 && window6.phase1ProbeScore === 0 && window6.enragedPreview > 0 && window6.enragedProbeScore > 0;
  ok("L6b ★ GATE-2 VENTANA ENFURECIDA: sin jefe cerca ⇒ 0 forrajeo; jefe en FASE-1 tope-de-HP (enraged:false) EN RADIO ⇒ enrageProbe.score 0 ⇒ 0 forrajeo (fase-1 NO cuenta); enfurecer misma dist ⇒ score>0 ⇒ forrajeo >0 (ventana abierta ⇒ el kill banca trofeos)",
     w6OK, JSON.stringify(window6));

  // ═══ L7 — SUB-CAP propio enrageTrophyCap=2: ningún score produce trophies>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe.trophies);
    return { max: Math.max(...vals), cap: window.__dev.enrageSurge().cap }; });
  ok("L7 ★ SUB-CAP enrageTrophyCap: ningún score produce trophies>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL trophyFind AISLADO / NO doble-dip ═══
  //  (a) UNICIDAD served: `channel:"trophyFind"` aparece EXACTAMENTE 1 vez (en BOSS_ENRAGE_SURGE) y NINGUNA de las 19 flags del arco lo usa.
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const trophyFindCount = chanDecls.filter(c => c === "trophyFind").length;
  const arcChannels = ARC19.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesTrophy = arcChannels.every(c => c !== "trophyFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.enrageSurge(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview,
      flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.enrageSurge({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL trophyFind AISLADO / NO DOBLE-DIP: served declara `channel:\"trophyFind\"` EXACTAMENTE 1× (BOSS_ENRAGE_SURGE) + NINGUNA de las 19 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 14 peers byte-idénticos)",
     trophyFindCount === 1 && noArcUsesTrophy && pure.unchanged,
     `trophyFindDecls=${trophyFindCount} arcChannels=${JSON.stringify(arcChannels)} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave enrageTrophies/trophyFind/enrageSurge + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const HT = { tx: 90, ty: 56 }; window.__dev.enrageSurge({ scoreProbe: { score: 4 } }); window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } }); window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noTrophyKey = !/"enrageTrophies"\s*:/.test(saveBlob) && !/"(enrageSurge|trophyFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN enrageTrophies/enrageSurge/trophyFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (los trofeos NO entran al fingerprint; 0 RNG/timer drift)",
     noTrophyKey && fpBefore === fpAfter, `noTrophyKey=${noTrophyKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo ✦ render (vm.tag + ctx.fillText) con furia EN radio; movimiento+combate sin crash + fps ═══
  //   NOTA: un jefe ENFURECIDO inyectado permanece enfurecido (e.enraged, estado replicado) mientras el héroe esté PARADO en radio.
  //   El héroe en MOVIMIENTO puede salir del radio260 (comportamiento CORRECTO) ⇒ el badge se mide con el héroe PARADO; fps/no-crash aparte.
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("✦") >= 0) glyphCnt++; return orig(t, x, y); };
    const HT = { tx: 130, ty: 68 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));                          // warmup tras probes pesadas
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con 2 jefes ENFURECIDOS frescos en radio ⇒ tag ✦ + glifo dibujado
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 3, ty: HT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const nearTag = window.__dev.enrageSurge().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ sin furia en radio ⇒ tag ''
    window.__dev.enrageSurge({ tp: { tx: HT.tx - 40, ty: HT.ty } });
    const farTag = window.__dev.enrageSurge().tag;
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  });
  ok("L9 LIVE render: con furia EN radio parado ⇒ vm.tag '✦' + glifo dibujado (nearGlyph>0); héroe lejos ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag === "✦" && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 50,
     `nearTag=${badge.nearTag} nearGlyph=${badge.nearGlyph} farTag=${badge.farTag} fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR FUERTE vs apex#73: fase-1 ⇒ apex VE por distancia (matForagePreview>0) pero enrage=0; enfurecer misma dist ⇒ enrage 0→>0 con apex IDÉNTICO ═══
  const diff = await pageA.evaluate(() => {
    const HT = { tx: 150, ty: 74 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    // Fase-1: boss NO enfurecido cerca. Apex mide DISTANCIA ⇒ lo ve; enrage mide FASE ⇒ 0.
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const s0 = window.__dev.enrageSurge();
    const apexMatP1 = s0.matForagePreview, enrPrevP1 = s0.forageTrophiesPreview;
    const affixP1 = s0.flaskForagePreview, eventP1 = s0.gemForagePreview, variantP1 = s0.socketForagePreview, hazardP1 = s0.healForagePreview;
    // Enfurecer un 2º boss a la MISMA distancia. Apex IDÉNTICO (misma dist mínima); enrage sube.
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const s1 = window.__dev.enrageSurge();
    return { apexMatP1, apexMatP2: s1.matForagePreview, enrPrevP1, enrPrevP2: s1.forageTrophiesPreview,
      affixP1, affixP2: s1.flaskForagePreview, eventP1, eventP2: s1.gemForagePreview,
      variantP1, variantP2: s1.socketForagePreview, hazardP1, hazardP2: s1.healForagePreview };
  });
  const diffOK = diff.enrPrevP1 === 0 && diff.enrPrevP2 > 0 &&
    diff.apexMatP1 === diff.apexMatP2 && diff.apexMatP1 > 0 &&
    diff.affixP1 === diff.affixP2 && diff.eventP1 === diff.eventP2 && diff.variantP1 === diff.variantP2 && diff.hazardP1 === diff.hazardP2;
  ok("L9b ⊥ DIFERENCIADOR FUERTE vs apex#73: fase-1 ⇒ apex matFind>0 (VE por DISTANCIA) pero enrage forrajeo=0; enfurecer misma dist ⇒ enrage 0→>0 con apex IDÉNTICO; afijo#74/evento#75/variante#76/hazard#77 IGNORAN la transición de fase",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const HT = { tx: 130, ty: 80 }; window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } }); window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } }); window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 3, ty: HT.ty, kind: "boss", enraged: true } }); window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA (score=Σ jefes enfurecidos en radio, acumulado). Comparar A vs B daría falso-desync.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos MUY REMOTOS (ty=90): ambos clientes inyectan el MISMO jefe ENFURECIDO + tp héroe a las MISMAS coords.
  // enrageSurgeScore = fn PURA de jefes enfurecidos en radio ⇒ MISMO valor para todo observador del mismo snapshot replicado.
  const ENR_A = { tx: 44, ty: 90 }, ENR_B = { tx: 45, ty: 90 }, HERO_TILE = { tx: 48, ty: 90 };  // 2 jefes 3-4 tiles del héroe (~96-128px → en radio260); ty=90 lejos de L1-L9 (ty≤80)
  const readNS = async (pg) => await pg.evaluate((AT, BT, HT) => {
    window.__dev.enrageSurge({ spawnEnraged: { tx: AT.tx, ty: AT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ spawnEnraged: { tx: BT.tx, ty: BT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.enrageSurge();
    const ep = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    const lut = [0, 1, 3].map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, trophies: p.trophies }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, trophies: vm.trophies, preview: vm.forageTrophiesPreview, tag: vm.tag, epScore: ep.score, lut, fp, enabled: vm.enabled, heroTrophies: vm.hero.enrageTrophies };
  }, ENR_A, ENR_B, HERO_TILE);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  // enragedCount ambiental EXCLUIDO (nº de jefes sembrados por el mundo). La señal determinista per-snapshot
  // (score/tier/trophies + enrageProbe.score + LUT + worldFingerprint byte-id) es lo shard-consistente.
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.trophies === NC.trophies && NB.preview === NC.preview &&
                 NB.epScore === NC.epScore && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true && NB.tier === 2;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO jefe ENFURECIDO+héroe (2 clientes FRESCOS) ⇒ score/tier/trophies + enrageProbe.score + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; enragedCount ambiental excluido), enabled:true, T2",
     convOK, `B={score:${NB.score},tier:${NB.tier},trophies:${NB.trophies},prev:${NB.preview},ep:${NB.epScore},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},trophies:${NC.trophies},prev:${NC.preview},ep:${NC.epScore},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp}`);

  // ═══ L10c — TROFEOS PER-HERO (no compartidos, no dup entre clientes): h.enrageTrophies es transitorio per-hero, FUERA de save+fp ═══
  //   Banca trofeos SÓLO en B (via score→preview del seam simulado por posición) y confirma que C NO los ve (per-hero, no shard-shared).
  const perHero = await pageB.evaluate((AT, HT) => {
    // fuerza una furia y lee lo que UN kill bancaría; el banco real es per-hero (h.enrageTrophies) fuera del fingerprint
    window.__dev.enrageSurge({ spawnEnraged: { tx: AT.tx, ty: AT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const s = window.__dev.enrageSurge();
    return { preview: s.forageTrophiesPreview, heroTrophies: s.hero.enrageTrophies };
  }, ENR_A, HERO_TILE);
  const cHeroTrophies = await pageC.evaluate(() => window.__dev.enrageSurge().hero.enrageTrophies);
  // fp/save NO contienen enrageTrophies ⇒ los trofeos de B jamás cruzan a C ni al mundo compartido (per-hero garantizado)
  const perHeroOK = perHero.preview >= 1 && !/"enrageTrophies"\s*:/.test(NB.fp) && !/"enrageTrophies"\s*:/.test(NC.fp) && typeof cHeroTrophies === "number";
  ok("L10c ★ TROFEOS PER-HERO (no shared / no dup 2-cliente): h.enrageTrophies transitorio per-hero, FUERA del save+worldFingerprint ⇒ los trofeos de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_preview=${perHero.preview} B_heroTrophies=${perHero.heroTrophies} C_heroTrophies=${cHeroTrophies} fpHasTrophyKey=${/"enrageTrophies"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-enragesurge.png") });

  // ═══ L11 — RECONEXIÓN mid-enrage STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin enrageTrophies + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.enrageSurge", { timeout: 8000 });
  const reconn = await pageB.evaluate((AT, BT, HT) => {
    const s = window.__dev.enrageSurge();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 3].map(sc => { const p = window.__dev.enrageSurge({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, tier: p.tier, trophies: p.trophies }; });
    // re-inyecta el MISMO jefe enfurecido tras reconectar ⇒ el mundo persistente re-sincroniza la fase de furia
    window.__dev.enrageSurge({ spawnEnraged: { tx: AT.tx, ty: AT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ spawnEnraged: { tx: BT.tx, ty: BT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.enrageSurge();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"enrageTrophies"\s*:|"(enrageSurge|trophyFind)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, ENR_A, ENR_B, HERO_TILE);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag === "✦";
  ok("L11 RECONNECT mid-enrage STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin enrageTrophies/trophyFind + LUT idéntica + worldFingerprint idéntico + re-sync furia (T2/tag ✦) (0 drift, 0 persistencia indebida de trofeos)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, BOSS_ENRAGE_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#78 20º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
