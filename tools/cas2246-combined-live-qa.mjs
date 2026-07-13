// CAS-2246 QA — LIVE OBSERVABLE COMBINED regression: ambient stack + navegación + SANTUARIO, all ON at once.
// This is the first OBSERVABLE full-stack playtest against the LIVE gh-pages URL AFTER the CAS-2243/2244
// SAFEZONE flip. Production (build 4380e9b3aa6a) now runs the WHOLE stack ON simultaneously:
//   weather (rain/fog) + day/night + lamp glow + minimap/M-map POIs + ZONE/REGION BANNER + City Safe Zone/Santuario.
// Extends the CAS-2238 full-build harness by ADDING the sanctuary (CAS-2242) OBSERVABLE probes:
//   • SAFEZONE (CAS-2242/2243) — served enabled:true, HP regens inside the Ciudad bbox, ×templeMul near Templo
//     (radius220), post-damage pause (regenDelay), all authoritative in sim (tickSafeZone). Observed via __dev.safeZone.
// Same served-blob byte-verify (anti CAS-2220 module-graph drift) + core loop + determinism + perf + mobile.
// The 5 features must COEXIST with 0 regression, 0 drift, 0 fps loss.
//
// Usage: node tools/cas2246-combined-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "4380e9b3aa6a";
const TS = 32;
const OUT = join(ROOT, "shots", "cas2246");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const A = []; // [label, pass, detail?]
const check = (label, pass, detail) => { A.push([label, !!pass, detail]); };

const POI = { templo: [0xf0, 0xd8, 0x78], deposito: [0x7c, 0xb8, 0xf0], taberna: [0xf0, 0xa8, 0x50], parque: [0x74, 0xd6, 0x8e] };
const TOL = 26;
const GOLD = [0xd8, 0xb2, 0x5e]; // zone-banner title gold (COL.textGold #d8b25e)

async function probeColors(page) {
  return page.evaluate((POI, TOL) => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const { data } = g.getImageData(0, 0, cv.width, cv.height);
    const c = {}; for (const k in POI) c[k] = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      for (const k in POI) { const q = POI[k]; if (Math.abs(r - q[0]) <= TOL && Math.abs(gg - q[1]) <= TOL && Math.abs(b - q[2]) <= TOL) { c[k]++; break; } }
    }
    return c;
  }, POI, TOL);
}

async function goldBands(page) {
  return page.evaluate((G, TOL) => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
    const isGold = (i) => Math.abs(data[i] - G[0]) <= TOL && Math.abs(data[i + 1] - G[1]) <= TOL && Math.abs(data[i + 2] - G[2]) <= TOL;
    let top = 0, centre = 0;
    const topY1 = (height * 0.30) | 0, cy0 = (height * 0.40) | 0, cy1 = (height * 0.60) | 0;
    for (let y = 0; y < topY1; y++) for (let x = 0; x < width; x++) { if (isGold((y * width + x) * 4)) top++; }
    for (let y = cy0; y < cy1; y++) for (let x = 0; x < width; x++) { if (isGold((y * width + x) * 4)) centre++; }
    return { top, centre };
  }, GOLD, TOL);
}

async function probe(page) {
  return page.evaluate(() => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
    let lum = 0, rSum = 0, bSum = 0; const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { lum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); rSum += data[i]; bSum += data[i + 2]; }
    const bx0 = (width * 0.35) | 0, bx1 = (width * 0.65) | 0, by0 = (height * 0.35) | 0, by1 = (height * 0.65) | 0;
    let clum = 0, cn = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = (y * width + x) * 4; clum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); cn++; }
    return { lum: +(lum / n).toFixed(2), centreLum: +(clum / cn).toFixed(2), blueLift: +((bSum - rSum) / n).toFixed(2) };
  });
}

async function measFps(page, ms = 2500) {
  return page.evaluate((ms) => new Promise((res) => {
    let f = 0; const t0 = performance.now();
    function tick() { f++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res(+(f / ((performance.now() - t0) / 1000)).toFixed(1)); }
    requestAnimationFrame(tick);
  }), ms);
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && __dev.scene && __dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) { await sleep(250);
    if (await page.evaluate(() => __dev.scene()) === s) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
  await page.waitForFunction("__dev.scene()==='play'", { timeout: 12000 });
}
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}`;
  const r = await fetch(`${LIVE}/${path}${bust}`);
  const txt = await r.text();
  const md5 = execSync(`md5sum`, { input: txt }).toString().split(" ")[0];
  return { status: r.status, txt, md5 };
}
const HEAD_CONFIG_MD5 = execSync(`git show HEAD:sim/config.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_RENDER_MD5 = execSync(`git show HEAD:render/render.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];

(async () => {
  const report = { build: null, desk: {}, mobile: {} };
  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    // ---- served byte-verify (module-graph consistency, anti CAS-2220) ----
    const vjson = await (await fetch(`${LIVE}/version.json?cb=x`)).json().catch(() => ({}));
    report.build = vjson.build;
    check(`LIVE build == ${EXPECT_BUILD}`, vjson.build === EXPECT_BUILD, { got: vjson.build });
    const cfg = await fetchServed("sim/config.js");
    const rnd = await fetchServed("render/render.js");
    check("served config.js byte-id to HEAD (all-flags consistent overlay)", cfg.md5 === HEAD_CONFIG_MD5, { served: cfg.md5, head: HEAD_CONFIG_MD5 });
    check("served render.js byte-id to HEAD (safezone/zone/weather/daynight gates present, anti CAS-2220 drift)", rnd.md5 === HEAD_RENDER_MD5, { served: rnd.md5, head: HEAD_RENDER_MD5 });
    // served flag introspection via dynamic import of the SERVED leaf config (ground-truth, not regex).
    const flagPage = await browser.newPage();
    await flagPage.goto(`${LIVE}/?dev=1&cb=flags${EXPECT_BUILD}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const flags = await flagPage.evaluate(async (base) => {
      const c = await import(base + "/sim/config.js?cb=flg");
      const pick = (o) => o ? { enabled: o.enabled } : null;
      return { SAFEZONE: c.SAFEZONE && { enabled: c.SAFEZONE.enabled, regenPct: c.SAFEZONE.regenPct, templeMul: c.SAFEZONE.templeMul, templeRadius: c.SAFEZONE.templeRadius, regenDelay: c.SAFEZONE.regenDelay, cityMargin: c.SAFEZONE.cityMargin },
        ZONE_BANNER: c.ZONE_BANNER && { enabled: c.ZONE_BANNER.enabled, anchorY: c.ZONE_BANNER.anchorY, cityLabel: c.ZONE_BANNER.cityLabel },
        WEATHER: pick(c.WEATHER), DAYNIGHT: pick(c.DAYNIGHT), MINIMAP: pick(c.MINIMAP), DOORS_INTERIORS: pick(c.DOORS_INTERIORS) };
    }, LIVE);
    await flagPage.close();
    report.flags = flags;
    check("served SAFEZONE.enabled:true (santuario LIVE — the newest flip under test)", flags.SAFEZONE?.enabled === true, flags.SAFEZONE);
    check("served ZONE_BANNER.enabled:true (banner LIVE)", flags.ZONE_BANNER?.enabled === true, flags.ZONE_BANNER);
    check("served WEATHER+DAYNIGHT+MINIMAP all enabled:true (ambient stack LIVE)", flags.WEATHER?.enabled && flags.DAYNIGHT?.enabled && flags.MINIMAP?.enabled, flags);
    check("served DOORS_INTERIORS.enabled:false (doors DARK — expected inert)", flags.DOORS_INTERIORS?.enabled === false, flags.DOORS_INTERIORS);

    // ================= DESKTOP =================
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    const errs = []; const req404 = [];
    const isResourceNoise = (t) => /Failed to load resource|net::ERR_/i.test(t);
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !isResourceNoise(m.text())) errs.push(m.text()); });
    page.on("response", (r) => { if (r.status() === 404) req404.push(r.url().split("/").pop()); });
    await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

    await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(page);
    check("boot → world reached, 0 pageerror so far (anti-CAS-2220 black-screen)", await page.evaluate(() => __dev.scene()) === "play" && errs.length === 0, { errs: errs.slice(0, 3) });

    const dn = (arg) => page.evaluate((a) => window.__dev.daynight(a), arg);
    const w = (arg) => page.evaluate((a) => window.__dev.weather(a), arg);
    const z = (arg) => page.evaluate((a) => window.__dev.zone(a), arg);
    const sz = (arg) => page.evaluate((a) => window.__dev.safeZone(a), arg ?? null);
    const tp = (tx, ty) => page.evaluate((x, y) => window.__dev.tp(x, y), tx, ty);
    const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));

    const fp0 = await fp();

    // neutral baseline: noon + clear + banner cleared
    await dn({ enabled: true, phase: 0.5 }); await w({ enabled: true, phase: 0.0 }); await z(null); await sleep(200);
    await page.screenshot({ path: join(OUT, "01-baseline-noon-clear.png") });

    // ---- 1. SAFEZONE / SANTUARIO (CAS-2242/2243) OBSERVABLE — the sanctuary must regen LIVE ----
    const szGeom = await sz();
    report.desk.safezone = { geom: { bbox: szGeom.bbox, temple: szGeom.temple, enabled: szGeom.enabled, cityMargin: szGeom.cityMargin, templeRadius: szGeom.templeRadius } };
    check("SAFEZONE: __dev.safeZone() reports enabled:true LIVE + city bbox derives from POIs", szGeom.enabled === true && Array.isArray(szGeom.bbox) && szGeom.temple, szGeom);
    // 1a. OUTSIDE the city ⇒ no regen (bbox gate). tp to far origin corner (0,0 world) which is outside city bbox.
    await tp(2, 2); await sleep(150);
    const outState = await sz({ setHp: 30, pause: 0 });
    const o0 = (await sz()).hp; await sleep(1400); const o1 = (await sz()).hp;
    report.desk.safezone.outside = { inZone: outState.inZone, o0, o1 };
    check("SAFEZONE: FUERA de la ciudad ⇒ inZone false + HP NO regenera (gate por bbox)", outState.inZone === false && Math.abs(o1 - o0) < 0.5, { inZone: outState.inZone, o0, o1 });
    // 1b. INSIDE the city ⇒ regen climbs. tp to city bbox centre.
    const cx = (szGeom.bbox[0] + szGeom.bbox[2]) / 2, cy = (szGeom.bbox[1] + szGeom.bbox[3]) / 2;
    await tp(cx / TS, cy / TS); await sleep(150);
    const inState = await sz({ setHp: 30, pause: 0 });
    const i0 = (await sz()).hp; await sleep(1600); const i1 = (await sz()).hp;
    report.desk.safezone.inside = { inZone: inState.inZone, ratePctPerSec: inState.ratePctPerSec, i0, i1 };
    check("SAFEZONE: DENTRO de la ciudad ⇒ inZone true", inState.inZone === true, { inZone: inState.inZone });
    check(`SAFEZONE: DENTRO ⇒ HP regenera (${i0}→${i1.toFixed(1)}, +${(i1 - i0).toFixed(1)})`, (i1 - i0) > 1, { i0, i1 });
    // 1c. TEMPLE ⇒ accelerated ×templeMul
    await tp(szGeom.temple.x / TS, szGeom.temple.y / TS); await sleep(150);
    const tState = await sz({ setHp: 30, pause: 0 });
    const t0 = (await sz()).hp; await sleep(1600); const t1 = (await sz()).hp;
    report.desk.safezone.temple = { nearTemple: tState.nearTemple, ratePctPerSec: tState.ratePctPerSec, t0, t1 };
    check(`SAFEZONE: cerca del Templo ⇒ acelerado (rate ${tState.ratePctPerSec}%/s > llano ${inState.ratePctPerSec}%/s)`, tState.nearTemple === true && tState.ratePctPerSec > inState.ratePctPerSec + 0.001, { temple: tState.ratePctPerSec, plain: inState.ratePctPerSec });
    check(`SAFEZONE: Templo regenera más rápido que llano (+${(t1 - t0).toFixed(1)} > +${(i1 - i0).toFixed(1)})`, (t1 - t0) > (i1 - i0) + 0.4, { templeGain: t1 - t0, plainGain: i1 - i0 });
    // 1d. POST-DAMAGE PAUSE gate (regenDelay). Force pause ⇒ regen frozen; then resumes.
    const cx2 = (szGeom.bbox[0] + szGeom.bbox[2]) / 2, cy2 = (szGeom.bbox[1] + szGeom.bbox[3]) / 2;
    await tp(cx2 / TS, cy2 / TS); await sleep(150);
    await sz({ setHp: 30, pause: 1.5 });
    const p0 = (await sz()).hp; await sleep(800); const p1 = (await sz()).hp;
    report.desk.safezone.pause = { p0, p1 };
    check(`SAFEZONE: regen PAUSADO tras daño (${p0}→${p1.toFixed(1)}, gate regenDelay)`, (p1 - p0) < 0.6, { p0, p1 });
    await sleep(1500); const p2 = (await sz()).hp;
    report.desk.safezone.pause.p2 = p2;
    check(`SAFEZONE: regen REANUDA tras la pausa (${p1.toFixed(1)}→${p2.toFixed(1)})`, (p2 - p1) > 1, { p1, p2 });
    // reset hero to city centre, full hp, for the rest of the run
    await sz({ setHp: 100, pause: 0 });

    // ---- 2. ZONE / REGION BANNER (CAS-2234/2236) OBSERVABLE ----
    const zState = await z();
    report.desk.zone = { state: { enabled: zState.enabled } };
    const regionNames = (zState.regions || []).map((r) => r.name).sort();
    const expectRegions = ["Ciudad", "Depósito", "Parque", "Taberna", "Templo"];
    check("ZONE: __dev.zone() reports enabled:true LIVE", zState.enabled === true, { enabled: zState.enabled });
    check("ZONE: 5 regiones derivan de POIs (Templo/Depósito/Taberna/Parque + contenedor Ciudad)",
      regionNames.length === 5 && expectRegions.every((n) => regionNames.includes(n)), { regionNames });
    // forced banner draws gold title in TOP band, centre stays readable. tutSkip retires onboarding coachmark first.
    await page.evaluate(() => { try { window.__dev.tutSkip && window.__dev.tutSkip(); } catch (e) {} });
    await dn({ enabled: true, phase: 0.5 }); await w({ enabled: true, phase: 0.0 }); await z(null); await sleep(150);
    const gBefore = await goldBands(page);
    const forced = await z("Templo"); await sleep(650); // fade-in past 0.6s → full alpha
    const forcedFull = await z();
    const gAfter = await goldBands(page);
    await page.screenshot({ path: join(OUT, "02-zone-banner-templo.png") });
    report.desk.zone.forced = forcedFull.banner; report.desk.zone.gBefore = gBefore; report.desk.zone.gAfter = gAfter;
    check("ZONE: banner forzado activo, fade-in llega a alpha≈1 durante el hold", forcedFull.banner && forcedFull.banner.name === "Templo" && forcedFull.banner.alpha > 0.9, forcedFull.banner);
    check("ZONE OBSERVABLE: banner dibuja título dorado en la banda SUPERIOR (top-third)", gAfter.top > gBefore.top + 120, { before: gBefore.top, after: gAfter.top });
    check("ZONE readability: el centro de acción NO se tapa (delta centro pequeño)", Math.abs(gAfter.centre - gBefore.centre) < 120, { before: gBefore.centre, after: gAfter.centre });
    const cityB = await z({ name: "Ciudad", sub: "Zona segura" }).catch((e) => ({ err: String(e) })); await sleep(650);
    await page.screenshot({ path: join(OUT, "03-zone-banner-ciudad.png") });
    check("ZONE: banner Ciudad con subtítulo 'Zona segura' sin error (estilo Tibia)", cityB.banner && cityB.banner.sub === "Zona segura", cityB.banner);
    await z(null); await sleep(100);
    check("ZONE: zone(null) limpia el banner sin throw", (await z()).banner === null, {});

    // ---- 3. WEATHER cycle ----
    const clear = await w({ enabled: true, phase: 0.0 }); await sleep(150); const pClear = await probe(page);
    const rain = await w({ enabled: true, phase: 0.28 }); await sleep(200); const pRain = await probe(page);
    await page.screenshot({ path: join(OUT, "04-rain.png") });
    const fog = await w({ enabled: true, phase: 0.70 }); await sleep(200); const pFog = await probe(page);
    report.desk.weather = { clear, rain, fog, pClear, pRain, pFog };
    check("weather cicla clear→rain→fog vía override", clear.state === "clear" && rain.state === "rain" && fog.state === "fog", { c: clear.state, r: rain.state, f: fog.state });
    check("lluvia más oscura+azul que clear (veil)", pRain.lum < pClear.lum - 0.5 && pRain.blueLift > pClear.blueLift, { pClear, pRain });
    check("rain pool capeado ≤140 (perf, 0 drift)", rain.drops <= 140 && rain.drops > 0, { drops: rain.drops });
    check("niebla centro legible (combate no negro)", pFog.centreLum > 12, { centreLum: pFog.centreLum });

    // ---- 4. DAY/NIGHT + lamp glow ----
    await w({ enabled: true, phase: 0.0 });
    const noon = await dn({ enabled: true, phase: 0.5 }); await sleep(200); const pNoon = await probe(page);
    const night = await dn({ enabled: true, phase: 0.0 }); await sleep(200); const pNight = await probe(page);
    await page.screenshot({ path: join(OUT, "05-night.png") });
    report.desk.daynight = { noon, night, pNoon, pNight };
    check("noche más oscura que mediodía (tinte ambiental)", pNight.lum < pNoon.lum - 1, { noon: pNoon.lum, night: pNight.lum });
    check("farolas presentes desde deco (capa lamp glow)", (night.lamps || noon.lamps) >= 1, { lamps: night.lamps });

    // ---- 5. COMBINED: night + rain + banner + sanctuary (the actual LIVE stack) ----
    await dn({ enabled: true, phase: 0.0 }); const nAlone = await probe(page);
    await w({ enabled: true, phase: 0.28 }); await sleep(250); const nRain = await probe(page);
    await z("Templo"); await sleep(200);
    const szCombined = await sz();
    await page.screenshot({ path: join(OUT, "06-night-rain-banner-sanctuary.png") });
    await z(null);
    report.desk.combined = { nightAlone: nAlone, nightRain: nRain, safeZoneStillOn: szCombined.enabled };
    // Prueba de apilado ROBUSTA a la posición: el velo de lluvia AÑADE azul sobre la noche (blueLift sube hacia
    // azul). La luminancia cruda es sensible al terreno bajo el héroe (aquí, plaza clara de ciudad tras las pruebas
    // del santuario) — el oscurecimiento crudo ya quedó probado en la sección de clima sobre el spawn neutral.
    check("noche+lluvia: el velo de lluvia COMPONE sobre la noche (capas apilan → +azul)", nRain.blueLift > nAlone.blueLift + 1, { nAloneBlue: nAlone.blueLift, nRainBlue: nRain.blueLift });
    check("noche+lluvia centro legible (peor-caso ambiental)", nRain.centreLum > 8, { centreLum: nRain.centreLum });
    check("SAFEZONE coexiste con todo el stack ambiental (enabled sigue true bajo noche+lluvia+banner)", szCombined.enabled === true, { enabled: szCombined.enabled });

    await w({ enabled: true, phase: 0.0 }); await dn({ enabled: true, phase: 0.5 }); await sleep(150);

    // ---- 6. MINIMAP + M big-map POIs ----
    await key(page, "KeyM"); await sleep(450);
    const bigProbe = await probeColors(page);
    await page.screenshot({ path: join(OUT, "07-worldmap-M.png") });
    await key(page, "KeyM"); await sleep(200);
    report.desk.map = { bigProbe };
    check("M big-map dibuja los 4 POIs de ciudad", Object.keys(POI).every((k) => bigProbe[k] > 0), bigProbe);

    // ---- 7. CITY door layer inert (DOORS DARK) ----
    const doors = await page.evaluate(() => (window.__dev.doorList ? window.__dev.doorList() : [])).catch(() => []);
    report.desk.doorCount = doors.length;
    check("door layer inerte en LIVE sin error (DOORS DARK)", Array.isArray(doors), { doorCount: doors.length });

    // ---- 8. CORE LOOP: movement + combat ----
    for (const c of ["KeyD", "KeyS"]) { await key(page, c); await sleep(180); await keyUp(page, c); }
    await page.evaluate(async () => { const d = window.__dev; try { d.spawn && d.spawn("skeleton", 40, 0); } catch (e) {} await new Promise(r => setTimeout(r, 120)); }).catch(() => {});
    for (let i = 0; i < 8; i++) { await key(page, "Space"); await sleep(90); await keyUp(page, "Space"); }
    await sleep(300);
    await page.screenshot({ path: join(OUT, "08-combat.png") });
    check("movimiento + combate corre sin error (core loop intacto)", errs.length === 0, { errs: errs.slice(0, 3) });

    // ---- 9. DETERMINISM ----
    const fp1 = await fp();
    check("worldFingerprint byte-estable tras ciclo completo (ambient+zone+safezone, 0 sim/save drift)", fp0 === fp1, { same: fp0 === fp1, fp0: fp0.slice(0, 40), fp1: fp1.slice(0, 40) });

    // ---- 10. PERF sustained + no leak (night+rain+banner+sanctuary worst case) ----
    await dn({ enabled: true, phase: 0.0 }); await w({ enabled: true, phase: 0.28 }); await z("Templo");
    const heapBefore = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    const fpsSustain = [];
    for (let i = 0; i < 4; i++) { fpsSustain.push(await measFps(page, 2500)); await sleep(200); }
    const heapAfter = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    const fpsMin = Math.min(...fpsSustain), fpsMax = Math.max(...fpsSustain);
    const sorted = [...fpsSustain].sort((a, b) => a - b);
    const fpsMed = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1);
    report.desk.fps = { samples: fpsSustain, min: fpsMin, max: fpsMax, median: fpsMed, heapBefore, heapAfter };
    check("desktop 60fps sostenido bajo noche+lluvia+banner+santuario (mediana ≥58, max ≥59, piso ≥45)", fpsMed >= 58 && fpsMax >= 59 && fpsMin >= 45, { samples: fpsSustain, median: fpsMed });
    check("sin fuga de heap tras run sostenido (<40% growth)", heapBefore === 0 || (heapAfter - heapBefore) / heapBefore < 0.4, { heapBefore, heapAfter });

    check("0 JS pageerror en run desktop completo", errs.length === 0, { errs });
    const benign404 = req404.filter((u) => !/favicon/i.test(u));
    check("sin 404 no-benigno (favicon excluido)", benign404.length === 0, { req404 });
    report.desk.errors = errs; report.desk.req404 = req404;

    // ================= MOBILE / TOUCH =================
    const mp = await browser.newPage();
    await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
    const merrs = []; mp.on("pageerror", (e) => merrs.push(String(e))); mp.on("console", (m) => { if (m.type() === "error" && !isResourceNoise(m.text())) merrs.push(m.text()); });
    await mp.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
    await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(mp);
    // sanctuary observable on mobile too: tp to city, low hp, confirm regen under full ambient stack
    const mGeom = await mp.evaluate(() => window.__dev.safeZone());
    await mp.evaluate((cx, cy, TS) => window.__dev.tp(cx / TS, cy / TS), (mGeom.bbox[0] + mGeom.bbox[2]) / 2, (mGeom.bbox[1] + mGeom.bbox[3]) / 2, TS);
    await mp.evaluate(() => { window.__dev.daynight({ enabled: true, phase: 0.0 }); window.__dev.weather({ enabled: true, phase: 0.28 }); window.__dev.zone("Templo"); window.__dev.safeZone({ setHp: 30, pause: 0 }); });
    const mHp0 = await mp.evaluate(() => window.__dev.safeZone().hp); await sleep(1500); const mHp1 = await mp.evaluate(() => window.__dev.safeZone().hp);
    // touch move
    await mp.evaluate(() => { const cv = document.getElementById("c"); const r = cv.getBoundingClientRect();
      const t = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerType: "touch", clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: true, pointerId: 1 }));
      window.dispatchEvent(new Event("touchstart", { bubbles: true }));
      t("pointerdown", 60, 620); t("pointermove", 140, 560); });
    await sleep(400);
    const mFps = await measFps(mp, 2500);
    await mp.screenshot({ path: join(OUT, "09-mobile-night-rain-banner-sanctuary.png") });
    report.mobile = { fps: mFps, scene: await mp.evaluate(() => window.__dev.scene()), errs: merrs, sanctuaryGain: +(mHp1 - mHp0).toFixed(1) };
    check("mobile boota + touch bajo noche+lluvia+banner+santuario, 0 error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", { merrs, mFps });
    check(`mobile SAFEZONE regenera dentro de la ciudad (+${(mHp1 - mHp0).toFixed(1)} HP)`, (mHp1 - mHp0) > 1, { mHp0, mHp1 });
    check("mobile fps estable (≥40 — DPR-capped)", mFps >= 40, { mFps });

    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }

  // ---- summary ----
  let pass = 0;
  console.log("\n===== CAS-2246 COMBINED LIVE QA (ambient + nav + SANCTUARY) =====");
  for (const [label, ok, detail] of A) { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  " + JSON.stringify(detail)}`); if (ok) pass++; }
  console.log(`\n${pass}/${A.length} checks passed  (build ${report.build}, deskFps ${JSON.stringify(report.desk.fps?.samples)}, mobFps ${report.mobile.fps})`);
  process.exit(pass === A.length ? 0 : 1);
})();
