// ===========================================================================
// CAS-1718 — LIVE QA: subir carpeta de assets custom → paleta → sello → export/
// reimport round-trip → juego. Verifies the CAS-1716 build (deployed by CAS-1717)
// on the canonical gh-pages URL. PASS x2 (desktop + mobile).
// Pattern mirrors tools/cas1704-editor-live-qa.mjs (live md5 gate + per-pass browser)
// with the functional checks of tools/cas1716-custom-assets-qa.mjs (AC1–AC8).
//
//   node tools/cas1718-custom-assets-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Feature = editor folder-upload of custom images → IndexedDB palette (grouped by
// folder) → Sello stamp as deco kind:"custom" → export embeds ONLY referenced
// assets in md.assets → the game reads them SYNC and decodes the Image. No file
// picker in headless ⇒ drive the QA hooks window.__editor.{ingestAsset,listAssets,
// stampCustom} + window.__dev.customImgReady.
//
// Deploy set (CAS-1717 overlay = exactly these 6 blobs — HARD md5 gate):
//   editor.html, editor.js, game.js, render/render.js, sim/customassets.js, sim/mapdoc.js
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD    version.json served (reported); served touched files md5 == HEAD (hard gate).
//  UPLOAD   ingestAsset loads 3 data-URL images; non-image ignored w/o crash; count reported.
//  PALETTE  assets appear grouped by first-level folder w/ thumbnails.
//  STAMP    stampCustom places deco kind:"custom"; editor draws it (canvas).
//  EXPORT   docToMapDoc(true) embeds custom props + md.assets ONLY referenced ids.
//  ROUND-TRIP docFromMapDoc(docToMapDoc(doc,true)) preserves custom props + assets.
//  PERSIST  reload editor ⇒ IndexedDB reingest restores the palette.
//  GAME     ?map=local ⇒ fromMapDoc, customImgReady turns true, 0 errors, ≥55 fps.
//  BYTE-SAFE no custom props ⇒ docToMapDoc(true)===docToMapDoc(); no ?map ⇒ fromMapDoc=false.
//  QUOTA    over-cap asset rejected (null), no crash, palette unchanged.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["editor.html", "editor.js", "game.js", "render/render.js", "sim/customassets.js", "sim/mapdoc.js"];
const OUT = "shots/cas1718"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// canvas-baked solid-colour PNG data URL (built inside the page)
const MKPNG = `(color,sz)=>{const c=document.createElement('canvas');c.width=c.height=sz;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,sz,sz);return c.toDataURL('image/png');}`;

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

// Attach error listeners; filter the browser's automatic favicon 404 + generic
// "Failed to load resource" line (benign — real files are md5-gated).
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

async function freshSaveOnly(page) {
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} });
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- BUILD gate ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("BUILD/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`BUILD/md5/${f.split("/").pop()}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ======================================================================
    // EDITOR — boot clean; BYTE-SAFE baseline; UPLOAD + PALETTE + QUOTA;
    //          STAMP + EXPORT (referenced-only) + ROUND-TRIP; write bridge.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch (e) {} });
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });

      // BYTE-SAFE baseline + QA hooks present (AC7/AC8)
      const base = await page.evaluate(() => {
        window.__editor.setDoc(window.__editor.docFromMapDoc(window.__editor.makeSeedMapDoc()));
        const plain = JSON.stringify(window.__editor.docToMapDoc());
        const embed = JSON.stringify(window.__editor.docToMapDoc(true));
        const md = window.__editor.docToMapDoc(true);
        return { plain, embed, hasAssets: "assets" in md,
          hooks: ["ingestAsset", "listAssets", "stampCustom"].every(k => typeof window.__editor[k] === "function"),
          canvasDrawn: (document.getElementById("c") || {}).width > 0 };
      });
      gate("EDITOR/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("EDITOR/qa-hooks", base.hooks, "ingestAsset/listAssets/stampCustom");
      gate("EDITOR/canvas-drawn", base.canvasDrawn, "canvas sized");
      gate("BYTE-SAFE/seed-no-assets", !base.hasAssets, "seed (no custom props) ⇒ no md.assets key");
      gate("BYTE-SAFE/embed==plain", base.plain === base.embed, "docToMapDoc()===docToMapDoc(true) w/o custom props");

      // UPLOAD (3 images across folders) + non-image ignore + PALETTE grouping
      const up = await page.evaluate(async (mkpngSrc) => {
        const mkPng = eval(mkpngSrc);
        const r1 = await window.__editor.ingestAsset("mobs/goblin.png", mkPng("#4caf50", 16));
        const r2 = await window.__editor.ingestAsset("mobs/slime.png", mkPng("#2196f3", 12));
        const r3 = await window.__editor.ingestAsset("deco/rune.png", mkPng("#e91e63", 20));
        let sawError = false, r5 = null;
        try { r5 = await window.__editor.ingestAsset("notes.txt", "data:text/plain;base64,aGVsbG8="); } catch (e) { sawError = true; }
        const list = window.__editor.listAssets();
        const groups = {}; for (const a of list) groups[a.group] = (groups[a.group] || 0) + 1;
        const sw = document.querySelectorAll("#assetGroups .asw").length;
        const heads = Array.from(document.querySelectorAll("#assetGroups .ghead")).map(n => n.textContent);
        const thumbs = document.querySelectorAll("#assetGroups .asw img").length;
        return { n: [r1, r2, r3].filter(Boolean).length, list: list.length, groups, sw, heads, thumbs, crashOnBad: sawError };
      }, MKPNG);
      gate("UPLOAD/3-images", up.n === 3, `ingested ${up.n}/3`);
      gate("UPLOAD/non-image-safe", !up.crashOnBad, "non-image ignored w/o throw");
      gate("PALETTE/count", up.list === 3, `palette holds ${up.list}`);
      gate("PALETTE/grouped-by-folder", up.groups.mobs === 2 && up.groups.deco === 1, JSON.stringify(up.groups));
      gate("PALETTE/dom-thumbs", up.sw === 3 && up.thumbs === 3, `${up.sw} swatches / ${up.thumbs} thumbs`);

      // QUOTA: an over-cap asset is rejected (null), no crash, palette unchanged
      const cap = await page.evaluate(async () => {
        const big = "data:image/png;base64," + "A".repeat(56 * 1024 * 1024);
        let threw = false, rec = null;
        try { rec = await window.__editor.ingestAsset("huge/over.png", big); } catch (e) { threw = true; }
        return { rejected: rec === null, threw, still: window.__editor.listAssets().length };
      });
      gate("QUOTA/over-cap-rejected", cap.rejected && !cap.threw, "returned null, no throw");
      gate("QUOTA/palette-unchanged", cap.still === 3, `still ${cap.still}`);

      // STAMP + EXPORT (referenced-only) + ROUND-TRIP
      const rt = await page.evaluate(() => {
        const before = window.__editor.doc.entities.props.length;
        const placed = window.__editor.stampCustom("mobs/goblin.png", 300, 400);
        const after = window.__editor.doc.entities.props.length;
        const md = window.__editor.docToMapDoc(true);
        const refIds = md.assets ? Object.keys(md.assets) : [];
        const back = window.__editor.docFromMapDoc(md);
        const cp = back.entities.props.find(p => p.kind === "custom");
        return { placedOk: !!placed && placed.kind === "custom" && placed.asset === "mobs/goblin.png",
          grew: after === before + 1, hasAssets: !!md.assets, refIds,
          onlyReferenced: refIds.length === 1 && refIds[0] === "mobs/goblin.png",
          rtPreserved: !!cp && cp.asset === "mobs/goblin.png" && cp.w > 0 && cp.h > 0,
          embedHasDataUrl: !!(md.assets && md.assets["mobs/goblin.png"] && md.assets["mobs/goblin.png"].dataUrl) };
      });
      gate("STAMP/custom-prop", rt.placedOk && rt.grew, "kind:custom deco placed");
      gate("EXPORT/embed-dataurl", rt.hasAssets && rt.embedHasDataUrl, "md.assets carries referenced dataUrl");
      gate("EXPORT/only-referenced", rt.onlyReferenced, `md.assets ids = ${rt.refIds.join(",")}`);
      gate("ROUND-TRIP/preserves-custom", rt.rtPreserved, "docFromMapDoc(docToMapDoc(doc,true)) keeps custom prop");
      await page.screenshot({ path: `${OUT}/${label}-editor-stamp.png` });

      // write the edited map (with embed) to the bridge for the game step
      await page.evaluate(() => {
        const md = window.__editor.docToMapDoc(true); md.name = "QA-1718 Custom";
        localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md));
      });
      await page.close();
    }

    // ======================================================================
    // PERSIST — reload editor ⇒ IndexedDB reingest restores the palette.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });
      await page.waitForFunction("window.__editor.listAssets().length>=3", { timeout: 10000 }).catch(() => {});
      const persist = await page.evaluate(() => ({ list: window.__editor.listAssets().length,
        sw: document.querySelectorAll("#assetGroups .asw").length }));
      gate("PERSIST/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("PERSIST/indexeddb-reingest", persist.list === 3, `restored ${persist.list}/3 after reload`);
      gate("PERSIST/palette-rebuilt", persist.sw === 3, `${persist.sw} swatches`);
      // real "Play" re-embeds referenced assets into the bridge (autosave dropped md.assets by design)
      const rebridge = await page.evaluate(() => {
        const md = window.__editor.docToMapDoc(true); md.name = "QA-1718 Custom";
        localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md));
        return { embedded: !!md.assets, refs: md.assets ? Object.keys(md.assets) : [] };
      });
      gate("PERSIST/play-reembeds", rebridge.embedded && rebridge.refs.includes("mobs/goblin.png"), `refs=${rebridge.refs.join(",")}`);
      await page.close();
    }

    // ======================================================================
    // GAME — ?map=local reads md.assets; custom Image decodes; 0 errors; 60fps.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page); await freshSaveOnly(page);
      await page.goto(`${BASE}/index.html?map=local&dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("GAME/fromMapDoc", mi.fromMapDoc === true, `name="${mi.name}"`);
      gate("GAME/customImgReady-hook", (await page.evaluate(() => typeof window.__dev.customImgReady)) === "function", "present");
      await page.evaluate(() => window.__dev.customImgReady("mobs/goblin.png")); // lazy build + async decode
      const ready = await page.waitForFunction("window.__dev.customImgReady('mobs/goblin.png')===true", { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);
      gate("GAME/custom-image-decoded", ready, "uploaded sprite drawable in-game");
      const missing = await page.evaluate(() => window.__dev.customImgReady("does/not/exist.png"));
      gate("GAME/unknown-asset-safe", missing === false, "unknown id ⇒ false, no crash");
      gate("GAME/render-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      const fps = await page.evaluate(() => new Promise(res => {
        let f = 0, t0 = performance.now();
        const cb = () => { f++; if (performance.now() - t0 < 1000) requestAnimationFrame(cb); else res(Math.round(f * 1000 / (performance.now() - t0))); };
        requestAnimationFrame(cb);
      }));
      gate("PERF/60fps", fps >= 55, `fps=${fps}`);
      await page.screenshot({ path: `${OUT}/${label}-game-custom.png` });
      await page.close();
    }

    // ======================================================================
    // BYTE-SAFE — no ?map ⇒ default world untouched (fromMapDoc=false).
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
      await page.goto(`${BASE}/index.html?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("BYTE-SAFE/no-map-boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("BYTE-SAFE/no-map-not-fromMapDoc", mi.fromMapDoc === false, `fromMapDoc=${mi.fromMapDoc}`);
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
console.log("=== CAS-1718 LIVE QA — subir carpeta de assets (custom) round-trip ===");
console.log("HEAD md5:", JSON.stringify(headHashes, null, 0));

const results = [];
results.push(["desktop", await runOnce("desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }, headHashes)]);
results.push(["mobile",  await runOnce("mobile",  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, headHashes)]);

console.log("\n=== SUMMARY ===");
let totFail = 0, totPass = 0;
for (const [label, r] of results) { console.log(`  ${label}: ${r.pass} passed, ${r.fail} failed`); totFail += r.fail; totPass += r.pass; }
console.log(`\nTOTAL ${totPass} passed, ${totFail} failed → ${totFail ? "FAIL" : "PASS"}`);
process.exit(totFail ? 1 : 0);
