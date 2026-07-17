// CAS-2526 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para SIEGA DE MANADA (PACKHARVEST_SURGE.enabled:TRUE), EVO mecánica #87 (29º flag del arco).
// Mirror LIVE de la DARK QA CAS-2523/CAS-2524 (tools/cas2524-packharvest-dark-indep-qa.mjs). Patrón LIVE = cas2520 (BLOOD #86) / cas2514 (CONTROL #85) / cas2509 (SKIRMISH #84).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = df231e10b1de (== flip CAS-2525 master 976f534+13cdf69 == HTTP served; byte-verificado CTO 7/7 + CEO 2ª).
//
// EJE = COHESIÓN / EMPAQUETAMIENTO INTER-MOB (clustering mob↔mob), health-agnóstico ⊥#86. enabled:TRUE ⇒ efecto ACTIVO en el build servido, SIN toggle in-memory:
//   - packHarvestScore(hero)=Σ packWeight(e) sobre los mobs VIVOS de G.enemies APIÑADOS cuyo CENTRO ∈ radius260 (server-auth; posiciones replicadas).
//   - packNeighbors(e) = nº de OTROS mobs vivos (no dead, hp>0) cuyo centro ∈ cohesionR(88) de e.
//   - packWeight(e): 0 vecinos (rezagado) o dead/hp<=0 ⇒ 0 · ≥looseN(1) vecinos ⇒ 1 (agrupado) · ≥coreN(2) vecinos ⇒ 2 (núcleo).
//   - TABLA por score: tiers[{min:2,charge:1},{min:4,charge:2}] ⇒ score<2→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap packBountyCap=2).
//   - canal FRESCO packFind: rematar un mob MIENTRAS el héroe está EN MEDIO de una MANADA APIÑADA (score≥2) ⇒ +cargas de siega (grantPackBounty a h.packBounty, recurso TRANSITORIO fuera del save+fingerprint).
//     forageChargePreview = lo que banca el seam de kill AHORA (canal packFind). ANTI-AUTO-CONTEO por KILL REAL: _packPre muestreado en el TOP de killEnemy tras e.dead=true ⇒ el propio mob NO auto-cuenta.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.packHarvest (scoreProbe/spawnPack/packProbe/clearPack/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Manada:"/⧉ vía ctx.fillText.
// Run: node tools/cas2526-packharvest-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2526-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "df231e10b1de";   // build deployado por el flip PACKHARVEST_SURGE CAS-2525 (== version.json esperado)
const PREV_LIVE = "67a7fd6e1c86";      // build servido previo (#86 BLOODHARVEST_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) ──
const COHESION_R = 88, RADIUS = 260, CORE_N = 2, LOOSE_N = 1, CAP = 2;
const W_CORE = 2, W_LOOSE = 1;
const TIERS = [{ min: 2, charge: 1 }, { min: 4, charge: 2 }]; // score<2→T0/0, [2,3]→T1/1, ≥4→T2/2
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
function myNeighbors(e, mobs) {
  if (!e || e.dead || e.hp <= 0) return 0;
  const cR2 = COHESION_R * COHESION_R; let c = 0;
  for (const o of mobs) { if (o === e || !o || o.dead || o.hp <= 0) continue;
    const dx = e.x - o.x, dy = e.y - o.y; if (dx * dx + dy * dy <= cR2) c++; }
  return c;
}
function myWeight(e, mobs) {
  if (!e || e.dead || e.hp <= 0) return 0;
  const n = myNeighbors(e, mobs);
  if (n >= CORE_N) return W_CORE; if (n >= LOOSE_N) return W_LOOSE; return 0;
}
function myScore(hero, mobs) {
  const R2 = RADIUS * RADIUS; let s = 0;
  for (const e of mobs) { if (!e || e.dead || e.hp <= 0) continue;
    const dx = hero.x - e.x, dy = hero.y - e.y; if (dx * dx + dy * dy > R2) continue;
    s += myWeight(e, mobs); }
  return s;
}
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 8, 99].map(s => ({ s, t: oTier(s), c: oCharge(s) }));
// 28 flags del arco #59-#86 (PACKHARVEST_SURGE es #87, el nuevo). Todas deben seguir served:true.
const ARC28 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAPack";
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
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx, ty } });
    return window.__dev.packHarvest().hero;
  }, tx, ty);
}

try {
  const pageA = await bootFresh(errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #86 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.packHarvest && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.packHarvest/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 28 flags arco #59-#86 served TRUE + PACKHARVEST_SURGE #87 served TRUE ⇒ 29 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC28.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const phsLive = flag("PACKHARVEST_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 28 flags arco #59-#86 served true (intactas) + PACKHARVEST_SURGE #87 served true ⇒ 29 flags LIVE, 0 perdidas",
     arcAllOn && phsLive && ARC28.length === 28, `pack=${flag("PACKHARVEST_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params PACKHARVEST_SURGE served — canal FRESCO packFind + sub-cap packBountyCap:2 + radius260 + cohesionR88 + core2/loose1 + weights + tiers
  const channelLive = /channel:\s*"packFind"/.test(cfgSrc);
  const capLive = /packBountyCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("PACKHARVEST_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const cohLive = /cohesionR:\s*88/.test(cfgSrc);
  const nLive = /coreN:\s*2/.test(cfgSrc) && /looseN:\s*1/.test(cfgSrc);
  const wLive = /packWeights:\s*\{\s*core:\s*2,\s*loose:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params PACKHARVEST_SURGE served: channel packFind + packBountyCap 2 + radius 260 + cohesionR 88 + coreN 2/looseN 1 + packWeights{core:2,loose:1}",
     channelLive && capLive && radLive && cohLive && nLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} cohesionR=${cohLive} thresh=${nLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel packFind, STATELESS (gExists false) ═══
  const st = await pageA.evaluate(() => window.__dev.packHarvest());
  ok("L3 LIVE default: __dev.packHarvest().enabled === TRUE (flip aplicado), channel packFind, gExists false (STATELESS, G.packBounty null), score/charge 0 en aire limpio + knobs served (radius260/cohesionR88/core2/loose1/cap2)",
     st.enabled === true && st.channel === "packFind" && st.gExists === false && st.score === 0 && st.charge === 0 &&
     st.radius === RADIUS && st.cohesionR === COHESION_R && st.coreN === CORE_N && st.looseN === LOOSE_N && st.cap === CAP,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} score=${st.score} charge=${st.charge} radius=${st.radius} cohesionR=${st.cohesionR} core=${st.coreN} loose=${st.looseN} cap=${st.cap}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.packHarvest({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.c) && tab.every(r => r.charge <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto (score<2→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap packBountyCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.c], game: tab[i] ? [tab[i].tier, tab[i].charge] : null }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnPack inyecta 3 mobs REALes apiñados en G.enemies; packProbe lee posiciones REALes;
  //   re-derivo el score desde ESAS posiciones (mi oráculo, NO el del juego) y comparo al served. Health-agnóstico (mobs a plena vida). ═══
  const h5 = await anchorHero(pageA, 60, 60);
  const sa = await pageA.evaluate((h) => {
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 2, ty: h.ty } });
    const probe = window.__dev.packHarvest({ packProbe: true }).packProbe;
    const vm = window.__dev.packHarvest();
    window.__dev.packHarvest({ clearPack: true });
    return { probe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, charge: vm.charge };
  }, h5);
  const rawMobs = (sa.probe.mobs || []).map(m => ({ x: m.x, y: m.y, dead: false, hp: 1 }));
  const myS = myScore({ x: sa.hx, y: sa.hy }, rawMobs);
  ok("L5 ★ REAL SERVER-AUTH: spawnPack→G.enemies (3 mobs REALes apiñados, plena vida), packProbe lee posiciones REALes; mi oráculo re-derivado desde esas posiciones == served score (health-agnóstico ⊥#86)",
     sa.probe.count === 3 && sa.probe.score === myS && sa.score === myS && sa.score === 6 && sa.charge === oCharge(sa.score) && sa.tier === 2,
     `count=${sa.probe.count} probeScore=${sa.probe.score} myScore=${myS} vm.score=${sa.score} tier=${sa.tier} charge=${sa.charge} neighbors=${sa.probe.mobs.map(m => m.neighbors).join(",")}`);

  // ═══ L5b — COUNT-vs-COHESIÓN crux (⊥#72 escasez / ⊥#69 last-stand): 2 mobs DISPERSOS (>cohesionR) ⇒ score 0 PESE a en-radio;
  //   los MISMOS 2 APIÑADOS (≤cohesionR) ⇒ score≥2. AGREGACIÓN ESPACIAL, no conteo crudo. ═══
  const h5b = await anchorHero(pageA, 80, 80);
  const cohesionCrux = await pageA.evaluate((h) => {
    window.__dev.packHarvest({ clearPack: true });
    // DISPERSOS: ambos DENTRO del radio del héroe (±3 tiles=96px < radius260) pero 6 tiles ENTRE SÍ (192px > cohesionR88) ⇒ 0 vecinos ⇒ peso 0
    const dA = window.__dev.packHarvest({ spawnPack: { tx: h.tx - 3, ty: h.ty } }).spawnPack;
    const dB = window.__dev.packHarvest({ spawnPack: { tx: h.tx + 3, ty: h.ty } }).spawnPack;
    const far = window.__dev.packHarvest({ packProbe: true }).packProbe;
    const farRaw = { inRadius: (window.__dev.packHarvest().mobCount != null) };
    window.__dev.packHarvest({ clearPack: true });
    // APIÑADOS: los mismos 2, adyacentes (≤cohesionR) ⇒ cada uno 1 vecino ⇒ peso 1
    const cA = window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } }).spawnPack;
    const cB = window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } }).spawnPack;
    const near = window.__dev.packHarvest({ packProbe: true }).packProbe;
    window.__dev.packHarvest({ clearPack: true });
    return { far, near, dA, dB, cA, cB };
  }, h5b);
  // Prueba en-radio: los 2 dispersos SÍ se inyectaron a ±3 tiles (dentro del radius), pero spawnPack reporta 0 vecinos ⇒ peso 0 ⇒ packProbe (filtra w>0) los excluye ⇒ score 0.
  //   Los MISMOS 2 adyacentes ⇒ cada uno 1 vecino ⇒ peso 1 ⇒ score 2. Cohesión ESPACIAL, no conteo crudo.
  // NB: el campo spawnPack.neighbors es un SNAPSHOT en el MOMENTO del spawn — el 1er mob apiñado (cA) se inyecta ANTES de que exista cB ⇒ 0 vecinos por ORDEN de inyección (artefacto de secuencia, no del producto).
  //   El estado ASENTADO server-auth se lee de packProbe.mobs[].neighbors DESPUÉS de spawnear ambos: cada uno ve al otro ⇒ 1 vecino simétrico. Se asserta sobre el ASENTADO.
  const nearNbrs = (cohesionCrux.near.mobs || []).map(m => m.neighbors).sort((a, b) => a - b);
  const crux = cohesionCrux.dA.neighbors === 0 && cohesionCrux.dB.neighbors === 0 && cohesionCrux.dA.weight === 0 && cohesionCrux.dB.weight === 0 &&
    cohesionCrux.far.score === 0 &&
    cohesionCrux.near.count === 2 && cohesionCrux.near.score === 2 &&
    nearNbrs.length === 2 && nearNbrs[0] === 1 && nearNbrs[1] === 1;
  ok("L5b ★ COUNT-vs-COHESIÓN ⊥#72/#69: 2 mobs DISPERSOS (±3 tiles del héroe, EN radio; 6 tiles entre sí >cohesionR) ⇒ 0 vecinos/peso 0 ⇒ score 0 (T0) PESE a estar en-radio; los MISMOS 2 ADYACENTES (≤cohesionR) ⇒ packProbe ASENTADO 1 vecino c/u ⇒ score 2 (T1). AGREGACIÓN ESPACIAL, no conteo crudo.",
     crux, `dispersos={nA:${cohesionCrux.dA.neighbors}/wA:${cohesionCrux.dA.weight},nB:${cohesionCrux.dB.neighbors}/wB:${cohesionCrux.dB.weight}} farScore=${cohesionCrux.far.score} apiñados_settled_neighbors=[${nearNbrs.join(",")}] nearCount=${cohesionCrux.near.count} nearScore=${cohesionCrux.near.score} (spawn-snapshot cA=${cohesionCrux.cA.neighbors}/cB=${cohesionCrux.cB.neighbors} = artefacto de orden)`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle in-memory): manada apiñada densa ⇒ +charge por tier + preview + tag; aire limpio ⇒ +0 ═══
  const h6 = await anchorHero(pageA, 90, 90);
  const effect = await pageA.evaluate((h) => {
    window.__dev.packHarvest({ clearPack: true });
    // MANADA: 3 mobs apiñados (núcleo) ⇒ score6 ⇒ T2/charge2
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 2, ty: h.ty } });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.packHarvest();
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles) ⇒ sin manada en radio ⇒ T0/+0
    window.__dev.packHarvest({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.packHarvest();
    window.__dev.packHarvest({ clearPack: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, charge: nearVm.charge, preview: nearVm.forageChargePreview, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, charge: farVm.charge, preview: farVm.forageChargePreview, tag: farVm.tag },
    };
  }, h6);
  const effOK = effect.enabled === true
    && effect.near.score === 6 && effect.near.tier === 2 && effect.near.charge === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.charge === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === oTier(effect.near.score) && effect.near.charge === oCharge(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN toggle in-memory): 3 mobs apiñados (score 6) en radio ⇒ charge+2/T2 + forageChargePreview 2 (lo que banca el kill) + tag ⧉; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ Δ0; manada densa ⇒ Δ2. Solo-1-mob ⇒ Δ0 (sin manada, umbral) ═══
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.packHarvest().hero.packBounty | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _packPre=0 ⇒ 0 forage (el propio mob no auto-cuenta su cohesión)
    window.__dev.packHarvest({ clearPack: true });
    const h0 = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de una manada apiñada densa ⇒ _packPre≥4 ⇒ forage T2/cap2
    window.__dev.packHarvest({ clearPack: true });
    const h1 = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h1.tx, ty: h1.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h1.tx + 1, ty: h1.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h1.tx + 2, ty: h1.ty } });
    window.__dev.packHarvest({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL en medio de la manada apiñada
    const deltaB = ct() - ctB0;
    // C: kill junto a UN SOLO mob suelto (score in-radio <2) ⇒ 0 forage (umbral: rematar junto a un mob suelto NO forrajea)
    window.__dev.packHarvest({ clearPack: true });
    const h2 = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h2.tx, ty: h2.ty } });   // 1 solo mob ⇒ 0 vecinos ⇒ peso 0
    window.__dev.packHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const baseScoreC = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const ctC0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL junto a un mob suelto
    const deltaC = ct() - ctC0;
    window.__dev.packHarvest({ clearPack: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB, baseScoreC, deltaC };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === oCharge(anti.baseScoreB) && anti.deltaB === 2
    && anti.baseScoreC < 2 && anti.deltaC === 0;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ ΔpackBounty 0 (el propio mob no auto-cuenta su cohesión); manada densa (pre≥4) ⇒ Δ == my LUT=2 (refleja _packPre pre-kill); 1-solo-mob (pre<2) ⇒ Δ 0 (umbral: rematar junto a un mob suelto NO forrajea)",
     antiOK, JSON.stringify({ ...anti, myLut: oCharge(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio packBountyCap=2: ningún score produce charge>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.packHarvest({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals) }; });
  ok("L7 ★ SUB-CAP packBountyCap: ningún score produce charge>2 (sweep score∈[0,40]) (fuente única, sub-cap propio, no stacking)",
     capChk.max <= 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL packFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const packFindCount = chanDecls.filter(c => c === "packFind").length;
  const arcChannels = ARC28.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesPack = arcChannels.every(c => c !== "packFind");
  ok("L8 ★ CANAL packFind AISLADO / NO DOBLE-DIP: served declara `channel:\"packFind\"` EXACTAMENTE 1× (PACKHARVEST_SURGE) + NINGUNA de las 28 flags del arco lo usa (canal FRESCO)",
     packFindCount === 1 && noArcUsesPack, `packFindDecls=${packFindCount} arcUsesPack=${!noArcUsesPack}`);

  // ═══ L8b — STATELESS: save sin clave pack* + worldFingerprint byte-estable a través de probes ═══
  const h8 = await anchorHero(pageA, 130, 130);
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((h) => { window.__dev.packHarvest({ clearPack: true }); window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.packHarvest({ scoreProbe: { score: 4 } }); window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } }); window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } }); window.__dev.packHarvest({ clearPack: true }); }, h8);
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"(packFind|packBounty)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN packFind/packBounty (h.packBounty TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (cargas NO entran al fingerprint; mobs de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Manada:" render (ctx.fillText) con manada apiñada densa EN radio; movimiento+combate sin crash + fps ═══
  const h9 = await anchorHero(pageA, 150, 150);
  const badge = await pageA.evaluate(async (h) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Manada:") >= 0) glyphCnt++; return orig(t, x, y); };
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con manada apiñada densa fresca en radio ⇒ tag + glifo dibujado
    const h2 = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ spawnPack: { tx: h2.tx, ty: h2.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h2.tx + 1, ty: h2.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h2.tx + 2, ty: h2.ty } });
    window.__dev.packHarvest({ tp: { tx: h2.tx, ty: h2.ty } });
    const nearTag = window.__dev.packHarvest().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.packHarvest({ tp: { tx: h2.tx - 40, ty: h2.ty } });
    const farTag = window.__dev.packHarvest().tag;
    window.__dev.packHarvest({ clearPack: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  }, h9);
  ok("L9 LIVE render: con manada apiñada densa EN radio parado ⇒ vm.tag (Manada:/⧉) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥28: inyectar manada apiñada SANA ⇒ manada→T2 MIENTRAS blood#86/control#85/skirmish#84/plaga#83/variante#76/afijo#74 IGNORAN (health-agnóstico, contenedores disjuntos) ═══
  const h9b = await anchorHero(pageA, 170, 170);
  const diff = await pageA.evaluate((h) => {
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const snap = () => ({
      blo: (window.__dev.bloodHarvest && (window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score)) || 0,   // siega-de-heridos #86
      ctr: (window.__dev.controlHarvest && (window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score)) || 0, // control #85
      ski: (window.__dev.skirmishLine && (window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score)) || 0,   // escaramuza #84
      bli: (window.__dev.blightHarvest && (window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score)) || 0,     // plaga #83
      var: (window.__dev.variantSurge && (window.__dev.variantSurge({ variantProbe: true }).variantProbe.score)) || 0,     // variante #76
      aff: (window.__dev.affixDanger && (window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score)) || 0,         // afijo #74
    });
    const pre = snap();
    const hh = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: hh.tx, ty: hh.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: hh.tx + 1, ty: hh.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: hh.tx + 2, ty: hh.ty } });
    window.__dev.packHarvest({ tp: { tx: hh.tx, ty: hh.ty } });
    const packScore = window.__dev.packHarvest({ packProbe: true }).packProbe.score;
    const packTier = window.__dev.packHarvest().tier;
    const post = snap();
    const bloOn = window.__dev.bloodHarvest ? window.__dev.bloodHarvest().enabled : null;
    const ctrOn = window.__dev.controlHarvest ? window.__dev.controlHarvest().enabled : null;
    const skOn = window.__dev.skirmishLine ? window.__dev.skirmishLine().enabled : null;
    window.__dev.packHarvest({ clearPack: true });
    return { pre, post, packScore, packTier, bloOn, ctrOn, skOn };
  }, h9b);
  const peersFlat = ["blo", "ctr", "ski", "bli", "var", "aff"].every(k => diff.pre[k] === diff.post[k]);
  const packRose = diff.packScore >= 4 && diff.packTier === 2;
  const diffOK = peersFlat && packRose && diff.bloOn === true && diff.ctrOn === true && diff.skOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥28: manada apiñada SANA (3 mobs núcleo) ⇒ manada score≥4→T2 MIENTRAS blood#86/control#85/skirmish#84/plaga#83/variante#76/afijo#74 IGNORAN (probe sin cambio; mob a PLENA VIDA ⇒ blood peso0, health-agnóstico); vecinos LIVE enabled:true coexisten (BLOOD#86/CONTROL#85/SKIRMISH#84)",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate((h) => { window.__dev.packHarvest({ clearPack: true }); window.__dev.packHarvest({ tp: { tx: h.tx, ty: h.ty } }); const hh = window.__dev.packHarvest().hero; window.__dev.packHarvest({ spawnPack: { tx: hh.tx, ty: hh.ty } }); window.__dev.packHarvest({ spawnPack: { tx: hh.tx + 1, ty: hh.ty } }); window.__dev.packHarvest({ spawnPack: { tx: hh.tx + 2, ty: hh.ty } }); window.__dev.packHarvest({ tp: { tx: hh.tx, ty: hh.ty } }); }, await anchorHero(pageA, 150, 150));
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian mobs, inyectan la MISMA manada (3 apiñados) + tp héroe a las MISMAS coords.
  const HT = { tx: 40, ty: 40 };
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 2, ty: h.ty } });
    window.__dev.packHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.packHarvest();
    const pp = window.__dev.packHarvest({ packProbe: true }).packProbe;
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.packHarvest({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const charges = vm.hero ? (vm.hero.packBounty | 0) : null;
    window.__dev.packHarvest({ clearPack: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag, ppScore: pp.score, ppCount: pp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, charges };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = 6;   // 3 apiñados: cada uno con 2 vecinos ⇒ núcleo w2 ×3 = 6 ⇒ T2 charge 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.charge === NC.charge && NB.preview === NC.preview &&
                 NB.ppScore === NC.ppScore && NB.ppCount === NC.ppCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === oTier(expScore) && NB.charge === oCharge(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMA manada apiñada+héroe (2 clientes FRESCOS) ⇒ score/tier/charge + packProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=6→T2/charge2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},charge:${NB.charge},prev:${NB.preview},ppSc:${NB.ppScore},ppCt:${NB.ppCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},charge:${NC.charge},prev:${NC.preview},ppSc:${NC.ppScore},ppCt:${NC.ppCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${oTier(expScore)},charge:${oCharge(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — CARGAS PER-HERO (no compartidas, no dup entre clientes): h.packBounty transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"packBounty"\s*:/.test(NB.fp) && !/"packBounty"\s*:/.test(NC.fp) && typeof NB.charges === "number" && typeof NC.charges === "number";
  ok("L10c ★ CARGAS PER-HERO (no shared / no dup 2-cliente): h.packBounty transitorio per-hero, FUERA del save+worldFingerprint ⇒ las cargas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_charges=${NB.charges} C_charges=${NC.charges} fpHasChargesKey=${/"packBounty"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-packharvest.png") });

  // ═══ L11 — RECONEXIÓN mid-manada STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin packBounty + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.packHarvest", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.packHarvest();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.packHarvest({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, c: p.charge }; });
    window.__dev.packHarvest({ clearPack: true });
    window.__dev.packHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.packHarvest().hero;
    window.__dev.packHarvest({ spawnPack: { tx: h.tx, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 1, ty: h.ty } });
    window.__dev.packHarvest({ spawnPack: { tx: h.tx + 2, ty: h.ty } });
    window.__dev.packHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.packHarvest();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.packHarvest({ clearPack: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"(packFind|packBounty)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-manada STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin packBounty/packFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag Manada:) (0 drift, 0 persistencia indebida de cargas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, PACKHARVEST_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#87 29º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
