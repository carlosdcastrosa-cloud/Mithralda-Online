// ===========================================================================
// CAS-1629 — LIVE QA: poción de maná usable en la barra de pociones (verifies CAS-1628)
// on the canonical gh-pages build. Runs PASS x2 (desktop + mobile).
//
//   node tools/cas1629-mana-potion-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1628 (data + sim only, RNG-neutral): a new `mana` consumable appended to
// CONSUMABLES (manaFrac:0.6, price:50, cd:12, col #5a8aff), a `manaFrac` branch in
// doConsumable() that restores 0.6*maxMp (exact mirror of `greater`/healFrac), and
// starter stash mana:1. render.js NOT touched (isolated deploy over undeployed CAS-1611).
//
// Drives the REAL __dev consum hooks on the SERVED build + reads live hero mp via an
// injected module import of {G} from the served sim.js.
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD  version.json==ca0792252bf8; served sim/config.js + sim/sim.js md5 == HEAD.
//  AC1    APPEARS in the potion bar: consumState().list includes {id:"mana"};
//         selectConsum(idx) binds the slot -> selId==="mana", name "Maná", blue col.
//  AC2    USE restores mana: setConsum('mana',2)+low mp -> useConsum() adds
//         round(0.6*maxMp), caps at maxMp, qty 2->1, cd 12s armed.
//  AC3    NO REGRESSION: `greater` still heals HP; fury+antidote present;
//         save/reload persists mana qty (consum additive, no SAVE_VERSION bump).
//  AC4    OBTAINABLE: merchant shopList() stocks "Poción de maná"; starter stash mana>=1.
//  PERF   0 JS errors; >=55 fps.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const EXPECT_BUILD = "ca0792252bf8";
const OUT = "shots/cas1629"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

async function runOnce(label, viewport) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  const http404 = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  // ---- BUILD gate: served version + md5 parity vs HEAD ----------------------
  const ver = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json().catch(() => ({}));
  gate("BUILD.ver", ver.build === EXPECT_BUILD, `served build=${ver.build} expect=${EXPECT_BUILD}`);
  for (const f of ["sim/config.js", "sim/sim.js"]) {
    const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
    const head = headMd5(f);
    gate(`BUILD.md5 ${f}`, live === head, `live=${live.slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }

  // ---- boot: menu -> classsel -> abilitysel -> play ------------------------
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1629";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1"); // warrior
  }
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(200); await key("Enter"); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });

  // inject a module that surfaces live hero + save fns from the SERVED sim.js
  await page.addScriptTag({ type: "module", content:
    `import {G, serializeSave, loadSave} from "${BASE}/sim/sim.js";
     window.__G = G; window.__serializeSave = serializeSave; window.__loadSave = loadSave;` });
  await page.waitForFunction("window.__G && window.__serializeSave && window.__loadSave", { timeout: 10000 });
  await wait(300);

  // ---- AC4b: starter stash mana>=1 (fresh boot, BEFORE any mutation) --------
  const starter = await page.evaluate(() => window.__dev.consumState().consum);
  gate("AC4.starter", (starter.mana | 0) >= 1, `starter stash mana=${starter.mana} (expect >=1)`);

  // ---- AC1: APPEARS in the potion bar --------------------------------------
  const list = await page.evaluate(() => window.__dev.consumState().list);
  const mi = list.findIndex((c) => c.id === "mana");
  gate("AC1.inList", mi >= 0, `consumState().list ids=[${list.map(c => c.id).join(",")}] mana@${mi}`);
  // bind the slot to mana + read back the selected slot
  const sel = await page.evaluate((mi) => { window.__dev.selectConsum(mi); const s = window.__dev.consumState();
    return { selId: s.selId, sel: s.sel }; }, mi);
  gate("AC1.select", sel.selId === "mana" && sel.sel === mi, `selectConsum(${mi}) -> selId=${sel.selId} sel=${sel.sel}`);
  await wait(150);
  await page.screenshot({ path: `${OUT}/${label}-ac1-mana-selected.png` });

  // ---- AC2: USE restores mana (real doConsumable via useConsum) -------------
  const use = await page.evaluate(() => {
    const H = window.__G.hero; const max = H.maxMp;
    window.__dev.setConsum("mana", 2); window.__dev.clearConsumCD();
    H.mp = 5;                          // drain
    const before = H.mp, qty0 = window.__dev.consumState().consum.mana;
    const r = window.__dev.useConsum(); // fires the mana slot (selId==='mana')
    const after = window.__G.hero.mp, qty1 = r.consum.mana, cd = r.cds.mana;
    return { ok: r.ok, max, before, after, qty0, qty1, cd, expect: Math.min(max, before + Math.round(0.6 * max)) };
  });
  gate("AC2.fired", use.ok === true, `useConsum().ok=${use.ok}`);
  gate("AC2.restore", use.after === use.expect, `mp ${use.before}->${use.after} (+${use.after - use.before}, expect +${Math.round(0.6 * use.max)} of maxMp ${use.max})`);
  gate("AC2.qty", use.qty1 === use.qty0 - 1, `charge ${use.qty0}->${use.qty1}`);
  gate("AC2.cd", use.cd > 11 && use.cd <= 12, `cooldown armed ${use.cd}s (expect ~12)`);
  await wait(120); await page.screenshot({ path: `${OUT}/${label}-ac2-mana-used.png` });

  // cap: near-full mana never overflows
  const cap = await page.evaluate(() => {
    const H = window.__G.hero; window.__dev.setConsum("mana", 1); window.__dev.clearConsumCD();
    H.mp = H.maxMp - 2; window.__dev.useConsum(); return { mp: window.__G.hero.mp, max: H.maxMp };
  });
  gate("AC2.cap", cap.mp === cap.max, `caps at maxMp (${cap.max - 2}->${cap.mp}, no overflow)`);

  // ---- AC3: no regression — greater heals HP; fury+antidote present ---------
  const ids = list.map((c) => c.id);
  gate("AC3.roster", ids.includes("fury") && ids.includes("antidote") && ids.includes("greater"),
    `roster intact: ${ids.join(",")}`);
  const heal = await page.evaluate(() => {
    const gi = window.__dev.consumState().list.findIndex((c) => c.id === "greater");
    window.__dev.selectConsum(gi); window.__dev.setConsum("greater", 1); window.__dev.clearConsumCD();
    window.__dev.setHeroHp(1);
    const before = window.__dev.consumState().hp;
    const r = window.__dev.useConsum();
    return { before, after: r.hp, maxHp: r.maxHp };
  });
  gate("AC3.greaterHeal", heal.after > heal.before, `greater still heals HP ${heal.before}->${heal.after} (maxHp ${heal.maxHp})`);

  // save/reload persists mana qty (additive, no SAVE_VERSION bump)
  const persist = await page.evaluate(() => {
    window.__dev.setConsum("mana", 3);
    const blob = window.__serializeSave(); window.__loadSave(blob);
    return window.__dev.consumState().consum.mana;
  });
  gate("AC3.persist", persist === 3, `mana qty survives serialize->load (=${persist}, expect 3)`);

  // ---- AC4: obtainable — merchant stocks the mana potion --------------------
  const shop = await page.evaluate(() => window.__dev.shopList().map((it) => it.name));
  gate("AC4.merchant", shop.some((n) => /man[áa]/i.test(n)), `shop stock: ${shop.filter(n => /poci|man[áa]/i.test(n)).join(" | ")}`);

  // ---- PERF: fps + 0 JS errors --------------------------------------------
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  gate("PERF.fps", fps >= 55, `${fps} fps (>=55)`);
  // The only console errors on this build are HTTP 404s; classify each by its real URL.
  // Cosmetic (favicon/icon/manifest) 404s are non-gating per every prior QA cycle.
  const cosmetic404 = http404.filter((u) => /favicon|apple-touch|\.ico|manifest|icon/i.test(u));
  const real404 = http404.filter((u) => !/favicon|apple-touch|\.ico|manifest|icon/i.test(u));
  const nonHttpErrs = errs.filter((e) => !/Failed to load resource.*404/i.test(e));
  const jsClean = real404.length === 0 && nonHttpErrs.length === 0;
  gate("PERF.jsErr", jsClean,
    jsClean ? `0 real JS errors (cosmetic 404s: ${cosmetic404.map(u => u.split("/").pop()).join(",") || "none"})`
            : `real404=[${real404.join(",")}] otherErrs=[${nonHttpErrs.slice(0,3).join(" ; ")}]`);

  await browser.close();
  return { pass, fail };
}

(async () => {
  const runs = [
    ["desktop", { width: 1280, height: 800, deviceScaleFactor: 1 }],
    ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ];
  let P = 0, F = 0;
  for (const [label, vp] of runs) { const r = await runOnce(label, vp); P += r.pass; F += r.fail; }
  console.log(`\n==== CAS-1629 LIVE QA TOTAL: ${P} PASS / ${F} FAIL (x2 runs) ====`);
  console.log(F === 0 ? "✅ PASS x2 — CAS-1628 mana potion verified LIVE" : "❌ FAIL — see gates above");
  process.exit(F === 0 ? 0 : 1);
})();
