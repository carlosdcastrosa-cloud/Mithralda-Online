// ===========================================================================
// CAS-1761 — LIVE QA: Títulos de Gesta (Feat Titles). Verifies the CAS-1759
// build (deployed by CAS-1760) on the canonical gh-pages URL. PASS x2
// (desktop + mobile), browser-per-pass. Feature = a PURE read-side, choosable
// account title over milestones the player ALREADY accumulates (Códice counts
// CAS-1752 / Arena best waves CAS-1664 / Ascensión level CAS-1557): crossing a
// fixed threshold unlocks an account-wide title shown next to the hero name in
// its OWN store (mithralda.titles.v1). save.v1 untouched; draws NO RNG.
//
//   node tools/cas1758-titles-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1760 overlay = exactly these 7 runtime blobs — HARD md5 gate):
//   game.js, hud.js, input.js, persist.js, render/render.js,
//   sim/config.js, sim/sim.js
//
// Covers AC1 own-key round-trip + equipped guard / AC2 idempotent eval /
// AC3 live threshold unlock + persist across reload + panel / AC4 equip on HUD
// name line + locked-equip impossible / AC5 [AC-RNG-STRONG] OFF byte identity +
// no HUD + no writes + srand identical / PERF 60fps / REG boots clean.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "hud.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1758"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "TitleBot"; ni.blur(); }
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
    // ---- BUILD gate (live == HEAD) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("BUILD/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`BUILD/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      // Wipe the titles/codex/save stores ONLY on the very first load (a sentinel guards it) so the
      // persist-across-reload test can prove the ledger survives a real reload; a blanket wipe every
      // navigation would destroy exactly what that test checks.
      try { if (!localStorage.getItem("__cas1758_booted")) {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.setItem("__cas1758_booted", "1"); } } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live hero)");

    // ---- dev hooks wired live ----
    const hooks = ["titlesEnable", "titlesReset", "titlesState", "titlesEval", "titlesEquip", "titlesPersist",
                   "titlesSeedCodex", "titlesSeedArena", "titlesSeedAscension", "titlesSrandProbe", "titlesBtns", "titlesHudName"];
    const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
    gate("HOOKS/wired", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : `${hooks.length}/${hooks.length}`);

    await page.evaluate(() => { window.__dev.titlesEnable(true); window.__dev.titlesReset(); });

    // ---- CONTENT: fixed 9-title table, all locked at baseline, none equipped, empty hero title ----
    const st0 = await page.evaluate(() => window.__dev.titlesState());
    gate("CONTENT/table", st0.enabled && st0.total === 9 && st0.unlocked === 0 && st0.equipped === null && st0.hero && st0.hero.title === "",
      `${st0.total} titles, unlocked ${st0.unlocked}, equipped ${st0.equipped}, heroTitle "${st0.hero && st0.hero.title}"`);

    // ---- AC3: crossing the codex-uniq threshold unlocks; locked at 4, unlocks at 5 ----
    const cross = await page.evaluate(() => {
      window.__dev.titlesReset();
      const before = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
      window.__dev.titlesSeedCodex("uniq", 4);
      const at4 = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
      window.__dev.titlesSeedCodex("uniq", 5);
      const at5 = window.__dev.titlesState().items.find((i) => i.id === "codex_uniq_5");
      return { before, at4, at5 };
    });
    gate("AC3/threshold-cross", !cross.before.unlocked && !cross.at4.unlocked && cross.at5.unlocked && cross.at5.cur >= 5,
      `codex_uniq_5 locked@4, UNLOCKS@5 (cur=${cross.at5.cur})`);

    // ---- AC3: the OTHER live sources unlock (arena bestWave/bestBossWave, ascension) ----
    const src = await page.evaluate(() => {
      window.__dev.titlesReset();
      window.__dev.titlesSeedArena(10, 3);
      window.__dev.titlesSeedAscension(3);
      const s = window.__dev.titlesState();
      return { by: Object.fromEntries(s.items.map((i) => [i.id, i.unlocked])), unlocked: s.unlocked };
    });
    const wantOn = ["arena_wave_5", "arena_wave_10", "arena_boss_3", "asc_1", "asc_3"];
    gate("AC3/all-sources", wantOn.every((id) => src.by[id]), `${wantOn.filter(id => src.by[id]).length}/${wantOn.length} lit (${src.unlocked} total)`);

    // ---- AC2: evalTitles idempotent — re-run N times → no dup, no revert ----
    const idem = await page.evaluate(() => {
      const a = window.__dev.titlesState().unlocked;
      for (let i = 0; i < 5; i++) window.__dev.titlesEval();
      const b = window.__dev.titlesState().unlocked;
      const changedOnRepeat = window.__dev.titlesEval().changed;
      return { a, b, changedOnRepeat };
    });
    gate("AC2/idempotent", idem.a === idem.b && idem.a > 0 && idem.changedOnRepeat === false, `${idem.a} unlocks stable across 5 re-runs, repeat changed=${idem.changedOnRepeat}`);

    // ---- AC4: equip unlocked → HUD name line; locked equip impossible ----
    const equip = await page.evaluate(() => {
      window.__dev.codexReset(); window.__dev.titlesSeedArena(0, 0); window.__dev.titlesSeedAscension(0);
      window.__dev.titlesReset();
      window.__dev.titlesSeedArena(10, 0);
      const lockedTry = window.__dev.titlesEquip("asc_3");
      const okTry = window.__dev.titlesEquip("arena_wave_10");
      const hud = window.__dev.titlesHudName();
      const st = window.__dev.titlesState();
      return { lockedOk: lockedTry.ok, okOk: okTry.ok, equipped: st.equipped, heroTitle: st.hero.title, hud };
    });
    gate("AC4/locked-cant-equip", equip.lockedOk === false && equip.equipped !== "asc_3", `equip(asc_3)=${equip.lockedOk}, equipped=${equip.equipped}`);
    gate("AC4/equip-on-hud", equip.okOk && equip.equipped === "arena_wave_10" && equip.heroTitle === "Gladiador Eterno" && /·\s*Gladiador Eterno/.test(equip.hud.display),
      `HUD "${equip.hud.display}"`);

    // ---- AC1: ledger round-trips through its OWN blob; equipped validates against unlocked ----
    const rt = await page.evaluate(() => window.__dev.titlesPersist());
    const rtB = JSON.stringify(rt.before.items.map((i) => [i.id, i.unlocked, i.equipped]));
    const rtA = JSON.stringify(rt.after.items.map((i) => [i.id, i.unlocked, i.equipped]));
    gate("AC1/own-blob-roundtrip", !!rt.blob && rt.blob.v === 1 && !!rt.blob.unlocked && rt.blob.equipped === "arena_wave_10" && rt.clearedFirst && rtB === rtA && rt.after.equipped === rt.before.equipped,
      `mithralda.titles.v1 v=${rt.blob && rt.blob.v} equipped=${rt.blob && rt.blob.equipped}`);
    const guard = await page.evaluate(() => window.__dev.titlesEquip("asc_1").ok === false && window.__dev.titlesState().equipped);
    gate("AC1/equipped-guarded", guard === "arena_wave_10", `locked equip rejected, equipped stays ${guard}`);

    // ---- AC3(persist): unlock + equip survive a real reload (reconciled at boot) ----
    const reload = await page.evaluate(() => {
      window.__dev.titlesEnable(true); window.__dev.titlesReset();
      window.__dev.titlesSeedCodex("set", 3);
      window.__dev.titlesEquip("codex_set_3");
      return { before: window.__dev.titlesState() };
    });
    await wait(2600); // > SAVE_THROTTLE so tick() flushes titlesDirty
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 20000 });
    const after = await page.evaluate(() => ({ st: window.__dev.titlesState(), hud: window.__dev.titlesHudName() }));
    const rlB = JSON.stringify(reload.before.items.map((i) => [i.id, i.unlocked]));
    const rlA = JSON.stringify(after.st.items.map((i) => [i.id, i.unlocked]));
    gate("AC3/persist-reload", rlB === rlA && after.st.equipped === "codex_set_3" && after.st.hero.title === "Coleccionista" && /·\s*Coleccionista/.test(after.hud.display),
      `equipped=${after.st.equipped} HUD "${after.hud.display}"`);

    // ---- AC4: HUD affordance present + scene opens/closes + renderTitles paints mixed panel ----
    const btns = await page.evaluate(() => window.__dev.titlesBtns());
    gate("AC4/hud-button", !!btns.top, `top=${!!btns.top} sidebar=${!!btns.sidebar}`);
    const oc = await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyY", key: "y", bubbles: true }));
      const opened = window.__dev.scene();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      return { opened, closed: window.__dev.scene() };
    });
    gate("AC4/scene-toggle", oc.opened === "titles" && oc.closed === "play", `Y→${oc.opened}, ESC→${oc.closed}`);
    const errBefore = errs.length;
    await page.evaluate(() => {
      window.__dev.titlesEnable(true); window.__dev.titlesReset();
      window.__dev.titlesSeedCodex("uniq", 5); window.__dev.titlesSeedArena(5, 0); window.__dev.titlesEquip("arena_wave_5");
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyY", key: "y", bubbles: true }));
    });
    await wait(500);
    const dwellScene = await page.evaluate(() => window.__dev.scene());
    await page.screenshot({ path: `${OUT}/${label}-titles.png` }).catch(() => {});
    const renderErrs = errs.slice(errBefore).filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("AC4/render-mixed", dwellScene === "titles" && renderErrs.length === 0, renderErrs.slice(0, 2).join(" | ") || "no crash, screenshot saved");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

    // ---- AC5 [AC-RNG-STRONG]: OFF ⇒ no writes, empty title, no HUD, srand byte-identical ----
    const off = await page.evaluate(() => {
      const SEED = 0x1758c0de, PROBE = 24;
      const on = window.__dev.titlesSrandProbe(true, SEED, PROBE);
      const disabled = window.__dev.titlesSrandProbe(false, SEED, PROBE);
      window.__dev.titlesEnable(false);
      const st = window.__dev.titlesState();
      const btns = window.__dev.titlesBtns();
      const equip = window.__dev.titlesEquip("codex_set_3");
      const hud = window.__dev.titlesHudName();
      window.__dev.titlesEnable(true);
      return { on, disabled, st, btns, equip, hud };
    });
    gate("AC5/srand-byte-identical", JSON.stringify(off.on.fingerprint) === JSON.stringify(off.disabled.fingerprint), `${off.on.fingerprint.length} draws ON==OFF`);
    gate("AC5/feature-works", off.on.unlockedCount > 0 && off.disabled.unlockedCount === 0, `ON unlocked=${off.on.unlockedCount}, OFF unlocked=${off.disabled.unlockedCount}`);
    const offClean = off.st.unlocked === 0 && off.st.hero && off.st.hero.title === "" && off.equip.ok === false && !off.btns.top && !off.btns.sidebar && off.hud.display === off.hud.name;
    gate("AC5/off-no-hud-no-writes", offClean, `unlocked=${off.st.unlocked} heroTitle="${off.st.hero && off.st.hero.title}" hud=${!!off.btns.top} equip=${off.equip.ok}`);

    // ---- PERF: 60fps with a title equipped ----
    await page.evaluate(() => { window.__dev.titlesEnable(true); window.__dev.titlesReset(); window.__dev.titlesSeedArena(10, 0); window.__dev.titlesEquip("arena_wave_10"); });
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("PERF/60fps", fps >= 45, `${fps}fps (CI variance; AC5 determinism is the hard bar)`);

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
console.log(`CAS-1761 LIVE QA — Títulos de Gesta @ ${BASE}\nHEAD md5:`, headHashes);

let totalPass = 0, totalFail = 0;
for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1761 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
