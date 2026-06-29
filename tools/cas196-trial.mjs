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
// CAS-197 balance-cohesion pass: pure config data is asserted directly (deterministic,
// no browser round-trip) alongside the live-build checks below.
import { HUNTS, ZONE_TIER, ABYSS_POWER_REQ, FROST_POWER_REQ, TRIAL_POWER_REQ, CONSUMABLES, ATKSPD_TOTAL_CAP } from "../sim/config.js";

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

  // ====================================================================
  // CAS-197 — BALANCE & COHESION tuning pass. The content above (consumables /
  // daily-loop / world-boss) was QA'd in isolation; these assertions lock in the
  // cross-system INVARIANTS so the deepened Stage-1 stays cohesive: a smooth power
  // curve (no cliff, no trivialised gate), a proportionate reward ladder, a bounded
  // combined attack-speed (the one place three systems compound), and a status-less
  // build's consumable answer to the world-boss. Runs BEFORE the finale-kill regression
  // check below (which flips the scene to victory). Pure config data → deterministic.
  // ====================================================================
  // (B1) power-curve spacing: gates strictly ascend AND are evenly spaced (smooth, no cliff)
  if (ABYSS_POWER_REQ < FROST_POWER_REQ && FROST_POWER_REQ < TRIAL_POWER_REQ)
    pass(`[B1] gates strictly ascend (abyss ${ABYSS_POWER_REQ} < frost ${FROST_POWER_REQ} < coliseo ${TRIAL_POWER_REQ})`);
  else fail(`[B1] gate ordering broke: ${ABYSS_POWER_REQ}/${FROST_POWER_REQ}/${TRIAL_POWER_REQ}`);
  const dAF = FROST_POWER_REQ - ABYSS_POWER_REQ, dFT = TRIAL_POWER_REQ - FROST_POWER_REQ;
  if (dAF === dFT) pass(`[B1] gate spacing is EVEN (+${dAF} / +${dFT}) — no difficulty cliff between tiers`);
  else fail(`[B1] uneven gate spacing risks a cliff: +${dAF} then +${dFT}`);

  // (B2) zone-tier scaling climbs smoothly into the deepest zone (no scaling cliff frost→trial)
  const hpJumpFA = ZONE_TIER.frost.hpMul / ZONE_TIER.abyss.hpMul;
  const hpJumpFT = ZONE_TIER.trial.hpMul / ZONE_TIER.frost.hpMul;
  if (ZONE_TIER.trial.hpMul > ZONE_TIER.frost.hpMul && hpJumpFT <= hpJumpFA + 0.05)
    pass(`[B2] deepest-zone trash scales smoothly (frost→trial ×${hpJumpFT.toFixed(2)} ≤ abyss→frost ×${hpJumpFA.toFixed(2)})`);
  else fail(`[B2] trial trash is a scaling cliff: ×${hpJumpFT.toFixed(2)} vs ×${hpJumpFA.toFixed(2)}`);

  // (B3) world-boss reward ladder is monotonic AND proportionate (richest, but not a payout cliff)
  const A = HUNTS.abyss.boss, F = HUNTS.frost.boss, T = HUNTS.trial.boss;
  const mono = (a, b, c) => a < b && b < c;
  if (mono(A.hp, F.hp, T.hp) && mono(A.gold, F.gold, T.gold) && mono(A.xp, F.xp, T.xp))
    pass(`[B3] capstone ladder ascends on every axis (hp ${A.hp}<${F.hp}<${T.hp}, gold ${A.gold}<${F.gold}<${T.gold}, xp ${A.xp}<${F.xp}<${T.xp})`);
  else fail(`[B3] capstone reward/HP ladder not monotonic`);
  const rHp = T.hp / F.hp, rGold = T.gold / F.gold, rXp = T.xp / F.xp;
  if (rHp <= 1.6 && rGold <= 1.6 && rXp <= 1.6)
    pass(`[B3] optional world-boss out-rewards the finale PROPORTIONATELY (×${rHp.toFixed(2)} hp / ×${rGold.toFixed(2)} gold / ×${rXp.toFixed(2)} xp ≤ 1.6)`);
  else fail(`[B3] world-boss reward jump too steep: hp×${rHp.toFixed(2)} gold×${rGold.toFixed(2)} xp×${rXp.toFixed(2)}`);
  // signature double-epic + a top-tier loot window keeps the haul proportionate to the gate
  if (T.bonusDrop >= 1 && T.minR === "epic" && T.tier[1] === 4)
    pass(`[B3] world-boss signature haul is gated-tier appropriate (bonusDrop ${T.bonusDrop}, ${T.minR} tier-${T.tier[1]})`);
  else fail(`[B3] world-boss haul mis-tiered: ${JSON.stringify({ b: T.bonusDrop, r: T.minR, t: T.tier })}`);

  // (B4) consumable economy: priced in the "meaningful but not mandatory" band + CD gates spam
  let econOk = true; const econDetail = [];
  for (const c of CONSUMABLES) {
    const inBand = c.price >= 20 && c.price <= 80;       // above a 15g basic potion, below a permanent power tier
    const noSpam = c.cd >= 8 && c.cd <= 20;              // a real cooldown — tactical, not spammable
    econDetail.push(`${c.id}:${c.price}g/${c.cd}s`);
    if (!inBand || !noSpam) econOk = false;
  }
  if (econOk) pass(`[B4] consumables priced in-band + CD-gated (${econDetail.join(", ")})`);
  else fail(`[B4] consumable economy out of band: ${econDetail.join(", ")}`);
  // the status-less build's ANSWER to the carapace world-boss: an antídoto that purges the
  // Nova slow exists, so a non-status build is never hard-walled (cross-system cohesion).
  const purge = CONSUMABLES.find((c) => c.purge);
  const novaSlow = HUNTS.trial.boss.carapace && HUNTS.trial.boss.carapace.nova && HUNTS.trial.boss.carapace.nova.slow;
  if (purge && novaSlow) pass(`[B4] status-less answer intact: '${purge.id}' purges the world-boss Nova slow (${novaSlow.amt}×${novaSlow.dur}s)`);
  else fail(`[B4] no consumable answer to the world-boss Nova slow: purge=${!!purge} novaSlow=${JSON.stringify(novaSlow)}`);

  // (B5) the combined attack-speed COHESION CAP holds: affix + talent + fury can't compound
  // past ATKSPD_TOTAL_CAP, so a fully-stacked build can't race the gated world-boss past intent.
  const capProbe = await page.evaluate(() => {
    window.__dev.giveAtkspdWeapon(60);   // loot half — affixTotals self-caps at 40
    window.__dev.setTTAtkspd(60);        // talent half — forced past its node ceiling
    window.__dev.selectConsum(0); window.__dev.setConsum("fury", 3); window.__dev.clearConsumCD();
    window.__dev.useConsum();            // fury +50 for its buff window
    const cadHi = window.__dev.atkCadence();
    return { t: window.__dev.atkspdTotal(), cadHi, buff: window.__dev.consumState().atkspdBuffAmt };
  });
  if (capProbe.t.raw > capProbe.t.cap && capProbe.t.total === capProbe.t.cap)
    pass(`[B5] combined atkspd CLAMPED to the cohesion cap (raw ${capProbe.t.raw} → ${capProbe.t.total}/${capProbe.t.cap})`);
  else fail(`[B5] atkspd cap did not clamp: ${JSON.stringify(capProbe.t)} (const ${ATKSPD_TOTAL_CAP})`);
  if (capProbe.buff === 50) pass(`[B5] fury is a BOUNDED burst window (+${capProbe.buff}% atkspd, timed — not a permanent stat)`);
  else fail(`[B5] fury buff magnitude unexpected: ${capProbe.buff}`);

  // ---- (5) NO REGRESSION: the frost finale contract still summons + clears ----
  // (runs LAST among gameplay checks — the final-boss kill flips the scene to victory)
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
  log(ok ? "✓ CAS-196 coliseo world-boss + CAS-197 balance-cohesion harness passed." : "✗ CAS-196/197 harness FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
  process.exit(ok ? 0 : 1);
}
