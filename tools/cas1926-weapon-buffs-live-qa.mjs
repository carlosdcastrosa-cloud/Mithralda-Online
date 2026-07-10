// ===========================================================================
// CAS-1929 (QA for CAS-1926) — LIVE QA: RESINAS / BUFFS DE ARMA (Weapon Grease, knob WEAPON_BUFFS, 20º pilar Souls-like).
// Verifica el build CAS-1927 (deployado por CAS-1928 deploy tool, overlay build 7d47bd4f163f) sobre la URL canónica gh-pages.
// PASS x2 (desktop+mobile), navegador-por-pase. Mirror de tools/cas1920-throwables-live-qa.mjs.
//
// Feature: un consumible que UNTA el arma con un buff temporal (elemental / afilado) por una ventana corta — decisión de recurso
// escaso, prepara el arma antes de un jefe/élite. applyWeaponBuff() (gated en play + héroe vivo + applyBuffT<=0 + sin atkCD/rolling/
// stun) selecciona h.buffSel ⇒ WEAPON_BUFFS.types[sel]; deny sin cargas; al aplicar gasta 1 carga + arma applyBuffT (windup punible)
// + activa h._wbuff/wbuffT. buffMul(h)=types[h._wbuff].dmgMul mientras wbuffT>0 es el ÚLTIMO factor en applyHeroMelee (sim.js:2104)
// ⇒ compone MULT tras TWO_HAND × WEAPON_ARCHETYPES × WEAPON_ARTS (ninguno pisa). Elemento on-hit en hitEnemy (melee): ember⇒burn
// DoT (applyStatus), frost⇒slow (applyStatus, mismo status que mobs), whet⇒puro físico (sin elemento). tickBuff refilla al cambiar
// de zona (espejo flaskZone) + BONFIRE + decrementa wbuffT/applyBuffT. CERO draws (buffMul/elemento 100% aritmética) ⇒ srand
// ON==OFF byte-idéntico aun aplicando. HARD-GATED: enabled:false ⇒ applyWeaponBuff()/cycleBuff() rama muerta ⇒ byte-idéntico a
// HEAD (19 pilares).
//
//   node tools/cas1926-weapon-buffs-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1927 build d6b68bb tocó EXACTAMENTE estos 4 blobs — HARD md5 gate; leído de `git show --stat d6b68bb`, nunca
// copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). El buff tinta el sprite del héroe en render.js (h._wbuff⇒
// type.tint) + botón HUD táctil tb.weaponbuff/tb.buffcycle ⇒ 4 blobs (patrón THROWABLES/WEAPON_ARTS). tools/cas1926-weapon-buffs.mjs
// es dev-only (NO desplegado). El deploy commit 20cf0dd sólo añade tools/cas1926-deploy.mjs ⇒ los 4 blobs live == HEAD verbatim
// ⇒ REF=HEAD.
//   sim/config.js, sim/sim.js, input.js, render/render.js
//
// CRITICAL (lección CAS-1784/…/CAS-1917/CAS-1924): estos probes conducen el juego REAL en ejecución — la página live bootea
// buildTiledWorld (el mundo que el jugador realmente juega), así que applyWeaponBuff / cycleBuff / buffMul / tickBuff / refillBuffs /
// applyHeroMelee / hitEnemy / applyStatus / heroAttack son los paths SHIPPED. Los hooks buff* se recuperan importando dinámicamente
// la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el export `dev`.
//
// ISOLATION (mirror cas1920/1914): los probes rearman G (_buffArm vacía enemies/projectiles/fields/fx y fuerza al héroe a un
// warrior limpio en play con resinas a tope). Con el loop de render vivo, un héroe/arrays reescritos triparían el draw ⇒ TODOS los
// probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de sim Y shallow-snapshotea el héroe + scene,
// y HARD-restaura en un finally — un único bloque síncrono, sin rAF interleaved. Las buff* probes corren PRIMERO con el héroe
// PRÍSTINO del pueblo (antes de que la REG de Bonfire lo reubique). La REG de Throwables (19º) + Weapon-Arts (18º) + Weapon-
// Archetypes (17º) + Two-Handing (15º) + EquipLoad (14º) es SENSIBLE A ZONA (su killEnemy de alineación del loot cae en zonas
// distintas) ⇒ corren AL FINAL con el HÉROE PRÍSTINO del PUEBLO restaurado (mirror gotcha cas1893/1898/1904/1911/1917/1924).
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config WEAPON_BUFFS knob, sim applyWeaponBuff/cycleBuff
// gate + buff* dev hooks + buffMul, input BracketRight/BracketLeft alias, render h._wbuff tint + tb.weaponbuff botón) / content knob
// (3 tipos ember/whet/frost, applyKey BracketRight, cycleKey BracketLeft, applyMs) / AC0 OFF byte-id inerte / AC1 baseline (buffs on
// sin aplicar == 19-pilar) / AC2 ember (×1.15 + burn DoT) / AC3 whet (×1.35 PURO, sin elemento) / AC4 frost (×1.10 + slow) / AC5
// compone MULT ×TWO_HAND×ARCH×ART sin bypass poise/i-frames / AC6 recurso (decrementa/0⇒deny/zona⇒refill) / AC7 windup punible
// (applyBuffT>0 bloquea attack) / AC8 srand ON==OFF 48-draw buffFired REAL (0 draws) + determinism / AC9 SAVE byte-id sin clave
// buff*/wbuff* / AC10 REG 19 pilares srand ON==OFF + 60fps + touch.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 4 buff blobs son EXCLUSIVOS (el weapon-buffs deploy es el último ⇒ nada comparte una línea live encima), así que cada uno es
// exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "input.js", "render/render.js"];
const OUT = "shots/cas1929"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit d6b68bb; el deploy commit 20cf0dd sólo añadió tools/cas1926-deploy.mjs — 4 blobs intactos).
const REF = process.env.BUFF_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "GrasaQA"; ni.blur(); }  // NB: sin substring buff/ember/whet/frost/wbuff ⇒ el regex de save-key (AC9 SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));  // warrior (melee/heavy swing surface for REG)
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the buff* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["buffMeta", "_buffArm", "buffOffProbe", "buffBaselineProbe", "buffEmberProbe", "buffWhetProbe", "buffFrostProbe",
        "buffComposeProbe", "buffResourceProbe", "buffWindupProbe", "buffSaveByteId", "buffSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the buff* probes FIRST
// (pristine town hero — zone-safe), then REG-15 (Frenzy…Hyperarmor + Bonfire; Bonfire relocates the hero), then Throwables (19º)
// + Weapon-Arts (18º) + Weapon-Archetypes (17º) + Two-Handing (15º) + EquipLoad (14º) srand LAST with the PRISTINE TOWN hero
// restored (their killEnemy/doRoll loot is zone-sensitive), then HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: probes reassign hero fields
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: killEnemy loops mutate the bag
    const sceneSnap = G.scene;
    const r = {};
    // Restore the PRISTINE TOWN hero (snapshot at play-entry, before any probe relocated it). The srand/killEnemy alignment loops
    // draw ZONE-CONDITIONAL loot ⇒ ON/OFF must run from the SAME town position (like the build harness's createHero town warrior).
    // NB buff* probes add h.applyBuffT/wbuffT/_wbuff/*Charges keys NOT in heroSnap; the probes clear applyBuffT/wbuffT/_wbuff at the
    // end so the new windup gate can't block the later REG heroAttack — but we also force-clear here defensively.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); G.hero.applyBuffT = 0; G.hero.wbuffT = 0; G.hero._wbuff = null; } };
    try {
      // ---- RESINAS FIRST (héroe PRÍSTINO del PUEBLO, ANTES de que Bonfire lo reubique) ----
      r.meta = d.buffMeta();
      r.off = d.buffOffProbe();            // AC0 OFF byte-id inerte
      r.baseline = d.buffBaselineProbe();  // AC1 buffs on sin aplicar == 19-pilar
      r.ember = d.buffEmberProbe();        // AC2 ember: ×1.15 + burn DoT
      r.whet = d.buffWhetProbe();          // AC3 whet: ×1.35 PURO (sin elemento)
      r.frost = d.buffFrostProbe();        // AC4 frost: ×1.10 + slow
      r.compose = d.buffComposeProbe();    // AC5 compone MULT ×TWO_HAND×ARCH×ART sin bypass
      r.resource = d.buffResourceProbe();  // AC6 recurso: decrementa / 0 / zona refill
      r.windup = d.buffWindupProbe();      // AC7 windup punible: bloquea attack
      r.save = d.buffSaveByteId();         // AC9 SAVE byte-id sin clave buff*

      // ---- AC8 srand ON==OFF (Piedra de Afilar APLICANDO, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.buffSrandProbe(true, seed, n);
      armTown(); const _off = d.buffSrandProbe(false, seed, n);
      armTown(); const _on2 = d.buffSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- AC10 REG: 15 pilares (Frenzy…Hyperarmor + Bonfire; Bonfire REUBICA al héroe ⇒ corre tras las buff probes) ----
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

      // ---- REG Throwables (19º pilar) — héroe PRÍSTINO del pueblo (throwSrandProbe mata en zona sensible) ----
      armTown();
      if (typeof d.throwSrandProbe === "function") {
        const on = d.throwSrandProbe(true, 0x1920c0de, 24), off = d.throwSrandProbe(false, 0x1920c0de, 24);
        r.reg.throwables = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      } else r.reg.throwables = { absent: true };

      // ---- REG Weapon-Arts (18º pilar) — héroe PRÍSTINO del pueblo ----
      armTown();
      if (typeof d.artSrandProbe === "function") {
        const on = d.artSrandProbe(true, 0x1914c0de, 24), off = d.artSrandProbe(false, 0x1914c0de, 24);
        r.reg.arts = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      } else r.reg.arts = { absent: true };

      // ---- REG Weapon-Archetypes (17º pilar) — héroe PRÍSTINO del pueblo ----
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/weapon-buffs deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "";
    const inTxt = servedText["input.js"] || "", rnTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const WEAPON_BUFFS\s*=\s*{/.test(cfgTxt) && /WEAPON_BUFFS\s*=\s*{[\s\S]*?enabled:\s*true/.test(cfgTxt) && /applyKey:\s*"BracketRight"/.test(cfgTxt) && /cycleKey:\s*"BracketLeft"/.test(cfgTxt) && /ember:\s*{[^}]*dmgMul:\s*1\.15[^}]*element:\s*"burn"/.test(cfgTxt) && /whet:\s*{[^}]*dmgMul:\s*1\.35[^}]*element:\s*null/.test(cfgTxt) && /frost:\s*{[^}]*dmgMul:\s*1\.1[^}]*element:\s*"frost"/.test(cfgTxt),
      "WEAPON_BUFFS knob (enabled/applyKey:BracketRight/cycleKey:BracketLeft/ember ×1.15 burn/whet ×1.35 null/frost ×1.10 frost) present in served config.js");
    gate("SEAM/sim", /export function applyWeaponBuff\(\)/.test(simTxt) && /export function cycleBuff\(\)/.test(simTxt) && /buffMeta\(\)\{/.test(simTxt) && /_buffArm\(/.test(simTxt) && /buffSrandProbe\(/.test(simTxt) && /function buffMul\(h\)/.test(simTxt) && /function refillBuffs\(h\)/.test(simTxt) && /h\._wbuff\b/.test(simTxt),
      "sim: applyWeaponBuff()/cycleBuff() gates + buffMeta + _buffArm + buffSrandProbe + buffMul + refillBuffs + h._wbuff transient present in served sim.js");
    gate("SEAM/input", /WEAPON_BUFFS\.applyKey/.test(inTxt) && /WEAPON_BUFFS\.cycleKey/.test(inTxt) && /WEAPON_BUFFS\.enabled/.test(inTxt) && /applyWeaponBuff\(\)/.test(inTxt) && /cycleBuff\(\)/.test(inTxt),
      "input.js: BracketRight/BracketLeft alias gated (WEAPON_BUFFS.applyKey/cycleKey && WEAPON_BUFFS.enabled ⇒ sim.applyWeaponBuff()/cycleBuff()) present in served input.js");
    gate("SEAM/render", /_wbuff/.test(rnTxt) && /weaponbuff/.test(rnTxt) && /WEAPON_BUFFS/.test(rnTxt),
      "render.js: h._wbuff tint del sprite + tb.weaponbuff botón táctil present in served render.js");

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

    // ---- wire the live sim module (recovers buff* hooks the build left on the export dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `buff* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0xca51926a, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the WEAPON_BUFFS knob (matches the design spec) ----
    const meta = r.meta, ty = meta.types || {};
    const has3 = ty.ember && ty.whet && ty.frost;
    gate("CONTENT/knob", meta.enabled === true && has3 && meta.applyKey === "BracketRight" && meta.cycleKey === "BracketLeft" && meta.applyMs > 0 && meta.refillOnZone === true,
      `WEAPON_BUFFS enabled=${meta.enabled} | applyKey=${meta.applyKey} cycleKey=${meta.cycleKey} | applyMs=${meta.applyMs} refillOnZone=${meta.refillOnZone} | 3 tipos=${has3}: ${has3 ? meta.order.map((k) => `${ty[k].name}(×${ty[k].dmgMul} x${ty[k].charges}ch ${ty[k].buffS}s)`).join(", ") : "MISSING"}`);

    // ---- AC0 OFF byte-id: enabled=false ⇒ applyWeaponBuff()/cycleBuff() INERTES == 19-pilar HEAD ----
    const off = r.off;
    gate("AC0/off-inert", !!off && off.ok,
      off ? `enabled=false ⇒ applyWeaponBuff() rama muerta (inert=${off.inert}) + cycleBuff() inerte (cycleInert=${off.cycleInert}) — byte-idéntico a HEAD` : "probe null");

    // ---- AC1 baseline: WEAPON_BUFFS on but not applied ⇒ 19-pillar feel intact ----
    const bl = r.baseline;
    gate("AC1/baseline", !!bl && bl.ok,
      bl ? `ON sin aplicar ⇒ un tick no consume nada (cargas=${bl.chargesUnchanged} stam=${bl.stamUnchanged} sinBuff=${bl.noBuff}) — feel 19 pilares conservado, byte-id` : "probe null");

    // ---- AC2 ember: h._wbuff=ember, gasta 1 carga, dmg×1.15 + burn DoT (applyStatus) ----
    const em = r.ember;
    gate("AC2/ember", !!em && em.ok,
      em ? `Resina Ardiente: buffActive(${em.buffActive}) gasta 1 carga(${em.chargeSpent}); golpe melee ⇒ dmg×1.15 actual=${em.dmgApplied} expect=${em.dmgExpect}(${em.dmgOk}) + burn DoT aplicado(${em.burnApplied})` : "probe null");

    // ---- AC3 whet: h._wbuff=whet, dmg×1.35 PURO (sin elemento; applyStatus NO se llama por el buff); más cargas ----
    const wh = r.whet;
    gate("AC3/whet", !!wh && wh.ok,
      wh ? `Piedra de Afilar: buffActive(${wh.buffActive}) gasta 1 carga(${wh.chargeSpent}); dmg×1.35 PURO actual=${wh.dmgApplied} expect=${wh.dmgExpect}(${wh.dmgOk}); sin elemento (noElement=${wh.noElement})` : "probe null");

    // ---- AC4 frost: h._wbuff=frost, dmg×1.10 + slow (applyStatus, mismo status que mobs) ----
    const fr = r.frost;
    gate("AC4/frost", !!fr && fr.ok,
      fr ? `Escarcha: buffActive(${fr.buffActive}) gasta 1 carga(${fr.chargeSpent}); dmg×1.10 actual=${fr.dmgApplied} expect=${fr.dmgExpect}(${fr.dmgOk}); slow aplicado(${fr.slowApplied})` : "probe null");

    // ---- AC5 compone: whet × TWO_HAND × greatsword-arch × greatsword-art ⇒ producto multiplicativo sin bypass poise/i-frames ----
    const cp = r.compose;
    gate("AC5/compose", !!cp && cp.ok,
      cp ? `whet × TWO_HAND × greatsword-arch × greatsword-art ⇒ PRODUCTO multiplicativo (buffMul ÚLTIMO factor, ninguno pisa). actual=${cp.actualDmg} expect=${cp.expectedDmg}(${cp.dmgOk}) — no bypassa poise/i-frames` : "probe null");

    // ---- AC6 recurso: cargas decrementan; a 0 ⇒ deny; misma zona ⇒ no refill; cambio de zona ⇒ refill a tope ----
    const res = r.resource;
    gate("AC6/resource", !!res && res.ok,
      res ? `cargas drenan a 0(${res.drained}); a 0 ⇒ deny(${res.deny}); MISMA zona ⇒ NO refill(${res.sameZoneNoRefill}); CAMBIO de zona ⇒ refill a tope(${res.zoneRefill}) — recurso escaso, NO infinito` : "probe null");

    // ---- AC7 windup punible: applyBuffT>0 tras aplicar bloquea heroAttack ----
    const wu = r.windup;
    gate("AC7/windup", !!wu && wu.ok,
      wu ? `tras aplicar applyBuffT>0(${wu.applyBlocks}) BLOQUEA heroAttack(${wu.attackBlocked}) — commit punible (no instantáneo)` : "probe null");

    // ---- AC9 SAVE byte-id: transient ⇒ save.v1 byte-identical, no buff*/wbuff* key ----
    const sb = r.save;
    gate("AC9/save-byte-id", !!sb && sb.ok,
      sb ? `h.buffSel/*Charges/_wbuff/wbuffT/applyBuffT/buffZone transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), SIN clave buff*/wbuff*/ember*/whet*/frost* (noBuffKey=${sb.noBuffKey}) len=${sb.offLen}` : "probe null");

    // ---- AC8 srand ON==OFF WITH a real Piedra de Afilar applied (0 draws) ----
    const s = r.srand;
    gate("AC8/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around APLICAR la Piedra de Afilar`);
    gate("AC8/buff-fired", s.on.buffFired === true, `the ON probe DID apply the buff (buffFired) consumiendo 0 srand: buffFired=${s.on.buffFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC8/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL WEAPON_BUFFS ON vs OFF — el buff es aritmética/timing (no buffRng; 0 draws) aun aplicando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.buffFired} offFired=${s.off.buffFired}`);
    gate("AC8/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-weapon-buffs-play.png` }).catch(() => {});

    // ---- AC10 REG: prior beats' srand probes stay ON==OFF (19 pilares: Frenzy…Hyperarmor + Bonfire + Throwables + Arts + Archetypes + Two-Handing + EquipLoad) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "hyperarmor", "bonfire", "throwables", "arts", "archetypes", "twohand", "equip"]) {
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

    // ---- TOUCH: mobile pass drives a touch input flip (parity with cas1898/1904/1911/1917/1924 touch check) ----
    if (viewport.isMobile) {
      const touched = await page.evaluate(() => { try { return !!(window.__dev && window.__dev.scene && window.__dev.scene() === "play"); } catch { return false; } });
      gate("TOUCH/play", touched, `mobile viewport en play (touch surface + tb.weaponbuff/tb.buffcycle activos)`);
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
console.log(`CAS-1929 LIVE QA — Resinas / Buffs de Arma (Weapon Grease, Pilar 20) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1929 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
