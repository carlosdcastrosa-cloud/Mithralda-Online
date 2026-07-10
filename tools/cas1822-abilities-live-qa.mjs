// ===========================================================================
// CAS-1822 (QA for CAS-1819) — LIVE QA: Habilidades especiales telegrafiadas.
// Verifies the CAS-1820 build (deployed by CAS-1821, overlay build 34e9ad6cbd86)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1817-dodge-live-qa.mjs.
//
// Feature = 2 telegraphed enemy specials mounted on EXISTING ambush ÉLITES by
// BORROWING the live machinery (special.slam radial + windup→strike AI +
// armTelegraph + damageHero), $0 art, $0 new mob, behind ONE knob ENEMY_ABILITIES:
//   A1 — directional LUNGE on a rusher-family élite: dash along the facing LOCKED
//        at windup, contact ⇒ damageHero(src=e) ⇒ PARABLE (KeyH) Y evadible por
//        i-frames (roll) Y evitable saliendo del carril (telegraphline lane tell).
//   A2 — radial ground-SLAM on a brute-family élite: reuses special.slam; shards
//        src=null ⇒ NO parables pero negados por i-frame y evitables saliendo del
//        anillo (radio del config). Ground ring telegraphmark.
// HARD-GATED behind ENEMY_ABILITIES.enabled: OFF ⇒ 0 assignments ⇒ sim + save
// byte-identical to HEAD. Cadence-deterministic (0 srand draws; dedicated
// abilityRng 0x0ab111a7) ⇒ srand ON==OFF even while the abilities FIRE. e.special
// is transient enemy run-state (never serialized) ⇒ save.v1 byte-identical.
//
//   node tools/cas1822-abilities-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1820 build touched exactly these 3 runtime blobs — HARD md5 gate).
// The abilities deploy (build 34e9ad6cbd86) is the LATEST gh-pages deploy, so nothing
// has layered onto render.js since ⇒ ALL 3 blobs are EXACT md5 == HEAD (no shared-blob
// drift caveat this run). REF = HEAD (== build commit 3b43f92; the deploy overlaid HEAD
// blobs verbatim, HEAD a362d99 only adds the deploy tool, not the 3 blobs).
//   sim/config.js, sim/sim.js, render/render.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788 / CAS-1817): these probes drive the REAL
// running game — the live page boots buildTiledWorld (the world the player actually
// plays), so G / spawnEnemy / updateEnemies / damageHero are the SHIPPED tiled-world
// paths. The ability* dev hooks are recovered by dynamically importing the SAME live
// sim.js URL (ESM dedups by URL ⇒ the running game's instance) because the build wired
// them onto the sim `dev` export but NOT onto game.js's window.__dev allowlist.
//
// Covers: AC0 md5 live==HEAD (3 blobs) + SEAM served bytes carry the feature (config
// ENEMY_ABILITIES knob, sim abilityRng + armAbility gate + special.lunge + telegraphline,
// render telegraphline fx) / CONTENT knob matches spec / AC5 knob OFF byte-id (no assign
// + save.v1 + srand) / AC-assign rusher→lunge brute→slam caster→none, OFF→none / AC3
// srand ON==OFF WITH abilities FIRING / AC1 A1 lunge telegrafiado + parable + i-frame
// evadible / AC1 A2 slam telegrafiado + src=null NO parable pero i-frame evadible + radio
// del config / AC4 save.v1 byte-id (special not serialized) / REG dodge/parry/frenzy/
// telegraph srand ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 3 ability blobs are EXCLUSIVE (the abilities deploy is the latest ⇒ no other
// feature shares a live line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1822"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 3b43f92; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.ABIL_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 3 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "AbilityQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the ability* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__ab for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__ab = m.dev; window.__abG = m.G;
      const need = ["abilityMeta", "abilityEnable", "abilityEnabled", "abilityAssignProbe",
        "abilityLungeProbe", "abilitySlamProbe", "abilitySrandProbe", "abilitySaveByteId"];
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
    // ---- AC0 BUILD gate (live == HEAD, all 3 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/abilities deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /ENEMY_ABILITIES\s*=\s*{/.test(cfgTxt) && /lunge:\s*{\s*every:3,\s*windup:0\.5,\s*distance:150/.test(cfgTxt) && /slam:\s*{[^}]*count:12[^}]*radius:104/.test(cfgTxt),
      "ENEMY_ABILITIES knob (lunge every:3/windup:0.5/distance:150 + slam count:12/radius:104) present in served config.js");
    gate("SEAM/sim", /createRNG\(0x0ab111a7\)/.test(simTxt) && /if\(ENEMY_ABILITIES\.enabled\)\s*armAbility\(e\)/.test(simTxt) && /special\.lunge/.test(simTxt),
      "sim: dedicated abilityRng 0x0ab111a7 + gated armAbility(e) + special.lunge branch present in served sim.js");
    gate("SEAM/render", /f\.kind===["']telegraphline["']/.test(rndTxt),
      "render.js: telegraphline lunge-lane fx present in served bytes (sim spawns it ONLY for a lunge windup ⇒ knob OFF never draws it)");

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

    // ---- wire the live sim module (recovers ability* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `ability* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the ENEMY_ABILITIES knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__ab.abilityMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.lunge && meta.lunge.every === 3 && meta.lunge.distance === 150 && meta.slam && meta.slam.count === 12 && meta.slam.radius === 104,
      `ENEMY_ABILITIES enabled=${meta.enabled} lunge(every=${meta.lunge && meta.lunge.every},dist=${meta.lunge && meta.lunge.distance}) slam(count=${meta.slam && meta.slam.count},radius=${meta.slam && meta.slam.radius})`);

    // ---- AC-assign: rusher→A1 lunge, brute→A2 slam, caster→none; knob OFF→none ----
    const asg = await page.evaluate(() => window.__ab.abilityAssignProbe());
    gate("AC-assign/rusher-lunge", !!asg.rusher && asg.rusher.arch === "rusher" && asg.rusher.hasLunge && !asg.rusher.hasSlam && asg.rusher.every === 3,
      `rusher élite → A1 lunge (arch=${asg.rusher && asg.rusher.arch} hasLunge=${asg.rusher && asg.rusher.hasLunge} every=${asg.rusher && asg.rusher.every} dmg=${asg.rusher && asg.rusher.dmg})`);
    gate("AC-assign/brute-slam", !!asg.brute && asg.brute.arch === "brute" && asg.brute.hasSlam && !asg.brute.hasLunge && asg.brute.every === 4,
      `brute élite → A2 slam (arch=${asg.brute && asg.brute.arch} hasSlam=${asg.brute && asg.brute.hasSlam} every=${asg.brute && asg.brute.every} dmg=${asg.brute && asg.brute.dmg})`);
    gate("AC-assign/caster-none", !!asg.caster && !asg.caster.hasLunge && !asg.caster.hasSlam,
      `caster élite → NO special (arch=${asg.caster && asg.caster.arch}) — abilities only mount on rusher/brute families`);
    gate("AC-assign/off-none", !!asg.offRusher && asg.offRusher.hasSpecial === false,
      `knob OFF ⇒ even a rusher élite gets NO special (byte-identical spawn) hasSpecial=${asg.offRusher && asg.offRusher.hasSpecial}`);

    // ---- AC1-A1: rusher élite driven to its telegraphed LUNGE (lane tell + heavy ring), contact
    //       src=e ⇒ PARABLE (KeyH) Y evadible por i-frame; baseline lands. ----
    const lun = await page.evaluate(() => window.__ab.abilityLungeProbe());
    gate("AC1-A1/telegraph", !!lun && lun.hasLunge && lun.laneTell && lun.heavyRing,
      lun ? `A1 telegrafiado: lane wedge (telegraphline)=${lun.laneTell}, heavy ring (telegraphmark)=${lun.heavyRing} along LOCKED facing ⇒ "step out of the lane"` : "probe null");
    gate("AC1-A1/baseline-lands", !!lun && lun.baseLanded && lun.landed > 0,
      lun ? `contact lands -${lun.landed}hp with no defense (real damageHero src=e)` : "probe null");
    gate("AC1-A1/iframe-evadible", !!lun && lun.negatedByIframe,
      lun ? `a roll i-frame NEGATES the same lunge contact (src=e evadible por i-frames, 0 dmg)` : "probe null");
    gate("AC1-A1/parryable", !!lun && lun.negatedByParry && lun.countered,
      lun ? `a live parry window NEGATES the lunge (src=e ⇒ PARABLE) and fires a COUNTER (countered=${lun.countered})` : "probe null");

    // ---- AC1-A2: brute élite driven to its telegraphed radial SLAM (ground ring radio del config);
    //       shards src=null ⇒ NO parables pero negados por i-frame; baseline lands. ----
    const slm = await page.evaluate(() => window.__ab.abilitySlamProbe());
    gate("AC1-A2/telegraph+shards", !!slm && slm.hasSlam && slm.shardCount === slm.expectShards && slm.shardCount === 12,
      slm ? `A2 telegrafiado: ${slm.shardCount}/${slm.expectShards} radial shards emitted` : "probe null");
    gate("AC1-A2/ring-radius", !!slm && slm.ringRadius === slm.cfgRadius && slm.ringRadius === 104,
      slm ? `ground ring radius=${slm.ringRadius}px comes from the knob (cfg=${slm.cfgRadius})` : "probe null");
    gate("AC1-A2/src-null", !!slm && slm.srcNull,
      slm ? `slam shards carry NO src ⇒ damageHero(...,null) — ranged, not a melee source` : "probe null");
    gate("AC1-A2/baseline-lands", !!slm && slm.landed > 0,
      slm ? `a shard lands -${slm.landed}hp with no defense (src=null path)` : "probe null");
    gate("AC1-A2/iframe-evadible", !!slm && slm.negatedByIframe,
      slm ? `a roll i-frame NEGATES the shard (universal choke, 0 dmg)` : "probe null");
    gate("AC1-A2/not-parryable", !!slm && slm.notParryable,
      slm ? `a parry window does NOT catch a shard (src=null) ⇒ still lands — ranged shards are NOT parryable` : "probe null");

    // ---- AC3 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH abilities FIRING (A1 lunge + A2 slam) ----
    const SEED = 0x1819c0de, N = 24;
    const srng = await page.evaluate((s, n) => {
      // Isolate: abilitySrandProbe mutates G.enemies/projectiles/fx internally and restores; quiesce the
      // persistent live tiled-world mobs so the fingerprint is a fair function of (seed, ENEMY_ABILITIES) alone.
      const G = window.__abG; const saved = G.enemies.splice(0, G.enemies.length);
      let out;
      try {
        const on = window.__ab.abilitySrandProbe(true, s, n, true);
        const off = window.__ab.abilitySrandProbe(false, s, n, true);
        const on2 = window.__ab.abilitySrandProbe(true, s, n, true);
        out = { on, off, on2 };
      } finally { G.enemies.push(...saved); }
      return out;
    }, SEED, N);
    gate("AC3/48-draws", srng.on.fingerprint.length === 48, `${srng.on.fingerprint.length} srand draws (2×${N}) around real ability firings`);
    gate("AC3/fired", srng.on.lungeFired === true && srng.on.slamFired === true, `the ON probe DID fire a real A1 lunge (${srng.on.lungeFired}) and A2 slam (${srng.on.slamFired}) — real wired paths`);
    gate("AC3/on==off", J(srng.on.fingerprint) === J(srng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL ENEMY_ABILITIES ON vs OFF — assignment is pure data + cadence-deterministic (0 srand draws; any variance rides the dedicated abilityRng)");
    gate("AC3/determinism", J(srng.on.fingerprint) === J(srng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC4-SAVE: e.special transient enemy run-state, never serialized ⇒ save.v1 byte-id ON/OFF + no key ----
    const sb = await page.evaluate(() => window.__ab.abilitySaveByteId());
    gate("AC4-SAVE/byte-id", !!sb && sb.byteId && sb.hotSpecial && !sb.hasKey,
      sb ? `save.v1 BYTE-IDENTICAL knob ON (hot special mounted=${sb.hotSpecial}) vs OFF, no lunge/ability key (offLen=${sb.offLen} onLen=${sb.onLen})` : "probe null");

    // ---- AC1 evidence screenshot: capture the play surface (feature is on ambush élites; capture the world) ----
    await page.screenshot({ path: `${OUT}/${label}-abilities-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the ability seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.pr = { on: window.__ab.parrySrandProbe(true, 0x1785c0de, 24), off: window.__ab.parrySrandProbe(false, 0x1785c0de, 24) }; } catch (e) { r.prErr = String(e); }
      try { r.fz = { on: window.__ab.frenzySrandProbe(true, 0x1773c0de, 24), off: window.__ab.frenzySrandProbe(false, 0x1773c0de, 24) }; } catch (e) { r.fzErr = String(e); }
      try { r.dg = { on: window.__ab.dodgeSrandProbe(true, 0x1814c0de, 24, true), off: window.__ab.dodgeSrandProbe(false, 0x1814c0de, 24, true) }; } catch (e) { r.dgErr = String(e); }
      try { r.tg = { on: window.__ab.telegraphSrandProbe(true, 0x1790c0de, 24), off: window.__ab.telegraphSrandProbe(false, 0x1790c0de, 24) }; } catch (e) { r.tgErr = String(e); }
      return r;
    });
    gate("REG/parry-srand", reg.pr && J(reg.pr.on.fingerprint) === J(reg.pr.off.fingerprint), reg.prErr || "Parry srand ON==OFF");
    gate("REG/frenzy-srand", reg.fz && J(reg.fz.on.fingerprint) === J(reg.fz.off.fingerprint), reg.fzErr || "Frenesí srand ON==OFF");
    gate("REG/dodge-srand", reg.dg && J(reg.dg.on.fingerprint) === J(reg.dg.off.fingerprint), reg.dgErr || "Esquiva srand ON==OFF");
    gate("REG/telegraph-srand", reg.tg && J(reg.tg.on.fingerprint) === J(reg.tg.off.fingerprint), reg.tgErr || "Telegrafía srand ON==OFF");

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
console.log(`CAS-1822 LIVE QA — Habilidades especiales telegrafiadas @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1822 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
