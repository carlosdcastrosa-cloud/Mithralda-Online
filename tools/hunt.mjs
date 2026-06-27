// ---------------------------------------------------------------------------
// Headless hunt-contract playthrough (CAS-63).
//
// Boots the REAL game in headless Chromium and drives the per-zone hunt loop
// through the SAME functions the game uses (killEnemy -> huntKill -> spawnChampion
// -> killEnemy(champion) -> onChampionKill):
//   1) a fresh run starts every hunt zone uncleared, 0 kills, no champion
//   2) culling `need` enemies in a zone summons that zone's Champion (elite HP)
//   3) the Champion is a real threat — its max HP is the boosted elite block
//   4) defeating the Champion CLEARS the zone and yields a GUARANTEED gear drop
//      at/above the zone's rarity floor + the contract's bonus gold
//   5) determinism: same seed => identical champion reward (Stage-2 server-ready)
// Saves a screenshot of a live Champion (aura ring + named HP bar) as visual proof.
//
// Test inputs use dev-only hooks (?dev) that call the real game functions; they
// never bypass the hunt/loot logic.
//
// Run: npm run hunt
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "hunt-champion.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

// expectations mirror sim/config.js HUNTS (kept in sync deliberately)
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
const ZONES = [
  { zone: "forest", base: "wolf",   need: 10, minR: "uncommon", gold: 45 },
  { zone: "ruins",  base: "bandit", need: 12, minR: "rare",     gold: 70 },
  { zone: "arena",  base: "orc",    need: 14, minR: "rare",     gold: 75 },
];

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "HuntBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Drive one full hunt contract in `zone`: cull `need` mobs, summon + slay the
// champion, return the observed states + reward drops.
async function runHunt(page, z, seed) {
  return await page.evaluate((z, seed) => {
    window.__dev.tpZone(z.zone);
    window.__dev.seed(seed);
    const start = window.__dev.huntState(z.zone);
    // cull up to `need` mobs; capture the state the instant the champion appears
    let champAt = -1, champState = null;
    for (let i = 0; i < z.need; i++) {
      window.__dev.spawnKill(z.base);
      const s = window.__dev.huntState(z.zone);
      if (s.champ && champAt < 0) { champAt = i + 1; champState = s; }
    }
    const beforeClear = window.__dev.huntState(z.zone);
    const kill = window.__dev.huntKillChampion(z.zone);
    const after = window.__dev.huntState(z.zone);
    return { start, champAt, champState, beforeClear, kill, after };
  }, z, seed);
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

  for (const z of ZONES) {
    const r = await runHunt(page, z, 1337);
    const tag = z.zone.toUpperCase();

    // (1) fresh contract
    if (r.start && r.start.kills === 0 && !r.start.cleared && !r.start.champ) pass(`[${tag}] starts fresh (0/${z.need}, uncleared)`);
    else fail(`[${tag}] did not start fresh: ${JSON.stringify(r.start)}`);

    // (2) champion summoned exactly at the quota
    if (r.champAt === z.need && r.champState && r.champState.champ) pass(`[${tag}] Champion '${r.champState.champ.name}' summoned at ${r.champAt}/${z.need} kills`);
    else fail(`[${tag}] champion not summoned at quota (champAt=${r.champAt})`);

    // (3) champion is an elite threat (boosted max HP vs the base mob)
    if (r.champState && r.champState.champ && r.champState.champ.max >= 100) pass(`[${tag}] Champion is an elite (max HP ${r.champState.champ.max})`);
    else fail(`[${tag}] champion HP not elite-scaled: ${JSON.stringify(r.champState && r.champState.champ)}`);

    // (4) clearing yields a guaranteed gear drop >= rarity floor + bonus gold
    const drops = (r.kill && r.kill.drops) || [];
    const gear = drops.find((d) => d.kind === "gear");
    const gold = drops.find((d) => d.kind === "gold");
    const floorOk = gear && RANK[gear.rarity] >= RANK[z.minR];
    if (r.kill && r.kill.cleared && r.after.cleared) pass(`[${tag}] Champion kill CLEARED the zone`);
    else fail(`[${tag}] zone not cleared after champion kill: ${JSON.stringify(r.after)}`);
    if (gear && floorOk) pass(`[${tag}] guaranteed ${gear.rarity} ${gear.slot} (>= floor ${z.minR}, stat ${gear.stat})`);
    else fail(`[${tag}] missing/under-floor guaranteed gear: ${JSON.stringify(gear)} (floor ${z.minR})`);
    if (gold && gold.amt === z.gold) pass(`[${tag}] bonus ${gold.amt} gold dropped`);
    else fail(`[${tag}] wrong/no bonus gold: ${JSON.stringify(gold)} (expected ${z.gold})`);
  }

  // (5) determinism: same seed -> identical champion reward across two fresh runs
  const reward = async () => {
    const p = await browser.newPage();
    await p.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(p);
    const r = await runHunt(p, ZONES[1], 2024); // ruins, rare floor
    await p.close();
    return (r.kill.drops.find((d) => d.kind === "gear")) || null;
  };
  const a = await reward(), b = await reward();
  if (a && b && JSON.stringify(a) === JSON.stringify(b)) pass(`determinism: same seed -> identical champion reward (${a.rarity} ${a.slot} stat ${a.stat})`);
  else fail(`determinism mismatch: A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);

  // visual proof: a FRESH focused page (the main page's forest is already cleared
  // by the loop above) — summon a live champion and screenshot the elite confronting
  // the hero (aura ring + named HP bar + "¡CAMPEÓN!" tracker).
  const shotPage = await browser.newPage();
  await shotPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await shotPage.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await shotPage.bringToFront();
  await enterPlay(shotPage);
  await shotPage.evaluate(() => {
    window.__dev.tpZone("forest"); window.__dev.seed(7);
    for (let i = 0; i < 10; i++) window.__dev.spawnKill("wolf"); // 10th kill summons the Lobo Alfa
  });
  const champUp = await shotPage.evaluate(() => { const s = window.__dev.huntState("forest"); return !!(s && s.champ); });
  if (champUp) pass("live Champion present on screenshot page"); else fail("no live champion for screenshot");
  await new Promise((r) => setTimeout(r, 300));
  writeFileSync(SHOT, await shotPage.screenshot());
  await shotPage.close();
  pass(`champion screenshot saved: ${SHOT}`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

log(ok ? "\n✓ Hunt-contract playthrough passed: cull -> Champion -> clear -> guaranteed reward works."
       : "\n✗ Hunt-contract playthrough FAILED.");
process.exit(ok ? 0 : 1);
