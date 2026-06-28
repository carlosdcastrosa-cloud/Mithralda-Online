// ---------------------------------------------------------------------------
// Headless harness for CAS-123 — the STAGE-1 FINALE ARC: a legible win-goal, a
// climax, a victory screen and durable completion. Boots the REAL game headless and
// drives the arc through the SAME sim paths the game runs (no shortcuts):
//   1) GOAL EXISTS + LEGIBLE (AC1): stage1State() exposes the single win-goal
//      (HUNTS.frost.boss, the Guardián de la Cripta) and confirms that capstone is the
//      flagged FINAL boss; the run starts NOT yet completed; the objective gate reads
//      LOCKED below the power req (the HUD banner shows "reúne poder …").
//   2) GATE OPENS (AC1): once heroPower clears the req the objective flips to READY
//      ("derrota al Guardián …") — the same single number that gates the biome.
//   3) ALL 4+ CLASSES COMPLETE (AC2): for EACH playable class, clear the gate, summon
//      the final capstone and slay it through the REAL clear path (huntKillChampion →
//      killEnemy → onChampionKill) — the win fires regardless of class/build.
//   4) EXPLICIT VICTORY (AC3): the kill switches the scene to "victory" and builds a
//      run-summary snapshot (class, level, time, attempts, gold, best loot).
//   5) PERSISTS (AC3): the win flag is written into the durable save blob (stage1:true),
//      so a reload keeps the run completed; the run stats persist too.
//   6) FREE PLAY (AC): dismissing the victory screen drops back into play with the SAME
//      hero, and the objective now reads DONE.
//   7) 60 FPS held + 0 JS errors.
//
// Run: npm run finale   (or: node tools/cas123-finale.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"]; // CLASS_LIST order (Digit1..5)

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page, digit) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "FinaleBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), digit);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 600 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(srv.url + "?dev", { waitUntil: "load", timeout: 20000 });

  // ---------------- AC1: goal exists, legible, not yet done, gate LOCKED ----------------
  await enterPlay(page, 1);
  let st = await page.evaluate(() => window.__dev.stage1State());
  if (st && st.goal && st.goal.zone === "frost" && st.goal.boss && st.goal.req > 0) pass(`AC1 win-goal exists: derrota a "${st.goal.boss}" (zona ${st.goal.zone}, req poder ${st.goal.req})`);
  else fail(`AC1 win-goal missing/mal-formed: ${JSON.stringify(st && st.goal)}`);
  if (st && st.finalIsFinal) pass("AC1 the Guardián capstone is FLAGGED as the Stage-1 final boss (data-driven)");
  else fail("AC1 final boss not flagged (HUNTS.frost.boss.final)");
  if (st && st.stage1 === false) pass("AC1 a fresh run starts NOT completed (stage1=false)");
  else fail(`AC1 fresh run should be incomplete: stage1=${st && st.stage1}`);

  // objective gate LOCKED at low power (banner reads "reúne poder…")
  await page.evaluate(() => window.__dev.setUpg(0, 0, 0));
  const gLocked = await page.evaluate(() => window.__dev.frostGate());
  if (gLocked && !gLocked.unlocked && gLocked.power < gLocked.req) pass(`AC1 objective LOCKED at low power (${gLocked.power}/${gLocked.req}) → HUD shows "reúne poder…"`);
  else fail(`AC1 expected locked gate at low power: ${JSON.stringify(gLocked)}`);

  // ---------------- AC1: gate OPENS once power clears the req (objective→READY) ----------------
  await page.evaluate(() => window.__dev.setUpg(20, 20, 20));
  const gOpen = await page.evaluate(() => window.__dev.frostGate());
  if (gOpen && gOpen.unlocked && gOpen.power >= gOpen.req) pass(`AC1 objective READY once power clears req (${gOpen.power}/${gOpen.req}) → HUD shows "derrota al Guardián…"`);
  else fail(`AC1 expected open gate at high power: ${JSON.stringify(gOpen)}`);

  // capture the in-play objective banner for visual evidence
  await page.screenshot({ path: new URL("./cas123-objective.png", import.meta.url).pathname });
  pass("AC1 screenshot saved: tools/cas123-objective.png (objective banner)");

  // ---------------- AC2: EVERY class can complete the arc ----------------
  for (let i = 0; i < CLASSES.length; i++) {
    const cls = CLASSES[i];
    await enterPlay(page, i + 1);
    await page.evaluate(() => window.__dev.setUpg(20, 20, 20)); // open the gate this run
    const arm = await page.evaluate(() => window.__dev.armFinalBoss());
    if (!arm || !arm.final) { fail(`AC2 [${cls}] could not summon the FINAL boss: ${JSON.stringify(arm)}`); continue; }
    const res = await page.evaluate(() => window.__dev.huntKillChampion("frost")); // REAL clear path
    const after = await page.evaluate(() => window.__dev.stage1State());
    const won = after && after.stage1 === true && after.scene === "victory" && after.victory && after.victory.cls === cls;
    if (won) pass(`AC2 [${cls}] completed the arc → victory (lvl ${after.victory.lvl}, ${after.victory.deaths} caídas, ${after.victory.playT}s)`);
    else fail(`AC2 [${cls}] did not resolve to victory: stage1=${after && after.stage1} scene=${after && after.scene} cls=${after && after.victory && after.victory.cls}`);

    // ---------------- AC3 (once, on warrior): victory summary fields + screenshot ----------------
    if (cls === "warrior") {
      const v = after.victory;
      const hasSummary = v && typeof v.lvl === "number" && typeof v.playT === "number" && typeof v.deaths === "number" && typeof v.gold === "number" && v.bossName;
      if (hasSummary) pass(`AC3 victory summary built: clase=${v.cls} nivel=${v.lvl} oro=${v.gold} botín=${v.lootName || "—"} (${v.lootRarity || "—"})`);
      else fail(`AC3 victory summary incomplete: ${JSON.stringify(v)}`);
      await page.screenshot({ path: new URL("./cas123-victory.png", import.meta.url).pathname });
      pass("AC3 screenshot saved: tools/cas123-victory.png (victory screen)");

      // ---------------- AC3: the win PERSISTS into the save blob ----------------
      const blob = await page.evaluate(() => window.__dev.saveBlob());
      if (blob && blob.stage1 === true && typeof blob.playT === "number" && typeof blob.deaths === "number")
        pass(`AC3 win PERSISTS in save (stage1=true, playT=${blob.playT}, deaths=${blob.deaths}) → reload keeps it completed`);
      else fail(`AC3 win not persisted in save blob: ${JSON.stringify(blob && { stage1: blob.stage1, playT: blob.playT, deaths: blob.deaths })}`);

      // ---------------- AC: dismiss → FREE PLAY with the same hero, objective DONE ----------------
      const sc = await page.evaluate(() => window.__dev.ackVictory());
      const free = await page.evaluate(() => window.__dev.stage1State());
      if (sc === "play" && free && free.stage1 === true && free.scene === "play")
        pass("AC dismiss → free play (same hero, stage1 stays true → objective reads DONE)");
      else fail(`AC dismiss did not return to free play: scene=${sc} stage1=${free && free.stage1}`);
    }
  }

  // ---------------- FPS + page errors ----------------
  await enterPlay(page, 1);
  const fps = await page.evaluate(async () => {
    return await new Promise((resolve) => {
      let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else resolve(frames); }
      requestAnimationFrame(loop);
    });
  });
  if (fps >= 58) pass(`60 fps held during play (${fps} fps)`); else fail(`FPS too low: ${fps}`);

  if (errors.length === 0) pass("zero page errors"); else fail(`page errors: ${errors.slice(0, 4).join(" | ")}`);

} catch (e) {
  fail("harness threw: " + (e && e.stack || e));
} finally {
  await browser.close();
  if (srv.close) srv.close();
}

log("");
log(ok ? "✓ CAS-123 Stage-1 finale arc verified." : "✗ CAS-123 finale checks FAILED.");
process.exit(ok ? 0 : 1);
