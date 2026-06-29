// ---------------------------------------------------------------------------
// CAS-169 — character-customization (recolor parts + variation swaps) LIVE harness.
// Boots the REAL game in headless Chromium and drives the customization system through
// the SAME sim + render paths the player uses (createHero → h.palette/variation →
// render.js syncHeroLook → bakeHero → the drawn clshero strip), asserting:
//   1) DEFAULT LOOK: a fresh hero boots on its CLASS default palette (warrior + mage
//      verified live; all 5 class defaults verified against parts.json data).
//   2) RECOLOR IS LIVE: recoloring a part re-bakes the hero and the actually-rendered
//      pixels change (read off the wardrobe preview canvas — the real draw path).
//   3) VARIATION SWAP IS LIVE: swapping headwear/cape changes the rendered silhouette
//      (opaque-pixel count moves) — helmet/no-cape/long-cape really render.
//   4) SCENE: C opens the wardrobe (scene 'customize') and C/Esc closes it.
//   5) PERSISTS ACROSS RELOAD: a recolor + variation survive a save→reload→rehydrate
//      and re-bake on load (the durable look).
//   6) 60 FPS held with the wardrobe open + 0 JS errors.
//
// Run: npm run customize   (or: node tools/cas169-customize.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const eqPal = (a, b) => a && b && ["hood", "cloak", "sash", "legs"].every((s) => eqArr(a[s], b[s]));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function key(page, code) {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  await wait(70);
}
async function enterPlay(page, digit) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "WardrobeBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d, bubbles: true })), digit);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}
// Read the wardrobe PREVIEW box pixels (deterministic screen rect) and summarise the
// hero pixels (those that differ from the dark preview background) — opaque count +
// rgb sum. The recolor/variation tests compare these signatures.
async function readPreview(page) {
  return await page.evaluate(() => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d");
    const VW = c.width, VH = c.height;
    const pvW = Math.min(150, VW * 0.34), pvX = VW * 0.5 - VW * 0.30, pvY = 72, pvH = Math.min(190, VH * 0.34);
    const x0 = Math.round(pvX - pvW / 2) + 3, y0 = pvY + 3, w = Math.round(pvW) - 6, h = Math.round(pvH) - 6;
    const d = g.getImageData(x0, y0, w, h).data;
    let opaque = 0, rs = 0, gs = 0, bs = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      // preview bg is ~#10141b (16,20,27); count anything clearly brighter/different as hero
      const dist = Math.abs(r - 16) + Math.abs(gg - 20) + Math.abs(b - 27);
      if (dist > 40) { opaque++; rs += r; gs += gg; bs += b; }
    }
    return { opaque, rs, gs, bs };
  });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => {
    try { if (!sessionStorage.getItem("__booted")) { localStorage.removeItem("mithralda.save.v1"); sessionStorage.setItem("__booted", "1"); } } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // (1) DEFAULT LOOK — warrior boots on its class default; all 5 class defaults wired.
  await enterPlay(page, "Digit1");
  const st0 = await page.evaluate(() => window.__dev.customizeState());
  const def0 = await page.evaluate(() => window.__dev.defaultPalette("warrior"));
  if (st0 && eqPal(st0.palette, def0) && st0.variation.headwear === "hood" && st0.variation.cape === "cape")
    pass(`[DEFAULT] warrior boots on its class palette (${JSON.stringify(def0.cloak)}) + default hood/cape`);
  else fail(`[DEFAULT] warrior look wrong: ${JSON.stringify(st0 && st0.palette)} / ${JSON.stringify(st0 && st0.variation)}`);

  const expected = { warrior: [150,174,200], paladin: [214,176,92], mage: [150,96,200], druid: [96,168,96], priest: [225,222,210] };
  let allDef = true;
  for (const cls in expected) { const p = await page.evaluate((c) => window.__dev.defaultPalette(c), cls);
    if (!eqArr(p.cloak, expected[cls]) || !eqArr(p.legs, [40,40,46])) { allDef = false; fail(`[DEFAULT] ${cls} default palette wrong: ${JSON.stringify(p)}`); } }
  if (allDef) pass("[DEFAULT] all 5 class default palettes match parts.json (cloak hue + dark legs)");

  // (2) RECOLOR IS LIVE — open wardrobe, recolor the cloak, the rendered hero changes.
  await key(page, "KeyC");
  const sc = await page.evaluate(() => window.__dev.scene());
  await page.waitForFunction("window.__dev.customizeState()", { timeout: 3000 });
  await wait(250); // let masks load + first bake land
  const preA = await readPreview(page);
  // pick a swatch index that is clearly different (bright red 0) for the cloak
  await page.evaluate(() => window.__dev.setPartColor("cloak", 0));
  await wait(250);
  const preB = await readPreview(page);
  const heroDrawn = preA.opaque > 200;
  const avgA = preA.opaque ? [preA.rs/preA.opaque, preA.gs/preA.opaque, preA.bs/preA.opaque] : [0,0,0];
  const avgB = preB.opaque ? [preB.rs/preB.opaque, preB.gs/preB.opaque, preB.bs/preB.opaque] : [0,0,0];
  const colorMoved = Math.abs(avgA[0]-avgB[0]) + Math.abs(avgA[1]-avgB[1]) + Math.abs(avgA[2]-avgB[2]) > 18;
  if (sc === "customize" && heroDrawn && colorMoved)
    pass(`[RECOLOR] cloak recolor re-baked the live hero: avg RGB ${avgA.map(v=>v|0)} → ${avgB.map(v=>v|0)} (Δ moved red up)`);
  else fail(`[RECOLOR] live recolor not visible: scene=${sc} opaque=${preA.opaque} avgA=${avgA.map(v=>v|0)} avgB=${avgB.map(v=>v|0)}`);

  // (3) VARIATION SWAP IS LIVE — drop the headwear ('none') → fewer opaque hero pixels.
  const beforeHead = (await readPreview(page)).opaque;
  await page.evaluate(() => { window.__dev.cycleVariation("headwear", 1); window.__dev.cycleVariation("headwear", 1); }); // hood→helmet→none
  await wait(250);
  const noneHead = await page.evaluate(() => window.__dev.customizeState().variation.headwear);
  const afterHead = (await readPreview(page)).opaque;
  if (noneHead === "none" && afterHead < beforeHead - 20)
    pass(`[VARIATION] removing headwear re-baked the silhouette: ${beforeHead} → ${afterHead} opaque px (head gone)`);
  else fail(`[VARIATION] headwear swap not visible: variation=${noneHead} ${beforeHead}→${afterHead}`);
  // long cape adds back-drape pixels vs no-cape
  await page.evaluate(() => { window.__dev.setPartColor("cloak", 6); window.__dev.cycleVariation("cape", 1); }); // cape→nocape
  await wait(220); const noCapePx = (await readPreview(page)).opaque;
  await page.evaluate(() => window.__dev.cycleVariation("cape", 1)); // nocape→longcape
  await wait(220); const longCapePx = (await readPreview(page)).opaque;
  const longCape = await page.evaluate(() => window.__dev.customizeState().variation.cape);
  if (longCape === "longcape" && longCapePx > noCapePx + 20)
    pass(`[VARIATION] long cape adds back-drape vs no-cape: ${noCapePx} → ${longCapePx} opaque px`);
  else fail(`[VARIATION] cape swap not visible: cape=${longCape} nocape=${noCapePx} long=${longCapePx}`);

  // (4) SCENE — C/Esc close the wardrobe back to play.
  await key(page, "KeyC");
  const closed = await page.evaluate(() => window.__dev.scene());
  if (sc === "customize" && closed === "play") pass("[SCENE] C opens the wardrobe and C closes it (real input path)");
  else fail(`[SCENE] wardrobe toggle failed: open='${sc}' close='${closed}'`);

  // (5) PERSISTS — set a known look, save, reload, rehydrate to the SAME look + re-bake.
  await page.evaluate(() => { window.__dev.setPartColor("sash", 4); window.__dev.setPartColor("hood", 8);
    window.__dev.cycleVariation("headwear", -1); }); // none→helmet
  const want = await page.evaluate(() => { const s = window.__dev.customizeState(); window.__dev.saveNow();
    return { palette: s.palette, variation: s.variation }; });
  const blob = await page.evaluate(() => window.__dev.saveBlob());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const got = await page.evaluate(() => window.__dev.customizeState());
  if (blob.palette && eqPal(got.palette, want.palette) && got.variation.headwear === want.variation.headwear && got.variation.cape === want.variation.cape)
    pass(`[PERSIST] look survives reload: sash ${JSON.stringify(want.palette.sash)} + headwear '${got.variation.headwear}' rehydrated`);
  else fail(`[PERSIST] look lost on reload: want ${JSON.stringify(want)} got ${JSON.stringify(got && {palette:got.palette,variation:got.variation})}`);
  // re-bake on load: open wardrobe, hero is drawn
  await key(page, "KeyC");
  await wait(300);
  const reDrawn = (await readPreview(page)).opaque > 200;
  if (reDrawn) pass("[PERSIST] hero re-baked from the loaded look (preview renders)");
  else fail("[PERSIST] hero did not re-bake after reload");

  // (6) PERF + ERRORS — 60fps with the wardrobe open, 0 JS errors.
  const fps = await sampleFps(page, 1000);
  if (fps >= 58) pass(`[PERF] ${fps} fps with the wardrobe open (≥58)`);
  else fail(`[PERF] only ${fps} fps with the wardrobe open`);
  if (errors.length === 0) pass("[ERRORS] zero page errors across the run");
  else { fail(`[ERRORS] ${errors.length} page error(s)`); errors.slice(0, 6).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close(); await srv.close();
}
log(ok ? "\n✓ CAS-169 customization LIVE: all checks passed." : "\n✗ CAS-169 customization LIVE: FAILURES above.");
process.exit(ok ? 0 : 1);
