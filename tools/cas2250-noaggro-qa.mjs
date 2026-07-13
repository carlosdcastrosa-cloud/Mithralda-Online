// CAS-2250 — OBSERVABLE verify of the CITY SANCTUARY NO-AGGRO (Tibia protection-zone). Pure sim/code mechanic, $0 art,
// ships DARK (SAFEZONE.noAggro:false). Inside the SAFEZONE (same world.deco POIs + cityMargin bbox that already drives
// regen CAS-2242 / banner CAS-2234), monsters (a) NEVER acquire a player target and (b) if they were chasing a player who
// steps INTO the zone, they leash/disengage at the border (→ idle/patrol). Outside the zone the player is aggro-able as in
// HEAD. Server-authoritative-ready: the gate is a pure function of static geometry (safeZoneGeom, memoized) + the player's
// position — 0 RNG, deterministic, identical for N shard players, no client can force aggro inside the zone.
//
// AUDIT FINDING (why this is NOT a silent no-op): the aggro state machine (updateEnemies, sim.js) transitions idle→chase on
// `d<aggro` and chase→idle on `d>aggro*1.4`, with NO awareness of the safe zone. Monsters chase the hero anywhere — including
// straight into the city band — and a lured pack will happily beat on you at the Templo steps. The vector this issue wires:
// a PLAYER-position gate (`heroSafe`) that suppresses acquisition and forces a border leash while the hero stands in the PZ.
// Reachable in normal play: the hero SPAWNS at the city Templo (Home-Temple Respawn CAS-2247, LIVE) and returns to the hub
// constantly, so luring a mob to the city edge is a routine occurrence — the pre-fix behavior is an attackable "safe" hub.
//
// Observed via the __dev.safeZone() / __dev.noAggro() hooks (sim.dev), which flip the sub-flag IN-MEMORY (A/B like
// __dev.weather/zone) so the shipped config stays noAggro:false ⇒ byte-identical served build. noAggro({spawn,dx,dy})
// drops a mob ALREADY in chase near the hero to observe the leash; noAggro({clear}) isolates the test mob.
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, __dev.noAggro + __BUILD present.
//   2. DARK default: SAFEZONE.noAggro === false (both hooks agree).
//   3. geometry reuse: safe-zone bbox/temple derive from the SAME POIs as regen/banner (temple != null, hero teleports in).
//   4. OFF (== HEAD): with noAggro:false, a mob spawned next to the hero INSIDE the city acquires + chases (no gate).
//   5. worldFingerprint byte-stable across the noAggro toggle (0 RNG drift; gate is pure geometry).
//   6. ON acquire-gate: flip noAggro:true; a fresh IDLE mob beside the in-zone hero NEVER transitions to chase.
//   7. ON leash: a mob spawned ALREADY chasing the in-zone hero disengages to idle at the border (drop-target).
//   8. ON leash beats a permanent hostile too (protection-zone overrides hostility).
//   9. determinism: repeat the ON acquire-gate ⇒ identical result (mob stays idle), pure-geometry decision.
//  10. OUTSIDE the zone the gate does NOT apply: teleport the hero out, a mob acquires + chases (player still aggro-able).
//  11. DARK byte-safe: shipped config SAFEZONE.noAggro:false + 0 render refs (pure sim, $0 art).
//  12. fps >= 55 with the feature ON.
// Run: node tools/cas2250-noaggro-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2250");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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

// tp the hero to the temple POI (world px → tile), settle, return the safe-zone snapshot
async function toTemple(page) {
  return await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sz = window.__dev.safeZone();
    const t = sz.temple; window.__dev.tp(t.x / 32, t.y / 32);
    await sleep(120);
    return window.__dev.safeZone();
  });
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1. clean boot
  const build = await page.evaluate(() => window.__BUILD || null);
  const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.noAggro === "function"));
  ok("1 boots clean, __dev.noAggro + __BUILD present, 0 JS errors", errors.length === 0 && !!build && hasHook, `build=${build} errs=${errors.length}`);

  // 2. DARK default
  const na0 = await page.evaluate(() => window.__dev.noAggro());
  const sz0 = await page.evaluate(() => window.__dev.safeZone());
  ok("2 DARK default SAFEZONE.noAggro === false (both hooks agree)", na0.noAggro === false && sz0.noAggro === false, `noAggro hook=${na0.noAggro} safeZone hook=${sz0.noAggro}`);

  // 3. geometry reuse + hero enters the zone
  const szIn = await toTemple(page);
  ok("3 safe-zone geometry derives from POIs; hero teleports INTO the zone (nearTemple)", !!szIn.temple && szIn.inZone === true && szIn.nearTemple === true,
     `temple=${JSON.stringify(szIn.temple)} inZone=${szIn.inZone} nearTemple=${szIn.nearTemple}`);

  // 4. OFF == HEAD: mob acquires + chases the in-zone hero when the gate is off
  const off = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.safeZone({ noAggro: false });
    window.__dev.noAggro({ clear: true });
    window.__dev.spawn("skeleton", 60, 0);       // fresh IDLE mob 60px away, well inside aggro (230)
    await sleep(700);                             // let the AI run
    const s = window.__dev.noAggro();
    return { heroInZone: s.heroInZone, states: s.enemies.map(e => e.state), n: s.enemyCount };
  });
  const engaged4 = off.states.some(s => s === "chase" || s === "windup" || s === "strike" || s === "recover");
  ok("4 OFF (== HEAD): mob ACQUIRES + engages the in-city hero (no gate)", off.heroInZone === true && off.n >= 1 && engaged4,
     `heroInZone=${off.heroInZone} states=${JSON.stringify(off.states)}`);

  // 5. worldFingerprint byte-stable across the noAggro toggle
  const fpEq = await page.evaluate(() => {
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j();
    window.__dev.safeZone({ noAggro: true }); const b = j();
    window.__dev.safeZone({ noAggro: false }); const c = j();
    return a === b && b === c;
  });
  ok("5 worldFingerprint byte-stable across SAFEZONE.noAggro toggle (0 RNG drift)", fpEq === true);

  // 6. ON acquire-gate: fresh idle mob beside the in-zone hero never chases
  const acq = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.noAggro({ clear: true, noAggro: true });
    window.__dev.spawn("skeleton", 50, 0);       // 50px away = inside aggro; would chase in HEAD
    await sleep(800);
    const s = window.__dev.noAggro();
    return { states: s.enemies.map(e => e.state), heroInZone: s.heroInZone };
  });
  ok("6 ON acquire-gate: mob beside the in-zone hero NEVER acquires (stays idle/wander)",
     acq.heroInZone === true && acq.states.length >= 1 && acq.states.every(s => s === "idle" || s === "wander"),
     `states=${JSON.stringify(acq.states)}`);

  // 7. ON leash: a mob already CHASING disengages at the border
  const leash = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.noAggro({ clear: true, noAggro: true });
    const pre = window.__dev.noAggro({ spawn: "skeleton", dx: 70, dy: 0 });  // spawns ALREADY in chase
    const preState = pre.enemies.map(e => e.state);
    await sleep(600);
    const post = window.__dev.noAggro();
    return { preState, postState: post.enemies.map(e => e.state) };
  });
  ok("7 ON leash: a mob CHASING the hero who entered the zone disengages to idle (drop-target)",
     leash.preState.includes("chase") && leash.postState.length >= 1 && leash.postState.every(s => s === "idle" || s === "wander"),
     `pre=${JSON.stringify(leash.preState)} post=${JSON.stringify(leash.postState)}`);

  // 8. ON leash overrides a permanent hostile
  const hostileLeash = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.noAggro({ clear: true, noAggro: true });
    // spawn a PERMANENTLY hostile chaser (aggro=300, e.hostile=true — never de-aggros on distance in HEAD)
    const pre = window.__dev.noAggro({ spawn: "skeleton", dx: 70, dy: 0, hostile: true });
    const preHostile = pre.enemies.some(e => e.hostile);
    await sleep(600);
    const s = window.__dev.noAggro();
    return { preHostile, states: s.enemies.map(e => ({ state: e.state, hostile: e.hostile })) };
  });
  const hostiles8 = hostileLeash.states.filter(e => e.hostile);
  ok("8 ON leash disengages even a PERMANENT hostile pursuer in the PZ (protection-zone overrides hostility)",
     hostileLeash.preHostile === true && hostiles8.length >= 1 &&
     hostiles8.every(e => e.state === "idle" || e.state === "wander"),
     `hostiles=${JSON.stringify(hostiles8)} all=${JSON.stringify(hostileLeash.states)}`);

  // 9. determinism: repeat the acquire-gate
  const acq2 = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.noAggro({ clear: true, noAggro: true });
    window.__dev.spawn("skeleton", 50, 0);
    await sleep(800);
    return window.__dev.noAggro().enemies.map(e => e.state);
  });
  ok("9 determinism: repeat ON acquire-gate ⇒ identical (mob idle, pure-geometry decision)",
     acq2.length >= 1 && acq2.every(s => s === "idle" || s === "wander"), `states=${JSON.stringify(acq2)}`);

  // 10. OUTSIDE the zone the gate does NOT apply — teleport the hero out of the bbox, mob acquires. NOTE: crossing into
  //     the wilderness raises the "curse" modal (pauses the sim) → dismiss it with Escape before the sim can advance.
  const outside = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const b = window.__dev.safeZone().bbox;            // [x0,y0,x1,y1]
    window.__dev.tp((b[2] + 200) / 32, (b[1] + b[3]) / 2 / 32);  // 200px east of the zone edge (still valid land)
    await sleep(120);
    // dismiss the wilderness curse modal so the sim resumes (Escape = Omitir)
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      await sleep(120);
    }
    window.__dev.noAggro({ clear: true, noAggro: true });        // gate still ON, but hero is OUT of the zone
    window.__dev.spawn("skeleton", 60, 0);
    await sleep(900);
    const s = window.__dev.noAggro();
    return { scene: window.__dev.scene(), heroInZone: s.heroInZone, states: s.enemies.map(e => e.state) };
  });
  const engaged10 = outside.states.some(s => s === "chase" || s === "windup" || s === "strike" || s === "recover");
  ok("10 OUTSIDE the zone: gate off, mob acquires/engages (player still aggro-able al salir)",
     outside.scene === "play" && outside.heroInZone === false && engaged10,
     `scene=${outside.scene} heroInZone=${outside.heroInZone} states=${JSON.stringify(outside.states)}`);

  // 11. DARK byte-safe: shipped config noAggro:false + 0 render refs
  const served = await page.evaluate(async (base) => {
    const cfg = await (await fetch(base + "sim/config.js", { cache: "no-store" })).text();
    const rnd = await (await fetch(base + "render/render.js", { cache: "no-store" })).text();
    const m = cfg.match(/SAFEZONE\s*=\s*\{[\s\S]*?noAggro:\s*(true|false)/);
    return { diskNoAggro: m ? m[1] : "MISSING", renderRefs: (rnd.match(/noAggro/g) || []).length };
  }, srv.url + "/");
  ok("11 DARK byte-safe: shipped config SAFEZONE.noAggro:false + 0 render refs (pure sim, $0 art)",
     served.diskNoAggro === "false" && served.renderRefs === 0,
     `disk=${served.diskNoAggro} renderRefs=${served.renderRefs}`);

  // 12. fps with feature ON
  const fps = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.safeZone({ noAggro: true });
    let n = 0; let last = performance.now(); const samples = [];
    const loop = () => { const now = performance.now(); samples.push(1000 / (now - last)); last = now; n++; if (n < 90) requestAnimationFrame(loop); };
    requestAnimationFrame(loop); await sleep(1700);
    samples.sort((a, b) => a - b); return samples[Math.floor(samples.length / 2)];
  });
  ok("12 fps >= 55 with feature ON", fps >= 55, `median=${fps.toFixed(1)}`);

  // reset the in-memory flip so nothing leaks
  await page.evaluate(() => window.__dev.safeZone({ noAggro: false }));
  await page.screenshot({ path: join(OUT, "noaggro-city.png") });
  console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAILURES"}: ${PASS} passed, ${FAIL} failed`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(FAIL === 0 ? 0 : 1);
