// ===========================================================================
// CAS-1655 — LIVE QA: Conjuntos de Objetos (Item Sets) — verifies CAS-1654
// on the canonical gh-pages build. Runs PASS x2 (desktop + mobile).
//
//   node tools/cas1653-sets-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1654 (sim/gear.js + sim/sim.js + render/render.js + game.js, additive +
// RNG-neutral): a build-defining loot layer parallel to the UNIQUES (CAS-1632).
// Instead of ONE build-defining piece you COLLECT matching set pieces to earn
// tiered bonuses. 3 sets × {b2 @2pz, b3 @3pz}; each set = exactly one piece per
// slot (weapon/body/shield), so a full 3-piece set = all three slots. The build
// twist rides ENTIRELY on setTotals() (the ONLY set-bonus reader; combat + UI
// route through it) so a set moves REAL numbers, never a baked stat, and stays
// recomputable from the equipped instances (reload/reset clean).
//
//   vigia   Vestiduras del Vigía   b2 hpMul 1.15        b3 reflectPct 10
//   cazador Atavío del Cazador      b2 atkspd +10        b3 critDmgPct +20
//   erudito Ropajes del Erudito     b2 essencePct +15    b3 abilCdr -10 (CD)
//
// The drop roll (maybeSetPiece) draws from a DEDICATED setRng stream
// (createRNG(0x5e75c0de)), so the shared srand is byte-identical at ANY rate →
// RNG-neutral (AC4 [AC-RNG-STRONG], the CAS-1638/1645 pattern).
//
// window/dev hooks used (all route to the SAME served sim module):
//   __dev.setMeta / setSetRate / setTotals / setCounts / equipSet / setSnap
//   __dev.setCritProbe / setReflectProbe / forceSetPiece / setRollRate / setPersist
//   __dev.dropStream / seed  (RNG-neutrality) ; __dev.essenceForRun via setSnap.essence
//   injected {G, serializeSave, loadSave, createHero} from the served sim.js (module cache = same instance)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD  version.json served (reported); served 4 touched files md5 == HEAD.
//  AC1    3 sets defined w/ b2+b3; set stats side-grade vs legendarios (not dominant).
//  AC2    N pieces activate the right tier (2pz/3pz); unequip deactivates; recompute
//         on equip/unequip/LOAD. Real effects: Vigía HP+15%@2 / reflect10%@3,
//         Cazador atkspd+10%@2 / critDmg+20%@3, Erudito essence+15%@2 / CD-10%@3.
//  AC3    UI shows set name + (x/3) and highlights active tiers (setCounts route).
//  AC4    [AC-RNG-STRONG] dropStream byte-identical setRate 0 vs full; roll never touches srand.
//  AC5    additive saves — a prior save (no set pieces) loads clean; set membership persists after reload.
//  PERF   0 JS errors (favicon 404 ignored); >=55 fps sampled EARLY on clean state.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/gear.js", "sim/sim.js", "render/render.js", "game.js"];
const OUT = "shots/cas1655"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// Re-poll version.json to absorb GitHub-Pages publish / CDN lag; report the served build.
// We gate on md5 live==HEAD (not a hardcoded hash) so this passes the moment the CTO deploys.
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

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (poll for CDN/Pages lag) ----
  const vb = await pollBuild(headHashes);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headHashes[f];
    gate(`BUILD.md5 ${f}`, live === head, `live=${String(live).slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  if (!vb.ok) { console.log("  → set build NOT live on gh-pages yet; aborting live ACs (CTO deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  // ---- boot: menu -> classsel -> abilitysel -> play ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => { try { localStorage.clear(); } catch {} });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.setTotals", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.setTotals never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1655";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1"); // warrior
  }
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(200); await key("Enter"); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });

  // inject SERVED sim.js exports for save persistence / hero re-start (module cache = same instance)
  await page.addScriptTag({ type: "module", content:
    `import {G, serializeSave, loadSave, createHero} from "${BASE}/sim/sim.js";
     window.__G=G; window.__serSave=serializeSave; window.__loadSave=loadSave; window.__createHero=createHero;` });
  await page.waitForFunction("window.__G && window.__serSave && window.__loadSave && window.__createHero", { timeout: 10000 });
  await wait(300);

  // ---- PERF (sampled EARLY, clean state, before any spawn/probe flooding) ----
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  gate("PERF.fps", fps >= 55, `~${fps} fps (>=55; 2-core box = noise, gate is determinism/byte-id)`);

  // ======================= AC1: 3 sets, b2+b3, side-grade =================
  const meta = await page.evaluate(() => window.__dev.setMeta());
  const setsOk = meta && meta.sets && Object.keys(meta.sets).length === 3 &&
    Object.values(meta.sets).every(s => s.b2 && s.b3);
  gate("AC1.threeSets", !!setsOk, `sets=${meta ? Object.keys(meta.sets||{}).join(",") : "none"} each has b2+b3`);
  // side-grade: Vigía full-set hpMul 1.15 < corazon_titan legendary hpMul 1.20 (one slot) — not dominant
  const sideGrade = await page.evaluate(() => {
    window.__dev.equipSet(["vigia_arma","vigia_cuerpo","vigia_escudo"]);
    const setHp = window.__dev.setTotals().hpMul; window.__dev.equipSet([]);
    return { setHp };
  });
  gate("AC1.sideGrade", near(sideGrade.setHp, 1.15) && sideGrade.setHp < 1.20,
    `Vigía 3pz hpMul=${sideGrade.setHp} (<1.20 legendary corazon_titan → alternate path, not dominant)`);

  // ======================= AC2: tiers activate/deactivate/recompute =======
  // Vigía: 2pz → HP +15% ; 3pz → reflect 10% (2pz also still on)
  const vigia = await page.evaluate(() => {
    const r = {};
    window.__dev.equipSet([]); r.hp0 = window.__dev.setSnap().maxHp; r.t0 = window.__dev.setTotals();
    window.__dev.equipSet(["vigia_arma","vigia_cuerpo"]); r.snap2 = window.__dev.setSnap(); r.t2 = window.__dev.setTotals();
    window.__dev.equipSet(["vigia_arma","vigia_cuerpo","vigia_escudo"]); r.t3 = window.__dev.setTotals();
    window.__dev.equipSet(["vigia_arma"]); r.t1 = window.__dev.setTotals(); // unequip below 2pz → off
    window.__dev.equipSet([]); return r;
  });
  gate("AC2.vigia2pz", near(vigia.t2.hpMul, 1.15) && vigia.t2.reflectPct === 0 && vigia.snap2.counts.vigia === 2,
    `2pz counts=${vigia.snap2.counts.vigia} hpMul=${vigia.t2.hpMul} maxHp ${vigia.hp0}->${vigia.snap2.maxHp} reflect=${vigia.t2.reflectPct}`);
  gate("AC2.vigia3pz", near(vigia.t3.hpMul, 1.15) && vigia.t3.reflectPct === 10,
    `3pz hpMul=${vigia.t3.hpMul} reflectPct=${vigia.t3.reflectPct} (b2+b3 cumulative)`);
  gate("AC2.vigiaUnequip", near(vigia.t1.hpMul, 1) && vigia.t1.reflectPct === 0,
    `1pz → all Vigía bonuses OFF hpMul=${vigia.t1.hpMul} reflect=${vigia.t1.reflectPct}`);
  // real reflect through the damageHero path
  const refl = await page.evaluate(() => window.__dev.setReflectProbe(200));
  gate("AC2.reflectReal", refl && refl.noSet === 0 && refl.fullVigia > 0 && refl.reflectPct === 10,
    `reflectProbe noSet=${refl && refl.noSet} fullVigia=${refl && refl.fullVigia} (10% of 200 dmg taken → attacker)`);

  // Cazador: 2pz → atkspd +10 ; 3pz → critDmg +20%
  const caz = await page.evaluate(() => {
    const r = {};
    window.__dev.equipSet([]); r.aspd0 = window.__dev.setSnap().atkspd;
    window.__dev.equipSet(["cazador_arma","cazador_cuerpo"]); r.snap2 = window.__dev.setSnap(); r.t2 = window.__dev.setTotals();
    window.__dev.equipSet(["cazador_arma","cazador_cuerpo","cazador_escudo"]); r.t3 = window.__dev.setTotals();
    window.__dev.equipSet([]); return r;
  });
  gate("AC2.cazador2pz", caz.t2.atkspd === 10 && caz.snap2.atkspd > caz.aspd0,
    `2pz atkspd bonus=${caz.t2.atkspd} heroAtkspd ${caz.aspd0}->${caz.snap2.atkspd}`);
  gate("AC2.cazador3pz", caz.t3.critDmgPct === 20,
    `3pz critDmgPct=${caz.t3.critDmgPct}`);
  const crit = await page.evaluate(() => window.__dev.setCritProbe(100));
  gate("AC2.critReal", crit && crit.fullCazador > crit.noSet && crit.critDmgPct === 20 && crit.ratio > 1.1,
    `critProbe noSet=${crit && crit.noSet} fullCazador=${crit && crit.fullCazador} ratio=${crit && crit.ratio} (+20% crit dmg wired)`);

  // Erudito: 2pz → essence +15% ; 3pz → CD -10% (cdrFactor drops)
  const eru = await page.evaluate(() => {
    const r = {};
    window.__dev.equipSet([]); const s0 = window.__dev.setSnap(); r.ess0 = s0.essence; r.cdr0 = s0.cdrFactor;
    window.__dev.equipSet(["erudito_arma","erudito_cuerpo"]); const s2 = window.__dev.setSnap(); r.ess2 = s2.essence; r.t2 = window.__dev.setTotals();
    window.__dev.equipSet(["erudito_arma","erudito_cuerpo","erudito_escudo"]); const s3 = window.__dev.setSnap(); r.cdr3 = s3.cdrFactor; r.t3 = window.__dev.setTotals();
    window.__dev.equipSet([]); return r;
  });
  gate("AC2.erudito2pz", eru.t2.essencePct === 15 && eru.ess2 > eru.ess0,
    `2pz essencePct=${eru.t2.essencePct} essence ${eru.ess0}->${eru.ess2}`);
  gate("AC2.erudito3pz", eru.t3.abilCdr === 10 && eru.cdr3 < eru.cdr0,
    `3pz abilCdr=${eru.t3.abilCdr} cdrFactor ${eru.cdr0}->${eru.cdr3} (lower = shorter CD)`);

  // recompute on LOAD: equip full Vigía, serialize, wipe, load → bonus recomputes
  const onLoad = await page.evaluate(() => {
    window.__dev.equipSet(["vigia_arma","vigia_cuerpo","vigia_escudo"]);
    const blob = window.__serSave(); const before = window.__dev.setTotals().hpMul;
    window.__dev.equipSet([]); const cleared = window.__dev.setTotals().hpMul;
    window.__loadSave(JSON.parse(JSON.stringify(blob)));
    return { before, cleared, after: window.__dev.setTotals().hpMul, counts: window.__dev.setCounts() };
  });
  gate("AC2.recomputeOnLoad", near(onLoad.before, 1.15) && near(onLoad.cleared, 1) && near(onLoad.after, 1.15) && onLoad.counts.vigia === 3,
    `hpMul equip=${onLoad.before} clear=${onLoad.cleared} afterLoad=${onLoad.after} counts.vigia=${onLoad.counts.vigia}`);

  // ======================= AC3: UI shows name + (x/3), tiers ==============
  // setCounts is the exact live read-out the tooltip/inventory draws from (render.js ◈ name (n/3) + 2pz/3pz ✓)
  const ui = await page.evaluate(() => {
    window.__dev.equipSet(["vigia_arma","vigia_cuerpo","vigia_escudo"]);
    const c3 = window.__dev.setCounts(); const m = window.__dev.setMeta();
    window.__dev.equipSet(["cazador_arma","cazador_cuerpo"]); const c2 = window.__dev.setCounts();
    window.__dev.equipSet([]); return { c3, c2, name: m && m.sets && m.sets.vigia && m.sets.vigia.name };
  });
  gate("AC3.uiCounts", ui.c3.vigia === 3 && ui.c2.cazador === 2 && !!ui.name,
    `setCounts drives UI: full=${JSON.stringify(ui.c3)} partial=${JSON.stringify(ui.c2)} name="${ui.name}"`);

  // ======================= AC4: [AC-RNG-STRONG] byte-identical =============
  // dropStream with set pool OFF (rate 0) vs full-rate must be byte-identical: the roll draws the
  // dedicated setRng stream, never the shared srand. Reseed identically before each.
  const rng = await page.evaluate(() => {
    const stream = (rate) => { window.__dev.seed(0xA11CE); window.__dev.setSetRate(rate); return window.__dev.dropStream(400, 0xA11CE); };
    const off = stream(0);        // feature effectively off
    const on = stream(1);         // full set-drop rate
    window.__dev.setSetRate(null); // restore default
    const s = (x) => (typeof x === "string" ? x : JSON.stringify(x));
    return { off: s(off), on: s(on), same: s(off) === s(on) };
  });
  gate("AC4.rngNeutral", rng.same === true,
    `dropStream byte-identical setRate 0 vs full: ${rng.same ? "IDENTICAL" : "DRIFT"} (dedicated setRng, shared srand untouched)`);

  // ======================= AC5: additive saves ============================
  // a legacy save with NO set fields loads clean; a set-bearing save persists membership after reload
  const save = await page.evaluate(() => {
    // legacy: strip any set marks from equipped instances, load → no crash, no set bonus
    window.__dev.equipSet([]); const legacy = window.__serSave();
    window.__loadSave(JSON.parse(JSON.stringify(legacy))); const legacyOk = window.__dev.setTotals().hpMul === 1;
    // set-bearing persists
    window.__dev.equipSet(["erudito_arma","erudito_cuerpo","erudito_escudo"]);
    const blob = window.__serSave();
    window.__loadSave(JSON.parse(JSON.stringify(blob)));
    return { legacyOk, counts: window.__dev.setCounts(), essence: window.__dev.setTotals().essencePct, cd: window.__dev.setTotals().abilCdr };
  });
  gate("AC5.legacyClean", save.legacyOk === true, `prior save w/o set pieces loads clean (hpMul=1, no crash)`);
  gate("AC5.persist", save.counts.erudito === 3 && save.essence === 15 && save.cd === 10,
    `set membership survives reload: counts.erudito=${save.counts.erudito} essence=${save.essence} cd=${save.cd}`);

  // ======================= drop lands via real loot path ==================
  const drop = await page.evaluate(() => window.__dev.forceSetPiece("cazador_arma", "caves"));
  gate("DROP.forced", drop && (drop.set === "cazador_arma" || (drop.drop && drop.drop.set === "cazador_arma") || JSON.stringify(drop).includes("cazador_arma")),
    `forceSetPiece → ${JSON.stringify(drop).slice(0,120)}`);

  await page.screenshot({ path: `${OUT}/${label}-sets.png` });

  // ---- PERF errors ----
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
  if (notDeployed) console.log("NOTE: set build NOT live on gh-pages — CTO deploy of CAS-1654 pending. Re-run after deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
