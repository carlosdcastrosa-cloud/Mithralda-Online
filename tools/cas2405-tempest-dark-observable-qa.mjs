// CAS-2405 — INDEPENDENT DARK QA for VENDAVAL / TEMPESTAD (TEMPEST_SURGE.enabled:false). EVO mecánica #68, 2-cliente DARK.
// QA-OWNED harness (b5c10283). NOT a copy of the GE self-verify (cas2404): oráculos RE-DERIVADOS del config, reloj FRESCO
// QNOW=9,615,000 (distinto del GE 9,540,000 y del cadence 9,401,000), pids RE-ETIQUETADOS obsA/obsB/peer, foco en las
// 3 aceptaciones DARK NO-negociables del ticket CAS-2405:
//   (A) BYTE-NEUTRAL OFF: enabled:false ⇒ NINGUNA derivación de clima corre (tempestPhaseNow nunca), G.tempest* nunca se crea (STATELESS),
//       tempestFloorSteps()=0 y lootQualityFloor() DELEGA a trailcraftFloor() ⇒ seam de drop BYTE-IDÉNTICO al LIVE de Trailcraft #63,
//       tag "" ⇒ save.v1 SIN clave 'tempest', worldFingerprint byte-estable (0 RNG drift).
//   (B) 0 DESYNC 2-cliente: DOS páginas puppeteer independientes, MISMO reloj/fase compartida ⇒ el CLIMA es WORLD-STATE shard-wide ⇒
//       intensidad/tier/steps/floor IDÉNTICOS byte-a-byte; la EXPOSICIÓN se aplica local (forest abre, caves resguardada NO) sobre la MISMA condición.
//   (C) 0-REGRESIÓN: TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE served enabled:true; TEMPEST_SURGE served false (DARK #68).
// Los mecanismos runtime (intensidad/tiers/share-cap/seam) se OBSERVAN vía flip IN-MEMORY (__dev.tempest({enabled:true})) — el disco
// sigue false; prueba que la ruta ON es correcta CUANDO se flipe, sin tocar el build DARK. Post-flip QA revalida LIVE.
//
// Oráculos independientes (re-derivados de sim/config.js TEMPEST_SURGE): stormStart=0.28, stormEnd=0.45, minIntensity=0.34,
//   tempestLootCap=3, tiers min→steps {0.34→1, 0.67→2}. zones EXPUESTAS=[forest,ruins,abyss,frost,swamp] (caves EXCLUIDA).
//   Intensidad(phase) = rampa TRIANGULAR en [0.28,0.45]: k=(ph-0.28)/0.17; inten = (0≤k≤1) ? 1-|2k-1| : 0. Tier(inten)=mayor i con inten≥min[i].
//   Share-cap con Trailcraft: combined = min(tempestLootCap, trailSteps + tempestSteps).
// Run: node tools/cas2405-tempest-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2405-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
const QNOW = 9615000;   // reloj de pared FIJO (ms) — FRESCO, distinto de GE/cadence. Mismo en ambos clientes ⇒ condición shard-wide determinista.

// ---- oráculos independientes (QA re-deriva, NO lee del snapshot) ----
const CFG = { start: 0.28, end: 0.45, minInt: 0.34, cap: 3, tiers: [{ min: 0.34, steps: 1 }, { min: 0.67, steps: 2 }] };
const oInten = (ph) => { const k = (ph - CFG.start) / (CFG.end - CFG.start); if (k < 0 || k > 1) return 0; return 1 - Math.abs(2 * k - 1); };
const oTier = (inten) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (inten >= CFG.tiers[i].min) t = i + 1; return t; };
const oSteps = (inten) => { const t = oTier(inten); return t > 0 ? CFG.tiers[t - 1].steps : 0; };
const oCombined = (trail, temp) => Math.min(CFG.cap, trail + temp);
const phaseFor = (inten) => CFG.start + (inten / 2) * (CFG.end - CFG.start);   // rama ascendente de la rampa ⇒ intensidad objetivo

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function waitMenu(page) {
  try { await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 }); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 }); }
}
async function toPlay(page) {
  await waitMenu(page);
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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
    // enable + fija fase + teleporta a zona ⇒ snapshot
    window.__tzone = (ph, zone) => window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: zone });
    // barre las zonas expuestas y devuelve la 1ª donde el héroe cae DENTRO con tormenta abierta (tier≥1)
    window.__tpick = () => {
      const zones = window.__dev.tempest({ enabled: true }).zones || [];
      for (const z of zones) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
        if (s.zone === z && s.exposed && s.tier >= 1) return z; }
      return null;
    };
    // limpia el canal partner (Trailcraft) para aislar el seam lootQuality a sólo-tempest
    window.__trailClear = () => { try { window.__dev.trailcraft({ clear: true }); window.__dev.trailcraft({ leave: true }); } catch (e) {} };
  }, QNOW);
}

const server = await startServer();
const base = server.url;
let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];

async function runOnce(tag) {
  console.log(`\n===== RUN ${tag} =====`);
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  page.on("pageerror", (e) => errors.push(`[${tag}] ` + String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${tag}] ` + m.text()); });
  const errStart = errors.length;
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tempest && window.__dev.trailcraft && window.__dev.delve && window.__dev.erudition && window.__dev.nocturne && window.__dev.cadence && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.tempest + arc hooks + __BUILD, 0 JS err", hooks && errors.length === errStart && !!build, `build=${build}`);

  // 2 (A) byte-neutral OFF fresh boot: read BEFORE any inject
  const dark = await page.evaluate(() => window.__dev.tempest());
  ok("2 (A) byte-neutral OFF fresh boot: enabled:false + gExists:false (STATELESS, derivación jamás corrió) + tier/intensity 0 + channel lootQuality + tag'' + storming false",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.intensity === 0 && dark.channel === "lootQuality" && dark.tag === "" && dark.storming === false,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} inten=${dark.intensity} channel=${dark.channel} tag="${dark.tag}" storming=${dark.storming}`);

  // 3 (A) save OFF: no new persisted key (estado 100% derivado del reloj)
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 (A) save OFF: no 'tempest'/'tempestServer' key (estado 100% derivado del reloj, 0 persistencia nueva)", !/"tempest(Now|Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 (A) worldFingerprint stable across enabled toggle (0 RNG drift) — my own seed 761
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(761)));
  await page.evaluate(() => window.__dev.tempest({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(761)));
  await page.evaluate(() => window.__dev.tempest({ enabled: false, phaseOverride: null }));
  ok("4 (A) worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpB === fpA, `match=${fpB === fpA}`);

  await installT(page);

  // 5 INTENSIDAD = fn PURA TRIANGULAR de la fase (oráculo QA): bordes 0, centro 1, fuera 0 + puntos internos
  const tri = await page.evaluate(() => {
    const p = (ph) => window.__tprobe(ph);
    return { start: p(0.28), q1: p(0.3225), center: p(0.365), q3: p(0.4075), end: p(0.45), outLo: p(0.1), outHi: p(0.6) };
  });
  const triOk = near(tri.start, oInten(0.28)) && near(tri.q1, oInten(0.3225), 0.01) && near(tri.center, oInten(0.365), 0.01) &&
    near(tri.q3, oInten(0.4075), 0.01) && near(tri.end, oInten(0.45)) && near(tri.outLo, 0) && near(tri.outHi, 0);
  ok("5 INTENSIDAD = fn PURA TRIANGULAR de la fase [oráculo QA]: start0.28=0, q1=0.5, centro0.365=1, q3=0.5, end0.45=0, fuera=0",
     triOk, `start=${tri.start} q1=${tri.q1} center=${tri.center} q3=${tri.q3} end=${tri.end} out=${tri.outLo}/${tri.outHi}`);

  // 6 TABLA de tiers = fn PURA de la INTENSIDAD (oráculo QA): usamos intensidades DENTRO de banda (no en el borde de min, float-safe)
  const z0 = await page.evaluate(() => window.__tpick());
  const tab = await page.evaluate((z) => {
    const out = [];
    for (const ti of [0.2, 0.45, 0.8, 1.0]) {
      const ph = 0.28 + (ti / 2) * 0.17;
      const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: ph, toZone: z });
      out.push({ target: ti, inten: s.intensity, tier: s.tier, steps: s.steps });
    }
    return out;
  }, z0);
  const tabOk = tab.every(r => near(r.inten, r.target, 0.02) && r.tier === oTier(r.target) && r.steps === oSteps(r.target));
  ok("6 TABLA tiers = fn PURA de la INTENSIDAD [oráculo QA]: 0.2→T0/0pasos, 0.45→T1/1, 0.8→T2/2, 1.0→T2/2 (monótono determinista)",
     tabOk, `zone=${z0} ${JSON.stringify(tab)}`);

  // 7 ★ DIFERENCIADOR CONDICIÓN + EXPOSICIÓN: tormenta+forest⇒abre; MISMA tormenta+caves⇒T0; calma+forest⇒T0
  const diff = await page.evaluate((z) => {
    const storm = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const caves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" });
    const calm = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.6, toZone: z });
    return { stormTier: storm.tier, stormFloor: storm.floor, stormSteps: storm.steps, stormStorming: storm.storming,
      cavesZone: caves.zone, cavesExposed: caves.exposed, cavesTier: caves.tier, cavesFloor: caves.floor,
      calmTier: calm.tier, calmStorming: calm.storming, calmFloor: calm.floor };
  }, z0);
  const diffOk = diff.stormTier >= 1 && diff.stormSteps >= 1 && diff.stormStorming === true && (rarityRank[diff.stormFloor] || 0) >= 1 &&
    diff.cavesExposed === false && diff.cavesTier === 0 && diff.cavesFloor === "" &&
    diff.calmTier === 0 && diff.calmStorming === false && diff.calmFloor === "";
  ok("7 ★ DIFERENCIADOR CONDICIÓN+EXPOSICIÓN: tormenta pico+forest⇒ABRE (tier≥1, floor bump); MISMA tormenta en CAVES (resguardada)⇒T0/''; CALMA(0.6)+forest⇒T0/''",
     diffOk, JSON.stringify(diff));

  // 8 SHARD-WIDE: la intensidad NO depende de pid/zona (world-state, no meter personal)
  const shard = await page.evaluate(() => {
    const a = window.__tprobe(0.365);
    window.__dev.tempest({ toZone: "forest" }); const b = window.__tprobe(0.365);
    window.__dev.tempest({ leave: true }); const c = window.__tprobe(0.365);
    return { a, b, c };
  });
  ok("8 SHARD-WIDE / world-state: intensidad NO depende de pid/zona (misma fase ⇒ misma intensidad, CONDICIÓN del mundo)",
     near(shard.a, shard.b) && near(shard.b, shard.c) && near(shard.a, 1, 0.01), JSON.stringify(shard));

  // 9 (A) CANAL REUSADO lootQuality + SEAM: lootTick SEED FIJO; OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity
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
  ok("9 (A) CANAL REUSADO lootQuality + SEAM (mismo minR de rollGearInst que Trailcraft): OFF ⇒ floorRarity==baseRarity (byte-id); tormenta expuesta ⇒ floorRarity≥baseRarity",
     seamOk, JSON.stringify(seam));

  // 10 (A) ★ BYTE-NEUTRO/0-REGR crítico del ticket: Tempest OFF ⇒ lootQualityFloor() == trailcraftFloor() (delegación pura ⇒ seam byte-id al LIVE de Trailcraft)
  const neutral = await page.evaluate((z) => {
    // Trailcraft T3 en la zona (craft≥6 ⇒ 2 pasos) para que trailcraftFloor sea NO vacío ⇒ delegación no trivial
    try {
      window.__dev.trailcraft({ enabled: true, self: "self", nowMs: window.__TNOW });
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      window.__dev.trailcraft({ nowMs: window.__TNOW, self: "self", craft: 6, pid: "self", atMs: window.__TNOW, toZone: z });
    } catch (e) {}
    const s = window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    return { lootQualityFloor: s.lootQualityFloor, trailcraftFloor: s.trailcraftFloor, tier: s.tier };
  }, z0);
  const neutralOk = neutral.lootQualityFloor === neutral.trailcraftFloor && neutral.lootQualityFloor !== "" && neutral.tier === 0;
  ok("10 (A) ★ BYTE-NEUTRO/0-REGR: Tempest OFF ⇒ lootQualityFloor()==trailcraftFloor() (delegación pura ⇒ seam byte-id al LIVE de Trailcraft #63)",
     neutralOk, JSON.stringify(neutral));

  // 11 ★ SHARE-CAP vs Trailcraft: Trail T3(2 pasos) + Tempest T2(2 pasos) ⇒ combinado CAPADO a tempestLootCap(3) (Tempest cede 1, NO 4) [oráculo QA]
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
  ok("11 ★ SHARE-CAP vs Trailcraft [oráculo QA min(cap3, trail+temp)]: Trail T3(2)+Tempest T2(2)⇒combinado 3 (Tempest cede 1, NO 4) 0-doble-dip; solo⇒2; combined≤cap",
     shareOk, `${JSON.stringify(share)} oracle=${expCombined}`);

  // 12 ★ ORTOGONALIDAD lootQuality ⊥ goldFind/restedMult/critChance/vamp/xpGain/wardRegen/oocMitigation (abrir tormenta NO mueve otros canales)
  const orth = await page.evaluate((z) => {
    window.__trailClear();
    const before = window.__dev.tempest({ enabled: false, phaseOverride: null, toZone: z });
    const after = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    const pick = (s) => ({ gold: s.goldFindMul, rested: s.restedXpMult, crit: s.critChancePct, vamp: s.vampMul, xp: s.xpGainMul, ward: s.wardRegenMul, ooc: s.oocMitigMul });
    return { beforeFloor: before.floor, afterFloor: after.floor, afterTier: after.tier, offCh: pick(before), onCh: pick(after) };
  }, z0);
  const chEq = JSON.stringify(orth.offCh) === JSON.stringify(orth.onCh);
  ok("12 ★ ORTOGONALIDAD lootQuality ⊥ goldFind/restedMult/critChance/vamp/xpGain/wardRegen/oocMitigation (abrir tormenta NO mueve otros canales)",
     orth.afterTier >= 1 && orth.afterFloor !== orth.beforeFloor && chEq, `off=${JSON.stringify(orth.offCh)} on=${JSON.stringify(orth.onCh)}`);

  // 13 ★ NOCHE TORMENTOSA (⊥ Nocturne dimensión temporal): Tempest (fase tormenta) + Nocturne (fase noche) abren A LA VEZ ⇒ clima ⊥ día/noche
  const night = await page.evaluate((z) => {
    const t = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
    let nightNow = null, nocturnePhase = null;
    try {
      window.__dev.nocturne({ enabled: true, phaseOverride: 0.85 });
      const snap = window.__dev.nocturne({ phaseProbe: window.__TNOW });
      const pr = snap ? snap.phaseProbe : null;
      nocturnePhase = pr ? pr.phase : null; nightNow = !!(pr && pr.night === true);
      window.__dev.nocturne({ enabled: true, phaseOverride: null });
    } catch (e) { nightNow = "ERR:" + e; }
    return { tempestTier: t.tier, tempestStorming: t.storming, nightNow, nocturnePhase };
  }, z0);
  ok("13 ★ NOCHE TORMENTOSA (⊥ Nocturne temporal): Tempest (tormenta) + Nocturne (fase noche) válidos A LA VEZ ⇒ clima ⊥ fase día/noche (dimensiones ⊥)",
     night.tempestTier >= 1 && night.tempestStorming === true && night.nightNow === true, JSON.stringify(night));

  // 14 (C) 0-REGRESIÓN: arc flags served enabled:true; TEMPEST served false. Restore in-memory to disk DARK first.
  await page.evaluate(() => window.__dev.tempest({ enabled: false, phaseOverride: null }));
  const arc = await page.evaluate(() => {
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    return { trail: tryEn("trailcraft"), delve: tryEn("delve"), erud: tryEn("erudition"), noct: tryEn("nocturne"), cad: tryEn("cadence"), temp: tryEn("tempest") };
  });
  ok("14 (C) 0-REGRESIÓN: TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE served enabled:true (arco LIVE) + TEMPEST_SURGE served false (DARK #68)",
     arc.trail === true && arc.delve === true && arc.erud === true && arc.noct === true && arc.cad === true && arc.temp === false, JSON.stringify(arc));

  // 15 ★ 5 zonas EXPUESTAS aplican (tier≥1, steps≥1) broken=[]; caves EXCLUIDA (resguardada)
  const zones = await page.evaluate(() => {
    const zs = window.__dev.tempest({ enabled: true }).zones || [];
    const broken = [];
    for (const z of zs) { const s = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: z });
      if (!(s.zone === z && s.exposed && s.tier >= 1 && s.steps >= 1)) broken.push(z); }
    const caves = window.__dev.tempest({ enabled: true, nowMs: window.__TNOW, phaseOverride: 0.365, toZone: "caves" });
    return { zs, broken, cavesExposed: caves.exposed, cavesTier: caves.tier };
  });
  ok("15 ★ TEMPEST 5 zonas EXPUESTAS [forest,ruins,abyss,frost,swamp]: tormenta aplica (tier≥1, steps≥1) broken=[]; caves NO (resguardada, excluida)",
     zones.zs.length === 5 && zones.broken.length === 0 && zones.cavesExposed === false && zones.cavesTier === 0,
     `zones=${JSON.stringify(zones.zs)} broken=${JSON.stringify(zones.broken)} caves={exposed:${zones.cavesExposed},tier:${zones.cavesTier}}`);

  // 16 badge draws ON not OFF + fps (perf budget)
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
  ok("16 render badge 'Tempestad:' se DIBUJA ON (count>0), NO OFF (count 0), fps≥55 (perf budget)",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // restore disk-DARK state in memory before returning
  await page.evaluate(() => window.__dev.tempest({ enabled: false, phaseOverride: null }));
  return { page, build };
}

let build1 = null, buildInfo = null;
let nsBrowser = null;
try {
  const r1 = await runOnce("×1");
  buildInfo = r1.build;
  await r1.page.close();
  const r2 = await runOnce("×2");
  build1 = r2.build;
  await r2.page.close();
  ok("17 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence (world-CONDITION shard-wide) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE =====`);
  await browser.close(); browser = null;
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur) ⇒ cada página se crea, se trae al frente y se bootea EN SECUENCIA.
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await p.bringToFront();
    await toPlay(p); await installT(p);
    return p;
  }
  const pA = await mkNS("obsA");
  const pB = await mkNS("obsB");

  // MISMO reloj + MISMA fase ⇒ misma CONDICIÓN shard-wide. Ambos clientes en la 1ª zona expuesta (trail vacío en ambos ⇒ floor = sólo-tempest).
  const readForest = async (pg, ph) => pg.evaluate((args) => {
    window.__trailClear();
    const z = (window.__dev.tempest({ enabled: true }).zones || [])[0];
    const s = window.__dev.tempest({ enabled: true, nowMs: args.now, phaseOverride: args.ph, toZone: z });
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, steps: s.steps, floor: s.floor, storming: s.storming };
  }, { now: QNOW, ph });

  // 18a pico (0.365): condición IDÉNTICA byte-a-byte entre los 2 clientes
  const a0 = await readForest(pA, 0.365); const b0 = await readForest(pB, 0.365);
  const conv0 = near(a0.intensity, b0.intensity) && a0.tier === b0.tier && a0.steps === b0.steps && a0.floor === b0.floor && a0.storming === b0.storming;
  ok("18a NORTH STAR: MISMA fase(0.365)/reloj ⇒ intensidad/tier/steps/floor/storming IDÉNTICOS byte-a-byte en obsA y obsB (0 desync, world-CONDITION shard-wide)",
     conv0 && near(a0.intensity, 1, 0.01) && a0.tier === 2 && a0.floor !== "", `A=${JSON.stringify(a0)} B=${JSON.stringify(b0)}`);

  // 18b OTRA fase de tormenta (0.3225 ⇒ inten≈0.5 ⇒ T1): sigue idéntico (rampa determinista)
  const a1 = await readForest(pA, 0.3225); const b1 = await readForest(pB, 0.3225);
  const conv1 = near(a1.intensity, b1.intensity) && a1.tier === b1.tier && a1.steps === b1.steps && a1.floor === b1.floor;
  ok("18b NORTH STAR: fase(0.3225⇒inten≈0.5⇒T1) ⇒ intensidad/tier/steps/floor IDÉNTICOS entre clientes; oráculo QA T1/1paso (rampa determinista, 0 desync)",
     conv1 && near(a1.intensity, oInten(0.3225), 0.02) && a1.tier === oTier(oInten(0.3225)) && a1.steps === oSteps(oInten(0.3225)),
     `A=${JSON.stringify(a1)} B=${JSON.stringify(b1)}`);

  // 18c EXPOSICIÓN local sobre condición compartida: obsA en forest (expuesta) ABRE; obsB en caves (resguardada) NO — MISMA intensidad de mundo
  const aForest = await pA.evaluate((now) => { window.__trailClear();
    const s = window.__dev.tempest({ enabled: true, nowMs: now, phaseOverride: 0.365, toZone: "forest" });
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, floor: s.floor, exposed: s.exposed }; }, QNOW);
  const bCaves = await pB.evaluate((now) => { window.__trailClear();
    const s = window.__dev.tempest({ enabled: true, nowMs: now, phaseOverride: 0.365, toZone: "caves" });
    const worldInten = window.__dev.tempest({ intensityProbe: { phase: 0.365 } }).probe;
    return { zone: s.zone, intensity: s.intensity, tier: s.tier, floor: s.floor, exposed: s.exposed, worldInten }; }, QNOW);
  ok("18c NORTH STAR EXPOSICIÓN: MISMA condición de mundo (intensidad idéntica) pero obsA/forest ABRE (tier≥1, floor≠'') y obsB/caves resguardada NO (tier0, floor'') ⇒ exposición local ⊥ condición shard",
     near(aForest.intensity, bCaves.worldInten, 0.01) && aForest.exposed === true && aForest.tier >= 1 && aForest.floor !== "" &&
     bCaves.exposed === false && bCaves.tier === 0 && bCaves.floor === "",
     `A=${JSON.stringify(aForest)} B=${JSON.stringify(bCaves)}`);

  // 18d reconnect/persistence: obsB reloads (rejoin), re-boots, y la condición shard-wide sigue byte-idéntica a obsA (mismo reloj/fase)
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB); await installT(pB);
  const aRe = await readForest(pA, 0.365); const bRe = await readForest(pB, 0.365);
  const convRe = near(aRe.intensity, bRe.intensity) && aRe.tier === bRe.tier && aRe.steps === bRe.steps && aRe.floor === bRe.floor;
  ok("18d NORTH STAR RECONNECT: obsB recarga (rejoin al mundo persistente), re-bootea, y la condición shard-wide sigue byte-idéntica a obsA (0 drift tras reconnect)",
     convRe && bRe.floor !== "", `A=${JSON.stringify(aRe)} B=${JSON.stringify(bRe)}`);

  await pA.screenshot({ path: join(OUT, "client-a-forest.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.close(); await pB.close();

  // 0 no JS errors
  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
  await server.close();
}

console.log(`\n==== CAS-2405 DARK QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} ====`);
process.exit(FAIL === 0 ? 0 : 1);
