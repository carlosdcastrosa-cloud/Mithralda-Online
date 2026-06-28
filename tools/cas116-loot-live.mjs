// ---------------------------------------------------------------------------
// CAS-116 QA — LIVE probe for the loot/equip reward loop on the DEPLOYED build
// (inside the Higgsfield iframe). Drives the SAME __dev hooks the game runs
// (zoneLoot/tpZone/seed/spawnKill/pickup/gear/bag/equipBag/huntKillChampion/
// saveNow) to prove CAS-116 shipped (not a stale cache) and the whole loop
// works on the live URL:
//   - AC4 BALANCE: drop-tier window CLIMBS by zone; the power-gated Abismo
//     drops EXCLUSIVELY tier-4 (no more field [1,2] junk fallback), out-tiering
//     every open zone + everything buyable in the shop.
//   - AC1 DROP: killing abyss trash drops tier-4 gear on the ground.
//   - AC1 ELITE: clearing a Champion via the real cull→summon→kill path drops a
//     guaranteed gear whose rarity/tier rises with the zone (forest → abyss).
//   - AC2 PICKUP+EQUIP: looted gear enters the bag; equipping raises HUD totals.
//   - AC5 PERSIST: populated bag + equipped upgrade survive a real reload.
//   - 60fps + 0 JS errors live.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas116-loot-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas116-loot-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
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
async function enterAs(fr, name = "LootQA") {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  for (const f of page.frames()) { try { await f.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} }); } catch {} }
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  let fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play on live build", true);

  // dev hooks present on live (proves the CAS-116 build is what's served)
  const api = await fr.evaluate(() => ["zoneLoot", "tpZone", "seed", "spawnKill", "pickup", "gear", "bag", "equipBag", "huntState", "huntKillChampion", "saveNow"]
    .reduce((o, k) => (o[k] = typeof window.__dev[k] === "function", o), {}));
  check("loot __dev API present on live build", Object.values(api).every(Boolean), api);

  // ---- (1) AC4 BALANCE: drop-tier window climbs by zone; Abismo strictly best ----
  const wins = await fr.evaluate(() => ({
    forest: window.__dev.zoneLoot("forest"), caves: window.__dev.zoneLoot("caves"),
    arena: window.__dev.zoneLoot("arena"), abyss: window.__dev.zoneLoot("abyss"),
  }));
  const abyssTop = wins.abyss && wins.abyss.tier[0] === 4 && wins.abyss.tier[1] === 4;
  const climbs = wins.abyss.tier[0] > wins.forest.tier[1] && wins.abyss.tier[0] >= wins.caves.tier[1] && wins.abyss.tier[0] >= wins.arena.tier[1];
  check("AC4 abyss drops EXCLUSIVELY tier-4 & out-tiers every open zone", abyssTop && climbs,
    { forest: wins.forest.tier, caves: wins.caves.tier, arena: wins.arena.tier, abyss: wins.abyss.tier });

  // ---- (2) AC1 DROP: abyss trash drops tier-4 gear on the ground ----
  const abyssTrash = await fr.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(4242);
    const tiers = [], rar = {}; let gear = 0;
    for (let i = 0; i < 80; i++) { for (const d of window.__dev.spawnKill("wraith")) if (d.kind === "gear") { gear++; tiers.push(d.tier); rar[d.rarity] = (rar[d.rarity] || 0) + 1; } window.__dev.pickup(); }
    return { gear, tiers: [...new Set(tiers)], rar };
  });
  check("AC1 abyss kills drop gear, every drop tier-4", abyssTrash.gear > 0 && abyssTrash.tiers.every((t) => t === 4), abyssTrash);

  // forest contrast — must stay low-tier (<=2) to prove the climb is real
  const forestTiers = await fr.evaluate(() => {
    window.__dev.tpZone("forest"); window.__dev.seed(4242);
    const tiers = [];
    for (let i = 0; i < 80; i++) { for (const d of window.__dev.spawnKill("wolf")) if (d.kind === "gear") tiers.push(d.tier); window.__dev.pickup(); }
    return [...new Set(tiers)];
  });
  check("AC4 forest trash stays low-tier (≤2) → abyss loot is a real upgrade", forestTiers.length > 0 && forestTiers.every((t) => t <= 2), { forestTiers });

  // ---- (3) AC1 ELITE ESCALATION: clear a Champion via the real path ----
  const clearChampion = (zone, base, need) => fr.evaluate((zone, base, need) => {
    window.__dev.tpZone(zone); window.__dev.seed(1234);
    for (let i = 0; i < need + 2; i++) window.__dev.spawnKill(base);
    const st = window.__dev.huntState(zone);
    if (!st || !st.champ) return { zone, summoned: false };
    const res = window.__dev.huntKillChampion(zone);
    return { zone, summoned: true, cleared: res.cleared, gear: res.drops.find((d) => d.kind === "gear") || null };
  }, zone, base, need);
  const fChamp = await clearChampion("forest", "wolf", 10);
  const aChamp = await clearChampion("abyss", "wraith", 16);
  const elitesOk = fChamp.summoned && aChamp.summoned && fChamp.gear && aChamp.gear &&
    RANK[aChamp.gear.rarity] >= RANK[fChamp.gear.rarity] && aChamp.gear.tier >= fChamp.gear.tier &&
    RANK[aChamp.gear.rarity] >= RANK.epic && aChamp.gear.tier === 4;
  check("AC1 champions drop guaranteed gear; abyss (epic/t4) out-classes forest", elitesOk, { forest: fChamp.gear, abyss: aChamp.gear });

  // ---- (4) AC2 PICKUP + EQUIP raises HUD combat totals ----
  const eq = await fr.evaluate(() => {
    window.__dev.tpZone("abyss"); window.__dev.seed(909);
    for (let i = 0; i < 60; i++) { window.__dev.spawnKill("wraith"); window.__dev.pickup(); }
    const before = window.__dev.gear(); const bag = window.__dev.bag();
    const pickBest = (slot) => { let bi = -1, bv = -1; bag.forEach((b, i) => { if (b.slot === slot && b.stat > bv) { bv = b.stat; bi = i; } }); return bi; };
    for (const slot of ["weapon", "body", "shield"]) { const i = pickBest(slot); if (i >= 0) window.__dev.equipBag(i); }
    return { before, after: window.__dev.gear(), bag: window.__dev.bag().length };
  });
  check("AC2 pickup+equip raised HUD combat totals", (eq.after.dmg + eq.after.def) > (eq.before.dmg + eq.before.def),
    { dmg: `${eq.before.dmg}→${eq.after.dmg}`, def: `${eq.before.def}→${eq.after.def}` });

  // ---- (5) AC5 PERSISTENCE: bag + equipped upgrade survive a reload ----
  const pre = await fr.evaluate(() => { const g = window.__dev.gear(); window.__dev.saveNow(); return { dmg: g.dmg, def: g.def, weapon: g.weapon, bagLen: window.__dev.bag().length }; });
  await page.reload({ waitUntil: "networkidle2", timeout: 45000 });
  fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='play'", { timeout: 20000 });
  const post = await fr.evaluate(() => { const g = window.__dev.gear(); return { dmg: g.dmg, def: g.def, weapon: g.weapon, bagLen: window.__dev.bag().length }; });
  const persisted = post.dmg === pre.dmg && post.def === pre.def && post.weapon === pre.weapon && post.bagLen === pre.bagLen && post.bagLen > 0;
  check("AC5 equipped gear + bag survived reload (localStorage round-trip)", persisted, { pre, post });

  // ---- 60fps live ----
  const fps = await fr.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  check("60fps live (≥55)", fps >= 55, { fps });

  // inventory screenshot (equip doll + rarity-coloured bag)
  try { await fr.evaluate(() => window.__dev.openInv && window.__dev.openInv()); await sleep(250); writeFileSync(SHOT, await page.screenshot()); check("inventory screenshot captured", true, SHOT); }
  catch (e) { check("inventory screenshot captured", false, e.message); }

  check("zero JS errors on live", report.errors.length === 0, report.errors);
} catch (e) {
  check("harness completed", false, e.stack || e.message);
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.ok);
console.log("\n" + JSON.stringify({ pass: report.pass, total: report.checks.length, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), errors: report.errors }, null, 2));
console.log(report.pass ? "\n✓ CAS-116 LIVE loot loop PASS" : "\n✗ CAS-116 LIVE loot loop FAIL");
process.exit(report.pass ? 0 : 1);
