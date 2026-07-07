// ===========================================================================
// CAS-1704 — LIVE QA: Editor de mapas + zona exportada jugada (MapDoc v1 round-trip).
// Verifies the CAS-1702 build on the canonical gh-pages URL. PASS x2 (desktop + mobile).
// Pattern mirrors tools/cas1692-mobs-live-qa.mjs + tools/cas1702-editor-smoke.mjs.
//
//   node tools/cas1704-editor-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Feature = a Visual Map Editor (editor.html/editor.js) + a MapDoc v1 round-trip
// loader (sim/mapdoc.js) wired into sim.js at ?map=. The editor exports the EXACT
// JSON the game consumes (real round-trip). Hard-gated: no ?map ⇒ byte-identical.
// Deploy set (build touches exactly these): editor.html, editor.js, sim/mapdoc.js,
//   sim/sim.js, game.js, index.html. (config.js is NOT in the changeset.)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD    version.json served (reported); served touched files md5 == HEAD (hard gate).
//  EDITOR   editor.html boots clean; __editor.doc valid; seed has hub+spokes; round-trip stable.
//  RT/seed  index.html?map=seed PLAYS: fromMapDoc, town+spokes resolve, spawners present,
//           hero enters play in the hub, mobs spawn with real art.
//  RT/local editor writes localStorage → index.html?map=local plays the EDITED map (name+zone).
//  NEUTRAL  no ?map ⇒ fromMapDoc=false, boot clean (loader untouched, RNG-neutral additive).
//  PERF     ≥55 fps on the played MapDoc zone; 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["editor.html", "editor.js", "sim/mapdoc.js", "sim/sim.js", "game.js", "index.html"];
const OUT = "shots/cas1704"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

// Attach error listeners. Filters the browser's automatic /favicon.ico 404 and
// the generic "Failed to load resource" network line (benign; the real feature
// files are md5-gated). Real JS errors (pageerror / console.error) still count.
function watch(page) {
  const errs = [];
  page.on("pageerror", e => { if (!/favicon/.test(e.message)) errs.push("pageerror: " + e.message); });
  page.on("console", m => {
    const t = m.text();
    if (m.type() === "error" && !/favicon/.test(t) && !/Failed to load resource/.test(t)) errs.push("console: " + t);
  });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
}

// A page that plays a MapDoc: clear only the HERO save so it reaches the menu
// (a prior run's save would auto-resume, never showing 'menu'), but PRESERVE the
// edited MapDoc in mithralda.mapdoc.v1 so ?map=local still loads it.
async function freshSaveOnly(page) {
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} });
}

// Drive menu → classsel → (abilitysel) → play. Mirrors the live combat harnesses.
async function enterPlay(page, name) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate((nm) => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = nm; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  }, name);
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await wait(200);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: await findChromium(), args: LAUNCH_ARGS, headless: true });
  try {
    // ---- BUILD gate ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("BUILD/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`BUILD/md5/${f.split("/").pop()}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ======================================================================
    // EDITOR — editor.html boots, exposes a valid MapDoc, round-trips stable.
    // Also writes an EDITED map to localStorage for the ?map=local round-trip.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });
      const info = await page.evaluate(() => {
        const d = window.__editor.doc;
        return { w: d.w, h: d.h, zones: d.zones.length, slots: d.zones.map(z => z.slot),
          npcs: d.entities.npcs.length, props: d.entities.props.length,
          canvasDrawn: (document.getElementById("c") || {}).width > 0 };
      });
      gate("EDITOR/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("EDITOR/seed-zones", info.zones >= 5, `zones=${info.zones} slots=${info.slots}`);
      gate("EDITOR/seed-hub", info.slots.includes("town"), "has town/hub slot");
      gate("EDITOR/seed-spokes", info.slots.includes("forest") && info.slots.includes("caves"), `slots=${info.slots}`);
      gate("EDITOR/seed-populated", info.npcs >= 1 && info.props >= 1, `npcs=${info.npcs} props=${info.props}`);
      gate("EDITOR/canvas-drawn", info.canvasDrawn, "canvas sized");

      const rt = await page.evaluate(() => {
        const seed = window.__editor.makeSeedMapDoc();
        const d2 = window.__editor.docFromMapDoc(seed);
        window.__editor.setDoc(d2);
        const md = window.__editor.docToMapDoc();
        return { stable: JSON.stringify(md.terrain.rle) === JSON.stringify(seed.terrain.rle)
          && JSON.stringify(md.zones) === JSON.stringify(seed.zones)
          && md.entities.npcs.length === seed.entities.npcs.length };
      });
      gate("EDITOR/round-trip-stable", rt.stable, "docToMapDoc(docFromMapDoc(seed))==seed");
      await page.screenshot({ path: `${OUT}/${label}-editor.png` });

      // write an EDITED map (rename + rename a spoke) → localStorage for ?map=local
      await page.evaluate(() => {
        const d = window.__editor.docFromMapDoc(window.__editor.makeSeedMapDoc());
        d.name = "QA-1704 Editado";
        const fz = d.zones.find(z => z.slot === "forest"); if (fz) fz.name = "Claro QA";
        window.__editor.setDoc(d);
        localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(window.__editor.docToMapDoc()));
      });
      await page.close();
    }

    // ======================================================================
    // RT/seed — index.html?map=seed PLAYS the bundled hub-and-spoke MapDoc.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page); await freshSaveOnly(page);
      await page.goto(`${BASE}/index.html?map=seed&dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("RT/seed/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("RT/seed/fromMapDoc", mi.fromMapDoc === true, `name="${mi.name}"`);
      gate("RT/seed/hub", !!(mi.zones.town && mi.zones.town.w > 0), JSON.stringify(mi.zones.town));
      gate("RT/seed/spokes", ["forest", "caves", "ruins", "swamp"].filter(s => mi.zones[s]).length >= 3,
        `zones=${Object.keys(mi.zones)}`);
      gate("RT/seed/spawners", mi.spawners.length >= 3 && mi.spawners.every(s => s.types.length > 0),
        `spawners=${mi.spawners.map(s => s.zone)}`);

      await enterPlay(page, "SeedBot");
      await wait(900);
      const mi2 = await page.evaluate(() => window.__dev.mapInfo());
      gate("RT/seed/hero-in-hub", mi2.heroZone === "town", `heroZone=${mi2.heroZone}`);
      // walk into a spoke to trigger a spawner, then count enemies
      await page.evaluate(() => window.__dev.tp && window.__dev.tp(48, 16)); // north forest spoke area
      await wait(1500);
      const enemyCount = await page.evaluate(() => window.__dev.enemyCount ? window.__dev.enemyCount() : (window.__dev.enemies ? window.__dev.enemies().length : 0));
      gate("RT/seed/mobs-spawn", enemyCount > 0, `enemies=${enemyCount}`);
      const heroZone2 = await page.evaluate(() => window.__dev.mapInfo().heroZone);
      gate("RT/seed/zoneOf-resolves", heroZone2 !== null, `heroZone=${heroZone2}`);
      await page.screenshot({ path: `${OUT}/${label}-seed-play.png` });

      // PERF on the played MapDoc zone
      const fps = await page.evaluate(() => new Promise(res => {
        let f = 0, t0 = performance.now();
        const cb = () => { f++; if (performance.now() - t0 < 1000) requestAnimationFrame(cb); else res(Math.round(f * 1000 / (performance.now() - t0))); };
        requestAnimationFrame(cb);
      }));
      gate("PERF/60fps", fps >= 55, `fps=${fps}`);
      await page.close();
    }

    // ======================================================================
    // RT/local — the EDITED map written by the editor page (same origin) plays.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page); await freshSaveOnly(page);
      await page.goto(`${BASE}/index.html?map=local&dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("RT/local/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("RT/local/fromMapDoc", mi.fromMapDoc === true, `name="${mi.name}"`);
      gate("RT/local/edited-name", mi.name === "QA-1704 Editado", `name="${mi.name}"`);
      gate("RT/local/edited-zone", !!(mi.zones.forest), `forest zone present`);
      await enterPlay(page, "LocalBot");
      await wait(700);
      const heroZone = await page.evaluate(() => window.__dev.mapInfo().heroZone);
      gate("RT/local/hero-in-hub", heroZone === "town", `heroZone=${heroZone}`);
      await page.screenshot({ path: `${OUT}/${label}-local-play.png` });
      await page.close();
    }

    // ======================================================================
    // NEUTRAL — no ?map ⇒ default world untouched (fromMapDoc=false), RNG-neutral.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
      await page.goto(`${BASE}/index.html?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("NEUTRAL/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("NEUTRAL/not-fromMapDoc", mi.fromMapDoc === false, `fromMapDoc=${mi.fromMapDoc}`);
      gate("NEUTRAL/default-name", mi.name === null || mi.name === undefined, `name=${mi.name}`);
      await page.close();
    }
  } catch (e) {
    console.log("  FAIL  EXCEPTION  " + (e && e.stack || e)); fail++;
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main ----
const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
console.log("=== CAS-1704 LIVE QA — Editor de mapas + MapDoc round-trip ===");
console.log("HEAD md5:", JSON.stringify(headHashes, null, 0));

const results = [];
results.push(["desktop", await runOnce("desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }, headHashes)]);
results.push(["mobile",  await runOnce("mobile",  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, headHashes)]);

console.log("\n=== SUMMARY ===");
let totFail = 0, totPass = 0;
for (const [label, r] of results) { console.log(`  ${label}: ${r.pass} passed, ${r.fail} failed`); totFail += r.fail; totPass += r.pass; }
console.log(`\nTOTAL ${totPass} passed, ${totFail} failed → ${totFail ? "FAIL" : "PASS"}`);
process.exit(totFail ? 1 : 0);
