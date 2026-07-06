// ===========================================================================
// CAS-1643 — LIVE QA: Ítems Únicos/Legendarios (verifies CAS-1631/CAS-1638)
// on the canonical gh-pages build. Adapts tools/cas1632-uniques.mjs to the LIVE
// URL (no local server), like cas1620/cas1636, and gates all ACs ×2 (desktop+móvil).
//
//   node tools/cas1643-uniques-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Gates (all must PASS live, ×2 desktop+mobile):
//  DATA  legendary rarity tail (weight/rate) + 6 named uniques + append-only config.
//  AC1   each of the 6 uniques moves a REAL in-run number when EQUIPPED, no-op when not:
//        reloj_vacio -15% cd · corona_ecos +25% Esencia · colmillo_pavido burn proc ·
//        prisma_fracturado chain+2/nova×2 (copy-on-write) · corazon_titan +20% HP ·
//        guante_berserker +12% atkspd.
//  AC-PERS  a unique survives serialize->load (uniq preserved + mod stays live).
//  AC3   forceLegendary lands each unique through the REAL killEnemy loot path.
//  AC-RNG0 setLegRate(0) => drop stream byte-identical + 0 uniques.
//  AC-RNG-STRONG (CAS-1638 dedicated legRng) => non-legendary stream byte-identical
//        between rate=0 and rate>0 (shared srand untouched), uniques only appended.
//  AC4   no regression: 60fps, 0 real JS errors (favicon 404 filtered).
//  BUILD build == 34acf5b35e1d.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const EXPECT_BUILD = "34acf5b35e1d";
const OUT = "shots/cas1643"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WANT = ["reloj_vacio", "corona_ecos", "colmillo_pavido", "prisma_fracturado", "corazon_titan", "guante_berserker"];

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "UniqBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 6000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 6000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 6000 });
}
async function sampleFps(page, ms = 1200) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

async function runOnce(label, viewport) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: [...LAUNCH_ARGS, "--ignore-certificate-errors"], protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errors = [];
  const bad4xx = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) bad4xx.push(`${r.status()} ${r.url()}`); });

  try {
    await page.evaluateOnNewDocument(() => {
      try { localStorage.clear(); } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });
    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
    await page.bringToFront();

    // BUILD gate
    const build = await page.evaluate(async () => (await (await fetch("version.json", { cache: "no-store" })).json()).build);
    gate("BUILD", build === EXPECT_BUILD, `version.build=${build} (expected ${EXPECT_BUILD})`);

    await enterPlay(page);
    gate("BOOT", true, "entered play (menu->class->ability->play)");

    // PERF sampled on a clean fight pack BEFORE flooding drops.
    await page.evaluate(() => { for (let i = 0; i < 8; i++) window.__dev.spawn("skeleton", 60 + i * 22, -50 + i * 14); });
    await wait(300);
    const fps = await sampleFps(page, 1200);

    // DATA — legendary tail + 6 uniques + append-only config.
    const lm = await page.evaluate(() => window.__dev.legendaryMeta());
    gate("DATA-cfg", !!(lm.def && lm.def.rate > 0 && lm.def.eliteMul > 1 && lm.def.champMul > lm.def.eliteMul && lm.def.bossMul >= lm.def.champMul),
      `append-only cfg rate=${lm.def && lm.def.rate} eliteMul=${lm.def && lm.def.eliteMul} champMul=${lm.def && lm.def.champMul} bossMul=${lm.def && lm.def.bossMul}`);
    const ids = (lm.uniques || []).map((u) => u.id);
    gate("DATA-6uniq", lm.uniques && lm.uniques.length === 6 && WANT.every((w) => ids.includes(w)), `uniques=[${ids.join(", ")}]`);
    const slots = (lm.uniques || []).reduce((a, u) => (a[u.slot] = (a[u.slot] || 0) + 1, a), {});
    gate("DATA-slots", slots.weapon === 3 && slots.body === 2 && slots.shield === 1, `slots=${JSON.stringify(slots)}`);
    // AC1: legendary weight:0 -> never in ordinary roll (rank tail out of RARITY_ORDER)
    gate("AC1-weight0", lm.def && (lm.def.weight === 0 || lm.def.weight === undefined), `legendary weight=${lm.def && lm.def.weight} (0/absent => never in normal drop)`);

    // AC1 — baseline then each unique EQUIPPED moves a real number.
    const base = await page.evaluate(() => window.__dev.uniqSnap());
    gate("AC1-base", base && base.totals.abilCdr === 0 && base.totals.essencePct === 0 && base.totals.hpMul === 1 && base.totals.atkspd === 0,
      `baseline no-op totals=${JSON.stringify(base && base.totals)}`);
    const snap = (id) => page.evaluate((i) => window.__dev.equipUnique(i), id);

    let s = await snap("reloj_vacio");
    gate("AC1-reloj", s && s.cdrFactor < base.cdrFactor && Math.abs(s.cdrFactor - 0.85) < 0.001, `cd factor ${base.cdrFactor}->${s && s.cdrFactor} (-15%)`);
    s = await snap("corona_ecos");
    gate("AC1-corona", s && s.essence > base.essence && s.essence >= Math.floor(base.essence * 1.24), `Esencia ${base.essence}->${s && s.essence} (+25%)`);
    s = await snap("colmillo_pavido");
    gate("AC1-colmillo", s && (s.procs || []).some((p) => p.proc === "burn"), `procs=${JSON.stringify(s && s.procs)} (basic attack burn)`);
    s = await snap("prisma_fracturado");
    gate("AC1-prisma", s && s.empChain === base.empChain + 2 && Math.abs(s.empNova - base.empNova * 2) < 0.001 && !s.empChainSameRef && !s.empNovaSameRef,
      `chain ${base.empChain}->${s && s.empChain} (+2), nova ${base.empNova}->${s && s.empNova} (x2), copy-on-write`);
    gate("AC1-prisma-0delta", base.empChainSameRef && base.empNovaSameRef, `unequipped empower returns SAME ref (0-delta)`);
    s = await snap("corazon_titan");
    gate("AC1-corazon", s && s.maxHp > base.maxHp && s.maxHp >= Math.round(base.maxHp * 1.19), `maxHP ${base.maxHp}->${s && s.maxHp} (+20%)`);
    s = await snap("guante_berserker");
    gate("AC1-guante", s && s.atkspd === base.atkspd + 12 && s.totals.atkspd === 12, `atkspd ${base.atkspd}->${s && s.atkspd} (+12%)`);

    // AC3 — force each unique through REAL killEnemy loot path.
    let dropped = 0;
    for (const id of WANT) {
      const r = await page.evaluate((i) => window.__dev.forceLegendary(i), id);
      if (r && r.leg && r.leg.uniq === id && r.leg.rarity === "legendary") dropped++;
    }
    gate("AC3-drop", dropped === 6, `${dropped}/6 uniques drop via killEnemy (rarity 'legendary' + uniq id)`);

    // AC-PERS — survives serialize->load.
    const per = await page.evaluate(() => window.__dev.uniqPersist("corazon_titan"));
    gate("AC-PERS", per && per.ok && per.survived && per.after && per.after.uniq === "corazon_titan" && per.after.rarity === "legendary",
      `save->load uniq=${per && per.after && per.after.uniq} maxHp=${per && per.maxHp} (was ${per && per.before && per.before.maxHp})`);

    // AC-RNG0 — setLegRate(0): byte-identical + 0 uniques.
    await page.evaluate(() => window.__dev.setLegRate(0));
    const a1 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
    const a2 = await page.evaluate(() => window.__dev.dropStream(400, 987654));
    const legs0 = a1.filter((d) => d.uniq).length;
    gate("AC-RNG0", JSON.stringify(a1) === JSON.stringify(a2) && legs0 === 0, `identical=${JSON.stringify(a1) === JSON.stringify(a2)} legs=${legs0} (${a1.length} drops)`);
    const rrOn = await page.evaluate(() => { window.__dev.seed(555); window.__dev.setLegRate(0.5); return window.__dev.legendaryRollRate(2000); });
    gate("AC-RNG-on", rrOn.legs > 0, `rate>0 drops ${rrOn.legs}/${rrOn.n} uniques (rate ${rrOn.rate}) spread ${JSON.stringify(rrOn.tally)}`);

    // AC-RNG-STRONG (CAS-1638 dedicated legRng) — non-legendary stream byte-identical.
    const base0 = await page.evaluate(() => { window.__dev.setLegRate(0); return window.__dev.dropStream(600, 424242); });
    const onRaw = await page.evaluate(() => { window.__dev.setLegRate(0.5); return window.__dev.dropStream(600, 424242); });
    await page.evaluate(() => window.__dev.setLegRate(null));
    const strip = (arr) => JSON.stringify(arr.filter((d) => !d.uniq));
    const onLegs = onRaw.filter((d) => d.uniq).length;
    gate("AC-RNG-STRONG", strip(base0) === strip(onRaw) && onLegs > 0,
      `non-leg stream identical=${strip(base0) === strip(onRaw)} appended uniques=${onLegs} (shared srand untouched => dedicated legRng)`);

    // AC4 — perf + errors. The only expected 4xx on gh-pages is /favicon.ico (no favicon
    // file shipped) -> Chrome logs a generic "Failed to load resource ... 404" console.error
    // with no URL. If every 4xx seen is favicon, drop those generic 404 console lines.
    gate("PERF", fps >= 55, `${fps} fps sustained`);
    const onlyFavicon4xx = bad4xx.length > 0 && bad4xx.every((u) => /favicon\.ico/i.test(u));
    const realErrs = errors.filter((e) => !(onlyFavicon4xx && /Failed to load resource.*404/i.test(e)) && !/favicon/i.test(e));
    gate("NO-ERR", realErrs.length === 0, realErrs.length ? realErrs.slice(0, 3).join(" | ") : `0 real JS errors (4xx seen: ${bad4xx.join(", ") || "none"} -> favicon only)`);

    await page.screenshot({ path: `${OUT}/${label}.png` });
  } catch (e) {
    gate("HARNESS", false, `threw: ${e && e.stack ? e.stack.split("\n")[0] : e}`);
  } finally {
    await browser.close();
  }
  console.log(`  --- ${label}: ${pass} PASS / ${fail} FAIL`);
  return { pass, fail };
}

const desktop = await runOnce("desktop", { width: 1280, height: 720, deviceScaleFactor: 1 });
const mobile = await runOnce("mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const tot = { pass: desktop.pass + mobile.pass, fail: desktop.fail + mobile.fail };
console.log(`\n=== CAS-1643 LIVE QA: desktop ${desktop.pass}/${desktop.pass + desktop.fail}, mobile ${mobile.pass}/${mobile.pass + mobile.fail} ===`);
console.log(tot.fail === 0 ? `✅ PASS x2 — ${tot.pass} gates green on live ${EXPECT_BUILD}` : `❌ ${tot.fail} FAIL — see above`);
process.exit(tot.fail === 0 ? 0 : 1);
