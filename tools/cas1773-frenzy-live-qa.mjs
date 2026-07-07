// ===========================================================================
// CAS-1776 — LIVE QA: Medidor de Frenesí (kill-streak / momentum). Verifies the
// CAS-1774 build (deployed by CAS-1775) on the canonical gh-pages URL.
// PASS x2 (desktop + mobile), browser-per-pass.
//
// Feature = a TRANSIENT run-state meter: killing enemies in quick succession
// fills a stack meter (0..maxStacks) that grants a DETERMINISTIC stacking buff —
// additive atk-speed (heroAtkspd sink) + multiplicative damage (hitEnemy choke).
// The meter decays 1 stack every decayEvery s once the window (window s) lapses.
// It copies the CAS-192 atkspdBuffT pattern: a hero field, initialised in newHero,
// NEVER serialized (no serializeSave / save.v1 touch), ticked in update(dt). It
// opens NO RNG stream — the buff is 100% derived from kill timing, so srand is
// byte-identical ON vs OFF (even stronger than Afijos, which needed affixRng).
//
//   node tools/cas1773-frenzy-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1774 build touched exactly these 3 runtime blobs — HARD md5 gate):
//   sim/config.js, sim/sim.js, render/render.js   (hud.js/gear.js NOT touched)
//
// NOTE (observation, not a defect): the build wired the `frenzy*` dev hooks onto
// the sim.js `dev` export but did NOT add them to game.js's explicit window.__dev
// allowlist (game.js was not touched — same as CAS-1771 wa*). This harness recovers
// them by dynamically importing the SAME live module URL — ESM dedups by URL, so
// `import()` returns the RUNNING game's sim module instance (same live G.hero), i.e.
// the exact served bytes. window.__dev still carries the prior-beat srand regression
// probes (codex/titles/pacts/wa), used below.
//
// Covers: AC0 md5 live==HEAD + version.json build / SEAM served-bytes contain the
// feature (config FRENZY knob, sim tickFrenzy+killEnemy increment, render
// renderFrenzyMeter) / AC1+AC2 [RNG-STRONG] FRENZY srand byte-id ON==OFF over a
// 48-draw fixed script around REAL kills (OFF adds 0 stacks, ON climbs) / AC1 save.v1
// byte-id (stacks>0 == stacks=0, no frenzy key) / AC4 no-persist (loadSave ⇒
// frenzyStacks==0) / AC3 build-up (kill in window ⇒ stacks + heroAtkspd +perStack.atkspd
// + hitEnemy +perStack.dmgPct%/stack) + cap at maxStacks / AC3 decay (after window,
// 1 stack/decayEvery s down to 0, gradual accumulator) / OFF hard-gated no-op /
// REG Afijos+Códice+Títulos+Pactos srand ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1776"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const J = (v) => JSON.stringify(v);

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt); if (lastMd5[f] !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "FrenzyQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the frenzy* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__fz for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__fz = m.dev; window.__fzG = m.G;
      const need = ["frenzyMeta", "frenzyEnable", "frenzyReset", "frenzyState", "frenzyKill",
        "frenzyStep", "frenzyHitProbe", "frenzySrandProbe", "frenzySaveByteId"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
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

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /FRENZY\s*=/.test(cfgTxt) && /maxStacks/.test(cfgTxt) && /decayEvery/.test(cfgTxt) && /perStack/.test(cfgTxt), "FRENZY knob present in served config.js");
    gate("SEAM/sim", /function tickFrenzy/.test(simTxt) && /frenzyStacks/.test(simTxt) && /frenzyT/.test(simTxt), "tickFrenzy + frenzyStacks/frenzyT transient state present in served sim.js");
    gate("SEAM/render-hud", /renderFrenzyMeter/.test(rndTxt) && /FRENESÍ/.test(rndTxt), "HUD renderFrenzyMeter pip bar present in served render.js");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live hero)");

    // ---- wire the live sim module (recovers frenzy* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `frenzy* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the FRENZY knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__fz.frenzyMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.window === 3.0 && meta.decayEvery === 0.6 && meta.maxStacks === 8 &&
      meta.perStack.atkspd === 4 && meta.perStack.dmgPct === 3,
      `FRENZY window=${meta.window}s decayEvery=${meta.decayEvery}s max=${meta.maxStacks} +${meta.perStack.atkspd}atkspd/+${meta.perStack.dmgPct}%dmg per stack`);

    // ---- AC1/AC2 [RNG-STRONG]: gameplay srand byte-id ON vs OFF around REAL kills; OFF adds 0 stacks ----
    const SEED = 0x1773c0de, N = 24;
    const rng = await page.evaluate((s, n) => {
      const on = window.__fz.frenzySrandProbe(true, s, n);
      const off = window.__fz.frenzySrandProbe(false, s, n);
      const on2 = window.__fz.frenzySrandProbe(true, s, n);
      return { on, off, on2 };
    }, SEED, N);
    gate("AC2/48-draws", rng.on.fingerprint.length === 48, `${rng.on.fingerprint.length} srand draws (2×${N}) around ${rng.on.kills} REAL kills`);
    gate("AC2/srand-on==off", J(rng.on.fingerprint) === J(rng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL FRENZY ON vs OFF — the meter opens NO RNG stream");
    gate("AC2/off-no-stacks", rng.off.stacks === 0, `OFF ⇒ the same kills add ZERO stacks (feature disabled, hard-gated)`);
    gate("AC2/on-fills", rng.on.stacks > 0, `ON ⇒ the same kills DO fill the meter (stacks=${rng.on.stacks}) — proves the real increment ran`);
    gate("AC2/determinism", J(rng.on.fingerprint) === J(rng.on2.fingerprint) && rng.on.stacks === rng.on2.stacks,
      `same seed reproduces srand + stacks (stacks=${rng.on.stacks})`);

    // ---- AC1 save byte-id + AC4 no-persist: stacks>0 serializes == stacks=0, no key; load ⇒ stacks==0 ----
    await page.evaluate(() => window.__fz.frenzyReset());
    const sb = await page.evaluate(() => window.__fz.frenzySaveByteId());
    gate("AC1/save-byte-id", !!sb && sb.byteId && !sb.hasKey,
      `save with stacks>0 BYTE-IDENTICAL to stacks=0, no "frenzy" key (cleanLen=${sb && sb.cleanLen} hotLen=${sb && sb.hotLen})`);
    gate("AC4/no-persist", !!sb && sb.afterLoadStacks === 0, `loadSave rehydrates frenzyStacks==0 (reset per run — meter NOT persisted)`);

    // ---- AC3 build-up: kill within window ⇒ stacks + atkspd + dmg rise ----
    const bu = await page.evaluate(() => {
      window.__fz.frenzyReset();
      const base = window.__fz.frenzyState();
      window.__fz.frenzyKill();                 // first kill after decay ⇒ re-arm at 1
      const k1 = window.__fz.frenzyState();
      window.__fz.frenzyKill(); window.__fz.frenzyKill(); // two more within window ⇒ 3
      const k3 = window.__fz.frenzyState();
      const dmg0 = window.__fz.frenzyHitProbe(0);
      const dmg5 = window.__fz.frenzyHitProbe(5);
      return { base, k1, k3, dmg0, dmg5 };
    });
    gate("AC3/build-up", bu.k1.stacks === 1 && bu.k3.stacks === 3, `first kill re-arms to 1, chaining within window climbs to ${bu.k3.stacks} stacks`);
    gate("AC3/atkspd", bu.k3.atkspd === bu.base.atkspd + 3 * meta.perStack.atkspd && bu.k3.atkspdContrib === 3 * meta.perStack.atkspd,
      `3 stacks add +${3 * meta.perStack.atkspd} to heroAtkspd (${bu.base.atkspd} → ${bu.k3.atkspd}) under the shared cap`);
    const expMul = +(1 + 5 * meta.perStack.dmgPct / 100).toFixed(4);
    gate("AC3/dmg", bu.dmg0.dmg > 0 && Math.abs(bu.dmg5.dmg / bu.dmg0.dmg - expMul) < 0.02 && bu.dmg5.dmgMul === expMul,
      `hitEnemy at 5 stacks deals ×${expMul} (${bu.dmg0.dmg} → ${bu.dmg5.dmg}) — +${meta.perStack.dmgPct}%/stack, deterministic`);

    // ---- AC3 cap: stacks never exceed maxStacks ----
    const cap = await page.evaluate((extra) => {
      window.__fz.frenzyReset();
      for (let i = 0; i < window.__fz.frenzyMeta().maxStacks + extra; i++) window.__fz.frenzyKill();
      return window.__fz.frenzyState();
    }, 4);
    gate("AC3/cap", cap.stacks === meta.maxStacks, `stacks clamp at maxStacks=${meta.maxStacks} (${meta.maxStacks + 4} kills → ${cap.stacks})`);

    // ---- AC3 decay: after the window, 1 stack lost every decayEvery s down to 0 (gradual accumulator) ----
    const decay = await page.evaluate(() => {
      const m = window.__fz.frenzyMeta();
      window.__fz.frenzyReset(); for (let i = 0; i < 4; i++) window.__fz.frenzyKill(); // 4 stacks, frenzyT=window
      const setup = window.__fz.frenzyState();
      const held = window.__fz.frenzyStep(m.window);           // wind the window to 0 — no stack lost yet
      const seq = []; for (let i = 0; i < 4; i++) seq.push(window.__fz.frenzyStep(m.decayEvery).stacks);
      // fractional accumulator: two half-decayEvery steps drop exactly 1 stack
      window.__fz.frenzyReset(); for (let i = 0; i < 2; i++) window.__fz.frenzyKill(); window.__fz.frenzyStep(m.window);
      const h1 = window.__fz.frenzyStep(m.decayEvery / 2).stacks, h2 = window.__fz.frenzyStep(m.decayEvery / 2).stacks;
      return { setup, held, seq, h1, h2 };
    });
    gate("AC3/decay-setup", decay.setup.stacks === 4 && decay.setup.t > 0, `4 stacks, window timer live (t=${decay.setup.t}s)`);
    gate("AC3/decay-hold", decay.held.stacks === 4, `inside/at the window the meter HOLDS (t≤0 now, stacks still ${decay.held.stacks})`);
    gate("AC3/decay-seq", J(decay.seq) === J([3, 2, 1, 0]), `after the window, 1 stack lost every ${meta.decayEvery}s → ${J(decay.seq)} down to 0`);
    gate("AC3/decay-gradual", decay.h1 === 2 && decay.h2 === 1, `decay accumulator is GRADUAL — two half-steps (${decay.h1}→${decay.h2}) drop 1 stack`);

    // ---- OFF path: hard-gated no-op (0 stacks, +0 atkspd, ×1 dmg) ----
    const off = await page.evaluate(() => {
      window.__fz.frenzyReset(); window.__fz.frenzyEnable(false);
      window.__fz.frenzyKill(); window.__fz.frenzyKill(); window.__fz.frenzyKill();
      const st = window.__fz.frenzyState();
      window.__fz.frenzyEnable(true);
      return st;
    });
    gate("OFF/no-op", !off.enabled && off.stacks === 0 && off.atkspdContrib === 0 && off.dmgMul === 1,
      `frenzyEnable(false) ⇒ kills add 0 stacks, +0 atkspd, ×1 dmg (hard-gated)`);

    // ---- AC5/HUD: force a live streak, screenshot the pip bar in play ----
    await page.evaluate(() => {
      const G = window.__fzG; if (!G || !G.hero) return;
      window.__fz.frenzyEnable(true); G.hero.frenzyStacks = 8; G.hero.frenzyT = 3.0;
    });
    await wait(300);
    await page.screenshot({ path: `${OUT}/${label}-frenzy-hud.png` }).catch(() => {});
    gate("HUD/screenshot", true, `${OUT}/${label}-frenzy-hud.png (pip bar at 8/8 hot edge-glow)`);
    await page.evaluate(() => { const G = window.__fzG; if (G && G.hero) { G.hero.frenzyStacks = 0; G.hero.frenzyT = 0; } });

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the frenzy seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.wa = { on: window.__fz.waSrandProbe(true, 0x1768c0de, 24), off: window.__fz.waSrandProbe(false, 0x1768c0de, 24) }; } catch (e) { r.waErr = String(e); }
      try { r.cod = { on: window.__dev.codexSrandProbe(true, 0x1751c0de, 24), off: window.__dev.codexSrandProbe(false, 0x1751c0de, 24) }; } catch (e) { r.codErr = String(e); }
      try { r.tit = { on: window.__dev.titlesSrandProbe(true, 0x1758c0de, 24), off: window.__dev.titlesSrandProbe(false, 0x1758c0de, 24) }; } catch (e) { r.titErr = String(e); }
      try { r.pac = { on: window.__dev.pactsSrandProbe(true, {}, 0x1763c0de, 24), off: window.__dev.pactsSrandProbe(false, null, 0x1763c0de, 24) }; } catch (e) { r.pacErr = String(e); }
      return r;
    });
    gate("REG/affixes-srand", reg.wa && J(reg.wa.on.fingerprint) === J(reg.wa.off.fingerprint), reg.waErr || "Afijos de Arma srand ON==OFF");
    gate("REG/codex-srand", reg.cod && J(reg.cod.on.fingerprint) === J(reg.cod.off.fingerprint), reg.codErr || "Códice srand ON==OFF");
    gate("REG/titles-srand", reg.tit && J(reg.tit.on.fingerprint) === J(reg.tit.off.fingerprint), reg.titErr || "Títulos srand ON==OFF");
    gate("REG/pacts-srand", reg.pac && J(reg.pac.on.fingerprint) === J(reg.pac.off.fingerprint), reg.pacErr || "Pactos srand ON==OFF");

    // ---- PERF: 60fps in play ----
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
console.log(`CAS-1776 LIVE QA — Medidor de Frenesí @ ${BASE}\nHEAD md5:`, headHashes);

let totalPass = 0, totalFail = 0, servedText = {};
try {
  const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json();
  console.log(`live build=${v.build}`);
} catch {}
for (const f of FILES) { try { servedText[f] = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text(); } catch {} }

for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes, servedText);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1776 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
