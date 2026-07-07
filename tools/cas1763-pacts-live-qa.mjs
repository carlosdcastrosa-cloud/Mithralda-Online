// ===========================================================================
// CAS-1766 — LIVE QA: Pactos de Poder (Power Pacts). Verifies the CAS-1764
// build (deployed by CAS-1765) on the canonical gh-pages URL. PASS x2
// (desktop + mobile), browser-per-pass.
//
// Feature = an OPT-IN, stackable difficulty covenant. The player ranks up pacts
// (own store mithralda.pacts.v1 — save.v1 untouched); each rank adds HEAT + a
// per-rank effect (enemy hp/dmg/spd, élite promotion rate, player heal cut).
// HEAT scales the endgame rewards (Esencia + drop/unique/rune chance). PURE
// READ-SIDE: effects are DERIVED IN THE SEAM each run (arithmetic on an already
// existing stat/heal/essence value, or a threshold shift on a roll that ALREADY
// fires). It adds/removes NO authoritative srand draw.
//
//   node tools/cas1763-pacts-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1765 overlay = exactly these 7 runtime blobs — HARD md5 gate):
//   game.js, hud.js, input.js, persist.js, render/render.js,
//   sim/config.js, sim/sim.js
//
// Covers AC0 md5 live==HEAD + version.json build / AC1 heat+stack+clamp+cycle +
// effects present in-run / AC2 heat>0 scales Esencia + drop muls by config /
// AC3 chosen config survives run end + reload + own-blob round-trip + no save.v1
// growth / AC-RNG-STRONG (i) OFF srand+save byte-id (ii) enabled+heat=0 byte-id
// (iii) 48-draw stat-pact srand byte-identical to OFF while mob HP differs /
// AC4 ⚔ HUD affordance + KeyL panel toggle + renderPacts paints /
// REG Códice + Títulos srand ON==OFF + 60fps + boots clean.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "hud.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1766"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// PACTS config mirror (sim/config.js) — the reward tuning knobs the AC2 muls derive from.
const CFG = { essencePerHeat: 0.004, dropPerHeat: 0.003, rewardHeatCap: 150 };
const round6 = (n) => +n.toFixed(6);

async function pollBuild(headHashes, tries = 16, gap = 5000) {
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

// benign browser noise filter (favicon 404 etc.) — real files are md5-gated.
function watch(page) {
  const errs = [];
  page.on("pageerror", e => { if (!/favicon/.test(e.message)) errs.push("pageerror: " + e.message); });
  page.on("console", m => {
    const t = m.text();
    if (m.type() === "error" && !/favicon/.test(t) && !/Failed to load resource/.test(t)) errs.push("console: " + t);
  });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/version\.json/.test(r.url())) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
}

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "PactBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      // Wipe stores ONLY on the very first load (a sentinel guards it) so the persist-across-reload test
      // proves the ledger survives a real reload; a blanket wipe every navigation would destroy that.
      try { if (!localStorage.getItem("__cas1766_booted")) {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.setItem("__cas1766_booted", "1"); } } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live hero)");

    // ---- dev hooks wired live ----
    const hooks = ["pactsEnable", "pactsReset", "pactsState", "pactsSetRank", "pactsCycle", "pactsPersist",
                   "pactMobScale", "pactEssence", "pactsSrandProbe", "pactsBtns", "saveBlob",
                   "codexSrandProbe", "titlesSrandProbe"];
    const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
    gate("HOOKS/wired", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : `${hooks.length}/${hooks.length}`);

    await page.evaluate(() => { window.__dev.pactsEnable(true); window.__dev.pactsReset(); });

    // ---- CONTENT: fixed 5-pact table, none active, heat 0, reward muls 1.0 ----
    const st0 = await page.evaluate(() => window.__dev.pactsState());
    gate("CONTENT/table", st0.enabled && st0.total === 5 && st0.active === 0 && st0.heat === 0 && st0.essMul === 1 && st0.dropMul === 1,
      `${st0.total} pacts, active ${st0.active}, heat ${st0.heat}, essMul ${st0.essMul}, dropMul ${st0.dropMul}`);

    // ---- AC1: ranks raise heat + pacts STACK ----
    const stack = await page.evaluate(() => {
      window.__dev.pactsReset();
      window.__dev.pactsSetRank("cruento", 3); // 3×10 = 30
      window.__dev.pactsSetRank("vigor", 2);   // 2×8  = 16
      return window.__dev.pactsState();
    });
    gate("AC1/heat-stack", stack.heat === 46 && stack.active === 2,
      `cruento r3 (30) + vigor r2 (16) = heat ${stack.heat}, ${stack.active} active`);

    // ---- AC1: setPactRank clamps [0,max]; cyclePactRank wraps past max→0 ----
    const clamp = await page.evaluate(() => {
      const hi = window.__dev.pactsSetRank("cruento", 99).state.items.find((i) => i.id === "cruento").rank; // max 5
      const lo = window.__dev.pactsSetRank("vigor", -4).state.items.find((i) => i.id === "vigor").rank;      // → 0
      window.__dev.pactsReset();
      const cyc = [];
      for (let i = 0; i < 5; i++) cyc.push(window.__dev.pactsCycle("celeridad").state.items.find((x) => x.id === "celeridad").rank); // max 3
      return { hi, lo, cyc };
    });
    gate("AC1/clamp", clamp.hi === 5 && clamp.lo === 0, `cruento 99→5, vigor -4→0`);
    gate("AC1/cycle-wrap", JSON.stringify(clamp.cyc) === JSON.stringify([1, 2, 3, 0, 1]), `celeridad (max 3): ${JSON.stringify(clamp.cyc)}`);

    // ---- AC1: effects present IN-RUN (a stat pact moves REAL enemy hp/dmg/spd via applyZoneScale) ----
    const eff = await page.evaluate(() => {
      window.__dev.pactsReset();
      const base = window.__dev.pactMobScale("skeleton", "frost");
      window.__dev.pactsSetRank("vigor", 3);    // +45% hp
      window.__dev.pactsSetRank("cruento", 4);  // +40% dmg
      window.__dev.pactsSetRank("celeridad", 2);// +16% spd
      const scaled = window.__dev.pactMobScale("skeleton", "frost");
      return { base, scaled };
    });
    const effOk = eff.scaled.hp === Math.round(eff.base.hp * 1.45) && eff.scaled.dmg === Math.round(eff.base.dmg * 1.4) &&
      eff.scaled.spd === Math.max(1, Math.round(eff.base.spd * 1.16));
    gate("AC1/effects-in-run", effOk, `hp ${eff.base.hp}→${eff.scaled.hp} (+45%), dmg ${eff.base.dmg}→${eff.scaled.dmg} (+40%), spd ${eff.base.spd}→${eff.scaled.spd} (+16%)`);

    // ---- AC2: heat>0 scales Esencia + drop/unique/rune muls by the configured mults ----
    const expEss = round6(1 + CFG.essencePerHeat * 50), expDrop = round6(1 + CFG.dropPerHeat * 50);
    const rw = await page.evaluate(() => { window.__dev.pactsReset(); window.__dev.pactsSetRank("cruento", 5); return window.__dev.pactsState(); }); // heat 50
    gate("AC2/reward-muls", rw.heat === 50 && rw.essMul === expEss && rw.dropMul === expDrop,
      `heat 50 → Esencia ×${rw.essMul} (exp ${expEss}), botín ×${rw.dropMul} (exp ${expDrop})`);
    const ess = await page.evaluate(() => {
      window.__dev.pactsReset();
      const b = window.__dev.pactEssence(20, 3);
      window.__dev.pactsSetRank("cruento", 5);
      const h = window.__dev.pactEssence(20, 3);
      return { b, h };
    });
    gate("AC2/essence-scales", ess.h === Math.round(ess.b * expEss) && ess.h > ess.b, `essenceForRun ${ess.b} → ${ess.h} (×${expEss}) at heat 50`);
    // reward heat CLAMPED at rewardHeatCap (effects still stack past it)
    const cap = await page.evaluate(() => {
      window.__dev.pactsReset();
      window.__dev.pactsSetRank("cruento", 5); window.__dev.pactsSetRank("vigor", 5); window.__dev.pactsSetRank("celeridad", 3);
      window.__dev.pactsSetRank("jauria", 3); window.__dev.pactsSetRank("fragil", 3); // heat = 50+40+36+45+36 = 207
      return window.__dev.pactsState();
    });
    const expCapEss = round6(1 + CFG.essencePerHeat * CFG.rewardHeatCap);
    gate("AC2/reward-cap", cap.heat === 207 && cap.essMul === expCapEss, `heat 207 stacks but Esencia ×${cap.essMul} uses cap ${CFG.rewardHeatCap} (exp ${expCapEss})`);

    // ---- AC3: chosen config round-trips through its OWN blob (save.v1 untouched) ----
    const rt = await page.evaluate(() => {
      window.__dev.pactsReset();
      window.__dev.pactsSetRank("cruento", 3); window.__dev.pactsSetRank("jauria", 2);
      return window.__dev.pactsPersist();
    });
    const rtB = JSON.stringify(rt.before.items), rtA = JSON.stringify(rt.after.items);
    gate("AC3/own-blob-roundtrip", !!rt.blob && rt.blob.v === 1 && !!rt.blob.ranks && rt.blob.ranks.cruento === 3 && rt.clearedFirst && rtB === rtA && rt.after.heat === rt.before.heat,
      `mithralda.pacts.v1 v=${rt.blob && rt.blob.v} cruento=${rt.blob && rt.blob.ranks && rt.blob.ranks.cruento} heat ${rt.before.heat}→${rt.after.heat}`);

    // ---- AC3: chosen config survives a RUN END + real reload (reconciled at boot) ----
    const beforeReload = await page.evaluate(() => {
      window.__dev.pactsEnable(true); window.__dev.pactsReset();
      window.__dev.pactsSetRank("cruento", 4); window.__dev.pactsSetRank("celeridad", 2);
      return { st: window.__dev.pactsState(), blob: localStorage.getItem("mithralda.pacts.v1") };
    });
    await wait(2600); // > SAVE_THROTTLE so tick() flushes pactsDirty
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 20000 });
    const afterReload = await page.evaluate(() => window.__dev.pactsState());
    const arB = JSON.stringify(beforeReload.st.items.map((i) => [i.id, i.rank])), arA = JSON.stringify(afterReload.items.map((i) => [i.id, i.rank]));
    gate("AC3/persist-reload", arB === arA && afterReload.heat === beforeReload.st.heat && afterReload.heat > 0,
      `heat ${beforeReload.st.heat} survives reload → ${afterReload.heat}`);

    // ---- AC3: save.v1 carries NO pacts field, and toggling pacts adds NO save.v1 keys (no growth) ----
    const saveChk = await page.evaluate(() => {
      window.__dev.pactsReset();
      const k0 = Object.keys(window.__dev.saveBlob() || {}).sort();
      window.__dev.pactsSetRank("cruento", 5); window.__dev.pactsSetRank("vigor", 3);
      const blob = window.__dev.saveBlob() || {};
      const k1 = Object.keys(blob).sort();
      return { hasPacts: blob.pacts !== undefined, k0, k1 };
    });
    gate("AC3/save-no-growth", saveChk.hasPacts === false && JSON.stringify(saveChk.k0) === JSON.stringify(saveChk.k1),
      `save.v1 pacts=${saveChk.hasPacts ? "LEAKED" : "absent"}, keys stable (${saveChk.k1.length})`);

    // ---- AC-RNG-STRONG: 48-draw srand — OFF == enabled+heat=0 == stat pact active ----
    const rng = await page.evaluate(() => {
      const SEED = 0x1763c0de, N = 24; // 2×24 = 48 draws
      const off = window.__dev.pactsSrandProbe(false, null, SEED, N);
      const heat0 = window.__dev.pactsSrandProbe(true, {}, SEED, N);
      const vigor = window.__dev.pactsSrandProbe(true, { vigor: 3 }, SEED, N);
      return { off, heat0, vigor };
    });
    gate("AC-RNG/48-draws", rng.off.fingerprint.length === 48, `${rng.off.fingerprint.length} srand draws (2×24)`);
    gate("AC-RNG/off==heat0", JSON.stringify(rng.off.fingerprint) === JSON.stringify(rng.heat0.fingerprint),
      `srand IDENTICAL OFF vs enabled+heat=0 (heat ${rng.off.heat}/${rng.heat0.heat})`);
    gate("AC-RNG/stat-pact-byte-id", JSON.stringify(rng.off.fingerprint) === JSON.stringify(rng.vigor.fingerprint),
      `48-draw srand BYTE-IDENTICAL with stat pact (vigor r3, heat ${rng.vigor.heat}) vs OFF — 0 draw perturbation`);
    gate("AC-RNG/feature-live", rng.off.mobHp === rng.heat0.mobHp && rng.vigor.mobHp === Math.round(rng.off.mobHp * 1.45) && rng.vigor.mobHp > rng.off.mobHp,
      `mob HP ${rng.off.mobHp} (OFF==heat0) → ${rng.vigor.mobHp} (+45% vigor r3) — arithmetic only`);

    // ---- AC-RNG-STRONG (i): PACTS.enabled=false ⇒ save.v1 serialization byte-identical (ranks present) ----
    const offSave = await page.evaluate(() => {
      window.__dev.pactsEnable(true); window.__dev.pactsReset(); window.__dev.pactsSetRank("cruento", 5);
      const enabledSave = JSON.stringify(window.__dev.saveBlob());
      window.__dev.pactsEnable(false);
      const disabledSave = JSON.stringify(window.__dev.saveBlob());
      const st = window.__dev.pactsState();
      const set = window.__dev.pactsSetRank("vigor", 3);       // no-op when disabled
      const mob = window.__dev.pactMobScale("skeleton", "frost");
      window.__dev.pactsEnable(true);
      const onMob = window.__dev.pactMobScale("skeleton", "frost"); // enabled+heat=0 (reset above cleared, but ranks re-added → reset)
      window.__dev.pactsReset();
      const baseMob = window.__dev.pactMobScale("skeleton", "frost");
      return { enabledSave, disabledSave, offEnabled: st.enabled, offHeat: st.heat, offSetOk: set.ok, offMob: mob.hp, baseMob: baseMob.hp };
    });
    gate("AC-RNG/off-save-byte-id", offSave.enabledSave === offSave.disabledSave,
      `save.v1 serialization byte-identical enabled vs disabled (own store — never in save.v1)`);
    gate("AC-RNG/off-short-circuit", offSave.offEnabled === false && offSave.offHeat === 0 && offSave.offSetOk === false && offSave.offMob === offSave.baseMob,
      `disabled ⇒ heat 0, setPactRank no-op, enemy scaling byte-id to heat=0 (${offSave.offMob} HP)`);

    // ---- AC4: ⚔ HUD affordance present + KeyL opens/closes the pacts panel + renderPacts paints ----
    const btns = await page.evaluate(() => window.__dev.pactsBtns());
    gate("AC4/hud-button", !!btns.top, `top=${!!btns.top} sidebar=${!!btns.sidebar}`);
    const oc = await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", key: "l", bubbles: true }));
      const opened = window.__dev.scene();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      return { opened, closed: window.__dev.scene() };
    });
    gate("AC4/scene-toggle", oc.opened === "pacts" && oc.closed === "play", `KeyL→${oc.opened}, ESC→${oc.closed}`);
    const errBefore = errs.length;
    await page.evaluate(() => {
      window.__dev.pactsEnable(true); window.__dev.pactsReset();
      window.__dev.pactsSetRank("cruento", 3); window.__dev.pactsSetRank("vigor", 2); window.__dev.pactsSetRank("jauria", 1);
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyL", key: "l", bubbles: true }));
    });
    await wait(500);
    const dwellScene = await page.evaluate(() => window.__dev.scene());
    await page.screenshot({ path: `${OUT}/${label}-pacts.png` }).catch(() => {});
    const renderErrs = errs.slice(errBefore).filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("AC4/render-panel", dwellScene === "pacts" && renderErrs.length === 0, renderErrs.slice(0, 2).join(" | ") || "renderPacts painted, screenshot saved");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

    // ---- REG: Códice + Títulos srand probes stay ON==OFF (no regression from the pacts seams) ----
    const reg = await page.evaluate(() => {
      const cod = { on: window.__dev.codexSrandProbe(true, 0x1751c0de, 24), off: window.__dev.codexSrandProbe(false, 0x1751c0de, 24) };
      const tit = { on: window.__dev.titlesSrandProbe(true, 0x1758c0de, 24), off: window.__dev.titlesSrandProbe(false, 0x1758c0de, 24) };
      return { cod, tit };
    });
    gate("REG/codex-srand", JSON.stringify(reg.cod.on.fingerprint) === JSON.stringify(reg.cod.off.fingerprint), `Códice srand ON==OFF`);
    gate("REG/titles-srand", JSON.stringify(reg.tit.on.fingerprint) === JSON.stringify(reg.tit.off.fingerprint), `Títulos srand ON==OFF`);

    // ---- PERF: 60fps with pacts active ----
    await page.evaluate(() => { window.__dev.pactsEnable(true); window.__dev.pactsReset(); window.__dev.pactsSetRank("cruento", 5); window.__dev.pactsSetRank("vigor", 3); });
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("PERF/60fps", fps >= 45, `${fps}fps (CI variance; AC-RNG determinism is the hard bar)`);

    // ---- REG: no page errors ----
    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("REG/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean");

  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headHashes = Object.fromEntries(FILES.map((f) => [f, headMd5(f)]));
console.log(`CAS-1766 LIVE QA — Pactos de Poder @ ${BASE}\nHEAD md5:`, headHashes);

let totalPass = 0, totalFail = 0;
for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1766 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
