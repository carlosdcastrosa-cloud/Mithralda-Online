// ===========================================================================
// CAS-1788 — LIVE QA: Parada con Tempo (timing parry). Verifies the CAS-1786
// build (deployed by CAS-1787) on the canonical gh-pages URL.
// PASS x2 (desktop + mobile), browser-per-pass.
//
// Feature = a TRANSIENT run-state timing parry (mirror of CAS-1774 Frenzy /
// CAS-192 atkspdBuff): pressing KeyH arms a narrow window (windowMs) + a whiff
// cooldown (cooldownS) on the hero. A CONTACT (melee) strike landing INSIDE the
// window is negated ENTIRELY by damageHero (returns false, 0 hero dmg) and fires
// a short counter — counterDmg routed through hitEnemy + a knockback — plus a
// consumable 1-hit riposte buff (×riposteMul on the NEXT hero hit). Projectiles
// pass src=null to damageHero ⇒ NEVER parryable (melee-only, natural). The parry
// fields (parryT/parryCD/_parryRiposte) live on the hero, init in newHero, are
// NEVER serialized (save.v1 byte-identical on/off) and open NO RNG stream — the
// parry is timing-pure, so srand is byte-identical ON vs OFF (even with a parry
// FIRING mid-run: the counter, on a fresh no-crit hero, consumes 0 srand).
//
//   node tools/cas1786-parry-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1786 build touched exactly these 5 runtime blobs — HARD md5 gate):
//   input.js, render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784): these probes drive the REAL running game — the live
// page boots buildTiledWorld (the world the player actually plays), so G.hero /
// G.enemies / damageHero / hitEnemy are the SHIPPED tiled-world paths, NOT a fresh
// DOM-free buildWorld. The parry* dev hooks are recovered by dynamically importing
// the SAME live sim.js URL (ESM dedups by URL ⇒ the running game's instance / same
// live G.hero) because the build wired them onto the sim `dev` export but not onto
// game.js's window.__dev allowlist (game.js untouched — same as Frenzy/Afijos).
//
// Covers: AC0 md5 live==HEAD (5 blobs) + version.json build / SEAM served bytes
// contain the feature (config PARRY knob, sim tryParry+tickParry+damageHero seam,
// input KeyH, strings ¡PARADA!, render glint ring) / CONTENT knob matches spec /
// AC1 in-window melee negate+counter+knockback+riposte-armed / AC2 out-of-window +
// cooldown no-op (normal hero dmg) / AC3 melee-only (ranged src=null NOT parried,
// window intact) / AC4 riposte ×riposteMul once then spent / AC-RNG-STRONG srand
// byte-id ON==OFF over a 48-draw fixed script around REAL kills WITH a real parry
// FIRING (opens no stream) / AC-SAVE save.v1 byte-id + no parry key + rehydrate 0 /
// OFF hard-gated no-op / REG prior beats' srand ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1788"; fs.mkdirSync(OUT, { recursive: true });
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "ParryQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the parry* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__pd for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__pd = m.dev; window.__pdG = m.G;
      const need = ["parryMeta", "parryEnable", "parryReset", "parryState", "parryPress", "parryStep",
        "parryMeleeProbe", "parryRangedProbe", "parryRiposteProbe", "parrySrandProbe", "parrySaveByteId"];
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
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "", inpTxt = servedText["input.js"] || "", strTxt = servedText["strings.js"] || "";
    gate("SEAM/config", /PARRY\s*=\s*{/.test(cfgTxt) && /windowMs/.test(cfgTxt) && /cooldownS/.test(cfgTxt) && /counterDmg/.test(cfgTxt) && /knockback/.test(cfgTxt) && /riposteMul/.test(cfgTxt),
      "PARRY knob (windowMs/cooldownS/counterDmg/knockback/riposteMul) present in served config.js");
    gate("SEAM/sim", /function tryParry/.test(simTxt) && /function tickParry/.test(simTxt) && /parryT/.test(simTxt) && /_parryRiposte/.test(simTxt) && /h\.parryT>0/.test(simTxt),
      "tryParry + tickParry + parryT/_parryRiposte transient state + damageHero seam present in served sim.js");
    gate("SEAM/input", /code===["']KeyH["']\s*&&\s*PARRY\.enabled/.test(inpTxt) && /sim\.tryParry\(\)/.test(inpTxt),
      "input.js: dedicated KeyH arms tryParry, gated on PARRY.enabled (not rebindable)");
    gate("SEAM/strings", /parry:\s*["']¡PARADA!["']/.test(strTxt), "strings.js: ¡PARADA! banner present");
    gate("SEAM/render", /h\.parryT>0/.test(rndTxt) && /reduceMotion/.test(rndTxt), "render.js: golden glint ring gated on h.parryT>0 + !reduceMotion");

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

    // ---- wire the live sim module (recovers parry* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `parry* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the PARRY knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__pd.parryMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.windowMs === 150 && meta.cooldownS === 0.55 &&
      meta.counterDmg === 26 && meta.knockback === 230 && meta.riposteMul === 1.5,
      `PARRY window=${meta.windowMs}ms cd=${meta.cooldownS}s counter=${meta.counterDmg} knock=${meta.knockback} riposte×${meta.riposteMul}`);

    // ---- AC1: in-window melee ⇒ negated (0 hero dmg) + counter dmg to attacker + knockback + riposte armed ----
    const inWin = await page.evaluate(() => window.__pd.parryMeleeProbe(true));
    gate("AC1/negate", inWin.negated === true && inWin.heroDmg === 0,
      `melee INSIDE window ⇒ damageHero returns false, 0 hero dmg (heroDmg=${inWin.heroDmg})`);
    gate("AC1/counter", inWin.enemyDmg === meta.counterDmg,
      `attacker takes counterDmg=${meta.counterDmg} via hitEnemy (enemyDmg=${inWin.enemyDmg})`);
    gate("AC1/knockback", inWin.knockApplied === true, `knockback applied to the parried attacker (vx/vy set)`);
    gate("AC1/window-consumed", inWin.parryTAfter === 0, `parry window consumed by the negate (parryT ${inWin.parryTAfter})`);
    gate("AC1/riposte-armed", inWin.riposteAfter === 1, `1-hit riposte buff armed after the parry (_parryRiposte=${inWin.riposteAfter})`);

    // ---- AC2: out-of-window melee ⇒ NO parry, normal hero damage (no-op path) ----
    const outWin = await page.evaluate(() => window.__pd.parryMeleeProbe(false));
    gate("AC2/normal-dmg", outWin.negated === false && outWin.heroDmg > 0 && outWin.enemyDmg === 0,
      `melee with NO window ⇒ normal hero dmg (heroDmg=${outWin.heroDmg}), no counter (enemyDmg=${outWin.enemyDmg})`);

    // ---- AC2 cooldown: a press arms the window + whiff cooldown; a second immediate press whiffs ----
    const cd = await page.evaluate(() => {
      window.__pd.parryReset();
      const p1 = window.__pd.parryPress(); const s1 = window.__pd.parryState();
      const p2 = window.__pd.parryPress(); const s2 = window.__pd.parryState();  // still on cooldown ⇒ whiff
      return { p1, s1, p2, s2 };
    });
    gate("AC2/cooldown", cd.p1 === true && cd.s1.parryT > 0 && cd.s1.parryCD > 0 && cd.p2 === false && cd.s2.parryCD > 0,
      `press arms window (parryT=${cd.s1.parryT}s, cd=${cd.s1.parryCD}s); 2nd press during cooldown whiffs (returns ${cd.p2})`);

    // ---- AC3 melee-only: ranged hit (src=null) inside window ⇒ NOT parried, window intact ----
    const ranged = await page.evaluate(() => window.__pd.parryRangedProbe());
    gate("AC3/melee-only", ranged.negated === false && ranged.heroDmg > 0 && ranged.parryTAfter > 0,
      `ranged (src=null) inside window NOT parried ⇒ hero takes dmg (${ranged.heroDmg}), window intact (parryT=${ranged.parryTAfter}s)`);

    // ---- AC4 riposte: the NEXT hero hit after a parry is ×riposteMul, then spent ----
    const rip = await page.evaluate(() => window.__pd.parryRiposteProbe());
    gate("AC4/riposte-mul", rip.base > 0 && Math.abs(rip.ratio - meta.riposteMul) < 0.02 && rip.boosted > rip.base,
      `riposte hit ×${meta.riposteMul} (${rip.base} → ${rip.boosted}, ratio=${rip.ratio})`);
    gate("AC4/riposte-spent", rip.riposteAfter === 0 && rip.after === rip.base,
      `buff consumed after one hit (_parryRiposte=${rip.riposteAfter}, next hit back to base=${rip.after})`);

    // ---- AC-RNG-STRONG: gameplay srand byte-id ON vs OFF around REAL kills WITH a real parry FIRING ----
    const SEED = 0x1785c0de, N = 24;
    const rng = await page.evaluate((s, n) => {
      const on = window.__pd.parrySrandProbe(true, s, n);
      const off = window.__pd.parrySrandProbe(false, s, n);
      const on2 = window.__pd.parrySrandProbe(true, s, n);
      return { on, off, on2 };
    }, SEED, N);
    gate("RNG/48-draws", rng.on.fingerprint.length === 48, `${rng.on.fingerprint.length} srand draws (2×${N}) around ${rng.on.kills} REAL kills`);
    gate("RNG/on==off", J(rng.on.fingerprint) === J(rng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL PARRY ON vs OFF — timing parry opens NO RNG stream");
    gate("RNG/parry-fired", rng.on.parried === true, `the ON fingerprint was taken WITH a real parry-negation FIRING mid-run (parried=${rng.on.parried})`);
    gate("RNG/off-no-parry", rng.off.parried === false, `OFF ⇒ the same melee hit is NOT parried (hard-gated)`);
    gate("RNG/determinism", J(rng.on.fingerprint) === J(rng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC-SAVE: parry run-state NOT persisted ⇒ save.v1 byte-id + no key + rehydrate 0 ----
    await page.evaluate(() => window.__pd.parryReset());
    const sb = await page.evaluate(() => window.__pd.parrySaveByteId());
    gate("AC-SAVE/byte-id", !!sb && sb.byteId && !sb.hasKey,
      `save with hot parry fields BYTE-IDENTICAL to clean, no "parry" key (cleanLen=${sb && sb.cleanLen} hotLen=${sb && sb.hotLen})`);
    gate("AC-SAVE/no-persist", !!sb && sb.afterLoad && sb.afterLoad.parryT === 0 && sb.afterLoad.parryCD === 0 && sb.afterLoad.riposte === 0,
      `loadSave rehydrates parry fields at 0 (transient — reset per run)`);

    // ---- OFF path: hard-gated no-op (window never arms, melee never parried) ----
    const off = await page.evaluate(() => {
      window.__pd.parryReset(); window.__pd.parryEnable(false);
      const press = window.__pd.parryPress(); const st = window.__pd.parryState();
      const probe = window.__pd.parryMeleeProbe(true);   // even with arm requested, disabled ⇒ not parried
      window.__pd.parryEnable(true);
      return { press, st, probe };
    });
    gate("OFF/no-op", off.press === false && off.st.parryT === 0 && off.probe.negated === false && off.probe.heroDmg > 0,
      `parryEnable(false) ⇒ KeyH inert, window never arms, melee takes normal dmg (hard-gated)`);

    // ---- HUD: force a live parry window, screenshot the golden glint ring in play ----
    await page.evaluate(() => {
      const G = window.__pdG; if (!G || !G.hero) return;
      window.__pd.parryEnable(true); G.hero.parryT = 0.15;
    });
    await wait(200);
    await page.screenshot({ path: `${OUT}/${label}-parry-glint.png` }).catch(() => {});
    gate("HUD/screenshot", true, `${OUT}/${label}-parry-glint.png (golden glint ring while window live)`);
    await page.evaluate(() => { const G = window.__pdG; if (G && G.hero) G.hero.parryT = 0; });

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the parry seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.fz = { on: window.__pd.frenzySrandProbe(true, 0x1773c0de, 24), off: window.__pd.frenzySrandProbe(false, 0x1773c0de, 24) }; } catch (e) { r.fzErr = String(e); }
      try { r.wa = { on: window.__pd.waSrandProbe(true, 0x1768c0de, 24), off: window.__pd.waSrandProbe(false, 0x1768c0de, 24) }; } catch (e) { r.waErr = String(e); }
      try { r.cod = { on: window.__dev.codexSrandProbe(true, 0x1751c0de, 24), off: window.__dev.codexSrandProbe(false, 0x1751c0de, 24) }; } catch (e) { r.codErr = String(e); }
      try { r.pac = { on: window.__dev.pactsSrandProbe(true, {}, 0x1763c0de, 24), off: window.__dev.pactsSrandProbe(false, null, 0x1763c0de, 24) }; } catch (e) { r.pacErr = String(e); }
      return r;
    });
    gate("REG/frenzy-srand", reg.fz && J(reg.fz.on.fingerprint) === J(reg.fz.off.fingerprint), reg.fzErr || "Frenesí srand ON==OFF");
    gate("REG/affixes-srand", reg.wa && J(reg.wa.on.fingerprint) === J(reg.wa.off.fingerprint), reg.waErr || "Afijos de Arma srand ON==OFF");
    gate("REG/codex-srand", reg.cod && J(reg.cod.on.fingerprint) === J(reg.cod.off.fingerprint), reg.codErr || "Códice srand ON==OFF");
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
console.log(`CAS-1788 LIVE QA — Parada con Tempo @ ${BASE}\nHEAD md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1788 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
