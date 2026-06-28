// ---------------------------------------------------------------------------
// CAS-117 — rareza + afijos en el loot: drops with WEIGHT and a DECISION.
//
// Builds on CAS-116's drop→equip loop and proves the affix layer end to end
// through the SAME functions the game uses (rollGearInst → affixTotals →
// equippedDmg/heroMaxHp → equipBag → serializeSave):
//   1) TIERS — drops carry a readable rarity; higher tiers stay rarer (weighted).
//   2) AFFIXES present — every piece ABOVE common rolls 1-2 real affixes;
//      commons roll none (no cosmetic filler).
//   3) COMBAT MOVES — equipping an affixed piece changes observable combat
//      numbers: +daño (equippedDmg), +vida (heroMaxHp), +vel.ataque (atkspd),
//      +vel.mov (movespd), on-hit — checked via the real equipPreview + a live
//      equip→heroStats read.
//   4) DECISION — equipPreview surfaces equipped-vs-candidate affixes + the net
//      stat deltas BEFORE committing (the compare the player sees).
//   5) PERSISTENCE — rarity + affixes survive a real reload (localStorage).
//   6) DETERMINISM — same seed → identical affix rolls (Stage-2 server-ready).
//
// Run: node tools/cas117-affix.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas117-affix.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page, name = "AffixBot") {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate((nm) => {
    document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  }, name);
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
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
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // ---- (1) TIERS: rarity present, higher rarer; (2) AFFIX presence by rarity ----
  // Sample a big abyss drop pool (mixed rarity) and inspect rarity histogram +
  // affix counts. Abyss windows are tier-4 so we exercise the strongest rolls.
  const sample = await page.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(7777);
    const rar = {}; const byRar = { common: [], uncommon: [], rare: [], epic: [] };
    for (let i = 0; i < 300; i++) {
      for (const d of window.__dev.spawnKill("wraith")) if (d.kind === "gear") {
        rar[d.rarity] = (rar[d.rarity] || 0) + 1;
        byRar[d.rarity] && byRar[d.rarity].push((d.affixes || []).length);
      }
      window.__dev.pickup();
    }
    return { rar, byRar };
  });
  log(`   rarity histogram (300 abyss kills): ${JSON.stringify(sample.rar)}`);
  const r = sample.rar;
  const tieredOk = (r.common || 0) > 0 && (r.common || 0) >= (r.uncommon || 0) && (r.uncommon || 0) >= (r.rare || 0) && (r.rare || 0) >= (r.epic || 0);
  if (tieredOk) pass(`AC1: rarity tiers present and decreasing in frequency (common ≥ uncommon ≥ rare ≥ epic)`);
  else fail(`AC1: rarity frequencies not monotonically decreasing: ${JSON.stringify(r)}`);

  const commonAffix = (sample.byRar.common || []);
  const aboveAffix = [].concat(sample.byRar.uncommon || [], sample.byRar.rare || [], sample.byRar.epic || []);
  const epicAffix = (sample.byRar.epic || []);
  const noFiller = commonAffix.length > 0 && commonAffix.every((n) => n === 0);
  const aboveHaveAffix = aboveAffix.length > 0 && aboveAffix.every((n) => n >= 1);
  const epicTwo = epicAffix.length === 0 || epicAffix.every((n) => n === 2);
  log(`   affix counts: common=${[...new Set(commonAffix)]} uncommon+=${[...new Set(aboveAffix)]} epic=${[...new Set(epicAffix)]}`);
  if (noFiller && aboveHaveAffix && epicTwo) pass(`AC2: commons roll NO affixes; every uncommon+ rolls 1-2 (epics roll 2) — no cosmetic filler`);
  else fail(`AC2: affix-by-rarity rule violated (commonAllZero=${noFiller} aboveHaveAffix=${aboveHaveAffix} epicTwo=${epicTwo})`);

  // ---- (3) COMBAT MOVES: equipping affixed gear changes observable stats ----
  // Fill a bag from abyss epic drops (always 2 affixes), then for each affix type
  // found, use the REAL equipPreview to prove the matching combat field moves.
  const combat = await page.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(2024);
    for (let i = 0; i < 120; i++) { window.__dev.spawnKill("wraith"); window.__dev.pickup(); }
    const bag = window.__dev.bag();
    const moved = { dmg: false, hp: false, atkspd: false, movespd: false, onhit: false };
    let liveEquip = null;
    for (let i = 0; i < bag.length; i++) {
      const pv = window.__dev.equipPreview(i);
      if (!pv) continue;
      const ids = (bag[i].affixes || []).map((a) => a.id);
      if (ids.includes("dmg") && pv.after.dmg > pv.before.dmg) moved.dmg = true;
      if (ids.includes("hp") && pv.after.hp > pv.before.hp) moved.hp = true;
      if (ids.includes("atkspd") && pv.after.af.atkspd > pv.before.af.atkspd) moved.atkspd = true;
      if (ids.includes("movespd") && pv.after.af.movespd > pv.before.af.movespd) moved.movespd = true;
      if (ids.includes("onhit") && pv.after.af.onhit > pv.before.af.onhit) moved.onhit = true;
    }
    // live equip: pick the bag item with the most affix weight and actually equip it,
    // reading heroStats before/after to prove the HUD numbers (dmg/maxHp/moveSpeed) shift.
    let bi = -1, bv = -1;
    bag.forEach((b, i) => { const w = (b.affixes || []).reduce((s, a) => s + a.amt, 0); if (w > bv) { bv = w; bi = i; } });
    const before = window.__dev.heroStats();
    if (bi >= 0) { window.__dev.equipBag(bi); liveEquip = bag[bi]; }
    const after = window.__dev.heroStats();
    return { moved, liveEquip, before, after };
  });
  log(`   affix→combat moved: ${JSON.stringify(combat.moved)}`);
  const movedTypes = Object.values(combat.moved).filter(Boolean).length;
  if (movedTypes >= 3 && combat.moved.dmg && combat.moved.hp)
    pass(`AC2: ${movedTypes}/5 affix types shift real combat numbers via equipPreview (incl. +daño & +vida)`);
  else fail(`AC2: too few affix types moved combat stats: ${JSON.stringify(combat.moved)}`);
  log(`   live equip ${combat.liveEquip ? combat.liveEquip.name + " " + JSON.stringify((combat.liveEquip.affixes || []).map((a) => a.id + "+" + a.amt)) : "(none)"}`);
  log(`   heroStats before: dmg=${combat.before.dmg} maxHp=${combat.before.maxHp} moveSpeed=${combat.before.moveSpeed} atkspd=${combat.before.affix.atkspd}%`);
  log(`   heroStats after:  dmg=${combat.after.dmg} maxHp=${combat.after.maxHp} moveSpeed=${combat.after.moveSpeed} atkspd=${combat.after.affix.atkspd}%`);
  const liveChanged = combat.after.dmg !== combat.before.dmg || combat.after.maxHp !== combat.before.maxHp ||
    combat.after.moveSpeed !== combat.before.moveSpeed || combat.after.affix.atkspd !== combat.before.affix.atkspd;
  if (liveChanged) pass(`AC2: live equip changed the HUD combat stats (daño/vida/vel.)`);
  else fail(`AC2: live equip did not change any HUD stat`);

  // ---- (4) DECISION: equipPreview exposes the equipped-vs-new tradeoff ----
  const decision = await page.evaluate(() => {
    const bag = window.__dev.bag();
    let idx = bag.findIndex((b) => (b.affixes || []).length > 0);
    if (idx < 0) idx = 0;
    const pv = window.__dev.equipPreview(idx);
    return { idx, has: bag.length, pv };
  });
  const pv = decision.pv;
  const decisionOk = pv && pv.equipped && pv.candidate && pv.before && pv.after &&
    Array.isArray(pv.candidate.affixes) && typeof pv.after.dmg === "number" && typeof pv.before.dmg === "number";
  if (decisionOk) {
    pass(`AC3: equipPreview surfaces equipped(${pv.equipped.rarity}, ${pv.equipped.affixes.length} afx) vs new(${pv.candidate.rarity}, ${pv.candidate.affixes.length} afx) + deltas dmg ${pv.before.dmg}→${pv.after.dmg}, hp ${pv.before.hp}→${pv.after.hp}`);
  } else fail(`AC3: equipPreview did not return a full compare snapshot: ${JSON.stringify(pv)}`);

  // ---- (5) PERSISTENCE: rarity + affixes survive a reload ----
  const pre = await page.evaluate(() => {
    // equip a known-affixed bag item so an EQUIPPED piece (not just bag) round-trips
    const bag = window.__dev.bag();
    const i = bag.findIndex((b) => (b.affixes || []).length > 0);
    if (i >= 0) window.__dev.equipBag(i);
    window.__dev.saveNow();
    const g = window.__dev.gear();
    const sig = (arr) => arr.map((e) => e.slot + ":" + e.rarity + ":" + (e.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|");
    const bagSig = window.__dev.bag().filter((b) => (b.affixes || []).length).map((b) => b.slot + ":" + (b.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|");
    return { equipSig: sig(g.equip), affix: g.affix, bagSig };
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 15000 });
  const post = await page.evaluate(() => {
    const g = window.__dev.gear();
    const sig = (arr) => arr.map((e) => e.slot + ":" + e.rarity + ":" + (e.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|");
    const bagSig = window.__dev.bag().filter((b) => (b.affixes || []).length).map((b) => b.slot + ":" + (b.affixes || []).map((a) => a.id + a.amt).sort().join(",")).join("|");
    return { equipSig: sig(g.equip), affix: g.affix, bagSig };
  });
  log(`   pre  equip: ${pre.equipSig}`);
  log(`   post equip: ${post.equipSig}`);
  const persisted = pre.equipSig === post.equipSig && JSON.stringify(pre.affix) === JSON.stringify(post.affix) && pre.bagSig === post.bagSig;
  if (persisted) pass(`AC4: rarity + affixes survived reload (equipped + bag, localStorage round-trip)`);
  else fail(`AC4: affixes did not survive reload\n   pre=${JSON.stringify(pre)}\n   post=${JSON.stringify(post)}`);

  // ---- (6) DETERMINISM: same seed → identical affix rolls ----
  const affSeq = () => {
    window.__dev.tpZone("abyss"); window.__dev.seed(99001);
    const seq = [];
    for (let i = 0; i < 80; i++) { for (const d of window.__dev.spawnKill("wraith")) if (d.kind === "gear") seq.push(`${d.slot}:${d.rarity}:` + (d.affixes || []).map((a) => a.id + a.amt).join(",")); window.__dev.pickup(); }
    return seq;
  };
  const seqA = await page.evaluate(affSeq);
  await page.evaluate(() => { try { window.__dev.noSave(); window.__dev.clearSave(); } catch (e) {} });
  const fresh = await browser.newPage();
  await fresh.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(fresh, "AffixBot2");
  const seqB = await fresh.evaluate(affSeq);
  await fresh.close();
  if (seqA.length > 0 && JSON.stringify(seqA) === JSON.stringify(seqB)) pass(`AC: determinism — same seed → identical ${seqA.length}-item affix roll sequence (Stage-2 ready)`);
  else fail(`determinism mismatch (A=${seqA.length} B=${seqB.length})`);

  // inventory screenshot (equip doll w/ affix lines + bag dots + compare box)
  await page.evaluate(() => window.__dev.openInv());
  await new Promise((r) => setTimeout(r, 250));
  writeFileSync(SHOT, await page.screenshot());
  pass(`inventory screenshot saved: ${SHOT}`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\n✓ CAS-117 affix system passed: rarity + affixes give drops weight + a real equip decision."
       : "\n✗ CAS-117 affix system FAILED.");
process.exit(ok ? 0 : 1);
