// tools/cas1716-custom-assets-qa.mjs — CAS-1716 BUILD verification (local, headless).
// Proves, against a local static server (HEAD working tree), the custom-asset upload
// feature end to end, covering AC1–AC8 + the byte-safe regression (AC7):
//   AC1 UPLOAD   — ingestAsset (headless proxy for the folder picker) loads png/webp,
//                  ignores non-images without crashing, reports a count.
//   AC2 PALETTE  — assets appear grouped by first-level folder with thumbnails, selectable.
//   AC3 STAMP    — stampCustom places a deco kind:"custom"; the editor draws the real image.
//   AC4 PERSIST  — assets survive a reload (IndexedDB reingest); the ~40MB cap rejects a
//                  too-big asset with a flash and NO crash.
//   AC5 ROUND-TRIP — export embeds ONLY referenced assets in md.assets; import re-hydrates;
//                  docFromMapDoc(docToMapDoc(doc,true)) preserves custom props + assets.
//   AC6 GAME     — ?map=local with md.assets ⇒ the game builds the Image cache and
//                  __dev.customImgReady(id) turns true; no console errors.
//   AC7 BYTE-SAFE— no custom props ⇒ docToMapDoc(true)===docToMapDoc() (no assets key);
//                  no ?map ⇒ game fromMapDoc=false, clean.
//   AC8 QA HOOKS — window.__editor.{ingestAsset,listAssets,stampCustom} + __dev.customImgReady.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ok = [], bad = [];
const A = (c, m) => (c ? ok : bad).push(m);

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function newPage(){
  const p = await browser.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  return { p, errs };
}

// A canvas-baked helper injected into the page: build a solid-colour PNG data URL.
const MKPNG = `(color,sz)=>{const c=document.createElement('canvas');c.width=c.height=sz;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,sz,sz);return c.toDataURL('image/png');}`;

try {
  // =====================================================================
  // 1) editor boots clean + BYTE-SAFE baseline (AC7): seed has no custom props,
  //    so docToMapDoc() and docToMapDoc(true) are identical and carry NO assets key.
  // =====================================================================
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { indexedDB.deleteDatabase("mithralda.editor.assets.v1"); localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });
    const base = await p.evaluate(() => {
      window.__editor.setDoc(window.__editor.docFromMapDoc(window.__editor.makeSeedMapDoc()));
      const plain = JSON.stringify(window.__editor.docToMapDoc());
      const embed = JSON.stringify(window.__editor.docToMapDoc(true));
      const md = window.__editor.docToMapDoc(true);
      return { plain, embed, hasAssets: "assets" in md,
        hooks: ["ingestAsset","listAssets","stampCustom"].every(k=>typeof window.__editor[k]==="function") };
    });
    A(errs.length===0, `editor boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(base.hooks, "AC8 __editor exposes ingestAsset/listAssets/stampCustom");
    A(!base.hasAssets, "AC7 seed (no custom props) ⇒ no md.assets key");
    A(base.plain===base.embed, "AC7 byte-safe: docToMapDoc()===docToMapDoc(true) with no custom props");

    // ---- AC1 UPLOAD + AC2 PALETTE + AC4 CAP ----
    const up = await p.evaluate(async (mkpngSrc) => {
      const mkPng = eval(mkpngSrc);
      const r1 = await window.__editor.ingestAsset("mobs/goblin.png", mkPng("#4caf50",16));
      const r2 = await window.__editor.ingestAsset("mobs/slime.png",  mkPng("#2196f3",12));
      const r3 = await window.__editor.ingestAsset("deco/rune.png",   mkPng("#e91e63",20));
      const r4 = await window.__editor.ingestAsset("bare.png",        mkPng("#ffc107",8));
      // non-image ignored without crashing: pass a bogus (non-image) data URL
      let sawError=false, r5=null;
      try { r5 = await window.__editor.ingestAsset("notes.txt", "data:text/plain;base64,aGVsbG8="); } catch(e){ sawError=true; }
      const list = window.__editor.listAssets();
      const groups = {}; for(const a of list) groups[a.group]=(groups[a.group]||0)+1;
      // palette DOM
      const sw = document.querySelectorAll("#assetGroups .asw").length;
      const heads = Array.from(document.querySelectorAll("#assetGroups .ghead")).map(n=>n.textContent);
      const thumbs = document.querySelectorAll("#assetGroups .asw img").length;
      return { n:[r1,r2,r3,r4].filter(Boolean).length, list:list.length, groups, sw, heads, thumbs,
        crashOnBad: sawError, r5null: r5===null || (r5&&r5.type&&!r5.type.startsWith("image/")) };
    }, MKPNG);
    A(up.n===4, `AC1 uploaded 4 images (got ${up.n})`);
    A(up.list===4, `AC2 palette holds 4 assets (got ${up.list})`);
    A(up.groups.mobs===2 && up.groups.deco===1 && up.groups["raíz"]===1, `AC2 grouped by first-level folder (${JSON.stringify(up.groups)})`);
    A(up.sw===4 && up.thumbs===4, `AC2 palette DOM: ${up.sw} swatches + ${up.thumbs} thumbnails`);
    A(up.heads.some(h=>h.startsWith("mobs")), `AC2 folder group headers present (${up.heads.join(", ")})`);
    A(!up.crashOnBad, "AC1 non-image ingest did not throw (ignored gracefully)");

    // ---- AC4 CAP: an asset over the ~40MB cap is rejected (flash), returns null, no crash ----
    const cap = await p.evaluate(async () => {
      // 56MB of base64 chars ≈ 42MB decoded > 40MB cap. Invalid PNG is fine: the cap check
      // runs before storage, and the decode just yields 0×0 dims.
      const big = "data:image/png;base64," + "A".repeat(56*1024*1024);
      let threw=false, rec=null;
      try { rec = await window.__editor.ingestAsset("huge/over.png", big); } catch(e){ threw=true; }
      return { rejected: rec===null, threw, still: window.__editor.listAssets().length };
    });
    A(cap.rejected && !cap.threw, "AC4 over-cap asset rejected (null) without throwing");
    A(cap.still===4, `AC4 palette unchanged after over-cap reject (still ${cap.still})`);

    // ---- AC3 STAMP + AC5 ROUND-TRIP embed (referenced-only) ----
    const rt = await p.evaluate(() => {
      const before = window.__editor.doc.entities.props.length;
      const placed = window.__editor.stampCustom("mobs/goblin.png", 300, 400);
      const after = window.__editor.doc.entities.props.length;
      const md = window.__editor.docToMapDoc(true);
      const refIds = md.assets ? Object.keys(md.assets) : [];
      // round-trip: from → to preserves the custom prop
      const back = window.__editor.docFromMapDoc(md);
      const cp = back.entities.props.find(p=>p.kind==="custom");
      return { placedOk: !!placed && placed.kind==="custom" && placed.asset==="mobs/goblin.png",
        grew: after===before+1, hasAssets: !!md.assets, refIds,
        onlyReferenced: refIds.length===1 && refIds[0]==="mobs/goblin.png",
        rtPreserved: !!cp && cp.asset==="mobs/goblin.png" && cp.w>0 && cp.h>0,
        embedHasDataUrl: !!(md.assets && md.assets["mobs/goblin.png"] && md.assets["mobs/goblin.png"].dataUrl) };
    });
    A(rt.placedOk && rt.grew, "AC3 stampCustom placed a kind:custom deco prop");
    A(rt.hasAssets && rt.embedHasDataUrl, "AC5 export embeds referenced asset dataUrl in md.assets");
    A(rt.onlyReferenced, `AC5 md.assets embeds ONLY referenced ids (${rt.refIds.join(",")})`);
    A(rt.rtPreserved, "AC5 docFromMapDoc(docToMapDoc(doc,true)) preserves the custom prop");

    // ---- write the edited map (with embed) to the bridge for the game step ----
    await p.evaluate(() => { const md=window.__editor.docToMapDoc(true); md.name="QA Custom";
      localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md)); });
    await p.close();
  }

  // =====================================================================
  // 2) AC4 PERSIST — a reload re-hydrates the palette from IndexedDB.
  // =====================================================================
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/editor.html`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__editor && window.__editor.doc", { timeout: 15000 });
    // reingestFromDB is async; wait for the palette to fill.
    await p.waitForFunction("window.__editor.listAssets().length>=4", { timeout: 8000 }).catch(()=>{});
    const persist = await p.evaluate(() => ({ list: window.__editor.listAssets().length,
      sw: document.querySelectorAll("#assetGroups .asw").length }));
    A(errs.length===0, `editor reload clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(persist.list===4, `AC4 IndexedDB reingest restored ${persist.list}/4 assets after reload`);
    A(persist.sw===4, `AC4 palette DOM rebuilt on reload (${persist.sw} swatches)`);
    // NOTE: the reload's light autosave rewrote the bridge WITHOUT md.assets (by design —
    // assets live in IndexedDB; Play re-embeds). Reproduce a real "Play" by writing the
    // embedded MapDoc to the bridge here, exactly as play() does.
    const rebridge = await p.evaluate(() => {
      const md = window.__editor.docToMapDoc(true); md.name = "QA Custom";
      localStorage.setItem("mithralda.mapdoc.v1", JSON.stringify(md));
      return { embedded: !!md.assets, refs: md.assets ? Object.keys(md.assets) : [] };
    });
    A(rebridge.embedded && rebridge.refs.includes("mobs/goblin.png"), `AC5 Play bridge re-embeds referenced assets after reload (${rebridge.refs.join(",")})`);
    await p.close();
  }

  // =====================================================================
  // 3) AC6 GAME RENDER — ?map=local reads md.assets; custom Image decodes; no errors.
  // =====================================================================
  {
    const { p, errs } = await newPage();
    await p.goto(`${srv.url}/index.html?map=local&dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(mi.fromMapDoc===true, "AC6 game built world FROM the custom MapDoc");
    A((await p.evaluate(()=>typeof window.__dev.customImgReady))==="function", "AC8 __dev.customImgReady present");
    // First call builds the Image (lazy) + starts the async decode; then poll until drawable.
    await p.evaluate(()=>window.__dev.customImgReady("mobs/goblin.png"));
    const ready = await p.waitForFunction("window.__dev.customImgReady('mobs/goblin.png')===true", { timeout: 15000, polling: 200 }).then(()=>true).catch(()=>false);
    A(ready, "AC6 custom uploaded sprite Image decoded & drawable in the game");
    A(errs.length===0, `AC6 game(?map=local) render clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    // guard: an unknown asset id skips silently (no crash) and reports not-ready.
    const missing = await p.evaluate(()=>window.__dev.customImgReady("does/not/exist.png"));
    A(missing===false, "AC6 unknown asset id ⇒ customImgReady false (silent skip, no crash)");
    await p.close();
  }

  // =====================================================================
  // 4) AC7 BYTE-SAFE — the default world (no ?map) is untouched.
  // =====================================================================
  {
    const { p, errs } = await newPage();
    await p.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch(e){} });
    await p.goto(`${srv.url}/index.html?dev`, { waitUntil: "networkidle0", timeout: 30000 });
    await p.waitForFunction("window.__dev && window.__dev.mapInfo", { timeout: 20000 });
    const mi = await p.evaluate(() => window.__dev.mapInfo());
    A(errs.length===0, `game(no ?map) boot clean (errs=${errs.length}${errs.length?": "+errs[0]:""})`);
    A(mi.fromMapDoc===false, "AC7 default world is NOT from a MapDoc (additive/untouched)");
    await p.close();
  }
} catch (e) {
  bad.push("EXCEPTION: " + (e && e.stack || e));
} finally {
  await browser.close(); await srv.close();
}

console.log("\n=== CAS-1716 custom-assets build QA ===");
for (const m of ok)  console.log("  PASS  " + m);
for (const m of bad) console.log("  FAIL  " + m);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
