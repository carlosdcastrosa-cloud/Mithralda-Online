// ---------------------------------------------------------------------------
// CAS-1632 — ÍTEMS ÚNICOS/LEGENDARIOS (loot que define builds). Legendary rarity
// tail + 6 named uniques, dropped APPEND-ONLY over the existing loot seams.
// Data-driven, RNG-neutral, $0 art. Proves, through the REAL sim hooks (__dev):
//   [DATA]     RARITY tail 'legendary' (weight:0 → never in the ordinary roll),
//              the 6 uniques + their mod-hooks, and the append-only drop config.
//   [AC1-MODS] each of the 6 uniques moves a REAL in-run number when EQUIPPED and
//              is a no-op when NOT equipped (cdr / essence / burn / chain-nova /
//              hpMul / atkspd) — read live off the equipped instance.
//   [AC3-DROP] forceLegendary lands a unique through the REAL killEnemy loot path,
//              carrying rarity 'legendary' + its `uniq` id.
//   [AC-PERS]  a unique survives serialize→load (uniq preserved, mod stays live).
//   [AC-RNG0]  setLegRate(0) ⇒ drop stream byte-identical across a fixed seed AND
//              zero uniques drop (append-only gate draws no srand); rate>0 drops them.
//   [PERF]     60fps sustained, zero page errors.
//
// Run: node tools/cas1632-uniques.mjs   (local build; QA re-points at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1632-uniques.png");
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
    document.getElementById("nameInput").value = "UniqBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  // Digit3 = mage (has a nova/chain-friendly kit); any class works — the uniques are class-agnostic.
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

  // (0) PERF — sampled on a CLEAN state (before the roll/dropStream probes flood the ground with
  // thousands of drops, a harness artifact) under a realistic fight pack, so it reflects real play.
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); });
  await wait(300);
  const fps = await sampleFps(page, 1200);

  // (1) DATA — legendary rarity tail + 6 uniques + append-only config, straight off the data.
  const lm = await page.evaluate(() => window.__dev.legendaryMeta());
  if (lm.def && lm.def.rate > 0 && lm.def.eliteMul > 1 && lm.def.champMul > lm.def.eliteMul && lm.def.bossMul >= lm.def.champMul)
    pass(`[DATA] append-only drop config: rate=${lm.def.rate} eliteMul=${lm.def.eliteMul} champMul=${lm.def.champMul} bossMul=${lm.def.bossMul}`);
  else fail(`[DATA] LEGENDARY config off: ${JSON.stringify(lm.def)}`);
  const ids = (lm.uniques || []).map((u) => u.id);
  const want = ["reloj_vacio", "corona_ecos", "colmillo_pavido", "prisma_fracturado", "corazon_titan", "guante_berserker"];
  if (lm.uniques && lm.uniques.length === 6 && want.every((w) => ids.includes(w)))
    pass(`[DATA] 6 named uniques present: ${ids.join(", ")}`);
  else fail(`[DATA] uniques table off: ${JSON.stringify(ids)}`);
  const slots = (lm.uniques || []).reduce((a, u) => (a[u.slot] = (a[u.slot] || 0) + 1, a), {});
  if (slots.weapon === 3 && slots.body === 2 && slots.shield === 1)
    pass(`[DATA] slot spread 3 weapon / 2 body / 1 shield: ${JSON.stringify(slots)}`);
  else fail(`[DATA] slot spread off: ${JSON.stringify(slots)}`);

  // (2) AC1-MODS — baseline (no uniques) then each unique EQUIPPED moves a real number.
  const base = await page.evaluate(() => window.__dev.uniqSnap());
  if (base && base.totals.abilCdr === 0 && base.totals.essencePct === 0 && base.totals.hpMul === 1 && base.totals.atkspd === 0)
    pass(`[AC1] baseline (no unique) is a clean no-op: ${JSON.stringify(base.totals)}`);
  else fail(`[AC1] baseline totals not zero: ${JSON.stringify(base && base.totals)}`);

  const snap = async (id) => page.evaluate((i) => window.__dev.equipUnique(i), id);

  // 1. reloj_vacio — −15% cooldown (cdrFactor drops from 1.0 → 0.85).
  let s = await snap("reloj_vacio");
  if (s && s.cdrFactor < base.cdrFactor && Math.abs(s.cdrFactor - 0.85) < 0.001)
    pass(`[AC1] reloj_vacio: cooldown factor ${base.cdrFactor} → ${s.cdrFactor} (−15% ability/spell cd)`);
  else fail(`[AC1] reloj_vacio cdr not applied: ${JSON.stringify(s && s.cdrFactor)}`);

  // 2. corona_ecos — +25% Esencia (essenceForRun raw ×1.25 before ascMult).
  s = await snap("corona_ecos");
  if (s && s.essence > base.essence && s.essence >= Math.floor(base.essence * 1.24))
    pass(`[AC1] corona_ecos: run Esencia ${base.essence} → ${s.essence} (+25% pre-Ascensión)`);
  else fail(`[AC1] corona_ecos essence not applied: base=${base.essence} got=${s && s.essence}`);

  // 3. colmillo_pavido — basic attack applies burn (weaponProcs emits the unique proc).
  s = await snap("colmillo_pavido");
  const hasBurn = s && (s.procs || []).some((p) => p.proc === "burn");
  if (hasBurn) pass(`[AC1] colmillo_pavido: basic attack ignites (procs=${JSON.stringify(s.procs)})`);
  else fail(`[AC1] colmillo_pavido burn proc missing: ${JSON.stringify(s && s.procs)}`);

  // 4. prisma_fracturado — Cadena +2 saltos / Nova radio ×2 (uniqEmpower copy-on-write).
  s = await snap("prisma_fracturado");
  if (s && s.empChain === base.empChain + 2 && Math.abs(s.empNova - base.empNova * 2) < 0.001 && !s.empChainSameRef && !s.empNovaSameRef)
    pass(`[AC1] prisma_fracturado: chain jumps ${base.empChain}→${s.empChain} (+2), nova range ${base.empNova}→${s.empNova} (×2), copy-on-write`);
  else fail(`[AC1] prisma_fracturado empower off: chain=${s && s.empChain} nova=${s && s.empNova} sameRef=${s && [s.empChainSameRef, s.empNovaSameRef]}`);
  // and it is a no-op ref when NOT equipped (baseline captured SAME ref)
  if (base.empChainSameRef && base.empNovaSameRef)
    pass(`[AC1] prisma_fracturado is 0-delta when unequipped (empower returns SAME object)`);
  else fail(`[AC1] baseline empower not identity: ${JSON.stringify([base.empChainSameRef, base.empNovaSameRef])}`);

  // 5. corazon_titan — +20% vida máx (heroMaxHp derived ×1.20).
  s = await snap("corazon_titan");
  if (s && s.maxHp > base.maxHp && s.maxHp >= Math.round(base.maxHp * 1.19))
    pass(`[AC1] corazon_titan: max HP ${base.maxHp} → ${s.maxHp} (+20% derived)`);
  else fail(`[AC1] corazon_titan hpMul not applied: base=${base.maxHp} got=${s && s.maxHp}`);

  // 6. guante_berserker — +12% vel. ataque (heroAtkspd summed under the cap).
  s = await snap("guante_berserker");
  if (s && s.atkspd === base.atkspd + 12 && s.totals.atkspd === 12)
    pass(`[AC1] guante_berserker: atkspd ${base.atkspd} → ${s.atkspd} (+12% under cap)`);
  else fail(`[AC1] guante_berserker atkspd not applied: base=${base.atkspd} got=${s && s.atkspd}`);

  // (3) AC3-DROP — force each unique through the REAL killEnemy loot path; it lands + carries `uniq`.
  let dropped = 0;
  for (const id of want) {
    const r = await page.evaluate((i) => window.__dev.forceLegendary(i), id);
    if (r && r.leg && r.leg.uniq === id && r.leg.rarity === "legendary") dropped++;
    else fail(`[AC3] forceLegendary(${id}) did not drop the unique: ${JSON.stringify(r && r.leg)}`);
  }
  if (dropped === 6) pass(`[AC3] all 6 uniques drop through the REAL killEnemy path (rarity 'legendary' + uniq id)`);

  // (4) AC-PERS — a unique survives serialize→load with its `uniq` field + live mod.
  const per = await page.evaluate(() => window.__dev.uniqPersist("corazon_titan"));
  if (per && per.ok && per.survived && per.after && per.after.uniq === "corazon_titan" && per.after.rarity === "legendary")
    pass(`[AC-PERS] unique survives save→load: ${JSON.stringify(per.after)}; maxHp reproduced=${per.maxHp} (was ${per.before.maxHp})`);
  else fail(`[AC-PERS] unique lost across save→load: ${JSON.stringify(per)}`);

  // (5) AC-RNG0 — setLegRate(0): drop stream byte-identical across a fixed seed + ZERO uniques.
  await page.evaluate(() => window.__dev.setLegRate(0));
  const s1 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
  const s2 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
  const legs0 = s1.filter((d) => d.uniq).length;
  if (JSON.stringify(s1) === JSON.stringify(s2) && legs0 === 0)
    pass(`[AC-RNG0] legRate=0 ⇒ drop stream byte-identical (${s1.length} drops, fixed seed) + 0 uniques (append-only gate draws no srand)`);
  else fail(`[AC-RNG0] legRate=0 not neutral: identical=${JSON.stringify(s1) === JSON.stringify(s2)} legs=${legs0}`);
  const rr0 = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setLegRate(0); return window.__dev.legendaryRollRate(3000); });
  if (rr0.legs === 0) pass(`[AC-RNG0] legendaryRollRate at rate=0 ⇒ 0/${rr0.n} uniques`);
  else fail(`[AC-RNG0] uniques dropped at rate=0: ${rr0.legs}`);
  // rate>0 DOES drop uniques (feature ON) — bump the rate so the sample is decisive.
  const rrOn = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setLegRate(0.5); return window.__dev.legendaryRollRate(2000); });
  await page.evaluate(() => window.__dev.setLegRate(null)); // restore shipped rate
  if (rrOn.legs > 0) pass(`[AC-RNG0] rate>0 drops uniques: ${rrOn.legs}/${rrOn.n} (rate ${rrOn.rate}); spread ${JSON.stringify(rrOn.tally)}`);
  else fail(`[AC-RNG0] feature never drops when ON: ${JSON.stringify(rrOn)}`);

  // (6) PERF — report the clean-state sample taken in (0).
  if (fps >= 55) pass(`[PERF] ${fps} fps sustained`);
  else fail(`[PERF] fps below target: ${fps}`);
  await page.screenshot({ path: SHOT });

  if (errors.length) fail(`page errors: ${errors.slice(0, 4).join(" | ")}`);
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✅ CAS-1632 uniques: ALL PASS" : "\n❌ CAS-1632 uniques: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
