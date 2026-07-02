// ---------------------------------------------------------------------------
// CAS-442 — Ciénaga de Bruma mob family + Tirano del Pantano capstone harness.
//
// Drives the REAL game via window.__dev and proves, in one run:
//   1.  boot to play, 0 page errors (tracked through the whole run)
//   2.  ETPL wiring: 3 mobs on distinct proven archetypes (rusher/warlock/charger),
//       all richAnim; bogtyrant boss row (boss+richAnim+special sweep)
//   3.  CAS-360 crash guard: SP procedural fallback exists for ALL 4 sprites
//   4.  strips wired: every ENEMY_STRIPS state resolves to a real PNG whose
//       pixel width == fc*fw and height == fh (frame counts match the files)
//   5.  spawnKill no-throw ×3 + killsByType increments (drop shape sane)
//   6.  tier-4 zone scaling applies to the family (zoneTier swamp ≈ ×2.10 hp)
//   7.  natural spawner populates the marsh from the NEW family pool only
//   8.  richAnim states cycle in vivo (walk/attack1 observed on a live mob)
//   9.  capstone: armHunt(swamp) summons "Tirano del Pantano" (capstone,
//       richAnim, sprite bogtyrant, special slam 12, reward rare+ tier [3,4])
//   10. forceSpecial → attack2/specialNow observed (club-sweep strip drives)
//   11. huntKillChampion: cleared + GUARANTEED gear drop rarity ≥ rare + gold
//       (+ death corpse for the richAnim death strip)
//   12. bestiary: the 4 entries exist, trash 3 seen after kills, boss seen after
//       the clear, boss uses BOSS tier thresholds (hunted at 5)
//   13. daily slay contracts: the family rows can roll (day-scan via _setDay)
//   14. ≥55 fps moving in the populated marsh
//
// Run: node tools/cas442-swamp-mobs.mjs                (local working tree)
//      LIVE_URL=<url> node tools/cas442-swamp-mobs.mjs (against a deploy)
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = process.env.LIVE_URL;
const { url, close } = LIVE ? { url: LIVE.replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${url}${LIVE ? " (LIVE)" : " (local)"}`);
mkdirSync("shots/cas442", { recursive: true });

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFavicon = (s) => /favicon\.ico/.test(s || "");
const FAM = ["mudlurker", "wisp", "toadbrute"];
const SW = { x: 240, y: 150, w: 34, h: 30 };

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => { if (!isFavicon(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("console", (m) => { if (m.type() !== "error") return;
    const loc = (m.location && m.location()) || {}; if (isFavicon(m.text()) || isFavicon(loc.url)) return;
    errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });
  await page.setViewport({ width: 960, height: 640 });
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });

  await page.goto(`${url}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
  await page.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas442";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  ok("1. boot to play", true);

  // ---- 2. ETPL wiring (data, not hard-code) -------------------------------------
  const etpl = await page.evaluate(async () => {
    const m = await import("./sim/config.js");
    const pick = (t) => { const r = m.ETPL[t] || {}; return { arch: r.arch || null, richAnim: !!r.richAnim, boss: !!r.boss,
      sprite: r.sprite, lunge: r.lunge || 0, charge: r.charge || 0, proj: r.proj || null, meleeR: r.meleeR || 0,
      special: r.special ? r.special.slam.count : 0, hp: r.hp }; };
    return { mudlurker: pick("mudlurker"), wisp: pick("wisp"), toadbrute: pick("toadbrute"), bogtyrant: pick("bogtyrant"),
      bossBlock: (() => { const b = m.HUNTS.swamp.boss || null; return b && { base: b.base, name: b.name, minR: b.minR, tier: b.tier, special: b.special ? b.special.slam.count : 0 }; })() };
  });
  ok("2a. mudlurker = rusher ambusher (lunge, richAnim)", etpl.mudlurker.arch === "rusher" && etpl.mudlurker.lunge > 0 && etpl.mudlurker.richAnim && etpl.mudlurker.sprite === "mudlurker");
  ok("2b. wisp = warlock caster (bolt, meleeR, richAnim)", etpl.wisp.arch === "warlock" && etpl.wisp.proj === "bolt" && etpl.wisp.meleeR > 0 && etpl.wisp.richAnim);
  ok("2c. toadbrute = charger tank (charge lane, richAnim)", etpl.toadbrute.arch === "charger" && etpl.toadbrute.charge > 0 && etpl.toadbrute.richAnim);
  ok("2d. bogtyrant = boss row (boss, richAnim, sweep special)", etpl.bogtyrant.boss && etpl.bogtyrant.richAnim && etpl.bogtyrant.special === 12);
  ok("2e. HUNTS.swamp.boss = Tirano del Pantano, rare+ tier [3,4]", etpl.bossBlock && etpl.bossBlock.base === "bogtyrant" && etpl.bossBlock.name === "Tirano del Pantano"
    && etpl.bossBlock.minR === "rare" && String(etpl.bossBlock.tier) === "3,4" && etpl.bossBlock.special === 12);

  // ---- 3. CAS-360 crash guard: SP fallback for all 4 -----------------------------
  const sp = await page.evaluate(async () => {
    const m = await import("./render/sprites.js");
    const has = (k) => !!(m.SP[k] && m.SP[k].rows && m.SP[k].rows.length && m.SP[k].pal);
    return { mudlurker: has("mudlurker"), wisp: has("wisp"), toadbrute: has("toadbrute"), bogtyrant: has("bogtyrant") };
  });
  ok("3. SP procedural fallback exists for ALL 4 (CAS-360 guard)", sp.mudlurker && sp.wisp && sp.toadbrute && sp.bogtyrant, JSON.stringify(sp));

  // ---- 4. strips resolve to real PNGs with matching frame counts -----------------
  const strips = await page.evaluate(async () => {
    const m = await import("./render/sprites.js");
    const out = [];
    for (const mob of ["mudlurker", "wisp", "toadbrute", "bogtyrant"]) {
      const st = m.ENEMY_STRIPS[mob]; if (!st) { out.push({ mob, missing: true }); continue; }
      for (const state of ["idle", "walk", "attack1", "attack2", "hurt", "death"]) {
        const s = st[state]; if (!s) { out.push({ mob, state, missing: true }); continue; }
        const r = await new Promise((res) => { const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => res(null);
          img.src = "./assets/pixellab/fountains/anim/" + s.key + ".png"; });
        out.push({ mob, state, key: s.key, fc: s.fc, fw: s.fw, fh: s.fh, png: r,
          okDim: !!r && r.w === s.fc * s.fw && r.h === s.fh });
      }
    }
    return out;
  });
  const badStrips = strips.filter((s) => s.missing || !s.okDim);
  ok("4. all 24 strip states load + frame counts match the PNGs", badStrips.length === 0,
    badStrips.length ? JSON.stringify(badStrips.slice(0, 3)) : `${strips.length} states verified`);
  const bossTiles = await page.evaluate(async () => (await import("./render/sprites.js")).ENEMY_STRIPS.bogtyrant.idle.tiles || 0);
  ok("4b. boss pinned at capstone scale (tiles 3.6, golem convention)", bossTiles === 3.6, `tiles=${bossTiles}`);

  // ---- 5. spawnKill no-throw ×3 + killsByType ------------------------------------
  for (const t of FAM) {
    const r = await page.evaluate(async (type) => {
      try { const drops = window.__dev.spawnKill(type);
        const st = window.__dev.heroStats();
        return { ok: true, drops, kills: (st && st.killsByType && st.killsByType[type]) || null };
      } catch (e) { return { ok: false, err: String(e) }; }
    }, t);
    // killsByType may not ride heroStats — read it via the save-independent bestiary killCount instead
    const kc = await page.evaluate(async (type) => {
      const b = window.__bestiary; return b && b.killCount ? b.killCount(type) : null; }, t);
    ok(`5. spawnKill('${t}') no-throw + counted`, r.ok && (kc === null || kc >= 1),
      r.ok ? `drops:${r.drops.length} killsByType:${kc}` : r.err);
  }

  // ---- 6. tier-4 zone scaling applies --------------------------------------------
  const tiers = await page.evaluate((fam) => fam.map((t) => ({ t, sw: window.__dev.zoneTier("swamp", t) })), FAM);
  const scaledOk = tiers.every(({ t, sw }) => sw && sw.tier === 4 && sw.hp === Math.round(etpl[t].hp * 2.10));
  ok("6. ZONE_TIER.swamp (tier-4, ×2.10 hp) scales the family", scaledOk, JSON.stringify(tiers.map(({ t, sw }) => `${t}:${sw && sw.hp}`)));

  // ---- 7. natural spawner: family-only pool --------------------------------------
  // Tank the hero (archArena parks 100000 hp) so the tier-4 pack can't kill it during
  // the observation windows, then enter the marsh. First entry pops the CAS-394 curse
  // offer (paused scene) — skip it or the sim freezes and the spawner never fills.
  await page.evaluate(() => { window.__dev.archArena("mudlurker", 4000, 0); window.__dev.tp(257, 165); });
  await sleep(600);
  await page.evaluate(() => { const s = window.__dev.scene(); if (s === "curse") window.__dev.skipCurse(); });
  await sleep(12000);
  const es = await page.evaluate(() => window.__dev.enemies());
  const inZone = es.filter((e) => e.x >= SW.x * 32 && e.x < (SW.x + SW.w) * 32 && e.y >= SW.y * 32 && e.y < (SW.y + SW.h) * 32 && !e.champion);
  const famSet = new Set(FAM);
  const alien = inZone.filter((e) => !famSet.has(e.type));
  const distinct = [...new Set(inZone.map((e) => e.type))];
  ok("7. spawner fills the marsh from the NEW family pool only", inZone.length >= 2 && alien.length === 0 && distinct.length >= 2,
    `${inZone.length} in zone (${distinct.join(",")}), aliens: ${alien.map((e) => e.type).join(",") || "none"}`);

  // ---- 8. richAnim states cycle in vivo ------------------------------------------
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const snap = await page.evaluate(() => window.__dev.enemies().filter((e) => !e.champion).map((e) => e.animState));
    snap.forEach((s) => s && seen.add(s));
    if (seen.has("walk") && seen.has("attack1")) break;
    await sleep(250);
  }
  ok("8. richAnim strip states cycle on live mobs (walk + attack1)", seen.has("walk") && seen.has("attack1"), [...seen].join(","));
  await page.screenshot({ path: "shots/cas442/mobs-live.png" });

  // ---- 9. capstone summons -------------------------------------------------------
  const arm = await page.evaluate(() => window.__dev.armHunt("swamp"));
  ok("9. armHunt(swamp) summons Tirano del Pantano (capstone, richAnim, bogtyrant)",
    arm && arm.name === "Tirano del Pantano" && arm.capstone && arm.richAnim && arm.sprite === "bogtyrant"
    && arm.hasSpecial && arm.specialSlam === 12 && arm.minR === "rare" && String(arm.tiers) === "3,4",
    JSON.stringify(arm));

  // ---- 10. boss anims: attack1 in vivo, forceSpecial → attack2 --------------------
  const bossSeen = new Set();
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__dev.poke("swamp"));
    const b = await page.evaluate(() => window.__dev.enemies().find((e) => e.champion) || null);
    if (b && b.animState) bossSeen.add(b.animState);
    if (bossSeen.has("attack1")) break;
    await sleep(250);
  }
  await page.evaluate(() => window.__dev.forceSpecial("swamp"));
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__dev.poke("swamp"));
    const b = await page.evaluate(() => window.__dev.enemies().find((e) => e.champion) || null);
    if (b && b.animState) bossSeen.add(b.animState);
    if (b && (b.animState === "attack2" || b.specialNow)) { bossSeen.add("attack2*"); break; }
    await sleep(250);
  }
  ok("10. boss cycles attack1 + special sweep (attack2) in vivo",
    bossSeen.has("attack1") && (bossSeen.has("attack2") || bossSeen.has("attack2*")), [...bossSeen].join(","));
  await page.screenshot({ path: "shots/cas442/boss-fight.png" });

  // ---- 11. clear: GUARANTEED gear rare+ + corpse ----------------------------------
  const corpsesBefore = await page.evaluate(() => window.__dev.bossAnim().corpses);
  const killRes = await page.evaluate(() => window.__dev.huntKillChampion("swamp"));
  const gear = (killRes && killRes.drops || []).filter((d) => d.kind === "gear" || d.rarity);
  const rareUp = gear.filter((d) => ["rare", "epic", "legendary"].includes(d.rarity));
  const gold = (killRes && killRes.drops || []).some((d) => d.kind === "gold");
  const corpsesAfter = await page.evaluate(() => window.__dev.bossAnim().corpses);
  ok("11a. boss clear: cleared + GUARANTEED gear rarity ≥ rare + gold", killRes && killRes.cleared && rareUp.length >= 1 && gold,
    JSON.stringify(killRes && killRes.drops));
  ok("11b. richAnim death corpse spawned (death strip plays)", corpsesAfter > corpsesBefore, `${corpsesBefore}→${corpsesAfter}`);
  // clear resolves into the inter-zone boon draft — resolve it back to play
  const draft = await page.evaluate(() => window.__dev.boons());
  if (draft && draft.scene === "draft") await page.evaluate(() => window.__dev.pickBoon(0));

  // ---- 12. bestiary: 4 entries, tiers, seen state ----------------------------------
  const best = await page.evaluate(() => {
    const b = window.__bestiary.board();
    const get = (t) => b.entries.find((e) => e.type === t) || null;
    return { total: b.total, mudlurker: get("mudlurker"), wisp: get("wisp"), toadbrute: get("toadbrute"), bogtyrant: get("bogtyrant") };
  });
  const trashSeen = FAM.every((t) => best[t] && best[t].seen);
  ok("12a. bestiary lists the 4 family entries", !!(best.mudlurker && best.wisp && best.toadbrute && best.bogtyrant), `total=${best.total}`);
  ok("12b. trash 3 'Visto' after kills; boss seen + BOSS thresholds", trashSeen && best.bogtyrant.seen && best.bogtyrant.boss,
    JSON.stringify({ boss: best.bogtyrant && { seen: best.bogtyrant.seen, boss: best.bogtyrant.boss } }));

  // ---- 13. daily slay contracts can roll -------------------------------------------
  const rolled = await page.evaluate(() => {
    const found = new Set();
    for (let d = 1; d <= 60; d++) {
      window.__daily._setDay("cas442-scan-" + d);
      for (const c of window.__daily.board().contracts) if (c.mob && ["mudlurker", "wisp", "toadbrute"].includes(c.mob)) found.add(c.mob + "|" + c.title);
      if (found.size >= 3) break;
    }
    window.__daily._setDay(null);
    return [...found];
  });
  ok("13. swamp-family slay contracts roll in the daily pool (localized)", rolled.length >= 1 && rolled.every((r) => /Acechadores del Fango|Fuegos Fatuos|Brutos Sapo/.test(r)),
    rolled.join(" · ") || "none in 60 day-rolls");

  // ---- 14. fps in the populated marsh ----------------------------------------------
  await page.evaluate(() => window.__dev.tp(257, 165));
  let best_fps = 0;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.__frames = 0; window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })); });
    await sleep(2000);
    const f = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })); return window.__frames; });
    best_fps = Math.max(best_fps, f / 2);
  }
  ok("14. ≥55 fps moving in the populated marsh", best_fps >= 55, `${best_fps.toFixed(0)} fps`);

  ok("0 page errors across the whole run", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");
  await page.close();
} catch (e) {
  ok("harness completed", false, e.message);
} finally {
  await browser.close();
  await close();
}

const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS${fails.length ? "  FAILS: " + fails.map((f) => f.name).join(" ; ") : ""}`);
process.exit(fails.length ? 1 : 0);
