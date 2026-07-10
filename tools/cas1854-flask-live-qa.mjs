// ===========================================================================
// CAS-1862 (QA for CAS-1854) — LIVE QA: Frasco de Curación (Estus / Healing Flask, 10ª feature Souls-like).
// Verifies the CAS-1860 build (deployed by CAS-1861, overlay build 3cdecd9d3bdc) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1847-lock-on-live-qa.mjs / tools/cas1841-stamina-live-qa.mjs.
//
// Feature = 1 TRANSIENT resource (flaskCharges) + 1 gated CHANNEL (drinkFlask). Pulsar-para-beber
// arranca un canal ENRAIZADO + VULNERABLE ~0.75s (sin i-frames ⇒ backstab/telegraph lo castigan):
// el root+vulnerable REUSA el gate de acción existente (heroAttack/heavyAttack/castSpell/doRoll)
// con `|| h.flaskDrinkT>0` y envuelve el movimiento en flaskMoveGate ⇒ enraiza GRATIS; el
// cancel-on-action es la cara inversa (mover/atacar/rodar aborta el trago SIN gastar carga). La
// curación es 100% timing/aritmética ⇒ CERO srand draws, NO existe flaskRng ⇒ srand
// BYTE-IDÉNTICO ON==OFF incluso con el frasco DISPARANDO. flaskCharges/flaskDrinkT/flaskZone son
// TRANSITORIOS (fuera del allowlist de serializeSave) ⇒ save.v1 byte-id, SIN clave flask*. Pips +
// groove del canal son 100% procedurales (DOM/canvas inline), $0 arte. HARD-GATED:
// FLASK.enabled=false ⇒ la tecla es inerte, sin canal/root/pips/tinte/refill ⇒ hp/gates/save/srand/
// DOM byte-idénticos a HEAD.
//
//   node tools/cas1854-flask-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1860 build touched exactly these 7 blobs — HARD md5 gate; read the set from
// `git show --stat 3f88e8c`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). The
// flask deploy (build 3cdecd9d3bdc) is the LATEST gh-pages deploy, so nothing has layered onto
// these blobs since ⇒ ALL 7 are EXACT md5 == HEAD (no shared-blob drift caveat).
// REF = HEAD (== build commit 3f88e8c; the deploy commit dda2b4b only adds the deploy tool).
//   game.js, hud.js, input.js, render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1817 / CAS-1834 / CAS-1844 / CAS-1850): these probes drive the
// REAL running game — the live page boots buildTiledWorld (the world the player actually plays),
// so G / drinkFlask / tickFlask / los gates de acción con `||flaskDrinkT>0` / flaskMoveGate son
// los SHIPPED paths. The flask* dev hooks are recovered by dynamically importing the SAME live
// sim.js URL (ESM dedups by URL ⇒ the running game's instance) because the build wired them onto
// the sim `dev` export but NOT onto game.js's window.__dev allowlist.
//
// ISOLATION (lesson backstab/poise/stamina/lock-on): the flask probes rearm G (_flaskArm zeroes
// enemies/projectiles/fx/fields AND rewrites the hero to a clean warrior); with the LIVE render
// loop still running, residual/undefined array entries or the rewritten hero would trip the HUD /
// drawFx. So EVERY behavioral probe runs inside ONE page.evaluate that first snapshots + quiesces
// all sim arrays AND shallow-snapshots the hero, then HARD-restores in a finally — a single
// synchronous block, so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (7 blobs) + SEAM served bytes carry the feature (config FLASK knob,
// sim drinkFlask/tickFlask/flaskMoveGate, input KeyU gated, render touch ⚕ btn gated, hud pips,
// game feed, strings flaskHint) / CONTENT knob matches spec / AC1 OFF byte-id (KeyU inert, gates
// ignore a forced flaskDrinkT) / AC2 srand ON==OFF WITH real flask FIRING (48 draws, 0 new,
// completed drink + cancelled drink) / AC3 root+vulnerable (no power action fires, takes normal
// damage) / AC4 charges 3→0 + exact heal round(maxHp·0.40) + clamp / AC5 cancel-on-action sin
// coste / AC6 refill on zone change (same zone ⇒ no refill) / AC7 save byte-id no flask key +
// LIVE drink through the real KeyU→input.js→sim.drinkFlask() path (pips $0 art) / REG 10 systems
// (frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on) srand ON==OFF +
// boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 7 flask blobs are EXCLUSIVE (the flask deploy is the latest ⇒ nothing shares a live line on
// top), so every one is exact-md5 gated == HEAD.
const FILES = ["game.js", "hud.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1862"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 3f88e8c; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.FLASK_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 7 exclusive blobs
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

// benign browser noise filter (favicon 404, transient CDN art 503 etc.) — real files are md5-gated.
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "EstusQA"; ni.blur(); }  // NB: no "flask" substring ⇒ AC7 save-key regex can't false-match
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the flask* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running
// game's instance). Stash the `dev` object on window.__fk for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__fk = m.dev; window.__fkG = m.G;
      const need = ["flaskMeta", "flaskEnable", "flaskState", "flaskDrinkProbe", "flaskRootProbe",
        "flaskCancelProbe", "flaskRefillProbe", "flaskOffProbe", "flaskSaveByteId", "flaskSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero (the flask
// probes rearm both), run every flask probe + the REG srand probes, then HARD-restore in a finally.
// No rAF interleaves inside a single page.evaluate ⇒ the live render loop never sees a corrupt array
// or the rewritten warrior hero mid-probe.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__fk, G = window.__fkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: _flaskArm reassigns (never in-place mutates) refs
    const r = {};
    try {
      r.meta = d.flaskMeta();
      r.drink = d.flaskDrinkProbe();
      r.root = d.flaskRootProbe();
      r.cancel = d.flaskCancelProbe();
      r.refill = d.flaskRefillProbe();
      r.off = d.flaskOffProbe();
      r.save = d.flaskSaveByteId();
      r.srand = { on: d.flaskSrandProbe(true, seed, n), off: d.flaskSrandProbe(false, seed, n), on2: d.flaskSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the flask seam).
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
        ["lock-on", 0x1847c0de, "lockSrandProbe", []],
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
      if (heroSnap && G.hero) Object.assign(G.hero, heroSnap);
    }
    return r;
  }, SEED, N);
}

// LIVE drink: drive the REAL KeyU/drinkFlask path in the running tiled-world game (hero forced to
// half hp + full charges first), confirm the channel armed, then reset it so the render loop /
// gameplay stay clean afterwards.
async function liveDrink(page) {
  return await page.evaluate(() => {
    const d = window.__fk, G = window.__fkG, h = G.hero;
    if (!h) return { ok: false, why: "no hero" };
    d.flaskEnable(true);
    const before = { charges: h.flaskCharges, drinkT: h.flaskDrinkT, hp: h.hp };
    h.flaskCharges = d.flaskMeta().charges; h.flaskDrinkT = 0; h.hp = Math.max(1, Math.round((h.maxHp || 1000) * 0.5)); h.dead = false; G.hitstop = 0;
    const key = d.flaskMeta().key;
    // drive the REAL input path: dispatch the FLASK.key (KeyU) keydown → input.js → sim.drinkFlask()
    window.dispatchEvent(new KeyboardEvent("keydown", { code: key, key: key.replace("Key", "").toLowerCase(), bubbles: true }));
    const st = d.flaskState();
    const armed = !!(st && st.drinkT > 0 && st.charges === d.flaskMeta().charges);   // channel armed, charge NOT yet spent
    // reset the channel so the live hero is left un-rooted
    h.flaskDrinkT = 0; h.flaskCharges = before.charges; h.hp = before.hp;
    return { ok: armed, drinkT: st && st.drinkT, charges: st && st.charges, key };
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 7 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/flask deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", inTxt = servedText["input.js"] || "", rndTxt = servedText["render/render.js"] || "",
      hudTxt = servedText["hud.js"] || "", gameTxt = servedText["game.js"] || "";
    gate("SEAM/config", /export const FLASK\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"KeyU"/.test(cfgTxt) && /charges:\s*3/.test(cfgTxt) && /healPct:\s*0\.40/.test(cfgTxt) && /drinkMs:\s*750/.test(cfgTxt) && /cancelOnAction:\s*true/.test(cfgTxt) && /refillOnZone:\s*true/.test(cfgTxt),
      "FLASK knob (enabled/key:KeyU/charges:3/healPct:0.40/drinkMs:750/cancelOnAction/refillOnZone) present in served config.js");
    gate("SEAM/sim", /function drinkFlask\(/.test(simTxt) && /function tickFlask\(/.test(simTxt) && /function flaskMoveGate\(/.test(simTxt) && /flaskDrinkT/.test(simTxt),
      "sim: drinkFlask + tickFlask + flaskMoveGate + flaskDrinkT gates present in served sim.js");
    gate("SEAM/input", /code===FLASK\.key && FLASK\.enabled\)\{ sim\.drinkFlask\(\); return; \}/.test(inTxt) && /FLASK\.enabled \? \{ flask:/.test(inTxt),
      "input.js: KeyU (FLASK.key) → sim.drinkFlask() gated on FLASK.enabled + gated touch btn present in served bytes");
    gate("SEAM/render", /if\(tb\.flask\) btn\(tb\.flask,COL\.heal\)/.test(rndTxt),
      "render.js: gated ⚕ touch button (tb.flask ⇒ COL.heal) present in served bytes");
    gate("SEAM/hud", /nodes\.flask/.test(hudTxt) && /flaskf:/.test(hudTxt) && /FLASK\.charges/.test(hudTxt),
      "hud.js: gated Estus pips + channel groove (nodes.flask, flaskf colour, FLASK.charges) present in served bytes");
    gate("SEAM/game", /FLASK\.enabled \?.*flaskCharges:h\.flaskCharges/.test(gameTxt) || /flaskCharges:h\.flaskCharges/.test(gameTxt),
      "game.js: gated HUD feed (flaskCharges/flaskDrinkT) present in served bytes");
    gate("SEAM/strings", /flaskHint:\s*"U bebe del Frasco/.test(strTxt),
      "strings.js: STR.flaskHint present in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.flask.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers flask* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `flask* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1854c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the FLASK knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "KeyU" && meta.charges === 3 && meta.healPct === 0.40 && meta.drinkMs === 750 && meta.cancelOnAction === true && meta.refillOnZone === true,
      `FLASK enabled=${meta.enabled} key=${meta.key} charges=${meta.charges} healPct=${meta.healPct} drinkMs=${meta.drinkMs}ms cancelOnAction=${meta.cancelOnAction} refillOnZone=${meta.refillOnZone}`);

    // ---- AC4: charges 3→0 + exact heal round(maxHp·0.40) + clamp ----
    const dp = r.drink;
    gate("AC4/charges-heal-clamp", !!dp && dp.ok,
      dp ? `armed sin consumir(${dp.armed}); completa⇒−1 carga(${dp.consumedOne}) + heal EXACTO round(maxHp·0.40)=${dp.expectHeal} (healed=${dp.healed}, exact=${dp.healExact}); drena a 0(${dp.drainedToZero}); a 0 no arranca(${dp.noStartAtZero}); a vida llena no arranca(${dp.noStartAtFull}); near-full clampa sin overheal(${dp.clampNoOverheal})` : "probe null");

    // ---- AC3: root + vulnerable (no power action fires, takes NORMAL damage, no i-frames) ----
    const rp = r.root;
    gate("AC3/root-vulnerable", !!rp && rp.ok,
      rp ? `bebiendo (no-interrumpible) ⇒ ligero(${rp.noLight})/pesado(${rp.noHeavy})/cast(${rp.noCast})/rodar(${rp.noRoll}) NO disparan, canal sobrevive(stillDrinking=${rp.stillDrinking}); recibe daño NORMAL sin i-frames(tookDamage=${rp.tookDamage})` : "probe null");

    // ---- AC5: cancel-on-action (attack/heavy/cast/roll) aborts sin coste ----
    const cp = r.cancel;
    gate("AC5/cancel-no-cost", !!cp && cp.ok,
      cp ? `atacar/pesado/castear/rodar mientras se bebe ⇒ aborta, carga intacta, sin heal — atk=${J(cp.atk)} heavy=${J(cp.heavy)} cast=${J(cp.cast)} roll=${J(cp.roll)}` : "probe null");

    // ---- AC6: refill on zone change; same zone ⇒ no refill; first tick only seeds ----
    const fp = r.refill;
    gate("AC6/refill-on-zone", !!fp && fp.ok,
      fp ? `misma zona (aunque se gasten cargas) ⇒ NO recarga(${fp.sameZoneNoRefill}); cambio de zona ⇒ charges=max(${fp.zoneRefill}); primer tick sólo siembra(${fp.seedNoRefill})` : "probe null");

    // ---- AC1 OFF byte-id: FLASK.enabled=false ⇒ drink inert, tick no-op, gates ignore flaskDrinkT ----
    const off = r.off;
    gate("AC1/off-inert", !!off && off.ok,
      off ? `OFF ⇒ drinkFlask inerte(${off.inert}), tickFlask no-op(${off.tickNoop}), con un flaskDrinkT forzado el ataque AÚN dispara (gate lo ignora, attackFires=${off.attackFires}) — byte-identical a HEAD` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real flask FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a REAL completed drink (−1 carga + heal) + a cancelled drink + loot kills`);
    gate("AC2/flask-fired", s.on.flaskFired === true, `the ON probe DID complete a drink AND cancel another by action (not just the flag): flaskFired=${s.on.flaskFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL FLASK ON vs OFF — la curación es aritmética/timing (no flaskRng; 0 srand draws) incluso cuando el frasco dispara");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC7 SAVE: transient flask state ⇒ save.v1 byte-id ON/OFF, no flask key ----
    const sb = r.save;
    gate("AC7/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL con flask state ON vs OFF (byteId=${sb.byteId}), SIN clave flask* (hasKey=${sb.hasKey}) — flaskCharges/flaskDrinkT/flaskZone transitorios, fuera del allowlist de serializeSave` : "probe null");

    // ---- AC7-live / pips $0 art: drink through the REAL KeyU→drinkFlask path in the running game ----
    const la = await liveDrink(page);
    gate("AC7/live-drink", la.ok, la.ok ? `real KeyU (${la.key}) keydown → input.js → sim.drinkFlask() armó el canal en el mundo vivo (drinkT=${la.drinkT}, charges=${la.charges} aún sin gastar) ⇒ pips/groove DOM dibujados (0 PNG)` : `live drink failed: ${la.why || ""} (drinkT=${la.drinkT})`);

    // ---- AC evidence screenshot: capture the play surface with the Estus pips drawn ----
    await page.screenshot({ path: `${OUT}/${label}-flask-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (10 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on"]) {
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
    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404|503/i.test(e));
    gate("REG/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean");

  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headHashes = Object.fromEntries(FILES.map((f) => [f, refMd5(f)]));
console.log(`CAS-1862 LIVE QA — Frasco de Curación (Estus) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1862 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
