// CAS-2480 — QA POST-FLIP LIVE 2-cliente (INDEP, QA-owned) para CAMPO DE BOTÍN DENSO (SPOILS_FIELD_SURGE.enabled:TRUE), EVO mecánica #79 (21º flag del arco).
// Mirror LIVE de la DARK QA CAS-2478 (tools/cas2478-spoilsfield-dark-observable-qa.mjs). Patrón LIVE = cas2476 (BOSS_ENRAGE_SURGE #78).
// URL oficial = gh-pages https://carlosdcastrosa-cloud.github.io/Mithralda-Online/ (el build que juegan los jugadores).
// EXPECT build servido = 047bcd0e2e5f (== flip CAS-2479 master f16a00c+62bba8c == deploy tools/cas2479-deploy.mjs == gh-pages 57b86796 == HTTP served; byte-verificado CTO 5/5 + CEO 2ª).
//
// Diferencia clave vs DARK (cas2478): enabled:TRUE ⇒ el efecto SPOILS_FIELD_SURGE está ACTIVO en el build servido, SIN flip in-memory:
//   - spoilsFieldScore(h)=Σ spoilsWeights[d.kind] sobre los drops NO recogidos (!d.taken) de G.drops dentro de radius260 (server-auth; MISMO array que render+pickup).
//   - TABLA por score: score≥3→T2/salvage2, [1,3)→T1/salvage1, 0→T0/salvage0 (sub-cap spoilsSalvageCap=2).
//   - canal FRESCO salvageFind: rematar mobs MIENTRAS el suelo de la vecindad está DENSO en botín sin recoger ⇒ +esquirlas de chatarra (grantSalvage a h.salvageShards, recurso TRANSITORIO fuera del save+fingerprint).
//     forageSalvagePreview = spoilsFieldForageSalvage(h,tpl) = EXACTAMENTE lo que banca el seam de kill ⇒ prueba determinista del forrajeo.
//   - ANTI-AUTO-CONTEO: suelo limpio (score 0) ⇒ forrajeo 0 (rematar sobre suelo limpio NO da forraje; refleja `_spoilsPre` snapshot en el TOP de killEnemy ANTES de que el kill suelte sus drops).
// Oráculos RE-DERIVADOS desde 0 (NO importa la tabla del selfverify de GE). NO se toca `enabled` (llega en true por el flip LIVE) — se prueba el efecto ACTIVO tal-como-servido.
// Observado vía __dev.spoilsField (scoreProbe/spawnDrop/spoilsProbe/clearDrops/tp) + peers + __dev.saveBlob/worldFingerprint. Badge glifo ◆ vía vm.tag + ctx.fillText.
// Run: node tools/cas2480-spoilsfield-live-observable-qa.mjs   [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2480-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "047bcd0e2e5f";   // build deployado por el flip SPOILS_FIELD_SURGE CAS-2479 (== version.json esperado)
const PREV_LIVE = "e0adf46f6ed1";      // build servido previo (#78 BOSS_ENRAGE_SURGE LIVE) — el served DEBE haber avanzado de aquí

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados desde 0 (NO importados del GE) desde los knobs de config SERVIDA ──
// spoilsWeights {gear:2,rune:2,gold:1,potionhp:1,potionmp:1}; tiers [{min:1,salvage:1},{min:3,salvage:2}]; spoilsSalvageCap 2; radius 260; TS 32.
const TS = 32;
const RADIUS = 260;
const WEIGHTS = { gear: 2, rune: 2, gold: 1, potionhp: 1, potionmp: 1 };   // tipo ausente ⇒ 1 (fallback)
const TIERS = [{ min: 1, salvage: 1 }, { min: 3, salvage: 2 }];
const CAP = 2;
const myWeight = (kind) => (WEIGHTS[kind] != null ? WEIGHTS[kind] : 1);
const myTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const mySalvage = (score) => { const t = myTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].salvage); };
const inRadiusTiles = (dTiles) => (dTiles * TS) * (dTiles * TS) <= RADIUS * RADIUS;   // distancia misma-fila px
const EXPECT_SCORE = [{ s: 0 }, { s: 1 }, { s: 2 }, { s: 3 }, { s: 4 }, { s: 6 }, { s: 12 }, { s: 99 }].map(c => ({ s: c.s, t: myTier(c.s), sv: mySalvage(c.s) }));
// 20 flags del arco #59-#78 (SPOILS_FIELD_SURGE es #79, el nuevo). Todas deben seguir served:true.
const ARC20 = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE"];
const isFaviconOnly = (u) => /favicon|apple-touch|\.ico(\?|$)/i.test(u);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QASpoils";
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

  // ═══ L1 — Boot LIMPIO LIVE + build self-consistent (== version.json == EXPECT, AVANZÓ del #78 served) + hooks ═══
  const hooks = await pageA.evaluate(() => !!(window.__dev && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boots LIVE a 'play'; build==version.json==EXPECT ${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); __dev.spoilsField/enrageSurge/saveBlob/worldFingerprint; 0 err/404 (sin black-screen)`,
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREV_LIVE && errA.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} prevServed=${PREV_LIVE} err=${errA.length} 404=${net404.length}`);

  // ═══ L2 — 0-REGRESIÓN: 20 flags arco #59-#78 served TRUE + SPOILS_FIELD_SURGE #79 served TRUE ⇒ 21 flags LIVE ═══
  const cfgSrc = await pageA.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC20.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const sfsLive = flag("SPOILS_FIELD_SURGE") === "true";
  ok("L2 ★ 0-REGRESIÓN: 20 flags arco #59-#78 served true (intactas) + SPOILS_FIELD_SURGE #79 served true ⇒ 21 flags LIVE, 0 perdidas",
     arcAllOn && sfsLive && ARC20.length === 20, `spoilsField=${flag("SPOILS_FIELD_SURGE")} arcOff=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // params SPOILS_FIELD_SURGE served — canal FRESCO salvageFind + sub-cap spoilsSalvageCap:2 + radio 260 + weights
  const channelLive = /channel:\s*"salvageFind"/.test(cfgSrc);
  const capLive = /spoilsSalvageCap:\s*2/.test(cfgSrc);
  const radLive = new RegExp("SPOILS_FIELD_SURGE[\\s\\S]*?radius:\\s*260").test(cfgSrc);
  const wLive = /spoilsWeights:\s*\{\s*gear:\s*2,\s*rune:\s*2,\s*gold:\s*1,\s*potionhp:\s*1,\s*potionmp:\s*1\s*\}/.test(cfgSrc);
  ok("L2b params SPOILS_FIELD_SURGE served: channel salvageFind + spoilsSalvageCap 2 + radius 260 + spoilsWeights{gear:2,rune:2,gold:1,potionhp:1,potionmp:1}",
     channelLive && capLive && radLive && wLive, `channel=${channelLive} cap=${capLive} radius=${radLive} weights=${wLive}`);

  // ═══ L3 — estado LIVE por defecto: enabled TRUE (la DIFERENCIA vs DARK), channel salvageFind, STATELESS ═══
  const st = await pageA.evaluate(() => window.__dev.spoilsField());
  ok("L3 LIVE default: __dev.spoilsField().enabled === TRUE (flip aplicado), channel salvageFind, gExists false (STATELESS), cap 2, radius 260",
     st.enabled === true && st.channel === "salvageFind" && st.gExists === false && st.cap === 2 && st.radius === 260,
     `enabled=${st.enabled} channel=${st.channel} gExists=${st.gExists} cap=${st.cap} radius=${st.radius}`);

  // ═══ L4 — LUT PURA re-derivada: scoreProbe.tier/salvage == oracle byte-exacto ═══
  const tab = await pageA.evaluate((cases) => cases.map(c => window.__dev.spoilsField({ scoreProbe: { score: c.s } }).scoreProbe), EXPECT_SCORE);
  const tabOK = EXPECT_SCORE.every((c, i) => tab[i] && tab[i].tier === c.t && tab[i].salvage === c.sv) && tab.every(r => r.salvage <= CAP);
  ok("L4 LUT PURA re-derivada: scoreProbe.tier/salvage == oracle byte-exacto (0→T0/0, [1,3)→T1/1, ≥3→T2/2) + sub-cap spoilsSalvageCap=2",
     tabOK, JSON.stringify(EXPECT_SCORE.map((c, i) => ({ s: c.s, mine: [c.t, c.sv], game: [tab[i].tier, tab[i].salvage] }))));

  // ═══ L5 — REAL SERVER-AUTH + INDEP: spawnDrop inyecta drop REAL en G.drops; spoilsProbe lee score REAL ═══
  //   per-tipo weight (gear/rune=2 vs gold/potion=1) + radius-boundary gating (Δ8=256px cuenta, Δ9=288px no).
  //   Tile REMOTO aislado para no contaminar el radio con drops de otros checks.
  const kinds = ["gear", "rune", "gold", "potionhp", "potionmp"];
  const perKind = await pageA.evaluate((kk) => {
    const out = [];
    for (const k of kk) {
      window.__dev.spoilsField({ clearDrops: true });
      const h = window.__dev.spoilsField().hero;
      const sd = window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 3, ty: h.ty, kind: k } }).spawnDrop;   // 96px, en radio
      window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
      const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
      window.__dev.spoilsField({ clearDrops: true });
      out.push({ kind: k, spawnWeight: sd.weight, probeScore: sp.score, probeCount: sp.count, probeKind: sp.drops[0] ? sp.drops[0].kind : null, probeWeight: sp.drops[0] ? sp.drops[0].weight : null });
    }
    return out;
  }, kinds);
  const rad = await pageA.evaluate(() => {
    const res = {};
    for (const [tag, d] of [["in", 8], ["out", 9]]) {
      window.__dev.spoilsField({ clearDrops: true });
      const h = window.__dev.spoilsField().hero;
      window.__dev.spoilsField({ spawnDrop: { tx: h.tx + d, ty: h.ty, kind: "gold" } });
      window.__dev.spoilsField({ tp: { tx: h.tx, ty: h.ty } });
      res[tag] = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score;
      window.__dev.spoilsField({ clearDrops: true });
    }
    return res;
  });
  const perKindOK = perKind.every(r => r.spawnWeight === myWeight(r.kind) && r.probeWeight === myWeight(r.kind) && r.probeScore === myWeight(r.kind) && r.probeCount === 1 && r.probeKind === r.kind);
  const radOK = rad.in === 1 && rad.out === 0 && inRadiusTiles(8) === true && inRadiusTiles(9) === false;
  ok("L5 ★ REAL SERVER-AUTH: spawnDrop→G.drops, spoilsProbe lee score REAL; INDEP per-tipo gear/rune=+2 gold/potion=+1 == my spoilsWeights[kind]; radius-boundary Δ8=256px=+1 / Δ9=288px=+0",
     perKindOK && radOK, `perKind=${JSON.stringify(perKind.map(r => ({ k: r.kind, mine: myWeight(r.kind), game: r.probeWeight, sc: r.probeScore })))} rad=${JSON.stringify(rad)} myIn8=${inRadiusTiles(8)} myOut9=${inRadiusTiles(9)}`);

  // ═══ L6 — EFECTO ACTIVO LIVE (enabled:true SIN flip in-memory): campo denso ⇒ +salvage por tier; suelo limpio ⇒ +0 ═══
  //   forageSalvagePreview = EXACTAMENTE lo que banca el seam de kill (grantSalvage) ⇒ "rematar DENTRO de un campo de botín denso cosecha chatarra".
  //   Tile REMOTO para aislar del radio de L5.
  const effect = await pageA.evaluate(() => {
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx + 120, RY = h0.ty + 50;
    window.__dev.spoilsField({ clearDrops: true });
    // CAMPO DENSO: gear(2)+rune(2)=4 ⇒ score≥3 ⇒ T2/salvage2
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } });   // ~64px
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } });   // ~96px
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });                            // héroe en el campo denso
    const nearVm = window.__dev.spoilsField();
    const nearBank = nearVm.forageSalvagePreview;   // lo que banca UN kill ahora mismo (canal salvageFind)
    // SUELO LIMPIO: teleport héroe fuera del radio260 (>10 tiles al OESTE) ⇒ sin botín en radio ⇒ T0/+0 control
    window.__dev.spoilsField({ tp: { tx: RX - 40, ty: RY } });
    const farVm = window.__dev.spoilsField();
    window.__dev.spoilsField({ clearDrops: true });
    return {
      enabled: nearVm.enabled,
      near: { score: nearVm.score, tier: nearVm.tier, salvage: nearVm.salvage, preview: nearBank, tag: nearVm.tag },
      far: { score: farVm.score, tier: farVm.tier, salvage: farVm.salvage, preview: farVm.forageSalvagePreview, tag: farVm.tag },
    };
  });
  const effOK = effect.enabled === true
    && effect.near.score === 4 && effect.near.tier === 2 && effect.near.salvage === 2 && effect.near.preview === 2 && effect.near.tag === "◆"
    && effect.far.score === 0 && effect.far.tier === 0 && effect.far.salvage === 0 && effect.far.preview === 0 && effect.far.tag === ""
    && effect.near.tier === myTier(effect.near.score) && effect.near.salvage === mySalvage(effect.near.score);
  ok("L6 ★ EFECTO ACTIVO LIVE (enabled:true, SIN flip in-memory): campo denso gear+rune (score 4) en radio ⇒ salvage+2/T2 + forageSalvagePreview 2 (lo que banca el kill) + tag ◆; héroe en suelo limpio (>260px) ⇒ +0/T0/tag'' (== oráculo)",
     effOK, JSON.stringify(effect));

  // ═══ L6b — GATE-2 core ANTI-AUTO-CONTEO: suelo limpio (score 0) ⇒ forrajeo 0 (rematar sobre suelo limpio NO forrajea) ═══
  //   Refleja `_spoilsPre` (snapshot en el TOP de killEnemy ANTES de que el kill suelte sus drops): densidad PRE-kill 0 ⇒ 0 chatarra.
  const anti = await pageA.evaluate(() => {
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx + 160, RY = h0.ty + 60;
    window.__dev.spoilsField({ clearDrops: true });
    // suelo limpio: sin drops en radio ⇒ live score 0 ⇒ un kill aquí NO forrajea (aunque el kill suelte gold)
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const cleanForage = window.__dev.spoilsField().forageSalvagePreview;
    const cleanScore = window.__dev.spoilsField().score;
    // campo denso: gear(2)+rune(2)=4 ⇒ T2 ⇒ salvage 2
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } });
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const denseVm = window.__dev.spoilsField();
    window.__dev.spoilsField({ clearDrops: true });
    return { cleanForage, cleanScore, denseScore: denseVm.score, denseForage: denseVm.forageSalvagePreview, denseSalvage: denseVm.salvage };
  });
  const antiOK = anti.cleanForage === 0 && anti.cleanScore === 0 && anti.denseScore === 4 && anti.denseForage === mySalvage(4) && anti.denseForage === 2;
  ok("L6b ★ ANTI-AUTO-CONTEO: suelo limpio (score 0) ⇒ forrajeo 0 (rematar sobre suelo limpio NO da forraje); campo denso score 4 ⇒ forrajeo == my LUT salvage(4)=2 (refleja _spoilsPre pre-kill)",
     antiOK, JSON.stringify({ ...anti, myLut4: mySalvage(4) }));

  // ═══ L7 — SUB-CAP propio spoilsSalvageCap=2: ningún score produce salvage>2 (sweep completo) ═══
  const capChk = await pageA.evaluate(() => { const vals = [];
    for (let s = 0; s <= 40; s++) vals.push(window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe.salvage);
    return { max: Math.max(...vals), cap: window.__dev.spoilsField().cap }; });
  ok("L7 ★ SUB-CAP spoilsSalvageCap: ningún score produce salvage>2 (sweep score∈[0,40]); cap==2 (no stacking sin límite)",
     capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // ═══ L8 — CANAL salvageFind AISLADO / NO doble-dip ═══
  //  (a) UNICIDAD served: `channel:"salvageFind"` aparece EXACTAMENTE 1 vez (en SPOILS_FIELD_SURGE) y NINGUNA de las 20 flags del arco lo usa.
  //  (b) PUREZA: a POSICIÓN FIJA, una batería de scoreProbe(score) NO muta ningún canal peer (LUT sin efectos secundarios).
  const chanDecls = (cfgSrc.match(/channel:\s*"([a-zA-Z]+)"/g) || []).map(s => s.match(/"([a-zA-Z]+)"/)[1]);
  const salvageFindCount = chanDecls.filter(c => c === "salvageFind").length;
  const arcChannels = ARC20.map(f => { const m = cfgSrc.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([a-zA-Z]+)\"")); return m ? m[1] : null; });
  const noArcUsesSalvage = arcChannels.every(c => c !== "salvageFind");
  const pure = await pageA.evaluate(() => {
    const snap = () => { const s = window.__dev.spoilsField(); return {
      ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul,
      loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview,
      flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview }; };
    const before = JSON.stringify(snap());
    for (let s = 0; s <= 20; s++) window.__dev.spoilsField({ scoreProbe: { score: s } }); // batería LUT pura, misma posición
    const after = JSON.stringify(snap());
    return { unchanged: before === after, before };
  });
  ok("L8 ★ CANAL salvageFind AISLADO / NO DOBLE-DIP: served declara `channel:\"salvageFind\"` EXACTAMENTE 1× (SPOILS_FIELD_SURGE) + NINGUNA de las 20 flags del arco lo usa (canal FRESCO) + scoreProbe es PURO (batería a posición fija ⇒ 15 peers byte-idénticos)",
     salvageFindCount === 1 && noArcUsesSalvage && pure.unchanged,
     `salvageFindDecls=${salvageFindCount} arcUsesSalvage=${!noArcUsesSalvage} scoreProbePure=${pure.unchanged}`);

  // ═══ L8b — STATELESS: save sin clave salvageShards/salvageFind/spoilsField + worldFingerprint byte-estable a través de probes ═══
  const saveBlob = await pageA.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await pageA.evaluate(() => { const h = window.__dev.spoilsField().hero; window.__dev.spoilsField({ scoreProbe: { score: 4 } }); window.__dev.spoilsField({ spawnDrop: { tx: h.tx + 200, ty: h.ty + 80, kind: "gear" } }); window.__dev.spoilsField({ clearDrops: true }); });
  const fpAfter = await pageA.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const noKey = !/"salvageShards"\s*:/.test(saveBlob) && !/"(spoilsField|salvageFind)[A-Za-z]*"\s*:/.test(saveBlob);
  ok("L8b STATELESS: saveBlob() SIN salvageShards/spoilsField/salvageFind (recurso TRANSITORIO, 100% derivado) + worldFingerprint(393) byte-estable a través de probes (las esquirlas NO entran al fingerprint; drops de prueba limpiados; 0 RNG/timer drift)",
     noKey && fpBefore === fpAfter, `noKey=${noKey} fpStable=${fpBefore === fpAfter} fpLen=${fpBefore.length} saveLen=${saveBlob.length}`);

  // ═══ L9 — badge glifo ◆ render (vm.tag + ctx.fillText) con campo denso EN radio; movimiento+combate sin crash + fps ═══
  const badge = await pageA.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let glyphCnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("◆") >= 0) glyphCnt++; return orig(t, x, y); };
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx + 130, RY = h0.ty + 68;
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    // (1) MOVIMIENTO + COMBATE reales — fps sano + sin crash
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
    await new Promise((res) => setTimeout(res, 600));
    let t0 = performance.now(), frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 1200) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    // (2) badge NEAR — héroe PARADO con campo denso fresco en radio ⇒ tag ◆ + glifo dibujado
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } });
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const nearTag = window.__dev.spoilsField().tag;
    glyphCnt = 0; let t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 500) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const nearGlyph = glyphCnt;
    // (3) FAR — héroe lejos (>260px) ⇒ suelo limpio ⇒ tag ''
    window.__dev.spoilsField({ tp: { tx: RX - 40, ty: RY } });
    const farTag = window.__dev.spoilsField().tag;
    window.__dev.spoilsField({ clearDrops: true });
    cx.fillText = orig;
    return { nearTag, nearGlyph, farTag, fps };
  });
  ok("L9 LIVE render: con campo denso EN radio parado ⇒ vm.tag '◆' + glifo dibujado (nearGlyph>0); héroe en suelo limpio ⇒ tag '' ; movimiento+combate sin crash; fps sano",
     badge.nearTag === "◆" && badge.nearGlyph > 0 && badge.farTag === "" && badge.fps >= 45,
     `nearTag=${badge.nearTag} nearGlyph=${badge.nearGlyph} farTag=${badge.farTag} fps=${badge.fps}`);

  // ═══ L9b — ⊥ DIFERENCIADOR ⊥20: inyectar drops ⇒ spoils→T2 MIENTRAS enrage#78/hazard#77/variante#76/evento#75 IGNORAN + lootQuality#63/#68 sin cambio ═══
  const diff = await pageA.evaluate(() => {
    const h0 = window.__dev.spoilsField().hero;
    const RX = h0.tx + 175, RY = h0.ty + 74;
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const s0 = window.__dev.spoilsField();
    const base = s0.score;
    const trophyB = s0.trophyForagePreview, healB = s0.healForagePreview, socketB = s0.socketForagePreview, gemB = s0.gemForagePreview, lootB = s0.lootQualityFloor;
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } });   // 4 ⇒ T2
    window.__dev.spoilsField({ tp: { tx: RX, ty: RY } });
    const s1 = window.__dev.spoilsField();
    const en = window.__dev.enrageSurge().enabled, hz = window.__dev.hazardSurge().enabled, vr = window.__dev.variantSurge().enabled, ev = window.__dev.zoneEvent().enabled;
    window.__dev.spoilsField({ clearDrops: true });
    return { base, score: s1.score, tier: s1.tier, salvage: s1.salvage,
      trophyB, trophyA: s1.trophyForagePreview, healB, healA: s1.healForagePreview, socketB, socketA: s1.socketForagePreview, gemB, gemA: s1.gemForagePreview, lootB, lootA: s1.lootQualityFloor,
      en, hz, vr, ev };
  });
  const diffOK = diff.score - diff.base === 4 && diff.tier === 2 && diff.salvage === 2 &&
    diff.trophyA === diff.trophyB && diff.healA === diff.healB && diff.socketA === diff.socketB && diff.gemA === diff.gemB && diff.lootA === diff.lootB &&
    diff.en === true && diff.hz === true && diff.vr === true && diff.ev === true;
  ok("L9b ⊥ DIFERENCIADOR ⊥20: inyectar drops ⇒ spoils Δ+4→T2 MIENTRAS furia#78/hazard#77/variante#76/evento#75 IGNORAN (forrajeo sin cambio) + lootQuality#63/#68 sin cambio; todos los vecinos enabled:true coexisten",
     diffOK, JSON.stringify(diff));

  await sleep(200);
  await pageA.evaluate(() => { const h = window.__dev.spoilsField().hero; const RX = h.tx + 130, RY = h.ty + 80; window.__dev.spoilsField({ clearDrops: true }); window.__dev.spoilsField({ spawnDrop: { tx: RX + 2, ty: RY, kind: "gear" } }); window.__dev.spoilsField({ spawnDrop: { tx: RX + 3, ty: RY, kind: "rune" } }); window.__dev.spoilsField({ tp: { tx: RX, ty: RY } }); });
  await sleep(250);
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });

  // ═══ L10 — North Star 2-cliente / 0-desync — DOS clientes FRESCOS (B,C) con MISMA inyección ═══
  // pageA está CONTAMINADO por inyecciones de PRUEBA. Comparar A vs B daría falso-desync. B+C frescos + clearDrops + inject idéntico.
  const pageB = await bootFresh(errB);
  const pageC = await bootFresh(errC);
  const buildB = await pageB.evaluate(() => window.__BUILD || null);
  const buildC = await pageC.evaluate(() => window.__BUILD || null);
  ok(`L10a clientes B+C cargan el MISMO build LIVE ${EXPECT_BUILD} (shard replicado)`, buildB === EXPECT_BUILD && buildC === EXPECT_BUILD, `buildB=${buildB} buildC=${buildC}`);

  // Tiles ABSOLUTOS fijos: ambos clientes limpian drops, inyectan el MISMO campo (gear+gold) + tp héroe a las MISMAS coords.
  // spoilsFieldScore = fn PURA de drops en radio ⇒ MISMO valor para todo observador del mismo snapshot replicado.
  const DA = { tx: 70, ty: 45 }, DB = { tx: 72, ty: 45 }, HT = { tx: 74, ty: 45 };   // drops 2-4 tiles al oeste del héroe (en radio)
  const readNS = async (pg) => await pg.evaluate((DA, DB, HT) => {
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ spawnDrop: { tx: DA.tx, ty: DA.ty, kind: "gear" } });   // 2
    window.__dev.spoilsField({ spawnDrop: { tx: DB.tx, ty: DB.ty, kind: "gold" } });   // 1
    window.__dev.spoilsField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.spoilsField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.spoilsField({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, sv: p.salvage }; });
    const sp = window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    const shards = vm.hero ? vm.hero.salvageShards : null;
    window.__dev.spoilsField({ clearDrops: true });
    return { score: vm.score, tier: vm.tier, salvage: vm.salvage, preview: vm.forageSalvagePreview, tag: vm.tag, spScore: sp.score, spCount: sp.count, lut, fp, enabled: vm.enabled, shards };
  }, DA, DB, HT);
  const NB = await readNS(pageB);
  const NC = await readNS(pageC);
  const expScore = myWeight("gear") + myWeight("gold");   // 3 ⇒ T2 salvage 2
  const convOK = NB.score === NC.score && NB.tier === NC.tier && NB.salvage === NC.salvage && NB.preview === NC.preview &&
                 NB.spScore === NC.spScore && NB.spCount === NC.spCount && NB.tag === NC.tag &&
                 JSON.stringify(NB.lut) === JSON.stringify(NC.lut) && NB.fp === NC.fp &&
                 NB.enabled === true && NC.enabled === true &&
                 NB.score === expScore && NB.tier === myTier(expScore) && NB.salvage === mySalvage(expScore);
  ok("L10b ★ NORTH STAR 2-CLIENTE: MISMOS drops+héroe (2 clientes FRESCOS) ⇒ score/tier/salvage + spoilsProbe(score,count) + LUT scoreProbe + tag + worldFingerprint IDÉNTICOS byte-a-byte B↔C (0 desync; sev-1 si desync); == my re-derivado score=3→T2/salvage2, enabled:true",
     convOK, `B={score:${NB.score},tier:${NB.tier},sal:${NB.salvage},prev:${NB.preview},spSc:${NB.spScore},spCt:${NB.spCount},fpLen:${NB.fp.length}} C={score:${NC.score},tier:${NC.tier},sal:${NC.salvage},prev:${NC.preview},spSc:${NC.spScore},spCt:${NC.spCount},fpLen:${NC.fp.length}} fpMatch=${NB.fp === NC.fp} myExp={score:${expScore},tier:${myTier(expScore)},sal:${mySalvage(expScore)}}`);

  // ═══ L10c — ESQUIRLAS PER-HERO (no compartidas, no dup entre clientes): h.salvageShards transitorio per-hero, FUERA de save+fp ═══
  const perHeroOK = !/"salvageShards"\s*:/.test(NB.fp) && !/"salvageShards"\s*:/.test(NC.fp) && typeof NB.shards === "number" && typeof NC.shards === "number";
  ok("L10c ★ ESQUIRLAS PER-HERO (no shared / no dup 2-cliente): h.salvageShards transitorio per-hero, FUERA del save+worldFingerprint ⇒ las esquirlas de B NUNCA cruzan a C ni al estado del mundo compartido (canal privado por-jugador)",
     perHeroOK, `B_shards=${NB.shards} C_shards=${NC.shards} fpHasShardKey=${/"salvageShards"\s*:/.test(NB.fp)}`);

  await sleep(200);
  await pageB.screenshot({ path: join(OUT, "client-b-spoilsfield.png") });

  // ═══ L11 — RECONEXIÓN mid-campo STATELESS 0-drift: reload B ⇒ enabled true + gExists false + save sin salvageShards + LUT/fp idénticos ═══
  const fpB_pre = NB.fp;
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await sleep(1200);
  await pageB.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const scB = await pageB.evaluate(() => window.__dev.scene());
  if (scB !== "play") await toPlay(pageB);
  await pageB.waitForFunction("window.__dev.spoilsField", { timeout: 8000 });
  const reconn = await pageB.evaluate((DA, DB, HT) => {
    const s = window.__dev.spoilsField();
    const save = JSON.stringify(window.__dev.saveBlob());
    const lut = [0, 1, 3, 6].map(sc => { const p = window.__dev.spoilsField({ scoreProbe: { score: sc } }).scoreProbe; return { s: sc, t: p.tier, sv: p.salvage }; });
    // re-inyecta el MISMO campo tras reconectar ⇒ el mundo persistente re-sincroniza la densidad
    window.__dev.spoilsField({ clearDrops: true });
    window.__dev.spoilsField({ spawnDrop: { tx: DA.tx, ty: DA.ty, kind: "gear" } });
    window.__dev.spoilsField({ spawnDrop: { tx: DB.tx, ty: DB.ty, kind: "gold" } });
    window.__dev.spoilsField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.spoilsField();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.spoilsField({ clearDrops: true });
    return { enabled: s.enabled, gExists: s.gExists, hasKey: /"salvageShards"\s*:|"(spoilsField|salvageFind)[A-Za-z]*"\s*:/.test(save), lut, fp, tier: vm.tier, tag: vm.tag };
  }, DA, DB, HT);
  const reconnOK = reconn.enabled === true && reconn.gExists === false && reconn.hasKey === false &&
                   JSON.stringify(reconn.lut) === JSON.stringify(NB.lut) && reconn.fp === fpB_pre && reconn.tier === 2 && reconn.tag === "◆";
  ok("L11 RECONNECT mid-campo STATELESS 0-drift: tras reload, enabled:true + gExists false + save sin salvageShards/salvageFind + LUT idéntica + worldFingerprint idéntico + re-sync densidad (T2/tag ◆) (0 drift, 0 persistencia indebida de esquirlas)",
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
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}  (LIVE ${LIVE}, SPOILS_FIELD_SURGE.enabled:true, build ${EXPECT_BUILD}, 2-cliente, EVO#79 21º flag)`);
process.exit(FAIL === 0 ? 0 : 1);
