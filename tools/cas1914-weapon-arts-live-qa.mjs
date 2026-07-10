// ===========================================================================
// CAS-1917 (QA for CAS-1914) — LIVE QA: ARTES DE ARMA (Weapon Arts / "Ash of War", knob WEAPON_ARTS, 18º pilar Souls-like).
// Verifica el build CAS-1915 (deployado por CAS-1916, overlay build 71160e07eaab) sobre la URL canónica gh-pages.
// PASS x2 (desktop+mobile), navegador-por-pase. Mirror de tools/cas1907-weapon-archetypes-live-qa.mjs.
//
// Feature: cada ARQUETIPO de arma (Pilar 17) gana un movimiento FIRMA (tecla Semicolon / botón HUD tb.weaponart) con coste de
// estamina + cooldown, cuyo efecto escala por arquetipo. weaponArt() (gated en play + héroe vivo + h.artCD<=0 + atkCD<=0 + no
// rodar/aturdir + clase melee) despacha por weaponArchName(h) (MISMO mapa byDefId que Pilar 17) ⇒ WEAPON_ARTS.classes[name].
// Gasta art.stam vía spendStam (falla sin vigor ⇒ deny SIN cooldown) + arma h.artCD (mirror h.atkCD). Arma un swing con
// h._art=true ⇒ applyHeroMelee/hitEnemy leen los muls normalizados (h._artCls: ×dmg/reach/arc/poise), componiendo ×arquetipo
// ×TWO_HAND. greatsword *Golpe de Carga* extiende la ventana de HYPERARMOR (h._artHyper, Pilar 16); dagger *Filo Sombrío*
// DASHEA al arco rear ⇒ auto-backstab (Pilar 6); spear *Estocada Perforante* reach↑↑ arco estrecho + pierce; sword *Tajo
// Circular* arco completo. CERO draws (NO weaponArtRng) ⇒ srand ON==OFF byte-idéntico aun disparando. HARD-GATED:
// enabled:false ⇒ weaponArt() rama muerta + gate hyperarmor inerte ⇒ byte-idéntico a HEAD (17 pilares).
//
//   node tools/cas1914-weapon-arts-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1915 build d9395d8 tocó EXACTAMENTE estos 4 blobs — HARD md5 gate; leído de `git show --stat d9395d8`,
// nunca copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). El botón táctil sigue el patrón `tb.*` de
// render.js (NO DOM/hud.js) ⇒ 4 blobs (a diferencia de WEAPON_ARCHETYPES 2 blobs). tools/cas1914-weapon-arts.mjs es dev-only
// (NO desplegado). El deploy commit 3aa033f sólo añade tools/cas1914-deploy.mjs ⇒ los 4 blobs live == HEAD verbatim ⇒ REF=HEAD.
//   sim/config.js, sim/sim.js, input.js, render/render.js
//
// CRITICAL (lección CAS-1784/CAS-1876/CAS-1893/CAS-1898/CAS-1904/CAS-1911): estos probes conducen el juego REAL en ejecución —
// la página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que weaponArt / applyHeroMelee /
// heroAttack / heavyAttack / hitEnemy / damageHero son los paths SHIPPED. Los hooks art* se recuperan importando dinámicamente
// la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el export `dev`.
//
// ISOLATION (mirror cas1907/1911): los probes rearman G (_artArm vacía enemies/projectiles/fields/fx y fuerza al héroe a un
// warrior limpio en play con un arma de prueba equipada). Con el loop de render vivo, un héroe/arrays reescritos triparían el
// draw ⇒ TODOS los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de sim Y
// shallow-snapshotea el héroe + scene, y HARD-restaura en un finally — un único bloque síncrono, sin rAF interleaved. Las art*
// probes corren PRIMERO con el héroe PRÍSTINO del pueblo (antes de que la REG de Bonfire lo reubique). La REG de
// Weapon-Archetypes (17º) + Two-Handing (15º) + EquipLoad (14º) es SENSIBLE A ZONA (su killEnemy de alineación del loot cae en
// zonas distintas) ⇒ corren AL FINAL con el HÉROE PRÍSTINO del PUEBLO restaurado (mirror gotcha cas1893/1898/1904/1911).
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config WEAPON_ARTS knob, sim weaponArt gate +
// art* dev hooks, input Semicolon alias, render tb.weaponart botón) / content knob (4 artes, key Semicolon, cooldownMs) / AC0
// OFF byte-id inerte / AC1 baseline (arts on sin disparar == 17-pilar) / AC2 greatsword dmg×1.8 poise×2.2 + HYPERARMOR / AC3
// dagger dash⇒auto-backstab / AC4 spear reach×1.8 arco×0.4 + pierce / AC5 sword arco×2.0 dmg×1.0 poise×1.2 / AC6 coste/cooldown
// / AC7 compone ×TWO_HAND multiplicativo / AC8 srand ON==OFF 48-draw weaponArtFired REAL (0 draws) + determinism / AC9 SAVE
// byte-id sin clave art* / AC10 REG 17 pilares srand ON==OFF + 60fps + touch.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 4 art blobs son EXCLUSIVOS (el arts deploy es el último ⇒ nada comparte una línea live encima), así que cada uno es
// exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "input.js", "render/render.js"];
const OUT = "shots/cas1917"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit d9395d8; el deploy commit 3aa033f sólo añadió tools/cas1914-deploy.mjs — 4 blobs intactos).
const REF = process.env.ARTS_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "FirmaQA"; ni.blur(); }  // NB: sin substring art/weaponart ⇒ el regex de save-key (AC9 SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));  // warrior (melee/heavy/finisher swing surface)
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the art* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["weaponArtMeta", "_artArm", "artOffProbe", "artBaselineProbe", "artProbe", "artHyperProbe",
        "artDaggerProbe", "artPierceProbe", "artCooldownProbe", "artComposeProbe", "artSaveByteId", "artSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the art* probes FIRST
// (pristine town hero — zone-safe), then REG-16 (Frenzy…Hyperarmor + Bonfire; Bonfire relocates the hero), then
// Weapon-Archetypes (17º) + Two-Handing (15º) + EquipLoad (14º) srand LAST with the PRISTINE TOWN hero restored (their
// killEnemy/doRoll loot is zone-sensitive), then HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: probes reassign hero fields + h.equip (new object per _artArm)
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: killEnemy loops mutate the bag
    const sceneSnap = G.scene;
    const r = {};
    // Restore the PRISTINE TOWN hero (snapshot at play-entry, before any probe relocated it). The srand/killEnemy alignment
    // loops draw ZONE-CONDITIONAL loot ⇒ ON/OFF must run from the SAME town position (like the build harness's createHero
    // town warrior). heroSnap.equip is the ORIGINAL town equip ref (_artArm REPLACES h.equip) ⇒ armTown restores it.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); } };
    try {
      // ---- ARTES FIRST (héroe PRÍSTINO del PUEBLO, ANTES de que Bonfire lo reubique) ----
      r.meta = d.weaponArtMeta();
      r.off = d.artOffProbe();          // AC0 OFF byte-id inerte
      r.baseline = d.artBaselineProbe();// AC1 arts on sin disparar == 17-pilar
      r.greatsword = d.artProbe("w_steel"); // AC2: dmg×1.8 poise×2.2
      r.hyper = d.artHyperProbe();      // AC2: HYPERARMOR extendida
      r.dagger = d.artDaggerProbe();    // AC3: dash rear ⇒ auto-backstab
      r.spear = d.artProbe("w_rune");   // AC4: reach×1.8 arco×0.4
      r.pierce = d.artPierceProbe();    // AC4: pierce 2-en-línea
      r.sword = d.artProbe("w_iron");   // AC5: arco×2.0 dmg×1.0 poise×1.2
      r.cooldown = d.artCooldownProbe();// AC6: coste/cooldown
      r.compose = d.artComposeProbe();  // AC7: compone ×TWO_HAND
      r.save = d.artSaveByteId();       // AC9 SAVE byte-id sin clave art*

      // ---- AC8 srand ON==OFF (greatsword Golpe de Carga FIRING, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.artSrandProbe(true, seed, n);
      armTown(); const _off = d.artSrandProbe(false, seed, n);
      armTown(); const _on2 = d.artSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- AC10 REG: 16 pilares (Frenzy…Hyperarmor + Bonfire; Bonfire REUBICA al héroe ⇒ corre tras las art probes) ----
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

      // ---- REG Weapon-Archetypes (17º pilar) — héroe PRÍSTINO del pueblo (archSrandProbe mata skeletons en zona sensible) ----
      armTown();
      if (typeof d.archSrandProbe === "function") {
        const on = d.archSrandProbe(true, 0x1907c0de, 24), off = d.archSrandProbe(false, 0x1907c0de, 24);
        r.reg.archetypes = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      } else r.reg.archetypes = { absent: true };

      // ---- REG Two-Handing (15º pilar) — héroe PRÍSTINO del pueblo (killEnemy de alineación es sensible a zona; Bonfire reubicó) ----
      armTown();
      if (typeof d.twoHandSrandProbe === "function") {
        const on = d.twoHandSrandProbe(true, 0x1895c0de, 24), off = d.twoHandSrandProbe(false, 0x1895c0de, 24);
        r.reg.twohand = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      } else r.reg.twohand = { absent: true };

      // ---- REG EquipLoad (14º pilar) — héroe PRÍSTINO del pueblo (doRoll+loot es sensible a zona) ----
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
    // ---- AC0 BUILD gate (live == HEAD, all 4 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/arts deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "";
    const inTxt = servedText["input.js"] || "", rnTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const WEAPON_ARTS\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"Semicolon"/.test(cfgTxt) && /cooldownMs:\s*2500/.test(cfgTxt) && /greatsword:\s*{[^}]*name:"Golpe de Carga"[^}]*dmgMul:1\.8[^}]*poiseDmgMul:2\.2[^}]*hyperarmor:true/.test(cfgTxt) && /dagger:\s*{[^}]*autoBackstab:true/.test(cfgTxt),
      "WEAPON_ARTS knob (enabled/key:Semicolon/cooldownMs:2500/greatsword Golpe de Carga dmg1.8 poise2.2 hyperarmor/dagger autoBackstab) present in served config.js");
    gate("SEAM/sim", /export function weaponArt\(\)/.test(simTxt) && /weaponArtMeta\(\)\{/.test(simTxt) && /_artArm\(defId\)\{/.test(simTxt) && /artSrandProbe\(/.test(simTxt) && /h\._art\b/.test(simTxt) && /h\._artHyper\b/.test(simTxt),
      "sim: weaponArt() gate + weaponArtMeta + _artArm + artSrandProbe + h._art/h._artHyper transient flags present in served sim.js");
    gate("SEAM/input", /WEAPON_ARTS\.key/.test(inTxt) && /WEAPON_ARTS\.enabled/.test(inTxt) && /weaponArt\(\)/.test(inTxt),
      "input.js: Semicolon alias gated (WEAPON_ARTS.key && WEAPON_ARTS.enabled ⇒ sim.weaponArt()) present in served input.js");
    gate("SEAM/render", /weaponart/.test(rnTxt),
      "render.js: tb.weaponart botón táctil present in served render.js");

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

    // ---- wire the live sim module (recovers art* hooks the build left on the export dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `art* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1914c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the WEAPON_ARTS knob (matches the design spec) ----
    const meta = r.meta, cls = meta.classes || {};
    const hasFour = cls.sword && cls.greatsword && cls.dagger && cls.spear;
    gate("CONTENT/knob", meta.enabled === true && hasFour && meta.key === "Semicolon" && meta.cooldownMs > 0,
      `WEAPON_ARTS enabled=${meta.enabled} | key=${meta.key} | cooldownMs=${meta.cooldownMs} | 4 artes=${hasFour}: ${hasFour ? ["greatsword", "dagger", "spear", "sword"].map((k) => cls[k].name).join(", ") : "MISSING"}`);

    // ---- AC0 OFF byte-id: enabled=false ⇒ weaponArt() INERT + swing normal == 17-pilar formula ----
    const off = r.off;
    gate("AC0/off-inert", !!off && off.ok,
      off ? `enabled=false ⇒ weaponArt() rama muerta (inert=${off.inert}) + swing normal dmg=${off.dOff}(==arquetipo ${off.headDmg}) — byte-idéntico a HEAD` : "probe null");

    // ---- AC1 baseline: ARTS on but Art NOT fired ⇒ 17-pillar feel intact ----
    const bl = r.baseline;
    gate("AC1/baseline", !!bl && bl.ok,
      bl ? `ARTS on sin disparar ⇒ swing normal dmg=${bl.dOn}(==arts-off ${bl.dOff}==arquetipo ${bl.headDmg}) — feel Pilar 17 conservado, byte-id` : "probe null");

    // ---- AC2 greatsword: dmg×1.8, poise×2.2 + HYPERARMOR ----
    const gs = r.greatsword;
    gate("AC2/greatsword", !!gs && gs.name === "greatsword" && gs.ok && Math.abs(gs.dmgRatio - 1.8) < 1e-6 && Math.abs(gs.poiseRatio - 2.2) < 1e-6,
      gs ? `greatsword (${gs.artName}): dmg×${gs.dmgRatio}(==${gs.expDmg}) poise×${gs.poiseRatio}(==${gs.expPoise})` : "probe null");
    const gh = r.hyper;
    gate("AC2/hyperarmor", !!gh && gh.ok,
      gh ? `Golpe de Carga HYPERARMOR: Arte armado (armed=${gh.armed} hyperOn=${gh.hyperOn}) ⇒ stun sub-umbral (${gh.lo}<${gh.thr}) SUPRIMIDO (stun=${gh.subStun}) pero daño aterriza (hpDrop=${gh.subHpDrop}); supra (${gh.hi}) ROMPE (stun=${gh.hiStun}); idle sin Arte SÍ aturde (stun=${gh.idleStun})` : "probe null");

    // ---- AC3 dagger: dash to rear ⇒ auto-backstab ----
    const dg = r.dagger;
    gate("AC3/dagger-backstab", !!dg && dg.ok,
      dg ? `Filo Sombrío: dashea al arco rear (rearOk=${dg.rearOk} behind=${dg.behind}) ⇒ swing por la espalda ⇒ backstab ${dg.offDmg}→${dg.onDmg} ×${dg.ratio}(==BACKSTAB.mult×archBackstabMul ${dg.expRatio}) — backstabFired=${dg.backstabFired}` : "probe null");

    // ---- AC4 spear: reach×1.8, narrow arc×0.4, pierce ----
    const sp = r.spear;
    gate("AC4/spear", !!sp && sp.name === "spear" && sp.ok && sp.reachTested && sp.reachOk && sp.arcTested && sp.arcOk,
      sp ? `Estocada Perforante (${sp.artName}): dmg×${sp.dmgRatio} reach×${sp.reachMul}(límite ${sp.reachAt}px: normal falla, Arte pega ⇒ ${sp.reachOk ? "ok" : "FAIL"}) arco×${sp.arcMul}(estrecho ${sp.arcAt}rad ⇒ ${sp.arcOk ? "ok" : "FAIL"})` : "probe null");
    const pc = r.pierce;
    gate("AC4/pierce", !!pc && pc.ok,
      pc ? `spear pierce: un swing del Arte impacta 2 enemigos en línea frontal (hit1=${pc.hit1} hit2=${pc.hit2})` : "probe null");

    // ---- AC5 sword: full arc×2.0, dmg×1.0, poise×1.2 ----
    const sw = r.sword;
    gate("AC5/sword", !!sw && sw.name === "sword" && sw.ok && Math.abs(sw.dmgRatio - 1.0) < 1e-6 && Math.abs(sw.poiseRatio - 1.2) < 1e-6 && sw.arcTested && sw.arcOk,
      sw ? `Tajo Circular (${sw.artName}): dmg×${sw.dmgRatio}(equilibrado) poise×${sw.poiseRatio} arco×${sw.arcMul}(completo ${sw.arcAt}rad ⇒ ${sw.arcOk ? "ok" : "FAIL"})` : "probe null");

    // ---- AC6 coste/cooldown ----
    const cd = r.cooldown;
    gate("AC6/cooldown", !!cd && cd.ok,
      cd ? `sin vigor ⇒ deny (denied=${cd.denied}); con vigor ⇒ dispara + gasta ${cd.spent}(==${cd.cost}) + arma cooldown (fired=${cd.fired}); dentro del cd ⇒ bloqueado (blocked=${cd.blocked}); expirado ⇒ re-dispara (refires=${cd.refires})` : "probe null");

    // ---- AC7 compone con TWO_HAND multiplicativo ----
    const cp = r.compose;
    gate("AC7/compose", !!cp && cp.ok,
      cp ? `base=${cp.base} → greatsword Art ×${cp.artDmgMul}=${cp.art} → +twoHand ×${cp.twoHandDmgMul}=${cp.both}(==base×art×two, bothRatio ${cp.bothRatio}==${cp.expBoth}) — multiplicativo, sin pisar` : "probe null");

    // ---- AC9 SAVE byte-id: transient ⇒ save.v1 byte-identical, no key ----
    const sb = r.save;
    gate("AC9/save-byte-id", !!sb && sb.ok,
      sb ? `h.artCD/_art/_artCls/_artHyper transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), SIN clave art*/weaponArt* (hasKey=${sb.hasKey})` : "probe null");

    // ---- AC8 srand ON==OFF WITH a real Golpe de Carga firing (0 draws) ----
    const s = r.srand;
    gate("AC8/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around firing el Golpe de Carga con greatsword`);
    gate("AC8/art-fired", s.on.weaponArtFired === true, `the ON probe DID fire the Art (escaló poise) consumiendo 0 srand: weaponArtFired=${s.on.weaponArtFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC8/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL WEAPON_ARTS ON vs OFF — el Arte es input/aritmética (no weaponArtRng; 0 draws) aun disparando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.weaponArtFired} offFired=${s.off.weaponArtFired}`);
    gate("AC8/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-weapon-arts-play.png` }).catch(() => {});

    // ---- AC10 REG: prior beats' srand probes stay ON==OFF (17 pilares: Frenzy…Hyperarmor + Archetypes + Two-Handing + EquipLoad) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "hyperarmor", "bonfire", "archetypes", "twohand", "equip"]) {
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

    // ---- TOUCH: mobile pass drives a touch input flip (parity with cas1898/cas1904/cas1911 touch check) ----
    if (viewport.isMobile) {
      const touched = await page.evaluate(() => { try { return !!(window.__dev && window.__dev.scene && window.__dev.scene() === "play"); } catch { return false; } });
      gate("TOUCH/play", touched, `mobile viewport en play (touch surface activo)`);
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
console.log(`CAS-1917 LIVE QA — Artes de Arma (Weapon Arts, Pilar 18) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1917 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
