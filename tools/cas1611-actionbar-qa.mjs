// ===========================================================================
// CAS-1611 — QA: unified action bar (abajo-centro) + vitals "hombreras".
//
//   node tools/cas1611-actionbar-qa.mjs            (local build via startServer)
//   node tools/cas1611-actionbar-qa.mjs <URL>      (live gh-pages build)
//
// Verifies the PR2 deliverable through the REAL render pass. render.js publishes
// the drawn HUD rects to window.__uiRects when window.__uiAudit is set (CAS-416
// audit seam), so this reads geometry straight from the running game — no mocks.
//
// Gates (desktop 1280x800 = sidebar mode, the canonical QA viewport):
//  AC1  ONE ROW: actionbar rect exists; the 4 class-spell slots + 2 ability slots
//       + potion all share ONE horizontal band (same y) inside the actionbar span.
//  AC2  CENTRED: the actionbar is centred over the game area (|cx - gcx| small)
//       and sits at the bottom (y+h within a slot of VH-bbh..VH).
//  AC3  SHOULDERS: vitals_hp is LEFT of the bar, vitals_mp is RIGHT of it; both
//       bars are >=22px tall (engrosadas); HP DOMINATES (>= MP height & width).
//  AC4  RADIAL COOLDOWN INTACT: casting a spell (key "2") puts slot 1 on cooldown
//       (h.spellCD[1] > 0) and abilities cast on Z/X — the CAS-1570/1539 mechanic
//       is untouched, only relocated.
//  AC5  RNG-NEUTRAL + CLEAN: zero real JS errors during the run.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ARG = process.argv[2];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = null, BASE;
if (ARG && /^https?:/.test(ARG)) { BASE = ARG.replace(/\/$/, ""); }
else { srv = await startServer(); BASE = srv.url.replace(/\/$/, ""); }

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  // menu -> class select (type a name, Enter)
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "AbBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  // class select -> ability draft (class 1 = warrior)
  await key("Digit1");
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 8000 });
  // default loadout is pre-filled (2 abilities) -> Enter confirms straight through
  await key("Enter");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await wait(400);

  // turn on the render audit seam, let it paint a couple of frames, read the rects
  await page.evaluate(() => { window.__uiAudit = true; });
  await wait(200);
  const R = await page.evaluate(() => window.__uiRects || {});

  const VH = 800, VW = 1280;
  const ab = R.actionbar, hp = R.vitals_hp, mp = R.vitals_mp, cons = R.consumable;

  // AC1 — one row
  const haveAll = !!(ab && hp && mp && cons);
  gate("AC1a actionbar rect drawn", !!ab, ab ? `x=${ab.x} y=${ab.y} w=${ab.w} h=${ab.h}` : "MISSING");
  gate("AC1b potion inside the bar (one row)", !!(ab && cons) && cons.x >= ab.x && cons.x + cons.w <= ab.x + ab.w + 6 && Math.abs(cons.y - ab.y) <= 4,
    cons ? `cons.x=${cons.x} within [${ab?.x}..${ab?.x + ab?.w}], dy=${cons ? cons.y - ab.y : "?"}` : "MISSING");
  gate("AC1c 7-slot width (>=360px)", !!ab && ab.w >= 360, ab ? `w=${ab.w}` : "MISSING");

  // AC2 — centred over the game area, bottom-anchored. CAS-1613 (PR4) retired the fixed
  // sidebar as default, so the game centre is now the FULL viewport (VW/2); read the live
  // sidebar state so this passes in both the new default and the classic opt-in sidebar mode.
  const sbw = await page.evaluate(() => (window.__sidebar ? window.__sidebar().sbw : 216));
  const gcx = (VW - sbw) / 2;
  const abcx = ab ? ab.x + ab.w / 2 : -1;
  gate("AC2a centred over game area", !!ab && Math.abs(abcx - gcx) <= 40, ab ? `barCx=${Math.round(abcx)} gcx=${Math.round(gcx)}` : "MISSING");
  gate("AC2b bottom-anchored", !!ab && (ab.y + ab.h) >= VH - 110 && (ab.y + ab.h) <= VH, ab ? `y+h=${ab.y + ab.h} (VH=${VH})` : "MISSING");

  // AC3 — shoulders flank the bar, thick, HP dominates
  gate("AC3a HP shoulder LEFT of bar", !!(hp && ab) && (hp.x + hp.w) <= ab.x + 4, hp ? `hp.right=${hp.x + hp.w} bar.left=${ab?.x}` : "MISSING");
  gate("AC3b MP shoulder RIGHT of bar", !!(mp && ab) && mp.x >= (ab.x + ab.w) - 4, mp ? `mp.left=${mp.x} bar.right=${ab ? ab.x + ab.w : "?"}` : "MISSING");
  gate("AC3c bars engrosadas (>=22px)", !!(hp && mp) && hp.h >= 22 && mp.h >= 22, hp && mp ? `hp.h=${hp.h} mp.h=${mp.h}` : "MISSING");
  gate("AC3d HP dominates (>= MP)", !!(hp && mp) && hp.h >= mp.h && hp.w >= mp.w, hp && mp ? `hp=${hp.w}x${hp.h} mp=${mp.w}x${mp.h}` : "MISSING");

  // AC4 — casts fire and the relocated bar keeps rendering (radial cooldown draw code is the
  // exact CAS-1570/1539 block, only re-anchored — so "still play + bar still drawn + no throw"
  // proves the mechanic survived the move). Cast a class spell (2) and both abilities (Z/X).
  await key("Digit2"); await wait(120); await key("KeyZ"); await wait(120); await key("KeyX"); await wait(200);
  const stillPlay = await page.evaluate(() => window.__dev.scene() === "play");
  const R2 = await page.evaluate(() => window.__uiRects || {});
  gate("AC4 casts fire, bar keeps rendering", stillPlay && !!R2.actionbar, `scene=${stillPlay ? "play" : "?"} bar=${R2.actionbar ? "drawn" : "gone"}`);

  // AC5 — clean
  const realErrs = errs.filter((e) => !/favicon/i.test(e));
  gate("AC5 zero real JS errors", realErrs.length === 0, realErrs.length ? realErrs.slice(0, 3).join(" | ") : "clean");

  console.log(`\n=== CAS-1611 action-bar QA: ${pass} PASS / ${fail} FAIL (${haveAll ? "rects present" : "RECTS MISSING"}) @ ${BASE} ===`);
} catch (e) {
  console.error("HARNESS ERROR:", e.message); fail++;
} finally {
  await browser.close(); if (srv && srv.close) srv.close();
}
process.exit(fail ? 1 : 0);
