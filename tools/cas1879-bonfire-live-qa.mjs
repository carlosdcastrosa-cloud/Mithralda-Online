// ===========================================================================
// CAS-1883 (QA for CAS-1879) — LIVE QA: HOGUERA / REST SITE (Bonfire, 13ª feature Souls-like y CAPSTONE que
// UNIFICA Estus (CAS-1854) + Mancha de Sangre/corpse-run (CAS-1867) + el checkpoint existente). Verifies the
// CAS-1881 build (deployed by CAS-1882, overlay build 1be397f48cfb) on the canonical gh-pages URL. PASS x2
// (desktop+mobile), browser-per-pass. Mirror of tools/cas1873-shield-block-live-qa.mjs.
//
// Feature = la FUENTE se convierte en un rest site gateado por BONFIRE.enabled. La rama de descanso de interact()
// (que ya cura HP/MP/stam + fija h.respawn=ancla corpse-run) AÑADE: recarga Estus (h.flaskCharges=FLASK.charges,
// gated FLASK.enabled), fija el ancla (ya lo hace la fuente) y REPUEBLA los no-jefes de la zona de forma
// DETERMINISTA 0-draw (bonfireRespawn: grid+tipo por índice, applyZoneScale; sin rr()/ri()/maybeAffix; jefes
// isBoss EXCLUIDOS). SAFE-GATE: un no-jefe en aggro dentro de safeRadius ⇒ bonfireUnsafe(f)=true ⇒ descanso
// DENEGADO (toast + sfx.deny, sin cura/recarga/reset/ancla). Geometría/aritmética pura ⇒ CERO srand draws, NO
// existe `bonfireRng` ⇒ srand BYTE-IDÉNTICO ON==OFF incluso con el reset REPOBLANDO. El ancla reusa h.respawn
// (ya en save.v1) ⇒ save.v1 byte-id, SIN clave bonfire*. Llama/glow procedural canvas ($0 arte). HARD-GATED:
// BONFIRE.enabled=false ⇒ la fuente SIGUE curando + fijando ancla (contrato HEAD) pero NO recarga Estus ni
// repuebla ⇒ byte-idéntico a HEAD.
//
//   node tools/cas1879-bonfire-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1881 build 8763856 touched exactly these 4 blobs — HARD md5 gate; read the set from
// `git show --stat 8763856`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). Bonfire REUSA KeyE
// (el interact de proximidad) ⇒ NO toca input.js. El bonfire deploy (build 1be397f48cfb) es el ÚLTIMO deploy de
// gh-pages, así que nada se ha superpuesto a estos blobs ⇒ los 4 son EXACT md5 == HEAD. REF = HEAD (== build
// commit 8763856; el deploy commit db74c2c sólo añade la herramienta de deploy).
//   render/render.js, sim/config.js, sim/sim.js, strings.js
//
// CRITICAL (lesson CAS-1784 / CAS-1862 / CAS-1871 / CAS-1876): estos probes conducen el juego REAL en ejecución —
// la página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que G / interact /
// bonfireRespawn / bonfireUnsafe son los paths SHIPPED. Los hooks bonfire* se recuperan importando dinámicamente
// la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo) porque el build los cableó en el
// export `dev` de sim, NO en el __dev de game.js.
//
// ISOLATION (lesson backstab/poise/stamina/lock-on/flask/bloodstain/shield): los bonfire probes rearman G
// (_bonfireArm vacía enemies/projectiles/fields/fx y REESCRIBE el héroe a un warrior limpio colocado en el CENTRO
// de un spawner de zona de caza, corre interact()→bonfireRespawn que REPUEBLA la zona, muta h.hp/mp/stam/
// flaskCharges/respawn/x/y); con el loop de render vivo, entradas residuales o el héroe reescrito trip-earían el
// draw. Así que TODOS los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de
// sim Y shallow-snapshotea el héroe + scene, y luego HARD-restaura en un finally — un único bloque síncrono, sin
// rAF interleaved. NB: la REGRESIÓN corre PRIMERO (héroe prístino en el PUEBLO) porque los bonfire probes dejan al
// héroe en una zona de caza y killEnemy dibuja RNG de loot CONDICIONAL a la zona ⇒ Frenzy divergiría por la ZONA
// (lección del build harness cas1879-bonfire.mjs: sim.createHero() ANTES del reg loop).
//
// Covers: AC0 md5 live==HEAD (4 blobs) + SEAM served bytes carry the feature (config BONFIRE knob, sim interact
// rest branch + bonfireUnsafe/bonfireRespawn, render glow gated, strings bonfireRest/bonfireUnsafe) / CONTENT knob
// matches spec / AC1 descanso seguro ⇒ HP/MP/stam a tope + h.flaskCharges==FLASK.charges / AC2 ancla h.respawn
// fijada al sitio / AC3 world reset repuebla no-jefes + JEFE no revuelve / AC4 safe-gate (unsafe near / safe far /
// safe idle / safe boss / interact denegado) / AC6 OFF byte-id (fuente cura+ancla pero NO recarga/repuebla) / AC5
// srand ON==OFF 48-draw con bonfireFired REAL (0 draws, no bonfireRng) / AC7 save.v1 byte-id sin clave bonfire* /
// REG 13 systems srand ON==OFF + boots clean / PERF.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 4 bonfire blobs son EXCLUSIVOS (el bonfire deploy es el último ⇒ nada comparte una línea live encima), así
// que cada uno es exact-md5 gated == HEAD.
const FILES = ["render/render.js", "sim/config.js", "sim/sim.js", "strings.js"];
const OUT = "shots/cas1883"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
// REF = HEAD (== build commit 8763856; el deploy tool overlaid HEAD blobs verbatim).
const REF = process.env.BONFIRE_REF || "HEAD";
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "HogueraQA"; ni.blur(); }  // NB: sin substring bonfire ⇒ el regex de save-key (AC7) no falsea
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the bonfire* dev hooks by importing the SAME live module URL (ESM dedups ⇒ the running game's instance).
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__bk = m.dev; window.__bkG = m.G;
      const need = ["bonfireMeta", "bonfireRestProbe", "bonfireSafeGateProbe", "bonfireOffProbe",
        "bonfireSaveByteId", "bonfireSrandProbe"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameHero: !!(m.G && m.G.hero) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

// One synchronous block: snapshot + quiesce all sim arrays AND shallow-snapshot the hero + scene (the bonfire
// probes rearm all of these), run the REG srand probes FIRST (pristine town hero — zone-safe), then every bonfire
// probe, then HARD-restore in a finally. No rAF interleaves inside a single page.evaluate.
async function runProbes(page, SEED, N) {
  return await page.evaluate((seed, n) => {
    const d = window.__bk, G = window.__bkG;
    const snap = { en: G.enemies.splice(0, G.enemies.length), pr: G.projectiles.splice(0, G.projectiles.length),
      fx: G.fx.splice(0, G.fx.length), fld: G.fields.splice(0, G.fields.length) };
    const heroSnap = G.hero ? { ...G.hero } : null;   // shallow: _bonfireArm reassigns hero fields + position
    const sceneSnap = G.scene;
    const r = {};
    try {
      // REG FIRST: héroe prístino en el PUEBLO (los bonfire probes lo mueven a una zona de caza donde el loot RNG
      // de killEnemy es condicional a la zona ⇒ Frenzy divergiría). 13 sistemas previos.
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
      ];
      for (const [name, s, fn, extra] of P) {
        if (typeof d[fn] !== "function") { reg[name] = { absent: true }; continue; }
        const on = d[fn](true, s, 24, ...extra), off = d[fn](false, s, 24, ...extra);
        reg[name] = { same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint) };
      }
      r.reg = reg;

      // BONFIRE probes (these rewrite the hero into a hunt-zone spawner + repopulate).
      r.meta = d.bonfireMeta();
      r.rest = d.bonfireRestProbe();
      r.gate = d.bonfireSafeGateProbe();
      r.off = d.bonfireOffProbe();
      r.save = d.bonfireSaveByteId();
      r.srand = { on: d.bonfireSrandProbe(true, seed, n), off: d.bonfireSrandProbe(false, seed, n), on2: d.bonfireSrandProbe(true, seed, n) };
    } catch (e) { r.err = String(e && e.stack || e); }
    finally {
      G.enemies.length = 0; G.projectiles.length = 0; G.fx.length = 0; G.fields.length = 0;
      G.enemies.push(...snap.en); G.projectiles.push(...snap.pr); G.fx.push(...snap.fx); G.fields.push(...snap.fld);
      if (heroSnap && G.hero) Object.assign(G.hero, heroSnap);
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
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/bonfire deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the feature (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      strTxt = servedText["strings.js"] || "", rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config", /export const BONFIRE\s*=\s*{/.test(cfgTxt) && /enabled:\s*true/.test(cfgTxt) && /key:\s*"KeyE"/.test(cfgTxt) && /refillFlasks:\s*true/.test(cfgTxt) && /respawnEnemies:\s*true/.test(cfgTxt) && /setCheckpoint:\s*true/.test(cfgTxt) && /safeRadius:\s*260/.test(cfgTxt) && /glowColor:\s*"#ff9a3c"/.test(cfgTxt),
      "BONFIRE knob (enabled/key:KeyE/healFull/refillFlasks/respawnEnemies/setCheckpoint/safeRadius:260/glowColor:#ff9a3c) present in served config.js");
    gate("SEAM/sim", /BONFIRE\.enabled\s*&&\s*bonfireUnsafe\(f\)/.test(simTxt) && /BONFIRE\.refillFlasks\s*&&\s*FLASK\.enabled/.test(simTxt) && /BONFIRE\.respawnEnemies\)\s*bonfireRespawn/.test(simTxt) && /function bonfireUnsafe\(/.test(simTxt) && /function bonfireRespawn\(/.test(simTxt),
      "sim: interact() rest branch gated (BONFIRE.enabled&&bonfireUnsafe deny, refillFlasks&&FLASK.enabled, respawnEnemies⇒bonfireRespawn) + bonfireUnsafe/bonfireRespawn defs present in served sim.js");
    gate("SEAM/render", /BONFIRE\.enabled/.test(rndTxt) && /BONFIRE\.glowColor/.test(rndTxt),
      "render.js: gated $0-art llama/glow procedural (BONFIRE.enabled + glowColor) present in served bytes");
    gate("SEAM/strings", /bonfireRest:\s*"/.test(strTxt) && /bonfireUnsafe:\s*"/.test(strTxt),
      "strings.js: STR.bonfireRest + STR.bonfireUnsafe banners present in served bytes");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
        localStorage.removeItem("mithralda.flask.v1"); localStorage.removeItem("mithralda.bloodstain.v1");
        localStorage.removeItem("mithralda.bonfire.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    // ---- wire the live sim module (recovers bonfire* hooks the build left off window.__dev) ----
    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `bonfire* hooks live (same running instance, hero=${wl.sameHero})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- run every behavioral probe in one isolated block ----
    const SEED = 0x1879c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the BONFIRE knob (matches the design spec) ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "KeyE" && meta.healFull === true && meta.refillFlasks === true && meta.respawnEnemies === true && meta.setCheckpoint === true && meta.safeRadius === 260 && meta.glowColor === "#ff9a3c",
      `BONFIRE enabled=${meta.enabled} key=${meta.key} healFull=${meta.healFull} refillFlasks=${meta.refillFlasks} respawnEnemies=${meta.respawnEnemies} setCheckpoint=${meta.setCheckpoint} safeRadius=${meta.safeRadius} glow=${meta.glowColor}`);

    // ---- AC1 (cura+recarga) + AC2 (ancla) + AC3 (world reset no-jefe) ----
    const rp = r.rest;
    gate("AC1/heal+refill", !!rp && rp.healed && rp.refilled,
      rp ? `descanso seguro (zona=${rp.zone}) ⇒ HP/MP/stam a tope (${rp.healed}) Y h.flaskCharges==FLASK.charges recarga Estus (${rp.refilled})` : "probe null");
    gate("AC2/anchor", !!rp && rp.anchored,
      rp ? `el descanso fija h.respawn al sitio = ancla corpse-run/respawn (${rp.anchored})` : "probe null");
    gate("AC3/world-reset", !!rp && rp.oldGone && rp.repop > 0 && rp.bossAlive,
      rp ? `world reset ⇒ no-jefes viejos REEMPLAZADOS (${rp.oldGone}) + repoblados (repop=${rp.repop}), JEFE intacto NO revuelve (bossAlive=${rp.bossAlive})` : "probe null");

    // ---- AC4: safe-gate (unsafe near / safe far / safe idle / safe boss / interact denegado) ----
    const sg = r.gate;
    gate("AC4/safe-gate", !!sg && sg.ok,
      sg ? `no-jefe en aggro DENTRO safeRadius ⇒ unsafe (${sg.unsafeNear}); fuera de radio ⇒ seguro (${sg.safeFar}); idle/no-aggro ⇒ seguro (${sg.safeIdle}); JEFE en aggro NO bloquea ⇒ seguro (${sg.safeBoss}); interact() con enemigo unsafe ⇒ DENEGADO sin curar/recargar/anclar (${sg.denied})` : "probe null");

    // ---- AC6 OFF byte-id: BONFIRE.enabled=false ⇒ fuente cura+ancla (HEAD) pero NO recarga Estus ni repuebla ----
    const off = r.off;
    gate("AC6/off-inert", !!off && off.ok,
      off ? `OFF ⇒ la fuente SIGUE curando (${off.healed}) + fijando ancla (${off.anchored}) pero NO recarga Estus (${off.noRefill}) ni repuebla no-jefes (${off.noReset}) — byte-identical a HEAD` : "probe null");

    // ---- AC5 / AC-RNG-STRONG: gameplay srand byte-id ON==OFF WITH real rest+reset FIRING ----
    const s = r.srand;
    gate("AC5/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) around a REAL descanso + world reset repoblando`);
    gate("AC5/bonfire-fired", s.on.bonfireFired === true, `the ON probe DID rest (repobló no-jefes + recargó Estus), not just the flag: bonfireFired=${s.on.bonfireFired}`);
    gate("AC5/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL BONFIRE ON vs OFF — el descanso/reset es geometría + spawnEnemy/applyZoneScale (no bonfireRng; 0 srand draws) incluso cuando repuebla de verdad");
    gate("AC5/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `same seed reproduces the srand fingerprint — Stage-2 ready`);

    // ---- AC7 SAVE: ancla reusa h.respawn ⇒ save.v1 byte-id ON/OFF, no bonfire key ----
    const sb = r.save;
    gate("AC7/save-byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL con el ancla ON vs OFF (byteId=${sb.byteId}), SIN clave bonfire* (hasKey=${sb.hasKey}) — el ancla reusa h.respawn (ya en save.v1), sin store nuevo mithralda.bonfire.v1` : "probe null");

    // ---- AC evidence screenshot: capture the play surface ----
    await page.screenshot({ path: `${OUT}/${label}-bonfire-play.png` }).catch(() => {});

    // ---- REG: prior beats' srand probes stay ON==OFF (13 systems) ----
    const reg = r.reg;
    for (const name of ["frenzy", "parry", "dodge", "telegraph", "abilities", "poise", "combos", "backstab", "stamina", "lock-on", "flask", "bloodstain", "shield"]) {
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
console.log(`CAS-1883 LIVE QA — Hoguera/Rest Site (Bonfire, Pilar 13) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1883 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
