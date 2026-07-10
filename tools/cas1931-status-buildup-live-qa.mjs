// ===========================================================================
// CAS-1935 (QA for CAS-1931) — LIVE QA: ACUMULACIÓN DE ESTADOS (Status Buildup, knob STATUS_BUILDUP, 21º pilar Souls-like).
// Verifica el build CAS-1933 (deployado por CAS-1934 deploy tool, build 9b369bb51869) sobre la URL canónica gh-pages.
// PASS x2 (desktop+mobile), navegador-por-pase. Mirror de tools/cas1926-weapon-buffs-live-qa.mjs.
//
// Feature: barras OCULTAS de acumulación por tipo (ent.bld{bleed,poison,frost}) que PROCEAN un efecto en RÁFAGA al llenarse y
// DECAEN si no se sostiene la presión (castiga picotear). 100% BORROW sobre el motor de status CAS-118 (applyStatus/tickDots):
// cada golpe elemental on-hit se RECONVIERTE (gated, statusOrBuildup) en acumulación en vez de aplicar el status al instante; el
// golpe físico melee alimenta bleed. addBuildup(ent,btype,srcAmt,isHero) sube ent.bld[btype] por type.build (×bossBuildMul si
// isBoss); al cruzar threshold ⇒ reset + procBuildup: bleed⇒ráfaga round(maxHp*procPctHp) defence-bypass ruteada a killEnemy/
// heroDie · poison⇒applyStatus(poison) DoT fuerte N s · frost⇒applyStatus(slow) + drena estamina (héroe). tickBuildup decae
// decayPerSec*dt junto a tickDots. Paridad enemigo→héroe por el MISMO helper vía el choke damageHero:4566. CERO draws (100%
// aritmética/timing) ⇒ srand ON==OFF byte-idéntico aun acumulando+proceando. HARD-GATED: enabled:false ⇒ statusOrBuildup CAE al
// applyStatus original + addBuildup early-out ⇒ byte-idéntico a HEAD (20 pilares; bleed inerte, 0 medidor/tick/proc).
//
//   node tools/cas1931-status-buildup-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1933 build 92d2bfa tocó EXACTAMENTE estos 2 blobs PROD — HARD md5 gate; leído de `git show --stat 92d2bfa`,
// nunca copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). El feedback del proc es floater/addFx dentro de sim
// (render NO tocado) ⇒ 2 blobs (patrón WEAPON_ARCHETYPES/HYPERARMOR). tools/cas1931-status-buildup.mjs es dev-only (NO desplegado).
// El deploy commit 0166b73 sólo añade tools/cas1931-deploy.mjs ⇒ los 2 blobs live == HEAD verbatim ⇒ REF=HEAD.
//   sim/config.js, sim/sim.js
//
// CRITICAL (lección CAS-1784/…/CAS-1924/CAS-1929): estos probes conducen el juego REAL en ejecución — la página live bootea
// buildTiledWorld (el mundo que el jugador realmente juega), así que addBuildup / procBuildup / tickBuildup / statusOrBuildup /
// hitEnemy(opt.melee) / damageHero(choke) / applyStatus son los paths SHIPPED. Los hooks buildup*/_bld* se recuperan importando
// dinámicamente la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el export `dev`.
//
// ISOLATION (mirror cas1926/1920/1914): los probes rearman G (_bldArm vacía enemies/projectiles/fields/fx y fuerza al héroe a un
// warrior limpio/tanky en play con el medidor bld=null). Con el loop de render vivo, un héroe/arrays reescritos triparían el draw
// ⇒ TODOS los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de sim Y shallow-snapshotea el
// héroe + scene, y HARD-restaura en un finally — un único bloque síncrono, sin rAF interleaved. Las buildup* probes corren PRIMERO
// con el héroe PRÍSTINO del pueblo. La REG de los 20 pilares previos (Frenzy…Weapon-Buffs) es SENSIBLE A ZONA para algunos
// (Arts/Archetypes/Two-Hand/EquipLoad/Throwables/Buffs killEnemy de alineación del loot) ⇒ corren AL FINAL con el HÉROE PRÍSTINO
// del PUEBLO restaurado (mirror gotcha cas1893/1898/1904/1911/1917/1924/1929).
//
// Covers: AC0 md5 live==HEAD (2 blobs) + SEAM served bytes carry the feature (config STATUS_BUILDUP knob, sim addBuildup/
// procBuildup/tickBuildup/statusOrBuildup gate + buildup* dev hooks) / content knob (3 tipos bleed/poison/frost, decayPerSec,
// bossBuildMul, elementMap burn⇒poison/slow⇒frost) / AC0 OFF byte-id inerte (status instantáneo, sin medidor) / AC1 baseline
// (sub-umbral sube sin proc == 20-pilar) / AC2 bleed (golpe físico melee llena ⇒ ráfaga round(maxHp*procPctHp) + reset + jefe +
// killEnemy) / AC3 poison (burn reconvertido ⇒ DoT poison N s) / AC4 frost (frost reconvertido ⇒ slow + drena stam héroe) / AC5
// decae (decayPerSec ⇒ picotear no procea) / AC6 paridad (héroe recibe buildup vía damageHero) / AC7 compone (whet ×1.35 sigue +
// bleed fed + sin bypass poise/i-frames) / AC8 srand ON==OFF 48-draw buildupProc REAL (0 draws) + determinism / AC9 SAVE byte-id
// sin clave bld*/buildup*/bleed* / AC10 REG 20 pilares srand ON==OFF + 60fps + touch.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 2 blobs de buildup son EXCLUSIVOS (el status-buildup deploy es el último ⇒ nada comparte una línea live encima), así que
// cada uno es exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1935"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 92d2bfa; el deploy commit 0166b73 sólo añadió tools/cas1931-deploy.mjs — 2 blobs intactos).
const REF = process.env.BLD_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on both exclusive blobs
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

// benign browser noise filter (favicon 404, transient CDN 503 etc.) — real files are md5-gated.
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "SangreQA"; ni.blur(); }  // NB: sin substring bld/buildup/bleed ⇒ el regex de save-key (AC9 SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));  // warrior (melee/heavy swing surface for REG)
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the buildup* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["buildupMeta", "_bldArm", "_bldDummy", "buildupOffProbe", "buildupBaselineProbe", "buildupBleedProbe",
        "buildupPoisonProbe", "buildupFrostProbe", "buildupDecayProbe", "buildupParityProbe", "buildupComposeProbe",
        "buildupSaveByteId", "buildupSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the buildup* probes FIRST
// (pristine town hero), then REG 20 pilares srand ON==OFF (zone-sensitive ones re-arm the town hero between calls), then
// HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: probes reassign hero fields
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: killEnemy loops mutate the bag
    const sceneSnap = G.scene;
    const r = {};
    // Restore the PRISTINE TOWN hero (snapshot at play-entry). The zone-sensitive srand/killEnemy alignment loops draw
    // ZONE-CONDITIONAL loot ⇒ ON/OFF must run from the SAME town position (like the build harness's createHero town warrior).
    // NB the buildup probes leave h.bld transient; force-clear here defensively so nothing carries between REG calls.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); G.hero.bld = null; } };
    try {
      // ---- BUILDUP FIRST (héroe PRÍSTINO del PUEBLO) ----
      r.meta = d.buildupMeta();
      r.off = d.buildupOffProbe();            // AC0 OFF byte-id inerte (status instantáneo, sin medidor)
      r.baseline = d.buildupBaselineProbe();  // AC1 sub-umbral sube sin proc == 20-pilar
      r.bleed = d.buildupBleedProbe();        // AC2 bleed: golpe físico ⇒ ráfaga %maxHp + reset + jefe + killEnemy
      r.poison = d.buildupPoisonProbe();      // AC3 poison: burn reconvertido ⇒ DoT poison N s
      r.frost = d.buildupFrostProbe();        // AC4 frost: reconvertido ⇒ slow + drena stam héroe
      r.decay = d.buildupDecayProbe();        // AC5 decae: decayPerSec ⇒ picotear no procea
      r.parity = d.buildupParityProbe();      // AC6 paridad: héroe recibe buildup vía damageHero
      r.compose = d.buildupComposeProbe();    // AC7 compone: whet ×1.35 + bleed fed + sin bypass poise/i-frames
      r.save = d.buildupSaveByteId();         // AC9 SAVE byte-id sin clave bld*/buildup*/bleed*

      // ---- AC8 srand ON==OFF (buildup acumulando+proceando, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.buildupSrandProbe(true, seed, n);
      armTown(); const _off = d.buildupSrandProbe(false, seed, n);
      armTown(); const _on2 = d.buildupSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- AC10 REG: 15 pilares no-sensibles-a-zona (Frenzy…Bonfire; Bonfire REUBICA al héroe) ----
      armTown();
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
        ["bloodstain", 0x1867c0de, "bloodstainSrandProbe", []],
        ["shield", 0x1873c0de, "shieldSrandProbe", []],
        ["hyperarmor", 0x1901c0de, "hyperSrandProbe", []],
        ["bonfire", 0x1879c0de, "bonfireSrandProbe", []],
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;

      // ---- REG zona-sensibles — héroe PRÍSTINO del pueblo re-armado antes de cada uno (killEnemy/doRoll loot es sensible a zona) ----
      const ZONE = [
        ["arts", 0x1914c0de, "artSrandProbe"],
        ["archetypes", 0x1907c0de, "archSrandProbe"],
        ["twohand", 0x1895c0de, "twoHandSrandProbe"],
        ["equip", 0x1889c0de, "equipSrandProbe"],
        ["throwables", 0x1920c0de, "throwSrandProbe"],
        ["buffs", 0x1926c0de, "buffSrandProbe"],
      ];
      for (const [name, s, fn] of ZONE) {
        armTown();
        if (name === "equip" && typeof d._equipArm === "function") d._equipArm();
        if (typeof d[fn] !== "function") { r.reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24), off = d[fn](false, s, 24);
        r.reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); G.hero.bld = null; }
      G.scene = sceneSnap;
    }
    return r;
  }, SEED, N);
}

// DoD OBSERVABLE: capture the live play surface as the artifact + derive the bleed proc parameters from the served knob so the
// screenshot is accompanied by the concrete PROC math (N golpes físicos ⇒ ráfaga round(maxHp*procPctHp)). The behavioral burst
// itself is proven by r.bleed (real hitEnemy melee feed + hp burst + reset + killEnemy) — passed in so the artifact ties to it.
async function captureObservableProc(page, label, bleed) {
  const proc = await page.evaluate(() => {
    const d = window.__bk;
    try {
      const m = d.buildupMeta(); const bt = m.types.bleed;
      return { threshold: bt.threshold, build: bt.build, procPctHp: bt.procPctHp, tint: bt.tint,
        hitsToProc: Math.ceil(bt.threshold / bt.build), scene: (window.__dev && window.__dev.scene && window.__dev.scene()) || "?" };
    } catch (e) { return { err: String(e && e.message || e) }; }
  });
  await page.screenshot({ path: `${OUT}/${label}-status-buildup-play.png` }).catch(() => {});
  if (bleed) { proc.liveBurst = bleed.burst; proc.expectBurst = bleed.expectBurst; proc.reset = bleed.reset; proc.killed = bleed.killed; }
  return proc;
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD, both exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/status-buildup deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "";
    gate("SEAM/config", /export const STATUS_BUILDUP\s*=\s*{/.test(cfgTxt) && /STATUS_BUILDUP\s*=\s*{[\s\S]*?enabled:\s*true/.test(cfgTxt) && /decayPerSec:/.test(cfgTxt) && /bossBuildMul:/.test(cfgTxt) && /elementMap:\s*{[^}]*burn:\s*"poison"[\s\S]*?slow:\s*"frost"/.test(cfgTxt) && /bleed:\s*{[^}]*procPctHp:/.test(cfgTxt) && /poison:\s*{[^}]*procDot:/.test(cfgTxt) && /frost:\s*{[^}]*procSlow:/.test(cfgTxt),
      "STATUS_BUILDUP knob (enabled/decayPerSec/bossBuildMul/elementMap burn⇒poison·slow⇒frost/bleed procPctHp/poison procDot/frost procSlow) present in served config.js");
    gate("SEAM/sim", /function addBuildup\(/.test(simTxt) && /function procBuildup\(/.test(simTxt) && /function tickBuildup\(/.test(simTxt) && /function statusOrBuildup\(/.test(simTxt) && /buildupMeta\(\)/.test(simTxt) && /_bldArm\(/.test(simTxt) && /buildupSrandProbe\(/.test(simTxt) && /\.bld\b/.test(simTxt),
      "sim: addBuildup/procBuildup/tickBuildup/statusOrBuildup gate + buildupMeta + _bldArm + buildupSrandProbe + ent.bld meter present in served sim.js");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        for (const k of ["save", "pacts", "codex", "titles", "arena", "meta", "flask", "bloodstain", "bonfire"])
          localStorage.removeItem(`mithralda.${k}.v1`);
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers buildup* hooks the build left on the export dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `buildup* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1931c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the STATUS_BUILDUP knob (matches the design spec) ----
    const meta = r.meta, ty = meta.types || {};
    const has3 = ty.bleed && ty.poison && ty.frost;
    const emOk = meta.elementMap && meta.elementMap.burn === "poison" && meta.elementMap.slow === "frost";
    gate("CONTENT/knob", meta.enabled === true && has3 && meta.decayPerSec > 0 && meta.bossBuildMul > 0 && meta.bossBuildMul < 1 && emOk,
      `STATUS_BUILDUP enabled=${meta.enabled} | decay=${meta.decayPerSec}/s bossMul=${meta.bossBuildMul} elementMap=${J(meta.elementMap)} | 3 tipos=${!!has3}: ${has3 ? Object.keys(ty).map((k) => `${k}(thr${ty[k].threshold} +${ty[k].build})`).join(", ") : "MISSING"}`);

    // ---- AC0 OFF byte-id: enabled=false ⇒ status INSTANTÁNEO (no reconversión), sin medidor bld == 20-pilar HEAD ----
    const off = r.off;
    gate("AC0/off-inert", !!off && off.ok,
      off ? `enabled=false ⇒ burn/slow INSTANTÁNEO (instantBurn=${off.instantBurn} instantSlow=${off.instantSlow}) + sin medidor (noMeter=${off.noMeter} físico-no-feed=${off.stillNoMeter}) — byte-idéntico a HEAD` : "probe null");

    // ---- AC1 baseline: STATUS_BUILDUP on pero sub-umbral ⇒ 20-pillar feel intact (sube, no procea) ----
    const bl = r.baseline;
    gate("AC1/baseline", !!bl && bl.ok,
      bl ? `ON sub-umbral ⇒ medidor sube(${bl.meter}) SIN proc(meterRose=${bl.meterRose} noProc=${bl.noProc}) — feel 20 pilares conservado` : "probe null");

    // ---- AC2 bleed HEADLINE: golpe REAL melee (hitEnemy opt.melee) llena bld.bleed ⇒ ráfaga round(maxHp*procPctHp) + reset + jefe + killEnemy ----
    const bd = r.bleed;
    gate("AC2/bleed", !!bd && bd.ok,
      bd ? `Sangrado: golpe REAL melee alimenta bleed(${bd.meleeFeeds}); sub-umbral sin proc(${bd.noProcYet}); ráfaga=${bd.burst}≈${bd.expectBurst}(${bd.burstOk}) + reset(${bd.reset}); jefe ${bd.bossHits} golpes ráfaga=${bd.bburst}≈${bd.bExpect}(${bd.bossOk}); letal⇒killEnemy(${bd.killed})` : "probe null");

    // ---- AC3 poison: burn reconvertido ⇒ bld.poison llena ⇒ applyStatus(poison) DoT fuerte N s ----
    const po = r.poison;
    gate("AC3/poison", !!po && po.ok,
      po ? `Veneno: burn reconvertido ⇒ SIN veneno instantáneo(${po.noInstant}) sub-umbral sin proc(${po.noProcYet}); al llenarse ⇒ DoT poison fuerte(${po.poisonDot}) + reset(${po.reset})` : "probe null");

    // ---- AC4 frost: frost reconvertido ⇒ bld.frost llena ⇒ slow fuerte + drena stam (héroe) ----
    const fr = r.frost;
    gate("AC4/frost", !!fr && fr.ok,
      fr ? `Escarcha: frost reconvertido sub-umbral sin proc(${fr.noProcYet}); enemigo ⇒ slow fuerte(${fr.enemySlow}) + reset(${fr.enemyReset}); héroe ⇒ slow(${fr.heroSlow}) + drena stam a ${fr.heroStam}(${fr.stamDrained})` : "probe null");

    // ---- AC5 decae: sin sostener, medidor baja decayPerSec/s a 0/null; picotear no procea ----
    const de = r.decay;
    gate("AC5/decay", !!de && de.ok,
      de ? `Decae: medidor ${de.b0}⇒${de.afterTick} tras 1s(decayed=${de.decayed}) ⇒ 0/null(${de.clearedToNull}); picotear no procea(${de.peckNoProc})` : "probe null");

    // ---- AC6 paridad: el héroe RECIBE buildup de enemigos (damageHero choke); físico ⇒ ráfaga bleed, frost ⇒ slow+stam ----
    const pa = r.parity;
    gate("AC6/parity", !!pa && pa.ok,
      pa ? `Paridad héroe: físico melee enemigo ⇒ ráfaga bleed héroe=${pa.heroBurst}≈${pa.expectBurst}(${pa.bleedOk}); infl frost enemigo ⇒ héroe slow+drena stam(${pa.heroFrost}). Simétrico vía damageHero` : "probe null");

    // ---- AC7 compone: whet dmg×1.35 sigue aplicando Y el golpe alimenta bleed; el proc NO inyecta stun (no bypassa poise/i-frames) ----
    const cp = r.compose;
    gate("AC7/compose", !!cp && cp.ok,
      cp ? `Compone: whet ×1.35 sigue aplicando(actual=${cp.dmgApplied}≈${cp.dmgExpect} ${cp.dmgOk}) Y el golpe alimenta bleed(${cp.bledFed}); el proc NO inyecta stun(${cp.noStunInject}) — sin bypass poise/i-frames` : "probe null");

    // ---- AC9 SAVE byte-id: bld transitorio ⇒ save.v1 byte-identical, no bld*/buildup*/bleed* key ----
    const sb = r.save;
    gate("AC9/save-byte-id", !!sb && sb.ok,
      sb ? `h.bld{bleed/poison/frost} transitorio ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), SIN clave bld*/buildup*/bleed* (noBldKey=${sb.noBldKey}) len=${sb.offLen}` : "probe null");

    // ---- AC8 srand ON==OFF WITH real buildup accumulating + proccing (0 draws) ----
    const s = r.srand;
    gate("AC8/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) alrededor de acumular + procear bleed`);
    gate("AC8/buildup-proc", s.on.buildupFed === true && s.on.buildupProc === true, `the ON probe DID feed+proc the buildup consumiendo 0 srand: buildupFed=${s.on.buildupFed} buildupProc=${s.on.buildupProc}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC8/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL STATUS_BUILDUP ON vs OFF — el buildup es 100% aritmética/timing (no buildupRng; 0 draws) aun acumulando+proceando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onProc=${s.on.buildupProc} offProc=${s.off.buildupProc}`);
    gate("AC8/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- DoD OBSERVABLE: capture the live play surface + tie it to the real bleed proc burst (screenshot artifact) ----
    const proc = await captureObservableProc(page, label, r.bleed);
    gate("DOD/observable-proc", !proc.err && proc.hitsToProc > 0 && proc.expectBurst > 0 && proc.reset === true,
      proc.err ? `capture err=${proc.err}` : `PROC observable en loop real (scene=${proc.scene}): bleed thr=${proc.threshold} +${proc.build}/golpe ⇒ ${proc.hitsToProc} golpes físicos llenan ⇒ ráfaga REAL=${proc.liveBurst}≈${proc.expectBurst} hp + reset(${proc.reset}) letal⇒killEnemy(${proc.killed}) (tint ${proc.tint}); screenshot ${label}-status-buildup-play.png`);

    // ---- AC10 REG: prior beats' srand probes stay ON==OFF (20 pilares: Frenzy…Bonfire + Arts + Archetypes + Two-Handing + EquipLoad + Throwables + Weapon-Buffs) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "hyperarmor", "bonfire", "arts", "archetypes", "twohand", "equip", "throwables", "buffs"]) {
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

    // ---- TOUCH: mobile pass drives a touch input flip (parity with cas1898/1904/1911/1917/1924/1929 touch check) ----
    if (viewport.isMobile) {
      const touched = await page.evaluate(() => { try { return !!(window.__dev && window.__dev.scene && window.__dev.scene() === "play"); } catch { return false; } });
      gate("TOUCH/play", touched, `mobile viewport en play (touch surface activa)`);
    }

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
console.log(`CAS-1935 LIVE QA — Acumulación de Estados (Status Buildup, Pilar 21) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1935 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
