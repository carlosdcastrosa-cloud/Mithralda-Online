// ---------------------------------------------------------------------------
// Headless harness for CAS-196 — el COLISEO ETERNO (the challenge arena, a 7th
// gated zone) + its OPTIONAL WORLD-BOSS, the AVATAR DEL COLISEO. Boots the REAL game
// headless and drives the new content through the SAME sim paths the game runs:
//   1) ARENA EXISTS + GATED (AC1/AC2): trial is a real tier-7 hunt zone that strictly
//      out-scales the Cripta (frost), with a top-tier loot window; its power gate is
//      LOCKED below TRIAL_POWER_REQ (which is HIGHER than the frost gate) and OPENS
//      once heroPower clears it — gated by the existing zone-tier/contract machinery.
//   2) WORLD-BOSS, PHASE 1 (AC1): culling the arena contract summons the Avatar capstone;
//      it carries the carapace status-gate (telegraphed shield → channel → adds), and a
//      plain hit while shielded deals ZERO (must be broken with a CAS-118 status, reusing
//      the status-effect system — proven exhaustively in CAS-121; here a smoke re-check).
//   3) WORLD-BOSS, PHASE 2 (AC1): dropping it below the enrage threshold flips it to the
//      enraged phase (faster) where every strike erupts a dense radial SLAM (rune shards)
//      — a 2nd distinct, telegraphed phase reusing the shared capstone vocabulary.
//   4) SIGNATURE REWARD (AC1): slaying it drops a DISTINCT haul — TWO guaranteed epic,
//      tier-4 pieces (the `bonusDrop` world-boss signature) + the richest bonus gold.
//   5) NO REGRESSION (AC3): the frost finale contract still summons + clears unchanged.
//   6) 60 FPS held + 0 JS errors + save intact (AC4).
//
// Run: npm run trial   (or: node tools/cas196-trial.mjs)
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
    document.getElementById("nameInput").value = "ColiseoBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll huntState(trial).champ until pred or timeout; returns last champ snapshot.
async function untilChamp(page, pred, ms = 4000) {
  const t0 = Date.now(); let c = null;
  while (Date.now() - t0 < ms) {
    c = await page.evaluate(() => { const s = window.__dev.huntState("trial"); return s ? s.champ : null; });
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

  // ---- (1) arena exists, out-scales the Cripta (frost), top-tier loot ----
  const tiers = await page.evaluate(() => ({
    trial: window.__dev.zoneTier("trial", "wraith"),
    frost: window.__dev.zoneTier("frost", "wraith"),
    loot: window.__dev.zoneLoot("trial"),
  }));
  if (tiers.trial && tiers.trial.tier === 7) pass(`[AC2] trial is a real zone, tier ${tiers.trial.tier}`);
  else fail(`[AC2] trial zone tier wrong: ${JSON.stringify(tiers.trial)}`);
  if (tiers.trial && tiers.frost && tiers.trial.hp > tiers.frost.hp && tiers.trial.dmg > tiers.frost.dmg)
    pass(`[AC2] trial out-scales the Cripta (hp ${tiers.trial.hp}>${tiers.frost.hp}, dmg ${tiers.trial.dmg}>${tiers.frost.dmg})`);
  else fail(`[AC2] trial does not out-scale frost: ${JSON.stringify(tiers)}`);
  if (tiers.loot && tiers.loot.tier[1] === 4) pass(`[AC2] trial loot window is top-tier ${JSON.stringify(tiers.loot.tier)}`);
  else fail(`[AC2] trial loot window not top-tier: ${JSON.stringify(tiers.loot)}`);

  // ---- (1b) power GATE: locked below req, opens above (higher than the frost req) ----
  const gate = await page.evaluate(() => {
    window.__dev.setUpg(0, 0, 0);
    const locked = window.__dev.trialGate();
    const fr = window.__dev.frostGate();
    window.__dev.setUpg(10, 5, 4);            // 19 upg tiers > TRIAL_POWER_REQ(18)
    const open = window.__dev.trialGate();
    return { locked, open, frReq: fr.req };
  });
  if (gate.locked && !gate.locked.unlocked && gate.locked.req > gate.frReq)
    pass(`[AC2] coliseo gate locked at low power (req ${gate.locked.req} > frost ${gate.frReq})`);
  else fail(`[AC2] coliseo gate not properly locked/deepest: ${JSON.stringify(gate)}`);
  if (gate.open && gate.open.unlocked) pass(`[AC2] coliseo gate OPENS once power clears req (${gate.open.power}/${gate.open.req})`);
  else fail(`[AC2] coliseo gate did not open after upgrades: ${JSON.stringify(gate.open)}`);

  // ---- (1c) the gated town PORTAL exists and the deny path enforces the gate ----
  // tryPortal fires the REAL interact()→usePortal path and reports the resulting zone:
  // below req the warp is denied (hero stays in town); above req it lands in 'trial'.
  const portal = await page.evaluate(() => {
    window.__dev.setUpg(0, 0, 0);
    const denied = window.__dev.tryPortal("trial");   // below req → must deny (stays town)
    window.__dev.setUpg(10, 5, 4);
    const allowed = window.__dev.tryPortal("trial");  // above req → warps to trial
    return { denied, allowed };
  });
  if (portal.denied && portal.denied.after !== "trial") pass(`[AC2] coliseo portal DENIES entry below the gate (stayed '${portal.denied.after}')`);
  else fail(`[AC2] coliseo portal did not deny below gate: ${JSON.stringify(portal.denied)}`);
  if (portal.allowed && portal.allowed.after === "trial")
    pass(`[AC2] coliseo portal WARPS into the arena once gated (zone=${portal.allowed.after})`);
  else fail(`[AC2] coliseo portal did not warp when cleared: ${JSON.stringify(portal.allowed)}`);

  // ---- (2) PHASE 1: summon the Avatar capstone via the real arena contract ----
  const summon = await page.evaluate(() => {
    window.__dev.tpZone("trial"); window.__dev.seed(196196);
    const need = window.__dev.huntState("trial").need;
    for (let i = 0; i < need; i++) window.__dev.spawnKill("wraith");
    const s = window.__dev.huntState("trial");
    return { need, champ: s.champ };
  });
  if (summon.champ && summon.champ.capstone && summon.champ.hasCarapace)
    pass(`[AC1] world-boss '${summon.champ.name}' summoned after culling ${summon.need} (capstone+carapace, max HP ${summon.champ.max})`);
  else fail(`[AC1] world-boss not summoned with carapace: ${JSON.stringify(summon.champ)}`);

  // ---- (2b) PHASE 1 carapace raises + adds spawn + IMMUNE while shielded ----
  const before = await page.evaluate(() => { window.__dev.poke("trial"); return window.__dev.enemyCount(); });
  await page.evaluate(() => { window.__dev.forceCarapace("trial"); window.__dev.poke("trial"); });
  const shieldedC = await untilChamp(page, (c) => c.shielded, 4000);
  const afterCount = await page.evaluate(() => window.__dev.enemyCount());
  if (shieldedC && shieldedC.shielded) pass(`[AC1] phase-1 carapace RAISED (shielded, channel ${shieldedC.shieldT}s, novaCount ${shieldedC.novaCount})`);
  else fail(`[AC1] carapace never raised: ${JSON.stringify(shieldedC)}`);
  if (afterCount > before) pass(`[AC1] frost-wraith adds summoned with the carapace (enemies ${before} -> ${afterCount})`);
  else fail(`[AC1] no adds spawned on carapace: ${before} -> ${afterCount}`);
  const immune = await page.evaluate(() => { window.__dev.poke("trial"); return window.__dev.hitChamp("trial"); });
  if (immune && immune.shielded && immune.hp === immune.before)
    pass(`[AC1] shielded world-boss is DAMAGE-IMMUNE to a plain hit (hp ${immune.before} -> ${immune.hp}) — status-gate reused`);
  else fail(`[AC1] shielded boss took plain damage: ${JSON.stringify(immune)}`);

  // ---- (2c) STATUS shatters the carapace -> damage lands (CAS-118 reuse smoke) ----
  const shatter = await page.evaluate(async () => {
    window.__dev.giveBurnWeapon(6);
    const upWhen = (pred, ms) => new Promise((res) => { const t0 = Date.now();
      const tick = () => { const c = window.__dev.huntState("trial").champ;
        if ((c && pred(c)) || Date.now() - t0 > ms) res(c); else setTimeout(tick, 40); }; tick(); });
    await upWhen((c) => !c.shielded, 2500);
    window.__dev.forceCarapace("trial"); window.__dev.poke("trial");
    const raised = await upWhen((c) => c.shielded, 4000);
    window.__dev.poke("trial");
    const hit = window.__dev.hitChamp("trial");
    const dropped = await upWhen((c) => !c.shielded, 2500);
    window.__dev.poke("trial");
    const after = window.__dev.hitChamp("trial");
    return { raised: !!(raised && raised.shielded), hit, dropped: !!(dropped && !dropped.shielded), after };
  });
  if (shatter.raised && shatter.hit && shatter.hit.shieldBroken && shatter.dropped && shatter.after && shatter.after.hp < shatter.after.before)
    pass(`[AC1] a STATUS (burn) SHATTERS the carapace -> hits land (hp ${shatter.after.before} -> ${shatter.after.hp})`);
  else fail(`[AC1] status shatter window failed: ${JSON.stringify(shatter)}`);

  // ---- (3) PHASE 2: drop below the enrage threshold -> enraged + radial slam ----
  const enrage = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.setChampHp("trial", 0.45);   // below enrageAt(0.5)
    let enraged = false, rune = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 4500) {
      window.__dev.poke("trial");
      const c = window.__dev.huntState("trial").champ;
      if (c && c.enraged) enraged = true;
      const pj = window.__dev.enemyProj();
      if (pj.rune > rune) rune = pj.rune;
      if (enraged && rune > 0) break;
      await sleep(60);
    }
    const c = window.__dev.huntState("trial").champ;
    return { enraged, rune, slamCount: c ? c.slamCount : 0 };
  });
  if (enrage.enraged) pass(`[AC1] phase 2: world-boss ENRAGED past the HP threshold (distinct 2nd phase)`);
  else fail(`[AC1] world-boss never enraged: ${JSON.stringify(enrage)}`);
  if (enrage.rune > 0) pass(`[AC1] phase 2: enraged strike erupts a dense radial SLAM (${enrage.rune} rune shards, cfg ${enrage.slamCount})`);
  else fail(`[AC1] enraged slam never fired: ${JSON.stringify(enrage)}`);

  // ---- (4) SIGNATURE REWARD: two guaranteed epic tier-4 pieces + richest gold ----
  const kill = await page.evaluate(() => window.__dev.huntKillChampion("trial"));
  const drops = (kill && kill.drops) || [];
  const gear = drops.filter((d) => d.kind === "gear");
  const gold = drops.find((d) => d.kind === "gold");
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  if (kill && kill.cleared) pass(`[AC1] slaying the Avatar CLEARED el Coliseo Eterno`);
  else fail(`[AC1] coliseo not cleared after boss kill: ${JSON.stringify(kill)}`);
  const epics = gear.filter((g) => RANK[g.rarity] >= RANK.epic && g.tier >= 4);
  if (gear.length >= 2 && epics.length >= 2)
    pass(`[AC1] SIGNATURE haul: ${gear.length} drops, ${epics.length} guaranteed epic tier-4 (${epics.map((e) => e.slot).join("+")})`);
  else fail(`[AC1] world-boss did not drop a distinct double-epic haul: ${JSON.stringify(gear)}`);
  if (gold && gold.amt >= 600) pass(`[AC1] richest bonus gold dropped (${gold.amt} >= frost 480)`);
  else fail(`[AC1] missing/low bonus gold: ${JSON.stringify(gold)}`);

  // ---- (5) NO REGRESSION: the frost finale contract still summons + clears ----
  const noreg = await page.evaluate(() => {
    window.__dev.tpZone("frost"); window.__dev.seed(5);
    const need = window.__dev.huntState("frost").need;
    for (let i = 0; i < need; i++) window.__dev.spawnKill("wraith");
    const champ = window.__dev.huntState("frost").champ;
    const kill = window.__dev.huntKillChampion("frost");
    return { champ: champ ? champ.name : null, cleared: kill ? kill.cleared : false };
  });
  if (noreg.champ && noreg.cleared) pass(`[AC3] no-regression: frost finale still summons ('${noreg.champ}') + clears`);
  else fail(`[AC3] frost finale regressed: ${JSON.stringify(noreg)}`);

  // ---- (6) FPS held + zero errors + save intact ----
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round((frames * 1000) / (performance.now() - t0));
  });
  if (fps >= 58) pass(`[AC4] 60fps held (${fps} fps) with the coliseo fight live`);
  else fail(`[AC4] fps dipped: ${fps}`);
  const saveOk = await page.evaluate(() => { try { const b = window.__dev.saveBlob(); return !!(b && b.cls && b.version); } catch (e) { return false; } });
  if (saveOk) pass(`[AC4] save/localStorage blob serializes intact across the new build`);
  else fail(`[AC4] save serialize broke`);
  if (errors.length === 0) pass(`[AC4] zero JS errors`);
  else fail(`[AC4] JS errors: ${JSON.stringify(errors.slice(0, 4))}`);

  log("");
  log(ok ? "✓ CAS-196 coliseo world-boss harness passed." : "✗ CAS-196 coliseo world-boss harness FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
  process.exit(ok ? 0 : 1);
}
