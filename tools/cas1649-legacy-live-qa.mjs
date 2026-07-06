// ===========================================================================
// CAS-1650 — LIVE QA: Meta-progresión v3 "Nodos de Legado" (verifies CAS-1649)
// on the canonical gh-pages build. Runs PASS x2 (desktop + mobile).
//
//   node tools/cas1649-legacy-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1649 (sim/input/render/game, additive + RNG-neutral): on each Ascensión the
// player picks ONE permanent Legado from a 5-node pool (LEGACY_NODES). Legacies
// SURVIVE the altar sacrifice (ascendMeta never touches m.legacyNodes) and ACCUMULATE
// across ascensions — they sit ON TOP of the linear ascMult. Each node reuses an
// EXISTING deterministic sim lever gated on legacyCount>0, so 0 legacies → every hook
// is a no-op → the shared-srand loot stream is byte-identical (AC6, the CAS-1638/1645
// [AC-RNG-STRONG] pattern). Persists as a flat key array; `v` stays 2 (v1/v2 blobs
// without the key migrate to []).
//
// Effects (all gated on legacyCount>0):
//   leg_vigia (oneTime)  El Tier-2 del altar arranca desbloqueado (t2Unlocked)
//   leg_avaro            +1 reroll de boon por run (applyMetaReroll)
//   leg_superviviente    +1 poción de vida y +1 de maná por run (newHero consum)
//   leg_cazador          +10% daño vs élites/campeones (0% a normal) (hitEnemy)
//   leg_erudito          +50% Esencia en el payout del run (essenceForRun)
//
// window/dev hooks used (all route to the SAME served sim module):
//   __metaReset / __meta / __metaBuy / __metaAscend  — altar + prestige
//   __metaLegacy / __legacyPool / __legacyChoose      — legacy codex/pool/grant
//   __dev.metaGrant / dmgVsTarget / championKill / consumState / draftCharges / seed / dropStream
//   injected {serializeMeta, loadMeta, createHero} from the served sim.js (module cache = same instance)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD  version.json==f67129f00d14 (re-poll for CDN lag); served 4 game files md5 == HEAD.
//  AC1    tras un ascend real, se presentan >=5 legacyChoices y chooseLegacy otorga permanente.
//  AC2    persistencia (serializeMeta.legacyNodes + localStorage) + round-trip loadMeta +
//         supervivencia al sacrificio (ascendMeta NO borra) + acumula entre 2 ascensiones.
//  AC3    los 5 efectos reales via los hooks: Vigía, Avaro, Superviviente, Cazador, Erudito.
//  AC4    blob v1/v2 sin legacyNodes -> [], `v` sigue 2.
//  AC5    ascMult lineal intacto (1+0.25*level); los legados van ENCIMA.
//  AC6    [AC-RNG-STRONG] dropStream byte-idéntico 0 vs 5 legados; la elección NO consume RNG.
//  PERF   0 JS errors (favicon 404 ignored); >=55 fps sampled EARLY on clean state.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const EXPECT_BUILD = "f67129f00d14";               // gh-pages build stamp (SRC commit b8128d5)
const FILES = ["sim/sim.js", "input.js", "render/render.js", "game.js"];
const OUT = "shots/cas1650"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// Re-poll version.json to absorb GitHub-Pages publish / CDN lag before concluding "not deployed".
async function pollBuild(tries = 8, gap = 4000) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try { const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); last = v.build;
      if (v.build === EXPECT_BUILD) return { build: v.build, ok: true, tries: i + 1 }; } catch {}
    await wait(gap);
  }
  return { build: last, ok: false, tries };
}

async function runOnce(label, viewport) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  // favicon 404 is cosmetic; only count NON-favicon 404s as errors.
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) errs.push("http404: " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  // ---- BUILD gate: served version + md5 parity vs HEAD ----------------------
  const vb = await pollBuild();
  gate("BUILD.ver", vb.ok, `served build=${vb.build} expect=${EXPECT_BUILD} (polled ${vb.tries})`);
  for (const f of FILES) {
    const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
    const head = headMd5(f);
    gate(`BUILD.md5 ${f}`, live === head, `live=${live.slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }

  // ---- boot: menu -> classsel -> abilitysel -> play ------------------------
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => { try { localStorage.clear(); } catch {} });   // dodge save auto-resume -> reach the menu
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__meta", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev/__meta never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1650";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1"); // warrior
  }
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(200); await key("Enter"); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });

  // inject the SERVED sim.js exports needed for meta persistence / hero re-start
  await page.addScriptTag({ type: "module", content:
    `import {G, serializeMeta, loadMeta, createHero, metaSnap} from "${BASE}/sim/sim.js";
     window.__G=G; window.__serMeta=serializeMeta; window.__loadMeta=loadMeta;
     window.__createHero=createHero; window.__metaSnapEx=metaSnap;` });
  await page.waitForFunction("window.__G && window.__serMeta && window.__loadMeta && window.__createHero", { timeout: 10000 });
  await wait(300);

  // ---- PERF (sampled EARLY, clean state, before any spawn/loot flooding) ----
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  gate("PERF.fps", fps >= 55, `~${fps} fps (>=55; 2-core box = noise, gate is determinism/byte-id)`);

  // small helpers in page ctx
  const reset = () => page.evaluate(() => window.__metaReset());
  const legacy = () => page.evaluate(() => window.__metaLegacy());              // codex w/ owned counts
  const owned = (k) => page.evaluate((k) => (window.__metaLegacy().find(n => n.key === k) || {}).owned | 0, k);
  // max the whole altar so ascendMeta() is legal (buys all Tier-1 then Tier-2 to cap)
  const maxAltar = () => page.evaluate(() => {
    window.__dev.metaGrant(1e9);
    for (const n of window.__meta().nodes) for (let i = n.lvl; i < n.cap; i++) window.__metaBuy(n.key); // Tier-1
    for (const n of window.__meta().t2)    for (let i = n.lvl; i < n.cap; i++) window.__metaBuy(n.key); // Tier-2
    return window.__meta().canAscend;
  });

  // ======================= AC1: elección real =============================
  await reset();
  const choices0 = await page.evaluate(() => window.__legacyPool());
  gate("AC1.pool>=5", (choices0 || []).length >= 5, `legacyChoices=${(choices0||[]).map(c=>c.key).join(",")} (n=${choices0.length})`);
  const canAsc = await maxAltar();
  gate("AC1.canAscend", canAsc === true, `altar full-max -> canAscend=${canAsc}`);
  const asc1 = await page.evaluate(() => { const before = window.__meta().ascension.level; const ok = window.__metaAscend();
    return { ok, before, after: window.__meta().ascension.level }; });
  gate("AC1.ascend", asc1.ok === true && asc1.after === asc1.before + 1, `ascendMeta()=${asc1.ok} level ${asc1.before}->${asc1.after}`);
  const grant1 = await page.evaluate(() => { const b = (window.__metaLegacy().find(n=>n.key==="leg_avaro")||{}).owned|0;
    const ok = window.__legacyChoose("leg_avaro"); const a = (window.__metaLegacy().find(n=>n.key==="leg_avaro")||{}).owned|0;
    return { ok, b, a }; });
  gate("AC1.grant", grant1.ok === true && grant1.a === grant1.b + 1, `chooseLegacy(leg_avaro)=${grant1.ok} owned ${grant1.b}->${grant1.a}`);
  await page.screenshot({ path: `${OUT}/${label}-ac1-legacy-granted.png` });

  // ======================= AC2: persistencia + supervivencia ==============
  // serialize contains the chosen legacy + round-trips through loadMeta
  const ser = await page.evaluate(() => { const blob = window.__serMeta(); const legN = (blob.legacyNodes||[]).slice();
    // round-trip: reload the same blob and re-read owned
    window.__loadMeta(JSON.parse(JSON.stringify(blob)));
    return { legN, v: blob.v, ownedAfterLoad: (window.__metaLegacy().find(n=>n.key==="leg_avaro")||{}).owned|0 }; });
  gate("AC2.serialize", ser.legN.includes("leg_avaro") && ser.v === 2, `serializeMeta().legacyNodes=[${ser.legN}] v=${ser.v}`);
  gate("AC2.roundtrip", ser.ownedAfterLoad >= 1, `loadMeta(serializeMeta()) -> leg_avaro owned=${ser.ownedAfterLoad}`);
  // durable: the game's persist loop wrote the legacy into localStorage mithralda.meta.v1
  await page.evaluate(() => { if (window.__G) window.__G.metaDirty = true; }); await wait(400);
  const durable = await page.evaluate(() => { try { const b = JSON.parse(localStorage.getItem("mithralda.meta.v1")||"{}");
    return { has: Array.isArray(b.legacyNodes) && b.legacyNodes.includes("leg_avaro"), v: b.v, nodes: b.legacyNodes||null }; } catch(e){ return { has:false, err:String(e) }; } });
  gate("AC2.durable", durable.has === true && durable.v === 2, `localStorage mithralda.meta.v1 legacyNodes=[${durable.nodes}] v=${durable.v}`);
  // survive the sacrifice + accumulate across a 2nd ascension
  await maxAltar();
  const asc2 = await page.evaluate(() => {
    const beforeLeg = (window.__serMeta().legacyNodes||[]).slice();     // has leg_avaro from ascension #1
    const ok = window.__metaAscend();                                  // sacrifice #2 (wipes altar nodes, NOT legacies)
    const survived = (window.__serMeta().legacyNodes||[]).slice();      // leg_avaro must still be here
    window.__legacyChoose("leg_cazador");                              // pick a 2nd legacy
    const acc = (window.__serMeta().legacyNodes||[]).slice();
    return { ok, level: window.__meta().ascension.level, beforeLeg, survived, acc };
  });
  gate("AC2.survive", asc2.survived.includes("leg_avaro"), `ascendMeta() kept legacyNodes=[${asc2.survived}] (leg_avaro survived the sacrifice)`);
  gate("AC2.accumulate", asc2.acc.includes("leg_avaro") && asc2.acc.includes("leg_cazador") && asc2.level === 2,
    `after 2 ascensions legacyNodes=[${asc2.acc}] ascLevel=${asc2.level}`);

  // ======================= AC3: los 5 efectos reales ======================
  // (grant each via __legacyChoose from a clean meta so no ascension noise; each hook gated on legacyCount>0)
  // -- Vigía: t2 unlocked with v1 without maxing Tier-1 --
  const vigia = await page.evaluate(() => { window.__metaReset(); const off = window.__meta().t2Unlocked;
    const ok = window.__legacyChoose("leg_vigia"); const on = window.__meta().t2Unlocked; return { ok, off, on }; });
  gate("AC3.vigia", vigia.off === false && vigia.on === true, `t2Unlocked ${vigia.off}->${vigia.on} via leg_vigia (grant=${vigia.ok})`);
  // -- Avaro: +1 reroll/run at run-start --
  const avaro = await page.evaluate(() => {
    window.__metaReset(); window.__createHero("QA", "warrior"); const base = window.__dev.draftCharges().rerollLeft | 0;
    window.__metaReset(); window.__legacyChoose("leg_avaro"); window.__createHero("QA", "warrior"); const withL = window.__dev.draftCharges().rerollLeft | 0;
    return { base, withL };
  });
  gate("AC3.avaro", avaro.withL === avaro.base + 1, `rerollLeft base=${avaro.base} +leg_avaro=${avaro.withL} (+1)`);
  // -- Superviviente: +1 hp + +1 mana potion at newHero --
  const surv = await page.evaluate(() => {
    window.__metaReset(); window.__createHero("QA", "warrior"); const b = window.__dev.consumState().consum;
    window.__metaReset(); window.__legacyChoose("leg_superviviente"); window.__createHero("QA", "warrior"); const a = window.__dev.consumState().consum;
    return { bg: b.greater|0, bm: b.mana|0, ag: a.greater|0, am: a.mana|0 };
  });
  gate("AC3.superviviente", surv.ag === surv.bg + 1 && surv.am === surv.bm + 1,
    `greater ${surv.bg}->${surv.ag}  mana ${surv.bm}->${surv.am} (+1 each) via leg_superviviente`);
  // -- Cazador: +10% vs elite, 0% vs normal (same reseed isolates the crit roll) --
  const caz = await page.evaluate(() => {
    window.__metaReset(); window.__createHero("QA", "warrior");
    window.__dev.seed(777); const e0 = window.__dev.dmgVsTarget(true);
    window.__dev.seed(777); const n0 = window.__dev.dmgVsTarget(false);
    window.__metaReset(); window.__legacyChoose("leg_cazador"); window.__createHero("QA", "warrior");
    window.__dev.seed(777); const e1 = window.__dev.dmgVsTarget(true);
    window.__dev.seed(777); const n1 = window.__dev.dmgVsTarget(false);
    return { e0, n0, e1, n1 };
  });
  const eliteRatio = caz.e1 / caz.e0;
  gate("AC3.cazador.elite", Math.abs(eliteRatio - 1.10) < 0.02, `elite dmg ${caz.e0}->${caz.e1} (x${eliteRatio.toFixed(3)}, expect x1.10)`);
  gate("AC3.cazador.normal", caz.n1 === caz.n0, `normal dmg ${caz.n0}->${caz.n1} (unchanged, +0% to normals)`);
  // -- Erudito: +50% Esencia payout (ascension level 0 -> ascMult 1 isolates the +0.5) --
  const eru = await page.evaluate(() => {
    window.__metaReset(); window.__createHero("QA", "warrior"); const es0 = window.__dev.championKill("caves").essence | 0;
    window.__metaReset(); window.__legacyChoose("leg_erudito"); window.__createHero("QA", "warrior"); const es1 = window.__dev.championKill("caves").essence | 0;
    return { es0, es1 };
  });
  const eruRatio = eru.es1 / eru.es0;
  gate("AC3.erudito", Math.abs(eruRatio - 1.50) < 0.03, `Esencia payout ${eru.es0}->${eru.es1} (x${eruRatio.toFixed(3)}, expect x1.50 pre-ascMult)`);

  // ======================= AC4: migración =================================
  const mig = await page.evaluate(() => {
    // v1 blob (no legacyNodes) -> []
    window.__loadMeta({ v: 1, essence: 7, nodes: { hp: 1 }, ascension: { level: 1 } });
    const s1 = window.__serMeta();
    // v2 blob without the key + an UNKNOWN legacy key -> filtered to []
    window.__loadMeta({ v: 2, essence: 3, nodes: {}, legacyNodes: ["not_a_real_node"], ascension: { level: 0 } });
    const s2 = window.__serMeta();
    return { v1Leg: s1.legacyNodes||null, v1V: s1.v, v2Leg: s2.legacyNodes||null, v2V: s2.v };
  });
  gate("AC4.v1migrate", Array.isArray(mig.v1Leg) && mig.v1Leg.length === 0 && mig.v1V === 2,
    `v1 blob -> legacyNodes=[${mig.v1Leg}] v=${mig.v1V}`);
  gate("AC4.filterUnknown", Array.isArray(mig.v2Leg) && mig.v2Leg.length === 0 && mig.v2V === 2,
    `v2 blob w/ unknown key -> legacyNodes=[${mig.v2Leg}] v=${mig.v2V} (unknown filtered)`);

  // ======================= AC5: ascMult lineal intacto ====================
  const asm = await page.evaluate(() => {
    const out = [];
    for (let lvl = 0; lvl <= 3; lvl++) { window.__loadMeta({ v: 2, essence: 0, nodes: {}, ascension: { level: lvl } });
      out.push(window.__meta().ascension.mult); }
    // legacies sit ON TOP: granting one must NOT change ascMult
    window.__loadMeta({ v: 2, essence: 0, nodes: {}, ascension: { level: 2 } }); const before = window.__meta().ascension.mult;
    window.__legacyChoose("leg_erudito"); const after = window.__meta().ascension.mult;
    return { out, before, after };
  });
  const linear = asm.out.every((m, i) => Math.abs(m - (1 + 0.25 * i)) < 1e-9);
  gate("AC5.linear", linear, `ascMult L0..3 = [${asm.out.join(", ")}] (expect 1,1.25,1.5,1.75)`);
  gate("AC5.onTop", asm.before === asm.after, `granting leg_erudito left ascMult ${asm.before} unchanged (legados van encima)`);

  // ======================= AC6: [AC-RNG-STRONG] byte-id loot stream =======
  // 0 legados vs 5 legados: the shared-srand dropStream must be byte-identical; choosing consumes no RNG.
  const rng = await page.evaluate(() => {
    window.__metaReset();
    const s0 = JSON.stringify(window.__dev.dropStream(600, 424242));      // clean, 0 legacies
    // grant ALL 5 legacies (no RNG consumed by the grants)
    for (const k of ["leg_vigia","leg_avaro","leg_superviviente","leg_cazador","leg_erudito"]) window.__legacyChoose(k);
    const sN = JSON.stringify(window.__dev.dropStream(600, 424242));      // same seed, 5 legacies
    const owned = window.__metaLegacy().reduce((a, n) => a + (n.owned|0), 0);
    return { same: s0 === sN, len: s0.length, owned };
  });
  gate("AC6.rngStrong", rng.same === true, `[AC-RNG-STRONG] dropStream(600,424242) 0 vs 5 legacies byte-identical=${rng.same} (streamLen=${rng.len}, owned=${rng.owned})`);
  await page.screenshot({ path: `${OUT}/${label}-final.png` });

  // ---- errors ----
  gate("PERF.errors", errs.length === 0, errs.length ? `errs: ${errs.slice(0,3).join(" | ")}` : "0 JS errors (favicon 404 ignored)");

  await browser.close();
  console.log(`  --- ${label}: ${pass} PASS / ${fail} FAIL ---`);
  return { pass, fail };
}

(async () => {
  const runs = [
    ["desktop", { width: 1280, height: 720, deviceScaleFactor: 1 }],
    ["mobile",  { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ];
  let totalPass = 0, totalFail = 0;
  for (const [label, vp] of runs) { const r = await runOnce(label, vp); totalPass += r.pass; totalFail += r.fail; }
  console.log(`\n=== CAS-1650 LIVE QA TOTAL: ${totalPass} PASS / ${totalFail} FAIL (x2 desktop+mobile) ===`);
  process.exit(totalFail === 0 ? 0 : 1);
})();
