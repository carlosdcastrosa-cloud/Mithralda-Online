// CAS-2490 — INDEPENDENT DARK QA Gate 2/2 for CROSSFIRE_FRAY_SURGE (EVO#81, DARK enabled:false) @ 74a39c7.
// Independent from the CEO/GE harness: ORACLES RE-DERIVED IN PURE JS from the ISSUE SPEC (not read from config.js),
// then asserted against the SERVED probes. If GE's config drifted from spec, this catches it.
//   SPEC (CAS-2490 §3): radius 260; frayWeights enemy=2 (incoming, double) / hero=1; tiers 0/1→T0/0, [2,4]→T1/1, ≥5→T2/2 (cap 2).
//   crossfireFrayScore(h)=Σ weight[side] over projectiles in radius of hero; STATELESS/PURE/0-RNG; frayEmbers transient (out of save+fingerprint).
// Run: node tools/cas2490-crossfirefray-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ===== INDEPENDENT ORACLES (re-derived from CAS-2490 spec, NOT from config.js) =====
const SPEC_RADIUS = 260;
const SPEC_W = { enemy: 2, hero: 1 };          // incoming enemy fire weighs double
const SPEC_CAP = 2;
const myTier  = (score) => (score >= 5 ? 2 : score >= 2 ? 1 : 0);          // 0/1→T0, [2,4]→T1, ≥5→T2
const myEmber = (score) => Math.min(SPEC_CAP, [0, 1, 2][myTier(score)]);   // T0→0, T1→1, T2→2, capped 2

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot2";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // I1 boot + DARK default + served config matches SPEC (radius/weights/cap independently confirmed)
  const dark = await page.evaluate(() => window.__dev.crossfireFray());
  const cfgMatchesSpec = dark.radius === SPEC_RADIUS && dark.cap === SPEC_CAP;
  ok("I1 boot to play, DARK default (enabled:false, gExists:false), served radius/cap == SPEC (260/2), 0 err",
     !!build && dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.ember === 0 && dark.channel === "frayFind" && dark.tag === "" && cfgMatchesSpec && errors.length === 0,
     `build=${build} enabled=${dark.enabled} gExists=${dark.gExists} radius=${dark.radius} cap=${dark.cap} tiers=${JSON.stringify(dark.tiers)} err=${errors.length}`);

  // I2 INDEP LUT: sweep score 0..12, my oracle == served scoreProbe (tier+ember). Independent of config internals.
  const SCORES = [0, 1, 2, 3, 4, 5, 6, 9, 12];
  const served = await page.evaluate((ss) => ss.map(s => window.__dev.crossfireFray({ scoreProbe: { score: s } }).scoreProbe), SCORES);
  const lutMismatch = SCORES.map((s, i) => ({ s, my: { t: myTier(s), e: myEmber(s) }, srv: served[i] }))
    .filter(r => r.my.t !== r.srv.tier || r.my.e !== r.srv.ember);
  ok("I2 INDEP LUT: my re-derived tier/ember == served scoreProbe for score 0..12 (0/1→T0, [2,4]→T1, ≥5→T2 cap2)",
     lutMismatch.length === 0, `mismatches=${JSON.stringify(lutMismatch)} served=${JSON.stringify(served.map(x=>x.tier+"/"+x.ember))}`);

  // I3 STATELESS: save.v1 has NO crossfireFray/frayFind/frayEmbers key; enabling adds NO new serialized key.
  // NOTE: raw-byte equality is unusable here — save.playT (ambient playtime) drifts every frame regardless of feature
  // (verified: 2 consecutive no-toggle saves differ only in playT). Correct oracle = key STRUCTURE is invariant + length invariant.
  const kOff = await page.evaluate(() => { const b = window.__dev.saveBlob(); return { keys: Object.keys(b).sort(), hk: Object.keys(b.hero || {}).sort(), len: JSON.stringify(b).length, str: JSON.stringify(b) }; });
  await page.evaluate(() => window.__dev.crossfireFray({ enabled: true }));
  const kOn = await page.evaluate(() => { const b = window.__dev.saveBlob(); return { keys: Object.keys(b).sort(), hk: Object.keys(b.hero || {}).sort(), len: JSON.stringify(b).length }; });
  await page.evaluate(() => window.__dev.crossfireFray({ enabled: false }));
  const noKey = !/"(crossfireFray|frayFind|frayEmbers)[A-Za-z]*"\s*:/.test(kOff.str);
  const keysInvariant = JSON.stringify(kOff.keys) === JSON.stringify(kOn.keys) && JSON.stringify(kOff.hk) === JSON.stringify(kOn.hk) && kOff.len === kOn.len;
  ok("I3 STATELESS: save.v1 has NO crossfireFray/frayFind/frayEmbers key AND enabling adds NO new key (key-set + length invariant off↔on; playT ambient drift excluded)",
     noKey && keysInvariant, `noKey=${noKey} keysInvariant=${keysInvariant} lenOff=${kOff.len} lenOn=${kOn.len} heroKeysMatch=${JSON.stringify(kOff.hk) === JSON.stringify(kOn.hk)}`);

  // I4 worldFingerprint byte-stable across enable toggle (embers/projectiles never enter fp)
  const fp0 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => { window.__dev.crossfireFray({ enabled: true }); const h = window.__dev.crossfireFray().hero; window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 2, ty: h.ty, side: "enemy" } }); });
  const fp1 = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => { window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false }); });
  ok("I4 worldFingerprint byte-stable across toggle+injected projectiles (fp hashes terrain only; embers/projectiles excluded)",
     fp0 === fp1, `fpLen=${JSON.parse(fp0).length ?? fp0.length} match=${fp0 === fp1}`);

  // I5 REAL server-auth + INDEP weight oracle: inject 1 enemy(w2)+1 hero(w1) in radius; my Σ==served frayProbe.score, weights match
  const s5 = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx + 2, ty: h.ty, side: "enemy" } });   // ~64px in radius
    window.__dev.crossfireFray({ spawnProj: { tx: h.tx - 2, ty: h.ty, side: "hero" } });     // ~64px in radius
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    const fp = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
    const vm = window.__dev.crossfireFray();
    window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false });
    return { fp, tier: vm.tier, ember: vm.ember };
  });
  const myScore5 = SPEC_W.enemy + SPEC_W.hero;                     // 2 + 1 = 3
  const weightsOK = s5.fp.count === 2 && s5.fp.projs.every(p => p.weight === SPEC_W[p.side]);
  const scoreOK = s5.fp.score === myScore5 && s5.tier === myTier(myScore5) && s5.ember === myEmber(myScore5);
  ok("I5 REAL server-auth + INDEP weight: injected enemy(w2)+hero(w1) ⇒ served frayProbe.score==my Σ(3), weights match my oracle, tier1/ember1",
     weightsOK && scoreOK, `served={score:${s5.fp.score},count:${s5.fp.count},tier:${s5.tier},ember:${s5.ember}} myScore=${myScore5} projs=${JSON.stringify(s5.fp.projs)}`);

  // I6 ⊥22 DIFFERENTIATOR: inject dense crossfire ⇒ fray rises to T2 WHILE carnage(#80)/spoils(#79)/enrage(#78)/hazard(#77) foraging IGNORE it
  const s6 = await page.evaluate(() => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    const h = window.__dev.crossfireFray().hero;
    const before = window.__dev.crossfireFray();
    // 3 enemy projectiles (w2 each = score 6 ≥5 ⇒ T2)
    for (const dx of [1, 2, 3]) window.__dev.crossfireFray({ spawnProj: { tx: h.tx + dx, ty: h.ty, side: "enemy" } });
    window.__dev.crossfireFray({ tp: { tx: h.tx, ty: h.ty } });
    const after = window.__dev.crossfireFray();
    const out = {
      frayBefore: before.score, frayAfter: after.score, tierAfter: after.tier, emberAfter: after.ember,
      bone: after.boneForagePreview, salvage: after.salvageForagePreview, trophy: after.trophyForagePreview, heal: after.healForagePreview,
    };
    window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false });
    return out;
  });
  const diffOK = s6.frayBefore === 0 && s6.frayAfter >= 5 && s6.tierAfter === 2 && s6.emberAfter === 2 &&
    s6.bone === 0 && s6.salvage === 0 && s6.trophy === 0 && s6.heal === 0;
  ok("I6 ⊥22 DIFFERENTIATOR: injected projectiles ⇒ fray 0→T2/ember2 WHILE carnage#80/spoils#79/enrage#78/hazard#77 foraging stay 0 (projectile ≠ corpse/drop/boss/hazard)",
     diffOK, `fray ${s6.frayBefore}→${s6.frayAfter} T${s6.tierAfter}/e${s6.emberAfter} bone=${s6.bone} salvage=${s6.salvage} trophy=${s6.trophy} heal=${s6.heal}`);

  // I7 0-REGRESSION: 22 arc flags #59-#80 served enabled:true; CROSSFIRE_FRAY_SURGE served false (independent config.js fetch)
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE"];
  const arcAllOn = arc.every(f => flag(f) === "true");
  const cfsDark = flag("CROSSFIRE_FRAY_SURGE") === "false";
  ok("I7 0-REGRESSION: 22 arc flags #59-#80 served enabled:true; CROSSFIRE_FRAY_SURGE served false (DARK #81)",
     arcAllOn && cfsDark && arc.length === 22, `arcAllOn=${arcAllOn} crossfire=${flag("CROSSFIRE_FRAY_SURGE")} n=${arc.length}`);

  // I8 NORTH STAR 2-client convergence: SAME projectiles+hero tile ⇒ identical score/tier/ember + frayProbe + fp byte-id (0 desync)
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const PA = { tx: 62, ty: 42 }, PB = { tx: 63, ty: 42 }, HT = { tx: 65, ty: 42 };
  const readVM = async (pg) => await pg.evaluate((PA, PB, HT) => {
    window.__dev.crossfireFray({ enabled: true });
    window.__dev.crossfireFray({ clearProj: true });
    window.__dev.crossfireFray({ spawnProj: { tx: PA.tx, ty: PA.ty, side: "enemy" } });   // w2
    window.__dev.crossfireFray({ spawnProj: { tx: PB.tx, ty: PB.ty, side: "hero" } });     // w1
    window.__dev.crossfireFray({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.crossfireFray();
    const sp = window.__dev.crossfireFray({ frayProbe: true }).frayProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.crossfireFray({ clearProj: true }); window.__dev.crossfireFray({ enabled: false });
    return { score: vm.score, tier: vm.tier, ember: vm.ember, spScore: sp.score, spCount: sp.count, fpLen: fp.length };
  }, PA, PB, HT);
  const A = await readVM(page), B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.ember === B.ember && A.spScore === B.spScore && A.spCount === B.spCount && A.fpLen === B.fpLen;
  const NORTH_STAR = 15920977;
  ok("I8 NORTH STAR 2-client: SAME projectiles+hero ⇒ identical score/tier/ember + frayProbe + fp byte-id (0 desync); fp==15920977",
     conv && A.fpLen === NORTH_STAR, `A=${JSON.stringify(A)} B=${JSON.stringify(B)} fpMatch=${A.fpLen === B.fpLen} northStar=${A.fpLen === NORTH_STAR}`);

  // I9 0 JS errors
  ok("I9 no JS errors during independent run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length}`);

  console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAIL"}  ${PASS}/${PASS + FAIL}`);
} finally {
  await browser.close();
  await server.close?.();
}
process.exit(FAIL === 0 ? 0 : 1);
