// tools/cas1803-hover-picker-qa.mjs — CAS-1803 BUILD verification (headless).
// The picker zoom/pan/cell-select from CAS-1735/1739 already ships; this beat ADDS the
// hover-cell highlight (pro polish) and re-asserts that the additive layer stays UI-only:
//   * hover resolves to the SAME cell the click handler would (zoom/scroll-neutral),
//   * hover NEVER touches curCell / the exported sub-rect / the round-trip,
//   * robustness: non-square cells + margin/spacing + a large tileset map correctly.
// Covers AC-HOVER / AC-ZOOM-NEUTRAL / AC-INVARIANT / AC-ROBUST / AC-HOOKS.
//   PART A (DOM-free): cell geometry the hover reuses (cellRect is image-px).
//   PART B (headless Chromium): editor hover hooks + mapping sweep + export invariance.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { normSlice, sliceGrid, cellRect } from "../sim/mapdoc.js";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// =========================================================================
// PART A — hover reuses cellRect: image-px, zoom-independent (pure, no DOM).
// =========================================================================
{
  const s = normSlice({ tw:24, th:32, margin:2, spacing:1 });   // non-square + gaps
  A(eq(cellRect(s,0,0), {sx:2, sy:2, sw:24, sh:32}), "A: cellRect(0,0) margin=2 ⇒ sx2/sy2");
  A(eq(cellRect(s,2,1), {sx:2+2*(24+1), sy:2+1*(32+1), sw:24, sh:32}), "A: cellRect(2,1) folds spacing");
  A(eq(sliceGrid(normSlice({tw:16,th:16}),256,256), {cols:16,rows:16,tw:16,th:16}), "A: 256² @16 ⇒ 16×16 grid");
}

// =========================================================================
// PART B — live editor hover (headless Chromium).
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
// cols×rows tileset, each cell (cw×ch) a distinct colour so a mismapped hover is catchable.
const MKGRID = `(cols,rows,cw,ch)=>{const c=document.createElement('canvas');c.width=cols*cw;c.height=rows*ch;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa','#00acc1','#f4511e','#3949ab','#7cb342','#d81b60','#00897b','#5e35b1'];for(let r=0;r<rows;r++)for(let i=0;i<cols;i++){x.fillStyle=cl[(r*cols+i)%cl.length];x.fillRect(i*cw,r*ch,cw,ch);}return c.toDataURL('image/png');}`;

try {
  const { p, errs } = await newPage();
  await p.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch(e){} });
  await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
  await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });
  await p.evaluate((MK) => { window.__mkGrid = eval(MK); }, MKGRID);

  // AC-HOOKS — hover probes exist alongside the CAS-1739 zoom probes.
  const hooks = await p.evaluate(() => ({
    setHoverCell: typeof window.__editor.setHoverCell === "function",
    setHoverAtPx: typeof window.__editor.setHoverAtCanvasPx === "function",
    getHover: "hoverCell" in window.__editor,
    zoom: ["setSliceZoom","pickAtCanvasPx"].every(k=>typeof window.__editor[k]==="function"),
  }));
  A(hooks.setHoverCell, "B: hook setHoverCell present");
  A(hooks.setHoverAtPx, "B: hook setHoverAtCanvasPx present");
  A(hooks.getHover, "B: hook get hoverCell present");
  A(hooks.zoom, "B: CAS-1739 zoom hooks still present (additive)");

  // ---- Case 1: 4×3 @32 square tileset ----
  await p.evaluate(async () => {
    await window.__editor.ingestAsset("t/sq.png", window.__mkGrid(4,3,32,32));
    window.__editor.selectTool("stamp");
    window.__editor.selectAsset("t/sq.png");
  });
  await p.waitForFunction(() => { const el=document.getElementById("slicePanel"); return el && el.style.display!=="none"; }, { timeout: 5000 });

  // AC-HOVER — hovering a canvas px resolves to the correct cell (fit zoom).
  const h1 = await p.evaluate(() => { const ds=document.getElementById("sliceCanvas")._ds; return window.__editor.setHoverAtCanvasPx(2.5*32*ds, 1.5*32*ds); });
  A(h1 && h1.col===2 && h1.row===1, "B: hover center of (2,1) ⇒ hoverCell (2,1)");
  const gh = await p.evaluate(() => window.__editor.hoverCell);
  A(gh && gh.col===2 && gh.row===1, "B: get hoverCell reflects state (2,1)");

  // AC-ZOOM-NEUTRAL — same image point at 3× zoom still resolves to (2,1) and == click.
  const h3 = await p.evaluate(() => { window.__editor.setSliceZoom(3); const ds=document.getElementById("sliceCanvas")._ds; return window.__editor.setHoverAtCanvasPx(2.5*32*ds, 1.5*32*ds); });
  A(h3 && h3.col===2 && h3.row===1, "B: hover zoom-neutral — (2,1) at 3× zoom");
  const pick3 = await p.evaluate(() => { const ds=document.getElementById("sliceCanvas")._ds; return window.__editor.pickAtCanvasPx(2.5*32*ds, 1.5*32*ds); });
  A(pick3 && pick3.col===2 && pick3.row===1, "B: hover == click mapping (agree at 3×)");
  await p.evaluate(() => window.__editor.sliceZoomFit());

  // out-of-grid hover ⇒ null
  const hNull = await p.evaluate(() => window.__editor.setHoverAtCanvasPx(-50, -50));
  A(hNull===null, "B: hover outside grid ⇒ null");

  // AC-INVARIANT — hover NEVER changes the selected cell / exported doc.
  await p.evaluate(() => window.__editor.selectCell("t/sq.png", 0, 0));
  const exportBefore = await p.evaluate(() => JSON.stringify(window.__editor.docToMapDoc(true)));
  await p.evaluate(() => window.__editor.setHoverAtCanvasPx(3*32, 2*32)); // hover a DIFFERENT cell
  const selAfter = await p.evaluate(() => window.__editor.curCell);
  const exportAfter = await p.evaluate(() => JSON.stringify(window.__editor.docToMapDoc(true)));
  A(selAfter && selAfter.col===0 && selAfter.row===0, "B: hover leaves curCell untouched (0,0)");
  A(exportBefore===exportAfter, "B: hover leaves doc/export byte-identical");

  // AC-ROBUST — non-square cells with margin+spacing map correctly.
  await p.evaluate(async () => {
    await window.__editor.ingestAsset("t/ns.png", window.__mkGrid(5,4,24,40));
    window.__editor.setSlice("t/ns.png", { tw:24, th:40, margin:3, spacing:2 });
    window.__editor.selectAsset("t/ns.png");
  });
  const rr = await p.evaluate(() => {
    const rect = window.__editor.cellRect("t/ns.png", 3, 2);
    const ds = document.getElementById("sliceCanvas")._ds;
    return window.__editor.setHoverAtCanvasPx((rect.sx+rect.sw/2)*ds, (rect.sy+rect.sh/2)*ds);
  });
  A(rr && rr.col===3 && rr.row===2, "B: robust hover — non-square 24×40 +margin+spacing ⇒ (3,2)");

  // AC-ROBUST — large 16×16-cell 32px tileset (512²) still maps.
  await p.evaluate(async () => {
    await window.__editor.ingestAsset("t/big.png", window.__mkGrid(16,16,32,32));
    window.__editor.selectAsset("t/big.png");
  });
  const big = await p.evaluate(() => {
    const rect = window.__editor.cellRect("t/big.png", 11, 9);
    const ds = document.getElementById("sliceCanvas")._ds;
    return window.__editor.setHoverAtCanvasPx((rect.sx+16)*ds, (rect.sy+16)*ds);
  });
  A(big && big.col===11 && big.row===9, "B: robust hover — 512² tileset ⇒ (11,9)");

  // switching tilesets clears stale hover
  await p.evaluate(() => window.__editor.setHoverCell(5,5));
  await p.evaluate(() => window.__editor.selectAsset("t/sq.png"));
  const hClear = await p.evaluate(() => window.__editor.hoverCell);
  A(hClear===null, "B: switching tileset clears stale hover");

  A(errs.length===0, "B: zero console/page errors" + (errs.length?` — ${errs.slice(0,3).join(" | ")}`:""));
  await p.close();
} finally {
  await browser.close();
  await srv.close();
}

console.log("\n=== CAS-1803 hover-picker QA ===");
for (const m of ok) console.log("  ✓ " + m);
for (const m of bad) console.log("  ✗ " + m);
console.log(`\n${ok.length}/${ok.length+bad.length} PASS`);
process.exit(bad.length ? 1 : 0);
