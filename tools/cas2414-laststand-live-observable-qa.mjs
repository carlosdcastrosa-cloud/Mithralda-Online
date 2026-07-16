// CAS-2414 — POST-FLIP LIVE QA (INDEPENDENT) for ÚLTIMA RESISTENCIA / AGUANTE (LAST_STAND.enabled:true). EVO mecánica #69, 2-cliente LIVE.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores),
// NO un mirror local ni el Higgsfield retirado. QA-OWNED harness (b5c10283) — NO es copia del self-verify GE (cas2409) ni del DARK (cas2412):
//   oráculos RE-DERIVADOS del spec, reloj FRESCO QNOW distinto (9.795M), pids RE-ETIQUETADOS cliA/cliB.
// Porté los oráculos DARK (CAS-2412) al scaffolding LIVE (CAS-2408). Aceptaciones del ticket CAS-2414:
//   (1) build servido = version.json = EXPECT 22b67daa125e (flip CAS-2413) y AVANZÓ del pre-flip f7e5d3e7bd63 (TEMPEST LIVE #68).
//   (2) DEFAULT-ON: LAST_STAND served enabled:TRUE + eje FORCE-RATIO/SUPERADO EN NÚMERO (conteo INSTANTÁNEO server-auth de enemigos
//       ENGANCHADOS {chase,windup,strike,recover,shield} dentro engageRadius:220; tiers ≥3→+6%/≥5→+12%; fn PURA, 0-RNG). 0-desync 2-cliente.
//   (3) canal REUSADO wardRegen (MISMO seam wardRegenTick que Warding Ring #59) con SHARE-CAP lastStandWardCap:0.15
//       (min(cap, ward+lastStand) ⇒ 0 doble-dip); OFF byte-neutral ⇒ wardRegenBoost()==wardMulRegen() (delega a Warding).
//   (4) 0-REGRESIÓN: 10 arco previo LIVE (#59-#68) served enabled:true; LAST_STAND #69 también true ⇒ arco completo; ZONE_DOMINANCE ausente; 0 err/404.
//   (5) PASS/FAIL con build id + client count + desync count.
// Run: node tools/cas2414-laststand-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2414-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "22b67daa125e";   // build deployado por el flip LAST_STAND CAS-2413 (== version.json esperado)
const PREFLIP = "f7e5d3e7bd63";        // build servido ANTES del flip (TEMPEST LIVE #68 CAS-2406) — el LIVE debe AVANZAR de éste

// ── ORÁCULOS RE-DERIVADOS (re-implementación independiente del spec LAST_STAND; NO importados de sim.js) ──
const CFG = { radius: 220, cap: 0.15, tiers: [{ min: 3, boost: 0.06 }, { min: 5, boost: 0.12 }] };
const oTier = (count) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (count >= CFG.tiers[i].min) t = i + 1; return t; };
const oBoost = (count) => { const t = oTier(count); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oCombined = (ward, ls) => Math.min(CFG.cap, ward + ls);

const QNOW = 9_795_000;   // reloj de pared QA FIJO — FRESCO (≠ DARK/TEMPEST clocks). El eje LAST_STAND es 0-timer/STATELESS, pero mantengo QNOW p/worldFingerprint estable.

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALast";
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

let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
}

async function runOnce(round) {
  console.log(`\n===== CAS-2414 QA POST-FLIP LIVE — ronda ${round} =====`);
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`[r${round}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`[r${round}] ${m.text()}`); });
  page.on("requestfailed", (rq) => { if (!isFaviconOnly(rq.url())) net404.push(`[r${round}] ${rq.url()}`); });
  page.on("response", (rp) => { if (rp.status() === 404 && !isFaviconOnly(rp.url())) net404.push(`[r${round}] ${rp.url()}`); });
  await page.bringToFront();
  await boot(page);
  const build = await page.evaluate(() => window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); return (await r.json()).build; } catch (e) { return ""; } }, LIVE);

  // config servido — 10 flags arco previo LIVE (#59-#68) + LAST_STAND #69 todos true (0-regr) + channel wardRegen + lastStandWardCap 0.15 + tiers 3/5 + ZONE_DOMINANCE ausente
  const cfgSrc = await page.evaluate(async (live) => {
    for (let i = 0; i < 6; i++) { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
      if (t.includes("export const LAST_STAND") && t.length > 200000) return t; await new Promise(res => setTimeout(res, 250)); }
    const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); return await r.text();
  }, LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const lsServed = en("LAST_STAND");           // EVO#69 — DEBE estar served true (flip CAS-2413 landed)
  const zdAbsent = !cfgSrc.includes("export const ZONE_DOMINANCE");   // dedup CAS-2411 — dup #69 nunca reintroducido
  // share-cap + gate params byte-servidos
  const lsBlock = (cfgSrc.match(/export const LAST_STAND\s*=\s*\{[\s\S]*?\n\};/) || [""])[0];
  const chanOk = /channel:\s*"wardRegen"/.test(lsBlock) && /lastStandWardCap:\s*0\.15/.test(lsBlock) &&
    /engageRadius:\s*220/.test(lsBlock) && /min:\s*3,\s*boost:\s*0\.06/.test(lsBlock) && /min:\s*5,\s*boost:\s*0\.12/.test(lsBlock);

  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lastStand && window.__dev.ward && window.__dev.trailcraft && window.__dev.delve && window.__dev.nocturne && window.__dev.cadence && window.__dev.tempest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + LAST_STAND served true + 10 arco true + channel/caps/radius/tiers + 0 err/404
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.lastStand+arc hooks+saveBlob+fp; served LAST_STAND.enabled:true + 10 arco true (11 flags true, 0-regr) + channel wardRegen + lastStandWardCap 0.15 + engageRadius 220 + tiers 3/5 + ZONE_DOMINANCE ausente + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && lsServed === "true" && arcTrue && chanOk && zdAbsent && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} LAST_STAND=${lsServed} chan=${chanOk} arcTrue=${arcTrue} zdAbsent=${zdAbsent} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 — MOVEMENT smoke LIVE: hero moves under ArrowRight (real position delta), scene stays 'play'
  const mov = await page.evaluate(async () => {
    const h0 = window.__dev.lastStand().hero; const p0 = { x: h0.x, y: h0.y };
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const h1 = window.__dev.lastStand().hero; const p1 = { x: h1.x, y: h1.y };
    return { dist: Math.hypot(p1.x - p0.x, p1.y - p0.y), scene: window.__dev.scene(), dead: h1.dead };
  });
  ok("2 MOVEMENT LIVE: ArrowRight mueve al héroe (delta pos>0), sigue en 'play', vivo",
     mov.dist > 1 && mov.scene === "play" && mov.dead === false, `dist=${mov.dist.toFixed(1)} scene=${mov.scene}`);

  // 3 — COMBAT smoke LIVE: numeric attack (Digit1) fires without crash, still in play, 0 new err
  const errBeforeCombat = errors.length;
  const combat = await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
      await new Promise(r => setTimeout(r, 120)); window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })); await new Promise(r => setTimeout(r, 120)); }
    return { scene: window.__dev.scene() };
  });
  ok("3 COMBAT LIVE: ataque numérico (Digit1) dispara sin crash, sigue en 'play', 0 err nuevo",
     combat.scene === "play" && errors.length === errBeforeCombat, `scene=${combat.scene} newErr=${errors.length - errBeforeCombat}`);

  // 4 — DEFAULT-ON desde config servido: lastStand().enabled===true (flip cargó) + channel 'wardRegen' + STATELESS (gExists:false, 0 acumulador per-pid) + count/tier/boost 0 en fresh boot (sin enganche)
  const dOn = await page.evaluate(() => { const s = window.__dev.lastStand(); return { enabled: s.enabled, gExists: s.gExists, channel: s.channel, count: s.count, tier: s.tier, boost: s.boost, tag: s.tag }; });
  ok("4 DEFAULT-ON (flip cargó): lastStand().enabled===true; channel 'wardRegen'; STATELESS gExists:false (0 acumulador); fresh boot sin enganche ⇒ count/tier/boost 0 + tag'' (transitorio, server-auth)",
     dOn.enabled === true && dOn.channel === "wardRegen" && dOn.gExists === false && dOn.count === 0 && dOn.tier === 0 && dOn.boost === 0 && dOn.tag === "",
     JSON.stringify(dOn));

  // 5 — TABLA de tiers = fn PURA del CONTEO (oráculo QA): boostProbe(count) → tier/boost
  const tab = await page.evaluate(() => {
    const out = {}; for (const c of [0, 2, 3, 4, 5, 7]) out[c] = window.__dev.lastStand({ boostProbe: { count: c } }).probe; return out;
  });
  const tabOk = [0, 2, 3, 4, 5, 7].every(c => tab[c].tier === oTier(c) && near(tab[c].boost, oBoost(c)));
  ok("5 TABLA tiers = fn PURA del CONTEO [oráculo QA min{3→.06,5→.12}]: 0→T0/0, 2→T0/0, 3→T1/.06, 4→T1/.06, 5→T2/.12, 7→T2/.12 (monótono determinista)",
     tabOk, JSON.stringify(tab));

  // 6 — SERVER-AUTH conteo de G.enemies REAL: engage 3 chase ⇒ count3/T1; +2 ⇒ count5/T2; clearEngage ⇒ 0 (INSTANTÁNEO, sin decay)
  const cnt = await page.evaluate(() => {
    window.__dev.lastStand({ clearEngage: true });
    const a = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } });
    const b = window.__dev.lastStand({ engage: { n: 2, state: "chase", dist: 24 } });
    const c = window.__dev.lastStand({ clearEngage: true });
    return { a: { count: a.count, tier: a.tier }, b: { count: b.count, tier: b.tier }, c: { count: c.count, tier: c.tier } };
  });
  ok("6 SERVER-AUTH conteo G.enemies REAL: engage3⇒count3/T1; +2⇒count5/T2; clearEngage⇒count0/T0 INSTANTÁNEO [oráculo QA]",
     cnt.a.count === 3 && cnt.a.tier === oTier(3) && cnt.b.count === 5 && cnt.b.tier === oTier(5) && cnt.c.count === 0 && cnt.c.tier === 0, JSON.stringify(cnt));

  // 7 ★ DIFERENCIADOR force-ratio: state gate + proximity gate + INSTANTÁNEO (⊥ Cadence meter-decayente)
  const diff = await page.evaluate(() => {
    const one = (opts) => { window.__dev.lastStand({ clearEngage: true }); return window.__dev.lastStand({ engage: opts }).count; };
    window.__dev.lastStand({ clearEngage: true });
    const out = {};
    out.idle = one({ n: 4, state: "idle", dist: 24 });        // NO-engaged ⇒ no cuenta
    out.patrol = one({ n: 4, state: "patrol", dist: 24 });    // NO-engaged ⇒ no cuenta
    out.chase = one({ n: 4, state: "chase", dist: 24 });      // engaged ⇒ cuenta
    out.windup = one({ n: 4, state: "windup", dist: 24 });    // engaged ⇒ cuenta
    out.strike = one({ n: 4, state: "strike", dist: 24 });    // engaged ⇒ cuenta
    out.far = one({ n: 4, state: "chase", dist: 500 });       // fuera radio220 ⇒ no cuenta
    out.nearz = one({ n: 4, state: "chase", dist: 24 });      // dentro ⇒ cuenta
    out.instant = window.__dev.lastStand({ clearEngage: true }).count;   // clearEngage ⇒ 0 AL INSTANTE (sin decay)
    return out;
  });
  ok("7 ★ DIFERENCIADOR: idle/patrol NO enganchan (0); chase/windup/strike enganchan (4); dist500>radio220 (0)/dist24 (4); clearEngage INSTANTÁNEO (0, sin decay ⊥Cadence)",
     diff.idle === 0 && diff.patrol === 0 && diff.chase === 4 && diff.windup === 4 && diff.strike === 4 && diff.far === 0 && diff.nearz === 4 && diff.instant === 0, JSON.stringify(diff));

  // 8 ★ neutrales pacíficos (tpl.neutral && !hostile) EXCLUIDOS
  const neut = await page.evaluate(() => {
    window.__dev.lastStand({ clearEngage: true });
    const hostile = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24 } }).count;
    window.__dev.lastStand({ clearEngage: true });
    const neutral = window.__dev.lastStand({ engage: { n: 3, state: "chase", dist: 24, neutral: true } }).count;
    window.__dev.lastStand({ clearEngage: true });
    return { hostile, neutral };
  });
  ok("8 ★ neutrales pacíficos (tpl.neutral && !hostile) EXCLUIDOS (0); hostiles enganchados sí (3) — mismo criterio que aggro",
     neut.hostile === 3 && neut.neutral === 0, JSON.stringify(neut));

  // 9 (AC3) ★ SHARE-CAP vs Warding Ring [oráculo QA min(0.15, ward+ls)]: capProbe pure math
  const cap = await page.evaluate(() => {
    return {
      wardT3: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0.15 } }).capped,   // 0.15+0.12 ⇒ cap 0.15
      wardNone: window.__dev.lastStand({ capProbe: { count: 5, wardBoost: 0 } }).capped,     // 0+0.12 ⇒ 0.12
      wardT2: window.__dev.lastStand({ capProbe: { count: 3, wardBoost: 0.10 } }).capped,    // 0.10+0.06 ⇒ cap 0.15 (sería 0.16)
      lsSolo: window.__dev.lastStand({ capProbe: { count: 3, wardBoost: 0 } }).capped,       // 0+0.06 ⇒ 0.06 (≤cap)
    };
  });
  const capOk = near(cap.wardT3.combined, oCombined(0.15, 0.12)) && near(cap.wardT3.combined, 0.15) &&
    near(cap.wardNone.combined, oCombined(0, 0.12)) && near(cap.wardNone.combined, 0.12) &&
    near(cap.wardT2.combined, oCombined(0.10, 0.06)) && near(cap.wardT2.combined, 0.15) &&
    near(cap.lsSolo.combined, oCombined(0, 0.06)) && cap.wardT3.cap === 0.15;
  ok("9 (AC3) ★ SHARE-CAP vs Warding Ring [oráculo QA min(0.15,w+ls)]: ward.15+ls.12⇒.15 (LS cede, capped); ward0+ls.12⇒.12; ward.10+ls.06⇒.15 (capado, sería .16); ls sola⇒.06 (≤cap) — 0 doble-dip",
     capOk, JSON.stringify(cap));

  // 10 (AC1/AC3) ★ SEAM REAL wardRegenTick: ON T2 delta>0 y refleja boost; T2/T1 ratio=1.12/1.06; OFF delta 0 (delega Warding fuera de zona)
  const seam = await page.evaluate(() => {
    window.__dev.lastStand({ clearEngage: true });
    window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const on2 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    window.__dev.lastStand({ engage: { n: 3, dist: 24 } });
    const on1 = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ clearEngage: true });
    window.__dev.lastStand({ enabled: false });
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });
    const off = window.__dev.lastStand({ hp: 1, pause: 0, regenTick: { s: 1 } }).regen;
    window.__dev.lastStand({ enabled: true, clearEngage: true });   // RESTAURA estado LIVE (enabled:true)
    return { on2, on1, off };
  });
  const ratioOK = seam.on1.delta > 0 && near(seam.on2.delta / seam.on1.delta, 1.12 / 1.06, 2e-3);
  ok("10 (AC1/AC3) ★ SEAM REAL wardRegenTick: ON T2 delta>0 (boost.12); T2/T1 ratio=1.12/1.06; OFF delta 0 (delega a Warding Ring, byte-id fuera de zona de cordón)",
     seam.on2.delta > 0 && near(seam.on2.boost, 0.12) && near(seam.on1.boost, 0.06) && ratioOK && near(seam.off.delta, 0), JSON.stringify(seam));

  // 11 (AC3) ★ BYTE-NEUTRAL OFF en el seam: wardRegenBoost == wardMulRegen EXACTO (superado o no) ⇒ delega a Warding (0-regr al togglear OFF)
  const neutral = await page.evaluate(() => {
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    const bare = window.__dev.lastStand();
    window.__dev.lastStand({ enabled: false, engage: { n: 5, dist: 24 } });   // superado PERO OFF
    const eng = window.__dev.lastStand();
    window.__dev.lastStand({ enabled: true, clearEngage: true });   // RESTAURA LIVE
    return { bare: { wrb: bare.wardRegenBoost, wm: bare.wardMulRegen }, eng: { wrb: eng.wardRegenBoost, wm: eng.wardMulRegen } };
  });
  ok("11 (AC3) ★ BYTE-NEUTRAL OFF: wardRegenBoost == wardMulRegen EXACTO (superado o no) ⇒ togglear OFF delega a Warding Ring sin cambio (reversibilidad 0-regr)",
     near(neutral.bare.wrb, neutral.bare.wm) && near(neutral.eng.wrb, neutral.eng.wm), JSON.stringify(neutral));

  // 12 ★ ORTOGONALIDAD wardRegen ⊥ restedMult/goldFind/critChance/xpGain/vamp/lootQuality: superado NO mueve los peers del arco LIVE
  const orth = await page.evaluate(() => {
    window.__dev.lastStand({ clearEngage: true });
    const b = window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    const peers = { rested: b.restedXpMult, gold: b.goldFindMul, crit: b.critChancePct, xp: b.xpGainMul, vamp: b.vampMul, loot: b.lootQualityFloor };
    window.__dev.lastStand({ clearEngage: true });
    const b0 = window.__dev.lastStand();
    const peers0 = { rested: b0.restedXpMult, gold: b0.goldFindMul, crit: b0.critChancePct, xp: b0.xpGainMul, vamp: b0.vampMul, loot: b0.lootQualityFloor };
    return { peers, unchanged: JSON.stringify(peers) === JSON.stringify(peers0) };
  });
  ok("12 ★ ORTOGONALIDAD wardRegen ⊥ restedMult/goldFind/critChance/xpGain/vamp/lootQuality: superado en número NO cambia los peers del arco LIVE",
     orth.unchanged, JSON.stringify(orth.peers));

  // 13 (AC4) 0-REGRESIÓN runtime: arc flags server-side todos enabled:true INCLUYENDO LAST_STAND (arco #59-#69 completo LIVE)
  const rt = await page.evaluate(() => {
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    return { ward: tryEn("ward"), trail: tryEn("trailcraft"), delve: tryEn("delve"), erud: tryEn("erudition"), noct: tryEn("nocturne"), cad: tryEn("cadence"), temp: tryEn("tempest"), last: tryEn("lastStand") };
  });
  ok("13 (AC4) 0-REGRESIÓN runtime: WARDING/TRAILCRAFT/DELVE/ERUDITION/NOCTURNE/CADENCE/TEMPEST + LAST_STAND todos enabled:true (arco LIVE completo #59-#69, 0 mecánica regresó)",
     rt.ward === true && rt.trail === true && rt.delve === true && rt.erud === true && rt.noct === true && rt.cad === true && rt.temp === true && rt.last === true, JSON.stringify(rt));

  // 14 render badge "Resistencia:" se DIBUJA ON+superado, NO con mecánica OFF + fps (perf budget 60fps LIVE)
  // NOTA LIVE: el shard tiene enemigos REALES que pueden enganchar al héroe parkeado ⇒ el badge dibuja legítimamente por force-ratio real.
  // Para un discriminador LIMPIO, la ventana OFF desactiva la mecánica (enabled:false ⇒ badge NUNCA dibuja, gate = enabled && count≥3);
  // luego se RESTAURA el estado LIVE (enabled:true) para la ventana ON con enganche sintético 5.
  const badge = await page.evaluate(async () => {
    const CanvasProto = CanvasRenderingContext2D.prototype;
    let onCount = 0, offCount = 0, mode = "off";
    const origFill = CanvasProto.fillText;
    CanvasProto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Resistencia:") >= 0) { if (mode === "on") onCount++; else offCount++; } return origFill.call(this, t, ...a); };
    window.__dev.lastStand({ enabled: false, clearEngage: true });
    mode = "off"; await new Promise(r => setTimeout(r, 300));
    window.__dev.lastStand({ enabled: true, clearEngage: true }); window.__dev.lastStand({ engage: { n: 5, dist: 24 } });
    mode = "on"; const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 700) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    CanvasProto.fillText = origFill;
    window.__dev.lastStand({ enabled: true, clearEngage: true });   // RESTAURA estado LIVE (enabled:true)
    return { onCount, offCount, fps };
  });
  ok("14 render badge 'Resistencia:' se DIBUJA ON+superado (count≥5, enabled:true), NO con mecánica OFF (enabled:false ⇒ 0, gate=enabled&&count≥3), fps≥55 (perf budget 60fps LIVE)",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));

  await page.evaluate(() => { window.__dev.lastStand({ clearEngage: true }); window.__dev.lastStand({ engage: { n: 5, dist: 24 } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.lastStand({ clearEngage: true }));
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
  ok("15 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence LIVE (force-ratio shard-consistent, fn PURA 0-RNG/0-timer) ----
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
    await toPlay(p);
    return p;
  }
  const pA = await mkNS("cliA");
  const pB = await mkNS("cliB");

  // MISMO set de enganche ⇒ el conteo (fn PURA de G.enemies+héroe) converge byte-a-byte. 0-RNG/0-timer ⇒ shard-consistente.
  const readVM = async (pg, n) => pg.evaluate((args) => {
    window.__dev.lastStand({ clearEngage: true });
    const s = window.__dev.lastStand({ engage: { n: args.n, state: "chase", dist: 24 } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(args.seed));
    return { count: s.count, tier: s.tier, boost: s.boost, combinedBoost: s.combinedBoost, tag: s.tag, fp };
  }, { n, seed: 795 });

  // 16a T2 (5 enganchados): count/tier/boost/combinedBoost/tag + worldFingerprint IDÉNTICOS byte-a-byte
  const a2 = await readVM(pA, 5); const b2 = await readVM(pB, 5);
  const conv2 = a2.count === b2.count && a2.tier === b2.tier && near(a2.boost, b2.boost) && near(a2.combinedBoost, b2.combinedBoost) && a2.tag === b2.tag && a2.fp === b2.fp;
  if (!conv2) desync++;
  ok("16a NORTH STAR LIVE: MISMO set de enganche (5) ⇒ count/tier/boost/combinedBoost/tag + worldFingerprint IDÉNTICOS byte-a-byte en cliA y cliB (0 desync, shard-consistente)",
     conv2 && a2.count === 5 && a2.tier === oTier(5) && near(a2.boost, oBoost(5)) && a2.tag === "⚔", `A=${JSON.stringify({ ...a2, fp: undefined })} B=${JSON.stringify({ ...b2, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));

  // 16b T1 (3 enganchados): converge en otro tier ⇒ misma fn PURA (determinista)
  const a1 = await readVM(pA, 3); const b1 = await readVM(pB, 3);
  const conv1 = a1.count === b1.count && a1.tier === b1.tier && near(a1.boost, b1.boost) && near(a1.combinedBoost, b1.combinedBoost) && a1.tag === b1.tag;
  if (!conv1) desync++;
  ok("16b NORTH STAR LIVE: MISMO set (3) ⇒ count/tier/boost IDÉNTICOS entre clientes; oráculo QA T1/.06 (fn PURA determinista, 0 desync)",
     conv1 && a1.count === 3 && a1.tier === oTier(3) && near(a1.boost, oBoost(3)), `A=${JSON.stringify({ ...a1, fp: undefined })} B=${JSON.stringify({ ...b1, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));

  // 16c below-threshold (2 enganchados): AMBOS clientes ⇒ T0/boost0/tag'' (converge también en el caso vacío)
  const a0 = await readVM(pA, 2); const b0 = await readVM(pB, 2);
  const conv0 = a0.count === b0.count && a0.tier === b0.tier && near(a0.boost, b0.boost) && a0.tag === b0.tag;
  if (!conv0) desync++;
  ok("16c NORTH STAR LIVE: MISMO set bajo-umbral (2) ⇒ ambos T0/boost0/tag'' IDÉNTICOS (converge también en el caso sin efecto)",
     conv0 && a0.count === 2 && a0.tier === 0 && near(a0.boost, 0) && a0.tag === "", `A=${JSON.stringify({ ...a0, fp: undefined })} B=${JSON.stringify({ ...b0, fp: undefined })}`);

  // 16d reconnect/persistence: cliB reloads (rejoin al mundo LIVE persistente), re-boots, STATELESS ⇒ sigue convergiendo byte-id con cliA
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true })); await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB);
  const aRe = await readVM(pA, 5); const bRe = await readVM(pB, 5);
  const convRe = aRe.count === bRe.count && aRe.tier === bRe.tier && near(aRe.boost, bRe.boost) && near(aRe.combinedBoost, bRe.combinedBoost) && aRe.tag === bRe.tag;
  if (!convRe) desync++;
  ok("16d NORTH STAR LIVE RECONNECT: cliB recarga (rejoin al mundo persistente), re-bootea; STATELESS ⇒ conteo/tier/boost sigue byte-id con cliA (0 drift, no persiste estado)",
     convRe && bRe.tier === oTier(5), `A=${JSON.stringify({ ...aRe, fp: undefined })} B=${JSON.stringify({ ...bRe, fp: undefined })}`);

  await pA.screenshot({ path: join(OUT, "client-a-outnumbered.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.evaluate(() => window.__dev.lastStand({ clearEngage: true }));
  await pB.evaluate(() => window.__dev.lastStand({ clearEngage: true }));
  await pA.close(); await pB.close();

  ok("0 no JS errors durante todo el run LIVE", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
}

console.log(`\n==== CAS-2414 POST-FLIP LIVE QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} (expect ${EXPECT_BUILD}) clients=2 desync=${desync} ====`);
process.exit(FAIL === 0 ? 0 : 1);
