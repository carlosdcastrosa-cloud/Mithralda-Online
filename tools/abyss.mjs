// ---------------------------------------------------------------------------
// Headless harness for the power-gated Abismo — the second, harder hunt zone
// (CAS-114). Boots the REAL game in headless Chromium and drives the new content
// through the SAME functions the game uses (heroPower / usePortal / applyZoneScale /
// the hunt→capstone resolver), never bypassing the gate or combat logic:
//   1) GATE LOCKED: a fresh hero is below ABYSS_POWER_REQ; the town→abyss portal
//      DENIES entry (hero stays in town) — AC1 (gate por poder + feedback).
//   2) GATE OPENS: investing merchant-upgrade tiers (the gold sink, CAS-112) lifts
//      power past the requirement; the SAME portal now warps the hero into the abyss.
//   3) NAVIGABLE: the return portal warps the hero back to town — AC2 (acceso navegable).
//   4) HARDER: the abyss tier (5) scales the same mob strictly above the arena (4) on
//      hp/dmg/xp, and the loot/gold reward out-pays it — AC3 (enemigos más duros).
//   5) CAPSTONE: culling the abyss quota summons the "Tirano del Abismo" capstone —
//      a true boss block (telegraphed slam, enrage) whose clear yields a GUARANTEED
//      epic + the richest bonus gold in the game — AC3 (telegraphs escalados + payoff).
//   6) NO REGRESSION: the forest contract still clears cleanly with the abyss live — AC4.
//   7) 0 JS errors across the run — AC5.
//
// Run: npm run abyss   (or: node tools/abyss.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { ABYSS_POWER_REQ } from "../sim/config.js"; // pure data — safe to import in Node

const SHOT = join(ROOT, "tools", "abyss-zone.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "AbyssBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
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

  // (1) GATE LOCKED for a fresh hero — power below the requirement, portal denies entry.
  const locked = await page.evaluate(() => {
    const g0 = window.__dev.abyssGate();
    const attempt = window.__dev.tryPortal("abyss");      // real interact()→usePortal path
    return { g0, attempt, after: window.__dev.abyssGate() };
  });
  if (locked.g0 && locked.g0.power < ABYSS_POWER_REQ && !locked.g0.unlocked)
    pass(`[GATE] fresh hero under threshold (power ${locked.g0.power}/${ABYSS_POWER_REQ}, locked)`);
  else fail(`[GATE] fresh hero should be locked: ${JSON.stringify(locked.g0)}`);
  if (locked.attempt && locked.attempt.after !== "abyss" && locked.attempt.before !== "abyss")
    pass(`[GATE] locked portal DENIED entry (stayed in '${locked.attempt.after}')`);
  else fail(`[GATE] locked portal should not warp into abyss: ${JSON.stringify(locked.attempt)}`);

  // (2) GATE OPENS once permanent power (merchant-upgrade tiers, the gold sink) clears REQ.
  const opened = await page.evaluate((req) => {
    const power = window.__dev.setUpg(4, 4, 0);            // buy enough upgrade tiers to pass
    const g = window.__dev.abyssGate();
    const warp = window.__dev.tryPortal("abyss");          // real gated warp
    return { power, g, warp, zone: window.__dev.abyssGate().zone };
  }, ABYSS_POWER_REQ);
  if (opened.g && opened.g.unlocked && opened.power >= ABYSS_POWER_REQ)
    pass(`[GATE] upgrades lifted power past the gate (power ${opened.power}/${ABYSS_POWER_REQ}, unlocked)`);
  else fail(`[GATE] gate should open at/above req: ${JSON.stringify(opened.g)}`);
  if (opened.warp && opened.warp.after === "abyss")
    pass(`[GATE] open portal WARPED the hero into the Abismo`);
  else fail(`[GATE] open portal failed to warp into abyss: ${JSON.stringify(opened.warp)}`);

  // (3) NAVIGABLE — the return portal warps the hero back to town.
  const back = await page.evaluate(() => window.__dev.tryPortal("town"));
  if (back && back.after === "town") pass(`[NAV] return portal warped back to town (from '${back.before}')`);
  else fail(`[NAV] return portal did not reach town: ${JSON.stringify(back)}`);

  // (4) HARDER — the abyss tier scales the same mob strictly above the arena.
  const cmp = await page.evaluate(() => ({
    arena: window.__dev.zoneTier("arena", "orc"),
    abyss: window.__dev.zoneTier("abyss", "orc"),
  }));
  const a = cmp.arena, b = cmp.abyss;
  if (b && a && b.tier === 5 && b.hp > a.hp && b.dmg > a.dmg && b.xp > a.xp)
    pass(`[HARD] abyss(t5 hp${b.hp}/dmg${b.dmg}/xp${b.xp}) strictly out-scales arena(t4 hp${a.hp}/dmg${a.dmg}/xp${a.xp})`);
  else fail(`[HARD] abyss not strictly harder than arena: ${JSON.stringify(cmp)}`);

  // (5) CAPSTONE — cull the quota, summon + slay the Tirano, assert the guaranteed payoff.
  const cap = await page.evaluate(() => {
    window.__dev.setUpg(4, 4, 0);              // keep gate open
    window.__dev.tryPortal("abyss");           // stand in the abyss
    window.__dev.tpZone("abyss"); window.__dev.seed(1337);
    let champAt = -1, champState = null;
    for (let i = 0; i < 16; i++) {
      window.__dev.spawnKill("wraith");
      const s = window.__dev.huntState("abyss");
      if (s.champ && champAt < 0) { champAt = i + 1; champState = s; }
    }
    const kill = window.__dev.huntKillChampion("abyss");
    const after = window.__dev.huntState("abyss");
    return { champAt, champState, kill, after };
  });
  if (cap.champState && cap.champState.champ && cap.champState.champ.capstone && cap.champState.champ.name === "Tirano del Abismo")
    pass(`[CAPSTONE] '${cap.champState.champ.name}' summoned at ${cap.champAt}/16 kills`);
  else fail(`[CAPSTONE] capstone not summoned by contract: ${JSON.stringify(cap.champState && cap.champState.champ)}`);
  if (cap.champState && cap.champState.champ && cap.champState.champ.max >= 1400)
    pass(`[CAPSTONE] true boss HP block (max ${cap.champState.champ.max})`);
  else fail(`[CAPSTONE] boss HP too small: ${JSON.stringify(cap.champState && cap.champState.champ && cap.champState.champ.max)}`);
  if (cap.champState && cap.champState.champ && cap.champState.champ.slamCount >= 14)
    pass(`[CAPSTONE] telegraphed radial slam configured (${cap.champState.champ.slamCount} shards)`);
  else fail(`[CAPSTONE] slam not configured: ${JSON.stringify(cap.champState && cap.champState.champ)}`);
  const drops = (cap.kill && cap.kill.drops) || [];
  const gear = drops.find((d) => d.kind === "gear");
  const gold = drops.find((d) => d.kind === "gold");
  if (cap.kill && cap.kill.cleared && cap.after.cleared) pass(`[CAPSTONE] kill CLEARED the abyss`);
  else fail(`[CAPSTONE] abyss not cleared after capstone kill: ${JSON.stringify(cap.after)}`);
  if (gear && RANK[gear.rarity] >= RANK.epic) pass(`[CAPSTONE] guaranteed ${gear.rarity} ${gear.slot} (>= epic, stat ${gear.stat})`);
  else fail(`[CAPSTONE] missing/under-floor guaranteed epic: ${JSON.stringify(gear)}`);
  if (gold && gold.amt === 360) pass(`[CAPSTONE] richest bonus gold dropped (${gold.amt} > arena 200)`);
  else fail(`[CAPSTONE] wrong/no bonus gold: ${JSON.stringify(gold)} (expected 360)`);

  // (6) NO REGRESSION — the forest contract still clears cleanly with the abyss live.
  const fr = await page.evaluate(() => {
    window.__dev.tpZone("forest"); window.__dev.seed(1337);
    for (let i = 0; i < 10; i++) window.__dev.spawnKill("wolf");
    const champ = window.__dev.huntState("forest").champ;
    const kill = window.__dev.huntKillChampion("forest");
    return { champ, cleared: kill && kill.cleared };
  });
  if (fr.champ && fr.cleared) pass(`[NOREG] forest contract still summons + clears (champion '${fr.champ.name}')`);
  else fail(`[NOREG] forest hunt regressed: ${JSON.stringify(fr)}`);

  // visual proof — warp into the abyss (gate open) and screenshot the zone + return portal.
  await page.evaluate(() => { window.__dev.setUpg(4, 4, 0); window.__dev.tryPortal("abyss"); });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: SHOT });
  log(`saved ${SHOT}`);

  // (7) zero JS errors
  if (errors.length === 0) pass("0 JS errors during the run");
  else { for (const e of errors) fail(e); }

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  srv.close();
}

log(ok ? "\nABYSS HARNESS: PASS" : "\nABYSS HARNESS: FAIL");
process.exit(ok ? 0 : 1);
