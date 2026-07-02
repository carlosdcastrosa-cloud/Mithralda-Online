// ---------------------------------------------------------------------------
// CAS-117 QA — LIVE probe for rarity + affixes on the DEPLOYED build (inside
// the Higgsfield iframe). Drives the SAME __dev hooks the game runs
// (tpZone/seed/spawnKill/pickup/bag/equipPreview/equipBag/gear/heroStats/saveNow)
// to prove CAS-117 shipped live (not a stale cache) and the whole feature works
// on the live URL:
//   - AC1 TIERS: drops carry rarity; higher rarities stay rarer (weighted).
//   - AC2 AFFIXES: uncommon+ roll 1-2 real affixes (epics 2), commons none.
//   - AC2 COMBAT: equipping affixed gear moves real combat numbers (daño/vida/
//     vel.ataque/vel.mov/on-hit) — via equipPreview + a live equip→heroStats.
//   - AC3 DECISION: equipPreview exposes equipped-vs-new affixes + stat deltas.
//   - AC4 PERSIST: rarity + affixes survive a real reload.
//   - 60fps + 0 JS errors live.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas117-affix-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas117-affix-live.png");
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
async function enterAs(fr, name = "AffixQA") {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
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

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  let fr = await gameFrame(page);
  // ensure a clean hero (clear any sibling-session save, reload to menu)
  await fr.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  fr = await gameFrame(page);
  await enterAs(fr);
  check("live: booted into play (CAS-117 hooks present)", await fr.evaluate(() => typeof window.__dev.equipPreview === "function"));

  // AC1 + AC2: rarity histogram + affix-by-rarity on a live abyss drop pool
  const sample = await fr.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(7777);
    const rar = {}; const byRar = { common: [], uncommon: [], rare: [], epic: [] };
    for (let i = 0; i < 300; i++) {
      for (const d of window.__dev.spawnKill("wraith")) if (d.kind === "gear") { rar[d.rarity] = (rar[d.rarity] || 0) + 1; byRar[d.rarity] && byRar[d.rarity].push((d.affixes || []).length); }
      window.__dev.pickup();
    }
    return { rar, byRar };
  });
  const r = sample.rar;
  check("AC1: rarity tiers present + decreasing (common≥uncommon≥rare≥epic)",
    (r.common || 0) > 0 && (r.common || 0) >= (r.uncommon || 0) && (r.uncommon || 0) >= (r.rare || 0) && (r.rare || 0) >= (r.epic || 0), r);
  const commonA = sample.byRar.common, aboveA = [].concat(sample.byRar.uncommon, sample.byRar.rare, sample.byRar.epic), epicA = sample.byRar.epic;
  check("AC2: commons roll 0 affixes; uncommon+ roll 1-2 (epics 2) — no filler",
    commonA.length > 0 && commonA.every((n) => n === 0) && aboveA.length > 0 && aboveA.every((n) => n >= 1) && (epicA.length === 0 || epicA.every((n) => n === 2)),
    { common: [...new Set(commonA)], abovePlus: [...new Set(aboveA)], epic: [...new Set(epicA)] });

  // AC2 combat: equip an affixed piece live and read heroStats deltas
  const combat = await fr.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(2024);
    for (let i = 0; i < 120; i++) { window.__dev.spawnKill("wraith"); window.__dev.pickup(); }
    const bag = window.__dev.bag();
    const moved = { dmg: false, hp: false, atkspd: false, movespd: false, onhit: false };
    for (let i = 0; i < bag.length; i++) {
      const pv = window.__dev.equipPreview(i); if (!pv) continue; const ids = (bag[i].affixes || []).map((a) => a.id);
      if (ids.includes("dmg") && pv.after.dmg > pv.before.dmg) moved.dmg = true;
      if (ids.includes("hp") && pv.after.hp > pv.before.hp) moved.hp = true;
      if (ids.includes("atkspd") && pv.after.af.atkspd > pv.before.af.atkspd) moved.atkspd = true;
      if (ids.includes("movespd") && pv.after.af.movespd > pv.before.af.movespd) moved.movespd = true;
      if (ids.includes("onhit") && pv.after.af.onhit > pv.before.af.onhit) moved.onhit = true;
    }
    let bi = -1, bv = -1; bag.forEach((b, i) => { const w = (b.affixes || []).reduce((s, a) => s + a.amt, 0); if (w > bv) { bv = w; bi = i; } });
    const before = window.__dev.heroStats(); if (bi >= 0) window.__dev.equipBag(bi); const after = window.__dev.heroStats();
    return { moved, before, after, item: bi >= 0 ? bag[bi] : null };
  });
  const movedN = Object.values(combat.moved).filter(Boolean).length;
  check("AC2: affix types move real combat numbers (≥3, incl daño & vida)", movedN >= 3 && combat.moved.dmg && combat.moved.hp, combat.moved);
  check("AC2: live equip changed HUD stats (daño/vida/vel.)",
    combat.after.dmg !== combat.before.dmg || combat.after.maxHp !== combat.before.maxHp || combat.after.moveSpeed !== combat.before.moveSpeed || combat.after.affix.atkspd !== combat.before.affix.atkspd,
    { before: { dmg: combat.before.dmg, maxHp: combat.before.maxHp, mov: combat.before.moveSpeed, atk: combat.before.affix.atkspd }, after: { dmg: combat.after.dmg, maxHp: combat.after.maxHp, mov: combat.after.moveSpeed, atk: combat.after.affix.atkspd } });

  // AC3 decision: equipPreview returns full compare snapshot
  const pv = await fr.evaluate(() => { const bag = window.__dev.bag(); let i = bag.findIndex((b) => (b.affixes || []).length > 0); if (i < 0) i = 0; return window.__dev.equipPreview(i); });
  check("AC3: equipPreview exposes equipped-vs-new affixes + deltas (the decision)",
    pv && pv.equipped && pv.candidate && Array.isArray(pv.candidate.affixes) && typeof pv.after.dmg === "number",
    pv ? { eq: pv.equipped.rarity + "/" + pv.equipped.affixes.length, nw: pv.candidate.rarity + "/" + pv.candidate.affixes.length, dDmg: pv.after.dmg - pv.before.dmg, dHp: pv.after.hp - pv.before.hp } : null);

  // AC4 persistence: equip an affixed piece, save, reload, compare signature
  const pre = await fr.evaluate(() => {
    const bag = window.__dev.bag(); const i = bag.findIndex((b) => (b.affixes || []).length > 0); if (i >= 0) window.__dev.equipBag(i); window.__dev.saveNow();
    const g = window.__dev.gear(); const sig = g.equip.map((e) => e.slot + ":" + e.rarity + ":" + (e.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|");
    return { sig, affix: g.affix };
  });
  await page.reload({ waitUntil: "load", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 20000 });
  const post = await fr.evaluate(() => { const g = window.__dev.gear(); const sig = g.equip.map((e) => e.slot + ":" + e.rarity + ":" + (e.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|"); return { sig, affix: g.affix }; });
  check("AC4: rarity + affixes survived a live reload (localStorage)", pre.sig === post.sig && JSON.stringify(pre.affix) === JSON.stringify(post.affix), { pre: pre.sig, post: post.sig });

  // fps + inventory screenshot
  const fps = await fr.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const tick = () => { n++; if (performance.now() - t0 >= 1000) res(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }); return n; });
  check("60fps held live", fps >= 50, { fps });
  await fr.evaluate(() => window.__dev.openInv());
  await sleep(300);
  writeFileSync(SHOT, await page.screenshot());
  check("inventory screenshot saved", true, SHOT);

  check("zero JS errors live", report.errors.length === 0, report.errors.slice(0, 5));
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check("harness threw", false, e.stack || e.message);
} finally {
  await browser.close();
}
console.log("\n===CAS117_LIVE_REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END_REPORT===");
console.log(report.pass ? "\n✓ CAS-117 LIVE affix probe PASSED on the deployed build." : "\n✗ CAS-117 LIVE affix probe FAILED.");
process.exit(report.pass ? 0 : 1);
