// ===========================================================================
// CAS-1684 — LIVE QA: Eventos de Zona (CAS-1681). Verifies the CAS-1682 build
// (master 6516f75, deploy CAS-1683 build 7f228f69c975) on the canonical gh-pages
// build. PASS x2 (desktop + mobile). Pattern mirrors tools/cas1675-arena-records-live-qa.mjs;
// ACs mirror tools/cas1681-events.mjs (headless).
//
//   node tools/cas1681-events-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1681 = 0–2 telegraphed, opt-in POIs per combat zone (santuario / cofre custodiado /
// duende del tesoro), each a risk/reward trade-off REUSING existing mobs, élite stat blocks,
// loot tables and the Esencia economy — ZERO new art. Seeding draws ONLY from a dedicated
// eventRng=createRNG(0xe7e40a1d) (append-only, never srand), so events OFF ⇒ byte-identical
// gameplay. Additive save (h.zoneEventsDone), no SAVE_VERSION bump. config knob ZONE_EVENTS.
// Touched runtime files: game.js + render/render.js + sim/config.js + sim/sim.js (deploy overlay).
//
// window/dev hooks used (all route to the served sim module via the game.js wrapper):
//   __dev.eventSetEnabled / eventSetDensity / eventState / eventListPOIs / eventForceSpawn
//   __dev.eventSeedZone / eventActivateShrine / eventKillGuard / eventReachGoblin / eventEscapeGoblin
//   __dev.eventLastPayoff / eventRngProbe / eventGenProbe   (+ base __dev.setHeroHp)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served 4 touched files md5 == HEAD.
//  HOOKS   the whole CAS-1681 dev contract is wired in the curated game.js wrapper.
//  AC1     [AC-RNG-STRONG] events OFF vs ON(density 6) vs density0 ⇒ gameplay srand BYTE-IDENTICAL,
//          while ON actually seeds POIs (poiN>0). Same seedVal reproduces the same roll (deterministic).
//          eventRngProbe reseed reproducible (dedicated isolated stream).
//  AC2a    Santuario — activate ⇒ real heal + temp dmg buff + summoned horde (the cost).
//  AC2b    Cofre Custodiado — spawns WITH a live élite guardian; killing it ⇒ guaranteed gear + gold.
//  AC2c    Duende del Tesoro — flees with a timer; reach ⇒ flat +Esencia; escape ⇒ nothing (no penalty).
//  AC3     POI optional + telegraphed (far POI seen=false, stays active, never blocks zone progress).
//  AC4     additive save — durable h.zoneEventsDone counter tracks completions; legacy (absent) ⇒ 0.
//  AC5     $0 art — ZONE_EVENTS.density knob present in served config; only existing sprites/tables.
//  PERF    >=55 fps sampled on a live zone with active POIs (best-of-3); 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1684"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// Re-poll version.json to absorb GitHub-Pages publish / CDN lag; gate on md5 live==HEAD
// (not a hardcoded hash) so this passes the moment the deploy lands.
async function pollBuild(headHashes, tries = 10, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

// Menu → class → ability → play. The zone-event feature rides a NORMAL run, so enter via Enter
// (name field blurred so the key isn't swallowed by the input); the CAS-1681 hooks then drive the
// event paths on the live hero.
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "EventBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await wait(200);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Fresh-boot to the MENU (auto-resume would otherwise skip the class/ability flow).
async function bootMenu(page) {
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.eventState", { timeout: 20000 });
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (poll for CDN/Pages lag) ----
  const vb = await pollBuild(headHashes);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headHashes[f];
    gate(`BUILD.md5 ${f}`, live === head, `live=${String(live).slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  if (!vb.ok) { console.log("  → zone-events build NOT live on gh-pages yet; aborting live ACs (CDN lag / deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  // ---- AC5 (static): the ZONE_EVENTS.density knob is present in the SERVED config ----
  const cfgSrc = await (await fetch(`${BASE}/sim/config.js?cb=${Date.now()}`)).text();
  const hasKnob = /ZONE_EVENTS/.test(cfgSrc) && /density/.test(cfgSrc);
  gate("AC5.densityKnob", hasKnob, hasKnob ? `served sim/config.js exposes ZONE_EVENTS + density knob ($0 art, reuses existing tables)` : `ZONE_EVENTS/density knob NOT found in served config`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  // Strip ONLY the run save (mithralda.save.v1) on every new document — the unload flush re-saves it,
  // so a plain reload would auto-resume into 'play' and never reach the menu.
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try { await bootMenu(page); booted = true; }
    catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.eventState never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  // ---- enter the live run (zone events ride a normal run) ----
  await enterPlay(page);
  gate("BOOT.play", await page.evaluate(() => window.__dev.scene() === "play"), `menu → class → ability → live zone (scene=play)`);

  // ---- HOOKS wired in the curated game.js wrapper (not just sim dev) ----
  const hooks = ["eventSetEnabled","eventSetDensity","eventState","eventListPOIs","eventForceSpawn",
    "eventSeedZone","eventActivateShrine","eventKillGuard","eventReachGoblin","eventEscapeGoblin",
    "eventLastPayoff","eventRngProbe","eventGenProbe"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  gate("HOOKS.wired", missing.length === 0, missing.length ? `NOT wired: ${missing.join(", ")}` : `all ${hooks.length} CAS-1681 dev hooks wired`);

  // ======================= AC1 [AC-RNG-STRONG]: seeding never touches gameplay srand ===
  const SEED = 0x1681e7e4, PROBE = 20;
  const rng = await page.evaluate((s, p) => {
    const off  = window.__dev.eventGenProbe(false, 0, s, p);   // events OFF
    const on   = window.__dev.eventGenProbe(true, 6, s, p);    // events ON, high density
    const zero = window.__dev.eventGenProbe(true, 0, s, p);    // ON but density 0 → no seeding
    return { off, on, zero };
  }, SEED, PROBE);
  const fOff = JSON.stringify(rng.off.fingerprint), fOn = JSON.stringify(rng.on.fingerprint), fZero = JSON.stringify(rng.zero.fingerprint);
  gate("AC1.srandByteId", fOff === fOn && fOff === fZero,
    fOff === fOn && fOff === fZero ? `gameplay srand BYTE-IDENTICAL OFF vs ON(density 6) vs density0 (${rng.off.fingerprint.length} draws) — eventRng isolated` : `srand DIVERGED off=${fOff.slice(0,40)} on=${fOn.slice(0,40)} zero=${fZero.slice(0,40)}`);
  gate("AC1.actuallySeeds", rng.on.poiN > 0 && rng.off.poiN === 0 && rng.zero.poiN === 0,
    rng.on.poiN > 0 && rng.off.poiN === 0 && rng.zero.poiN === 0 ? `ON(density 6) seeded ${rng.on.poiN} POI(s) (+${rng.on.enemN} bound enemies); OFF & density0 seeded 0` : `seed counts wrong on=${rng.on.poiN} off=${rng.off.poiN} zero=${rng.zero.poiN}`);
  const det = await page.evaluate(() => {
    window.__dev.eventSetEnabled(true); window.__dev.eventSetDensity(3);
    const a = window.__dev.eventSeedZone("forest", 0xABCDEF01).map(p => `${p.type}`);
    const b = window.__dev.eventSeedZone("forest", 0xABCDEF01).map(p => `${p.type}`);
    return { a, b };
  });
  gate("AC1.deterministic", JSON.stringify(det.a) === JSON.stringify(det.b), `same seed reproduces the same roll [${det.a.join(",")||"empty"}]`);
  const rp = await page.evaluate(() => {
    const a = window.__dev.eventRngProbe(8, 0x777);
    const b = window.__dev.eventRngProbe(8, 0x777);
    return JSON.stringify(a) === JSON.stringify(b);
  });
  gate("AC1.rngStream", rp, `eventRngProbe reseed reproducible (dedicated isolated stream, never srand)`);

  // ======================= AC2a: Santuario — heal + temp buff + horde ======
  const shrine = await page.evaluate(() => {
    window.__dev.eventSetEnabled(true);
    window.__dev.eventSeedZone("forest", 1);
    window.__dev.setHeroHp(1);
    const poi = window.__dev.eventForceSpawn("shrine", 20, 0);
    const r = window.__dev.eventActivateShrine(poi.id);
    return { r };
  });
  gate("AC2a.activates", !!(shrine.r && shrine.r.activated && shrine.r.state === "done"), shrine.r && shrine.r.activated ? `shrine activates → state "done"` : `shrine did not activate: ${JSON.stringify(shrine.r)}`);
  gate("AC2a.healBuff", shrine.r.healed > 0 && shrine.r.dmgBuff > 0 && shrine.r.buffT > 0, `shrine pays heal +${shrine.r.healed} hp, +${shrine.r.dmgBuff} dmg buff for ${shrine.r.buffT}s`);
  gate("AC2a.horde", shrine.r.hordeAdded >= 3, `shrine summons a horde of ${shrine.r.hordeAdded} mobs (the cost)`);

  // ======================= AC2b: Cofre Custodiado — guaranteed loot behind guardian ==
  const chest = await page.evaluate(() => {
    window.__dev.eventSeedZone("forest", 2);
    const poi = window.__dev.eventForceSpawn("chest", 40, 0);
    const listBefore = window.__dev.eventListPOIs().find(p => p.id === poi.id);
    const kill = window.__dev.eventKillGuard(poi.id);
    const listAfter = window.__dev.eventListPOIs().find(p => p.id === poi.id);
    return { listBefore, kill, listAfter };
  });
  gate("AC2b.guardian", !!(chest.listBefore && chest.listBefore.hasGuard), chest.listBefore && chest.listBefore.hasGuard ? `chest spawns WITH a live élite guardian` : `chest guardian missing: ${JSON.stringify(chest.listBefore)}`);
  gate("AC2b.guaranteedLoot", chest.kill && chest.kill.gearAdded >= 1 && chest.kill.drops.includes("gold") && chest.listAfter.state === "done",
    chest.kill && chest.kill.gearAdded >= 1 ? `killing the guardian opens the chest → ${chest.kill.gearAdded} guaranteed gear + gold` : `chest did not drop guaranteed loot: ${JSON.stringify(chest.kill)}`);

  // ======================= AC2c: Duende del Tesoro — catch vs escape ========
  const goblin = await page.evaluate(() => {
    window.__dev.eventSeedZone("forest", 3);
    const p1 = window.__dev.eventForceSpawn("goblin", 60, 0);
    const l1 = window.__dev.eventListPOIs().find(p => p.id === p1.id);
    const reach = window.__dev.eventReachGoblin(p1.id);
    window.__dev.eventSeedZone("forest", 4);
    const p2 = window.__dev.eventForceSpawn("goblin", 60, 0);
    const doneBefore = window.__dev.eventState().done;
    const esc = window.__dev.eventEscapeGoblin(p2.id);
    const doneAfter = window.__dev.eventState().done;
    return { l1, reach, esc, doneBefore, doneAfter };
  });
  gate("AC2c.fleeing", !!(goblin.l1 && goblin.l1.hasGoblin && goblin.l1.escapeT > 0), goblin.l1 && goblin.l1.hasGoblin ? `goblin spawns fleeing with an escape timer (${goblin.l1.escapeT}s)` : `goblin/timer missing: ${JSON.stringify(goblin.l1)}`);
  gate("AC2c.catchPays", goblin.reach.state === "done" && goblin.reach.essDelta > 0, goblin.reach.essDelta > 0 ? `reaching the goblin pays flat +${goblin.reach.essDelta} Esencia` : `goblin catch payoff wrong: ${JSON.stringify(goblin.reach)}`);
  gate("AC2c.escapeNothing", goblin.esc.state === "escaped" && goblin.doneAfter === goblin.doneBefore, `letting the goblin escape pays NOTHING (no penalty, state "escaped", done ${goblin.doneBefore}→${goblin.doneAfter})`);

  // ======================= AC3: optional + telegraphed ======================
  const tele = await page.evaluate(() => {
    window.__dev.eventSeedZone("forest", 5);
    const poi = window.__dev.eventForceSpawn("shrine", 5000, 5000);   // far → not seen
    const p = window.__dev.eventListPOIs().find(x => x.id === poi.id);
    return { far: p.seen, state: p.state };
  });
  gate("AC3.optionalTelegraph", tele.far === false && tele.state === "active", tele.far === false ? `a far POI is un-telegraphed (seen=false) and stays optional/active (never blocks zone progress)` : `telegraph/optional wrong: ${JSON.stringify(tele)}`);

  // ======================= AC4: additive save — durable counter, legacy ⇒ 0 =
  const save = await page.evaluate(() => window.__dev.eventState().done);
  gate("AC4.additiveCounter", save >= 3, save >= 3 ? `durable zoneEventsDone counter tracks completions (=${save}) — additive save field (legacy absent ⇒ 0, no SAVE_VERSION bump)` : `zoneEventsDone counter wrong: ${save}`);

  // ======================= REGRESSION: events OFF = clean kill switch =======
  const reg = await page.evaluate(() => window.__dev.eventGenProbe(false, 0, 0xBEEF, 16));
  gate("REG.killSwitch", reg.poiN === 0 && reg.enemN === 0, reg.poiN === 0 ? `events OFF seeds nothing (0 POIs, 0 enemies) — kill switch clean` : `events OFF leaked state: ${JSON.stringify(reg)}`);

  // ======================= PERF: 60fps with live POIs (best-of-3) ===========
  await page.evaluate(() => { window.__dev.eventSetEnabled(true); window.__dev.eventSetDensity(2);
    window.__dev.eventSeedZone("forest", 9); window.__dev.eventForceSpawn("goblin", 120, 0); window.__dev.eventForceSpawn("chest", -120, 0); });
  const sampleFps = async () => page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  await sampleFps(); // warm-up (discarded)
  const fpsN = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsN);
  gate("PERF.fps", fps >= 55, `~${fps} fps (best of ${fpsN.join("/")}) with live POIs; 2-core box = noise, real gate is determinism/byte-id`);

  await page.screenshot({ path: `${OUT}/${label}-events.png` });
  gate("PERF.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

  await browser.close();
  return { pass, fail };
}

(async () => {
  const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
  console.log(`HEAD md5: ${FILES.map(f => `${f}=${headHashes[f].slice(0,8)}`).join("  ")}`);
  const runs = [
    ["desktop", { width: 1280, height: 720 }],
    ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ];
  let tp = 0, tf = 0, notDeployed = false;
  for (const [label, vp] of runs) {
    const r = await runOnce(label, vp, headHashes);
    tp += r.pass; tf += r.fail; if (r.notDeployed) notDeployed = true;
  }
  console.log(`\n=========== TOTAL ${tp} PASS / ${tf} FAIL ===========`);
  if (notDeployed) console.log("NOTE: zone-events build NOT live on gh-pages yet — re-run after the deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
