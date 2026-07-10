// ===========================================================================
// CAS-1811 (QA for CAS-1808) — LIVE QA: z-order tileset fix. Verifies the
// CAS-1809 build (deployed by CAS-1810, overlay build cf6f04509803) on the
// canonical gh-pages URL. PASS x2 (desktop+mobile), browser-per-pass.
//
// Bug (CAS-1807): a FULL tileset fill drew the hero BELOW the tiles. Root cause:
// sliced tileset cells (kind:"custom" carrying d.sw, CAS-1729) were pushed to
// `order`/G._decoOrder and y-sorted with the hero in renderEntities; cells at
// y>hero.y sorted after the hero ⇒ hero buried.
//
// Fix (render/render.js deco loop): a custom stamp carrying d.sw blits INLINE in
// the ground pass (before renderEntities) then `continue` (never pushed to order)
// ⇒ hero/mobs always y-sort ABOVE it (FLOOR layer). Full-sheet custom stamps (no
// d.sw, CAS-1716) still flow into `order` and y-sort ⇒ an intentional prop occluder
// still overlaps by depth (byte-identical to HEAD). sim/mapdoc.js untouched ⇒
// export/save byte-id, 0-RNG, $0 art.
//
//   node tools/cas1811-zorder-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1809 build touched exactly ONE runtime blob — HARD md5 gate):
//   render/render.js   (sim/mapdoc.js is UNCHANGED ⇒ also md5-gated for AC3)
//
// AUTHORITATIVE FUNCTIONAL PROOF (AC1/AC2): mirror of the build harness
// tools/cas1808-zorder.mjs, but extracts the REAL deco for-loop verbatim from the
// SERVED render.js bytes (not local) and executes it with fake ctx/customImg
// bindings — proving the SHIPPED code emits the sliced cell inline as floor and
// keeps full-sheet stamps y-sorted. Plus an IN-GAME injection screenshot: a real
// sliced tileset cell + a full-sheet stamp are pushed into the running world.deco
// over the hero, screenshotted, and pixel-checked (hero punches through the floor
// cell; the full-sheet stamp occludes).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
// render.js = the only overlay blob; mapdoc.js = the model that MUST stay byte-id (AC3).
const FILES = ["render/render.js", "sim/mapdoc.js"];
const OUT = "shots/cas1811"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const J = (v) => JSON.stringify(v);
// Baseline = the z-order DEPLOY commit (CAS-1810 → build cf6f04509803). We assert
// "live serves exactly the z-order deploy tree" for these blobs.
const REF = process.env.ZORDER_REF || "d4d6424";
const refMd5 = (f) => md5(execSync(`git show ${REF}:${f}`).toString());

async function pollBuild(headHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt); if (lastMd5[f] !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

// ---- Faithful loop extraction (mirror tools/cas1808-zorder.mjs) over SERVED bytes ----
// Extract the REAL deco loop verbatim and execute it with controlled bindings so we
// verify the SHIPPED source's emission order, not a copy.
function runServedLoopChecks(gate, servedRender) {
  const START = "for(const d of world.deco){ if(d.x<vL";
  const END = "\n    for(const c of world.chests)";
  const s0 = servedRender.indexOf(START), s1 = servedRender.indexOf(END, s0);
  if (s0 < 0 || s1 < 0) { gate("FAITHFUL/extract", false, "could not locate deco loop in served render.js"); return; }
  const LOOP = servedRender.slice(s0, s1);
  gate("SEAM/inline-branch", /d\.kind==="custom" && d\.sw/.test(LOOP), "served deco loop guards inline branch on d.kind===custom && d.sw");
  gate("SEAM/continue", LOOP.includes("continue;"), "served: sliced cell short-circuits with continue (not pushed to order)");
  gate("SEAM/0-RNG", !/Math\.random|createRNG|rrng|\brng\b/.test(LOOP), "AC3: served deco loop touches NO random stream");

  const runRaw = new Function("world", "order", "customImg", "ctx", "vL", "vR", "vT", "vB", `${LOOP}\nreturn order;`);
  const runLoop = (deco, order, customImg, ctx, ...b) => runRaw({ deco }, order, customImg, ctx, ...b);
  const fakeCtx = () => { const calls = []; return { calls, drawImage: (...a) => calls.push(a) }; };
  const FAKE_IMG = { complete: true, naturalWidth: 64, naturalHeight: 64 };
  const customImg = () => FAKE_IMG;
  const B = [-1e6, 1e6, -1e6, 1e6];
  const HERO_Y = 500;
  const cell = (extra) => ({ x: 400, y: HERO_Y + 100, kind: "custom", asset: "t", ...extra });
  const SLICED = { sx: 0, sy: 0, sw: 32, sh: 32, w: 32, h: 32 };
  const SHEET = { w: 48, h: 64 };

  // AC1: a sliced tileset cell BELOW the hero draws INLINE, never enters order.
  { const ctx = fakeCtx(), order = []; runLoop([cell(SLICED)], order, customImg, ctx, ...B);
    gate("AC1/inline-floor", ctx.calls.length === 1 && order.length === 0 && ctx.calls[0].length === 9 && ctx.calls[0][1] === 0 && ctx.calls[0][3] === 32,
      `served: sliced cell (y>hero.y) blitted INLINE in ground pass (1×9-arg drawImage), NOT y-sorted ⇒ hero draws ABOVE it`); }

  // AC2: a full-sheet stamp (no d.sw) still flows to order and y-sorts as occluder.
  { const ctx = fakeCtx(), order = []; runLoop([cell(SHEET)], order, customImg, ctx, ...B);
    const inlineOk = ctx.calls.length === 0 && order.length === 1 && order[0].y === HERO_Y + 100;
    const list = [order[0], { y: HERO_Y, tag: "hero" }].sort((a, b) => a.y - b.y);
    const occludes = list[0].tag === "hero" && list[1] === order[0];
    order[0].draw(); const drawOk = ctx.calls.length === 1 && ctx.calls[0].length === 5;
    gate("AC2/full-sheet-ysort", inlineOk && occludes && drawOk,
      `served: full-sheet stamp deferred to order @authored y, y-sort keeps it ABOVE hero when placed below (5-arg whole-sheet blit) — occluder preserved`); }

  // MIX + cull + undecoded guard (regression coverage from the build harness).
  { const ctx = fakeCtx(), order = []; runLoop([cell(SLICED), cell({ ...SLICED, x: 432 }), cell(SHEET), cell({ ...SLICED, x: 464 })], order, customImg, ctx, ...B);
    gate("AC1/mix", ctx.calls.length === 3 && order.length === 1, `served: mixed list ⇒ 3 sliced cells inline floor, only full-sheet stamp deferred`); }
  { const ctx = fakeCtx(), order = []; runLoop([{ x: -9999, y: -9999, kind: "custom", asset: "t", ...SLICED }], order, customImg, ctx, -100, 100, -100, 100);
    gate("CULL", ctx.calls.length === 0 && order.length === 0, `served: off-screen sliced cell skipped (no inline draw, no order push)`); }
  { const ctx = fakeCtx(), order = []; runLoop([cell(SLICED)], order, () => null, ctx, ...B);
    gate("GUARD", ctx.calls.length === 0 && order.length === 0, `served: undecoded sliced cell ⇒ no crash, no draw, no order push`); }
}

function watch(page) {
  const errs = [];
  page.on("pageerror", e => { if (!/favicon/.test(e.message)) errs.push("pageerror: " + e.message); });
  page.on("console", m => { const t = m.text(); if (m.type() === "error" && !/favicon/.test(t) && !/Failed to load resource/.test(t)) errs.push("console: " + t); });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/version\.json/.test(r.url())) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
}

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "ZorderQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Inject a real sliced tileset cell + a full-sheet stamp into the RUNNING world.deco
// over the hero, using a solid MAGENTA custom asset. Screenshot + coarse pixel check:
// the sliced cell is FLOOR ⇒ hero punches through (less magenta over the hero region);
// the full-sheet stamp OCCLUDES ⇒ more magenta over the hero region.
async function ingameInjection(page, label) {
  return await page.evaluate(async () => {
    const url = new URL("sim/sim.js", location.href).href;
    const m = await import(url);
    const world = m.world, G = m.G;
    if (!world || !G || !G.hero) return { ok: false, err: "no world/hero" };
    // solid magenta 64x64 data URL
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const cx = c.getContext("2d"); cx.fillStyle = "#ff00ff"; cx.fillRect(0, 0, 64, 64);
    const dataUrl = c.toDataURL("image/png");
    world.customAssets = world.customAssets || {};
    world.customAssets["qacell"] = { dataUrl };
    // trigger decode via the render-side ready probe
    for (let i = 0; i < 60; i++) { if (window.__dev.customImgReady("qacell")) break; await new Promise(r => setTimeout(r, 50)); }
    const ready = window.__dev.customImgReady("qacell");
    const h = G.hero;
    // snapshot to restore after
    window.__zSaved = world.deco.slice();
    window.__zBox = null;
    return { ok: true, ready, hx: Math.round(h.x), hy: Math.round(h.y) };
  });
}

// count magenta-ish pixels in the central hero region of the canvas screenshot.
async function magentaOverHero(page) {
  return await page.evaluate(() => {
    const cv = document.querySelector("canvas"); if (!cv) return -1;
    const g = cv.getContext("2d"); if (!g) return -1;
    // sample a 60x60 CSS-px box around canvas center (hero is camera-centered)
    const W = cv.width, H = cv.height; const cxp = W >> 1, cyp = H >> 1; const R = 40;
    let mag = 0, tot = 0;
    try {
      const d = g.getImageData(cxp - R, cyp - R, R * 2, R * 2).data;
      for (let i = 0; i < d.length; i += 4) { tot++; const r = d[i], gg = d[i + 1], b = d[i + 2]; if (r > 180 && b > 180 && gg < 110) mag++; }
    } catch (e) { return -2; }
    return tot ? Math.round((mag / tot) * 1000) / 10 : 0;
  });
}

async function runOnce(label, viewport, headHashes, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate (live == HEAD) ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`AC0/md5/${f}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }
    gate("AC3/mapdoc-byteid", liveMd5["sim/mapdoc.js"] === headHashes["sim/mapdoc.js"], "sim/mapdoc.js served == HEAD ⇒ export/save byte-identical (model intact)");

    // ---- AUTHORITATIVE functional proof: run the REAL deco loop from SERVED bytes ----
    runServedLoopChecks(gate, servedText["render/render.js"] || "");

    // ---- LIVE boot + in-game injection screenshots ----
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try { for (const k of ["save", "pacts", "codex", "titles", "arena", "meta"]) localStorage.removeItem("mithralda." + k + ".v1"); } catch (e) {}
      window.__frames = 0; const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });
    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live tiled-world hero)");

    const inj = await ingameInjection(page, label);
    gate("INJECT/asset", !!inj.ok && inj.ready, inj.ok ? `magenta custom asset decoded (hero @ ${inj.hx},${inj.hy})` : `err=${inj.err}`);

    // AC1 in-game: sliced tileset cell over the hero ⇒ FLOOR ⇒ hero punches through.
    await page.evaluate(async () => {
      const m = await import(new URL("sim/sim.js", location.href).href); const world = m.world, h = m.G.hero;
      world.deco.length = 0;
      world.deco.push({ x: h.x, y: h.y + 26, kind: "custom", asset: "qacell", sx: 0, sy: 0, sw: 64, sh: 64, w: 64, h: 64 });
    });
    await wait(250);
    await page.screenshot({ path: `${OUT}/${label}-ac1-slicedcell-floor.png` }).catch(() => {});
    const magFloor = await magentaOverHero(page);

    // AC2 in-game: full-sheet stamp (no d.sw) at y>hero.y ⇒ y-sorts ABOVE ⇒ occludes hero.
    await page.evaluate(async () => {
      const m = await import(new URL("sim/sim.js", location.href).href); const world = m.world, h = m.G.hero;
      world.deco.length = 0;
      world.deco.push({ x: h.x, y: h.y + 26, kind: "custom", asset: "qacell", w: 64, h: 64 });
    });
    await wait(250);
    await page.screenshot({ path: `${OUT}/${label}-ac2-fullsheet-occludes.png` }).catch(() => {});
    const magSheet = await magentaOverHero(page);

    // restore
    await page.evaluate(async () => { const m = await import(new URL("sim/sim.js", location.href).href); m.world.deco.length = 0; if (window.__zSaved) m.world.deco.push(...window.__zSaved); }).catch(() => {});

    gate("AC1/ingame-floor", magFloor >= 0 && magSheet >= 0 && magFloor < magSheet,
      `hero region magenta: floor-cell=${magFloor}% < full-sheet=${magSheet}% ⇒ sliced cell renders UNDER hero, full-sheet OVER (fix confirmed in vivo)`);
    gate("AC2/ingame-occlude", magSheet > magFloor, `full-sheet stamp occludes hero (${magSheet}% vs ${magFloor}%) — y-sort occluder preserved`);

    // ---- PERF: 60fps in play ----
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("PERF/60fps", fps >= 45, `${fps}fps`);

    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("REG/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean");
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headHashes = Object.fromEntries(FILES.map((f) => [f, refMd5(f)]));
console.log(`CAS-1811 LIVE QA — z-order tileset fix @ ${BASE}\nREF ${REF} md5:`, headHashes);
let servedText = {};
try { const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); console.log(`live build=${v.build}`); } catch {}
for (const f of FILES) { try { servedText[f] = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text(); } catch {} }

let totalPass = 0, totalFail = 0;
for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headHashes, servedText);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}
console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1811 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
