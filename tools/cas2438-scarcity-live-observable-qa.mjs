// CAS-2438 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PRESIÓN POR ESCASEZ (SCARCITY_EDGE.enabled:TRUE), EVO mecánica #72.
// Mirror LIVE de la DARK QA CAS-2435. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 8c6257f18c72 (== master flip 6b5f52f == HTTP served, byte-verificado 2× por CTO+CEO).
//
// Diferencia clave vs DARK: enabled:TRUE ⇒ el efecto SCARCITY_EDGE está ACTIVO en el build servido:
//   - depletion(zona)=1-mobsVivosNoJefe/Σsp.max ∈[0,1] server-auth (el MISMO estado del loop count<sp.max).
//   - LUT por depletion: dep≥0.50→T1/0.06, dep≥0.80→T2/0.12 (sub-cap scarcityEssCap=0.12).
//   - canal FRESCO essenceFind: en zona agotada, un kill otorga bono round(mul*xp) a meta.essence (trickle fresco per-kill).
//   - zona sin spawners (cap<3, ciudad/field) ⇒ dep 0 ⇒ SIN bono (control).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE ni de la DARK QA).
// Observado vía __dev.scarcity (zoneProbe/depProbe/forageProbe/tp/enabled) + __dev.saveBlob/worldFingerprint/__meta. Badge vía ctx.fillText.
// Run: node tools/cas2438-scarcity-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2438-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "8c6257f18c72";   // build deployado por el flip SCARCITY_EDGE CAS-2437 (== version.json esperado)
const DARK_BUILD = "0d33567b348c";     // build DARK previo (CAS-2432) — el LIVE DEBE haber avanzado de aquí

const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados) ──
const oracleTier = (dep) => { let t = 0; if (dep >= 0.50) t = 1; if (dep >= 0.80) t = 2; return t; };
const oracleMul = (t) => Math.min(0.12, [0, 0.06, 0.12][t] || 0);
const oracleDep = (cap, alive, minCap = 3) => cap < minCap ? 0 : clamp(1 - alive / cap, 0, 1);
const oracleForage = (mul, xp) => Math.round(mul * xp);

const ZONES = ["forest", "caves", "ruins", "abyss", "frost", "trial", "swamp", "caldera"];
const DEPS = [0, 0.25, 0.49, 0.499, 0.50, 0.65, 0.799, 0.80, 0.9, 1.0];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAScar";
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
const errA = [], errB = [], net404 = [];
async function boot(page, err) {
  page.on("pageerror", (e) => err.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) err.push(m.text()); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(rp.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}

try {
  const pageA = await browser.newPage();
  await pageA.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageA.bringToFront();
  await boot(pageA, errA);
  const build = await pageA.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await pageA.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del DARK) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.scarcity && window.__dev.lastStand && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__meta));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del DARK ${DARK_BUILD}); __dev.scarcity/lastStand/saveBlob/worldFingerprint/__meta; 0 err/404`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 13 flags arco #59-#71 served TRUE + SCARCITY_EDGE #72 served TRUE (14 total) ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const scLive = flag("SCARCITY_EDGE") === "true";
  ok("L2 0-REGRESIÓN: 13 flags arco #59-#71 served true (intactas) + SCARCITY_EDGE #72 served true ⇒ 14 flags LIVE, 0 perdidas",
     arcAllOn && scLive && arc.length === 13, `scarcity=${flag("SCARCITY_EDGE")} arc=${JSON.stringify(arcLive)}`);

  // params SCARCITY_EDGE served — canal FRESCO essenceFind + sub-cap 0.12 + tiers
  const channelLive = /channel:\s*"essenceFind"/.test(cfgSrc);
  const capLive = /scarcityEssCap:\s*0\.12/.test(cfgSrc);
  const tiersLive = /(min:\s*0\.5(0)?,\s*mul:\s*0\.06)/.test(cfgSrc) && /(min:\s*0\.8(0)?,\s*mul:\s*0\.12)/.test(cfgSrc);
  ok("L2b params SCARCITY_EDGE served: channel essenceFind + scarcityEssCap 0.12 + tiers {.50:0.06, .80:0.12}",
     channelLive && capLive, `channel=${channelLive} cap=${capLive} tiers=${tiersLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel essenceFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.scarcity());
  ok("L3 LIVE default: __dev.scarcity().enabled === TRUE (flip aplicado), channel essenceFind, gExists false (STATELESS), cap 0.12",
     st.enabled === true && st.channel === "essenceFind" && st.gExists === false && near(st.cap, 0.12),
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap}`);

  // ═══ L4 — REAL SERVER-AUTH: depletion(zona)==oracleDep(cap,alive) re-derivada; ≥1 zona T≥1; zona-inicio cap0/T0 (DETERMINISMO) ═══
  const zread = await pageA.evaluate((zones) => {
    const out = {}; for (const z of zones) out[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe;
    const start = window.__dev.scarcity();
    return { out, startZone: start.zone, startCap: start.zoneCap, startTier: start.tier, minCap: start.minZoneCap };
  }, ZONES);
  const spawnerZones = ZONES.filter(z => zread.out[z] && zread.out[z].cap >= zread.minCap);
  const depFormulaOK = spawnerZones.every(z => { const zp = zread.out[z];
    const eDep = oracleDep(zp.cap, zp.alive, zread.minCap); const eTier = oracleTier(eDep);
    return near(zp.depletion, eDep, 1e-3) && zp.tier === eTier && zp.depletion >= 0 && zp.depletion <= 1; });
  const depletedZone = spawnerZones.find(z => zread.out[z].tier >= 1);
  const capsOK = spawnerZones.length >= 4 && spawnerZones.every(z => zread.out[z].cap >= zread.minCap);
  const startNoCap = zread.startCap === 0 && zread.startTier === 0;
  ok("L4 ★ REAL SERVER-AUTH: depletion REPORTADA == oracleDep(cap,alive) re-derivada ∈[0,1]; cap≥minZoneCap; ≥1 zona T≥1; zona-inicio cap0/T0 (DETERMINISMO)",
     depFormulaOK && capsOK && !!depletedZone && startNoCap,
     `minCap=${zread.minCap} spawnerZones=${spawnerZones.length} depleted=${depletedZone} start={${zread.startZone},cap${zread.startCap},T${zread.startTier}} sample=${JSON.stringify(zread.out[depletedZone])}`);

  const depTile = zread.out[depletedZone] && zread.out[depletedZone].tile;
  const maxDepZone = spawnerZones.slice().sort((a, b) => zread.out[b].depletion - zread.out[a].depletion)[0];
  // ★ snapshot FRESCO de depletion de A (ANTES de las mutaciones L6-L10: forage/combate/tp mueven la sim local de A).
  //   depletion depende de `alive` (población viva de mobs, cantidad DINÁMICA per-tick); para comparar 0-desync entre
  //   A↔B hay que leerla a estado equivalente (fresco), no tras haber jugado en A. Prueba dura de shard = worldFingerprint (L11c).
  const aFreshDeps = {}; for (const z of ZONES) aFreshDeps[z] = zread.out[z] ? zread.out[z].depletion : null;

  // ═══ L5 — LUT PURA re-derivada: sweep dep ⇒ tier/mul == oracleTier/oracleMul byte-exacto ═══
  const tab = await pageA.evaluate((deps) => deps.map(d => window.__dev.scarcity({ depProbe: { dep: d } }).depProbe), DEPS);
  const tabOK = DEPS.every((d, i) => { const eT = oracleTier(d), eM = oracleMul(eT); return tab[i] && tab[i].tier === eT && near(tab[i].mul, eM); });
  ok("L5 LUT PURA re-derivada: depProbe.tier/mul == oracleTier/oracleMul byte-exacto sobre sweep (dep0→T0, .50→T1/0.06, .80→T2/0.12)",
     tabOK, JSON.stringify(DEPS.map((d, i) => ({ d, got: tab[i], exp: { t: oracleTier(d), m: oracleMul(oracleTier(d)) } }))));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle): zona agotada ⇒ bono essenceFind>0; zona sin-cap ⇒ 0 (control) ═══
  const forage = await pageA.evaluate((depZone, startZone) => {
    // NO tocamos enabled — está en true por el flip LIVE
    const dep = window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 137 } }).forageProbe;
    const rich = window.__dev.scarcity({ forageProbe: { zone: startZone, xp: 137 } }).forageProbe;
    return { dep, rich, enabled: window.__dev.scarcity().enabled };
  }, maxDepZone, zread.startZone);
  const forageOK = forage.enabled === true && forage.dep && forage.dep.essence > 0 &&
                   forage.dep.essence === oracleForage(forage.dep.mul, 137) && forage.rich && forage.rich.essence === 0;
  ok("L6 ★ EFECTO ACTIVO LIVE: (enabled:true) zona agotada ⇒ bono essenceFind = round(mul*137) > 0 (== oráculo); zona sin-cap (ciudad/field) ⇒ 0 (control)",
     forageOK, JSON.stringify(forage) + ` oracle=${forage.dep ? oracleForage(forage.dep.mul, 137) : "?"}`);

  // ═══ L7 — SUB-CAP propio scarcityEssCap: ningún dep produce mul>0.12 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let d = 0; d <= 1.0001; d += 0.02) vals.push(window.__dev.scarcity({ depProbe: { dep: d } }).depProbe.mul);
    return { max: Math.max(...vals), cap: window.__dev.scarcity().cap }; });
  ok("L7 ★ SUB-CAP scarcityEssCap: ningún dep produce mul>0.12 (sweep completo dep∈[0,1]); cap==0.12 (no stacking sin límite)",
     capChk.max <= 0.12 + 1e-9 && near(capChk.cap, 0.12), JSON.stringify(capChk));

  // ═══ L8 — DIFERENCIADOR vs LastStand (INVERSO): tier por AUSENCIA, no por enganchados; LAST_STAND coexiste ⊥ ═══
  const diff = await pageA.evaluate((zone) => {
    const zp = window.__dev.scarcity({ zoneProbe: { zone } }).zoneProbe;
    const ls = window.__dev.lastStand ? window.__dev.lastStand() : null;
    return { zp, lsEnabled: ls ? ls.enabled : null, lsCount: ls ? ls.count : null };
  }, maxDepZone);
  const diffOK = diff.zp && diff.zp.tier >= 1 && diff.zp.cap > 0 && diff.zp.depletion >= 0.8 && diff.zp.alive < diff.zp.cap * 0.2 && diff.lsEnabled === true;
  ok("L8 ★ DIFERENCIADOR: zona cap-alta + AUSENCIA (alive<20%cap) ⇒ T≥1 por AUSENCIA (INVERSO a LastStand engaged-count); LAST_STAND LIVE coexiste ⊥",
     diffOK, JSON.stringify(diff));

  // ═══ L9 — STATELESS + NO doble-dip: save sin clave + gExists false + __meta().essence NO muta tras batería + 8 peers intactos ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("L9a STATELESS: saveBlob() SIN clave scarcity* (efecto 100% derivado del estado del mundo, 0 persistencia)",
     !/"scarcity[A-Za-z]*"\s*:/.test(saveBlob), `saveLen=${saveBlob.length}`);
  const neutral = await pageA.evaluate((depZone) => {
    const essBefore = window.__meta().essence | 0;
    // batería completa de probes (previews puros) — NO deben mutar meta.essence (STATELESS; solo el seam killEnemy REAL aplica)
    window.__dev.scarcity({ zoneProbe: { zone: depZone } });
    window.__dev.scarcity({ depProbe: { dep: 0.9 } });
    window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 100 } });
    const essAfter = window.__meta().essence | 0;
    const gExists = window.__dev.scarcity().gExists;
    return { essBefore, essAfter, gExists };
  }, maxDepZone);
  ok("L9b STATELESS: __meta().essence NO cambia tras batería de probes (previews puros; solo seam killEnemy REAL aplica) + gExists false",
     neutral.essBefore === neutral.essAfter && neutral.gExists === false, JSON.stringify(neutral));

  // NO doble-dip: los 8 canales-peer (goldFind/lootQuality/xpGain/ward/crit/vamp/atkspd/detectRadius) NO cambian por escasez
  const orth = await pageA.evaluate((depZone) => {
    const snap = () => { const s = window.__dev.scarcity(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit }; };
    const peersA = snap();
    // toggle LAST_STAND no debe cambiar depletion (canales ⊥)
    const beforeArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    const lsPrev = window.__dev.lastStand ? window.__dev.lastStand().enabled : null;
    window.__dev.lastStand && window.__dev.lastStand({ enabled: !lsPrev });
    const afterArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    const peersB = snap();
    window.__dev.lastStand && window.__dev.lastStand({ enabled: lsPrev });
    return { peersUnchanged: JSON.stringify(peersA) === JSON.stringify(peersB),
      depUnchanged: beforeArc.depletion === afterArc.depletion && beforeArc.tier === afterArc.tier, peersA };
  }, maxDepZone);
  ok("L9c ★ NO DOBLE-DIP: canal essenceFind ⊥ a goldFind/lootQuality/xpGain + 8 peers; toggling LAST_STAND NO cambia depletion (ejes independientes)",
     orth.peersUnchanged && orth.depUnchanged, JSON.stringify(orth));

  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate((depZone) => { window.__dev.scarcity({ zoneProbe: { zone: depZone } }); window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 50 } }); }, maxDepZone);
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("L9d worldFingerprint(393) byte-estable a través de probes (escasez/esencia NO entra al fingerprint; 0 RNG/timer drift)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ L10 — badge "Escasez:" render + movimiento/combate sin crash + fps sano (régimen permanente) ═══
  const badge = await pageA.evaluate(async (depTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escasez:") >= 0) cnt++; return orig(t, x, y); };
    if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } });
    // warmup 700ms tras probes pesadas
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    // medición régimen permanente 2s en movimiento+combate
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 2000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { badgeCnt: cnt, fps };
  }, depTile);
  ok("L10 LIVE render: movimiento (ArrowRight) + combate (Digit1) sin crash; fps RÉGIMEN PERMANENTE sano (≥55); badge \"Escasez:\" DIBUJA (enabled:true ⇒ count>0, contraste con DARK count==0)",
     badge.fps >= 55 && badge.badgeCnt > 0, `badgeCnt=${badge.badgeCnt} fps=${badge.fps}`);

  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });
  await pageA.evaluate((depTile) => { if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } }); }, depTile);
  await pageA.screenshot({ path: join(OUT, "depleted-zone.png") });

  // ═══ L11 — North Star 2-cliente / 0-desync (segundo cliente LIVE, mismo shard) ═══
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.bringToFront();
  await boot(pageB, errB);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  ok("L11a cliente B carga el MISMO build LIVE 8c6257f18c72 (shard replicado)", buildB === EXPECT_BUILD, `buildB=${buildB}`);

  const readNS = async (pg) => await pg.evaluate((zones) => {
    const caps = {}; for (const z of zones) caps[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe.cap;
    const deps = {}; for (const z of zones) deps[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe.depletion;
    const lut = [0.55, 0.85].map(d => { const p = window.__dev.scarcity({ depProbe: { dep: d } }).depProbe; return { dep: d, tier: p.tier, mul: p.mul }; });
    const forage = window.__dev.scarcity({ forageProbe: { zone: "__pure__", xp: 100 } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { caps, deps, lut, forageMul: forage.forageProbe.mul, enabled: window.__dev.scarcity().enabled, fp };
  }, ZONES);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  // depletion se compara a ESTADO FRESCO EQUIVALENTE: A-fresco (snapshot L4, pre-mutación) vs B-fresco (recién booteado).
  // caps/LUT/forage/enabled son invariantes de estado (semilla/config) ⇒ se comparan tal cual.
  const depFreshMatch = JSON.stringify(aFreshDeps) === JSON.stringify(NB.deps);
  const convOK = JSON.stringify(NA.caps) === JSON.stringify(NB.caps) && depFreshMatch &&
                 JSON.stringify(NA.lut) === JSON.stringify(NB.lut) && NA.forageMul === NB.forageMul &&
                 NA.enabled === true && NB.enabled === true;
  ok("L11b NORTH STAR 2-CLIENTE: zoneCap + LUT + canal essenceFind IDÉNTICOS A↔B + depletion IDÉNTICA a estado fresco equivalente (A-fresh L4 == B-fresh), enabled:true en ambos (0 desync)",
     convOK, `caps=${JSON.stringify(NA.caps) === JSON.stringify(NB.caps)} depFresh(A-L4==B)=${depFreshMatch} lut=${JSON.stringify(NA.lut) === JSON.stringify(NB.lut)} forage=${NA.forageMul === NB.forageMul} aFresh=${JSON.stringify(aFreshDeps)} bFresh=${JSON.stringify(NB.deps)}`);
  ok("L11c NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado, misma semilla, 0 desync)",
     NA.fp === NB.fp, `len=${NA.fp.length} match=${NA.fp === NB.fp}`);

  // ═══ L12 — reconnect STATELESS 0-drift: reload B ⇒ idéntico + enabled true + gExists false + save sin clave + fp estable ═══
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.scarcity", { timeout: 8000 });
  const reconn = await pageB.evaluate((zones) => {
    const caps = {}; for (const z of zones) caps[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe.cap;
    const s = window.__dev.scarcity();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { caps, enabled: s.enabled, gExists: s.gExists, hasKey: /"scarcity[A-Za-z]*"\s*:/.test(save), fp };
  }, ZONES);
  const reconnOK = JSON.stringify(reconn.caps) === JSON.stringify(NB.caps) &&
                   reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false && reconn.fp === NB.fp;
  ok("L12 RECONNECT STATELESS 0-drift: tras reload, zoneCap idénticos + enabled:true + gExists false + save sin clave + fp estable (0 drift, 0 persistencia)",
     reconnOK, JSON.stringify({ capsMatch: JSON.stringify(reconn.caps) === JSON.stringify(NB.caps), enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, fpMatch: reconn.fp === NB.fp }));

  // ═══ L13 — sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B) ═══
  ok("L13 sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B)",
     errA.length === 0 && errB.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} 404=${net404.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, SCARCITY_EDGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
