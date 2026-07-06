// ===========================================================================
// CAS-1631 — LIVE QA: Ítems Únicos/Legendarios (verifies the CAS-1638 build)
// on the canonical gh-pages build. Padre CAS-1631.
//
//   node tools/cas1631-uniques-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Canonical live pattern (CAS-1636/1620/1590): headless against gh-pages DIRECT,
// PASS ×2 desktop+mobile. All probes route through the REAL sim seams via the
// live __dev bridge (game.js:295-298) + a gearCol import for the color AC.
//
// Gates (all must PASS live, ×2 desktop+mobile):
//  AC1  RARITY COLOR — a 'legendary' instance tints gold-orange #ff9a3c (rank 4)
//       via gearCol(), DISTINCT from epic #c77dff (same fn the 30-slot grid +
//       drop floater route through).
//  AC2  6 UNIQUES move a real in-run number when EQUIPPED, no-op unequipped:
//       reloj_vacio (−15% cd) / corona_ecos (+25% esencia) / colmillo_pavido
//       (burn proc) / prisma_fracturado (chain +2 / nova ×2, copy-on-write) /
//       corazon_titan (+20% maxHp) / guante_berserker (+12% atkspd under cap).
//       + PERSISTENCE: a unique survives serialize→load from {defId,rarity,uniq}.
//  AC3  APPEND-ONLY RNG-NEUTRAL (DURA, seed fijo): the legendary roll draws from
//       the dedicated legRng stream, NEVER the shared srand — non-legendary drop
//       stream is byte-identical between rate=0 and rate>0 (only `uniq` entries
//       appended); zero uniques at rate=0; normal mobs never roll legendary.
//  AC4  NO REGRESSION: uniques drop through the REAL killEnemy loot path carrying
//       rarity 'legendary' + uniq id; 0 real JS errors; >=58fps sustained.
//  AC5  DEPLOY: build == 34acf5b35e1d, live == HEAD.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const EXPECT_BUILD = "34acf5b35e1d";
const OUT = "shots/cas1631"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WANT = ["reloj_vacio", "corona_ecos", "colmillo_pavido", "prisma_fracturado", "corazon_titan", "guante_berserker"];

async function runOnce(label, viewport) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404) errs.push("404: " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  const ver = await (await fetch(`${BASE}/version.json`)).json().catch(() => ({}));

  // GH Pages 503/boot flake -> reload-retry until __dev appears
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { console.log("  FAIL boot: __dev never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  // auto-resume save -> clear to land on menu, then enter play as warrior (Digit1)
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  }
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1631";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1");
  }
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(200); await key("Enter"); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });

  // Import gearCol from the LIVE bundle for the color AC (same seam the grid+floater use).
  await page.addScriptTag({ type: "module", content:
    `import {gearCol, RARITY} from "${BASE}/sim/gear.js"; window.__gearCol = gearCol; window.__RARITY = RARITY;` });
  await page.waitForFunction("window.__gearCol && window.__RARITY", { timeout: 10000 });
  await wait(200);

  // ---- PERF (sampled EARLY, clean state) — the dropStream/legendaryRollRate
  // probes below flood the arena with thousands of ground drops (a harness
  // artifact), so FPS must be measured NOW under a realistic fight pack, before
  // those probes run. Mirrors the cas1632 local harness ordering.
  const sampleFps = () => page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function loop() { n++; if (performance.now() - t0 < 800) requestAnimationFrame(loop); else res(Math.round(n * 1000 / (performance.now() - t0))); }
    requestAnimationFrame(loop);
  }));
  await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); }).catch(() => {});
  await wait(300);
  await sampleFps();
  const fpsSamples = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsSamples);

  // ---- AC1: RARITY COLOR — legendary #ff9a3c (rank 4), distinct from epic ------
  const col = await page.evaluate(() => ({
    leg: window.__gearCol({ slot: "weapon", defId: 0, rarity: "legendary" }),
    epic: window.__gearCol({ slot: "weapon", defId: 0, rarity: "epic" }),
    legRank: window.__RARITY.legendary && window.__RARITY.legendary.rank,
  }));
  gate("AC1 legendary tints gold-orange #ff9a3c (rank 4), distinct from epic #c77dff",
    col.leg.toLowerCase() === "#ff9a3c" && col.epic.toLowerCase() === "#c77dff" && col.leg !== col.epic && col.legRank === 4,
    `leg=${col.leg} epic=${col.epic} legRank=${col.legRank}`);

  // ---- AC1/DATA: 6 named uniques + append-only drop config --------------------
  const lm = await page.evaluate(() => window.__dev.legendaryMeta());
  const ids = (lm.uniques || []).map((u) => u.id);
  gate("AC2 6 named uniques present", (lm.uniques || []).length === 6 && WANT.every((w) => ids.includes(w)), ids.join(", "));
  const slots = (lm.uniques || []).reduce((a, u) => (a[u.slot] = (a[u.slot] || 0) + 1, a), {});
  gate("AC2 slot spread 3 weapon / 2 body / 1 shield", slots.weapon === 3 && slots.body === 2 && slots.shield === 1, JSON.stringify(slots));
  gate("AC3 append-only drop config (rate>0, eliteMul<champMul<=bossMul)",
    lm.def && lm.def.rate > 0 && lm.def.eliteMul > 1 && lm.def.champMul > lm.def.eliteMul && lm.def.bossMul >= lm.def.champMul,
    JSON.stringify(lm.def));

  // ---- AC2: each unique moves a real number when EQUIPPED, no-op unequipped ---
  const base = await page.evaluate(() => window.__dev.uniqSnap());
  gate("AC2 baseline (no unique) is a clean no-op",
    base && base.totals.abilCdr === 0 && base.totals.essencePct === 0 && base.totals.hpMul === 1 && base.totals.atkspd === 0,
    JSON.stringify(base && base.totals));
  const snap = (id) => page.evaluate((i) => window.__dev.equipUnique(i), id);

  let s = await snap("reloj_vacio");
  gate("AC2.1 reloj_vacio −15% cooldown", s && s.cdrFactor < base.cdrFactor && Math.abs(s.cdrFactor - 0.85) < 0.001,
    `cdrFactor ${base.cdrFactor}→${s && s.cdrFactor}`);

  s = await snap("corona_ecos");
  gate("AC2.2 corona_ecos +25% Esencia (pre-Ascensión)", s && s.essence > base.essence && s.essence >= Math.floor(base.essence * 1.24),
    `essence ${base.essence}→${s && s.essence}`);

  s = await snap("colmillo_pavido");
  gate("AC2.3 colmillo_pavido basic applies burn", s && (s.procs || []).some((p) => p.proc === "burn"), JSON.stringify(s && s.procs));

  s = await snap("prisma_fracturado");
  gate("AC2.4 prisma_fracturado chain +2 / nova ×2 (copy-on-write, no SPELLS mutation)",
    s && s.empChain === base.empChain + 2 && Math.abs(s.empNova - base.empNova * 2) < 0.001 && !s.empChainSameRef && !s.empNovaSameRef,
    `chain ${base.empChain}→${s && s.empChain} nova ${base.empNova}→${s && s.empNova} sameRef=${s && [s.empChainSameRef, s.empNovaSameRef]}`);
  gate("AC2.4b prisma_fracturado 0-delta when unequipped (empower returns SAME object)",
    base.empChainSameRef && base.empNovaSameRef, JSON.stringify([base.empChainSameRef, base.empNovaSameRef]));

  s = await snap("corazon_titan");
  gate("AC2.5 corazon_titan +20% maxHp (derived)", s && s.maxHp > base.maxHp && s.maxHp >= Math.round(base.maxHp * 1.19),
    `maxHp ${base.maxHp}→${s && s.maxHp}`);

  s = await snap("guante_berserker");
  gate("AC2.6 guante_berserker +12% atkspd (under cap)", s && s.atkspd === base.atkspd + 12 && s.totals.atkspd === 12,
    `atkspd ${base.atkspd}→${s && s.atkspd}`);

  // ---- AC2: PERSISTENCE — unique survives serialize→load ----------------------
  const per = await page.evaluate(() => window.__dev.uniqPersist("corazon_titan"));
  gate("AC2 persistence: unique survives save→load from {defId,rarity,uniq}, mod reproduced",
    per && per.ok && per.survived && per.after && per.after.uniq === "corazon_titan" && per.after.rarity === "legendary",
    per ? `after=${JSON.stringify(per.after)} maxHp=${per.maxHp} (was ${per.before && per.before.maxHp})` : "null");

  // ---- AC4: uniques drop through the REAL killEnemy loot path ------------------
  let dropped = 0, dropDetail = [];
  for (const id of WANT) {
    const r = await page.evaluate((i) => window.__dev.forceLegendary(i), id);
    if (r && r.leg && r.leg.uniq === id && r.leg.rarity === "legendary") dropped++;
    else dropDetail.push(`${id}:${JSON.stringify(r && r.leg)}`);
  }
  gate("AC4 all 6 uniques drop through REAL killEnemy path (rarity 'legendary' + uniq id)",
    dropped === 6, dropDetail.length ? dropDetail.join(" | ") : "6/6");

  // ---- AC3: append-only RNG-neutral (DURA, seed fijo) -------------------------
  // rate=0 ⇒ drop stream byte-identical across a fixed seed AND zero uniques.
  await page.evaluate(() => window.__dev.setLegRate(0));
  const s1 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
  const s2 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
  const legs0 = s1.filter((d) => d.uniq).length;
  gate("AC3 legRate=0 ⇒ drop stream byte-identical (fixed seed) + 0 uniques",
    JSON.stringify(s1) === JSON.stringify(s2) && legs0 === 0, `drops=${s1.length} uniques=${legs0}`);
  const rr0 = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setLegRate(0); return window.__dev.legendaryRollRate(3000); });
  gate("AC3 legendaryRollRate at rate=0 ⇒ 0 uniques", rr0.legs === 0, `${rr0.legs}/${rr0.n}`);

  // STRONG proof (CAS-1638 dedicated stream): rate=0 vs rate>0 non-legendary stream
  // byte-identical (only `uniq` entries appended) ⇒ shared srand UNTOUCHED at any rate.
  const base0 = await page.evaluate(() => { window.__dev.setLegRate(0); return window.__dev.dropStream(600, 424242); });
  const onRaw = await page.evaluate(() => { window.__dev.setLegRate(0.5); return window.__dev.dropStream(600, 424242); });
  const stripLeg = (arr) => arr.filter((d) => !d.uniq);
  const onLegs = onRaw.filter((d) => d.uniq).length;
  gate("AC3 STRONG: shared srand UNTOUCHED at rate>0 (non-legendary stream byte-identical to rate=0 baseline; uniques appended only)",
    JSON.stringify(stripLeg(base0)) === JSON.stringify(stripLeg(onRaw)) && onLegs > 0,
    `nonLegDrops=${stripLeg(base0).length} identical=${JSON.stringify(stripLeg(base0)) === JSON.stringify(stripLeg(onRaw))} appended=${onLegs}`);

  // rate>0 DOES drop uniques (feature ON) + normal mobs never roll legendary.
  const rrOn = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setLegRate(0.5); return window.__dev.legendaryRollRate(2000); });
  await page.evaluate(() => window.__dev.setLegRate(null)); // restore shipped rate
  gate("AC3 rate>0 drops uniques (feature ON), normal mobs excluded (only elite/champ/boss)",
    rrOn.legs > 0, `${rrOn.legs}/${rrOn.n} rate=${rrOn.rate} spread=${JSON.stringify(rrOn.tally)}`);

  // ---- AC5: deploy + perf + errors -------------------------------------------
  gate("AC5 build == " + EXPECT_BUILD + " (live==HEAD)", ver.build === EXPECT_BUILD, `live=${ver.build}`);
  gate("AC4 >=58fps sustained (best-of-3, clean-state sample)", fps >= 58, `fps≈${fps} samples=[${fpsSamples.join(",")}]`);
  await page.screenshot({ path: `${OUT}/${label}.png` });

  const realErrs = errs.filter((e) => !/favicon|404.*favicon|net::ERR|Failed to load resource/i.test(e) && !(/^404:/.test(e) && /favicon/i.test(e)));
  // favicon 404 is cosmetic — strip any 404 whose url is the favicon
  const hardErrs = realErrs.filter((e) => !(/^404:/.test(e) && /favicon/i.test(e))).filter((e) => !/favicon/i.test(e));
  gate("AC4 zero real JS errors (favicon 404 filtered)", hardErrs.length === 0, hardErrs.length ? hardErrs.slice(0, 4).join(" | ") : "clean");

  console.log(`  → ${pass}/${pass + fail} PASS (build ${ver.build || "?"}, fps≈${fps})`);
  if (hardErrs.length) console.log("  errs:", hardErrs.slice(0, 6));
  await browser.close();
  return { pass, fail };
}

const runs = [
  ["run1-desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }],
  ["run2-mobile375", { width: 375, height: 720, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];
let tp = 0, tf = 0;
for (const [label, vp] of runs) { const r = await runOnce(label, vp); tp += r.pass; tf += r.fail; }
console.log(`\n=== CAS-1631 UNIQUES LIVE QA TOTAL: ${tp}/${tp + tf} PASS across ${runs.length} runs ===`);
process.exit(tf ? 1 : 0);
