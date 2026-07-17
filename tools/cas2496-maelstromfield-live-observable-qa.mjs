// CAS-2496 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para VORÁGINE DE ZONAS DE ÁREA (MAELSTROM_FIELD_SURGE.enabled:TRUE), EVO mecánica #82 (24º flag del arco).
// Mirror LIVE de la DARK QA CAS-2494 (tools/cas2494-maelstromfield-dark-indep-qa.mjs). Patrón LIVE = cas2492 (CROSSFIRE_FRAY_SURGE #81).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 05406d893454 (== flip CAS-2495 master 23f97e2+fa7e8d8 == deploy tools/cas2495-deploy.mjs == gh-pages 940e7898 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2494): enabled:TRUE ⇒ el efecto MAELSTROM_FIELD_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - maelstromFieldScore(h)=Σ maelstromWeights[tamaño] sobre las zonas de negación de área de G.fields cuyo CENTRO ∈ radius260 (server-auth; pobladas por castSpell, tickeadas updateFields paso-fijo).
//   - TABLA por score: tiers[{min:2,ch:1},{min:4,ch:2}] ⇒ 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2 (sub-cap maelstromChargeCap=2).
//   - zona GRANDE (f.r≥largeR60) pesa DOBLE (weight 2); zona pequeña weight 1 ⇒ una zona pequeña incidental (score 1) NO forrajea.
//   - canal FRESCO maelstromFind: rematar mobs MIENTRAS el héroe está DENTRO de una vorágine densa ⇒ +cargas de vorágine (grantMaelstromCharge a h.maelstromCharges, recurso TRANSITORIO fuera del save+fingerprint).
//     forageChargePreview = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo.
//   - ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (score 0) ⇒ forrajeo 0; matanza DENTRO de una vorágine densa (score≥4) ⇒ forrajea. `_maelPre` muestreado en el TOP de killEnemy.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.maelstromField (scoreProbe/spawnField/fieldProbe/clearField/tp) + affixSpawnKill (kill REAL) + peers + __dev.saveBlob/worldFingerprint. Badge glifo "Vorágine:" vía ctx.fillText.
// Run: node tools/cas2496-maelstromfield-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2496-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "05406d893454";   // build deployado por el flip MAELSTROM_FIELD_SURGE CAS-2495 (== version.json esperado)
const PREV_LIVE = "84a85f083453";      // build servido previo (#81 CROSSFIRE_FRAY_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde el SPEC servido ──
// maelstromWeights {large:2 (f.r≥largeR60), small:1}; tiers [{min:2,ch:1},{min:4,ch:2}] ⇒ 0/1→T0/0, [2,3]→T1/1, ≥4→T2/2; maelstromChargeCap 2; radius 260; largeR 60; TS 32.
const TS = 32;
const RADIUS = 260;
const LARGE_R = 60;
const CAP = 2;
const TIERS = [{ min: 2, ch: 1 }, { min: 4, ch: 2 }];
const oWeight = (r) => ((+r || 0) >= LARGE_R ? 2 : 1);         // grande≥60⇒2, pequeña⇒1, ausente⇒1
const myTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };  // 0/1→T0,[2,3]→T1,≥4→T2
const myCharge = (score) => { const t = myTier(score); if (t <= 0) return 0; return Math.max(0, Math.min(CAP, TIERS[t - 1].ch)); };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // distancia misma-fila px
const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 6, 9, 12, 99].map(s => ({ s, t: myTier(s), c: myCharge(s) }));
const R_LARGE = 64, R_SMALL = 40;   // radios de prueba: large≥60⇒w2, small<60⇒w1
// 23 flags del arco #59-#81 (MAELSTROM_FIELD_SURGE es #82, el nuevo). Todas deben seguir served:true.
const ARC23 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAMael";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #81 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.maelstromField && window.__dev.crossfireFray && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.maelstromField/crossfireFray/affixSpawnKill/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 23 flags arco #59-#81 served TRUE + MAELSTROM_FIELD_SURGE #82 served TRUE ⇒ 24 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC23.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const mfsLive = flag("MAELSTROM_FIELD_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 23 flags arco #59-#81 served true (intactas) + MAELSTROM_FIELD_SURGE #82 served true ⇒ 24 flags LIVE, 0 perdidas",
     arcAllOn && mfsLive && ARC23.length === 23, `maelstrom=${flag("MAELSTROM_FIELD_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params MAELSTROM_FIELD_SURGE served — canal FRESCO maelstromFind + sub-cap maelstromChargeCap:2 + radio 260 + largeR 60 + weights
  const channelLive = /channel:\s*"maelstromFind"/.test(cfgSrc);
  const capLive = /maelstromChargeCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("MAELSTROM_FIELD_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const lrLive = new RegExp("MAELSTROM_FIELD_SURGE[\\s\\S]*?largeR:\\s*60").test(cfgSrc);
  const wLive = /maelstromWeights:\s*\{\s*large:\s*2,\s*small:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params MAELSTROM_FIELD_SURGE served: channel maelstromFind + maelstromChargeCap 2 + radius 260 + largeR 60 + maelstromWeights{large:2,small:1}",
     channelLive && capLive && radLive && lrLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} largeR=${lrLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel maelstromFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.maelstromField());
  ok("L3 LIVE default: __dev.maelstromField().enabled === TRUE (flip aplicado), channel maelstromFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "maelstromFind" && st.gExists === false && st.cap === CAP && st.radius === RADIUS,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.maelstromField({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].charge === c.c) && tab.every(r => r.charge <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/charge == oracle byte-exacto (0/1→T0/0, [2,3]→T1/1, ≥4→T2/2) + sub-cap maelstromChargeCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.c], game: [tab[i].tier, tab[i].charge] }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnField inyecta zona REAL en G.fields; fieldProbe lee score REAL ═══
  //   per-tamaño weight (large=2, small=1) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  const perSize = await pageA.evaluate((rs) => {
    const out = [];
    for (const [tag, r] of rs) {
      window.__dev.maelstromField({ clearField: true });
      const h = window.__dev.maelstromField().hero;
      const sp = window.__dev.maelstromField({ spawnField: { tx: h.tx, ty: h.ty, r } }).spawnField;   // zona sobre el héroe
      const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
      window.__dev.maelstromField({ clearField: true });
      out.push({ tag, r, spawnW: sp ? sp.weight : null, probeScore: fp.score, probeCount: fp.count, probeW: fp.fields[0] ? fp.fields[0].weight : null });
    }
    return out;
  }, [["large", R_LARGE], ["small", R_SMALL]]);
  const rad = await pageA.evaluate(() => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.maelstromField({ clearField: true });
      const h0 = window.__dev.maelstromField().hero;
      window.__dev.maelstromField({ tp: { tx: h0.tx, ty: h0.ty } });   // snap héroe a centro de tile (evita offset px fraccional)
      const h = window.__dev.maelstromField().hero;
      window.__dev.maelstromField({ spawnField: { tx: h.tx + d, ty: h.ty, r: 40 } });
      const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
      res[tag] = { score: fp.score, count: fp.count };
      window.__dev.maelstromField({ clearField: true });
    }
    return res;
  });
  const perSizeOK = perSize.every(r => r.spawnW === oWeight(r.r) && r.probeW === oWeight(r.r) && r.probeScore === oWeight(r.r) && r.probeCount === 1)
    && perSize.find(r => r.tag === "large").spawnW === 2 && perSize.find(r => r.tag === "small").spawnW === 1;
  const radOK = rad.in.score > 0 && rad.in.count >= 1 && rad.out.score === 0 && rad.out.count === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnField→G.fields, fieldProbe lee score REAL; INDEP per-tamaño grande=+2 small=+1 == my maelstromWeights; radius-boundary Δ8=256px=EN / Δ9=288px=FUERA",
     perSizeOK && radOK, `perSize=${JSON.stringify(perSize.map(r => ({ tag: r.tag, mine: oWeight(r.r), game: r.probeW, sc: r.probeScore })))} rad=${JSON.stringify(rad)} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): vorágine densa ⇒ +charge por tier; aire limpio ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h0 = window.__dev.maelstromField().hero;
    const RX = h0.tx + 120, RY = h0.ty + 50;
    window.__dev.maelstromField({ clearField: true });
    // VORÁGINE DENSA: 2 zonas GRANDES (2×2=4) ⇒ score≥4 ⇒ T2/charge2
    window.__dev.maelstromField({ spawnField: { tx: RX + 1, ty: RY, r: 64 } });
    window.__dev.maelstromField({ spawnField: { tx: RX + 3, ty: RY, r: 64 } });
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });                                   // héroe en la vorágine densa
    const nearVm = window.__dev.maelstromField();
    const nearBank = nearVm.forageChargePreview;   // lo que banca UN kill ahora mismo (canal maelstromFind)
    // AIRE LIMPIO: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin zonas en radio ⇒ T0/+0 control
    window.__dev.maelstromField({ tp: { tx: RX - 40, ty: RY } });
    const farVm = window.__dev.maelstromField();
    window.__dev.maelstromField({ clearField: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, charge: nearVm.charge, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, charge: farVm.charge, preview: farVm.forageChargePreview, tag: farVm.tag },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score === 4 && effect.near.tier === 2 && effect.near.charge === 2 && effect.near.preview === 2 && effect.near.tag && effect.near.tag.length > 0
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.charge === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === myTier(effect.near.score) && effect.near.charge === myCharge(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): 2 zonas GRANDES (score 4) en radio ⇒ charge+2/T2 + forageChargePreview 2 (lo que banca el kill) + tag; héroe en aire limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio ⇒ 0; vorágine densa ⇒ 2 ═══
  //   Refleja `_maelPre` (snapshot en el TOP de killEnemy): densidad PRE-kill 0 ⇒ 0 cargas (matar sobre tierra despejada NO forrajea).
  const anti = await pageA.evaluate(() => {
    const ct = () => window.__dev.maelstromField().hero.maelstromCharges | 0;
    // A: kill solitario sobre AIRE LIMPIO (tile remoto) ⇒ _maelPre=0 ⇒ 0 forage
    window.__dev.maelstromField({ clearField: true });
    const h0 = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ tp: { tx: h0.tx - 100, ty: h0.ty } });   // tile remoto limpio
    const baseScoreA = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe.score;
    const ctA0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // spawn+killEnemy REAL en el héroe (aire limpio)
    const deltaA = ct() - ctA0;
    // B: kill DENTRO de una vorágine densa ⇒ _maelPre≥4 ⇒ forage T2/cap2
    window.__dev.maelstromField({ clearField: true });
    const h1 = window.__dev.maelstromField().hero;
    for (const dx of [0, 2]) window.__dev.maelstromField({ spawnField: { tx: h1.tx + dx, ty: h1.ty, r: 64 } });   // 2×2=4 ⇒ score4
    window.__dev.maelstromField({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe.score;
    const ctB0 = ct();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");            // kill REAL en medio de la vorágine
    const deltaB = ct() - ctB0;
    window.__dev.maelstromField({ clearField: true });
    return { baseScoreA, deltaA, baseScoreB, deltaB };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 4 && anti.deltaB === myCharge(anti.baseScoreB) && anti.deltaB === 2;
  ok("L6b ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): aire limpio (pre=0) ⇒ Δcharge 0 (matar sobre tierra despejada NO forrajea); vorágine densa (pre≥4) ⇒ Δcharge == my LUT charge=2 (refleja _maelPre pre-kill)",
     antiOK, JSON.stringify({ ...anti, myLut: myCharge(anti.baseScoreB) }));

  // ═══ L7 — SUB-CAP propio maelstromChargeCap=2: ningún score produce charge>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.maelstromField({ scoreProbe: { score: s } }).scoreProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.maelstromField().cap }; });
  ok("L7 ★ SUB-CAP maelstromChargeCap: ningún score produce charge>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL maelstromFind AISLADO / NO doble-dip ═══
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const maelFindCount = chanDecls.filter(c => c === "maelstromFind").length;
  const arcChannels = ARC23.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesMael = arcChannels.every(c => c !== "maelstromFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.maelstromField(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview,
      flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview,
      trophy: s.trophyForagePreview, salvage: s.salvageForagePreview, bone: s.boneForagePreview, ember: s.emberForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.maelstromField({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL maelstromFind AISLADO / NO DOBLE-DIP: served declara `channel:\"maelstromFind\"` EXACTAMENTE 1× (MAELSTROM_FIELD_SURGE) + NINGUNA de las 23 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 18 peers byte-idénticos)",
     maelFindCount === 1 && noArcUsesMael && pure.unchanged,
     `maelFindDecls=${maelFindCount} arcUsesMael=${!noArcUsesMael} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave maelstromCharges/maelstromFind/maelstromField + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.maelstromField().hero; window.__dev.maelstromField({ scoreProbe: { score: 4 } }); window.__dev.maelstromField({ spawnField: { tx: h.tx + 200, ty: h.ty + 80, r: 64 } }); window.__dev.maelstromField({ clearField: true }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"maelstromCharges"\s*:/.test(saveBlob) && !/"(maelstromField|maelstromFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN maelstromCharges/maelstromField/maelstromFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las cargas NO entran al fingerprint; zonas de prueba limpiadas; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo "Vorágine:" render (ctx.fillText) con vorágine densa EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Vorágine:") >= 0) glyphCnt++; return orig(t, x, y); };
    const h0 = window.__dev.maelstromField().hero;
    const RX = h0.tx + 130, RY = h0.ty + 68;
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con vorágine densa fresca en radio ⇒ tag + glifo dibujado. Zonas de prueba dmg:0 (0 daño) + life:99.
    window.__dev.maelstromField({ clearField: true });
    for (const dx of [0, 2, 4]) window.__dev.maelstromField({ spawnField: { tx: RX + dx, ty: RY, r: 64, dmg: 0, life: 99 } });
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    const nearTag = window.__dev.maelstromField().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ aire limpio ⇒ tag ''
    window.__dev.maelstromField({ tp: { tx: RX - 40, ty: RY } });
    const farTag = window.__dev.maelstromField().tag;
    window.__dev.maelstromField({ clearField: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  });
  ok("L9 LIVE render: con vorágine densa EN radio parado ⇒ vm.tag (Vorágine:) + glifo dibujado (nearGlyph>0); héroe en aire limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag && badge.nearTag.length > 0 && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag="${badge.nearTag}" nearGlyph=${badge.nearGlyph} farTag="${badge.farTag}" fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥23: inyectar zonas ⇒ vorágine→T2 MIENTRAS fragor#81/carnicería#80/botín#79/furia#78/hazard#77 IGNORAN + lootQuality#63/#68 sin cambio ═══
  const diff = await pageA.evaluate(() => {
    const h0 = window.__dev.maelstromField().hero;
    const RX = h0.tx - 175, RY = h0.ty + 74;
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    const s0 = window.__dev.maelstromField();
    const base = s0.score;
    const frayB = window.__dev.crossfireFray ? window.__dev.crossfireFray().score : 0;
    const carB = window.__dev.carnageField ? window.__dev.carnageField().score : 0;
    const spoB = window.__dev.spoilsField ? window.__dev.spoilsField().score : 0;
    const enrB = window.__dev.enrageSurge ? window.__dev.enrageSurge().score : 0;
    const hazB = window.__dev.hazardSurge ? window.__dev.hazardSurge().score : 0;
    const lootB = s0.lootQualityFloor;
    for (const dx of [0, 2]) window.__dev.maelstromField({ spawnField: { tx: RX + dx, ty: RY, r: 64 } });   // 2×2=4 ⇒ T2
    window.__dev.maelstromField({ tp: { tx: RX, ty: RY } });
    const s1 = window.__dev.maelstromField();
    const frayA = window.__dev.crossfireFray ? window.__dev.crossfireFray().score : 0;
    const carA = window.__dev.carnageField ? window.__dev.carnageField().score : 0;
    const spoA = window.__dev.spoilsField ? window.__dev.spoilsField().score : 0;
    const enrA = window.__dev.enrageSurge ? window.__dev.enrageSurge().score : 0;
    const hazA = window.__dev.hazardSurge ? window.__dev.hazardSurge().score : 0;
    const lootA = s1.lootQualityFloor;
    const frOn = window.__dev.crossfireFray ? window.__dev.crossfireFray().enabled : null;
    const caOn = window.__dev.carnageField ? window.__dev.carnageField().enabled : null;
    const soOn = window.__dev.spoilsField ? window.__dev.spoilsField().enabled : null;
    const enOn = window.__dev.enrageSurge ? window.__dev.enrageSurge().enabled : null;
    const hzOn = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    window.__dev.maelstromField({ clearField: true });
    return { base, score: s1.score, tier: s1.tier, charge: s1.charge,
      frayB, frayA, carB, carA, spoB, spoA, enrB, enrA, hazB, hazA, lootB, lootA, frOn, caOn, soOn, enOn, hzOn };
  });
  const diffOK = diff.score - diff.base === 4 && diff.tier === 2 && diff.charge === 2 &&
    diff.frayA === diff.frayB && diff.carA === diff.carB && diff.spoA === diff.spoB && diff.enrA === diff.enrB && diff.hazA === diff.hazB && diff.lootA === diff.lootB &&
    diff.frOn === true && diff.caOn === true && diff.soOn === true && diff.enOn === true && diff.hzOn === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥23: inyectar zonas ⇒ vorágine Δ+4→T2 MIENTRAS fragor#81/carnicería#80/botín#79/furia#78/hazard#77 IGNORAN (score sin cambio) + lootQuality#63/#68 sin cambio; todos los vecinos enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.maelstromField().hero; const RX = h.tx + 130, RY = h.ty + 80; window.__dev.maelstromField({ clearField: true }); for (const dx of [0, 2, 4]) window.__dev.maelstromField({ spawnField: { tx: RX + dx, ty: RY, r: 64, dmg: 0, life: 99 } }); window.__dev.maelstromField({ tp: { tx: RX, ty: RY } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian zonas, inyectan las MISMAS 2 zonas (1 grande + 1 pequeña) + tp héroe a las MISMAS coords.
  const HT = { tx: 63, ty: 40 };   // zonas a Δ0 (grande) y Δ3 (pequeña) del héroe (en radio)
  const readNS = async (pg) => await pg.evaluate((HT) => {
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx, ty: h.ty, r: 64 } });        // grande w2
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: 40 } });    // pequeña w1 (Δ3 tiles=96<260)
    const vm = window.__dev.maelstromField();
    const lut = [0, 1, 2, 4].map(s => { const p = window.__dev.maelstromField({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const sp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const charges = vm.hero ? (vm.hero.maelstromCharges | 0) : null;
    window.__dev.maelstromField({ clearField: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag, spScore: sp.score, spCount: sp.count, lut, fp, fpLen: fp.length, enabled: vm.enabled, charges };
  }, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = oWeight(R_LARGE) + oWeight(R_SMALL);   // 3 ⇒ T1 charge 1
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.charge === NC.charge && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === myTier(expScore) && NB.charge === myCharge(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMAS zonas+héroe (2 clientes FRESCOS) ⇒ score/tier/charge + fieldProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=3→T1/charge1, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},charge:${NB.charge},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fpLen}} C={score:${NC.score},tier:${NC.tier},charge:${NC.charge},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fpLen}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${myTier(expScore)},charge:${myCharge(expScore)}}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${NB.fpLen} (esperado 15920977)`);

  // ═══ L10c — CARGAS PER-HERO (no compartidas, no dup entre clientes): h.maelstromCharges transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"maelstromCharges"\s*:/.test(NB.fp) && !/"maelstromCharges"\s*:/.test(NC.fp) && typeof NB.charges === "number" && typeof NC.charges === "number";
  ok("L10c ★ CARGAS PER-HERO (no shared / no dup 2-cliente): h.maelstromCharges transitorio per-hero, FUERA del save+worldFingerprint ⇒ las cargas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_charges=${NB.charges} C_charges=${NC.charges} fpHasChargeKey=${/"maelstromCharges"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-maelstromfield.png") });

  // ═══ L11 — RECONEXIÓN mid-vorágine STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin maelstromCharges + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.maelstromField", { timeout: 8000 });
  const reconn = await pageB.evaluate((HT) => {
    const s = window.__dev.maelstromField();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 2, 4].map(sc => { const p = window.__dev.maelstromField({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, c: p.charge }; });
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx: HT.tx, ty: HT.ty } });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx, ty: h.ty, r: 64 } });
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: 40 } });
    const vm = window.__dev.maelstromField();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.maelstromField({ clearField: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"maelstromCharges"\s*:|"(maelstromField|maelstromFind)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 1 && reconn.tag && reconn.tag.length > 0;
  ok("L11 RECONNECT mid-vorágine STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin maelstromCharges/maelstromFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T1/tag Vorágine:) (0 drift, 0 persistencia indebida de cargas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, MAELSTROM_FIELD_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#82 24º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
