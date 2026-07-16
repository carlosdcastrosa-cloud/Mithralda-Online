// CAS-2408 — POST-FLIP LIVE QA (INDEPENDENT) for VENDAVAL / TEMPESTAD (TEMPEST_SURGE.enabled:true). EVO mecánica #68, 2-cliente LIVE.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores),
// NO un mirror local ni el Higgsfield retirado. QA-OWNED harness (b5c10283) — NO es copia del self-verify GE ni del DARK:
//   oráculos RE-DERIVADOS del spec, reloj FRESCO QNOW distinto (9.720M), pids RE-ETIQUETADOS cliA/cliB.
// Porté los oráculos DARK (CAS-2405) al scaffolding LIVE (CAS-2403). 5 aceptaciones del ticket CAS-2408:
//   (1) build servido = version.json = EXPECT f7e5d3e7bd63 (flip CAS-2406) y AVANZÓ del pre-flip 2eb21950aab9 (CADENCE LIVE #67).
//   (2) DEFAULT-ON: TEMPEST_SURGE served enabled:TRUE + eje CONDICIÓN METEOROLÓGICA world-CONDITION shard-wide (intensidad = fn PURA del reloj compartido, 0-RNG, STATELESS, tiers 0.34→+1/0.67→+2). 0-desync 2-cliente.
//   (3) canal REUSADO lootQuality (piso minR rollGearInst = MISMO seam que Trailcraft #63) con SHARE-CAP tempestLootCap:3 (min(cap, trail+temp) ⇒ 0 doble-dip) + caves EXCLUIDA (indoor, resguardada).
//   (4) 0-REGRESIÓN: 9 arco previo LIVE (TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE + ...) served enabled:true; TEMPEST también true ⇒ arco completo; 0 err/404.
//   (5) PASS/FAIL con build id + client count + desync count.
// Run: node tools/cas2408-tempest-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2408-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");
const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };

const EXPECT_BUILD = "f7e5d3e7bd63";   // build deployado por el flip TEMPEST CAS-2406 (== version.json esperado)
const PREFLIP = "2eb21950aab9";        // build servido ANTES del flip (CADENCE LIVE #67 CAS-2402) — el LIVE debe AVANZAR de éste

// ── ORÁCULOS RE-DERIVADOS (re-implementación independiente del spec TEMPEST_SURGE; NO importados de sim.js) ──
const CFG = { start: 0.28, end: 0.45, minInt: 0.34, cap: 3, tiers: [{ min: 0.34, steps: 1 }, { min: 0.67, steps: 2 }] };
const oInten = (ph) => { const k = (ph - CFG.start) / (CFG.end - CFG.start); if (k < 0 || k > 1) return 0; return 1 - Math.abs(2 * k - 1); };
const oTier = (inten) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (inten >= CFG.tiers[i].min) t = i + 1; return t; };
const oSteps = (inten) => { const t = oTier(inten); return t > 0 ? CFG.tiers[t - 1].steps : 0; };
const oCombined = (trail, temp) => Math.min(CFG.cap, trail + temp);

const QNOW = 9_720_000;   // reloj de pared QA FIJO — FRESCO (≠ 9.615M DARK CAS-2405, ≠ 9.540M CADENCE). Mismo en ambos clientes ⇒ condición shard-wide determinista.

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QATmp";
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

async function installT(page) {
  await page.evaluate((QNOW) => {
    window.__TNOW = QNOW;
    window.__tprobe = (ph) => window.__dev.tempest({ intensityProbe: { phase: ph } }).probe;
    window.__tzone = (ph, zone) => window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: zone });
    window.__tpick = () => {
      const zones = window.__dev.tempest({ enabled: true }).zones || [];
      for (const z of zones) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
        if (s.zone === z && s.exposed && s.tier >= 1) return z; }
      return null;
    };
    window.__trailClear = () => { try { window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true }); } catch (e) {} };
    // restaura el estado LIVE de disco (enabled:true) + libera el override de fase ⇒ reloj real
    window.__tliveRestore = () => window.__dev.tempest({ enabled: true, phaseOverride: null });
  }, QNOW);
}

let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function boot(page, tag) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installT(page);
}

async function runOnce(round) {
  console.log(`\n===== CAS-2408 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page, `r${round}`);
  const build = await page.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido — 9 flags arco previo LIVE + TEMPEST_SURGE todos true (0-regr) + channel lootQuality + tempestLootCap 3 + caves excluida
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const tmpServed = en("TEMPEST_SURGE");           // EVO#68 — DEBE estar served true (flip CAS-2406 landed)
  // share-cap + gate params byte-servidos
  const tmpBlock = (cfgSrc.match(/export const TEMPEST_SURGE\s*=\s*\{[\s\S]*?\n\};/) || [""])[0];
  const chanOk = /channel:\s*"lootQuality"/.test(tmpBlock) && /tempestLootCap:\s*3/.test(tmpBlock) &&
    /zones:\s*\[[^\]]*"forest"[^\]]*"ruins"[^\]]*"abyss"[^\]]*"frost"[^\]]*"swamp"[^\]]*\]/.test(tmpBlock) && !/"caves"/.test(tmpBlock) &&
    /min:\s*0\.34,\s*steps:\s*1/.test(tmpBlock) && /min:\s*0\.67,\s*steps:\s*2/.test(tmpBlock);

  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tempest && window.__dev.trailcraft && window.__dev.delve && window.__dev.erudition && window.__dev.nocturne && window.__dev.cadence && window.__dev.saveBlob && window.__dev.worldFingerprint));
  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + TEMPEST served true + 9 arco true + channel/caps/zones + 0 err/404
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.tempest+arc hooks+saveBlob+fp; served TEMPEST_SURGE.enabled:true + 9 arco true (10 flags true, 0-regr) + channel lootQuality + tempestLootCap 3 + zones[forest,ruins,abyss,frost,swamp] sin caves + tiers 0.34/0.67 + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && tmpServed === "true" && arcTrue && chanOk && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} TEMPEST=${tmpServed} chan=${chanOk} arcTrue=${arcTrue} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: tempest().enabled===true (flip cargó) + channel 'lootQuality' + STATELESS (gExists:false, 0 acumulador per-pid). byte-neutro conservado vía TOGGLE OFF ⇒ delega a trailcraftFloor (seam byte-id).
  const dOn = await page.evaluate(() => { const s = window.__dev.tempest(); return { enabled: s.enabled, gExists: s.gExists, channel: s.channel }; });
  const off = await page.evaluate(() => {
    window.__trailClear();
    const s = window.__dev.tempest({ enabled: false, phaseOverride: null });
    const t = { lootQualityFloor: s.lootQualityFloor, trailcraftFloor: s.trailcraftFloor, tag: s.tag, tier: s.tier };
    window.__tliveRestore();
    return t;
  });
  ok("2 DEFAULT-ON (flip cargó): tempest().enabled===true; channel 'lootQuality'; STATELESS gExists:false (0 acumulador); TOGGLE enabled:false ⇒ lootQualityFloor()==trailcraftFloor() (delegación pura, seam byte-id) + tag \"\" (byte-neutro conservado)",
     dOn.enabled === true && dOn.channel === "lootQuality" && dOn.gExists === false && off.lootQualityFloor === off.trailcraftFloor && off.tag === "" && off.tier === 0,
     `on=${JSON.stringify(dOn)} off=${JSON.stringify(off)}`);

  await page.evaluate(() => window.__tliveRestore());

  // 3 — INTENSIDAD = fn PURA TRIANGULAR de la fase (oráculo QA): bordes 0, centro 1, fuera 0
  const tri = await page.evaluate(() => { const p = (ph) => window.__tprobe(ph);
    return { start: p(0.28), q1: p(0.3225), center: p(0.365), q3: p(0.4075), end: p(0.45), outLo: p(0.1), outHi: p(0.6) }; });
  const triOk = near(tri.start, oInten(0.28)) && near(tri.q1, oInten(0.3225), 0.01) && near(tri.center, oInten(0.365), 0.01) &&
    near(tri.q3, oInten(0.4075), 0.01) && near(tri.end, oInten(0.45)) && near(tri.outLo, 0) && near(tri.outHi, 0);
  ok("3 INTENSIDAD = fn PURA TRIANGULAR de la fase [oráculo QA]: start0.28=0, q1=0.5, centro0.365=1, q3=0.5, end0.45=0, fuera(0.1/0.6)=0 (0-RNG, determinista)",
     triOk, `start=${tri.start} q1=${tri.q1} center=${tri.center} q3=${tri.q3} end=${tri.end} out=${tri.outLo}/${tri.outHi}`);

  // 4 — TABLA de tiers = fn PURA de la INTENSIDAD (oráculo QA): 0.2→T0/0, 0.45→T1/1, 0.8→T2/2, 1.0→T2/2
  const z0 = await page.evaluate(() => window.__tpick());
  const tab = await page.evaluate((z) => { const out = [];
    for (const ti of [0.2, 0.45, 0.8, 1.0]) { const ph = 0.28 + (ti / 2) * 0.17;
      const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: z });
      out.push({ target: ti, inten: s.intensity, tier: s.tier, steps: s.steps }); }
    return out; }, z0);
  const tabOk = tab.every(r => near(r.inten, r.target, 0.02) && r.tier === oTier(r.target) && r.steps === oSteps(r.target));
  ok("4 TABLA tiers = fn PURA de la INTENSIDAD [oráculo QA]: 0.2→T0/0pasos, 0.45→T1/1, 0.8→T2/2, 1.0→T2/2 (monótono determinista)",
     tabOk, `zone=${z0} ${JSON.stringify(tab)}`);

  // 5 ★ DIFERENCIADOR CONDICIÓN+EXPOSICIÓN: tormenta pico+forest⇒ABRE; MISMA tormenta+caves(indoor)⇒T0/''; CALMA(0.6)+forest⇒T0/''
  const diff = await page.evaluate((z) => {
    const storm = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const caves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" });
    const calm = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.6, toZone: z });
    return { stormTier: storm.tier, stormFloor: storm.floor, stormSteps: storm.steps, stormStorming: storm.storming,
      cavesExposed: caves.exposed, cavesTier: caves.tier, cavesFloor: caves.floor,
      calmTier: calm.tier, calmStorming: calm.storming, calmFloor: calm.floor };
  }, z0);
  const diffOk = diff.stormTier >= 1 && diff.stormSteps >= 1 && diff.stormStorming === true && (rarityRank[diff.stormFloor] || 0) >= 1 &&
    diff.cavesExposed === false && diff.cavesTier === 0 && diff.cavesFloor === "" &&
    diff.calmTier === 0 && diff.calmStorming === false && diff.calmFloor === "";
  ok("5 ★ DIFERENCIADOR CONDICIÓN+EXPOSICIÓN: tormenta pico+forest⇒ABRE (tier≥1, floor bump); MISMA tormenta en CAVES (indoor/resguardada)⇒T0/''; CALMA(0.6)+forest⇒T0/''",
     diffOk, JSON.stringify(diff));

  // 6 (AC2) CANAL REUSADO lootQuality + SEAM: lootTick SEED FIJO; OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity
  const seam = await page.evaluate((z) => {
    window.__trailClear();
    window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    const off = window.__dev.tempest({ lootTick: { seed: 0x71fa, tmin: 1, tmax: 2 } }).lootPicked;
    window.__trailClear();
    window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const on = window.__dev.tempest({ lootTick: { seed: 0x71fa, tmin: 1, tmax: 2 } }).lootPicked;
    return { off, on };
  }, z0);
  const seamOk = seam.off && seam.on && seam.off.floor === "" && seam.off.floorRarity === seam.off.baseRarity &&
    seam.on.tempestSteps >= 1 && (rarityRank[seam.on.floorRarity] || 0) >= (rarityRank[seam.on.baseRarity] || 0) && (rarityRank[seam.on.floorRarity] || 0) >= 1;
  ok("6 (AC2) CANAL REUSADO lootQuality + SEAM (mismo minR de rollGearInst que Trailcraft): OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity (bono de rareza)",
     seamOk, JSON.stringify(seam));

  // 7 ★ SHARE-CAP vs Trailcraft (AC3): Trail T3(2 pasos)+Tempest T2(2 pasos) ⇒ combinado CAPADO a tempestLootCap(3) (Tempest cede 1, NO 4) [oráculo QA]
  const share = await page.evaluate((z) => {
    try {
      window.__dev.trailcraft({ enabled: true, self: "self", nowMs: window.__TNOW });
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      window.__dev.trailcraft({ nowMs: window.__TNOW, self: "self", craft: 6, pid: "self", atMs: window.__TNOW, toZone: z });
    } catch (e) {}
    window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const lt = window.__dev.tempest({ lootTick: { seed: 0x71fa, tmin: 1, tmax: 2 } }).lootPicked;
    window.__trailClear(); window.__dev.tempest({ toZone: z });
    const solo = window.__dev.tempest({ nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    return { trailSteps: lt.trailSteps, tempestSteps: lt.tempestSteps, combined: lt.combined, cap: lt.cap, soloSteps: solo.steps };
  }, z0);
  const expCombined = oCombined(share.trailSteps, share.tempestSteps);
  const shareOk = share.trailSteps === 2 && share.tempestSteps === 2 && share.combined === expCombined && share.combined === 3 &&
    share.combined <= share.cap && share.soloSteps === 2;
  ok("7 ★ SHARE-CAP vs Trailcraft (AC3) [oráculo QA min(cap3, trail+temp)]: Trail T3(2)+Tempest T2(2)⇒combinado 3 (Tempest cede 1, NO 4) 0-doble-dip; solo⇒2; combined≤cap 3 (no runaway)",
     shareOk, `${JSON.stringify(share)} oracle=${expCombined}`);

  // 8 ★ ORTOGONALIDAD lootQuality ⊥ goldFind/restedMult/critChance/vamp/xpGain/wardRegen/oocMitigation (abrir tormenta NO mueve otros canales del arco LIVE)
  const orth = await page.evaluate((z) => {
    window.__trailClear();
    const before = window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    const after = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const pick = (s) => ({ gold: s.goldFindMul, rested: s.restedXpMult, crit: s.critChancePct, vamp: s.vampMul, xp: s.xpGainMul, ward: s.wardRegenMul, ooc: s.oocMitigMul });
    return { beforeFloor: before.floor, afterFloor: after.floor, afterTier: after.tier, offCh: pick(before), onCh: pick(after) };
  }, z0);
  const chEq = JSON.stringify(orth.offCh) === JSON.stringify(orth.onCh);
  ok("8 ★ ORTOGONALIDAD lootQuality ⊥ goldFind/restedMult/critChance/vamp/xpGain/wardRegen/oocMitigation (abrir tormenta NO mueve otros canales del arco LIVE)",
     orth.afterTier >= 1 && orth.afterFloor !== orth.beforeFloor && chEq, `off=${JSON.stringify(orth.offCh)} on=${JSON.stringify(orth.onCh)}`);

  // 9 (AC4) 0-REGRESIÓN runtime: arc flags server-side todos enabled:true INCLUYENDO TEMPEST (arco completo LIVE)
  await page.evaluate(() => window.__tliveRestore());
  const rt = await page.evaluate(() => {
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    return { trail: tryEn("trailcraft"), delve: tryEn("delve"), erud: tryEn("erudition"), noct: tryEn("nocturne"), cad: tryEn("cadence"), temp: tryEn("tempest") };
  });
  ok("9 (AC4) 0-REGRESIÓN runtime: TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE + TEMPEST_SURGE todos enabled:true (arco LIVE completo, 0 mecánica regresó)",
     rt.trail === true && rt.delve === true && rt.erud === true && rt.noct === true && rt.cad === true && rt.temp === true, JSON.stringify(rt));

  // 10 ★ 5 zonas EXPUESTAS aplican (tier≥1, steps≥1) broken=[]; caves EXCLUIDA (indoor/resguardada)
  const zones = await page.evaluate(() => {
    const zs = window.__dev.tempest({ enabled: true }).zones || [];
    const broken = [];
    for (const z of zs) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
      if (!(s.zone === z && s.exposed && s.tier >= 1 && s.steps >= 1)) broken.push(z); }
    const caves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" });
    return { zs, broken, cavesExposed: caves.exposed, cavesTier: caves.tier };
  });
  ok("10 ★ TEMPEST 5 zonas EXPUESTAS [forest,ruins,abyss,frost,swamp]: tormenta aplica (tier≥1, steps≥1) broken=[]; caves EXCLUIDA (indoor, resguardada)",
     zones.zs.length === 5 && zones.broken.length === 0 && zones.cavesExposed === false && zones.cavesTier === 0,
     `zones=${JSON.stringify(zones.zs)} broken=${JSON.stringify(zones.broken)} caves={exposed:${zones.cavesExposed},tier:${zones.cavesTier}}`);

  // 11 badge draws ON not OFF + fps (perf budget) — 60fps LIVE
  const badge = await page.evaluate(async (z) => {
    const CanvasProto = CanvasRenderingContext2D.prototype;
    let onCount = 0, offCount = 0, mode = "off";
    const origFill = CanvasProto.fillText;
    CanvasProto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Tempestad:") === 0) { if (mode === "on") onCount++; else offCount++; } return origFill.call(this, t, ...a); };
    window.__dev.tempest({ enabled: false, phaseOverride: null });
    mode = "off"; await new Promise(r => setTimeout(r, 300));
    window.__dev.tempest({ enabled: true, nowMs: Date.now(), phaseOverride: 0.365, toZone: z });
    mode = "on"; const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 600) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    CanvasProto.fillText = origFill;
    return { onCount, offCount, fps };
  }, z0);
  ok("11 render badge 'Tempestad:' se DIBUJA ON (count>0), NO OFF (count 0), fps≥55 (perf budget 60fps LIVE)",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));
  await page.evaluate(() => window.__tliveRestore());
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  return { page, build };
}

let build1 = null, buildInfo = null;
let nsBrowser = null;
let desync = 0;
try {
  const r1 = await runOnce(1);
  buildInfo = r1.build;
  await r1.page.close();
  const r2 = await runOnce(2);
  build1 = r2.build;
  await r2.page.close();
  ok("12 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence LIVE (world-CONDITION shard-wide) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE LIVE =====`);
  await browser.close(); browser = null;
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ cada página se crea, se trae al frente y se bootea EN SECUENCIA.
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
    await p.bringToFront();
    await toPlay(p); await installT(p);
    return p;
  }
  const pA = await mkNS("cliA");
  const pB = await mkNS("cliB");

  const readForest = async (pg, ph) => pg.evaluate((args) => {
    window.__trailClear();
    const z = (window.__dev.tempest({ enabled: true }).zones || [])[0];
    const s = window.__dev.tempest({ enabled: true, nowMs: args.now, phaseOverride: args.ph, toZone: z });
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, steps: s.steps, floor: s.floor, storming: s.storming };
  }, { now: QNOW, ph });

  // 13a pico (0.365): condición IDÉNTICA byte-a-byte entre los 2 clientes LIVE
  const a0 = await readForest(pA, 0.365); const b0 = await readForest(pB, 0.365);
  const conv0 = near(a0.intensity, b0.intensity) && a0.tier === b0.tier && a0.steps === b0.steps && a0.floor === b0.floor && a0.storming === b0.storming;
  if (!conv0) desync++;
  ok("13a NORTH STAR LIVE: MISMA fase(0.365)/reloj ⇒ intensidad/tier/steps/floor/storming IDÉNTICOS byte-a-byte en cliA y cliB (0 desync, world-CONDITION shard-wide)",
     conv0 && near(a0.intensity, 1, 0.01) && a0.tier === 2 && a0.floor !== "", `A=${JSON.stringify(a0)} B=${JSON.stringify(b0)}`);

  // 13b OTRA fase de tormenta (0.3225 ⇒ inten≈0.5 ⇒ T1): sigue idéntico (rampa determinista)
  const a1 = await readForest(pA, 0.3225); const b1 = await readForest(pB, 0.3225);
  const conv1 = near(a1.intensity, b1.intensity) && a1.tier === b1.tier && a1.steps === b1.steps && a1.floor === b1.floor;
  if (!conv1) desync++;
  ok("13b NORTH STAR LIVE: fase(0.3225⇒inten≈0.5⇒T1) ⇒ intensidad/tier/steps/floor IDÉNTICOS entre clientes; oráculo QA T1/1paso (rampa determinista, 0 desync)",
     conv1 && near(a1.intensity, oInten(0.3225), 0.02) && a1.tier === oTier(oInten(0.3225)) && a1.steps === oSteps(oInten(0.3225)),
     `A=${JSON.stringify(a1)} B=${JSON.stringify(b1)}`);

  // 13c EXPOSICIÓN local sobre condición compartida: cliA en forest (expuesta) ABRE; cliB en caves (resguardada) NO — MISMA intensidad de mundo
  const aForest = await pA.evaluate((now) => { window.__trailClear();
    const s = window.__dev.tempest({ enabled: true, nowMs: now, phaseOverride: 0.365, toZone: "forest" });
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, floor: s.floor, exposed: s.exposed }; }, QNOW);
  const bCaves = await pB.evaluate((now) => { window.__trailClear();
    const s = window.__dev.tempest({ enabled: true, nowMs: now, phaseOverride: 0.365, toZone: "caves" });
    const worldInten = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, floor: s.floor, exposed: s.exposed, worldInten }; }, QNOW);
  const conv2 = near(aForest.intensity, bCaves.worldInten, 0.01);
  if (!conv2) desync++;
  ok("13c NORTH STAR LIVE EXPOSICIÓN: MISMA condición de mundo (intensidad idéntica) pero cliA/forest ABRE (tier≥1, floor≠'') y cliB/caves resguardada NO (tier0, floor'') ⇒ exposición local ⊥ condición shard",
     conv2 && aForest.exposed === true && aForest.tier >= 1 && aForest.floor !== "" &&
     bCaves.exposed === false && bCaves.tier === 0 && bCaves.floor === "",
     `A=${JSON.stringify(aForest)} B=${JSON.stringify(bCaves)}`);

  // 13d reconnect/persistence: cliB reloads (rejoin), re-boots, y la condición shard-wide sigue byte-idéntica a cliA (mismo reloj/fase)
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB); await installT(pB);
  const aRe = await readForest(pA, 0.365); const bRe = await readForest(pB, 0.365);
  const convRe = near(aRe.intensity, bRe.intensity) && aRe.tier === bRe.tier && aRe.steps === bRe.steps && aRe.floor === bRe.floor;
  if (!convRe) desync++;
  ok("13d NORTH STAR LIVE RECONNECT: cliB recarga (rejoin al mundo persistente), re-bootea, y la condición shard-wide sigue byte-idéntica a cliA (0 drift tras reconnect)",
     convRe && bRe.floor !== "", `A=${JSON.stringify(aRe)} B=${JSON.stringify(bRe)}`);

  await pA.screenshot({ path: join(OUT, "client-a-forest.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.close(); await pB.close();

  ok("0 no JS errors durante todo el run LIVE", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
}

console.log(`\n==== CAS-2408 POST-FLIP LIVE QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} (expect ${EXPECT_BUILD}) clients=2 desync=${desync} ====`);
process.exit(FAIL === 0 ? 0 : 1);
