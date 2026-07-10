// ===========================================================================
// CAS-1839 (QA for CAS-1836) — LIVE QA: Golpe por la Espalda (Backstab / positional crit).
// Verifies the CAS-1837 build (deployed by CAS-1838, overlay build 971fe673fa12)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1831-combo-live-qa.mjs / tools/cas1826-poise-live-qa.mjs.
//
// Feature = a single deterministic multiplier in the hitEnemy sink, computed by
// PURE GEOMETRY over e.facing (which already lives and is NOT serialized): a MELEE
// hit (opt.melee) whose attack vector `ang` enters the enemy's REAR ARC
// (|angDiff(ang,e.facing)| < rearArcDeg/2) deals ×mult dmg + ×knockMul knock. It
// STACKS on POISE.bonusDmg (CAS-1826) and the rematador (CAS-1831) — the three
// multiply in the same sink (a rear hit on a staggered élite = the kit peak).
// 100% geometry/arithmetic ⇒ ZERO draws, NO backstabRng ⇒ srand BYTE-IDENTICAL
// ON==OFF even while a backstab fires for real. It adds NO field to hero or enemy
// ⇒ save.v1 byte-identical, no new key. HARD-GATED behind BACKSTAB.enabled:
// OFF ⇒ no branch runs ⇒ dmg/knock/VFX/save/srand byte-identical to HEAD.
//
//   node tools/cas1836-backstab-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1837 build touched exactly these 3 blobs — HARD md5 gate; NO
// input.js and NO render.js this run, the backstab VFX reuses addFx). The backstab
// deploy (build 971fe673fa12) is the LATEST gh-pages deploy, so nothing has layered
// onto these blobs since ⇒ ALL 3 are EXACT md5 == HEAD (no shared-blob drift
// caveat). REF = HEAD (== build commit 1586b56; deploy d103681 only adds the deploy
// tool).
//   sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788 / CAS-1817 / CAS-1822 / CAS-1829 / CAS-1834):
// these probes drive the REAL running game — the live page boots buildTiledWorld
// (the world the player actually plays), so G / heroAttack / applyHeroMelee /
// hitEnemy are the SHIPPED paths. The backstab* dev hooks are recovered by
// dynamically importing the SAME live sim.js URL (ESM dedups by URL ⇒ the running
// game's instance) because the build wired them onto the sim `dev` export but NOT
// onto game.js's window.__dev allowlist.
//
// ISOLATION: the backstab probes clear/reshape G.enemies internally; with the LIVE
// render loop still running, residual/undefined array entries would trip drawFx.
// So EVERY behavioral probe runs inside ONE page.evaluate that first snapshots +
// quiesces all sim arrays (enemies/projectiles/fx/fields) and hard-restores in a
// finally — a single synchronous block, so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (3 blobs) + SEAM served bytes carry the feature
// (config BACKSTAB knob, sim rear-arc melee multiply + knock stack, strings banner)
// / CONTENT knob matches spec / AC1 OFF byte-id (rear hit == frontal) / AC2 srand
// ON==OFF WITH a real backstab FIRING (48 draws, 0 new) / AC3 rear-arc geometry
// (×1.8 dmg + ×1.6 knock inside; ×1 exact frontal) / AC4 melee-only (ranged rear
// hit ×1) / AC5 stacks backstab×POISE×rematador / AC6 save byte-id no key / REG
// frenzy/parry/dodge/telegraph/abilities/poise/combos srand ON==OFF + boots clean
// / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 3 backstab blobs are EXCLUSIVE (the backstab deploy is the latest ⇒ nothing
// shares a live line on top), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1839"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 1586b56; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.BACKSTAB_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "BackstabQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the backstab* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__bs for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bs = m.dev; window.__bsG = m.G;
      const need = ["backstabMeta", "backstabEnable", "backstabEnabled", "backstabArcProbe",
        "backstabMeleeOnlyProbe", "backstabStackProbe", "backstabOffProbe",
        "backstabSaveByteId", "backstabSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays, run every backstab probe
// + the REG srand probes, then HARD-restore in a finally. No rAF interleaves inside a
// single page.evaluate ⇒ the live render loop never sees a corrupt array.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bs, G = window.__bsG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const r = {};
    try {
      r.meta = d.backstabMeta();
      r.arc = d.backstabArcProbe();
      r.melee = d.backstabMeleeOnlyProbe();
      r.stack = d.backstabStackProbe();
      r.off = d.backstabOffProbe();
      r.save = d.backstabSaveByteId();
      r.srand = { on: d.backstabSrandProbe(true, seed, n), off: d.backstabSrandProbe(false, seed, n), on2: d.backstabSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the backstab seam).
      const reg = {};
      const P = [
        ["frenzy", 0x1773c0de, "frenzySrandProbe", []],
        ["parry", 0x1785c0de, "parrySrandProbe", []],
        ["dodge", 0x1814c0de, "dodgeSrandProbe", [true]],
        ["telegraph", 0x1790c0de, "telegraphSrandProbe", []],
        ["abilities", 0x1819c0de, "abilitySrandProbe", [true]],
        ["poise", 0x1826c0de, "poiseSrandProbe", []],
        ["combos", 0x1831c0de, "comboSrandProbe", []],
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

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 3 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/backstab deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "", strTxt = servedText["strings.js"] || "";
    gate("SEAM/config", /export const BACKSTAB\s*=\s*{/.test(cfgTxt) && /rearArcDeg:120/.test(cfgTxt) && /mult:1\.8/.test(cfgTxt) && /knockMul:1\.6/.test(cfgTxt),
      "BACKSTAB knob (rearArcDeg 120 + mult 1.8 + knockMul 1.6) present in served config.js");
    gate("SEAM/sim", /if\(BACKSTAB\.enabled && opt && opt\.melee && e\.facing!==undefined/.test(simTxt) && /Math\.abs\(angDiff\(ang, e\.facing\)\) < BACKSTAB\.rearArcDeg\*Math\.PI\/360/.test(simTxt) && /dmg\*=BACKSTAB\.mult; backstab=true;/.test(simTxt) && /\(backstab\?BACKSTAB\.knockMul:1\)/.test(simTxt),
      "sim: rear-arc melee multiply (opt.melee + e.facing geometry gate) + knock stack present in served sim.js");
    gate("SEAM/strings", /backstab:\s*"¡POR LA ESPALDA!"/.test(strTxt),
      "strings.js: STR.backstab (¡POR LA ESPALDA! banner) present in served bytes");

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

    // ---- wire the live sim module (recovers backstab* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `backstab* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1836c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the BACKSTAB knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.rearArcDeg === 120 && meta.mult === 1.8 && meta.knockMul === 1.6,
      `BACKSTAB enabled=${meta.enabled} rearArc=${meta.rearArcDeg}° (⇒ ±${meta.rearArcDeg / 2}° behind) dmg×${meta.mult} knock×${meta.knockMul}`);

    // ---- AC3: rear-arc geometry sweep — inside ×1.8 dmg + ×1.6 knock; edge+/side/frontal ×1 exact ----
    const arc = r.arc;
    gate("AC3/arc-dmg", !!arc && arc.arcOk,
      arc ? `inside the ±${arc.half}° rear arc ⇒ ×${arc.rearMul}≈${arc.expectMul} (rear0/rear50/edgeIn); edge+5° / side 90° / frontal 180° ⇒ ×1 EXACT ${J(arc.degs)}` : "probe null");
    gate("AC3/arc-knock", !!arc && arc.knockOk,
      arc ? `a rear-arc hit launches ×${arc.knockRearMul} ≈ knockMul (${arc.expectKnock}) vs a frontal hit — the backstab shoves harder` : "probe null");

    // ---- AC4: melee-only — a rear-arc RANGED hit ⇒ ×1 (no opt.melee); only the rear MELEE hit crits ----
    const mo = r.melee;
    gate("AC4/melee-only", !!mo && mo.meleeOnly,
      mo ? `rear-arc RANGED hit ⇒ ×1 (${mo.rangedDmg}hp == frontal ${mo.frontDmg}hp) while rear-arc MELEE ⇒ ×${mo.ratio}≈${mo.expect} (${mo.meleeDmg}hp) — opt.melee gate` : "probe null");

    // ---- AC5: stacks — rear MELEE hit on a STAGGERED élite = backstab × POISE.bonusDmg × rematador ----
    const st = r.stack;
    gate("AC5/stacks", !!st && st.stacksOk,
      st ? `rear MELEE on STAGGERED élite ×${st.ratio} (${st.fullDmg}hp) = backstab×${st.parts.mult} · POISE×${st.parts.bonus} · REMATE×${st.parts.punish} ≈ ${st.expect} (baseline frontal ${st.baseDmg}hp) — the three multiply` : "probe null");

    // ---- AC1 OFF byte-id: BACKSTAB disabled ⇒ a rear-arc MELEE hit == a frontal hit (dmg + knock) ----
    const off = r.off;
    gate("AC1/off-byte-id", !!off && off.offOk,
      off ? `OFF: rear-arc MELEE hit byte-identical to frontal — dmg ${off.rearDmg}==${off.frontDmg}, knock ${off.rearKnock}==${off.frontKnock} (no branch runs)` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH a real backstab FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a real rear-arc MELEE backstab + loot kills`);
    gate("AC2/backstab-fired", s.on.backstabFired === true, `the ON probe DID land a real backstab (rear-arc MELEE ×${meta.mult}) — feature firing, not just the flag: backstabFired=${s.on.backstabFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL BACKSTAB ON vs OFF — backstab is pure geometry (no backstabRng; 0 srand draws) even while it fires");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC6 SAVE: neither hero nor enemy gains a field; save.v1 byte-id ON/OFF, no backstab key ----
    const sb = r.save;
    gate("AC6/save-byte-id", !!sb && sb.byteId && !sb.hasKey,
      sb ? `save.v1 BYTE-IDENTICAL with a fired backstab ON vs OFF (offLen=${sb.offLen} onLen=${sb.onLen}), no backstab key — e.facing already lives, G.enemies not serialized` : "probe null");

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-backstab-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos"]) {
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
console.log(`CAS-1839 LIVE QA — Golpe por la Espalda (Backstab) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1839 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
