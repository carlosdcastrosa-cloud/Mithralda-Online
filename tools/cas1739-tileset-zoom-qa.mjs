// tools/cas1739-tileset-zoom-qa.mjs — CAS-1739 BUILD verification (headless).
// Proves the ADDITIVE picker-zoom layer on top of the CAS-1729 slice panel:
// zoom in/out (buttons, wheel, keyboard), a scrollable natural-size canvas, and the
// coordinate fix (removing width:100% so clicks map dead-on at any zoom). The zoom is
// PURE presentation — curCell / the stamp sub-rect / export stay in image px, so the
// round-trip and game are byte-identical to CAS-1729 at sliceZoom==1. Covers
// AC-ZOOM / AC-MAP-EXACT / AC-INVARIANT / AC-ADDITIVE / AC-HOOKS / AC-POLISH.
//   PART A (DOM-free): re-assert the cell geometry the zoom must never perturb.
//   PART B (headless Chromium): editor zoom UI/hooks + click-mapping sweep + game smoke.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { normSlice, sliceGrid, cellRect } from "../sim/mapdoc.js";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// =========================================================================
// PART A — cell geometry is image-px and zoom-independent (pure, no DOM).
// =========================================================================
{
  const s = normSlice({ tw:32, th:32 });
  // A 128×96 tileset @32 ⇒ 4 cols × 3 rows; cellRect is in image px (never scaled).
  A(eq(sliceGrid(s,128,96), {cols:4,rows:3,tw:32,th:32}), "A: sliceGrid 128×96 @32 ⇒ 4×3");
  A(eq(cellRect(s,2,1), {sx:64, sy:32, sw:32, sh:32}), "A: cellRect(2,1) ⇒ image px sx64/sy32 (zoom-independent)");
  A(eq(cellRect(s,3,2), {sx:96, sy:64, sw:32, sh:32}), "A: cellRect(3,2) ⇒ image px sx96/sy64");
}

// =========================================================================
// PART B — live editor zoom (headless Chromium).
// =========================================================================
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function newPage(){
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  return { p, errs };
}
// cols×rows tileset PNG, each cell a distinct colour so mismapped clicks are catchable.
const MKGRID = `(cols,rows,cell)=>{const c=document.createElement('canvas');c.width=cols*cell;c.height=rows*cell;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#d81b60','#00897b','#5e35b1'];for(let r=0;r<rows;r++)for(let i=0;i<cols;i++){x.fillStyle=cl[(r*cols+i)%cl.length];x.fillRect(i*cell,r*cell,cell,cell);}return c.toDataURL('image/png');}`;

try {
  // ---- 1) editor: zoom hooks, controls, click-mapping sweep, invariants ----
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });

    // AC-HOOKS + DOM present (viewport wrapper, zoom controls, % label).
    const dom = await p.evaluate(() => ({
      hooks: ["setSliceZoom","sliceZoomFit","pickAtCanvasPx"].every(k=>typeof window.__editor[k]==="function"),
      getZoom: "sliceZoom" in window.__editor && typeof window.__editor.sliceZoom==="number",
      view: !!document.getElementById("sliceView"),
      lbl: !!document.getElementById("sliceZoomLbl"),
      btns: ["slZoomIn","slZoomOut","slZoomFit"].every(id=>!!document.getElementById(id)),
      noStretch: getComputedStyle(document.getElementById("sliceCanvas")).width !== "100%",
    }));
    A(dom.hooks && dom.getZoom, "AC-HOOKS __editor exposes setSliceZoom/sliceZoomFit/get sliceZoom/pickAtCanvasPx");
    A(dom.view && dom.lbl && dom.btns, "AC-ZOOM DOM: #sliceView viewport + %-label + −/＋/Ajustar buttons");
    A(dom.noStretch, "AC-MAP-EXACT #sliceCanvas no longer stretched by width:100% CSS");

    // import a 4×3 @32 tileset (128×96) + open the picker in the Sello tool.
    const g = await p.evaluate(async (mk) => {
      const mkGrid = eval(mk);
      await window.__editor.ingestAsset("tiles/big.png", mkGrid(4,3,32));   // 128×96
      window.__editor.selectTool("stamp");
      window.__editor.selectAsset("tiles/big.png");
      const grid = window.__editor.sliceGrid("tiles/big.png");
      const shown = getComputedStyle(document.getElementById("slicePanel")).display !== "none";
      return { grid, shown, zoom0: window.__editor.sliceZoom };
    }, MKGRID);
    A(g.grid && g.grid.cols===4 && g.grid.rows===3, `AC-ZOOM tileset sliced 4×3 (${g.grid&&g.grid.cols}×${g.grid&&g.grid.rows})`);
    A(g.shown, "AC-ZOOM picker panel opens for the tileset in the Sello tool");
    A(g.zoom0===1, "AC-POLISH picker opens at fit (sliceZoom==1)");

    // AC-ZOOM: setSliceZoom grows the canvas + updates the % label; clamp is [0.5,12].
    const zoom = await p.evaluate(() => {
      const cvs=document.getElementById("sliceCanvas"), lbl=document.getElementById("sliceZoomLbl");
      const w1=cvs.width, z1=window.__editor.sliceZoom;
      const z3=window.__editor.setSliceZoom(3);   const w3=cvs.width, lbl3=lbl.textContent;
      const zHi=window.__editor.setSliceZoom(100); const wHi=cvs.width;    // clamp high
      const zLo=window.__editor.setSliceZoom(0.01);                       // clamp low
      window.__editor.sliceZoomFit();             const zFit=window.__editor.sliceZoom, wFit=cvs.width;
      // CSS size must equal the backing store (1 CSS px == 1 buffer px → dead-on clicks).
      const cssW=parseInt(cvs.style.width,10), cssH=parseInt(cvs.style.height,10);
      return { w1, z1, z3, w3, lbl3, zHi, wHi, zLo, zFit, wFit, cssW, cssH, bufW:cvs.width, bufH:cvs.height };
    });
    A(zoom.z1===1 && zoom.z3===3 && zoom.w3>zoom.w1, `AC-ZOOM zoom-in grows canvas (${zoom.w1}px→${zoom.w3}px)`);
    A(zoom.lbl3==="300%", `AC-ZOOM %-label tracks zoom (got ${zoom.lbl3})`);
    A(zoom.zHi<=12 && zoom.zHi>=1 && zoom.zLo===0.5, `AC-ZOOM clamp [0.5,12] (hi=${zoom.zHi}, lo=${zoom.zLo})`);
    A(zoom.zFit===1 && zoom.wFit===zoom.w1, "AC-ZOOM sliceZoomFit returns to fit (canvas back to base size)");
    A(zoom.cssW===zoom.bufW && zoom.cssH===zoom.bufH, `AC-MAP-EXACT canvas CSS size == backing store (${zoom.cssW}==${zoom.bufW})`);

    // AC-MAP-EXACT: at several zoom levels, the click-map resolves the correct cell for a
    // sweep of ALL cells (centre of each cell in buffer px must pick that exact col/row).
    const sweep = await p.evaluate(() => {
      const cvs=document.getElementById("sliceCanvas");
      const grid=window.__editor.sliceGrid("tiles/big.png");
      const out=[];
      for(const z of [1, 2.5, 6]){
        window.__editor.setSliceZoom(z);
        const ds=cvs._ds; let miss=0, tot=0;
        for(let r=0;r<grid.rows;r++) for(let c=0;c<grid.cols;c++){
          const bx=(c*32+16)*ds, by=(r*32+16)*ds;                 // cell centre in buffer px
          const hit=window.__editor.pickAtCanvasPx(bx,by);
          tot++; if(!hit || hit.col!==c || hit.row!==r) miss++;
        }
        out.push({ z:Math.round(window.__editor.sliceZoom*100)/100, ds:Math.round(ds*1000)/1000, miss, tot });
      }
      window.__editor.sliceZoomFit();
      return out;
    });
    for(const s of sweep) A(s.miss===0, `AC-MAP-EXACT click-map exact at zoom ${s.z}× (0/${s.tot} miss, ds=${s.ds})`);

    // AC-MAP-EXACT (end-to-end): a real dispatched pointerdown+up at a cell centre selects
    // that cell — proves the wired handler (offsetX/ds) agrees at a non-1 zoom.
    const realClick = await p.evaluate(() => {
      window.__editor.setSliceZoom(4);
      const cvs=document.getElementById("sliceCanvas"), ds=cvs._ds, rect=cvs.getBoundingClientRect();
      const col=3, row=2, bx=(col*32+16)*ds, by=(row*32+16)*ds;   // last cell centre
      const at={ clientX:rect.left+bx, clientY:rect.top+by, bubbles:true, pointerId:1 };
      cvs.dispatchEvent(new PointerEvent("pointerdown", at));
      cvs.dispatchEvent(new PointerEvent("pointerup", at));
      const cc=window.__editor.curCell;
      window.__editor.sliceZoomFit();
      return cc;
    });
    A(realClick && realClick.col===3 && realClick.row===2 && realClick.sx===96 && realClick.sy===64,
      `AC-MAP-EXACT real click@4× selects cell(3,2) sx96/sy64 (got col=${realClick&&realClick.col},sx=${realClick&&realClick.sx})`);

    // AC-INVARIANT: curCell sub-rect (image px) is identical whichever zoom it was picked at.
    const inv = await p.evaluate(() => {
      window.__editor.setSliceZoom(1);  const a=window.__editor.selectCell("tiles/big.png",1,1);
      window.__editor.setSliceZoom(7);  const b=window.__editor.selectCell("tiles/big.png",1,1);
      window.__editor.sliceZoomFit();
      return { a, b };
    });
    A(inv.a && inv.b && inv.a.sx===inv.b.sx && inv.a.sy===inv.b.sy && inv.a.sw===inv.b.sw && inv.a.sh===inv.b.sh,
      "AC-INVARIANT curCell sub-rect is image-px, identical across zoom levels");

    // AC-INVARIANT/ADDITIVE: stamping the same cell at zoom 1 vs 5 yields an identical sub-rect prop.
    const stamp = await p.evaluate(() => {
      window.__editor.setSliceZoom(1); const p1=window.__editor.stampCell("tiles/big.png",2,1, 300,400);
      window.__editor.setSliceZoom(5); const p2=window.__editor.stampCell("tiles/big.png",2,1, 340,400);
      window.__editor.sliceZoomFit();
      return { p1:{sx:p1.sx,sy:p1.sy,sw:p1.sw,sh:p1.sh}, p2:{sx:p2.sx,sy:p2.sy,sw:p2.sw,sh:p2.sh} };
    });
    A(eq(stamp.p1, stamp.p2) && stamp.p1.sx===64 && stamp.p1.sy===32,
      "AC-ADDITIVE stamped sub-rect is zoom-independent (sx64/sy32 at zoom 1 and 5)");

    // AC-ADDITIVE: export MapDoc, zoom around, re-export → byte-identical (zoom is view-only).
    const additive = await p.evaluate(() => {
      const before=JSON.stringify(window.__editor.docToMapDoc(true));
      window.__editor.setSliceZoom(9); window.__editor.setSliceZoom(0.5); window.__editor.sliceZoomFit();
      const after=JSON.stringify(window.__editor.docToMapDoc(true));
      return { same: before===after, len: before.length };
    });
    A(additive.same, `AC-ADDITIVE export byte-identical before/after zooming (${additive.len} chars)`);

    // AC-POLISH: opening a DIFFERENT tileset resets the picker view to fit.
    const polish = await p.evaluate(async (mk) => {
      const mkGrid = eval(mk);
      window.__editor.setSliceZoom(8);                    // leave a weird zoom on tiles/big.png
      await window.__editor.ingestAsset("tiles/two.png", mkGrid(2,2,32));
      window.__editor.selectAsset("tiles/two.png");       // opens the panel for a new tileset
      return window.__editor.sliceZoom;
    }, MKGRID);
    A(polish===1, `AC-POLISH switching tileset resets zoom to fit (got ${polish})`);

    A(errs.length===0, `editor zoom flow clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    await p.close();
  }

  // ---- 2) regression smoke: game boots clean with no ?map (editor is standalone) ----
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/index.html?dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(mi.fromMapDoc===false, "REG default game world untouched (editor-only change)");
    A(errs.length===0, `REG game boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    await p.close();
  }
} catch (e) {
  bad.push("EXCEPTION: " + (e && e.stack || e));
} finally {
  await browser.close(); await srv.close();
}

console.log("\n=== CAS-1739 tileset-zoom build QA ===");
for (const m of ok)  console.log("  PASS  " + m);
for (const m of bad) console.log("  FAIL  " + m);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
