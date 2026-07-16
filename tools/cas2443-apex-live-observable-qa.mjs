// CAS-2443 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para PROXIMIDAD A AMENAZA APEX (APEX_PROXIMITY.enabled:TRUE), EVO mecánica #73.
// Mirror LIVE de la DARK QA CAS-2440. URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = c0318e23765d (== master flip 1b47d09 == gh-pages d588d48 == HTTP served, byte-verificado 2× por CTO+CEO en CAS-2441).
//
// Diferencia clave vs DARK (CAS-2440): enabled:TRUE ⇒ el efecto APEX_PROXIMITY está ACTIVO en el build servido:
//   - apexNearestDist(hero)=min hypot(hero−apexVivo) sobre G.enemies (isBoss/champion/champElite, VIVO: !dead && hp>0) — server-auth.
//   - LUT por PROXIMIDAD: dist≤240→T2/+2 mena, dist≤480→T1/+1 mena, dist>480 / sin apex→T0/+0 (sub-cap apexMatCap=2).
//   - canal FRESCO matFind: matar trash cerca de un apex vivo ⇒ mena extra por el TAIL de killEnemy vía grantMats (trickle fresco per-kill).
//   - apex YA MUERTO excluido (apexIsThreat: !e.dead && e.hp>0) ⇒ matar al apex NO se auto-recompensa.
//   - lejos / sin apex vivo ⇒ +0 (cazar trash seguro lejos del peligro NO da forrajeo — INVERSO a #72 escasez).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE ni de la DARK QA).
// Observado vía __dev.apex (distProbe LUT pura / spawnApex inyección REAL / nearestProbe lectura server-auth / tp / forageMatsPreview) + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2443-apex-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2443-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "c0318e23765d";   // build deployado por el flip APEX_PROXIMITY CAS-2441 (== version.json esperado, gh-pages d588d48)
const DARK_BUILD = "51299d4c1bb0";     // build DARK previo (CAS-2439) — master-only, el LIVE DEBE ser distinto (avanzó del #72 LIVE 8c6257f18c72)

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados) ──
// TABLA: apex vivo más cercano a dist px. tier vigente = el más peligroso (menor max) cuya dist se satisface.
//   dist≤240 → T2 (+2 mena) ; dist≤480 → T1 (+1 mena) ; else → T0 (+0). sub-cap apexMatCap=2.
const CAP = 2;
const oracleTier = (dist) => (dist <= 240 ? 2 : (dist <= 480 ? 1 : 0));
const oracleMats = (dist) => Math.min(CAP, [0, 1, 2][oracleTier(dist)] || 0);
const DISTS = [0, 120, 240, 241, 360, 480, 481, 700, 9999];
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT c0318e23765d, != DARK) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.apex && window.__dev.scarcity && window.__dev.lastStand && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (!= DARK ${DARK_BUILD}); __dev.apex/scarcity/lastStand/saveBlob/worldFingerprint; 0 err/404`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== DARK_BUILD && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} dark=${DARK_BUILD} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 14 flags arco #59-#72 served TRUE + APEX_PROXIMITY #73 served TRUE (15 total) ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const apLive = flag("APEX_PROXIMITY") === "true";
  ok("L2 0-REGRESIÓN: 14 flags arco #59-#72 served true (intactas) + APEX_PROXIMITY #73 served true ⇒ 15 flags LIVE, 0 perdidas",
     arcAllOn && apLive && arc.length === 14, `apex=${flag("APEX_PROXIMITY")} arc=${JSON.stringify(arcLive)}`);

  // params APEX_PROXIMITY served — canal FRESCO matFind + sub-cap apexMatCap 2 + tiers {480:1, 240:2}
  const channelLive = /channel:\s*"matFind"/.test(cfgSrc);
  const capLive = /apexMatCap:\s*2\b/.test(cfgSrc);
  const tiersLive = /max:\s*480,\s*mats:\s*1/.test(cfgSrc) && /max:\s*240,\s*mats:\s*2/.test(cfgSrc);
  ok("L2b params APEX_PROXIMITY served: channel matFind + apexMatCap 2 + tiers {480:+1, 240:+2}",
     channelLive && capLive && tiersLive, `channel=${channelLive} cap=${capLive} tiers=${tiersLive}`);

  // dead-apex exclusion guardado en el CÓDIGO SERVIDO: apexIsThreat exige !e.dead && hp>0 ⇒ matar al apex NO se auto-recompensa
  const simSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const deadGuard = /function apexIsThreat\([^)]*\)\{[^}]*!e\.dead[^}]*e\.hp>0/.test(simSrc.replace(/\s+/g, " "));
  ok("L2c DEAD-APEX EXCLUIDO (served-code): apexIsThreat exige (!e.dead && e.hp>0) ⇒ apexNearestDist ignora apex muerto ⇒ matar al apex NO se auto-recompensa",
     deadGuard, `guardPresent=${deadGuard}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel matFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.apex());
  ok("L3 LIVE default: __dev.apex().enabled === TRUE (flip aplicado), channel matFind, gExists false (STATELESS, G.apex nunca se crea), cap 2",
     st.enabled === true && st.channel === "matFind" && st.gExists === false && st.cap === 2,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap}`);

  // ═══ L4 — LUT PURA re-derivada: distProbe.tier/mats == oracleTier/oracleMats byte-exacto sobre sweep ═══
  const tab = await pageA.evaluate((dists) => dists.map(d => window.__dev.apex({ distProbe: { dist: d } }).distProbe), DISTS);
  const tabOK = DISTS.every((d, i) => tab[i] && tab[i].tier === oracleTier(d) && tab[i].mats === oracleMats(d));
  ok("L4 LUT PURA re-derivada: distProbe.tier/mats == oráculo byte-exacto (≤240→T2/+2, ≤480→T1/+1, >480→T0/+0)",
     tabOK, JSON.stringify(DISTS.map((d, i) => ({ d, got: tab[i], exp: { t: oracleTier(d), m: oracleMats(d) } }))));

  // ═══ L5 — REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1 ═══
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;                                  // tile actual del héroe
    window.__dev.apex({ spawnApex: { tx: h.tx + 3, ty: h.ty } });        // apex REAL 3 tiles al este (~96px → T2)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });                   // héroe de vuelta a su tile
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const vm = window.__dev.apex();
    return { np, apexCount: vm.apexCount, tier: vm.tier, dist: vm.dist, mats: vm.mats };
  });
  ok("L5 ★ REAL SERVER-AUTH: spawnApex inyecta mob REAL isBoss; nearestProbe lee dist REAL>0 + kind boss + apexCount≥1; VM tier T2 por proximidad",
     server5.np && server5.np.dist > 0 && server5.np.apex && server5.np.apex.kind === "boss" && server5.apexCount >= 1 && server5.tier === oracleTier(server5.dist),
     JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN toggle): apex cerca ⇒ mena>0 por tier; lejos ⇒ +0 (control) ═══
  const forage = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });        // ~128px → T2 (+2)
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.apex();
    const nearPrev = nearVm.forageMatsPreview, nearMats = nearVm.mats, nearTier = nearVm.tier, nearDist = nearVm.dist;
    window.__dev.apex({ tp: { tx: h.tx + 30, ty: h.ty } });              // héroe 30 tiles (~960px > 480) → T0 (+0)
    const farVm = window.__dev.apex();
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    return { enabled: nearVm.enabled, nearPrev, nearMats, nearTier, nearDist, farPrev: farVm.forageMatsPreview, farTier: farVm.tier, farMats: farVm.mats };
  });
  const forageOK = forage.enabled === true && forage.nearPrev > 0 && forage.nearPrev === forage.nearMats &&
                   forage.nearMats === oracleMats(forage.nearDist) && forage.farPrev === 0 && forage.farTier === 0 && forage.farMats === 0;
  ok("L6 ★ EFECTO ACTIVO LIVE: (enabled:true) apex cerca ⇒ forageMatsPreview = mena por tier = oráculo > 0; héroe lejos (>480px) ⇒ +0 (control, cazar seguro NO forrajea)",
     forageOK, JSON.stringify(forage) + ` oracleNear=${oracleMats(forage.nearDist)}`);

  // ═══ L7 — SUB-CAP propio apexMatCap=2: ningún dist produce mats>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let d = 0; d <= 700; d += 10) vals.push(window.__dev.apex({ distProbe: { dist: d } }).distProbe.mats);
    return { max: Math.max(...vals), cap: window.__dev.apex().cap }; });
  ok("L7 ★ SUB-CAP apexMatCap: ningún dist produce mats>2 (sweep dist∈[0,700]); cap==2 (mena/kill acotada, no stacking)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — DIFERENCIADOR/INVERSO: apex ≤240 ⇒ T2 por PRESENCIA (INVERSO a #72 escasez/ausencia y a #69 engage); SCARCITY_EDGE + LAST_STAND LIVE coexisten ⊥ ═══
  const diff = await pageA.evaluate(() => {
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 5, ty: h.ty } });        // apex ~160px (≤240) → T2 por PRESENCIA
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.apex();
    const sc = window.__dev.scarcity ? window.__dev.scarcity() : null;   // primo recompensa-forrajeo #72 LIVE — coexiste ⊥ (eje AUSENCIA)
    const ls = window.__dev.lastStand ? window.__dev.lastStand() : null; // #69 LIVE — coexiste ⊥ (eje ENGANCHADOS)
    return { tier: vm.tier, dist: vm.dist, mats: vm.mats, scEnabled: sc ? sc.enabled : null, lsEnabled: ls ? ls.enabled : null };
  });
  const diffOK = diff.tier === 2 && diff.dist > 0 && diff.dist <= 240 && diff.mats === 2 && diff.scEnabled === true && diff.lsEnabled === true;
  ok("L8 ★ DIFERENCIADOR/INVERSO: apex a ≤240px ⇒ T2 por PRESENCIA de un apex CONCRETO (INVERSO a #72 ausencia/escasez y a #69 engage); SCARCITY_EDGE + LAST_STAND LIVE coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // ═══ L9 — STATELESS + ORTOGONALIDAD: save sin clave + 11 canales-peer intactos al mover el apex + fp estable ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("L9a STATELESS: saveBlob() SIN clave apex* (efecto 100% derivado de posiciones del mundo, 0 persistencia)",
     !/"apex[A-Za-z]*"\s*:/.test(saveBlob), `saveLen=${saveBlob.length}`);

  const orth = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.apex(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview }; };
    const h = window.__dev.apex().hero;
    // héroe LEJOS de apex (T0) — snapshot de peers
    window.__dev.apex({ tp: { tx: h.tx + 30, ty: h.ty } });
    const peersFar = snap();
    // héroe PEGADO al apex (T2) — los 11 peers NO deben cambiar por la proximidad apex
    window.__dev.apex({ spawnApex: { tx: h.tx, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    const peersNear = snap();
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    return { peersUnchanged: JSON.stringify(peersFar) === JSON.stringify(peersNear), peersFar };
  });
  ok("L9b ★ ORTOGONALIDAD matFind ⊥ ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind: la proximidad apex (T0→T2) NO cambia ningún canal-peer (0 doble-dip, seams distintos)",
     orth.peersUnchanged, JSON.stringify(orth));

  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.apex().hero; window.__dev.apex({ distProbe: { dist: 100 } }); window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("L9c worldFingerprint(393) byte-estable a través de probes (la mena/proximidad NO entra al fingerprint; 0 RNG/timer drift)",
     fpBefore === fpAfter, `stable=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // ═══ L10 — badge "Apex:" render + movimiento/combate sin crash + fps sano (régimen permanente) ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Apex:") >= 0) cnt++; return orig(t, x, y); };
    const h = window.__dev.apex().hero;
    window.__dev.apex({ spawnApex: { tx: h.tx + 4, ty: h.ty } });
    window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } });
    // warmup 700ms tras probes pesadas
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    cnt = 0; let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 2000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    cx.fillText = orig;
    return { badgeCnt: cnt, fps };
  });
  ok("L10 LIVE render: movimiento (ArrowRight) + combate (Digit1) sin crash; fps RÉGIMEN PERMANENTE sano (≥55); badge \"Apex:\" DIBUJA (enabled:true + apex cerca ⇒ count>0, contraste con DARK count==0)",
     badge.fps >= 55 && badge.badgeCnt > 0, `badgeCnt=${badge.badgeCnt} fps=${badge.fps}`);

  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });
  await pageA.evaluate(() => { const h = window.__dev.apex().hero; window.__dev.apex({ spawnApex: { tx: h.tx + 3, ty: h.ty } }); window.__dev.apex({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(200);
  await pageA.screenshot({ path: join(OUT, "apex-near.png") });

  // ═══ L11 — North Star 2-cliente / 0-desync (segundo cliente LIVE, mismo shard, MISMO apex+héroe) ═══
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await pageB.bringToFront();
  await boot(pageB, errB);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  ok(`L11a cliente B carga el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD, `buildB=${buildB}`);

  // Coordenadas ABSOLUTAS FIJAS ⇒ ambos clientes teleportan héroe + apex a las MISMAS posiciones (apexNearestDist = fn PURA de posiciones).
  const APEX_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 64, ty: 40 };   // apex 4 tiles al este del héroe (~128px → T2)
  const readNS = async (pg) => await pg.evaluate((AT, HT) => {
    window.__dev.apex({ spawnApex: { tx: AT.tx, ty: AT.ty } });
    window.__dev.apex({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.apex();
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });   // LUT PURA
    const np = window.__dev.apex({ nearestProbe: true }).nearestProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { dist: vm.dist, tier: vm.tier, mats: vm.mats, enabled: vm.enabled, npDist: np.dist, npKind: np.apex ? np.apex.kind : null, lut, fp };
  }, APEX_TILE, HERO_TILE);
  const NA = await readNS(pageA);
  const NB = await readNS(pageB);
  // apexCount NO se compara: es el nº AMBIENTAL de apex vivos, contaminado por las inyecciones de PRUEBA que A acumuló en L5-L10 (B es fresco).
  // El SIGNAL determinista per-snapshot dado el MISMO apex+héroe — dist/tier/mats + nearestProbe(dist,kind) + LUT PURA + worldFingerprint — es lo shard-consistente. (Patrón #72.)
  const convOK = NA.dist === NB.dist && NA.tier === NB.tier && NA.mats === NB.mats && NA.npDist === NB.npDist && NA.npKind === NB.npKind &&
                 JSON.stringify(NA.lut) === JSON.stringify(NB.lut) && NA.enabled === true && NB.enabled === true;
  ok("L11b ★ NORTH STAR 2-CLIENTE: MISMO apex+héroe ⇒ dist/tier/mats + nearestProbe(dist,kind) + LUT distProbe IDÉNTICOS A↔B, enabled:true en ambos (0 desync; apexCount ambiental excluido)",
     convOK, `A={dist:${NA.dist},tier:${NA.tier},mats:${NA.mats},npDist:${NA.npDist},npKind:${NA.npKind}} B={dist:${NB.dist},tier:${NB.tier},mats:${NB.mats},npDist:${NB.npDist},npKind:${NB.npKind}} lut=${JSON.stringify(NA.lut) === JSON.stringify(NB.lut)}`);
  ok("L11c ★ NORTH STAR 2-CLIENTE: worldFingerprint(393) IDÉNTICO byte-a-byte A↔B (shard replicado, misma semilla, 0 desync)",
     NA.fp === NB.fp, `len=${NA.fp.length} match=${NA.fp === NB.fp}`);

  // ═══ L12 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin clave + fp estable + LUT idéntica ═══
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.apex", { timeout: 8000 });
  const reconn = await pageB.evaluate(() => {
    const s = window.__dev.apex();
    const lut = [100, 300, 500].map(d => { const p = window.__dev.apex({ distProbe: { dist: d } }).distProbe; return { dist: d, tier: p.tier, mats: p.mats }; });
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, channel: s.channel, cap: s.cap, hasKey: /"apex[A-Za-z]*"\s*:/.test(save), lut, fp };
  });
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.channel === "matFind" && reconn.cap === 2 &&
                   reconn.hasKey === false && reconn.fp === NB.fp && JSON.stringify(reconn.lut) === JSON.stringify(NB.lut);
  ok("L12 RECONNECT STATELESS 0-drift: tras reload, enabled:true + gExists false + channel matFind + cap 2 + save sin clave + fp estable + LUT idéntica (0 drift, 0 persistencia)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, fpMatch: reconn.fp === NB.fp, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) }));

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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, APEX_PROXIMITY.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
