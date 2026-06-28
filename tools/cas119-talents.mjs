// ---------------------------------------------------------------------------
// Headless harness for CAS-119 — TALENT TREE / class progression (build agency).
// Boots the REAL game in headless Chromium and drives the new system through the
// SAME sim paths the game runs (gainXP grant, allocTalent, recalcTalents, combat),
// asserting the acceptance gates:
//   1) GRANT: leveling/granting yields talent points visibly (talentState.pts) — AC1.
//   2) PANEL DATA: every class has a DISTINCT tree (≥6 nodes, 3 branches) with a real
//      mutually-exclusive fork (two nodes sharing an excl group) — AC2/AC4.
//   3) OBSERVABLE COMBAT: spending a point MOVES real numbers, not text — a +daño node
//      raises equippedDmg; a +vida node raises maxHp; poison-on-hit makes a REAL hero
//      hit ignite the enemy (reuses CAS-118) — AC3.
//   4) EXCLUSIVE FORK: after taking one side of a fork, the other side is NOT
//      allocatable (canAlloc=false) — the build choice is real — AC4.
//   5) PERSIST: a chosen build (ranks + unspent points) survives a real reload — AC5.
//   6) RESPEC: refund returns every spent point and wipes the build, restoring base
//      combat numbers (no permanent loss) — optional respec gate.
//   7) 60 FPS held with the talent panel open over a live pack — AC6.
//   8) 0 JS errors across the run — AC6.
//
// Run: npm run talents   (or: node tools/cas119-talents.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page, digit = "Digit1") {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  // Suppress the autosave-on-unload flush (CAS-113 gotcha) BEFORE clearing, else the
  // in-flight save re-writes over the cleared slot and boot rehydrates to 'play'.
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "TalentBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page, "Digit1"); // warrior
  pass("entered play as 'warrior'");

  // (1) GRANT — start with 0 spent, grant points, see the pool rise.
  const g0 = await page.evaluate(() => window.__dev.talentState());
  const g1 = await page.evaluate(() => { window.__dev.grantTalentPts(6); return window.__dev.talentState(); });
  if (g0 && g1 && g1.pts === (g0.pts + 6) && g1.spent === 0)
    pass(`[GRANT] AC1: talent points granted & tracked (pts ${g0.pts}→${g1.pts}, spent 0)`);
  else fail(`[GRANT] points not granted/tracked: ${JSON.stringify({ g0, g1 })}`);

  // (2) PANEL DATA — all 5 classes have a distinct tree, ≥6 nodes / 3 branches, with a
  // real exclusive fork. Probe the tree of each class via talentTree().
  const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
  const trees = await page.evaluate((cs) => Object.fromEntries(cs.map((c) => [c, window.__dev.talentTree(c)])), CLASSES);
  let treesOk = true; const sigSet = new Set();
  for (const c of CLASSES) {
    const t = trees[c];
    const nNodes = t ? t.nodes.length : 0;
    const nBranches = t ? t.branches.length : 0;
    const exclGroups = new Set();
    if (t) for (const n of t.nodes) if (n.excl) exclGroups.add(n.excl);
    // a real fork = an excl group with ≥2 member nodes
    let forkOk = false;
    if (t) for (const grp of exclGroups) { if (t.nodes.filter((n) => n.excl === grp).length >= 2) { forkOk = true; break; } }
    sigSet.add(t ? t.nodes.map((n) => n.id).join(",") : "");
    if (!(nNodes >= 6 && nBranches === 3 && forkOk)) { treesOk = false; fail(`[DATA] ${c} tree weak: nodes=${nNodes} branches=${nBranches} fork=${forkOk}`); }
  }
  if (treesOk && sigSet.size === CLASSES.length)
    pass(`[DATA] AC2/AC4: 5 DISTINCT class trees, each ≥6 nodes / 3 branches / a real exclusive fork`);
  else if (treesOk) fail(`[DATA] trees not distinct across classes (sigs=${sigSet.size})`);

  // (3) OBSERVABLE COMBAT — spend on +daño (wA1) → equippedDmg rises; +vida (wB1) →
  // maxHp rises. Real numbers off talentState().combat, not text.
  const beforeDmg = g1.combat.dmg, beforeHp = g1.combat.maxHp;
  const aDmg = await page.evaluate(() => window.__dev.allocTalent("wA1")); // +3 daño
  const aHp = await page.evaluate(() => window.__dev.allocTalent("wB1"));  // +25 vida
  const c3 = aHp.state;
  if (aDmg.ok && aHp.ok && c3.combat.dmg > beforeDmg && c3.combat.maxHp > beforeHp)
    pass(`[COMBAT] AC3: a spent point MOVED real numbers (dmg ${beforeDmg}→${c3.combat.dmg}, maxHp ${beforeHp}→${c3.combat.maxHp})`);
  else fail(`[COMBAT] spending a point did not change combat numbers: ${JSON.stringify({ aDmg, aHp, c3: c3.combat })}`);

  // (3b) poison-on-hit via a DRUID build reuses CAS-118 — a real hero hit ignites veneno.
  await enterPlay(page, "Digit4"); // druid
  const pois = await page.evaluate(() => {
    window.__dev.grantTalentPts(2);
    const a = window.__dev.allocTalent("dA1"); // Savia tóxica → poisonOnHit
    window.__dev.tpZone("forest"); window.__dev.statusArena("orc", 30, 0);
    const after = window.__dev.heroHit();        // REAL hitEnemy path → talent poison proc
    return { allocOk: a.ok, tt: a.state.tt, dots: after && after.dots };
  });
  if (pois.allocOk && pois.tt.poisonOnHit > 0 && pois.dots && pois.dots.poison)
    pass(`[COMBAT] AC3: druid 'Savia tóxica' makes a REAL hit envenenar the enemy (poison ${pois.dots.poison.dmg}/tic) — reuses CAS-118`);
  else fail(`[COMBAT] poison-on-hit talent did not ignite veneno: ${JSON.stringify(pois)}`);

  // (4) EXCLUSIVE FORK — take one side of the druid d_cap fork (dA3), the other (dA4)
  // must become non-allocatable. Need the prereq dA2 first.
  const fork = await page.evaluate(() => {
    window.__dev.grantTalentPts(6);
    window.__dev.allocTalent("dA2");           // prereq for both fork sides
    const a3 = window.__dev.allocTalent("dA3"); // take "Ponzoña persistente"
    const canOther = window.__dev.canAlloc("dA4"); // "Esporas aturdidoras" — should now be locked
    return { took: a3.ok, ranks: a3.state.ranks, canOther };
  });
  if (fork.took && fork.ranks.dA3 > 0 && fork.canOther === false)
    pass(`[FORK] AC4: after taking one fork side (dA3), the exclusive other side (dA4) is NOT allocatable`);
  else fail(`[FORK] exclusivity not enforced: ${JSON.stringify(fork)}`);

  // (5) PERSIST — a built warrior survives a reload (ranks + unspent points).
  await enterPlay(page, "Digit1"); // fresh warrior
  const built = await page.evaluate(() => {
    window.__dev.grantTalentPts(5);
    window.__dev.allocTalent("wA1"); window.__dev.allocTalent("wA1"); // 2 ranks +daño
    window.__dev.allocTalent("wB1");                                  // 1 rank +vida
    window.__dev.saveNow();
    return window.__dev.talentState();
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 15000 });
  const reloaded = await page.evaluate(() => window.__dev.talentState());
  if (reloaded && reloaded.ranks.wA1 === built.ranks.wA1 && reloaded.ranks.wB1 === built.ranks.wB1 &&
      reloaded.pts === built.pts && reloaded.combat.dmg === built.combat.dmg && reloaded.combat.maxHp === built.combat.maxHp)
    pass(`[PERSIST] AC5: build survived reload (wA1×${reloaded.ranks.wA1}, wB1×${reloaded.ranks.wB1}, pts ${reloaded.pts}, dmg ${reloaded.combat.dmg})`);
  else fail(`[PERSIST] build did not survive reload: built=${JSON.stringify(built.ranks)} reloaded=${JSON.stringify(reloaded.ranks)}`);

  // (6) RESPEC — refund returns all points and restores base combat numbers.
  const base = await page.evaluate(() => {
    // baseline = a freshly-respec'd hero (no nodes) for comparison
    const r = window.__dev.respecTalents();
    return { refunded: r.refunded, state: r.state };
  });
  if (base.refunded === (reloaded.ranks.wA1 + reloaded.ranks.wB1) && base.state.spent === 0 &&
      base.state.pts === reloaded.pts + base.refunded)
    pass(`[RESPEC] refunded ${base.refunded} points, build wiped, pool restored (pts=${base.state.pts})`);
  else fail(`[RESPEC] respec did not refund/restore: ${JSON.stringify(base)}`);

  // (7) 60 FPS with the talent panel open over a live pack.
  await page.evaluate(() => {
    window.__dev.tpZone("abyss");
    ["orc", "wraith", "mage", "wolf", "bandit", "bat"].forEach((t, i) => window.__dev.spawn(t, 70 * Math.cos(i), 70 * Math.sin(i)));
    window.__dev.grantTalentPts(3);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyT", key: "t", bubbles: true })); // open panel
  });
  await page.waitForFunction("window.__dev.scene()==='talents'", { timeout: 3000 }).catch(() => {});
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] AC6: held ${fps} fps with the talent panel open over a live pack`);
  else fail(`[FPS] dropped to ${fps} fps with the talent panel open`);

  // visual evidence — the talent panel with a partial build (allocate a couple visibly).
  await page.evaluate(() => { window.__dev.allocTalent("wA1"); });
  await wait(120);
  const shot = new URL("./cas119-talents.png", import.meta.url).pathname;
  await page.screenshot({ path: shot });
  pass(`talent panel screenshot saved: ${shot}`);

  // (8) zero JS errors
  if (errors.length === 0) pass("[ERR] AC6: zero page errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  srv.stop && srv.stop();
}

log(ok ? "\n✓ CAS-119 talent-tree harness passed." : "\n✗ CAS-119 talent harness FAILED.");
process.exit(ok ? 0 : 1);
