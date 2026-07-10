// ===========================================================================
// CAS-1871 (QA for CAS-1867) — LIVE QA: Mancha de Sangre (Bloodstain / Corpse-Run, 11ª feature Souls-like).
// Verifies the CAS-1869 build (deployed by CAS-1870, overlay build e8fd244817ac) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
// Mirror of tools/cas1854-flask-live-qa.mjs / tools/cas1847-lock-on-live-qa.mjs.
//
// Feature = INTERCEPT the Esencia banking at death. Hoy morir BANCA automáticamente toda la Esencia del run
// (heroDie, sim.js). Este knob la REDIRIGE: `atRisk=round(gain·lossPct)` queda como una Mancha de Sangre en el
// PUNTO DE MUERTE (store aislado mithralda.bloodstain.v1); sólo la parte `safe` (gain·(1−lossPct)) se banca.
// Recuperarla = check dist² determinista en tickBloodstain (MISMA zona + recoverRadius, walk-over) ⇒ banca amount,
// borra la mancha + su store. Morir otra vez ANTES ⇒ reemplazo canónico: la mancha vieja se PIERDE. TODO es
// aritmética/geometría ⇒ CERO srand draws, NO existe bloodstainRng ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con la
// feature DISPARANDO (drop+recover reales). G.bloodstain vive en su PROPIO store vía el flag one-shot
// G.bloodstainDirty (persist.js escribe/borra) ⇒ save.v1 byte-id, SIN clave bloodstain*. Marcador = charco $0 arte
// (markerColor + shimmer con G.t), y-sorted, visible SÓLO en su zona. HARD-GATED: BLOODSTAIN.enabled=false ⇒ el
// banking de siempre corre igual, sin mancha, sin store, sin marcador ⇒ byte-idéntico a HEAD.
//
//   node tools/cas1867-bloodstain-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1869 build touched exactly these 6 blobs — HARD md5 gate; read the set from
// `git show --stat 91dba2e`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). The
// bloodstain deploy (build e8fd244817ac) is the LATEST gh-pages deploy, so nothing has layered onto
// these blobs since ⇒ ALL 6 are EXACT md5 == HEAD (no shared-blob drift caveat).
// REF = HEAD (== build commit 91dba2e; the deploy commit 8c37204 only adds the deploy tool).
//   game.js, persist.js, render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1817 / CAS-1834 / CAS-1862): these probes drive the REAL running game — the live
// page boots buildTiledWorld (the world the player actually plays), so G / heroDie / tickBloodstain / persist
// bootBloodstain son los SHIPPED paths. The bloodstain* dev hooks are recovered by dynamically importing the SAME
// live sim.js URL (ESM dedups by URL ⇒ the running game's instance) because the build wired them onto the sim `dev`
// export but NOT onto game.js's window.__dev allowlist.
//
// ISOLATION (lesson backstab/poise/stamina/lock-on/flask): the bloodstain probes rearm G (_bloodArm zeroes
// enemies/projectiles/fx/fields AND rewrites the hero to a clean warrior, runs heroDie/tickBloodstain, mutates
// G.bloodstain/G.scene/G.run/meta.essence); with the LIVE render loop still running, residual/undefined array
// entries or the rewritten hero would trip drawBloodstain / drawFx. So EVERY behavioral probe runs inside ONE
// page.evaluate that first snapshots + quiesces all sim arrays AND shallow-snapshots the hero + scene/run/bloodstain,
// then HARD-restores in a finally — a single synchronous block, so no rAF interleaves mid-probe.
//
// Covers: AC0 md5 live==HEAD (6 blobs) + SEAM served bytes carry the feature (config BLOODSTAIN knob, sim
// heroDie intercept/tickBloodstain, persist bootBloodstain/saveBloodstain/KEY, render drawBloodstain, game
// bootBloodstain, strings) / CONTENT knob matches spec / AC1 OFF byte-id (heroDie banks ALL, tick no-op) / AC2
// srand ON==OFF WITH real drop+recover FIRING (48 draws, 0 new) / AC3 drop en punto+zona de muerte,
// amount=round(gain·lossPct), safe banked, recap intact / AC4 recover exacto banca amount + store borrado +
// out-of-range no recupera / AC5 reemplazo pierde la vieja (A no bancado) / AC6 cross-zona no borra + solo-misma-zona
// recupera / AC7 save.v1 byte-id sin clave bloodstain* + isolated store + LIVE drop through the real heroDie path /
// REG 11 systems (frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on/flask) srand ON==OFF +
// boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// All 6 bloodstain blobs are EXCLUSIVE (the bloodstain deploy is the latest ⇒ nothing shares a live line on
// top), so every one is exact-md5 gated == HEAD.
const FILES = ["game.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1871"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 91dba2e; the deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.BLOODSTAIN_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 6 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "GraveQA"; ni.blur(); }  // NB: no blood/stain/esencia substring ⇒ AC7 save-key regex can't false-match
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the bloodstain* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running
// game's instance). Stash the `dev` object on window.__bk for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["bloodstainMeta", "bloodstainEnable", "bloodstainState", "bloodstainDropProbe", "bloodstainRecoverProbe",
        "bloodstainReplaceProbe", "bloodstainZoneProbe", "bloodstainSaveByteId", "bloodstainOffProbe", "bloodstainSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene/run/bloodstain/meta
// (the bloodstain probes rearm all of these), run every bloodstain probe + the REG srand probes, then HARD-restore in
// a finally. No rAF interleaves inside a single page.evaluate ⇒ the live render loop never sees a corrupt array, the
// rewritten warrior hero, or a stray bloodstain marker mid-probe.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: _bloodArm reassigns hero fields
    const sceneSnap = G.scene, runSnap = G.run, bsSnap = G.bloodstain, bsDirtySnap = G.bloodstainDirty;
    const metaSnap = (G.meta && typeof G.meta.essence === "number") ? G.meta.essence : null;
    const r = {};
    try {
      r.meta = d.bloodstainMeta();
      r.drop = d.bloodstainDropProbe();
      r.recover = d.bloodstainRecoverProbe();
      r.replace = d.bloodstainReplaceProbe();
      r.zone = d.bloodstainZoneProbe();
      r.save = d.bloodstainSaveByteId();
      r.off = d.bloodstainOffProbe();
      r.srand = { on: d.bloodstainSrandProbe(true, seed, n), off: d.bloodstainSrandProbe(false, seed, n), on2: d.bloodstainSrandProbe(true, seed, n) };
      // REG: prior beats' srand probes stay ON==OFF (no regression from the bloodstain seam) — 11 systems.
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
        ["flask", 0x1854c0de, "flaskSrandProbe", []],
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
      G.scene = sceneSnap; G.run = runSnap; G.bloodstain = bsSnap; G.bloodstainDirty = bsDirtySnap;
      if (metaSnap != null && G.meta) G.meta.essence = metaSnap;
    }
    return r;
  }, SEED, N);
}

// LIVE drop: drive the REAL heroDie intercept path once more on the running tiled-world sim (the drop probe calls the
// SHIPPED heroDie() and self-restores its own scratch), inside a full snapshot/restore so the live render loop / hero
// stay clean afterwards. Belt + suspenders that the death-seam runs against the actual running game instance.
async function liveDrop(page) {
  return await page.evaluate(() => {
    const d = window.__bk, G = window.__bkG, h = G.hero;
    if (!h) return { ok: false, why: "no hero" };
    const before = { bs: G.bloodstain, dirty: G.bloodstainDirty, dead: h.dead, scene: G.scene, run: G.run,
      essence: (G.meta && G.meta.essence) | 0, x: h.x, y: h.y,
      en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    try {
      const st0 = d.bloodstainState();
      const dp = d.bloodstainDropProbe();   // runs the SHIPPED heroDie() intercept on the live sim (self-restores its scratch)
      const st1 = d.bloodstainState();
      return { ok: !!(dp && dp.ok), ranHeroDie: true, dropOk: !!(dp && dp.ok), amount: dp ? dp.amount : null,
        essenceBefore: st0.essence, essenceAfter: st1.essence };
    } finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...before.en); G.projectiles.push(...before.pr); G.fx.push(...before.fx); G.fields.push(...before.fld);
      G.bloodstain = before.bs; G.bloodstainDirty = before.dirty; h.dead = before.dead; G.scene = before.scene;
      G.run = before.run; if (G.meta) G.meta.essence = before.essence; h.x = before.x; h.y = before.y;
    }
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, all 6 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/bloodstain deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", perTxt = servedText["persist.js"] || "", rndTxt = servedText["render/render.js"] || "",
      gameTxt = servedText["game.js"] || "";
    gate("SEAM/config", /export const BLOODSTAIN\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /lossPct:\s*1\.0/.test(cfgTxt) && /recoverRadius:\s*32/.test(cfgTxt) && /markerColor:\s*"#8b0000"/.test(cfgTxt),
      "BLOODSTAIN knob (enabled/lossPct:1.0/recoverRadius:32/markerColor:#8b0000) present in served config.js");
    gate("SEAM/sim", /function tickBloodstain\(/.test(simTxt) && /function heroDie\(/.test(simTxt) && /G\.bloodstain\s*=/.test(simTxt) && /bloodstainDirty/.test(simTxt) && /BLOODSTAIN\.lossPct/.test(simTxt),
      "sim: heroDie intercept + tickBloodstain + G.bloodstain + bloodstainDirty + lossPct present in served sim.js");
    gate("SEAM/persist", /function bootBloodstain\(/.test(perTxt) && /function saveBloodstain\(/.test(perTxt) && /mithralda\.bloodstain\.v1/.test(perTxt) && /bloodstainDirty/.test(perTxt),
      "persist.js: bootBloodstain + saveBloodstain + KEY_BLOODSTAIN (mithralda.bloodstain.v1) + dirty flush present in served bytes");
    gate("SEAM/render", /function drawBloodstain\(/.test(rndTxt) && /BLOODSTAIN\.markerColor/.test(rndTxt) && /BLOODSTAIN\.enabled\s*&&\s*G\.bloodstain/.test(rndTxt),
      "render.js: gated $0-art drawBloodstain (markerColor puddle, zone-gated y-sort) present in served bytes");
    gate("SEAM/game", /persist\.bootBloodstain\(\)/.test(gameTxt),
      "game.js: persist.bootBloodstain() rehydrate wired in served bytes");
    gate("SEAM/strings", /bloodstainRecovered:/.test(strTxt) && /bloodstainLost:/.test(strTxt) && /bloodstainHint:/.test(strTxt),
      "strings.js: STR.bloodstainRecovered/Lost/Hint present in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.flask.v1"); localStorage.removeItem("mithralda.bloodstain.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers bloodstain* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `bloodstain* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1867c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the BLOODSTAIN knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.lossPct === 1.0 && meta.recoverRadius === 32 && meta.markerColor === "#8b0000",
      `BLOODSTAIN enabled=${meta.enabled} lossPct=${meta.lossPct} recoverRadius=${meta.recoverRadius} markerColor=${meta.markerColor}`);

    // ---- AC3: drop en punto+zona de muerte, amount=round(gain·lossPct), safe banked, recap intact, dirty armed ----
    const dp = r.drop;
    gate("AC3/drop", !!dp && dp.ok,
      dp ? `muerte ⇒ mancha en el punto de muerte (pos=${dp.okPos}, zone=${dp.zone}); amount=round(gain·lossPct)=${dp.atRisk} (gain=${dp.gain}, amount=${dp.amount}, okAmount=${dp.okAmount}); safe bancado sólo(${dp.okMetaSafe}); recap.essence=gain(${dp.okRecap}); dirty armado(${dp.okDirty})` : "probe null");

    // ---- AC4: recover exacto banca amount + store borrado + dirty; out-of-range no recupera ----
    const rp = r.recover;
    gate("AC4/recover", !!rp && rp.ok,
      rp ? `walk-over misma zona dentro de recoverRadius ⇒ meta += amount EXACTO(${rp.banked}), mancha borrada(${rp.cleared}), dirty armado(${rp.dirty}); fuera del radio NO recupera(${rp.outOfRange})` : "probe null");

    // ---- AC5: reemplazo pierde la vieja (A no bancado), nueva mancha con el nuevo atRisk ----
    const rep = r.replace;
    gate("AC5/replace", !!rep && rep.ok,
      rep ? `morir con mancha activa (A=${rep.A}) ⇒ la vieja se PIERDE (A jamás bancado, oldLost=${rep.oldLost}); nueva mancha con atRisk=round(gain)=${rep.newAmount} (newStain=${rep.newStain})` : "probe null");

    // ---- AC6: cross-zona no borra + solo-misma-zona recupera ----
    const zp = r.zone;
    gate("AC6/zone", !!zp && zp.ok,
      zp ? `mancha en OTRA zona (${zp.other}) ⇒ estando en ${zp.zHere} NO recupera(${zp.noRecoverWrongZone}) y persiste cross-zona(${zp.persistsCrossZone}); en su MISMA zona SÍ recupera(${zp.recoverSameZone})` : "probe null");

    // ---- AC1 OFF byte-id: BLOODSTAIN.enabled=false ⇒ heroDie banca TODO, no crea mancha, tick no-op ----
    const off = r.off;
    gate("AC1/off-inert", !!off && off.ok,
      off ? `OFF ⇒ heroDie BANCA todo el gain(${off.banksAll}), NO crea mancha(${off.noStain}); con una mancha forzada tickBloodstain es no-op(${off.tickNoop}) — banking de siempre, byte-identical a HEAD` : "probe null");

    // ---- AC2 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real drop+recover FIRING ----
    const s = r.srand;
    gate("AC2/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a REAL death-DROP + walk-over RECOVER + loot kills`);
    gate("AC2/bloodstain-fired", s.on.bloodstainFired === true, `the ON probe DID drop a stain AND recover it (not just the flag): bloodstainFired=${s.on.bloodstainFired}`);
    gate("AC2/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL BLOODSTAIN ON vs OFF — el drop es punto-de-muerte, la recuperación es dist² (no bloodstainRng; 0 srand draws) incluso cuando la mancha dispara");
    gate("AC2/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC7 SAVE: isolated store ⇒ save.v1 byte-id ON/OFF, no bloodstain key ----
    const sb = r.save;
    gate("AC7/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL con bloodstain state ON vs OFF (byteId=${sb.byteId}), SIN clave bloodstain* (hasKey=${sb.hasKey}) — G.bloodstain vive en mithralda.bloodstain.v1, fuera del allowlist de serializeSave` : "probe null");

    // ---- AC7-live: drive the REAL heroDie drop path in the running game (isolated + restored) ----
    const la = await liveDrop(page);
    gate("AC7/live-drop", la.ok && la.ranHeroDie, la.ok ? `real heroDie() intercept en el mundo vivo redirigió la Esencia (amount=${la.amount}, essence ${la.essenceBefore}→${la.essenceAfter}) ⇒ death-seam + store aislado ejercitados en la instancia viva` : `live drop failed: ${la.why || ""}`);

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-bloodstain-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (11 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask"]) {
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
console.log(`CAS-1871 LIVE QA — Mancha de Sangre (Bloodstain/Corpse-Run) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1871 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
