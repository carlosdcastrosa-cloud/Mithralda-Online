// CAS-2254 QA — LIVE POST-FLIP OBSERVABLE of the CITY SANCTUARY NO-AGGRO (Tibia protection-zone), against the LIVE
// gh-pages URL (the ONLY URL players use, board directive CAS-412). Closes the loop for CAS-2250: CAS-2253 flipped
// SAFEZONE.noAggro:false→true LIVE (build fe7a817c2335). Unlike the DARK harness (cas2250-noaggro-qa.mjs, which A/B
// flipped the sub-flag IN-MEMORY), this proves the gate is ON *by default* from the SERVED config — no __dev override.
//
// What "no-aggro" means: inside the SAFEZONE (same world.deco POIs + cityMargin bbox that already drives regen CAS-2242
// / banner CAS-2234), monsters (a) NEVER acquire a player target and (b) if they were chasing a hero who steps INTO the
// zone, they leash/disengage at the border. Outside the zone the hero is aggro-able exactly as before (no PvE regression).
// Server-authoritative-ready: the gate is a pure function of static geometry (safeZoneGeom, memoized) + the hero position
// — 0 RNG, deterministic, identical for N shard players; no client can force aggro inside the zone.
//
// Phases:
//   0. served byte-verify: build == fe7a817c2335, config/game/render byte-id to HEAD, SAFEZONE.enabled:true+noAggro:true,
//      render.js 0 noAggro refs (pure sim, $0 art), 0 non-benign 404.
//   1. boot clean to play, __BUILD match, __dev.noAggro hook present, 0 pageerror.
//   2. LIVE DEFAULT-ON (on-disk, NOT in-memory): noAggro===true; hero in-zone, a fresh idle mob NEVER acquires.
//   3. LIVE DEFAULT-ON leash: a mob already CHASING disengages to idle at the border — incl. a PERMANENT hostile.
//   4. OFF == HEAD proof: flip noAggro:false in-memory ⇒ mob acquires+engages (the gate is real, not a silent no-op).
//   5. OUTSIDE the zone (default gate ON): hero out of bbox ⇒ mob acquires+engages (PvE combat intact al salir).
//   6. determinism: worldFingerprint byte-stable across the toggle; repeat acquire-gate ⇒ identical (pure geometry).
//   7. full-stack regression: served ambient/nav/santuario/home-temple-respawn flags ON; respawn lands at Templo in
//      safezone; santuario regen heals; movement+combat core loop runs; no-aggro coexists with the whole live stack.
//   8. perf: desktop 60fps sustained with feature ON; 0 non-benign 404.
//   9. mobile/touch: default-ON no-aggro holds; touch-move works; santuario regen; fps stable; 0 err.
// Usage: node tools/cas2254-noaggro-live-qa.mjs [liveBaseUrl]
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "fe7a817c2335";
const TS = 32;
const OUT = join(ROOT, "shots", "cas2254");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const A = []; // [label, pass, detail?]
const check = (label, pass, detail) => { A.push([label, !!pass, detail]); };
const ENGAGED = (s) => s === "chase" || s === "windup" || s === "strike" || s === "recover";
const IDLE = (s) => s === "idle" || s === "wander";

async function fetchServed(path) {
  const bust = `?cb=${path.replace(/\W/g, "")}${Date.now()}`;
  const r = await fetch(`${LIVE}/${path}${bust}`);
  const txt = await r.text();
  const md5 = execSync(`md5sum`, { input: txt }).toString().split(" ")[0];
  return { status: r.status, txt, md5 };
}
const HEAD_CONFIG_MD5 = execSync(`git show HEAD:sim/config.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_RENDER_MD5 = execSync(`git show HEAD:render/render.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];
const HEAD_GAME_MD5 = execSync(`git show HEAD:game.js | md5sum`, { cwd: ROOT }).toString().split(" ")[0];

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

// tp the hero to the temple POI (world px → tile), settle, return the safe-zone snapshot
async function toTemple(page) {
  return page.evaluate(async () => {
    const sz = window.__dev.safeZone();
    const t = sz.temple; window.__dev.tp(t.x / 32, t.y / 32);
    await new Promise((r) => setTimeout(r, 150));
    return window.__dev.safeZone();
  });
}

(async () => {
  const report = { build: null, served: {}, desk: {}, mobile: {} };
  // ---------- Phase 0: served byte-verify (no browser) ----------
  const vjson = await (await fetch(`${LIVE}/version.json?cb=${Date.now()}`)).json().catch(() => ({}));
  report.build = vjson.build;
  check(`0.1 LIVE build == ${EXPECT_BUILD} (CAS-2253 flip deployed)`, vjson.build === EXPECT_BUILD, { got: vjson.build });
  const cfg = await fetchServed("sim/config.js");
  const rnd = await fetchServed("render/render.js");
  const gme = await fetchServed("game.js");
  report.served = { config: cfg.md5, render: rnd.md5, game: gme.md5, headConfig: HEAD_CONFIG_MD5, headRender: HEAD_RENDER_MD5, headGame: HEAD_GAME_MD5 };
  check("0.2 served config.js byte-id to HEAD", cfg.md5 === HEAD_CONFIG_MD5, report.served);
  check("0.3 served render.js byte-id to HEAD (anti CAS-2220 drift)", rnd.md5 === HEAD_RENDER_MD5, { served: rnd.md5, head: HEAD_RENDER_MD5 });
  check("0.4 served game.js byte-id to HEAD (noAggro __dev whitelist ships)", gme.md5 === HEAD_GAME_MD5, { served: gme.md5, head: HEAD_GAME_MD5 });
  const mEnabled = cfg.txt.match(/SAFEZONE\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
  const mNoAggro = cfg.txt.match(/SAFEZONE\s*=\s*\{[\s\S]*?noAggro:\s*(true|false)/);
  check("0.5 served SAFEZONE.enabled:true (santuario LIVE)", mEnabled && mEnabled[1] === "true", { got: mEnabled && mEnabled[1] });
  check("0.6 served SAFEZONE.noAggro:true (NO-AGGRO flip LIVE — the mechanic under test)", mNoAggro && mNoAggro[1] === "true", { got: mNoAggro && mNoAggro[1] });
  check("0.7 render.js has 0 noAggro refs (pure sim, $0 art)", (rnd.txt.match(/noAggro/g) || []).length === 0, { refs: (rnd.txt.match(/noAggro/g) || []).length });

  const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    const errs = []; const req404 = [];
    const isResourceNoise = (t) => /Failed to load resource|net::ERR_/i.test(t);
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !isResourceNoise(m.text())) errs.push(m.text()); });
    page.on("response", (r) => { if (r.status() === 404) req404.push(r.url().split("/").pop()); });

    await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(page);

    // ---------- Phase 1: clean boot ----------
    const build = await page.evaluate(() => window.__BUILD || null);
    const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.noAggro === "function"));
    check("1.1 boot → play, __BUILD match, __dev.noAggro present, 0 pageerror",
      (await page.evaluate(() => __dev.scene())) === "play" && build === EXPECT_BUILD && hasHook && errs.length === 0,
      { build, hasHook, errs: errs.slice(0, 3) });

    // ---------- Phase 2: LIVE DEFAULT-ON (on-disk, no in-memory flip) ----------
    const na0 = await page.evaluate(() => window.__dev.noAggro());
    const sz0 = await page.evaluate(() => window.__dev.safeZone());
    check("2.1 LIVE default SAFEZONE.noAggro === true (on-disk flip, both hooks agree — NOT in-memory)",
      na0.noAggro === true && sz0.noAggro === true, { noAggroHook: na0.noAggro, safeZoneHook: sz0.noAggro });
    const szIn = await toTemple(page);
    check("2.2 hero teleporta al Templo POI ⇒ dentro de la zona (nearTemple)", !!szIn.temple && szIn.inZone === true && szIn.nearTemple === true,
      { temple: szIn.temple, inZone: szIn.inZone, nearTemple: szIn.nearTemple });
    const acqDefault = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.noAggro({ clear: true });        // clear test mobs, do NOT touch the flip (stays default = served true)
      window.__dev.spawn("skeleton", 50, 0);        // fresh IDLE mob 50px away — would chase in HEAD
      await sleep(850);
      const s = window.__dev.noAggro();
      return { noAggro: s.noAggro, heroInZone: s.heroInZone, states: s.enemies.map((e) => e.state), n: s.enemyCount };
    });
    report.desk.acquireGate = acqDefault;
    check("2.3 DEFAULT-ON acquire-gate: mob junto al héroe en-zona NUNCA agrede (queda idle/wander) — served config, sin __dev flip",
      acqDefault.noAggro === true && acqDefault.heroInZone === true && acqDefault.states.length >= 1 && acqDefault.states.every(IDLE),
      { noAggro: acqDefault.noAggro, states: acqDefault.states });
    await page.screenshot({ path: join(OUT, "01-noaggro-default-idle-in-city.png") });

    // ---------- Phase 3: DEFAULT-ON leash (incl permanent hostile) ----------
    const leash = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.noAggro({ clear: true });
      const pre = window.__dev.noAggro({ spawn: "skeleton", dx: 70, dy: 0 });   // spawns ALREADY in chase
      const preState = pre.enemies.map((e) => e.state);
      await sleep(650);
      const post = window.__dev.noAggro();
      return { preState, postState: post.enemies.map((e) => e.state) };
    });
    report.desk.leash = leash;
    check("3.1 DEFAULT-ON leash: mob que perseguía al héroe que entró en zona se desengancha a idle (drop-target en el borde)",
      leash.preState.includes("chase") && leash.postState.length >= 1 && leash.postState.every(IDLE),
      { pre: leash.preState, post: leash.postState });
    const hostileLeash = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.noAggro({ clear: true });
      const pre = window.__dev.noAggro({ spawn: "skeleton", dx: 70, dy: 0, hostile: true });  // permanent hostile chaser
      const preHostile = pre.enemies.some((e) => e.hostile);
      await sleep(650);
      const s = window.__dev.noAggro();
      return { preHostile, states: s.enemies.map((e) => ({ state: e.state, hostile: e.hostile })) };
    });
    const hostiles = hostileLeash.states.filter((e) => e.hostile);
    report.desk.hostileLeash = hostileLeash;
    check("3.2 DEFAULT-ON leash vence a un hostil PERMANENTE en la PZ (protection-zone anula la hostilidad)",
      hostileLeash.preHostile === true && hostiles.length >= 1 && hostiles.every((e) => IDLE(e.state)),
      { hostiles });

    // ---------- Phase 4: OFF == HEAD proof (in-memory flip false ⇒ aggro returns) ----------
    const off = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__dev.safeZone({ noAggro: false });    // in-memory A/B: reproduce HEAD behavior
      window.__dev.noAggro({ clear: true });
      window.__dev.spawn("skeleton", 60, 0);
      await sleep(750);
      const s = window.__dev.noAggro();
      return { noAggro: s.noAggro, heroInZone: s.heroInZone, states: s.enemies.map((e) => e.state), n: s.enemyCount };
    });
    report.desk.offHead = off;
    check("4.1 OFF == HEAD: con noAggro:false (in-memory) el mob ADQUIERE + engancha ⇒ el gate es real, no un no-op silencioso",
      off.noAggro === false && off.heroInZone === true && off.n >= 1 && off.states.some(ENGAGED),
      { noAggro: off.noAggro, states: off.states });
    await page.evaluate(() => window.__dev.safeZone({ noAggro: true }));  // restore default-ON

    // ---------- Phase 5: OUTSIDE the zone the gate does NOT apply ----------
    // NOTE: crossing into the wilderness raises the "curse" modal (pauses the sim) → dismiss it with Escape.
    const outside = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = window.__dev.safeZone().bbox;
      window.__dev.tp((b[2] + 200) / 32, (b[1] + b[3]) / 2 / 32);        // 200px east of the zone edge
      await sleep(150);
      for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
        await sleep(130);
      }
      window.__dev.noAggro({ clear: true });      // gate default-ON, but hero is OUTSIDE the zone
      window.__dev.spawn("skeleton", 60, 0);
      await sleep(900);
      const s = window.__dev.noAggro();
      return { scene: window.__dev.scene(), heroInZone: s.heroInZone, states: s.enemies.map((e) => e.state) };
    });
    report.desk.outside = outside;
    check("5.1 FUERA de la zona: gate no aplica, el mob adquiere/engancha (combate PvE intacto al salir de la ciudad)",
      outside.scene === "play" && outside.heroInZone === false && outside.states.some(ENGAGED),
      { scene: outside.scene, heroInZone: outside.heroInZone, states: outside.states });

    // ---------- Phase 6: determinism ----------
    const fpEq = await page.evaluate(() => {
      const j = () => JSON.stringify(window.__dev.worldFingerprint());
      const a = j();
      window.__dev.safeZone({ noAggro: false }); const b = j();
      window.__dev.safeZone({ noAggro: true }); const c = j();
      return { ab: a === b, ac: a === c };
    });
    check("6.1 worldFingerprint byte-estable ante toggle noAggro (0 RNG drift, gate pura geometría)", fpEq.ab && fpEq.ac, fpEq);
    const acq2 = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await sleep(150);
      window.__dev.noAggro({ clear: true });
      window.__dev.spawn("skeleton", 50, 0);
      await sleep(800);
      return window.__dev.noAggro().enemies.map((e) => e.state);
    });
    check("6.2 determinismo: repetir DEFAULT-ON acquire-gate ⇒ idéntico (mob idle, decisión pura-geometría, MMO-consistente)",
      acq2.length >= 1 && acq2.every(IDLE), { states: acq2 });

    // ---------- Phase 7: FULL-STACK regression (ambient + nav + santuario + home-temple respawn) ----------
    const flags = await page.evaluate(async (base) => {
      const cfg = await import(base + "/sim/config.js?cb=flags" + Date.now());
      return {
        SAFEZONE: cfg.SAFEZONE?.enabled, noAggro: cfg.SAFEZONE?.noAggro, TEMPLE_RESPAWN: cfg.TEMPLE_RESPAWN?.enabled,
        ZONE_BANNER: cfg.ZONE_BANNER?.enabled, WEATHER: cfg.WEATHER?.enabled, DAYNIGHT: cfg.DAYNIGHT?.enabled, MINIMAP: cfg.MINIMAP?.enabled,
      };
    }, LIVE);
    report.desk.flags = flags;
    check("7.1 stack LIVE completo servido ON (SAFEZONE+noAggro+TEMPLE_RESPAWN+ZONE_BANNER+WEATHER+DAYNIGHT+MINIMAP)",
      flags.SAFEZONE && flags.noAggro && flags.TEMPLE_RESPAWN && flags.ZONE_BANNER && flags.WEATHER && flags.DAYNIGHT && flags.MINIMAP, flags);
    // home-temple respawn under the live stack + no-aggro default-ON
    const tr = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
    report.desk.respawn = { hero: tr.hero, point: tr.point, near: tr.nearTemple, inZone: tr.inSafeZone };
    check("7.2 die → respawn aterriza EXACTO en el Templo de la Ciudad (inSafeZone + nearTemple) con no-aggro ON",
      tr.hero && tr.point && dist(tr.hero, tr.point) < 1 && tr.nearTemple && tr.inSafeZone, report.desk.respawn);
    // santuario regen at the respawn landing
    const regen = await page.evaluate(async () => {
      const s0 = window.__dev.safeZone({ setHp: 60, pause: 0 }); const hp0 = s0.hp;
      await new Promise((r) => setTimeout(r, 1400));
      const s1 = window.__dev.safeZone();
      return { hp0, hp1: s1.hp, near: s1.nearTemple, mul: s1.templeMul };
    });
    report.desk.regen = regen;
    check("7.3 santuario regenera HP en el Templo tras respawn (loop cohesivo coexiste con no-aggro)",
      regen.hp1 > regen.hp0 && regen.near === true, { hp0: regen.hp0, hp1: +regen.hp1.toFixed(1), near: regen.near });
    // ambient toggles + no-aggro still ON afterwards
    const stackNoAggro = await page.evaluate(async () => {
      window.__dev.daynight({ enabled: true, phase: 0.0 });
      window.__dev.weather({ enabled: true, phase: 0.28 });
      window.__dev.zone("Templo");
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
      await new Promise((r) => setTimeout(r, 150));
      window.__dev.noAggro({ clear: true });
      window.__dev.spawn("skeleton", 50, 0);
      await new Promise((r) => setTimeout(r, 800));
      const s = window.__dev.noAggro();
      return { noAggro: s.noAggro, heroInZone: s.heroInZone, states: s.enemies.map((e) => e.state) };
    });
    report.desk.stackNoAggro = stackNoAggro;
    check("7.4 no-aggro COEXISTE con el stack ambiental completo (noche+lluvia+banner): mob en-zona sigue idle",
      stackNoAggro.noAggro === true && stackNoAggro.heroInZone === true && stackNoAggro.states.length >= 1 && stackNoAggro.states.every(IDLE),
      { states: stackNoAggro.states });
    await page.evaluate(() => { window.__dev.zone(null); window.__dev.weather({ enabled: true, phase: 0.0 }); window.__dev.daynight({ enabled: true, phase: 0.5 }); });
    // core loop: movement + combat runs
    for (const c of ["KeyD", "KeyS"]) { await key(page, c); await sleep(180); await keyUp(page, c); }
    for (let i = 0; i < 6; i++) { await key(page, "Space"); await sleep(90); await keyUp(page, "Space"); }
    await sleep(250);
    check("7.5 core loop movimiento + combate corre sin error (nav intacto)", errs.length === 0, { errs: errs.slice(0, 3) });

    // ---------- Phase 8: perf ----------
    await page.evaluate(async () => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); window.__dev.noAggro({ clear: true }); window.__dev.spawn("skeleton", 60, 0); });
    const fpsSustain = [];
    for (let i = 0; i < 4; i++) { fpsSustain.push(await measFps(page, 2500)); await sleep(150); }
    const sorted = [...fpsSustain].sort((a, b) => a - b);
    const fpsMed = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : +((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(1);
    report.desk.fps = { samples: fpsSustain, median: fpsMed, min: Math.min(...fpsSustain), max: Math.max(...fpsSustain) };
    check("8.1 desktop 60fps sostenido con feature ON (mediana ≥58, max ≥59, piso ≥45)",
      fpsMed >= 58 && Math.max(...fpsSustain) >= 59 && Math.min(...fpsSustain) >= 45, report.desk.fps);
    check("8.2 0 JS pageerror en run desktop completo", errs.length === 0, { errs });
    const benign404 = req404.filter((u) => !/favicon/i.test(u));
    check("8.3 sin 404 no-benigno (favicon excluido)", benign404.length === 0, { req404 });
    report.desk.errors = errs; report.desk.req404 = req404;
    await page.screenshot({ path: join(OUT, "02-desktop-final.png") });

    // ---------- Phase 9: MOBILE / TOUCH ----------
    const mp = await browser.newPage();
    await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    const merrs = []; mp.on("pageerror", (e) => merrs.push(String(e))); mp.on("console", (m) => { if (m.type() === "error" && !isResourceNoise(m.text())) merrs.push(m.text()); });
    await mp.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
    await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
    await toPlay(mp);
    check("M1 mobile boota a play, 0 JS error", merrs.length === 0 && (await mp.evaluate(() => window.__dev.scene())) === "play", { merrs });
    // touch move via left-half virtual stick (proven CAS-2242/2248/2251 pattern) — tested FIRST at the open spawn,
    // BEFORE any tp onto the Templo POI (where a prop collision could block the move = a test-sequence artifact).
    await mp.evaluate(() => window.__dev.noAggro({ clear: true }));
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
    // default-ON no-aggro holds on mobile (tp to Templo, spawn idle mob, confirm it never acquires)
    const mAcq = await mp.evaluate(async () => {
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
      await new Promise((r) => setTimeout(r, 150));
      window.__dev.noAggro({ clear: true });
      window.__dev.spawn("skeleton", 50, 0);
      await new Promise((r) => setTimeout(r, 800));
      const s = window.__dev.noAggro();
      return { noAggro: s.noAggro, heroInZone: s.heroInZone, states: s.enemies.map((e) => e.state) };
    });
    report.mobile.acquireGate = mAcq;
    check("M3 mobile DEFAULT-ON acquire-gate: mob en-zona nunca agrede (served config, sin flip)",
      mAcq.noAggro === true && mAcq.heroInZone === true && mAcq.states.length >= 1 && mAcq.states.every(IDLE), { states: mAcq.states });
    // santuario regen on mobile
    const mReg = await mp.evaluate(async () => {
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32);
      window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp;
      await new Promise((r) => setTimeout(r, 1500)); const hp1 = window.__dev.safeZone().hp;
      return { hp0, hp1 };
    });
    check("M4 mobile santuario regenera HP en el Templo", (mReg.hp1 - mReg.hp0) > 1, { hp0: mReg.hp0, hp1: +mReg.hp1.toFixed(1) });
    const mFps = await measFps(mp, 2500);
    report.mobile.fps = mFps; report.mobile.errs = merrs; report.mobile.scene = await mp.evaluate(() => window.__dev.scene());
    check("M5 mobile fps estable (≥50 — DPR-capped)", mFps >= 50, { mFps });
    check("M6 mobile run sin error", merrs.length === 0, { merrs });
    await mp.screenshot({ path: join(OUT, "03-mobile-noaggro.png") });

    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }

  // ---------- summary ----------
  let pass = 0;
  console.log("\n===== CAS-2254 NO-AGGRO LIVE POST-FLIP QA (full-stack regression) =====");
  for (const [label, okk, detail] of A) { console.log(`${okk ? "PASS" : "FAIL"}  ${label}${okk ? "" : "  " + JSON.stringify(detail)}`); if (okk) pass++; }
  console.log(`\n${pass}/${A.length} checks passed  (build ${report.build}, deskFps ${JSON.stringify(report.desk.fps?.samples)}, mobFps ${report.mobile.fps})`);
  process.exit(pass === A.length ? 0 : 1);
})();
