// CAS-2251 QA — LIVE OBSERVABLE FULL-STACK regression: ambient + navegación + SANTUARIO + HOME-TEMPLE RESPAWN,
// all shipped and ON at once, against the LIVE gh-pages URL (the ONLY URL players use). This is the FIRST
// combined observable playtest AFTER the CAS-2247 Home-Temple Respawn flip (build ebe58686c12f). Production now
// runs the WHOLE stack simultaneously:
//   weather (rain/fog) + day/night + lamp glow + minimap/M-map POIs + ZONE/REGION BANNER + City Safe Zone/Santuario
//   + HOME-TEMPLE RESPAWN (die → reaparecer en el Templo de la Ciudad dentro de la SAFEZONE, regen cura tras respawn).
// Merges the CAS-2246 combined harness (byte-verify + safezone regen phases + zone banner pixel proof + weather +
// day/night + minimap + core loop + determinism + perf + mobile) with the CAS-2248 respawn probes (land EXACTLY at
// the city Templo POI, determinism 0-RNG, cohesive die→home→recover loop). The 6 features must COEXIST with 0
// regression, 0 drift, 0 fps loss. Crash/desync = sev-1.
//
// Usage: node tools/cas2251-fullstack-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "ebe58686c12f";
const TS = 32;
const OUT = join(ROOT, "shots", "cas2251");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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
  await sleep(400);
}
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}${Date.now()}`;
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
    // ---- 0. served byte-verify (module-graph consistency, anti CAS-2220) + flags ----
    const vjson = await (await fetch(`${LIVE}/version.json?cb=${Date.now()}`)).json().catch(() => ({}));
    report.build = vjson.build;
    check(`0.1 LIVE build == ${EXPECT_BUILD}`, vjson.build === EXPECT_BUILD, { got: vjson.build });
    const cfg = await fetchServed("sim/config.js");
    const rnd = await fetchServed("render/render.js");
    check("0.2 served config.js byte-id to HEAD (all-flags consistent overlay)", cfg.md5 === HEAD_CONFIG_MD5, { served: cfg.md5, head: HEAD_CONFIG_MD5 });
    check("0.3 served render.js byte-id to HEAD (respawn/safezone/zone/weather/daynight gates present, anti CAS-2220 drift)", rnd.md5 === HEAD_RENDER_MD5, { served: rnd.md5, head: HEAD_RENDER_MD5 });
    const flagPage = await browser.newPage();
    await flagPage.goto(`${LIVE}/?dev=1&cb=flags${EXPECT_BUILD}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const flags = await flagPage.evaluate(async (base) => {
      const c = await import(base + "/sim/config.js?cb=flg" + Date.now());
      const pick = (o) => o ? { enabled: o.enabled } : null;
      return {
        TEMPLE_RESPAWN: c.TEMPLE_RESPAWN && { enabled: c.TEMPLE_RESPAWN.enabled, offsetY: c.TEMPLE_RESPAWN.offsetY },
        SAFEZONE: c.SAFEZONE && { enabled: c.SAFEZONE.enabled, regenPct: c.SAFEZONE.regenPct, templeMul: c.SAFEZONE.templeMul, templeRadius: c.SAFEZONE.templeRadius, regenDelay: c.SAFEZONE.regenDelay, cityMargin: c.SAFEZONE.cityMargin },
        ZONE_BANNER: c.ZONE_BANNER && { enabled: c.ZONE_BANNER.enabled, anchorY: c.ZONE_BANNER.anchorY, cityLabel: c.ZONE_BANNER.cityLabel },
        WEATHER: pick(c.WEATHER), DAYNIGHT: pick(c.DAYNIGHT), MINIMAP: pick(c.MINIMAP), DOORS_INTERIORS: pick(c.DOORS_INTERIORS) };
    }, LIVE);
    await flagPage.close();
    report.flags = flags;
    check("0.4 served TEMPLE_RESPAWN.enabled:true (respawn LIVE — the newest flip under test)", flags.TEMPLE_RESPAWN?.enabled === true, flags.TEMPLE_RESPAWN);
    check("0.5 served SAFEZONE.enabled:true (santuario LIVE)", flags.SAFEZONE?.enabled === true, flags.SAFEZONE);
    check("0.6 served ZONE_BANNER.enabled:true (banner LIVE)", flags.ZONE_BANNER?.enabled === true, flags.ZONE_BANNER);
    check("0.7 served WEATHER+DAYNIGHT+MINIMAP all enabled:true (ambient stack LIVE)", flags.WEATHER?.enabled && flags.DAYNIGHT?.enabled && flags.MINIMAP?.enabled, flags);
    check("0.8 served DOORS_INTERIORS.enabled:false (doors DARK — expected inert)", flags.DOORS_INTERIORS?.enabled === false, flags.DOORS_INTERIORS);

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
    const build = await page.evaluate(() => window.__BUILD || null);
    check("1.1 boot → world reached, build matches, 0 pageerror (anti-CAS-2220 black-screen)", (await page.evaluate(() => __dev.scene())) === "play" && build === EXPECT_BUILD && errs.length === 0, { build, errs: errs.slice(0, 3) });

    const dn = (arg) => page.evaluate((a) => window.__dev.daynight(a), arg);
    const w = (arg) => page.evaluate((a) => window.__dev.weather(a), arg);
    const z = (arg) => page.evaluate((a) => window.__dev.zone(a), arg);
    const sz = (arg) => page.evaluate((a) => window.__dev.safeZone(a), arg ?? null);
    const tr = (arg) => page.evaluate((a) => window.__dev.templeRespawn(a), arg ?? null);
    const tp = (tx, ty) => page.evaluate((x, y) => window.__dev.tp(x, y), tx, ty);
    const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));

    const fp0 = await fp();

    // neutral baseline: noon + clear + banner cleared
    await dn({ enabled: true, phase: 0.5 }); await w({ enabled: true, phase: 0.0 }); await z(null); await sleep(200);
    await page.screenshot({ path: join(OUT, "01-baseline-noon-clear.png") });

    // ---- 2. HOME-TEMPLE RESPAWN (CAS-2247/2248) OBSERVABLE — the newest LIVE flip ----
    const trLive = await tr();
    report.desk.respawn = { enabled: trLive.enabled, point: trLive.point, nearTemple: trLive.nearTemple, inSafeZone: trLive.inSafeZone, distToTemple: trLive.distToTemple };
    check("2.1 templeRespawn().enabled === true LIVE (on-disk flip, not in-memory) + home point derives from city Templo POI",
      trLive.enabled === true && trLive.point && trLive.nearTemple === true && trLive.inSafeZone === true, report.desk.respawn);
    const r1 = await tr({ respawn: true });
    const landOk = r1.hero && r1.point && dist(r1.hero, r1.point) < 1;
    report.desk.respawn.land1 = { hero: r1.hero, point: r1.point };
    check("2.2 die → respawn aterriza EXACTO en el Templo de la Ciudad (inSafeZone + nearTemple)",
      landOk && r1.nearTemple && r1.inSafeZone, { hero: r1.hero, point: r1.point, near: r1.nearTemple, inZone: r1.inSafeZone });
    const r2 = await tr({ respawn: true });
    check("2.3 determinismo: 2ª muerte aterriza en el MISMO punto (0 RNG, MMO-consistente)",
      r2.hero && r1.hero && dist(r1.hero, r2.hero) < 0.01, { p1: r1.hero, p2: r2.hero });
    // cohesive loop: die → home → recover HP via SAFEZONE ×templeMul at the landing
    const cohesive = await page.evaluate(async () => {
      const s0 = window.__dev.safeZone({ setHp: 90, pause: 0 }); const hp0 = s0.hp;
      await new Promise(r => setTimeout(r, 1300));
      const s1 = window.__dev.safeZone();
      return { hp0, hp1: s1.hp, nearTemple: s1.nearTemple, templeMul: s1.templeMul, ratePctPerSec: s1.ratePctPerSec };
    });
    report.desk.respawn.cohesive = cohesive;
    check("2.4 loop cohesivo: tras respawn el HP se cura en el Templo (santuario ×templeMul)",
      cohesive.hp1 > cohesive.hp0 && cohesive.nearTemple === true, { hp0: cohesive.hp0, hp1: +cohesive.hp1.toFixed(1), near: cohesive.nearTemple, mul: cohesive.templeMul });
    await page.screenshot({ path: join(OUT, "02-hero-at-temple-post-respawn.png") });

    // ---- 3. SAFEZONE / SANTUARIO (CAS-2242/2243) OBSERVABLE — regen inside/outside/temple/pause ----
    const szGeom = await sz();
    report.desk.safezone = { geom: { bbox: szGeom.bbox, temple: szGeom.temple, enabled: szGeom.enabled, cityMargin: szGeom.cityMargin, templeRadius: szGeom.templeRadius } };
    check("3.1 SAFEZONE __dev.safeZone() reporta enabled:true LIVE + bbox ciudad deriva de POIs", szGeom.enabled === true && Array.isArray(szGeom.bbox) && szGeom.temple, szGeom);
    await tp(2, 2); await sleep(150);
    const outState = await sz({ setHp: 30, pause: 0 });
    const o0 = (await sz()).hp; await sleep(1400); const o1 = (await sz()).hp;
    report.desk.safezone.outside = { inZone: outState.inZone, o0, o1 };
    check("3.2 SAFEZONE FUERA de la ciudad ⇒ inZone false + HP NO regenera (gate bbox)", outState.inZone === false && Math.abs(o1 - o0) < 0.5, { inZone: outState.inZone, o0, o1 });
    const cx = (szGeom.bbox[0] + szGeom.bbox[2]) / 2, cy = (szGeom.bbox[1] + szGeom.bbox[3]) / 2;
    await tp(cx / TS, cy / TS); await sleep(150);
    const inState = await sz({ setHp: 30, pause: 0 });
    const i0 = (await sz()).hp; await sleep(1600); const i1 = (await sz()).hp;
    report.desk.safezone.inside = { inZone: inState.inZone, ratePctPerSec: inState.ratePctPerSec, i0, i1 };
    check("3.3 SAFEZONE DENTRO de la ciudad ⇒ inZone true + HP regenera", inState.inZone === true && (i1 - i0) > 1, { inZone: inState.inZone, i0, i1: +i1.toFixed(1) });
    await tp(szGeom.temple.x / TS, szGeom.temple.y / TS); await sleep(150);
    const tState = await sz({ setHp: 30, pause: 0 });
    const t0 = (await sz()).hp; await sleep(1600); const t1 = (await sz()).hp;
    report.desk.safezone.temple = { nearTemple: tState.nearTemple, ratePctPerSec: tState.ratePctPerSec, t0, t1 };
    check("3.4 SAFEZONE cerca del Templo ⇒ acelerado ×templeMul (rate y ganancia > llano)",
      tState.nearTemple === true && tState.ratePctPerSec > inState.ratePctPerSec + 0.001 && (t1 - t0) > (i1 - i0) + 0.4,
      { templeRate: tState.ratePctPerSec, plainRate: inState.ratePctPerSec, templeGain: +(t1 - t0).toFixed(1), plainGain: +(i1 - i0).toFixed(1) });
    await tp(cx / TS, cy / TS); await sleep(150);
    await sz({ setHp: 30, pause: 1.5 });
    const p0 = (await sz()).hp; await sleep(800); const p1 = (await sz()).hp;
    await sleep(1500); const p2 = (await sz()).hp;
    report.desk.safezone.pause = { p0, p1, p2 };
    check("3.5 SAFEZONE regen PAUSADO tras daño y luego REANUDA (gate regenDelay)", (p1 - p0) < 0.6 && (p2 - p1) > 1, { p0, p1: +p1.toFixed(1), p2: +p2.toFixed(1) });
    await sz({ setHp: 100, pause: 0 });

    // ---- 4. ZONE / REGION BANNER (CAS-2234/2236) OBSERVABLE ----
    const zState = await z();
    report.desk.zone = { enabled: zState.enabled };
    const regionNames = (zState.regions || []).map((r) => r.name).sort();
    const expectRegions = ["Ciudad", "Depósito", "Parque", "Taberna", "Templo"];
    check("4.1 ZONE __dev.zone() enabled:true + 5 regiones derivan de POIs", zState.enabled === true && regionNames.length === 5 && expectRegions.every((n) => regionNames.includes(n)), { regionNames });
    await page.evaluate(() => { try { window.__dev.tutSkip && window.__dev.tutSkip(); } catch (e) {} });
    await dn({ enabled: true, phase: 0.5 }); await w({ enabled: true, phase: 0.0 }); await z(null); await sleep(150);
    const gBefore = await goldBands(page);
    await z("Templo"); await sleep(650);
    const forcedFull = await z();
    const gAfter = await goldBands(page);
    await page.screenshot({ path: join(OUT, "03-zone-banner-templo.png") });
    report.desk.zone.forced = forcedFull.banner; report.desk.zone.gBefore = gBefore; report.desk.zone.gAfter = gAfter;
    check("4.2 ZONE banner forzado activo, fade-in llega a alpha≈1", forcedFull.banner && forcedFull.banner.name === "Templo" && forcedFull.banner.alpha > 0.9, forcedFull.banner);
    check("4.3 ZONE OBSERVABLE banner dibuja título dorado en la banda SUPERIOR", gAfter.top > gBefore.top + 120, { before: gBefore.top, after: gAfter.top });
    check("4.4 ZONE readability: el centro de acción NO se tapa", Math.abs(gAfter.centre - gBefore.centre) < 120, { before: gBefore.centre, after: gAfter.centre });
    const cityB = await z({ name: "Ciudad", sub: "Zona segura" }).catch((e) => ({ err: String(e) })); await sleep(400);
    check("4.5 ZONE banner Ciudad con subtítulo 'Zona segura' sin error (estilo Tibia)", cityB.banner && cityB.banner.sub === "Zona segura", cityB.banner);
    await z(null); await sleep(100);
    check("4.6 ZONE zone(null) limpia el banner sin throw", (await z()).banner === null, {});

    // ---- 5. WEATHER cycle ----
    const clear = await w({ enabled: true, phase: 0.0 }); await sleep(150); const pClear = await probe(page);
    const rain = await w({ enabled: true, phase: 0.28 }); await sleep(200); const pRain = await probe(page);
    await page.screenshot({ path: join(OUT, "04-rain.png") });
    const fog = await w({ enabled: true, phase: 0.70 }); await sleep(200); const pFog = await probe(page);
    report.desk.weather = { clear, rain, fog, pClear, pRain, pFog };
    check("5.1 weather cicla clear→rain→fog vía override", clear.state === "clear" && rain.state === "rain" && fog.state === "fog", { c: clear.state, r: rain.state, f: fog.state });
    check("5.2 lluvia más oscura+azul que clear (veil)", pRain.lum < pClear.lum - 0.5 && pRain.blueLift > pClear.blueLift, { pClear, pRain });
    check("5.3 rain pool capeado ≤140 (perf, 0 drift)", rain.drops <= 140 && rain.drops > 0, { drops: rain.drops });
    check("5.4 niebla centro legible (combate no negro)", pFog.centreLum > 12, { centreLum: pFog.centreLum });

    // ---- 6. DAY/NIGHT + lamp glow ----
    await w({ enabled: true, phase: 0.0 });
    const noon = await dn({ enabled: true, phase: 0.5 }); await sleep(200); const pNoon = await probe(page);
    const night = await dn({ enabled: true, phase: 0.0 }); await sleep(200); const pNight = await probe(page);
    await page.screenshot({ path: join(OUT, "05-night.png") });
    report.desk.daynight = { noon, night, pNoon, pNight };
    check("6.1 noche más oscura que mediodía (tinte ambiental)", pNight.lum < pNoon.lum - 1, { noon: pNoon.lum, night: pNight.lum });
    check("6.2 farolas presentes desde deco (capa lamp glow)", (night.lamps || noon.lamps) >= 1, { lamps: night.lamps });

    // ---- 7. COMBINED: night + rain + banner + sanctuary + respawn (the actual LIVE stack) ----
    await dn({ enabled: true, phase: 0.0 }); const nAlone = await probe(page);
    await w({ enabled: true, phase: 0.28 }); await sleep(250); const nRain = await probe(page);
    await z("Templo"); await sleep(200);
    const szCombined = await sz();
    // respawn under the FULL ambient stack still lands at temple + safezone
    const rCombined = await tr({ respawn: true });
    await page.screenshot({ path: join(OUT, "06-night-rain-banner-sanctuary-respawn.png") });
    await z(null);
    report.desk.combined = { nightAlone: nAlone, nightRain: nRain, safeZoneStillOn: szCombined.enabled, respawnLandOk: rCombined.hero && rCombined.point && dist(rCombined.hero, rCombined.point) < 1 };
    check("7.1 noche+lluvia: el velo COMPONE sobre la noche (capas apilan → +azul)", nRain.blueLift > nAlone.blueLift + 1, { nAloneBlue: nAlone.blueLift, nRainBlue: nRain.blueLift });
    check("7.2 noche+lluvia centro legible (peor-caso ambiental)", nRain.centreLum > 8, { centreLum: nRain.centreLum });
    check("7.3 SAFEZONE coexiste con todo el stack ambiental (enabled true bajo noche+lluvia+banner)", szCombined.enabled === true, { enabled: szCombined.enabled });
    check("7.4 RESPAWN coexiste con el stack: die bajo noche+lluvia+banner aterriza EXACTO en el Templo (sin drift/desync)",
      rCombined.hero && rCombined.point && dist(rCombined.hero, rCombined.point) < 1 && rCombined.nearTemple && rCombined.inSafeZone,
      { hero: rCombined.hero, point: rCombined.point, near: rCombined.nearTemple, inZone: rCombined.inSafeZone });

    await w({ enabled: true, phase: 0.0 }); await dn({ enabled: true, phase: 0.5 }); await sleep(150);

    // ---- 8. MINIMAP + M big-map POIs ----
    // move hero to city-centre first: section 7.4 respawns onto the Templo, and the player marker dot would
    // otherwise occlude the Templo POI blip on the big-map (a test-sequence artifact, not a render regression).
    await tp(cx / TS, cy / TS); await sleep(150);
    await key(page, "KeyM"); await sleep(450);
    const bigProbe = await probeColors(page);
    await page.screenshot({ path: join(OUT, "07-worldmap-M.png") });
    await key(page, "KeyM"); await sleep(200);
    report.desk.map = { bigProbe };
    check("8.1 M big-map dibuja los 4 POIs de ciudad", Object.keys(POI).every((k) => bigProbe[k] > 0), bigProbe);

    // ---- 9. CITY door layer inert (DOORS DARK) ----
    const doors = await page.evaluate(() => (window.__dev.doorList ? window.__dev.doorList() : [])).catch(() => []);
    report.desk.doorCount = doors.length;
    check("9.1 door layer inerte en LIVE sin error (DOORS DARK)", Array.isArray(doors) && doors.length === 0, { doorCount: doors.length });

    // ---- 10. CORE LOOP: movement + combat ----
    for (const c of ["KeyD", "KeyS"]) { await key(page, c); await sleep(180); await keyUp(page, c); }
    await page.evaluate(async () => { const d = window.__dev; try { d.spawn && d.spawn("skeleton", 40, 0); } catch (e) {} await new Promise(r => setTimeout(r, 120)); }).catch(() => {});
    for (let i = 0; i < 8; i++) { await key(page, "Space"); await sleep(90); await keyUp(page, "Space"); }
    await sleep(300);
    await page.screenshot({ path: join(OUT, "08-combat.png") });
    check("10.1 movimiento + combate corre sin error (core loop intacto)", errs.length === 0, { errs: errs.slice(0, 3) });

    // ---- 11. DETERMINISM (incl. an in-memory TEMPLE_RESPAWN toggle round-trip) ----
    const fpToggle = await page.evaluate(() => {
      const j = () => JSON.stringify(window.__dev.worldFingerprint(1234));
      const a = j(); window.__dev.templeRespawn({ enabled: false }); const b = j();
      window.__dev.templeRespawn({ enabled: true }); const c = j();
      return { ab: a === b, ac: a === c };
    });
    const fp1 = await fp();
    check("11.1 worldFingerprint byte-estable tras ciclo completo (ambient+zone+safezone+respawn, 0 sim/save drift)", fp0 === fp1, { same: fp0 === fp1, fp0: fp0.slice(0, 40), fp1: fp1.slice(0, 40) });
    check("11.2 worldFingerprint byte-estable ante toggle TEMPLE_RESPAWN (render-neutral)", fpToggle.ab && fpToggle.ac, fpToggle);

    // ---- 12. PERF sustained + no leak (night+rain+banner+sanctuary worst case) ----
    await dn({ enabled: true, phase: 0.0 }); await w({ enabled: true, phase: 0.28 }); await z("Templo");
    const heapBefore = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    const fpsSustain = [];
    for (let i = 0; i < 4; i++) { fpsSustain.push(await measFps(page, 2500)); await sleep(200); }
    const heapAfter = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
    const fpsMin = Math.min(...fpsSustain), fpsMax = Math.max(...fpsSustain);
    const sorted = [...fpsSustain].sort((a, b) => a - b);
    const fpsMed = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1);
    report.desk.fps = { samples: fpsSustain, min: fpsMin, max: fpsMax, median: fpsMed, heapBefore, heapAfter };
    check("12.1 desktop 60fps sostenido bajo noche+lluvia+banner+santuario (mediana ≥58, max ≥59, piso ≥45)", fpsMed >= 58 && fpsMax >= 59 && fpsMin >= 45, { samples: fpsSustain, median: fpsMed });
    check("12.2 sin fuga de heap tras run sostenido (<40% growth)", heapBefore === 0 || (heapAfter - heapBefore) / heapBefore < 0.4, { heapBefore, heapAfter });

    check("12.3 0 JS pageerror en run desktop completo", errs.length === 0, { errs });
    const benign404 = req404.filter((u) => !/favicon/i.test(u));
    check("12.4 sin 404 no-benigno (favicon excluido)", benign404.length === 0, { req404 });
    report.desk.errors = errs; report.desk.req404 = req404;

    // ================= MOBILE / TOUCH =================
    const mp = await browser.newPage();
    await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    const merrs = []; mp.on("pageerror", (e) => merrs.push(String(e))); mp.on("console", (m) => { if (m.type() === "error" && !isResourceNoise(m.text())) merrs.push(m.text()); });
    await mp.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
    await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(mp);
    check("M1 mobile boota a play, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", { merrs });

    // touch move via left-half virtual stick (proven CAS-2242/2248 pattern)
    const mBefore = await mp.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
    await mp.evaluate(() => {
      const c = document.getElementById("c") || document.querySelector("canvas");
      window.dispatchEvent(new Event("touchstart", { bubbles: true }));
      const r = c.getBoundingClientRect();
      window.__qaStick = { x0: r.left + r.width * 0.15, y0: r.top + r.height * 0.72 };
      const s = window.__qaStick;
      c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0, clientY: s.y0, bubbles: true, cancelable: true }));
    });
    const mMove = (type, dx) => mp.evaluate((type, dx) => {
      const c = document.getElementById("c") || document.querySelector("canvas");
      const s = window.__qaStick;
      c.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: s.x0 + dx, clientY: s.y0, bubbles: true, cancelable: true }));
    }, type, dx);
    for (let i = 1; i <= 14; i++) { await mMove("pointermove", i * 6); await sleep(28); }
    await mMove("pointerup", 84); await sleep(200);
    const mAfter = await mp.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
    check("M2 mobile touch stick MUEVE al héroe", dist(mBefore, mAfter) > 5, { delta: +dist(mBefore, mAfter).toFixed(1) });

    // mobile: full stack ON, sanctuary regen + home-temple respawn
    const mGeom = await mp.evaluate(() => window.__dev.safeZone());
    await mp.evaluate((cx, cy, TS) => window.__dev.tp(cx / TS, cy / TS), (mGeom.bbox[0] + mGeom.bbox[2]) / 2, (mGeom.bbox[1] + mGeom.bbox[3]) / 2, TS);
    await mp.evaluate(() => { window.__dev.daynight({ enabled: true, phase: 0.0 }); window.__dev.weather({ enabled: true, phase: 0.28 }); window.__dev.zone("Templo"); window.__dev.safeZone({ setHp: 30, pause: 0 }); });
    const mHp0 = await mp.evaluate(() => window.__dev.safeZone().hp); await sleep(1500); const mHp1 = await mp.evaluate(() => window.__dev.safeZone().hp);
    check("M3 mobile SAFEZONE regenera dentro de la ciudad bajo stack completo", (mHp1 - mHp0) > 1, { mHp0, mHp1: +mHp1.toFixed(1) });
    const mRes = await mp.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    check("M4 mobile die → respawn aterriza EXACTO en el Templo (inSafeZone + nearTemple)",
      mRes.hero && mRes.point && dist(mRes.hero, mRes.point) < 1 && mRes.nearTemple && mRes.inSafeZone,
      { hero: mRes.hero, near: mRes.nearTemple, inZone: mRes.inSafeZone });
    const mFps = await measFps(mp, 2500);
    await mp.screenshot({ path: join(OUT, "09-mobile-fullstack-respawn.png") });
    report.mobile = { fps: mFps, scene: await mp.evaluate(() => window.__dev.scene()), errs: merrs, sanctuaryGain: +(mHp1 - mHp0).toFixed(1) };
    check("M5 mobile fps estable (≥50 — DPR-capped)", mFps >= 50, { mFps });
    check("M6 mobile run sin error", merrs.length === 0, { merrs });

    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }

  // ---- summary ----
  let pass = 0;
  console.log("\n===== CAS-2251 FULL-STACK LIVE QA (ambient + nav + SANCTUARY + HOME-TEMPLE RESPAWN) =====");
  for (const [label, ok, detail] of A) { console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : "  " + JSON.stringify(detail)}`); if (ok) pass++; }
  console.log(`\n${pass}/${A.length} checks passed  (build ${report.build}, deskFps ${JSON.stringify(report.desk.fps?.samples)}, mobFps ${report.mobile.fps})`);
  process.exit(pass === A.length ? 0 : 1);
})();
