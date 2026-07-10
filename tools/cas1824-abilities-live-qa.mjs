// ===========================================================================
// CAS-1824 (QA for CAS-1819) — LIVE QA: Habilidades especiales telegrafiadas
// (enemy telegraphed abilities: A1 directional lunge + A2 radial ground-slam).
// Verifies the CAS-1820 build (deployed by CAS-1821, overlay build 34e9ad6cbd86)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1817-dodge-live-qa.mjs.
//
// Feature = two knob-gated (ENEMY_ABILITIES) telegraphed specials mounted onto
// EXISTING ambush élites by BORROWING the live machinery (special.slam radial +
// windup→strike AI + armTelegraph + damageHero). $0 art, $0 new mob. A1 lunge
// on a rusher-family élite: locked-facing dash tell (telegraphline lane) + heavy
// ring; contact routes damageHero(src=e) ⇒ PARRYABLE (KeyH) + i-frame evadible +
// lane-sidestep. A2 slam on a brute-family élite: 12 shards (=knob count) from a
// ground ring radius=104px (=knob), shards src=null ⇒ NOT parryable but i-frame
// evadible + step-out-of-ring. HARD-GATED: knob OFF ⇒ 0 assignments ⇒ sim + save
// byte-identical to HEAD. Cadence-deterministic (0 srand draws; dedicated
// abilityRng 0x0ab111a7) ⇒ shared srand BYTE-IDENTICAL ON==OFF even when the
// specials FIRE. e.special is transient enemy run-state (not serialized) ⇒
// save.v1 byte-identical, no ability key.
//
//   node tools/cas1824-abilities-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1820 build touched exactly these 3 runtime blobs — HARD md5
// gate). Habilidades is the LATEST gh-pages deploy (build 34e9ad6cbd86), so
// nothing has layered onto these blobs since ⇒ ALL 3 are EXACT md5 == HEAD
// (config 526bf8b6 / sim aeff7e45 / render 05a940cc). REF = HEAD.
//   sim/config.js, sim/sim.js, render/render.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788 / CAS-1817): these probes drive the REAL
// running game — the live page boots buildTiledWorld, so G.hero / updateEnemies /
// damageHero / armAbility are the SHIPPED tiled-world paths. The ability* dev
// hooks are recovered by dynamically importing the SAME live sim.js URL (ESM
// dedups by URL ⇒ the running game's instance) because the build wired them onto
// the sim `dev` export but NOT onto game.js's window.__dev allowlist.
//
// Covers: AC0 md5 live==HEAD (3 blobs) + SEAM served bytes carry the feature +
// CONTENT knob matches spec / AC1 OFF byte-id (no assignment + save.v1 + srand) /
// AC-A1 lunge lane tell + heavy ring + lands(src=e) + i-frame negates + parry
// negates+counters + lead≥300ms / AC-A2 slam 12 shards + ring 104px + src=null +
// i-frame negates + NOT parryable / AC-RNG-STRONG srand ON==OFF with BOTH
// specials FIRING (0 shared draws) + determinism / AC-SAVE no ability key /
// REG dodge+parry+telegraph srand ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 3 ability blobs are EXCLUSIVE (this is the latest deploy — no other feature
// shares a live line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1824"; fs.mkdirSync(OUT, { recursive: true });
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "AbilQA"; ni.blur(); }
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
      const need = ["abilityMeta", "abilityEnable", "abilityAssignProbe", "abilityLungeProbe",
        "abilitySlamProbe", "abilitySrandProbe", "abilitySaveByteId"];
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
    gate("SEAM/config", /ENEMY_ABILITIES\s*=\s*{/.test(cfgTxt) && /distance:\s*150/.test(cfgTxt) && /count:\s*12/.test(cfgTxt) && /radius:\s*104/.test(cfgTxt),
      "ENEMY_ABILITIES knob (lunge distance:150 / slam count:12 / radius:104) present in served config.js");
    gate("SEAM/sim", /function armAbility\(e\)/.test(simTxt) && /special\.lunge/.test(simTxt) && /addFx\("telegraphline"/.test(simTxt),
      "armAbility() + special.lunge + telegraphline windup spawn present in served sim.js");
    gate("SEAM/render", /f\.kind==="telegraphline"/.test(rndTxt),
      "render.js: telegraphline directional lane tell present in served bytes");

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

    // ---- wire the live sim module (recovers ability* hooks off window.__dev's allowlist) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `ability* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the ENEMY_ABILITIES knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__ab.abilityMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.lunge.distance === 150 && meta.lunge.every === 3 && meta.slam.count === 12 && meta.slam.radius === 104 && meta.slam.every === 4,
      `ENEMY_ABILITIES enabled=${meta.enabled} lunge{every:${meta.lunge.every},dist:${meta.lunge.distance},windup:${meta.lunge.windup}} slam{every:${meta.slam.every},count:${meta.slam.count},radius:${meta.slam.radius}}`);
    // lead-time: lunge windup is the telegraph lead; must be ≥ ~300ms (parity with TELEGRAPH heavy lead-floor).
    gate("CONTENT/lead", meta.lunge.windup >= 0.3 && meta.slam.windup >= 0.3,
      `lunge lead=${Math.round(meta.lunge.windup * 1000)}ms / slam lead=${Math.round(meta.slam.windup * 1000)}ms (both ≥ 300ms telegraph floor)`);

    // ---- AC-assign: rusher→lunge, brute→slam, caster→none; knob OFF ⇒ no special (byte-id spawn) ----
    const asg = await page.evaluate(() => window.__ab.abilityAssignProbe());
    gate("AC-assign/rusher-lunge", asg.rusher && asg.rusher.hasLunge && !asg.rusher.hasSlam && asg.rusher.every === 3 && asg.rusher.dmg > 0,
      asg.rusher ? `rusher(${asg.rusher.arch}) ⇒ A1 lunge every=${asg.rusher.every} dmg=${asg.rusher.dmg}` : "probe null");
    gate("AC-assign/brute-slam", asg.brute && asg.brute.hasSlam && !asg.brute.hasLunge && asg.brute.every === 4 && asg.brute.dmg > 0,
      asg.brute ? `brute(${asg.brute.arch}) ⇒ A2 slam every=${asg.brute.every} dmg=${asg.brute.dmg}` : "probe null");
    gate("AC-assign/caster-none", asg.caster && !asg.caster.hasLunge && !asg.caster.hasSlam,
      asg.caster ? `caster(${asg.caster.arch}) ⇒ NO special (only rusher/brute élites arm)` : "probe null");
    gate("AC1-OFF/no-assign", asg.offRusher && asg.offRusher.hasSpecial === false,
      asg.offRusher ? `knob OFF ⇒ rusher élite spawns with NO special (byte-id spawn path)` : "probe null");

    // ---- AC-A1 lunge: lane tell + heavy ring + lands(src=e) + i-frame negates + parry negates+counters ----
    const lu = await page.evaluate(() => window.__ab.abilityLungeProbe());
    gate("AC-A1/tell", !!lu && lu.hasLunge && lu.laneTell && lu.heavyRing,
      lu ? `lunge windup spawns directional lane tell (telegraphline) + heavy ring (telegraphmark)` : "probe null");
    gate("AC-A1/lands", !!lu && lu.baseLanded && lu.landed > 0,
      lu ? `contact routes damageHero(src=e) ⇒ lands -${lu.landed}hp with no defense` : "probe null");
    gate("AC-A1/iframe-evade", !!lu && lu.negatedByIframe,
      lu ? `a roll i-frame NEGATES the same lunge contact (evadible by dash)` : "probe null");
    gate("AC-A1/parry", !!lu && lu.negatedByParry && lu.countered,
      lu ? `a live parry window NEGATES the lunge AND fires a counter (src=e ⇒ PARRYABLE)` : "probe null");

    // ---- AC-A2 slam: 12 shards (=knob) + ring 104px (=knob) + src=null + i-frame negates + NOT parryable ----
    const sl = await page.evaluate(() => window.__ab.abilitySlamProbe());
    gate("AC-A2/shards", !!sl && sl.hasSlam && sl.shardCount === sl.expectShards && sl.shardCount === 12,
      sl ? `slam emits ${sl.shardCount} shards (== knob count ${sl.expectShards})` : "probe null");
    gate("AC-A2/ring", !!sl && sl.ringRadius === sl.cfgRadius && sl.ringRadius === 104,
      sl ? `ground telegraph ring radius=${sl.ringRadius}px (== knob radius ${sl.cfgRadius})` : "probe null");
    gate("AC-A2/src-null", !!sl && sl.srcNull && sl.landed > 0 && sl.negatedByIframe,
      sl ? `shards src=null ⇒ land -${sl.landed}hp, NEGATED by i-frame (universal choke)` : "probe null");
    gate("AC-A2/not-parryable", !!sl && sl.notParryable,
      sl ? `a live parry does NOT catch a shard (src=null) ⇒ still lands (ranged not parryable)` : "probe null");

    // ---- AC-RNG-STRONG: srand byte-id ON==OFF WITH both specials FIRING (lunge + slam), + determinism ----
    const SEED = 0x1820c0de, N = 24;
    const srng = await page.evaluate((s, n) => {
      // Isolate: the probe arms/drives élites and restores; quiesce the persistent live tiled-world
      // mobs so the fingerprint is a fair function of (seed, ENEMY_ABILITIES.enabled) alone.
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
    gate("AC-RNG/48-draws", srng.on.fingerprint.length === 48, `${srng.on.fingerprint.length} srand draws (2×${N}) around real lunge+slam firings`);
    gate("AC-RNG/fired", srng.on.lungeFired === true && srng.on.slamFired === true,
      `the ON probe DID fire a real lunge (${srng.on.lungeFired}) AND slam (${srng.on.slamFired}) — real wired paths`);
    gate("AC-RNG/on==off", J(srng.on.fingerprint) === J(srng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL ENEMY_ABILITIES ON vs OFF — specials open NO shared-srand stream (dedicated abilityRng)");
    gate("AC-RNG/determinism", J(srng.on.fingerprint) === J(srng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC-SAVE: e.special transient ⇒ save.v1 byte-id ON/OFF + no ability key (even with a HOT special) ----
    const sb = await page.evaluate(() => window.__ab.abilitySaveByteId());
    gate("AC-SAVE/byte-id", !!sb && sb.byteId && !sb.hasKey && sb.hotSpecial,
      sb ? `save.v1 BYTE-IDENTICAL with a HOT lunge special mounted, no ability key (offLen=${sb.offLen} onLen=${sb.onLen})` : "probe null");

    // ---- SHOTS: live lunge lane tell + slam ground ring (visual evidence) ----
    await page.evaluate(() => {
      try {
        window.__ab.abilityEnable(true);
        const e = window.__ab.abilityLungeProbe && window.__ab.abilityLungeProbe();  // spawns fx into G.fx
      } catch (e) {}
    });
    await wait(60);
    await page.screenshot({ path: `${OUT}/${label}-abilities-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the ability seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.pr = { on: window.__ab.parrySrandProbe(true, 0x1785c0de, 24), off: window.__ab.parrySrandProbe(false, 0x1785c0de, 24) }; } catch (e) { r.prErr = String(e); }
      try {
        const G = window.__abG; const saved = G.enemies.splice(0, G.enemies.length);
        try {
          r.tg = { on: window.__ab.telegraphSrandProbe(true, 0x1790c0de, 24, true), off: window.__ab.telegraphSrandProbe(false, 0x1790c0de, 24, true) };
          r.dg = { on: window.__ab.dodgeSrandProbe(true, 0x1814c0de, 24, true), off: window.__ab.dodgeSrandProbe(false, 0x1814c0de, 24, true) };
        } finally { G.enemies.push(...saved); }
      } catch (e) { r.tgErr = String(e); }
      return r;
    });
    gate("REG/parry-srand", reg.pr && J(reg.pr.on.fingerprint) === J(reg.pr.off.fingerprint), reg.prErr || "Parry srand ON==OFF");
    gate("REG/telegraph-srand", reg.tg && J(reg.tg.on.fingerprint) === J(reg.tg.off.fingerprint), reg.tgErr || "Telegrafía srand ON==OFF");
    gate("REG/dodge-srand", reg.dg && J(reg.dg.on.fingerprint) === J(reg.dg.off.fingerprint), reg.tgErr || "Esquiva srand ON==OFF");

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
console.log(`CAS-1824 LIVE QA — Habilidades especiales telegrafiadas @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1824 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
