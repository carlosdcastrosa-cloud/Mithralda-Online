// ===========================================================================
// CAS-1829 (QA for CAS-1826) — LIVE QA: Aturdimiento por Postura (Poise/Stagger).
// Verifies the CAS-1827 build (deployed by CAS-1828, overlay build b96ee4dc3ad4)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1822-abilities-live-qa.mjs.
//
// Feature = a hidden POSTURA (poise) meter per tier enemy (élite/champion/boss);
// accruing enough (light<heavy<ultimate hits, + parry pulse, + telegraph-punish
// bonus) BREAKS it into a STAGGER — which BORROWS the live e.stun AI-freeze gate
// (sim.js ~3274, ZERO new AI) plus an e.staggerT bonus-dmg window (dmg*=bonusDmg,
// mirror of the FRENZY/PARRY deterministic multiply). $0 art (proc golden stun
// swirl reusing spellburst/tint), behind ONE knob POISE:
//   - accrual gated to tier enemies (poiseCeil): basics never accrue.
//   - break sets e.stun (freeze) + e.staggerT (bonus window) + e.staggerCD (re-
//     stagger cooldown, no infinite lock); poise resets.
//   - decay: partial poise drains after decayDelay of no hits.
//   - profiles: élite{max100/dur1.6/x1.5}, boss{max280/dur1.0/x1.9} (climax).
//   - synergy: a successful parry pulses gain.parry; punishing a live telegraph
//     (e.st>0) adds gain.telegraphPunish.
// HARD-GATED behind POISE.enabled: OFF ⇒ poiseCeil=0 ⇒ no accrual, no branches ⇒
// sim + save byte-identical to HEAD. Postura is PURE ARITHMETIC (no poiseRng, 0
// srand draws) ⇒ srand ON==OFF even while a stagger FIRES for real. The 5 postura
// fields are transient enemy run-state (G.enemies never serialized) ⇒ save.v1
// byte-identical, carries no poise/stagger key.
//
//   node tools/cas1826-poise-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1827 build touched exactly these 4 blobs — HARD md5 gate). The
// poise deploy (build b96ee4dc3ad4) is the LATEST gh-pages deploy, so nothing has
// layered onto these blobs since ⇒ ALL 4 are EXACT md5 == HEAD (no shared-blob
// drift caveat this run). REF = HEAD (== build commit 76fb9cb; deploy 348b0e9 only
// adds the deploy tool, not the 4 blobs).
//   sim/config.js, sim/sim.js, render/render.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788 / CAS-1817 / CAS-1822): these probes drive
// the REAL running game — the live page boots buildTiledWorld (the world the player
// actually plays), so G / spawnEnemy / hitEnemy / updateEnemies / damageHero are the
// SHIPPED tiled-world paths. The poise* dev hooks are recovered by dynamically
// importing the SAME live sim.js URL (ESM dedups by URL ⇒ the running game's
// instance) because the build wired them onto the sim `dev` export but NOT onto
// game.js's window.__dev allowlist.
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config
// POISE knob, sim poiseCeil + break/bonus-dmg, render golden stun swirl, strings) /
// CONTENT knob matches spec / AC1 OFF byte-id (save.v1 + no poise key) / AC2 srand
// ON==OFF WITH a real stagger FIRING (staggerFired=true, 0 draws) / AC3 accrue→break
// →e.stun→IA frozen→dmg*=bonusDmg / gain tier light<heavy<ultimate / AC4 decay /
// AC5 re-stagger CD / AC6 boss max↑ dur↓ bonus↑ / AC7 parry+telegraph synergy / AC8
// no-persist / REG parry/dodge/telegraph/abilities srand ON==OFF + boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 4 poise blobs are EXCLUSIVE (the poise deploy is the latest ⇒ nothing shares a
// live line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js", "strings.js"];
const OUT = "shots/cas1829"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 76fb9cb; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.POISE_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 4 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "PoiseQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the poise* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__po for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__po = m.dev; window.__poG = m.G;
      const need = ["poiseMeta", "poiseEnable", "poiseEnabled", "poiseAccrueProbe", "poiseTierProbe",
        "poiseDecayProbe", "poiseReStaggerProbe", "poiseSynergyProbe", "poiseGainTierProbe",
        "poiseSrandProbe", "poiseSaveByteId"];
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
    // ---- AC0 BUILD gate (live == HEAD, all 4 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/poise deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "", strTxt = servedText["strings.js"] || "";
    gate("SEAM/config", /export const POISE\s*=\s*{/.test(cfgTxt) && /elite:\s*{\s*max:100,\s*dur:1\.6,\s*bonusDmg:1\.5\s*}/.test(cfgTxt) && /boss:\s*{\s*max:280,\s*dur:1\.0,\s*bonusDmg:1\.9\s*}/.test(cfgTxt),
      "POISE knob (elite max100/dur1.6/x1.5 + boss max280/dur1.0/x1.9) present in served config.js");
    gate("SEAM/sim", /function poiseCeil\(/.test(simTxt) && /e\.staggerT=p\.dur/.test(simTxt) && /if\(POISE\.enabled && e\.staggerT>0\) dmg\*=/.test(simTxt),
      "sim: poiseCeil() tier ceiling + break sets e.staggerT + bonus-dmg multiply (dmg*=bonusDmg) present in served sim.js");
    gate("SEAM/render", /staggerT>0/.test(rndTxt) && /#ffe27a/.test(rndTxt),
      "render.js: golden stun swirl gated on e.staggerT (drawn ONLY while staggered ⇒ knob OFF never draws it)");
    gate("SEAM/strings", /stagger:\s*"¡ATURDIDO!"/.test(strTxt),
      "strings.js: STR.stagger banner present in served bytes");

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

    // ---- wire the live sim module (recovers poise* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `poise* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the POISE knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__po.poiseMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.gain && meta.gain.light === 12 && meta.gain.heavy === 26 && meta.gain.ultimate === 40 && meta.gain.parry === 40 && meta.gain.telegraphPunish === 25 && meta.elite && meta.elite.max === 100 && meta.elite.dur === 1.6 && meta.elite.bonusDmg === 1.5 && meta.boss && meta.boss.max === 280 && meta.boss.dur === 1.0 && meta.boss.bonusDmg === 1.9,
      `POISE enabled=${meta.enabled} gain(l=${meta.gain && meta.gain.light},h=${meta.gain && meta.gain.heavy},u=${meta.gain && meta.gain.ultimate},parry=${meta.gain && meta.gain.parry},tp=${meta.gain && meta.gain.telegraphPunish}) élite(${meta.elite && meta.elite.max}/${meta.elite && meta.elite.dur}/${meta.elite && meta.elite.bonusDmg}) boss(${meta.boss && meta.boss.max}/${meta.boss && meta.boss.dur}/${meta.boss && meta.boss.bonusDmg})`);

    // ---- AC3: accrue → BREAK (e.stun set + e.staggerT set + poise reset) → IA frozen → dmg×bonus ----
    const acc = await page.evaluate(() => window.__po.poiseAccrueProbe());
    gate("AC3/accrue-break", !!acc && acc.staggered && acc.stunned && acc.poiseReset && acc.hits === acc.expectHits,
      acc ? `${acc.hits}/${acc.expectHits} light hits (max=${acc.max}, per=${acc.per}) filled poise → BREAK: staggerT>0=${acc.staggered}, e.stun set=${acc.stunned}, poise reset=${acc.poiseReset}` : "probe null");
    gate("AC3/ia-frozen", !!acc && acc.frozen,
      acc ? `staggered enemy AI is FROZEN (existing e.stun gate: no chase move, not windup/strike) — frozen=${acc.frozen}` : "probe null");
    gate("AC3/bonus-dmg", !!acc && acc.ratio === acc.bonusDmg && acc.staggerDmg > acc.baseDmg,
      acc ? `a hit INSIDE the window lands ×${acc.bonusDmg} (staggerDmg=${acc.staggerDmg} vs baseline=${acc.baseDmg}, ratio=${acc.ratio}) — deterministic multiply` : "probe null");

    // ---- gain tier: light < heavy < ultimate ----
    const gt = await page.evaluate(() => window.__po.poiseGainTierProbe());
    gate("AC3/gain-tier", !!gt && gt.ordered && gt.light === gt.gain.light && gt.heavy === gt.gain.heavy && gt.ultimate === gt.gain.ultimate,
      gt ? `postura per hit ordered light(${gt.light}) < heavy(${gt.heavy}) < ultimate(${gt.ultimate})` : "probe null");

    // ---- AC4: partial poise DECAYS after decayDelay of no hits ----
    const dc = await page.evaluate(() => window.__po.poiseDecayProbe());
    gate("AC4/decay", !!dc && dc.decayed && dc.afterDelay < dc.built,
      dc ? `built=${dc.built} → after ${dc.decayDelay}s idle decayed to ${dc.afterDelay} (rate=${dc.decayRate}/s) — a missed combo doesn't bank forever` : "probe null");

    // ---- AC5: re-stagger COOLDOWN — no re-accrual until CD drains (no infinite lock) ----
    const rs = await page.evaluate(() => window.__po.poiseReStaggerProbe());
    gate("AC5/re-stagger-cd", !!rs && rs.broke && rs.cd0 === rs.reStaggerCD && rs.cdStillActive && rs.blockedInCD && rs.reAccrues,
      rs ? `after break: staggerCD=${rs.cd0}(==${rs.reStaggerCD}); still active after window (${rs.cdAfterWindow}); accrual BLOCKED in CD=${rs.blockedInCD}; re-accrues once drained=${rs.reAccrues} — no infinite lock` : "probe null");

    // ---- AC6: boss profile — higher ceiling, shorter stun, bigger bonus (climax opening) ----
    const tp = await page.evaluate(() => window.__po.poiseTierProbe());
    gate("AC6/boss-profile", !!tp && tp.maxHigher && tp.durShorter && tp.bonusHigher,
      tp ? `boss(max=${tp.bossMax},dur=${tp.bossDur},bonus=${tp.bossBonus}) vs élite(max=${tp.eliteMax},dur=${tp.eliteDur},bonus=${tp.eliteBonus}): max↑=${tp.maxHigher} dur↓=${tp.durShorter} bonus↑=${tp.bonusHigher}` : "probe null");

    // ---- AC7: synergy — a successful PARRY pulses gain.parry; punishing a live TELEGRAPH adds gain.telegraphPunish ----
    const sy = await page.evaluate(() => window.__po.poiseSynergyProbe());
    gate("AC7/parry-synergy", !!sy && sy.parried && sy.parryOk && sy.parryGain === sy.expectParry,
      sy ? `a successful parry NEGATED the hit (${sy.parried}) and pulsed +${sy.parryGain} postura (==gain.parry ${sy.expectParry})` : "probe null");
    gate("AC7/telegraph-synergy", !!sy && sy.punishOk && (sy.punishGain - sy.plainGain) === sy.telegraphPunish,
      sy ? `punishing a live telegraph (e.st>0) added +${sy.punishGain - sy.plainGain} over a plain hit (==gain.telegraphPunish ${sy.telegraphPunish}); punish=${sy.punishGain} plain=${sy.plainGain}` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH a real stagger FIRING ----
    const SEED = 0x1826c0de, N = 24;
    const srng = await page.evaluate((s, n) => {
      // Isolate: poiseSrandProbe mutates G.enemies internally and restores; quiesce the persistent live
      // tiled-world mobs so the fingerprint is a fair function of (seed, POISE) alone.
      const G = window.__poG; const saved = G.enemies.splice(0, G.enemies.length);
      let out;
      try {
        const on = window.__po.poiseSrandProbe(true, s, n);
        const off = window.__po.poiseSrandProbe(false, s, n);
        const on2 = window.__po.poiseSrandProbe(true, s, n);
        out = { on, off, on2 };
      } finally { G.enemies.push(...saved); }
      return out;
    }, SEED, N);
    gate("AC2/48-draws", srng.on.fingerprint.length === 48, `${srng.on.fingerprint.length} srand draws (2×${N}) around a real postura FILL→BREAK + bonus-dmg hit + loot kills`);
    gate("AC2/stagger-fired", srng.on.staggerFired === true, `the ON probe DID fire a real stagger (postura filled and broke): staggerFired=${srng.on.staggerFired} — feature firing, not just the flag`);
    gate("AC2/on==off", J(srng.on.fingerprint) === J(srng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL POISE ON vs OFF — postura is pure arithmetic (no poiseRng; 0 srand draws) even while a stagger fires");
    gate("AC2/determinism", J(srng.on.fingerprint) === J(srng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC1/AC8-SAVE: the 5 postura fields are transient enemy run-state, never serialized ⇒ save.v1 byte-id + no key ----
    const sb = await page.evaluate(() => window.__po.poiseSaveByteId());
    gate("AC1-AC8/save-byte-id", !!sb && sb.byteId && sb.hotPoise && !sb.hasKey,
      sb ? `save.v1 BYTE-IDENTICAL knob ON (hot postura mounted=${sb.hotPoise}) vs OFF, no poise/stagger key (offLen=${sb.offLen} onLen=${sb.onLen})` : "probe null");

    // ---- AC evidence screenshot: capture the play surface (feature is on tier enemies; capture the world) ----
    await page.screenshot({ path: `${OUT}/${label}-poise-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the poise seams) ----
    // ISOLATION (full G snapshot/restore): abilitySrandProbe (a CAS-1820 hook) FIRES real lunges/slams and
    // truncates its own spawns by array-length — but with the LIVE render loop still running, any residual
    // projectile/field it leaves would spawn a bad fx into G.fx over the NEXT frames and trip drawFx. This is
    // instrumentation-only (real play never force-truncates), so we snapshot every sim array before the probes
    // and hard-restore the real world after — the SAME isolation the AC2 poise probe uses for G.enemies.
    const reg = await page.evaluate(() => {
      const G = window.__poG;
      const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
        fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
      const r = {};
      try {
        r.pr = { on: window.__po.parrySrandProbe(true, 0x1785c0de, 24), off: window.__po.parrySrandProbe(false, 0x1785c0de, 24) };
        r.dg = { on: window.__po.dodgeSrandProbe(true, 0x1814c0de, 24, true), off: window.__po.dodgeSrandProbe(false, 0x1814c0de, 24, true) };
        r.tg = { on: window.__po.telegraphSrandProbe(true, 0x1790c0de, 24), off: window.__po.telegraphSrandProbe(false, 0x1790c0de, 24) };
        r.ab = { on: window.__po.abilitySrandProbe(true, 0x1819c0de, 24, true), off: window.__po.abilitySrandProbe(false, 0x1819c0de, 24, true) };
      } catch (e) { r.err = String(e); }
      finally {
        G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
        G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      }
      return r;
    });
    gate("REG/parry-srand", reg.pr && J(reg.pr.on.fingerprint) === J(reg.pr.off.fingerprint), reg.err || "Parry srand ON==OFF");
    gate("REG/dodge-srand", reg.dg && J(reg.dg.on.fingerprint) === J(reg.dg.off.fingerprint), reg.err || "Esquiva srand ON==OFF");
    gate("REG/telegraph-srand", reg.tg && J(reg.tg.on.fingerprint) === J(reg.tg.off.fingerprint), reg.err || "Telegrafía srand ON==OFF");
    gate("REG/abilities-srand", reg.ab && J(reg.ab.on.fingerprint) === J(reg.ab.off.fingerprint), reg.err || "Habilidades srand ON==OFF");

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
console.log(`CAS-1829 LIVE QA — Aturdimiento por Postura (Poise/Stagger) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1829 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
