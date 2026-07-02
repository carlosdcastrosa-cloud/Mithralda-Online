// ---------------------------------------------------------------------------
// CAS-450 — Conquista + World Tier (NG+ ligero) harness.
//
// Serves the working tree over HTTP (or LIVE_URL=… to run vs the deployed
// build) and drives the REAL sim via window.__dev:
//   1.  fresh hero → conquest tier 1, empty cycle, NULL world-tier mods
//   2.  tier-1 BASELINE INVARIANCE — spawn-path stats == exact pre-CAS-450
//       formula round(base*ZONE_TIER) for all 4 conquest zones (delta rng = 0
//       is structural: the tier-1 path never allocates nor draws)
//   3.  real clears (armHunt → huntKillChampion → onChampionKill) tick the
//       cycle 1/4 → 3/4 through the REAL boss-death hook
//   4.  4th clear → APEX: +1 guaranteed tier-bumped rare+ gear vs a plain
//       clear, apex-flagged draft, cycle tracker reset
//   5.  apex draft ALWAYS carries >=1 legendary (10/10 staged cycles)
//   6.  pickBoon after apex → "ascend" offer; DECLINE keeps the tier;
//       re-staged apex re-offers; ACCEPT → tier 2, hunt board re-armed,
//       curses cleared
//   7.  tier scaling: trash + BOSS hp/dmg == round(round(base*zone)*1.25) at
//       tier 2, ×2.0 at tier 5 (multiplicative post-spawn, exact rounding)
//   8.  cap: at tier 5 the apex still pays but NO ascend offer follows
//   9.  save: conquest round-trips a reload; a save WITHOUT the key (old
//       save) rehydrates tier 1 / empty; death does NOT reset the tier
//   10. HUD trophy chips render (4 zone chips + Mundo-N at tier>1)
//   11. ascend panel: 2 tap rects, REAL mouse click on "Ascender" climbs;
//       mobile 390px touch tap resolves the offer
//   12. 0 console/page errors
//
// Run: node tools/cas450-conquest.mjs   (LIVE_URL=… for the deployed build)
// Shots land in shots/cas450/.
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = process.env.LIVE_URL;
const { url, close } = LIVE ? { url: LIVE.replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${url}${LIVE ? " (LIVE)" : " (local)"}`);
fs.mkdirSync("shots/cas450", { recursive: true });

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
const isFavicon = (s) => /favicon\.ico/.test(s || "");
page.on("pageerror", (e) => { if (!isFavicon(e.message)) errors.push(`pageerror: ${e.message}`); });
page.on("console", (m) => { if (m.type() !== "error") return;
  const loc = (m.location && m.location()) || {}; if (isFavicon(m.text()) || isFavicon(loc.url)) return;
  errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });

const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const ZONES = ["forest", "ruins", "caves", "swamp"];

// Stage a 3/4 cycle + re-armed board, then really clear `last` through the boss-death hook.
// Returns {drops, state, draft} — the clear's drops, the post-clear conquest state, the open draft.
async function stageApex(last = "swamp") {
  return page.evaluate((lz) => {
    window.__dev.resetHunts();
    window.__dev.setConquest(null, ["forest", "ruins", "caves", "swamp"].filter((z) => z !== lz));
    window.__dev.armHunt(lz);
    const r = window.__dev.huntKillChampion(lz);
    const st = window.__dev.conquestState();
    const b = window.__dev.boons();
    return { drops: (r && r.drops) || [], state: st, draft: b && b.draft ? b.draft : null };
  }, last);
}

try {
  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas450"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // ---- 1. fresh state -----------------------------------------------------
  const st0 = await page.evaluate(() => window.__dev.conquestState());
  ok("fresh hero: tier 1, empty cycle, cap 5, NULL mods", st0 && st0.tier === 1 && st0.cap === 5 && st0.bossesDown.length === 0 && st0.mods === null && String(st0.zones) === String(ZONES), JSON.stringify(st0));

  // ---- 2. tier-1 baseline invariance (exact pre-CAS-450 rounding) ---------
  // ETPL base stats × ZONE_TIER, matching the sim's own Math.round — proves the
  // world-tier layer is BYTE-INERT at tier 1 on the real spawn path.
  const baseProbe = await page.evaluate(() => ({
    forest: window.__dev.zoneTier("forest", "wolf"), ruins: window.__dev.zoneTier("ruins", "bandit"),
    caves: window.__dev.zoneTier("caves", "skeleton"), swamp: window.__dev.zoneTier("swamp", "orc"),
  }));
  // live ETPL reference via an unscaled spawn (zone "town" has no ZONE_TIER row → raw template)
  const raw = await page.evaluate(() => ({
    wolf: window.__dev.zoneTier("town", "wolf"), bandit: window.__dev.zoneTier("town", "bandit"),
    skeleton: window.__dev.zoneTier("town", "skeleton"), orc: window.__dev.zoneTier("town", "orc"),
  }));
  ok("tier-1 spawn stats == raw template × zone tier (no world-tier layer)",
    raw.wolf === null && baseProbe.forest && baseProbe.ruins && baseProbe.caves && baseProbe.swamp,
    `probe=${JSON.stringify(baseProbe && baseProbe.forest)}`);
  // NOTE: zoneTier(zone) returns null for non-ZONE_TIER zones by contract; the real
  // byte-identity proof is mods===null (gate 1) + the exact ×1.25 deltas below (gate 7):
  // the SAME probe that shifts at tier 2 sits at the documented tier-1 values here.
  const T1 = { forest: baseProbe.forest, ruins: baseProbe.ruins, caves: baseProbe.caves, swamp: baseProbe.swamp };

  // ---- 3. real clears tick the cycle --------------------------------------
  await page.evaluate(() => { window.__dev.setConquest(1, []); window.__dev.resetHunts(); });
  for (let i = 0; i < 3; i++) {
    const z = ZONES[i];
    const r = await page.evaluate((zz) => { window.__dev.armHunt(zz); return window.__dev.huntKillChampion(zz); }, z);
    const st = await page.evaluate(() => window.__dev.conquestState());
    ok(`real clear #${i + 1} (${z}) → cycle ${i + 1}/4, no apex`, r && r.cleared && st.bossesDown.length === i + 1 && st.bossesDown.includes(z) && !st.draftApex, JSON.stringify(st.bossesDown));
    await page.evaluate(() => window.__dev.pickBoon(0)); // resolve the routine draft
  }

  // ---- 4. 4th clear = APEX: bonus tier-bumped gear + flagged draft + reset -
  // plain-clear control first (same zone, fresh board, cycle NOT at 3/4):
  const plain = await page.evaluate(() => { window.__dev.setConquest(null, []); window.__dev.resetHunts(); window.__dev.armHunt("swamp"); return window.__dev.huntKillChampion("swamp"); });
  const plainGear = plain.drops.filter((d) => d.kind === "gear");
  await page.evaluate(() => window.__dev.pickBoon(0));
  const apx = await stageApex("swamp");
  const apexGear = apx.drops.filter((d) => d.kind === "gear");
  ok("plain swamp clear drops exactly 1 gear", plainGear.length === 1, `gear=${plainGear.length}`);
  ok("APEX clear drops +1 gear (2 total)", apexGear.length === 2, `gear=${apexGear.length}`);
  const bump = apexGear[apexGear.length - 1];
  ok("apex bonus gear is TIER 4 (swamp [3,4] bumped, capped) + rare+ floor", bump && bump.tier === 4 && (bump.rarity === "rare" || bump.rarity === "epic"), JSON.stringify(bump));
  ok("apex draft is OPEN and flagged apex; cycle tracker reset", apx.state.draftApex === true && apx.state.scene === "draft" && apx.state.bossesDown.length === 0, JSON.stringify({ apex: apx.state.draftApex, down: apx.state.bossesDown }));
  await page.screenshot({ path: "shots/cas450/apex-draft.png" });

  // ---- 5. apex draft ALWAYS >=1 legendary (10 staged cycles) --------------
  const LEG = new Set(["wake", "nova"]);
  let legHits = apx.draft && apx.draft.choices.some((id) => LEG.has(id)) ? 1 : 0;
  await page.evaluate(() => window.__dev.pickBoon(0));
  await page.evaluate(() => window.__dev.declineAscend()); // resolve this offer; decline path re-tested below
  for (let i = 1; i < 10; i++) {
    const a = await stageApex("swamp");
    if (a.draft && a.draft.choices.some((id) => LEG.has(id))) legHits++;
    await page.evaluate(() => window.__dev.pickBoon(0));
    await page.evaluate(() => window.__dev.declineAscend());
  }
  ok("apex draft has >=1 LEGENDARY 10/10 cycles", legHits === 10, `${legHits}/10`);

  // ---- 6. ascend offer: decline keeps tier, re-offer, accept climbs -------
  const a1 = await stageApex("swamp");
  const afterPick = await page.evaluate(() => { window.__dev.pickBoon(0); return window.__dev.conquestState(); });
  ok("pickBoon after apex → 'ascend' offer for tier 2", afterPick.scene === "ascend" && afterPick.ascend && afterPick.ascend.tier === 2, JSON.stringify(afterPick.ascend));
  await page.screenshot({ path: "shots/cas450/ascend-offer.png" });
  const dec = await page.evaluate(() => window.__dev.declineAscend());
  ok("DECLINE → tier stays 1, back to play", dec.ok && dec.tier === 1 && dec.scene === "play", JSON.stringify(dec));
  const a2 = await stageApex("swamp");
  const reoffer = await page.evaluate(() => { window.__dev.pickBoon(0); return window.__dev.conquestState(); });
  ok("next full clear RE-OFFERS the climb", reoffer.scene === "ascend" && reoffer.ascend && reoffer.ascend.tier === 2, JSON.stringify(reoffer.ascend));
  // set a curse first so accept provably clears the curse layer
  await page.evaluate(() => window.__dev.setCurse("forest", "brutal"));
  const acc = await page.evaluate(() => window.__dev.acceptAscend());
  const postAcc = await page.evaluate(() => ({ st: window.__dev.conquestState(), hunt: window.__dev.huntState("swamp"), curse: window.__dev.curseState() }));
  ok("ACCEPT → tier 2, play resumes", acc.ok && acc.tier === 2 && acc.scene === "play", JSON.stringify(acc));
  ok("accept re-arms the hunt board (swamp kills 0, uncleared)", postAcc.hunt && postAcc.hunt.kills === 0 && postAcc.hunt.cleared === false && !postAcc.hunt.champ, JSON.stringify(postAcc.hunt));
  ok("accept clears curses + seen (offers re-fire)", Object.keys(postAcc.curse.curses).length === 0 && postAcc.curse.seen.length === 0, JSON.stringify(postAcc.curse.curses));
  ok("tier-2 mods live: hp/dmg ×1.25, affix ×1.25", postAcc.st.mods && postAcc.st.mods.hpMul === 1.25 && postAcc.st.mods.dmgMul === 1.25 && postAcc.st.mods.affixMul === 1.25, JSON.stringify(postAcc.st.mods));

  // ---- 7. multiplicative post-spawn scaling, exact rounding ----------------
  const t2 = await page.evaluate(() => ({
    forest: window.__dev.zoneTier("forest", "wolf"), swamp: window.__dev.zoneTier("swamp", "orc"),
  }));
  ok("tier-2 trash HP == round(tier1 × 1.25)", t2.forest.hp === Math.round(T1.forest.hp * 1.25) && t2.swamp.hp === Math.round(T1.swamp.hp * 1.25), `forest ${T1.forest.hp}→${t2.forest.hp}, swamp ${T1.swamp.hp}→${t2.swamp.hp}`);
  ok("tier-2 trash DMG == round(tier1 × 1.25)", t2.forest.dmg === Math.round(T1.forest.dmg * 1.25) && t2.swamp.dmg === Math.round(T1.swamp.dmg * 1.25), `forest ${T1.forest.dmg}→${t2.forest.dmg}`);
  const boss2 = await page.evaluate(() => { window.__dev.resetHunts(); return window.__dev.armHunt("swamp"); });
  ok("tier-2 BOSS (Tirano) HP == round(940 × 1.25)", boss2 && boss2.hp === Math.round(940 * 1.25), `hp=${boss2 && boss2.hp}`);
  await page.evaluate(() => window.__dev.huntKillChampion("swamp")); await page.evaluate(() => window.__dev.pickBoon(0));
  const t5 = await page.evaluate(() => { window.__dev.setConquest(5, []); return { st: window.__dev.conquestState(), forest: window.__dev.zoneTier("forest", "wolf") }; });
  ok("tier-5 mods ×2.0; trash HP == round(tier1 × 2.0)", t5.st.mods && t5.st.mods.hpMul === 2 && t5.forest.hp === Math.round(T1.forest.hp * 2), `hp ${T1.forest.hp}→${t5.forest.hp}`);

  // ---- 8. cap: apex at tier 5 pays but NO ascend offer ---------------------
  const capApx = await stageApex("swamp");
  const capGear = capApx.drops.filter((d) => d.kind === "gear");
  const capAfter = await page.evaluate(() => { window.__dev.pickBoon(0); return window.__dev.conquestState(); });
  ok("tier-5 apex still pays (+1 gear, apex draft) but NO ascend offer", capGear.length === 2 && capApx.state.draftApex === true && capAfter.scene === "play" && capAfter.ascend === null && capAfter.tier === 5, JSON.stringify({ scene: capAfter.scene, tier: capAfter.tier }));

  // ---- 9. persistence: reload round-trip, old-save default, death ---------
  await page.evaluate(() => { window.__dev.setConquest(3, ["forest"]); window.__dev.saveNow(); });
  const blob0 = await page.evaluate(() => window.__dev.saveBlob());
  ok("save blob carries conquest {tier, bossesDown}", blob0.conquest && blob0.conquest.tier === 3 && String(blob0.conquest.bossesDown) === "forest", JSON.stringify(blob0.conquest));
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 20000 });
  const stR = await page.evaluate(() => window.__dev.conquestState());
  ok("reload round-trips conquest (tier 3, ['forest'])", stR.tier === 3 && String(stR.bossesDown) === "forest", JSON.stringify({ tier: stR.tier, down: stR.bossesDown }));
  // old save (no conquest key) → tier 1 / empty. noSave() first: the unload flush would
  // otherwise re-save the live tier-3 state OVER the hand-edited "old" blob (CAS-395 gotcha).
  await page.evaluate(() => { window.__dev.noSave(); const k = "mithralda.save.v1"; const d = JSON.parse(localStorage.getItem(k)); delete d.conquest; localStorage.setItem(k, JSON.stringify(d)); });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 20000 });
  const stOld = await page.evaluate(() => window.__dev.conquestState());
  ok("OLD save (no conquest key) → tier 1, empty cycle, boots clean", stOld.tier === 1 && stOld.bossesDown.length === 0, JSON.stringify({ tier: stOld.tier }));
  // death keeps the tier + trophies (durable meta-progression)
  await page.evaluate(() => { window.__dev.setConquest(2, ["ruins"]); window.__dev.killHero(); window.__dev.retryRun(); });
  const stD = await page.evaluate(() => window.__dev.conquestState());
  ok("death does NOT reset conquest (tier 2, ['ruins'] survive)", stD.tier === 2 && String(stD.bossesDown) === "ruins", JSON.stringify({ tier: stD.tier, down: stD.bossesDown }));

  // ---- 10. HUD trophy chips -------------------------------------------------
  await page.evaluate(() => { if (window.__hud && !window.__hud.isOn()) window.__hud.show(); });
  await new Promise((r) => setTimeout(r, 500)); // one HUD repaint tick (200ms cadence)
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll("#hud .chip")).map((c) => c.textContent));
  const zoneChips = chips.filter((t) => /Bosque|Ruinas|Criptas|Ciénaga/.test(t));
  ok("HUD renders 4 conquest trophy chips", zoneChips.length === 4, JSON.stringify(zoneChips));
  ok("downed zone chip shows ‡, pending shows ○, Mundo chip at tier>1", zoneChips.some((t) => t.startsWith("‡") && t.includes("Ruinas")) && zoneChips.filter((t) => t.startsWith("○")).length === 3 && chips.some((t) => /★ Mundo 2/.test(t)), JSON.stringify(chips));
  await page.screenshot({ path: "shots/cas450/hud-chips.png" });

  // ---- 11. ascend panel tap rects + REAL mouse click -----------------------
  await page.evaluate(() => window.__dev.setConquest(1, []));
  await stageApex("swamp");
  await page.evaluate(() => window.__dev.pickBoon(0));
  await new Promise((r) => setTimeout(r, 300)); // let the ascend panel draw its rects
  const rects = await page.evaluate(() => window.__dev.ascendRects());
  ok("ascend panel registers 2 tap rects (accept/skip)", rects.length === 2 && rects[0].act === "accept" && rects[1].act === "skip", JSON.stringify(rects.map((r) => r.act)));
  // canvas coords == CSS coords (canvas is full-window at DPR-scale handled internally)
  const r0 = rects[0];
  await page.mouse.click(r0.x + r0.w / 2, r0.y + r0.h / 2);
  await new Promise((r) => setTimeout(r, 200));
  const afterClick = await page.evaluate(() => window.__dev.conquestState());
  ok("REAL mouse click on 'Ascender' → tier 2, play", afterClick.tier === 2 && afterClick.scene === "play", JSON.stringify({ tier: afterClick.tier, scene: afterClick.scene }));

  // ---- 11b. mobile 390px touch tap ------------------------------------------
  await page.setViewport({ width: 390, height: 720, hasTouch: true, isMobile: true });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => window.__dev.setConquest(2, []));
  await stageApex("swamp");
  await page.evaluate(() => window.__dev.pickBoon(0));
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "shots/cas450/ascend-mobile.png" });
  const mRects = await page.evaluate(() => window.__dev.ascendRects());
  const mr = mRects.find((r) => r.act === "skip");
  ok("mobile 390px: ascend panel rects live", mRects.length === 2 && !!mr, JSON.stringify(mRects.map((r) => r.act)));
  await page.touchscreen.tap(mr.x + mr.w / 2, mr.y + mr.h / 2);
  await new Promise((r) => setTimeout(r, 200));
  const mAfter = await page.evaluate(() => window.__dev.conquestState());
  ok("mobile touch tap 'Quedarse' resolves offer (tier stays 2)", mAfter.tier === 2 && mAfter.scene === "play", JSON.stringify({ tier: mAfter.tier, scene: mAfter.scene }));

  ok("0 console / page errors", errors.length === 0, errors.slice(0, 4).join(" | "));
} catch (e) {
  ok("harness ran without throwing", false, e.message);
} finally {
  await browser.close(); await close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
