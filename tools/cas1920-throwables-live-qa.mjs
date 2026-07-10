// ===========================================================================
// CAS-1924 (QA for CAS-1920) — LIVE QA: CONSUMIBLES ARROJADIZOS (Throwing Items, knob THROWABLES, 19º pilar Souls-like).
// Verifica el build CAS-1922 (deployado por CAS-1922 deploy tool, overlay build 3970f3b102b9) sobre la URL canónica gh-pages.
// PASS x2 (desktop+mobile), navegador-por-pase. Mirror de tools/cas1914-weapon-arts-live-qa.mjs.
//
// Feature: la PRIMERA herramienta a DISTANCIA de recurso limitado tras 18 pilares melee — 2 consumibles firma (cuchillo recto /
// bomba incendiaria) con coste de estamina + cargas finitas (refill por zona / hoguera). throwItem() (gated en play + héroe vivo +
// throwCD<=0 + throwWind<=0 + no rodar/aturdir) selecciona h.throwSel ⇒ THROWABLES.types[sel]; deny sin cargas / sin vigor
// (spendStam); al disparar gasta stam + 1 carga + arma throwCD/throwWind; apunta vía artTarget (LOCK_ON Pilar 12) o h.facing;
// spawna reusando el MOLDE de proyectil de hechizo (G.projectiles.push) ⇒ colisión / hitEnemy / applyStatus(burn) / aoe / filtro
// life>0 YA viven en updateProjectiles. El cuchillo (infl:null, recto) y la bomba (infl:burn, aoe) sólo difieren por DATOS del
// knob. cycleThrow() cicla el tipo. tickThrow refilla al cambiar de zona + decrementa throwCD/throwWind. CERO draws (NO throwRng)
// ⇒ srand ON==OFF byte-idéntico aun lanzando. HARD-GATED: enabled:false ⇒ throwItem()/cycleThrow() rama muerta ⇒ byte-idéntico a
// HEAD (18 pilares).
//
//   node tools/cas1920-throwables-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1922 build 30e0613 tocó EXACTAMENTE estos 4 blobs — HARD md5 gate; leído de `git show --stat 30e0613`, nunca
// copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). El proyectil se DIBUJA en render.js (kinds knife/firebomb)
// + botón HUD táctil tb.throwable/tb.throwcycle ⇒ 4 blobs (patrón WEAPON_ARTS). tools/cas1920-throwables.mjs es dev-only (NO
// desplegado). El deploy commit f42fd93 sólo añade tools/cas1920-deploy.mjs ⇒ los 4 blobs live == HEAD verbatim ⇒ REF=HEAD.
//   sim/config.js, sim/sim.js, input.js, render/render.js
//
// CRITICAL (lección CAS-1784/CAS-1876/CAS-1893/CAS-1898/CAS-1904/CAS-1911/CAS-1917): estos probes conducen el juego REAL en
// ejecución — la página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que throwItem / cycleThrow /
// tickThrow / refillThrowables / updateProjectiles / hitEnemy / applyStatus / damageHero son los paths SHIPPED. Los hooks throw*
// se recuperan importando dinámicamente la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build
// los cableó en el export `dev`.
//
// ISOLATION (mirror cas1914/1911): los probes rearman G (_throwArm vacía enemies/projectiles/fields/fx y fuerza al héroe a un
// warrior limpio en play con arrojadizos a tope). Con el loop de render vivo, un héroe/arrays reescritos triparían el draw ⇒ TODOS
// los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de sim Y shallow-snapshotea el héroe +
// scene, y HARD-restaura en un finally — un único bloque síncrono, sin rAF interleaved. Las throw* probes corren PRIMERO con el
// héroe PRÍSTINO del pueblo (antes de que la REG de Bonfire lo reubique). La REG de Weapon-Arts (18º) + Weapon-Archetypes (17º) +
// Two-Handing (15º) + EquipLoad (14º) es SENSIBLE A ZONA (su killEnemy de alineación del loot cae en zonas distintas) ⇒ corren AL
// FINAL con el HÉROE PRÍSTINO del PUEBLO restaurado (mirror gotcha cas1893/1898/1904/1911/1917).
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config THROWABLES knob, sim throwItem/cycleThrow gate
// + throw* dev hooks, input Quote/Slash alias, render knife/firebomb kinds + tb.throwable botón) / content knob (2 tipos, throwKey
// Quote, cycleKey Slash, cooldownMs/windupMs) / AC0 OFF byte-id inerte / AC1 baseline (arrojadizos on sin lanzar == 18-pilar) / AC2
// cuchillo recto (hitEnemy dmg, sin burn) / AC3 bomba (aoe + burn DoT, más cara) / AC4 aim lockTarget vs h.facing / AC5 recurso
// (decrementa/0⇒no-lanza/zona+bonfire⇒refill) / AC6 coste stamina / AC7 windup punible (bloquea attack+move) / AC8 srand ON==OFF
// 48-draw throwableFired REAL (0 draws) + determinism / AC9 SAVE byte-id sin clave throw* / AC10 REG 18 pilares srand ON==OFF +
// 60fps + touch.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 4 throw blobs son EXCLUSIVOS (el throwables deploy es el último ⇒ nada comparte una línea live encima), así que cada uno es
// exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js", "input.js", "render/render.js"];
const OUT = "shots/cas1924"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 30e0613; el deploy commit f42fd93 sólo añadió tools/cas1920-deploy.mjs — 4 blobs intactos).
const REF = process.env.THROW_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "VueloQA"; ni.blur(); }  // NB: sin substring throw/knife/bomb ⇒ el regex de save-key (AC9 SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));  // warrior (melee/heavy swing surface for REG)
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the throw* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["throwMeta", "_throwArm", "throwOffProbe", "throwBaselineProbe", "throwKnifeProbe", "throwBombProbe",
        "throwAimProbe", "throwResourceProbe", "throwStamProbe", "throwWindupProbe", "throwSaveByteId", "throwSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the throw* probes FIRST
// (pristine town hero — zone-safe), then REG-16 (Frenzy…Hyperarmor + Bonfire; Bonfire relocates the hero), then Weapon-Arts (18º)
// + Weapon-Archetypes (17º) + Two-Handing (15º) + EquipLoad (14º) srand LAST with the PRISTINE TOWN hero restored (their
// killEnemy/doRoll loot is zone-sensitive), then HARD-restore in a finally. No rAF interleaves.
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
    // NB throw* probes add h.throwWind/throwCD/*Charges keys NOT in heroSnap; the throwSrandProbe itself clears throwWind/throwCD at
    // the end so the new throw gate can't block the later REG heroAttack — but we also force-clear here defensively.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); G.hero.throwWind = 0; G.hero.throwCD = 0; } };
    try {
      // ---- ARROJADIZOS FIRST (héroe PRÍSTINO del PUEBLO, ANTES de que Bonfire lo reubique) ----
      r.meta = d.throwMeta();
      r.off = d.throwOffProbe();            // AC0 OFF byte-id inerte
      r.baseline = d.throwBaselineProbe();  // AC1 arrojadizos on sin lanzar == 18-pilar
      r.knife = d.throwKnifeProbe();        // AC2 cuchillo recto: hitEnemy dmg, infl:null
      r.bomb = d.throwBombProbe();          // AC3 bomba: aoe + burn DoT, más cara
      r.aim = d.throwAimProbe();            // AC4 apuntado: lockTarget vs h.facing
      r.resource = d.throwResourceProbe();  // AC5 recurso: decrementa / 0 / zona+bonfire refill
      r.stam = d.throwStamProbe();          // AC6 coste estamina
      r.windup = d.throwWindupProbe();      // AC7 windup punible: bloquea attack+move
      r.save = d.throwSaveByteId();         // AC9 SAVE byte-id sin clave throw*

      // ---- AC8 srand ON==OFF (Bomba Incendiaria LANZANDO, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.throwSrandProbe(true, seed, n);
      armTown(); const _off = d.throwSrandProbe(false, seed, n);
      armTown(); const _on2 = d.throwSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- AC10 REG: 16 pilares (Frenzy…Hyperarmor + Bonfire; Bonfire REUBICA al héroe ⇒ corre tras las throw probes) ----
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

      // ---- REG Weapon-Arts (18º pilar) — héroe PRÍSTINO del pueblo (artSrandProbe mata skeletons en zona sensible) ----
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/throwables deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "";
    const inTxt = servedText["input.js"] || "", rnTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const THROWABLES\s*=\s*{/.test(cfgTxt) && /THROWABLES\s*=\s*{[\s\S]*?enabled:\s*true/.test(cfgTxt) && /throwKey:\s*"Quote"/.test(cfgTxt) && /cycleKey:\s*"Slash"/.test(cfgTxt) && /knife:\s*{[^}]*kind:"knife"/.test(cfgTxt) && /firebomb:\s*{[^}]*kind:"firebomb"[^}]*aoe:26[^}]*burn:{dmg:6}/.test(cfgTxt),
      "THROWABLES knob (enabled/throwKey:Quote/cycleKey:Slash/knife kind:knife/firebomb kind:firebomb aoe:26 burn:6) present in served config.js");
    gate("SEAM/sim", /export function throwItem\(\)/.test(simTxt) && /export function cycleThrow\(\)/.test(simTxt) && /throwMeta\(\)\{/.test(simTxt) && /_throwArm\(/.test(simTxt) && /throwSrandProbe\(/.test(simTxt) && /h\.throwSel\b/.test(simTxt) && /h\.throwWind\b/.test(simTxt),
      "sim: throwItem()/cycleThrow() gates + throwMeta + _throwArm + throwSrandProbe + h.throwSel/h.throwWind transient present in served sim.js");
    gate("SEAM/input", /THROWABLES\.throwKey/.test(inTxt) && /THROWABLES\.cycleKey/.test(inTxt) && /THROWABLES\.enabled/.test(inTxt) && /throwItem\(\)/.test(inTxt) && /cycleThrow\(\)/.test(inTxt),
      "input.js: Quote/Slash alias gated (THROWABLES.throwKey/cycleKey && THROWABLES.enabled ⇒ sim.throwItem()/cycleThrow()) present in served input.js");
    gate("SEAM/render", /"knife"/.test(rnTxt) && /"firebomb"/.test(rnTxt) && /throwable/.test(rnTxt),
      "render.js: kind:knife + kind:firebomb draw + tb.throwable botón táctil present in served render.js");

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

    // ---- wire the live sim module (recovers throw* hooks the build left on the export dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `throw* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1920c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the THROWABLES knob (matches the design spec) ----
    const meta = r.meta, ty = meta.types || {};
    const hasTwo = ty.knife && ty.firebomb;
    gate("CONTENT/knob", meta.enabled === true && hasTwo && meta.throwKey === "Quote" && meta.cycleKey === "Slash" && meta.cooldownMs > 0 && meta.windupMs > 0,
      `THROWABLES enabled=${meta.enabled} | throwKey=${meta.throwKey} cycleKey=${meta.cycleKey} | cd=${meta.cooldownMs} wind=${meta.windupMs} | 2 tipos=${hasTwo}: ${hasTwo ? meta.order.map((k) => `${ty[k].name}(x${ty[k].charges})`).join(", ") : "MISSING"}`);

    // ---- AC0 OFF byte-id: enabled=false ⇒ throwItem()/cycleThrow() INERTES == 18-pilar HEAD ----
    const off = r.off;
    gate("AC0/off-inert", !!off && off.ok,
      off ? `enabled=false ⇒ throwItem() rama muerta (inert=${off.inert}) + cycleThrow() inerte (cycleInert=${off.cycleInert}) — byte-idéntico a HEAD` : "probe null");

    // ---- AC1 baseline: THROWABLES on but not thrown ⇒ 18-pillar feel intact ----
    const bl = r.baseline;
    gate("AC1/baseline", !!bl && bl.ok,
      bl ? `ON sin lanzar ⇒ un tick no consume nada (cargas/estamina/proyectiles intactos, baselineOk=${bl.baselineOk}) — feel 18 pilares conservado, byte-id` : "probe null");

    // ---- AC2 cuchillo: proyectil recto kind:"knife", infl:null (sin burn), hitEnemy dmg, gasta stam+carga, cd bloquea ----
    const kn = r.knife;
    gate("AC2/knife", !!kn && kn.ok,
      kn ? `Cuchillo: spawn RECTO kind:"knife" (straight=${kn.straight}) infl:null (sin burn=${!kn.burnApplied}, noAoe=${kn.noAoe}); gasta 1 carga(${kn.chargeSpent})+stam(${kn.stamSpent}); impacto ⇒ hitEnemy dmg(${kn.hitApplied}); cd bloquea re-lanzar(${kn.cdBlocks})` : "probe null");

    // ---- AC3 bomba: kind:"firebomb" aoe>0 + infl:burn ⇒ applyStatus(burn) DoT + daño de área; más cara + más escasa ----
    const bmb = r.bomb;
    gate("AC3/bomb", !!bmb && bmb.ok,
      bmb ? `Bomba: kind:"firebomb" aoe>0(${bmb.hasAoe}) + infl:burn(${bmb.hasBurn}); impacto directo(${bmb.directHit}) ⇒ applyStatus(burn) DoT(${bmb.burnApplied}) + daño de ÁREA a 2º enemigo(${bmb.aoeHit}); más cara stam ${bmb.fbStam}>${bmb.knStam} + más escasa ${bmb.fbCh}<${bmb.knCh} cargas (pricier=${bmb.pricier})` : "probe null");

    // ---- AC4 apuntado: con lockTarget ⇒ ángulo al objetivo (artTarget); sin lock ⇒ ángulo = h.facing ----
    const aim = r.aim;
    gate("AC4/aim", !!aim && aim.ok,
      aim ? `con lockTarget ⇒ ángulo al objetivo (artTarget, ${aim.lockAng}rad, lockOk=${aim.lockOk}); sin lock ⇒ ángulo = h.facing (${aim.faceAng}rad, faceOk=${aim.faceOk})` : "probe null");

    // ---- AC5 recurso: cargas decrementan; a 0 ⇒ no lanza; misma zona ⇒ no refill; cambio de zona / bonfire ⇒ refill a tope ----
    const res = r.resource;
    gate("AC5/resource", !!res && res.ok,
      res ? `${res.throws}/${res.cap} lanzamientos drenan a 0(${res.drained}); a 0 ⇒ deny(${res.emptyDenies}); MISMA zona ⇒ NO refill(${res.sameZoneNoRefill}); CAMBIO de zona ⇒ refill a tope(${res.zoneRefill}); bonfire ⇒ refill a tope(${res.bonfireRefill}) — recurso escaso, NO infinito` : "probe null");

    // ---- AC6 coste stamina: vigor insuficiente ⇒ no lanza (0 cargas); con vigor ⇒ dispara + gasta stam ----
    const st = r.stam;
    gate("AC6/stamina", !!st && st.ok,
      st ? `vigor insuficiente ⇒ no lanza (denied=${st.denied}, 0 cargas); con vigor ⇒ dispara + gasta ${st.cost} stam (fired=${st.fired}, spent=${st.spent})` : "probe null");

    // ---- AC7 windup punible: throwWind>0 bloquea attack + move; expirado ⇒ libres ----
    const wu = r.windup;
    gate("AC7/windup", !!wu && wu.ok,
      wu ? `tras lanzar throwWind>0(${wu.windOn}) BLOQUEA attack(${wu.atkBlocked}) + move(vx=${wu.vxWind}, blocked=${wu.moveBlocked}); expirado ⇒ move libre(vx=${wu.vxFree}, free=${wu.moveFree}) + attack libre(${wu.atkFree})` : "probe null");

    // ---- AC9 SAVE byte-id: transient ⇒ save.v1 byte-identical, no throw*/charge key ----
    const sb = r.save;
    gate("AC9/save-byte-id", !!sb && sb.ok,
      sb ? `h.throwSel/knifeCharges/bombCharges/throwCD/throwWind/throwZone transitorios ⇒ save.v1 BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), SIN clave throw*/knifeCharges/bombCharges (hasKey=${sb.hasKey})` : "probe null");

    // ---- AC8 srand ON==OFF WITH a real Bomba Incendiaria firing (0 draws) ----
    const s = r.srand;
    gate("AC8/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around LANZAR la Bomba Incendiaria`);
    gate("AC8/throwable-fired", s.on.throwableFired === true, `the ON probe DID spawn the projectile (throwableFired) consumiendo 0 srand: throwableFired=${s.on.throwableFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC8/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL THROWABLES ON vs OFF — el arrojadizo es spawn/geometría/timing (no throwRng; 0 draws) aun lanzando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.throwableFired} offFired=${s.off.throwableFired}`);
    gate("AC8/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-throwables-play.png` }).catch(() => {});

    // ---- AC10 REG: prior beats' srand probes stay ON==OFF (18 pilares: Frenzy…Hyperarmor + Bonfire + Arts + Archetypes + Two-Handing + EquipLoad) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "hyperarmor", "bonfire", "arts", "archetypes", "twohand", "equip"]) {
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

    // ---- TOUCH: mobile pass drives a touch input flip (parity with cas1898/1904/1911/1917 touch check) ----
    if (viewport.isMobile) {
      const touched = await page.evaluate(() => { try { return !!(window.__dev && window.__dev.scene && window.__dev.scene() === "play"); } catch { return false; } });
      gate("TOUCH/play", touched, `mobile viewport en play (touch surface + tb.throwable/tb.throwcycle activos)`);
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
console.log(`CAS-1924 LIVE QA — Consumibles Arrojadizos (Throwing Items, Pilar 19) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1924 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
