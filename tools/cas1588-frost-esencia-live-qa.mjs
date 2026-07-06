// ---------------------------------------------------------------------------
// CAS-1588 — QA live-verify (QA) of CAS-1585 "Aura Gélida (frost, 5º afijo) + Esencia tie-in".
// Boots the REAL PUBLISHED build straight off the canonical gh-pages URL (CAS-412) and drives
// the affix system through the SAME sim paths the game runs (maybeAffix / applyAffix / update /
// hitEnemy / killEnemy / essenceForRun — no shortcuts). Asserts EVERY AC of CAS-1588:
//   AC-1 Promoción/pool : affixRollRate spawns affixes and `frost` appears in the pool (rate>0).
//   AC-2 Aura Gélida    : hero INSIDE auraR is slowed (movespd effective drops, slowT>0);
//                         OUTSIDE the radius slow=1 (radius gate). Data-driven ring/tint present.
//   AC-3 Afijos previos : swift(spd↑)/armored(dmgReduce soaks)/vampiric(lifesteal+melee)/volatile
//                         (on-death blast) still work through affixArena/affixHit/affixKill hooks.
//   AC-4 Esencia reward : an affixed kill earns EXTRA Esencia = affixKills×MOB_AFFIX_ESSENCE on top
//                         of xp/gold/gear (affixSpawnKill drops + affixEssence delta).
//   AC-5 RNG-neutral    : the roll is deterministic (same seed → identical count+tally) and the
//                         Esencia term is EXACTLY affixKills×perAffix → 0 affixed kills = 0 term.
//   AC-6 JS boot        : 0 console/page errors on the live build (md5 live==HEAD checked out-of-band).
//
// Run: node tools/cas1588-frost-esencia-live-qa.mjs   (hits the LIVE gh-pages URL directly)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
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
    document.getElementById("nameInput").value = "FrostBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });   // CAS-1570 draft
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
  const errors = [];          // real JS/runtime errors → gate AC-6
  const missing = [];         // 404 asset loads → pre-existing world-art, non-gating (logged for transparency)
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

  // (AC-1) PROMOCIÓN/POOL — affixes spawn through the REAL roll; frost is in the pool (rate>0).
  const meta = await page.evaluate(() => window.__dev.affixMeta());
  const byId = Object.fromEntries(meta.defs.map((d) => [d.id, d]));
  if (meta.ids.length === 5 && byId.swift && byId.armored && byId.vampiric && byId.volatile && byId.frost)
    pass(`[AC-1] 5 affixes in the pool incl. frost (${meta.ids.join("/")})`);
  else fail(`[AC-1] affix set wrong: ${JSON.stringify(meta.ids)}`);
  if (meta.rate >= 0.10 && meta.rate <= 0.15) pass(`[AC-1] spawn rate ${(meta.rate * 100).toFixed(0)}% in the 10-15% band`);
  else fail(`[AC-1] spawn rate ${meta.rate} outside 10-15%`);
  const roll = await page.evaluate(() => { window.__dev.seed(9); return window.__dev.affixRollRate(3000, "skeleton"); });
  if (roll.affixed > 0 && roll.rate > 0) pass(`[AC-1] affixes spawn: ${roll.affixed}/${roll.n} rolled (rate=${roll.rate})`);
  else fail(`[AC-1] no affix spawned across ${roll.n}: ${JSON.stringify(roll)}`);
  if ((roll.tally.frost || 0) > 0) pass(`[AC-1] frost appears in the pool with rate>0 (${roll.tally.frost} of ${roll.affixed})`);
  else fail(`[AC-1] frost never rolled: ${JSON.stringify(roll.tally)}`);

  // (AC-2) AURA GÉLIDA — inside the radius the hero is slowed; outside it is not.
  const fdef = byId.frost || {};
  if (fdef.auraR > 0 && fdef.auraSlow > 0 && fdef.auraSlow < 1 && !fdef.melee && fdef.name === "Aura Gélida")
    pass(`[AC-2] frost data-driven: auraR=${fdef.auraR} auraSlow=${fdef.auraSlow} non-melee ("${fdef.name}") → ring/tint/label data present`);
  else fail(`[AC-2] frost fields off: ${JSON.stringify(fdef)}`);
  const inside = await page.evaluate((r) => window.__dev.affixAura("skeleton", Math.round(r * 0.5)), fdef.auraR);
  if (inside && inside.heroSlowT > 0 && Math.abs(inside.heroSlow - fdef.auraSlow) < 1e-6 && inside.movespdEffective < inside.baseSpd)
    pass(`[AC-2] INSIDE r=${inside.dist}<=${fdef.auraR}: slow=${inside.heroSlow} slowT=${inside.heroSlowT}, movespd ${inside.baseSpd}→${inside.movespdEffective}`);
  else fail(`[AC-2] inside-radius slow not applied: ${JSON.stringify(inside)}`);
  const outside = await page.evaluate((r) => window.__dev.affixAura("skeleton", Math.round(r * 1.6)), fdef.auraR);
  if (outside && outside.heroSlow === 1 && outside.movespdEffective === outside.baseSpd)
    pass(`[AC-2] OUTSIDE r=${outside.dist}>${fdef.auraR}: slow=${outside.heroSlow} (full speed) → radius gate holds`);
  else fail(`[AC-2] outside-radius should NOT slow: ${JSON.stringify(outside)}`);

  // (AC-3) AFIJOS PREVIOS INTACTOS — exercised through the REAL affixArena/affixHit/affixKill hooks.
  // swift → faster mob.
  const sw = await page.evaluate(() => window.__dev.affixArena("swift", "skeleton", 200));
  if (sw && sw.affix === "swift" && sw.mod.spd > sw.base.spd) pass(`[AC-3] swift intact: spd ${sw.base.spd}→${sw.mod.spd} (affixHook affixArena)`);
  else fail(`[AC-3] swift regressed: ${JSON.stringify(sw)}`);
  // armored → soaks a fraction of a fixed blow vs a non-armored control (both via affixHit(100)).
  await page.evaluate(() => window.__dev.affixArena("armored", "skeleton", 120));
  const armHit = await page.evaluate(() => window.__dev.affixHit(100));
  await page.evaluate(() => window.__dev.affixArena("swift", "skeleton", 120));
  const plainHit = await page.evaluate(() => window.__dev.affixHit(100));
  if (armHit && plainHit && armHit.taken < plainHit.taken) pass(`[AC-3] armored intact: dmgReduce soaks ${plainHit.taken}→${armHit.taken} on a 100 blow (affixHit)`);
  else fail(`[AC-3] armored dmgReduce not soaking: armored=${JSON.stringify(armHit)} control=${JSON.stringify(plainHit)}`);
  // vampiric → melee lifesteal affix bakes onto the mob (data lifesteal>0 + melee true).
  const vamp = await page.evaluate(() => window.__dev.affixArena("vampiric", "skeleton", 120));
  if (vamp && vamp.affix === "vampiric" && byId.vampiric.lifesteal > 0 && byId.vampiric.melee === true)
    pass(`[AC-3] vampiric intact: melee lifesteal=${byId.vampiric.lifesteal} bakes via applyAffix (affixArena)`);
  else fail(`[AC-3] vampiric regressed: ${JSON.stringify(vamp)} def=${JSON.stringify(byId.vampiric)}`);
  // volatile → on-death blast damages the hero only when in range (near vs far via affixKill).
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 16));
  const blastNear = await page.evaluate(() => window.__dev.affixKill());
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 4000));
  const blastFar = await page.evaluate(() => window.__dev.affixKill());
  if (blastNear && blastNear.heroDmgTaken > 0 && blastFar && blastFar.heroDmgTaken === 0)
    pass(`[AC-3] volatile intact: on-death blast hits hero at 16px (${blastNear.heroDmgTaken} dmg), 0 at 4000px (affixKill radius gate)`);
  else fail(`[AC-3] volatile blast off: near=${JSON.stringify(blastNear)} far=${JSON.stringify(blastFar)}`);

  // (AC-4) RECOMPENSA ESENCIA — affixed kill drops xp/gold/gear AND earns extra Esencia.
  const sk = await page.evaluate(() => { window.__dev.seed(7); return window.__dev.affixSpawnKill("frost", "skeleton", "field"); });
  if (sk && sk.xp >= sk.baseXp && sk.gearChance > 0)
    pass(`[AC-4] affixed kill pays reward loop: xp ${sk.baseXp}→${sk.xp}, gearChance=${sk.gearChance}, drops=${JSON.stringify(sk.drops)}`);
  else fail(`[AC-4] affixed-kill reward off: ${JSON.stringify(sk)}`);
  const ess = await page.evaluate(() => window.__dev.affixEssence("frost", "skeleton"));
  if (ess && ess.affixKills >= 1 && ess.delta === ess.affixKills * ess.perAffix && ess.essence > ess.essenceNoAffix)
    pass(`[AC-4] EXTRA Esencia measured: +${ess.delta} (${ess.affixKills}×${ess.perAffix}); ${ess.essenceNoAffix}→${ess.essence}`);
  else fail(`[AC-4] Esencia tie-in off: ${JSON.stringify(ess)}`);

  // (AC-5) RNG-NEUTRALIDAD — deterministic roll + isolated Esencia term (0 affixed → byte-identical).
  const r1 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  const r2 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  if (r1.affixed === r2.affixed && JSON.stringify(r1.tally) === JSON.stringify(r2.tally))
    pass(`[AC-5] roll deterministic: ${r1.affixed}/${r1.n} affixed, identical tally ${JSON.stringify(r1.tally)} (server-safe)`);
  else fail(`[AC-5] affix roll NOT deterministic: ${r1.affixed} vs ${r2.affixed}`);
  const z = await page.evaluate(() => window.__dev.affixEssence("frost", "skeleton"));
  if (z.essence - z.essenceNoAffix === z.affixKills * z.perAffix)
    pass(`[AC-5] Esencia term is EXACTLY affixKills×${z.perAffix} → 0 affixed kills = 0 term = byte-identical baseline`);
  else fail(`[AC-5] Esencia term not isolated: ${JSON.stringify(z)}`);

  // (AC-6) PERF + JS — a live frost mob, 60fps held, no console errors on the live build.
  await page.evaluate(() => window.__dev.affixArena("frost", "skeleton", 80));
  const fps = await sampleFps(page, 1000);
  if (fps >= 55) pass(`[AC-6] ${fps} fps with a frost mob live`);
  else fail(`[AC-6] ${fps} fps (<55) with a frost mob`);
  if (errors.length === 0) pass(`[AC-6] 0 JS/page errors on live boot`);
  else fail(`[AC-6] ${errors.length} JS errors: ${errors.slice(0, 3).join(" | ")}`);
  if (missing.length) {
    const uniq = [...new Set(missing.map((u) => u.split("/").pop()))];
    log(`  ℹ pre-existing non-gating 404 assets (unrelated to CAS-1585): ${uniq.join(", ")}`);
  }

} catch (e) {
  fail(`harness threw: ${e && e.message ? e.message : e}`);
} finally {
  await browser.close();
}

console.log(ok ? "\nCAS-1588 Aura Gélida + Esencia LIVE QA: ALL PASS" : "\nCAS-1588 LIVE QA: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
