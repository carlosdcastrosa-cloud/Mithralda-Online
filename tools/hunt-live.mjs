// ---------------------------------------------------------------------------
// CAS-63 — LIVE hunt-contract probe. Drives the deployed build (inside the
// Higgsfield iframe) through the SAME __dev hooks: cull -> Champion -> clear ->
// guaranteed reward, plus a short FPS sample. Read-only on the shared env (only
// throwaway client-session enemies). Prints JSON + exits non-zero on FAIL.
//
// Run: node tools/hunt-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterAs(fr) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "HuntQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play on live build", true);

  // hunt __dev API present on live (proves the new build, not a stale cache)
  const api = await fr.evaluate(() => ["huntState", "huntKillChampion"]
    .reduce((o, k) => (o[k] = typeof window.__dev[k] === "function", o), {}));
  const apiOk = api.huntState && api.huntKillChampion;
  check("hunt __dev API present on live build", apiOk, api);
  if (!apiOk) throw new Error("live build missing hunt hooks: " + JSON.stringify(api));

  for (const z of [{ zone: "ruins", base: "bandit", need: 12, minR: "rare", gold: 70 },
                   { zone: "arena", base: "orc", need: 14, minR: "rare", gold: 75 }]) {
    const r = await fr.evaluate((z) => {
      window.__dev.tpZone(z.zone); window.__dev.seed(1337);
      let champ = null;
      for (let i = 0; i < z.need; i++) { window.__dev.spawnKill(z.base); const s = window.__dev.huntState(z.zone); if (s.champ && !champ) champ = s.champ; }
      const kill = window.__dev.huntKillChampion(z.zone);
      return { champ, kill, after: window.__dev.huntState(z.zone) };
    }, z);
    const gear = (r.kill && r.kill.drops || []).find((d) => d.kind === "gear");
    const gold = (r.kill && r.kill.drops || []).find((d) => d.kind === "gold");
    check(`[${z.zone}] champion summoned`, !!r.champ, r.champ);
    check(`[${z.zone}] zone cleared`, !!(r.kill && r.kill.cleared && r.after.cleared));
    check(`[${z.zone}] guaranteed gear >= ${z.minR}`, !!(gear && RANK[gear.rarity] >= RANK[z.minR]), gear);
    check(`[${z.zone}] bonus ${z.gold} gold`, !!(gold && gold.amt === z.gold), gold);
  }

  // FPS sample on the live build
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round((frames * 1000) / (performance.now() - t0));
  });
  check("live FPS >= 55", fps >= 55, fps);

  check("zero page errors", report.errors.length === 0, report.errors);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.errors.push(`harness threw: ${e.stack || e.message}`);
  report.pass = false;
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
console.log(report.pass ? "\n✓ LIVE hunt-contract probe PASSED." : "\n✗ LIVE hunt-contract probe FAILED.");
process.exit(report.pass ? 0 : 1);
