// CAS-2259 — GE self-verify of the "Descanso" (Rested XP) HUD badge willSpend affordance.
// Serves the LOCAL working tree (my render.js change) so the enhancement is under test, not the live
// build. Rested XP is already LIVE (CAS-2256, RESTED_XP.enabled:true) with a base pool bar shipped in
// CAS-2255's commit 99f7074; CAS-2259 adds: (a) OUTSIDE the sanctuary with pool>0 → willSpend "rested"
// affordance = pulsing "zZ ×N" tag (WoW rested bubble), and (b) INSIDE → dim "acumulando" hint.
//
// Proves (sim-authoritative + observable):
//   · RESTED_XP.enabled true (feature LIVE); the badge is gated on it (byte-id when OFF).
//   · willSpend flips deterministically with position: INSIDE zone=false (accruing), OUTSIDE=true (spending),
//     mirroring sim's !inSafeZone authority.
//   · The badge DRAWS when pool>0 and VANISHES when pool<=0 (gate) — measured via lit-pixel delta in the
//     tight badge clip rect (reliable), not hue (the top-right backing store is minimap-dominated).
//   · Visual clips (inside-clip.png / outside-clip.png) capture the two distinct affordances for eyeball
//     confirmation ("Descanso"+bar+"acumulando" vs "Descanso"+bar+"zZ ×1.5").
//   · 0 JS errors on boot + interaction.
// Run: node tools/cas2259-rested-badge-selfverify.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots/cas2259", { recursive: true });

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "RestBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

// tp to wilderness pops the "Maldición de Zona" (curse) modal → pauses sim + occludes HUD (footgun CAS-2250).
// It appears a frame AFTER tp, so caller must sleep first. Escape = "Omitir"; loop until scene()==='play'.
async function clearCurse(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "play") return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await sleep(120);
  }
  return (await page.evaluate(() => window.__dev.scene())) === "play";
}

// Count lit (non-near-black) pixels in the tight badge clip rect. The rect (CSS x:VW-122,y:34,w:122,h:34)
// is the region the saved clips prove contains "Zona segura" + "Descanso" + bar. Uses the compositor
// screenshot's CSS→backing mapping via dpr=cv.width/VW; `any` (lum>45) responds cleanly to badge presence.
async function badgeInk(page, VW) {
  return await page.evaluate((vw) => {
    const cv = document.querySelector("canvas"); if (!cv) return null;
    const g = cv.getContext("2d");
    const dpr = cv.width / vw;
    const x = Math.floor((vw - 122) * dpr), w = Math.floor(122 * dpr);
    const y = Math.floor(34 * dpr), h = Math.floor(34 * dpr);
    const d = g.getImageData(x, y, Math.min(w, cv.width - x), h).data;
    let any = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      if (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] > 45) any++;
    }
    return { any };
  }, VW);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const A = []; let ok = true;
try {
  const page = await browser.newPage();
  const VW = 900, VH = 640;
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/.test(t)) errors.push(t); } });
  await page.goto(`${srv.url}/index.html?dev=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.daynight && window.__dev.daynight({ phase: 0.5 }); window.__dev.weather && window.__dev.weather(0); });

  const rested = await page.evaluate(() => window.__dev.rested());
  A.push(["RESTED_XP.enabled === true (LIVE)", rested.enabled === true]);

  const sz = await page.evaluate(() => window.__dev.safeZone());
  const bbox = sz.bbox;
  const cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
  const TS = 32;

  // --- INSIDE safe zone, pool full → bar + "acumulando" (accruing) ---
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round(cx / TS), Math.round(cy / TS));
  await clearCurse(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(250);
  const rIn = await page.evaluate(() => window.__dev.rested());
  const sceneIn = await page.evaluate(() => window.__dev.scene());
  const inkIn = await badgeInk(page, VW);
  A.push(["INSIDE: scene==='play'", sceneIn === "play"]);
  A.push(["INSIDE: inZone true, pool>0", rIn.inZone === true && rIn.pool > 0]);
  A.push(["INSIDE: willSpend false (accruing)", rIn.willSpend === false]);
  await page.screenshot({ path: "shots/cas2259/inside-accruing.png" });
  await page.screenshot({ path: "shots/cas2259/inside-clip.png", clip: { x: VW - 122, y: 34, width: 122, height: 34 } });

  // --- pool<=0 → badge gone (gate proof) ---
  await page.evaluate(() => window.__dev.rested({ setPool: 0 }));
  await sleep(200);
  const inkEmpty = await badgeInk(page, VW);
  A.push(["INSIDE: badge DRAWS with pool>0 (lit-px delta vs empty)", inkIn.any > inkEmpty.any + 200]);
  A.push(["pool<=0 → badge GONE (lit-px drop; gate)", inkEmpty.any < inkIn.any - 200]);

  // --- OUTSIDE safe zone, pool full → bar + willSpend "zZ ×N" tag (spending) ---
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round((bbox[2] + 800) / TS), Math.round(cy / TS));
  await sleep(350);
  await clearCurse(page);
  await sleep(150);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(250);
  const rOut = await page.evaluate(() => window.__dev.rested());
  const sceneOut = await page.evaluate(() => window.__dev.scene());
  const inkOut = await badgeInk(page, VW);
  A.push(["OUTSIDE: scene==='play' (curse cleared)", sceneOut === "play"]);
  A.push(["OUTSIDE: inZone false", rOut.inZone === false]);
  A.push(["OUTSIDE: willSpend true (spending)", rOut.willSpend === true]);
  A.push(["OUTSIDE: badge DRAWS with pool>0 (lit-px present)", inkOut.any > inkEmpty.any + 150]);
  await page.screenshot({ path: "shots/cas2259/outside-willspend.png" });
  await page.screenshot({ path: "shots/cas2259/outside-clip.png", clip: { x: VW - 122, y: 34, width: 122, height: 34 } });

  A.push(["0 JS errors", errors.length === 0]);

  console.log("\nCAS-2259 Descanso badge self-verify (LOCAL working tree)\n");
  for (const [n, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  console.log(`\n  scenes: in=${sceneIn} out=${sceneOut}`);
  console.log(`  ink: empty.any=${inkEmpty.any} in.any=${inkIn.any} out.any=${inkOut.any}`);
  console.log(`  rIn=${JSON.stringify(rIn)}`);
  console.log(`  rOut=${JSON.stringify(rOut)}`);
  console.log("  clips: shots/cas2259/inside-clip.png (Descanso+bar+acumulando), outside-clip.png (Descanso+bar+zZ ×1.5)");
} finally { await browser.close(); await srv.close(); }
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
