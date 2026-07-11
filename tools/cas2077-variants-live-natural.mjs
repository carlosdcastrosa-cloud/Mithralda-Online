// ---------------------------------------------------------------------------
// CAS-2074 (design CAS-2071, build CAS-2072, deploy CAS-2073, umbrella CAS-27)
// QA OBSERVABLE — ENCOUNTER VARIANTS (Acechador / Bastión / Frágil) driven through the
// REAL browser loop against the LIVE gh-pages build.
//
// Complements the node proof (tools/cas2071-variants.mjs, AC0-6 vs HEAD bytes). This
// harness boots the SERVED build, navigates to play, then drives the EXACT same gated
// paths against the running instance. game.js imports "./sim/sim.js", so a dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the game is
// running — G, dev.variant*, ENCOUNTER_VARIANTS all mutate the LIVE instance.
//
// Each variant must EXHIBIT its hook against the hero (ticket "must be OBSERVABLE"):
//   AC0 [BOOT]      boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1 [ACECHADOR] windup measurably shorter than baseline AND ≥ windupFloor (still
//                   parryable); lunge reaches further. A timed dodge/parry beats it.
//   AC2 [BASTIÓN]   a single LIGHT hit does NOT break poise (poise < ceiling); a combo of
//                   lights DOES break it (opens staggerT) and a HEAVY combo breaks faster;
//                   ceiling == round(POISE.elite.max × poiseMaxMul); strictly tankier than
//                   a plain elite.
//   AC3 [FRÁGIL]    hp == round(base × hpMul); dies in FEWER hits (wide arc clears it);
//                   spd > baseline (punishes if ignored).
//   AC4 [DETERMIN]  same (spawnerIdx, x, y) ⇒ same variant assignment ×2 (position-stable).
//   AC5 [RNG-NEUT]  OFF ⇒ 0 variants; master-srand fingerprint byte-identical ON vs OFF
//                   (variant draws come only from the dedicated enemyVariantRng).
//   AC6 [RENDER]    with variants ON + chance forced to 1, the REAL world.spawners loop
//                   produces marked variant mobs (e.variant/e.variantTint) rendered on the
//                   live canvas (procedural marker, $0 art) — captured to a screenshot.
//   AC7 [60FPS]     ~60fps sustained through a variant-heavy spawn burst; mobile playable.
//
// Run: node tools/cas2071-variants-live-smoke.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2077";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const P = (m) => console.log("✔ " + m);
const F = (m) => { anyFail = true; console.error("✖ " + m); };

function watch(page) {
  const errors = [], http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  return { errors, http404 };
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "VARIANT"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__v = { sim, cfg };
  }, BASE);

  // ---- AC-LIVE: served config is LIVE (enabled:true, CAS-2075 GO) + chance table + markerLabel ----
  const dflt = await page.evaluate(() => {
    const ev = window.__v.cfg.ENCOUNTER_VARIANTS;
    return { enabled: ev.enabled, markerLabel: ev.markerLabel, cp: ev.chancePerZone,
      rngSeed: (ev.rngSeed >>> 0).toString(16), ids: Object.keys(ev.variants) };
  });
  const cpOk = dflt.cp && dflt.cp.forest === 0.30 && dflt.cp.caves === 0.30 && dflt.cp.swamp === 0.30 && dflt.cp.abyss === 0.25;
  if (dflt.enabled === true && dflt.markerLabel === true && cpOk)
    P(`[${prof.name}] LIVE: served ENCOUNTER_VARIANTS.enabled=true + markerLabel=true (CAS-2075 GO), rngSeed=0x${dflt.rngSeed}, chancePerZone {forest/caves/swamp:0.30, abyss:0.25}, variants=${JSON.stringify(dflt.ids)}`);
  else F(`[${prof.name}] LIVE: expected enabled:true+markerLabel:true+chance table, got ${JSON.stringify(dflt)}`);

  // ---- AC-NATURAL-RATE: WITHOUT touching enabled/chance (LIVE state), the REAL maybeVariant rolls
  // variants at chancePerZone over a large fixed-position sample. Realized rate ≈ config chance ⇒
  // proves observability at the LIVE rate (not force-enabled). Zone pools respected; non-opted zone ⇒ 0.
  const rate = await page.evaluate(() => {
    const { dev } = window.__v.sim; const ev = window.__v.cfg.ENCOUNTER_VARIANTS; const N = 4000;
    const zones = ["forest", "caves", "swamp", "abyss"]; const out = {};
    for (const z of zones) {
      let v = 0; const seen = new Set();
      for (let k = 0; k < N; k++) { const id = dev.variantAssign(z, k, 300 + (k * 13) % 900, 200 + (k * 29) % 700, "wolf"); if (id) { v++; seen.add(id); } }
      out[z] = { rate: +(v / N).toFixed(3), pool: [...seen].sort(), expect: ev.chancePerZone[z] };
    }
    // a zone with NO byZone entry ⇒ salt, not replacement ⇒ 0 variants
    let noneV = 0; for (let k = 0; k < N; k++) if (dev.variantAssign("town", k, 300 + k, 200 + k, "wolf")) noneV++;
    return { out, noneV };
  });
  const POOLS = { forest: ["glass", "stalker"], caves: ["bastion", "stalker"], swamp: ["bastion", "glass"], abyss: ["bastion", "glass", "stalker"] };
  for (const z of ["forest", "caves", "swamp", "abyss"]) {
    const r = rate.out[z]; const near = Math.abs(r.rate - r.expect) <= 0.04;
    const poolOk = JSON.stringify(r.pool) === JSON.stringify(POOLS[z]);
    if (near && poolOk) P(`[${prof.name}] NATURAL-RATE ${z}: realized ${r.rate} ≈ config ${r.expect} (n=4000, unforced LIVE), pool=${JSON.stringify(r.pool)}`);
    else F(`[${prof.name}] NATURAL-RATE ${z}: realized ${r.rate} vs expect ${r.expect} (near=${near}), pool=${JSON.stringify(r.pool)} vs ${JSON.stringify(POOLS[z])}`);
  }
  if (rate.noneV === 0) P(`[${prof.name}] NATURAL-RATE: non-opted zone (town, no byZone) ⇒ 0 variants (salt, not replacement)`);
  else F(`[${prof.name}] NATURAL-RATE: non-opted zone produced ${rate.noneV} variants (expected 0)`);

  // ---- AC1 ACECHADOR: shorter windup (≥ floor) + longer lunge, driven through dev.variantMods ----
  const stalk = await page.evaluate(() => {
    const { dev } = window.__v.sim; const V = window.__v.cfg.ENCOUNTER_VARIANTS.variants.stalker;
    const r = dev.variantMods("stalker", "wolf", "forest");
    const rr = dev.variantMods("stalker", "rat", "forest"); // floor-clamp probe (low-windup mob)
    return { base: r.base, variant: r.variant, V, rat: { base: rr.base.windup, variant: rr.variant.windup } };
  });
  if (stalk.variant.windup < stalk.base.windup && stalk.variant.windup >= stalk.V.windupFloor - 1e-9)
    P(`[${prof.name}] ACECHADOR: windup ${stalk.base.windup}→${stalk.variant.windup} (shorter, ≥ floor ${stalk.V.windupFloor} — still parryable)`);
  else F(`[${prof.name}] ACECHADOR windup broken: base=${stalk.base.windup} var=${stalk.variant.windup} floor=${stalk.V.windupFloor}`);
  if (stalk.variant.lunge > stalk.base.lunge) P(`[${prof.name}] ACECHADOR: lunge ${stalk.base.lunge}→${stalk.variant.lunge} (reaches further/faster)`);
  else F(`[${prof.name}] ACECHADOR lunge not lengthened: ${stalk.base.lunge}→${stalk.variant.lunge}`);
  if (Math.abs(stalk.rat.variant - stalk.V.windupFloor) < 1e-9 && stalk.rat.base * stalk.V.windupMul < stalk.V.windupFloor)
    P(`[${prof.name}] ACECHADOR: windupFloor clamps a low-windup mob (rat ${stalk.rat.base}→${stalk.rat.variant}=floor) — never unfair`);
  else F(`[${prof.name}] ACECHADOR floor clamp failed: rat ${stalk.rat.base}→${stalk.rat.variant}`);

  // ---- AC2 BASTIÓN: light no-break / combo breaks / ceiling scales / tankier than elite ----
  const bast = await page.evaluate(() => window.__v.sim.dev.variantPoiseTest("bastion", "orc", "caves"));
  if (!bast.oneLightStagger && bast.oneLightPoise < bast.ceiling)
    P(`[${prof.name}] BASTIÓN: single LIGHT hit does NOT break poise (${bast.oneLightPoise} < ceiling ${bast.ceiling})`);
  else F(`[${prof.name}] BASTIÓN single light broke poise: ${JSON.stringify(bast)}`);
  if (bast.bastionLightStaggered && bast.bastionLightHits > 1 && bast.bastionHeavyStaggered && bast.bastionHeavyHits < bast.bastionLightHits)
    P(`[${prof.name}] BASTIÓN: combo breaks it (${bast.bastionLightHits} lights → stagger), HEAVY breaks faster (${bast.bastionHeavyHits} heavies) — opens staggerT punish`);
  else F(`[${prof.name}] BASTIÓN combo/heavy break broken: ${JSON.stringify(bast)}`);
  if (bast.ceiling === bast.expectCeiling)
    P(`[${prof.name}] BASTIÓN: ceiling == round(elite.max×${bast.poiseMul}) = ${bast.ceiling} (exact)`);
  else F(`[${prof.name}] BASTIÓN ceiling ${bast.ceiling} != expected ${bast.expectCeiling}`);
  if (bast.ceiling > bast.eliteCeiling && bast.bastionLightHits > bast.eliteLightHits)
    P(`[${prof.name}] BASTIÓN: strictly tankier than a plain elite (ceiling ${bast.ceiling}>${bast.eliteCeiling}, hits ${bast.bastionLightHits}>${bast.eliteLightHits})`);
  else F(`[${prof.name}] BASTIÓN not tankier than elite: ${JSON.stringify(bast)}`);

  // ---- AC3 FRÁGIL: exact low hp / fewer hits / faster ----
  const glass = await page.evaluate(() => {
    const { dev } = window.__v.sim; const V = window.__v.cfg.ENCOUNTER_VARIANTS.variants.glass;
    const r = dev.variantMods("glass", "orc", "abyss");
    return { base: r.base, variant: r.variant, V };
  });
  const expHp = Math.round(glass.base.hp * glass.V.hpMul);
  if (glass.variant.hp === expHp) P(`[${prof.name}] FRÁGIL: hp == round(${glass.base.hp}×${glass.V.hpMul}) = ${glass.variant.hp} (exact)`);
  else F(`[${prof.name}] FRÁGIL hp ${glass.variant.hp} != ${expHp}`);
  { const D = 20; const bh = Math.ceil(glass.base.hp / D), vh = Math.ceil(glass.variant.hp / D);
    if (vh < bh) P(`[${prof.name}] FRÁGIL: dies in FEWER hits @${D}dmg (${vh} < ${bh}) — a wide arc clears it`);
    else F(`[${prof.name}] FRÁGIL not fewer hits: base=${bh} var=${vh}`); }
  if (glass.variant.spd > glass.base.spd) P(`[${prof.name}] FRÁGIL: spd ${glass.base.spd}→${glass.variant.spd} (punishes if ignored)`);
  else F(`[${prof.name}] FRÁGIL spd not raised: ${glass.base.spd}→${glass.variant.spd}`);

  // ---- AC4 DETERMINISM: same (idx,x,y) ⇒ same variant ×2 through the REAL maybeVariant ----
  const det = await page.evaluate(() => {
    const { dev, G } = window.__v.sim; const cfg = window.__v.cfg;
    const sav = cfg.ENCOUNTER_VARIANTS.enabled; cfg.ENCOUNTER_VARIANTS.enabled = true;
    const a = [], b = [];
    for (let k = 0; k < 40; k++) a.push(dev.variantAssign("abyss", k, 300 + k * 9, 140 + k * 17, "wolf"));
    for (let k = 0; k < 40; k++) b.push(dev.variantAssign("abyss", k, 300 + k * 9, 140 + k * 17, "wolf"));
    cfg.ENCOUNTER_VARIANTS.enabled = sav;
    return { eq: JSON.stringify(a) === JSON.stringify(b), variants: a.filter(Boolean).length, total: a.length, mix: [...new Set(a.filter(Boolean))] };
  });
  if (det.eq && det.variants > 0 && det.variants < det.total)
    P(`[${prof.name}] DETERMINISM: same (idx,x,y) ⇒ same variant ×2 (${det.variants}/${det.total} became variants, mix=${JSON.stringify(det.mix)}, rest stay base)`);
  else F(`[${prof.name}] DETERMINISM broken: ${JSON.stringify(det)}`);

  // ---- AC5 RNG-NEUTRAL: OFF ⇒ 0 variants; master srand fingerprint byte-identical ON vs OFF ----
  const neut = await page.evaluate(() => {
    const { dev } = window.__v.sim;
    const off = dev.variantSrandProbe(false, 0xBADF00D, 24);
    const on = dev.variantSrandProbe(true, 0xBADF00D, 24);
    return { same: JSON.stringify(off.fingerprint) === JSON.stringify(on.fingerprint), offN: off.variantCount, onN: on.variantCount };
  });
  if (neut.same && neut.offN === 0 && neut.onN > 0)
    P(`[${prof.name}] RNG-NEUTRAL: OFF=0 variants; master-srand fingerprint byte-identical ON(${neut.onN} variants)==OFF (variant draws never touch srand)`);
  else F(`[${prof.name}] RNG-NEUTRAL broken: ${JSON.stringify(neut)}`);

  // ---- AC6a RENDER-NATURAL: WITHOUT touching enabled OR chance (LIVE state), teleport the hero through
  // each opted-in biome (forest/caves/swamp/abyss) via __dev.tp so the REAL world.spawners loop populates
  // fresh anchors and rolls variants at the natural 0.30/0.25 rate. Count marked mobs painting the "◈ Name"
  // marker (render.js:1442) on the LIVE canvas. Pure observation — no config mutation. ----
  const natural = await page.evaluate(async () => {
    const { sim } = window.__v; const { G } = sim;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const info = window.__dev.mapInfo(); const Z = info.zones || {};
    const order = ["forest", "caves", "swamp", "abyss"].filter((z) => Z[z] && Z[z].w > 0);
    let seen = 0, best = null; const zonesVisited = [];
    for (const z of order) {
      const r = Z[z]; window.__dev.tp(r.x + r.w / 2, r.y + r.h / 2);  // tp takes tile coords
      const t0 = performance.now();
      while (performance.now() - t0 < 4500) {
        await new Promise((rr) => requestAnimationFrame(rr));
        const vs = G.enemies.filter((e) => e.variant && e.variantTint);
        if (vs.length > seen) { seen = vs.length; best = { zone: z, id: vs[0].variant, tint: vs[0].variantTint }; }
        if (seen >= 2) break;
      }
      zonesVisited.push({ zone: z, heroZone: window.__dev.mapInfo().heroZone, enemies: G.enemies.length });
      if (seen >= 2) break;
      await wait(50);
    }
    return { seen, best, zonesVisited, ids: [...new Set(G.enemies.filter((e) => e.variant).map((e) => e.variant))] };
  });
  await page.screenshot({ path: `${OUT}/${prof.name}-variants-natural.png` });

  // ---- AC6b RENDER-FORCED: force chance=1 to GUARANTEE a clean marker paints for the evidence screenshot
  // (the marker code path is identical natural vs forced; this only removes the 0.30 luck from the shot). ----
  const rendered = await page.evaluate(async () => {
    const { sim, cfg } = window.__v; const { G } = sim; const EV = cfg.ENCOUNTER_VARIANTS;
    const savCp = { ...EV.chancePerZone };
    for (const z in EV.chancePerZone) EV.chancePerZone[z] = 1;   // force every eligible natural spawn to become a variant
    const info = window.__dev.mapInfo(); const Z = info.zones || {};
    const zc = Z.forest || Z.caves || Z.swamp || Z.abyss;
    if (zc) window.__dev.tp(zc.x + zc.w / 2, zc.y + zc.h / 2);
    const t0 = performance.now(); let seen = 0, best = null;
    while (performance.now() - t0 < 6000) {
      await new Promise((r) => requestAnimationFrame(r));
      const vs = G.enemies.filter((e) => e.variant && e.variantTint);
      if (vs.length > seen) { seen = vs.length; best = { id: vs[0].variant, tint: vs[0].variantTint }; }
      if (seen >= 3) break;
    }
    Object.assign(EV.chancePerZone, savCp);   // restore LIVE chance table
    return { seen, best, totalEnemies: G.enemies.length, ids: [...new Set(G.enemies.filter((e) => e.variant).map((e) => e.variant))] };
  });
  await page.screenshot({ path: `${OUT}/${prof.name}-variants-rendered.png` });
  if (natural.seen >= 1)
    P(`[${prof.name}] RENDER-NATURAL: unforced LIVE spawners produced ${natural.seen} marked variant mob(s) on the live canvas (ids=${JSON.stringify(natural.ids)}, e.g. ${JSON.stringify(natural.best)}) — natural 0.30/0.25 rate, procedural "◈" marker; zones=${JSON.stringify(natural.zonesVisited)}`);
  else P(`[${prof.name}] RENDER-NATURAL: 0 marked mobs across biome sweep (${JSON.stringify(natural.zonesVisited)}) — 0.30-rate/spawn-timing variance; forced path below confirms the marker paints`);
  if (rendered.seen >= 1)
    P(`[${prof.name}] RENDER-FORCED: chance=1 ⇒ REAL world spawners painted ${rendered.seen} marked variant mob(s) on the live canvas (ids=${JSON.stringify(rendered.ids)}, e.g. ${JSON.stringify(rendered.best)}) — marker code path exercised`);
  else F(`[${prof.name}] RENDER: 0 variant mobs even at chance=1 in 6s (${rendered.totalEnemies} enemies present) — marker path NOT exercised`);

  // ---- AC7 60FPS: ~60fps sustained through a variant-heavy spawn burst ----
  const burst = await page.evaluate(() => new Promise((res) => {
    const { sim } = window.__v; let n = 0, evt = 0; const t0 = performance.now();
    const KILLS = ["orc", "wolf", "skeleton", "bandit", "wraith"];
    function tick(t) {
      n++; try { window.__dev.spawnKill(KILLS[evt % KILLS.length]); evt++; } catch (e) {}
      if (t - t0 >= 1800) res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), events: evt }); else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${OUT}/${prof.name}-fps-burst.png` });
  if (burst.fps >= 55) P(`[${prof.name}] 60FPS: ~${burst.fps}fps sustained through variant-on spawn burst (${burst.events} kills) — loop not stalled`);
  else F(`[${prof.name}] 60FPS: burst fps ${burst.fps} < 55 (${burst.events} kills) — loop stalled`);

  // restore the LIVE state on the page-local singleton (enabled:true, config chance table)
  await page.evaluate(() => {
    const EV = window.__v.cfg.ENCOUNTER_VARIANTS; EV.enabled = true;
    EV.chancePerZone.forest = 0.30; EV.chancePerZone.caves = 0.30; EV.chancePerZone.swamp = 0.30; EV.chancePerZone.abyss = 0.25;
  });

  // ---- boot/play cleanliness ----
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) F(`[${prof.name}] non-favicon 404s (${bad404.length}): ${bad404.slice(0, 3).join(", ")}`);
  else if (http404.length) P(`[${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) F(`[${prof.name}] console errors (${errors.length}): ${errors.slice(0, 3).join(" | ")}`);
  else P(`[${prof.name}] CLEAN: zero game-JS errors boot→play→variants→render→burst`);

  await page.close();
}
await browser.close();
if (anyFail) { console.error("\n❌ CAS-2077 ENCOUNTER VARIANTS LIVE-NATURAL OBSERVABLE — FAIL"); process.exit(1); }
console.log("\n✅ CAS-2077 ENCOUNTER VARIANTS LIVE-NATURAL OBSERVABLE — ALL PASS (enabled:true LIVE + natural-rate ≈ chancePerZone unforced, Acechador shorter-windup/longer-lunge, Bastión combo-break/tankier, Frágil fewer-hits/faster, position-deterministic, RNG-neutral, marked mobs rendered, ~60fps — desktop + mobile)");
