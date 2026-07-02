// ---------------------------------------------------------------------------
// CAS-121 QA — LIVE probe for the CRIPTA HELADA (3rd gated biome) + the CORAZA DE
// ESCARCHA encounter mechanic on the DEPLOYED build (inside the Higgsfield iframe).
// Drives the SAME __dev hooks the game runs to prove the content shipped live (not a
// stale cache) and works end-to-end on the live URL:
//   - BIOME + GATE (AC1): frost is a tier-6 zone that out-scales the abyss, top-tier
//     loot, and its power gate is harder than the abyss gate (locked low / opens high).
//   - NEW MECHANIC (AC2): the Guardián capstone raises its carapace (shielded), is
//     DAMAGE-IMMUNE to plain hits, channels + ERUPTS a Freeze Nova that slows the hero.
//   - STATUS INTERACTION (AC3): a burn-weapon hit SHATTERS the carapace -> damage lands;
//     the carapace also summons adds.
//   - REWARD (AC4): the boss drops guaranteed epic top-tier gear + bonus gold.
//   - 60fps + 0 JS errors live (AC6).
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas121-frost-live.mjs   (or: npm run frost-live)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas121-frost-live.png");
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
async function enterAs(fr, name = "FrostQA") {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate((nm) => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
async function untilChamp(fr, pred, ms = 4000) {
  const t0 = Date.now(); let c = null;
  while (Date.now() - t0 < ms) {
    c = await fr.evaluate(() => { const s = window.__dev.huntState("frost"); return s ? s.champ : null; });
    if (c && pred(c)) return c; await sleep(50);
  }
  return c;
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play live as warrior", true);

  // hooks present live (proves the new code shipped, not a stale cache)
  const hooksOk = await fr.evaluate(() => !!(window.__dev.frostGate && window.__dev.forceCarapace && window.__dev.hitChamp));
  check("CAS-121 dev hooks present on live build", hooksOk);

  // (1) biome out-scales abyss + top-tier loot + harder gate
  const tiers = await fr.evaluate(() => ({ frost: window.__dev.zoneTier("frost", "wraith"), abyss: window.__dev.zoneTier("abyss", "wraith"), loot: window.__dev.zoneLoot("frost") }));
  check("AC1: frost is tier-6 and out-scales the abyss", !!(tiers.frost && tiers.frost.tier === 6 && tiers.abyss && tiers.frost.hp > tiers.abyss.hp && tiers.frost.dmg > tiers.abyss.dmg), tiers);
  check("AC1: frost loot window is top-tier", !!(tiers.loot && tiers.loot.tier[1] === 4), tiers.loot);
  const gate = await fr.evaluate(() => { window.__dev.setUpg(0, 0, 0); const locked = window.__dev.frostGate(); const ab = window.__dev.abyssGate(); window.__dev.setUpg(8, 5, 4); const open = window.__dev.frostGate(); return { locked, open, abReq: ab.req }; });
  check("AC1: frost gate locked low + harder than abyss", !!(gate.locked && !gate.locked.unlocked && gate.locked.req > gate.abReq), { req: gate.locked && gate.locked.req, abReq: gate.abReq });
  check("AC1: frost gate OPENS once power clears req", !!(gate.open && gate.open.unlocked), gate.open);

  // (2) summon the capstone via the real contract
  const summon = await fr.evaluate(() => { window.__dev.tpZone("frost"); window.__dev.seed(2121); const need = window.__dev.huntState("frost").need; for (let i = 0; i < need; i++) window.__dev.spawnKill("wraith"); return window.__dev.huntState("frost").champ; });
  check("AC2: Guardián capstone summoned with a carapace", !!(summon && summon.capstone && summon.hasCarapace), summon && { name: summon.name, max: summon.max, hasCarapace: summon.hasCarapace });

  // (2b) raise carapace + adds spawn
  const before = await fr.evaluate(() => { window.__dev.poke("frost"); return window.__dev.enemyCount(); });
  await fr.evaluate(() => { window.__dev.forceCarapace("frost"); window.__dev.poke("frost"); });
  const shieldedC = await untilChamp(fr, (c) => c.shielded, 4000);
  const afterCount = await fr.evaluate(() => window.__dev.enemyCount());
  check("AC2: carapace RAISED (shielded + channel)", !!(shieldedC && shieldedC.shielded), shieldedC && { shieldT: shieldedC.shieldT, novaCount: shieldedC.novaCount });
  check("AC3: adds summoned with the carapace", afterCount > before, { before, afterCount });

  // (3) immune while shielded
  const immune = await fr.evaluate(() => { window.__dev.poke("frost"); return window.__dev.hitChamp("frost"); });
  check("AC2: shielded boss is DAMAGE-IMMUNE to a plain hit", !!(immune && immune.shielded && immune.hp === immune.before), immune && { before: immune.before, hp: immune.hp });

  // (4) nova punish + hero slow
  await fr.evaluate(() => window.__dev.poke("frost"));
  let nova = null, heroSlow = null; const t0 = Date.now();
  while (Date.now() - t0 < 4000) { const r = await fr.evaluate(() => ({ proj: window.__dev.enemyProj(), hero: window.__dev.statusOf("hero") })); if (r.proj.frostnova > 0) nova = r.proj; if (r.hero && r.hero.slowT > 0) heroSlow = r.hero; if (nova && heroSlow) break; await sleep(50); }
  check("AC2: ignored channel ERUPTS the Freeze Nova", !!(nova && nova.frostnova > 0), nova);
  check("AC3: the nova SLOWS the hero (CAS-118 slow)", !!(heroSlow && heroSlow.slowT > 0), heroSlow && { slowT: heroSlow.slowT });

  // (5) status shatters the carapace -> damage lands
  const shatter = await fr.evaluate(async () => {
    window.__dev.giveBurnWeapon(6);
    const upWhen = (pred, ms) => new Promise((res) => { const t0 = Date.now(); const tick = () => { const c = window.__dev.huntState("frost").champ; if ((c && pred(c)) || Date.now() - t0 > ms) res(c); else setTimeout(tick, 40); }; tick(); });
    await upWhen((c) => !c.shielded, 2500);
    window.__dev.forceCarapace("frost"); window.__dev.poke("frost");
    const raised = await upWhen((c) => c.shielded, 4000);
    window.__dev.poke("frost");
    const hit = window.__dev.hitChamp("frost");
    const dropped = await upWhen((c) => !c.shielded, 2500);
    window.__dev.poke("frost");
    const after = window.__dev.hitChamp("frost");
    return { raised: !!(raised && raised.shielded), hit, dropped: !!(dropped && !dropped.shielded), after };
  });
  check("AC3: a STATUS (burn) hit flags the carapace to SHATTER while immune", !!(shatter.raised && shatter.hit && shatter.hit.shieldBroken), shatter.hit);
  check("AC3: shield SHATTERED -> hits now land", !!(shatter.dropped && shatter.after && shatter.after.hp < shatter.after.before), shatter.after && { before: shatter.after.before, hp: shatter.after.hp });

  // (6) reward
  const kill = await fr.evaluate(() => window.__dev.huntKillChampion("frost"));
  const drops = (kill && kill.drops) || []; const gear = drops.find((d) => d.kind === "gear"); const gold = drops.find((d) => d.kind === "gold");
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  check("AC4: slaying the Guardián cleared the Cripta + dropped epic top-tier gear", !!(kill && kill.cleared && gear && RANK[gear.rarity] >= RANK.epic && gear.tier >= 4), { cleared: kill && kill.cleared, gear });
  check("AC4: bonus gold dropped", !!(gold && gold.amt >= 400), gold);

  // (7) fps + screenshot + errors
  const fps = await fr.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(tick); }));
  check("AC6: 60fps held live", fps >= 58, { fps });

  // visual evidence — raise a fresh carapace in the icy zone for the screenshot
  await fr.evaluate(() => { window.__dev.tpZone("frost"); window.__dev.seed(7); const need = window.__dev.huntState("frost").need; if (!window.__dev.huntState("frost").champ) for (let i = 0; i < need; i++) window.__dev.spawnKill("wraith"); window.__dev.forceCarapace("frost"); window.__dev.poke("frost"); });
  await sleep(600);
  await page.screenshot({ path: SHOT });
  check("frost carapace screenshot saved", true, SHOT);

  check("AC6: zero JS errors live", report.errors.length === 0, report.errors);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check("harness threw", false, String(e && e.stack || e));
} finally {
  await browser.close();
}
console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END===");
console.log(report.pass ? "\n✓ CAS-121 LIVE frost probe PASSED." : "\n✗ CAS-121 LIVE frost probe FAILED.");
process.exit(report.pass ? 0 : 1);
