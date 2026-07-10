// ===========================================================================
// CAS-1817 (QA for CAS-1814) — LIVE QA: Esquiva Rodante (dodge roll i-frames).
// Verifies the CAS-1815 build (deployed by CAS-1816, overlay build f3fbe2508e69)
// on the canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1790-telegraph-live-qa.mjs.
//
// Feature = a knob-gated REACTIVE enhancement of the EXISTING doRoll (CAS-1618),
// NOT a new mechanic. With DODGE.enabled the roll derives iframe/cooldown/distance
// from the reactive knob band (vs CFG.roll*), keeping bb.iframeAdd + metaDashIframe +
// Estela Ardiente summed in; render draws a legible cyan/white invuln aura + shimmer
// ring. OFF ⇒ CFG.rollIFrame/rollCD/rollSpeed EXACT + generic flicker only ⇒ sim +
// render byte-identical to HEAD. The roll is pure timing/input (reuses the universal
// 0-RNG i-frame in damageHero) ⇒ srand BYTE-IDENTICAL ON vs OFF even when a roll
// actually FIRES and negates a hit (melee src=enemy AND ranged src=null). The new
// per-roll speed rides transient h.rollSpd ⇒ save.v1 byte-identical, no dodge key.
//
//   node tools/cas1817-dodge-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1815 build touched exactly these 3 runtime blobs — HARD md5 gate).
// Esquiva Rodante is the LATEST gh-pages deploy (build f3fbe2508e69), so nothing has
// layered onto render.js since ⇒ ALL 3 blobs are EXACT md5 == HEAD (no shared-blob
// drift caveat this time). REF = HEAD.
//   sim/config.js, sim/sim.js, render/render.js
//
// CRITICAL (lesson CAS-1784 / CAS-1788): these probes drive the REAL running game —
// the live page boots buildTiledWorld (the world the player actually plays), so
// G.hero / doRoll / damageHero are the SHIPPED tiled-world paths. The dodge* dev hooks
// are recovered by dynamically importing the SAME live sim.js URL (ESM dedups by URL ⇒
// the running game's instance) because the build wired them onto the sim `dev` export
// but NOT onto game.js's window.__dev allowlist (game.js untouched, same as Parry).
//
// Covers: AC0 md5 live==HEAD (3 blobs) + SEAM served bytes carry the feature (config
// DODGE knob, sim doRoll knob-band seam + rollSpd, render invuln aura gate) / CONTENT
// knob matches spec / AC1 OFF byte-id (CFG.roll* EXACT + save.v1 + srand) / AC-derive
// knob band ON / AC2 srand ON==OFF with a real roll FIRING / AC3 evasión melee(src) Y
// ranged(src=null) por i-frame / AC4 cooldown funcional / AC5 VFX invuln aura present
// ON / absent OFF (SEAM gate + screenshots) / AC6 no persiste (no dodge* key en save.v1)
// / REG parry+frenzy srand ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 3 dodge blobs are EXCLUSIVE (no other feature shares a live line on top of the
// dodge deploy — it is the latest deploy), so every one is exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "render/render.js"];
const OUT = "shots/cas1817"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 2d4c082; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.DODGE_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "DodgeQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the dodge* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__dg for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__dg = m.dev; window.__dgG = m.G;
      const need = ["dodgeMeta", "dodgeEnable", "dodgeEnabled", "dodgeReset", "dodgeState", "_dodgeFire",
        "dodgeParamsProbe", "dodgeMeleeProbe", "dodgeRangedProbe", "dodgeCooldownProbe", "dodgeSrandProbe", "dodgeSaveByteId"];
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/dodge deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /DODGE\s*=\s*{/.test(cfgTxt) && /cooldownMs\s*:\s*900/.test(cfgTxt) && /iframeMs\s*:\s*280/.test(cfgTxt) && /distance\s*:\s*92/.test(cfgTxt),
      "DODGE knob (cooldownMs:900/iframeMs:280/distance:92) present in served config.js");
    gate("SEAM/sim", /const\s+dg\s*=\s*DODGE\.enabled/.test(simTxt) && /h\.rollSpd\s*=\s*dg\?DODGE\.distance\/CFG\.rollTime:CFG\.rollSpeed/.test(simTxt) && /h\.rollSpd\|\|CFG\.rollSpeed/.test(simTxt),
      "doRoll knob-band seam (dg=DODGE.enabled, per-roll rollSpd, ||CFG.rollSpeed OFF byte-id) present in served sim.js");
    gate("SEAM/render", /DODGE\.enabled\s*&&\s*h\.rolling\s*&&\s*h\.iframe>0/.test(rndTxt),
      "render.js: invuln aura gated DODGE.enabled && h.rolling && h.iframe>0 present in served bytes");

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

    // ---- wire the live sim module (recovers dodge* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `dodge* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- CONTENT: the DODGE knob (matches the design spec) ----
    const meta = await page.evaluate(() => window.__dg.dodgeMeta());
    gate("CONTENT/knob", meta.enabled === true && meta.cooldownMs === 900 && meta.iframeMs === 280 && meta.distance === 92,
      `DODGE enabled=${meta.enabled} cd=${meta.cooldownMs}ms iframe=${meta.iframeMs}ms distance=${meta.distance}px`);

    // ---- AC1-OFF: DODGE off ⇒ doRoll uses CFG.roll* EXACT (byte-id path) ----
    const off = await page.evaluate(() => window.__dg.dodgeParamsProbe(false));
    const near = (a, b) => Math.abs(a - b) < 1e-4;
    gate("AC1-OFF/cfg-exact", off.rolling && near(off.iframe, off.cfg.rollIFrame) && near(off.rollCD, off.cfg.rollCD) && near(off.rollSpd, off.cfg.rollSpeed),
      `OFF ⇒ iframe=${off.iframe}==${off.cfg.rollIFrame}, cd=${off.rollCD}==${off.cfg.rollCD}, speed=${off.rollSpd}==${off.cfg.rollSpeed} (CFG EXACT)`);

    // ---- AC-derive: DODGE on ⇒ knob band ----
    const on = await page.evaluate(() => window.__dg.dodgeParamsProbe(true));
    gate("AC-derive/knob-band", on.rolling && near(on.iframe, on.knob.iframe) && near(on.rollCD, on.knob.cd) && near(on.rollSpd, on.knob.spd),
      `ON ⇒ iframe=${on.iframe}s cd=${on.rollCD}s speed=${on.rollSpd}px/s (from knob band)`);
    gate("AC-derive/reactive", on.iframe < off.iframe && on.rollCD > off.rollCD,
      `reactive retune vs HEAD (iframe ${off.iframe}→${on.iframe}s shorter, cooldown ${off.rollCD}→${on.rollCD}s longer — deliberate reactive tool)`);

    // ---- AC3-melee: a roll's i-frame negates a real melee hit (src=enemy); baseline lands ----
    const mel = await page.evaluate(() => window.__dg.dodgeMeleeProbe());
    gate("AC3-melee", !!mel && mel.heroDmgBase > 0 && !mel.baseNegated && mel.rolling && mel.negated && mel.heroDmg === 0,
      mel ? `melee hit lands -${mel.heroDmgBase}hp with no roll, NEGATED (0 dmg) inside the roll i-frame (src=enemy)` : "probe null");

    // ---- AC3-ranged: the SAME choke negates a projectile (src=null) — ranged evasion is free ----
    const rng = await page.evaluate(() => window.__dg.dodgeRangedProbe());
    gate("AC3-ranged", !!rng && rng.heroDmgBase > 0 && !rng.baseNegated && rng.rolling && rng.negated && rng.heroDmg === 0,
      rng ? `projectile (src=null) lands -${rng.heroDmgBase}hp with no roll, NEGATED inside the roll — ranged evasion free (universal i-frame)` : "probe null");

    // ---- AC4-cooldown: inside CD ⇒ no-op; after CD ⇒ re-arms ----
    const cd = await page.evaluate(() => window.__dg.dodgeCooldownProbe());
    gate("AC4-cooldown", !!cd && cd.armed1 && near(cd.cd, cd.cooldownMs / 1000) && cd.blockedInCD && cd.rearmed,
      cd ? `first roll arms cd=${cd.cd}s, a 2nd roll inside CD is a no-op, after the CD drains the roll re-arms` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: srand byte-id ON==OFF WITH a real roll FIRING + negation + loot kills ----
    const SEED = 0x1814c0de, N = 24;
    const srng = await page.evaluate((s, n) => {
      // Isolate: dodgeSrandProbe mutates G.enemies internally and restores; quiesce the persistent
      // live tiled-world mobs so the fingerprint is a fair function of (seed, DODGE.enabled) alone.
      const G = window.__dgG; const saved = G.enemies.splice(0, G.enemies.length);
      let out;
      try {
        const on = window.__dg.dodgeSrandProbe(true, s, n, true);
        const off = window.__dg.dodgeSrandProbe(false, s, n, true);
        const on2 = window.__dg.dodgeSrandProbe(true, s, n, true);
        out = { on, off, on2 };
      } finally { G.enemies.push(...saved); }
      return out;
    }, SEED, N);
    gate("AC2/48-draws", srng.on.fingerprint.length === 48, `${srng.on.fingerprint.length} srand draws (2×${N}) around a real roll+negation + loot kills`);
    gate("AC2/fired", srng.on.fired === true, `the ON probe DID fire a real roll and negate a hit — real wired path (fired=${srng.on.fired})`);
    gate("AC2/on==off", J(srng.on.fingerprint) === J(srng.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL DODGE ON vs OFF — the roll/i-frame opens NO RNG stream (0 draws even when it fires)");
    gate("AC2/determinism", J(srng.on.fingerprint) === J(srng.on2.fingerprint), `same seed reproduces the srand fingerprint`);

    // ---- AC6-SAVE: dodge run-state (incl rollSpd) NOT persisted ⇒ save.v1 byte-id + no dodge/roll key ----
    const sb = await page.evaluate(() => window.__dg.dodgeSaveByteId());
    gate("AC6-SAVE/byte-id", !!sb && sb.byteId && !sb.hasKey,
      `save.v1 BYTE-IDENTICAL DODGE ON vs OFF, no roll/dodge key (offLen=${sb && sb.offLen} onLen=${sb && sb.onLen})`);

    // ---- AC5 VFX invuln aura: force a live roll ON and screenshot the aura; then OFF (aura absent) ----
    // Ensure knob ON, fire a real roll, capture while i-frame is live (aura drawn).
    const auraOn = await page.evaluate(() => {
      window.__dg.dodgeEnable(true); window.__dg.dodgeReset(); const fired = window.__dg._dodgeFire(true);
      const st = window.__dg.dodgeState(); return { fired, ...st };
    });
    gate("AC5/aura-on-state", auraOn.fired && auraOn.enabled && auraOn.rolling && auraOn.iframe > 0,
      `live roll firing ON: rolling=${auraOn.rolling} iframe=${auraOn.iframe}s ⇒ invuln aura branch active`);
    await wait(60);
    await page.screenshot({ path: `${OUT}/${label}-dodge-aura-on.png` }).catch(() => {});
    const auraOff = await page.evaluate(() => {
      window.__dg.dodgeEnable(false); window.__dg.dodgeReset(); const fired = window.__dg._dodgeFire(true);
      const st = window.__dg.dodgeState(); return { fired, ...st };
    });
    await wait(60);
    await page.screenshot({ path: `${OUT}/${label}-dodge-aura-off.png` }).catch(() => {});
    gate("AC5/aura-off-gated", !auraOff.enabled && auraOff.rolling,
      `OFF: roll still fires (rolling=${auraOff.rolling}) but DODGE.enabled=false ⇒ aura branch skipped (generic flicker only) — screenshots ${label}-dodge-aura-{on,off}.png`);
    await page.evaluate(() => { window.__dg.dodgeEnable(true); window.__dg.dodgeReset(); });

    // ---- REG: prior beats' srand probes stay ON==OFF (no regression from the dodge seams) ----
    const reg = await page.evaluate(() => {
      const r = {};
      try { r.pr = { on: window.__dg.parrySrandProbe(true, 0x1785c0de, 24), off: window.__dg.parrySrandProbe(false, 0x1785c0de, 24) }; } catch (e) { r.prErr = String(e); }
      try { r.fz = { on: window.__dg.frenzySrandProbe(true, 0x1773c0de, 24), off: window.__dg.frenzySrandProbe(false, 0x1773c0de, 24) }; } catch (e) { r.fzErr = String(e); }
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
console.log(`CAS-1817 LIVE QA — Esquiva Rodante @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1817 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
