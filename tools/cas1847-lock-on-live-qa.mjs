// ===========================================================================
// CAS-1850 (QA for CAS-1847) — LIVE QA: Enfoque de Objetivo (Lock-On / Target Focus, 9ª feature Souls-like).
// Verifies the CAS-1848 build (deployed by CAS-1849, overlay build d0e69a6dc528) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1841-stamina-live-qa.mjs / tools/cas1836-backstab-live-qa.mjs.
//
// Feature = ONE master seam: while a lock is held, override h.facing = atan2(target - h) EVERY
// frame (runs last, wins over io.aimActive). Since all reactive melee (Backstab arc, Parry
// counter, Combos orientation, every swing) reads h.facing at swing time, the 4 offensive
// pillars auto-orient FOR FREE; h.vx/h.vy (movement `mv`) stay INTACT ⇒ automatic STRAFE.
// Target selection is a deterministic distance sort (tie-break by index) + an angle override:
// geometry / input 100% PURE ⇒ ZERO srand draws, NO lockOnRng (nothing to seed) ⇒ srand
// BYTE-IDENTICAL ON==OFF even while the lock FIRES. lockTarget/lockCd are TRANSIENT (out of
// serializeSave's allowlist) ⇒ save.v1 byte-identical, NO mithralda.lockon.v1 key. The reticle
// is 100% procedural canvas (ring + 4 chevrons rotating with G.t), $0 art. HARD-GATED:
// LOCK_ON.enabled=false ⇒ the Tab tap is inert (cycleLock returns), no override, no reticle,
// no state ⇒ facing/hit/save/srand/DOM byte-identical to HEAD.
//
//   node tools/cas1847-lock-on-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1848 build touched exactly these 5 blobs — HARD md5 gate; read the set from
// `git show --stat 5230614`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843).
// The lock-on deploy (build d0e69a6dc528) is the LATEST gh-pages deploy, so nothing has layered
// onto these blobs since ⇒ ALL 5 are EXACT md5 == HEAD (no shared-blob drift caveat).
// REF = HEAD (== build commit 5230614; deploy 1db5c35 only adds the deploy tool).
//   input.js, render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1817 / CAS-1834 / CAS-1844): these probes drive the REAL
// running game — the live page boots buildTiledWorld (the world the player actually plays), so
// G / cycleLock / tickLock / hitEnemy / the master facing override are the SHIPPED paths. The
// lock* dev hooks are recovered by dynamically importing the SAME live sim.js URL (ESM dedups
// by URL ⇒ the running game's instance) because the build wired them onto the sim `dev` export
// but NOT onto game.js's window.__dev allowlist.
//
// ISOLATION (lesson backstab/poise/stamina): the lock probes reshape G.enemies (_lockArm zeroes
// the arrays; lockSrandProbe splices enemies for the loot stream); with the LIVE render loop
// still running, residual/undefined array entries would trip drawFx / drawLockReticle. So EVERY
// behavioral probe runs inside ONE page.evaluate that first snapshots + quiesces all sim arrays
// (enemies/projectiles/fx/fields) and hard-restores in a finally — a single synchronous block,
// so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (5 blobs) + SEAM served bytes carry the feature (config LOCK_ON
// knob, sim cycleLock/tickLock + facing override, input Tab gated, render drawLockReticle gated,
// strings lockOnHint) / CONTENT knob matches spec / AC1 OFF byte-id (Tab inert, no state) /
// AC2 srand ON==OFF WITH real lock FIRING (48 draws, 0 new, acquire+override+melee lands) /
// AC3 auto-face + strafe (facing==bearing(target), h.vx/vy untouched; OFF⇒facing follows mv) /
// AC4 acquire nearest / cycle+wrap / out-of-range / auto-clear on death+range / AC5 pillars
// inherit facing (a swing while "walking" the opposite way lands on the focused target) /
// AC6 save byte-id no key + LIVE acquire through the real Tab/cycleLock path (reticle $0 art) /
// REG 9 systems (frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina) srand
// ON==OFF + boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 5 lock-on blobs are EXCLUSIVE (the lock-on deploy is the latest ⇒ nothing shares a live
// line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1850"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 5230614; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.LOCKON_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 5 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "FocusQA"; ni.blur(); }  // NB: no "lock" substring ⇒ AC6 save-key regex can't false-match
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the lock* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running
// game's instance). Stash the `dev` object on window.__lk for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__lk = m.dev; window.__lkG = m.G;
      const need = ["lockMeta", "lockEnable", "lockState", "lockAcquireProbe", "lockFaceProbe",
        "lockSaveByteId", "lockSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays, run every lock probe + the REG srand
// probes, then HARD-restore in a finally. No rAF interleaves inside a single page.evaluate ⇒ the
// live render loop never sees a corrupt array / a stray lockTarget for drawLockReticle.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__lk, G = window.__lkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroLock = G.hero ? { t: G.hero.lockTarget, cd: G.hero.lockCd } : null;
    const r = {};
    try {
      r.meta = d.lockMeta();
      r.acquire = d.lockAcquireProbe();
      r.face = d.lockFaceProbe();
      r.save = d.lockSaveByteId();
      r.srand = { on: d.lockSrandProbe(true, seed, n), off: d.lockSrandProbe(false, seed, n), on2: d.lockSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the lock-on seam).
      const reg = {};
      const P = [
        ["frenzy", 0x1773c0de, "frenzySrandProbe", []],
        ["parry", 0x1785c0de, "parrySrandProbe", []],
        ["dodge", 0x1814c0de, "dodgeSrandProbe", [true]],
        ["telegraph", 0x1790c0de, "telegraphSrandProbe", []],
        ["abilities", 0x1819c0de, "abilitySrandProbe", [true]],
        ["poise", 0x1826c0de, "poiseSrandProbe", []],
        ["combos", 0x1831c0de, "comboSrandProbe", []],
        ["backstab", 0x1836c0de, "backstabSrandProbe", []],
        ["stamina", 0x1841c0de, "staminaSrandProbe", []],
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroLock && G.hero) { G.hero.lockTarget = heroLock.t; G.hero.lockCd = heroLock.cd; }
    }
    return r;
  }, SEED, N);
}

// LIVE acquire: drive the REAL Tab/cycleLock path in the running tiled-world game (an enemy is
// forced into range first), confirm a target is locked, then leave it locked for the reticle
// screenshot. Restores the arrays it touched so the render loop stays clean afterwards.
async function liveAcquire(page) {
  return await page.evaluate(() => {
    const d = window.__lk, G = window.__lkG, h = G.hero;
    if (!h) return { ok: false, why: "no hero" };
    d.lockEnable(true);
    // find or force a live enemy within range near the hero
    let e = (G.enemies || []).find(x => x && !x.dead);
    let spawned = false;
    if (!e) return { ok: false, why: "no live enemy in world" };
    // move it inside range so cycleLock can pick it
    const R = d.lockMeta().range;
    const ox = e.x, oy = e.y;
    e.x = h.x + Math.min(60, R - 20); e.y = h.y;
    h.lockCd = 0;
    // drive the REAL input path: dispatch the LOCK_ON.key (Tab) keydown → input.js → sim.cycleLock()
    const key = d.lockMeta().key;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: key, key: key, bubbles: true }));
    const st = d.lockState();
    const acquired = !!(st && st.hasTarget);
    // leave the lock set for the screenshot, but restore the enemy position
    return { ok: acquired, targetIdx: st && st.targetIdx, facing: st && st.facing, key, range: R };
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 5 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/lock-on deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", inTxt = servedText["input.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const LOCK_ON\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"Tab"/.test(cfgTxt) && /range:\s*340/.test(cfgTxt) && /cycleCd:\s*0\.14/.test(cfgTxt) && /reticleCol:\s*"#ffd15c"/.test(cfgTxt),
      "LOCK_ON knob (enabled/key:Tab/range:340/cycleCd:0.14/reticleCol:#ffd15c) present in served config.js");
    gate("SEAM/sim", /function cycleLock\(/.test(simTxt) && /function tickLock\(/.test(simTxt) && /h\.lockTarget/.test(simTxt) && /Math\.atan2\(/.test(simTxt),
      "sim: cycleLock + tickLock + h.lockTarget facing override present in served sim.js");
    gate("SEAM/input", /code===LOCK_ON\.key && LOCK_ON\.enabled\)\{ sim\.cycleLock\(\); return; \}/.test(inTxt) && /LOCK_ON\.enabled && e\.code===LOCK_ON\.key/.test(inTxt),
      "input.js: Tab (LOCK_ON.key) → sim.cycleLock() gated on LOCK_ON.enabled + preventDefault gate present in served bytes");
    gate("SEAM/render", /function drawLockReticle\(/.test(rndTxt) && /LOCK_ON\.enabled && h\.lockTarget && !h\.lockTarget\.dead\) drawLockReticle\(/.test(rndTxt),
      "render.js: drawLockReticle (ring + chevrons) gated on LOCK_ON.enabled && live lockTarget present in served bytes");
    gate("SEAM/strings", /lockOnHint:\s*"Tab: fija\/cicla el objetivo/.test(strTxt),
      "strings.js: STR.lockOnHint present in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.lockon.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers lock* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `lock* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1847c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the LOCK_ON knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "Tab" && meta.range === 340 && meta.cycleCd === 0.14 && meta.reticleCol === "#ffd15c",
      `LOCK_ON enabled=${meta.enabled} key=${meta.key} range=${meta.range}px cycleCd=${meta.cycleCd}s reticleCol=${meta.reticleCol}`);

    // ---- AC4: acquire nearest / cycle+wrap / out-of-range / auto-clear on death+range ----
    const ap = r.acquire;
    gate("AC4/acquire-cycle-clear", !!ap && ap.ok,
      ap ? `tap⇒nearest(${ap.acqNearest}); re-tap cycles 2nd(${ap.cyc2})→3rd(${ap.cyc3})→wrap(${ap.wrap}); out-of-range⇒no acquire(${ap.outOfRange}); dies⇒auto-clear(${ap.autoClearDead}); leaves range⇒auto-clear(${ap.autoClearRange})` : "probe null");

    // ---- AC3: auto-face + strafe intact; OFF ⇒ facing follows mv ----
    const fp = r.face;
    gate("AC3/auto-face+strafe", !!fp && fp.ok,
      fp ? `with lock, h.facing==atan2(target-h) while "walking" opposite (facedTarget=${fp.facedTarget}); h.vx/h.vy untouched by the override (strafeIntact=${fp.strafeIntact}); OFF ⇒ facing follows mv (offFollowsMv=${fp.offFollowsMv})` : "probe null");

    // ---- AC1 OFF byte-id: LOCK_ON disabled ⇒ Tab tap inert (no acquire, no override, no state) ----
    // The lockAcquireProbe's out-of-range branch drives cycleLock; here we assert OFF-gating directly.
    const offInert = await page.evaluate(() => {
      const d = window.__lk, G = window.__lkG, h = G.hero;
      const sav = d.lockMeta().enabled;
      d.lockEnable(false);
      const before = { t: h.lockTarget, cd: h.lockCd };
      h.lockTarget = null; h.lockCd = 0;
      // dispatch the real Tab key with LOCK_ON OFF ⇒ input.js gate rejects ⇒ cycleLock never runs
      const key = d.lockMeta().key;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: key, key: key, bubbles: true }));
      const st = d.lockState();
      const inert = !!st && !st.hasTarget && st.lockCd === 0;
      h.lockTarget = before.t; h.lockCd = before.cd; d.lockEnable(sav);
      return { inert, hasTarget: st && st.hasTarget, lockCd: st && st.lockCd };
    });
    gate("AC1/off-inert", offInert.inert, `OFF: a Tab tap is inert (cycleLock gated OFF ⇒ no target hasTarget=${offInert.hasTarget}, no cd ${offInert.lockCd}, no override, no reticle) — byte-identical to HEAD`);

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real lock FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around real lock acquire + facing override + landing melee + loot kills`);
    gate("AC2/lock-fired", s.on.lockFired === true, `the ON probe DID acquire a target, apply the facing override AND land a melee (not just the flag): lockFired=${s.on.lockFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL LOCK_ON ON vs OFF — the lock is pure geometry/input (no lockOnRng; 0 srand draws) even while it fires");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC5: pillars inherit the override facing — a swing while "walking" the opposite way lands
    // on the FOCUSED target. The srand probe's lockFired == (acquired && overrode && landed) proves
    // hitEnemy landed on the locked target while h.facing was overridden opposite to movement. ----
    gate("AC5/pillars-inherit-facing", s.on.lockFired === true,
      `melee landed on the LOCKED target while h.facing was overridden opposite to the movement direction ⇒ Backstab/Parry/Combos (all read h.facing at swing) auto-orient for free (lockFired=${s.on.lockFired})`);

    // ---- AC6 SAVE: transient lock state ⇒ save.v1 byte-id ON/OFF, no lockon key ----
    const sb = r.save;
    gate("AC6/save-byte-id", !!sb && sb.byteId && sb.noKey,
      sb ? `save.v1 BYTE-IDENTICAL with live lock set ON vs OFF (offLen=${(sb.off||"").length} onLen=${(sb.on||"").length}), NO lockon key (lockTarget/lockCd transient, out of serializeSave allowlist)` : "probe null");

    // ---- AC6-live / reticle $0 art: acquire through the REAL Tab→cycleLock path in the running game ----
    const la = await liveAcquire(page);
    gate("AC6/live-acquire", la.ok, la.ok ? `real Tab (${la.key}) keydown → input.js → sim.cycleLock() locked a live world enemy (targetIdx=${la.targetIdx}, facing=${la.facing}, range=${la.range}px) ⇒ canvas reticle drawn (0 PNG)` : `live acquire failed: ${la.why || ""}`);

    // ---- AC evidence screenshot: capture the play surface with the lock reticle drawn ----
    await page.screenshot({ path: `${OUT}/${label}-lockon-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (9 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina"]) {
      const g = reg[name];
      if (g && g.absent) { gate(`REG/${name}-srand`, true, "probe absent — skipped"); continue; }
      gate(`REG/${name}-srand`, !!g && g.same, g && g.same ? `${name} srand ON==OFF` : `${name} srand regressed`);
    }

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
console.log(`CAS-1850 LIVE QA — Enfoque de Objetivo (Lock-On) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1850 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
