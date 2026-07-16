// CAS-2435 — INDEPENDENT QA (DARK, SCARCITY_EDGE.enabled:false) for EVO#72 PRESIÓN POR ESCASEZ DE RECURSOS.
// QA-OWNED harness: oracles re-derived FROM SCRATCH (no trust of GE's cas2432 numbers). Build DARK 0d33567b348c @ master 917e818.
// Eje FRESCO = ESCASEZ/AGOTAMIENTO del mundo compartido server-auth: depletion(zona)=1-mobsVivosNoJefe/Σsp.max ∈[0,1].
// Canal FRESCO = essenceFind (bono de esencia por forrajeo). ⊥/DISTINTO a las 13 LIVE #59-#71.
//
// QA oracles (independientes):
//   oracleTier(dep):  t=0; if(dep>=0.50)t=1; if(dep>=0.80)t=2      (tabla [{.50,.06},{.80,.12}])
//   oracleMul(t):     min(0.12, [0,0.06,0.12][t])                  (sub-cap scarcityEssCap=0.12)
//   oracleDep(cap,alive): cap<3?0: clamp(1-alive/cap, 0, 1)        (formula re-derivada de los primitivos server-auth)
//   oracleForage(mul,xp): round(mul*xp)
//
// Checks:
//   1  boot to play, __dev.scarcity + arc peers + __meta + __BUILD==0d33567b348c, 0 JS err.
//   2  BYTE-NEUTRAL OFF (fresh boot): enabled false, gExists false (G.scarcity nunca existe), tier/mul/preview 0, channel essenceFind, tag "".
//   3  STATELESS save OFF: saveBlob SIN clave scarcity*.
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  LUT re-derivada: para un sweep de deps, depProbe.tier/mul == oracleTier/oracleMul (byte-exacto).
//   6  ★ REAL SERVER-AUTH: cada zona-spawner: cap==Σsp.max reportado>=minZoneCap; depletion REPORTADA == oracleDep(cap,alive) re-derivada; ∈[0,1]; ≥1 zona T≥1; zona-inicio cap0/T0.
//   7  ★ DIFERENCIADOR vs LastStand: zona con cap alta + AUSENCIA (alive<20%cap) ⇒ T≥1 SIN enemigos enganchados; lastStand LIVE coexiste ⊥ e independiente.
//   8  CANAL essenceFind: forageProbe(zona agotada,xp) == oracleForage(mul,xp) >0; zona sin-cap ⇒ 0.
//   9  ★ SUB-CAP: sweep completo dep∈[0,1] ⇒ mul nunca > 0.12.
//  10  ★ BYTE-NEUTRAL OFF real: (a) OFF ⇒ forageProbe(zona max-agotada).essence==0 y forageEssPreview==0; (b) __meta().essence NO cambia tras batería completa de probes/toggles (STATELESS, 0 mutación).
//  11  ★ ORTOGONALIDAD: flip escasez OFF→ON en misma posición ⇒ 8 peers (ward/gold/crit/xp/vamp/loot/atkspd/detectRadius) IDÉNTICOS; toggling LAST_STAND NO cambia depletion.
//  12  ★ 0-REGRESIÓN: 13 flags #59-#71 served enabled:true; SCARCITY_EDGE served false.
//  13  render badge "Escasez:" DIBUJA ON+zona agotada (count>0) / NO OFF (count 0) + fps>=30.
//  14  ★ NORTH STAR 2-CLIENTE: 2 páginas ⇒ zoneCap + LUT + canal + worldFingerprint IDÉNTICOS byte-a-byte (0 desync).
//  15  ★ RECONNECT STATELESS: reload de página ⇒ enabled false, gExists false, save sin clave scarcity (0 drift, 0 persistencia).
//   0  no JS errors durante el run.
// Run: node tools/cas2435-scarcity-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2435-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const EXPECT_BUILD = "0d33567b348c";
const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
// ---- INDEPENDENT QA oracles (re-derived, NOT read from config) ----
const oracleTier = (dep) => { let t = 0; if (dep >= 0.50) t = 1; if (dep >= 0.80) t = 2; return t; };
const oracleMul = (t) => Math.min(0.12, [0, 0.06, 0.12][t] || 0);
const oracleDep = (cap, alive, minCap = 3) => cap < minCap ? 0 : clamp(1 - alive / cap, 0, 1);
const oracleForage = (mul, xp) => Math.round(mul * xp);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const ZONES = ["forest", "caves", "ruins", "abyss", "frost", "trial", "swamp", "caldera"];
// independent depletion sweep for LUT re-derivation
const DEPS = [0, 0.25, 0.49, 0.499, 0.50, 0.65, 0.799, 0.80, 0.9, 1.0];

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks + exact build id
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.scarcity && window.__dev.ward && window.__dev.lastStand && window.__dev.firmFooting && window.__dev.shadowStalk && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__meta));
  ok(`1 boot→play, __dev.scarcity + arc peers + __meta + __BUILD==${EXPECT_BUILD}, 0 err`,
     hooks && errors.length === 0 && build === EXPECT_BUILD, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.scarcity());
  ok("2 BYTE-NEUTRAL OFF (fresh boot): enabled false, gExists false, tier/mul/preview 0, channel essenceFind, tag \"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.mul === 0 && dark.forageEssPreview === 0 && dark.channel === "essenceFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} mul=${dark.mul} preview=${dark.forageEssPreview} tag="${dark.tag}"`);

  // 3 stateless save OFF
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 STATELESS save OFF: no scarcity* key in save blob", !/"scarcity[A-Za-z]*"\s*:/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.scarcity({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 LUT re-derived independently
  const tab = await page.evaluate((deps) => deps.map(d => window.__dev.scarcity({ depProbe: { dep: d } }).depProbe), DEPS);
  const tabOK = DEPS.every((d, i) => { const eT = oracleTier(d), eM = oracleMul(eT); return tab[i] && tab[i].tier === eT && near(tab[i].mul, eM); });
  ok("5 LUT re-derivada: depProbe.tier/mul == oracleTier/oracleMul byte-exacto sobre sweep",
     tabOK, JSON.stringify(DEPS.map((d, i) => ({ d, got: tab[i], exp: { t: oracleTier(d), m: oracleMul(oracleTier(d)) } }))));

  // 6 ★ REAL SERVER-AUTH — re-derive depletion from cap+alive primitives
  const zread = await page.evaluate((zones) => {
    window.__dev.scarcity({ enabled: true });
    const out = {}; for (const z of zones) out[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe;
    const start = window.__dev.scarcity();
    const minCap = start.minZoneCap;
    window.__dev.scarcity({ enabled: false });
    return { out, startZone: start.zone, startCap: start.zoneCap, startTier: start.tier, minCap };
  }, ZONES);
  const spawnerZones = ZONES.filter(z => zread.out[z] && zread.out[z].cap >= zread.minCap);
  const depFormulaOK = spawnerZones.every(z => { const zp = zread.out[z];
    const eDep = oracleDep(zp.cap, zp.alive, zread.minCap); const eTier = oracleTier(eDep);
    return near(zp.depletion, eDep, 1e-3) && zp.tier === eTier && zp.depletion >= 0 && zp.depletion <= 1; });
  const depletedZone = spawnerZones.find(z => zread.out[z].tier >= 1);
  const capsOK = spawnerZones.length >= 4 && spawnerZones.every(z => zread.out[z].cap >= zread.minCap);
  const startNoCap = zread.startCap === 0 && zread.startTier === 0;
  ok("6 ★ REAL SERVER-AUTH: depletion REPORTADA == oracleDep(cap,alive) re-derivada; cap≥minZoneCap; ≥1 zona T≥1; zona-inicio cap0/T0",
     depFormulaOK && capsOK && !!depletedZone && startNoCap,
     `minCap=${zread.minCap} spawnerZones=${spawnerZones.length} depleted=${depletedZone} start={${zread.startZone},cap${zread.startCap},T${zread.startTier}} sample=${JSON.stringify(zread.out[depletedZone])}`);

  const depTile = zread.out[depletedZone] && zread.out[depletedZone].tile;
  const maxDepZone = spawnerZones.slice().sort((a, b) => zread.out[b].depletion - zread.out[a].depletion)[0];

  // 7 ★ DIFERENCIADOR vs LastStand
  const diff = await page.evaluate((zone) => {
    window.__dev.scarcity({ enabled: true });
    const zp = window.__dev.scarcity({ zoneProbe: { zone } }).zoneProbe;
    const ls = window.__dev.lastStand ? window.__dev.lastStand() : null;
    window.__dev.scarcity({ enabled: false });
    return { zp, lsEnabled: ls ? ls.enabled : null, lsCount: ls ? ls.count : null };
  }, maxDepZone);
  const diffOK = diff.zp && diff.zp.tier >= 1 && diff.zp.cap > 0 && diff.zp.depletion >= 0.8 && diff.zp.alive < diff.zp.cap * 0.2 && diff.lsEnabled === true;
  ok("7 ★ DIFERENCIADOR: zona cap-alta + AUSENCIA (alive<20%cap) ⇒ T≥1 por AUSENCIA (INVERSO a LastStand engaged-count); LAST_STAND LIVE coexiste ⊥",
     diffOK, JSON.stringify(diff));

  // 8 CANAL essenceFind
  const forage = await page.evaluate((depZone, startZone) => {
    window.__dev.scarcity({ enabled: true });
    const dep = window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 137 } }).forageProbe;
    const rich = window.__dev.scarcity({ forageProbe: { zone: startZone, xp: 137 } }).forageProbe;
    window.__dev.scarcity({ enabled: false });
    return { dep, rich };
  }, maxDepZone, zread.startZone);
  const forageOK = forage.dep && forage.dep.essence > 0 && forage.dep.essence === oracleForage(forage.dep.mul, 137) && forage.rich && forage.rich.essence === 0;
  ok("8 CANAL essenceFind: forageProbe(zona agotada,xp137)==oracleForage(mul,137)>0; zona sin-cap ⇒ 0",
     forageOK, JSON.stringify(forage) + ` oracle=${forage.dep ? oracleForage(forage.dep.mul, 137) : "?"}`);

  // 9 ★ SUB-CAP over full sweep
  const capChk = await page.evaluate(() => { const vals = [];
    for (let d = 0; d <= 1.0001; d += 0.02) vals.push(window.__dev.scarcity({ depProbe: { dep: d } }).depProbe.mul);
    return { max: Math.max(...vals), cap: window.__dev.scarcity().cap }; });
  ok("9 ★ SUB-CAP: ningún dep produce mul>0.12 (sweep completo)", capChk.max <= 0.12 + 1e-9 && near(capChk.cap, 0.12), JSON.stringify(capChk));

  // 10 ★ BYTE-NEUTRAL OFF real + STATELESS essence-delta
  const neutral = await page.evaluate((depZone) => {
    const essBefore = window.__meta().essence | 0;
    window.__dev.scarcity({ enabled: false });
    const off = window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 100 } });
    // full battery of probes/toggles — must NOT mutate essence (STATELESS)
    window.__dev.scarcity({ enabled: true });
    window.__dev.scarcity({ zoneProbe: { zone: depZone } });
    window.__dev.scarcity({ depProbe: { dep: 0.9 } });
    window.__dev.scarcity({ forageProbe: { zone: depZone, xp: 100 } });
    window.__dev.scarcity({ enabled: false });
    const essAfter = window.__meta().essence | 0;
    return { forageOff: off.forageProbe, previewOff: off.forageEssPreview, mulOff: off.mul, essBefore, essAfter };
  }, maxDepZone);
  const neutOK = neutral.forageOff && neutral.forageOff.essence === 0 && neutral.forageOff.mul === 0 && neutral.previewOff === 0 && neutral.mulOff === 0 && neutral.essBefore === neutral.essAfter;
  ok("10 ★ BYTE-NEUTRAL OFF: OFF ⇒ mul/essence/preview 0 en zona max-agotada; __meta().essence NO cambia tras batería (STATELESS)",
     neutOK, JSON.stringify(neutral));

  // 11 ★ ORTHOGONALITY
  const orth = await page.evaluate((depTile, depZone) => {
    if (depTile) { window.__dev.scarcity({ enabled: true, tp: { tx: depTile.tx, ty: depTile.ty } }); window.__dev.scarcity({ enabled: false }); }
    const snap = () => { const s = window.__dev.scarcity(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit }; };
    const peersOff = snap();
    window.__dev.scarcity({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    const lsPrev = window.__dev.lastStand ? window.__dev.lastStand().enabled : null;
    window.__dev.lastStand && window.__dev.lastStand({ enabled: true });
    const afterArc = window.__dev.scarcity({ zoneProbe: { zone: depZone } }).zoneProbe;
    window.__dev.lastStand && window.__dev.lastStand({ enabled: lsPrev });
    window.__dev.scarcity({ enabled: false });
    return { peersOff, peersOn, peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn),
      depUnchanged: beforeArc.depletion === afterArc.depletion && beforeArc.tier === afterArc.tier };
  }, depTile, maxDepZone);
  ok("11 ★ ORTOGONALIDAD: flip escasez OFF→ON NO cambia 8 peers; toggling LAST_STAND NO cambia depletion",
     orth.peersUnchanged && orth.depUnchanged, JSON.stringify(orth));

  // 12 ★ 0-REGRESSION
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const scDark = flag("SCARCITY_EDGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 13 flags arco #59-#71 served true; SCARCITY_EDGE served false",
     arcAllOn && scDark && arc.length === 13, `scarcity=${flag("SCARCITY_EDGE")} arc=${JSON.stringify(arcLive)}`);

  // 13 render badge
  const badge = await page.evaluate(async (depTile) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Escasez:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.scarcity({ enabled: true }); if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.scarcity({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, depTile);
  ok("13 render badge \"Escasez:\" DIBUJA ON+zona agotada (count>0) / NO OFF (0) + fps≥30",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((depTile) => { window.__dev.scarcity({ enabled: true }); if (depTile) window.__dev.scarcity({ tp: { tx: depTile.tx, ty: depTile.ty } }); }, depTile);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));

  // 14 ★ NORTH STAR 2-client
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((zones) => {
    window.__dev.scarcity({ enabled: true });
    const caps = {}; for (const z of zones) caps[z] = window.__dev.scarcity({ zoneProbe: { zone: z } }).zoneProbe.cap;
    const lut = [0.55, 0.85].map(d => { const p = window.__dev.scarcity({ depProbe: { dep: d } }).depProbe; return { dep: d, tier: p.tier, mul: p.mul }; });
    const forage = window.__dev.scarcity({ forageProbe: { zone: "__pure__", xp: 100 } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.scarcity({ enabled: false });
    return { caps, lut, forageMul: forage.forageProbe.mul, fp };
  }, ZONES);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = JSON.stringify(A.caps) === JSON.stringify(B.caps) && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.forageMul === B.forageMul && A.fp === B.fp;
  ok("14 ★ NORTH STAR 2-CLIENTE: zoneCap + LUT + canal + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `caps=${JSON.stringify(A.caps) === JSON.stringify(B.caps)} lut=${JSON.stringify(A.lut) === JSON.stringify(B.lut)} forage=${A.forageMul === B.forageMul} fp=${A.fp === B.fp} fpLen=${A.fp.length}`);

  // 15 ★ RECONNECT STATELESS — reload page A, no drift (page A has a save ⇒ may resume into play or land in menu)
  await page.evaluate(() => window.__dev.scarcity({ enabled: false }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc !== "play") await toPlay(page);
  await page.waitForFunction("window.__dev.scarcity", { timeout: 8000 });
  const recon = await page.evaluate(() => { const s = window.__dev.scarcity(); const blob = JSON.stringify(window.__dev.saveBlob());
    return { enabled: s.enabled, gExists: s.gExists, noKey: !/"scarcity[A-Za-z]*"\s*:/.test(blob) }; });
  ok("15 ★ RECONNECT STATELESS: reload ⇒ enabled false, gExists false, save sin clave scarcity (0 drift)",
     recon.enabled === false && recon.gExists === false && recon.noKey, JSON.stringify(recon));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
