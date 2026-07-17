// CAS-2492 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para FRAGOR DE FUEGO CRUZADO (CROSSFIRE_FRAY_SURGE.enabled:TRUE), EVO mecánica #81 (23º flag del arco).
// Mirror LIVE de la DARK QA CAS-2490 (tools/cas2490-crossfirefray-dark-indep-qa.mjs). Patrón LIVE = cas2487 (CARNAGE_FIELD_SURGE #80).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 84a85f083453 (== flip CAS-2491 master be1a2c1+62219d8 == deploy tools/cas2491-deploy.mjs == gh-pages dcfed908 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2490): enabled:TRUE ⇒ el efecto CROSSFIRE_FRAY_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - crossfireFrayScore(h)=Σ frayWeights[side] sobre los proyectiles EN VUELO de G.projectiles dentro de radius260 (server-auth; poblados por spawns de combate, avanzados updateProjectiles paso-fijo).
//   - TABLA por score: score≥5→T2/ember2, [2,4]→T1/ember1, 0/1→T0/ember0 (sub-cap frayEmberCap=2).
//   - fuego ENTRANTE (enemy) pesa DOBLE (weight 2); fuego propio (hero) weight 1 ⇒ una bala tuya solitaria (score 1) NO forrajea.
//   - canal FRESCO frayFind: rematar mobs MIENTRAS el aire de la vecindad está DENSO en proyectiles ⇒ +ascuas de fragor (grantEmber a h.frayEmbers, recurso TRANSITORIO fuera del save+fingerprint).
//     forageEmberPreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo.
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; matanza EN MEDIO de un fuego cruzado denso (score≥5) ⇒ forrajea. `_frayPre` muestreado en el TOP de killEnemy.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.crossfireFray (scoreProbe/spawnProj/frayProbe/clearProj/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Fragor:" vía ctx.fillText.
// Run: node tools/cas2492-crossfirefray-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2492-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "84a85f083453";   // build deployado por el flip CROSSFIRE_FRAY_SURGE CAS-2491 (== version.json esperado)
const PREV_LIVE = "a6cac7667834";      // build servido previo (#80 CARNAGE_FIELD_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde el SPEC servido ──
// frayWeights {enemy:2 (entrante, doble), hero:1}; tiers score 0/1→T0/0, [2,4]→T1/1, ≥5→T2/2; frayEmberCap 2; radius 260; TS 32.
const TS = 32;
const RADIUS = 260;
const WEIGHTS = { enemy: 2, hero: 1 };   // fuego entrante pesa doble; lado ausente ⇒ 1 (fallback)
const CAP = 2;
const myWeight = (side) => (WEIGHTS[side] != null ? WEIGHTS[side] : 1);
const myTier = (score) => (score >= 5 ? 2 : score >= 2 ? 1 : 0);          // 0/1→T0, [2,4]→T1, ≥5→T2
const myEmber = (score) => Math.min(CAP, [0, 1, 2][myTier(score)]);       // T0→0, T1→1, T2→2, capped 2
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // distancia misma-fila px
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 6, 9, 12, 99].map(s => ({ s, t: myTier(s), e: myEmber(s) }));
// 22 flags del arco #59-#80 (CROSSFIRE_FRAY_SURGE es #81, el nuevo). Todas deben seguir served:true.
const ARC22 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAFray";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #80 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.crossfireFray && window.__dev.carnageField && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.crossfireFray/carnageField/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 22 flags arco #59-#80 served TRUE + CROSSFIRE_FRAY_SURGE #81 served TRUE ⇒ 23 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC22.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsLive = flag("CROSSFIRE_FRAY_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 22 flags arco #59-#80 served true (intactas) + CROSSFIRE_FRAY_SURGE #81 served true ⇒ 23 flags LIVE, 0 perdidas",
     arcAllOn && cfsLive && ARC22.length === 22, `crossfire=${flag("CROSSFIRE_FRAY_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params CROSSFIRE_FRAY_SURGE served — canal FRESCO frayFind + sub-cap frayEmberCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"frayFind"/.test(cfgSrc);
  const capLive = /frayEmberCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("CROSSFIRE_FRAY_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /frayWeights:\s*\{\s*enemy:\s*2,\s*hero:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params CROSSFIRE_FRAY_SURGE served: channel frayFind + frayEmberCap 2 + radius 260 + frayWeights{enemy:2,hero:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel frayFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.crossfireFray());
  ok("L3 LIVE default: __dev.crossfireFray().enabled === TRUE (flip aplicado), channel frayFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "frayFind" && st.gExists === false && st.cap === CAP && st.radius === RADIUS,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/ember == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.crossfireFray({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].ember === c.e) && tab.every(r => r.ember <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/ember == oracle byte-exacto (0/1→T0/0, [2,4]→T1/1, ≥5→T2/2) + sub-cap frayEmberCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.e], game: [tab[i].tier, tab[i].ember] }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnProj inyecta proyectil REAL en G.projectiles; frayProbe lee score REAL ═══
  //   per-side weight (enemy=2, hero=1) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const sides = ["enemy", "hero"];
  const perSide = await pageA.evaluate((ss) => {
    const out = [];
    for (const side of ss) {
      window.__dev.crossfireFray({ clearProj: true });
      const h = window.__dev.crossfireFray().hero;
      window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 2, ty: h.ty, side } });   // 64px, en radio
      window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
      const pr = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
      window.__dev.crossfireFray({ clearProj: true });
      out.push({ side, probeScore: pr.score, probeCount: pr.count, probeSide: pr.projs[0] ? pr.projs[0].side : null, probeWeight: pr.projs[0] ? pr.projs[0].weight : null });
    }
    return out;
  }, sides);
  const rad = await pageA.evaluate(() => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.crossfireFray({ clearProj: true });
      const h = window.__dev.crossfireFray().hero;
      window.__dev.crossfireFray({ spawnProj: { tx: h.tx + d, ty: h.ty, side: "enemy" } });
      window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
      res[tag] = window.__dev.crossfireFray({ frayProbe: true }).frayProbe.score;
      window.__dev.crossfireFray({ clearProj: true });
    }
    return res;
  });
  const perSideOK = perSide.every(r => r.probeWeight === myWeight(r.side) && r.probeScore === myWeight(r.side) && r.probeCount === 1 && r.probeSide === r.side);
  const radOK = rad.in > 0 && rad.out === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnProj→G.projectiles, frayProbe lee score REAL; INDEP per-side enemy=+2 (entrante doble) hero=+1 == my frayWeights[side]; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     perSideOK && radOK, `perSide=${JSON.stringify(perSide.map(r => ({ s: r.side, mine: myWeight(r.side), game: r.probeWeight, sc: r.probeScore })))} rad=${JSON.stringify(rad)} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): aire denso ⇒ +ember por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h0 = window.__dev.crossfireFray().hero;
    const RX = h0.tx + 120, RY = h0.ty + 50;
    window.__dev.crossfireFray({ clearProj: true });
    // FUEGO CRUZADO DENSO: 3 proyectiles enemy (2×3=6) ⇒ score≥5 ⇒ T2/ember2
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 1, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 2, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ spawnProj: { tx: RX + 3, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });                                   // héroe en el fuego cruzado denso
    const nearVm = window.__dev.crossfireFray();
    const nearBank = nearVm.forageEmberPreview;   // lo que banca UN kill ahora mismo (canal frayFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin proyectiles en radio ⇒ T0/+0 control
    window.__dev.crossfireFray({ tp: { tx: RX - 40, ty: RY } });
    const farVm = window.__dev.crossfireFray();
    window.__dev.crossfireFray({ clearProj: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, ember: nearVm.ember, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, ember: farVm.ember, preview: farVm.forageEmberPreview, tag: farVm.tag },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score === 6 && effect.near.tier === 2 && effect.near.ember === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.ember === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === myTier(effect.near.score) && effect.near.ember === myEmber(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): 3 proyectiles enemy (score 6) en radio ⇒ ember+2/T2 + forageEmberPreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; fuego cruzado denso ⇒ 2 ═══
  //   Refleja `_frayPre` (snapshot en el TOP de killEnemy): densidad PRE-kill 0 ⇒ 0 ascuas (una bala tuya NO forrajea).
  const anti = await pageA.evaluate(() => {
    const et = () => window.__dev.crossfireFray().hero.frayEmbers | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _frayPre=0 ⇒ 0 forage
    window.__dev.crossfireFray({ clearProj: true });
    const h0 = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.crossfireFray({ frayProbe: true }).frayProbe.score;
    const etA0 = et();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = et() - etA0;
    // B: kill DENTRO de un fuego cruzado denso ⇒ _frayPre≥5 ⇒ forage T2/cap2
    window.__dev.crossfireFray({ clearProj: true });
    const h1 = window.__dev.crossfireFray().hero;
    for (const dx of [1, 2, 3]) window.__dev.crossfireFray({ spawnProj: { tx: h1.tx + dx, ty: h1.ty, side: "enemy" } });   // 2×3=6 ⇒ score6
    window.__dev.crossfireFray({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.crossfireFray({ frayProbe: true }).frayProbe.score;
    const etB0 = et();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");           // kill REAL en medio del fuego cruzado
    const deltaB = et() - etB0;
    window.__dev.crossfireFray({ clearProj: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 5 && anti.deltaB === myEmber(anti.baseScoreB) && anti.deltaB === 2;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δember 0 (una bala tuya NO forrajea); fuego cruzado denso (pre≥5) ⇒ Δember == my LUT ember=2 (refleja _frayPre pre-kill)",
     antiOK, JSON.stringify({ ...anti, myLut: myEmber(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio frayEmberCap=2: ningún score produce ember>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.crossfireFray({ scoreProbe: { score: s } }).scoreProbe.ember);
    return { max: Math.max(...vals), cap: window.__dev.crossfireFray().cap }; });
  ok("L7 ★ SUB-CAP frayEmberCap: ningún score produce ember>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL frayFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const frayFindCount = chanDecls.filter(c => c === "frayFind").length;
  const arcChannels = ARC22.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesFray = arcChannels.every(c => c !== "frayFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.crossfireFray(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview,
      flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.crossfireFray({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL frayFind AISLADO / NO DOBLE-DIP: served declara `channel:\"frayFind\"` EXACTAMENTE 1× (CROSSFIRE_FRAY_SURGE) + NINGUNA de las 22 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 17 peers byte-idénticos)",
     frayFindCount === 1 && noArcUsesFray && pure.unchanged,
     `frayFindDecls=${frayFindCount} arcUsesFray=${!noArcUsesFray} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave frayEmbers/frayFind/crossfireFray + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.crossfireFray().hero; window.__dev.crossfireFray({ scoreProbe: { score: 6 } }); window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 200, ty: h.ty + 80, side: "enemy" } }); window.__dev.crossfireFray({ clearProj: true }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"frayEmbers"\s*:/.test(saveBlob) && !/"(crossfireFray|frayFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN frayEmbers/crossfireFray/frayFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las ascuas NO entran al fingerprint; proyectiles de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Fragor:" render (ctx.fillText) con fuego cruzado denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Fragor:") >= 0) glyphCnt++; return orig(t, x, y); };
    const h0 = window.__dev.crossfireFray().hero;
    const RX = h0.tx + 130, RY = h0.ty + 68;
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con fuego cruzado denso fresco en radio ⇒ tag + glifo dibujado
    window.__dev.crossfireFray({ clearProj: true });
    for (const dx of [1, 2, 3]) window.__dev.crossfireFray({ spawnProj: { tx: RX + dx, ty: RY, side: "enemy" } });
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    const nearTag = window.__dev.crossfireFray().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.crossfireFray({ tp: { tx: RX - 40, ty: RY } });
    const farTag = window.__dev.crossfireFray().tag;
    window.__dev.crossfireFray({ clearProj: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  });
  ok("L9 LIVE render: con fuego cruzado denso EN radio parado ⇒ vm.tag (Fragor:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥22: inyectar proyectiles ⇒ fragor→T2 MIENTRAS carnicería#80/botín#79/furia#78/hazard#77 IGNORAN + lootQuality#63/#68 sin cambio ═══
  const diff = await pageA.evaluate(() => {
    const h0 = window.__dev.crossfireFray().hero;
    const RX = h0.tx - 175, RY = h0.ty + 74;
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    const s0 = window.__dev.crossfireFray();
    const base = s0.score;
    const carB = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;
    const spoB = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrB = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazB = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const lootB = s0.lootQualityFloor;
    for (const dx of [1, 2, 3]) window.__dev.crossfireFray({ spawnProj: { tx: RX + dx, ty: RY, side: "enemy" } });   // 2×3=6 ⇒ T2
    window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } });
    const s1 = window.__dev.crossfireFray();
    const carA = window.__dev.carnageField ? window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score : 0;
    const spoA = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrA = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazA = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const lootA = s1.lootQualityFloor;
    const caOn = window.__dev.carnageField ? window.__dev.carnageField().enabled : null;
    const soOn = window.__dev.spoilsField ? window.__dev.spoilsField().enabled : null;
    const enOn = window.__dev.enrageSurge ? window.__dev.enrageSurge().enabled : null;
    const hzOn = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    window.__dev.crossfireFray({ clearProj: true });
    return { base, score: s1.score, tier: s1.tier, ember: s1.ember,
      carB, carA, spoB, spoA, enrB, enrA, hazB, hazA, lootB, lootA, caOn, soOn, enOn, hzOn };
  });
  const diffOK = diff.score - diff.base === 6 && diff.tier === 2 && diff.ember === 2 &&
    diff.carA === diff.carB && diff.spoA === diff.spoB && diff.enrA === diff.enrB && diff.hazA === diff.hazB && diff.lootA === diff.lootB &&
    diff.caOn === true && diff.soOn === true && diff.enOn === true && diff.hzOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥22: inyectar proyectiles ⇒ fragor Δ+6→T2 MIENTRAS carnicería#80/botín#79/furia#78/hazard#77 IGNORAN (score sin cambio) + lootQuality#63/#68 sin cambio; todos los vecinos enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.crossfireFray().hero; const RX = h.tx + 130, RY = h.ty + 80; window.__dev.crossfireFray({ clearProj: true }); for (const dx of [1, 2, 3]) window.__dev.crossfireFray({ spawnProj: { tx: RX + dx, ty: RY, side: "enemy" } }); window.__dev.crossfireFray({ tp: { tx: RX, ty: RY } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian proyectiles, inyectan el MISMO fuego cruzado (enemy+hero) + tp héroe a las MISMAS coords.
  const PA = { tx: 60, ty: 40 }, PB = { tx: 61, ty: 40 }, HT = { tx: 63, ty: 40 };   // proyectiles 2-3 tiles al oeste del héroe (en radio)
  const readNS = async (pg) => await pg.evaluate((PA, PB, HT) => {
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ spawnProj: { tx: PA.tx, ty: PA.ty, side: "enemy" } });   // 2
    window.__dev.crossfireFray({ spawnProj: { tx: PB.tx, ty: PB.ty, side: "hero" } });     // 1
    window.__dev.crossfireFray({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.crossfireFray();
    const lut = [0, 1, 2, 5].map(s => { const p = window.__dev.crossfireFray({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, e: p.ember }; });
    const sp = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const embers = vm.hero ? (vm.hero.frayEmbers | 0) : null;
    window.__dev.crossfireFray({ clearProj: true });
    return { score: vm.score, tier: vm.tier, ember: vm.ember, preview: vm.forageEmberPreview, tag: vm.tag, spScore: sp.score, spCount: sp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, embers };
  }, PA, PB, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = myWeight("enemy") + myWeight("hero");   // 3 ⇒ T1 ember 1
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.ember === NC.ember && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === myTier(expScore) && NB.ember === myEmber(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMOS proyectiles+héroe (2 clientes FRESCOS) ⇒ score/tier/ember + frayProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=3→T1/ember1, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},ember:${NB.ember},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},ember:${NC.ember},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${myTier(expScore)},ember:${myEmber(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — ASCUAS PER-HERO (no compartidas, no dup entre clientes): h.frayEmbers transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"frayEmbers"\s*:/.test(NB.fp) && !/"frayEmbers"\s*:/.test(NC.fp) && typeof NB.embers === "number" && typeof NC.embers === "number";
  ok("L10c ★ ASCUAS PER-HERO (no shared / no dup 2-cliente): h.frayEmbers transitorio per-hero, FUERA del save+worldFingerprint ⇒ las ascuas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_embers=${NB.embers} C_embers=${NC.embers} fpHasEmberKey=${/"frayEmbers"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-crossfirefray.png") });

  // ═══ L11 — RECONEXIÓN mid-fuego STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin frayEmbers + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.crossfireFray", { timeout: 8000 });
  const reconn = await pageB.evaluate((PA, PB, HT) => {
    const s = window.__dev.crossfireFray();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 5].map(sc => { const p = window.__dev.crossfireFray({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, e: p.ember }; });
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ spawnProj: { tx: PA.tx, ty: PA.ty, side: "enemy" } });
    window.__dev.crossfireFray({ spawnProj: { tx: PB.tx, ty: PB.ty, side: "hero" } });
    window.__dev.crossfireFray({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.crossfireFray();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.crossfireFray({ clearProj: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"frayEmbers"\s*:|"(crossfireFray|frayFind)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, PA, PB, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 1 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-fuego STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin frayEmbers/frayFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T1/tag Fragor:) (0 drift, 0 persistencia indebida de ascuas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, CROSSFIRE_FRAY_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#81 23º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
