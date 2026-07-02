// ---------------------------------------------------------------------------
// CAS-119 QA — LIVE probe for the TALENT TREE on the DEPLOYED build (inside the
// Higgsfield iframe). Drives the SAME __dev hooks the game runs to prove the
// talent layer shipped live (not a stale cache) and works end-to-end on the live
// URL against every acceptance gate:
//   1) GRANT: granting points raises the pool visibly (talentState.pts) — AC1.
//   2) PANEL DATA: 5 DISTINCT class trees, each ≥6 nodes / 3 branches / a real
//      exclusive fork — AC2/AC4.
//   3) OBSERVABLE COMBAT: a spent point MOVES real numbers (dmg/maxHp); a druid
//      poison-on-hit node makes a REAL hit ignite veneno (reuses CAS-118) — AC3.
//   4) EXCLUSIVE FORK: after taking one fork side the other is NOT allocatable — AC4.
//   5) PERSIST: a built hero survives a real reload — AC5.
//   6) RESPEC: refund returns spent points + wipes the build.
//   7) 60fps with the panel open over a live pack + 0 JS errors live — AC6.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas119-talents-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas119-talents-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

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
async function enterAs(fr, digit = "Digit1", name = "TalentQA") {
  // NOTE: must NOT call noSave() here — suppress() lasts the whole page life and would
  // make a later saveNow() a no-op (breaks the persist test). The wipe-before-reload is
  // done by reEnter() on the OLD frame instead, so saving stays enabled on THIS page.
  await fr.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await fr.waitForFunction("window.__dev.scene()==='menu' || window.__dev.scene()==='play'", { timeout: 20000 });
  if (await fr.evaluate(() => window.__dev.scene()) === "play") return; // already in a run
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
// Switch class on the live build = wipe save + reload the top page, re-find the frame.
async function reEnter(page, digit) {
  let fr = await gameFrame(page);
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  fr = await gameFrame(page);
  await enterAs(fr, digit);
  return fr;
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  let fr = await gameFrame(page);
  await enterAs(fr, "Digit1");
  check("entered play live as warrior", true);

  // hooks present live (proves the new code shipped, not a stale cache)
  const hooksOk = await fr.evaluate(() => !!(window.__dev.talentState && window.__dev.talentTree && window.__dev.allocTalent && window.__dev.grantTalentPts && window.__dev.respecTalents && window.__dev.canAlloc));
  check("CAS-119 talent dev hooks present on live build", hooksOk);

  // (1) GRANT
  const g0 = await fr.evaluate(() => window.__dev.talentState());
  const g1 = await fr.evaluate(() => { window.__dev.grantTalentPts(6); return window.__dev.talentState(); });
  check("AC1 grant: talent points granted & tracked", g1.pts === g0.pts + 6 && g1.spent === 0, { from: g0.pts, to: g1.pts });

  // (2) PANEL DATA — distinct trees, 3 branches, ≥6 nodes, real exclusive fork.
  const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
  const trees = await fr.evaluate((cs) => Object.fromEntries(cs.map((c) => [c, window.__dev.talentTree(c)])), CLASSES);
  let treesOk = true; const sig = new Set();
  for (const c of CLASSES) { const t = trees[c]; const groups = {};
    if (t) for (const n of t.nodes) if (n.excl) groups[n.excl] = (groups[n.excl] || 0) + 1;
    const fork = Object.values(groups).some((v) => v >= 2);
    sig.add(t ? t.nodes.map((n) => n.id).join(",") : "");
    if (!(t && t.nodes.length >= 6 && t.branches.length === 3 && fork)) treesOk = false;
  }
  check("AC2/AC4 data: 5 distinct trees (≥6 nodes / 3 branches / exclusive fork)", treesOk && sig.size === 5, { distinct: sig.size });

  // (3) OBSERVABLE COMBAT — +daño & +vida move real numbers.
  const before = g1.combat;
  const c3 = await fr.evaluate(() => { window.__dev.allocTalent("wA1"); return window.__dev.allocTalent("wB1").state; });
  check("AC3 combat: a spent point MOVED real numbers (dmg/maxHp)", c3.combat.dmg > before.dmg && c3.combat.maxHp > before.maxHp, { dmg: [before.dmg, c3.combat.dmg], maxHp: [before.maxHp, c3.combat.maxHp] });

  // (4) EXCLUSIVE FORK on the warrior w_cap (wA3/wA4), prereq wA2.
  const fork = await fr.evaluate(() => {
    window.__dev.grantTalentPts(4); window.__dev.allocTalent("wA2");
    const a = window.__dev.allocTalent("wA3"); const other = window.__dev.canAlloc("wA4");
    return { took: a.ok, ranks: a.state.ranks, canOther: other };
  });
  check("AC4 fork: taking one exclusive side locks the other", fork.took && fork.ranks.wA3 > 0 && fork.canOther === false, fork);

  // (3b) druid poison-on-hit reuses CAS-118 — REAL hit ignites veneno.
  fr = await reEnter(page, "Digit4");
  const pois = await fr.evaluate(() => {
    window.__dev.grantTalentPts(2); const a = window.__dev.allocTalent("dA1");
    window.__dev.tpZone("forest"); window.__dev.statusArena("orc", 30, 0);
    const after = window.__dev.heroHit();
    return { ok: a.ok, poisonOnHit: a.state.tt.poisonOnHit, dots: after && after.dots };
  });
  check("AC3 combat: druid 'Savia tóxica' envenena en un golpe REAL (reuses CAS-118)", pois.ok && pois.poisonOnHit > 0 && pois.dots && !!pois.dots.poison, pois.dots && pois.dots.poison);

  // (5) PERSIST — a built warrior survives a real reload.
  fr = await reEnter(page, "Digit1");
  const built = await fr.evaluate(() => {
    window.__dev.grantTalentPts(5);
    window.__dev.allocTalent("wA1"); window.__dev.allocTalent("wA1"); window.__dev.allocTalent("wB1");
    window.__dev.saveNow(); return window.__dev.talentState();
  });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 20000 });
  const reloaded = await fr.evaluate(() => window.__dev.talentState());
  check("AC5 persist: build survived reload (ranks + points + combat)",
    reloaded.ranks.wA1 === built.ranks.wA1 && reloaded.ranks.wB1 === built.ranks.wB1 &&
    reloaded.pts === built.pts && reloaded.combat.dmg === built.combat.dmg,
    { built: built.ranks, reloaded: reloaded.ranks, pts: reloaded.pts });

  // (6) RESPEC
  const respec = await fr.evaluate(() => window.__dev.respecTalents());
  check("respec: refunded spent points + wiped build", respec.refunded === (reloaded.ranks.wA1 + reloaded.ranks.wB1) && respec.state.spent === 0, { refunded: respec.refunded });

  // (7) FPS with the panel open over a live pack + open the real panel for the shot.
  await fr.evaluate(() => {
    window.__dev.tpZone("abyss");
    ["orc", "wraith", "mage", "wolf", "bandit", "bat"].forEach((t, i) => window.__dev.spawn(t, 70 * Math.cos(i), 70 * Math.sin(i)));
    window.__dev.grantTalentPts(4); window.__dev.allocTalent("wA1");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyT", key: "t", bubbles: true }));
  });
  await fr.waitForFunction("window.__dev.scene()==='talents'", { timeout: 4000 }).catch(() => {});
  const fps = await fr.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(tick); }));
  check("AC6 fps: held >=58 with the talent panel open over a live pack", fps >= 58, { fps });

  await sleep(150);
  await page.screenshot({ path: SHOT });
  check("talent panel screenshot saved", true, SHOT);

  check("AC6 zero JS errors live", report.errors.length === 0, report.errors);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check("harness threw", false, String(e && e.stack || e));
} finally {
  await browser.close();
}
console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END===");
console.log(report.pass ? "\n✓ CAS-119 LIVE talent probe PASSED." : "\n✗ CAS-119 LIVE talent probe FAILED.");
process.exit(report.pass ? 0 : 1);
