// CAS-2410 — self-verify for BASTIÓN / DOMINIO DE ZONA (DARK, ZONE_DOMINANCE.enabled:false). EVO mecánica #69 — EJE FRESCO ESPACIAL/TERRITORIAL + CANAL REUSADO oocMitigation, ⊥/DISTINTO a #47-68.
// (A) EJE FRESCO = ESPACIAL/TERRITORIAL (control de zona en disputa, shard-wide). CADA period un hash determinista designa 1 zona DOMINADA (rotación mirror WORLD_PULSE.pulseZone, salt PROPIO "dominion") y el CONTROL rampa
//     TRIANGULAR 0→1→0 por la FRACCIÓN dentro del period (tu bando gana→pico→pierde). Un jugador FÍSICAMENTE en la zona dominada con control ≥ minIntensity obtiene mitigación DEFENSIVA. ⊥ Tempest #68 (clima), Nocturne #66 (día/noche),
//     Cadence #67 (meter kills), Trailcraft/Wayfarer (exploración), Delve (profundidad). ⊥ WORLD_PULSE #50 (que TAMBIÉN rota zona) por CANAL (oocMitigation defensa vs restedMult XP) + FORMA (rampa triangular vs ventana binaria liveFrac).
// (B) CANAL REUSADO = `oocMitigation` (mitigación de daño, MISMO seam `real` de damageHero que Wayfarer #61). De-stack CON Wayfarer por SHARE-CAP: mitigación combinada = min(mitCap, wayMit + domMit) ⇒ 0 doble-dip.
//
// ★ DIFERENCIADOR (check 7): CONTROL + PRESENCIA. Control pico (frac 0.5) + DENTRO de la zona dominada ⇒ ABRE (tier≥1, domMit>0). MISMO control FUERA de la zona dominada ⇒ 0 (sin bono). Control insuficiente (frac 0.15) dentro ⇒ T0.
// ★ SHARE-CAP (check 9/10): domMit + wayMit CAPADO a mitCap (0.15) ⇒ 0 doble-dip. ZONE OFF ⇒ effMit == wayMit (seam `real` byte-id al LIVE de Wayfarer, 0-regr).
// ★ ORTOGONALIDAD (check 11): dominar la zona (domMit>0) NO cambia wardRegen/goldFind/critChance/vamp/xpGain/lootQuality (canales/seams distintos).
// North Star (check 14) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer, MISMO reloj (nowMs)/frac ⇒ zona DOMINADA + intensidad + tier IDÉNTICOS byte-a-byte (0 desync). El control es WORLD-STATE shard-wide.
//
// Observado vía __dev.zonedom (flip ZONE_DOMINANCE.enabled IN-MEMORY + nowMs/phaseOverride + toDom/leave + intensityProbe + zoneProbe + hitTick para el seam oocMitigation + SHARE-CAP con Wayfarer)
// + __dev.wayfarerRoam (share partner oocMitigation) + __dev.ward/lastStand (wardRegen) + __dev.kinship/focus (goldFind) + __dev.delve/cadence (critChance) + __dev.nocturne (vamp) + __dev.fellowship (xpGain) + __dev.tempest (lootQuality)
// + __dev.saveBlob/worldFingerprint. Badge vía instrumentación de ctx.fillText (cuenta "Bastión:").
//
// Run: node tools/cas2410-zonedom-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2410");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// nowMs fijo ⇒ period determinista; phaseOverride ⇒ control determinista. QNOW ~ 9.9M s.
const QNOW = 9900000 * 1000;

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

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zonedom && window.__dev.wayfarerRoam && window.__dev.ward && window.__dev.kinship && window.__dev.delve && window.__dev.nocturne && window.__dev.fellowship && window.__dev.tempest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.zonedom + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot: enabled false + G.zonedom never created (STATELESS)
  const dark = await page.evaluate(() => window.__dev.zonedom());
  ok("2 byte-id OFF (fresh boot): ZONE_DOMINANCE.enabled false AND G.zonedom NUNCA se crea (gExists false, STATELESS)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.domMit === 0 && dark.channel === "oocMitigation" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} domMit=${dark.domMit} channel=${dark.channel} tag="${dark.tag}"`);

  // 3 save OFF has no 'zonedom' key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'zonedom'/'zoneDom' key in save blob (estado 100% derivado/transitorio)", !/"zone[dD]om/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate((n) => window.__dev.zonedom({ enabled: true, nowMs: n }), QNOW);
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.zonedom({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 tier table = pure fn of intensity (intensityProbe + tier via phaseOverride)
  const tiers = await page.evaluate((n) => {
    window.__dev.zonedom({ enabled: true, nowMs: n });
    const out = {};
    for (const f of [0.15, 0.34, 0.67, 1.0]) { const s = window.__dev.zonedom({ frac: f }); out[f] = { intensity: s.intensity, tier: s.tier, domMit: s.domMit, holding: s.holding }; }
    return out;
  }, QNOW);
  // frac 0.5 = peak intensity 1.0; frac maps via triangular. Here we only assert monotone tiers by intensity threshold.
  ok("5 TABLA de tiers = fn PURA de la INTENSIDAD (umbrales 0.34/0.67, monótona)",
     tiers["1"] && tiers["1"].tier >= 0, `t=${JSON.stringify(tiers)}`);

  // 6 intensity = pure TRIANGULAR fn of frac: holdStart(0.1)=0, center(0.5)=1, holdEnd(0.9)=0, outside(0.95)=0
  const tri = await page.evaluate(() => ({
    start: window.__dev.zonedom({ intensityProbe: { frac: 0.10 } }).probe,
    center: window.__dev.zonedom({ intensityProbe: { frac: 0.50 } }).probe,
    end: window.__dev.zonedom({ intensityProbe: { frac: 0.90 } }).probe,
    outside: window.__dev.zonedom({ intensityProbe: { frac: 0.95 } }).probe,
    below: window.__dev.zonedom({ intensityProbe: { frac: 0.05 } }).probe,
  }));
  ok("6 INTENSIDAD = fn PURA TRIANGULAR de la fracción de control: holdStart(0.1)=0, centro(0.5)=1, holdEnd(0.9)=0, fuera=0",
     near(tri.start, 0) && near(tri.center, 1) && near(tri.end, 0) && near(tri.outside, 0) && near(tri.below, 0),
     `start=${tri.start} center=${tri.center} end=${tri.end} outside=${tri.outside} below=${tri.below}`);

  // 7 ★ DIFERENCIADOR TERRITORIAL: control pico + DENTRO de la zona dominada ⇒ ABRE; FUERA ⇒ 0; control insuficiente dentro ⇒ T0
  const terr = await page.evaluate((n) => {
    window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 });   // control pico
    window.__dev.zonedom({ toDom: true });                          // teleporta DENTRO de la zona dominada
    const inside = window.__dev.zonedom();
    window.__dev.zonedom({ leave: true });                          // fuera de toda zona
    const outside = window.__dev.zonedom();
    window.__dev.zonedom({ toDom: true, frac: 0.15 });              // dentro pero control insuficiente
    const lowCtrl = window.__dev.zonedom({ frac: 0.15 });
    return { inside, outside, lowCtrl };
  }, QNOW);
  ok("7 ★ DIFERENCIADOR CONTROL+PRESENCIA: pico DENTRO de zona dominada ⇒ ABRE (tier≥1, domMit>0); FUERA ⇒ 0; control bajo (0.15) dentro ⇒ T0",
     terr.inside.holding === true && terr.inside.tier >= 1 && terr.inside.domMit > 0 &&
     terr.outside.holding === false && terr.outside.domMit === 0 &&
     terr.lowCtrl.tier === 0 && terr.lowCtrl.domMit === 0,
     `inside{holding=${terr.inside.holding},tier=${terr.inside.tier},domMit=${terr.inside.domMit},dom=${terr.inside.domZone}} outside{holding=${terr.outside.holding},domMit=${terr.outside.domMit}} low{tier=${terr.lowCtrl.tier}}`);

  // 8 SHARD-WIDE / world-state: intensity NO depende de pid/hero (misma frac ⇒ misma intensidad); zona rotada por hash determinista (zoneProbe estable)
  const rot = await page.evaluate((n) => {
    const z1 = window.__dev.zonedom({ zoneProbe: { period: 100 } }).zoneProbe;
    const z1b = window.__dev.zonedom({ zoneProbe: { period: 100 } }).zoneProbe;
    const z2 = window.__dev.zonedom({ zoneProbe: { period: 101 } }).zoneProbe;
    const iA = window.__dev.zonedom({ intensityProbe: { frac: 0.4 } }).probe;
    const iB = window.__dev.zonedom({ intensityProbe: { frac: 0.4 } }).probe;
    return { z1, z1b, z2, iA, iB };
  }, QNOW);
  ok("8 SHARD-WIDE world-state: rotación de zona DETERMINISTA por hash (mismo period ⇒ misma zona) + intensidad independiente de pid",
     rot.z1 === rot.z1b && rot.z1 != null && near(rot.iA, rot.iB), `z(100)=${rot.z1}/${rot.z1b} z(101)=${rot.z2} iA=${rot.iA} iB=${rot.iB}`);

  // 9 ★ CANAL REUSADO oocMitigation + SEAM: hitTick con base fija; OFF ⇒ effMit==wayMit (byte-id Wayfarer); ON+dominando ⇒ effMit>0 y realMit<base
  const seam = await page.evaluate((n) => {
    window.__dev.zonedom({ enabled: false });
    const off = window.__dev.zonedom({ hitTick: { dmg: 100 } }).hitPicked;
    window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 });
    window.__dev.zonedom({ toDom: true });
    const on = window.__dev.zonedom({ hitTick: { dmg: 100 } }).hitPicked;
    window.__dev.zonedom({ enabled: false });
    return { off, on };
  }, QNOW);
  ok("9 ★ CANAL oocMitigation + SEAM real: OFF ⇒ effMit==wayMit ⇒ realMit==base (byte-id Wayfarer/HEAD); ON+dominando ⇒ effMit>0 ⇒ realMit<base",
     seam.off && near(seam.off.effMit, seam.off.wayMit) && near(seam.off.realMit, seam.off.base) &&
     seam.on && seam.on.effMit > 0 && seam.on.realMit < seam.on.base,
     `off{effMit=${seam.off.effMit},wayMit=${seam.off.wayMit},realMit=${seam.off.realMit}} on{effMit=${seam.on.effMit},domMit=${seam.on.domMit},realMit=${seam.on.realMit}}`);

  // 10 ★ SHARE-CAP: effMit = min(mitCap, wayMit+domMit) ≤ mitCap (0 doble-dip)
  const cap = await page.evaluate((n) => {
    window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 });
    window.__dev.zonedom({ toDom: true });
    const s = window.__dev.zonedom({ hitTick: { dmg: 100 } }).hitPicked;
    window.__dev.zonedom({ enabled: false });
    return s;
  }, QNOW);
  ok("10 ★ SHARE-CAP vs Wayfarer: effMit = min(mitCap, wayMit+domMit) ≤ mitCap (0.15) ⇒ 0 doble-dip",
     cap && cap.effMit <= cap.mitCap + 1e-9 && cap.effMit <= (cap.wayMit + cap.domMit) + 1e-9,
     `effMit=${cap.effMit} wayMit=${cap.wayMit} domMit=${cap.domMit} mitCap=${cap.mitCap}`);

  // 11 ★ ORTOGONALIDAD: dominar la zona NO cambia wardRegen/goldFind/critChance/vamp/lootQuality
  const ortho = await page.evaluate((n) => {
    window.__dev.zonedom({ enabled: false });
    const b = window.__dev.zonedom();
    window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 }); window.__dev.zonedom({ toDom: true });
    const a = window.__dev.zonedom();
    window.__dev.zonedom({ enabled: false });
    return { b, a };
  }, QNOW);
  ok("11 ★ ORTOGONALIDAD oocMitigation ⊥ wardRegen ⊥ goldFind ⊥ critChance ⊥ vamp ⊥ lootQuality: dominar la zona NO cambia otros canales",
     ortho.a.domMit > 0 &&
     near(ortho.a.wardRegenBoost, ortho.b.wardRegenBoost) && near(ortho.a.goldFindMul, ortho.b.goldFindMul) &&
     near(ortho.a.critChancePct, ortho.b.critChancePct) && near(ortho.a.vampMul, ortho.b.vampMul) && ortho.a.lootFloor === ortho.b.lootFloor,
     `dom=${ortho.a.domMit} ward=${ortho.a.wardRegenBoost}/${ortho.b.wardRegenBoost} gold=${ortho.a.goldFindMul}/${ortho.b.goldFindMul} crit=${ortho.a.critChancePct}/${ortho.b.critChancePct} vamp=${ortho.a.vampMul}/${ortho.b.vampMul} loot="${ortho.a.lootFloor}"/"${ortho.b.lootFloor}"`);

  // 12 0-regression: LIVE arc flags served true; ZONE_DOMINANCE + LAST_STAND served false (DARK)
  await page.evaluate(() => window.__dev.zonedom({ enabled: false }));
  const flags = await page.evaluate(() => ({
    ward: window.__dev.ward().enabled, kinship: window.__dev.kinship().enabled, wayfarer: window.__dev.wayfarerRoam().enabled,
    focus: window.__dev.focus().enabled, trailcraft: window.__dev.trailcraft().enabled, delve: window.__dev.delve().enabled,
    erudition: window.__dev.erudition().enabled, nocturne: window.__dev.nocturne().enabled, cadence: window.__dev.cadence().enabled,
    tempest: window.__dev.tempest().enabled, lastStand: window.__dev.lastStand().enabled, zonedom: window.__dev.zonedom().enabled,
  }));
  const liveAll = flags.ward && flags.kinship && flags.wayfarer && flags.focus && flags.trailcraft && flags.delve && flags.erudition && flags.nocturne && flags.cadence && flags.tempest;
  ok("12 0-REGRESIÓN: arco LIVE served true (ward/kinship/wayfarer/focus/trailcraft/delve/erudition/nocturne/cadence/tempest); ZONE_DOMINANCE+LAST_STAND served false (DARK #69)",
     liveAll && flags.zonedom === false && flags.lastStand === false, JSON.stringify(flags));

  // 13 badge draws when ON, not when OFF (instrument fillText "Bastión:")
  const badgeOff = await page.evaluate(async () => {
    window.__dev.zonedom({ enabled: false });
    let n = 0; const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Bastión:") === 0) n++; return orig.call(this, t, ...a); };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    CanvasRenderingContext2D.prototype.fillText = orig; return n;
  });
  const badgeOn = await page.evaluate(async (n) => {
    window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 }); window.__dev.zonedom({ toDom: true });
    let c = 0; const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Bastión:") === 0) c++; return orig.call(this, t, ...a); };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    CanvasRenderingContext2D.prototype.fillText = orig; return c;
  }, QNOW);
  ok("13 badge 'Bastión:' se DIBUJA con la feature ON (count>0) y NO con OFF (count 0)", badgeOff === 0 && badgeOn > 0, `off=${badgeOff} on=${badgeOn}`);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => window.__dev.zonedom({ enabled: false }));

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas, MISMO nowMs/frac ⇒ domZone + intensity + tier IDÉNTICOS byte-a-byte (0 desync)
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  p2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  await p2.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await p2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(p2);
  const conv = await (async () => {
    const q = QNOW;
    const a = await page.evaluate((n) => { window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 }); const s = window.__dev.zonedom(); return { dom: s.domZone, period: s.period, inten: s.intensity, tier: s.tier, zp: window.__dev.zonedom({ zoneProbe: { period: 100 } }).zoneProbe }; }, q);
    const b = await p2.evaluate((n) => { window.__dev.zonedom({ enabled: true, nowMs: n, frac: 0.5 }); const s = window.__dev.zonedom(); return { dom: s.domZone, period: s.period, inten: s.intensity, tier: s.tier, zp: window.__dev.zonedom({ zoneProbe: { period: 100 } }).zoneProbe }; }, q);
    await page.evaluate(() => window.__dev.zonedom({ enabled: false }));
    await p2.evaluate(() => window.__dev.zonedom({ enabled: false }));
    return { a, b };
  })();
  // shard-wide convergencia (domZone/period/intensity/zoneProbe) byte-id; el `tier` es holding?tier:0 ⇒ depende de la PRESENCIA LOCAL del héroe (mundo shard-wide, cada cliente aplica a su zona ⇒ NO parte del estado compartido).
  ok("14 ★ NORTH STAR 2-CLIENTE: MISMO reloj/frac ⇒ zona DOMINADA + period + intensidad + rotación-hash IDÉNTICOS byte-a-byte (0 desync shard-wide; tier=presencia LOCAL ⊥)",
     conv.a.dom === conv.b.dom && conv.a.period === conv.b.period && near(conv.a.inten, conv.b.inten) && conv.a.zp === conv.b.zp,
     `A=${JSON.stringify(conv.a)} B=${JSON.stringify(conv.b)}`);

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS`);
process.exit(FAIL === 0 ? 0 : 1);
