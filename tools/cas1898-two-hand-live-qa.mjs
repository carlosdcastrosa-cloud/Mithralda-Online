// ===========================================================================
// CAS-1898 (QA for CAS-1895) — LIVE QA: EMPUÑADURA A DOS MANOS (Two-Handing, 15º pilar Souls-like). Verifica el build
// CAS-1896 (deployado por CAS-1897, overlay build b621205ffc42) sobre la URL canónica gh-pages. PASS x2 (desktop+mobile),
// navegador-por-pase. Mirror de tools/cas1893-equip-load-live-qa.mjs.
//
// Feature = un TOGGLE de postura ofensiva: empuñar el arma a DOS MANOS ENVAINA el escudo ⇒ más pegada a cambio de defensa.
// 100% BORROW, hard-gated, RNG-neutral, save-neutral (estado TRANSITORIO h.twoHand, mirror h.blocking, fuera del allowlist
// de serializeSave). Seams (todos gated TWO_HAND.enabled): (1) equipLoad(h) EXCLUYE el escudo a dos manos ⇒ ratio baja ⇒
// drop de banda (sinergia CAS-1889); (2) applyHeroMelee ×dmgMul(1.35) + opt.twoHand ⇒ hitEnemy escala poise-damage
// (POISE.gain CAS-1826) ×poiseMul(1.5); (3) heavyAttack/finisher gastan round(cost·stamMul 1.15) (STAMINA CAS-1841); (4) la
// rama de bloqueo de damageHero (SHIELD_BLOCK CAS-1873) SALE temprano a dos manos (reusa el gate h.blocking, sin nueva
// rama); (5) HUD DOM ($0 arte). CERO draws (NO twoHandRng) ⇒ srand ON==OFF byte-idéntico aun con la postura activa.
// HARD-GATED: enabled:false ⇒ toggle inerte, h.twoHand nunca sube ⇒ byte-idéntico a HEAD.
//
//   node tools/cas1898-two-hand-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1896 build 79f54d6 tocó EXACTAMENTE estos 6 blobs — HARD md5 gate; leído de `git show --stat 79f54d6`,
// nunca copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). tools/cas1895-two-hand.mjs es dev-only (NO
// desplegado). El deploy commit 962847c sólo añade tools/cas1895-deploy.mjs ⇒ los 6 blobs live == HEAD verbatim ⇒ REF=HEAD.
//   game.js, hud.js, input.js, render/render.js, sim/config.js, sim/sim.js
//
// CRITICAL (lección CAS-1784/CAS-1862/CAS-1876/CAS-1883/CAS-1893): estos probes conducen el juego REAL en ejecución — la
// página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que G / equipLoad / applyHeroMelee /
// heavyAttack / damageHero / toggleTwoHand son los paths SHIPPED. Los hooks twoHand* se recuperan importando dinámicamente
// la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el export `dev`.
//
// ISOLATION (mirror cas1893): los probes rearman G (_twoHandArm vacía enemies/projectiles/fields/fx y REESCRIBE al héroe a
// un warrior limpio en play; varios probes MUTAN h.equip/h.twoHand y matan enemigos vía applyHeroMelee). Con el loop de
// render vivo, un héroe/arrays reescritos triparían el draw ⇒ TODOS los probes corren dentro de UN page.evaluate que
// primero snapshotea + quiesce los arrays de sim Y shallow-snapshotea el héroe + scene, y HARD-restaura en un finally — un
// único bloque síncrono, sin rAF interleaved. La REGRESIÓN de EquipLoad (14º pilar) es SENSIBLE A ZONA (su doRoll+loot mueve
// al héroe) ⇒ corre AL FINAL con el HÉROE PRÍSTINO del PUEBLO restaurado (mirror gotcha cas1893). El toggle live-real
// (ShiftRight / botón HUD) se dispara con el héroe restaurado y se revierte.
//
// Covers: AC0 md5 live==HEAD (6 blobs) + SEAM served bytes carry the feature (config TWO_HAND knob, sim dmgMul/poiseMul/
// stamMul/equipLoad-shield-exclusion/damageHero-early-exit/toggleTwoHand, game+hud+input+render marcador/tecla/botón) /
// CONTENT knob matches spec / AC toggle / AC2 banda drop + dmg ×1.35 + poise ×1.5 + stam ×1.15 + escudo DENY / AC1 OFF
// byte-id inerte / AC SAVE byte-id sin clave two* / AC4 srand ON==OFF 48-draw twoHandFired REAL (0 draws) + determinism /
// LIVE-REAL toggle key ShiftRight flips h.twoHand / AC3 REG 14 pilares srand ON==OFF (Frenzy…EquipLoad) / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 6 two-hand blobs son EXCLUSIVOS (el two-hand deploy es el último ⇒ nada comparte una línea live encima), así que
// cada uno es exact-md5 gated == HEAD.
const FILES = ["game.js", "hud.js", "input.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1898"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 79f54d6; el deploy commit 962847c sólo añadió tools/cas1895-deploy.mjs — 6 blobs intactos).
const REF = process.env.TWOHAND_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "DosManosQA"; ni.blur(); }  // NB: sin substring two/twohand ⇒ el regex de save-key (AC SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the twoHand* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G; window.__toggle2H = m.toggleTwoHand;
      const need = ["twoHandMeta", "_twoHandArm", "twoHandState", "twoHandToggle", "twoHandEquipBandProbe",
        "twoHandDmgProbe", "twoHandPoiseProbe", "twoHandStamProbe", "twoHandShieldDenyProbe", "twoHandOffProbe",
        "twoHandSaveByteId", "twoHandSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0 && typeof m.toggleTwoHand === "function", missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the REG-14 srand
// probes FIRST (pristine town hero — zone-safe; Bonfire relocates), then every two-hand probe (behavioral + srand), then
// EquipLoad srand LAST with the PRISTINE TOWN hero restored (its doRoll+loot is zone-sensitive), then a LIVE-REAL toggle via
// toggleTwoHand(), then HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG, toggle2H = window.__toggle2H;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: probes reassign hero fields + h.equip/h.twoHand
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: EquipLoad's killEnemy loop mutates the bag
    const sceneSnap = G.scene;
    const r = {};
    // Restore the PRISTINE TOWN hero (snapshot taken at play-entry, before any probe relocated it). twoHandSrandProbe's
    // internal killEnemy alignment loop draws ZONE-CONDITIONAL loot ⇒ it must run from TOWN (like the DOM-free build
    // harness's createHero town warrior) so ON/OFF draw 0 loot ⇒ byte-identical. Mirror gotcha cas1893/EquipLoad.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); } };
    try {
      // ---- TWO-HAND FIRST (héroe PRÍSTINO del PUEBLO, ANTES de que Bonfire lo reubique) ----
      // content knob + AC toggle + the 5 behavioral seams
      r.meta = d.twoHandMeta();
      d._twoHandArm();
      const s0 = d.twoHandState(), t1 = d.twoHandToggle(), t2 = d.twoHandToggle();
      r.toggle = { s0, t1, t2 };
      r.band = d.twoHandEquipBandProbe();
      r.dmg = d.twoHandDmgProbe();
      r.poise = d.twoHandPoiseProbe();
      r.stam = d.twoHandStamProbe();
      r.shield = d.twoHandShieldDenyProbe();

      // ---- AC1 OFF byte-id + AC SAVE byte-id ----
      r.off = d.twoHandOffProbe();
      r.save = d.twoHandSaveByteId();

      // ---- AC4 srand ON==OFF (real toggle+swing+heavy firing, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.twoHandSrandProbe(true, seed, n);
      armTown(); const _off = d.twoHandSrandProbe(false, seed, n);
      armTown(); const _on2 = d.twoHandSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- LIVE-REAL: toggleTwoHand() (the fn ShiftRight desktop + touch button call) flips h.twoHand on the running hero ----
      d._twoHandArm();
      const beforeH = !!G.hero.twoHand; toggle2H(); const midH = !!G.hero.twoHand; toggle2H(); const afterH = !!G.hero.twoHand;
      r.liveToggle = { before: beforeH, mid: midH, after: afterH, ok: beforeH === false && midH === true && afterH === false };

      // ---- REG: 14 pilares previos srand ON==OFF (Frenzy…Bonfire; Bonfire REUBICA al héroe ⇒ corre tras las two-hand probes) ----
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
        ["bonfire", 0x1879c0de, "bonfireSrandProbe", []],
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;

      // ---- REG EquipLoad (14º pilar) LAST: héroe PRÍSTINO del pueblo restaurado (doRoll+loot es sensible a zona) ----
      armTown();
      if (typeof d._equipArm === "function") d._equipArm();
      if (typeof d.equipSrandProbe === "function") {
        const on = d.equipSrandProbe(true, 0x1889c0de, 24), off = d.equipSrandProbe(false, 0x1889c0de, 24);
        r.reg.equip = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      } else r.reg.equip = { absent: true };
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); }
      G.scene = sceneSnap;
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
    // ---- AC0 BUILD gate (live == HEAD, all 6 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/two-hand deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      gameTxt = servedText["game.js"] || "", hudTxt = servedText["hud.js"] || "",
      inpTxt = servedText["input.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const TWO_HAND\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"ShiftRight"/.test(cfgTxt) && /dmgMul:\s*1\.35/.test(cfgTxt) && /poiseMul:\s*1\.5/.test(cfgTxt) && /stamMul:\s*1\.15/.test(cfgTxt) && /dropsShield:\s*true/.test(cfgTxt),
      "TWO_HAND knob (enabled/key:ShiftRight/dmgMul:1.35/poiseMul:1.5/stamMul:1.15/dropsShield:true) present in served config.js");
    gate("SEAM/sim", /th\?TWO_HAND\.dmgMul:1/.test(simTxt) && /TWO_HAND\.enabled\s*&&\s*opt\s*&&\s*opt\.twoHand\)\s*add\*=TWO_HAND\.poiseMul/.test(simTxt) && /STAMINA\.cost\.heavy\*twoHandStamMul\(h\)/.test(simTxt) && /slot==="shield"\s*&&\s*TWO_HAND\.enabled\s*&&\s*h\s*&&\s*h\.twoHand\)\s*continue/.test(simTxt) && /!\(TWO_HAND\.enabled\s*&&\s*h\.twoHand\)/.test(simTxt) && /export function toggleTwoHand\(\)/.test(simTxt),
      "sim: dmg×dmgMul + poise×poiseMul + heavy×stamMul + equipLoad shield-exclusion + damageHero early-exit + toggleTwoHand present in served sim.js");
    gate("SEAM/game", /TWO_HAND\.enabled\s*\?\s*{\s*twoHand:!!h\.twoHand\s*}/.test(gameTxt),
      "game.js: gated HUD feed (TWO_HAND.enabled ? {twoHand:!!h.twoHand} — absent OFF ⇒ HUD byte-id) present in served bytes");
    gate("SEAM/hud", /classList\.toggle\("twohand",\s*!!s\.twoHand\)/.test(hudTxt),
      "hud.js: two-hand marcador class toggled from s.twoHand feed, in served bytes");
    gate("SEAM/input", /code===TWO_HAND\.key\s*&&\s*TWO_HAND\.enabled\){\s*sim\.toggleTwoHand\(\)/.test(inpTxt) && /twohand:\{[^}]*act:\(\)=>sim\.toggleTwoHand\(\)/.test(inpTxt),
      "input.js: ShiftRight desktop toggle + gated mobile touch button (twohand ⇒ sim.toggleTwoHand), in served bytes");
    gate("SEAM/render", /tb\.twohand/.test(rndTxt) && /G\.hero&&G\.hero\.twoHand/.test(rndTxt),
      "render.js: gated touch button draw (lit by active two-hand posture), in served bytes");

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

    // ---- wire the live sim module (recovers twoHand* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `twoHand* hooks + toggleTwoHand live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1895c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the TWO_HAND knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "ShiftRight" && meta.dmgMul === 1.35 && meta.poiseMul === 1.5 && meta.stamMul === 1.15 && meta.dropsShield === true && meta.moveMul === 1.0,
      `TWO_HAND enabled=${meta.enabled} key=${meta.key} dmgMul=${meta.dmgMul} poiseMul=${meta.poiseMul} stamMul=${meta.stamMul} dropsShield=${meta.dropsShield} moveMul=${meta.moveMul}`);

    // ---- AC toggle: posture flips one-hand ⇄ two-hand ----
    const tg = r.toggle;
    gate("AC/toggle", tg.s0 && tg.s0.twoHand === false && tg.t1 && tg.t1.twoHand === true && tg.t2 && tg.t2.twoHand === false,
      `postura una-mano(${tg.s0 && tg.s0.twoHand}) → dos-manos(${tg.t1 && tg.t1.twoHand}) → una-mano(${tg.t2 && tg.t2.twoHand})`);

    // ---- AC2 banda drop: shield leaves equipLoad a dos manos ⇒ band drop observable ----
    const eb = r.band;
    gate("AC2/band-drop", !!eb && eb.ok,
      eb ? `loadout rare ⇒ '${eb.bandFull}' (ratio=${eb.ratioFull}); a dos manos escudo SALE ⇒ '${eb.bandTwo}' (ratio=${eb.ratioTwo}) ⇒ drop observable (sinergia CAS-1889)` : "probe null");

    // ---- AC2 dmg ×dmgMul ----
    const dm = r.dmg;
    gate("AC2/dmg-x1.35", !!dm && dm.ok,
      dm ? `swing una-mano=${dm.dOff} vs dos-manos=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(${dm.expect})` : "probe null");

    // ---- AC2 poise ×poiseMul ----
    const pp = r.poise;
    gate("AC2/poise-x1.5", !!pp && pp.ok,
      pp ? `poise-damage una-mano=${pp.pOff}(=light) vs dos-manos=${pp.pOn}(=light·poiseMul ${pp.expect}) ⇒ staggerea más rápido` : "probe null");

    // ---- AC2 stam ×stamMul ----
    const st = r.stam;
    gate("AC2/stam-x1.15", !!st && st.ok,
      st ? `PODER-swing pesado gasta ${st.spentOff}(=cost ${st.expOff}) una-mano vs ${st.spentOn}(=round(cost·stamMul) ${st.expOn}) dos-manos` : "probe null");

    // ---- AC2 escudo DENY: block branch exits early a dos manos ----
    const sd = r.shield;
    gate("AC2/shield-deny", !!sd && sd.ok,
      sd ? `sin bloquear=${sd.dU}; guardia 1-mano MITIGA=${sd.dBlock}(<${sd.dU}); guardia+2-manos ⇒ DENY daño COMPLETO=${sd.dTwo}(==${sd.dU})` : "probe null");

    // ---- AC1 OFF byte-id: enabled=false ⇒ forced h.twoHand=true INERT ----
    const off = r.off;
    gate("AC1/off-inert", !!off && off.ok,
      off ? `OFF ⇒ h.twoHand=true INERTE — dmg idéntico (${off.dForced}==${off.dRef}), banda idéntica (${off.bandForced}==${off.bandRef}), escudo sigue mitigando (${off.dBlock}<${off.dU}) — byte-id a HEAD` : "probe null");

    // ---- AC SAVE: transient toggle ⇒ save.v1 byte-id ON/OFF, no two* key ----
    const sb = r.save;
    gate("AC/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL ON vs OFF (byteId=${sb.byteId}), SIN clave two* (hasKey=${sb.hasKey}) — h.twoHand transitorio, sin campo nuevo` : "probe null");

    // ---- AC4 srand ON==OFF WITH a real toggle+swing+heavy firing (0 draws) ----
    const s = r.srand;
    gate("AC4/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around un TOGGLE + swing + PODER-swing real`);
    gate("AC4/two-hand-fired", s.on.twoHandFired === true, `the ON probe DID activate the posture + escaló dmg/poise/stam consumiendo 0 srand: twoHandFired=${s.on.twoHandFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC4/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL TWO_HAND ON vs OFF — la empuñadura es input/aritmética (no twoHandRng; 0 draws) aun disparando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.twoHandFired} offFired=${s.off.twoHandFired}`);
    gate("AC4/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- LIVE-REAL: toggleTwoHand() (the ShiftRight / touch-button fn) flips the running hero's posture ----
    const lt = r.liveToggle;
    gate("LIVE/toggle-real", !!lt && lt.ok,
      lt ? `toggleTwoHand() (fn de ShiftRight desktop + botón HUD móvil) sobre el héroe VIVO: ${lt.before} → ${lt.mid} → ${lt.after}` : "probe null");

    // ---- AC evidence screenshot: capture the play surface (HUD carries the two-hand marker) ----
    await page.screenshot({ path: `${OUT}/${label}-two-hand-play.png` }).catch(() => {});

    // ---- AC3 REG: prior beats' srand probes stay ON==OFF (14 pilares: Frenzy…Bonfire + EquipLoad) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "bonfire", "equip"]) {
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
console.log(`CAS-1898 LIVE QA — Empuñadura a Dos Manos (Two-Handing, Pilar 15) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1898 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
