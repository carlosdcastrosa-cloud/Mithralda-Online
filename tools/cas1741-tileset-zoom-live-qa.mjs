// ===========================================================================
// CAS-1741 — LIVE QA: zoom en la cuadrícula de tileset (picker) + coord fix.
// Verifies the CAS-1739 build (deployed by CAS-1740) on the canonical gh-pages
// URL. PASS x2 (desktop + mobile). ADDITIVE picker-zoom layer over CAS-1729.
//
//   node tools/cas1741-tileset-zoom-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Feature = zoom in/out on the right-hand tileset picker (buttons +/−/fit,
// mouse wheel, keyboard) with a scrollable natural-size canvas (= pan) and the
// coordinate fix (dropping #sliceCanvas{width:100%} so clicks map dead-on at
// any zoom). Zoom is PURE presentation — curCell / the stamp sub-rect / export
// stay in image px ⇒ round-trip + game byte-identical at sliceZoom==1.
//
// Deploy set (CAS-1740 overlay = exactly these 2 runtime blobs — HARD md5 gate):
//   editor.html, editor.js   (sim/mapdoc.js + render.js NOT touched)
//
// Covers AC-ZOOM / AC-MAP-EXACT / AC-INVARIANT / AC-ADDITIVE / AC-HOOKS /
// AC-POLISH + REG (game boots clean, default world untouched).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["editor.html", "editor.js"];
const OUT = "shots/cas1741"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// cols×rows tileset PNG, each cell a distinct colour so a mismapped click is catchable.
const MKGRID = `(cols,rows,cell)=>{const c=document.createElement('canvas');c.width=cols*cell;c.height=rows*cell;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#d81b60','#00897b','#5e35b1'];for(let r=0;r<rows;r++)for(let i=0;i<cols;i++){x.fillStyle=cl[(r*cols+i)%cl.length];x.fillRect(i*cell,r*cell,cell,cell);}return c.toDataURL('image/png');}`;

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

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- BUILD gate (live == HEAD) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("BUILD/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`BUILD/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ======================================================================
    // EDITOR — zoom hooks/controls, click-mapping sweep, invariants, additive.
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch (e) {} });
      await page.goto(`${BASE}/editor.html`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__editor && window.__editor.doc", { timeout: 20000 });

      // AC-HOOKS + DOM present (viewport wrapper, zoom controls, % label, coord fix).
      const dom = await page.evaluate(() => ({
        hooks: ["setSliceZoom", "sliceZoomFit", "pickAtCanvasPx"].every(k => typeof window.__editor[k] === "function"),
        getZoom: "sliceZoom" in window.__editor && typeof window.__editor.sliceZoom === "number",
        view: !!document.getElementById("sliceView"),
        lbl: !!document.getElementById("sliceZoomLbl"),
        btns: ["slZoomIn", "slZoomOut", "slZoomFit"].every(id => !!document.getElementById(id)),
        noStretch: getComputedStyle(document.getElementById("sliceCanvas")).width !== "100%",
      }));
      gate("AC-HOOKS/exposed", dom.hooks && dom.getZoom, "setSliceZoom/sliceZoomFit/get sliceZoom/pickAtCanvasPx");
      gate("AC-ZOOM/dom", dom.view && dom.lbl && dom.btns, "#sliceView viewport + %-label + −/＋/Ajustar buttons");
      gate("AC-MAP-EXACT/no-stretch", dom.noStretch, "#sliceCanvas not stretched by width:100% CSS");

      // import a 4×3 @32 tileset (128×96) + open the picker in the Sello (stamp) tool.
      const g = await page.evaluate(async (mk) => {
        const mkGrid = eval(mk);
        await window.__editor.ingestAsset("tiles/big.png", mkGrid(4, 3, 32));   // 128×96
        window.__editor.selectTool("stamp");
        window.__editor.selectAsset("tiles/big.png");
        const grid = window.__editor.sliceGrid("tiles/big.png");
        const shown = getComputedStyle(document.getElementById("slicePanel")).display !== "none";
        return { grid, shown, zoom0: window.__editor.sliceZoom };
      }, MKGRID);
      gate("AC-ZOOM/sliced-4x3", g.grid && g.grid.cols === 4 && g.grid.rows === 3, `grid ${g.grid && g.grid.cols}×${g.grid && g.grid.rows}`);
      gate("AC-ZOOM/panel-opens", g.shown, "picker panel opens for tileset in Sello tool");
      gate("AC-POLISH/opens-at-fit", g.zoom0 === 1, `sliceZoom==1 at open (got ${g.zoom0})`);

      // AC-ZOOM: setSliceZoom grows the canvas + updates the % label; clamp is [0.5,12].
      const zoom = await page.evaluate(() => {
        const cvs = document.getElementById("sliceCanvas"), lbl = document.getElementById("sliceZoomLbl");
        const w1 = cvs.width, z1 = window.__editor.sliceZoom;
        const z3 = window.__editor.setSliceZoom(3); const w3 = cvs.width, lbl3 = lbl.textContent;
        const zHi = window.__editor.setSliceZoom(100); const wHi = cvs.width;   // clamp high
        const zLo = window.__editor.setSliceZoom(0.01);                        // clamp low
        window.__editor.sliceZoomFit(); const zFit = window.__editor.sliceZoom, wFit = cvs.width;
        const cssW = parseInt(cvs.style.width, 10), cssH = parseInt(cvs.style.height, 10);
        return { w1, z1, z3, w3, lbl3, zHi, wHi, zLo, zFit, wFit, cssW, cssH, bufW: cvs.width, bufH: cvs.height };
      });
      gate("AC-ZOOM/grows", zoom.z1 === 1 && zoom.z3 === 3 && zoom.w3 > zoom.w1, `${zoom.w1}px→${zoom.w3}px @3×`);
      gate("AC-ZOOM/label", zoom.lbl3 === "300%", `%-label tracks zoom (got ${zoom.lbl3})`);
      gate("AC-ZOOM/clamp", zoom.zHi <= 12 && zoom.zHi >= 1 && zoom.zLo === 0.5, `clamp [0.5,12] hi=${zoom.zHi} lo=${zoom.zLo}`);
      gate("AC-ZOOM/fit", zoom.zFit === 1 && zoom.wFit === zoom.w1, "sliceZoomFit returns canvas to base size");
      gate("AC-MAP-EXACT/css==buffer", zoom.cssW === zoom.bufW && zoom.cssH === zoom.bufH, `CSS size == backing store (${zoom.cssW}==${zoom.bufW})`);

      // AC-MAP-EXACT: at several zoom levels, the click-map resolves the correct cell for a
      // full sweep of ALL cells (centre of each cell in buffer px must pick that col/row).
      const sweep = await page.evaluate(() => {
        const cvs = document.getElementById("sliceCanvas");
        const grid = window.__editor.sliceGrid("tiles/big.png");
        const out = [];
        for (const z of [1, 2.5, 6]) {
          window.__editor.setSliceZoom(z);
          const ds = cvs._ds; let miss = 0, tot = 0;
          for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
            const bx = (c * 32 + 16) * ds, by = (r * 32 + 16) * ds;   // cell centre in buffer px
            const hit = window.__editor.pickAtCanvasPx(bx, by);
            tot++; if (!hit || hit.col !== c || hit.row !== r) miss++;
          }
          out.push({ z: Math.round(window.__editor.sliceZoom * 100) / 100, ds: Math.round(ds * 1000) / 1000, miss, tot });
        }
        window.__editor.sliceZoomFit();
        return out;
      });
      for (const s of sweep) gate(`AC-MAP-EXACT/sweep@${s.z}x`, s.miss === 0, `${s.miss}/${s.tot} miss (ds=${s.ds})`);

      // AC-MAP-EXACT (end-to-end): a real dispatched pointerdown+up at a cell centre selects
      // that cell — proves the wired handler (offsetX/ds) agrees at a non-1 zoom.
      const realClick = await page.evaluate(() => {
        window.__editor.setSliceZoom(4);
        const cvs = document.getElementById("sliceCanvas"), ds = cvs._ds, rect = cvs.getBoundingClientRect();
        const col = 3, row = 2, bx = (col * 32 + 16) * ds, by = (row * 32 + 16) * ds;   // last cell centre
        const at = { clientX: rect.left + bx, clientY: rect.top + by, bubbles: true, pointerId: 1 };
        cvs.dispatchEvent(new PointerEvent("pointerdown", at));
        cvs.dispatchEvent(new PointerEvent("pointerup", at));
        const cc = window.__editor.curCell;
        return cc;    // leave zoom @4× for the evidence screenshot below
      });
      gate("AC-MAP-EXACT/real-click@4x", realClick && realClick.col === 3 && realClick.row === 2 && realClick.sx === 96 && realClick.sy === 64,
        `click@4× → cell(3,2) sx${realClick && realClick.sx}/sy${realClick && realClick.sy}`);

      // EVIDENCE: screenshot the zoomed picker (@4×, cell(3,2) selected).
      const shot = `${OUT}/${label}-zoom4x.png`;
      try { const el = await page.$("#slicePanel"); if (el) await el.screenshot({ path: shot }); else await page.screenshot({ path: shot }); }
      catch { await page.screenshot({ path: shot }); }
      gate("EVIDENCE/zoom-screenshot", fs.existsSync(shot), shot);
      await page.evaluate(() => window.__editor.sliceZoomFit());

      // AC-INVARIANT: curCell sub-rect (image px) is identical whichever zoom it was picked at.
      const inv = await page.evaluate(() => {
        window.__editor.setSliceZoom(1); const a = window.__editor.selectCell("tiles/big.png", 1, 1);
        window.__editor.setSliceZoom(7); const b = window.__editor.selectCell("tiles/big.png", 1, 1);
        window.__editor.sliceZoomFit();
        return { a, b };
      });
      gate("AC-INVARIANT/curCell", inv.a && inv.b && eq(inv.a, inv.b), "curCell sub-rect image-px, identical across zoom");

      // AC-ADDITIVE: stamping the same cell at zoom 1 vs 5 yields an identical sub-rect prop.
      const stamp = await page.evaluate(() => {
        window.__editor.setSliceZoom(1); const p1 = window.__editor.stampCell("tiles/big.png", 2, 1, 300, 400);
        window.__editor.setSliceZoom(5); const p2 = window.__editor.stampCell("tiles/big.png", 2, 1, 340, 400);
        window.__editor.sliceZoomFit();
        return { p1: { sx: p1.sx, sy: p1.sy, sw: p1.sw, sh: p1.sh }, p2: { sx: p2.sx, sy: p2.sy, sw: p2.sw, sh: p2.sh } };
      });
      gate("AC-ADDITIVE/stamp-zoom-indep", eq(stamp.p1, stamp.p2) && stamp.p1.sx === 64 && stamp.p1.sy === 32, `sx${stamp.p1.sx}/sy${stamp.p1.sy} @ zoom 1 & 5`);

      // AC-ADDITIVE: export MapDoc, zoom around, re-export → byte-identical (zoom view-only).
      const additive = await page.evaluate(() => {
        const before = JSON.stringify(window.__editor.docToMapDoc(true));
        window.__editor.setSliceZoom(9); window.__editor.setSliceZoom(0.5); window.__editor.sliceZoomFit();
        const after = JSON.stringify(window.__editor.docToMapDoc(true));
        return { same: before === after, len: before.length };
      });
      gate("AC-ADDITIVE/export-byte-id", additive.same, `export identical before/after zoom (${additive.len} chars)`);

      // AC-POLISH: opening a DIFFERENT tileset resets the picker view to fit.
      const polish = await page.evaluate(async (mk) => {
        const mkGrid = eval(mk);
        window.__editor.setSliceZoom(8);                    // leave a weird zoom on tiles/big.png
        await window.__editor.ingestAsset("tiles/two.png", mkGrid(2, 2, 32));
        window.__editor.selectAsset("tiles/two.png");       // opens the panel for a new tileset
        return window.__editor.sliceZoom;
      }, MKGRID);
      gate("AC-POLISH/reset-on-switch", polish === 1, `switching tileset resets zoom to fit (got ${polish})`);

      gate("EDITOR/clean", errs.length === 0, `errs=${errs.length}${errs.length ? ": " + errs[0] : ""}`);
      await page.close();
    }

    // ======================================================================
    // REG — game still boots clean (editor is standalone; default world untouched).
    // ======================================================================
    {
      const page = await browser.newPage(); await page.setViewport(viewport);
      const errs = watch(page);
      await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} });
      await page.goto(`${BASE}/index.html?dev`, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 25000 });
      const mi = await page.evaluate(() => window.__dev.mapInfo());
      gate("REG/default-world", mi.fromMapDoc === false, "default game world untouched (editor-only change)");
      // rough fps probe: count rAF ticks over ~1s
      const fps = await page.evaluate(() => new Promise(res => {
        let n = 0; const t0 = performance.now();
        const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); };
        requestAnimationFrame(tick);
      }));
      gate("REG/fps>=50", fps >= 50, `${fps} rAF ticks in ~1s`);
      gate("REG/clean", errs.length === 0, `errs=${errs.length}${errs.length ? ": " + errs[0] : ""}`);
      await page.close();
    }
  } catch (e) {
    console.log("  FAIL  EXCEPTION  " + (e && e.stack || e)); fail++;
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: md5 HEAD baseline, then desktop + mobile passes (browser per pass) ----
const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
console.log(`CAS-1741 LIVE QA — tileset picker zoom vs ${BASE}`);
console.log("HEAD md5:", FILES.map(f => `${f}=${headHashes[f].slice(0, 8)}`).join("  "));

const results = [];
results.push(["desktop", await runOnce("desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }, headHashes)]);
results.push(["mobile", await runOnce("mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, headHashes)]);

let totPass = 0, totFail = 0;
console.log("\n=== CAS-1741 tileset-zoom LIVE QA summary ===");
for (const [name, r] of results) { console.log(`  ${name}: ${r.pass} passed, ${r.fail} failed`); totPass += r.pass; totFail += r.fail; }
console.log(`\n${totPass} passed, ${totFail} failed  (${results.length} passes: ${results.map(([n]) => n).join(" + ")})`);
process.exit(totFail ? 1 : 0);
