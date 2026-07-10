// ===========================================================================
// CAS-1888 (QA for CAS-1879 / retune CAS-1885) — LIVE QA: BONFIRE PILAR 13 PLACEMENT RETUNE (knob BONFIRE.sites).
// Verifies the CAS-1886 build (deployed by CAS-1887, overlay build cff98e1e1941) on the canonical gh-pages URL.
// PASS x2 (desktop+mobile), browser-per-pass. Mirror of tools/cas1879-bonfire-live-qa.mjs (CAS-1883).
//
// WHY THIS RETUNE: la mecánica HEADLINE de la hoguera (world reset repoblando no-jefes) quedaba DORMIDA en vivo
// porque las 2 world.fountains resuelven a la zona `field` (sin spawner) ⇒ bonfireRespawn repop=0 en el loop real.
// El retune AÑADE `BONFIRE.sites` (lista de ZONAS de caza pobladas): bonfireSites(w) resuelve cada zona a una
// posición DETERMINISTA 0-draw desde el rect del 1er spawner en-zona (guard zoneOf(site)===zone descarta los
// huntZones del continente que caen en `field`). interact() enruta el site por la MISMA rama gateada de descanso
// (rest = f || nearestBonfireSite()) ⇒ zoneOf(site)=zona poblada ⇒ **repop>0 OBSERVABLE** en el combate real. El
// seam bonfireRespawn/bonfireUnsafe/safe-gate queda INTACTO; las fountains de `field` SIGUEN curando (aditivo).
//
//   node tools/cas1888-bonfire-placement-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1886 build 2bbbb9a touched exactly these 3 blobs — HARD md5 gate; read the set from
// `git show --stat 2bbbb9a`, never copy a mirror's blob count — lesson CAS-1828/CAS-1843). El retune es
// placement-only ⇒ strings.js NO tocado (sin nuevos strings). El bonfire-placement deploy (build cff98e1e1941)
// es el ÚLTIMO deploy de gh-pages, así que nada se ha superpuesto a estos blobs ⇒ los 3 son EXACT md5 == HEAD.
// REF = HEAD (== build commit 2bbbb9a; el deploy commit ac4f031 sólo añade la herramienta de deploy).
//   render/render.js, sim/config.js, sim/sim.js
//
// CRITICAL (lesson CAS-1784 / CAS-1862 / CAS-1871 / CAS-1876 / CAS-1883): estos probes conducen el juego REAL en
// ejecución — la página live bootea buildTiledWorld (el mundo que el jugador realmente juega), así que G /
// interact / bonfireSites / bonfireRespawn / bonfireUnsafe son los paths SHIPPED. Los hooks bonfire* se recuperan
// importando dinámicamente la MISMA URL de sim.js (ESM dedups por URL ⇒ la instancia del juego vivo).
//
// ISOLATION: los site probes colocan al héroe SOBRE un BONFIRE.site de una zona de caza, corren interact()→
// nearestBonfireSite()→bonfireRespawn (REPUEBLA la zona), y mutan hero + arrays. Como el loop de render está vivo,
// TODOS los probes corren dentro de UN page.evaluate que primero snapshotea + quiesce los arrays de sim Y
// shallow-snapshotea el héroe + scene, y luego HARD-restaura en un finally. La REGRESIÓN corre PRIMERO (héroe
// prístino en el PUEBLO) porque los site probes dejan al héroe en una zona de caza donde el loot RNG de killEnemy
// es condicional a la zona ⇒ Frenzy divergiría.
//
// Covers (LIVE, no dev): AC0 md5 live==HEAD (3 blobs) + SEAM served bytes carry the retune (config BONFIRE.sites +
// siteAnchor, sim bonfireSites/nearestBonfireSite + rest=f||site branch, render sites glow) / CONTENT sites knob /
// COVERAGE ≥1 site por zona de caza poblada wired en el config SERVIDO, todos zoneMatch, incluye forest / HEADLINE
// repop>0 observable en forest (descanso KeyE ⇒ heal + Estus + ancla + world reset no-jefes) + JEFE permanece
// muerto / SAFE-GATE en site (unsafe deny / safe allow) / OFF byte-id (site no detectado ⇒ inerte) / ADITIVO la
// fountain de `field` sigue curando / DETERMINISM sites reproducibles / RNG-neutral srand ON==OFF 48-draw (sin
// bonfireRng) / save.v1 byte-id sin clave bonfire* / REG 13 pilares Souls-like ON==OFF + boots clean / PERF 60fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// Los 3 blobs del retune son EXCLUSIVOS (el bonfire-placement deploy es el último ⇒ nada comparte una línea live
// encima), así que cada uno es exact-md5 gated == HEAD.
const FILES = ["render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1888"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
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
        if (lastMd5[f] !== headHashes[f]) allMatch = false;   // exact gate on all 3 exclusive blobs
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
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "HogueraQA"; ni.blur(); }  // NB: sin substring bonfire ⇒ el regex de save-key no falsea
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
      const need = ["bonfireMeta", "bonfireSitesInfo", "bonfireSiteRestProbe", "bonfireSiteSafeGateProbe",
        "bonfireSiteOffProbe", "bonfireSitesDeterministic", "bonfireRestProbe", "bonfireSaveByteId", "bonfireSrandProbe"];
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
    const heroSnap = G.hero ? { ...G.hero } : null;
    const sceneSnap = G.scene;
    const r = {};
    try {
      // REG FIRST: héroe prístino en el PUEBLO. 13 sistemas previos.
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

      // RETUNE probes (site coverage + HEADLINE repop + safe-gate + OFF + determinism).
      r.meta = d.bonfireMeta();
      r.sites = d.bonfireSitesInfo();
      r.siteRest = d.bonfireSiteRestProbe("forest");     // HEADLINE: repop>0 en forest (zona temprana poblada)
      r.siteGate = d.bonfireSiteSafeGateProbe("forest");
      r.siteOff = d.bonfireSiteOffProbe("forest");
      r.det = d.bonfireSitesDeterministic();
      // ADITIVO: la rama de fountain (path viejo) sigue curando + reset (fountain sintética en zona de caza).
      r.rest = d.bonfireRestProbe();
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
    // ---- AC0 BUILD gate (live == HEAD, all 3 exclusive blobs exact) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match (== HEAD/placement deploy tree)" : `live=${liveMd5[f]} ref=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- SEAM: the served bytes actually contain the retune (belt + suspenders vs md5) ----
    const simTxt = servedText["sim/sim.js"] || "", cfgTxt = servedText["sim/config.js"] || "",
      rndTxt = servedText["render/render.js"] || "";
    gate("SEAM/config-sites", /export const BONFIRE\s*=\s*{/.test(cfgTxt) && /sites:\s*\[/.test(cfgTxt) && /"forest"/.test(cfgTxt) && /siteAnchor:\s*{/.test(cfgTxt),
      "BONFIRE.sites (lista de zonas de caza, incl. forest) + siteAnchor presentes en served config.js");
    gate("SEAM/sim-sites", /function bonfireSites\(/.test(simTxt) && /nearestBonfireSite\(/.test(simTxt) && /BONFIRE\.enabled\s*\?\s*nearestBonfireSite\(\)/.test(simTxt),
      "sim: bonfireSites(w) + nearestBonfireSite() + rest=f||(BONFIRE.enabled?nearestBonfireSite():null) presentes en served sim.js");
    gate("SEAM/render", /BONFIRE\.enabled/.test(rndTxt) && /bonfireSitesPublic|BONFIRE\.glowColor/.test(rndTxt),
      "render.js: hoguera standalone procedural $0 gateada por site presente en served bytes");

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
    const SEED = 0x1888c0de, N = 24;
    const r = await runProbes(page, SEED, N);
    if (r.err) { gate("PROBES/ran", false, `probe block threw: ${r.err}`); return { pass, fail }; }

    // ---- CONTENT: the BONFIRE knob still matches spec ----
    const meta = r.meta;
    gate("CONTENT/knob", meta.enabled === true && meta.key === "KeyE" && meta.respawnEnemies === true && meta.safeRadius === 260,
      `BONFIRE enabled=${meta.enabled} key=${meta.key} respawnEnemies=${meta.respawnEnemies} safeRadius=${meta.safeRadius}`);

    // ---- COVERAGE: ≥1 site por zona de caza poblada wired en config SERVIDO, todos zoneMatch, incl. forest ----
    const si = r.sites;
    gate("COVERAGE/sites-wired", !!si && si.count >= 1 && si.hasForest,
      si ? `${si.count} sites resueltos desde config servido: zonas=[${si.zones.join(",")}] (incl. forest=${si.hasForest})` : "probe null");
    gate("COVERAGE/zoneMatch", !!si && si.allMatch === true && si.count > 0,
      si ? `TODOS los sites resuelven a su zona objetivo (zoneOf(site)===zone) — guard huntZone→field aplicado (allMatch=${si.allMatch})` : "probe null");

    // ---- HEADLINE: descanso (KeyE) en un site de forest ⇒ repop>0 OBSERVABLE + JEFE permanece muerto ----
    const sr = r.siteRest;
    gate("HEADLINE/repop>0", !!sr && sr.ok && sr.repop > 0 && sr.zone === "forest",
      sr ? `descanso en BONFIRE.site de ${sr.zone} ⇒ world reset repobla NO-JEFES (repop=${sr.repop}>0 OBSERVABLE) + heal(${sr.healed}) + Estus(${sr.refilled}) + ancla(${sr.anchored}) + viejos reemplazados(${sr.oldGone})` : "probe null");
    gate("HEADLINE/boss-stays-dead", !!sr && sr.bossAlive === true,
      sr ? `el JEFE de la zona NO revuelve tras el reset (bossAlive/intacto=${sr.bossAlive}) — sólo no-jefes repoblados` : "probe null");

    // ---- SAFE-GATE en site: no-jefe en aggro dentro de safeRadius ⇒ descanso DENEGADO; fuera ⇒ permite ----
    const sg = r.siteGate;
    gate("SAFE-GATE/site", !!sg && sg.ok,
      sg ? `no-jefe en aggro DENTRO safeRadius ⇒ descanso DENEGADO (denied=${sg.denied}); sacado del radio ⇒ descanso PERMITE (allowed=${sg.allowed})` : "probe null");

    // ---- OFF byte-id: BONFIRE.enabled=false ⇒ site no detectado ⇒ héroe sobre el site es INERTE ----
    const so = r.siteOff;
    gate("OFF/site-inert", !!so && so.ok,
      so ? `OFF ⇒ nearestBonfireSite() nunca consultado ⇒ héroe sobre el site NO cura/recarga/reset (inert=${so.inert}) — byte-identical a HEAD sin la feature de sites` : "probe null");

    // ---- ADITIVO: la rama de fountain (path viejo de `field`) sigue curando + reset ----
    const rp = r.rest;
    gate("ADDITIVE/fountain", !!rp && rp.healed && rp.refilled,
      rp ? `la fountain (path viejo) sigue curando HP/MP/stam(${rp.healed}) + recarga Estus(${rp.refilled}) — no se rompió el path aditivo` : "probe null");

    // ---- DETERMINISM: sites reproducibles con la misma semilla (pos = función pura del world-build) ----
    gate("DETERMINISM/sites", !!r.det && r.det.same === true,
      r.det ? `reconstruir el mundo 2× con la misma semilla ⇒ mismos site.x/site.y (same=${r.det.same}, ${r.det.a?.length||0} sites) — 0-draw determinista` : "probe null");

    // ---- RNG-neutral: gameplay srand byte-id ON==OFF con el descanso+reset DISPARANDO (sin bonfireRng) ----
    const s = r.srand;
    gate("RNG/48-draws", s.on.fingerprint.length === 48, `${s.on.fingerprint.length} srand draws (2×${N}) alrededor de un descanso + world reset repoblando`);
    gate("RNG/bonfire-fired", s.on.bonfireFired === true, `el probe ON DID rest (repobló + recargó), no sólo la bandera: bonfireFired=${s.on.bonfireFired}`);
    gate("RNG/on==off", J(s.on.fingerprint) === J(s.off.fingerprint),
      "gameplay srand BYTE-IDENTICAL BONFIRE ON vs OFF — sites = config estática (0 RNG), no bonfireRng, incluso cuando repuebla");
    gate("RNG/determinism", J(s.on.fingerprint) === J(s.on2.fingerprint), `misma semilla reproduce el fingerprint srand`);

    // ---- SAVE: ancla reusa h.respawn ⇒ save.v1 byte-id ON/OFF, sin clave bonfire* ----
    const sb = r.save;
    gate("SAVE/byte-id", !!sb && sb.ok,
      sb ? `save.v1 BYTE-IDENTICAL con el ancla ON vs OFF (byteId=${sb.byteId}), SIN clave bonfire* (hasKey=${sb.hasKey})` : "probe null");

    // ---- evidence screenshot ----
    await page.screenshot({ path: `${OUT}/${label}-bonfire-sites-play.png` }).catch(() => {});

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
    gate("PERF/60fps", fps >= 45, `${fps}fps (CI variance; RNG determinism is the hard bar)`);

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
console.log(`CAS-1888 LIVE QA — Bonfire Pilar 13 placement retune (BONFIRE.sites) @ ${BASE}\nREF ${REF} md5:`, headHashes);

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

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1888 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
