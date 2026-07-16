// CAS-2403 — POST-FLIP LIVE QA (INDEPENDENT) for CADENCIA / ÍMPETU DE COMBATE (CADENCE_RUSH.enabled:true). EVO mecánica #67, 2-cliente LIVE.
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (el build REALMENTE servido a jugadores),
// NO un mirror local ni el Higgsfield retirado. QA-OWNED harness (b5c10283) — NO es copia del self-verify GE:
//   oráculos RE-DERIVADOS del spec, reloj FRESCO QNOW distinto, pids RE-ETIQUETADOS cliA/cliB/peer.
// Porté los oráculos DARK (CAS-2401) al scaffolding LIVE (CAS-2397). 4 aceptaciones del ticket:
//   (1) build servido = version.json = EXPECT 2eb21950aab9 (flip CAS-2402) y AVANZÓ del pre-flip 6357db520a93 (render-only CAS-2398).
//   (2) DEFAULT-ON: CADENCE_RUSH served enabled:TRUE + eje TEMPO/CADENCIA activo (bumpPerKill sube, decay half-life 6s determinista COMPARTIDO, 0-RNG, N-cliente 0 desync).
//   (3) canal REUSADO critChance zone-gateado (forest/caves/ruins/abyss/frost/swamp, OFF ciudad/SAFEZONE) con SHARE-CAP vs Delve #64 (min(cadenceCritCap 35, delve+cadence) ⇒ 0 doble-dip) + cap absoluto critCapPct 50.
//   (4) 0-REGRESIÓN: NOCTURNE_HUNT/ERUDITION/DELVE + 18 arco todos served enabled:true ⇒ 20 flags true LIVE.
// Run: node tools/cas2403-cadence-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2403-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

const EXPECT_BUILD = "2eb21950aab9";   // build deployado por el flip CADENCE CAS-2402 (== version.json esperado)
const PREFLIP = "6357db520a93";        // build servido ANTES del flip (render-only CAS-2398) — el LIVE debe AVANZAR de éste

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS RE-DERIVADOS (re-implementación independiente del spec CADENCE_RUSH; NO importados de sim.js) ──
const CFG = { bump: 1, hl: 6, cap: 10, cadCap: 35, absCap: 50, tiers: [{ min: 2, c: 8 }, { min: 4, c: 15 }, { min: 6, c: 25 }] };
const oTier = (cad) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (cad >= CFG.tiers[i].min) t = i + 1; return t; };
const oCrit = (cad) => { const t = oTier(cad); return t > 0 ? CFG.tiers[t - 1].c : 0; };
const oDecay = (cad0, sec) => Math.min(CFG.cap, cad0 * Math.pow(0.5, sec / CFG.hl));
const oShareCadence = (delveBonus, cadBonus) => Math.max(0, Math.min(CFG.cadCap, delveBonus + cadBonus) - delveBonus);

const QNOW = 9_540_000;   // reloj de pared QA FIJO (≠ 9.401M DARK CAS-2401, ≠ 9.270M NOCTURNE) — proyección determinista, mismo en ambos clientes.

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 40000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QACad";
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

async function installCad(page) {
  await page.evaluate((QNOW) => {
    window.__CNOW = QNOW;
    window.__ccad = (pid, cad) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      window.__dev.cadence({ nowMs: window.__CNOW, self: pid, cad, pid, atMs: window.__CNOW }); };
    window.__ckills = (pid, ts) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      window.__dev.cadence({ nowMs: window.__CNOW, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    window.__cat = (sec) => window.__dev.cadence({ nowMs: window.__CNOW + (sec || 0) * 1000 });
    window.__cpick = (cad) => {
      window.__dev.cadence({ enabled: true, self: "self" });
      const zones = window.__dev.cadence().zones || [];
      for (const z of zones) {
        window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
        const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad, pid: "self", atMs: window.__CNOW, toZone: z });
        if (s.zone === z && s.rushable) return { zone: z, cad: s.cad, tier: s.tier, critPct: s.critPct, critBonusPct: s.critBonusPct };
      }
      return null;
    };
  }, QNOW);
}

async function boot(page) {
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  try { await toPlay(page); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" }); await toPlay(page); }
  await installCad(page);
}

let browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];

async function runOnce(round) {
  console.log(`\n===== CAS-2403 QA POST-FLIP LIVE — ronda ${round} =====`);
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

  // config servido — 18 flags arco + NOCTURNE_HUNT + CADENCE_RUSH todos true ⇒ 20 flags true (0-regr) + channel critChance + caps
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const ARC = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "FELLOWSHIP_BOND", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT"];
  const arc = {}; for (const f of ARC) arc[f] = en(f);
  const arcTrue = ARC.every(f => arc[f] === "true");
  const cadServed = en("CADENCE_RUSH");            // EVO#67 — DEBE estar served true (flip CAS-2402 landed)
  const chanOk = /channel:\s*"critChance"/.test(cfgSrc) && /cadenceCritCap:\s*35/.test(cfgSrc) && /critCapPct:\s*50/.test(cfgSrc);

  // 1 — boot LIMPIO LIVE + hooks + build self-consistent vs version.json (== EXPECT, AVANZÓ de pre-flip) + CADENCE served true + 19 arco true + channel critChance/caps + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.cadence && window.__dev.delve && window.__dev.nocturne && window.__dev.erudition && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.fellowship && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build==version.json==EXPECT + AVANZÓ de pre-flip; __dev.cadence+arc hooks+saveBlob+fp; served CADENCE_RUSH.enabled:true + 19 arco true (20 flags true, 0-regr) + channel critChance + cadenceCritCap 35 + critCapPct 50 + 0 err/404",
     hooks && build === verBuild && build === EXPECT_BUILD && build !== PREFLIP && cadServed === "true" && arcTrue && chanOk && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} expect=${EXPECT_BUILD} preflip=${PREFLIP} CADENCE=${cadServed} chan=${chanOk} arcTrue=${arcTrue} err=${errors.length} 404=${net404.length}`);

  // 2 — DEFAULT-ON desde config servido: cadence().enabled===true (el flip cargó) + channel 'critChance' + sin caza ⇒ passive 0; byte-id OFF vía TOGGLE (protección 0-regr)
  const dOn = await page.evaluate(() => { const s = window.__dev.cadence(); return { enabled: s.enabled, gExists: s.gExists, tier: s.tier, cad: s.cad, critPct: s.critPct, critBonusPct: s.critBonusPct, channel: s.channel, tag: s.tag }; });
  const off = await page.evaluate(() => { window.__dev.cadence({ enabled: false, leave: true }); const s = window.__dev.cadence(); const t = { critBonusPct: s.critBonusPct, tag: s.tag }; window.__dev.cadence({ enabled: true }); return t; });
  ok("2 DEFAULT-ON (flip cargó): cadence().enabled===true; channel 'critChance'; sin caza ⇒ tier/cad/crit/bonus 0 tag \"\"; TOGGLE enabled:false ⇒ critBonusPct 0 + tag \"\" (byte-neutro conservado)",
     dOn.enabled === true && dOn.channel === "critChance" && dOn.tier === 0 && dOn.cad === 0 && dOn.critPct === 0 && dOn.critBonusPct === 0 && dOn.tag === "" && off.critBonusPct === 0 && off.tag === "",
     `enabled=${dOn.enabled} channel=${dOn.channel} bonus=${dOn.critBonusPct} tag="${dOn.tag}" offBonus=${off.critBonusPct}`);

  // 3 — save sin clave 'cadence'/'cadenceServer' (estado 100% derivado/transitorio, server-auth)
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 save LIVE: sin clave 'cadence'/'cadenceServer' (estado derivado, server-auth, no persistido)", !/"cadence(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 — worldFingerprint byte-estable a través del toggle enabled (0 RNG drift) — semilla propia 613
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.cadence({ enabled: false }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.cadence({ enabled: true }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpB === fpA, `match=${fpB === fpA}`);

  // 5 — crit seam byte-id OFF: critTick con feature OFF ⇒ total==base (seam saltado, srand consumido igual)
  const seamOff = await page.evaluate(() => { window.__dev.cadence({ enabled: false });
    const r = window.__dev.cadence({ critTick: { base: 12 } }).critPicked; window.__dev.cadence({ enabled: true }); return r; });
  ok("5 crit seam byte-id OFF: critTick base=12 ⇒ total==12 (bloque saltado, cadenceBonus 0)",
     seamOff && near(seamOff.total, 12) && seamOff.cadenceBonus === 0 && near(seamOff.cadenceEff, 0),
     `total=${seamOff && seamOff.total} cadenceBonus=${seamOff && seamOff.cadenceBonus}`);

  // ── mecánica LIVE (config ya enabled:true; inyecciones __dev con nowMs explícito ⇒ proyección determinista) ──
  // 6 tier table = fn PURA del cad (oráculo QA 1→T0, 2→T1/8, 4→T2/15, 6→T3/25, 9→T3/25 sat)
  const tab = await page.evaluate(() => { const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6, 9]) { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: c, pid: "self", atMs: window.__CNOW, toZone: zone });
      out.push({ cad: c, tier: s.tier, critPct: s.critPct }); } return { zone, out }; });
  const tierOK = !tab.bad && tab.out.every(r => r.tier === oTier(r.cad) && r.critPct === oCrit(r.cad));
  ok("6 TABLA tiers = fn PURA del cad (oráculo QA 1→T0, 2→T1/8, 4→T2/15, 6→T3/25, 9→sat T3/25)", tierOK, `${JSON.stringify(tab.out)}`);

  // 7 ★ DIFERENCIADOR RATE/TEMPO: burst vs spread vs single
  const rate = await page.evaluate(() => { const z = window.__cpick(6).zone;
    const mk = (ts) => { window.__ckills("self", ts); return window.__dev.cadence({ nowMs: window.__CNOW, self: "self", toZone: z }); };
    const N = window.__CNOW;
    const burst = mk([N - 2500, N - 2000, N - 1500, N - 1000, N - 500, N]);        // 6 kills gap 0.5s
    const spread = mk([N - 30000, N - 24000, N - 18000, N - 12000, N - 6000, N]);  // 6 kills gap 6s (=1 half-life)
    const single = mk([N]);
    return { burst: { cad: burst.cad, tier: burst.tier }, spread: { cad: spread.cad, tier: spread.tier }, single: { cad: single.cad, tier: single.tier } }; });
  ok("7 ★ RATE: BURST(6 gap0.5s)⇒meter TREPA⇒ABRE(tier≥2); ESPARCIDO(6 gap6s)⇒meter≈1⇒T0; 1 kill⇒T0 (TEMPO no conteo)",
     rate.burst.tier >= 2 && rate.spread.tier === 0 && rate.spread.cad < 2 && rate.single.tier === 0,
     `burst=${JSON.stringify(rate.burst)} spread=${JSON.stringify(rate.spread)} single=${JSON.stringify(rate.single)}`);

  // 8 BUMP acumulador = fn de kills: 1 kill⇒cad≈1(bumpPerKill); 2 coincidentes⇒>1.8 (apilan)
  const bump = await page.evaluate(() => { const z = window.__cpick(6).zone; const N = window.__CNOW;
    window.__ckills("self", [N]); const one = window.__dev.cadence({ nowMs: N, self: "self", toZone: z }).cad;
    window.__ckills("self", [N, N]); const two = window.__dev.cadence({ nowMs: N, self: "self", toZone: z }).cad;
    return { one, two }; });
  ok("8 BUMP acumulador: 1 kill⇒cad≈1(bumpPerKill); 2 kills coincidentes⇒cad≈2 (>1.8, apilan)",
     near(bump.one, 1, 0.05) && bump.two > 1.8, `one=${bump.one} two=${bump.two}`);

  // 9 PASSIVE individual (critChance) + ZONE-GATE: en zona⇒bonus>0 & tier≥1; fuera⇒0
  const pg = await page.evaluate(() => { const inz = window.__cpick(6);
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, leave: true });
    const out = window.__dev.cadence(); return { inZone: inz, outZone: { tier: out.tier, critBonusPct: out.critBonusPct, tag: out.tag } }; });
  ok("9 ★ ZONE-GATE (canal critChance): en zona caza⇒critBonusPct>0 & tier≥1; fuera de zona (ciudad/SAFEZONE)⇒0 & tier0 & tag''",
     pg.inZone && pg.inZone.critBonusPct > 0 && pg.inZone.tier >= 1 && pg.outZone.critBonusPct === 0 && pg.outZone.tier === 0 && pg.outZone.tag === "",
     `in=${JSON.stringify(pg.inZone)} out=${JSON.stringify(pg.outZone)}`);

  // 10 ★ DECAY determinista 0-RNG half-life 6s: cad6(T3) →+6s cad3(T1) →+12s cad1.5(T0) [oráculo QA]
  const dec = await page.evaluate(() => { const z = window.__cpick(6).zone;
    window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
    const t0 = window.__dev.cadence({ nowMs: window.__CNOW }); const t6 = window.__cat(6); const t12 = window.__cat(12);
    return { c0: t0.cad, t0: t0.tier, c6: t6.cad, t6: t6.tier, c12: t12.cad, t12: t12.tier }; });
  ok("10 ★ DECAY determinista 0-RNG half-life 6s: cad6(T3) →+6s cad3(T1) →+12s cad1.5(T0) [oráculo QA]",
     near(dec.c0, 6) && near(dec.c6, oDecay(6, 6)) && near(dec.c12, oDecay(6, 12)) && dec.t0 === 3 && dec.t6 === 1 && dec.t12 === 0,
     `c0=${dec.c0}/${dec.t0} c6=${dec.c6}/${dec.t6} c12=${dec.c12}/${dec.t12}`);

  // 11 ★ CANAL critChance wired + SEAM: ON base10⇒total>base (cadence suma aislado, ≤cap50); OFF⇒total==base(byte-id)
  const seam = await page.evaluate(() => { window.__cpick(6); window.__dev.cadence({ self: "self" });
    const on = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;
    window.__dev.cadence({ enabled: false }); const off = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;
    window.__dev.cadence({ enabled: true }); return { on, off }; });
  ok("11 ★ CANAL critChance wired + SEAM: ON base10⇒total>base (cadence suma aislado, respeta cap50); OFF⇒total==base(byte-id)",
     seam.on && seam.on.total > 10 && seam.on.total <= 50 && near(seam.off.total, 10) && seam.off.cadenceBonus === 0,
     `on=${JSON.stringify(seam.on)} off_total=${seam.off.total}`);

  // 12 ★ SHARE-CAP vs Delve #64: bono combinado delve+cadence capado a cadenceCritCap 35 ⇒ cadence cede el margen (0 doble-dip)
  const share = await page.evaluate(() => {
    window.__dev.cadence({ enabled: true, self: "self", clear: true });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: "forest" });
    if (window.__dev.delve) { try { window.__dev.delve({ enabled: true, self: "self", nowMs: window.__CNOW, delve: 6, bands: 5, pid: "self", atMs: window.__CNOW, toZone: "forest" }); } catch (e) {} }
    const both = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    return { both, delveBonus: both ? both.delveBonus : null, cadBonus: both ? both.cadenceBonus : null, cadEff: both ? both.cadenceEff : null, capped: both ? both.capped : null, total: both ? both.total : null };
  });
  const expEff = oShareCadence(share.delveBonus || 0, share.cadBonus || 0);
  ok("12 ★ SHARE-CAP vs Delve #64: bono combinado delve+cadence capado a cadenceCritCap 35 ⇒ cadence cede margen (eff=min(35,d+c)-d), 0 doble-dip",
     share.both && share.cadBonus === 25 && near(share.cadEff, expEff) && (share.delveBonus >= 25 ? share.capped === true : true),
     `delve=${share.delveBonus} cad=${share.cadBonus} eff=${share.cadEff} (oracle ${expEff}) capped=${share.capped} total=${share.total}`);

  // 13 ★ CAP DURO cadenceCritCap≤35 (cadence sola) + cap ABS crit total ≤50
  const caps = await page.evaluate(() => {
    if (window.__dev.delve) { try { window.__dev.delve({ enabled: true, self: "self", nowMs: window.__CNOW, delve: 0, bands: 0, pid: "self", atMs: window.__CNOW }); } catch (e) {} }
    window.__dev.cadence({ enabled: true, self: "self", clear: true });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: "forest" });
    const solo = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    const big = window.__dev.cadence({ critTick: { base: 48 } }).critPicked;
    return { soloEff: solo ? solo.cadenceEff : null, soloTotal: solo ? solo.total : null, bigTotal: big ? big.total : null, cadCap: solo ? solo.shareCap : null, absCap: solo ? solo.absCap : null };
  });
  ok("13 ★ CAP DURO cadenceCritCap≤35 (cadence sola) + cap ABS crit total ≤50 (base48+bono ⇒ ≤50)",
     caps.soloEff <= 35 + 1e-6 && caps.soloTotal <= 25 + 1e-6 && caps.bigTotal <= 50 + 1e-6 && caps.cadCap === 35 && caps.absCap === 50,
     `soloEff=${caps.soloEff} soloTotal=${caps.soloTotal} bigTotal=${caps.bigTotal} caps=${caps.cadCap}/${caps.absCap}`);

  // 14 ★ ORTOGONALIDAD critChance ⊥ goldFind/restedMult/vamp/xpGain/wardRegen/oocMitigation/lootQuality (abrir ímpetu NO mueve otros canales)
  const orth = await page.evaluate(() => {
    window.__dev.cadence({ clear: true, nowMs: window.__CNOW, enabled: true }); const z = window.__cpick(1).zone;
    const off = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 0, pid: "self", atMs: window.__CNOW, toZone: z });
    const on = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
    const pick = (s) => ({ rested: s.restedXpMult, gold: s.goldFindMul, vamp: s.vampMul, xp: s.xpGainMul, ward: s.wardRegenMul, ooc: s.oocMitigMul, loot: s.lootQualityFloor });
    return { offBonus: off.critBonusPct, onBonus: on.critBonusPct, offCh: pick(off), onCh: pick(on) };
  });
  const chEq = JSON.stringify(orth.offCh) === JSON.stringify(orth.onCh);
  ok("14 ★ ORTOGONALIDAD critChance ⊥ goldFind/restedMult/vamp/xpGain/wardRegen/oocMitigation/lootQuality (abrir ímpetu NO mueve otros canales)",
     orth.offBonus === 0 && orth.onBonus > 0 && chEq, `off=${JSON.stringify(orth.offCh)} on=${JSON.stringify(orth.onCh)}`);

  // 15 (C) 0-REGRESIÓN vía __dev: NOCTURNE_HUNT/DELVE served enabled:true + CADENCE served true (todos LIVE)
  const arcHooks = await page.evaluate(() => {
    const r = {};
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    r.nocturne = tryEn("nocturne"); r.delve = tryEn("delve"); r.erudition = tryEn("erudition"); r.cadence = tryEn("cadence");
    return r;
  });
  ok("15 (C) 0-REGRESIÓN runtime: NOCTURNE_HUNT/DELVE/ERUDITION served enabled:true (arco LIVE) + CADENCE_RUSH served true (EVO#67 flip landed)",
     arcHooks.nocturne === true && arcHooks.delve === true && arcHooks.erudition === true && arcHooks.cadence === true,
     `nocturne=${arcHooks.nocturne} delve=${arcHooks.delve} erudition=${arcHooks.erudition} cadence=${arcHooks.cadence}`);

  // 16 ★ CADENCE 6 zonas: pasivo aplica en las 6 zonas (cad6⇒T3, critBonusPct>0) broken=[]
  const zres = await page.evaluate(() => {
    window.__dev.cadence({ enabled: true, self: "self" }); const zones = window.__dev.cadence().zones || [];
    const broken = [];
    for (const z of zones) { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
      if (!(s.zone === z && s.rushable && s.tier === 3 && s.critBonusPct > 0)) broken.push(z); }
    return { zones, broken };
  });
  ok("16 ★ CADENCE 6 zonas caza: pasivo aplica en las 6 (cad6⇒T3, critBonusPct>0) broken=[]",
     zres.zones.length === 6 && zres.broken.length === 0, `zones=${JSON.stringify(zres.zones)} broken=${JSON.stringify(zres.broken)}`);

  // 17 render badge 'Cadencia:' se DIBUJA con ON (count>0) y NO con OFF (0)
  const badge = await page.evaluate(async () => {
    const orig = CanvasRenderingContext2D.prototype.fillText; let cnt = 0;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (typeof t === "string" && t.indexOf("Cadencia:") >= 0) cnt++; return orig.apply(this, arguments); };
    window.__dev.cadence({ enabled: true, self: "self" });
    const z = window.__cpick(6).zone; window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
    await new Promise(r => setTimeout(r, 600)); const on = cnt;
    cnt = 0; window.__dev.cadence({ enabled: false }); await new Promise(r => setTimeout(r, 600)); const off = cnt;
    CanvasRenderingContext2D.prototype.fillText = orig; window.__dev.cadence({ enabled: true }); return { on, off };
  });
  ok("17 render badge 'Cadencia:' se DIBUJA con ON (count>0) y NO con OFF (0)", badge.on > 0 && badge.off === 0, `on=${badge.on} off=${badge.off}`);

  return { page, build, verBuild };
}

let buildInfo = null, build2 = null;
let nsBrowser = null;
try {
  const r1 = await runOnce("×1");
  buildInfo = r1.build;
  await r1.page.screenshot({ path: join(OUT, "selfverify.png") });
  await r1.page.close();
  const r2 = await runOnce("×2");
  build2 = r2.build;
  await r2.page.close();
  ok("18 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build2, `${buildInfo} / ${build2}`);

  // ---- 19 NORTH STAR: real 2-client convergence (two independent pages, fresh browser) ----
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
    await p.bringToFront();
    await boot(p);
    return p;
  }
  const pA = await mkNS("cliA");
  const pB = await mkNS("cliB");
  const SNAP = { cliA: { cad: 6, atMs: QNOW }, cliB: { cad: 4, atMs: QNOW }, peer: { cad: 2, atMs: QNOW } };
  const readAt = async (p, self, elapsedSec) => p.evaluate((args) => {
    const { SNAP, self, now, zone0 } = args;
    window.__dev.cadence({ enabled: true, self, clear: true });
    window.__dev.cadence({ nowMs: now, self, push: SNAP });
    window.__dev.cadence({ nowMs: now, self, toZone: zone0 });
    const s = window.__dev.cadence({ nowMs: now });
    return { self: s.self, cad: s.cad, tier: s.tier, critPct: s.critPct, critBonusPct: s.critBonusPct, cadMap: s.cadMap, nowMs: s.nowMs };
  }, { SNAP, self, now: QNOW + (elapsedSec || 0) * 1000, zone0: "forest" });

  const a0 = await readAt(pA, "cliA", 0); const b0 = await readAt(pB, "cliB", 0);
  const mapEq = JSON.stringify(a0.cadMap) === JSON.stringify(b0.cadMap);
  ok("19a NORTH STAR: MISMO snapshot ⇒ cadMap byte-idéntico en cliA y cliB (server-auth convergente, 0 desync)", mapEq, `A=${JSON.stringify(a0.cadMap)} B=${JSON.stringify(b0.cadMap)}`);
  ok("19b per-pid: cliA lee cad=6/T3, cliB lee cad=4/T2 del MISMO snapshot (INDIVIDUAL, oráculo QA)",
     near(a0.cad, 6) && a0.tier === oTier(6) && near(b0.cad, 4) && b0.tier === oTier(4) && a0.self === "cliA" && b0.self === "cliB",
     `A cad=${a0.cad}/T${a0.tier} B cad=${b0.cad}/T${b0.tier}`);

  const a6 = await readAt(pA, "cliA", 6); const b6 = await readAt(pB, "cliB", 6);
  const mapEq6 = JSON.stringify(a6.cadMap) === JSON.stringify(b6.cadMap);
  ok("19c decay CONVERGE +6s: cadMap sigue byte-idéntico entre clientes; cliA cad→3(T1), cliB cad→2(T1) [oráculo half-life]",
     mapEq6 && near(a6.cad, oDecay(6, 6)) && near(b6.cad, oDecay(4, 6)) && a6.tier === oTier(oDecay(6, 6)) && b6.tier === oTier(oDecay(4, 6)),
     `A cad=${a6.cad}/T${a6.tier} B cad=${b6.cad}/T${b6.tier} mapEq=${mapEq6}`);

  const aLeave = await pA.evaluate((now) => { window.__dev.cadence({ nowMs: now, self: "cliA", leave: true });
    const s = window.__dev.cadence({ nowMs: now }); return { critBonusPct: s.critBonusPct, tier: s.tier, cadMap: s.cadMap }; }, QNOW);
  const bAfter = await readAt(pB, "cliB", 0);
  const mapIntact = aLeave.cadMap && near(+aLeave.cadMap.cliA, 6) && near(+aLeave.cadMap.cliB, 4) && near(+aLeave.cadMap.peer, 2);
  ok("19d cliA SALE de zona ⇒ su critBonusPct→0 (zone-gate) PERO cadMap server-auth INTACTO (cliA6/cliB4/peer2) + cliB Δ intacto",
     aLeave.critBonusPct === 0 && mapIntact && near(bAfter.cad, 4) && bAfter.critBonusPct > 0,
     `A bonus=${aLeave.critBonusPct} cadMap=${JSON.stringify(aLeave.cadMap)} B cad=${bAfter.cad}/bonus=${bAfter.critBonusPct}`);

  await pA.screenshot({ path: join(OUT, "client-a.png") });
  await pB.screenshot({ path: join(OUT, "client-b.png") });
  await pA.close(); await pB.close();

  ok("0 no JS errors durante toda la corrida LIVE", errors.length === 0, errors.slice(0, 5).join(" | "));
} catch (e) {
  console.error("FATAL", e); FAIL++;
} finally {
  if (nsBrowser) { try { await nsBrowser.close(); } catch (e) {} }
  if (browser) { try { await browser.close(); } catch (e) {} }
}

console.log(`\n==== CAS-2403 POST-FLIP LIVE QA: ${PASS} PASS / ${FAIL} FAIL  build=${build2 || buildInfo} (expect ${EXPECT_BUILD}) ====`);
process.exit(FAIL === 0 ? 0 : 1);
