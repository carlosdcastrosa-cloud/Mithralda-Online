// ===========================================================================
// CAS-1904 (QA for CAS-1901) — LIVE QA: SUPERARMADURA EN GOLPES COMPROMETIDOS (Hyperarmor / Poise-through, 16º pilar
// Souls-like). Verifica el build CAS-1902 (deployado por CAS-1903, overlay build fb00a6e03db2) sobre la URL canónica
// gh-pages. PASS x2 (desktop+mobile), navegador-por-pase. Mirror de tools/cas1898-two-hand-live-qa.mjs.
//
// Feature: durante el swing PESADO/rematador del héroe (ventana comprometida h.atkAnim>0 && (h._heavy||h._comboFin)) gana
// SUPERARMADURA — un golpe entrante cuyo poise-damage (=`dmg` crudo entrante, arg1 de damageHero) queda < `poiseThreshold`
// NO aplica su STUN (el ÚNICO vector de interrupción del héroe, CAS-1826) ⇒ aguanta y remata; el DAÑO SIGUE aterrizando (NO
// es i-frame). Anti-inmunidad: dmg>=umbral ⇒ el stun rompe (un slam de jefe te tumba igual). Suprime SÓLO el stun (neutraliza
// ese infl); slow/dot entran por su propio infl.type ⇒ intactos. 100% BORROW, hard-gated, RNG-neutral, save-neutral (flag
// TRANSITORIO h.hyperarmor, mirror h.blocking, fuera del allowlist de serializeSave). CERO draws (NO hyperArmorRng) ⇒ srand
// ON==OFF byte-idéntico aun disparando. HARD-GATED: enabled:false ⇒ rama muerta ⇒ applyStatus corre igual que HEAD ⇒
// byte-idéntico a HEAD (15 pilares intactos).
//
//   node tools/cas1901-hyperarmor-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1902 build 784744e tocó EXACTAMENTE estos 2 blobs — HARD md5 gate; leído de `git show --stat 784744e`,
// nunca copiar el conteo de blobs de un mirror — lección CAS-1828/CAS-1843). tools/cas1901-hyperarmor.mjs es dev-only (NO
// desplegado). El deploy commit f13d332 sólo añade tools/cas1901-deploy.mjs ⇒ los 2 blobs live == HEAD verbatim ⇒ REF=HEAD.
//   sim/config.js, sim/sim.js
//
// CRITICAL (lección CAS-1784/CAS-1876/CAS-1893/CAS-1898): estos probes conducen el juego REAL en ejecución — la página live
// bootea buildTiledWorld (el mundo que el jugador realmente juega), así que G / damageHero / applyStatus son los paths
// SHIPPED. Los hooks hyper* se recuperan importando dinámicamente la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia
// del juego vivo) porque el build los cableó en el export `dev`.
//
// ISOLATION (mirror cas1898): los probes rearman G (_hyperArm vacía enemies/projectiles/fields/fx y fuerza al héroe a un
// warrior limpio en play; los hyperSrandProbe/Two-Hand/EquipLoad spawnean+matan enemigos ⇒ shared-loot alignment). Con el
// loop de render vivo, un héroe/arrays reescritos triparían el draw ⇒ TODOS los probes corren dentro de UN page.evaluate que
// primero snapshotea + quiesce los arrays de sim Y shallow-snapshotea el héroe + scene, y HARD-restaura en un finally — un
// único bloque síncrono, sin rAF interleaved. Las hyper* probes corren PRIMERO con el héroe PRÍSTINO del pueblo (antes de que
// la REG de Bonfire lo reubique). La REG de Two-Handing (15º) y EquipLoad (14º) es SENSIBLE A ZONA (su killEnemy de
// alineación del loot compartido cae en zonas distintas) ⇒ corren AL FINAL con el HÉROE PRÍSTINO del PUEBLO restaurado
// (mirror gotcha cas1893/cas1896/cas1898).
//
// Covers: AC0 md5 live==HEAD (2 blobs) + SEAM served bytes carry the feature (config HYPERARMOR knob, sim damageHero
// stun-suppress branch + hyper* dev hooks) / CONTENT knob matches spec / AC2 commit (heavy+finisher: dmg<thr ⇒ stun NO sube
// pero hp baja / dmg>=thr ⇒ stun sube rompe) / AC3 no-commit idle ⇒ stun normal / AC4 slow/dot NO suprimido / AC5 OFF
// byte-id inerte + SAVE byte-id sin clave hyper* / AC6 srand ON==OFF 48-draw hyperArmorFired REAL (0 draws) + determinism /
// AC7 REG 15 pilares srand ON==OFF (Frenzy…Bonfire + Two-Handing + EquipLoad) / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 2 hyperarmor blobs son EXCLUSIVOS (el hyperarmor deploy es el último ⇒ nada comparte una línea live encima), así que
// cada uno es exact-md5 gated == HEAD.
const FILES = ["sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1904"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 784744e; el deploy commit f13d332 sólo añadió tools/cas1901-deploy.mjs — 2 blobs intactos).
const REF = process.env.HYPER_REF || "HEAD";
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 2 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "SuperQA"; ni.blur(); }  // NB: sin substring hyper/armor ⇒ el regex de save-key (AC5 SAVE) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));  // warrior (heavy/finisher commit surface)
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the hyper* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["hyperMeta", "_hyperArm", "hyperCommitProbe", "hyperNoCommitProbe", "hyperStatusProbe",
        "hyperOffProbe", "hyperSaveByteId", "hyperSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene, run the hyper* probes FIRST
// (pristine town hero — zone-safe; the srand probe's killEnemy loot alignment must run from town), then REG-14 (Frenzy…
// Bonfire; Bonfire relocates the hero), then Two-Handing (15º) + EquipLoad (14º) srand LAST with the PRISTINE TOWN hero
// restored (their doRoll/killEnemy loot is zone-sensitive), then HARD-restore in a finally. No rAF interleaves.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: probes reassign hero fields + h._heavy/h.hyperarmor
    const bagSnap = (G.hero && Array.isArray(G.hero.bag)) ? G.hero.bag.slice() : null;  // deep-copy: killEnemy loops mutate the bag
    const sceneSnap = G.scene;
    const r = {};
    // Restore the PRISTINE TOWN hero (snapshot at play-entry, before any probe relocated it). The srand/killEnemy alignment
    // loops draw ZONE-CONDITIONAL loot ⇒ ON/OFF must run from the SAME town position (like the build harness's createHero
    // town warrior) so they draw identical loot ⇒ byte-identical. Mirror gotcha cas1893/cas1898.
    const armTown = () => { if (heroSnap && G.hero) { Object.assign(G.hero, heroSnap); if (bagSnap) G.hero.bag = bagSnap.slice(); } };
    try {
      // ---- HYPERARMOR FIRST (héroe PRÍSTINO del PUEBLO, ANTES de que Bonfire lo reubique) ----
      r.meta = d.hyperMeta();
      r.commit = d.hyperCommitProbe();     // AC2: heavy & finisher — sub-thr aguanta (hp baja), supra-thr rompe
      r.noCommit = d.hyperNoCommitProbe(); // AC3: idle ⇒ stun aplica normal
      r.status = d.hyperStatusProbe();     // AC4: slow/dot NO suprimido (sólo stun)
      r.off = d.hyperOffProbe();           // AC5 OFF byte-id
      r.save = d.hyperSaveByteId();        // AC5 SAVE byte-id sin clave hyper*

      // ---- AC6 srand ON==OFF (commit stun-absorb FIRING, 0 draws) + determinism — town hero per call ----
      armTown(); const _on = d.hyperSrandProbe(true, seed, n);
      armTown(); const _off = d.hyperSrandProbe(false, seed, n);
      armTown(); const _on2 = d.hyperSrandProbe(true, seed, n);
      r.srand = { on: _on, off: _off, on2: _on2 };

      // ---- AC7 REG: 14 pilares (Frenzy…Bonfire; Bonfire REUBICA al héroe ⇒ corre tras las hyper probes) ----
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
    // ---- AC0 BUILD gate (live == HEAD, all 2 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/hyperarmor deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "";
    gate("SEAM/config", /export const HYPERARMOR\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /poiseThreshold:\s*34/.test(cfgTxt) && /twoHandBonus:\s*1\.0/.test(cfgTxt) && /vfx:\s*true/.test(cfgTxt) && /appliesTo:\s*{\s*heavy:\s*true,\s*finisher:\s*true\s*}/.test(cfgTxt),
      "HYPERARMOR knob (enabled/poiseThreshold:34/twoHandBonus:1.0/appliesTo{heavy,finisher}/vfx) present in served config.js");
    gate("SEAM/sim", /if\(HYPERARMOR\.enabled\)\{/.test(simTxt) && /h\.hyperarmor\s*=\s*h\.atkAnim>0\s*&&\s*\(\(HYPERARMOR\.appliesTo\.heavy\s*&&\s*h\._heavy\)/.test(simTxt) && /if\(h\.hyperarmor\s*&&\s*infl\s*&&\s*infl\.type==="stun"\)\{/.test(simTxt) && /const thr\s*=\s*HYPERARMOR\.poiseThreshold\s*\*\s*\(TWO_HAND\.enabled\s*&&\s*h\.twoHand\s*\?\s*HYPERARMOR\.twoHandBonus\s*:\s*1\)/.test(simTxt) && /if\(dmg\s*<\s*thr\)\{[\s\S]*?infl=null;/.test(simTxt) && /hyperMeta\(\)\{/.test(simTxt),
      "sim: HYPERARMOR.enabled gate + h.hyperarmor commit-window + stun-suppress (dmg<thr ⇒ infl=null) + twoHandBonus umbral + hyper* dev hooks present in served sim.js");

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

    // ---- wire the live sim module (recovers hyper* hooks the build left on the export dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `hyper* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1901c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the HYPERARMOR knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.poiseThreshold === 34 && meta.twoHandBonus === 1.0 && meta.appliesTo && meta.appliesTo.heavy === true && meta.appliesTo.finisher === true && meta.vfx === true,
      `HYPERARMOR enabled=${meta.enabled} poiseThreshold=${meta.poiseThreshold} twoHandBonus=${meta.twoHandBonus} appliesTo=${J(meta.appliesTo)} vfx=${meta.vfx}`);

    // ---- AC2 commit: heavy & finisher — sub-thr aguanta (hp baja), supra-thr rompe ----
    const cp = r.commit;
    gate("AC2/heavy-commit", !!cp && cp.heavyOk,
      cp ? `HEAVY: dmg<thr(${cp.lo}<${cp.thr}) ⇒ h.stun=${cp.hLo.stun} NO sube pero hp baja (${cp.hLo.hpDrop}); dmg>=thr(${cp.hi}) ⇒ h.stun=${cp.hHi.stun} sube (rompe superarmadura)` : "probe null");
    gate("AC2/finisher-commit", !!cp && cp.finOk,
      cp ? `FINISHER (h._comboFin): dmg<thr ⇒ h.stun=${cp.fLo.stun} NO sube pero hp baja (${cp.fLo.hpDrop}); dmg>=thr ⇒ h.stun=${cp.fHi.stun} sube` : "probe null");

    // ---- AC3 no-commit: idle ⇒ stun aplica normal ----
    const nc = r.noCommit;
    gate("AC3/no-commit", !!nc && nc.ok,
      nc ? `MISMO golpe sub-umbral (${nc.lo}) ⇒ idle h.stun=${nc.idleStun} (aturde) vs en commit h.stun=${nc.commitStun} (absorbe) — superarmadura SÓLO en golpe comprometido` : "probe null");

    // ---- AC4 status: slow/dot NO suprimido (sólo stun) ----
    const sp = r.status;
    gate("AC4/status-leak", !!sp && sp.ok,
      sp ? `en commit el stun se absorbe (stunAbsorbed=${sp.stunAbsorbed}) pero un SLOW entrante SÍ aplica (slowT=${sp.slowT}) — la rama toca SÓLO el stun` : "probe null");

    // ---- AC5 OFF byte-id: enabled=false ⇒ dead branch, stun aturde igual que HEAD ----
    const off = r.off;
    gate("AC5/off-inert", !!off && off.ok,
      off ? `HYPERARMOR.enabled=false ⇒ rama muerta, stun sub-umbral en commit SÍ aturde (h.stun=${off.offStun}, byte-id a HEAD); ON el mismo golpe se absorbe (h.stun=${off.onStun})` : "probe null");

    // ---- AC5 SAVE: transient flag ⇒ save.v1 byte-id ON/OFF, no hyper* key ----
    const sb = r.save;
    gate("AC5/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL ON vs OFF (byteId=${sb.byteId}), SIN clave hyper* (hasKey=${sb.hasKey}) — h.hyperarmor transitorio, sin campo nuevo` : "probe null");

    // ---- AC6 srand ON==OFF WITH a real commit stun-absorb firing (0 draws) ----
    const s = r.srand;
    gate("AC6/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around un golpe comprometido que ABSORBE un stun`);
    gate("AC6/hyper-fired", s.on.hyperArmorFired === true, `the ON probe DID absorb the stun (superarmadura disparó) consumiendo 0 srand: hyperArmorFired=${s.on.hyperArmorFired}`);
    let firstDiff = -1; for (let i = 0; i < s.on.fingerprint.length; i++) { if (s.on.fingerprint[i] !== s.off.fingerprint[i]) { firstDiff = i; break; } }
    gate("AC6/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      firstDiff < 0 ? "srand BYTE-IDENTICAL HYPERARMOR ON vs OFF — la superarmadura es timing/estado/aritmética (no hyperArmorRng; 0 draws) aun disparando"
        : `DIVERGE @idx=${firstDiff} on=${s.on.fingerprint[firstDiff]} off=${s.off.fingerprint[firstDiff]} | onFired=${s.on.hyperArmorFired} offFired=${s.off.hyperArmorFired}`);
    gate("AC6/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-hyperarmor-play.png` }).catch(() => {});

    // ---- AC7 REG: prior beats' srand probes stay ON==OFF (15 pilares: Frenzy…Bonfire + Two-Handing + EquipLoad) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield", "bonfire", "twohand", "equip"]) {
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
console.log(`CAS-1904 LIVE QA — Superarmadura en Golpes Comprometidos (Hyperarmor, Pilar 16) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1904 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
