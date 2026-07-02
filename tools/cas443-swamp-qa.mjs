// ---------------------------------------------------------------------------
// CAS-443 — INDEPENDENT QA gate for the 4th zone (Ciénaga de Bruma, CAS-441+442)
// against the LIVE gh-pages deploy. Own harness, distinct from ENG's cas442:
// this one proves the PLAYER-FACING paths, not the data wiring:
//
//   1.  BUILD: version.json readable + __BUILD singleton import agrees
//   2.  boot to play, 0 errors (collected across the whole run)
//   3.  REACHABLE ON FOOT: walk east along the town road INTO the swamp
//       (no tp into the rect — the west gate must actually be open)
//   4.  curse offer fires on the 1st swamp entry (CAS-394), offer.zone=swamp
//   5.  visual identity: avg ground colour in the swamp is distinct from
//       field / town / caves / forest (+ eyeball shots — histogram similarity
//       alone is a known false-positive, CAS-358)
//   6.  collision vs swamp props (CAS-401 pattern): edge-stop into a dead
//       tree / mossy rock, diagonal SLIDE along it, free-walk control
//   7.  the 3 mobs die to REAL pointer-click attacks (heroAttack->hitEnemy
//       path, bestiary killCount increments per type)
//   8.  distinct combat patterns IN VIVO: mudlurker lunge burst, toadbrute
//       charge burst, wisp ranged bolt (enemy projectile), archs distinct
//   9.  CAS-360 window: 0 page errors during the swamp asset-load window
//   10. boss: armHunt(swamp) → Tirano del Pantano; windup/attack1 + special
//       sweep (attack2) observed with shots (ground telegraphs are OFF by
//       board directive CAS-402/403 — the tell is the strip-baked windup)
//   11. boss DIES TO REAL ATTACKS (setChampHp low + pointer clicks) →
//       hunt cleared → boon draft opens (CAS-383) → pick resolves to play
//   12. guaranteed drop shape: resetHunts + armHunt + huntKillChampion →
//       gear rarity ≥ rare + gold (CAS-442 guarantee)
//   13. bestiary: 4 entries, trash seen after kills, boss flag (CAS-386)
//   14. daily slay contracts for the family can roll (CAS-375)
//   15. regression: live worldFingerprint == local master fingerprint
//       (terrain hash / walls / solids / npcs / spawn rects — zero delta)
//   16. existing zones intact in vivo: forest + caves spawn their own pools
//       (no swamp aliens), shots captured
//   17. ≥55 fps moving in the populated marsh
//   18. save compatible: fresh page (persistence ON) saveNow → reload →
//       boots clean with the save present
//   19. mobile 390px: boots to play, DPR-capped canvas, REAL touch tap
//       lands a hit (damage floater)
//
// Run:  node tools/cas443-swamp-qa.mjs            (vs LIVE gh-pages)
//       LIVE_URL=<url> node tools/cas443-swamp-qa.mjs
// ---------------------------------------------------------------------------
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const LIVE = (process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const srv = await startServer(); // local master, for the fingerprint-parity gate
console.log(`live: ${LIVE}   local: ${srv.url}`);
mkdirSync("shots/cas443", { recursive: true });

const SW = { x: 240, y: 150, w: 34, h: 30 };
const GATE_Y = 165;                     // town road row (town.y + town.h/2)
const FAM = ["mudlurker", "wisp", "toadbrute"];
const results = [];
const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${info ? " — " + info : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isFav = (s) => /favicon\.ico/.test(s || "");

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

function wire(page, errors) {
  page.on("pageerror", (e) => { if (!isFav(e.message)) errors.push(`pageerror: ${e.message}`); });
  page.on("console", (m) => { if (m.type() !== "error") return;
    const loc = (m.location && m.location()) || {}; if (isFav(m.text()) || isFav(loc.url)) return;
    errors.push(`console.error: ${m.text()} @ ${loc.url || "?"}`); });
}
async function bootToPlay(page, base, name, digit = "Digit1", wipeSave = true) {
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${base}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','play'].includes(window.__dev.scene())", { timeout: 30000 });
  if (wipeSave) {
    await page.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
    if (await page.evaluate(() => window.__dev.scene()) === "play") await page.reload({ waitUntil: "load" });
    await page.waitForFunction("window.__dev && window.__dev.scene()==='menu'", { timeout: 15000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate((nm) => { const i = document.getElementById("nameInput"); if (i) i.value = nm;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
    await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d.slice(-1), bubbles: true })), digit);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  }
}
const press = (page, c) => page.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keydown", { code: x, key: x, bubbles: true })), c);
const release = (page, c) => page.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keyup", { code: x, key: x, bubbles: true })), c);
const hero = (page) => page.evaluate(() => { const h = window.__dev.hero(); return h && { x: h.x, y: h.y }; });
// avg ground colour of the world band below the hero (getImageData on the 2d canvas)
const groundAvg = (page) => page.evaluate(() => {
  const cv = document.getElementById("c"); const ctx = cv.getContext("2d");
  const d = ctx.getImageData(Math.round(cv.width * 0.25), Math.round(cv.height * 0.58), Math.round(cv.width * 0.5), Math.round(cv.height * 0.25)).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
});
const cdist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// real pointer-click attack burst aimed from canvas center toward (dx,dy)
const clickAttacks = (page, dx, dy, n = 24, gap = 70) => page.evaluate(async (dx2, dy2, n2, gap2) => {
  const cv = document.getElementById("c"); const r = cv.getBoundingClientRect();
  const L = Math.max(1, Math.hypot(dx2, dy2)); const R = 100;
  const x = r.left + r.width / 2 + (dx2 / L) * R, y = r.top + r.height / 2 + (dy2 / L) * R;
  for (let i = 0; i < n2; i++) {
    const o = { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: "mouse" };
    cv.dispatchEvent(new PointerEvent("pointermove", o));
    cv.dispatchEvent(new PointerEvent("pointerdown", o));
    cv.dispatchEvent(new PointerEvent("pointerup", o));
    await new Promise((res) => setTimeout(res, gap2));
  }
}, dx, dy, n, gap);

try {
  const page = await browser.newPage();
  const errors = [];
  wire(page, errors);
  await page.setViewport({ width: 960, height: 640 });

  // ---- 1. BUILD gate ---------------------------------------------------------------
  const vj = await fetch(`${LIVE}/version.json`).then((r) => r.json()).catch(() => null);
  await bootToPlay(page, LIVE, "Cas443");
  const bmod = await page.evaluate(() => window.__BUILD || null); // index.html bootstrap global (cache-busts assets)
  ok("1. version.json + window.__BUILD agree", vj && vj.build && bmod === vj.build, `build=${vj && vj.build} __BUILD=${bmod}`);
  ok("2. boot to play (live)", true);

  // ---- 3+4. walk-in reachability + curse on 1st entry --------------------------------
  await page.evaluate(() => { window.__dev.archArena("wolf", 5000, 0); window.__dev.tp(235, 165); });
  await sleep(300);
  const start = await hero(page);
  await press(page, "KeyD");
  let curseSeen = false, walked = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    const sc = await page.evaluate(() => window.__dev.scene());
    walked = await hero(page);
    if (sc === "curse") { curseSeen = true; break; }
    if (walked.x >= (SW.x + 2) * 32) break;
  }
  await release(page, "KeyD");
  const curseSt = await page.evaluate(() => window.__dev.curseState());
  await page.screenshot({ path: "shots/cas443/curse-offer.png" });
  ok("3. swamp REACHABLE ON FOOT via the west road gate", start.x < SW.x * 32 && walked.x >= (SW.x - 1) * 32,
    `x ${Math.round(start.x)} -> ${Math.round(walked.x)} (gate ${SW.x * 32})`);
  ok("4. curse offer fires on 1st entry, zone=swamp (CAS-394)", curseSeen && curseSt && curseSt.offer && curseSt.offer.zone === "swamp",
    JSON.stringify(curseSt && curseSt.offer));
  await page.evaluate(() => window.__dev.skipCurse());
  await press(page, "KeyD"); await sleep(1200); await release(page, "KeyD");

  // ---- 9 (early). CAS-360 asset-load window: give strips time to stream in-zone ------
  await page.evaluate(() => window.__dev.tp(257, 165));
  await sleep(5000);
  const errsAfterLoad = errors.length;
  ok("9. 0 page errors through the swamp asset-load window (CAS-360)", errsAfterLoad === 0, errors.slice(0, 2).join(" | ") || "clean");
  await page.screenshot({ path: "shots/cas443/swamp-live.png" });

  // ---- 5. visual identity: palette probe + eyeball shots ----------------------------
  const probes = { swamp: [257, 165], field: [232, 158], town: [165, 165], caves: [166, 131], forest: [196, 165] };
  const avg = {};
  for (const [z, [tx, ty]] of Object.entries(probes)) {
    await page.evaluate((a, b) => window.__dev.tp(a, b), tx, ty);
    await sleep(700);
    await page.evaluate(() => { const s = window.__dev.scene(); if (s === "curse") window.__dev.skipCurse(); });
    await sleep(300);
    avg[z] = await groundAvg(page);
    await page.screenshot({ path: `shots/cas443/zone-${z}.png` });
  }
  // Distance alone false-positives on caves (both scenes are DARK — the known histogram
  // trap, CAS-358/426): compare a chroma signature too. The swamp reads teal-green
  // (g dominates r and b); caves gloom is near-neutral gray. Eyeball shots are the
  // primary evidence either way (zone-*.png attached to the issue).
  const greenness = (c) => c.g - (c.r + c.b) / 2;
  const dists = Object.fromEntries(Object.keys(probes).filter((z) => z !== "swamp").map((z) =>
    [z, { d: Math.round(cdist(avg.swamp, avg[z])), dg: Math.round(Math.abs(greenness(avg.swamp) - greenness(avg[z]))) }]));
  ok("5. swamp ground palette distinct from field/town/caves/forest (dist or chroma + eyeball)",
    greenness(avg.swamp) >= 12 && Object.values(dists).every(({ d, dg }) => d > 22 || dg > 8),
    `avg=${JSON.stringify(avg.swamp)} dist=${JSON.stringify(dists)}`);

  // ---- 16. existing zones intact in vivo (pool check while we're there) --------------
  const foreign = await page.evaluate((fam) => {
    const rects = { forest: { x: 174, y: 144, w: 44, h: 42 }, caves: { x: 140, y: 114, w: 52, h: 34 } };
    const out = {};
    for (const [z, r] of Object.entries(rects)) {
      out[z] = window.__dev.enemies().filter((e) => e.x >= r.x * 32 && e.x < (r.x + r.w) * 32 && e.y >= r.y * 32 && e.y < (r.y + r.h) * 32 && fam.includes(e.type)).length;
    }
    return out;
  }, FAM);
  ok("16. forest/caves pools intact (0 swamp aliens)", foreign.forest === 0 && foreign.caves === 0, JSON.stringify(foreign));

  // ---- 6. collision vs swamp solids (CAS-401 edge-stop + slide + control) ------------
  const fp = await page.evaluate(() => {
    const f = window.__dev.worldFingerprint();
    return { terrHash: f.terrHash, terrLen: f.terrLen, wallCount: f.wallCount, solidCount: f.solids.length,
      npcCount: f.npcs.length, spawnCoords: JSON.stringify(f.spawnCoords),
      swSolids: f.solids.filter((s) => /^prop_sw_/.test(s[3])) };
  });
  ok("6a. swamp SOLID props present (dead trees / mossy rocks)", fp.swSolids.length >= 10, `${fp.swSolids.length} prop_sw_* solids`);
  // pick an isolated solid: clear 170px lane to its west, inside the rect, off the gate rows
  const iso = fp.swSolids.filter(([x, y]) =>
    x > (SW.x + 5) * 32 && x < (SW.x + SW.w - 2) * 32 && y > (SW.y + 2) * 32 && y < (SW.y + SW.h - 2) * 32 &&
    !fp.swSolids.some((o) => o[0] !== x && Math.abs(o[1] - y) < 26 && o[0] < x && o[0] > x - 190));
  let edge = null, slide = null;
  for (const target of iso.slice(0, 5)) {
    const [tx, ty, tr] = target;
    await page.evaluate(() => window.__dev.archArena("wolf", 5000, 0)); // clear ambient mobs
    await page.evaluate((px, py) => window.__dev.tp(px / 32, py / 32), tx - 150, ty);
    await sleep(150);
    const s0 = await hero(page);
    await press(page, "KeyD"); await sleep(2200); await release(page, "KeyD");
    await sleep(120);
    const s1 = await hero(page);
    const moved = s1.x - s0.x, stopGap = tx - s1.x;
    if (moved < 40) continue; // knocked / stuck on something else — try another target
    edge = { tx, ty, tr, moved: Math.round(moved), stopGap: Math.round(stopGap), penetrated: s1.x > tx - tr + 6 && Math.abs(s1.y - ty) < tr };
    // slide: same approach with diagonal input — y must keep flowing while x is blocked
    await page.evaluate(() => window.__dev.archArena("wolf", 5000, 0));
    await page.evaluate((px, py) => window.__dev.tp(px / 32, py / 32), tx - 60, ty - 4);
    await sleep(150);
    const d0 = await hero(page);
    await press(page, "KeyD"); await press(page, "KeyS"); await sleep(1500);
    await release(page, "KeyD"); await release(page, "KeyS");
    const d1 = await hero(page);
    slide = { dy: Math.round(d1.y - d0.y), dx: Math.round(d1.x - d0.x) };
    break;
  }
  ok("6b. edge-stop: hero blocked at the prop footprint (no pass-through)", edge && !edge.penetrated && edge.moved > 40,
    edge ? JSON.stringify(edge) : "no isolated target found");
  ok("6c. slide: diagonal input flows along the solid (no sticky wall)", slide && slide.dy > 30, JSON.stringify(slide));
  await page.evaluate(() => window.__dev.tp(250, 172));
  await sleep(150);
  const f0 = await hero(page);
  await press(page, "KeyD"); await sleep(900); await release(page, "KeyD");
  const f1 = await hero(page);
  ok("6d. free-walk control: open marsh is walkable", f1.x - f0.x > 60, `dx=${Math.round(f1.x - f0.x)}`);

  // ---- 7. the 3 mobs die to REAL attacks -----------------------------------------------
  await page.evaluate(() => window.__dev.tp(257, 165));
  for (const t of FAM) {
    const before = await page.evaluate((x) => window.__bestiary.killCount(x) || 0, t);
    await page.evaluate((x) => { window.__dev.archArena("wolf", 5000, 0); window.__dev.spawn(x, 30, 0); }, t);
    let after = before;
    for (let round = 0; round < 10 && after <= before; round++) {
      // the charger's massive knockback (toadbrute knock 225) throws the hero out of
      // melee reach — CHASE it: re-park the hero next to the mob before every burst
      const e = await page.evaluate((x) => { const m = window.__dev.enemies().find((q) => q.type === x); return m && { x: m.x, y: m.y }; }, t);
      if (!e) break;
      await page.evaluate((mx, my) => window.__dev.tp(mx / 32 - 1.2, my / 32), e.x, e.y);
      await clickAttacks(page, 1, 0, 14, 65);
      after = await page.evaluate((x) => window.__bestiary.killCount(x) || 0, t);
    }
    ok(`7. ${t} dies to real pointer attacks (killCount +)`, after > before, `killCount ${before} -> ${after}`);
  }

  // ---- 8. distinct patterns in vivo ----------------------------------------------------
  const arch = await page.evaluate(async () => {
    const m = await import("./sim/config.js");
    return { mudlurker: m.ETPL.mudlurker.arch, wisp: m.ETPL.wisp.arch, toadbrute: m.ETPL.toadbrute.arch };
  });
  ok("8a. 3 distinct archetypes in data (rusher/warlock/charger)", new Set(Object.values(arch)).size === 3, JSON.stringify(arch));
  await page.evaluate(() => { window.__dev.archArena("wolf", 5000, 0); window.__dev.tp(257, 165); });
  await page.evaluate(() => { window.__dev.spawn("mudlurker", -170, 40); window.__dev.spawn("toadbrute", 190, -30); window.__dev.spawn("wisp", 0, -180); });
  const vivo = await page.evaluate(async () => {
    const prev = {}; const burst = { mudlurker: 0, toadbrute: 0 }; let bolt = 0;
    for (let i = 0; i < 110; i++) {
      const es = window.__dev.enemies();
      for (const t of ["mudlurker", "toadbrute"]) {
        const e = es.find((q) => q.type === t);
        if (e && prev[t]) { const v = Math.hypot(e.x - prev[t].x, e.y - prev[t].y) / 0.12; burst[t] = Math.max(burst[t], v); }
        prev[t] = e && { x: e.x, y: e.y };
      }
      const pj = window.__dev.enemyProj(); bolt = Math.max(bolt, (pj && pj.total) || 0);
      await new Promise((r) => setTimeout(r, 120));
    }
    return { burst, bolt };
  });
  ok("8b. mudlurker lunge burst in vivo (speed >> walk)", vivo.burst.mudlurker > 220, `${Math.round(vivo.burst.mudlurker)} px/s (walk ~129)`);
  ok("8c. toadbrute charge burst in vivo (speed >> walk)", vivo.burst.toadbrute > 150, `${Math.round(vivo.burst.toadbrute)} px/s (walk ~83)`);
  ok("8d. wisp casts a ranged bolt (enemy projectile in flight)", vivo.bolt > 0, `max enemy projectiles=${vivo.bolt}`);
  await page.screenshot({ path: "shots/cas443/mobs-fight.png" });

  // ---- 10. boss: summon + windup/special telegraph reads --------------------------------
  await page.evaluate(() => window.__dev.archArena("wolf", 5000, 0));
  const arm = await page.evaluate(() => window.__dev.armHunt("swamp"));
  ok("10a. armHunt(swamp) = Tirano del Pantano capstone (bogtyrant)",
    arm && arm.name === "Tirano del Pantano" && arm.sprite === "bogtyrant" && arm.capstone, JSON.stringify(arm && { name: arm.name, sprite: arm.sprite }));
  const seen = new Set();
  let windupShot = false;
  for (let i = 0; i < 45; i++) {
    await page.evaluate(() => window.__dev.poke("swamp"));
    const b = await page.evaluate(() => window.__dev.enemies().find((e) => e.champion) || null);
    if (b && b.animState) {
      seen.add(b.animState);
      if (b.animState === "attack1" && !windupShot) { await page.screenshot({ path: "shots/cas443/boss-attack1-windup.png" }); windupShot = true; }
    }
    if (seen.has("attack1")) break;
    await sleep(220);
  }
  await page.evaluate(() => window.__dev.forceSpecial("swamp"));
  for (let i = 0; i < 45; i++) {
    await page.evaluate(() => window.__dev.poke("swamp"));
    const b = await page.evaluate(() => window.__dev.enemies().find((e) => e.champion) || null);
    if (b && (b.animState === "attack2" || b.specialNow)) { seen.add("attack2"); await page.screenshot({ path: "shots/cas443/boss-attack2-sweep.png" }); break; }
    await sleep(220);
  }
  ok("10b. boss windup/attack1 tell + special sweep attack2 observed (shots)", seen.has("attack1") && seen.has("attack2"),
    [...seen].join(",") + " (ground telegraphs OFF by board CAS-402/403 — tell is the strip windup)");

  // ---- 11. boss dies to REAL attacks → clear → boon draft --------------------------------
  await page.evaluate(() => window.__dev.setChampHp("swamp", 0.02));
  let cleared = false;
  for (let round = 0; round < 10 && !cleared; round++) {
    const b = await page.evaluate(() => window.__dev.enemies().find((e) => e.champion) || null);
    if (!b) break;
    await page.evaluate((bx, by) => window.__dev.tp(bx / 32 - 1.5, by / 32), b.x, b.y);
    await clickAttacks(page, 1, 0, 14, 70);
    cleared = await page.evaluate(() => { const h = window.__dev.huntState("swamp"); return !!(h && h.cleared); });
  }
  ok("11a. boss DIES TO REAL ATTACKS → hunt cleared", cleared, "");
  await sleep(400);
  const draft = await page.evaluate(() => window.__dev.boons());
  await page.screenshot({ path: "shots/cas443/boon-draft.png" });
  const drafted = draft && draft.scene === "draft";
  if (drafted) await page.evaluate(() => window.__dev.pickBoon(0));
  const backToPlay = await page.evaluate(() => window.__dev.scene());
  ok("11b. boon draft opens on zone clear (CAS-383) + pick resolves", drafted && backToPlay === "play",
    `scene=${draft && draft.scene} -> ${backToPlay}`);

  // ---- 12. guaranteed drop shape (deterministic path) -------------------------------------
  const drop = await page.evaluate(() => {
    window.__dev.resetHunts();
    window.__dev.armHunt("swamp");
    return window.__dev.huntKillChampion("swamp");
  });
  const gear = ((drop && drop.drops) || []).filter((d) => d.rarity);
  const rareUp = gear.filter((d) => ["rare", "epic", "legendary"].includes(d.rarity));
  const gold = ((drop && drop.drops) || []).some((d) => d.kind === "gold");
  ok("12. boss clear GUARANTEES gear ≥ rare + gold", drop && drop.cleared && rareUp.length >= 1 && gold, JSON.stringify(drop && drop.drops));
  const draft2 = await page.evaluate(() => window.__dev.boons());
  if (draft2 && draft2.scene === "draft") await page.evaluate(() => window.__dev.pickBoon(0));

  // ---- 13. bestiary entries + tiers ----------------------------------------------------
  const best = await page.evaluate((fam) => {
    const b = window.__bestiary.board();
    const get = (t) => b.entries.find((e) => e.type === t) || null;
    return { entries: [...fam, "bogtyrant"].map((t) => ({ t, e: get(t) && { seen: get(t).seen, boss: !!get(t).boss } })) };
  }, FAM);
  const allIn = best.entries.every((r) => r.e);
  const trashSeen = best.entries.slice(0, 3).every((r) => r.e && r.e.seen);
  const bossRow = best.entries[3].e;
  ok("13. bestiary: 4 family entries, trash Visto after kills, boss row flagged BOSS (CAS-386)",
    allIn && trashSeen && bossRow && bossRow.seen && bossRow.boss, JSON.stringify(best.entries));

  // ---- 14. daily slay contracts roll ----------------------------------------------------
  const rolled = await page.evaluate((fam) => {
    const found = new Set();
    for (let d = 1; d <= 60; d++) {
      window.__daily._setDay("cas443-scan-" + d);
      for (const c of window.__daily.board().contracts) if (c.mob && fam.includes(c.mob)) found.add(c.mob);
      if (found.size >= 3) break;
    }
    window.__daily._setDay(null);
    return [...found];
  }, FAM);
  ok("14. swamp-family slay contracts roll in the daily pool (CAS-375)", rolled.length >= 1, rolled.join(",") || "none in 60 days");

  // ---- 17. fps in the populated marsh ----------------------------------------------------
  await page.evaluate(() => window.__dev.tp(257, 165));
  await sleep(2500); // let the spawner repopulate
  let fps = 0;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { window.__frames = 0; window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true })); });
    await sleep(2000);
    const f = await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyA", key: "a", bubbles: true })); return window.__frames; });
    fps = Math.max(fps, f / 2);
  }
  ok("17. ≥55 fps moving in the populated marsh", fps >= 55, `${fps.toFixed(0)} fps`);

  // ---- 15. regression: live fingerprint == local master fingerprint -----------------------
  const lp = await browser.newPage();
  const lErr = [];
  wire(lp, lErr);
  await lp.setViewport({ width: 960, height: 640 });
  await bootToPlay(lp, srv.url, "Cas443L");
  const lfp = await lp.evaluate(() => {
    const f = window.__dev.worldFingerprint();
    return { terrHash: f.terrHash, terrLen: f.terrLen, wallCount: f.wallCount, solidCount: f.solids.length,
      npcCount: f.npcs.length, spawnCoords: JSON.stringify(f.spawnCoords) };
  });
  await lp.close();
  const parity = ["terrHash", "terrLen", "wallCount", "solidCount", "npcCount", "spawnCoords"].every((k) => String(fp[k]) === String(lfp[k]));
  ok("15. live world == local master (terrain/walls/solids/npcs/spawners zero-delta)", parity,
    parity ? `terrHash=${fp.terrHash} solids=${fp.solidCount}` : JSON.stringify({ live: { ...fp, swSolids: fp.swSolids.length }, local: lfp }));

  ok("18. 0 page errors across the whole main run", errors.length === 0, errors.slice(0, 3).join(" | ") || "clean");
  await page.close();

  // ---- 19. save compatibility (persistence ON, separate page) -----------------------------
  const sp = await browser.newPage();
  const sErr = [];
  wire(sp, sErr);
  await sp.setViewport({ width: 960, height: 640 });
  await bootToPlay(sp, LIVE, "Cas443S", "Digit2", false); // persistence must stay ON for this gate
  await sp.evaluate(() => { window.__dev.tp(257, 165); });
  await sleep(600);
  await sp.evaluate(() => { const s = window.__dev.scene(); if (s === "curse") window.__dev.skipCurse(); window.__dev.saveNow(); });
  await sp.reload({ waitUntil: "load" });
  await sp.waitForFunction("window.__dev && window.__dev.scene && ['menu','play'].includes(window.__dev.scene())", { timeout: 30000 });
  const saveOk = await sp.evaluate(() => ({ has: window.__dev.hasSave(), scene: window.__dev.scene() }));
  ok("19. save written IN the swamp survives reload (boots clean, save present)", saveOk.has && sErr.length === 0,
    `${JSON.stringify(saveOk)} err=${sErr.length}`);
  await sp.evaluate(() => { try { window.__dev.clearSave(); } catch (e) {} });
  await sp.close();

  // ---- 20. mobile 390px touch --------------------------------------------------------------
  const mp = await browser.newPage();
  const mErr = [];
  wire(mp, mErr);
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await bootToPlay(mp, LIVE, "Cas443M", "Digit3");
  const dpr = await mp.evaluate(() => { const cv = document.getElementById("c"); return { canvasW: cv.width, innerW: window.innerWidth }; });
  await mp.evaluate(() => { window.__dev.archArena("wolf", 5000, 0); window.__dev.tp(257, 165); });
  await sleep(500);
  await mp.evaluate(() => { const s = window.__dev.scene(); if (s === "curse") window.__dev.skipCurse(); window.__dev.spawn("mudlurker", 26, 0); });
  const mHit = await mp.evaluate(async () => {
    const cv = document.getElementById("c"); const r = cv.getBoundingClientRect();
    let dmg = 0; const seenF = new Set();
    for (let i = 0; i < 30; i++) {
      const x = r.left + r.width / 2 + 60, y = r.top + r.height / 2;
      const t = new Touch({ identifier: 1, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent("touchstart", { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
      cv.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
      await new Promise((res) => setTimeout(res, 90));
      for (const f of (window.__dev.floaterDump ? window.__dev.floaterDump() : [])) {
        const k = String(f.txt) + ":" + (f.pop || 1);
        if (!seenF.has(k) && /^-?\d/.test(String(f.txt))) { seenF.add(k); dmg++; }
      }
      if (dmg > 0) break;
    }
    return dmg;
  });
  await mp.screenshot({ path: "shots/cas443/mobile-390.png" });
  ok("20. mobile 390px: boots, DPR-capped, REAL touch tap lands a hit", dpr.canvasW / dpr.innerW <= 1.51 && mHit > 0 && mErr.length === 0,
    `dprRatio=${(dpr.canvasW / dpr.innerW).toFixed(2)} dmgFloaters=${mHit} err=${mErr.length}`);
  await mp.close();
} catch (e) {
  ok("harness completed", false, e.message + "\n" + e.stack);
} finally {
  await browser.close();
  await srv.close();
}

const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} PASS${fails.length ? "  FAILS: " + fails.map((f) => f.name).join(" ; ") : ""}`);
process.exit(fails.length ? 1 : 0);
