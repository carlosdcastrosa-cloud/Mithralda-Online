// CAS-2444 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PROXIMIDAD A AMENAZA APEX (APEX_PROXIMITY.enabled:TRUE), EVO mecánica #73.
// Mirror LIVE de la DARK selfverify CAS-2439. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = c0318e23765d (== master flip bf05ed7 == deploy 1b47d09 == gh-pages d588d48 == HTTP served; byte-verificado 2× CTO+CEO).
//
// Diferencia clave vs DARK: enabled:TRUE ⇒ el efecto APEX_PROXIMITY está ACTIVO en el build servido, SIN flip in-memory:
//   - apexNearestDist(h)=min hypot(h−apexVivo) ∈[0,∞) server-auth (posiciones de e.isBoss/champion/champElite en G.enemies = estado de sim replicado).
//   - LUT por distancia: dist≤240→T2/mats2, (240,480]→T1/mats1, >480 / sin apex→T0/mats0 (sub-cap apexMatCap=2).
//   - canal FRESCO matFind: apex vivo en radio de amenaza ⇒ +mats por kill de trash no-neutral (grantMats a h.mats).
//   - sin apex / lejos (>480px) ⇒ 0 bono (control).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.apex (distProbe/spawnApex/nearestProbe/tp) + peers (ward/scarcity/lastStand/...) + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2444-apex-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2444-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "c0318e23765d";   // build deployado por el flip APEX_PROXIMITY CAS-2441 (== version.json esperado)
const DARK_BUILD = "51299d4c1bb0";     // build DARK previo (CAS-2439) — el LIVE DEBE haber avanzado de aquí

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados) ──
// dist→{tier,mats}: ≤240→T2/2, (240,480]→T1/1, >480→T0/0 ; mats sub-cap apexMatCap=2
const oracleTier = (dist) => { if (dist < 0) return 0; if (dist <= 240) return 2; if (dist <= 480) return 1; return 0; };
const oracleMats = (tier) => Math.min(2, tier); // T2→2, T1→1, T0→0

// LUT esperada dist→{tier,mats}
const EXPECT_DIST = [
  { dist: 0, t: 2, m: 2 }, { dist: 240, t: 2, m: 2 },
  { dist: 241, t: 1, m: 1 }, { dist: 480, t: 1, m: 1 },
  { dist: 481, t: 0, m: 0 }, { dist: 9999, t: 0, m: 0 },
];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAApex";
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
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.apex && window.__dev.ward && window.__dev.lastStand && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del DARK ${DARK_BUILD}); __dev.apex/ward/lastStand/scarcity/saveBlob/worldFingerprint; 0 err/404`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 14 flags arco #59-#72 served TRUE + APEX_PROXIMITY #73 served TRUE (15 total, criterio 6) ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const apLive = flag("APEX_PROXIMITY") === "true";
  ok("L2 ★ 0-REGRESIÓN: 14 flags arco #59-#72 served true (intactas) + APEX_PROXIMITY #73 served true ⇒ 15 flags LIVE, 0 perdidas",
     arcAllOn && apLive && arc.length === 14, `apex=${flag("APEX_PROXIMITY")} arc=${JSON.stringify(arcLive)}`);

  // params APEX_PROXIMITY served — canal FRESCO matFind + sub-cap apexMatCap:2 + radios de tier
  const channelLive = /channel:\s*"matFind"/.test(cfgSrc);
  const capLive = /apexMatCap:\s*2/.test(cfgSrc);
  ok("L2b params APEX_PROXIMITY served: channel matFind + apexMatCap 2 (radios T2≤240 / T1≤480)",
     channelLive && capLive, `channel=${channelLive} cap=${capLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel matFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.apex());
  ok("L3 LIVE default: __dev.apex().enabled === TRUE (flip aplicado), channel matFind, gExists false (STATELESS), cap 2",
     st.enabled === true && st.channel === "matFind" && st.gExists === false && st.cap === 2,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap}`);

  // ═══ L4 — LUT PURA re-derivada: distProbe.tier/mats == oracle byte-exacto (soporta criterio 1) ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.apex({ distProbe: { dist: c.dist } }).distProbe), EXPECT_DIST);
  const tabOK = EXPECT_DIST.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].mats === c.m);
  ok("L4 LUT PURA re-derivada: distProbe.tier/mats == oracle byte-exacto (≤240→T2/2, (240,480]→T1/1, >480→T0/0)",
     tabOK, JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL + kind + apexCount (criterio 2) ═══
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });   // apex REAL 4 tiles este (~128px)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const vm = window.__dev.apex();
    return { np, apexCount: vm.apexCount, tier: vm.tier, dist: vm.dist };
  });
  ok("L5 ★ REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1 (señal = estado de sim replicado)",
     server5.np && server5.np.dist > 0 && server5.np.apex && server5.np.apex.kind === "boss" && server5.apexCount >= 1,
     JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): apex≤240⇒+2, ≤480⇒+1, >480/none⇒+0 (criterio 1) ═══
  const effect = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });    // apex REAL fijo a 4 tiles (128px)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });               // hero @origin ⇒ dist ~128 ≤240 ⇒ T2/mats2
    const nearVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx - 7, ty: h.ty } });           // hero 7 oeste ⇒ apex 11 tiles (352px) ⇒ (240,480] ⇒ T1/mats1
    const midVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx - 20, ty: h.ty } });          // hero 20 oeste ⇒ apex 24 tiles (768px) >480 ⇒ T0/mats0
    const farVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });               // restaurar
    return {
      enabled: nearVm.enabled,
      near: { dist: nearVm.dist, tier: nearVm.tier, mats: nearVm.mats, preview: nearVm.forageMatsPreview },
      mid: { dist: midVm.dist, tier: midVm.tier, mats: midVm.mats, preview: midVm.forageMatsPreview },
      far: { dist: farVm.dist, tier: farVm.tier, mats: farVm.mats, preview: farVm.forageMatsPreview },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.dist > 0 && effect.near.dist <= 240 && effect.near.tier === 2 && effect.near.mats === 2 && effect.near.preview === 2
    && effect.mid.dist > 240 && effect.mid.dist <= 480 && effect.mid.tier === 1 && effect.mid.mats === 1 && effect.mid.preview === 1
    && effect.far.dist > 480 && effect.far.tier === 0 && effect.far.mats === 0 && effect.far.preview === 0
    && effect.near.tier === oracleTier(effect.near.dist) && effect.near.mats === oracleMats(oracleTier(effect.near.dist))
    && effect.mid.tier === oracleTier(effect.mid.dist) && effect.far.tier === oracleTier(effect.far.dist);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): apex REAL ≤240px ⇒ mats+2; ≤480px ⇒ +1; >480px ⇒ +0 (apex() snapshot = dist/tier/mats reales; == oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L7 — SUB-CAP propio apexMatCap=2: ningún dist produce mats>2 (sweep completo) (criterio 3) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let d = 0; d <= 700; d += 20) vals.push(window.__dev.apex({ distProbe: { dist: d } }).distProbe.mats);
    return { max: Math.max(...vals), cap: window.__dev.apex().cap }; });
  ok("L7 ★ SUB-CAP apexMatCap: ningún dist produce mats>2 (sweep completo dist∈[0,700]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL matFind AISLADO / NO doble-dip: 9 peers intactos apex-near vs apex-far; toggling SCARCITY ⊥ (criterio 4) ═══
  const orth = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });              // apex CERCA (T2)
    const snap = () => { const s = window.__dev.apex(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview }; };
    const peersNear = snap();
    window.__dev.apex({ tp: { tx: h.tx - 20, ty: h.ty } });         // apex LEJOS (T0) — matFind se apaga; los 9 peers NO deben cambiar
    const peersFar = snap();
    // toggling SCARCITY_EDGE (primo recompensa-forrajeo) NO debe cambiar la señal apex
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const beforeArc = window.__dev.apex();
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.scarcity && window.__dev.scarcity({ enabled: !scPrev });
    const afterArc = window.__dev.apex();
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });   // restaura LIVE
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    return {
      peersUnchanged: JSON.stringify(peersNear) === JSON.stringify(peersFar),
      sigUnchanged: beforeArc.dist === afterArc.dist && beforeArc.tier === afterArc.tier && beforeArc.mats === afterArc.mats,
      scRestored: scAfter === scPrev, scPrev, peersNear,
    };
  });
  ok("L8 ★ CANAL matFind AISLADO / NO DOBLE-DIP: 9 peers (ward/gold/crit/xp/vamp/loot/atk/det/ess) IDÉNTICOS apex-cerca vs apex-lejos; toggling SCARCITY NO cambia la señal apex (ejes ⊥)",
     orth.peersUnchanged && orth.sigUnchanged && orth.scPrev === true, JSON.stringify(orth));

  // ═══ L8b — STATELESS: save sin clave 'apex' + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.apex().hero; window.__dev.apex({ distProbe: { dist: 100 } }); window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("L8b STATELESS: saveBlob() SIN clave apex* (efecto 100% derivado) + worldFingerprint(393) byte-estable a través de probes (la mena NO entra al fingerprint; 0 RNG/timer drift)",
     !/"apex[A-Za-z]*"\s*:/.test(saveBlob) && fpBefore === fpAfter, `saveLen=${saveBlob.length} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length}`);

  // ═══ L9 — badge "Apex:▲" render: muestra "Apex: T<n>" con apex EN radio de amenaza, "Apex: —" (estado vacío) SIN apex en radio + movimiento/combate sin crash + fps (criterio 5) ═══
  // El label "Apex:" SIEMPRE se dibuja mientras la mecánica está LIVE (apexVM presente); el CONTENIDO dinámico refleja la proximidad: tier "T2" cerca vs "—" lejos (render/render.js:4251).
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let tCnt = 0, dashCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Apex: T") >= 0) tCnt++; if (t.indexOf("Apex: —") >= 0) dashCnt++; } return orig(t, x, y); };
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });              // apex EN radio de amenaza ⇒ badge "Apex: T2"
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 800));               // warmup tras probes pesadas
    tCnt = 0; dashCnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1600) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const nearT = tCnt, nearDash = dashCnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.apex({ tp: { tx: h.tx - 20, ty: h.ty } });         // apex fuera de radio (>480) ⇒ badge "Apex: —"
    tCnt = 0; dashCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const farT = tCnt, farDash = dashCnt;
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    cx.fillText = orig;
    return { nearT, nearDash, farT, farDash, fps };
  });
  ok("L9 LIVE render (criterio 5): badge muestra \"Apex: T<n>\" con apex EN radio de amenaza (nearT>0, nearDash0) y \"Apex: —\" cuando fuera de radio (farDash>0, farT0); movimiento+combate sin crash; fps sano",
     badge.nearT > 0 && badge.nearDash === 0 && badge.farDash > 0 && badge.farT === 0 && badge.fps >= 50,
     `nearT=${badge.nearT} nearDash=${badge.nearDash} farT=${badge.farT} farDash=${badge.farDash} fps=${badge.fps}`);

  await sleep(250);
  await pageA.evaluate(() => { const h = window.__dev.apex().hero; window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } }); window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync (segundo cliente LIVE, mismo shard) (criterio 7) ═══
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.bringToFront();
  await boot(pageB, errB);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  ok(`L10a cliente B carga el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD, `buildB=${buildB}`);

  // Tiles ABSOLUTOS fijos: ambos clientes inyectan apex + tp héroe a las MISMAS coords (apexNearestDist = fn PURA de posiciones).
  const APEX_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // apex 4 tiles este del héroe (~128px → T2)
  const readNS = async (pg) => await pg.evaluate((AT, HT) => {
    window.__dev.apex({ spawnApex: { tx: AT.tx, ty: AT.ty } });
    window.__dev.apex({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.apex();
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { dist: vm.dist, tier: vm.tier, mats: vm.mats, npDist: np.dist, npKind: np.apex ? np.apex.kind : null, lut, fp, enabled: vm.enabled };
  }, APEX_TILE, HERO_TILE);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  // apexCount NO se compara: nº AMBIENTAL de apex vivos, contaminado por inyecciones de PRUEBA acumuladas en A. La señal determinista per-snapshot (dist/tier/mats + nearestProbe(dist,kind) + LUT + worldFingerprint) es lo shard-consistente (patrón #72).
  const convOK = NA.dist === NB.dist && NA.tier === NB.tier && NA.mats === NB.mats &&
                 NA.npDist === NB.npDist && NA.npKind === NB.npKind &&
                 JSON.stringify(NA.lut) === JSON.stringify(NB.lut) && NA.fp === NB.fp &&
                 NA.enabled === true && NB.enabled === true;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO apex+héroe ⇒ dist/tier/mats + nearestProbe(dist,kind) + LUT distProbe + worldFingerprint IDÉNTICOS byte-a-byte A↔B (0 desync; apexCount ambiental excluido), enabled:true en ambos",
     convOK, `A={dist:${NA.dist},tier:${NA.tier},mats:${NA.mats},npDist:${NA.npDist},npKind:${NA.npKind},fpLen:${NA.fp.length}} B={dist:${NB.dist},tier:${NB.tier},mats:${NB.mats},npDist:${NB.npDist},npKind:${NB.npKind},fpLen:${NB.fp.length}} fpMatch=${NA.fp === NB.fp}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-apex.png") });

  // ═══ L11 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin clave + LUT/fp idénticos (criterio 7) ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.apex", { timeout: 8000 });
  const reconn = await pageB.evaluate((AT, HT) => {
    const s = window.__dev.apex();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });
    window.__dev.apex({ spawnApex: { tx: AT.tx, ty: AT.ty } });
    window.__dev.apex({ tp: { tx: HT.tx, ty: HT.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"apex[A-Za-z]*"\s*:/.test(save), lut, fp };
  }, APEX_TILE, HERO_TILE);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre;
  ok("L11 RECONNECT STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin clave apex* + LUT idéntica + worldFingerprint idéntico (0 drift, 0 persistencia)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), fpMatch: reconn.fp === fpB_pre }));

  // ═══ L12 — sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A + B) (criterio 8) ═══
  ok("L12 ★ 0 JS ERROR: sin errores JS ni 404 (no-favicon) en toda la corrida (cliente A=0 + B=0)",
     errA.length === 0 && errB.length === 0 && net404.length === 0,
     `A=${errA.length} B=${errB.length} 404=${net404.length} ${errA.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, APEX_PROXIMITY.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
