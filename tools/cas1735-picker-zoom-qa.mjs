// tools/cas1735-picker-zoom-qa.mjs — CAS-1735 BUILD verification (headless, repeatable).
// Proves the tileset-picker ZOOM layer is a PURE viewport transform on top of CAS-1729:
// render-only + input-mapping, with sliceZoom==1 byte-identical to before, and the picked
// cell sub-rect (curCell.{sx,sy,sw,sh}) INVARIANT across every zoom level. Covers AC1–AC4.
//
//   node tools/cas1735-picker-zoom-qa.mjs
//
// Two parts:
//   A) PURE (DOM-free) — the mapdoc geometry (autoSlice/sliceGrid/cellRect) + docToWorld
//      sub-rect data-flow are UNCHANGED by this ticket (AC4 anchor: zoom must not touch it).
//   B) LIVE (headless Chromium) — the picker zoom UI/hooks: default zoom==1 (AC1), +/−/wheel/
//      Ajustar change scale + indicator + scroll (AC2), click & selectCell agree at fit/2×/4×/
//      min and export sub-rect is zoom-independent (AC3), no console errors.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { normSlice, sliceGrid, cellRect, autoSlice, buildWorldFromMapDoc } from "../sim/mapdoc.js";
import { execSync } from "node:child_process";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;

// =========================================================================
// PART A — pure geometry + mapdoc data-flow UNCHANGED (AC4: zoom never touches it).
// =========================================================================
{
  A(eq(autoSlice(64,64), {tw:32,th:32,margin:0,spacing:0,ox:0,oy:0}), "AC4 autoSlice 64×64 ⇒ 32px cells (geometry unchanged)");
  const s = normSlice({tw:32,th:32});
  A(eq(sliceGrid(s,320,64), {cols:10,rows:2,tw:32,th:32}), "AC4 sliceGrid 320×64 @32 ⇒ 10×2 (unchanged)");
  A(eq(cellRect(s,9,1), {sx:288,sy:32,sw:32,sh:32}), "AC4 cellRect (9,1) ⇒ sx288,sy32 (unchanged)");
  // docToWorld copies the sub-rect ONLY for a sliced prop (byte-safe path intact).
  const mk = (props) => ({ v:1, name:"t", w:32, h:32, terrain:{rle:[0,32*32]}, zones:[],
    entities:{ npcs:[], chests:[], fragments:[], portals:[], props } });
  const dS = buildWorldFromMapDoc(mk([{ x:100,y:100,kind:"custom",asset:"a.png",sx:64,sy:0,sw:32,sh:32,w:32,h:32 }])).deco.find(d=>d.kind==="custom");
  A(dS && dS.sx===64 && dS.sw===32, "AC4 docToWorld copies sub-rect for a sliced prop (unchanged)");
  const dP = buildWorldFromMapDoc(mk([{ x:100,y:100,kind:"custom",asset:"a.png",w:48,h:64 }])).deco.find(d=>d.kind==="custom");
  A(dP && dP.sw===undefined, "AC4 byte-safe: plain custom prop ⇒ no sub-rect (unchanged)");

  // AC4 [no-touch] — the working tree must NOT modify pure geometry / game blit.
  const touched = execSync('git diff --name-only HEAD -- sim/mapdoc.js render/render.js render.js').toString().trim();
  A(touched === "", `AC4 git diff shows NO changes to sim/mapdoc.js or render.js (touched: '${touched}')`);
}

// =========================================================================
// PART B — live editor picker zoom (headless Chromium).
// =========================================================================
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const MKTILE = `(cols,rows,cell)=>{const c=document.createElement('canvas');c.width=cols*cell;c.height=rows*cell;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835','#8e24aa','#00acc1'];for(let r=0;r<rows;r++)for(let i=0;i<cols;i++){x.fillStyle=cl[(i+r)%cl.length];x.fillRect(i*cell,r*cell,cell,cell);}return c.toDataURL('image/png');}`;

async function newPage(){
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  return { p, errs };
}

try {
  const { p, errs } = await newPage();
  await p.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch(e){} });
  await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
  await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });

  // DOM + hooks present.
  const dom = await p.evaluate(() => ({
    view: !!document.getElementById("sliceView"),
    ctrls: ["slZoomIn","slZoomOut","slZoomFit","sliceZoomLbl"].every(id=>!!document.getElementById(id)),
    hooks: typeof window.__editor.setSliceZoom==="function" && "sliceZoom" in window.__editor && typeof window.__editor.pickAtCanvasPx==="function",
  }));
  A(dom.view && dom.ctrls, "AC2 picker DOM: #sliceView viewport + zoom in/out/fit buttons + indicator");
  A(dom.hooks, "AC2 __editor exposes setSliceZoom/sliceZoom/pickAtCanvasPx");

  // Import a big 320×64 tileset (10×2 @32) so zoom forces scrolling; open the picker.
  await p.evaluate(async (mk) => {
    const mkTile = eval(mk);
    await window.__editor.ingestAsset("tiles/big.png", mkTile(10,2,32));   // 320×64
    window.__editor.selectTool("stamp");
    window.__editor.selectAsset("tiles/big.png");
  }, MKTILE);

  // AC1 [byte-safe] — default zoom is exactly 1 (fit) with no interaction.
  const base = await p.evaluate(() => {
    const cvs=document.getElementById("sliceCanvas");
    return { z: window.__editor.sliceZoom, w: cvs.width, h: cvs.height, lbl: document.getElementById("sliceZoomLbl").textContent,
      panel: getComputedStyle(document.getElementById("slicePanel")).display!=="none" };
  });
  A(base.z===1, `AC1 default sliceZoom==1 (fit) — no interaction (got ${base.z})`);
  A(base.lbl==="100%", `AC1 indicator reads 100% at fit (got ${base.lbl})`);
  A(base.panel, "AC1 slice panel open for the tileset in Sello tool");

  // AC2 [zoom] — setSliceZoom(4) grows the canvas ~4× and updates the indicator.
  const z4 = await p.evaluate(() => { const z=window.__editor.setSliceZoom(4); const cvs=document.getElementById("sliceCanvas");
    return { z, w: cvs.width, lbl: document.getElementById("sliceZoomLbl").textContent }; });
  A(near(z4.z,4) && z4.w > base.w*3, `AC2 setSliceZoom(4) grows canvas (w ${base.w}→${z4.w}, zoom ${z4.z})`);
  A(z4.lbl==="400%", `AC2 indicator reflects 4× (got ${z4.lbl})`);

  // AC2 [scroll] — at 4× the canvas overflows the viewport; scroll reveals the far cells.
  const scroll = await p.evaluate(() => {
    const cvs=document.getElementById("sliceCanvas"), v=document.getElementById("sliceView");
    const overflow = cvs.width > v.clientWidth;
    v.scrollLeft = v.scrollWidth; v.scrollTop = v.scrollHeight;   // to the far corner
    const ds = cvs._ds||1;
    // canvas-px center of the last cell (9,1) on the 320×64 sheet @32.
    const bx=(9*32+16)*ds, by=(1*32+16)*ds;
    const pick = window.__editor.pickAtCanvasPx(bx,by);
    return { overflow, pick, sw:cvs.width, cw:v.clientWidth };
  });
  A(scroll.overflow, `AC2 zoomed canvas overflows viewport (canvas ${scroll.sw}px > view ${scroll.cw}px) ⇒ scrollbars`);
  A(scroll.pick && scroll.pick.col===9 && scroll.pick.row===1, `AC2 scroll+pick reaches the far cell (9,1) (got ${JSON.stringify(scroll.pick)})`);

  // AC2 [Ajustar] — fit button resets zoom to 1 and scroll to 0.
  const fit = await p.evaluate(() => { document.getElementById("slZoomFit").click();
    const v=document.getElementById("sliceView"); return { z: window.__editor.sliceZoom, sl: v.scrollLeft, st: v.scrollTop,
      lbl: document.getElementById("sliceZoomLbl").textContent }; });
  A(fit.z===1 && fit.sl===0 && fit.st===0 && fit.lbl==="100%", `AC2 Ajustar resets zoom→1 + scroll→0 (z=${fit.z}, scroll=${fit.sl},${fit.st})`);

  // AC2 [+/−] — buttons step the zoom; wheel (deltaY<0) zooms in.
  const step = await p.evaluate(() => {
    document.getElementById("slZoomIn").click(); const zin=window.__editor.sliceZoom;
    document.getElementById("slZoomOut").click(); const zout=window.__editor.sliceZoom;
    const cvs=document.getElementById("sliceCanvas");
    cvs.dispatchEvent(new WheelEvent("wheel",{deltaY:-100,bubbles:true,cancelable:true})); const zwheel=window.__editor.sliceZoom;
    return { zin, zout, zwheel };
  });
  A(near(step.zin,1.25) && near(step.zout,1), `AC2 +/− step zoom (1→${step.zin.toFixed(2)}→${step.zout.toFixed(2)})`);
  A(step.zwheel>1, `AC2 wheel-up zooms in (got ${step.zwheel.toFixed(2)})`);

  // AC3 [ZOOM-NEUTRAL] — for zoom ∈ {min .5, fit 1, 2×, 4×}, a click at a cell's on-screen
  // center yields the SAME curCell.{sx,sy,sw,sh} as __editor.selectCell(col,row).
  const TARGETS = [[3,0],[7,1],[0,1],[9,0]];
  const ZOOMS = [0.5, 1, 2, 4];
  const neutral = await p.evaluate(async (ZOOMS, TARGETS) => {
    const cvs=document.getElementById("sliceCanvas"), v=document.getElementById("sliceView");
    const rectKeys = c => c && { sx:c.sx, sy:c.sy, sw:c.sw, sh:c.sh, col:c.col, row:c.row };
    const results=[];
    for(const z of ZOOMS){
      window.__editor.setSliceZoom(z);
      const [col,row]=TARGETS[ZOOMS.indexOf(z)];
      // reference = selectCell hook
      const ref = rectKeys(window.__editor.selectCell("tiles/big.png", col, row));
      window.__editor.clearCell();
      // scroll the target cell into view, then dispatch a real pointerdown+up (no move).
      const ds=cvs._ds||1; const bx=(col*32+16)*ds, by=(row*32+16)*ds;
      if(bx<v.scrollLeft||bx>v.scrollLeft+v.clientWidth) v.scrollLeft=Math.max(0,bx-v.clientWidth/2);
      if(by<v.scrollTop||by>v.scrollTop+v.clientHeight) v.scrollTop=Math.max(0,by-v.clientHeight/2);
      const r=cvs.getBoundingClientRect(); const cx=r.left+bx, cy=r.top+by;
      const opts={clientX:cx,clientY:cy,bubbles:true,cancelable:true,pointerId:1,pointerType:"mouse",button:0};
      cvs.dispatchEvent(new PointerEvent("pointerdown",opts));
      cvs.dispatchEvent(new PointerEvent("pointerup",opts));
      const click = rectKeys(window.__editor.curCell);
      // also the sanctioned probe
      const probe = window.__editor.pickAtCanvasPx(bx,by);
      results.push({ z, target:[col,row], ref, click, probe });
    }
    return results;
  }, ZOOMS, TARGETS);
  for(const rz of neutral){
    A(eq(rz.click, rz.ref), `AC3 zoom ${rz.z}× — real click == selectCell for cell ${rz.target.join(",")} (click ${JSON.stringify(rz.click&&{sx:rz.click.sx,sy:rz.click.sy})})`);
    A(rz.probe && rz.probe.col===rz.target[0] && rz.probe.row===rz.target[1], `AC3 zoom ${rz.z}× — pickAtCanvasPx resolves cell ${rz.target.join(",")}`);
  }
  // AC3 the sub-rect itself does NOT depend on zoom: cell (5,1) has one canonical rect.
  const canon = await p.evaluate(() => {
    const rects = [0.5,1,2,4].map(z=>{ window.__editor.setSliceZoom(z); const c=window.__editor.selectCell("tiles/big.png",5,1);
      return { sx:c.sx, sy:c.sy, sw:c.sw, sh:c.sh }; });
    return rects;
  });
  A(canon.every(r=>eq(r,canon[0])) && eq(canon[0],{sx:160,sy:32,sw:32,sh:32}),
    `AC3 curCell sub-rect for (5,1) is zoom-invariant ${JSON.stringify(canon[0])}`);

  // AC3 export round-trip: the stamped sub-rect survives regardless of the zoom it was picked at.
  const rt = await p.evaluate(() => {
    window.__editor.setSliceZoom(4);
    const sliced = window.__editor.stampCell("tiles/big.png", 6, 0, 300, 400);   // picked at 4×
    const md = window.__editor.docToMapDoc(true);
    const back = window.__editor.docFromMapDoc(md);
    const bp = back.entities.props.find(x=>x.asset==="tiles/big.png" && x.kind==="custom");
    return { sliced, bp };
  });
  A(rt.sliced && rt.sliced.sx===192 && rt.sliced.sw===32, `AC3 stampCell at 4× embeds cell (6,0) sub-rect sx192 (got ${rt.sliced&&rt.sliced.sx})`);
  A(rt.bp && rt.bp.sx===192 && rt.bp.sw===32, "AC3 round-trip preserves the zoom-picked sub-rect (export is zoom-independent)");

  // AC1 regression — reset to fit leaves the panel byte-safe (whole-sheet stamp = no sub-rect).
  const safe = await p.evaluate(() => { document.getElementById("slZoomFit").click(); window.__editor.clearCell();
    const whole = window.__editor.stampCustom("tiles/big.png", 350, 450);
    return { z: window.__editor.sliceZoom, whole }; });
  A(safe.z===1 && safe.whole && safe.whole.sw===undefined, "AC1 back at fit, whole-sheet stamp carries NO sub-rect (byte-safe path intact)");

  A(errs.length===0, `picker zoom flow clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
  await p.close();
} catch (e) {
  bad.push("EXCEPTION: " + (e && e.stack || e));
} finally {
  await browser.close(); await srv.close();
}

console.log("\n=== CAS-1735 tileset-picker-zoom build QA ===");
for (const m of ok)  console.log("  PASS  " + m);
for (const m of bad) console.log("  FAIL  " + m);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
