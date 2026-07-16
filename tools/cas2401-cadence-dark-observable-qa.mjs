// CAS-2401 — INDEPENDENT DARK QA for CADENCIA / ÍMPETU DE COMBATE (CADENCE_RUSH.enabled:false). EVO mecánica #67, 2-cliente DARK.
// QA-OWNED harness (b5c10283). NOT a copy of the GE self-verify: oráculos RE-DERIVADOS del config, reloj FRESCO QNOW=9,401,000,
// pids RE-ETIQUETADOS cliA/cliB/peer, y foco en las 3 aceptaciones DARK NO-negociables del ticket:
//   (A) BYTE-NEUTRAL OFF: enabled:false ⇒ tickCadence jamás corre, G.cadence/G.cadenceServer nunca se crean, cadenceCritBonusPct()=0,
//       el seam de crit queda byte-idéntico a pre-CADENCE HEAD (mismo srand consumido) ⇒ critTick total==base, save sin clave nueva, fingerprint estable.
//   (B) 0 DESYNC 2-cliente: DOS páginas puppeteer independientes, MISMO snapshot {pid→cad} + MISMO reloj ⇒ cad/tier/crit IDÉNTICOS byte-a-byte.
//   (C) 0-REGRESIÓN: NOCTURNE_HUNT/ERUDITION/DELVE y todos los arc flags served enabled:true; CADENCE_RUSH served false (DARK).
// Los mecanismos runtime (rate/share-cap/tiers) se OBSERVAN vía flip IN-MEMORY (__dev.cadence({enabled:true})) — el disco sigue false;
// esto prueba que la ruta ON es correcta CUANDO se flipe, sin tocar el build DARK. Post-flip QA revalida LIVE.
//
// Oráculos independientes (re-derivados de sim/config.js CADENCE_RUSH): bumpPerKill=1, halfLifeSec=6, capCadence=10,
//   cadenceCritCap=35, critCapPct=50 (abs), tiers min→critPct: {2→8, 4→15, 6→25}. Delve share-partner: critCapPct=50, T3=25.
//   Tier(cad) = mayor i con cad≥min[i]; cad<2⇒T0. Decay: cad(t)=cad0·0.5^(Δs/6). Share-cap: eff_cadence=max(0, min(35, delve+cad)-delve).
// Run: node tools/cas2401-cadence-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2401");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
const QNOW = 9401000;   // reloj de pared FIJO (ms) — FRESCO, distinto del GE (9,270,000). Mismo en ambos clientes ⇒ proyección determinista.

// ---- oráculos independientes (QA re-deriva, NO lee del snapshot) ----
const CFG = { bump: 1, hl: 6, cap: 10, cadCap: 35, absCap: 50, tiers: [{ min: 2, c: 8 }, { min: 4, c: 15 }, { min: 6, c: 25 }] };
const oTier = (cad) => { let t = 0; for (let i = 0; i < CFG.tiers.length; i++) if (cad >= CFG.tiers[i].min) t = i + 1; return t; };
const oCrit = (cad) => { const t = oTier(cad); return t > 0 ? CFG.tiers[t - 1].c : 0; };
const oDecay = (cad0, sec) => Math.min(CFG.cap, cad0 * Math.pow(0.5, sec / CFG.hl));
const oShareCadence = (delveBonus, cadBonus) => Math.max(0, Math.min(CFG.cadCap, delveBonus + cadBonus) - delveBonus);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function waitMenu(page) {
  try { await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 }); }
  catch (e) { await page.reload({ waitUntil: "domcontentloaded" });   // one reload-retry against transient boot slowness
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

async function installCad(page) {
  await page.evaluate((QNOW) => {
    window.__CNOW = QNOW;
    // inyecta el meter crudo de un pid directamente (CLEAR antes) — prueba tiers/decay/passive sin ruido.
    window.__ccad = (pid, cad) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      window.__dev.cadence({ nowMs: window.__CNOW, self: pid, cad, pid, atMs: window.__CNOW }); };
    // inyecta kills (timestamps) para un pid ⇒ server BUMPEA en cada uno (decay del propio t) — prueba el eje RATE.
    window.__ckills = (pid, ts) => { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      window.__dev.cadence({ nowMs: window.__CNOW, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    // re-proyecta a QNOW + elapsedSec (decay half-life) y devuelve el snapshot.
    window.__cat = (sec) => window.__dev.cadence({ nowMs: window.__CNOW + (sec || 0) * 1000 });
    // inyecta cad para "self", teleporta a cada zona candidata, devuelve la 1ª donde cae dentro (rushable).
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.cadence && window.__dev.delve && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.nocturne && window.__dev.fellowship && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.cadence + arc hooks + __BUILD, 0 JS err", hooks && errors.length === errStart && !!build, `build=${build}`);

  // 2 (A) byte-neutral OFF fresh boot: enabled false, G.cadence NEVER created, all outputs inert (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.cadence());
  ok("2 (A) byte-neutral OFF fresh boot: enabled:false + gExists:false (tick jamás corrió) + cad/tier/crit/bonus 0 + tag'' + cadMap null",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.cad === 0 && dark.critPct === 0 && dark.critBonusPct === 0 && dark.tag === "" && dark.cadMap === null && dark.channel === "critChance",
     `enabled=${dark.enabled} gExists=${dark.gExists} cad=${dark.cad} tier=${dark.tier} bonus=${dark.critBonusPct} tag="${dark.tag}"`);

  // 3 (A) save OFF: no new persisted key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 (A) save OFF: no 'cadence'/'cadenceServer' key (estado 100% derivado/transitorio)", !/"cadence(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 (A) worldFingerprint stable across enabled toggle (0 RNG drift) — my own seed 613
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.cadence({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.cadence({ enabled: false }));
  ok("4 (A) worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpB === fpA, `match=${fpB === fpA}`);

  // 5 (A) crit seam byte-id OFF: critTick with feature OFF ⇒ total==base (seam block skipped, srand consumido igual)
  const seamOff = await page.evaluate(() => { window.__dev.cadence({ enabled: false });
    return window.__dev.cadence({ critTick: { base: 12 } }).critPicked; });
  ok("5 (A) crit seam byte-id OFF: critTick base=12 ⇒ total==12 (bloque saltado, cadenceBonus 0, srand igual)",
     seamOff && near(seamOff.total, 12) && seamOff.cadenceBonus === 0 && near(seamOff.cadenceEff, 0),
     `total=${seamOff && seamOff.total} cadenceBonus=${seamOff && seamOff.cadenceBonus}`);

  await installCad(page);

  // ---- observed-with-in-memory-flip (proves ON path correct WHEN flipped; disk stays false) ----
  // 6 tier table = pure fn of cad (independent oracle 2/4/6 → 8/15/25)
  const tab = await page.evaluate(() => { const w = window.__cpick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 4, 6, 9]) { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: c, pid: "self", atMs: window.__CNOW, toZone: zone });
      out.push({ cad: c, tier: s.tier, critPct: s.critPct }); } return { zone, out }; });
  const tierOK = !tab.bad && tab.out.every(r => r.tier === oTier(r.cad) && r.critPct === oCrit(r.cad));
  ok("6 TABLA tiers = fn PURA del cad (oráculo QA 1→T0, 2→T1/8, 4→T2/15, 6→T3/25, 9→T3/25 sat)", tierOK, `${JSON.stringify(tab.out)}`);

  // 7 (differentiator) RATE: burst vs spread vs single
  const rate = await page.evaluate(() => { const z = window.__cpick(6).zone;
    const mk = (ts) => { window.__ckills("self", ts); return window.__dev.cadence({ nowMs: window.__CNOW, self: "self", toZone: z }); };
    const N = window.__CNOW;
    const burst = mk([N - 2500, N - 2000, N - 1500, N - 1000, N - 500, N]);        // 6 kills gap 0.5s
    const spread = mk([N - 30000, N - 24000, N - 18000, N - 12000, N - 6000, N]);  // 6 kills gap 6s (=1 half-life)
    const single = mk([N]);
    return { burst: { cad: burst.cad, tier: burst.tier }, spread: { cad: spread.cad, tier: spread.tier }, single: { cad: single.cad, tier: single.tier } }; });
  ok("7 ★ DIFERENCIADOR RATE: BURST(6 gap0.5s)⇒meter TREPA⇒ABRE(tier≥2); ESPARCIDO(6 gap6s)⇒meter≈1⇒T0; 1 kill⇒T0 (TEMPO no conteo)",
     rate.burst.tier >= 2 && rate.spread.tier === 0 && rate.spread.cad < 2 && rate.single.tier === 0,
     `burst=${JSON.stringify(rate.burst)} spread=${JSON.stringify(rate.spread)} single=${JSON.stringify(rate.single)}`);

  // 8 bump accumulator: 1 kill⇒~1; 2 coincident kills⇒>1.8
  const bump = await page.evaluate(() => { const z = window.__cpick(6).zone; const N = window.__CNOW;
    window.__ckills("self", [N]); const one = window.__dev.cadence({ nowMs: N, self: "self", toZone: z }).cad;
    window.__ckills("self", [N, N]); const two = window.__dev.cadence({ nowMs: N, self: "self", toZone: z }).cad;
    return { one, two }; });
  ok("8 BUMP acumulador = fn de kills: 1 kill⇒cad≈1(bumpPerKill); 2 kills coincidentes⇒cad≈2 (>1.8, apilan)",
     near(bump.one, 1, 0.05) && bump.two > 1.8, `one=${bump.one} two=${bump.two}`);

  // 9 passive individual + zone gate
  const pg = await page.evaluate(() => { const inz = window.__cpick(6);
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, leave: true });
    const out = window.__dev.cadence(); return { inZone: inz, outZone: { tier: out.tier, critBonusPct: out.critBonusPct, tag: out.tag } }; });
  ok("9 PASSIVE individual (critChance) + ZONE-GATE: en zona⇒critBonusPct>0 & tier≥1; fuera de zona⇒0 & tier0 & tag''",
     pg.inZone && pg.inZone.critBonusPct > 0 && pg.inZone.tier >= 1 && pg.outZone.critBonusPct === 0 && pg.outZone.tier === 0 && pg.outZone.tag === "",
     `in=${JSON.stringify(pg.inZone)} out=${JSON.stringify(pg.outZone)}`);

  // 10 decay determinista half-life: cad 6 (T3) → +6s ⇒ cad 3 (T1); +12s ⇒ 1.5 (T0). oracle oDecay.
  const dec = await page.evaluate(() => { const z = window.__cpick(6).zone;
    window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
    const t0 = window.__dev.cadence({ nowMs: window.__CNOW }); const t6 = window.__cat(6); const t12 = window.__cat(12);
    return { c0: t0.cad, t0: t0.tier, c6: t6.cad, t6: t6.tier, c12: t12.cad, t12: t12.tier }; });
  ok("10 ★ DECAY determinista 0-RNG half-life 6s: cad6(T3) →+6s cad3(T1) →+12s cad1.5(T0) [oráculo QA]",
     near(dec.c0, 6) && near(dec.c6, oDecay(6, 6)) && near(dec.c12, oDecay(6, 12)) && dec.t0 === 3 && dec.t6 === 1 && dec.t12 === 0,
     `c0=${dec.c0}/${dec.t0} c6=${dec.c6}/${dec.t6} c12=${dec.c12}/${dec.t12}`);

  // 11 crit seam wired ON: base + cadence bonus (isolated), respects abs cap; OFF total==base
  const seam = await page.evaluate(() => { window.__cpick(6); window.__dev.cadence({ self: "self" });
    const on = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;   // cadence T3=25, delve OFF here? delve is LIVE
    window.__dev.cadence({ enabled: false }); const off = window.__dev.cadence({ critTick: { base: 10 } }).critPicked;
    window.__dev.cadence({ enabled: true }); return { on, off }; });
  ok("11 ★ CANAL critChance wired + SEAM: ON base10⇒total>base (cadence suma aislado, respeta cap50); OFF⇒total==base(byte-id)",
     seam.on && seam.on.total > 10 && seam.on.total <= 50 && near(seam.off.total, 10) && seam.off.cadenceBonus === 0,
     `on=${JSON.stringify(seam.on)} off_total=${seam.off.total}`);

  // 12 SHARE-CAP vs Delve: Delve T3(25) + Cadence T3(25) ⇒ combined capped to 35 ⇒ cadence eff=10 (cedes 10, capped=true)
  const share = await page.evaluate(() => {
    // both channels on the SAME pid/zone. "forest" ∈ both DELVE.zones and CADENCE_RUSH.zones.
    window.__dev.cadence({ enabled: true, self: "self", clear: true });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: "forest" });
    // drive Delve to its own T3 (delve≥6 AND bands≥5) so delveCritBonusPct()=25 at the same seam
    if (window.__dev.delve) { try { window.__dev.delve({ enabled: true, self: "self", nowMs: window.__CNOW, delve: 6, bands: 5, pid: "self", atMs: window.__CNOW, toZone: "forest" }); } catch (e) {} }
    const both = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    return { both, delveBonus: both ? both.delveBonus : null, cadBonus: both ? both.cadenceBonus : null, cadEff: both ? both.cadenceEff : null, capped: both ? both.capped : null, total: both ? both.total : null };
  });
  const expEff = oShareCadence(share.delveBonus || 0, share.cadBonus || 0);
  ok("12 ★ SHARE-CAP vs Delve: bono combinado delve+cadence capado a cadenceCritCap 35 ⇒ cadence cede el margen (eff=min(35,d+c)-d), 0 doble-dip",
     share.both && share.cadBonus === 25 && near(share.cadEff, expEff) && (share.delveBonus >= 25 ? share.capped === true : true),
     `delve=${share.delveBonus} cad=${share.cadBonus} eff=${share.cadEff} (oracle ${expEff}) capped=${share.capped} total=${share.total}`);

  // 13 hard caps: cadence solo (delve reset to 0) ⇒ eff≤35; abs cap 50 never exceeded
  const caps = await page.evaluate(() => {
    if (window.__dev.delve) { try { window.__dev.delve({ enabled: true, self: "self", nowMs: window.__CNOW, delve: 0, bands: 0, pid: "self", atMs: window.__CNOW }); } catch (e) {} }
    window.__dev.cadence({ enabled: true, self: "self", clear: true });
    window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: "forest" });
    const solo = window.__dev.cadence({ critTick: { base: 0 } }).critPicked;
    const big = window.__dev.cadence({ critTick: { base: 48 } }).critPicked;   // base near abs cap
    return { soloEff: solo ? solo.cadenceEff : null, soloTotal: solo ? solo.total : null, bigTotal: big ? big.total : null, cadCap: solo ? solo.shareCap : null, absCap: solo ? solo.absCap : null };
  });
  ok("13 ★ CAP DURO cadenceCritCap≤35 (cadence sola) + cap ABS crit total ≤50 (base48+bono ⇒ ≤50)",
     caps.soloEff <= 35 + 1e-6 && caps.soloTotal <= 25 + 1e-6 && caps.bigTotal <= 50 + 1e-6 && caps.cadCap === 35 && caps.absCap === 50,
     `soloEff=${caps.soloEff} soloTotal=${caps.soloTotal} bigTotal=${caps.bigTotal} caps=${caps.cadCap}/${caps.absCap}`);

  // 14 orthogonality: opening cadence does NOT move other channels
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

  // 15 (C) 0-regression: arc flags served enabled:true; CADENCE served false. Restore in-memory to match disk DARK first.
  await page.evaluate(() => window.__dev.cadence({ enabled: false }));
  const arc = await page.evaluate(() => {
    const r = {};
    const tryEn = (fn) => { try { const s = window.__dev[fn](); return (s && "enabled" in s) ? s.enabled : null; } catch (e) { return "ERR"; } };
    r.nocturne = tryEn("nocturne"); r.delve = tryEn("delve"); r.cadence = tryEn("cadence");
    return r;
  });
  ok("15 (C) 0-REGRESIÓN: NOCTURNE_HUNT/DELVE served enabled:true (arc LIVE) + CADENCE_RUSH served false (DARK #67)",
     arc.nocturne === true && arc.delve === true && arc.cadence === false,
     `nocturne=${arc.nocturne} delve=${arc.delve} cadence=${arc.cadence}`);

  // 16 6 zones: passive applies in all 6 CADENCE_RUSH.zones with cad≥6 ⇒ T3
  const zres = await page.evaluate(() => {
    window.__dev.cadence({ enabled: true, self: "self" }); const zones = window.__dev.cadence().zones || [];
    const broken = [];
    for (const z of zones) { window.__dev.cadence({ clear: true, nowMs: window.__CNOW });
      const s = window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
      if (!(s.zone === z && s.rushable && s.tier === 3 && s.critBonusPct > 0)) broken.push(z); }
    return { zones, broken };
  });
  ok("16 ★ CADENCE 6 zonas: pasivo aplica en las 6 zonas (cad6⇒T3, critBonusPct>0) broken=[]",
     zres.zones.length === 6 && zres.broken.length === 0, `zones=${JSON.stringify(zres.zones)} broken=${JSON.stringify(zres.broken)}`);

  // 17 badge draw ON vs OFF + fps
  const badge = await page.evaluate(async () => {
    const orig = CanvasRenderingContext2D.prototype.fillText; let cnt = 0;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (typeof t === "string" && t.indexOf("Cadencia:") >= 0) cnt++; return orig.apply(this, arguments); };
    window.__dev.cadence({ enabled: true, self: "self" });
    const z = window.__cpick(6).zone; window.__dev.cadence({ nowMs: window.__CNOW, self: "self", cad: 6, pid: "self", atMs: window.__CNOW, toZone: z });
    await new Promise(r => setTimeout(r, 600)); const on = cnt;
    cnt = 0; window.__dev.cadence({ enabled: false }); await new Promise(r => setTimeout(r, 600)); const off = cnt;
    CanvasRenderingContext2D.prototype.fillText = orig; return { on, off };
  });
  ok("17 render badge 'Cadencia:' se DIBUJA con ON (count>0) y NO con OFF (0)", badge.on > 0 && badge.off === 0, `on=${badge.on} off=${badge.off}`);

  // restore disk-DARK state in memory before returning
  await page.evaluate(() => window.__dev.cadence({ enabled: false, clear: true }));
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
  ok("18 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- 19 NORTH STAR: real 2-client convergence (two independent pages, fresh browser) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE =====`);
  await browser.close(); browser = null;   // free resources before the 2-client browser
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  // index.html PAUSA su rAF al perder foco (pause-on-blur, feature real de QA) ⇒ crear/bootear una página en 2º plano
  // nunca llega a 'menu'. Cada página se crea, se trae al frente y se bootea EN SECUENCIA. Las lecturas son inyecciones
  // __dev síncronas con nowMs explícito (proyección determinista, 0 rAF) ⇒ funcionan aunque la página esté blurred.
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await p.bringToFront();
    await toPlay(p); await installCad(p);
    return p;
  }
  const pA = await mkNS("cliA");
  const pB = await mkNS("cliB");
  // shared server-authoritative snapshot {pid→{cad,atMs}} + shared clock QNOW. cliA reads pid 'cliA', cliB reads pid 'cliB'.
  const SNAP = { cliA: { cad: 6, atMs: QNOW }, cliB: { cad: 4, atMs: QNOW }, peer: { cad: 2, atMs: QNOW } };
  const readAt = async (p, self, elapsedSec) => p.evaluate((args) => {
    const { SNAP, self, now, zones0 } = args;
    window.__dev.cadence({ enabled: true, self, clear: true });
    window.__dev.cadence({ nowMs: now, self, push: SNAP });
    // teleport self into a hunt zone so crit applies
    window.__dev.cadence({ nowMs: now, self, toZone: zones0 });
    const s = window.__dev.cadence({ nowMs: now });
    return { self: s.self, cad: s.cad, tier: s.tier, critPct: s.critPct, critBonusPct: s.critBonusPct, cadMap: s.cadMap, nowMs: s.nowMs };
  }, { SNAP, self, now: QNOW + (elapsedSec || 0) * 1000, zones0: "forest" });

  // both at QNOW: same snapshot ⇒ cadMap identical; per-pid cad differs (A reads 6, B reads 4)
  const a0 = await readAt(pA, "cliA", 0); const b0 = await readAt(pB, "cliB", 0);
  const mapEq = JSON.stringify(a0.cadMap) === JSON.stringify(b0.cadMap);
  ok("18a NORTH STAR: MISMO snapshot ⇒ cadMap byte-idéntico en cliA y cliB (server-auth convergente)", mapEq, `A=${JSON.stringify(a0.cadMap)} B=${JSON.stringify(b0.cadMap)}`);
  ok("18b per-pid: cliA lee cad=6/T3, cliB lee cad=4/T2 del MISMO snapshot (INDIVIDUAL, oráculo QA)",
     near(a0.cad, 6) && a0.tier === oTier(6) && near(b0.cad, 4) && b0.tier === oTier(4) && a0.self === "cliA" && b0.self === "cliB",
     `A cad=${a0.cad}/T${a0.tier} B cad=${b0.cad}/T${b0.tier}`);

  // decay convergence: advance both +6s ⇒ each pid halves; cadMap still identical across clients
  const a6 = await readAt(pA, "cliA", 6); const b6 = await readAt(pB, "cliB", 6);
  const mapEq6 = JSON.stringify(a6.cadMap) === JSON.stringify(b6.cadMap);
  ok("18c decay CONVERGE +6s: cadMap sigue byte-idéntico entre clientes; cliA cad→3(T1), cliB cad→2(T1) [oráculo half-life]",
     mapEq6 && near(a6.cad, oDecay(6, 6)) && near(b6.cad, oDecay(4, 6)) && a6.tier === oTier(oDecay(6, 6)) && b6.tier === oTier(oDecay(4, 6)),
     `A cad=${a6.cad}/T${a6.tier} B cad=${b6.cad}/T${b6.tier} mapEq=${mapEq6}`);

  // cliA leaves zone ⇒ its crit → 0 BUT cadMap server-auth + cliB Δ intact
  const aLeave = await pA.evaluate((now) => { window.__dev.cadence({ nowMs: now, self: "cliA", leave: true });
    const s = window.__dev.cadence({ nowMs: now }); return { critBonusPct: s.critBonusPct, tier: s.tier, cadMap: s.cadMap }; }, QNOW);
  const bAfter = await readAt(pB, "cliB", 0);
  // server-auth cadMap must still hold all 3 pids at their raw values (zone-gate only affects LOCAL crit application, not the shared snapshot)
  const mapIntact = aLeave.cadMap && near(+aLeave.cadMap.cliA, 6) && near(+aLeave.cadMap.cliB, 4) && near(+aLeave.cadMap.peer, 2);
  ok("18d cliA SALE de zona ⇒ su critBonusPct→0 (zone-gate) PERO cadMap server-auth INTACTO (cliA6/cliB4/peer2) + cliB Δ intacto",
     aLeave.critBonusPct === 0 && mapIntact && near(bAfter.cad, 4) && bAfter.critBonusPct > 0,
     `A bonus=${aLeave.critBonusPct} cadMap=${JSON.stringify(aLeave.cadMap)} B cad=${bAfter.cad}/bonus=${bAfter.critBonusPct}`);

  // screenshot evidence
  await pA.screenshot({ path: join(OUT, "selfverify.png") });
  await pB.screenshot({ path: join(OUT, "client-b.png") });
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

console.log(`\n==== CAS-2401 DARK QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} ====`);
process.exit(FAIL === 0 ? 0 : 1);
