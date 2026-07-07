// ===========================================================================
// CAS-1756 — LIVE QA: Códice de Botín (Collection Log). Verifies the CAS-1752
// build (deployed by CAS-1753) on the canonical gh-pages URL. PASS x2
// (desktop + mobile), browser-per-pass. Feature = a PURE read-side account
// ledger over the shipped loot systems (uniques CAS-1632 / sets CAS-1654 /
// runes CAS-1687): first pickup of a unique/set/rune is recorded forever in
// its OWN store (mithralda.codex.v1) and grants a small permanent account
// bonus (+daño per unique, +vida per set piece / rune). Draws NO RNG.
//
//   node tools/cas1756-codex-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1753 overlay = exactly these 7 runtime blobs — HARD md5 gate):
//   game.js, input.js, persist.js, render/render.js,
//   sim/config.js, sim/gear.js, sim/sim.js
//
// Covers AC1 own-key round-trip / AC2 idempotent discovery / AC3 live+persist
// bonus / AC4 HUD affordance + scene open-close / AC5 [AC-RNG-STRONG] OFF byte
// identity + no HUD + no writes / PERF 60fps / REG boots clean.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/gear.js", "sim/sim.js"];
const OUT = "shots/cas1756"; fs.mkdirSync(OUT, { recursive: true });
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "CodexBot"; ni.blur(); }
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
      // Wipe the codex/save ONLY on the very first load so the persist-across-reload test can prove
      // the ledger survives a real reload (a blanket wipe every navigation would destroy what it tests).
      try { if (!localStorage.getItem("__cas1756_booted")) {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.arena.v1");
        localStorage.setItem("__cas1756_booted", "1"); } } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live hero)");

    // ---- dev hooks wired live ----
    const hooks = ["codexEnable", "codexReset", "codexState", "codexRecord", "codexPickup", "codexPersist", "codexSrandProbe", "codexBtns"];
    const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
    gate("HOOKS/wired", missing.length === 0, missing.length ? `missing: ${missing.join(",")}` : `${hooks.length}/${hooks.length}`);

    await page.evaluate(() => { window.__dev.codexEnable(true); window.__dev.codexReset(); });

    // ---- static content sanity: 3 sections, shipped totals, all locked at baseline ----
    const st0 = await page.evaluate(() => window.__dev.codexState());
    const totals = Object.fromEntries(st0.sections.map((s) => [s.key, s.total]));
    gate("CONTENT/sections", st0.enabled && totals.uniq === 6 && totals.set === 9 && totals.rune === 3,
      `Únicos ${totals.uniq} / Conjuntos ${totals.set} / Runas ${totals.rune}`);
    gate("CONTENT/baseline-empty", st0.sections.every((s) => s.found === 0) && st0.bonus.dmg === 0 && st0.bonus.hp === 0, "0 discovered, 0 bonus");

    // ---- AC2: first pickup records exactly one; repeat idempotent ----
    const disc = await page.evaluate(() => {
      const a = window.__dev.codexPickup("uniq", "reloj_vacio");
      const foundAfterFirst = a.state.sections.find((s) => s.key === "uniq").found;
      const b = window.__dev.codexRecord("uniq", "reloj_vacio");
      return { dirtied: a.dirtiedForFlush, foundAfterFirst, foundAfterRepeat: b.state.sections.find((s) => s.key === "uniq").found, repeatRecorded: b.recorded };
    });
    gate("AC2/first-records-one", disc.foundAfterFirst === 1 && disc.dirtied, `found=${disc.foundAfterFirst} dirty=${disc.dirtied}`);
    gate("AC2/repeat-idempotent", disc.foundAfterRepeat === 1 && disc.repeatRecorded === false, `found=${disc.foundAfterRepeat} recorded=${disc.repeatRecorded}`);

    // ---- AC3: bonus moves LIVE dmg/maxHp; math = counts × magnitudes ----
    const bonus = await page.evaluate(() => {
      window.__dev.codexReset();
      const base = window.__dev.codexState().hero;
      window.__dev.codexPickup("uniq", "reloj_vacio");
      window.__dev.codexPickup("uniq", "corazon_titan");
      window.__dev.codexPickup("set", "vigia_arma");
      window.__dev.codexPickup("rune", "rubi");
      return { base, s: window.__dev.codexState() };
    });
    const n = Object.fromEntries(bonus.s.sections.map((x) => [x.key, x.found]));
    const expDmg = n.uniq * 2, expHp = n.set * 15 + n.rune * 10;
    gate("AC3/bonus-math", bonus.s.bonus.dmg === expDmg && bonus.s.bonus.hp === expHp && bonus.s.hero.codexDmg === expDmg && bonus.s.hero.codexHp === expHp,
      `${n.uniq}×2=+${expDmg}dmg, ${n.set}×15+${n.rune}×10=+${expHp}hp`);
    gate("AC3/live-combat", bonus.s.hero.dmg === bonus.base.dmg + expDmg && bonus.s.hero.maxHp === bonus.base.maxHp + expHp,
      `dmg ${bonus.base.dmg}→${bonus.s.hero.dmg}, maxHp ${bonus.base.maxHp}→${bonus.s.hero.maxHp}`);

    // ---- AC1: ledger round-trips through its OWN blob ----
    const rt = await page.evaluate(() => window.__dev.codexPersist());
    const rtB = JSON.stringify(rt.before.sections.map((s) => [s.key, s.found]));
    const rtA = JSON.stringify(rt.after.sections.map((s) => [s.key, s.found]));
    gate("AC1/own-blob-roundtrip", !!rt.blob && rt.blob.v === 1 && !!rt.blob.uniq && rt.clearedFirst && rtB === rtA && rt.after.bonus.dmg === rt.before.bonus.dmg && rt.after.bonus.hp === rt.before.bonus.hp,
      `mithralda.codex.v1 v=${rt.blob && rt.blob.v}`);

    // ---- AC3(persist): bonus survives a real reload (reconciled at boot) ----
    const reload = await page.evaluate(() => {
      window.__dev.codexEnable(true); window.__dev.codexReset();
      window.__dev.codexPickup("uniq", "colmillo_pavido");
      window.__dev.codexPickup("set", "cazador_arma");
      window.__dev.codexPickup("rune", "zafiro");
      return { before: window.__dev.codexState() };
    });
    await wait(2600); // > SAVE_THROTTLE so tick() flushes codexDirty
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 20000 });
    const after = await page.evaluate(() => window.__dev.codexState());
    const rlB = JSON.stringify(reload.before.sections.map((s) => [s.key, s.found]));
    const rlA = JSON.stringify(after.sections.map((s) => [s.key, s.found]));
    gate("AC3/persist-reload", rlB === rlA && after.bonus.dmg === reload.before.bonus.dmg && after.bonus.hp === reload.before.bonus.hp && after.hero && after.hero.codexHp === reload.before.bonus.hp,
      `+${after.bonus.dmg}dmg / +${after.bonus.hp}hp re-applied at boot`);

    // ---- AC4: HUD affordance + scene open/close + renderCodex paints mixed state ----
    const hud = await page.evaluate(() => window.__dev.codexBtns());
    gate("AC4/hud-button", !!hud.top, `top=${!!hud.top} sidebar=${!!hud.sidebar}`);
    const oc = await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", key: "k", bubbles: true }));
      const opened = window.__dev.scene();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }));
      return { opened, closed: window.__dev.scene() };
    });
    gate("AC4/scene-toggle", oc.opened === "codex" && oc.closed === "play", `K→${oc.opened}, ESC→${oc.closed}`);
    const errBefore = errs.length;
    await page.evaluate(() => {
      window.__dev.codexEnable(true); window.__dev.codexReset();
      window.__dev.codexRecord("uniq", "reloj_vacio"); window.__dev.codexRecord("uniq", "corazon_titan");
      window.__dev.codexRecord("set", "vigia_arma"); window.__dev.codexRecord("rune", "esmeralda");
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", key: "k", bubbles: true }));
    });
    await wait(500);
    const dwellScene = await page.evaluate(() => window.__dev.scene());
    await page.screenshot({ path: `${OUT}/${label}-codex.png` }).catch(() => {});
    const renderErrs = errs.slice(errBefore).filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("AC4/render-mixed", dwellScene === "codex" && renderErrs.length === 0, renderErrs.slice(0, 2).join(" | ") || "no crash, screenshot saved");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));

    // ---- AC5 [AC-RNG-STRONG]: OFF ⇒ no writes, 0 bonus, no HUD, srand byte-identical ----
    const off = await page.evaluate(() => {
      const SEED = 0x1751c0de, PROBE = 24;
      const on = window.__dev.codexSrandProbe(true, SEED, PROBE);
      const disabled = window.__dev.codexSrandProbe(false, SEED, PROBE);
      window.__dev.codexEnable(false);
      const st = window.__dev.codexState();
      const btns = window.__dev.codexBtns();
      const rec = window.__dev.codexRecord("uniq", "guante_berserker");
      window.__dev.codexEnable(true);
      return { on, disabled, st, btns, rec };
    });
    gate("AC5/srand-byte-identical", JSON.stringify(off.on.fingerprint) === JSON.stringify(off.disabled.fingerprint), `${off.on.fingerprint.length} draws ON==OFF`);
    gate("AC5/feature-works", off.on.uniqFound === 1 && off.disabled.uniqFound === 0, `ON found=${off.on.uniqFound}, OFF found=${off.disabled.uniqFound}`);
    const offClean = off.st.sections.every((s) => s.found === 0) && off.st.bonus.dmg === 0 && off.st.bonus.hp === 0 && off.st.hero.codexDmg === 0 && off.st.hero.codexHp === 0;
    gate("AC5/off-no-hud-no-writes", offClean && !off.btns.top && !off.btns.sidebar && off.rec.recorded === false, `bonus=0 hud=${!!off.btns.top} rec=${off.rec.recorded}`);

    // ---- PERF: 60fps with codex bonus live ----
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
console.log(`CAS-1756 LIVE QA — Códice de Botín @ ${BASE}\nHEAD md5:`, headHashes);

let totalPass = 0, totalFail = 0;
for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1756 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
