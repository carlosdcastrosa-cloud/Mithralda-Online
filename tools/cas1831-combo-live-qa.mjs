// ===========================================================================
// CAS-1834 (QA for CAS-1831) — LIVE QA: Combos/Moveset + rematador anti-Stagger.
// Verifies the CAS-1832 build (deployed by CAS-1833, overlay build 4dd3d3775394)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1826-poise-live-qa.mjs.
//
// Feature = an OFFENSIVE moveset that closes the souls-like loop (payoff to
// Poise/Stagger CAS-1826). Three additive seams, all pure timing/arithmetic:
//   - LIGHT CHAIN L→L→L: heroAttack advances h.comboCount inside COMBO.windowMs;
//     the chainLen-th swing is the FINISHER (dmg×finisherMul, knock×finisherKnock)
//     and feeds POISE.gain.heavy (natural stagger-break). tickCombo winds the
//     window down; a lapsed window cools the chain (comboCount→0).
//   - HEAVY attack on a dedicated key (COMBO.heavyKey=KeyN — spec KeyG collides
//     with the forge bind, documented deviation): slower (atkCD×heavyCdMul),
//     harder (dmg×heavyDmgMul), feeds POISE heavy. Melee-only, gated on enabled.
//   - REMATADOR (heart): a MELEE hit on an enemy inside its CAS-1826 stagger
//     window (e.staggerT>0) lands ×staggerPunishMul, STACKING on POISE.bonusDmg
//     (bonus×punish) + proc VFX (spellburst/shockring/debris/shake + "¡REMATE!").
// State (comboCount/comboT/_comboFin/_heavy) is TRANSIENT hero run-state (mirror
// frenzyStacks) ⇒ serializeSave allowlist excludes it ⇒ save.v1 byte-identical,
// NO new combo key. 100% timing/input ⇒ NO comboRng, ZERO srand draws ⇒ srand
// ON==OFF even while the finisher + rematador FIRE for real.
// HARD-GATED behind COMBO.enabled: OFF ⇒ no branch runs, attack button intact,
// heavy key inert ⇒ sim + save byte-identical to HEAD.
//
//   node tools/cas1831-combo-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1832 build touched exactly these 4 blobs — HARD md5 gate; NO
// render.js this run, the punish VFX reuses addFx). The combo deploy (build
// 4dd3d3775394) is the LATEST gh-pages deploy, so nothing has layered onto these
// blobs since ⇒ ALL 4 are EXACT md5 == HEAD (no shared-blob drift caveat). REF =
// HEAD (== build commit 64c74a2; deploy 131be35 only adds the deploy tool).
//   sim/config.js, sim/sim.js, input.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788 / CAS-1817 / CAS-1822 / CAS-1829): these
// probes drive the REAL running game — the live page boots buildTiledWorld (the
// world the player actually plays), so G / heroAttack / heavyAttack / applyHeroMelee
// / hitEnemy / tickCombo are the SHIPPED paths. The combo* dev hooks are recovered
// by dynamically importing the SAME live sim.js URL (ESM dedups by URL ⇒ the running
// game's instance) because the build wired them onto the sim `dev` export but NOT
// onto game.js's window.__dev allowlist.
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config
// COMBO knob, sim finisher+heavy+rematador+tickCombo, input heavyKey, strings REMATE)
// / CONTENT knob matches spec / AC1 OFF byte-id (uniform swings + heavy inert) / AC2
// srand ON==OFF WITH a real finisher+rematador FIRING (0 draws) / AC3 light chain
// L→L→L finisher / AC4 window expiry cools the chain / AC5 heavy slower+harder+feeds
// POISE heavy / AC6 rematador stacks on POISE.bonusDmg / AC7 melee-only / AC8 FRENZY
// +PARRY synergy stacks / AC9 no-persist save byte-id / REG parry/dodge/telegraph/
// abilities/poise srand ON==OFF + boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 4 combo blobs are EXCLUSIVE (the combo deploy is the latest ⇒ nothing shares a
// live line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "input.js", "strings.js"];
const OUT = "shots/cas1834"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 64c74a2; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.COMBO_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "ComboQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the combo* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__co for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__co = m.dev; window.__coG = m.G;
      const need = ["comboMeta", "comboEnable", "comboEnabled", "comboChainProbe", "comboExpireProbe",
        "comboHeavyProbe", "comboPunishProbe", "comboMeleeOnlyProbe", "comboSynergyProbe",
        "comboSaveByteId", "comboOffProbe", "comboSrandProbe"];
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/combo deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      inpTxt = servedText["input.js"] || "", strTxt = servedText["strings.js"] || "";
    gate("SEAM/config", /export const COMBO\s*=\s*{/.test(cfgTxt) && /finisherMul:1\.6/.test(cfgTxt) && /staggerPunishMul:2\.2/.test(cfgTxt) && /heavyKey:"KeyN"/.test(cfgTxt),
      "COMBO knob (finisherMul 1.6 + staggerPunishMul 2.2 + heavyKey KeyN) present in served config.js");
    gate("SEAM/sim", /if\(COMBO\.enabled && e\.staggerT>0 && opt && opt\.melee\)\{ dmg\*=COMBO\.staggerPunishMul/.test(simTxt) && /function tickCombo\(/.test(simTxt) && /h\._comboFin\s*=\s*\(h\.comboCount>=COMBO\.chainLen\)/.test(simTxt),
      "sim: rematador multiply (opt.melee + e.staggerT gate) + tickCombo window + finisher flag present in served sim.js");
    gate("SEAM/input", /code===COMBO\.heavyKey && COMBO\.enabled/.test(inpTxt) && /sim\.heavyAttack\(\)/.test(inpTxt),
      "input.js: dedicated COMBO.heavyKey → sim.heavyAttack() gated on COMBO.enabled present in served bytes");
    gate("SEAM/strings", /execute:\s*"¡REMATE!"/.test(strTxt),
      "strings.js: STR.execute (¡REMATE! banner) present in served bytes");

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

    // ---- wire the live sim module (recovers combo* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `combo* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the COMBO knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__co.comboMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.windowMs === 900 && meta.chainLen === 3 && meta.finisherMul === 1.6 && meta.finisherKnock === 1.7 && meta.heavyKey === "KeyN" && meta.heavyCdMul === 1.9 && meta.heavyDmgMul === 1.7 && meta.heavyPoise === "heavy" && meta.staggerPunishMul === 2.2,
      `COMBO enabled=${meta.enabled} window=${meta.windowMs} chainLen=${meta.chainLen} finisher(mul=${meta.finisherMul},knock=${meta.finisherKnock}) heavy(key=${meta.heavyKey},cd=${meta.heavyCdMul},dmg=${meta.heavyDmgMul},poise=${meta.heavyPoise}) punish=${meta.staggerPunishMul}`);

    // ---- AC3: light chain L→L→L — 3rd swing = FINISHER (dmg×finisherMul, knock×finisherKnock), 4th resets ----
    const ch = await page.evaluate(() => window.__co.comboChainProbe());
    gate("AC3/chain-build", !!ch && ch.firstTwoBuild && ch.thirdIsFinisher && ch.fourthResets,
      ch ? `counts=${J(ch.counts)} fins=${J(ch.fins)} — swings 1,2 build (count 1,2 no fin), 3rd is FINISHER (count reset), 4th restarts` : "probe null");
    gate("AC3/finisher-dmg", !!ch && ch.finDmgOk,
      ch ? `finisher dmg=${ch.finDmg} == expect ${ch.expectFinDmg} (base×finisherMul + on-hit) — deterministic` : "probe null");
    gate("AC3/finisher-knock", !!ch && ch.finKnockOk,
      ch ? `finisher knockback ×${ch.finKnockMul} == finisherKnock ${ch.expectKnockMul}` : "probe null");

    // ---- AC4: a gap longer than windowMs cools the chain (comboCount→0); next swing is a fresh count=1 ----
    const ex = await page.evaluate(() => window.__co.comboExpireProbe());
    gate("AC4/window-expire", !!ex && ex.reset,
      ex ? `built to count=${ex.before} → window lapsed (ticked, comboT gone=${ex.windowGone}, count→${ex.afterTick}) → next swing count=${ex.resumeCount} fin=${ex.resumeFin} — chain is a real timed window` : "probe null");

    // ---- AC5: HEAVY swing slower (atkCD×heavyCdMul), harder (dmg×heavyDmgMul), feeds POISE heavy (>light) ----
    const hv = await page.evaluate(() => window.__co.comboHeavyProbe());
    gate("AC5/heavy-cd", !!hv && hv.cdOk,
      hv ? `heavy atkCD=${hv.heavyCd} vs light=${hv.lightCd} ⇒ ×${hv.cdRatio} == heavyCdMul ${hv.expectCdMul}` : "probe null");
    gate("AC5/heavy-dmg", !!hv && hv.dmgOk,
      hv ? `heavy dmg=${hv.heavyDmg} == expect ${hv.expectHeavyDmg} (light ${hv.lightDmg} × heavyDmgMul)` : "probe null");
    gate("AC5/heavy-poise", !!hv && hv.poiseOk,
      hv ? `heavy fills POISE ${hv.heavyPoise}(==gain.heavy ${hv.expectHeavyPoise}) > light ${hv.lightPoise}(==gain.light ${hv.expectLightPoise}) — natural stagger-break` : "probe null");

    // ---- AC6 (HEART): rematador — MELEE hit on a STAGGERED enemy lands ×staggerPunishMul, STACKING on POISE.bonusDmg ----
    const pu = await page.evaluate(() => window.__co.comboPunishProbe());
    gate("AC6/rematador-stacks", !!pu && pu.stacksOk,
      pu ? `staggered MELEE dmg ×${pu.fullRatio} == bonus×punish ${pu.expectFull} (POISE-only ranged ×${pu.poiseRatio}==${pu.expectPoise}); base=${pu.baseDmg} poise=${pu.poiseDmg} full=${pu.fullDmg} — rematador STACKS on POISE.bonusDmg` : "probe null");
    gate("AC6/rematador-vfx", !!pu && pu.vfx && pu.punishAbovePoise,
      pu ? `rematador procs VFX (fx spawned=${pu.vfx}) and out-damages the POISE-only bonus (${pu.fullDmg}>${pu.poiseDmg})` : "probe null");

    // ---- AC7: melee-only — ranged class swing does NOT advance the chain, ranged hit gets NO rematador ----
    const mo = await page.evaluate(() => window.__co.comboMeleeOnlyProbe());
    gate("AC7/melee-only", !!mo && mo.meleeOnly,
      mo ? `ranged/proj class did NOT advance chain (count=${mo.comboCountAfterProj}); staggered ranged hit ×1 (no rematador) vs melee ×${mo.punishRatio}==${mo.expectPunish} — opt.melee gate holds` : "probe null");

    // ---- AC8: synergy without regression — FRENZY dmg mult + PARRY riposte still stack through the SAME hitEnemy sink ----
    const sy = await page.evaluate(() => window.__co.comboSynergyProbe());
    gate("AC8/frenzy-stacks", !!sy && sy.frenzyOk,
      sy ? `finisher × FRENZY(5) = ${sy.finFrenzy} vs no-frenzy ${sy.finNoFrenzy} ⇒ ×${sy.frenzyRatio} == expect ${sy.expectFrenzy} — FRENZY still multiplies` : "probe null");
    gate("AC8/parry-stacks", !!sy && sy.riposteOk,
      sy ? `riposte hit ×${sy.riposteRatio} == PARRY.riposteMul ${sy.expectRiposte} (plain ${sy.plain} → ripo ${sy.ripo}) — PARRY still multiplies through hitEnemy` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH a real finisher + rematador FIRING ----
    const SEED = 0x1831c0de, N = 24;
    const srng = await page.evaluate((s, n) => {
      // Isolate: comboSrandProbe mutates G.enemies internally and restores; quiesce the persistent live
      // tiled-world mobs so the fingerprint is a fair function of (seed, COMBO) alone.
      const G = window.__coG; const saved = G.enemies.splice(0, G.enemies.length);
      let out;
      try {
        const on = window.__co.comboSrandProbe(true, s, n);
        const off = window.__co.comboSrandProbe(false, s, n);
        const on2 = window.__co.comboSrandProbe(true, s, n);
        out = { on, off, on2 };
      } finally { G.enemies.push(...saved); }
      return out;
    }, SEED, N);
    gate("AC2/48-draws", srng.on.fingerprint.length === 48, `${srng.on.fingerprint.length} srand draws (2×${N}) around a real FILL→FINISHER + rematador + heavy + loot kills`);
    gate("AC2/finisher-fired", srng.on.finisherFired === true, `the ON probe DID fire a real light-chain FINISHER: finisherFired=${srng.on.finisherFired} — feature firing, not just the flag`);
    gate("AC2/rematador-fired", srng.on.punishFired === true, `the ON probe DID land a real rematador (dmg dealt to the staggered enemy): punishFired=${srng.on.punishFired}`);
    gate("AC2/on==off", J(srng.on.fingerprint) === J(srng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL COMBO ON vs OFF — combo is pure timing/arithmetic (no comboRng; 0 srand draws) even while the finisher + rematador fire");
    gate("AC2/determinism", J(srng.on.fingerprint) === J(srng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC1 OFF byte-id: COMBO disabled ⇒ uniform swings (no finisher spike), heavy key inert ----
    const off = await page.evaluate(() => window.__co.comboOffProbe());
    gate("AC1/off-uniform", !!off && off.offOk,
      off ? `OFF: swing dmgs=${J(off.dmgs)} uniform=${off.uniform} (no finisher spike), knock uniform=${off.uniformKnock}, heavy key inert=${off.heavyInert} — attack button unchanged` : "probe null");

    // ---- AC9 SAVE: comboCount/comboT/_comboFin/_heavy transient ⇒ save.v1 byte-id + no combo key ----
    const sb = await page.evaluate(() => window.__co.comboSaveByteId());
    gate("AC9/save-byte-id", !!sb && sb.byteId && !sb.hasKey,
      sb ? `save.v1 BYTE-IDENTICAL with a HOT chain (comboCount=2/comboT=0.7/fin/heavy) ON vs OFF, no combo key (offLen=${sb.offLen} onLen=${sb.onLen})` : "probe null");

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-combo-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the combo seams) ----
    // ISOLATION (full G snapshot/restore): the ability/poise probes FIRE real spawns and truncate by array-length;
    // with the LIVE render loop still running, residuals would trip drawFx. Snapshot every sim array, run, hard-restore.
    const reg = await page.evaluate(() => {
      const G = window.__coG;
      const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
        fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
      const r = {};
      try {
        r.pr = { on: window.__co.parrySrandProbe(true, 0x1785c0de, 24), off: window.__co.parrySrandProbe(false, 0x1785c0de, 24) };
        r.dg = { on: window.__co.dodgeSrandProbe(true, 0x1814c0de, 24, true), off: window.__co.dodgeSrandProbe(false, 0x1814c0de, 24, true) };
        r.tg = { on: window.__co.telegraphSrandProbe(true, 0x1790c0de, 24), off: window.__co.telegraphSrandProbe(false, 0x1790c0de, 24) };
        r.ab = { on: window.__co.abilitySrandProbe(true, 0x1819c0de, 24, true), off: window.__co.abilitySrandProbe(false, 0x1819c0de, 24, true) };
        r.po = { on: window.__co.poiseSrandProbe(true, 0x1826c0de, 24), off: window.__co.poiseSrandProbe(false, 0x1826c0de, 24) };
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
    gate("REG/poise-srand", reg.po && J(reg.po.on.fingerprint) === J(reg.po.off.fingerprint), reg.err || "Poise srand ON==OFF");

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
console.log(`CAS-1834 LIVE QA — Combos/Moveset + rematador anti-Stagger @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1834 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
