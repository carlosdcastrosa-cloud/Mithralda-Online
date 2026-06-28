// ---------------------------------------------------------------------------
// CAS-114 — LIVE probe for the power-gated Abismo on the DEPLOYED build (inside
// the Higgsfield iframe). Drives the SAME __dev hooks the game uses to prove the
// new content shipped (not a stale cache) and behaves on the live URL:
//   - abyss __dev API present (abyssGate/setUpg/tryPortal) → proves the new build
//   - GATE LOCKED: fresh hero denied entry by the town portal
//   - GATE OPEN: investing upgrade tiers warps the hero into the abyss
//   - return portal warps back to town
//   - abyss tier (5) strictly out-scales arena (4); capstone payoff = epic + 360 gold
//   - short FPS sample, 0 JS errors
// Read-only on the shared env (only throwaway client-session state). Prints JSON.
//
// Run: node tools/abyss-live.mjs
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
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

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
  await fr.evaluate(() => { document.getElementById("nameInput").value = "AbyssQA";
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
  // a save from a prior session would skip the menu; clear it then reload to the menu flow.
  for (const f of page.frames()) { try { await f.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} }); } catch {} }
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play on live build", true);

  // abyss __dev API present on live (proves the new build, not a stale cache)
  const api = await fr.evaluate(() => ["abyssGate", "setUpg", "tryPortal"]
    .reduce((o, k) => (o[k] = typeof window.__dev[k] === "function", o), {}));
  const apiOk = api.abyssGate && api.setUpg && api.tryPortal;
  check("abyss __dev API present on live build", apiOk, api);
  if (!apiOk) throw new Error("live build missing abyss hooks: " + JSON.stringify(api));

  // GATE LOCKED → DENIED
  const locked = await fr.evaluate(() => {
    const g0 = window.__dev.abyssGate();
    const attempt = window.__dev.tryPortal("abyss");
    return { g0, attempt };
  });
  check("gate LOCKED for fresh hero", locked.g0 && !locked.g0.unlocked && locked.g0.power < locked.g0.req, locked.g0);
  check("locked portal DENIED entry", locked.attempt && locked.attempt.after !== "abyss", locked.attempt);

  // GATE OPEN → WARP
  const opened = await fr.evaluate(() => {
    const power = window.__dev.setUpg(4, 4, 0);
    const g = window.__dev.abyssGate();
    const warp = window.__dev.tryPortal("abyss");
    return { power, g, warp };
  });
  check("gate OPENS past the threshold", opened.g && opened.g.unlocked, opened.g);
  check("open portal WARPED into the Abismo", opened.warp && opened.warp.after === "abyss", opened.warp);

  // RETURN
  const back = await fr.evaluate(() => window.__dev.tryPortal("town"));
  check("return portal warped back to town", back && back.after === "town", back);

  // HARDER than arena
  const cmp = await fr.evaluate(() => ({ arena: window.__dev.zoneTier("arena", "orc"), abyss: window.__dev.zoneTier("abyss", "orc") }));
  const a = cmp.arena, b = cmp.abyss;
  check("abyss strictly out-scales arena", b && a && b.tier === 5 && b.hp > a.hp && b.dmg > a.dmg && b.xp > a.xp, cmp);

  // CAPSTONE payoff
  const cap = await fr.evaluate(() => {
    window.__dev.setUpg(4, 4, 0); window.__dev.tpZone("abyss"); window.__dev.seed(1337);
    let champ = null;
    for (let i = 0; i < 16; i++) { window.__dev.spawnKill("wraith"); const s = window.__dev.huntState("abyss"); if (s.champ && !champ) champ = s.champ; }
    const kill = window.__dev.huntKillChampion("abyss");
    return { champ, kill, after: window.__dev.huntState("abyss") };
  });
  check("capstone 'Tirano del Abismo' summoned", cap.champ && cap.champ.capstone && cap.champ.name === "Tirano del Abismo", cap.champ);
  check("capstone cleared the abyss", cap.kill && cap.kill.cleared && cap.after.cleared, cap.after);
  const gear = (cap.kill && cap.kill.drops || []).find((d) => d.kind === "gear");
  const gold = (cap.kill && cap.kill.drops || []).find((d) => d.kind === "gold");
  check("guaranteed epic drop", gear && RANK[gear.rarity] >= RANK.epic, gear);
  check("richest bonus gold (360)", gold && gold.amt === 360, gold);

  // FPS sample
  const fps = await fr.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { function tick() { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(); } requestAnimationFrame(tick); });
    return frames;
  });
  check("FPS >= 55 on live", fps >= 55, { fps });

  report.errors = report.errors.filter((e) => !/favicon/i.test(e));
  check("0 JS errors", report.errors.length === 0, report.errors);

  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  report.errors.push(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
for (const c of report.checks) console.log(`${c.ok ? "✔" : "✖"} ${c.name}`);
console.log(report.pass ? "\nABYSS LIVE: PASS" : "\nABYSS LIVE: FAIL");
process.exit(report.pass ? 0 : 1);
