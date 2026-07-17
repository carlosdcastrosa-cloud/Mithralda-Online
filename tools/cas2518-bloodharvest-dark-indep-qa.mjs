// CAS-2518 — DARK QA Gate 2/2 INDEPENDENT self-verify for SIEGA DE HERIDOS (DARK, BLOODHARVEST_SURGE.enabled:false), EVO#86 @ a12fe0f.
// TWIN board-level of the GE harness (tools/cas2516-bloodharvest-selfverify.mjs): this harness is QA-OWNED and re-derives ALL oracles
// (weights, radius, thresholds, LUT, bloodWeight) in PURE JS — it does NOT import or reuse the GE's expected tables. It observes the
// REAL served __dev.bloodHarvest hook (server-auth state) and asserts against MY OWN independently re-derived expectations ⇒ genuine
// corroboration, mirror of CAS-2511/CAS-2506/CAS-2501 DARK indep harnesses.
//
// AXIS = DENSITY OF LIVE ALREADY-BLOODIED MOBS (low health fraction e.hp/e.maxHp) within radius (server-auth). CHANNEL = FRESH bloodFind
// (siega-charge forage reward for finishing INSIDE a field of wounded/execution-fodder mobs). ⊥ 27 LIVE flags #59-#85. Byte-neutral OFF.
//
// Run: node tools/cas2518-bloodharvest-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

// ---- INDEPENDENTLY RE-DERIVED ORACLES (pure JS, from the mechanic spec — NOT read from the build) ----
const R = 260, R2 = R * R;                 // vecindad radius
const BLOODIED = 0.40, CRIT = 0.15;        // wound / execution health-fraction thresholds
const W_CRIT = 2, W_WOUND = 1;             // weights
const CAP = 2;                             // sub-cap bloodChargeCap
// re-derived bloodWeight from a health fraction of a LIVE mob
function myWeight(frac){ if(frac == null || frac <= 0) return 0; if(frac <= CRIT) return W_CRIT; if(frac <= BLOODIED) return W_WOUND; return 0; }
// re-derived tier LUT: min2→T1, min4→T2 (highest satisfied)
function myTier(score){ let t = 0; if(score >= 2) t = 1; if(score >= 4) t = 2; return t; }
// re-derived charge: tier charge {T1:1,T2:2} capped by CAP
function myCharge(score){ const t = myTier(score); if(t <= 0) return 0; const raw = t === 2 ? 2 : 1; return Math.min(CAP, raw); }

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2518-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
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

  // 1 boot + hooks present, 0 err
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.blightHarvest && window.__dev.affixDanger && window.__dev.variantSurge && window.__dev.enrageSurge && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.bloodHarvest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF on fresh boot: enabled false, gExists false, all readouts 0, tag ""
  const dark = await page.evaluate(() => window.__dev.bloodHarvest());
  ok("2 byte-neutral OFF fresh boot: enabled=false, gExists=false (G.bloodCharges never created), score/tier/charge/preview=0, channel=bloodFind, tag=\"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "bloodFind" && dark.tag === "",
     JSON.stringify({ enabled: dark.enabled, gExists: dark.gExists, tier: dark.tier, score: dark.score, charge: dark.charge, preview: dark.forageChargePreview, tag: dark.tag }));

  // 3 STATELESS: saveBlob has NO bloodFind/bloodCharges key + worldFingerprint toggle-neutral
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noKey = !/"bloodCharges"\s*:/.test(saveOff) && !/"bloodFind"\s*:/.test(saveOff);
  const fpTog = await page.evaluate(() => {
    const a = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bloodHarvest({ enabled: true }); const b = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bloodHarvest({ enabled: false }); return a === b;
  });
  ok("3 STATELESS: saveBlob has no bloodCharges/bloodFind key + worldFingerprint byte-stable across enable toggle (cargas transitorias, fuera del save+fp)",
     noKey && fpTog, `noKey=${noKey} fpToggleStable=${fpTog} saveLen=${saveOff.length}`);

  // 4 LUT: served scoreProbe == MY re-derived myTier/myCharge for score 0..12
  const lutServed = await page.evaluate(() => { const o = {}; for (let s = 0; s <= 12; s++) { const p = window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe; o[s] = { tier: p.tier, charge: p.charge }; } return o; });
  let lutOK = true, lutDiff = [];
  for (let s = 0; s <= 12; s++) { const exp = { tier: myTier(s), charge: myCharge(s) }; const got = lutServed[s]; if (got.tier !== exp.tier || got.charge !== exp.charge) { lutOK = false; lutDiff.push(`s${s}:got${JSON.stringify(got)}!=exp${JSON.stringify(exp)}`); } }
  ok("4 LUT served scoreProbe == MY re-derived (JS) tier/charge for score 0..12 (min2→T1/1, min4→T2/2, cap2)", lutOK, lutDiff.join(" ") || "all 13 match");

  // 5 bloodWeight: served spawnWound.weight + woundProbe frac == MY re-derived myWeight(frac). crit(0.10)→2, wound(0.30)→1, healthy(1.0)→0.
  const wgt = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    const crit = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }).spawnWound;
    const wound = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "wound" } }).spawnWound;
    const healthy = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 5, ty: h.ty, kind: "none" } }).spawnWound;
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { crit, wound, healthy };
  });
  const wgtOK = wgt.crit.weight === myWeight(wgt.crit.frac) && wgt.crit.weight === 2 &&
    wgt.wound.weight === myWeight(wgt.wound.frac) && wgt.wound.weight === 1 &&
    wgt.healthy.weight === myWeight(wgt.healthy.frac) && wgt.healthy.weight === 0;
  ok("5 bloodWeight: served spawnWound.weight == MY re-derived myWeight(frac). crit(frac≤0.15)→2, wound(≤0.40)→1, healthy(>0.40)→0",
     wgtOK, JSON.stringify(wgt));

  // 6 REAL SERVER-AUTH: spawnWound pushes into G.enemies; woundProbe score == MY Σ myWeight over the returned real mobs.
  const auth = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });   // w2
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "wound" } });  // w1
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const sp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const vm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { sp, vmScore: vm.score, vmTier: vm.tier, vmCharge: vm.charge };
  });
  const mySum = (auth.sp.mobs || []).reduce((a, m) => a + myWeight(m.frac), 0);
  const authOK = auth.sp.score === mySum && auth.sp.count >= 2 && auth.vmScore === auth.sp.score &&
    auth.vmTier === myTier(auth.sp.score) && auth.vmCharge === myCharge(auth.sp.score) && mySum >= 3;
  ok("6 REAL SERVER-AUTH: spawnWound→G.enemies; woundProbe.score == MY Σ myWeight(frac) over the real mobs; vm score/tier/charge match my re-derivation",
     authOK, `wp.score=${auth.sp.score} mySum=${mySum} count=${auth.sp.count} vm={s:${auth.vmScore},t:${auth.vmTier},c:${auth.vmCharge}}`);

  // 7 RADIUS 260: mob just INSIDE contributes, just OUTSIDE does not. Tile=32px; 8 tiles=256px<260 IN, 9 tiles=288px>260 OUT.
  const rad = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 8, ty: h.ty, kind: "crit" } });   // 256px IN
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const inScore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 9, ty: h.ty, kind: "crit" } });   // 288px OUT
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const outScore = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score;
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { inScore, outScore };
  });
  ok("7 RADIUS 260: crit mob @256px IN ⇒ score 2 (weight 2); @288px OUT ⇒ score 0 (my re-derived R=260)", rad.inScore === 2 && rad.outScore === 0, JSON.stringify(rad));

  // 8 THRESHOLD (score≥2): 1 lone wound (score1)→T0/charge0 (NO forage); 2 wounds (score2)→T1/charge1; 2 crit (score4)→T2/charge2. Via REAL spawns.
  const thr = await page.evaluate(() => {
    const run = (kinds) => {
      window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
      const h = window.__dev.bloodHarvest().hero;
      kinds.forEach((k, i) => window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3 + i, ty: h.ty, kind: k } }));
      window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
      const vm = window.__dev.bloodHarvest();
      const r = { score: vm.score, tier: vm.tier, charge: vm.charge, preview: vm.forageChargePreview };
      window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
      return r;
    };
    return { lone: run(["wound"]), two: run(["wound", "wound"]), field: run(["crit", "crit"]) };
  });
  const thrOK = thr.lone.score === 1 && thr.lone.tier === 0 && thr.lone.charge === 0 && thr.lone.preview === 0 &&
    thr.two.score === 2 && thr.two.tier === myTier(2) && thr.two.charge === myCharge(2) &&
    thr.field.score === 4 && thr.field.tier === myTier(4) && thr.field.charge === myCharge(4);
  ok("8 THRESHOLD score≥2: lone wound (s1)→T0/0/preview0 (no forage); 2 wounds (s2)→T1/1; 2 crit (s4)→T2/2 (matches my re-derived LUT)",
     thrOK, JSON.stringify(thr));

  // 9 DIFFERENTIATOR ⊥27: plain wounded orcs raise siega while affix/variant/enrage/blight/skirmish/control probes IGNORE; healthy mob peso 0. Remote fresh tile.
  const diff = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h0 = window.__dev.bloodHarvest().hero; const RX = h0.tx - 120, RY = h0.ty;
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const base = window.__dev.bloodHarvest().score;
    const pb = {
      aff: window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score,
      var: window.__dev.variantSurge({ variantProbe: true }).variantProbe.score,
      enr: window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score,
      bli: window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score,
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
    };
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 3, ty: RY, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 4, ty: RY, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ spawnWound: { tx: RX + 5, ty: RY, kind: "none" } });  // healthy
    window.__dev.bloodHarvest({ tp: { tx: RX, ty: RY } });
    const healthyScore = window.__dev.bloodHarvest().score;
    const pa = {
      aff: window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score,
      var: window.__dev.variantSurge({ variantProbe: true }).variantProbe.score,
      enr: window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score,
      bli: window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score,
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
    };
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { base, score: vm.score, tier: vm.tier, charge: vm.charge, healthyScore, pb, pa };
  });
  const peersIgnore = diff.pa.aff === diff.pb.aff && diff.pa.var === diff.pb.var && diff.pa.enr === diff.pb.enr && diff.pa.bli === diff.pb.bli && diff.pa.ski === diff.pb.ski && diff.pa.ctr === diff.pb.ctr;
  const diffOK = diff.score > diff.base && diff.tier >= 2 && diff.charge >= 1 && diff.healthyScore === diff.score && peersIgnore;
  ok("9 DIFFERENTIATOR ⊥27: plain wounded orcs ⇒ siega T2 while affix/variant/enrage/blight/skirmish/control probes UNCHANGED + healthy mob adds 0 (peso 0)",
     diffOK, JSON.stringify(diff));

  // 10 SUB-CAP: no score yields charge > CAP(=2), and served cap==2.
  const cap = await page.evaluate(() => { const v = []; for (let s = 0; s <= 20; s++) v.push(window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe.charge); return { max: Math.max(...v), cap: window.__dev.bloodHarvest().cap }; });
  ok("10 SUB-CAP: no score yields charge>2; served cap==2 (matches my CAP)", cap.max <= 2 && cap.max <= CAP && cap.cap === 2, JSON.stringify(cap));

  // 11 BYTE-NEUTRAL OFF: with OFF, forage/charge 0 even with crit mob glued on hero tile.
  const neutral = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.bloodHarvest({ enabled: false });
    const off = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, tag: off.tag };
  });
  ok("11 BYTE-NEUTRAL OFF: crit mob glued on hero, OFF ⇒ forageChargePreview/charge/tier/score=0 + tag=\"\" ⇒ 0 to seam (byte-id HEAD)",
     neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.tag === "", JSON.stringify(neutral));

  // 12 0-REGRESSION: 27 arc flags #59-#85 served enabled:true; BLOODHARVEST_SURGE served false. Re-fetch SERVED config.js.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE"];
  const off = arc.filter(f => flag(f) !== "true");
  const bhDark = flag("BLOODHARVEST_SURGE") === "false";
  ok("12 0-REGRESSION: 27 arc flags #59-#85 served enabled:true; BLOODHARVEST_SURGE served false (DARK #86)",
     off.length === 0 && bhDark && arc.length === 27, `bloodHarvest=${flag("BLOODHARVEST_SURGE")} arcLen=${arc.length} offenders=${JSON.stringify(off)}`);

  // 13 render badge "Siega:" drawn ON+field near, not OFF + fps sane.
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Siega:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("13 render badge \"Siega:\" drawn ON+field near (count>0), NOT OFF (count 0), fps≥30",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, JSON.stringify(badge));

  // screenshot evidence
  await page.evaluate(() => { window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true }); const h = window.__dev.bloodHarvest().hero; window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }); window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 4, ty: h.ty, kind: "wound" } }); window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false }); });

  // 14 NORTH STAR — 2-client convergence: SAME wounded mobs + hero same tile ⇒ score/tier/charge + woundProbe + LUT + worldFingerprint identical byte-a-byte.
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const MOB_A = { tx: 60, ty: 40, kind: "crit" }, MOB_B = { tx: 61, ty: 40, kind: "wound" }, HERO_TILE = { tx: 63, ty: 40 };
  const readVM = async (pg) => await pg.evaluate((MA, MB, HT) => {
    window.__dev.bloodHarvest({ enabled: true }); window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ spawnWound: { tx: MA.tx, ty: MA.ty, kind: MA.kind } });
    window.__dev.bloodHarvest({ spawnWound: { tx: MB.tx, ty: MB.ty, kind: MB.kind } });
    window.__dev.bloodHarvest({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.bloodHarvest();
    const lut = [0, 2, 4, 9].map(s => { const p = window.__dev.bloodHarvest({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; });
    const sp = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bloodHarvest({ clearWound: true }); window.__dev.bloodHarvest({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count, lut, fp };
  }, MOB_A, MOB_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // independent expectation: A crit(w2)+B wound(w1) = score3 ⇒ T1/charge1
  const expScore = myWeight(0.10) + myWeight(0.30);
  const meMatch = A.score === expScore && A.tier === myTier(expScore) && A.charge === myCharge(expScore);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("14 NORTH STAR 2-CLIENT: SAME wounded mobs+hero ⇒ A==B for score/tier/charge + woundProbe + LUT + worldFingerprint (0 desync) AND == my re-derived expectation (score3→T1/1)",
     conv && meMatch, `A={s:${A.score},t:${A.tier},c:${A.charge},sp:${A.spScore}/${A.spCount},fpLen:${A.fp.length}} B={s:${B.score},t:${B.tier},c:${B.charge},sp:${B.spScore}/${B.spCount}} exp=${expScore} fpMatch=${A.fp === B.fp} meMatch=${meMatch}`);

  // 0 no JS errors
  ok("0 no JS errors during run (both clients)", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
