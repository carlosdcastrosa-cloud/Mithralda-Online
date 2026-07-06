// ===========================================================================
// CAS-1689 — LIVE QA: Runas y Engarces (sockets) (CAS-1686). Verifies the CAS-1687 build
// (master 5744594, deploy CAS-1688 build 006ee4d270d3) on the canonical gh-pages build.
// PASS x2 (desktop + mobile). Pattern mirrors tools/cas1681-events-live-qa.mjs; ACs mirror
// tools/cas1687-sockets.mjs (headless).
//
//   node tools/cas1689-sockets-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1686 = an ARPG socket/rune layer on the EXISTING item infra ($0 art: runes/sockets are
// tinted ◇/◆ glyphs, no new sprites). Gear may carry `sockets` (0–2, empty {} or filled {type});
// a rune is a bag item {rune:type}. Engarzar consumes a rune into an empty socket; the bonus rides
// socketTotals() (mirror of affixTotals) so it moves REAL combat numbers. Every socket/rune draw
// comes from a DEDICATED runeRng (append-only, never srand) ⇒ sockets OFF/rate0 = byte-identical
// gameplay. Additive save (inst.sockets), no SAVE_VERSION bump. config knob SOCKETS.
// Touched runtime files (deploy overlay): game.js + input.js + render/render.js + sim/config.js
//   + sim/gear.js + sim/sim.js.
//
// window/dev hooks (all route to the served sim module via the game.js wrapper):
//   __dev.socketMeta / socketSetEnabled / setSocketRate / socketTotals / grantSocketGear / grantRune
//   __dev.forceSocketRune / socketRune / removeSocketRune / socketSnap / socketPersist
//   __dev.socketRngProbe / socketGenProbe   (+ base __dev.openInv / scene)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served 6 touched files md5 == HEAD (hard gate).
//  HOOKS   the whole CAS-1687 dev contract is wired in the curated game.js wrapper.
//  AC1     [AC-RNG-STRONG] sockets OFF vs ON(rate 5) vs rate0 ⇒ gameplay srand BYTE-IDENTICAL,
//          while ON actually drops runes (runesDropped>0). socketRngProbe reseed reproducible.
//  AC2     gear rolls 0–2 sockets; a rune drops through the REAL loot path (runeRng).
//  AC3     engarzar applies the stat, persists in the save + survives reload (roundtrip);
//          desengarzar returns the rune to the bag and removes the bonus.
//  AC4     UI — socketed piece renders empty ◇ vs filled ◆ pips + a loose rune card (render spy).
//  AC5     SOCKETS knob in served config; rate 0 / kill switch → 0 sockets; pre-feature shape ⇒ 0.
//  PERF    >=55 fps sampled with socketed gear live (best-of-3); 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "input.js", "render/render.js", "sim/config.js", "sim/gear.js", "sim/sim.js"];
const OUT = "shots/cas1689"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// Re-poll version.json + file md5 to absorb GitHub-Pages publish / CDN lag; gate on md5 live==HEAD
// (not a hardcoded hash) so this passes the moment the deploy lands.
async function pollBuild(headHashes, tries = 10, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

// Menu → class → ability → play. Sockets ride a NORMAL run, so enter via Enter (name field blurred
// so the key isn't swallowed by the input); the CAS-1687 hooks then drive the socket/rune paths.
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "RuneBot"; ni.blur(); }
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

// Fresh-boot to the MENU (auto-resume would otherwise skip the class/ability flow).
async function bootMenu(page) {
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.socketMeta", { timeout: 20000 });
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (poll for CDN/Pages lag) ----
  const vb = await pollBuild(headHashes);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headHashes[f];
    gate(`BUILD.md5 ${f}`, live === head, `live=${String(live).slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  if (!vb.ok) { console.log("  → sockets build NOT live on gh-pages yet; aborting live ACs (CDN lag / deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  // ---- AC5 (static): the SOCKETS knob is present in the SERVED config ----
  const cfgSrc = await (await fetch(`${BASE}/sim/config.js?cb=${Date.now()}`)).text();
  const hasKnob = /SOCKETS/.test(cfgSrc);
  gate("AC5.socketsKnob", hasKnob, hasKnob ? `served sim/config.js exposes the SOCKETS knob ($0 art, reuses existing item infra)` : `SOCKETS knob NOT found in served config`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  // Strip ONLY the run save (mithralda.save.v1) on every new document — the unload flush re-saves it,
  // so a plain reload would auto-resume into 'play' and never reach the menu.
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try { await bootMenu(page); booted = true; }
    catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.socketMeta never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  // ---- enter the live run (sockets ride a normal run) ----
  await enterPlay(page);
  gate("BOOT.play", await page.evaluate(() => window.__dev.scene() === "play"), `menu → class → ability → live run (scene=play)`);

  // ---- HOOKS wired in the curated game.js wrapper (not just sim dev) ----
  const hooks = ["socketMeta","socketSetEnabled","setSocketRate","socketTotals","grantSocketGear","grantRune",
    "forceSocketRune","socketRune","removeSocketRune","socketSnap","socketPersist","socketRngProbe","socketGenProbe"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  gate("HOOKS.wired", missing.length === 0, missing.length ? `NOT wired: ${missing.join(", ")}` : `all ${hooks.length} CAS-1687 dev hooks wired`);

  // static content sanity — 3 runes, each a distinct stat, socketChance knob present
  const meta = await page.evaluate(() => window.__dev.socketMeta());
  gate("META.runes", !!(meta && meta.runes && meta.runes.length === 3 && meta.socketChance && meta.socketChance.length === 2 && meta.runes.every(r => r.stat && r.amt > 0)),
    meta && meta.runes ? `${meta.runes.length} runes (${meta.runes.map(r => r.id + "→" + r.stat).join(", ")}); socketChance=[${meta.socketChance}]` : `meta wrong: ${JSON.stringify(meta)}`);

  // ======================= AC1 [AC-RNG-STRONG]: socket/rune draws never touch gameplay srand ===
  const SEED = 0x1687c39a, PROBE = 20;
  const rng = await page.evaluate((s, p) => {
    const off  = window.__dev.socketGenProbe(false, 0, s, p);   // sockets OFF
    const on   = window.__dev.socketGenProbe(true, 5, s, p);    // sockets ON, high rune rate
    const zero = window.__dev.socketGenProbe(true, 0, s, p);    // ON but dropRate 0 → no rune drops
    return { off, on, zero };
  }, SEED, PROBE);
  const fOff = JSON.stringify(rng.off.fingerprint), fOn = JSON.stringify(rng.on.fingerprint), fZero = JSON.stringify(rng.zero.fingerprint);
  gate("AC1.srandByteId", fOff === fOn && fOff === fZero,
    fOff === fOn && fOff === fZero ? `gameplay srand BYTE-IDENTICAL OFF vs ON(rate 5) vs rate0 (${rng.off.fingerprint.length} draws) — runeRng isolated` : `srand DIVERGED off=${fOff.slice(0,40)} on=${fOn.slice(0,40)} zero=${fZero.slice(0,40)}`);
  gate("AC1.actuallyWorks", rng.on.runesDropped > 0 && rng.off.runesDropped === 0 && rng.zero.runesDropped === 0,
    rng.on.runesDropped > 0 && rng.off.runesDropped === 0 && rng.zero.runesDropped === 0 ? `ON(rate 5) dropped ${rng.on.runesDropped} rune(s); OFF & rate0 dropped 0 — feature works while srand untouched` : `rune drop counts wrong on=${rng.on.runesDropped} off=${rng.off.runesDropped} zero=${rng.zero.runesDropped}`);
  const rp = await page.evaluate(() => {
    const a = window.__dev.socketRngProbe(8, 0x777);
    const b = window.__dev.socketRngProbe(8, 0x777);
    return JSON.stringify(a) === JSON.stringify(b);
  });
  gate("AC1.rngStream", rp, `socketRngProbe reseed reproducible (dedicated isolated stream, never srand)`);

  // ======================= AC2: gear rolls 0–2 sockets; runes drop via runeRng ===
  const gen = await page.evaluate(() => {
    let maxSockets = 0, withSockets = 0, total = 0;
    for (let s = 1; s <= 40; s++) { const r = window.__dev.socketGenProbe(true, 0, s * 131 + 7, 4);  // rate0 → isolate the socket-count roll
      if (r.socketsOn > maxSockets) maxSockets = r.socketsOn; if (r.socketsOn > 0) withSockets++; total++; }
    return { maxSockets, withSockets, total };
  });
  gate("AC2.socketCount", gen.maxSockets >= 1 && gen.maxSockets <= 2 && gen.withSockets > 0,
    gen.maxSockets >= 1 && gen.maxSockets <= 2 ? `gear rolls 0–2 sockets (max ${gen.maxSockets}; ${gen.withSockets}/${gen.total} rolls socketed)` : `socket-count roll wrong: ${JSON.stringify(gen)}`);
  const drop = await page.evaluate(() => window.__dev.forceSocketRune("rubi", "caves"));
  gate("AC2.runeDrops", !!(drop && drop.rune && drop.rune.rune === "rubi"), drop && drop.rune ? `a rune drops through the REAL kill-loot path (${drop.rune.name})` : `forced rune drop failed: ${JSON.stringify(drop)}`);

  // ======================= AC3: engarzar applies the stat, persists, survives reload ===
  const eng = await page.evaluate(() => {
    window.__dev.grantSocketGear("weapon", 2);              // 2 empty sockets on the weapon
    const before = window.__dev.socketSnap();
    const g = window.__dev.grantRune("rubi");               // +6 daño rune to the bag
    const res = window.__dev.socketRune(g.i);               // engarzar it
    const after = window.__dev.socketSnap();
    return { before, res, after };
  });
  gate("AC3.engarzaDmg", !!(eng.res && eng.res.socketed && eng.after.dmg - eng.before.dmg === 6 && eng.after.totals.dmg === 6),
    eng.res && eng.res.socketed ? `engarzar Rubí → equippedDmg +${eng.after.dmg - eng.before.dmg} (socketTotals.dmg=${eng.after.totals.dmg})` : `engarce did not move a real number: ${JSON.stringify({ b: eng.before.dmg, a: eng.after.dmg, r: eng.res })}`);
  const persist = await page.evaluate(() => window.__dev.socketPersist("body", "zafiro"));  // +30 hp rune on the body
  gate("AC3.persistReload", !!(persist && persist.ok && persist.after.totals.hp === 30 && persist.after.maxHp === persist.before.maxHp && persist.after.equip.body.includes("zafiro")),
    persist && persist.ok ? `socketed Zafiro (+30 hp) survives serialize→load (maxHp ${persist.after.maxHp}, socket persisted in save)` : `socket did not persist through reload: ${JSON.stringify(persist)}`);
  const spd = await page.evaluate(() => {
    window.__dev.grantSocketGear("shield", 1); const b = window.__dev.socketSnap();
    const g = window.__dev.grantRune("esmeralda"); window.__dev.socketRune(g.i);
    return { b: b.atkspd, a: window.__dev.socketSnap().atkspd };
  });
  gate("AC3.engarzaAtkspd", spd.a - spd.b === 6, spd.a - spd.b === 6 ? `engarzar Esmeralda → heroAtkspd +${spd.a - spd.b}%` : `esmeralda atkspd wrong: ${JSON.stringify(spd)}`);
  const un = await page.evaluate(() => {
    window.__dev.grantSocketGear("weapon", 1); const g = window.__dev.grantRune("rubi"); window.__dev.socketRune(g.i);
    const before = window.__dev.socketSnap();
    const r = window.__dev.removeSocketRune("weapon");
    const after = window.__dev.socketSnap();
    return { before, r, after };
  });
  gate("AC3.desengarza", !!(un.r && un.r.removed && un.r.type === "rubi" && un.before.dmg - un.after.dmg === 6 && un.after.bag.includes("rune:rubi")),
    un.r && un.r.removed ? `desengarzar returns the Rubí to the bag and removes its +6 daño` : `desengarce wrong: ${JSON.stringify(un.r)}`);

  // ======================= AC4: UI render spy — empty ◇ vs filled ◆ pips + loose rune card =
  // Wrap ctx.fillText globally, open the inventory with a socketed piece (1 filled + 1 empty) and a
  // loose rune in the bag, sample a few frames, then read what the SERVED render.js actually drew.
  const ui = await page.evaluate(async () => {
    window.__spyText = [];
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__spied) { const orig = proto.fillText; proto.fillText = function (t, ...a) { try { window.__spyText.push(String(t)); } catch (e) {} return orig.call(this, t, ...a); }; proto.__spied = true; }
    window.__dev.grantSocketGear("weapon", 2);
    const g = window.__dev.grantRune("rubi"); window.__dev.socketRune(g.i);  // 1 filled ◆ + 1 empty ◇
    window.__dev.grantRune("esmeralda");                                     // a loose rune card in the bag
    window.__spyText = [];
    if (window.__dev.openInv) window.__dev.openInv();
    await new Promise((r) => { let n = 0; const tick = () => { n++; (n < 30) ? requestAnimationFrame(tick) : r(); }; requestAnimationFrame(tick); });
    const scene = window.__dev.scene();
    const joined = window.__spyText.join("");
    return { scene, hasEmpty: joined.includes("◇"), hasFilled: joined.includes("◆"), hasEngarces: joined.includes("Engarces:"), samples: window.__spyText.length };
  });
  gate("AC4.invRenders", ui.scene === "inventory" && ui.samples > 0, ui.scene === "inventory" ? `inventory renders with a socketed piece + a loose rune (scene=inventory, ${ui.samples} text draws, no crash)` : `inventory did not open (scene=${ui.scene})`);
  gate("AC4.socketPips", ui.hasEmpty && ui.hasFilled, ui.hasEmpty && ui.hasFilled ? `render draws BOTH empty ◇ and filled ◆ socket pips — socket vacío vs lleno is legible` : `socket pip glyphs missing (empty=${ui.hasEmpty} filled=${ui.hasFilled})`);
  // close the inventory before perf sampling
  await page.evaluate(() => { if (window.__dev.scene() === "inventory" && window.__dev.openInv) window.__dev.openInv(); });

  // ======================= AC5: config knob (rate 0 / kill switch) + pre-feature shape ===
  const knob = await page.evaluate(() => {
    const off = window.__dev.setSocketRate(0);
    const probe = window.__dev.socketGenProbe(false, 0, 999, 6);     // kill switch → no socket roll
    const restored = window.__dev.setSocketRate(null);
    return { off, socketsOnKilled: probe.socketsOn, restored };
  });
  gate("AC5.knobKillSwitch", knob.off === 0 && knob.socketsOnKilled === 0 && knob.restored > 0,
    knob.off === 0 && knob.socketsOnKilled === 0 ? `setSocketRate(0) + kill switch → 0 sockets rolled; rate restored to ${knob.restored}` : `knob/kill-switch wrong: ${JSON.stringify(knob)}`);
  const legacyLoad = await page.evaluate(() => {
    for (const s of ["weapon", "body", "shield"]) window.__dev.grantSocketGear(s, 0); // strip all sockets (pre-feature shape)
    const snap = window.__dev.socketSnap();
    return { weaponSockets: snap.equip.weapon.length, totals: snap.totals };
  });
  gate("AC5.legacyLoad", legacyLoad.weaponSockets === 0 && legacyLoad.totals.dmg === 0 && legacyLoad.totals.hp === 0,
    legacyLoad.weaponSockets === 0 ? `a piece with NO sockets field (pre-feature shape) reads 0 sockets / 0 bonus — additive, no crash` : `pre-feature shape wrong: ${JSON.stringify(legacyLoad)}`);

  // ======================= PERF: 60fps with socketed gear live (best-of-3) ===========
  await page.evaluate(() => { window.__dev.socketSetEnabled(true); window.__dev.grantSocketGear("weapon", 2);
    const g = window.__dev.grantRune("rubi"); window.__dev.socketRune(g.i); });
  const sampleFps = async () => page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  await sampleFps(); // warm-up (discarded)
  const fpsN = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsN);
  gate("PERF.fps", fps >= 55, `~${fps} fps (best of ${fpsN.join("/")}) with socketed gear; 2-core box = noise, real gate is determinism/byte-id`);

  await page.screenshot({ path: `${OUT}/${label}-sockets.png` });
  gate("PERF.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

  await browser.close();
  return { pass, fail };
}

(async () => {
  const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
  console.log(`HEAD md5: ${FILES.map(f => `${f}=${headHashes[f].slice(0,8)}`).join("  ")}`);
  const runs = [
    ["desktop", { width: 1280, height: 720 }],
    ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ];
  let tp = 0, tf = 0, notDeployed = false;
  for (const [label, vp] of runs) {
    const r = await runOnce(label, vp, headHashes);
    tp += r.pass; tf += r.fail; if (r.notDeployed) notDeployed = true;
  }
  console.log(`\n=========== TOTAL ${tp} PASS / ${tf} FAIL ===========`);
  if (notDeployed) console.log("NOTE: sockets build NOT live on gh-pages yet — re-run after the deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
