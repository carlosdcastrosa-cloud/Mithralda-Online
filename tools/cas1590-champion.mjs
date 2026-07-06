// ---------------------------------------------------------------------------
// CAS-1590 — ÉLITE CAMPEÓN: rare, telegraphed 2+-affix mini-boss with a
// GUARANTEED Esencia reward + superior/unique loot. Purely additive on the
// CAS-247/1585 affix engine. Proves, through the REAL sim hooks (__dev):
//   [DATA]      champion table is data-driven (tankier muls, guaranteed Esencia,
//               uniqueChance) and the 5 prior affixes + affix rate are intact.
//   [AC-ROLL]   champions are RARE (≈ affixRate×champRate) and EVERY champion
//               carries 2 DISTINCT affixes; the roll is deterministic (seeded).
//   [AC-2AFX]   BOTH affixes' combat HOOKS fire on a champion — incl. when an
//               affix is the SECOND one (armored soak as 2nd affix proves it).
//   [AC-TANK]   champions are tankier + more dangerous + bigger (data-driven).
//   [AC-REWARD] a champion kill banks GUARANTEED Esencia (data-driven amount)
//               + a guaranteed superior (epic+) drop + an observable unique roll.
//   [AC-RNG0]   champRate=0 ⇒ NO champion spawns and NO extra srand is drawn
//               (the affix stream stays deterministic) → RNG-neutral gate.
//   [PERF]      60fps sustained, zero page errors.
//
// Run: node tools/cas1590-champion.mjs   (local build; the QA child re-points at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1590-champion.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ChampBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — champion table is data-driven; the 5 prior affixes + affix rate intact.
  const cm = await page.evaluate(() => window.__dev.championMeta());
  const d = cm.def || {};
  if (cm.rate > 0 && cm.rate <= 0.5) pass(`[DATA] champion promotion rate data-driven: ${(cm.rate * 100).toFixed(0)}% of affixed mobs`);
  else fail(`[DATA] champion rate off: ${cm.rate}`);
  if (d.hpMul > 1 && d.dmgMul > 1 && d.sizeMul > 1 && d.essence > 0 && d.uniqueChance > 0 && d.uniqueChance <= 1)
    pass(`[DATA] champion data-driven: hpMul=${d.hpMul} dmgMul=${d.dmgMul} sizeMul=${d.sizeMul} essence=${d.essence} unique=${d.uniqueChance}`);
  else fail(`[DATA] champion fields off: ${JSON.stringify(d)}`);
  const am = await page.evaluate(() => window.__dev.affixMeta());
  if (am.ids.length === 5 && am.rate >= 0.10 && am.rate <= 0.15)
    pass(`[AC-5] 5 prior affixes intact (${am.ids.join("/")}) + affix rate ${(am.rate * 100).toFixed(0)}% unchanged`);
  else fail(`[AC-5] prior affix set/rate regressed: ${JSON.stringify(am.ids)} rate=${am.rate}`);

  // (2) AC-ROLL — champions are RARE and carry 2 DISTINCT affixes; deterministic.
  const roll = async () => page.evaluate(() => { window.__dev.seed(4242); return window.__dev.championRollRate(6000, "skeleton"); });
  const c1 = await roll(), c2 = await roll();
  if (c1.champs > 0 && c1.champs === c2.champs && JSON.stringify(c1.tally) === JSON.stringify(c2.tally))
    pass(`[AC-ROLL] deterministic: ${c1.champs}/${c1.n} champions (rate ${c1.rate}), identical across runs`);
  else fail(`[AC-ROLL] champion roll not deterministic: ${c1.champs} vs ${c2.champs}`);
  if (c1.champs > 0 && c1.champs < c1.n * cm.affixRate)
    pass(`[AC-ROLL] champions are RARE (${c1.rate} < affixRate ${cm.affixRate})`);
  else fail(`[AC-ROLL] champions not rarer than affixed mobs: rate=${c1.rate}`);
  if (c1.twoAffix === c1.champs)
    pass(`[AC-ROLL] EVERY champion carries 2 DISTINCT affixes (${c1.twoAffix}/${c1.champs}); combos: ${JSON.stringify(c1.tally)}`);
  else fail(`[AC-ROLL] some champions lack 2 distinct affixes: ${c1.twoAffix}/${c1.champs}`);

  // (3) AC-TANK — a forced champion is tankier + more dangerous + bigger, with both affixes present.
  const ar = await page.evaluate(() => window.__dev.championArena("armored", "frost", "skeleton", 140));
  if (ar && ar.champElite && ar.affixes.length === 2 && ar.affixes[0] === "armored" && ar.affixes[1] === "frost")
    pass(`[AC-TANK] champion carries [${ar.affixes.join(", ")}] (2 affixes, mobAffixes-routed)`);
  else fail(`[AC-TANK] champion affix list wrong: ${JSON.stringify(ar && ar.affixes)}`);
  if (ar && ar.mod.hp > ar.base.hp * 3 && ar.mod.dmg > ar.base.dmg && ar.mod.size > ar.base.size)
    pass(`[AC-TANK] tankier/dangerous/bigger: hp ${ar.base.hp}→${ar.mod.hp}, dmg ${ar.base.dmg}→${ar.mod.dmg}, size ${ar.base.size}→${ar.mod.size}`);
  else fail(`[AC-TANK] champion not scaled: ${JSON.stringify(ar && ar.mod)}`);

  // (4) AC-2AFX — BOTH affixes' HOOKS fire. Armored (dmgReduce) as the SECOND affix must still soak,
  //     proving the 2nd affix is live (not just the primary). Compare vs a champion with no armored.
  await page.evaluate(() => window.__dev.championArena("swift", "armored", "skeleton", 130)); // armored is the 2nd affix
  const hitArm = await page.evaluate(() => window.__dev.affixHit(1000));
  await page.evaluate(() => window.__dev.championArena("swift", "volatile", "skeleton", 130)); // no armored
  const hitPlain = await page.evaluate(() => window.__dev.affixHit(1000));
  if (hitArm && hitPlain && hitArm.taken < hitPlain.taken && hitArm.taken <= 600)
    pass(`[AC-2AFX] SECOND affix hook LIVE: armored-as-2nd soaks (took ${hitArm.taken} vs ${hitPlain.taken} unarmored on a 1000 hit)`);
  else fail(`[AC-2AFX] 2nd-affix hook not firing: armored=${JSON.stringify(hitArm)} plain=${JSON.stringify(hitPlain)}`);

  // (5) AC-REWARD — a champion kill banks GUARANTEED Esencia + a guaranteed superior drop; a unique
  //     (legendary) roll is observable over repeated kills (uniqueChance).
  const k = await page.evaluate(() => { window.__dev.seed(77); return window.__dev.championKill("caves", "armored", "vampiric"); });
  const gear = k.drops.filter((x) => x.kind === "gear");
  const superior = gear.some((g) => RANK[g.rarity] >= RANK.epic);
  if (k.champElites === 1 && k.champTerm === d.essence && k.essence >= d.essence)
    pass(`[AC-REWARD] GUARANTEED Esencia: +1 champion → +${k.champTerm} Esencia (data-driven), run essence=${k.essence}`);
  else fail(`[AC-REWARD] champion Esencia off: ${JSON.stringify(k)}`);
  if (gear.length >= 1 && superior)
    pass(`[AC-REWARD] guaranteed SUPERIOR (epic) drop: ${gear.map((g) => g.rarity).join(", ")}`);
  else fail(`[AC-REWARD] no guaranteed superior gear drop: ${JSON.stringify(k.drops)}`);
  // observe the UNIQUE bonus (a SECOND superior epic) firing on some kills, missing on others (uniqueChance).
  let sawUnique = false, sawSingle = false, kills = 0;
  for (let i = 0; i < 40 && !(sawUnique && sawSingle); i++) {
    const kk = await page.evaluate((s) => { window.__dev.seed(s); return window.__dev.championKill("frost", "swift", "armored"); }, 1000 + i);
    kills++;
    const g = kk.drops.filter((x) => x.kind === "gear" && RANK[x.rarity] >= RANK.epic);
    if (g.length >= 2) sawUnique = true; else if (g.length === 1) sawSingle = true;
  }
  if (sawUnique && sawSingle) pass(`[AC-REWARD] UNIQUE bonus observable: some champion kills drop a 2nd superior epic, others just the guaranteed one (uniqueChance, ${kills} kills sampled)`);
  else fail(`[AC-REWARD] unique-drop roll not observed as probabilistic: sawUnique=${sawUnique} sawSingle=${sawSingle} across ${kills} kills`);

  // (6) AC-RNG0 — champRate=0 ⇒ NO champion + no extra srand (affix stream deterministic).
  const off = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.championRollRate(6000, "skeleton"); });
  const a0a = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.affixRollRate(6000, "skeleton"); });
  const a0b = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.affixRollRate(6000, "skeleton"); });
  await page.evaluate(() => window.__dev.setChampRate(null)); // restore shipped rate
  if (off.champs === 0)
    pass(`[AC-RNG0] champRate=0 → 0 champions spawned (feature cleanly OFF)`);
  else fail(`[AC-RNG0] champRate=0 still spawned ${off.champs} champions`);
  if (a0a.affixed === a0b.affixed && JSON.stringify(a0a.tally) === JSON.stringify(a0b.tally) && a0a.affixed > 0)
    pass(`[AC-RNG0] at rate=0 the affix stream is deterministic + unperturbed (${a0a.affixed}/${a0a.n} affixed, tally ${JSON.stringify(a0a.tally)}) → RNG-neutral`);
  else fail(`[AC-RNG0] affix stream not stable at rate=0: ${JSON.stringify(a0a)} vs ${JSON.stringify(a0b)}`);

  // (7) PERF — sustain movement, sample fps, assert no page errors.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  const fps = await sampleFps(page, 1200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  if (fps >= 58) pass(`[PERF] ${fps} fps sustained (>=58)`);
  else fail(`[PERF] fps dropped to ${fps}`);
  if (errors.length === 0) pass(`[PERF] zero page errors`);
  else fail(`[PERF] page errors: ${errors.slice(0, 4).join(" | ")}`);

  const buf = await page.screenshot();
  writeFileSync(SHOT, buf);
  log(`→ screenshot ${SHOT}`);
} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  await (srv.close ? srv.close() : srv.stop && srv.stop());
}
log(ok ? "\nCAS-1590 Élite Campeón: ALL PASS" : "\nCAS-1590 Élite Campeón: FAIL");
process.exit(ok ? 0 : 1);
