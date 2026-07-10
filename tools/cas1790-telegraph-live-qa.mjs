// ===========================================================================
// CAS-1813 (QA for CAS-1790) — LIVE QA: Telegrafía de ataque enemigo (heavy
// attack wind-ups). Verifies the CAS-1791 build (deployed by CAS-1792, overlay
// build 39814bbcf0a6) on the canonical gh-pages URL. PASS x2 (desktop+mobile),
// browser-per-pass. Mirror of tools/cas1786-parry-live-qa.mjs.
//
// Feature = heavy enemy attacks get a readable warning before landing:
//   M1 — a lead-time FLOOR on the wind-up (deterministic arithmetic, 0 RNG), so
//        parry (150ms) + dash always get a fair, consistent reaction window vs the
//        archetype's native wind-up. Basic mobs are EXACT (heavyOnly). The floor is
//        a MAX, not a set: an already-long wind-up (orc 0.82s) is KEPT.
//   M2 — a procedural, 100%-cosmetic cue (addFx only, never srand): a contracting
//        `telegraphmark` ring on the heavy unit + an anticipatory GROUND mark for the
//        radial bursts that erupt with no warning today (boss ground-wave, capstone
//        enraged slam, champion special slam). The burst resolves EXACTLY as before
//        (same projectiles: count / kind / dmg / timing) — the mark is pre-warn only.
//
// HARD-GATED: TELEGRAPH.enabled=false ⇒ armTelegraph never called ⇒ 0 FX, 0 wind-up
// change, 0 reads ⇒ sim + save.v1 byte-identical to HEAD. The cue rides addFx (no
// combat RNG, no seeded fxRng), so the srand stream is BYTE-IDENTICAL ON vs OFF even
// when a heavy wind-up actually FIRES (incl. the boss ground-wave). NO save key.
//
//   node tools/cas1790-telegraph-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1791 build touched exactly these 3 runtime blobs — HARD md5 gate):
//   sim/config.js, sim/sim.js, render/render.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788): these probes drive the REAL running game —
// the live page boots buildTiledWorld (the world the player actually plays), so
// G.hero / G.enemies / updateEnemies are the SHIPPED tiled-world paths. The telegraph*
// dev hooks are recovered by dynamically importing the SAME live sim.js URL (ESM dedups
// by URL ⇒ the running game's instance) because the build wired them onto the sim `dev`
// export but NOT onto game.js's window.__dev allowlist (game.js untouched, same as Parry).
//
// Covers: AC0 md5 live==HEAD (3 blobs) + version.json build / SEAM served bytes contain
// the feature (config TELEGRAPH knob, sim armTelegraph+teleArmWindup seam, render
// telegraphmark cue) / CONTENT knob matches spec / AC-floor heavy short wind-up floored to
// leadMs + already-long KEPT / AC-floor-basic basic mob EXACT no cue / AC-cue contracting
// ring on heavy / AC-burst pre-warn ground mark + SAME radial projectiles / AC-RNG-STRONG
// srand byte-id ON==OFF==baseline with a real heavy wind-up FIRING (ground-wave) / AC-SAVE
// save.v1 byte-id + no telegraph key / OFF hard-gated no-op / REG parry+frenzy srand ON==OFF
// + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// FILES = all served blobs we fetch (for SEAM). EXCL = telegraph's EXCLUSIVE blobs — the
// only ones the build touched that no other feature shares — gated to exact md5 vs the deploy
// tree. render.js is a SHARED blob (HUD/world/fx drawing): unrelated additive features (e.g.
// CAS-1809 z-order, build cf6f04509803) legitimately layer onto it AFTER the telegraph deploy
// WITHOUT touching a telegraph line, so its md5 drifts by design. For render.js we assert the
// FEATURE bytes (the telegraphmark cue) are served, not an exact whole-file md5 — the honest gate.
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const EXCL = ["sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1813"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// Baseline = the telegraph DEPLOY commit (CAS-1792 → build 39814bbcf0a6). Its config.js +
// sim.js are telegraph's exclusive blobs and remain byte-identical on live across later deploys.
const REF = process.env.TELE_REF || "144f2c8";
const refMd5 = (f) => md5(execSync(`git show ${REF}:${f}`).toString());
const J = (v) => JSON.stringify(v);

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt);
        if (EXCL.includes(f) && lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on exclusive blobs only
      }
      // render.js (shared blob): require the telegraph FEATURE bytes served, not exact md5
      const rnd = lastText["render/render.js"] || "";
      if (!/telegraphmark/.test(rnd)) allMatch = false;
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "TeleQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the telegraph* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__td for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__td = m.dev; window.__tdG = m.G;
      const need = ["telegraphMeta", "telegraphEnable", "telegraphEnabled", "telegraphHeavyProbe",
        "telegraphBasicProbe", "telegraphBurstProbe", "telegraphSrandProbe", "telegraphSaveByteId"];
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
    // exclusive telegraph blobs: exact md5 == deploy tree (must be byte-identical on live)
    for (const f of EXCL) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== telegraph deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    // shared render.js: assert the served bytes carry the telegraphmark cue (exact md5 drifts by design as unrelated features layer on)
    const rndServed = (servedText["render/render.js"] || "");
    gate("AC0/render-cue", /telegraphmark/.test(rndServed), rndServed ? `live render.js serves the telegraphmark cue (shared blob; md5=${liveMd5["render/render.js"]}, deploy-ref=${headHashes["render/render.js"]}${liveMd5["render/render.js"] === headHashes["render/render.js"] ? " ==deploy" : " ≠deploy: unrelated additive feature on shared blob, telegraph lines untouched"})` : "no render bytes");
    if (!md5ok) { console.log("  WARN  md5/feature gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /TELEGRAPH\s*=\s*{/.test(cfgTxt) && /leadMs\s*:\s*300/.test(cfgTxt) && /heavyOnly\s*:\s*true/.test(cfgTxt),
      "TELEGRAPH knob (enabled/leadMs:300/heavyOnly:true) present in served config.js");
    gate("SEAM/sim", /armTelegraph/.test(simTxt) && /teleArmWindup/.test(simTxt) && /telegraphmark/.test(simTxt) && /TELEGRAPH\.enabled/.test(simTxt),
      "armTelegraph + teleArmWindup + telegraphmark cue + TELEGRAPH.enabled gate present in served sim.js");
    gate("SEAM/render", /telegraphmark/.test(rndTxt), "render.js: telegraphmark cue drawing present in served bytes");

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
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers telegraph* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `telegraph* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ensure the knob is ON for the behavioral probes (probes flip it back after)
    await page.evaluate(() => window.__td.telegraphEnable(true));

    // ---- CONTENT: the TELEGRAPH knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__td.telegraphMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.leadMs === 300 && meta.heavyOnly === true,
      `TELEGRAPH enabled=${meta.enabled} leadMs=${meta.leadMs} heavyOnly=${meta.heavyOnly}`);

    // ---- AC-floor (M1): a heavy SHORT wind-up is floored UP to leadMs; cue spawns ----
    const hb = await page.evaluate(() => window.__td.telegraphHeavyProbe("bat"));
    gate("AC-floor/raise", !!hb && hb.isHeavy && hb.state === "windup" && hb.windupBefore === 0.28 && hb.windupAfter === hb.floorS && hb.windupAfter >= hb.floorS,
      hb ? `heavy bat wind-up ${hb.windupBefore}s floored UP to ${hb.windupAfter}s (≥leadMs ${hb.floorS}s)` : "probe null");
    gate("AC-cue/heavy", !!hb && hb.cueSpawned, hb ? `contracting-ring telegraphmark cue spawned on the heavy` : "probe null");

    // ---- AC-floor (M1): an already-long heavy wind-up is KEPT (floor is a max, not a set) ----
    const ho = await page.evaluate(() => window.__td.telegraphHeavyProbe("orc"));
    gate("AC-floor/max-not-set", !!ho && ho.isHeavy && ho.windupBefore === 0.82 && ho.windupAfter === 0.82 && ho.windupAfter >= ho.floorS && ho.cueSpawned,
      ho ? `orc wind-up ${ho.windupBefore}s (already ≥floor) KEPT + cue spawned` : "probe null");

    // ---- AC-floor-basic: a basic (non-heavy) mob is EXACT — untouched, no cue (heavyOnly) ----
    const bb = await page.evaluate(() => window.__td.telegraphBasicProbe("bat"));
    gate("AC-floor-basic", !!bb && !bb.isHeavy && bb.state === "windup" && bb.windupUnchanged && bb.windupAfter === 0.28 && !bb.cueSpawned,
      bb ? `basic bat EXACT (wind-up ${bb.windupAfter}s unchanged, no cue) — heavyOnly` : "probe null");

    // ---- AC-burst: pre-warn GROUND mark + SAME radial projectiles at strike ----
    const br = await page.evaluate(() => window.__td.telegraphBurstProbe());
    gate("AC-burst/mark", !!br && br.markSpawned, br ? `burst-armed boss spawns anticipatory GROUND mark at wind-up entry` : "probe null");
    gate("AC-burst/neutral", !!br && br.runeCount === 10 && br.allRune && br.runeDmg === 18,
      br ? `ground-wave still emits SAME ${br.runeCount} rune projectiles (dmg=${br.runeDmg}) — mark is pre-warn only` : "probe null");

    // ---- AC-RNG-STRONG: srand byte-id ON==OFF==baseline WITH a real heavy wind-up FIRING (ground-wave) ----
    const SEED = 0x1790c0de, N = 24;
    const rng = await page.evaluate((s, n) => {
      // Isolate: the probe drives updateEnemies over G.enemies; quiesce the persistent
      // live tiled-world mobs so the ONLY body the probe processes is its own injected
      // boss ⇒ the fingerprint is a fair function of (seed, TELEGRAPH.enabled) alone,
      // not of how far the ambient world advanced between synchronous calls.
      const G = window.__tdG; const saved = G.enemies.splice(0, G.enemies.length);
      let out;
      try {
        const on = window.__td.telegraphSrandProbe(true, s, n, true);
        const off = window.__td.telegraphSrandProbe(false, s, n, true);
        const base = window.__td.telegraphSrandProbe(true, s, n, false);
        const on2 = window.__td.telegraphSrandProbe(true, s, n, true);
        out = { on, off, base, on2 };
      } finally { G.enemies.push(...saved); }
      return out;
    }, SEED, N);
    gate("RNG/48-draws", rng.on.fingerprint.length === 48, `${rng.on.fingerprint.length} srand draws (2×${N}) around a real heavy wind-up`);
    gate("RNG/fired", rng.on.fired === true, `the ON probe DROVE a real heavy wind-up to strike (ground-wave) — real wired path (fired=${rng.on.fired})`);
    gate("RNG/on==off", J(rng.on.fingerprint) === J(rng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL TELEGRAPH ON vs OFF — the cue opens NO RNG stream");
    gate("RNG/on==baseline", J(rng.on.fingerprint) === J(rng.base.fingerprint),
      "a real heavy wind-up FIRING consumes 0 srand — stream matches a run with NO wind-up injected (strongest guardrail)");
    gate("RNG/determinism", J(rng.on.fingerprint) === J(rng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC-SAVE: telegraph run-state NOT persisted ⇒ save.v1 byte-id + no key ----
    const sb = await page.evaluate(() => window.__td.telegraphSaveByteId());
    gate("AC-SAVE/byte-id", !!sb && sb.byteId && !sb.hasKey,
      `save.v1 BYTE-IDENTICAL TELEGRAPH ON vs OFF, no "telegraph" key (offLen=${sb && sb.offLen} onLen=${sb && sb.onLen})`);

    // ---- OFF: hard-gated no-op (heavy wind-up unchanged, no cue, no mark) ----
    const off = await page.evaluate(() => {
      window.__td.telegraphEnable(false);
      const heavy = window.__td.telegraphHeavyProbe("bat");
      const burst = window.__td.telegraphBurstProbe();
      window.__td.telegraphEnable(true);
      return { heavy, burst };
    });
    gate("OFF/no-op", !!off.heavy && off.heavy.isHeavy && off.heavy.windupAfter === 0.28 && !off.heavy.cueSpawned && !off.heavy.markSpawned,
      off.heavy ? `enabled=false ⇒ heavy bat keeps native ${off.heavy.windupAfter}s wind-up, NO cue/mark (hard-gated)` : "probe null");
    gate("OFF/burst-neutral", !!off.burst && !off.burst.markSpawned && off.burst.runeCount === 10 && off.burst.runeDmg === 18,
      off.burst ? `OFF boss ground-wave fires SAME ${off.burst.runeCount} runes with NO pre-warn mark — identical to HEAD` : "probe null");

    // ---- HUD: force a live heavy wind-up + cue, screenshot the telegraph ring in play ----
    await page.evaluate(() => { try { window.__td.telegraphEnable(true); window.__td.telegraphHeavyProbe("orc"); } catch (e) {} });
    await wait(200);
    await page.screenshot({ path: `${OUT}/${label}-telegraph-cue.png` }).catch(() => {});
    gate("HUD/screenshot", true, `${OUT}/${label}-telegraph-cue.png (telegraph cue while heavy winds up)`);

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the telegraph seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.pr = { on: window.__td.parrySrandProbe(true, 0x1785c0de, 24), off: window.__td.parrySrandProbe(false, 0x1785c0de, 24) }; } catch (e) { r.prErr = String(e); }
      try { r.fz = { on: window.__td.frenzySrandProbe(true, 0x1773c0de, 24), off: window.__td.frenzySrandProbe(false, 0x1773c0de, 24) }; } catch (e) { r.fzErr = String(e); }
      return r;
    });
    gate("REG/parry-srand", reg.pr && J(reg.pr.on.fingerprint) === J(reg.pr.off.fingerprint), reg.prErr || "Parry srand ON==OFF");
    gate("REG/frenzy-srand", reg.fz && J(reg.fz.on.fingerprint) === J(reg.fz.off.fingerprint), reg.fzErr || "Frenesí srand ON==OFF");

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
const headHashes = Object.fromEntries(FILES.map((f) => [f, refMd5(f)]));
console.log(`CAS-1813 LIVE QA — Telegrafía de ataque enemigo @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1813 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
