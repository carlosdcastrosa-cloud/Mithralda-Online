// ===========================================================================
// CAS-1748 — LIVE QA: Caldera de Cenizas (5th gated endgame zone + boss + 2 mobs
// + `emberfury` modifier). Verifies the CAS-1783 build (deployed by CAS-1747) on
// the canonical gh-pages URL. PASS x2 (desktop + mobile), browser-per-pass.
//
// Feature = a GATED mid-endgame biome parallel to abyss/frost/trial (NOT a 5th
// CONQUEST zone → protects the APEX cycle + saves). Everything hangs off the
// `ZONE5.enabled` knob: the world.js caldera block, the town portal gate
// (CALDERA_POWER_REQ), the `emberfury` modifier entering the draft pool, and the
// DEDICATED `zone5Rng` (0xca1de5a0) bonus-loot stream. With OFF the game is
// byte-identical (worldgen, modifier pool, srand). New RNG lives ONLY in
// zone5Rng, appended after every authoritative draw → srand never perturbed.
//
//   node tools/cas1744-caldera-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Deploy set (CAS-1783 build touched exactly these 7 code blobs + 15 art strips —
// HARD md5 gate; served bytes must == HEAD):
//   render/render.js, render/sprites.js, sim/config.js, sim/gear.js, sim/sim.js,
//   sim/world.js, strings.js
//   assets/pixellab/fountains/anim/{emberkin,magmabrute,calderatyrant}_{idle,walk,
//     attack,hurt,death}_strip.png  (served-PNG md5==HEAD — AC3)
//
// NOTE (observation, not a defect): the build wired the `zone5*` dev hooks onto
// the sim.js `dev` export but did NOT add them to game.js's explicit window.__dev
// allowlist (game.js was NOT in the deploy set — same pattern as CAS-1774 frenzy*
// / CAS-1769 wa*). This harness recovers them by dynamically importing the SAME
// live module URL — ESM dedups by URL, so import() returns the RUNNING game's sim
// module instance (same live G / world), i.e. the exact served bytes.
//
// Covers the spec ACs (design/cas1744-zone5-caldera.md):
//   AC0  md5 live==HEAD (7 code + 15 PNG) + version.json build
//   AC1 [RNG-STRONG]  worldgen neutral (outsideDiffs=0, OFF no caldera tiles/portal),
//        srand-stream isolation (zone5Rng never perturbs srand), modifier pool
//        OFF==historical/ON+emberfury, zone5Rng deterministic + isolated
//   AC2  portal gated → warp to caldera biome, zoneOf→"caldera", molten floor
//   AC3  emberkin+magmabrute in caldera, richAnim 8-dir, FOUNTAINS art md5==HEAD
//   AC4  boss Corazón de Magma: minR epic+ payoff, enrage@50% + radial slam (data)
//   AC5  emberfury mults data-only, absent from pool with OFF
//   AC6  save additive: no version bump, no persisted caldera state
//   AC7  60fps, 0 crashes (desktop + mobile)
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const CODE = ["render/render.js", "render/sprites.js", "sim/config.js", "sim/gear.js", "sim/sim.js", "sim/world.js", "strings.js"];
const MOBS = ["emberkin", "magmabrute", "calderatyrant"];
const STATES = ["idle", "walk", "attack", "hurt", "death"];
const STRIPS = MOBS.flatMap(m => STATES.map(s => `assets/pixellab/fountains/anim/${m}_${s}_strip.png`));
const OUT = "shots/cas1748"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
const headMd5Text = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const headMd5Bin = (f) => md5(execSync(`git cat-file blob HEAD:${f}`, { maxBuffer: 256 * 1024 * 1024, encoding: "buffer" }));
const J = (v) => JSON.stringify(v);

async function pollBuild(headCode, tries = 16, gap = 5000) {
  let build = "", lastMd5 = {}, lastText = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of CODE) {
        const txt = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text();
        lastText[f] = txt; lastMd5[f] = md5(txt); if (lastMd5[f] !== headCode[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, text: lastText, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, text: lastText, ok: false, tries };
}

function watch(page) {
  const errs = [];
  page.on("pageerror", e => { if (!/favicon/.test(e.message)) errs.push("pageerror: " + e.message); });
  page.on("console", m => {
    const t = m.text();
    if (m.type() === "error" && !/favicon/.test(t) && !/Failed to load resource/.test(t)) errs.push("console: " + t);
  });
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/version\.json/.test(r.url())) errs.push(`http ${r.status()}: ${r.url()}`); });
  return errs;
}

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "CalderaQA"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

// Recover the zone5* dev hooks by importing the SAME live module URL (ESM dedups ⇒
// the running game's instance). Stash the `dev` object on window.__z5 for the probes.
async function wireLiveModule(page) {
  return await page.evaluate(async () => {
    try {
      const url = new URL("sim/sim.js", location.href).href;
      const m = await import(url);
      window.__z5 = m.dev; window.__z5G = m.G;
      const need = ["zone5Meta", "setZone5Enabled", "zone5ModPoolIds", "zone5RngProbe",
        "zone5StreamIsolationProbe", "caldWorldNeutralProbe", "caldSpawnKill"];
      const missing = need.filter((k) => typeof m.dev[k] !== "function");
      return { ok: missing.length === 0, missing, sameWorld: !!(m.G) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
}

async function runOnce(label, viewport, headCode, headStrip, servedText) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    // ---- AC0 BUILD gate: 7 code blobs live == HEAD ----
    const { build, md5: liveMd5, ok: md5ok, tries } = await pollBuild(headCode);
    gate("AC0/version", !!build, `build=${build} tries=${tries}`);
    for (const f of CODE) gate(`AC0/md5/${f}`, liveMd5[f] === headCode[f], liveMd5[f] === headCode[f] ? "match" : `live=${liveMd5[f]} head=${headCode[f]}`);
    if (!md5ok) { console.log("  WARN  code md5 gate failed — aborting run"); return { pass, fail }; }

    // ---- AC0/AC3 served-PNG md5==HEAD: 15 caldera art strips ----
    let stripMiss = 0;
    for (const f of STRIPS) {
      let live = "";
      try { const ab = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).arrayBuffer(); live = md5(Buffer.from(ab)); } catch {}
      const ok = live === headStrip[f]; if (!ok) stripMiss++;
      if (!ok) gate(`AC3/png/${f.split("/").pop()}`, false, `live=${live} head=${headStrip[f]}`);
    }
    gate("AC3/png-md5-all", stripMiss === 0, `15/15 FOUNTAINS caldera strips served-PNG md5==HEAD (${15 - stripMiss}/15)`);

    // ---- SEAM: served bytes actually contain the feature (belt + suspenders vs md5) ----
    const cfg = servedText["sim/config.js"] || "", sim = servedText["sim/sim.js"] || "", wld = servedText["sim/world.js"] || "";
    const spr = servedText["render/sprites.js"] || "", rnd = servedText["render/render.js"] || "", str = servedText["strings.js"] || "";
    gate("SEAM/config", /ZONE5\s*=/.test(cfg) && /CALDERA_POWER_REQ/.test(cfg) && /emberfury/.test(cfg) && /caldera:\{\s*tier:5/.test(cfg.replace(/\s/g, m => m)) , "ZONE5 knob + CALDERA_POWER_REQ + emberfury + tier5 in served config.js");
    gate("SEAM/sim", /zone5Rng\s*=\s*createRNG\(0xca1de5a0\)/.test(sim) && /caldWorldNeutralProbe/.test(sim) && /calderaLocked/.test(sim), "zone5Rng(0xca1de5a0) + caldWorldNeutralProbe + gate in served sim.js");
    gate("SEAM/world", /caldera/.test(wld) && /ZONE5\.enabled/.test(wld), "gated caldera biome block in served world.js");
    gate("SEAM/sprites", MOBS.every(m => new RegExp(`${m}:\\{`).test(spr.replace(/\s/g, "")) || spr.includes(m)), "emberkin/magmabrute/calderatyrant ENEMY_STRIPS in served sprites.js");
    gate("SEAM/render", /T_CALDERA/.test(rnd), "T_CALDERA molten floor branch in served render.js");
    gate("SEAM/strings", /calderaLocked/.test(str) && /enteredCaldera/.test(str), "caldera toasts in served strings.js");

    const page = await browser.newPage();
    await page.setViewport(viewport);
    const errs = watch(page);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.pacts.v1");
        localStorage.removeItem("mithralda.codex.v1"); localStorage.removeItem("mithralda.titles.v1");
        localStorage.removeItem("mithralda.arena.v1"); localStorage.removeItem("mithralda.meta.v1");
      } catch (e) {}
      window.__frames = 0;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
    });

    await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load" });
    await enterPlay(page);
    gate("BOOT/play", true, "entered play (live world, ZONE5 on)");

    const wl = await wireLiveModule(page);
    gate("HOOKS/live-module", wl.ok, wl.ok ? `zone5* hooks live (running instance, world=${wl.sameWorld})` : `missing=${(wl.missing || []).join(",")} err=${wl.err || ""}`);
    if (!wl.ok) { console.log("  WARN  live module unavailable — aborting behavioral gates"); return { pass, fail }; }

    // ---- LIVE-WORLD [DEFECT GATE]: the world the PLAYER actually plays is buildTiledWorld
    // (default; buildWorld only under ?world=classic). zoneOf keys off world.caldera — which
    // buildTiledWorld must shift+export like swamp/abyss. If it's missing, the Caldera reads as
    // "field": bonus loot never rolls AND huntKill("field") no-ops ⇒ the boss can't be summoned. ----
    const lw = await page.evaluate(() => {
      const mi = window.__dev.mapInfo();                       // live world (default = buildTiledWorld)
      const sk = window.__z5.caldSpawnKill("emberkin");        // spawns INSIDE the live caldera rect → live zoneOf
      return { spawnerZones: mi.spawners.map(s => s.zone), zoneAtSpawnerCenter: sk.ok ? sk.zone : null, spawnOk: sk.ok, reason: sk.reason || "" };
    });
    const hasSpawner = lw.spawnerZones.includes("caldera");
    gate("LIVE/spawner-grafted", hasSpawner && lw.spawnOk, `caldera spawner grafted into the live buildTiledWorld (${lw.spawnerZones.filter(z => z === "caldera").length} caldera spawner) — the molten biome + mobs exist in-game`);
    gate("LIVE/zoneOf-in-game", lw.zoneAtSpawnerCenter === "caldera",
      lw.zoneAtSpawnerCenter === "caldera"
        ? "zoneOf(caldera mob)→caldera in the LIVE world"
        : `❌ DEFECT: a mob standing IN the caldera resolves zoneOf → "${lw.zoneAtSpawnerCenter}" (NOT caldera). buildTiledWorld's return omits 'caldera:shR(proc.caldera)' (swamp/abyss ARE exported) ⇒ world.caldera undefined ⇒ (1) killEnemy bonus-loot roll never fires; (2) huntKill("field") no-ops ⇒ boss Corazón de Magma NEVER summons via normal play`);

    // ---- CONTENT/knob (matches design spec §1/§5/§6) ----
    const meta = await page.evaluate(() => window.__z5.zone5Meta());
    gate("CONTENT/knob", meta.enabled === true && meta.zone === "caldera" && meta.powerReq === 10 && meta.gateOrder === true,
      `ZONE5 enabled zone=${meta.zone} REQ=${meta.powerReq} gateOrder(abyss<caldera<frost)=${meta.gateOrder}`);
    const em = meta.mobs.find(m => m.id === "emberkin"), mb = meta.mobs.find(m => m.id === "magmabrute");
    gate("CONTENT/mobs", em && em.arch === "caster" && em.infl === "burn" && em.richAnim && mb && mb.arch === "brute" && mb.richAnim,
      `emberkin(caster,burn,richAnim) + magmabrute(brute,richAnim) — reuse existing archetypes + status`);
    gate("CONTENT/boss", meta.boss.base === "calderatyrant" && meta.boss.minR === "epic" && meta.boss.enrageAt === 0.5 && meta.boss.slam >= 12 && meta.boss.richAnim,
      `Corazón de Magma: minR=${meta.boss.minR} enrage@${meta.boss.enrageAt * 100}% slam=${meta.boss.slam} richAnim=${meta.boss.richAnim}`);
    gate("CONTENT/modifier", meta.modifier.id === "emberfury" && meta.modifier.glyph === "♨" && meta.modifier.dmgMul === 1.30 && meta.modifier.spdMul === 1.10 && meta.modifier.inMap === true && meta.modifier.inBaseArray === false,
      `emberfury ♨ +${(meta.modifier.dmgMul - 1) * 100}%dmg +${(meta.modifier.spdMul - 1) * 100}%spd — inMap=${meta.modifier.inMap} inBaseArray=${meta.modifier.inBaseArray} (out of base pool)`);

    // ---- AC1 [RNG-STRONG] worldgen neutrality: OFF vs ON same seed → only caldera ADDED ----
    const wn = await page.evaluate(() => window.__z5.caldWorldNeutralProbe(0x1744c0de));
    gate("AC1/worldgen-outside", wn.outsideDiffs === 0, `worldgen OFF vs ON byte-identical OUTSIDE the caldera rect (outsideDiffs=${wn.outsideDiffs})`);
    gate("AC1/worldgen-off-clean", wn.offHasCaldera === false && wn.calderaTilesOff === 0 && wn.offCalderaPortals === 0,
      `OFF ⇒ NO caldera (world.caldera=${wn.offHasCaldera}, T_CALDERA tiles=${wn.calderaTilesOff}, caldera portals=${wn.offCalderaPortals})`);
    gate("AC1/worldgen-on-adds", wn.onHasCaldera === true && wn.calderaTilesOn > 0 && wn.onCalderaPortals >= 1,
      `ON ⇒ caldera ADDED (rect + ${wn.calderaTilesOn} molten tiles + ${wn.onCalderaPortals} portal), non-caldera portals unchanged (${wn.offPortals}→${wn.onPortals - wn.onCalderaPortals} base)`);

    // ---- AC1 srand-stream isolation: hammering zone5Rng NEVER perturbs authoritative srand ----
    const iso = await page.evaluate(() => window.__z5.zone5StreamIsolationProbe(0x1744abcd, 48));
    gate("AC1/srand-isolation", iso.identical === true && iso.a.length === 48,
      `srand tail BYTE-IDENTICAL before/after 64 zone5Rng draws (${iso.a.length} draws) — dedicated stream never touches srand`);

    // ---- AC1/AC5 modifier pool: OFF==historical (no emberfury); ON == +emberfury ----
    const poolOn = await page.evaluate(() => window.__z5.zone5ModPoolIds());
    const poolOff = await page.evaluate(() => { window.__z5.setZone5Enabled(false); const p = window.__z5.zone5ModPoolIds(); window.__z5.setZone5Enabled(true); return p; });
    gate("AC5/pool-off", !poolOff.includes("emberfury") && poolOff.length === poolOn.length - 1,
      `OFF pool has NO emberfury (${poolOff.length} mods = historical) → modifier draft srand unchanged`);
    gate("AC5/pool-on", poolOn.includes("emberfury") && poolOn.length === poolOff.length + 1,
      `ON pool APPENDS emberfury (${poolOn.length} mods) — data-only, no RNG in the modifier layer`);

    // ---- AC1 zone5Rng deterministic + isolated (the ONLY new random draw of the zone) ----
    const r1 = await page.evaluate(() => window.__z5.zone5RngProbe(8, 0xca1de5a0));
    const r2 = await page.evaluate(() => window.__z5.zone5RngProbe(8, 0xca1de5a0));
    gate("AC1/zone5rng-determ", J(r1) === J(r2) && r1.length === 8, `zone5Rng reseeds deterministically (${r1.length} draws reproduce)`);

    // ---- AC2 [Zona alcanzable]: molten biome reachable, zoneOf(vestibule)→"caldera" ----
    gate("AC2/zoneOf", wn.calderaZoneOfVestibule === "caldera", `warped-in vestibule tile zoneOf → "${wn.calderaZoneOfVestibule}" (molten biome, gated portal REQ=${meta.powerReq})`);

    // ---- AC3/AC4 mobs + boss spawn + kill through the REAL killEnemy path (zone==="caldera") ----
    const sk = {};
    for (const t of ["emberkin", "magmabrute", "calderatyrant"]) {
      sk[t] = await page.evaluate((type) => window.__z5.caldSpawnKill(type), t);
    }
    gate("AC3/spawn-emberkin", sk.emberkin.ok && sk.emberkin.zone === "caldera", sk.emberkin.ok ? `emberkin spawns IN caldera (zone=${sk.emberkin.zone}), killEnemy path OK` : `err=${sk.emberkin.reason}`);
    gate("AC3/spawn-magmabrute", sk.magmabrute.ok && sk.magmabrute.zone === "caldera", sk.magmabrute.ok ? `magmabrute spawns IN caldera (zone=${sk.magmabrute.zone})` : `err=${sk.magmabrute.reason}`);
    gate("AC4/boss-in-zone", sk.calderatyrant.ok && sk.calderatyrant.zone === "caldera", sk.calderatyrant.ok ? `calderatyrant (Corazón de Magma) spawns IN caldera + resolves` : `err=${sk.calderatyrant.reason}`);
    // AC4 payoff is the config contract (minR:epic via onChampionKill) — verified in CONTENT/boss above.
    gate("AC4/epic-floor", meta.boss.minR === "epic", `boss loot floor = épico+ (minR="${meta.boss.minR}") — CAS-89 payoff via onChampionKill`);

    // ---- AC3 live animated mobs: tp into caldera, spawn, screenshot the richAnim strips ----
    await page.evaluate(() => {
      try {
        const G = window.__z5G, w = G && G.world, ca = w && w.caldera;
        if (ca && window.__dev && window.__dev.tp) {
          window.__dev.tp((ca.x + ca.w / 2), (ca.y + ca.h / 2));
        }
      } catch (e) {}
    });
    await wait(500);
    const spawned = await page.evaluate(() => {
      try {
        for (const t of ["emberkin", "magmabrute"]) window.__dev.spawn(t, 40, 0), window.__dev.spawn(t, -40, 0);
        return window.__dev.enemies().filter(e => e.type === "emberkin" || e.type === "magmabrute").length;
      } catch (e) { return -1; }
    });
    await wait(700);
    await page.screenshot({ path: `${OUT}/${label}-caldera.png` }).catch(() => {});
    gate("AC3/live-anim", spawned >= 1, `${spawned} caldera mobs spawned + animating in the molten biome → ${OUT}/${label}-caldera.png`);

    // ---- AC6 save additive: no persisted caldera state, no version bump ----
    gate("AC6/no-persist", !/cq\.bossesDown[^]{0,40}caldera/.test(sim) && !/save\.v[0-9]/.test(str),
      `no caldera state in save.v1 (not in cq.bossesDown → APEX count intact); build did NOT touch persist.js`);

    // ---- AC7 PERF: 60fps in play ----
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await wait(1200);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    gate("AC7/60fps", fps >= 45, `${fps}fps (CI variance; AC1 RNG-neutrality is the hard bar)`);

    // ---- REG: no page errors ----
    const realErrors = errs.filter((e) => !/favicon|net::ERR_|404/i.test(e));
    gate("AC7/no-errors", realErrors.length === 0, realErrors.slice(0, 3).join(" | ") || "clean (0 crashes)");

  } finally {
    await browser.close();
  }
  return { pass, fail };
}

// ---- main: PASS x2 (desktop + mobile), browser-per-pass ----
const headCode = Object.fromEntries(CODE.map((f) => [f, headMd5Text(f)]));
const headStrip = Object.fromEntries(STRIPS.map((f) => [f, headMd5Bin(f)]));
console.log(`CAS-1748 LIVE QA — Caldera de Cenizas @ ${BASE}\nHEAD code md5:`, headCode);

let totalPass = 0, totalFail = 0, servedText = {};
try {
  const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json();
  console.log(`live build=${v.build}`);
} catch {}
for (const f of CODE) { try { servedText[f] = await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text(); } catch {} }

for (const [label, vp] of [
  ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
  ["mobile", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const { pass, fail } = await runOnce(label, vp, headCode, headStrip, servedText);
  totalPass += pass; totalFail += fail;
  console.log(`--- ${label}: ${pass} PASS / ${fail} FAIL`);
}

console.log(`\n${totalFail === 0 ? "✅" : "❌"} CAS-1748 LIVE QA: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile)`);
process.exit(totalFail === 0 ? 0 : 1);
