// tools/cas1729-tileset-slicing-qa.mjs — CAS-1729 BUILD verification (headless).
// Proves the ADDITIVE tileset-slicing layer on top of CAS-1716 (custom-asset upload):
// cut an imported tileset into its grid, pick a CELL, stamp that sub-rect (not the
// whole sheet), round-trip it, and render only that cell in the game. Covers AC1–AC7 +
// the byte-safe regression. Two parts:
//   A) PURE (DOM-free) — cell geometry (cellRect/sliceGrid/autoSlice) + the mapdoc
//      docToWorld sub-rect data-flow (sliced prop ⇒ deco.sx..sh; plain prop ⇒ none).
//   B) LIVE (headless Chromium) — editor slicing UI/hooks + game renders the cell.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { normSlice, sliceGrid, cellRect, autoSlice, buildWorldFromMapDoc } from "../sim/mapdoc.js";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// =========================================================================
// PART A — pure cell geometry + mapdoc data-flow (no DOM, no browser).
// =========================================================================
{
  // AC2 auto-detect: 64×64 (mult of 32) ⇒ 32px grid; 48×48 (mult of 16 not 32) ⇒ 16px;
  // 40×30 (neither) ⇒ null (whole sheet).
  A(eq(autoSlice(64,64), {tw:32,th:32,margin:0,spacing:0,ox:0,oy:0}), "AC2 autoSlice 64×64 ⇒ 32px cells");
  A(eq(autoSlice(48,48), {tw:16,th:16,margin:0,spacing:0,ox:0,oy:0}), "AC2 autoSlice 48×48 ⇒ 16px cells");
  A(autoSlice(40,30)===null, "AC2 autoSlice 40×30 (no clean grid) ⇒ null (whole sheet)");

  // AC1/3 grid + cell rects. A 96×32 tileset at 32px ⇒ 3 cols × 1 row.
  const s = normSlice({tw:32,th:32});
  A(eq(sliceGrid(s,96,32), {cols:3,rows:1,tw:32,th:32}), "AC1 sliceGrid 96×32 @32 ⇒ 3×1");
  A(eq(cellRect(s,0,0), {sx:0, sy:0, sw:32, sh:32}), "AC3 cellRect (0,0) ⇒ sx0");
  A(eq(cellRect(s,2,0), {sx:64,sy:0, sw:32, sh:32}), "AC3 cellRect (2,0) ⇒ sx64");

  // margin + spacing math: 2px margin, 2px spacing, 32px cells on a 100×32 sheet.
  //   cols = floor((100 - 2*2 - 0 + 2) / (32+2)) = floor(98/34) = 2.  cell1.sx = 2 + 1*34 = 36.
  const sp = normSlice({tw:32,th:32,margin:2,spacing:2});
  A(sliceGrid(sp,100,32).cols===2, "AC2 sliceGrid honours margin+spacing (cols=2)");
  A(cellRect(sp,1,0).sx===36, "AC2 cellRect honours margin+spacing (sx=36)");

  // offset (ox/oy): a 4px origin offset shifts the first cell.
  A(cellRect(normSlice({tw:32,th:32,ox:4,oy:6}),0,0).sx===4, "AC2 cellRect honours ox offset (sx=4)");

  // AC4/AC6 data-flow: docToWorld copies the sub-rect ONLY when the prop has sw.
  const mk = (props) => ({ v:1, name:"t", w:32, h:32, terrain:{rle:[0,32*32]}, zones:[],
    entities:{ npcs:[], chests:[], fragments:[], portals:[], props } });
  const wSliced = buildWorldFromMapDoc(mk([{ x:100, y:100, kind:"custom", asset:"a.png", sx:32, sy:0, sw:32, sh:32, w:32, h:32 }]));
  const dS = wSliced.deco.find(d=>d.kind==="custom");
  A(dS && dS.sx===32 && dS.sw===32 && dS.sh===32, "AC4 docToWorld copies sub-rect (sx,sw,sh) for a sliced prop");
  const wPlain = buildWorldFromMapDoc(mk([{ x:100, y:100, kind:"custom", asset:"a.png", w:48, h:64 }]));
  const dP = wPlain.deco.find(d=>d.kind==="custom");
  A(dP && dP.sw===undefined && dP.sx===undefined, "AC7 byte-safe: plain custom prop ⇒ deco has NO sub-rect (whole sheet)");
}

// =========================================================================
// PART B — live editor + game (headless Chromium).
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
// A 2-colour tileset PNG data URL: `w`×`h`, split into `cols` vertical cells so cells differ.
const MKTILE = `(cols,cell)=>{const c=document.createElement('canvas');c.width=cols*cell;c.height=cell;const x=c.getContext('2d');const cl=['#e53935','#1e88e5','#43a047','#fdd835'];for(let i=0;i<cols;i++){x.fillStyle=cl[i%cl.length];x.fillRect(i*cell,0,cell,cell);}return c.toDataURL('image/png');}`;
const MKPNG  = `(color,sz)=>{const c=document.createElement('canvas');c.width=c.height=sz;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,sz,sz);return c.toDataURL('image/png');}`;

try {
  // ---- 1) editor: import tileset, slice, select + stamp cells, round-trip ----
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });

    // AC8 hooks present + panel DOM present.
    const dom = await p.evaluate(() => ({
      hooks: ["setSlice","sliceGrid","cellRect","selectCell","stampCell","clearCell"].every(k=>typeof window.__editor[k]==="function"),
      hasCurCell: "curCell" in window.__editor,
      panel: !!document.getElementById("slicePanel"),
      sliceCanvas: !!document.getElementById("sliceCanvas"),
      inputs: ["slTw","slTh","slMargin","slSpacing","slOx","slOy"].every(id=>!!document.getElementById(id)),
    }));
    A(dom.hooks && dom.hasCurCell, "AC8 __editor exposes setSlice/sliceGrid/cellRect/selectCell/stampCell/curCell");
    A(dom.panel && dom.sliceCanvas && dom.inputs, "AC1 slice panel DOM: #slicePanel + #sliceCanvas + 6 grid inputs");

    // AC1 import a 96×32 tileset (3 cells @32) + a 16×16 single sprite.
    const grid = await p.evaluate(async (mktileSrc, mkpngSrc) => {
      const mkTile = eval(mktileSrc), mkPng = eval(mkpngSrc);
      await window.__editor.ingestAsset("tiles/set.png", mkTile(3,32));   // 96×32
      await window.__editor.ingestAsset("deco/gem.png",  mkPng("#8e24aa",16));
      // AC2 auto-detect gives a 32px grid for the tileset (96×32 ⇒ 3×1).
      const auto = window.__editor.sliceOf("tiles/set.png");
      const g0 = window.__editor.sliceGrid("tiles/set.png");
      // panel opens for the tileset in the Sello tool.
      window.__editor.selectTool("stamp");
      window.__editor.selectAsset("tiles/set.png");
      const panelShown = getComputedStyle(document.getElementById("slicePanel")).display !== "none";
      return { auto, g0, panelShown };
    }, MKTILE, MKPNG);
    A(grid.auto && grid.auto.tw===32, `AC2 tileset auto-detected 32px cells (tw=${grid.auto && grid.auto.tw})`);
    A(grid.g0 && grid.g0.cols===3 && grid.g0.rows===1, `AC1 grid 3×1 for 96×32 tileset (got ${grid.g0 && grid.g0.cols}×${grid.g0 && grid.g0.rows})`);
    A(grid.panelShown, "AC1 slice panel opens when a tileset is selected in the Sello tool");

    // AC3 select a cell ⇒ active brush; change cell ⇒ brush moves.
    const cell = await p.evaluate(() => {
      const c2 = window.__editor.selectCell("tiles/set.png", 2, 0);   // 3rd cell
      const brush2 = window.__editor.curCell;
      const c0 = window.__editor.selectCell("tiles/set.png", 0, 0);   // back to 1st
      const brush0 = window.__editor.curCell;
      return { c2, brush2, c0, brush0 };
    });
    A(cell.c2 && cell.c2.sx===64 && cell.c2.sw===32, `AC3 selectCell(2,0) ⇒ brush sx64 (got ${cell.c2 && cell.c2.sx})`);
    A(cell.brush2 && cell.brush2.col===2 && cell.brush0 && cell.brush0.col===0, "AC3 active cell brush changes when a different cell is picked");

    // AC3/AC4 stamp the sliced cell + a whole-sheet stamp of the single sprite.
    const stamp = await p.evaluate(() => {
      const sliced = window.__editor.stampCell("tiles/set.png", 1, 0, 300, 400);   // middle cell
      window.__editor.clearCell();                                                 // whole-sheet brush
      const whole = window.__editor.stampCustom("deco/gem.png", 350, 400);
      return { sliced, whole };
    });
    A(stamp.sliced && stamp.sliced.sw===32 && stamp.sliced.sx===32 && stamp.sliced.w===32 && stamp.sliced.h===32,
      `AC3 stampCell placed a sub-rect prop (sx=${stamp.sliced && stamp.sliced.sx}, sw=${stamp.sliced && stamp.sliced.sw})`);
    A(stamp.whole && stamp.whole.sw===undefined, "AC4 whole-sheet stamp carries NO sub-rect (byte-safe path intact)");

    // AC4 export embeds the SHEET once (referenced-only); round-trip preserves sub-rects.
    const rt = await p.evaluate(() => {
      const md = window.__editor.docToMapDoc(true);
      const refIds = md.assets ? Object.keys(md.assets) : [];
      const props = md.entities.props.filter(p=>p.kind==="custom");
      const slicedProp = props.find(p=>p.asset==="tiles/set.png");
      const back = window.__editor.docFromMapDoc(md);
      const bp = back.entities.props.find(p=>p.asset==="tiles/set.png" && p.kind==="custom");
      // md.assets must NOT carry slicing config (editor-only) — only path/name/type/dataUrl.
      const assetKeys = md.assets ? Object.keys(md.assets["tiles/set.png"]).sort() : [];
      return { refIds, slicedProp, bpHasRect: !!bp && bp.sw===32 && bp.sx===32, assetKeys };
    });
    A(rt.refIds.length===2 && rt.refIds.includes("tiles/set.png"), `AC4 export embeds 2 referenced sheets once each (${rt.refIds.join(",")})`);
    A(rt.slicedProp && rt.slicedProp.sw===32 && rt.slicedProp.sx===32, "AC4 export prop carries the sub-cell rect (sx,sw)");
    A(rt.bpHasRect, "AC4 round-trip docFromMapDoc(docToMapDoc) preserves the cell sub-rect");
    A(eq(rt.assetKeys, ["dataUrl","name","path","type"]), `AC4 md.assets embeds ONLY path/name/type/dataUrl (no slice) — ${rt.assetKeys.join(",")}`);

    // AC5 set an explicit slice config (persist) so the reload step can verify it stuck.
    await p.evaluate(() => { window.__editor.setSlice("tiles/set.png", {tw:32,th:32,margin:0,spacing:0,ox:0,oy:0}); });

    // write the embedded map to the bridge for the game step (Play path).
    await p.evaluate(() => { const md=window.__editor.docToMapDoc(true); md.name="QA Slice";
      localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md)); });

    A(errs.length===0, `editor slice flow clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    await p.close();
  }

  // ---- 2) AC5 PERSIST — reload re-hydrates the tileset AND its slice config ----
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });
    await p.waitForFunction("window.__editor.listAssets().length>=2", { timeout: 8000 }).catch(()=>{});
    const persist = await p.evaluate(() => ({
      n: window.__editor.listAssets().length,
      slice: window.__editor.sliceOf("tiles/set.png"),
    }));
    A(persist.n>=2, `AC5 IndexedDB reingest restored ${persist.n} assets after reload`);
    A(persist.slice && persist.slice.tw===32 && persist.slice.margin===0, "AC5 tileset slice config persisted across reload");
    // re-embed for the game bridge (reload's light autosave drops md.assets by design).
    await p.evaluate(() => { const md=window.__editor.docToMapDoc(true); md.name="QA Slice";
      localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md)); });
    A(errs.length===0, `editor reload clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    await p.close();
  }

  // ---- 3) AC6 GAME — ?map=local renders the CELL (not the sheet); sub-rect in world ----
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/index.html?map=local&dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(mi.fromMapDoc===true, "AC6 game built world FROM the custom MapDoc");
    // sub-rect reached world.deco: one sliced custom entry (sw=32) + one whole-sheet (no sw).
    const deco = await p.evaluate(() => window.__dev.customDeco());
    const sliced = deco.find(d=>d.asset==="tiles/set.png");
    const whole  = deco.find(d=>d.asset==="deco/gem.png");
    A(sliced && sliced.sliced===true && sliced.sw===32 && sliced.sx===32, `AC6 sliced tileset cell in world.deco (sx=${sliced&&sliced.sx}, sw=${sliced&&sliced.sw})`);
    A(whole && whole.sliced===false && whole.sw===undefined, "AC6 whole-sheet custom prop in world.deco has NO sub-rect");
    // Image decodes + drawable (renderer draws the 9-arg sub-rect for the sliced entry).
    await p.evaluate(()=>window.__dev.customImgReady("tiles/set.png"));
    const ready = await p.waitForFunction("window.__dev.customImgReady('tiles/set.png')===true", { timeout: 15000, polling: 200 }).then(()=>true).catch(()=>false);
    A(ready, "AC6 tileset Image decoded & drawable in the game (cell blit path)");
    A(errs.length===0, `AC6 game(?map=local) render clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    await p.close();
  }

  // ---- 4) AC7 BYTE-SAFE — no ?map ⇒ default world untouched ----
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/index.html?dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(errs.length===0, `game(no ?map) boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(mi.fromMapDoc===false, "AC7 default world is NOT from a MapDoc (additive/untouched)");
    const deco = await p.evaluate(() => window.__dev.customDeco());
    A(Array.isArray(deco) && deco.length===0, "AC7 default world has zero custom deco (nothing sliced leaks in)");
    await p.close();
  }
} catch (e) {
  bad.push("EXCEPTION: " + (e && e.stack || e));
} finally {
  await browser.close(); await srv.close();
}

console.log("\n=== CAS-1729 tileset-slicing build QA ===");
for (const m of ok)  console.log("  PASS  " + m);
for (const m of bad) console.log("  FAIL  " + m);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
