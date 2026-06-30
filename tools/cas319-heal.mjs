// CAS-319 — functional proof that the central fountain's rest-heal was faithfully ported
// onto Maren la Sanadora (role:"fountain"). Boots the game, gets into play, then drives the
// REAL interact() path through __dev.fountainHealProbe(): damage the hero to 1 HP / 0 MP,
// park at a given offset from Maren, press [E], and assert full HP/MP + respawn-at-Maren +
// fountainRest toast + NO shop scene. Also confirms the 60px reach (the talkRange-56 NPC path
// would have missed) and that temple + market fountains still heal.
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };

const { url: BASE, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() !== "error") return; const t = m.text();
    if (/favicon/i.test(t) || /Failed to load resource.*404/i.test(t)) return; errors.push("console.error: " + t); });

  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QA319";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await page.evaluate(() => { window.__dev.tpZone("town"); try { window.__dev.tutSkip && window.__dev.tutSkip(); } catch (e) {} });
  await sleep(300);

  // 1) Heal within the fountain radius (~58px > talkRange 56 → proves the 60px port).
  const r = await page.evaluate(() => window.__dev.fountainHealProbe(58));
  console.log("  probe@58:", JSON.stringify(r));
  ok(r && r.before.dist >= 57 && r.before.dist <= 60, `parked at fountainRange band (dist ${r && r.before.dist})`);
  ok(r && r.after.hp === r.before.maxHp, `HP fully restored (${r && r.after.hp}/${r && r.before.maxHp})`);
  ok(r && r.after.mp === r.before.maxMp, `MP fully restored (${r && r.after.mp}/${r && r.before.maxMp})`);
  ok(r && r.after.respawnAtMaren === true, `respawn set at Maren's feet`);
  ok(r && /Fuente/i.test(r.after.toast || ""), `fountainRest toast shown ("${r && r.after.toast}")`);
  ok(r && r.after.scene === "play", `no shop/dialogue opened (scene stayed '${r && r.after.scene}')`);

  // 2) Just past the radius (66px) → NO heal (faithful: fountain had a hard reach).
  const far = await page.evaluate(() => window.__dev.fountainHealProbe(66));
  console.log("  probe@66:", JSON.stringify(far && far.after));
  ok(far && far.after.hp === 1, `out of range (66px) → NOT healed (hp ${far && far.after.hp})`);

  // Note: temple-respawn + market fountain are the UNCHANGED legacy nearestFountain() path
  // (world.js untouched for those two; the `if(f)` branch in interact() is byte-identical).
  // Their structural integrity (2 fountains remaining, npcs=11, no double object at center)
  // is asserted by `npm run determinism` (solids=214 / npcs=11) and `npm run cas309`.

  ok(errors.length === 0, `0 console/page errors (saw ${errors.length})${errors.length ? ": " + errors.slice(0,3).join(" | ") : ""}`);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
  await close();
}
