// ---------------------------------------------------------------------------
// CAS-272 — game-feel v2 (post-v1 systems juice) live-verify.
// v1 combat juice shipped under CAS-127/273 (QA CAS-275 PASS). This pass closes the
// two genuine gaps found in the v2 audit — the BOON DRAFT's payoff + reveal:
//   • pickBoon now pays off by RARITY (rarity-coloured floater/aura, rarity-scaled
//     loot jingle reuse, legendary = lvlring + ember burst + small shake).
//   • draft cards REVEAL with a 190ms staggered pop (open/reroll/banish retrigger);
//     hit rects register full-size from frame 0; reduce-motion lands instantly.
// All presentation-only: no sim-RNG draws, no balance fields touched.
//
// Gates:
//   [1] BOOT      — 200 + build id + boot to play, no early JS errors.
//   [2] REVEAL    — openDraft → __draftPop key set; 3 draftRects live at frame 0;
//                   canvas actually animates (early≠settled pixels); shots for QA.
//   [3] COMMON    — pick common → floater col #cfd6e0 pop 1.5.
//   [4] RARE      — pick rare   → floater col #4db6ff pop 1.6.
//   [5] LEGENDARY — pick leg    → floater col #ffab2e pop 1.9 + lvlring + 8 flames
//                   + shake kick > 0.
//   [6] RM        — reduce-motion ON: leg pick shake delta 0, flames trimmed to 3,
//                   reveal is instant (early≈settled pixels).
//   [7] RECTS     — reroll retriggers pop key; rects stay 3 & full-size (input never
//                   waits on the tween).
//   [8] FPS/ERR   — ≥55fps in play with fx; 0 page errors whole run.
//
// Run (local worktree):  node tools/cas272-juice2.mjs --local
// Run (live gh-pages):   node tools/cas272-juice2.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
let ok = true;
const errors = [];
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const RAR_COL = { common: "#cfd6e0", rare: "#4db6ff", legendary: "#ffab2e" };
const HANDS = { common: ["stone", "ember", "venom"], rare: ["vamp", "ember", "venom"], legendary: ["nova", "ember", "venom"] };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… VERIFY LOCAL ${BASE}` : `… VERIFY LIVE ${BASE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const s = r.status(); if (s >= 400 && !/favicon/.test(r.url())) errors.push(`http ${s}: ${r.url()}`); });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  const shot = async (name) => { await page.screenshot({ path: join(__dir, name) }); };

  // [1] BOOT
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  log(`… build id: ${await page.evaluate(() => window.__BUILD || null).catch(() => null)}`);
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas272"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  if (errors.length === 0) pass("BOOT: play scene, 0 errors"); else fail(`BOOT errors: ${errors.join(" | ")}`);

  // expose module singletons (REAL objects, not copies) for probes
  await page.addScriptTag({ type: "module", content: `
    import { G } from "./sim/sim.js";
    import { ui } from "./input.js";
    window.__G = G; window.__ui = ui; window.__probesReady = true;` });
  await page.waitForFunction("window.__probesReady === true", { timeout: 8000 });

  // canvas sampler: mean abs pixel delta over the card strip between two instants
  const sampleCards = () => page.evaluate(() => {
    const cv = document.querySelector("canvas"); const c2 = cv.getContext("2d");
    const w = cv.width, h = cv.height;
    const d = c2.getImageData(Math.floor(w * 0.2), Math.floor(h * 0.28), Math.floor(w * 0.6), Math.floor(h * 0.4)).data;
    let s = 0; for (let i = 0; i < d.length; i += 40) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });
  const raf1 = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(1))));

  // [2] REVEAL (reduce-motion OFF)
  await page.evaluate(() => window.__dev.setReduceMotion(false));
  await page.evaluate(() => window.__dev.openDraft());
  await raf1();
  const rects0 = await page.evaluate(() => (window.__ui.draftRects || []).map((r) => ({ w: Math.round(r.w), h: Math.round(r.h) })));
  const popInfo = await page.evaluate(() => (window.__draftPop ? window.__draftPop() : null));
  const early = await sampleCards();
  await shot("cas272-reveal-mid.png");
  await sleep(600);
  const settled = await sampleCards();
  await shot("cas272-reveal-settled.png");
  const rectsOk = rects0.length === 3 && rects0.every((r) => r.w > 80 && r.h > 60);
  const animated = Math.abs(settled - early) / Math.max(1, settled) > 0.01;
  if (popInfo && popInfo.key && rectsOk && animated)
    pass(`REVEAL: pop key live, 3 full-size rects at frame 0 (${JSON.stringify(rects0[0])}), canvas animates (Δ ${(100 * Math.abs(settled - early) / settled).toFixed(1)}%)`);
  else fail(`REVEAL bad: popInfo=${JSON.stringify(popInfo)} rects=${JSON.stringify(rects0)} early=${early} settled=${settled}`);
  await page.evaluate(() => window.__dev.pickBoon(0)); // close

  // [3][4][5] rarity payoff — force each hand through the REAL pick path
  const pickRarity = (hand) => page.evaluate((hh) => {
    window.__dev.openDraft();
    window.__G.draft.choices = hh.slice(); window.__G.draftSel = 0;
    window.__G.fx.length = 0; const shakeBefore = window.__G.shake;
    const r = window.__dev.pickBoon(0);
    const fl = window.__dev.floaterDump(); const last = fl[fl.length - 1];
    return { ok: r.ok, scene: r.scene, col: last && last.col, pop: last && last.pop, txt: last && last.txt,
      fx: window.__G.fx.map((f) => f.kind), shakeDelta: +(window.__G.shake - shakeBefore).toFixed(2) };
  }, hand);
  for (const rar of ["common", "rare", "legendary"]) {
    const want = { common: 1.5, rare: 1.6, legendary: 1.9 }[rar];
    const r = await pickRarity(HANDS[rar]);
    const colOk = r.col === RAR_COL[rar], popOk = Math.abs(r.pop - want) < 0.01;
    if (rar !== "legendary") {
      if (r.ok && colOk && popOk && r.scene === "play") pass(`${rar.toUpperCase()}: floater '${r.txt}' col ${r.col} pop ${r.pop}`);
      else fail(`${rar.toUpperCase()} bad: ${JSON.stringify(r)}`);
    } else {
      const flames = r.fx.filter((k) => k === "flame").length;
      const legOk = r.fx.includes("lvlring") && r.fx.includes("buffaura") && flames === 8 && r.shakeDelta > 0;
      if (r.ok && colOk && popOk && legOk) pass(`LEGENDARY: col ${r.col} pop ${r.pop}, lvlring+aura+${flames} flames, shake +${r.shakeDelta}`);
      else fail(`LEGENDARY bad: ${JSON.stringify(r)}`);
    }
  }

  // [6] reduce-motion: shake gated to 0, burst trimmed, reveal instant
  await page.evaluate(() => window.__dev.setReduceMotion(true));
  const rm = await pickRarity(HANDS.legendary);
  const rmFlames = rm.fx.filter((k) => k === "flame").length;
  if (rm.ok && rm.shakeDelta === 0 && rmFlames === 3) pass(`RM: legendary pick shake delta 0, flames trimmed 8→${rmFlames}`);
  else fail(`RM bad: ${JSON.stringify(rm)}`);
  await page.evaluate(() => window.__dev.openDraft());
  await raf1();
  const rmEarly = await sampleCards(); await sleep(450); const rmSettled = await sampleCards();
  const rmStatic = Math.abs(rmSettled - rmEarly) / Math.max(1, rmSettled) < 0.005;
  if (rmStatic) pass(`RM REVEAL: instant (Δ ${(100 * Math.abs(rmSettled - rmEarly) / rmSettled).toFixed(2)}%)`);
  else fail(`RM REVEAL animates: early=${rmEarly} settled=${rmSettled}`);
  await page.evaluate(() => { window.__dev.pickBoon(0); window.__dev.setReduceMotion(false); });

  // [7] reroll retriggers the pop; rects stay full-size (needs a fresh charge → retryRun)
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => window.__dev.openDraft());
  await raf1();
  const k1 = await page.evaluate(() => window.__draftPop().key);
  const rr = await page.evaluate(() => window.__dev.rerollDraft());
  await raf1();
  const k2 = await page.evaluate(() => window.__draftPop().key);
  const rects1 = await page.evaluate(() => (window.__ui.draftRects || []).length);
  if (rr.ok && k2 !== k1 && rects1 === 3) pass(`REROLL: pop retriggered (key changed), 3 rects live`);
  else fail(`REROLL bad: ok=${rr.ok} k1=${k1} k2=${k2} rects=${rects1}`);
  await page.evaluate(() => window.__dev.pickBoon(0));
  await shot("cas272-postpick.png");

  // [8] FPS + errors
  await page.evaluate(() => window.__dev.juiceArena && window.__dev.juiceArena(10));
  let best = 0;
  for (let i = 0; i < 3; i++) {
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await sleep(600);
    const f1 = await page.evaluate(() => window.__frames);
    best = Math.max(best, Math.round(((f1 - f0) * 1000) / (Date.now() - t0)));
  }
  if (best >= 55) pass(`FPS: ${best}`); else fail(`FPS low: ${best}`);
  if (errors.length === 0) pass("ERRORS: 0 page errors whole run"); else fail(`ERRORS: ${errors.slice(0, 5).join(" | ")}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}
console.log(ok ? "ALL GREEN" : "FAILURES PRESENT");
process.exit(ok ? 0 : 1);
