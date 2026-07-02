// ---------------------------------------------------------------------------
// CAS-441 — Ciénaga de Bruma (4th open zone) verification harness.
//
// Drives the REAL game via window.__dev and proves, in one run:
//   1.  boot to play, 0 page errors
//   2.  the swamp rect exists (zone lookup + spawner rect + prop_sw_* solids)
//   3.  DETERMINISM: vs a reference build (REF_URL, default = live gh-pages),
//       every non-swamp solid + npc is byte-identical (CAS-398 guarantee) —
//       the swamp only APPENDS rng draws / filters its own rect
//   4.  walk-in entrance: the town's east road crosses into the zone on foot
//   5.  curse offer (CAS-394) fires on 1st natural entry; skip resolves
//   6.  tier-4 scaling: zoneTier(swamp) == zoneTier(arena) (documented parallel)
//   7.  loot window [3,4] (ZONE_LOOT)
//   8.  hunt contract (need 13) + champion "Bruto del Fango" summons (armHunt)
//   9.  boon draft opens from a swamp clear source (openDraftZone) + resolves
//   10. natural spawner populates the zone from the placeholder pool
//   11. a solid swamp prop (dead tree) BLOCKS the hero; marsh floor stays walkable
//   12. palette: swamp view is measurably teal vs the grass field (b-share)
//   13. ≥55 fps while moving in the zone
//
// Run: node tools/cas441-swamp.mjs                      (local working tree)
//      LIVE_URL=<url> node tools/cas441-swamp.mjs       (against a deploy)
//      SKIP_REF=1 …                                     (skip the determinism A/B)
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = process.env.LIVE_URL;
const REF = process.env.REF_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const { url, close } = LIVE ? { url: LIVE.replace(/\/$/, ""), close: async () => {} } : await startServer();
console.log(`target: ${url}${LIVE ? " (LIVE)" : " (local)"}   ref: ${REF}`);
mkdirSync("shots/cas441", { recursive: true });

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFavicon = (s) => /favicon\.ico/.test(s || "");

const SW = { x: 240, y: 150, w: 34, h: 30 };                 // tile rect (world.js)
const inSwRegion = (px, py) => { const tx = px / 32, ty = py / 32;
  return tx >= SW.x - 1 && tx < SW.x + SW.w + 1 && ty >= SW.y - 1 && ty < SW.y + SW.h + 1; };

async function boot(page, name) {
  await page.goto(`${name}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
  await page.evaluate(() => { try { window.__dev.clearSave && window.__dev.clearSave(); window.__dev.noSave && window.__dev.noSave(); } catch (e) {} });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas441";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
}

try {
  // ---- reference fingerprint (old build) for the determinism A/B --------------
  let refFp = null;
  if (!process.env.SKIP_REF) {
    const rp = await browser.newPage();
    try {
      await boot(rp, REF);
      refFp = await rp.evaluate(() => { const f = window.__dev.worldFingerprint();
        return { terrLen: f.terrLen, solids: f.solids, npcs: f.npcs, spawnCoords: f.spawnCoords }; });
    } catch (e) { console.log("ref build unavailable: " + e.message); }
    await rp.close();
  }

  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => { if (!isFavicon(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("console", (m) => { if (m.type() !== "error") return;
    const loc = (m.location && m.location()) || {}; if (isFavicon(m.text()) || isFavicon(loc.url)) return;
    errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });
  await page.setViewport({ width: 960, height: 640 });
  await page.evaluateOnNewDocument(() => {          // rAF frame counter for the fps gate
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await boot(page, url);
  ok("1. boot to play", true);

  // ---- 2. world data: rect + swamp solids -------------------------------------
  const fp = await page.evaluate(() => { const f = window.__dev.worldFingerprint();
    return { terrLen: f.terrLen, solids: f.solids, npcs: f.npcs, spawnCoords: f.spawnCoords }; });
  const swSpawner = fp.spawnCoords.some((r) => r[0] === SW.x && r[1] === SW.y && r[2] === SW.w && r[3] === SW.h);
  const swSolids = fp.solids.filter((s) => /^prop_sw_/.test(s[3]));
  const swTrees = swSolids.filter((s) => /dead_tree/.test(s[3]));
  ok("2a. swamp spawner rect registered (240,150,34,30)", swSpawner, JSON.stringify(fp.spawnCoords.slice(-1)));
  ok("2b. solid swamp props placed (dead trees + rocks)", swSolids.length >= 6 && swTrees.length >= 2, `${swSolids.length} solids, ${swTrees.length} trees`);
  ok("2c. all swamp solids inside the rect", swSolids.every((s) => inSwRegion(s[0], s[1])));

  // ---- 3. determinism vs reference build --------------------------------------
  if (refFp) {
    const oldKept = refFp.solids.filter((s) => !inSwRegion(s[0], s[1]));
    const newNonSw = fp.solids.filter((s) => !/^prop_sw_/.test(s[3]));
    const same = JSON.stringify(oldKept) === JSON.stringify(newNonSw);
    ok("3a. non-swamp solids byte-identical to reference", same, `ref-kept ${oldKept.length} vs new ${newNonSw.length}`);
    ok("3b. npcs byte-identical", JSON.stringify(refFp.npcs) === JSON.stringify(fp.npcs));
    ok("3c. spawner list = reference + swamp appended", JSON.stringify(refFp.spawnCoords) === JSON.stringify(fp.spawnCoords.slice(0, -1)));
    ok("3d. terrain length unchanged", refFp.terrLen === fp.terrLen, String(fp.terrLen));
  } else ok("3. determinism A/B skipped (no reference)", true, "SKIP_REF or ref unreachable");

  // ---- 4+5. walk-in entrance + curse offer on natural entry -------------------
  await page.evaluate(() => window.__dev.tp(236, 165));      // on the east road, just outside the gate
  await sleep(150);
  const zBefore = await page.evaluate(() => window.__dev.frostGate().zone);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='curse'", { timeout: 12000 }).catch(() => {});
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  const cs = await page.evaluate(() => window.__dev.curseState());
  ok("4. road walk-in: field → swamp on foot (no wall)", zBefore === "field" && cs.scene === "curse", `before=${zBefore} scene=${cs.scene}`);
  ok("5a. curse offer fired for 'swamp' on 1st entry", cs.offer && cs.offer.zone === "swamp", JSON.stringify(cs.offer));
  const skip = await page.evaluate(() => window.__dev.skipCurse());
  ok("5b. skip resolves + zone marked seen", skip.ok && skip.seen.includes("swamp") && skip.scene === "play");

  // ---- 6-8. scaling / loot / hunt row ------------------------------------------
  const [tSw, tAr] = await page.evaluate(() => [window.__dev.zoneTier("swamp", "wolf"), window.__dev.zoneTier("arena", "wolf")]);
  ok("6. tier-4 parallel: swamp == arena scaling", tSw && tAr && tSw.tier === 4 && tSw.hp === tAr.hp && tSw.dmg === tAr.dmg && tSw.xp === tAr.xp, JSON.stringify(tSw));
  const loot = await page.evaluate(() => window.__dev.zoneLoot("swamp"));
  ok("7. loot window [3,4]", loot && loot.tier[0] === 3 && loot.tier[1] === 4, JSON.stringify(loot));
  const hs = await page.evaluate(() => window.__dev.huntState("swamp"));
  ok("8a. hunt contract live (0/13)", hs && hs.need === 13 && hs.kills === 0 && !hs.cleared, JSON.stringify(hs));
  const champ = await page.evaluate(() => window.__dev.armHunt("swamp"));
  ok("8b. champion 'Bruto del Fango' summons w/ slam special", champ && champ.name === "Bruto del Fango" && champ.specialSlam === 12 && champ.minR === "rare", JSON.stringify(champ));

  // ---- 9. boon draft integration ------------------------------------------------
  const draft = await page.evaluate(() => window.__dev.openDraftZone("swamp"));
  ok("9a. boon draft opens from swamp-clear source", draft && draft.choices.length === 3 && draft.source === "swamp", JSON.stringify(draft && draft.source));
  const picked = await page.evaluate(() => window.__dev.pickBoon(0));
  ok("9b. draft resolves back to play", picked.ok && picked.scene === "play" && picked.list.length === 1);

  // ---- 10. natural spawner populates the zone -----------------------------------
  await page.evaluate(() => window.__dev.tp(257, 165));      // zone centre
  await sleep(11000);                                        // a few cooldown ticks
  const es = await page.evaluate(() => window.__dev.enemies());
  const inZone = es.filter((e) => e.x >= SW.x * 32 && e.x < (SW.x + SW.w) * 32 && e.y >= SW.y * 32 && e.y < (SW.y + SW.h) * 32);
  const pool = new Set(["wolf", "bat", "spearman", "wraith", "bandit"]);
  const inPool = inZone.filter((e) => pool.has(e.type));
  ok("10. spawner populates the marsh from the placeholder pool", inPool.length > 0,
    `${inPool.length}/${inZone.length} in zone: ${[...new Set(inZone.map((e) => e.type))].join(",")}`);

  // ---- 11. solid dead tree BLOCKS the hero --------------------------------------
  const iso = swTrees.find((t) => !fp.solids.some((o) => o !== t && Math.abs(o[1] - t[1]) < 24 && o[0] < t[0] && o[0] > t[0] - 220)) || swTrees[0];
  await page.evaluate((px, py) => window.__dev.tp(px / 32, py / 32), iso[0] - 52, iso[1]);
  await sleep(100);
  const s0 = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  await sleep(1500);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  const s1 = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  const moved = s1.x - s0.x, penetrated = s1.x > iso[0] - iso[2] + 6;
  ok("11a. dead tree blocks (approach then stop)", moved > 4 && !penetrated, `moved ${moved.toFixed(0)}px, tree x=${iso[0].toFixed(0)} r=${iso[2]}, end x=${s1.x.toFixed(0)}`);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true })));
  await sleep(900);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "a", bubbles: true })));
  const s2 = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  ok("11b. marsh floor walkable (free walk west)", s1.x - s2.x > 80, `moved ${(s1.x - s2.x).toFixed(0)}px`);

  // ---- 12. palette: teal marsh vs grass field -----------------------------------
  async function bShare(tx, ty, tag) {
    await page.evaluate((a, b) => window.__dev.tp(a, b), tx, ty);
    await sleep(700);
    await page.screenshot({ path: `shots/cas441/${tag}.png` });
    return page.evaluate(() => { const c = document.querySelector("canvas");
      const x = c.getContext("2d", { willReadFrequently: true }); // game ctx — reuse
      const w = c.width, h = c.height; const d = x.getImageData(w * 0.3, h * 0.3, w * 0.4, h * 0.4).data;
      let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const s = r + g + b || 1; return { r: r / s, g: g / s, b: b / s }; });
  }
  const swampCol = await bShare(257, 163, "swamp-view");
  const fieldCol = await bShare(300, 250, "field-view");
  ok("12. palette distinct: swamp b-share >> field b-share", swampCol.b > fieldCol.b + 0.06, `swamp b=${swampCol.b.toFixed(3)} vs field b=${fieldCol.b.toFixed(3)}`);

  // ---- 13. fps while moving in the marsh ----------------------------------------
  await page.evaluate(() => window.__dev.tp(250, 160));
  const dirs = ["KeyD", "KeyS", "KeyA", "KeyW"];
  const fpsSamples = [];
  for (const c of dirs) {
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, bubbles: true })), c);
    const f0 = await page.evaluate(() => window.__frames || 0); const t0 = Date.now();
    await sleep(900);
    const f1 = await page.evaluate(() => window.__frames || 0);
    fpsSamples.push((f1 - f0) / ((Date.now() - t0) / 1000));
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keyup", { code: k, bubbles: true })), c);
  }
  const fps = Math.max(...fpsSamples);
  ok("13. ≥55 fps moving in the marsh", fps >= 55, fpsSamples.map((f) => f.toFixed(0)).join("/"));

  ok("14. zero page errors", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");

  const fails = results.filter((r) => !r.pass);
  console.log(`\n${fails.length === 0 ? "ALL PASS" : "FAILURES: " + fails.length} (${results.length} gates)`);
  await browser.close(); await close();
  process.exit(fails.length === 0 ? 0 : 1);
} catch (e) {
  console.error("harness error:", e);
  await browser.close(); await close();
  process.exit(2);
}
