// CAS-2467 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para HAZARD DE ARENA ACTIVO (ARENA_HAZARD_SURGE.enabled:TRUE), EVO mecánica #77.
// Mirror LIVE de la DARK QA CAS-2465 (tools/cas2465-hazardsurge-dark-observable-qa.mjs). Patrón LIVE = cas2463 (ENCOUNTER_VARIANT_SURGE #76).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 4ce6f753a96b (== master flip ff2291b+813f562 == deploy tools/cas2466-deploy.mjs == gh-pages 12c8989d == HTTP served; byte-verificado CTO+CEO).
//
// Diferencia clave vs DARK (cas2465): enabled:TRUE ⇒ el efecto ARENA_HAZARD_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - hazardSurgeScore(h)=Σ hazardWeights[hz.type] sobre los hazards en fase `active` de G.hazards dentro de radius260 (server-auth, subsistema ARENA_HAZARDS/CAS-2094).
//   - TABLA por score: score≥3→T2/motes2, [1,3)→T1/motes1, 0→T0/motes0 (sub-cap hazardMoteCap=2).
//   - canal FRESCO healPotency: forrajeo de brasas restaurativas al matar mob DENTRO de un hazard activo en radio ⇒ +brasas (grantHazardMote a h.hazardMotes, recurso TRANSITORIO fuera del save+fingerprint).
//   - hazard telegraph/fade o fuera de radio (>260px) ⇒ peso 0 ⇒ T0/+0 (control). Sólo la ventana `active` cuenta.
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.hazardSurge (scoreProbe/spawnHazard/hazardProbe/tp) + peers + __dev.saveBlob/worldFingerprint. Badge vía ctx.fillText.
// Run: node tools/cas2467-hazardsurge-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2467-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "4ce6f753a96b";   // build deployado por el flip ARENA_HAZARD_SURGE CAS-2466 (== version.json esperado)
const PREV_LIVE = "f7b79c60d831";      // build servido previo (#76 DARK/stale al que apuntaba version.json) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// hazardWeights {magma:2,poison:2,bramble:1,collapse:1,ice:1,void:1}; tiers [{min:1,motes:1},{min:3,motes:2}]; hazardMoteCap 2.
const ORACLE_WEIGHTS = { magma: 2, poison: 2, bramble: 1, collapse: 1, ice: 1, void: 1 };   // tipo ausente → 1 (fallback defensivo)
const ORACLE_TIERS = [{ min: 1, motes: 1 }, { min: 3, motes: 2 }];
const ORACLE_CAP = 2;
function oracleTierMotes(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].motes; }
  return { tier: t, motes: Math.min(ORACLE_CAP, s) };
}
const EXPECT_SCORE = [
  { s: 0, t: 0, m: 0 }, { s: 1, t: 1, m: 1 }, { s: 2, t: 1, m: 1 },
  { s: 3, t: 2, m: 2 }, { s: 4, t: 2, m: 2 }, { s: 6, t: 2, m: 2 }, { s: 99, t: 2, m: 2 },
];
// 18 flags del arco #59-#76 (ARENA_HAZARD_SURGE es #77, el nuevo). Todas deben seguir served:true.
const ARC18 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAHazard";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #76 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.hazardSurge && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.hazardSurge/ward/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 18 flags arco #59-#76 served TRUE + ARENA_HAZARD_SURGE #77 served TRUE ⇒ 19 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC18.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const hsLive = flag("ARENA_HAZARD_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 18 flags arco #59-#76 served true (intactas) + ARENA_HAZARD_SURGE #77 served true ⇒ 19 flags LIVE, 0 perdidas",
     arcAllOn && hsLive && ARC18.length === 18, `hazardSurge=${flag("ARENA_HAZARD_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params ARENA_HAZARD_SURGE served — canal FRESCO healPotency + sub-cap hazardMoteCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"healPotency"/.test(cfgSrc);
  const capLive = /hazardMoteCap:\s*2/.test(cfgSrc);
  const radLive = /radius:\s*260/.test(cfgSrc);
  const wLive = /hazardWeights:\s*\{\s*magma:\s*2,\s*poison:\s*2,\s*bramble:\s*1,\s*collapse:\s*1,\s*ice:\s*1,\s*void:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params ARENA_HAZARD_SURGE served: channel healPotency + hazardMoteCap 2 + radius 260 + hazardWeights{magma:2,poison:2,bramble:1,collapse:1,ice:1,void:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel healPotency, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.hazardSurge());
  ok("L3 LIVE default: __dev.hazardSurge().enabled === TRUE (flip aplicado), channel healPotency, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "healPotency" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/motes == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.hazardSurge({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].motes === c.m) && tab.every(r => r.motes <= ORACLE_CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/motes == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap hazardMoteCap=2",
     tabOK, JSON.stringify(tab));

  // ═══ L5 — REAL SERVER-AUTH + INDEP EXTRAS: spawnHazard inyecta hazard REAL en G.hazards; hazardProbe lee score REAL ═══
  //   per-tipo weight (magma/poison=+2 vs bramble/collapse/ice/void=+1) + telegraph/fade ⇒ +0 + radius-boundary gating (~256px cuenta, ~384px no).
  const server5 = await pageA.evaluate(() => {
    const h = window.__dev.hazardSurge().hero;
    const measure = (type, phase, dtx) => {
      window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
      window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + (dtx || 2), ty: h.ty, type, phase: phase || "active" } });
      window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.hazardSurge({ hazardProbe: true });
      const hz = after.hazardProbe.hazards.find(x => x.type === type && x.phase === (phase || "active"));
      return { delta: after.hazardProbe.score - before, hzWeight: hz ? hz.weight : null };
    };
    const magma = measure("magma", "active", 2);        // peso 2
    const poison = measure("poison", "active", 2);       // peso 2
    const bramble = measure("bramble", "active", 2);     // peso 1
    const ice = measure("ice", "active", 2);             // peso 1
    // telegraph/fade ⇒ +0 (sólo la ventana `active` cuenta)
    const tele = measure("magma", "telegraph", 3);       // +0
    const fade = measure("poison", "fade", 3);           // +0
    // radius-boundary gating: ~256px (8 tiles, dentro de radio260) cuenta; ~384px (12 tiles, fuera) NO.
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const b0 = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 8, ty: h.ty, type: "bramble", phase: "active" } });   // ~256px < 260 ⇒ cuenta (+1)
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const bIn = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score - b0;
    const c0 = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 12, ty: h.ty, type: "bramble", phase: "active" } });  // ~384px > 260 ⇒ NO cuenta (+0)
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const cOut = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score - c0;
    return { magma, poison, bramble, ice, tele, fade, radiusIn: bIn, radiusOut: cOut };
  });
  const s5OK = server5.magma.delta === 2 && server5.magma.hzWeight === 2 &&
    server5.poison.delta === 2 && server5.poison.hzWeight === 2 &&
    server5.bramble.delta === 1 && server5.bramble.hzWeight === 1 &&
    server5.ice.delta === 1 && server5.ice.hzWeight === 1 &&
    server5.tele.delta === 0 && server5.fade.delta === 0 &&
    server5.radiusIn === 1 && server5.radiusOut === 0;
  ok("L5 ★ REAL SERVER-AUTH: spawnHazard→G.hazards, hazardProbe lee score REAL; INDEP per-tipo magma/poison=+2 bramble/ice=+1; telegraph/fade=+0; radius-boundary ~256px=+1 / ~384px=+0",
     s5OK, JSON.stringify(server5));

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): hazard(s) activos en radio ⇒ +motes por tier; lejos ⇒ +0 ═══
  const effect = await pageA.evaluate(() => {
    const h = window.__dev.hazardSurge().hero;
    // ENCUENTRO de alta intensidad: magma(2)+poison(2) = score≥3 ⇒ T2/motes2
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } });   // ~64px
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "active" } });  // ~96px
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });                                                  // héroe en el hazard
    const nearVm = window.__dev.hazardSurge();
    // LEJOS: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin hazard en radio ⇒ T0/+0 control
    window.__dev.hazardSurge({ tp: { tx: h.tx - 40, ty: h.ty } });
    const farVm = window.__dev.hazardSurge();
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });                                                  // restaurar
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, motes: nearVm.motes, preview: nearVm.forageMotesPreview },
      far: { score: farVm.score, tier: farVm.tier, motes: farVm.motes, preview: farVm.forageMotesPreview },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score >= 3 && effect.near.tier === 2 && effect.near.motes === 2 && effect.near.preview === 2
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.motes === 0 && effect.far.preview === 0
    && effect.near.tier === oracleTierMotes(effect.near.score).tier && effect.near.motes === oracleTierMotes(effect.near.score).motes
    && effect.far.tier === oracleTierMotes(effect.far.score).tier;
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): hazards de alta intensidad (magma+poison, score≥3) en radio ⇒ motes+2/T2; héroe lejos (>260px) ⇒ sin hazard +0/T0 (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L7 — SUB-CAP propio hazardMoteCap=2: ningún score produce motes>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe.motes);
    return { max: Math.max(...vals), cap: window.__dev.hazardSurge().cap }; });
  ok("L7 ★ SUB-CAP hazardMoteCap: ningún score produce motes>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL healPotency AISLADO / NO doble-dip ═══
  //  (a) UNICIDAD served: `channel:"healPotency"` aparece EXACTAMENTE 1 vez (en ARENA_HAZARD_SURGE) y NINGUNA de las 18 flags del arco lo usa.
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const healPotencyCount = chanDecls.filter(c => c === "healPotency").length;
  const arcChannels = ARC18.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesHeal = arcChannels.every(c => c !== "healPotency");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.hazardSurge(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview,
      mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.hazardSurge({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL healPotency AISLADO / NO DOBLE-DIP: served declara `channel:\"healPotency\"` EXACTAMENTE 1× (ARENA_HAZARD_SURGE) + NINGUNA de las 18 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 13 peers byte-idénticos)",
     healPotencyCount === 1 && noArcUsesHeal && pure.unchanged,
     `healPotencyDecls=${healPotencyCount} arcChannels=${JSON.stringify(arcChannels)} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave hazardMotes/healPotency/hazardSurge + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.hazardSurge().hero; window.__dev.hazardSurge({ scoreProbe: { score: 4 } }); window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } }); window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noMoteKey = !/"hazardMotes"\s*:/.test(saveBlob) && !/"(hazardSurge|healPotency)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN hazardMotes/hazardSurge/healPotency (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las brasas NO entran al fingerprint; 0 RNG/timer drift)",
     noMoteKey && fpBefore === fpAfter, `noMoteKey=${noMoteKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge "Hazard: T<n>" render: con hazard activo EN radio, "Hazard: —" sin hazard + mov/combate sin crash + fps ═══
  // NOTA lifecycle: un hazard `active` inyectado (t:0) transiciona a `fade` (peso 0) tras ARENA_HAZARDS.activeMs=1600ms; y el héroe
  // en MOVIMIENTO puede salir del radio260. Ambos son comportamiento CORRECTO ⇒ la medición de badge se hace con el héroe PARADO
  // sobre hazards frescos y en ventanas CORTAS (<< activeMs) para que el hazard permanezca `active` toda la ventana; el fps/no-crash
  // se mide APARTE bajo movimiento+combate reales.
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let tCnt = 0, dashCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Hazard: T") >= 0) tCnt++; if (t.indexOf("Hazard: —") >= 0) dashCnt++; } return orig(t, x, y); };
    const h = window.__dev.hazardSurge().hero;
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash (badge NO medido: el héroe sale de radio ⇒ lifecycle correcto)
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));                          // warmup tras probes pesadas
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO sobre hazards frescos activos; ventana 500ms << activeMs 1600 ⇒ jamás fade ⇒ "Hazard: T<n>"
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    tCnt = 0; dashCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearT = tCnt, nearDash = dashCnt;
    // (3) badge FAR — héroe lejos (>260px) ⇒ sin hazard en radio ⇒ "Hazard: —"
    window.__dev.hazardSurge({ tp: { tx: h.tx - 40, ty: h.ty } });
    tCnt = 0; dashCnt = 0; let t2 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t2 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const farT = tCnt, farDash = dashCnt;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    cx.fillText = orig;
    return { nearT, nearDash, farT, farDash, fps };
  });
  ok("L9 LIVE render: badge \"Hazard: T<n>\" con hazard activo EN radio parado (nearT>0, nearDash0) y \"Hazard: —\" sin hazard en radio (farDash>0, farT0); movimiento+combate sin crash; fps sano",
     badge.nearT > 0 && badge.nearDash === 0 && badge.farDash > 0 && badge.farT === 0 && badge.fps >= 50,
     `nearT=${badge.nearT} nearDash=${badge.nearDash} farT=${badge.farT} farDash=${badge.farDash} fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR: con hazard T≥1, previews de afijo#74/evento#75/variante#76 (sin cambio) + apex#73 (tier0) lo IGNORAN ═══
  const diff = await pageA.evaluate(() => {
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const s0 = window.__dev.hazardSurge();
    const affixBefore = s0.flaskForagePreview, eventBefore = s0.gemForagePreview, variantBefore = s0.socketForagePreview;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const s1 = window.__dev.hazardSurge();
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;
    return { hsTier: s1.tier, hsScore: s1.score, hsMotes: s1.motes,
      affixBefore, affixAfter: s1.flaskForagePreview, eventBefore, eventAfter: s1.gemForagePreview,
      variantBefore, variantAfter: s1.socketForagePreview, apexBefore, apexAfter };
  });
  const diffOK = diff.hsTier >= 2 && diff.hsScore >= 3 && diff.hsMotes >= 2 &&
    diff.affixAfter === diff.affixBefore && diff.eventAfter === diff.eventBefore && diff.variantAfter === diff.variantBefore &&
    diff.apexAfter === 0 && diff.apexBefore === 0;
  ok("L9b ⊥ DIFERENCIADOR: hazard DoT×2 ⇒ hazardSurge T2 mientras afijo#74/evento#75/variante#76 (previews sin cambio) y apex#73 (tier 0) lo IGNORAN (un hazard NO es mob/POI/jefe)",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.hazardSurge().hero; window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } }); window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "active" } }); window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA (score=Σ hazards activos en radio, acumulado). Comparar A vs B daría falso-desync.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes inyectan el MISMO hazard + tp héroe a las MISMAS coords (hazardSurgeScore = fn PURA de hazards activos en radio).
  const A_TILE = { tx: 70, ty: 44 }, B_TILE = { tx: 71, ty: 44 }, HERO_TILE = { tx: 74, ty: 44 };  // hazard 3-4 tiles del héroe (~96-128px → en radio260)
  const readNS = async (pg) => await pg.evaluate((AT, BT, HT) => {
    window.__dev.hazardSurge({ spawnHazard: { tx: AT.tx, ty: AT.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ spawnHazard: { tx: BT.tx, ty: BT.ty, type: "poison", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.hazardSurge();
    const hp = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe;
    const lut = [0, 1, 3].map(s => { const p = window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, motes: p.motes }; });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, motes: vm.motes, hpScore: hp.score, hpCount: hp.count, lut, fp, enabled: vm.enabled };
  }, A_TILE, B_TILE, HERO_TILE);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  // activeHazardCount NO se compara: nº AMBIENTAL de hazards (sembrados por ARENA_HAZARDS). La señal determinista per-snapshot
  // (score/tier/motes + hazardProbe.score + LUT + worldFingerprint byte-id) es lo shard-consistente.
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.motes === NC.motes &&
                 NB.hpScore === NC.hpScore &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true && NB.tier === 2;
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMO hazard+héroe (2 clientes FRESCOS) ⇒ score/tier/motes + hazardProbe.score + LUT scoreProbe + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; activeHazardCount ambiental excluido), enabled:true, T2",
     convOK, `B={score:${NB.score},tier:${NB.tier},motes:${NB.motes},hpScore:${NB.hpScore},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},motes:${NC.motes},hpScore:${NC.hpScore},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-hazardsurge.png") });

  // ═══ L11 — reconnect STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin hazardMotes + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.hazardSurge", { timeout: 8000 });
  const reconn = await pageB.evaluate((AT, BT, HT) => {
    const s = window.__dev.hazardSurge();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 3].map(sc => { const p = window.__dev.hazardSurge({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, tier: p.tier, motes: p.motes }; });
    window.__dev.hazardSurge({ spawnHazard: { tx: AT.tx, ty: AT.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ spawnHazard: { tx: BT.tx, ty: BT.ty, type: "poison", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"hazardMotes"\s*:|"(hazardSurge|healPotency)[A-Za-z]*"\s*:/.test(save), lut, fp };
  }, A_TILE, B_TILE, HERO_TILE);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre;
  ok("L11 RECONNECT STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin hazardMotes/healPotency + LUT idéntica + worldFingerprint idéntico (0 drift, 0 persistencia indebida de brasas)",
     reconnOK, JSON.stringify({ enabled: reconn.enabled, gExists: reconn.gExists, hasKey: reconn.hasKey, lutMatch: JSON.stringify(reconn.lut) === JSON.stringify(NB.lut), fpMatch: reconn.fp === fpB_pre }));

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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, ARENA_HAZARD_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente)`);
process.exit(FAIL === 0 ? 0 : 1);
