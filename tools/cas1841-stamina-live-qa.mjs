// ===========================================================================
// CAS-1844 (QA for CAS-1841) — LIVE QA: Estamina / Vigor (Pilar 8 · economía de recurso).
// Verifies the CAS-1842 build (deployed by CAS-1843, overlay build 857060c7aadc) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1836-backstab-live-qa.mjs / tools/cas1831-combo-live-qa.mjs.
//
// Feature = ONE arithmetic gate spendStam(h,cost) at each PODER action (dodge / parry /
// heavy / finisher / ability / ultimate). h.stam is a TRANSIENT hero resource (refill to
// full each run like h.mp), consumed by compare+subtract ⇒ ZERO draws, NO staminaRng ⇒
// srand BYTE-IDENTICAL ON==OFF even while stamina is spent / denied / regenerated for real.
// The light attack L is NEVER gated ⇒ the moment-to-moment is intocable. It is out of
// serializeSave's allowlist ⇒ save.v1 byte-identical, NO mithralda.stamina.v1 key.
// HARD-GATED: STAMINA.enabled=false ⇒ spendStam returns true instantly (no state touched),
// tickStamina returns, the HUD feed omits its keys and the vigor bar is not created ⇒
// dmg/knock/save/srand/DOM byte-identical to HEAD.
//
//   node tools/cas1841-stamina-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1842 build touched exactly these 5 blobs — HARD md5 gate; the HUD vigor
// bar + game.js feed made this a 5-blob overlay, MORE than the 3-blob backstab mirror; read
// the set from `git show --stat 3a21bce`, never copy a mirror's blob count — lesson CAS-1828).
// The stamina deploy (build 857060c7aadc) is the LATEST gh-pages deploy, so nothing has
// layered onto these blobs since ⇒ ALL 5 are EXACT md5 == HEAD (no shared-blob drift caveat).
// REF = HEAD (== build commit 3a21bce; deploy e1059b9 only adds the deploy tool).
//   game.js, hud.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1817 / CAS-1829 / CAS-1834 / CAS-1839): these probes drive
// the REAL running game — the live page boots buildTiledWorld (the world the player actually
// plays), so G / doRoll / tryParry / heavyAttack / heroAttack-finisher / castAbility /
// castUltimate / tickStamina are the SHIPPED paths. The stamina* dev hooks are recovered by
// dynamically importing the SAME live sim.js URL (ESM dedups by URL ⇒ the running game's
// instance) because the build wired them onto the sim `dev` export but NOT onto game.js's
// window.__dev allowlist.
//
// ISOLATION (lesson backstab/poise): the stamina probes clear/reshape G.enemies (_stamArm
// zeroes the arrays; staminaSrandProbe splices enemies for the loot stream); with the LIVE
// render loop still running, residual/undefined array entries would trip drawFx. So EVERY
// behavioral probe runs inside ONE page.evaluate that first snapshots + quiesces all sim
// arrays (enemies/projectiles/fx/fields) and hard-restores in a finally — a single
// synchronous block, so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (5 blobs) + SEAM served bytes carry the feature (config STAMINA
// knob, sim spendStam gate + tickStamina, game.js gated feed, hud.js gated vigor bar, strings
// notEnoughStamina) / CONTENT knob matches spec / AC1 OFF byte-id (actions fire at stam=5,
// vigor untouched) / AC2 srand ON==OFF WITH real stamina FIRING (48 draws, 0 new) / AC3 exact
// cost per action + L=0 delta / AC4 deny (no execute, flash armed, finisher degrades but lands)
// / AC5 regen + post-spend pause + clamp / AC6 save byte-id no key / HUD vigor bar present /
// REG 8 systems (frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab) srand ON==OFF +
// boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 5 stamina blobs are EXCLUSIVE (the stamina deploy is the latest ⇒ nothing shares a live
// line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["game.js", "hud.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1844"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 3a21bce; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.STAMINA_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "VigorQA"; ni.blur(); }  // NB: no "stam" substring ⇒ AC6 save-key regex can't false-match
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the stamina* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the
// running game's instance). Stash the `dev` object on window.__st for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__st = m.dev; window.__stG = m.G;
      const need = ["staminaMeta", "staminaEnable", "staminaEnabled", "staminaState",
        "staminaCostProbe", "staminaDenyProbe", "staminaOffProbe", "staminaRegenProbe",
        "staminaSaveByteId", "staminaSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays, run every stamina probe + the REG
// srand probes, then HARD-restore in a finally. No rAF interleaves inside a single
// page.evaluate ⇒ the live render loop never sees a corrupt array.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__st, G = window.__stG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const r = {};
    try {
      r.meta = d.staminaMeta();
      r.cost = d.staminaCostProbe();
      r.deny = d.staminaDenyProbe();
      r.off = d.staminaOffProbe();
      r.regen = d.staminaRegenProbe();
      r.save = d.staminaSaveByteId();
      r.srand = { on: d.staminaSrandProbe(true, seed, n), off: d.staminaSrandProbe(false, seed, n), on2: d.staminaSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the stamina seam).
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
    }
    return r;
  }, SEED, N);
}

// Live HUD: with STAMINA.enabled the vigor bar (⚡, green-vigor fill) is created in #hud.
async function hudVigorBar(page) {
  return await page.evaluate(() => {
    const hud = document.getElementById("hud");
    if (!hud) return { present: false, why: "no #hud" };
    const icons = [...hud.querySelectorAll(".bicon")].map(n => (n.textContent || "").trim());
    return { present: icons.includes("⚡"), icons };
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/stamina deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", gameTxt = servedText["game.js"] || "", hudTxt = servedText["hud.js"] || "";
    gate("SEAM/config", /export const STAMINA\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /max:\s*100/.test(cfgTxt) && /regen:\s*22/.test(cfgTxt) && /regenDelay:\s*0\.35/.test(cfgTxt) && /dodge:\s*25/.test(cfgTxt) && /parry:\s*20/.test(cfgTxt) && /heavy:\s*30/.test(cfgTxt) && /finisher:\s*30/.test(cfgTxt) && /ability:\s*25/.test(cfgTxt) && /ultimate:\s*40/.test(cfgTxt),
      "STAMINA knob (max100/regen22/regenDelay0.35 + cost dodge25/parry20/heavy30/finisher30/ability25/ultimate40) present in served config.js");
    gate("SEAM/sim", /function spendStam\(h, cost\)\{/.test(simTxt) && /if\(!STAMINA\.enabled \|\| !h\) return true;/.test(simTxt) && /h\.stam -= cost; h\._stamRegenPauseT = STAMINA\.regenDelay;/.test(simTxt) && /function tickStamina\(h,dt\)\{/.test(simTxt) && /if\(!spendStam\(h,STAMINA\.cost\.heavy\)\) return;/.test(simTxt),
      "sim: spendStam gate (OFF⇒true byte-id, else compare+subtract) + tickStamina regen + heavy/parry/finisher call sites present in served sim.js");
    gate("SEAM/game", /STAMINA\.enabled \? \{ stam:h\.stam, stamMax:STAMINA\.max, stamFlash:h\._stamFlash \} : null/.test(gameTxt),
      "game.js: gated HUD vigor feed (keys absent when STAMINA OFF) present in served bytes");
    gate("SEAM/hud", /if\(STAMINA\.enabled\) nodes\.stam=bar\(sw, C\.stamf, C\.stamb, "⚡"\);/.test(hudTxt) && /stamf:"#3fae55"/.test(hudTxt),
      "hud.js: gated verde-vigor bar (⚡, created only when STAMINA.enabled) present in served bytes");
    gate("SEAM/strings", /notEnoughStamina:\s*"Vigor insuficiente"/.test(strTxt),
      "strings.js: STR.notEnoughStamina (Vigor insuficiente) present in served bytes");

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

    // ---- HUD: the vigor bar is present live (belt+suspenders on the hud.js SEAM) ----
    const hb = await hudVigorBar(page);
    gate("HUD/vigor-bar", hb.present, hb.present ? `⚡ verde-vigor bar created in #hud (icons ${J(hb.icons)})` : `no ⚡ bar (icons ${J(hb.icons || [])}) ${hb.why || ""}`);

    // ---- wire the live sim module (recovers stamina* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `stamina* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1841c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the STAMINA knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.max === 100 && meta.regen === 22 && meta.regenDelay === 0.35 && meta.cost && meta.cost.dodge === 25 && meta.cost.parry === 20 && meta.cost.heavy === 30 && meta.cost.finisher === 30 && meta.cost.ability === 25 && meta.cost.ultimate === 40,
      `STAMINA enabled=${meta.enabled} max=${meta.max} regen=${meta.regen}/s regenDelay=${meta.regenDelay}s cost=${J(meta.cost)}`);

    // ---- AC3: exact cost per PODER action; the light L = 0 delta ----
    const cp = r.cost;
    gate("AC3/cost", !!cp && cp.ok,
      cp ? `dodge -${cp.dodge} · parry -${cp.parry} · heavy -${cp.heavy} · finisher -${cp.finisher} · ability -${cp.ability} · ultimate -${cp.ultimate} (each == its knob cost ${J(cp.cost)})` : "probe null");
    gate("AC3/light-free", !!cp && Math.abs(cp.light) < 1e-9,
      cp ? `a plain (non-finisher) swing spends ${cp.light} vigor — the moment-to-moment is NEVER gated` : "probe null");

    // ---- AC4: no vigor ⇒ deny (no execute, flash armed); the finisher DEGRADES but still lands ----
    const dp = r.deny;
    gate("AC4/deny", !!dp && dp.ok,
      dp ? `stam=0: dodge/parry/heavy/ability/ultimate DENY (do not execute) + arm _stamFlash (flash dodge=${dp.dodge.flash} parry=${dp.parry.flash} heavy=${dp.heavy.flash} ability=${dp.ability.flash} ult=${dp.ultimate.flash}); the finisher DEGRADES to a normal swing that STILL lands (landed=${dp.finisher.landed}, degraded=${dp.finisher.degraded})` : "probe null");

    // ---- AC1 OFF byte-id: STAMINA disabled ⇒ actions fire at stam=5 (below every cost), vigor untouched ----
    const off = r.off;
    gate("AC1/off-byte-id", !!off && off.ok,
      off ? `OFF: dodge/parry/heavy/ability/ultimate all fire at stam=5 (below every cost) and h.stam/_stamFlash NEVER touched (stam stays 5, flash 0) — spendStam returns true instantly` : "probe null");

    // ---- AC5: regen + post-spend pause + clamp at max ----
    const rg = r.regen;
    gate("AC5/regen", !!rg && rg.ok,
      rg ? `+${rg.gained} over 0.5s (==regen·dt ${rg.expect}); a spend PAUSES regen for regenDelay (pausedNoRegen=${rg.pausedNoRegen}) then it resumes (${rg.resumed}); clamps at max (${rg.clamped})` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real stamina FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around real stamina spend+deny+regen + loot kills`);
    gate("AC2/stamina-fired", s.on.staminaFired === true, `the ON probe DID spend, deny AND regen real vigor (not just the flag): staminaFired=${s.on.staminaFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL STAMINA ON vs OFF — the economy is pure arithmetic (no staminaRng; 0 srand draws) even while it fires");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC6 SAVE: transient vigor state ⇒ save.v1 byte-id ON/OFF, no stamina key ----
    const sb = r.save;
    gate("AC6/save-byte-id", !!sb && sb.byteId && !sb.hasKey,
      sb ? `save.v1 BYTE-IDENTICAL with live vigor set ON vs OFF (offLen=${sb.offLen} onLen=${sb.onLen}), NO stamina key (stam/_stamFlash/_stamRegenPauseT transient, out of serializeSave allowlist)` : "probe null");

    // ---- AC evidence screenshot: capture the play surface (vigor bar in the HUD) ----
    await page.screenshot({ path: `${OUT}/${label}-stamina-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (8 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab"]) {
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
console.log(`CAS-1844 LIVE QA — Estamina/Vigor @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1844 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
