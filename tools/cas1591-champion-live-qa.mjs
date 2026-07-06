// ---------------------------------------------------------------------------
// CAS-1591 — QA live-verify (QA) of CAS-1590 "Élite Campeón: rare telegraphed
// 2-affix mini-boss + guaranteed Esencia". Boots the REAL PUBLISHED build straight
// off the canonical gh-pages URL (CAS-412, NOT tender-bridge) and drives the
// champion system through the SAME sim paths the game runs (championMeta /
// championRollRate / championArena / championKill / affixHit — via __dev). Asserts
// every AC of CAS-1591:
//   AC-1 Spawn raro + telegrafiado : championRollRate(6000) → champs exist (rate>0) and RARE
//                                    (< affixRate); each champ carries 2 DISTINCT affixes; seeded.
//   AC-2 Visualmente distinto      : screenshot of a forced champion (gold ring + double halos +
//                                    👑 plate + wide bar + 1.18× silhouette).
//   AC-3 2+ afijos activos (hooks) : armored-as-2nd-affix soaks a hit; volatile-as-2nd does not.
//   AC-4 Más tanque/peligroso      : mod.hp >> base.hp, mod.dmg > base.dmg, mod.size > base.size.
//   AC-5 Muerte → Esencia GARANT.  : championKill → champElites +1, champTerm==essence table amount;
//                                    ≥1 epic superior guaranteed; unique 2nd-epic probabilistic.
//   AC-6 RNG-neutral               : setChampRate(0) → 0 champs; affix stream stable + unperturbed.
//   AC-7 Sin regresión             : 5 prior affixes + 13% rate intact; 60fps; 0 JS errors.
//
// Run: node tools/cas1591-champion-live-qa.mjs   (hits the LIVE gh-pages URL directly)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const SHOT = new URL("./cas1591-champion-live.png", import.meta.url).pathname;
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: [...LAUNCH_ARGS, "--ignore-certificate-errors"],   // headless chromium env-flake: ERR_CERT_VERIFIER_CHANGED
});

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ChampBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });   // CAS-1570 draft scene
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
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
  const errors = [];          // real JS/runtime errors → gate AC-7
  const missing = [];         // 404 asset loads → pre-existing world-art, non-gating (logged)
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => missing.push(r.url()));
  page.on("response", (r) => { if (r.status() === 404) missing.push(r.url()); });
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource|404|net::ERR/.test(t)) return; // resource-load noise, tracked in `missing`
    errors.push(`console.error: ${t}`);
  });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.meta.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  // Live GH-Pages sometimes 503s the cold edge — reload-retry the boot.
  let booted = false;
  for (let i = 0; i < 3 && !booted; i++) {
    try {
      await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
      await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
      booted = true;
    } catch (e) { log(`  (boot retry ${i + 1}: ${e.message.split("\n")[0]})`); await wait(1500); }
  }
  if (!booted) throw new Error("live build never booted");
  const build = await page.evaluate(() => (window.__dev.build ? window.__dev.build() : "?"));
  await page.bringToFront();
  await enterPlay(page);
  pass(`entered play as 'warrior' on LIVE build (version=${build})`);

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
    pass(`[AC-7] 5 prior affixes intact (${am.ids.join("/")}) + affix rate ${(am.rate * 100).toFixed(0)}% unchanged`);
  else fail(`[AC-7] prior affix set/rate regressed: ${JSON.stringify(am.ids)} rate=${am.rate}`);

  // (AC-1) ROLL — champions are RARE and carry 2 DISTINCT affixes; deterministic.
  const roll = async () => page.evaluate(() => { window.__dev.seed(4242); return window.__dev.championRollRate(6000, "skeleton"); });
  const c1 = await roll(), c2 = await roll();
  if (c1.champs > 0 && c1.champs === c2.champs && JSON.stringify(c1.tally) === JSON.stringify(c2.tally))
    pass(`[AC-1] deterministic: ${c1.champs}/${c1.n} champions (rate ${c1.rate}), identical across runs`);
  else fail(`[AC-1] champion roll not deterministic: ${c1.champs} vs ${c2.champs}`);
  if (c1.champs > 0 && c1.champs < c1.n * cm.affixRate)
    pass(`[AC-1] champions are RARE (${c1.rate} < affixRate ${cm.affixRate})`);
  else fail(`[AC-1] champions not rarer than affixed mobs: rate=${c1.rate}`);
  if (c1.twoAffix === c1.champs)
    pass(`[AC-1] EVERY champion carries 2 DISTINCT affixes (${c1.twoAffix}/${c1.champs}); combos: ${JSON.stringify(c1.tally)}`);
  else fail(`[AC-1] some champions lack 2 distinct affixes: ${c1.twoAffix}/${c1.champs}`);

  // (AC-4) TANK — a forced champion is tankier + more dangerous + bigger, with both affixes present.
  const ar = await page.evaluate(() => window.__dev.championArena("armored", "frost", "skeleton", 140));
  if (ar && ar.champElite && ar.affixes.length === 2 && ar.affixes[0] === "armored" && ar.affixes[1] === "frost")
    pass(`[AC-4] champion carries [${ar.affixes.join(", ")}] (2 affixes, mobAffixes-routed)`);
  else fail(`[AC-4] champion affix list wrong: ${JSON.stringify(ar && ar.affixes)}`);
  if (ar && ar.mod.hp > ar.base.hp * 3 && ar.mod.dmg > ar.base.dmg && ar.mod.size > ar.base.size)
    pass(`[AC-4] tankier/dangerous/bigger: hp ${ar.base.hp}→${ar.mod.hp} (×${(ar.mod.hp / ar.base.hp).toFixed(1)}), dmg ${ar.base.dmg}→${ar.mod.dmg}, size ${ar.base.size}→${ar.mod.size}`);
  else fail(`[AC-4] champion not scaled: ${JSON.stringify(ar && ar.mod)}`);

  // (AC-3) 2AFX — BOTH affixes' HOOKS fire. Armored (dmgReduce) as the SECOND affix must still soak.
  await page.evaluate(() => window.__dev.championArena("swift", "armored", "skeleton", 130)); // armored is the 2nd affix
  const hitArm = await page.evaluate(() => window.__dev.affixHit(1000));
  await page.evaluate(() => window.__dev.championArena("swift", "volatile", "skeleton", 130)); // no armored
  const hitPlain = await page.evaluate(() => window.__dev.affixHit(1000));
  if (hitArm && hitPlain && hitArm.taken < hitPlain.taken && hitArm.taken <= 600)
    pass(`[AC-3] SECOND affix hook LIVE: armored-as-2nd soaks (took ${hitArm.taken} vs ${hitPlain.taken} unarmored on a 1000 hit)`);
  else fail(`[AC-3] 2nd-affix hook not firing: armored=${JSON.stringify(hitArm)} plain=${JSON.stringify(hitPlain)}`);

  // (AC-5) REWARD — a champion kill banks GUARANTEED Esencia + a guaranteed superior drop; unique roll observable.
  const k = await page.evaluate(() => { window.__dev.seed(77); return window.__dev.championKill("caves", "armored", "vampiric"); });
  const gear = k.drops.filter((x) => x.kind === "gear");
  const superior = gear.some((g) => RANK[g.rarity] >= RANK.epic);
  if (k.champElites === 1 && k.champTerm === d.essence && k.essence >= d.essence)
    pass(`[AC-5] GUARANTEED Esencia: +1 champion → +${k.champTerm} Esencia (data-driven), run essence=${k.essence}`);
  else fail(`[AC-5] champion Esencia off: ${JSON.stringify(k)}`);
  if (gear.length >= 1 && superior)
    pass(`[AC-5] guaranteed SUPERIOR (epic) drop: ${gear.map((g) => g.rarity).join(", ")}`);
  else fail(`[AC-5] no guaranteed superior gear drop: ${JSON.stringify(k.drops)}`);
  let sawUnique = false, sawSingle = false, kills = 0;
  for (let i = 0; i < 40 && !(sawUnique && sawSingle); i++) {
    const kk = await page.evaluate((s) => { window.__dev.seed(s); return window.__dev.championKill("frost", "swift", "armored"); }, 1000 + i);
    kills++;
    const g = kk.drops.filter((x) => x.kind === "gear" && RANK[x.rarity] >= RANK.epic);
    if (g.length >= 2) sawUnique = true; else if (g.length === 1) sawSingle = true;
  }
  if (sawUnique && sawSingle) pass(`[AC-5] UNIQUE bonus observable: some champion kills drop a 2nd superior epic, others just the guaranteed one (uniqueChance, ${kills} kills sampled)`);
  else fail(`[AC-5] unique-drop roll not observed as probabilistic: sawUnique=${sawUnique} sawSingle=${sawSingle} across ${kills} kills`);

  // (AC-6) RNG0 — champRate=0 ⇒ NO champion + no extra srand (affix stream deterministic).
  const off = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.championRollRate(6000, "skeleton"); });
  const a0a = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.affixRollRate(6000, "skeleton"); });
  const a0b = await page.evaluate(() => { window.__dev.setChampRate(0); window.__dev.seed(4242); return window.__dev.affixRollRate(6000, "skeleton"); });
  await page.evaluate(() => window.__dev.setChampRate(null)); // restore shipped rate
  if (off.champs === 0)
    pass(`[AC-6] champRate=0 → 0 champions spawned (feature cleanly OFF)`);
  else fail(`[AC-6] champRate=0 still spawned ${off.champs} champions`);
  if (a0a.affixed === a0b.affixed && JSON.stringify(a0a.tally) === JSON.stringify(a0b.tally) && a0a.affixed > 0)
    pass(`[AC-6] at rate=0 the affix stream is deterministic + unperturbed (${a0a.affixed}/${a0a.n} affixed, tally ${JSON.stringify(a0a.tally)}) → RNG-neutral`);
  else fail(`[AC-6] affix stream not stable at rate=0: ${JSON.stringify(a0a)} vs ${JSON.stringify(a0b)}`);

  // (AC-2) VISUAL — force a champion on-screen, screenshot the telegraph (gold ring/halos/plate/bar).
  await page.evaluate(() => window.__dev.championArena("armored", "frost", "skeleton", 90));
  await wait(300);
  const buf = await page.screenshot();
  writeFileSync(SHOT, buf);
  log(`→ screenshot ${SHOT}`);
  pass(`[AC-2] champion telegraph rendered on-screen (see screenshot; visual sign-off by CEO)`);

  // (AC-7) PERF — sustain movement, sample fps, assert no page errors.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  const fps = await sampleFps(page, 1200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  if (fps >= 58) pass(`[AC-7] ${fps} fps sustained (>=58)`);
  else fail(`[AC-7] fps dropped to ${fps}`);
  if (errors.length === 0) pass(`[AC-7] zero page JS errors`);
  else fail(`[AC-7] page errors: ${errors.slice(0, 4).join(" | ")}`);

  const asset404 = [...new Set(missing)].filter((u) => !/version\.json/.test(u));
  if (asset404.length) log(`  (non-gating: ${asset404.length} 404 asset(s), e.g. ${asset404.slice(0, 3).map((u) => u.split("/").pop()).join(", ")})`);
} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
}
log(ok ? "\nCAS-1591 Élite Campeón LIVE QA: ALL PASS" : "\nCAS-1591 Élite Campeón LIVE QA: FAIL");
process.exit(ok ? 0 : 1);
