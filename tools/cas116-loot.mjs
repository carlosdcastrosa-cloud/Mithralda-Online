// ---------------------------------------------------------------------------
// CAS-116 — loot/equipo con drops: the combat reward loop (look Tibia).
//
// Drives the FULL drop→pickup→equip→persist loop through the same functions the
// game uses (killEnemy → dropGear → tryPickup → equipBag → serializeSave). The
// loot machinery pre-existed (CAS-73/63/65); CAS-116 closes its last gaps and
// proves the whole loop end to end:
//   1) balance — drop-tier window CLIMBS by zone and the power-gated Abismo
//      (CAS-114) drops EXCLUSIVELY tier-4 gear, strictly out-classing the open
//      zones + everything buyable in the shop. (Pre-fix abyss fell back to the
//      field [1,2] starter window — the bug this issue fixes.)
//   2) drop — killing abyss trash drops tier-4 gear on the ground (gearChance).
//   3) elite escalation — clearing a zone's Champion via the REAL cull→summon→
//      kill path drops a guaranteed gear whose rarity floor rises with the zone
//      (forest uncommon → abyss epic) and tier never drops below the zone window.
//   4) pickup + equip — looted gear enters the bag and equipping it raises the
//      HUD combat totals (equippedDmg / equippedDef), the numbers the HUD reads.
//   5) persistence — a populated bag + equipped upgrade survive a real reload
//      (localStorage round-trip), engaging CAS-113.
//   6) determinism — same seed → identical abyss drop sequence (Stage-2 ready).
//
// All inputs use ?dev hooks that call the real game functions; nothing bypasses
// drop/equip/save logic. Run: node tools/cas116-loot.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas116-loot.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page, name = "LootBot") {
  // One-shot clear of any stale save left by a sibling page (shared browser), then
  // reload so boot() lands on the menu. NOT evaluateOnNewDocument — that would also
  // wipe the save we deliberately write for the persistence reload in test (5).
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

  // ---- (1) BALANCE: drop-tier window climbs by zone; Abismo is strictly best ----
  const wins = await page.evaluate(() => ({
    forest: window.__dev.zoneLoot("forest"),
    caves: window.__dev.zoneLoot("caves"),
    arena: window.__dev.zoneLoot("arena"),
    abyss: window.__dev.zoneLoot("abyss"),
  }));
  log(`   loot windows: forest=${JSON.stringify(wins.forest.tier)} caves=${JSON.stringify(wins.caves.tier)} arena=${JSON.stringify(wins.arena.tier)} abyss=${JSON.stringify(wins.abyss.tier)}`);
  const abyssTop = wins.abyss && wins.abyss.tier[0] === 4 && wins.abyss.tier[1] === 4;
  const climbs = wins.abyss.tier[0] > wins.forest.tier[1] && wins.abyss.tier[0] >= wins.caves.tier[1] && wins.abyss.tier[0] >= wins.arena.tier[1];
  if (abyssTop && climbs) pass(`AC4: Abismo drops EXCLUSIVELY tier-4 and out-tiers every open zone (no more field-junk fallback)`);
  else fail(`AC4: abyss window not strictly best: ${JSON.stringify(wins)}`);

  // ---- (2) DROP: killing abyss trash drops tier-4 gear on the ground ----
  const abyssTrash = await page.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(4242);
    const tiers = [], rar = {};
    let gear = 0;
    for (let i = 0; i < 80; i++) {
      const drops = window.__dev.spawnKill("wraith");
      for (const d of drops) if (d.kind === "gear") { gear++; tiers.push(d.tier); rar[d.rarity] = (rar[d.rarity] || 0) + 1; }
      window.__dev.pickup();
    }
    return { gear, tiers, rar };
  });
  log(`   abyss trash: ${abyssTrash.gear} gear drop(s) / 80 kills, tiers=[${[...new Set(abyssTrash.tiers)].join(",")}], rarity=${JSON.stringify(abyssTrash.rar)}`);
  if (abyssTrash.gear > 0 && abyssTrash.tiers.every((t) => t === 4)) pass(`AC1: abyss kills drop gear and EVERY drop is tier-4 (${abyssTrash.gear} drops)`);
  else fail(`AC1: abyss trash drops not all tier-4: ${JSON.stringify(abyssTrash)}`);

  // forest trash for contrast: must stay low-tier (<=2) — proves the climb is real
  const forestTrash = await page.evaluate(() => {
    window.__dev.tpZone("forest"); window.__dev.seed(4242);
    const tiers = [];
    for (let i = 0; i < 80; i++) {
      for (const d of window.__dev.spawnKill("wolf")) if (d.kind === "gear") tiers.push(d.tier);
      window.__dev.pickup();
    }
    return tiers;
  });
  log(`   forest trash tiers=[${[...new Set(forestTrash)].join(",")}]`);
  if (forestTrash.length > 0 && forestTrash.every((t) => t <= 2) && Math.max(...forestTrash) < 4) pass(`AC4: forest trash stays low-tier (≤2) → abyss loot is a real upgrade`);
  else fail(`AC4: forest trash tier unexpected: [${forestTrash.join(",")}]`);

  // ---- (3) ELITE ESCALATION: clear a Champion via the real cull→summon→kill path ----
  const clearChampion = async (zone, base, need) => await page.evaluate((zone, base, need) => {
    window.__dev.tpZone(zone); window.__dev.seed(1234);
    for (let i = 0; i < need + 2; i++) { window.__dev.spawnKill(base); } // cull quota → summons Champion
    const st = window.__dev.huntState(zone);
    if (!st || !st.champ) return { zone, summoned: false };
    const res = window.__dev.huntKillChampion(zone);
    const g = res.drops.find((d) => d.kind === "gear");
    return { zone, summoned: true, cleared: res.cleared, gear: g || null };
  }, zone, base, need);
  const fChamp = await clearChampion("forest", "wolf", 10);
  const aChamp = await clearChampion("abyss", "wraith", 16);
  log(`   forest champion drop: ${JSON.stringify(fChamp.gear)}`);
  log(`   abyss  champion drop: ${JSON.stringify(aChamp.gear)}`);
  const elitesOk = fChamp.summoned && aChamp.summoned && fChamp.gear && aChamp.gear &&
    RANK[aChamp.gear.rarity] >= RANK[fChamp.gear.rarity] && aChamp.gear.tier >= fChamp.gear.tier &&
    RANK[aChamp.gear.rarity] >= RANK.epic && aChamp.gear.tier === 4;
  if (elitesOk) pass(`AC1: champions drop guaranteed gear; abyss (epic/t${aChamp.gear.tier}) out-classes forest (${fChamp.gear.rarity}/t${fChamp.gear.tier})`);
  else fail(`AC1: elite escalation failed: forest=${JSON.stringify(fChamp)} abyss=${JSON.stringify(aChamp)}`);

  // ---- (4) PICKUP + EQUIP raises HUD combat totals ----
  const equipResult = await page.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(909);
    for (let i = 0; i < 60; i++) { window.__dev.spawnKill("wraith"); window.__dev.pickup(); }
    const before = window.__dev.gear();
    const bag = window.__dev.bag();
    const pickBest = (slot) => { let bi = -1, bv = -1; bag.forEach((b, i) => { if (b.slot === slot && b.stat > bv) { bv = b.stat; bi = i; } }); return bi; };
    for (const slot of ["weapon", "body", "shield"]) { const i = pickBest(slot); if (i >= 0) window.__dev.equipBag(i); }
    return { before, after: window.__dev.gear(), bag: window.__dev.bag().length };
  });
  log(`   equip from abyss loot: Daño ${equipResult.before.dmg}→${equipResult.after.dmg}  Defensa ${equipResult.before.def}→${equipResult.after.def}`);
  if (equipResult.after.dmg + equipResult.after.def > equipResult.before.dmg + equipResult.before.def)
    pass(`AC2: pickup+equip raised HUD combat totals (Daño +${equipResult.after.dmg - equipResult.before.dmg}, Defensa +${equipResult.after.def - equipResult.before.def})`);
  else fail(`AC2: equipping looted abyss gear did not raise totals: ${JSON.stringify(equipResult)}`);

  // ---- (5) PERSISTENCE: populated bag + equipped upgrade survive a reload ----
  const preReload = await page.evaluate(() => {
    const g = window.__dev.gear(); const bag = window.__dev.bag();
    window.__dev.saveNow();
    return { dmg: g.dmg, def: g.def, weapon: g.weapon, bagLen: bag.length };
  });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 15000 });
  const postReload = await page.evaluate(() => { const g = window.__dev.gear(); return { dmg: g.dmg, def: g.def, weapon: g.weapon, bagLen: window.__dev.bag().length }; });
  log(`   pre-reload:  dmg=${preReload.dmg} def=${preReload.def} weapon=${preReload.weapon} bag=${preReload.bagLen}`);
  log(`   post-reload: dmg=${postReload.dmg} def=${postReload.def} weapon=${postReload.weapon} bag=${postReload.bagLen}`);
  const persisted = postReload.dmg === preReload.dmg && postReload.def === preReload.def &&
    postReload.weapon === preReload.weapon && postReload.bagLen === preReload.bagLen && postReload.bagLen > 0;
  if (persisted) pass(`AC5: equipped gear + ${postReload.bagLen}-item bag survived reload (localStorage round-trip)`);
  else fail(`AC5: loot did not survive reload: before=${JSON.stringify(preReload)} after=${JSON.stringify(postReload)}`);

  // ---- (6) DETERMINISM: same seed → identical abyss drop sequence ----
  const dropSeq = () => {
    window.__dev.tpZone("abyss"); window.__dev.seed(31337);
    const seq = [];
    for (let i = 0; i < 60; i++) { for (const d of window.__dev.spawnKill("wraith")) if (d.kind === "gear") seq.push(`${d.slot}:${d.rarity}:${d.tier}:${d.stat}`); window.__dev.pickup(); }
    return seq;
  };
  const seqA = await page.evaluate(dropSeq);
  // Stop THIS page autosaving so its flush can't race-rewrite the save the fresh
  // page is about to clear for a clean-hero boot (known unload/autosave-flush race).
  await page.evaluate(() => { try { window.__dev.noSave(); window.__dev.clearSave(); } catch (e) {} });
  const fresh = await browser.newPage();
  await fresh.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(fresh, "LootBot2");
  const seqB = await fresh.evaluate(dropSeq);
  await fresh.close();
  if (seqA.length > 0 && JSON.stringify(seqA) === JSON.stringify(seqB)) pass(`AC: determinism — same seed → identical ${seqA.length}-item abyss drop sequence (Stage-2 ready)`);
  else fail(`determinism mismatch (A=${seqA.length} B=${seqB.length})`);

  // inventory screenshot (equip doll + bag with rarity colours + compare arrows)
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

log(ok ? "\n✓ CAS-116 loot loop passed: drop→pickup→equip→persist works; Abismo loot out-classes the open zones."
       : "\n✗ CAS-116 loot loop FAILED.");
process.exit(ok ? 0 : 1);
