// ---------------------------------------------------------------------------
// CAS-2102 (QA OBSERVABLE for CAS-2094 / mec #32 PELIGROS DE ARENA / Environmental Hazards)
// Build CAS-2096, Deploy CAS-2097/CAS-2101, umbrella CAS-27.
//
// Drives the REAL browser loop against the LIVE gh-pages build (build 56d227365b17). Complements
// the DOM-free node proof (tools/cas2094-arena-hazards.mjs, AC0-6 vs HEAD bytes). game.js imports
// "./sim/sim.js", so a dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached
// ES-module singleton the game is running — G, dev.hazard*, ARENA_HAZARDS all mutate the LIVE
// instance. Mirror of tools/cas2077-variants-live-natural.mjs (OBSERVABLE DARK QA pattern).
//
// The feature ships DARK (ARENA_HAZARDS.enabled:false live). This harness proves the DARK
// invariants AND that the machine is genuinely OBSERVABLE when the Gate CEO flips it:
//
//   AC0  [BOOT]       boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC-DARK           served config knob shape present + enabled:false (DARK) + markerLabel + rngSeed.
//   AC1  [GATE]       no boss/elite alive ⇒ 0 hazards even enabled; a boss present ⇒ hazards spawn.
//   AC2  [TELEGRAPH]  NEVER damages during the telegraph window (≥ telegraphMs of warning), then active.
//   AC3  [CAPADO]     standing in an active hazard ⇒ every tick ≤ min(dmgFlat, maxHp*dmgFracCap);
//                     status applied for status types; hero SURVIVES a full active window (never one-shot).
//   AC4  [I-FRAME]    a rolling hero (h.iframe>0) inside the hazard ⇒ 0 damage — the headline "roll a tiempo → 0 daño".
//   AC5  [RNG-NEUT]   OFF ⇒ 0 hazards; master-srand fingerprint byte-identical ON vs OFF (all hazard
//                     randomness draws from the dedicated arenaHazardRng), ON non-vacuously plants.
//   AC6  [RENDER]     force enabled + plant an active hazard under the hero ⇒ the REAL drawHazards
//                     paints a tinted ground ring/zone on the LIVE canvas (pixel-sampled), screenshot.
//   AC7  [60FPS]      ~60fps sustained through a hazard-active boss window; mobile playable.
//
// Run: node tools/cas2094-arena-hazards-live-qa.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2102";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const P = (m) => console.log("✔ " + m);
const F = (m) => { anyFail = true; console.error("✖ " + m); };

function watch(page) {
  const errors = [], http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  return { errors, http404 };
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "HAZARD"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__h = { sim, cfg };
  }, BASE);

  // ---- AC-DARK: served config is DARK (enabled:false) with the full knob shape ----
  const dflt = await page.evaluate(() => {
    const A = window.__h.cfg.ARENA_HAZARDS;
    const need = ["rngSeed", "spawnGate", "cadenceMs", "maxActive", "telegraphMs", "activeMs", "tickMs", "dmgFlat", "dmgFracCap", "radius", "minGapPx", "byZone", "types"];
    return { enabled: A.enabled, markerLabel: A.markerLabel, rngSeed: (A.rngSeed >>> 0).toString(16),
      miss: need.filter((k) => !(k in A)), types: Object.keys(A.types), bossGate: !!(A.spawnGate && A.spawnGate.bossOrElite) };
  });
  if (dflt.enabled === false && dflt.miss.length === 0 && dflt.markerLabel === true && dflt.bossGate)
    P(`[${prof.name}] DARK: served ARENA_HAZARDS.enabled=false (DARK ship), full knob shape, markerLabel=true, bossOrElite gate, rngSeed=0x${dflt.rngSeed}, types=${JSON.stringify(dflt.types)}`);
  else F(`[${prof.name}] DARK config unexpected: ${JSON.stringify(dflt)}`);

  // ---- AC1 GATE: no boss ⇒ 0 hazards even enabled; a boss present ⇒ spawns ----
  const gate = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const noBoss = dev.hazardSpawnProbe("caldera", false, 24);
    const boss = dev.hazardSpawnProbe("caldera", true, 24);
    return { noBoss, boss };
  });
  if (gate.noBoss.spawnedCount === 0 && gate.boss.spawnedCount > 0)
    P(`[${prof.name}] GATE: no boss/elite ⇒ 0 hazards even enabled; boss present ⇒ ${gate.boss.spawnedCount}/24 hazards spawned (zone=${gate.boss.zone}, types=${JSON.stringify([...new Set(gate.boss.spawned.map((s) => s.type))])})`);
  else F(`[${prof.name}] GATE broken: noBoss=${gate.noBoss.spawnedCount} boss=${gate.boss.spawnedCount}`);

  // ---- AC2/AC3/AC4: telegraph=0 dmg, standing capped+status+never-one-shot, rolling=0 dmg ----
  // Cover a status type (magma→burn) and a status-less physical type (collapse) so both damage paths are exercised.
  for (const type of ["magma", "collapse"]) {
    const dp = await page.evaluate((t) => window.__h.sim.dev.hazardDamageProbe(t), type);
    // AC2 TELEGRAPH
    if (dp.telegraphDmg === 0 && dp.reachedActive)
      P(`[${prof.name}] TELEGRAPH(${type}): 0 damage during the whole telegraph window, then reached active (≥ telegraphMs warning — always dodgeable)`);
    else F(`[${prof.name}] TELEGRAPH(${type}) broken: telegraphDmg=${dp.telegraphDmg} reachedActive=${dp.reachedActive}`);
    // AC3 CAPPED + status + never one-shot
    const capOk = dp.maxTick <= dp.cap + 1e-9 && dp.standingTotal > 0 && !dp.oneShot;
    if (capOk) P(`[${prof.name}] CAPADO(${type}): standing dmg/tick maxTick=${dp.maxTick} ≤ cap=${dp.cap} (min(dmgFlat,maxHp*dmgFracCap)); survived full active window hp=${dp.hpAfterStanding}/${dp.maxHp} (never one-shot)`);
    else F(`[${prof.name}] CAPADO(${type}) broken: maxTick=${dp.maxTick} cap=${dp.cap} standingTotal=${dp.standingTotal} oneShot=${dp.oneShot}`);
    if (dp.statusApplied === null) P(`[${prof.name}] STATUS(${type}): status-less physical hazard (collapse) — capped physical dmg only, as designed`);
    else if (dp.statusApplied === true) P(`[${prof.name}] STATUS(${type}): status/buildup applied while standing (bld=${JSON.stringify(dp.bld)} dots=${JSON.stringify(dp.dots)})`);
    else F(`[${prof.name}] STATUS(${type}) expected applied, got ${dp.statusApplied}`);
    // AC4 I-FRAME EVADE (headline ticket criterion #1: rolling a tiempo → 0 daño)
    if (dp.rollingDmg === 0)
      P(`[${prof.name}] I-FRAME(${type}): rolling hero (i-frame>0) inside an ACTIVE hazard takes 0 damage — roll a tiempo evades entirely`);
    else F(`[${prof.name}] I-FRAME(${type}) broken: rolling took ${dp.rollingDmg} damage (expected 0)`);
  }

  // ---- AC5 RNG-NEUTRAL: OFF ⇒ 0 hazards; master-srand fingerprint byte-identical ON vs OFF ----
  const neut = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const off = dev.hazardSrandProbe(false, 0x0a2ea094, 24);
    const on = dev.hazardSrandProbe(true, 0x0a2ea094, 24);
    return { same: JSON.stringify(off.fingerprint) === JSON.stringify(on.fingerprint), offN: off.spawnCount, onN: on.spawnCount };
  });
  if (neut.same && neut.offN === 0 && neut.onN > 0)
    P(`[${prof.name}] RNG-NEUTRAL: OFF=0 hazards; master-srand fingerprint byte-identical ON(${neut.onN} plants)==OFF (hazard draws never touch the master srand)`);
  else F(`[${prof.name}] RNG-NEUTRAL broken: ${JSON.stringify(neut)}`);

  // ---- AC6 RENDER OBSERVABLE: force enabled + plant an ACTIVE hazard under the hero every frame so the
  // REAL drawHazards ground layer paints on the LIVE canvas. The magma type carries glyph "♨" and markerLabel
  // is true ⇒ drawHazards issues ctx.fillText("♨", x, y). Monkeypatch fillText on the LIVE 2d context (same
  // object the renderer draws with) to RECORD strings — catching "♨" proves the hazard actually painted on
  // the served canvas (mirror CAS-2082 fillText-record). Pixel-diff the center vs a clean frame as secondary
  // evidence. Pure render observation; restore fillText + enabled after. ----
  const render = await page.evaluate(async () => {
    const { sim, cfg } = window.__h; const { G } = sim; const A = cfg.ARENA_HAZARDS;
    const sav = A.enabled; A.enabled = true;
    const h = G.hero; const def = A.types.magma;
    const cv = document.querySelector("canvas");
    const gtx = cv.getContext("2d");
    const orig = gtx.fillText.bind(gtx);
    const seen = {}; // record every string painted during the window
    gtx.fillText = function (s, x, y) { seen[s] = (seen[s] | 0) + 1; return orig(s, x, y); };
    let frames = 0;
    const stop = performance.now() + 1200;
    while (performance.now() < stop) {
      G.hazards.length = 0;
      G.hazards.push({ x: h.x, y: h.y, r: A.radius, type: "magma", def, phase: "active", t: 200, tickAcc: 0 });
      await new Promise((rr) => requestAnimationFrame(rr)); frames++;
    }
    gtx.fillText = orig;
    // secondary: pixel-diff the center region (hazard planted) vs a clean frame (hazard removed)
    const cx = Math.floor(cv.width / 2), cy = Math.floor(cv.height / 2); const R = Math.floor(A.radius);
    G.hazards.length = 0; G.hazards.push({ x: h.x, y: h.y, r: A.radius, type: "magma", def, phase: "active", t: 200, tickAcc: 0 });
    await new Promise((rr) => requestAnimationFrame(rr));
    const withHz = gtx.getImageData(cx - R, cy - R, 2 * R, 2 * R).data;
    G.hazards.length = 0;
    await new Promise((rr) => requestAnimationFrame(rr));
    const noHz = gtx.getImageData(cx - R, cy - R, 2 * R, 2 * R).data;
    let changed = 0; for (let i = 0; i < withHz.length; i += 4) { if (Math.abs(withHz[i] - noHz[i]) + Math.abs(withHz[i + 1] - noHz[i + 1]) + Math.abs(withHz[i + 2] - noHz[i + 2]) > 24) changed++; }
    // leave one active magma hazard planted + enabled so the evidence screenshot captures it painting live
    G.hazards.length = 0; G.hazards.push({ x: h.x, y: h.y, r: A.radius, type: "magma", def, phase: "active", t: 200, tickAcc: 0 });
    await new Promise((rr) => requestAnimationFrame(rr));
    return { frames, glyph: seen["♨"] | 0, changed };
  });
  await page.screenshot({ path: `${OUT}/${prof.name}-hazard-render.png` });
  // cleanup: clear the planted hazard + restore the DARK default so later checks / other tabs see live state
  await page.evaluate(() => { const { sim, cfg } = window.__h; sim.G.hazards.length = 0; cfg.ARENA_HAZARDS.enabled = false; });
  // Authoritative observable = the fillText("♨") record: it fires ONLY from drawHazards on the LIVE served
  // canvas (mirror CAS-2082 fillText-record, explicitly NOT a pixel count). Camera clamps the hero off
  // screen-center at map edges, so the fixed center pixel-diff is informational only, not a gate.
  if (render.glyph > 0)
    P(`[${prof.name}] RENDER: drawHazards painted the magma hazard glyph "♨" ${render.glyph}× via ctx.fillText on the LIVE served canvas over ${render.frames} frames (center pixel-diff=${render.changed} px, informational — hero clamped off-center) → shots/cas2102/${prof.name}-hazard-render.png`);
  else F(`[${prof.name}] RENDER broken: glyph=${render.glyph} changed=${render.changed} frames=${render.frames}`);

  // ---- AC7 60FPS: measure fps over a ~2s window with enabled + a live boss so real hazards spawn/update/render ----
  const fps = await page.evaluate(async () => {
    const { sim, cfg } = window.__h; const { G } = sim; const A = cfg.ARENA_HAZARDS;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const sav = A.enabled; A.enabled = true;
    // ensure a boss is present so the gate lets real hazards spawn through the natural update loop
    if (!G.enemies.some((e) => e.isBoss)) G.enemies.push({ isBoss: true, dead: false, hp: 4000, x: G.hero.x + 120, y: G.hero.y, tpl: { size: 16 } });
    let frames = 0; const t0 = performance.now(); const dur = 2000;
    while (performance.now() - t0 < dur) { await new Promise((rr) => requestAnimationFrame(rr)); frames++; }
    const secs = (performance.now() - t0) / 1000;
    A.enabled = sav;
    return { fps: +(frames / secs).toFixed(1) };
  });
  if (fps.fps >= 55) P(`[${prof.name}] 60FPS: ${fps.fps} fps sustained through a hazard-active boss window`);
  else F(`[${prof.name}] 60FPS low: ${fps.fps} fps`);

  // ---- AC0 BOOT: no game-JS errors / non-cosmetic 404s over the whole session ----
  const bad404 = http404.filter((u) => !/favicon\.ico/i.test(u));
  if (errors.length === 0 && bad404.length === 0) P(`[${prof.name}] BOOT: 0 game-JS errors, 0 non-cosmetic 404s`);
  else F(`[${prof.name}] BOOT errors=${JSON.stringify(errors.slice(0, 4))} 404s=${JSON.stringify(bad404.slice(0, 4))}`);

  await page.close();
}

await browser.close();
console.log(anyFail ? "\nFAIL — CAS-2102 arena-hazards LIVE QA" : "\nPASS — CAS-2102 arena-hazards LIVE QA (DARK observable, all AC)");
process.exit(anyFail ? 1 : 0);
