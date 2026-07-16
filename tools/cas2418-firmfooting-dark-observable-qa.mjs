// CAS-2418 — INDEPENDENT DARK QA for TERRENO FIRME / PISADA FIRME (FIRM_FOOTING.enabled:false). EVO mecánica #70 (CAS-2415), 2-cliente DARK.
// QA-OWNED harness (b5c10283). NOT a copy of the GE self-verify (cas2415): oráculos RE-DERIVADOS del config, drivers re-etiquetados
// obsA/obsB, foco en las 5 aceptaciones DARK del ticket:
//   (1) BOOT/LOAD/MOVEMENT/COMBAT verdes: arranca a play, se mueve (delta pos real), ataca, 0 JS err / 0 crash.
//   (2) EJE ESPACIAL / MATERIAL DE TERRENO: el material server-auth del tile bajo el héroe (world.terr) ⇒ tier de FIRMEZA:
//       grass/dirt→T1(+8 atkspd), stone/cobble/street→T2(+16), sand/water/ice/swamp/caldera→T0(+0). LUT pura determinista.
//       Leído REAL cross-zone (tp a tiles conocidos de world.terr vía scan). Instantáneo (firme→suelto→firme, sin decay ⊥ temporal).
//   (3) SHARE-CAP GLOBAL de-stack: FIRM_FOOTING entra al sink sumado heroAtkspd bajo el TECHO GLOBAL ATKSPD_TOTAL_CAP=130 ⇒
//       min(130, base+firm), 0 doble-dip. base120+16⇒130 (capado/cede 6); base100+16⇒116; base0+16⇒16. sub-cap propio 16.
//   (4) NORTH STAR 2-CLIENTE: el material es fn PURA de world.terr (0-RNG, 0-timer, STATELESS) ⇒ MISMO tile ⇒ ambos clientes
//       ven el MISMO terr/tier/bonus/atkspdTotal/tag + worldFingerprint. 0 desync. Reconexión mantiene (STATELESS).
//   (5) OFF BYTE-NEUTRAL: con enabled:false, firmFootingAtkspd()=+0 ⇒ heroAtkspd (atkspdTotal) IDÉNTICO sobre terreno firme
//       vs suelto vs baseline (delta 0); G.firmFooting nunca se crea, save sin clave, worldFingerprint estable; 0-regr 11 flags
//       arco #59-#69 served true, FIRM_FOOTING served false.
// Los mecanismos runtime (LUT/share-cap/seam) se OBSERVAN vía flip IN-MEMORY (__dev.firmFooting({enabled:true})) — el disco sigue
// false; prueba que la ruta ON es correcta CUANDO se flipe, sin tocar el build DARK. Post-flip QA revalida LIVE.
//
// Oráculos independientes (re-derivados de sim/config.js FIRM_FOOTING): materiales T_GRASS=0,T_DIRT=1 → T1(+8);
//   T_STONE=2,T_COBBLE=3,T_STREET=9 → T2(+16); T_SAND=4,T_WATER=5,T_ICE=6,T_SWAMP=7,T_CALDERA=8 → T0(+0).
//   firmFootingCap=16, ATKSPD_TOTAL_CAP=130. oTier/oBonus por MATERIAL; oCombined(base)=min(130, base+firm).
// Run: node tools/cas2418-firmfooting-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2418-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

// ---- oráculos independientes (QA re-deriva, NO lee del snapshot) ----
const T = { GRASS: 0, DIRT: 1, STONE: 2, COBBLE: 3, SAND: 4, WATER: 5, ICE: 6, SWAMP: 7, CALDERA: 8, STREET: 9 };
const CAP_SELF = 16, ATKSPD_CAP = 130;
const T2 = [T.STONE, T.COBBLE, T.STREET], T1 = [T.GRASS, T.DIRT];
const oTier = (terr) => (T2.indexOf(terr) >= 0 ? 2 : (T1.indexOf(terr) >= 0 ? 1 : 0));
const oBonus = (terr) => { const t = oTier(terr); const raw = t === 2 ? 16 : (t === 1 ? 8 : 0); return raw > CAP_SELF ? CAP_SELF : raw; };
const oCombined = (base) => Math.min(ATKSPD_CAP, base + 0); // baseline: FIRM_FOOTING adds via firmFooting(hero); capProbe supplies firm
const ALL_MAT = [T.GRASS, T.DIRT, T.STONE, T.COBBLE, T.SAND, T.WATER, T.ICE, T.SWAMP, T.CALDERA, T.STREET];

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function waitMenu(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.bringToFront(); } catch (e) {}
    try { await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 }); return; }
    catch (e) { if (attempt < 2) { try { await page.reload({ waitUntil: "domcontentloaded" }); } catch (e2) {} } else throw e; }
  }
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
  await page.bringToFront();
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks + build
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.firmFooting && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.scene));
  ok("1 (1) boots to play, __dev.firmFooting + save/fp hooks + __BUILD, 0 JS err", hooks && errors.length === errStart && !!build, `build=${build} err=${errors.length - errStart}`);

  // 2 (1) MOVEMENT smoke: hero moves under ArrowRight (real position delta), scene stays 'play'
  const mov = await page.evaluate(async () => {
    const h0 = window.__dev.firmFooting().hero; const p0 = { x: h0.x, y: h0.y };
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight", bubbles: true }));
    const h1 = window.__dev.firmFooting().hero; const p1 = { x: h1.x, y: h1.y };
    return { dist: Math.hypot(p1.x - p0.x, p1.y - p0.y), scene: window.__dev.scene(), dead: h1.dead };
  });
  ok("2 (1) MOVEMENT: ArrowRight mueve al héroe (delta pos>0), sigue en 'play', vivo",
     mov.dist > 1 && mov.scene === "play" && mov.dead === false, `dist=${mov.dist.toFixed(1)} scene=${mov.scene}`);

  // 3 (1) COMBAT smoke: numeric attack (Digit1) fires without crash
  const errBeforeCombat = errors.length;
  const combat = await page.evaluate(async () => {
    for (let i = 0; i < 3; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true }));
      await new Promise(r => setTimeout(r, 120)); window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })); await new Promise(r => setTimeout(r, 120)); }
    return { scene: window.__dev.scene(), dead: window.__dev.firmFooting().hero.dead };
  });
  ok("3 (1) COMBAT: ataque numérico (Digit1) dispara sin crash, sigue en 'play', 0 err nuevo",
     combat.scene === "play" && errors.length === errBeforeCombat, `scene=${combat.scene} newErr=${errors.length - errBeforeCombat}`);

  // 4 (5) byte-neutral OFF fresh boot: read BEFORE any inject
  const dark = await page.evaluate(() => window.__dev.firmFooting());
  ok("4 (5) byte-neutral OFF (fresh boot): enabled:false + gExists:false (STATELESS, G.firmFooting jamás creado) + channel atkspd + bonus0 + tag''",
     dark.enabled === false && dark.gExists === false && dark.channel === "atkspd" && dark.bonus === 0 && dark.atkspd === 0 && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} channel=${dark.channel} bonus=${dark.bonus} atkspd=${dark.atkspd} tag="${dark.tag}"`);

  // 5 (5) save OFF: no new persisted key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("5 (5) save OFF: no 'firmFooting'/'firmFootingServer' key (estado 100% derivado, 0 persistencia nueva)", !/"firmFooting(Server)?"/.test(saveOff), `len=${saveOff.length}`);

  // 6 (5) worldFingerprint stable across enabled toggle (0 RNG drift) — my own seed 613
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.firmFooting({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(613)));
  await page.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  ok("6 (5) worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpB === fpA, `match=${fpB === fpA}`);

  // 7 (2) TABLA de tiers = fn PURA del MATERIAL [oráculo QA]: terrProbe(terr) → tier/bonus para los 10 materiales
  const tab = await page.evaluate((mats) => {
    const out = {}; for (const m of mats) out[m] = window.__dev.firmFooting({ terrProbe: { terr: m } }).probe; return out;
  }, ALL_MAT);
  const tabOk = ALL_MAT.every(m => tab[m].tier === oTier(m) && near(tab[m].bonus, oBonus(m)));
  ok("7 (2) TABLA tiers = fn PURA del MATERIAL [oráculo QA]: grass/dirt→T1/+8, stone/cobble/street→T2/+16, sand/water/ice/swamp/caldera→T0/+0",
     tabOk, ALL_MAT.map(m => `${m}:T${tab[m].tier}/${tab[m].bonus}`).join(" "));

  // 8 (2) REAL server-auth read cross-zone: scan world.terr, tp a UN tile REAL por material presente, verifica terr leído + tier + bonus
  const real = await page.evaluate(() => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan;
    const out = { hist: s.hist, tiles: {} };
    for (const mat of Object.keys(s.sample)) {
      const t = s.sample[mat];
      const snap = window.__dev.firmFooting({ tp: { tx: t.tx, ty: t.ty } });
      out.tiles[mat] = { tx: t.tx, ty: t.ty, terr: snap.terr, tier: snap.tier, bonus: snap.bonus, atkspd: snap.atkspd, zone: snap.hero && snap.hero.zone };
    }
    window.__dev.firmFooting({ enabled: false });
    return out;
  });
  const presentMats = Object.keys(real.tiles).map(Number);
  const realOk = presentMats.length >= 4 && presentMats.every(m => {
    const r = real.tiles[m]; return r.terr === m && r.tier === oTier(m) && near(r.bonus, oBonus(m)) && near(r.atkspd, oBonus(m));
  });
  // material CRUZA zonas: al menos un material firme (T2/T1) leído en ≥2 zonas distintas O presencia de materiales de zonas distintas
  const zonesSeen = new Set(presentMats.map(m => real.tiles[m].zone));
  ok("8 (2) EJE REAL server-auth: tp a tile REAL de world.terr por material ⇒ terr/tier/bonus/atkspd = oráculo QA; material CRUZA zonas (≥4 materiales, ≥2 zonas)",
     realOk && zonesSeen.size >= 2, `mats=${presentMats.join(",")} zones=${[...zonesSeen].join(",")}`);

  // 9 (2) DIFERENCIADOR INSTANTÁNEO (firme→suelto→firme, sin decay ⊥ temporal): tp firme (stone)→suelto (sand)→firme (grass)
  const inst = await page.evaluate(() => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan;
    const pick = (mat) => s.sample[mat];
    const firm = pick(2) || pick(3) || pick(9);  // stone/cobble/street
    const loose = pick(4) || pick(5) || pick(6) || pick(7) || pick(8); // sand/water/ice/swamp/caldera
    const soft = pick(0) || pick(1); // grass/dirt
    const at = (tt) => tt ? window.__dev.firmFooting({ tp: { tx: tt.tx, ty: tt.ty } }) : null;
    const a = at(firm), b = at(loose), c = at(soft);
    window.__dev.firmFooting({ enabled: false });
    return { firm: a && { terr: a.terr, bonus: a.bonus }, loose: b && { terr: b.terr, bonus: b.bonus }, soft: c && { terr: c.terr, bonus: c.bonus } };
  });
  const instOk = inst.firm && inst.loose && inst.firm.bonus === 16 && inst.loose.bonus === 0 && (!inst.soft || inst.soft.bonus === 8);
  ok("9 (2) DIFERENCIADOR INSTANTÁNEO: firme (stone→+16) → suelto (sand/agua→+0) → suave (grass→+8), SIN decay/estado (⊥ temporal, cambio inmediato con la posición)",
     instOk, JSON.stringify(inst));

  // 10 (3) SHARE-CAP GLOBAL de-stack [oráculo QA min(130, base+firm)]: capProbe con héroe en terreno FIRME (stone, +16)
  const cap = await page.evaluate(() => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan;
    const firm = s.sample[2] || s.sample[3] || s.sample[9];
    window.__dev.firmFooting({ tp: { tx: firm.tx, ty: firm.ty } });
    const out = {};
    for (const base of [0, 100, 114, 120, 130]) out[base] = window.__dev.firmFooting({ capProbe: { base } }).capped;
    window.__dev.firmFooting({ enabled: false });
    return out;
  });
  const capOk = cap[0].firmFooting === 16 && cap[0].combined === 16 && cap[100].combined === 116 &&
    cap[114].combined === 130 && cap[120].combined === 130 && cap[130].combined === 130 && cap[130].cap === 130;
  ok("10 (3) SHARE-CAP GLOBAL de-stack vs heroAtkspd (ATKSPD_TOTAL_CAP=130): base0+16→16, 100+16→116, 114+16→130 (cede 0), 120+16→130 (cede 6, capado), 130+16→130. 0 doble-dip",
     capOk, [0, 100, 114, 120, 130].map(b => `${b}→${cap[b].combined}`).join(" "));

  // 11 (5) OFF byte-neutral heroAtkspd: sobre terreno FIRME vs SUELTO, con enabled:false ⇒ atkspdTotal IDÉNTICO (firmFootingAtkspd=+0)
  const neutral = await page.evaluate(() => {
    window.__dev.firmFooting({ enabled: false });
    const s = window.__dev.firmFooting({ scan: true }).scan;   // scan es read-only (funciona OFF)
    const firm = s.sample[2] || s.sample[3] || s.sample[9];
    const loose = s.sample[4] || s.sample[5] || s.sample[6] || s.sample[7] || s.sample[8];
    const at = (tt) => { const r = window.__dev.firmFooting({ tp: { tx: tt.tx, ty: tt.ty } }); return { total: r.atkspdTotal, ff: r.atkspd, terr: r.terr }; };
    const f = at(firm), l = at(loose);
    return { firm: f, loose: l };
  });
  ok("11 (5) OFF byte-neutral heroAtkspd: enabled:false ⇒ atkspdTotal sobre terreno FIRME == SUELTO (firmFootingAtkspd=+0, delta 0, byte-id vs baseline)",
     near(neutral.firm.total, neutral.loose.total) && neutral.firm.ff === 0 && neutral.loose.ff === 0,
     `firmTotal=${neutral.firm.total} looseTotal=${neutral.loose.total} ffFirm=${neutral.firm.ff}`);

  // 12 (2) ORTOGONALIDAD: FIRM_FOOTING (canal atkspd) NO toca wardRegen/goldFind/critChance/xpGain/vamp/lootQuality (canales ⊥)
  const orth = await page.evaluate(() => {
    const off = window.__dev.firmFooting();
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan; const firm = s.sample[2] || s.sample[3] || s.sample[9];
    const on = window.__dev.firmFooting({ tp: { tx: firm.tx, ty: firm.ty } });
    window.__dev.firmFooting({ enabled: false });
    const peers = (o) => ({ ward: o.wardRegenBoost, gold: o.goldFindMul, crit: o.critChancePct, xp: o.xpGainMul, vamp: o.vampMul, loot: o.lootQualityFloor });
    return { off: peers(off), on: peers(on) };
  });
  const orthOk = JSON.stringify(orth.off) === JSON.stringify(orth.on);
  ok("12 (2) ORTOGONALIDAD: activar FIRM_FOOTING sobre terreno firme NO altera wardRegen/goldFind/critChance/xpGain/vamp/lootQuality (canal atkspd ⊥, 0 cross-talk)",
     orthOk, `peers=${JSON.stringify(orth.on)}`);

  // 13 (5) 0-REGRESIÓN: arco #59-#69 served enabled:true; FIRM_FOOTING served false (via config.js source)
  const cfgSrc = await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) { const r = await fetch("sim/config.js", { cache: "no-store" }); const t = await r.text();
      if (t.includes("export const FIRM_FOOTING") && t.length > 200000) return t; await new Promise(res => setTimeout(res, 200)); }
    const r = await fetch("sim/config.js", { cache: "no-store" }); return await r.text();
  });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ffDark = flag("FIRM_FOOTING") === "false";
  ok("13 (5) 0-REGRESIÓN: 11 flags arco #59-#69 served enabled:true (incl. LAST_STAND #69 LIVE); FIRM_FOOTING false (único DARK #70)",
     arcAllOn && ffDark && arc.length === 11, `firmFooting=${flag("FIRM_FOOTING")} arc=${JSON.stringify(arcLive)}`);

  // 14 (1) render badge "Terreno:" se DIBUJA ON + fps (perf budget)
  const badge = await page.evaluate(async () => {
    const CanvasProto = CanvasRenderingContext2D.prototype;
    let onCount = 0, offCount = 0, mode = "off";
    const origFill = CanvasProto.fillText;
    CanvasProto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Terreno:") >= 0) { if (mode === "on") onCount++; else offCount++; } return origFill.call(this, t, ...a); };
    window.__dev.firmFooting({ enabled: false });
    mode = "off"; await new Promise(r => setTimeout(r, 300));
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan; const firm = s.sample[2] || s.sample[3] || s.sample[9];
    window.__dev.firmFooting({ tp: { tx: firm.tx, ty: firm.ty } });
    mode = "on"; const t0 = performance.now(); let frames = 0;
    await new Promise(res => { const loop = () => { frames++; if (performance.now() - t0 < 700) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    CanvasProto.fillText = origFill;
    window.__dev.firmFooting({ enabled: false });
    return { onCount, offCount, fps };
  });
  ok("14 (1) render badge 'Terreno:' se DIBUJA ON (count>0), NO OFF (count 0), fps≥55 (perf budget, DPR-capped)",
     badge.onCount > 0 && badge.offCount === 0 && badge.fps >= 55, JSON.stringify(badge));

  // screenshot on firm terrain (ON) for evidence
  await page.evaluate(() => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ scan: true }).scan; const firm = s.sample[2] || s.sample[3] || s.sample[9];
    if (firm) window.__dev.firmFooting({ tp: { tx: firm.tx, ty: firm.ty } });
  });
  await sleep(300);
  await page.screenshot({ path: join(OUT, `selfverify-${tag}.png`) });
  await page.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  return { page, build };
}

let build1 = null, buildInfo = null;
let nsBrowser = null;
try {
  const r1 = await runOnce("run1");
  buildInfo = r1.build;
  await r1.page.close();
  const r2 = await runOnce("run2");
  build1 = r2.build;
  await r2.page.close();
  ok("15 determinismo ×2: mismo build servido en ambas rondas", buildInfo === build1, `${buildInfo} / ${build1}`);

  // ---- NORTH STAR: real 2-client convergence (material shard-consistent) ----
  console.log(`\n===== NORTH STAR 2-CLIENTE =====`);
  await browser.close(); browser = null;
  nsBrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  async function mkNS(tg) {
    const p = await nsBrowser.newPage();
    await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
    p.on("pageerror", (e) => errors.push(`[${tg}] ` + String(e)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(`[${tg}] ` + m.text()); });
    await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
    await p.bringToFront();
    await toPlay(p);
    return p;
  }
  const pA = await mkNS("obsA");
  const pB = await mkNS("obsB");

  // MISMO tile (tx,ty) ⇒ el material (fn PURA de world.terr, 0-RNG/0-timer) converge byte-a-byte en N clientes.
  const readTile = async (pg, tx, ty) => pg.evaluate((c) => {
    window.__dev.firmFooting({ enabled: true });
    const s = window.__dev.firmFooting({ tp: { tx: c.tx, ty: c.ty } });
    const fp = JSON.stringify(window.__dev.worldFingerprint(613));
    return { terr: s.terr, tier: s.tier, bonus: s.bonus, atkspd: s.atkspd, atkspdTotal: s.atkspdTotal, tag: s.tag, fp };
  }, { tx, ty });

  // descubre un tile FIRME real (stone/cobble/street) desde obsA
  const firmTile = await pA.evaluate(() => { window.__dev.firmFooting({ enabled: true }); const s = window.__dev.firmFooting({ scan: true }).scan;
    const t = s.sample[2] || s.sample[3] || s.sample[9]; window.__dev.firmFooting({ enabled: false }); return t; });
  const looseTile = await pA.evaluate(() => { window.__dev.firmFooting({ enabled: true }); const s = window.__dev.firmFooting({ scan: true }).scan;
    const t = s.sample[4] || s.sample[5] || s.sample[6] || s.sample[7] || s.sample[8]; window.__dev.firmFooting({ enabled: false }); return t; });

  // 16a T2 FIRME (mismo tile): terr/tier/bonus/atkspd/atkspdTotal/tag + worldFingerprint IDÉNTICOS byte-a-byte
  const a2 = await readTile(pA, firmTile.tx, firmTile.ty); const b2 = await readTile(pB, firmTile.tx, firmTile.ty);
  const conv2 = a2.terr === b2.terr && a2.tier === b2.tier && near(a2.bonus, b2.bonus) && near(a2.atkspd, b2.atkspd) && near(a2.atkspdTotal, b2.atkspdTotal) && a2.tag === b2.tag && a2.fp === b2.fp;
  ok("16a NORTH STAR: MISMO tile FIRME (T2) ⇒ terr/tier/bonus/atkspd/atkspdTotal/tag + worldFingerprint IDÉNTICOS byte-a-byte en obsA y obsB (0 desync, shard-consistente)",
     conv2 && a2.tier === oTier(a2.terr) && near(a2.bonus, oBonus(a2.terr)) && a2.tag === "⛰", `A=${JSON.stringify({ ...a2, fp: undefined })} B=${JSON.stringify({ ...b2, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.firmFooting({ enabled: false })); await pB.evaluate(() => window.__dev.firmFooting({ enabled: false }));

  // 16b T0 SUELTO (mismo tile): converge también en el caso sin ventaja (bonus0/tag'')
  const a0 = await readTile(pA, looseTile.tx, looseTile.ty); const b0 = await readTile(pB, looseTile.tx, looseTile.ty);
  const conv0 = a0.terr === b0.terr && a0.tier === b0.tier && near(a0.bonus, b0.bonus) && a0.tag === b0.tag;
  ok("16b NORTH STAR: MISMO tile SUELTO (T0) ⇒ ambos tier0/bonus0/tag'' IDÉNTICOS (converge también donde NO hay ventaja)",
     conv0 && a0.tier === 0 && near(a0.bonus, 0) && a0.tag === "", `A=${JSON.stringify({ ...a0, fp: undefined })} B=${JSON.stringify({ ...b0, fp: undefined })}`);
  await pA.evaluate(() => window.__dev.firmFooting({ enabled: false })); await pB.evaluate(() => window.__dev.firmFooting({ enabled: false }));

  // 16c reconnect/persistence: obsB reloads (rejoin), re-boots, STATELESS ⇒ sigue convergiendo byte-id con obsA en tile firme
  await pB.reload({ waitUntil: "domcontentloaded" });
  await pB.bringToFront();
  await toPlay(pB);
  const aRe = await readTile(pA, firmTile.tx, firmTile.ty); const bRe = await readTile(pB, firmTile.tx, firmTile.ty);
  const convRe = aRe.terr === bRe.terr && aRe.tier === bRe.tier && near(aRe.bonus, bRe.bonus) && near(aRe.atkspdTotal, bRe.atkspdTotal) && aRe.tag === bRe.tag && aRe.fp === bRe.fp;
  ok("16c NORTH STAR RECONNECT: obsB recarga (rejoin), re-bootea; STATELESS ⇒ material/tier/bonus/atkspd sigue byte-id con obsA (0 drift, no persiste estado)",
     convRe && bRe.tier === oTier(bRe.terr), `A=${JSON.stringify({ ...aRe, fp: undefined })} B=${JSON.stringify({ ...bRe, fp: undefined })}`);

  await pA.screenshot({ path: join(OUT, "client-a-firm.png") });
  await pB.screenshot({ path: join(OUT, "client-b-reconnect.png") });
  await pA.evaluate(() => window.__dev.firmFooting({ enabled: false }));
  await pB.evaluate(() => window.__dev.firmFooting({ enabled: false }));
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

console.log(`\n==== CAS-2418 DARK QA: ${PASS} PASS / ${FAIL} FAIL  build=${build1 || buildInfo} ====`);
process.exit(FAIL === 0 ? 0 : 1);
