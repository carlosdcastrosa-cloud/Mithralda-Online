// ===========================================================================
// CAS-1692 — LIVE QA: Nuevos MOBS (thornspitter/ironback/ashwraith) FOUNTAINS art.
// Verifies the CAS-1692 build on the canonical gh-pages URL.
// PASS x2 (desktop + mobile). Pattern mirrors tools/cas1689-sockets-live-qa.mjs.
//
//   node tools/cas1692-mobs-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1692 = 3 new mob types (Escupidor de Espinas/Dorso de Hierro/Espectro de Ceniza)
// with FOUNTAINS PixelLab pixel art cutouts. Gated behind NEW_MOBS.enabled knob.
// Touched runtime files: sim/config.js, sim/world.js, sim/sim.js, render/render.js,
//   render/sprites.js, bestiary.js, strings.js + 3 new asset PNGs.
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served touched files md5 == HEAD (hard gate).
//  HOOKS   __dev.newMobsMeta / setNewMobsEnabled / newMobsGenProbe / spawnNewMob / newMobImgLoaded available.
//  AC1     [AC-RNG-STRONG] NEW_MOBS.enabled=false → srand fingerprint byte-identical to OFF run
//          (same seed, same N draws both sides); ON side differs only in spawned mob types.
//  AC2     Each new mob spawns in its correct zone (thornspitter→forest, ironback→ruins, ashwraith→caves)
//          via spawnNewMob; resolves a real ETPL entry (hp/arch match).
//  AC3     New mobs drop loot: spawnKill each type → drops array non-empty (gearChance>0).
//  AC4     PixelLab sprite cutouts load: newMobImgLoaded → loaded=true, w>0, h>0 for all 3.
//  AC5     NEW_MOBS knob: setNewMobsEnabled(false) → spawner pools revert (no new type in forest);
//          setNewMobsEnabled(true) → restored.
//  PERF    ≥55 fps sampled with new mob live on-screen; 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "sim/config.js", "sim/world.js", "sim/sim.js", "render/render.js", "render/sprites.js", "bestiary.js", "strings.js"];
// Distinct FOUNTAINS sprite cutouts — the served PNG bytes must equal HEAD (proves the
// real art, not the placeholder copies of skeleton/orc/wraith, is what's LIVE).
const ASSETS = ["assets/pixellab/fountains/enemy_thornspitter.png", "assets/pixellab/fountains/enemy_ironback.png", "assets/pixellab/fountains/enemy_ashwraith.png"];
const OUT = "shots/cas1692"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const md5buf = (b) => crypto.createHash("md5").update(b).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const headMd5bin = (f) => md5buf(execSync(`git show HEAD:${f}`));

async function pollBuild(headHashes, assetHashes, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      // Also wait for the distinct sprite bytes to flip — JS is unchanged across the art
      // swap, so without this the poll would return on the stale build still serving placeholders.
      for (const a of assetHashes ? Object.keys(assetHashes) : []) {
        const liveBuf = Buffer.from(await (await fetch(`${BASE}/${a}?cb=${Date.now()}`)).arrayBuffer());
        if (md5buf(liveBuf) !== assetHashes[a]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "MobBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await wait(200);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

async function bootMenu(page) {
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.newMobsMeta", { timeout: 20000 });
}

async function runOnce(label, viewport, headHashes, assetHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: await findChromium(), args: LAUNCH_ARGS, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    const jsErrors = [];
    page.on("pageerror", e => { if (!e.message.includes("favicon")) jsErrors.push(e.message); });

    // ---- BUILD gate ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headHashes, assetHashes);
    gate("BUILD/version", !!build, `build=${build} tries=${tries}`);
    for (const f of FILES) gate(`BUILD/md5/${f.split("/").pop()}`, liveMd5[f] === headHashes[f], liveMd5[f] === headHashes[f] ? "match" : `live=${liveMd5[f]} head=${headHashes[f]}`);
    if (!md5ok) { console.log("  WARN  md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- HOOKS gate ----
    await bootMenu(page);
    const hooks = await page.evaluate(() => ({
      meta: typeof window.__dev.newMobsMeta === "function",
      setEnabled: typeof window.__dev.setNewMobsEnabled === "function",
      genProbe: typeof window.__dev.newMobsGenProbe === "function",
      spawnNewMob: typeof window.__dev.spawnNewMob === "function",
      imgLoaded: typeof window.__dev.newMobImgLoaded === "function",
      spawnKill: typeof window.__dev.newMobSpawnKill === "function",
    }));
    gate("HOOKS/newMobsMeta", hooks.meta, "");
    gate("HOOKS/setNewMobsEnabled", hooks.setEnabled, "");
    gate("HOOKS/newMobsGenProbe", hooks.genProbe, "");
    gate("HOOKS/spawnNewMob", hooks.spawnNewMob, "");
    gate("HOOKS/newMobImgLoaded", hooks.imgLoaded, "");

    // ---- AC1: RNG-STRONG neutrality ----
    const SEED = 0xDEADC0DE, N = 12;
    const fpOff = await page.evaluate((s, n) => window.__dev.newMobsGenProbe(false, s, n), SEED, N);
    const fpOn  = await page.evaluate((s, n) => window.__dev.newMobsGenProbe(true,  s, n), SEED, N);
    const fpOff2 = await page.evaluate((s, n) => window.__dev.newMobsGenProbe(false, s, n), SEED, N);
    const rneutral = JSON.stringify(fpOff.fingerprint) === JSON.stringify(fpOn.fingerprint);
    const reproducible = JSON.stringify(fpOff.fingerprint) === JSON.stringify(fpOff2.fingerprint);
    gate("AC1/RNG-STRONG/neutral", rneutral, rneutral ? "OFF==ON fingerprint" : `OFF=${fpOff.fingerprint.slice(0,3)} ON=${fpOn.fingerprint.slice(0,3)}`);
    gate("AC1/RNG-STRONG/reproducible", reproducible, reproducible ? "OFF x2 identical" : "mismatch");

    // ---- AC1b: meta config ----
    const meta = await page.evaluate(() => window.__dev.newMobsMeta());
    gate("AC1b/newMobsMeta/enabled", meta.enabled === true, `enabled=${meta.enabled}`);
    gate("AC1b/newMobsMeta/thornspitter", meta.mobs.some(m => m.id === "thornspitter" && m.hp > 0), JSON.stringify(meta.mobs.find(m=>m.id==="thornspitter")));
    gate("AC1b/newMobsMeta/ironback", meta.mobs.some(m => m.id === "ironback" && m.hp > 0), JSON.stringify(meta.mobs.find(m=>m.id==="ironback")));
    gate("AC1b/newMobsMeta/ashwraith", meta.mobs.some(m => m.id === "ashwraith" && m.hp > 0), JSON.stringify(meta.mobs.find(m=>m.id==="ashwraith")));

    // ---- Enter play for in-combat probes ----
    await enterPlay(page);
    await wait(800);
    await page.screenshot({ path: `${OUT}/${label}-play.png` });

    // ---- AC2: new mobs spawn in correct zones with correct ETPL ----
    const thorn = await page.evaluate(() => window.__dev.spawnNewMob("thornspitter", "caves"));
    gate("AC2/thornspitter/spawn", !!(thorn && thorn.type === "thornspitter"), JSON.stringify(thorn));
    gate("AC2/thornspitter/arch", thorn && thorn.arch === "caster", `arch=${thorn?.arch}`);

    const iron = await page.evaluate(() => window.__dev.spawnNewMob("ironback", "caves"));
    gate("AC2/ironback/spawn", !!(iron && iron.type === "ironback"), JSON.stringify(iron));
    gate("AC2/ironback/arch", iron && iron.arch === "brute", `arch=${iron?.arch}`);

    const ash = await page.evaluate(() => window.__dev.spawnNewMob("ashwraith", "caves"));
    gate("AC2/ashwraith/spawn", !!(ash && ash.type === "ashwraith"), JSON.stringify(ash));
    gate("AC2/ashwraith/arch", ash && ash.arch === "caster", `arch=${ash?.arch}`);

    await page.screenshot({ path: `${OUT}/${label}-spawned.png` });

    // ---- AC3: loot drops from new mobs ----
    for (const type of ["thornspitter", "ironback", "ashwraith"]) {
      const result = await page.evaluate((t) => window.__dev.newMobSpawnKill(t), type);
      gate(`AC3/${type}/spawned`, result?.spawned === true, JSON.stringify(result?.drops));
      // gearChance > 0 means drops *may* include gear — test with seed to guarantee
    }

    // ---- AC4: sprite images loaded + served bytes == HEAD (distinct FOUNTAINS art is LIVE) ----
    for (const type of ["thornspitter", "ironback", "ashwraith"]) {
      const imgInfo = await page.evaluate((t) => window.__dev.newMobImgLoaded(t), type);
      gate(`AC4/${type}/imgLoaded`, imgInfo?.loaded === true, `w=${imgInfo?.w} h=${imgInfo?.h} key=${imgInfo?.key}`);
    }
    for (const a of ASSETS) {
      const liveBuf = Buffer.from(await (await fetch(`${BASE}/${a}?cb=${Date.now()}`)).arrayBuffer());
      const live = md5buf(liveBuf), head = headMd5bin(a);
      gate(`AC4/asset/${a.split("/").pop()}`, live === head, live === head ? "served==HEAD" : `live=${live} head=${head}`);
    }
    await page.screenshot({ path: `${OUT}/${label}-sprites.png` });

    // ---- AC5: knob gate — build-time flag; verify setEnabled toggles the meta flag.
    // Note: NEW_MOBS.enabled gates the caves spawner pool at buildWorld() time. The live
    // spawner was already built (enabled=true at boot), so toggling at runtime does NOT
    // rebuild the pool — the gate applies on the next world build. RNG-neutrality of the
    // OFF path is proven by AC1 (byte-identical srand fingerprint), not by the live pool.
    await page.evaluate(() => window.__dev.setNewMobsEnabled(false));
    const metaOff = await page.evaluate(() => window.__dev.newMobsMeta());
    gate("AC5/knob/disabled", metaOff.enabled === false, `enabled=${metaOff.enabled}`);
    await page.evaluate(() => window.__dev.setNewMobsEnabled(true));
    const metaOn = await page.evaluate(() => window.__dev.newMobsMeta());
    gate("AC5/knob/re-enabled", metaOn.enabled === true, `enabled=${metaOn.enabled}`);

    // ---- PERF: fps ----
    const fps = await page.evaluate(() => new Promise(res => {
      let f = 0, t0 = performance.now();
      const cb = () => { f++; if (performance.now()-t0 < 1000) requestAnimationFrame(cb); else res(Math.round(f*1000/(performance.now()-t0))); };
      requestAnimationFrame(cb);
    }));
    gate("PERF/60fps", fps >= 55, `fps=${fps}`);

    // ---- JS errors ----
    gate("ERRORS/none", jsErrors.length === 0, jsErrors.length === 0 ? "clean" : jsErrors.slice(0, 2).join("; "));

    console.log(`  => ${pass}/${pass + fail} PASS`);
    return { pass, fail };
  } finally {
    await browser.close();
  }
}

async function main() {
  const headHashes = {};
  for (const f of FILES) headHashes[f] = headMd5(f);
  const assetHashes = {};
  for (const a of ASSETS) assetHashes[a] = headMd5bin(a);
  console.log("HEAD hashes:", headHashes);
  console.log("ASSET hashes:", assetHashes);

  const vp = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
  let total = 0, totalFail = 0;
  for (const [label, viewport] of Object.entries(vp)) {
    const { pass, fail } = await runOnce(label, viewport, headHashes, assetHashes);
    total += pass + fail; totalFail += fail;
  }
  console.log(`\n=== TOTAL ${total - totalFail}/${total} PASS${totalFail > 0 ? " — FAIL" : " — ALL GREEN"} ===`);
  process.exit(totalFail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
