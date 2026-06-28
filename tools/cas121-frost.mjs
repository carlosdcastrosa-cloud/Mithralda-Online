// ---------------------------------------------------------------------------
// Headless harness for CAS-121 — the CRIPTA HELADA (3rd gated biome) + its boss's
// new encounter mechanic, the CORAZA DE ESCARCHA. Boots the REAL game headless and
// drives the new content through the SAME sim paths the game runs (no shortcuts):
//   1) BIOME EXISTS + GATED (AC1): frost is a real tier-6 hunt zone (out-scales abyss),
//      with a top-tier loot window; its power gate is LOCKED below req and OPENS once
//      heroPower clears FROST_POWER_REQ (which is higher than the abyss gate).
//   2) NEW MECHANIC raises (AC2): culling the contract summons the Guardián capstone;
//      it carries a carapace; on its cadence it raises the shield (shielded=true),
//      channels a Freeze Nova, and summons frost adds (enemy count climbs).
//   3) IMMUNE while shielded (AC2): a plain hero hit on the shielded boss deals ZERO
//      damage and pops nothing — the shield must be broken, not out-DPS'd.
//   4) NOVA punish (AC2/AC3): ignored, the channel completes -> a dense ring of
//      kind:"frostnova" projectiles erupts AND slows the hero (rides CAS-118 slow).
//   5) STATUS SHATTERS (AC3): with a burn weapon a single hit applies a status that
//      SHATTERS the carapace (shield drops, boss staggered) -> damage now lands. This
//      is the observable interaction with an existing system (status effects).
//   6) REWARD (AC4): slaying the boss drops guaranteed epic, tier-4 gear + bonus gold.
//   7) 60 FPS held + 0 JS errors (AC6).
//
// Run: npm run frost   (or: node tools/cas121-frost.mjs)
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

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "FrostBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll huntState(frost) until pred or timeout; returns last champ snapshot.
async function untilChamp(page, pred, ms = 4000) {
  const t0 = Date.now(); let c = null;
  while (Date.now() - t0 < ms) {
    c = await page.evaluate(() => { const s = window.__dev.huntState("frost"); return s ? s.champ : null; });
    if (c && pred(c)) return c;
    await wait(50);
  }
  return c;
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

  // ---- (1) biome exists, out-scales the abyss, top-tier loot ----
  const tiers = await page.evaluate(() => ({
    frost: window.__dev.zoneTier("frost", "wraith"),
    abyss: window.__dev.zoneTier("abyss", "wraith"),
    loot: window.__dev.zoneLoot("frost"),
  }));
  if (tiers.frost && tiers.frost.tier === 6) pass(`[AC1] frost is a real zone, tier ${tiers.frost.tier}`);
  else fail(`[AC1] frost zone tier wrong: ${JSON.stringify(tiers.frost)}`);
  if (tiers.frost && tiers.abyss && tiers.frost.hp > tiers.abyss.hp && tiers.frost.dmg > tiers.abyss.dmg)
    pass(`[AC1] frost out-scales abyss (hp ${tiers.frost.hp}>${tiers.abyss.hp}, dmg ${tiers.frost.dmg}>${tiers.abyss.dmg})`);
  else fail(`[AC1] frost does not out-scale abyss: ${JSON.stringify(tiers)}`);
  if (tiers.loot && tiers.loot.tier[1] === 4) pass(`[AC1] frost loot window is top-tier ${JSON.stringify(tiers.loot.tier)}`);
  else fail(`[AC1] frost loot window not top-tier: ${JSON.stringify(tiers.loot)}`);

  // ---- (1b) power GATE: locked below req, opens above (higher than abyss req) ----
  const gate = await page.evaluate(() => {
    window.__dev.setUpg(0, 0, 0);
    const locked = window.__dev.frostGate();
    const ab = window.__dev.abyssGate();
    window.__dev.setUpg(8, 5, 4);             // 17 upg tiers > FROST_POWER_REQ(13)
    const open = window.__dev.frostGate();
    return { locked, open, abReq: ab.req };
  });
  if (gate.locked && !gate.locked.unlocked && gate.locked.req > gate.abReq)
    pass(`[AC1] frost gate locked at low power (req ${gate.locked.req} > abyss ${gate.abReq})`);
  else fail(`[AC1] frost gate not properly locked/harder: ${JSON.stringify(gate)}`);
  if (gate.open && gate.open.unlocked) pass(`[AC1] frost gate OPENS once power clears req (${gate.open.power}/${gate.open.req})`);
  else fail(`[AC1] frost gate did not open after upgrades: ${JSON.stringify(gate.open)}`);

  // ---- (2) summon the Guardián capstone via the real contract ----
  const summon = await page.evaluate(() => {
    window.__dev.tpZone("frost"); window.__dev.seed(2121);
    const need = window.__dev.huntState("frost").need;
    for (let i = 0; i < need; i++) window.__dev.spawnKill("wraith");
    const s = window.__dev.huntState("frost");
    return { need, champ: s.champ };
  });
  if (summon.champ && summon.champ.capstone && summon.champ.hasCarapace)
    pass(`[AC2] Guardián '${summon.champ.name}' summoned (capstone, hasCarapace), max HP ${summon.champ.max}`);
  else fail(`[AC2] frost capstone not summoned with carapace: ${JSON.stringify(summon.champ)}`);

  // ---- (2b) raise the carapace: shield up + adds spawn ----
  const before = await page.evaluate(() => { window.__dev.poke("frost"); return window.__dev.enemyCount(); });
  await page.evaluate(() => { window.__dev.forceCarapace("frost"); window.__dev.poke("frost"); });
  const shieldedC = await untilChamp(page, (c) => c.shielded, 4000);
  const afterCount = await page.evaluate(() => window.__dev.enemyCount());
  if (shieldedC && shieldedC.shielded) pass(`[AC2] carapace RAISED (shielded, channel ${shieldedC.shieldT}s, novaCount ${shieldedC.novaCount})`);
  else fail(`[AC2] carapace never raised: ${JSON.stringify(shieldedC)}`);
  if (afterCount > before) pass(`[AC3] frost adds summoned with the carapace (enemies ${before} -> ${afterCount})`);
  else fail(`[AC3] no adds spawned on carapace: ${before} -> ${afterCount}`);

  // ---- (3) IMMUNE while shielded: a plain hit deals zero ----
  const immune = await page.evaluate(() => { window.__dev.poke("frost"); return window.__dev.hitChamp("frost"); });
  if (immune && immune.shielded && immune.hp === immune.before)
    pass(`[AC2] shielded boss is DAMAGE-IMMUNE to a plain hit (hp ${immune.before} -> ${immune.hp})`);
  else fail(`[AC2] shielded boss took damage from a plain hit: ${JSON.stringify(immune)}`);

  // ---- (4) NOVA punish: let the channel complete unbroken -> frostnova + hero slow ----
  await page.evaluate(() => { window.__dev.poke("frost"); });
  // wait out the channel; poll for the nova projectiles + the dropped shield
  let nova = null, heroSlow = null;
  { const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const r = await page.evaluate(() => ({ proj: window.__dev.enemyProj(), hero: window.__dev.statusOf("hero"), champ: window.__dev.huntState("frost").champ }));
      if (r.proj.frostnova > 0) { nova = r.proj; }
      if (r.hero && r.hero.slowT > 0) heroSlow = r.hero;
      if (nova && heroSlow) break;
      await wait(50);
    }
  }
  if (nova && nova.frostnova > 0) pass(`[AC2] ignored channel ERUPTS the Freeze Nova (${nova.frostnova} frostnova shards)`);
  else fail(`[AC2] nova never fired: ${JSON.stringify(nova)}`);
  if (heroSlow && heroSlow.slowT > 0) pass(`[AC3] the nova SLOWS the hero (CAS-118 slow, ${heroSlow.slowT}s left)`);
  else fail(`[AC3] nova did not slow the hero: ${JSON.stringify(heroSlow)}`);

  // ---- (5) STATUS SHATTERS the carapace -> damage lands ----
  const shatter = await page.evaluate(async () => {
    window.__dev.giveBurnWeapon(6);                 // equip an on-hit burn affix (CAS-117)
    // re-arm a fresh carapace and wait for it to raise
    const upWhen = (pred, ms) => new Promise((res) => { const t0 = Date.now();
      const tick = () => { const c = window.__dev.huntState("frost").champ;
        if ((c && pred(c)) || Date.now() - t0 > ms) res(c); else setTimeout(tick, 40); }; tick(); });
    // make sure the boss is free of the prior stun/recover before re-arming
    await upWhen((c) => !c.shielded, 2500);
    window.__dev.forceCarapace("frost"); window.__dev.poke("frost");
    const raised = await upWhen((c) => c.shielded, 4000);
    window.__dev.poke("frost");
    const hit = window.__dev.hitChamp("frost");     // burn proc lands while shielded
    const dropped = await upWhen((c) => !c.shielded, 2500);  // shatter resolves next frames
    window.__dev.poke("frost");
    const after = window.__dev.hitChamp("frost");    // now vulnerable -> damage lands
    return { raised: !!(raised && raised.shielded), hit, dropped: !!(dropped && !dropped.shielded), after };
  });
  if (shatter.raised && shatter.hit && shatter.hit.shieldBroken)
    pass(`[AC3] a STATUS hit (burn) flags the carapace to SHATTER (shieldBroken) while immune`);
  else fail(`[AC3] burn hit did not flag a shatter: ${JSON.stringify(shatter.hit)}`);
  if (shatter.dropped && shatter.after && shatter.after.hp < shatter.after.before)
    pass(`[AC3] shield SHATTERED -> hits now land (hp ${shatter.after.before} -> ${shatter.after.hp})`);
  else fail(`[AC3] shield did not shatter into a damage window: ${JSON.stringify(shatter)}`);

  // ---- (6) reward: guaranteed epic top-tier gear + bonus gold ----
  const kill = await page.evaluate(() => window.__dev.huntKillChampion("frost"));
  const drops = (kill && kill.drops) || [];
  const gear = drops.find((d) => d.kind === "gear");
  const gold = drops.find((d) => d.kind === "gold");
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  if (kill && kill.cleared) pass(`[AC4] slaying the Guardián CLEARED the Cripta Helada`);
  else fail(`[AC4] frost not cleared after boss kill: ${JSON.stringify(kill)}`);
  if (gear && RANK[gear.rarity] >= RANK.epic && gear.tier >= 4)
    pass(`[AC4] boss drops guaranteed ${gear.rarity} tier-${gear.tier} ${gear.slot} (build-flexing reward)`);
  else fail(`[AC4] boss reward not epic/top-tier: ${JSON.stringify(gear)}`);
  if (gold && gold.amt >= 400) pass(`[AC4] bonus ${gold.amt} gold dropped`);
  else fail(`[AC4] missing/low bonus gold: ${JSON.stringify(gold)}`);

  // ---- (7) FPS held + zero errors ----
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round((frames * 1000) / (performance.now() - t0));
  });
  if (fps >= 58) pass(`[AC6] 60fps held (${fps} fps) with the frost fight live`);
  else fail(`[AC6] fps dipped: ${fps}`);
  if (errors.length === 0) pass(`[AC6] zero JS errors`);
  else fail(`[AC6] JS errors: ${JSON.stringify(errors.slice(0, 4))}`);

  log("");
  log(ok ? "✓ CAS-121 frost-biome harness passed." : "✗ CAS-121 frost-biome harness FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
  process.exit(ok ? 0 : 1);
}
