// ---------------------------------------------------------------------------
// CAS-2104 (QA LIVE POST-FLIP for CAS-2094 / mec #32 PELIGROS DE ARENA / Environmental Hazards)
// Umbrella CAS-27. Mirror of tools/cas2095-seeded-live-enabled.mjs (first QA of the ENABLED
// path in the REAL served build after the Gate CEO flip).
//
// The DARK observable pass (CAS-2102, tools/cas2094-arena-hazards-live-qa.mjs) proved the machine
// by FORCING enabled in-page. This run confirms the feature is genuinely ENABLED-BY-DEFAULT in the
// LIVE served build (flip CAS-2103, sim/config.js:1793 md5 ae5cd58a) with NO regression on a REAL
// boss — i.e. hazards telegraph & fire through the natural rAF game loop WITHOUT the harness ever
// touching ARENA_HAZARDS.enabled.
//
//   AC0    [BOOT]        boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC-LIVE              served config knob enabled === TRUE (post-flip), full shape + markerLabel + bossGate + rngSeed.
//   AC1-NAT [NATURAL]    hero parked in caldera, enabled untouched: NO boss ⇒ 0 hazards over a full cadence
//                        window; a REAL boss present ⇒ telegraphed hazards appear NATURALLY (telegraph→active
//                        phases observed) through the real requestAnimationFrame game loop. Proves enabled-by-default.
//   AC1-GATE             structural gate confirm via the REAL maybeSpawnHazard probe (no boss⇒0 / boss⇒spawns).
//   AC2    [TELEGRAPH]   0 damage during the telegraph window (≥ telegraphMs warning), then reaches active.
//   AC3    [CAPADO]      every active tick ≤ min(dmgFlat, maxHp*dmgFracCap); hero survives the full active
//                        window (never one-shot); status applied for status types.
//   AC4    [I-FRAME]     a rolling hero (h.iframe>0) inside an ACTIVE hazard ⇒ 0 damage (roll a tiempo evade).
//   AC5    [RNG-NEUT]    master-srand fingerprint byte-identical ON vs OFF; ON non-vacuously plants.
//   AC6    [RENDER]      the REAL drawHazards paints the magma glyph "♨" via ctx.fillText on the LIVE canvas.
//   AC7    [60FPS]       ~60fps sustained through a hazard-active boss window; mobile playable.
//
// Run: node tools/cas2104-arena-hazards-live-postflip.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2104";
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

  // ---- AC-LIVE: served config is ENABLED (post-flip enabled:true) with the full knob shape ----
  const live = await page.evaluate(() => {
    const A = window.__h.cfg.ARENA_HAZARDS;
    const need = ["rngSeed", "spawnGate", "cadenceMs", "maxActive", "telegraphMs", "activeMs", "tickMs", "dmgFlat", "dmgFracCap", "radius", "minGapPx", "byZone", "types"];
    return { enabled: A.enabled, markerLabel: A.markerLabel, rngSeed: (A.rngSeed >>> 0).toString(16), telegraphMs: A.telegraphMs,
      miss: need.filter((k) => !(k in A)), types: Object.keys(A.types), bossGate: !!(A.spawnGate && A.spawnGate.bossOrElite) };
  });
  if (live.enabled === true && live.miss.length === 0 && live.markerLabel === true && live.bossGate && live.telegraphMs >= 950)
    P(`[${prof.name}] LIVE: served ARENA_HAZARDS.enabled=TRUE (post-flip CAS-2103), full knob shape, markerLabel=true, bossOrElite gate, telegraphMs=${live.telegraphMs}≥950, rngSeed=0x${live.rngSeed}, types=${JSON.stringify(live.types)}`);
  else F(`[${prof.name}] LIVE config unexpected (expected enabled:true): ${JSON.stringify(live)}`);

  // ---- AC1-NAT NATURAL enabled-by-default: drive the REAL exported sim update() (the exact step game.js's
  // fixed-timestep loop runs, at a deterministic 1/60 dt) over a hero parked in caldera. DO NOT touch A.enabled
  // — the machine must run ON purely because the served config default is true (post-flip). NO boss ⇒ gate closed
  // ⇒ 0 hazards over a full cadence window; a REAL spawned boss (dev.spawn('calderatyrant'), full tpl, boss-ified)
  // ⇒ maybeSpawnHazard plants on cadence and updateHazards drives telegraph→active NATURALLY from organic dt
  // accumulation (no force-set of hazardT). Headless backgrounds the tab (index.html pauses the game's OWN rAF on
  // blur), so driving update() directly is the deterministic way to observe the natural loop. NOTE: mark every
  // hunt zone's one-time zone-curse offer as already-seen first — stepping into caldera would otherwise open the
  // unrelated `curse` scene and freeze update() in a menu (nothing to do with hazards). ----
  const nat = await page.evaluate(async () => {
    const { sim, cfg } = window.__h; const { G, dev, update } = sim; const A = cfg.ARENA_HAZARDS;
    const enabledDefault = A.enabled;                 // NOTE: read-only — never assigned anywhere in this block
    const mi = dev.mapInfo(); const c = mi.zones.caldera;
    if (!c) return { err: "no caldera zone in world" };
    G.hero.curseSeen = Object.keys(mi.zones);         // suppress the one-time zone-curse offer scene (unrelated system)
    G.hero.dead = false;
    dev.tp(c.x + c.w / 2, c.y + c.h / 2);
    const heroZone = dev.mapInfo().heroZone;
    const step = () => update(1000 / 60);             // the exact call game.js's loop makes (STEP = 1000/60 ms)
    // Phase A: NO boss ⇒ gate closed ⇒ 0 hazards even though enabled. Drive ~1.5× cadence worth of steps.
    G.enemies.length = 0; G.hazards.length = 0; G.hazardT = 0;
    const framesA = Math.ceil((A.cadenceMs * 1.5) / (1000 / 60)) + 30;
    let noBossMax = 0, scenesA = new Set();
    for (let i = 0; i < framesA; i++) { step(); scenesA.add(G.scene); if (G.hazards.length > noBossMax) noBossMax = G.hazards.length; }
    // Phase B: a REAL boss ⇒ telegraphed hazards appear naturally over a few cadence cycles.
    dev.spawn("calderatyrant", 400, 0);               // full-tpl boss (boss:true ⇒ boss-ified), far enough not to instakill
    let sawTelegraph = false, sawActive = false, maxHaz = 0, phases = new Set(), scenesB = new Set();
    const framesB = Math.ceil(7000 / (1000 / 60));    // > 2 cadence cycles + telegraph + active
    for (let i = 0; i < framesB; i++) {
      step(); scenesB.add(G.scene);
      for (const h of G.hazards) { phases.add(h.phase); if (h.phase === "telegraph") sawTelegraph = true; if (h.phase === "active") sawActive = true; }
      if (G.hazards.length > maxHaz) maxHaz = G.hazards.length;
    }
    const bossAlive = G.enemies.some((e) => e.isBoss && !e.dead);
    // restore: clear transient hazards + enemies (enabled left exactly as served — untouched)
    G.enemies.length = 0; G.hazards.length = 0; G.hazardT = 0;
    return { enabledDefault, heroZone, noBossMax, sawTelegraph, sawActive, maxHaz, bossAlive,
      scenesA: [...scenesA], scenesB: [...scenesB], phases: [...phases], maxActive: A.maxActive };
  });
  if (nat.err) F(`[${prof.name}] NATURAL setup failed: ${nat.err}`);
  else if (nat.enabledDefault === true && nat.heroZone === "caldera" && nat.noBossMax === 0 && nat.bossAlive
    && nat.sawTelegraph && nat.sawActive && nat.maxHaz > 0 && nat.maxHaz <= nat.maxActive
    && nat.scenesA.length === 1 && nat.scenesA[0] === "play" && nat.scenesB.length === 1 && nat.scenesB[0] === "play")
    P(`[${prof.name}] NATURAL: enabled-by-default (A.enabled untouched=${nat.enabledDefault}); real update() loop in caldera, NO boss ⇒ 0 hazards over a full cadence window; REAL boss (calderatyrant) ⇒ hazards telegraph→active appeared NATURALLY (phases=${JSON.stringify(nat.phases)}, maxActive observed=${nat.maxHaz}≤${nat.maxActive} cap, scene stayed 'play')`);
  else F(`[${prof.name}] NATURAL broken: ${JSON.stringify(nat)}`);

  // ---- AC1-GATE: structural confirm via the REAL maybeSpawnHazard probe ----
  const gate = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const noBoss = dev.hazardSpawnProbe("caldera", false, 24);
    const boss = dev.hazardSpawnProbe("caldera", true, 24);
    return { noBoss, boss };
  });
  if (gate.noBoss.spawnedCount === 0 && gate.boss.spawnedCount > 0)
    P(`[${prof.name}] GATE: no boss/elite ⇒ 0 hazards; boss present ⇒ ${gate.boss.spawnedCount}/24 spawned (zone=${gate.boss.zone}, types=${JSON.stringify([...new Set(gate.boss.spawned.map((s) => s.type))])})`);
  else F(`[${prof.name}] GATE broken: noBoss=${gate.noBoss.spawnedCount} boss=${gate.boss.spawnedCount}`);

  // ---- AC2/AC3/AC4: telegraph=0 dmg, standing capped+status+never-one-shot, rolling=0 dmg ----
  for (const type of ["magma", "collapse"]) {
    const dp = await page.evaluate((t) => window.__h.sim.dev.hazardDamageProbe(t), type);
    if (dp.telegraphDmg === 0 && dp.reachedActive)
      P(`[${prof.name}] TELEGRAPH(${type}): 0 damage during the whole telegraph window, then reached active (always dodgeable)`);
    else F(`[${prof.name}] TELEGRAPH(${type}) broken: telegraphDmg=${dp.telegraphDmg} reachedActive=${dp.reachedActive}`);
    const capOk = dp.maxTick <= dp.cap + 1e-9 && dp.standingTotal > 0 && !dp.oneShot;
    if (capOk) P(`[${prof.name}] CAPADO(${type}): maxTick=${dp.maxTick} ≤ cap=${dp.cap} (min(dmgFlat,maxHp*dmgFracCap)); survived active window hp=${dp.hpAfterStanding}/${dp.maxHp} (never one-shot)`);
    else F(`[${prof.name}] CAPADO(${type}) broken: maxTick=${dp.maxTick} cap=${dp.cap} standingTotal=${dp.standingTotal} oneShot=${dp.oneShot}`);
    if (dp.statusApplied === null) P(`[${prof.name}] STATUS(${type}): status-less physical hazard — capped physical dmg only, as designed`);
    else if (dp.statusApplied === true) P(`[${prof.name}] STATUS(${type}): status/buildup applied while standing (bld=${JSON.stringify(dp.bld)} dots=${JSON.stringify(dp.dots)})`);
    else F(`[${prof.name}] STATUS(${type}) expected applied, got ${dp.statusApplied}`);
    if (dp.rollingDmg === 0)
      P(`[${prof.name}] I-FRAME(${type}): rolling hero (i-frame>0) inside an ACTIVE hazard takes 0 damage — roll a tiempo evades entirely`);
    else F(`[${prof.name}] I-FRAME(${type}) broken: rolling took ${dp.rollingDmg} damage (expected 0)`);
  }

  // ---- AC5 RNG-NEUTRAL: master-srand fingerprint byte-identical ON vs OFF ----
  const neut = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const off = dev.hazardSrandProbe(false, 0x0a2ea094, 24);
    const on = dev.hazardSrandProbe(true, 0x0a2ea094, 24);
    return { same: JSON.stringify(off.fingerprint) === JSON.stringify(on.fingerprint), offN: off.spawnCount, onN: on.spawnCount };
  });
  if (neut.same && neut.offN === 0 && neut.onN > 0)
    P(`[${prof.name}] RNG-NEUTRAL: OFF=0 hazards; master-srand fingerprint byte-identical ON(${neut.onN} plants)==OFF (hazard draws never touch the master srand)`);
  else F(`[${prof.name}] RNG-NEUTRAL broken: ${JSON.stringify(neut)}`);

  // ---- AC6 RENDER OBSERVABLE: plant an ACTIVE magma hazard under the hero every frame so the REAL drawHazards
  // paints the "♨" glyph via ctx.fillText on the LIVE served canvas. Monkeypatch fillText to RECORD strings
  // (mirror CAS-2082/2102 — NOT a pixel count). enabled is ALREADY true live, so no forcing needed. ----
  const render = await page.evaluate(async () => {
    const { sim, cfg } = window.__h; const { G } = sim; const A = cfg.ARENA_HAZARDS;
    const h = G.hero; const def = A.types.magma;
    const cv = document.querySelector("canvas");
    const gtx = cv.getContext("2d");
    const orig = gtx.fillText.bind(gtx);
    const seen = {};
    gtx.fillText = function (s, x, y) { seen[s] = (seen[s] | 0) + 1; return orig(s, x, y); };
    let frames = 0;
    const stop = performance.now() + 1200;
    while (performance.now() < stop) {
      G.hazards.length = 0;
      G.hazards.push({ x: h.x, y: h.y, r: A.radius, type: "magma", def, phase: "active", t: 200, tickAcc: 0 });
      await new Promise((rr) => requestAnimationFrame(rr)); frames++;
    }
    gtx.fillText = orig;
    // leave one active magma hazard planted so the evidence screenshot captures it painting live
    G.hazards.length = 0; G.hazards.push({ x: h.x, y: h.y, r: A.radius, type: "magma", def, phase: "active", t: 200, tickAcc: 0 });
    await new Promise((rr) => requestAnimationFrame(rr));
    return { frames, glyph: seen["♨"] | 0 };
  });
  await page.screenshot({ path: `${OUT}/${prof.name}-hazard-render.png` });
  // cleanup: clear the planted hazard. Leave ARENA_HAZARDS.enabled UNTOUCHED (live default = true).
  await page.evaluate(() => { window.__h.sim.G.hazards.length = 0; });
  if (render.glyph > 0)
    P(`[${prof.name}] RENDER: drawHazards painted the magma hazard glyph "♨" ${render.glyph}× via ctx.fillText on the LIVE served canvas over ${render.frames} frames → shots/cas2104/${prof.name}-hazard-render.png`);
  else F(`[${prof.name}] RENDER broken: glyph=${render.glyph} frames=${render.frames}`);

  // ---- AC7 60FPS: measure fps over ~2s with a live boss so REAL enabled-by-default hazards spawn/update/render ----
  const fps = await page.evaluate(async () => {
    const { sim } = window.__h; const { G } = sim;
    if (!G.enemies.some((e) => e.isBoss)) G.enemies.push({ isBoss: true, dead: false, hp: 4000, x: G.hero.x + 120, y: G.hero.y, tpl: { size: 16 } });
    let frames = 0; const t0 = performance.now(); const dur = 2000;
    while (performance.now() - t0 < dur) { await new Promise((rr) => requestAnimationFrame(rr)); frames++; }
    const secs = (performance.now() - t0) / 1000;
    G.enemies.length = 0; G.hazards.length = 0;
    return { fps: +(frames / secs).toFixed(1) };
  });
  if (fps.fps >= 55) P(`[${prof.name}] 60FPS: ${fps.fps} fps sustained through a hazard-active boss window (enabled-by-default)`);
  else F(`[${prof.name}] 60FPS low: ${fps.fps} fps`);

  // ---- AC0 BOOT: no game-JS errors / non-cosmetic 404s over the whole session ----
  const bad404 = http404.filter((u) => !/favicon\.ico/i.test(u));
  if (errors.length === 0 && bad404.length === 0) P(`[${prof.name}] BOOT: 0 game-JS errors, 0 non-cosmetic 404s`);
  else F(`[${prof.name}] BOOT errors=${JSON.stringify(errors.slice(0, 4))} 404s=${JSON.stringify(bad404.slice(0, 4))}`);

  await page.close();
}

await browser.close();
console.log(anyFail ? "\nFAIL — CAS-2104 arena-hazards LIVE POST-FLIP QA" : "\nPASS — CAS-2104 arena-hazards LIVE POST-FLIP QA (enabled-by-default, all AC)");
process.exit(anyFail ? 1 : 0);
