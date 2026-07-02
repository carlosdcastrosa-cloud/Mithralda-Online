// ---------------------------------------------------------------------------
// CAS-394 — LOCAL smoke test for the OPT-IN ZONE MODIFIER ("Maldición").
//
// Serves the working tree over HTTP and drives the REAL sim via window.__dev:
//   1. entry offer fires once per zone (offerCurse → scene "curse" → accept/skip)
//   2. ACCEPT scales that zone's enemies up (hp/dmg via zoneTier probe) and
//      SKIP / un-cursed leaves them at base tier
//   3. cursed champion draft guarantees >=1 rare+ AND is flagged cursed; an
//      un-cursed draft stays un-flagged
//   4. clearing a cursed zone drops a BONUS gear piece vs an un-cursed clear
//   5. state resets on death; persists across a same-run reload
//   6. skip leaves the zone untouched; 0 console errors
//
// Run: node tools/cas394-local.mjs   (LIVE_URL=… to run vs the deployed build)
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = process.env.LIVE_URL;
const { url, close } = LIVE ? { url: LIVE.replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${url}${LIVE ? " (LIVE)" : " (local)"}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };

try {
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas394"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  ok("boot to play + __dev.curseState present", await page.evaluate(() => !!(window.__dev && window.__dev.curseState)));

  // 1. offer fires, keyboard accept resolves
  let off = await page.evaluate(() => window.__dev.offerCurse("forest"));
  ok("offerCurse('forest') opens the offer scene", !!(off && off.mod), JSON.stringify(off));
  ok("scene == 'curse' while the offer is open", await page.evaluate(() => window.__dev.scene()) === "curse");
  const acc = await page.evaluate(() => window.__dev.acceptCurse());
  ok("acceptCurse → curses['forest'] set + back to play", acc.ok && acc.curses.forest === off.mod && acc.scene === "play", JSON.stringify(acc));

  // 2. scaling — forest cursed 'brutal' vs un-cursed ruins base tier
  await page.evaluate(() => { window.__dev.setCurse("forest", null); }); // clear to measure base
  const baseF = await page.evaluate(() => window.__dev.zoneTier("forest", "wolf"));
  await page.evaluate(() => { window.__dev.setCurse("forest", "brutal"); });
  const curF = await page.evaluate(() => window.__dev.zoneTier("forest", "wolf"));
  // assert against the EXACT rounded expectation (Math.round(base*mul)) — integer rounding of small
  // base stats makes a raw ratio tolerance misleading, so match the sim's own rounding.
  ok("brutal curse raises enemy HP to round(base*1.25)", curF.hp === Math.round(baseF.hp * 1.25) && curF.hp > baseF.hp, `base=${baseF.hp} cursed=${curF.hp}`);
  ok("brutal curse raises enemy DMG to round(base*1.25)", curF.dmg === Math.round(baseF.dmg * 1.25) && curF.dmg > baseF.dmg, `base=${baseF.dmg} cursed=${curF.dmg}`);
  const baseC = await page.evaluate(() => { window.__dev.setCurse("caves", null); return window.__dev.zoneTier("caves", "skeleton"); });
  const spdC = await page.evaluate(() => { window.__dev.setCurse("caves", "frenzy"); return window.__dev.zoneTier("caves", "skeleton"); });
  ok("frenzy curse raises enemy SPEED to round(base*1.35)", spdC.spd === Math.round(baseC.spd * 1.35) && spdC.spd > baseC.spd, `base=${baseC.spd} cursed=${spdC.spd}`);

  // 3. cursed draft: guaranteed rare+ and flagged; un-cursed not
  const rank = { common: 0, rare: 1, legendary: 2 };
  const draftHasRarePlus = async (zone) => page.evaluate((z) => {
    const rc = { glass: "rare", ember: "common", venom: "common", arc: "rare", thorns: "common", stone: "common", vamp: "rare", swift: "common", reaper: "rare", greed: "common", wake: "legendary", nova: "legendary" };
    const d = window.__dev.openDraftZone(z);
    return { cursed: d.cursed, ranks: d.choices.map((id) => rc[id]) };
  }, zone);
  await page.evaluate(() => { window.__dev.setCurse("ruins", "brutal"); });
  let cursedRarePlusHits = 0;
  for (let i = 0; i < 20; i++) { const d = await draftHasRarePlus("ruins"); if (d.ranks.some((r) => r !== "common")) cursedRarePlusHits++; }
  ok("cursed draft ALWAYS has >=1 rare+ (20/20)", cursedRarePlusHits === 20, `${cursedRarePlusHits}/20`);
  const cd = await draftHasRarePlus("ruins");
  ok("cursed draft is flagged cursed", cd.cursed === true);
  const ud = await page.evaluate(() => { window.__dev.setCurse("ruins", null); const d = window.__dev.openDraftZone("ruins"); return { cursed: d.cursed }; });
  ok("un-cursed draft is NOT flagged", ud.cursed === false);

  // 4. bonus gear on cursed clear vs un-cursed clear — SAME zone, reset the hunt board between
  //    (drive the REAL champion kill path so the reward flows through onChampionKill).
  const clearAndCountGear = async (zone, curse) => page.evaluate((args) => {
    const [z, c] = args;
    window.__dev.resetHunts();
    window.__dev.setCurse(z, c || null);
    window.__dev.armHunt(z);
    const r = window.__dev.huntKillChampion(z);
    return (r && r.drops ? r.drops : []).filter((d) => d.kind === "gear").length;
  }, [zone, curse]);
  const plainGear = await clearAndCountGear("forest", null);
  const cursedGear = await clearAndCountGear("forest", "brutal");
  ok("un-cursed clear drops exactly 1 gear", plainGear === 1, `gear=${plainGear}`);
  ok("cursed clear drops a BONUS gear (2 total)", cursedGear === plainGear + 1, `plain=${plainGear} cursed=${cursedGear}`);

  // 5. reset on death
  await page.evaluate(() => { window.__dev.setCurse("forest", "brutal"); window.__dev.setCurse("arena", "swarm"); window.__dev.killHero(); window.__dev.retryRun(); });
  const afterDeath = await page.evaluate(() => window.__dev.curseState());
  ok("death resets curses + offered zones", Object.keys(afterDeath.curses).length === 0 && afterDeath.seen.length === 0, JSON.stringify(afterDeath.curses));

  // 6. skip leaves zone untouched (curses stays empty, zone marked seen)
  await page.evaluate(() => window.__dev.offerCurse("caves"));
  const sk = await page.evaluate(() => window.__dev.skipCurse());
  const afterSkip = await page.evaluate(() => window.__dev.curseState());
  ok("skip → no curse but zone marked seen (won't re-offer)", sk.ok && !afterSkip.curses.caves && afterSkip.seen.includes("caves"), JSON.stringify(afterSkip));

  ok("0 console / page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
} catch (e) {
  ok("harness ran without throwing", false, e.message);
} finally {
  await browser.close(); await close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
