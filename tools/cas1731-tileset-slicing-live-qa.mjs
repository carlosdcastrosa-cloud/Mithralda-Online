// ===========================================================================
// CAS-1731 — LIVE QA: tileset slicing + cell selector (round-trip + juego).
// Verifies the CAS-1729 build (deployed by CAS-1730) on the canonical gh-pages
// URL. PASS x2 (desktop + mobile). ADDITIVE layer over CAS-1716 custom-assets.
//
//   node tools/cas1731-tileset-slicing-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Feature = cut an imported tileset into a grid (Tiled-style) + pick a single
// CELL, stamp that sub-rect (not the whole sheet), persist the slice per-tileset
// in IndexedDB, round-trip via md.assets (sheet embedded once, prop carries the
// sub-cell rect), and render only that cell in the game (9-arg blit). Everything
// OPTIONAL ⇒ no cell = byte-identical to CAS-1716.
//
// Deploy set (CAS-1730 overlay = exactly these 6 runtime blobs — HARD md5 gate):
//   editor.html, editor.js, game.js, render/render.js, sim/mapdoc.js, sim/sim.js
//
// Two parts:
//   A) PURE (DOM-free) — cell geometry (autoSlice/sliceGrid/cellRect) + the
//      mapdoc docToWorld sub-rect data-flow. Runs against local HEAD sim/mapdoc.js
//      whose bytes are md5-gated == live, so it validates the SHIPPED logic.
//   B) LIVE (headless Chromium against gh-pages) — editor slicing UI/hooks +
//      persist across reload + game renders the cell + byte-safe default world.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { normSlice, sliceGrid, cellRect, autoSlice, buildWorldFromMapDoc } from "../sim/mapdoc.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["editor.html", "editor.js", "game.js", "render/render.js", "sim/mapdoc.js", "sim/sim.js"];
const OUT = "shots/cas1731"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A 2-colour tileset PNG data URL: cols vertical cells (distinct colours) so a
// picked cell differs from its neighbours; and a single solid sprite.
const MKTILE = `(cols,cell)=>{const c=document.createElement('canvas');c.width=cols*cell;c.height=cell;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835'];for(let i=0;i<cols;i++){x.fillStyle=cl[i%cl.length];x.fillRect(i*cell,0,cell,cell);}return c.toDataURL('image/png');}`;
const MKPNG  = `(color,sz)=>{const c=document.createElement('canvas');c.width=c.height=sz;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,sz,sz);return c.toDataURL('image/png');}`;

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

// benign browser noise filter (favicon 404 etc.) — real files are md5-gated.
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
const freshSaveOnly = (page) =>
  page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} });

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
    // EDITOR — import tileset, auto-slice grid, select+stamp a CELL, whole-sheet
    //          stamp of a single sprite, export (referenced-only) + round-trip,
    //          set explicit slice for the persist step, write the game bridge.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch (e) {} });
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });

      // slice hooks + panel DOM present
      const dom = await page.evaluate(() => ({
        hooks: ["setSlice", "sliceGrid", "cellRect", "selectCell", "stampCell", "clearCell", "sliceOf", "selectTool"].every(k => typeof window.__editor[k] === "function"),
        hasCurCell: "curCell" in window.__editor,
        panel: !!document.getElementById("slicePanel"),
        sliceCanvas: !!document.getElementById("sliceCanvas"),
        inputs: ["slTw", "slTh", "slMargin", "slSpacing", "slOx", "slOy"].every(id => !!document.getElementById(id)),
      }));
      gate("EDITOR/slice-hooks", dom.hooks && dom.hasCurCell, "setSlice/selectCell/stampCell/curCell present");
      gate("EDITOR/slice-panel-dom", dom.panel && dom.sliceCanvas && dom.inputs, "#slicePanel + #sliceCanvas + 6 grid inputs");

      // import a 96×32 tileset (3 cells @32) + a 16×16 single sprite; auto-detect grid; panel opens
      const grid = await page.evaluate(async (mktileSrc, mkpngSrc) => {
        const mkTile = eval(mktileSrc), mkPng = eval(mkpngSrc);
        await window.__editor.ingestAsset("tiles/set.png", mkTile(3, 32)); // 96×32
        await window.__editor.ingestAsset("deco/gem.png", mkPng("#8e24aa", 16));
        const auto = window.__editor.sliceOf("tiles/set.png");
        const g0 = window.__editor.sliceGrid("tiles/set.png");
        window.__editor.selectTool("stamp");
        window.__editor.selectAsset("tiles/set.png");
        const panelShown = getComputedStyle(document.getElementById("slicePanel")).display !== "none";
        return { auto, g0, panelShown };
      }, MKTILE, MKPNG);
      gate("SLICE/auto-detect-32", grid.auto && grid.auto.tw === 32, `auto tw=${grid.auto && grid.auto.tw}`);
      gate("SLICE/grid-3x1", grid.g0 && grid.g0.cols === 3 && grid.g0.rows === 1, `grid ${grid.g0 && grid.g0.cols}×${grid.g0 && grid.g0.rows}`);
      gate("SLICE/panel-opens", grid.panelShown, "panel visible when tileset selected in Sello tool");

      // select a cell ⇒ brush; change cell ⇒ brush moves
      const cell = await page.evaluate(() => {
        const c2 = window.__editor.selectCell("tiles/set.png", 2, 0);
        const b2 = window.__editor.curCell;
        const c0 = window.__editor.selectCell("tiles/set.png", 0, 0);
        const b0 = window.__editor.curCell;
        return { c2, b2, c0, b0 };
      });
      gate("SLICE/selectCell-sx64", cell.c2 && cell.c2.sx === 64 && cell.c2.sw === 32, `selectCell(2,0) sx=${cell.c2 && cell.c2.sx}`);
      gate("SLICE/brush-moves", cell.b2 && cell.b2.col === 2 && cell.b0 && cell.b0.col === 0, "active cell brush follows selection");

      // stamp the sliced cell (sub-rect) + a whole-sheet stamp of the single sprite
      const stamp = await page.evaluate(() => {
        const sliced = window.__editor.stampCell("tiles/set.png", 1, 0, 300, 400); // middle cell
        window.__editor.clearCell();
        const whole = window.__editor.stampCustom("deco/gem.png", 350, 400);
        return { sliced, whole };
      });
      gate("STAMP/cell-sub-rect", stamp.sliced && stamp.sliced.sw === 32 && stamp.sliced.sx === 32 && stamp.sliced.w === 32 && stamp.sliced.h === 32,
        `sliced prop sx=${stamp.sliced && stamp.sliced.sx} sw=${stamp.sliced && stamp.sliced.sw}`);
      gate("STAMP/whole-sheet-nosubrect", stamp.whole && stamp.whole.sw === undefined, "whole-sheet stamp carries NO sub-rect (byte-safe path)");

      // export embeds the SHEET once (referenced-only, no slice cfg); round-trip preserves sub-rect
      const rt = await page.evaluate(() => {
        const md = window.__editor.docToMapDoc(true);
        const refIds = md.assets ? Object.keys(md.assets) : [];
        const slicedProp = md.entities.props.find(p => p.kind === "custom" && p.asset === "tiles/set.png");
        const back = window.__editor.docFromMapDoc(md);
        const bp = back.entities.props.find(p => p.asset === "tiles/set.png" && p.kind === "custom");
        const assetKeys = md.assets ? Object.keys(md.assets["tiles/set.png"]).sort() : [];
        return { refIds, slicedProp, bpHasRect: !!bp && bp.sw === 32 && bp.sx === 32, assetKeys };
      });
      gate("EXPORT/2-sheets-once", rt.refIds.length === 2 && rt.refIds.includes("tiles/set.png"), `refs=${rt.refIds.join(",")}`);
      gate("EXPORT/prop-carries-cell", rt.slicedProp && rt.slicedProp.sw === 32 && rt.slicedProp.sx === 32, "export prop keeps sub-cell rect");
      gate("ROUND-TRIP/preserves-cell", rt.bpHasRect, "docFromMapDoc(docToMapDoc) keeps the cell sub-rect");
      gate("EXPORT/assets-no-slice", eq(rt.assetKeys, ["dataUrl", "name", "path", "type"]), `md.assets keys=${rt.assetKeys.join(",")} (no slice)`);

      // set explicit slice cfg (persist) + write bridge for the game step
      await page.evaluate(() => {
        window.__editor.setSlice("tiles/set.png", { tw: 32, th: 32, margin: 0, spacing: 0, ox: 0, oy: 0 });
        const md = window.__editor.docToMapDoc(true); md.name = "QA-1731 Slice";
        localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md));
      });
      gate("EDITOR/slice-flow-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      await page.screenshot({ path: `${OUT}/${label}-editor-slice.png` });
      await page.close();
    }

    // ======================================================================
    // PERSIST — reload editor ⇒ IndexedDB reingest restores assets AND the
    //           per-tileset slice config; re-embed bridge for the game step.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });
      await page.waitForFunction("window.__editor.listAssets().length>=2", { timeout: 10000 }).catch(() => {});
      const persist = await page.evaluate(() => ({
        n: window.__editor.listAssets().length,
        slice: window.__editor.sliceOf("tiles/set.png"),
      }));
      gate("PERSIST/boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("PERSIST/assets-reingest", persist.n >= 2, `restored ${persist.n}/2 assets after reload`);
      gate("PERSIST/slice-config", persist.slice && persist.slice.tw === 32 && persist.slice.margin === 0, "tileset slice cfg persisted across reload");
      await page.evaluate(() => {
        const md = window.__editor.docToMapDoc(true); md.name = "QA-1731 Slice";
        localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md));
      });
      await page.close();
    }

    // ======================================================================
    // GAME — ?map=local renders the CELL (9-arg sub-rect), not the sheet.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page); await freshSaveOnly(page);
      await page.goto(`${BASE}/index.html?map=local&dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("GAME/fromMapDoc", mi.fromMapDoc === true, `name="${mi.name}"`);
      const deco = await page.evaluate(() => window.__dev.customDeco());
      const sliced = deco.find(d => d.asset === "tiles/set.png");
      const whole = deco.find(d => d.asset === "deco/gem.png");
      gate("GAME/cell-in-world", sliced && sliced.sliced === true && sliced.sw === 32 && sliced.sx === 32, `sliced deco sx=${sliced && sliced.sx} sw=${sliced && sliced.sw}`);
      gate("GAME/whole-no-subrect", whole && whole.sliced === false && whole.sw === undefined, "whole-sheet custom prop has NO sub-rect");
      await page.evaluate(() => window.__dev.customImgReady("tiles/set.png"));
      const ready = await page.waitForFunction("window.__dev.customImgReady('tiles/set.png')===true", { timeout: 15000, polling: 200 }).then(() => true).catch(() => false);
      gate("GAME/cell-image-decoded", ready, "tileset Image decoded & drawable (cell blit path)");
      gate("GAME/render-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      const fps = await page.evaluate(() => new Promise(res => {
        let f = 0, t0 = performance.now();
        const cb = () => { f++; if (performance.now() - t0 < 1000) requestAnimationFrame(cb); else res(Math.round(f * 1000 / (performance.now() - t0))); };
        requestAnimationFrame(cb);
      }));
      gate("PERF/60fps", fps >= 55, `fps=${fps}`);
      await page.screenshot({ path: `${OUT}/${label}-game-cell.png` });
      await page.close();
    }

    // ======================================================================
    // BYTE-SAFE — no ?map ⇒ default world untouched (no sliced deco leaks in).
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
      await page.goto(`${BASE}/index.html?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      const deco = await page.evaluate(() => window.__dev.customDeco());
      gate("BYTE-SAFE/no-map-boot-clean", errs.length === 0, errs.length ? errs[0] : "no errors");
      gate("BYTE-SAFE/no-map-not-fromMapDoc", mi.fromMapDoc === false, `fromMapDoc=${mi.fromMapDoc}`);
      gate("BYTE-SAFE/no-custom-deco", Array.isArray(deco) && deco.length === 0, `default world custom deco=${deco.length}`);
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
console.log("=== CAS-1731 LIVE QA — tileset slicing + cell selector (round-trip + juego) ===");
console.log("HEAD md5:", JSON.stringify(headHashes, null, 0));

// PART A — pure cell geometry + mapdoc data-flow (bytes md5-gated == live).
{
  let ok = 0, bad = 0; const A = (c, m) => { console.log(`  ${c ? "PASS" : "FAIL"}  GEOM/${m}`); c ? ok++ : bad++; };
  A(eq(autoSlice(64, 64), { tw: 32, th: 32, margin: 0, spacing: 0, ox: 0, oy: 0 }), "autoSlice 64×64 ⇒ 32px cells");
  A(eq(autoSlice(48, 48), { tw: 16, th: 16, margin: 0, spacing: 0, ox: 0, oy: 0 }), "autoSlice 48×48 ⇒ 16px cells");
  A(autoSlice(40, 30) === null, "autoSlice 40×30 (no clean grid) ⇒ null (whole sheet)");
  const s = normSlice({ tw: 32, th: 32 });
  A(eq(sliceGrid(s, 96, 32), { cols: 3, rows: 1, tw: 32, th: 32 }), "sliceGrid 96×32 @32 ⇒ 3×1");
  A(eq(cellRect(s, 2, 0), { sx: 64, sy: 0, sw: 32, sh: 32 }), "cellRect (2,0) ⇒ sx64");
  const sp = normSlice({ tw: 32, th: 32, margin: 2, spacing: 2 });
  A(sliceGrid(sp, 100, 32).cols === 2 && cellRect(sp, 1, 0).sx === 36, "margin+spacing math (cols=2, sx=36)");
  A(cellRect(normSlice({ tw: 32, th: 32, ox: 4 }), 0, 0).sx === 4, "ox offset honoured (sx=4)");
  const mk = (props) => ({ v: 1, name: "t", w: 32, h: 32, terrain: { rle: [0, 32 * 32] }, zones: [], entities: { npcs: [], chests: [], fragments: [], portals: [], props } });
  const wS = buildWorldFromMapDoc(mk([{ x: 100, y: 100, kind: "custom", asset: "a.png", sx: 32, sy: 0, sw: 32, sh: 32, w: 32, h: 32 }]));
  const dS = wS.deco.find(d => d.kind === "custom");
  A(dS && dS.sx === 32 && dS.sw === 32, "docToWorld copies sub-rect for a sliced prop");
  const wP = buildWorldFromMapDoc(mk([{ x: 100, y: 100, kind: "custom", asset: "a.png", w: 48, h: 64 }]));
  const dP = wP.deco.find(d => d.kind === "custom");
  A(dP && dP.sw === undefined, "byte-safe: plain custom prop ⇒ deco has NO sub-rect");
  console.log(`  GEOM: ${ok} passed, ${bad} failed`);
  if (bad) process.exitCode = 1;
}

const results = [];
results.push(["desktop", await runOnce("desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }, headHashes)]);
results.push(["mobile", await runOnce("mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, headHashes)]);

console.log("\n=== SUMMARY ===");
let totFail = 0, totPass = 0;
for (const [label, r] of results) { console.log(`  ${label}: ${r.pass} passed, ${r.fail} failed`); totFail += r.fail; totPass += r.pass; }
console.log(`\nTOTAL ${totPass} passed, ${totFail} failed → ${totFail ? "FAIL" : "PASS"}`);
process.exit(totFail ? 1 : 0);
